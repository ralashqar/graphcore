import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../../domain/assets.ts'
import type { AssetDefinition, WorldEntity } from '../../../domain/graphcore.ts'
import type {
  OutputArtifact,
  OutputRequest,
  OutputRequestKind,
  OutputWorkflowNode,
  OutputWorkflowRun,
  OutputWorkflowRunStep,
} from '../../../domain/outputWorkflow.ts'
import { iconForWorldEntity } from '../../../domain/worldGraphHelpers.ts'
import type { EntityIconId } from '../../../shared/entityIcons'

export type OutputLibraryGroupKey = 'generating' | 'needs_attention' | 'ready' | 'drafts'
export type OutputArtifactFilter = 'all' | 'images' | 'documents' | 'video' | 'other'
export type OutputLibraryOpenTarget = 'details' | 'graph' | 'timeline'

export type OutputLibraryEntityRef = {
  key: string
  label: string
  role: string
  icon: EntityIconId
  imageUrl: string | null
}

export type OutputLibraryArtifactCard = {
  id: string
  key: string
  name: string
  kind: OutputArtifact['kind']
  mimeType: string
  createdAt: string
  assetKey: string | null
  url: string | null
  thumbnailUrl: string | null
  requestId: string | null
  requestTitle: string | null
  promptExcerpt: string
  status: string
  type: Exclude<OutputArtifactFilter, 'all'>
  openLabel: string
  downloadLabel: string
  extension: string
}

export type OutputLibraryRequestRow = {
  id: string
  title: string
  promptExcerpt: string
  outputKind: OutputRequestKind
  outputKindLabel: string
  status: OutputRequest['status']
  statusLabel: string
  groupKey: OutputLibraryGroupKey
  workflowId: string | null
  latestRunId: string | null
  entityRefs: OutputLibraryEntityRef[]
  canOpenGraph: boolean
  canOpenTimeline: boolean
  primaryArtifact: OutputLibraryArtifactCard | null
  artifacts: OutputLibraryArtifactCard[]
  progress: {
    completed: number
    total: number
    percent: number
    label: string
  }
  currentStepLabel: string
  canCancel: boolean
  canRemove: boolean
}

export type OutputLibraryModel = {
  rows: OutputLibraryRequestRow[]
  groups: Array<{
    key: OutputLibraryGroupKey
    label: string
    rows: OutputLibraryRequestRow[]
  }>
  artifacts: OutputLibraryArtifactCard[]
  counts: {
    generating: number
    needsAttention: number
    ready: number
    artifacts: number
  }
}

type BuildOutputLibraryModelInput = {
  assets: readonly AssetDefinition[]
  outputArtifacts: readonly OutputArtifact[]
  outputRequests: readonly OutputRequest[]
  outputWorkflowNodes: readonly OutputWorkflowNode[]
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  worldEntities: readonly WorldEntity[]
}

const groupLabels: Record<OutputLibraryGroupKey, string> = {
  generating: 'Generating',
  needs_attention: 'Needs Attention',
  ready: 'Ready',
  drafts: 'Drafts / Cancelled',
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return readArray(value).map((entry) => readTrimmedString(entry)).filter(Boolean)
}

function normalizeEntityLookup(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function formatKind(value: string) {
  return value.replace(/_/g, ' ')
}

function excerpt(value: string, limit = 150) {
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length > limit ? `${clean.slice(0, limit - 1).trim()}...` : clean
}

function resolveArtifactUrlFromMetadata(metadata: Record<string, unknown>) {
  const sourceUrl = readTrimmedString(metadata.sourceUrl)
  if (isResolvableAssetUrl(sourceUrl)) return sourceUrl
  const previewUrl = readTrimmedString(metadata.previewUrl)
  return isResolvableAssetUrl(previewUrl) ? previewUrl : null
}

function artifactLabels(mimeType: string, kind: string) {
  if (mimeType === 'application/pdf' || kind === 'pdf' || kind === 'comic_pdf') {
    return { openLabel: 'Open PDF', downloadLabel: 'Download PDF', extension: 'pdf' }
  }
  if (mimeType.startsWith('video/') || kind === 'video') {
    return { openLabel: 'Open Video', downloadLabel: 'Download Video', extension: mimeType.includes('webm') ? 'webm' : 'mp4' }
  }
  if (mimeType.startsWith('image/') || kind === 'image') {
    const extension = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    return { openLabel: 'Open Image', downloadLabel: 'Download Image', extension }
  }
  if (mimeType.includes('html') || kind === 'html') {
    return { openLabel: 'Open HTML', downloadLabel: 'Download HTML', extension: 'html' }
  }
  if (mimeType.includes('markdown') || kind === 'manuscript') {
    return { openLabel: 'Open Markdown', downloadLabel: 'Download Markdown', extension: 'md' }
  }
  if (kind === 'docx') return { openLabel: 'Open DOCX', downloadLabel: 'Download DOCX', extension: 'docx' }
  if (kind === 'epub') return { openLabel: 'Open EPUB', downloadLabel: 'Download EPUB', extension: 'epub' }
  return { openLabel: 'Open File', downloadLabel: 'Download File', extension: 'download' }
}

function artifactType(artifact: OutputArtifact, mimeType: string): OutputLibraryArtifactCard['type'] {
  if (mimeType.startsWith('image/') || artifact.kind === 'image') return 'images'
  if (mimeType.startsWith('video/') || artifact.kind === 'video') return 'video'
  if (
    mimeType === 'application/pdf'
    || mimeType.includes('markdown')
    || mimeType.includes('html')
    || artifact.kind === 'pdf'
    || artifact.kind === 'comic_pdf'
    || artifact.kind === 'manuscript'
    || artifact.kind === 'html'
    || artifact.kind === 'epub'
    || artifact.kind === 'docx'
  ) return 'documents'
  return 'other'
}

function artifactCardPriority(artifact: OutputLibraryArtifactCard) {
  if (artifact.type === 'documents') return 0
  if (artifact.type === 'video') return 1
  if (artifact.type === 'images') return 2
  return 3
}

function statusGroup(request: OutputRequest, run: OutputWorkflowRun | null, artifacts: readonly OutputLibraryArtifactCard[]): OutputLibraryGroupKey {
  const status = run?.status ?? request.status
  if (status === 'failed' || status === 'completed_with_errors') return 'needs_attention'
  if (request.status === 'failed' || request.status === 'completed_with_errors') return 'needs_attention'
  if (status === 'running' || status === 'queued' || request.status === 'running' || request.status === 'planning') return 'generating'
  if (request.status === 'awaiting_confirmation' || status === 'cancelled' || request.status === 'cancelled') return 'drafts'
  if (artifacts.length > 0 || request.status === 'completed' || status === 'completed') return 'ready'
  return 'drafts'
}

function stepStatusKey(step: OutputWorkflowRunStep | null | undefined) {
  const status = String(step?.status ?? '')
  return status
}

function buildProgress(run: OutputWorkflowRun | null, nodeCount: number) {
  const steps = run?.steps ?? []
  const total = steps.length > 0 ? steps.length : nodeCount
  const completed = steps.filter((step) => {
    const status = stepStatusKey(step)
    return status === 'completed' || status === 'skipped'
  }).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const active = steps.find((step) => stepStatusKey(step) === 'running')
    ?? steps.find((step) => stepStatusKey(step) === 'failed')
    ?? steps.find((step) => stepStatusKey(step) === 'queued')
    ?? null
  return {
    progress: {
      completed,
      total,
      percent,
      label: total > 0 ? `${completed}/${total} steps` : 'Not planned',
    },
    currentStepLabel: active?.label || (run ? formatStatus(run.status) : 'Waiting for workflow'),
  }
}

function isCinematicOutputKind(kind: OutputRequestKind) {
  return kind.includes('cinematic') || kind === 'ugc_episode'
}

function collectRequestEntityCandidates(request: OutputRequest, run: OutputWorkflowRun | null) {
  const candidates: Array<{ value: string; role: string }> = []
  const push = (value: unknown, role = '') => {
    const text = readTrimmedString(value)
    if (text) candidates.push({ value: text, role })
  }
  const pushRecordIdentity = (value: unknown, role = '') => {
    const record = readRecord(value)
    push(record.refId, role)
    push(record.id, role)
    push(record.key, role)
    push(record.entityKey, role)
    push(record.entityRefId, role)
    push(record.label, role)
    push(record.name, role)
    push(record.sourceName, role)
  }
  const collectSceneState = (value: unknown) => {
    const record = readRecord(value)
    for (const key of readStringArray(record.characterRefIds)) push(key, 'character')
    push(record.locationRefId, 'location')
    for (const key of readStringArray(record.propRefIds)) push(key, 'prop')
  }
  const collectReferencePlan = (value: unknown) => {
    const record = readRecord(value)
    for (const groupKey of ['primaryCast', 'supportingCast', 'locations', 'props', 'concepts', 'continuityAnchors']) {
      for (const entry of readArray(record[groupKey])) pushRecordIdentity(entry, groupKey)
    }
  }
  const collectShotPlan = (value: unknown) => {
    const record = readRecord(value)
    collectReferencePlan(record.cinematicReferencePlan)
    for (const shot of readArray(record.shots)) {
      const shotRecord = readRecord(shot)
      for (const key of readStringArray(shotRecord.visibleCharacterRefIds)) push(key, 'visible')
      for (const key of readStringArray(shotRecord.speakerRefIds)) push(key, 'speaker')
      push(shotRecord.locationRefId, 'location')
      for (const key of readStringArray(shotRecord.propRefIds)) push(key, 'prop')
    }
  }
  const collectAssetPack = (value: unknown) => {
    const record = readRecord(value)
    for (const groupKey of ['entities', 'references', 'entityRefs', 'visualReferences', 'assets']) {
      for (const entry of readArray(record[groupKey])) pushRecordIdentity(entry, groupKey)
    }
  }

  for (const key of request.selectedEntityKeys) push(key, 'selected')
  for (const step of run?.steps ?? []) {
    const outputs = readRecord(step.outputs)
    collectSceneState(outputs)
    collectSceneState(outputs.sceneState)
    collectSceneState(outputs.cinematicV2SceneState)
    collectReferencePlan(outputs)
    collectReferencePlan(outputs.cinematicReferencePlan)
    collectShotPlan(outputs)
    collectShotPlan(outputs.shotPlan)
    collectShotPlan(outputs.cinematicV2ShotPlan)
    collectAssetPack(outputs)
    collectAssetPack(outputs.assetPack)
  }
  return candidates
}

function resolveWorldEntityReference(value: string, lookup: Map<string, WorldEntity>, worldEntities: readonly WorldEntity[]) {
  const normalized = normalizeEntityLookup(value)
  if (!normalized) return null
  const direct = lookup.get(normalized)
  if (direct) return direct
  return worldEntities.find((entity) => {
    if (entity.nodeType === 'sequence_unit') return false
    const key = normalizeEntityLookup(entity.key)
    const name = normalizeEntityLookup(entity.name || '')
    return Boolean(
      (key && (normalized.includes(key) || key.includes(normalized)))
      || (name && (normalized.includes(name) || name.includes(normalized)))
    )
  }) ?? null
}

function buildEntityRefsForRequest(
  request: OutputRequest,
  run: OutputWorkflowRun | null,
  worldEntities: readonly WorldEntity[],
  assetByKey: Map<string, AssetDefinition>,
): OutputLibraryEntityRef[] {
  const lookup = new Map<string, WorldEntity>()
  for (const entity of worldEntities) {
    lookup.set(normalizeEntityLookup(entity.key), entity)
    if (entity.name) lookup.set(normalizeEntityLookup(entity.name), entity)
  }

  const refs: OutputLibraryEntityRef[] = []
  const seen = new Set<string>()
  for (const candidate of collectRequestEntityCandidates(request, run)) {
    const entity = resolveWorldEntityReference(candidate.value, lookup, worldEntities)
    if (!entity || entity.nodeType === 'sequence_unit' || seen.has(entity.key)) continue
    seen.add(entity.key)
    const asset = entity.thumbnailAssetKey ? assetByKey.get(entity.thumbnailAssetKey) ?? null : null
    refs.push({
      key: entity.key,
      label: entity.name || entity.key,
      role: candidate.role,
      icon: iconForWorldEntity(entity.nodeType),
      imageUrl: resolveAssetSourceUrl(asset) || null,
    })
    if (refs.length >= 12) break
  }
  return refs
}

export function buildOutputLibraryModel(input: BuildOutputLibraryModelInput): OutputLibraryModel {
  const assetByKey = new Map(input.assets.map((asset) => [asset.key, asset]))
  const requestByWorkflowId = new Map(input.outputRequests.flatMap((request) => request.workflowId ? [[request.workflowId, request] as const] : []))
  const runById = new Map(input.outputWorkflowRuns.map((run) => [run.id, run]))
  const latestRunByWorkflowId = new Map<string, OutputWorkflowRun>()
  for (const run of input.outputWorkflowRuns.slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())) {
    if (!latestRunByWorkflowId.has(run.workflowId)) latestRunByWorkflowId.set(run.workflowId, run)
  }
  const nodeCountByWorkflowId = new Map<string, number>()
  for (const node of input.outputWorkflowNodes) {
    nodeCountByWorkflowId.set(node.workflowId, (nodeCountByWorkflowId.get(node.workflowId) ?? 0) + 1)
  }

  const artifactCards = input.outputArtifacts
    .map((artifact): OutputLibraryArtifactCard => {
      const asset = artifact.assetKey ? assetByKey.get(artifact.assetKey) ?? null : null
      const metadata = readRecord(artifact.metadata)
      const mimeType = artifact.mimeType || asset?.mimeType || ''
      const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(metadata)
      const request = artifact.runId
        ? input.outputRequests.find((entry) => entry.latestRunId === artifact.runId) ?? null
        : artifact.workflowId
          ? requestByWorkflowId.get(artifact.workflowId) ?? null
          : null
      const type = artifactType(artifact, mimeType)
      const labels = artifactLabels(mimeType, artifact.kind)
      return {
        id: artifact.id,
        key: artifact.key,
        name: artifact.name,
        kind: artifact.kind,
        mimeType,
        createdAt: artifact.createdAt,
        assetKey: artifact.assetKey,
        url,
        thumbnailUrl: type === 'images' || type === 'video' ? url : null,
        requestId: request?.id ?? null,
        requestTitle: request?.title ?? null,
        promptExcerpt: request ? excerpt(request.prompt, 96) : '',
        status: 'ready',
        type,
        ...labels,
      }
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const artifactsByRequestId = new Map<string, OutputLibraryArtifactCard[]>()
  for (const artifact of artifactCards) {
    if (!artifact.requestId) continue
    artifactsByRequestId.set(artifact.requestId, [...(artifactsByRequestId.get(artifact.requestId) ?? []), artifact])
  }

  const rows = input.outputRequests
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((request): OutputLibraryRequestRow => {
      const run = request.latestRunId
        ? runById.get(request.latestRunId) ?? null
        : request.workflowId
          ? latestRunByWorkflowId.get(request.workflowId) ?? null
          : null
      const artifacts = (artifactsByRequestId.get(request.id) ?? [])
        .slice()
        .sort((left, right) => {
          const priorityDelta = artifactCardPriority(left) - artifactCardPriority(right)
          return priorityDelta || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        })
      const groupKey = statusGroup(request, run, artifacts)
      const nodeCount = request.workflowId ? nodeCountByWorkflowId.get(request.workflowId) ?? 0 : 0
      const { progress, currentStepLabel } = buildProgress(run, nodeCount)
      const entityRefs = buildEntityRefsForRequest(request, run, input.worldEntities, assetByKey)
      return {
        id: request.id,
        title: request.title || request.prompt.slice(0, 80) || 'Untitled output',
        promptExcerpt: excerpt(request.prompt),
        outputKind: request.outputKind,
        outputKindLabel: formatKind(request.outputKind),
        status: request.status,
        statusLabel: formatStatus(run?.status ?? request.status),
        groupKey,
        workflowId: request.workflowId,
        latestRunId: request.latestRunId,
        entityRefs,
        canOpenGraph: Boolean(request.workflowId),
        canOpenTimeline: Boolean(request.workflowId && isCinematicOutputKind(request.outputKind)),
        primaryArtifact: artifacts[0] ?? null,
        artifacts,
        progress,
        currentStepLabel,
        canCancel: groupKey === 'generating',
        canRemove: groupKey !== 'generating',
      }
    })

  const groups = (['generating', 'needs_attention', 'ready', 'drafts'] as const).map((key) => ({
    key,
    label: groupLabels[key],
    rows: rows.filter((row) => row.groupKey === key),
  }))

  return {
    rows,
    groups,
    artifacts: artifactCards,
    counts: {
      generating: groups.find((group) => group.key === 'generating')?.rows.length ?? 0,
      needsAttention: groups.find((group) => group.key === 'needs_attention')?.rows.length ?? 0,
      ready: groups.find((group) => group.key === 'ready')?.rows.length ?? 0,
      artifacts: artifactCards.length,
    },
  }
}
