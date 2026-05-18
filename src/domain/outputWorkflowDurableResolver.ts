import type {
  OutputArtifact,
  OutputWorkflowNode,
  OutputWorkflowRun,
  OutputWorkflowRunStep,
} from './outputWorkflow.ts'

export type DurableWorkflowOutputSource = 'node_outputs' | 'run_step_outputs' | 'cached_upstream' | 'artifact' | 'missing'

export type DurableWorkflowMedia = {
  assetKey: string
  storagePath?: string
  mimeType?: string
  role?: string
  url?: string
  previewUrl?: string
  sourceUrl?: string
  metadata?: Record<string, unknown>
}

export type DurableWorkflowNodeOutput = {
  nodeKey: string
  source: DurableWorkflowOutputSource
  outputs: Record<string, unknown>
  text: string
  image: DurableWorkflowMedia | null
  video: DurableWorkflowMedia | null
  panels: Record<string, unknown>[]
  assetPack: Record<string, unknown> | null
  artifact: OutputArtifact | null
  status: 'ready' | 'missing'
  repairable: boolean
  diagnostics: string[]
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasOutputs(value: unknown) {
  const record = readRecord(value)
  return Object.keys(record).length > 0
}

function readNestedText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = readText(record[key])
    if (direct) return direct
    const nested = readRecord(record[key])
    const nestedText = readText(nested.text) || readText(nested.prompt) || readText(nested.providerPrompt)
    if (nestedText) return nestedText
  }
  return ''
}

function mediaFromRecord(value: unknown): DurableWorkflowMedia | null {
  const record = readRecord(value)
  const assetKey = readText(record.assetKey)
  if (!assetKey) return null
  return {
    assetKey,
    storagePath: readText(record.storagePath) || readText(record.storage_path) || undefined,
    mimeType: readText(record.mimeType) || readText(record.mime_type) || undefined,
    role: readText(record.role) || undefined,
    url: readText(record.url) || undefined,
    previewUrl: readText(record.previewUrl) || undefined,
    sourceUrl: readText(record.sourceUrl) || undefined,
    metadata: readRecord(record.metadata),
  }
}

export function outputArtifactNodeKey(artifact: Pick<OutputArtifact, 'metadata'>) {
  const metadata = readRecord(artifact.metadata)
  return readText(metadata.nodeKey) || readText(metadata.node_key)
}

export function outputArtifactRole(artifact: Pick<OutputArtifact, 'kind' | 'metadata'>) {
  const metadata = readRecord(artifact.metadata)
  return readText(metadata.role) || readText(artifact.kind)
}

export function buildRecoveredOutputFromArtifact(node: Pick<OutputWorkflowNode, 'key' | 'nodeType'>, artifact: OutputArtifact): Record<string, unknown> | null {
  const assetKey = readText(artifact.assetKey)
  if (!assetKey) return null
  const metadata = readRecord(artifact.metadata)
  const role = outputArtifactRole(artifact) || 'asset'
  const media = {
    assetKey,
    storagePath: readText(metadata.storagePath) || readText(metadata.storage_path),
    mimeType: artifact.mimeType,
    role,
    provider: readText(metadata.provider),
    model: readText(metadata.model),
    providerRequestId: readText(metadata.providerRequestId) || readText(metadata.falRequestId),
    storyboardGroupId: readText(metadata.storyboardGroupId),
    shotId: readText(metadata.shotId),
    shotIndex: Number(metadata.shotIndex ?? -1) >= 0 ? Number(metadata.shotIndex) : null,
    planningOnly: metadata.planningOnly === true || metadata.planning_only === true,
    planning_only: metadata.planningOnly === true || metadata.planning_only === true,
    usedAsVideoReference: metadata.usedAsVideoReference === true || metadata.used_as_video_reference === true,
    used_as_video_reference: metadata.usedAsVideoReference === true || metadata.used_as_video_reference === true,
    recoveredFromArtifact: true,
    metadata,
  }
  const artifactOutput = {
    key: artifact.key,
    name: artifact.name,
    kind: artifact.kind,
    assetKey,
    mimeType: artifact.mimeType,
    summary: artifact.summary,
    metadata,
    recoveredFromArtifact: true,
  }
  return {
    assetKey,
    storagePath: readText(metadata.storagePath) || readText(metadata.storage_path),
    mimeType: artifact.mimeType,
    prompt: readText(metadata.prompt),
    providerPrompt: readText(metadata.providerPrompt),
    role,
    image: artifact.kind === 'image' || node.nodeType === 'image_generation' ? media : undefined,
    video: artifact.kind === 'video' || node.nodeType === 'video_generation' ? media : undefined,
    artifact: artifactOutput,
    artifacts: [artifactOutput],
    storyboardGroupId: readText(metadata.storyboardGroupId),
    recoveredFromArtifact: true,
  }
}

export function latestCompletedStepForNode(run: OutputWorkflowRun | null | undefined, nodeKey: string) {
  return run?.steps
    .filter((step) => step.nodeKey === nodeKey && (step.status === 'completed' || step.status === 'completed_with_errors') && hasOutputs(step.outputs))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

export function durableWorkflowTextOutput(output: DurableWorkflowNodeOutput | null | undefined) {
  return output?.text ?? ''
}

export function durableWorkflowAssetKey(output: DurableWorkflowNodeOutput | null | undefined, media: 'image' | 'video' = 'image') {
  return media === 'video' ? output?.video?.assetKey ?? '' : output?.image?.assetKey ?? ''
}

export function resolveDurableWorkflowNodeOutput(input: {
  node: OutputWorkflowNode | null | undefined
  nodeKey?: string
  run?: OutputWorkflowRun | null
  step?: OutputWorkflowRunStep | null
  cachedUpstream?: Record<string, unknown> | null
  artifacts?: readonly OutputArtifact[]
  artifactRoles?: readonly string[]
}): DurableWorkflowNodeOutput {
  const nodeKey = input.node?.key ?? input.nodeKey ?? ''
  const diagnostics: string[] = []
  const nodeOutputs = readRecord(input.node?.outputs)
  let source: DurableWorkflowOutputSource = 'missing'
  let outputs: Record<string, unknown> = {}
  let artifact: OutputArtifact | null = null
  if (hasOutputs(nodeOutputs)) {
    source = 'node_outputs'
    outputs = nodeOutputs
  } else {
    const step = input.step ?? latestCompletedStepForNode(input.run, nodeKey)
    if (hasOutputs(step?.outputs)) {
      source = 'run_step_outputs'
      outputs = readRecord(step?.outputs)
    } else if (hasOutputs(input.cachedUpstream)) {
      source = 'cached_upstream'
      outputs = readRecord(input.cachedUpstream)
    } else {
      const roleSet = new Set((input.artifactRoles ?? []).map((role) => role.trim()).filter(Boolean))
      artifact = (input.artifacts ?? [])
        .filter((candidate) => !nodeKey || outputArtifactNodeKey(candidate) === nodeKey)
        .filter((candidate) => roleSet.size === 0 || roleSet.has(outputArtifactRole(candidate)))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
      if (artifact && input.node) {
        const recovered = buildRecoveredOutputFromArtifact(input.node, artifact)
        if (recovered) {
          source = 'artifact'
          outputs = recovered
        }
      }
    }
  }
  const text = readNestedText(outputs, ['providerPrompt', 'prompt', 'text', 'screenplayMarkdown', 'markdown'])
  const image = mediaFromRecord(outputs.image)
    ?? mediaFromRecord(outputs.coverImage)
    ?? (readText(outputs.assetKey) && (input.node?.nodeType === 'image_generation' || readText(outputs.mimeType).startsWith('image/'))
      ? mediaFromRecord(outputs)
      : null)
  const video = mediaFromRecord(outputs.video)
    ?? (readText(outputs.assetKey) && (input.node?.nodeType === 'video_generation' || readText(outputs.mimeType).startsWith('video/'))
      ? mediaFromRecord(outputs)
      : null)
  const panels = readArray(outputs.panels).map(readRecord).filter((panel) => Object.keys(panel).length > 0)
  const assetPack = Object.keys(readRecord(outputs.assetPack)).length > 0
    ? readRecord(outputs.assetPack)
    : Object.keys(readRecord(outputs.asset_pack)).length > 0
      ? readRecord(outputs.asset_pack)
      : null
  const ready = Boolean(text || image || video || panels.length > 0 || assetPack || hasOutputs(outputs))
  if (!ready) diagnostics.push(nodeKey ? `No durable output found for ${nodeKey}.` : 'No durable output found.')
  return {
    nodeKey,
    source,
    outputs,
    text,
    image,
    video,
    panels,
    assetPack,
    artifact,
    status: ready ? 'ready' : 'missing',
    repairable: source === 'run_step_outputs' || source === 'artifact',
    diagnostics,
  }
}
