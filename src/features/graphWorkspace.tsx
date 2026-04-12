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

import type { GraphType, NodeDefinition } from '../domain/graphcore'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../domain/worldBuild'
import {
  applyTemplateToNode,
  createNodeFromTemplate,
  graphNodeLibrary,
  graphNodeTemplatesByKey,
  normalizeNode,
  summarizeCondition,
  summarizeEffects,
} from '../domain/nodeLibrary'
import { FlowNodeCard } from './graph/FlowNodeCard'
import { EdgeInspector, GraphInspector, NodeInspector } from './graph/inspectors'
import type { GraphContextMenu, GraphNodeData, GraphWorkspaceProps, RailMode } from './graph/types'
import { filterTemplateGroup, getPlacementPosition, isTemplateAvailableForGraph, isTextInput, uniqueEdgeKey, uniqueGraphKey } from './graph/utils'

export function GraphWorkspace(props: GraphWorkspaceProps) {
  const {
    assets,
    deletingGraphKey = null,
    definitions,
    diagnostics,
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
    onUpdateEdge,
    onUpdateGraph,
    onUpdateNode,
  } = props

  const [railMode, setRailMode] = useState<RailMode>('graphs')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const [liveNodes, setLiveNodes] = useState<Node[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])
  const [contextMenu, setContextMenu] = useState<GraphContextMenu | null>(null)
  const [contextMenuSearch, setContextMenuSearch] = useState('')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const contextMenuSearchRef = useRef<HTMLInputElement | null>(null)
  const isSelectedGraphPending = isPendingGenerationResource(selectedGraph)
  const isDeletingSelectedGraph = selectedGraph?.key === deletingGraphKey

  const nodes = useMemo<Node[]>(() => {
    return (selectedGraph?.nodes ?? []).map((node) => {
      const previewAsset = assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey))
      const previewUrl =
        typeof previewAsset?.metadata.previewUrl === 'string'
          ? previewAsset.metadata.previewUrl
          : typeof previewAsset?.metadata.sourceUrl === 'string'
            ? previewAsset.metadata.sourceUrl
            : null

      const data: GraphNodeData = {
        node,
        previewUrl,
        conditionSummary: summarizeCondition(node.condition),
        effectSummary: summarizeEffects(node.effects).slice(0, 2),
        onAddChoice: () => selectedGraph && addChoiceToNode(selectedGraph.key, node.key),
        onUpdateChoiceLabel: (choiceId: string, label: string) => selectedGraph && updateChoiceLabel(selectedGraph.key, node.key, choiceId, label),
      }

      return {
        id: node.key,
        position: node.position,
        type: 'graphNode',
        data,
      }
    })
  }, [assets, selectedGraph])

  const edges = useMemo<Edge[]>(() => {
    return (selectedGraph?.edges ?? []).map((edge) => ({
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
  }, [selectedGraph])

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
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedGraph) return
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
        if (selectedEdge) onDeleteEdge(selectedGraph.key, selectedEdge.key)
        else if (selectedNode) onDeleteNode(selectedGraph.key, selectedNode.key)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedNode) {
        event.preventDefault()
        onDuplicateNode(selectedGraph.key, selectedNode.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClearSelection, onDeleteEdge, onDeleteNode, onDuplicateNode, selectedEdge, selectedGraph, selectedNode])

  function createGraph(graphType: GraphType = 'narrative_flow') {
    const suffix = `${graphType}_${snapshotGraphs.length + 1}`
    onCreateGraph({
      name: graphType === 'narrative_flow' ? 'New Narrative Flow' : graphType === 'quest_flow' ? 'New Quest Flow' : 'New System Graph',
      key: uniqueGraphKey(snapshotGraphs, `graph.${suffix}`),
      graphType,
      summary: graphType === 'narrative_flow' ? 'Branching narrative graph.' : graphType === 'quest_flow' ? 'Quest progression graph.' : 'Reusable system logic graph.',
    })
  }

  function placeTemplate(templateKey: string, positionOverride?: NodeDefinition['position']) {
    if (!selectedGraph) return
    const template = graphNodeTemplatesByKey.get(templateKey)
    if (!template) return
    const count = selectedGraph.nodes.filter((node) => node.templateKey === templateKey || node.type === template.baseNodeType).length + 1
    const position = positionOverride ?? getPlacementPosition(selectedGraph, selectedNode, flowInstance, canvasRef.current)
    onCreateNode(selectedGraph.key, createNodeFromTemplate(selectedGraph, template, count, position))
    setContextMenu(null)
  }

  function handleNodesChange(changes: NodeChange<Node>[]) {
    if (!selectedGraph) return
    setLiveNodes((current) => applyNodeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        onMoveNode(selectedGraph.key, change.id, change.position)
      }
      if (change.type === 'remove') onDeleteNode(selectedGraph.key, change.id)
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge>[]) {
    if (!selectedGraph) return
    setLiveEdges((current) => applyEdgeChanges(changes, current))
    for (const change of changes) {
      if (change.type === 'remove') onDeleteEdge(selectedGraph.key, change.id)
    }
  }

  function handleConnect(connection: Connection) {
    if (!selectedGraph || !connection.source || !connection.target) return
    onConnectEdge(selectedGraph.key, {
      id: `edge-${Date.now()}`,
      key: uniqueEdgeKey(selectedGraph, connection.source, connection.target),
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'in' },
      label: null,
      condition: null,
      metadata: {},
    })
    setLiveEdges((current) => [
      ...current,
      {
        id: uniqueEdgeKey(selectedGraph, connection.source, connection.target),
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? 'out',
        target: connection.target,
        targetHandle: connection.targetHandle ?? 'in',
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
    if (!flowInstance || !selectedGraph) return
    if (selectedNode) {
      void flowInstance.setCenter(selectedNode.position.x + 120, selectedNode.position.y + 48, {
        zoom: 1.1,
        duration: 240,
      })
      return
    }
    void flowInstance.fitView({ duration: 240, padding: 0.24 })
  }

  function applyTemplateChange(nodeKey: string, templateKey: string) {
    if (!selectedGraph) return
    const currentNode = selectedGraph.nodes.find((node) => node.key === nodeKey)
    if (!currentNode || !graphNodeTemplatesByKey.get(templateKey)) return
    const nextNode = applyTemplateToNode(currentNode, templateKey)
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
    onUpdateNode(selectedGraph.key, nodeKey, {
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

  function addChoiceToNode(graphKey: string, nodeKey: string) {
    const graphNode = selectedGraph?.nodes.find((node) => node.key === nodeKey)
    if (!graphNode) return
    const nextChoices = [
      ...graphNode.body.choices,
      {
        id: `choice_${graphNode.body.choices.length + 1}`,
        label: `Choice ${graphNode.body.choices.length + 1}`,
      },
    ]
    const nextNode = normalizeNode({
      ...graphNode,
      body: { ...graphNode.body, choices: nextChoices },
    })
    setLiveNodes((current) =>
      current.map((node) =>
        node.id === nodeKey
          ? {
              ...node,
              data: {
                ...(node.data as GraphNodeData),
                node: nextNode,
              },
            }
          : node,
      ),
    )
    onUpdateNode(graphKey, nodeKey, {
      body: nextNode.body,
      ports: nextNode.ports,
    })
  }

  function updateChoiceLabel(graphKey: string, nodeKey: string, choiceId: string, label: string) {
    const graphNode = selectedGraph?.nodes.find((node) => node.key === nodeKey)
    if (!graphNode) return
    const nextChoices = graphNode.body.choices.map((choice) => (choice.id === choiceId ? { ...choice, label } : choice))
    const nextNode = normalizeNode({
      ...graphNode,
      body: { ...graphNode.body, choices: nextChoices },
    })
    setLiveNodes((current) =>
      current.map((node) =>
        node.id === nodeKey
          ? {
              ...node,
              data: {
                ...(node.data as GraphNodeData),
                node: nextNode,
              },
            }
          : node,
      ),
    )
    onUpdateNode(graphKey, nodeKey, {
      body: nextNode.body,
      ports: nextNode.ports,
    })
  }

  return (
    <div className="focus-layout graph-layout">
      <aside className="focus-rail graph-rail">
        <div className="rail-collection-head">
          <div className="segmented-control">
            <button className={railMode === 'graphs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('graphs')} type="button">Graphs</button>
            <button className={railMode === 'library' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('library')} type="button">Library</button>
          </div>
        </div>
        {railMode === 'graphs' ? (
          <div className="graph-rail-stack">
            <button className="primary-button compact" onClick={() => createGraph()} type="button">+ New Graph</button>
            <div className="rail-list">
              {snapshotGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === selectedGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <strong>{graph.name}</strong>
                  <span className={isPendingGenerationResource(graph) ? 'world-build-rail-status' : undefined}>{isPendingGenerationResource(graph) ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(graph)?.state === 'failed' ? 'Generation failed' : graph.graphType}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="graph-library">
            {graphNodeLibrary.map((group) => (
              <div key={group.key} className="rail-section">
                <span className="section-label">{group.label}</span>
                <div className="graph-library-grid">
                  {group.templates
                    .filter((template) => selectedGraph ? isTemplateAvailableForGraph(template, selectedGraph) : true)
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
        )}
      </aside>

      <section className="main-surface graph-surface">
        {isSelectedGraphPending ? (
          <div className="graph-toolbar">
            <div className="inline-note">This graph is still generating. Toolbar controls unlock when the job completes.</div>
          </div>
        ) : (
          <div className="graph-toolbar">
            <select value={selectedGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
              {snapshotGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
            </select>
            <input value={selectedGraph?.name ?? ''} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { name: event.target.value })} placeholder="Graph name" />
            <select value={selectedGraph?.graphType ?? 'narrative_flow'} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { graphType: event.target.value as GraphType })}>
              <option value="narrative_flow">Narrative</option>
              <option value="quest_flow">Quest</option>
              <option value="system_graph">System</option>
            </select>
            <button className="ghost-button compact" onClick={() => selectedGraph && onDuplicateGraph(selectedGraph.key)} type="button">Duplicate</button>
            <button className={isDeletingSelectedGraph ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={isDeletingSelectedGraph} onClick={() => selectedGraph && onDeleteGraph(selectedGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
          </div>
        )}
        <div className="canvas-stage graph-canvas" ref={canvasRef}>
          {isSelectedGraphPending ? (
            <div className="detail-stack compact world-build-loading-shell graph-loading-shell">
              <span className="eyebrow">Generating Graph</span>
              <h3>{selectedGraph?.name ?? 'Pending graph'}</h3>
              <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This narrative graph is still being generated. Nodes and edges will appear when the background job completes.</div>
              {selectedGraph ? (
                <div className="editor-head-controls">
                  <button className={isDeletingSelectedGraph ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedGraph} onClick={() => onDeleteGraph(selectedGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
                </div>
              ) : null}
            </div>
          ) : (
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
          )}
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
                    filterTemplateGroup(group, contextMenuSearch, selectedGraph).length > 0 ? (
                      <div key={group.key} className="context-menu-group">
                        <strong>{group.label}</strong>
                        <div className="context-menu-list">
                          {filterTemplateGroup(group, contextMenuSearch, selectedGraph)
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
                  <button className="context-menu-item" onClick={() => { selectedGraph && onDuplicateNode(selectedGraph.key, contextMenu.nodeKey); setContextMenu(null) }} type="button"><span>Duplicate Node</span></button>
                  <button className="context-menu-item danger" onClick={() => { selectedGraph && onDeleteNode(selectedGraph.key, contextMenu.nodeKey); setContextMenu(null) }} type="button"><span>Delete Node</span></button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="graph-diagnostic-row">
          {(diagnostics.filter((item) => item.graphKey === selectedGraph?.key).slice(0, 4)).map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>
          ))}
        </div>
      </section>

      <aside className="context-drawer">
        {selectedGraph && isSelectedGraphPending ? (
          <div className="detail-stack compact world-build-loading-shell">
            <span className="eyebrow">Graph Placeholder</span>
            <h3>{selectedGraph.name}</h3>
            <div className="inline-note">Inspector controls are hidden until graph generation completes.</div>
          </div>
        ) : selectedEdge && selectedGraph ? (
          <EdgeInspector definitions={definitions} edge={selectedEdge} onUpdate={(changes) => onUpdateEdge(selectedGraph.key, selectedEdge.key, changes)} />
        ) : selectedNode && selectedGraph ? (
          <NodeInspector assets={assets} definitions={definitions} graph={selectedGraph} graphs={snapshotGraphs} node={selectedNode} onApplyTemplateChange={(templateKey) => applyTemplateChange(selectedNode.key, templateKey)} onDelete={() => onDeleteNode(selectedGraph.key, selectedNode.key)} onUpdate={(changes) => onUpdateNode(selectedGraph.key, selectedNode.key, changes)} />
        ) : selectedGraph ? (
          <GraphInspector diagnostics={diagnostics.filter((item) => item.graphKey === selectedGraph.key)} graph={selectedGraph} onUpdate={(changes) => onUpdateGraph(selectedGraph.key, changes)} />
        ) : (
          <div className="detail-stack compact"><span className="eyebrow">Graph Editor</span><h3>Select or create a graph</h3></div>
        )}
      </aside>
    </div>
  )
}
