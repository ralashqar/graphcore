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
  worldPromptSessionSchema,
  worldPromptSuggestionRecordSchema,
  worldPromptSuggestionSchema,
  worldPromptStartTurnRequestSchema,
  worldPromptStartTurnResponseSchema,
  worldPromptTurnSchema,
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
  type WorldPromptScopeDecision,
  type WorldPromptSession,
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
  worldBuildPlanResponseSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildPlanResponse,
  type WorldBuildStatusResponse,
} from '../../../src/domain/worldBuild.ts'
import { runOpenAiResponses } from './openai.ts'
import { normalizeStrictJsonSchema } from './structured-output.ts'
import { generateExpansionPlan, generateSeedPlan } from './world-graph.ts'

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

const plannerThreadCandidateSchema = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  status: z.enum(['open', 'resolved', 'parked']).default('open'),
  priority: z.enum(['primary', 'secondary', 'background']).default('secondary'),
  linkedEntityKeys: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

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

const DIRECT_SCOPE_CAPS = {
  entityOps: 6,
  relationshipOps: 10,
  existingEntityModificationOps: 2,
  queueOps: 2,
  derivedResultOps: 1,
}

const STAGED_SCOPE_CAPS = {
  entityOps: 5,
  relationshipOps: 6,
  existingEntityModificationOps: 2,
  queueOps: 2,
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
    .replace(/^Hosted prompt planning was unavailable, so GraphCore used a local fallback seed\.\s*/i, '')
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
      generatedReason: 'Highlights a concrete graph weakness that can be improved next.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 1,
    })
    return suggestion ? [suggestion] : []
  })
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
    .replace(/^Hosted prompt planning was unavailable, so GraphCore used a local fallback seed\.\s*/i, '')
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
    fallbackUsed: true,
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
  const touchedEntityKeys = new Set<string>()
  const preview = input.turn.metadata?.preview ? worldPromptPlanPreviewSchema.safeParse(input.turn.metadata.preview).data ?? null : null
  for (const item of preview?.items ?? []) {
    for (const entityKey of item.entityKeys ?? []) {
      touchedEntityKeys.add(entityKey)
    }
  }
  const unresolvedThreads = [...input.snapshot.worldThreads]
    .filter((thread) => thread.status === 'open')
    .sort((left, right) => {
      const leftPriority = left.priority === 'primary' ? 0 : left.priority === 'secondary' ? 1 : 2
      const rightPriority = right.priority === 'primary' ? 0 : right.priority === 'secondary' ? 1 : 2
      return leftPriority - rightPriority
    })
    .slice(0, 4)
  const memoryEnvelope = {
    recentUserIntent: input.turn.prompt.trim(),
    latestAssistantSummary: input.assistantSummary.trim(),
    selectedThreadKey: input.selectedThreadKey ?? null,
    selectedRootEntityKey: typeof input.turn.resolvedContext?.selectedRootEntityKey === 'string' ? input.turn.resolvedContext.selectedRootEntityKey : null,
    selectedViewKey: typeof input.turn.resolvedContext?.selectedViewKey === 'string' ? input.turn.resolvedContext.selectedViewKey : null,
    touchedEntityKeys: Array.from(touchedEntityKeys).slice(0, 8),
    unresolvedThreads: unresolvedThreads.map((thread) => ({
      key: thread.key,
      title: thread.title,
      priority: thread.priority,
    })),
    lastPreviewOutcome: preview?.appliedAt ? 'preview_applied' : preview ? 'preview_available' : 'none',
  }
  const contextLines = [
    input.session.summaryMemory.trim(),
    `Memory: ${JSON.stringify(memoryEnvelope)}`,
  ].filter(Boolean)
  return contextLines.join('\n').slice(-4000)
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
  return dedupeSuggestions([
    ...seededSuggestions,
    ...fallback,
  ])
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
    .slice(0, 6)
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
      },
      metadata: {
        ...currentMetadata,
        titleSource,
        hasUnreadUpdates: false,
        lastSuggestionRefreshAt: new Date().toISOString(),
        sessionMode: typeof currentMetadata.sessionMode === 'string' ? currentMetadata.sessionMode : 'normal',
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

  const exactCandidates = snapshot.worldEntities.filter((entity) => {
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

  const containmentCandidates = snapshot.worldEntities.filter((entity) => {
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

  const scored = snapshot.worldEntities
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

function exceedsScopeCaps(counts: PromptScopeCounts, caps: typeof DIRECT_SCOPE_CAPS | typeof STAGED_SCOPE_CAPS) {
  return counts.entityOps > caps.entityOps
    || counts.relationshipOps > caps.relationshipOps
    || counts.existingEntityModificationOps > caps.existingEntityModificationOps
    || counts.queueOps > caps.queueOps
    || counts.derivedResultOps > caps.derivedResultOps
}

function promptIncludesAny(prompt: string, probes: string[]) {
  const normalized = normalizeName(prompt)
  return probes.some((probe) => normalized.includes(normalizeName(probe)))
}

function scorePromptOpForStaging(op: PromptToWorldOp, prompt: string) {
  if (op.op === 'assistant_note') return -10
  if (op.op === 'replace_entity') {
    const replacementName = op.payload.replacementMode === 'create' ? op.payload.replacementEntity?.name ?? '' : op.payload.replacementEntityKey ?? ''
    const nameBoost = promptIncludesAny(prompt, [op.payload.targetEntityKey, replacementName]) ? 40 : 0
    return 130 + nameBoost
  }
  if (op.op === 'upsert_entity') {
    const nameBoost = promptIncludesAny(prompt, [op.payload.entity.name, ...op.payload.entity.aliases]) ? 30 : 0
    const anchorBoost = op.payload.entity.nodeType === 'place' || op.payload.entity.nodeType === 'event' ? 20 : 0
    const peopleBoost = op.payload.entity.nodeType === 'actor' || op.payload.entity.nodeType === 'group' ? 16 : 0
    const loreBoost = op.payload.entity.nodeType === 'concept' ? 8 : 0
    return 120 + nameBoost + anchorBoost + peopleBoost + loreBoost
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
      })
      return suggestion ? [suggestion] : []
    }),
    ...(() => {
      const suggestion = buildPromptSuggestion({
        id: 'thread-plan-only',
        label: 'Plan Only',
        prompt: 'Plan only the next best world beat from the active threads. Preserve canon and do not apply graph mutations.',
        kind: 'plan_only',
        style: 'secondary',
        source: 'thread',
        summary: 'Preview the next story-gardening beat without mutating the graph.',
      })
      return suggestion ? [suggestion] : []
    })(),
  ])
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

function buildFallbackPlannerOpsFromWorldGraph(input: {
  payload: WorldPromptStartTurnRequest
  requestSummary: string
  assistantSummary: string
  entities: Array<{
    name: string
    summary: string
    nodeType: WorldEntity['nodeType']
    aliases: string[]
    tags: string[]
  }>
  relationships: Array<{
    sourceName: string
    targetName: string
    verb: string
    direction: 'outbound' | 'inbound' | 'bidirectional'
    notes: string
  }>
}) {
  const wave1Ops: PromptToWorldOp[] = []

  for (const entity of input.entities) {
    wave1Ops.push({
      id: `fallback-entity-${slugify(entity.name)}`,
      op: 'upsert_entity',
      confidence: 0.62,
      applyMode: 'auto',
      dependencyOpIds: [],
      rationale: 'Fallback world prompt seed generated inside the edge function.',
      status: 'pending',
      metadata: {
        fallbackPlanner: true,
      },
      payload: {
        targetEntityKey: null,
        entity: {
          name: entity.name,
          summary: entity.summary,
          nodeType: entity.nodeType,
          aliases: entity.aliases,
          tags: entity.tags,
          status: 'active',
          thumbnailAssetKey: null,
          linkedDefinitionKey: null,
          source: 'ai',
          customProperties: {},
          metadata: {
            fallbackPlanner: true,
          },
          ensureLinkedDefinition: true,
        },
      },
    })
  }

  for (const relationship of input.relationships) {
    wave1Ops.push({
      id: `fallback-relationship-${slugify(`${relationship.sourceName}-${relationship.verb}-${relationship.targetName}`)}`,
      op: 'upsert_relationship',
      confidence: 0.58,
      applyMode: 'auto',
      dependencyOpIds: [],
      rationale: 'Fallback relationship generated inside the edge function.',
      status: 'pending',
      metadata: {
        fallbackPlanner: true,
      },
      payload: {
        targetRelationshipKey: null,
        relationship: {
          sourceEntityKey: null,
          targetEntityKey: null,
          sourceRef: {
            entityKey: null,
            definitionKey: null,
            name: relationship.sourceName,
            alias: null,
            matchCandidateEntityKeys: [],
          },
          targetRef: {
            entityKey: null,
            definitionKey: null,
            name: relationship.targetName,
            alias: null,
            matchCandidateEntityKeys: [],
          },
          verb: relationship.verb,
          direction: relationship.direction,
          strength: null,
          confidence: 0.58,
          source: 'ai',
          notes: relationship.notes,
          state: 'confirmed',
          metadata: {
            fallbackPlanner: true,
          },
        },
      },
    })
  }

  const suggestionSeed = buildProjectContextSuggestionSeed(input.payload.snapshot.projectContext)
  const suggestionTail = input.payload.snapshot.worldEntities.length === 0
    ? [
        buildPromptSuggestion({
          id: 'fallback-add-characters',
          label: suggestionSeed.primaryLabel,
          prompt: `${suggestionSeed.primaryPrompt} Ground it in "${input.requestSummary}".`,
          kind: 'continue_scope',
          style: 'primary',
          source: 'wave2',
          summary: suggestionSeed.primarySummary,
          estimatedNodeCount: 3,
          estimatedEdgeCount: 3,
        }),
        buildPromptSuggestion({
          id: 'fallback-add-lore',
          label: suggestionSeed.secondaryLabel,
          prompt: `${suggestionSeed.secondaryPrompt} Make it specific to "${input.requestSummary}".`,
          kind: 'continue_scope',
          style: 'secondary',
          source: 'wave2',
          summary: suggestionSeed.secondarySummary,
          estimatedNodeCount: 2,
          estimatedEdgeCount: 2,
        }),
      ].filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion))
    : [
        buildPromptSuggestion({
          id: 'fallback-expand-selection',
          label: 'Expand The Selection',
          prompt: input.payload.selectedRootEntityKey
            ? `Continue by expanding the selected world entity "${input.payload.selectedRootEntityKey}" with one compact additive beat.`
            : 'Continue this world with one compact additive beat around the main conflict.',
          kind: 'continue_scope',
          style: 'primary',
          source: 'wave2',
          summary: 'Push the world one step outward without broadening too fast.',
          estimatedNodeCount: 2,
          estimatedEdgeCount: 2,
        }),
      ].filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion))

  return worldPromptPlannerSchema.parse({
    classification: isPlanOnlyPrompt(input.payload.prompt) ? 'graphable_plan_only' : 'graphable_direct',
    assistantSummary: input.assistantSummary,
    operations: wave1Ops,
    wave1Ops,
    wave2Ideas: [],
    optionalIdeas: [],
    threadCandidates: [
      {
        key: `thread-${slugify(input.requestSummary)}`,
        title: input.requestSummary.slice(0, 90) || 'World Seed',
        summary: input.assistantSummary,
        status: 'open',
        priority: input.payload.snapshot.worldEntities.length === 0 ? 'primary' : 'secondary',
        linkedEntityKeys: [],
        metadata: {
          fallbackPlanner: true,
        },
      },
    ],
    suggestionCandidates: dedupeSuggestions([
      ...suggestionTail,
      ...(() => {
        const suggestion = buildPromptSuggestion({
        id: 'fallback-plan-only',
        label: 'Plan Only',
        prompt: 'Plan only the next best additions for this world. Preserve canon and do not apply graph mutations.',
        kind: 'plan_only',
        style: 'secondary',
        source: 'wave2',
        summary: 'Preview the next beat without mutating the graph.',
        })
        return suggestion ? [suggestion] : []
      })(),
    ]),
  })
}

async function buildFallbackPromptPlan(input: {
  payload: WorldPromptStartTurnRequest
  plannerError: unknown
}) {
  const prompt = input.payload.prompt.trim()
  const detectedIntent = detectPromptIntent(prompt, input.payload.snapshot)
  const plannerFailure = classifyPlannerFailure(input.plannerError)
  const graphDiagnostics = buildGraphDiagnosticFindings({
    snapshot: input.payload.snapshot,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
  })

  if (detectedIntent === 'graph_diagnosis') {
    return worldPromptPlannerSchema.parse({
      classification: 'graph_diagnosis',
      assistantSummary: 'Hosted prompt planning was unavailable, so GraphCore used a local fallback seed.',
      answer: graphDiagnostics.length > 0
        ? `The graph currently looks thinnest around ${graphDiagnostics[0]?.title.toLowerCase()}.`
        : 'The graph is still sparse enough that the main gaps are in context, relationships, and unresolved threads.',
      answerMode: 'answer_plus_options',
      operations: [],
      wave1Ops: [],
      wave2Ideas: [],
      optionalIdeas: [],
      threadCandidates: [],
      suggestionCandidates: [],
      optionCandidates: buildDiagnosticSuggestionSet(graphDiagnostics),
      diagnosticFindings: graphDiagnostics,
    })
  }

  if (detectedIntent === 'advisory_question') {
    const advisoryOptions = dedupeSuggestions([
      ...buildDiagnosticSuggestionSet(graphDiagnostics),
      ...buildThreadAwareSuggestions({
        snapshot: input.payload.snapshot,
        selectedThreadKey: input.payload.selectedThreadKey,
      }).map((suggestion) => ({
        ...suggestion,
        kind: 'advisory_option' as const,
        uiKind: 'advisory' as const,
        executionMode: 'apply_if_selected' as const,
      })),
    ])
    return worldPromptPlannerSchema.parse({
      classification: 'advisory_question',
      assistantSummary: 'Hosted prompt planning was unavailable, so GraphCore used a local fallback seed.',
      answer: graphDiagnostics.length > 0
        ? `Based on the current graph, the strongest next move is to shore up ${graphDiagnostics[0]?.title.toLowerCase()} before broadening the world further.`
        : 'Based on the current graph, the best next move is to deepen the most central entities and then widen the world one compact step at a time.',
      answerMode: 'answer_plus_options',
      operations: [],
      wave1Ops: [],
      wave2Ideas: [],
      optionalIdeas: [],
      threadCandidates: [],
      suggestionCandidates: [],
      optionCandidates: advisoryOptions,
      diagnosticFindings: graphDiagnostics,
    })
  }

  const extractedEntities: Array<{
    name: string
    summary: string
    nodeType: WorldEntity['nodeType']
    aliases: string[]
    tags: string[]
  }> = []
  const extractedRelationships: Array<{
    sourceName: string
    targetName: string
    verb: string
    direction: 'outbound' | 'inbound' | 'bidirectional'
    notes: string
  }> = []
  const existingNames = new Set(input.payload.snapshot.worldEntities.map((entity) => normalizeName(entity.name)))
  const seenNames = new Set<string>()

  const addEntity = (name: string, nodeType: WorldEntity['nodeType'], summary: string) => {
    const cleaned = name.trim().replace(/[.,;:]+$/g, '')
    const normalized = normalizeName(cleaned)
    if (!cleaned || !normalized || existingNames.has(normalized) || seenNames.has(normalized)) return
    seenNames.add(normalized)
    extractedEntities.push({
      name: cleaned,
      nodeType,
      summary,
      aliases: [],
      tags: [],
    })
  }

  const patternSpecs: Array<{ regex: RegExp; nodeType: WorldEntity['nodeType']; summary: (name: string) => string }> = [
    { regex: /\b(?:character|person|hero|villain|mentor|king|queen|prince|princess|lord|lady|heir)\s+(?:called|named)\s+([A-Z][A-Za-z' -]+)/gi, nodeType: 'actor', summary: (name) => `${name} is a key character introduced from the prompt.` },
    { regex: /\b(?:faction|house|order|cult|guild|clan|religion|group)\s+(?:called|named)\s+([A-Z][A-Za-z' -]+)/gi, nodeType: 'group', summary: (name) => `${name} is a world group introduced from the prompt.` },
    { regex: /\b(?:kingdom|realm|city|capital|fortress|keep|stronghold|village|outpost|arena|place)\s+(?:called|named)\s+([A-Z][A-Za-z' -]+)/gi, nodeType: 'place', summary: (name) => `${name} is an important world place introduced from the prompt.` },
    { regex: /\b(?:prophecy|belief|law|curse|concept|rule)\s+(?:called|named)\s+([A-Z][A-Za-z' -]+)/gi, nodeType: 'concept', summary: (name) => `${name} is a concept or lore anchor introduced from the prompt.` },
    { regex: /\b(?:war|rebellion|coronation|battle|event|crisis)\s+(?:called|named)\s+([A-Z][A-Za-z' -]+)/gi, nodeType: 'event', summary: (name) => `${name} is a major event introduced from the prompt.` },
  ]

  for (const spec of patternSpecs) {
    for (const match of prompt.matchAll(spec.regex)) {
      addEntity(match[1] ?? '', spec.nodeType, spec.summary(match[1] ?? ''))
    }
  }

  const parentChildMatch = prompt.match(/\b([A-Z][A-Za-z'-]+)\s+has\s+(?:a|an)\s+(?:son|daughter|child)\s+called\s+([A-Z][A-Za-z'-]+)/i)
  if (parentChildMatch) {
    const parentName = parentChildMatch[1]
    const childName = parentChildMatch[2]
    addEntity(childName, 'actor', `${childName} is a family member introduced from the prompt.`)
    extractedRelationships.push({
      sourceName: childName,
      targetName: parentName,
      verb: 'child_of',
      direction: 'outbound',
      notes: `${childName} is described as a child of ${parentName}.`,
    })
  }

  if (extractedEntities.length === 0 && input.payload.snapshot.worldEntities.length === 0) {
    addEntity('Central Conflict', 'concept', 'A fallback concept anchoring the main pressure described in the prompt.')
  }

  const requestSummary = prompt.slice(0, 96) || 'Starter World'
  return buildFallbackPlannerOpsFromWorldGraph({
    payload: input.payload,
    requestSummary,
    assistantSummary: `Hosted prompt planning was unavailable, so GraphCore used a local fallback seed. ${plannerFailure.message}`,
    entities: extractedEntities.slice(0, 4),
    relationships: extractedRelationships.slice(0, 4),
  })
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
    buildPromptSuggestion({
      id: 'plan-only',
      label: 'Plan Only',
      prompt: 'Plan only the next highest-leverage world additions. Do not apply graph mutations. Return assistant notes instead of entity, relationship, result, or queue ops.',
      kind: 'plan_only',
      source: 'repair',
      summary: 'Preview the next best world-building moves without changing the graph.',
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
    buildPromptSuggestion({
      id: 'plan-only',
      label: 'Plan Only',
      prompt: 'Plan only the next highest-leverage world additions. Do not apply graph mutations. Return assistant notes instead of entity, relationship, result, or queue ops.',
      kind: 'plan_only',
      source: 'wave2',
      summary: 'Preview the next wave before applying it.',
    }),
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
  const ranked = [...input.ops].sort((left, right) => scorePromptOpForStaging(right, input.prompt) - scorePromptOpForStaging(left, input.prompt))

  for (const op of ranked) {
    if (op.op === 'assistant_note') continue
    const nextCounts = countScopeOps([...selected, op], input.snapshot)
    if (exceedsScopeCaps(nextCounts, STAGED_SCOPE_CAPS)) {
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

function forcePromptOpAutoApply(op: PromptToWorldOp) {
  const nextOp = structuredClone(op) as PromptToWorldOp
  nextOp.applyMode = 'auto'
  if (nextOp.metadata && typeof nextOp.metadata === 'object') {
    const { approvalReason: _ignored, ...rest } = nextOp.metadata
    nextOp.metadata = rest
  }
  return nextOp
}

async function upsertWorldThreads(input: {
  client: SupabaseClient
  draftId: string
  turnId: string
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
  threadCandidates: Array<z.infer<typeof plannerThreadCandidateSchema>>
}) {
  const knownEntityKeys = new Set(input.snapshot.worldEntities.map((entity) => entity.key))
  const fallbackCandidates = input.threadCandidates.length > 0
    ? input.threadCandidates
    : (() => {
      const linkedEntityKeys = input.snapshot.worldEntities
        .filter((entity) => entity.metadata?.projected === true)
        .slice(-3)
        .map((entity) => entity.key)
      if (linkedEntityKeys.length === 0) return []
      return [{
        key: `thread.${slugify(linkedEntityKeys.join('-'))}`,
        title: 'Emerging Story Thread',
        summary: 'A newly introduced world thread inferred from the latest prompt wave.',
        status: 'open' as const,
        priority: 'primary' as const,
        linkedEntityKeys,
        metadata: {
          inferred: true,
          tags: ['story_gardener'],
        },
      }]
    })()
  const existingResponse = await input.client
    .from('world_threads')
    .select(THREAD_SELECT)
    .eq('draft_id', input.draftId)
  if (existingResponse.error) throw new Error(existingResponse.error.message)

  const existingThreads = ((existingResponse.data ?? []) as WorldThreadRow[]).map(mapThreadRow)
  const existingByKey = new Map(existingThreads.map((thread) => [thread.key, thread]))
  const upsertPayload = fallbackCandidates.map((candidate) => {
    const existing = existingByKey.get(candidate.key) ?? null
    const linkedEntityKeys = candidate.linkedEntityKeys.filter((key) => knownEntityKeys.has(key))
    return {
      draft_id: input.draftId,
      key: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      status: candidate.status,
      priority: candidate.priority,
      linked_entity_keys: Array.from(new Set([...(existing?.linkedEntityKeys ?? []), ...linkedEntityKeys])),
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

  if (input.selectedThreadKey) {
    const selectedThread = existingByKey.get(input.selectedThreadKey) ?? persisted.find((thread) => thread.key === input.selectedThreadKey) ?? null
    if (selectedThread) {
      const touchResponse = await input.client
        .from('world_threads')
        .update({ last_turn_id: input.turnId })
        .eq('draft_id', input.draftId)
        .eq('key', selectedThread.key)
        .select(THREAD_SELECT)
        .single()
      if (touchResponse.error) throw new Error(touchResponse.error.message)
      const touched = mapThreadRow(touchResponse.data as WorldThreadRow)
      const existingIndex = persisted.findIndex((thread) => thread.key === touched.key)
      if (existingIndex >= 0) {
        persisted[existingIndex] = touched
      } else {
        persisted.push(touched)
      }
    }
  }

  return persisted
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
    const previewableOps = actionableOps.length > 0
      ? buildStagedFirstWave(input).selectedOps.filter((op) => op.op !== 'assistant_note')
      : []
    const scope: WorldPromptScopeDecision = {
      mode: classification === 'graphable_plan_only' ? 'staged' : 'blocked',
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
    const preview = classification === 'graphable_plan_only' && previewableOps.length > 0
      ? buildPlanPreview({
        mode: 'plan_only',
        requestSummary: input.assistantSummary || input.prompt,
        scope,
        selectedOps: previewableOps,
        suggestions,
        canApplyFirstWave: true,
      })
      : null
    return {
      classification,
      mode: classification === 'graphable_plan_only' ? 'preview' : 'blocked',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions,
      note: classification === 'graphable_plan_only'
        ? 'Plan-only mode: no graph mutations were applied. Review the preview and apply the first wave only if it looks right.'
        : contradictoryOrLowConfidence
          ? 'This prompt is too contradictory or low-confidence to map cleanly into a world-graph turn, so I did not mutate the graph.'
          : 'I could not map that request cleanly into a coherent world-graph turn, so I did not mutate the graph.',
      answer,
      answerMode,
      diagnosticFindings,
      preview,
    }
  }

  if (!exceedsScopeCaps(counts, DIRECT_SCOPE_CAPS)) {
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
        : classificationHint === 'graphable_broad' || classificationHint === 'refinement_only'
        ? dedupeSuggestions([
          ...(input.suggestionCandidates ?? []),
          ...buildThreadAwareSuggestions({
            snapshot: input.snapshot,
            selectedThreadKey: input.selectedThreadKey,
          }),
        ])
        : [] as WorldPromptSuggestion[],
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
    return null
  }

  const existingByName = input.snapshot.definitions.find((definition) => (
    definition.kind === definitionKind && normalizeName(definition.name) === normalizeName(input.entity.name)
  )) ?? null
  if (existingByName) {
    return existingByName.key
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
  return candidateKey
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
      return input.promptIntentHint === 'question'
        ? 'Finding the entities, threads, and facts most relevant to the question.'
        : defaultPlannerProgressMessage(phase)
    case 'planning_relationships':
      return input.promptIntentHint === 'diagnosis'
        ? 'Looking for weak links, missing pressure, and relationship gaps.'
        : defaultPlannerProgressMessage(phase)
    default:
      return defaultPlannerProgressMessage(phase)
  }
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

async function generatePromptPlan(input: {
  payload: WorldPromptStartTurnRequest
  session: WorldPromptSession
  summaryMemory: string
  recentMessages: WorldPromptMessage[]
  onPlannerProgress?: (progress: WorldPromptPlannerProgress, extras?: { plannerOutline?: string[] }) => Promise<void> | void
}) {
  const projectContextGuidance = describeProjectContextForPlanner(input.payload.snapshot.projectContext)
  const promptIntentHint = detectPromptIntent(input.payload.prompt, input.payload.snapshot)
  const graphDiagnostics = buildGraphDiagnosticFindings({
    snapshot: input.payload.snapshot,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
  })
  const debugEnabled = shouldDebugWorldPromptOpenAi()
  const plannerResponseSchema = normalizeStrictJsonSchema(z.toJSONSchema(worldPromptPlannerSchema))
  const instructions = [
    'You are the GraphCore prompt-to-world graph planner.',
    'Return compact JSON only that matches the provided schema exactly.',
    'You can either plan graph mutations or answer graph-aware advisory questions.',
    'Return top-level keys: classification, assistantSummary, answer, answerMode, operations, wave1Ops, wave2Ideas, optionalIdeas, threadCandidates, suggestionCandidates, optionCandidates, diagnosticFindings.',
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
    'If the prompt says something like "kingdom called X", "character called Y", "faction called Z", or "king called Q", infer the obvious world entity types directly.',
    'Only use replace_entity when the user explicitly says a node is wrong, should be a different type, should be corrected, or should be replaced.',
    'If the prompt introduces a new proper noun plus extra lore, prefer creating the new node and updating context/relationships around existing nodes instead of replacing an existing node.',
    'For a simple direct creation prompt, wave1Ops should contain the named entities and the most obvious relationships before proposing any optional follow-up suggestions.',
    'Use graphable_broad when the request wants too much for one turn. In that case, keep only the best first wave in wave1Ops and place follow-up ideas in wave2Ideas/optionalIdeas.',
    'Use not_graphable or contradictory_or_low_confidence when the prompt cannot be mapped cleanly. In that case, wave1Ops may be empty and suggestionCandidates should repair the request.',
    'For graph diagnosis, let deterministic findings steer your answer and options. Phrase them clearly, but keep them rooted in the provided graph evidence.',
    'threadCandidates should describe the main unresolved narrative or lore threads implied by the prompt and resulting graph changes.',
    'Suggestion ideas should be concrete and world-specific, not generic categories, and should never just paraphrase or repeat the user prompt.',
    projectContextGuidance ? `Project guidance: ${projectContextGuidance}` : null,
    'Keep operations compact and high-signal.',
  ].filter(Boolean).join('\n')

  const prompt = JSON.stringify({
    session: {
      key: input.session.key,
      title: input.session.title,
      summaryMemory: input.summaryMemory,
    },
    recentMessages: input.recentMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedViewKey: input.payload.selectedViewKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    promptIntentHint,
    prompt: input.payload.prompt,
    projectContext: input.payload.snapshot.projectContext,
    graphDiagnostics,
    snapshot: {
      project: input.payload.snapshot.project,
      draft: input.payload.snapshot.draft,
      worldEntities: input.payload.snapshot.worldEntities.slice(-30),
      worldRelationships: input.payload.snapshot.worldRelationships.slice(-40),
      worldResults: input.payload.snapshot.worldResults.slice(-20),
      worldThreads: input.payload.snapshot.worldThreads.slice(-16),
      graphs: input.payload.snapshot.graphs.slice(-12),
    },
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

    const response = await runOpenAiResponses({
      model: input.payload.model,
      input: prompt,
      instructions,
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
    plannerProgressClosed = true
    for (const timeoutId of scheduledPlannerProgressTimeouts) {
      clearTimeout(timeoutId)
    }
    await emitPlannerProgress('finalizing_plan', { done: false })

    if (debugEnabled) {
      console.log('[world-prompt-debug] planner response-meta', previewJson({
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
    const validated = worldPromptPlannerSchema.safeParse(normalizedJson)
    if (!validated.success) {
      if (debugEnabled) {
        console.log('[world-prompt-debug] planner schema-failed', previewJson(validated.error.issues))
      }
      throw new Error(`World prompt planner returned JSON that did not match the expected schema. ${formatIssues(validated.error.issues)}`)
    }

    const plannerOutline = buildPlannerOutline(validated.data)
    await emitPlannerProgress('finalizing_plan', {
      message: plannerOutline.length > 0
        ? `Validated the plan and prepared ${plannerOutline.length} first-wave step${plannerOutline.length === 1 ? '' : 's'}.`
        : 'Validated the plan and prepared the next execution wave.',
      done: true,
    }, plannerOutline.length > 0 ? { plannerOutline } : undefined)

    return {
      plan: validated.data,
      plannerFailure: null,
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
    console.error('[world-prompt] planner failed; world prompt turn will fail without fallback.', {
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
    const resolved = resolveEntityReference(input.snapshot, {
      entityKey: op.payload.targetEntityKey,
      definitionKey: entity.linkedDefinitionKey,
      name: entity.name,
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
      op.payload.targetEntityKey = resolved.entity.key
      const renaming = normalizeName(entity.name) !== normalizeName(resolved.entity.name)
      const rewritingSummary = Boolean(entity.summary.trim() && resolved.entity.summary.trim() && entity.summary.trim() !== resolved.entity.summary.trim())
      const changingKind = entity.nodeType !== resolved.entity.nodeType
      const relinking = Boolean(entity.linkedDefinitionKey && entity.linkedDefinitionKey !== resolved.entity.linkedDefinitionKey)
      const canonTouch = entityIsCanonLocked(resolved.entity)
      if (renaming || rewritingSummary || relinking || canonTouch || (changingKind && explicitCorrection)) {
        op.applyMode = 'needs_approval'
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        canonTouch,
        approvalReason: renaming || rewritingSummary || relinking || (changingKind && explicitCorrection)
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
    const source = resolveEntityReference(input.snapshot, {
      entityKey: relationship.sourceEntityKey,
      definitionKey: relationship.sourceRef?.definitionKey,
      name: relationship.sourceRef?.name ?? relationship.sourceEntityKey,
      alias: relationship.sourceRef?.alias,
    })
    const target = resolveEntityReference(input.snapshot, {
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
  const linkedDefinitionKey = await ensureLinkedDefinition({
    client: input.client,
    snapshot: input.snapshot,
    entity: input.entity,
  })
  const definitionCreated = Boolean(linkedDefinitionKey && !input.snapshot.definitions.some((definition) => definition.key === linkedDefinitionKey))
  if (definitionCreated && linkedDefinitionKey) {
    const definitionKind = determineDefinitionKind(input.entity.nodeType)
    if (definitionKind) {
      input.snapshot.definitions = [
        ...input.snapshot.definitions,
        {
          key: linkedDefinitionKey,
          kind: definitionKind,
          name: input.entity.name,
          summary: input.entity.summary,
        },
      ]
    }
  }

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
    createdDefinitionKey: definitionCreated ? linkedDefinitionKey : null,
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
      input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
      return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
    }

    const linkedDefinitionKey = await ensureLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: input.op.payload.entity,
    })
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
      input.snapshot.worldEntities = [
        ...input.snapshot.worldEntities.filter((entity) => entity.key !== updatedEntity.key),
        updatedEntity,
      ]
      return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
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
          input.snapshot.worldEntities = [
            ...input.snapshot.worldEntities.filter((entity) => entity.key !== updatedEntity.key),
            updatedEntity,
          ]
          return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
        }
      }
      throw new Error(message)
    }
    const createdEntity = mapWorldEntityRow(insertResponse.data as WorldEntityRow)
    input.snapshot.worldEntities = [
      ...input.snapshot.worldEntities.filter((entity) => entity.key !== createdEntity.key),
      createdEntity,
    ]
    return { applied: { worldEntities: [createdEntity] }, queue: null, note: null }
  }

  if (input.op.op === 'update_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!target) throw new Error(`World entity ${input.op.payload.targetEntityKey} not found.`)
    const changes = input.op.payload.changes
    const nextAliases = changes.aliases ? Array.from(new Set([...target.aliases, ...changes.aliases])) : target.aliases
    const nextTags = changes.tags ? Array.from(new Set([...target.tags, ...changes.tags])) : target.tags
    const nextSummary = mergeEntitySummary(target.summary, changes.summary)
    const nextContext = mergeEntityContext(target.context, changes.context)
    const updateResponse = await input.client
      .from('world_entities')
      .update({
        aliases: nextAliases,
        tags: nextTags,
        summary: nextSummary,
        context: nextContext,
        metadata: {
          ...(target.metadata ?? {}),
          ...(changes.metadata ?? {}),
        },
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
      const nextNotes = mergeRelationshipNotes(existing.notes, relationship.notes)
      const updateResponse = await input.client
        .from('world_relationships')
        .update({
          notes: nextNotes,
          strength: relationship.strength ?? existing.strength,
          confidence: relationship.confidence ?? existing.confidence,
          metadata: {
            ...(existing.metadata ?? {}),
            ...(relationship.metadata ?? {}),
          },
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
    const nextNotes = mergeRelationshipNotes(target.notes, input.op.payload.changes.notes)
    const updateResponse = await input.client
      .from('world_relationships')
      .update({
        notes: nextNotes,
        strength: input.op.payload.changes.strength ?? target.strength,
        confidence: input.op.payload.changes.confidence ?? target.confidence,
        metadata: {
          ...(target.metadata ?? {}),
          ...(input.op.payload.changes.metadata ?? {}),
        },
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

const CONTEXT_SECTION_ORDER = [
  'Public Role / Reputation',
  'Hidden Truth',
  'Political Utility',
  'Social / Religious Friction',
  'Unresolved Implications',
] as const

function classifyContextLine(line: string) {
  const normalized = line.toLowerCase()
  if (/\b(hidden|secret|conceal|nobody knows|privately|unknown)\b/.test(normalized)) {
    return 'Hidden Truth' as const
  }
  if (/\b(political|court|scholar|schem|asset|useful|leverage|alliance|power)\b/.test(normalized)) {
    return 'Political Utility' as const
  }
  if (/\b(shame|religio|heresy|social|taboo|scandal|friction|against)\b/.test(normalized)) {
    return 'Social / Religious Friction' as const
  }
  if (/\b(may|could|threat|risk|unresolved|future|implication|tension)\b/.test(normalized)) {
    return 'Unresolved Implications' as const
  }
  return 'Public Role / Reputation' as const
}

function parseContextSections(value: string) {
  const sections = new Map<string, string[]>()
  for (const section of CONTEXT_SECTION_ORDER) {
    sections.set(section, [])
  }
  const blocks = value
    .split(/\n+/)
    .map((entry) => entry.replace(/^[\-*]\s*/, '').trim())
    .filter(Boolean)
  for (const block of blocks) {
    const section = classifyContextLine(block)
    const existing = sections.get(section) ?? []
    if (!existing.includes(block)) {
      existing.push(block)
      sections.set(section, existing)
    }
  }
  return sections
}

function renderContextSections(sections: Map<string, string[]>) {
  return CONTEXT_SECTION_ORDER
    .flatMap((section) => {
      const lines = sections.get(section) ?? []
      if (lines.length === 0) return []
      return [`${section}: ${lines.join(' ')}`]
    })
    .join('\n')
}

function mergeEntitySummary(existing: string, incoming?: string | null) {
  const next = normalizePromptTextBlock(incoming)
  if (!next) return existing
  return next
}

function mergeEntityContext(existing: string, incoming?: string | null) {
  const current = normalizePromptTextBlock(existing)
  const next = normalizePromptTextBlock(incoming)
  if (!next) return existing
  if (!current) return next
  if (current === next) return current
  if (next.includes(current)) return next
  if (current.includes(next)) return current
  const merged = parseContextSections(current)
  const incomingSections = parseContextSections(next)
  for (const section of CONTEXT_SECTION_ORDER) {
    const target = merged.get(section) ?? []
    for (const line of incomingSections.get(section) ?? []) {
      if (!target.includes(line)) {
        target.push(line)
      }
    }
    merged.set(section, target)
  }
  return renderContextSections(merged)
}

function mergeRelationshipNotes(existing: string, incoming?: string | null) {
  const next = normalizePromptTextBlock(incoming)
  if (!next) return existing
  return next
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
  const nextSummary = mergeEntitySummary(input.target.summary, input.incoming.summary)
  const nextContext = mergeEntityContext(input.target.context, input.incoming.context)
  const updateResponse = await input.client
    .from('world_entities')
    .update({
      aliases: nextAliases,
      tags: nextTags,
      summary: nextSummary,
      context: nextContext,
      thumbnail_asset_key: input.target.thumbnailAssetKey ?? input.incoming.thumbnailAssetKey,
      linked_definition_key: input.target.linkedDefinitionKey ?? input.linkedDefinitionKey,
      custom_properties: {
        ...(input.target.customProperties ?? {}),
        ...(input.incoming.customProperties ?? {}),
      },
      metadata: {
        ...(input.target.metadata ?? {}),
        ...(input.incoming.metadata ?? {}),
      },
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
      },
      approval_state: 'not_required',
      assistant_summary: '',
      metadata: {
        selectedThreadKey: payload.selectedThreadKey,
        selectedSuggestionId: payload.selectedSuggestionId,
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

    const selectedSuggestion = payload.selectedSuggestionId
      ? await loadSuggestionById(input.client, payload.selectedSuggestionId)
      : null
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
      payload,
      session: workingSession,
      summaryMemory: compacted.summaryMemory,
      recentMessages: compacted.recentMessages,
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
    await throwIfTurnCancelled(input.client, turn.id)

    const planningSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
    const sanitizedById = new Map<string, PromptToWorldOp>()
    const plannerOps = generated.wave1Ops.length > 0 ? generated.wave1Ops : generated.operations
    for (const operation of plannerOps.filter((op) => op.op === 'upsert_entity')) {
      const sanitized = forcePromptOpAutoApply(sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: payload.prompt }))
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    for (const operation of plannerOps.filter((op) => op.op !== 'upsert_entity')) {
      const sanitized = forcePromptOpAutoApply(sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: payload.prompt }))
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    const sanitizedOps = plannerOps.map((operation) => sanitizedById.get(operation.id) ?? operation)

    const persistedThreads = await upsertWorldThreads({
      client: input.client,
      draftId: payload.snapshot.draft.id,
      turnId: turn.id,
      snapshot: planningSnapshot,
      selectedThreadKey: payload.selectedThreadKey,
      threadCandidates: generated.threadCandidates,
    })

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
    })
    const finalizedSuggestions = finalizeSuggestionSet({
      snapshot: planningSnapshot,
      selectedThreadKey: payload.selectedThreadKey,
      sourcePrompt: payload.prompt,
      suggestions: execution.suggestions,
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
      turn: { id: turn.id },
    })

    const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
    const opsToRun = execution.selectedOps

    if (execution.mode === 'blocked') {
      await writeEvent('planner_status', {
        plannerStatus: 'blocked',
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
        note: stripInternalPlannerDiagnostics(execution.note),
        turn: { id: turn.id },
      })
    } else if (execution.mode === 'preview') {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: stripInternalPlannerDiagnostics(execution.note),
        preview: execution.preview ?? undefined,
        scope: execution.scope,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
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
        turn: { id: turn.id },
      })
    } else {
      await writeEvent('planner_status', {
        plannerStatus: 'applying',
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
        turn: { id: turn.id },
      })

      for (const op of opsToRun) {
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

        const result = await applyPromptOp({
          client: input.client,
          authHeader: input.authHeader,
          model: payload.model,
          snapshot: mutableSnapshot,
          prompt: payload.prompt,
          op,
        })

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
    }

    if (execution.note || finalizedSuggestions.length > 0) {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        plannerFailure: plannerFailure ?? undefined,
        note: stripInternalPlannerDiagnostics(execution.note),
        preview: execution.preview ?? undefined,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        scope: execution.scope,
        threads: persistedThreads,
      })
    }

    const generatedSummary = stripInternalPlannerDiagnostics(generated.assistantSummary.trim())
    const assistantSummary = [
      stripInternalPlannerDiagnostics(execution.answer || execution.note || ''),
      execution.mode === 'blocked' || execution.mode === 'advisory'
        ? generatedSummary || null
        : generatedSummary || summarizeAppliedOps(opsToRun),
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
        preview: execution.preview,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        scopeDecision: execution.scope,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
        threads: persistedThreads,
      },
    })
    await writeEvent('message_created', {
      message: assistantMessage,
      turn: { id: turn.id },
    })

    turn = await updateTurn(input.client, turn.id, {
      status: 'completed',
      approval_state: 'not_required',
      assistant_summary: assistantSummary,
      metadata: {
        ...(turn.metadata ?? {}),
        plannerFailure: plannerFailure ?? undefined,
        opCount: opsToRun.length,
        pendingApprovalCount: 0,
        classification: execution.classification,
        preview: execution.preview,
        answer: execution.answer || undefined,
        answerMode: execution.answerMode,
        diagnosticFindings: execution.diagnosticFindings,
        scopeDecision: execution.scope,
        selectedThreadKey: payload.selectedThreadKey,
        selectedSuggestionId: payload.selectedSuggestionId,
        continuationMode,
        suggestions: finalizedSuggestions,
        suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      },
    })
    workingSession = await updateSessionLifecycle({
      client: input.client,
      session: workingSession,
      prompt: payload.prompt,
      assistantSummary,
      selectedRootEntityKey: payload.selectedRootEntityKey,
      selectedViewKey: payload.selectedViewKey,
      selectedThreadKey: payload.selectedThreadKey,
      summaryMemory: buildRollingSessionMemory({
        session: workingSession,
        turn,
        assistantSummary,
        snapshot: mutableSnapshot,
        selectedThreadKey: payload.selectedThreadKey,
      }),
    })

    await writeEvent('planner_status', {
      plannerStatus: 'completed',
      plannerFailure: plannerFailure ?? undefined,
      classification: execution.classification,
      preview: execution.preview ?? undefined,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      scope: execution.scope,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      turn,
      session: workingSession,
    })

    await writeEvent('turn_completed', {
      plannerFailure: plannerFailure ?? undefined,
      turn,
      classification: execution.classification,
      preview: execution.preview ?? undefined,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      note: assistantSummary,
      session: workingSession,
    })
    return worldPromptStartTurnResponseSchema.parse({
      ok: true,
      session: workingSession,
      turn,
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
      })
      return worldPromptStartTurnResponseSchema.parse({
        ok: true,
        session: workingSession,
        turn,
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
  const alreadyResolved = rows.some((row) => row.event_type === 'op_approved' || row.event_type === 'op_rejected' || row.event_type === 'op_applied')
  if (!needsApproval || alreadyResolved) {
    return null
  }
  return {
    event: mapEventRow(needsApproval),
    op: promptToWorldOpSchema.parse((needsApproval.payload ?? {}).op),
  }
}

async function finalizeTurnApprovalState(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_events')
    .select('event_type')
    .eq('turn_id', turnId)
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as Array<{ event_type: string }>
  const pending = rows.filter((row) => row.event_type === 'op_needs_approval').length
  const resolved = rows.filter((row) => row.event_type === 'op_approved' || row.event_type === 'op_rejected' || row.event_type === 'op_applied').length
  const hasPending = pending > resolved
  return updateTurn(client, turnId, {
    status: hasPending ? 'awaiting_approval' : 'completed',
    approval_state: hasPending ? 'pending' : 'resolved',
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
  const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
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

  const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
  const appliedOpIds: string[] = []

  for (const rawOp of preview.pendingOps) {
    await throwIfTurnCancelled(input.client, turn.id)
    const op = forcePromptOpAutoApply(sanitizePromptOp({ op: rawOp, snapshot: mutableSnapshot, prompt: turn.prompt }))

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
    status: 'completed',
    approval_state: 'not_required',
    assistant_summary: assistantSummary,
    metadata: {
      ...(turn.metadata ?? {}),
      preview: nextPreview,
      suggestions: nextPreview.suggestions,
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
  })

  await writeEvent('assistant_note', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: appliedOpIds.length > 0 ? 'Applied the previewed first wave.' : 'The preview did not contain any directly applicable ops.',
    preview: nextPreview,
    scope: nextPreview.scopeDecision,
    suggestions: nextPreview.suggestions,
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    turn,
  })

  await writeEvent('planner_status', {
    plannerStatus: 'completed',
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
    note: 'Preview first wave applied.',
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
