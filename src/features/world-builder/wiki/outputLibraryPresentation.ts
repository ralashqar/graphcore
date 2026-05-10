import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../../domain/assets.ts'
import type { AssetDefinition } from '../../../domain/graphcore.ts'
import type {
  OutputArtifact,
  OutputRequest,
  OutputRequestKind,
  OutputWorkflowNode,
  OutputWorkflowRun,
  OutputWorkflowRunStep,
} from '../../../domain/outputWorkflow.ts'

export type OutputLibraryGroupKey = 'generating' | 'needs_attention' | 'ready' | 'drafts'
export type OutputArtifactFilter = 'all' | 'images' | 'documents' | 'video' | 'other'

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
