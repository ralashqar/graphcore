import { z } from 'zod'
import { projectContextSchema } from './projectContext.ts'
import { worldSeedSkeletonProfileSchema } from './worldSeedProfiles.ts'

import {
  worldEntityCreateInputSchema,
  worldEntitySchema,
  worldEntityNodeTypeSchema,
  worldGraphConnectionSchema,
  worldOperatorSchema,
  worldRelationshipSchema,
  worldResultSchema,
  worldWikiPresentationMetadataSchema,
  worldViewKindSchema,
  worldViewSchema,
} from './worldGraph.ts'
import { worldThreadSchema } from './worldThread.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldPromptSourceContextKindSchema = z.enum(['prompt', 'file', 'url', 'example'])
export const worldPromptSourceContextSchema = z.object({
  kind: worldPromptSourceContextKindSchema,
  title: z.string().default(''),
  fileName: z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  extractedText: z.string().default(''),
  charCount: z.number().int().nonnegative().default(0),
  truncated: z.boolean().default(false),
}).default({
  kind: 'prompt',
  title: '',
  fileName: null,
  mimeType: null,
  url: null,
  extractedText: '',
  charCount: 0,
  truncated: false,
})

export const worldPromptProjectContextInferenceSchema = z.object({
  projectType: projectContextSchema.shape.projectType,
  projectSubtype: projectContextSchema.shape.projectSubtype,
  artStylePreset: z.string().min(1).default('live_action_cinematic'),
  artStyleDescription: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.7),
  rationale: z.string().default(''),
})

export const worldPromptSessionStatusSchema = z.enum(['active', 'archived'])
export const worldPromptTurnStatusSchema = z.enum(['queued', 'streaming', 'awaiting_approval', 'awaiting_user_input', 'completed', 'failed', 'cancelled'])
export const worldPromptApprovalStateSchema = z.enum(['not_required', 'pending', 'resolved'])
export const worldPromptMessageRoleSchema = z.enum(['system', 'user', 'assistant'])
export const worldPromptEventTypeSchema = z.enum([
  'turn_started',
  'message_created',
  'planner_status',
  'work_item_started',
  'work_item_completed',
  'work_item_failed',
  'assistant_note',
  'op_applied',
  'op_needs_approval',
  'op_approved',
  'op_rejected',
  'queue_started',
  'turn_cancel_requested',
  'turn_completed',
  'turn_failed',
])
export const promptToWorldApplyModeSchema = z.enum(['auto', 'needs_approval'])
export const worldPromptOpStatusSchema = z.enum(['pending', 'applied', 'approved', 'rejected', 'failed'])
export const worldPromptQueueTypeSchema = z.enum(['image_generation', 'cinematic_generation'])
export const worldPromptSuggestionKindSchema = z.enum([
  'continue_scope',
  'plan_only',
  'repair_prompt',
  'advisory_option',
  'diagnostic_gap',
  'refinement_option',
  'apply_patch_option',
])
export const worldPromptSuggestionStyleSchema = z.enum(['primary', 'secondary'])
export const worldPromptSuggestionSourceSchema = z.enum(['thread', 'wave2', 'repair', 'analysis', 'advisory'])
export const worldPromptSuggestionStateSchema = z.enum(['active', 'used', 'dismissed', 'superseded'])
export const worldPromptPlannerStatusSchema = z.enum(['planning', 'scoping', 'applying', 'awaiting_approval', 'blocked', 'completed'])
export const worldPromptScopeModeSchema = z.enum(['direct', 'staged', 'blocked', 'advisory'])
export const worldPromptClassificationSchema = z.enum([
  'graphable_direct',
  'graphable_broad',
  'graphable_plan_only',
  'advisory_question',
  'graph_diagnosis',
  'refinement_only',
  'not_graphable',
  'contradictory_or_low_confidence',
])
export const worldPromptSuggestionUiKindSchema = z.enum(['next_move', 'clarification', 'advisory', 'diagnostic'])
export const worldPromptSuggestionExecutionModeSchema = z.enum(['answer_only', 'plan_only', 'apply_if_selected'])
export const worldPromptGenerationJobStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const worldPromptGenerationJobKindSchema = z.enum(['initial_seed_stream'])
export const worldPromptGenerationStepStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'skipped', 'cancelled'])
export const worldPromptGenerationStepPhaseSchema = z.enum(['full_stream', 'world_bible', 'core_entities', 'sequence_units', 'relationships', 'finalize'])
export const worldPromptAnswerModeSchema = z.enum(['answer_only', 'answer_plus_options', 'answer_plus_preview'])
export const worldPromptResolvedModeSchema = z.enum(['answer_only', 'preview_first_wave', 'apply_compact_wave', 'blocked'])
export const worldPromptResolvedIntentSchema = z.enum(['graph_build', 'refinement', 'advisory', 'diagnosis'])
export const worldPromptResolvedFocusSchema = z.enum(['current_focus', 'pivot_focus', 'background_focus'])
export const worldPromptSuggestionApplyPolicySchema = z.enum(['answer_only', 'preview', 'auto_if_safe', 'approval_if_risky'])
export const worldPromptPlannerProgressPhaseSchema = z.enum([
  'reading_context',
  'analyzing_graph',
  'planning_entities',
  'planning_relationships',
  'assembling_first_wave',
  'planning_manifest',
  'generating_entity',
  'generating_sequence_unit',
  'mapping_relationships',
  'finalizing_world',
  'finalizing_plan',
  'applying_changes',
])
export const worldPromptPreviewModeSchema = z.enum(['plan_only', 'staged_first_wave'])
export const worldPromptPreviewItemKindSchema = z.enum([
  'entity',
  'relationship',
  'derived_result',
  'image_queue',
  'cinematic_queue',
  'wiki_metadata',
  'assistant_note',
])
export const worldPromptPreviewItemStatusSchema = z.enum(['preview', 'applied', 'skipped'])

const worldPromptEntityReferenceSchema = z.object({
  entityKey: z.string().nullable().default(null),
  definitionKey: z.string().nullable().default(null),
  name: z.string().default(''),
  alias: z.string().nullable().default(null),
  matchCandidateEntityKeys: z.array(z.string()).default([]),
})

const promptToWorldOpBaseSchema = z.object({
  id: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  applyMode: promptToWorldApplyModeSchema.default('auto'),
  dependencyOpIds: z.array(z.string()).default([]),
  rationale: z.string().default(''),
  status: worldPromptOpStatusSchema.default('pending'),
  metadata: looseRecordSchema.default({}),
})

const promptToWorldUpsertEntityPayloadSchema = z.object({
  targetEntityKey: z.string().nullable().default(null),
  entity: worldEntityCreateInputSchema.extend({
    ensureLinkedDefinition: z.boolean().default(true),
  }),
})

const promptToWorldUpdateEntityPayloadSchema = z.object({
  targetEntityKey: z.string(),
  changes: worldEntityCreateInputSchema.partial(),
})

const promptToWorldReplaceEntityPayloadSchema = z.object({
  targetEntityKey: z.string(),
  replacementMode: z.enum(['create', 'existing']).default('create'),
  replacementEntity: worldEntityCreateInputSchema.extend({
    ensureLinkedDefinition: z.boolean().default(true),
  }).nullable().default(null),
  replacementEntityKey: z.string().nullable().default(null),
  transferRelationships: z.boolean().default(true),
  transferGraphConnections: z.boolean().default(true),
  transferDerivedResults: z.boolean().default(true),
  archiveOldEntity: z.boolean().default(true),
  deleteOldEntity: z.boolean().default(false),
  reason: z.string().default(''),
})

const promptToWorldUpsertRelationshipPayloadSchema = z.object({
  targetRelationshipKey: z.string().nullable().default(null),
  relationship: z.object({
    sourceEntityKey: z.string().nullable().default(null),
    targetEntityKey: z.string().nullable().default(null),
    sourceRef: worldPromptEntityReferenceSchema.optional(),
    targetRef: worldPromptEntityReferenceSchema.optional(),
    verb: z.string().min(1),
    direction: z.enum(['outbound', 'inbound', 'bidirectional']).default('outbound'),
    strength: z.number().min(0).max(1).nullable().default(null),
    confidence: z.number().min(0).max(1).nullable().default(null),
    source: z.enum(['user', 'ai', 'inferred']).default('ai'),
    notes: z.string().default(''),
    state: z.enum(['confirmed', 'suggested', 'inferred']).default('confirmed'),
    metadata: looseRecordSchema.default({}),
  }),
})

const promptToWorldUpdateRelationshipPayloadSchema = z.object({
  targetRelationshipKey: z.string(),
  changes: z.object({
    sourceEntityKey: z.string().nullable().optional(),
    targetEntityKey: z.string().nullable().optional(),
    verb: z.string().min(1).optional(),
    direction: z.enum(['outbound', 'inbound', 'bidirectional']).optional(),
    strength: z.number().min(0).max(1).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    source: z.enum(['user', 'ai', 'inferred']).optional(),
    notes: z.string().optional(),
    state: z.enum(['confirmed', 'suggested', 'inferred']).optional(),
    metadata: looseRecordSchema.optional(),
  }),
})

const promptToWorldCreateDerivedResultPayloadSchema = z.object({
  sourceEntityKey: z.string(),
  targetEntityKey: z.string(),
  operatorType: z.enum(['wear', 'equip', 'hold', 'place_in', 'paired_with', 'stage_scene']),
  title: z.string().optional(),
  summary: z.string().default(''),
  metadata: looseRecordSchema.default({}),
})

const promptToWorldQueueImagePayloadSchema = z.object({
  targetEntityKey: z.string(),
  definitionKey: z.string().nullable().default(null),
  prompt: z.string().default(''),
  reason: z.string().default(''),
  queueType: z.literal('image_generation').default('image_generation'),
})

const promptToWorldQueueCinematicPayloadSchema = z.object({
  prompt: z.string().default(''),
  title: z.string().default(''),
  relatedEntityKeys: z.array(z.string()).default([]),
  resultKey: z.string().nullable().default(null),
  queueType: z.literal('cinematic_generation').default('cinematic_generation'),
})

const promptToWorldAssistantNotePayloadSchema = z.object({
  message: z.string(),
})

const promptToWorldUpdateWorldWikiMetadataPayloadSchema = z.object({
  target: z.enum(['project', 'view']).default('project'),
  targetViewKey: z.string().nullable().default(null),
  metadata: worldWikiPresentationMetadataSchema,
  reason: z.string().default(''),
})

export const worldPromptSuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  prompt: z.string(),
  kind: worldPromptSuggestionKindSchema,
  style: worldPromptSuggestionStyleSchema,
  source: worldPromptSuggestionSourceSchema.default('repair'),
  threadKey: z.string().nullable().default(null),
  summary: z.string().default(''),
  estimatedNodeCount: z.number().int().nonnegative().default(0),
  estimatedEdgeCount: z.number().int().nonnegative().default(0),
  willQueueImages: z.boolean().default(false),
  willQueueCinematics: z.boolean().default(false),
  uiKind: worldPromptSuggestionUiKindSchema.optional(),
  executionMode: worldPromptSuggestionExecutionModeSchema.optional(),
  actionMode: worldPromptResolvedModeSchema.optional(),
  applyPolicy: worldPromptSuggestionApplyPolicySchema.optional(),
  targetEntityKeys: z.array(z.string()).optional(),
  targetThreadKeys: z.array(z.string()).optional(),
  suggestedViewKey: z.string().nullable().optional(),
  targetRootEntityKey: z.string().nullable().optional(),
  preferredViewKind: worldViewKindSchema.nullable().optional(),
  focusLayer: z.enum(['actor', 'group', 'place', 'concept', 'event', 'object', 'sequence', 'general']).optional(),
  retrievalHint: z.string().optional(),
  generatedReason: z.string().optional(),
  generatedFromTurnId: z.string().nullable().optional(),
})

export const worldPromptSuggestionRecordSchema = worldPromptSuggestionSchema.extend({
  draftId: z.string(),
  sessionId: z.string(),
  turnId: z.string().nullable().default(null),
  state: worldPromptSuggestionStateSchema.default('active'),
  rank: z.number().int().nonnegative().default(0),
  usedTurnId: z.string().nullable().default(null),
  dismissedAt: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldPromptPlannerFailureSchema = z.object({
  category: z.enum(['timeout', 'upstream_error', 'invalid_json', 'schema_validation_failed', 'unknown']),
  message: z.string().default('Hosted prompt planning failed.'),
  fallbackUsed: z.boolean().default(true),
  occurredAt: z.string(),
})

export const worldPromptDiagnosticFindingSchema = z.object({
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
})

export const worldPromptScopeCountsSchema = z.object({
  actionableOps: z.number().int().nonnegative().default(0),
  entityOps: z.number().int().nonnegative().default(0),
  relationshipOps: z.number().int().nonnegative().default(0),
  existingEntityModificationOps: z.number().int().nonnegative().default(0),
  queueOps: z.number().int().nonnegative().default(0),
  derivedResultOps: z.number().int().nonnegative().default(0),
})

export const worldPromptScopeDecisionSchema = z.object({
  mode: worldPromptScopeModeSchema,
  counts: worldPromptScopeCountsSchema,
  starterPackApplied: z.boolean().default(false),
})

export const promptToWorldOpSchema = z.discriminatedUnion('op', [
  promptToWorldOpBaseSchema.extend({
    op: z.literal('upsert_entity'),
    payload: promptToWorldUpsertEntityPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('update_entity'),
    payload: promptToWorldUpdateEntityPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('replace_entity'),
    payload: promptToWorldReplaceEntityPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('upsert_relationship'),
    payload: promptToWorldUpsertRelationshipPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('update_relationship'),
    payload: promptToWorldUpdateRelationshipPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('create_derived_result'),
    payload: promptToWorldCreateDerivedResultPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('queue_image_generation'),
    payload: promptToWorldQueueImagePayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('queue_cinematic_generation'),
    payload: promptToWorldQueueCinematicPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('update_world_wiki_metadata'),
    payload: promptToWorldUpdateWorldWikiMetadataPayloadSchema,
  }),
  promptToWorldOpBaseSchema.extend({
    op: z.literal('assistant_note'),
    payload: promptToWorldAssistantNotePayloadSchema,
  }),
])

export const worldPromptPreviewItemSchema = z.object({
  id: z.string(),
  kind: worldPromptPreviewItemKindSchema,
  title: z.string(),
  summary: z.string().default(''),
  targetKeys: z.array(z.string()).default([]),
  diffMode: z.enum(['new', 'touches_existing']).default('new'),
  touchesCanon: z.boolean().default(false),
  approvalRequired: z.boolean().default(false),
  estimatedImpact: z.object({
    nodeCount: z.number().int().nonnegative().default(0),
    edgeCount: z.number().int().nonnegative().default(0),
    queueCount: z.number().int().nonnegative().default(0),
  }).default({ nodeCount: 0, edgeCount: 0, queueCount: 0 }),
  status: worldPromptPreviewItemStatusSchema.default('preview'),
})

export const worldPromptPlanPreviewSchema = z.object({
  mode: worldPromptPreviewModeSchema,
  requestSummary: z.string().default(''),
  scopeDecision: worldPromptScopeDecisionSchema,
  items: z.array(worldPromptPreviewItemSchema).default([]),
  suggestions: z.array(worldPromptSuggestionSchema).default([]),
  canApplyFirstWave: z.boolean().default(false),
  pendingOps: z.array(promptToWorldOpSchema).default([]),
  appliedAt: z.string().nullable().default(null),
})

export const worldPromptPlannerProgressSchema = z.object({
  phase: worldPromptPlannerProgressPhaseSchema,
  message: z.string().default(''),
  sequence: z.number().int().nonnegative().default(0),
  done: z.boolean().optional(),
  workItemId: z.string().optional(),
  workItemKind: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
})

export const worldPromptIncrementalWorkItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'wiki_metadata',
    'entity_batch',
    'sequence_unit',
    'relationship_batch',
    'thread_batch',
    'suggestion_batch',
    'final_summary',
  ]),
  label: z.string(),
  objective: z.string().default(''),
  dependsOn: z.array(z.string()).default([]),
  expectedOps: z.number().int().nonnegative().default(1),
  entityTypes: z.array(z.string()).default([]),
  sequenceOrdinal: z.number().int().positive().nullable().default(null),
  critical: z.boolean().default(false),
})

export const worldPromptIncrementalBuildBriefSchema = z.object({
  summary: z.string().default(''),
  sourceOutline: z.string().default(''),
  requirements: z.array(z.string()).default([]),
  canonConstraints: z.array(z.string()).default([]),
  tone: z.array(z.string()).default([]),
  plannedCoverage: z.array(z.string()).default([]),
  sourceExcerptKeys: z.array(z.string()).default([]),
}).default({
  summary: '',
  sourceOutline: '',
  requirements: [],
  canonConstraints: [],
  tone: [],
  plannedCoverage: [],
  sourceExcerptKeys: [],
})

export const worldPromptBuildLedgerEntrySchema = z.object({
  key: z.string(),
  entryType: z.enum(['entity', 'relationship', 'thread', 'sequence_stub']),
  nodeType: worldEntityNodeTypeSchema.nullable().default(null),
  name: z.string().default(''),
  role: z.string().default(''),
  sourceEntityKey: z.string().nullable().default(null),
  targetEntityKey: z.string().nullable().default(null),
  verb: z.string().default(''),
  ordinal: z.number().nullable().default(null),
  storyFunction: z.string().default(''),
  outcome: z.string().default(''),
  linkedEntityKeys: z.array(z.string()).default([]),
})

export const worldPromptWorkItemContextSchema = z.object({
  buildBrief: worldPromptIncrementalBuildBriefSchema,
  currentWorkItem: worldPromptIncrementalWorkItemSchema,
  dependencies: z.array(worldPromptIncrementalWorkItemSchema).default([]),
  adjacentWorkItems: z.array(worldPromptIncrementalWorkItemSchema).default([]),
  completedWorkItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    kind: z.string(),
  })).default([]),
  failedWorkItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    reason: z.string(),
  })).default([]),
  ledger: z.array(worldPromptBuildLedgerEntrySchema).default([]),
  relevantEntities: z.array(z.object({
    key: z.string(),
    name: z.string(),
    nodeType: worldEntityNodeTypeSchema,
    summary: z.string().default(''),
    sequence: z.object({
      ordinal: z.number().nullable().default(null),
      storyFunction: z.string().default(''),
      outcome: z.string().default(''),
    }).nullable().default(null),
  })).default([]),
  relevantRelationships: z.array(z.object({
    key: z.string(),
    sourceEntityKey: z.string(),
    targetEntityKey: z.string(),
    verb: z.string(),
    notes: z.string().default(''),
  })).default([]),
  relevantThreads: z.array(z.object({
    key: z.string(),
    title: z.string(),
    summary: z.string().default(''),
    linkedEntityKeys: z.array(z.string()).default([]),
  })).default([]),
  sourceExcerpts: z.array(z.object({
    key: z.string(),
    title: z.string().default(''),
    text: z.string().default(''),
  })).default([]),
  ledgerOnly: z.boolean().default(false),
})

export const worldPromptWorkItemResultSchema = z.object({
  assistantSummary: z.string().default(''),
  wave1Ops: z.array(promptToWorldOpSchema).default([]),
  threadActions: z.array(looseRecordSchema).default([]),
  suggestionCandidates: z.array(looseRecordSchema).default([]),
})

const streamRecordStringListSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  return []
}, z.array(z.string()).default([]))

export const streamWikiRecordSchema = z.object({
  kind: z.literal('wiki'),
  id: z.string().optional(),
  title: z.string().default(''),
  logline: z.string().default(''),
  synopsis: z.string().default(''),
  genre: z.union([z.string(), z.array(z.string())]).default(''),
  themes: streamRecordStringListSchema,
  toneTags: streamRecordStringListSchema,
  coreConflict: z.string().default(''),
  visualMotifs: streamRecordStringListSchema,
  sectionOrder: z.array(z.string()).default([]),
  wikiSections: looseRecordSchema.default({}),
}).catchall(z.unknown())

export const streamEntityRecordSchema = z.object({
  kind: z.literal('entity'),
  id: z.string().optional(),
  key: z.string().optional(),
  nodeType: worldEntityNodeTypeSchema,
  name: z.string().min(1),
  summary: z.string().default(''),
  context: z.string().default(''),
  visualDescription: z.string().default(''),
  aliases: streamRecordStringListSchema,
  tags: streamRecordStringListSchema,
  customProperties: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
}).catchall(z.unknown())

export const streamSequenceUnitRecordSchema = z.object({
  kind: z.literal('sequence_unit'),
  id: z.string().optional(),
  key: z.string().optional(),
  name: z.string().default(''),
  summary: z.string().default(''),
  context: z.string().default(''),
  visualDescription: z.string().default(''),
  unitKind: z.string().default('sequence_unit'),
  sequenceKey: z.string().default('main'),
  ordinal: z.number().int().positive().optional(),
  actLabel: z.string().default(''),
  synopsis: z.string().default(''),
  dramaticQuestion: z.string().default(''),
  storyFunction: z.string().default(''),
  outcome: z.string().default(''),
  consequences: z.array(looseRecordSchema).default([]),
  characterArcDeltas: z.array(looseRecordSchema).default([]),
  openLoops: streamRecordStringListSchema,
  resolvedLoops: streamRecordStringListSchema,
  tags: streamRecordStringListSchema,
  scriptExpansionReady: z.boolean().default(true),
}).catchall(z.unknown())

export const streamRelationshipRecordSchema = z.object({
  kind: z.literal('relationship'),
  id: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  sourceEntityKey: z.string().optional(),
  targetEntityKey: z.string().optional(),
  verb: z.string().optional(),
  relationshipVerb: z.string().optional(),
  notes: z.string().default(''),
  direction: z.enum(['outbound', 'inbound', 'bidirectional']).default('outbound'),
  confidence: z.number().min(0).max(1).nullable().default(null),
  strength: z.number().min(0).max(1).nullable().default(null),
  tags: streamRecordStringListSchema,
  metadata: looseRecordSchema.default({}),
}).catchall(z.unknown())

export const streamRepairSkipRecordSchema = z.object({
  kind: z.literal('skip'),
  reason: z.string().default(''),
}).catchall(z.unknown())

export const worldPromptStreamGraphOpEnvelopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('op'),
    op: promptToWorldOpSchema,
  }),
  z.object({
    kind: z.literal('note'),
    message: z.string().min(1),
  }),
  z.object({
    kind: z.literal('summary'),
    assistantSummary: z.string().default(''),
  }),
  streamWikiRecordSchema,
  streamEntityRecordSchema,
  streamSequenceUnitRecordSchema,
  streamRelationshipRecordSchema,
  streamRepairSkipRecordSchema,
])

export const worldPromptIncrementalManifestSchema = z.object({
  summary: z.string().default(''),
  classification: worldPromptClassificationSchema.default('graphable_broad'),
  assistantSummary: z.string().default(''),
  projectContextInference: worldPromptProjectContextInferenceSchema.nullable().default(null),
  buildBrief: worldPromptIncrementalBuildBriefSchema,
  workItems: z.array(worldPromptIncrementalWorkItemSchema).default([]),
})

export const worldPromptTokenBudgetDiagnosticsSchema = z.object({
  surface: z.string(),
  promptChars: z.number().int().nonnegative().default(0),
  sourceChars: z.number().int().nonnegative().default(0),
  retrievalChars: z.number().int().nonnegative().default(0),
  manifestChars: z.number().int().nonnegative().default(0),
  graphStateChars: z.number().int().nonnegative().default(0),
  ledgerChars: z.number().int().nonnegative().default(0),
  schemaSurface: z.string().default(''),
  workItemId: z.string().nullable().default(null),
  workItemKind: z.string().nullable().default(null),
  workItemIndex: z.number().int().nonnegative().nullable().default(null),
  ledgerOnly: z.boolean().default(false),
})

export const worldPromptSessionFocusStateSchema = z.object({
  entityKeys: z.array(z.string()).default([]),
  threadKeys: z.array(z.string()).default([]),
  focusLayer: z.enum(['actor', 'group', 'place', 'concept', 'event', 'object', 'sequence', 'general']).nullable().default(null),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  selectedThreadKey: z.string().nullable().default(null),
  updatedAt: z.string().default(''),
})

export const worldPromptRecentTurnSummarySchema = z.object({
  turnId: z.string().nullable().default(null),
  prompt: z.string().default(''),
  assistantSummary: z.string().default(''),
  classification: worldPromptClassificationSchema.nullable().default(null),
  focusLayer: z.enum(['actor', 'group', 'place', 'concept', 'event', 'object', 'sequence', 'general']).nullable().default(null),
  continuityMode: z.enum(['follow_up', 'topic_shift', 'fresh_question']).nullable().default(null),
  createdAt: z.string().default(''),
})

export const worldPromptSessionMemoryStateSchema = z.object({
  activeFocus: worldPromptSessionFocusStateSchema,
  backgroundFocus: worldPromptSessionFocusStateSchema.nullable().default(null),
  frontierEntityKeys: z.array(z.string()).default([]),
  recentThreadKeys: z.array(z.string()).default([]),
  recentTurnSummaries: z.array(worldPromptRecentTurnSummarySchema).default([]),
  lastContinuityMode: z.enum(['follow_up', 'topic_shift', 'fresh_question']).nullable().default(null),
  lastPlannerMode: z.enum(['direct_build', 'refinement', 'advisory_diagnosis']).nullable().default(null),
  lastRetrievedKeys: z.object({
    entityKeys: z.array(z.string()).default([]),
    threadKeys: z.array(z.string()).default([]),
  }).default({ entityKeys: [], threadKeys: [] }),
})

export const worldPromptRetrievalDiagnosticsSchema = z.object({
  anchorEntityKeys: z.array(z.string()).default([]),
  anchorThreadKeys: z.array(z.string()).default([]),
  selectedSuggestionId: z.string().nullable().default(null),
  ftsHits: z.array(z.object({
    resourceType: z.enum(['entity', 'relationship', 'thread']),
    resourceKey: z.string(),
    score: z.number().default(0),
  })).default([]),
  rankedEntityScores: z.array(z.object({
    key: z.string(),
    score: z.number().default(0),
  })).default([]),
  rankedThreadScores: z.array(z.object({
    key: z.string(),
    score: z.number().default(0),
  })).default([]),
  droppedEntityKeys: z.array(z.string()).default([]),
  droppedThreadKeys: z.array(z.string()).default([]),
  loadedEntityKeys: z.array(z.string()).default([]),
  loadedRelationshipKeys: z.array(z.string()).default([]),
  loadedThreadKeys: z.array(z.string()).default([]),
  hitReasons: z.array(z.object({
    key: z.string(),
    kind: z.enum(['entity', 'relationship', 'thread']),
    reason: z.enum(['selected_focus', 'selected_view', 'selected_thread', 'selected_suggestion', 'atlas_match', 'alias_match', 'fuzzy_match', 'fts', 'thread_linked', 'recent_chat', 'session_memory', 'graph_neighbor', 'fallback_core']),
    score: z.number().default(0),
    label: z.string().default(''),
    matchedText: z.string().default(''),
  })).default([]),
  ambiguityCandidates: z.array(z.object({
    key: z.string(),
    kind: z.enum(['entity', 'relationship', 'thread']),
    label: z.string().default(''),
    reason: z.string().default(''),
    score: z.number().default(0),
  })).default([]),
  weakContext: z.boolean().default(false),
  contextBudget: z.object({
    atlasEntities: z.number().int().nonnegative().default(0),
    atlasTotalEntities: z.number().int().nonnegative().default(0),
    atlasOmittedEntities: z.number().int().nonnegative().default(0),
    relevantEntities: z.number().int().nonnegative().default(0),
    relevantRelationships: z.number().int().nonnegative().default(0),
    relevantThreads: z.number().int().nonnegative().default(0),
    recentMessages: z.number().int().nonnegative().default(0),
    fullAtlasIncluded: z.boolean().default(false),
  }).default({
    atlasEntities: 0,
    atlasTotalEntities: 0,
    atlasOmittedEntities: 0,
    relevantEntities: 0,
    relevantRelationships: 0,
    relevantThreads: 0,
    recentMessages: 0,
    fullAtlasIncluded: false,
  }),
  chosenFocusLayer: z.enum(['actor', 'group', 'place', 'concept', 'event', 'object', 'sequence', 'general']).nullable().default(null),
  continuityMode: z.enum(['follow_up', 'topic_shift', 'fresh_question']).nullable().default(null),
  executionReason: z.string().default(''),
})

export const worldPromptContextHitReasonSchema = z.enum(['selected_focus', 'selected_view', 'selected_thread', 'selected_suggestion', 'atlas_match', 'alias_match', 'fuzzy_match', 'fts', 'thread_linked', 'recent_chat', 'session_memory', 'graph_neighbor', 'fallback_core'])

export const worldPromptAtlasIndexSchema = z.object({
  totalEntityCount: z.number().int().nonnegative().default(0),
  omittedEntityCount: z.number().int().nonnegative().default(0),
  capped: z.boolean().default(false),
  entityTypeCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  entities: z.array(z.object({
    key: z.string(),
    name: z.string(),
    nodeType: worldEntityNodeTypeSchema,
    aliases: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    status: z.string().default('active'),
    relationCount: z.number().int().nonnegative().default(0),
  })).default([]),
})

export const worldPromptContextHitSchema = z.object({
  key: z.string(),
  kind: z.enum(['entity', 'relationship', 'thread']),
  reason: worldPromptContextHitReasonSchema,
  score: z.number().default(0),
  label: z.string().default(''),
  matchedText: z.string().default(''),
})

export const worldPromptContextBudgetSchema = worldPromptRetrievalDiagnosticsSchema.shape.contextBudget

export const worldPromptResolvedContextSchema = z.object({
  summaryMemory: z.string().default(''),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  selectedThreadKey: z.string().nullable().default(null),
  resolvedMode: worldPromptResolvedModeSchema.nullable().default(null),
  resolvedIntent: worldPromptResolvedIntentSchema.nullable().default(null),
  resolvedFocus: worldPromptResolvedFocusSchema.nullable().default(null),
  sessionMemoryState: worldPromptSessionMemoryStateSchema.optional(),
}).catchall(z.unknown())

export const worldPromptSessionSchema = z.object({
  id: z.string(),
  key: z.string(),
  draftId: z.string(),
  title: z.string(),
  status: worldPromptSessionStatusSchema.default('active'),
  isActive: z.boolean().default(true),
  summaryMemory: z.string().default(''),
  lastContext: looseRecordSchema.default({}),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  model: z.string().default('gpt-5.4'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldPromptInitialSeedModeSchema = z.enum(['standard', 'infer_context', 'generate_skeleton'])

export const worldPromptArtStyleOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  group: z.string().default(''),
  thumbnailUrl: z.string().nullable().default(null),
  recommended: z.boolean().default(false),
})

export const worldPromptInitialSeedContextSchema = z.object({
  mode: worldPromptInitialSeedModeSchema.default('standard'),
  sourceContext: worldPromptSourceContextSchema.optional(),
  inference: worldPromptProjectContextInferenceSchema.optional(),
  selectedArtStylePreset: z.string().min(1).nullable().default(null),
  selectedArtStyleDescription: z.string().default(''),
  skeletonProfileId: z.string().min(1).nullable().default(null),
}).default({ mode: 'standard', selectedArtStylePreset: null, selectedArtStyleDescription: '', skeletonProfileId: null })

const worldPromptTurnMetadataSchema = z.object({
  sourceContext: worldPromptSourceContextSchema.optional(),
  projectContextInference: worldPromptProjectContextInferenceSchema.optional(),
  initialSeedMode: worldPromptInitialSeedModeSchema.optional(),
  initialSeedContext: worldPromptInitialSeedContextSchema.optional(),
  artStyleOptions: z.array(worldPromptArtStyleOptionSchema).optional(),
  skeletonProfileId: z.string().optional(),
  scopeDecision: worldPromptScopeDecisionSchema.optional(),
  classification: worldPromptClassificationSchema.optional(),
  preview: worldPromptPlanPreviewSchema.nullable().optional(),
  plannerFailure: worldPromptPlannerFailureSchema.optional(),
  answer: z.string().optional(),
  answerMode: worldPromptAnswerModeSchema.optional(),
  diagnosticFindings: z.array(worldPromptDiagnosticFindingSchema).optional(),
  resolvedMode: worldPromptResolvedModeSchema.optional(),
  resolvedIntent: worldPromptResolvedIntentSchema.optional(),
  resolvedFocus: worldPromptResolvedFocusSchema.optional(),
  retrievalDiagnostics: worldPromptRetrievalDiagnosticsSchema.optional(),
}).catchall(z.unknown())

export const worldPromptTurnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  draftId: z.string(),
  prompt: z.string(),
  status: worldPromptTurnStatusSchema.default('queued'),
  model: z.string().default('gpt-5.4'),
  resolvedContext: worldPromptResolvedContextSchema.default(() => worldPromptResolvedContextSchema.parse({})),
  approvalState: worldPromptApprovalStateSchema.default('not_required'),
  assistantSummary: z.string().default(''),
  errorMessage: z.string().nullable().default(null),
  responseId: z.string().nullable().default(null),
  metadata: worldPromptTurnMetadataSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldPromptMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string().nullable().default(null),
  draftId: z.string(),
  role: worldPromptMessageRoleSchema,
  content: z.string(),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
})

export const worldPromptEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  draftId: z.string(),
  sequence: z.number().int().nonnegative(),
  eventType: worldPromptEventTypeSchema,
  opId: z.string().nullable().default(null),
  payload: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
})

export const worldPromptGenerationJobSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  kind: worldPromptGenerationJobKindSchema.default('initial_seed_stream'),
  status: worldPromptGenerationJobStatusSchema.default('queued'),
  attemptCount: z.number().int().nonnegative().default(0),
  heartbeatAt: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  tokenUsage: looseRecordSchema.default({}),
  counts: looseRecordSchema.default({}),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  latestAppliedOpCursor: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldPromptGenerationJobStepSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  draftId: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  stepKey: z.string(),
  phase: worldPromptGenerationStepPhaseSchema,
  status: worldPromptGenerationStepStatusSchema.default('queued'),
  attemptCount: z.number().int().nonnegative().default(0),
  orderIndex: z.number().int().nonnegative().default(0),
  heartbeatAt: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  tokenUsage: looseRecordSchema.default({}),
  counts: looseRecordSchema.default({}),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  latestAppliedOpCursor: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldPromptEventPayloadSchema = z.object({
  session: worldPromptSessionSchema.partial().optional(),
  turn: worldPromptTurnSchema.partial().optional(),
  message: worldPromptMessageSchema.partial().optional(),
  threads: z.array(worldThreadSchema).default([]),
  op: promptToWorldOpSchema.optional(),
  plannerStatus: worldPromptPlannerStatusSchema.optional(),
  plannerFailure: worldPromptPlannerFailureSchema.optional(),
  plannerProgress: worldPromptPlannerProgressSchema.optional(),
  workItem: worldPromptIncrementalWorkItemSchema.partial().optional(),
  workItemIndex: z.number().int().nonnegative().optional(),
  workItemTotal: z.number().int().nonnegative().optional(),
  plannerOutline: z.array(z.string()).default([]).optional(),
  classification: worldPromptClassificationSchema.optional(),
  answer: z.string().optional(),
  answerMode: worldPromptAnswerModeSchema.optional(),
  diagnosticFindings: z.array(worldPromptDiagnosticFindingSchema).default([]),
  suggestions: z.array(worldPromptSuggestionSchema).default([]),
  suggestionIds: z.array(z.string()).default([]).optional(),
  scope: worldPromptScopeDecisionSchema.optional(),
  preview: worldPromptPlanPreviewSchema.nullable().optional(),
  queue: z.object({
    type: worldPromptQueueTypeSchema,
    batchId: z.string().nullable().default(null),
    graphKey: z.string().nullable().default(null),
    resultKey: z.string().nullable().default(null),
    targetEntityKey: z.string().nullable().default(null),
    definitionKey: z.string().nullable().default(null),
    batch: looseRecordSchema.nullable().optional(),
    definitions: z.array(looseRecordSchema).default([]),
    graphs: z.array(looseRecordSchema).default([]),
    assets: z.array(looseRecordSchema).default([]),
    cinematicRuns: z.array(looseRecordSchema).default([]),
  }).partial().optional(),
  applied: z.object({
    draft: z.object({
      metadata: looseRecordSchema.default({}),
    }).partial().optional(),
    worldEntities: z.array(worldEntitySchema).default([]),
    worldRelationships: z.array(worldRelationshipSchema).default([]),
    worldOperators: z.array(worldOperatorSchema).default([]),
    worldResults: z.array(worldResultSchema).default([]),
    worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
    worldViews: z.array(worldViewSchema).default([]),
  }).partial().optional(),
  diagnostics: z.array(z.string()).default([]),
  note: z.string().optional(),
}).catchall(z.unknown())

export const worldPromptSnapshotSchema = z.object({
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.enum(['owner', 'editor', 'viewer']),
  }),
  project: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().default(''),
    summary: z.string().default(''),
    visibility: z.enum(['private', 'internal', 'public']).default('private'),
  }),
  draft: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive().default(1),
    isPrimary: z.boolean().default(true),
    updatedAt: z.string().default(''),
    metadata: looseRecordSchema.default({}),
  }),
  definitions: z.array(z.object({
    key: z.string(),
    kind: z.string(),
    name: z.string(),
    summary: z.string().default(''),
  })).default([]),
  graphs: z.array(z.object({
    key: z.string(),
    name: z.string(),
    summary: z.string().default(''),
    graphType: z.string(),
  })).default([]),
  assets: z.array(z.object({
    key: z.string(),
    name: z.string(),
    kind: z.string(),
  })).default([]),
  worldEntities: z.array(worldEntitySchema).default([]),
  worldRelationships: z.array(worldRelationshipSchema).default([]),
  worldViews: z.array(worldViewSchema).default([]),
  worldOperators: z.array(worldOperatorSchema).default([]),
  worldResults: z.array(worldResultSchema).default([]),
  worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
  worldThreads: z.array(worldThreadSchema).default([]),
  gameSpec: looseRecordSchema.nullable().default(null),
  projectContext: projectContextSchema.nullable().default(null),
})

export const worldPromptStartTurnRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).default('gpt-5.4'),
  sessionKey: z.string().nullable().default(null),
  sourceContext: worldPromptSourceContextSchema.optional(),
  initialSeedMode: worldPromptInitialSeedModeSchema.default('standard'),
  initialSeedContext: worldPromptInitialSeedContextSchema.optional(),
  selectedSuggestionId: z.string().nullable().default(null),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  selectedThreadKey: z.string().nullable().default(null),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptStartTurnResponseSchema = z.object({
  ok: z.literal(true),
  session: worldPromptSessionSchema,
  turn: worldPromptTurnSchema,
  messages: z.array(worldPromptMessageSchema).default([]),
  events: z.array(worldPromptEventSchema).default([]),
  suggestions: z.array(worldPromptSuggestionRecordSchema).default([]),
  threads: z.array(worldThreadSchema).default([]),
  definitions: z.array(looseRecordSchema).default([]),
  projectContext: projectContextSchema.nullable().default(null),
  worldEntities: z.array(worldEntitySchema).default([]),
  worldRelationships: z.array(worldRelationshipSchema).default([]),
  worldViews: z.array(worldViewSchema).default([]),
  worldOperators: z.array(worldOperatorSchema).default([]),
  worldResults: z.array(worldResultSchema).default([]),
  worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
})

export const worldPromptSeedInferenceRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).default('gpt-5.4'),
  sessionKey: z.string().nullable().default(null),
  sourceContext: worldPromptSourceContextSchema.optional(),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptSeedInferenceResponseSchema = z.object({
  ok: z.literal(true),
  session: worldPromptSessionSchema,
  turn: worldPromptTurnSchema,
  messages: z.array(worldPromptMessageSchema).default([]),
  events: z.array(worldPromptEventSchema).default([]),
  inference: worldPromptProjectContextInferenceSchema,
  artStyleOptions: z.array(worldPromptArtStyleOptionSchema).default([]),
  skeletonProfile: worldSeedSkeletonProfileSchema,
})

export const worldPromptSeedGenerationRequestSchema = z.object({
  turnId: z.string().min(1),
  model: z.string().min(1).default('gpt-5.4'),
  selectedArtStylePreset: z.string().min(1),
  selectedArtStyleDescription: z.string().default(''),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptSeedGenerationResponseSchema = worldPromptStartTurnResponseSchema.extend({
  inference: worldPromptProjectContextInferenceSchema.optional(),
  skeletonProfile: worldSeedSkeletonProfileSchema.optional(),
  job: worldPromptGenerationJobSchema.optional(),
  steps: z.array(worldPromptGenerationJobStepSchema).default([]),
})

export const worldPromptGenerationStatusRequestSchema = z.object({
  jobId: z.string().min(1),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptGenerationStatusResponseSchema = worldPromptStartTurnResponseSchema.extend({
  job: worldPromptGenerationJobSchema,
  steps: z.array(worldPromptGenerationJobStepSchema).default([]),
  terminal: z.boolean().default(false),
})

export const worldPromptCancelGenerationJobRequestSchema = z.object({
  jobId: z.string().min(1),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptCancelGenerationJobResponseSchema = z.object({
  ok: z.literal(true),
  job: worldPromptGenerationJobSchema,
  steps: z.array(worldPromptGenerationJobStepSchema).default([]),
  turn: worldPromptTurnSchema,
})

export const worldPromptResolveOpRequestSchema = z.object({
  turnId: z.string(),
  opId: z.string(),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptResolveOpResponseSchema = z.object({
  ok: z.literal(true),
  turn: worldPromptTurnSchema,
})

export const worldPromptApplyPreviewRequestSchema = z.object({
  turnId: z.string(),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptApplyPreviewResponseSchema = z.object({
  ok: z.literal(true),
  turn: worldPromptTurnSchema,
})

export const worldPromptCancelTurnRequestSchema = z.object({
  turnId: z.string(),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptCancelTurnResponseSchema = z.object({
  ok: z.literal(true),
  turn: worldPromptTurnSchema,
})

export const worldPromptCreateSessionRequestSchema = z.object({
  sessionKey: z.string().nullable().default(null),
  title: z.string().min(1).default('New chat'),
  model: z.string().min(1).default('gpt-5.4'),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  selectedThreadKey: z.string().nullable().default(null),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptCreateSessionResponseSchema = z.object({
  ok: z.literal(true),
  session: worldPromptSessionSchema,
})

export const worldPromptDismissSuggestionRequestSchema = z.object({
  suggestionId: z.string().min(1),
})

export const worldPromptDismissSuggestionResponseSchema = z.object({
  ok: z.literal(true),
  suggestion: worldPromptSuggestionRecordSchema,
})

export const worldPromptRefreshSuggestionsRequestSchema = z.object({
  sessionId: z.string().min(1).nullable().default(null),
  sessionKey: z.string().min(1).nullable().default(null),
  selectedRootEntityKey: z.string().nullable().default(null),
  selectedViewKey: z.string().nullable().default(null),
  selectedThreadKey: z.string().nullable().default(null),
  reason: z.string().min(1).default('manual_world_edit'),
  snapshot: worldPromptSnapshotSchema,
})

export const worldPromptRefreshSuggestionsResponseSchema = z.object({
  ok: z.literal(true),
  session: worldPromptSessionSchema,
  suggestions: z.array(worldPromptSuggestionRecordSchema).default([]),
})

export const worldPromptStateSchema = z.object({
  worldPromptSessions: z.array(worldPromptSessionSchema).default([]),
  worldPromptTurns: z.array(worldPromptTurnSchema).default([]),
  worldPromptMessages: z.array(worldPromptMessageSchema).default([]),
  worldPromptEvents: z.array(worldPromptEventSchema).default([]),
  worldPromptSuggestions: z.array(worldPromptSuggestionRecordSchema).default([]),
  worldThreads: z.array(worldThreadSchema).default([]),
})

export type PromptToWorldOp = z.infer<typeof promptToWorldOpSchema>
export type WorldPromptSuggestion = z.infer<typeof worldPromptSuggestionSchema>
export type WorldPromptSuggestionRecord = z.infer<typeof worldPromptSuggestionRecordSchema>
export type WorldPromptPlannerFailure = z.infer<typeof worldPromptPlannerFailureSchema>
export type WorldPromptDiagnosticFinding = z.infer<typeof worldPromptDiagnosticFindingSchema>
export type WorldPromptScopeDecision = z.infer<typeof worldPromptScopeDecisionSchema>
export type WorldPromptClassification = z.infer<typeof worldPromptClassificationSchema>
export type WorldPromptPlanPreviewItem = z.infer<typeof worldPromptPreviewItemSchema>
export type WorldPromptPlanPreview = z.infer<typeof worldPromptPlanPreviewSchema>
export type WorldPromptSession = z.infer<typeof worldPromptSessionSchema>
export type WorldPromptTurn = z.infer<typeof worldPromptTurnSchema>
export type WorldPromptMessage = z.infer<typeof worldPromptMessageSchema>
export type WorldPromptEvent = z.infer<typeof worldPromptEventSchema>
export type WorldPromptGenerationJob = z.infer<typeof worldPromptGenerationJobSchema>
export type WorldPromptGenerationJobStep = z.infer<typeof worldPromptGenerationJobStepSchema>
export type WorldPromptEventPayload = z.infer<typeof worldPromptEventPayloadSchema>
export type WorldPromptPlannerProgress = z.infer<typeof worldPromptPlannerProgressSchema>
export type WorldPromptIncrementalWorkItem = z.infer<typeof worldPromptIncrementalWorkItemSchema>
export type WorldPromptIncrementalManifest = z.infer<typeof worldPromptIncrementalManifestSchema>
export type WorldPromptIncrementalBuildBrief = z.infer<typeof worldPromptIncrementalBuildBriefSchema>
export type WorldPromptBuildLedgerEntry = z.infer<typeof worldPromptBuildLedgerEntrySchema>
export type WorldPromptWorkItemContext = z.infer<typeof worldPromptWorkItemContextSchema>
export type WorldPromptStreamGraphOpEnvelope = z.infer<typeof worldPromptStreamGraphOpEnvelopeSchema>
export type StreamWikiRecord = z.infer<typeof streamWikiRecordSchema>
export type StreamEntityRecord = z.infer<typeof streamEntityRecordSchema>
export type StreamSequenceUnitRecord = z.infer<typeof streamSequenceUnitRecordSchema>
export type StreamRelationshipRecord = z.infer<typeof streamRelationshipRecordSchema>
export type StreamRepairSkipRecord = z.infer<typeof streamRepairSkipRecordSchema>
export type WorldPromptWorkItemResult = z.infer<typeof worldPromptWorkItemResultSchema>
export type WorldPromptTokenBudgetDiagnostics = z.infer<typeof worldPromptTokenBudgetDiagnosticsSchema>
export type WorldPromptSessionMemoryState = z.infer<typeof worldPromptSessionMemoryStateSchema>
export type WorldPromptRetrievalDiagnostics = z.infer<typeof worldPromptRetrievalDiagnosticsSchema>
export type WorldPromptAtlasIndex = z.infer<typeof worldPromptAtlasIndexSchema>
export type WorldPromptContextHit = z.infer<typeof worldPromptContextHitSchema>
export type WorldPromptContextHitReason = z.infer<typeof worldPromptContextHitReasonSchema>
export type WorldPromptContextBudget = z.infer<typeof worldPromptContextBudgetSchema>
export type WorldPromptResolvedContext = z.infer<typeof worldPromptResolvedContextSchema>
export type WorldPromptSnapshot = z.infer<typeof worldPromptSnapshotSchema>
export type WorldPromptStartTurnRequest = z.infer<typeof worldPromptStartTurnRequestSchema>
export type WorldPromptStartTurnResponse = z.infer<typeof worldPromptStartTurnResponseSchema>
export type WorldPromptSourceContext = z.infer<typeof worldPromptSourceContextSchema>
export type WorldPromptProjectContextInference = z.infer<typeof worldPromptProjectContextInferenceSchema>
export type WorldPromptInitialSeedMode = z.infer<typeof worldPromptInitialSeedModeSchema>
export type WorldPromptInitialSeedContext = z.infer<typeof worldPromptInitialSeedContextSchema>
export type WorldPromptArtStyleOption = z.infer<typeof worldPromptArtStyleOptionSchema>
export type WorldPromptSeedInferenceRequest = z.infer<typeof worldPromptSeedInferenceRequestSchema>
export type WorldPromptSeedInferenceResponse = z.infer<typeof worldPromptSeedInferenceResponseSchema>
export type WorldPromptSeedGenerationRequest = z.infer<typeof worldPromptSeedGenerationRequestSchema>
export type WorldPromptSeedGenerationResponse = z.infer<typeof worldPromptSeedGenerationResponseSchema>
export type WorldPromptGenerationStatusRequest = z.infer<typeof worldPromptGenerationStatusRequestSchema>
export type WorldPromptGenerationStatusResponse = z.infer<typeof worldPromptGenerationStatusResponseSchema>
export type WorldPromptCancelGenerationJobRequest = z.infer<typeof worldPromptCancelGenerationJobRequestSchema>
export type WorldPromptCancelGenerationJobResponse = z.infer<typeof worldPromptCancelGenerationJobResponseSchema>
export type WorldPromptResolveOpRequest = z.infer<typeof worldPromptResolveOpRequestSchema>
export type WorldPromptResolveOpResponse = z.infer<typeof worldPromptResolveOpResponseSchema>
export type WorldPromptApplyPreviewRequest = z.infer<typeof worldPromptApplyPreviewRequestSchema>
export type WorldPromptApplyPreviewResponse = z.infer<typeof worldPromptApplyPreviewResponseSchema>
export type WorldPromptCancelTurnRequest = z.infer<typeof worldPromptCancelTurnRequestSchema>
export type WorldPromptCancelTurnResponse = z.infer<typeof worldPromptCancelTurnResponseSchema>
export type WorldPromptCreateSessionRequest = z.infer<typeof worldPromptCreateSessionRequestSchema>
export type WorldPromptCreateSessionResponse = z.infer<typeof worldPromptCreateSessionResponseSchema>
export type WorldPromptDismissSuggestionRequest = z.infer<typeof worldPromptDismissSuggestionRequestSchema>
export type WorldPromptDismissSuggestionResponse = z.infer<typeof worldPromptDismissSuggestionResponseSchema>
export type WorldPromptRefreshSuggestionsRequest = z.infer<typeof worldPromptRefreshSuggestionsRequestSchema>
export type WorldPromptRefreshSuggestionsResponse = z.infer<typeof worldPromptRefreshSuggestionsResponseSchema>

export function isInitialSeedGenerationTurn(turn: Pick<WorldPromptTurn, 'metadata'>): boolean {
  if (turn.metadata?.initialSeedMode === 'generate_skeleton') return true
  const parsed = worldPromptInitialSeedContextSchema.safeParse(turn.metadata?.initialSeedContext)
  return parsed.success && parsed.data.mode === 'generate_skeleton'
}

export function isPendingInitialSeedGenerationTurn(turn: Pick<WorldPromptTurn, 'metadata' | 'status'>): boolean {
  return isInitialSeedGenerationTurn(turn) && turn.status !== 'completed' && turn.status !== 'cancelled'
}
