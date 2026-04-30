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
import { worldPromptEventPayloadSchema, worldPromptPlanPreviewSchema } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldOperator, WorldResult } from '../../domain/worldGraph.ts'
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
  counts: {
    entities: number
    relationships: number
    derived: number
    total: number
  }
}

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
  const palette =
    record.kind === 'entity'
      ? record.entity.nodeType === 'actor'
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
                  : ['rgba(251, 146, 60, 0.3)', 'rgba(194, 65, 12, 0.12)', 'rgba(254, 215, 170, 0.18)', '#fdba74']
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
    }
    if (new Date(event.createdAt).getTime() < new Date(draft.createdAt).getTime()) {
      draft.createdAt = event.createdAt
    }

    for (const entity of applied.worldEntities ?? []) {
      addUniqueKey(draft.entityKeys, entity.key)
    }
    for (const relationship of applied.worldRelationships ?? []) {
      addUniqueKey(draft.relationshipKeys, relationship.key)
      addUniqueKey(draft.entityKeys, relationship.sourceEntityKey)
      addUniqueKey(draft.entityKeys, relationship.targetEntityKey)
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
  return {
    usedTokens: boundedUsedTokens,
    tokenLimit,
    percentage,
    label: `${estimated ? '~' : ''}${compactUsed}/${compactLimit}`,
    title: `${estimated ? 'Approximate visible session text' : 'Recorded provider token usage'}: ${boundedUsedTokens.toLocaleString()} / ${tokenLimit.toLocaleString()} tokens`,
    estimated,
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
        const replaceOp = payload.op?.op === 'replace_entity' ? payload.op : null
        const upsertRelationshipOp = payload.op?.op === 'upsert_relationship' ? payload.op : null
        const updateRelationshipOp = payload.op?.op === 'update_relationship' ? payload.op : null
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
            entries.push({
              id: `${source.id}:entity-upsert:${entity.key}`,
              createdAt: source.event.createdAt,
              kind: 'entity_updated',
              label: `Updated ${entity.name}`,
              detail: upsertOp.payload.entity.context.trim()
                ? 'Expanded context'
                : (upsertOp.payload.entity.summary.trim() ? 'Updated summary' : labelForWorldEntity(entity.nodeType)),
              entityKey: entity.key,
              entityNodeType: entity.nodeType,
              turnLens,
            })
            continue
          }
          if (updateOp && entity.key === updateOp.payload.targetEntityKey) {
            const detailParts = [
              typeof updateOp.payload.changes.summary === 'string' ? 'Updated summary' : null,
              typeof updateOp.payload.changes.context === 'string' ? 'Expanded context' : null,
              updateOp.payload.changes.tags ? 'Updated tags' : null,
              updateOp.payload.changes.aliases ? 'Updated aliases' : null,
            ].filter(Boolean)
            entries.push({
              id: `${source.id}:entity-update:${entity.key}`,
              createdAt: source.event.createdAt,
              kind: 'entity_updated',
              label: `Updated ${entity.name}`,
              detail: detailParts.join(' · ') || labelForWorldEntity(entity.nodeType),
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
            entries.push({
              id: `${source.id}:relationship-upsert:${relationship.key}`,
              createdAt: source.event.createdAt,
              kind: 'relationship_updated',
              label: `Updated link between ${sourceName} and ${targetName}`,
              detail: relationship.notes.trim() || relationship.verb,
              relationshipKey: relationship.key,
              sourceLabel: sourceName,
              targetLabel: targetName,
              turnLens,
            })
            continue
          }
          if (updateRelationshipOp && relationship.key === updateRelationshipOp.payload.targetRelationshipKey) {
            const detailParts = [
              typeof updateRelationshipOp.payload.changes.notes === 'string' ? 'Updated relationship details' : null,
              typeof updateRelationshipOp.payload.changes.strength !== 'undefined' ? 'Adjusted strength' : null,
              typeof updateRelationshipOp.payload.changes.confidence !== 'undefined' ? 'Adjusted confidence' : null,
            ].filter(Boolean)
            entries.push({
              id: `${source.id}:relationship-update:${relationship.key}`,
              createdAt: source.event.createdAt,
              kind: 'relationship_updated',
              label: `Updated link between ${sourceName} and ${targetName}`,
              detail: detailParts.join(' · ') || relationship.notes.trim() || relationship.verb,
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
