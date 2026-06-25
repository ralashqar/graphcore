import type {
  OutputWorkflowNode,
  OutputWorkflowRun,
  OutputWorkflowRunStep,
} from '../../../domain/outputWorkflow'

type LooseRecord = Record<string, unknown>

type ContinuityAssetTargetProgressView = {
  nodeId: string
  name: string
  status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed'
  assetKey: string | null
  assetUrl: string | null
}

type CoverageAnchorProgressView = {
  assetKey?: string | null
  assetUrl: string | null
  running?: boolean
}

type SpatialBindingProgressView = {
  hierarchy: ReadonlyArray<{ id: string }>
}

type KeyframeBusyShotView = {
  keyframeProgressLabel: string
  keyframeDependencyStatusLabel: string
  keyframeStatusLabel: string
  keyframeDependencyRunning: boolean
  keyframeRunning: boolean
}

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readLooseRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readLooseArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function summarizeOutputStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function outputRunStepForNode(run: OutputWorkflowRun | null | undefined, nodeKey: string) {
  return run?.steps.find((step) => step.nodeKey === nodeKey) ?? null
}

export function statusLabelForOutputRunStep(step: OutputWorkflowRunStep | null | undefined) {
  if (!step) return ''
  if (step.status === 'running' || step.status === 'queued') return summarizeOutputStatus(step.status)
  if (step.status === 'failed') return 'Failed'
  if (step.status === 'completed' || step.status === 'completed_with_errors') return 'Complete'
  return summarizeOutputStatus(step.status)
}

export function outputRunStepTextOutput(step: OutputWorkflowRunStep | null | undefined) {
  const outputs = readLooseRecord(step?.outputs)
  return trimOptionalString(outputs.providerPrompt)
    || trimOptionalString(outputs.prompt)
    || trimOptionalString(outputs.text)
}

export function outputWorkflowNodeTextOutput(node: OutputWorkflowNode | null | undefined) {
  const outputs = readLooseRecord(node?.outputs)
  return trimOptionalString(outputs.providerPrompt)
    || trimOptionalString(outputs.prompt)
    || trimOptionalString(outputs.text)
}

export function outputRunStepAssetKey(step: OutputWorkflowRunStep | null | undefined, fields: string[]) {
  const outputs = readLooseRecord(step?.outputs)
  for (const field of fields) {
    const value = outputs[field]
    if (typeof value === 'string' && trimOptionalString(value)) return trimOptionalString(value)
    const record = readLooseRecord(value)
    const assetKey = trimOptionalString(record.assetKey)
    if (assetKey) return assetKey
  }
  return ''
}

export function outputWorkflowNodeAssetKey(node: OutputWorkflowNode | null | undefined, fields: string[]) {
  const outputs = readLooseRecord(node?.outputs)
  for (const field of fields) {
    const value = outputs[field]
    if (typeof value === 'string' && trimOptionalString(value)) return trimOptionalString(value)
    const record = readLooseRecord(value)
    const assetKey = trimOptionalString(record.assetKey)
    if (assetKey) return assetKey
  }
  const preview = readLooseRecord(readLooseRecord(node?.metadata).outputPreview)
  const assetKeys = readLooseArray(preview.assetKeys).map(trimOptionalString).filter(Boolean)
  return assetKeys[0] ?? ''
}

export function outputWorkflowNodeForKey(nodes: readonly OutputWorkflowNode[], workflowId: string | null | undefined, nodeKey: string) {
  if (!workflowId) return null
  return nodes.find((node) => node.workflowId === workflowId && node.key === nodeKey) ?? null
}

export function isOutputRunStepActive(step: OutputWorkflowRunStep | null | undefined) {
  return step?.status === 'queued' || step?.status === 'running'
}

export function sequenceAnimaticVideoProgressLabel(step: OutputWorkflowRunStep | null | undefined) {
  if (!step) return ''
  const metadata = readLooseRecord(step.metadata)
  const outputs = readLooseRecord(step.outputs)
  const providerStatus = trimOptionalString(metadata.providerStatus).toUpperCase()
  if (step.status === 'queued') return 'Video queued'
  if (providerStatus) {
    if (providerStatus === 'SUBMITTED' || providerStatus === 'IN_QUEUE') return 'MUAPI queued'
    if (providerStatus === 'IN_PROGRESS' || providerStatus === 'PROCESSING') return 'Generating video'
    if (providerStatus === 'COMPLETED') return 'Finalizing video asset'
    return providerStatus.replace(/_/g, ' ').toLowerCase()
  }
  if (trimOptionalString(metadata.muapiRequestId)) return 'Generating video'
  if (trimOptionalString(outputs.assetKey)) return 'Video ready'
  if (step.status === 'running') return 'Submitting video request'
  if (step.status === 'failed') return step.errorMessage || 'Video generation failed'
  return statusLabelForOutputRunStep(step)
}

export function sequenceAnimaticShotVideoProgressLabel(step: OutputWorkflowRunStep | null | undefined) {
  const label = sequenceAnimaticVideoProgressLabel(step)
  if (label === 'Generating video') return 'Generating shot video'
  if (label === 'Submitting video request') return 'Submitting shot video request'
  if (label === 'Finalizing video asset') return 'Finalizing shot video'
  if (label === 'Video queued') return 'Shot video queued'
  if (label === 'MUAPI queued') return 'Shot video queued'
  if (label === 'Video ready') return 'Shot take ready'
  if (label === 'Video generation failed') return 'Shot video generation failed'
  return label
}

function continuityStepTargetLabel(step: OutputWorkflowRunStep) {
  const metadata = readLooseRecord(step.metadata)
  const targetNode = readLooseRecord(metadata.targetNode ?? metadata.target_node)
  const name = trimOptionalString(targetNode.name)
    || trimOptionalString(metadata.targetName)
    || trimOptionalString(metadata.target_node_name)
    || trimOptionalString(step.label)
      .replace(/\s+(input|prompt|ref image|ref)$/i, '')
      .trim()
  return name || 'continuity'
}

export function sequenceAnimaticShotKeyframeProgressLabel(run: OutputWorkflowRun | null | undefined) {
  if (!run) return ''
  const activeStep = [...run.steps]
    .filter(isOutputRunStepActive)
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .find((step) => {
      const key = step.nodeKey
      return key.startsWith('continuity_')
        || key === 'coverage_anchor_brief'
        || key === 'coverage_anchor_prompt'
        || key === 'coverage_anchor_image'
        || key === 'coverage_anchor_artifact'
        || key === 'shot_reference_pack'
        || key === 'planned_keyframe_prompt'
        || key === 'planned_keyframe_image'
        || key === 'planned_keyframe_artifact'
    })
  if (!activeStep) return ''
  const key = activeStep.nodeKey
  if (key.startsWith('continuity_') && (key.endsWith('_image') || key.endsWith('_artifact'))) {
    return `Generating ${continuityStepTargetLabel(activeStep)} ref`
  }
  if (key.startsWith('continuity_')) return `Preparing ${continuityStepTargetLabel(activeStep)} ref`
  if (key === 'coverage_anchor_brief') return 'Planning coverage anchor'
  if (key === 'coverage_anchor_prompt' || key === 'coverage_anchor_image' || key === 'coverage_anchor_artifact') return 'Generating coverage anchor'
  if (key === 'shot_reference_pack') return 'Preparing shot references'
  if (key === 'planned_keyframe_prompt') return 'Writing keyframe prompt'
  if (key === 'planned_keyframe_image') return 'Generating keyframe'
  if (key === 'planned_keyframe_artifact') return 'Saving keyframe'
  return ''
}

export function sequenceAnimaticShotKeyframeBusyLabel(shot: KeyframeBusyShotView, starting = false) {
  if (starting) return 'Starting keyframe'
  return shot.keyframeProgressLabel
    || (shot.keyframeDependencyRunning ? shot.keyframeDependencyStatusLabel : '')
    || (shot.keyframeRunning ? shot.keyframeStatusLabel : '')
    || 'Generating keyframe'
}

export function sequenceAnimaticShotProgressPreview(input: {
  coverageAnchor: CoverageAnchorProgressView | null
  dependencyTargets: readonly ContinuityAssetTargetProgressView[]
  spatialBindingView: SpatialBindingProgressView
}): { assetKey: string | null; assetUrl: string | null; statusLabel: string; running: boolean } {
  if (input.coverageAnchor?.assetKey) {
    return {
      assetKey: input.coverageAnchor.assetKey,
      assetUrl: input.coverageAnchor.assetUrl,
      statusLabel: 'Coverage anchor ready',
      running: Boolean(input.coverageAnchor.running),
    }
  }
  const targetByNodeId = new Map(input.dependencyTargets.map((target) => [target.nodeId, target] as const))
  const preferredNodeIds = [
    ...input.spatialBindingView.hierarchy.map((node) => node.id).filter(Boolean).reverse(),
    ...input.dependencyTargets.map((target) => target.nodeId),
  ]
  const preferredReadyTarget = preferredNodeIds
    .map((nodeId) => targetByNodeId.get(nodeId) ?? null)
    .find((target) => target?.status === 'ready' && Boolean(target.assetKey || target.assetUrl)) ?? null
  const readyTarget = preferredReadyTarget
    ?? input.dependencyTargets.find((target) => target.status === 'ready' && Boolean(target.assetKey || target.assetUrl))
    ?? null
  if (readyTarget) {
    return {
      assetKey: readyTarget.assetKey,
      assetUrl: readyTarget.assetUrl,
      statusLabel: `${readyTarget.name || 'Continuity'} ref ready`,
      running: input.dependencyTargets.some((target) => target.status === 'generating'),
    }
  }
  return {
    assetKey: null,
    assetUrl: null,
    statusLabel: '',
    running: Boolean(input.coverageAnchor?.running) || input.dependencyTargets.some((target) => target.status === 'generating'),
  }
}
