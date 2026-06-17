import type {
  OutputArtifact,
  OutputRequest,
  OutputRequestStatusProjection,
  OutputWorkflowNode,
  OutputWorkflowRun,
  OutputWorkflowRunStep,
} from './outputWorkflow'

export type WorkflowProgressStatus = 'idle' | 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'blocked' | 'waiting'

export type WorkflowProgressNodeView = {
  key: string
  label: string
  status: WorkflowProgressStatus
  orderIndex: number
  manifestPurpose: string
  progressLabel: string
  providerStatus: string
  providerRequestId: string
  streamingStatus: string
  streamingEventCount: number
  streamingPartialArtifactKeys: string[]
  errorMessage: string
}

export type WorkflowProgressViewModel = {
  requestId: string
  workflowId: string
  latestRunId: string
  family: string
  action: string
  title: string
  status: WorkflowProgressStatus
  activeNodeKey: string
  activeNodeLabel: string
  activeManifestPurpose: string
  activeProgressLabel: string
  providerStatus: string
  providerRequestId: string
  streamingStatus: string
  streamingEventCount: number
  streamingPartialArtifactKeys: string[]
  failedNodeKey: string
  failedNodePurpose: string
  latestError: string
  readyArtifactCount: number
  scopedAssetKeys: string[]
  activeChildRequestIds: string[]
  activeChildRunIds: string[]
  recoveryHints: string[]
  completedSteps: number
  totalSteps: number
  runningSteps: number
  failedSteps: number
  queuedSteps: number
  percent: number
  terminal: boolean
  nodes: WorkflowProgressNodeView[]
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readString).filter(Boolean)
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatus(value: unknown): WorkflowProgressStatus {
  const status = readString(value)
  if (
    status === 'queued'
    || status === 'running'
    || status === 'completed'
    || status === 'completed_with_errors'
    || status === 'failed'
    || status === 'cancelled'
    || status === 'blocked'
    || status === 'waiting'
  ) return status
  if (status === 'planning' || status === 'awaiting_confirmation') return 'queued'
  return 'idle'
}

function workflowRuntimeMetadata(projection: OutputRequestStatusProjection | null | undefined, request: OutputRequest | null | undefined) {
  const projectionMetadata = readRecord(projection?.metadata)
  const requestProjection = readRecord(readRecord(request?.metadata).outputStatusProjection)
  const requestProjectionMetadata = readRecord(requestProjection.metadata)
  return {
    ...readRecord(requestProjectionMetadata.workflowRuntime),
    ...readRecord(projectionMetadata.workflowRuntime),
  }
}

function commandMetadata(request: OutputRequest | null | undefined, run: OutputWorkflowRun | null | undefined) {
  const requestMetadata = readRecord(request?.metadata)
  const workflowCommand = readRecord(requestMetadata.command ?? requestMetadata.sceneBoardCommand ?? requestMetadata.scene_board_command)
  const runCommand = readRecord(readRecord(run?.input).sceneBoardCommand ?? readRecord(run?.metadata).command)
  return { ...workflowCommand, ...runCommand }
}

function workflowFamily(request: OutputRequest | null | undefined, run: OutputWorkflowRun | null | undefined) {
  const metadata = { ...readRecord(request?.metadata), ...readRecord(run?.metadata) }
  return readString(metadata.workflowFamily)
    || readString(metadata.screenplayAnimaticRole)
    || readString(metadata.sequenceAnimaticRole)
    || readString(metadata.role)
    || readString(request?.outputKind)
}

function statusCountsFromProjection(projection: OutputRequestStatusProjection | null | undefined) {
  const steps = readRecord(readRecord(projection?.progress).steps)
  return {
    queued: readNumber(steps.queued) ?? 0,
    running: readNumber(steps.running) ?? 0,
    completed: readNumber(steps.completed) ?? 0,
    completedWithErrors: readNumber(steps.completedWithErrors) ?? 0,
    failed: readNumber(steps.failed) ?? 0,
    cancelled: readNumber(steps.cancelled) ?? 0,
  }
}

function nodeViewFromStep(step: OutputWorkflowRunStep): WorkflowProgressNodeView {
  const metadata = readRecord(step.metadata)
  const streaming = readRecord(metadata.streaming)
  const status = normalizeStatus(metadata.blocked ? 'blocked' : metadata.waiting ? 'waiting' : step.status)
  return {
    key: step.nodeKey,
    label: step.label,
    status,
    orderIndex: step.orderIndex,
    manifestPurpose: readString(metadata.manifestPurpose),
    progressLabel: readString(metadata.progressLabel) || step.label,
    providerStatus: readString(metadata.providerStatus),
    providerRequestId: readString(step.providerRequestId) || readString(metadata.providerRequestId) || readString(metadata.falRequestId),
    streamingStatus: readString(metadata.streamingStatus) || readString(streaming.status),
    streamingEventCount: readNumber(metadata.streamingEventCount) ?? readNumber(streaming.eventCount) ?? 0,
    streamingPartialArtifactKeys: [
      ...new Set(readStringArray(metadata.streamingPartialArtifactKeys).concat(readStringArray(streaming.partialArtifactKeys))),
    ],
    errorMessage: readString(step.errorMessage),
  }
}

function nodeViewFromProjectionEntry(entry: unknown, index: number): WorkflowProgressNodeView {
  const record = readRecord(entry)
  const streaming = readRecord(record.streaming)
  return {
    key: readString(record.nodeKey) || `active_node_${index + 1}`,
    label: readString(record.label) || readString(record.progressLabel) || 'Active node',
    status: normalizeStatus(record.status) || 'running',
    orderIndex: readNumber(record.orderIndex) ?? index,
    manifestPurpose: readString(record.manifestPurpose),
    progressLabel: readString(record.progressLabel) || readString(record.label),
    providerStatus: readString(record.providerStatus),
    providerRequestId: readString(record.providerRequestId) || readString(record.falRequestId),
    streamingStatus: readString(record.streamingStatus) || readString(streaming.status),
    streamingEventCount: readNumber(record.streamingEventCount) ?? readNumber(streaming.eventCount) ?? 0,
    streamingPartialArtifactKeys: [
      ...new Set(readStringArray(record.streamingPartialArtifactKeys).concat(readStringArray(streaming.partialArtifactKeys))),
    ],
    errorMessage: readString(record.errorMessage),
  }
}

export function buildWorkflowProgressViewModel(input: {
  projection?: OutputRequestStatusProjection | null
  request?: OutputRequest | null
  run?: OutputWorkflowRun | null
  artifacts?: OutputArtifact[]
  nodes?: OutputWorkflowNode[]
  fallbackTitle?: string
  fallbackActiveLabel?: string
}): WorkflowProgressViewModel {
  const projection = input.projection ?? null
  const request = input.request ?? null
  const run = input.run ?? null
  const runtime = workflowRuntimeMetadata(projection, request)
  const streaming = readRecord(runtime.streaming)
  const command = commandMetadata(request, run)
  const runSteps = run?.steps ?? []
  const projectionActiveNodes = readArray(readRecord(projection?.progress).activeNodes)
    .concat(readArray(readRecord(projection?.metadata).activeNodes))
  const nodeViews = runSteps.length > 0
    ? runSteps.map(nodeViewFromStep).sort((left, right) => left.orderIndex - right.orderIndex)
    : projectionActiveNodes.map(nodeViewFromProjectionEntry)
  const counts = runSteps.length > 0
    ? {
      queued: runSteps.filter((step) => normalizeStatus(step.status) === 'queued').length,
      running: runSteps.filter((step) => normalizeStatus(step.status) === 'running').length,
      completed: runSteps.filter((step) => normalizeStatus(step.status) === 'completed').length,
      completedWithErrors: runSteps.filter((step) => normalizeStatus(step.status) === 'completed_with_errors').length,
      failed: runSteps.filter((step) => normalizeStatus(step.status) === 'failed').length,
      cancelled: runSteps.filter((step) => normalizeStatus(step.status) === 'cancelled').length,
    }
    : statusCountsFromProjection(projection)
  const totalSteps = runSteps.length > 0
    ? runSteps.length
    : readNumber(readRecord(projection?.progress).totalSteps) ?? input.nodes?.length ?? 0
  const completedSteps = counts.completed + counts.completedWithErrors
  const status = normalizeStatus(projection?.status ?? run?.status ?? request?.status)
  const activeNode = nodeViews.find((node) => node.status === 'running')
    ?? nodeViews.find((node) => node.status === 'waiting')
    ?? nodeViews.find((node) => node.status === 'failed')
    ?? nodeViews.find((node) => node.status === 'queued')
    ?? null
  const activeNodeKey = readString(projection?.activeNodeKey) || activeNode?.key || ''
  const activeNodeLabel = readString(projection?.activeNodeLabel)
    || readString(runtime.activeProgressLabel)
    || activeNode?.progressLabel
    || input.fallbackActiveLabel
    || ''
  const artifactKeys = [
    ...readStringArray(projection?.artifactKeys),
    ...(input.artifacts ?? []).map((artifact) => artifact.key).filter(Boolean),
  ]
  const scopedAssetKeys = readStringArray(runtime.scopedAssetKeys)
    .concat(readStringArray(projection?.previewAssetKeys))
    .filter((value, index, array) => array.indexOf(value) === index)
  const latestError = readString(projection?.latestError) || readString(run?.errorMessage) || readString(request?.errorMessage)
  const terminal = Boolean(projection?.terminal)
    || status === 'completed'
    || status === 'completed_with_errors'
    || status === 'failed'
    || status === 'cancelled'

  return {
    requestId: readString(projection?.requestId) || readString(request?.id),
    workflowId: readString(projection?.workflowId) || readString(request?.workflowId) || readString(run?.workflowId),
    latestRunId: readString(projection?.latestRunId) || readString(request?.latestRunId) || readString(run?.id),
    family: readString(runtime.workflowFamily) || workflowFamily(request, run),
    action: readString(runtime.workflowCommandAction) || readString(command.action) || readString(readRecord(request?.metadata).runIntent) || readString(readRecord(run?.metadata).runIntent),
    title: readString(projection?.title) || readString(request?.title) || input.fallbackTitle || 'Workflow',
    status,
    activeNodeKey,
    activeNodeLabel,
    activeManifestPurpose: readString(runtime.activeManifestPurpose) || activeNode?.manifestPurpose || '',
    activeProgressLabel: readString(runtime.activeProgressLabel) || activeNode?.progressLabel || activeNodeLabel,
    providerStatus: readString(runtime.providerStatus) || activeNode?.providerStatus || '',
    providerRequestId: readString(runtime.providerRequestId) || activeNode?.providerRequestId || '',
    streamingStatus: readString(runtime.streamingStatus) || readString(streaming.status) || activeNode?.streamingStatus || '',
    streamingEventCount: readNumber(runtime.streamingEventCount) ?? readNumber(streaming.eventCount) ?? activeNode?.streamingEventCount ?? 0,
    streamingPartialArtifactKeys: [
      ...new Set(readStringArray(runtime.streamingPartialArtifactKeys)
        .concat(readStringArray(streaming.partialArtifactKeys))
        .concat(activeNode?.streamingPartialArtifactKeys ?? [])),
    ],
    failedNodeKey: readString(runtime.failedNodeKey) || (latestError && activeNode?.status === 'failed' ? activeNode.key : ''),
    failedNodePurpose: readString(runtime.failedNodePurpose) || '',
    latestError,
    readyArtifactCount: readNumber(runtime.readyArtifactCount) ?? new Set(artifactKeys).size,
    scopedAssetKeys,
    activeChildRequestIds: readStringArray(runtime.activeChildRequestIds),
    activeChildRunIds: readStringArray(runtime.activeChildRunIds),
    recoveryHints: readStringArray(runtime.recoveryHints),
    completedSteps,
    totalSteps,
    runningSteps: counts.running,
    failedSteps: counts.failed,
    queuedSteps: counts.queued,
    percent: totalSteps > 0 ? Math.max(0, Math.min(100, Math.round((completedSteps / totalSteps) * 100))) : terminal ? 100 : 0,
    terminal,
    nodes: nodeViews,
  }
}
