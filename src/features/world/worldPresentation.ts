import type { CSSProperties } from 'react'

import type {
  PromptToWorldOp,
  WorldPromptDiagnosticFinding,
  WorldPromptEvent,
  WorldPromptMessage,
  WorldPromptPlannerFailure,
  WorldPromptPlannerProgress,
  WorldPromptPlanPreview,
  WorldPromptSuggestion,
  WorldPromptTurn,
} from '../../domain/worldPrompt.ts'
import { worldPromptEventPayloadSchema, worldPromptPlanPreviewSchema } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldOperator, WorldResult } from '../../domain/worldGraph.ts'
import { labelForWorldEntity } from '../../domain/worldGraphHelpers.ts'

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
  animateIn: boolean
}

export type WorldPromptTranscriptEntry =
  | { id: string; createdAt: string; kind: 'user_message' | 'assistant_message'; content: string; pending?: boolean }
  | { id: string; createdAt: string; kind: 'system_status'; label: string; detail?: string; tone?: 'normal' | 'error' }
  | { id: string; createdAt: string; kind: 'planner_progress'; label: string; detail?: string; phase: WorldPromptPlannerProgress['phase']; outline: string[]; done?: boolean }
  | { id: string; createdAt: string; kind: 'entity_created'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType'] }
  | { id: string; createdAt: string; kind: 'entity_updated'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType'] }
  | { id: string; createdAt: string; kind: 'entity_replaced'; label: string; detail?: string; entityKey: string; entityNodeType: WorldEntity['nodeType'] }
  | { id: string; createdAt: string; kind: 'relationship_created'; label: string; detail?: string; relationshipKey: string; sourceLabel: string; targetLabel: string }
  | { id: string; createdAt: string; kind: 'relationship_updated'; label: string; detail?: string; relationshipKey: string; sourceLabel: string; targetLabel: string }
  | { id: string; createdAt: string; kind: 'derived_result_created'; label: string; detail?: string; resultKey: string }
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

export type WorldInspectorViewModel = {
  title: string
  kicker: string
  summary: string
  context: string
  imageUrl: string | null
  stats: string[]
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
    && left.animateIn === right.animateIn
    && worldNodeRecordEqual(left.record, right.record)
  )
}

export function nodeShellStyle(record: WorldGraphNodeRecord, selected: boolean, dimmed: boolean): CSSProperties {
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
                : ['rgba(251, 146, 60, 0.3)', 'rgba(194, 65, 12, 0.12)', 'rgba(254, 215, 170, 0.18)', '#fdba74']
      : record.kind === 'operator'
        ? ['rgba(148, 163, 184, 0.28)', 'rgba(51, 65, 85, 0.12)', 'rgba(226, 232, 240, 0.16)', '#e2e8f0']
        : ['rgba(226, 232, 240, 0.24)', 'rgba(71, 85, 105, 0.12)', 'rgba(226, 232, 240, 0.16)', '#f8fafc']

  return {
    opacity: dimmed ? 0.2 : 1,
    borderColor: selected ? 'rgba(255,255,255,0.36)' : palette[0],
    background: `linear-gradient(180deg, rgba(9, 13, 20, 0.985), ${palette[1]})`,
    boxShadow: selected
      ? `0 0 0 1px rgba(255,255,255,0.08), 0 24px 54px rgba(5, 8, 14, 0.52), 0 0 24px ${palette[1]}, inset 0 1px 0 ${palette[2]}`
      : `0 18px 40px rgba(5, 8, 14, 0.34), inset 0 1px 0 ${palette[2]}`,
    ['--world-node-ring' as string]: palette[0],
    ['--world-node-glow' as string]: palette[1],
    ['--world-node-highlight' as string]: palette[2],
    ['--world-node-accent' as string]: palette[3],
  }
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
    case 'planning_entities':
      return 'Planning entities'
    case 'planning_relationships':
      return 'Planning relationships'
    case 'assembling_first_wave':
      return 'Assembling first wave'
    case 'finalizing_plan':
      return 'Finalizing plan'
  }
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
    .replace(/^Hosted prompt planning was unavailable\.\s*/i, '')
    .replace(/\s*Immediate JSON[^\n]*?(?:\.\s*|$)/i, '')
    .replace(/\s*oneOf is not permitted in operations\.?\s*/i, '')
    .replace(/\s*World prompt planner returned JSON that did not match the expected schema\.[\s\S]*$/i, '')
    .replace(/\s*Planner (?:output|response) validation failed\.[\s\S]*$/i, '')
    .replace(/\s*Cinematic planner response validation failed\.[\s\S]*$/i, '')
    .trim()
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
  let lastSuggestionSignature: string | null = null
  let lastAnswerSignature: string | null = null
  let lastDiagnosticSignature: string | null = null
  let lastPlannerProgressSignature: string | null = null

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
    const answerSignature = payload.answer ? `${source.event.turnId}:${payload.answer}` : null
    if (payload.answer && answerSignature !== lastAnswerSignature) {
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
              detail: payload.plannerProgress.message || payload.note || undefined,
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
            detail: payload.note ?? (payload.scope ? `${payload.scope.mode} scope` : ''),
          })
        }
        break
      case 'assistant_note':
        if (payload.note) {
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
        if (payload.note) {
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
      const signature = (entry?.suggestions ?? []).map((suggestion) => `${suggestion.id}:${suggestion.prompt}`).join('|')
      if (entry && signature && signature !== lastSuggestionSignature) {
        entries.push(entry)
        lastSuggestionSignature = signature
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
      detail: latestPlannerProgressMessage || latestDetail || 'The planner is resolving entities, relationships, and next moves.',
      statusLabel: latestPlannerStatus ?? 'Working',
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
}): WorldInspectorViewModel | null {
  if (input.entity) {
    return {
      title: input.entity.name,
      kicker: labelForWorldEntity(input.entity.nodeType),
      summary: input.entity.summary,
      context: input.entity.context,
      imageUrl: input.imageUrl ?? null,
      stats: [
        `${input.relationCount ?? 0} relationships`,
        `${input.usageCount ?? 0} usages`,
        input.entity.source === 'ai' ? 'AI-sourced' : 'Manual',
      ],
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
