import {
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
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

import { resolveAssetSourceUrl } from '../../domain/assets'
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
  type OutputWorkflowRunStep,
} from '../../domain/outputWorkflow'
import {
  buildOutputWorkflowLevelLayout,
  outputWorkflowStepStatusKey,
} from '../../domain/outputWorkflowGraphView'

const NODE_WIDTH = 306
const NODE_HEIGHT = 184
const IMAGE_NODE_MAX_HEIGHT = 280
const IMAGE_NODE_MIN_WIDTH = 160
const IMAGE_NODE_MAX_WIDTH = 360

type GraphNodeData = {
  node: OutputWorkflowNode
  step: OutputWorkflowRunStep | null
  statusKey: string
  outputPreview: string
  imageUrl: string | null
  imageSize: { width: number; height: number } | null
  skillKeys: string[]
  inputPorts: Array<{ id: string; valueType: string }>
  outputPorts: Array<{ id: string; valueType: string }>
  selected: boolean
  running: boolean
  onSelect: (nodeKey: string) => void
  onRun: (node: OutputWorkflowNode) => void
}

type GraphEdgeData = {
  label: string
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
  worldWiki: unknown
  onClose: () => void
  onSelectNode: (nodeKey: string) => void
  onRunNode: (node: OutputWorkflowNode) => void
  onCancelRun: () => void
  onSaveNode: (request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
  }) => Promise<unknown>
  readOutputPreview: (step: OutputWorkflowRunStep | null | undefined) => string
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

function providerStatus(step: OutputWorkflowRunStep | null | undefined) {
  const metadata = readRecord(step?.metadata)
  return readTrimmedString(metadata.providerStatus) || readTrimmedString(step?.status)
}

function imageOutputAssetKey(step: OutputWorkflowRunStep | null | undefined) {
  const outputs = readRecord(step?.outputs)
  const image = readRecord(outputs.image)
  return readTrimmedString(image.assetKey) || readTrimmedString(outputs.assetKey)
}

function readImageOutputSize(step: OutputWorkflowRunStep | null | undefined) {
  const outputs = readRecord(step?.outputs)
  const image = readRecord(outputs.image)
  const width = Number(image.width ?? outputs.width)
  const height = Number(image.height ?? outputs.height)
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null
}

function graphNodeDimensions(node: OutputWorkflowNode, step: OutputWorkflowRunStep | null | undefined) {
  const imageSize = readImageOutputSize(step)
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

function nodeDisplaySnippet(input: {
  node: OutputWorkflowNode
  step: OutputWorkflowRunStep | null
  outputPreview: string
}) {
  const config = readRecord(input.node.config)
  const purpose = readTrimmedString(config.purpose)
  const chapterNumber = formatConfigValue(config.chapterNumber)
  const sequenceName = readTrimmedString(config.sequenceUnitName)
  if (purpose === 'chapter_prose') {
    return [chapterNumber ? `Chapter ${chapterNumber}` : '', sequenceName].filter(Boolean).join(': ')
  }
  const prompt = readTrimmedString(input.node.inputs.prompt)
  return prompt || input.outputPreview || outputWorkflowNodeRegistry[input.node.nodeType].description
}

function selectedNodeRunLabel(node: OutputWorkflowNode) {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  if (node.nodeType === 'output_artifact') return 'Rebuild PDF only'
  if (node.nodeType === 'document_render') return 'Refresh document only'
  if (purpose === 'ebook_cover_prompt') return 'Regenerate cover + PDF'
  if (purpose === 'ebook_cover_image') return 'Regenerate cover + PDF'
  if (purpose === 'chapter_prose') return 'Regenerate chapter'
  if (purpose === 'chapter_section_prose') return 'Regenerate section'
  return 'Run node'
}

function mergeGraphPorts(
  registryPorts: Array<{ id: string; valueType: string }>,
  edgePorts: Array<{ id: string; valueType: string }>,
) {
  const ports = new Map<string, { id: string; valueType: string }>()
  for (const port of registryPorts) ports.set(port.id, port)
  for (const port of edgePorts) {
    if (!ports.has(port.id)) ports.set(port.id, port)
  }
  return [...ports.values()]
}

function OutputWorkflowNodeCard({ data }: NodeProps<GraphNode>) {
  const { node, step, statusKey, outputPreview, imageUrl, imageSize, skillKeys, inputPorts, outputPorts, selected, running, onSelect, onRun } = data
  const definition = outputWorkflowNodeRegistry[node.nodeType]
  const execution = getOutputWorkflowNodeExecutionMetadata(node)
  const purpose = readTrimmedString(node.config.purpose)
  const snippet = nodeDisplaySnippet({ node, step, outputPreview })
  const hasImagePreview = node.nodeType === 'image_generation' && Boolean(imageUrl)

  return (
    <button
      className={`outputs-graph-node is-${node.nodeType} is-${statusKey} ${selected ? 'is-selected' : ''} ${hasImagePreview ? 'has-image-output' : ''}`}
      onClick={() => onSelect(node.key)}
      onDoubleClick={() => onSelect(node.key)}
      style={hasImagePreview && imageSize ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}
      type="button"
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
          <img className="outputs-graph-node-image" src={imageUrl ?? ''} alt="" loading="lazy" />
          <div className="outputs-graph-node-image-overlay">
            <span className={`outputs-status-icon is-${statusKey}`} aria-hidden="true" />
            <strong>{node.label}</strong>
            {providerStatus(step) ? <small>{providerStatus(step)}</small> : null}
          </div>
        </>
      ) : (
        <>
          <div className="outputs-graph-node-top">
            <span className={`outputs-status-icon is-${statusKey}`} aria-hidden="true" />
            <span className="outputs-graph-node-kind">{definition.label}</span>
            <span className="outputs-graph-node-resource">{execution.resourceClass}</span>
          </div>
          <strong>{node.label}</strong>
          <span>{purpose || node.nodeType.replace(/_/g, ' ')}</span>
          {providerStatus(step) ? <small>{providerStatus(step)}</small> : null}
          <p>{snippet}</p>
          {skillKeys.length > 0 ? (
            <div className="outputs-graph-skill-row">
              {skillKeys.slice(0, 2).map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
              {skillKeys.length > 2 ? <small>+{skillKeys.length - 2}</small> : null}
            </div>
          ) : null}
        </>
      )}
      <span className="outputs-graph-node-play" aria-label="Rerun node">
        <span
          aria-hidden="true"
          className={running ? 'outputs-graph-mini-spinner' : ''}
          onClick={(event) => {
            event.stopPropagation()
            if (!running) onRun(node)
          }}
        >
          {running ? '' : 'Run'}
        </span>
      </span>
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
    </button>
  )
}

function OutputWorkflowEdgeView(props: EdgeProps<GraphEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props)
  const data = props.data ?? { label: '', valueType: 'text', statusKey: 'queued' }
  return (
    <>
      <BaseEdge className={`outputs-graph-edge is-${data.valueType} is-${data.statusKey}`} path={edgePath} markerEnd={props.markerEnd} />
      <EdgeLabelRenderer>
        <span
          className={`outputs-graph-edge-label is-${data.valueType}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {data.label}
        </span>
      </EdgeLabelRenderer>
    </>
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
  worldWiki,
  onClose,
  onSelectNode,
  onRunNode,
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

  const stepsByNodeKey = useMemo(
    () => new Map((activeRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [activeRun?.steps],
  )
  const assetByKey = useMemo(() => new Map(safeAssets.map((asset) => [asset.key, asset])), [safeAssets])
  const nodeByKey = useMemo(() => new Map(safeNodes.map((node) => [node.key, node])), [safeNodes])
  const selectedNode = selectedNodeKey ? nodeByKey.get(selectedNodeKey) ?? safeNodes[0] ?? null : safeNodes[0] ?? null
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedImageAssetKey = imageOutputAssetKey(selectedStep)
  const selectedImageAsset = selectedImageAssetKey
    ? safeAssets.find((asset) => asset.key === selectedImageAssetKey) ?? null
    : null
  const selectedImageUrl = resolveAssetSourceUrl(selectedImageAsset)
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
  const selectedSourceEntities = sourceEntityKeys
    .map((key) => safeWorldEntities.find((entity) => readTrimmedString(entity.key) === key))
    .filter((entity): entity is Record<string, unknown> => Boolean(entity))
  const selectedSourceSequenceUnits = sourceSequenceUnitKeys
    .map((key) => safeWorldEntities.find((entity) => readTrimmedString(entity.key) === key))
    .filter((entity): entity is Record<string, unknown> => Boolean(entity))

  useEffect(() => {
    setPromptDraft(selectedNode ? readTrimmedString(selectedNode.inputs.prompt) : '')
  }, [selectedNode?.id, selectedNode?.inputs.prompt])

  useEffect(() => {
    const sourceByKey = new Map(safeNodes.map((node) => [node.key, node]))
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
    for (const edge of safeEdges) {
      const sourceNode = sourceByKey.get(edge.sourceNodeKey)
      const valueType = resolveEdgeValueType(edge, sourceNode)
      outputPortsByNodeKey.set(edge.sourceNodeKey, [
        ...(outputPortsByNodeKey.get(edge.sourceNodeKey) ?? []),
        { id: edge.sourcePort, valueType },
      ])
      inputPortsByNodeKey.set(edge.targetNodeKey, [
        ...(inputPortsByNodeKey.get(edge.targetNodeKey) ?? []),
        { id: edge.targetPort, valueType },
      ])
    }
    setFlowNodes((current) => {
      const localPositionByKey = new Map(current.map((node) => [node.id, node.position]))
      return safeNodes.map((node) => {
        const step = stepsByNodeKey.get(node.key) ?? null
        const statusKey = outputWorkflowStepStatusKey(step)
        const definition = outputWorkflowNodeRegistry[node.nodeType]
        const imageAssetKey = imageOutputAssetKey(step)
        const imageUrl = imageAssetKey ? resolveAssetSourceUrl(assetByKey.get(imageAssetKey)) : null
        const imageSize = readImageOutputSize(step)
        const dimensions = graphNodeDimensions(node, step)
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
            outputPreview: readOutputPreview(step).slice(0, 220),
            imageUrl,
            imageSize,
            skillKeys: readNodeSkillKeys(node),
            inputPorts: mergeGraphPorts(definition.inputPorts, inputPortsByNodeKey.get(node.key) ?? []),
            outputPorts: mergeGraphPorts(definition.outputPorts, outputPortsByNodeKey.get(node.key) ?? []),
            selected: selectedNodeKey === node.key,
            running: targetedNodeKey === node.key || statusKey === 'running',
            onSelect: onSelectNode,
            onRun: onRunNode,
          },
        }
      })
    })
    setFlowEdges(safeEdges.map((edge) => {
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
          label: `${edge.sourcePort} -> ${edge.targetPort}`,
          valueType,
          statusKey: outputWorkflowStepStatusKey(targetStep),
        },
      }
    }))
  }, [safeNodes, safeEdges, stepsByNodeKey, selectedNodeKey, targetedNodeKey, layoutDirty, onRunNode, onSelectNode, readNodeSkillKeys, readOutputPreview, assetByKey])

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
            const dimensions = graphNodeDimensions(node, stepsByNodeKey.get(node.key) ?? null)
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

  return (
    <div className="outputs-graph-overlay" role="dialog" aria-modal="true" aria-label="Output workflow graph">
      <header className="outputs-graph-toolbar">
        <div>
          <span>Output workflow</span>
          <strong>{workflow.name}</strong>
        </div>
        <div className="outputs-graph-run-status">
          {activeRun ? <span>{formatStatus(activeRun.status)}</span> : <span>Not run</span>}
          {executionPlan.levels.length ? <small>{executionPlan.levels.length} levels</small> : null}
          {executionPlan.diagnostics.length > 0 ? <small>{executionPlan.diagnostics.length} diagnostics</small> : null}
        </div>
        <div className="outputs-graph-toolbar-actions">
          <button onClick={() => flowInstance?.fitView({ padding: 0.18, duration: 240 })} type="button">Fit</button>
          <button onClick={() => void applyAutoLayout(false)} type="button">Auto layout</button>
          <button disabled={!layoutDirty || savingLayout} onClick={() => void saveLayout()} type="button">
            {savingLayout ? 'Saving...' : 'Save layout'}
          </button>
          {activeRun && !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(activeRun.status) ? (
            <button onClick={onCancelRun} type="button">Cancel</button>
          ) : null}
          <button className="outputs-graph-exit" onClick={onClose} type="button">Exit</button>
        </div>
      </header>
      {graphError ? <p className="outputs-graph-error">{graphError}</p> : null}
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
                  disabled={!canRunOutputs || targetedNodeKey === selectedNode.key}
                  onClick={() => onRunNode(selectedNode)}
                  type="button"
                >
                  {targetedNodeKey === selectedNode.key ? 'Starting...' : selectedNodeRunLabel(selectedNode)}
                </button>
              </div>
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
                <strong>Output</strong>
                {selectedStep?.errorMessage ? <p className="outputs-error">{selectedStep.errorMessage}</p> : null}
                {selectedImageUrl ? <img className="outputs-graph-image-preview" src={selectedImageUrl} alt={`${selectedNode.label} output`} loading="lazy" /> : null}
                {readOutputPreview(selectedStep) ? <pre>{readOutputPreview(selectedStep)}</pre> : <p>No persisted output for this node yet.</p>}
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
    </div>
  )
}
