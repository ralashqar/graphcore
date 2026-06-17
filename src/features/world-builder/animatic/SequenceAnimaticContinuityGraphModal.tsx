import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EntityIcon } from '../../../shared/entityIcons'

import type { SequenceAnimaticCoverageAnchorView } from './sequenceAnimaticCoverageIndexes'
import {
  displayNameFromRefId,
  sequenceAnimaticContinuityGraphIconId,
  type SequenceAnimaticContinuityAssetTargetView,
  type SequenceAnimaticContinuityGraphNodeKind,
  type SequenceAnimaticContinuityGraphNodeView,
  type SequenceAnimaticContinuityGraphView,
} from './sequenceAnimaticContinuityIndexes'
import {
  sequenceAnimaticBlocksForScene,
  sequenceAnimaticSceneIdFromShotId,
  type SequenceAnimaticSceneView,
} from './sequenceAnimaticSceneIndexes'
import { trimOptionalString } from './sequenceAnimaticCommandHelpers'

export type SequenceAnimaticContinuityGraphModalModel = {
  title: string
  scenes: readonly SequenceAnimaticSceneView[]
  blocks: ReadonlyArray<{ id: string; shots: ReadonlyArray<{ id: string }> }>
  continuityGraphView: SequenceAnimaticContinuityGraphView
  continuityAssetTargets: readonly SequenceAnimaticContinuityAssetTargetView[]
  coverageAnchors: readonly SequenceAnimaticCoverageAnchorView[]
}

export type SequenceAnimaticContinuityGraphNodeOverrideRequest = {
  nodeId: string
  nodeKind: SequenceAnimaticContinuityGraphNodeKind
  visualBriefOverride?: string
  extraPromptDirection?: string
  clearOverride?: boolean
}

export type SequenceAnimaticContinuityGraphModalProps = {
  model: SequenceAnimaticContinuityGraphModalModel
  scopeWorldLocationRefId?: string | null
  scopeSceneId?: string | null
  assetGenerationBusy: boolean
  anchorGenerationBusy: boolean
  onClose: () => void
  onGenerateAssets: (targets?: readonly SequenceAnimaticContinuityAssetTargetView[]) => void
  onGenerateCoverageAnchor: (anchor: SequenceAnimaticCoverageAnchorView) => void
  onSaveNodeOverride: (request: SequenceAnimaticContinuityGraphNodeOverrideRequest) => Promise<unknown> | unknown
  onOpenSceneBoard: (scopeNodeId?: string | null, sceneId?: string | null) => void
}

function scopedContinuityGraph(input: {
  sourceGraph: SequenceAnimaticContinuityGraphView
  model: SequenceAnimaticContinuityGraphModalModel
  scopeWorldLocationRefId?: string | null
  scopeSceneId?: string | null
}) {
  const scopeId = trimOptionalString(input.scopeWorldLocationRefId)
  const sceneId = trimOptionalString(input.scopeSceneId)
  if (!scopeId && !sceneId) return input.sourceGraph

  const sourceNodeById = new Map(input.sourceGraph.nodes.map((node) => [node.id, node] as const))
  const spatialNodeIds = new Set<string>()
  const scopedShotIdsFromScene = new Set<string>()

  if (sceneId) {
    const scene = input.model.scenes.find((entry) => entry.id === sceneId) ?? null
    if (scene) {
      sequenceAnimaticBlocksForScene(input.model, scene).forEach((block) => {
        block.shots.forEach((shot) => scopedShotIdsFromScene.add(shot.id))
      })
    }
  }

  const belongsToScope = (node: SequenceAnimaticContinuityGraphNodeView) => {
    if (node.id === scopeId) return true
    if (sceneId && node.shotIds.some((shotId) => scopedShotIdsFromScene.has(shotId))) return true
    let parentId = trimOptionalString(node.parentId)
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      if (parentId === scopeId) return true
      seen.add(parentId)
      parentId = trimOptionalString(sourceNodeById.get(parentId)?.parentId)
    }
    return false
  }

  input.sourceGraph.nodes
    .filter((node) => node.lane === 'spatial' && belongsToScope(node))
    .forEach((node) => spatialNodeIds.add(node.id))

  for (const nodeId of [...spatialNodeIds]) {
    let parentId = trimOptionalString(sourceNodeById.get(nodeId)?.parentId)
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      spatialNodeIds.add(parentId)
      parentId = trimOptionalString(sourceNodeById.get(parentId)?.parentId)
    }
  }

  const scopedShotIds = new Set(input.sourceGraph.nodes
    .filter((node) => spatialNodeIds.has(node.id))
    .flatMap((node) => node.shotIds))
  const nodeIds = new Set<string>(spatialNodeIds)
  input.sourceGraph.nodes
    .filter((node) => node.lane === 'temporary' && node.shotIds.some((shotId) => scopedShotIds.has(shotId)))
    .forEach((node) => nodeIds.add(node.id))

  const nodes = input.sourceGraph.nodes.filter((node) => nodeIds.has(node.id))
  const edges = input.sourceGraph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const batches = input.sourceGraph.batches
    .map((batch) => ({
      ...batch,
      nodeIds: batch.nodeIds.filter((nodeId) => nodeIds.has(nodeId)),
    }))
    .filter((batch) => batch.nodeIds.length > 0)
  const targetIds = new Set(nodes.map((node) => node.id))
  const targets = input.model.continuityAssetTargets.filter((target) => targetIds.has(target.nodeId))

  return {
    nodes,
    edges,
    batches,
    sceneNodeCount: nodes.filter((node) => node.lane === 'spatial').length,
    tempRefCount: nodes.filter((node) => node.lane === 'temporary').length,
    missingAssetCount: targets.filter((target) => target.status === 'missing' || target.status === 'stale').length,
    readyAssetCount: targets.filter((target) => target.status === 'ready').length,
    runningAssetCount: targets.filter((target) => target.status === 'generating').length,
    failedAssetCount: targets.filter((target) => target.status === 'failed').length,
  } satisfies SequenceAnimaticContinuityGraphView
}

function continuityGraphNodeDepth(node: SequenceAnimaticContinuityGraphNodeView) {
  if (node.kind === 'world_location') return 0
  if (node.kind === 'set') return 1
  if (node.kind === 'zone') return 2
  if (node.kind === 'spot') return 3
  if (node.kind === 'viewpoint' || node.kind === 'angle') return 4
  if (node.kind === 'coverage_anchor') return 5
  return 5
}

const continuityGraphKindOrder: Record<SequenceAnimaticContinuityGraphNodeKind, number> = {
  world_location: 0,
  set: 1,
  zone: 2,
  spot: 3,
  viewpoint: 4,
  angle: 4,
  coverage_anchor: 5,
  temp_character: 6,
  prop: 7,
  faction: 8,
  vehicle: 9,
  group: 10,
}

export function SequenceAnimaticContinuityGraphModal({
  model,
  scopeWorldLocationRefId,
  scopeSceneId,
  assetGenerationBusy,
  anchorGenerationBusy,
  onClose,
  onGenerateAssets,
  onGenerateCoverageAnchor,
  onSaveNodeOverride,
  onOpenSceneBoard,
}: SequenceAnimaticContinuityGraphModalProps) {
  const sourceGraph = model.continuityGraphView
  const [viewMode, setViewMode] = useState<'scene_graph' | 'continuity_debug'>('scene_graph')
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(sourceGraph.nodes[0]?.id ?? null)
  const [visualBriefDraft, setVisualBriefDraft] = useState('')
  const [extraPromptDraft, setExtraPromptDraft] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState('')
  const submittedOverrideKeyRef = useRef('')

  const graph = useMemo(() => scopedContinuityGraph({
    sourceGraph,
    model,
    scopeWorldLocationRefId,
    scopeSceneId,
  }), [model, scopeSceneId, scopeWorldLocationRefId, sourceGraph])

  useEffect(() => {
    if (selectedNodeId && graph.nodes.some((node) => node.id === selectedNodeId)) return
    setSelectedNodeId(graph.nodes[0]?.id ?? null)
  }, [graph.nodes, selectedNodeId])

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null

  useEffect(() => {
    if (!selectedNode) {
      setVisualBriefDraft('')
      setExtraPromptDraft('')
      return
    }
    setVisualBriefDraft(selectedNode.overrideVisualBrief || selectedNode.baseVisualBrief || selectedNode.summary)
    setExtraPromptDraft(selectedNode.extraPromptDirection)
    setOverrideError('')
  }, [selectedNode?.id])

  const saveSelectedOverride = useCallback(async (clearOverride = false) => {
    if (!selectedNode) return
    setOverrideSaving(true)
    setOverrideError('')
    submittedOverrideKeyRef.current = `${selectedNode.id}:${clearOverride ? '' : visualBriefDraft}:${clearOverride ? '' : extraPromptDraft}`
    try {
      await onSaveNodeOverride({
        nodeId: selectedNode.id,
        nodeKind: selectedNode.kind,
        visualBriefOverride: clearOverride ? '' : visualBriefDraft,
        extraPromptDirection: clearOverride ? '' : extraPromptDraft,
        clearOverride,
      })
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : 'Failed to save scene graph override.')
    } finally {
      setOverrideSaving(false)
    }
  }, [extraPromptDraft, onSaveNodeOverride, selectedNode, visualBriefDraft])

  useEffect(() => {
    if (!selectedNode) return
    const currentBrief = selectedNode.overrideVisualBrief || selectedNode.baseVisualBrief || selectedNode.summary
    const currentExtra = selectedNode.extraPromptDirection
    submittedOverrideKeyRef.current = `${selectedNode.id}:${currentBrief}:${currentExtra}`
    if (visualBriefDraft === currentBrief && extraPromptDraft === currentExtra) return
    const draftKey = `${selectedNode.id}:${visualBriefDraft}:${extraPromptDraft}`
    if (draftKey === submittedOverrideKeyRef.current) return
    const timeoutId = window.setTimeout(() => {
      void saveSelectedOverride(false)
    }, 1200)
    return () => window.clearTimeout(timeoutId)
  }, [extraPromptDraft, saveSelectedOverride, selectedNode, visualBriefDraft])

  const selectedTarget = selectedNode ? model.continuityAssetTargets.find((target) => target.nodeId === selectedNode.id) ?? null : null
  const selectedCoverageAnchor = selectedNode?.kind === 'coverage_anchor'
    ? model.coverageAnchors.find((anchor) => anchor.id === selectedNode.id) ?? null
    : null
  const graphNodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node] as const)), [graph.nodes])
  const targetByNodeId = useMemo(() => new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const)), [model.continuityAssetTargets])
  const canGenerateTarget = useCallback((target: SequenceAnimaticContinuityAssetTargetView) => {
    const node = graphNodeById.get(target.nodeId)
    if (!node || target.status === 'ready' || target.status === 'generating') return false
    const parentId = trimOptionalString(node.parentId)
    if (!parentId) return true
    const parentNode = graphNodeById.get(parentId) ?? sourceGraph.nodes.find((entry) => entry.id === parentId) ?? null
    if (!parentNode || parentNode.kind === 'world_location') return true
    const parentTarget = targetByNodeId.get(parentId) ?? null
    return parentTarget?.status === 'ready'
  }, [graphNodeById, sourceGraph.nodes, targetByNodeId])

  const missingTargets = model.continuityAssetTargets
    .filter((target) => graphNodeById.has(target.nodeId))
    .filter((target) => !['ready', 'generating'].includes(target.status))
  const readyToGenerateTargets = missingTargets.filter(canGenerateTarget)
  const selectedParentBlocked = selectedTarget ? !canGenerateTarget(selectedTarget) && !['ready', 'generating'].includes(selectedTarget.status) : false
  const selectedGraphNodeIds = selectedNodeIds.size > 0 ? selectedNodeIds : new Set(selectedNode ? [selectedNode.id] : [])
  const selectedTargets = model.continuityAssetTargets
    .filter((target) => selectedGraphNodeIds.has(target.nodeId))
    .filter(canGenerateTarget)
  const selectedCoverageAnchors = model.coverageAnchors
    .filter((anchor) => selectedGraphNodeIds.has(anchor.id))
    .filter((anchor) => !anchor.running)
  const generateSelectedNodes = () => {
    if (selectedTargets.length > 0) onGenerateAssets(selectedTargets)
    selectedCoverageAnchors.forEach((anchor) => onGenerateCoverageAnchor(anchor))
  }
  const selectedUsageLabel = selectedNode
    ? [
      selectedNode.blockIds.length > 0 ? `${selectedNode.blockIds.length} block${selectedNode.blockIds.length === 1 ? '' : 's'}` : '',
      selectedNode.shotIds.length > 0 ? `${selectedNode.shotIds.length} shot${selectedNode.shotIds.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' / ') || 'No shot usage yet'
    : ''

  const flowNodes = useMemo<Node<Record<string, unknown>>[]>(() => {
    const spatialNodes = graph.nodes.filter((node) => node.lane === 'spatial')
    const temporaryNodes = graph.nodes.filter((node) => node.lane === 'temporary')
    const spatialNodeById = new Map(spatialNodes.map((node) => [node.id, node] as const))
    const childrenByParentId = new Map<string, SequenceAnimaticContinuityGraphNodeView[]>()
    for (const node of spatialNodes) {
      if (!node.parentId || !spatialNodeById.has(node.parentId)) continue
      childrenByParentId.set(node.parentId, [...(childrenByParentId.get(node.parentId) ?? []), node])
    }
    for (const [parentId, children] of childrenByParentId) {
      childrenByParentId.set(parentId, [...children].sort((left, right) => (
        continuityGraphKindOrder[left.kind] - continuityGraphKindOrder[right.kind]
        || left.label.localeCompare(right.label)
      )))
    }

    const roots = spatialNodes
      .filter((node) => !node.parentId || !spatialNodeById.has(node.parentId))
      .sort((left, right) => continuityGraphNodeDepth(left) - continuityGraphNodeDepth(right) || left.label.localeCompare(right.label))
    const columnWidth = viewMode === 'scene_graph' ? 250 : 270
    const rowHeight = viewMode === 'scene_graph' ? 148 : 124
    const positionFor = (depth: number, row: number) => viewMode === 'scene_graph'
      ? { x: 42 + row * columnWidth, y: 44 + depth * rowHeight }
      : { x: 42 + depth * columnWidth, y: 44 + row * rowHeight }
    const positionsById = new Map<string, { x: number; y: number }>()
    let nextRow = 0
    const placeNode = (node: SequenceAnimaticContinuityGraphNodeView) => {
      const children = childrenByParentId.get(node.id) ?? []
      const startRow = nextRow
      if (children.length === 0) {
        positionsById.set(node.id, positionFor(continuityGraphNodeDepth(node), nextRow))
        nextRow += 1
        return
      }
      children.forEach(placeNode)
      positionsById.set(node.id, positionFor(continuityGraphNodeDepth(node), (startRow + nextRow - 1) / 2))
    }
    roots.forEach((root) => {
      placeNode(root)
      nextRow += 0.35
    })
    const maxSpatialDepth = Math.max(4, ...spatialNodes.map(continuityGraphNodeDepth))
    const temporaryBaseX = viewMode === 'scene_graph'
      ? Math.max(42 + Math.ceil(nextRow + 1) * columnWidth, 42 + 5 * columnWidth)
      : 42 + (maxSpatialDepth + 1) * columnWidth
    temporaryNodes
      .sort((left, right) => continuityGraphKindOrder[left.kind] - continuityGraphKindOrder[right.kind] || left.label.localeCompare(right.label))
      .forEach((node, index) => {
        positionsById.set(node.id, { x: temporaryBaseX, y: 44 + index * rowHeight })
      })

    const rowByColumn = new Map<number, number>()
    return graph.nodes.map((node) => {
      const fallbackColumn = node.lane === 'temporary' ? 4 : continuityGraphNodeDepth(node)
      const row = rowByColumn.get(fallbackColumn) ?? 0
      rowByColumn.set(fallbackColumn, row + 1)
      const isSelected = selectedNodeId === node.id || selectedNodeIds.has(node.id)
      return {
        id: node.id,
        type: 'default',
        position: positionsById.get(node.id) ?? positionFor(fallbackColumn, row),
        sourcePosition: viewMode === 'scene_graph' ? Position.Bottom : Position.Right,
        targetPosition: viewMode === 'scene_graph' ? Position.Top : Position.Left,
        data: {
          label: (
            <div className={`world-wiki-continuity-flow-node is-${node.assetStatus} ${node.overrideVisualBrief || node.extraPromptDirection ? 'has-override' : ''}`}>
              <span>
                <EntityIcon id={sequenceAnimaticContinuityGraphIconId(node.kind)} />
                {node.kindLabel}
              </span>
              <strong>{node.label}</strong>
              <em>{node.shotIds.length > 0 ? `${node.shotIds.length} shots` : node.assetStatusLabel}</em>
              {node.effectiveVisualBrief ? <small>{node.effectiveVisualBrief}</small> : null}
            </div>
          ),
        },
        style: {
          width: 224,
          borderRadius: 10,
          border: isSelected ? '1px solid rgba(147, 102, 255, 0.95)' : '1px solid rgba(152, 163, 255, 0.22)',
          background: node.lane === 'temporary' ? 'rgba(30, 24, 52, 0.95)' : 'rgba(13, 18, 36, 0.95)',
          color: '#f8f7ff',
          boxShadow: isSelected ? '0 16px 36px rgba(101, 78, 255, 0.22)' : '0 10px 26px rgba(0, 0, 0, 0.2)',
          padding: 0,
        },
      }
    })
  }, [graph.nodes, selectedNodeId, selectedNodeIds, viewMode])

  const flowEdges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.kind === 'dependency',
    label: edge.label || undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.kind === 'dependency' ? 'rgba(182, 124, 255, 0.76)' : 'rgba(132, 148, 255, 0.78)',
      width: 16,
      height: 16,
    },
    style: {
      stroke: edge.kind === 'dependency' ? 'rgba(182, 124, 255, 0.7)' : 'rgba(132, 148, 255, 0.7)',
      strokeWidth: edge.kind === 'dependency' ? 1.8 : 1.5,
      strokeDasharray: edge.kind === 'dependency' ? '5 5' : undefined,
    },
    labelStyle: {
      fill: edge.kind === 'dependency' ? 'rgba(226, 210, 255, 0.86)' : 'rgba(194, 204, 255, 0.78)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.2,
    },
    labelBgStyle: {
      fill: 'rgba(8, 12, 26, 0.86)',
      fillOpacity: 0.92,
    },
  })), [graph.edges])

  const tempGroups = ([
    ['Coverage anchors', graph.nodes.filter((node) => node.kind === 'coverage_anchor')],
    ['Temp characters', graph.nodes.filter((node) => node.kind === 'temp_character')],
    ['Props / items', graph.nodes.filter((node) => node.kind === 'prop')],
    ['Factions / crowds', graph.nodes.filter((node) => node.kind === 'faction' || node.kind === 'group')],
    ['Vehicles', graph.nodes.filter((node) => node.kind === 'vehicle')],
  ] as const).filter(([, nodes]) => nodes.length > 0)

  return (
    <section className="world-wiki-continuity-graph-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Continuity graph">
      <button className="world-wiki-sequence-animatic-close" onClick={onClose} type="button" aria-label="Close scene graph">
        <EntityIcon id="close" />
      </button>
      <header className="world-wiki-continuity-graph-head">
        <div>
          <span className="eyebrow">{viewMode === 'scene_graph' ? 'Scene graph' : 'Continuity debug'}</span>
          <h3>{model.title}</h3>
          <p>{scopeSceneId ? `${displayNameFromRefId(scopeSceneId)} scoped graph` : scopeWorldLocationRefId ? `${displayNameFromRefId(scopeWorldLocationRefId)} scene graph` : `${graph.sceneNodeCount} scene nodes / ${graph.tempRefCount} temp refs`}</p>
        </div>
        <div className="world-wiki-continuity-graph-actions">
          <div className="world-wiki-continuity-graph-mode-toggle" role="group" aria-label="Graph mode">
            <button className={viewMode === 'scene_graph' ? 'is-active' : ''} onClick={() => setViewMode('scene_graph')} type="button">Scene Graph</button>
            <button className={viewMode === 'continuity_debug' ? 'is-active' : ''} onClick={() => setViewMode('continuity_debug')} type="button">Continuity Debug</button>
          </div>
          <span>{graph.sceneNodeCount} scene nodes</span>
          <span>{graph.tempRefCount} temp refs</span>
          <span>{graph.readyAssetCount}/{model.continuityAssetTargets.length} assets ready</span>
          <button
            className="ghost-button compact"
            disabled={assetGenerationBusy || anchorGenerationBusy || (selectedTargets.length + selectedCoverageAnchors.length) === 0}
            onClick={generateSelectedNodes}
            type="button"
          >
            Generate selected
          </button>
          <button
            className="primary-button compact"
            disabled={assetGenerationBusy || readyToGenerateTargets.length === 0}
            onClick={() => onGenerateAssets(readyToGenerateTargets)}
            type="button"
          >
            {assetGenerationBusy
              ? <><span className="world-mini-spinner" aria-hidden="true" />Generating assets</>
              : missingTargets.length === 0
                ? 'Assets ready'
                : readyToGenerateTargets.length === 0
                  ? 'Generate parent assets first'
                  : 'Generate missing assets'}
          </button>
        </div>
      </header>
      {graph.nodes.length === 0 ? (
        <div className="world-wiki-continuity-graph-empty">
          <strong>No scene graph yet.</strong>
          <p>Shot continuity streaming will add scene nodes and local refs as the planner saves them.</p>
        </div>
      ) : (
        <div className="world-wiki-continuity-graph-body">
          <aside className="world-wiki-continuity-graph-rail" aria-label="Local references">
            <strong>Anchors & refs</strong>
            {tempGroups.length === 0 ? <p>No anchors or temp refs yet.</p> : null}
            {tempGroups.map(([label, nodes]) => (
              <div key={label}>
                <span>{label}</span>
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    className={selectedNodeId === node.id ? 'is-active' : ''}
                    onClick={() => {
                      setSelectedNodeId(node.id)
                      setSelectedNodeIds(new Set([node.id]))
                    }}
                    type="button"
                  >
                    <EntityIcon id={sequenceAnimaticContinuityGraphIconId(node.kind)} />
                    <span>{node.label}</span>
                    <em>{node.assetStatusLabel}</em>
                  </button>
                ))}
              </div>
            ))}
            {graph.batches.length > 0 ? (
              <div className="world-wiki-continuity-graph-batches">
                <strong>Smart batches</strong>
                {graph.batches.map((batch) => (
                  <article key={batch.id} className={`is-${batch.status}`}>
                    <span>{batch.label}</span>
                    <em>{batch.readyCount}/{batch.targetCount} ready</em>
                    <small>{batch.statusLabel}</small>
                  </article>
                ))}
              </div>
            ) : null}
          </aside>
          <div className="world-wiki-continuity-graph-canvas">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.35}
              maxZoom={1.4}
              onNodeClick={(event, node) => {
                setSelectedNodeId(node.id)
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                  setSelectedNodeIds((current) => {
                    const next = new Set(current)
                    if (next.has(node.id)) next.delete(node.id)
                    else next.add(node.id)
                    return next
                  })
                } else {
                  setSelectedNodeIds(new Set([node.id]))
                }
              }}
            >
              <Background color="rgba(148, 163, 255, 0.18)" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <aside className="world-wiki-continuity-graph-inspector" aria-label="Selected continuity node">
            {selectedNode ? (
              <>
                <div className="world-wiki-continuity-graph-inspector-head">
                  <span>
                    {selectedNode.assetUrl ? <img src={selectedNode.assetUrl} alt="" /> : <EntityIcon id={sequenceAnimaticContinuityGraphIconId(selectedNode.kind)} />}
                  </span>
                  <div>
                    <em>{selectedNode.kindLabel}</em>
                    <strong>{selectedNode.label}</strong>
                  </div>
                </div>
                <dl>
                  <div><dt>Usage</dt><dd>{selectedUsageLabel}</dd></div>
                  <div><dt>Asset</dt><dd>{selectedNode.assetStatusLabel}</dd></div>
                  {selectedNode.parentId ? <div><dt>Parent</dt><dd>{displayNameFromRefId(selectedNode.parentId)}</dd></div> : null}
                  {selectedNode.sourceReferenceIds.length > 0 ? <div><dt>Source refs</dt><dd>{selectedNode.sourceReferenceIds.map(displayNameFromRefId).join(', ')}</dd></div> : null}
                  {selectedCoverageAnchor?.characterRefIds.length ? <div><dt>Characters</dt><dd>{selectedCoverageAnchor.characterRefIds.map(displayNameFromRefId).join(', ')}</dd></div> : null}
                  {selectedCoverageAnchor?.screenDirection ? <div><dt>Screen direction</dt><dd>{selectedCoverageAnchor.screenDirection}</dd></div> : null}
                  {selectedNode.blockIds.length > 0 ? <div><dt>Blocks</dt><dd>{selectedNode.blockIds.join(', ')}</dd></div> : null}
                  {selectedNode.shotIds.length > 0 ? <div><dt>Shots</dt><dd>{selectedNode.shotIds.slice(0, 12).join(', ')}{selectedNode.shotIds.length > 12 ? ` +${selectedNode.shotIds.length - 12}` : ''}</dd></div> : null}
                </dl>
                {selectedNode.summary ? <p>{selectedNode.summary}</p> : null}
                <div className="world-wiki-continuity-graph-prompt-editor">
                  <label>
                    <span>Visual brief</span>
                    <textarea value={visualBriefDraft} onChange={(event) => setVisualBriefDraft(event.currentTarget.value)} rows={5} />
                  </label>
                  <label>
                    <span>Extra prompt direction</span>
                    <textarea value={extraPromptDraft} onChange={(event) => setExtraPromptDraft(event.currentTarget.value)} rows={3} placeholder="Optional art direction for the next regeneration." />
                  </label>
                  <div>
                    <button className="ghost-button compact" disabled={overrideSaving} onClick={() => void saveSelectedOverride(false)} type="button">
                      {overrideSaving ? <><span className="world-mini-spinner" aria-hidden="true" />Saving</> : 'Save brief'}
                    </button>
                    <button className="ghost-button compact" disabled={overrideSaving || (!selectedNode.overrideVisualBrief && !selectedNode.extraPromptDirection)} onClick={() => void saveSelectedOverride(true)} type="button">
                      Clear override
                    </button>
                  </div>
                  {overrideError ? <p className="world-wiki-continuity-graph-error">{overrideError}</p> : null}
                </div>
                <div className="world-wiki-continuity-graph-history">
                  <strong>Asset history</strong>
                  {selectedNode.assetHistoryKeys.length === 0 ? <p>No generated assets recorded for this node yet.</p> : null}
                  {selectedNode.assetHistoryKeys.slice(0, 6).map((assetKey) => <span key={assetKey}>{assetKey}</span>)}
                </div>
                <div className="world-wiki-continuity-graph-node-actions">
                  <button className="ghost-button compact" onClick={() => onOpenSceneBoard(selectedNode.id, scopeSceneId ?? selectedNode.shotIds.map(sequenceAnimaticSceneIdFromShotId).find(Boolean) ?? null)} type="button">
                    <EntityIcon id="camera" />
                    Open Scene Board
                  </button>
                  {selectedNode.assetUrl ? <a className="ghost-button compact" href={selectedNode.assetUrl} target="_blank" rel="noreferrer">View asset</a> : null}
                  {selectedCoverageAnchor ? (
                    <button
                      className="ghost-button compact"
                      disabled={anchorGenerationBusy || selectedCoverageAnchor.running}
                      onClick={() => onGenerateCoverageAnchor(selectedCoverageAnchor)}
                      type="button"
                    >
                      {anchorGenerationBusy || selectedCoverageAnchor.running
                        ? <><span className="world-mini-spinner" aria-hidden="true" />Generating anchor</>
                        : selectedCoverageAnchor.status === 'ready'
                          ? 'Regenerate anchor'
                          : selectedCoverageAnchor.status === 'failed'
                            ? 'Retry anchor'
                            : 'Generate anchor'}
                    </button>
                  ) : selectedTarget ? (
                    <button
                      className="ghost-button compact"
                      disabled={assetGenerationBusy || selectedTarget.status === 'generating' || selectedParentBlocked}
                      onClick={() => onGenerateAssets([selectedTarget])}
                      type="button"
                    >
                      {assetGenerationBusy || selectedTarget.status === 'generating'
                        ? <><span className="world-mini-spinner" aria-hidden="true" />Generating</>
                        : selectedParentBlocked
                          ? 'Generate parent first'
                          : selectedTarget.actionLabel}
                    </button>
                  ) : (
                    <button className="ghost-button compact" disabled type="button">No asset target</button>
                  )}
                </div>
              </>
            ) : (
              <div className="world-wiki-continuity-graph-empty">
                <strong>No node selected.</strong>
                <p>Select a scene or temp ref node to inspect usage and generation state.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}
