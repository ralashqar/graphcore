import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetPreviewUrl, resolveAssetSourceUrl } from '../../domain/assets'
import {
  getAssetRefNodeConfig,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  updateNodeMetadataWithAssetRef,
  updateNodeMetadataWithShot,
  type CinematicRun,
  type CinematicSettings,
} from '../../domain/cinematics'
import type {
  AssetDefinition,
  DefinitionBase,
  Diagnostic,
  EdgeDefinition,
  GameSpec,
  GraphCreateInput,
  GraphDefinition,
  NodeDefinition,
} from '../../domain/graphcore'
import {
  applyTemplateToNode,
  createNodeFromTemplate,
  graphNodeLibrary,
  graphNodeTemplatesByKey,
  summarizeCondition,
  summarizeEffects,
} from '../../domain/nodeLibrary'
import { getResolvedDefinition3dBinding } from '../../domain/render3d'
import { FlowNodeCard } from '../graph/FlowNodeCard'
import { EdgeInspector, NodeInspector } from '../graph/inspectors'
import type { GraphContextMenu, GraphNodeData, RailMode } from '../graph/types'
import { filterTemplateGroup, getPlacementPosition, isTemplateAvailableForGraph, isTextInput, uniqueEdgeKey, uniqueGraphKey } from '../graph/utils'

type CinematicRunMode = 'graph_run' | 'preview_still' | 'preview_video'

type CinematicsWorkspaceProps = {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  cinematicRuns: CinematicRun[]
  definitions: DefinitionBase[]
  deletingGraphKey?: string | null
  diagnostics: Diagnostic[]
  gameSpec: GameSpec | null
  selectedEdge: EdgeDefinition | null
  selectedGraph: GraphDefinition | null
  selectedNode: NodeDefinition | null
  snapshotGraphs: GraphDefinition[]
  onClearSelection: () => void
  onConnectEdge: (graphKey: string, edge: EdgeDefinition) => void
  onCreateGraph: (input: GraphCreateInput) => void
  onCreateNode: (graphKey: string, node: NodeDefinition) => void
  onDeleteEdge: (graphKey: string, edgeKey: string) => void
  onDeleteGraph: (graphKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateGraph: (graphKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onMoveNode: (graphKey: string, nodeKey: string, position: NodeDefinition['position']) => void
  onSelectEdge: (key: string | null) => void
  onSelectGraph: (key: string | null) => void
  onSelectNode: (key: string | null) => void
  onStartCinematicRun: (request: { graphKey: string; mode: CinematicRunMode; shotNodeKey?: string | null }) => void
  onUpdateEdge: (graphKey: string, edgeKey: string, changes: Partial<EdgeDefinition>) => void
  onUpdateGameSpecCinematics: (changes: Partial<CinematicSettings>) => void
  onUpdateGraph: (graphKey: string, changes: Partial<GraphDefinition>) => void
  onUpdateNode: (graphKey: string, nodeKey: string, changes: Partial<NodeDefinition>) => void
}

type ShotSourceEntry = {
  asset: AssetDefinition | null
  definition: DefinitionBase | null
  node: NodeDefinition
}

export function CinematicsWorkspace(props: CinematicsWorkspaceProps) {
  const {
    assets,
    canRunCinematics,
    cinematicRuns,
    definitions,
    deletingGraphKey = null,
    diagnostics,
    gameSpec,
    selectedEdge,
    selectedGraph,
    selectedNode,
    snapshotGraphs,
    onClearSelection,
    onConnectEdge,
    onCreateGraph,
    onCreateNode,
    onDeleteEdge,
    onDeleteGraph,
    onDeleteNode,
    onDuplicateGraph,
    onDuplicateNode,
    onMoveNode,
    onSelectEdge,
    onSelectGraph,
    onSelectNode,
    onStartCinematicRun,
    onUpdateEdge,
    onUpdateGameSpecCinematics,
    onUpdateGraph,
    onUpdateNode,
  } = props

  const cinematicGraphs = useMemo(
    () => snapshotGraphs.filter((graph) => graph.graphType === 'cinematic_flow'),
    [snapshotGraphs],
  )
  const currentGraph = selectedGraph?.graphType === 'cinematic_flow'
    ? selectedGraph
    : null
  const currentNode = currentGraph?.nodes.find((node) => node.key === selectedNode?.key) ?? null
  const currentEdge = currentGraph?.edges.find((edge) => edge.key === selectedEdge?.key) ?? null
  const currentGraphRuns = useMemo(
    () => cinematicRuns
      .filter((run) => !currentGraph || run.graphKey === currentGraph.key)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [cinematicRuns, currentGraph],
  )

  const [railMode, setRailMode] = useState<RailMode | 'runs'>('graphs')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const [liveNodes, setLiveNodes] = useState<Node[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])
  const [contextMenu, setContextMenu] = useState<GraphContextMenu | null>(null)
  const [contextMenuSearch, setContextMenuSearch] = useState('')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const contextMenuSearchRef = useRef<HTMLInputElement | null>(null)
  const isDeletingSelectedGraph = currentGraph?.key === deletingGraphKey
  const selectedRun = currentGraphRuns.find((run) => run.id === selectedRunId) ?? currentGraphRuns[0] ?? null

  const nodes = useMemo<Node[]>(() => {
    if (!currentGraph) return []

    return currentGraph.nodes.map((node) => {
      const previewAsset = resolveNodePreviewAsset(node, definitions, assets)
      const shotRunStatus = node.type === 'cinematic_shot'
        ? currentGraphRuns.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null
        : null

      const data: GraphNodeData = {
        node,
        previewUrl: resolveAssetPreviewUrl(previewAsset),
        conditionSummary: summarizeCondition(node.condition),
        effectSummary: buildNodeMetaLines(node, shotRunStatus),
      }

      return {
        id: node.key,
        position: node.position,
        type: 'graphNode',
        data,
      }
    })
  }, [assets, currentGraph, currentGraphRuns, definitions])

  const edges = useMemo<Edge[]>(() => {
    return (currentGraph?.edges ?? []).map((edge) => ({
      id: edge.key,
      source: edge.source.nodeKey,
      sourceHandle: edge.source.portId ?? undefined,
      target: edge.target.nodeKey,
      targetHandle: edge.target.portId ?? 'in',
      label: edge.condition ? (edge.label ? `${edge.label} [if]` : '[if]') : edge.label ?? undefined,
      labelShowBg: Boolean(edge.condition),
      labelBgStyle: edge.condition ? { fill: '#13202a', fillOpacity: 0.96 } : undefined,
      labelStyle: edge.condition ? { fill: '#5eead4', fontSize: 11, fontWeight: 600 } : undefined,
      animated: edge.source.portId === 'true' || edge.source.portId === 'false',
    }))
  }, [currentGraph])

  useEffect(() => {
    setLiveNodes(nodes)
  }, [nodes])

  useEffect(() => {
    setLiveEdges(edges)
  }, [edges])

  useEffect(() => {
    if (!contextMenu || contextMenu.kind !== 'pane') return
    setContextMenuSearch('')
    const timeout = window.setTimeout(() => contextMenuSearchRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [contextMenu])

  useEffect(() => {
    if (!selectedRunId && currentGraphRuns.length > 0) {
      setSelectedRunId(currentGraphRuns[0].id)
      return
    }

    if (selectedRunId && currentGraphRuns.every((run) => run.id !== selectedRunId)) {
      setSelectedRunId(currentGraphRuns[0]?.id ?? null)
    }
  }, [currentGraphRuns, selectedRunId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentGraph) return
      if (event.key === 'Escape') onClearSelection()
      if (event.key.toLowerCase() === 'a' && !isTextInput(event.target)) {
        event.preventDefault()
        openPaletteAtCanvasCenter()
      }
      if (event.key.toLowerCase() === 'f' && !isTextInput(event.target)) {
        event.preventDefault()
        refocusViewport()
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTextInput(event.target)) {
        if (currentEdge) onDeleteEdge(currentGraph.key, currentEdge.key)
        else if (currentNode) onDeleteNode(currentGraph.key, currentNode.key)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && currentNode) {
        event.preventDefault()
        onDuplicateNode(currentGraph.key, currentNode.key)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentEdge, currentGraph, currentNode, onClearSelection, onDeleteEdge, onDeleteNode, onDuplicateNode])

  function createGraph() {
    onCreateGraph({
      name: 'New Cinematic Flow',
      key: uniqueGraphKey(cinematicGraphs, `graph.cinematic_flow_${cinematicGraphs.length + 1}`),
      graphType: 'cinematic_flow',
      summary: 'Playable cinematic sequence graph.',
    })
  }

  function placeTemplate(templateKey: string, positionOverride?: NodeDefinition['position']) {
    if (!currentGraph) return
    const template = graphNodeTemplatesByKey.get(templateKey)
    if (!template) return
    const count = currentGraph.nodes.filter((node) => node.templateKey === templateKey || node.type === template.baseNodeType).length + 1
    const position = positionOverride ?? getPlacementPosition(currentGraph, currentNode, flowInstance, canvasRef.current)
    onCreateNode(currentGraph.key, createNodeFromTemplate(currentGraph, template, count, position))
    setContextMenu(null)
  }

  function handleNodesChange(changes: NodeChange<Node>[]) {
    if (!currentGraph) return
    setLiveNodes((current) => applyNodeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        onMoveNode(currentGraph.key, change.id, change.position)
      }
      if (change.type === 'remove') onDeleteNode(currentGraph.key, change.id)
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge>[]) {
    if (!currentGraph) return
    setLiveEdges((current) => applyEdgeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'remove') onDeleteEdge(currentGraph.key, change.id)
    }
  }

  function handleConnect(connection: Connection) {
    if (!currentGraph || !connection.source || !connection.target) return

    const sourceNode = currentGraph.nodes.find((node) => node.key === connection.source)
    const targetNode = currentGraph.nodes.find((node) => node.key === connection.target)
    if (!sourceNode || !targetNode) return

    if (sourceNode.type === 'asset_ref' && targetNode.type !== 'cinematic_shot') return
    if (targetNode.type === 'asset_ref') return

    const sourceHandle = connection.sourceHandle ?? (sourceNode.type === 'asset_ref' ? 'asset_out' : 'out')
    const targetHandle = connection.targetHandle ?? (
      targetNode.type === 'cinematic_shot'
        ? sourceNode.type === 'asset_ref'
          ? 'asset_in'
          : 'flow_in'
        : 'in'
    )
    const edgeKey = uniqueEdgeKey(currentGraph, connection.source, connection.target)

    onConnectEdge(currentGraph.key, {
      id: `edge-${Date.now()}`,
      key: edgeKey,
      source: { nodeKey: connection.source, portId: sourceHandle },
      target: { nodeKey: connection.target, portId: targetHandle },
      label: null,
      condition: null,
      metadata: {},
    })
    setLiveEdges((current) => [
      ...current,
      {
        id: edgeKey,
        source: connection.source,
        sourceHandle,
        target: connection.target,
        targetHandle,
      },
    ])
  }

  function handlePaneContextMenu(event: MouseEvent | React.MouseEvent<Element, MouseEvent>) {
    event.preventDefault()
    if (!flowInstance || !canvasRef.current) return
    const flowPosition = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setContextMenu({
      kind: 'pane',
      x: event.clientX - canvasRef.current.getBoundingClientRect().left,
      y: event.clientY - canvasRef.current.getBoundingClientRect().top,
      flowPosition,
    })
  }

  function handleNodeContextMenu(event: React.MouseEvent, node: Node) {
    event.preventDefault()
    if (!canvasRef.current) return
    onSelectNode(node.id)
    setContextMenu({
      kind: 'node',
      nodeKey: node.id,
      x: event.clientX - canvasRef.current.getBoundingClientRect().left,
      y: event.clientY - canvasRef.current.getBoundingClientRect().top,
    })
  }

  function openPaletteAtCanvasCenter() {
    if (!flowInstance || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = rect.width / 2
    const y = rect.height / 2
    const flowPosition = flowInstance.screenToFlowPosition({ x: rect.left + x, y: rect.top + y })
    setContextMenu({
      kind: 'pane',
      x,
      y,
      flowPosition,
    })
  }

  function refocusViewport() {
    if (!flowInstance || !currentGraph) return
    if (currentNode) {
      void flowInstance.setCenter(currentNode.position.x + 120, currentNode.position.y + 48, {
        zoom: 1.1,
        duration: 240,
      })
      return
    }
    void flowInstance.fitView({ duration: 240, padding: 0.24 })
  }

  function applyTemplateChange(nodeKey: string, templateKey: string) {
    if (!currentGraph) return
    const existingNode = currentGraph.nodes.find((node) => node.key === nodeKey)
    if (!existingNode || !graphNodeTemplatesByKey.get(templateKey)) return
    const nextNode = applyTemplateToNode(existingNode, templateKey)
    setLiveNodes((current) =>
      current.map((node) =>
        node.id === nodeKey
          ? {
              ...node,
              data: {
                ...(node.data as GraphNodeData),
                node: nextNode,
                conditionSummary: summarizeCondition(nextNode.condition),
                effectSummary: summarizeEffects(nextNode.effects).slice(0, 2),
              },
            }
          : node,
      ),
    )
    onUpdateNode(currentGraph.key, nodeKey, {
      type: nextNode.type,
      templateKey: nextNode.templateKey,
      subtitle: nextNode.subtitle,
      body: nextNode.body,
      condition: nextNode.condition,
      effects: nextNode.effects,
      ports: nextNode.ports,
      display: nextNode.display,
      metadata: nextNode.metadata,
    })
  }

  function updateGraphCinematics(changes: Partial<CinematicSettings>) {
    if (!currentGraph) return
    const currentSettings = getCinematicSettings({}, currentGraph.metadata)
    onUpdateGraph(currentGraph.key, {
      metadata: {
        ...currentGraph.metadata,
        cinematics: {
          ...currentSettings,
          ...changes,
        },
      },
    })
  }

  const projectSettings = getCinematicSettings(gameSpec ?? {}, {})
  const graphSettings = getCinematicSettings(gameSpec ?? {}, currentGraph?.metadata ?? {})

  return (
    <div className="focus-layout graph-layout cinematics-layout">
      <aside className="focus-rail graph-rail">
        <div className="rail-collection-head">
          <div className="segmented-control">
            <button className={railMode === 'graphs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('graphs')} type="button">Flows</button>
            <button className={railMode === 'library' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('library')} type="button">Library</button>
            <button className={railMode === 'runs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('runs')} type="button">Runs</button>
          </div>
        </div>
        {railMode === 'graphs' ? (
          <div className="graph-rail-stack">
            <button className="primary-button compact" onClick={createGraph} type="button">+ New Cinematic</button>
            <div className="rail-list">
              {cinematicGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === currentGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <strong>{graph.name}</strong>
                  <span>{graph.summary || graph.graphType}</span>
                </button>
              ))}
              {cinematicGraphs.length === 0 ? <div className="inline-note">No cinematic graphs yet. Create one to start sequencing shots.</div> : null}
            </div>
          </div>
        ) : null}
        {railMode === 'library' ? (
          <div className="graph-library">
            <div className="rail-section">
              <span className="section-label">Shot Presets</span>
              <div className="graph-library-grid cinematic-preset-grid">
                {['cinematic_establishing', 'cinematic_dialogue', 'cinematic_reveal', 'cinematic_action', 'cinematic_insert', 'cinematic_transition'].map((templateKey) => {
                  const template = graphNodeTemplatesByKey.get(templateKey)
                  if (!template || (currentGraph && !isTemplateAvailableForGraph(template, currentGraph))) return null
                  return (
                    <button key={template.key} className="library-button cinematic-preset-card" onClick={() => placeTemplate(template.key)} type="button">
                      <strong>{template.label}</strong>
                      <span>{template.defaultSubtitle ?? template.baseNodeType}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {graphNodeLibrary.map((group) => (
              <div key={group.key} className="rail-section">
                <span className="section-label">{group.label}</span>
                <div className="graph-library-grid">
                  {group.templates
                    .filter((template) => currentGraph ? isTemplateAvailableForGraph(template, currentGraph) : true)
                    .map((template) => (
                      <button key={template.key} className="library-button" onClick={() => placeTemplate(template.key)} type="button">
                        <strong>{template.label}</strong>
                        <span>{template.baseNodeType}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {railMode === 'runs' ? (
          <div className="graph-library cinematic-run-rail">
            <div className="rail-section">
              <span className="section-label">Recent Runs</span>
              <div className="rail-list">
                {currentGraphRuns.map((run) => (
                  <button key={run.id} className={run.id === selectedRun?.id ? 'rail-button is-active' : 'rail-button'} onClick={() => setSelectedRunId(run.id)} type="button">
                    <strong>{run.graphName}</strong>
                    <span>{formatRunLabel(run)}</span>
                  </button>
                ))}
                {currentGraphRuns.length === 0 ? <div className="inline-note">No runs yet for this cinematic workspace.</div> : null}
              </div>
            </div>
            {selectedRun ? (
              <div className="rail-section">
                <span className="section-label">Run Jobs</span>
                <div className="diagnostic-stack">
                  {selectedRun.jobs.map((job) => (
                    <div key={job.id} className="inline-note">
                      <strong>{job.kind}</strong>
                      <span> {job.shotNodeKey} - {job.status}{job.errorMessage ? ` - ${job.errorMessage}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <section className="main-surface graph-surface">
        <div className="graph-toolbar cinematic-toolbar">
          <select value={currentGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
            {cinematicGraphs.length === 0 ? <option value="">No cinematic flows</option> : null}
            {cinematicGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
          </select>
          <input value={currentGraph?.name ?? ''} onChange={(event) => currentGraph && onUpdateGraph(currentGraph.key, { name: event.target.value })} placeholder="Cinematic flow name" />
          <select value={graphSettings.specializationMode} onChange={(event) => updateGraphCinematics({ specializationMode: event.target.value as CinematicSettings['specializationMode'] })}>
            <option value="story">Story</option>
            <option value="ugc">UGC</option>
          </select>
          <button className="ghost-button compact" onClick={() => currentGraph && onDuplicateGraph(currentGraph.key)} type="button">Duplicate</button>
          <button className={isDeletingSelectedGraph ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={isDeletingSelectedGraph} onClick={() => currentGraph && onDeleteGraph(currentGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
          <button className="primary-button compact" disabled={!currentGraph || !canRunCinematics} onClick={() => currentGraph && onStartCinematicRun({ graphKey: currentGraph.key, mode: 'graph_run' })} type="button">Run Cinematic</button>
        </div>
        <div className="canvas-stage graph-canvas" ref={canvasRef}>
          <ReactFlow
            fitView
            nodes={liveNodes}
            edges={liveEdges}
            nodeTypes={{ graphNode: FlowNodeCard }}
            nodesDraggable
            nodesConnectable
            onInit={setFlowInstance}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
            onPaneClick={() => {
              setContextMenu(null)
              onClearSelection()
            }}
            onPaneContextMenu={handlePaneContextMenu}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
          {contextMenu ? (
            <div className="graph-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
              {contextMenu.kind === 'pane' ? (
                <>
                  <span className="section-label">Add Node</span>
                  <input
                    ref={contextMenuSearchRef}
                    className="context-menu-search"
                    placeholder="Search nodes..."
                    value={contextMenuSearch}
                    onChange={(event) => setContextMenuSearch(event.target.value)}
                  />
                  {graphNodeLibrary.map((group) => (
                    filterTemplateGroup(group, contextMenuSearch, currentGraph).length > 0 ? (
                      <div key={group.key} className="context-menu-group">
                        <strong>{group.label}</strong>
                        <div className="context-menu-list">
                          {filterTemplateGroup(group, contextMenuSearch, currentGraph)
                            .map((template) => (
                              <button key={template.key} className="context-menu-item" onClick={() => placeTemplate(template.key, contextMenu.flowPosition)} type="button">
                                <span>{template.label}</span>
                                <small>{template.baseNodeType}</small>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null
                  ))}
                </>
              ) : (
                <>
                  <span className="section-label">Node Actions</span>
                  <button className="context-menu-item" onClick={() => { currentGraph && onDuplicateNode(currentGraph.key, contextMenu.nodeKey); setContextMenu(null) }} type="button"><span>Duplicate Node</span></button>
                  <button className="context-menu-item danger" onClick={() => { currentGraph && onDeleteNode(currentGraph.key, contextMenu.nodeKey); setContextMenu(null) }} type="button"><span>Delete Node</span></button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="graph-diagnostic-row">
          {(diagnostics.filter((item) => item.graphKey === currentGraph?.key).slice(0, 4)).map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>
          ))}
        </div>
      </section>

      <aside className="context-drawer">
        {currentEdge && currentGraph ? (
          <EdgeInspector definitions={definitions} edge={currentEdge} onUpdate={(changes) => onUpdateEdge(currentGraph.key, currentEdge.key, changes)} />
        ) : currentNode && currentGraph ? (
          currentNode.type === 'asset_ref' ? (
            <AssetRefInspector
              assets={assets}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'cinematic_shot' ? (
            <CinematicShotInspector
              assets={assets}
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              runs={currentGraphRuns}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onGenerate={(mode) => onStartCinematicRun({ graphKey: currentGraph.key, mode, shotNodeKey: currentNode.key })}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : (
            <NodeInspector assets={assets} definitions={definitions} graph={currentGraph} graphs={snapshotGraphs} node={currentNode} onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)} onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)} onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)} />
          )
        ) : currentGraph ? (
          <CinematicGraphInspector
            currentSettings={graphSettings}
            diagnostics={diagnostics.filter((item) => item.graphKey === currentGraph.key)}
            graph={currentGraph}
            projectSettings={projectSettings}
            onAddPresetNode={placeTemplate}
            onUpdate={(changes) => onUpdateGraph(currentGraph.key, changes)}
            onUpdateGraphCinematics={updateGraphCinematics}
            onUpdateProjectCinematics={onUpdateGameSpecCinematics}
          />
        ) : (
          <div className="detail-stack compact">
            <span className="eyebrow">Cinematics</span>
            <h3>Select or create a cinematic flow</h3>
            <div className="inline-note">Author source assets, wire shots together as a playable sequence, then run still and video generation from the graph.</div>
          </div>
        )}
      </aside>
    </div>
  )
}

function CinematicGraphInspector({
  currentSettings,
  diagnostics,
  graph,
  projectSettings,
  onAddPresetNode,
  onUpdate,
  onUpdateGraphCinematics,
  onUpdateProjectCinematics,
}: {
  currentSettings: CinematicSettings
  diagnostics: Diagnostic[]
  graph: GraphDefinition
  projectSettings: CinematicSettings
  onAddPresetNode: (templateKey: string) => void
  onUpdate: (changes: Partial<GraphDefinition>) => void
  onUpdateGraphCinematics: (changes: Partial<CinematicSettings>) => void
  onUpdateProjectCinematics: (changes: Partial<CinematicSettings>) => void
}) {
  return (
    <div className="detail-stack compact">
      <span className="eyebrow">Cinematic Flow</span>
      <h3>{graph.name}</h3>
      <label className="field-block">
        <span>Key</span>
        <input value={graph.key} onChange={(event) => onUpdate({ key: event.target.value })} />
      </label>
      <label className="field-block full-width">
        <span>Summary</span>
        <textarea rows={3} value={graph.summary} onChange={(event) => onUpdate({ summary: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Entry Node</span>
        <select value={graph.entryNodeKey ?? ''} onChange={(event) => onUpdate({ entryNodeKey: event.target.value || null })}>
          <option value="">No entry node</option>
          {graph.nodes.map((node) => <option key={node.key} value={node.key}>{node.title}</option>)}
        </select>
      </label>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Project Defaults</span>
            <h3>Cinematic Settings</h3>
          </div>
        </div>
        <CinematicSettingsEditor settings={projectSettings} onChange={onUpdateProjectCinematics} />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Flow Overrides</span>
            <h3>Graph Settings</h3>
          </div>
        </div>
        <CinematicSettingsEditor settings={currentSettings} onChange={onUpdateGraphCinematics} />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Shot Presets</span>
            <h3>Quick Add</h3>
          </div>
        </div>
        <div className="graph-library-grid cinematic-preset-grid">
          {[
            ['cinematic_establishing', 'Establishing'],
            ['cinematic_dialogue', 'Dialogue'],
            ['cinematic_reveal', 'Reveal'],
            ['cinematic_action', 'Action'],
            ['cinematic_insert', 'Insert'],
            ['cinematic_transition', 'Transition'],
          ].map(([templateKey, label]) => (
            <button key={templateKey} className="library-button cinematic-preset-card" onClick={() => onAddPresetNode(templateKey)} type="button">
              <strong>{label}</strong>
              <span>Add node</span>
            </button>
          ))}
        </div>
      </div>

      <div className="diagnostic-stack">
        {diagnostics.length === 0 ? <div className="inline-note">No graph diagnostics.</div> : diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}
      </div>
    </div>
  )
}

function AssetRefInspector({
  assets,
  currentGraph,
  definitions,
  node,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getAssetRefNodeConfig(node)
  const availableDefinitions = definitions.filter((definition) => ['character', 'environment', 'item'].includes(definition.kind))
  const selectedDefinition = availableDefinitions.find((definition) => definition.key === config.definitionKey) ?? null
  const previewAsset = resolveDefinitionPreviewAsset(selectedDefinition, assets)

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Source Asset'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'asset_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Referenced Definition</span>
        <select
          value={config.definitionKey ?? ''}
          onChange={(event) => {
            const definition = availableDefinitions.find((entry) => entry.key === event.target.value) ?? null
            onUpdate({
              metadata: updateNodeMetadataWithAssetRef(node.metadata, {
                definitionKey: definition?.key ?? null,
                assetRole: mapDefinitionKindToAssetRole(definition?.kind ?? null),
              }),
              title: definition ? definition.name : node.title,
              subtitle: definition ? definition.kind : node.subtitle,
            })
          }}
        >
          <option value="">Select character, environment, or item</option>
          {availableDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name} ({definition.kind})</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Role</span>
        <select value={config.assetRole ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithAssetRef(node.metadata, { assetRole: (event.target.value || null) as ReturnType<typeof mapDefinitionKindToAssetRole> }) })}>
          <option value="">Auto</option>
          <option value="character">Character</option>
          <option value="environment">Environment</option>
          <option value="item">Item</option>
        </select>
      </label>
      <label className="field-block full-width">
        <span>Staging Notes</span>
        <textarea rows={4} value={config.stagingNotes} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithAssetRef(node.metadata, { stagingNotes: event.target.value }) })} placeholder="Blocking, pose, prop placement, wardrobe, or other scene notes for this source." />
      </label>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Preview</span>
            <h3>{selectedDefinition?.name ?? 'No source selected'}</h3>
          </div>
        </div>
        {previewAsset ? <AssetPreview asset={previewAsset} /> : <div className="inline-note">Bind a project character, environment, or item with a usable preview image before generating shots.</div>}
      </div>
    </div>
  )
}

function CinematicShotInspector({
  assets,
  canRunCinematics,
  currentGraph,
  definitions,
  node,
  runs,
  onApplyTemplateChange,
  onDelete,
  onGenerate,
  onUpdate,
}: {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  runs: CinematicRun[]
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onGenerate: (mode: CinematicRunMode) => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getCinematicShotNodeConfig(node)
  const sources = collectShotSources(currentGraph, node, definitions, assets)
  const missingSources = sources.filter((source) => !resolveAssetSourceUrl(source.asset))
  const canGenerateStill = sources.length > 0
  const stillAsset = assets.find((asset) => asset.key === config.stillAssetKey) ?? null
  const videoAsset = assets.find((asset) => asset.key === config.videoAssetKey) ?? null
  const latestRun = runs.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Shot'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'cinematic_shot'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Subtitle</span>
        <input value={node.subtitle ?? ''} onChange={(event) => onUpdate({ subtitle: event.target.value || null })} />
      </label>
      <label className="field-block full-width">
        <span>Shot Script</span>
        <textarea rows={5} value={node.body.text ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, text: event.target.value } })} placeholder="Describe the beat, blocking, emotional action, and what the camera should emphasize." />
      </label>
      <label className="field-block full-width">
        <span>Visual Prompt Override</span>
        <textarea rows={4} value={config.visualPrompt} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { visualPrompt: event.target.value }) })} placeholder="Optional shot-specific visual prompt language layered on top of project and source context." />
      </label>

      <div className="editor-grid compact cinematic-field-grid">
        <label className="field-block compact-block">
          <span>Shot Type</span>
          <select value={config.shotType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { shotType: event.target.value as typeof config.shotType }) })}>
            <option value="custom">Custom</option>
            <option value="establishing">Establishing</option>
            <option value="dialogue">Dialogue</option>
            <option value="reveal">Reveal</option>
            <option value="action">Action</option>
            <option value="insert">Insert</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Framing</span>
          <input value={config.framing} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { framing: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Camera Angle</span>
          <input value={config.cameraAngle} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { cameraAngle: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Movement</span>
          <input value={config.cameraMovement} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { cameraMovement: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Lens</span>
          <input value={config.lensPreference} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { lensPreference: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Duration (sec)</span>
          <input type="number" min="1" max="20" value={config.durationSeconds ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { durationSeconds: event.target.value ? Number(event.target.value) : null }) })} />
        </label>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Inputs</span>
            <h3>{sources.length} source{sources.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {sources.length === 0 ? <div className="inline-note">Connect at least one `Source Asset` node into this shot on the `asset_in` port.</div> : null}
          {sources.map((source) => (
            <div key={source.node.key} className="inline-note">
              <strong>{source.definition?.name ?? source.node.title}</strong>
              <span>{resolveAssetSourceUrl(source.asset) ? ' ready' : ' missing preview image'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="detail-actions cinematic-action-row">
        <button className="ghost-button compact" disabled={!canRunCinematics || !canGenerateStill} onClick={() => onGenerate('preview_still')} type="button">Generate Still</button>
        <button className="primary-button compact" disabled={!canRunCinematics || (!stillAsset && !canGenerateStill)} onClick={() => onGenerate('preview_video')} type="button">Generate Clip</button>
      </div>
      {!canRunCinematics ? <div className="inline-note">Connect to a live Supabase workspace before starting cinematic generation jobs.</div> : null}
      {missingSources.length > 0 ? <div className="inline-note is-warning">Sources without preview images will fall back to text-only context. Add preview art for stronger composition control.</div> : null}
      {latestRun ? <div className="inline-note">Latest run: {formatRunLabel(latestRun)}</div> : null}

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Still</span>
            <h3>{stillAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {stillAsset ? <AssetPreview asset={stillAsset} /> : <div className="inline-note">No still has been generated for this shot yet.</div>}
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Clip</span>
            <h3>{videoAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {videoAsset ? <AssetPreview asset={videoAsset} /> : <div className="inline-note">No clip has been generated for this shot yet.</div>}
      </div>
    </div>
  )
}

function CinematicSettingsEditor({
  settings,
  onChange,
}: {
  settings: CinematicSettings
  onChange: (changes: Partial<CinematicSettings>) => void
}) {
  return (
    <div className="editor-grid compact cinematic-field-grid">
      <label className="field-block compact-block">
        <span>Still Aspect</span>
        <select value={settings.stillAspectRatio} onChange={(event) => onChange({ stillAspectRatio: event.target.value as CinematicSettings['stillAspectRatio'] })}>
          <option value="16:9">16:9</option>
          <option value="21:9">21:9</option>
          <option value="9:16">9:16</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
          <option value="1:1">1:1</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Still Resolution</span>
        <select value={settings.stillResolution} onChange={(event) => onChange({ stillResolution: event.target.value as CinematicSettings['stillResolution'] })}>
          <option value="1K">1K</option>
          <option value="2K">2K</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Video Resolution</span>
        <select value={settings.videoResolution} onChange={(event) => onChange({ videoResolution: event.target.value as CinematicSettings['videoResolution'] })}>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Default Clip</span>
        <input type="number" min="1" max="20" value={settings.defaultClipSeconds} onChange={(event) => onChange({ defaultClipSeconds: Number(event.target.value) || 1 })} />
      </label>
      <label className="field-block compact-block">
        <span>Default FPS</span>
        <input type="number" min="1" max="60" value={settings.defaultFps} onChange={(event) => onChange({ defaultFps: Number(event.target.value) || 24 })} />
      </label>
      <label className="field-block compact-block">
        <span>Mode</span>
        <select value={settings.specializationMode} onChange={(event) => onChange({ specializationMode: event.target.value as CinematicSettings['specializationMode'] })}>
          <option value="story">Story</option>
          <option value="ugc">UGC</option>
        </select>
      </label>
    </div>
  )
}

function AssetPreview({ asset }: { asset: AssetDefinition }) {
  const previewUrl = resolveAssetPreviewUrl(asset)
  if (!previewUrl) return <div className="inline-note">No preview available.</div>

  return asset.kind === 'video'
    ? <video className="asset-detail-video cinematic-preview-video" controls playsInline preload="metadata" src={previewUrl} />
    : <img alt={asset.name} className="cinematic-preview-image" src={previewUrl} />
}

function buildNodeMetaLines(node: NodeDefinition, shotRunStatus: CinematicRun | null) {
  if (node.type === 'asset_ref') {
    const config = getAssetRefNodeConfig(node)
    return [config.assetRole ?? 'source', config.definitionKey ?? 'unbound'].filter(Boolean)
  }

  if (node.type === 'cinematic_shot') {
    const config = getCinematicShotNodeConfig(node)
    return [
      config.shotType,
      config.framing || config.cameraMovement || config.cameraAngle,
      shotRunStatus ? `${shotRunStatus.mode} - ${shotRunStatus.status}` : null,
    ].filter((value): value is string => Boolean(value))
  }

  return summarizeEffects(node.effects).slice(0, 2)
}

function resolveNodePreviewAsset(node: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]) {
  if (node.type === 'asset_ref') {
    const definitionKey = getAssetRefNodeConfig(node).definitionKey
    const definition = definitions.find((entry) => entry.key === definitionKey) ?? null
    return resolveDefinitionPreviewAsset(definition, assets)
  }

  if (node.type === 'cinematic_shot') {
    const shot = getCinematicShotNodeConfig(node)
    return assets.find((asset) => asset.key === shot.stillAssetKey) ?? null
  }

  return assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey)) ?? null
}

function resolveDefinitionPreviewAsset(definition: DefinitionBase | null, assets: AssetDefinition[]) {
  if (!definition) return null
  const binding = getResolvedDefinition3dBinding(definition)
  const previewKey = binding.previewImageAssetKey ?? definition.iconAssetKey ?? null
  return assets.find((asset) => asset.key === previewKey) ?? null
}

function collectShotSources(graph: GraphDefinition, shotNode: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]): ShotSourceEntry[] {
  return graph.edges
    .filter((edge) => edge.target.nodeKey === shotNode.key && edge.target.portId === 'asset_in')
    .map((edge) => graph.nodes.find((node) => node.key === edge.source.nodeKey) ?? null)
    .filter((node): node is NodeDefinition => Boolean(node && node.type === 'asset_ref'))
    .map((node) => {
      const config = getAssetRefNodeConfig(node)
      const definition = definitions.find((entry) => entry.key === config.definitionKey) ?? null
      const asset = resolveDefinitionPreviewAsset(definition, assets)
      return { node, definition, asset }
    })
}

function mapDefinitionKindToAssetRole(kind: DefinitionBase['kind'] | null) {
  if (kind === 'character') return 'character'
  if (kind === 'environment') return 'environment'
  if (kind === 'item') return 'item'
  return null
}

function formatRunLabel(run: CinematicRun) {
  return `${run.mode.replace(/_/g, ' ')} - ${run.status} - ${new Date(run.updatedAt).toLocaleString()}`
}
