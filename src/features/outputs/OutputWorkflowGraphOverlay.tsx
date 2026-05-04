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

const NODE_WIDTH = 286
const NODE_HEIGHT = 168

type GraphNodeData = {
  node: OutputWorkflowNode
  step: OutputWorkflowRunStep | null
  statusKey: string
  outputPreview: string
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

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
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
  const { node, step, statusKey, outputPreview, skillKeys, inputPorts, outputPorts, selected, running, onSelect, onRun } = data
  const definition = outputWorkflowNodeRegistry[node.nodeType]
  const execution = getOutputWorkflowNodeExecutionMetadata(node)
  const purpose = readTrimmedString(node.config.purpose)
  const prompt = readTrimmedString(node.inputs.prompt)

  return (
    <button
      className={`outputs-graph-node is-${node.nodeType} is-${statusKey} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(node.key)}
      onDoubleClick={() => onSelect(node.key)}
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
      <div className="outputs-graph-node-top">
        <span className={`outputs-status-icon is-${statusKey}`} aria-hidden="true" />
        <span className="outputs-graph-node-kind">{definition.label}</span>
        <span className="outputs-graph-node-resource">{execution.resourceClass}</span>
      </div>
      <strong>{node.label}</strong>
      <span>{purpose || node.nodeType.replace(/_/g, ' ')}</span>
      {providerStatus(step) ? <small>{providerStatus(step)}</small> : null}
      {prompt ? <p>{prompt}</p> : outputPreview ? <p>{outputPreview}</p> : <p>{definition.description}</p>}
      {skillKeys.length > 0 ? (
        <div className="outputs-graph-skill-row">
          {skillKeys.slice(0, 2).map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
          {skillKeys.length > 2 ? <small>+{skillKeys.length - 2}</small> : null}
        </div>
      ) : null}
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
  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes])
  const selectedNode = selectedNodeKey ? nodeByKey.get(selectedNodeKey) ?? nodes[0] ?? null : nodes[0] ?? null
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedGuidance = selectedNode ? buildOutputGuidanceBundleForNode({ node: selectedNode, worldWiki }) : null
  const selectedProviderBacked = selectedNode ? isOutputWorkflowProviderBackedNodeType(selectedNode.nodeType) : false
  const [promptDraft, setPromptDraft] = useState('')
  const executionPlan = useMemo(() => buildOutputWorkflowExecutionPlan(nodes, edges), [nodes, edges])

  useEffect(() => {
    setPromptDraft(selectedNode ? readTrimmedString(selectedNode.inputs.prompt) : '')
  }, [selectedNode?.id, selectedNode?.inputs.prompt])

  useEffect(() => {
    const sourceByKey = new Map(nodes.map((node) => [node.key, node]))
    const inputPortsByNodeKey = new Map<string, Array<{ id: string; valueType: string }>>()
    const outputPortsByNodeKey = new Map<string, Array<{ id: string; valueType: string }>>()
    for (const edge of edges) {
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
      return nodes.map((node) => {
        const step = stepsByNodeKey.get(node.key) ?? null
        const statusKey = outputWorkflowStepStatusKey(step)
        const definition = outputWorkflowNodeRegistry[node.nodeType]
        return {
          id: node.key,
          type: 'outputWorkflow',
          position: layoutDirty ? localPositionByKey.get(node.key) ?? node.position : node.position,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          data: {
            node,
            step,
            statusKey,
            outputPreview: readOutputPreview(step).slice(0, 220),
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
    setFlowEdges(edges.map((edge) => {
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
  }, [nodes, edges, stepsByNodeKey, selectedNodeKey, targetedNodeKey, layoutDirty, onRunNode, onSelectNode, readNodeSkillKeys, readOutputPreview])

  async function applyAutoLayout(persist = false) {
    setGraphError(null)
    try {
      const fallbackPositions = buildOutputWorkflowLevelLayout({ nodes, edges, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT })
      let nextPositions = fallbackPositions
      try {
        const elkModule = await import('elkjs/lib/elk.bundled.js')
        const Elk = elkModule.default
        const graph = await new Elk().layout({
          id: 'output-workflow',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': '118',
            'elk.spacing.nodeNode': '44',
          },
          children: nodes.map((node) => ({
            id: node.key,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          })),
          edges: edges.map((edge) => ({
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
      const currentByKey = new Map(nodes.map((node) => [node.key, node.position]))
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
                  {targetedNodeKey === selectedNode.key ? 'Starting...' : 'Run'}
                </button>
              </div>
              {selectedProviderBacked ? (
                <section className="outputs-graph-inspector-section">
                  <div className="outputs-graph-section-head">
                    <strong>Prompt</strong>
                    <button disabled={savingPrompt || promptDraft === readTrimmedString(selectedNode.inputs.prompt)} onClick={() => void savePrompt()} type="button">
                      {savingPrompt ? 'Saving...' : 'Save'}
                    </button>
                  </div>
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
