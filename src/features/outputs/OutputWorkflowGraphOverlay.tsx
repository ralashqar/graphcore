import {
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'

import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../domain/assets'
import type { AssetDefinition } from '../../domain/graphcore'
import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeExecutionMetadata,
  isOutputWorkflowProviderBackedNodeType,
  outputWorkflowNodeRegistry,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunScope,
  type OutputWorkflowRunStep,
} from '../../domain/outputWorkflow'
import {
  buildOutputWorkflowLevelLayout,
  outputWorkflowStepStatusKey,
} from '../../domain/outputWorkflowGraphView'

const NODE_WIDTH = 306
const NODE_HEIGHT = 220
const IMAGE_NODE_MAX_HEIGHT = 320
const IMAGE_NODE_MIN_WIDTH = 160
const IMAGE_NODE_MAX_WIDTH = 360

type GraphNodeData = {
  node: OutputWorkflowNode
  step: OutputWorkflowRunStep | null
  statusKey: string
  outputPreview: string
  imageUrl: string | null
  imageSize: { width: number; height: number } | null
  hasOutput: boolean
  skillKeys: string[]
  inputPorts: Array<{ id: string; valueType: string }>
  outputPorts: Array<{ id: string; valueType: string }>
  selected: boolean
  running: boolean
  onSelect: (nodeKey: string) => void
  onRun: (node: OutputWorkflowNode, runScope?: OutputWorkflowRunScope) => void
  onOpenOutput: (nodeKey: string) => void
}

type GraphEdgeData = {
  valueType: string
  statusKey: string
}

type GraphNode = Node<GraphNodeData, 'outputWorkflow'>
type GraphEdge = Edge<GraphEdgeData, 'outputWorkflowEdge'>

type OutputWorkflowGraphOverlayProps = {
  workflow: OutputWorkflow
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
  worldEntities: Array<Record<string, unknown>>
  worldRelationships: Array<Record<string, unknown>>
  assets: AssetDefinition[]
  activeRun: OutputWorkflowRun | null
  selectedNodeKey: string | null
  canRunOutputs: boolean
  targetedNodeKey: string | null
  targetedNodeKeys?: string[]
  targetedRunScope: OutputWorkflowRunScope | null
  runErrorMessage?: string | null
  refreshingGraph?: boolean
  canOpenTimeline?: boolean
  worldWiki: unknown
  onClose: () => void
  onOpenTimeline?: () => void
  onSelectNode: (nodeKey: string) => void
  onRunNode: (node: OutputWorkflowNode, runScope?: OutputWorkflowRunScope) => void
  onRunNodes: (nodes: OutputWorkflowNode[], runScope?: OutputWorkflowRunScope) => void
  onRefreshGraph: () => void
  onCancelRun: () => void
  onSaveNode: (request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
  }) => Promise<unknown>
  readOutputPreview: (step: Pick<OutputWorkflowRunStep, 'outputs' | 'errorMessage' | 'provider' | 'model'> | null | undefined) => string
  readNodeSkillKeys: (node: OutputWorkflowNode) => string[]
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function isCinematicV2TimelineNode(node: OutputWorkflowNode | null | undefined) {
  if (!node) return false
  const config = readRecord(node.config)
  const metadata = readRecord(node.metadata)
  const purpose = readTrimmedString(config.purpose)
  const role = readTrimmedString(config.role) || readTrimmedString(metadata.role)
  const key = node.key.toLowerCase()
  const purposeOrRole = `${purpose} ${role}`.toLowerCase()
  return purposeOrRole.includes('cinematic_v2_timeline_assemble')
    || purposeOrRole.includes('cinematic_v2_shot_keyframe')
    || purposeOrRole.includes('cinematic_v2_shot_video')
    || purposeOrRole.includes('cinematic_v3_timeline_assemble')
    || purposeOrRole.includes('cinematic_v3_storyboard_group_video')
    || key.includes('cinematic_v2_timeline_assemble')
    || key.includes('cinematic_v3_timeline_assemble')
    || (key.includes('cinematic_v2_shot_') && (key.endsWith('_keyframe') || key.endsWith('_video')))
    || (key.includes('cinematic_v3_storyboard_group_') && key.endsWith('_video'))
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function formatConfigValue(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

function resolveEdgeValueType(edge: OutputWorkflowEdge, sourceNode: OutputWorkflowNode | undefined) {
  const metadataType = readTrimmedString(edge.metadata.valueType)
  if (metadataType) return metadataType
  const sourcePort = sourceNode
    ? outputWorkflowNodeRegistry[sourceNode.nodeType].outputPorts.find((port) => port.id === edge.sourcePort)
    : null
  return sourcePort?.valueType ?? 'text'
}

function appendUniquePort(
  portsByNodeKey: Map<string, Array<{ id: string; valueType: string }>>,
  nodeKey: string,
  port: { id: string; valueType: string },
) {
  const ports = portsByNodeKey.get(nodeKey) ?? []
  if (ports.some((entry) => entry.id === port.id)) return
  portsByNodeKey.set(nodeKey, [...ports, port])
}

function providerStatus(step: OutputWorkflowRunStep | null | undefined) {
  const metadata = readRecord(step?.metadata)
  return readTrimmedString(metadata.providerStatus) || readTrimmedString(step?.status)
}

type OutputWorkflowOutputSource = Pick<OutputWorkflowRunStep, 'outputs'> | null | undefined

function imageOutputAssetKey(source: OutputWorkflowOutputSource) {
  const outputs = readRecord(source?.outputs)
  const image = readRecord(outputs.image)
  return readTrimmedString(image.assetKey) || readTrimmedString(outputs.assetKey)
}

function artifactUrlByAssetKey(run: OutputWorkflowRun | null | undefined) {
  const urls = new Map<string, string>()
  for (const artifact of run?.artifacts ?? []) {
    const assetKey = readTrimmedString(artifact.assetKey)
    if (!assetKey) continue
    const metadata = readRecord(artifact.metadata)
    const sourceUrl = readTrimmedString(metadata.sourceUrl)
    const previewUrl = readTrimmedString(metadata.previewUrl)
    const url = isResolvableAssetUrl(sourceUrl)
      ? sourceUrl
      : isResolvableAssetUrl(previewUrl)
        ? previewUrl
        : ''
    if (url) urls.set(assetKey, url)
  }
  return urls
}

function readArtifactImageSize(artifact: OutputWorkflowRun['artifacts'][number] | null | undefined) {
  const metadata = readRecord(artifact?.metadata)
  const width = Number(metadata.width ?? readRecord(metadata.imageSize).width)
  const height = Number(metadata.height ?? readRecord(metadata.imageSize).height)
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null
}

function artifactImageByNodeKey(run: OutputWorkflowRun | null | undefined) {
  const images = new Map<string, {
    assetKey: string
    url: string
    size: { width: number; height: number } | null
  }>()
  for (const artifact of run?.artifacts ?? []) {
    if (artifact.kind !== 'image') continue
    const metadata = readRecord(artifact.metadata)
    const nodeKey = readTrimmedString(metadata.nodeKey)
    if (!nodeKey) continue
    const sourceUrl = readTrimmedString(metadata.sourceUrl)
    const previewUrl = readTrimmedString(metadata.previewUrl)
    const url = isResolvableAssetUrl(sourceUrl)
      ? sourceUrl
      : isResolvableAssetUrl(previewUrl)
        ? previewUrl
        : ''
    const assetKey = readTrimmedString(artifact.assetKey)
    if (!assetKey && !url) continue
    images.set(nodeKey, {
      assetKey,
      url,
      size: readArtifactImageSize(artifact),
    })
  }
  return images
}

function readImageOutputSize(source: OutputWorkflowOutputSource) {
  const outputs = readRecord(source?.outputs)
  const image = readRecord(outputs.image)
  const width = Number(image.width ?? outputs.width)
  const height = Number(image.height ?? outputs.height)
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null
}

function graphNodeDimensions(node: OutputWorkflowNode, imageSize: { width: number; height: number } | null) {
  if (node.nodeType !== 'image_generation' || !imageSize) return { width: NODE_WIDTH, height: NODE_HEIGHT }
  const aspect = imageSize.width / imageSize.height
  const height = IMAGE_NODE_MAX_HEIGHT
  const width = Math.max(IMAGE_NODE_MIN_WIDTH, Math.min(IMAGE_NODE_MAX_WIDTH, Math.round(height * aspect)))
  return { width, height }
}

function hasOverlappingNodePositions(nodes: OutputWorkflowNode[]) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const key = `${Math.round(node.position.x / 24)}:${Math.round(node.position.y / 24)}`
    const seen = new Set(nodes.slice(0, index).map((entry) => `${Math.round(entry.position.x / 24)}:${Math.round(entry.position.y / 24)}`))
    if (seen.has(key)) return true
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const other = nodes[otherIndex]
      const overlapsX = Math.abs(node.position.x - other.position.x) < NODE_WIDTH + 24
      const overlapsY = Math.abs(node.position.y - other.position.y) < NODE_HEIGHT + 24
      if (overlapsX && overlapsY) return true
    }
  }
  return false
}

function sequenceRecordFromEntity(entity: Record<string, unknown> | null | undefined) {
  return readRecord(readRecord(entity?.customProperties).sequence)
}

function nodeTypeMarker(nodeType: OutputWorkflowNode['nodeType']) {
  if (nodeType === 'image_generation') return 'IMG'
  if (nodeType === 'video_generation') return 'VID'
  if (nodeType === 'document_render') return 'DOC'
  if (nodeType === 'output_artifact') return 'OUT'
  if (nodeType === 'world_context_query') return 'CTX'
  if (nodeType === 'skill_context_query') return 'SKL'
  if (nodeType === 'utility_transform') return 'FX'
  return 'T'
}

function selectedNodeRunLabel(node: OutputWorkflowNode) {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  if (node.nodeType === 'output_artifact') return 'Rebuild PDF only'
  if (node.nodeType === 'document_render') return 'Refresh document only'
  if (purpose === 'ebook_cover_prompt') return 'Regenerate cover + PDF'
  if (purpose === 'ebook_cover_image') return 'Regenerate cover + PDF'
  if (purpose === 'comic_page_prompt') return 'Run prompt only'
  if (purpose === 'comic_page') return 'Run image only'
  if (purpose === 'chapter_prose') return 'Regenerate chapter'
  if (purpose === 'chapter_section_prose') return 'Regenerate section'
  if (node.nodeType === 'video_generation') return 'Generate video'
  return 'Run node'
}

function defaultRunScopeForNode(node: OutputWorkflowNode): OutputWorkflowRunScope {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  if (node.nodeType === 'output_artifact' || node.nodeType === 'document_render') return 'artifact_rebake'
  if (purpose === 'comic_page_prompt' || purpose === 'comic_page') return 'node_only'
  return 'node_only'
}

function hasCachedNodeOutput(node: OutputWorkflowNode | undefined) {
  return Object.keys(readRecord(node?.outputs)).length > 0
}

function readNodeOutputPreview(node: OutputWorkflowNode | undefined) {
  const preview = readRecord(readRecord(node?.metadata).outputPreview)
  const text = readTrimmedString(preview.text) || readTrimmedString(preview.preview)
  if (text) return text
  const assetKeys = readStringArray(preview.assetKeys)
  if (assetKeys.length > 0) return `Generated assets: ${assetKeys.join(', ')}`
  const outputBytes = Number(preview.outputBytes)
  if (Number.isFinite(outputBytes) && outputBytes > 0) return `Output cached (${Math.round(outputBytes / 1024)} KB). Select the node to hydrate full output.`
  return ''
}

function localRunButtonLabel(input: {
  label: string
  scope: OutputWorkflowRunScope
  targetedNode: boolean
  targetedScope: OutputWorkflowRunScope | null
  activeRunStatus?: string
}) {
  if (!input.targetedNode || input.targetedScope !== input.scope) return input.label
  return input.activeRunStatus === 'queued' ? 'Queued...' : 'Running...'
}

function OutputWorkflowNodeCard({ data }: NodeProps<GraphNode>) {
  const { node, step, statusKey, outputPreview, imageUrl, imageSize, hasOutput, inputPorts, outputPorts, selected, running, onSelect, onRun, onOpenOutput } = data
  const hasImagePreview = node.nodeType === 'image_generation' && Boolean(imageUrl)
  const bodyText = outputPreview || (step?.errorMessage ? step.errorMessage : hasOutput ? '' : 'No output yet.')

  return (
    <div
      className={`outputs-graph-node is-${node.nodeType} is-${statusKey} ${selected ? 'is-selected' : ''} ${hasImagePreview ? 'has-image-output' : ''}`}
      onClick={() => onSelect(node.key)}
      onDoubleClick={() => onSelect(node.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(node.key)
        }
      }}
      role="button"
      style={hasImagePreview && imageSize ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}
      tabIndex={0}
    >
      {inputPorts.map((port, index) => (
        <Handle
          className={`outputs-graph-handle is-${port.valueType}`}
          id={port.id}
          key={port.id}
          position={Position.Left}
          style={{ top: 38 + index * 22 }}
          type="target"
        />
      ))}
      {hasImagePreview ? (
        <>
          <div className="outputs-graph-node-header">
            <span className={`outputs-graph-node-type is-${node.nodeType}`} aria-hidden="true">{nodeTypeMarker(node.nodeType)}</span>
            <strong>{node.label}</strong>
          </div>
          <div className="outputs-graph-node-body outputs-graph-node-image-body">
            <img className="outputs-graph-node-image" src={imageUrl ?? ''} alt="" loading="lazy" />
          </div>
        </>
      ) : (
        <>
          <div className="outputs-graph-node-header">
            <span className={`outputs-graph-node-type is-${node.nodeType}`} aria-hidden="true">{nodeTypeMarker(node.nodeType)}</span>
            <strong>{node.label}</strong>
          </div>
          <pre className="outputs-graph-node-body nodrag nowheel">{bodyText}</pre>
        </>
      )}
      {hasOutput ? (
        <button
          aria-label={`Open ${node.label} output`}
          className="outputs-graph-node-expand"
          onClick={(event) => {
            event.stopPropagation()
            onOpenOutput(node.key)
          }}
          title="Open output"
          type="button"
        >
          Open
        </button>
      ) : null}
      <button
        aria-label={`Rerun ${node.label}`}
        className="outputs-graph-node-play"
        disabled={running}
        onClick={(event) => {
          event.stopPropagation()
          if (!running) onRun(node)
        }}
        type="button"
      >
        <span aria-hidden="true" className={running ? 'outputs-graph-mini-spinner' : ''}>
          {running ? '' : 'Run'}
        </span>
      </button>
      {outputPorts.map((port, index) => (
        <Handle
          className={`outputs-graph-handle is-${port.valueType}`}
          id={port.id}
          key={port.id}
          position={Position.Right}
          style={{ top: 38 + index * 22 }}
          type="source"
        />
      ))}
    </div>
  )
}

function OutputWorkflowEdgeView(props: EdgeProps<GraphEdge>) {
  const [edgePath] = getBezierPath(props)
  const data = props.data ?? { valueType: 'text', statusKey: 'queued' }
  return (
    <BaseEdge className={`outputs-graph-edge is-${data.valueType} is-${data.statusKey}`} path={edgePath} markerEnd={props.markerEnd} />
  )
}

const nodeTypes = { outputWorkflow: OutputWorkflowNodeCard }
const edgeTypes = { outputWorkflowEdge: OutputWorkflowEdgeView }

export function OutputWorkflowGraphOverlay({
  workflow,
  nodes,
  edges,
  worldEntities,
  worldRelationships,
  assets,
  activeRun,
  selectedNodeKey,
  canRunOutputs,
  targetedNodeKey,
  targetedNodeKeys = [],
  targetedRunScope,
  runErrorMessage,
  refreshingGraph = false,
  canOpenTimeline = false,
  worldWiki,
  onClose,
  onOpenTimeline,
  onSelectNode,
  onRunNode,
  onRunNodes,
  onRefreshGraph,
  onCancelRun,
  onSaveNode,
  readOutputPreview,
  readNodeSkillKeys,
}: OutputWorkflowGraphOverlayProps) {
  const safeNodes = Array.isArray(nodes) ? nodes : []
  const safeEdges = Array.isArray(edges) ? edges : []
  const safeWorldEntities = Array.isArray(worldEntities) ? worldEntities : []
  const safeWorldRelationships = Array.isArray(worldRelationships) ? worldRelationships : []
  const safeAssets = Array.isArray(assets) ? assets : []
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<GraphNode, GraphEdge> | null>(null)
  const [flowNodes, setFlowNodes] = useState<GraphNode[]>([])
  const [flowEdges, setFlowEdges] = useState<GraphEdge[]>([])
  const [layoutDirty, setLayoutDirty] = useState(false)
  const [savingLayout, setSavingLayout] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [expandedOutputNodeKey, setExpandedOutputNodeKey] = useState<string | null>(null)

  const stepsByNodeKey = useMemo(
    () => new Map((activeRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [activeRun?.steps],
  )
  const assetByKey = useMemo(() => new Map(safeAssets.map((asset) => [asset.key, asset])), [safeAssets])
  const artifactImageUrlByAssetKey = useMemo(() => artifactUrlByAssetKey(activeRun), [activeRun?.artifacts])
  const artifactImageByNodeKeyMap = useMemo(() => artifactImageByNodeKey(activeRun), [activeRun?.artifacts])
  const nodeByKey = useMemo(() => new Map(safeNodes.map((node) => [node.key, node])), [safeNodes])
  const targetedNodeKeySet = useMemo(() => new Set(targetedNodeKeys.length > 0
    ? targetedNodeKeys
    : targetedNodeKey
      ? [targetedNodeKey]
      : []), [targetedNodeKey, targetedNodeKeys])
  const selectedNode = selectedNodeKey ? nodeByKey.get(selectedNodeKey) ?? safeNodes[0] ?? null : safeNodes[0] ?? null
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedCachedOutputSource = selectedNode ? { outputs: selectedNode.outputs } : null
  const selectedCachedOutputPreview = selectedCachedOutputSource
    ? readOutputPreview({ ...selectedCachedOutputSource, errorMessage: null, provider: null, model: null })
    : ''
  const selectedOutputPreview = selectedStep
    ? readOutputPreview(selectedStep) || selectedCachedOutputPreview || readNodeOutputPreview(selectedNode ?? undefined)
    : selectedCachedOutputPreview || readNodeOutputPreview(selectedNode ?? undefined)
  const selectedArtifactImage = selectedNode ? artifactImageByNodeKeyMap.get(selectedNode.key) ?? null : null
  const selectedPreviewAssetKey = readStringArray(readRecord(readRecord(selectedNode?.metadata).outputPreview).assetKeys)[0]
  const selectedImageAssetKey = imageOutputAssetKey(selectedStep)
    || imageOutputAssetKey(selectedCachedOutputSource)
    || selectedPreviewAssetKey
    || selectedArtifactImage?.assetKey
  const selectedImageAsset = selectedImageAssetKey
    ? safeAssets.find((asset) => asset.key === selectedImageAssetKey) ?? null
    : null
  const selectedImageUrl = resolveAssetSourceUrl(selectedImageAsset)
    || (selectedImageAssetKey ? artifactImageUrlByAssetKey.get(selectedImageAssetKey) ?? null : null)
    || selectedArtifactImage?.url
  const selectedGuidance = selectedNode ? buildOutputGuidanceBundleForNode({ node: selectedNode, worldWiki }) : null
  const selectedProviderBacked = selectedNode ? isOutputWorkflowProviderBackedNodeType(selectedNode.nodeType) : false
  const [promptDraft, setPromptDraft] = useState('')
  const executionPlan = useMemo(() => buildOutputWorkflowExecutionPlan(safeNodes, safeEdges), [safeNodes, safeEdges])
  const worldContextNode = useMemo(
    () => safeNodes.find((node) => node.nodeType === 'world_context_query') ?? null,
    [safeNodes],
  )
  const selectedNodeConfig = selectedNode ? readRecord(selectedNode.config) : {}
  const selectedSequenceUnitKey = readTrimmedString(selectedNodeConfig.sequenceUnitKey)
    || readStringArray(readRecord(selectedStep?.outputs).sourceSequenceUnitKeys)[0]
  const selectedSequenceUnit = selectedSequenceUnitKey
    ? safeWorldEntities.find((entity) => readTrimmedString(entity.key) === selectedSequenceUnitKey) ?? null
    : null
  const selectedSequence = sequenceRecordFromEntity(selectedSequenceUnit)
  const worldContextConfig = readRecord(worldContextNode?.config)
  const sourceEntityKeys = readStringArray(worldContextConfig.sourceEntityKeys)
  const sourceSequenceUnitKeys = readStringArray(worldContextConfig.sourceSequenceUnitKeys)
  const selectedIncomingEdges = selectedNode
    ? safeEdges.filter((edge) => edge.targetNodeKey === selectedNode.key)
    : []
  const selectedOutgoingEdges = selectedNode
    ? safeEdges.filter((edge) => edge.sourceNodeKey === selectedNode.key)
    : []
  const hasAvailableNodeOutput = (node: OutputWorkflowNode | undefined) => {
    if (!node) return false
    if (hasCachedNodeOutput(node)) return true
    if (readNodeOutputPreview(node)) return true
    const step = stepsByNodeKey.get(node.key)
    if (Object.keys(readRecord(step?.outputs)).length > 0) return true
    return Boolean(artifactImageByNodeKeyMap.get(node.key))
  }
  const missingCachedInputKeysForNode = (node: OutputWorkflowNode) => safeEdges
    .filter((edge) => edge.targetNodeKey === node.key)
    .filter((edge) => {
      const metadata = readRecord(edge.metadata)
      const optionalV2VideoAssetPack = edge.sourceNodeKey.startsWith('cinematic_v2_shot_')
        && edge.sourceNodeKey.endsWith('_asset_pack')
        && edge.targetNodeKey.startsWith('cinematic_v2_shot_')
        && edge.targetNodeKey.endsWith('_video')
        && edge.targetPort === 'references'
      return metadata.optional !== true && !optionalV2VideoAssetPack && !hasAvailableNodeOutput(nodeByKey.get(edge.sourceNodeKey))
    })
    .map((edge) => edge.sourceNodeKey)
  const selectedMissingCachedInputs = selectedNode ? missingCachedInputKeysForNode(selectedNode) : []
  const selectedDirtyCachedInputs = selectedIncomingEdges
    .map((edge) => nodeByKey.get(edge.sourceNodeKey))
    .filter((node): node is OutputWorkflowNode => Boolean(node?.dirty && hasAvailableNodeOutput(node)))
    .map((node) => node.key)
  const selectedCacheLabel = selectedIncomingEdges.length === 0
    ? 'No upstream cache required'
    : selectedMissingCachedInputs.length > 0
      ? `Missing upstream: ${selectedMissingCachedInputs.join(', ')}. Run upstream to this node first.`
      : selectedDirtyCachedInputs.length > 0
        ? `Upstream dirty but reusable: ${selectedDirtyCachedInputs.join(', ')}`
        : 'Ready from cache'
  const selectedDefaultRunScope = selectedNode && (selectedMissingCachedInputs.length > 0 || selectedDirtyCachedInputs.length > 0)
    ? 'upstream_to_node'
    : selectedNode
      ? defaultRunScopeForNode(selectedNode)
      : 'node_only'
  const selectedPreviewRunId = readTrimmedString(readRecord(readRecord(selectedNode?.metadata).execution).lastRunId)
  const selectedStepRunMode = readTrimmedString(readRecord(selectedStep?.metadata).runScope) || readTrimmedString(readRecord(activeRun?.metadata).runScope)
  const selectedNodeIsTargeted = selectedNode ? targetedNodeKeySet.has(selectedNode.key) : false
  const selectedRunScopeLabel = targetedRunScope ? formatStatus(targetedRunScope) : ''
  const selectedNodeCanOpenTimeline = canOpenTimeline && Boolean(onOpenTimeline) && isCinematicV2TimelineNode(selectedNode)
  const selectedExecution = selectedNode ? getOutputWorkflowNodeExecutionMetadata(selectedNode) : null
  const readyImageBatchNodes = selectedNode?.nodeType === 'image_generation'
    ? safeNodes.filter((node) => {
        if (node.nodeType !== 'image_generation') return false
        const execution = getOutputWorkflowNodeExecutionMetadata(node)
        if (selectedExecution?.groupKey && execution.groupKey !== selectedExecution.groupKey) return false
        if (!selectedExecution?.groupKey && node.key !== selectedNode.key) return false
        return missingCachedInputKeysForNode(node).length === 0
      })
    : []
  const selectedSourceEntities = sourceEntityKeys
    .map((key) => safeWorldEntities.find((entity) => readTrimmedString(entity.key) === key))
    .filter((entity): entity is Record<string, unknown> => Boolean(entity))
  const selectedSourceSequenceUnits = sourceSequenceUnitKeys
    .map((key) => safeWorldEntities.find((entity) => readTrimmedString(entity.key) === key))
    .filter((entity): entity is Record<string, unknown> => Boolean(entity))
  const expandedOutputNode = expandedOutputNodeKey ? nodeByKey.get(expandedOutputNodeKey) ?? null : null
  const expandedOutputStep = expandedOutputNode ? stepsByNodeKey.get(expandedOutputNode.key) ?? null : null
  const expandedCachedOutputSource = expandedOutputNode ? { outputs: expandedOutputNode.outputs } : null
  const expandedCachedOutputPreview = expandedCachedOutputSource
    ? readOutputPreview({ ...expandedCachedOutputSource, errorMessage: null, provider: null, model: null })
    : ''
  const expandedOutputPreview = expandedOutputStep
    ? readOutputPreview(expandedOutputStep) || expandedCachedOutputPreview
    : expandedCachedOutputPreview
  const expandedArtifactImage = expandedOutputNode ? artifactImageByNodeKeyMap.get(expandedOutputNode.key) ?? null : null
  const expandedImageAssetKey = imageOutputAssetKey(expandedOutputStep)
    || imageOutputAssetKey(expandedCachedOutputSource)
    || expandedArtifactImage?.assetKey
  const expandedImageAsset = expandedImageAssetKey ? assetByKey.get(expandedImageAssetKey) ?? null : null
  const expandedImageUrl = resolveAssetSourceUrl(expandedImageAsset)
    || (expandedImageAssetKey ? artifactImageUrlByAssetKey.get(expandedImageAssetKey) ?? null : null)
    || expandedArtifactImage?.url

  useEffect(() => {
    setPromptDraft(selectedNode ? readTrimmedString(selectedNode.inputs.prompt) : '')
  }, [selectedNode?.id, selectedNode?.inputs.prompt])

  useEffect(() => {
    if (!expandedOutputNodeKey) return undefined
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpandedOutputNodeKey(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedOutputNodeKey])

  useEffect(() => {
    const sourceByKey = new Map(safeNodes.map((node) => [node.key, node]))
    const visibleEdges = safeEdges.filter((edge) => {
      const sourceNode = sourceByKey.get(edge.sourceNodeKey)
      const targetNode = sourceByKey.get(edge.targetNodeKey)
      return sourceNode?.nodeType !== 'skill_context_query' && targetNode?.nodeType !== 'skill_context_query'
    })
    const shouldUseDerivedLayout = !layoutDirty && hasOverlappingNodePositions(safeNodes)
    const derivedPositions = shouldUseDerivedLayout
      ? buildOutputWorkflowLevelLayout({
          nodes: safeNodes,
          edges: safeEdges,
          nodeWidth: NODE_WIDTH,
          nodeHeight: NODE_HEIGHT,
          columnGap: 260,
          rowGap: 96,
        })
      : null
    const inputPortsByNodeKey = new Map<string, Array<{ id: string; valueType: string }>>()
    const outputPortsByNodeKey = new Map<string, Array<{ id: string; valueType: string }>>()
    for (const edge of visibleEdges) {
      const sourceNode = sourceByKey.get(edge.sourceNodeKey)
      const valueType = resolveEdgeValueType(edge, sourceNode)
      appendUniquePort(outputPortsByNodeKey, edge.sourceNodeKey, { id: edge.sourcePort, valueType })
      appendUniquePort(inputPortsByNodeKey, edge.targetNodeKey, { id: edge.targetPort, valueType })
    }
    setFlowNodes((current) => {
      const localPositionByKey = new Map(current.map((node) => [node.id, node.position]))
      return safeNodes.map((node) => {
        const step = stepsByNodeKey.get(node.key) ?? null
        const cachedOutputSource = { outputs: node.outputs }
        const statusKey = step
          ? outputWorkflowStepStatusKey(step)
          : hasCachedNodeOutput(node) && !node.dirty
            ? 'completed'
            : outputWorkflowStepStatusKey(step)
        const artifactImage = artifactImageByNodeKeyMap.get(node.key) ?? null
        const previewAssetKey = readStringArray(readRecord(readRecord(node.metadata).outputPreview).assetKeys)[0]
        const imageAssetKey = imageOutputAssetKey(step) || imageOutputAssetKey(cachedOutputSource) || previewAssetKey || artifactImage?.assetKey
        const imageUrl = imageAssetKey
          ? resolveAssetSourceUrl(assetByKey.get(imageAssetKey)) || artifactImageUrlByAssetKey.get(imageAssetKey) || artifactImage?.url || null
          : artifactImage?.url ?? null
        const imageSize = readImageOutputSize(step) ?? readImageOutputSize(cachedOutputSource) ?? artifactImage?.size ?? null
        const dimensions = graphNodeDimensions(node, imageSize)
        const outputPreview = readOutputPreview(step)
          || readOutputPreview({ ...cachedOutputSource, errorMessage: null, provider: null, model: null })
          || readNodeOutputPreview(node)
        const hasOutput = Boolean(imageUrl || outputPreview || step?.errorMessage)
        return {
          id: node.key,
          type: 'outputWorkflow',
          position: layoutDirty
            ? localPositionByKey.get(node.key) ?? node.position
            : derivedPositions?.get(node.key) ?? node.position,
          width: dimensions.width,
          height: dimensions.height,
          data: {
            node,
            step,
            statusKey,
            outputPreview,
            imageUrl,
            imageSize,
            hasOutput,
            skillKeys: readNodeSkillKeys(node),
            inputPorts: inputPortsByNodeKey.get(node.key) ?? [],
            outputPorts: outputPortsByNodeKey.get(node.key) ?? [],
            selected: selectedNodeKey === node.key,
            running: targetedNodeKeySet.has(node.key) || statusKey === 'running',
            onSelect: onSelectNode,
            onRun: onRunNode,
            onOpenOutput: setExpandedOutputNodeKey,
          },
        }
      })
    })
    setFlowEdges(visibleEdges.map((edge) => {
      const sourceNode = sourceByKey.get(edge.sourceNodeKey)
      const targetStep = stepsByNodeKey.get(edge.targetNodeKey) ?? null
      const valueType = resolveEdgeValueType(edge, sourceNode)
      return {
        id: edge.key,
        type: 'outputWorkflowEdge',
        source: edge.sourceNodeKey,
        target: edge.targetNodeKey,
        sourceHandle: edge.sourcePort,
        targetHandle: edge.targetPort,
        data: {
          valueType,
          statusKey: outputWorkflowStepStatusKey(targetStep),
        },
      }
    }))
  }, [safeNodes, safeEdges, stepsByNodeKey, selectedNodeKey, targetedNodeKeySet, layoutDirty, onRunNode, onSelectNode, readNodeSkillKeys, readOutputPreview, assetByKey, artifactImageUrlByAssetKey])

  async function applyAutoLayout(persist = false) {
    setGraphError(null)
    try {
      const fallbackPositions = buildOutputWorkflowLevelLayout({
        nodes: safeNodes,
        edges: safeEdges,
        nodeWidth: NODE_WIDTH,
        nodeHeight: NODE_HEIGHT,
        columnGap: 280,
        rowGap: 104,
      })
      let nextPositions = fallbackPositions
      try {
        const elkModule = await import('elkjs/lib/elk.bundled.js')
        const Elk = elkModule.default
        const graph = await new Elk().layout({
          id: 'output-workflow',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': '240',
            'elk.spacing.nodeNode': '96',
            'elk.layered.spacing.edgeNodeBetweenLayers': '72',
            'elk.layered.spacing.edgeEdgeBetweenLayers': '36',
          },
          children: safeNodes.map((node) => {
            const step = stepsByNodeKey.get(node.key) ?? null
            const imageSize = readImageOutputSize(step) ?? readImageOutputSize({ outputs: node.outputs })
            const dimensions = graphNodeDimensions(node, imageSize)
            return {
              id: node.key,
              width: dimensions.width,
              height: dimensions.height,
            }
          }),
          edges: safeEdges.map((edge) => ({
            id: edge.key,
            sources: [edge.sourceNodeKey],
            targets: [edge.targetNodeKey],
          })),
        })
        nextPositions = new Map((graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]))
      } catch (elkError) {
        console.warn('[GraphCore] ELK layout unavailable; using dependency-level output workflow layout.', elkError)
      }
      const nextNodes = flowNodes.map((node) => ({
        ...node,
        position: nextPositions.get(node.id) ?? node.position,
      }))
      setFlowNodes(nextNodes)
      setLayoutDirty(!persist)
      window.setTimeout(() => flowInstance?.fitView({ padding: 0.18, duration: 240 }), 40)
      if (persist) await saveLayout(nextNodes)
    } catch (layoutError) {
      setGraphError(layoutError instanceof Error ? layoutError.message : 'Could not auto-layout workflow graph.')
    }
  }

  async function saveLayout(sourceNodes = flowNodes) {
    setSavingLayout(true)
    setGraphError(null)
    try {
      const currentByKey = new Map(safeNodes.map((node) => [node.key, node.position]))
      const changed = sourceNodes.filter((node) => {
        const current = currentByKey.get(node.id)
        return !current || Math.round(current.x) !== Math.round(node.position.x) || Math.round(current.y) !== Math.round(node.position.y)
      })
      for (const node of changed) {
        await onSaveNode({
          workflowId: workflow.id,
          nodeKey: node.id,
          position: {
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
          },
        })
      }
      setLayoutDirty(false)
    } catch (saveError) {
      setGraphError(saveError instanceof Error ? saveError.message : 'Could not save workflow layout.')
    } finally {
      setSavingLayout(false)
    }
  }

  async function savePrompt() {
    if (!selectedNode) return
    setSavingPrompt(true)
    setGraphError(null)
    try {
      await onSaveNode({
        workflowId: workflow.id,
        nodeKey: selectedNode.key,
        inputs: { prompt: promptDraft },
      })
    } catch (saveError) {
      setGraphError(saveError instanceof Error ? saveError.message : 'Could not save node prompt.')
    } finally {
      setSavingPrompt(false)
    }
  }

  function onNodesChange(changes: NodeChange<GraphNode>[]) {
    setFlowNodes((current) => applyNodeChanges(changes, current))
    if (changes.some((change) => change.type === 'position' && (change.dragging === false || change.position))) {
      setLayoutDirty(true)
    }
  }

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const step of activeRun?.steps ?? []) {
      const key = outputWorkflowStepStatusKey(step)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [activeRun?.steps])
  const runProgress = useMemo(() => {
    const steps = activeRun?.steps ?? []
    const completedSteps = steps.filter((step) => {
      const status = outputWorkflowStepStatusKey(step)
      return status === 'completed' || status === 'skipped'
    }).length
    const isCompletedRun = activeRun?.status === 'completed'
    const total = steps.length > 0 ? steps.length : nodes.length > 0 ? nodes.length : isCompletedRun ? 1 : 0
    const completed = steps.length > 0 ? completedSteps : isCompletedRun ? total : 0
    const running = steps.filter((step) => outputWorkflowStepStatusKey(step) === 'running').length
    const failed = steps.filter((step) => outputWorkflowStepStatusKey(step) === 'failed').length
    return {
      completed,
      failed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      running,
      total,
    }
  }, [activeRun?.status, activeRun?.steps, nodes.length])
  const executionPlanLabel = executionPlan.levels.length
    ? `${executionPlan.levels.length} levels`
    : activeRun
      ? refreshingGraph
        ? 'Updating graph'
        : 'Workflow status only'
      : 'No plan'

  return (
    <div className="outputs-graph-overlay" role="dialog" aria-modal="true" aria-label="Output workflow graph">
      <header className="outputs-graph-toolbar">
        <div>
          <span>Output workflow</span>
          <strong>{workflow.name}</strong>
        </div>
        <div className="outputs-graph-run-status">
          {activeRun ? <span>{formatStatus(activeRun.status)}</span> : <span>Not run</span>}
          <span className="outputs-graph-progress-label">
            <b>{runProgress.completed}/{runProgress.total || 0}</b> steps complete
            {runProgress.running > 0 ? <small>{runProgress.running} running</small> : null}
            {runProgress.failed > 0 ? <small>{runProgress.failed} failed</small> : null}
          </span>
          <span
            aria-label={`${runProgress.completed} of ${runProgress.total || 0} workflow steps complete`}
            className="outputs-graph-progress"
          >
            <i style={{ ['--progress' as string]: `${runProgress.percent}%` }} />
          </span>
          <small>
            {executionPlanLabel}
            {executionPlan.diagnostics.length > 0 ? ` · ${executionPlan.diagnostics.length} diagnostics` : ''}
          </small>
        </div>
        <div className="outputs-graph-toolbar-actions">
          <button disabled={refreshingGraph} onClick={onRefreshGraph} type="button">
            {refreshingGraph ? 'Refreshing...' : 'Refresh'}
          </button>
          {canOpenTimeline && onOpenTimeline ? (
            <button onClick={onOpenTimeline} type="button">Timeline</button>
          ) : null}
          <button onClick={() => flowInstance?.fitView({ padding: 0.18, duration: 240 })} type="button">Fit</button>
          <button onClick={() => void applyAutoLayout(false)} type="button">Auto layout</button>
          <button disabled={!layoutDirty || savingLayout} onClick={() => void saveLayout()} type="button">
            {savingLayout ? 'Saving...' : 'Save layout'}
          </button>
          {activeRun && !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(activeRun.status) ? (
            <button className="outputs-graph-danger" onClick={onCancelRun} type="button"><span aria-hidden="true">×</span>Cancel run</button>
          ) : null}
          <button className="outputs-graph-exit" onClick={onClose} type="button">Exit</button>
        </div>
      </header>
      {graphError || runErrorMessage ? <p className="outputs-graph-error">{graphError || runErrorMessage}</p> : null}
      <div className="outputs-graph-shell">
        <div className="outputs-graph-canvas">
          <ReactFlow
            colorMode="dark"
            edges={flowEdges}
            edgeTypes={edgeTypes}
            fitView
            nodes={flowNodes}
            nodeTypes={nodeTypes}
            nodesDraggable
            onInit={setFlowInstance}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            onNodesChange={onNodesChange}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(148, 163, 184, 0.16)" gap={24} />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(node) => {
              const status = (node.data as GraphNodeData | undefined)?.statusKey
              if (status === 'completed' || status === 'skipped') return '#34d399'
              if (status === 'running') return '#60a5fa'
              if (status === 'failed' || status === 'blocked' || status === 'cancelled') return '#f87171'
              return '#64748b'
            }} />
          </ReactFlow>
        </div>
        <aside className="outputs-graph-inspector">
          {selectedNode ? (
            <>
              <div className="outputs-graph-inspector-head">
                <span className={`outputs-status-icon is-${outputWorkflowStepStatusKey(selectedStep)}`} aria-hidden="true" />
                <div>
                  <strong>{selectedNode.label}</strong>
                  <span>{outputWorkflowNodeRegistry[selectedNode.nodeType].label}</span>
                </div>
                <button
                  disabled={!canRunOutputs || selectedNodeIsTargeted}
                  onClick={() => onRunNode(selectedNode, selectedDefaultRunScope)}
                  type="button"
                >
                  {selectedNodeIsTargeted
                    ? 'Starting...'
                    : selectedDefaultRunScope === 'upstream_to_node'
                      ? 'Run With Upstream'
                      : selectedNodeRunLabel(selectedNode)}
                </button>
              </div>
              <section className="outputs-graph-inspector-section">
                <strong>Local run</strong>
                {selectedNodeIsTargeted ? (
                  <div className="outputs-graph-run-progress">
                    <span className="outputs-graph-mini-spinner" aria-hidden="true" />
                    <p>{selectedRunScopeLabel || 'Targeted run'} is {activeRun?.status === 'queued' ? 'queued' : 'running'} for this node.</p>
                  </div>
                ) : null}
                <p className={`outputs-graph-cache-note ${selectedMissingCachedInputs.length > 0 ? 'is-missing' : selectedDirtyCachedInputs.length > 0 ? 'is-stale' : 'is-ready'}`}>
                  {selectedCacheLabel}
                </p>
                <div className="outputs-graph-run-actions">
                  {selectedNodeCanOpenTimeline && onOpenTimeline ? (
                    <button onClick={onOpenTimeline} type="button">Open Timeline</button>
                  ) : null}
                  {selectedMissingCachedInputs.length > 0 ? (
                    <button
                      disabled={!canRunOutputs || selectedNodeIsTargeted}
                      onClick={() => onRunNode(selectedNode, 'upstream_to_node')}
                      type="button"
                    >
                      Repair Cached Inputs
                    </button>
                  ) : null}
                  <button
                    disabled={!canRunOutputs || selectedNodeIsTargeted || selectedMissingCachedInputs.length > 0}
                    onClick={() => onRunNode(selectedNode, 'node_only')}
                    type="button"
                  >
                    {localRunButtonLabel({
                      label: 'Run cached node only',
                      scope: 'node_only',
                      targetedNode: selectedNodeIsTargeted,
                      targetedScope: targetedRunScope,
                      activeRunStatus: activeRun?.status,
                    })}
                  </button>
                  {readyImageBatchNodes.length > 1 ? (
                    <button
                      disabled={!canRunOutputs || readyImageBatchNodes.some((node) => targetedNodeKeySet.has(node.key))}
                      onClick={() => onRunNodes(readyImageBatchNodes, 'node_only')}
                      type="button"
                    >
                      {readyImageBatchNodes.some((node) => targetedNodeKeySet.has(node.key))
                        ? 'Running image batch...'
                        : `Run ${readyImageBatchNodes.length} Image Nodes`}
                    </button>
                  ) : null}
                  <button
                    disabled={!canRunOutputs || selectedNodeIsTargeted}
                    onClick={() => onRunNode(selectedNode, 'upstream_to_node')}
                    type="button"
                  >
                    {localRunButtonLabel({
                      label: 'Run Up To Node',
                      scope: 'upstream_to_node',
                      targetedNode: selectedNodeIsTargeted,
                      targetedScope: targetedRunScope,
                      activeRunStatus: activeRun?.status,
                    })}
                  </button>
                  <button
                    disabled={!canRunOutputs || selectedNodeIsTargeted}
                    onClick={() => onRunNode(selectedNode, 'node_and_downstream')}
                    type="button"
                  >
                    {localRunButtonLabel({
                      label: 'Run Node + Dependents',
                      scope: 'node_and_downstream',
                      targetedNode: selectedNodeIsTargeted,
                      targetedScope: targetedRunScope,
                      activeRunStatus: activeRun?.status,
                    })}
                  </button>
                  {selectedNode.nodeType === 'document_render' || selectedNode.nodeType === 'output_artifact' ? (
                    <button
                      disabled={!canRunOutputs || selectedNodeIsTargeted}
                      onClick={() => onRunNode(selectedNode, 'artifact_rebake')}
                      type="button"
                    >
                      {localRunButtonLabel({
                        label: 'Rebake Artifact',
                        scope: 'artifact_rebake',
                        targetedNode: selectedNodeIsTargeted,
                        targetedScope: targetedRunScope,
                        activeRunStatus: activeRun?.status,
                      })}
                    </button>
                  ) : null}
                </div>
              </section>
              <section className="outputs-graph-inspector-section">
                <strong>Node binding</strong>
                <dl className="outputs-graph-binding-list">
                  <div>
                    <dt>Purpose</dt>
                    <dd>{readTrimmedString(selectedNodeConfig.purpose) || selectedNode.nodeType.replace(/_/g, ' ')}</dd>
                  </div>
                  {selectedNodeConfig.chapterNumber ? (
                    <div>
                      <dt>Chapter</dt>
                      <dd>{formatConfigValue(selectedNodeConfig.chapterNumber)}</dd>
                    </div>
                  ) : null}
                  {selectedSequenceUnitKey ? (
                    <div>
                      <dt>Sequence unit</dt>
                      <dd>{readTrimmedString(selectedNodeConfig.sequenceUnitName) || readTrimmedString(selectedSequenceUnit?.name) || selectedSequenceUnitKey} <small>{selectedSequenceUnitKey}</small></dd>
                    </div>
                  ) : null}
                  {readTrimmedString(selectedSequence.povCharacterName) || readTrimmedString(selectedSequence.povCharacterKey) ? (
                    <div>
                      <dt>POV character</dt>
                      <dd>{readTrimmedString(selectedSequence.povCharacterName) || readTrimmedString(selectedSequence.povCharacterKey)}</dd>
                    </div>
                  ) : null}
                  {readTrimmedString(selectedSequence.povNotes) ? (
                    <div>
                      <dt>POV notes</dt>
                      <dd>{readTrimmedString(selectedSequence.povNotes)}</dd>
                    </div>
                  ) : null}
                  {selectedIncomingEdges.length > 0 ? (
                    <div>
                      <dt>Inputs</dt>
                      <dd>{selectedIncomingEdges.map((edge) => `${edge.sourceNodeKey}.${edge.sourcePort} -> ${edge.targetPort}`).join(', ')}</dd>
                    </div>
                  ) : null}
                  {selectedOutgoingEdges.length > 0 ? (
                    <div>
                      <dt>Outputs</dt>
                      <dd>{selectedOutgoingEdges.map((edge) => `${edge.sourcePort} -> ${edge.targetNodeKey}.${edge.targetPort}`).join(', ')}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
              {selectedSequenceUnit ? (
                <section className="outputs-graph-inspector-section">
                  <strong>Sequence context</strong>
                  <div className="outputs-graph-context-preview">
                    <h4>{readTrimmedString(selectedSequenceUnit.name) || selectedSequenceUnitKey}</h4>
                    {readTrimmedString(selectedSequenceUnit.summary) ? <p>{readTrimmedString(selectedSequenceUnit.summary)}</p> : null}
                    {readTrimmedString(selectedSequenceUnit.context) ? <p>{readTrimmedString(selectedSequenceUnit.context)}</p> : null}
                    {readTrimmedString(selectedSequence.synopsis) ? <p><b>Synopsis:</b> {readTrimmedString(selectedSequence.synopsis)}</p> : null}
                    {readTrimmedString(selectedSequence.dramaticQuestion) ? <p><b>Dramatic question:</b> {readTrimmedString(selectedSequence.dramaticQuestion)}</p> : null}
                    {readTrimmedString(selectedSequence.outcome) ? <p><b>Outcome:</b> {readTrimmedString(selectedSequence.outcome)}</p> : null}
                    {readStringArray(selectedSequence.consequences).length > 0 ? <p><b>Consequences:</b> {readStringArray(selectedSequence.consequences).join('; ')}</p> : null}
                    {readStringArray(selectedSequence.characterArcDeltas).length > 0 ? <p><b>Character arc:</b> {readStringArray(selectedSequence.characterArcDeltas).join('; ')}</p> : null}
                  </div>
                </section>
              ) : null}
              <section className="outputs-graph-inspector-section">
                <strong>World context available</strong>
                <div className="outputs-graph-context-preview">
                  <p>{selectedSourceSequenceUnits.length} sequence units, {selectedSourceEntities.length} entities, {safeWorldRelationships.length} relationships available through the world context node.</p>
                  {selectedSourceEntities.length > 0 ? (
                    <p><b>Entity anchors:</b> {selectedSourceEntities.slice(0, 12).map((entity) => readTrimmedString(entity.name) || readTrimmedString(entity.key)).join('; ')}{selectedSourceEntities.length > 12 ? `; +${selectedSourceEntities.length - 12} more` : ''}</p>
                  ) : null}
                  {selectedSourceSequenceUnits.length > 0 ? (
                    <p><b>Sequence spine:</b> {selectedSourceSequenceUnits.slice(0, 12).map((entity) => readTrimmedString(entity.name) || readTrimmedString(entity.key)).join('; ')}{selectedSourceSequenceUnits.length > 12 ? `; +${selectedSourceSequenceUnits.length - 12} more` : ''}</p>
                  ) : null}
                </div>
              </section>
              {selectedProviderBacked ? (
                <section className="outputs-graph-inspector-section">
                  <div className="outputs-graph-section-head">
                    <strong>User brief override</strong>
                    <button disabled={savingPrompt || promptDraft === readTrimmedString(selectedNode.inputs.prompt)} onClick={() => void savePrompt()} type="button">
                      {savingPrompt ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <p>This is only the editable user brief. The worker also injects the node binding above, upstream chapter plan, world context, POV contract, and Output Skills into the effective provider prompt.</p>
                  <textarea
                    aria-label="Selected output node prompt"
                    value={promptDraft}
                    onChange={(event) => setPromptDraft(event.target.value)}
                    rows={8}
                  />
                </section>
              ) : (
                <section className="outputs-graph-inspector-section">
                  <strong>Node contract</strong>
                  <p>{outputWorkflowNodeRegistry[selectedNode.nodeType].description}</p>
                </section>
              )}
              <section className="outputs-graph-inspector-section">
                <strong>Latest node output</strong>
                <p>
                  {selectedStep
                    ? `From current run${selectedStepRunMode ? ` (${formatStatus(selectedStepRunMode)})` : ''}.`
                    : selectedPreviewRunId
                      ? `Cached from run ${selectedPreviewRunId}.`
                      : 'No output has been generated for this node yet.'}
                </p>
                {selectedStep?.errorMessage ? <p className="outputs-error">{selectedStep.errorMessage}</p> : null}
                {selectedImageUrl ? <img className="outputs-graph-image-preview" src={selectedImageUrl} alt={`${selectedNode.label} output`} loading="lazy" /> : null}
                {selectedOutputPreview ? <pre>{selectedOutputPreview}</pre> : <p>No persisted output for this node yet.</p>}
              </section>
              <section className="outputs-graph-inspector-section">
                <strong>Guidance</strong>
                {selectedGuidance?.skillKeys.length ? (
                  <div className="outputs-skill-chips">
                    {selectedGuidance.skillKeys.map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                  </div>
                ) : <p>No explicit skills on this node.</p>}
                {selectedGuidance?.resolvedGuidancePreview ? <p>{selectedGuidance.resolvedGuidancePreview}</p> : null}
              </section>
              <section className="outputs-graph-inspector-section">
                <strong>Metadata</strong>
                <pre>{JSON.stringify({
                  key: selectedNode.key,
                  type: selectedNode.nodeType,
                  dirty: selectedNode.dirty,
                  inputHash: selectedStep?.inputHash || selectedNode.inputHash,
                  outputHash: selectedStep?.outputHash || selectedNode.outputHash,
                  provider: selectedStep?.provider ?? null,
                  model: selectedStep?.model ?? null,
                  providerRequestId: selectedStep?.providerRequestId ?? null,
                  providerStatus: providerStatus(selectedStep) || null,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(selectedNode).resourceClass,
                }, null, 2)}</pre>
              </section>
            </>
          ) : (
            <p>Select a workflow node to inspect prompt, guidance, outputs, and provider metadata.</p>
          )}
        </aside>
      </div>
      <footer className="outputs-graph-timeline">
        {['running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped', 'queued'].map((status) => (
          <span className={`is-${status}`} key={status}>{formatStatus(status)} {statusCounts.get(status) ?? 0}</span>
        ))}
        {activeRun?.steps.slice(0, 18).map((step) => (
          <button className={`is-${outputWorkflowStepStatusKey(step)}`} key={step.id} onClick={() => onSelectNode(step.nodeKey)} type="button">
            <span className={`outputs-status-icon is-${outputWorkflowStepStatusKey(step)}`} aria-hidden="true" />
            {step.label}
          </button>
        ))}
      </footer>
      {expandedOutputNode ? (
        <div
          className="outputs-node-output-modal-backdrop"
          onClick={() => setExpandedOutputNodeKey(null)}
          role="presentation"
        >
          <section
            aria-label={`${expandedOutputNode.label} output`}
            aria-modal="true"
            className={expandedImageUrl ? 'outputs-node-output-modal has-image' : 'outputs-node-output-modal'}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span>{outputWorkflowNodeRegistry[expandedOutputNode.nodeType].label}</span>
                <strong>{expandedOutputNode.label}</strong>
              </div>
              <button onClick={() => setExpandedOutputNodeKey(null)} type="button" aria-label="Close output preview">Close</button>
            </header>
            {expandedOutputStep?.errorMessage ? <p className="outputs-error">{expandedOutputStep.errorMessage}</p> : null}
            {expandedImageUrl ? (
              <div className="outputs-node-output-image-shell">
                <img src={expandedImageUrl} alt={`${expandedOutputNode.label} output`} />
              </div>
            ) : null}
            {!expandedImageUrl && expandedOutputPreview ? (
              <pre>{expandedOutputPreview}</pre>
            ) : !expandedImageUrl ? (
              <p className="outputs-muted">No persisted output is available for this node yet.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
