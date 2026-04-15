import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { EdgeDefinition, GraphDefinition, NodeDefinition } from '../../domain/graphcore'
import {
  applyTemplateToNode,
  createNodeFromTemplate,
  graphNodeTemplatesByKey,
  summarizeCondition,
  summarizeEffects,
} from '../../domain/nodeLibrary'
import type { GraphContextMenu, GraphNodeData } from './types'
import { getPlacementPosition, isTextEntryTarget, isTextInput, uniqueEdgeKey } from './utils'

type GraphCanvasControllerOptions = {
  buildNodeData: (node: NodeDefinition) => Omit<GraphNodeData, 'node'>
  currentGraph: GraphDefinition | null
  currentNode: NodeDefinition | null
  currentEdge: EdgeDefinition | null
  onClearSelection: () => void
  onConnectEdge: (graphKey: string, edge: EdgeDefinition) => void
  onCreateNode: (graphKey: string, node: NodeDefinition) => void
  onDeleteEdge: (graphKey: string, edgeKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onMoveNode: (graphKey: string, nodeKey: string, position: NodeDefinition['position']) => void
  onSelectNode: (key: string | null) => void
  onUpdateNode: (graphKey: string, nodeKey: string, changes: Partial<NodeDefinition>) => void
  resolveConnection?: (connection: Connection, graph: GraphDefinition) => EdgeDefinition | null
}

export function useGraphCanvasController({
  buildNodeData,
  currentGraph,
  currentNode,
  currentEdge,
  onClearSelection,
  onConnectEdge,
  onCreateNode,
  onDeleteEdge,
  onDeleteNode,
  onDuplicateNode,
  onMoveNode,
  onSelectNode,
  onUpdateNode,
  resolveConnection = buildDefaultConnectionEdge,
}: GraphCanvasControllerOptions) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const [liveNodes, setLiveNodes] = useState<Node[]>([])
  const [liveEdges, setLiveEdges] = useState<Edge[]>([])
  const [contextMenu, setContextMenu] = useState<GraphContextMenu | null>(null)
  const [contextMenuSearch, setContextMenuSearch] = useState('')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const contextMenuSearchRef = useRef<HTMLInputElement | null>(null)
  const lastAutoFitSignatureRef = useRef<string | null>(null)
  const isNodeDragInProgressRef = useRef(false)

  const nodes = useMemo<Node[]>(() => {
    return (currentGraph?.nodes ?? []).map((node) => ({
      id: node.key,
      position: node.position,
      type: 'graphNode',
      data: {
        node,
        ...buildNodeData(node),
      },
    }))
  }, [buildNodeData, currentGraph])

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
    if (isNodeDragInProgressRef.current) return
    setLiveNodes((current) => reconcileFlowNodes(current, nodes))
  }, [nodes])

  useEffect(() => {
    setLiveEdges((current) => reconcileFlowEdges(current, edges))
  }, [edges])

  useEffect(() => {
    lastAutoFitSignatureRef.current = null
  }, [flowInstance])

  useEffect(() => {
    if (!flowInstance || !currentGraph || liveNodes.length === 0) return
    const signature = `${currentGraph.key}:${liveNodes.length}:${liveEdges.length}`
    if (lastAutoFitSignatureRef.current === signature) return
    lastAutoFitSignatureRef.current = signature
    const visibleNodeIds = liveNodes.map((node) => node.id)
    const timeout = window.setTimeout(() => {
      void flowInstance.fitView({
        duration: 240,
        padding: 0.16,
        nodes: visibleNodeIds.map((id) => ({ id })),
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [currentGraph, flowInstance, liveEdges.length, liveNodes.length])

  useEffect(() => {
    if (!contextMenu || contextMenu.kind !== 'pane') return
    setContextMenuSearch('')
    const timeout = window.setTimeout(() => contextMenuSearchRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [contextMenu])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentGraph) return
      if (event.key === 'Escape') onClearSelection()
      if (event.key.toLowerCase() === 'a' && !isTextInput(event.target)) {
        event.preventDefault()
        openPaletteAtCanvasCenter()
      }
      if (event.key.toLowerCase() === 'f' && !isTextEntryTarget(event.target)) {
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
    if (changes.some((change) => change.type === 'position' && change.dragging)) {
      isNodeDragInProgressRef.current = true
    }
    if (changes.some((change) => change.type === 'position' && change.dragging === false)) {
      isNodeDragInProgressRef.current = false
    }
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
    const edgeDefinition = resolveConnection(connection, currentGraph)
    if (!edgeDefinition) return
    onConnectEdge(currentGraph.key, edgeDefinition)
    setLiveEdges((current) => [
      ...current,
      {
        id: edgeDefinition.key,
        source: edgeDefinition.source.nodeKey,
        sourceHandle: edgeDefinition.source.portId ?? undefined,
        target: edgeDefinition.target.nodeKey,
        targetHandle: edgeDefinition.target.portId ?? 'in',
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
    const visibleNodeIds = liveNodes.map((node) => node.id)
    window.requestAnimationFrame(() => {
      void flowInstance.fitView({
        duration: 240,
        padding: 0.16,
        nodes: visibleNodeIds.map((id) => ({ id })),
      })
    })
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

  return {
    applyTemplateChange,
    canvasRef,
    contextMenu,
    contextMenuSearch,
    contextMenuSearchRef,
    flowInstance,
    handleConnect,
    handleEdgesChange,
    handleNodeContextMenu,
    handleNodesChange,
    handlePaneContextMenu,
    liveEdges,
    liveNodes,
    placeTemplate,
    refocusViewport,
    setContextMenu,
    setContextMenuSearch,
    setFlowInstance,
    setLiveNodes,
  }
}

function buildDefaultConnectionEdge(connection: Connection, graph: GraphDefinition) {
  if (!connection.source || !connection.target) return null
  return {
    id: `edge-${Date.now()}`,
    key: uniqueEdgeKey(graph, connection.source, connection.target),
    source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
    target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'in' },
    label: null,
    condition: null,
    metadata: {},
  } satisfies EdgeDefinition
}

function reconcileFlowNodes(current: Node[], next: Node[]) {
  const currentById = new Map(current.map((node) => [node.id, node]))

  return next.map((node) => {
    const existing = currentById.get(node.id)
    if (!existing) return node
    return {
      ...existing,
      ...node,
      data: node.data,
      position: node.position,
      selected: node.selected ?? existing.selected,
      dragging: existing.dragging,
      measured: existing.measured,
      width: existing.width,
      height: existing.height,
    }
  })
}

function reconcileFlowEdges(current: Edge[], next: Edge[]) {
  const currentById = new Map(current.map((edge) => [edge.id, edge]))

  return next.map((edge) => {
    const existing = currentById.get(edge.id)
    if (!existing) return edge
    return {
      ...existing,
      ...edge,
    }
  })
}
