import { z } from 'npm:zod@4'

import { buildDefaultDefinitionComponents, type DefinitionBase } from '../../../src/domain/graphcore.ts'
import {
  worldPromptApplyPreviewRequestSchema,
  worldPromptApplyPreviewResponseSchema,
  worldPromptCancelTurnRequestSchema,
  worldPromptCancelTurnResponseSchema,
  promptToWorldOpSchema,
  worldPromptCreateSessionRequestSchema,
  worldPromptCreateSessionResponseSchema,
  worldPromptDismissSuggestionRequestSchema,
  worldPromptDismissSuggestionResponseSchema,
  worldPromptEventPayloadSchema,
  worldPromptPlanPreviewSchema,
  worldPromptRefreshSuggestionsRequestSchema,
  worldPromptRefreshSuggestionsResponseSchema,
  worldPromptRecentTurnSummarySchema,
  worldPromptResolvedContextSchema,
  worldPromptSessionSchema,
  worldPromptSessionFocusStateSchema,
  worldPromptSessionMemoryStateSchema,
  worldPromptSuggestionRecordSchema,
  worldPromptSuggestionSchema,
  worldPromptStartTurnRequestSchema,
  worldPromptStartTurnResponseSchema,
  worldPromptTurnSchema,
  worldPromptRetrievalDiagnosticsSchema,
  worldPromptResolveOpRequestSchema,
  worldPromptResolveOpResponseSchema,
  type PromptToWorldOp,
  type WorldPromptClassification,
  type WorldPromptDiagnosticFinding,
  type WorldPromptEvent,
  type WorldPromptMessage,
  type WorldPromptPlanPreview,
  type WorldPromptPlannerFailure,
  type WorldPromptPlannerProgress,
  type WorldPromptPlanPreviewItem,
  type WorldPromptRetrievalDiagnostics,
  type WorldPromptResolvedContext,
  type WorldPromptScopeDecision,
  type WorldPromptSession,
  type WorldPromptSessionMemoryState,
  type WorldPromptSuggestion,
  type WorldPromptSuggestionRecord,
  type WorldPromptSnapshot,
  type WorldPromptStartTurnRequest,
  type WorldPromptTurn,
} from '../../../src/domain/worldPrompt.ts'
import {
  worldThreadSchema,
  type WorldThread,
} from '../../../src/domain/worldThread.ts'
import {
  worldEntitySchema,
  worldRelationshipSchema,
  worldViewSchema,
  type WorldEntity,
  type WorldEntityCreateInput,
  type WorldRelationship,
  type WorldRelationshipCreateInput,
  type WorldResult,
  type WorldOperator,
  type WorldGraphConnection,
  type WorldView,
} from '../../../src/domain/worldGraph.ts'
import {
  completeCreativeDescriptorOps,
  isPlaceholderLikeEntityName,
  promptAllowsPlaceholderCanon,
  type CreativeDescriptorIssue,
} from '../../../src/domain/worldPromptCreativeCompletion.ts'
import { analyzeWorldPromptEntityRequirements } from '../../../src/domain/worldPromptRequirements.ts'
import {
  plannerThreadActionSchema,
  plannerThreadCandidateSchema,
  preparePlannerThreadMutations,
} from '../../../src/domain/worldPromptThreads.ts'
import {
  reconcileAutoManagedWorldViews,
  type AutoManagedWorldViewOptions,
} from '../../../src/domain/worldViewDerivation.ts'
import {
  appendRefinementHistory,
  mergeCanonicalContext,
  mergeCanonicalText,
} from '../../../src/domain/worldPromptRefinement.ts'
import {
  worldBuildPlanResponseSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildPlanResponse,
  type WorldBuildStatusResponse,
} from '../../../src/domain/worldBuild.ts'
import { runOpenAiResponses } from './openai.ts'
import { normalizeStrictJsonSchema } from './structured-output.ts'

type SupabaseClient = any

type WorldPromptSessionRow = {
  id: string
  draft_id: string
  key: string
  title: string
  status: string
  is_active: boolean
  summary_memory: string | null
  last_context: Record<string, unknown> | null
  selected_root_entity_key: string | null
  selected_view_key: string | null
  model: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptTurnRow = {
  id: string
  session_id: string
  draft_id: string
  prompt: string
  status: string
  model: string | null
  resolved_context: Record<string, unknown> | null
  approval_state: string
  assistant_summary: string | null
  error_message: string | null
  response_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptMessageRow = {
  id: string
  session_id: string
  turn_id: string | null
  draft_id: string
  role: string
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldPromptEventRow = {
  id: string
  session_id: string
  turn_id: string
  draft_id: string
  sequence: number
  event_type: string
  op_id: string | null
  payload: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldPromptSuggestionRow = {
  id: string
  draft_id: string
  session_id: string
  turn_id: string | null
  thread_key: string | null
  label: string
  prompt: string
  kind: string
  style: string
  source: string
  summary: string | null
  estimated_node_count: number | null
  estimated_edge_count: number | null
  will_queue_images: boolean
  will_queue_cinematics: boolean
  state: string
  rank: number
  used_turn_id: string | null
  dismissed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldThreadRow = {
  id: string
  draft_id: string
  key: string
  title: string
  summary: string | null
  status: string
  priority: string
  linked_entity_keys: string[] | null
  source_turn_id: string | null
  last_turn_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldEntityRow = {
  id: string
  key: string
  name: string
  summary: string | null
  context: string | null
  node_type: WorldEntity['nodeType']
  aliases: string[] | null
  tags: string[] | null
  status: WorldEntity['status']
  thumbnail_asset_key: string | null
  linked_definition_key: string | null
  source: WorldEntity['source']
  custom_properties: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldRelationshipRow = {
  id: string
  key: string
  source_entity_id: string
  target_entity_id: string
  verb: string
  direction: WorldRelationship['direction']
  strength: number | null
  confidence: number | null
  source: WorldRelationship['source']
  notes: string | null
  state: WorldRelationship['state']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldViewRow = {
  id: string
  key: string
  name: string
  mode: WorldView['mode']
  filters: Record<string, unknown> | null
  search: string | null
  root_entity_key: string | null
  camera: Record<string, unknown> | null
  focus_depth: number | null
  show_suggestions: boolean | null
  show_labels: boolean | null
  show_derived_layer: boolean | null
  node_positions: Record<string, unknown> | null
  collapsed_state: Record<string, unknown> | null
  sort_mode: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldOperatorRow = {
  id: string
  key: string
  operator_type: WorldOperator['operatorType']
  input_entity_keys: string[] | null
  label: string | null
  status: WorldOperator['status']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldResultRow = {
  id: string
  key: string
  result_type: WorldResult['resultType']
  source_operator_key: string
  title: string
  summary: string | null
  preview_asset_key: string | null
  status: WorldResult['status']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldGraphConnectionRow = {
  id: string
  key: string
  source_node_key: string
  source_node_kind: WorldGraphConnection['sourceNodeKind']
  target_node_key: string
  target_node_kind: WorldGraphConnection['targetNodeKind']
  role: WorldGraphConnection['role']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const SESSION_SELECT = 'id, draft_id, key, title, status, is_active, summary_memory, last_context, selected_root_entity_key, selected_view_key, model, metadata, created_at, updated_at'
const TURN_SELECT = 'id, session_id, draft_id, prompt, status, model, resolved_context, approval_state, assistant_summary, error_message, response_id, metadata, created_at, updated_at'
const MESSAGE_SELECT = 'id, session_id, turn_id, draft_id, role, content, metadata, created_at'
const EVENT_SELECT = 'id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at'
const SUGGESTION_SELECT = 'id, draft_id, session_id, turn_id, thread_key, label, prompt, kind, style, source, summary, estimated_node_count, estimated_edge_count, will_queue_images, will_queue_cinematics, state, rank, used_turn_id, dismissed_at, metadata, created_at, updated_at'
const THREAD_SELECT = 'id, draft_id, key, title, summary, status, priority, linked_entity_keys, source_turn_id, last_turn_id, metadata, created_at, updated_at'
const WORLD_ENTITY_SELECT = 'id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at'
const WORLD_RELATIONSHIP_SELECT = 'id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at'
const WORLD_VIEW_SELECT = 'id, key, name, mode, filters, search, root_entity_key, camera, focus_depth, show_suggestions, show_labels, show_derived_layer, node_positions, collapsed_state, sort_mode, metadata, created_at, updated_at'
const WORLD_OPERATOR_SELECT = 'id, key, operator_type, input_entity_keys, label, status, metadata, created_at, updated_at'
const WORLD_RESULT_SELECT = 'id, key, result_type, source_operator_key, title, summary, preview_asset_key, status, metadata, created_at, updated_at'
const WORLD_GRAPH_CONNECTION_SELECT = 'id, key, source_node_key, source_node_kind, target_node_key, target_node_kind, role, metadata, created_at, updated_at'

type ReplaceWorldEntityRpcResult = {
  archivedEntityKey: string | null
  replacementEntityKey: string
  touchedRelationshipKeys: string[]
  touchedViewKeys: string[]
  touchedOperatorKeys: string[]
  touchedResultKeys: string[]
  touchedConnectionKeys: string[]
  touchedThreadKeys: string[]
}

const plannerIdeaSchema = worldPromptSuggestionSchema.extend({
  source: z.enum(['thread', 'wave2', 'repair', 'analysis', 'advisory']).default('wave2'),
})

const worldPromptPlannerSchema = z.object({
  classification: z.enum([
    'graphable_direct',
    'graphable_broad',
    'graphable_plan_only',
    'advisory_question',
    'graph_diagnosis',
    'refinement_only',
    'not_graphable',
    'contradictory_or_low_confidence',
  ]).optional(),
  assistantSummary: z.string().default(''),
  answer: z.string().default(''),
  answerMode: z.enum(['answer_only', 'answer_plus_options', 'answer_plus_preview']).optional(),
  operations: z.array(promptToWorldOpSchema).default([]),
  wave1Ops: z.array(promptToWorldOpSchema).default([]),
  wave2Ideas: z.array(plannerIdeaSchema).default([]),
  optionalIdeas: z.array(plannerIdeaSchema).default([]),
  threadActions: z.array(plannerThreadActionSchema).default([]),
  threadCandidates: z.array(plannerThreadCandidateSchema).default([]),
  suggestionCandidates: z.array(plannerIdeaSchema).default([]),
  optionCandidates: z.array(plannerIdeaSchema).default([]),
  diagnosticFindings: z.array(z.object({
    id: z.string(),
    findingType: z.enum([
      'underconnected_entity',
      'isolated_world_area',
      'weak_context',
      'relationship_gap',
      'thread_gap',
      'world_imbalance',
    ]),
    title: z.string(),
    summary: z.string().default(''),
    targetKeys: z.array(z.string()).default([]),
    severity: z.enum(['low', 'medium', 'high']).default('medium'),
  })).default([]),
})

type PlannerMode = 'direct_build' | 'refinement' | 'advisory_diagnosis'

const directBuildPlannerSchema = worldPromptPlannerSchema.pick({
  classification: true,
  assistantSummary: true,
  wave1Ops: true,
  threadActions: true,
  threadCandidates: true,
  suggestionCandidates: true,
})

const refinementPlannerSchema = worldPromptPlannerSchema.pick({
  classification: true,
  assistantSummary: true,
  wave1Ops: true,
  threadActions: true,
  threadCandidates: true,
  suggestionCandidates: true,
})

const advisoryDiagnosisPlannerSchema = worldPromptPlannerSchema.pick({
  classification: true,
  assistantSummary: true,
  answer: true,
  answerMode: true,
  wave1Ops: true,
  threadActions: true,
  suggestionCandidates: true,
  optionCandidates: true,
  diagnosticFindings: true,
  threadCandidates: true,
})

const replaceWorldEntityRpcResultSchema = z.object({
  archivedEntityKey: z.string().nullable().default(null),
  replacementEntityKey: z.string(),
  touchedRelationshipKeys: z.array(z.string()).default([]),
  touchedViewKeys: z.array(z.string()).default([]),
  touchedOperatorKeys: z.array(z.string()).default([]),
  touchedResultKeys: z.array(z.string()).default([]),
  touchedConnectionKeys: z.array(z.string()).default([]),
  touchedThreadKeys: z.array(z.string()).default([]),
})

type PromptScopeCaps = {
  entityOps: number
  relationshipOps: number
  existingEntityModificationOps: number
  queueOps: number
  derivedResultOps: number
}

const DIRECT_SCOPE_CAPS: PromptScopeCaps = {
  entityOps: 10,
  relationshipOps: 16,
  existingEntityModificationOps: 2,
  queueOps: 2,
  derivedResultOps: 1,
}

const STAGED_SCOPE_CAPS: PromptScopeCaps = {
  entityOps: 5,
  relationshipOps: 6,
  existingEntityModificationOps: 2,
  queueOps: 2,
  derivedResultOps: 1,
}

const SUGGESTION_DRIVEN_SCOPE_CAPS: PromptScopeCaps = {
  entityOps: 4,
  relationshipOps: 6,
  existingEntityModificationOps: 2,
  queueOps: 1,
  derivedResultOps: 1,
}

function isTruthyEnv(value: string | undefined | null) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.trim().toLowerCase())
}

function shouldDebugWorldPromptOpenAi() {
  return isTruthyEnv(Deno.env.get('WORLD_PROMPT_DEBUG_OPENAI'))
    || isTruthyEnv(Deno.env.get('WORLD_BUILD_DEBUG_OPENAI'))
}

function previewJson(value: unknown, maxLength = 4000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...<truncated>`
}

function extractJsonBlock(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```([\s\S]*?)```/i)
    if (!fencedMatch?.[1]) return null

    try {
      return JSON.parse(fencedMatch[1].trim()) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

function stripInternalPlannerDiagnostics(text: string) {
  if (!text.trim()) return ''
  return text
    .replace(/^Hosted prompt planning was unavailable\.\s*/i, '')
    .replace(/\s*Immediate JSON[^\n]*?(?:\.\s*|$)/i, '')
    .replace(/^oneOf is not permitted in operations\.?\s*/i, '')
    .replace(/\s*World prompt planner returned JSON that did not match the expected schema\.[\s\S]*$/i, '')
    .replace(/\s*Planner (?:output|response) validation failed\.[\s\S]*$/i, '')
    .replace(/\s*Cinematic planner response validation failed\.[\s\S]*$/i, '')
    .trim()
}

function sanitizeSuggestionText(value: unknown) {
  if (typeof value !== 'string') return ''
  return stripInternalPlannerDiagnostics(value).replace(/\s+/g, ' ').trim()
}

function sanitizeSuggestionRecord(input: {
  id: string
  label: unknown
  prompt: unknown
  summary: unknown
  kind: WorldPromptSuggestion['kind']
  style: WorldPromptSuggestion['style']
  source: WorldPromptSuggestion['source']
  threadKey?: string | null
  estimatedNodeCount?: number | null
  estimatedEdgeCount?: number | null
  willQueueImages?: boolean | null
  willQueueCinematics?: boolean | null
  uiKind?: WorldPromptSuggestion['uiKind']
  executionMode?: WorldPromptSuggestion['executionMode']
  actionMode?: WorldPromptSuggestion['actionMode']
  applyPolicy?: WorldPromptSuggestion['applyPolicy']
  targetEntityKeys?: string[]
  targetThreadKeys?: string[]
  focusLayer?: WorldPromptSuggestion['focusLayer']
  retrievalHint?: string
  generatedReason?: string
  generatedFromTurnId?: string | null
}) {
  const label = sanitizeSuggestionText(input.label)
  const prompt = sanitizeSuggestionText(input.prompt)
  const summary = sanitizeSuggestionText(input.summary)
  const resolvedLabel = label || summary
  const resolvedPrompt = prompt || ''

  if (!resolvedLabel || !resolvedPrompt) {
    return null
  }

  return {
    id: input.id,
    label: resolvedLabel,
    prompt: resolvedPrompt,
    kind: input.kind,
    style: input.style,
    source: input.source,
    threadKey: input.threadKey ?? null,
    summary,
    estimatedNodeCount: input.estimatedNodeCount ?? 0,
    estimatedEdgeCount: input.estimatedEdgeCount ?? 0,
    willQueueImages: input.willQueueImages ?? false,
    willQueueCinematics: input.willQueueCinematics ?? false,
    uiKind: input.uiKind,
    executionMode: input.executionMode,
    actionMode: input.actionMode,
    applyPolicy: input.applyPolicy,
    targetEntityKeys: (input.targetEntityKeys ?? []).slice(0, 8),
    targetThreadKeys: (input.targetThreadKeys ?? []).slice(0, 4),
    focusLayer: input.focusLayer,
    retrievalHint: input.retrievalHint ? sanitizeSuggestionText(input.retrievalHint) : '',
    generatedReason: input.generatedReason ? sanitizeSuggestionText(input.generatedReason) : undefined,
    generatedFromTurnId: input.generatedFromTurnId ?? undefined,
  } satisfies WorldPromptSuggestion
}

function normalizePlannerOperation(rawOp: unknown, index: number) {
  if (!rawOp || typeof rawOp !== 'object') {
    return rawOp
  }

  const record = { ...(rawOp as Record<string, unknown>) }
  const op = typeof record.op === 'string' ? record.op : null
  if (!op) {
    return record
  }

  if (typeof record.id !== 'string' || !record.id.trim()) {
    record.id = `planner-op-${index + 1}-${slugify(op)}`
  }

  if (record.payload && typeof record.payload === 'object') {
    return record
  }

  switch (op) {
    case 'upsert_entity':
      if (record.entity && typeof record.entity === 'object') {
        record.payload = {
          targetEntityKey: typeof record.targetEntityKey === 'string' ? record.targetEntityKey : null,
          entity: record.entity,
        }
      }
      break
    case 'update_entity':
      if (typeof record.targetEntityKey === 'string') {
        record.payload = {
          targetEntityKey: record.targetEntityKey,
          changes: record.changes && typeof record.changes === 'object' ? record.changes : {},
        }
      }
      break
    case 'replace_entity':
      if (typeof record.targetEntityKey === 'string') {
        record.payload = {
          targetEntityKey: record.targetEntityKey,
          replacementMode: record.replacementMode === 'existing' ? 'existing' : 'create',
          replacementEntity: record.replacementEntity && typeof record.replacementEntity === 'object'
            ? record.replacementEntity
            : record.entity && typeof record.entity === 'object'
              ? record.entity
              : null,
          replacementEntityKey: typeof record.replacementEntityKey === 'string' ? record.replacementEntityKey : null,
          transferRelationships: record.transferRelationships ?? true,
          transferGraphConnections: record.transferGraphConnections ?? true,
          transferDerivedResults: record.transferDerivedResults ?? true,
          archiveOldEntity: record.archiveOldEntity ?? true,
          deleteOldEntity: record.deleteOldEntity ?? false,
          reason: typeof record.reason === 'string' ? record.reason : '',
        }
      }
      break
    case 'upsert_relationship': {
      const relationship = record.relationship && typeof record.relationship === 'object'
        ? record.relationship
        : {
            sourceEntityKey: typeof record.sourceEntityKey === 'string' ? record.sourceEntityKey : null,
            targetEntityKey: typeof record.targetEntityKey === 'string' ? record.targetEntityKey : null,
            sourceRef: record.sourceRef,
            targetRef: record.targetRef,
            verb: record.verb,
            direction: record.direction,
            strength: record.strength,
            confidence: record.relationshipConfidence ?? record.confidence,
            source: record.source,
            notes: record.notes,
            state: record.state,
            metadata: record.relationshipMetadata ?? record.metadata,
          }
      record.payload = {
        targetRelationshipKey: typeof record.targetRelationshipKey === 'string' ? record.targetRelationshipKey : null,
        relationship,
      }
      break
    }
    case 'update_relationship':
      if (typeof record.targetRelationshipKey === 'string') {
        record.payload = {
          targetRelationshipKey: record.targetRelationshipKey,
          changes: record.changes && typeof record.changes === 'object'
            ? record.changes
            : {
                sourceEntityKey: record.sourceEntityKey,
                targetEntityKey: record.targetEntityKey,
                verb: record.verb,
                direction: record.direction,
                strength: record.strength,
                confidence: record.relationshipConfidence ?? record.confidence,
                source: record.source,
                notes: record.notes,
                state: record.state,
                metadata: record.relationshipMetadata ?? record.metadata,
              },
        }
      }
      break
    case 'create_derived_result':
      record.payload = {
        sourceEntityKey: record.sourceEntityKey,
        targetEntityKey: record.targetEntityKey,
        operatorType: record.operatorType,
        title: record.title,
        summary: record.summary,
        metadata: record.metadata,
      }
      break
    case 'queue_image_generation':
      record.payload = {
        targetEntityKey: record.targetEntityKey,
        definitionKey: record.definitionKey ?? null,
        prompt: record.prompt,
        reason: record.reason,
        queueType: 'image_generation',
      }
      break
    case 'queue_cinematic_generation':
      record.payload = {
        prompt: record.prompt,
        title: record.title,
        relatedEntityKeys: Array.isArray(record.relatedEntityKeys) ? record.relatedEntityKeys : [],
        resultKey: record.resultKey ?? null,
        queueType: 'cinematic_generation',
      }
      break
    case 'assistant_note':
      if (typeof record.message === 'string' || typeof record.note === 'string' || typeof record.text === 'string') {
        record.payload = {
          message: typeof record.message === 'string'
            ? record.message
            : typeof record.note === 'string'
              ? record.note
              : String(record.text),
        }
      }
      break
    default:
      break
  }

  return record
}

function normalizePlannerJson(raw: Record<string, unknown>) {
  const normalized = { ...raw }
  const normalizeOpArray = (value: unknown) => Array.isArray(value)
    ? value.map((entry, index) => normalizePlannerOperation(entry, index))
    : value

  normalized.operations = normalizeOpArray(normalized.operations)
  normalized.wave1Ops = normalizeOpArray(normalized.wave1Ops)

  return normalized
}

type PromptScopeCounts = WorldPromptScopeDecision['counts']
type PromptClassificationMode = WorldPromptClassification
type PromptScopeMode = 'direct' | 'preview' | 'blocked' | 'advisory'

type PromptExecutionClassification = {
  classification: PromptClassificationMode
  mode: PromptScopeMode
  scope: WorldPromptScopeDecision
  selectedOps: PromptToWorldOp[]
  deferredOps: PromptToWorldOp[]
  suggestions: WorldPromptSuggestion[]
  note: string
  answer: string
  answerMode: 'answer_only' | 'answer_plus_options' | 'answer_plus_preview'
  diagnosticFindings: WorldPromptDiagnosticFinding[]
  preview: WorldPromptPlanPreview | null
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entry'
}

function normalizeName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
}

function suggestionTextForComparison(value: string) {
  return stripInternalPlannerDiagnostics(value)
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function suggestionLooksLikePromptEcho(suggestionPrompt: string, sourcePrompt: string) {
  const suggestionText = suggestionTextForComparison(suggestionPrompt)
  const sourceText = suggestionTextForComparison(sourcePrompt)
  if (!suggestionText || !sourceText) return false
  if (suggestionText === sourceText) return true
  if (suggestionText.length >= 20 && sourceText.includes(suggestionText)) return true
  if (sourceText.length >= 20 && suggestionText.includes(sourceText)) return true
  const similarity = diceCoefficient(normalizeName(suggestionText), normalizeName(sourceText))
  return similarity >= 0.9
}

function suggestionIsActionable(suggestion: Pick<WorldPromptSuggestion, 'label' | 'prompt' | 'summary' | 'kind'>, sourcePrompt?: string | null) {
  const label = stripInternalPlannerDiagnostics(suggestion.label).replace(/\s+/g, ' ').trim()
  const prompt = stripInternalPlannerDiagnostics(suggestion.prompt).replace(/\s+/g, ' ').trim()
  const summary = stripInternalPlannerDiagnostics(suggestion.summary ?? '').replace(/\s+/g, ' ').trim()
  if (!label || !prompt) return false
  if (!/[a-z0-9]/i.test(prompt)) return false
  if (label.toLowerCase() === 'plan only' && suggestion.kind === 'plan_only' && !summary) return false
  if (sourcePrompt && suggestionLooksLikePromptEcho(prompt, sourcePrompt)) return false
  return true
}

function buildNameVariants(value: string) {
  const normalized = normalizeName(value)
  if (!normalized) return []
  const stripped = normalized
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/^(king|queen|lord|lady|prince|princess|duke|duchess|emperor|empress|captain|chief|master)\s+/i, '')
    .replace(/^(house|kingdom|realm|faction|order|circle|guild|clan|empire|city|village|fortress)\s+/i, '')
    .trim()
  return Array.from(new Set([normalized, stripped].filter(Boolean)))
}

type PromptIntentHint = 'graph_build' | 'advisory_question' | 'graph_diagnosis' | 'refinement_only'
type PlannerFocusLayer = 'actor' | 'group' | 'place' | 'concept' | 'event' | 'object' | 'general'
type WorldPromptContinuityMode = 'follow_up' | 'topic_shift' | 'fresh_question'
type WorldPromptResolvedMode = WorldPromptResolvedContext['resolvedMode']
type WorldPromptResolvedIntent = WorldPromptResolvedContext['resolvedIntent']
type WorldPromptResolvedFocus = WorldPromptResolvedContext['resolvedFocus']

type WorldPromptRetrievalIntent = {
  promptIntent: PromptIntentHint
  plannerMode: PlannerMode
  focusLayer: PlannerFocusLayer
  continuityMode: WorldPromptContinuityMode
  resolvedIntent: WorldPromptResolvedIntent
  resolvedFocus: WorldPromptResolvedFocus
  resolvedMode: WorldPromptResolvedMode
  asksForSuggestions: boolean
  mentionedEntityKeys: string[]
  anchorEntityKeys: string[]
  anchorThreadKeys: string[]
}

type WorldPromptSearchHit = {
  resourceType: 'entity' | 'relationship' | 'thread'
  resourceKey: string
  score: number
  entityKey: string | null
  sourceEntityKey: string | null
  targetEntityKey: string | null
  title: string
  summary: string
  linkedEntityKeys: string[]
}

type WorldPromptRetrievalPacket = {
  promptIntent: PromptIntentHint
  plannerMode: PlannerMode
  focusLayer: PlannerFocusLayer
  continuityMode: WorldPromptContinuityMode
  resolvedIntent: WorldPromptResolvedIntent
  resolvedFocus: WorldPromptResolvedFocus
  resolvedMode: WorldPromptResolvedMode
  selectedRootEntity: ReturnType<typeof summarizeEntityForPlanner> | null
  selectedView: {
    key: string
    rootEntityKey: string | null
    mode: WorldView['mode']
    search: string
  } | null
  selectedThread: {
    key: string
    title: string
    summary: string
    linkedEntityKeys: string[]
    priority: WorldThread['priority']
  } | null
  relevantEntities: Array<ReturnType<typeof summarizeEntityForPlanner>>
  relevantRelationships: Array<ReturnType<typeof summarizeRelationshipForPlanner>>
  relevantThreads: Array<{
    key: string
    title: string
    summary: string
    priority: WorldThread['priority']
    linkedEntityKeys: string[]
  }>
  graphSignals: {
    entityCount: number
    relationshipCount: number
    threadCount: number
    entityTypeCounts: Record<string, number>
    anchorCount: number
    ftsHitCount: number
  }
  recentMessages: Array<{ role: WorldPromptMessage['role']; content: string }>
  sessionMemory: {
    conversationMemory: string
    state: WorldPromptSessionMemoryState
    focusMemory: {
      selectedRootEntityKey: string | null
      selectedViewKey: string | null
      selectedThreadKey: string | null
      recentEntityKeys: string[]
      recentThreadKeys: string[]
      continuityMode: WorldPromptContinuityMode | null
      focusLayer: PlannerFocusLayer | null
    }
    worldMemory: {
      retrievedEntityKeys: string[]
      retrievedThreadKeys: string[]
    }
  }
  diagnostics: WorldPromptRetrievalDiagnostics
  answerContext: {
    entityKeys: string[]
    threadKeys: string[]
  }
  mutationContext: {
    entityKeys: string[]
    threadKeys: string[]
  }
  backgroundContext: {
    entityKeys: string[]
    threadKeys: string[]
  }
}

function promptHasExplicitCorrectionLanguage(prompt: string) {
  return /\b(actually|should be|wrong type|replace|correct(?:ion)?|mistaken|instead of)\b/i.test(prompt)
}

function looksLikeGraphDiagnosisPrompt(prompt: string) {
  return /\b(what(?:'s| is)\s+(?:weak|missing|underdeveloped)|weakness(?:es)?|gap(?:s)?|what should i add|underconnected|what is this world missing|what are we missing|diagnos(?:e|is)|audit)\b/i.test(prompt)
}

function looksLikeQuestionPrompt(prompt: string) {
  return /\?/.test(prompt) || /^(what|why|how|should|could|would|is|are|do|does|can)\b/i.test(prompt.trim())
}

function detectPromptIntent(prompt: string, snapshot: WorldPromptSnapshot) {
  const trimmed = prompt.trim()
  if (!trimmed) return 'graph_build' satisfies PromptIntentHint
  if (looksLikeGraphDiagnosisPrompt(trimmed)) return 'graph_diagnosis' satisfies PromptIntentHint
  if (looksLikeQuestionPrompt(trimmed)) return 'advisory_question' satisfies PromptIntentHint
  const hasExistingEntityMention = snapshot.worldEntities.some((entity) => {
    const variants = [entity.name, ...entity.aliases].flatMap((value) => buildNameVariants(value))
    return variants.some((variant) => variant && normalizeName(trimmed).includes(variant))
  })
  const hasCorrectionLanguage = promptHasExplicitCorrectionLanguage(trimmed)
  return hasExistingEntityMention && !hasCorrectionLanguage
    ? 'refinement_only'
    : 'graph_build'
}

function looksLikeContextHeavyPrompt(prompt: string) {
  return /\b(backstory|history|context|details|dossier|motive|motivation|secret|hidden|shame|contradiction|politic(?:al|ally)|schem(?:e|ing)|religio(?:n|us)|friction|tension|reputation|public role|private truth|implication)\b/i.test(prompt)
}

function inferPlannerFocusLayer(prompt: string): PlannerFocusLayer {
  if (/\b(location|locations|place|places|city|cities|region|regions|district|districts|site|sites|landmark|landmarks|territory|territories|arena|arenas)\b/i.test(prompt)) {
    return 'place'
  }
  if (/\b(character|characters|person|people|hero|heroes|villain|villains|love interest|protagonist|antagonist|ruler|heir)\b/i.test(prompt)) {
    return 'actor'
  }
  if (/\b(group|groups|faction|factions|house|houses|guild|guilds|order|orders|religion|religious order|cult|cults|regime|regimes)\b/i.test(prompt)) {
    return 'group'
  }
  if (/\b(concept|concepts|lore|myth|myths|belief|beliefs|law|laws|curse|curses|magic|prophecy|prophecies|rule|rules)\b/i.test(prompt)) {
    return 'concept'
  }
  if (/\b(event|events|war|wars|rebellion|rebellions|ritual|rituals|battle|battles|history|catastrophe|catastrophes|coronation)\b/i.test(prompt)) {
    return 'event'
  }
  if (/\b(object|objects|item|items|artifact|artifacts|weapon|weapons|relic|relics|device|devices)\b/i.test(prompt)) {
    return 'object'
  }
  return 'general'
}

function preferredNodeTypesForFocusLayer(layer: PlannerFocusLayer): WorldEntity['nodeType'][] {
  switch (layer) {
    case 'place':
      return ['place', 'group', 'concept', 'event', 'actor', 'object']
    case 'actor':
      return ['actor', 'group', 'place', 'concept', 'event', 'object']
    case 'group':
      return ['group', 'actor', 'place', 'concept', 'event', 'object']
    case 'concept':
      return ['concept', 'group', 'event', 'place', 'actor', 'object']
    case 'event':
      return ['event', 'place', 'group', 'actor', 'concept', 'object']
    case 'object':
      return ['object', 'concept', 'group', 'actor', 'place', 'event']
    default:
      return ['actor', 'group', 'place', 'concept', 'event', 'object']
  }
}

function advisoryPromptAsksForSuggestions(prompt: string) {
  return /\b(what do you suggest|what would you suggest|suggest|ideas?|options?|shall we add|should we add|what next|recommend)\b/i.test(prompt)
}

function promptExplicitlyRequestsMutation(prompt: string) {
  return /\b(add|create|make|introduce|expand|grow|connect|link|update|revise|change|mutate|apply|put it in the graph|add it now|implement)\b/i.test(prompt)
}

function promptExplicitlyRequestsNoMutation(prompt: string) {
  return /\b(plan only|preview only|do not apply|don't apply|answer only|advisory only|do not mutate|don't mutate|no mutations?)\b/i.test(prompt)
}

function resolveWorldPromptTurnMode(input: {
  prompt: string
  promptIntent: PromptIntentHint
  selectedSuggestion?: Pick<WorldPromptSuggestionRecord, 'actionMode' | 'executionMode' | 'kind'> | null
}) {
  if (promptExplicitlyRequestsNoMutation(input.prompt)) {
    return 'answer_only' satisfies WorldPromptResolvedMode
  }
  if (input.selectedSuggestion?.actionMode) {
    if (input.selectedSuggestion.executionMode === 'plan_only' || input.selectedSuggestion.kind === 'plan_only') {
      return 'answer_only' satisfies WorldPromptResolvedMode
    }
    return input.selectedSuggestion.actionMode === 'preview_first_wave'
      ? 'apply_compact_wave'
      : input.selectedSuggestion.actionMode
  }
  if (input.promptIntent === 'advisory_question' || input.promptIntent === 'graph_diagnosis') {
    return promptExplicitlyRequestsMutation(input.prompt)
      ? 'apply_compact_wave'
      : 'answer_only'
  }
  return 'apply_compact_wave' satisfies WorldPromptResolvedMode
}

function resolveWorldPromptTurnIntent(promptIntent: PromptIntentHint) {
  switch (promptIntent) {
    case 'advisory_question':
      return 'advisory' satisfies WorldPromptResolvedIntent
    case 'graph_diagnosis':
      return 'diagnosis' satisfies WorldPromptResolvedIntent
    case 'refinement_only':
      return 'refinement' satisfies WorldPromptResolvedIntent
    default:
      return 'graph_build' satisfies WorldPromptResolvedIntent
  }
}

function buildWorldPromptRetrievalIntent(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  selectedSuggestion?: WorldPromptSuggestionRecord | null
  selectedSuggestionId?: string | null
  selectedRootEntityKey?: string | null
  selectedThreadKey?: string | null
  selectedViewKey?: string | null
}) {
  const promptIntent = detectPromptIntent(input.prompt, input.snapshot)
  const plannerMode = resolvePlannerMode({
    prompt: input.prompt,
    snapshot: input.snapshot,
    selectedSuggestionId: input.selectedSuggestionId,
  })
  const focusLayer = input.selectedSuggestion?.focusLayer ?? inferPlannerFocusLayer(input.prompt)
  const mentionedEntityKeys = extractMentionedEntityKeys(input.prompt, input.snapshot)
  const selectedView = input.selectedViewKey
    ? input.snapshot.worldViews.find((view) => view.key === input.selectedViewKey) ?? null
    : null
  const selectedThread = input.selectedThreadKey
    ? input.snapshot.worldThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    : null
  const explicitAnchors = new Set<string>([
    ...mentionedEntityKeys,
    ...((input.selectedSuggestion?.targetEntityKeys ?? []).slice(0, 6)),
    ...(input.selectedRootEntityKey ? [input.selectedRootEntityKey] : []),
    ...(selectedView?.rootEntityKey ? [selectedView.rootEntityKey] : []),
    ...(selectedThread?.linkedEntityKeys ?? []),
    ...((input.sessionMemoryState.activeFocus.entityKeys ?? []).slice(0, 2)),
  ])
  const explicitThreadAnchors = new Set<string>([
    ...(input.selectedThreadKey ? [input.selectedThreadKey] : []),
    ...(input.selectedSuggestion?.threadKey ? [input.selectedSuggestion.threadKey] : []),
    ...((input.selectedSuggestion?.targetThreadKeys ?? []).slice(0, 4)),
  ])
  const recentEntityKeys = new Set(input.sessionMemoryState.frontierEntityKeys ?? [])
  const overlapCount = Array.from(explicitAnchors).filter((key) => recentEntityKeys.has(key)).length
  const asksForSuggestions = advisoryPromptAsksForSuggestions(input.prompt)
  const activeFocusLayer = input.sessionMemoryState.activeFocus.focusLayer
  const activeFocusOverlap = (input.sessionMemoryState.activeFocus.entityKeys ?? [])
    .filter((key) => explicitAnchors.has(key)).length
  const explicitPivot = (
    explicitAnchors.size === 0
    && explicitThreadAnchors.size === 0
    && Boolean(activeFocusLayer)
    && activeFocusLayer !== focusLayer
  )

  let continuityMode: WorldPromptContinuityMode
  if (promptIntent === 'advisory_question' || promptIntent === 'graph_diagnosis') {
    if (explicitAnchors.size === 0 && explicitThreadAnchors.size === 0 && !input.selectedRootEntityKey && !input.selectedThreadKey) {
      continuityMode = 'fresh_question'
    } else if (
      explicitAnchors.size === 0
      && recentEntityKeys.size > 0
      && overlapCount === 0
      && (asksForSuggestions || activeFocusLayer !== focusLayer || explicitPivot)
    ) {
      continuityMode = 'topic_shift'
    } else {
      continuityMode = explicitAnchors.size > 0 || explicitThreadAnchors.size > 0 || overlapCount > 0
        ? 'follow_up'
        : 'fresh_question'
    }
  } else {
    continuityMode = explicitPivot && activeFocusOverlap === 0
      ? 'topic_shift'
      : explicitAnchors.size > 0 || explicitThreadAnchors.size > 0 || overlapCount > 0 || input.selectedRootEntityKey || input.selectedThreadKey
        ? 'follow_up'
        : 'fresh_question'
  }

  const resolvedIntent = resolveWorldPromptTurnIntent(promptIntent)
  const resolvedMode = resolveWorldPromptTurnMode({
    prompt: input.prompt,
    promptIntent,
    selectedSuggestion: input.selectedSuggestion ?? null,
  })
  const resolvedFocus =
    continuityMode === 'topic_shift'
      ? 'pivot_focus'
      : explicitAnchors.size === 0 && explicitThreadAnchors.size === 0 && input.sessionMemoryState.backgroundFocus
        ? 'background_focus'
        : 'current_focus'

  return {
    promptIntent,
    plannerMode,
    focusLayer,
    continuityMode,
    resolvedIntent,
    resolvedFocus,
    resolvedMode,
    asksForSuggestions,
    mentionedEntityKeys,
    anchorEntityKeys: Array.from(explicitAnchors),
    anchorThreadKeys: Array.from(explicitThreadAnchors),
  } satisfies WorldPromptRetrievalIntent
}

function resolvePlannerMode(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  selectedSuggestionId?: string | null
}) {
  const intent = detectPromptIntent(input.prompt, input.snapshot)
  if (input.selectedSuggestionId && intent === 'graph_build') {
    return 'direct_build' satisfies PlannerMode
  }
  if (intent === 'advisory_question' || intent === 'graph_diagnosis') {
    return 'advisory_diagnosis' satisfies PlannerMode
  }
  if (intent === 'refinement_only') {
    return 'refinement' satisfies PlannerMode
  }
  return 'direct_build' satisfies PlannerMode
}

function relationCountByEntity(snapshot: WorldPromptSnapshot) {
  const counts = new Map<string, number>()
  for (const relationship of snapshot.worldRelationships) {
    counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
    counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
  }
  return counts
}

function buildGraphDiagnosticFindings(input: {
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
  selectedRootEntityKey?: string | null
}) {
  const findings: WorldPromptDiagnosticFinding[] = []
  const relationCounts = relationCountByEntity(input.snapshot)
  const activeEntities = input.snapshot.worldEntities.filter((entity) => entity.status !== 'archived')
  const focusEntity = input.selectedRootEntityKey
    ? activeEntities.find((entity) => entity.key === input.selectedRootEntityKey) ?? null
    : null

  const weakContextEntities = activeEntities
    .filter((entity) => entity.nodeType !== 'object' && entity.context.trim().length < 90)
    .sort((left, right) => (relationCounts.get(right.key) ?? 0) - (relationCounts.get(left.key) ?? 0))
    .slice(0, 2)

  for (const entity of weakContextEntities) {
    findings.push({
      id: `finding-context-${entity.key}`,
      findingType: 'weak_context',
      title: `${entity.name} needs richer context`,
      summary: `${entity.name} is present in the world, but its long-form context is still thin enough that motives, pressure, or hidden truth are unclear.`,
      targetKeys: [entity.key],
      severity: (relationCounts.get(entity.key) ?? 0) >= 2 ? 'high' : 'medium',
    })
  }

  const isolatedEntity = activeEntities
    .filter((entity) => ['actor', 'group', 'place', 'concept', 'event'].includes(entity.nodeType))
    .find((entity) => (relationCounts.get(entity.key) ?? 0) === 0)
  if (isolatedEntity) {
    findings.push({
      id: `finding-isolated-${isolatedEntity.key}`,
      findingType: isolatedEntity.nodeType === 'group' || isolatedEntity.nodeType === 'place' ? 'isolated_world_area' : 'underconnected_entity',
      title: `${isolatedEntity.name} is disconnected`,
      summary: `${isolatedEntity.name} does not currently anchor any visible relationships, which makes it harder for the world graph to express why it matters.`,
      targetKeys: [isolatedEntity.key],
      severity: 'high',
    })
  }

  const openPrimaryThread = input.snapshot.worldThreads.find((thread) => (
    thread.status === 'open'
    && (input.selectedThreadKey ? thread.key === input.selectedThreadKey : thread.priority === 'primary')
  )) ?? input.snapshot.worldThreads.find((thread) => thread.status === 'open' && thread.priority === 'primary')
  if (openPrimaryThread) {
    findings.push({
      id: `finding-thread-${openPrimaryThread.key}`,
      findingType: 'thread_gap',
      title: `${openPrimaryThread.title} needs its next beat`,
      summary: openPrimaryThread.summary || 'A primary unresolved thread exists, but it is not yet grounded in a fresh consequence or next move.',
      targetKeys: openPrimaryThread.linkedEntityKeys,
      severity: 'medium',
    })
  }

  const typeCounts = {
    actor: activeEntities.filter((entity) => entity.nodeType === 'actor').length,
    group: activeEntities.filter((entity) => entity.nodeType === 'group').length,
    place: activeEntities.filter((entity) => entity.nodeType === 'place').length,
    concept: activeEntities.filter((entity) => entity.nodeType === 'concept').length,
    event: activeEntities.filter((entity) => entity.nodeType === 'event').length,
  }
  if (typeCounts.actor === 0 || typeCounts.place === 0 || typeCounts.group === 0) {
    const missingLabels = [
      typeCounts.actor === 0 ? 'characters' : null,
      typeCounts.group === 0 ? 'groups' : null,
      typeCounts.place === 0 ? 'places' : null,
    ].filter(Boolean)
    findings.push({
      id: 'finding-world-balance-foundation',
      findingType: 'world_imbalance',
      title: 'The world lacks a core layer',
      summary: `The current world is still missing ${missingLabels.join(', ')}, so the graph has limited structural range for conflict and context.`,
      targetKeys: focusEntity ? [focusEntity.key] : [],
      severity: 'high',
    })
  }

  if (focusEntity && !findings.some((finding) => finding.targetKeys.includes(focusEntity.key))) {
    const relationCount = relationCounts.get(focusEntity.key) ?? 0
    if (relationCount <= 1) {
      findings.push({
        id: `finding-focus-gap-${focusEntity.key}`,
        findingType: 'relationship_gap',
        title: `${focusEntity.name} needs stronger ties`,
        summary: `${focusEntity.name} is the current focus, but it still needs clearer alliances, tensions, or dependencies to feel embedded in the wider world.`,
        targetKeys: [focusEntity.key],
        severity: 'medium',
      })
    }
  }

  return findings.slice(0, 4)
}

function buildDiagnosticSuggestionSet(findings: WorldPromptDiagnosticFinding[]) {
  return findings.flatMap((finding, index) => {
    const targetKey = finding.targetKeys[0] ?? null
    const prompt = targetKey
      ? `Improve ${targetKey} by addressing this gap: ${finding.summary}`
      : `Address this world gap: ${finding.summary}`
    const suggestion = buildPromptSuggestion({
      id: `diagnostic-${finding.id}`,
      label: finding.title,
      prompt,
      kind: 'diagnostic_gap',
      style: index === 0 ? 'primary' : 'secondary',
      source: 'analysis',
      summary: finding.summary,
      uiKind: 'diagnostic',
      executionMode: 'apply_if_selected',
      actionMode: 'apply_compact_wave',
      applyPolicy: 'auto_if_safe',
      targetEntityKeys: finding.targetKeys,
      focusLayer: 'general',
      retrievalHint: finding.summary,
      generatedReason: 'Highlights a concrete graph weakness that can be improved next.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 1,
    })
    return suggestion ? [suggestion] : []
  })
}

function emptySessionFocusState(): WorldPromptSessionMemoryState['activeFocus'] {
  return worldPromptSessionFocusStateSchema.parse({
    entityKeys: [],
    threadKeys: [],
    focusLayer: null,
    selectedRootEntityKey: null,
    selectedViewKey: null,
    selectedThreadKey: null,
    updatedAt: '',
  })
}

function parseLegacySessionMemoryEnvelope(summaryMemory: string) {
  const matches = [...summaryMemory.matchAll(/Memory:\s*(\{.*\})/g)]
  const raw = matches.at(-1)?.[1] ?? null
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      frontierEntityKeys: Array.isArray(parsed.touchedEntityKeys)
        ? parsed.touchedEntityKeys.filter((value): value is string => typeof value === 'string')
        : [],
      recentThreadKeys: Array.isArray(parsed.recentThreadKeys)
        ? parsed.recentThreadKeys.filter((value): value is string => typeof value === 'string')
        : [],
      selectedRootEntityKey: typeof parsed.selectedRootEntityKey === 'string' ? parsed.selectedRootEntityKey : null,
      lastFocusLayer: typeof parsed.lastFocusLayer === 'string' ? parsed.lastFocusLayer as PlannerFocusLayer : null,
      lastContinuityMode: typeof parsed.lastContinuityMode === 'string' ? parsed.lastContinuityMode as WorldPromptContinuityMode : null,
      unresolvedThreads: Array.isArray(parsed.unresolvedThreads)
        ? parsed.unresolvedThreads
            .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
            .map((thread) => ({
              key: typeof thread.key === 'string' ? thread.key : '',
            }))
            .filter((thread) => thread.key)
            .map((thread) => thread.key)
        : [],
    }
  } catch {
    return null
  }
}

function readSessionMemoryState(input: {
  lastContext: Record<string, unknown> | null | undefined
  summaryMemory?: string
  selectedRootEntityKey?: string | null
  selectedViewKey?: string | null
  selectedThreadKey?: string | null
}): WorldPromptSessionMemoryState {
  const parsed = worldPromptSessionMemoryStateSchema.safeParse(input.lastContext?.memoryState ?? null)
  if (parsed.success) {
    return parsed.data
  }

  const legacy = parseLegacySessionMemoryEnvelope(input.summaryMemory ?? '')
  return worldPromptSessionMemoryStateSchema.parse({
    activeFocus: {
      entityKeys: legacy?.frontierEntityKeys ?? [],
      threadKeys: [
        ...(input.selectedThreadKey ? [input.selectedThreadKey] : []),
        ...(legacy?.recentThreadKeys ?? []).slice(0, 2),
      ],
      focusLayer: legacy?.lastFocusLayer ?? null,
      selectedRootEntityKey: input.selectedRootEntityKey ?? legacy?.selectedRootEntityKey ?? null,
      selectedViewKey: input.selectedViewKey ?? null,
      selectedThreadKey: input.selectedThreadKey ?? null,
      updatedAt: '',
    },
    backgroundFocus: null,
    frontierEntityKeys: legacy?.frontierEntityKeys ?? [],
    recentThreadKeys: legacy?.recentThreadKeys ?? [],
    recentTurnSummaries: [],
    lastContinuityMode: legacy?.lastContinuityMode ?? null,
    lastPlannerMode: null,
    lastRetrievedKeys: {
      entityKeys: legacy?.frontierEntityKeys ?? [],
      threadKeys: legacy?.recentThreadKeys ?? [],
    },
  })
}

function extractMentionedEntityKeys(prompt: string, snapshot: WorldPromptSnapshot) {
  const normalizedPrompt = normalizeName(prompt)
  if (!normalizedPrompt) return []
  return snapshot.worldEntities
    .filter((entity) => entity.status !== 'archived')
    .filter((entity) => {
      const variants = [entity.name, ...entity.aliases].flatMap((value) => buildNameVariants(value))
      return variants.some((variant) => variant && normalizedPrompt.includes(variant))
    })
    .map((entity) => entity.key)
}

function relationCountForSort(snapshot: WorldPromptSnapshot) {
  const counts = new Map<string, number>()
  for (const relationship of snapshot.worldRelationships) {
    counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
    counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
  }
  return counts
}

const WORLD_PROMPT_SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'do', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'my', 'of',
  'on', 'or', 'should', 'shall', 'suggest', 'tied', 'the', 'to', 'we', 'what', 'would', 'you', 'your',
])

function buildWorldPromptSearchQuery(prompt: string) {
  const normalized = normalizeName(prompt)
  if (!normalized) return ''
  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !WORLD_PROMPT_SEARCH_STOP_WORDS.has(token))
  return Array.from(new Set(tokens)).slice(0, 10).join(' ')
}

function trimPlannerText(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function summarizeEntityForPlanner(
  entity: WorldEntity,
  options: {
    includeContext: boolean
    relationCount: number
  },
) {
  return {
    key: entity.key,
    name: entity.name,
    nodeType: entity.nodeType,
    summary: trimPlannerText(entity.summary, 180),
    context: options.includeContext && entity.context.trim()
      ? trimPlannerText(entity.context, 320)
      : '',
    aliases: entity.aliases.slice(0, 3),
    tags: entity.tags.slice(0, 4),
    relationCount: options.relationCount,
  }
}

function summarizeRelationshipForPlanner(
  relationship: WorldRelationship,
  includeNotes: boolean,
) {
  return {
    key: relationship.key,
    sourceEntityKey: relationship.sourceEntityKey,
    targetEntityKey: relationship.targetEntityKey,
    verb: relationship.verb,
    direction: relationship.direction,
    notes: includeNotes && relationship.notes.trim()
      ? trimPlannerText(relationship.notes, 220)
      : '',
  }
}

async function searchWorldPromptResourcesFTS(input: {
  client: SupabaseClient
  draftId: string
  prompt: string
  limit: number
}) {
  const query = buildWorldPromptSearchQuery(input.prompt)
  if (!query) return [] as WorldPromptSearchHit[]
  const response = await input.client.rpc('world_prompt_search_resources', {
    p_draft_id: input.draftId,
    p_query: query,
    p_limit: input.limit,
  })
  if (response.error) {
    console.error('[world-prompt] FTS retrieval failed.', response.error)
    return [] as WorldPromptSearchHit[]
  }
  return ((response.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    resourceType: String(row.resource_type) as WorldPromptSearchHit['resourceType'],
    resourceKey: String(row.resource_key ?? ''),
    score: typeof row.score === 'number' ? row.score : Number(row.score ?? 0),
    entityKey: typeof row.entity_key === 'string' ? row.entity_key : null,
    sourceEntityKey: typeof row.source_entity_key === 'string' ? row.source_entity_key : null,
    targetEntityKey: typeof row.target_entity_key === 'string' ? row.target_entity_key : null,
    title: typeof row.title === 'string' ? row.title : '',
    summary: typeof row.summary === 'string' ? row.summary : '',
    linkedEntityKeys: Array.isArray(row.linked_entity_keys)
      ? row.linked_entity_keys.filter((value): value is string => typeof value === 'string')
      : [],
  })).filter((row) => row.resourceKey)
}

function typeRank(nodeType: WorldEntity['nodeType'], preferredNodeTypes: WorldEntity['nodeType'][]) {
  const rank = preferredNodeTypes.indexOf(nodeType)
  return rank === -1 ? 999 : rank
}

async function buildWorldPromptRetrievalPacket(input: {
  client: SupabaseClient
  mode: PlannerMode
  prompt: string
  snapshot: WorldPromptSnapshot
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  recentMessages: WorldPromptMessage[]
  intent: WorldPromptRetrievalIntent
  selectedRootEntityKey?: string | null
  selectedThreadKey?: string | null
  selectedViewKey?: string | null
}) {
  const relationCounts = relationCountForSort(input.snapshot)
  const preferredNodeTypes = preferredNodeTypesForFocusLayer(input.intent.focusLayer)
  const activeEntities = input.snapshot.worldEntities.filter((entity) => entity.status !== 'archived')
  const selectedThread = input.selectedThreadKey
    ? input.snapshot.worldThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    : null
  const selectedView = input.selectedViewKey
    ? input.snapshot.worldViews.find((view) => view.key === input.selectedViewKey) ?? null
    : null
  const selectedRootEntity = input.selectedRootEntityKey
    ? activeEntities.find((entity) => entity.key === input.selectedRootEntityKey) ?? null
    : selectedView?.rootEntityKey
      ? activeEntities.find((entity) => entity.key === selectedView.rootEntityKey) ?? null
      : null
  const anchorEntityKeys = new Set<string>([
    ...input.intent.anchorEntityKeys,
  ])
  const anchorThreadKeys = new Set<string>([
    ...input.intent.anchorThreadKeys,
  ])
  if (input.intent.continuityMode === 'follow_up') {
    for (const entityKey of (input.sessionMemoryState.frontierEntityKeys ?? []).slice(0, 4)) {
      anchorEntityKeys.add(entityKey)
    }
    if (input.sessionMemoryState.activeFocus.selectedRootEntityKey) {
      anchorEntityKeys.add(input.sessionMemoryState.activeFocus.selectedRootEntityKey)
    }
  }

  const ftsHits = await searchWorldPromptResourcesFTS({
    client: input.client,
    draftId: input.snapshot.draft.id,
    prompt: input.prompt,
    limit: input.mode === 'advisory_diagnosis' ? 12 : 6,
  })
  const ftsEntityKeys = new Set<string>()
  const ftsThreadKeys = new Set<string>()
  const ftsRelationshipKeys = new Set<string>()
  if (input.mode === 'advisory_diagnosis' || anchorEntityKeys.size === 0 || input.intent.continuityMode !== 'follow_up') {
    for (const hit of ftsHits) {
      if (hit.entityKey) ftsEntityKeys.add(hit.entityKey)
      if (hit.sourceEntityKey) ftsEntityKeys.add(hit.sourceEntityKey)
      if (hit.targetEntityKey) ftsEntityKeys.add(hit.targetEntityKey)
      for (const linkedEntityKey of hit.linkedEntityKeys) {
        ftsEntityKeys.add(linkedEntityKey)
      }
      if (hit.resourceType === 'thread') ftsThreadKeys.add(hit.resourceKey)
      if (hit.resourceType === 'relationship') ftsRelationshipKeys.add(hit.resourceKey)
    }
  }

  const entityScoreByKey = new Map<string, number>()
  const bumpEntityScore = (key: string | null | undefined, score: number) => {
    if (!key) return
    entityScoreByKey.set(key, (entityScoreByKey.get(key) ?? 0) + score)
  }
  for (const key of anchorEntityKeys) bumpEntityScore(key, 10)
  for (const key of input.sessionMemoryState.activeFocus.entityKeys ?? []) bumpEntityScore(key, input.intent.continuityMode === 'topic_shift' ? 2 : 5)
  for (const key of input.sessionMemoryState.backgroundFocus?.entityKeys ?? []) bumpEntityScore(key, input.intent.continuityMode === 'topic_shift' ? 3 : 1)
  for (const key of input.sessionMemoryState.frontierEntityKeys ?? []) bumpEntityScore(key, 3)
  for (const key of ftsEntityKeys) bumpEntityScore(key, 6)

  const relevantEntityKeys = new Set<string>([
    ...anchorEntityKeys,
    ...ftsEntityKeys,
  ])
  if (relevantEntityKeys.size === 0) {
    activeEntities
      .slice()
      .sort((left, right) => {
        const leftTypeRank = typeRank(left.nodeType, preferredNodeTypes)
        const rightTypeRank = typeRank(right.nodeType, preferredNodeTypes)
        if (leftTypeRank !== rightTypeRank) return leftTypeRank - rightTypeRank
        return (relationCounts.get(right.key) ?? 0) - (relationCounts.get(left.key) ?? 0)
      })
      .slice(0, input.mode === 'advisory_diagnosis' ? 6 : 3)
      .forEach((entity) => relevantEntityKeys.add(entity.key))
  }

  const neighborhoodRelationships = input.snapshot.worldRelationships.filter((relationship) => (
    relevantEntityKeys.has(relationship.sourceEntityKey) || relevantEntityKeys.has(relationship.targetEntityKey)
  ))
  for (const relationship of neighborhoodRelationships) {
    if (relevantEntityKeys.size >= (input.mode === 'advisory_diagnosis' ? 14 : 8)) break
    if (relevantEntityKeys.has(relationship.sourceEntityKey)) {
      relevantEntityKeys.add(relationship.targetEntityKey)
      bumpEntityScore(relationship.targetEntityKey, 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0))
    }
    if (relevantEntityKeys.has(relationship.targetEntityKey)) {
      relevantEntityKeys.add(relationship.sourceEntityKey)
      bumpEntityScore(relationship.sourceEntityKey, 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0))
    }
  }

  const includeContext = input.mode !== 'direct_build' || looksLikeContextHeavyPrompt(input.prompt)
  const relevantEntities = activeEntities
    .filter((entity) => relevantEntityKeys.has(entity.key))
    .sort((left, right) => {
      const leftScore = (entityScoreByKey.get(left.key) ?? 0) + (left.key === selectedRootEntity?.key ? 8 : 0)
      const rightScore = (entityScoreByKey.get(right.key) ?? 0) + (right.key === selectedRootEntity?.key ? 8 : 0)
      if (leftScore !== rightScore) return rightScore - leftScore
      const leftTypeRank = typeRank(left.nodeType, preferredNodeTypes)
      const rightTypeRank = typeRank(right.nodeType, preferredNodeTypes)
      if (leftTypeRank !== rightTypeRank) return leftTypeRank - rightTypeRank
      return (relationCounts.get(right.key) ?? 0) - (relationCounts.get(left.key) ?? 0)
    })
    .slice(0, input.mode === 'advisory_diagnosis' ? 12 : 8)
    .map((entity) => summarizeEntityForPlanner(entity, {
      includeContext,
      relationCount: relationCounts.get(entity.key) ?? 0,
    }))

  const relevantRelationships = input.snapshot.worldRelationships
    .filter((relationship) => (
      (
        relevantEntityKeys.has(relationship.sourceEntityKey)
        && relevantEntityKeys.has(relationship.targetEntityKey)
      )
      || ftsRelationshipKeys.has(relationship.key)
    ))
    .sort((left, right) => {
      const leftFts = ftsRelationshipKeys.has(left.key) ? 1 : 0
      const rightFts = ftsRelationshipKeys.has(right.key) ? 1 : 0
      if (leftFts !== rightFts) return rightFts - leftFts
      const leftStrength = (left.strength ?? 0) + (left.confidence ?? 0)
      const rightStrength = (right.strength ?? 0) + (right.confidence ?? 0)
      return rightStrength - leftStrength
    })
    .slice(0, input.mode === 'advisory_diagnosis' ? 18 : 8)
    .map((relationship) => summarizeRelationshipForPlanner(relationship, input.mode !== 'direct_build'))

  const threadScoreByKey = new Map<string, number>()
  const bumpThreadScore = (key: string | null | undefined, score: number) => {
    if (!key) return
    threadScoreByKey.set(key, (threadScoreByKey.get(key) ?? 0) + score)
  }
  for (const key of anchorThreadKeys) bumpThreadScore(key, 10)
  for (const key of input.sessionMemoryState.recentThreadKeys ?? []) bumpThreadScore(key, input.intent.continuityMode === 'topic_shift' ? 2 : 5)
  for (const key of input.sessionMemoryState.activeFocus.threadKeys ?? []) bumpThreadScore(key, input.intent.continuityMode === 'topic_shift' ? 2 : 4)
  for (const key of input.sessionMemoryState.backgroundFocus?.threadKeys ?? []) bumpThreadScore(key, input.intent.continuityMode === 'topic_shift' ? 3 : 1)
  for (const key of ftsThreadKeys) bumpThreadScore(key, 6)
  const threadKeys = new Set<string>([
    ...anchorThreadKeys,
    ...(input.intent.continuityMode === 'follow_up' ? (input.sessionMemoryState.recentThreadKeys ?? []).slice(0, 3) : []),
    ...ftsThreadKeys,
  ])
  const relevantThreads = input.snapshot.worldThreads
    .filter((thread) => thread.status === 'open')
    .filter((thread) => (
      threadKeys.size === 0
      || threadKeys.has(thread.key)
      || thread.linkedEntityKeys.some((key) => relevantEntityKeys.has(key))
    ))
    .sort((left, right) => {
      const leftScore = (threadScoreByKey.get(left.key) ?? 0) + (left.key === input.selectedThreadKey ? 8 : 0)
      const rightScore = (threadScoreByKey.get(right.key) ?? 0) + (right.key === input.selectedThreadKey ? 8 : 0)
      if (leftScore !== rightScore) return rightScore - leftScore
      const leftPriority = left.priority === 'primary' ? 2 : left.priority === 'secondary' ? 1 : 0
      const rightPriority = right.priority === 'primary' ? 2 : right.priority === 'secondary' ? 1 : 0
      return rightPriority - leftPriority
    })
    .slice(0, input.mode === 'advisory_diagnosis' ? 4 : 2)
    .map((thread) => ({
      key: thread.key,
      title: thread.title,
      summary: trimPlannerText(thread.summary, 180),
      priority: thread.priority,
      linkedEntityKeys: thread.linkedEntityKeys.filter((key) => relevantEntityKeys.has(key)).slice(0, 6),
    }))

  const trimmedRecentMessages = input.recentMessages
    .slice(-(input.intent.continuityMode === 'topic_shift' ? 2 : input.mode === 'advisory_diagnosis' && input.intent.mentionedEntityKeys.length === 0 ? 3 : input.mode === 'advisory_diagnosis' ? 5 : 3))
    .map((message) => ({
      role: message.role,
      content: trimPlannerText(message.content, 240),
    }))

  const answerContextEntityKeys = relevantEntities
    .slice(0, input.mode === 'advisory_diagnosis' ? 6 : 4)
    .map((entity) => entity.key)
  const mutationContextEntityKeys = relevantEntities
    .slice(0, input.mode === 'direct_build' ? 6 : 5)
    .map((entity) => entity.key)
  const backgroundContextEntityKeys = [
    ...(input.sessionMemoryState.backgroundFocus?.entityKeys ?? []).slice(0, 4),
  ].filter((key) => !answerContextEntityKeys.includes(key) && !mutationContextEntityKeys.includes(key))
  const rankedEntityScores = [...entityScoreByKey.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([key, score]) => ({ key, score }))
  const rankedThreadScores = [...threadScoreByKey.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([key, score]) => ({ key, score }))
  const diagnostics = worldPromptRetrievalDiagnosticsSchema.parse({
    anchorEntityKeys: Array.from(anchorEntityKeys),
    anchorThreadKeys: Array.from(anchorThreadKeys),
    selectedSuggestionId: null,
    ftsHits: ftsHits.slice(0, 8).map((hit) => ({
      resourceType: hit.resourceType,
      resourceKey: hit.resourceKey,
      score: hit.score,
    })),
    rankedEntityScores,
    rankedThreadScores,
    droppedEntityKeys: [...relevantEntityKeys].filter((key) => !relevantEntities.some((entity) => entity.key === key)).slice(0, 8),
    droppedThreadKeys: [...threadKeys].filter((key) => !relevantThreads.some((thread) => thread.key === key)).slice(0, 6),
    chosenFocusLayer: input.intent.focusLayer,
    continuityMode: input.intent.continuityMode,
    executionReason: `${input.intent.resolvedMode ?? 'apply_compact_wave'} via ${input.intent.resolvedIntent ?? 'graph_build'} with ${input.intent.continuityMode}.`,
  })

  return {
    promptIntent: input.intent.promptIntent,
    plannerMode: input.intent.plannerMode,
    focusLayer: input.intent.focusLayer,
    continuityMode: input.intent.continuityMode,
    resolvedIntent: input.intent.resolvedIntent,
    resolvedFocus: input.intent.resolvedFocus,
    resolvedMode: input.intent.resolvedMode,
    selectedRootEntity: selectedRootEntity
      ? summarizeEntityForPlanner(selectedRootEntity, {
          includeContext,
          relationCount: relationCounts.get(selectedRootEntity.key) ?? 0,
        })
      : null,
    selectedView: selectedView
      ? {
          key: selectedView.key,
          rootEntityKey: selectedView.rootEntityKey,
          mode: selectedView.mode,
          search: selectedView.search,
        }
      : null,
    selectedThread: selectedThread
      ? {
          key: selectedThread.key,
          title: selectedThread.title,
          summary: trimPlannerText(selectedThread.summary, 180),
          linkedEntityKeys: selectedThread.linkedEntityKeys.slice(0, 8),
          priority: selectedThread.priority,
        }
      : null,
    relevantEntities,
    relevantRelationships,
    relevantThreads,
    graphSignals: {
      entityCount: activeEntities.length,
      relationshipCount: input.snapshot.worldRelationships.length,
      threadCount: input.snapshot.worldThreads.length,
      entityTypeCounts: {
        actor: activeEntities.filter((entity) => entity.nodeType === 'actor').length,
        group: activeEntities.filter((entity) => entity.nodeType === 'group').length,
        place: activeEntities.filter((entity) => entity.nodeType === 'place').length,
        concept: activeEntities.filter((entity) => entity.nodeType === 'concept').length,
        event: activeEntities.filter((entity) => entity.nodeType === 'event').length,
        object: activeEntities.filter((entity) => entity.nodeType === 'object').length,
      },
      anchorCount: anchorEntityKeys.size,
      ftsHitCount: ftsHits.length,
    },
    recentMessages: trimmedRecentMessages,
    sessionMemory: {
      conversationMemory: trimPlannerText(input.summaryMemory, 1200),
      state: input.sessionMemoryState,
      focusMemory: {
        selectedRootEntityKey: input.selectedRootEntityKey ?? selectedView?.rootEntityKey ?? null,
        selectedViewKey: input.selectedViewKey ?? null,
        selectedThreadKey: input.selectedThreadKey ?? null,
        recentEntityKeys: (input.sessionMemoryState.frontierEntityKeys ?? []).slice(0, 6),
        recentThreadKeys: (input.sessionMemoryState.recentThreadKeys ?? []).slice(0, 4),
        continuityMode: input.sessionMemoryState.lastContinuityMode ?? null,
        focusLayer: input.sessionMemoryState.activeFocus.focusLayer ?? null,
      },
      worldMemory: {
        retrievedEntityKeys: relevantEntities.map((entity) => entity.key),
        retrievedThreadKeys: relevantThreads.map((thread) => thread.key),
      },
    },
    diagnostics,
    answerContext: {
      entityKeys: answerContextEntityKeys,
      threadKeys: relevantThreads.slice(0, 2).map((thread) => thread.key),
    },
    mutationContext: {
      entityKeys: mutationContextEntityKeys,
      threadKeys: relevantThreads.slice(0, 3).map((thread) => thread.key),
    },
    backgroundContext: {
      entityKeys: backgroundContextEntityKeys,
      threadKeys: (input.sessionMemoryState.backgroundFocus?.threadKeys ?? []).slice(0, 3),
    },
  } satisfies WorldPromptRetrievalPacket
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return 0
  const leftPairs = new Map<string, number>()
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2)
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1)
  }
  let intersection = 0
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2)
    const count = leftPairs.get(pair) ?? 0
    if (count > 0) {
      leftPairs.set(pair, count - 1)
      intersection += 1
    }
  }
  return (2 * intersection) / ((left.length - 1) + (right.length - 1))
}

function mapSessionRow(row: WorldPromptSessionRow): WorldPromptSession {
  return worldPromptSessionSchema.parse({
    id: row.id,
    key: row.key,
    draftId: row.draft_id,
    title: row.title,
    status: row.status,
    isActive: row.is_active,
    summaryMemory: row.summary_memory ?? '',
    lastContext: row.last_context ?? {},
    selectedRootEntityKey: row.selected_root_entity_key,
    selectedViewKey: row.selected_view_key,
    model: row.model ?? 'gpt-5.4',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapTurnRow(row: WorldPromptTurnRow): WorldPromptTurn {
  return worldPromptTurnSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    draftId: row.draft_id,
    prompt: row.prompt,
    status: row.status,
    model: row.model ?? 'gpt-5.4',
    resolvedContext: row.resolved_context ?? {},
    approvalState: row.approval_state,
    assistantSummary: row.assistant_summary ?? '',
    errorMessage: row.error_message,
    responseId: row.response_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapMessageRow(row: WorldPromptMessageRow): WorldPromptMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    draftId: row.draft_id,
    role: row.role as WorldPromptMessage['role'],
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapEventRow(row: WorldPromptEventRow): WorldPromptEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    draftId: row.draft_id,
    sequence: row.sequence,
    eventType: row.event_type as WorldPromptEvent['eventType'],
    opId: row.op_id,
    payload: row.payload ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapSuggestionRow(row: WorldPromptSuggestionRow): WorldPromptSuggestionRecord | null {
  const sanitized = sanitizeSuggestionRecord({
    id: row.id,
    label: row.label,
    prompt: row.prompt,
    summary: row.summary,
    kind: row.kind,
    style: row.style,
    source: row.source,
    threadKey: row.thread_key,
    estimatedNodeCount: row.estimated_node_count,
    estimatedEdgeCount: row.estimated_edge_count,
    willQueueImages: row.will_queue_images,
    willQueueCinematics: row.will_queue_cinematics,
    uiKind: typeof row.metadata?.uiKind === 'string' ? row.metadata.uiKind as WorldPromptSuggestion['uiKind'] : undefined,
    executionMode: typeof row.metadata?.executionMode === 'string' ? row.metadata.executionMode as WorldPromptSuggestion['executionMode'] : undefined,
    actionMode: typeof row.metadata?.actionMode === 'string' ? row.metadata.actionMode as WorldPromptSuggestion['actionMode'] : undefined,
    applyPolicy: typeof row.metadata?.applyPolicy === 'string' ? row.metadata.applyPolicy as WorldPromptSuggestion['applyPolicy'] : undefined,
    targetEntityKeys: Array.isArray(row.metadata?.targetEntityKeys)
      ? row.metadata.targetEntityKeys.filter((value): value is string => typeof value === 'string')
      : [],
    targetThreadKeys: Array.isArray(row.metadata?.targetThreadKeys)
      ? row.metadata.targetThreadKeys.filter((value): value is string => typeof value === 'string')
      : [],
    focusLayer: typeof row.metadata?.focusLayer === 'string' ? row.metadata.focusLayer as WorldPromptSuggestion['focusLayer'] : undefined,
    retrievalHint: typeof row.metadata?.retrievalHint === 'string' ? row.metadata.retrievalHint : '',
    generatedReason: typeof row.metadata?.generatedReason === 'string' ? row.metadata.generatedReason : undefined,
    generatedFromTurnId: typeof row.metadata?.generatedFromTurnId === 'string' ? row.metadata.generatedFromTurnId : row.turn_id,
  })

  if (!sanitized) {
    return null
  }

  return worldPromptSuggestionRecordSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    threadKey: sanitized.threadKey,
    label: sanitized.label,
    prompt: sanitized.prompt,
    kind: sanitized.kind,
    style: sanitized.style,
    source: sanitized.source,
    summary: sanitized.summary,
    estimatedNodeCount: sanitized.estimatedNodeCount,
    estimatedEdgeCount: sanitized.estimatedEdgeCount,
    willQueueImages: sanitized.willQueueImages,
    willQueueCinematics: sanitized.willQueueCinematics,
    actionMode: sanitized.actionMode,
    applyPolicy: sanitized.applyPolicy,
    targetEntityKeys: sanitized.targetEntityKeys,
    targetThreadKeys: sanitized.targetThreadKeys,
    focusLayer: sanitized.focusLayer,
    retrievalHint: sanitized.retrievalHint,
    state: row.state as WorldPromptSuggestionRecord['state'],
    rank: row.rank,
    usedTurnId: row.used_turn_id,
    dismissedAt: row.dismissed_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapThreadRow(row: WorldThreadRow): WorldThread {
  return worldThreadSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    key: row.key,
    title: row.title,
    summary: row.summary ?? '',
    status: row.status,
    priority: row.priority,
    linkedEntityKeys: row.linked_entity_keys ?? [],
    sourceTurnId: row.source_turn_id,
    lastTurnId: row.last_turn_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapWorldEntityRow(row: WorldEntityRow): WorldEntity {
  return worldEntitySchema.parse({
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary ?? '',
    context: row.context ?? '',
    nodeType: row.node_type,
    aliases: row.aliases ?? [],
    tags: row.tags ?? [],
    status: row.status,
    thumbnailAssetKey: row.thumbnail_asset_key,
    linkedDefinitionKey: row.linked_definition_key,
    source: row.source,
    customProperties: row.custom_properties ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapWorldRelationshipRow(row: WorldRelationshipRow, worldEntities: WorldEntity[]): WorldRelationship {
  const sourceEntity = worldEntities.find((entity) => entity.id === row.source_entity_id) ?? null
  const targetEntity = worldEntities.find((entity) => entity.id === row.target_entity_id) ?? null
  return worldRelationshipSchema.parse({
    id: row.id,
    key: row.key,
    sourceEntityKey: sourceEntity?.key ?? row.source_entity_id,
    targetEntityKey: targetEntity?.key ?? row.target_entity_id,
    verb: row.verb,
    direction: row.direction,
    strength: row.strength,
    confidence: row.confidence,
    source: row.source,
    notes: row.notes ?? '',
    state: row.state,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapWorldViewRow(row: WorldViewRow) {
  return worldViewSchema.parse({
    id: row.id,
    key: row.key,
    name: row.name,
    mode: row.mode,
    filters: row.filters ?? {},
    search: row.search ?? '',
    rootEntityKey: row.root_entity_key,
    camera: row.camera ?? {},
    focusDepth: row.focus_depth ?? 1,
    showSuggestions: row.show_suggestions ?? true,
    showLabels: row.show_labels ?? true,
    showDerivedLayer: row.show_derived_layer ?? true,
    nodePositions: row.node_positions ?? {},
    collapsedState: row.collapsed_state ?? {},
    sortMode: row.sort_mode ?? 'manual',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapWorldOperatorRow(row: WorldOperatorRow): WorldOperator {
  return {
    id: row.id,
    key: row.key,
    operatorType: row.operator_type,
    inputEntityKeys: row.input_entity_keys ?? [],
    label: row.label ?? '',
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWorldResultRow(row: WorldResultRow): WorldResult {
  return {
    id: row.id,
    key: row.key,
    resultType: row.result_type,
    sourceOperatorKey: row.source_operator_key,
    title: row.title,
    summary: row.summary ?? '',
    previewAssetKey: row.preview_asset_key,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWorldGraphConnectionRow(row: WorldGraphConnectionRow): WorldGraphConnection {
  return {
    id: row.id,
    key: row.key,
    sourceNodeKey: row.source_node_key,
    sourceNodeKind: row.source_node_kind,
    targetNodeKey: row.target_node_key,
    targetNodeKind: row.target_node_kind,
    role: row.role,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ensurePromptSession(input: {
  client: SupabaseClient
  payload: WorldPromptStartTurnRequest
}) {
  const sessionKey = input.payload.sessionKey?.trim() || 'world.prompt.main'
  const existing = await input.client
    .from('world_prompt_sessions')
    .select(SESSION_SELECT)
    .eq('draft_id', input.payload.snapshot.draft.id)
    .eq('key', sessionKey)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) {
    const updated = await input.client
      .from('world_prompt_sessions')
      .update({
        is_active: true,
        status: 'active',
        selected_root_entity_key: input.payload.selectedRootEntityKey,
        selected_view_key: input.payload.selectedViewKey,
      model: input.payload.model,
      last_context: {
        lastPrompt: input.payload.prompt,
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedThreadKey: input.payload.selectedThreadKey,
        memoryState: readSessionMemoryState({
          lastContext: existing.data.last_context ?? {},
          summaryMemory: existing.data.summary_memory ?? '',
          selectedRootEntityKey: input.payload.selectedRootEntityKey,
          selectedViewKey: input.payload.selectedViewKey,
          selectedThreadKey: input.payload.selectedThreadKey,
        }),
      },
      })
      .eq('id', existing.data.id)
      .select(SESSION_SELECT)
      .single()
    if (updated.error) throw new Error(updated.error.message)
    return mapSessionRow(updated.data as WorldPromptSessionRow)
  }

  const inserted = await input.client
    .from('world_prompt_sessions')
    .insert({
      draft_id: input.payload.snapshot.draft.id,
      key: sessionKey,
      title: 'New chat',
      status: 'active',
      is_active: true,
      summary_memory: '',
      last_context: {
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedThreadKey: input.payload.selectedThreadKey,
        memoryState: worldPromptSessionMemoryStateSchema.parse({
          activeFocus: {
            entityKeys: [],
            threadKeys: input.payload.selectedThreadKey ? [input.payload.selectedThreadKey] : [],
            focusLayer: null,
            selectedRootEntityKey: input.payload.selectedRootEntityKey,
            selectedViewKey: input.payload.selectedViewKey,
            selectedThreadKey: input.payload.selectedThreadKey,
            updatedAt: new Date().toISOString(),
          },
          backgroundFocus: null,
          frontierEntityKeys: [],
          recentThreadKeys: input.payload.selectedThreadKey ? [input.payload.selectedThreadKey] : [],
          recentTurnSummaries: [],
          lastContinuityMode: null,
          lastPlannerMode: null,
          lastRetrievedKeys: {
            entityKeys: [],
            threadKeys: input.payload.selectedThreadKey ? [input.payload.selectedThreadKey] : [],
          },
        }),
      },
      selected_root_entity_key: input.payload.selectedRootEntityKey,
      selected_view_key: input.payload.selectedViewKey,
      model: input.payload.model,
      metadata: {
        titleSource: 'auto',
        hasUnreadUpdates: false,
        lastSuggestionRefreshAt: null,
        sessionMode: 'normal',
      },
    })
    .select(SESSION_SELECT)
    .single()
  if (inserted.error) throw new Error(inserted.error.message)
  return mapSessionRow(inserted.data as WorldPromptSessionRow)
}

async function loadSessionMessages(client: SupabaseClient, sessionId: string) {
  const response = await client
    .from('world_prompt_messages')
    .select(MESSAGE_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptMessageRow[]).map(mapMessageRow)
}

export async function createWorldPromptSession(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptCreateSessionRequestSchema.parse(input.payload)
  const requestPayload = worldPromptStartTurnRequestSchema.parse({
    prompt: payload.title,
    model: payload.model,
    sessionKey: payload.sessionKey,
    selectedSuggestionId: null,
    selectedRootEntityKey: payload.selectedRootEntityKey,
    selectedViewKey: payload.selectedViewKey,
    selectedThreadKey: payload.selectedThreadKey,
    snapshot: payload.snapshot,
  })
  const session = await ensurePromptSession({
    client: input.client,
    payload: requestPayload,
  })
  const response = await input.client
    .from('world_prompt_sessions')
    .update({
      title: payload.title,
      metadata: {
        ...(session.metadata ?? {}),
        titleSource: 'auto',
        hasUnreadUpdates: false,
        sessionMode: 'normal',
      },
      last_context: {
        ...(session.lastContext ?? {}),
        selectedRootEntityKey: payload.selectedRootEntityKey,
        selectedViewKey: payload.selectedViewKey,
        selectedThreadKey: payload.selectedThreadKey,
      },
    })
    .eq('id', session.id)
    .select(SESSION_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return worldPromptCreateSessionResponseSchema.parse({
    ok: true,
    session: mapSessionRow(response.data as WorldPromptSessionRow),
  })
}

export async function dismissWorldPromptSuggestion(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptDismissSuggestionRequestSchema.parse(input.payload)
  const response = await input.client
    .from('world_prompt_suggestions')
    .update({
      state: 'dismissed',
      dismissed_at: new Date().toISOString(),
    })
    .eq('id', payload.suggestionId)
    .select(SUGGESTION_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return worldPromptDismissSuggestionResponseSchema.parse({
    ok: true,
    suggestion: mapSuggestionRow(response.data as WorldPromptSuggestionRow),
  })
}

export async function refreshWorldPromptSuggestions(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptRefreshSuggestionsRequestSchema.parse(input.payload)
  const sessionResponse = payload.sessionId
    ? await input.client
      .from('world_prompt_sessions')
      .select(SESSION_SELECT)
      .eq('id', payload.sessionId)
      .maybeSingle()
    : await input.client
      .from('world_prompt_sessions')
      .select(SESSION_SELECT)
      .eq('draft_id', payload.snapshot.draft.id)
      .eq('key', payload.sessionKey ?? '')
      .maybeSingle()
  if (sessionResponse.error) throw new Error(sessionResponse.error.message)
  if (!sessionResponse.data) {
    throw new Error('World prompt session not found.')
  }
  const session = mapSessionRow(sessionResponse.data as WorldPromptSessionRow)

  const latestTurnResponse = await input.client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestTurnResponse.error) throw new Error(latestTurnResponse.error.message)
  const latestTurn = latestTurnResponse.data ? mapTurnRow(latestTurnResponse.data as WorldPromptTurnRow) : null
  const preview = latestTurn?.metadata?.preview ? worldPromptPlanPreviewSchema.safeParse(latestTurn.metadata.preview).data ?? null : null
  const sessionThreadKey = typeof session.lastContext?.selectedThreadKey === 'string'
    ? session.lastContext.selectedThreadKey
    : null
  const seededSuggestions = Array.isArray(latestTurn?.metadata?.suggestions)
    ? z.array(worldPromptSuggestionSchema).safeParse(latestTurn?.metadata?.suggestions).data ?? []
    : preview?.suggestions ?? []
  const nextSuggestions = finalizeSuggestionSet({
    snapshot: payload.snapshot,
    selectedThreadKey: payload.selectedThreadKey ?? sessionThreadKey,
    suggestions: seededSuggestions,
  })
  const persistedSuggestions = await persistSessionSuggestions({
    client: input.client,
    draftId: payload.snapshot.draft.id,
    sessionId: session.id,
    turnId: latestTurn?.id ?? null,
    selectedThreadKey: payload.selectedThreadKey ?? sessionThreadKey,
    suggestions: nextSuggestions,
  })
  const updatedSession = await updateSessionLifecycle({
    client: input.client,
    session,
    prompt: latestTurn?.prompt ?? payload.reason,
    assistantSummary: latestTurn?.assistantSummary ?? 'Suggestions refreshed after a manual world edit.',
    selectedRootEntityKey: payload.selectedRootEntityKey ?? session.selectedRootEntityKey,
    selectedViewKey: payload.selectedViewKey ?? session.selectedViewKey,
    selectedThreadKey: payload.selectedThreadKey ?? sessionThreadKey,
    summaryMemory: session.summaryMemory,
  })
  return worldPromptRefreshSuggestionsResponseSchema.parse({
    ok: true,
    session: updatedSession,
    suggestions: persistedSuggestions,
  })
}

function compactMessageHistory(summaryMemory: string, messages: WorldPromptMessage[]) {
  if (messages.length <= 12) {
    return {
      summaryMemory,
      recentMessages: messages.slice(-10),
      compacted: false,
    }
  }

  const olderMessages = messages.slice(0, Math.max(0, messages.length - 10))
  const nextSummary = [
    summaryMemory.trim(),
    olderMessages
      .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim().slice(0, 180)}`)
      .join('\n'),
  ].filter(Boolean).join('\n').slice(-4000)

  return {
    summaryMemory: nextSummary,
    recentMessages: messages.slice(-10),
    compacted: true,
  }
}

function deriveAutoSessionTitle(input: {
  prompt: string
  assistantSummary?: string | null
}) {
  const sanitizedAssistantSummary = (input.assistantSummary ?? '')
    .replace(/^Hosted prompt planning was unavailable\.\s*/i, '')
    .replace(/^Plan-only mode: no graph mutations were applied\.\s*Review the preview and apply the first wave only if it looks right\.\s*/i, '')
    .trim()
  const seed = sanitizedAssistantSummary || input.prompt.trim() || 'New chat'
  const normalized = seed.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'New chat'
  return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized
}

function classifyPlannerFailure(error: unknown): WorldPromptPlannerFailure {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const normalizedMessage = rawMessage.trim() || 'Hosted prompt planning failed.'
  let category: WorldPromptPlannerFailure['category'] = 'unknown'
  let message = normalizedMessage

  if (/timed out after/i.test(normalizedMessage)) {
    category = 'timeout'
  } else if (normalizedMessage.includes('[world-prompt-planner]')) {
    category = 'upstream_error'
    message = normalizedMessage.replace(/^\[world-prompt-planner\]\s*/i, '').trim() || 'OpenAI request failed.'
  } else if (/returned invalid json/i.test(normalizedMessage)) {
    category = 'invalid_json'
  } else if (/did not match the expected schema/i.test(normalizedMessage)) {
    category = 'schema_validation_failed'
  }

  return {
    category,
    message: message.length > 280 ? `${message.slice(0, 277).trimEnd()}...` : message,
    fallbackUsed: false,
    occurredAt: new Date().toISOString(),
  }
}

function buildRollingSessionMemory(input: {
  session: WorldPromptSession
  turn: WorldPromptTurn
  assistantSummary: string
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
}) {
  const latestPrompt = input.turn.prompt.replace(/\s+/g, ' ').trim()
  const latestSummary = input.assistantSummary.replace(/\s+/g, ' ').trim()
  const contextLines = [
    input.session.summaryMemory.trim(),
    latestPrompt ? `user: ${latestPrompt.slice(0, 220)}` : null,
    latestSummary ? `assistant: ${latestSummary.slice(0, 240)}` : null,
  ].filter(Boolean)
  return contextLines.join('\n').slice(-4000)
}

function buildSessionMemoryState(input: {
  session: WorldPromptSession
  turn: WorldPromptTurn
  assistantSummary: string
  selectedThreadKey?: string | null
}): WorldPromptSessionMemoryState {
  const previous = readSessionMemoryState({
    lastContext: input.session.lastContext,
    summaryMemory: input.session.summaryMemory,
    selectedRootEntityKey: input.session.selectedRootEntityKey,
    selectedViewKey: input.session.selectedViewKey,
    selectedThreadKey: input.selectedThreadKey ?? (typeof input.session.lastContext?.selectedThreadKey === 'string' ? input.session.lastContext.selectedThreadKey : null),
  })
  const preview = input.turn.metadata?.preview ? worldPromptPlanPreviewSchema.safeParse(input.turn.metadata.preview).data ?? null : null
  const touchedEntityKeys = new Set<string>([
    ...(Array.isArray((input.turn.metadata ?? {}).retrievedEntityKeys)
      ? ((input.turn.metadata ?? {}).retrievedEntityKeys as unknown[]).filter((value): value is string => typeof value === 'string')
      : []),
  ])
  for (const item of preview?.items ?? []) {
    for (const entityKey of item.targetKeys ?? []) {
      touchedEntityKeys.add(entityKey)
    }
  }
  const recentThreadKeys = [
    ...(input.selectedThreadKey ? [input.selectedThreadKey] : []),
    ...(Array.isArray((input.turn.metadata ?? {}).retrievedThreadKeys)
      ? ((input.turn.metadata ?? {}).retrievedThreadKeys as unknown[]).filter((value): value is string => typeof value === 'string').slice(0, 3)
      : []),
  ].slice(0, 4)
  const nextFocus = worldPromptSessionFocusStateSchema.parse({
    entityKeys: Array.from(touchedEntityKeys).slice(0, 8),
    threadKeys: recentThreadKeys,
    focusLayer: typeof input.turn.metadata?.focusLayer === 'string' ? input.turn.metadata.focusLayer : previous.activeFocus.focusLayer,
    selectedRootEntityKey: typeof input.turn.resolvedContext?.selectedRootEntityKey === 'string' ? input.turn.resolvedContext.selectedRootEntityKey : null,
    selectedViewKey: typeof input.turn.resolvedContext?.selectedViewKey === 'string' ? input.turn.resolvedContext.selectedViewKey : null,
    selectedThreadKey: input.selectedThreadKey ?? null,
    updatedAt: input.turn.updatedAt,
  })
  const nextRecentTurnSummary = worldPromptRecentTurnSummarySchema.parse({
    turnId: input.turn.id,
    prompt: input.turn.prompt,
    assistantSummary: input.assistantSummary,
    classification: typeof input.turn.metadata?.classification === 'string' ? input.turn.metadata.classification : null,
    focusLayer: typeof input.turn.metadata?.focusLayer === 'string' ? input.turn.metadata.focusLayer : null,
    continuityMode: typeof input.turn.metadata?.continuityMode === 'string' ? input.turn.metadata.continuityMode : null,
    createdAt: input.turn.updatedAt,
  })
  const movePreviousToBackground = previous.activeFocus.entityKeys.length > 0 || previous.activeFocus.threadKeys.length > 0
  return worldPromptSessionMemoryStateSchema.parse({
    activeFocus: nextFocus,
    backgroundFocus: movePreviousToBackground
      ? worldPromptSessionFocusStateSchema.parse({
        ...previous.activeFocus,
        updatedAt: previous.activeFocus.updatedAt || input.turn.updatedAt,
      })
      : previous.backgroundFocus,
    frontierEntityKeys: Array.from(touchedEntityKeys).slice(0, 10),
    recentThreadKeys,
    recentTurnSummaries: [nextRecentTurnSummary, ...previous.recentTurnSummaries].slice(0, 6),
    lastContinuityMode: typeof input.turn.metadata?.continuityMode === 'string' ? input.turn.metadata.continuityMode : previous.lastContinuityMode,
    lastPlannerMode: typeof input.turn.metadata?.plannerMode === 'string' ? input.turn.metadata.plannerMode : previous.lastPlannerMode,
    lastRetrievedKeys: {
      entityKeys: Array.from(touchedEntityKeys).slice(0, 10),
      threadKeys: recentThreadKeys,
    },
  })
}

function suggestionUiKind(suggestion: WorldPromptSuggestion) {
  if (suggestion.uiKind) return suggestion.uiKind
  if (suggestion.kind === 'repair_prompt') return 'clarification'
  if (suggestion.kind === 'diagnostic_gap') return 'diagnostic'
  if (suggestion.kind === 'advisory_option') return 'advisory'
  return 'next_move'
}

function suggestionGeneratedReason(input: {
  suggestion: WorldPromptSuggestion
  selectedThreadKey?: string | null
}) {
  if (input.suggestion.generatedReason) {
    return input.suggestion.generatedReason
  }
  if (input.suggestion.threadKey || input.selectedThreadKey) {
    return 'continues selected thread'
  }
  if (input.suggestion.kind === 'repair_prompt') {
    return 'clarifies the current request'
  }
  if (input.suggestion.willQueueImages || input.suggestion.willQueueCinematics) {
    return 'expands the latest additions with media generation'
  }
  return input.suggestion.source === 'wave2'
    ? 'expands latest additions'
    : input.suggestion.source === 'thread'
      ? 'continues an unresolved thread'
      : 'offers the next likely move'
}

function finalizeSuggestionSet(input: {
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
  sourcePrompt?: string | null
  suggestions: WorldPromptSuggestion[]
  maxCount?: number
}) {
  const seededSuggestions = dedupeSuggestions(input.suggestions)
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
  const hasFocusedNonThreadSuggestion = seededSuggestions.some((suggestion) => (
    suggestion.source !== 'thread' && suggestion.kind !== 'plan_only'
  ))
  const fallback = input.selectedThreadKey
    ? buildThreadAwareSuggestions({
        snapshot: input.snapshot,
        selectedThreadKey: input.selectedThreadKey,
      }).filter((suggestion) => !suggestion.threadKey || suggestion.threadKey === input.selectedThreadKey)
    : hasFocusedNonThreadSuggestion
      ? buildThreadAwareSuggestions({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
        }).filter((suggestion) => suggestion.kind === 'plan_only')
      : buildThreadAwareSuggestions({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
        })
  const finalized = dedupeSuggestions([
    ...seededSuggestions,
    ...fallback,
  ])
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
    .slice(0, input.maxCount ?? 6)
  return finalized.map((suggestion) => {
    const targetThreadKey = suggestion.targetThreadKeys?.[0] ?? suggestion.threadKey ?? null
    const targetRootEntityKey = suggestion.targetRootEntityKey ?? suggestion.targetEntityKeys?.[0] ?? null
    const suggestedView = targetThreadKey
      ? input.snapshot.worldViews.find((view) => {
          const metadata = (view.metadata ?? {}) as Record<string, unknown>
          const sourceThreadKeys = Array.isArray(metadata.sourceThreadKeys) ? metadata.sourceThreadKeys as string[] : []
          return sourceThreadKeys.includes(targetThreadKey)
        }) ?? null
      : targetRootEntityKey
        ? input.snapshot.worldViews.find((view) => {
            const metadata = (view.metadata ?? {}) as Record<string, unknown>
            const sourceEntityKeys = Array.isArray(metadata.sourceEntityKeys) ? metadata.sourceEntityKeys as string[] : []
            return view.rootEntityKey === targetRootEntityKey || sourceEntityKeys.includes(targetRootEntityKey)
          }) ?? null
        : null
    const suggestedMetadata = (suggestedView?.metadata ?? {}) as Record<string, unknown>
    return worldPromptSuggestionSchema.parse({
      ...suggestion,
      suggestedViewKey: suggestion.suggestedViewKey ?? suggestedView?.key ?? null,
      targetRootEntityKey,
      preferredViewKind: suggestion.preferredViewKind
        ?? (typeof suggestedMetadata.viewKind === 'string' ? suggestedMetadata.viewKind : null),
    })
  })
}

function capAssistantSummary(text: string, mode: PlannerMode) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const sentenceMatches = compact.match(/[^.!?]+[.!?]?/g) ?? [compact]
  const maxSentences = mode === 'advisory_diagnosis' ? 2 : 1
  const maxChars = mode === 'advisory_diagnosis' ? 240 : 140
  return trimPlannerText(sentenceMatches.slice(0, maxSentences).join(' ').trim(), maxChars)
}

function shouldAllowRichContext(mode: PlannerMode, prompt: string) {
  return mode !== 'direct_build' || looksLikeContextHeavyPrompt(prompt)
}

function optimizePlannerOpsForMode(input: {
  mode: PlannerMode
  prompt: string
  plan: z.infer<typeof worldPromptPlannerSchema>
}) {
  const allowRichContext = shouldAllowRichContext(input.mode, input.prompt)
  const normalizedOps = input.plan.wave1Ops.map((op) => {
    const cloned = structuredClone(op) as PromptToWorldOp
    if (cloned.op === 'upsert_entity') {
      cloned.payload.entity.summary = trimPlannerText(cloned.payload.entity.summary ?? '', 180)
      cloned.payload.entity.context = allowRichContext
        ? trimPlannerText(cloned.payload.entity.context ?? '', 420)
        : ''
    }
    if (cloned.op === 'update_entity') {
      if (typeof cloned.payload.changes.summary === 'string') {
        cloned.payload.changes.summary = trimPlannerText(cloned.payload.changes.summary, 180)
      }
      if (typeof cloned.payload.changes.context === 'string') {
        cloned.payload.changes.context = allowRichContext
          ? trimPlannerText(cloned.payload.changes.context, 420)
          : undefined
      }
    }
    if (cloned.op === 'upsert_relationship' && typeof cloned.payload.relationship.notes === 'string') {
      cloned.payload.relationship.notes = trimPlannerText(cloned.payload.relationship.notes, 220)
    }
    if (cloned.op === 'update_relationship' && typeof cloned.payload.changes.notes === 'string') {
      cloned.payload.changes.notes = trimPlannerText(cloned.payload.changes.notes, 220)
    }
    return cloned
  })

  return worldPromptPlannerSchema.parse({
    ...input.plan,
    assistantSummary: capAssistantSummary(input.plan.assistantSummary, input.mode),
    answer: input.mode === 'advisory_diagnosis' ? trimPlannerText(input.plan.answer ?? '', 320) : '',
    wave1Ops: normalizedOps,
    operations: normalizedOps,
    suggestionCandidates: input.plan.suggestionCandidates.slice(0, input.mode === 'advisory_diagnosis' ? 4 : 3),
    optionCandidates: input.mode === 'advisory_diagnosis' ? input.plan.optionCandidates.slice(0, 4) : [],
    wave2Ideas: input.mode === 'advisory_diagnosis' ? input.plan.wave2Ideas.slice(0, 2) : [],
    optionalIdeas: input.mode === 'advisory_diagnosis' ? input.plan.optionalIdeas.slice(0, 2) : [],
    diagnosticFindings: input.mode === 'advisory_diagnosis' ? input.plan.diagnosticFindings.slice(0, 4) : [],
  })
}

function creativeCompletionAppliesToPlan(mode: PlannerMode, classification: WorldPromptClassification) {
  if (!['direct_build', 'refinement'].includes(mode)) return false
  return classification === 'graphable_direct' || classification === 'refinement_only'
}

function summarizeCreativeDescriptorIssues(issues: CreativeDescriptorIssue[]) {
  if (issues.length === 0) return ''
  return issues
    .slice(0, 3)
    .map((issue) => (
      issue.kind === 'placeholder_entity'
        ? `entity "${issue.entityName}" is still a placeholder`
        : `${issue.endpoint ?? 'relationship'} endpoint "${issue.entityName}" is still unresolved`
    ))
    .join('; ')
}

function stripPlannerOpsForCreativeDescriptorIssues(input: {
  plan: z.infer<typeof worldPromptPlannerSchema>
  issues: CreativeDescriptorIssue[]
}) {
  if (input.issues.length === 0) return input.plan
  const blockedOpIds = new Set(input.issues.map((issue) => issue.opId))
  const filteredOps = input.plan.wave1Ops.filter((op) => !blockedOpIds.has(op.id))
  const filteredOperations = input.plan.operations.filter((op) => !blockedOpIds.has(op.id))
  const note = 'Held back one or more unnamed support entities because they were not grounded in concrete canon yet.'

  return worldPromptPlannerSchema.parse({
    ...input.plan,
    assistantSummary: trimPlannerText(
      [input.plan.assistantSummary, note].filter(Boolean).join(' ').trim(),
      180,
    ),
    wave1Ops: filteredOps,
    operations: filteredOperations,
  })
}

async function supersedeActiveSessionSuggestions(client: SupabaseClient, sessionId: string, excludeIds: string[] = []) {
  const activeSuggestions = await loadActiveSessionSuggestions(client, sessionId)
  const targets = activeSuggestions.filter((suggestion) => !excludeIds.includes(suggestion.id))
  if (targets.length === 0) return

  const timestamp = new Date().toISOString()
  await Promise.all(targets.map(async (suggestion) => {
    const response = await client
      .from('world_prompt_suggestions')
      .update({
        state: 'superseded',
        metadata: {
          ...(suggestion.metadata ?? {}),
          supersededAt: timestamp,
        },
      })
      .eq('id', suggestion.id)
    if (response.error) throw new Error(response.error.message)
  }))
}

async function markSuggestionUsed(client: SupabaseClient, suggestionId: string, usedTurnId: string) {
  const suggestion = await loadSuggestionById(client, suggestionId)
  const response = await client
    .from('world_prompt_suggestions')
    .update({
      state: 'used',
      used_turn_id: usedTurnId,
      metadata: {
        ...(suggestion?.metadata ?? {}),
        usedAt: new Date().toISOString(),
      },
    })
    .eq('id', suggestionId)
    .select(SUGGESTION_SELECT)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return response.data ? mapSuggestionRow(response.data as WorldPromptSuggestionRow) : null
}

async function persistSessionSuggestions(input: {
  client: SupabaseClient
  draftId: string
  sessionId: string
  turnId: string | null
  selectedThreadKey?: string | null
  sourcePrompt?: string | null
  suggestions: WorldPromptSuggestion[]
}) {
  await supersedeActiveSessionSuggestions(input.client, input.sessionId)
  const sanitizedSuggestions = dedupeSuggestions(input.suggestions)
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
  if (sanitizedSuggestions.length === 0) return []
  const response = await input.client
    .from('world_prompt_suggestions')
    .insert(sanitizedSuggestions.map((suggestion, index) => ({
      draft_id: input.draftId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      thread_key: suggestion.threadKey ?? input.selectedThreadKey ?? null,
      label: suggestion.label,
      prompt: suggestion.prompt,
      kind: suggestion.kind,
      style: suggestion.style,
      source: suggestion.source,
      summary: suggestion.summary ?? null,
      estimated_node_count: suggestion.estimatedNodeCount ?? null,
      estimated_edge_count: suggestion.estimatedEdgeCount ?? null,
      will_queue_images: suggestion.willQueueImages,
      will_queue_cinematics: suggestion.willQueueCinematics,
      state: 'active',
      rank: index,
      metadata: {
        promptSuggestionId: suggestion.id,
        generatedFromTurnId: suggestion.generatedFromTurnId ?? input.turnId,
        generatedReason: suggestionGeneratedReason({
          suggestion,
          selectedThreadKey: input.selectedThreadKey,
        }),
        uiKind: suggestionUiKind(suggestion),
        executionMode: suggestion.executionMode ?? null,
        actionMode: suggestion.actionMode ?? null,
        applyPolicy: suggestion.applyPolicy ?? null,
        targetEntityKeys: suggestion.targetEntityKeys ?? [],
        targetThreadKeys: suggestion.targetThreadKeys ?? [],
        focusLayer: suggestion.focusLayer ?? null,
        retrievalHint: suggestion.retrievalHint ?? '',
      },
    })))
    .select(SUGGESTION_SELECT)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptSuggestionRow[])
    .map(mapSuggestionRow)
    .filter((suggestion): suggestion is WorldPromptSuggestionRecord => Boolean(suggestion))
}

async function updateSessionLifecycle(input: {
  client: SupabaseClient
  session: WorldPromptSession
  prompt: string
  assistantSummary: string
  selectedRootEntityKey?: string | null
  selectedViewKey?: string | null
  selectedThreadKey?: string | null
  summaryMemory: string
  sessionMemoryState?: WorldPromptSessionMemoryState | null
  retrievalDiagnostics?: {
    focusLayer: PlannerFocusLayer
    continuityMode: WorldPromptContinuityMode
    retrievedEntityKeys: string[]
    retrievedThreadKeys: string[]
  } | null
}) {
  const currentMetadata = (input.session.metadata ?? {}) as Record<string, unknown>
  const titleSource = typeof currentMetadata.titleSource === 'string' ? currentMetadata.titleSource : 'auto'
  const nextTitle = titleSource === 'manual'
    ? input.session.title
    : deriveAutoSessionTitle({ prompt: input.prompt, assistantSummary: input.assistantSummary })
  const response = await input.client
    .from('world_prompt_sessions')
    .update({
      title: nextTitle,
      status: 'active',
      is_active: true,
      summary_memory: input.summaryMemory,
      selected_root_entity_key: input.selectedRootEntityKey ?? input.session.selectedRootEntityKey,
      selected_view_key: input.selectedViewKey ?? input.session.selectedViewKey,
      last_context: {
        ...(input.session.lastContext ?? {}),
        lastPrompt: input.prompt,
        assistantSummary: input.assistantSummary,
        selectedRootEntityKey: input.selectedRootEntityKey ?? input.session.selectedRootEntityKey,
        selectedViewKey: input.selectedViewKey ?? input.session.selectedViewKey,
        selectedThreadKey: input.selectedThreadKey ?? null,
        focusLayer: input.retrievalDiagnostics?.focusLayer ?? null,
        continuityMode: input.retrievalDiagnostics?.continuityMode ?? null,
        retrievedEntityKeys: input.retrievalDiagnostics?.retrievedEntityKeys ?? [],
        retrievedThreadKeys: input.retrievalDiagnostics?.retrievedThreadKeys ?? [],
        memoryState: input.sessionMemoryState ?? readSessionMemoryState({
          lastContext: input.session.lastContext,
          summaryMemory: input.summaryMemory,
          selectedRootEntityKey: input.selectedRootEntityKey ?? input.session.selectedRootEntityKey,
          selectedViewKey: input.selectedViewKey ?? input.session.selectedViewKey,
          selectedThreadKey: input.selectedThreadKey ?? null,
        }),
      },
      metadata: {
        ...currentMetadata,
        titleSource,
        hasUnreadUpdates: false,
        lastSuggestionRefreshAt: new Date().toISOString(),
        sessionMode: typeof currentMetadata.sessionMode === 'string' ? currentMetadata.sessionMode : 'normal',
        lastRetrievalDiagnostics: input.retrievalDiagnostics ?? null,
      },
    })
    .eq('id', input.session.id)
    .select(SESSION_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapSessionRow(response.data as WorldPromptSessionRow)
}

function emptyScopeCounts(): PromptScopeCounts {
  return {
    actionableOps: 0,
    entityOps: 0,
    relationshipOps: 0,
    existingEntityModificationOps: 0,
    queueOps: 0,
    derivedResultOps: 0,
  }
}

function isPlanOnlyPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  return normalized.includes('plan only')
    || normalized.includes('do not apply')
    || normalized.includes('no mutations')
    || normalized.includes('preview only')
}

function resolveEntityReference(
  snapshot: WorldPromptSnapshot,
  input: {
    entityKey?: string | null
    definitionKey?: string | null
    name?: string | null
    alias?: string | null
    nodeTypeHint?: WorldEntity['nodeType'] | null
    strictNodeType?: boolean
  },
) {
  const byKey = input.entityKey ? snapshot.worldEntities.find((entity) => entity.key === input.entityKey) ?? null : null
  if (byKey) {
    return { entity: byKey, candidates: [byKey], matchType: 'exact_key' as const }
  }

  const byDefinitionKey = input.definitionKey
    ? snapshot.worldEntities.find((entity) => entity.linkedDefinitionKey === input.definitionKey) ?? null
    : null
  if (byDefinitionKey) {
    return { entity: byDefinitionKey, candidates: [byDefinitionKey], matchType: 'definition' as const }
  }

  const probeVariants = Array.from(new Set([
    ...buildNameVariants(input.name ?? ''),
    ...buildNameVariants(input.alias ?? ''),
  ]))
  const probe = probeVariants[0] ?? ''
  if (!probeVariants.length) {
    return { entity: null, candidates: [], matchType: 'none' as const }
  }

  const searchableEntities = input.nodeTypeHint
    ? (() => {
        const sameType = snapshot.worldEntities.filter((entity) => entity.nodeType === input.nodeTypeHint)
        return input.strictNodeType ? sameType : sameType.length > 0 ? sameType : snapshot.worldEntities
      })()
    : snapshot.worldEntities

  const exactCandidates = searchableEntities.filter((entity) => {
    const names = [entity.name, ...entity.aliases]
    return names.some((value) => {
      const variants = buildNameVariants(value)
      return variants.some((variant) => probeVariants.includes(variant))
    })
  })
  if (exactCandidates.length === 1) {
    return { entity: exactCandidates[0], candidates: exactCandidates, matchType: 'exact_name' as const }
  }
  if (exactCandidates.length > 1) {
    return { entity: null, candidates: exactCandidates, matchType: 'ambiguous_exact' as const }
  }

  const containmentCandidates = searchableEntities.filter((entity) => {
    const names = [entity.name, ...entity.aliases]
    return names.some((value) => {
      const variants = buildNameVariants(value)
      return variants.some((variant) => (
        probeVariants.some((probeVariant) => (
          probeVariant.length >= 4
          && variant.length >= 4
          && (variant.includes(probeVariant) || probeVariant.includes(variant))
        ))
      ))
    })
  })
  if (containmentCandidates.length === 1) {
    return { entity: containmentCandidates[0], candidates: containmentCandidates, matchType: 'containment' as const }
  }
  if (containmentCandidates.length > 1) {
    return { entity: null, candidates: containmentCandidates, matchType: 'ambiguous_containment' as const }
  }

  const scored = searchableEntities
    .map((entity) => ({
      entity,
      score: Math.max(
        ...[entity.name, ...entity.aliases].flatMap((value) => (
          buildNameVariants(value).flatMap((variant) => probeVariants.map((probeVariant) => diceCoefficient(probeVariant, variant)))
        )),
      ),
    }))
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => right.score - left.score)

  if (scored.length === 1) {
    return { entity: scored[0].entity, candidates: [scored[0].entity], matchType: 'fuzzy' as const }
  }
  if (scored.length > 1) {
    return { entity: null, candidates: scored.map((entry) => entry.entity), matchType: 'ambiguous_fuzzy' as const }
  }

  return { entity: null, candidates: [], matchType: 'none' as const }
}

function entityReferenceNameMatches(entity: WorldEntity, name?: string | null, alias?: string | null) {
  const probeVariants = Array.from(new Set([
    ...buildNameVariants(name ?? ''),
    ...buildNameVariants(alias ?? ''),
  ]))
  if (probeVariants.length === 0) return true
  const entityVariants = [entity.name, ...entity.aliases].flatMap((value) => buildNameVariants(value))
  return entityVariants.some((variant) => probeVariants.includes(variant))
}

function resolveRelationshipEndpointReference(
  snapshot: WorldPromptSnapshot,
  input: {
    entityKey?: string | null
    definitionKey?: string | null
    name?: string | null
    alias?: string | null
  },
) {
  const resolved = resolveEntityReference(snapshot, input)
  if (
    resolved.entity
    && resolved.matchType === 'exact_key'
    && input.entityKey
    && (input.name || input.alias)
    && !entityReferenceNameMatches(resolved.entity, input.name, input.alias)
  ) {
    return resolveEntityReference(snapshot, {
      definitionKey: input.definitionKey,
      name: input.name,
      alias: input.alias,
    })
  }
  return resolved
}

function determineDefinitionKind(nodeType: WorldEntity['nodeType']): DefinitionBase['kind'] | null {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'group':
      return 'group'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    case 'concept':
      return 'concept'
    case 'event':
      return 'event'
    default:
      return null
  }
}

function buildWorldEntityKey(snapshot: WorldPromptSnapshot, nodeType: WorldEntity['nodeType'], name: string) {
  const base = `world.${nodeType}.${slugify(name)}`
  let candidate = base
  let index = 2
  while (snapshot.worldEntities.some((entity) => entity.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldRelationshipKey(snapshot: WorldPromptSnapshot, sourceKey: string, verb: string, targetKey: string) {
  const base = `world.relationship.${slugify(`${sourceKey}-${verb}-${targetKey}`)}`
  let candidate = base
  let index = 2
  while (snapshot.worldRelationships.some((relationship) => relationship.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldOperatorKey(snapshot: WorldPromptSnapshot, sourceKey: string, operatorType: string, targetKey: string) {
  const base = `world.operator.${slugify(`${sourceKey}-${operatorType}-${targetKey}`)}`
  let candidate = base
  let index = 2
  while (snapshot.worldOperators.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldResultKey(snapshot: WorldPromptSnapshot, title: string) {
  const base = `world.result.${slugify(title)}`
  let candidate = base
  let index = 2
  while (snapshot.worldResults.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldConnectionKey(snapshot: WorldPromptSnapshot, seed: string) {
  const base = `world.connection.${slugify(seed)}`
  let candidate = base
  let index = 2
  while (snapshot.worldGraphConnections.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function isProjectedCreate(op: PromptToWorldOp) {
  return op.op === 'upsert_entity' && op.metadata?.projectedCreate === true
}

function countScopeOps(ops: PromptToWorldOp[], snapshot: WorldPromptSnapshot) {
  const counts = emptyScopeCounts()
  for (const op of ops) {
    if (op.op === 'assistant_note') continue
    counts.actionableOps += 1
    if (op.op === 'upsert_entity' || op.op === 'update_entity' || op.op === 'replace_entity') {
      counts.entityOps += 1
      const targetsExisting =
        op.op === 'update_entity'
          || op.op === 'replace_entity'
          || (
            op.op === 'upsert_entity'
            && !isProjectedCreate(op)
            && Boolean(
              op.payload.targetEntityKey
              && snapshot.worldEntities.some((entity) => entity.key === op.payload.targetEntityKey),
            )
          )
      if (targetsExisting) {
        counts.existingEntityModificationOps += 1
      }
      continue
    }
    if (op.op === 'upsert_relationship' || op.op === 'update_relationship') {
      counts.relationshipOps += 1
      continue
    }
    if (op.op === 'queue_image_generation' || op.op === 'queue_cinematic_generation') {
      counts.queueOps += 1
      continue
    }
    if (op.op === 'create_derived_result') {
      counts.derivedResultOps += 1
    }
  }
  return counts
}

function exceedsScopeCaps(counts: PromptScopeCounts, caps: PromptScopeCaps) {
  return counts.entityOps > caps.entityOps
    || counts.relationshipOps > caps.relationshipOps
    || counts.existingEntityModificationOps > caps.existingEntityModificationOps
    || counts.queueOps > caps.queueOps
    || counts.derivedResultOps > caps.derivedResultOps
}

function directScopeCapsForPrompt(prompt: string, isSuggestionDriven?: boolean): PromptScopeCaps {
  if (isSuggestionDriven) return SUGGESTION_DRIVEN_SCOPE_CAPS
  const requirements = analyzeWorldPromptEntityRequirements(prompt)
  if (!requirements.hasExplicitCount && !requirements.hasSeedWorldShape) return DIRECT_SCOPE_CAPS
  return {
    ...DIRECT_SCOPE_CAPS,
    entityOps: Math.max(DIRECT_SCOPE_CAPS.entityOps, requirements.minimumEntityOps + 2),
    relationshipOps: Math.max(DIRECT_SCOPE_CAPS.relationshipOps, Math.ceil((requirements.minimumEntityOps + 2) * 1.5)),
  }
}

function stagedScopeCapsForPrompt(prompt: string): PromptScopeCaps {
  const requirements = analyzeWorldPromptEntityRequirements(prompt)
  if (!requirements.hasExplicitCount) return STAGED_SCOPE_CAPS
  return {
    ...STAGED_SCOPE_CAPS,
    entityOps: Math.max(STAGED_SCOPE_CAPS.entityOps, requirements.minimumEntityOps),
    relationshipOps: Math.max(STAGED_SCOPE_CAPS.relationshipOps, requirements.minimumEntityOps + 4),
  }
}

function promptIncludesAny(prompt: string, probes: string[]) {
  const normalized = normalizeName(prompt)
  return probes.some((probe) => normalized.includes(normalizeName(probe)))
}

function scorePromptOpForStaging(op: PromptToWorldOp, prompt: string) {
  const requirements = analyzeWorldPromptEntityRequirements(prompt)
  if (op.op === 'assistant_note') return -10
  if (op.op === 'replace_entity') {
    const replacementName = op.payload.replacementMode === 'create' ? op.payload.replacementEntity?.name ?? '' : op.payload.replacementEntityKey ?? ''
    const nameBoost = promptIncludesAny(prompt, [op.payload.targetEntityKey, replacementName]) ? 40 : 0
    return 130 + nameBoost
  }
  if (op.op === 'upsert_entity') {
    const nameBoost = promptIncludesAny(prompt, [op.payload.entity.name, ...op.payload.entity.aliases]) ? 30 : 0
    const requiredTypeBoost = (requirements.counts[op.payload.entity.nodeType] ?? 0) > 0 ? 34 : 0
    const anchorBoost = op.payload.entity.nodeType === 'place' || op.payload.entity.nodeType === 'event' ? 20 : 0
    const peopleBoost = op.payload.entity.nodeType === 'actor' || op.payload.entity.nodeType === 'group' ? 16 : 0
    const loreBoost = op.payload.entity.nodeType === 'concept' ? 8 : 0
    return 120 + nameBoost + requiredTypeBoost + anchorBoost + peopleBoost + loreBoost
  }
  if (op.op === 'upsert_relationship') {
    return 90
  }
  if (op.op === 'update_entity') {
    return 70
  }
  if (op.op === 'update_relationship') {
    return 60
  }
  if (op.op === 'create_derived_result') {
    return promptIncludesAny(prompt, ['scene', 'staged', 'paired', 'wear', 'equip']) ? 75 : 45
  }
  if (op.op === 'queue_image_generation') {
    return promptIncludesAny(prompt, ['image', 'portrait', 'visual', 'look']) ? 40 : 20
  }
  if (op.op === 'queue_cinematic_generation') {
    return promptIncludesAny(prompt, ['cinematic', 'scene', 'shot', 'trailer', 'storyboard', 'cutscene']) ? 35 : 10
  }
  return 0
}

function resolveStagingEntityKeys(op: PromptToWorldOp) {
  if (op.op === 'upsert_entity') {
    return [op.payload.targetEntityKey].filter((value): value is string => Boolean(value))
  }
  if (op.op === 'replace_entity') {
    return [
      op.payload.targetEntityKey,
      op.payload.replacementMode === 'existing'
        ? op.payload.replacementEntityKey
        : null,
    ].filter((value): value is string => Boolean(value))
  }
  if (op.op === 'upsert_relationship') {
    return [op.payload.relationship.sourceEntityKey, op.payload.relationship.targetEntityKey].filter((value): value is string => Boolean(value))
  }
  if (op.op === 'update_entity') {
    return [op.payload.targetEntityKey]
  }
  if (op.op === 'queue_image_generation') {
    return [op.payload.targetEntityKey]
  }
  if (op.op === 'create_derived_result') {
    return [op.payload.sourceEntityKey, op.payload.targetEntityKey]
  }
  if (op.op === 'queue_cinematic_generation') {
    return op.payload.relatedEntityKeys
  }
  return []
}

function buildPromptSuggestion(input: {
  id: string
  label: string
  prompt: string
  kind: WorldPromptSuggestion['kind']
  style?: WorldPromptSuggestion['style']
  source?: WorldPromptSuggestion['source']
  threadKey?: string | null
  summary?: string
  estimatedNodeCount?: number
  estimatedEdgeCount?: number
  willQueueImages?: boolean
  willQueueCinematics?: boolean
  uiKind?: WorldPromptSuggestion['uiKind']
  executionMode?: WorldPromptSuggestion['executionMode']
  actionMode?: WorldPromptSuggestion['actionMode']
  applyPolicy?: WorldPromptSuggestion['applyPolicy']
  targetEntityKeys?: string[]
  targetThreadKeys?: string[]
  focusLayer?: WorldPromptSuggestion['focusLayer']
  retrievalHint?: string
  generatedReason?: string
  generatedFromTurnId?: string | null
}) {
  return sanitizeSuggestionRecord({
    id: input.id,
    label: input.label,
    prompt: input.prompt,
    summary: input.summary ?? '',
    kind: input.kind,
    style: input.style ?? 'secondary',
    source: input.source ?? 'repair',
    threadKey: input.threadKey ?? null,
    estimatedNodeCount: input.estimatedNodeCount ?? 0,
    estimatedEdgeCount: input.estimatedEdgeCount ?? 0,
    willQueueImages: input.willQueueImages ?? false,
    willQueueCinematics: input.willQueueCinematics ?? false,
    uiKind: input.uiKind,
    executionMode: input.executionMode,
    actionMode: input.actionMode,
    applyPolicy: input.applyPolicy,
    targetEntityKeys: input.targetEntityKeys ?? [],
    targetThreadKeys: input.targetThreadKeys ?? [],
    focusLayer: input.focusLayer,
    retrievalHint: input.retrievalHint ?? '',
    generatedReason: input.generatedReason,
    generatedFromTurnId: input.generatedFromTurnId ?? undefined,
  })
}

function dedupeSuggestions(suggestions: WorldPromptSuggestion[]) {
  const seen = new Set<string>()
  const deduped: WorldPromptSuggestion[] = []
  for (const suggestion of suggestions) {
    if (!suggestion.label.trim() || !suggestion.prompt.trim()) continue
    if (seen.has(suggestion.label)) continue
    seen.add(suggestion.label)
    deduped.push(suggestion)
  }
  return deduped.slice(0, 4)
}

function canonicalThreadPrompt(input: {
  thread: WorldThread
  mode?: 'continue' | 'plan'
}) {
  if (input.mode === 'plan') {
    return `Plan only the next best beat for the world thread "${input.thread.title}". Preserve existing canon and do not apply graph mutations.`
  }
  return `Continue the world thread "${input.thread.title}" with one compact additive step that builds on: ${input.thread.summary || input.thread.title}.`
}

function suggestionsFromPlannerIdeas(input: {
  ideas: Array<z.infer<typeof plannerIdeaSchema>>
  fallbackKind: WorldPromptSuggestion['kind']
}) {
  return input.ideas.flatMap((idea) => {
    const suggestion = buildPromptSuggestion({
      id: idea.id,
      label: idea.label,
      prompt: idea.prompt,
      kind: idea.kind ?? input.fallbackKind,
      style: idea.style,
      source: idea.source,
      threadKey: idea.threadKey,
      summary: idea.summary,
      estimatedNodeCount: idea.estimatedNodeCount,
      estimatedEdgeCount: idea.estimatedEdgeCount,
      willQueueImages: idea.willQueueImages,
      willQueueCinematics: idea.willQueueCinematics,
      uiKind: idea.uiKind,
      executionMode: idea.executionMode,
      actionMode: idea.actionMode,
      applyPolicy: idea.applyPolicy,
      targetEntityKeys: idea.targetEntityKeys,
      targetThreadKeys: idea.targetThreadKeys,
      focusLayer: idea.focusLayer,
      retrievalHint: idea.retrievalHint,
      generatedReason: idea.generatedReason,
      generatedFromTurnId: idea.generatedFromTurnId,
    })
    return suggestion ? [suggestion] : []
  })
}

function buildThreadAwareSuggestions(input: {
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
}) {
  const rankedThreads = [...input.snapshot.worldThreads]
    .filter((thread) => thread.status === 'open')
    .sort((left, right) => {
      const leftPriority = left.priority === 'primary' ? 0 : left.priority === 'secondary' ? 1 : 2
      const rightPriority = right.priority === 'primary' ? 0 : right.priority === 'secondary' ? 1 : 2
      return leftPriority - rightPriority || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })

  const selectedThread = input.selectedThreadKey
    ? rankedThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    : null

  const seedThreads = [
    selectedThread,
    ...rankedThreads.filter((thread) => !selectedThread || thread.key !== selectedThread.key),
  ].filter((thread): thread is WorldThread => Boolean(thread)).slice(0, 3)

  return dedupeSuggestions([
    ...seedThreads.flatMap((thread, index) => {
      const suggestion = buildPromptSuggestion({
        id: `thread-${thread.key}-continue`,
        label: thread.title,
        prompt: canonicalThreadPrompt({ thread, mode: 'continue' }),
        kind: 'continue_scope',
        style: index === 0 ? 'primary' : 'secondary',
        source: 'thread',
        threadKey: thread.key,
        summary: thread.summary || 'Continue this active world thread with one compact additive beat.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 2,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetThreadKeys: [thread.key],
        targetEntityKeys: thread.linkedEntityKeys.slice(0, 6),
        retrievalHint: canonicalThreadPrompt({ thread, mode: 'continue' }),
      })
      return suggestion ? [suggestion] : []
    }),
  ])
}

type DirectFollowUpRole = 'protagonist' | 'villain' | 'ruler'

type DirectFollowUpSeed = {
  key: string | null
  name: string
  nodeType: WorldEntity['nodeType']
  summary: string
  context: string
  tags: string[]
  aliases: string[]
  relationCount: number
  roleHints: Set<DirectFollowUpRole>
}

type DirectFollowUpAnalysis = {
  createdSeeds: DirectFollowUpSeed[]
  protagonistSeed: DirectFollowUpSeed | null
  villainSeed: DirectFollowUpSeed | null
  rulerSeed: DirectFollowUpSeed | null
  primaryActorSeed: DirectFollowUpSeed | null
  primaryPlaceSeed: DirectFollowUpSeed | null
  primaryLoreSeed: DirectFollowUpSeed | null
  primaryEventSeed: DirectFollowUpSeed | null
  mainPlaceSeed: DirectFollowUpSeed | null
  createdTypes: Set<WorldEntity['nodeType']>
  hasActors: boolean
  hasGroups: boolean
  hasPlaces: boolean
  hasLore: boolean
  hasEvent: boolean
  promptLower: string
  impliesPowerStructure: boolean
  impliesConflict: boolean
  impliesLore: boolean
  impliesSetting: boolean
  broadWorldSeed: boolean
  groupCount: number
}

function lowerCaseTextParts(...parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value)).join(' ').toLowerCase()
}

function uniqueEntityKeys(values: Array<string | null | undefined>, limit = 4) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).slice(0, limit)
}

function findPromptRoleCue(promptLower: string, name: string, roleTerms: string[]) {
  const normalizedName = name.trim().toLowerCase()
  if (!normalizedName) return false
  let cursor = promptLower.indexOf(normalizedName)
  while (cursor >= 0) {
    const window = promptLower.slice(Math.max(0, cursor - 96), cursor + normalizedName.length + 96)
    if (roleTerms.some((term) => window.includes(term))) {
      return true
    }
    cursor = promptLower.indexOf(normalizedName, cursor + normalizedName.length)
  }
  return false
}

function detectDirectFollowUpRoles(seed: {
  name: string
  summary: string
  context: string
  tags: string[]
  aliases: string[]
}, prompt: string) {
  const promptLower = prompt.toLowerCase()
  const entityText = lowerCaseTextParts(seed.summary, seed.context, seed.tags.join(' '), seed.aliases.join(' '))
  const roleHints = new Set<DirectFollowUpRole>()
  const protagonistTerms = ['protagonist', 'hero', 'main character', 'lead character', 'point-of-view character', 'heir apparent']
  const villainTerms = ['villain', 'antagonist', 'enemy', 'nemesis', 'traitor', 'usurper']
  const rulerTerms = ['ruler', 'queen', 'king', 'emperor', 'empress', 'monarch', 'sovereign', 'lord of', 'lady of']

  if (
    protagonistTerms.some((term) => entityText.includes(term))
    || findPromptRoleCue(promptLower, seed.name, protagonistTerms)
  ) {
    roleHints.add('protagonist')
  }
  if (
    villainTerms.some((term) => entityText.includes(term))
    || findPromptRoleCue(promptLower, seed.name, villainTerms)
  ) {
    roleHints.add('villain')
  }
  if (
    rulerTerms.some((term) => entityText.includes(term))
    || findPromptRoleCue(promptLower, seed.name, rulerTerms)
  ) {
    roleHints.add('ruler')
  }
  return roleHints
}

function scoreDirectFollowUpSeed(seed: DirectFollowUpSeed) {
  let score = seed.relationCount * 4
  if (seed.roleHints.has('protagonist')) score += 30
  if (seed.roleHints.has('villain')) score += 28
  if (seed.roleHints.has('ruler')) score += 24
  if (seed.nodeType === 'actor') score += 8
  if (seed.nodeType === 'place') score += 6
  if (seed.nodeType === 'concept' || seed.nodeType === 'object') score += 6
  return score
}

function pickBestSeed(seeds: DirectFollowUpSeed[], predicate: (seed: DirectFollowUpSeed) => boolean) {
  return seeds
    .filter(predicate)
    .sort((left, right) => scoreDirectFollowUpSeed(right) - scoreDirectFollowUpSeed(left))[0] ?? null
}

function analyzeDirectFollowUpWorld(input: {
  prompt: string
  ops: PromptToWorldOp[]
}) {
  const createdEntityOps = input.ops.filter((op): op is Extract<PromptToWorldOp, { op: 'upsert_entity' }> => op.op === 'upsert_entity')
  const relationshipOps = input.ops.filter((op): op is Extract<PromptToWorldOp, { op: 'upsert_relationship' }> => op.op === 'upsert_relationship')
  const createdTypes = new Set(createdEntityOps.map((op) => op.payload.entity.nodeType))
  const relationCountByKey = new Map<string, number>()
  for (const relationshipOp of relationshipOps) {
    const sourceKey = relationshipOp.payload.relationship.sourceEntityKey
    const targetKey = relationshipOp.payload.relationship.targetEntityKey
    if (sourceKey) relationCountByKey.set(sourceKey, (relationCountByKey.get(sourceKey) ?? 0) + 1)
    if (targetKey) relationCountByKey.set(targetKey, (relationCountByKey.get(targetKey) ?? 0) + 1)
  }

  const createdSeeds: DirectFollowUpSeed[] = createdEntityOps.map((op) => ({
    key: op.payload.targetEntityKey,
    name: op.payload.entity.name,
    nodeType: op.payload.entity.nodeType,
    summary: op.payload.entity.summary ?? '',
    context: op.payload.entity.context ?? '',
    tags: op.payload.entity.tags ?? [],
    aliases: op.payload.entity.aliases ?? [],
    relationCount: op.payload.targetEntityKey ? (relationCountByKey.get(op.payload.targetEntityKey) ?? 0) : 0,
    roleHints: detectDirectFollowUpRoles({
      name: op.payload.entity.name,
      summary: op.payload.entity.summary ?? '',
      context: op.payload.entity.context ?? '',
      tags: op.payload.entity.tags ?? [],
      aliases: op.payload.entity.aliases ?? [],
    }, input.prompt),
  }))

  const protagonistSeed = pickBestSeed(createdSeeds, (seed) => seed.roleHints.has('protagonist'))
  const villainSeed = pickBestSeed(createdSeeds, (seed) => seed.roleHints.has('villain'))
  const rulerSeed = pickBestSeed(createdSeeds, (seed) => seed.roleHints.has('ruler'))
  const primaryActorSeed = pickBestSeed(createdSeeds, (seed) => seed.nodeType === 'actor' || seed.nodeType === 'group')
  const primaryPlaceSeed = pickBestSeed(createdSeeds, (seed) => seed.nodeType === 'place')
  const primaryLoreSeed = pickBestSeed(createdSeeds, (seed) => seed.nodeType === 'concept' || seed.nodeType === 'object')
  const primaryEventSeed = pickBestSeed(createdSeeds, (seed) => seed.nodeType === 'event')
  const mainPlaceSeed = primaryPlaceSeed ?? pickBestSeed(createdSeeds, (seed) => seed.nodeType === 'group')
  const hasActors = createdTypes.has('actor') || createdTypes.has('group')
  const hasGroups = createdTypes.has('group')
  const hasPlaces = createdTypes.has('place')
  const hasLore = createdTypes.has('concept') || createdTypes.has('event') || createdTypes.has('object')
  const hasEvent = createdTypes.has('event')
  const promptLower = input.prompt.toLowerCase()
  const impliesPowerStructure = /\b(kingdom|realm|empire|court|crown|throne|ruler|queen|king|emperor|empress|dynasty|house|council)\b/i.test(input.prompt)
  const impliesConflict = /\b(villain|antagonist|threat|danger|failing|failure|sabotage|war|conflict|scheme|plot|conspiracy|enemy|exile|rebellion)\b/i.test(input.prompt)
  const impliesLore = /\b(lore|history|myth|belief|taboo|ancient|ritual|prophecy|forbidden|mystery)\b/i.test(input.prompt)
  const impliesSetting = /\b(kingdom|realm|city|capital|district|harbor|border|wilderness|region|province|island)\b/i.test(input.prompt)
  const broadWorldSeed = impliesConflict && (hasActors || hasPlaces || hasLore)
  const groupCount = createdSeeds.filter((seed) => seed.nodeType === 'group').length

  return {
    createdSeeds,
    protagonistSeed,
    villainSeed,
    rulerSeed,
    primaryActorSeed,
    primaryPlaceSeed,
    primaryLoreSeed,
    primaryEventSeed,
    mainPlaceSeed,
    createdTypes,
    hasActors,
    hasGroups,
    hasPlaces,
    hasLore,
    hasEvent,
    promptLower,
    impliesPowerStructure,
    impliesConflict,
    impliesLore,
    impliesSetting,
    broadWorldSeed,
    groupCount,
  } satisfies DirectFollowUpAnalysis
}

function buildDirectFollowUpSuggestions(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
  selectedThreadKey?: string | null
}) {
  const analysis = analyzeDirectFollowUpWorld({
    prompt: input.prompt,
    ops: input.ops,
  })
  const {
    createdSeeds,
    protagonistSeed,
    villainSeed,
    rulerSeed,
    primaryActorSeed,
    primaryPlaceSeed,
    primaryLoreSeed,
    primaryEventSeed,
    mainPlaceSeed,
    createdTypes,
    hasActors,
    hasGroups,
    hasPlaces,
    hasLore,
    hasEvent,
    promptLower,
    impliesPowerStructure,
    impliesConflict,
    impliesLore,
    impliesSetting,
    broadWorldSeed,
    groupCount,
  } = analysis

  const rawSuggestions: Array<{
    score: number
    suggestion: Omit<Parameters<typeof buildPromptSuggestion>[0], 'style'>
  }> = []

  if (protagonistSeed || primaryActorSeed) {
    const actorSeed = protagonistSeed ?? primaryActorSeed
    rawSuggestions.push({
      score: 88
        + (protagonistSeed ? 22 : 0)
        + ((actorSeed?.relationCount ?? 0) <= 1 ? 10 : 0)
        + (broadWorldSeed ? 8 : 0),
      suggestion: {
        id: 'direct-followup-characters',
        label: protagonistSeed ? `Expand ${protagonistSeed.name}'s Circle` : 'Expand Key Characters',
        prompt: protagonistSeed
          ? `Expand ${protagonistSeed.name} by adding only the next close ally, rival, dependent, or confidant who will matter most. Tie them directly to the current pressure on the world.`
          : actorSeed
            ? `Continue from ${actorSeed.name} by adding only the next close allies, rivals, or dependents that matter most. Keep it compact and additive.`
            : 'Continue from the current world by adding only the next key allies, rivals, or dependents that matter most. Keep it compact and additive.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: protagonistSeed
          ? `Deepen ${protagonistSeed.name} through the closest relationships that will create pressure next.`
          : 'Deepen the cast around the strongest current character anchor.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 3,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([actorSeed?.key, rulerSeed?.key, villainSeed?.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: 'actor',
        retrievalHint: protagonistSeed ? `expand ${protagonistSeed.name} relationships` : 'character_followup',
        generatedReason: protagonistSeed
          ? 'The prompt seeded a likely protagonist, so the next high-value move is to define the people closest to them.'
          : 'The world seed introduced central characters, so the next high-value move is relationship depth rather than broad expansion.',
      },
    })
  }

  if (villainSeed || impliesConflict) {
    rawSuggestions.push({
      score: 82
        + (villainSeed ? 24 : 0)
        + (!hasEvent ? 8 : 0)
        + (broadWorldSeed ? 6 : 0),
      suggestion: {
        id: 'direct-followup-threat',
        label: villainSeed ? `Build ${villainSeed.name}'s Pressure` : 'Deepen The Main Threat',
        prompt: villainSeed
          ? `Continue from ${villainSeed.name} by adding only the supporters, methods, hidden leverage, or internal agents that make this threat feel real. Keep it compact and additive.`
          : 'Continue from the current world by adding only the supporters, methods, or hidden leverage behind the main threat. Keep it compact and additive.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: villainSeed
          ? `Make ${villainSeed.name} dangerous through network, reach, or method rather than just description.`
          : 'Turn the current danger into a more concrete antagonist force.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 3,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([villainSeed?.key, protagonistSeed?.key, rulerSeed?.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: villainSeed?.nodeType === 'group' ? 'group' : 'actor',
        retrievalHint: villainSeed ? `expand ${villainSeed.name} network` : 'threat_followup',
        generatedReason: villainSeed
          ? 'The seed introduced a likely antagonist, so the next high-value move is to show how their pressure actually reaches the world.'
          : 'The prompt implies an active threat, so the next high-value move is to make that pressure concrete.',
      },
    })
  }

  if (rulerSeed || impliesPowerStructure || (mainPlaceSeed && !hasGroups)) {
    rawSuggestions.push({
      score: 76
        + (rulerSeed ? 20 : 0)
        + (impliesPowerStructure ? 14 : 0)
        + (groupCount === 0 ? 8 : 0),
      suggestion: {
        id: 'direct-followup-factions',
        label: rulerSeed ? `Define ${rulerSeed.name}'s Court` : 'Add Power Factions',
        prompt: rulerSeed
          ? `Around ${rulerSeed.name}${mainPlaceSeed ? ` and ${mainPlaceSeed.name}` : ''}, add only the next ministers, houses, factions, guilds, or institutions that shape the central conflict.`
          : mainPlaceSeed
            ? `Around ${mainPlaceSeed.name}, add only the factions, houses, councils, or institutions that shape the current conflict.`
            : 'Add only the next factions, councils, or institutions that shape the central conflict in this world.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: rulerSeed
          ? `Clarify who really shapes power around ${rulerSeed.name}.`
          : 'Expose the institutions and factions that make the world politically legible.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 3,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([rulerSeed?.key, mainPlaceSeed?.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: 'group',
        retrievalHint: rulerSeed ? `expand ${rulerSeed.name} court factions` : 'faction_followup',
        generatedReason: 'The seed implies a power structure, so the next high-value move is to define the institutions and factions around it.',
      },
    })
  }

  if (primaryPlaceSeed || impliesSetting) {
    rawSuggestions.push({
      score: 64
        + (primaryPlaceSeed ? 18 : 0)
        + (!hasPlaces ? 8 : 0)
        + (broadWorldSeed ? 4 : 0),
      suggestion: {
        id: 'direct-followup-places',
        label: primaryPlaceSeed ? `Map ${primaryPlaceSeed.name}'s Pressure Points` : 'Add Important Places',
        prompt: primaryPlaceSeed
          ? `Around ${primaryPlaceSeed.name}, add only the next districts, landmarks, border spaces, or hidden sites that make the current conflict legible.`
          : 'Continue from the current world by adding only the next places, districts, landmarks, or border spaces that make the current conflict legible.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: primaryPlaceSeed
          ? `Make ${primaryPlaceSeed.name} feel navigable and story-usable.`
          : 'Expand the setting around the strongest current pressure point.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 2,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([primaryPlaceSeed?.key, rulerSeed?.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: 'place',
        retrievalHint: primaryPlaceSeed ? `expand ${primaryPlaceSeed.name} locations` : 'place_followup',
        generatedReason: 'The seed already implies a setting anchor, so the next high-value move is to add the locations that make the conflict navigable.',
      },
    })
  }

  if (primaryLoreSeed || impliesLore || hasLore) {
    rawSuggestions.push({
      score: 62
        + (primaryLoreSeed ? 18 : 0)
        + (impliesLore ? 14 : 0)
        + (createdTypes.has('concept') || createdTypes.has('object') ? 8 : 0),
      suggestion: {
        id: 'direct-followup-lore',
        label: primaryLoreSeed ? `Deepen ${primaryLoreSeed.name} Lore` : 'Add Lore Layer',
        prompt: primaryLoreSeed
          ? `Continue from ${primaryLoreSeed.name} by adding only the taboo, history, belief, or hidden rule that should matter next. Keep it compact and additive.`
          : 'Continue from the current world by adding only the lore, taboo, history, or hidden rule that should matter next. Keep it compact and additive.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: primaryLoreSeed
          ? `Turn ${primaryLoreSeed.name} into an active source of stakes instead of background flavor.`
          : 'Clarify stakes with one lore-bearing addition.',
        estimatedNodeCount: 2,
        estimatedEdgeCount: 2,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([primaryLoreSeed?.key, primaryPlaceSeed?.key, protagonistSeed?.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: primaryLoreSeed?.nodeType === 'object' ? 'object' : 'concept',
        retrievalHint: primaryLoreSeed ? `expand ${primaryLoreSeed.name} lore` : 'lore_followup',
        generatedReason: 'The seed already introduced lore-bearing material, so the next high-value move is to make that lore consequential.',
      },
    })
  }

  rawSuggestions.push({
    score: (!hasEvent ? 92 : 58)
      + (impliesConflict ? 14 : 0)
      + (broadWorldSeed ? 10 : 0)
      + (primaryEventSeed ? 0 : 6),
    suggestion: {
      id: 'direct-followup-conflict',
      label: primaryEventSeed ? `Show Fallout From ${primaryEventSeed.name}` : 'Create Inciting Event',
      prompt: primaryEventSeed
        ? `Continue from ${primaryEventSeed.name} by adding only its immediate fallout, survivors, accusations, or reversals. Keep it compact and additive.`
        : `Continue from "${input.prompt}" by creating only the next inciting event, reveal, or reversal that should put pressure on this world.`,
      kind: 'continue_scope',
      source: 'wave2',
      summary: primaryEventSeed
        ? `Turn ${primaryEventSeed.name} into consequences instead of widening the world immediately.`
        : 'Push the world forward with the next event instead of widening every axis at once.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 3,
      actionMode: 'apply_compact_wave',
      applyPolicy: 'auto_if_safe',
      targetEntityKeys: uniqueEntityKeys([primaryEventSeed?.key, protagonistSeed?.key, villainSeed?.key, primaryPlaceSeed?.key]),
      targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
      focusLayer: 'event',
      retrievalHint: primaryEventSeed ? `expand consequences of ${primaryEventSeed.name}` : 'event_followup',
      generatedReason: !hasEvent
        ? 'The world seed established pressure but not yet the triggering beat, so the next high-value move is an inciting event.'
        : 'The seed already includes an event, so the next high-value move is to show its consequences.',
    },
  })

  if (!protagonistSeed && !villainSeed && primaryActorSeed && /\b(friend|ally|rival|mentor|family|crew|team|guard|archive|court)\b/.test(promptLower)) {
    rawSuggestions.push({
      score: 74,
      suggestion: {
        id: 'direct-followup-relationships',
        label: `Add ${primaryActorSeed.name}'s Close Ties`,
        prompt: `Expand ${primaryActorSeed.name} by adding only the closest friend, rival, mentor, family tie, or subordinate who will matter next. Keep it compact and additive.`,
        kind: 'continue_scope',
        source: 'wave2',
        summary: `Use ${primaryActorSeed.name}'s close ties to make the world feel inhabited and consequential.`,
        estimatedNodeCount: 2,
        estimatedEdgeCount: 3,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: uniqueEntityKeys([primaryActorSeed.key]),
        targetThreadKeys: input.selectedThreadKey ? [input.selectedThreadKey] : [],
        focusLayer: 'actor',
        retrievalHint: `expand ${primaryActorSeed.name} close ties`,
        generatedReason: 'The seed is character-led, so the next high-value move is to define the relationships closest to that character.',
      },
    })
  }

  const rankedSuggestions = rawSuggestions
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry, index) => buildPromptSuggestion({
      ...entry.suggestion,
      style: index === 0 ? 'primary' : 'secondary',
    }))
    .filter((entry): entry is WorldPromptSuggestion => Boolean(entry))

  return dedupeSuggestions(rankedSuggestions).slice(0, 4)
}

function scorePlannerAwareDirectSuggestion(input: {
  suggestion: WorldPromptSuggestion
  analysis: DirectFollowUpAnalysis
  selectedThreadKey?: string | null
}) {
  const { suggestion, analysis } = input
  const text = lowerCaseTextParts(
    suggestion.label,
    suggestion.prompt,
    suggestion.summary,
    suggestion.retrievalHint,
    suggestion.generatedReason,
  )
  const targetEntityKeys = new Set(suggestion.targetEntityKeys ?? [])
  const targetThreadKeys = new Set(suggestion.targetThreadKeys ?? [])
  const overlapWith = (seed: DirectFollowUpSeed | null) => Boolean(seed?.key && targetEntityKeys.has(seed.key))
  let score = 0

  if (suggestion.kind === 'continue_scope') score += 30
  if (suggestion.kind === 'advisory_option') score += 12
  if (suggestion.kind === 'plan_only') score -= 28
  if (suggestion.source === 'wave2') score += 8
  if (suggestion.source === 'thread') score += input.selectedThreadKey ? 8 : -8
  if (suggestion.actionMode === 'apply_compact_wave') score += 8
  if (suggestion.applyPolicy === 'auto_if_safe') score += 4
  if ((suggestion.targetEntityKeys ?? []).length > 0) score += 6
  if ((suggestion.generatedReason ?? '').trim()) score += 4
  if (input.selectedThreadKey && targetThreadKeys.has(input.selectedThreadKey)) score += 10

  if (overlapWith(analysis.protagonistSeed)) score += 26
  if (overlapWith(analysis.villainSeed)) score += 24
  if (overlapWith(analysis.rulerSeed)) score += 20
  if (overlapWith(analysis.primaryPlaceSeed)) score += 14
  if (overlapWith(analysis.primaryLoreSeed)) score += 12
  if (overlapWith(analysis.primaryEventSeed)) score += 10

  if (suggestion.focusLayer === 'actor' && (analysis.protagonistSeed || analysis.primaryActorSeed)) score += 14
  if (suggestion.focusLayer === 'group' && (analysis.rulerSeed || analysis.impliesPowerStructure || analysis.hasGroups)) score += 14
  if (suggestion.focusLayer === 'place' && (analysis.primaryPlaceSeed || analysis.impliesSetting)) score += 12
  if ((suggestion.focusLayer === 'concept' || suggestion.focusLayer === 'object') && (analysis.primaryLoreSeed || analysis.impliesLore || analysis.hasLore)) score += 12
  if (suggestion.focusLayer === 'event' && (analysis.impliesConflict || !analysis.hasEvent || analysis.primaryEventSeed)) score += 14

  if (analysis.protagonistSeed && text.includes(analysis.protagonistSeed.name.toLowerCase())) score += 22
  if (analysis.villainSeed && text.includes(analysis.villainSeed.name.toLowerCase())) score += 20
  if (analysis.rulerSeed && text.includes(analysis.rulerSeed.name.toLowerCase())) score += 18
  if (analysis.primaryPlaceSeed && text.includes(analysis.primaryPlaceSeed.name.toLowerCase())) score += 12
  if (analysis.primaryLoreSeed && text.includes(analysis.primaryLoreSeed.name.toLowerCase())) score += 10
  if (analysis.primaryEventSeed && text.includes(analysis.primaryEventSeed.name.toLowerCase())) score += 10

  if (/\b(ally|allies|rival|rivals|dependent|dependents|confidant|mentor|friend|family|circle|relationship|relationships)\b/.test(text) && (analysis.protagonistSeed || analysis.primaryActorSeed)) {
    score += 16
  }
  if (/\b(villain|antagonist|threat|pressure|supporter|supporters|network|conspiracy|scheme|leverage|agent|agents)\b/.test(text) && (analysis.villainSeed || analysis.impliesConflict)) {
    score += 18
  }
  if (/\b(court|faction|factions|house|houses|council|guild|guilds|minister|ministers|institution|institutions|power)\b/.test(text) && (analysis.rulerSeed || analysis.impliesPowerStructure)) {
    score += 18
  }
  if (/\b(place|places|district|districts|landmark|landmarks|location|locations|border|borders|site|sites)\b/.test(text) && (analysis.primaryPlaceSeed || analysis.impliesSetting)) {
    score += 14
  }
  if (/\b(lore|history|myth|belief|taboo|ritual|ancient|forbidden|rule|rules|hidden)\b/.test(text) && (analysis.primaryLoreSeed || analysis.impliesLore || analysis.hasLore)) {
    score += 14
  }
  if (/\b(inciting|event|fallout|reveal|reversal|accusation|survivor|consequence|consequences)\b/.test(text)) {
    score += analysis.hasEvent ? 8 : 18
  }

  return score
}

function buildRankedDirectTurnSuggestions(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
  selectedThreadKey?: string | null
  suggestionCandidates?: WorldPromptSuggestion[]
}) {
  const analysis = analyzeDirectFollowUpWorld({
    prompt: input.prompt,
    ops: input.ops,
  })
  const combined = [
    ...(input.suggestionCandidates ?? []),
    ...buildDirectFollowUpSuggestions({
      prompt: input.prompt,
      snapshot: input.snapshot,
      ops: input.ops,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
  ]

  const ranked = combined
    .map((suggestion) => ({
      suggestion,
      score: scorePlannerAwareDirectSuggestion({
        suggestion,
        analysis,
        selectedThreadKey: input.selectedThreadKey,
      }),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => buildPromptSuggestion({
      ...entry.suggestion,
      style: index === 0 ? 'primary' : 'secondary',
    }))
    .filter((entry): entry is WorldPromptSuggestion => Boolean(entry))

  return dedupeSuggestions(ranked).slice(0, 4)
}

function impactForOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity':
    case 'update_entity':
    case 'replace_entity':
      return { nodeCount: 1, edgeCount: 0, queueCount: 0 }
    case 'upsert_relationship':
    case 'update_relationship':
      return { nodeCount: 0, edgeCount: 1, queueCount: 0 }
    case 'create_derived_result':
      return { nodeCount: 1, edgeCount: 3, queueCount: 0 }
    case 'queue_image_generation':
    case 'queue_cinematic_generation':
      return { nodeCount: 0, edgeCount: 0, queueCount: 1 }
    default:
      return { nodeCount: 0, edgeCount: 0, queueCount: 0 }
  }
}

function summarizeImpact(ops: PromptToWorldOp[]) {
  return ops.reduce((totals, op) => {
    const impact = impactForOp(op)
    return {
      nodeCount: totals.nodeCount + impact.nodeCount,
      edgeCount: totals.edgeCount + impact.edgeCount,
      queueCount: totals.queueCount + impact.queueCount,
    }
  }, { nodeCount: 0, edgeCount: 0, queueCount: 0 })
}

function looksContradictoryOrLowConfidence(prompt: string) {
  const normalized = prompt.toLowerCase()
  return normalized.includes('but not really')
    || normalized.includes('vibes')
    || normalized.includes('whatever')
    || normalized.includes('make it go brr')
    || normalized.includes('seven dimensions')
}

function buildBlockedSuggestions(prompt: string, snapshot: WorldPromptSnapshot) {
  const hasWorld = snapshot.worldEntities.length > 0
  const suggestionSeed = buildProjectContextSuggestionSeed(snapshot.projectContext)
  return dedupeSuggestions([
    buildPromptSuggestion({
      id: 'repair-characters',
      label: suggestionSeed.repairLabel,
      prompt: hasWorld
        ? `${suggestionSeed.primaryPrompt} Use the existing world state instead of starting over.`
        : suggestionSeed.repairPrompt,
      kind: 'repair_prompt',
      style: 'primary',
      source: 'repair',
      summary: suggestionSeed.repairSummary,
      estimatedNodeCount: 2,
      estimatedEdgeCount: 2,
    }),
    buildPromptSuggestion({
      id: 'repair-places',
      label: 'Add Places',
      prompt: hasWorld
        ? 'Continue from the current world by adding a capital city and a frontier outpost that matter next.'
        : 'Start this world by creating a capital city and a frontier outpost, then connect them to the main conflict.',
      kind: 'repair_prompt',
      source: 'repair',
      summary: 'Create two important locations and connect them to the main tension.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 1,
    }),
    buildPromptSuggestion({
      id: 'repair-conflict',
      label: 'Define Conflict',
      prompt: `Use this as context: "${prompt}". Define the central conflict of the world with a few compact nodes and links.`,
      kind: 'repair_prompt',
      source: 'repair',
      summary: 'Focus only on the main pressure shaping the world.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 2,
    }),
  ].filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion)))
}

function buildStagedSuggestions(input: {
  prompt: string
  deferredOps: PromptToWorldOp[]
  snapshot: WorldPromptSnapshot
}) {
  const hasCharacters = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && ['actor', 'group'].includes(op.payload.entity.nodeType)
  ))
  const hasPlaces = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && op.payload.entity.nodeType === 'place'
  ))
  const hasLore = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && ['concept', 'event', 'object'].includes(op.payload.entity.nodeType)
  ))
  const suggestions = [
    hasCharacters ? buildPromptSuggestion({
      id: 'continue-characters',
      label: 'Add Key Characters',
      prompt: 'Continue from the current world by adding only the next key characters and groups that anchor this setting. Keep it compact and additive.',
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      summary: 'Grow the cast and faction layer without widening the whole world at once.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 3,
    }) : null,
    hasPlaces ? buildPromptSuggestion({
      id: 'continue-places',
      label: 'Expand Places',
      prompt: 'Continue from the current world by adding only the main places, settlements, and landmarks that matter next. Keep it compact and additive.',
      kind: 'continue_scope',
      source: 'wave2',
      summary: 'Add the next places that make the current conflict legible.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 2,
    }) : null,
    hasLore ? buildPromptSuggestion({
      id: 'continue-lore',
      label: 'Add Lore Layer',
      prompt: 'Continue from the current world by adding only the core lore, concepts, history, or artifacts needed next. Keep it compact and additive.',
      kind: 'continue_scope',
      source: 'wave2',
      summary: 'Add one lore layer that clarifies stakes, history, or artifacts.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 2,
    }) : null,
  ].filter((entry): entry is WorldPromptSuggestion => Boolean(entry))

  if (suggestions.length < 4) {
    const conflictSuggestion = buildPromptSuggestion({
      id: 'continue-conflict',
      label: 'Continue Conflict',
      prompt: `Continue from "${input.prompt}" by expanding only the main conflict, alliances, and rivalries that should come next.`,
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      summary: 'Continue only the conflict cluster instead of broadening every axis at once.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 4,
    })
    if (conflictSuggestion) {
      suggestions.unshift(conflictSuggestion)
    }
  }

  return dedupeSuggestions(suggestions)
}

function buildStagedFirstWave(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  const selected: PromptToWorldOp[] = []
  const selectedEntityKeys = new Set<string>()
  const runningCounts = emptyScopeCounts()
  const stagedCaps = stagedScopeCapsForPrompt(input.prompt)
  const ranked = [...input.ops].sort((left, right) => scorePromptOpForStaging(right, input.prompt) - scorePromptOpForStaging(left, input.prompt))

  for (const op of ranked) {
    if (op.op === 'assistant_note') continue
    const nextCounts = countScopeOps([...selected, op], input.snapshot)
    if (exceedsScopeCaps(nextCounts, stagedCaps)) {
      continue
    }
    if (op.op === 'upsert_relationship') {
      const entityKeys = resolveStagingEntityKeys(op)
      const canLink = entityKeys.every((key) => selectedEntityKeys.has(key) || input.snapshot.worldEntities.some((entity) => entity.key === key))
      if (!canLink) continue
    }
    if (op.op === 'create_derived_result' || op.op === 'queue_image_generation' || op.op === 'queue_cinematic_generation') {
      const entityKeys = resolveStagingEntityKeys(op)
      const dependenciesReady = entityKeys.every((key) => selectedEntityKeys.has(key) || input.snapshot.worldEntities.some((entity) => entity.key === key))
      if (!dependenciesReady && entityKeys.length > 0) continue
    }
    selected.push(op)
    Object.assign(runningCounts, nextCounts)
    for (const key of resolveStagingEntityKeys(op)) {
      selectedEntityKeys.add(key)
    }
  }

  const selectedIds = new Set(selected.map((op) => op.id))
  const deferred = input.ops.filter((op) => op.op !== 'assistant_note' && !selectedIds.has(op.id))
  const selectedNotes = input.ops.filter((op) => op.op === 'assistant_note')
  return {
    selectedOps: [...selectedNotes, ...selected],
    deferredOps: deferred,
    counts: runningCounts,
  }
}

function buildPreviewItem(op: PromptToWorldOp): WorldPromptPlanPreviewItem {
  const impact = impactForOp(op)
  const diffMode = op.metadata?.touchesExisting === true ? 'touches_existing' : 'new'
  const touchesCanon = op.metadata?.canonTouch === true
  const approvalRequired = op.applyMode === 'needs_approval' || op.metadata?.approvalReason !== undefined
  switch (op.op) {
    case 'upsert_entity':
      return {
        id: op.id,
        kind: 'entity',
        title: op.payload.entity.name,
        summary: op.payload.entity.summary,
        targetKeys: [op.payload.targetEntityKey].filter((value): value is string => Boolean(value)),
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'update_entity':
      return {
        id: op.id,
        kind: 'entity',
        title: op.payload.targetEntityKey,
        summary: 'Update existing entity details.',
        targetKeys: [op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'replace_entity':
      return {
        id: op.id,
        kind: 'entity',
        title: op.payload.replacementMode === 'create'
          ? op.payload.replacementEntity?.name ?? op.payload.targetEntityKey
          : op.payload.replacementEntityKey ?? op.payload.targetEntityKey,
        summary: op.payload.reason || 'Replace an existing entity while preserving graph continuity.',
        targetKeys: [
          op.payload.targetEntityKey,
          op.payload.replacementMode === 'existing' ? op.payload.replacementEntityKey : null,
        ].filter((value): value is string => Boolean(value)),
        diffMode: 'touches_existing',
        touchesCanon,
        approvalRequired: true,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'upsert_relationship':
      return {
        id: op.id,
        kind: 'relationship',
        title: `${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'Source'} ${op.payload.relationship.verb} ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'Target'}`,
        summary: op.payload.relationship.notes,
        targetKeys: [op.payload.relationship.sourceEntityKey, op.payload.relationship.targetEntityKey].filter((value): value is string => Boolean(value)),
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'update_relationship':
      return {
        id: op.id,
        kind: 'relationship',
        title: op.payload.targetRelationshipKey,
        summary: 'Update an existing relationship.',
        targetKeys: [op.payload.targetRelationshipKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'create_derived_result':
      return {
        id: op.id,
        kind: 'derived_result',
        title: op.payload.title ?? op.payload.operatorType,
        summary: op.payload.summary,
        targetKeys: [op.payload.sourceEntityKey, op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'queue_image_generation':
      return {
        id: op.id,
        kind: 'image_queue',
        title: 'Queue image generation',
        summary: op.payload.reason || op.payload.prompt,
        targetKeys: [op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'queue_cinematic_generation':
      return {
        id: op.id,
        kind: 'cinematic_queue',
        title: op.payload.title || 'Queue cinematic generation',
        summary: op.payload.prompt,
        targetKeys: op.payload.relatedEntityKeys,
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'assistant_note':
      return {
        id: op.id,
        kind: 'assistant_note',
        title: 'Assistant note',
        summary: op.payload.message,
        targetKeys: [],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
  }
}

function buildPlanPreview(input: {
  mode: WorldPromptPlanPreview['mode']
  requestSummary: string
  scope: WorldPromptScopeDecision
  selectedOps: PromptToWorldOp[]
  suggestions: WorldPromptSuggestion[]
  canApplyFirstWave: boolean
}) {
  return worldPromptPlanPreviewSchema.parse({
    mode: input.mode,
    requestSummary: input.requestSummary,
    scopeDecision: input.scope,
    items: input.selectedOps.map(buildPreviewItem),
    suggestions: input.suggestions,
    canApplyFirstWave: input.canApplyFirstWave,
    pendingOps: input.selectedOps,
    appliedAt: null,
  })
}

function entityIsCanonLocked(entity: Pick<WorldEntity, 'metadata'> | null) {
  return Boolean(entity && entity.metadata && typeof entity.metadata === 'object' && (entity.metadata as Record<string, unknown>).canon && typeof (entity.metadata as Record<string, unknown>).canon === 'object' && ((entity.metadata as Record<string, unknown>).canon as Record<string, unknown>).locked === true)
}

function relationshipIsCanonLocked(relationship: Pick<WorldRelationship, 'metadata'> | null) {
  return Boolean(relationship && relationship.metadata && typeof relationship.metadata === 'object' && (relationship.metadata as Record<string, unknown>).canon && typeof (relationship.metadata as Record<string, unknown>).canon === 'object' && ((relationship.metadata as Record<string, unknown>).canon as Record<string, unknown>).locked === true)
}

function annotatePromptOpMetadata(input: {
  op: PromptToWorldOp
  touchesExisting?: boolean
  canonTouch?: boolean
  approvalReason?: string | null
}) {
  input.op.metadata = {
    ...(input.op.metadata ?? {}),
    touchesExisting: input.touchesExisting ?? false,
    canonTouch: input.canonTouch ?? false,
    approvalReason: input.approvalReason ?? undefined,
  }
  return input.op
}

function promptOpNeedsApproval(op: PromptToWorldOp) {
  return op.applyMode === 'needs_approval'
    || (op.metadata && typeof op.metadata === 'object' && typeof op.metadata.approvalReason === 'string' && op.metadata.approvalReason.length > 0)
}

function splitPromptOpsByApproval(ops: PromptToWorldOp[]) {
  const autoOps: PromptToWorldOp[] = []
  const approvalOps: PromptToWorldOp[] = []
  for (const op of ops) {
    if (op.op !== 'assistant_note' && promptOpNeedsApproval(op)) {
      approvalOps.push(op)
      continue
    }
    autoOps.push(op)
  }
  return {
    autoOps,
    approvalOps,
  }
}

async function upsertWorldThreads(input: {
  client: SupabaseClient
  draftId: string
  turnId: string
  snapshot: WorldPromptSnapshot
  threadActions: Array<z.infer<typeof plannerThreadActionSchema>>
  threadCandidates: Array<z.infer<typeof plannerThreadCandidateSchema>>
}) {
  const knownEntityKeys = new Set(input.snapshot.worldEntities.map((entity) => entity.key))
  const existingResponse = await input.client
    .from('world_threads')
    .select(THREAD_SELECT)
    .eq('draft_id', input.draftId)
  if (existingResponse.error) throw new Error(existingResponse.error.message)

  const existingThreads = ((existingResponse.data ?? []) as WorldThreadRow[]).map(mapThreadRow)
  const existingByKey = new Map(existingThreads.map((thread) => [thread.key, thread]))
  const prepared = preparePlannerThreadMutations({
    existingThreads,
    knownEntityKeys,
    threadActions: input.threadActions,
    threadCandidates: input.threadCandidates,
  })
  const upsertPayload = prepared.mutations.map((candidate) => {
    const existing = existingByKey.get(candidate.key) ?? null
    return {
      draft_id: input.draftId,
      key: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      status: candidate.status,
      priority: candidate.priority,
      linked_entity_keys: candidate.linkedEntityKeys,
      source_turn_id: existing?.sourceTurnId ?? input.turnId,
      last_turn_id: input.turnId,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(candidate.metadata ?? {}),
      },
    }
  })

  const persisted: WorldThread[] = []
  if (upsertPayload.length > 0) {
    const upsertResponse = await input.client
      .from('world_threads')
      .upsert(upsertPayload, { onConflict: 'draft_id,key' })
      .select(THREAD_SELECT)
    if (upsertResponse.error) throw new Error(upsertResponse.error.message)
    persisted.push(...((upsertResponse.data ?? []) as WorldThreadRow[]).map(mapThreadRow))
  }

  return {
    threads: persisted,
    diagnostics: prepared.diagnostics,
    rejected: prepared.rejected,
  }
}

function classifyPromptExecution(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
  classificationHint?: WorldPromptClassification | null
  suggestionCandidates?: WorldPromptSuggestion[]
  selectedThreadKey?: string | null
  selectedRootEntityKey?: string | null
  assistantSummary: string
  answer?: string
  answerMode?: 'answer_only' | 'answer_plus_options' | 'answer_plus_preview'
  diagnosticFindings?: WorldPromptDiagnosticFinding[]
  isSuggestionDriven?: boolean
}): PromptExecutionClassification {
  const actionableOps = input.ops.filter((op) => op.op !== 'assistant_note')
  const explicitLocalizedCorrection = actionableOps.length > 0 && actionableOps.every((op) => op.op === 'replace_entity')
  const counts = countScopeOps(input.ops, input.snapshot)
  const contradictoryOrLowConfidence = looksContradictoryOrLowConfidence(input.prompt)
  const classificationHint = input.classificationHint ?? null
  const detectedIntent = detectPromptIntent(input.prompt, input.snapshot)
  const diagnosticFindings = (input.diagnosticFindings && input.diagnosticFindings.length > 0)
    ? input.diagnosticFindings
    : buildGraphDiagnosticFindings({
        snapshot: input.snapshot,
        selectedThreadKey: input.selectedThreadKey,
        selectedRootEntityKey: input.selectedRootEntityKey,
      })
  const answer = stripInternalPlannerDiagnostics(input.answer || input.assistantSummary || '')
  const answerMode = input.answerMode
    ?? (
      classificationHint === 'graph_diagnosis'
      || detectedIntent === 'graph_diagnosis'
        ? 'answer_plus_options'
        : 'answer_plus_options'
    )
  const advisorySuggestions = dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...(classificationHint === 'graph_diagnosis' || detectedIntent === 'graph_diagnosis'
      ? buildDiagnosticSuggestionSet(diagnosticFindings)
      : []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
  ])
  const blockedSuggestions = dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildBlockedSuggestions(input.prompt, input.snapshot),
  ])

  if (
    classificationHint === 'advisory_question'
    || classificationHint === 'graph_diagnosis'
    || (actionableOps.length === 0 && (detectedIntent === 'advisory_question' || detectedIntent === 'graph_diagnosis'))
  ) {
    const advisoryClassification: PromptClassificationMode =
      classificationHint === 'graph_diagnosis' || detectedIntent === 'graph_diagnosis'
        ? 'graph_diagnosis'
        : 'advisory_question'
    const scope: WorldPromptScopeDecision = {
      mode: 'advisory',
      counts,
      starterPackApplied: false,
    }
    return {
      classification: advisoryClassification,
      mode: 'advisory',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions: advisorySuggestions,
      note: answer || 'I reviewed the current world state and prepared the best next options.',
      answer: answer || 'I reviewed the current world state and prepared the best next options.',
      answerMode,
      diagnosticFindings,
      preview: null,
    }
  }

  if (isPlanOnlyPrompt(input.prompt) || classificationHint === 'graphable_plan_only' || actionableOps.length === 0 || classificationHint === 'not_graphable' || classificationHint === 'contradictory_or_low_confidence') {
    const classification: PromptClassificationMode =
      classificationHint === 'contradictory_or_low_confidence'
        ? 'contradictory_or_low_confidence'
        : classificationHint === 'not_graphable'
          ? 'not_graphable'
          : isPlanOnlyPrompt(input.prompt) || classificationHint === 'graphable_plan_only'
            ? 'graphable_plan_only'
            : contradictoryOrLowConfidence
              ? 'contradictory_or_low_confidence'
              : 'not_graphable'
    const scope: WorldPromptScopeDecision = {
      mode: classification === 'graphable_plan_only' ? 'advisory' : 'blocked',
      counts,
      starterPackApplied: false,
    }
    const suggestions = classification === 'graphable_plan_only'
      ? dedupeSuggestions([
        ...(input.suggestionCandidates ?? []),
        ...buildThreadAwareSuggestions({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
        }),
      ])
      : blockedSuggestions
    return {
      classification,
      mode: classification === 'graphable_plan_only' ? 'advisory' : 'blocked',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions,
      note: classification === 'graphable_plan_only'
        ? 'No graph mutations were applied for this turn. I answered in advisory mode and suggested the best next moves.'
        : contradictoryOrLowConfidence
          ? 'This prompt is too contradictory or low-confidence to map cleanly into a world-graph turn, so I did not mutate the graph.'
          : 'I could not map that request cleanly into a coherent world-graph turn, so I did not mutate the graph.',
      answer,
      answerMode,
      diagnosticFindings,
      preview: null,
    }
  }

  const directCaps = directScopeCapsForPrompt(input.prompt, input.isSuggestionDriven)
  if (!exceedsScopeCaps(counts, directCaps)) {
    const scope: WorldPromptScopeDecision = {
      mode: 'direct',
      counts,
      starterPackApplied: false,
    }
    return {
      classification: classificationHint === 'graphable_broad' ? 'graphable_broad' : 'graphable_direct',
      mode: 'direct',
      scope,
      selectedOps: input.ops,
      deferredOps: [],
      suggestions: explicitLocalizedCorrection
        ? []
        : buildRankedDirectTurnSuggestions({
          prompt: input.prompt,
          snapshot: input.snapshot,
          ops: input.ops,
          selectedThreadKey: input.selectedThreadKey,
          suggestionCandidates: input.suggestionCandidates ?? [],
        }),
      note: '',
      answer,
      answerMode,
      diagnosticFindings,
      preview: null,
    }
  }

  const staged = buildStagedFirstWave(input)
  if (staged.selectedOps.filter((op) => op.op !== 'assistant_note').length === 0) {
    const scope: WorldPromptScopeDecision = {
      mode: 'blocked',
      counts,
      starterPackApplied: false,
    }
    return {
      classification: classificationHint === 'contradictory_or_low_confidence'
        ? 'contradictory_or_low_confidence'
        : classificationHint === 'not_graphable'
          ? 'not_graphable'
          : contradictoryOrLowConfidence ? 'contradictory_or_low_confidence' : 'not_graphable',
      mode: 'blocked',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions: blockedSuggestions,
      note: 'This prompt is too broad to apply safely in one turn, and I could not derive a coherent starter slice automatically.',
      answer,
      answerMode,
      diagnosticFindings,
      preview: null,
    }
  }

  const stagedSuggestions = dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildStagedSuggestions({
      prompt: input.prompt,
      deferredOps: staged.deferredOps,
      snapshot: input.snapshot,
    }),
  ])
  const scope: WorldPromptScopeDecision = {
    mode: 'staged',
    counts,
    starterPackApplied: true,
  }
  return {
    classification: 'graphable_broad',
    mode: 'direct',
    scope,
    selectedOps: staged.selectedOps,
    deferredOps: staged.deferredOps,
    suggestions: stagedSuggestions,
    note: 'This request asked for a lot in one turn, so I started with a compact first wave to keep the graph readable and responsive.',
    answer,
    answerMode,
    diagnosticFindings,
    preview: null,
  }
}

function projectSanitizedOpIntoSnapshot(snapshot: WorldPromptSnapshot, op: PromptToWorldOp) {
  const now = new Date().toISOString()
  if (op.op === 'upsert_entity') {
    if (op.payload.targetEntityKey && snapshot.worldEntities.some((entity) => entity.key === op.payload.targetEntityKey)) {
      return
    }
    const key = op.payload.targetEntityKey || buildWorldEntityKey(snapshot, op.payload.entity.nodeType, op.payload.entity.name)
    op.payload.targetEntityKey = key
    op.metadata = {
      ...(op.metadata ?? {}),
      projectedCreate: true,
    }
    snapshot.worldEntities = [
      ...snapshot.worldEntities,
      worldEntitySchema.parse({
        id: `projected:${key}`,
        key,
        name: op.payload.entity.name,
        summary: op.payload.entity.summary,
        context: op.payload.entity.context,
        nodeType: op.payload.entity.nodeType,
        aliases: op.payload.entity.aliases ?? [],
        tags: op.payload.entity.tags ?? [],
        status: op.payload.entity.status,
        thumbnailAssetKey: op.payload.entity.thumbnailAssetKey,
        linkedDefinitionKey: op.payload.entity.linkedDefinitionKey,
        source: op.payload.entity.source ?? 'ai',
        customProperties: op.payload.entity.customProperties ?? {},
        metadata: {
          ...(op.payload.entity.metadata ?? {}),
          projected: true,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ]
    return
  }

  if (op.op === 'replace_entity' && op.payload.replacementMode === 'create' && op.payload.replacementEntity) {
    const key = op.payload.replacementEntityKey || buildWorldEntityKey(snapshot, op.payload.replacementEntity.nodeType, op.payload.replacementEntity.name)
    op.payload.replacementEntityKey = key
    if (snapshot.worldEntities.some((entity) => entity.key === key)) {
      return
    }
    snapshot.worldEntities = [
      ...snapshot.worldEntities,
      worldEntitySchema.parse({
        id: `projected:${key}`,
        key,
        name: op.payload.replacementEntity.name,
        summary: op.payload.replacementEntity.summary,
        context: op.payload.replacementEntity.context,
        nodeType: op.payload.replacementEntity.nodeType,
        aliases: op.payload.replacementEntity.aliases ?? [],
        tags: op.payload.replacementEntity.tags ?? [],
        status: op.payload.replacementEntity.status,
        thumbnailAssetKey: op.payload.replacementEntity.thumbnailAssetKey,
        linkedDefinitionKey: op.payload.replacementEntity.linkedDefinitionKey,
        source: op.payload.replacementEntity.source ?? 'ai',
        customProperties: op.payload.replacementEntity.customProperties ?? {},
        metadata: {
          ...(op.payload.replacementEntity.metadata ?? {}),
          projected: true,
          replacementCandidate: true,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ]
  }
}

async function ensureLinkedDefinition(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entity: WorldEntityCreateInput
}) {
  const definitionKind = determineDefinitionKind(input.entity.nodeType)
  if (!definitionKind || input.entity.ensureLinkedDefinition === false) {
    return {
      linkedDefinitionKey: null,
      createdDefinition: null,
    }
  }

  const existingByName = input.snapshot.definitions.find((definition) => (
    definition.kind === definitionKind && normalizeName(definition.name) === normalizeName(input.entity.name)
  )) ?? null
  if (existingByName) {
    return {
      linkedDefinitionKey: existingByName.key,
      createdDefinition: null,
    }
  }

  let candidateKey = `${definitionKind}.${slugify(input.entity.name).replace(/-/g, '_')}`
  let index = 2
  while (input.snapshot.definitions.some((definition) => definition.key === candidateKey)) {
    candidateKey = `${definitionKind}.${slugify(input.entity.name).replace(/-/g, '_')}_${index}`
    index += 1
  }

  const inserted = await input.client
    .from('project_definitions')
    .insert({
      draft_id: input.snapshot.draft.id,
      key: candidateKey,
      kind: definitionKind,
      name: input.entity.name,
      summary: input.entity.summary,
      status: 'draft',
      tags: input.entity.tags,
      schema_version: 1,
      metadata: {},
      llm_hints: {},
      asset_refs: [],
      definition_data: {},
    })
    .select('id, key')
    .single()
  if (inserted.error) throw new Error(inserted.error.message)

  const components = buildDefaultDefinitionComponents(definitionKind)
  if (components.length > 0) {
    const componentInsert = await input.client
      .from('project_definition_components')
      .insert(components.map((component) => ({
        definition_id: inserted.data.id,
        component_type: component.type,
        config: component.config,
      })))
    if (componentInsert.error) throw new Error(componentInsert.error.message)
  }

  input.snapshot.definitions = [
    ...input.snapshot.definitions,
    {
      key: candidateKey,
      kind: definitionKind,
      name: input.entity.name,
      summary: input.entity.summary,
    },
  ]
  return {
    linkedDefinitionKey: candidateKey,
    createdDefinition: {
      id: inserted.data.id,
      key: candidateKey,
      kind: definitionKind,
      name: input.entity.name,
      summary: input.entity.summary,
      status: 'draft',
      iconAssetKey: input.entity.thumbnailAssetKey,
      archetypeKey: null,
      tags: input.entity.tags,
      schemaVersion: 1,
      metadata: {},
      llmHints: {},
      assetRefs: [],
      definitionData: {},
      fieldValues: [],
      customFields: [],
      components,
    } satisfies Record<string, unknown>,
  }
}

async function syncLinkedDefinitionFromWorldEntity(input: {
  client: SupabaseClient
  draftId: string
  entity: Pick<WorldEntity, 'nodeType' | 'name' | 'summary' | 'thumbnailAssetKey' | 'linkedDefinitionKey' | 'tags'>
}) {
  const linkedDefinitionKey = input.entity.linkedDefinitionKey ?? null
  if (!linkedDefinitionKey) return
  const expectedKind = determineDefinitionKind(input.entity.nodeType)
  if (!expectedKind) return
  const response = await input.client
    .from('project_definitions')
    .update({
      name: input.entity.name,
      summary: input.entity.summary,
      icon_asset_key: input.entity.thumbnailAssetKey ?? null,
      tags: input.entity.tags ?? [],
    })
    .eq('draft_id', input.draftId)
    .eq('key', linkedDefinitionKey)
    .eq('kind', expectedKind)
  if (response.error) throw new Error(response.error.message)
}

async function insertPromptMessage(input: {
  client: SupabaseClient
  sessionId: string
  turnId: string | null
  draftId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
}) {
  const response = await input.client
    .from('world_prompt_messages')
    .insert({
      session_id: input.sessionId,
      turn_id: input.turnId,
      draft_id: input.draftId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .select(MESSAGE_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapMessageRow(response.data as WorldPromptMessageRow)
}

async function createEventWriter(input: {
  client: SupabaseClient
  sessionId: string
  turnId: string
  draftId: string
}) {
  const maxResponse = await input.client
    .from('world_prompt_events')
    .select('sequence')
    .eq('turn_id', input.turnId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxResponse.error) throw new Error(maxResponse.error.message)
  let sequence = maxResponse.data?.sequence ?? 0

  return async (eventType: WorldPromptEvent['eventType'], payload: Record<string, unknown>, options?: { opId?: string | null; metadata?: Record<string, unknown> }) => {
    sequence += 1
    const parsedPayload = worldPromptEventPayloadSchema.parse(payload)
    const response = await input.client
      .from('world_prompt_events')
      .insert({
        session_id: input.sessionId,
        turn_id: input.turnId,
        draft_id: input.draftId,
        sequence,
        event_type: eventType,
        op_id: options?.opId ?? null,
        payload: parsedPayload,
        metadata: options?.metadata ?? {},
      })
      .select(EVENT_SELECT)
      .single()
    if (response.error) throw new Error(response.error.message)
    return mapEventRow(response.data as WorldPromptEventRow)
  }
}

function describeProjectContextForPlanner(projectContext: WorldPromptSnapshot['projectContext']) {
  if (!projectContext) return null
  const projectLabel =
    projectContext.projectType === 'game'
      ? 'video game'
      : projectContext.projectType === 'ugc'
        ? 'UGC / social-native project'
        : projectContext.projectType
  const subtypeLabel = projectContext.projectSubtype.replace(/_/g, ' ')
  const styleLabel = projectContext.artStylePreset.replace(/_/g, ' ')
  const styleNotes = projectContext.artStyleDescription.trim()
  const brainGuidance =
    projectContext.brainProfile === 'game'
      ? 'Bias generation toward factions, regions, world objects, progression landmarks, quest hooks, and gameplay-supportive world structure.'
      : projectContext.brainProfile === 'brand'
        ? 'Bias generation toward symbolic systems, signature assets, mascots, message pillars, campaign moments, and audience-facing world language.'
        : projectContext.brainProfile === 'ugc'
          ? 'Bias generation toward hooks, proof beats, scenarios, creator personas, use-case objects, and repeatable social-native episodes.'
          : 'Bias generation toward cast, factions, places, lore, conflicts, prophecy, secrets, and inciting events.'
  return [
    `Project type: ${projectLabel}.`,
    `Project subtype: ${subtypeLabel}.`,
    `Brain profile: ${projectContext.brainProfile}.`,
    `Art style preset: ${styleLabel}.`,
    styleNotes ? `Art style notes: ${styleNotes}.` : null,
    brainGuidance,
  ].filter(Boolean).join(' ')
}

function buildProjectContextSuggestionSeed(projectContext: WorldPromptSnapshot['projectContext']) {
  if (!projectContext) {
    return {
      primaryLabel: 'Add Key Characters',
      primaryPrompt: 'Continue this world by adding 2 or 3 key characters and connect them to the main conflict.',
      primarySummary: 'Add a compact first cast and tie them into the seeded world conflict.',
      secondaryLabel: 'Add Lore Layer',
      secondaryPrompt: 'Continue this world by adding one hidden piece of lore and one event that deepen the central tension.',
      secondarySummary: 'Deepen the seed with one lore thread and one consequence.',
      repairLabel: 'Add Characters',
      repairPrompt: 'Start this world by adding a protagonist and a rival, then connect them with a central conflict.',
      repairSummary: 'Add one hero, one rival, and a clear conflict anchor.',
    }
  }

  switch (projectContext.brainProfile) {
    case 'game':
      return {
        primaryLabel: 'Add Factions And Regions',
        primaryPrompt: 'Continue this game world by adding 2 factions, one playable region, and the pressure connecting them.',
        primarySummary: 'Add a gameplay-supportive slice with one region and faction pressure.',
        secondaryLabel: 'Add Progression Hook',
        secondaryPrompt: 'Continue this game world by adding one quest hook, one landmark, and one object tied to progression.',
        secondarySummary: 'Seed a concrete progression hook with place and object support.',
        repairLabel: 'Add A Playable Hook',
        repairPrompt: 'Start this game world by adding one faction, one place, and one progression hook players can act on immediately.',
        repairSummary: 'Turn the vague request into a playable worldbuilding beat.',
      }
    case 'brand':
      return {
        primaryLabel: 'Add Signature Symbols',
        primaryPrompt: 'Continue this brand world by adding one symbolic group, one signature object, and one campaign moment.',
        primarySummary: 'Expand the symbolic system with one memorable asset and event.',
        secondaryLabel: 'Add Mascot Layer',
        secondaryPrompt: 'Continue this brand world by adding a mascot or spokesperson figure tied to the main message pillars.',
        secondarySummary: 'Add a recognizable face or figure to carry the world.',
        repairLabel: 'Add Brand Anchors',
        repairPrompt: 'Start this brand world with one symbolic concept, one signature object, and one audience-facing event.',
        repairSummary: 'Turn the vague request into a clearer branded world structure.',
      }
    case 'ugc':
      return {
        primaryLabel: 'Add Hook And Proof',
        primaryPrompt: 'Continue this UGC world by adding one stronger hook, one proof-driven event, and the object that makes the payoff believable.',
        primarySummary: 'Expand the social-native thread with a stronger hook and proof beat.',
        secondaryLabel: 'Add Creator Persona',
        secondaryPrompt: 'Continue this UGC world by adding the creator or audience persona best suited to carry the next beat.',
        secondarySummary: 'Add the human point of view that makes the scenario feel native.',
        repairLabel: 'Add A Social Scenario',
        repairPrompt: 'Start this UGC world with one creator persona, one use-case object, and one proof-led scenario.',
        repairSummary: 'Turn the vague request into a hook, persona, and payoff structure.',
      }
    default:
      return {
        primaryLabel: 'Add Key Characters',
        primaryPrompt: 'Continue this world by adding 2 or 3 key characters and connect them to the main conflict.',
        primarySummary: 'Add a compact first cast and tie them into the seeded world conflict.',
        secondaryLabel: 'Add Lore Layer',
        secondaryPrompt: 'Continue this world by adding one hidden piece of lore and one event that deepen the central tension.',
        secondarySummary: 'Deepen the seed with one lore thread and one consequence.',
        repairLabel: 'Add Characters',
        repairPrompt: 'Start this world by adding a protagonist and a rival, then connect them with a central conflict.',
        repairSummary: 'Add one hero, one rival, and a clear conflict anchor.',
      }
  }
}

const PLANNER_PROGRESS_PHASES: Array<WorldPromptPlannerProgress['phase']> = [
  'reading_context',
  'analyzing_graph',
  'planning_entities',
  'planning_relationships',
  'assembling_first_wave',
  'finalizing_plan',
]

function defaultPlannerProgressMessage(phase: WorldPromptPlannerProgress['phase']) {
  switch (phase) {
    case 'reading_context':
      return 'Reading the current world context.'
    case 'analyzing_graph':
      return 'Analyzing the graph, threads, and recent prompt history.'
    case 'planning_entities':
      return 'Planning the most important entities and updates.'
    case 'planning_relationships':
      return 'Mapping relationships, tensions, and structural links.'
    case 'assembling_first_wave':
      return 'Assembling the first wave of safe graph changes.'
    case 'finalizing_plan':
      return 'Finalizing the validated plan before execution.'
    case 'applying_changes':
      return 'Applying the validated graph changes.'
  }
}

function plannerProgressMessageForPhase(
  phase: WorldPromptPlannerProgress['phase'],
  input: {
    promptIntentHint: string
    graphDiagnosticsCount: number
    projectContextGuidance: string | null
  },
) {
  switch (phase) {
    case 'reading_context':
      return input.projectContextGuidance
        ? 'Reading the prompt with the project type, style, and current world state in mind.'
        : defaultPlannerProgressMessage(phase)
    case 'analyzing_graph':
      return input.graphDiagnosticsCount > 0
        ? `Checking current graph coverage and ${input.graphDiagnosticsCount} structural signal${input.graphDiagnosticsCount === 1 ? '' : 's'}.`
        : defaultPlannerProgressMessage(phase)
    case 'planning_entities':
      return input.promptIntentHint === 'advisory_question'
        ? 'Finding the entities, threads, and facts most relevant to the question.'
        : defaultPlannerProgressMessage(phase)
    case 'planning_relationships':
      return input.promptIntentHint === 'graph_diagnosis'
        ? 'Looking for weak links, missing pressure, and relationship gaps.'
        : defaultPlannerProgressMessage(phase)
    default:
      return defaultPlannerProgressMessage(phase)
  }
}

function buildApplyProgressMessage(input: {
  index: number
  total: number
  op: PromptToWorldOp
}) {
  const step = `${input.index}/${input.total}`
  const label = stripInternalPlannerDiagnostics(describePromptOp(input.op))
  return label ? `Applying ${step}: ${label}` : `Applying ${step}.`
}

function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity':
      return `Add or extend ${op.payload.entity.name}`
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

function buildPlannerOutline(plan: z.infer<typeof worldPromptPlannerSchema>) {
  const outline = [
    ...plan.wave1Ops.slice(0, 3).map((op) => describePromptOp(op)),
    ...plan.optionCandidates.slice(0, Math.max(0, 4 - Math.min(plan.wave1Ops.length, 3))).map((suggestion) => suggestion.label.trim()),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(outline)).slice(0, 4)
}

function plannerSchemaForMode(mode: PlannerMode) {
  switch (mode) {
    case 'refinement':
      return refinementPlannerSchema
    case 'advisory_diagnosis':
      return advisoryDiagnosisPlannerSchema
    default:
      return directBuildPlannerSchema
  }
}

function plannerModeInstructions(input: {
  mode: PlannerMode
  isSuggestionDriven: boolean
}) {
  const compactScopeInstruction = input.isSuggestionDriven
    ? 'This turn came from an explicit next-step suggestion. Keep the first wave very compact and avoid broad replanning.'
    : 'Keep the first wave compact and only include the most obvious high-signal changes.'

  switch (input.mode) {
    case 'advisory_diagnosis':
      return [
        'This is an advisory/diagnosis turn. Prioritize answer quality, graph-aware findings, and option quality over graph mutation.',
        'Only return graph ops if the user clearly asks for applied changes.',
        'Treat all project and world names as original canon unless the user explicitly asks for external inspiration, adaptation, or IP comparison.',
        'Never claim that a character, place, group, concept, or event corresponds to a third-party franchise, game, film, or IP unless the user explicitly asks for that comparison.',
        'If the current prompt asks for suggestions about a specific world layer such as locations, factions, characters, lore, or events, answer that layer directly and ground it in the provided graph context rather than drifting into unrelated prior thread details.',
        'When the current prompt changes focus relative to recent messages, the current prompt wins.',
        'Keep assistantSummary to at most 2 short sentences.',
      ]
    case 'refinement':
      return [
        'This is a refinement turn. Prefer updating existing entity summaries, entity context, or relationship notes over broad world expansion.',
        'Only create a new entity when the prompt introduces a clearly new proper noun that should become a node.',
        'Keep assistantSummary to 1 short sentence.',
        compactScopeInstruction,
      ]
    default:
      return [
        'This is a direct build turn. Prioritize the smallest complete first wave that makes the prompt land cleanly in the graph.',
        'For new entities, default to concise summaries and only include long-form context when the prompt explicitly asks for backstory, motives, secrets, or nuanced social/political pressure.',
        'Keep assistantSummary to 1 short sentence.',
        compactScopeInstruction,
      ]
  }
}

async function generatePromptPlan(input: {
  client: SupabaseClient
  payload: WorldPromptStartTurnRequest
  session: WorldPromptSession
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  recentMessages: WorldPromptMessage[]
  selectedSuggestion?: WorldPromptSuggestionRecord | null
  onPlannerProgress?: (progress: WorldPromptPlannerProgress, extras?: { plannerOutline?: string[] }) => Promise<void> | void
}) {
  const projectContextGuidance = describeProjectContextForPlanner(input.payload.snapshot.projectContext)
  const retrievalIntent = buildWorldPromptRetrievalIntent({
    prompt: input.payload.prompt,
    snapshot: input.payload.snapshot,
    summaryMemory: input.summaryMemory,
    sessionMemoryState: input.sessionMemoryState,
    selectedSuggestion: input.selectedSuggestion ?? null,
    selectedSuggestionId: input.payload.selectedSuggestionId,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedViewKey: input.payload.selectedViewKey,
  })
  const promptIntentHint = retrievalIntent.promptIntent
  const plannerMode = retrievalIntent.plannerMode
  const isSuggestionDriven = Boolean(input.payload.selectedSuggestionId)
  const entityRequirements = analyzeWorldPromptEntityRequirements(input.payload.prompt)
  const graphDiagnostics = buildGraphDiagnosticFindings({
    snapshot: input.payload.snapshot,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
  })
  const debugEnabled = shouldDebugWorldPromptOpenAi()
  const plannerRequestSchema = plannerSchemaForMode(plannerMode)
  const plannerResponseSchema = normalizeStrictJsonSchema(z.toJSONSchema(plannerRequestSchema))
  const relevantPlannerContext = await buildWorldPromptRetrievalPacket({
    client: input.client,
    mode: plannerMode,
    prompt: input.payload.prompt,
    snapshot: input.payload.snapshot,
    summaryMemory: input.summaryMemory,
    sessionMemoryState: input.sessionMemoryState,
    recentMessages: input.recentMessages,
    intent: retrievalIntent,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedViewKey: input.payload.selectedViewKey,
  })
  relevantPlannerContext.diagnostics = worldPromptRetrievalDiagnosticsSchema.parse({
    ...relevantPlannerContext.diagnostics,
    selectedSuggestionId: input.payload.selectedSuggestionId ?? null,
  })
  const instructions = [
    'You are the GraphCore prompt-to-world graph planner.',
    'Return compact JSON only that matches the provided schema exactly.',
    'You can either plan graph mutations or answer graph-aware advisory questions.',
    `Planner mode: ${plannerMode}.`,
    `Return only the fields present in the schema for this mode. Do not invent omitted top-level keys.`,
    'Allowed operations for wave1Ops: upsert_entity, update_entity, replace_entity, upsert_relationship, update_relationship, create_derived_result, queue_image_generation, queue_cinematic_generation, assistant_note.',
    'Favor additive graph growth.',
    'Use advisory_question for questions that should answer first and offer options without mutating the graph by default.',
    'Use graph_diagnosis for prompts that ask what is weak, missing, thin, underdeveloped, or structurally lacking in the current world.',
    'Use refinement_only when the prompt mainly enriches existing nodes or relationships rather than expanding the world broadly.',
    'For advisory_question and graph_diagnosis, fill answer, answerMode, optionCandidates, and diagnosticFindings. Do not force graph operations unless the user is clearly asking for applied changes.',
    'Use update_entity when the user is refining or clarifying an existing node summary, context, aliases, or tags without changing the node identity.',
    'Use update_relationship when the user is refining relationship details, tone, notes, or confidence for an existing link.',
    'Use queue_image_generation only for actor, place, or object nodes when the prompt is visually explicit.',
    'Use queue_cinematic_generation only when the prompt explicitly requests a cinematic, scene, shot, trailer, storyboard, or cutscene.',
    'Do not invent hard deletions. Use replace_entity only for explicit localized correction prompts where an existing node has the wrong identity or type.',
    'If the prompt asks for plan only, preview only, or no mutations, put the proposed applyable ops in wave1Ops, set classification to graphable_plan_only, and do not assume they will be applied immediately.',
    'When referring to existing world items, prefer targetEntityKey when obvious, otherwise use entity names and let the resolver match them.',
    'Default to applyMode auto. Favor additive graph growth and avoid proposing semantic rewrites that would require human confirmation.',
    'When the user explicitly names entities, places, groups, concepts, or events, preserve those proper nouns verbatim and create graph nodes for newly introduced names instead of inventing replacements.',
    'Treat all world names and graph content as original project canon by default. Do not speculate that they are borrowed from or mapped to external IP unless the user explicitly asks for comparison or inspiration analysis.',
    'If the prompt says something like "kingdom called X", "character called Y", "faction called Z", or "king called Q", infer the obvious world entity types directly.',
    'Only use replace_entity when the user explicitly says a node is wrong, should be a different type, should be corrected, or should be replaced.',
    'If the prompt introduces a new proper noun plus extra lore, prefer creating the new node and updating context/relationships around existing nodes instead of replacing an existing node.',
    'For a simple direct creation prompt, wave1Ops should contain the named entities and the most obvious relationships before proposing any optional follow-up suggestions.',
    entityRequirements.summary
      ? `The current prompt has explicit entity requirements: ${entityRequirements.summary}. Satisfy these in wave1Ops with concrete canon-ready names unless the request is contradictory.`
      : null,
    entityRequirements.counts.actor
      ? `Create at least ${entityRequirements.counts.actor} actor node${entityRequirements.counts.actor === 1 ? '' : 's'} for the requested character count; do not satisfy character requirements with groups, places, relationship notes, or thread text.`
      : null,
    entityRequirements.counts.group
      ? `Create enough group nodes to satisfy requested factions/houses/groups; a named ruling house is separate from requested rival factions unless the user says otherwise.`
      : null,
    entityRequirements.counts.object
      ? `Create object nodes for requested artifacts/relics/items and link them to the people, groups, places, or secrets that make them matter.`
      : null,
    'Use graphable_broad when the request wants too much for one turn. In that case, keep only the best first wave in wave1Ops and place follow-up ideas in wave2Ideas/optionalIdeas.',
    'Use not_graphable or contradictory_or_low_confidence when the prompt cannot be mapped cleanly. In that case, wave1Ops may be empty and suggestionCandidates should repair the request.',
    'For graph diagnosis, let deterministic findings steer your answer and options. Phrase them clearly, but keep them rooted in the provided graph evidence.',
    `Continuity mode: ${relevantPlannerContext.continuityMode}. Current prompt focus should outweigh older chat history.`,
    `Focus layer: ${relevantPlannerContext.focusLayer}. Prefer context from this layer first unless the prompt explicitly broadens scope.`,
    `Resolved intent: ${relevantPlannerContext.resolvedIntent}.`,
    `Resolved mode: ${relevantPlannerContext.resolvedMode}.`,
    `Resolved focus: ${relevantPlannerContext.resolvedFocus}.`,
    'Use threadActions to describe thread lifecycle changes caused by the turn: create, update, resolve, park, reprioritize, or relink_entities.',
    'Prefer reusing an existing matching thread when one clear thread already fits the prompt.',
    'Create a new thread only when the turn materially starts or branches a distinct unresolved storyline, mystery, conflict, or lore strand.',
    'Emit no thread actions when the turn is purely local, advisory, or does not materially affect ongoing story strands.',
    'Thread titles must be concrete and world-specific. Never use generic labels like "Story Thread", "Main Thread", or "Emerging Story Thread".',
    'For relink_entities, merge linked entities by default unless you are intentionally replacing thread scope.',
    'If a thread is concluded, use resolve. If it should stay available but inactive, use park. If its urgency changes, use reprioritize.',
    'threadCandidates is legacy compatibility only. Prefer threadActions.',
    'Suggestion ideas should be concrete and world-specific, not generic categories, and should never just paraphrase or repeat the user prompt.',
    ...plannerModeInstructions({
      mode: plannerMode,
      isSuggestionDriven,
    }),
    projectContextGuidance ? `Project guidance: ${projectContextGuidance}` : null,
    'Keep operations compact and high-signal.',
  ].filter(Boolean).join('\n')

  const prompt = JSON.stringify({
    plannerMode,
    session: {
      key: input.session.key,
      title: input.session.title,
      summaryMemory: relevantPlannerContext.sessionMemory.conversationMemory,
    },
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedViewKey: input.payload.selectedViewKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    resolvedMode: retrievalIntent.resolvedMode,
    resolvedIntent: retrievalIntent.resolvedIntent,
    resolvedFocus: retrievalIntent.resolvedFocus,
    entityRequirements,
    promptIntentHint,
    selectedSuggestionId: input.payload.selectedSuggestionId,
    prompt: input.payload.prompt,
    projectContext: input.payload.snapshot.projectContext,
    openThreads: input.payload.snapshot.worldThreads
      .filter((thread) => thread.status === 'open')
      .slice(0, 8)
      .map((thread) => ({
        key: thread.key,
        title: thread.title,
        summary: thread.summary,
        priority: thread.priority,
        linkedEntityKeys: thread.linkedEntityKeys.slice(0, 8),
      })),
    graphDiagnostics: plannerMode === 'advisory_diagnosis' ? graphDiagnostics : graphDiagnostics.slice(0, 2),
    retrieval: relevantPlannerContext,
  })

  let emittedPlannerProgressIndex = -1
  let plannerProgressClosed = false
  const scheduledPlannerProgressTimeouts: number[] = []

  try {
    const emitPlannerProgress = async (
      phase: WorldPromptPlannerProgress['phase'],
      overrides?: Partial<Pick<WorldPromptPlannerProgress, 'message' | 'done'>>,
      extras?: { plannerOutline?: string[] },
    ) => {
      const targetIndex = PLANNER_PROGRESS_PHASES.indexOf(phase)
      if (targetIndex < 0) return
      if (targetIndex < emittedPlannerProgressIndex) return
      const progress: WorldPromptPlannerProgress = {
        phase,
        message: overrides?.message?.trim() || plannerProgressMessageForPhase(phase, {
          promptIntentHint,
          graphDiagnosticsCount: graphDiagnostics.length,
          projectContextGuidance,
        }),
        sequence: targetIndex + 1,
        ...(typeof overrides?.done === 'boolean' ? { done: overrides.done } : {}),
      }
      emittedPlannerProgressIndex = targetIndex
      await input.onPlannerProgress?.(progress, extras)
    }

    await emitPlannerProgress('reading_context')
    ;([
      { phase: 'analyzing_graph', delayMs: 1200 },
      { phase: 'planning_entities', delayMs: 3200 },
      { phase: 'planning_relationships', delayMs: 6200 },
      { phase: 'assembling_first_wave', delayMs: 9800 },
    ] as const).forEach(({ phase, delayMs }) => {
      const timeoutId = setTimeout(() => {
        if (plannerProgressClosed) return
        void emitPlannerProgress(phase).catch((streamError) => {
          console.error('[world-prompt] synthetic planner progress emission failed.', streamError)
        })
      }, delayMs)
      scheduledPlannerProgressTimeouts.push(timeoutId)
    })

    if (debugEnabled) {
      console.log('[world-prompt-debug] planner request-meta', previewJson({
        model: input.payload.model,
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedThreadKey: input.payload.selectedThreadKey,
      }))
      console.log('[world-prompt-debug] planner request-instructions', instructions)
      console.log('[world-prompt-debug] planner request-prompt', prompt)
    }

    let normalizedPlan: z.infer<typeof worldPromptPlannerSchema> | null = null
    let creativeIssues: CreativeDescriptorIssue[] = []
    let repairFeedback: string | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptInstructions = repairFeedback
        ? `${instructions}\nRepair guidance: ${repairFeedback}`
        : instructions
      const response = await runOpenAiResponses({
        model: input.payload.model,
        input: prompt,
        instructions: attemptInstructions,
        text: {
          format: {
            type: 'json_schema',
            name: 'world_prompt_plan',
            schema: plannerResponseSchema,
          },
        },
        reasoning: { effort: 'low' },
        metadata: {
          feature: 'world-prompt',
          surface: 'grow-mode',
        },
        store: false,
        timeoutMs: 180_000,
      })

      if (debugEnabled) {
        console.log('[world-prompt-debug] planner response-meta', previewJson({
          attempt: attempt + 1,
          ok: response.response.ok,
          status: response.response.status,
          requestId: response.response.headers.get('x-request-id'),
          outputText: response.outputText,
          body: response.body,
        }))
      }

      if (!response.response.ok) {
        const upstreamMessage =
          typeof response.body.error === 'object' && response.body.error !== null
            ? ((response.body.error as { message?: string }).message ?? 'OpenAI request failed.')
            : 'OpenAI request failed.'
        throw new Error(`[world-prompt-planner] ${upstreamMessage}`)
      }

      const parsedJson = extractJsonBlock(response.outputText)
      if (!parsedJson) {
        throw new Error('World prompt planner returned invalid JSON.')
      }

      const normalizedJson = normalizePlannerJson(parsedJson)
      const validated = plannerRequestSchema.safeParse(normalizedJson)
      if (!validated.success) {
        if (debugEnabled) {
          console.log('[world-prompt-debug] planner schema-failed', previewJson(validated.error.issues))
        }
        throw new Error(`World prompt planner returned JSON that did not match the expected schema. ${formatIssues(validated.error.issues)}`)
      }

      const candidatePlan = optimizePlannerOpsForMode({
        mode: plannerMode,
        prompt: input.payload.prompt,
        plan: worldPromptPlannerSchema.parse(validated.data),
      })
      const creativeCompletion = completeCreativeDescriptorOps({
        prompt: input.payload.prompt,
        mode: plannerMode,
        classification: candidatePlan.classification,
        existingEntities: input.payload.snapshot.worldEntities,
        ops: candidatePlan.wave1Ops,
      })
      const completedPlan = worldPromptPlannerSchema.parse({
        ...candidatePlan,
        wave1Ops: creativeCompletion.ops,
        operations: creativeCompletion.ops,
      })

      normalizedPlan = completedPlan
      creativeIssues = creativeCompletion.issues
      if (
        creativeCompletionAppliesToPlan(plannerMode, completedPlan.classification)
        && !promptAllowsPlaceholderCanon(input.payload.prompt)
        && creativeIssues.length > 0
        && attempt === 0
      ) {
        repairFeedback = [
          'Replace underspecified placeholder entities with concrete canon-ready proper nouns.',
          'If a descriptor clearly points to an existing entity, reuse that entity instead of creating a generic label.',
          'Relationship endpoints must resolve to either existing entities or first-wave entity ops with specific names.',
          `Current issues: ${summarizeCreativeDescriptorIssues(creativeIssues)}.`,
        ].join(' ')
        if (debugEnabled) {
          console.log('[world-prompt-debug] planner creative-retry', previewJson({
            repairFeedback,
            issues: creativeIssues,
          }))
        }
        continue
      }
      break
    }

    plannerProgressClosed = true
    for (const timeoutId of scheduledPlannerProgressTimeouts) {
      clearTimeout(timeoutId)
    }
    await emitPlannerProgress('finalizing_plan', { done: false })
    const finalPlan = normalizedPlan
      ? stripPlannerOpsForCreativeDescriptorIssues({
          plan: normalizedPlan,
          issues: creativeIssues,
        })
      : null
    if (!finalPlan) {
      throw new Error('World prompt planner did not produce a final plan.')
    }
    const plannerOutline = buildPlannerOutline(finalPlan)
    await emitPlannerProgress('finalizing_plan', {
      message: plannerOutline.length > 0
        ? `Validated the plan and prepared ${plannerOutline.length} first-wave step${plannerOutline.length === 1 ? '' : 's'}.`
        : 'Validated the plan and prepared the next execution wave.',
      done: true,
    }, plannerOutline.length > 0 ? { plannerOutline } : undefined)

    return {
      plan: finalPlan,
      plannerFailure: null,
      retrievalPacket: relevantPlannerContext,
    }
  } catch (error) {
    plannerProgressClosed = true
    for (const timeoutId of scheduledPlannerProgressTimeouts) {
      clearTimeout(timeoutId)
    }
    if (isStopExecutionError(error)) {
      throw error
    }
    const plannerFailure = classifyPlannerFailure(error)
    console.error('[world-prompt] planner failed; world prompt turn will fail without deterministic fallback.', {
      error,
      plannerFailure,
    })
    const plannerError = new Error(`Hosted prompt planning failed: ${plannerFailure.message}`)
    ;(plannerError as Error & { plannerFailure?: WorldPromptPlannerFailure }).plannerFailure = plannerFailure
    throw plannerError
  }
}

function sanitizePromptOp(input: {
  op: PromptToWorldOp
  snapshot: WorldPromptSnapshot
  prompt?: string | null
}) {
  const op = structuredClone(input.op) as PromptToWorldOp
  const explicitCorrection = promptHasExplicitCorrectionLanguage(input.prompt ?? '')

  if (op.op === 'upsert_entity') {
    const entity = op.payload.entity
    entity.source = entity.source ?? 'ai'
    entity.ensureLinkedDefinition = entity.ensureLinkedDefinition ?? true
    let resolved = resolveEntityReference(input.snapshot, {
      entityKey: op.payload.targetEntityKey,
      definitionKey: entity.linkedDefinitionKey,
      name: entity.name,
      nodeTypeHint: entity.nodeType,
      strictNodeType: true,
    })
    if (resolved.candidates.length > 1) {
      op.applyMode = 'needs_approval'
      op.metadata = {
        ...(op.metadata ?? {}),
        matchCandidateEntityKeys: resolved.candidates.map((candidate) => candidate.key),
        resolution: resolved.matchType,
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Ambiguous entity match',
      })
    }
    if (resolved.entity) {
      const keyMatchedDifferentName = (
        resolved.matchType === 'exact_key'
        && Boolean(op.payload.targetEntityKey)
        && normalizeName(entity.name) !== normalizeName(resolved.entity.name)
        && !explicitCorrection
      )
      if (keyMatchedDifferentName) {
        const nameResolved = resolveEntityReference(input.snapshot, {
          definitionKey: entity.linkedDefinitionKey,
          name: entity.name,
          nodeTypeHint: entity.nodeType,
          strictNodeType: true,
        })
        if (!nameResolved.entity && nameResolved.candidates.length === 0) {
          op.payload.targetEntityKey = null
          return annotatePromptOpMetadata({ op, touchesExisting: false })
        }
        resolved = nameResolved
      }
      if (!resolved.entity) {
        op.applyMode = 'needs_approval'
        op.metadata = {
          ...(op.metadata ?? {}),
          matchCandidateEntityKeys: resolved.candidates.map((candidate) => candidate.key),
          resolution: resolved.matchType,
        }
        return annotatePromptOpMetadata({
          op,
          touchesExisting: true,
          approvalReason: 'Ambiguous entity match',
        })
      }
      op.payload.targetEntityKey = resolved.entity.key
      const renaming = normalizeName(entity.name) !== normalizeName(resolved.entity.name)
      const changingKind = entity.nodeType !== resolved.entity.nodeType
      const relinking = Boolean(entity.linkedDefinitionKey && entity.linkedDefinitionKey !== resolved.entity.linkedDefinitionKey)
      const canonTouch = entityIsCanonLocked(resolved.entity)
      const identityRewrite = renaming || relinking || changingKind
      if (identityRewrite || canonTouch || (changingKind && explicitCorrection)) {
        op.applyMode = 'needs_approval'
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        canonTouch,
        approvalReason: identityRewrite || (changingKind && explicitCorrection)
          ? 'Semantic rewrite of existing entity'
          : canonTouch ? 'Touches canon-locked entity' : null,
      })
    }
    return annotatePromptOpMetadata({ op, touchesExisting: false })
  }

  if (op.op === 'update_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!target) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing entity target',
      })
    }
    const destructive = (
      op.payload.changes.name !== undefined
      || op.payload.changes.nodeType !== undefined
      || op.payload.changes.linkedDefinitionKey !== undefined
    )
    const canonTouch = entityIsCanonLocked(target)
    if (destructive || canonTouch) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: destructive ? 'Semantic rewrite of existing entity' : canonTouch ? 'Touches canon-locked entity' : null,
    })
  }

  if (op.op === 'replace_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!target) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing entity target',
      })
    }

    if (op.payload.replacementMode === 'create' && op.payload.replacementEntity) {
      op.payload.replacementEntity.source = op.payload.replacementEntity.source ?? 'ai'
      op.payload.replacementEntity.ensureLinkedDefinition = op.payload.replacementEntity.ensureLinkedDefinition ?? true
      const resolvedReplacement = resolveEntityReference(input.snapshot, {
        entityKey: op.payload.replacementEntityKey,
        definitionKey: op.payload.replacementEntity.linkedDefinitionKey,
        name: op.payload.replacementEntity.name,
      })
      if (resolvedReplacement.candidates.length > 1) {
        op.applyMode = 'needs_approval'
        op.metadata = {
          ...(op.metadata ?? {}),
          replacementMatchCandidateEntityKeys: resolvedReplacement.candidates.map((candidate) => candidate.key),
          replacementResolution: resolvedReplacement.matchType,
        }
        return annotatePromptOpMetadata({
          op,
          touchesExisting: true,
          approvalReason: 'Ambiguous replacement entity match',
        })
      }
      if (resolvedReplacement.entity && resolvedReplacement.entity.key !== target.key) {
        op.payload.replacementMode = 'existing'
        op.payload.replacementEntityKey = resolvedReplacement.entity.key
        op.payload.replacementEntity = null
      }
    }

    if (op.payload.replacementMode === 'existing') {
      const replacement = op.payload.replacementEntityKey
        ? input.snapshot.worldEntities.find((entity) => entity.key === op.payload.replacementEntityKey) ?? null
        : null
      if (!replacement || replacement.key === target.key) {
        op.applyMode = 'needs_approval'
        return annotatePromptOpMetadata({
          op,
          touchesExisting: true,
          approvalReason: 'Replacement entity target is invalid',
        })
      }
    }

    const canonTouch = entityIsCanonLocked(target)
    op.applyMode = 'needs_approval'
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: !explicitCorrection
        ? 'Replacement requires explicit correction intent'
        : canonTouch ? 'Touches canon-locked entity' : 'Semantic replacement of existing entity',
    })
  }

  if (op.op === 'upsert_relationship') {
    const relationship = op.payload.relationship
    const source = resolveRelationshipEndpointReference(input.snapshot, {
      entityKey: relationship.sourceEntityKey,
      definitionKey: relationship.sourceRef?.definitionKey,
      name: relationship.sourceRef?.name ?? relationship.sourceEntityKey,
      alias: relationship.sourceRef?.alias,
    })
    const target = resolveRelationshipEndpointReference(input.snapshot, {
      entityKey: relationship.targetEntityKey,
      definitionKey: relationship.targetRef?.definitionKey,
      name: relationship.targetRef?.name ?? relationship.targetEntityKey,
      alias: relationship.targetRef?.alias,
    })
    if (!source.entity || !target.entity || source.candidates.length > 1 || target.candidates.length > 1) {
      op.applyMode = 'needs_approval'
      op.metadata = {
        ...(op.metadata ?? {}),
        sourceCandidates: source.candidates.map((candidate) => candidate.key),
        targetCandidates: target.candidates.map((candidate) => candidate.key),
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Ambiguous relationship endpoint',
      })
    }
    relationship.sourceEntityKey = source.entity.key
    relationship.targetEntityKey = target.entity.key
    if (relationship.sourceEntityKey === relationship.targetEntityKey) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Relationship endpoints collapsed to the same entity',
      })
    }
    const existing = input.snapshot.worldRelationships.find((entry) => (
      entry.sourceEntityKey === source.entity?.key
      && entry.targetEntityKey === target.entity?.key
      && normalizeName(entry.verb) === normalizeName(relationship.verb)
    )) ?? null
    if (existing) {
      op.payload.targetRelationshipKey = existing.key
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: Boolean(existing),
      canonTouch: entityIsCanonLocked(source.entity) || entityIsCanonLocked(target.entity) || relationshipIsCanonLocked(existing),
      approvalReason: entityIsCanonLocked(source.entity) || entityIsCanonLocked(target.entity) || relationshipIsCanonLocked(existing)
        ? 'Touches canon-locked graph semantics'
        : null,
    })
  }

  if (op.op === 'update_relationship') {
    const target = input.snapshot.worldRelationships.find((relationship) => relationship.key === op.payload.targetRelationshipKey) ?? null
    if (!target) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing relationship target',
      })
    }
    const semanticChange = (
      op.payload.changes.verb !== undefined
      || op.payload.changes.direction !== undefined
      || op.payload.changes.sourceEntityKey !== undefined
      || op.payload.changes.targetEntityKey !== undefined
    )
    const canonTouch = relationshipIsCanonLocked(target)
    if (semanticChange || canonTouch) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: semanticChange ? 'Semantic rewrite of existing relationship' : canonTouch ? 'Touches canon-locked relationship' : null,
    })
  }

  if (op.op === 'create_derived_result') {
    const source = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.sourceEntityKey) ?? null
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!source || !target) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch: entityIsCanonLocked(source) || entityIsCanonLocked(target),
      approvalReason: !source || !target ? 'Derived result dependencies are missing' : entityIsCanonLocked(source) || entityIsCanonLocked(target) ? 'Touches canon-locked entity' : null,
    })
  }

  if (op.op === 'queue_image_generation') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!target || !['actor', 'place', 'object'].includes(target.nodeType)) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch: entityIsCanonLocked(target),
      approvalReason: !target || !['actor', 'place', 'object'].includes(target.nodeType)
        ? 'Image generation target is invalid'
        : entityIsCanonLocked(target) ? 'Touches canon-locked entity' : null,
    })
  }

  return annotatePromptOpMetadata({ op, touchesExisting: false })
}

async function invokeEdgeFunction<TResponse>(input: {
  authHeader: string
  functionName: string
  body: Record<string, unknown>
  schema?: z.ZodType<TResponse>
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured.')
  const response = await fetch(`${supabaseUrl}/functions/v1/${input.functionName}`, {
    method: 'POST',
    headers: {
      Authorization: input.authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `${input.functionName} failed.`)
  }
  return input.schema ? input.schema.parse(payload) : payload as TResponse
}

async function createPromptWorldEntity(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entity: WorldEntityCreateInput
  preferredKey?: string | null
}) {
  const { linkedDefinitionKey, createdDefinition } = await ensureLinkedDefinition({
    client: input.client,
    snapshot: input.snapshot,
    entity: input.entity,
  })

  const key = input.preferredKey || buildWorldEntityKey(input.snapshot, input.entity.nodeType, input.entity.name)
  const insertResponse = await input.client
    .from('world_entities')
    .insert({
      draft_id: input.snapshot.draft.id,
      key,
      name: input.entity.name,
      summary: input.entity.summary,
      context: input.entity.context,
      node_type: input.entity.nodeType,
      aliases: input.entity.aliases,
      tags: input.entity.tags,
      status: input.entity.status,
      thumbnail_asset_key: input.entity.thumbnailAssetKey,
      linked_definition_key: linkedDefinitionKey,
      source: input.entity.source ?? 'ai',
      custom_properties: input.entity.customProperties,
      metadata: input.entity.metadata,
    })
    .select(WORLD_ENTITY_SELECT)
    .single()
  if (insertResponse.error) throw new Error(insertResponse.error.message)

  const createdEntity = mapWorldEntityRow(insertResponse.data as WorldEntityRow)
  input.snapshot.worldEntities = [
    ...input.snapshot.worldEntities.filter((entity) => entity.key !== createdEntity.key),
    createdEntity,
  ]

  return {
    entity: createdEntity,
    linkedDefinitionKey,
    createdDefinitionKey: createdDefinition && linkedDefinitionKey ? linkedDefinitionKey : null,
    createdDefinition,
  }
}

async function replaceWorldEntityGraph(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  targetEntityKey: string
  replacementEntityKey: string
  reason: string
  archiveOldEntity: boolean
  deleteOldEntity: boolean
  transferRelationships: boolean
  transferGraphConnections: boolean
  transferDerivedResults: boolean
  archiveOldDefinitionKey: string | null
  replacementDefinitionKey: string | null
}) {
  const rpcResponse = await input.client.rpc('replace_world_entity', {
    p_draft_id: input.snapshot.draft.id,
    p_target_entity_key: input.targetEntityKey,
    p_replacement_entity_key: input.replacementEntityKey,
    p_transfer_relationships: input.transferRelationships,
    p_transfer_graph_connections: input.transferGraphConnections,
    p_transfer_derived_results: input.transferDerivedResults,
    p_archive_old_entity: input.archiveOldEntity,
    p_delete_old_entity: input.deleteOldEntity,
    p_reason: input.reason || null,
    p_archive_old_definition_key: input.archiveOldDefinitionKey,
    p_replacement_definition_key: input.replacementDefinitionKey,
  })
  if (rpcResponse.error) throw new Error(rpcResponse.error.message)

  const rpcResult = replaceWorldEntityRpcResultSchema.parse(rpcResponse.data ?? {})
  const touchedEntityKeys = [
    rpcResult.archivedEntityKey,
    rpcResult.replacementEntityKey,
  ].filter((value): value is string => Boolean(value))

  const worldEntities = await loadWorldEntitiesByDraftAndKeys(input.client, input.snapshot.draft.id, touchedEntityKeys)
  input.snapshot.worldEntities = [
    ...input.snapshot.worldEntities.filter((entity) => !touchedEntityKeys.includes(entity.key)),
    ...worldEntities,
  ]

  const worldRelationships = await loadWorldRelationshipsByDraftAndKeys(
    input.client,
    input.snapshot.draft.id,
    rpcResult.touchedRelationshipKeys,
    input.snapshot.worldEntities,
  )
  input.snapshot.worldRelationships = [
    ...input.snapshot.worldRelationships.filter((relationship) => !rpcResult.touchedRelationshipKeys.includes(relationship.key)),
    ...worldRelationships,
  ]

  const worldViews = await loadWorldViewsByDraftAndKeys(input.client, input.snapshot.draft.id, rpcResult.touchedViewKeys)
  input.snapshot.worldViews = [
    ...input.snapshot.worldViews.filter((view) => !rpcResult.touchedViewKeys.includes(view.key)),
    ...worldViews,
  ]

  const worldOperators = await loadWorldOperatorsByDraftAndKeys(input.client, input.snapshot.draft.id, rpcResult.touchedOperatorKeys)
  input.snapshot.worldOperators = [
    ...input.snapshot.worldOperators.filter((operator) => !rpcResult.touchedOperatorKeys.includes(operator.key)),
    ...worldOperators,
  ]

  const worldResults = await loadWorldResultsByDraftAndKeys(input.client, input.snapshot.draft.id, rpcResult.touchedResultKeys)
  input.snapshot.worldResults = [
    ...input.snapshot.worldResults.filter((result) => !rpcResult.touchedResultKeys.includes(result.key)),
    ...worldResults,
  ]

  const worldGraphConnections = await loadWorldGraphConnectionsByDraftAndKeys(
    input.client,
    input.snapshot.draft.id,
    rpcResult.touchedConnectionKeys,
  )
  input.snapshot.worldGraphConnections = [
    ...input.snapshot.worldGraphConnections.filter((connection) => !rpcResult.touchedConnectionKeys.includes(connection.key)),
    ...worldGraphConnections,
  ]

  const worldThreads = await loadWorldThreadsByDraftAndKeys(input.client, input.snapshot.draft.id, rpcResult.touchedThreadKeys)
  input.snapshot.worldThreads = [
    ...input.snapshot.worldThreads.filter((thread) => !rpcResult.touchedThreadKeys.includes(thread.key)),
    ...worldThreads,
  ]

  return {
    worldEntities,
    worldRelationships,
    worldViews,
    worldOperators,
    worldResults,
    worldGraphConnections,
    worldThreads,
  }
}

async function applyPromptOp(input: {
  client: SupabaseClient
  authHeader: string
  model: string
  snapshot: WorldPromptSnapshot
  prompt: string
  op: PromptToWorldOp
}) {
  if (input.op.op === 'assistant_note') {
    return {
      applied: {},
      queue: null,
      note: input.op.payload.message,
    }
  }

  if (input.op.op === 'upsert_entity') {
    const target = !isProjectedCreate(input.op) && input.op.payload.targetEntityKey
      ? input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
      : null
    if (target) {
      const updatedEntity = await mergePromptEntityIntoExisting({
        client: input.client,
        draftId: input.snapshot.draft.id,
        target,
        incoming: input.op.payload.entity,
        linkedDefinitionKey: target.linkedDefinitionKey,
      })
      await syncLinkedDefinitionFromWorldEntity({
        client: input.client,
        draftId: input.snapshot.draft.id,
        entity: updatedEntity,
      })
      input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
      return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
    }

    const ensuredDefinition = await ensureLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: input.op.payload.entity,
    })
    const linkedDefinitionKey = ensuredDefinition.linkedDefinitionKey
    const key = input.op.payload.targetEntityKey || buildWorldEntityKey(input.snapshot, input.op.payload.entity.nodeType, input.op.payload.entity.name)
    const dbTarget = await loadWorldEntityByDraftAndKey(input.client, input.snapshot.draft.id, key)
      if (dbTarget) {
        const updatedEntity = await mergePromptEntityIntoExisting({
          client: input.client,
          draftId: input.snapshot.draft.id,
          target: dbTarget,
          incoming: input.op.payload.entity,
          linkedDefinitionKey,
        })
        await syncLinkedDefinitionFromWorldEntity({
          client: input.client,
          draftId: input.snapshot.draft.id,
          entity: updatedEntity,
        })
        input.snapshot.worldEntities = [
          ...input.snapshot.worldEntities.filter((entity) => entity.key !== updatedEntity.key),
          updatedEntity,
        ]
      return {
        applied: { worldEntities: [updatedEntity] },
        definitions: ensuredDefinition.createdDefinition ? [ensuredDefinition.createdDefinition] : [],
        queue: null,
        note: null,
      }
    }
    const insertResponse = await input.client
      .from('world_entities')
      .insert({
        draft_id: input.snapshot.draft.id,
        key,
        name: input.op.payload.entity.name,
        summary: input.op.payload.entity.summary,
        context: input.op.payload.entity.context,
        node_type: input.op.payload.entity.nodeType,
        aliases: input.op.payload.entity.aliases,
        tags: input.op.payload.entity.tags,
        status: input.op.payload.entity.status,
        thumbnail_asset_key: input.op.payload.entity.thumbnailAssetKey,
        linked_definition_key: linkedDefinitionKey,
        source: input.op.payload.entity.source ?? 'ai',
        custom_properties: input.op.payload.entity.customProperties,
        metadata: input.op.payload.entity.metadata,
      })
      .select(WORLD_ENTITY_SELECT)
      .single()
    if (insertResponse.error) {
      const message = insertResponse.error.message ?? ''
      if (message.includes('world_entities_draft_id_key_key')) {
        const collidedEntity = await loadWorldEntityByDraftAndKey(input.client, input.snapshot.draft.id, key)
        if (collidedEntity) {
          const updatedEntity = await mergePromptEntityIntoExisting({
            client: input.client,
            draftId: input.snapshot.draft.id,
            target: collidedEntity,
            incoming: input.op.payload.entity,
            linkedDefinitionKey,
          })
          await syncLinkedDefinitionFromWorldEntity({
            client: input.client,
            draftId: input.snapshot.draft.id,
            entity: updatedEntity,
          })
          input.snapshot.worldEntities = [
            ...input.snapshot.worldEntities.filter((entity) => entity.key !== updatedEntity.key),
            updatedEntity,
          ]
          return {
            applied: { worldEntities: [updatedEntity] },
            definitions: ensuredDefinition.createdDefinition ? [ensuredDefinition.createdDefinition] : [],
            queue: null,
            note: null,
          }
        }
      }
      throw new Error(message)
    }
    const createdEntity = mapWorldEntityRow(insertResponse.data as WorldEntityRow)
    await syncLinkedDefinitionFromWorldEntity({
      client: input.client,
      draftId: input.snapshot.draft.id,
      entity: createdEntity,
    })
    input.snapshot.worldEntities = [
      ...input.snapshot.worldEntities.filter((entity) => entity.key !== createdEntity.key),
      createdEntity,
    ]
    return {
      applied: { worldEntities: [createdEntity] },
      definitions: ensuredDefinition.createdDefinition ? [ensuredDefinition.createdDefinition] : [],
      queue: null,
      note: null,
    }
  }

  if (input.op.op === 'update_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!target) throw new Error(`World entity ${input.op.payload.targetEntityKey} not found.`)
    const changes = input.op.payload.changes
    const nextAliases = changes.aliases ? Array.from(new Set([...target.aliases, ...changes.aliases])) : target.aliases
    const nextTags = changes.tags ? Array.from(new Set([...target.tags, ...changes.tags])) : target.tags
    const summaryMerge = mergeCanonicalText({
      existing: target.summary,
      incoming: changes.summary,
      maxUnits: 4,
    })
    const contextMerge = mergeCanonicalContext({
      existing: target.context,
      incoming: changes.context,
    })
    let nextMetadata: Record<string, unknown> = {
      ...(target.metadata ?? {}),
      ...(changes.metadata ?? {}),
    }
    nextMetadata = appendRefinementHistory({
      metadata: nextMetadata,
      field: 'summary',
      previousText: target.summary,
      incomingText: changes.summary,
      resultText: summaryMerge.text,
      strategy: summaryMerge.strategy,
      changed: summaryMerge.changed,
    })
    nextMetadata = appendRefinementHistory({
      metadata: nextMetadata,
      field: 'context',
      previousText: target.context,
      incomingText: changes.context,
      resultText: contextMerge.text,
      strategy: contextMerge.strategy,
      changed: contextMerge.changed,
    })
    const updateResponse = await input.client
      .from('world_entities')
      .update({
        aliases: nextAliases,
        tags: nextTags,
        summary: summaryMerge.text,
        context: contextMerge.text,
        metadata: nextMetadata,
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .single()
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    const updatedEntity = worldEntitySchema.parse({
      id: updateResponse.data.id,
      key: updateResponse.data.key,
      name: updateResponse.data.name,
      summary: updateResponse.data.summary ?? '',
      context: updateResponse.data.context ?? '',
      nodeType: updateResponse.data.node_type,
      aliases: updateResponse.data.aliases ?? [],
      tags: updateResponse.data.tags ?? [],
      status: updateResponse.data.status,
      thumbnailAssetKey: updateResponse.data.thumbnail_asset_key,
      linkedDefinitionKey: updateResponse.data.linked_definition_key,
      source: updateResponse.data.source,
      customProperties: updateResponse.data.custom_properties ?? {},
      metadata: updateResponse.data.metadata ?? {},
      createdAt: updateResponse.data.created_at,
      updatedAt: updateResponse.data.updated_at,
    })
    await syncLinkedDefinitionFromWorldEntity({
      client: input.client,
      draftId: input.snapshot.draft.id,
      entity: updatedEntity,
    })
    input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
    return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
  }

  if (input.op.op === 'replace_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!target) throw new Error(`World entity ${input.op.payload.targetEntityKey} not found.`)

    let replacementEntity: WorldEntity | null = null
    let replacementDefinitionKey: string | null = null
    let createdReplacementEntityKey: string | null = null
    let createdReplacementDefinitionKey: string | null = null
    let createdReplacementDefinition: Record<string, unknown> | null = null

    try {
      if (input.op.payload.replacementMode === 'existing') {
        replacementEntity = input.op.payload.replacementEntityKey
          ? input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.replacementEntityKey) ?? null
          : null
        if (!replacementEntity) {
          throw new Error(`Replacement entity ${input.op.payload.replacementEntityKey} not found.`)
        }
        replacementDefinitionKey = replacementEntity.linkedDefinitionKey
      } else {
        if (!input.op.payload.replacementEntity) {
          throw new Error('replace_entity in create mode requires replacementEntity.')
        }
        const created = await createPromptWorldEntity({
          client: input.client,
          snapshot: input.snapshot,
          entity: input.op.payload.replacementEntity,
          preferredKey: input.op.payload.replacementEntityKey,
        })
        replacementEntity = created.entity
        replacementDefinitionKey = created.linkedDefinitionKey
        createdReplacementEntityKey = created.entity.key
        createdReplacementDefinitionKey = created.createdDefinitionKey
        createdReplacementDefinition = created.createdDefinition ?? null
      }

      if (!replacementEntity) {
        throw new Error('Replacement entity could not be resolved.')
      }

      const replaced = await replaceWorldEntityGraph({
        client: input.client,
        snapshot: input.snapshot,
        targetEntityKey: target.key,
        replacementEntityKey: replacementEntity.key,
        reason: input.op.payload.reason,
        archiveOldEntity: input.op.payload.archiveOldEntity,
        deleteOldEntity: input.op.payload.deleteOldEntity,
        transferRelationships: input.op.payload.transferRelationships,
        transferGraphConnections: input.op.payload.transferGraphConnections,
        transferDerivedResults: input.op.payload.transferDerivedResults,
        archiveOldDefinitionKey: target.linkedDefinitionKey,
        replacementDefinitionKey,
      })

      return {
        applied: {
          worldEntities: replaced.worldEntities,
          worldRelationships: replaced.worldRelationships,
          worldViews: replaced.worldViews,
          worldOperators: replaced.worldOperators,
          worldResults: replaced.worldResults,
          worldGraphConnections: replaced.worldGraphConnections,
        },
        definitions: createdReplacementDefinition ? [createdReplacementDefinition] : [],
        queue: null,
        note: null,
      }
    } catch (error) {
      if (createdReplacementEntityKey) {
        await deleteWorldEntityByKey(input.client, input.snapshot.draft.id, createdReplacementEntityKey).catch(() => undefined)
      }
      if (createdReplacementDefinitionKey) {
        await deleteProjectDefinitionByKey(input.client, input.snapshot.draft.id, createdReplacementDefinitionKey).catch(() => undefined)
      }
      throw error
    }
  }

  if (input.op.op === 'upsert_relationship') {
    const relationship = input.op.payload.relationship
    const existing = input.op.payload.targetRelationshipKey
      ? input.snapshot.worldRelationships.find((entry) => entry.key === input.op.payload.targetRelationshipKey) ?? null
      : null
    if (existing) {
      const notesMerge = mergeCanonicalText({
        existing: existing.notes,
        incoming: relationship.notes,
        maxUnits: 6,
      })
      let nextMetadata: Record<string, unknown> = {
        ...(existing.metadata ?? {}),
        ...(relationship.metadata ?? {}),
      }
      nextMetadata = appendRefinementHistory({
        metadata: nextMetadata,
        field: 'notes',
        previousText: existing.notes,
        incomingText: relationship.notes,
        resultText: notesMerge.text,
        strategy: notesMerge.strategy,
        changed: notesMerge.changed,
      })
      const updateResponse = await input.client
        .from('world_relationships')
        .update({
          notes: notesMerge.text,
          strength: relationship.strength ?? existing.strength,
          confidence: relationship.confidence ?? existing.confidence,
          metadata: nextMetadata,
        })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', existing.key)
        .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      const updated = worldRelationshipSchema.parse({
        id: updateResponse.data.id,
        key: updateResponse.data.key,
        sourceEntityKey: relationship.sourceEntityKey,
        targetEntityKey: relationship.targetEntityKey,
        verb: updateResponse.data.verb,
        direction: updateResponse.data.direction,
        strength: updateResponse.data.strength,
        confidence: updateResponse.data.confidence,
        source: updateResponse.data.source,
        notes: updateResponse.data.notes ?? '',
        state: updateResponse.data.state,
        metadata: updateResponse.data.metadata ?? {},
        createdAt: updateResponse.data.created_at,
        updatedAt: updateResponse.data.updated_at,
      })
      input.snapshot.worldRelationships = input.snapshot.worldRelationships.map((entry) => entry.key === updated.key ? updated : entry)
      return { applied: { worldRelationships: [updated] }, queue: null, note: null }
    }

    if (!relationship.sourceEntityKey || !relationship.targetEntityKey) {
      const resolvedSource = resolveEntityReference(input.snapshot, {
        entityKey: relationship.sourceEntityKey,
        definitionKey: relationship.sourceRef?.definitionKey,
        name: relationship.sourceRef?.name ?? relationship.sourceEntityKey,
        alias: relationship.sourceRef?.alias,
      })
      const resolvedTarget = resolveEntityReference(input.snapshot, {
        entityKey: relationship.targetEntityKey,
        definitionKey: relationship.targetRef?.definitionKey,
        name: relationship.targetRef?.name ?? relationship.targetEntityKey,
        alias: relationship.targetRef?.alias,
      })
      if (resolvedSource.entity && resolvedTarget.entity && resolvedSource.candidates.length === 1 && resolvedTarget.candidates.length === 1) {
        relationship.sourceEntityKey = resolvedSource.entity.key
        relationship.targetEntityKey = resolvedTarget.entity.key
      }
    }
    if (!relationship.sourceEntityKey || !relationship.targetEntityKey) {
      return {
        applied: {},
        queue: null,
        note: 'Skipped one relationship because its endpoints could not be resolved cleanly from the current world state.',
      }
    }
    if (relationship.sourceEntityKey === relationship.targetEntityKey) {
      return {
        applied: {},
        queue: null,
        note: 'Skipped one relationship because both endpoints resolved to the same entity.',
      }
    }
    const key = buildWorldRelationshipKey(input.snapshot, relationship.sourceEntityKey, relationship.verb, relationship.targetEntityKey)
    const sourceEntity = input.snapshot.worldEntities.find((entity) => entity.key === relationship.sourceEntityKey) ?? null
    const targetEntity = input.snapshot.worldEntities.find((entity) => entity.key === relationship.targetEntityKey) ?? null
    if (!sourceEntity || !targetEntity) {
      return {
        applied: {},
        queue: null,
        note: 'Skipped one relationship because one or both endpoints were still missing after entity creation.',
      }
    }
    const insertResponse = await input.client
      .from('world_relationships')
      .insert({
        draft_id: input.snapshot.draft.id,
        key,
        source_entity_id: sourceEntity.id,
        target_entity_id: targetEntity.id,
        verb: relationship.verb,
        direction: relationship.direction,
        strength: relationship.strength,
        confidence: relationship.confidence,
        source: relationship.source,
        notes: relationship.notes,
        state: relationship.state,
        metadata: relationship.metadata,
      })
      .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
      .single()
    if (insertResponse.error) throw new Error(insertResponse.error.message)
    const created = worldRelationshipSchema.parse({
      id: insertResponse.data.id,
      key: insertResponse.data.key,
      sourceEntityKey: sourceEntity.key,
      targetEntityKey: targetEntity.key,
      verb: insertResponse.data.verb,
      direction: insertResponse.data.direction,
      strength: insertResponse.data.strength,
      confidence: insertResponse.data.confidence,
      source: insertResponse.data.source,
      notes: insertResponse.data.notes ?? '',
      state: insertResponse.data.state,
      metadata: insertResponse.data.metadata ?? {},
      createdAt: insertResponse.data.created_at,
      updatedAt: insertResponse.data.updated_at,
    })
    input.snapshot.worldRelationships = [...input.snapshot.worldRelationships, created]
    return { applied: { worldRelationships: [created] }, queue: null, note: null }
  }

  if (input.op.op === 'update_relationship') {
    const target = input.snapshot.worldRelationships.find((relationship) => relationship.key === input.op.payload.targetRelationshipKey) ?? null
    if (!target) throw new Error(`World relationship ${input.op.payload.targetRelationshipKey} not found.`)
    const notesMerge = mergeCanonicalText({
      existing: target.notes,
      incoming: input.op.payload.changes.notes,
      maxUnits: 6,
    })
    let nextMetadata: Record<string, unknown> = {
      ...(target.metadata ?? {}),
      ...(input.op.payload.changes.metadata ?? {}),
    }
    nextMetadata = appendRefinementHistory({
      metadata: nextMetadata,
      field: 'notes',
      previousText: target.notes,
      incomingText: input.op.payload.changes.notes,
      resultText: notesMerge.text,
      strategy: notesMerge.strategy,
      changed: notesMerge.changed,
    })
    const updateResponse = await input.client
      .from('world_relationships')
      .update({
        notes: notesMerge.text,
        strength: input.op.payload.changes.strength ?? target.strength,
        confidence: input.op.payload.changes.confidence ?? target.confidence,
        metadata: nextMetadata,
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
      .single()
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    const updated = worldRelationshipSchema.parse({
      id: updateResponse.data.id,
      key: updateResponse.data.key,
      sourceEntityKey: target.sourceEntityKey,
      targetEntityKey: target.targetEntityKey,
      verb: updateResponse.data.verb,
      direction: updateResponse.data.direction,
      strength: updateResponse.data.strength,
      confidence: updateResponse.data.confidence,
      source: updateResponse.data.source,
      notes: updateResponse.data.notes ?? '',
      state: updateResponse.data.state,
      metadata: updateResponse.data.metadata ?? {},
      createdAt: updateResponse.data.created_at,
      updatedAt: updateResponse.data.updated_at,
    })
    input.snapshot.worldRelationships = input.snapshot.worldRelationships.map((relationship) => relationship.key === updated.key ? updated : relationship)
    return { applied: { worldRelationships: [updated] }, queue: null, note: null }
  }

  if (input.op.op === 'create_derived_result') {
    const sourceEntity = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.sourceEntityKey) ?? null
    const targetEntity = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!sourceEntity || !targetEntity) throw new Error('Derived result requires both source and target entities.')
    const operatorKey = buildWorldOperatorKey(input.snapshot, sourceEntity.key, input.op.payload.operatorType, targetEntity.key)
    const operatorInsert = await input.client
      .from('world_operators')
      .insert({
        draft_id: input.snapshot.draft.id,
        key: operatorKey,
        operator_type: input.op.payload.operatorType,
        input_entity_keys: [sourceEntity.key, targetEntity.key],
        label: '',
        status: 'active',
        metadata: input.op.payload.metadata,
      })
      .select('id, key, operator_type, input_entity_keys, label, status, metadata, created_at, updated_at')
      .single()
    if (operatorInsert.error) throw new Error(operatorInsert.error.message)
    const resultTitle = input.op.payload.title?.trim() || `${sourceEntity.name} ${targetEntity.name}`
    const resultKey = buildWorldResultKey(input.snapshot, resultTitle)
    const resultInsert = await input.client
      .from('world_results')
      .insert({
        draft_id: input.snapshot.draft.id,
        key: resultKey,
        result_type: input.op.payload.operatorType === 'place_in' ? 'scene_setup' : input.op.payload.operatorType === 'paired_with' ? 'paired_subject' : input.op.payload.operatorType === 'stage_scene' ? 'staged_character' : input.op.payload.operatorType === 'wear' ? 'look_variant' : 'equipped_variant',
        source_operator_key: operatorKey,
        title: resultTitle,
        summary: input.op.payload.summary,
        preview_asset_key: sourceEntity.thumbnailAssetKey ?? targetEntity.thumbnailAssetKey ?? null,
        status: 'draft',
        metadata: input.op.payload.metadata,
      })
      .select('id, key, result_type, source_operator_key, title, summary, preview_asset_key, status, metadata, created_at, updated_at')
      .single()
    if (resultInsert.error) throw new Error(resultInsert.error.message)
    const connectionInsert = await input.client
      .from('world_graph_connections')
      .insert([
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${sourceEntity.key}-to-${operatorKey}`),
          source_node_key: sourceEntity.key,
          source_node_kind: 'entity',
          target_node_key: operatorKey,
          target_node_kind: 'operator',
          role: 'input',
          metadata: {},
        },
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${targetEntity.key}-to-${operatorKey}`),
          source_node_key: targetEntity.key,
          source_node_kind: 'entity',
          target_node_key: operatorKey,
          target_node_kind: 'operator',
          role: 'input',
          metadata: {},
        },
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${operatorKey}-to-${resultKey}`),
          source_node_key: operatorKey,
          source_node_kind: 'operator',
          target_node_key: resultKey,
          target_node_kind: 'result',
          role: 'output',
          metadata: {},
        },
      ])
      .select('id, key, source_node_key, source_node_kind, target_node_key, target_node_kind, role, metadata, created_at, updated_at')
    if (connectionInsert.error) throw new Error(connectionInsert.error.message)
    const operator: WorldOperator = {
      id: operatorInsert.data.id,
      key: operatorInsert.data.key,
      operatorType: operatorInsert.data.operator_type,
      inputEntityKeys: operatorInsert.data.input_entity_keys ?? [],
      label: operatorInsert.data.label ?? '',
      status: operatorInsert.data.status,
      metadata: operatorInsert.data.metadata ?? {},
      createdAt: operatorInsert.data.created_at,
      updatedAt: operatorInsert.data.updated_at,
    }
    const result: WorldResult = {
      id: resultInsert.data.id,
      key: resultInsert.data.key,
      resultType: resultInsert.data.result_type,
      sourceOperatorKey: resultInsert.data.source_operator_key,
      title: resultInsert.data.title,
      summary: resultInsert.data.summary ?? '',
      previewAssetKey: resultInsert.data.preview_asset_key,
      status: resultInsert.data.status,
      metadata: resultInsert.data.metadata ?? {},
      createdAt: resultInsert.data.created_at,
      updatedAt: resultInsert.data.updated_at,
    }
    const connections: WorldGraphConnection[] = ((connectionInsert.data ?? []) as Array<Record<string, unknown>>).map((entry) => ({
      id: String(entry.id),
      key: String(entry.key),
      sourceNodeKey: String(entry.source_node_key),
      sourceNodeKind: entry.source_node_kind as WorldGraphConnection['sourceNodeKind'],
      targetNodeKey: String(entry.target_node_key),
      targetNodeKind: entry.target_node_kind as WorldGraphConnection['targetNodeKind'],
      role: entry.role as WorldGraphConnection['role'],
      metadata: (entry.metadata as Record<string, unknown>) ?? {},
      createdAt: String(entry.created_at),
      updatedAt: String(entry.updated_at),
    }))
    input.snapshot.worldOperators = [...input.snapshot.worldOperators, operator]
    input.snapshot.worldResults = [...input.snapshot.worldResults, result]
    input.snapshot.worldGraphConnections = [...input.snapshot.worldGraphConnections, ...connections]
    return {
      applied: {
        worldOperators: [operator],
        worldResults: [result],
        worldGraphConnections: connections,
      },
      queue: null,
      note: null,
    }
  }

  if (input.op.op === 'queue_image_generation') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    const definitionKey = input.op.payload.definitionKey ?? target?.linkedDefinitionKey ?? null
    if (!target || !definitionKey) throw new Error('Image generation requires a linked entity definition.')
    const definition = input.snapshot.definitions.find((entry) => entry.key === definitionKey) ?? null
    if (!definition) throw new Error(`Definition ${definitionKey} not found.`)
    const kind = definition.kind === 'character' ? 'character' : definition.kind === 'environment' ? 'environment' : definition.kind === 'item' ? 'item' : null
    if (!kind) throw new Error('Only character, environment, and item definitions can queue concept images.')
    const pendingGenerationMetadata = {
      ...(target.metadata ?? {}),
      generation: {
        jobId: `world-prompt-image:${input.op.id}`,
        state: 'pending',
        placeholder: true,
        source: 'global_prompt',
      },
    }
    const entityUpdate = await input.client
      .from('world_entities')
      .update({
        metadata: pendingGenerationMetadata,
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .single()
    if (entityUpdate.error) throw new Error(entityUpdate.error.message)
    const updatedEntity = worldEntitySchema.parse({
      id: entityUpdate.data.id,
      key: entityUpdate.data.key,
      name: entityUpdate.data.name,
      summary: entityUpdate.data.summary ?? '',
      context: entityUpdate.data.context ?? '',
      nodeType: entityUpdate.data.node_type,
      aliases: entityUpdate.data.aliases ?? [],
      tags: entityUpdate.data.tags ?? [],
      status: entityUpdate.data.status,
      thumbnailAssetKey: entityUpdate.data.thumbnail_asset_key,
      linkedDefinitionKey: entityUpdate.data.linked_definition_key,
      source: entityUpdate.data.source,
      customProperties: entityUpdate.data.custom_properties ?? {},
      metadata: entityUpdate.data.metadata ?? {},
      createdAt: entityUpdate.data.created_at,
      updatedAt: entityUpdate.data.updated_at,
    })
    input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
    const status = await invokeEdgeFunction<WorldBuildStatusResponse>({
      authHeader: input.authHeader,
      functionName: 'start-world-build',
      schema: worldBuildStatusResponseSchema,
      body: {
        plannerMode: 'direct_asset_generation',
        prompt: input.prompt,
        requestSummary: `Generate concept image for ${target.name}`,
        snapshot: input.snapshot,
        planItems: [{
          id: `direct_asset_${target.key}`,
          kind,
          name: definition.name,
          summary: definition.summary,
          dependsOn: [],
          enabled: true,
          generationOptions: {
            generateConceptImage: true,
            existingDefinitionKey: definitionKey,
          },
        }],
        cinematicPlan: null,
        model: input.model,
      },
    })
    return {
      applied: {
        worldEntities: [updatedEntity],
      },
      queue: {
        type: 'image_generation',
        batchId: status.batch.id,
        targetEntityKey: target.key,
        definitionKey,
        batch: status.batch as unknown as Record<string, unknown>,
        definitions: status.definitions as Array<Record<string, unknown>>,
        graphs: status.graphs as Array<Record<string, unknown>>,
        assets: status.assets as Array<Record<string, unknown>>,
        cinematicRuns: status.cinematicRuns as Array<Record<string, unknown>>,
      },
      note: null,
    }
  }

  if (input.op.op === 'queue_cinematic_generation') {
    const plan = await invokeEdgeFunction<WorldBuildPlanResponse>({
      authHeader: input.authHeader,
      functionName: 'plan-world-build',
      schema: worldBuildPlanResponseSchema,
      body: {
        prompt: input.op.payload.prompt || input.prompt,
        plannerModeHint: 'cinematic_build',
        snapshot: input.snapshot,
        model: input.model,
      },
    })
    const status = await invokeEdgeFunction<WorldBuildStatusResponse>({
      authHeader: input.authHeader,
      functionName: 'start-world-build',
      schema: worldBuildStatusResponseSchema,
      body: {
        plannerMode: plan.plannerMode,
        prompt: input.op.payload.prompt || input.prompt,
        requestSummary: plan.requestSummary,
        snapshot: input.snapshot,
        planItems: plan.planItems,
        cinematicPlan: plan.cinematicPlan ?? null,
        model: input.model,
      },
    })
    const firstGraphKey =
      Array.isArray(status.graphs) && status.graphs.length > 0 && typeof (status.graphs[0] as { key?: unknown }).key === 'string'
        ? String((status.graphs[0] as { key: string }).key)
        : null
    return {
      applied: {},
      queue: {
        type: 'cinematic_generation',
        batchId: status.batch.id,
        graphKey: firstGraphKey,
        batch: status.batch as unknown as Record<string, unknown>,
        definitions: status.definitions as Array<Record<string, unknown>>,
        graphs: status.graphs as Array<Record<string, unknown>>,
        assets: status.assets as Array<Record<string, unknown>>,
        cinematicRuns: status.cinematicRuns as Array<Record<string, unknown>>,
      },
      note: null,
    }
  }

  throw new Error(`Unsupported world prompt op ${input.op.op}.`)
}

async function updateTurn(client: SupabaseClient, turnId: string, changes: Record<string, unknown>) {
  const response = await client
    .from('world_prompt_turns')
    .update(changes)
    .eq('id', turnId)
    .select(TURN_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapTurnRow(response.data as WorldPromptTurnRow)
}

async function loadTurnById(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', turnId)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapTurnRow(response.data as WorldPromptTurnRow)
}

async function loadSessionById(client: SupabaseClient, sessionId: string) {
  const response = await client
    .from('world_prompt_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapSessionRow(response.data as WorldPromptSessionRow)
}

async function loadSuggestionById(client: SupabaseClient, suggestionId: string) {
  const response = await client
    .from('world_prompt_suggestions')
    .select(SUGGESTION_SELECT)
    .eq('id', suggestionId)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return response.data ? mapSuggestionRow(response.data as WorldPromptSuggestionRow) : null
}

async function loadActiveSessionSuggestions(client: SupabaseClient, sessionId: string) {
  const response = await client
    .from('world_prompt_suggestions')
    .select(SUGGESTION_SELECT)
    .eq('session_id', sessionId)
    .eq('state', 'active')
    .order('rank', { ascending: true })
    .order('created_at', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? [])
    .map((row) => mapSuggestionRow(row as WorldPromptSuggestionRow))
    .filter((suggestion): suggestion is WorldPromptSuggestionRecord => Boolean(suggestion))
}

async function loadWorldEntityByDraftAndKey(client: SupabaseClient, draftId: string, entityKey: string) {
  const response = await client
    .from('world_entities')
    .select(WORLD_ENTITY_SELECT)
    .eq('draft_id', draftId)
    .eq('key', entityKey)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return response.data ? mapWorldEntityRow(response.data as WorldEntityRow) : null
}

async function loadWorldEntitiesByDraftAndKeys(client: SupabaseClient, draftId: string, entityKeys: string[]) {
  if (entityKeys.length === 0) return []
  const response = await client
    .from('world_entities')
    .select(WORLD_ENTITY_SELECT)
    .eq('draft_id', draftId)
    .in('key', entityKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldEntityRow[]).map(mapWorldEntityRow)
}

async function loadWorldRelationshipsByDraftAndKeys(client: SupabaseClient, draftId: string, relationshipKeys: string[], worldEntities: WorldEntity[]) {
  if (relationshipKeys.length === 0) return []
  const response = await client
    .from('world_relationships')
    .select(WORLD_RELATIONSHIP_SELECT)
    .eq('draft_id', draftId)
    .in('key', relationshipKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldRelationshipRow[]).map((row) => mapWorldRelationshipRow(row, worldEntities))
}

async function loadWorldViewsByDraftAndKeys(client: SupabaseClient, draftId: string, viewKeys: string[]) {
  if (viewKeys.length === 0) return []
  const response = await client
    .from('world_views')
    .select(WORLD_VIEW_SELECT)
    .eq('draft_id', draftId)
    .in('key', viewKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldViewRow[]).map(mapWorldViewRow)
}

function serializeWorldViewRow(draftId: string, view: WorldView) {
  return {
    draft_id: draftId,
    key: view.key,
    name: view.name,
    mode: view.mode,
    filters: view.filters,
    search: view.search,
    root_entity_key: view.rootEntityKey,
    camera: view.camera,
    focus_depth: view.focusDepth,
    show_suggestions: view.showSuggestions,
    show_labels: view.showLabels,
    show_derived_layer: view.showDerivedLayer,
    node_positions: view.nodePositions,
    collapsed_state: view.collapsedState,
    sort_mode: view.sortMode,
    metadata: view.metadata,
  }
}

function dedupeWorldViewsByKey(views: WorldView[]) {
  const byKey = new Map<string, WorldView>()
  for (const view of views) {
    byKey.set(view.key, view)
  }
  return Array.from(byKey.values())
}

async function reconcileAutoManagedViewsForDraft(input: {
  client: SupabaseClient
  draftId: string
  snapshot: WorldPromptSnapshot
  options?: AutoManagedWorldViewOptions
}) {
  const reconciled = reconcileAutoManagedWorldViews({
    worldEntities: input.snapshot.worldEntities,
    worldRelationships: input.snapshot.worldRelationships,
    worldViews: input.snapshot.worldViews,
    worldThreads: input.snapshot.worldThreads,
  }, input.options)
  const desiredAutoViews = dedupeWorldViewsByKey(reconciled.worldViews.filter((view) => (view.metadata as Record<string, unknown> | undefined)?.autoManaged === true))
  const currentAutoViews = input.snapshot.worldViews.filter((view) => (view.metadata as Record<string, unknown> | undefined)?.autoManaged === true)
  const removedKeys = currentAutoViews
    .map((view) => view.key)
    .filter((key) => !desiredAutoViews.some((view) => view.key === key))

  if (desiredAutoViews.length > 0) {
    const upsertResponse = await input.client
      .from('world_views')
      .upsert(desiredAutoViews.map((view) => serializeWorldViewRow(input.draftId, view)), {
        onConflict: 'draft_id,key',
      })
    if (upsertResponse.error) throw new Error(upsertResponse.error.message)
  }

  if (removedKeys.length > 0) {
    const deleteResponse = await input.client
      .from('world_views')
      .delete()
      .eq('draft_id', input.draftId)
      .in('key', removedKeys)
    if (deleteResponse.error) throw new Error(deleteResponse.error.message)
  }

  input.snapshot.worldViews = reconciled.worldViews
  return reconciled
}

async function loadWorldOperatorsByDraftAndKeys(client: SupabaseClient, draftId: string, operatorKeys: string[]) {
  if (operatorKeys.length === 0) return []
  const response = await client
    .from('world_operators')
    .select(WORLD_OPERATOR_SELECT)
    .eq('draft_id', draftId)
    .in('key', operatorKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldOperatorRow[]).map(mapWorldOperatorRow)
}

async function loadWorldResultsByDraftAndKeys(client: SupabaseClient, draftId: string, resultKeys: string[]) {
  if (resultKeys.length === 0) return []
  const response = await client
    .from('world_results')
    .select(WORLD_RESULT_SELECT)
    .eq('draft_id', draftId)
    .in('key', resultKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldResultRow[]).map(mapWorldResultRow)
}

async function loadWorldGraphConnectionsByDraftAndKeys(client: SupabaseClient, draftId: string, connectionKeys: string[]) {
  if (connectionKeys.length === 0) return []
  const response = await client
    .from('world_graph_connections')
    .select(WORLD_GRAPH_CONNECTION_SELECT)
    .eq('draft_id', draftId)
    .in('key', connectionKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldGraphConnectionRow[]).map(mapWorldGraphConnectionRow)
}

async function loadWorldThreadsByDraftAndKeys(client: SupabaseClient, draftId: string, threadKeys: string[]) {
  if (threadKeys.length === 0) return []
  const response = await client
    .from('world_threads')
    .select(THREAD_SELECT)
    .eq('draft_id', draftId)
    .in('key', threadKeys)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldThreadRow[]).map(mapThreadRow)
}

async function refreshSnapshotWithLiveWorldState(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entityKeys?: string[]
  threadKeys?: string[]
}) {
  const entityKeys = Array.from(new Set((input.entityKeys ?? []).filter(Boolean)))
  const threadKeys = Array.from(new Set((input.threadKeys ?? []).filter(Boolean)))
  const refreshedEntities = await loadWorldEntitiesByDraftAndKeys(input.client, input.snapshot.draft.id, entityKeys)
  const refreshedThreads = await loadWorldThreadsByDraftAndKeys(input.client, input.snapshot.draft.id, threadKeys)
  const refreshedSnapshot = structuredClone(input.snapshot) as WorldPromptSnapshot
  if (refreshedEntities.length > 0) {
    const entityMap = new Map(refreshedSnapshot.worldEntities.map((entity) => [entity.key, entity]))
    for (const entity of refreshedEntities) {
      entityMap.set(entity.key, entity)
    }
    refreshedSnapshot.worldEntities = [...entityMap.values()]
  }
  if (refreshedThreads.length > 0) {
    const threadMap = new Map(refreshedSnapshot.worldThreads.map((thread) => [thread.key, thread]))
    for (const thread of refreshedThreads) {
      threadMap.set(thread.key, thread)
    }
    refreshedSnapshot.worldThreads = [...threadMap.values()]
  }
  return refreshedSnapshot
}

async function deleteProjectDefinitionByKey(client: SupabaseClient, draftId: string, definitionKey: string) {
  const response = await client
    .from('project_definitions')
    .delete()
    .eq('draft_id', draftId)
    .eq('key', definitionKey)
  if (response.error) throw new Error(response.error.message)
}

async function deleteWorldEntityByKey(client: SupabaseClient, draftId: string, entityKey: string) {
  const response = await client
    .from('world_entities')
    .delete()
    .eq('draft_id', draftId)
    .eq('key', entityKey)
  if (response.error) throw new Error(response.error.message)
}

function normalizePromptTextBlock(value: string | null | undefined) {
  return (value ?? '').replace(/\r\n/g, '\n').trim()
}

function mergeEntitySummary(existing: string, incoming?: string | null) {
  return mergeCanonicalText({
    existing,
    incoming,
    maxUnits: 4,
  }).text
}

function mergeEntityContext(existing: string, incoming?: string | null) {
  return mergeCanonicalContext({
    existing,
    incoming,
  }).text
}

function mergeRelationshipNotes(existing: string, incoming?: string | null) {
  return mergeCanonicalText({
    existing,
    incoming,
    maxUnits: 6,
  }).text
}

async function mergePromptEntityIntoExisting(input: {
  client: SupabaseClient
  draftId: string
  target: WorldEntity
  incoming: WorldEntityCreateInput
  linkedDefinitionKey: string | null
}) {
  const nextAliases = Array.from(new Set([...input.target.aliases, ...(input.incoming.aliases ?? [])]))
  const nextTags = Array.from(new Set([...input.target.tags, ...(input.incoming.tags ?? [])]))
  const summaryMerge = mergeCanonicalText({
    existing: input.target.summary,
    incoming: input.incoming.summary,
    maxUnits: 4,
  })
  const contextMerge = mergeCanonicalContext({
    existing: input.target.context,
    incoming: input.incoming.context,
  })
  let nextMetadata: Record<string, unknown> = {
    ...(input.target.metadata ?? {}),
    ...(input.incoming.metadata ?? {}),
  }
  nextMetadata = appendRefinementHistory({
    metadata: nextMetadata,
    field: 'summary',
    previousText: input.target.summary,
    incomingText: input.incoming.summary,
    resultText: summaryMerge.text,
    strategy: summaryMerge.strategy,
    changed: summaryMerge.changed,
  })
  nextMetadata = appendRefinementHistory({
    metadata: nextMetadata,
    field: 'context',
    previousText: input.target.context,
    incomingText: input.incoming.context,
    resultText: contextMerge.text,
    strategy: contextMerge.strategy,
    changed: contextMerge.changed,
  })
  const updateResponse = await input.client
    .from('world_entities')
    .update({
      aliases: nextAliases,
      tags: nextTags,
      summary: summaryMerge.text,
      context: contextMerge.text,
      thumbnail_asset_key: input.target.thumbnailAssetKey ?? input.incoming.thumbnailAssetKey,
      linked_definition_key: input.target.linkedDefinitionKey ?? input.linkedDefinitionKey,
      custom_properties: {
        ...(input.target.customProperties ?? {}),
        ...(input.incoming.customProperties ?? {}),
      },
      metadata: nextMetadata,
    })
    .eq('draft_id', input.draftId)
    .eq('key', input.target.key)
    .select(WORLD_ENTITY_SELECT)
    .single()
  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return mapWorldEntityRow(updateResponse.data as WorldEntityRow)
}

async function refreshTurnSuggestions(input: {
  client: SupabaseClient
  session: WorldPromptSession
  turn: WorldPromptTurn
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
}) {
  const preview = input.turn.metadata?.preview ? worldPromptPlanPreviewSchema.safeParse(input.turn.metadata.preview).data ?? null : null
  const assistantSuggestions = Array.isArray(input.turn.metadata?.suggestions)
    ? z.array(worldPromptSuggestionSchema).safeParse(input.turn.metadata?.suggestions).data ?? []
    : []
  const finalizedSuggestions = finalizeSuggestionSet({
    snapshot: input.snapshot,
    selectedThreadKey: input.selectedThreadKey,
    sourcePrompt: input.turn.prompt,
    suggestions: assistantSuggestions.length > 0 ? assistantSuggestions : (preview?.suggestions ?? []),
  })
  return persistSessionSuggestions({
    client: input.client,
    draftId: input.turn.draftId,
    sessionId: input.session.id,
    turnId: input.turn.id,
    selectedThreadKey: input.selectedThreadKey,
    sourcePrompt: input.turn.prompt,
    suggestions: finalizedSuggestions,
  })
}

async function isTurnCancelled(client: SupabaseClient, turnId: string) {
  const turn = await loadTurnById(client, turnId)
  return turn.status === 'cancelled'
}

function mergePreviewItemStatuses(input: {
  preview: WorldPromptPlanPreview
  appliedOpIds: string[]
}) {
  const appliedSet = new Set(input.appliedOpIds)
  return worldPromptPlanPreviewSchema.parse({
    ...input.preview,
    items: input.preview.items.map((item) => ({
      ...item,
      status: appliedSet.has(item.id) ? 'applied' : item.status,
    })),
    appliedAt: appliedSet.size > 0 ? new Date().toISOString() : input.preview.appliedAt,
  })
}

function stopExecutionError() {
  return new Error('__WORLD_PROMPT_TURN_CANCELLED__')
}

function isStopExecutionError(error: unknown) {
  return error instanceof Error && error.message === '__WORLD_PROMPT_TURN_CANCELLED__'
}

async function throwIfTurnCancelled(client: SupabaseClient, turnId: string) {
  if (await isTurnCancelled(client, turnId)) {
    throw stopExecutionError()
  }
}

function summarizeAppliedOps(ops: PromptToWorldOp[]) {
  const summary = ops
    .filter((op) => op.op !== 'assistant_note')
    .map((op) => {
      switch (op.op) {
        case 'upsert_entity':
          return op.payload.entity.name
        case 'replace_entity':
          return op.payload.replacementMode === 'create'
            ? `replace ${op.payload.targetEntityKey} with ${op.payload.replacementEntity?.name ?? 'new entity'}`
            : `replace ${op.payload.targetEntityKey} with ${op.payload.replacementEntityKey ?? 'existing entity'}`
        case 'upsert_relationship':
          return op.payload.relationship.verb
        case 'create_derived_result':
          return op.payload.title ?? op.payload.operatorType
        case 'queue_image_generation':
          return 'image generation'
        case 'queue_cinematic_generation':
          return 'cinematic generation'
        default:
          return op.op
      }
    })
  return summary.length > 0 ? summary.join(', ') : 'No world graph changes were required.'
}

function summarizeSkippedPromptOps(ops: PromptToWorldOp[]) {
  if (ops.length === 0) return null
  const reasons = Array.from(new Set(ops
    .map((op) => (typeof op.metadata?.approvalReason === 'string' ? op.metadata.approvalReason.trim() : ''))
    .filter(Boolean)))
  const reasonText = reasons.length > 0
    ? `Skipped ${ops.length} risky or unresolved change${ops.length === 1 ? '' : 's'}: ${reasons.join('; ')}.`
    : `Skipped ${ops.length} risky or unresolved change${ops.length === 1 ? '' : 's'} instead of sending them to manual approval.`
  return reasonText
}

export async function startWorldPromptTurn(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptStartTurnRequestSchema.parse(input.payload)
  const session = await ensurePromptSession({ client: input.client, payload })
  const existingMessages = await loadSessionMessages(input.client, session.id)
  const compacted = compactMessageHistory(session.summaryMemory, existingMessages)
  let workingSession = session
  if (compacted.compacted) {
    const sessionUpdate = await input.client
      .from('world_prompt_sessions')
      .update({ summary_memory: compacted.summaryMemory })
      .eq('id', session.id)
      .select(SESSION_SELECT)
      .single()
    if (sessionUpdate.error) throw new Error(sessionUpdate.error.message)
    workingSession = mapSessionRow(sessionUpdate.data as WorldPromptSessionRow)
  }
  const selectedSuggestion = payload.selectedSuggestionId
    ? await loadSuggestionById(input.client, payload.selectedSuggestionId)
    : null
  const sessionMemoryState = readSessionMemoryState({
    lastContext: workingSession.lastContext,
    summaryMemory: compacted.summaryMemory,
    selectedRootEntityKey: payload.selectedRootEntityKey ?? workingSession.selectedRootEntityKey,
    selectedViewKey: payload.selectedViewKey ?? workingSession.selectedViewKey,
    selectedThreadKey: payload.selectedThreadKey ?? (typeof workingSession.lastContext?.selectedThreadKey === 'string' ? workingSession.lastContext.selectedThreadKey : null),
  })
  const initialRetrievalIntent = buildWorldPromptRetrievalIntent({
    prompt: payload.prompt,
    snapshot: payload.snapshot,
    summaryMemory: compacted.summaryMemory,
    sessionMemoryState,
    selectedSuggestion,
    selectedSuggestionId: payload.selectedSuggestionId,
    selectedRootEntityKey: payload.selectedRootEntityKey,
    selectedThreadKey: payload.selectedThreadKey,
    selectedViewKey: payload.selectedViewKey,
  })

  const insertedTurn = await input.client
    .from('world_prompt_turns')
    .insert({
      draft_id: payload.snapshot.draft.id,
      session_id: workingSession.id,
      prompt: payload.prompt,
      status: 'streaming',
      model: payload.model,
      resolved_context: {
        summaryMemory: compacted.summaryMemory,
        selectedRootEntityKey: payload.selectedRootEntityKey,
        selectedViewKey: payload.selectedViewKey,
        selectedThreadKey: payload.selectedThreadKey,
        resolvedMode: initialRetrievalIntent.resolvedMode,
        resolvedIntent: initialRetrievalIntent.resolvedIntent,
        resolvedFocus: initialRetrievalIntent.resolvedFocus,
        sessionMemoryState,
      },
      approval_state: 'not_required',
      assistant_summary: '',
      metadata: {
        selectedThreadKey: payload.selectedThreadKey,
        selectedSuggestionId: payload.selectedSuggestionId,
        resolvedMode: initialRetrievalIntent.resolvedMode,
        resolvedIntent: initialRetrievalIntent.resolvedIntent,
        resolvedFocus: initialRetrievalIntent.resolvedFocus,
      },
    })
    .select(TURN_SELECT)
    .single()
  if (insertedTurn.error) throw new Error(insertedTurn.error.message)
  let turn = mapTurnRow(insertedTurn.data as WorldPromptTurnRow)

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: workingSession.id,
    turnId: turn.id,
    draftId: payload.snapshot.draft.id,
  })

  try {
    await writeEvent('turn_started', {
      session: workingSession,
      turn,
    })

    const rawActiveSessionSuggestions = payload.selectedSuggestionId
      ? []
      : await loadActiveSessionSuggestions(input.client, workingSession.id)
    const activeSessionSuggestions = rawActiveSessionSuggestions.filter((suggestion) => (
      suggestionIsActionable(suggestion, payload.prompt)
    ))
    const selectedSuggestionUiKind = selectedSuggestion
      ? (
        selectedSuggestion.metadata?.uiKind === 'clarification'
          ? 'clarification'
          : selectedSuggestion.metadata?.uiKind === 'diagnostic'
            ? 'diagnostic'
            : selectedSuggestion.metadata?.uiKind === 'advisory'
              ? 'advisory'
              : 'next_move'
      )
      : null
    const continuationMode = payload.selectedSuggestionId
      ? selectedSuggestionUiKind === 'clarification'
        ? 'answered_clarification'
        : 'used_suggestion'
      : activeSessionSuggestions.length > 0
        ? activeSessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'clarification' || suggestion.kind === 'repair_prompt')
          ? 'freeform_after_clarification'
          : 'freeform_after_suggestions'
        : 'freeform_initial'

    const userMessage = await insertPromptMessage({
      client: input.client,
      sessionId: workingSession.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'user',
      content: payload.prompt,
      metadata: {
        selectedSuggestionId: payload.selectedSuggestionId,
        selectedSuggestionLabel: selectedSuggestion?.label ?? null,
        selectedSuggestionUiKind,
        continuationMode,
      },
    })
    await writeEvent('message_created', {
      message: userMessage,
      turn: { id: turn.id },
    })

    await writeEvent('planner_status', {
      plannerStatus: 'planning',
      turn: { id: turn.id },
    })

    const generatedResult = await generatePromptPlan({
      client: input.client,
      payload,
      session: workingSession,
      summaryMemory: compacted.summaryMemory,
      sessionMemoryState,
      recentMessages: compacted.recentMessages,
      selectedSuggestion,
      onPlannerProgress: async (plannerProgress, extras) => {
        await throwIfTurnCancelled(input.client, turn.id)
        await writeEvent('planner_status', {
          plannerStatus: 'planning',
          turn: { id: turn.id },
          plannerProgress,
          plannerOutline: extras?.plannerOutline ?? [],
          note: plannerProgress.message,
        })
      },
    })
    const generated = generatedResult.plan
    const plannerFailure = generatedResult.plannerFailure
    const retrievalPacket = generatedResult.retrievalPacket
    await throwIfTurnCancelled(input.client, turn.id)

    const refreshedPlanningSnapshot = await refreshSnapshotWithLiveWorldState({
      client: input.client,
      snapshot: payload.snapshot,
      entityKeys: [
        ...(payload.selectedRootEntityKey ? [payload.selectedRootEntityKey] : []),
        ...retrievalPacket.sessionMemory.worldMemory.retrievedEntityKeys,
      ],
      threadKeys: [
        ...(payload.selectedThreadKey ? [payload.selectedThreadKey] : []),
        ...retrievalPacket.sessionMemory.worldMemory.retrievedThreadKeys,
      ],
    })
    const planningSnapshot = structuredClone(refreshedPlanningSnapshot) as WorldPromptSnapshot
    const sanitizedById = new Map<string, PromptToWorldOp>()
    const plannerOps = generated.wave1Ops.length > 0 ? generated.wave1Ops : generated.operations
    for (const operation of plannerOps.filter((op) => op.op === 'upsert_entity')) {
      const sanitized = sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: payload.prompt })
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    for (const operation of plannerOps.filter((op) => op.op !== 'upsert_entity')) {
      const sanitized = sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: payload.prompt })
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    const sanitizedOps = plannerOps.map((operation) => sanitizedById.get(operation.id) ?? operation)

    const threadUpsertResult = await upsertWorldThreads({
      client: input.client,
      draftId: payload.snapshot.draft.id,
      turnId: turn.id,
      snapshot: planningSnapshot,
      threadActions: generated.threadActions,
      threadCandidates: generated.threadCandidates,
    })
    const persistedThreads = threadUpsertResult.threads
    const threadDiagnostics = [
      ...threadUpsertResult.diagnostics,
      ...threadUpsertResult.rejected.map((entry) => `thread_rejected:${entry.key || 'unknown'}:${entry.reason}`),
    ]
    planningSnapshot.worldThreads = [
      ...planningSnapshot.worldThreads.filter((thread) => !persistedThreads.some((persisted) => persisted.key === thread.key)),
      ...persistedThreads,
    ]

    const plannerSuggestions = dedupeSuggestions([
      ...suggestionsFromPlannerIdeas({
        ideas: generated.suggestionCandidates,
        fallbackKind: 'continue_scope',
      }),
      ...suggestionsFromPlannerIdeas({
        ideas: generated.optionCandidates,
        fallbackKind: generated.classification === 'graph_diagnosis' ? 'diagnostic_gap' : 'advisory_option',
      }),
      ...suggestionsFromPlannerIdeas({
        ideas: generated.wave2Ideas,
        fallbackKind: 'continue_scope',
      }),
      ...suggestionsFromPlannerIdeas({
        ideas: generated.optionalIdeas,
        fallbackKind: 'continue_scope',
      }),
      ...(generated.classification === 'graph_diagnosis' ? buildDiagnosticSuggestionSet(generated.diagnosticFindings) : []),
    ])

    const execution = classifyPromptExecution({
      prompt: payload.prompt,
      snapshot: payload.snapshot,
      ops: sanitizedOps,
      classificationHint: generated.classification ?? null,
      suggestionCandidates: plannerSuggestions,
      selectedThreadKey: payload.selectedThreadKey,
      selectedRootEntityKey: payload.selectedRootEntityKey,
      assistantSummary: generated.assistantSummary,
      answer: generated.answer,
      answerMode: generated.answerMode,
      diagnosticFindings: generated.diagnosticFindings,
      isSuggestionDriven: Boolean(payload.selectedSuggestionId),
    })
    const finalizedSuggestions = finalizeSuggestionSet({
      snapshot: planningSnapshot,
      selectedThreadKey: payload.selectedThreadKey,
      sourcePrompt: payload.prompt,
      suggestions: execution.suggestions,
      maxCount: payload.selectedSuggestionId ? 2 : 4,
    })
    const persistedSuggestions = await persistSessionSuggestions({
      client: input.client,
      draftId: payload.snapshot.draft.id,
      sessionId: workingSession.id,
      turnId: turn.id,
      selectedThreadKey: payload.selectedThreadKey,
      sourcePrompt: payload.prompt,
      suggestions: finalizedSuggestions,
    })
    if (payload.selectedSuggestionId) {
      await markSuggestionUsed(input.client, payload.selectedSuggestionId, turn.id)
    }

    await writeEvent('planner_status', {
      plannerStatus: 'scoping',
      plannerFailure: plannerFailure ?? undefined,
      classification: execution.classification,
      scope: execution.scope,
      preview: execution.preview ?? undefined,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      diagnostics: threadDiagnostics,
      turn: { id: turn.id },
    })

    const mutableSnapshot = structuredClone(refreshedPlanningSnapshot) as WorldPromptSnapshot
    const appliedDefinitions: Record<string, unknown>[] = []
    const touchedEntityKeys = new Set<string>()
    const touchedRelationshipKeys = new Set<string>()
    let preferredAutoViewKey: string | null = null
    const opsToRun = execution.selectedOps
    const { autoOps: autoRunnableOps, approvalOps: skippedRiskyOps } = splitPromptOpsByApproval(opsToRun)
    const executionPreview = null

    if (execution.mode === 'blocked') {
      await writeEvent('planner_status', {
        plannerStatus: 'blocked',
        plannerFailure: plannerFailure ?? undefined,
        classification: execution.classification,
        scope: execution.scope,
        preview: executionPreview ?? undefined,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
        diagnostics: threadDiagnostics,
        note: stripInternalPlannerDiagnostics(execution.note),
        turn: { id: turn.id },
      })
    } else if (execution.mode === 'preview') {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: stripInternalPlannerDiagnostics(execution.note),
        preview: executionPreview ?? undefined,
        scope: execution.scope,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
        diagnostics: threadDiagnostics,
        turn: { id: turn.id },
      })
    } else if (execution.mode === 'advisory') {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: stripInternalPlannerDiagnostics(execution.answer || execution.note),
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        scope: execution.scope,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
        diagnostics: threadDiagnostics,
        turn: { id: turn.id },
      })
    } else {
      const executableOpCount = autoRunnableOps.filter((op) => op.op !== 'assistant_note').length
      await writeEvent('planner_status', {
        plannerStatus: 'applying',
        plannerFailure: plannerFailure ?? undefined,
        classification: execution.classification,
        scope: execution.scope,
        preview: executionPreview ?? undefined,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
        diagnostics: threadDiagnostics,
        plannerProgress: executableOpCount > 0 ? {
          phase: 'applying_changes',
          message: `Applying 0/${executableOpCount}.`,
          sequence: 0,
        } : undefined,
        turn: { id: turn.id },
      })

      let appliedStepIndex = 0
      for (const op of autoRunnableOps) {
        await throwIfTurnCancelled(input.client, turn.id)
        if (op.op === 'assistant_note') {
          await writeEvent('assistant_note', {
            op,
            note: stripInternalPlannerDiagnostics(op.payload.message),
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
          continue
        }

        appliedStepIndex += 1
        await writeEvent('planner_status', {
          plannerStatus: 'applying',
          classification: execution.classification,
          scope: execution.scope,
          plannerProgress: {
            phase: 'applying_changes',
            message: buildApplyProgressMessage({
              index: appliedStepIndex,
              total: executableOpCount,
              op,
            }),
            sequence: appliedStepIndex,
          },
          turn: { id: turn.id },
        }, { opId: op.id })

        const result = await applyPromptOp({
          client: input.client,
          authHeader: input.authHeader,
          model: payload.model,
          snapshot: mutableSnapshot,
          prompt: payload.prompt,
          op,
        })
        if (Array.isArray(result.definitions) && result.definitions.length > 0) {
          for (const definition of result.definitions) {
            if (!appliedDefinitions.some((entry) => entry.key === definition.key)) {
              appliedDefinitions.push(definition)
            }
          }
        }
        for (const entity of result.applied.worldEntities ?? []) {
          touchedEntityKeys.add(entity.key)
        }
        for (const relationship of result.applied.worldRelationships ?? []) {
          touchedRelationshipKeys.add(relationship.key)
          touchedEntityKeys.add(relationship.sourceEntityKey)
          touchedEntityKeys.add(relationship.targetEntityKey)
        }

        if (result.note) {
          await writeEvent('assistant_note', {
            op,
            note: stripInternalPlannerDiagnostics(result.note),
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        } else {
          await writeEvent('op_applied', {
            op: { ...op, status: 'applied' },
            applied: result.applied,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        }

        if (result.queue) {
          await writeEvent('queue_started', {
            op: { ...op, status: 'applied' },
            queue: result.queue,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        }
      }

      for (const thread of persistedThreads) {
        if (thread.lastTurnId === turn.id || thread.sourceTurnId === turn.id) {
          for (const entityKey of thread.linkedEntityKeys) {
            touchedEntityKeys.add(entityKey)
          }
        }
      }
      if (touchedEntityKeys.size > 0 || touchedRelationshipKeys.size > 0 || persistedThreads.length > 0) {
        const reconciledViews = await reconcileAutoManagedViewsForDraft({
          client: input.client,
          draftId: payload.snapshot.draft.id,
          snapshot: mutableSnapshot,
          options: {
            recentEntityKeys: [...touchedEntityKeys],
            recentRelationshipKeys: [...touchedRelationshipKeys],
            preferredRootEntityKey: [...touchedEntityKeys][0] ?? payload.selectedRootEntityKey ?? null,
            preferredThreadKey: payload.selectedThreadKey,
          },
        })
        preferredAutoViewKey = reconciledViews.preferredViewKey
        await writeEvent('op_applied', {
          applied: {
            worldViews: mutableSnapshot.worldViews,
          },
          classification: execution.classification,
          scope: execution.scope,
        })
      }
    }

    if (execution.note || finalizedSuggestions.length > 0) {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: stripInternalPlannerDiagnostics(execution.note),
        preview: executionPreview ?? undefined,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        scope: execution.scope,
        threads: persistedThreads,
      })
    }

    const skippedOpsNote = summarizeSkippedPromptOps(skippedRiskyOps)
    if (skippedOpsNote) {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: skippedOpsNote,
        answerMode: execution.answerMode,
        scope: execution.scope,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
      })
    }

    const generatedSummary = stripInternalPlannerDiagnostics(generated.assistantSummary.trim())
    const assistantSummary = [
      stripInternalPlannerDiagnostics(execution.answer || execution.note || ''),
      execution.mode === 'blocked' || execution.mode === 'advisory'
        ? generatedSummary || null
        : generatedSummary || summarizeAppliedOps(autoRunnableOps),
      skippedOpsNote,
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index).join('\n\n')

    const assistantMessage = await insertPromptMessage({
      client: input.client,
      sessionId: workingSession.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'assistant',
      content: assistantSummary,
      metadata: {
        plannerFailure: plannerFailure ?? undefined,
        opCount: opsToRun.length,
        classification: execution.classification,
        preview: executionPreview,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        scopeDecision: execution.scope,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
        threadDiagnostics,
      },
    })
    await writeEvent('message_created', {
      message: assistantMessage,
      turn: { id: turn.id },
    })

    const resolvedSelectedViewKey = retrievalPacket.continuityMode === 'topic_shift'
      ? (preferredAutoViewKey ?? payload.selectedViewKey ?? workingSession.selectedViewKey)
      : (payload.selectedViewKey ?? preferredAutoViewKey ?? workingSession.selectedViewKey)
    turn = await updateTurn(input.client, turn.id, {
      status: 'completed',
      approval_state: 'not_required',
      assistant_summary: assistantSummary,
      metadata: {
        ...(turn.metadata ?? {}),
        plannerFailure: plannerFailure ?? undefined,
        opCount: opsToRun.length,
        pendingApprovalCount: 0,
        skippedRiskyOpCount: skippedRiskyOps.length,
        classification: execution.classification,
        preview: executionPreview,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        scopeDecision: execution.scope,
        resolvedMode: execution.mode === 'blocked'
          ? 'blocked'
          : execution.mode === 'advisory'
            ? 'answer_only'
            : 'apply_compact_wave',
        resolvedIntent: turn.resolvedContext?.resolvedIntent ?? undefined,
        resolvedFocus: turn.resolvedContext?.resolvedFocus ?? undefined,
        retrievalDiagnostics: retrievalPacket.diagnostics,
        plannerMode: retrievalPacket.plannerMode,
        selectedThreadKey: payload.selectedThreadKey,
        selectedSuggestionId: payload.selectedSuggestionId,
        continuationMode,
        focusLayer: retrievalPacket.focusLayer,
        continuityMode: retrievalPacket.continuityMode,
        retrievedEntityKeys: retrievalPacket.sessionMemory.worldMemory.retrievedEntityKeys,
        retrievedThreadKeys: retrievalPacket.sessionMemory.worldMemory.retrievedThreadKeys,
        selectedViewKey: resolvedSelectedViewKey,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threadDiagnostics,
      },
    })
    const nextSessionMemoryState = buildSessionMemoryState({
      session: workingSession,
      turn,
      assistantSummary,
      selectedThreadKey: payload.selectedThreadKey,
    })
    workingSession = await updateSessionLifecycle({
      client: input.client,
      session: workingSession,
      prompt: payload.prompt,
      assistantSummary,
      selectedRootEntityKey: payload.selectedRootEntityKey,
      selectedViewKey: resolvedSelectedViewKey,
      selectedThreadKey: payload.selectedThreadKey,
      summaryMemory: buildRollingSessionMemory({
        session: workingSession,
        turn,
        assistantSummary,
        snapshot: mutableSnapshot,
        selectedThreadKey: payload.selectedThreadKey,
      }),
      sessionMemoryState: nextSessionMemoryState,
      retrievalDiagnostics: {
        focusLayer: retrievalPacket.focusLayer,
        continuityMode: retrievalPacket.continuityMode,
        retrievedEntityKeys: retrievalPacket.sessionMemory.worldMemory.retrievedEntityKeys,
        retrievedThreadKeys: retrievalPacket.sessionMemory.worldMemory.retrievedThreadKeys,
        selectedViewKey: resolvedSelectedViewKey,
      },
    })

    await writeEvent('planner_status', {
      plannerStatus: 'completed',
      plannerFailure: plannerFailure ?? undefined,
      classification: execution.classification,
      preview: executionPreview ?? undefined,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      scope: execution.scope,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      diagnostics: threadDiagnostics,
      turn,
      session: workingSession,
    })

    await writeEvent('turn_completed', {
      plannerFailure: plannerFailure ?? undefined,
      turn,
      classification: execution.classification,
      preview: executionPreview ?? undefined,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      diagnostics: threadDiagnostics,
      note: assistantSummary,
      session: workingSession,
    })
    return worldPromptStartTurnResponseSchema.parse({
      ok: true,
      session: workingSession,
      turn,
      definitions: appliedDefinitions,
    })
  } catch (error) {
    if (isStopExecutionError(error)) {
      const cancelledMessage = 'Turn cancelled. Future ops and new queued work from this turn were stopped.'
      turn = await updateTurn(input.client, turn.id, {
        status: 'cancelled',
        approval_state: 'not_required',
        assistant_summary: cancelledMessage,
        error_message: null,
      })
      const assistantMessage = await insertPromptMessage({
        client: input.client,
        sessionId: workingSession.id,
        turnId: turn.id,
        draftId: payload.snapshot.draft.id,
        role: 'assistant',
        content: cancelledMessage,
        metadata: {
          cancelled: true,
        },
      })
      await writeEvent('message_created', {
        message: assistantMessage,
        turn,
      })
      await writeEvent('turn_completed', {
        turn,
        note: cancelledMessage,
        session: workingSession,
      })
      const cancelledSessionMemoryState = buildSessionMemoryState({
        session: workingSession,
        turn,
        assistantSummary: cancelledMessage,
        selectedThreadKey: payload.selectedThreadKey,
      })
      workingSession = await updateSessionLifecycle({
        client: input.client,
        session: workingSession,
        prompt: payload.prompt,
        assistantSummary: cancelledMessage,
        selectedRootEntityKey: payload.selectedRootEntityKey,
        selectedViewKey: payload.selectedViewKey,
        selectedThreadKey: payload.selectedThreadKey,
        summaryMemory: buildRollingSessionMemory({
          session: workingSession,
          turn,
          assistantSummary: cancelledMessage,
          snapshot: payload.snapshot,
          selectedThreadKey: payload.selectedThreadKey,
        }),
        sessionMemoryState: cancelledSessionMemoryState,
        retrievalDiagnostics: null,
      })
      return worldPromptStartTurnResponseSchema.parse({
        ok: true,
        session: workingSession,
        turn,
        definitions: [],
      })
    }
    const plannerFailure = (
      error instanceof Error
        ? (error as Error & { plannerFailure?: WorldPromptPlannerFailure }).plannerFailure ?? null
        : null
    )
    turn = await updateTurn(input.client, turn.id, {
      status: 'failed',
      approval_state: 'not_required',
      error_message: error instanceof Error ? error.message : 'World prompt turn failed.',
      metadata: {
        ...(turn.metadata ?? {}),
        plannerFailure: plannerFailure ?? undefined,
      },
    })
    await writeEvent('turn_failed', {
      turn,
      diagnostics: [error instanceof Error ? error.message : 'World prompt turn failed.'],
      plannerFailure: plannerFailure ?? undefined,
      session: workingSession,
    })
    throw error
  }
}

async function loadPendingOp(client: SupabaseClient, turnId: string, opId: string) {
  const response = await client
    .from('world_prompt_events')
    .select(EVENT_SELECT)
    .eq('turn_id', turnId)
    .eq('op_id', opId)
    .order('sequence', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as WorldPromptEventRow[]
  const needsApproval = rows.find((row) => row.event_type === 'op_needs_approval') ?? null
  const alreadyResolved = rows.some((row) => row.event_type === 'op_approved' || row.event_type === 'op_rejected')
  if (!needsApproval || alreadyResolved) {
    return null
  }
  return {
    event: mapEventRow(needsApproval),
    op: promptToWorldOpSchema.parse((needsApproval.payload ?? {}).op),
  }
}

async function finalizeTurnApprovalState(client: SupabaseClient, turnId: string) {
  const currentTurn = await loadTurnById(client, turnId)
  const response = await client
    .from('world_prompt_events')
    .select('event_type, op_id')
    .eq('turn_id', turnId)
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as Array<{ event_type: string; op_id: string | null }>
  const pendingOpIds = new Set(rows
    .filter((row) => row.event_type === 'op_needs_approval' && typeof row.op_id === 'string')
    .map((row) => row.op_id as string))
  for (const row of rows) {
    if (!row.op_id) continue
    if (row.event_type === 'op_approved' || row.event_type === 'op_rejected') {
      pendingOpIds.delete(row.op_id)
    }
  }
  const hasPending = pendingOpIds.size > 0
  return updateTurn(client, turnId, {
    status: hasPending ? 'awaiting_approval' : 'completed',
    approval_state: hasPending ? 'pending' : 'resolved',
    metadata: {
      ...(currentTurn.metadata ?? {}),
      pendingApprovalCount: pendingOpIds.size,
    },
  })
}

export async function approveWorldPromptOp(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptResolveOpRequestSchema.parse(input.payload)
  const pending = await loadPendingOp(input.client, payload.turnId, payload.opId)
  if (!pending) {
    throw new Error('The selected world prompt op is no longer pending approval.')
  }
  const turnResponse = await input.client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', payload.turnId)
    .single()
  if (turnResponse.error) throw new Error(turnResponse.error.message)
  const turn = mapTurnRow(turnResponse.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })
  const refreshedSnapshot = await refreshSnapshotWithLiveWorldState({
    client: input.client,
    snapshot: payload.snapshot,
    entityKeys: resolveStagingEntityKeys(pending.op),
    threadKeys: typeof turn.metadata?.selectedThreadKey === 'string' ? [turn.metadata.selectedThreadKey] : [],
  })
  const mutableSnapshot = structuredClone(refreshedSnapshot) as WorldPromptSnapshot
  const result = await applyPromptOp({
    client: input.client,
    authHeader: input.authHeader,
    model: turn.model,
    snapshot: mutableSnapshot,
    prompt: turn.prompt,
    op: { ...pending.op, status: 'approved' },
  })
  await writeEvent('op_approved', {
    op: { ...pending.op, status: 'approved' },
    applied: result.applied,
  }, { opId: pending.op.id })
  if (result.queue) {
    await writeEvent('queue_started', {
      op: { ...pending.op, status: 'approved' },
      queue: result.queue,
    }, { opId: pending.op.id })
  }
  const updatedTurn = await finalizeTurnApprovalState(input.client, turn.id)
  const session = await loadSessionById(input.client, updatedTurn.sessionId)
  const persistedSuggestions = await refreshTurnSuggestions({
    client: input.client,
    session,
    turn: updatedTurn,
    snapshot: payload.snapshot,
    selectedThreadKey: typeof updatedTurn.metadata?.selectedThreadKey === 'string' ? updatedTurn.metadata.selectedThreadKey : null,
  })
  await createEventWriter({
    client: input.client,
    sessionId: updatedTurn.sessionId,
    turnId: updatedTurn.id,
    draftId: updatedTurn.draftId,
  }).then((write) => write('planner_status', {
    plannerStatus: updatedTurn.status === 'awaiting_approval' ? 'awaiting_approval' : 'completed',
    suggestions: persistedSuggestions.map((suggestion) => ({
      id: suggestion.id,
      label: suggestion.label,
      prompt: suggestion.prompt,
      kind: suggestion.kind,
      style: suggestion.style,
      source: suggestion.source,
      threadKey: suggestion.threadKey,
      summary: suggestion.summary,
      estimatedNodeCount: suggestion.estimatedNodeCount,
      estimatedEdgeCount: suggestion.estimatedEdgeCount,
      willQueueImages: suggestion.willQueueImages,
      willQueueCinematics: suggestion.willQueueCinematics,
    })),
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn: updatedTurn,
    session,
  }))
  return worldPromptResolveOpResponseSchema.parse({
    ok: true,
    turn: updatedTurn,
  })
}

export async function rejectWorldPromptOp(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptResolveOpRequestSchema.parse(input.payload)
  const pending = await loadPendingOp(input.client, payload.turnId, payload.opId)
  if (!pending) {
    throw new Error('The selected world prompt op is no longer pending approval.')
  }
  const turnResponse = await input.client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', payload.turnId)
    .single()
  if (turnResponse.error) throw new Error(turnResponse.error.message)
  const turn = mapTurnRow(turnResponse.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })
  await writeEvent('op_rejected', {
    op: { ...pending.op, status: 'rejected' },
    diagnostics: ['This op was rejected by the user.'],
  }, { opId: pending.op.id })
  const updatedTurn = await finalizeTurnApprovalState(input.client, turn.id)
  const session = await loadSessionById(input.client, updatedTurn.sessionId)
  await refreshTurnSuggestions({
    client: input.client,
    session,
    turn: updatedTurn,
    snapshot: payload.snapshot,
    selectedThreadKey: typeof updatedTurn.metadata?.selectedThreadKey === 'string' ? updatedTurn.metadata.selectedThreadKey : null,
  })
  return worldPromptResolveOpResponseSchema.parse({
    ok: true,
    turn: updatedTurn,
  })
}

export async function applyWorldPromptPreview(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptApplyPreviewRequestSchema.parse(input.payload)
  let turn = await loadTurnById(input.client, payload.turnId)
  const preview = turn.metadata?.preview ? worldPromptPlanPreviewSchema.parse(turn.metadata.preview) : null
  if (!preview || preview.pendingOps.length === 0 || !preview.canApplyFirstWave) {
    throw new Error('This turn does not have an applyable preview.')
  }
  if (preview.appliedAt) {
    throw new Error('This preview has already been applied.')
  }

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })

  await writeEvent('planner_status', {
    plannerStatus: 'applying',
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview,
    scope: preview.scopeDecision,
    suggestions: preview.suggestions,
    turn: { id: turn.id },
  })

  const refreshedSnapshot = await refreshSnapshotWithLiveWorldState({
    client: input.client,
    snapshot: payload.snapshot,
    entityKeys: Array.from(new Set(preview.pendingOps.flatMap((op) => resolveStagingEntityKeys(op)))),
    threadKeys: typeof turn.metadata?.selectedThreadKey === 'string' ? [turn.metadata.selectedThreadKey] : [],
  })
  const mutableSnapshot = structuredClone(refreshedSnapshot) as WorldPromptSnapshot
  const appliedOpIds: string[] = []
  const pendingApprovalOpIds: string[] = []

  for (const rawOp of preview.pendingOps) {
    await throwIfTurnCancelled(input.client, turn.id)
    const op = sanitizePromptOp({ op: rawOp, snapshot: mutableSnapshot, prompt: turn.prompt })

    if (op.op === 'assistant_note') {
      await writeEvent('assistant_note', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op,
        note: op.payload.message,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
      continue
    }

    if (promptOpNeedsApproval(op)) {
      pendingApprovalOpIds.push(op.id)
      await writeEvent('op_needs_approval', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op: { ...op, status: 'pending' },
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
      continue
    }

    const result = await applyPromptOp({
      client: input.client,
      authHeader: input.authHeader,
      model: turn.model,
      snapshot: mutableSnapshot,
      prompt: turn.prompt,
      op,
    })
    appliedOpIds.push(op.id)

    if (result.note) {
      await writeEvent('assistant_note', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op,
        note: result.note,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    } else {
      await writeEvent('op_applied', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op: { ...op, status: 'applied' },
        applied: result.applied,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    }

    if (result.queue) {
      await writeEvent('queue_started', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op: { ...op, status: 'applied' },
        queue: result.queue,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    }
  }

  const nextPreview = mergePreviewItemStatuses({
    preview,
    appliedOpIds,
  })
  const assistantSummary = [
    turn.assistantSummary.trim(),
    appliedOpIds.length > 0 ? `Applied preview first wave: ${summarizeAppliedOps(preview.pendingOps.filter((op) => appliedOpIds.includes(op.id)))}` : null,
  ].filter(Boolean).join('\n\n')

  turn = await updateTurn(input.client, turn.id, {
    status: pendingApprovalOpIds.length > 0 ? 'awaiting_approval' : 'completed',
    approval_state: pendingApprovalOpIds.length > 0 ? 'pending' : 'not_required',
    assistant_summary: assistantSummary,
    metadata: {
      ...(turn.metadata ?? {}),
      preview: nextPreview,
      suggestions: nextPreview.suggestions,
      pendingApprovalCount: pendingApprovalOpIds.length,
    },
  })
  const session = await loadSessionById(input.client, turn.sessionId)
  const persistedSuggestions = await persistSessionSuggestions({
    client: input.client,
    draftId: turn.draftId,
    sessionId: turn.sessionId,
    turnId: turn.id,
    selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
    suggestions: finalizeSuggestionSet({
      snapshot: payload.snapshot,
      selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
      suggestions: nextPreview.suggestions,
    }),
  })
  const previewSessionMemoryState = buildSessionMemoryState({
    session,
    turn,
    assistantSummary,
    selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
  })
  await updateSessionLifecycle({
    client: input.client,
    session,
    prompt: turn.prompt,
    assistantSummary,
    selectedRootEntityKey: typeof turn.resolvedContext?.selectedRootEntityKey === 'string' ? turn.resolvedContext.selectedRootEntityKey : null,
    selectedViewKey: typeof turn.resolvedContext?.selectedViewKey === 'string' ? turn.resolvedContext.selectedViewKey : null,
    selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
    summaryMemory: buildRollingSessionMemory({
      session,
      turn,
      assistantSummary,
      snapshot: payload.snapshot,
      selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
    }),
    sessionMemoryState: previewSessionMemoryState,
  })

  await writeEvent('assistant_note', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: pendingApprovalOpIds.length > 0
      ? 'Applied the safe preview ops and queued the risky ones for approval.'
      : appliedOpIds.length > 0
        ? 'Applied the previewed first wave.'
        : 'The preview did not contain any directly applicable ops.',
    preview: nextPreview,
    scope: nextPreview.scopeDecision,
    suggestions: nextPreview.suggestions,
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn,
  })

  await writeEvent('planner_status', {
    plannerStatus: pendingApprovalOpIds.length > 0 ? 'awaiting_approval' : 'completed',
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview: nextPreview,
    scope: nextPreview.scopeDecision,
    suggestions: nextPreview.suggestions,
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn,
  })

  await writeEvent('turn_completed', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview: nextPreview,
    note: pendingApprovalOpIds.length > 0 ? 'Preview applied with pending approvals.' : 'Preview first wave applied.',
    suggestions: nextPreview.suggestions,
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn,
  })

  return worldPromptApplyPreviewResponseSchema.parse({
    ok: true,
    turn,
  })
}

export async function cancelWorldPromptTurn(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptCancelTurnRequestSchema.parse(input.payload)
  let turn = await loadTurnById(input.client, payload.turnId)
  if (!['queued', 'streaming', 'awaiting_approval'].includes(turn.status)) {
    return worldPromptCancelTurnResponseSchema.parse({
      ok: true,
      turn,
    })
  }

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })

  turn = await updateTurn(input.client, turn.id, {
    status: 'cancelled',
    approval_state: 'not_required',
    assistant_summary: turn.assistantSummary || 'Turn cancelled.',
    error_message: null,
  })
  const session = await loadSessionById(input.client, turn.sessionId)
  const persistedSuggestions = await refreshTurnSuggestions({
    client: input.client,
    session,
    turn,
    snapshot: payload.snapshot,
    selectedThreadKey: typeof turn.metadata?.selectedThreadKey === 'string' ? turn.metadata.selectedThreadKey : null,
  })

  await writeEvent('turn_cancel_requested', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Cancellation requested. Future ops for this turn will stop.',
    suggestions: persistedSuggestions.map((suggestion) => ({
      id: suggestion.id,
      label: suggestion.label,
      prompt: suggestion.prompt,
      kind: suggestion.kind,
      style: suggestion.style,
      source: suggestion.source,
      threadKey: suggestion.threadKey,
      summary: suggestion.summary,
      estimatedNodeCount: suggestion.estimatedNodeCount,
      estimatedEdgeCount: suggestion.estimatedEdgeCount,
      willQueueImages: suggestion.willQueueImages,
      willQueueCinematics: suggestion.willQueueCinematics,
    })),
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn,
  })
  await writeEvent('assistant_note', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Turn cancelled. Already-applied graph changes remain, but later ops and new queued work from this turn were stopped.',
    turn,
  })
  await writeEvent('turn_completed', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Turn cancelled.',
    turn,
  })

  return worldPromptCancelTurnResponseSchema.parse({
    ok: true,
    turn,
  })
}
