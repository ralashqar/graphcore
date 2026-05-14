import type { CSSProperties } from 'react'

import type {
  PromptToWorldOp,
  WorldPromptDiagnosticFinding,
  WorldPromptEvent,
  WorldPromptGenerationJob,
  WorldPromptGenerationJobStep,
  WorldPromptIncrementalWorkItem,
  WorldPromptMessage,
  WorldPromptPlannerFailure,
  WorldPromptPlannerProgress,
  WorldPromptPlanPreview,
  WorldPromptSuggestion,
  WorldPromptTurn,
} from '../../domain/worldPrompt.ts'
import { isInitialSeedGenerationTurn, worldPromptEventPayloadSchema, worldPromptPlanPreviewSchema } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldOperator, WorldRelationship, WorldResult } from '../../domain/worldGraph.ts'
import type { WorldGraphDepthMode, WorldSceneDisplayTier, WorldSceneTransitionState } from '../../domain/worldGraphScene.ts'
import { labelForWorldEntity } from '../../domain/worldGraphHelpers.ts'
import { readWorldSequenceMetadata } from '../../domain/worldSequence.ts'

const WORLD_INSPECTOR_REFINEMENT_HISTORY_LIMIT = 5

export type WorldGraphNodeRecord =
  | { kind: 'entity'; entity: WorldEntity; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'operator'; operator: WorldOperator; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'result'; result: WorldResult; title: string; subtitle: string; summary: string; imageUrl: string | null }

export type WorldNodeData = {
  record: WorldGraphNodeRecord
  relationCount: number
  usageCount: number
  dimmed: boolean
  pinned: boolean
  storyLinked: boolean
  displayTier: WorldSceneDisplayTier
  visualMode: WorldNodeVisualMode
  transitionState: WorldSceneTransitionState
  animateIn: boolean
  animateSceneEnter: boolean
  highlighted: boolean
  showMiniLabel: boolean
  branchLabel?: string | null
  visibilityReason: WorldNodeVisibilityReason
}

export type WorldNodeVisualMode = 'card' | 'nearIcon' | 'farIcon' | 'peripheralDot'

export type WorldNodeVisibilityReasonKind =
  | 'focus_root'
  | 'selected'
  | 'turn_lens_changed'
  | 'turn_lens_endpoint'
  | 'pinned'
  | 'story_linked'
  | 'direct_neighbor'
  | 'peripheral_branch'
  | 'near_context'
  | 'far_context'
  | 'derived_output'
  | 'context'

export type WorldNodeVisibilityReason = {
  kind: WorldNodeVisibilityReasonKind
  label: string
  detail: string
}

export type WorldPromptTurnLens = {
  turnId: string
  createdAt: string
  label: string
  prompt: string
  entityKeys: string[]
  relationshipKeys: string[]
  operatorKeys: string[]
  resultKeys: string[]
  nodeKeys: string[]
  rootEntityKey: string | null
  changeCount: number
  entityChangeKinds: Record<string, WorldPromptTurnLensChangeKind>
  relationshipChangeKinds: Record<string, WorldPromptTurnLensChangeKind>
  counts: {
    entities: number
    relationships: number
    derived: number
    total: number
  }
}

export type WorldPromptTurnLensChangeKind = 'added' | 'modified' | 'replaced' | 'touched'

export type WorldEdgeRevealReason = 'lens' | 'selected' | 'focus_hover' | 'story' | 'hidden'

export type WorldEdgeReveal = {
  visible: boolean
  reason: WorldEdgeRevealReason
  emphasized: boolean
}

export type WorldGraphPresentationPreset = 'focus' | 'explore' | 'story' | 'recent' | 'wide'

export type WorldGraphPresentationPresetConfig = {
  preset: WorldGraphPresentationPreset
  depthMode: WorldGraphDepthMode
  showBranchLabels: boolean
  emphasizeEntityTypes: boolean
  emphasizeThreads: boolean
  edgeDensity: 'minimal' | 'context'
}

export type WorldGraphDisplayFilterKey =
  | 'characters'
  | 'places'
  | 'groups'
  | 'objects'
  | 'concepts'
  | 'events'
  | 'threads'
  | 'derived'
  | 'pinned'
  | 'recent'

export type WorldGraphDisplayFilters = Record<WorldGraphDisplayFilterKey, boolean>

export const DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS: WorldGraphDisplayFilters = {
  characters: true,
  places: true,
  groups: true,
  objects: true,
  concepts: true,
  events: true,
  threads: true,
  derived: true,
  pinned: true,
  recent: true,
}

export type WorldGraphFilterState = {
  filters: WorldGraphDisplayFilters
  enabledEntityTypes: WorldEntity['nodeType'][]
  showDerived: boolean
  showThreads: boolean
  showPinned: boolean
  showRecent: boolean
  disabledCount: number
}

export type WorldGraphLabelPolicy = {
  showNodeLabel: boolean
  showBranchLabel: boolean
}

export type WorldGraphGrowthPlaybackStep = {
  turnId: string
  index: number
  label: string
  prompt: string
  turnLens: WorldPromptTurnLens
  fitNodeKeys: string[]
}

export type WorldGraphGrowthPlaybackModel = {
  steps: WorldGraphGrowthPlaybackStep[]
  activeStep: WorldGraphGrowthPlaybackStep | null
  activeIndex: number
  canGoPrevious: boolean
  canGoNext: boolean
}

export type WorldPromptTranscriptEntry =
  | { id: string; createdAt: string; kind: 'user_message' | 'assistant_message'; content: string; pending?: boolean }
  | { id: string; createdAt: string; kind: 'system_status'; label: string; detail?: string; tone?: 'normal' | 'error' }
  | { id: string; createdAt: string; kind: 'planner_progress'; label: string; detail?: string; phase: WorldPromptPlannerProgress['phase']; outline: string[]; done?: boolean }
  | { id: string; createdAt: string; kind: 'turn_lens'; label: string; detail?: string; turnLens: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'entity_created'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType']; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'entity_updated'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType']; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'entity_replaced'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType']; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'relationship_created'; label: string; detail?: string; relationshipKey: string; sourceLabel: string; targetLabel: string; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'relationship_updated'; label: string; detail?: string; relationshipKey: string; sourceLabel: string; targetLabel: string; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'sequence_rewired'; label: string; detail?: string; sequencePatchAudit: Record<string, unknown>; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'relationship_rewired'; label: string; detail?: string; audit: Record<string, unknown>; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'entity_merged'; label: string; detail?: string; audit: Record<string, unknown>; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'entity_canon_updated'; label: string; detail?: string; entityKey: string; entityNodeType?: WorldEntity['nodeType']; audit: Record<string, unknown>; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'node_evolution'; label: string; detail?: string; nodeEvolution: Record<string, unknown>; transaction?: Record<string, unknown>; tone?: 'normal' | 'warning' | 'error' | 'success' | 'working' }
  | { id: string; createdAt: string; kind: 'canon_transaction'; label: string; detail?: string; transaction: Record<string, unknown>; tone?: 'normal' | 'warning' | 'error' | 'success' | 'working' }
  | { id: string; createdAt: string; kind: 'op_status'; label: string; detail?: string; validation?: Record<string, unknown>; op?: PromptToWorldOp; tone?: 'normal' | 'warning' | 'error' | 'success' | 'working' }
  | { id: string; createdAt: string; kind: 'derived_result_created'; label: string; detail?: string; resultKey: string; turnLens?: WorldPromptTurnLens }
  | { id: string; createdAt: string; kind: 'queue_started'; label: string; detail?: string }
  | { id: string; createdAt: string; kind: 'advisory_answer'; label: string; detail?: string }
  | { id: string; createdAt: string; kind: 'diagnostic_finding'; label: string; detail?: string; severity: WorldPromptDiagnosticFinding['severity'] }
  | { id: string; createdAt: string; kind: 'preview_available'; label: string; detail?: string; turnId: string; preview: WorldPromptPlanPreview }
  | { id: string; createdAt: string; kind: 'approval_required'; label: string; detail?: string; turnId: string; ops: PromptToWorldOp[] }
  | { id: string; createdAt: string; kind: 'suggestion_set'; suggestions: WorldPromptSuggestion[]; label?: string }
  | { id: string; createdAt: string; kind: 'clarification_question'; suggestions: WorldPromptSuggestion[]; label?: string }
  | { id: string; createdAt: string; kind: 'clarification_answer'; label: string; detail?: string }
  | { id: string; createdAt: string; kind: 'continuation_without_suggestion'; label: string; detail?: string }

export type WorldFeedFilter = 'all' | 'additions' | 'changes' | 'relationships' | 'media' | 'suggestions'

export const WORLD_FEED_FILTERS: Array<{ key: WorldFeedFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'additions', label: 'Additions' },
  { key: 'changes', label: 'Changes' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'media', label: 'Media' },
  { key: 'suggestions', label: 'Suggestions' },
]

export type WorldFeedEntryKind =
  | 'active_turn'
  | 'turn_update'
  | 'prompt'
  | 'assistant_note'
  | 'turn_summary'
  | 'entity_created'
  | 'entity_updated'
  | 'relationship_created'
  | 'relationship_updated'
  | 'sequence_rewired'
  | 'relationship_rewired'
  | 'entity_merged'
  | 'entity_canon_updated'
  | 'node_evolution'
  | 'canon_transaction'
  | 'op_status'
  | 'wiki_updated'
  | 'media_job'
  | 'derived_result'
  | 'suggestion'
  | 'diagnostic'
  | 'status'

export type WorldFeedEntry = {
  id: string
  createdAt: string
  kind: WorldFeedEntryKind
  filter: WorldFeedFilter
  relatedFilters?: WorldFeedFilter[]
  title: string
  detail: string
  compactDetail?: string
  badge: string
  tone?: 'normal' | 'working' | 'success' | 'warning' | 'error'
  entityKey?: string
  entityNodeType?: WorldEntity['nodeType']
  relationshipKey?: string
  sourceLabel?: string
  targetLabel?: string
  relationshipVerb?: string
  sequencePatchAudit?: Record<string, unknown>
  audit?: Record<string, unknown>
  transaction?: Record<string, unknown>
  nodeEvolution?: Record<string, unknown>
  validation?: Record<string, unknown>
  thumbnailEntityKeys?: string[]
  connectedEntityKeys?: string[]
  changedFields?: string[]
  promptExcerpt?: string
  changeCounts?: {
    addedEntities: number
    updatedEntities: number
    relationships: number
    wiki: number
    media: number
    suggestions: number
    total: number
  }
  fullDetail?: string
  turnId?: string
  parentTurnId?: string
  sortOrder?: number
  turnLens?: WorldPromptTurnLens
  resultKey?: string
  suggestions?: WorldPromptSuggestion[]
}

export type WorldFeedGroup = {
  id: string
  label: string
  entries: WorldFeedEntry[]
}

export type WorldFeedViewModel = {
  entries: WorldFeedEntry[]
  groups: WorldFeedGroup[]
  countsByFilter: Record<WorldFeedFilter, number>
  activeTurnEntry: WorldFeedEntry | null
  suggestions: WorldPromptSuggestion[]
}

export type WorldPromptRailState =
  | 'idle'
  | 'working'
  | 'needs_clarification'
  | 'plan_preview'
  | 'approval_required'
  | 'completed'
  | 'blocked'

export type WorldPromptRailViewModel = {
  state: WorldPromptRailState
  title: string
  detail: string
  statusLabel: string
  primaryActionLabel: string
  primaryActionKind: 'generate' | 'apply_preview' | 'review_approval' | 'continue'
  latestSuggestions: WorldPromptSuggestion[]
  preview: WorldPromptPlanPreview | null
  approvalOps: PromptToWorldOp[]
  appliedEntities: string[]
  appliedRelationships: string[]
  queuedLabels: string[]
  latestPlannerStatus: string | null
  plannerFailure: WorldPromptPlannerFailure | null
}

export type WorldPromptBuildStepStatus = 'pending' | 'active' | 'done' | 'failed'

export type WorldPromptBuildStep = {
  id: string
  createdAt: string
  title: string
  detail: string
  status: WorldPromptBuildStepStatus
  kind: WorldPromptIncrementalWorkItem['kind'] | 'planner_phase'
  phase: WorldPromptPlannerProgress['phase'] | null
  index: number | null
  total: number | null
}

export type WorldPromptSessionTokenMeter = {
  usedTokens: number
  tokenLimit: number
  percentage: number
  label: string
  title: string
  estimated: boolean
  currentTurnTokens: number
  lastStepTokens: number
  rows: Array<{
    label: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cachedInputTokens: number
    reasoningTokens: number
  }>
}

export type WorldInspectorViewModel = {
  title: string
  kicker: string
  summary: string
  context: string
  imageUrl: string | null
  stats: string[]
  sequence: {
    unitKind: string
    sequenceKey: string
    ordinal: number | null
    actLabel: string
    storyFunction: string
    synopsis: string
    dramaticQuestion: string
    outcome: string
    scriptExpansionReady: boolean
    consequences: Array<{
      cause: string
      effect: string
      label: string
      affectedEntityKeys: string[]
      threadKeys: string[]
    }>
    characterArcDeltas: Array<{ actorKey: string; before: string; pressure: string; choice: string; after: string }>
    openLoops: string[]
    resolvedLoops: string[]
    previousLabels: string[]
    nextLabels: string[]
  } | null
  refinementHistory: WorldInspectorRefinementHistoryItem[]
}

export type WorldInspectorRefinementHistoryItem = {
  id: string
  at: string
  field: 'summary' | 'context' | 'notes'
  fieldLabel: string
  strategy: string
  strategyLabel: string
  previousText: string
  incomingText: string
  resultText: string
}

export function worldNodeRecordEqual(left: WorldGraphNodeRecord, right: WorldGraphNodeRecord) {
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

export function worldNodeDataEqual(left: WorldNodeData, right: WorldNodeData) {
  return (
    left.relationCount === right.relationCount
    && left.usageCount === right.usageCount
    && left.dimmed === right.dimmed
    && left.pinned === right.pinned
    && left.storyLinked === right.storyLinked
    && left.displayTier === right.displayTier
    && left.visualMode === right.visualMode
    && left.transitionState === right.transitionState
    && left.animateIn === right.animateIn
    && left.animateSceneEnter === right.animateSceneEnter
    && left.highlighted === right.highlighted
    && left.showMiniLabel === right.showMiniLabel
    && left.branchLabel === right.branchLabel
    && left.visibilityReason.kind === right.visibilityReason.kind
    && left.visibilityReason.label === right.visibilityReason.label
    && left.visibilityReason.detail === right.visibilityReason.detail
    && worldNodeRecordEqual(left.record, right.record)
  )
}

export function buildWorldGraphPresentationPresetConfig(input: {
  preset: WorldGraphPresentationPreset
  mode?: 'world' | 'story'
  manualDepthMode?: WorldGraphDepthMode | null
}): WorldGraphPresentationPresetConfig {
  const depthByPreset: Record<WorldGraphPresentationPreset, WorldGraphDepthMode> = {
    focus: 'tight',
    explore: 'nearby',
    story: 'nearby',
    recent: 'nearby',
    wide: 'wide',
  }
  const preset = input.mode === 'story' && input.preset === 'explore' ? 'story' : input.preset
  return {
    preset,
    depthMode: input.manualDepthMode ?? depthByPreset[preset],
    showBranchLabels: preset === 'explore' || preset === 'recent' || preset === 'wide',
    emphasizeEntityTypes: preset !== 'focus',
    emphasizeThreads: preset === 'story' || input.mode === 'story',
    edgeDensity: preset === 'wide' || preset === 'story' ? 'context' : 'minimal',
  }
}

export function buildWorldGraphFilterState(input?: Partial<WorldGraphDisplayFilters> | null): WorldGraphFilterState {
  const filters: WorldGraphDisplayFilters = {
    ...DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS,
    ...(input ?? {}),
  }
  const enabledEntityTypes: WorldEntity['nodeType'][] = [
    filters.characters ? 'actor' : null,
    filters.places ? 'place' : null,
    filters.groups ? 'group' : null,
    filters.objects ? 'object' : null,
    filters.concepts ? 'concept' : null,
    filters.events ? 'event' : null,
    filters.events ? 'sequence_unit' : null,
  ].filter((value): value is WorldEntity['nodeType'] => value !== null)

  return {
    filters,
    enabledEntityTypes,
    showDerived: filters.derived,
    showThreads: filters.threads,
    showPinned: filters.pinned,
    showRecent: filters.recent,
    disabledCount: Object.values(filters).filter((value) => !value).length,
  }
}

export function buildWorldGraphLabelPolicy(input: {
  zoom: number
  showLabels: boolean
  preset: WorldGraphPresentationPreset
  visualMode: WorldNodeVisualMode
  displayTier: WorldSceneDisplayTier
  highlighted?: boolean
  isTurnLensEndpoint?: boolean
  hovered?: boolean
  selected?: boolean
  inspected?: boolean
  hasBranchLabel?: boolean
}): WorldGraphLabelPolicy {
  const zoom = Number.isFinite(input.zoom) ? input.zoom : 1
  const isImportant = Boolean(input.highlighted || input.isTurnLensEndpoint || input.hovered || input.selected || input.inspected)
  const isOuter = input.displayTier === 'far' || input.displayTier === 'peripheral'
  const presetLikesContext = input.preset === 'explore' || input.preset === 'recent' || input.preset === 'wide' || input.preset === 'story'

  if (isImportant) {
    return {
      showNodeLabel: true,
      showBranchLabel: Boolean(input.hasBranchLabel && isOuter),
    }
  }

  if (input.visualMode === 'card') {
    return { showNodeLabel: false, showBranchLabel: false }
  }

  const showNodeLabel =
    input.visualMode === 'nearIcon'
      ? isOuter
        ? (input.showLabels && zoom >= 0.48) || (presetLikesContext && zoom >= 0.88)
        : input.showLabels || zoom >= 0.58
      : input.visualMode === 'farIcon'
        ? (input.showLabels && zoom >= 0.48) || (presetLikesContext && zoom >= 0.88)
        : (input.showLabels && zoom >= 0.72) || (input.preset === 'wide' && zoom >= 1.02)

  const showBranchLabel = Boolean(
    input.hasBranchLabel
    && isOuter
    && (
      (input.showLabels && zoom >= 0.42)
      || (presetLikesContext && zoom >= 0.62)
    ),
  )

  return { showNodeLabel, showBranchLabel }
}

export function buildWorldGraphGrowthPlaybackModel(input: {
  turnLenses: Iterable<WorldPromptTurnLens>
  activeTurnId?: string | null
}): WorldGraphGrowthPlaybackModel {
  const steps = [...input.turnLenses]
    .filter((lens) => lens.changeCount > 0)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.turnId.localeCompare(right.turnId))
    .map((lens, index): WorldGraphGrowthPlaybackStep => ({
      turnId: lens.turnId,
      index,
      label: lens.label,
      prompt: lens.prompt,
      turnLens: lens,
      fitNodeKeys: Array.from(new Set([...lens.nodeKeys, ...lens.entityKeys])),
    }))
  const activeIndex = input.activeTurnId
    ? steps.findIndex((step) => step.turnId === input.activeTurnId)
    : -1
  const activeStep = activeIndex >= 0 ? steps[activeIndex] ?? null : null
  return {
    steps,
    activeStep,
    activeIndex,
    canGoPrevious: activeIndex > 0,
    canGoNext: activeIndex >= 0 && activeIndex < steps.length - 1,
  }
}

export function buildWorldNodeVisibilityReason(input: {
  nodeKind: WorldGraphNodeRecord['kind']
  displayTier: WorldSceneDisplayTier
  distance?: number | null
  branchLabel?: string | null
  isFocusRoot?: boolean
  isSelected?: boolean
  isInspected?: boolean
  isPinned?: boolean
  isStoryLinked?: boolean
  isTurnLensChanged?: boolean
  isTurnLensEndpoint?: boolean
}): WorldNodeVisibilityReason {
  if (input.isSelected || input.isInspected) {
    return { kind: 'selected', label: 'Selected', detail: 'Shown because it is open in the inspector.' }
  }
  if (input.isFocusRoot) {
    return { kind: 'focus_root', label: 'Focus root', detail: 'This is the center of the current neighborhood.' }
  }
  if (input.isTurnLensChanged) {
    return { kind: 'turn_lens_changed', label: 'Changed this turn', detail: 'Included by the active prompt-turn lens.' }
  }
  if (input.isTurnLensEndpoint) {
    return { kind: 'turn_lens_endpoint', label: 'Turn-link endpoint', detail: 'Included because a changed relationship touches it.' }
  }
  if (input.isPinned) {
    return { kind: 'pinned', label: 'Pinned', detail: 'Kept visible by your graph pins.' }
  }
  if (input.isStoryLinked) {
    return { kind: 'story_linked', label: 'Story-linked', detail: 'Included by the active story thread.' }
  }
  if (input.nodeKind !== 'entity') {
    return { kind: 'derived_output', label: 'Derived output', detail: 'Shown because it is linked to the visible world graph.' }
  }
  if (input.distance === 1) {
    return { kind: 'direct_neighbor', label: 'Direct neighbor', detail: 'One link away from the current focus.' }
  }
  if ((input.displayTier === 'far' || input.displayTier === 'peripheral') && input.branchLabel) {
    return {
      kind: 'peripheral_branch',
      label: `Branch via ${input.branchLabel}`,
      detail: 'Outer context grouped by the first-hop branch from the focus.',
    }
  }
  if (input.displayTier === 'near') {
    return { kind: 'near_context', label: 'Near context', detail: 'Kept close because it is relevant to this neighborhood.' }
  }
  if (input.displayTier === 'far' || input.displayTier === 'peripheral') {
    return { kind: 'far_context', label: 'Outer context', detail: 'Compressed into the outer graph to preserve orientation.' }
  }
  return { kind: 'context', label: 'Context', detail: 'Included by the active graph view.' }
}

export function resolveWorldEdgeReveal(input: {
  edgeKey?: string | null
  sourceKey: string
  targetKey: string
  activeLensEdgeKeys?: readonly string[] | ReadonlySet<string> | null
  activeLensNodeKeys?: readonly string[] | ReadonlySet<string> | null
  selectedNodeKey?: string | null
  inspectedNodeKey?: string | null
  activeEdgeFocusNodeKey?: string | null
  hoveredNodeKey?: string | null
  storyNodeKeys?: readonly string[] | ReadonlySet<string> | null
  mode?: 'world' | 'story'
}): WorldEdgeReveal {
  const lensEdgeKeys = toReadonlySet(input.activeLensEdgeKeys)
  const lensNodeKeys = toReadonlySet(input.activeLensNodeKeys)
  const storyNodeKeys = toReadonlySet(input.storyNodeKeys)

  if (
    input.activeEdgeFocusNodeKey
    && input.hoveredNodeKey
    && ((input.sourceKey === input.activeEdgeFocusNodeKey && input.targetKey === input.hoveredNodeKey)
      || (input.targetKey === input.activeEdgeFocusNodeKey && input.sourceKey === input.hoveredNodeKey))
  ) {
    return { visible: true, reason: 'focus_hover', emphasized: false }
  }

  if (
    (input.edgeKey && lensEdgeKeys.has(input.edgeKey))
    || (lensNodeKeys.has(input.sourceKey) && lensNodeKeys.has(input.targetKey))
  ) {
    return { visible: true, reason: 'lens', emphasized: true }
  }

  const selectedAnchor = input.inspectedNodeKey ?? input.selectedNodeKey ?? null
  if (selectedAnchor && (input.sourceKey === selectedAnchor || input.targetKey === selectedAnchor)) {
    return { visible: true, reason: 'selected', emphasized: false }
  }

  if (input.mode === 'story' && storyNodeKeys.has(input.sourceKey) && storyNodeKeys.has(input.targetKey)) {
    return { visible: true, reason: 'story', emphasized: true }
  }

  return { visible: false, reason: 'hidden', emphasized: false }
}

export function nodeShellStyle(
  record: WorldGraphNodeRecord,
  selected: boolean,
  dimmed: boolean,
  visualMode: WorldNodeVisualMode = 'card',
): CSSProperties {
  const appPalette = (nodeType: WorldEntity['nodeType']) => {
    switch (nodeType) {
      case 'app':
        return ['rgba(56, 189, 248, 0.34)', 'rgba(14, 116, 144, 0.12)', 'rgba(125, 211, 252, 0.18)', '#7dd3fc']
      case 'persona':
      case 'business_goal':
        return ['rgba(52, 211, 153, 0.32)', 'rgba(5, 150, 105, 0.12)', 'rgba(167, 243, 208, 0.18)', '#86efac']
      case 'feature':
      case 'user_flow':
        return ['rgba(129, 140, 248, 0.34)', 'rgba(67, 56, 202, 0.12)', 'rgba(199, 210, 254, 0.18)', '#c4b5fd']
      case 'screen':
      case 'section':
      case 'screen_mockup':
      case 'image_region':
        return ['rgba(45, 212, 191, 0.34)', 'rgba(15, 118, 110, 0.12)', 'rgba(153, 246, 228, 0.18)', '#5eead4']
      case 'component':
        return ['rgba(251, 191, 36, 0.34)', 'rgba(180, 83, 9, 0.12)', 'rgba(253, 230, 138, 0.18)', '#fbbf24']
      case 'data_model':
      case 'action':
        return ['rgba(34, 197, 94, 0.3)', 'rgba(21, 128, 61, 0.12)', 'rgba(187, 247, 208, 0.18)', '#4ade80']
      case 'api_endpoint':
      case 'backend_function':
      case 'external_service':
        return ['rgba(96, 165, 250, 0.34)', 'rgba(29, 78, 216, 0.12)', 'rgba(191, 219, 254, 0.18)', '#93c5fd']
      case 'capability':
        return ['rgba(248, 113, 113, 0.32)', 'rgba(185, 28, 28, 0.12)', 'rgba(254, 202, 202, 0.18)', '#fca5a5']
      case 'design_system':
      case 'animation_spec':
        return ['rgba(244, 114, 182, 0.32)', 'rgba(190, 24, 93, 0.12)', 'rgba(251, 207, 232, 0.18)', '#f9a8d4']
      case 'tower':
      case 'code_file':
        return ['rgba(148, 163, 184, 0.34)', 'rgba(51, 65, 85, 0.14)', 'rgba(226, 232, 240, 0.18)', '#cbd5e1']
      default:
        return null
    }
  }
  const palette =
    record.kind === 'entity'
      ? appPalette(record.entity.nodeType) ?? (record.entity.nodeType === 'actor'
        ? ['rgba(125, 211, 252, 0.34)', 'rgba(56, 189, 248, 0.12)', 'rgba(186, 230, 253, 0.18)', '#c8e2ff']
        : record.entity.nodeType === 'group'
          ? ['rgba(248, 113, 113, 0.34)', 'rgba(185, 28, 28, 0.12)', 'rgba(254, 202, 202, 0.18)', '#ffbe9d']
          : record.entity.nodeType === 'place'
            ? ['rgba(94, 234, 212, 0.3)', 'rgba(13, 148, 136, 0.12)', 'rgba(153, 246, 228, 0.18)', '#a7f3d0']
            : record.entity.nodeType === 'object'
              ? ['rgba(250, 204, 21, 0.32)', 'rgba(161, 98, 7, 0.12)', 'rgba(254, 240, 138, 0.2)', '#fcd34d']
              : record.entity.nodeType === 'concept'
                ? ['rgba(196, 181, 253, 0.32)', 'rgba(109, 40, 217, 0.12)', 'rgba(221, 214, 254, 0.18)', '#d8b4fe']
                : record.entity.nodeType === 'sequence_unit'
                  ? ['rgba(244, 114, 182, 0.3)', 'rgba(190, 24, 93, 0.12)', 'rgba(251, 207, 232, 0.18)', '#f9a8d4']
                  : ['rgba(251, 146, 60, 0.3)', 'rgba(194, 65, 12, 0.12)', 'rgba(254, 215, 170, 0.18)', '#fdba74'])
      : record.kind === 'operator'
        ? ['rgba(148, 163, 184, 0.28)', 'rgba(51, 65, 85, 0.12)', 'rgba(226, 232, 240, 0.16)', '#e2e8f0']
        : ['rgba(226, 232, 240, 0.24)', 'rgba(71, 85, 105, 0.12)', 'rgba(226, 232, 240, 0.16)', '#f8fafc']

  const sharedStyle = {
    opacity: dimmed ? 0.2 : 1,
    ['--world-node-ring' as string]: palette[0],
    ['--world-node-glow' as string]: palette[1],
    ['--world-node-highlight' as string]: palette[2],
    ['--world-node-accent' as string]: palette[3],
  }

  if (visualMode !== 'card') {
    return {
      ...sharedStyle,
      borderColor: 'transparent',
      background: 'transparent',
      boxShadow: 'none',
    }
  }

  return {
    ...sharedStyle,
    borderColor: selected ? 'rgba(255,255,255,0.36)' : palette[0],
    background: `linear-gradient(180deg, rgba(9, 13, 20, 0.985), ${palette[1]})`,
    boxShadow: selected
      ? `0 0 0 1px rgba(255,255,255,0.08), 0 24px 54px rgba(5, 8, 14, 0.52), 0 0 24px ${palette[1]}, inset 0 1px 0 ${palette[2]}`
      : `0 18px 40px rgba(5, 8, 14, 0.34), inset 0 1px 0 ${palette[2]}`,
  }
}

function addUniqueKey(target: Set<string>, value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    target.add(value)
  }
}

function hasMeaningfulKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseTime(value: string | null | undefined) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function wasCreatedNearEvent(record: { createdAt?: string; updatedAt?: string }, eventCreatedAt: string) {
  const createdAt = parseTime(record.createdAt)
  const eventAt = parseTime(eventCreatedAt)
  if (createdAt === null || eventAt === null) return false
  return Math.abs(eventAt - createdAt) <= 15_000
}

function mergeTurnLensChangeKind(
  target: Map<string, WorldPromptTurnLensChangeKind>,
  key: unknown,
  changeKind: WorldPromptTurnLensChangeKind,
) {
  if (!hasMeaningfulKey(key)) return
  const current = target.get(key)
  const rank: Record<WorldPromptTurnLensChangeKind, number> = {
    touched: 0,
    modified: 1,
    replaced: 2,
    added: 3,
  }
  if (!current || rank[changeKind] > rank[current]) {
    target.set(key, changeKind)
  }
}

function entityChangeKindForAppliedOp(
  eventCreatedAt: string,
  op: PromptToWorldOp | undefined,
  entity: WorldEntity,
): WorldPromptTurnLensChangeKind {
  if (!op) return 'added'
  if (op.op === 'replace_entity') return entity.key === op.payload.targetEntityKey ? 'modified' : 'replaced'
  if (op.op === 'update_entity') return entity.key === op.payload.targetEntityKey ? 'modified' : 'added'
  if (op.op === 'update_entity_canon') return entity.key === op.payload.targetEntityKey ? 'modified' : 'added'
  if (op.op === 'upsert_entity' && op.payload.targetEntityKey === entity.key && !op.metadata?.projectedCreate) {
    return wasCreatedNearEvent(entity, eventCreatedAt) ? 'added' : 'modified'
  }
  return 'added'
}

function relationshipChangeKindForAppliedOp(
  eventCreatedAt: string,
  op: PromptToWorldOp | undefined,
  relationship: WorldRelationship,
): WorldPromptTurnLensChangeKind {
  if (!op) return 'added'
  if (op.op === 'update_relationship') return relationship.key === op.payload.targetRelationshipKey ? 'modified' : 'added'
  if (op.op === 'upsert_relationship' && op.payload.targetRelationshipKey === relationship.key) {
    return wasCreatedNearEvent(relationship, eventCreatedAt) ? 'added' : 'modified'
  }
  return 'added'
}

function toReadonlySet(values: readonly string[] | ReadonlySet<string> | null | undefined) {
  if (!values) return new Set<string>()
  return values instanceof Set ? values : new Set(values)
}

function addAppliedNodeKey(
  nodeKind: unknown,
  nodeKey: unknown,
  entityKeys: Set<string>,
  operatorKeys: Set<string>,
  resultKeys: Set<string>,
) {
  if (nodeKind === 'entity') {
    addUniqueKey(entityKeys, nodeKey)
  } else if (nodeKind === 'operator') {
    addUniqueKey(operatorKeys, nodeKey)
  } else if (nodeKind === 'result') {
    addUniqueKey(resultKeys, nodeKey)
  }
}

function compactTurnLensLabel(input: {
  entityCount: number
  relationshipCount: number
  derivedCount: number
}) {
  const parts = [
    input.entityCount > 0 ? `${input.entityCount} node${input.entityCount === 1 ? '' : 's'}` : null,
    input.relationshipCount > 0 ? `${input.relationshipCount} link${input.relationshipCount === 1 ? '' : 's'}` : null,
    input.derivedCount > 0 ? `${input.derivedCount} derived` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : 'No graph changes'
}

export function buildWorldPromptTurnLenses(input: {
  events: WorldPromptEvent[]
  turns?: WorldPromptTurn[]
}) {
  const promptByTurnId = new Map((input.turns ?? []).map((turn) => [turn.id, turn.prompt] as const))
  const lensDrafts = new Map<string, {
    turnId: string
    createdAt: string
    prompt: string
    entityKeys: Set<string>
    relationshipKeys: Set<string>
    operatorKeys: Set<string>
    resultKeys: Set<string>
    entityChangeKinds: Map<string, WorldPromptTurnLensChangeKind>
    relationshipChangeKinds: Map<string, WorldPromptTurnLensChangeKind>
  }>()

  for (const event of input.events) {
    if (event.eventType !== 'op_applied') continue
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    const applied = parsed.data.applied
    if (!applied) continue

    const draft = lensDrafts.get(event.turnId) ?? {
      turnId: event.turnId,
      createdAt: event.createdAt,
      prompt: promptByTurnId.get(event.turnId) ?? '',
      entityKeys: new Set<string>(),
      relationshipKeys: new Set<string>(),
      operatorKeys: new Set<string>(),
      resultKeys: new Set<string>(),
      entityChangeKinds: new Map<string, WorldPromptTurnLensChangeKind>(),
      relationshipChangeKinds: new Map<string, WorldPromptTurnLensChangeKind>(),
    }
    if (new Date(event.createdAt).getTime() < new Date(draft.createdAt).getTime()) {
      draft.createdAt = event.createdAt
    }

    const op = parsed.data.op
    for (const entity of applied.worldEntities ?? []) {
      addUniqueKey(draft.entityKeys, entity.key)
      mergeTurnLensChangeKind(draft.entityChangeKinds, entity.key, entityChangeKindForAppliedOp(event.createdAt, op, entity))
    }
    for (const relationship of applied.worldRelationships ?? []) {
      addUniqueKey(draft.relationshipKeys, relationship.key)
      addUniqueKey(draft.entityKeys, relationship.sourceEntityKey)
      addUniqueKey(draft.entityKeys, relationship.targetEntityKey)
      mergeTurnLensChangeKind(draft.relationshipChangeKinds, relationship.key, relationshipChangeKindForAppliedOp(event.createdAt, op, relationship))
      mergeTurnLensChangeKind(draft.entityChangeKinds, relationship.sourceEntityKey, 'touched')
      mergeTurnLensChangeKind(draft.entityChangeKinds, relationship.targetEntityKey, 'touched')
    }
    for (const operator of applied.worldOperators ?? []) {
      addUniqueKey(draft.operatorKeys, operator.key)
      for (const inputEntityKey of operator.inputEntityKeys ?? []) {
        addUniqueKey(draft.entityKeys, inputEntityKey)
      }
    }
    for (const result of applied.worldResults ?? []) {
      addUniqueKey(draft.resultKeys, result.key)
      addUniqueKey(draft.operatorKeys, result.sourceOperatorKey)
    }
    for (const connection of applied.worldGraphConnections ?? []) {
      addAppliedNodeKey(connection.sourceNodeKind, connection.sourceNodeKey, draft.entityKeys, draft.operatorKeys, draft.resultKeys)
      addAppliedNodeKey(connection.targetNodeKind, connection.targetNodeKey, draft.entityKeys, draft.operatorKeys, draft.resultKeys)
    }

    lensDrafts.set(event.turnId, draft)
  }

  return new Map([...lensDrafts.entries()].map(([turnId, draft]) => {
    const entityKeys = [...draft.entityKeys]
    const relationshipKeys = [...draft.relationshipKeys]
    const operatorKeys = [...draft.operatorKeys]
    const resultKeys = [...draft.resultKeys]
    const nodeKeys = [...new Set([...entityKeys, ...operatorKeys, ...resultKeys])]
    const derivedCount = operatorKeys.length + resultKeys.length
    const changeCount = entityKeys.length + relationshipKeys.length + derivedCount
    const lens: WorldPromptTurnLens = {
      turnId,
      createdAt: draft.createdAt,
      label: compactTurnLensLabel({
        entityCount: entityKeys.length,
        relationshipCount: relationshipKeys.length,
        derivedCount: operatorKeys.length + resultKeys.length,
      }),
      prompt: draft.prompt,
      entityKeys,
      relationshipKeys,
      operatorKeys,
      resultKeys,
      nodeKeys,
      rootEntityKey: entityKeys[0] ?? null,
      changeCount,
      entityChangeKinds: Object.fromEntries(draft.entityChangeKinds),
      relationshipChangeKinds: Object.fromEntries(draft.relationshipChangeKinds),
      counts: {
        entities: entityKeys.length,
        relationships: relationshipKeys.length,
        derived: derivedCount,
        total: changeCount,
      },
    }
    return [turnId, lens] as const
  }).filter(([, lens]) => lens.changeCount > 0))
}

export function buildWorldPromptTurnLens(input: {
  turnId: string
  events: WorldPromptEvent[]
  turns?: WorldPromptTurn[]
}) {
  return buildWorldPromptTurnLenses(input).get(input.turnId) ?? null
}

export function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity': {
      const displayName =
        typeof op.metadata?.displayName === 'string' && op.metadata.displayName.trim()
          ? op.metadata.displayName.trim()
          : op.payload.entity.name
      return `Add or extend ${displayName}`
    }
    case 'update_entity':
      return `Update ${op.payload.targetEntityKey}`
    case 'update_entity_canon':
      return op.payload.auditSummary.title ?? `Update canon for ${op.payload.targetEntityKey}`
    case 'replace_entity':
      return `Replace ${op.payload.targetEntityKey}`
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
    case 'update_world_wiki_metadata':
      return op.payload.target === 'view' ? 'Update wiki page metadata' : 'Update world wiki overview'
    case 'assistant_note':
      return op.payload.message
  }
}

export function describePlannerStatus(status: NonNullable<ReturnType<typeof worldPromptEventPayloadSchema.safeParse>['data']>['plannerStatus']) {
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

export function describePlannerProgressPhase(phase: WorldPromptPlannerProgress['phase']) {
  switch (phase) {
    case 'reading_context':
      return 'Reading context'
    case 'analyzing_graph':
      return 'Analyzing graph'
    case 'planning_manifest':
      return 'Planning build'
    case 'planning_entities':
      return 'Planning entities'
    case 'generating_entity':
      return 'Creating entities'
    case 'generating_sequence_unit':
      return 'Creating sequence'
    case 'planning_relationships':
      return 'Planning relationships'
    case 'mapping_relationships':
      return 'Mapping relationships'
    case 'assembling_first_wave':
      return 'Assembling first wave'
    case 'finalizing_world':
      return 'Finalizing world'
    case 'finalizing_plan':
      return 'Finalizing plan'
    case 'applying_changes':
      return 'Applying changes'
    case 'prompt_update':
      return 'Live update'
    default:
      return 'Working'
  }
}

function describeWorkItemEventLabel(
  workItem: Partial<WorldPromptIncrementalWorkItem> | undefined,
  eventType: WorldPromptEvent['eventType'],
) {
  const label = typeof workItem?.label === 'string' && workItem.label.trim()
    ? workItem.label.trim()
    : 'Build step'
  if (eventType === 'work_item_failed') return `${label} skipped`
  if (eventType === 'work_item_completed') return `${label} complete`
  return label
}

function promptBuildStepSortKey(step: WorldPromptBuildStep) {
  const parsed = Date.parse(step.createdAt)
  return Number.isFinite(parsed) ? parsed : 0
}

function pushOrReplaceBuildStep(steps: WorldPromptBuildStep[], nextStep: WorldPromptBuildStep) {
  const existingIndex = steps.findIndex((step) => step.id === nextStep.id)
  if (existingIndex >= 0) {
    steps[existingIndex] = {
      ...steps[existingIndex],
      ...nextStep,
      detail: nextStep.detail || steps[existingIndex]?.detail || '',
    }
    return
  }

  const previous = steps.at(-1)
  if (
    previous
    && previous.title === nextStep.title
    && previous.detail === nextStep.detail
    && previous.status === nextStep.status
  ) {
    return
  }
  steps.push(nextStep)
}

export function buildWorldPromptBuildSteps(input: {
  events: WorldPromptEvent[]
  turnId?: string | null
}) {
  const scopedEvents = input.turnId
    ? input.events.filter((event) => event.turnId === input.turnId)
    : input.events
  const steps: WorldPromptBuildStep[] = []

  for (const event of [...scopedEvents].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.sequence - right.sequence
  })) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    const payload = parsed.data

    if (event.eventType === 'work_item_started' || event.eventType === 'work_item_completed' || event.eventType === 'work_item_failed') {
      const workItemId = typeof payload.workItem?.id === 'string' && payload.workItem.id.trim()
        ? payload.workItem.id.trim()
        : event.id
      const detail = stripInternalPlannerDiagnostics(
        payload.note
        ?? payload.plannerProgress?.message
        ?? (typeof payload.workItem?.objective === 'string' ? payload.workItem.objective : ''),
      )
      pushOrReplaceBuildStep(steps, {
        id: `work:${event.turnId}:${workItemId}`,
        createdAt: event.createdAt,
        title: describeWorkItemEventLabel(payload.workItem, event.eventType),
        detail,
        status: event.eventType === 'work_item_failed'
          ? 'failed'
          : event.eventType === 'work_item_completed'
            ? 'done'
            : 'active',
        kind: payload.workItem?.kind ?? 'planner_phase',
        phase: payload.plannerProgress?.phase ?? null,
        index: typeof payload.workItemIndex === 'number' ? payload.workItemIndex : payload.plannerProgress?.index ?? null,
        total: typeof payload.workItemTotal === 'number' ? payload.workItemTotal : payload.plannerProgress?.total ?? null,
      })
      continue
    }

    if (event.eventType !== 'planner_status' || !payload.plannerProgress) continue
    const progress = payload.plannerProgress
    const detail = stripInternalPlannerDiagnostics(progress.message)
    const workItemId = progress.workItemId?.trim()
    pushOrReplaceBuildStep(steps, {
      id: workItemId
        ? `work:${event.turnId}:${workItemId}`
        : `phase:${event.turnId}:${progress.phase}:${progress.sequence}:${normalizePromptTranscriptText(progress.message)}`,
      createdAt: event.createdAt,
      title: describePlannerProgressPhase(progress.phase),
      detail,
      status: progress.done ? 'done' : 'active',
      kind: 'planner_phase',
      phase: progress.phase,
      index: progress.index ?? null,
      total: progress.total ?? null,
    })
  }

  return steps
    .map((step, index) => {
      const laterSteps = steps.slice(index + 1)
      if (step.status === 'active' && laterSteps.some((nextStep) => nextStep.status === 'active' || nextStep.status === 'done' || nextStep.status === 'failed')) {
        return { ...step, status: 'done' as const }
      }
      return step
    })
    .sort((left, right) => promptBuildStepSortKey(left) - promptBuildStepSortKey(right) || left.id.localeCompare(right.id))
}

export function promptSuggestionImpactLabel(suggestion: WorldPromptSuggestion) {
  const parts = [
    suggestion.estimatedNodeCount > 0 ? `+${suggestion.estimatedNodeCount} nodes` : null,
    suggestion.estimatedEdgeCount > 0 ? `+${suggestion.estimatedEdgeCount} links` : null,
    suggestion.willQueueImages ? 'images' : null,
    suggestion.willQueueCinematics ? 'cinematics' : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function stripInternalPlannerDiagnostics(text: string) {
  if (!text.trim()) return ''
  return text
    .replace(/^Assembling the first wave of safe graph changes\.$/i, 'Preparing the graph change list.')
    .replace(/^Hosted prompt planning was unavailable\.\s*/i, '')
    .replace(/\s*Immediate JSON[^\n]*?(?:\.\s*|$)/i, '')
    .replace(/\s*oneOf is not permitted in operations\.?\s*/i, '')
    .replace(/\s*World prompt planner returned JSON that did not match the expected schema\.[\s\S]*$/i, '')
    .replace(/\s*Planner (?:output|response) validation failed\.[\s\S]*$/i, '')
    .replace(/\s*Cinematic planner response validation failed\.[\s\S]*$/i, '')
    .trim()
}

function normalizePromptTranscriptText(text: string) {
  return stripInternalPlannerDiagnostics(text)
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function readPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readUsageTokens(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const total = readPositiveNumber(candidate.totalTokens)
    ?? readPositiveNumber(candidate.total_tokens)
    ?? readPositiveNumber(candidate.tokens)
  if (total) return total
  const inputTokens = readPositiveNumber(candidate.inputTokens)
    ?? readPositiveNumber(candidate.input_tokens)
    ?? readPositiveNumber(candidate.promptTokens)
    ?? readPositiveNumber(candidate.prompt_tokens)
    ?? 0
  const outputTokens = readPositiveNumber(candidate.outputTokens)
    ?? readPositiveNumber(candidate.output_tokens)
    ?? readPositiveNumber(candidate.completionTokens)
    ?? readPositiveNumber(candidate.completion_tokens)
    ?? 0
  return inputTokens + outputTokens > 0 ? inputTokens + outputTokens : null
}

function readUsageBreakdownRow(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const inputTokens = readPositiveNumber(candidate.inputTokens)
    ?? readPositiveNumber(candidate.input_tokens)
    ?? readPositiveNumber(candidate.promptTokens)
    ?? readPositiveNumber(candidate.prompt_tokens)
    ?? 0
  const outputTokens = readPositiveNumber(candidate.outputTokens)
    ?? readPositiveNumber(candidate.output_tokens)
    ?? readPositiveNumber(candidate.completionTokens)
    ?? readPositiveNumber(candidate.completion_tokens)
    ?? 0
  const totalTokens = readPositiveNumber(candidate.totalTokens)
    ?? readPositiveNumber(candidate.total_tokens)
    ?? inputTokens + outputTokens
  if (!totalTokens) return null
  return {
    label,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: readPositiveNumber(candidate.cachedInputTokens) ?? readPositiveNumber(candidate.cached_input_tokens) ?? 0,
    reasoningTokens: readPositiveNumber(candidate.reasoningTokens) ?? readPositiveNumber(candidate.reasoning_tokens) ?? 0,
  }
}

function readTurnUsageRows(turn: WorldPromptTurn) {
  const usage = turn.metadata.tokenUsage && typeof turn.metadata.tokenUsage === 'object' && !Array.isArray(turn.metadata.tokenUsage)
    ? turn.metadata.tokenUsage as Record<string, unknown>
    : null
  const calls = Array.isArray(usage?.calls) ? usage.calls : []
  return calls
    .map((call, index) => readUsageBreakdownRow(call, `Call ${index + 1}`))
    .filter((row): row is NonNullable<ReturnType<typeof readUsageBreakdownRow>> => Boolean(row))
}

function readTurnUsageTokens(metadata: Record<string, unknown>) {
  const candidates = [
    metadata.tokenUsage,
    metadata.usage,
    metadata.openAiUsage,
    metadata.modelUsage,
    metadata.llmUsage,
  ].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)))

  for (const candidate of candidates) {
    const tokens = readUsageTokens(candidate)
    if (tokens) return tokens
  }

  return null
}

function readEventUsageTokens(event: WorldPromptEvent) {
  const payloadUsage = event.payload && typeof event.payload === 'object'
    ? readUsageTokens((event.payload as Record<string, unknown>).tokenUsage)
    : null
  if (payloadUsage) return payloadUsage
  return readUsageTokens(event.metadata?.tokenUsage)
}

function readExactSessionUsageTokens(input: {
  turns: WorldPromptTurn[]
  events?: WorldPromptEvent[]
  generationJobs?: WorldPromptGenerationJob[]
  generationJobSteps?: WorldPromptGenerationJobStep[]
}) {
  const usageByTurnId = new Map<string, number>()
  for (const turn of input.turns) {
    const tokens = readTurnUsageTokens(turn.metadata)
    if (tokens) usageByTurnId.set(turn.id, Math.max(usageByTurnId.get(turn.id) ?? 0, tokens))
  }
  for (const event of input.events ?? []) {
    const tokens = readEventUsageTokens(event)
    if (!tokens) continue
    usageByTurnId.set(event.turnId, Math.max(usageByTurnId.get(event.turnId) ?? 0, tokens))
  }
  const stepUsageByTurnId = new Map<string, number>()
  for (const step of input.generationJobSteps ?? []) {
    const tokens = readUsageTokens(step.tokenUsage)
    if (!tokens) continue
    stepUsageByTurnId.set(step.turnId, (stepUsageByTurnId.get(step.turnId) ?? 0) + tokens)
  }
  for (const [turnId, tokens] of stepUsageByTurnId) {
    usageByTurnId.set(turnId, Math.max(usageByTurnId.get(turnId) ?? 0, tokens))
  }
  const turnIdsWithStepUsage = new Set(stepUsageByTurnId.keys())
  for (const job of input.generationJobs ?? []) {
    if (turnIdsWithStepUsage.has(job.turnId)) continue
    const tokens = readUsageTokens(job.tokenUsage)
    if (!tokens) continue
    usageByTurnId.set(job.turnId, Math.max(usageByTurnId.get(job.turnId) ?? 0, tokens))
  }
  return Array.from(usageByTurnId.values()).reduce((total, tokens) => total + tokens, 0)
}

function readSourceContextText(metadata: Record<string, unknown>) {
  const sourceContext = metadata.sourceContext && typeof metadata.sourceContext === 'object'
    ? metadata.sourceContext as Record<string, unknown>
    : null
  const initialSeedContext = metadata.initialSeedContext && typeof metadata.initialSeedContext === 'object'
    ? metadata.initialSeedContext as Record<string, unknown>
    : null
  const initialSourceContext = initialSeedContext?.sourceContext && typeof initialSeedContext.sourceContext === 'object'
    ? initialSeedContext.sourceContext as Record<string, unknown>
    : null
  const sourceText = typeof sourceContext?.extractedText === 'string' ? sourceContext.extractedText : ''
  const initialSourceText = typeof initialSourceContext?.extractedText === 'string' ? initialSourceContext.extractedText : ''
  return [sourceText, initialSourceText].filter(Boolean).join('\n')
}

function resolveModelTokenLimit(model: string | null | undefined) {
  const normalized = (model ?? '').toLowerCase()
  if (normalized.includes('gpt-5.4-mini') || normalized.includes('gpt-5.4-nano')) return 400_000
  if (normalized.includes('gpt-5.4')) return 1_000_000
  if (normalized.includes('gpt-5.2') || normalized.includes('gpt-5.1')) return 400_000
  if (normalized.includes('gpt-4.1')) return 1_000_000
  if (normalized.includes('o1') || normalized.includes('o3')) return 200_000
  if (normalized.includes('gpt-5')) return 400_000
  if (normalized.includes('gpt-4o')) return 128_000
  if (normalized.includes('gpt-4')) return 128_000
  return 400_000
}

function formatCompactTokenCount(tokens: number) {
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}m`
  }
  if (tokens >= 1_000) {
    const value = tokens / 1_000
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`
  }
  return String(tokens)
}

export function buildWorldPromptSessionTokenMeter(input: {
  turns: WorldPromptTurn[]
  messages: WorldPromptMessage[]
  events?: WorldPromptEvent[]
  generationJobs?: WorldPromptGenerationJob[]
  generationJobSteps?: WorldPromptGenerationJobStep[]
  model?: string | null
}): WorldPromptSessionTokenMeter {
  const tokenLimit = resolveModelTokenLimit(input.model ?? input.turns.at(-1)?.model)
  const exactTokens = readExactSessionUsageTokens({
    turns: input.turns,
    events: input.events,
    generationJobs: input.generationJobs,
    generationJobSteps: input.generationJobSteps,
  })
  const estimated = exactTokens <= 0
  const usedTokens = exactTokens > 0
    ? Math.ceil(exactTokens)
    : Math.ceil([
      ...input.messages.map((message) => message.content),
      ...input.turns.flatMap((turn) => [
        turn.prompt,
        turn.assistantSummary,
        typeof turn.metadata?.answer === 'string' ? turn.metadata.answer : '',
        readSourceContextText(turn.metadata),
      ]),
    ].join('\n').length / 4)
  const boundedUsedTokens = Math.max(0, usedTokens)
  const percentage = tokenLimit > 0 ? Math.min(100, Math.round((boundedUsedTokens / tokenLimit) * 100)) : 0
  const compactUsed = formatCompactTokenCount(boundedUsedTokens)
  const compactLimit = formatCompactTokenCount(tokenLimit)
  const latestTurn = input.turns.at(-1) ?? null
  const currentTurnTokens = latestTurn ? readTurnUsageTokens(latestTurn.metadata) ?? 0 : 0
  const lastStep = [...(input.generationJobSteps ?? [])]
    .sort((left, right) => new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime())
    .at(-1)
  const lastStepTokens = readUsageTokens(lastStep?.tokenUsage) ?? 0
  const rows = latestTurn ? readTurnUsageRows(latestTurn) : []
  return {
    usedTokens: boundedUsedTokens,
    tokenLimit,
    percentage,
    label: `${estimated ? '~' : ''}${compactUsed}/${compactLimit}`,
    title: `${estimated ? 'Approximate visible session text' : 'Recorded provider token usage'}: ${boundedUsedTokens.toLocaleString()} / ${tokenLimit.toLocaleString()} tokens`,
    estimated,
    currentTurnTokens,
    lastStepTokens,
    rows,
  }
}

function buildSuggestionTranscriptSignature(suggestions: WorldPromptSuggestion[]) {
  return suggestions
    .map((suggestion) => [
      normalizePromptTranscriptText(suggestion.label),
      normalizePromptTranscriptText(suggestion.prompt),
      suggestion.kind,
    ].join(':'))
    .sort()
    .join('|')
}

function refinementFieldLabel(field: 'summary' | 'context' | 'notes') {
  switch (field) {
    case 'summary':
      return 'Summary'
    case 'context':
      return 'Context'
    case 'notes':
      return 'Relationship note'
  }
}

function refinementStrategyLabel(strategy: string) {
  switch (strategy) {
    case 'initialized':
      return 'Initialized'
    case 'unchanged':
      return 'Unchanged'
    case 'expanded':
      return 'Expanded'
    case 'preserved_existing':
      return 'Preserved existing'
    case 'merged_distinct':
      return 'Merged detail'
    default:
      return 'Reconciled'
  }
}

function formatRefinementTimestamp(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return `${new Date(parsed).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export function buildWorldRefinementHistoryViewModel(metadata: unknown): WorldInspectorRefinementHistoryItem[] {
  if (!metadata || typeof metadata !== 'object') return []
  const rawHistory = (metadata as { refinementHistory?: unknown }).refinementHistory
  if (!Array.isArray(rawHistory)) return []

  return rawHistory
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry, index) => {
      const field = entry.field === 'summary' || entry.field === 'context' || entry.field === 'notes'
        ? entry.field
        : null
      const previousText = typeof entry.previousText === 'string' ? entry.previousText.trim() : ''
      const incomingText = typeof entry.incomingText === 'string' ? entry.incomingText.trim() : ''
      const resultText = typeof entry.resultText === 'string' ? entry.resultText.trim() : ''
      if (!field || !incomingText || !resultText) return null
      const at = typeof entry.at === 'string' && entry.at.trim() ? entry.at.trim() : ''
      const strategy = typeof entry.strategy === 'string' && entry.strategy.trim() ? entry.strategy.trim() : 'merged_distinct'
      return {
        id: `${at || 'refinement'}:${field}:${index}`,
        at: at ? formatRefinementTimestamp(at) : 'Unknown time',
        field,
        fieldLabel: refinementFieldLabel(field),
        strategy,
        strategyLabel: refinementStrategyLabel(strategy),
        previousText,
        incomingText,
        resultText,
      } satisfies WorldInspectorRefinementHistoryItem
    })
    .filter((entry): entry is WorldInspectorRefinementHistoryItem => Boolean(entry))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, WORLD_INSPECTOR_REFINEMENT_HISTORY_LIMIT)
}

export function describePlannerFailureCategory(category: WorldPromptPlannerFailure['category']) {
  switch (category) {
    case 'timeout':
      return 'timeout'
    case 'upstream_error':
      return 'upstream API error'
    case 'invalid_json':
      return 'invalid planner JSON'
    case 'schema_validation_failed':
      return 'planner schema mismatch'
    default:
      return 'unknown planner error'
  }
}

function buildTranscriptSuggestionsEntry(event: WorldPromptEvent, suggestions: WorldPromptSuggestion[]) {
  const sanitizedSuggestions = suggestions
    .map((suggestion) => {
      const label = stripInternalPlannerDiagnostics(suggestion.label).replace(/\s+/g, ' ').trim()
      const prompt = stripInternalPlannerDiagnostics(suggestion.prompt).replace(/\s+/g, ' ').trim()
      const summary = stripInternalPlannerDiagnostics(suggestion.summary).replace(/\s+/g, ' ').trim()
      const resolvedLabel = label || summary
      if (!resolvedLabel || !prompt) return null
      return {
        ...suggestion,
        label: resolvedLabel,
        prompt,
        summary,
      }
    })
    .filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion))
  if (sanitizedSuggestions.length === 0) {
    return null
  }
  const hasClarification = sanitizedSuggestions.some((suggestion) => suggestion.kind === 'repair_prompt')
  return {
    id: `suggestions:${event.id}`,
    createdAt: event.createdAt,
    kind: hasClarification ? 'clarification_question' : 'suggestion_set',
    suggestions: sanitizedSuggestions,
    label: hasClarification ? 'Clarification required' : 'Next move',
  } satisfies WorldPromptTranscriptEntry
}

export function buildWorldPromptTranscriptEntries(input: {
  events: WorldPromptEvent[]
  messages: WorldPromptMessage[]
  entityByKey: Map<string, WorldEntity>
  turns?: WorldPromptTurn[]
}) {
  const sources = [
    ...input.messages.map((message) => ({ source: 'message' as const, createdAt: message.createdAt, id: `message:${message.id}`, message })),
    ...input.events
      .filter((event) => !['turn_started', 'message_created', 'op_needs_approval', 'op_approved', 'op_rejected'].includes(event.eventType))
      .map((event) => ({ source: 'event' as const, createdAt: event.createdAt, id: `event:${event.id}`, event })),
  ].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
  })

  const entries: WorldPromptTranscriptEntry[] = []
  const turnLensByTurnId = buildWorldPromptTurnLenses({ events: input.events, turns: input.turns })
  const emittedSuggestionSignatures = new Set<string>()
  let lastAnswerSignature: string | null = null
  let lastDiagnosticSignature: string | null = null
  let lastPlannerProgressSignature: string | null = null
  const emittedTurnLensIds = new Set<string>()
  const assistantMessageTextByTurnId = new Map<string, Set<string>>()
  for (const message of input.messages) {
    if (message.role !== 'assistant' || !message.turnId) continue
    const normalized = normalizePromptTranscriptText(message.content)
    if (!normalized) continue
    const turnTexts = assistantMessageTextByTurnId.get(message.turnId) ?? new Set<string>()
    turnTexts.add(normalized)
    assistantMessageTextByTurnId.set(message.turnId, turnTexts)
  }
  const hasAssistantMessageForEventText = (event: WorldPromptEvent, text: string) => {
    const normalized = normalizePromptTranscriptText(text)
    const turnTexts = assistantMessageTextByTurnId.get(event.turnId)
    return Boolean(normalized && turnTexts && [...turnTexts].some((messageText) => (
      messageText === normalized || messageText.includes(normalized)
    )))
  }

  for (const source of sources) {
    if (source.source === 'message') {
      if (source.message.role === 'user') {
        const selectedSuggestionLabel = typeof source.message.metadata?.selectedSuggestionLabel === 'string'
          ? source.message.metadata.selectedSuggestionLabel
          : null
        const selectedSuggestionUiKind = source.message.metadata?.selectedSuggestionUiKind === 'clarification'
          ? 'clarification'
          : 'next_move'
        if (selectedSuggestionLabel) {
          entries.push({
            id: `${source.id}:selection`,
            createdAt: source.message.createdAt,
            kind: selectedSuggestionUiKind === 'clarification' ? 'clarification_answer' : 'system_status',
            label: selectedSuggestionUiKind === 'clarification' ? 'Answered clarification' : 'Used suggestion',
            detail: selectedSuggestionLabel,
          })
          continue
        }
      }

      entries.push({
        id: source.id,
        createdAt: source.message.createdAt,
        kind: source.message.role === 'user' ? 'user_message' : 'assistant_message',
        content: source.message.role === 'assistant'
          ? stripInternalPlannerDiagnostics(source.message.content)
          : source.message.content,
        pending: false,
      })
      continue
    }

    const parsed = worldPromptEventPayloadSchema.safeParse(source.event.payload)
    if (!parsed.success) {
      entries.push({
        id: source.id,
        createdAt: source.event.createdAt,
        kind: 'system_status',
        label: source.event.eventType,
      })
      continue
    }

    const payload = parsed.data
    const answerSignature = payload.answer ? `${source.event.turnId}:${normalizePromptTranscriptText(payload.answer)}` : null
    if (payload.answer && answerSignature !== lastAnswerSignature && !hasAssistantMessageForEventText(source.event, payload.answer)) {
      entries.push({
        id: `${source.id}:answer`,
        createdAt: source.event.createdAt,
        kind: 'advisory_answer',
        label: payload.classification === 'graph_diagnosis' ? 'Diagnosis' : 'Answer',
        detail: stripInternalPlannerDiagnostics(payload.answer),
      })
      lastAnswerSignature = answerSignature
    }
    const diagnosticSignature = (payload.diagnosticFindings ?? []).map((finding) => `${finding.id}:${finding.summary}`).join('|')
    if (diagnosticSignature && diagnosticSignature !== lastDiagnosticSignature) {
      for (const finding of payload.diagnosticFindings ?? []) {
        entries.push({
          id: `${source.id}:finding:${finding.id}`,
          createdAt: source.event.createdAt,
          kind: 'diagnostic_finding',
          label: finding.title,
          detail: stripInternalPlannerDiagnostics(finding.summary),
          severity: finding.severity,
        })
      }
      lastDiagnosticSignature = diagnosticSignature
    }
    switch (source.event.eventType) {
      case 'entity_resolution':
      case 'node_evolution_decided': {
        const nodeEvolution = payload.nodeEvolution && typeof payload.nodeEvolution === 'object'
          ? payload.nodeEvolution as Record<string, unknown>
          : {}
        const decisions = Array.isArray(nodeEvolution.decisions) ? nodeEvolution.decisions : []
        const detail = typeof nodeEvolution.summary === 'string' && nodeEvolution.summary.trim()
          ? nodeEvolution.summary
          : `${decisions.length} node evolution decision${decisions.length === 1 ? '' : 's'}`
        entries.push({
          id: `${source.id}:node-evolution`,
          createdAt: source.event.createdAt,
          kind: 'node_evolution',
          label: source.event.eventType === 'entity_resolution' ? 'Resolved node intent' : 'Node evolution decided',
          detail,
          nodeEvolution,
          transaction: payload.transaction && typeof payload.transaction === 'object' ? payload.transaction as Record<string, unknown> : undefined,
          tone: source.event.eventType === 'entity_resolution' ? 'working' : 'success',
        })
        break
      }
      case 'intent_classified':
      case 'context_retrieved':
      case 'transaction_completed': {
        const transaction = payload.transaction && typeof payload.transaction === 'object'
          ? payload.transaction as Record<string, unknown>
          : {}
        const intent = typeof payload.canonIntent?.intent === 'string'
          ? payload.canonIntent.intent.replace(/_/g, ' ')
          : typeof transaction.intent === 'string'
            ? transaction.intent.replace(/_/g, ' ')
            : 'canon update'
        const status = typeof transaction.status === 'string' ? transaction.status.replace(/_/g, ' ') : ''
        entries.push({
          id: `${source.id}:transaction`,
          createdAt: source.event.createdAt,
          kind: 'canon_transaction',
          label: source.event.eventType === 'transaction_completed'
            ? 'Canon change set complete'
            : source.event.eventType === 'context_retrieved'
              ? 'Canon context loaded'
              : 'Canon intent classified',
          detail: typeof transaction.summary === 'string' && transaction.summary.trim()
            ? transaction.summary
            : `${intent}${status ? `: ${status}` : ''}`,
          transaction,
          tone: source.event.eventType === 'transaction_completed' ? 'success' : 'working',
        })
        break
      }
      case 'op_planned':
      case 'op_validated':
      case 'op_repaired':
      case 'op_skipped': {
        const label = source.event.eventType === 'op_skipped'
          ? 'Operation skipped'
          : source.event.eventType === 'op_repaired'
            ? 'Operation repaired'
            : source.event.eventType === 'op_validated'
              ? 'Operation validated'
              : 'Operation planned'
        const issue = Array.isArray(payload.validation?.issues) ? payload.validation.issues[0] : null
        const detail = issue && typeof issue === 'object' && 'message' in issue && typeof issue.message === 'string'
          ? issue.message
          : payload.op ? payload.op.op.replace(/_/g, ' ') : ''
        entries.push({
          id: `${source.id}:op-status`,
          createdAt: source.event.createdAt,
          kind: 'op_status',
          label,
          detail,
          validation: payload.validation && typeof payload.validation === 'object' ? payload.validation as Record<string, unknown> : undefined,
          op: payload.op,
          tone: source.event.eventType === 'op_skipped'
            ? 'warning'
            : source.event.eventType === 'op_validated'
              ? 'success'
              : 'working',
        })
        break
      }
      case 'planner_status':
        if (payload.plannerProgress) {
          const plannerProgressSignature = [
            source.event.turnId,
            payload.plannerProgress.phase,
            payload.plannerProgress.sequence,
            payload.plannerProgress.message,
            payload.plannerProgress.done ? 'done' : 'active',
            (payload.plannerOutline ?? []).join('|'),
          ].join(':')
          if (plannerProgressSignature !== lastPlannerProgressSignature) {
            entries.push({
              id: `${source.id}:planner-progress`,
              createdAt: source.event.createdAt,
              kind: 'planner_progress',
              label: describePlannerProgressPhase(payload.plannerProgress.phase),
              detail: payload.plannerProgress.message ? stripInternalPlannerDiagnostics(payload.plannerProgress.message) : undefined,
              phase: payload.plannerProgress.phase,
              outline: payload.plannerOutline ?? [],
              done: payload.plannerProgress.done,
            })
            lastPlannerProgressSignature = plannerProgressSignature
          }
        }
        if (payload.plannerStatus && !payload.plannerProgress) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'system_status',
            label: describePlannerStatus(payload.plannerStatus),
            detail: payload.scope ? `${payload.scope.mode} scope` : '',
          })
        }
        break
      case 'work_item_started':
      case 'work_item_completed':
      case 'work_item_failed': {
        const failed = source.event.eventType === 'work_item_failed'
        const completed = source.event.eventType === 'work_item_completed'
        const baseLabel = describeWorkItemEventLabel(payload.workItem, source.event.eventType)
        const label = failed
          ? baseLabel
          : completed
            ? baseLabel
            : `Building ${baseLabel}`
        const detail = payload.note
          ?? payload.plannerProgress?.message
          ?? (typeof payload.workItem?.objective === 'string' ? payload.workItem.objective : '')
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'planner_progress',
          label,
          detail: stripInternalPlannerDiagnostics(detail),
          phase: payload.plannerProgress?.phase ?? 'planning_manifest',
          outline: [],
          done: completed || failed || payload.plannerProgress?.done,
        })
        break
      }
      case 'assistant_note':
        if (payload.note && !hasAssistantMessageForEventText(source.event, payload.note)) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'assistant_message',
            content: stripInternalPlannerDiagnostics(payload.note),
            pending: true,
          })
        }
        break
      case 'op_applied': {
        const applied = payload.applied
        const turnLens = turnLensByTurnId.get(source.event.turnId) ?? undefined
        if (turnLens && !emittedTurnLensIds.has(turnLens.turnId)) {
          entries.push({
            id: `${source.id}:turn-lens:${turnLens.turnId}`,
            createdAt: source.event.createdAt,
            kind: 'turn_lens',
            label: 'View turn changes',
            detail: turnLens.label,
            turnLens,
          })
          emittedTurnLensIds.add(turnLens.turnId)
        }
        const upsertOp = payload.op?.op === 'upsert_entity' ? payload.op : null
        const updateOp = payload.op?.op === 'update_entity' ? payload.op : null
        const updateCanonOp = payload.op?.op === 'update_entity_canon' ? payload.op : null
        const replaceOp = payload.op?.op === 'replace_entity' ? payload.op : null
        const upsertRelationshipOp = payload.op?.op === 'upsert_relationship' ? payload.op : null
        const updateRelationshipOp = payload.op?.op === 'update_relationship' ? payload.op : null
        const sequencePatchOp = payload.op?.op === 'sequence_patch' ? payload.op : null
        const relationshipRewirePatchOp = payload.op?.op === 'relationship_rewire_patch' ? payload.op : null
        const entityMergePatchOp = payload.op?.op === 'entity_merge_patch' ? payload.op : null
        const appliedOp = payload.op
        if (sequencePatchOp) {
          const audit = (payload.sequencePatchAudit && typeof payload.sequencePatchAudit === 'object')
            ? payload.sequencePatchAudit as Record<string, unknown>
            : {}
          const title = typeof audit.title === 'string' && audit.title.trim()
            ? audit.title.trim()
            : sequencePatchOp.payload.auditSummary.title ?? 'Sequence rewired'
          const detail = typeof audit.summary === 'string' && audit.summary.trim()
            ? audit.summary.trim()
            : sequencePatchOp.payload.reason || 'Story flow was structurally updated.'
          entries.push({
            id: `${source.id}:sequence-rewired`,
            createdAt: source.event.createdAt,
            kind: 'sequence_rewired',
            label: title,
            detail,
            sequencePatchAudit: audit,
            turnLens,
          })
          break
        }
        if (relationshipRewirePatchOp) {
          const audit = payload.audit && typeof payload.audit === 'object' ? payload.audit as Record<string, unknown> : {}
          const title = typeof audit.title === 'string' && audit.title.trim()
            ? audit.title.trim()
            : relationshipRewirePatchOp.payload.auditSummary.title ?? 'Relationship rewired'
          const detail = typeof audit.summary === 'string' && audit.summary.trim()
            ? audit.summary.trim()
            : relationshipRewirePatchOp.payload.reason || 'Existing relationship endpoints or verb were updated.'
          entries.push({
            id: `${source.id}:relationship-rewired`,
            createdAt: source.event.createdAt,
            kind: 'relationship_rewired',
            label: title,
            detail,
            audit,
            turnLens,
          })
          break
        }
        if (entityMergePatchOp) {
          const audit = payload.audit && typeof payload.audit === 'object' ? payload.audit as Record<string, unknown> : {}
          const title = typeof audit.title === 'string' && audit.title.trim()
            ? audit.title.trim()
            : entityMergePatchOp.payload.auditSummary.title ?? 'Entities merged'
          const detail = typeof audit.summary === 'string' && audit.summary.trim()
            ? audit.summary.trim()
            : entityMergePatchOp.payload.reason || `${entityMergePatchOp.payload.sourceEntityKey} merged into ${entityMergePatchOp.payload.targetEntityKey}.`
          entries.push({
            id: `${source.id}:entity-merged`,
            createdAt: source.event.createdAt,
            kind: 'entity_merged',
            label: title,
            detail,
            audit,
            turnLens,
          })
          break
        }
        if (updateCanonOp && applied?.worldEntities && applied.worldEntities.length > 0) {
          const updatedEntity = applied.worldEntities.find((entity) => entity.key === updateCanonOp.payload.targetEntityKey) ?? applied.worldEntities[0]
          const audit = payload.audit && typeof payload.audit === 'object' ? payload.audit as Record<string, unknown> : {}
          const addedFacts = Array.isArray(audit.addedFacts) ? audit.addedFacts.length : updateCanonOp.payload.factAdditions.length
          const currentStateChanged = audit.currentStateChanged === true
          const detailParts = [
            updateCanonOp.payload.rationale || null,
            addedFacts > 0 ? `${addedFacts} canon fact${addedFacts === 1 ? '' : 's'} added` : null,
            currentStateChanged ? 'current state changed' : null,
          ].filter(Boolean)
          entries.push({
            id: `${source.id}:entity-canon:${updatedEntity.key}`,
            createdAt: source.event.createdAt,
            kind: 'entity_canon_updated',
            label: updateCanonOp.payload.auditSummary.title ?? `Updated ${updatedEntity.name}`,
            detail: updateCanonOp.payload.auditSummary.summary || detailParts.join(' / '),
            entityKey: updatedEntity.key,
            entityNodeType: updatedEntity.nodeType,
            audit,
            turnLens,
          })
          break
        }
        if (replaceOp && applied?.worldEntities && applied.worldEntities.length > 0) {
          const replacementEntity = applied.worldEntities.find((entity) => entity.key !== replaceOp.payload.targetEntityKey && entity.status !== 'archived')
            ?? applied.worldEntities.find((entity) => entity.key !== replaceOp.payload.targetEntityKey)
            ?? applied.worldEntities[0]
          if (replacementEntity) {
            const detailParts = [
              replaceOp.payload.reason.trim() || null,
              `Now treated as ${labelForWorldEntity(replacementEntity.nodeType)}`,
            ].filter(Boolean)
            entries.push({
              id: `${source.id}:replacement:${replacementEntity.key}`,
              createdAt: source.event.createdAt,
              kind: 'entity_replaced',
              label: `Replaced ${replaceOp.payload.targetEntityKey} with ${replacementEntity.name}`,
              detail: detailParts.join(' · '),
              entityKey: replacementEntity.key,
              entityNodeType: replacementEntity.nodeType,
              turnLens,
            })
          }
        }
        for (const entity of applied?.worldEntities ?? []) {
          if (replaceOp && entity.key === replaceOp.payload.targetEntityKey) {
            continue
          }
          if (
            upsertOp
            && !upsertOp.metadata?.projectedCreate
            && upsertOp.payload.targetEntityKey === entity.key
          ) {
            const changeKind = entityChangeKindForAppliedOp(source.event.createdAt, appliedOp, entity)
            if (changeKind === 'added') {
              entries.push({
                id: `${source.id}:entity-upsert:${entity.key}`,
                createdAt: source.event.createdAt,
                kind: 'entity_created',
                label: `Added ${entity.name}`,
                detail: labelForWorldEntity(entity.nodeType),
                entityKey: entity.key,
                entityNodeType: entity.nodeType,
                turnLens,
              })
            } else {
              entries.push({
                id: `${source.id}:entity-upsert:${entity.key}`,
                createdAt: source.event.createdAt,
                kind: 'entity_updated',
                label: `Updated ${entity.name}`,
                detail: undefined,
                entityKey: entity.key,
                entityNodeType: entity.nodeType,
                turnLens,
              })
            }
            continue
          }
          if (updateOp && entity.key === updateOp.payload.targetEntityKey) {
            entries.push({
              id: `${source.id}:entity-update:${entity.key}`,
              createdAt: source.event.createdAt,
              kind: 'entity_updated',
              label: `Updated ${entity.name}`,
              entityKey: entity.key,
              entityNodeType: entity.nodeType,
              turnLens,
            })
            continue
          }
          entries.push({
            id: `${source.id}:entity:${entity.key}`,
            createdAt: source.event.createdAt,
            kind: 'entity_created',
            label: `Added ${entity.name}`,
            detail: labelForWorldEntity(entity.nodeType),
            entityKey: entity.key,
            entityNodeType: entity.nodeType,
            turnLens,
          })
        }
        for (const relationship of applied?.worldRelationships ?? []) {
          const sourceName = input.entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
          const targetName = input.entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
          if (upsertRelationshipOp && upsertRelationshipOp.payload.targetRelationshipKey === relationship.key) {
            const changeKind = relationshipChangeKindForAppliedOp(source.event.createdAt, appliedOp, relationship)
            entries.push({
              id: `${source.id}:relationship-upsert:${relationship.key}`,
              createdAt: source.event.createdAt,
              kind: changeKind === 'added' ? 'relationship_created' : 'relationship_updated',
              label: changeKind === 'added' ? `Linked ${sourceName} and ${targetName}` : `Updated link between ${sourceName} and ${targetName}`,
              detail: changeKind === 'added' ? relationship.notes.trim() || relationship.verb : undefined,
              relationshipKey: relationship.key,
              sourceLabel: sourceName,
              targetLabel: targetName,
              turnLens,
            })
            continue
          }
          if (updateRelationshipOp && relationship.key === updateRelationshipOp.payload.targetRelationshipKey) {
            entries.push({
              id: `${source.id}:relationship-update:${relationship.key}`,
              createdAt: source.event.createdAt,
              kind: 'relationship_updated',
              label: `Updated link between ${sourceName} and ${targetName}`,
              relationshipKey: relationship.key,
              sourceLabel: sourceName,
              targetLabel: targetName,
              turnLens,
            })
            continue
          }
          entries.push({
            id: `${source.id}:relationship:${relationship.key}`,
            createdAt: source.event.createdAt,
            kind: 'relationship_created',
            label: `Linked ${sourceName} and ${targetName}`,
            detail: relationship.notes.trim() || relationship.verb,
            relationshipKey: relationship.key,
            sourceLabel: sourceName,
            targetLabel: targetName,
            turnLens,
          })
        }
        for (const worldResult of applied?.worldResults ?? []) {
          entries.push({
            id: `${source.id}:result:${worldResult.key}`,
            createdAt: source.event.createdAt,
            kind: 'derived_result_created',
            label: `Created ${worldResult.title}`,
            detail: 'Derived result',
            resultKey: worldResult.key,
            turnLens,
          })
        }
        break
      }
      case 'queue_started': {
        const label = payload.queue?.type === 'cinematic_generation'
          ? 'Started cinematic generation'
          : 'Started image generation'
        const detail = payload.queue?.targetEntityKey
          ? input.entityByKey.get(payload.queue.targetEntityKey)?.name ?? payload.queue.targetEntityKey
          : payload.queue?.graphKey ?? ''
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'queue_started',
          label,
          detail,
        })
        break
      }
      case 'turn_cancel_requested':
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'system_status',
          label: 'Cancelling turn',
          detail: payload.note ?? 'Stopping future ops for this turn.',
        })
        break
      case 'turn_failed':
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'system_status',
          label: 'Turn failed',
          detail: payload.diagnostics?.[0] ?? payload.note ?? 'World prompt turn failed.',
          tone: 'error',
        })
        break
      case 'turn_completed':
        if (payload.note && !hasAssistantMessageForEventText(source.event, payload.note)) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'system_status',
            label: 'Turn completed',
            detail: payload.note,
          })
        }
        break
      default:
        break
    }

    if (payload.suggestions.length > 0) {
      const entry = buildTranscriptSuggestionsEntry(source.event, payload.suggestions)
      const signature = entry ? buildSuggestionTranscriptSignature(entry.suggestions) : ''
      if (entry && signature && !emittedSuggestionSignatures.has(signature)) {
        entries.push(entry)
        emittedSuggestionSignatures.add(signature)
      }
    }
  }

  return entries
}

function worldFeedFilterForTranscriptEntry(entry: WorldPromptTranscriptEntry): WorldFeedFilter | null {
  switch (entry.kind) {
    case 'entity_created':
      return 'additions'
    case 'entity_updated':
    case 'entity_replaced':
    case 'entity_canon_updated':
      return 'changes'
    case 'relationship_created':
    case 'relationship_updated':
    case 'sequence_rewired':
    case 'relationship_rewired':
      return 'relationships'
    case 'entity_merged':
      return 'changes'
    case 'derived_result_created':
    case 'queue_started':
    case 'planner_progress':
      return 'media'
    case 'advisory_answer':
    case 'diagnostic_finding':
    case 'suggestion_set':
    case 'clarification_question':
    case 'clarification_answer':
    case 'continuation_without_suggestion':
      return 'suggestions'
    case 'turn_lens':
    case 'user_message':
    case 'assistant_message':
    case 'system_status':
    case 'node_evolution':
    case 'canon_transaction':
    case 'op_status':
    case 'preview_available':
    case 'approval_required':
      return 'changes'
    default:
      return null
  }
}

function worldFeedKindForTranscriptEntry(entry: WorldPromptTranscriptEntry): WorldFeedEntryKind {
  switch (entry.kind) {
    case 'entity_created':
    case 'entity_updated':
      return entry.kind
    case 'entity_canon_updated':
      return 'entity_canon_updated'
    case 'entity_replaced':
      return 'entity_updated'
    case 'relationship_created':
    case 'relationship_updated':
      return entry.kind
    case 'sequence_rewired':
      return 'sequence_rewired'
    case 'relationship_rewired':
      return 'relationship_rewired'
    case 'entity_merged':
      return 'entity_merged'
    case 'node_evolution':
      return 'node_evolution'
    case 'canon_transaction':
      return 'canon_transaction'
    case 'op_status':
      return 'op_status'
    case 'turn_lens':
      return 'turn_summary'
    case 'user_message':
      return 'prompt'
    case 'assistant_message':
    case 'advisory_answer':
      return 'assistant_note'
    case 'derived_result_created':
      return 'derived_result'
    case 'queue_started':
    case 'planner_progress':
      return 'media_job'
    case 'diagnostic_finding':
      return 'diagnostic'
    case 'suggestion_set':
    case 'clarification_question':
    case 'clarification_answer':
    case 'continuation_without_suggestion':
      return 'suggestion'
    case 'preview_available':
    case 'approval_required':
      return 'wiki_updated'
    case 'system_status':
    default:
      return 'status'
  }
}

function worldFeedBadgeForEntry(entry: WorldPromptTranscriptEntry): string {
  switch (entry.kind) {
    case 'entity_created':
      return 'New Entity'
    case 'entity_updated':
    case 'entity_replaced':
      return 'Entity Update'
    case 'entity_canon_updated':
      return 'Canon Update'
    case 'relationship_created':
      return 'New Link'
    case 'relationship_updated':
      return 'Link Update'
    case 'sequence_rewired':
      return 'Sequence Rewired'
    case 'relationship_rewired':
      return 'Relationship Rewired'
    case 'entity_merged':
      return 'Entities Merged'
    case 'node_evolution':
      return 'Node Decision'
    case 'canon_transaction':
      return 'Change Set'
    case 'op_status':
      return 'Validation'
    case 'turn_lens':
      return 'Turn Summary'
    case 'user_message':
      return 'Prompt'
    case 'assistant_message':
    case 'advisory_answer':
      return 'AI Note'
    case 'derived_result_created':
      return 'Output'
    case 'queue_started':
      return 'Queued'
    case 'planner_progress':
      return entry.done ? 'Progress' : 'Running'
    case 'diagnostic_finding':
      return 'Finding'
    case 'suggestion_set':
    case 'clarification_question':
      return 'Suggestion'
    case 'clarification_answer':
      return 'Choice'
    case 'preview_available':
      return 'Preview'
    case 'approval_required':
      return 'Review'
    default:
      return 'Update'
  }
}

function compactWorldFeedText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength)
  const lastBreak = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf(','), clipped.lastIndexOf(';'))
  const boundary = lastBreak >= Math.floor(maxLength * 0.68) ? lastBreak : maxLength
  return `${normalized.slice(0, boundary).replace(/[\s,;:.-]+$/g, '')}...`
}

function compactLimitForWorldFeedEntry(entry: WorldFeedEntry) {
  switch (entry.kind) {
    case 'assistant_note':
    case 'prompt':
    case 'active_turn':
    case 'diagnostic':
      return 170
    case 'turn_summary':
    case 'relationship_created':
    case 'relationship_updated':
      return 96
    default:
      return 145
  }
}

function withCompactWorldFeedDetail(entry: WorldFeedEntry): WorldFeedEntry {
  return {
    ...entry,
    compactDetail: compactWorldFeedText(entry.detail, compactLimitForWorldFeedEntry(entry)),
  }
}

function readFeedSummaryMetadata(turn: WorldPromptTurn): Record<string, unknown> {
  const value = turn.metadata?.feedSummary
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readFeedSummaryString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? stripInternalPlannerDiagnostics(value).replace(/\s+/g, ' ').trim() : ''
}

function uniqueWorldFeedKeys(keys: Array<string | null | undefined>) {
  return Array.from(new Set(keys.filter((key): key is string => Boolean(key && key.trim()))))
}

function normalizeWorldPromptSuggestionText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function worldPromptSuggestionDedupeKey(suggestion: WorldPromptSuggestion) {
  const prompt = normalizeWorldPromptSuggestionText(suggestion.prompt)
  if (prompt) return `prompt:${prompt}`
  const label = normalizeWorldPromptSuggestionText(suggestion.label)
  const summary = normalizeWorldPromptSuggestionText(suggestion.summary)
  return `copy:${label}:${summary}:${suggestion.kind}:${suggestion.threadKey ?? ''}`
}

export function uniqueWorldPromptSuggestions<T extends WorldPromptSuggestion>(suggestions: readonly T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const suggestion of suggestions) {
    const key = worldPromptSuggestionDedupeKey(suggestion)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(suggestion)
  }
  return result
}

function latestWorldFeedEventTime(events: WorldPromptEvent[], fallback: string) {
  return events.reduce((latest, event) => (
    new Date(event.createdAt).getTime() > new Date(latest).getTime() ? event.createdAt : latest
  ), fallback)
}

function isWorldFeedEntityCreatedDuringTurn(entity: WorldEntity, turn: WorldPromptTurn, eventCreatedAt: string) {
  if (!entity.createdAt || !turn.createdAt || !eventCreatedAt) return false
  const entityCreatedAt = Date.parse(entity.createdAt)
  const turnCreatedAt = Date.parse(turn.createdAt)
  const eventTime = Date.parse(eventCreatedAt)
  if (!Number.isFinite(entityCreatedAt) || !Number.isFinite(turnCreatedAt) || !Number.isFinite(eventTime)) return false
  const lowerBound = turnCreatedAt - 5_000
  const upperBound = eventTime + 60_000
  return entityCreatedAt >= lowerBound && entityCreatedAt <= upperBound
}

function formatWorldFeedFieldLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())
}

function compactWorldFeedChangeValue(value: unknown) {
  if (typeof value === 'string') return compactWorldFeedText(value, 180)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const textValues = value
      .map((entry) => typeof entry === 'string' ? entry : typeof entry === 'number' || typeof entry === 'boolean' ? String(entry) : '')
      .filter(Boolean)
    return textValues.length > 0 ? compactWorldFeedText(textValues.join(', '), 180) : `${value.length} item${value.length === 1 ? '' : 's'}`
  }
  if (value && typeof value === 'object') return 'updated'
  return ''
}

function fullWorldFeedChangeValue(value: unknown) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === 'string' ? entry.replace(/\s+/g, ' ').trim() : typeof entry === 'number' || typeof entry === 'boolean' ? String(entry) : '')
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

function shouldIncludeWorldFeedChangeField(key: string, value: unknown) {
  if (['source', 'ensureLinkedDefinition', 'customProperties', 'nodeType', 'thumbnailAssetKey', 'linkedDefinitionKey', 'aliases'].includes(key)) return false
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (key === 'status' && trimmed === 'active') return false
    if (key === 'source' && trimmed === 'ai') return false
    return true
  }
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function shouldIncludeWorldFeedUpdateChangeField(key: string, value: unknown) {
  if (['name', 'summary', 'context'].includes(key)) return false
  return shouldIncludeWorldFeedChangeField(key, value)
}

function addWorldFeedEntityChange(
  map: Map<string, { labels: Set<string>; details: string[] }>,
  entityKey: string | null | undefined,
  label: string,
  detail?: string,
) {
  if (!entityKey || !label.trim()) return
  const entry = map.get(entityKey) ?? { labels: new Set<string>(), details: [] }
  entry.labels.add(label)
  if (detail && !entry.details.includes(detail)) entry.details.push(detail)
  map.set(entityKey, entry)
}

function describeWorldFeedCounts(input: {
  addedCount: number
  changedCount: number
  relationshipCount: number
  mediaCount: number
  wikiCount: number
}) {
  return [
    input.addedCount > 0 ? `${input.addedCount} new` : null,
    input.changedCount > 0 ? `${input.changedCount} changed` : null,
    input.relationshipCount > 0 ? `${input.relationshipCount} link${input.relationshipCount === 1 ? '' : 's'}` : null,
    input.mediaCount > 0 ? `${input.mediaCount} media` : null,
    input.wikiCount > 0 ? `${input.wikiCount} wiki` : null,
  ].filter(Boolean).join(' / ')
}

function primaryWorldFeedFilter(input: {
  addedCount: number
  changedCount: number
  relationshipCount: number
  mediaCount: number
}): WorldFeedFilter {
  if (input.addedCount > 0) return 'additions'
  if (input.relationshipCount > 0) return 'relationships'
  if (input.changedCount > 0) return 'changes'
  if (input.mediaCount > 0) return 'media'
  return 'changes'
}

function relatedWorldFeedFilters(input: {
  addedCount: number
  changedCount: number
  relationshipCount: number
  mediaCount: number
  suggestionCount: number
}) {
  const filters: WorldFeedFilter[] = []
  if (input.addedCount > 0) filters.push('additions')
  if (input.changedCount > 0) filters.push('changes')
  if (input.relationshipCount > 0) filters.push('relationships')
  if (input.mediaCount > 0) filters.push('media')
  if (input.suggestionCount > 0) filters.push('suggestions')
  return filters
}

function buildTurnFeedSummary(input: {
  turn: WorldPromptTurn
  events: WorldPromptEvent[]
  lens?: WorldPromptTurnLens
  entityByKey: Map<string, WorldEntity>
  relationshipByKey: Map<string, WorldRelationship>
  active?: boolean
}): { parent: WorldFeedEntry; children: WorldFeedEntry[] } | null {
  const parsedEvents = input.events
    .map((event) => {
      const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
      return parsed.success ? { event, payload: parsed.data } : null
    })
    .filter((entry): entry is { event: WorldPromptEvent; payload: ReturnType<typeof worldPromptEventPayloadSchema.parse> } => Boolean(entry))

  const lens = input.lens
  const createOpEntityKeys: string[] = []
  const changedOpEntityKeys: string[] = []
  const entityChangeDetailsByKey = new Map<string, { labels: Set<string>; details: string[] }>()
  let sawAppliedOpWithPlannerOp = false
  const forceAppliedEntitiesCreated = isInitialSeedGenerationTurn(input.turn)
  for (const { event, payload } of parsedEvents) {
    if (event.eventType !== 'op_applied') continue
    const appliedEntities = payload.applied?.worldEntities ?? []
    const appliedEntityKeys = appliedEntities.map((entity) => entity.key)
    if (!payload.op) {
      createOpEntityKeys.push(...appliedEntityKeys)
      continue
    }
    sawAppliedOpWithPlannerOp = true
    const upsertCreatedNewEntity = payload.op.op === 'upsert_entity' && (
      !payload.op.payload.targetEntityKey
      || payload.op.metadata?.projectedCreate === true
      || forceAppliedEntitiesCreated
      || appliedEntities.every((entity) => isWorldFeedEntityCreatedDuringTurn(entity, input.turn, event.createdAt))
    )
    if (upsertCreatedNewEntity) {
      createOpEntityKeys.push(...appliedEntityKeys)
    } else {
      changedOpEntityKeys.push(...appliedEntityKeys)
      if (payload.op.op === 'update_entity') {
        for (const [key, value] of Object.entries(payload.op.payload.changes)) {
          if (!shouldIncludeWorldFeedUpdateChangeField(key, value)) continue
          const label = formatWorldFeedFieldLabel(key)
          const valuePreview = compactWorldFeedChangeValue(value)
          addWorldFeedEntityChange(
            entityChangeDetailsByKey,
            payload.op.payload.targetEntityKey,
            label,
            valuePreview ? `${label}: ${valuePreview}` : `${label} updated`,
          )
        }
      } else if (payload.op.op === 'update_entity_canon') {
        const targetEntityKey = payload.op.payload.targetEntityKey
        const currentStateKeys = Object.keys(payload.op.payload.currentStatePatch)
        for (const key of currentStateKeys) {
          const label = `State: ${formatWorldFeedFieldLabel(key)}`
          addWorldFeedEntityChange(
            entityChangeDetailsByKey,
            targetEntityKey,
            label,
            `${label}: ${compactWorldFeedChangeValue(payload.op.payload.currentStatePatch[key]) || 'updated'}`,
          )
        }
        if (payload.op.payload.factAdditions.length > 0) {
          const label = 'Canon added'
          const detail = payload.op.payload.factAdditions
            .map((fact) => fact.text)
            .filter(Boolean)
            .slice(0, 6)
            .join(' / ')
          addWorldFeedEntityChange(entityChangeDetailsByKey, targetEntityKey, label, detail ? `${label}: ${fullWorldFeedChangeValue(detail)}` : label)
        }
        if (payload.op.payload.supersedeFactIds.length > 0) {
          addWorldFeedEntityChange(entityChangeDetailsByKey, targetEntityKey, 'Canon facts superseded', `${payload.op.payload.supersedeFactIds.length} canon fact${payload.op.payload.supersedeFactIds.length === 1 ? '' : 's'} superseded`)
        }
      } else if (payload.op.op === 'upsert_entity') {
        const targetEntityKey = payload.op.payload.targetEntityKey ?? appliedEntityKeys[0]
        const entityInput = payload.op.payload.entity
        for (const key of ['tags', 'status'] as const) {
          const value = entityInput[key]
          if (!shouldIncludeWorldFeedChangeField(key, value)) continue
          const label = formatWorldFeedFieldLabel(key)
          const valuePreview = compactWorldFeedChangeValue(value)
          addWorldFeedEntityChange(entityChangeDetailsByKey, targetEntityKey, label, valuePreview ? `${label}: ${valuePreview}` : `${label} updated`)
        }
      }
    }
  }
  const addedEntityKeys = uniqueWorldFeedKeys(
    createOpEntityKeys.length > 0 || sawAppliedOpWithPlannerOp
      ? createOpEntityKeys
      : lens
        ? lens.entityKeys.filter((key) => lens.entityChangeKinds[key] === 'added')
        : [],
  )
  const plannedChangedEntityKeys = uniqueWorldFeedKeys([
    ...changedOpEntityKeys,
    ...(lens
      ? lens.entityKeys.filter((key) => lens.entityChangeKinds[key] && lens.entityChangeKinds[key] !== 'added' && lens.entityChangeKinds[key] !== 'touched')
      : []),
  ].filter((key) => !addedEntityKeys.includes(key)))
  const mediaLabels: string[] = []
  const wikiLabels: string[] = []
  const assistantNotes: string[] = []
  const completionNotes: string[] = []
  const rawSuggestions: WorldPromptSuggestion[] = []
  const auditTouchedEntityKeys: string[] = []
  const auditRelationshipKeys: string[] = []

  for (const { event, payload } of parsedEvents) {
    if (event.eventType === 'assistant_note' && payload.note) {
      assistantNotes.push(stripInternalPlannerDiagnostics(payload.note))
    }
    if (event.eventType === 'turn_completed' && payload.note) {
      completionNotes.push(stripInternalPlannerDiagnostics(payload.note))
    }
    if (event.eventType === 'queue_started') {
      mediaLabels.push(payload.queue?.type === 'cinematic_generation' ? 'Cinematic queued' : 'Image queued')
    }
    if (event.eventType === 'op_applied') {
      if (payload.op?.op === 'update_world_wiki_metadata') {
        wikiLabels.push(payload.op.payload.target === 'view' ? 'Wiki page updated' : 'Overview updated')
      }
      const audit = payload.audit && typeof payload.audit === 'object' ? payload.audit as Record<string, unknown> : {}
      const sequenceAudit = payload.sequencePatchAudit && typeof payload.sequencePatchAudit === 'object' ? payload.sequencePatchAudit as Record<string, unknown> : {}
      for (const key of [
        ...(Array.isArray(audit.touchedEntityKeys) ? audit.touchedEntityKeys : []),
        ...(typeof audit.targetEntityKey === 'string' ? [audit.targetEntityKey] : []),
        ...(Array.isArray(sequenceAudit.touchedEntityKeys) ? sequenceAudit.touchedEntityKeys : []),
      ]) {
        if (typeof key === 'string') auditTouchedEntityKeys.push(key)
      }
      for (const key of [
        ...(Array.isArray(audit.touchedRelationshipKeys) ? audit.touchedRelationshipKeys : []),
        ...(Array.isArray(audit.createdRelationshipKeys) ? audit.createdRelationshipKeys : []),
        ...(Array.isArray(sequenceAudit.createdRelationshipKeys) ? sequenceAudit.createdRelationshipKeys : []),
        ...(Array.isArray(sequenceAudit.archivedRelationshipKeys) ? sequenceAudit.archivedRelationshipKeys : []),
      ]) {
        if (typeof key === 'string') auditRelationshipKeys.push(key)
      }
      for (const result of payload.applied?.worldResults ?? []) {
        mediaLabels.push(result.title || 'Output created')
      }
    }
    if (payload.suggestions.length > 0) {
      rawSuggestions.push(...payload.suggestions)
    }
  }
  const suggestions = uniqueWorldPromptSuggestions(rawSuggestions)
  const touchedEntityKeys = uniqueWorldFeedKeys([
    ...addedEntityKeys,
    ...plannedChangedEntityKeys,
    ...(lens?.entityKeys ?? []),
    ...auditTouchedEntityKeys,
  ])
  const changedEntityKeys = uniqueWorldFeedKeys([
    ...plannedChangedEntityKeys,
    ...auditTouchedEntityKeys,
  ].filter((key) => !addedEntityKeys.includes(key)))
  const relationshipKeys = uniqueWorldFeedKeys([...(lens?.relationshipKeys ?? []), ...auditRelationshipKeys])

  const feedSummary = readFeedSummaryMetadata(input.turn)
  const metadataTitle = readFeedSummaryString(feedSummary, 'title')
  const metadataSummary = readFeedSummaryString(feedSummary, 'summary')
  const metadataProminentEntityKey = readFeedSummaryString(feedSummary, 'prominentEntityKey')
  const addedEntities = addedEntityKeys.map((key) => input.entityByKey.get(key)).filter((entity): entity is WorldEntity => Boolean(entity))
  const changedEntities = changedEntityKeys.map((key) => input.entityByKey.get(key)).filter((entity): entity is WorldEntity => Boolean(entity))
  const counts = {
    addedCount: addedEntityKeys.length,
    changedCount: changedEntityKeys.length,
    relationshipCount: relationshipKeys.length,
    mediaCount: mediaLabels.length,
    wikiCount: wikiLabels.length,
    suggestionCount: suggestions.length,
  }
  const changeCounts = {
    addedEntities: counts.addedCount,
    updatedEntities: counts.changedCount,
    relationships: counts.relationshipCount,
    wiki: counts.wikiCount,
    media: counts.mediaCount,
    suggestions: counts.suggestionCount,
    total: counts.addedCount + counts.changedCount + counts.relationshipCount + counts.wikiCount + counts.mediaCount + counts.suggestionCount,
  }
  const countSummary = describeWorldFeedCounts(counts)
  const promptExcerpt = compactWorldFeedText(input.turn.prompt, 118)
  const summaryText = metadataSummary
    || stripInternalPlannerDiagnostics(input.turn.assistantSummary)
    || completionNotes.find(Boolean)
    || assistantNotes.find(Boolean)
    || (countSummary ? `Applied ${countSummary}.` : input.turn.prompt)
  const title = metadataTitle
    || (input.active
      ? 'Applying world changes'
      : addedEntities.length === 1 && counts.changedCount === 0 && counts.relationshipCount <= 1
        ? `New ${labelForWorldEntity(addedEntities[0].nodeType)}: ${addedEntities[0].name}`
        : counts.addedCount > 0
          ? 'New canon added'
          : counts.relationshipCount > 0
            ? 'Relationships updated'
            : counts.mediaCount > 0
              ? 'Media updated'
              : counts.wikiCount > 0
                ? 'Wiki updated'
                : 'Canon updated')
  const prominentEntityKey = metadataProminentEntityKey
    || addedEntityKeys[0]
    || changedEntityKeys[0]
    || lens?.rootEntityKey
    || null
  const relatedFilters = relatedWorldFeedFilters(counts)
  const filter = primaryWorldFeedFilter(counts)
  const createdAt = input.active ? input.turn.createdAt : latestWorldFeedEventTime(input.events, input.turn.updatedAt || input.turn.createdAt)
  const connectedEntityKeys = uniqueWorldFeedKeys([
    ...(prominentEntityKey ? [prominentEntityKey] : []),
    ...touchedEntityKeys,
  ])
  const thumbnailEntityKeys = addedEntityKeys.length > 0
    ? addedEntityKeys.slice(0, 4)
    : connectedEntityKeys.slice(0, 4)
  const changedFields = [
    countSummary || null,
    input.active ? input.turn.status : null,
  ].filter((value): value is string => Boolean(value))
  const fullDetail = [
    summaryText,
    input.turn.prompt ? `Prompt: ${input.turn.prompt}` : '',
    addedEntities.length > 0 ? `New entities: ${addedEntities.map((entity) => entity.name).join(', ')}` : '',
    changedEntities.length > 0 ? `Changed entities: ${changedEntities.map((entity) => entity.name).join(', ')}` : '',
    relationshipKeys.length > 0 ? `Relationships: ${relationshipKeys.map((key) => {
      const relationship = input.relationshipByKey.get(key)
      if (!relationship) return key
      const source = input.entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
      const target = input.entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
      return `${source} ${relationship.verb.replace(/_/g, ' ')} ${target}`
    }).join('; ')}` : '',
    wikiLabels.length > 0 ? `Wiki: ${wikiLabels.join(', ')}` : '',
    mediaLabels.length > 0 ? `Media: ${mediaLabels.join(', ')}` : '',
  ].filter(Boolean).join('\n\n')

  const parent = withCompactWorldFeedDetail({
    id: input.active ? `active-turn:${input.turn.id}` : `turn:${input.turn.id}`,
    createdAt,
    kind: input.active ? 'active_turn' : 'turn_update',
    filter,
    relatedFilters,
    title,
    detail: summaryText,
    fullDetail,
    badge: 'Prompt',
    tone: input.active ? 'working' : 'success',
    promptExcerpt,
    changeCounts,
    thumbnailEntityKeys,
    connectedEntityKeys,
    changedFields,
    audit: {
      prompt: input.turn.prompt,
      assistantSummary: summaryText,
      addedEntityKeys,
      changedEntityKeys,
      relationshipKeys,
      wikiLabels,
      mediaLabels,
      suggestionCount: suggestions.length,
    },
    turnId: input.turn.id,
    sortOrder: 0,
    turnLens: lens,
    suggestions: suggestions.slice(0, 3),
  } satisfies WorldFeedEntry)

  const addedChildren = addedEntities.map((entity, index) => withCompactWorldFeedDetail({
    id: `turn:${input.turn.id}:entity:${entity.key}`,
    createdAt,
    kind: 'entity_created',
    filter: 'additions',
    relatedFilters: ['additions'],
    title: entity.name,
    detail: entity.summary || entity.context || labelForWorldEntity(entity.nodeType),
    fullDetail: entity.context || entity.summary || labelForWorldEntity(entity.nodeType),
    badge: 'New Entity',
    tone: 'success',
    entityKey: entity.key,
    entityNodeType: entity.nodeType,
    thumbnailEntityKeys: [entity.key],
    connectedEntityKeys: [entity.key],
    parentTurnId: input.turn.id,
    turnId: input.turn.id,
    sortOrder: index + 1,
    turnLens: lens,
  } satisfies WorldFeedEntry))
  const changedChildren = changedEntities.map((entity, index) => withCompactWorldFeedDetail({
    ...(() => {
      const changeDetail = entityChangeDetailsByKey.get(entity.key)
      const changeLabels = changeDetail ? [...changeDetail.labels].slice(0, 8) : []
      const changeDetails = changeDetail?.details.slice(0, 8) ?? []
      const fallbackDetail = entity.context || entity.summary || labelForWorldEntity(entity.nodeType)
      return {
        detail: changeDetails[0] ?? fallbackDetail,
        fullDetail: fallbackDetail,
        changedFields: changeLabels.length > 0 ? changeLabels : undefined,
        audit: changeDetails.length > 0 ? { changeDetails } : undefined,
      }
    })(),
    id: `turn:${input.turn.id}:entity-updated:${entity.key}`,
    createdAt,
    kind: 'entity_updated',
    filter: 'changes',
    relatedFilters: ['changes'],
    title: entity.name,
    badge: 'Updated',
    tone: 'normal',
    entityKey: entity.key,
    entityNodeType: entity.nodeType,
    thumbnailEntityKeys: [entity.key],
    connectedEntityKeys: [entity.key],
    parentTurnId: input.turn.id,
    turnId: input.turn.id,
    sortOrder: addedChildren.length + index + 1,
    turnLens: lens,
  } satisfies WorldFeedEntry))
  const secondaryStartOrder = addedChildren.length + changedChildren.length + 1
  const suggestionChildren = suggestions.map((suggestion, index) => withCompactWorldFeedDetail({
    id: `turn:${input.turn.id}:suggestion:${suggestion.id || index}`,
    createdAt,
    kind: 'suggestion',
    filter: 'suggestions',
    relatedFilters: ['suggestions'],
    title: suggestion.label || suggestion.summary || 'Suggested action',
    detail: suggestion.summary || suggestion.prompt || suggestion.label || 'Suggested next move',
    fullDetail: suggestion.prompt || suggestion.summary || suggestion.label || 'Suggested next move',
    badge: 'Suggestion',
    tone: 'normal',
    thumbnailEntityKeys: connectedEntityKeys.slice(0, 1),
    connectedEntityKeys,
    parentTurnId: input.turn.id,
    turnId: input.turn.id,
    sortOrder: secondaryStartOrder + 3 + index,
    turnLens: lens,
    suggestions: [suggestion],
  } satisfies WorldFeedEntry))
  const secondaryChildren = [
    relationshipKeys.length > 0 ? withCompactWorldFeedDetail({
      id: `turn:${input.turn.id}:relationships`,
      createdAt,
      kind: 'relationship_updated',
      filter: 'relationships',
      relatedFilters: ['relationships'],
      title: `${relationshipKeys.length} relationship${relationshipKeys.length === 1 ? '' : 's'} changed`,
      detail: relationshipKeys.slice(0, 4).map((key) => {
        const relationship = input.relationshipByKey.get(key)
        if (!relationship) return key
        const source = input.entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
        const target = input.entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
        return `${source} ${relationship.verb.replace(/_/g, ' ')} ${target}`
      }).join('; '),
      fullDetail: relationshipKeys.join('\n'),
      badge: 'Relationships',
      tone: 'normal',
      relationshipKey: relationshipKeys[0],
      thumbnailEntityKeys: connectedEntityKeys.slice(0, 2),
      connectedEntityKeys,
      parentTurnId: input.turn.id,
      turnId: input.turn.id,
      sortOrder: secondaryStartOrder,
      turnLens: lens,
    } satisfies WorldFeedEntry) : null,
    wikiLabels.length > 0 ? withCompactWorldFeedDetail({
      id: `turn:${input.turn.id}:wiki`,
      createdAt,
      kind: 'wiki_updated',
      filter: 'changes',
      relatedFilters: ['changes'],
      title: 'Wiki updated',
      detail: wikiLabels.join(', '),
      fullDetail: wikiLabels.join('\n'),
      badge: 'Wiki',
      tone: 'normal',
      thumbnailEntityKeys: connectedEntityKeys.slice(0, 2),
      connectedEntityKeys,
      parentTurnId: input.turn.id,
      turnId: input.turn.id,
      sortOrder: secondaryStartOrder + 1,
      turnLens: lens,
    } satisfies WorldFeedEntry) : null,
    mediaLabels.length > 0 ? withCompactWorldFeedDetail({
      id: `turn:${input.turn.id}:media`,
      createdAt,
      kind: 'media_job',
      filter: 'media',
      relatedFilters: ['media'],
      title: `${mediaLabels.length} media update${mediaLabels.length === 1 ? '' : 's'}`,
      detail: mediaLabels.join(', '),
      fullDetail: mediaLabels.join('\n'),
      badge: 'Media',
      tone: 'normal',
      thumbnailEntityKeys: connectedEntityKeys.slice(0, 2),
      connectedEntityKeys,
      parentTurnId: input.turn.id,
      turnId: input.turn.id,
      sortOrder: secondaryStartOrder + 2,
      turnLens: lens,
    } satisfies WorldFeedEntry) : null,
  ].filter((entry): entry is WorldFeedEntry => Boolean(entry))
  const children = [...addedChildren, ...changedChildren, ...secondaryChildren, ...suggestionChildren]

  if (!input.active && parent.detail.trim().length === 0 && children.length === 0 && relatedFilters.length === 0) {
    return null
  }

  return { parent, children }
}

export function buildWorldFeedEntryFromTranscriptEntry(input: {
  entry: WorldPromptTranscriptEntry
  relationshipByKey: Map<string, WorldRelationship>
}): WorldFeedEntry | null {
  const filter = worldFeedFilterForTranscriptEntry(input.entry)
  if (!filter) return null
  const kind = worldFeedKindForTranscriptEntry(input.entry)
  const base = {
    id: input.entry.id,
    createdAt: input.entry.createdAt,
    kind,
    filter,
    badge: worldFeedBadgeForEntry(input.entry),
  }

  switch (input.entry.kind) {
    case 'user_message':
      return {
        ...base,
        title: 'Prompt submitted',
        detail: input.entry.content,
        fullDetail: input.entry.content,
        tone: 'normal',
      }
    case 'assistant_message':
      return {
        ...base,
        title: input.entry.pending ? 'AI update' : 'AI response',
        detail: input.entry.content,
        fullDetail: input.entry.content,
        tone: input.entry.pending ? 'working' : 'normal',
      }
    case 'system_status':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: input.entry.tone === 'error' ? 'error' : 'normal',
      }
    case 'planner_progress':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? input.entry.outline.slice(0, 3).join(' · '),
        fullDetail: input.entry.detail ?? input.entry.outline.join(' · '),
        tone: input.entry.done ? 'success' : 'working',
      }
    case 'turn_lens':
      return {
        ...base,
        title: input.entry.detail || 'World updated',
        detail: `${input.entry.turnLens.counts.entities} entities / ${input.entry.turnLens.counts.relationships} links / ${input.entry.turnLens.counts.derived} outputs`,
        fullDetail: input.entry.turnLens.prompt,
        thumbnailEntityKeys: input.entry.turnLens.entityKeys.slice(0, 1),
        connectedEntityKeys: input.entry.turnLens.entityKeys,
        tone: 'success',
        turnId: input.entry.turnLens.turnId,
        turnLens: input.entry.turnLens,
      }
    case 'entity_created':
    case 'entity_updated':
    case 'entity_replaced':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        thumbnailEntityKeys: [input.entry.entityKey],
        connectedEntityKeys: [input.entry.entityKey],
        tone: input.entry.kind === 'entity_created' ? 'success' : 'normal',
        entityKey: input.entry.entityKey,
        entityNodeType: input.entry.entityNodeType,
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    case 'entity_canon_updated': {
      const addedFacts = Array.isArray(input.entry.audit.addedFacts) ? input.entry.audit.addedFacts.length : 0
      const supersededFacts = Array.isArray(input.entry.audit.supersededFacts) ? input.entry.audit.supersededFacts.length : 0
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        thumbnailEntityKeys: [input.entry.entityKey],
        connectedEntityKeys: [input.entry.entityKey],
        changedFields: [
          addedFacts ? `${addedFacts} facts added` : null,
          supersededFacts ? `${supersededFacts} facts superseded` : null,
          input.entry.audit.currentStateChanged === true ? 'current state changed' : null,
        ].filter((value): value is string => Boolean(value)),
        audit: input.entry.audit,
        tone: 'success',
        entityKey: input.entry.entityKey,
        entityNodeType: input.entry.entityNodeType,
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    }
    case 'relationship_created':
    case 'relationship_updated': {
      const relationship = input.relationshipByKey.get(input.entry.relationshipKey) ?? null
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? relationship?.notes ?? '',
        fullDetail: input.entry.detail ?? relationship?.notes ?? '',
        thumbnailEntityKeys: relationship ? [relationship.sourceEntityKey, relationship.targetEntityKey] : [],
        connectedEntityKeys: relationship ? [relationship.sourceEntityKey, relationship.targetEntityKey] : [],
        changedFields: relationship?.verb ? [relationship.verb.replace(/_/g, ' ')] : [],
        tone: input.entry.kind === 'relationship_created' ? 'success' : 'normal',
        relationshipKey: input.entry.relationshipKey,
        sourceLabel: input.entry.sourceLabel,
        targetLabel: input.entry.targetLabel,
        relationshipVerb: relationship?.verb ?? '',
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    }
    case 'sequence_rewired': {
      const audit = input.entry.sequencePatchAudit
      const touchedEntityKeys = Array.isArray(audit.touchedEntityKeys)
        ? audit.touchedEntityKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      const createdRelationshipKeys = Array.isArray(audit.createdRelationshipKeys)
        ? audit.createdRelationshipKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      const archivedRelationshipKeys = Array.isArray(audit.archivedRelationshipKeys)
        ? audit.archivedRelationshipKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        thumbnailEntityKeys: touchedEntityKeys.slice(0, 2),
        connectedEntityKeys: touchedEntityKeys,
        changedFields: [
          createdRelationshipKeys.length ? `${createdRelationshipKeys.length} links created` : null,
          archivedRelationshipKeys.length ? `${archivedRelationshipKeys.length} links archived` : null,
        ].filter((value): value is string => Boolean(value)),
        sequencePatchAudit: audit,
        tone: 'success',
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    }
    case 'relationship_rewired': {
      const audit = input.entry.audit
      const touchedEntityKeys = Array.isArray(audit.touchedEntityKeys)
        ? audit.touchedEntityKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      const touchedRelationshipKeys = Array.isArray(audit.touchedRelationshipKeys)
        ? audit.touchedRelationshipKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        thumbnailEntityKeys: touchedEntityKeys.slice(0, 2),
        connectedEntityKeys: touchedEntityKeys,
        changedFields: touchedRelationshipKeys.length ? [`${touchedRelationshipKeys.length} links rewired`] : [],
        audit,
        tone: 'success',
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    }
    case 'entity_merged': {
      const audit = input.entry.audit
      const sourceEntityKey = typeof audit.sourceEntityKey === 'string' ? audit.sourceEntityKey : ''
      const targetEntityKey = typeof audit.targetEntityKey === 'string' ? audit.targetEntityKey : ''
      const relationshipKeys = Array.isArray(audit.transferredRelationshipKeys)
        ? audit.transferredRelationshipKeys.filter((entry): entry is string => typeof entry === 'string')
        : []
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        thumbnailEntityKeys: [sourceEntityKey, targetEntityKey].filter(Boolean),
        connectedEntityKeys: [sourceEntityKey, targetEntityKey].filter(Boolean),
        changedFields: relationshipKeys.length ? [`${relationshipKeys.length} links transferred`] : [],
        audit,
        tone: 'success',
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    }
    case 'canon_transaction':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        transaction: input.entry.transaction,
        tone: input.entry.tone ?? 'working',
      }
    case 'node_evolution':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        transaction: input.entry.transaction,
        nodeEvolution: input.entry.nodeEvolution,
        connectedEntityKeys: Array.isArray(input.entry.transaction?.affectedEntityKeys)
          ? input.entry.transaction.affectedEntityKeys.filter((entry): entry is string => typeof entry === 'string')
          : [],
        changedFields: Array.isArray(input.entry.nodeEvolution.decisions)
          ? input.entry.nodeEvolution.decisions
              .map((decision) => typeof decision === 'object' && decision !== null && 'decision' in decision && typeof decision.decision === 'string'
                ? decision.decision.replace(/_/g, ' ')
                : null)
              .filter((value): value is string => Boolean(value))
              .slice(0, 4)
          : [],
        tone: input.entry.tone ?? 'working',
      }
    case 'op_status':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        validation: input.entry.validation,
        changedFields: input.entry.op ? [input.entry.op.op.replace(/_/g, ' ')] : [],
        tone: input.entry.tone ?? 'normal',
      }
    case 'derived_result_created':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: 'success',
        resultKey: input.entry.resultKey,
        turnId: input.entry.turnLens?.turnId,
        turnLens: input.entry.turnLens,
      }
    case 'queue_started':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: 'working',
      }
    case 'advisory_answer':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: 'normal',
      }
    case 'diagnostic_finding':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: input.entry.severity === 'high' ? 'error' : 'warning',
      }
    case 'suggestion_set':
    case 'clarification_question':
      return {
        ...base,
        title: input.entry.label ?? 'Suggested next move',
        detail: input.entry.suggestions.map((suggestion) => suggestion.label || suggestion.summary).filter(Boolean).join(' · '),
        fullDetail: input.entry.suggestions.map((suggestion) => suggestion.summary || suggestion.label).filter(Boolean).join(' · '),
        tone: 'normal',
        suggestions: input.entry.suggestions,
      }
    case 'clarification_answer':
    case 'continuation_without_suggestion':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? '',
        fullDetail: input.entry.detail ?? '',
        tone: 'normal',
      }
    case 'preview_available':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? 'A preview is ready to review.',
        fullDetail: input.entry.detail ?? 'A preview is ready to review.',
        tone: 'warning',
        turnId: input.entry.turnId,
      }
    case 'approval_required':
      return {
        ...base,
        title: input.entry.label,
        detail: input.entry.detail ?? `${input.entry.ops.length} operation${input.entry.ops.length === 1 ? '' : 's'} need review.`,
        fullDetail: input.entry.detail ?? `${input.entry.ops.length} operation${input.entry.ops.length === 1 ? '' : 's'} need review.`,
        tone: 'warning',
        turnId: input.entry.turnId,
      }
    default:
      return null
  }
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function groupLabelForWorldFeedDate(createdAt: string, now: Date) {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Earlier'
  const ageMs = now.getTime() - created.getTime()
  if (ageMs >= 0 && ageMs < 15 * 60 * 1000) return 'Just now'
  const createdDay = startOfLocalDay(created)
  const today = startOfLocalDay(now)
  if (createdDay === today) return 'Today'
  if (createdDay === today - 24 * 60 * 60 * 1000) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(created)
}

function createWorldFeedGroups(entries: WorldFeedEntry[], now: Date): WorldFeedGroup[] {
  const groups: WorldFeedGroup[] = []
  const groupByLabel = new Map<string, WorldFeedGroup>()
  for (const entry of entries) {
    const label = groupLabelForWorldFeedDate(entry.createdAt, now)
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'earlier'
    let group = groupByLabel.get(label)
    if (!group) {
      group = { id, label, entries: [] }
      groupByLabel.set(label, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

export function buildWorldFeedViewModel(input: {
  events: WorldPromptEvent[]
  messages: WorldPromptMessage[]
  entityByKey: Map<string, WorldEntity>
  relationships?: WorldRelationship[]
  turns?: WorldPromptTurn[]
  activeTurn?: WorldPromptTurn | null
  suggestions?: WorldPromptSuggestion[]
  now?: Date
}): WorldFeedViewModel {
  const relationshipByKey = new Map((input.relationships ?? []).map((relationship) => [relationship.key, relationship]))
  const turnLensByTurnId = buildWorldPromptTurnLenses({ events: input.events, turns: input.turns })
  const eventsByTurnId = new Map<string, WorldPromptEvent[]>()
  for (const event of input.events) {
    const list = eventsByTurnId.get(event.turnId) ?? []
    list.push(event)
    eventsByTurnId.set(event.turnId, list)
  }

  const turnEntries: WorldFeedEntry[] = []
  let activeTurnEntry: WorldFeedEntry | null = null
  for (const turn of input.turns ?? []) {
    const isActive = Boolean(input.activeTurn && input.activeTurn.id === turn.id && ['queued', 'streaming'].includes(input.activeTurn.status))
    const result = buildTurnFeedSummary({
      turn: isActive && input.activeTurn ? input.activeTurn : turn,
      events: eventsByTurnId.get(turn.id) ?? [],
      lens: turnLensByTurnId.get(turn.id),
      entityByKey: input.entityByKey,
      relationshipByKey,
      active: isActive,
    })
    if (!result) continue
    if (isActive) {
      activeTurnEntry = result.parent
      turnEntries.push(result.parent, ...result.children)
    } else {
      turnEntries.push(result.parent, ...result.children)
    }
  }

  if (input.activeTurn && ['queued', 'streaming'].includes(input.activeTurn.status) && !activeTurnEntry) {
    const result = buildTurnFeedSummary({
      turn: input.activeTurn,
      events: eventsByTurnId.get(input.activeTurn.id) ?? [],
      lens: turnLensByTurnId.get(input.activeTurn.id),
      entityByKey: input.entityByKey,
      relationshipByKey,
      active: true,
    })
    if (result) {
      activeTurnEntry = result.parent
      turnEntries.push(result.parent, ...result.children)
    }
  }

  const sortedEntries = turnEntries.sort((left, right) => {
    const timeDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    if (timeDelta !== 0) return timeDelta
    if (left.turnId && right.turnId && left.turnId === right.turnId) {
      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    }
    return right.id.localeCompare(left.id)
  })

  const countsByFilter = WORLD_FEED_FILTERS.reduce<Record<WorldFeedFilter, number>>((counts, filter) => {
    counts[filter.key] = filter.key === 'all'
      ? sortedEntries.length
      : sortedEntries.filter((entry) => entry.filter === filter.key || entry.relatedFilters?.includes(filter.key)).length
    return counts
  }, {
    all: 0,
    additions: 0,
    changes: 0,
    relationships: 0,
    media: 0,
    suggestions: 0,
  })

  return {
    entries: sortedEntries,
    groups: createWorldFeedGroups(sortedEntries, input.now ?? new Date()),
    countsByFilter,
    activeTurnEntry,
    suggestions: uniqueWorldPromptSuggestions(input.suggestions ?? []),
  }
}

function detailForBlockedClassification(classification: WorldPromptTurn['metadata']['classification'] | undefined) {
  switch (classification) {
    case 'not_graphable':
      return 'The request did not contain actionable worldbuilding changes. Rewrite it as something that adds or connects story material.'
    case 'contradictory_or_low_confidence':
      return 'The planner found conflicting or ambiguous instructions. Choose a clarification path or tighten the request.'
    default:
      return 'The prompt needs a clearer instruction before it can change the graph.'
  }
}

function summarizeAppliedChanges(input: {
  turnId: string | null
  events: WorldPromptEvent[]
  entityByKey: Map<string, WorldEntity>
}) {
  const appliedEntities: string[] = []
  const appliedRelationships: string[] = []
  const queuedLabels: string[] = []

  const relevantEvents = input.turnId
    ? input.events.filter((event) => event.turnId === input.turnId)
    : []

  for (const event of relevantEvents) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    const payload = parsed.data

    if (event.eventType === 'op_applied') {
      for (const entity of payload.applied?.worldEntities ?? []) {
        appliedEntities.push(entity.name)
      }
      for (const relationship of payload.applied?.worldRelationships ?? []) {
        const sourceName = input.entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
        const targetName = input.entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
        appliedRelationships.push(`${sourceName} -> ${targetName}`)
      }
    }

    if (event.eventType === 'queue_started') {
      if (payload.queue?.type === 'cinematic_generation') {
        queuedLabels.push('Cinematic queued')
      } else if (payload.queue?.targetEntityKey) {
        const entityName = input.entityByKey.get(payload.queue.targetEntityKey)?.name ?? payload.queue.targetEntityKey
        queuedLabels.push(`Image queued for ${entityName}`)
      } else {
        queuedLabels.push('Image queued')
      }
    }
  }

  return {
    appliedEntities,
    appliedRelationships,
    queuedLabels,
  }
}

export function buildWorldPromptRailViewModel(input: {
  activeTurn: WorldPromptTurn | null
  turns: WorldPromptTurn[]
  events: WorldPromptEvent[]
  entityByKey: Map<string, WorldEntity>
  promptError?: string | null
}) {
  const latestTurn = input.turns.at(-1) ?? null
  const effectiveTurn = input.activeTurn ?? latestTurn
  const preview = activePreviewForTurn(effectiveTurn)
  const relevantEvents = effectiveTurn
    ? input.events.filter((event) => event.turnId === effectiveTurn.id)
    : input.events

  let latestSuggestions: WorldPromptSuggestion[] = []
  let latestPlannerStatus: string | null = null
  let latestPlannerProgressMessage: string | null = null

  for (const event of [...relevantEvents].reverse()) {
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success) continue
    if (!latestPlannerProgressMessage && parsed.data.plannerProgress?.message) {
      latestPlannerProgressMessage = stripInternalPlannerDiagnostics(parsed.data.plannerProgress.message)
    }
    if (!latestPlannerStatus && parsed.data.plannerStatus) {
      latestPlannerStatus = parsed.data.plannerProgress
        ? describePlannerProgressPhase(parsed.data.plannerProgress.phase)
        : describePlannerStatus(parsed.data.plannerStatus)
    }
    if (latestSuggestions.length === 0 && parsed.data.suggestions.length > 0) {
      latestSuggestions = parsed.data.suggestions
        .map((suggestion) => {
          const label = stripInternalPlannerDiagnostics(suggestion.label).replace(/\s+/g, ' ').trim()
          const prompt = stripInternalPlannerDiagnostics(suggestion.prompt).replace(/\s+/g, ' ').trim()
          const summary = stripInternalPlannerDiagnostics(suggestion.summary).replace(/\s+/g, ' ').trim()
          const resolvedLabel = label || summary
          if (!resolvedLabel || !prompt) return null
          return {
            ...suggestion,
            label: resolvedLabel,
            prompt,
            summary,
          }
        })
        .filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion))
    }
    if (latestSuggestions.length > 0 && latestPlannerStatus && latestPlannerProgressMessage) break
  }

  const approvalOps = [
    ...(preview?.pendingOps ?? []).filter((op) => op.applyMode === 'needs_approval' || op.status === 'pending'),
    ...input.events
      .filter((event) => event.turnId === effectiveTurn?.id && event.eventType === 'op_needs_approval')
      .map((event) => worldPromptEventPayloadSchema.safeParse(event.payload))
      .map((parsed) => parsed.success ? parsed.data.op : undefined)
      .filter((op): op is PromptToWorldOp => Boolean(op)),
  ].filter((op, index, values) => values.findIndex((candidate) => candidate.id === op.id) === index)
  const { appliedEntities, appliedRelationships, queuedLabels } = summarizeAppliedChanges({
    turnId: effectiveTurn?.id ?? null,
    events: input.events,
    entityByKey: input.entityByKey,
  })

  const classification = effectiveTurn?.metadata?.classification
  const plannerFailure = effectiveTurn?.metadata?.plannerFailure ?? null
  const storedAnswer = stripInternalPlannerDiagnostics(typeof effectiveTurn?.metadata?.answer === 'string' ? effectiveTurn.metadata.answer : '')
  const latestSummary = stripInternalPlannerDiagnostics(effectiveTurn?.assistantSummary ?? '')
  const latestDetail = storedAnswer || latestSummary || effectiveTurn?.errorMessage || ''
  const hasClarificationChoices = latestSuggestions.length > 1 || latestSuggestions.some((suggestion) => suggestion.kind === 'repair_prompt')
  const isBlockedClassification = classification === 'not_graphable' || classification === 'contradictory_or_low_confidence'

  if (input.promptError || effectiveTurn?.status === 'failed' || isBlockedClassification) {
    return {
      state: 'blocked',
      title: 'Prompt needs repair',
      detail: input.promptError ?? effectiveTurn?.errorMessage ?? detailForBlockedClassification(classification),
      statusLabel: 'Blocked',
      primaryActionLabel: 'Generate',
      primaryActionKind: 'generate',
      latestSuggestions,
      preview,
      approvalOps,
      appliedEntities,
      appliedRelationships,
      queuedLabels,
      latestPlannerStatus,
      plannerFailure,
    } satisfies WorldPromptRailViewModel
  }

  if (input.activeTurn && ['queued', 'streaming'].includes(input.activeTurn.status)) {
    return {
      state: 'working',
      title: 'Building the next graph neighborhood',
      detail: latestPlannerProgressMessage || 'The planner is resolving entities, relationships, and next moves.',
      statusLabel: latestPlannerStatus ?? 'Planning',
      primaryActionLabel: 'Generate',
      primaryActionKind: 'generate',
      latestSuggestions,
      preview,
      approvalOps,
      appliedEntities,
      appliedRelationships,
      queuedLabels,
      latestPlannerStatus,
      plannerFailure,
    } satisfies WorldPromptRailViewModel
  }

  if (hasClarificationChoices) {
    return {
      state: 'needs_clarification',
      title: 'Clarification required',
      detail: latestDetail || 'Choose one path below or rewrite the prompt so the graph can continue cleanly.',
      statusLabel: 'Needs Clarification',
      primaryActionLabel: 'Generate',
      primaryActionKind: 'generate',
      latestSuggestions,
      preview,
      approvalOps,
      appliedEntities,
      appliedRelationships,
      queuedLabels,
      latestPlannerStatus,
      plannerFailure,
    } satisfies WorldPromptRailViewModel
  }

  if (effectiveTurn?.status === 'completed' && (appliedEntities.length > 0 || appliedRelationships.length > 0 || queuedLabels.length > 0 || latestSuggestions.length > 0)) {
    const addedSummary = [
      appliedEntities.length > 0 ? `${appliedEntities.length} entities` : null,
      appliedRelationships.length > 0 ? `${appliedRelationships.length} links` : null,
      queuedLabels.length > 0 ? `${queuedLabels.length} queues` : null,
    ].filter(Boolean).join(' · ')

    return {
      state: 'completed',
      title: 'Graph updated',
      detail: latestDetail || (addedSummary ? `This turn added ${addedSummary}.` : 'The graph has new material ready for expansion.'),
      statusLabel: 'Completed',
      primaryActionLabel: 'Continue building',
      primaryActionKind: 'continue',
      latestSuggestions,
      preview,
      approvalOps,
      appliedEntities,
      appliedRelationships,
      queuedLabels,
      latestPlannerStatus,
      plannerFailure,
    } satisfies WorldPromptRailViewModel
  }

  if (effectiveTurn?.status === 'completed' && (classification === 'advisory_question' || classification === 'graph_diagnosis' || classification === 'refinement_only')) {
    return {
      state: 'completed',
      title: classification === 'graph_diagnosis' ? 'Diagnosis ready' : classification === 'refinement_only' ? 'Refinement applied' : 'Answer ready',
      detail: latestDetail || 'The planner answered against the current world state and proposed the next best options.',
      statusLabel: classification === 'graph_diagnosis' ? 'Diagnosis' : classification === 'refinement_only' ? 'Refined' : 'Answered',
      primaryActionLabel: 'Continue building',
      primaryActionKind: 'continue',
      latestSuggestions,
      preview,
      approvalOps,
      appliedEntities,
      appliedRelationships,
      queuedLabels,
      latestPlannerStatus,
      plannerFailure,
    } satisfies WorldPromptRailViewModel
  }

  return {
    state: 'idle',
    title: 'Describe what to add next',
    detail: 'Use one prompt to create entities, connect them, or clarify pressure points in the same stream.',
    statusLabel: 'Ready',
    primaryActionLabel: 'Generate',
    primaryActionKind: 'generate',
    latestSuggestions,
    preview,
    approvalOps,
    appliedEntities,
    appliedRelationships,
    queuedLabels,
    latestPlannerStatus,
    plannerFailure,
  } satisfies WorldPromptRailViewModel
}

export function buildWorldInspectorViewModel(input: {
  entity: WorldEntity | null
  operator: WorldOperator | null
  result: WorldResult | null
  imageUrl?: string | null
  relationCount?: number
  usageCount?: number
  sequenceNavigation?: {
    previousLabels: string[]
    nextLabels: string[]
  } | null
}): WorldInspectorViewModel | null {
  if (input.entity) {
    const sequence = input.entity.nodeType === 'sequence_unit'
      ? readWorldSequenceMetadata(input.entity)
      : null
    return {
      title: input.entity.name,
      kicker: labelForWorldEntity(input.entity.nodeType),
      summary: input.entity.summary,
      context: sequence?.synopsis || input.entity.context,
      imageUrl: input.imageUrl ?? null,
      stats: [
        `${input.relationCount ?? 0} relationships`,
        `${input.usageCount ?? 0} usages`,
        sequence?.ordinal !== undefined && sequence?.ordinal !== null ? `Step ${sequence.ordinal}` : null,
        sequence?.actLabel ? sequence.actLabel : null,
        sequence?.storyFunction ? sequence.storyFunction.replace(/_/g, ' ') : null,
        input.entity.source === 'ai' ? 'AI-sourced' : 'Manual',
      ].filter((value): value is string => Boolean(value)),
      sequence: sequence
        ? {
            unitKind: sequence.unitKind ?? 'chapter',
            sequenceKey: sequence.sequenceKey ?? 'main',
            ordinal: typeof sequence.ordinal === 'number' ? sequence.ordinal : null,
            actLabel: sequence.actLabel ?? '',
            storyFunction: sequence.storyFunction ?? '',
            synopsis: sequence.synopsis ?? input.entity.context,
            dramaticQuestion: sequence.dramaticQuestion ?? '',
            outcome: sequence.outcome ?? '',
            scriptExpansionReady: sequence.scriptExpansionReady ?? false,
            consequences: (sequence.consequences ?? []).map((entry) => ({
              cause: entry.cause,
              effect: entry.effect,
              label: entry.consequenceType.replace(/_/g, ' '),
              affectedEntityKeys: entry.affectedEntityKeys,
              threadKeys: entry.threadKeys,
            })),
            characterArcDeltas: sequence.characterArcDeltas ?? [],
            openLoops: sequence.openLoops ?? [],
            resolvedLoops: sequence.resolvedLoops ?? [],
            previousLabels: input.sequenceNavigation?.previousLabels ?? [],
            nextLabels: input.sequenceNavigation?.nextLabels ?? [],
          }
        : null,
      refinementHistory: buildWorldRefinementHistoryViewModel(input.entity.metadata),
    }
  }

  if (input.operator) {
    return {
      title: input.operator.label || input.operator.operatorType,
      kicker: 'Derived operator',
      summary: `Inputs: ${input.operator.inputEntityKeys.length}`,
      context: '',
      imageUrl: null,
      stats: [`${input.operator.inputEntityKeys.length} inputs`],
      sequence: null,
      refinementHistory: [],
    }
  }

  if (input.result) {
    return {
      title: input.result.title,
      kicker: 'Derived result',
      summary: input.result.summary,
      context: '',
      imageUrl: input.imageUrl ?? null,
      stats: [
        input.result.status,
        typeof input.result.metadata?.cinematicGraphKey === 'string' ? 'Linked cinematic' : 'Standalone result',
      ],
      sequence: null,
      refinementHistory: [],
    }
  }

  return null
}

export function activePreviewForTurn(turn: WorldPromptTurn | null): WorldPromptPlanPreview | null {
  const preview = turn?.metadata?.preview
  const parsed = worldPromptPlanPreviewSchema.safeParse(preview)
  return parsed.success ? parsed.data : null
}
