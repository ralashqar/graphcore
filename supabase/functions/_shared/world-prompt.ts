import { z } from 'npm:zod@4'

import { buildDefaultDefinitionComponents, type DefinitionBase } from '../../../src/domain/graphcore.ts'
import { projectContextSchema, type ProjectContext, type ProjectSubtype } from '../../../src/domain/projectContext.ts'
import {
  worldPromptApplyPreviewRequestSchema,
  worldPromptApplyPreviewResponseSchema,
  worldPromptCancelTurnRequestSchema,
  worldPromptCancelTurnResponseSchema,
  worldPromptCancelGenerationJobRequestSchema,
  worldPromptCancelGenerationJobResponseSchema,
  promptToWorldOpSchema,
  worldPromptCreateSessionRequestSchema,
  worldPromptCreateSessionResponseSchema,
  worldPromptDismissSuggestionRequestSchema,
  worldPromptDismissSuggestionResponseSchema,
  worldPromptEventPayloadSchema,
  worldPromptBuildLedgerEntrySchema,
  worldPromptIncrementalBuildBriefSchema,
  worldPromptIncrementalManifestSchema,
  worldPromptIncrementalWorkItemSchema,
  worldPromptPlanPreviewSchema,
  worldPromptRefreshSuggestionsRequestSchema,
  worldPromptRefreshSuggestionsResponseSchema,
  worldPromptRecentTurnSummarySchema,
  worldPromptResolvedContextSchema,
  worldPromptSessionSchema,
  worldPromptSessionFocusStateSchema,
  worldPromptSessionMemoryStateSchema,
  worldPromptSnapshotSchema,
  worldPromptSuggestionRecordSchema,
  worldPromptSuggestionSchema,
  worldPromptStartTurnRequestSchema,
  worldPromptStartTurnResponseSchema,
  worldPromptProjectContextInferenceSchema,
  worldPromptSeedGenerationRequestSchema,
  worldPromptSeedGenerationResponseSchema,
  worldPromptGenerationJobSchema,
  worldPromptGenerationJobStepSchema,
  worldPromptGenerationStatusRequestSchema,
  worldPromptGenerationStatusResponseSchema,
  worldPromptInitialSeedContextSchema,
  worldPromptSeedInferenceRequestSchema,
  worldPromptSeedInferenceResponseSchema,
  worldPromptTurnSchema,
  worldPromptRetrievalDiagnosticsSchema,
  worldPromptResolveOpRequestSchema,
  worldPromptResolveOpResponseSchema,
  worldPromptTokenBudgetDiagnosticsSchema,
  worldPromptWorkItemContextSchema,
  worldPromptWorkItemResultSchema,
  worldPromptStreamGraphOpEnvelopeSchema,
  streamWikiRecordSchema,
  streamEntityRecordSchema,
  streamSequenceUnitRecordSchema,
  streamRelationshipRecordSchema,
  streamRepairSkipRecordSchema,
  type PromptToWorldOp,
  type WorldPromptClassification,
  type WorldPromptBuildLedgerEntry,
  type WorldPromptDiagnosticFinding,
  type WorldPromptEvent,
  type WorldPromptGenerationJob,
  type WorldPromptGenerationJobStep,
  type WorldPromptIncrementalBuildBrief,
  type WorldPromptIncrementalManifest,
  type WorldPromptIncrementalWorkItem,
  type WorldPromptMessage,
  type WorldPromptPlanPreview,
  type WorldPromptPlannerFailure,
  type WorldPromptPlannerProgress,
  type WorldPromptPlanPreviewItem,
  type WorldPromptAtlasIndex,
  type WorldPromptContextHit,
  type WorldPromptRetrievalDiagnostics,
  type WorldPromptResolvedContext,
  type WorldPromptScopeDecision,
  type WorldPromptSession,
  type WorldPromptSessionMemoryState,
  type WorldPromptSuggestion,
  type WorldPromptSuggestionRecord,
  type WorldPromptSnapshot,
  type WorldPromptStartTurnRequest,
  type WorldPromptStreamGraphOpEnvelope,
  type WorldPromptTokenBudgetDiagnostics,
  type WorldPromptWorkItemContext,
  type WorldPromptTurn,
} from '../../../src/domain/worldPrompt.ts'
import {
  getArtStylePreset,
  getOnboardingArtStylePresets,
} from '../../../src/domain/artStylePresets.ts'
import { getWorldSeedSkeletonProfile } from '../../../src/domain/worldSeedProfiles.ts'
import {
  ambiguityCandidatesFromHits,
  buildWorldPromptAtlasIndex,
  findWorldPromptAtlasEntityHits,
} from '../../../src/domain/worldPromptContext.ts'
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
import {
  analyzeWorldPromptEntityRequirements,
  type WorldPromptEntityRequirements,
} from '../../../src/domain/worldPromptRequirements.ts'
import {
  plannerThreadActionSchema,
  plannerThreadCandidateSchema,
  preparePlannerThreadMutations,
} from '../../../src/domain/worldPromptThreads.ts'
import {
  getWorldViewSemanticMetadata,
  reconcileAutoManagedWorldViews,
  type AutoManagedWorldViewOptions,
} from '../../../src/domain/worldViewDerivation.ts'
import {
  resolveIconGridSize,
  type IconGenerationCandidate,
} from './entity-icon-generation.ts'
import {
  appendRefinementHistory,
  mergeCanonicalContext,
  mergeCanonicalText,
} from '../../../src/domain/worldPromptRefinement.ts'
import {
  deriveWorldTimeline,
  normalizeWorldRelationshipTemporalMetadata,
  readWorldRelationshipTemporalMetadata,
  wouldCreateWorldTimelineCycle,
} from '../../../src/domain/worldTimeline.ts'
import {
  deriveWorldSequence,
  readWorldSequenceMetadata,
  validateWorldSequenceUnitCompleteness,
} from '../../../src/domain/worldSequence.ts'
import {
  buildWorldWikiFingerprint,
  deriveWorldWiki,
  readProjectWorldWikiPresentation,
  readWorldEntityWikiPresentation,
  readWorldWikiPresentationMetadata,
} from '../../../src/domain/worldWiki.ts'
import {
  buildAppGraphReadinessFindings,
  buildDefaultAppIncrementalWorkItems,
  buildGameGraphReadinessFindings,
  filterSuggestionsForPromptStrategy,
  getWorldPromptStrategy,
  normalizeWorkItemForPromptStrategy,
  projectContextUsesAppStrategy,
} from '../../../src/domain/worldPromptStrategies.ts'
import {
  worldBuildPlanResponseSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildPlanResponse,
  type WorldBuildStatusResponse,
} from '../../../src/domain/worldBuild.ts'
import { runOpenAiResponses, runOpenAiResponsesStream } from './openai.ts'
import { normalizeStrictJsonSchema, type JsonSchema } from './structured-output.ts'

type SupabaseClient = any

type WorldPromptTokenUsageCall = {
  id: string
  surface: string
  model: string
  responseId: string | null
  requestId: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  status: number
  ok: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

type WorldPromptTokenUsageSummary = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  callCount: number
  calls: WorldPromptTokenUsageCall[]
}

type WorldPromptTokenUsageRecorder = {
  record: (input: {
    surface: string
    model: string
    response: Awaited<ReturnType<typeof runOpenAiResponses>>
    metadata?: Record<string, unknown>
  }) => void
  summary: () => WorldPromptTokenUsageSummary | null
}

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

type WorldPromptGenerationJobRow = {
  id: string
  draft_id: string
  session_id: string
  turn_id: string
  kind: string
  status: string
  attempt_count: number
  heartbeat_at: string | null
  started_at: string | null
  completed_at: string | null
  token_usage: Record<string, unknown> | null
  counts: Record<string, unknown> | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  latest_applied_op_cursor: string | null
  created_at: string
  updated_at: string
}

type WorldPromptGenerationJobStepRow = {
  id: string
  job_id: string
  draft_id: string
  session_id: string
  turn_id: string
  step_key: string
  phase: string
  status: string
  attempt_count: number
  order_index: number
  heartbeat_at: string | null
  started_at: string | null
  completed_at: string | null
  token_usage: Record<string, unknown> | null
  counts: Record<string, unknown> | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  latest_applied_op_cursor: string | null
  created_at: string
  updated_at: string
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
const GENERATION_JOB_SELECT = 'id, draft_id, session_id, turn_id, kind, status, attempt_count, heartbeat_at, started_at, completed_at, token_usage, counts, error_message, metadata, latest_applied_op_cursor, created_at, updated_at'
const GENERATION_JOB_STEP_SELECT = 'id, job_id, draft_id, session_id, turn_id, step_key, phase, status, attempt_count, order_index, heartbeat_at, started_at, completed_at, token_usage, counts, error_message, metadata, latest_applied_op_cursor, created_at, updated_at'
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
  projectContextInference: worldPromptProjectContextInferenceSchema.nullable().default(null),
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

const storySequenceCompletionConsequenceSchema = z.object({
  cause: z.string(),
  effect: z.string(),
  affectedEntityKeys: z.array(z.string()),
  threadKeys: z.array(z.string()),
  consequenceType: z.enum(['plot', 'character', 'world_state', 'relationship', 'stakes']),
})

const storySequenceCompletionArcDeltaSchema = z.object({
  actorKey: z.string(),
  before: z.string(),
  pressure: z.string(),
  choice: z.string(),
  after: z.string(),
})

const storySequenceCompletionItemSchema = z.object({
  opId: z.string(),
  summary: z.string(),
  context: z.string(),
  sequence: z.object({
    unitKind: z.enum(['chapter', 'episode', 'mission', 'quest', 'campaign_moment', 'ugc_beat']),
    sequenceKey: z.string(),
    ordinal: z.number(),
    actLabel: z.string(),
    synopsis: z.string(),
    dramaticQuestion: z.string(),
    storyFunction: z.enum([
      'setup',
      'inciting_incident',
      'rising_action',
      'turning_point',
      'crisis',
      'climax',
      'resolution',
    ]),
    outcome: z.string(),
    consequences: z.array(storySequenceCompletionConsequenceSchema).min(1),
    characterArcDeltas: z.array(storySequenceCompletionArcDeltaSchema).min(1),
    openLoops: z.array(z.string()),
    resolvedLoops: z.array(z.string()),
    scriptExpansionReady: z.boolean(),
  }),
})

const storySequenceCompletionResponseSchema = z.object({
  completions: z.array(storySequenceCompletionItemSchema),
})

const STORY_SEQUENCE_UNIT_KINDS = ['chapter', 'episode', 'mission', 'quest', 'campaign_moment', 'ugc_beat'] as const
const STORY_SEQUENCE_FUNCTIONS = ['setup', 'inciting_incident', 'rising_action', 'turning_point', 'crisis', 'climax', 'resolution'] as const
const STORY_SEQUENCE_CONSEQUENCE_TYPES = ['plot', 'character', 'world_state', 'relationship', 'stakes'] as const
const WORLD_ENTITY_NODE_TYPES = [
  'actor',
  'group',
  'place',
  'object',
  'concept',
  'event',
  'sequence_unit',
  'player_profile',
  'player_initial_config',
  'player_stat',
  'inventory',
  'inventory_item',
  'currency',
  'shadow_token',
  'location_spot',
  'travel_link',
  'marketplace',
  'trade_offer',
  'quest',
  'quest_step',
  'narrative_arc',
  'narrative_scene',
  'dialogue_node',
  'choice',
  'choice_condition',
  'choice_outcome',
  'state_variable',
  'game_rule',
  'encounter',
  'save_state',
] as const
const NON_SEQUENCE_ENTITY_NODE_TYPES = WORLD_ENTITY_NODE_TYPES.filter((nodeType) => nodeType !== 'sequence_unit')

function isJsonSchemaObject(schema: JsonSchema): schema is Exclude<JsonSchema, boolean> {
  return typeof schema === 'object' && schema !== null
}

function stringArraySchema(): JsonSchema {
  return {
    type: 'array',
    items: { type: 'string' },
  }
}

function storySequenceMetadataJsonSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      unitKind: { type: 'string', enum: [...STORY_SEQUENCE_UNIT_KINDS] },
      sequenceKey: { type: 'string', minLength: 1 },
      ordinal: { type: 'number' },
      actLabel: { type: 'string' },
      synopsis: { type: 'string', minLength: 1 },
      dramaticQuestion: { type: 'string', minLength: 1 },
      storyFunction: { type: 'string', enum: [...STORY_SEQUENCE_FUNCTIONS] },
      outcome: { type: 'string', minLength: 1 },
      consequences: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cause: { type: 'string', minLength: 1 },
            effect: { type: 'string', minLength: 1 },
            affectedEntityKeys: stringArraySchema(),
            threadKeys: stringArraySchema(),
            consequenceType: { type: 'string', enum: [...STORY_SEQUENCE_CONSEQUENCE_TYPES] },
          },
          required: ['cause', 'effect', 'affectedEntityKeys', 'threadKeys', 'consequenceType'],
        },
      },
      characterArcDeltas: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            actorKey: { type: 'string', minLength: 1 },
            before: { type: 'string', minLength: 1 },
            pressure: { type: 'string', minLength: 1 },
            choice: { type: 'string', minLength: 1 },
            after: { type: 'string', minLength: 1 },
          },
          required: ['actorKey', 'before', 'pressure', 'choice', 'after'],
        },
      },
      openLoops: stringArraySchema(),
      resolvedLoops: stringArraySchema(),
      scriptExpansionReady: { type: 'boolean' },
    },
    required: [
      'unitKind',
      'sequenceKey',
      'ordinal',
      'actLabel',
      'synopsis',
      'dramaticQuestion',
      'storyFunction',
      'outcome',
      'consequences',
      'characterArcDeltas',
      'openLoops',
      'resolvedLoops',
      'scriptExpansionReady',
    ],
  }
}

function storySequenceCustomPropertiesJsonSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      sequence: storySequenceMetadataJsonSchema(),
    },
    required: ['sequence'],
  }
}

function isPlannerWorldEntitySchema(schema: Exclude<JsonSchema, boolean>) {
  const nodeType = schema.properties?.nodeType
  if (!isJsonSchemaObject(nodeType) || !Array.isArray(nodeType.enum)) return false
  return WORLD_ENTITY_NODE_TYPES.every((value) => nodeType.enum?.includes(value))
    && Boolean(schema.properties?.customProperties)
    && Boolean(schema.properties?.metadata)
}

function withStorySequenceEntityContract(schema: Exclude<JsonSchema, boolean>): JsonSchema {
  const genericEntity = structuredClone(schema) as Exclude<JsonSchema, boolean>
  const genericNodeType = genericEntity.properties?.nodeType
  if (isJsonSchemaObject(genericNodeType)) {
    genericNodeType.enum = [...NON_SEQUENCE_ENTITY_NODE_TYPES]
  }

  const sequenceEntity = structuredClone(schema) as Exclude<JsonSchema, boolean>
  if (sequenceEntity.properties) {
    sequenceEntity.properties.nodeType = { type: 'string', const: 'sequence_unit' }
    sequenceEntity.properties.customProperties = storySequenceCustomPropertiesJsonSchema()
  }

  return {
    anyOf: [
      sequenceEntity,
      genericEntity,
    ],
  }
}

function withStorySequencePlannerJsonSchema(schema: JsonSchema): JsonSchema {
  if (!isJsonSchemaObject(schema)) return schema
  if (isPlannerWorldEntitySchema(schema)) return withStorySequenceEntityContract(schema)
  const cloned = { ...schema }
  if (cloned.properties) {
    cloned.properties = Object.fromEntries(
      Object.entries(cloned.properties).map(([key, value]) => [key, withStorySequencePlannerJsonSchema(value)]),
    )
  }
  if (cloned.items) cloned.items = withStorySequencePlannerJsonSchema(cloned.items)
  if (Array.isArray(cloned.anyOf)) cloned.anyOf = cloned.anyOf.map((entry) => withStorySequencePlannerJsonSchema(entry))
  if (Array.isArray(cloned.oneOf)) cloned.oneOf = cloned.oneOf.map((entry) => withStorySequencePlannerJsonSchema(entry))
  if (cloned.$defs) {
    cloned.$defs = Object.fromEntries(
      Object.entries(cloned.$defs).map(([key, value]) => [key, withStorySequencePlannerJsonSchema(value)]),
    )
  }
  return cloned
}

type PlannerMode = 'direct_build' | 'refinement' | 'advisory_diagnosis'

const directBuildPlannerSchema = worldPromptPlannerSchema.pick({
  projectContextInference: true,
  classification: true,
  assistantSummary: true,
  wave1Ops: true,
  threadActions: true,
  threadCandidates: true,
  suggestionCandidates: true,
})

const incrementalWorkItemPlannerResponseSchema = worldPromptWorkItemResultSchema.extend({
  threadActions: z.array(plannerThreadActionSchema).default([]),
  suggestionCandidates: z.array(plannerIdeaSchema).default([]),
})

const refinementPlannerSchema = worldPromptPlannerSchema.pick({
  projectContextInference: true,
  classification: true,
  assistantSummary: true,
  wave1Ops: true,
  threadActions: true,
  threadCandidates: true,
  suggestionCandidates: true,
})

const advisoryDiagnosisPlannerSchema = worldPromptPlannerSchema.pick({
  projectContextInference: true,
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
    case 'update_world_wiki_metadata':
      record.payload = {
        target: record.target === 'view' ? 'view' : 'project',
        targetViewKey: typeof record.targetViewKey === 'string' ? record.targetViewKey : null,
        metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
        reason: typeof record.reason === 'string' ? record.reason : '',
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
type PlannerFocusLayer = 'actor' | 'group' | 'place' | 'concept' | 'event' | 'object' | 'sequence' | 'general'
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
    viewKind: string | null
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
  timelineContext: {
    eventCount: number
    orderedGroups: Array<{
      index: number
      eventKeys: string[]
      labels: string[]
    }>
    temporalRelationships: Array<{
      key: string
      sourceEventKey: string
      targetEventKey: string
      kind: string
      beforeEventKey: string | null
      afterEventKey: string | null
      certainty: string
    }>
    floatingEventKeys: string[]
    conflicts: Array<{
      kind: string
      relationshipKey: string
      eventKeys: string[]
      message: string
    }>
    diagnostics: string[]
  }
  sequenceContext: {
    unitCount: number
    groups: Array<{
      sequenceKey: string
      units: Array<{
        key: string
        label: string
        ordinal: number | null
        unitKind: string
        synopsis: string
        outcome: string
        consequenceCount: number
        characterArcDeltaCount: number
      }>
    }>
    relationships: Array<{
      key: string
      sourceUnitKey: string
      targetUnitKey: string
      kind: string
    }>
    gaps: Array<{
      kind: string
      unitKeys: string[]
      sequenceKey: string
      message: string
    }>
    diagnostics: string[]
  }
  wikiContext: {
    title: string
    logline: string
    synopsis: string
    artStyleDescription: string
    brandAtlasPrompt: string
    colorScheme: Record<string, string>
    fingerprint: string
    generatedFromFingerprint: string
    updatePolicy: 'none' | 'targeted' | 'opportunistic'
    missingFields: string[]
    stale: boolean
    populatedSections: Array<{
      kind: string
      title: string
      entityKeys: string[]
      threadKeys: string[]
      resultKeys: string[]
    }>
    gaps: Array<{
      key: string
      kind: string
      label: string
      entityKey: string | null
      threadKey: string | null
      sectionKind: string | null
    }>
    diagnostics: string[]
  }
  worldAtlas: WorldPromptAtlasIndex
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

type TargetedWikiMetadataAction = 'art_style_description' | 'brand_atlas_prompt' | 'app_color_scheme'

function detectTargetedWikiMetadataAction(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
}): TargetedWikiMetadataAction | null {
  const prompt = input.prompt.toLowerCase()
  const targeted = prompt.includes('targeted') && prompt.includes('wiki metadata')
  if (!targeted && !prompt.includes('metadata.')) return null

  if (
    projectContextIsApp(input.snapshot.projectContext)
    && (
      prompt.includes('metadata.colorscheme')
      || prompt.includes('color scheme')
      || prompt.includes('app colors')
    )
  ) {
    return 'app_color_scheme'
  }
  if (prompt.includes('metadata.brandatlasprompt') || prompt.includes('brand atlas')) {
    return 'brand_atlas_prompt'
  }
  if (prompt.includes('metadata.artstyledescription') || prompt.includes('art style description') || prompt.includes('art direction')) {
    return 'art_style_description'
  }
  return null
}

function collectTargetedWikiContext(snapshot: WorldPromptSnapshot) {
  const wiki = readProjectWorldWikiPresentation(snapshot)
  const appNodes = snapshot.worldEntities
    .filter((entity) => entity.status !== 'archived')
    .filter((entity) => [
      'app',
      'design_system',
      'feature',
      'persona',
      'user_flow',
      'screen',
      'component',
    ].includes(entity.nodeType))
    .slice(0, 14)
    .map((entity) => ({
      name: entity.name,
      nodeType: entity.nodeType,
      summary: trimPlannerText(entity.summary || entity.context || '', 180),
      app: entity.customProperties?.app ?? null,
    }))
  return {
    project: {
      name: snapshot.project.name,
      summary: snapshot.project.summary,
      projectContext: snapshot.projectContext ?? null,
    },
    wiki: {
      title: wiki.title,
      logline: wiki.logline,
      synopsis: trimPlannerText(wiki.synopsis, 360),
      genre: wiki.genre,
      themes: wiki.themes,
      toneTags: wiki.toneTags,
      coreConflict: wiki.coreConflict,
      visualMotifs: wiki.visualMotifs,
      artStyleDescription: wiki.artStyleDescription,
      brandAtlasPrompt: wiki.brandAtlasPrompt,
      colorScheme: wiki.colorScheme,
    },
    appNodes,
  }
}

function buildTargetedWikiMetadataRetrievalPacket(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  recentMessages: WorldPromptMessage[]
  retrievalIntent: ReturnType<typeof buildWorldPromptRetrievalIntent>
  selectedRootEntityKey?: string | null
  selectedThreadKey?: string | null
  selectedViewKey?: string | null
  selectedSuggestionId?: string | null
}): WorldPromptRetrievalPacket {
  const wiki = readProjectWorldWikiPresentation(input.snapshot)
  const selectedRootEntity = input.selectedRootEntityKey
    ? input.snapshot.worldEntities.find((entity) => entity.key === input.selectedRootEntityKey) ?? null
    : null
  const selectedView = input.selectedViewKey
    ? input.snapshot.worldViews.find((view) => view.key === input.selectedViewKey) ?? null
    : null
  const selectedThread = input.selectedThreadKey
    ? input.snapshot.worldThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    : null
  const atlas = buildWorldPromptAtlasIndex({
    entities: input.snapshot.worldEntities,
    relationships: input.snapshot.worldRelationships,
    maxEntities: 80,
  })
  const diagnostics = worldPromptRetrievalDiagnosticsSchema.parse({
    selectedSuggestionId: input.selectedSuggestionId ?? null,
    loadedEntityKeys: selectedRootEntity ? [selectedRootEntity.key] : [],
    loadedThreadKeys: selectedThread ? [selectedThread.key] : [],
    contextBudget: {
      atlasEntities: atlas.entities.length,
      atlasTotalEntities: atlas.totalEntityCount,
      atlasOmittedEntities: atlas.omittedEntityCount,
      relevantEntities: selectedRootEntity ? 1 : 0,
      relevantRelationships: 0,
      relevantThreads: selectedThread ? 1 : 0,
      recentMessages: Math.min(input.recentMessages.length, 3),
      fullAtlasIncluded: false,
    },
    chosenFocusLayer: input.retrievalIntent.focusLayer,
    continuityMode: input.retrievalIntent.continuityMode,
    executionReason: 'targeted_wiki_metadata_limited_context',
  })

  return {
    promptIntent: input.retrievalIntent.promptIntent,
    plannerMode: 'direct_build',
    focusLayer: input.retrievalIntent.focusLayer,
    continuityMode: input.retrievalIntent.continuityMode,
    resolvedIntent: input.retrievalIntent.resolvedIntent,
    resolvedFocus: input.retrievalIntent.resolvedFocus,
    resolvedMode: 'apply_compact_wave',
    selectedRootEntity: selectedRootEntity ? summarizeEntityForPlanner(selectedRootEntity) : null,
    selectedView: selectedView
      ? {
          key: selectedView.key,
          rootEntityKey: selectedView.rootEntityKey,
          mode: selectedView.mode,
          search: selectedView.search,
          viewKind: getWorldViewSemanticMetadata(selectedView).viewKind ?? null,
        }
      : null,
    selectedThread: selectedThread
      ? {
          key: selectedThread.key,
          title: selectedThread.title,
          summary: selectedThread.summary,
          linkedEntityKeys: selectedThread.linkedEntityKeys,
          priority: selectedThread.priority,
        }
      : null,
    relevantEntities: selectedRootEntity ? [summarizeEntityForPlanner(selectedRootEntity)] : [],
    relevantRelationships: [],
    relevantThreads: selectedThread
      ? [{
          key: selectedThread.key,
          title: selectedThread.title,
          summary: selectedThread.summary,
          priority: selectedThread.priority,
          linkedEntityKeys: selectedThread.linkedEntityKeys,
        }]
      : [],
    timelineContext: {
      eventCount: 0,
      orderedGroups: [],
      temporalRelationships: [],
      floatingEventKeys: [],
      conflicts: [],
      diagnostics: [],
    },
    sequenceContext: {
      unitCount: 0,
      groups: [],
      relationships: [],
      gaps: [],
      diagnostics: [],
    },
    wikiContext: {
      title: wiki.title,
      logline: wiki.logline,
      synopsis: wiki.synopsis,
      artStyleDescription: wiki.artStyleDescription,
      brandAtlasPrompt: wiki.brandAtlasPrompt,
      colorScheme: wiki.colorScheme,
      fingerprint: buildWorldWikiFingerprint(input.snapshot),
      generatedFromFingerprint: wiki.generatedFromFingerprint,
      updatePolicy: 'targeted',
      missingFields: [],
      stale: false,
      populatedSections: [],
      gaps: [],
      diagnostics: ['Using limited targeted wiki metadata context.'],
    },
    worldAtlas: atlas,
    graphSignals: {
      entityCount: input.snapshot.worldEntities.filter((entity) => entity.status !== 'archived').length,
      relationshipCount: input.snapshot.worldRelationships.filter((relationship) => relationship.state !== 'rejected').length,
      threadCount: input.snapshot.worldThreads.length,
      entityTypeCounts: atlas.entityTypeCounts,
      anchorCount: selectedRootEntity ? 1 : 0,
      ftsHitCount: 0,
    },
    recentMessages: input.recentMessages.slice(-3).map((message) => ({
      role: message.role,
      content: trimPlannerText(message.content, 240),
    })),
    sessionMemory: {
      conversationMemory: trimPlannerText(input.summaryMemory, 400),
      state: input.sessionMemoryState,
      focusMemory: {
        selectedRootEntityKey: input.selectedRootEntityKey ?? selectedView?.rootEntityKey ?? null,
        selectedViewKey: input.selectedViewKey ?? null,
        selectedThreadKey: input.selectedThreadKey ?? null,
        recentEntityKeys: (input.sessionMemoryState.frontierEntityKeys ?? []).slice(0, 4),
        recentThreadKeys: (input.sessionMemoryState.recentThreadKeys ?? []).slice(0, 2),
        continuityMode: input.sessionMemoryState.lastContinuityMode ?? null,
        focusLayer: input.sessionMemoryState.activeFocus.focusLayer ?? null,
      },
      worldMemory: {
        retrievedEntityKeys: selectedRootEntity ? [selectedRootEntity.key] : [],
        retrievedThreadKeys: selectedThread ? [selectedThread.key] : [],
      },
    },
    diagnostics,
    answerContext: {
      entityKeys: selectedRootEntity ? [selectedRootEntity.key] : [],
      threadKeys: selectedThread ? [selectedThread.key] : [],
    },
    mutationContext: {
      entityKeys: selectedRootEntity ? [selectedRootEntity.key] : [],
      threadKeys: selectedThread ? [selectedThread.key] : [],
    },
    backgroundContext: {
      entityKeys: [],
      threadKeys: [],
    },
  }
}

function targetedContextText(context: ReturnType<typeof collectTargetedWikiContext>) {
  return [
    context.project.name,
    context.project.summary,
    context.wiki.title,
    context.wiki.logline,
    context.wiki.synopsis,
    context.wiki.artStyleDescription,
    context.wiki.visualMotifs.join(' '),
    context.appNodes.map((node) => `${node.nodeType} ${node.name}: ${node.summary}`).join(' '),
  ].join(' ').toLowerCase()
}

function buildAppColorScheme(context: ReturnType<typeof collectTargetedWikiContext>) {
  const text = targetedContextText(context)
  if (/\b(wellness|mindful|health|habit|calm|soft|parent|family|gentle)\b/.test(text)) {
    return {
      primary: '#2f8f83 calm teal primary',
      secondary: '#f4a261 warm ritual coral',
      tertiary: '#7c3aed premium violet accent',
      background: '#f7fbf8 quiet wellness canvas',
      surface: '#ffffff clean card surface',
      text: '#172033 soft charcoal text',
    }
  }
  if (/\b(mascot|ritual|daily|creature|egg|companion|magic|reveal|timeline)\b/.test(text)) {
    return {
      primary: '#7c3aed magical companion violet',
      secondary: '#14b8a6 fresh daily teal',
      tertiary: '#f59e0b reveal gold',
      background: '#fff7ed warm morning canvas',
      surface: '#ffffff soft card surface',
      text: '#1f2937 storybook charcoal text',
    }
  }
  if (/\b(content|creator|comic|story|ad generator|editor|export|template|publish)\b/.test(text)) {
    return {
      primary: '#e11d48 creative rose primary',
      secondary: '#2563eb production blue',
      tertiary: '#f59e0b export gold',
      background: '#fafafa editorial workspace',
      surface: '#ffffff tool panel surface',
      text: '#18181b crisp ink text',
    }
  }
  return {
    primary: '#2563eb trusted utility blue',
    secondary: '#10b981 completion green',
    tertiary: '#f59e0b premium amber',
    background: '#f8fafc quiet app canvas',
    surface: '#ffffff focused panel surface',
    text: '#0f172a high-contrast slate text',
  }
}

function buildTargetedArtStyleDescription(context: ReturnType<typeof collectTargetedWikiContext>) {
  const app = projectContextIsApp(context.project.projectContext)
  const existingMotifs = context.wiki.visualMotifs.length > 0
    ? ` Motifs should repeat ${context.wiki.visualMotifs.slice(0, 4).join(', ')}.`
    : ''
  if (app) {
    return trimPlannerText([
      'Premium mobile UI direction with crisp native surfaces, restrained depth, readable compact cards, clear iOS-style hierarchy, polished iconography, and motion reserved for product moments.',
      context.wiki.logline ? `The look should support: ${context.wiki.logline}` : '',
      existingMotifs,
    ].filter(Boolean).join(' '), 700)
  }
  return trimPlannerText([
    'Cohesive visual-world direction with cinematic composition, controlled palette, strong recurring symbols, tactile materials, and consistent lighting across characters, places, objects, and key events.',
    context.wiki.logline ? `The look should support: ${context.wiki.logline}` : '',
    existingMotifs,
  ].filter(Boolean).join(' '), 700)
}

function buildTargetedBrandAtlasPrompt(context: ReturnType<typeof collectTargetedWikiContext>) {
  const app = projectContextIsApp(context.project.projectContext)
  const colorText = Object.entries(context.wiki.colorScheme).map(([key, value]) => `${key} ${value}`).join(', ')
  const base = app
    ? 'One premium mobile app brand atlas board, clean editorial grid, iPhone screen fragments, reusable component states, palette swatches, icon style samples, typography mood, motion cues, and tactile UI materials'
    : 'One cohesive visual world brand atlas board, cinematic editorial grid, key motif studies, palette swatches, material samples, typography mood, lighting references, representative subjects, and composition rules'
  return trimPlannerText([
    base,
    context.wiki.title ? `for "${context.wiki.title}"` : '',
    context.wiki.logline || context.wiki.synopsis ? `capturing ${context.wiki.logline || context.wiki.synopsis}` : '',
    context.wiki.artStyleDescription ? `visual direction: ${context.wiki.artStyleDescription}` : '',
    context.wiki.visualMotifs.length > 0 ? `motifs: ${context.wiki.visualMotifs.slice(0, 6).join(', ')}` : '',
    colorText ? `colors: ${colorText}` : '',
    'high-end, implementation-friendly, no schema diagrams, no internal IDs, no GraphCore branding',
  ].filter(Boolean).join(', '), 1400)
}

function buildTargetedWikiMetadataPlan(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
}): z.infer<typeof worldPromptPlannerSchema> | null {
  const action = detectTargetedWikiMetadataAction(input)
  if (!action) return null
  const context = collectTargetedWikiContext(input.snapshot)
  const metadata: Record<string, unknown> = {}
  let assistantSummary = ''
  let reason = ''

  if (action === 'app_color_scheme') {
    metadata.colorScheme = buildAppColorScheme(context)
    assistantSummary = 'Set the app color scheme in wiki metadata.'
    reason = 'Targeted app color metadata update.'
  } else if (action === 'brand_atlas_prompt') {
    metadata.brandAtlasPrompt = buildTargetedBrandAtlasPrompt(context)
    assistantSummary = projectContextIsApp(input.snapshot.projectContext)
      ? 'Drafted the app brand atlas image prompt in wiki metadata.'
      : 'Drafted the brand atlas image prompt in wiki metadata.'
    reason = 'Targeted brand atlas prompt metadata update.'
  } else {
    metadata.artStyleDescription = buildTargetedArtStyleDescription(context)
    assistantSummary = projectContextIsApp(input.snapshot.projectContext)
      ? 'Defined the app art direction in wiki metadata.'
      : 'Defined the art style in wiki metadata.'
    reason = 'Targeted art style metadata update.'
  }

  const op = promptToWorldOpSchema.parse({
    id: `wiki-metadata-${action}-${crypto.randomUUID()}`,
    op: 'update_world_wiki_metadata',
    confidence: 1,
    applyMode: 'auto',
    dependencyOpIds: [],
    rationale: reason,
    status: 'pending',
    metadata: {
      targetedWikiMetadataAction: action,
      limitedContext: true,
    },
    payload: {
      target: 'project',
      targetViewKey: null,
      metadata,
      reason,
    },
  })

  return worldPromptPlannerSchema.parse({
    projectContextInference: null,
    classification: 'graphable_direct',
    assistantSummary,
    answer: '',
    operations: [op],
    wave1Ops: [op],
    wave2Ideas: [],
    optionalIdeas: [],
    threadActions: [],
    threadCandidates: [],
    suggestionCandidates: [],
    optionCandidates: [],
    diagnosticFindings: [],
  })
}

function promptHasExplicitCorrectionLanguage(prompt: string) {
  return /\b(actually|should be|wrong type|replace|correct(?:ion)?|mistaken|instead of|repair|canon-?repair|merge|dedupe|duplicate|overlap(?:ping)?|canonicali[sz]e)\b/i.test(prompt)
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
  if (/\b(chapter|chapters|episode|episodes|act|acts|plot|outline|story flow|story beat|story beats|sequence|sequential|progression|turning point|climax|resolution)\b/i.test(prompt)) {
    return 'sequence'
  }
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
      return ['place', 'group', 'concept', 'event', 'sequence_unit', 'actor', 'object']
    case 'actor':
      return ['actor', 'sequence_unit', 'group', 'place', 'concept', 'event', 'object']
    case 'group':
      return ['group', 'actor', 'place', 'concept', 'sequence_unit', 'event', 'object']
    case 'concept':
      return ['concept', 'group', 'event', 'sequence_unit', 'place', 'actor', 'object']
    case 'event':
      return ['event', 'sequence_unit', 'place', 'group', 'actor', 'concept', 'object']
    case 'object':
      return ['object', 'concept', 'sequence_unit', 'group', 'actor', 'place', 'event']
    case 'sequence':
      return ['sequence_unit', 'event', 'actor', 'place', 'object', 'concept', 'group']
    default:
      return ['actor', 'group', 'place', 'concept', 'event', 'sequence_unit', 'object']
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
  if (input.selectedSuggestion) {
    if (input.selectedSuggestion.executionMode === 'plan_only' || input.selectedSuggestion.kind === 'plan_only') {
      return 'answer_only' satisfies WorldPromptResolvedMode
    }
    return 'apply_compact_wave' satisfies WorldPromptResolvedMode
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
  if (input.selectedSuggestionId && !promptExplicitlyRequestsNoMutation(input.prompt)) {
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
  const isAppProject = projectContextIsApp(input.snapshot.projectContext)
  const isGameProject = input.snapshot.projectContext?.projectType === 'game' || input.snapshot.projectContext?.brainProfile === 'game'
  const usesNarrativeRpgReadiness = input.snapshot.projectContext?.projectSubtype === 'narrative_rpg_mobile'
  const relationCounts = relationCountByEntity(input.snapshot)
  const activeEntities = input.snapshot.worldEntities.filter((entity) => entity.status !== 'archived')
  if (isAppProject) {
    findings.push(...buildAppGraphReadinessFindings({
      entities: activeEntities,
      relationships: input.snapshot.worldRelationships,
      wikiMetadata: readProjectWorldWikiPresentation(input.snapshot),
      selectedRootEntityKey: input.selectedRootEntityKey ?? null,
    }))
  }
  if (usesNarrativeRpgReadiness) {
    findings.push(...buildGameGraphReadinessFindings({
      entities: activeEntities,
      relationships: input.snapshot.worldRelationships,
      wikiMetadata: readProjectWorldWikiPresentation(input.snapshot),
      selectedRootEntityKey: input.selectedRootEntityKey ?? null,
    }))
  }
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
      summary: isAppProject
        ? `${entity.name} is present in the app graph, but its product role, UX purpose, data needs, or implementation constraints are still thin.`
        : isGameProject
          ? `${entity.name} is present in the game graph, but its playable role, state impact, rewards, gates, or traversal purpose are still thin.`
        : `${entity.name} is present in the world, but its long-form context is still thin enough that motives, pressure, or hidden truth are unclear.`,
      targetKeys: [entity.key],
      severity: (relationCounts.get(entity.key) ?? 0) >= 2 ? 'high' : 'medium',
    })
  }

  const isolatedEntity = activeEntities
    .filter((entity) => (
      isAppProject
        ? ['app', 'persona', 'business_goal', 'feature', 'user_flow', 'screen', 'component', 'data_model', 'action', 'api_endpoint', 'design_system', 'capability', 'tower', 'code_file'].includes(entity.nodeType)
        : ['actor', 'group', 'place', 'concept', 'event', 'sequence_unit'].includes(entity.nodeType)
    ))
    .find((entity) => (relationCounts.get(entity.key) ?? 0) === 0)
  if (isolatedEntity) {
    findings.push({
      id: `finding-isolated-${isolatedEntity.key}`,
      findingType: !isAppProject && (isolatedEntity.nodeType === 'group' || isolatedEntity.nodeType === 'place') ? 'isolated_world_area' : 'underconnected_entity',
      title: `${isolatedEntity.name} is disconnected`,
      summary: isAppProject
        ? `${isolatedEntity.name} does not currently anchor any visible app relationships, which makes it harder to see how it fits into the product, UX, data, or implementation graph.`
        : `${isolatedEntity.name} does not currently anchor any visible relationships, which makes it harder for the world graph to express why it matters.`,
      targetKeys: [isolatedEntity.key],
      severity: 'high',
    })
  }

  const openPrimaryThread = isAppProject ? null : (
    input.snapshot.worldThreads.find((thread) => (
      thread.status === 'open'
      && (input.selectedThreadKey ? thread.key === input.selectedThreadKey : thread.priority === 'primary')
    )) ?? input.snapshot.worldThreads.find((thread) => thread.status === 'open' && thread.priority === 'primary')
  )
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

  const appTypeCounts = {
    app: activeEntities.filter((entity) => entity.nodeType === 'app').length,
    user_flow: activeEntities.filter((entity) => entity.nodeType === 'user_flow').length,
    screen: activeEntities.filter((entity) => entity.nodeType === 'screen').length,
    data_model: activeEntities.filter((entity) => entity.nodeType === 'data_model').length,
    action: activeEntities.filter((entity) => entity.nodeType === 'action').length,
    api_endpoint: activeEntities.filter((entity) => entity.nodeType === 'api_endpoint').length,
    design_system: activeEntities.filter((entity) => entity.nodeType === 'design_system').length,
  }
  const typeCounts = {
    actor: activeEntities.filter((entity) => entity.nodeType === 'actor').length,
    group: activeEntities.filter((entity) => entity.nodeType === 'group').length,
    place: activeEntities.filter((entity) => entity.nodeType === 'place').length,
    concept: activeEntities.filter((entity) => entity.nodeType === 'concept').length,
    event: activeEntities.filter((entity) => entity.nodeType === 'event').length,
    sequence_unit: activeEntities.filter((entity) => entity.nodeType === 'sequence_unit').length,
  }
  if (isAppProject && (appTypeCounts.app === 0 || appTypeCounts.user_flow === 0 || appTypeCounts.screen === 0 || appTypeCounts.data_model === 0 || appTypeCounts.action === 0 || appTypeCounts.api_endpoint === 0 || appTypeCounts.design_system === 0)) {
    const missingLabels = [
      appTypeCounts.app === 0 ? 'app identity' : null,
      appTypeCounts.user_flow === 0 ? 'user flows' : null,
      appTypeCounts.screen === 0 ? 'screens' : null,
      appTypeCounts.data_model === 0 ? 'data models' : null,
      appTypeCounts.action === 0 ? 'actions' : null,
      appTypeCounts.api_endpoint === 0 ? 'API endpoints' : null,
      appTypeCounts.design_system === 0 ? 'design system' : null,
    ].filter(Boolean)
    findings.push({
      id: 'finding-app-balance-foundation',
      findingType: 'world_imbalance',
      title: 'The app graph lacks a core layer',
      summary: `The current app graph is still missing ${missingLabels.join(', ')}, so it has limited structure for UX, data, backend contracts, and implementation planning.`,
      targetKeys: focusEntity ? [focusEntity.key] : [],
      severity: 'high',
    })
  } else if (!isAppProject && (typeCounts.actor === 0 || typeCounts.place === 0 || typeCounts.group === 0)) {
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
        summary: isAppProject
          ? `${focusEntity.name} is the current focus, but it still needs clearer product, UX, data, API, capability, or implementation dependencies to feel embedded in the app graph.`
          : `${focusEntity.name} is the current focus, but it still needs clearer alliances, tensions, or dependencies to feel embedded in the wider world.`,
        targetKeys: [focusEntity.key],
        severity: 'medium',
      })
    }
  }

  const dedupedFindings: WorldPromptDiagnosticFinding[] = []
  const seenFindingIds = new Set<string>()
  for (const finding of findings) {
    if (seenFindingIds.has(finding.id)) continue
    dedupedFindings.push(finding)
    seenFindingIds.add(finding.id)
  }
  return dedupedFindings.slice(0, 4)
}

function buildDiagnosticSuggestionSet(
  findings: WorldPromptDiagnosticFinding[],
  projectContext?: WorldPromptSnapshot['projectContext'],
) {
  const isAppProject = projectContextIsApp(projectContext ?? null)
  return findings.flatMap((finding, index) => {
    const targetKey = finding.targetKeys[0] ?? null
    const prompt = targetKey
      ? `Improve ${targetKey} by addressing this gap: ${finding.summary}`
      : `Address this ${isAppProject ? 'app graph' : 'world'} gap: ${finding.summary}`
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
      generatedReason: isAppProject
        ? 'Highlights a concrete app graph weakness that can be improved next.'
        : 'Highlights a concrete graph weakness that can be improved next.',
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
  const wiki = readWorldEntityWikiPresentation(entity)
  const sequence = entity.nodeType === 'sequence_unit' ? readWorldSequenceMetadata(entity) : null
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
    wiki: {
      roleLabel: wiki.roleLabel ? trimPlannerText(wiki.roleLabel, 80) : '',
      shortSummary: wiki.shortSummary ? trimPlannerText(wiki.shortSummary, 160) : '',
      hasPresentationSummary: Boolean(wiki.shortSummary || entity.summary.trim()),
    },
    sequence: sequence
      ? {
          unitKind: sequence.unitKind ?? 'chapter',
          sequenceKey: sequence.sequenceKey ?? 'main',
          ordinal: sequence.ordinal ?? null,
          actLabel: sequence.actLabel ? trimPlannerText(sequence.actLabel, 80) : '',
          synopsis: sequence.synopsis ? trimPlannerText(sequence.synopsis, 220) : '',
          dramaticQuestion: sequence.dramaticQuestion ? trimPlannerText(sequence.dramaticQuestion, 160) : '',
          storyFunction: sequence.storyFunction ?? 'rising_action',
          outcome: sequence.outcome ? trimPlannerText(sequence.outcome, 180) : '',
          consequenceCount: sequence.consequences?.length ?? 0,
          characterArcDeltaCount: sequence.characterArcDeltas?.length ?? 0,
          scriptExpansionReady: sequence.scriptExpansionReady === true,
        }
      : null,
  }
}

function summarizeRelationshipForPlanner(
  relationship: WorldRelationship,
  includeNotes: boolean,
) {
  const temporal = readWorldRelationshipTemporalMetadata(relationship)
  return {
    key: relationship.key,
    sourceEntityKey: relationship.sourceEntityKey,
    targetEntityKey: relationship.targetEntityKey,
    verb: relationship.verb,
    direction: relationship.direction,
    notes: includeNotes && relationship.notes.trim()
      ? trimPlannerText(relationship.notes, 220)
      : '',
    temporal: temporal
      ? {
          kind: temporal.kind,
          timelineKey: temporal.timelineKey ?? 'canon',
          certainty: temporal.certainty ?? 'explicit',
          impliesChronology: temporal.impliesChronology ?? true,
        }
      : null,
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
  const entityByKey = new Map(activeEntities.map((entity) => [entity.key, entity]))
  const threadByKey = new Map(input.snapshot.worldThreads.map((thread) => [thread.key, thread]))
  const worldAtlas = buildWorldPromptAtlasIndex({
    entities: input.snapshot.worldEntities,
    relationships: input.snapshot.worldRelationships,
    maxEntities: input.mode === 'advisory_diagnosis' ? 320 : 240,
  })
  const atlasEntityHits = findWorldPromptAtlasEntityHits({
    prompt: input.prompt,
    atlas: worldAtlas,
    maxHits: input.mode === 'advisory_diagnosis' ? 16 : 12,
  })
  const hitReasonsByKey = new Map<string, WorldPromptContextHit>()
  const addHitReason = (hit: WorldPromptContextHit) => {
    const reasonKey = `${hit.kind}:${hit.key}:${hit.reason}`
    const previous = hitReasonsByKey.get(reasonKey)
    if (!previous || hit.score > previous.score) {
      hitReasonsByKey.set(reasonKey, hit)
    }
  }
  const labelForEntityKey = (key: string) => entityByKey.get(key)?.name ?? key
  const labelForThreadKey = (key: string) => threadByKey.get(key)?.title ?? key
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
  if (selectedRootEntity) {
    addHitReason({
      key: selectedRootEntity.key,
      kind: 'entity',
      reason: 'selected_focus',
      score: 10,
      label: selectedRootEntity.name,
      matchedText: selectedRootEntity.name,
    })
  }
  if (selectedView?.rootEntityKey) {
    addHitReason({
      key: selectedView.rootEntityKey,
      kind: 'entity',
      reason: 'selected_view',
      score: 8,
      label: labelForEntityKey(selectedView.rootEntityKey),
      matchedText: selectedView.name,
    })
  }
  if (selectedThread) {
    addHitReason({
      key: selectedThread.key,
      kind: 'thread',
      reason: 'selected_thread',
      score: 10,
      label: selectedThread.title,
      matchedText: selectedThread.title,
    })
  }
  const anchorEntityKeys = new Set<string>([
    ...input.intent.anchorEntityKeys,
  ])
  const anchorThreadKeys = new Set<string>([
    ...input.intent.anchorThreadKeys,
  ])
  if (input.intent.continuityMode === 'follow_up') {
    for (const entityKey of (input.sessionMemoryState.frontierEntityKeys ?? []).slice(0, 4)) {
      anchorEntityKeys.add(entityKey)
      addHitReason({
        key: entityKey,
        kind: 'entity',
        reason: 'session_memory',
        score: 4,
        label: labelForEntityKey(entityKey),
        matchedText: 'recent frontier',
      })
    }
    if (input.sessionMemoryState.activeFocus.selectedRootEntityKey) {
      anchorEntityKeys.add(input.sessionMemoryState.activeFocus.selectedRootEntityKey)
      addHitReason({
        key: input.sessionMemoryState.activeFocus.selectedRootEntityKey,
        kind: 'entity',
        reason: 'session_memory',
        score: 5,
        label: labelForEntityKey(input.sessionMemoryState.activeFocus.selectedRootEntityKey),
        matchedText: 'active focus memory',
      })
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
      if (hit.entityKey) {
        addHitReason({
          key: hit.entityKey,
          kind: 'entity',
          reason: 'fts',
          score: hit.score,
          label: labelForEntityKey(hit.entityKey),
          matchedText: hit.title,
        })
      }
      if (hit.sourceEntityKey) {
        addHitReason({
          key: hit.sourceEntityKey,
          kind: 'entity',
          reason: 'fts',
          score: hit.score * 0.8,
          label: labelForEntityKey(hit.sourceEntityKey),
          matchedText: hit.title,
        })
      }
      if (hit.targetEntityKey) {
        addHitReason({
          key: hit.targetEntityKey,
          kind: 'entity',
          reason: 'fts',
          score: hit.score * 0.8,
          label: labelForEntityKey(hit.targetEntityKey),
          matchedText: hit.title,
        })
      }
      if (hit.resourceType === 'thread') {
        addHitReason({
          key: hit.resourceKey,
          kind: 'thread',
          reason: 'fts',
          score: hit.score,
          label: labelForThreadKey(hit.resourceKey),
          matchedText: hit.title,
        })
      }
      if (hit.resourceType === 'relationship') {
        addHitReason({
          key: hit.resourceKey,
          kind: 'relationship',
          reason: 'fts',
          score: hit.score,
          label: hit.title,
          matchedText: hit.summary || hit.title,
        })
      }
    }
  }
  for (const atlasHit of atlasEntityHits) {
    addHitReason(atlasHit)
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
  for (const hit of atlasEntityHits) bumpEntityScore(hit.key, hit.score)

  const relevantEntityKeys = new Set<string>([
    ...anchorEntityKeys,
    ...ftsEntityKeys,
    ...atlasEntityHits.map((hit) => hit.key),
  ])
  let usedFallbackCore = false
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
      .forEach((entity) => {
        usedFallbackCore = true
        relevantEntityKeys.add(entity.key)
        addHitReason({
          key: entity.key,
          kind: 'entity',
          reason: 'fallback_core',
          score: 1 + (relationCounts.get(entity.key) ?? 0) * 0.05,
          label: entity.name,
          matchedText: 'fallback core',
        })
      })
  }

  const neighborhoodRelationships = input.snapshot.worldRelationships.filter((relationship) => (
    relevantEntityKeys.has(relationship.sourceEntityKey) || relevantEntityKeys.has(relationship.targetEntityKey)
  ))
  for (const relationship of neighborhoodRelationships) {
    if (relevantEntityKeys.size >= (input.mode === 'advisory_diagnosis' ? 14 : 8)) break
    if (relevantEntityKeys.has(relationship.sourceEntityKey)) {
      relevantEntityKeys.add(relationship.targetEntityKey)
      bumpEntityScore(relationship.targetEntityKey, 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0))
      addHitReason({
        key: relationship.targetEntityKey,
        kind: 'entity',
        reason: 'graph_neighbor',
        score: 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0),
        label: labelForEntityKey(relationship.targetEntityKey),
        matchedText: labelForEntityKey(relationship.sourceEntityKey),
      })
    }
    if (relevantEntityKeys.has(relationship.targetEntityKey)) {
      relevantEntityKeys.add(relationship.sourceEntityKey)
      bumpEntityScore(relationship.sourceEntityKey, 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0))
      addHitReason({
        key: relationship.sourceEntityKey,
        kind: 'entity',
        reason: 'graph_neighbor',
        score: 2 + (relationship.strength ?? 0) + (relationship.confidence ?? 0),
        label: labelForEntityKey(relationship.sourceEntityKey),
        matchedText: labelForEntityKey(relationship.targetEntityKey),
      })
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
      relevantEntityKeys.has(relationship.sourceEntityKey)
      || relevantEntityKeys.has(relationship.targetEntityKey)
      || ftsRelationshipKeys.has(relationship.key)
    ))
    .sort((left, right) => {
      const leftFts = ftsRelationshipKeys.has(left.key) ? 1 : 0
      const rightFts = ftsRelationshipKeys.has(right.key) ? 1 : 0
      if (leftFts !== rightFts) return rightFts - leftFts
      const leftEndpointScore =
        (relevantEntityKeys.has(left.sourceEntityKey) ? 1 : 0)
        + (relevantEntityKeys.has(left.targetEntityKey) ? 1 : 0)
      const rightEndpointScore =
        (relevantEntityKeys.has(right.sourceEntityKey) ? 1 : 0)
        + (relevantEntityKeys.has(right.targetEntityKey) ? 1 : 0)
      if (leftEndpointScore !== rightEndpointScore) return rightEndpointScore - leftEndpointScore
      const leftStrength = (left.strength ?? 0) + (left.confidence ?? 0)
      const rightStrength = (right.strength ?? 0) + (right.confidence ?? 0)
      return rightStrength - leftStrength
    })
    .slice(0, input.mode === 'advisory_diagnosis' ? 18 : 8)
    .map((relationship) => summarizeRelationshipForPlanner(relationship, input.mode !== 'direct_build'))
  for (const relationship of relevantRelationships) {
    addHitReason({
      key: relationship.key,
      kind: 'relationship',
      reason: ftsRelationshipKeys.has(relationship.key) ? 'fts' : 'graph_neighbor',
      score: ftsRelationshipKeys.has(relationship.key) ? 6 : 2,
      label: `${labelForEntityKey(relationship.sourceEntityKey)} ${relationship.verb} ${labelForEntityKey(relationship.targetEntityKey)}`,
      matchedText: relationship.notes || relationship.verb,
    })
  }

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
  for (const thread of relevantThreads) {
    addHitReason({
      key: thread.key,
      kind: 'thread',
      reason: ftsThreadKeys.has(thread.key) ? 'fts' : threadKeys.has(thread.key) ? 'session_memory' : 'thread_linked',
      score: threadScoreByKey.get(thread.key) ?? 2,
      label: thread.title,
      matchedText: thread.linkedEntityKeys.map(labelForEntityKey).join(', '),
    })
  }

  const recentMessageLimit = input.intent.continuityMode === 'topic_shift'
    ? 6
    : input.mode === 'advisory_diagnosis'
      ? 10
      : 8
  const trimmedRecentMessages = input.recentMessages
    .slice(-recentMessageLimit)
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
  const hitReasons = [...hitReasonsByKey.values()]
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, 40)
  const ambiguityCandidates = ambiguityCandidatesFromHits(atlasEntityHits)
  const weakContext = (
    atlasEntityHits.length === 0
    && ftsHits.length === 0
    && anchorEntityKeys.size === 0
    && anchorThreadKeys.size === 0
    && usedFallbackCore
  )
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
    loadedEntityKeys: relevantEntities.map((entity) => entity.key),
    loadedRelationshipKeys: relevantRelationships.map((relationship) => relationship.key),
    loadedThreadKeys: relevantThreads.map((thread) => thread.key),
    hitReasons,
    ambiguityCandidates,
    weakContext,
    contextBudget: {
      atlasEntities: worldAtlas.entities.length,
      atlasTotalEntities: worldAtlas.totalEntityCount,
      atlasOmittedEntities: worldAtlas.omittedEntityCount,
      relevantEntities: relevantEntities.length,
      relevantRelationships: relevantRelationships.length,
      relevantThreads: relevantThreads.length,
      recentMessages: trimmedRecentMessages.length,
      fullAtlasIncluded: !worldAtlas.capped,
    },
    chosenFocusLayer: input.intent.focusLayer,
    continuityMode: input.intent.continuityMode,
    executionReason: `${input.intent.resolvedMode ?? 'apply_compact_wave'} via ${input.intent.resolvedIntent ?? 'graph_build'} with ${input.intent.continuityMode}.`,
  })
  const timeline = deriveWorldTimeline({
    entities: input.snapshot.worldEntities,
    relationships: input.snapshot.worldRelationships,
  })
  const timelineRelevantEventKeys = new Set(
    relevantEntities
      .filter((entity) => entity.nodeType === 'event')
      .map((entity) => entity.key),
  )
  for (const thread of relevantThreads) {
    for (const entityKey of thread.linkedEntityKeys) {
      if (entityByKey.get(entityKey)?.nodeType === 'event') timelineRelevantEventKeys.add(entityKey)
    }
  }
  if (timelineRelevantEventKeys.size === 0 && input.intent.focusLayer === 'event') {
    for (const event of timeline.events.slice(0, 8)) {
      timelineRelevantEventKeys.add(event.key)
    }
  }
  const timelineEventLabel = (key: string) => entityByKey.get(key)?.name ?? key
  const compactTimelineGroups = timeline.orderedGroups
    .map((group) => ({
      index: group.index,
      eventKeys: group.eventKeys.filter((key) => timelineRelevantEventKeys.size === 0 || timelineRelevantEventKeys.has(key)),
    }))
    .filter((group) => group.eventKeys.length > 0)
    .slice(0, 8)
    .map((group) => ({
      ...group,
      labels: group.eventKeys.map(timelineEventLabel),
    }))
  const compactTimelineRelationships = timeline.temporalRelationships
    .filter((relationship) => (
      timelineRelevantEventKeys.size === 0
      || timelineRelevantEventKeys.has(relationship.sourceEventKey)
      || timelineRelevantEventKeys.has(relationship.targetEventKey)
      || ftsRelationshipKeys.has(relationship.key)
    ))
    .slice(0, 12)
    .map((relationship) => ({
      key: relationship.key,
      sourceEventKey: relationship.sourceEventKey,
      targetEventKey: relationship.targetEventKey,
      kind: relationship.kind,
      beforeEventKey: relationship.beforeEventKey,
      afterEventKey: relationship.afterEventKey,
      certainty: relationship.certainty,
    }))
  const timelineContext: WorldPromptRetrievalPacket['timelineContext'] = {
    eventCount: timeline.events.length,
    orderedGroups: compactTimelineGroups,
    temporalRelationships: compactTimelineRelationships,
    floatingEventKeys: timeline.floatingEventKeys
      .filter((key) => timelineRelevantEventKeys.size === 0 || timelineRelevantEventKeys.has(key))
      .slice(0, 12),
    conflicts: timeline.conflicts
      .filter((conflict) => timelineRelevantEventKeys.size === 0 || conflict.eventKeys.some((key) => timelineRelevantEventKeys.has(key)))
      .slice(0, 8),
    diagnostics: timeline.diagnostics,
  }
  const sequence = deriveWorldSequence({
    entities: input.snapshot.worldEntities,
    relationships: input.snapshot.worldRelationships,
  })
  const sequenceRelevantUnitKeys = new Set(
    relevantEntities
      .filter((entity) => entity.nodeType === 'sequence_unit')
      .map((entity) => entity.key),
  )
  for (const thread of relevantThreads) {
    for (const entityKey of thread.linkedEntityKeys) {
      if (entityByKey.get(entityKey)?.nodeType === 'sequence_unit') sequenceRelevantUnitKeys.add(entityKey)
    }
  }
  if (sequenceRelevantUnitKeys.size === 0 && input.intent.focusLayer === 'sequence') {
    for (const unit of sequence.units.slice(0, 10)) {
      sequenceRelevantUnitKeys.add(unit.entity.key)
    }
  }
  const sequenceContext: WorldPromptRetrievalPacket['sequenceContext'] = {
    unitCount: sequence.units.length,
    groups: sequence.groups
      .map((group) => ({
        sequenceKey: group.sequenceKey,
        units: group.units
          .filter((unit) => sequenceRelevantUnitKeys.size === 0 || sequenceRelevantUnitKeys.has(unit.entity.key))
          .slice(0, 12)
          .map((unit) => ({
            key: unit.entity.key,
            label: unit.entity.name,
            ordinal: unit.ordinal,
            unitKind: unit.unitKind,
            synopsis: trimPlannerText(unit.metadata.synopsis ?? unit.entity.summary, 220),
            outcome: trimPlannerText(unit.metadata.outcome ?? '', 180),
            consequenceCount: unit.metadata.consequences?.length ?? 0,
            characterArcDeltaCount: unit.metadata.characterArcDeltas?.length ?? 0,
          })),
      }))
      .filter((group) => group.units.length > 0)
      .slice(0, 6),
    relationships: sequence.relationships
      .filter((relationship) => (
        sequenceRelevantUnitKeys.size === 0
        || sequenceRelevantUnitKeys.has(relationship.sourceUnitKey)
        || sequenceRelevantUnitKeys.has(relationship.targetUnitKey)
        || ftsRelationshipKeys.has(relationship.key)
      ))
      .slice(0, 16)
      .map((relationship) => ({
        key: relationship.key,
        sourceUnitKey: relationship.sourceUnitKey,
        targetUnitKey: relationship.targetUnitKey,
        kind: relationship.kind,
      })),
    gaps: sequence.gaps
      .filter((gap) => sequenceRelevantUnitKeys.size === 0 || gap.unitKeys.some((key) => sequenceRelevantUnitKeys.has(key)))
      .slice(0, 12)
      .map((gap) => ({
        kind: gap.kind,
        unitKeys: gap.unitKeys,
        sequenceKey: gap.sequenceKey,
        message: gap.message,
      })),
    diagnostics: sequence.diagnostics,
  }
  const wiki = deriveWorldWiki({
    snapshot: input.snapshot,
    view: selectedView,
  })
  const wikiUpdatePolicy = determineWikiMetadataUpdatePolicy({
    prompt: input.prompt,
    mode: input.mode,
    wiki,
  })
  const wikiMissingFields = [
    wiki.overview.logline.trim() ? null : 'logline',
    wiki.overview.synopsis.trim().length >= 80 ? null : 'synopsis',
    wiki.overview.genre.trim() ? null : 'genre',
    wiki.overview.themes.length > 0 ? null : 'themes',
    wiki.overview.toneTags.length > 0 ? null : 'toneTags',
    wiki.overview.coreConflict.trim() ? null : 'coreConflict',
    wiki.overview.visualMotifs.length > 0 ? null : 'visualMotifs',
    wiki.overview.artStyleDescription.trim() ? null : 'artStyleDescription',
    wiki.overview.brandAtlasPrompt.trim() ? null : 'brandAtlasPrompt',
    Object.keys(wiki.overview.colorScheme).length > 0 ? null : 'colorScheme',
  ].filter((value): value is string => Boolean(value))
  const wikiContext: WorldPromptRetrievalPacket['wikiContext'] = {
    title: wiki.title,
    logline: trimPlannerText(wiki.overview.logline, 180),
    synopsis: trimPlannerText(wiki.overview.synopsis, 360),
    artStyleDescription: trimPlannerText(wiki.overview.artStyleDescription, 520),
    brandAtlasPrompt: trimPlannerText(wiki.overview.brandAtlasPrompt, 900),
    colorScheme: wiki.overview.colorScheme,
    fingerprint: wiki.fingerprint,
    generatedFromFingerprint: wiki.overview.generatedFromFingerprint,
    updatePolicy: wikiUpdatePolicy,
    missingFields: wikiMissingFields,
    stale: wiki.overview.stale,
    populatedSections: wiki.sections
      .filter((section) => !section.gap)
      .slice(0, 8)
      .map((section) => ({
        kind: section.kind,
        title: section.title,
        entityKeys: section.entityKeys.slice(0, 8),
        threadKeys: section.threadKeys.slice(0, 6),
        resultKeys: section.resultKeys.slice(0, 6),
      })),
    gaps: wiki.gaps.slice(0, 12).map((gap) => ({
      key: gap.key,
      kind: gap.kind,
      label: gap.label,
      entityKey: gap.entityKey,
      threadKey: gap.threadKey,
      sectionKind: gap.sectionKind,
    })),
    diagnostics: wiki.diagnostics.slice(0, 6),
  }
  for (const gap of wikiContext.gaps) {
    if (gap.entityKey) {
      addHitReason({
        key: gap.entityKey,
        kind: 'entity',
        reason: 'fallback_core',
        score: 1.5,
        label: labelForEntityKey(gap.entityKey),
        matchedText: gap.label,
      })
    }
    if (gap.threadKey) {
      addHitReason({
        key: gap.threadKey,
        kind: 'thread',
        reason: 'thread_linked',
        score: 1.5,
        label: labelForThreadKey(gap.threadKey),
        matchedText: gap.label,
      })
    }
  }

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
          viewKind: getWorldViewSemanticMetadata(selectedView).viewKind,
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
    timelineContext,
    sequenceContext,
    wikiContext,
    worldAtlas,
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
        sequence_unit: activeEntities.filter((entity) => entity.nodeType === 'sequence_unit').length,
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

function mapGenerationJobRow(row: WorldPromptGenerationJobRow): WorldPromptGenerationJob {
  return worldPromptGenerationJobSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    kind: row.kind,
    status: row.status,
    attemptCount: row.attempt_count,
    heartbeatAt: row.heartbeat_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    tokenUsage: row.token_usage ?? {},
    counts: row.counts ?? {},
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    latestAppliedOpCursor: row.latest_applied_op_cursor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapGenerationJobStepRow(row: WorldPromptGenerationJobStepRow): WorldPromptGenerationJobStep {
  return worldPromptGenerationJobStepSchema.parse({
    id: row.id,
    jobId: row.job_id,
    draftId: row.draft_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    stepKey: row.step_key,
    phase: row.phase,
    status: row.status,
    attemptCount: row.attempt_count,
    orderIndex: row.order_index,
    heartbeatAt: row.heartbeat_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    tokenUsage: row.token_usage ?? {},
    counts: row.counts ?? {},
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    latestAppliedOpCursor: row.latest_applied_op_cursor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
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

async function loadTurnMessages(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_messages')
    .select(MESSAGE_SELECT)
    .eq('turn_id', turnId)
    .order('created_at', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptMessageRow[]).map(mapMessageRow)
}

async function loadTurnEvents(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_events')
    .select(EVENT_SELECT)
    .eq('turn_id', turnId)
    .order('sequence', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptEventRow[]).map(mapEventRow)
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
  const recentRawMessageCount = 12
  if (messages.length <= 16) {
    return {
      summaryMemory,
      recentMessages: messages.slice(-recentRawMessageCount),
      compacted: false,
    }
  }

  const olderMessages = messages.slice(0, Math.max(0, messages.length - recentRawMessageCount))
  const nextSummary = [
    summaryMemory.trim(),
    olderMessages
      .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim().slice(0, 180)}`)
      .join('\n'),
  ].filter(Boolean).join('\n').slice(-4000)

  return {
    summaryMemory: nextSummary,
    recentMessages: messages.slice(-recentRawMessageCount),
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

function readTokenUsageNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function readOpenAiTokenUsage(body: Record<string, unknown>) {
  const usage = body.usage && typeof body.usage === 'object' && !Array.isArray(body.usage)
    ? body.usage as Record<string, unknown>
    : null
  if (!usage) return null

  const inputTokens = readTokenUsageNumber(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens)
  const outputTokens = readTokenUsageNumber(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens)
  const totalTokens = readTokenUsageNumber(usage.total_tokens ?? usage.totalTokens) || inputTokens + outputTokens
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object' && !Array.isArray(usage.input_tokens_details)
    ? usage.input_tokens_details as Record<string, unknown>
    : usage.inputTokensDetails && typeof usage.inputTokensDetails === 'object' && !Array.isArray(usage.inputTokensDetails)
      ? usage.inputTokensDetails as Record<string, unknown>
      : null
  const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === 'object' && !Array.isArray(usage.output_tokens_details)
    ? usage.output_tokens_details as Record<string, unknown>
    : usage.outputTokensDetails && typeof usage.outputTokensDetails === 'object' && !Array.isArray(usage.outputTokensDetails)
      ? usage.outputTokensDetails as Record<string, unknown>
      : null

  if (totalTokens <= 0) return null
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: readTokenUsageNumber(inputDetails?.cached_tokens ?? inputDetails?.cachedTokens),
    reasoningTokens: readTokenUsageNumber(outputDetails?.reasoning_tokens ?? outputDetails?.reasoningTokens),
  }
}

function createWorldPromptTokenUsageRecorder(): WorldPromptTokenUsageRecorder {
  const calls: WorldPromptTokenUsageCall[] = []
  return {
    record: (input) => {
      const usage = readOpenAiTokenUsage(input.response.body)
      if (!usage) return
      calls.push({
        id: `usage_${calls.length + 1}`,
        surface: input.surface,
        model: input.model,
        responseId: typeof input.response.body.id === 'string' ? input.response.body.id : null,
        requestId: input.response.response.headers.get('x-request-id'),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        status: input.response.response.status,
        ok: input.response.response.ok,
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
      })
    },
    summary: () => {
      if (calls.length === 0) return null
      return {
        inputTokens: calls.reduce((total, call) => total + call.inputTokens, 0),
        outputTokens: calls.reduce((total, call) => total + call.outputTokens, 0),
        totalTokens: calls.reduce((total, call) => total + call.totalTokens, 0),
        cachedInputTokens: calls.reduce((total, call) => total + call.cachedInputTokens, 0),
        reasoningTokens: calls.reduce((total, call) => total + call.reasoningTokens, 0),
        callCount: calls.length,
        calls: calls.slice(),
      }
    },
  }
}

async function persistTurnTokenUsage(input: {
  client: SupabaseClient
  turn: WorldPromptTurn
  usageRecorder: WorldPromptTokenUsageRecorder
}) {
  const tokenUsage = input.usageRecorder.summary()
  if (!tokenUsage) return input.turn
  return updateTurn(input.client, input.turn.id, {
    metadata: {
      ...(input.turn.metadata ?? {}),
      tokenUsage,
    },
  })
}

function tokenUsageEventPayload(usageRecorder: WorldPromptTokenUsageRecorder) {
  const tokenUsage = usageRecorder.summary()
  return tokenUsage ? { tokenUsage } : {}
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
  const seededSuggestions = filterSuggestionsForProjectContext(
    dedupeSuggestions(input.suggestions),
    input.snapshot.projectContext,
  )
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
  const hasFocusedNonThreadSuggestion = seededSuggestions.some((suggestion) => (
    suggestion.source !== 'thread' && suggestion.kind !== 'plan_only'
  ))
  const fallback = projectContextIsApp(input.snapshot.projectContext)
    ? buildAppFollowUpSuggestions({
      prompt: input.sourcePrompt ?? '',
      snapshot: input.snapshot,
      ops: [],
    })
    : input.selectedThreadKey
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
    .filter((suggestion) => filterSuggestionsForProjectContext([suggestion], input.snapshot.projectContext).length > 0)
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
    answer: input.mode === 'advisory_diagnosis' ? (input.plan.answer ?? '').replace(/\s+/g, ' ').trim() : '',
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
  if (targets.length === 0) return []

  const timestamp = new Date().toISOString()
  const updated = await Promise.all(targets.map(async (suggestion) => {
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
      .select(SUGGESTION_SELECT)
      .maybeSingle()
    if (response.error) throw new Error(response.error.message)
    return response.data ? mapSuggestionRow(response.data as WorldPromptSuggestionRow) : null
  }))
  return updated.filter((suggestion): suggestion is WorldPromptSuggestionRecord => Boolean(suggestion))
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
  const supersededSuggestions = await supersedeActiveSessionSuggestions(input.client, input.sessionId)
  const sanitizedSuggestions = dedupeSuggestions(input.suggestions)
    .filter((suggestion) => suggestionIsActionable(suggestion, input.sourcePrompt))
  if (sanitizedSuggestions.length === 0) return supersededSuggestions
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
  const insertedSuggestions = ((response.data ?? []) as WorldPromptSuggestionRow[])
    .map(mapSuggestionRow)
    .filter((suggestion): suggestion is WorldPromptSuggestionRecord => Boolean(suggestion))
  return [...supersededSuggestions, ...insertedSuggestions]
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

function worldEntityRequiresLinkedDefinition(nodeType: WorldEntity['nodeType']) {
  return nodeType === 'actor' || nodeType === 'place' || nodeType === 'object'
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

function normalizeWorldRelationshipVerbForIdentity(verb: string) {
  return normalizeName(verb).replace(/[\s-]+/g, '_')
}

function findEquivalentWorldRelationship(
  snapshot: WorldPromptSnapshot,
  sourceKey: string,
  verb: string,
  targetKey: string,
) {
  const normalizedVerb = normalizeWorldRelationshipVerbForIdentity(verb)
  return snapshot.worldRelationships.find((relationship) => (
    relationship.sourceEntityKey === sourceKey
    && relationship.targetEntityKey === targetKey
    && normalizeWorldRelationshipVerbForIdentity(relationship.verb) === normalizedVerb
  )) ?? null
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

function determineWikiMetadataUpdatePolicy(input: {
  prompt: string
  mode: PlannerMode
  wiki: ReturnType<typeof deriveWorldWiki>
}) {
  if (input.mode === 'advisory_diagnosis') return 'none' as const
  const normalized = input.prompt.toLowerCase()
  const targeted = /\b(wiki|logline|synopsis|overview|theme|themes|tone|genre|world bible|refresh overview|art style|brand atlas|color scheme|palette|visual style|look and feel)\b/.test(normalized)
  if (targeted) return 'targeted' as const
  const missingLogline = !input.wiki.overview.logline.trim()
  const weakSynopsis = input.wiki.overview.synopsis.trim().length < 80
  const hasSubstantialWorld = input.wiki.sections.some((section) => section.entityKeys.length >= 2 || section.threadKeys.length >= 1)
  if (input.mode === 'direct_build' && hasSubstantialWorld && (missingLogline || weakSynopsis || input.wiki.overview.stale)) {
    return 'opportunistic' as const
  }
  return 'none' as const
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
  if (op.op === 'update_world_wiki_metadata') {
    return promptIncludesAny(prompt, ['wiki', 'logline', 'synopsis', 'overview', 'theme', 'tone', 'art style', 'brand atlas', 'color scheme', 'palette', 'visual style', 'look and feel']) ? 65 : 25
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
  if (op.op === 'update_world_wiki_metadata') {
    return []
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

function projectContextIsApp(projectContext: WorldPromptSnapshot['projectContext']) {
  return projectContextUsesAppStrategy(projectContext ?? null)
}

function suggestionMatchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function filterSuggestionsForProjectContext(
  suggestions: WorldPromptSuggestion[],
  projectContext: WorldPromptSnapshot['projectContext'],
) {
  return filterSuggestionsForPromptStrategy(suggestions, projectContext ?? null)
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

function appEntityKeysByType(input: {
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  const keyByType = new Map<string, string[]>()
  const add = (nodeType: string, key: string | null | undefined) => {
    if (!key) return
    const existing = keyByType.get(nodeType) ?? []
    if (!existing.includes(key)) existing.push(key)
    keyByType.set(nodeType, existing)
  }
  for (const entity of input.snapshot.worldEntities) {
    if (entity.status !== 'archived') add(entity.nodeType, entity.key)
  }
  for (const op of input.ops) {
    if (op.op === 'upsert_entity') {
      add(op.payload.entity.nodeType, op.payload.targetEntityKey)
    }
  }
  return keyByType
}

function buildAppFollowUpSuggestions(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  const keysByType = appEntityKeysByType(input)
  const keys = (...types: string[]) => uniqueEntityKeys(types.flatMap((type) => keysByType.get(type) ?? []), 6)
  const has = (...types: string[]) => types.some((type) => (keysByType.get(type) ?? []).length > 0)
  const suggestions: Array<{
    score: number
    suggestion: Omit<Parameters<typeof buildPromptSuggestion>[0], 'style'>
  }> = []

  if (!has('user_flow') || !has('screen')) {
    suggestions.push({
      score: 96,
      suggestion: {
        id: 'app-followup-core-flow',
        label: 'Map Core UX Flow',
        prompt: 'Continue this app graph by defining the core user_flow nodes and the required screen route sequence from first open through the main success moment, paywall/export, and return loop.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: 'Turn the app idea into concrete UX flow and screen progression.',
        estimatedNodeCount: 4,
        estimatedEdgeCount: 5,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: keys('app', 'persona', 'feature'),
        focusLayer: 'general',
        retrievalHint: 'app core user flow screens onboarding main loop paywall return',
        generatedReason: 'App projects need product and UX flow suggestions, not story-threat suggestions.',
      },
    })
  }

  if (has('screen') && !has('component', 'section')) {
    suggestions.push({
      score: 88,
      suggestion: {
        id: 'app-followup-screen-components',
        label: 'Break Screens Into Components',
        prompt: 'Continue this app graph by decomposing the key screens into sections and reusable components, including props, states, interactions, and styled_by links to the primary design system.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: 'Convert screens into reusable UI sections and component contracts.',
        estimatedNodeCount: 5,
        estimatedEdgeCount: 6,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: keys('screen', 'design_system'),
        focusLayer: 'general',
        retrievalHint: 'app screens sections components props states interactions',
        generatedReason: 'The app graph has screens; the next useful move is component structure.',
      },
    })
  }

  if (!has('data_model') || !has('action') || !has('api_endpoint')) {
    suggestions.push({
      score: 84,
      suggestion: {
        id: 'app-followup-data-api',
        label: 'Define Data And API Contracts',
        prompt: 'Continue this app graph by adding the essential data_model, action, api_endpoint, and backend_function nodes for the main user flow, with reads, writes, calls, and emits relationships.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: 'Add the product data and backend contract layer that implementation will need.',
        estimatedNodeCount: 5,
        estimatedEdgeCount: 7,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: keys('feature', 'screen', 'user_flow'),
        focusLayer: 'general',
        retrievalHint: 'app data models actions api endpoints backend functions',
        generatedReason: 'The graph should define contracts before downstream code generation.',
      },
    })
  }

  if (!has('design_system')) {
    suggestions.push({
      score: 80,
      suggestion: {
        id: 'app-followup-design-system',
        label: 'Create App Design System',
        prompt: 'Continue this app graph by adding a primary design_system node with color tokens, typography, spacing, radii, shadows, button styles, card styles, input styles, icon rules, and motion direction derived from the project visual system.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: 'Translate the project brand direction into a visual-prototype-ready mobile UI system.',
        estimatedNodeCount: 1,
        estimatedEdgeCount: 4,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: keys('app', 'screen', 'component'),
        focusLayer: 'general',
        retrievalHint: 'app design system tokens color typography spacing motion',
        generatedReason: 'App styling should be captured as a design_system contract.',
      },
    })
  }

  if (!has('capability')) {
    suggestions.push({
      score: 74,
      suggestion: {
        id: 'app-followup-capabilities',
        label: 'Add Capability Constraints',
        prompt: 'Continue this app graph by identifying required capability nodes such as camera, photo library, push notifications, health data, haptics, or in-app purchases, and mark web preview, Expo Go, dev build, and production entitlement constraints.',
        kind: 'continue_scope',
        source: 'wave2',
        summary: 'Make native/platform requirements explicit before visual prototyping and later implementation.',
        estimatedNodeCount: 3,
        estimatedEdgeCount: 4,
        actionMode: 'apply_compact_wave',
        applyPolicy: 'auto_if_safe',
        targetEntityKeys: keys('feature', 'screen', 'action'),
        focusLayer: 'general',
        retrievalHint: 'app native capabilities expo go web preview constraints',
        generatedReason: 'Native requirements should be graph nodes with preview/build constraints.',
      },
    })
  }

  const ranked = suggestions
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry, index) => buildPromptSuggestion({
      ...entry.suggestion,
      style: index === 0 ? 'primary' : 'secondary',
    }))
    .filter((entry): entry is WorldPromptSuggestion => Boolean(entry))

  return dedupeSuggestions(ranked).slice(0, 4)
}

function buildDirectFollowUpSuggestions(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
  selectedThreadKey?: string | null
}) {
  if (projectContextIsApp(input.snapshot.projectContext)) {
    return buildAppFollowUpSuggestions(input)
  }

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
  if (projectContextIsApp(input.snapshot.projectContext)) {
    const combined = [
      ...filterSuggestionsForProjectContext(input.suggestionCandidates ?? [], input.snapshot.projectContext),
      ...buildAppFollowUpSuggestions({
        prompt: input.prompt,
        snapshot: input.snapshot,
        ops: input.ops,
      }),
    ]
    return dedupeSuggestions(combined)
      .map((suggestion, index) => buildPromptSuggestion({
        ...suggestion,
        style: index === 0 ? 'primary' : 'secondary',
      }))
      .filter((entry): entry is WorldPromptSuggestion => Boolean(entry))
      .slice(0, 4)
  }

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
    case 'update_world_wiki_metadata':
      return { nodeCount: 0, edgeCount: 0, queueCount: 0 }
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

function pluralizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function summarizePlannedGraphChanges(input: {
  selectedOps: PromptToWorldOp[]
  runnableOps: PromptToWorldOp[]
  skippedRiskyCount: number
}) {
  const selectedOps = input.selectedOps.filter((op) => op.op !== 'assistant_note')
  const graphChangeCount = selectedOps.length
  if (graphChangeCount === 0) {
    return 'No graph changes planned; preparing the answer and next-step options.'
  }

  const newNodes = selectedOps.filter((op) => op.op === 'upsert_entity' && !op.payload.targetEntityKey).length
  const nodeUpdates = selectedOps.filter((op) => (
    op.op === 'update_entity'
    || op.op === 'replace_entity'
    || (op.op === 'upsert_entity' && Boolean(op.payload.targetEntityKey))
  )).length
  const newLinks = selectedOps.filter((op) => op.op === 'upsert_relationship' && !op.payload.targetRelationshipKey).length
  const linkUpdates = selectedOps.filter((op) => (
    op.op === 'update_relationship'
    || (op.op === 'upsert_relationship' && Boolean(op.payload.targetRelationshipKey))
  )).length
  const outputs = selectedOps.filter((op) => op.op === 'create_derived_result').length
  const queuedOutputs = selectedOps.filter((op) => op.op === 'queue_image_generation' || op.op === 'queue_cinematic_generation').length
  const wikiUpdates = selectedOps.filter((op) => op.op === 'update_world_wiki_metadata').length
  const runnableCount = input.runnableOps.filter((op) => op.op !== 'assistant_note').length

  const parts = [
    newNodes > 0 ? pluralizeCount(newNodes, 'new node') : null,
    nodeUpdates > 0 ? pluralizeCount(nodeUpdates, 'node update') : null,
    newLinks > 0 ? pluralizeCount(newLinks, 'new link') : null,
    linkUpdates > 0 ? pluralizeCount(linkUpdates, 'link update') : null,
    outputs > 0 ? pluralizeCount(outputs, 'linked output') : null,
    queuedOutputs > 0 ? pluralizeCount(queuedOutputs, 'queued output') : null,
    wikiUpdates > 0 ? pluralizeCount(wikiUpdates, 'wiki update') : null,
    input.skippedRiskyCount > 0 ? `${input.skippedRiskyCount} held back for safety` : null,
  ].filter((part): part is string => Boolean(part))

  const applySuffix = runnableCount !== graphChangeCount
    ? ` ${pluralizeCount(runnableCount, 'change')} can apply now.`
    : ''
  return `Planned ${pluralizeCount(graphChangeCount, 'graph change')}: ${parts.join(', ')}.${applySuffix}`
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
  if (projectContextIsApp(snapshot.projectContext)) {
    return dedupeSuggestions([
      buildPromptSuggestion({
        id: 'repair-app-brief',
        label: suggestionSeed.repairLabel,
        prompt: hasWorld
          ? `${suggestionSeed.primaryPrompt} Use the existing app graph instead of starting over.`
          : suggestionSeed.repairPrompt,
        kind: 'repair_prompt',
        style: 'primary',
        source: 'repair',
        summary: suggestionSeed.repairSummary,
        estimatedNodeCount: 4,
        estimatedEdgeCount: 4,
      }),
      buildPromptSuggestion({
        id: 'repair-app-flow',
        label: 'Map App Flow',
        prompt: hasWorld
          ? 'Continue this app graph by adding the missing user_flow and screen route sequence for onboarding, the core success moment, paywall/export, and return loop.'
          : 'Start this app graph with an app node, persona, core feature, user_flow, and screen route sequence for the main mobile app loop.',
        kind: 'repair_prompt',
        source: 'repair',
        summary: 'Create the product and UX structure needed for an app graph.',
        estimatedNodeCount: 5,
        estimatedEdgeCount: 5,
      }),
      buildPromptSuggestion({
        id: 'repair-app-contracts',
        label: 'Add App Contracts',
        prompt: `Use this as context: "${prompt}". Define the app data models, user actions, API endpoints, capabilities, and design system needed to make the product graph implementable.`,
        kind: 'repair_prompt',
        source: 'repair',
        summary: 'Focus on implementation-ready app graph contracts instead of story canon.',
        estimatedNodeCount: 6,
        estimatedEdgeCount: 6,
      }),
    ].filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion)))
  }

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
  if (projectContextIsApp(input.snapshot.projectContext)) {
    const appSuggestions = buildAppFollowUpSuggestions({
      prompt: input.prompt,
      snapshot: input.snapshot,
      ops: input.deferredOps,
    })
    return appSuggestions.length > 0
      ? appSuggestions
      : dedupeSuggestions([
        buildPromptSuggestion({
          id: 'continue-app-system',
          label: 'Continue App System',
          prompt: 'Continue this app graph by adding only the next product, UX, data, API, capability, or design-system nodes needed for the generated app to become implementable.',
          kind: 'continue_scope',
          style: 'primary',
          source: 'wave2',
          summary: 'Expand the app graph with implementation-ready product structure.',
          estimatedNodeCount: 4,
          estimatedEdgeCount: 5,
        }),
      ].filter((suggestion): suggestion is WorldPromptSuggestion => Boolean(suggestion)))
  }

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
    case 'update_world_wiki_metadata':
      return {
        id: op.id,
        kind: 'wiki_metadata',
        title: op.payload.target === 'view' ? 'Update wiki page metadata' : 'Update world wiki overview',
        summary: op.payload.reason || 'Refresh compact wiki presentation metadata.',
        targetKeys: [op.payload.targetViewKey].filter((value): value is string => Boolean(value)),
        diffMode,
        touchesCanon: false,
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
  const approvalReason = typeof op.metadata?.approvalReason === 'string'
    ? op.metadata.approvalReason.trim()
    : ''
  if (approvalReason === 'Semantic rewrite of existing entity') {
    return false
  }
  return op.applyMode === 'needs_approval'
    || approvalReason.length > 0
}

type StorySequenceOpIssue = {
  opId: string
  entityName: string
  missingFields: string[]
}

function projectUsesStrictStorySequence(projectContext: WorldPromptSnapshot['projectContext']) {
  return !projectContext || projectContext.projectType === 'story' || projectContext.brainProfile === 'story'
}

function mergeRecordsForSequenceValidation(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
) {
  const baseRecord = base && typeof base === 'object' && !Array.isArray(base) ? base : {}
  const patchRecord = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const merged = { ...baseRecord, ...patchRecord }
  if (
    baseRecord.sequence
    && typeof baseRecord.sequence === 'object'
    && !Array.isArray(baseRecord.sequence)
    && patchRecord.sequence
    && typeof patchRecord.sequence === 'object'
    && !Array.isArray(patchRecord.sequence)
  ) {
    merged.sequence = {
      ...(baseRecord.sequence as Record<string, unknown>),
      ...(patchRecord.sequence as Record<string, unknown>),
    }
  }
  return merged
}

function buildSequenceValidationCandidate(input: {
  existing?: Pick<WorldEntity, 'customProperties' | 'metadata'> | null
  changes: Pick<WorldEntityCreateInput, 'customProperties' | 'metadata'>
}) {
  return {
    customProperties: mergeRecordsForSequenceValidation(input.existing?.customProperties, input.changes.customProperties),
    metadata: mergeRecordsForSequenceValidation(input.existing?.metadata, input.changes.metadata),
  }
}

function storySequenceIssueForCandidate(input: {
  opId: string
  entityName: string
  candidate: Pick<WorldEntity, 'customProperties' | 'metadata'>
}): StorySequenceOpIssue | null {
  const completeness = validateWorldSequenceUnitCompleteness(input.candidate)
  if (completeness.complete) return null
  return {
    opId: input.opId,
    entityName: input.entityName,
    missingFields: completeness.missingFields.map((field) => field.replace(/_/g, ' ')),
  }
}

function findStorySequenceOpIssues(input: {
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  if (!projectUsesStrictStorySequence(input.snapshot.projectContext)) return []
  const issues: StorySequenceOpIssue[] = []
  for (const op of input.ops) {
    if (op.op === 'upsert_entity') {
      const existing = op.payload.targetEntityKey
        ? input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
        : null
      const nodeType = op.payload.entity.nodeType ?? existing?.nodeType
      if (nodeType !== 'sequence_unit') continue
      const issue = storySequenceIssueForCandidate({
        opId: op.id,
        entityName: op.payload.entity.name || existing?.name || op.id,
        candidate: buildSequenceValidationCandidate({
          existing,
          changes: op.payload.entity,
        }),
      })
      if (issue) issues.push(issue)
      continue
    }

    if (op.op === 'update_entity') {
      const existing = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
      if (!existing) continue
      const nodeType = op.payload.changes.nodeType ?? existing.nodeType
      if (nodeType !== 'sequence_unit') continue
      const touchesSequence = op.payload.changes.customProperties !== undefined
        || op.payload.changes.metadata !== undefined
        || op.payload.changes.nodeType === 'sequence_unit'
      if (!touchesSequence) continue
      const issue = storySequenceIssueForCandidate({
        opId: op.id,
        entityName: op.payload.changes.name || existing.name || op.id,
        candidate: buildSequenceValidationCandidate({
          existing,
          changes: {
            customProperties: op.payload.changes.customProperties ?? {},
            metadata: op.payload.changes.metadata ?? {},
          },
        }),
      })
      if (issue) issues.push(issue)
    }
  }
  return issues
}

function summarizeStorySequenceOpIssues(issues: StorySequenceOpIssue[]) {
  return issues
    .map((issue) => `${issue.entityName} missing ${issue.missingFields.join(', ')}`)
    .join('; ')
}

function recommendedNextSequenceOrdinal(input: {
  snapshot: WorldPromptSnapshot
  sequenceKey: string
}) {
  const sequence = deriveWorldSequence({
    entities: input.snapshot.worldEntities,
    relationships: input.snapshot.worldRelationships,
  })
  const ordinals = sequence.units
    .filter((unit) => unit.sequenceKey === input.sequenceKey)
    .map((unit) => unit.ordinal)
    .filter((ordinal): ordinal is number => typeof ordinal === 'number' && Number.isFinite(ordinal))
  if (ordinals.length === 0) return 1
  return Math.max(...ordinals) + 1
}

function storySequenceCompletionCandidates(input: {
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  if (!projectUsesStrictStorySequence(input.snapshot.projectContext)) return []
  const candidates: Array<{
    op: PromptToWorldOp
    issue: StorySequenceOpIssue
    entityName: string
    existing: WorldEntity | null
    candidate: Pick<WorldEntity, 'customProperties' | 'metadata'>
  }> = []

  for (const op of input.ops) {
    if (op.op === 'upsert_entity') {
      const existing = op.payload.targetEntityKey
        ? input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
        : null
      const nodeType = op.payload.entity.nodeType ?? existing?.nodeType
      if (nodeType !== 'sequence_unit') continue
      const candidate = buildSequenceValidationCandidate({
        existing,
        changes: op.payload.entity,
      })
      const entityName = op.payload.entity.name || existing?.name || op.id
      const issue = storySequenceIssueForCandidate({
        opId: op.id,
        entityName,
        candidate,
      })
      if (issue) candidates.push({ op, issue, entityName, existing, candidate })
      continue
    }

    if (op.op === 'update_entity') {
      const existing = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
      if (!existing) continue
      const nodeType = op.payload.changes.nodeType ?? existing.nodeType
      if (nodeType !== 'sequence_unit') continue
      const candidate = buildSequenceValidationCandidate({
        existing,
        changes: {
          customProperties: op.payload.changes.customProperties ?? {},
          metadata: op.payload.changes.metadata ?? {},
        },
      })
      const entityName = op.payload.changes.name || existing.name || op.id
      const issue = storySequenceIssueForCandidate({
        opId: op.id,
        entityName,
        candidate,
      })
      if (issue) candidates.push({ op, issue, entityName, existing, candidate })
    }
  }

  return candidates
}

function compactSequenceContextForRepair(snapshot: WorldPromptSnapshot) {
  const sequence = deriveWorldSequence({
    entities: snapshot.worldEntities,
    relationships: snapshot.worldRelationships,
  })
  return {
    unitCount: sequence.units.length,
    units: sequence.units.slice(0, 24).map((unit) => ({
      key: unit.entity.key,
      name: unit.entity.name,
      ordinal: unit.ordinal,
      sequenceKey: unit.sequenceKey,
      synopsis: unit.metadata.synopsis ?? '',
      outcome: unit.metadata.outcome ?? '',
    })),
    relationships: sequence.relationships.slice(0, 32).map((relationship) => ({
      sourceUnitKey: relationship.sourceUnitKey,
      targetUnitKey: relationship.targetUnitKey,
      kind: relationship.kind,
    })),
    gaps: sequence.gaps.slice(0, 16).map((gap) => ({
      kind: gap.kind,
      unitKeys: gap.unitKeys,
      message: gap.message,
    })),
  }
}

async function completeStreamedStorySequenceOp(input: {
  model: string
  prompt: string
  snapshot: WorldPromptSnapshot
  op: PromptToWorldOp
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const candidates = storySequenceCompletionCandidates({
    snapshot: input.snapshot,
    ops: [input.op],
  })
  if (candidates.length === 0) {
    return { op: input.op, issues: [] as StorySequenceOpIssue[] }
  }

  const completionSchema = normalizeStrictJsonSchema(z.toJSONSchema(storySequenceCompletionResponseSchema))
  const response = await runOpenAiResponses({
    model: input.model,
    input: JSON.stringify({
      prompt: input.prompt,
      projectContext: input.snapshot.projectContext,
      sequenceContext: compactSequenceContextForRepair(input.snapshot),
      relevantEntities: input.snapshot.worldEntities
        .filter((entity) => entity.nodeType !== 'sequence_unit')
        .slice(0, 40)
        .map((entity) => ({
          key: entity.key,
          name: entity.name,
          nodeType: entity.nodeType,
          summary: entity.summary,
        })),
      relevantThreads: input.snapshot.worldThreads.slice(0, 12).map((thread) => ({
        key: thread.key,
        title: thread.title,
        summary: thread.summary,
        linkedEntityKeys: thread.linkedEntityKeys,
      })),
      incompleteSequenceOps: candidates.map((candidate) => {
        const existingSequence = candidate.existing ? readWorldSequenceMetadata(candidate.existing) : {}
        const proposedSequence = readWorldSequenceMetadata(candidate.candidate)
        const sequenceKey = proposedSequence.sequenceKey || existingSequence.sequenceKey || 'main'
        return {
          opId: candidate.op.id,
          entityName: candidate.entityName,
          missingFields: candidate.issue.missingFields,
          currentSummary: candidate.op.op === 'upsert_entity'
            ? candidate.op.payload.entity.summary
            : candidate.op.op === 'update_entity'
              ? candidate.op.payload.changes.summary ?? candidate.existing?.summary ?? ''
              : '',
          currentContext: candidate.op.op === 'upsert_entity'
            ? candidate.op.payload.entity.context
            : candidate.op.op === 'update_entity'
              ? candidate.op.payload.changes.context ?? candidate.existing?.context ?? ''
              : '',
          proposedSequence,
          existingSequence,
          recommendedOrdinal: typeof proposedSequence.ordinal === 'number'
            ? proposedSequence.ordinal
            : recommendedNextSequenceOrdinal({
              snapshot: input.snapshot,
              sequenceKey,
            }),
        }
      }),
    }),
    instructions: [
      'You are GraphCore\'s streamed Story sequence repair agent.',
      'Complete only the provided sequence_unit graph operation metadata; do not create additional operations.',
      'Return one completion for every incompleteSequenceOps item, matching opId exactly.',
      'Every completion must include summary, context, and customProperties.sequence-equivalent metadata.',
      'Each sequence must include unitKind, sequenceKey, ordinal, actLabel, synopsis, dramaticQuestion, storyFunction, outcome, at least one consequence, and at least one characterArcDelta.',
      'Consequences must have concrete non-empty cause and effect text.',
      'Character arc deltas must have actorKey, before, pressure, choice, and after. Prefer an existing actor key from relevantEntities; use a clear available protagonist or pressured character.',
      'Do not use entity.summary as a substitute for sequence.synopsis or sequence.outcome.',
      'Set scriptExpansionReady true only after all required sequence fields are present.',
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'streamed_story_sequence_completion',
        schema: completionSchema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-prompt',
      surface: 'streamed-story-sequence-completion',
    },
    store: false,
    timeoutMs: 120_000,
  })
  input.usageRecorder?.record({
    surface: 'streamed-story-sequence-completion',
    model: input.model,
    response,
    metadata: { candidateCount: candidates.length },
  })

  if (!response.response.ok) {
    return {
      op: input.op,
      issues: candidates.map((candidate) => candidate.issue),
    }
  }

  const parsedJson = extractJsonBlock(response.outputText)
  const validated = parsedJson ? storySequenceCompletionResponseSchema.safeParse(parsedJson) : null
  if (!validated?.success) {
    return {
      op: input.op,
      issues: candidates.map((candidate) => candidate.issue),
    }
  }

  const completionByOpId = new Map(validated.data.completions.map((completion) => [completion.opId, completion]))
  for (const candidate of candidates) {
    const completion = completionByOpId.get(candidate.op.id)
    if (!completion) continue
    const sequencePatch = {
      sequence: {
        ...completion.sequence,
        scriptExpansionReady: true,
      },
    }
    if (candidate.op.op === 'upsert_entity') {
      candidate.op.payload.entity.summary = completion.summary.trim() || candidate.op.payload.entity.summary
      candidate.op.payload.entity.context = completion.context.trim() || candidate.op.payload.entity.context
      candidate.op.payload.entity.customProperties = mergeRecordsForSequenceValidation(
        candidate.op.payload.entity.customProperties,
        sequencePatch,
      )
    } else if (candidate.op.op === 'update_entity') {
      if (completion.summary.trim()) candidate.op.payload.changes.summary = completion.summary.trim()
      if (completion.context.trim()) candidate.op.payload.changes.context = completion.context.trim()
      candidate.op.payload.changes.customProperties = mergeRecordsForSequenceValidation(
        candidate.op.payload.changes.customProperties,
        sequencePatch,
      )
    }
  }

  return {
    op: input.op,
    issues: findStorySequenceOpIssues({
      snapshot: input.snapshot,
      ops: [input.op],
    }),
  }
}

async function completeStorySequenceOps(input: {
  model: string
  prompt: string
  snapshot: WorldPromptSnapshot
  retrieval: WorldPromptRetrievalPacket
  ops: PromptToWorldOp[]
  debugEnabled: boolean
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const candidates = storySequenceCompletionCandidates({
    snapshot: input.snapshot,
    ops: input.ops,
  })
  if (candidates.length === 0) {
    return { ops: input.ops, issues: [] as StorySequenceOpIssue[] }
  }

  const completionSchema = normalizeStrictJsonSchema(z.toJSONSchema(storySequenceCompletionResponseSchema))
  const response = await runOpenAiResponses({
    model: input.model,
    input: JSON.stringify({
      prompt: input.prompt,
      projectContext: input.snapshot.projectContext,
      sequenceContext: input.retrieval.sequenceContext,
      relevantEntities: input.retrieval.relevantEntities.slice(0, 24).map((entity) => ({
        key: entity.key,
        name: entity.name,
        nodeType: entity.nodeType,
        summary: entity.summary,
      })),
      relevantRelationships: input.retrieval.relevantRelationships.slice(0, 24).map((relationship) => ({
        key: relationship.key,
        sourceEntityKey: relationship.sourceEntityKey,
        targetEntityKey: relationship.targetEntityKey,
        verb: relationship.verb,
        notes: relationship.notes,
      })),
      relevantThreads: input.retrieval.relevantThreads.slice(0, 12).map((thread) => ({
        key: thread.key,
        title: thread.title,
        summary: thread.summary,
        linkedEntityKeys: thread.linkedEntityKeys,
      })),
      incompleteSequenceOps: candidates.map((candidate) => {
        const existingSequence = candidate.existing ? readWorldSequenceMetadata(candidate.existing) : {}
        const proposedSequence = readWorldSequenceMetadata(candidate.candidate)
        const sequenceKey = proposedSequence.sequenceKey || existingSequence.sequenceKey || 'main'
        return {
          opId: candidate.op.id,
          entityName: candidate.entityName,
          missingFields: candidate.issue.missingFields,
          currentSummary: candidate.op.op === 'upsert_entity'
            ? candidate.op.payload.entity.summary
            : candidate.op.op === 'update_entity'
              ? candidate.op.payload.changes.summary ?? candidate.existing?.summary ?? ''
              : '',
          currentContext: candidate.op.op === 'upsert_entity'
            ? candidate.op.payload.entity.context
            : candidate.op.op === 'update_entity'
              ? candidate.op.payload.changes.context ?? candidate.existing?.context ?? ''
              : '',
          existingSequence,
          proposedSequence,
          recommendedOrdinal: typeof proposedSequence.ordinal === 'number'
            ? proposedSequence.ordinal
            : recommendedNextSequenceOrdinal({
              snapshot: input.snapshot,
              sequenceKey,
            }),
        }
      }),
    }),
    instructions: [
      'You are GraphCore\'s focused Story sequence completion agent.',
      'You do not create new graph operations. You only complete the script-facing metadata for the provided incomplete Story sequence_unit ops.',
      'Return one completion for every incompleteSequenceOps item, matching opId exactly.',
      'Every completion must include a usable chapter summary, context, and customProperties.sequence metadata.',
      'Use the recommendedOrdinal unless the prompt or existing sequence context clearly requires a different ordinal.',
      'For "next chapter" prompts, continue from the latest sequenceContext unit and make the new chapter move plot and character pressure forward.',
      'Each sequence must include a concrete synopsis, dramaticQuestion, storyFunction, outcome, at least one consequence with non-empty cause and effect, and at least one characterArcDelta.',
      'Consequences should express cause/effect in story terms: what happens in this chapter and what it changes next.',
      'Character arc deltas should name the pressured actor and capture before, pressure, choice, and after. Use a known actorKey when possible.',
      'Use known entity keys in affectedEntityKeys, actorKey, and threadKeys when the relevant graph context provides them. Only use empty arrays when no clear graph key exists.',
      'Set scriptExpansionReady true when the sequence has synopsis, dramaticQuestion, outcome, a cause/effect consequence, and a character arc delta.',
      'Do not use entity.summary as a substitute for sequence.synopsis; fill both when useful.',
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'story_sequence_completion',
        schema: completionSchema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-prompt',
      surface: 'story-sequence-completion',
    },
    store: false,
    timeoutMs: 180_000,
  })
  input.usageRecorder?.record({
    surface: 'story-sequence-completion',
    model: input.model,
    response,
    metadata: { candidateCount: candidates.length },
  })

  if (input.debugEnabled) {
    console.log('[world-prompt-debug] story-sequence-completion response-meta', previewJson({
      ok: response.response.ok,
      status: response.response.status,
      requestId: response.response.headers.get('x-request-id'),
      outputText: response.outputText,
      body: response.body,
    }))
  }

  if (!response.response.ok) {
    return {
      ops: input.ops,
      issues: candidates.map((candidate) => candidate.issue),
    }
  }

  const parsedJson = extractJsonBlock(response.outputText)
  if (!parsedJson) {
    return {
      ops: input.ops,
      issues: candidates.map((candidate) => candidate.issue),
    }
  }

  const validated = storySequenceCompletionResponseSchema.safeParse(parsedJson)
  if (!validated.success) {
    if (input.debugEnabled) {
      console.log('[world-prompt-debug] story-sequence-completion schema-failed', previewJson(validated.error.issues))
    }
    return {
      ops: input.ops,
      issues: candidates.map((candidate) => candidate.issue),
    }
  }

  const completionByOpId = new Map(validated.data.completions.map((completion) => [completion.opId, completion]))
  for (const candidate of candidates) {
    const completion = completionByOpId.get(candidate.op.id)
    if (!completion) continue
    const sequencePatch = {
      sequence: {
        ...completion.sequence,
        scriptExpansionReady: true,
      },
    }
    if (candidate.op.op === 'upsert_entity') {
      candidate.op.payload.entity.summary = completion.summary.trim() || candidate.op.payload.entity.summary
      candidate.op.payload.entity.context = completion.context.trim() || candidate.op.payload.entity.context
      candidate.op.payload.entity.customProperties = mergeRecordsForSequenceValidation(
        candidate.op.payload.entity.customProperties,
        sequencePatch,
      )
    } else if (candidate.op.op === 'update_entity') {
      if (completion.summary.trim()) candidate.op.payload.changes.summary = completion.summary.trim()
      if (completion.context.trim()) candidate.op.payload.changes.context = completion.context.trim()
      candidate.op.payload.changes.customProperties = mergeRecordsForSequenceValidation(
        candidate.op.payload.changes.customProperties,
        sequencePatch,
      )
    }
  }

  return {
    ops: input.ops,
    issues: findStorySequenceOpIssues({
      snapshot: input.snapshot,
      ops: input.ops,
    }),
  }
}

function annotateStorySequenceCompletenessGuard(input: {
  op: PromptToWorldOp
  snapshot: WorldPromptSnapshot
  entityName: string
  nodeType: WorldEntity['nodeType']
  existing?: Pick<WorldEntity, 'customProperties' | 'metadata'> | null
  changes: Pick<WorldEntityCreateInput, 'customProperties' | 'metadata'>
}) {
  if (!projectUsesStrictStorySequence(input.snapshot.projectContext) || input.nodeType !== 'sequence_unit') {
    return null
  }
  const issue = storySequenceIssueForCandidate({
    opId: input.op.id,
    entityName: input.entityName,
    candidate: buildSequenceValidationCandidate({
      existing: input.existing ?? null,
      changes: input.changes,
    }),
  })
  if (!issue) {
    if (input.op.op === 'upsert_entity') {
      input.op.payload.entity.customProperties = mergeRecordsForSequenceValidation(
        input.op.payload.entity.customProperties,
        { sequence: { scriptExpansionReady: true } },
      )
    } else if (input.op.op === 'update_entity') {
      input.op.payload.changes.customProperties = mergeRecordsForSequenceValidation(
        input.op.payload.changes.customProperties,
        { sequence: { scriptExpansionReady: true } },
      )
    }
    return null
  }
  input.op.applyMode = 'needs_approval'
  input.op.metadata = {
    ...(input.op.metadata ?? {}),
    storySequenceMissingFields: issue.missingFields,
  }
  return `Incomplete Story sequence_unit (${issue.missingFields.join(', ')})`
}

const WIKI_STRING_LIMITS: Record<string, number> = {
  title: 120,
  logline: 220,
  synopsis: 900,
  genre: 80,
  coreConflict: 360,
  artStyleDescription: 700,
  brandAtlasPrompt: 1400,
  brandAtlasAssetKey: 260,
}
const WIKI_ARRAY_LIMITS: Record<string, { items: number; chars: number }> = {
  themes: { items: 8, chars: 60 },
  toneTags: { items: 8, chars: 40 },
  visualMotifs: { items: 8, chars: 80 },
}

function sanitizeWikiMetadataPatch(raw: unknown, existing?: Record<string, unknown>) {
  const parsed = readWorldWikiPresentationMetadata(raw)
  const next: Record<string, unknown> = {}
  for (const [key, limit] of Object.entries(WIKI_STRING_LIMITS)) {
    const value = typeof parsed[key as keyof typeof parsed] === 'string'
      ? String(parsed[key as keyof typeof parsed]).trim()
      : ''
    if (!value) continue
    if (key === 'title' && value.length < 2) continue
    if (key === 'logline' && value.length < 12) continue
    if (key === 'synopsis' && value.length < 40 && typeof existing?.synopsis === 'string' && existing.synopsis.trim().length >= 40) continue
    next[key] = trimPlannerText(value, limit)
  }
  for (const [key, config] of Object.entries(WIKI_ARRAY_LIMITS)) {
    const values = Array.isArray(parsed[key as keyof typeof parsed])
      ? parsed[key as keyof typeof parsed] as unknown[]
      : []
    const cleaned = Array.from(new Set(values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => trimPlannerText(value.trim(), config.chars))
      .filter(Boolean))).slice(0, config.items)
    if (cleaned.length > 0) {
      next[key] = cleaned
    }
  }
  const colorScheme = parsed.colorScheme && typeof parsed.colorScheme === 'object' && !Array.isArray(parsed.colorScheme)
    ? parsed.colorScheme as Record<string, unknown>
    : {}
  const cleanedColorScheme = Object.entries(colorScheme).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const colorKey = trimPlannerText(key.trim(), 40)
    const color = typeof rawValue === 'string' ? trimPlannerText(rawValue.trim(), 80) : ''
    if (colorKey && color) acc[colorKey] = color
    return acc
  }, {})
  if (Object.keys(cleanedColorScheme).length > 0) {
    next.colorScheme = cleanedColorScheme
  }
  for (const key of ['generatedFromFingerprint', 'updatedByTurnId']) {
    const value = typeof parsed[key as keyof typeof parsed] === 'string'
      ? String(parsed[key as keyof typeof parsed]).trim()
      : ''
    if (value) next[key] = trimPlannerText(value, 260)
  }
  return next
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
  isInitialSeedGeneration?: boolean
}): PromptExecutionClassification {
  const actionableOps = input.ops.filter((op) => op.op !== 'assistant_note')
  const explicitLocalizedCorrection = actionableOps.length > 0 && actionableOps.every((op) => op.op === 'replace_entity')
  const counts = countScopeOps(input.ops, input.snapshot)
  const contradictoryOrLowConfidence = looksContradictoryOrLowConfidence(input.prompt)
  const classificationHint = input.classificationHint ?? null
  const detectedIntent = detectPromptIntent(input.prompt, input.snapshot)
  const shouldAttachDiagnosticFindings = classificationHint === 'graph_diagnosis' || detectedIntent === 'graph_diagnosis'
  const diagnosticFindings = shouldAttachDiagnosticFindings
    ? (input.diagnosticFindings && input.diagnosticFindings.length > 0)
      ? input.diagnosticFindings
      : buildGraphDiagnosticFindings({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
          selectedRootEntityKey: input.selectedRootEntityKey,
        })
    : []
  const answer = stripInternalPlannerDiagnostics(input.answer || input.assistantSummary || '')
  const answerMode = input.answerMode
    ?? (
      classificationHint === 'graph_diagnosis'
      || detectedIntent === 'graph_diagnosis'
        ? 'answer_plus_options'
        : 'answer_plus_options'
    )
  const suggestionDrivenWithActionableOps = Boolean(input.isSuggestionDriven && actionableOps.length > 0)
  const advisorySuggestions = filterSuggestionsForProjectContext(dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...(classificationHint === 'graph_diagnosis' || detectedIntent === 'graph_diagnosis'
      ? buildDiagnosticSuggestionSet(diagnosticFindings, input.snapshot.projectContext)
      : []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
  ]), input.snapshot.projectContext)
  const blockedSuggestions = filterSuggestionsForProjectContext(dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildBlockedSuggestions(input.prompt, input.snapshot),
  ]), input.snapshot.projectContext)

  if (
    input.isInitialSeedGeneration
    && actionableOps.length > 0
    && classificationHint !== 'not_graphable'
    && classificationHint !== 'contradictory_or_low_confidence'
  ) {
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
      suggestions: dedupeSuggestions(input.suggestionCandidates ?? []).slice(0, 4),
      note: '',
      answer,
      answerMode,
      diagnosticFindings,
      preview: null,
    }
  }

  if (
    !suggestionDrivenWithActionableOps
    && (
      classificationHint === 'advisory_question'
      || classificationHint === 'graph_diagnosis'
      || (actionableOps.length === 0 && (detectedIntent === 'advisory_question' || detectedIntent === 'graph_diagnosis'))
    )
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

  if (
    isPlanOnlyPrompt(input.prompt)
    || (!suggestionDrivenWithActionableOps && classificationHint === 'graphable_plan_only')
    || actionableOps.length === 0
    || classificationHint === 'not_graphable'
    || classificationHint === 'contradictory_or_low_confidence'
  ) {
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
      ? filterSuggestionsForProjectContext(dedupeSuggestions([
        ...(input.suggestionCandidates ?? []),
        ...buildThreadAwareSuggestions({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
        }),
      ]), input.snapshot.projectContext)
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

  const stagedSuggestions = filterSuggestionsForProjectContext(dedupeSuggestions([
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
  ]), input.snapshot.projectContext)
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

  if (op.op === 'upsert_relationship') {
    const relationship = op.payload.relationship
    if (op.payload.targetRelationshipKey && snapshot.worldRelationships.some((entry) => entry.key === op.payload.targetRelationshipKey)) {
      return
    }
    if (!relationship.sourceEntityKey || !relationship.targetEntityKey || relationship.sourceEntityKey === relationship.targetEntityKey) {
      return
    }
    const sourceEntity = snapshot.worldEntities.find((entity) => entity.key === relationship.sourceEntityKey) ?? null
    const targetEntity = snapshot.worldEntities.find((entity) => entity.key === relationship.targetEntityKey) ?? null
    if (!sourceEntity || !targetEntity) return
    const equivalent = findEquivalentWorldRelationship(
      snapshot,
      relationship.sourceEntityKey,
      relationship.verb,
      relationship.targetEntityKey,
    )
    if (equivalent) {
      op.payload.targetRelationshipKey = equivalent.key
      return
    }
    const key = buildWorldRelationshipKey(snapshot, relationship.sourceEntityKey, relationship.verb, relationship.targetEntityKey)
    op.payload.targetRelationshipKey = key
    snapshot.worldRelationships = [
      ...snapshot.worldRelationships,
      worldRelationshipSchema.parse({
        id: `projected:${key}`,
        key,
        sourceEntityKey: relationship.sourceEntityKey,
        targetEntityKey: relationship.targetEntityKey,
        verb: relationship.verb,
        direction: relationship.direction,
        strength: relationship.strength,
        confidence: relationship.confidence,
        source: relationship.source ?? 'ai',
        notes: relationship.notes,
        state: relationship.state,
        metadata: {
          ...(relationship.metadata ?? {}),
          projected: true,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ]
  }
}

type AppliedWorldGraphRecords = {
  draft?: { metadata?: Record<string, unknown> }
  worldEntities?: WorldEntity[]
  worldRelationships?: WorldRelationship[]
  worldViews?: WorldView[]
  worldOperators?: WorldOperator[]
  worldResults?: WorldResult[]
  worldGraphConnections?: WorldGraphConnection[]
}

function mergeRecordsByKey<T extends { key: string }>(current: T[], incoming: T[] | undefined) {
  if (!incoming || incoming.length === 0) return current
  const incomingKeys = new Set(incoming.map((entry) => entry.key))
  return [
    ...current.filter((entry) => !incomingKeys.has(entry.key)),
    ...incoming,
  ]
}

function mergeAppliedWorldGraphIntoSnapshot(snapshot: WorldPromptSnapshot, applied: AppliedWorldGraphRecords | undefined) {
  if (!applied) return
  if (applied.draft?.metadata) {
    snapshot.draft.metadata = {
      ...(snapshot.draft.metadata ?? {}),
      ...applied.draft.metadata,
    }
  }
  snapshot.worldEntities = mergeRecordsByKey(snapshot.worldEntities, applied.worldEntities)
  snapshot.worldRelationships = mergeRecordsByKey(snapshot.worldRelationships, applied.worldRelationships)
  snapshot.worldViews = mergeRecordsByKey(snapshot.worldViews, applied.worldViews)
  snapshot.worldOperators = mergeRecordsByKey(snapshot.worldOperators, applied.worldOperators)
  snapshot.worldResults = mergeRecordsByKey(snapshot.worldResults, applied.worldResults)
  snapshot.worldGraphConnections = mergeRecordsByKey(snapshot.worldGraphConnections, applied.worldGraphConnections)
}

async function ensureLinkedDefinition(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entity: WorldEntityCreateInput
  force?: boolean
}) {
  const definitionKind = determineDefinitionKind(input.entity.nodeType)
  const shouldForceLink = input.force === true || worldEntityRequiresLinkedDefinition(input.entity.nodeType)
  if (!definitionKind || (input.entity.ensureLinkedDefinition === false && !shouldForceLink)) {
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

  const components = applyVisualDescriptionToDefinitionComponents(
    buildDefaultDefinitionComponents(definitionKind),
    definitionKind,
    fallbackVisualDescriptionFromEntity(input.entity as unknown as Record<string, unknown>),
  )
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

async function ensureAppliedEntityLinkedDefinition(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entity: WorldEntity
}) {
  if (!worldEntityRequiresLinkedDefinition(input.entity.nodeType)) {
    return {
      entity: input.entity,
      createdDefinition: null,
    }
  }

  let entity = input.entity
  let createdDefinition: Record<string, unknown> | null = null
  if (!entity.linkedDefinitionKey) {
    const ensuredDefinition = await ensureLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      force: true,
      entity: {
        name: entity.name,
        summary: entity.summary,
        context: entity.context,
        nodeType: entity.nodeType,
        aliases: entity.aliases,
        tags: entity.tags,
        status: entity.status,
        thumbnailAssetKey: entity.thumbnailAssetKey,
        linkedDefinitionKey: entity.linkedDefinitionKey,
        source: entity.source,
        customProperties: entity.customProperties,
        metadata: entity.metadata,
        ensureLinkedDefinition: true,
      },
    })
    createdDefinition = ensuredDefinition.createdDefinition
    if (ensuredDefinition.linkedDefinitionKey) {
      const updateResponse = await input.client
        .from('world_entities')
        .update({ linked_definition_key: ensuredDefinition.linkedDefinitionKey })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', entity.key)
        .select(WORLD_ENTITY_SELECT)
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      entity = mapWorldEntityRow(updateResponse.data as WorldEntityRow)
    }
  }

  await syncLinkedDefinitionFromWorldEntity({
    client: input.client,
    draftId: input.snapshot.draft.id,
    entity,
  })
  input.snapshot.worldEntities = [
    ...input.snapshot.worldEntities.filter((entry) => entry.key !== entity.key),
    entity,
  ]
  return {
    entity,
    createdDefinition,
  }
}

async function syncLinkedDefinitionFromWorldEntity(input: {
  client: SupabaseClient
  draftId: string
  entity: Pick<WorldEntity, 'nodeType' | 'name' | 'summary' | 'context' | 'thumbnailAssetKey' | 'linkedDefinitionKey' | 'tags' | 'customProperties' | 'metadata'>
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
    .select('id, key, kind')
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  if (!response.data?.id) return
  await syncLinkedDefinitionVisualPrompt({
    client: input.client,
    definitionId: response.data.id,
    definitionKind: expectedKind,
    visualDescription: fallbackVisualDescriptionFromEntity(input.entity as unknown as Record<string, unknown>),
  })
}

function visualPromptComponentTypeForDefinitionKind(definitionKind: DefinitionBase['kind']) {
  if (definitionKind === 'environment') return 'environment_render_binding'
  if (definitionKind === 'character' || definitionKind === 'item' || definitionKind === 'group' || definitionKind === 'concept' || definitionKind === 'event') {
    return 'render_3d_binding'
  }
  return null
}

function mergeVisualDescriptionIntoDefinitionComponentConfig(componentType: string, config: Record<string, unknown>, visualDescription: string) {
  const nextConfig = { ...config }
  if (componentType === 'environment_render_binding') {
    if (!normalizeWorldEntityVisualDescription(nextConfig.generationPrompt)) {
      nextConfig.generationPrompt = visualDescription
    }
    return nextConfig
  }
  if (componentType === 'render_3d_binding') {
    if (!normalizeWorldEntityVisualDescription(nextConfig.conceptPrompt)) {
      nextConfig.conceptPrompt = visualDescription
    }
    if (!normalizeWorldEntityVisualDescription(nextConfig.generationPrompt)) {
      nextConfig.generationPrompt = visualDescription
    }
  }
  return nextConfig
}

function applyVisualDescriptionToDefinitionComponents(
  components: DefinitionBase['components'],
  definitionKind: DefinitionBase['kind'],
  visualDescription: string,
) {
  const componentType = visualPromptComponentTypeForDefinitionKind(definitionKind)
  if (!componentType || !visualDescription) return components
  let found = false
  const nextComponents = components.map((component) => {
    if (component.type !== componentType) return component
    found = true
    return {
      ...component,
      config: mergeVisualDescriptionIntoDefinitionComponentConfig(
        componentType,
        isRecord(component.config) ? component.config : {},
        visualDescription,
      ),
    } as DefinitionBase['components'][number]
  })
  if (found) return nextComponents as DefinitionBase['components']
  const fallbackComponent = componentType === 'environment_render_binding'
    ? {
      type: 'environment_render_binding',
      config: {
        primaryMeshAssetKey: null,
        previewImageAssetKey: null,
        lightingProfile: '',
        generationPrompt: visualDescription,
        generationStyle: null,
      },
    }
    : {
      type: 'render_3d_binding',
      config: {
        primaryMeshAssetKey: null,
        previewImageAssetKey: null,
        conceptPrompt: visualDescription,
        generationPrompt: visualDescription,
        generationStyle: null,
      },
    }
  return [...nextComponents, fallbackComponent as DefinitionBase['components'][number]] as DefinitionBase['components']
}

async function syncLinkedDefinitionVisualPrompt(input: {
  client: SupabaseClient
  definitionId: string
  definitionKind: DefinitionBase['kind']
  visualDescription: string
}) {
  const componentType = visualPromptComponentTypeForDefinitionKind(input.definitionKind)
  const visualDescription = normalizeWorldEntityVisualDescription(input.visualDescription)
  if (!componentType || !visualDescription) return
  const response = await input.client
    .from('project_definition_components')
    .select('id, config')
    .eq('definition_id', input.definitionId)
    .eq('component_type', componentType)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  const currentConfig = isRecord(response.data?.config) ? response.data.config : {}
  const nextConfig = mergeVisualDescriptionIntoDefinitionComponentConfig(componentType, currentConfig, visualDescription)
  if (JSON.stringify(nextConfig) === JSON.stringify(currentConfig)) return
  if (response.data?.id) {
    const updateResponse = await input.client
      .from('project_definition_components')
      .update({ config: nextConfig })
      .eq('id', response.data.id)
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    return
  }
  const insertResponse = await input.client
    .from('project_definition_components')
    .insert({
      definition_id: input.definitionId,
      component_type: componentType,
      config: nextConfig,
    })
  if (insertResponse.error) throw new Error(insertResponse.error.message)
}

const INITIAL_SEED_AUTO_ICON_PRIORITY: Partial<Record<WorldEntity['nodeType'], number>> = {
  actor: 0,
  place: 1,
  group: 2,
  object: 3,
  concept: 4,
  sequence_unit: 5,
}

function canAutoGenerateIconForNodeType(nodeType: WorldEntity['nodeType']) {
  return Object.prototype.hasOwnProperty.call(INITIAL_SEED_AUTO_ICON_PRIORITY, nodeType)
}

async function loadDefinitionIconAssetKeys(input: {
  client: SupabaseClient
  draftId: string
}) {
  const response = await input.client
    .from('project_definitions')
    .select('key, icon_asset_key')
    .eq('draft_id', input.draftId)
  if (response.error) throw new Error(response.error.message)
  return new Map((response.data ?? []).map((definition: { key: string; icon_asset_key: string | null }) => [
    definition.key,
    definition.icon_asset_key,
  ]))
}

async function enqueueInitialSeedEntityIconBatch(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  job: WorldPromptGenerationJob
  projectContext: ProjectContext
  trigger: string
}) {
  const activeJobResponse = await input.client
    .from('world_entity_icon_generation_jobs')
    .select('id, status, metadata')
    .eq('draft_id', input.snapshot.draft.id)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (activeJobResponse.error) throw new Error(activeJobResponse.error.message)
  if (activeJobResponse.data?.id) {
    return {
      jobId: String(activeJobResponse.data.id),
      candidates: [] as IconGenerationCandidate[],
      skippedCount: 0,
      reused: true,
    }
  }

  const definitionIconByKey = await loadDefinitionIconAssetKeys({
    client: input.client,
    draftId: input.snapshot.draft.id,
  })
  const allCandidates = input.snapshot.worldEntities
    .filter((entity) => entity.status !== 'archived')
    .filter((entity) => canAutoGenerateIconForNodeType(entity.nodeType))
    .filter((entity) => {
      const linkedDefinitionIcon = entity.linkedDefinitionKey
        ? definitionIconByKey.get(entity.linkedDefinitionKey) ?? null
        : null
      return !entity.thumbnailAssetKey && !linkedDefinitionIcon
    })
    .sort((left, right) => {
      const leftPriority = INITIAL_SEED_AUTO_ICON_PRIORITY[left.nodeType] ?? 99
      const rightPriority = INITIAL_SEED_AUTO_ICON_PRIORITY[right.nodeType] ?? 99
      return leftPriority - rightPriority || left.name.localeCompare(right.name)
    })

  const candidates: IconGenerationCandidate[] = allCandidates.slice(0, 16).map((entity, index) => ({
    entityKey: entity.key,
    linkedDefinitionKey: entity.linkedDefinitionKey,
    name: entity.name,
    nodeType: entity.nodeType,
    summary: entity.summary || entity.context || '',
    visualPrompt: fallbackVisualDescriptionFromEntity(entity as unknown as Record<string, unknown>),
    orderIndex: index,
  }))
  if (candidates.length === 0) {
    return {
      jobId: null,
      candidates,
      skippedCount: 0,
      reused: false,
    }
  }

  const grid = resolveIconGridSize(candidates.length)
  const insertResponse = await input.client
    .from('world_entity_icon_generation_jobs')
    .insert({
      project_id: input.snapshot.project.id,
      draft_id: input.snapshot.draft.id,
      status: 'queued',
      provider: 'fal',
      model: 'openai/gpt-image-2',
      grid_rows: grid.rows,
      grid_cols: grid.cols,
      entity_keys: candidates.map((candidate) => candidate.entityKey),
      requested_by: null,
      metadata: {
        candidates,
        skippedCount: Math.max(0, allCandidates.length - candidates.length),
        artStyle: {
          artStyleName: input.projectContext.artStylePreset || 'cohesive project art style',
          artStyleDescription: input.projectContext.artStyleDescription || 'cohesive, polished, high-quality worldbuilding icon art',
        },
        runtime: 'fly',
        trigger: input.trigger,
        generationJobId: input.job.id,
        generationTurnId: input.job.turnId,
        queuedBy: 'initial_seed_sequence_boundary',
        queuedAt: new Date().toISOString(),
      },
    })
    .select('id')
    .single()
  if (insertResponse.error) throw new Error(insertResponse.error.message)
  return {
    jobId: String(insertResponse.data.id),
    candidates,
    skippedCount: Math.max(0, allCandidates.length - candidates.length),
    reused: false,
  }
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
        : projectContext.projectType === 'app'
          ? 'mobile app / product graph'
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
        : projectContext.brainProfile === 'app'
        ? 'Bias generation toward product promise, personas, UX flows, screens, components, data models, actions, APIs, capabilities, design systems, and implementation towers.'
        : 'Bias generation toward cast, factions, places, lore, conflicts, prophecy, secrets, authored chapters, character development, and cause/effect story progression.'
  return [
    `Project type: ${projectLabel}.`,
    `Project subtype: ${subtypeLabel}.`,
    `Brain profile: ${projectContext.brainProfile}.`,
    `Art style preset: ${styleLabel}.`,
    styleNotes ? `Art style notes: ${styleNotes}.` : null,
    brainGuidance,
  ].filter(Boolean).join(' ')
}

function brainProfileForSubtype(projectSubtype: ProjectSubtype): ProjectContext['brainProfile'] {
  if ([
    'action_rpg',
    'narrative_adventure',
    'narrative_rpg_mobile',
    'strategy_builder',
    'survival_craft',
    'shooter_combat',
    'social_sim',
    'open_world_sandbox',
    'platformer_metroidvania',
    'horror_mystery',
  ].includes(projectSubtype)) return 'game'
  if ([
    'campaign_world',
    'product_storytelling',
    'mascot_ip',
    'brand_education_explainer',
  ].includes(projectSubtype)) return 'brand'
  if ([
    'creator_organic',
    'direct_response_ad',
    'faceless_explainer_demo',
    'serialized_social_drama',
  ].includes(projectSubtype)) return 'ugc'
  if ([
    'ai_utility_wrapper',
    'mascot_daily_ritual',
    'content_generator',
  ].includes(projectSubtype)) return 'app'
  return 'story'
}

function shouldInferProjectContext(projectContext: WorldPromptSnapshot['projectContext']) {
  return !projectContext?.onboardingCompletedAt
}

async function persistInferredProjectContext(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema> | null | undefined
}) {
  if (!input.inference || !shouldInferProjectContext(input.snapshot.projectContext)) {
    return input.snapshot.projectContext ?? null
  }
  const nextProjectContext = projectContextSchema.parse({
    projectType: input.inference.projectType,
    projectSubtype: input.inference.projectSubtype,
    brainProfile: brainProfileForSubtype(input.inference.projectSubtype),
    artStylePreset: input.inference.artStylePreset || 'live_action_cinematic',
    artStyleDescription: input.inference.artStyleDescription ?? '',
    onboardingCompletedAt: new Date().toISOString(),
    onboardingVersion: '2026-04-30-input-first-inferred-v1',
    source: 'onboarding',
  })
  const nextMetadata = {
    ...(input.snapshot.draft.metadata ?? {}),
    projectContext: nextProjectContext,
  }
  const response = await input.client
    .from('project_drafts')
    .update({ metadata: nextMetadata })
    .eq('id', input.snapshot.draft.id)
    .select('metadata')
    .single()
  if (response.error) throw new Error(response.error.message)
  input.snapshot.draft.metadata = response.data?.metadata ?? nextMetadata
  input.snapshot.projectContext = nextProjectContext
  return nextProjectContext
}

function buildProjectContextSuggestionSeed(projectContext: WorldPromptSnapshot['projectContext']) {
  if (!projectContext) {
    return {
      primaryLabel: 'Add Chapter Progression',
      primaryPrompt: 'Continue this story by adding the next authored chapter as a sequence beat with a synopsis, outcome, cause/effect consequence, and links to the characters or places it changes.',
      primarySummary: 'Add a story chapter that moves plot and character development forward.',
      secondaryLabel: 'Bridge Chapter Consequences',
      secondaryPrompt: 'Review the current story flow and add the missing cause/effect bridge between adjacent chapters or story beats.',
      secondarySummary: 'Strengthen the authored sequence by connecting one chapter outcome to the next chapter pressure.',
      repairLabel: 'Add Story Foundation',
      repairPrompt: 'Start this story with a protagonist, a central conflict, and the first authored chapter sequence beat with a clear outcome and consequence.',
      repairSummary: 'Turn the vague request into a usable story foundation and first chapter.',
    }
  }

  switch (projectContext.brainProfile) {
    case 'app':
      return {
        primaryLabel: 'Map Core UX Flow',
        primaryPrompt: 'Continue this app graph by adding the next user_flow, screen, component, data_model, action, and api_endpoint nodes needed for the core app loop.',
        primarySummary: 'Expand the app as a product/UX system instead of story canon.',
        secondaryLabel: 'Add App Contracts',
        secondaryPrompt: 'Continue this app graph by adding implementation-ready data models, actions, API endpoints, capabilities, design-system tokens, towers, and code-file plan nodes.',
        secondarySummary: 'Prepare the app graph for preview and later Expo code generation.',
        repairLabel: 'Add App Foundation',
        repairPrompt: 'Start this app graph with an app identity, target persona, business goal, core feature, onboarding/user flow, key screens, data model, action, API endpoint, capability, design system, tower, and code-file plan.',
        repairSummary: 'Turn the vague request into a structured app product graph.',
      }
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
        primaryLabel: 'Add Chapter Progression',
        primaryPrompt: 'Continue this story by adding the next authored chapter as a sequence beat with a synopsis, outcome, cause/effect consequence, and links to the characters or places it changes.',
        primarySummary: 'Add a story chapter that moves plot and character development forward.',
        secondaryLabel: 'Bridge Chapter Consequences',
        secondaryPrompt: 'Review the current story flow and add the missing cause/effect bridge between adjacent chapters or story beats.',
        secondarySummary: 'Strengthen the authored sequence by connecting one chapter outcome to the next chapter pressure.',
        repairLabel: 'Add Story Foundation',
        repairPrompt: 'Start this story with a protagonist, a central conflict, and the first authored chapter sequence beat with a clear outcome and consequence.',
        repairSummary: 'Turn the vague request into a usable story foundation and first chapter.',
      }
  }
}

const PLANNER_PROGRESS_PHASES: Array<WorldPromptPlannerProgress['phase']> = [
  'reading_context',
  'analyzing_graph',
  'planning_manifest',
  'planning_entities',
  'generating_entity',
  'generating_sequence_unit',
  'planning_relationships',
  'mapping_relationships',
  'assembling_first_wave',
  'finalizing_world',
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
    case 'planning_manifest':
      return 'Breaking the world build into concrete work items.'
    case 'generating_entity':
      return 'Creating the next world entity batch.'
    case 'generating_sequence_unit':
      return 'Writing the next authored sequence unit.'
    case 'planning_relationships':
      return 'Mapping relationships, tensions, and structural links.'
    case 'mapping_relationships':
      return 'Creating relationship links between generated records.'
    case 'assembling_first_wave':
      return 'Preparing the graph change list.'
    case 'finalizing_world':
      return 'Finalizing threads, wiki metadata, and suggestions.'
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
    case 'assembling_first_wave':
      return input.promptIntentHint === 'advisory_question' || input.promptIntentHint === 'graph_diagnosis'
        ? 'Preparing a clear answer and useful next-step options.'
        : defaultPlannerProgressMessage(phase)
    case 'finalizing_plan':
      return input.promptIntentHint === 'advisory_question' || input.promptIntentHint === 'graph_diagnosis'
        ? 'Finalizing the answer and suggested next moves.'
        : defaultPlannerProgressMessage(phase)
    default:
      return defaultPlannerProgressMessage(phase)
  }
}

function scheduledPlannerProgressPhasesForMode(mode: PlannerMode) {
  if (mode === 'advisory_diagnosis') {
    return [
      { phase: 'analyzing_graph', delayMs: 1200 },
      { phase: 'planning_entities', delayMs: 3200 },
      { phase: 'planning_relationships', delayMs: 6200 },
    ] as const
  }
  return [
    { phase: 'analyzing_graph', delayMs: 1200 },
    { phase: 'planning_entities', delayMs: 3200 },
    { phase: 'planning_relationships', delayMs: 6200 },
    { phase: 'assembling_first_wave', delayMs: 9800 },
  ] as const
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
    case 'update_world_wiki_metadata':
      return op.payload.target === 'view'
        ? `Update wiki page metadata ${op.payload.targetViewKey ?? ''}`.trim()
        : 'Update world wiki overview'
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
        'For every new or substantially updated entity, include entity.metadata.visualDescription: a concise visual image prompt under 280 characters. It should describe visible design only, with no lore exposition, project names, internal IDs, GraphCore wording, or node-type labels.',
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
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const projectContextGuidance = describeProjectContextForPlanner(input.payload.snapshot.projectContext)
  const promptStrategy = getWorldPromptStrategy(input.payload.snapshot.projectContext)
  const shouldInferContext = shouldInferProjectContext(input.payload.snapshot.projectContext)
  const sourceContext = input.payload.sourceContext ?? null
  const isInitialSeedGeneration = input.payload.initialSeedMode === 'generate_skeleton'
  const initialSeedInference = input.payload.initialSeedContext?.inference ?? null
  const initialSeedProfile = isInitialSeedGeneration
    ? getWorldSeedSkeletonProfile((initialSeedInference?.projectSubtype ?? input.payload.snapshot.projectContext?.projectSubtype ?? 'feature_film') as ProjectSubtype)
    : null
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
  const targetedWikiMetadataPlan = buildTargetedWikiMetadataPlan({
    prompt: input.payload.prompt,
    snapshot: input.payload.snapshot,
  })
  if (targetedWikiMetadataPlan) {
    await input.onPlannerProgress?.({
      phase: 'reading_context',
      message: 'Reading targeted wiki metadata context.',
      sequence: 1,
    })
    const plannerOutline = buildPlannerOutline(targetedWikiMetadataPlan)
    await input.onPlannerProgress?.({
      phase: 'finalizing_plan',
      message: 'Prepared the targeted wiki metadata update.',
      sequence: 12,
      done: true,
    }, plannerOutline.length > 0 ? { plannerOutline } : undefined)
    return {
      plan: targetedWikiMetadataPlan,
      plannerFailure: null,
      retrievalPacket: buildTargetedWikiMetadataRetrievalPacket({
        prompt: input.payload.prompt,
        snapshot: input.payload.snapshot,
        summaryMemory: input.summaryMemory,
        sessionMemoryState: input.sessionMemoryState,
        recentMessages: input.recentMessages,
        retrievalIntent,
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedThreadKey: input.payload.selectedThreadKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedSuggestionId: input.payload.selectedSuggestionId,
      }),
    }
  }
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
  const basePlannerResponseSchema = normalizeStrictJsonSchema(z.toJSONSchema(plannerRequestSchema))
  const plannerResponseSchema = projectUsesStrictStorySequence(input.payload.snapshot.projectContext)
    ? withStorySequencePlannerJsonSchema(basePlannerResponseSchema)
    : basePlannerResponseSchema
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
    isInitialSeedGeneration
      ? 'This is INITIAL WORLD SEED GENERATION, not a normal compact modification turn. Generate the complete first skeleton in one response using the provided seed skeleton profile. Do not stage the core skeleton into follow-up suggestions.'
      : null,
    shouldInferContext
      ? 'This is the first project creation turn. Before planning graph mutations, infer the project type, subtype, and broad art direction from the user prompt and any sourceContext. Fill projectContextInference with your best classification. Do not ask the user to classify the project.'
      : 'If projectContextInference is present, keep it consistent with the existing project context unless the user explicitly reframes the project.',
    sourceContext
      ? 'A sourceContext object is included. Treat extractedText as source material for world generation, while treating the user prompt as steering for how to use that source.'
      : null,
    isInitialSeedGeneration && initialSeedProfile
      ? [
        'The skeleton profile is mandatory. Satisfy every required category with concrete canon-ready graph nodes.',
        'Create update_world_wiki_metadata for the generated content title, logline, synopsis, tone, genre, specific art style description, brand atlas prompt, and app color scheme when relevant before or alongside entity creation.',
        'Create the requested sequence_unit skeleton as ordered authored progression, using sequence relationships such as precedes, causes, complicates, and pays_off.',
        'Create enough relationships to make the graph feel connected immediately: cast/location/faction/object/concept links plus sequence links.',
        'Assistant notes should be concise operational notes suitable for a visible progress log, not private chain-of-thought.',
      ].join(' ')
      : null,
    'Return compact JSON only that matches the provided schema exactly.',
    'You can either plan graph mutations or answer graph-aware advisory questions.',
    `Planner mode: ${plannerMode}.`,
    `Return only the fields present in the schema for this mode. Do not invent omitted top-level keys.`,
    'Allowed operations for wave1Ops: upsert_entity, update_entity, replace_entity, upsert_relationship, update_relationship, create_derived_result, queue_image_generation, queue_cinematic_generation, update_world_wiki_metadata, assistant_note.',
    'Favor additive graph growth.',
    ...promptStrategy.plannerGuidance,
    'Every upsert_entity must include entity.metadata.visualDescription: a compact visual prompt for the subject, visible scene, or mobile UI state. Do not include lore exposition, product/project names, schema labels, node-type labels, IDs, or GraphCore wording in visualDescription.',
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
    'A compact worldAtlas is included for orientation. Use it to recognize likely existing nodes even when the user misspells names or uses aliases, but do not treat atlas rows as full lore context.',
    'Use relevantEntities, relevantRelationships, relevantThreads, recentMessages, and sessionMemory for rich canon decisions. Prefer explicit prompt matches and selected focus over stale older memory.',
    'If retrieval diagnostics show ambiguity candidates and the prompt requires one specific existing node, choose only when the intended node is obvious; otherwise ask a concise clarification instead of mutating the wrong canon.',
    'Default to applyMode auto. Favor additive graph growth and avoid proposing semantic rewrites that would require human confirmation.',
    'When the user explicitly names entities, places, groups, concepts, or events, preserve those proper nouns verbatim and create graph nodes for newly introduced names instead of inventing replacements.',
    'Treat all world names and graph content as original project canon by default. Do not speculate that they are borrowed from or mapped to external IP unless the user explicitly asks for comparison or inspiration analysis.',
    'If the prompt says something like "kingdom called X", "character called Y", "faction called Z", or "king called Q", infer the obvious world entity types directly.',
    'Only use replace_entity when the user explicitly says a node is wrong, should be a different type, should be corrected, or should be replaced.',
    'If the prompt introduces a new proper noun plus extra lore, prefer creating the new node and updating context/relationships around existing nodes instead of replacing an existing node.',
    'For a simple direct creation prompt, wave1Ops should contain the named entities and the most obvious relationships before proposing any optional follow-up suggestions.',
    'When creating or updating event nodes, preserve any stated chronology as graph canon. Use event customProperties.timeline for display hints such as timelineKey, timeLabel, era, sequenceHint, durationLabel, and certainty.',
    'When the prompt states or strongly implies that one event happens before, after, during, overlaps, or causes another event, create an event-to-event upsert_relationship with relationship.metadata.temporal = { kind, timelineKey: "canon", certainty, impliesChronology }.',
    'Prefer relative temporal relationships over invented dates. Do not invent exact dates, years, or total ordering unless the user provides them.',
    'Leave event chronology floating, ask a concise clarification, or offer a concrete next suggestion when event order is ambiguous.',
    'Existing temporal relationship metadata appears in retrieval.relevantRelationships and retrieval.timelineContext. Preserve that chronology unless the user explicitly asks for a correction.',
    'Authored story progression is separate from event chronology. Use sequence_unit nodes for chapters, episodes, acts, plot outlines, story beats, missions, campaign moments, and UGC beats.',
    'For Story projects, prompts about chapters, episodes, acts, plot progression, outlines, sequential stories, or story flow should create or update sequence_unit nodes first. Use event nodes only for diegetic happenings inside those chapters.',
    'For sequence_unit customProperties.sequence, include unitKind, sequenceKey, ordinal, actLabel when relevant, synopsis, dramaticQuestion, storyFunction, outcome, consequences, characterArcDeltas, openLoops, resolvedLoops, and scriptExpansionReady.',
    'A Story sequence_unit must have a compact synopsis, dramaticQuestion, outcome, at least one cause/effect consequence, and at least one characterArcDelta. Consequences must explain why the chapter exists and how it moves plot, stakes, relationships, world state, or character development forward.',
    'Use sequence_unit-to-sequence_unit relationships with verbs precedes, causes, complicates, or pays_off to express authored story order and causal progression. Do not put relationship.metadata.temporal on sequence_unit links.',
    'Link sequence_unit nodes to actors, places, objects, events, concepts, and threads when they matter. Useful verbs include features, changes, pressures, reveals, set_in, uses, depicts, contains, reframes, and reveals_lore.',
    'For Game, Brand, and UGC projects, sequence_unit is allowed but label it appropriately: mission/quest, campaign_moment, or ugc_beat. Keep validation lighter than Story chapters unless the user asks for story-style structure.',
    'For App projects, do not use sequence_unit for UX flows. Use user_flow nodes for onboarding, first generation, daily return, paywall, sharing, and export flows.',
    'For App projects, use app graph node types for product structure: app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, and code_file.',
    'For App projects, put app-specific structured fields under customProperties.app and connect screens, components, data, actions, APIs, capabilities, towers, and code files with app verbs such as contains, reads, writes, emits, calls, transitions_to, gated_by, styled_by, requires_capability, owned_by_tower, and implemented_as.',
    'Do not queue cinematic generation just because a sequence_unit is created. Set sequence.scriptExpansionReady when the chapter has enough synopsis, outcome, linked entities, and consequences to support a later scene/shot expansion.',
    'Existing authored sequence state appears in retrieval.sequenceContext. Preserve ordinal and cause/effect bridges unless the user explicitly asks for a correction.',
    'For wiki/presentation readiness, use entity customProperties.wiki or metadata.wiki for entity display hints such as roleLabel, shortSummary, and wikiSections.',
    'For project-wide wiki presentation, use update_world_wiki_metadata with target "project" and compact metadata fields: title, logline, synopsis, genre, themes, toneTags, coreConflict, visualMotifs, artStyleDescription, brandAtlasPrompt, and colorScheme. The title is the generated in-world/content title, not the GraphCore project name. Use target "view" with targetViewKey only for custom wiki page metadata.',
    'artStyleDescription is the project-specific visual direction beyond the broad preset. brandAtlasPrompt is a visual-only prompt for one cohesive brand/world atlas image. For app projects, colorScheme should include at least primary, secondary, and tertiary colors.',
    'If the user asks to set, define, create, or store a specific project wiki metadata field such as artStyleDescription, brandAtlasPrompt, or colorScheme, treat it as graphable_direct and emit update_world_wiki_metadata as the primary wave1Op. Do not answer with graph diagnostics, weak-context findings, thread actions, or unrelated entity expansions for that metadata-only task.',
    'For App color-scheme metadata tasks, write metadata.colorScheme with at least primary, secondary, and tertiary string values, preferably hex plus a short semantic label. Derive colors from the app promise, app entities, design_system nodes, existing artStyleDescription, and visual motifs; do not create graph nodes unless the user explicitly asks.',
    'Do not add a separate planner pass for wiki writing. Include update_world_wiki_metadata only in the same wave1Ops response when retrieval.wikiContext.updatePolicy is "targeted" or "opportunistic".',
    'When retrieval.wikiContext.updatePolicy is "none", do not rewrite project title, logline, synopsis, or tone metadata unless the user explicitly asks in this prompt.',
    'When updating project-wide wiki metadata, set generatedFromFingerprint to retrieval.wikiContext.fingerprint when provided. Keep text concise: one-sentence logline, compact synopsis, short tags, concise visual direction, and a reusable visual-only atlas prompt.',
    'When a direct world-building turn creates or substantially updates canon, include concise wiki-ready summaries where they naturally follow from the canon. Do not add long encyclopedia prose on every turn.',
    'Prefer one-sentence loglines, compact synopsis text, role labels, story arc summaries, and event scene summaries over invented dates or unrelated lore.',
    'retrieval.wikiContext lists populated wiki sections and gaps. If the user asks to fill a gap, update only the targeted wiki metadata or add compact graph canon needed for that section.',
    'If the user asks for a custom wiki page/view, return concrete suggestions with preferredViewKind "wiki_custom" and source entity/thread targets; do not create transient turn-lens views.',
    isSuggestionDriven
      ? 'The user selected one of your prior suggestions. Treat this as a request to execute that selected direction now; do not answer by repeating the same options again unless the selected suggestion is explicitly plan-only.'
      : null,
    isSuggestionDriven
      ? 'For selected suggestions, do not describe the turn as "previewing" unless you are intentionally returning a non-applied plan-only answer. In normal selected-suggestion turns, produce concrete wave1Ops that can be applied now.'
      : null,
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
    'Suggestion ideas should be concrete and project-specific, not generic categories, and should never just paraphrase or repeat the user prompt.',
    projectContextIsApp(input.payload.snapshot.projectContext)
      ? 'For App projects, suggestionCandidates must be app/product moves only: deepen UX flows, screens, components, data/API contracts, capabilities, design system, paywall, towers, or code-file plans. Do not suggest story moves such as threats, villains, protagonists, chapters, lore layers, factions, kingdoms, inciting events, or main conflict beats.'
      : 'For non-App projects, keep suggestionCandidates aligned to the project type: Story may use chapters/cast/conflict, Game may use playable regions/progression, Brand may use symbols/campaign moments, and UGC may use hooks/proof/payoff beats.',
    ...plannerModeInstructions({
      mode: plannerMode,
      isSuggestionDriven,
    }),
    projectContextGuidance ? `Project guidance: ${projectContextGuidance}` : null,
    shouldInferContext
      ? 'Valid project type/subtype pairs: story = feature_film, tv_streaming_series, short_film, shortform_series, animated_story; game = action_rpg, narrative_adventure, narrative_rpg_mobile, strategy_builder, survival_craft, shooter_combat, social_sim, open_world_sandbox, platformer_metroidvania, horror_mystery; brand = campaign_world, product_storytelling, mascot_ip, brand_education_explainer; ugc = creator_organic, direct_response_ad, faceless_explainer_demo, serialized_social_drama; app = ai_utility_wrapper, mascot_daily_ritual, content_generator.'
      : null,
    'Keep operations compact and high-signal.',
    isInitialSeedGeneration
      ? 'For this initial seed only, "compact" means no filler and no duplicate canon; it does not mean a tiny first wave. Build the full subtype skeleton requested by the profile.'
      : null,
  ].filter(Boolean).join('\n')

  const prompt = JSON.stringify({
    plannerMode,
    initialSeed: isInitialSeedGeneration
      ? {
          mode: input.payload.initialSeedMode,
          inference: initialSeedInference,
          selectedArtStylePreset: input.payload.initialSeedContext?.selectedArtStylePreset ?? input.payload.snapshot.projectContext?.artStylePreset ?? null,
          selectedArtStyleDescription: input.payload.initialSeedContext?.selectedArtStyleDescription ?? input.payload.snapshot.projectContext?.artStyleDescription ?? '',
          skeletonProfile: initialSeedProfile,
        }
      : null,
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
    selectedSuggestion: input.selectedSuggestion
      ? {
          id: input.selectedSuggestion.id,
          label: input.selectedSuggestion.label,
          prompt: input.selectedSuggestion.prompt,
          kind: input.selectedSuggestion.kind,
          summary: input.selectedSuggestion.summary,
          uiKind: input.selectedSuggestion.uiKind,
          executionMode: input.selectedSuggestion.executionMode,
          actionMode: input.selectedSuggestion.actionMode,
          targetEntityKeys: input.selectedSuggestion.targetEntityKeys,
          targetThreadKeys: input.selectedSuggestion.targetThreadKeys,
          retrievalHint: input.selectedSuggestion.retrievalHint,
        }
      : null,
    sourceContext,
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
    scheduledPlannerProgressPhasesForMode(plannerMode).forEach(({ phase, delayMs }) => {
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
    let storySequenceIssues: StorySequenceOpIssue[] = []
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
          attempt: String(attempt + 1),
        },
        store: false,
        timeoutMs: 180_000,
      })
      input.usageRecorder?.record({
        surface: 'compact-planner',
        model: input.payload.model,
        response,
        metadata: {
          attempt: attempt + 1,
          plannerMode,
        },
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
      const sequenceCompletion = creativeCompletionAppliesToPlan(plannerMode, candidatePlan.classification)
        ? await completeStorySequenceOps({
          model: input.payload.model,
          prompt: input.payload.prompt,
          snapshot: input.payload.snapshot,
          retrieval: relevantPlannerContext,
          ops: creativeCompletion.ops,
          debugEnabled,
          usageRecorder: input.usageRecorder,
        })
        : { ops: creativeCompletion.ops, issues: [] as StorySequenceOpIssue[] }
      const completedPlan = worldPromptPlannerSchema.parse({
        ...candidatePlan,
        wave1Ops: sequenceCompletion.ops,
        operations: sequenceCompletion.ops,
      })

      normalizedPlan = completedPlan
      creativeIssues = creativeCompletion.issues
      storySequenceIssues = sequenceCompletion.issues.length > 0 ? sequenceCompletion.issues : findStorySequenceOpIssues({
        snapshot: input.payload.snapshot,
        ops: completedPlan.wave1Ops,
      })
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
      if (
        creativeCompletionAppliesToPlan(plannerMode, completedPlan.classification)
        && storySequenceIssues.length > 0
        && attempt === 0
      ) {
        repairFeedback = [
          'Repair incomplete Story sequence_unit ops before returning the plan.',
          'Every Story sequence_unit you create or structurally update must include customProperties.sequence.ordinal, synopsis, dramaticQuestion, outcome, at least one consequence with cause/effect, and at least one characterArcDelta.',
          'Do not rely on entity.summary or entity.context as a substitute for customProperties.sequence.synopsis/outcome.',
          'Set customProperties.sequence.scriptExpansionReady to true only when those required chapter fields are present.',
          `Current sequence issues: ${summarizeStorySequenceOpIssues(storySequenceIssues)}.`,
        ].join(' ')
        if (debugEnabled) {
          console.log('[world-prompt-debug] planner sequence-retry', previewJson({
            repairFeedback,
            issues: storySequenceIssues,
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
    const finalProgressMessage = plannerMode === 'advisory_diagnosis'
      ? plannerOutline.length > 0
        ? `Prepared the answer and ${plannerOutline.length} suggested next move${plannerOutline.length === 1 ? '' : 's'}.`
        : 'Prepared the answer.'
      : plannerOutline.length > 0
        ? `Validated the plan and prepared ${plannerOutline.length} first-wave step${plannerOutline.length === 1 ? '' : 's'}.`
        : 'Validated the plan and prepared the next execution wave.'
    await emitPlannerProgress('finalizing_plan', {
      message: finalProgressMessage,
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
          const sequenceApprovalReason = annotateStorySequenceCompletenessGuard({
            op,
            snapshot: input.snapshot,
            entityName: entity.name,
            nodeType: entity.nodeType,
            changes: entity,
          })
          if (sequenceApprovalReason) {
            return annotatePromptOpMetadata({
              op,
              touchesExisting: false,
              approvalReason: sequenceApprovalReason,
            })
          }
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
      const sequenceApprovalReason = annotateStorySequenceCompletenessGuard({
        op,
        snapshot: input.snapshot,
        entityName: entity.name || resolved.entity.name,
        nodeType: entity.nodeType ?? resolved.entity.nodeType,
        existing: resolved.entity,
        changes: entity,
      })
      if (identityRewrite || canonTouch || (changingKind && explicitCorrection)) {
        op.applyMode = 'needs_approval'
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        canonTouch,
        approvalReason: identityRewrite || (changingKind && explicitCorrection)
          ? 'Semantic rewrite of existing entity'
          : canonTouch ? 'Touches canon-locked entity' : sequenceApprovalReason,
      })
    }
    const sequenceApprovalReason = annotateStorySequenceCompletenessGuard({
      op,
      snapshot: input.snapshot,
      entityName: entity.name,
      nodeType: entity.nodeType,
      changes: entity,
    })
    if (sequenceApprovalReason) {
      return annotatePromptOpMetadata({
        op,
        touchesExisting: false,
        approvalReason: sequenceApprovalReason,
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
    const sequenceApprovalReason = annotateStorySequenceCompletenessGuard({
      op,
      snapshot: input.snapshot,
      entityName: op.payload.changes.name || target.name,
      nodeType: op.payload.changes.nodeType ?? target.nodeType,
      existing: target,
      changes: {
        customProperties: op.payload.changes.customProperties ?? {},
        metadata: op.payload.changes.metadata ?? {},
      },
    })
    if (destructive || canonTouch) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: destructive ? 'Semantic rewrite of existing entity' : canonTouch ? 'Touches canon-locked entity' : sequenceApprovalReason,
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
    const temporal = readWorldRelationshipTemporalMetadata(relationship)
    if (temporal) {
      if (source.entity.nodeType !== 'event' || target.entity.nodeType !== 'event') {
        op.applyMode = 'needs_approval'
        return annotatePromptOpMetadata({
          op,
          touchesExisting: true,
          approvalReason: 'Temporal relationship endpoints must be events',
        })
      }
      const normalized = normalizeWorldRelationshipTemporalMetadata(relationship)
      relationship.sourceEntityKey = normalized.sourceEntityKey
      relationship.targetEntityKey = normalized.targetEntityKey
      relationship.metadata = normalized.metadata
      const normalizedTemporal = readWorldRelationshipTemporalMetadata(relationship)
      const strictChronology = normalizedTemporal
        && normalizedTemporal.impliesChronology !== false
        && (normalizedTemporal.kind === 'before' || normalizedTemporal.kind === 'causes')
      if (
        strictChronology
        && wouldCreateWorldTimelineCycle({
          entities: input.snapshot.worldEntities,
          relationships: input.snapshot.worldRelationships,
          sourceEventKey: relationship.sourceEntityKey,
          targetEventKey: relationship.targetEntityKey,
        })
      ) {
        op.applyMode = 'needs_approval'
        return annotatePromptOpMetadata({
          op,
          touchesExisting: true,
          approvalReason: 'Temporal relationship would create a timeline cycle',
        })
      }
    }
    const existing = input.snapshot.worldRelationships.find((entry) => (
      entry.sourceEntityKey === relationship.sourceEntityKey
      && entry.targetEntityKey === relationship.targetEntityKey
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

  if (op.op === 'update_world_wiki_metadata') {
    const targetView = op.payload.target === 'view'
      ? input.snapshot.worldViews.find((view) => view.key === op.payload.targetViewKey) ?? null
      : null
    if (op.payload.target === 'view' && !targetView) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing wiki view target',
      })
    }
    const existingWiki = op.payload.target === 'view'
      ? readWorldWikiPresentationMetadata((targetView?.metadata as Record<string, unknown> | undefined)?.wiki)
      : readProjectWorldWikiPresentation(input.snapshot)
    const sanitizedMetadata = sanitizeWikiMetadataPatch(op.payload.metadata, existingWiki as Record<string, unknown>)
    if (Object.keys(sanitizedMetadata).length === 0) {
      op.applyMode = 'needs_approval'
      op.payload.metadata = {}
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Empty wiki metadata update',
      })
    }
    op.payload.metadata = sanitizedMetadata
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch: false,
      approvalReason: null,
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
  const entity = normalizeWorldEntityCreateInputVisual(input.entity)
  const { linkedDefinitionKey, createdDefinition } = await ensureLinkedDefinition({
    client: input.client,
    snapshot: input.snapshot,
    entity,
    force: worldEntityRequiresLinkedDefinition(entity.nodeType),
  })

  const key = input.preferredKey || buildWorldEntityKey(input.snapshot, entity.nodeType, entity.name)
  const insertResponse = await input.client
    .from('world_entities')
    .insert({
      draft_id: input.snapshot.draft.id,
      key,
      name: entity.name,
      summary: entity.summary,
      context: entity.context,
      node_type: entity.nodeType,
      aliases: entity.aliases,
      tags: entity.tags,
      status: entity.status,
      thumbnail_asset_key: entity.thumbnailAssetKey,
      linked_definition_key: linkedDefinitionKey,
      source: entity.source ?? 'ai',
      custom_properties: entity.customProperties,
      metadata: entity.metadata,
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
  turnId: string
  op: PromptToWorldOp
}) {
  if (input.op.op === 'assistant_note') {
    return {
      applied: {},
      queue: null,
      note: input.op.payload.message,
    }
  }

  if (input.op.op === 'update_world_wiki_metadata') {
    const patch = sanitizeWikiMetadataPatch(input.op.payload.metadata)
    if (Object.keys(patch).length === 0) {
      return {
        applied: {},
        queue: null,
        note: 'Skipped empty wiki metadata update.',
      }
    }
    const patchWithProvenance = {
      ...patch,
      generatedFromFingerprint: buildWorldWikiFingerprint(input.snapshot),
      updatedByTurnId: input.turnId,
    }
    if (input.op.payload.target === 'view') {
      const target = input.snapshot.worldViews.find((view) => view.key === input.op.payload.targetViewKey) ?? null
      if (!target) {
        return {
          applied: {},
          queue: null,
          note: 'Skipped wiki metadata update because the target view was missing.',
        }
      }
      const nextMetadata = {
        ...(target.metadata ?? {}),
        wiki: {
          ...readWorldWikiPresentationMetadata((target.metadata as Record<string, unknown> | undefined)?.wiki),
          ...patchWithProvenance,
        },
      }
      const updateResponse = await input.client
        .from('world_views')
        .update({ metadata: nextMetadata })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', target.key)
        .select(WORLD_VIEW_SELECT)
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      const updatedView = mapWorldViewRow(updateResponse.data as WorldViewRow)
      return {
        applied: { worldViews: [updatedView] },
        queue: null,
        note: null,
      }
    }

    const currentDraftMetadata = input.snapshot.draft.metadata ?? {}
    const nextDraftMetadata = {
      ...currentDraftMetadata,
      worldWiki: {
        ...readWorldWikiPresentationMetadata(currentDraftMetadata.worldWiki),
        ...patchWithProvenance,
      },
    }
    const updateResponse = await input.client
      .from('project_drafts')
      .update({ metadata: nextDraftMetadata })
      .eq('id', input.snapshot.draft.id)
      .select('metadata')
      .single()
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    const metadata = updateResponse.data?.metadata ?? nextDraftMetadata
    input.snapshot.draft.metadata = metadata
    return {
      applied: { draft: { metadata } },
      queue: null,
      note: null,
    }
  }

  if (input.op.op === 'upsert_entity') {
    const promptEntity = normalizeWorldEntityCreateInputVisual(input.op.payload.entity)
    const target = !isProjectedCreate(input.op) && input.op.payload.targetEntityKey
      ? input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
      : null
    if (target) {
      const updatedEntity = await mergePromptEntityIntoExisting({
        client: input.client,
        draftId: input.snapshot.draft.id,
        target,
        incoming: promptEntity,
        linkedDefinitionKey: target.linkedDefinitionKey,
      })
      await syncLinkedDefinitionFromWorldEntity({
        client: input.client,
        draftId: input.snapshot.draft.id,
        entity: updatedEntity,
      })
      const linkedEntity = await ensureAppliedEntityLinkedDefinition({
        client: input.client,
        snapshot: input.snapshot,
        entity: updatedEntity,
      })
      return {
        applied: { worldEntities: [linkedEntity.entity] },
        definitions: linkedEntity.createdDefinition ? [linkedEntity.createdDefinition] : [],
        queue: null,
        note: null,
      }
    }

    const ensuredDefinition = await ensureLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: promptEntity,
      force: worldEntityRequiresLinkedDefinition(promptEntity.nodeType),
    })
    const linkedDefinitionKey = ensuredDefinition.linkedDefinitionKey
    const key = input.op.payload.targetEntityKey || buildWorldEntityKey(input.snapshot, promptEntity.nodeType, promptEntity.name)
    const dbTarget = await loadWorldEntityByDraftAndKey(input.client, input.snapshot.draft.id, key)
      if (dbTarget) {
        const updatedEntity = await mergePromptEntityIntoExisting({
          client: input.client,
          draftId: input.snapshot.draft.id,
          target: dbTarget,
          incoming: promptEntity,
          linkedDefinitionKey,
        })
        await syncLinkedDefinitionFromWorldEntity({
          client: input.client,
          draftId: input.snapshot.draft.id,
          entity: updatedEntity,
        })
        const linkedEntity = await ensureAppliedEntityLinkedDefinition({
          client: input.client,
          snapshot: input.snapshot,
          entity: updatedEntity,
        })
      return {
        applied: { worldEntities: [linkedEntity.entity] },
        definitions: [
          ensuredDefinition.createdDefinition,
          linkedEntity.createdDefinition,
        ].filter((definition): definition is Record<string, unknown> => Boolean(definition)),
        queue: null,
        note: null,
      }
    }
    const insertResponse = await input.client
      .from('world_entities')
      .insert({
        draft_id: input.snapshot.draft.id,
        key,
        name: promptEntity.name,
        summary: promptEntity.summary,
        context: promptEntity.context,
        node_type: promptEntity.nodeType,
        aliases: promptEntity.aliases,
        tags: promptEntity.tags,
        status: promptEntity.status,
        thumbnail_asset_key: promptEntity.thumbnailAssetKey,
        linked_definition_key: linkedDefinitionKey,
        source: promptEntity.source ?? 'ai',
        custom_properties: promptEntity.customProperties,
        metadata: promptEntity.metadata,
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
            incoming: promptEntity,
            linkedDefinitionKey,
          })
          await syncLinkedDefinitionFromWorldEntity({
            client: input.client,
            draftId: input.snapshot.draft.id,
            entity: updatedEntity,
          })
          const linkedEntity = await ensureAppliedEntityLinkedDefinition({
            client: input.client,
            snapshot: input.snapshot,
            entity: updatedEntity,
          })
          return {
            applied: { worldEntities: [linkedEntity.entity] },
            definitions: [
              ensuredDefinition.createdDefinition,
              linkedEntity.createdDefinition,
            ].filter((definition): definition is Record<string, unknown> => Boolean(definition)),
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
    const linkedEntity = await ensureAppliedEntityLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: createdEntity,
    })
    return {
      applied: { worldEntities: [linkedEntity.entity] },
      definitions: [
        ensuredDefinition.createdDefinition,
        linkedEntity.createdDefinition,
      ].filter((definition): definition is Record<string, unknown> => Boolean(definition)),
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
    const nextCustomProperties = changes.customProperties
      ? {
          ...(target.customProperties ?? {}),
          ...changes.customProperties,
        }
      : target.customProperties
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
    nextMetadata = mergeVisualDescriptionMetadata(nextMetadata, nextMetadata.visualDescription)
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
        custom_properties: nextCustomProperties,
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
    const linkedEntity = await ensureAppliedEntityLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: updatedEntity,
    })
    return {
      applied: { worldEntities: [linkedEntity.entity] },
      definitions: linkedEntity.createdDefinition ? [linkedEntity.createdDefinition] : [],
      queue: null,
      note: null,
    }
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
      const linkedReplacement = await ensureAppliedEntityLinkedDefinition({
        client: input.client,
        snapshot: input.snapshot,
        entity: replacementEntity,
      })
      replacementEntity = linkedReplacement.entity
      replacementDefinitionKey = replacementEntity.linkedDefinitionKey
      createdReplacementDefinition = createdReplacementDefinition ?? linkedReplacement.createdDefinition

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
    const temporal = readWorldRelationshipTemporalMetadata(relationship)
    if (temporal) {
      const source = input.snapshot.worldEntities.find((entity) => entity.key === relationship.sourceEntityKey) ?? null
      const target = input.snapshot.worldEntities.find((entity) => entity.key === relationship.targetEntityKey) ?? null
      if (source?.nodeType !== 'event' || target?.nodeType !== 'event') {
        return {
          applied: {},
          queue: null,
          note: 'Skipped one temporal relationship because temporal links must connect event nodes.',
        }
      }
      const normalized = normalizeWorldRelationshipTemporalMetadata(relationship)
      relationship.sourceEntityKey = normalized.sourceEntityKey
      relationship.targetEntityKey = normalized.targetEntityKey
      relationship.metadata = normalized.metadata
      const normalizedTemporal = readWorldRelationshipTemporalMetadata(relationship)
      const strictChronology = normalizedTemporal
        && normalizedTemporal.impliesChronology !== false
        && (normalizedTemporal.kind === 'before' || normalizedTemporal.kind === 'causes')
      if (
        strictChronology
        && wouldCreateWorldTimelineCycle({
          entities: input.snapshot.worldEntities,
          relationships: input.snapshot.worldRelationships,
          sourceEventKey: relationship.sourceEntityKey,
          targetEventKey: relationship.targetEntityKey,
        })
      ) {
        return {
          applied: {},
          queue: null,
          note: 'Skipped one temporal relationship because it would create a timeline cycle.',
        }
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
    const equivalent = findEquivalentWorldRelationship(
      input.snapshot,
      relationship.sourceEntityKey,
      relationship.verb,
      relationship.targetEntityKey,
    )
    if (equivalent) {
      const notesMerge = mergeCanonicalText({
        existing: equivalent.notes,
        incoming: relationship.notes,
        maxUnits: 6,
      })
      let nextMetadata: Record<string, unknown> = {
        ...(equivalent.metadata ?? {}),
        ...(relationship.metadata ?? {}),
      }
      nextMetadata = appendRefinementHistory({
        metadata: nextMetadata,
        field: 'notes',
        previousText: equivalent.notes,
        incomingText: relationship.notes,
        resultText: notesMerge.text,
        strategy: notesMerge.strategy,
        changed: notesMerge.changed,
      })
      const updateResponse = await input.client
        .from('world_relationships')
        .update({
          notes: notesMerge.text,
          strength: relationship.strength ?? equivalent.strength,
          confidence: relationship.confidence ?? equivalent.confidence,
          metadata: nextMetadata,
        })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', equivalent.key)
        .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      const updated = worldRelationshipSchema.parse({
        id: updateResponse.data.id,
        key: updateResponse.data.key,
        sourceEntityKey: sourceEntity.key,
        targetEntityKey: targetEntity.key,
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

async function loadGenerationJobById(client: SupabaseClient, jobId: string) {
  const response = await client
    .from('world_prompt_generation_jobs')
    .select(GENERATION_JOB_SELECT)
    .eq('id', jobId)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapGenerationJobRow(response.data as WorldPromptGenerationJobRow)
}

async function updateGenerationJob(client: SupabaseClient, jobId: string, changes: Record<string, unknown>) {
  const response = await client
    .from('world_prompt_generation_jobs')
    .update(changes)
    .eq('id', jobId)
    .select(GENERATION_JOB_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapGenerationJobRow(response.data as WorldPromptGenerationJobRow)
}

async function loadGenerationJobStepById(client: SupabaseClient, stepId: string) {
  const response = await client
    .from('world_prompt_generation_job_steps')
    .select(GENERATION_JOB_STEP_SELECT)
    .eq('id', stepId)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapGenerationJobStepRow(response.data as WorldPromptGenerationJobStepRow)
}

async function loadGenerationJobSteps(client: SupabaseClient, jobId: string) {
  const response = await client
    .from('world_prompt_generation_job_steps')
    .select(GENERATION_JOB_STEP_SELECT)
    .eq('job_id', jobId)
    .order('order_index', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptGenerationJobStepRow[]).map((row) => mapGenerationJobStepRow(row))
}

async function updateGenerationJobStep(client: SupabaseClient, stepId: string, changes: Record<string, unknown>) {
  const response = await client
    .from('world_prompt_generation_job_steps')
    .update(changes)
    .eq('id', stepId)
    .select(GENERATION_JOB_STEP_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapGenerationJobStepRow(response.data as WorldPromptGenerationJobStepRow)
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
  const incoming = normalizeWorldEntityCreateInputVisual(input.incoming)
  const nextAliases = Array.from(new Set([...input.target.aliases, ...(incoming.aliases ?? [])]))
  const nextTags = Array.from(new Set([...input.target.tags, ...(incoming.tags ?? [])]))
  const summaryMerge = mergeCanonicalText({
    existing: input.target.summary,
    incoming: incoming.summary,
    maxUnits: 4,
  })
  const contextMerge = mergeCanonicalContext({
    existing: input.target.context,
    incoming: incoming.context,
  })
  let nextMetadata: Record<string, unknown> = {
    ...(input.target.metadata ?? {}),
    ...(incoming.metadata ?? {}),
  }
  nextMetadata = mergeVisualDescriptionMetadata(nextMetadata, nextMetadata.visualDescription)
  nextMetadata = appendRefinementHistory({
    metadata: nextMetadata,
    field: 'summary',
    previousText: input.target.summary,
    incomingText: incoming.summary,
    resultText: summaryMerge.text,
    strategy: summaryMerge.strategy,
    changed: summaryMerge.changed,
  })
  nextMetadata = appendRefinementHistory({
    metadata: nextMetadata,
    field: 'context',
    previousText: input.target.context,
    incomingText: incoming.context,
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
      thumbnail_asset_key: input.target.thumbnailAssetKey ?? incoming.thumbnailAssetKey,
      linked_definition_key: input.target.linkedDefinitionKey ?? input.linkedDefinitionKey,
      custom_properties: {
        ...(input.target.customProperties ?? {}),
        ...(incoming.customProperties ?? {}),
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
        case 'update_world_wiki_metadata':
          return 'wiki overview metadata'
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

const seedInferenceOutputSchema = worldPromptProjectContextInferenceSchema.extend({
  recommendedArtStylePresetIds: z.array(z.string()).default([]),
})

function buildSeedInferenceStyleOptions(inference: z.infer<typeof worldPromptProjectContextInferenceSchema>) {
  const onboardingPresets = getOnboardingArtStylePresets({
    projectType: inference.projectType,
    projectSubtype: inference.projectSubtype,
  })
  const allowedPresetIds = new Set(onboardingPresets.map((preset) => preset.id))
  const recommendedIds = new Set([
    inference.artStylePreset,
    ...((inference as z.infer<typeof seedInferenceOutputSchema>).recommendedArtStylePresetIds ?? []),
  ].filter((id): id is string => Boolean(id) && allowedPresetIds.has(id)))
  return onboardingPresets.map((preset, index) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    group: preset.group,
    thumbnailUrl: preset.thumbnailUrl ?? null,
    recommended: recommendedIds.has(preset.id) || index === 0,
  }))
}

async function inferInitialSeedContext(input: {
  model: string
  prompt: string
  sourceContext: unknown
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const validPairs = 'story: feature_film, tv_streaming_series, short_film, shortform_series, animated_story; game: action_rpg, narrative_adventure, narrative_rpg_mobile, strategy_builder, survival_craft, shooter_combat, social_sim, open_world_sandbox, platformer_metroidvania, horror_mystery; brand: campaign_world, product_storytelling, mascot_ip, brand_education_explainer; ugc: creator_organic, direct_response_ad, faceless_explainer_demo, serialized_social_drama; app: ai_utility_wrapper, mascot_daily_ritual, content_generator.'
  const schema = normalizeStrictJsonSchema(z.toJSONSchema(seedInferenceOutputSchema))
  const response = await runOpenAiResponses({
    model: input.model,
    input: JSON.stringify({
      prompt: input.prompt,
      sourceContext: input.sourceContext ?? null,
      validPairs,
    }),
    instructions: [
      'Infer the GraphCore project type and subtype from the user prompt and optional source context.',
      'Return JSON only. Do not ask the user to classify the project.',
      `Valid project type/subtype pairs: ${validPairs}`,
      'Set confidence from 0 to 1. Use a short visible rationale suitable for the user interface, not private reasoning.',
      'Recommend an artStylePreset and up to three recommendedArtStylePresetIds that match the inferred project.',
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'world_seed_inference',
        schema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-seed-inference',
      surface: 'onboarding',
    },
    store: false,
    timeoutMs: 90_000,
  })
  input.usageRecorder?.record({
    surface: 'seed-inference',
    model: input.model,
    response,
  })
  if (!response.response.ok) {
    const upstreamMessage =
      typeof response.body.error === 'object' && response.body.error !== null
        ? ((response.body.error as { message?: string }).message ?? 'OpenAI request failed.')
        : 'OpenAI request failed.'
    throw new Error(`[world-seed-inference] ${upstreamMessage}`)
  }
  const parsedJson = extractJsonBlock(response.outputText)
  if (!parsedJson) {
    throw new Error('World seed inference returned invalid JSON.')
  }
  return seedInferenceOutputSchema.parse(parsedJson)
}

function buildCompletedProjectContext(input: {
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  selectedArtStylePreset: string
  selectedArtStyleDescription?: string | null
}) {
  const preset = getArtStylePreset(input.selectedArtStylePreset)
  return projectContextSchema.parse({
    projectType: input.inference.projectType,
    projectSubtype: input.inference.projectSubtype,
    brainProfile: brainProfileForSubtype(input.inference.projectSubtype),
    artStylePreset: preset.id,
    artStyleDescription: input.selectedArtStyleDescription?.trim() || preset.description,
    onboardingCompletedAt: new Date().toISOString(),
    onboardingVersion: '2026-04-30-initial-seed-v1',
    source: 'onboarding',
  })
}

function buildTransientSeedProjectContext(input: {
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  selectedArtStylePreset: string
  selectedArtStyleDescription?: string | null
}) {
  const completed = buildCompletedProjectContext(input)
  return projectContextSchema.parse({
    ...completed,
    onboardingCompletedAt: null,
    onboardingVersion: '2026-04-30-initial-seed-v1',
    source: 'onboarding',
  })
}

function buildCompletedProjectContextFromInitialSeedContext(initialSeedContext: unknown) {
  const parsed = worldPromptInitialSeedContextSchema.safeParse(initialSeedContext)
  if (!parsed.success) return null
  const seedContext = parsed.data
  if (seedContext.mode !== 'generate_skeleton') return null
  if (!seedContext.inference || !seedContext.selectedArtStylePreset) return null
  return buildCompletedProjectContext({
    inference: seedContext.inference,
    selectedArtStylePreset: seedContext.selectedArtStylePreset,
    selectedArtStyleDescription: seedContext.selectedArtStyleDescription,
  })
}

async function persistProjectContextForSeed(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  projectContext: ProjectContext
}) {
  const nextMetadata = {
    ...(input.snapshot.draft.metadata ?? {}),
    projectContext: input.projectContext,
  }
  const response = await input.client
    .from('project_drafts')
    .update({ metadata: nextMetadata })
    .eq('id', input.snapshot.draft.id)
    .select('metadata')
    .single()
  if (response.error) throw new Error(response.error.message)
  input.snapshot.draft.metadata = response.data?.metadata ?? nextMetadata
  input.snapshot.projectContext = input.projectContext
}

function buildInitialSeedGenerationPrompt(input: {
  originalPrompt: string
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  selectedArtStylePreset: string
  selectedArtStyleDescription: string
}) {
  return [
    'Generate the complete initial GraphCore world skeleton from the first prompt and source.',
    '',
    input.originalPrompt,
    '',
    `Inferred project: ${input.inference.projectType} / ${input.inference.projectSubtype}.`,
    `Selected art style: ${input.selectedArtStylePreset}${input.selectedArtStyleDescription ? ` - ${input.selectedArtStyleDescription}` : ''}.`,
    'Apply this as one initial seed. Use the attached initialSeed skeleton profile in planner context.',
  ].join('\n')
}

function sourceContextBrief(sourceContext: unknown) {
  if (!sourceContext || typeof sourceContext !== 'object') return null
  const source = sourceContext as Record<string, unknown>
  return {
    kind: source.kind,
    title: source.title,
    fileName: source.fileName,
    url: source.url,
    charCount: source.charCount,
    truncated: source.truncated,
    extractedText: typeof source.extractedText === 'string'
      ? source.extractedText.slice(0, 80_000)
      : '',
  }
}

function buildStreamedInitialSeedInstructions() {
  return [
    'You generate initial world graph records from the user prompt.',
    'Generate a complete initial world skeleton as streamed JSON records. Do not wrap in Markdown. Do not return one giant JSON object.',
    'Every entity and sequence_unit must include visualDescription: a concise visual image prompt under 280 characters. Describe visible design only. Do not include lore exposition, project names, internal IDs, GraphCore wording, schema labels, or node-type labels.',
    'For sequence_unit records, visualDescription must describe the visible scene or moment for that beat.',
    'Each record must be one complete JSON object matching one of:',
    '{"kind":"note","message":"short operational note"}',
    '{"kind":"wiki","id":"wiki_foundation","title":"generated content title","logline":"one sentence","synopsis":"compact paragraph","genre":"genre label","themes":["theme"],"toneTags":["tone"],"coreConflict":"central conflict","visualMotifs":["motif"],"artStyleDescription":"specific visual direction beyond the broad preset","brandAtlasPrompt":"visual-only prompt for one cohesive brand/world atlas image","colorScheme":{"primary":"#hex role","secondary":"#hex role","tertiary":"#hex role"}}',
    '{"kind":"entity","id":"mara_veyr","nodeType":"actor","name":"Mara Veyr","summary":"one sentence","context":"short canon use","visualDescription":"silver-haired archivist with a violet lantern, ash-black coat, rainlit stone alley","tags":["main cast"]}',
    '{"kind":"sequence_unit","id":"episode_01","name":"Episode 1: The Memory Tax","summary":"one sentence","context":"short canon use","visualDescription":"public memory tithe in a rain-slick plaza, shadow guards, glowing ledger pages, frightened crowd","unitKind":"episode","sequenceKey":"main","ordinal":1,"actLabel":"Act I","synopsis":"one compact paragraph","dramaticQuestion":"question","storyFunction":"setup","outcome":"one sentence","consequences":[{"cause":"cause","effect":"effect","affectedEntityKeys":["mara_veyr"],"threadKeys":[],"consequenceType":"plot"}],"characterArcDeltas":[{"actorKey":"mara_veyr","before":"before","pressure":"pressure","choice":"choice","after":"after"}],"openLoops":["loop"],"resolvedLoops":[]}',
    '{"kind":"relationship","id":"link_mara_seeks_artifact","source":"mara_veyr","target":"memory_artifact","verb":"seeks","notes":"short relationship note"}',
    '{"kind":"summary","assistantSummary":"concise summary of what was created"}',
    '{"kind":"skip","reason":"only if a requested record cannot be represented safely"}',
    '{"kind":"op","op":{PromptToWorldOp}} is supported for compatibility, but prefer compact wiki, entity, sequence_unit, and relationship records; the system will convert them to graph ops.',
    'Emit minified one-line JSON records. Never put literal line breaks inside JSON string values; escape them as \\n or keep text as one compact paragraph.',
    'Example entity line: {"kind":"entity","id":"mara_veyr","nodeType":"actor","name":"Mara Veyr","summary":"A memory mage pulled into the empire conflict.","context":"Main cast protagonist with a clear want, flaw, and pressure.","visualDescription":"silver-haired memory mage in an ash-black archivist coat, violet lantern glow, rain-dark alley","tags":["main cast"]}',
    'Example Story sequence_unit line: {"kind":"sequence_unit","id":"episode_01","name":"Episode 1: The Memory Tax","summary":"Mara discovers the empire is harvesting memories to keep its shadow throne alive.","context":"Opening episode that establishes the premise, pressure, and first irreversible choice.","visualDescription":"public memory tithe in a rain-slick plaza, shadow guards, glowing ledger pages, frightened crowd","unitKind":"episode","sequenceKey":"main","ordinal":1,"actLabel":"Act I","synopsis":"Mara witnesses a public memory tithe and realizes her brother is next.","dramaticQuestion":"Will Mara expose the tithe before her family is erased?","storyFunction":"setup","outcome":"Mara steals a forbidden ledger and becomes hunted by the throne.","consequences":[{"cause":"Mara steals the tithe ledger.","effect":"The shadow guard marks her family as traitors.","affectedEntityKeys":["mara_veyr"],"threadKeys":[],"consequenceType":"plot"}],"characterArcDeltas":[{"actorKey":"mara_veyr","before":"Mara survives by staying invisible.","pressure":"Her brother is selected for the tithe.","choice":"She steals the ledger in public.","after":"She accepts becoming visible is the price of resistance."}],"openLoops":["Who built the tithe ledger?"],"resolvedLoops":[]}',
    'Example relationship line: {"kind":"relationship","id":"link_mara_seeks_artifact","source":"mara_veyr","target":"memory_artifact","verb":"seeks","notes":"The artifact is tied to Mara central objective."}',
    'Use only these operation types: upsert_entity, upsert_relationship, update_world_wiki_metadata, assistant_note.',
    'Valid entity nodeType values are actor, group, place, object, concept, event, sequence_unit, app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, code_file.',
    'Never use character, location, faction, artifact, lore, wiki, title, or beat as nodeType; map them to actor, place, group, object, concept, update_world_wiki_metadata, or sequence_unit.',
    'Use stable lowercase snake_case entity keys in targetEntityKey and relationship endpoints.',
    'For Story projects, include generated content title/logline/wiki metadata, full main cast, main locations, major factions when relevant, key objects/concepts when relevant, and ordered sequence_unit nodes for the main story arc.',
    'For Story projects, emit at least 6 ordered sequence_unit nodes before emitting any relationship records.',
    'For Story projects, use the compact {"kind":"sequence_unit",...} form for every sequence unit to avoid malformed nested JSON.',
    'Story sequence_unit nodes must put complete metadata in payload.entity.customProperties.sequence, not only in summary/context.',
    'Story sequence_unit nodes must include ordinal, synopsis, dramaticQuestion, outcome, at least one consequence with cause/effect, and at least one characterArcDelta with actorKey/before/pressure/choice/after.',
    'For App projects, generate a structured App Graph, not story canon. Use entity records with app nodeType values: app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, and code_file.',
    'For App projects, do not create sequence_unit records for UX flows. Use user_flow entity records instead, with ordered steps and flow metadata under customProperties.app.',
    'For App projects, store app-specific fields under customProperties.app. Examples: platformTargets, promise, monetization, coreLoop, route, purpose, emotionalBeat, states, props, fields, validationRules, method, path, authRequirement, webPreview, expoGo, requiresDevBuild, requiresAppleDeveloper, allowedFiles, forbiddenFiles, and ownerTower.',
    'For App projects, include product identity, personas, business goals, commercial features, user flows, screens, sections/components, data models, actions, API endpoints, backend functions, external services, capability constraints, design system, towers, and code_file plans.',
    'For App projects, useful relationship verbs include contains, uses, reads, writes, creates, updates, deletes, calls, invokes, emits, transitions_to, requires_auth, gated_by, styled_by, represented_by, implemented_as, tested_by, depends_on, owned_by_tower, and requires_capability.',
    'For App projects, visualDescription should describe visible mobile UI, screen state, product imagery, or interface mood only. Avoid schema labels, code jargon, internal IDs, and GraphCore wording.',
    'Use relationships such as precedes, causes, complicates, pays_off, opposes, belongs_to, located_in, seeks, protects, controls, discovers, and reveals where useful.',
    'Keep node prose compact: summaries should be one or two sentences, context should be short and canon-useful.',
    'Emit a note every few records so progress is visible, but do not reveal private chain-of-thought.',
  ].join('\n')
}

function buildStreamedInitialSeedPhaseInstructions(phase: WorldPromptGenerationStepPhase) {
  const phaseRules: Record<WorldPromptGenerationStepPhase, string[]> = {
    full_stream: [
      'This is a single full_stream generation pass.',
      'Emit the complete initial world skeleton in this order: world wiki metadata, core entity ops, ordered sequence_unit ops, relationship ops, then summary.',
      'Emit update_world_wiki_metadata before content entities. The metadata must include a generated content title plus logline, synopsis, genre, themes, toneTags, coreConflict, visualMotifs, artStyleDescription, brandAtlasPrompt, and app colorScheme where supported by the prompt.',
      'For update_world_wiki_metadata, metadata.genre, metadata.artStyleDescription, and metadata.brandAtlasPrompt must be strings; metadata.themes, metadata.toneTags, and metadata.visualMotifs must be arrays of strings; metadata.colorScheme must be an object such as {"primary":"#hex role","secondary":"#hex role","tertiary":"#hex role"}.',
      'For Story projects, emit at least 6 ordered sequence_unit nodes before relationship records and use stable ordinal keys like episode_01, episode_02, episode_03.',
      'After all entities and sequence units exist, emit relationships only between endpoint keys that have already been emitted in this stream.',
      'End with a summary record describing the complete skeleton created.',
    ],
    world_bible: [
      'This step is world_bible only.',
      'Emit update_world_wiki_metadata ops and concise notes only.',
      'The metadata must include a generated content title plus logline, synopsis, genre, themes, toneTags, coreConflict, visualMotifs, artStyleDescription, brandAtlasPrompt, and app colorScheme where supported by the prompt.',
      'For update_world_wiki_metadata, metadata.genre, metadata.artStyleDescription, and metadata.brandAtlasPrompt must be strings; metadata.themes, metadata.toneTags, and metadata.visualMotifs must be arrays of strings; metadata.colorScheme must be an object.',
      'Do not emit entity or relationship ops in this step.',
      'End with a summary record describing the foundation created.',
    ],
    core_entities: [
      'This step is core_entities only.',
      'Emit all actor, group, place, object, and concept entity ops required by the prompt and skeleton profile.',
      'Do not emit sequence_unit nodes in this step.',
      'Do not emit relationship ops in this step.',
      'End with a summary record describing the entity coverage created.',
    ],
    sequence_units: [
      'This step is sequence_units only.',
      'Emit ordered sequence_unit entity ops for the full initial arc.',
      'For Story projects, emit at least 6 ordered sequence_unit nodes.',
      'Each sequence_unit must include customProperties.sequence.ordinal, synopsis, dramaticQuestion, outcome, at least one cause/effect consequence, and at least one characterArcDelta.',
      'Do not emit thin sequence_unit records. Missing sequence fields are rejected instead of being persisted.',
      'Do not emit relationship ops in this step.',
      'End with a summary record describing the sequence coverage created.',
    ],
    relationships: [
      'This step is relationships only.',
      'Emit upsert_relationship ops after all endpoint entity keys already exist in the supplied canon ledger.',
      'Prefer relationships among existing actors, groups, places, objects, concepts, and sequence_unit nodes.',
      'Do not emit new entity ops in this step unless a required endpoint is missing and essential.',
      'End with a summary record describing the relationship map created.',
    ],
    finalize: [
      'This step is finalize only.',
      'Emit concise assistant notes and a final summary record.',
      'Do not emit new entity or relationship ops unless required to repair a small missing skeleton requirement.',
      'Summarize what was created and what remains useful to build next.',
    ],
  }
  return [
    buildStreamedInitialSeedInstructions(),
    ...phaseRules[phase],
  ].join('\n')
}

function buildStreamedInitialSeedInput(input: {
  generationPrompt: string
  sourceContext: unknown
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  selectedArtStylePreset: string
  selectedArtStyleDescription: string
  skeletonProfile: unknown
  projectContext: ProjectContext
  phase?: WorldPromptGenerationStepPhase
  existingCanon?: unknown
}) {
  return JSON.stringify({
    task: 'initial_world_seed_stream',
    phase: input.phase ?? 'all',
    prompt: input.generationPrompt,
    sourceContext: sourceContextBrief(input.sourceContext),
    inferredProject: input.inference,
    selectedArtStyle: {
      preset: input.selectedArtStylePreset,
      description: input.selectedArtStyleDescription,
    },
    projectContext: input.projectContext,
    skeletonProfile: input.skeletonProfile,
    existingCanon: input.existingCanon ?? null,
    outputContract: {
      format: 'newline_delimited_json',
      records: ['note', 'wiki', 'entity', 'sequence_unit', 'relationship', 'summary', 'skip', 'op'],
      requirement: 'one JSON object per line',
      compactRecordPreference: 'Prefer compact wiki, entity, sequence_unit, and relationship records. Do not emit deeply nested PromptToWorldOp JSON unless necessary.',
      storySequenceUnitRequirement: 'For sequence_unit records, include unitKind, sequenceKey, ordinal, actLabel, synopsis, dramaticQuestion, storyFunction, outcome, consequences[0].cause/effect, characterArcDeltas[0].actorKey/before/pressure/choice/after, openLoops, and resolvedLoops.',
    },
  })
}

function isStoryInitialSeed(inference: z.infer<typeof worldPromptProjectContextInferenceSchema>) {
  return inference.projectType === 'story'
}

function minimumInitialSeedSequenceUnits(inference: z.infer<typeof worldPromptProjectContextInferenceSchema>) {
  return isStoryInitialSeed(inference) ? 6 : 0
}

function buildStreamedInitialSeedContinuationInstructions(input: {
  target: 'sequence_units' | 'relationships'
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  currentCounts: Record<string, unknown>
}) {
  const sequenceTarget = minimumInitialSeedSequenceUnits(input.inference)
  const currentSequenceUnits = typeof input.currentCounts.sequenceUnits === 'number' ? input.currentCounts.sequenceUnits : 0
  const missingSequenceUnits = Math.max(0, sequenceTarget - currentSequenceUnits)
  const targetRules = input.target === 'sequence_units'
    ? [
        'Continuation target: sequence units only.',
        `The first stream ended before enough sequence units landed. Emit ${missingSequenceUnits || sequenceTarget} additional ordered sequence_unit records now.`,
        'Use only compact {"kind":"sequence_unit",...} records plus at most one note and one summary.',
        'Do not repeat actors, groups, places, objects, or concepts that already exist in existingCanon.',
        'Do not emit relationship records in this continuation.',
      ]
    : [
        'Continuation target: relationships only.',
        'Emit relationship records now, using only endpoint keys that already exist in existingCanon.',
        'Use only compact {"kind":"relationship",...} records plus at most one note and one summary.',
        'Include sequence relationships such as precedes, causes, complicates, and pays_off when sequence units exist.',
        'Do not emit new entity or sequence_unit records unless a tiny repair endpoint is absolutely required.',
      ]
  return [
    buildStreamedInitialSeedInstructions(),
    ...targetRules,
  ].join('\n')
}

function normalizeStreamLine(line: string) {
  return line
    .trim()
    .replace(/^```(?:json|jsonl|ndjson)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return []
}

function asCompactString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

const WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH = 280

function normalizeWorldEntityVisualDescription(value: unknown) {
  const normalized = asCompactString(value).replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized.slice(0, WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH).trim()
}

function readVisualDescriptionCandidate(value: Record<string, unknown>) {
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  const customProperties = isRecord(value.customProperties) ? value.customProperties : {}
  const metadataVisual = isRecord(metadata.visual) ? metadata.visual : {}
  const customVisual = isRecord(customProperties.visual) ? customProperties.visual : {}
  return normalizeWorldEntityVisualDescription(
    value.visualDescription
    ?? value.visual_description
    ?? value.visualPrompt
    ?? value.imagePrompt
    ?? metadata.visualDescription
    ?? metadataVisual.description
    ?? metadataVisual.visualDescription
    ?? customProperties.visualDescription
    ?? customVisual.description
    ?? customVisual.visualDescription
    ?? customProperties.appearance,
  )
}

function mergeVisualDescriptionMetadata(metadata: Record<string, unknown>, visualDescription: unknown) {
  const nextMetadata = { ...metadata }
  const normalized = normalizeWorldEntityVisualDescription(visualDescription)
  if (normalized) {
    nextMetadata.visualDescription = normalized
  } else if (typeof nextMetadata.visualDescription === 'string') {
    const existing = normalizeWorldEntityVisualDescription(nextMetadata.visualDescription)
    if (existing) nextMetadata.visualDescription = existing
  }
  return nextMetadata
}

function markFallbackVisualDescription(metadata: Record<string, unknown>, visualDescription: string, explicitVisualDescription: string) {
  if (!visualDescription || explicitVisualDescription) return metadata
  return {
    ...metadata,
    visualDescriptionSource: metadata.visualDescriptionSource ?? 'fallback',
  }
}

function fallbackVisualDescriptionFromEntity(entity: Record<string, unknown>) {
  return normalizeWorldEntityVisualDescription(
    readVisualDescriptionCandidate(entity)
    || entity.summary
    || entity.context
    || entity.name,
  )
}

function normalizeWorldEntityCreateInputVisual<T extends WorldEntityCreateInput>(entity: T): T {
  const explicitVisualDescription = readVisualDescriptionCandidate({
    metadata: entity.metadata ?? {},
    customProperties: entity.customProperties ?? {},
  })
  const visualDescription = explicitVisualDescription || fallbackVisualDescriptionFromEntity(entity as Record<string, unknown>)
  const metadata = markFallbackVisualDescription(
    mergeVisualDescriptionMetadata(entity.metadata ?? {}, visualDescription),
    visualDescription,
    explicitVisualDescription,
  )
  return {
    ...entity,
    metadata,
  }
}

function asFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function coerceStreamNodeType(value: unknown) {
  const raw = asCompactString(value).toLowerCase()
  const aliases: Record<string, string> = {
    character: 'actor',
    person: 'actor',
    npc: 'actor',
    cast: 'actor',
    location: 'place',
    environment: 'place',
    faction: 'group',
    organization: 'group',
    artefact: 'object',
    artifact: 'object',
    item: 'object',
    prop: 'object',
    lore: 'concept',
    idea: 'concept',
    beat: 'sequence_unit',
    episode: 'sequence_unit',
    chapter: 'sequence_unit',
    mission: 'sequence_unit',
  }
  return aliases[raw] ?? raw
}

function normalizeStreamColorScheme(value: unknown) {
  if (isRecord(value)) return value
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, entry, index) => {
        const [rawKey, ...rawValueParts] = entry.split(':')
        const key = rawValueParts.length > 0
          ? asCompactString(rawKey).toLowerCase().replace(/[^a-z0-9]+/g, '_')
          : ['primary', 'secondary', 'tertiary'][index] ?? `color_${index + 1}`
        const color = rawValueParts.length > 0 ? asCompactString(rawValueParts.join(':')) : asCompactString(rawKey)
        if (key && color) acc[key] = color
        return acc
      }, {})
  }
  return {}
}

function normalizeStreamWikiMetadata(metadata: Record<string, unknown>) {
  const normalizedMetadata = { ...metadata }
  for (const key of ['title', 'logline', 'synopsis', 'genre', 'coreConflict', 'artStyleDescription', 'brandAtlasPrompt', 'brandAtlasAssetKey', 'roleLabel', 'shortSummary', 'generatedFromFingerprint', 'updatedByTurnId']) {
    const rawValue = normalizedMetadata[key]
    if (Array.isArray(rawValue)) {
      normalizedMetadata[key] = rawValue.map((entry) => String(entry).trim()).filter(Boolean).join(', ')
    }
  }
  for (const key of ['themes', 'visualMotifs', 'toneTags']) {
    const rawValue = normalizedMetadata[key]
    if (typeof rawValue === 'string') {
      normalizedMetadata[key] = rawValue.split(',').map((entry) => entry.trim()).filter(Boolean)
    }
  }
  normalizedMetadata.colorScheme = normalizeStreamColorScheme(normalizedMetadata.colorScheme)
  return normalizedMetadata
}

function normalizeCompactStreamedWikiEnvelope(value: Record<string, unknown>) {
  if (value.kind !== 'wiki') return value
  const title = asCompactString(value.title)
  const id = asCompactString(value.id) || 'wiki_foundation'
  return {
    kind: 'op',
    op: {
      id: slugifyStreamKey(id) || 'wiki_foundation',
      op: 'update_world_wiki_metadata',
      payload: {
        target: 'project',
        metadata: normalizeStreamWikiMetadata({
          title,
          logline: asCompactString(value.logline),
          synopsis: asCompactString(value.synopsis),
          genre: Array.isArray(value.genre) ? asStringArray(value.genre).join(', ') : asCompactString(value.genre),
          themes: asStringArray(value.themes),
          toneTags: asStringArray(value.toneTags ?? value.tone),
          coreConflict: asCompactString(value.coreConflict ?? value.conflict),
          visualMotifs: asStringArray(value.visualMotifs ?? value.motifs),
          artStyleDescription: asCompactString(value.artStyleDescription ?? value.artStyle ?? value.visualStyle),
          brandAtlasPrompt: asCompactString(value.brandAtlasPrompt ?? value.atlasPrompt),
          brandAtlasAssetKey: asCompactString(value.brandAtlasAssetKey),
          colorScheme: normalizeStreamColorScheme(value.colorScheme ?? value.colors ?? value.palette),
          sectionOrder: Array.isArray(value.sectionOrder) ? value.sectionOrder : [],
          wikiSections: isRecord(value.wikiSections) ? value.wikiSections : {},
        }),
        reason: 'Initial seed world wiki metadata.',
      },
    },
  }
}

function normalizeCompactStreamedEntityEnvelope(value: Record<string, unknown>) {
  if (value.kind !== 'entity') return value
  const name = asCompactString(value.name)
  const nodeType = coerceStreamNodeType(value.nodeType ?? value.type)
  const id = asCompactString(value.id ?? value.key ?? value.entityKey) || slugifyStreamKey(name)
  const stableKey = slugifyStreamKey(id)
  if (!stableKey || !name || nodeType === 'sequence_unit') return value
  const explicitVisualDescription = readVisualDescriptionCandidate(value)
  const visualDescription = explicitVisualDescription || normalizeWorldEntityVisualDescription(
    value.summary
    || value.context
    || name,
  )
  const metadata = markFallbackVisualDescription(
    mergeVisualDescriptionMetadata(isRecord(value.metadata) ? value.metadata : {}, visualDescription),
    visualDescription,
    explicitVisualDescription,
  )
  return {
    kind: 'op',
    op: {
      id: `create_${stableKey}`,
      op: 'upsert_entity',
      payload: {
        targetEntityKey: stableKey,
        entity: {
          nodeType,
          name,
          summary: asCompactString(value.summary),
          context: asCompactString(value.context),
          aliases: asStringArray(value.aliases),
          tags: asStringArray(value.tags),
          customProperties: isRecord(value.customProperties) ? value.customProperties : {},
          metadata,
        },
      },
    },
  }
}

function normalizeCompactStreamedSequenceEnvelope(value: Record<string, unknown>) {
  if (value.kind !== 'sequence_unit') return value
  const id = asCompactString(value.id ?? value.key ?? value.entityKey)
  const ordinalValue = asFiniteNumber(value.ordinal ?? value.index ?? value.sequenceOrdinal)
  const ordinal = ordinalValue ? Math.max(1, Math.floor(ordinalValue)) : null
  const unitKind = asCompactString(value.unitKind ?? value.unit_kind ?? value.type) || 'sequence_unit'
  const stableKey = id
    ? slugifyStreamKey(id)
    : ordinal
      ? `${slugifyStreamKey(unitKind) || 'sequence_unit'}_${String(ordinal).padStart(2, '0')}`
      : ''
  if (!stableKey) return value
  const name = asCompactString(value.name ?? value.title)
    || `${unitKind.replace(/_/g, ' ')} ${ordinal ?? ''}`.trim()
  const summary = asCompactString(value.summary)
  const context = asCompactString(value.context)
  const explicitVisualDescription = readVisualDescriptionCandidate(value)
  const visualDescription = explicitVisualDescription || normalizeWorldEntityVisualDescription(
    value.synopsis
    || summary
    || context
    || name,
  )
  const metadata = markFallbackVisualDescription(
    mergeVisualDescriptionMetadata(isRecord(value.metadata) ? value.metadata : {}, visualDescription),
    visualDescription,
    explicitVisualDescription,
  )
  const sequence = {
    unitKind,
    sequenceKey: asCompactString(value.sequenceKey ?? value.sequence_key) || 'main',
    ordinal: ordinal ?? 1,
    actLabel: asCompactString(value.actLabel ?? value.act),
    synopsis: asCompactString(value.synopsis),
    dramaticQuestion: asCompactString(value.dramaticQuestion ?? value.dramatic_question),
    storyFunction: asCompactString(value.storyFunction ?? value.story_function ?? value.function),
    outcome: asCompactString(value.outcome),
    consequences: Array.isArray(value.consequences) ? value.consequences : [],
    characterArcDeltas: Array.isArray(value.characterArcDeltas)
      ? value.characterArcDeltas
      : Array.isArray(value.character_arc_deltas)
        ? value.character_arc_deltas
        : Array.isArray(value.arcDeltas)
          ? value.arcDeltas
          : [],
    openLoops: asStringArray(value.openLoops ?? value.open_loops),
    resolvedLoops: asStringArray(value.resolvedLoops ?? value.resolved_loops),
    scriptExpansionReady: value.scriptExpansionReady !== false,
  }
  return {
    kind: 'op',
    op: {
      id: `create_${stableKey}`,
      op: 'upsert_entity',
      payload: {
        targetEntityKey: stableKey,
        entity: {
          nodeType: 'sequence_unit',
          name,
          summary,
          context,
          tags: asStringArray(value.tags),
          customProperties: {
            sequence,
          },
          metadata,
        },
      },
    },
  }
}

function normalizeCompactStreamedRelationshipEnvelope(value: Record<string, unknown>) {
  if (value.kind !== 'relationship') return value
  const source = asCompactString(value.source ?? value.sourceEntityKey ?? value.from)
  const target = asCompactString(value.target ?? value.targetEntityKey ?? value.to)
  const verb = asCompactString(value.verb ?? value.relationshipVerb ?? value.type)
  if (!source || !target || !verb) return value
  const id = asCompactString(value.id)
    || `link_${source}_${verb}_${target}`
  return {
    kind: 'op',
    op: {
      id: slugifyStreamKey(id) || `link_${slugifyStreamKey(source)}_${slugifyStreamKey(target)}`,
      op: 'upsert_relationship',
      payload: {
        relationship: {
          sourceEntityKey: source,
          targetEntityKey: target,
          verb,
          direction: ['outbound', 'inbound', 'bidirectional'].includes(asCompactString(value.direction))
            ? asCompactString(value.direction)
            : 'outbound',
          notes: asCompactString(value.notes ?? value.note),
          confidence: asFiniteNumber(value.confidence) ?? 0.82,
          strength: asFiniteNumber(value.strength),
          metadata: isRecord(value.metadata)
            ? value.metadata
            : {
                sequence: isRecord(value.sequence) ? value.sequence : undefined,
              },
        },
      },
    },
  }
}

function normalizeStreamedEnvelope(value: unknown) {
  if (isRecord(value)) {
    const compactWiki = normalizeCompactStreamedWikiEnvelope(value)
    if (compactWiki !== value) return compactWiki
    const compactEntity = normalizeCompactStreamedEntityEnvelope(value)
    if (compactEntity !== value) return compactEntity
    const compactSequence = normalizeCompactStreamedSequenceEnvelope(value)
    if (compactSequence !== value) return compactSequence
    const compactRelationship = normalizeCompactStreamedRelationshipEnvelope(value)
    if (compactRelationship !== value) return compactRelationship
    if (value.kind === 'skip') return value
  }
  if (!isRecord(value) || value.kind !== 'op' || !isRecord(value.op)) return value
  if (value.op.op === 'upsert_entity' && isRecord(value.op.payload) && isRecord(value.op.payload.entity)) {
    const entity = value.op.payload.entity
    const nodeType = coerceStreamNodeType(entity.nodeType)
    const explicitVisualDescription = readVisualDescriptionCandidate(entity)
    const sequence = isRecord(entity.customProperties) && isRecord(entity.customProperties.sequence)
      ? entity.customProperties.sequence
      : {}
    const visualDescription = explicitVisualDescription || normalizeWorldEntityVisualDescription(
      sequence.synopsis
      || entity.summary
      || entity.context
      || entity.name,
    )
    const metadata = markFallbackVisualDescription(
      mergeVisualDescriptionMetadata(
        isRecord(entity.metadata) ? entity.metadata : {},
        visualDescription,
      ),
      visualDescription,
      explicitVisualDescription,
    )
    return {
      ...value,
      op: {
        ...value.op,
        payload: {
          ...value.op.payload,
          entity: {
            ...entity,
            nodeType,
            tags: asStringArray(entity.tags),
            aliases: asStringArray(entity.aliases),
            metadata,
          },
        },
      },
    }
  }
  if (value.op.op !== 'update_world_wiki_metadata' || !isRecord(value.op.payload)) return value
  const metadata = isRecord(value.op.payload.metadata) ? value.op.payload.metadata : null
  if (!metadata) return value
  return {
    ...value,
    op: {
      ...value.op,
      payload: {
        ...value.op.payload,
        metadata: normalizeStreamWikiMetadata(metadata),
      },
    },
  }
}

function slugifyStreamKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function normalizeStreamedSequenceOpKeys(op: PromptToWorldOp): PromptToWorldOp {
  if (op.op !== 'upsert_entity' || op.payload.entity.nodeType !== 'sequence_unit') return op
  const sequence = op.payload.entity.customProperties?.sequence
  if (!sequence || typeof sequence !== 'object') return op
  const ordinal = (sequence as { ordinal?: unknown }).ordinal
  if (typeof ordinal !== 'number' || !Number.isFinite(ordinal) || ordinal <= 0) return op
  const unitKind = typeof (sequence as { unitKind?: unknown }).unitKind === 'string'
    ? (sequence as { unitKind: string }).unitKind
    : 'sequence_unit'
  const normalizedUnitKind = slugifyStreamKey(unitKind) || 'sequence_unit'
  const stableKey = `${normalizedUnitKind}_${String(Math.floor(ordinal)).padStart(2, '0')}`
  return {
    ...op,
    id: `create_${stableKey}`,
    payload: {
      ...op.payload,
      targetEntityKey: stableKey,
    },
  }
}

const streamRepairRecordSchema = z.discriminatedUnion('kind', [
  streamWikiRecordSchema,
  streamEntityRecordSchema,
  streamSequenceUnitRecordSchema,
  streamRelationshipRecordSchema,
  streamRepairSkipRecordSchema,
  z.object({
    kind: z.literal('note'),
    message: z.string().min(1),
  }),
  z.object({
    kind: z.literal('summary'),
    assistantSummary: z.string().default(''),
  }),
])

const streamRepairResponseSchema = z.object({
  record: streamRepairRecordSchema,
})

function compactSchemaDiagnostics(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .slice(0, 6)
}

function balancedJsonScan(value: string) {
  let depth = 0
  let inString = false
  let escaped = false
  for (const char of value) {
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
    }
  }
  return { depth, inString, escaped }
}

function isLikelyTruncatedStreamRecord(value: string) {
  const normalized = normalizeStreamLine(value)
  if (!normalized.endsWith('}')) return true
  const scan = balancedJsonScan(normalized)
  return scan.depth !== 0 || scan.inString || scan.escaped
}

function deterministicJsonRepairCandidates(record: string) {
  const base = normalizeStreamLine(record)
  const candidates = new Set<string>()
  const addCandidate = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) candidates.add(trimmed)
  }
  addCandidate(base)
  const firstBrace = base.indexOf('{')
  const lastBrace = base.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    addCandidate(base.slice(firstBrace, lastBrace + 1))
  }
  for (const candidate of [...candidates]) {
    addCandidate(candidate
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1'))
  }
  for (const candidate of [...candidates]) {
    addCandidate(candidate.replace(/\r?\n/g, '\\n'))
  }
  return [...candidates]
}

function parseJsonWithDeterministicRepair(record: string) {
  let firstError: unknown = null
  for (const candidate of deterministicJsonRepairCandidates(record)) {
    try {
      return { value: JSON.parse(candidate) as unknown, repairedText: candidate, error: null as unknown }
    } catch (error) {
      firstError ??= error
    }
  }
  return { value: null as unknown, repairedText: null as string | null, error: firstError }
}

function validateNormalizedStreamRecord(value: unknown) {
  const candidate = normalizeStreamedEnvelope(value)
  if (isRecord(candidate) && candidate.kind === 'skip') {
    const skip = streamRepairSkipRecordSchema.safeParse(candidate)
    return skip.success
      ? { envelope: null as WorldPromptStreamGraphOpEnvelope | null, skipReason: skip.data.reason || 'Skipped stream record.' }
      : { envelope: null, error: skip.error }
  }
  const parsed = worldPromptStreamGraphOpEnvelopeSchema.safeParse(candidate)
  if (!parsed.success) {
    return { envelope: null as WorldPromptStreamGraphOpEnvelope | null, error: parsed.error }
  }
  if (parsed.data.kind === 'op' || parsed.data.kind === 'note' || parsed.data.kind === 'summary') {
    return { envelope: parsed.data as WorldPromptStreamGraphOpEnvelope, error: null as z.ZodError | null }
  }
  return {
    envelope: null as WorldPromptStreamGraphOpEnvelope | null,
    error: new z.ZodError([{
      code: 'custom',
      path: ['kind'],
      message: `Compact ${parsed.data.kind} record could not be normalized into a graph op.`,
      input: candidate,
    }]),
  }
}

function shouldAttemptMalformedRecordRepair(input: {
  record: string
  errorMessage: string
  repairsUsed: number
  maxRepairs: number
}) {
  const normalized = normalizeStreamLine(input.record)
  if (input.repairsUsed >= input.maxRepairs) return false
  if (normalized.length < 20 || normalized.length > 12_000) return false
  if (isLikelyTruncatedStreamRecord(normalized)) return false
  if (!/"kind"\s*:/.test(normalized)) return false
  if (!/"(wiki|entity|sequence_unit|relationship|note|summary|skip|op)"/.test(normalized)) return false
  if (/unterminated string|unexpected end|end of json input/i.test(input.errorMessage)) return false
  return true
}

async function repairMalformedStreamRecordWithLlm(input: {
  model: string
  record: string
  errorMessage: string
  phase: WorldPromptGenerationStepPhase
  jobId: string
  turnId: string
  currentCounts: Record<string, unknown>
  existingCanon: unknown
  usageRecorder: WorldPromptTokenUsageRecorder
}) {
  const repairModel = Deno.env.get('WORLD_PROMPT_STREAM_REPAIR_MODEL')?.trim() || input.model
  const schema = normalizeStrictJsonSchema(z.toJSONSchema(streamRepairResponseSchema))
  const response = await runOpenAiResponses({
    model: repairModel,
    input: JSON.stringify({
      malformedRecord: normalizeStreamLine(input.record).slice(0, 12_000),
      parseOrValidationError: input.errorMessage,
      phase: input.phase,
      currentCounts: input.currentCounts,
      existingCanon: input.existingCanon,
      acceptedCompactKinds: ['wiki', 'entity', 'sequence_unit', 'relationship', 'note', 'summary', 'skip'],
    }),
    instructions: [
      'Repair exactly one malformed streamed GraphCore generation record.',
      'Return a valid compact record in the record field, or {"kind":"skip","reason":"..."} if the block is clearly incomplete or unsafe.',
      'Only recover syntax and field-shape problems from content already present in malformedRecord.',
      'Do not invent missing canon. Do not add extra records. Do not return PromptToWorldOp unless the malformed record already used that shape.',
      'Prefer compact wiki, entity, sequence_unit, and relationship records.',
      'For sequence_unit, preserve ordinal/title/content and ensure synopsis, outcome, consequences, and characterArcDeltas are present only if recoverable from the malformed block.',
    ].join('\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'world_prompt_stream_record_repair',
        schema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-prompt',
      surface: 'stream-record-repair',
      jobId: input.jobId,
      turnId: input.turnId,
    },
    store: false,
    timeoutMs: 45_000,
  })
  input.usageRecorder.record({
    surface: 'world-prompt-stream-record-repair',
    model: repairModel,
    response,
    metadata: { jobId: input.jobId, turnId: input.turnId, phase: input.phase },
  })
  if (!response.response.ok) return null
  const parsedJson = extractJsonBlock(response.outputText)
  const validated = parsedJson ? streamRepairResponseSchema.safeParse(parsedJson) : null
  if (!validated?.success) return null
  return validated.data.record
}

function extractCompleteStreamJsonRecords(buffer: string) {
  const records: string[] = []
  let current = ''
  let started = false
  let inString = false
  let escaped = false
  let depth = 0
  let lastConsumedIndex = 0

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index]
    if (!started) {
      if (char === '{') {
        started = true
        inString = false
        escaped = false
        depth = 1
        current = '{'
        lastConsumedIndex = index + 1
      }
      continue
    }

    if (inString) {
      if (escaped) {
        current += char
        escaped = false
      } else if (char === '\\') {
        current += char
        escaped = true
      } else if (char === '"') {
        current += char
        inString = false
      } else if (char === '\n') {
        current += '\\n'
      } else if (char !== '\r') {
        current += char
      }
      continue
    }

    current += char
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) {
        records.push(normalizeStreamLine(current))
        current = ''
        started = false
        inString = false
        escaped = false
        lastConsumedIndex = index + 1
      }
    }
  }

  return {
    records,
    rest: started ? current : buffer.slice(lastConsumedIndex),
  }
}

function streamedRelationshipEndpointKeys(op: PromptToWorldOp) {
  if (op.op !== 'upsert_relationship') return null
  const relationship = op.payload.relationship
  const sourceKey = typeof relationship.sourceEntityKey === 'string' ? relationship.sourceEntityKey.trim() : ''
  const targetKey = typeof relationship.targetEntityKey === 'string' ? relationship.targetEntityKey.trim() : ''
  if (!sourceKey || !targetKey) return null
  return { sourceKey, targetKey }
}

function streamedRelationshipEndpointsExist(snapshot: WorldPromptSnapshot, op: PromptToWorldOp) {
  const keys = streamedRelationshipEndpointKeys(op)
  if (!keys) return false
  return snapshot.worldEntities.some((entity) => entity.key === keys.sourceKey)
    && snapshot.worldEntities.some((entity) => entity.key === keys.targetKey)
}

function buildStreamedGenerationCanonLedger(snapshot: WorldPromptSnapshot) {
  return {
    entities: snapshot.worldEntities.map((entity) => ({
      key: entity.key,
      nodeType: entity.nodeType,
      name: entity.name,
      summary: entity.summary?.slice(0, 220) ?? '',
      ordinal: typeof entity.customProperties?.sequence === 'object'
        && entity.customProperties.sequence
        && typeof (entity.customProperties.sequence as { ordinal?: unknown }).ordinal === 'number'
        ? (entity.customProperties.sequence as { ordinal: number }).ordinal
        : null,
    })),
    relationships: snapshot.worldRelationships.map((relationship) => ({
      key: relationship.key,
      sourceEntityKey: relationship.sourceEntityKey,
      targetEntityKey: relationship.targetEntityKey,
      verb: relationship.verb,
    })),
  }
}

function streamEnvelopeToOpId(envelope: WorldPromptStreamGraphOpEnvelope) {
  return envelope.kind === 'op' ? envelope.op.id : null
}

function createStreamCounts() {
  return {
    ops: 0,
    entities: 0,
    relationships: 0,
    sequenceUnits: 0,
    wikiUpdates: 0,
    notes: 0,
    skipped: 0,
    failed: 0,
  }
}

const WORLD_PROMPT_GENERATION_QUEUE = 'world_prompt_generation'
const WORLD_PROMPT_GENERATION_STEP_PHASES = [
  { key: 'world_bible', phase: 'world_bible', label: 'World bible' },
  { key: 'core_entities', phase: 'core_entities', label: 'Core entities' },
  { key: 'sequence_units', phase: 'sequence_units', label: 'Story sequence' },
  { key: 'relationships', phase: 'relationships', label: 'Relationships' },
  { key: 'finalize', phase: 'finalize', label: 'Finalize world' },
] as const
const WORLD_PROMPT_FLY_GENERATION_STEP = { key: 'full_stream', phase: 'full_stream', label: 'Building world' } as const

type WorldPromptGenerationStepPhase =
  | typeof WORLD_PROMPT_FLY_GENERATION_STEP['phase']
  | typeof WORLD_PROMPT_GENERATION_STEP_PHASES[number]['phase']

function resolveInitialSeedGenerationRuntime() {
  return Deno.env.get('WORLD_PROMPT_GENERATION_RUNTIME')?.trim().toLowerCase() === 'supabase'
    ? 'supabase'
    : 'fly'
}

function isFlyGenerationJob(job: WorldPromptGenerationJob | { metadata?: Record<string, unknown> | null }) {
  return job.metadata?.runtime === 'fly'
}

function mergeStreamCounts(...entries: Array<Record<string, unknown> | null | undefined>) {
  const merged = createStreamCounts()
  for (const entry of entries) {
    if (!entry) continue
    for (const key of Object.keys(merged) as Array<keyof ReturnType<typeof createStreamCounts>>) {
      const value = entry[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged[key] += value
      }
    }
  }
  return merged
}

async function enqueueWorldPromptGenerationStep(input: {
  client: SupabaseClient
  jobId: string
  stepId: string
}) {
  const response = await input.client
    .rpc('enqueue_world_prompt_generation', {
      message: {
        jobId: input.jobId,
        stepId: input.stepId,
      },
    })
  if (response.error) throw new Error(response.error.message)
  return response.data
}

async function deleteWorldPromptGenerationQueueMessage(input: {
  client: SupabaseClient
  msgId: number | string
}) {
  const response = await input.client
    .rpc('delete_world_prompt_generation_message', {
      message_id: input.msgId,
    })
  if (response.error) throw new Error(response.error.message)
}

async function readWorldPromptGenerationQueueMessage(client: SupabaseClient) {
  const response = await client
    .rpc('read_world_prompt_generation')
  if (response.error) throw new Error(response.error.message)
  const rows = Array.isArray(response.data) ? response.data : []
  return rows[0] as { msg_id: number | string; message?: Record<string, unknown> } | undefined
}

async function kickWorldPromptGenerationWorker() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return
  const invoke = fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/process-world-generation-jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'world_prompt_generation_queue' }),
  }).catch((error) => {
    console.error('[world-generation-job] failed to kick worker.', error)
  })
  const waitUntil = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil(invoke)
  } else {
    void invoke
  }
}

async function worldPromptOpAlreadyApplied(input: {
  client: SupabaseClient
  turnId: string
  opId: string
}) {
  const response = await input.client
    .from('world_prompt_events')
    .select('id')
    .eq('turn_id', input.turnId)
    .eq('op_id', input.opId)
    .in('event_type', ['op_applied', 'assistant_note', 'queue_started'])
    .limit(1)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return Boolean(response.data)
}

async function updateGenerationJobProgress(input: {
  client: SupabaseClient
  jobId: string
  counts: Record<string, unknown>
  tokenUsage?: Record<string, unknown> | null
  latestAppliedOpCursor?: string | null
  status?: WorldPromptGenerationJob['status']
  errorMessage?: string | null
  completed?: boolean
  metadata?: Record<string, unknown> | null
}) {
  const now = new Date().toISOString()
  const changes: Record<string, unknown> = {
    counts: input.counts,
    heartbeat_at: now,
  }
  if (input.tokenUsage) changes.token_usage = input.tokenUsage
  if (input.latestAppliedOpCursor !== undefined) changes.latest_applied_op_cursor = input.latestAppliedOpCursor
  if (input.status) changes.status = input.status
  if (input.errorMessage !== undefined) changes.error_message = input.errorMessage
  if (input.completed) changes.completed_at = now
  if (input.metadata) changes.metadata = input.metadata
  return updateGenerationJob(input.client, input.jobId, changes)
}

async function createInitialSeedGenerationTurn(input: {
  client: SupabaseClient
  session: WorldPromptSession
  payload: z.infer<typeof worldPromptSeedGenerationRequestSchema>
  sourceContext: unknown
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  skeletonProfile: unknown
  selectedPreset: ReturnType<typeof getArtStylePreset>
  selectedArtStyleDescription: string
  projectContext: ProjectContext
  generationPrompt: string
}) {
  const insertedTurn = await input.client
    .from('world_prompt_turns')
    .insert({
      draft_id: input.payload.snapshot.draft.id,
      session_id: input.session.id,
      prompt: input.generationPrompt,
      status: 'streaming',
      model: input.payload.model,
      resolved_context: {
        summaryMemory: input.session.summaryMemory,
        selectedRootEntityKey: null,
        selectedViewKey: null,
        selectedThreadKey: null,
        resolvedMode: 'apply_compact_wave',
        resolvedIntent: 'graph_build',
        resolvedFocus: 'current_focus',
      },
      approval_state: 'not_required',
      assistant_summary: '',
      metadata: {
        sourceContext: input.sourceContext ?? undefined,
        initialSeedMode: 'generate_skeleton',
        initialSeedContext: {
          mode: 'generate_skeleton',
          sourceContext: input.sourceContext ?? undefined,
          inference: input.inference,
          selectedArtStylePreset: input.selectedPreset.id,
          selectedArtStyleDescription: input.selectedArtStyleDescription || input.selectedPreset.description,
          skeletonProfileId: (input.skeletonProfile as { id?: string }).id ?? null,
        },
        projectContextInference: input.inference,
        skeletonProfileId: (input.skeletonProfile as { id?: string }).id ?? null,
        resolvedMode: 'apply_compact_wave',
        resolvedIntent: 'graph_build',
        resolvedFocus: 'current_focus',
        streamedGeneration: true,
      },
    })
    .select(TURN_SELECT)
    .single()
  if (insertedTurn.error) throw new Error(insertedTurn.error.message)
  const turn = mapTurnRow(insertedTurn.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: input.session.id,
    turnId: turn.id,
    draftId: input.payload.snapshot.draft.id,
  })
  await writeEvent('turn_started', { session: input.session, turn })
  const userMessage = await insertPromptMessage({
    client: input.client,
    sessionId: input.session.id,
    turnId: turn.id,
    draftId: input.payload.snapshot.draft.id,
    role: 'user',
    content: input.generationPrompt,
    metadata: {
      sourceContext: input.sourceContext ?? undefined,
      initialSeedMode: 'generate_skeleton',
      streamedGeneration: true,
    },
  })
  await writeEvent('message_created', { message: userMessage, turn: { id: turn.id } })
  await writeEvent('planner_status', {
    plannerStatus: 'planning',
    plannerProgress: {
      phase: 'reading_context',
      message: 'Starting streamed initial world generation.',
      sequence: 0,
    },
    turn: { id: turn.id },
  })
  return { turn, writeEvent }
}

async function createInitialSeedGenerationJob(input: {
  client: SupabaseClient
  session: WorldPromptSession
  turn: WorldPromptTurn
  payload: z.infer<typeof worldPromptSeedGenerationRequestSchema>
  sourceContext: unknown
  inference: z.infer<typeof worldPromptProjectContextInferenceSchema>
  skeletonProfile: unknown
  selectedPreset: ReturnType<typeof getArtStylePreset>
  selectedArtStyleDescription: string
  projectContext: ProjectContext
  generationPrompt: string
  runtime: 'fly' | 'supabase'
}) {
  const response = await input.client
    .from('world_prompt_generation_jobs')
    .insert({
      draft_id: input.payload.snapshot.draft.id,
      session_id: input.session.id,
      turn_id: input.turn.id,
      kind: 'initial_seed_stream',
      status: 'queued',
      counts: createStreamCounts(),
      metadata: {
        runtime: input.runtime,
        streamMode: input.runtime === 'fly' ? 'single_response_ndjson' : 'phased_ndjson',
        model: input.payload.model,
        prompt: input.generationPrompt,
        sourceContext: input.sourceContext ?? null,
        inference: input.inference,
        selectedArtStylePreset: input.selectedPreset.id,
        selectedArtStyleDescription: input.selectedArtStyleDescription || input.selectedPreset.description,
        skeletonProfile: input.skeletonProfile,
        projectContext: input.projectContext,
        snapshot: input.payload.snapshot,
      },
    })
    .select(GENERATION_JOB_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapGenerationJobRow(response.data as WorldPromptGenerationJobRow)
}

async function createInitialSeedGenerationJobSteps(input: {
  client: SupabaseClient
  job: WorldPromptGenerationJob
  runtime: 'fly' | 'supabase'
}) {
  const phaseEntries = input.runtime === 'fly'
    ? [WORLD_PROMPT_FLY_GENERATION_STEP]
    : WORLD_PROMPT_GENERATION_STEP_PHASES
  const rows = phaseEntries.map((entry, index) => ({
    job_id: input.job.id,
    draft_id: input.job.draftId,
    session_id: input.job.sessionId,
    turn_id: input.job.turnId,
    step_key: entry.key,
    phase: entry.phase,
    status: 'queued',
    order_index: index,
    counts: createStreamCounts(),
    metadata: {
      label: entry.label,
      runtime: input.runtime,
    },
  }))
  const response = await input.client
    .from('world_prompt_generation_job_steps')
    .insert(rows)
    .select(GENERATION_JOB_STEP_SELECT)
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptGenerationJobStepRow[])
    .map((row) => mapGenerationJobStepRow(row))
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

function nextQueuedGenerationStep(steps: WorldPromptGenerationJobStep[]) {
  return steps
    .filter((step) => step.status === 'queued')
    .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null
}

async function runWorldPromptGenerationJob(input: {
  client: SupabaseClient
  authHeader: string
  jobId: string
  stepId?: string
}) {
  let job = await loadGenerationJobById(input.client, input.jobId)
  if (job.status === 'cancelled') return job
  let step = input.stepId ? await loadGenerationJobStepById(input.client, input.stepId) : null
  if (step && step.status === 'cancelled') return job
  const phase = (step?.phase ?? 'full_stream') as WorldPromptGenerationStepPhase
  const turn = await loadTurnById(input.client, job.turnId)
  const session = await loadSessionById(input.client, job.sessionId)
  const metadata = job.metadata ?? {}
  const snapshot = worldPromptSnapshotSchema.parse(metadata.snapshot)
  const inference = worldPromptProjectContextInferenceSchema.parse(metadata.inference)
  const projectContext = projectContextSchema.parse(metadata.projectContext)
  const skeletonProfile = metadata.skeletonProfile ?? getWorldSeedSkeletonProfile(inference.projectSubtype)
  const prompt = typeof metadata.prompt === 'string' ? metadata.prompt : turn.prompt
  const selectedArtStylePreset = typeof metadata.selectedArtStylePreset === 'string'
    ? metadata.selectedArtStylePreset
    : projectContext.artStylePreset
  const selectedArtStyleDescription = typeof metadata.selectedArtStyleDescription === 'string'
    ? metadata.selectedArtStyleDescription
    : projectContext.artStyleDescription
  const sourceContext = metadata.sourceContext
  const model = typeof metadata.model === 'string' ? metadata.model : turn.model
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: job.sessionId,
    turnId: job.turnId,
    draftId: job.draftId,
  })
  const usageRecorder = createWorldPromptTokenUsageRecorder()
  const startingJobCounts = structuredClone(job.counts ?? createStreamCounts()) as Record<string, unknown>
  const counts = createStreamCounts()
  const mutableSnapshot = structuredClone(snapshot) as WorldPromptSnapshot
  mutableSnapshot.projectContext = projectContext
  const touchedEntityKeys = new Set<string>()
  const touchedRelationshipKeys = new Set<string>()
  const appliedDefinitions: Array<Record<string, unknown>> = []
  const assistantNotes: string[] = []
  const deferredRelationshipOps: PromptToWorldOp[] = []
  let assistantSummary = ''
  let preferredAutoViewKey: string | null = null
  let streamRecordBuffer = ''
  let lastStreamHeartbeatAt = 0
  const repairDiagnostics: Array<Record<string, unknown>> = []
  let malformedRecordCount = 0
  let repairAttemptCount = 0
  let repairedRecordCount = 0
  let unrepairedRecordCount = 0
  let coverageContinuationCount = 0
  let autoIconBatchQueued = isRecord(job.metadata?.autoIconGeneration)
    && typeof job.metadata.autoIconGeneration.jobId === 'string'
    && job.metadata.autoIconGeneration.jobId.trim().length > 0

  const repairMetadata = () => ({
    malformedRecordCount,
    repairAttemptCount,
    repairedRecordCount,
    unrepairedRecordCount,
    coverageContinuationCount,
    repairDiagnostics: repairDiagnostics.slice(-20),
  })

  const rememberRepairDiagnostic = (diagnostic: Record<string, unknown>) => {
    repairDiagnostics.push({
      phase,
      stepId: step?.id ?? null,
      recordedAt: new Date().toISOString(),
      ...diagnostic,
    })
    if (repairDiagnostics.length > 60) repairDiagnostics.splice(0, repairDiagnostics.length - 60)
  }

  const persistRepairDiagnostics = async () => {
    const metadata = {
      ...(job.metadata ?? {}),
      ...repairMetadata(),
    }
    job = await updateGenerationJob(input.client, job.id, {
      metadata,
      heartbeat_at: new Date().toISOString(),
    })
    if (step) {
      step = await updateGenerationJobStep(input.client, step.id, {
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
        heartbeat_at: new Date().toISOString(),
      })
    }
  }

  const updateProgress = async (cursor?: string | null) => {
    const aggregateCounts = mergeStreamCounts(startingJobCounts, counts)
    job = await updateGenerationJobProgress({
      client: input.client,
      jobId: job.id,
      counts: aggregateCounts,
      latestAppliedOpCursor: cursor ?? undefined,
    })
    if (step) {
      step = await updateGenerationJobStep(input.client, step.id, {
        counts,
        heartbeat_at: new Date().toISOString(),
        latest_applied_op_cursor: cursor ?? undefined,
      })
    }
  }

  const ensureJobIsActive = async () => {
    const current = await loadGenerationJobById(input.client, job.id)
    if (current.status === 'cancelled') {
      await updateTurn(input.client, turn.id, {
        status: 'cancelled',
        assistant_summary: 'Initial world generation was cancelled.',
      })
      throw new Error('Initial world generation was cancelled.')
    }
    if (step) {
      const currentStep = await loadGenerationJobStepById(input.client, step.id)
      if (currentStep.status === 'cancelled') {
        throw new Error('Initial world generation step was cancelled.')
      }
    }
    await throwIfTurnCancelled(input.client, turn.id)
  }

  const maybeQueueInitialSeedIconBatch = async (trigger: string) => {
    if (autoIconBatchQueued) return
    autoIconBatchQueued = true
    try {
      const iconBatch = await enqueueInitialSeedEntityIconBatch({
        client: input.client,
        snapshot: mutableSnapshot,
        job,
        projectContext,
        trigger,
      })
      job = await updateGenerationJob(input.client, job.id, {
        metadata: {
          ...(job.metadata ?? {}),
          autoIconGeneration: {
            jobId: iconBatch.jobId,
            candidateCount: iconBatch.candidates.length,
            skippedCount: iconBatch.skippedCount,
            reusedActiveJob: iconBatch.reused,
            trigger,
            queuedAt: new Date().toISOString(),
          },
        },
        heartbeat_at: new Date().toISOString(),
      })
      if (iconBatch.jobId) {
        await writeEvent('planner_status', {
          plannerStatus: 'planning',
          plannerProgress: {
            phase: 'generating_entity',
            message: `Queued icon generation for ${iconBatch.candidates.length || 'existing'} world entities.`,
            sequence: counts.ops + counts.notes + 1,
          },
          turn: { id: turn.id },
          job,
        })
      }
    } catch (error) {
      console.warn('[GraphCore] initial seed icon batch enqueue failed', {
        jobId: job.id,
        turnId: turn.id,
        trigger,
        message: error instanceof Error ? error.message : String(error),
      })
      job = await updateGenerationJob(input.client, job.id, {
        metadata: {
          ...(job.metadata ?? {}),
          autoIconGeneration: {
            failed: true,
            trigger,
            errorMessage: error instanceof Error ? error.message : String(error),
            failedAt: new Date().toISOString(),
          },
        },
        heartbeat_at: new Date().toISOString(),
      })
    }
  }

  const handleEnvelope = async (envelope: WorldPromptStreamGraphOpEnvelope) => {
    await ensureJobIsActive()
    if (envelope.kind === 'note') {
      counts.notes += 1
      const note = stripInternalPlannerDiagnostics(envelope.message)
      assistantNotes.push(note)
      await writeEvent('assistant_note', {
        note,
        turn: { id: turn.id },
        plannerProgress: {
          phase: 'generating_entity',
          message: note,
          sequence: counts.ops + counts.notes,
        },
      })
      await updateProgress(null)
      return
    }

    if (envelope.kind === 'summary') {
      await flushDeferredRelationships()
      assistantSummary = stripInternalPlannerDiagnostics(envelope.assistantSummary)
      await writeEvent('assistant_note', {
        note: assistantSummary,
        turn: { id: turn.id },
        plannerProgress: {
          phase: 'finalizing_world',
          message: 'Summarizing the generated world.',
          sequence: counts.ops + counts.notes,
        },
      })
      await updateProgress(null)
      return
    }

    let op = normalizeStreamedSequenceOpKeys(envelope.op)
    if (await worldPromptOpAlreadyApplied({ client: input.client, turnId: turn.id, opId: op.id })) {
      counts.skipped += 1
      await updateProgress(op.id)
      return
    }

    if (op.op === 'upsert_entity' && op.payload.entity.nodeType === 'sequence_unit') {
      await maybeQueueInitialSeedIconBatch('first_sequence_unit')
      const repaired = await completeStreamedStorySequenceOp({
        model,
        prompt,
        snapshot: mutableSnapshot,
        op,
        usageRecorder,
      })
      op = repaired.op
      if (repaired.issues.length > 0) {
        counts.failed += 1
        const note = `Skipped incomplete sequence unit "${op.payload.entity.name}" because required Story sequence fields were still missing after repair.`
        assistantNotes.push(note)
        await writeEvent('assistant_note', {
          op,
          note,
          diagnostics: repaired.issues.map((issue) => `${issue.entityName} missing ${issue.missingFields.join(', ')}`),
          turn: { id: turn.id },
          ...tokenUsageEventPayload(usageRecorder),
        }, { opId: op.id })
        await updateProgress(op.id)
        return
      }
    }

    if (op.op === 'upsert_relationship' && !streamedRelationshipEndpointsExist(mutableSnapshot, op)) {
      const alreadyDeferred = deferredRelationshipOps.some((entry) => entry.id === op.id)
      if (!alreadyDeferred) {
        deferredRelationshipOps.push(op)
        await writeEvent('planner_status', {
          plannerStatus: 'planning',
          plannerProgress: {
            phase: 'mapping_relationships',
            message: 'Queued one relationship until both endpoint nodes exist.',
            sequence: counts.ops + deferredRelationshipOps.length,
          },
          turn: { id: turn.id },
        }, { opId: op.id })
      }
      await updateProgress(op.id)
      return
    }

    await writeEvent('planner_status', {
      plannerStatus: 'applying',
      plannerProgress: {
        phase: op.op === 'upsert_relationship'
          ? 'mapping_relationships'
          : op.op === 'update_world_wiki_metadata'
            ? 'finalizing_world'
            : op.op === 'upsert_entity' && op.payload.entity.nodeType === 'sequence_unit'
              ? 'generating_sequence_unit'
              : 'generating_entity',
        message: stripInternalPlannerDiagnostics(describePromptOp(op)) || `Applying streamed graph change ${counts.ops + 1}.`,
        sequence: counts.ops + 1,
      },
      turn: { id: turn.id },
    }, { opId: op.id })

    const result = await applyPromptOp({
      client: input.client,
      authHeader: input.authHeader,
      model,
      snapshot: mutableSnapshot,
      prompt,
      turnId: turn.id,
      op,
    })
    mergeAppliedWorldGraphIntoSnapshot(mutableSnapshot, result.applied)
    counts.ops += 1
    if (op.op === 'upsert_entity') {
      if (op.payload.entity.nodeType === 'sequence_unit') counts.sequenceUnits += 1
      else counts.entities += 1
    } else if (op.op === 'upsert_relationship') {
      counts.relationships += 1
    } else if (op.op === 'update_world_wiki_metadata') {
      counts.wikiUpdates += 1
    }

    if (Array.isArray(result.definitions)) {
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
      const note = stripInternalPlannerDiagnostics(result.note)
      assistantNotes.push(note)
      await writeEvent('assistant_note', {
        op,
        note,
        turn: { id: turn.id },
      }, { opId: op.id })
    } else {
      await writeEvent('op_applied', {
        op: { ...op, status: 'applied' },
        applied: result.applied,
        turn: { id: turn.id },
      }, { opId: op.id })
    }
    if (result.queue) {
      await writeEvent('queue_started', {
        op: { ...op, status: 'applied' },
        queue: result.queue,
        turn: { id: turn.id },
      }, { opId: op.id })
    }
    await updateProgress(op.id)
    if (op.op === 'upsert_entity') {
      await flushDeferredRelationships()
    }
  }

  async function flushDeferredRelationships() {
    if (deferredRelationshipOps.length === 0) return
    const pending = deferredRelationshipOps.splice(0, deferredRelationshipOps.length)
    for (const op of pending) {
      if (streamedRelationshipEndpointsExist(mutableSnapshot, op)) {
        await handleEnvelope({ kind: 'op', op })
      } else {
        deferredRelationshipOps.push(op)
      }
    }
  }

  const processStreamRecord = async (record: string) => {
    const normalized = normalizeStreamLine(record)
    if (!normalized) return
    const parsed = parseJsonWithDeterministicRepair(normalized)
    let validation = parsed.error
      ? { envelope: null as WorldPromptStreamGraphOpEnvelope | null, error: parsed.error as unknown }
      : validateNormalizedStreamRecord(parsed.value)
    const firstErrorMessage = validation.error instanceof z.ZodError
      ? compactSchemaDiagnostics(validation.error).join('; ')
      : validation.error instanceof Error
        ? validation.error.message
        : validation.error
          ? String(validation.error)
          : ''
    if (!validation.envelope && 'skipReason' in validation && validation.skipReason) {
      counts.skipped += 1
      rememberRepairDiagnostic({
        kind: 'skip',
        reason: validation.skipReason,
        sample: normalized.slice(0, 500),
      })
      await persistRepairDiagnostics()
      await updateProgress(null)
      return
    }
    let repaired = false
    if (!validation.envelope && shouldAttemptMalformedRecordRepair({
      record: normalized,
      errorMessage: firstErrorMessage,
      repairsUsed: repairAttemptCount,
      maxRepairs: 5,
    })) {
      malformedRecordCount += 1
      repairAttemptCount += 1
      try {
        const repairedRecord = await repairMalformedStreamRecordWithLlm({
          model,
          record: normalized,
          errorMessage: firstErrorMessage,
          phase,
          jobId: job.id,
          turnId: turn.id,
          currentCounts: counts,
          existingCanon: buildStreamedGenerationCanonLedger(mutableSnapshot),
          usageRecorder,
        })
        if (repairedRecord) {
          const repairedValidation = validateNormalizedStreamRecord(repairedRecord)
          if (repairedValidation.envelope) {
            validation = repairedValidation
            repaired = true
            repairedRecordCount += 1
            rememberRepairDiagnostic({
              kind: 'repaired',
              recordKind: isRecord(repairedRecord) ? repairedRecord.kind : null,
              originalError: firstErrorMessage,
              sample: normalized.slice(0, 500),
            })
          } else if ('skipReason' in repairedValidation && repairedValidation.skipReason) {
            counts.skipped += 1
            rememberRepairDiagnostic({
              kind: 'repair_skip',
              reason: repairedValidation.skipReason,
              originalError: firstErrorMessage,
              sample: normalized.slice(0, 500),
            })
            await persistRepairDiagnostics()
            await updateProgress(null)
            return
          }
        }
      } catch (repairError) {
        console.warn('[GraphCore] streamed generation repair failed', {
          jobId: job.id,
          stepId: step?.id ?? null,
          phase,
          error: repairError instanceof Error ? repairError.message : String(repairError),
        })
      }
    } else if (!validation.envelope && firstErrorMessage) {
      malformedRecordCount += 1
    }
    if (!validation.envelope) {
      counts.failed += 1
      unrepairedRecordCount += 1
      rememberRepairDiagnostic({
        kind: parsed.error ? 'malformed_unrepaired' : 'schema_unrepaired',
        error: firstErrorMessage,
        truncated: isLikelyTruncatedStreamRecord(normalized),
        sample: normalized.slice(0, 500),
      })
      console.warn('[GraphCore] skipped malformed streamed generation record', {
        jobId: job.id,
        stepId: step?.id ?? null,
        phase,
        error: firstErrorMessage,
        sample: normalized.slice(0, 500),
      })
      await persistRepairDiagnostics()
      await updateProgress(null)
      return
    }
    if (repaired) await persistRepairDiagnostics()
    await handleEnvelope(validation.envelope)
  }

  try {
    if (step) {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: 'running',
        attempt_count: step.attemptCount + 1,
        started_at: step.startedAt ?? new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        error_message: null,
      })
    }
    job = await updateGenerationJob(input.client, job.id, {
      status: 'running',
      attempt_count: job.attemptCount + 1,
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      error_message: null,
    })
    await writeEvent('planner_status', {
      plannerStatus: 'planning',
      plannerProgress: {
        phase: 'reading_context',
        message: step
          ? `Running ${String(step.metadata?.label ?? step.phase).toLowerCase()} generation step.`
          : 'Streaming the initial world skeleton in one generation pass.',
        sequence: 0,
      },
      turn: { id: turn.id },
    })

    const streamResponses: Array<Awaited<ReturnType<typeof runOpenAiResponsesStream>>> = []
    const runSeedStreamPass = async (pass: {
      passName: string
      instructions: string
      maxOutputTokens: number
    }) => {
      streamRecordBuffer = ''
      const response = await runOpenAiResponsesStream({
        model,
        input: buildStreamedInitialSeedInput({
          generationPrompt: prompt,
          sourceContext,
          inference,
          selectedArtStylePreset,
          selectedArtStyleDescription,
          skeletonProfile,
          projectContext,
          phase,
          existingCanon: buildStreamedGenerationCanonLedger(mutableSnapshot),
        }),
        instructions: pass.instructions,
        maxOutputTokens: pass.maxOutputTokens,
        reasoning: { effort: 'medium' },
        store: false,
        timeoutMs: isFlyGenerationJob(job)
          ? Number(Deno.env.get('WORLD_PROMPT_FLY_STREAM_TIMEOUT_MS') ?? 900_000)
          : 150_000,
        metadata: {
          surface: 'world-prompt-initial-seed-stream',
          turnId: turn.id,
          jobId: job.id,
          runtime: isFlyGenerationJob(job) ? 'fly' : 'supabase',
          passName: pass.passName,
        },
      }, {
        onEvent: async (event) => {
          const now = Date.now()
          if (now - lastStreamHeartbeatAt < 15_000) return
          lastStreamHeartbeatAt = now
          await updateGenerationJob(input.client, job.id, {
            heartbeat_at: new Date().toISOString(),
            metadata: {
              ...(job.metadata ?? {}),
              lastOpenAiStreamEvent: {
                type: event.type,
                sequenceNumber: event.sequenceNumber,
                receivedAt: new Date().toISOString(),
                passName: pass.passName,
              },
            },
          })
        },
        onTextDelta: async (delta) => {
          streamRecordBuffer += delta
          const extracted = extractCompleteStreamJsonRecords(streamRecordBuffer)
          streamRecordBuffer = extracted.rest
          for (const record of extracted.records) {
            await processStreamRecord(record)
          }
        },
      })
      if (streamRecordBuffer.trim().startsWith('{')) {
        await processStreamRecord(streamRecordBuffer)
        streamRecordBuffer = ''
      }
      streamResponses.push(response)
      usageRecorder.record({
        surface: 'world-prompt-initial-seed-stream',
        model,
        response,
        metadata: { jobId: job.id, turnId: turn.id, passName: pass.passName },
      })
      return response
    }

    await runSeedStreamPass({
      passName: 'full_stream',
      instructions: buildStreamedInitialSeedPhaseInstructions(phase),
      maxOutputTokens: phase === 'full_stream' ? 64_000 : 32_000,
    })

    const sequenceTarget = minimumInitialSeedSequenceUnits(inference)
    if (phase === 'full_stream' && sequenceTarget > 0 && counts.sequenceUnits < sequenceTarget) {
      coverageContinuationCount += 1
      rememberRepairDiagnostic({
        kind: 'coverage_continuation',
        target: 'sequence_units',
        current: counts.sequenceUnits,
        required: sequenceTarget,
      })
      await persistRepairDiagnostics()
      await writeEvent('planner_status', {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'generating_sequence_unit',
          message: `Completing missing story sequence units (${counts.sequenceUnits}/${sequenceTarget} created).`,
          sequence: counts.ops + counts.notes + 1,
        },
        turn: { id: turn.id },
      })
      await runSeedStreamPass({
        passName: 'sequence_units_continuation',
        instructions: buildStreamedInitialSeedContinuationInstructions({
          target: 'sequence_units',
          inference,
          currentCounts: counts,
        }),
        maxOutputTokens: 32_000,
      })
    }

    if (phase === 'full_stream' && counts.sequenceUnits > 0 && counts.relationships === 0) {
      coverageContinuationCount += 1
      rememberRepairDiagnostic({
        kind: 'coverage_continuation',
        target: 'relationships',
        current: counts.relationships,
      })
      await persistRepairDiagnostics()
      await writeEvent('planner_status', {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'mapping_relationships',
          message: 'Completing missing graph relationships from the created canon.',
          sequence: counts.ops + counts.notes + 1,
        },
        turn: { id: turn.id },
      })
      await runSeedStreamPass({
        passName: 'relationships_continuation',
        instructions: buildStreamedInitialSeedContinuationInstructions({
          target: 'relationships',
          inference,
          currentCounts: counts,
        }),
        maxOutputTokens: 24_000,
      })
    }
    await flushDeferredRelationships()
    if (deferredRelationshipOps.length > 0) {
      counts.skipped += deferredRelationshipOps.length
      await writeEvent('assistant_note', {
        note: `Skipped ${deferredRelationshipOps.length} deferred relationships because their endpoint nodes were not generated.`,
        turn: { id: turn.id },
        plannerProgress: {
          phase: 'mapping_relationships',
          message: `Skipped ${deferredRelationshipOps.length} deferred relationships with missing endpoints.`,
          sequence: counts.ops + counts.notes + 1,
          done: true,
        },
      })
      deferredRelationshipOps.splice(0, deferredRelationshipOps.length)
      await updateProgress(null)
    }
    for (const entityKey of [...touchedEntityKeys]) {
      const touchedEntity = mutableSnapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null
      if (!touchedEntity) continue
      const linkedEntity = await ensureAppliedEntityLinkedDefinition({
        client: input.client,
        snapshot: mutableSnapshot,
        entity: touchedEntity,
      })
      if (linkedEntity.createdDefinition && !appliedDefinitions.some((entry) => entry.key === linkedEntity.createdDefinition?.key)) {
        appliedDefinitions.push(linkedEntity.createdDefinition)
      }
    }
    if (touchedEntityKeys.size > 0 || touchedRelationshipKeys.size > 0) {
      const reconciledViews = await reconcileAutoManagedViewsForDraft({
        client: input.client,
        draftId: mutableSnapshot.draft.id,
        snapshot: mutableSnapshot,
        options: {
          recentEntityKeys: [...touchedEntityKeys],
          recentRelationshipKeys: [...touchedRelationshipKeys],
          preferredRootEntityKey: [...touchedEntityKeys][0] ?? null,
        },
      })
      preferredAutoViewKey = reconciledViews.preferredViewKey
      await writeEvent('op_applied', {
        applied: { worldViews: mutableSnapshot.worldViews },
        turn: { id: turn.id },
      })
    }

    const tokenUsage = usageRecorder.summary()
    const aggregateCounts = mergeStreamCounts(startingJobCounts, counts)
    const updatedJobMetadata = {
      ...(job.metadata ?? {}),
      snapshot: mutableSnapshot,
      ...repairMetadata(),
      lastCompletedStep: step
        ? {
            id: step.id,
            key: step.stepKey,
            phase: step.phase,
            completedAt: new Date().toISOString(),
          }
        : null,
      lastStepDefinitions: appliedDefinitions,
      openAiResponseId: typeof streamResponses.at(-1)?.body?.id === 'string' ? streamResponses.at(-1)?.body?.id : (job.metadata?.openAiResponseId ?? null),
    }

    if (step && phase !== 'finalize' && phase !== 'full_stream') {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: counts.failed > 0 ? 'completed' : 'completed',
        completed_at: new Date().toISOString(),
        counts,
        token_usage: tokenUsage ?? {},
        latest_applied_op_cursor: job.latestAppliedOpCursor,
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
      })
      job = await updateGenerationJob(input.client, job.id, {
        status: 'running',
        counts: aggregateCounts,
        token_usage: tokenUsage ?? job.tokenUsage,
        metadata: updatedJobMetadata,
        heartbeat_at: new Date().toISOString(),
      })
      const steps = await loadGenerationJobSteps(input.client, job.id)
      const nextStep = nextQueuedGenerationStep(steps)
      if (nextStep) {
        await enqueueWorldPromptGenerationStep({
          client: input.client,
          jobId: job.id,
          stepId: nextStep.id,
        })
        await kickWorldPromptGenerationWorker()
      }
      await writeEvent('planner_status', {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'generating_entity',
          message: `${String(step.metadata?.label ?? step.phase)} complete.`,
          sequence: aggregateCounts.ops + aggregateCounts.notes + 1,
          done: true,
        },
        turn: { id: turn.id },
        job,
        step,
        tokenUsage,
      })
      return await loadGenerationJobById(input.client, job.id)
    }

    const completedProjectContext = buildCompletedProjectContextFromInitialSeedContext(turn.metadata?.initialSeedContext)
    if (completedProjectContext) {
      await persistProjectContextForSeed({
        client: input.client,
        snapshot: mutableSnapshot,
        projectContext: completedProjectContext,
      })
    }

    const finalSummary = assistantSummary || [
      `Created ${aggregateCounts.entities} entities, ${aggregateCounts.sequenceUnits} sequence units, and ${aggregateCounts.relationships} relationships.`,
      repairedRecordCount > 0 ? `${repairedRecordCount} streamed records were repaired.` : null,
      coverageContinuationCount > 0 ? `${coverageContinuationCount} coverage continuation pass${coverageContinuationCount === 1 ? '' : 'es'} ran.` : null,
      aggregateCounts.failed > 0 ? `${aggregateCounts.failed} streamed records were skipped.` : null,
    ].filter(Boolean).join(' ')
    const assistantMessage = await insertPromptMessage({
      client: input.client,
      sessionId: session.id,
      turnId: turn.id,
      draftId: mutableSnapshot.draft.id,
      role: 'assistant',
      content: finalSummary,
      metadata: {
        streamedGeneration: true,
        counts: aggregateCounts,
        tokenUsage: tokenUsage ?? undefined,
        definitions: appliedDefinitions,
      },
    })
    await writeEvent('message_created', { message: assistantMessage, turn: { id: turn.id } })
    const finalTurnStatus = aggregateCounts.ops > 0 ? 'completed' : 'failed'
    const finalJobStatus = aggregateCounts.failed > 0 && aggregateCounts.ops > 0
      ? 'completed_with_errors'
      : aggregateCounts.ops > 0
        ? 'completed'
        : 'failed'
    const completedTurn = await updateTurn(input.client, turn.id, {
      status: finalTurnStatus,
      approval_state: 'not_required',
      assistant_summary: finalSummary,
      error_message: finalTurnStatus === 'failed' ? 'Initial world generation did not produce valid graph records.' : null,
      metadata: {
        ...(turn.metadata ?? {}),
        streamedGeneration: true,
        tokenUsage: tokenUsage ?? undefined,
        counts: aggregateCounts,
        selectedViewKey: preferredAutoViewKey,
        definitions: appliedDefinitions,
      },
    })
    const updatedSession = await updateSessionLifecycle({
      client: input.client,
      session,
      prompt,
      assistantSummary: finalSummary,
      selectedRootEntityKey: [...touchedEntityKeys][0] ?? null,
      selectedViewKey: preferredAutoViewKey,
      selectedThreadKey: null,
      summaryMemory: buildRollingSessionMemory({
        session,
        turn: completedTurn,
        assistantSummary: finalSummary,
        snapshot: mutableSnapshot,
        selectedThreadKey: null,
      }),
      sessionMemoryState: buildSessionMemoryState({
        session,
        turn: completedTurn,
        assistantSummary: finalSummary,
        selectedThreadKey: null,
      }),
      retrievalDiagnostics: {
        focusLayer: 'general',
        continuityMode: 'fresh_question',
        retrievedEntityKeys: [...touchedEntityKeys],
        retrievedThreadKeys: [],
        selectedViewKey: preferredAutoViewKey,
      },
    })
    await updateGenerationJobProgress({
      client: input.client,
      jobId: job.id,
      counts: aggregateCounts,
      tokenUsage: tokenUsage as unknown as Record<string, unknown> | null,
      status: finalJobStatus,
      completed: true,
      errorMessage: finalJobStatus === 'failed' ? 'Initial world generation did not produce valid graph records.' : null,
      metadata: updatedJobMetadata,
    })
    if (step) {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: finalJobStatus === 'failed' ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        counts,
        token_usage: tokenUsage ?? {},
        error_message: finalJobStatus === 'failed' ? 'Initial world generation did not produce valid graph records.' : null,
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
      })
    }
    await writeEvent('planner_status', {
      plannerStatus: finalTurnStatus === 'completed' ? 'completed' : 'blocked',
      plannerProgress: {
        phase: 'finalizing_world',
        message: finalSummary,
        sequence: aggregateCounts.ops + aggregateCounts.notes + 1,
        done: true,
      },
      turn: completedTurn,
      session: updatedSession,
      tokenUsage,
    })
    await writeEvent(finalTurnStatus === 'completed' ? 'turn_completed' : 'turn_failed', {
      note: finalSummary,
      turn: completedTurn,
      session: updatedSession,
      diagnostics: aggregateCounts.failed > 0 ? [`${aggregateCounts.failed} streamed records were skipped.`] : [],
      tokenUsage,
    })
    return await loadGenerationJobById(input.client, job.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Initial world generation failed.'
    const cancelled = message.toLowerCase().includes('cancelled')
    const aggregateCounts = mergeStreamCounts(startingJobCounts, counts)
    if (step && !cancelled && step.attemptCount < 2) {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: 'queued',
        error_message: message,
        counts,
        token_usage: usageRecorder.summary() ?? {},
        heartbeat_at: new Date().toISOString(),
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
      })
      job = await updateGenerationJob(input.client, job.id, {
        status: isFlyGenerationJob(job) ? 'queued' : 'running',
        counts: aggregateCounts,
        metadata: {
          ...(job.metadata ?? {}),
          snapshot: mutableSnapshot,
          ...repairMetadata(),
          lastFailedStep: {
            id: step.id,
            key: step.stepKey,
            phase: step.phase,
            message,
            failedAt: new Date().toISOString(),
          },
        },
        heartbeat_at: new Date().toISOString(),
      })
      if (!isFlyGenerationJob(job)) {
        await enqueueWorldPromptGenerationStep({
          client: input.client,
          jobId: job.id,
          stepId: step.id,
        })
        await kickWorldPromptGenerationWorker()
      }
      await writeEvent('planner_status', {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'reading_context',
          message: `Retrying ${String(step.metadata?.label ?? step.phase).toLowerCase()} generation step.`,
          sequence: aggregateCounts.ops + aggregateCounts.notes + 1,
        },
        turn: { id: turn.id },
        job,
        step,
      })
      return await loadGenerationJobById(input.client, job.id)
    }
    if (step && !cancelled && (phase === 'relationships' || phase === 'finalize') && phase !== 'finalize') {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
        counts,
        token_usage: usageRecorder.summary() ?? {},
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
      })
      job = await updateGenerationJob(input.client, job.id, {
        status: 'running',
        counts: aggregateCounts,
        metadata: {
          ...(job.metadata ?? {}),
          snapshot: mutableSnapshot,
          ...repairMetadata(),
          skippedStep: {
            id: step.id,
            key: step.stepKey,
            phase: step.phase,
            message,
            skippedAt: new Date().toISOString(),
          },
        },
        heartbeat_at: new Date().toISOString(),
      })
      const steps = await loadGenerationJobSteps(input.client, job.id)
      const nextStep = nextQueuedGenerationStep(steps)
      if (nextStep) {
        await enqueueWorldPromptGenerationStep({ client: input.client, jobId: job.id, stepId: nextStep.id })
        await kickWorldPromptGenerationWorker()
      }
      await writeEvent('assistant_note', {
        note: `${String(step.metadata?.label ?? step.phase)} failed after retry; continuing with the partial world.`,
        diagnostics: [message],
        turn: { id: turn.id },
      })
      return await loadGenerationJobById(input.client, job.id)
    }
    const nextStatus = cancelled ? 'cancelled' : aggregateCounts.ops > 0 ? 'completed_with_errors' : 'failed'
    const nextTurnStatus = cancelled ? 'cancelled' : aggregateCounts.ops > 0 ? 'completed' : 'failed'
    const finalSummary = aggregateCounts.ops > 0
      ? `Initial world generation stopped after creating ${aggregateCounts.ops} graph records. ${message}`
      : `Initial world generation failed before graph records could be created. ${message}`
    const updatedTurn = await updateTurn(input.client, turn.id, {
      status: nextTurnStatus,
      approval_state: 'not_required',
      assistant_summary: finalSummary,
      error_message: nextTurnStatus === 'failed' ? message : null,
      metadata: {
        ...(turn.metadata ?? {}),
        streamedGeneration: true,
        counts: aggregateCounts,
        tokenUsage: usageRecorder.summary() ?? undefined,
      },
    })
    if (step) {
      step = await updateGenerationJobStep(input.client, step.id, {
        status: cancelled ? 'cancelled' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: cancelled ? null : message,
        counts,
        token_usage: usageRecorder.summary() ?? {},
        metadata: {
          ...(step.metadata ?? {}),
          ...repairMetadata(),
        },
      })
    }
    await updateGenerationJobProgress({
      client: input.client,
      jobId: job.id,
      counts: aggregateCounts,
      tokenUsage: usageRecorder.summary() as unknown as Record<string, unknown> | null,
      status: nextStatus,
      completed: true,
      errorMessage: cancelled ? null : message,
      metadata: {
        ...(job.metadata ?? {}),
        snapshot: mutableSnapshot,
        ...repairMetadata(),
      },
    })
    await writeEvent(nextTurnStatus === 'failed' ? 'turn_failed' : 'turn_completed', {
      note: finalSummary,
      diagnostics: [message],
      turn: updatedTurn,
      session,
      tokenUsage: usageRecorder.summary() ?? undefined,
    }).catch((eventError) => {
      console.error('[world-generation-job] failed to write terminal event.', eventError)
    })
    return await loadGenerationJobById(input.client, job.id)
  }
}

export async function startWorldSeedInference(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptSeedInferenceRequestSchema.parse(input.payload)
  const requestPayload = worldPromptStartTurnRequestSchema.parse({
    prompt: payload.prompt,
    model: payload.model,
    sessionKey: payload.sessionKey,
    sourceContext: payload.sourceContext,
    initialSeedMode: 'infer_context',
    selectedSuggestionId: null,
    selectedRootEntityKey: null,
    selectedViewKey: null,
    selectedThreadKey: null,
    snapshot: payload.snapshot,
  })
  const session = await ensurePromptSession({ client: input.client, payload: requestPayload })
  const insertedTurn = await input.client
    .from('world_prompt_turns')
    .insert({
      draft_id: payload.snapshot.draft.id,
      session_id: session.id,
      prompt: payload.prompt,
      status: 'streaming',
      model: payload.model,
      resolved_context: {
        summaryMemory: session.summaryMemory,
        resolvedMode: 'apply_compact_wave',
        resolvedIntent: 'graph_build',
        resolvedFocus: 'current_focus',
      },
      approval_state: 'not_required',
      assistant_summary: '',
      metadata: {
        sourceContext: payload.sourceContext ?? undefined,
        initialSeedMode: 'infer_context',
        initialSeedContext: {
          mode: 'infer_context',
          sourceContext: payload.sourceContext ?? undefined,
        },
      },
    })
    .select(TURN_SELECT)
    .single()
  if (insertedTurn.error) throw new Error(insertedTurn.error.message)
  let turn = mapTurnRow(insertedTurn.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: session.id,
    turnId: turn.id,
    draftId: payload.snapshot.draft.id,
  })
  const tokenUsageRecorder = createWorldPromptTokenUsageRecorder()

  try {
    await writeEvent('turn_started', { session, turn })
    const userMessage = await insertPromptMessage({
      client: input.client,
      sessionId: session.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'user',
      content: payload.prompt,
      metadata: {
        sourceContext: payload.sourceContext ?? undefined,
        initialSeedMode: 'infer_context',
      },
    })
    await writeEvent('message_created', { message: userMessage, turn: { id: turn.id } })
    await writeEvent('planner_status', {
      plannerStatus: 'planning',
      plannerProgress: {
        phase: 'reading_context',
        message: 'Reading the prompt and optional source to infer the project shape.',
        sequence: 1,
      },
      note: 'Reading the prompt and optional source to infer the project shape.',
      turn: { id: turn.id },
    })
    const rawInference = await inferInitialSeedContext({
      model: payload.model,
      prompt: payload.prompt,
      sourceContext: payload.sourceContext ?? null,
      usageRecorder: tokenUsageRecorder,
    })
    const inference = worldPromptProjectContextInferenceSchema.parse(rawInference)
    const artStyleOptions = buildSeedInferenceStyleOptions(rawInference)
    const skeletonProfile = getWorldSeedSkeletonProfile(inference.projectSubtype)
    const note = `I inferred ${inference.projectType.replace(/_/g, ' ')} / ${inference.projectSubtype.replace(/_/g, ' ')}. Choose an art style and I will build the initial skeleton.`
    turn = await updateTurn(input.client, turn.id, {
      status: 'awaiting_user_input',
      approval_state: 'not_required',
      assistant_summary: note,
      metadata: {
        ...(turn.metadata ?? {}),
        sourceContext: payload.sourceContext ?? undefined,
        projectContextInference: inference,
        initialSeedMode: 'infer_context',
        initialSeedContext: {
          mode: 'infer_context',
          sourceContext: payload.sourceContext ?? undefined,
          inference,
          selectedArtStylePreset: null,
          selectedArtStyleDescription: '',
          skeletonProfileId: skeletonProfile.id,
        },
        artStyleOptions,
        skeletonProfileId: skeletonProfile.id,
        tokenUsage: tokenUsageRecorder.summary() ?? undefined,
      },
    })
    const assistantMessage = await insertPromptMessage({
      client: input.client,
      sessionId: session.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'assistant',
      content: note,
      metadata: {
        projectContextInference: inference,
        artStyleOptions,
        skeletonProfile,
        initialSeedMode: 'infer_context',
      },
    })
    await writeEvent('assistant_note', {
      note,
      turn,
      diagnostics: [inference.rationale].filter(Boolean),
    })
    await writeEvent('message_created', { message: assistantMessage, turn })
    await writeEvent('planner_status', {
      plannerStatus: 'completed',
      note: 'Inference complete. Waiting for art style selection.',
      turn,
    })
    return worldPromptSeedInferenceResponseSchema.parse({
      ok: true,
      session,
      turn,
      messages: await loadTurnMessages(input.client, turn.id),
      events: await loadTurnEvents(input.client, turn.id),
      inference,
      artStyleOptions,
      skeletonProfile,
    })
  } catch (error) {
    turn = await updateTurn(input.client, turn.id, {
      status: 'failed',
      approval_state: 'not_required',
      error_message: error instanceof Error ? error.message : 'World seed inference failed.',
      metadata: {
        ...(turn.metadata ?? {}),
        tokenUsage: tokenUsageRecorder.summary() ?? undefined,
      },
    })
    await writeEvent('turn_failed', {
      turn,
      diagnostics: [error instanceof Error ? error.message : 'World seed inference failed.'],
      session,
    })
    throw error
  }
}

const INCREMENTAL_WORK_ITEM_TARGET_CHARS = 24_000
const INCREMENTAL_WORK_ITEM_LEDGER_ONLY_CUMULATIVE_TOKENS = 90_000

type IncrementalPlannerResult = {
  manifest: WorldPromptIncrementalManifest
  retrievalPacket: Awaited<ReturnType<typeof buildWorldPromptRetrievalPacket>>
}

type WorldPromptEventWriter = (
  eventType: WorldPromptEvent['eventType'],
  payload: Record<string, unknown>,
  options?: { opId?: string | null; metadata?: Record<string, unknown> },
) => Promise<WorldPromptEvent>

function shouldUseIncrementalPromptPlanning(input: {
  payload: WorldPromptStartTurnRequest
  plannerMode: PlannerMode
  entityRequirements: WorldPromptEntityRequirements
  selectedSuggestion?: WorldPromptSuggestionRecord | null
}) {
  if (input.payload.initialSeedMode === 'generate_skeleton') return true
  if (input.plannerMode !== 'direct_build') return false
  if (input.selectedSuggestion) return false
  const prompt = input.payload.prompt.toLowerCase()
  const sourceContext = input.payload.sourceContext ?? null
  const sourceCharCount = sourceContext?.charCount ?? sourceContext?.extractedText?.length ?? 0
  const requestedSequence = /\b(chapters?|episodes?|acts?|story\s+arc|sequence|beats?|missions?|quests?|campaign\s+moments?)\b/i.test(input.payload.prompt)
  const broadSeedLanguage = input.entityRequirements.hasSeedWorldShape
    && /\b(full|complete|whole|skeleton|cast|locations?|factions?|objects?|relationships?|arc|timeline|world\s+map)\b/i.test(prompt)
  return (
    input.entityRequirements.minimumEntityOps >= 8
    || sourceCharCount > 6000
    || requestedSequence
    || broadSeedLanguage
  )
}

function firstPlannerSentence(value: string, maxLength: number) {
  const compact = trimPlannerText(value, maxLength)
  const sentence = compact.match(/^(.+?[.!?])\s/)?.[1]
  return trimPlannerText(sentence ?? compact, maxLength)
}

function compactPlannerArray(values: string[], maxItems: number, maxLength: number) {
  return values
    .map((value) => trimPlannerText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function inferBuildBriefFromManifest(input: {
  manifest: WorldPromptIncrementalManifest
  payload: WorldPromptStartTurnRequest
}): WorldPromptIncrementalBuildBrief {
  const promptStrategy = getWorldPromptStrategy(input.payload.snapshot.projectContext)
  const sourceContext = input.payload.sourceContext ?? null
  const profile = input.payload.initialSeedMode === 'generate_skeleton'
    ? getWorldSeedSkeletonProfile(((input.manifest.projectContextInference?.projectSubtype
      ?? input.payload.initialSeedContext?.inference?.projectSubtype
      ?? input.payload.snapshot.projectContext?.projectSubtype
      ?? 'feature_film') as ProjectSubtype))
    : null
  const promptSummary = firstPlannerSentence(input.payload.prompt, 420)
  const sourceOutline = sourceContext?.extractedText
    ? firstPlannerSentence(sourceContext.extractedText, 700)
    : ''
  const workItemCoverage = input.manifest.workItems.map((item) => `${item.label}: ${item.objective || item.kind}`)
  const profileRequirements = profile?.categories?.map((category) => `${category.label}: ${category.purpose}`) ?? []
  return worldPromptIncrementalBuildBriefSchema.parse({
    ...(input.manifest.buildBrief ?? {}),
    summary: input.manifest.buildBrief?.summary || input.manifest.summary || promptSummary,
    sourceOutline: input.manifest.buildBrief?.sourceOutline || sourceOutline,
    requirements: compactPlannerArray([
      ...(input.manifest.buildBrief?.requirements ?? []),
      ...profileRequirements,
    ], 14, 180),
    canonConstraints: compactPlannerArray([
      ...(input.manifest.buildBrief?.canonConstraints ?? []),
      input.payload.initialSeedMode === 'generate_skeleton' ? 'Create a complete initial skeleton before final summary work.' : '',
      projectContextIsApp(input.payload.snapshot.projectContext)
        ? 'Use valid app node types only: app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, code_file. Never use sequence_unit for app UX.'
        : 'Use valid world node types only: actor, group, place, object, concept, event, sequence_unit.',
      ...promptStrategy.incrementalManifestGuidance.slice(0, 3),
    ], 10, 180),
    tone: compactPlannerArray([
      ...(input.manifest.buildBrief?.tone ?? []),
      input.payload.snapshot.projectContext?.artStyleDescription ?? '',
    ], 8, 120),
    plannedCoverage: compactPlannerArray([
      ...(input.manifest.buildBrief?.plannedCoverage ?? []),
      ...workItemCoverage,
    ], 24, 160),
    sourceExcerptKeys: compactPlannerArray(input.manifest.buildBrief?.sourceExcerptKeys ?? [], 12, 80),
  })
}

function buildIncrementalLedger(input: {
  snapshot: WorldPromptSnapshot
  maxEntries?: number
}): WorldPromptBuildLedgerEntry[] {
  const entries: WorldPromptBuildLedgerEntry[] = []
  for (const entity of input.snapshot.worldEntities) {
    const sequence = entity.nodeType === 'sequence_unit' ? readWorldSequenceMetadata(entity) : null
    entries.push(worldPromptBuildLedgerEntrySchema.parse({
      key: entity.key,
      entryType: entity.nodeType === 'sequence_unit' ? 'sequence_stub' : 'entity',
      nodeType: entity.nodeType,
      name: entity.name,
      role: firstPlannerSentence(entity.summary || entity.context || entity.name, 120),
      ordinal: sequence?.ordinal ?? null,
      storyFunction: sequence?.storyFunction ?? '',
      outcome: sequence?.outcome ? firstPlannerSentence(sequence.outcome, 120) : '',
    }))
  }
  for (const relationship of input.snapshot.worldRelationships) {
    entries.push(worldPromptBuildLedgerEntrySchema.parse({
      key: relationship.key,
      entryType: 'relationship',
      sourceEntityKey: relationship.sourceEntityKey,
      targetEntityKey: relationship.targetEntityKey,
      verb: relationship.verb,
      role: relationship.verb,
    }))
  }
  for (const thread of input.snapshot.worldThreads.filter((thread) => thread.status === 'open')) {
    entries.push(worldPromptBuildLedgerEntrySchema.parse({
      key: thread.key,
      entryType: 'thread',
      name: thread.title,
      role: firstPlannerSentence(thread.summary || thread.title, 120),
      linkedEntityKeys: thread.linkedEntityKeys.slice(0, 12),
    }))
  }
  const maxEntries = input.maxEntries ?? 160
  return entries.slice(Math.max(0, entries.length - maxEntries))
}

function workItemSearchTerms(workItem: WorldPromptIncrementalWorkItem) {
  return new Set(
    `${workItem.label} ${workItem.objective} ${workItem.kind} ${workItem.entityTypes.join(' ')} ${workItem.sequenceOrdinal ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && !WORLD_PROMPT_SEARCH_STOP_WORDS.has(part)),
  )
}

function entityMatchesWorkItem(entity: WorldEntity, workItem: WorldPromptIncrementalWorkItem, terms: Set<string>) {
  if (workItem.entityTypes.includes(entity.nodeType)) return true
  if (workItem.kind === 'sequence_unit' && entity.nodeType === 'sequence_unit') return true
  if (workItem.kind === 'relationship_batch') return true
  const haystack = `${entity.key} ${entity.name} ${entity.summary} ${entity.tags.join(' ')}`.toLowerCase()
  for (const term of terms) {
    if (haystack.includes(term)) return true
  }
  return false
}

function dependencyWorkItems(manifest: WorldPromptIncrementalManifest, workItem: WorldPromptIncrementalWorkItem) {
  const dependencyIds = new Set(workItem.dependsOn)
  return manifest.workItems.filter((candidate) => dependencyIds.has(candidate.id))
}

function adjacentWorkItems(manifest: WorldPromptIncrementalManifest, workItem: WorldPromptIncrementalWorkItem) {
  const index = manifest.workItems.findIndex((candidate) => candidate.id === workItem.id)
  if (index < 0) return []
  return [manifest.workItems[index - 1], manifest.workItems[index + 1]]
    .filter((candidate): candidate is WorldPromptIncrementalWorkItem => Boolean(candidate))
    .map((candidate) => worldPromptIncrementalWorkItemSchema.parse({
      ...candidate,
      objective: trimPlannerText(candidate.objective, 180),
    }))
}

function buildWorkItemSourceExcerpts(input: {
  payload: WorldPromptStartTurnRequest
  workItem: WorldPromptIncrementalWorkItem
  ledgerOnly: boolean
}) {
  if (input.ledgerOnly) return []
  const source = input.payload.sourceContext?.extractedText?.trim() ?? ''
  if (!source) return []
  const terms = Array.from(workItemSearchTerms(input.workItem))
  const lowerSource = source.toLowerCase()
  const matchedIndex = terms
    .map((term) => lowerSource.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const start = Math.max(0, (matchedIndex ?? 0) - 300)
  const text = trimPlannerText(source.slice(start, start + 1_200), 1_200)
  return text
    ? [{
        key: `${input.workItem.id}_source_excerpt`,
        title: input.payload.sourceContext?.title || input.payload.sourceContext?.fileName || 'Source excerpt',
        text,
      }]
    : []
}

function buildRelevantWorkItemEntities(input: {
  snapshot: WorldPromptSnapshot
  workItem: WorldPromptIncrementalWorkItem
  ledgerOnly: boolean
}) {
  if (input.ledgerOnly) return []
  const terms = workItemSearchTerms(input.workItem)
  const candidates = input.snapshot.worldEntities.filter((entity) => entityMatchesWorkItem(entity, input.workItem, terms))
  const fallback = input.snapshot.worldEntities.slice(-28)
  const selected = (candidates.length > 0 ? candidates : fallback).slice(-42)
  return selected.map((entity) => {
    const sequence = entity.nodeType === 'sequence_unit' ? readWorldSequenceMetadata(entity) : null
    return {
      key: entity.key,
      name: entity.name,
      nodeType: entity.nodeType,
      summary: firstPlannerSentence(entity.summary, 140),
      sequence: sequence
        ? {
            ordinal: sequence.ordinal ?? null,
            storyFunction: sequence.storyFunction ?? '',
            outcome: sequence.outcome ? firstPlannerSentence(sequence.outcome, 120) : '',
          }
        : null,
    }
  })
}

function buildRelevantWorkItemRelationships(input: {
  snapshot: WorldPromptSnapshot
  relevantEntityKeys: Set<string>
  workItem: WorldPromptIncrementalWorkItem
  ledgerOnly: boolean
}) {
  if (input.ledgerOnly) return []
  const includeNotes = input.workItem.kind === 'relationship_batch'
    && input.relevantEntityKeys.size <= 12
  return input.snapshot.worldRelationships
    .filter((relationship) => input.relevantEntityKeys.has(relationship.sourceEntityKey) || input.relevantEntityKeys.has(relationship.targetEntityKey))
    .slice(-36)
    .map((relationship) => ({
      key: relationship.key,
      sourceEntityKey: relationship.sourceEntityKey,
      targetEntityKey: relationship.targetEntityKey,
      verb: relationship.verb,
      notes: includeNotes ? firstPlannerSentence(relationship.notes, 140) : '',
    }))
}

function buildRelevantWorkItemThreads(input: {
  snapshot: WorldPromptSnapshot
  relevantEntityKeys: Set<string>
  ledgerOnly: boolean
}) {
  if (input.ledgerOnly) return []
  return input.snapshot.worldThreads
    .filter((thread) => thread.linkedEntityKeys.some((key) => input.relevantEntityKeys.has(key)))
    .slice(-8)
    .map((thread) => ({
      key: thread.key,
      title: thread.title,
      summary: firstPlannerSentence(thread.summary, 140),
      linkedEntityKeys: thread.linkedEntityKeys.slice(0, 12),
    }))
}

function buildCompactWorkItemPrompt(input: {
  payload: WorldPromptStartTurnRequest
  snapshot: WorldPromptSnapshot
  manifest: WorldPromptIncrementalManifest
  workItem: WorldPromptIncrementalWorkItem
  completedWorkItems: WorldPromptIncrementalWorkItem[]
  failedWorkItems: Array<{ item: WorldPromptIncrementalWorkItem; reason: string }>
  workItemIndex: number
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const usage = input.usageRecorder?.summary()
  const ledgerOnlyByBudget = (usage?.totalTokens ?? 0) >= INCREMENTAL_WORK_ITEM_LEDGER_ONLY_CUMULATIVE_TOKENS
  const buildBrief = inferBuildBriefFromManifest({
    manifest: input.manifest,
    payload: input.payload,
  })
  const ledger = buildIncrementalLedger({
    snapshot: input.snapshot,
    maxEntries: ledgerOnlyByBudget ? 90 : 160,
  })
  const relevantEntities = buildRelevantWorkItemEntities({
    snapshot: input.snapshot,
    workItem: input.workItem,
    ledgerOnly: ledgerOnlyByBudget,
  })
  const relevantEntityKeys = new Set(relevantEntities.map((entity) => entity.key))
  const baseContext = worldPromptWorkItemContextSchema.parse({
    buildBrief,
    currentWorkItem: input.workItem,
    dependencies: dependencyWorkItems(input.manifest, input.workItem).map((item) => ({
      ...item,
      objective: trimPlannerText(item.objective, 180),
    })),
    adjacentWorkItems: adjacentWorkItems(input.manifest, input.workItem),
    completedWorkItems: input.completedWorkItems.map((item) => ({ id: item.id, label: item.label, kind: item.kind })),
    failedWorkItems: input.failedWorkItems.map((entry) => ({ id: entry.item.id, label: entry.item.label, reason: trimPlannerText(entry.reason, 180) })),
    ledger,
    relevantEntities,
    relevantRelationships: buildRelevantWorkItemRelationships({
      snapshot: input.snapshot,
      relevantEntityKeys,
      workItem: input.workItem,
      ledgerOnly: ledgerOnlyByBudget,
    }),
    relevantThreads: buildRelevantWorkItemThreads({
      snapshot: input.snapshot,
      relevantEntityKeys,
      ledgerOnly: ledgerOnlyByBudget,
    }),
    sourceExcerpts: buildWorkItemSourceExcerpts({
      payload: input.payload,
      workItem: input.workItem,
      ledgerOnly: ledgerOnlyByBudget,
    }),
    ledgerOnly: ledgerOnlyByBudget,
  })
  const basePromptChars = JSON.stringify(baseContext).length
  const ledgerOnly = ledgerOnlyByBudget || basePromptChars > INCREMENTAL_WORK_ITEM_TARGET_CHARS
  const context: WorldPromptWorkItemContext = ledgerOnly && !baseContext.ledgerOnly
    ? worldPromptWorkItemContextSchema.parse({
        ...baseContext,
        ledger: baseContext.ledger.slice(-90),
        relevantEntities: baseContext.relevantEntities.slice(-16),
        relevantRelationships: [],
        relevantThreads: [],
        sourceExcerpts: [],
        ledgerOnly: true,
      })
    : baseContext
  const promptObject = {
    sourcePromptSummary: firstPlannerSentence(input.payload.prompt, 600),
    projectContext: input.payload.snapshot.projectContext,
    initialSeed: input.payload.initialSeedMode === 'generate_skeleton'
      ? {
          inference: input.payload.initialSeedContext?.inference ?? input.manifest.projectContextInference ?? null,
          selectedArtStylePreset: input.payload.initialSeedContext?.selectedArtStylePreset ?? input.payload.snapshot.projectContext?.artStylePreset ?? null,
          selectedArtStyleDescription: input.payload.initialSeedContext?.selectedArtStyleDescription ?? input.payload.snapshot.projectContext?.artStyleDescription ?? '',
        }
      : null,
    manifestSummary: {
      summary: input.manifest.summary,
      classification: input.manifest.classification,
      workItemCount: input.manifest.workItems.length,
    },
    workItemContext: context,
  }
  const diagnostics: WorldPromptTokenBudgetDiagnostics = worldPromptTokenBudgetDiagnosticsSchema.parse({
    surface: 'incremental-work-item',
    promptChars: JSON.stringify(promptObject).length,
    sourceChars: JSON.stringify(context.sourceExcerpts).length,
    retrievalChars: 0,
    manifestChars: JSON.stringify(promptObject.manifestSummary).length + JSON.stringify(context.dependencies).length + JSON.stringify(context.adjacentWorkItems).length,
    graphStateChars: JSON.stringify({
      entities: context.relevantEntities,
      relationships: context.relevantRelationships,
      threads: context.relevantThreads,
    }).length,
    ledgerChars: JSON.stringify(context.ledger).length,
    schemaSurface: 'incremental-work-item-narrow',
    workItemId: input.workItem.id,
    workItemKind: input.workItem.kind,
    workItemIndex: input.workItemIndex,
    ledgerOnly: context.ledgerOnly,
  })
  return {
    promptObject,
    context,
    diagnostics,
  }
}

function incrementalProgressPhaseForWorkItem(kind: WorldPromptIncrementalWorkItem['kind']): WorldPromptPlannerProgress['phase'] {
  switch (kind) {
    case 'sequence_unit':
      return 'generating_sequence_unit'
    case 'relationship_batch':
      return 'mapping_relationships'
    case 'thread_batch':
    case 'suggestion_batch':
    case 'wiki_metadata':
    case 'final_summary':
      return 'finalizing_world'
    case 'entity_batch':
    default:
      return 'generating_entity'
  }
}

function orderPromptOpsForIncrementalApply(ops: PromptToWorldOp[]) {
  const priority = (op: PromptToWorldOp) => {
    switch (op.op) {
      case 'assistant_note':
        return 0
      case 'upsert_entity':
      case 'replace_entity':
        return 1
      case 'update_entity':
        return 2
      case 'update_world_wiki_metadata':
        return 3
      case 'upsert_relationship':
      case 'update_relationship':
        return 4
      case 'create_derived_result':
      case 'queue_image_generation':
      case 'queue_cinematic_generation':
      default:
        return 5
    }
  }
  return [...ops].sort((a, b) => priority(a) - priority(b))
}

function normalizeIncrementalWorkItems(manifest: WorldPromptIncrementalManifest, payload: WorldPromptStartTurnRequest) {
  const isAppProject = projectContextIsApp(payload.snapshot.projectContext)
  const workItems = manifest.workItems
    .filter((item) => item.id.trim() && item.label.trim())
    .map((item, index) => {
      const parsed = worldPromptIncrementalWorkItemSchema.parse({
        ...item,
        id: item.id.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() || `work_${index + 1}`,
        label: item.label.trim(),
        objective: item.objective.trim() || item.label.trim(),
        expectedOps: Math.max(0, item.expectedOps),
        critical: isAppProject
          ? item.kind === 'entity_batch' && item.appSlice !== 'relationships'
          : item.kind === 'entity_batch' || item.kind === 'sequence_unit',
      })
      return normalizeWorkItemForPromptStrategy(parsed, payload.snapshot.projectContext)
    })

  if (workItems.length > 0) return workItems.slice(0, payload.initialSeedMode === 'generate_skeleton' ? 18 : 10)

  if (isAppProject) return buildDefaultAppIncrementalWorkItems().slice(0, payload.initialSeedMode === 'generate_skeleton' ? 18 : 10)

  return [
    worldPromptIncrementalWorkItemSchema.parse({
      id: 'core_entities',
      kind: 'entity_batch',
      label: 'Core entities',
      objective: 'Create the core cast, places, groups, objects, and concepts required by the prompt.',
      expectedOps: 6,
      critical: true,
    }),
    worldPromptIncrementalWorkItemSchema.parse({
      id: 'core_relationships',
      kind: 'relationship_batch',
      label: 'Core relationships',
      objective: 'Connect the generated entities with high-signal relationships.',
      dependsOn: ['core_entities'],
      expectedOps: 8,
      critical: false,
    }),
    worldPromptIncrementalWorkItemSchema.parse({
      id: 'final_world_notes',
      kind: 'final_summary',
      label: 'Final world notes',
      objective: 'Add concise wiki metadata, threads, suggestions, or assistant notes if useful.',
      dependsOn: ['core_relationships'],
      expectedOps: 2,
      critical: false,
    }),
  ]
}

async function generateIncrementalManifest(input: {
  client: SupabaseClient
  payload: WorldPromptStartTurnRequest
  session: WorldPromptSession
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  recentMessages: WorldPromptMessage[]
  selectedSuggestion?: WorldPromptSuggestionRecord | null
  usageRecorder?: WorldPromptTokenUsageRecorder
}) : Promise<IncrementalPlannerResult> {
  const projectContextGuidance = describeProjectContextForPlanner(input.payload.snapshot.projectContext)
  const promptStrategy = getWorldPromptStrategy(input.payload.snapshot.projectContext)
  const shouldInferContext = shouldInferProjectContext(input.payload.snapshot.projectContext)
  const sourceContext = input.payload.sourceContext ?? null
  const isInitialSeedGeneration = input.payload.initialSeedMode === 'generate_skeleton'
  const initialSeedInference = input.payload.initialSeedContext?.inference ?? null
  const initialSeedProfile = isInitialSeedGeneration
    ? getWorldSeedSkeletonProfile((initialSeedInference?.projectSubtype ?? input.payload.snapshot.projectContext?.projectSubtype ?? 'feature_film') as ProjectSubtype)
    : null
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
  const relevantPlannerContext = await buildWorldPromptRetrievalPacket({
    client: input.client,
    mode: retrievalIntent.plannerMode,
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

  const manifestJsonSchema = normalizeStrictJsonSchema(z.toJSONSchema(worldPromptIncrementalManifestSchema))
  const instructions = [
    'You are the GraphCore incremental world build planner.',
    'Create a lightweight manifest only. Do not write full graph operation bodies in this response.',
    'Also create buildBrief: a compact continuity packet that later work items can use instead of rereading the full source, retrieval context, or manifest.',
    'Keep buildBrief concise: short source outline, explicit requirements, canon constraints, tone, and planned coverage.',
    'Break broad world-building into ordered work items that can be generated and applied independently.',
    'Entity batches should be small, usually 3-5 entities. Sequence units should be one item each, or at most two very small adjacent beats.',
    'Put relationship batches after the entity or sequence items they connect.',
    'Put threads, wiki metadata, suggestions, and final notes near the end.',
    'Use stable snake_case work item IDs. Make labels short and user-facing.',
    ...promptStrategy.incrementalManifestGuidance,
    isInitialSeedGeneration
      ? 'This is initial world seed generation. The manifest must cover the complete starting skeleton, not a tiny first wave.'
      : 'This is a broad regular world-prompt turn. Keep the manifest focused enough to finish in this turn.',
    shouldInferContext
      ? 'Infer project type/subtype in projectContextInference from the prompt and source context.'
      : 'Only include projectContextInference if the prompt explicitly reframes the project context.',
    projectContextGuidance ? `Project guidance: ${projectContextGuidance}` : null,
    sourceContext
      ? projectContextIsApp(input.payload.snapshot.projectContext)
        ? 'Source context is available; use it to size the manifest around source-derived app features, flows, screens, data/API contracts, capabilities, design-system needs, towers, code files, and relationships.'
        : 'Source context is available; use it to size the manifest around source-derived characters, places, objects, events, and relationships.'
      : null,
  ].filter(Boolean).join('\n')

  const prompt = JSON.stringify({
    prompt: input.payload.prompt,
    sourceContext,
    projectContext: input.payload.snapshot.projectContext,
    initialSeed: isInitialSeedGeneration
      ? {
          inference: initialSeedInference,
          selectedArtStylePreset: input.payload.initialSeedContext?.selectedArtStylePreset ?? input.payload.snapshot.projectContext?.artStylePreset ?? null,
          selectedArtStyleDescription: input.payload.initialSeedContext?.selectedArtStyleDescription ?? input.payload.snapshot.projectContext?.artStyleDescription ?? '',
          skeletonProfile: initialSeedProfile,
        }
      : null,
    retrieval: relevantPlannerContext,
  })
  const manifestDiagnostics = worldPromptTokenBudgetDiagnosticsSchema.parse({
    surface: 'incremental-manifest',
    promptChars: prompt.length,
    sourceChars: JSON.stringify(sourceContext).length,
    retrievalChars: JSON.stringify(relevantPlannerContext).length,
    manifestChars: 0,
    graphStateChars: JSON.stringify({
      entities: relevantPlannerContext.relevantEntities,
      relationships: relevantPlannerContext.relevantRelationships,
      threads: relevantPlannerContext.relevantThreads,
    }).length,
    ledgerChars: 0,
    schemaSurface: 'incremental-manifest',
    workItemId: null,
    workItemKind: null,
    workItemIndex: null,
    ledgerOnly: false,
  })

  const debugEnabled = shouldDebugWorldPromptOpenAi()
  const response = await runOpenAiResponses({
    model: input.payload.model,
    input: prompt,
    instructions,
    text: {
      format: {
        type: 'json_schema',
        name: 'world_prompt_incremental_manifest',
        schema: manifestJsonSchema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-prompt',
      surface: 'incremental-manifest',
    },
    store: false,
    timeoutMs: 90_000,
  })
  input.usageRecorder?.record({
    surface: 'incremental-manifest',
    model: input.payload.model,
    response,
    metadata: { tokenBudgetDiagnostics: manifestDiagnostics },
  })

  if (debugEnabled) {
    console.log('[world-prompt-debug] incremental manifest response', previewJson({
      ok: response.response.ok,
      status: response.response.status,
      outputText: response.outputText,
      body: response.body,
    }))
  }

  if (!response.response.ok) {
    const upstreamMessage =
      typeof response.body.error === 'object' && response.body.error !== null
        ? ((response.body.error as { message?: string }).message ?? 'OpenAI request failed.')
        : 'OpenAI request failed.'
    throw new Error(`[world-prompt-incremental-manifest] ${upstreamMessage}`)
  }
  const parsedJson = extractJsonBlock(response.outputText)
  if (!parsedJson) throw new Error('World prompt incremental manifest returned invalid JSON.')
  const manifest = worldPromptIncrementalManifestSchema.parse(parsedJson)
  const normalizedManifest = worldPromptIncrementalManifestSchema.parse({
      ...manifest,
      workItems: normalizeIncrementalWorkItems(manifest, input.payload),
    })
  return {
    manifest: worldPromptIncrementalManifestSchema.parse({
      ...normalizedManifest,
      buildBrief: inferBuildBriefFromManifest({
        manifest: normalizedManifest,
        payload: input.payload,
      }),
    }),
    retrievalPacket: relevantPlannerContext,
  }
}

async function generateIncrementalWorkItemPlan(input: {
  payload: WorldPromptStartTurnRequest
  snapshot: WorldPromptSnapshot
  retrievalPacket: Awaited<ReturnType<typeof buildWorldPromptRetrievalPacket>>
  manifest: WorldPromptIncrementalManifest
  workItem: WorldPromptIncrementalWorkItem
  completedWorkItems: WorldPromptIncrementalWorkItem[]
  failedWorkItems: Array<{ item: WorldPromptIncrementalWorkItem; reason: string }>
  repairFeedback?: string | null
  workItemIndex: number
  attempt: number
  usageRecorder?: WorldPromptTokenUsageRecorder
}) {
  const promptStrategy = getWorldPromptStrategy(input.payload.snapshot.projectContext)
  const plannerRequestSchema = incrementalWorkItemPlannerResponseSchema
  const basePlannerResponseSchema = normalizeStrictJsonSchema(z.toJSONSchema(plannerRequestSchema))
  const plannerResponseSchema = projectUsesStrictStorySequence(input.payload.snapshot.projectContext)
    ? withStorySequencePlannerJsonSchema(basePlannerResponseSchema)
    : basePlannerResponseSchema
  const workItem = input.workItem
  const compactPrompt = buildCompactWorkItemPrompt({
    payload: input.payload,
    snapshot: input.snapshot,
    manifest: input.manifest,
    workItem,
    completedWorkItems: input.completedWorkItems,
    failedWorkItems: input.failedWorkItems,
    workItemIndex: input.workItemIndex,
    usageRecorder: input.usageRecorder,
  })
  const instructions = [
    'You are generating one incremental GraphCore world-prompt work item.',
    'Return compact JSON only matching the schema. Only generate graph operations for the current work item.',
    'Do not repeat operations from completed work items. Prefer stable operation IDs prefixed with the work item ID.',
    'Use wave1Ops for all operations. Keep assistantSummary to one concise user-facing operational note.',
    'Use the buildBrief and ledger as continuity. Do not ask for hidden prior chat context; it is not available to this call.',
    'Allowed operations: upsert_entity, update_entity, replace_entity, upsert_relationship, update_relationship, create_derived_result, queue_image_generation, queue_cinematic_generation, update_world_wiki_metadata, assistant_note.',
    'For entity_batch items, create only the requested small set of concrete canon-ready entities.',
    ...promptStrategy.incrementalWorkItemGuidance,
    projectContextIsApp(input.payload.snapshot.projectContext)
      ? 'For app relationship_batch items, create app links only between existing/generated app graph nodes available in the ledger or relevant entity list.'
      : 'Valid entity node types are actor, group, place, object, concept, event, and sequence_unit. Never use wiki, location, faction, character, beat, lore, or title as nodeType values; map those to place, group, actor, sequence_unit, concept, or wiki metadata as appropriate.',
    'For relationship_batch items, create links only between existing/generated entities that are available in the ledger or relevant entity list.',
    projectContextIsApp(input.payload.snapshot.projectContext)
      ? 'For app user_flow items, create or update user_flow nodes and transitions_to links between screens. Do not create sequence_unit nodes.'
      : 'For sequence_unit items, create the authored progression node(s) requested by this item and include complete customProperties.sequence metadata.',
    projectContextIsApp(input.payload.snapshot.projectContext)
      ? null
      : 'A Story sequence_unit must include sequence.ordinal, synopsis, dramaticQuestion, outcome, at least one consequence with cause/effect, and at least one characterArcDelta.',
    projectContextIsApp(input.payload.snapshot.projectContext)
      ? null
      : 'Use sequence_unit relationships with precedes, causes, complicates, or pays_off only when relevant endpoints already exist or are created in this work item.',
    'For wiki_metadata/final_summary items, prefer update_world_wiki_metadata, assistant_note, threadActions, and suggestionCandidates over more core entity growth.',
    compactPrompt.context.ledgerOnly ? 'The context is in ledger-only budget mode. Prefer key-based operations and concise text.' : null,
    input.payload.initialSeedMode === 'generate_skeleton'
      ? 'This is initial seed generation; satisfy the seed profile across the whole manifest while keeping this response scoped to the current item.'
      : 'This is an incremental broad turn; keep this item focused and finishable.',
    input.repairFeedback ? `Repair guidance from the previous failed attempt: ${input.repairFeedback}` : null,
  ].filter(Boolean).join('\n')

  const prompt = JSON.stringify(compactPrompt.promptObject)

  const debugEnabled = shouldDebugWorldPromptOpenAi()
  const response = await runOpenAiResponses({
    model: input.payload.model,
    input: prompt,
    instructions,
    text: {
      format: {
        type: 'json_schema',
        name: 'world_prompt_incremental_work_item',
        schema: plannerResponseSchema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: {
      feature: 'world-prompt',
      surface: 'incremental-work-item',
      workItemId: workItem.id,
      workItemKind: workItem.kind,
      workItemIndex: String(input.workItemIndex),
      attempt: String(input.attempt),
    },
    store: false,
    timeoutMs: workItem.kind === 'sequence_unit' ? 120_000 : 90_000,
  })
  input.usageRecorder?.record({
    surface: 'incremental-work-item',
    model: input.payload.model,
    response,
    metadata: {
      workItemId: workItem.id,
      workItemKind: workItem.kind,
      workItemIndex: input.workItemIndex,
      attempt: input.attempt,
      tokenBudgetDiagnostics: compactPrompt.diagnostics,
    },
  })

  if (debugEnabled) {
    console.log('[world-prompt-debug] incremental work item response', previewJson({
      workItemId: workItem.id,
      attempt: input.attempt,
      ok: response.response.ok,
      status: response.response.status,
      outputText: response.outputText,
      body: response.body,
    }))
  }

  if (!response.response.ok) {
    const upstreamMessage =
      typeof response.body.error === 'object' && response.body.error !== null
        ? ((response.body.error as { message?: string }).message ?? 'OpenAI request failed.')
        : 'OpenAI request failed.'
    throw new Error(`[world-prompt-incremental-work-item:${workItem.id}] ${upstreamMessage}`)
  }
  const parsedJson = extractJsonBlock(response.outputText)
  if (!parsedJson) throw new Error(`Incremental work item ${workItem.id} returned invalid JSON.`)
  const normalizedJson = normalizePlannerJson(parsedJson)
  const validated = plannerRequestSchema.safeParse(normalizedJson)
  if (!validated.success) {
    throw new Error(`Incremental work item ${workItem.id} did not match schema. ${formatIssues(validated.error.issues)}`)
  }
  const workItemResult = plannerRequestSchema.parse(validated.data)
  const candidatePlan = optimizePlannerOpsForMode({
    mode: 'direct_build',
    prompt: input.payload.prompt,
    plan: worldPromptPlannerSchema.parse({
      projectContextInference: null,
      classification: input.manifest.classification,
      assistantSummary: workItemResult.assistantSummary,
      wave1Ops: workItemResult.wave1Ops,
      operations: workItemResult.wave1Ops,
      threadActions: workItem.kind === 'final_summary' || workItem.kind === 'thread_batch'
        ? workItemResult.threadActions
        : [],
      threadCandidates: [],
      suggestionCandidates: workItem.kind === 'final_summary' || workItem.kind === 'suggestion_batch'
        ? workItemResult.suggestionCandidates
        : [],
    }),
  })
  const creativeCompletion = completeCreativeDescriptorOps({
    prompt: input.payload.prompt,
    mode: 'direct_build',
    classification: candidatePlan.classification,
    existingEntities: input.snapshot.worldEntities,
    ops: candidatePlan.wave1Ops,
  })
  const sequenceCompletion = { ops: creativeCompletion.ops, issues: [] as StorySequenceOpIssue[] }
  const completedPlan = worldPromptPlannerSchema.parse({
    ...candidatePlan,
    wave1Ops: sequenceCompletion.ops,
    operations: sequenceCompletion.ops,
  })
  const creativeIssues = creativeCompletion.issues
  const storySequenceIssues = sequenceCompletion.issues.length > 0 ? sequenceCompletion.issues : findStorySequenceOpIssues({
    snapshot: input.snapshot,
    ops: completedPlan.wave1Ops,
  })
  if (
    creativeCompletionAppliesToPlan('direct_build', completedPlan.classification)
    && !promptAllowsPlaceholderCanon(input.payload.prompt)
    && creativeIssues.length > 0
  ) {
    throw new Error(`Incremental work item ${workItem.id} still has placeholder canon: ${summarizeCreativeDescriptorIssues(creativeIssues)}.`)
  }
  if (
    creativeCompletionAppliesToPlan('direct_build', completedPlan.classification)
    && storySequenceIssues.length > 0
  ) {
    throw new Error(`Incremental work item ${workItem.id} still has incomplete sequence units: ${summarizeStorySequenceOpIssues(storySequenceIssues)}.`)
  }
  return stripPlannerOpsForCreativeDescriptorIssues({
    plan: completedPlan,
    issues: creativeIssues,
  })
}

async function executeIncrementalWorldPromptTurn(input: {
  client: SupabaseClient
  authHeader: string
  payload: WorldPromptStartTurnRequest
  session: WorldPromptSession
  turn: WorldPromptTurn
  summaryMemory: string
  sessionMemoryState: WorldPromptSessionMemoryState
  recentMessages: WorldPromptMessage[]
  selectedSuggestion?: WorldPromptSuggestionRecord | null
  continuationMode: string
  writeEvent: WorldPromptEventWriter
  usageRecorder: WorldPromptTokenUsageRecorder
}) {
  let turn = input.turn
  let workingSession = input.session
  let responseProjectContext: ProjectContext | null = input.payload.snapshot.projectContext ?? null
  let responseSuggestions: WorldPromptSuggestionRecord[] = []
  const appliedDefinitions: Record<string, unknown>[] = []
  const touchedEntityKeys = new Set<string>()
  const touchedRelationshipKeys = new Set<string>()
  const mutableSnapshot = structuredClone(input.payload.snapshot) as WorldPromptSnapshot
  const generatedPlans: Array<z.infer<typeof worldPromptPlannerSchema>> = []
  const allGeneratedOps: PromptToWorldOp[] = []
  const skippedRiskyOps: PromptToWorldOp[] = []
  const completedWorkItems: WorldPromptIncrementalWorkItem[] = []
  const failedWorkItems: Array<{ item: WorldPromptIncrementalWorkItem; reason: string }> = []
  let preferredAutoViewKey: string | null = null

  await input.writeEvent('planner_status', {
    plannerStatus: 'planning',
    plannerProgress: {
      phase: 'planning_manifest',
      message: 'Breaking this build into graph records GraphCore can create one step at a time.',
      sequence: 1,
    },
    turn: { id: turn.id },
  })

  const incremental = await generateIncrementalManifest({
    client: input.client,
    payload: input.payload,
    session: workingSession,
    summaryMemory: input.summaryMemory,
    sessionMemoryState: input.sessionMemoryState,
    recentMessages: input.recentMessages,
    selectedSuggestion: input.selectedSuggestion ?? null,
    usageRecorder: input.usageRecorder,
  })
  turn = await persistTurnTokenUsage({
    client: input.client,
    turn,
    usageRecorder: input.usageRecorder,
  })
  const manifest = incremental.manifest
  const retrievalPacket = incremental.retrievalPacket
  responseProjectContext = await persistInferredProjectContext({
    client: input.client,
    snapshot: input.payload.snapshot,
    inference: manifest.projectContextInference,
  })

  turn = await updateTurn(input.client, turn.id, {
    metadata: {
      ...(turn.metadata ?? {}),
      incrementalPlan: manifest,
      executionStrategy: 'incremental',
      projectContextInference: manifest.projectContextInference ?? undefined,
    },
  })

  await input.writeEvent('planner_status', {
    plannerStatus: 'planning',
    classification: manifest.classification,
    plannerProgress: {
      phase: 'planning_manifest',
      message: `Planned ${manifest.workItems.length} build step${manifest.workItems.length === 1 ? '' : 's'}.`,
      sequence: 2,
      done: true,
      total: manifest.workItems.length,
    },
    plannerOutline: manifest.workItems.map((item) => item.label),
    turn: { id: turn.id },
    ...tokenUsageEventPayload(input.usageRecorder),
  })

  for (let workItemIndex = 0; workItemIndex < manifest.workItems.length; workItemIndex += 1) {
    await throwIfTurnCancelled(input.client, turn.id)
    const workItem = manifest.workItems[workItemIndex]
    const progressPhase = incrementalProgressPhaseForWorkItem(workItem.kind)
    await input.writeEvent('work_item_started', {
      plannerStatus: 'planning',
      classification: manifest.classification,
      workItem,
      workItemIndex: workItemIndex + 1,
      workItemTotal: manifest.workItems.length,
      plannerProgress: {
        phase: progressPhase,
        message: `${workItem.label}: ${workItem.objective || 'Generating this graph step.'}`,
        sequence: workItemIndex + 1,
        workItemId: workItem.id,
        workItemKind: workItem.kind,
        index: workItemIndex + 1,
        total: manifest.workItems.length,
      },
      turn: { id: turn.id },
    })

    let generated: z.infer<typeof worldPromptPlannerSchema> | null = null
    let repairFeedback: string | null = null
    let finalError: Error | null = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        generated = await generateIncrementalWorkItemPlan({
          payload: input.payload,
          snapshot: mutableSnapshot,
          retrievalPacket,
          manifest,
          workItem,
          completedWorkItems,
          failedWorkItems,
          repairFeedback,
          workItemIndex: workItemIndex + 1,
          attempt,
          usageRecorder: input.usageRecorder,
        })
        turn = await persistTurnTokenUsage({
          client: input.client,
          turn,
          usageRecorder: input.usageRecorder,
        })
        const generatedOpCount = generated.wave1Ops.length > 0 ? generated.wave1Ops.length : generated.operations.length
        await input.writeEvent('planner_status', {
          plannerStatus: 'planning',
          classification: manifest.classification,
          workItem,
          workItemIndex: workItemIndex + 1,
          workItemTotal: manifest.workItems.length,
          plannerProgress: {
            phase: progressPhase,
            message: `${workItem.label}: generated ${generatedOpCount} planned graph change${generatedOpCount === 1 ? '' : 's'}.`,
            sequence: workItemIndex + 1,
            workItemId: workItem.id,
            workItemKind: workItem.kind,
            index: workItemIndex + 1,
            total: manifest.workItems.length,
          },
          turn: { id: turn.id },
          ...tokenUsageEventPayload(input.usageRecorder),
        })
        finalError = null
        break
      } catch (error) {
        turn = await persistTurnTokenUsage({
          client: input.client,
          turn,
          usageRecorder: input.usageRecorder,
        })
        finalError = error instanceof Error ? error : new Error('Incremental work item failed.')
        repairFeedback = finalError.message
      }
    }

    if (!generated) {
      const reason = stripInternalPlannerDiagnostics(finalError?.message ?? 'Work item failed.')
      failedWorkItems.push({ item: workItem, reason })
      await input.writeEvent('work_item_failed', {
        plannerStatus: 'planning',
        classification: manifest.classification,
        workItem,
        workItemIndex: workItemIndex + 1,
        workItemTotal: manifest.workItems.length,
        diagnostics: [reason],
        note: `${workItem.label} could not be generated cleanly.`,
        plannerProgress: {
          phase: progressPhase,
          message: `${workItem.label} could not be generated cleanly.`,
          sequence: workItemIndex + 1,
          done: true,
          workItemId: workItem.id,
          workItemKind: workItem.kind,
          index: workItemIndex + 1,
          total: manifest.workItems.length,
        },
        turn: { id: turn.id },
        ...tokenUsageEventPayload(input.usageRecorder),
      })
      if (workItem.critical) throw finalError ?? new Error(`Critical work item ${workItem.id} failed.`)
      continue
    }

    generatedPlans.push(generated)
    const plannerOps = generated.wave1Ops.length > 0 ? generated.wave1Ops : generated.operations
    const planningSnapshot = structuredClone(mutableSnapshot) as WorldPromptSnapshot
    const sanitizedById = new Map<string, PromptToWorldOp>()
    for (const operation of plannerOps.filter((op) => op.op === 'upsert_entity')) {
      const sanitized = sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: input.payload.prompt })
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    for (const operation of plannerOps.filter((op) => op.op !== 'upsert_entity')) {
      const sanitized = sanitizePromptOp({ op: operation, snapshot: planningSnapshot, prompt: input.payload.prompt })
      sanitizedById.set(operation.id, sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }
    const sanitizedOps = plannerOps.map((operation) => sanitizedById.get(operation.id) ?? operation)
    allGeneratedOps.push(...sanitizedOps)
    const { autoOps, approvalOps } = splitPromptOpsByApproval(sanitizedOps)
    const orderedAutoOps = orderPromptOpsForIncrementalApply(autoOps)
    skippedRiskyOps.push(...approvalOps)
    const executableOpCount = orderedAutoOps.filter((op) => op.op !== 'assistant_note').length
    await input.writeEvent('planner_status', {
      plannerStatus: 'applying',
      classification: manifest.classification,
      workItem,
      workItemIndex: workItemIndex + 1,
      workItemTotal: manifest.workItems.length,
      plannerProgress: {
        phase: 'applying_changes',
        message: executableOpCount > 0
          ? `${workItem.label}: applying ${executableOpCount} graph change${executableOpCount === 1 ? '' : 's'}.`
          : `${workItem.label}: no graph changes needed.`,
        sequence: 0,
        workItemId: workItem.id,
        workItemKind: workItem.kind,
        index: workItemIndex + 1,
        total: manifest.workItems.length,
      },
      turn: { id: turn.id },
      ...tokenUsageEventPayload(input.usageRecorder),
    })

    let appliedStepIndex = 0
    for (const op of orderedAutoOps) {
      await throwIfTurnCancelled(input.client, turn.id)
      if (op.op === 'assistant_note') {
        await input.writeEvent('assistant_note', {
          op,
          note: stripInternalPlannerDiagnostics(op.payload.message),
          classification: manifest.classification,
          workItem,
        }, { opId: op.id, metadata: { workItemId: workItem.id } })
        continue
      }

      appliedStepIndex += 1
      await input.writeEvent('planner_status', {
        plannerStatus: 'applying',
        classification: manifest.classification,
        workItem,
        plannerProgress: {
          phase: 'applying_changes',
          message: buildApplyProgressMessage({
            index: appliedStepIndex,
            total: executableOpCount,
            op,
          }),
          sequence: appliedStepIndex,
          workItemId: workItem.id,
          workItemKind: workItem.kind,
          index: workItemIndex + 1,
          total: manifest.workItems.length,
        },
        turn: { id: turn.id },
        ...tokenUsageEventPayload(input.usageRecorder),
      }, { opId: op.id, metadata: { workItemId: workItem.id } })

      const result = await applyPromptOp({
        client: input.client,
        authHeader: input.authHeader,
        model: input.payload.model,
        snapshot: mutableSnapshot,
        prompt: input.payload.prompt,
        turnId: turn.id,
        op,
      })
      mergeAppliedWorldGraphIntoSnapshot(mutableSnapshot, result.applied)
      if (Array.isArray(result.definitions) && result.definitions.length > 0) {
        for (const definition of result.definitions) {
          if (!appliedDefinitions.some((entry) => entry.key === definition.key)) {
            appliedDefinitions.push(definition)
          }
        }
      }
      for (const entity of result.applied.worldEntities ?? []) touchedEntityKeys.add(entity.key)
      for (const relationship of result.applied.worldRelationships ?? []) {
        touchedRelationshipKeys.add(relationship.key)
        touchedEntityKeys.add(relationship.sourceEntityKey)
        touchedEntityKeys.add(relationship.targetEntityKey)
      }

      if (result.note) {
        await input.writeEvent('assistant_note', {
          op,
          note: stripInternalPlannerDiagnostics(result.note),
          classification: manifest.classification,
          workItem,
        }, { opId: op.id, metadata: { workItemId: workItem.id } })
      } else {
        await input.writeEvent('op_applied', {
          op: { ...op, status: 'applied' },
          applied: result.applied,
          classification: manifest.classification,
          workItem,
        }, { opId: op.id, metadata: { workItemId: workItem.id } })
      }

      if (result.queue) {
        await input.writeEvent('queue_started', {
          op: { ...op, status: 'applied' },
          queue: result.queue,
          classification: manifest.classification,
          workItem,
        }, { opId: op.id, metadata: { workItemId: workItem.id } })
      }
    }

    completedWorkItems.push(workItem)
    await input.writeEvent('work_item_completed', {
      plannerStatus: 'planning',
      classification: manifest.classification,
      workItem,
      workItemIndex: workItemIndex + 1,
      workItemTotal: manifest.workItems.length,
      note: `${workItem.label} complete.`,
      plannerProgress: {
        phase: progressPhase,
        message: `${workItem.label} complete.`,
        sequence: workItemIndex + 1,
        done: true,
        workItemId: workItem.id,
        workItemKind: workItem.kind,
        index: workItemIndex + 1,
        total: manifest.workItems.length,
      },
      turn: { id: turn.id },
      ...tokenUsageEventPayload(input.usageRecorder),
    }, { metadata: { workItemId: workItem.id } })
  }

  const accumulatedPlan = worldPromptPlannerSchema.parse({
    projectContextInference: manifest.projectContextInference,
    classification: manifest.classification,
    assistantSummary: manifest.assistantSummary,
    wave1Ops: allGeneratedOps,
    operations: allGeneratedOps,
    threadActions: generatedPlans.flatMap((plan) => plan.threadActions),
    threadCandidates: generatedPlans.flatMap((plan) => plan.threadCandidates),
    suggestionCandidates: generatedPlans.flatMap((plan) => plan.suggestionCandidates),
    optionCandidates: generatedPlans.flatMap((plan) => plan.optionCandidates),
    wave2Ideas: generatedPlans.flatMap((plan) => plan.wave2Ideas),
    optionalIdeas: generatedPlans.flatMap((plan) => plan.optionalIdeas),
    diagnosticFindings: generatedPlans.flatMap((plan) => plan.diagnosticFindings),
  })
  const threadUpsertResult = await upsertWorldThreads({
    client: input.client,
    draftId: input.payload.snapshot.draft.id,
    turnId: turn.id,
    snapshot: mutableSnapshot,
    threadActions: accumulatedPlan.threadActions,
    threadCandidates: accumulatedPlan.threadCandidates,
  })
  const persistedThreads = threadUpsertResult.threads
  const threadDiagnostics = [
    ...threadUpsertResult.diagnostics,
    ...threadUpsertResult.rejected.map((entry) => `thread_rejected:${entry.key || 'unknown'}:${entry.reason}`),
  ]
  mutableSnapshot.worldThreads = [
    ...mutableSnapshot.worldThreads.filter((thread) => !persistedThreads.some((persisted) => persisted.key === thread.key)),
    ...persistedThreads,
  ]
  for (const thread of persistedThreads) {
    if (thread.lastTurnId === turn.id || thread.sourceTurnId === turn.id) {
      for (const entityKey of thread.linkedEntityKeys) touchedEntityKeys.add(entityKey)
    }
  }

  const plannerSuggestions = dedupeSuggestions([
    ...suggestionsFromPlannerIdeas({ ideas: accumulatedPlan.suggestionCandidates, fallbackKind: 'continue_scope' }),
    ...suggestionsFromPlannerIdeas({ ideas: accumulatedPlan.optionCandidates, fallbackKind: accumulatedPlan.classification === 'graph_diagnosis' ? 'diagnostic_gap' : 'advisory_option' }),
    ...suggestionsFromPlannerIdeas({ ideas: accumulatedPlan.wave2Ideas, fallbackKind: 'continue_scope' }),
    ...suggestionsFromPlannerIdeas({ ideas: accumulatedPlan.optionalIdeas, fallbackKind: 'continue_scope' }),
  ])
  const execution = classifyPromptExecution({
    prompt: input.payload.prompt,
    snapshot: input.payload.snapshot,
    ops: allGeneratedOps,
    classificationHint: manifest.classification,
    suggestionCandidates: plannerSuggestions,
    selectedThreadKey: input.payload.selectedThreadKey,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    assistantSummary: manifest.assistantSummary,
    isSuggestionDriven: Boolean(input.payload.selectedSuggestionId),
    isInitialSeedGeneration: input.payload.initialSeedMode === 'generate_skeleton',
  })
  const finalizedSuggestions = finalizeSuggestionSet({
    snapshot: mutableSnapshot,
    selectedThreadKey: input.payload.selectedThreadKey,
    sourcePrompt: input.payload.prompt,
    suggestions: execution.suggestions,
    maxCount: 4,
  })
  const persistedSuggestions = await persistSessionSuggestions({
    client: input.client,
    draftId: input.payload.snapshot.draft.id,
    sessionId: workingSession.id,
    turnId: turn.id,
    selectedThreadKey: input.payload.selectedThreadKey,
    sourcePrompt: input.payload.prompt,
    suggestions: finalizedSuggestions,
  })
  const activePersistedSuggestions = persistedSuggestions.filter((suggestion) => suggestion.state === 'active')
  const responseSuggestionsById = new Map(persistedSuggestions.map((suggestion) => [suggestion.id, suggestion]))
  if (input.payload.selectedSuggestionId) {
    const usedSuggestion = await markSuggestionUsed(input.client, input.payload.selectedSuggestionId, turn.id)
    if (usedSuggestion) responseSuggestionsById.set(usedSuggestion.id, usedSuggestion)
  }
  responseSuggestions = Array.from(responseSuggestionsById.values())

  for (const entityKey of [...touchedEntityKeys]) {
    const touchedEntity = mutableSnapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null
    if (!touchedEntity) continue
    const linkedEntity = await ensureAppliedEntityLinkedDefinition({
      client: input.client,
      snapshot: mutableSnapshot,
      entity: touchedEntity,
    })
    if (linkedEntity.createdDefinition && !appliedDefinitions.some((entry) => entry.key === linkedEntity.createdDefinition?.key)) {
      appliedDefinitions.push(linkedEntity.createdDefinition)
    }
  }
  if (touchedEntityKeys.size > 0 || touchedRelationshipKeys.size > 0 || persistedThreads.length > 0) {
    const reconciledViews = await reconcileAutoManagedViewsForDraft({
      client: input.client,
      draftId: input.payload.snapshot.draft.id,
      snapshot: mutableSnapshot,
      options: {
        recentEntityKeys: [...touchedEntityKeys],
        recentRelationshipKeys: [...touchedRelationshipKeys],
        preferredRootEntityKey: [...touchedEntityKeys][0] ?? input.payload.selectedRootEntityKey ?? null,
        preferredThreadKey: input.payload.selectedThreadKey,
      },
    })
    preferredAutoViewKey = reconciledViews.preferredViewKey
    await input.writeEvent('op_applied', {
      applied: { worldViews: mutableSnapshot.worldViews },
      classification: manifest.classification,
      scope: execution.scope,
    })
  }

  const skippedOpsNote = summarizeSkippedPromptOps(skippedRiskyOps)
  const failedItemsNote = failedWorkItems.length > 0
    ? `Skipped ${failedWorkItems.length} non-critical build step${failedWorkItems.length === 1 ? '' : 's'}: ${failedWorkItems.map((entry) => entry.item.label).join(', ')}.`
    : null
  if (skippedOpsNote || failedItemsNote || finalizedSuggestions.length > 0) {
    await input.writeEvent('assistant_note', {
      classification: manifest.classification,
      note: [skippedOpsNote, failedItemsNote].filter(Boolean).join('\n\n'),
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      scope: execution.scope,
      threads: persistedThreads,
    })
  }

  const assistantSummary = [
    stripInternalPlannerDiagnostics(manifest.assistantSummary || ''),
    summarizeAppliedOps(allGeneratedOps),
    skippedOpsNote,
    failedItemsNote,
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index).join('\n\n')

  const assistantMessage = await insertPromptMessage({
    client: input.client,
    sessionId: workingSession.id,
    turnId: turn.id,
    draftId: input.payload.snapshot.draft.id,
    role: 'assistant',
    content: assistantSummary,
    metadata: {
      executionStrategy: 'incremental',
      projectContextInference: manifest.projectContextInference ?? undefined,
      opCount: allGeneratedOps.length,
      classification: manifest.classification,
      scopeDecision: execution.scope,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      threadDiagnostics,
      incrementalPlan: manifest,
      completedWorkItemIds: completedWorkItems.map((item) => item.id),
      failedWorkItems: failedWorkItems.map((entry) => ({ id: entry.item.id, label: entry.item.label, reason: entry.reason })),
      tokenUsage: input.usageRecorder.summary() ?? undefined,
    },
  })
  await input.writeEvent('message_created', { message: assistantMessage, turn: { id: turn.id } })

  const resolvedSelectedViewKey = retrievalPacket.continuityMode === 'topic_shift'
    ? (preferredAutoViewKey ?? input.payload.selectedViewKey ?? workingSession.selectedViewKey)
    : (input.payload.selectedViewKey ?? preferredAutoViewKey ?? workingSession.selectedViewKey)
  const completedSeedProjectContext = input.payload.initialSeedMode === 'generate_skeleton'
    ? buildCompletedProjectContextFromInitialSeedContext(input.payload.initialSeedContext)
    : null
  if (completedSeedProjectContext) {
    responseProjectContext = await persistProjectContextForSeed({
      client: input.client,
      snapshot: mutableSnapshot,
      projectContext: completedSeedProjectContext,
    })
  }
  turn = await updateTurn(input.client, turn.id, {
    status: 'completed',
    approval_state: 'not_required',
    assistant_summary: assistantSummary,
    metadata: {
      ...(turn.metadata ?? {}),
      executionStrategy: 'incremental',
      sourceContext: input.payload.sourceContext ?? undefined,
      initialSeedMode: input.payload.initialSeedMode,
      initialSeedContext: input.payload.initialSeedContext ?? undefined,
      projectContextInference: manifest.projectContextInference ?? undefined,
      opCount: allGeneratedOps.length,
      pendingApprovalCount: 0,
      skippedRiskyOpCount: skippedRiskyOps.length,
      classification: manifest.classification,
      scopeDecision: execution.scope,
      resolvedMode: 'apply_compact_wave',
      resolvedIntent: turn.resolvedContext?.resolvedIntent ?? undefined,
      resolvedFocus: turn.resolvedContext?.resolvedFocus ?? undefined,
      retrievalDiagnostics: retrievalPacket.diagnostics,
      plannerMode: retrievalPacket.plannerMode,
      selectedThreadKey: input.payload.selectedThreadKey,
      selectedSuggestionId: input.payload.selectedSuggestionId,
      continuationMode: input.continuationMode,
      focusLayer: retrievalPacket.focusLayer,
      continuityMode: retrievalPacket.continuityMode,
      retrievedEntityKeys: retrievalPacket.sessionMemory.worldMemory.retrievedEntityKeys,
      retrievedThreadKeys: retrievalPacket.sessionMemory.worldMemory.retrievedThreadKeys,
      selectedViewKey: resolvedSelectedViewKey,
      suggestions: finalizedSuggestions,
      suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
      threadDiagnostics,
      incrementalPlan: manifest,
      completedWorkItemIds: completedWorkItems.map((item) => item.id),
      failedWorkItems: failedWorkItems.map((entry) => ({ id: entry.item.id, label: entry.item.label, reason: entry.reason })),
    },
  })
  const nextSessionMemoryState = buildSessionMemoryState({
    session: workingSession,
    turn,
    assistantSummary,
    selectedThreadKey: input.payload.selectedThreadKey,
  })
  workingSession = await updateSessionLifecycle({
    client: input.client,
    session: workingSession,
    prompt: input.payload.prompt,
    assistantSummary,
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedViewKey: resolvedSelectedViewKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    summaryMemory: buildRollingSessionMemory({
      session: workingSession,
      turn,
      assistantSummary,
      snapshot: mutableSnapshot,
      selectedThreadKey: input.payload.selectedThreadKey,
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

  await input.writeEvent('planner_status', {
    plannerStatus: 'completed',
    classification: manifest.classification,
    scope: execution.scope,
    suggestions: finalizedSuggestions,
    suggestionIds: persistedSuggestions.map((suggestion) => suggestion.id),
    threads: persistedThreads,
    diagnostics: threadDiagnostics,
    plannerProgress: {
      phase: 'finalizing_world',
      message: 'World build complete. Opening the graph.',
      sequence: manifest.workItems.length + 1,
      done: true,
      total: manifest.workItems.length,
    },
    turn,
    session: workingSession,
  })
  await input.writeEvent('turn_completed', {
    turn,
    classification: manifest.classification,
    suggestions: finalizedSuggestions,
    suggestionIds: activePersistedSuggestions.map((suggestion) => suggestion.id),
    threads: persistedThreads,
    diagnostics: threadDiagnostics,
    note: assistantSummary,
    session: workingSession,
  })

  const turnMessages = await loadTurnMessages(input.client, turn.id)
  const turnEvents = await loadTurnEvents(input.client, turn.id)
  return worldPromptStartTurnResponseSchema.parse({
    ok: true,
    session: workingSession,
    turn,
    messages: turnMessages,
    events: turnEvents,
    suggestions: responseSuggestions,
    threads: persistedThreads,
    definitions: appliedDefinitions,
    projectContext: responseProjectContext,
    worldEntities: mutableSnapshot.worldEntities,
    worldRelationships: mutableSnapshot.worldRelationships,
    worldViews: mutableSnapshot.worldViews,
    worldOperators: mutableSnapshot.worldOperators,
    worldResults: mutableSnapshot.worldResults,
    worldGraphConnections: mutableSnapshot.worldGraphConnections,
  })
}

export async function continueWorldSeedGeneration(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptSeedGenerationRequestSchema.parse(input.payload)
  const inferenceTurn = await loadTurnById(input.client, payload.turnId)
  if (inferenceTurn.status !== 'awaiting_user_input') {
    throw new Error('This initial seed turn is not waiting for art style selection.')
  }
  const session = await loadSessionById(input.client, inferenceTurn.sessionId)
  const inference = worldPromptProjectContextInferenceSchema.parse(inferenceTurn.metadata?.projectContextInference)
  const sourceContext = inferenceTurn.metadata?.sourceContext
  const skeletonProfile = getWorldSeedSkeletonProfile(inference.projectSubtype)
  const projectContext = buildTransientSeedProjectContext({
    inference,
    selectedArtStylePreset: payload.selectedArtStylePreset,
    selectedArtStyleDescription: payload.selectedArtStyleDescription,
  })
  const seedSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
  seedSnapshot.projectContext = projectContext
  const draftMetadataWithoutProjectContext = { ...(seedSnapshot.draft.metadata ?? {}) }
  delete draftMetadataWithoutProjectContext.projectContext
  seedSnapshot.draft.metadata = {
    ...draftMetadataWithoutProjectContext,
  }
  const selectedPreset = getArtStylePreset(payload.selectedArtStylePreset)
  const writeInferenceEvent = await createEventWriter({
    client: input.client,
    sessionId: inferenceTurn.sessionId,
    turnId: inferenceTurn.id,
    draftId: inferenceTurn.draftId,
  })
  let completedInferenceTurn = await updateTurn(input.client, inferenceTurn.id, {
    status: 'completed',
    approval_state: 'not_required',
    assistant_summary: `Art style selected: ${selectedPreset.label}. Starting initial skeleton generation.`,
    metadata: {
      ...(inferenceTurn.metadata ?? {}),
      initialSeedMode: 'infer_context',
      initialSeedContext: {
        mode: 'infer_context',
        sourceContext,
        inference,
        selectedArtStylePreset: selectedPreset.id,
        selectedArtStyleDescription: payload.selectedArtStyleDescription,
        skeletonProfileId: skeletonProfile.id,
      },
    },
  })
  await writeInferenceEvent('assistant_note', {
    note: `Art style selected: ${selectedPreset.label}. Starting initial skeleton generation.`,
    turn: completedInferenceTurn,
    session,
  })
  await writeInferenceEvent('turn_completed', {
    note: `Art style selected: ${selectedPreset.label}. Starting initial skeleton generation.`,
    turn: completedInferenceTurn,
    session,
  })
  const generationPrompt = buildInitialSeedGenerationPrompt({
    originalPrompt: inferenceTurn.prompt,
    inference,
    selectedArtStylePreset: selectedPreset.id,
    selectedArtStyleDescription: payload.selectedArtStyleDescription || selectedPreset.description,
  })
  const generationTurnState = await createInitialSeedGenerationTurn({
    client: input.client,
    session,
    payload,
    sourceContext,
    inference,
    skeletonProfile,
    selectedPreset,
    selectedArtStyleDescription: payload.selectedArtStyleDescription || selectedPreset.description,
    projectContext,
    generationPrompt,
  })
  const generationRuntime = resolveInitialSeedGenerationRuntime()
  const job = await createInitialSeedGenerationJob({
    client: input.client,
    session,
    turn: generationTurnState.turn,
    payload,
    sourceContext,
    inference,
    skeletonProfile,
    selectedPreset,
    selectedArtStyleDescription: payload.selectedArtStyleDescription || selectedPreset.description,
    projectContext,
    generationPrompt,
    runtime: generationRuntime,
  })
  await generationTurnState.writeEvent('planner_status', {
    plannerStatus: 'planning',
    plannerProgress: {
      phase: 'reading_context',
      message: 'Initial world generation job accepted.',
      sequence: 1,
    },
    turn: { id: generationTurnState.turn.id },
    job,
  })
  const steps = await createInitialSeedGenerationJobSteps({
    client: input.client,
    job,
    runtime: generationRuntime,
  })
  const firstStep = nextQueuedGenerationStep(steps)
  if (firstStep && generationRuntime !== 'fly') {
    await enqueueWorldPromptGenerationStep({
      client: input.client,
      jobId: job.id,
      stepId: firstStep.id,
    })
    await kickWorldPromptGenerationWorker()
  }
  const responseTurn = generationTurnState.turn
  const responseTurnIds = Array.from(new Set([completedInferenceTurn.id, responseTurn.id]))
  const responseMessages = (await Promise.all(responseTurnIds.map((turnId) => loadTurnMessages(input.client, turnId)))).flat()
  const responseEvents = (await Promise.all(responseTurnIds.map((turnId) => loadTurnEvents(input.client, turnId)))).flat()
  return worldPromptSeedGenerationResponseSchema.parse({
    ok: true,
    session,
    turn: responseTurn,
    messages: responseMessages,
    events: responseEvents,
    suggestions: [],
    threads: [],
    definitions: [],
    projectContext: null,
    worldEntities: seedSnapshot.worldEntities,
    worldRelationships: seedSnapshot.worldRelationships,
    worldViews: seedSnapshot.worldViews,
    worldOperators: seedSnapshot.worldOperators,
    worldResults: seedSnapshot.worldResults,
    worldGraphConnections: seedSnapshot.worldGraphConnections,
    inference,
    skeletonProfile,
    job,
    steps,
  })
}

export async function startWorldPromptTurn(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
  onTurnReady?: (state: { session: WorldPromptSession; turn: WorldPromptTurn }) => Promise<void> | void
}) {
  const payload = worldPromptStartTurnRequestSchema.parse(input.payload)
  if (payload.initialSeedMode === 'generate_skeleton') {
    throw new Error('Initial world seed generation must use continue-world-seed-generation so it runs as a streamed durable job.')
  }
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
        sourceContext: payload.sourceContext ?? undefined,
        initialSeedMode: payload.initialSeedMode,
        initialSeedContext: payload.initialSeedContext ?? undefined,
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
  const tokenUsageRecorder = createWorldPromptTokenUsageRecorder()
  let responseSuggestions: WorldPromptSuggestionRecord[] = []
  let responseProjectContext: ProjectContext | null = payload.snapshot.projectContext ?? null

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
        sourceContext: payload.sourceContext ?? undefined,
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
    await input.onTurnReady?.({ session: workingSession, turn })

    const entityRequirements = analyzeWorldPromptEntityRequirements(payload.prompt)
    if (shouldUseIncrementalPromptPlanning({
      payload,
      plannerMode: initialRetrievalIntent.plannerMode,
      entityRequirements,
      selectedSuggestion,
    })) {
      return await executeIncrementalWorldPromptTurn({
        client: input.client,
        authHeader: input.authHeader,
        payload,
        session: workingSession,
        turn,
        summaryMemory: compacted.summaryMemory,
        sessionMemoryState,
        recentMessages: compacted.recentMessages,
        selectedSuggestion,
        continuationMode,
        writeEvent,
        usageRecorder: tokenUsageRecorder,
      })
    }

    const generatedResult = await generatePromptPlan({
      client: input.client,
      payload,
      session: workingSession,
      summaryMemory: compacted.summaryMemory,
      sessionMemoryState,
      recentMessages: compacted.recentMessages,
      selectedSuggestion,
      usageRecorder: tokenUsageRecorder,
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
    responseProjectContext = await persistInferredProjectContext({
      client: input.client,
      snapshot: payload.snapshot,
      inference: generated.projectContextInference,
    })
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
      ...(generated.classification === 'graph_diagnosis' ? buildDiagnosticSuggestionSet(generated.diagnosticFindings, payload.snapshot.projectContext) : []),
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
      isInitialSeedGeneration: payload.initialSeedMode === 'generate_skeleton',
    })
    const opsToRun = execution.selectedOps
    const { autoOps: autoRunnableOps, approvalOps: skippedRiskyOps } = splitPromptOpsByApproval(opsToRun)
    await writeEvent('planner_status', {
      plannerStatus: execution.mode === 'blocked' ? 'blocked' : 'planning',
      plannerFailure: plannerFailure ?? undefined,
      classification: execution.classification,
      scope: execution.scope,
      answer: execution.answer || undefined,
      answerMode: execution.answerMode,
      diagnosticFindings: execution.diagnosticFindings,
      plannerProgress: {
        phase: 'finalizing_plan',
        message: summarizePlannedGraphChanges({
          selectedOps: opsToRun,
          runnableOps: autoRunnableOps,
          skippedRiskyCount: skippedRiskyOps.length,
        }),
        sequence: 12,
        done: true,
      },
      turn: { id: turn.id },
    })
    const selectedSuggestionHadNoRunnableOps = Boolean(payload.selectedSuggestionId)
      && autoRunnableOps.filter((op) => op.op !== 'assistant_note').length === 0
    const finalizedSuggestions = finalizeSuggestionSet({
      snapshot: planningSnapshot,
      selectedThreadKey: payload.selectedThreadKey,
      sourcePrompt: payload.prompt,
      suggestions: selectedSuggestionHadNoRunnableOps ? [] : execution.suggestions,
      maxCount: 4,
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
    const activePersistedSuggestions = persistedSuggestions.filter((suggestion) => suggestion.state === 'active')
    const responseSuggestionsById = new Map(persistedSuggestions.map((suggestion) => [suggestion.id, suggestion]))
    if (payload.selectedSuggestionId) {
      const usedSuggestion = await markSuggestionUsed(input.client, payload.selectedSuggestionId, turn.id)
      if (usedSuggestion) {
        responseSuggestionsById.set(usedSuggestion.id, usedSuggestion)
      }
    }
    responseSuggestions = Array.from(responseSuggestionsById.values())

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
      suggestionIds: activePersistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      diagnostics: threadDiagnostics,
      turn: { id: turn.id },
    })

    const mutableSnapshot = structuredClone(refreshedPlanningSnapshot) as WorldPromptSnapshot
    const appliedDefinitions: Record<string, unknown>[] = []
    const touchedEntityKeys = new Set<string>()
    const touchedRelationshipKeys = new Set<string>()
    let preferredAutoViewKey: string | null = null
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
          turnId: turn.id,
          op,
        })
        mergeAppliedWorldGraphIntoSnapshot(mutableSnapshot, result.applied)
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
      for (const entityKey of [...touchedEntityKeys]) {
        const touchedEntity = mutableSnapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null
        if (!touchedEntity) continue
        const linkedEntity = await ensureAppliedEntityLinkedDefinition({
          client: input.client,
          snapshot: mutableSnapshot,
          entity: touchedEntity,
        })
        if (linkedEntity.createdDefinition && !appliedDefinitions.some((entry) => entry.key === linkedEntity.createdDefinition?.key)) {
          appliedDefinitions.push(linkedEntity.createdDefinition)
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
        projectContextInference: generated.projectContextInference ?? undefined,
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
    const completedSeedProjectContext = payload.initialSeedMode === 'generate_skeleton'
      ? buildCompletedProjectContextFromInitialSeedContext(payload.initialSeedContext)
      : null
    if (completedSeedProjectContext) {
      responseProjectContext = await persistProjectContextForSeed({
        client: input.client,
        snapshot: mutableSnapshot,
        projectContext: completedSeedProjectContext,
      })
    }
    turn = await updateTurn(input.client, turn.id, {
      status: 'completed',
      approval_state: 'not_required',
      assistant_summary: assistantSummary,
      metadata: {
        ...(turn.metadata ?? {}),
        plannerFailure: plannerFailure ?? undefined,
        sourceContext: payload.sourceContext ?? undefined,
        initialSeedMode: payload.initialSeedMode,
        initialSeedContext: payload.initialSeedContext ?? undefined,
        projectContextInference: generated.projectContextInference ?? undefined,
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
        tokenUsage: tokenUsageRecorder.summary() ?? undefined,
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
      suggestionIds: activePersistedSuggestions.map((suggestion) => suggestion.id),
      threads: persistedThreads,
      diagnostics: threadDiagnostics,
      note: assistantSummary,
      session: workingSession,
    })
    const turnMessages = await loadTurnMessages(input.client, turn.id)
    const turnEvents = await loadTurnEvents(input.client, turn.id)
    return worldPromptStartTurnResponseSchema.parse({
      ok: true,
      session: workingSession,
      turn,
      messages: turnMessages,
      events: turnEvents,
      suggestions: responseSuggestions,
      threads: persistedThreads,
      definitions: appliedDefinitions,
      projectContext: responseProjectContext,
      worldEntities: mutableSnapshot.worldEntities,
      worldRelationships: mutableSnapshot.worldRelationships,
      worldViews: mutableSnapshot.worldViews,
      worldOperators: mutableSnapshot.worldOperators,
      worldResults: mutableSnapshot.worldResults,
      worldGraphConnections: mutableSnapshot.worldGraphConnections,
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
      const turnMessages = await loadTurnMessages(input.client, turn.id)
      const turnEvents = await loadTurnEvents(input.client, turn.id)
      return worldPromptStartTurnResponseSchema.parse({
        ok: true,
        session: workingSession,
        turn,
        messages: turnMessages,
        events: turnEvents,
        suggestions: responseSuggestions,
        threads: [],
        definitions: [],
        projectContext: responseProjectContext,
        worldEntities: payload.snapshot.worldEntities,
        worldRelationships: payload.snapshot.worldRelationships,
        worldViews: payload.snapshot.worldViews,
        worldOperators: payload.snapshot.worldOperators,
        worldResults: payload.snapshot.worldResults,
        worldGraphConnections: payload.snapshot.worldGraphConnections,
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
        tokenUsage: tokenUsageRecorder.summary() ?? undefined,
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
  mergeAppliedWorldGraphIntoSnapshot(mutableSnapshot, result.applied)
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
    mergeAppliedWorldGraphIntoSnapshot(mutableSnapshot, result.applied)
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
  if (!['queued', 'streaming', 'awaiting_approval', 'awaiting_user_input'].includes(turn.status)) {
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

export async function getWorldGenerationStatus(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptGenerationStatusRequestSchema.parse(input.payload)
  let job = await loadGenerationJobById(input.client, payload.jobId)
  let turn = await loadTurnById(input.client, job.turnId)
  const session = await loadSessionById(input.client, job.sessionId)
  const steps = await loadGenerationJobSteps(input.client, job.id)
  const terminalStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled']
  const heartbeatMs = job.heartbeatAt ? new Date(job.heartbeatAt).getTime() : 0
  const staleRunningJob = ['queued', 'running'].includes(job.status)
    && heartbeatMs > 0
    && Date.now() - heartbeatMs > 4 * 60_000
  if (staleRunningJob) {
    const counts = job.counts as Record<string, unknown>
    const opCount = typeof counts.ops === 'number' ? counts.ops : 0
    const finalJobStatus = opCount > 0 ? 'completed_with_errors' : 'failed'
    const note = opCount > 0
      ? `Initial world generation stopped after ${opCount} graph records. The partial world remains available.`
      : 'Initial world generation stopped before graph records could be created.'
    job = await updateGenerationJob(input.client, job.id, {
      status: finalJobStatus,
      completed_at: new Date().toISOString(),
      error_message: opCount > 0 ? 'Generation worker heartbeat expired before normal completion.' : 'Generation worker heartbeat expired.',
    })
    if (!terminalStatuses.includes(turn.status)) {
      turn = await updateTurn(input.client, turn.id, {
        status: opCount > 0 ? 'completed' : 'failed',
        approval_state: 'not_required',
        assistant_summary: note,
        error_message: opCount > 0 ? null : 'Generation worker heartbeat expired.',
        metadata: {
          ...(turn.metadata ?? {}),
          streamedGeneration: true,
          counts,
          staleHeartbeatRecoveredAt: new Date().toISOString(),
        },
      })
      const writeEvent = await createEventWriter({
        client: input.client,
        sessionId: turn.sessionId,
        turnId: turn.id,
        draftId: turn.draftId,
      })
      await writeEvent(opCount > 0 ? 'turn_completed' : 'turn_failed', {
        note,
        diagnostics: ['Generation worker heartbeat expired before normal completion.'],
        turn,
        session,
        job,
      })
    }
  }
  const messages = await loadTurnMessages(input.client, turn.id)
  const events = await loadTurnEvents(input.client, turn.id)
  const terminal = terminalStatuses.includes(job.status)
  if (!terminal && !isFlyGenerationJob(job) && steps.some((step) => ['queued', 'running'].includes(step.status))) {
    await kickWorldPromptGenerationWorker()
  }
  return worldPromptGenerationStatusResponseSchema.parse({
    ok: true,
    session,
    turn,
    messages,
    events,
    suggestions: [],
    threads: [],
    definitions: [],
    projectContext: payload.snapshot.projectContext,
    worldEntities: [],
    worldRelationships: [],
    worldViews: [],
    worldOperators: [],
    worldResults: [],
    worldGraphConnections: [],
    job,
    steps,
    terminal,
  })
}

export async function processWorldGenerationJobs(input: {
  client: SupabaseClient
  authHeader: string
}) {
  const message = await readWorldPromptGenerationQueueMessage(input.client)
  if (!message) {
    return { ok: true, processed: false, job: null, steps: [] }
  }
  const payload = message.message ?? {}
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : ''
  const stepId = typeof payload.stepId === 'string' ? payload.stepId : ''
  if (!jobId || !stepId) {
    await deleteWorldPromptGenerationQueueMessage({ client: input.client, msgId: message.msg_id })
    return { ok: true, processed: false, job: null, steps: [], ignored: 'malformed_message' }
  }

  const job = await loadGenerationJobById(input.client, jobId)
  const step = await loadGenerationJobStepById(input.client, stepId)
  if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)
    || ['completed', 'failed', 'skipped', 'cancelled'].includes(step.status)) {
    await deleteWorldPromptGenerationQueueMessage({ client: input.client, msgId: message.msg_id })
    return {
      ok: true,
      processed: false,
      job,
      steps: await loadGenerationJobSteps(input.client, job.id),
      ignored: 'terminal_state',
    }
  }

  const updatedJob = await runWorldPromptGenerationJob({
    client: input.client,
    authHeader: input.authHeader,
    jobId,
    stepId,
  })
  await deleteWorldPromptGenerationQueueMessage({ client: input.client, msgId: message.msg_id })
  return {
    ok: true,
    processed: true,
    job: updatedJob,
    steps: await loadGenerationJobSteps(input.client, updatedJob.id),
  }
}

async function claimFlyWorldPromptGenerationJob(input: {
  client: SupabaseClient
  workerId: string
  workerSecret?: string | null
}) {
  const response = await input.client.rpc('claim_world_prompt_generation_job', {
    worker_id: input.workerId,
    worker_secret: input.workerSecret ?? null,
  })
  if (response.error) throw new Error(response.error.message)
  const rows = Array.isArray(response.data) ? response.data : []
  const row = rows[0] as { job_id?: unknown; step_id?: unknown } | undefined
  const jobId = typeof row?.job_id === 'string' ? row.job_id : ''
  const stepId = typeof row?.step_id === 'string' ? row.step_id : ''
  return jobId && stepId ? { jobId, stepId } : null
}

export async function processFlyWorldGenerationJobs(input: {
  client: SupabaseClient
  authHeader: string
  workerId: string
  workerSecret?: string | null
}) {
  const claimed = await claimFlyWorldPromptGenerationJob({
    client: input.client,
    workerId: input.workerId,
    workerSecret: input.workerSecret,
  })
  if (!claimed) {
    return { ok: true, processed: false, job: null, steps: [], ignored: 'no_fly_job' }
  }
  console.log('[world-generation-job] Fly worker claimed generation job.', {
    workerId: input.workerId,
    jobId: claimed.jobId,
    stepId: claimed.stepId,
  })
  const updatedJob = await runWorldPromptGenerationJob({
    client: input.client,
    authHeader: input.authHeader,
    jobId: claimed.jobId,
    stepId: claimed.stepId,
  })
  return {
    ok: true,
    processed: true,
    job: updatedJob,
    steps: await loadGenerationJobSteps(input.client, updatedJob.id),
  }
}

export async function cancelWorldGenerationJob(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptCancelGenerationJobRequestSchema.parse(input.payload)
  let job = await loadGenerationJobById(input.client, payload.jobId)
  let turn = await loadTurnById(input.client, job.turnId)
  let steps = await loadGenerationJobSteps(input.client, job.id)
  if (!['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
    job = await updateGenerationJob(input.client, job.id, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: null,
    })
  }
  await Promise.all(steps
    .filter((step) => ['queued', 'running'].includes(step.status))
    .map((step) => updateGenerationJobStep(input.client, step.id, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: null,
    })))
  steps = await loadGenerationJobSteps(input.client, job.id)
  if (['queued', 'streaming', 'awaiting_approval', 'awaiting_user_input'].includes(turn.status)) {
    turn = await updateTurn(input.client, turn.id, {
      status: 'cancelled',
      approval_state: 'not_required',
      assistant_summary: turn.assistantSummary || 'Initial world generation cancelled.',
      error_message: null,
    })
    const writeEvent = await createEventWriter({
      client: input.client,
      sessionId: turn.sessionId,
      turnId: turn.id,
      draftId: turn.draftId,
    })
    await writeEvent('turn_cancel_requested', {
      note: 'Initial world generation cancellation requested.',
      turn,
      job,
    })
    await writeEvent('turn_completed', {
      note: 'Initial world generation cancelled.',
      turn,
      job,
    })
  }
  return worldPromptCancelGenerationJobResponseSchema.parse({
    ok: true,
    job,
    steps,
    turn,
  })
}
