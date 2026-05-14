import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../../domain/assets.ts'
import type { AssetDefinition, WorldEntity } from '../../../domain/graphcore.ts'
import type {
  OutputArtifact,
  OutputRequest,
  OutputRequestKind,
  OutputRequestStatusProjection,
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
  summary: string
  variantAssetKey: string | null
  variantKey: string | null
  variantLabel: string | null
  icon: EntityIconId
  imageUrl: string | null
}

export type OutputLibraryArtifactCard = {
  id: string
  key: string
  name: string
  kind: OutputArtifact['kind']
  mimeType: string
  metadata: Record<string, unknown>
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
  imageUrlByEntityKey?: ReadonlyMap<string, string | null>
  outputArtifacts: readonly OutputArtifact[]
  outputRequests: readonly OutputRequest[]
  outputRequestProjections?: readonly OutputRequestStatusProjection[]
  outputWorkflowNodes: readonly OutputWorkflowNode[]
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  referenceVariantIconUrlByVariantKey?: ReadonlyMap<string, string | null>
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

function readNonNegativeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(number) && number > 0 ? number : 0
}

function readProjectionFromRequest(request: OutputRequest): OutputRequestStatusProjection | null {
  const projection = readRecord(request.metadata).outputStatusProjection
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return null
  const record = projection as Partial<OutputRequestStatusProjection>
  const requestId = readTrimmedString(record.requestId)
  if (!requestId || requestId !== request.id) return null
  return record as OutputRequestStatusProjection
}

function effectiveRequestStatus(
  request: OutputRequest,
  run: OutputWorkflowRun | null,
  projection: OutputRequestStatusProjection | null,
) {
  return projection?.status ?? run?.status ?? request.status
}

function statusGroup(
  request: OutputRequest,
  run: OutputWorkflowRun | null,
  artifacts: readonly OutputLibraryArtifactCard[],
  projection: OutputRequestStatusProjection | null = null,
): OutputLibraryGroupKey {
  const status = effectiveRequestStatus(request, run, projection)
  if (status === 'failed' || status === 'completed_with_errors') return 'needs_attention'
  if (!run && (request.status === 'failed' || request.status === 'completed_with_errors')) return 'needs_attention'
  if (status === 'completed' || request.status === 'completed') return 'ready'
  if (artifacts.length > 0 && status !== 'running' && status !== 'queued' && request.status !== 'planning') return 'ready'
  if (request.status === 'awaiting_confirmation' || status === 'cancelled' || request.status === 'cancelled') return 'drafts'
  if (status === 'running' || status === 'queued' || request.status === 'running' || request.status === 'planning') return 'generating'
  return 'drafts'
}

function stepStatusKey(step: OutputWorkflowRunStep | null | undefined) {
  const status = String(step?.status ?? '')
  return status
}

function buildProgress(
  run: OutputWorkflowRun | null,
  nodeCount: number,
  projection: OutputRequestStatusProjection | null = null,
) {
  if (projection) {
    const progressRecord = readRecord(projection.progress)
    const stepsRecord = readRecord(progressRecord.steps)
    const total = readNonNegativeNumber(progressRecord.totalSteps)
    const completed = Math.min(total, (
      readNonNegativeNumber(stepsRecord.completed)
      + readNonNegativeNumber(stepsRecord.skipped)
      + readNonNegativeNumber(stepsRecord.completedWithErrors)
    ))
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStepLabel = readTrimmedString(projection.activeNodeLabel)
      || (projection.terminal ? formatStatus(projection.status) : total > 0 ? 'Waiting for next workflow step' : 'Preparing workflow')
    return {
      progress: {
        completed,
        total,
        percent,
        label: total > 0 ? `${completed}/${total} steps` : 'Preparing plan',
      },
      currentStepLabel,
    }
  }

  const steps = run?.steps ?? []
  const completedSteps = steps.filter((step) => {
    const status = stepStatusKey(step)
    return status === 'completed' || status === 'skipped'
  }).length
  const isCompletedRun = run?.status === 'completed'
  const total = steps.length > 0 ? steps.length : nodeCount > 0 ? nodeCount : isCompletedRun ? 1 : 0
  const completed = steps.length > 0 ? completedSteps : isCompletedRun ? total : 0
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

function collectRequestEntityCandidates(
  request: OutputRequest,
  run: OutputWorkflowRun | null,
  artifacts: readonly Pick<OutputLibraryArtifactCard, 'metadata'>[] = [],
) {
  const candidates: Array<{
    value: string
    role: string
    variantAssetKey: string | null
    variantKey: string | null
    variantLabel: string | null
  }> = []
  const push = (
    value: unknown,
    role = '',
    variantKey: string | null = null,
    variantLabel: string | null = null,
    variantAssetKey: string | null = null,
  ) => {
    const text = readTrimmedString(value)
    if (text) candidates.push({ value: text, role, variantAssetKey, variantKey, variantLabel })
  }
  const pushRecordIdentity = (value: unknown, role = '') => {
    const record = readRecord(value)
    const rawVariantKey = readTrimmedString(record.selectedReferenceVariantKey)
      || readTrimmedString(record.variantKey)
      || readTrimmedString(record.referenceVariantKey)
      || null
    const variantKey = rawVariantKey && rawVariantKey !== 'default' ? rawVariantKey : null
    const rawVariantLabel = readTrimmedString(record.selectedReferenceVariantLabel)
      || readTrimmedString(record.variantLabel)
      || readTrimmedString(record.referenceVariantLabel)
      || (role === 'selectedReferenceVariants' ? readTrimmedString(record.label) : '')
    const variantLabel = variantKey ? rawVariantLabel || variantKey.replace(/[_-]+/g, ' ') : null
    const variantAssetKey = variantKey
      ? readTrimmedString(record.selectedReferenceVariantAssetKey)
        || readTrimmedString(record.variantAssetKey)
        || readTrimmedString(record.primaryAssetKey)
        || readTrimmedString(record.assetKey)
        || null
      : null
    push(record.refId, role, variantKey, variantLabel, variantAssetKey)
    push(record.id, role, variantKey, variantLabel, variantAssetKey)
    push(record.key, role, variantKey, variantLabel, variantAssetKey)
    push(record.entityKey, role, variantKey, variantLabel, variantAssetKey)
    push(record.entityRefId, role, variantKey, variantLabel, variantAssetKey)
    push(record.label, role, variantKey, variantLabel, variantAssetKey)
    push(record.name, role, variantKey, variantLabel, variantAssetKey)
    push(record.sourceName, role, variantKey, variantLabel, variantAssetKey)
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
    for (const groupKey of ['entities', 'references', 'entityRefs', 'visualReferences', 'selectedReferenceVariants', 'assets']) {
      for (const entry of readArray(record[groupKey])) pushRecordIdentity(entry, groupKey)
    }
  }

  for (const key of request.selectedEntityKeys) push(key, 'selected')
  for (const artifact of artifacts) collectAssetPack(artifact.metadata)
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
  artifacts: readonly OutputLibraryArtifactCard[],
  worldEntities: readonly WorldEntity[],
  assetByKey: Map<string, AssetDefinition>,
  imageUrlByEntityKey?: ReadonlyMap<string, string | null>,
  referenceVariantIconUrlByVariantKey?: ReadonlyMap<string, string | null>,
): OutputLibraryEntityRef[] {
  const lookup = new Map<string, WorldEntity>()
  for (const entity of worldEntities) {
    lookup.set(normalizeEntityLookup(entity.key), entity)
    if (entity.name) lookup.set(normalizeEntityLookup(entity.name), entity)
  }

  const refs: OutputLibraryEntityRef[] = []
  const indexByEntityKey = new Map<string, number>()
  for (const candidate of collectRequestEntityCandidates(request, run, artifacts)) {
    const entity = resolveWorldEntityReference(candidate.value, lookup, worldEntities)
    if (!entity || entity.nodeType === 'sequence_unit') continue
    const existingIndex = indexByEntityKey.get(entity.key)
    if (existingIndex !== undefined) {
      if (!candidate.variantKey || refs[existingIndex]?.variantKey) continue
    }
    const asset = entity.thumbnailAssetKey ? assetByKey.get(entity.thumbnailAssetKey) ?? null : null
    const variantEntryKey = candidate.variantKey ? `${entity.key}:${candidate.variantKey}` : ''
    const variantImageUrl = variantEntryKey ? referenceVariantIconUrlByVariantKey?.get(variantEntryKey) ?? null : null
    const variantAsset = candidate.variantAssetKey ? assetByKey.get(candidate.variantAssetKey) ?? null : null
    const ref: OutputLibraryEntityRef = {
      key: entity.key,
      label: entity.name || entity.key,
      role: candidate.role,
      summary: entity.summary || entity.context || '',
      variantAssetKey: candidate.variantAssetKey,
      variantKey: candidate.variantKey,
      variantLabel: candidate.variantLabel,
      icon: iconForWorldEntity(entity.nodeType),
      imageUrl: variantImageUrl || resolveAssetSourceUrl(variantAsset) || imageUrlByEntityKey?.get(entity.key) || resolveAssetSourceUrl(asset) || null,
    }
    if (existingIndex !== undefined) {
      refs[existingIndex] = ref
    } else {
      indexByEntityKey.set(entity.key, refs.length)
      refs.push(ref)
    }
    if (refs.length >= 12) break
  }
  return refs
}

export function buildOutputLibraryModel(input: BuildOutputLibraryModelInput): OutputLibraryModel {
  const assetByKey = new Map(input.assets.map((asset) => [asset.key, asset]))
  const requestByWorkflowId = new Map(input.outputRequests.flatMap((request) => request.workflowId ? [[request.workflowId, request] as const] : []))
  const runById = new Map(input.outputWorkflowRuns.map((run) => [run.id, run]))
  const projectionByRequestId = new Map<string, OutputRequestStatusProjection>()
  for (const projection of input.outputRequestProjections ?? []) {
    projectionByRequestId.set(projection.requestId, projection)
  }
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
        metadata,
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
      const projection = projectionByRequestId.get(request.id) ?? readProjectionFromRequest(request)
      const groupKey = statusGroup(request, run, artifacts, projection)
      const nodeCount = request.workflowId ? nodeCountByWorkflowId.get(request.workflowId) ?? 0 : 0
      const { progress, currentStepLabel } = buildProgress(run, nodeCount, projection)
      const entityRefs = buildEntityRefsForRequest(
        request,
        run,
        artifacts,
        input.worldEntities,
        assetByKey,
        input.imageUrlByEntityKey,
        input.referenceVariantIconUrlByVariantKey,
      )
      return {
        id: request.id,
        title: request.title || request.prompt.slice(0, 80) || 'Untitled output',
        promptExcerpt: excerpt(request.prompt),
        outputKind: request.outputKind,
        outputKindLabel: formatKind(request.outputKind),
        status: request.status,
        statusLabel: formatStatus(effectiveRequestStatus(request, run, projection)),
        groupKey,
        workflowId: request.workflowId,
        latestRunId: projection?.latestRunId ?? request.latestRunId,
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
