import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import type { RefObject } from 'react'

import type { GraphDefinition } from '../../domain/graphcore'
import { graphNodeLibrary } from '../../domain/nodeLibrary'
import { FlowNodeCard } from './FlowNodeCard'
import type { GraphContextMenu } from './types'
import { filterTemplateGroup } from './utils'

type GraphCanvasStageProps = {
  canvasRef: RefObject<HTMLDivElement | null>
  contextMenu: GraphContextMenu | null
  contextMenuSearch: string
  contextMenuSearchRef: RefObject<HTMLInputElement | null>
  currentGraph: GraphDefinition | null
  handleConnect: Parameters<typeof ReactFlow<Node, Edge>>[0]['onConnect']
  handleEdgesChange: Parameters<typeof ReactFlow<Node, Edge>>[0]['onEdgesChange']
  handleNodeContextMenu: Parameters<typeof ReactFlow<Node, Edge>>[0]['onNodeContextMenu']
  handleNodesChange: Parameters<typeof ReactFlow<Node, Edge>>[0]['onNodesChange']
  handlePaneContextMenu: Parameters<typeof ReactFlow<Node, Edge>>[0]['onPaneContextMenu']
  isPending: boolean
  isDeletingSelectedGraph: boolean
  liveEdges: Edge[]
  liveNodes: Node[]
  onClearSelection: () => void
  onDeleteGraph: (graphKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onSelectEdge: (key: string | null) => void
  onSelectNode: (key: string | null) => void
  pendingLabel: string
  pendingTitle: string
  placeTemplate: (templateKey: string, positionOverride?: { x: number; y: number }) => void
  setContextMenu: (value: GraphContextMenu | null) => void
  setContextMenuSearch: (value: string) => void
  setFlowInstance: (value: ReactFlowInstance<Node, Edge> | null) => void
}

export function GraphCanvasStage({
  canvasRef,
  contextMenu,
  contextMenuSearch,
  contextMenuSearchRef,
  currentGraph,
  handleConnect,
  handleEdgesChange,
  handleNodeContextMenu,
  handleNodesChange,
  handlePaneContextMenu,
  isPending,
  isDeletingSelectedGraph,
  liveEdges,
  liveNodes,
  onClearSelection,
  onDeleteGraph,
  onDeleteNode,
  onDuplicateNode,
  onSelectEdge,
  onSelectNode,
  pendingLabel,
  pendingTitle,
  placeTemplate,
  setContextMenu,
  setContextMenuSearch,
  setFlowInstance,
}: GraphCanvasStageProps) {
  return (
    <div className="canvas-stage graph-canvas" ref={canvasRef}>
      {isPending ? (
        <div className="detail-stack compact world-build-loading-shell graph-loading-shell">
          <span className="eyebrow">Generating Graph</span>
          <h3>{pendingTitle}</h3>
          <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This {pendingLabel} is still being generated. Nodes and edges will appear when the background job completes.</div>
          {currentGraph ? (
            <div className="editor-head-controls">
              <button className={isDeletingSelectedGraph ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedGraph} onClick={() => onDeleteGraph(currentGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
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
  )
}
