import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { memo } from 'react'

import { iconForWorldEntity, labelForWorldEntity } from '../../../domain/worldGraphHelpers'
import { EntityIcon } from '../../../shared/entityIcons'
import { nodeShellStyle, type WorldNodeData } from '../../world/worldPresentation'

export const WORLD_NODE_SOURCE_HANDLE = 'world-node-source'
export const WORLD_NODE_TARGET_HANDLE = 'world-node-target'

export type WorldFlowEdgeData = {
  kind: 'relationship' | 'connection'
  onSelect?: (edgeKey: string) => void
  onContextMenu?: (edgeKey: string, position: { x: number; y: number }) => void
}
function WorldNodeCard({ data, selected }: NodeProps<Node<WorldNodeData>>) {
  const { record, dimmed, pinned, storyLinked, displayTier, visualMode, transitionState, highlighted, showMiniLabel, branchLabel, visibilityReason } = data
  const title = record.title
  const tooltip = `${title} - ${visibilityReason.label}${visibilityReason.detail ? `: ${visibilityReason.detail}` : ''}`
  const imageUrl = record.imageUrl
  const toneClass =
    record.kind === 'entity'
      ? `is-${record.entity.nodeType}`
      : record.kind === 'operator'
        ? 'is-operator'
        : 'is-result'
  const kicker =
    record.kind === 'entity'
      ? labelForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'Operator'
        : 'Derived Result'
  const iconId =
    record.kind === 'entity'
      ? iconForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'operator'
        : 'result'
  const isGenerating =
    record.kind === 'entity'
      ? record.entity.metadata?.generation && typeof record.entity.metadata.generation === 'object' && (record.entity.metadata.generation as { state?: unknown }).state === 'pending'
      : false
  const isCanonLocked =
    record.kind === 'entity'
      ? record.entity.metadata?.canon && typeof record.entity.metadata.canon === 'object' && (record.entity.metadata.canon as { locked?: unknown }).locked === true
      : false
  const hasImage = Boolean(imageUrl)
  const className = [
    'world-node-card',
    `world-node-card-${record.kind}`,
    toneClass,
    `is-tier-${displayTier}`,
    `is-mode-${visualMode}`,
    `is-transition-${transitionState}`,
    highlighted ? 'is-highlighted' : '',
    pinned ? 'is-pinned' : '',
    storyLinked ? 'is-story-linked' : '',
    data.animateIn ? 'is-new' : '',
    data.animateSceneEnter ? 'is-scene-reveal' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className} style={nodeShellStyle(record, selected, dimmed, visualMode)} aria-label={tooltip}>
      <Handle id={WORLD_NODE_TARGET_HANDLE} className="world-node-handle is-compact" position={Position.Left} type="target" />
      <Handle id={WORLD_NODE_SOURCE_HANDLE} className="world-node-handle is-compact" position={Position.Right} type="source" />
      <div className="world-node-dot-shell" aria-label={tooltip}>
        <div className="world-node-dot-core">
          {hasImage ? <img alt={title} src={imageUrl!} /> : <EntityIcon id={iconId} />}
        </div>
      </div>
      {showMiniLabel ? (
        <div className="world-node-mini-label">
          <span>{title}</span>
          {branchLabel && (displayTier === 'far' || displayTier === 'peripheral') ? (
            <span className="world-node-mini-branch">via {branchLabel}</span>
          ) : null}
        </div>
      ) : null}
      {visualMode === 'card' ? (
        <div className="world-node-frame">
          <div className="world-node-compact-head">
            {hasImage ? (
              <div className="world-node-media">
                <img alt={title} src={imageUrl!} />
                <div className="world-node-media-shade" />
              </div>
            ) : (
              <div className="world-node-emblem">
                <div className="world-node-emblem-ring">
                  <EntityIcon id={iconId} />
                </div>
              </div>
            )}
            <div className="world-node-title-stack">
              <strong>{title}</strong>
              <div className="world-node-kicker">
                <span>{kicker}</span>
                {record.kind === 'result' ? <span className="world-node-badge">Derived</span> : null}
                {pinned ? <span className="world-node-badge">Pinned</span> : null}
                {isCanonLocked ? <span className="world-node-badge">Canon</span> : null}
                {isGenerating ? <span className="world-node-badge">Generating...</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WorldEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  label,
  selected,
}: EdgeProps<Edge<WorldFlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const labelText = typeof label === 'string' ? label.trim() : ''

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={28} />
      {labelText ? (
        <EdgeLabelRenderer>
          <button
            className={`world-edge-label${selected ? ' is-selected' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              data?.onSelect?.(id)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              data?.onContextMenu?.(id, { x: event.clientX, y: event.clientY })
            }}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            type="button"
          >
            {labelText}
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const MemoWorldNodeCard = memo(WorldNodeCard)
const MemoWorldEdge = memo(WorldEdge)

export const nodeTypes = {
  worldNode: MemoWorldNodeCard,
}

export const edgeTypes = {
  worldEdge: MemoWorldEdge,
}
