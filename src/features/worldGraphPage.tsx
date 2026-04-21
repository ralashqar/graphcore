import '@xyflow/react/dist/style.css'

import ELK from 'elkjs/lib/elk.bundled.js'
import {
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { resolveAssetSourceUrl } from '../domain/assets'
import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../domain/graphcore'
import type {
  WorldEntity,
  WorldEntityCreateInput,
  WorldGraphConnection,
  WorldOperator,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldResult,
  WorldView,
  WorldViewCreateInput,
} from '../domain/worldGraph'
import {
  worldPromptEventPayloadSchema,
  type PromptToWorldOp,
  type WorldPromptClassification,
  type WorldPromptEvent,
  type WorldPromptMessage,
  type WorldPromptPlanPreview,
  type WorldPromptScopeDecision,
  type WorldPromptSession,
  type WorldPromptSuggestion,
  type WorldPromptTurn,
} from '../domain/worldPrompt'
import type { WorldThread } from '../domain/worldThread'
import {
  buildGlobalWorldSuggestions,
  buildSuggestionsForEntity,
  createDefaultWorldView,
  getDerivedOperationsForEntityPair,
  getWorldEntityUsage,
  iconForWorldEntity,
  labelForWorldEntity,
  labelForWorldOperator,
  labelForWorldResult,
} from '../domain/worldGraphHelpers'
import { EntityIcon } from '../shared/entityIcons'
import { GraphWorkspace } from './graphWorkspace'
import type { GraphWorkspaceProps } from './graph/types'

type WorldGraphPageProps = {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  snapshotGraphs: GraphDefinition[]
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
  worldViews: WorldView[]
  worldOperators: WorldOperator[]
  worldResults: WorldResult[]
  worldGraphConnections: WorldGraphConnection[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  worldPromptTurns: WorldPromptTurn[]
  worldPromptMessages: WorldPromptMessage[]
  worldPromptEvents: WorldPromptEvent[]
  selectedWorldNodeKey: string | null
  selectedWorldEdgeKey: string | null
  selectedWorldEntityKey: string | null
  selectedWorldViewKey: string | null
  onSelectWorldNode: (key: string | null) => void
  onSelectWorldEdge: (key: string | null) => void
  onSelectWorldEntity: (key: string | null) => void
  onSelectWorldView: (key: string | null) => void
  onCreateWorldEntity: (input: WorldEntityCreateInput) => Promise<void> | void
  onUpdateWorldEntity: (entityKey: string, changes: Partial<WorldEntityCreateInput>) => Promise<void> | void
  onDeleteWorldEntity: (entityKey: string) => Promise<void> | void
  onCreateWorldRelationship: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onCreateWorldRelationshipFromGraphGesture: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onUpdateWorldRelationship: (relationshipKey: string, changes: Partial<WorldRelationshipCreateInput>) => Promise<void> | void
  onDeleteWorldRelationship: (relationshipKey: string) => Promise<void> | void
  onCreateWorldDerivedComposition: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void> | void
  onUpdateWorldDerivedComposition: (operatorKey: string, changes: {
    operatorChanges?: Partial<Pick<WorldOperator, 'operatorType' | 'inputEntityKeys' | 'label' | 'status' | 'metadata'>>
    resultChanges?: Partial<Pick<WorldResult, 'resultType' | 'title' | 'summary' | 'previewAssetKey' | 'status' | 'metadata'>>
  }) => Promise<void> | void
  onDeleteWorldDerivedComposition: (operatorKey: string) => Promise<void> | void
  onGenerateWorldResultPreview: (resultKey: string) => Promise<void> | void
  onCreateCinematicReferenceFromWorldResult: (resultKey: string) => void
  onCreateWorldView: (input: WorldViewCreateInput) => Promise<void> | void
  onUpdateWorldView: (viewKey: string, changes: Partial<WorldViewCreateInput>) => Promise<void> | void
  onGenerateStarterWorld: (prompt: string) => Promise<void> | void
  onGenerateWorldExpansion: (entityKey: string) => Promise<void> | void
  onStartWorldPromptTurn: (input: {
    prompt: string
    sessionKey?: string | null
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) => Promise<void> | void
  onApproveWorldPromptOp: (input: { turnId: string; opId: string }) => Promise<void> | void
  onRejectWorldPromptOp: (input: { turnId: string; opId: string }) => Promise<void> | void
  onApplyWorldPromptPreview: (input: { turnId: string }) => Promise<void> | void
  onCancelWorldPromptTurn: (input: { turnId: string }) => Promise<void> | void
  onResolveWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onParkWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onSetWorldEntityCanonLock: (input: { entityKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onSetWorldRelationshipCanonLock: (input: { relationshipKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onExtractWorldThreadToCinematicPreview: (input: { threadKey: string; mode?: 'teaser' | 'scene' }) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenCinematicGraph: (graphKey: string) => void
  legacyGraphProps: GraphWorkspaceProps
}

type WorldGraphNodeRecord =
  | { kind: 'entity'; entity: WorldEntity; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'operator'; operator: WorldOperator; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'result'; result: WorldResult; title: string; subtitle: string; summary: string; imageUrl: string | null }

type WorldNodeData = {
  record: WorldGraphNodeRecord
  relationCount: number
  usageCount: number
  dimmed: boolean
}

type WorldFlowEdgeData = {
  kind: 'relationship' | 'connection'
  onSelect?: (edgeKey: string) => void
  onContextMenu?: (edgeKey: string, position: { x: number; y: number }) => void
}

type EntityComposerState = {
  mode: 'global' | 'related'
  defaults: Partial<WorldEntityCreateInput>
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
  canvasPosition?: { x: number; y: number } | null
}

type RelationshipComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type CompositionComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  operatorType: WorldOperator['operatorType']
}

type EdgeEditorState = {
  mode: 'create' | 'edit'
  relationshipKey?: string
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type PendingEntityResolutionState = {
  previousEntityKeys: string[]
  canvasPosition: { x: number; y: number } | null
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
}

type ContextMenuState =
  | { kind: 'canvas'; x: number; y: number; flowPosition: { x: number; y: number } | null }
  | { kind: 'entity'; x: number; y: number; entityKey: string }
  | { kind: 'operator'; x: number; y: number; operatorKey: string }
  | { kind: 'result'; x: number; y: number; resultKey: string }
  | { kind: 'relationship'; x: number; y: number; relationshipKey: string }
  | { kind: 'connection'; x: number; y: number; connectionKey: string }

const elk = new ELK()

type EntityOverviewDraftState = {
  entityKey: string
  name: string
  summary: string
  dirty: boolean
}

type WorldPromptPendingOp = {
  turn: WorldPromptTurn
  event: WorldPromptEvent
  op: PromptToWorldOp
}

type WorldGraphSurfaceMode = 'grow' | 'graph'
type WorldGrowRailTab = 'inspect' | 'views' | 'filters'

function keyForWorldNodeRecord(record: WorldGraphNodeRecord) {
  return record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
}

function worldNodeRecordEqual(left: WorldGraphNodeRecord, right: WorldGraphNodeRecord) {
  if (left.kind !== right.kind) return false
  if (left.title !== right.title || left.subtitle !== right.subtitle || left.summary !== right.summary || left.imageUrl !== right.imageUrl) {
    return false
  }
  if (left.kind === 'entity' && right.kind === 'entity') {
    return left.entity.key === right.entity.key && left.entity.status === right.entity.status && left.entity.thumbnailAssetKey === right.entity.thumbnailAssetKey
  }
  if (left.kind === 'operator' && right.kind === 'operator') {
    return left.operator.key === right.operator.key && left.operator.operatorType === right.operator.operatorType && left.operator.label === right.operator.label
  }
  if (left.kind === 'result' && right.kind === 'result') {
    return left.result.key === right.result.key && left.result.previewAssetKey === right.result.previewAssetKey && left.result.title === right.result.title
  }
  return false
}

function worldNodeDataEqual(left: WorldNodeData, right: WorldNodeData) {
  return (
    left.relationCount === right.relationCount
    && left.usageCount === right.usageCount
    && left.dimmed === right.dimmed
    && worldNodeRecordEqual(left.record, right.record)
  )
}

function nodeShellStyle(record: WorldGraphNodeRecord, selected: boolean, dimmed: boolean): CSSProperties {
  const palette =
    record.kind === 'entity'
      ? record.entity.nodeType === 'actor'
        ? ['rgba(148, 163, 184, 0.32)', 'rgba(56, 189, 248, 0.14)']
        : record.entity.nodeType === 'group'
          ? ['rgba(253, 224, 71, 0.24)', 'rgba(245, 158, 11, 0.12)']
          : record.entity.nodeType === 'place'
            ? ['rgba(52, 211, 153, 0.24)', 'rgba(16, 185, 129, 0.12)']
            : record.entity.nodeType === 'object'
              ? ['rgba(244, 114, 182, 0.22)', 'rgba(236, 72, 153, 0.1)']
              : record.entity.nodeType === 'concept'
                ? ['rgba(192, 132, 252, 0.22)', 'rgba(139, 92, 246, 0.08)']
                : ['rgba(251, 146, 60, 0.22)', 'rgba(249, 115, 22, 0.12)']
      : record.kind === 'operator'
        ? ['rgba(96, 165, 250, 0.28)', 'rgba(59, 130, 246, 0.08)']
        : ['rgba(255, 255, 255, 0.18)', 'rgba(148, 163, 184, 0.08)']

  return {
    opacity: dimmed ? 0.22 : 1,
    borderColor: selected ? 'rgba(255,255,255,0.34)' : palette[0],
    background: `linear-gradient(180deg, rgba(12, 17, 25, 0.96), ${palette[1]})`,
    boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.1), 0 18px 38px rgba(5, 8, 14, 0.45)' : '0 14px 32px rgba(5, 8, 14, 0.28)',
  }
}

function WorldNodeCard({ data, selected }: NodeProps<Node<WorldNodeData>>) {
  const { record, relationCount, usageCount, dimmed } = data
  const title = record.title
  const summary = record.summary
  const imageUrl = record.imageUrl
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
        ? 'graph'
        : 'cinematic'
  const isGenerating =
    record.kind === 'entity'
      ? record.entity.metadata?.generation && typeof record.entity.metadata.generation === 'object' && (record.entity.metadata.generation as { state?: unknown }).state === 'pending'
      : false
  const isCanonLocked =
    record.kind === 'entity'
      ? record.entity.metadata?.canon && typeof record.entity.metadata.canon === 'object' && (record.entity.metadata.canon as { locked?: unknown }).locked === true
      : false

  return (
    <div className={`world-node-card world-node-card-${record.kind}`} style={nodeShellStyle(record, selected, dimmed)}>
      {record.kind === 'entity' ? <Handle className="world-node-handle" position={Position.Left} type="target" /> : null}
      {record.kind === 'entity' ? <Handle className="world-node-handle" position={Position.Right} type="source" /> : null}
      <div className="world-node-kicker">
        <EntityIcon id={iconId} />
        <span>{kicker}</span>
        {record.kind === 'result' ? <span className="world-node-badge">Derived</span> : null}
        {isCanonLocked ? <span className="world-node-badge">Canon</span> : null}
        {isGenerating ? <span className="world-node-badge">Generating…</span> : null}
      </div>
      {imageUrl ? (
        <div className="world-node-media">
          <img alt={title} src={imageUrl} />
        </div>
      ) : null}
      <strong>{title}</strong>
      {record.subtitle ? <span className="world-node-subtitle">{record.subtitle}</span> : null}
      {!imageUrl && summary ? <p>{summary}</p> : null}
      <div className="world-node-meta">
        <span>{relationCount} links</span>
        <span>{usageCount} uses</span>
      </div>
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

const nodeTypes = {
  worldNode: MemoWorldNodeCard,
}

const edgeTypes = {
  worldEdge: MemoWorldEdge,
}

function defaultNameForWorldNodeType(nodeType: WorldEntity['nodeType']) {
  switch (nodeType) {
    case 'actor':
      return 'New Character'
    case 'group':
      return 'New Group'
    case 'place':
      return 'New Place'
    case 'object':
      return 'New Item'
    case 'concept':
      return 'New Lore'
    case 'event':
      return 'New Event'
  }
}

function getFlowNodeElement(nodeId: string) {
  if (typeof document === 'undefined') return null
  const escapedNodeId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(nodeId)
    : nodeId.replace(/"/g, '\\"')
  return document.querySelector<HTMLElement>(`.react-flow__node[data-id="${escapedNodeId}"]`)
}

function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity':
      return `Add or extend ${op.payload.entity.name}`
    case 'update_entity':
      return `Update ${op.payload.targetEntityKey}`
    case 'upsert_relationship':
      return `Link ${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'source'} to ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'target'}`
    case 'update_relationship':
      return `Update relationship ${op.payload.targetRelationshipKey}`
    case 'create_derived_result':
      return `Create ${op.payload.title ?? op.payload.operatorType}`
    case 'queue_image_generation':
      return 'Queue image generation'
    case 'queue_cinematic_generation':
      return 'Queue cinematic generation'
    case 'assistant_note':
      return op.payload.message
  }
}

function collectPendingPromptOps(
  turns: WorldPromptTurn[],
  events: WorldPromptEvent[],
) {
  const turnById = new Map(turns.map((turn) => [turn.id, turn]))
  const eventsByOpId = new Map<string, WorldPromptEvent[]>()
  for (const event of events) {
    if (!event.opId) continue
    const current = eventsByOpId.get(event.opId) ?? []
    current.push(event)
    eventsByOpId.set(event.opId, current)
  }

  const pending: WorldPromptPendingOp[] = []
  for (const [, opEvents] of eventsByOpId) {
    const requested = opEvents.find((event) => event.eventType === 'op_needs_approval') ?? null
    if (!requested) continue
    const resolved = opEvents.some((event) => ['op_approved', 'op_rejected', 'op_applied'].includes(event.eventType))
    if (resolved) continue
    const parsedPayload = worldPromptEventPayloadSchema.safeParse(requested.payload)
    if (!parsedPayload.success || !parsedPayload.data.op) continue
    const turn = turnById.get(requested.turnId) ?? null
    if (!turn) continue
    pending.push({
      turn,
      event: requested,
      op: parsedPayload.data.op,
    })
  }

  return pending.sort((left, right) => (
    new Date(left.event.createdAt).getTime() - new Date(right.event.createdAt).getTime()
  ))
}

function describePlannerStatus(status: NonNullable<ReturnType<typeof worldPromptEventPayloadSchema.safeParse>['data']>['plannerStatus']) {
  switch (status) {
    case 'planning':
      return 'Planning'
    case 'scoping':
      return 'Scoping'
    case 'applying':
      return 'Applying'
    case 'awaiting_approval':
      return 'Awaiting Approval'
    case 'blocked':
      return 'Blocked'
    case 'completed':
      return 'Completed'
    default:
      return 'Working'
  }
}

function latestPromptSuggestions(turns: WorldPromptTurn[], events: WorldPromptEvent[]) {
  const latestTurnId = turns[turns.length - 1]?.id ?? null
  const relevantEvents = latestTurnId ? events.filter((event) => event.turnId === latestTurnId) : events
  for (const event of [...relevantEvents].reverse()) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (parsed.success && parsed.data.suggestions.length > 0) {
      return parsed.data.suggestions
    }
  }
  return [] as WorldPromptSuggestion[]
}

function latestPromptClassification(turns: WorldPromptTurn[], events: WorldPromptEvent[]) {
  const latestTurn = turns[turns.length - 1] ?? null
  const turnClassification = latestTurn?.metadata?.classification
  if (typeof turnClassification === 'string') {
    return turnClassification as WorldPromptClassification
  }
  for (const event of [...events].reverse()) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (parsed.success && parsed.data.classification) {
      return parsed.data.classification
    }
  }
  return null
}

function latestPromptScopeDecision(turns: WorldPromptTurn[], events: WorldPromptEvent[]) {
  const latestTurn = turns[turns.length - 1] ?? null
  const turnScope = latestTurn?.metadata?.scopeDecision
  if (turnScope && typeof turnScope === 'object') {
    return turnScope as WorldPromptScopeDecision
  }
  for (const event of [...events].reverse()) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (parsed.success && parsed.data.scope) {
      return parsed.data.scope
    }
  }
  return null
}

function latestPromptPreview(turns: WorldPromptTurn[], events: WorldPromptEvent[]) {
  const latestTurn = turns[turns.length - 1] ?? null
  const turnPreview = latestTurn?.metadata?.preview
  if (turnPreview && typeof turnPreview === 'object') {
    return turnPreview as WorldPromptPlanPreview
  }
  const relevantEvents = latestTurn ? events.filter((event) => event.turnId === latestTurn.id) : events
  for (const event of [...relevantEvents].reverse()) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (parsed.success && parsed.data.preview) {
      return parsed.data.preview
    }
  }
  return null
}

function describePromptClassification(classification: WorldPromptClassification | null) {
  switch (classification) {
    case 'graphable_direct':
      return 'Direct'
    case 'graphable_broad':
      return 'Broad'
    case 'graphable_plan_only':
      return 'Plan Only'
    case 'contradictory_or_low_confidence':
      return 'Low Confidence'
    case 'not_graphable':
      return 'Needs Rewrite'
    default:
      return ''
  }
}

function promptSuggestionImpactLabel(suggestion: WorldPromptSuggestion) {
  const parts = [
    suggestion.estimatedNodeCount > 0 ? `+${suggestion.estimatedNodeCount} nodes` : null,
    suggestion.estimatedEdgeCount > 0 ? `+${suggestion.estimatedEdgeCount} links` : null,
    suggestion.willQueueImages ? 'images' : null,
    suggestion.willQueueCinematics ? 'cinematics' : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function describePromptFeedEvent(event: WorldPromptEvent) {
  const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
  if (!parsed.success) {
    return { label: event.eventType, detail: '' }
  }
  const payload = parsed.data
  if (event.eventType === 'planner_status' && payload.plannerStatus) {
    return {
      label: describePlannerStatus(payload.plannerStatus),
      detail: payload.note ?? (payload.scope ? `${payload.scope.mode} scope` : ''),
    }
  }
  if (event.eventType === 'turn_cancel_requested') {
    return {
      label: 'Cancellation Requested',
      detail: payload.note ?? 'Stopping future ops for this turn.',
    }
  }
  if (payload.note) {
    return { label: event.eventType === 'assistant_note' ? 'Assistant' : event.eventType, detail: payload.note }
  }
  if (payload.op) {
    return { label: event.eventType, detail: describePromptOp(payload.op) }
  }
  return { label: event.eventType, detail: '' }
}

export function WorldGraphPage({
  assets,
  definitions,
  snapshotGraphs,
  worldEntities,
  worldRelationships,
  worldViews,
  worldOperators,
  worldResults,
  worldGraphConnections,
  worldThreads,
  worldPromptSessions,
  worldPromptTurns,
  worldPromptMessages,
  worldPromptEvents,
  selectedWorldNodeKey,
  selectedWorldEdgeKey,
  selectedWorldEntityKey,
  selectedWorldViewKey,
  onSelectWorldNode,
  onSelectWorldEdge,
  onSelectWorldEntity,
  onSelectWorldView,
  onCreateWorldEntity,
  onUpdateWorldEntity,
  onDeleteWorldEntity,
  onCreateWorldRelationship,
  onCreateWorldRelationshipFromGraphGesture,
  onUpdateWorldRelationship,
  onDeleteWorldRelationship,
  onCreateWorldDerivedComposition,
  onUpdateWorldDerivedComposition,
  onDeleteWorldDerivedComposition,
  onGenerateWorldResultPreview,
  onCreateCinematicReferenceFromWorldResult,
  onCreateWorldView,
  onUpdateWorldView,
  onGenerateStarterWorld,
  onGenerateWorldExpansion,
  onStartWorldPromptTurn,
  onApproveWorldPromptOp,
  onRejectWorldPromptOp,
  onApplyWorldPromptPreview,
  onCancelWorldPromptTurn,
  onResolveWorldThread,
  onParkWorldThread,
  onSetWorldEntityCanonLock,
  onSetWorldRelationshipCanonLock,
  onExtractWorldThreadToCinematicPreview,
  onOpenDefinitionLink,
  onOpenCinematicGraph,
  legacyGraphProps,
}: WorldGraphPageProps) {
  const flowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge<WorldFlowEdgeData>> | null>(null)
  const nodePositionPersistTimeoutRef = useRef<number | null>(null)
  const entityOverviewPersistTimeoutRef = useRef<number | null>(null)
  const [legacyMode, setLegacyMode] = useState(false)
  const [viewMode, setViewMode] = useState<WorldView['mode']>('graph')
  const [search, setSearch] = useState('')
  const [surfaceMode, setSurfaceMode] = useState<WorldGraphSurfaceMode>(() => {
    if (typeof window === 'undefined') return 'graph'
    const raw = window.localStorage.getItem('graphcore.world.surface-mode.v1')
    return raw === 'grow' ? 'grow' : 'graph'
  })
  const [activeRailTab, setActiveRailTab] = useState<'inspect' | 'chat' | 'activity'>('inspect')
  const [activeGrowRailTab, setActiveGrowRailTab] = useState<WorldGrowRailTab>('inspect')
  const [activeInspectorTab, setActiveInspectorTab] = useState<'overview' | 'relationships' | 'usage' | 'suggestions'>('overview')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showDerivedLayer, setShowDerivedLayer] = useState(true)
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [canvasNodes, setCanvasNodes] = useState<Node<WorldNodeData>[]>([])
  const [autoLayoutNonce, setAutoLayoutNonce] = useState(0)
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [inspectorNodeKey, setInspectorNodeKey] = useState<string | null>(selectedWorldNodeKey)
  const [pendingEntityResolution, setPendingEntityResolution] = useState<PendingEntityResolutionState | null>(null)
  const [entityComposer, setEntityComposer] = useState<EntityComposerState | null>(null)
  const [relationshipComposer, setRelationshipComposer] = useState<RelationshipComposerState | null>(null)
  const [compositionComposer, setCompositionComposer] = useState<CompositionComposerState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditorState | null>(null)
  const [relationshipInspectorNotes, setRelationshipInspectorNotes] = useState('')
  const [starterPrompt, setStarterPrompt] = useState('')
  const [isStarterPending, setIsStarterPending] = useState(false)
  const [isExpansionPending, setIsExpansionPending] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [entityOverviewDraft, setEntityOverviewDraft] = useState<EntityOverviewDraftState | null>(null)
  const [selectedPromptSessionKey, setSelectedPromptSessionKey] = useState<string | null>(worldPromptSessions[0]?.key ?? null)
  const [selectedPromptThreadKey, setSelectedPromptThreadKey] = useState<string | null>(null)
  const [worldPromptText, setWorldPromptText] = useState('')
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false)
  const [isPromptPreviewApplying, setIsPromptPreviewApplying] = useState(false)
  const [isPromptCancelling, setIsPromptCancelling] = useState(false)
  const [resolvingPromptOpIds, setResolvingPromptOpIds] = useState<string[]>([])

  const selectedView = useMemo(
    () => worldViews.find((view) => view.key === selectedWorldViewKey) ?? worldViews[0] ?? createDefaultWorldView(),
    [selectedWorldViewKey, worldViews],
  )
  const selectedEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === selectedWorldEntityKey) ?? worldEntities.find((entity) => entity.key === selectedWorldNodeKey) ?? null,
    [selectedWorldEntityKey, selectedWorldNodeKey, worldEntities],
  )
  const selectedPromptSession = useMemo(
    () => worldPromptSessions.find((session) => session.key === selectedPromptSessionKey) ?? worldPromptSessions[0] ?? null,
    [selectedPromptSessionKey, worldPromptSessions],
  )
  const sessionTurns = useMemo(
    () => selectedPromptSession
      ? worldPromptTurns
          .filter((turn) => turn.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptTurns],
  )
  const sessionMessages = useMemo(
    () => selectedPromptSession
      ? worldPromptMessages
          .filter((message) => message.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptMessages],
  )
  const sessionEvents = useMemo(
    () => selectedPromptSession
      ? worldPromptEvents
          .filter((event) => event.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.sequence - right.sequence)
      : [],
    [selectedPromptSession, worldPromptEvents],
  )
  const pendingPromptOps = useMemo(
    () => collectPendingPromptOps(sessionTurns, sessionEvents),
    [sessionEvents, sessionTurns],
  )
  const activePromptTurn = useMemo(
    () => [...sessionTurns].reverse().find((turn) => ['queued', 'streaming', 'awaiting_approval'].includes(turn.status)) ?? null,
    [sessionTurns],
  )
  const promptSuggestions = useMemo(
    () => latestPromptSuggestions(sessionTurns, sessionEvents),
    [sessionEvents, sessionTurns],
  )
  const promptClassification = useMemo(
    () => latestPromptClassification(sessionTurns, sessionEvents),
    [sessionEvents, sessionTurns],
  )
  const promptScopeDecision = useMemo(
    () => latestPromptScopeDecision(sessionTurns, sessionEvents),
    [sessionEvents, sessionTurns],
  )
  const promptPreview = useMemo(
    () => latestPromptPreview(sessionTurns, sessionEvents),
    [sessionEvents, sessionTurns],
  )
  const activeWorldThreads = useMemo(
    () => worldThreads
      .filter((thread) => thread.status === 'open')
      .sort((left, right) => {
        const leftPriority = left.priority === 'primary' ? 0 : left.priority === 'secondary' ? 1 : 2
        const rightPriority = right.priority === 'primary' ? 0 : right.priority === 'secondary' ? 1 : 2
        return leftPriority - rightPriority || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    [worldThreads],
  )
  const selectedPromptThread = useMemo(
    () => activeWorldThreads.find((thread) => thread.key === selectedPromptThreadKey) ?? null,
    [activeWorldThreads, selectedPromptThreadKey],
  )
  const selectedEntityThreads = useMemo(
    () => selectedEntity
      ? worldThreads.filter((thread) => thread.linkedEntityKeys.includes(selectedEntity.key))
      : [],
    [selectedEntity, worldThreads],
  )
  const deferredEntityOverviewName = useDeferredValue(entityOverviewDraft?.name ?? '')
  const deferredEntityOverviewSummary = useDeferredValue(entityOverviewDraft?.summary ?? '')

  useEffect(() => {
    if (!selectedPromptSessionKey && worldPromptSessions.length > 0) {
      setSelectedPromptSessionKey(worldPromptSessions[0].key)
      return
    }
    if (selectedPromptSessionKey && !worldPromptSessions.some((session) => session.key === selectedPromptSessionKey)) {
      setSelectedPromptSessionKey(worldPromptSessions[0]?.key ?? null)
    }
  }, [selectedPromptSessionKey, worldPromptSessions])

  useEffect(() => {
    if (selectedPromptThreadKey && !worldThreads.some((thread) => thread.key === selectedPromptThreadKey)) {
      setSelectedPromptThreadKey(null)
    }
  }, [selectedPromptThreadKey, worldThreads])

  useEffect(() => {
    window.localStorage.setItem('graphcore.world.surface-mode.v1', surfaceMode)
  }, [surfaceMode])

  useEffect(() => {
    if (worldEntities.length === 0 || activePromptTurn) {
      setSurfaceMode('grow')
    }
  }, [activePromptTurn, worldEntities.length])

  useEffect(() => {
    if (worldEntities.length === 0) {
      setActiveRailTab('chat')
    }
  }, [worldEntities.length])

  useEffect(() => {
    setViewMode(selectedView.mode)
    setSearch(selectedView.search)
    setShowSuggestions(selectedView.showSuggestions)
    setShowLabels(selectedView.showLabels)
    setShowDerivedLayer(selectedView.showDerivedLayer)
  }, [selectedView.mode, selectedView.search, selectedView.showDerivedLayer, selectedView.showLabels, selectedView.showSuggestions])

  useEffect(() => {
    setDraftPositions(selectedView.nodePositions)
  }, [selectedView.key])

  useEffect(() => {
    if (!selectedView.key) return
    if (Object.keys(selectedView.nodePositions).length === 0) return
    setDraftPositions((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, position] of Object.entries(selectedView.nodePositions)) {
        if (!next[key]) {
          next[key] = position
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [selectedView.key, selectedView.nodePositions])

  useEffect(() => {
    if (selectedWorldNodeKey) {
      setInspectorNodeKey(selectedWorldNodeKey)
    }
  }, [selectedWorldNodeKey])

  useEffect(() => {
    const latestEvent = sessionEvents[sessionEvents.length - 1]
    if (!latestEvent) return
    if (!['op_applied', 'queue_started'].includes(latestEvent.eventType)) return
    window.setTimeout(() => {
      setAutoLayoutNonce((value) => value + 1)
      flowRef.current?.fitView({ padding: 0.18, duration: 280 })
    }, 40)
  }, [sessionEvents])

  const assetByKey = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets])
  const entityByKey = useMemo(() => new Map(worldEntities.map((entity) => [entity.key, entity])), [worldEntities])
  const definitionByKey = useMemo(() => new Map(definitions.map((definition) => [definition.key, definition])), [definitions])
  const usageByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [entity.key, getWorldEntityUsage(entity, snapshotGraphs)]))
  ), [snapshotGraphs, worldEntities])
  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      return [entity.key, resolveAssetSourceUrl(previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null)]
    }))
  }, [assetByKey, definitionByKey, worldEntities])
  const imageUrlByResultKey = useMemo(() => {
    return new Map(worldResults.map((result) => [
      result.key,
      resolveAssetSourceUrl(result.previewAssetKey ? assetByKey.get(result.previewAssetKey) ?? null : null),
    ]))
  }, [assetByKey, worldResults])

  const effectiveFilters = selectedView.filters
  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase()
    return worldEntities.filter((entity) => {
      if (effectiveFilters.nodeTypes.length > 0 && !effectiveFilters.nodeTypes.includes(entity.nodeType)) return false
      if (effectiveFilters.linkedOnly && !entity.linkedDefinitionKey) return false
      if (effectiveFilters.unlinkedOnly && entity.linkedDefinitionKey) return false
      if (effectiveFilters.usedInCinematic && (usageByEntityKey.get(entity.key)?.length ?? 0) === 0) return false
      if (effectiveFilters.aiSuggestedOnly && entity.source === 'user') return false
      if (!query) return true
      return (
        entity.name.toLowerCase().includes(query)
        || entity.summary.toLowerCase().includes(query)
        || entity.aliases.some((alias) => alias.toLowerCase().includes(query))
        || entity.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    })
  }, [effectiveFilters, search, usageByEntityKey, worldEntities])

  const filteredEntityKeys = useMemo(() => new Set(filteredEntities.map((entity) => entity.key)), [filteredEntities])
  const pinnedRootKey = selectedView.rootEntityKey
  const focusRootKey = pinnedRootKey ?? null
  const focusedEntity = useMemo(
    () => (focusRootKey ? worldEntities.find((entity) => entity.key === focusRootKey) ?? null : null),
    [focusRootKey, worldEntities],
  )
  const focusedOperator = useMemo(
    () => (focusRootKey ? worldOperators.find((entry) => entry.key === focusRootKey) ?? null : null),
    [focusRootKey, worldOperators],
  )
  const focusedResult = useMemo(
    () => (focusRootKey ? worldResults.find((entry) => entry.key === focusRootKey) ?? null : null),
    [focusRootKey, worldResults],
  )

  const visibleNodeKeys = useMemo(() => {
    const mixedAdjacency = new Map<string, Set<string>>()
    const addLink = (source: string, target: string) => {
      const sourceLinks = mixedAdjacency.get(source) ?? new Set<string>()
      sourceLinks.add(target)
      mixedAdjacency.set(source, sourceLinks)
      const targetLinks = mixedAdjacency.get(target) ?? new Set<string>()
      targetLinks.add(source)
      mixedAdjacency.set(target, targetLinks)
    }

    for (const relationship of worldRelationships) {
      addLink(relationship.sourceEntityKey, relationship.targetEntityKey)
    }
    if (showDerivedLayer) {
      for (const connection of worldGraphConnections) {
        addLink(connection.sourceNodeKey, connection.targetNodeKey)
      }
    }

    const seed = focusRootKey ? [focusRootKey] : [...filteredEntityKeys]
    const visited = new Set<string>(seed)
    let frontier = new Set<string>(seed)
    const depthLimit = focusRootKey ? selectedView.focusDepth + 1 : 3
    for (let depth = 0; depth < depthLimit; depth += 1) {
      const next = new Set<string>()
      for (const key of frontier) {
        for (const neighbor of mixedAdjacency.get(key) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            next.add(neighbor)
          }
        }
      }
      frontier = next
    }

    for (const key of filteredEntityKeys) visited.add(key)
    if (!showDerivedLayer) {
      return new Set([...visited].filter((key) => filteredEntityKeys.has(key)))
    }
    return visited
  }, [filteredEntityKeys, focusRootKey, selectedView.focusDepth, showDerivedLayer, worldGraphConnections, worldRelationships])

  const nodeRecords = useMemo(() => {
    const result = new Map<string, WorldGraphNodeRecord>()
    for (const entity of worldEntities) {
      const displayName = entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewName : entity.name
      const displaySummary = entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewSummary : entity.summary
      result.set(entity.key, {
        kind: 'entity',
        entity,
        title: displayName,
        subtitle: labelForWorldEntity(entity.nodeType),
        summary: displaySummary,
        imageUrl: imageUrlByEntityKey.get(entity.key) ?? null,
      })
    }
    for (const operator of worldOperators) {
      const inputNames = operator.inputEntityKeys
        .map((key) => {
          const entity = entityByKey.get(key) ?? null
          if (!entity) return key
          return entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewName : entity.name
        })
        .join(' + ')
      result.set(operator.key, {
        kind: 'operator',
        operator,
        title: labelForWorldOperator(operator.operatorType),
        subtitle: operator.label || 'Derived operation',
        summary: inputNames,
        imageUrl: null,
      })
    }
    for (const worldResult of worldResults) {
      result.set(worldResult.key, {
        kind: 'result',
        result: worldResult,
        title: worldResult.title,
        subtitle: labelForWorldResult(worldResult.resultType),
        summary: worldResult.summary,
        imageUrl: imageUrlByResultKey.get(worldResult.key) ?? null,
      })
    }
    return result
  }, [
    deferredEntityOverviewName,
    deferredEntityOverviewSummary,
    entityByKey,
    entityOverviewDraft?.entityKey,
    imageUrlByEntityKey,
    imageUrlByResultKey,
    worldEntities,
    worldOperators,
    worldResults,
  ])

  useEffect(() => {
    if (inspectorNodeKey && !nodeRecords.has(inspectorNodeKey)) {
      setInspectorNodeKey(null)
    }
  }, [inspectorNodeKey, nodeRecords])

  useEffect(() => {
    if (!pendingEntityResolution) return
    const createdEntity = worldEntities.find((entity) => !pendingEntityResolution.previousEntityKeys.includes(entity.key)) ?? null
    if (!createdEntity) return
    const resolvedEntity = createdEntity
    const resolution = pendingEntityResolution
    setPendingEntityResolution(null)

    async function resolveCreatedEntity() {
      if (resolution.canvasPosition) {
        const nextPositions = {
          ...draftPositions,
          [resolvedEntity.key]: resolution.canvasPosition,
        }
        setDraftPositions(nextPositions)
        queueNodePositionPersist(nextPositions)
      }

      if (resolution.relationshipDefaults.sourceEntityKey) {
        await onCreateWorldRelationship({
          sourceEntityKey: resolution.relationshipDefaults.sourceEntityKey,
          targetEntityKey: resolvedEntity.key,
          verb: 'related to',
          direction: resolution.relationshipDefaults.direction ?? 'outbound',
          strength: resolution.relationshipDefaults.strength ?? null,
          confidence: resolution.relationshipDefaults.confidence ?? null,
          source: resolution.relationshipDefaults.source ?? 'user',
          notes: resolution.relationshipDefaults.notes ?? resolution.relationshipDefaults.verb ?? '',
          state: resolution.relationshipDefaults.state ?? 'confirmed',
          metadata: resolution.relationshipDefaults.metadata ?? {},
        })
      }
    }

    void resolveCreatedEntity()
  }, [draftPositions, onCreateWorldRelationship, pendingEntityResolution, worldEntities])

  const visibleNodeRecords = useMemo(
    () => [...nodeRecords.values()].filter((record) => visibleNodeKeys.has(
      record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key,
    )),
    [nodeRecords, visibleNodeKeys],
  )

  const visibleRelationships = useMemo(
    () => worldRelationships.filter((relationship) => visibleNodeKeys.has(relationship.sourceEntityKey) && visibleNodeKeys.has(relationship.targetEntityKey)),
    [visibleNodeKeys, worldRelationships],
  )
  const visibleConnections = useMemo(
    () => (showDerivedLayer
      ? worldGraphConnections.filter((connection) => visibleNodeKeys.has(connection.sourceNodeKey) && visibleNodeKeys.has(connection.targetNodeKey))
      : []),
    [showDerivedLayer, visibleNodeKeys, worldGraphConnections],
  )
  const visibleLayoutNodes = useMemo(() => (
    visibleNodeRecords.map((record) => {
      const key = keyForWorldNodeRecord(record)
      const width = record.kind === 'entity'
        ? record.entity.nodeType === 'place'
          ? 250
          : 220
        : record.kind === 'operator'
          ? 160
          : 250
      const height = record.kind === 'result' ? 210 : record.kind === 'operator' ? 110 : 170
      return { id: key, width, height }
    })
  ), [visibleNodeRecords])
  const layoutStructureKey = useMemo(() => (
    [
      visibleLayoutNodes.map((node) => `${node.id}:${node.width}x${node.height}`).join('|'),
      visibleRelationships.map((relationship) => `${relationship.key}:${relationship.sourceEntityKey}>${relationship.targetEntityKey}`).join('|'),
      visibleConnections.map((connection) => `${connection.key}:${connection.sourceNodeKey}>${connection.targetNodeKey}`).join('|'),
    ].join('__')
  ), [visibleConnections, visibleLayoutNodes, visibleRelationships])

  useEffect(() => {
    let cancelled = false

    async function layoutVisibleGraph() {
      if (viewMode !== 'graph' || visibleLayoutNodes.length === 0) {
        if (!cancelled) setLayoutPositions({})
        return
      }

      const graph = await elk.layout({
        id: 'world-graph',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '120',
          'elk.spacing.nodeNode': '70',
        },
        children: visibleLayoutNodes,
        edges: [
          ...visibleRelationships.map((relationship) => ({
            id: relationship.key,
            sources: [relationship.sourceEntityKey],
            targets: [relationship.targetEntityKey],
          })),
          ...visibleConnections.map((connection) => ({
            id: connection.key,
            sources: [connection.sourceNodeKey],
            targets: [connection.targetNodeKey],
          })),
        ],
      })

      if (cancelled) return
      setLayoutPositions(Object.fromEntries(
        (graph.children ?? []).map((child, index) => [child.id, { x: child.x ?? index * 220, y: child.y ?? 0 }]),
      ))
    }

    void layoutVisibleGraph()
    return () => {
      cancelled = true
    }
  }, [autoLayoutNonce, layoutStructureKey, viewMode])

  useEffect(() => {
    if (!selectedView.key || viewMode !== 'graph' || visibleNodeRecords.length === 0) return

    const nextPositions = { ...draftPositions }
    let changed = false
    for (const record of visibleNodeRecords) {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      if (!nextPositions[key] && layoutPositions[key]) {
        nextPositions[key] = layoutPositions[key]
        changed = true
      }
    }

    if (!changed) return

    setDraftPositions(nextPositions)
    queueNodePositionPersist(nextPositions)
  }, [draftPositions, layoutPositions, selectedView.key, viewMode, visibleNodeRecords])

  const relationCountByNodeKey = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of visibleNodeRecords) {
      counts.set(record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key, 0)
    }
    for (const relationship of worldRelationships) {
      counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
      counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
    }
    for (const connection of worldGraphConnections) {
      counts.set(connection.sourceNodeKey, (counts.get(connection.sourceNodeKey) ?? 0) + 1)
      counts.set(connection.targetNodeKey, (counts.get(connection.targetNodeKey) ?? 0) + 1)
    }
    return counts
  }, [visibleNodeRecords, worldGraphConnections, worldRelationships])

  const flowNodes = useMemo<Node<WorldNodeData>[]>(() => {
    return visibleNodeRecords.map((record, index) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      return {
        id: key,
        type: 'worldNode',
        position: draftPositions[key] ?? layoutPositions[key] ?? { x: index * 220, y: 0 },
        draggable: viewMode === 'graph',
        data: {
          record,
          relationCount: relationCountByNodeKey.get(key) ?? 0,
          usageCount: record.kind === 'entity'
            ? usageByEntityKey.get(record.entity.key)?.length ?? 0
            : record.kind === 'result' && typeof record.result.metadata?.cinematicGraphKey === 'string'
              ? 1
              : 0,
          dimmed: Boolean(focusRootKey) && !visibleNodeKeys.has(key),
        },
      }
    })
  }, [draftPositions, focusRootKey, layoutPositions, relationCountByNodeKey, usageByEntityKey, viewMode, visibleNodeKeys, visibleNodeRecords])

  useEffect(() => {
    setCanvasNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      let changed = current.length !== flowNodes.length
      const nextNodes = flowNodes.map((node) => {
        const previousNode = currentById.get(node.id)
        if (!previousNode) {
          changed = true
          return node
        }

        const samePosition = previousNode.position.x === node.position.x && previousNode.position.y === node.position.y
        const sameDraggable = previousNode.draggable === node.draggable
        const sameData = worldNodeDataEqual(previousNode.data, node.data)

        if (samePosition && sameDraggable && sameData) {
          return previousNode
        }

        changed = true
        return {
          ...previousNode,
          position: samePosition ? previousNode.position : node.position,
          draggable: node.draggable,
          data: sameData ? previousNode.data : node.data,
        }
      })

      return changed ? nextNodes : current
    })
  }, [flowNodes])

  const flowEdges = useMemo<Edge<WorldFlowEdgeData>[]>(() => {
    return [
      ...visibleRelationships.map((relationship) => ({
        id: relationship.key,
        type: 'worldEdge',
        source: relationship.sourceEntityKey,
        target: relationship.targetEntityKey,
        selected: selectedWorldEdgeKey === relationship.key,
        label: showLabels ? (relationship.notes.trim() || undefined) : undefined,
        animated: relationship.state !== 'confirmed',
        interactionWidth: 28,
        zIndex: selectedWorldEdgeKey === relationship.key ? 6 : 4,
        data: {
          kind: 'relationship' as const,
          onSelect: selectWorldEdge,
          onContextMenu: (edgeKey: string, position: { x: number; y: number }) => {
            selectWorldEdge(edgeKey)
            setContextMenu({ kind: 'relationship', x: position.x, y: position.y, relationshipKey: edgeKey })
          },
        },
        style: {
          stroke: relationship.state === 'confirmed' ? 'rgba(148, 163, 184, 0.54)' : relationship.state === 'suggested' ? 'rgba(94, 234, 212, 0.54)' : 'rgba(244, 114, 182, 0.42)',
          strokeDasharray: relationship.state === 'confirmed' ? undefined : '7 5',
          strokeWidth: relationship.strength ? 1 + relationship.strength * 2 : 1.4,
        },
      })),
      ...(edgeEditor?.mode === 'create' && visibleNodeKeys.has(edgeEditor.sourceEntityKey) && visibleNodeKeys.has(edgeEditor.targetEntityKey)
        ? [{
            id: 'world.relationship.pending',
            type: 'worldEdge',
            source: edgeEditor.sourceEntityKey,
            target: edgeEditor.targetEntityKey,
            label: showLabels ? (edgeEditor.notes.trim() || 'New relationship') : undefined,
            animated: true,
            interactionWidth: 28,
            zIndex: 7,
            data: { kind: 'relationship' as const },
            style: {
              stroke: 'rgba(94, 234, 212, 0.72)',
              strokeDasharray: '7 5',
              strokeWidth: 1.8,
            },
          } satisfies Edge<WorldFlowEdgeData>]
        : []),
      ...visibleConnections.map((connection) => ({
        id: connection.key,
        type: 'worldEdge',
        source: connection.sourceNodeKey,
        target: connection.targetNodeKey,
        selected: selectedWorldEdgeKey === connection.key,
        label: showLabels ? connection.role : undefined,
        animated: false,
        interactionWidth: 24,
        zIndex: selectedWorldEdgeKey === connection.key ? 5 : 3,
        data: {
          kind: 'connection' as const,
          onSelect: selectWorldEdge,
          onContextMenu: (edgeKey: string, position: { x: number; y: number }) => {
            selectWorldEdge(edgeKey)
            setContextMenu({ kind: 'connection', x: position.x, y: position.y, connectionKey: edgeKey })
          },
        },
        style: {
          stroke: 'rgba(255, 255, 255, 0.16)',
          strokeDasharray: '5 4',
          strokeWidth: 1.2,
        },
      })),
    ]
  }, [edgeEditor, selectedWorldEdgeKey, showLabels, visibleConnections, visibleNodeKeys, visibleRelationships])

  const groupedEntities = useMemo(() => ({
    actor: filteredEntities.filter((entity) => entity.nodeType === 'actor'),
    group: filteredEntities.filter((entity) => entity.nodeType === 'group'),
    place: filteredEntities.filter((entity) => entity.nodeType === 'place'),
    object: filteredEntities.filter((entity) => entity.nodeType === 'object'),
    concept: filteredEntities.filter((entity) => entity.nodeType === 'concept'),
    event: filteredEntities.filter((entity) => entity.nodeType === 'event'),
  }), [filteredEntities])

  const worldSummarySuggestions = useMemo(
    () => buildGlobalWorldSuggestions(worldEntities, worldRelationships, snapshotGraphs),
    [snapshotGraphs, worldEntities, worldRelationships],
  )
  const inspectorEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldEntities],
  )
  const inspectorOperator = useMemo(
    () => worldOperators.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldOperators],
  )
  const inspectorResult = useMemo(
    () => worldResults.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldResults],
  )
  const inspectorEntitySuggestions = useMemo(
    () => inspectorEntity ? buildSuggestionsForEntity(inspectorEntity, worldRelationships, snapshotGraphs) : [],
    [inspectorEntity, snapshotGraphs, worldRelationships],
  )
  const inspectorRelationship = useMemo(
    () => worldRelationships.find((relationship) => relationship.key === selectedWorldEdgeKey) ?? null,
    [selectedWorldEdgeKey, worldRelationships],
  )
  const inspectorEntityUsage = inspectorEntity ? usageByEntityKey.get(inspectorEntity.key) ?? [] : []
  const inspectorEntityRelationships = inspectorEntity
    ? worldRelationships.filter((relationship) => relationship.sourceEntityKey === inspectorEntity.key || relationship.targetEntityKey === inspectorEntity.key)
    : []

  useEffect(() => {
    if (!inspectorEntity) {
      setEntityOverviewDraft(null)
      return
    }
    setEntityOverviewDraft((current) => {
      if (current?.entityKey === inspectorEntity.key && current.dirty) {
        return current
      }
      if (
        current?.entityKey === inspectorEntity.key
        && current.name === inspectorEntity.name
        && current.summary === inspectorEntity.summary
      ) {
        return current
      }
      return {
        entityKey: inspectorEntity.key,
        name: inspectorEntity.name,
        summary: inspectorEntity.summary,
        dirty: false,
      }
    })
  }, [inspectorEntity])

  const displayedInspectorEntity = useMemo(() => {
    if (!inspectorEntity) return null
    if (entityOverviewDraft?.entityKey !== inspectorEntity.key) return inspectorEntity
    return {
      ...inspectorEntity,
      name: entityOverviewDraft.name,
      summary: entityOverviewDraft.summary,
    }
  }, [entityOverviewDraft, inspectorEntity])
  const edgeEditorPosition = useMemo(() => {
    if (!edgeEditor) return null
    const sourceElement = getFlowNodeElement(edgeEditor.sourceEntityKey)
    const targetElement = getFlowNodeElement(edgeEditor.targetEntityKey)
    if (!sourceElement || !targetElement) return null

    const sourceRect = sourceElement.getBoundingClientRect()
    const targetRect = targetElement.getBoundingClientRect()
    const midpointX = (sourceRect.left + sourceRect.width / 2 + targetRect.left + targetRect.width / 2) / 2
    const midpointY = (sourceRect.top + sourceRect.height / 2 + targetRect.top + targetRect.height / 2) / 2
    const popupWidth = 360
    const gutter = 24

    return {
      left: Math.max(gutter + popupWidth / 2, Math.min(window.innerWidth - gutter - popupWidth / 2, midpointX)),
      top: Math.max(120, midpointY),
    }
  }, [draftPositions, edgeEditor, layoutPositions, visibleNodeRecords])

  useEffect(() => {
    setRelationshipInspectorNotes(inspectorRelationship?.notes ?? '')
  }, [inspectorRelationship?.key, inspectorRelationship?.notes])

  useEffect(() => {
    return () => {
      if (nodePositionPersistTimeoutRef.current !== null) {
        window.clearTimeout(nodePositionPersistTimeoutRef.current)
      }
      if (entityOverviewPersistTimeoutRef.current !== null) {
        window.clearTimeout(entityOverviewPersistTimeoutRef.current)
      }
    }
  }, [])

  async function persistViewChanges(changes: Partial<WorldViewCreateInput>) {
    if (!selectedView.key || worldViews.length === 0) return
    await onUpdateWorldView(selectedView.key, changes)
  }

  function queueNodePositionPersist(nextPositions: Record<string, { x: number; y: number }>, delay = 180) {
    if (!selectedView.key || worldViews.length === 0) return
    if (nodePositionPersistTimeoutRef.current !== null) {
      window.clearTimeout(nodePositionPersistTimeoutRef.current)
    }
    const viewKey = selectedView.key
    nodePositionPersistTimeoutRef.current = window.setTimeout(() => {
      nodePositionPersistTimeoutRef.current = null
      void onUpdateWorldView(viewKey, { nodePositions: nextPositions })
    }, delay)
  }

  async function persistEntityOverviewDraft(entityKey: string, name: string, summary: string) {
    const entity = worldEntities.find((entry) => entry.key === entityKey) ?? null
    if (!entity) return

    const changes: Partial<WorldEntityCreateInput> = {}
    if (name !== entity.name) changes.name = name
    if (summary !== entity.summary) changes.summary = summary
    if (Object.keys(changes).length === 0) {
      setEntityOverviewDraft((current) => (
        current?.entityKey === entityKey && current.name === name && current.summary === summary
          ? { ...current, dirty: false }
          : current
      ))
      return
    }

    await onUpdateWorldEntity(entityKey, changes)
    setEntityOverviewDraft((current) => (
      current?.entityKey === entityKey && current.name === name && current.summary === summary
        ? { ...current, dirty: false }
        : current
    ))
  }

  function queueEntityOverviewPersist(nextDraft: EntityOverviewDraftState, delay = 360) {
    if (entityOverviewPersistTimeoutRef.current !== null) {
      window.clearTimeout(entityOverviewPersistTimeoutRef.current)
    }
    entityOverviewPersistTimeoutRef.current = window.setTimeout(() => {
      entityOverviewPersistTimeoutRef.current = null
      void persistEntityOverviewDraft(nextDraft.entityKey, nextDraft.name, nextDraft.summary)
    }, delay)
  }

  function flushEntityOverviewPersist() {
    if (!entityOverviewDraft?.dirty) return
    if (entityOverviewPersistTimeoutRef.current !== null) {
      window.clearTimeout(entityOverviewPersistTimeoutRef.current)
      entityOverviewPersistTimeoutRef.current = null
    }
    void persistEntityOverviewDraft(entityOverviewDraft.entityKey, entityOverviewDraft.name, entityOverviewDraft.summary)
  }

  function selectWorldNode(key: string | null) {
    onSelectWorldNode(key)
    const entity = key ? worldEntities.find((entry) => entry.key === key) ?? null : null
    onSelectWorldEntity(entity?.key ?? null)
    setInspectorNodeKey(key)
  }

  function selectWorldEdge(key: string | null) {
    onSelectWorldEdge(key)
    onSelectWorldEntity(null)
    setInspectorNodeKey(null)
  }

  function handleNodesChange(changes: NodeChange<Node<WorldNodeData>>[]) {
    setCanvasNodes((current) => applyNodeChanges(changes, current))
  }

  function handleNodeDragStop(_event: unknown, node: Node<WorldNodeData>) {
    const nextPositions = {
      ...draftPositions,
      [node.id]: node.position,
    }
    setDraftPositions(nextPositions)
    queueNodePositionPersist(nextPositions)
  }

  async function handleAutoLayout() {
    setAutoLayoutNonce((value) => value + 1)
    setTimeout(() => flowRef.current?.fitView({ padding: 0.18, duration: 300 }), 20)
  }

  async function handleSaveCurrentView() {
    const baseName = selectedEntity ? `${selectedEntity.name} Focus` : 'Saved World View'
    await onCreateWorldView({
      name: baseName,
      mode: viewMode,
      filters: selectedView.filters,
      search,
      rootEntityKey: focusRootKey && worldEntities.some((entity) => entity.key === focusRootKey) ? focusRootKey : null,
      camera: selectedView.camera,
      focusDepth: selectedView.focusDepth,
      showSuggestions,
      showLabels,
      showDerivedLayer,
      nodePositions: draftPositions,
      collapsedState: selectedView.collapsedState,
      sortMode: selectedView.sortMode,
      metadata: {},
    })
  }

  async function handleCreateEntity(input: WorldEntityCreateInput) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition: entityComposer?.canvasPosition ?? null,
      relationshipDefaults: entityComposer?.relationshipDefaults ?? {},
    })
    await onCreateWorldEntity(input)
    setEntityComposer(null)
  }

  async function handleGenerateStarter() {
    if (!starterPrompt.trim()) return
    setIsStarterPending(true)
    setBusyMessage('Generating starter world...')
    try {
      await onGenerateStarterWorld(starterPrompt.trim())
      setStarterPrompt('')
    } finally {
      setIsStarterPending(false)
      setBusyMessage(null)
    }
  }

  async function handleGenerateExpansion() {
    if (!selectedEntity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${selectedEntity.name}...`)
    try {
      await onGenerateWorldExpansion(selectedEntity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  async function handleGenerateExpansionForEntity(entityKey: string) {
    const entity = worldEntities.find((entry) => entry.key === entityKey) ?? null
    if (!entity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${entity.name}...`)
    try {
      await onGenerateWorldExpansion(entity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  async function handleSubmitWorldPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? worldPromptText).trim()
    if (!prompt) return
    setIsPromptSubmitting(true)
    setBusyMessage('Growing the world from prompt...')
    setSurfaceMode('grow')
    setActiveRailTab('chat')
    try {
      await onStartWorldPromptTurn({
        prompt,
        sessionKey: selectedPromptSession?.key ?? null,
        selectedRootEntityKey: selectedEntity?.key ?? null,
        selectedViewKey: selectedView.key,
        selectedThreadKey: selectedPromptThread?.key ?? null,
      })
      if (!promptOverride) {
        setWorldPromptText('')
      }
    } finally {
      setIsPromptSubmitting(false)
      setBusyMessage(null)
    }
  }

  async function handleApprovePromptOp(turnId: string, opId: string) {
    setResolvingPromptOpIds((current) => current.includes(opId) ? current : [...current, opId])
    try {
      await onApproveWorldPromptOp({ turnId, opId })
    } finally {
      setResolvingPromptOpIds((current) => current.filter((entry) => entry !== opId))
    }
  }

  async function handleRejectPromptOp(turnId: string, opId: string) {
    setResolvingPromptOpIds((current) => current.includes(opId) ? current : [...current, opId])
    try {
      await onRejectWorldPromptOp({ turnId, opId })
    } finally {
      setResolvingPromptOpIds((current) => current.filter((entry) => entry !== opId))
    }
  }

  async function handleRunPromptSuggestion(suggestion: WorldPromptSuggestion) {
    await handleSubmitWorldPrompt(suggestion.prompt)
  }

  async function handleApplyPromptPreview(turnId: string) {
    setIsPromptPreviewApplying(true)
    setBusyMessage('Applying preview first wave...')
    try {
      await onApplyWorldPromptPreview({ turnId })
    } finally {
      setIsPromptPreviewApplying(false)
      setBusyMessage(null)
    }
  }

  async function handleCancelPromptTurn(turnId: string) {
    setIsPromptCancelling(true)
    setBusyMessage('Cancelling world prompt turn...')
    try {
      await onCancelWorldPromptTurn({ turnId })
    } finally {
      setIsPromptCancelling(false)
      setBusyMessage(null)
    }
  }

  function closeMenus() {
    setContextMenu(null)
    setEdgeEditor(null)
  }

  async function handleQuickCreateEntity(
    nodeType: WorldEntity['nodeType'],
    canvasPosition: { x: number; y: number } | null,
  ) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition,
      relationshipDefaults: {},
    })
    setActiveInspectorTab('overview')
    await onCreateWorldEntity({
      name: defaultNameForWorldNodeType(nodeType),
      summary: '',
      nodeType,
      aliases: [],
      tags: [],
      status: 'active',
      thumbnailAssetKey: null,
      linkedDefinitionKey: null,
      source: 'user',
      customProperties: {},
      metadata: {},
      ensureLinkedDefinition: true,
    })
  }

  function openNodeContextMenu(event: ReactMouseEvent, nodeId: string) {
    event.preventDefault()
    const entity = worldEntities.find((entry) => entry.key === nodeId) ?? null
    if (entity) {
      setContextMenu({ kind: 'entity', x: event.clientX, y: event.clientY, entityKey: entity.key })
      return
    }
    const operator = worldOperators.find((entry) => entry.key === nodeId) ?? null
    if (operator) {
      setContextMenu({ kind: 'operator', x: event.clientX, y: event.clientY, operatorKey: operator.key })
      return
    }
    const resultNode = worldResults.find((entry) => entry.key === nodeId) ?? null
    if (resultNode) {
      setContextMenu({ kind: 'result', x: event.clientX, y: event.clientY, resultKey: resultNode.key })
    }
  }

  if (legacyMode) {
    return (
      <div className="focus-layout graph-layout world-graph-layout">
        <aside className="focus-rail graph-rail world-graph-rail">
          <div className="detail-stack compact">
            <span className="eyebrow">Legacy Flow Graphs</span>
            <h3>Advanced Flow Editor</h3>
            <div className="inline-note">Narrative, system, and older flow editing remain available here while the main tab now centers the world map.</div>
            <button className="ghost-button compact" onClick={() => setLegacyMode(false)} type="button">Back To World Graph</button>
          </div>
        </aside>
        <section className="main-surface graph-surface world-graph-legacy">
          <GraphWorkspace {...legacyGraphProps} />
        </section>
      </div>
    )
  }

  return (
    <div className={surfaceMode === 'grow' ? 'focus-layout graph-layout world-graph-layout is-grow-mode' : 'focus-layout graph-layout world-graph-layout'} onClick={() => setContextMenu(null)}>
      {surfaceMode === 'grow' ? (
        <aside className="focus-rail graph-rail world-graph-rail world-grow-workbench">
          <div className="detail-stack compact">
            <div className="segmented-control">
              {(['grow', 'graph'] as const).map((mode) => (
                <button
                  key={mode}
                  className={surfaceMode === mode ? 'segment-button is-active' : 'segment-button'}
                  disabled={Boolean(activePromptTurn) && mode === 'graph'}
                  onClick={() => setSurfaceMode(mode)}
                  type="button"
                >
                  {mode === 'grow' ? 'Grow' : 'Graph'}
                </button>
              ))}
            </div>
          </div>
          <WorldPromptChatPanel
            activePromptTurn={activePromptTurn}
            busy={isPromptSubmitting || isPromptPreviewApplying || isPromptCancelling}
            cancelBusy={isPromptCancelling}
            pendingOps={pendingPromptOps}
            promptText={worldPromptText}
            promptClassification={promptClassification}
            promptPreview={promptPreview}
            selectedEntity={selectedEntity}
            selectedSession={selectedPromptSession}
            selectedThreadKey={selectedPromptThread?.key ?? null}
            selectedView={selectedView}
            sessionMessages={sessionMessages}
            sessionEvents={sessionEvents}
            worldThreads={activeWorldThreads}
            worldPromptSessions={worldPromptSessions}
            promptSuggestions={promptSuggestions}
            promptScopeDecision={promptScopeDecision}
            resolvingPromptOpIds={resolvingPromptOpIds}
            variant="grow"
            onApplyPreview={handleApplyPromptPreview}
            onApprove={handleApprovePromptOp}
            onCancelTurn={handleCancelPromptTurn}
            onChangePromptText={setWorldPromptText}
            onExtractThreadToCinematic={(threadKey, mode) => onExtractWorldThreadToCinematicPreview({ threadKey, mode })}
            onParkThread={(threadKey) => onParkWorldThread({ threadKey })}
            onReject={handleRejectPromptOp}
            onRunSuggestion={handleRunPromptSuggestion}
            onSelectSession={setSelectedPromptSessionKey}
            onSelectThread={setSelectedPromptThreadKey}
            onResolveThread={(threadKey) => onResolveWorldThread({ threadKey })}
            onSubmit={handleSubmitWorldPrompt}
          />
        </aside>
      ) : (
        <aside className="focus-rail graph-rail world-graph-rail">
          <div className="detail-stack compact">
            <div className="segmented-control">
              {(['grow', 'graph'] as const).map((mode) => (
                <button
                  key={mode}
                  className={surfaceMode === mode ? 'segment-button is-active' : 'segment-button'}
                  disabled={Boolean(activePromptTurn) && mode === 'graph'}
                  onClick={() => setSurfaceMode(mode)}
                  type="button"
                >
                  {mode === 'grow' ? 'Grow' : 'Graph'}
                </button>
              ))}
            </div>
            <div>
              <span className="eyebrow">World Graph</span>
              <h2>{selectedView.name || 'Living World'}</h2>
              <div className="inline-note">Structured like a knowledge base, connected like a living universe map.</div>
            </div>
            <div className="world-graph-actions">
              <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add Entity</button>
              <button className="ghost-button compact" onClick={() => setLegacyMode(true)} type="button">Legacy Flow Graphs</button>
              <button className="ghost-button compact" onClick={() => void handleSaveCurrentView()} type="button">Save View</button>
            </div>
            <label className="field-block">
              <span>Search</span>
              <input placeholder="Search title, aliases, tags, description" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="world-filter-grid">
              {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => {
                const active = selectedView.filters.nodeTypes.includes(nodeType)
                return (
                  <button
                    key={nodeType}
                    className={active ? 'segment-button is-active' : 'segment-button'}
                    onClick={() => {
                      const nodeTypes = active
                        ? selectedView.filters.nodeTypes.filter((value) => value !== nodeType)
                        : [...selectedView.filters.nodeTypes, nodeType]
                      void persistViewChanges({ filters: { ...selectedView.filters, nodeTypes } })
                    }}
                    type="button"
                  >
                    {labelForWorldEntity(nodeType)}
                  </button>
                )
              })}
            </div>
          </div>

          {entityComposer ? (
            <EntityComposer
              entityComposer={entityComposer}
              onCancel={() => setEntityComposer(null)}
              onCreate={handleCreateEntity}
            />
          ) : null}

          {relationshipComposer ? (
            <div className="editor-section compact-section world-composer-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Direct Link</span>
                  <h3>Create Relationship</h3>
                </div>
              </div>
              <RelationshipComposer
                entities={worldEntities.filter((entity) => entity.key !== relationshipComposer.sourceEntityKey)}
                state={relationshipComposer}
                onCancel={() => setRelationshipComposer(null)}
                onCreate={async (input) => {
                  await onCreateWorldRelationship(input)
                  setRelationshipComposer(null)
                }}
              />
            </div>
          ) : null}

          {compositionComposer ? (
            <div className="editor-section compact-section world-composer-card">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Derived Layer</span>
                  <h3>Create Composition</h3>
                </div>
              </div>
              <CompositionComposer
                entities={worldEntities}
                state={compositionComposer}
                onCancel={() => setCompositionComposer(null)}
                onCreate={async (input) => {
                  await onCreateWorldDerivedComposition(input)
                  setCompositionComposer(null)
                }}
              />
            </div>
          ) : null}

          <div className="detail-stack compact">
            <div className="section-head">
              <div>
                <span className="eyebrow">Saved Views</span>
                <h3>Views</h3>
              </div>
            </div>
            <div className="rail-list">
              {worldViews.length === 0 ? <div className="inline-note">No saved views yet. Save the current layout once you have a useful neighborhood.</div> : null}
              {worldViews.map((view) => (
                <button
                  key={view.key}
                  className={view.key === selectedView.key ? 'rail-button is-active' : 'rail-button'}
                  onClick={() => onSelectWorldView(view.key)}
                  type="button"
                >
                  <strong>{view.name}</strong>
                  <span>{view.rootEntityKey ? 'Focused' : 'Overview'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="detail-stack compact">
            <div className="section-head">
              <div>
                <span className="eyebrow">Entities</span>
                <h3>World Structure</h3>
              </div>
            </div>
            <div className="world-entity-group-list">
              {Object.entries(groupedEntities).map(([nodeType, entities]) => (
                entities.length > 0 ? (
                  <div key={nodeType} className="rail-section">
                    <span className="section-label">{labelForWorldEntity(nodeType as WorldEntity['nodeType'])}s</span>
                    <div className="rail-list">
                      {entities.map((entity) => (
                        <button
                          key={entity.key}
                          className={entity.key === selectedEntity?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                          onClick={() => {
                            selectWorldNode(entity.key)
                            setActiveInspectorTab('overview')
                          }}
                          type="button"
                        >
                          <div className="media-thumb">
                            <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                          </div>
                          <div className="item-row-copy">
                            <strong>{entity.name}</strong>
                            <span>{labelForWorldEntity(entity.nodeType)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        </aside>
      )}

      <section className="main-surface graph-surface world-graph-surface">
        <div className="world-graph-toolbar">
          <div className="segmented-control">
            {(['graph', 'table', 'timeline', 'board'] as const).map((mode) => (
              <button
                key={mode}
                className={viewMode === mode ? 'segment-button is-active' : 'segment-button'}
                onClick={() => {
                  setViewMode(mode)
                  void persistViewChanges({ mode })
                }}
                type="button"
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="world-graph-toolbar-actions">
            <button className={showDerivedLayer ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={() => {
              const nextValue = !showDerivedLayer
              setShowDerivedLayer(nextValue)
              void persistViewChanges({ showDerivedLayer: nextValue })
            }} type="button">Show Derived Layer</button>
            <button className={showLabels ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={() => {
              const nextValue = !showLabels
              setShowLabels(nextValue)
              void persistViewChanges({ showLabels: nextValue })
            }} type="button">Labels</button>
            <button className="ghost-button compact" onClick={() => void handleAutoLayout()} type="button">Auto Layout</button>
            <button className="ghost-button compact" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 300 })} type="button">Fit</button>
            <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add Entity</button>
            <button className="ghost-button compact" disabled={!selectedEntity || isExpansionPending} onClick={() => void handleGenerateExpansion()} type="button">
              {isExpansionPending ? 'Generating...' : 'Generate From Selection'}
            </button>
          </div>
        </div>

        {focusRootKey ? (
          <div className="world-focus-banner">
            <span className="section-label">Focus Mode</span>
            <strong>{focusedEntity?.name ?? focusedOperator?.label ?? focusedResult?.title ?? 'Selection'}</strong>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ rootEntityKey: null })} type="button">Exit Focus</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ focusDepth: Math.min(2, selectedView.focusDepth + 1) })} type="button">Expand 1 Level</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ rootEntityKey: selectedEntity?.key ?? null })} type="button">Pin Neighborhood</button>
            <button className="ghost-button compact" onClick={() => void handleSaveCurrentView()} type="button">Save As View</button>
          </div>
        ) : null}

        {busyMessage ? <div className="inline-note">{busyMessage}</div> : null}

        {worldEntities.length === 0 ? (
          <div className="world-graph-empty">
            <span className="eyebrow">Start Growing</span>
            <h2>Grow this world from a prompt</h2>
            <p>Use the chat rail to add characters, places, lore, events, and relationships live as the graph forms. The older starter generator is still here as a one-shot fallback.</p>
            <div className="world-empty-actions">
              <button className="primary-button" onClick={() => {
                setSurfaceMode('grow')
                setActiveRailTab('chat')
              }} type="button">Open World Chat</button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add First Character</button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'place', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add First Place</button>
            </div>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Quick Seed Fallback</span>
                  <h3>Starter Generator</h3>
                </div>
              </div>
              <textarea
                className="world-seed-textarea"
                rows={4}
                placeholder="A fractured kingdom where rival groups compete for power"
                value={starterPrompt}
                onChange={(event) => setStarterPrompt(event.target.value)}
              />
              <div className="world-empty-actions">
                <button className="ghost-button" disabled={isStarterPending || !starterPrompt.trim()} onClick={() => void handleGenerateStarter()} type="button">
                  {isStarterPending ? 'Generating...' : 'Generate Starter World'}
                </button>
              </div>
            </div>
          </div>
        ) : viewMode !== 'graph' ? (
          <div className="world-view-stub">
            <span className="eyebrow">{viewMode[0].toUpperCase() + viewMode.slice(1)} Mode</span>
            <h2>{viewMode[0].toUpperCase() + viewMode.slice(1)} view is stubbed in v1</h2>
            <div className="inline-note">Graph is the production-ready mode in this first release. The saved-view, filter, and inspector model is already structured to support richer table, timeline, and board surfaces next.</div>
          </div>
        ) : (
          <div className="canvas-stage graph-canvas world-graph-canvas">
            <ReactFlow
              fitView
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodes={canvasNodes}
              edges={flowEdges}
              onInit={(instance) => {
                flowRef.current = instance
              }}
              onConnect={(connection: Connection) => {
                if (!connection.source || !connection.target || connection.source === connection.target) return
                const sourceEntity = worldEntities.find((entity) => entity.key === connection.source) ?? null
                const targetEntity = worldEntities.find((entity) => entity.key === connection.target) ?? null
                if (!sourceEntity || !targetEntity) return
                setEdgeEditor({
                  mode: 'create',
                  sourceEntityKey: sourceEntity.key,
                  targetEntityKey: targetEntity.key,
                  notes: '',
                })
                setContextMenu(null)
              }}
              onNodeClick={(_, node) => {
                selectWorldNode(node.id)
                setActiveInspectorTab('overview')
              }}
              onNodeDoubleClick={(_, node) => {
                selectWorldNode(node.id)
                const entity = worldEntities.find((entry) => entry.key === node.id) ?? null
                void persistViewChanges({ rootEntityKey: entity?.key ?? null })
              }}
              onNodeContextMenu={(event, node) => openNodeContextMenu(event, node.id)}
              onNodesChange={handleNodesChange}
              onNodeDragStop={handleNodeDragStop}
              onEdgeClick={(event, edge) => {
                event.preventDefault()
                event.stopPropagation()
                selectWorldEdge(edge.id)
                setEdgeEditor(null)
              }}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault()
                event.stopPropagation()
                selectWorldEdge(edge.id)
                const relationship = worldRelationships.find((entry) => entry.key === edge.id) ?? null
                setContextMenu(relationship
                  ? { kind: 'relationship', x: event.clientX, y: event.clientY, relationshipKey: relationship.key }
                  : { kind: 'connection', x: event.clientX, y: event.clientY, connectionKey: edge.id })
              }}
              onPaneClick={() => {
                selectWorldNode(null)
                selectWorldEdge(null)
                setInspectorNodeKey(null)
                closeMenus()
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({
                  kind: 'canvas',
                  x: event.clientX,
                  y: event.clientY,
                  flowPosition: flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? null,
                })
              }}
              nodesDraggable
              onlyRenderVisibleElements
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}

        {edgeEditor ? (
          <div
            className="world-overlay-card world-edge-popup"
            style={edgeEditorPosition
              ? {
                  left: edgeEditorPosition.left,
                  top: edgeEditorPosition.top,
                }
              : undefined}
          >
            <div className="world-popup-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{edgeEditor.mode === 'create' ? 'Create Relationship' : 'Edit Relationship'}</h3>
              </div>
              <button className="world-popup-close" onClick={() => setEdgeEditor(null)} type="button" aria-label="Close relationship editor">×</button>
            </div>
            <label className="field-block">
              <span>Connection note</span>
              <textarea
                rows={4}
                placeholder="How these two things relate"
                value={edgeEditor.notes}
                onChange={(event) => setEdgeEditor((current) => current ? { ...current, notes: event.target.value } : current)}
              />
            </label>
            <div className="world-inspector-actions">
              <button
                className="primary-button compact"
                onClick={() => void (async () => {
                  if (edgeEditor.mode === 'create') {
                    await onCreateWorldRelationshipFromGraphGesture({
                      sourceEntityKey: edgeEditor.sourceEntityKey,
                      targetEntityKey: edgeEditor.targetEntityKey,
                      verb: 'related to',
                      direction: 'outbound',
                      strength: null,
                      confidence: null,
                      source: 'user',
                      notes: edgeEditor.notes.trim(),
                      state: 'confirmed',
                      metadata: { creationMode: 'graph_gesture' },
                    })
                  } else if (edgeEditor.relationshipKey) {
                    await onUpdateWorldRelationship(edgeEditor.relationshipKey, {
                      verb: 'related to',
                      notes: edgeEditor.notes.trim(),
                    })
                  }
                  setEdgeEditor(null)
                })()}
                type="button"
              >
                {edgeEditor.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}

        {contextMenu ? (
          <div className="world-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
            {contextMenu.kind === 'canvas' ? (
              <>
                {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => (
                  <button key={nodeType} className="world-context-action" onClick={() => {
                    void handleQuickCreateEntity(nodeType, contextMenu.flowPosition)
                    setContextMenu(null)
                  }} type="button">
                    Add {labelForWorldEntity(nodeType)}
                  </button>
                ))}
                <button className="world-context-action" onClick={() => {
                  setContextMenu(null)
                  flowRef.current?.fitView({ padding: 0.18, duration: 300 })
                }} type="button">Fit View</button>
                <button className="world-context-action" onClick={() => {
                  void handleAutoLayout()
                  setContextMenu(null)
                }} type="button">Auto Layout</button>
                <button className="world-context-action" onClick={() => {
                  void handleSaveCurrentView()
                  setContextMenu(null)
                }} type="button">Save View</button>
                <button className="world-context-action" onClick={() => {
                  const nextValue = !showDerivedLayer
                  setShowDerivedLayer(nextValue)
                  void persistViewChanges({ showDerivedLayer: nextValue })
                  setContextMenu(null)
                }} type="button">Toggle Derived Layer</button>
              </>
            ) : null}

            {contextMenu.kind === 'entity' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Open</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  void persistViewChanges({ rootEntityKey: contextMenu.entityKey })
                  setContextMenu(null)
                }} type="button">Focus</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setEntityComposer({
                    mode: 'related',
                    defaults: { nodeType: 'actor', source: 'user' },
                    relationshipDefaults: { sourceEntityKey: contextMenu.entityKey, verb: 'related to' },
                    canvasPosition: null,
                  })
                  setContextMenu(null)
                }} type="button">Add Related Entity</button>
                <button className="world-context-action" onClick={() => {
                  setRelationshipComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', notes: '' })
                  setContextMenu(null)
                }} type="button">Link To Existing...</button>
                <button className="world-context-action" onClick={() => {
                  setCompositionComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', operatorType: 'wear' })
                  setContextMenu(null)
                }} type="button">Create Composition...</button>
                <button className="world-context-action" onClick={() => {
                  void handleGenerateExpansionForEntity(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Generate Around This</button>
                <button className="world-context-action" onClick={() => {
                  const entity = worldEntities.find((entry) => entry.key === contextMenu.entityKey) ?? null
                  if (entity?.linkedDefinitionKey) {
                    const kind = entity.nodeType === 'actor' ? 'character' : entity.nodeType === 'place' ? 'environment' : entity.nodeType === 'object' ? 'item' : null
                    if (kind) onOpenDefinitionLink(entity.linkedDefinitionKey, kind)
                  }
                  setContextMenu(null)
                }} type="button">Open Linked Record</button>
                <button className="world-context-action" onClick={() => {
                  void handleSaveCurrentView()
                  setContextMenu(null)
                }} type="button">Save Neighborhood As View</button>
                <button className="world-context-action danger" onClick={() => {
                  void onUpdateWorldEntity(contextMenu.entityKey, { status: 'archived' })
                  setContextMenu(null)
                }} type="button">Archive</button>
              </>
            ) : null}

            {contextMenu.kind === 'relationship' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    setEdgeEditor({
                      mode: 'edit',
                      relationshipKey: relationship.key,
                      sourceEntityKey: relationship.sourceEntityKey,
                      targetEntityKey: relationship.targetEntityKey,
                      notes: relationship.notes,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Edit Relationship</button>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    void onUpdateWorldRelationship(relationship.key, {
                      sourceEntityKey: relationship.targetEntityKey,
                      targetEntityKey: relationship.sourceEntityKey,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Flip Direction</button>
                <button className="world-context-action danger" onClick={() => {
                  void onDeleteWorldRelationship(contextMenu.relationshipKey)
                  setContextMenu(null)
                }} type="button">Delete Link</button>
              </>
            ) : null}

            {contextMenu.kind === 'operator' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Open Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const result = worldResults.find((entry) => entry.sourceOperatorKey === contextMenu.operatorKey)
                  if (result) void onGenerateWorldResultPreview(result.key)
                  setContextMenu(null)
                }} type="button">Regenerate Result</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    void onUpdateWorldDerivedComposition(operator.key, {
                      operatorChanges: {
                        inputEntityKeys: [...operator.inputEntityKeys].reverse(),
                      },
                    })
                  }
                  setContextMenu(null)
                }} type="button">Swap Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    const sourceEntityKey = operator.inputEntityKeys[0] ?? ''
                    const targetEntityKey = operator.inputEntityKeys[1] ?? ''
                    setCompositionComposer({ sourceEntityKey, targetEntityKey, operatorType: operator.operatorType })
                  }
                  setContextMenu(null)
                }} type="button">Change Operation</button>
                <button className="world-context-action danger" onClick={() => {
                  void onDeleteWorldDerivedComposition(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Delete Operation</button>
              </>
            ) : null}

            {contextMenu.kind === 'result' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Open Result</button>
                <button className="world-context-action" onClick={() => {
                  void onGenerateWorldResultPreview(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Regenerate Preview</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const operator = resultNode ? worldOperators.find((entry) => entry.key === resultNode.sourceOperatorKey) ?? null : null
                  const firstEntityKey = operator?.inputEntityKeys[0] ?? null
                  if (firstEntityKey && resultNode?.previewAssetKey) {
                    void onUpdateWorldEntity(firstEntityKey, { thumbnailAssetKey: resultNode.previewAssetKey })
                  }
                  setContextMenu(null)
                }} type="button">Pin As Node Cover</button>
                <button className="world-context-action" onClick={() => {
                  onCreateCinematicReferenceFromWorldResult(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Create Cinematic Ref</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const graphKey = typeof resultNode?.metadata?.cinematicGraphKey === 'string' ? resultNode.metadata.cinematicGraphKey : null
                  if (graphKey) onOpenCinematicGraph(graphKey)
                  setContextMenu(null)
                }} type="button">Open In Cinematics</button>
                <button className="world-context-action danger" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  if (resultNode) void onDeleteWorldDerivedComposition(resultNode.sourceOperatorKey)
                  setContextMenu(null)
                }} type="button">Delete Result</button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="context-drawer world-graph-drawer">
        {surfaceMode === 'grow' ? (
          <>
            <div className="segmented-control">
              {([
                ['inspect', 'Inspect'],
                ['views', 'Views'],
                ['filters', 'Filters'],
              ] as const).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  className={activeGrowRailTab === tabKey ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => setActiveGrowRailTab(tabKey)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {activeGrowRailTab === 'views' ? (
              <div className="detail-stack compact">
                <div className="drawer-head">
                  <div>
                    <span className="eyebrow">Saved Views</span>
                    <h3>World Views</h3>
                  </div>
                </div>
                <div className="world-inspector-actions">
                  <button className="primary-button compact" onClick={() => void handleSaveCurrentView()} type="button">Save View</button>
                  <button className="ghost-button compact" onClick={() => setLegacyMode(true)} type="button">Legacy Flow Graphs</button>
                </div>
                <div className="rail-list">
                  {worldViews.length === 0 ? <div className="inline-note">No saved views yet. Save the current graph once it has a useful neighborhood.</div> : null}
                  {worldViews.map((view) => (
                    <button
                      key={view.key}
                      className={view.key === selectedView.key ? 'rail-button is-active' : 'rail-button'}
                      onClick={() => onSelectWorldView(view.key)}
                      type="button"
                    >
                      <strong>{view.name}</strong>
                      <span>{view.rootEntityKey ? 'Focused' : 'Overview'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : activeGrowRailTab === 'filters' ? (
              <div className="detail-stack compact">
                <div className="drawer-head">
                  <div>
                    <span className="eyebrow">Filters</span>
                    <h3>Graph Controls</h3>
                  </div>
                </div>
                <div className="world-inspector-actions">
                  <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add Entity</button>
                  <button className="ghost-button compact" onClick={() => void handleGenerateExpansion()} disabled={!selectedEntity || isExpansionPending} type="button">
                    {isExpansionPending ? 'Generating...' : 'Generate From Selection'}
                  </button>
                </div>
                <label className="field-block">
                  <span>Search</span>
                  <input placeholder="Search title, aliases, tags, description" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                <div className="world-filter-grid">
                  {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => {
                    const active = selectedView.filters.nodeTypes.includes(nodeType)
                    return (
                      <button
                        key={nodeType}
                        className={active ? 'segment-button is-active' : 'segment-button'}
                        onClick={() => {
                          const nodeTypes = active
                            ? selectedView.filters.nodeTypes.filter((value) => value !== nodeType)
                            : [...selectedView.filters.nodeTypes, nodeType]
                          void persistViewChanges({ filters: { ...selectedView.filters, nodeTypes } })
                        }}
                        type="button"
                      >
                        {labelForWorldEntity(nodeType)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="detail-stack compact">
                <div className="drawer-head">
                  <div>
                    <span className="eyebrow">Inspect</span>
                    <h3>{selectedEntity?.name ?? 'World Structure'}</h3>
                  </div>
                </div>
                {selectedEntity ? <div className="inline-note">{selectedEntity.summary || labelForWorldEntity(selectedEntity.nodeType)}</div> : <div className="inline-note">Select a node to focus it, or browse the current world structure below.</div>}
                <div className="chip-row">
                  <span className="chip">{worldEntities.length} entities</span>
                  <span className="chip">{worldRelationships.length} relationships</span>
                </div>
                <div className="world-entity-group-list">
                  {Object.entries(groupedEntities).map(([nodeType, entities]) => (
                    entities.length > 0 ? (
                      <div key={nodeType} className="rail-section">
                        <span className="section-label">{labelForWorldEntity(nodeType as WorldEntity['nodeType'])}s</span>
                        <div className="rail-list">
                          {entities.map((entity) => (
                            <button
                              key={entity.key}
                              className={entity.key === selectedEntity?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                              onClick={() => {
                                selectWorldNode(entity.key)
                                setActiveInspectorTab('overview')
                              }}
                              type="button"
                            >
                              <div className="media-thumb">
                                <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                              </div>
                              <div className="item-row-copy">
                                <strong>{entity.name}</strong>
                                <span>{labelForWorldEntity(entity.nodeType)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="segmented-control">
              {([
                ['inspect', 'Inspect'],
                ['chat', 'Chat'],
                ['activity', 'Activity'],
              ] as const).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  className={activeRailTab === tabKey ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => setActiveRailTab(tabKey)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {activeRailTab === 'chat' ? (
          <WorldPromptChatPanel
            activePromptTurn={activePromptTurn}
            busy={isPromptSubmitting || isPromptPreviewApplying || isPromptCancelling}
            cancelBusy={isPromptCancelling}
            pendingOps={pendingPromptOps}
            promptText={worldPromptText}
            promptClassification={promptClassification}
            promptPreview={promptPreview}
            selectedEntity={selectedEntity}
            selectedSession={selectedPromptSession}
            selectedThreadKey={selectedPromptThread?.key ?? null}
            selectedView={selectedView}
            sessionMessages={sessionMessages}
            sessionEvents={sessionEvents}
            worldThreads={activeWorldThreads}
            worldPromptSessions={worldPromptSessions}
            promptSuggestions={promptSuggestions}
            promptScopeDecision={promptScopeDecision}
            resolvingPromptOpIds={resolvingPromptOpIds}
            variant="drawer"
            onApplyPreview={handleApplyPromptPreview}
            onApprove={handleApprovePromptOp}
            onCancelTurn={handleCancelPromptTurn}
            onChangePromptText={setWorldPromptText}
            onExtractThreadToCinematic={(threadKey, mode) => onExtractWorldThreadToCinematicPreview({ threadKey, mode })}
            onParkThread={(threadKey) => onParkWorldThread({ threadKey })}
            onReject={handleRejectPromptOp}
            onRunSuggestion={handleRunPromptSuggestion}
            onSelectSession={setSelectedPromptSessionKey}
            onSelectThread={setSelectedPromptThreadKey}
            onResolveThread={(threadKey) => onResolveWorldThread({ threadKey })}
            onSubmit={handleSubmitWorldPrompt}
          />
        ) : activeRailTab === 'activity' ? (
          <WorldPromptActivityPanel
            selectedSession={selectedPromptSession}
            sessionEvents={sessionEvents}
            sessionTurns={sessionTurns}
          />
        ) : inspectorRelationship ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{inspectorRelationship.notes.trim() || 'Untitled Link'}</h3>
              </div>
            </div>
            <div className="editor-section compact-section">
              <div className="inline-note">
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey)?.name ?? 'Missing source')}
                {' -> '}
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey)?.name ?? 'Missing target')}
              </div>
              <label className="field-block">
                <span>Connection note</span>
                <textarea
                  rows={4}
                  value={relationshipInspectorNotes}
                  onChange={(event) => setRelationshipInspectorNotes(event.target.value)}
                />
              </label>
              {inspectorRelationship.metadata?.canon && typeof inspectorRelationship.metadata.canon === 'object' && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true ? (
                <div className="chip-row">
                  <span className="chip">Canon Locked</span>
                </div>
              ) : null}
              <div className="inline-note">{inspectorRelationship.direction} · {inspectorRelationship.source}</div>
              <div className="world-inspector-actions">
                <button
                  className="primary-button compact"
                  onClick={() => void onUpdateWorldRelationship(inspectorRelationship.key, {
                    verb: 'related to',
                    notes: relationshipInspectorNotes.trim(),
                  })}
                  type="button"
                >
                  Save
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => {
                    const sourceEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey) ?? null
                    const targetEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey) ?? null
                    if (sourceEntity) selectWorldNode(sourceEntity.key)
                    else if (targetEntity) selectWorldNode(targetEntity.key)
                  }}
                  type="button"
                >
                  Jump To Node
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => void onUpdateWorldRelationship(inspectorRelationship.key, {
                    sourceEntityKey: inspectorRelationship.targetEntityKey,
                    targetEntityKey: inspectorRelationship.sourceEntityKey,
                  })}
                  type="button"
                >
                  Flip Direction
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => void onSetWorldRelationshipCanonLock({
                    relationshipKey: inspectorRelationship.key,
                    locked: !(
                      inspectorRelationship.metadata?.canon
                      && typeof inspectorRelationship.metadata.canon === 'object'
                      && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true
                    ),
                  })}
                  type="button"
                >
                  {inspectorRelationship.metadata?.canon && typeof inspectorRelationship.metadata.canon === 'object' && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true ? 'Unlock Canon' : 'Lock Canon'}
                </button>
                <button className="ghost-button compact danger" onClick={() => void onDeleteWorldRelationship(inspectorRelationship.key)} type="button">Delete</button>
              </div>
            </div>
          </div>
        ) : !inspectorNodeKey ? (
          <div className="detail-stack compact">
            <span className="eyebrow">World Summary</span>
            <h3>{worldEntities.length} entities</h3>
            <dl className="data-list compact">
              {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => (
                <div key={nodeType}>
                  <dt>{labelForWorldEntity(nodeType)}s</dt>
                  <dd>{worldEntities.filter((entity) => entity.nodeType === nodeType).length}</dd>
                </div>
              ))}
            </dl>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Recent</span>
                  <h3>Recent additions</h3>
                </div>
              </div>
              {worldEntities.slice(-5).reverse().map((entity) => (
                <button key={entity.key} className="rail-button item-row" onClick={() => selectWorldNode(entity.key)} type="button">
                  <div className="media-thumb">
                    <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                  </div>
                  <div className="item-row-copy">
                    <strong>{entity.name}</strong>
                    <span>{labelForWorldEntity(entity.nodeType)}</span>
                  </div>
                </button>
              ))}
            </div>
            {showSuggestions ? (
              <SuggestionPanel
                suggestions={worldSummarySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'global',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: suggestion.relationshipDefaults ?? {},
                  canvasPosition: null,
                })}
              />
            ) : null}
          </div>
        ) : displayedInspectorEntity ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">{labelForWorldEntity(displayedInspectorEntity.nodeType)}</span>
                <h3>{displayedInspectorEntity.name}</h3>
              </div>
            </div>
            <div className="segmented-control">
              {(['overview', 'relationships', 'usage', 'suggestions'] as const).map((tab) => (
                <button
                  key={tab}
                  className={activeInspectorTab === tab ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => setActiveInspectorTab(tab)}
                  type="button"
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeInspectorTab === 'overview' ? (
              <div className="editor-section compact-section">
                <label className="field-block">
                  <span>Name</span>
                  <input
                    value={entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name}
                    onBlur={flushEntityOverviewPersist}
                    onChange={(event) => {
                      const nextDraft: EntityOverviewDraftState = {
                        entityKey: displayedInspectorEntity.key,
                        name: event.target.value,
                        summary: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary,
                        dirty: true,
                      }
                      setEntityOverviewDraft(nextDraft)
                      queueEntityOverviewPersist(nextDraft)
                    }}
                  />
                </label>
                <label className="field-block">
                  <span>Summary</span>
                  <textarea
                    rows={4}
                    value={entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary}
                    onBlur={flushEntityOverviewPersist}
                    onChange={(event) => {
                      const nextDraft: EntityOverviewDraftState = {
                        entityKey: displayedInspectorEntity.key,
                        name: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name,
                        summary: event.target.value,
                        dirty: true,
                      }
                      setEntityOverviewDraft(nextDraft)
                      queueEntityOverviewPersist(nextDraft)
                    }}
                  />
                </label>
                {selectedEntityThreads.length > 0 ? (
                  <div className="chip-row">
                    {selectedEntityThreads.map((thread) => (
                      <button key={thread.key} className="chip chip-button" onClick={() => setSelectedPromptThreadKey(thread.key)} type="button">
                        {thread.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                {displayedInspectorEntity.metadata?.canon && typeof displayedInspectorEntity.metadata.canon === 'object' && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true ? (
                  <div className="chip-row">
                    <span className="chip">Canon Locked</span>
                  </div>
                ) : null}
                <div className="world-inspector-actions">
                  {displayedInspectorEntity.linkedDefinitionKey ? (
                    <button className="ghost-button compact" onClick={() => {
                      const kind = displayedInspectorEntity.nodeType === 'actor' ? 'character' : displayedInspectorEntity.nodeType === 'place' ? 'environment' : displayedInspectorEntity.nodeType === 'object' ? 'item' : null
                      if (kind) onOpenDefinitionLink(displayedInspectorEntity.linkedDefinitionKey!, kind)
                    }} type="button">Open Linked Record</button>
                  ) : null}
                <button className="ghost-button compact" onClick={() => setEntityComposer({
                  mode: 'related',
                  defaults: { nodeType: 'actor', source: 'user' },
                  relationshipDefaults: { sourceEntityKey: displayedInspectorEntity.key, verb: 'related to' },
                  canvasPosition: null,
                })} type="button">Add Related Entity</button>
                  <button
                    className="ghost-button compact"
                    onClick={() => void onSetWorldEntityCanonLock({
                      entityKey: displayedInspectorEntity.key,
                      locked: !(
                        displayedInspectorEntity.metadata?.canon
                        && typeof displayedInspectorEntity.metadata.canon === 'object'
                        && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true
                      ),
                    })}
                    type="button"
                  >
                    {displayedInspectorEntity.metadata?.canon && typeof displayedInspectorEntity.metadata.canon === 'object' && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true ? 'Unlock Canon' : 'Lock Canon'}
                  </button>
                  <button className="ghost-button compact danger" onClick={() => void onDeleteWorldEntity(displayedInspectorEntity.key)} type="button">Delete</button>
                </div>
              </div>
            ) : null}

            {activeInspectorTab === 'relationships' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Links</span>
                    <h3>Relationships</h3>
                  </div>
                  <button className="ghost-button compact" onClick={() => setRelationshipComposer({
                    sourceEntityKey: displayedInspectorEntity.key,
                    targetEntityKey: '',
                    notes: '',
                  })} type="button">Add Relationship</button>
                </div>
                {inspectorEntityRelationships.length === 0 ? <div className="inline-note">This entity has no relationships yet.</div> : null}
                {inspectorEntityRelationships.map((relationship) => {
                  const counterpart = worldEntities.find((entity) => (
                    relationship.sourceEntityKey === displayedInspectorEntity.key ? entity.key === relationship.targetEntityKey : entity.key === relationship.sourceEntityKey
                  )) ?? null
                  return (
                    <div key={relationship.key} className="schema-card world-relationship-card">
                      <div className="schema-card-head">
                        <strong>{relationship.notes.trim() || 'Relationship'}</strong>
                        <div className="world-inspector-actions">
                          {counterpart ? <button className="ghost-button compact" onClick={() => selectWorldNode(counterpart.key)} type="button">Jump</button> : null}
                          <button className="ghost-button compact" onClick={() => setEdgeEditor({
                            mode: 'edit',
                            relationshipKey: relationship.key,
                            sourceEntityKey: relationship.sourceEntityKey,
                            targetEntityKey: relationship.targetEntityKey,
                            notes: relationship.notes,
                          })} type="button">Edit</button>
                          <button className="ghost-button compact danger" onClick={() => void onDeleteWorldRelationship(relationship.key)} type="button">Remove</button>
                        </div>
                      </div>
                      <div className="inline-note">{counterpart?.name ?? 'Missing link'} · {relationship.direction} · {relationship.source}</div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {activeInspectorTab === 'usage' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Backlinks</span>
                    <h3>Usage</h3>
                  </div>
                </div>
                {inspectorEntityUsage.length === 0 ? <div className="inline-note">No downstream cinematic usage yet.</div> : null}
                {inspectorEntityUsage.map((usage) => (
                  <button key={usage.graphKey} className="rail-button item-row" onClick={() => onOpenCinematicGraph(usage.graphKey)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="cinematic" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{usage.graphName}</strong>
                      <span>Open cinematic</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {activeInspectorTab === 'suggestions' ? (
              <SuggestionPanel
                suggestions={inspectorEntitySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'related',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: {
                    sourceEntityKey: suggestion.relationshipDefaults?.sourceEntityKey ?? displayedInspectorEntity.key,
                    targetEntityKey: suggestion.relationshipDefaults?.targetEntityKey,
                    verb: suggestion.relationshipDefaults?.verb ?? 'related to',
                  },
                  canvasPosition: null,
                })}
              />
            ) : null}
          </div>
        ) : inspectorOperator ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Operator</span>
            <h3>{labelForWorldOperator(inspectorOperator.operatorType)}</h3>
            <div className="inline-note">Inputs: {inspectorOperator.inputEntityKeys.map((key) => worldEntities.find((entity) => entity.key === key)?.name ?? key).join(' + ')}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => {
                const resultNode = worldResults.find((entry) => entry.sourceOperatorKey === inspectorOperator.key)
                if (resultNode) void onGenerateWorldResultPreview(resultNode.key)
              }} type="button">Regenerate Result</button>
              <button className="ghost-button compact" onClick={() => void onUpdateWorldDerivedComposition(inspectorOperator.key, { operatorChanges: { inputEntityKeys: [...inspectorOperator.inputEntityKeys].reverse() } })} type="button">Swap Inputs</button>
              <button className="ghost-button compact danger" onClick={() => void onDeleteWorldDerivedComposition(inspectorOperator.key)} type="button">Delete Operation</button>
            </div>
          </div>
        ) : inspectorResult ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Derived Result</span>
            <h3>{inspectorResult.title}</h3>
            {imageUrlByResultKey.get(inspectorResult.key) ? (
              <div className="world-result-preview">
                <img alt={inspectorResult.title} src={imageUrlByResultKey.get(inspectorResult.key)!} />
              </div>
            ) : null}
            <div className="inline-note">{inspectorResult.summary || labelForWorldResult(inspectorResult.resultType)}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => void onGenerateWorldResultPreview(inspectorResult.key)} type="button">Generate Preview</button>
              <button className="ghost-button compact" onClick={() => onCreateCinematicReferenceFromWorldResult(inspectorResult.key)} type="button">Create Cinematic Ref</button>
              <button className="ghost-button compact" onClick={() => {
                const graphKey = typeof inspectorResult.metadata?.cinematicGraphKey === 'string' ? inspectorResult.metadata.cinematicGraphKey : null
                if (graphKey) onOpenCinematicGraph(graphKey)
              }} type="button">Open In Cinematics</button>
              <button className="ghost-button compact danger" onClick={() => void onDeleteWorldDerivedComposition(inspectorResult.sourceOperatorKey)} type="button">Delete Result</button>
            </div>
          </div>
        ) : (
          <div className="detail-stack compact">
            <span className="eyebrow">World Graph</span>
            <h3>Nothing selected</h3>
          </div>
        )}
          </>
        )}
      </aside>
    </div>
  )
}

function WorldPromptChatPanel({
  activePromptTurn,
  busy,
  cancelBusy,
  pendingOps,
  promptText,
  promptClassification,
  promptPreview,
  selectedEntity,
  selectedSession,
  selectedThreadKey,
  selectedView,
  sessionEvents,
  sessionMessages,
  worldThreads,
  worldPromptSessions,
  promptSuggestions,
  promptScopeDecision,
  resolvingPromptOpIds,
  variant,
  onApplyPreview,
  onApprove,
  onCancelTurn,
  onChangePromptText,
  onExtractThreadToCinematic,
  onParkThread,
  onReject,
  onRunSuggestion,
  onSelectSession,
  onSelectThread,
  onResolveThread,
  onSubmit,
}: {
  activePromptTurn: WorldPromptTurn | null
  busy: boolean
  cancelBusy: boolean
  pendingOps: WorldPromptPendingOp[]
  promptText: string
  promptClassification: WorldPromptClassification | null
  promptPreview: WorldPromptPlanPreview | null
  selectedEntity: WorldEntity | null
  selectedSession: WorldPromptSession | null
  selectedThreadKey: string | null
  selectedView: WorldView
  sessionEvents: WorldPromptEvent[]
  sessionMessages: WorldPromptMessage[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  promptSuggestions: WorldPromptSuggestion[]
  promptScopeDecision: WorldPromptScopeDecision | null
  resolvingPromptOpIds: string[]
  variant: 'drawer' | 'grow'
  onApplyPreview: (turnId: string) => Promise<void> | void
  onApprove: (turnId: string, opId: string) => Promise<void> | void
  onCancelTurn: (turnId: string) => Promise<void> | void
  onChangePromptText: (value: string) => void
  onExtractThreadToCinematic: (threadKey: string, mode?: 'teaser' | 'scene') => Promise<void> | void
  onParkThread: (threadKey: string) => Promise<void> | void
  onReject: (turnId: string, opId: string) => Promise<void> | void
  onRunSuggestion: (suggestion: WorldPromptSuggestion) => Promise<void> | void
  onSelectSession: (key: string | null) => void
  onSelectThread: (key: string | null) => void
  onResolveThread: (threadKey: string) => Promise<void> | void
  onSubmit: (promptOverride?: string) => Promise<void> | void
}) {
  const feed = sessionEvents.slice(-20).reverse()
  const previewItems = promptPreview?.items ?? []
  const previewTurnId = activePromptTurn?.id ?? sessionEvents[sessionEvents.length - 1]?.turnId ?? null
  const previewImpact = previewItems.reduce((totals, item) => ({
    nodeCount: totals.nodeCount + item.estimatedImpact.nodeCount,
    edgeCount: totals.edgeCount + item.estimatedImpact.edgeCount,
    queueCount: totals.queueCount + item.estimatedImpact.queueCount,
  }), { nodeCount: 0, edgeCount: 0, queueCount: 0 })
  const canApplyPreview = Boolean(promptPreview?.canApplyFirstWave && !promptPreview.appliedAt && selectedSession)
  const canCancelTurn = Boolean(activePromptTurn && ['queued', 'streaming', 'awaiting_approval'].includes(activePromptTurn.status))
  const runThreadPrompt = (thread: WorldThread, mode: 'continue' | 'plan') => {
    onSelectThread(thread.key)
    const prompt = mode === 'plan'
      ? `Plan only the next best beat for the world thread "${thread.title}". Preserve existing canon and do not apply graph mutations.`
      : `Continue the world thread "${thread.title}" with one compact additive step. Build on: ${thread.summary || thread.title}.`
    return onSubmit(prompt)
  }
  return (
    <div className={variant === 'grow' ? 'detail-stack compact world-prompt-workbench-panel' : 'detail-stack compact'}>
      <div className="drawer-head">
        <div>
          <span className="eyebrow">Prompt To World</span>
          <h3>{selectedSession?.title ?? 'World Session'}</h3>
        </div>
      </div>

      <label className="field-block">
        <span>Session</span>
        <select value={selectedSession?.key ?? ''} onChange={(event) => onSelectSession(event.target.value || null)}>
          {worldPromptSessions.length === 0 ? <option value="">Default session</option> : null}
          {worldPromptSessions.map((session) => (
            <option key={session.id} value={session.key}>{session.title}</option>
          ))}
        </select>
      </label>

      <div className="chip-row">
        {selectedEntity ? <span className="chip">Focus: {selectedEntity.name}</span> : null}
        {selectedThreadKey ? <span className="chip">Thread: {worldThreads.find((thread) => thread.key === selectedThreadKey)?.title ?? selectedThreadKey}</span> : null}
        <span className="chip">View: {selectedView.name}</span>
        {activePromptTurn ? <span className="chip">{activePromptTurn.status}</span> : null}
        {promptScopeDecision ? <span className="chip">{promptScopeDecision.mode}</span> : null}
        {promptClassification ? <span className="chip">{describePromptClassification(promptClassification)}</span> : null}
      </div>

      <div className="editor-section compact-section">
        <label className="field-block">
          <span>Prompt</span>
          <textarea
            rows={variant === 'grow' ? 5 : 4}
            placeholder="Add two rival siblings, establish their shared history, and give one a ruined observatory as a base."
            value={promptText}
            onChange={(event) => onChangePromptText(event.target.value)}
          />
        </label>
        <div className="world-inspector-actions">
          <button className="primary-button compact" disabled={busy || !promptText.trim()} onClick={() => void onSubmit()} type="button">
            {busy ? 'Growing...' : 'Grow World'}
          </button>
          {canCancelTurn ? (
            <button className="ghost-button compact" disabled={cancelBusy} onClick={() => void onCancelTurn(activePromptTurn!.id)} type="button">
              Cancel Turn
            </button>
          ) : null}
        </div>
      </div>

      {promptPreview ? (
        <div className="editor-section compact-section world-prompt-preview-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Preview</span>
              <h3>{promptPreview.mode === 'plan_only' ? 'Plan Only' : 'First Wave Ready'}</h3>
            </div>
          </div>
          <div className="inline-note">{promptPreview.requestSummary || 'Previewed prompt actions for this turn.'}</div>
          <div className="chip-row">
            <span className="chip">{promptPreview.mode === 'plan_only' ? 'No mutations yet' : 'Staged first wave'}</span>
            {previewImpact.nodeCount > 0 ? <span className="chip">+{previewImpact.nodeCount} nodes</span> : null}
            {previewImpact.edgeCount > 0 ? <span className="chip">+{previewImpact.edgeCount} links</span> : null}
            {previewImpact.queueCount > 0 ? <span className="chip">{previewImpact.queueCount} queue{previewImpact.queueCount === 1 ? '' : 's'}</span> : null}
            {promptPreview.appliedAt ? <span className="chip">Applied</span> : null}
          </div>
          {previewItems.length > 0 ? (
            <div className="world-preview-list">
              {previewItems.map((item) => (
                <div key={item.id} className="schema-card">
                  <div className="schema-card-head">
                    <strong>{item.title}</strong>
                    <span>{item.status}</span>
                  </div>
                  {item.summary ? <div className="inline-note">{item.summary}</div> : null}
                  <div className="chip-row">
                    <span className="chip">{item.diffMode === 'touches_existing' ? 'Touches Existing' : 'New'}</span>
                    {item.touchesCanon ? <span className="chip">Canon Touch</span> : null}
                    {item.approvalRequired ? <span className="chip">Approval Required</span> : null}
                    {item.estimatedImpact.nodeCount > 0 ? <span className="chip">+{item.estimatedImpact.nodeCount} nodes</span> : null}
                    {item.estimatedImpact.edgeCount > 0 ? <span className="chip">+{item.estimatedImpact.edgeCount} links</span> : null}
                    {item.estimatedImpact.queueCount > 0 ? <span className="chip">{item.estimatedImpact.queueCount} queue</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="inline-note">No coherent first-wave items were retained for preview.</div>
          )}
          <div className="world-inspector-actions">
            <button className="primary-button compact" disabled={busy || !canApplyPreview || !previewTurnId} onClick={() => previewTurnId ? void onApplyPreview(previewTurnId) : undefined} type="button">
              {promptPreview.appliedAt ? 'Applied' : 'Apply First Wave'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Live Steps</span>
            <h3>{feed.length} event{feed.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        {feed.length === 0 ? <div className="inline-note">Prompt this world to begin streaming planner steps and graph updates.</div> : null}
        <div className="diagnostic-stack">
          {feed.map((event) => {
            const description = describePromptFeedEvent(event)
            return (
              <div key={event.id} className="inline-note">
                <strong>{description.label}</strong>
                {description.detail ? <span> {description.detail}</span> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Conversation</span>
            <h3>{sessionMessages.length} message{sessionMessages.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        {sessionMessages.length === 0 ? <div className="inline-note">Prompt this world to begin growing the graph live.</div> : null}
        <div className="diagnostic-stack">
          {sessionMessages.slice(-12).map((message) => (
            <div key={message.id} className="inline-note">
              <strong>{message.role}</strong>
              <span> {message.content}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Threads</span>
            <h3>{worldThreads.length} active</h3>
          </div>
        </div>
        {worldThreads.length === 0 ? <div className="inline-note">No active world threads yet. Broad prompts will start creating them as the world takes shape.</div> : null}
        <div className="world-thread-list">
          {worldThreads.map((thread) => (
            <div key={thread.id} className={`schema-card world-thread-card${selectedThreadKey === thread.key ? ' is-selected' : ''}`}>
              <div className="schema-card-head">
                <strong>{thread.title}</strong>
                <span>{thread.priority}</span>
              </div>
              {thread.summary ? <div className="inline-note">{thread.summary}</div> : null}
              <div className="chip-row">
                <span className="chip">{thread.status}</span>
                <span className="chip">{thread.linkedEntityKeys.length} linked</span>
              </div>
              <div className="world-inspector-actions">
                <button className="ghost-button compact" onClick={() => onSelectThread(thread.key)} type="button">Select</button>
                <button className="primary-button compact" disabled={busy} onClick={() => void runThreadPrompt(thread, 'continue')} type="button">Continue Thread</button>
                <button className="ghost-button compact" disabled={busy} onClick={() => void runThreadPrompt(thread, 'plan')} type="button">Plan Next Beat</button>
                <button className="ghost-button compact" disabled={busy} onClick={() => void onExtractThreadToCinematic(thread.key, 'teaser')} type="button">Extract To Cinematic</button>
                <button className="ghost-button compact" disabled={busy} onClick={() => void onResolveThread(thread.key)} type="button">Resolve</button>
                <button className="ghost-button compact" disabled={busy} onClick={() => void onParkThread(thread.key)} type="button">Park</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Next Moves</span>
            <h3>{promptSuggestions.length} suggestion{promptSuggestions.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        {promptSuggestions.length === 0 ? <div className="inline-note">No narrowing suggestions on the current turn.</div> : null}
        <div className="world-choice-list">
          {promptSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              className={`world-prompt-suggestion-card${suggestion.style === 'primary' ? ' is-primary' : ''}`}
              disabled={busy}
              onClick={() => void onRunSuggestion(suggestion)}
              type="button"
            >
              <strong>{suggestion.label}</strong>
              {suggestion.threadKey ? <small>Thread-backed</small> : null}
              {suggestion.summary ? <span>{suggestion.summary}</span> : null}
              {promptSuggestionImpactLabel(suggestion) ? <small>{promptSuggestionImpactLabel(suggestion)}</small> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Pending Approval</span>
            <h3>{pendingOps.length} op{pendingOps.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        {pendingOps.length === 0 ? <div className="inline-note">No held changes.</div> : null}
        <div className="diagnostic-stack">
          {pendingOps.map((entry) => {
            const resolving = resolvingPromptOpIds.includes(entry.op.id)
            return (
              <div key={entry.op.id} className="schema-card world-relationship-card">
                <div className="schema-card-head">
                  <strong>{describePromptOp(entry.op)}</strong>
                  <span>{entry.turn.prompt}</span>
                </div>
                <div className="inline-note">{entry.op.rationale || 'Requires approval before applying to the existing graph.'}</div>
                <div className="world-inspector-actions">
                  <button className="primary-button compact" disabled={resolving} onClick={() => void onApprove(entry.turn.id, entry.op.id)} type="button">
                    {resolving ? 'Working...' : 'Approve'}
                  </button>
                  <button className="ghost-button compact" disabled={resolving} onClick={() => void onReject(entry.turn.id, entry.op.id)} type="button">Reject</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WorldPromptActivityPanel({
  selectedSession,
  sessionEvents,
  sessionTurns,
}: {
  selectedSession: WorldPromptSession | null
  sessionEvents: WorldPromptEvent[]
  sessionTurns: WorldPromptTurn[]
}) {
  return (
    <div className="detail-stack compact">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">World Prompt Activity</span>
          <h3>{selectedSession?.title ?? 'No session selected'}</h3>
        </div>
      </div>
      <div className="chip-row">
        <span className="chip">{sessionTurns.length} turns</span>
        <span className="chip">{sessionEvents.length} events</span>
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Recent Events</span>
            <h3>Timeline</h3>
          </div>
        </div>
        {sessionEvents.length === 0 ? <div className="inline-note">No world prompt activity yet.</div> : null}
        <div className="diagnostic-stack">
          {sessionEvents.slice(-20).reverse().map((event) => {
            const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
            const label = parsedPayload.success && parsedPayload.data.op ? describePromptOp(parsedPayload.data.op) : parsedPayload.success && parsedPayload.data.note ? parsedPayload.data.note : event.eventType
            return (
              <div key={event.id} className="inline-note">
                <strong>{event.eventType}</strong>
                <span> #{event.sequence} · {label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EntityComposer({
  entityComposer,
  onCancel,
  onCreate,
}: {
  entityComposer: EntityComposerState
  onCancel: () => void
  onCreate: (input: WorldEntityCreateInput) => Promise<void>
}) {
  const [nodeType, setNodeType] = useState<WorldEntity['nodeType']>(entityComposer.defaults.nodeType ?? 'actor')
  const [name, setName] = useState(entityComposer.defaults.name ?? '')
  const [summary, setSummary] = useState(entityComposer.defaults.summary ?? '')

  return (
    <div className="editor-section compact-section world-composer-card">
      <div className="section-head">
        <div>
          <span className="eyebrow">{entityComposer.mode === 'related' ? 'Related Entity' : 'New Entity'}</span>
          <h3>{entityComposer.mode === 'related' ? 'Add Related Entity' : 'Create Entity'}</h3>
        </div>
      </div>
      <label className="field-block">
        <span>Type</span>
        <select value={nodeType} onChange={(event) => setNodeType(event.target.value as WorldEntity['nodeType'])}>
          <option value="actor">Character</option>
          <option value="group">Group</option>
          <option value="place">Place</option>
          <option value="object">Item</option>
          <option value="concept">Lore</option>
          <option value="event">Event</option>
        </select>
      </label>
      <label className="field-block">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field-block">
        <span>Summary</span>
        <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!name.trim()}
          onClick={() => void onCreate({
            name: name.trim(),
            summary: summary.trim(),
            nodeType,
            aliases: [],
            tags: [],
            status: 'active',
            thumbnailAssetKey: null,
            linkedDefinitionKey: null,
            source: 'user',
            customProperties: {},
            metadata: {},
            ensureLinkedDefinition: true,
          })}
          type="button"
        >
          Create
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function RelationshipComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: RelationshipComposerState
  onCancel: () => void
  onCreate: (input: WorldRelationshipCreateInput) => Promise<void>
}) {
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const [notes, setNotes] = useState(state.notes)

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Connection note</span>
        <textarea
          rows={3}
          placeholder="How these two things relate"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!targetEntityKey}
          onClick={() => void onCreate({
            sourceEntityKey: state.sourceEntityKey,
            targetEntityKey,
            verb: 'related to',
            direction: 'outbound',
            strength: null,
            confidence: null,
            source: 'user',
            notes: notes.trim(),
            state: 'confirmed',
            metadata: {},
          })}
          type="button"
        >
          Create Link
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function CompositionComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: CompositionComposerState
  onCancel: () => void
  onCreate: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void>
}) {
  const [sourceEntityKey, setSourceEntityKey] = useState(state.sourceEntityKey)
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const sourceEntity = entities.find((entity) => entity.key === sourceEntityKey) ?? entities[0] ?? null
  const targetEntity = entities.find((entity) => entity.key === targetEntityKey) ?? null
  const options = sourceEntity && targetEntity ? getDerivedOperationsForEntityPair(sourceEntity, targetEntity) : []
  const [operatorType, setOperatorType] = useState<WorldOperator['operatorType']>(state.operatorType)

  useEffect(() => {
    if (options.length > 0 && !options.some((option) => option.operatorType === operatorType)) {
      setOperatorType(options[0].operatorType)
    }
  }, [operatorType, options])

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Source entity</span>
        <select value={sourceEntityKey} onChange={(event) => setSourceEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.filter((entity) => entity.key !== sourceEntityKey).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Operation</span>
        <select value={operatorType} onChange={(event) => setOperatorType(event.target.value as WorldOperator['operatorType'])}>
          {options.length === 0 ? <option value="">No valid operations</option> : null}
          {options.map((option) => <option key={option.operatorType} value={option.operatorType}>{option.label}</option>)}
        </select>
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!sourceEntityKey || !targetEntityKey || options.length === 0}
          onClick={() => void onCreate({ sourceEntityKey, targetEntityKey, operatorType })}
          type="button"
        >
          Create Derived Result
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function SuggestionPanel({
  suggestions,
  onApply,
}: {
  suggestions: ReturnType<typeof buildGlobalWorldSuggestions>
  onApply: (suggestion: ReturnType<typeof buildGlobalWorldSuggestions>[number]) => void
}) {
  return (
    <div className="editor-section compact-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">World Brain</span>
          <h3>Suggestions</h3>
        </div>
      </div>
      {suggestions.length === 0 ? <div className="inline-note">No high-priority suggestions right now.</div> : null}
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="schema-card">
          <div className="schema-card-head">
            <strong>{suggestion.title}</strong>
            <button className="ghost-button compact" onClick={() => onApply(suggestion)} type="button">{suggestion.cta === 'generate' ? 'Generate' : suggestion.cta === 'link' ? 'Link' : 'Add'}</button>
          </div>
          <div className="inline-note">{suggestion.why}</div>
        </div>
      ))}
    </div>
  )
}
