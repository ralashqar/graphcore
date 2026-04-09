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
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'

import {
  createAssemblyNode,
  environmentAssemblyGraphToDsl,
  environmentAssemblyLibrary,
  environmentAssemblyTemplatesByKey,
  environmentAssemblyBindingDefaults,
  type AssemblyGraphDefinition,
  type AssemblyNodeDefinition,
  type EnvironmentGeometryBindingConfig,
} from '../../domain/environmentAssembly'
import type { DefinitionBase } from '../../domain/graphcore'
import { getResolvedEnvironmentGeometryBinding } from '../../domain/render3d'

type EnvironmentAssemblyWorkspaceProps = {
  assemblyGraphs: AssemblyGraphDefinition[]
  environment: DefinitionBase
  onCreateAssemblyGraph: (environmentKey: string) => string | null
  onDeleteAssemblyGraph: (graphKey: string) => void
  onUpsertAssemblyGraph: (graph: AssemblyGraphDefinition) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
}

type GeometryBindingChanges =
  Omit<Partial<EnvironmentGeometryBindingConfig>, 'compileSettings'> & {
    compileSettings?: Partial<EnvironmentGeometryBindingConfig['compileSettings']>
  }

type AssemblyNodeData = {
  node: AssemblyNodeDefinition
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function parseParamValue(nextValue: string, currentValue: unknown) {
  if (typeof currentValue === 'number') {
    const parsed = Number(nextValue)
    return Number.isFinite(parsed) ? parsed : currentValue
  }
  if (typeof currentValue === 'boolean') return nextValue === 'true'
  if (Array.isArray(currentValue) || (currentValue && typeof currentValue === 'object')) {
    try {
      return JSON.parse(nextValue)
    } catch {
      return currentValue
    }
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
          style={{ top: 18 + index * 18 }}
        />
      ))}
      <div className="flow-node-head">
        <div>
          <strong>{data.node.title}</strong>
          <span>{template?.label ?? data.node.kind}</span>
        </div>
      </div>
      <div className="flow-node-meta">{template?.groupKey ?? 'assembly'} • {data.node.kind}</div>
      {Object.keys(data.node.params).length > 0 ? (
        <div className="flow-node-meta">
          {Object.entries(data.node.params)
            .slice(0, 2)
            .map(([key, value]) => `${key}: ${typeof value === 'object' ? '…' : String(value)}`)
            .join(' • ')}
        </div>
      ) : null}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: 18 + index * 18 }}
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
  onCreateAssemblyGraph,
  onDeleteAssemblyGraph,
  onUpsertAssemblyGraph,
  onUpdateComponents,
}: EnvironmentAssemblyWorkspaceProps) {
  const geometryBinding = useMemo(() => getResolvedEnvironmentGeometryBinding(environment), [environment])
  const availableGraphs = useMemo(
    () =>
      assemblyGraphs.filter(
        (graph) => !graph.boundEnvironmentKey || graph.boundEnvironmentKey === environment.key || graph.key === geometryBinding.assemblyGraphKey,
      ),
    [assemblyGraphs, environment.key, geometryBinding.assemblyGraphKey],
  )
  const graph = useMemo(
    () => assemblyGraphs.find((entry) => entry.key === geometryBinding.assemblyGraphKey) ?? null,
    [assemblyGraphs, geometryBinding.assemblyGraphKey],
  )
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null)
  const [liveNodes, setLiveNodes] = useState<Node<AssemblyNodeData>[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])

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

  useEffect(() => {
    setLiveNodes(nodes)
  }, [nodes])

  useEffect(() => {
    setLiveEdges(edges)
  }, [edges])

  useEffect(() => {
    if (!graph) {
      setSelectedNodeKey(null)
      setSelectedEdgeKey(null)
      return
    }
    if (selectedNodeKey && !graph.nodes.some((node) => node.key === selectedNodeKey)) {
      setSelectedNodeKey(null)
    }
    if (selectedEdgeKey && !graph.edges.some((edge) => edge.key === selectedEdgeKey)) {
      setSelectedEdgeKey(null)
    }
  }, [graph, selectedEdgeKey, selectedNodeKey])

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
    updateGeometryBinding({
      sourceMode: 'procedural_graph',
      assemblyGraphKey: createdKey,
    })
  }

  function handleSelectGraph(nextGraphKey: string) {
    updateGeometryBinding({
      sourceMode: nextGraphKey ? 'procedural_graph' : geometryBinding.sourceMode,
      assemblyGraphKey: nextGraphKey || null,
    })
  }

  function addNode(kind: AssemblyNodeDefinition['kind']) {
    if (!graph) return
    const count = graph.nodes.filter((node) => node.kind === kind).length + 1
    const nextNode = createAssemblyNode(kind, count, {
      x: 120 + (graph.nodes.length % 4) * 220,
      y: 100 + Math.floor(graph.nodes.length / 4) * 150,
    })
    saveGraph((current) => ({ ...current, nodes: [...current.nodes, nextNode] }))
    setSelectedNodeKey(nextNode.key)
  }

  function handleNodesChange(changes: NodeChange<Node<AssemblyNodeData>>[]) {
    if (!graph) return
    setLiveNodes((current) => applyNodeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        saveGraph((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (
            node.key === change.id
              ? { ...node, position: { x: change.position?.x ?? node.position.x, y: change.position?.y ?? node.position.y } }
              : node
          )),
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
    saveGraph((current) => ({
      ...current,
      edges: [...current.edges.filter((edge) => edge.key !== nextEdge.key), nextEdge],
    }))
  }

  function updateSelectedNode(changes: Partial<AssemblyNodeDefinition>) {
    if (!selectedNode) return
    saveGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.key === selectedNode.key ? { ...node, ...changes } : node)),
    }))
  }

  function updateSelectedNodeParam(paramKey: string, nextValue: unknown) {
    if (!selectedNode) return
    updateSelectedNode({
      params: {
        ...selectedNode.params,
        [paramKey]: nextValue,
      },
    })
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

  function deleteSelectedEdge() {
    if (!selectedEdgeKey || !graph) return
    saveGraph((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.key !== selectedEdgeKey),
    }))
    setSelectedEdgeKey(null)
  }

  if (!graph) {
    return (
      <div className="environment-assembly-shell">
        <div className="environment-assembly-empty">
          <div className="section-head">
            <div>
              <span className="eyebrow">Assembly Graph</span>
              <h3>Procedural environment graph</h3>
            </div>
            <p className="subtle-line">Create or bind an assembly graph to author buildings with typed profile, path, solid, and roof nodes.</p>
          </div>
          <div className="editor-grid compact">
            <label className="field-block">
              <span>Geometry Source</span>
              <select
                value={geometryBinding.sourceMode}
                onChange={(event) => updateGeometryBinding({ sourceMode: event.target.value as EnvironmentGeometryBindingConfig['sourceMode'] })}
              >
                <option value="mesh">Mesh</option>
                <option value="procedural_graph">Procedural Graph</option>
              </select>
            </label>
            <label className="field-block">
              <span>Bind Existing Graph</span>
              <select value={geometryBinding.assemblyGraphKey ?? ''} onChange={(event) => handleSelectGraph(event.target.value)}>
                <option value="">No bound graph</option>
                {availableGraphs.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.name} ({entry.key})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary-button" onClick={createAndBindGraph} type="button">
            Create Assembly Graph
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="environment-assembly-shell">
      <aside className="environment-assembly-palette">
        <div className="section-head">
          <div>
            <span className="eyebrow">Graph</span>
            <h3>{graph.name}</h3>
          </div>
          <p className="subtle-line">Buildings-first typed assembly graph for this environment.</p>
        </div>

        <div className="editor-grid compact">
          <label className="field-block full-width">
            <span>Source Mode</span>
            <select
              value={geometryBinding.sourceMode}
              onChange={(event) => updateGeometryBinding({ sourceMode: event.target.value as EnvironmentGeometryBindingConfig['sourceMode'] })}
            >
              <option value="mesh">Mesh</option>
              <option value="procedural_graph">Procedural Graph</option>
            </select>
          </label>
          <label className="field-block full-width">
            <span>Assembly Graph</span>
            <select value={graph.key} onChange={(event) => handleSelectGraph(event.target.value)}>
              {availableGraphs.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>Compiler Target</span>
            <select
              value={geometryBinding.compilerTarget}
              onChange={(event) => updateGeometryBinding({ compilerTarget: event.target.value as EnvironmentGeometryBindingConfig['compilerTarget'] })}
            >
              <option value="preview_mesh">Preview Mesh</option>
              <option value="spatial_document">Spatial Document</option>
            </select>
          </label>
          <label className="field-block">
            <span>Units</span>
            <select
              value={geometryBinding.units}
              onChange={(event) => updateGeometryBinding({ units: event.target.value as EnvironmentGeometryBindingConfig['units'] })}
            >
              <option value="meters">Meters</option>
              <option value="generic">Generic</option>
            </select>
          </label>
        </div>

        <div className="chip-row">
          <button className={geometryBinding.compileSettings.livePreview ? 'segment-button is-active' : 'segment-button'} onClick={() => updateGeometryBinding({ compileSettings: { livePreview: !geometryBinding.compileSettings.livePreview } })} type="button">
            Live Preview
          </button>
          <button className={geometryBinding.compileSettings.showDebug ? 'segment-button is-active' : 'segment-button'} onClick={() => updateGeometryBinding({ compileSettings: { showDebug: !geometryBinding.compileSettings.showDebug } })} type="button">
            Debug
          </button>
          <button className="ghost-button compact" onClick={createAndBindGraph} type="button">
            + New Graph
          </button>
          <button className="ghost-button compact" onClick={() => onDeleteAssemblyGraph(graph.key)} type="button">
            Delete Graph
          </button>
        </div>

        <div className="rail-section">
          <div className="collection-status">
            <span className="section-label">Palette</span>
            <strong>{environmentAssemblyLibrary.reduce((count, group) => count + group.templates.length, 0)} nodes</strong>
          </div>
          <div className="rail-list">
            {environmentAssemblyLibrary.map((group) => (
              <div key={group.key} className="environment-assembly-group">
                <div className="section-label">{group.label}</div>
                {group.templates.map((template) => (
                  <button key={template.key} className="rail-button item-row" onClick={() => addNode(template.key)} type="button">
                    <div className="item-row-copy">
                      <strong>{template.label}</strong>
                      <span>{template.summary}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="environment-assembly-canvas">
        <ReactFlow
          nodes={liveNodes}
          edges={liveEdges}
          nodeTypes={nodeTypes}
          fitView
          onConnect={handleConnect}
          onEdgesChange={handleEdgesChange}
          onNodeClick={(_, node) => {
            setSelectedNodeKey(node.id)
            setSelectedEdgeKey(null)
          }}
          onNodesChange={handleNodesChange}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeKey(edge.id)
            setSelectedNodeKey(null)
          }}
          onPaneClick={() => {
            setSelectedNodeKey(null)
            setSelectedEdgeKey(null)
          }}
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </section>

      <aside className="environment-assembly-inspector">
        <div className="section-head">
          <div>
            <span className="eyebrow">Inspector</span>
            <h3>{selectedNode ? selectedNode.title : 'Graph Output'}</h3>
          </div>
          <p className="subtle-line">
            {selectedNode
              ? `${selectedNode.kind} node with ${selectedNode.ports.length} ports.`
              : 'Graph-level settings and DSL projection for LLM round-trips.'}
          </p>
        </div>

        {selectedNode ? (
          <>
            <div className="editor-grid compact">
              <label className="field-block full-width">
                <span>Title</span>
                <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
              </label>
              <label className="field-block full-width">
                <span>Key</span>
                <input value={selectedNode.key} onChange={(event) => updateSelectedNode({ key: event.target.value })} />
              </label>
            </div>

            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Params</span>
                  <h3>Node parameters</h3>
                </div>
              </div>
              <div className="editor-grid compact">
                {Object.entries(selectedNode.params).map(([paramKey, paramValue]) => (
                  <label key={paramKey} className="field-block full-width">
                    <span>{paramKey}</span>
                    {typeof paramValue === 'boolean' ? (
                      <select value={String(paramValue)} onChange={(event) => updateSelectedNodeParam(paramKey, event.target.value === 'true')}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : typeof paramValue === 'number' ? (
                      <input
                        type="number"
                        value={paramValue}
                        onChange={(event) => updateSelectedNodeParam(paramKey, Number(event.target.value))}
                      />
                    ) : Array.isArray(paramValue) || (paramValue && typeof paramValue === 'object') ? (
                      <textarea
                        rows={5}
                        value={stringifyValue(paramValue)}
                        onChange={(event) => updateSelectedNodeParam(paramKey, parseParamValue(event.target.value, paramValue))}
                      />
                    ) : (
                      <input
                        value={String(paramValue)}
                        onChange={(event) => updateSelectedNodeParam(paramKey, parseParamValue(event.target.value, paramValue))}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="chip-row">
              <button className="ghost-button compact" onClick={deleteSelectedNode} type="button">
                Delete Node
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="editor-grid compact">
              <label className="field-block full-width">
                <span>Name</span>
                <input value={graph.name} onChange={(event) => saveGraph((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field-block full-width">
                <span>Summary</span>
                <textarea rows={3} value={graph.summary} onChange={(event) => saveGraph((current) => ({ ...current, summary: event.target.value }))} />
              </label>
            </div>
            <div className="chip-row">
              <button className="ghost-button compact" disabled={!selectedEdgeKey} onClick={deleteSelectedEdge} type="button">
                Delete Edge
              </button>
            </div>
            <label className="field-block full-width">
              <span>Environment DSL</span>
              <textarea readOnly rows={16} value={environmentAssemblyGraphToDsl(graph)} />
            </label>
          </>
        )}
      </aside>
    </div>
  )
}
