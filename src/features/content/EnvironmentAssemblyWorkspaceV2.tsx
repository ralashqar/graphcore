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
  compileEnvironmentBlueprint,
  exportBlueprintToTaggedSvg,
  importTaggedSvgToBlueprint,
  materializeEnvironmentBlueprintToAssemblyGraph,
  type EnvironmentBlueprintV1,
} from '../../domain/environmentBlueprint'
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
import { createAssemblyCompileCache, compileAssemblyGraph } from '../../domain/environmentAssemblyCompiler'
import type { DefinitionBase } from '../../domain/graphcore'
import { getResolvedEnvironmentGeometryBinding } from '../../domain/render3d'
import { ThreeSceneViewport } from '../viewer3d/ThreeSceneViewport'

type EnvironmentAssemblyWorkspaceProps = {
  assemblyGraphs: AssemblyGraphDefinition[]
  environmentBlueprints?: EnvironmentBlueprintV1[]
  environment: DefinitionBase
  isGeneratingPrompt: boolean
  isOpeningPreview: boolean
  mode?: 'full' | 'graph_only'
  onChangePromptText: (value: string) => void
  onCreateEnvironmentBlueprint: (environmentKey: string) => string | null
  onCreateAssemblyGraph: (environmentKey: string) => string | null
  onDeleteAssemblyGraph: (graphKey: string) => void
  onDeleteEnvironmentBlueprint: (blueprintId: string) => void
  onGeneratePrompt: () => void
  onOpenPreview: () => void
  onUpsertAssemblyGraph: (graph: AssemblyGraphDefinition) => void
  onUpsertEnvironmentBlueprint: (blueprint: EnvironmentBlueprintV1) => void
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

type DragState = {
  structureId: string
  pointIndex: number
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

function structureBounds(blueprint: EnvironmentBlueprintV1 | null) {
  const points = blueprint?.structures.flatMap((structure) => structure.footprint) ?? []
  if (points.length === 0) return { minX: -12, minY: -12, maxX: 12, maxY: 12 }
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  )
}

function BlueprintPlanCanvas({
  blueprint,
  selectedElementId,
  onSelectElement,
  onUpdateStructurePoint,
}: {
  blueprint: EnvironmentBlueprintV1 | null
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateStructurePoint: (structureId: string, pointIndex: number, nextPoint: { x: number; y: number }) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragState, setDragState] = useState<DragState>(null)
  const bounds = useMemo(() => structureBounds(blueprint), [blueprint])
  const viewBox = `${bounds.minX - 2} ${bounds.minY - 2} ${Math.max(16, bounds.maxX - bounds.minX + 4)} ${Math.max(16, bounds.maxY - bounds.minY + 4)}`

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!dragState || !svgRef.current || !blueprint) return
      const rect = svgRef.current.getBoundingClientRect()
      const point = svgRef.current.createSVGPoint()
      point.x = event.clientX - rect.left
      point.y = event.clientY - rect.top
      const transformed = point.matrixTransform(svgRef.current.getScreenCTM()?.inverse())
      onUpdateStructurePoint(dragState.structureId, dragState.pointIndex, { x: transformed.x, y: transformed.y })
    }

    function onPointerUp() {
      setDragState(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [blueprint, dragState, onUpdateStructurePoint])

  if (!blueprint) {
    return <div className="environment-assembly-selection-card docked is-empty"><strong>No blueprint selected</strong><span>Create or bind a blueprint to author the semantic layout.</span></div>
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      style={{ width: '100%', height: 260, borderRadius: 14, background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(148, 163, 184, 0.2)' }}
      onClick={() => onSelectElement(null)}
    >
      {blueprint.site ? (
        <polygon
          points={blueprint.site.footprint.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="rgba(148, 163, 184, 0.05)"
          stroke="#64748b"
          strokeDasharray="0.6 0.4"
          strokeWidth={0.08}
        />
      ) : null}
      {blueprint.structures.map((structure) => (
        <g key={structure.id}>
          <polygon
            points={structure.footprint.map((point) => `${point.x},${point.y}`).join(' ')}
            fill={selectedElementId === structure.id ? 'rgba(34, 211, 238, 0.22)' : 'rgba(56, 189, 248, 0.08)'}
            stroke={selectedElementId === structure.id ? '#22d3ee' : '#38bdf8'}
            strokeWidth={0.12}
            onClick={(event) => {
              event.stopPropagation()
              onSelectElement(structure.id)
            }}
          />
          {selectedElementId === structure.id
            ? structure.footprint.map((point, index) => (
                <circle
                  key={`${structure.id}.${index + 1}`}
                  cx={point.x}
                  cy={point.y}
                  r={0.28}
                  fill="#f8fafc"
                  stroke="#0f172a"
                  strokeWidth={0.05}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setDragState({ structureId: structure.id, pointIndex: index })
                  }}
                />
              ))
            : null}
        </g>
      ))}
    </svg>
  )
}

function findBlueprintElement(blueprint: EnvironmentBlueprintV1 | null, elementId: string | null) {
  if (!blueprint || !elementId) return null
  return blueprint.structures.find((entry) => entry.id === elementId)
    ?? blueprint.openings.find((entry) => entry.id === elementId)
    ?? blueprint.facades.find((entry) => entry.id === elementId)
    ?? blueprint.circulation.find((entry) => entry.id === elementId)
    ?? blueprint.roofs.find((entry) => entry.id === elementId)
    ?? null
}

export function EnvironmentAssemblyWorkspace({
  assemblyGraphs,
  environmentBlueprints = [],
  environment,
  isGeneratingPrompt,
  isOpeningPreview,
  mode = 'full',
  onChangePromptText,
  onCreateEnvironmentBlueprint,
  onCreateAssemblyGraph,
  onDeleteAssemblyGraph,
  onDeleteEnvironmentBlueprint,
  onGeneratePrompt,
  onOpenPreview,
  onUpsertAssemblyGraph,
  onUpsertEnvironmentBlueprint,
  onUpdateComponents,
  promptText,
}: EnvironmentAssemblyWorkspaceProps) {
  const geometryBinding = useMemo(() => getResolvedEnvironmentGeometryBinding(environment), [environment])
  const boundGraph = useMemo(
    () => {
      const current = assemblyGraphs.find((entry) => entry.key === geometryBinding.assemblyGraphKey) ?? null
      return current ? migrateAssemblyGraph(current) : null
    },
    [assemblyGraphs, geometryBinding.assemblyGraphKey],
  )
  const boundBlueprint = useMemo(
    () => environmentBlueprints.find((entry) => entry.id === geometryBinding.environmentBlueprintKey && entry.environmentKey === environment.key) ?? null,
    [environment.key, environmentBlueprints, geometryBinding.environmentBlueprintKey],
  )
  const availableGraphs = useMemo(
    () =>
      assemblyGraphs.filter(
        (entry) => !entry.boundEnvironmentKey || entry.boundEnvironmentKey === environment.key || entry.key === geometryBinding.assemblyGraphKey,
      ),
    [assemblyGraphs, environment.key, geometryBinding.assemblyGraphKey],
  )
  const availableBlueprints = useMemo(
    () => environmentBlueprints.filter((entry) => entry.environmentKey === environment.key),
    [environment.key, environmentBlueprints],
  )

  const autoMaterialized = useMemo(
    () => boundBlueprint ? materializeEnvironmentBlueprintToAssemblyGraph(boundBlueprint, boundGraph) : null,
    [boundBlueprint, boundGraph],
  )
  const graph = useMemo(() => {
    if (!boundBlueprint) return boundGraph
    if (boundGraph?.metadata?.blueprintOwnership === 'manual_override') return boundGraph
    return autoMaterialized?.graph ?? boundGraph
  }, [autoMaterialized, boundBlueprint, boundGraph])
  const blueprint = boundBlueprint

  const [liveNodes, setLiveNodes] = useState<Node<AssemblyNodeData>[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [selectedBlueprintElementId, setSelectedBlueprintElementId] = useState<string | null>(null)
  const [paletteState, setPaletteState] = useState<PaletteState>(null)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [presetKey, setPresetKey] = useState(environmentAssemblyPresets[0]?.key ?? '')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<AssemblyNodeData>, Edge> | null>(null)
  const [svgText, setSvgText] = useState('')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const compileCacheRef = useRef(createAssemblyCompileCache())

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
  const selectedBlueprintElement = useMemo(
    () => findBlueprintElement(blueprint, selectedBlueprintElementId),
    [blueprint, selectedBlueprintElementId],
  )
  const filteredTemplates = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase()
    return [...environmentAssemblyTemplatesByKey.values()].filter((template) =>
      query.length === 0
      || template.label.toLowerCase().includes(query)
      || template.summary.toLowerCase().includes(query)
      || template.groupKey.toLowerCase().includes(query),
    )
  }, [paletteSearch])

  const compiledPreview = useMemo(() => {
    if (blueprint) {
      const result = compileEnvironmentBlueprint(blueprint, {
        existingGraph: graph ?? undefined,
        existingCache: compileCacheRef.current,
      })
      compileCacheRef.current = result.compileResult.cache
      return result.compiledModel
    }
    if (graph) {
      const result = compileAssemblyGraph(graph, compileCacheRef.current)
      compileCacheRef.current = result.cache
      return {
        ...result.compiledModel,
        parts: result.compiledModel.parts.filter((part) => part.kind !== 'debug' && part.kind !== 'line'),
      }
    }
    return null
  }, [blueprint, graph])

  useEffect(() => {
    setLiveNodes(nodes)
  }, [nodes])

  useEffect(() => {
    setLiveEdges(edges)
  }, [edges])

  useEffect(() => {
    if (!blueprint || !autoMaterialized?.graph || !boundGraph || boundGraph.metadata?.blueprintOwnership === 'manual_override') return
    if (JSON.stringify(boundGraph) === JSON.stringify(autoMaterialized.graph)) return
    onUpsertAssemblyGraph(autoMaterialized.graph)
  }, [autoMaterialized, boundGraph, blueprint, onUpsertAssemblyGraph])

  useEffect(() => {
    if (!blueprint) {
      setSvgText('')
      return
    }
    setSvgText(exportBlueprintToTaggedSvg(blueprint))
  }, [blueprint])

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
    const nextGraph = updater(graph)
    onUpsertAssemblyGraph(blueprint
      ? {
          ...nextGraph,
          metadata: {
            ...nextGraph.metadata,
            blueprintOwnership: 'manual_override',
            blueprintKey: blueprint.id,
          },
        }
      : nextGraph)
  }

  function saveBlueprint(updater: (current: EnvironmentBlueprintV1) => EnvironmentBlueprintV1) {
    if (!blueprint) return
    onUpsertEnvironmentBlueprint(updater(blueprint))
  }

  function createAndBindGraph() {
    const createdKey = onCreateAssemblyGraph(environment.key)
    if (!createdKey) return
    updateGeometryBinding({ sourceMode: 'procedural_graph', assemblyGraphKey: createdKey })
  }

  function createAndBindBlueprint() {
    const createdBlueprintId = onCreateEnvironmentBlueprint(environment.key)
    const ensuredGraphKey = graph?.key ?? onCreateAssemblyGraph(environment.key)
    if (!createdBlueprintId) return
    updateGeometryBinding({
      sourceMode: 'procedural_blueprint',
      environmentBlueprintKey: createdBlueprintId,
      assemblyGraphKey: ensuredGraphKey ?? null,
    })
  }

  function handleSelectGraph(nextGraphKey: string) {
    updateGeometryBinding({
      sourceMode: nextGraphKey ? (blueprint ? 'procedural_blueprint' : 'procedural_graph') : 'mesh',
      assemblyGraphKey: nextGraphKey || null,
    })
  }

  function handleSelectBlueprint(nextBlueprintId: string) {
    updateGeometryBinding({
      sourceMode: nextBlueprintId ? 'procedural_blueprint' : (graph ? 'procedural_graph' : 'mesh'),
      environmentBlueprintKey: nextBlueprintId || null,
      assemblyGraphKey: graph?.key ?? geometryBinding.assemblyGraphKey ?? null,
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
      metadata: {
        ...nextGraph.metadata,
        blueprintOwnership: blueprint ? 'manual_override' : graph.metadata.blueprintOwnership,
      },
      nodes: nextGraph.nodes,
      edges: nextGraph.edges,
    })
    updateGeometryBinding({ sourceMode: blueprint ? 'procedural_blueprint' : 'procedural_graph', assemblyGraphKey: graph.key })
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

  function updateStructurePoint(structureId: string, pointIndex: number, nextPoint: { x: number; y: number }) {
    saveBlueprint((current) => ({
      ...current,
      structures: current.structures.map((structure) =>
        structure.id !== structureId
          ? structure
          : {
              ...structure,
              footprint: structure.footprint.map((point, index) => (index === pointIndex ? nextPoint : point)),
            },
      ),
    }))
  }

  function importSvg() {
    try {
      const imported = importTaggedSvgToBlueprint(svgText, environment.key, `${environment.name} Blueprint`)
      const nextBlueprint = blueprint ? { ...imported, id: blueprint.id } : imported
      onUpsertEnvironmentBlueprint(nextBlueprint)
      updateGeometryBinding({
        sourceMode: 'procedural_blueprint',
        environmentBlueprintKey: nextBlueprint.id,
        assemblyGraphKey: graph?.key ?? geometryBinding.assemblyGraphKey ?? null,
      })
    } catch (error) {
      setSvgText(`${svgText}\n<!-- ${(error as Error).message} -->`)
    }
  }

  const graphLockedToBlueprint = Boolean(blueprint && graph?.metadata?.blueprintOwnership !== 'manual_override')
  const graphOwnershipLabel =
    typeof graph?.metadata?.blueprintOwnership === 'string' ? graph.metadata.blueprintOwnership : 'manual'
  const isGraphOnly = mode === 'graph_only'

  function handleOpenPreview() {
    updateGeometryBinding({
      sourceMode: blueprint ? 'procedural_blueprint' : 'procedural_graph',
      environmentBlueprintKey: blueprint?.id ?? null,
      assemblyGraphKey: graph?.key ?? null,
    })
    onOpenPreview()
  }

  if (isGraphOnly) {
    return (
      <div className="environment-assembly-shell simple">
        <div className="environment-assembly-stage" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.42fr)' }}>
          <div className="environment-assembly-main">
            <div className="environment-assembly-hintbar">
              <span>{graphLockedToBlueprint ? 'Blueprint owns this graph and rematerializes it live.' : 'Graph edits are currently detached from blueprint auto-materialization.'}</span>
              <span>{blueprint ? `${blueprint.structures.length} structures, ${blueprint.openings.length} openings, ${blueprint.circulation.length} circulation elements.` : 'Graph editing only. Open 3D to inspect the compiled result.'}</span>
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
                  const blueprintElementId = graph?.nodes.find((entry) => entry.key === node.id)?.metadata?.blueprintElementId
                  setSelectedBlueprintElementId(typeof blueprintElementId === 'string' ? blueprintElementId : null)
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
            <div className="environment-assembly-actions vertical">
              <label className="field-block full-width">
                <span>Graph</span>
                <select value={graph?.key ?? ''} onChange={(event) => handleSelectGraph(event.target.value)}>
                  <option value="">No graph bound</option>
                  {availableGraphs.map((entry) => (
                    <option key={entry.key} value={entry.key}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className="field-block full-width">
                <span>Preset</span>
                <select value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>
                  {environmentAssemblyPresets.map((preset) => (
                    <option key={preset.key} value={preset.key}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <div className="chip-row">
                <button className="ghost-button compact" onClick={applyPreset} type="button" disabled={!graph}>Apply Preset</button>
                <button className="ghost-button compact" onClick={createAndBindGraph} type="button">New Graph</button>
                {graph ? <button className="ghost-button compact" onClick={() => onDeleteAssemblyGraph(graph.key)} type="button">Delete Graph</button> : null}
                <button className="primary-button compact" disabled={isOpeningPreview || !graph} onClick={handleOpenPreview} type="button">
                  {isOpeningPreview ? 'Opening 3D...' : 'Open 3D'}
                </button>
              </div>
            </div>

            {selectedNode ? (
              <div className="environment-assembly-selection-card docked">
                <div className="environment-assembly-selection-head">
                  <div>
                    <strong>{selectedNode.title}</strong>
                    <span>{selectedNode.kind}</span>
                  </div>
                </div>
                <div className="environment-assembly-param-grid">
                  <label className="field-block full-width">
                    <span>Title</span>
                    <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
                  </label>
                  {Object.entries(selectedNode.params).slice(0, 8).map(([paramKey, paramValue]) => (
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
                <span>Select a node to edit its graph parameters.</span>
              </div>
            )}

            <div className="environment-assembly-selection-card docked">
              <div className="environment-assembly-selection-head">
                <div>
                  <strong>Graph Summary</strong>
                  <span>{geometryBinding.sourceMode}</span>
                </div>
              </div>
              <div className="inline-note">
                <div>Parts: {compiledPreview?.parts.length ?? 0}</div>
                <div>Graph: {graph?.name ?? 'None'}</div>
                <div>Ownership: {graphOwnershipLabel}</div>
                <div>Preset: {typeof graph?.metadata?.presetKey === 'string' ? graph.metadata.presetKey : 'Custom'}</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="environment-assembly-shell simple">
      <div className="environment-assembly-stage" style={{ gridTemplateColumns: isGraphOnly ? 'minmax(0, 1fr)' : 'minmax(280px, 0.95fr) minmax(420px, 1.3fr) minmax(340px, 1fr)' }}>
        {!isGraphOnly ? (
        <aside className="environment-assembly-dock">
          <div className="environment-assembly-actions vertical">
            <label className="field-block full-width">
              <span>Blueprint</span>
              <select value={blueprint?.id ?? ''} onChange={(event) => handleSelectBlueprint(event.target.value)}>
                <option value="">No blueprint bound</option>
                {availableBlueprints.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </label>
            <button className="ghost-button compact" onClick={createAndBindBlueprint} type="button">New Blueprint</button>
            {blueprint ? <button className="ghost-button compact" onClick={() => onDeleteEnvironmentBlueprint(blueprint.id)} type="button">Delete Blueprint</button> : null}
          </div>

          <BlueprintPlanCanvas
            blueprint={blueprint}
            selectedElementId={selectedBlueprintElementId}
            onSelectElement={setSelectedBlueprintElementId}
            onUpdateStructurePoint={updateStructurePoint}
          />

          {selectedBlueprintElement ? (
            <div className="environment-assembly-selection-card docked">
              <div className="environment-assembly-selection-head">
                <div>
                  <strong>{selectedBlueprintElement.label || selectedBlueprintElement.id}</strong>
                  <span>{'type' in selectedBlueprintElement ? String(selectedBlueprintElement.type) : 'site'}</span>
                </div>
              </div>
              {'width' in selectedBlueprintElement ? (
                <div className="environment-assembly-param-grid">
                  <label className="field-block">
                    <span>Width</span>
                    <input value={String(selectedBlueprintElement.width)} onChange={(event) => saveBlueprint((current) => ({ ...current, structures: current.structures.map((entry) => entry.id === selectedBlueprintElement.id ? { ...entry, width: Number(event.target.value) || entry.width } : entry) }))} />
                  </label>
                  <label className="field-block">
                    <span>Height</span>
                    <input value={String(selectedBlueprintElement.height)} onChange={(event) => saveBlueprint((current) => ({ ...current, structures: current.structures.map((entry) => entry.id === selectedBlueprintElement.id ? { ...entry, height: Number(event.target.value) || entry.height } : entry) }))} />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="environment-assembly-selection-card docked is-empty">
              <strong>No blueprint element selected</strong>
              <span>Select a footprint in the semantic plan to edit its geometry and keep the generated graph in sync.</span>
            </div>
          )}

          <div className="environment-assembly-prompt">
            <textarea
              aria-label="Tagged SVG blueprint"
              rows={7}
              value={svgText}
              onChange={(event) => setSvgText(event.target.value)}
              placeholder="Paste tagged SVG with data-gc-role attributes."
            />
            <div className="chip-row">
              <button className="ghost-button compact" onClick={importSvg} type="button">Import SVG</button>
              <button className="ghost-button compact" onClick={() => blueprint ? setSvgText(exportBlueprintToTaggedSvg(blueprint)) : null} type="button">Export SVG</button>
            </div>
          </div>
        </aside>
        ) : null}

        <div className="environment-assembly-main">
          <div className="environment-assembly-hintbar">
            <span>{graphLockedToBlueprint ? 'Blueprint owns this graph and rematerializes it live.' : 'Graph edits are currently detached from blueprint auto-materialization.'}</span>
            <span>{blueprint ? `${blueprint.structures.length} structures, ${blueprint.openings.length} openings, ${blueprint.circulation.length} circulation elements.` : 'Use the graph directly or bind a blueprint for semantic authoring.'}</span>
          </div>
          <div className="environment-assembly-actions vertical" style={{ marginBottom: 12 }}>
            <label className="field-block full-width">
              <span>Graph</span>
              <select value={graph?.key ?? ''} onChange={(event) => handleSelectGraph(event.target.value)}>
                <option value="">No graph bound</option>
                {availableGraphs.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.name}</option>
                ))}
              </select>
            </label>
            <label className="field-block full-width">
              <span>Preset</span>
              <select value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>
                {environmentAssemblyPresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
            </label>
            <div className="chip-row">
              <button className="ghost-button compact" onClick={applyPreset} type="button" disabled={!graph}>Apply Preset</button>
              <button className="ghost-button compact" onClick={createAndBindGraph} type="button">New Graph</button>
              {graph ? <button className="ghost-button compact" onClick={() => onDeleteAssemblyGraph(graph.key)} type="button">Delete Graph</button> : null}
              <button className="primary-button compact" disabled={isOpeningPreview || !graph} onClick={handleOpenPreview} type="button">
                {isOpeningPreview ? 'Opening 3D...' : 'Open 3D'}
              </button>
              {blueprint && graph ? (
                graph.metadata?.blueprintOwnership === 'manual_override'
                  ? <button className="ghost-button compact" onClick={() => onUpsertAssemblyGraph({ ...graph, metadata: { ...graph.metadata, blueprintOwnership: 'generated', blueprintKey: blueprint.id } })} type="button">Reattach</button>
                  : <button className="ghost-button compact" onClick={() => onUpsertAssemblyGraph({ ...graph, metadata: { ...graph.metadata, blueprintOwnership: 'manual_override', blueprintKey: blueprint.id } })} type="button">Detach</button>
              ) : null}
            </div>
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
                const blueprintElementId = graph?.nodes.find((entry) => entry.key === node.id)?.metadata?.blueprintElementId
                setSelectedBlueprintElementId(typeof blueprintElementId === 'string' ? blueprintElementId : null)
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

          {selectedNode ? (
            <div className="environment-assembly-selection-card docked">
              <div className="environment-assembly-selection-head">
                <div>
                  <strong>{selectedNode.title}</strong>
                  <span>{selectedNode.kind}</span>
                </div>
              </div>
              <div className="environment-assembly-param-grid">
                <label className="field-block full-width">
                  <span>Title</span>
                  <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
                </label>
                {Object.entries(selectedNode.params).slice(0, 8).map(([paramKey, paramValue]) => (
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
          ) : null}
        </div>

        {!isGraphOnly ? (
        <aside className="environment-assembly-dock">
          <div className="environment-assembly-prompt">
            <textarea
              aria-label="Environment graph prompt"
              placeholder="Generate or refine blueprint-driven architecture, facades, circulation, and openings."
              rows={4}
              value={promptText}
              onChange={(event) => onChangePromptText(event.target.value)}
            />
            <button className="primary-button compact" disabled={isGeneratingPrompt || promptText.trim().length === 0} onClick={onGeneratePrompt} type="button">
              {isGeneratingPrompt ? 'Generating...' : 'Prompt'}
            </button>
          </div>

          <ThreeSceneViewport
            compiledEnvironment={compiledPreview}
            meshSourceUrl={null}
            modelKind="environment"
            modelLabel={environment.name}
            modelSubtype="structure"
            showFloor
            showGrid
            resetSignal={0}
          />

          <div className="environment-assembly-selection-card docked">
            <div className="environment-assembly-selection-head">
              <div>
                <strong>Preview Summary</strong>
                <span>{geometryBinding.sourceMode}</span>
              </div>
              <button
                className="primary-button compact"
                disabled={isOpeningPreview}
                onClick={handleOpenPreview}
                type="button"
              >
                {isOpeningPreview ? 'Opening 3D...' : 'Open 3D'}
              </button>
            </div>
            <div className="inline-note">
              <div>Parts: {compiledPreview?.parts.length ?? 0}</div>
              <div>Blueprint: {blueprint?.name ?? 'None'}</div>
              <div>Graph: {graph?.name ?? 'None'}</div>
              <div>Ownership: {graphOwnershipLabel}</div>
            </div>
          </div>
        </aside>
        ) : null}
      </div>
    </div>
  )
}
