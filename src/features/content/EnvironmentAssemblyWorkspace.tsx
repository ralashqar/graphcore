import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createAssemblyNode,
  environmentAssemblyBindingDefaults,
  environmentAssemblyPresets,
  environmentAssemblyTemplatesByKey,
  migrateAssemblyGraph,
  type AssemblyGraphDefinition,
  type AssemblyNodeDefinition,
  type EnvironmentGeometryBindingConfig,
} from '../../domain/environmentAssembly'
import type { DefinitionBase } from '../../domain/graphcore'
import { getResolvedEnvironmentGeometryBinding } from '../../domain/render3d'

type EnvironmentAssemblyWorkspaceProps = {
  assemblyGraphs: AssemblyGraphDefinition[]
  environment: DefinitionBase
  isGeneratingPrompt: boolean
  isOpeningPreview: boolean
  onChangePromptText: (value: string) => void
  onCreateAssemblyGraph: (environmentKey: string) => string | null
  onDeleteAssemblyGraph: (graphKey: string) => void
  onGeneratePrompt: () => void
  onOpenPreview: () => void
  onUpsertAssemblyGraph: (graph: AssemblyGraphDefinition) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  promptText: string
}

type GeometryBindingChanges =
  Omit<Partial<EnvironmentGeometryBindingConfig>, 'compileSettings'> & {
    compileSettings?: Partial<EnvironmentGeometryBindingConfig['compileSettings']>
  }

type AssemblyNodeData = {
  node: AssemblyNodeDefinition
}

type PaletteState = {
  x: number
  y: number
  flowX: number
  flowY: number
} | null

function parseParamValue(nextValue: string, currentValue: unknown) {
  if (typeof currentValue === 'number') {
    const parsed = Number(nextValue)
    return Number.isFinite(parsed) ? parsed : currentValue
  }
  return nextValue
}

function AssemblyFlowNode({ data, selected }: NodeProps<Node<AssemblyNodeData>>) {
  const template = environmentAssemblyTemplatesByKey.get(data.node.kind)
  const inputs = data.node.ports.filter((port) => port.direction === 'input')
  const outputs = data.node.ports.filter((port) => port.direction === 'output')

  return (
    <div className={selected ? 'flow-node flow-node-assembly is-selected' : 'flow-node flow-node-assembly'}>
      {inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: 20 + index * 18 }}
        />
      ))}
      <div className="flow-node-head">
        <div>
          <strong>{data.node.title}</strong>
          <span>{template?.label ?? data.node.kind}</span>
        </div>
      </div>
      <div className="flow-node-meta">{template?.summary ?? data.node.kind}</div>
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: 20 + index * 18 }}
        />
      ))}
    </div>
  )
}

const nodeTypes = {
  assemblyNode: AssemblyFlowNode,
}

export function EnvironmentAssemblyWorkspace({
  assemblyGraphs,
  environment,
  isGeneratingPrompt,
  isOpeningPreview,
  onChangePromptText,
  onCreateAssemblyGraph,
  onDeleteAssemblyGraph,
  onGeneratePrompt,
  onOpenPreview,
  onUpsertAssemblyGraph,
  onUpdateComponents,
  promptText,
}: EnvironmentAssemblyWorkspaceProps) {
  const geometryBinding = useMemo(() => getResolvedEnvironmentGeometryBinding(environment), [environment])
  const graph = useMemo(
    () => {
      const current = assemblyGraphs.find((entry) => entry.key === geometryBinding.assemblyGraphKey) ?? null
      return current ? migrateAssemblyGraph(current) : null
    },
    [assemblyGraphs, geometryBinding.assemblyGraphKey],
  )
  const availableGraphs = useMemo(
    () =>
      assemblyGraphs.filter(
        (entry) => !entry.boundEnvironmentKey || entry.boundEnvironmentKey === environment.key || entry.key === geometryBinding.assemblyGraphKey,
      ),
    [assemblyGraphs, environment.key, geometryBinding.assemblyGraphKey],
  )

  const [liveNodes, setLiveNodes] = useState<Node<AssemblyNodeData>[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [paletteState, setPaletteState] = useState<PaletteState>(null)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [presetKey, setPresetKey] = useState(environmentAssemblyPresets[0]?.key ?? '')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<AssemblyNodeData>, Edge> | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const nodes = useMemo<Node<AssemblyNodeData>[]>(
    () =>
      (graph?.nodes ?? []).map((node) => ({
        id: node.key,
        position: node.position,
        type: 'assemblyNode',
        data: { node },
      })),
    [graph],
  )

  const edges = useMemo<Edge[]>(
    () =>
      (graph?.edges ?? []).map((edge) => ({
        id: edge.key,
        source: edge.source.nodeKey,
        sourceHandle: edge.source.portId,
        target: edge.target.nodeKey,
        targetHandle: edge.target.portId,
      })),
    [graph],
  )

  const selectedNode = graph?.nodes.find((node) => node.key === selectedNodeKey) ?? null
  const filteredTemplates = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase()
    return [...environmentAssemblyTemplatesByKey.values()].filter((template) =>
      query.length === 0
      || template.label.toLowerCase().includes(query)
      || template.summary.toLowerCase().includes(query)
      || template.groupKey.toLowerCase().includes(query),
    )
  }, [paletteSearch])

  useEffect(() => {
    setLiveNodes(nodes)
  }, [nodes])

  useEffect(() => {
    setLiveEdges(edges)
  }, [edges])

  useEffect(() => {
    const current = assemblyGraphs.find((entry) => entry.key === geometryBinding.assemblyGraphKey)
    if (!current || !graph) return
    if (JSON.stringify(current) === JSON.stringify(graph)) return
    onUpsertAssemblyGraph(graph)
  }, [assemblyGraphs, geometryBinding.assemblyGraphKey, graph, onUpsertAssemblyGraph])

  useEffect(() => {
    if (!graph) {
      setSelectedNodeKey(null)
      setPaletteState(null)
      return
    }
    if (selectedNodeKey && !graph.nodes.some((node) => node.key === selectedNodeKey)) {
      setSelectedNodeKey(null)
    }
  }, [graph, selectedNodeKey])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!graph) return
      if (event.key === 'Escape') {
        setPaletteState(null)
        setSelectedNodeKey(null)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeKey) {
        event.preventDefault()
        deleteSelectedNode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [graph, selectedNodeKey])

  function updateGeometryBinding(changes: GeometryBindingChanges) {
    const nextConfig = {
      ...environmentAssemblyBindingDefaults,
      ...geometryBinding,
      ...changes,
      compileSettings: {
        ...environmentAssemblyBindingDefaults.compileSettings,
        ...geometryBinding.compileSettings,
        ...(changes.compileSettings ?? {}),
      },
    } satisfies EnvironmentGeometryBindingConfig

    const nextComponents = environment.components.some((component) => component.type === 'environment_geometry_binding')
      ? environment.components.map((component) =>
          component.type === 'environment_geometry_binding' ? { ...component, config: nextConfig } : component,
        )
      : [...environment.components, { type: 'environment_geometry_binding', config: nextConfig } as DefinitionBase['components'][number]]

    onUpdateComponents(environment.key, nextComponents)
  }

  function saveGraph(updater: (current: AssemblyGraphDefinition) => AssemblyGraphDefinition) {
    if (!graph) return
    onUpsertAssemblyGraph(updater(graph))
  }

  function createAndBindGraph() {
    const createdKey = onCreateAssemblyGraph(environment.key)
    if (!createdKey) return
    updateGeometryBinding({ sourceMode: 'procedural_graph', assemblyGraphKey: createdKey })
  }

  function handleSelectGraph(nextGraphKey: string) {
    updateGeometryBinding({
      sourceMode: nextGraphKey ? 'procedural_graph' : 'mesh',
      assemblyGraphKey: nextGraphKey || null,
    })
  }

  function addNode(kind: AssemblyNodeDefinition['kind'], positionOverride?: { x: number; y: number }) {
    if (!graph) return
    const count = graph.nodes.filter((node) => node.kind === kind).length + 1
    const position = positionOverride ?? { x: 120 + graph.nodes.length * 40, y: 120 + graph.nodes.length * 24 }
    const nextNode = createAssemblyNode(kind, count, position)
    saveGraph((current) => ({ ...current, nodes: [...current.nodes, nextNode] }))
    setSelectedNodeKey(nextNode.key)
    setPaletteState(null)
    setPaletteSearch('')
  }

  function applyPreset() {
    if (!graph) return
    const preset = environmentAssemblyPresets.find((entry) => entry.key === presetKey)
    if (!preset) return
    const nextGraph = preset.build(graph.key, environment.key)
    onUpsertAssemblyGraph({
      ...graph,
      name: nextGraph.name,
      summary: nextGraph.summary,
      boundEnvironmentKey: environment.key,
      metadata: nextGraph.metadata,
      nodes: nextGraph.nodes,
      edges: nextGraph.edges,
    })
    updateGeometryBinding({ sourceMode: 'procedural_graph', assemblyGraphKey: graph.key })
    setSelectedNodeKey(null)
  }

  function handleNodesChange(changes: NodeChange<Node<AssemblyNodeData>>[]) {
    if (!graph) return
    setLiveNodes((current) => applyNodeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        saveGraph((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.key === change.id
              ? { ...node, position: { x: change.position?.x ?? node.position.x, y: change.position?.y ?? node.position.y } }
              : node,
          ),
        }))
      }
      if (change.type === 'remove') {
        saveGraph((current) => ({
          ...current,
          nodes: current.nodes.filter((node) => node.key !== change.id),
          edges: current.edges.filter((edge) => edge.source.nodeKey !== change.id && edge.target.nodeKey !== change.id),
        }))
      }
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge>[]) {
    if (!graph) return
    setLiveEdges((current) => applyEdgeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'remove') {
        saveGraph((current) => ({
          ...current,
          edges: current.edges.filter((edge) => edge.key !== change.id),
        }))
      }
    }
  }

  function handleConnect(connection: Connection) {
    if (!graph || !connection.source || !connection.target) return
    const nextEdge = {
      id: `assembly-edge-${Date.now()}`,
      key: `assembly.edge_${Date.now()}`,
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'solid' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'solids' },
      metadata: {},
    }
    saveGraph((current) => ({ ...current, edges: [...current.edges, nextEdge] }))
  }

  function deleteSelectedNode() {
    if (!selectedNodeKey || !graph) return
    saveGraph((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.key !== selectedNodeKey),
      edges: current.edges.filter((edge) => edge.source.nodeKey !== selectedNodeKey && edge.target.nodeKey !== selectedNodeKey),
    }))
    setSelectedNodeKey(null)
  }

  function updateSelectedNode(changes: Partial<AssemblyNodeDefinition>) {
    if (!selectedNode) return
    saveGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.key === selectedNode.key ? { ...node, ...changes } : node)),
    }))
  }

  function openPalette(clientX: number, clientY: number) {
    if (!canvasRef.current || !flowInstance) return
    const bounds = canvasRef.current.getBoundingClientRect()
    const flowPosition = flowInstance.screenToFlowPosition({ x: clientX, y: clientY })
    setPaletteState({
      x: clientX - bounds.left,
      y: clientY - bounds.top,
      flowX: flowPosition.x,
      flowY: flowPosition.y,
    })
    setPaletteSearch('')
  }

  if (!graph) {
    return (
      <div className="environment-assembly-shell simple">
        <div className="environment-assembly-empty">
          <div className="section-head">
            <div>
              <span className="eyebrow">Assembly Graph</span>
              <h3>Procedural environment graph</h3>
            </div>
            <p className="subtle-line">Create a graph, apply a preset, then compile it in the 3D tab.</p>
          </div>
          <div className="environment-assembly-actions">
            <select value={geometryBinding.assemblyGraphKey ?? ''} onChange={(event) => handleSelectGraph(event.target.value)}>
              <option value="">Select existing graph</option>
              {availableGraphs.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </select>
            <button className="primary-button" onClick={createAndBindGraph} type="button">
              Create Graph
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="environment-assembly-shell simple">
      <div className="environment-assembly-stage">
        <div className="environment-assembly-main">
          <div className="environment-assembly-hintbar">
            <span>Right-click anywhere on the graph to open the node palette.</span>
            <span>{environmentAssemblyPresets.find((preset) => preset.key === presetKey)?.summary ?? 'Preset summary unavailable.'}</span>
          </div>

          <div className="environment-assembly-canvas" ref={canvasRef}>
            <ReactFlow
              nodes={liveNodes}
              edges={liveEdges}
              nodeTypes={nodeTypes}
              fitView
              style={{ width: '100%', height: '100%' }}
              onConnect={handleConnect}
              onEdgesChange={handleEdgesChange}
              onInit={setFlowInstance}
              onNodeClick={(_, node) => {
                setSelectedNodeKey(node.id)
                setPaletteState(null)
              }}
              onNodesChange={handleNodesChange}
              onNodesDelete={() => setSelectedNodeKey(null)}
              onPaneClick={() => {
                setSelectedNodeKey(null)
                setPaletteState(null)
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                openPalette(event.clientX, event.clientY)
              }}
            >
              <Background />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>

            {paletteState ? (
              <div className="environment-assembly-palette-popover" style={{ left: paletteState.x, top: paletteState.y }}>
                <input
                  autoFocus
                  className="collection-search"
                  placeholder="Search nodes..."
                  value={paletteSearch}
                  onChange={(event) => setPaletteSearch(event.target.value)}
                />
                <div className="environment-assembly-palette-list">
                  {filteredTemplates.map((template) => (
                    <button
                      key={template.key}
                      className="environment-assembly-palette-item"
                      onClick={() => addNode(template.key, { x: paletteState.flowX, y: paletteState.flowY })}
                      type="button"
                    >
                      <strong>{template.label}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="environment-assembly-dock">
          <div className="environment-assembly-prompt">
            <textarea
              aria-label="Environment graph prompt"
              placeholder="Build a castle courtyard with two towers and a bridge, or a curved hall with a mezzanine ring."
              rows={4}
              value={promptText}
              onChange={(event) => onChangePromptText(event.target.value)}
            />
            <button className="primary-button compact" disabled={isGeneratingPrompt || promptText.trim().length === 0} onClick={onGeneratePrompt} type="button">
              {isGeneratingPrompt ? 'Generating...' : 'Prompt'}
            </button>
          </div>

          <div className="environment-assembly-actions vertical">
            <label className="field-block full-width">
              <span>Graph</span>
              <select value={graph.key} onChange={(event) => handleSelectGraph(event.target.value)}>
                {availableGraphs.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block full-width">
              <span>Preset</span>
              <select value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>
                {environmentAssemblyPresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost-button compact" onClick={applyPreset} type="button">
              Apply Preset
            </button>
            <button className="ghost-button compact" onClick={createAndBindGraph} type="button">
              New Graph
            </button>
            <button className="ghost-button compact" onClick={() => onDeleteAssemblyGraph(graph.key)} type="button">
              Delete Graph
            </button>
            <button
              className="primary-button compact"
              disabled={isOpeningPreview}
              onClick={() => {
                updateGeometryBinding({ sourceMode: 'procedural_graph', assemblyGraphKey: graph.key })
                onOpenPreview()
              }}
              type="button"
            >
              {isOpeningPreview ? 'Opening 3D...' : 'Generate Mesh'}
            </button>
          </div>

          {selectedNode ? (
            <div className="environment-assembly-selection-card docked">
              <div className="environment-assembly-selection-head">
                <div>
                  <strong>{selectedNode.title}</strong>
                  <span>{selectedNode.kind}</span>
                </div>
                <button className="ghost-button compact" onClick={deleteSelectedNode} type="button">
                  Delete
                </button>
              </div>
              <div className="environment-assembly-param-grid">
                <label className="field-block full-width">
                  <span>Title</span>
                  <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
                </label>
                {Object.entries(selectedNode.params)
                  .slice(0, 6)
                  .map(([paramKey, paramValue]) => (
                    <label key={paramKey} className="field-block">
                      <span>{paramKey}</span>
                      <input
                        value={String(paramValue)}
                        onChange={(event) =>
                          updateSelectedNode({
                            params: {
                              ...selectedNode.params,
                              [paramKey]: parseParamValue(event.target.value, paramValue),
                            },
                          })}
                      />
                    </label>
                  ))}
              </div>
            </div>
          ) : (
            <div className="environment-assembly-selection-card docked is-empty">
              <strong>No node selected</strong>
              <span>Right-click to add nodes, drag to arrange them, and click a node to tweak its core params.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
