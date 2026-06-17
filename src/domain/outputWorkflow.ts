import { z } from 'zod'

import { aiGenerationSettings } from '../config/aiGenerationSettings.ts'
import { aiUsageSummarySchema, estimateOutputWorkflowUsage } from './aiUsage.ts'
import {
  buildOutputGuidanceBundle,
  outputGuidanceModeSchema,
  resolveOutputSkillsForNode,
} from './outputSkills.ts'
import {
  getOutputWorkflowNodeContract,
  getWorkflowNodeManifest,
  validateWorkflowNodeManifestConfig,
} from './outputWorkflowNodeContracts.ts'
import {
  buildWorkflowTemplateGraph as buildWorkflowTemplateGraphInternal,
  normalizeWorkflowTemplateGraphRows as normalizeWorkflowTemplateGraphRowsInternal,
  type AnyWorkflowTemplateRegistryEntry as AnyWorkflowTemplateRegistryEntryInternal,
  type WorkflowTemplateGraphRows as WorkflowTemplateGraphRowsInternal,
} from './outputWorkflowTemplateRegistry.ts'
export {
  buildWorkflowProjectionMetadata,
  assertWorkflowNodeManifestDefinition,
  childWorkflowUtilityInputSchema,
  childWorkflowUtilityOutputSchema,
  createWorkflowNodeExtensionScaffold,
  createWorkflowNodeManifest,
  createWorkflowNodeManifestRegistry,
  getWorkflowNodeManifest as getRegisteredWorkflowNodeManifest,
  registerWorkflowNodeManifest,
  validateWorkflowNodeManifestOutput,
  validateWorkflowNodeManifestDefinition,
  validateWorkflowTemplateGraph,
  workflowNodeStreamingPolicySchema,
  workflowProjectionMetadataSchema,
  type ChildWorkflowUtilityInput,
  type ChildWorkflowUtilityOutput,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeExtensionScaffoldInput,
  type WorkflowNodeManifest,
  type WorkflowNodeStreamingPolicy,
  type WorkflowProjectionMetadata,
  type WorkflowTemplateManifest,
} from './outputWorkflowManifests.ts'
export {
  assertWorkflowTemplateManifestDefinition,
  buildWorkflowTemplateGraph,
  createWorkflowTemplateExtensionScaffold,
  createWorkflowTemplateRegistry,
  getWorkflowTemplateManifest,
  normalizeWorkflowTemplateGraphRows,
  registerWorkflowTemplateManifest,
  validateWorkflowTemplateExtensionScaffoldGraph,
  validateWorkflowTemplateManifestDefinition,
  workflowTemplateSourceHash,
  type AnyWorkflowTemplateRegistryEntry,
  type WorkflowTemplateExtensionScaffold,
  type WorkflowTemplateExtensionScaffoldGraphValidationOptions,
  type WorkflowTemplateExtensionScaffoldInput,
  type WorkflowTemplateGraphRows,
  type WorkflowTemplateRegistryEntry,
} from './outputWorkflowTemplateRegistry.ts'
export {
  assertWorkflowNodeHandlerCoverage,
  createWorkflowNodeHandlerRegistry,
  getWorkflowNodeHandler,
  registerWorkflowNodeHandler,
  type WorkflowNodeHandler,
  type WorkflowNodeHandlerRegistry,
} from './workflowNodeHandlerRegistry.ts'
export {
  assertWorkflowCommandTemplateCoverage,
  getWorkflowCommandManifest,
  legacyPayloadForWorkflowCommand,
  listWorkflowCommandManifests,
  parseWorkflowCommand,
  sceneBoardLegacyActionForWorkflowCommand,
  validateWorkflowCommandTemplateCoverage,
  workflowCommandActionSchema,
  workflowCommandFamilySchema,
  workflowCommandFlagsSchema,
  workflowCommandProxyResponseSchema,
  workflowCommandSchema,
  workflowCommandScopeSchema,
  type WorkflowCommand,
  type WorkflowCommandAction,
  type WorkflowCommandFamily,
  type WorkflowCommandInput,
  type WorkflowCommandManifest,
  type WorkflowCommandProxyResponse,
  type WorkflowCommandTemplateCoverageInput,
} from './workflowCommandRegistry.ts'
export {
  getWorkflowNodeManifest,
  outputWorkflowNodeManifests,
  outputWorkflowNodeManifestsByPurpose,
} from './outputWorkflowNodeContracts.ts'
import {
  classifyPromptIntentScored,
  promptIntentCatalogVersion,
  promptIntentClassificationResultSchema,
  type PromptIntentClassificationResult,
} from './promptIntentClassifier.ts'
import { projectContextSchema } from './projectContext.ts'
import { deriveCinematicV2MaxShotCount } from './cinematics.ts'
import {
  worldEntitySchema,
  worldRelationshipSchema,
  worldWikiPresentationMetadataSchema,
} from './worldGraph.ts'
import { worldThreadSchema } from './worldThread.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())
const looseObjectSchema = z.object({}).catchall(z.unknown())
const optionalTrimmedNonEmptyStringSchema = z.string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => value && value.length > 0 ? value : undefined)

export const outputWorkflowStatusSchema = z.enum(['draft', 'active', 'archived'])
export const outputWorkflowNodeTypeSchema = z.enum([
  'world_context_query',
  'skill_context_query',
  'text_llm',
  'image_generation',
  'video_generation',
  'document_render',
  'utility_transform',
  'output_artifact',
])
export const outputWorkflowRunStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'])
export const outputImageGenerationQualitySchema = z.enum(['low', 'medium', 'high'])
export const outputImageGenerationOutputFormatSchema = z.enum(['png', 'jpeg', 'webp'])
export const cinematicPipelineVersionSchema = z.enum(['v1_take_blocks', 'v2_shot_orchestration', 'v3_script_storyboards'])
export const cinematicV2AnimaticModeSchema = z.enum(['fast_panels', 'quality_keyframes'])
export const sequenceAnimaticModeSchema = z.preprocess(
  (value) => {
    if (value == null || value === '') return undefined
    return value === 'full_sequence_unit' ? 'master_script_only' : value
  },
  z.enum(['master_script_only']).optional(),
)
export const cinematicAnimaticModeSchema = z.preprocess(
  (value) => value == null || value === '' ? undefined : value,
  z.enum(['prompt_cinematic_master']).optional(),
)

const sequenceAnimaticMasterMaxShotCount = 150
export const sequenceAnimaticGraphSpecVersionSchema = z.enum(['sequence_animatic_graph_v1', 'sequence_animatic_graph_v2'])
export const sequenceAnimaticGraphRoleSchema = z.enum(['master', 'director_plan', 'continuity_pack', 'continuity_asset', 'continuity_asset_batch', 'storyboard_block', 'scene_board_prep', 'coverage_anchor', 'coverage_intent_batch', 'shot_keyframe', 'shot_video', 'shot_production', 'shot_revision'])
export const outputWorkflowArtifactKindSchema = z.enum(['manuscript', 'html', 'pdf', 'epub', 'docx', 'comic_pdf', 'video', 'image', 'package', 'other'])
export const outputRequestStatusSchema = z.enum(['queued', 'planning', 'awaiting_confirmation', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const outputRequestIntentSchema = z.enum(['world_mutation', 'output_generation', 'answer_only', 'ambiguous'])
export const outputRequestKindSchema = z.enum([
  'concept_art_image',
  'poster_image',
  'story_bible_from_world',
  'world_reference_document',
  'lore_guide',
  'character_dossier_pack',
  'short_story',
  'narrative_chapter_or_ebook',
  'ebook_from_world',
  'comic_issue_from_sequence',
  'cinematic_episode',
  'cinematic_trailer',
  'ugc_episode',
  'unknown',
])
export const outputWorkflowPresetSchema = z.enum([
  'ebook_from_world',
  'story_bible_from_world',
  'comic_issue_from_sequence',
  'cinematic_episode_from_sequence',
  'cinematic_trailer',
  'ugc_episode',
  'composite_reference',
])
export const outputWorkflowPortValueTypeSchema = z.enum(['world_context', 'guidance_bundle', 'text', 'structured_json', 'image', 'video', 'document', 'artifact', 'asset_pack'])
export const outputWorkflowResourceClassSchema = z.enum(['llm', 'image', 'video', 'document', 'utility'])
export const outputWorkflowRunScopeSchema = z.enum(['node_only', 'upstream_to_node', 'node_and_downstream', 'artifact_rebake'])
export type OutputWorkflowRunScope = z.infer<typeof outputWorkflowRunScopeSchema>
export const outputWorkflowRunIntentSchema = z.enum([
  'generate_director_plan',
  'prepare_storyboard_block',
  'prepare_scene_board',
  'regenerate_scene_board_zone',
  'generate_continuity_pack',
  'derive_continuity_structure',
  'derive_continuity_block',
  'generate_continuity_asset',
  'generate_keyframes',
  'generate_block_video',
  'generate_shot_video',
  'revise_sequence_animatic_shot',
  'repair_upstream_cache',
  'rerun_node_and_dependents',
])
export type OutputWorkflowRunIntent = z.infer<typeof outputWorkflowRunIntentSchema>

export const outputWorkflowPortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  direction: z.enum(['input', 'output']),
  valueType: outputWorkflowPortValueTypeSchema,
  multiple: z.boolean().default(false),
  required: z.boolean().default(false),
})

export const outputWorkflowNodeDefinitionSchema = z.object({
  type: outputWorkflowNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().default(''),
  inputPorts: z.array(outputWorkflowPortSchema).default([]),
  outputPorts: z.array(outputWorkflowPortSchema).default([]),
  providerBacked: z.boolean().default(false),
})

export const outputWorkflowNodeRegistry = {
  world_context_query: {
    type: 'world_context_query',
    label: 'World Context',
    description: 'Resolve selected world entities, sequence units, relationships, threads, wiki metadata, and visual references.',
    inputPorts: [],
    outputPorts: [{ id: 'context', label: 'Context', direction: 'output', valueType: 'world_context', multiple: false, required: true }],
    providerBacked: false,
  },
  skill_context_query: {
    type: 'skill_context_query',
    label: 'Output Skills',
    description: 'Resolve reusable guidance skills into a compact guidance bundle for downstream nodes.',
    inputPorts: [],
    outputPorts: [{ id: 'guidance', label: 'Guidance', direction: 'output', valueType: 'guidance_bundle', multiple: false, required: true }],
    providerBacked: false,
  },
  text_llm: {
    type: 'text_llm',
    label: 'Text LLM',
    description: 'Generate structured text from a prompt and world context.',
    inputPorts: [
      { id: 'context', label: 'Context', direction: 'input', valueType: 'world_context', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
      { id: 'asset_pack', label: 'Asset Pack', direction: 'input', valueType: 'asset_pack', multiple: false, required: false },
    ],
    outputPorts: [
      { id: 'text', label: 'Text', direction: 'output', valueType: 'text', multiple: false, required: true },
      { id: 'asset_pack', label: 'Asset Pack', direction: 'output', valueType: 'asset_pack', multiple: false, required: false },
    ],
    providerBacked: true,
  },
  image_generation: {
    type: 'image_generation',
    label: 'Image Generation',
    description: 'Generate an image from prompts and optional reference images.',
    inputPorts: [
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'references', label: 'References', direction: 'input', valueType: 'image', multiple: true, required: false },
    ],
    outputPorts: [{ id: 'image', label: 'Image', direction: 'output', valueType: 'image', multiple: false, required: true }],
    providerBacked: true,
  },
  video_generation: {
    type: 'video_generation',
    label: 'Video Generation',
    description: 'Generate video clips from a prompt and image/video references.',
    inputPorts: [
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'references', label: 'References', direction: 'input', valueType: 'image', multiple: true, required: false },
    ],
    outputPorts: [{ id: 'video', label: 'Video', direction: 'output', valueType: 'video', multiple: false, required: true }],
    providerBacked: true,
  },
  document_render: {
    type: 'document_render',
    label: 'Document Render',
    description: 'Render Markdown or HTML into a document artifact.',
    inputPorts: [
      { id: 'source', label: 'Source', direction: 'input', valueType: 'text', multiple: false, required: false },
      { id: 'cover', label: 'Cover', direction: 'input', valueType: 'image', multiple: false, required: false },
      { id: 'pages', label: 'Pages', direction: 'input', valueType: 'image', multiple: true, required: false },
    ],
    outputPorts: [{ id: 'document', label: 'Document', direction: 'output', valueType: 'document', multiple: false, required: true }],
    providerBacked: false,
  },
  utility_transform: {
    type: 'utility_transform',
    label: 'Utility Transform',
    description: 'Transform or split intermediate data such as sequence beats, shots, panels, or prompt packs.',
    inputPorts: [{ id: 'input', label: 'Input', direction: 'input', valueType: 'structured_json', multiple: false, required: true }],
    outputPorts: [{ id: 'output', label: 'Output', direction: 'output', valueType: 'structured_json', multiple: false, required: true }],
    providerBacked: false,
  },
  output_artifact: {
    type: 'output_artifact',
    label: 'Output Artifact',
    description: 'Register final generated files as output artifacts.',
    inputPorts: [{ id: 'input', label: 'Input', direction: 'input', valueType: 'document', multiple: false, required: true }],
    outputPorts: [{ id: 'artifact', label: 'Artifact', direction: 'output', valueType: 'artifact', multiple: false, required: true }],
    providerBacked: false,
  },
} as const satisfies Record<z.infer<typeof outputWorkflowNodeTypeSchema>, z.infer<typeof outputWorkflowNodeDefinitionSchema>>

export const outputWorkflowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().default(''),
  preset: outputWorkflowPresetSchema,
  status: outputWorkflowStatusSchema.default('active'),
  createdBy: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowNodeSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  key: z.string(),
  nodeType: outputWorkflowNodeTypeSchema,
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  config: looseRecordSchema.default({}),
  inputs: looseRecordSchema.default({}),
  outputs: looseRecordSchema.default({}),
  dirty: z.boolean().default(true),
  inputHash: z.string().default(''),
  outputHash: z.string().default(''),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowExecutionMetadataSchema = z.object({
  resourceClass: outputWorkflowResourceClassSchema.optional(),
  groupKey: z.string().min(1).optional(),
  maxConcurrency: z.number().int().positive().optional(),
  continueOnError: z.boolean().optional(),
}).default({})

export const outputWorkflowNodeGuidanceConfigSchema = z.object({
  skillKeys: z.array(z.string().min(1)).default([]),
  autoSkillTags: z.array(z.string().min(1)).default([]),
  presetSkillKeys: z.array(z.string().min(1)).default([]),
  guidanceMode: outputGuidanceModeSchema.default('append'),
}).default({ skillKeys: [], autoSkillTags: [], presetSkillKeys: [], guidanceMode: 'append' })

export const outputWorkflowEdgeSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  key: z.string(),
  sourceNodeKey: z.string(),
  sourcePort: z.string(),
  targetNodeKey: z.string(),
  targetPort: z.string(),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowRunStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workflowId: z.string(),
  nodeId: z.string().nullable().default(null),
  nodeKey: z.string(),
  nodeType: outputWorkflowNodeTypeSchema,
  status: outputWorkflowRunStatusSchema,
  orderIndex: z.number().int().nonnegative().default(0),
  label: z.string(),
  inputHash: z.string().default(''),
  outputHash: z.string().default(''),
  outputs: looseRecordSchema.default({}),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputArtifactSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string().nullable().default(null),
  runId: z.string().nullable().default(null),
  nodeId: z.string().nullable().default(null),
  key: z.string(),
  name: z.string(),
  kind: outputWorkflowArtifactKindSchema,
  assetKey: z.string().nullable().default(null),
  mimeType: z.string().default(''),
  summary: z.string().default(''),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputRequestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  parentRequestId: z.string().nullable().default(null),
  workflowId: z.string().nullable().default(null),
  latestRunId: z.string().nullable().default(null),
  requestedBy: z.string().nullable().default(null),
  sourceSurface: z.string().default('outputs'),
  prompt: z.string().default(''),
  title: z.string().default('Untitled output'),
  intent: outputRequestIntentSchema.default('output_generation'),
  outputKind: outputRequestKindSchema.default('unknown'),
  status: outputRequestStatusSchema.default('queued'),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  pageCount: z.number().int().positive().nullable().default(null),
  targetFormat: z.string().default('pdf'),
  plannerNotes: z.string().default(''),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string(),
  requestedBy: z.string().nullable().default(null),
  status: outputWorkflowRunStatusSchema,
  preset: outputWorkflowPresetSchema,
  prompt: z.string().default(''),
  targetFormat: z.string().default('pdf'),
  worldSnapshotFingerprint: z.string().default(''),
  input: looseRecordSchema.default({}),
  outputs: looseRecordSchema.default({}),
  errorMessage: z.string().nullable().default(null),
  workerId: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
  steps: z.array(outputWorkflowRunStepSchema).default([]),
  artifacts: z.array(outputArtifactSchema).default([]),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowBundleSchema = z.object({
  workflow: outputWorkflowSchema,
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const outputWorkflowPlanRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  prompt: z.string().default(''),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video']).default('pdf'),
  documentMode: z.enum(['ebook', 'reference', 'designed_reference']).optional(),
  pageSize: z.enum(['trade_6x9', 'letter', 'a4']).optional(),
  imagePolicy: z.enum(['none', 'inline_entity_images', 'section_hero_images', 'generated_spot_art']).optional(),
  imageQuality: outputImageGenerationQualitySchema.optional(),
  imageOutputFormat: outputImageGenerationOutputFormatSchema.optional(),
  preset: outputWorkflowPresetSchema.optional(),
  pageCount: z.number().int().min(1).max(12).default(8),
  videoBlockCount: z.number().int().min(1).max(6).optional(),
  durationPerBlockSeconds: z.number().int().min(4).max(15).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  videoResolution: z.enum(['480p', '720p', '1080p']).optional(),
  generateAudio: z.boolean().optional(),
  cinematicPresetFamily: z.enum(['story_movie_tv', 'ugc_creator', 'ugc_direct_response_ad', 'ugc_faceless_format']).optional(),
  cinematicReferenceMode: z.enum(['keyframes', 'storyboard_sheet', 'keyframes_and_storyboard', 'shot_reference_sheet']).optional(),
  cinematicPipelineVersion: cinematicPipelineVersionSchema.optional(),
  cinematicV2AnimaticMode: cinematicV2AnimaticModeSchema.optional(),
  sequenceAnimaticMode: sequenceAnimaticModeSchema.optional(),
  cinematicAnimaticMode: cinematicAnimaticModeSchema.optional(),
  debugCinematicStoryboardStyleSafeMode: z.boolean().optional(),
  cinematicStoryboardStyleOverride: optionalTrimmedNonEmptyStringSchema,
  debugSkipVideoGeneration: z.boolean().optional(),
  snapshot: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
      metadata: looseRecordSchema.default({}),
    }),
    projectContext: projectContextSchema.nullable().default(null),
    worldEntities: z.array(worldEntitySchema).default([]),
    worldRelationships: z.array(worldRelationshipSchema).default([]),
    worldThreads: z.array(worldThreadSchema).default([]),
    worldWiki: worldWikiPresentationMetadataSchema.default({}),
  }),
})

export const outputRequestStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  prompt: z.string().trim().min(1).max(12000),
  sourceSurface: z.string().trim().min(1).max(64).default('outputs'),
  outputKindOverride: outputRequestKindSchema.optional(),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video']).default('pdf'),
  imageQuality: outputImageGenerationQualitySchema.optional(),
  imageOutputFormat: outputImageGenerationOutputFormatSchema.optional(),
  pageCount: z.number().int().min(1).max(12).optional(),
  videoBlockCount: z.number().int().min(1).max(6).optional(),
  durationPerBlockSeconds: z.number().int().min(4).max(15).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  videoResolution: z.enum(['480p', '720p', '1080p']).optional(),
  generateAudio: z.boolean().optional(),
  cinematicPresetFamily: z.enum(['story_movie_tv', 'ugc_creator', 'ugc_direct_response_ad', 'ugc_faceless_format']).optional(),
  cinematicReferenceMode: z.enum(['keyframes', 'storyboard_sheet', 'keyframes_and_storyboard', 'shot_reference_sheet']).optional(),
  cinematicPipelineVersion: cinematicPipelineVersionSchema.optional(),
  cinematicV2AnimaticMode: cinematicV2AnimaticModeSchema.optional(),
  sequenceAnimaticMode: sequenceAnimaticModeSchema.optional(),
  cinematicAnimaticMode: cinematicAnimaticModeSchema.optional(),
  debugCinematicStoryboardStyleSafeMode: z.boolean().optional(),
  cinematicStoryboardStyleOverride: optionalTrimmedNonEmptyStringSchema,
  debugSkipVideoGeneration: z.boolean().optional(),
  snapshot: outputWorkflowPlanRequestSchema.shape.snapshot,
  runInput: looseRecordSchema.default({}),
})

export const promptIntentClassificationRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  prompt: z.string().trim().min(1).max(12000),
  sourceSurface: z.string().trim().min(1).max(64).default('world_prompt'),
  selectedSuggestionId: z.string().nullable().optional(),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  snapshot: outputWorkflowPlanRequestSchema.shape.snapshot,
})

export const promptIntentClassificationResponseSchema = z.object({
  ok: z.literal(true),
  classification: promptIntentClassificationResultSchema,
})

export const outputPromptPlannerResultSchema = z.object({
  intent: outputRequestIntentSchema,
  outputKind: outputRequestKindSchema,
  confidence: z.number().min(0).max(1),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video']).default('pdf'),
  worldScope: z.enum(['full_world', 'selected_entities', 'selected_sequence_units', 'prompt_bound_scope']).default('prompt_bound_scope'),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  documentMode: z.enum(['narrative', 'reference', 'designed_reference', 'visual', 'comic', 'cinematic']).default('narrative'),
  sections: z.array(z.object({
    key: z.string(),
    title: z.string(),
    description: z.string().default(''),
  })).default([]),
  visualReferencePolicy: z.enum(['none', 'use_prompt_bound_entity_refs', 'use_selected_entity_refs', 'use_world_style_only']).default('none'),
  requiresConfirmation: z.boolean().default(false),
  plannerNotes: z.string().default(''),
  classifierMode: z.string().default('scored'),
  classifierCatalogVersion: z.string().default(promptIntentCatalogVersion),
  classifierRationale: z.string().default(''),
  classifierCandidates: z.array(z.object({
    id: z.string(),
    intent: outputRequestIntentSchema,
    outputKind: outputRequestKindSchema,
    targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video']).default('pdf'),
    score: z.number().min(0).max(1),
    rationale: z.string().default(''),
  })).default([]),
})

export const outputRequestStatusRequestSchema = z.object({
  requestId: z.string().min(1),
})

export const outputWorkflowPlanResponseSchema = z.object({
  ok: z.literal(true),
  plan: z.object({
    preset: outputWorkflowPresetSchema,
    name: z.string(),
    description: z.string().default(''),
    prompt: z.string().default(''),
    targetFormat: z.string().default('pdf'),
    sourceEntityKeys: z.array(z.string()).default([]),
    sourceSequenceUnitKeys: z.array(z.string()).default([]),
    nodes: z.array(outputWorkflowNodeSchema.omit({
      id: true,
      workflowId: true,
      createdAt: true,
      updatedAt: true,
    })).default([]),
    edges: z.array(outputWorkflowEdgeSchema.omit({
      id: true,
      workflowId: true,
      createdAt: true,
      updatedAt: true,
    })).default([]),
    usageEstimate: aiUsageSummarySchema.optional(),
    diagnostics: z.array(z.string()).default([]),
  }),
})

export const outputWorkflowStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  plan: outputWorkflowPlanResponseSchema.shape.plan,
})

export const outputWorkflowStartResponseSchema = z.object({
  ok: z.literal(true),
  workflow: outputWorkflowSchema,
  nodes: z.array(outputWorkflowNodeSchema),
  edges: z.array(outputWorkflowEdgeSchema),
})

export const outputRequestStatusResponseSchema = z.object({
  ok: z.literal(true),
  request: outputRequestSchema,
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  run: outputWorkflowRunSchema.nullable().default(null),
  artifacts: z.array(outputArtifactSchema).default([]),
  terminal: z.boolean().default(false),
})

export const outputRequestStatusProjectionSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string().nullable().default(null),
  latestRunId: z.string().nullable().default(null),
  status: outputRequestStatusSchema.or(outputWorkflowRunStatusSchema),
  outputKind: outputRequestKindSchema.default('unknown'),
  title: z.string().default('Untitled output'),
  progress: looseRecordSchema.default({}),
  activeNodeKey: z.string().nullable().default(null),
  activeNodeLabel: z.string().nullable().default(null),
  latestError: z.string().nullable().default(null),
  artifactKeys: z.array(z.string()).default([]),
  previewAssetKeys: z.array(z.string()).default([]),
  graphRevision: z.string().default(''),
  timelineRevision: z.string().default(''),
  terminal: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputFeedRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  limit: z.number().int().positive().max(100).default(30),
  cursor: z.string().nullable().optional(),
  knownFeedRevision: z.string().nullable().optional(),
  knownAssetKeys: z.array(z.string()).default([]),
})

export const outputFeedResponseSchema = z.object({
  ok: z.literal(true),
  unchanged: z.boolean().default(false),
  feedRevision: z.string().default(''),
  requests: z.array(outputRequestSchema).default([]),
  workflows: z.array(outputWorkflowSchema).default([]),
  runs: z.array(outputWorkflowRunSchema).default([]),
  artifacts: z.array(outputArtifactSchema).default([]),
  assets: z.array(looseRecordSchema).default([]),
  projections: z.array(outputRequestStatusProjectionSchema).default([]),
  page: z.object({
    limit: z.number().int().positive(),
    hasMore: z.boolean().default(false),
    nextCursor: z.string().nullable().default(null),
  }),
})

export const outputRequestDeleteResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string().nullable().default(null),
  latestRunId: z.string().nullable().default(null),
  deleted: z.boolean().default(true),
  deletedCounts: z.object({
    outputRequests: z.number().int().nonnegative().default(0),
    outputWorkflows: z.number().int().nonnegative().default(0),
    outputWorkflowRuns: z.number().int().nonnegative().default(0),
    outputWorkflowRunSteps: z.number().int().nonnegative().default(0),
    outputWorkflowNodes: z.number().int().nonnegative().default(0),
    outputWorkflowEdges: z.number().int().nonnegative().default(0),
    outputArtifacts: z.number().int().nonnegative().default(0),
    projectAssets: z.number().int().nonnegative().default(0),
    storageObjects: z.number().int().nonnegative().default(0),
  }).default({
    outputRequests: 0,
    outputWorkflows: 0,
    outputWorkflowRuns: 0,
    outputWorkflowRunSteps: 0,
    outputWorkflowNodes: 0,
    outputWorkflowEdges: 0,
    outputArtifacts: 0,
    projectAssets: 0,
    storageObjects: 0,
  }),
})

const outputCleanupCountsSchema = z.object({
  outputRequests: z.number().int().nonnegative().default(0),
  outputWorkflows: z.number().int().nonnegative().default(0),
  outputWorkflowRuns: z.number().int().nonnegative().default(0),
  outputWorkflowRunSteps: z.number().int().nonnegative().default(0),
  outputWorkflowNodes: z.number().int().nonnegative().default(0),
  outputWorkflowEdges: z.number().int().nonnegative().default(0),
  outputArtifacts: z.number().int().nonnegative().default(0),
  projectAssets: z.number().int().nonnegative().default(0),
  storageObjects: z.number().int().nonnegative().default(0),
})

export const outputWorkflowRepairRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  mode: z.enum(['preview', 'apply']).default('preview'),
  requestId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  cancelStaleRuns: z.boolean().default(false),
  staleRunAgeMinutes: z.number().int().positive().max(10080).default(30),
}).refine((value) => value.requestId || value.workflowId, {
  message: 'Provide requestId or workflowId to repair output workflow state.',
})

export const outputWorkflowRepairResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(['preview', 'apply']),
  applied: z.boolean().default(false),
  projectId: z.string(),
  draftId: z.string(),
  requestId: z.string().nullable().default(null),
  workflowId: z.string().nullable().default(null),
  findings: z.object({
    stuckCleanupRequestIds: z.array(z.string()).default([]),
    staleRunIds: z.array(z.string()).default([]),
    orphanWorkflowIds: z.array(z.string()).default([]),
    activeRunIds: z.array(z.string()).default([]),
    cleanupCounts: outputCleanupCountsSchema,
    diagnostics: z.array(z.string()).default([]),
  }),
  deletedCounts: outputCleanupCountsSchema.nullable().default(null),
  cancelledRunIds: z.array(z.string()).default([]),
})

export const outputWorkflowRunStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  prompt: z.string().default(''),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video']).default('pdf'),
  input: looseRecordSchema.default({}),
  metadata: z.object({
    runScope: outputWorkflowRunScopeSchema.optional(),
    runIntent: outputWorkflowRunIntentSchema.optional(),
  }).catchall(z.unknown()).default({}),
})

export const outputWorkflowRunStatusRequestSchema = z.object({
  runId: z.string().min(1),
})

export const outputWorkflowRunStatusResponseSchema = z.object({
  ok: z.literal(true),
  run: outputWorkflowRunSchema,
  terminal: z.boolean().default(false),
})

export const sequenceAnimaticStoryboardBlockV1Schema = looseObjectSchema.extend({
  id: z.string().min(1),
  index: z.number().optional(),
  title: z.string().optional(),
  shotIds: z.array(z.string()).default([]),
  shots: z.array(looseRecordSchema).default([]),
  continuityAnchorIds: z.array(z.string()).default([]),
  storyboardGroup: looseRecordSchema.default({}),
  storyboardLayout: looseRecordSchema.default({}),
  durationSeconds: z.number().optional(),
})

export const sequenceAnimaticManifestV1Schema = looseObjectSchema.extend({
  role: z.literal('sequence_animatic_manifest'),
  graphSpecVersion: sequenceAnimaticGraphSpecVersionSchema.default('sequence_animatic_graph_v1'),
  screenplayAnimaticRole: z.literal('master'),
  sequenceAnimaticRole: z.literal('master'),
  requestId: z.string().nullable().optional(),
  workflowId: z.string().min(1),
  runId: z.string().min(1),
  screenplayDraft: looseRecordSchema.default({}),
  screenplayMarkdown: z.string().default(''),
  shotBreakPlan: looseRecordSchema.default({}),
  shotPlan: looseRecordSchema.default({}),
  blocks: z.array(sequenceAnimaticStoryboardBlockV1Schema).default([]),
  assetPack: looseRecordSchema.default({}),
  selectedVisualReferenceKeys: z.array(z.string()).default([]),
  animaticReferenceCatalog: z.array(looseRecordSchema).default([]),
  continuityAnchorPlan: looseRecordSchema.default({}),
  characterAnchors: z.array(looseRecordSchema).default([]),
  propAnchors: z.array(looseRecordSchema).default([]),
  locationSpotAnchors: z.array(looseRecordSchema).default([]),
  anchorAssets: z.array(looseRecordSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticDirectorPlanShotSchema = looseObjectSchema.extend({
  id: z.string().min(1),
  index: z.number().optional(),
  sourceAnchorIds: z.array(z.string()).default([]),
  sourceScriptShotIds: z.array(z.string()).default([]),
  blockId: z.string().default(''),
  storyboardBlockId: z.string().default(''),
  title: z.string().default(''),
  action: z.string().default(''),
  camera: looseRecordSchema.default({}),
  lighting: z.string().default(''),
  dialogue: z.array(looseRecordSchema).default([]),
  performance: z.array(looseRecordSchema).default([]),
  performanceBeats: z.array(looseRecordSchema).default([]),
  refs: looseRecordSchema.default({}),
  visibleCharacterRefIds: z.array(z.string()).default([]),
  speakerRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  locationRefIds: z.array(z.string()).default([]),
  continuityAnchorIds: z.array(z.string()).default([]),
  coverageSetupId: z.string().default(''),
  coverage_setup_id: z.string().default(''),
  continuityLink: looseRecordSchema.default({}),
  continuity_link: looseRecordSchema.default({}),
  sceneBinding: looseRecordSchema.default({}),
  sceneGraphBinding: looseRecordSchema.default({}),
  assetRequirements: z.array(looseRecordSchema).default([]),
  warnings: z.array(z.string()).default([]),
})

export const sequenceAnimaticDirectorPlanBlockSchema = looseObjectSchema.extend({
  id: z.string().min(1),
  index: z.number().optional(),
  title: z.string().default(''),
  summary: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  status: z.enum(['planned', 'needs_review', 'failed']).default('planned'),
  warnings: z.array(z.string()).default([]),
})

export const sequenceAnimaticDirectorPlanV1Schema = looseObjectSchema.extend({
  role: z.literal('sequence_animatic_director_plan'),
  graphSpecVersion: z.literal('sequence_animatic_graph_v2').default('sequence_animatic_graph_v2'),
  screenplayAnimaticRole: z.literal('director_plan'),
  sequenceAnimaticRole: z.literal('director_plan'),
  masterRequestId: z.string().nullable().optional(),
  masterManifestArtifactKey: z.string().default(''),
  manifestHash: z.string().default(''),
  scriptHash: z.string().default(''),
  shotPlanHash: z.string().default(''),
  planningMode: z.enum(['single_director_pass', 'deterministic_fallback']).default('single_director_pass'),
  contractVersion: z.string().default(''),
  screenplaySummary: z.string().default(''),
  shots: z.array(sequenceAnimaticDirectorPlanShotSchema).default([]),
  blocks: z.array(sequenceAnimaticDirectorPlanBlockSchema).default([]),
  sceneGraphAdditions: looseRecordSchema.default({}),
  localReferences: z.array(looseRecordSchema).default([]),
  coverageSetups: z.array(looseRecordSchema).default([]),
  coverage_setup_by_shot_id: looseRecordSchema.default({}),
  coverageSetupByShotId: looseRecordSchema.default({}),
  notes: z.array(z.string()).default([]),
  continuityGraphV2: looseRecordSchema.default({}),
  continuity_graph_v2: looseRecordSchema.default({}),
  shotBindings: looseRecordSchema.default({}),
  shot_bindings: looseRecordSchema.default({}),
  assetRequirements: z.array(looseRecordSchema).default([]),
  canonicalReferenceAssignments: looseRecordSchema.default({}),
  outputLocalReferences: z.array(looseRecordSchema).default([]),
  rejectedCandidates: z.array(looseRecordSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityAssetStatusSchema = z.enum(['missing', 'generating', 'ready', 'stale', 'failed'])
export const sequenceAnimaticContinuityAssetGenerationStatusSchema = z.enum(['none', 'partial', 'ready', 'stale', 'failed'])
export const sequenceAnimaticContinuityAssetBatchKindSchema = z.enum([
  'location_zone_board',
  'angle_grid',
  'viewpoint_grid',
  'spot_grid',
  'zone_spatial_map',
  'spot_atlas_grid',
  'viewpoint_atlas_grid',
  'temp_character_grid',
  'prop_grid',
  'single_hero_ref',
])

export const sequenceAnimaticScriptShotSchema = looseObjectSchema.extend({
  id: z.string().min(1),
  index: z.number().optional(),
  title: z.string().default(''),
  approximateDurationSeconds: z.number().optional(),
  screenplayText: z.string().default(''),
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
})

export const sequenceAnimaticScriptBlockSchema = looseObjectSchema.extend({
  id: z.string().min(1),
  index: z.number().optional(),
  title: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  approximateDurationSeconds: z.number().optional(),
})

export const sequenceAnimaticContinuityAssetBatchLayoutSchema = looseObjectSchema.extend({
  rows: z.number().int().positive().default(1),
  columns: z.number().int().positive().default(1),
  cellCount: z.number().int().positive().default(1),
})

export const sequenceAnimaticContinuityAssetBatchSchema = looseObjectSchema.extend({
  batchId: z.string().min(1),
  batchKind: sequenceAnimaticContinuityAssetBatchKindSchema,
  targetNodeIds: z.array(z.string().min(1)).default([]),
  sourceReferenceNodeIds: z.array(z.string().min(1)).default([]),
  worldReferenceAssetKeys: z.array(z.string()).default([]),
  blockIds: z.array(z.string()).default([]),
  layout: sequenceAnimaticContinuityAssetBatchLayoutSchema.default({ rows: 1, columns: 1, cellCount: 1 }),
  required: z.boolean().default(false),
})

export const continuityAssetStateSchema = looseObjectSchema.extend({
  status: sequenceAnimaticContinuityAssetStatusSchema.default('missing'),
  inputHash: z.string().default(''),
  assetKey: z.string().nullable().default(null),
  artifactKey: z.string().nullable().default(null),
  prompt: z.string().default(''),
  referenceAssetKeys: z.array(z.string()).default([]),
  sourceNodeId: z.string().min(1),
  assetKind: z.string().default('continuity_asset'),
  generatedAt: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
  error: z.string().default(''),
})

export const continuityVisualDependencyEdgeSchema = looseObjectSchema.extend({
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  relationship: z.string().min(1),
  required: z.boolean().default(false),
  evidence: z.string().default(''),
})

export const sequenceAnimaticContinuityPackV1Schema = looseObjectSchema.extend({
  graphSpecVersion: sequenceAnimaticGraphSpecVersionSchema.default('sequence_animatic_graph_v1'),
  screenplayAnimaticRole: z.literal('continuity_pack'),
  sequenceAnimaticRole: z.literal('continuity_pack'),
  masterRequestId: z.string().min(1),
  masterManifestArtifactKey: z.string().min(1),
  manifestHash: z.string().min(1),
  continuityPackHash: z.string().min(1),
  planningMode: z.enum(['block_graph_v2', 'llm_structured_v2', 'deterministic_fallback', 'legacy_manifest']).optional(),
  characterAnchors: z.array(looseRecordSchema).default([]),
  propAnchors: z.array(looseRecordSchema).default([]),
  locationSpotAnchors: z.array(looseRecordSchema).default([]),
  continuityGraphV2: looseRecordSchema.default({}),
  continuity_graph_v2: looseRecordSchema.default({}),
  locationSets: z.array(looseRecordSchema).default([]),
  locationAngles: z.array(looseRecordSchema).default([]),
  sceneGraph: looseRecordSchema.default({}),
  shotContinuityMap: looseRecordSchema.default({}),
  shotBindings: looseRecordSchema.default({}),
  blockStates: looseRecordSchema.default({}),
  pendingDeltas: looseRecordSchema.default({}),
  continuityGraphStatus: z.enum(['empty', 'partial', 'ready', 'stale', 'failed']).default('empty'),
  globalStructureState: looseRecordSchema.default({}),
  coverage: looseRecordSchema.default({}),
  assetStateByNodeId: z.record(z.string(), continuityAssetStateSchema).default({}),
  continuityAssetBatches: z.array(sequenceAnimaticContinuityAssetBatchSchema).default([]),
  visualDependencyEdges: z.array(continuityVisualDependencyEdgeSchema).default([]),
  assetGenerationStatus: sequenceAnimaticContinuityAssetGenerationStatusSchema.default('none'),
  rejectedCandidates: z.array(looseRecordSchema).default([]),
  plannerWarnings: z.array(z.string()).default([]),
  plannerDiagnostics: z.array(z.string()).default([]),
  anchorAssets: z.array(looseRecordSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotVideoInputV1Schema = looseObjectSchema.extend({
  graphSpecVersion: sequenceAnimaticGraphSpecVersionSchema.default('sequence_animatic_graph_v1'),
  screenplayAnimaticRole: z.literal('shot_video'),
  sequenceAnimaticRole: z.literal('shot_video'),
  masterRequestId: z.string().min(1),
  parentRequestId: z.string().min(1),
  storyboardBlockId: z.string().min(1),
  shotId: z.string().min(1),
  shot: looseRecordSchema,
  panel: looseRecordSchema,
  assetPack: looseRecordSchema.default({}),
  editorialDurationSeconds: z.number().positive(),
  providerDurationSeconds: z.number().positive(),
})

export const sequenceAnimaticShotProductionInputV1Schema = looseObjectSchema.extend({
  graphSpecVersion: sequenceAnimaticGraphSpecVersionSchema.default('sequence_animatic_graph_v2'),
  screenplayAnimaticRole: z.literal('shot_production'),
  sequenceAnimaticRole: z.literal('shot_production'),
  masterRequestId: z.string().min(1),
  parentRequestId: z.string().min(1),
  storyboardBlockId: z.string().min(1),
  shotId: z.string().min(1),
  shot: looseRecordSchema,
  panel: looseRecordSchema.default({}),
  assetPack: looseRecordSchema.default({}),
  dependencyMode: z.enum(['single_node_chain', 'batch_grid']).default('single_node_chain'),
  continuityDependencies: z.array(looseRecordSchema).default([]),
  continuityDependencyNodeIds: z.array(z.string()).default([]),
  missingContinuityNodeIds: z.array(z.string()).default([]),
  editorialDurationSeconds: z.number().positive(),
  providerDurationSeconds: z.number().positive(),
  requiredReferenceAssetKeys: z.array(z.string()).default([]),
  omittedReferenceAssetKeys: z.array(z.string()).default([]),
  sharedDependencyRequests: z.array(looseRecordSchema).default([]),
})

export const sequenceAnimaticShotRevisionArtifactV1Schema = looseObjectSchema.extend({
  graphSpecVersion: sequenceAnimaticGraphSpecVersionSchema.default('sequence_animatic_graph_v1'),
  screenplayAnimaticRole: z.literal('shot_revision'),
  sequenceAnimaticRole: z.literal('shot_revision'),
  masterRequestId: z.string().min(1),
  storyboardBlockId: z.string().min(1),
  shotId: z.string().min(1),
  revisionId: z.string().min(1),
  sourceManifestHash: z.string().min(1),
  basePanelAssetKey: z.string().min(1),
  revisedShot: looseRecordSchema,
  keyframeAssetKey: z.string().default(''),
  prompt: z.string().default(''),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticKeyframeWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  mode: z.enum(['generate', 'regenerate']).default('generate'),
  shotIds: z.array(z.string().min(1)).max(150).optional(),
  coverageSetupIds: z.array(z.string().min(1)).max(150).optional(),
  allowProvisional: z.boolean().default(false),
})

export const sequenceAnimaticBlockedShotKeyframeSchema = z.object({
  shotId: z.string(),
  storyboardBlockId: z.string().nullable().default(null),
  reason: z.enum(['missing_continuity_asset', 'missing_coverage_anchor', 'missing_previous_keyframe']),
  coverageSetupId: z.string().nullable().default(null),
  previousShotId: z.string().nullable().default(null),
  missingContinuityNodeIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticKeyframeNextActionSchema = z.object({
  kind: z.enum(['run_continuity_asset', 'run_coverage_anchor', 'run_shot_production_keyframe', 'keyframe_ready', 'blocked']),
  requestId: z.string().nullable().default(null),
  workflowId: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  reason: z.string().default(''),
  shotId: z.string().default(''),
  coverageSetupId: z.string().nullable().default(null),
  dependencyNodeIds: z.array(z.string()).default([]),
}).nullable().default(null)

export const sequenceAnimaticShotReadinessSchema = z.object({
  shotId: z.string().default(''),
  status: z.enum(['waiting_for_continuity_asset', 'waiting_for_coverage_anchor', 'waiting_for_previous_keyframe', 'ready_for_keyframe', 'keyframe_ready', 'blocked']).default('blocked'),
  missingContinuityNodeIds: z.array(z.string()).default([]),
  coverageSetupReady: z.boolean().default(false),
  previousKeyframeReady: z.boolean().default(false),
  keyframeReady: z.boolean().default(false),
}).nullable().default(null)

export const sequenceAnimaticKeyframeWorkflowEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  keyframePlan: looseRecordSchema.default({}),
  visualReferencePlan: looseRecordSchema.default({}),
  nextAction: sequenceAnimaticKeyframeNextActionSchema,
  shotReadiness: sequenceAnimaticShotReadinessSchema,
  blockedShotKeyframes: z.array(sequenceAnimaticBlockedShotKeyframeSchema).default([]),
  dependencyWaves: z.array(looseRecordSchema).default([]),
  continuityAssetRequests: z.array(outputRequestSchema).default([]),
  coverageAnchorRequests: z.array(outputRequestSchema).default([]),
  shotKeyframeRequests: z.array(outputRequestSchema).default([]),
  childRequests: z.array(outputRequestSchema).default([]),
  workflows: z.array(outputWorkflowSchema).default([]),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const sequenceAnimaticShotProductionGraphEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  shotId: z.string().min(1),
  coverageSetupId: z.string().min(1).optional(),
  forceRefresh: z.boolean().default(false),
  allowProvisional: z.boolean().default(false),
})

export const sequenceAnimaticShotProductionGraphEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  shotRequest: outputRequestSchema,
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  cacheStatus: z.enum(['reused', 'created', 'refreshed']).default('created'),
  shotId: z.string().min(1),
  coverageSetupId: z.string().nullable().default(null),
  dependencyNodeIds: z.array(z.string()).default([]),
  graphPolicyVersion: z.string().default('primary_chain_v5'),
})

export const sequenceAnimaticZoneCoverageBoardEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  sceneId: z.string().min(1),
  setId: z.string().optional().nullable().default(null),
  zoneId: z.string().optional().nullable().default(null),
  shotIds: z.array(z.string().min(1)).optional().default([]),
  scopedShots: z.array(looseRecordSchema).optional().default([]),
  forceRefresh: z.boolean().default(false),
})

export const sequenceAnimaticZoneCoverageBoardEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  boardRequests: z.array(outputRequestSchema).default([]),
  workflows: z.array(outputWorkflowSchema).default([]),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  zoneCoverageBoards: z.array(looseRecordSchema).default([]),
  coverageCellByShotId: looseRecordSchema.default({}),
  cacheStatus: z.enum(['reused', 'created', 'refreshed', 'mixed']).default('created'),
  sceneId: z.string().min(1),
})

export const sequenceAnimaticCoverageIntentRecordSchema = looseObjectSchema.extend({
  shotId: z.string().min(1),
  sceneId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  primarySpotId: z.string().default(''),
  coverageIntent: z.string().default(''),
  cameraFraming: z.string().default(''),
  cameraAngle: z.string().default(''),
  screenDirection: z.string().default(''),
  subjectFocus: z.string().default(''),
  stagingBrief: z.string().default(''),
  sourceHash: z.string().default(''),
  updatedAt: z.string().default(''),
  workflowRequestId: z.string().default(''),
})

export const sequenceAnimaticShotCoverageIntentEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  sceneId: z.string().min(1),
  setId: z.string().optional().nullable().default(null),
  zoneId: z.string().optional().nullable().default(null),
  shotIds: z.array(z.string().min(1)).min(1).max(150),
  scopedShots: z.array(looseRecordSchema).optional().default([]),
  forceRefresh: z.boolean().default(false),
})

export const sequenceAnimaticShotCoverageIntentEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  intentRequest: outputRequestSchema,
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  coverageIntentByShotId: z.record(z.string(), sequenceAnimaticCoverageIntentRecordSchema).default({}),
  cacheStatus: z.enum(['reused', 'created', 'refreshed']).default('created'),
  sceneId: z.string().min(1),
  shotIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticSceneBoardPrepStageSchema = z.enum([
  'idle',
  'set_refs',
  'scaffold_refs',
  'coverage_directions',
  'coverage_grids',
  'complete',
  'failed',
  'cancelled',
])

export const sequenceAnimaticSceneBoardPrepRunSchema = looseObjectSchema.extend({
  runId: z.string().min(1),
  runKey: z.string().min(1),
  sceneId: z.string().min(1),
  setId: z.string().nullable().default(null),
  zoneId: z.string().nullable().default(null),
  scopeNodeId: z.string().nullable().default(null),
  shotIds: z.array(z.string()).default([]),
  stage: sequenceAnimaticSceneBoardPrepStageSchema.default('idle'),
  status: z.enum(['queued', 'running', 'complete', 'failed', 'cancelled']).default('queued'),
  activeUnitId: z.string().nullable().default(null),
  activeUnitLabel: z.string().default(''),
  stageLabel: z.string().default('Preparing selected board'),
  message: z.string().default(''),
  queued: z.number().int().nonnegative().default(0),
  running: z.number().int().nonnegative().default(0),
  ready: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  activeRequestIds: z.array(z.string()).default([]),
  activeRunIds: z.array(z.string()).default([]),
  activeReferenceNodeIds: z.array(z.string()).default([]),
  activeCoverageShotIds: z.array(z.string()).default([]),
  activeRunStepKey: z.string().default(''),
  startedAt: z.string().default(''),
  updatedAt: z.string().default(''),
  error: z.string().default(''),
})

export const sequenceAnimaticSceneBoardPrepRunsSchema = z.record(z.string(), sequenceAnimaticSceneBoardPrepRunSchema).default({})

export const sequenceAnimaticSceneBoardPrepRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  runId: z.string().min(1).optional(),
  runKey: z.string().min(1).optional(),
  sceneId: z.string().min(1),
  setId: z.string().optional().nullable().default(null),
  zoneId: z.string().optional().nullable().default(null),
  scopeNodeId: z.string().optional().nullable().default(null),
  shotIds: z.array(z.string().min(1)).optional().default([]),
  stage: sequenceAnimaticSceneBoardPrepStageSchema.optional(),
  status: z.enum(['queued', 'running', 'complete', 'failed', 'cancelled']).optional(),
  activeUnitId: z.string().optional().nullable(),
  activeUnitLabel: z.string().optional(),
  stageLabel: z.string().optional(),
  message: z.string().optional(),
  queued: z.number().int().nonnegative().optional(),
  running: z.number().int().nonnegative().optional(),
  ready: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  activeRequestIds: z.array(z.string()).optional(),
  activeRunIds: z.array(z.string()).optional(),
  activeReferenceNodeIds: z.array(z.string()).optional(),
  activeCoverageShotIds: z.array(z.string()).optional(),
  activeRunStepKey: z.string().optional(),
  error: z.string().optional(),
  action: z.enum(['start', 'update', 'complete', 'fail', 'cancel', 'resume']).default('update'),
  forceRefresh: z.boolean().default(false),
})

export const sequenceAnimaticSceneBoardPrepResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  prepRun: sequenceAnimaticSceneBoardPrepRunSchema,
  prepRuns: sequenceAnimaticSceneBoardPrepRunsSchema,
})

export const sequenceAnimaticSceneBoardWorkflowCommandActionSchema = z.enum([
  'prepare_selected_board',
  'regenerate_zone_top_down',
  'generate_zone_coverage_grids',
  'generate_selected_coverage_anchors',
])

export const sequenceAnimaticSceneBoardWorkflowCommandRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  sceneId: z.string().min(1),
  action: sequenceAnimaticSceneBoardWorkflowCommandActionSchema.default('prepare_selected_board'),
  setId: z.string().optional().nullable().default(null),
  zoneId: z.string().optional().nullable().default(null),
  scopeNodeId: z.string().optional().nullable().default(null),
  shotIds: z.array(z.string().min(1)).optional().default([]),
  forceRefresh: z.boolean().default(false),
})

export const sequenceAnimaticSceneBoardWorkflowCommandResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  prepRequest: outputRequestSchema,
  workflow: outputWorkflowSchema,
  run: outputWorkflowRunSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  prepRun: sequenceAnimaticSceneBoardPrepRunSchema.nullable().default(null),
  reused: z.boolean().default(false),
})

export const sequenceAnimaticSceneGraphNodeKindSchema = z.enum([
  'world_location',
  'set',
  'zone',
  'spot',
  'viewpoint',
  'angle',
  'coverage_anchor',
  'temp_character',
  'prop',
  'faction',
  'vehicle',
  'group',
])

export const sequenceAnimaticSceneGraphNodeOverrideSchema = z.object({
  nodeId: z.string().min(1),
  nodeKind: sequenceAnimaticSceneGraphNodeKindSchema,
  visualBriefOverride: z.string().trim().max(8000).default(''),
  extraPromptDirection: z.string().trim().max(8000).default(''),
  updatedAt: z.string().default(''),
  updatedBy: z.string().nullable().default(null),
  lastGeneratedAssetKey: z.string().nullable().default(null),
  previousAssetKeys: z.array(z.string()).default([]),
})

export const sequenceAnimaticSceneGraphOverridesSchema = z.object({
  version: z.literal('sequence_animatic_scene_graph_overrides_v1').default('sequence_animatic_scene_graph_overrides_v1'),
  nodes: z.record(z.string(), sequenceAnimaticSceneGraphNodeOverrideSchema).default({}),
})

export const sequenceAnimaticSceneGraphNodeUpdateRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  nodeId: z.string().min(1),
  nodeKind: sequenceAnimaticSceneGraphNodeKindSchema,
  visualBriefOverride: z.string().trim().max(8000).optional(),
  extraPromptDirection: z.string().trim().max(8000).optional(),
  clearOverride: z.boolean().default(false),
})

export const sequenceAnimaticSceneGraphNodeUpdateResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  overrides: sequenceAnimaticSceneGraphOverridesSchema,
  nodeOverride: sequenceAnimaticSceneGraphNodeOverrideSchema.nullable().default(null),
})

export const sequenceAnimaticBlockWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  sequenceAnimaticMode: z.enum(['storyboard_blocks', 'shot_video']).default('storyboard_blocks'),
  blockRequestId: z.string().min(1).optional(),
  storyboardBlockId: z.string().min(1).optional(),
  shotId: z.string().min(1).optional(),
  panelAssetKey: z.string().min(1).optional(),
})

export const sequenceAnimaticBlockWorkflowEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  childRequests: z.array(outputRequestSchema).default([]),
  workflows: z.array(outputWorkflowSchema).default([]),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const sequenceAnimaticSceneWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  sceneIds: z.array(z.string().min(1)).optional(),
  startSceneId: z.string().min(1).optional(),
})

export const sequenceAnimaticSceneWorkflowEnsureResponseSchema = sequenceAnimaticBlockWorkflowEnsureResponseSchema

export const sequenceAnimaticContinuityWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
})

export const sequenceAnimaticContinuityWorkflowEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  continuityRequest: outputRequestSchema.nullable().default(null),
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const sequenceAnimaticContinuityBlockDeriveRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  continuityRequestId: z.string().min(1).nullable().optional(),
  storyboardBlockId: z.string().min(1),
  mode: z.enum(['derive', 'regenerate']).default('derive'),
})

export const sequenceAnimaticContinuityBlockDeriveResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  continuityRequest: outputRequestSchema,
  run: outputWorkflowRunSchema.nullable().default(null),
  blockState: looseRecordSchema.default({}),
  reused: z.boolean().default(false),
})

export const sequenceAnimaticContinuityStructureDeriveRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  continuityRequestId: z.string().min(1).nullable().optional(),
  mode: z.enum(['generate', 'fill_gaps', 'regenerate']).default('generate'),
})

export const sequenceAnimaticContinuityStructureDeriveResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  continuityRequest: outputRequestSchema,
  run: outputWorkflowRunSchema.nullable().default(null),
  globalStructureState: looseRecordSchema.default({}),
  coverage: looseRecordSchema.default({}),
  reused: z.boolean().default(false),
})

export const sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  continuityRequestId: z.string().min(1).nullable().optional(),
  nodeId: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).max(9).optional(),
  batchKind: sequenceAnimaticContinuityAssetBatchKindSchema.optional(),
  mode: z.enum(['generate', 'regenerate']).default('generate'),
})

export const sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  continuityRequest: outputRequestSchema.nullable().default(null),
  assetRequest: outputRequestSchema.nullable().default(null),
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  assetState: continuityAssetStateSchema.nullable().default(null),
  reused: z.boolean().default(false),
})

export const sequenceAnimaticShotRevisionWorkflowEnsureRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1),
  storyboardBlockId: z.string().min(1),
  shotId: z.string().min(1),
  prompt: z.string().min(1),
})

export const sequenceAnimaticShotRevisionWorkflowEnsureResponseSchema = z.object({
  ok: z.literal(true),
  masterRequest: outputRequestSchema,
  revisionRequest: outputRequestSchema.nullable().default(null),
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const sequenceAnimaticStateRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  masterRequestId: z.string().min(1).nullable().optional(),
  sequenceUnitKey: z.string().min(1).nullable().optional(),
  knownRevision: z.string().nullable().optional(),
}).refine((value) => Boolean(value.masterRequestId || value.sequenceUnitKey), {
  message: 'Provide masterRequestId or sequenceUnitKey.',
})

export const sequenceAnimaticStateResponseSchema = z.object({
  ok: z.literal(true),
  unchanged: z.boolean().default(false),
  revision: z.string().default(''),
  masterRequest: outputRequestSchema.nullable().default(null),
  requests: z.array(outputRequestSchema).default([]),
  workflows: z.array(outputWorkflowSchema).default([]),
  runs: z.array(outputWorkflowRunSchema).default([]),
  artifacts: z.array(outputArtifactSchema).default([]),
  assets: z.array(looseRecordSchema).default([]),
  projections: z.array(outputRequestStatusProjectionSchema).default([]),
  events: z.array(looseObjectSchema.extend({
    id: z.string().default(''),
    requestId: z.string().default(''),
    projectId: z.string().default(''),
    draftId: z.string().default(''),
    sequence: z.number().default(0),
    eventType: z.string().default(''),
    payload: looseRecordSchema.default({}),
    createdAt: z.string().default(''),
  })).default([]),
  scriptShotStatus: z.enum(['missing', 'ready']).default('missing'),
  scriptShots: z.array(sequenceAnimaticScriptShotSchema).default([]),
  scriptBlocks: z.array(sequenceAnimaticScriptBlockSchema).default([]),
  screenplayStatus: z.enum(['missing', 'ready']).default('missing'),
  screenplayMarkdown: z.string().default(''),
  directorPlan: sequenceAnimaticDirectorPlanV1Schema.nullable().default(null),
  directorPlanStatus: z.enum(['missing', 'planning', 'ready', 'failed']).default('missing'),
  shotContinuityPlan: sequenceAnimaticDirectorPlanV1Schema.nullable().default(null),
  shotContinuityPlanStatus: z.enum(['missing', 'planning', 'ready', 'failed']).default('missing'),
  shotContinuityStreamStatus: z.enum(['missing', 'streaming', 'ready', 'failed']).default('missing'),
  streamedShotContinuityPlan: sequenceAnimaticDirectorPlanV1Schema.nullable().default(null),
  streamedShotCount: z.number().int().nonnegative().default(0),
  streamedBlockCount: z.number().int().nonnegative().default(0),
  scenes: z.array(looseRecordSchema).default([]),
  orchestratorStatus: z.enum(['missing', 'running', 'partial', 'queued', 'ready', 'failed']).default('missing'),
  queuedBlockCount: z.number().int().nonnegative().default(0),
  activeBlockId: z.string().nullable().default(null),
  referenceAssetProgress: looseRecordSchema.default({}),
  continuityGraphStatus: z.enum(['empty', 'partial', 'ready', 'stale', 'failed']).default('empty'),
  continuityBlockStates: looseRecordSchema.default({}),
  globalStructureState: looseRecordSchema.default({}),
  continuityCoverage: looseRecordSchema.default({}),
  assetStateByNodeId: z.record(z.string(), continuityAssetStateSchema).default({}),
  visualDependencyEdges: z.array(continuityVisualDependencyEdgeSchema).default([]),
  continuityAssetBatches: z.array(sequenceAnimaticContinuityAssetBatchSchema).default([]),
  assetGenerationStatus: sequenceAnimaticContinuityAssetGenerationStatusSchema.default('none'),
})

export const outputWorkflowAssetHydrationModeSchema = z.enum(['none', 'preview', 'selected', 'all'])

export const outputWorkflowGraphRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  selectedNodeKey: z.string().min(1).nullable().optional(),
  includeSelectedNodeOutput: z.boolean().default(false),
  knownGraphRevision: z.string().nullable().optional(),
  assetHydrationMode: outputWorkflowAssetHydrationModeSchema.default('all'),
})

export const outputWorkflowSelectedNodeOutputSchema = z.object({
  nodeKey: z.string(),
  outputs: looseRecordSchema.default({}),
  truncated: z.boolean().default(false),
})

export const outputWorkflowGraphResponseSchema = z.object({
  ok: z.literal(true),
  unchanged: z.boolean().default(false),
  workflow: outputWorkflowSchema.nullable().default(null),
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
  run: outputWorkflowRunSchema.nullable().default(null),
  artifacts: z.array(outputArtifactSchema).default([]),
  assets: z.array(looseRecordSchema).default([]),
  graphRevision: z.string().default(''),
  selectedNodeOutput: outputWorkflowSelectedNodeOutputSchema.nullable().default(null),
})

export const outputWorkflowNodeOutputRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  nodeKey: z.string().min(1),
  graphRevision: z.string().nullable().optional(),
})

export const outputWorkflowNodeOutputResponseSchema = z.object({
  ok: z.literal(true),
  workflowId: z.string(),
  runId: z.string().nullable().default(null),
  graphRevision: z.string().default(''),
  selectedNodeOutput: outputWorkflowSelectedNodeOutputSchema,
  assets: z.array(looseRecordSchema).default([]),
})

export const outputWorkflowCancelResponseSchema = z.object({
  ok: z.literal(true),
  run: outputWorkflowRunSchema.nullable().default(null),
  cancelled: z.boolean().default(false),
})

export const outputWorkflowNodeUpdateRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  nodeKey: z.string().min(1),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }).optional(),
  inputs: z.object({
    prompt: z.string().max(32000).optional(),
  }).strict().optional(),
  metadata: z.object({
    displayLabel: z.string().max(120).optional(),
    note: z.string().max(2000).optional(),
  }).strict().optional(),
}).strict()

export const outputWorkflowNodeUpdateResponseSchema = z.object({
  ok: z.literal(true),
  node: outputWorkflowNodeSchema,
  nodes: z.array(outputWorkflowNodeSchema).default([]),
})

export const outputWorkflowUpgradeRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  preset: outputWorkflowPresetSchema.default('ebook_from_world'),
}).strict()

export const outputWorkflowUpgradeResponseSchema = z.object({
  ok: z.literal(true),
  workflow: outputWorkflowSchema,
  nodes: z.array(outputWorkflowNodeSchema),
  edges: z.array(outputWorkflowEdgeSchema),
  addedNodeKeys: z.array(z.string()).default([]),
  addedEdgeKeys: z.array(z.string()).default([]),
  dirtiedNodeKeys: z.array(z.string()).default([]),
  alreadyCurrent: z.boolean().default(false),
})

export const outputArtifactResponseSchema = z.object({
  ok: z.literal(true),
  artifact: outputArtifactSchema.nullable().default(null),
})

export function isTerminalOutputWorkflowRunStatus(status: z.infer<typeof outputWorkflowRunStatusSchema>) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'].includes(status)
}

export function isOutputWorkflowProviderBackedNodeType(nodeType: z.infer<typeof outputWorkflowNodeTypeSchema>) {
  return outputWorkflowNodeRegistry[nodeType].providerBacked
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function hashOutputWorkflowValue(value: unknown) {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function validateOutputWorkflowGraph(input: {
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key' | 'nodeType'> & Partial<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'config' | 'inputs'>>>
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourcePort' | 'targetPort' | 'metadata'>>>
  worldWiki?: unknown
}) {
  const executionPlan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  const skillDiagnostics = input.nodes.flatMap((node) => {
    if (!node.config) return []
    const bundle = buildOutputGuidanceBundleForNode({
      node: {
        nodeType: node.nodeType,
        config: node.config ?? {},
        inputs: node.inputs ?? {},
      },
      worldWiki: input.worldWiki,
    })
    return bundle.diagnostics.map((diagnostic) => `${node.key}: ${diagnostic}`)
  })
  const nodeByKey = new Map(input.nodes.map((node) => [node.key, node] as const))
  const manifestDiagnostics = input.nodes.flatMap((node) => {
    const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
      ? node.config as Record<string, unknown>
      : {}
    const purpose = typeof config.purpose === 'string' && config.purpose.trim()
      ? config.purpose.trim()
      : typeof config.role === 'string'
        ? config.role.trim()
        : ''
    if (!purpose) return []
    const manifest = getWorkflowNodeManifest(node)
    if (!manifest) return [`${node.key}: unknown workflow node purpose "${purpose}". Register a WorkflowNodeManifest before using it in a graph.`]
    if (manifest.nodeType !== '*' && manifest.nodeType !== node.nodeType) {
      return [`${node.key}: purpose "${purpose}" expects node type "${manifest.nodeType}", received "${node.nodeType}".`]
    }
    const configValidation = validateWorkflowNodeManifestConfig(node)
    return configValidation.ok
      ? []
      : configValidation.diagnostics.map((diagnostic) => `${node.key}: ${diagnostic}`)
  })
  const contractDiagnostics = input.nodes.flatMap((node) => {
    const contract = getOutputWorkflowNodeContract(node)
    if (!contract || contract.requiredInputs.length === 0) return []
    const incomingPorts = new Set(input.edges
      .filter((edge) => edge.targetNodeKey === node.key)
      .map((edge) => typeof edge.targetPort === 'string' ? edge.targetPort : '')
      .filter(Boolean))
    return contract.requiredInputs
      .filter((port) => !incomingPorts.has(port))
      .map((port) => `${node.key}: missing required "${port}" input for ${contract.purpose}.`)
  })
  const edgeContractDiagnostics = input.edges.flatMap((edge) => {
    const sourceNode = nodeByKey.get(edge.sourceNodeKey)
    const sourceContract = getOutputWorkflowNodeContract(sourceNode)
    const sourcePort = typeof edge.sourcePort === 'string' ? edge.sourcePort : ''
    if (!sourceContract || !sourcePort || sourceContract.producedOutputs.length === 0) return []
    return sourceContract.producedOutputs.includes(sourcePort)
      ? []
      : [`${edge.sourceNodeKey}: edge uses undeclared "${sourcePort}" output for ${sourceContract.purpose}.`]
  })
  const diagnostics = [...executionPlan.diagnostics, ...skillDiagnostics, ...manifestDiagnostics, ...contractDiagnostics, ...edgeContractDiagnostics]
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    orderedNodeKeys: executionPlan.orderedNodeKeys,
  }
}

export function buildValidatedOutputWorkflowTemplateGraph<TGraph extends WorkflowTemplateGraphRowsInternal>(input: {
  registry: Map<string, AnyWorkflowTemplateRegistryEntryInternal>
  templateKey: string
  rawInput: unknown
}) {
  return buildWorkflowTemplateGraphInternal<unknown, TGraph>({
    registry: input.registry,
    templateKey: input.templateKey,
    rawInput: input.rawInput,
    validateGraph: (graph) => validateOutputWorkflowGraph(normalizeWorkflowTemplateGraphRowsInternal(graph) as never),
  })
}

export type OutputWorkflowExecutionPlan = {
  orderedNodeKeys: string[]
  levels: string[][]
  incomingByNodeKey: Record<string, Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<OutputWorkflowEdge, 'sourcePort' | 'targetPort' | 'metadata'>>>>
  outgoingByNodeKey: Record<string, Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<OutputWorkflowEdge, 'sourcePort' | 'targetPort' | 'metadata'>>>>
  dependencyKeysByNodeKey: Record<string, string[]>
  diagnostics: string[]
}

export function selectOutputWorkflowRunSubgraph<
  TNode extends Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>,
  TEdge extends Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>,
>(input: {
  nodes: TNode[]
  edges: TEdge[]
  targetNodeKeys?: string[]
  runScope?: z.infer<typeof outputWorkflowRunScopeSchema>
}) {
  const targetNodeKeys = [...new Set((input.targetNodeKeys ?? []).map((key) => key.trim()).filter(Boolean))]
  if (targetNodeKeys.length === 0) {
    return {
      nodes: input.nodes,
      edges: input.edges,
      targetNodeKeys: [],
      includedNodeKeys: input.nodes.map((node) => node.key),
      diagnostics: [],
    }
  }

  const diagnostics: string[] = []
  const nodeKeys = new Set(input.nodes.map((node) => node.key))
  const incomingByNodeKey = new Map<string, string[]>()
  for (const node of input.nodes) incomingByNodeKey.set(node.key, [])
  for (const edge of input.edges) {
    if (!nodeKeys.has(edge.sourceNodeKey) || !nodeKeys.has(edge.targetNodeKey)) continue
    incomingByNodeKey.get(edge.targetNodeKey)?.push(edge.sourceNodeKey)
  }

  const included = new Set<string>()
  const visitAncestors = (key: string) => {
    if (!nodeKeys.has(key)) {
      diagnostics.push(`Target output workflow node "${key}" does not exist.`)
      return
    }
    if (included.has(key)) return
    included.add(key)
    for (const parentKey of incomingByNodeKey.get(key) ?? []) visitAncestors(parentKey)
  }
  const outgoingByNodeKey = new Map<string, string[]>()
  for (const node of input.nodes) outgoingByNodeKey.set(node.key, [])
  for (const edge of input.edges) {
    if (!nodeKeys.has(edge.sourceNodeKey) || !nodeKeys.has(edge.targetNodeKey)) continue
    outgoingByNodeKey.get(edge.sourceNodeKey)?.push(edge.targetNodeKey)
  }
  const visitDescendants = (key: string) => {
    if (!nodeKeys.has(key)) {
      diagnostics.push(`Target output workflow node "${key}" does not exist.`)
      return
    }
    if (included.has(key)) return
    included.add(key)
    for (const childKey of outgoingByNodeKey.get(key) ?? []) visitDescendants(childKey)
  }
  const runScope = input.runScope ?? 'upstream_to_node'
  for (const key of targetNodeKeys) {
    if (runScope === 'node_only') {
      if (!nodeKeys.has(key)) diagnostics.push(`Target output workflow node "${key}" does not exist.`)
      else included.add(key)
    } else if (runScope === 'node_and_downstream') {
      visitDescendants(key)
    } else {
      visitAncestors(key)
    }
  }

  return {
    nodes: input.nodes.filter((node) => included.has(node.key)),
    edges: input.edges.filter((edge) => included.has(edge.sourceNodeKey) && included.has(edge.targetNodeKey)),
    targetNodeKeys,
    includedNodeKeys: [...included],
    diagnostics,
  }
}

export function buildOutputWorkflowExecutionPlan(
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>,
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourcePort' | 'targetPort' | 'metadata'>>>,
): OutputWorkflowExecutionPlan {
  const diagnostics: string[] = []
  const nodeKeys = nodes.map((node) => node.key)
  const nodeKeySet = new Set(nodeKeys)
  const incomingByNodeKey: OutputWorkflowExecutionPlan['incomingByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const outgoingByNodeKey: OutputWorkflowExecutionPlan['outgoingByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const dependencyKeysByNodeKey: OutputWorkflowExecutionPlan['dependencyKeysByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const inDegree = new Map(nodeKeys.map((key) => [key, 0]))
  const levelByNodeKey = new Map(nodeKeys.map((key) => [key, 0]))

  for (const edge of edges) {
    if (!nodeKeySet.has(edge.sourceNodeKey)) {
      diagnostics.push(`Missing source node "${edge.sourceNodeKey}".`)
      continue
    }
    if (!nodeKeySet.has(edge.targetNodeKey)) {
      diagnostics.push(`Missing target node "${edge.targetNodeKey}".`)
      continue
    }
    outgoingByNodeKey[edge.sourceNodeKey].push(edge)
    incomingByNodeKey[edge.targetNodeKey].push(edge)
    dependencyKeysByNodeKey[edge.targetNodeKey].push(edge.sourceNodeKey)
    inDegree.set(edge.targetNodeKey, (inDegree.get(edge.targetNodeKey) ?? 0) + 1)
  }

  const queue = nodeKeys.filter((key) => (inDegree.get(key) ?? 0) === 0)
  const orderedNodeKeys: string[] = []
  while (queue.length > 0) {
    const key = queue.shift()!
    orderedNodeKeys.push(key)
    for (const edge of outgoingByNodeKey[key]) {
      const nextLevel = Math.max(levelByNodeKey.get(edge.targetNodeKey) ?? 0, (levelByNodeKey.get(key) ?? 0) + 1)
      levelByNodeKey.set(edge.targetNodeKey, nextLevel)
      inDegree.set(edge.targetNodeKey, (inDegree.get(edge.targetNodeKey) ?? 0) - 1)
      if ((inDegree.get(edge.targetNodeKey) ?? 0) === 0) queue.push(edge.targetNodeKey)
    }
  }

  if (orderedNodeKeys.length !== nodes.length) diagnostics.push('Workflow graph contains a cycle.')
  const levels: string[][] = []
  for (const key of orderedNodeKeys) {
    const level = levelByNodeKey.get(key) ?? 0
    if (!levels[level]) levels[level] = []
    levels[level].push(key)
  }

  return {
    orderedNodeKeys,
    levels: levels.filter((level) => level.length > 0),
    incomingByNodeKey,
    outgoingByNodeKey,
    dependencyKeysByNodeKey,
    diagnostics,
  }
}

export function topologicallySortOutputWorkflow(
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>,
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>>,
) {
  return buildOutputWorkflowExecutionPlan(
    nodes,
    edges.map((edge) => ({
      sourceNodeKey: edge.sourceNodeKey,
      sourcePort: '',
      targetNodeKey: edge.targetNodeKey,
      targetPort: '',
    })),
  ).orderedNodeKeys
}

function readExecutionRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readNodeConfigRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

const outputWorkflowEightWideMediaGroups = new Set([
  'cinematic_beat_sheets',
  'cinematic_keyframes',
  'cinematic_videos',
  'cinematic_v2_storyboard_sheets',
  'cinematic_v2_shot_keyframes',
  'cinematic_v2_videos',
  'cinematic_v3_storyboard_sheets',
  'cinematic_v3_storyboard_group_videos',
])

export function getOutputWorkflowNodeExecutionMetadata(
  node: Pick<OutputWorkflowNode, 'nodeType' | 'config' | 'metadata'>,
) {
  const configExecution = readExecutionRecord(readExecutionRecord(node.config).execution)
  const metadataExecution = readExecutionRecord(readExecutionRecord(node.metadata).execution)
  const parsed = outputWorkflowExecutionMetadataSchema.parse({
    ...metadataExecution,
    ...configExecution,
  })
  const resourceClass = parsed.resourceClass ?? (
    node.nodeType === 'text_llm'
      ? 'llm'
      : node.nodeType === 'image_generation'
        ? 'image'
        : node.nodeType === 'video_generation'
          ? 'video'
          : node.nodeType === 'document_render'
            ? 'document'
            : 'utility'
  )
  const maxConcurrency = resourceClass === 'image' && parsed.groupKey === 'comic_pages'
    ? Math.max(parsed.maxConcurrency ?? defaultOutputWorkflowConcurrency.resourceClasses.image, defaultOutputWorkflowConcurrency.resourceClasses.image)
    : parsed.groupKey && outputWorkflowEightWideMediaGroups.has(parsed.groupKey)
      ? Math.max(parsed.maxConcurrency ?? defaultOutputWorkflowConcurrency.global, defaultOutputWorkflowConcurrency.global)
      : parsed.maxConcurrency
  return { ...parsed, resourceClass, maxConcurrency }
}

export function getOutputWorkflowNodeGuidanceConfig(
  node: Pick<OutputWorkflowNode, 'config' | 'inputs'>,
) {
  const config = readNodeConfigRecord(node.config)
  const explicitGuidance = readNodeConfigRecord(config.guidance)
  return outputWorkflowNodeGuidanceConfigSchema.parse({
    ...explicitGuidance,
    skillKeys: Array.isArray(config.skillKeys) ? config.skillKeys : explicitGuidance.skillKeys,
    autoSkillTags: Array.isArray(config.autoSkillTags) ? config.autoSkillTags : explicitGuidance.autoSkillTags,
    presetSkillKeys: Array.isArray(config.presetSkillKeys) ? config.presetSkillKeys : explicitGuidance.presetSkillKeys,
    guidanceMode: config.guidanceMode ?? explicitGuidance.guidanceMode,
  })
}

export function buildOutputGuidanceBundleForNode(input: {
  node: Pick<OutputWorkflowNode, 'nodeType' | 'config' | 'inputs'>
  worldWiki?: unknown
}) {
  const config = readNodeConfigRecord(input.node.config)
  const purpose = typeof config.purpose === 'string' ? config.purpose : ''
  const guidance = getOutputWorkflowNodeGuidanceConfig(input.node)
  const resolved = resolveOutputSkillsForNode({
    nodeType: input.node.nodeType,
    purpose,
    explicitSkillKeys: guidance.skillKeys,
    autoSkillTags: guidance.autoSkillTags,
    presetSkillKeys: guidance.presetSkillKeys,
    worldWiki: input.worldWiki,
  })
  return buildOutputGuidanceBundle({
    skills: resolved.skills,
    guidanceMode: guidance.guidanceMode,
    contextualGuidance: resolved.contextualGuidance,
    diagnostics: resolved.diagnostics,
  })
}

export const defaultOutputWorkflowConcurrency = {
  global: 8,
  resourceClasses: {
    llm: 8,
    image: 8,
    video: 8,
    document: 4,
    utility: 8,
  },
} as const

export type OutputWorkflowReadyQueueStatus = 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'waiting'

export async function runOutputWorkflowReadyQueue<TNode extends Pick<OutputWorkflowNode, 'key' | 'nodeType' | 'config' | 'metadata'>>(input: {
  nodes: TNode[]
  edges: Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'sourcePort' | 'targetNodeKey' | 'targetPort'> & Partial<Pick<OutputWorkflowEdge, 'metadata'>>>
  globalMaxConcurrency?: number
  resourceClassMaxConcurrency?: Partial<Record<z.infer<typeof outputWorkflowResourceClassSchema>, number>>
  shouldCancel?: () => boolean | Promise<boolean>
  executeNode: (context: {
    node: TNode
    upstream: Record<string, Record<string, unknown>>
    orderIndex: number
    resourceClass: z.infer<typeof outputWorkflowResourceClassSchema>
  }) => Promise<{ status?: 'completed' | 'skipped' | 'waiting'; outputs: Record<string, unknown>; resumeAfterMs?: number }>
  onNodeStart?: (context: { node: TNode; orderIndex: number; resourceClass: z.infer<typeof outputWorkflowResourceClassSchema> }) => void | Promise<void>
  onNodeComplete?: (context: { node: TNode; orderIndex: number; outputs: Record<string, unknown>; skipped: boolean }) => void | Promise<void>
  onNodeWaiting?: (context: { node: TNode; orderIndex: number; outputs: Record<string, unknown>; resumeAfterMs: number }) => void | Promise<void>
  onNodeFailed?: (context: { node: TNode; orderIndex: number; error: unknown; blockedDependents: string[] }) => void | Promise<void>
  onNodeCancelled?: (context: { node: TNode; orderIndex: number; reason: string; blockedBy?: string }) => void | Promise<void>
  onHeartbeat?: (context: { pending: string[]; running: string[]; completed: string[]; failed: string[]; cancelled: string[]; skipped: string[] }) => void | Promise<void>
}) {
  const executionPlan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  if (executionPlan.diagnostics.length > 0) throw new Error(executionPlan.diagnostics.join(' '))

  const nodeByKey = new Map(input.nodes.map((node) => [node.key, node]))
  const orderIndexByKey = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
  const pending = new Set(executionPlan.orderedNodeKeys)
  const running = new Map<string, Promise<{ key: string; outputs?: Record<string, unknown>; skipped?: boolean; waiting?: boolean; resumeAfterMs?: number; error?: unknown }>>()
  const completed = new Set<string>()
  const skipped = new Set<string>()
  const failed = new Set<string>()
  const cancelled = new Set<string>()
  const blockedBy = new Map<string, string>()
  const outputsByNodeKey: Record<string, Record<string, unknown>> = {}
  const runningByResourceClass = new Map<z.infer<typeof outputWorkflowResourceClassSchema>, number>()
  const runningByGroupKey = new Map<string, number>()
  let hadContinuableFailure = false

  const resourceClassMaxConcurrency = {
    ...defaultOutputWorkflowConcurrency.resourceClasses,
    ...input.resourceClassMaxConcurrency,
  }
  const globalMaxConcurrency = input.globalMaxConcurrency ?? defaultOutputWorkflowConcurrency.global

  const heartbeat = async () => {
    await input.onHeartbeat?.({
      pending: [...pending],
      running: [...running.keys()],
      completed: [...completed],
      failed: [...failed],
      cancelled: [...cancelled],
      skipped: [...skipped],
    })
  }

  const markCancelled = async (key: string, reason: string, sourceKey?: string) => {
    if (!pending.delete(key)) return
    cancelled.add(key)
    if (sourceKey) blockedBy.set(key, sourceKey)
    const node = nodeByKey.get(key)
    if (node) {
      await input.onNodeCancelled?.({
        node,
        orderIndex: orderIndexByKey.get(key) ?? 0,
        reason,
        blockedBy: sourceKey,
      })
    }
  }

  const collectDescendants = (sourceKey: string) => {
    const descendants = new Set<string>()
    const queue = [...(executionPlan.outgoingByNodeKey[sourceKey] ?? []).map((edge) => edge.targetNodeKey)]
    while (queue.length > 0) {
      const key = queue.shift()!
      if (descendants.has(key)) continue
      descendants.add(key)
      queue.push(...(executionPlan.outgoingByNodeKey[key] ?? []).map((edge) => edge.targetNodeKey))
    }
    return [...descendants]
  }

  const edgeIsOptional = (edge: Partial<Pick<OutputWorkflowEdge, 'metadata'>>) => (
    readExecutionRecord(edge.metadata).optional === true
    || readExecutionRecord(edge.metadata).optionalDependency === true
  )

  const collectRequiredDescendants = (sourceKey: string) => {
    const descendants = new Set<string>()
    const queue = [...(executionPlan.outgoingByNodeKey[sourceKey] ?? []).filter((edge) => !edgeIsOptional(edge))]
    while (queue.length > 0) {
      const edge = queue.shift()!
      const key = edge.targetNodeKey
      if (descendants.has(key)) continue
      descendants.add(key)
      queue.push(...(executionPlan.outgoingByNodeKey[key] ?? []).filter((nextEdge) => !edgeIsOptional(nextEdge)))
    }
    return [...descendants]
  }

  const canLaunch = (node: TNode) => {
    const execution = getOutputWorkflowNodeExecutionMetadata(node)
    if (running.size >= globalMaxConcurrency) return false
    if ((runningByResourceClass.get(execution.resourceClass) ?? 0) >= resourceClassMaxConcurrency[execution.resourceClass]) return false
    if (execution.groupKey && execution.maxConcurrency && (runningByGroupKey.get(execution.groupKey) ?? 0) >= execution.maxConcurrency) return false
    return true
  }

  const launch = async (node: TNode) => {
    const execution = getOutputWorkflowNodeExecutionMetadata(node)
    const key = node.key
    pending.delete(key)
    runningByResourceClass.set(execution.resourceClass, (runningByResourceClass.get(execution.resourceClass) ?? 0) + 1)
    if (execution.groupKey) runningByGroupKey.set(execution.groupKey, (runningByGroupKey.get(execution.groupKey) ?? 0) + 1)
    await input.onNodeStart?.({ node, orderIndex: orderIndexByKey.get(key) ?? 0, resourceClass: execution.resourceClass })
    const upstream = Object.fromEntries(
      (executionPlan.incomingByNodeKey[key] ?? []).map((edge) => [edge.sourceNodeKey, outputsByNodeKey[edge.sourceNodeKey] ?? {}]),
    )
    const promise = input.executeNode({
      node,
      upstream,
      orderIndex: orderIndexByKey.get(key) ?? 0,
      resourceClass: execution.resourceClass,
    })
      .then((result) => ({ key, outputs: result.outputs, skipped: result.status === 'skipped', waiting: result.status === 'waiting', resumeAfterMs: result.resumeAfterMs }))
      .catch((error) => ({ key, error }))
      .finally(() => {
        runningByResourceClass.set(execution.resourceClass, Math.max(0, (runningByResourceClass.get(execution.resourceClass) ?? 1) - 1))
        if (execution.groupKey) runningByGroupKey.set(execution.groupKey, Math.max(0, (runningByGroupKey.get(execution.groupKey) ?? 1) - 1))
      })
    running.set(key, promise)
  }

  while (pending.size > 0 || running.size > 0) {
    if (await input.shouldCancel?.()) {
      for (const key of [...pending]) await markCancelled(key, 'cancelled')
      await heartbeat()
      return { status: 'cancelled' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
    }

    let launched = false
    for (const key of [...pending]) {
      const incoming = executionPlan.incomingByNodeKey[key] ?? []
      const dependencies = executionPlan.dependencyKeysByNodeKey[key] ?? []
      const failedDependency = incoming.find((edge) => !edgeIsOptional(edge) && (failed.has(edge.sourceNodeKey) || cancelled.has(edge.sourceNodeKey)))?.sourceNodeKey
      if (failedDependency) {
        await markCancelled(key, 'blocked_by_failed_dependency', failedDependency)
        continue
      }
      if (!incoming.every((edge) => (
        completed.has(edge.sourceNodeKey)
        || (edgeIsOptional(edge) && (failed.has(edge.sourceNodeKey) || cancelled.has(edge.sourceNodeKey)))
      ))) continue
      if (incoming.length === 0 && !dependencies.every((dependencyKey) => completed.has(dependencyKey))) continue
      const node = nodeByKey.get(key)
      if (!node || !canLaunch(node)) continue
      await launch(node)
      launched = true
    }

    await heartbeat()
    if (running.size === 0) break
    if (!launched && running.size === 0) break

    const settled = await Promise.race([...running.values()])
    running.delete(settled.key)
    const settledNode = nodeByKey.get(settled.key)
    if (!settledNode) continue
    const orderIndex = orderIndexByKey.get(settled.key) ?? 0
    if (settled.error) {
      if (typeof settled.error === 'object' && settled.error && (settled.error as { workflowCancelled?: unknown }).workflowCancelled === true) {
        cancelled.add(settled.key)
        await input.onNodeCancelled?.({ node: settledNode, orderIndex, reason: 'cancelled' })
        for (const key of [...pending]) await markCancelled(key, 'cancelled', settled.key)
        await heartbeat()
        return { status: 'cancelled' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
      }
      failed.add(settled.key)
      const execution = getOutputWorkflowNodeExecutionMetadata(settledNode)
      const blockedDependents = collectDescendants(settled.key).filter((key) => pending.has(key))
      await input.onNodeFailed?.({ node: settledNode, orderIndex, error: settled.error, blockedDependents })
      if (execution.continueOnError) {
        hadContinuableFailure = true
        const requiredBlockedDependents = collectRequiredDescendants(settled.key).filter((key) => pending.has(key))
        for (const key of requiredBlockedDependents) await markCancelled(key, 'blocked_by_failed_dependency', settled.key)
        continue
      }
      for (const key of [...pending]) await markCancelled(key, key === settled.key ? 'failed' : 'blocked_by_failed_dependency', settled.key)
      await heartbeat()
      return { status: 'failed' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
    }
    if (settled.waiting) {
      outputsByNodeKey[settled.key] = settled.outputs ?? {}
      const resumeAfterMs = Math.max(0, Math.floor(Number(settled.resumeAfterMs) || 15_000))
      await input.onNodeWaiting?.({
        node: settledNode,
        orderIndex,
        outputs: settled.outputs ?? {},
        resumeAfterMs,
      })
      await heartbeat()
      return {
        status: 'waiting' as const,
        outputsByNodeKey,
        completed: [...completed],
        failed: [...failed],
        cancelled: [...cancelled],
        skipped: [...skipped],
        waitingNodeKey: settled.key,
        resumeAfterMs,
      }
    }
    outputsByNodeKey[settled.key] = settled.outputs ?? {}
    completed.add(settled.key)
    if (settled.skipped) skipped.add(settled.key)
    await input.onNodeComplete?.({
      node: settledNode,
      orderIndex,
      outputs: settled.outputs ?? {},
      skipped: Boolean(settled.skipped),
    })
  }

  return {
    status: hadContinuableFailure || failed.size > 0 || cancelled.size > 0 ? 'completed_with_errors' as const : 'completed' as const,
    outputsByNodeKey,
    completed: [...completed],
    failed: [...failed],
    cancelled: [...cancelled],
    skipped: [...skipped],
  }
}

export function markDirtyOutputWorkflowNodes(input: {
  changedNodeKeys: string[]
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>>
}) {
  const dirty = new Set(input.changedNodeKeys)
  let changed = true
  while (changed) {
    changed = false
    for (const edge of input.edges) {
      if (!dirty.has(edge.sourceNodeKey) || dirty.has(edge.targetNodeKey)) continue
      dirty.add(edge.targetNodeKey)
      changed = true
    }
  }
  return input.nodes.map((node) => ({
    key: node.key,
    dirty: dirty.has(node.key),
  }))
}

export function buildOutputWorkflowFingerprint(input: {
  worldEntities: unknown[]
  worldRelationships: unknown[]
  worldWiki: unknown
}) {
  return hashOutputWorkflowValue({
    entities: input.worldEntities,
    relationships: input.worldRelationships,
    wiki: input.worldWiki,
  })
}

function nodeBase(input: {
  key: string
  nodeType: z.infer<typeof outputWorkflowNodeTypeSchema>
  label: string
  x: number
  y: number
  config?: Record<string, unknown>
  inputs?: Record<string, unknown>
}) {
  return {
    key: input.key,
    nodeType: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config ?? {},
    inputs: input.inputs ?? {},
    outputs: {},
    dirty: true,
    inputHash: '',
    outputHash: '',
    metadata: {},
  }
}

function edgeBase(sourceNodeKey: string, sourcePort: string, targetNodeKey: string, targetPort: string, metadata: Record<string, unknown> = {}) {
  return {
    key: `${sourceNodeKey}.${sourcePort}->${targetNodeKey}.${targetPort}`,
    sourceNodeKey,
    sourcePort,
    targetNodeKey,
    targetPort,
    metadata,
  }
}

const EBOOK_CHAPTER_FANOUT_LIMIT = 24
const COMIC_PAGE_FANOUT_LIMIT = 12
const DEFAULT_COMIC_PAGE_COUNT = 8
const IMAGE_OUTPUT_ENTITY_LIMIT = 12
const STORY_BIBLE_ENTITY_LIMIT = 80
const STORY_BIBLE_SEQUENCE_LIMIT = 36

type CinematicAspectRatio = NonNullable<z.infer<typeof outputWorkflowPlanRequestSchema>['aspectRatio']>
type CinematicResolution = NonNullable<z.infer<typeof outputWorkflowPlanRequestSchema>['videoResolution']>
type CinematicPresetFamily = NonNullable<z.infer<typeof outputWorkflowPlanRequestSchema>['cinematicPresetFamily']>
type CinematicReferenceMode = NonNullable<z.infer<typeof outputWorkflowPlanRequestSchema>['cinematicReferenceMode']>
type CinematicPipelineVersion = NonNullable<z.infer<typeof outputWorkflowPlanRequestSchema>['cinematicPipelineVersion']>
type OutputImageGenerationQuality = z.infer<typeof outputImageGenerationQualitySchema>
type OutputImageGenerationOutputFormat = z.infer<typeof outputImageGenerationOutputFormatSchema>

function promptLooksLikeCharacterArt(prompt: string) {
  return promptIncludesAny(prompt.toLowerCase(), [
    'character',
    'portrait',
    'person',
    'people',
    'actor',
    'cast',
    'face',
    'headshot',
  ])
}

export function resolveOutputImageGenerationQuality(input: {
  requestedQuality?: OutputImageGenerationQuality | null
  outputKind?: z.infer<typeof outputRequestKindSchema> | null
  role?: string | null
  purpose?: string | null
  prompt?: string
  selectedEntityTypes?: string[]
}): OutputImageGenerationQuality {
  if (input.requestedQuality) return input.requestedQuality
  const defaults = aiGenerationSettings.outputWorkflow.imageQualityDefaults
  const role = (input.role ?? '').toLowerCase()
  const purpose = (input.purpose ?? '').toLowerCase()
  if (role.includes('comic') || purpose.includes('comic')) return defaults.comic
  if (role === 'ebook_cover' || purpose === 'ebook_cover_image') return defaults.ebookCover
  if (input.outputKind === 'poster_image' || role === 'poster_image' || purpose === 'poster_image') return defaults.poster
  if (input.outputKind === 'concept_art_image' || role === 'concept_art_image' || purpose === 'concept_art_image') {
    const characterEntity = (input.selectedEntityTypes ?? []).some((type) => type === 'actor')
    return characterEntity || promptLooksLikeCharacterArt(input.prompt ?? '')
      ? defaults.characterConceptArt
      : defaults.conceptArt
  }
  return defaults.default
}

export function resolveOutputImageGenerationOutputFormat(input: {
  requestedFormat?: OutputImageGenerationOutputFormat | null
} = {}): OutputImageGenerationOutputFormat {
  return input.requestedFormat ?? aiGenerationSettings.outputWorkflow.imageOutputFormatDefault
}

const STORY_BIBLE_SECTIONS = [
  { key: 'core_premise', title: 'Core Premise', description: 'Project premise, promise, genre, themes, and core conflict.' },
  { key: 'world_overview', title: 'World Overview', description: 'The world, status quo, history pressure, and major systems already defined in canon.' },
  { key: 'main_characters', title: 'Main Characters', description: 'Character dossiers, motivations, conflicts, arcs, relationships, and visual anchors.' },
  { key: 'locations', title: 'Locations', description: 'Key places, spatial logic, atmosphere, and plot function.' },
  { key: 'factions_groups', title: 'Factions / Groups', description: 'Groups, institutions, alliances, power structures, and conflicts.' },
  { key: 'objects_concepts', title: 'Objects / Concepts', description: 'Important objects, technology, lore concepts, symbols, and rules.' },
  { key: 'timeline_chronology', title: 'Timeline / Chronology', description: 'Known events, cause/effect order, and chronology gaps.' },
  { key: 'sequence_overview', title: 'Sequence / Story Arcs', description: 'Chapter, episode, mission, or beat sequence with outcomes and open loops.' },
  { key: 'lore_rules', title: 'Rules / Lore Constraints', description: 'Canon constraints, system rules, continuity restrictions, and things not yet defined.' },
  { key: 'visual_style_tone', title: 'Visual Style / Tone', description: 'Tone tags, art direction, recurring motifs, palette, and media style.' },
  { key: 'open_questions', title: 'Open Questions / Continuity Notes', description: 'Unresolved questions, weak areas, contradictions, and useful next-development notes.' },
] as const

type StoryBibleSection = (typeof STORY_BIBLE_SECTIONS)[number]

function promptIncludesAny(prompt: string, terms: string[]) {
  return terms.some((term) => prompt.includes(term))
}

function promptLooksCinematic(prompt: string) {
  return promptIncludesAny(prompt, [
    'cinematic sequence',
    'cinematic',
    'trailer',
    'video',
    'shot-by-shot',
    'shot by shot',
    'storyboard',
    'reference-to-video',
    'reference to video',
    'ugc video',
    'brand video',
    'ad creative',
    'shortform',
    'short-form',
    'scene',
  ])
}

function promptLooksLikeUgcVideo(prompt: string) {
  return promptIncludesAny(prompt, [
    'ugc',
    'creator video',
    'brand video',
    'ad creative',
    'direct response',
    'hook',
    'cta',
    'tiktok',
    'reel',
    'shortform',
    'short-form',
  ])
}

export function classifyOutputPrompt(prompt: string): {
  intent: z.infer<typeof outputRequestIntentSchema>
  outputKind: z.infer<typeof outputRequestKindSchema>
  confidence: number
  notes: string
} {
  const classification = classifyPromptIntentScored(prompt)
  return {
    intent: outputRequestIntentSchema.parse(classification.intent),
    outputKind: outputRequestKindSchema.parse(classification.outputKind),
    confidence: classification.confidence,
    notes: classification.rationale,
  }
}

function storyBibleSectionsForKind(kind: z.infer<typeof outputRequestKindSchema>): StoryBibleSection[] {
  if (kind === 'character_dossier_pack') {
    return STORY_BIBLE_SECTIONS.filter((section) => [
      'core_premise',
      'main_characters',
      'factions_groups',
      'sequence_overview',
      'visual_style_tone',
      'open_questions',
    ].includes(section.key))
  }
  if (kind === 'lore_guide') {
    return STORY_BIBLE_SECTIONS.filter((section) => [
      'core_premise',
      'world_overview',
      'locations',
      'factions_groups',
      'objects_concepts',
      'timeline_chronology',
      'lore_rules',
      'visual_style_tone',
      'open_questions',
    ].includes(section.key))
  }
  if (kind === 'world_reference_document') {
    return [...STORY_BIBLE_SECTIONS]
  }
  return [...STORY_BIBLE_SECTIONS]
}

export function planOutputPrompt(input: {
  prompt: string
  snapshot: z.infer<typeof outputWorkflowPlanRequestSchema>['snapshot']
  selectedEntityKeys?: string[]
  selectedSequenceUnitKeys?: string[]
  targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
  classification?: PromptIntentClassificationResult
}) {
  const classification = input.classification
    ? promptIntentClassificationResultSchema.parse(input.classification)
    : classifyPromptIntentScored(input.prompt)
  const outputKind = outputRequestKindSchema.parse(classification.outputKind)
  const intent = outputRequestIntentSchema.parse(classification.intent)
  const boundScope = bindOutputPromptWorldScope({
    prompt: input.prompt,
    worldEntities: input.snapshot.worldEntities,
    selectedEntityKeys: input.selectedEntityKeys,
    selectedSequenceUnitKeys: input.selectedSequenceUnitKeys,
  })
  const referenceKinds: z.infer<typeof outputRequestKindSchema>[] = [
    'story_bible_from_world',
    'world_reference_document',
    'lore_guide',
    'character_dossier_pack',
  ]
  const imageKind = outputKind === 'concept_art_image' || outputKind === 'poster_image'
  const cinematicKind = outputKind === 'cinematic_episode'
    || outputKind === 'cinematic_trailer'
    || outputKind === 'ugc_episode'
  const cinematicSourceScope = cinematicKind
    ? resolveCinematicStorySourceScope({
      prompt: input.prompt,
      worldEntities: input.snapshot.worldEntities,
      selectedSequenceUnitKeys: input.selectedSequenceUnitKeys,
    })
    : null
  const documentReference = referenceKinds.includes(outputKind)
  const textOnlyReference = promptIncludesAny(input.prompt.toLowerCase(), ['text only', 'no images', 'without images', 'plain reference', 'simple reference'])
  const designedReference = documentReference && !textOnlyReference
  const selectedEntityKeys = imageKind
    ? boundScope.selectedEntityKeys
    : documentReference
      ? (input.selectedEntityKeys?.length ? input.selectedEntityKeys : input.snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit').slice(0, STORY_BIBLE_ENTITY_LIMIT).map((entity) => entity.key))
      : boundScope.selectedEntityKeys
  const selectedSequenceUnitKeys = documentReference
    ? (input.selectedSequenceUnitKeys?.length ? input.selectedSequenceUnitKeys : sortedSequenceUnits(input.snapshot.worldEntities).map((entity) => entity.key).slice(0, STORY_BIBLE_SEQUENCE_LIMIT))
    : cinematicKind
      ? cinematicSourceScope?.selectedSequenceUnitKeys ?? []
    : boundScope.selectedSequenceUnitKeys
  const sections = documentReference ? storyBibleSectionsForKind(outputKind) : []
  return outputPromptPlannerResultSchema.parse({
    intent,
    outputKind,
    confidence: classification.confidence,
    targetFormat: imageKind ? 'image' : cinematicKind ? 'video' : classification.targetFormat ?? input.targetFormat ?? 'pdf',
    worldScope: documentReference ? 'full_world' : selectedEntityKeys.length || selectedSequenceUnitKeys.length ? 'prompt_bound_scope' : 'full_world',
    selectedEntityKeys,
    selectedSequenceUnitKeys,
    documentMode: designedReference ? 'designed_reference' : documentReference ? 'reference' : imageKind ? 'visual' : cinematicKind ? 'cinematic' : outputKind === 'comic_issue_from_sequence' ? 'comic' : 'narrative',
    sections,
    visualReferencePolicy: imageKind || cinematicKind ? 'use_prompt_bound_entity_refs' : 'none',
    requiresConfirmation: classification.requiresConfirmation || intent === 'ambiguous' || classification.confidence < 0.55,
    plannerNotes: [
      classification.rationale,
      cinematicSourceScope && cinematicSourceScope.sourceMode !== 'none'
        ? `Cinematic source resolver: ${cinematicSourceScope.rationale}`
        : '',
    ].filter(Boolean).join('\n'),
    classifierMode: classification.classifierMode,
    classifierCatalogVersion: classification.catalogVersion,
    classifierRationale: classification.rationale,
    classifierCandidates: classification.alternatives,
  })
}

function normalizePromptToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function promptTokenSet(value: string) {
  return new Set(normalizePromptToken(value).split(/\s+/).filter((part) => part.length > 0))
}

function tokenEditDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false
  if (left.length === right.length) {
    let mismatches = 0
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] === right[index]) continue
      if (
        index + 1 < left.length
        && left[index] === right[index + 1]
        && left[index + 1] === right[index]
      ) {
        return left.slice(0, index) === right.slice(0, index)
          && left.slice(index + 2) === right.slice(index + 2)
      }
      mismatches += 1
      if (mismatches > 1) return false
    }
    return mismatches <= 1
  }
  const shorter = left.length < right.length ? left : right
  const longer = left.length < right.length ? right : left
  let edits = 0
  for (let shortIndex = 0, longIndex = 0; shortIndex < shorter.length || longIndex < longer.length;) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    longIndex += 1
  }
  return true
}

function promptMentionsName(promptText: string, promptTokens: Set<string>, nameOrAlias: string) {
  const normalizedName = normalizePromptToken(nameOrAlias)
  if (!normalizedName) return false
  if (promptText.includes(` ${normalizedName} `)) return true
  const nameTokens = normalizedName.split(/\s+/).filter((part) => part.length >= 4)
  return nameTokens.some((nameToken) => (
    promptTokens.has(nameToken)
    || [...promptTokens].some((promptToken) => promptToken.length >= 4 && tokenEditDistanceAtMostOne(promptToken, nameToken))
  ))
}

export type CinematicStorySourceResolution = {
  selectedSequenceUnitKeys: string[]
  sourceMode: 'none' | 'explicit_sequence'
  confidence: number
  rationale: string
}

export function resolveCinematicStorySourceScope(input: {
  prompt: string
  worldEntities: z.infer<typeof worldEntitySchema>[]
  selectedSequenceUnitKeys?: string[]
}): CinematicStorySourceResolution {
  const sequenceUnits = sortedSequenceUnits(input.worldEntities)
  const validSequenceKeys = new Set(sequenceUnits.map((entity) => entity.key))
  const explicitSequenceKeys = [...new Set(input.selectedSequenceUnitKeys ?? [])]
    .filter((key) => validSequenceKeys.has(key))
  if (explicitSequenceKeys.length > 0) {
    return {
      selectedSequenceUnitKeys: explicitSequenceKeys.slice(0, 3),
      sourceMode: 'explicit_sequence',
      confidence: 1,
      rationale: 'The request supplied explicit selected sequence unit keys.',
    }
  }

  return {
    selectedSequenceUnitKeys: [],
    sourceMode: 'none',
    confidence: sequenceUnits.length > 0 ? 0.4 : 0.95,
    rationale: sequenceUnits.length > 0
      ? 'No explicit sequence was supplied; prompt-mode cinematic source selection is deferred to the LLM resolver.'
      : 'No sequence units are available to select.',
  }
}

export function bindOutputPromptWorldScope(input: {
  prompt: string
  worldEntities: z.infer<typeof worldEntitySchema>[]
  selectedEntityKeys?: string[]
  selectedSequenceUnitKeys?: string[]
}) {
  const promptText = ` ${normalizePromptToken(input.prompt)} `
  const promptTokens = promptTokenSet(input.prompt)
  const selectedEntityKeys = new Set(input.selectedEntityKeys ?? [])
  const selectedSequenceUnitKeys = new Set(input.selectedSequenceUnitKeys ?? [])
  for (const entity of input.worldEntities) {
    if (promptMentionsName(promptText, promptTokens, entity.name)) {
      if (entity.nodeType === 'sequence_unit') selectedSequenceUnitKeys.add(entity.key)
      else selectedEntityKeys.add(entity.key)
    }
    for (const alias of entity.aliases) {
      if (promptMentionsName(promptText, promptTokens, alias)) {
        if (entity.nodeType === 'sequence_unit') selectedSequenceUnitKeys.add(entity.key)
        else selectedEntityKeys.add(entity.key)
      }
    }
  }
  return {
    selectedEntityKeys: [...selectedEntityKeys].slice(0, IMAGE_OUTPUT_ENTITY_LIMIT),
    selectedSequenceUnitKeys: [...selectedSequenceUnitKeys],
  }
}

function sequenceOrdinal(entity: { customProperties?: Record<string, unknown>; name: string }) {
  const sequence = typeof entity.customProperties?.sequence === 'object' && entity.customProperties.sequence
    ? entity.customProperties.sequence as Record<string, unknown>
    : {}
  const ordinal = Number(sequence.ordinal ?? 0)
  return Number.isFinite(ordinal) ? ordinal : 0
}

function sortedSequenceUnits(entities: z.infer<typeof worldEntitySchema>[]) {
  return entities
    .filter((entity) => entity.nodeType === 'sequence_unit')
    .sort((left, right) => sequenceOrdinal(left) - sequenceOrdinal(right) || left.name.localeCompare(right.name))
}

function sequenceSearchText(entity: z.infer<typeof worldEntitySchema>) {
  const sequence = typeof entity.customProperties?.sequence === 'object' && entity.customProperties.sequence
    ? entity.customProperties.sequence as Record<string, unknown>
    : {}
  return [
    entity.name,
    entity.summary,
    entity.context,
    sequence.synopsis,
    sequence.dramaticQuestion,
    sequence.outcome,
    ...(Array.isArray(sequence.openLoops) ? sequence.openLoops : []),
    ...(Array.isArray(sequence.resolvedLoops) ? sequence.resolvedLoops : []),
    ...(Array.isArray(sequence.consequences) ? sequence.consequences.map((entry) => JSON.stringify(entry)) : []),
    ...(Array.isArray(sequence.characterArcDeltas) ? sequence.characterArcDeltas.map((entry) => JSON.stringify(entry)) : []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function normalizeComicReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function collectSequenceReferenceStrings(value: unknown, output = new Set<string>()) {
  if (typeof value === 'string') {
    const normalized = normalizeComicReferenceText(value)
    if (normalized) output.add(normalized)
    return output
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSequenceReferenceStrings(entry, output)
    return output
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectSequenceReferenceStrings(entry, output)
    }
  }
  return output
}

function entityMentionedBySequence(entity: z.infer<typeof worldEntitySchema>, sequenceText: string, referenceStrings: Set<string>) {
  const key = normalizeComicReferenceText(entity.key)
  if (key && referenceStrings.has(key)) return true
  const name = normalizeComicReferenceText(entity.name)
  if (name && sequenceText.includes(name)) return true
  for (const alias of entity.aliases) {
    const normalizedAlias = normalizeComicReferenceText(alias)
    if (normalizedAlias && (sequenceText.includes(normalizedAlias) || referenceStrings.has(normalizedAlias))) return true
  }
  const nameParts = name.split('_').filter((part) => part.length > 2)
  return entity.nodeType === 'actor' && nameParts.some((part) => sequenceText.includes(part))
}

function chooseComicEntityKeys(input: {
  selectedEntityKeys: string[]
  selectedSequenceUnitKey: string
  sequenceUnit: z.infer<typeof worldEntitySchema> | null
  worldEntities: z.infer<typeof worldEntitySchema>[]
  worldRelationships: z.infer<typeof worldRelationshipSchema>[]
}) {
  if (input.selectedEntityKeys.length > 0) return input.selectedEntityKeys.slice(0, 24)
  const keys = new Set<string>()
  const entityByKey = new Map(input.worldEntities.map((entity) => [entity.key, entity]))
  const sequenceText = input.sequenceUnit ? normalizeComicReferenceText(sequenceSearchText(input.sequenceUnit)) : ''
  const referenceStrings = input.sequenceUnit
    ? collectSequenceReferenceStrings(input.sequenceUnit.customProperties)
    : new Set<string>()
  for (const entity of input.worldEntities) {
    if (entity.nodeType === 'sequence_unit') continue
    if (entityMentionedBySequence(entity, sequenceText, referenceStrings)) keys.add(entity.key)
  }
  for (const relationship of input.worldRelationships) {
    if (relationship.sourceEntityKey === input.selectedSequenceUnitKey) {
      const target = entityByKey.get(relationship.targetEntityKey)
      if (target && target.nodeType !== 'sequence_unit') keys.add(target.key)
    }
    if (relationship.targetEntityKey === input.selectedSequenceUnitKey) {
      const source = entityByKey.get(relationship.sourceEntityKey)
      if (source && source.nodeType !== 'sequence_unit') keys.add(source.key)
    }
  }
  for (const entity of input.worldEntities) {
    if (entity.nodeType === 'sequence_unit') continue
    if (keys.has(entity.key)) continue
    if (entityMentionedBySequence(entity, sequenceText, referenceStrings)) {
      keys.add(entity.key)
    }
  }
  if (keys.size === 0) {
    for (const entity of input.worldEntities) {
      if (entity.nodeType !== 'sequence_unit') keys.add(entity.key)
      if (keys.size >= 12) break
    }
  }
  return [...keys].slice(0, 24)
}

export function buildEbookFromWorldPlan(request: z.infer<typeof outputWorkflowPlanRequestSchema>) {
  const worldWiki = request.snapshot.worldWiki
  const sequenceUnits = sortedSequenceUnits(request.snapshot.worldEntities)
  const selectedSequenceUnitKeys = request.selectedSequenceUnitKeys.length > 0
    ? request.selectedSequenceUnitKeys.slice(0, EBOOK_CHAPTER_FANOUT_LIMIT)
    : sequenceUnits.map((entity) => entity.key).slice(0, EBOOK_CHAPTER_FANOUT_LIMIT)
  const selectedSequenceUnits = sequenceUnits.filter((entity) => selectedSequenceUnitKeys.includes(entity.key))
  const selectedEntityKeys = request.selectedEntityKeys.length > 0
    ? request.selectedEntityKeys
    : request.snapshot.worldEntities
      .filter((entity) => entity.nodeType !== 'sequence_unit')
      .slice(0, 24)
      .map((entity) => entity.key)
  const name = worldWiki.title
    ? `${worldWiki.title} Ebook`
    : `${request.snapshot.project.name} Ebook`
  const prompt = request.prompt.trim() || 'Create a polished written ebook from this world, preserving canon and using the sequence units as the chapter spine.'
  const nonfictionProject = request.snapshot.projectContext?.projectSubtype === 'nonfiction_ebook'
  const chapterVoiceSkill = nonfictionProject ? 'nonfiction_clear_ebook_voice' : 'fiction_prose_voice'
  const ebookSkillKeys = [
    chapterVoiceSkill,
    'anti_ai_telltales',
    'chapter_scene_structure',
    ...(nonfictionProject ? [] : ['fiction_pov_balance']),
    'continuity_editor',
    'provider_prompt_hygiene',
  ]
  const chapterUnits = selectedSequenceUnits.length > 0
    ? selectedSequenceUnits
    : [{
      key: 'ebook-chapter-1',
      name: 'Generated Chapter',
      summary: 'A chapter generated from the available world context.',
      customProperties: { sequence: { ordinal: 1, synopsis: 'Develop the strongest available world material into a coherent chapter.' } },
    }]
  const chapterNodes = chapterUnits.map((sequenceUnit, chapterIndex) => {
    const chapterNumber = chapterIndex + 1
    const chapterKey = `chapter_${String(chapterNumber).padStart(3, '0')}`
    return nodeBase({
      key: `${chapterKey}_prose`,
      nodeType: 'text_llm',
      label: `Chapter ${chapterNumber} Prose`,
      x: 920,
      y: 40 + (chapterIndex % 8) * 160,
      inputs: {
        prompt,
      },
      config: {
        purpose: 'chapter_prose',
        targetFormat: request.targetFormat,
        chapterNumber,
        sequenceUnitKey: sequenceUnit.key,
        sequenceUnitName: sequenceUnit.name,
        skillKeys: nonfictionProject
          ? [chapterVoiceSkill, 'anti_ai_telltales', 'chapter_scene_structure', 'provider_prompt_hygiene']
          : [chapterVoiceSkill, 'anti_ai_telltales', 'chapter_scene_structure', 'fiction_pov_balance', 'provider_prompt_hygiene'],
        autoSkillTags: nonfictionProject ? ['nonfiction', 'ebook', 'quality'] : ['fiction_prose', 'chapter', 'quality'],
        guidanceMode: 'strict',
        execution: {
          resourceClass: 'llm',
          groupKey: 'ebook_chapters',
          maxConcurrency: 8,
        },
      },
    })
  })
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 120,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys: selectedSequenceUnitKeys,
        includeWiki: true,
        includeVisualReferences: false,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Output Skills',
      x: 80,
      y: 260,
      config: {
        skillKeys: ebookSkillKeys,
        autoSkillTags: nonfictionProject ? ['nonfiction', 'ebook', 'quality'] : ['fiction_prose', 'chapter', 'anti_ai_tells', 'quality'],
        guidanceMode: 'append',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'outline',
      nodeType: 'text_llm',
      label: 'Outline / TOC',
      x: 360,
      y: 60,
      inputs: { prompt: 'Create a table of contents, book promise, and chapter intent from the world context.' },
      config: { purpose: 'outline', skillKeys: ['chapter_scene_structure', 'provider_prompt_hygiene'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    nodeBase({
      key: 'chapter_plan',
      nodeType: 'text_llm',
      label: 'Chapter Plan',
      x: 640,
      y: 140,
      inputs: { prompt: 'Create per-chapter writing briefs from the outline and selected sequence units.' },
      config: { purpose: 'chapter_plan', skillKeys: ['chapter_scene_structure', 'provider_prompt_hygiene'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    nodeBase({
      key: 'cover_prompt',
      nodeType: 'text_llm',
      label: 'Cover Prompt',
      x: 640,
      y: 360,
      inputs: { prompt: 'Design a finished front cover image prompt for this ebook, including exact title typography.' },
      config: {
        purpose: 'ebook_cover_prompt',
        skillKeys: ['image_prompt_visual_only', 'provider_prompt_hygiene'],
        autoSkillTags: ['image_prompt', 'visual_only', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm', continueOnError: true },
      },
    }),
    nodeBase({
      key: 'cover_image',
      nodeType: 'image_generation',
      label: 'Cover Image',
      x: 920,
      y: 360,
      config: {
        purpose: 'ebook_cover_image',
        role: 'ebook_cover',
        model: 'openai/gpt-image-2',
        quality: resolveOutputImageGenerationQuality({
          requestedQuality: request.imageQuality,
          role: 'ebook_cover',
          purpose: 'ebook_cover_image',
          prompt,
        }),
        outputFormat: resolveOutputImageGenerationOutputFormat({ requestedFormat: request.imageOutputFormat }),
        imageSize: { width: 1792, height: 2688 },
        skillKeys: ['image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        autoSkillTags: ['image_prompt', 'visual_only', 'entity_reference', 'environment', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: {
          resourceClass: 'image',
          groupKey: 'ebook_cover',
          maxConcurrency: 1,
          continueOnError: true,
        },
      },
    }),
    ...chapterNodes,
    nodeBase({
      key: 'chapter_assembly',
      nodeType: 'utility_transform',
      label: 'Chapter Assembly',
      x: 1220,
      y: 140,
      config: { purpose: 'chapter_assembly', execution: { resourceClass: 'utility' } },
    }),
    nodeBase({
      key: 'consistency_editor',
      nodeType: 'text_llm',
      label: 'Consistency Editor',
      x: 1500,
      y: 100,
      inputs: { prompt: 'Tighten continuity, chapter transitions, front matter, and back matter without changing canon.' },
      config: {
        purpose: 'editor_pass',
        skillKeys: nonfictionProject
          ? ['continuity_editor', 'anti_ai_telltales', 'provider_prompt_hygiene']
          : ['continuity_editor', 'fiction_pov_balance', 'anti_ai_telltales', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'front_back_matter',
      nodeType: 'text_llm',
      label: 'Front / Back Matter',
      x: 1780,
      y: 100,
      inputs: { prompt: 'Add concise front matter and back matter while preserving the edited manuscript body.' },
      config: { purpose: 'front_back_matter', skillKeys: [chapterVoiceSkill, 'continuity_editor', 'anti_ai_telltales'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    nodeBase({
      key: 'document_render',
      nodeType: 'document_render',
      label: 'Render Document',
      x: 2060,
      y: 140,
      config: { targetFormat: request.targetFormat, execution: { resourceClass: 'document' } },
    }),
    nodeBase({
      key: 'artifact',
      nodeType: 'output_artifact',
      label: 'Register Artifact',
      x: 2340,
      y: 140,
      config: { artifactKind: request.targetFormat === 'pdf' ? 'pdf' : 'manuscript', execution: { resourceClass: 'utility' } },
    }),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'outline', 'context'),
    edgeBase('skill_context', 'guidance', 'outline', 'guidance'),
    edgeBase('world_context', 'context', 'chapter_plan', 'context'),
    edgeBase('skill_context', 'guidance', 'chapter_plan', 'guidance'),
    edgeBase('outline', 'text', 'chapter_plan', 'outline'),
    edgeBase('world_context', 'context', 'cover_prompt', 'context'),
    edgeBase('skill_context', 'guidance', 'cover_prompt', 'guidance'),
    edgeBase('cover_prompt', 'text', 'cover_image', 'prompt'),
    edgeBase('skill_context', 'guidance', 'cover_image', 'guidance'),
    ...chapterNodes.flatMap((node) => [
      edgeBase('world_context', 'context', node.key, 'context'),
      edgeBase('skill_context', 'guidance', node.key, 'guidance'),
      edgeBase('chapter_plan', 'plan', node.key, 'chapterPlan'),
      edgeBase(node.key, 'text', 'chapter_assembly', 'chapters'),
    ]),
    edgeBase('chapter_assembly', 'text', 'consistency_editor', 'source'),
    edgeBase('skill_context', 'guidance', 'consistency_editor', 'guidance'),
    edgeBase('consistency_editor', 'text', 'front_back_matter', 'source'),
    edgeBase('skill_context', 'guidance', 'front_back_matter', 'guidance'),
    edgeBase('front_back_matter', 'text', 'document_render', 'source'),
    edgeBase('cover_image', 'image', 'document_render', 'cover', { optional: true }),
    edgeBase('document_render', 'document', 'artifact', 'input'),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset: 'ebook_from_world',
    name,
    description: 'Generate a written ebook from world canon, sequence units, and wiki metadata.',
    prompt,
    targetFormat: request.targetFormat,
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: selectedSequenceUnitKeys,
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(selectedSequenceUnitKeys.length === 0 ? ['No sequence_unit nodes were found; the ebook will be organized from available world entities.'] : []),
      ...(request.selectedSequenceUnitKeys.length > EBOOK_CHAPTER_FANOUT_LIMIT || sequenceUnits.length > EBOOK_CHAPTER_FANOUT_LIMIT
        ? [`Ebook chapter fan-out is capped at ${EBOOK_CHAPTER_FANOUT_LIMIT} sequence units in V1.`]
        : []),
    ],
  })
}

export function buildStoryBibleFromWorldPlan(
  request: z.infer<typeof outputWorkflowPlanRequestSchema>,
  outputKind: 'story_bible_from_world' | 'world_reference_document' | 'lore_guide' | 'character_dossier_pack' = 'story_bible_from_world',
) {
  const worldWiki = request.snapshot.worldWiki
  const title = worldWiki.title || request.snapshot.project.name
  const sections = storyBibleSectionsForKind(outputKind)
  const selectedEntityKeys = request.selectedEntityKeys.length > 0
    ? request.selectedEntityKeys.slice(0, STORY_BIBLE_ENTITY_LIMIT)
    : request.snapshot.worldEntities
      .filter((entity) => entity.nodeType !== 'sequence_unit')
      .slice(0, STORY_BIBLE_ENTITY_LIMIT)
      .map((entity) => entity.key)
  const selectedSequenceUnitKeys = request.selectedSequenceUnitKeys.length > 0
    ? request.selectedSequenceUnitKeys.slice(0, STORY_BIBLE_SEQUENCE_LIMIT)
    : sortedSequenceUnits(request.snapshot.worldEntities).map((entity) => entity.key).slice(0, STORY_BIBLE_SEQUENCE_LIMIT)
  const prompt = request.prompt.trim() || 'Create a complete story bible from this world graph, summarizing canon as reference material.'
  const documentMode = request.documentMode ?? 'designed_reference'
  const pageSize = request.pageSize ?? (documentMode === 'designed_reference' ? 'a4' : 'letter')
  const imagePolicy = request.imagePolicy ?? (documentMode === 'designed_reference' ? 'inline_entity_images' : 'none')
  const kindLabel = outputKind === 'lore_guide'
    ? 'Lore Guide'
    : outputKind === 'character_dossier_pack'
      ? 'Character Dossier Pack'
      : outputKind === 'world_reference_document'
        ? 'World Reference Document'
        : 'Story Bible'
  const name = `${title} ${kindLabel}`
  const sectionNodes = sections.map((section, index) => nodeBase({
    key: `bible_${section.key}`,
    nodeType: 'text_llm',
    label: section.title,
    x: 900,
    y: 40 + (index % 8) * 165,
    inputs: {
      prompt,
    },
    config: {
      purpose: 'bible_section',
      documentMode,
      pageSize,
      imagePolicy,
      outputKind,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionDescription: section.description,
      sectionOrder: index + 1,
      sectionCount: sections.length,
      skillKeys: ['story_bible_structure', 'canon_reference_voice', 'continuity_documentation', 'world_lore_clarity', 'provider_prompt_hygiene'],
      autoSkillTags: ['reference_document', 'canon', 'story_bible'],
      guidanceMode: 'strict',
      execution: {
        resourceClass: 'llm',
        groupKey: 'story_bible_sections',
        maxConcurrency: 8,
      },
    },
  }))
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 120,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys: selectedSequenceUnitKeys,
        includeWiki: true,
        includeVisualReferences: true,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Reference Skills',
      x: 80,
      y: 280,
      config: {
        skillKeys: ['story_bible_structure', 'canon_reference_voice', 'continuity_documentation', 'world_lore_clarity', 'provider_prompt_hygiene'],
        autoSkillTags: ['reference_document', 'canon', 'story_bible'],
        guidanceMode: 'append',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'bible_section_plan',
      nodeType: 'text_llm',
      label: 'Reference Section Plan',
      x: 420,
      y: 140,
      inputs: { prompt: 'Plan reference-document sections from the current world graph. Do not create fiction prose.' },
      config: {
        purpose: 'bible_section_plan',
        documentMode,
        pageSize,
        imagePolicy,
        outputKind,
        sections,
        skillKeys: ['story_bible_structure', 'canon_reference_voice', 'continuity_documentation', 'world_lore_clarity', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    ...sectionNodes,
    nodeBase({
      key: 'bible_assembly',
      nodeType: 'utility_transform',
      label: 'Assemble Reference',
      x: 1220,
      y: 160,
      config: {
        purpose: 'bible_assembly',
        documentMode,
        pageSize,
        imagePolicy,
        outputKind,
        sections,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'document_render',
      nodeType: 'document_render',
      label: 'Render Reference PDF',
      x: 1500,
      y: 160,
      config: {
        purpose: 'story_bible_document_render',
        documentMode,
        pageSize,
        imagePolicy,
        targetFormat: request.targetFormat,
        execution: { resourceClass: 'document' },
      },
    }),
    nodeBase({
      key: 'artifact',
      nodeType: 'output_artifact',
      label: 'Register Story Bible',
      x: 1780,
      y: 160,
      config: {
        purpose: 'story_bible_artifact',
        documentMode,
        pageSize,
        imagePolicy,
        artifactKind: request.targetFormat === 'pdf' ? 'pdf' : 'manuscript',
        execution: { resourceClass: 'utility' },
      },
    }),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'bible_section_plan', 'context'),
    edgeBase('skill_context', 'guidance', 'bible_section_plan', 'guidance'),
    ...sectionNodes.flatMap((node) => [
      edgeBase('world_context', 'context', node.key, 'context'),
      edgeBase('skill_context', 'guidance', node.key, 'guidance'),
      edgeBase('bible_section_plan', 'plan', node.key, 'sectionPlan'),
      edgeBase(node.key, 'text', 'bible_assembly', 'sections', { sectionOrder: node.config.sectionOrder, sectionKey: node.config.sectionKey }),
    ]),
    edgeBase('bible_assembly', 'text', 'document_render', 'source'),
    edgeBase('document_render', 'document', 'artifact', 'input'),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset: 'story_bible_from_world',
    name,
    description: `Generate a canon-safe ${kindLabel.toLowerCase()} reference PDF/Markdown from the current world graph.`,
    prompt,
    targetFormat: request.targetFormat,
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: selectedSequenceUnitKeys,
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(selectedEntityKeys.length === 0 ? ['No non-sequence entities were found; reference sections will note missing canon areas.'] : []),
      ...(sections.length === 0 ? ['No approved reference sections were selected.'] : []),
    ],
  })
}

export function buildComicIssueFromSequencePlan(request: z.infer<typeof outputWorkflowPlanRequestSchema>) {
  const worldWiki = request.snapshot.worldWiki
  const sequenceUnits = sortedSequenceUnits(request.snapshot.worldEntities)
  const requestedSequenceKeys = request.selectedSequenceUnitKeys.filter(Boolean)
  const selectedSequenceUnitKey = requestedSequenceKeys[0] ?? sequenceUnits[0]?.key ?? 'comic-sequence'
  const selectedSequenceUnit = sequenceUnits.find((entity) => entity.key === selectedSequenceUnitKey) ?? sequenceUnits[0] ?? null
  const selectedEntityKeys = chooseComicEntityKeys({
    selectedEntityKeys: request.selectedEntityKeys,
    selectedSequenceUnitKey,
    sequenceUnit: selectedSequenceUnit,
    worldEntities: request.snapshot.worldEntities,
    worldRelationships: request.snapshot.worldRelationships,
  })
  const pageCount = Math.min(COMIC_PAGE_FANOUT_LIMIT, Math.max(1, request.pageCount ?? DEFAULT_COMIC_PAGE_COUNT))
  const prompt = request.prompt.trim() || 'Create a comic issue from this sequence unit, preserving world canon and generating full comic pages.'
  const title = worldWiki.title || request.snapshot.project.name
  const sequenceTitle = selectedSequenceUnit?.name || 'Selected Sequence'
  const name = `${title} - ${sequenceTitle} Comic`
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
  const pagePromptNodes = pageNumbers.map((pageNumber, index) => nodeBase({
    key: `page_${String(pageNumber).padStart(3, '0')}_prompt`,
    nodeType: 'utility_transform',
    label: `Page ${pageNumber} Prompt`,
    x: 1480,
    y: 40 + (index % 6) * 170,
    inputs: { prompt: `Build a deterministic image prompt from comic script page ${pageNumber}.` },
    config: {
      purpose: 'comic_page_prompt',
      pageNumber,
      pageCount,
      sequenceUnitKey: selectedSequenceUnitKey,
      sequenceUnitName: sequenceTitle,
      deterministic: true,
      execution: { resourceClass: 'utility', groupKey: 'comic_page_prompts', maxConcurrency: 8 },
    },
  }))
  const pageImageNodes = pageNumbers.map((pageNumber, index) => nodeBase({
    key: `page_${String(pageNumber).padStart(3, '0')}_image`,
    nodeType: 'image_generation',
    label: `Page ${pageNumber} Art`,
    x: 1760,
    y: 40 + (index % 6) * 170,
    config: {
      purpose: 'comic_page',
      role: 'comic_page',
      pageNumber,
      pageCount,
      sequenceUnitKey: selectedSequenceUnitKey,
      sequenceUnitName: sequenceTitle,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: resolveOutputImageGenerationQuality({
        requestedQuality: request.imageQuality,
        role: 'comic_page',
        purpose: 'comic_page',
        prompt,
      }),
      outputFormat: resolveOutputImageGenerationOutputFormat({ requestedFormat: request.imageOutputFormat }),
      imageSize: { width: 1600, height: 2480 },
      maxReferenceImages: 6,
      skillKeys: ['storyboard_panel_prompting', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'],
      autoSkillTags: ['comic_page', 'image_prompt', 'visual_only', 'entity_reference', 'reference_continuity'],
      guidanceMode: 'strict',
      execution: { resourceClass: 'image', groupKey: 'comic_pages', maxConcurrency: 8 },
    },
  }))
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 120,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys: [selectedSequenceUnitKey],
        includeWiki: true,
        includeVisualReferences: true,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Comic Skills',
      x: 80,
      y: 280,
      config: {
        skillKeys: ['comic_scene_dramatization', 'comic_page_pacing', 'comic_panel_storytelling', 'comic_dialogue_lettering', 'comic_adaptation_compression', 'storyboard_panel_prompting', 'character_reference_continuity', 'image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        autoSkillTags: ['comic', 'storyboard', 'image_prompt', 'visual_only', 'entity_reference', 'comic_adaptation'],
        guidanceMode: 'append',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'relevant_entities',
      nodeType: 'text_llm',
      label: 'Relevant Entities',
      x: 360,
      y: 100,
      inputs: { prompt: 'Select the entities that must appear in this comic issue and package their visual references.' },
      config: {
        purpose: 'comic_entity_selector',
        sequenceUnitKey: selectedSequenceUnitKey,
        sequenceUnitName: sequenceTitle,
        skillKeys: ['entity_reference_fidelity', 'provider_prompt_hygiene'],
        guidanceMode: 'append',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'comic_scene_script',
      nodeType: 'text_llm',
      label: 'Scene Script',
      x: 640,
      y: 100,
      inputs: { prompt: 'Adapt the selected sequence unit into a rich dramatic scene script for comics.' },
      config: {
        purpose: 'comic_scene_script',
        pageCount,
        sequenceUnitKey: selectedSequenceUnitKey,
        sequenceUnitName: sequenceTitle,
        skillKeys: ['comic_scene_dramatization', 'comic_dialogue_lettering', 'comic_adaptation_compression', 'provider_prompt_hygiene'],
        autoSkillTags: ['comic', 'scene_script', 'adaptation'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'comic_page_plan',
      nodeType: 'text_llm',
      label: 'Page Plan',
      x: 920,
      y: 100,
      inputs: { prompt: `Compress the scene script into exactly ${pageCount} comic pages.` },
      config: {
        purpose: 'comic_page_plan',
        pageCount,
        sequenceUnitKey: selectedSequenceUnitKey,
        sequenceUnitName: sequenceTitle,
        skillKeys: ['comic_page_pacing', 'comic_panel_storytelling', 'comic_adaptation_compression', 'provider_prompt_hygiene'],
        autoSkillTags: ['comic', 'page_plan', 'pacing'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'comic_script',
      nodeType: 'text_llm',
      label: 'Comic Script',
      x: 1200,
      y: 100,
      inputs: { prompt: 'Convert the approved scene script and page plan into strict comic page/panel JSON.' },
      config: {
        purpose: 'comic_script',
        pageCount,
        sequenceUnitKey: selectedSequenceUnitKey,
        sequenceUnitName: sequenceTitle,
        skillKeys: ['comic_panel_storytelling', 'comic_dialogue_lettering', 'storyboard_panel_prompting', 'provider_prompt_hygiene'],
        autoSkillTags: ['comic', 'script', 'storyboard', 'panel_storytelling'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    ...pagePromptNodes,
    ...pageImageNodes,
    nodeBase({
      key: 'comic_pdf_render',
      nodeType: 'document_render',
      label: 'Render Comic PDF',
      x: 2040,
      y: 120,
      config: {
        purpose: 'comic_pdf_render',
        artifactKind: 'comic_pdf',
        pageCount,
        pageSize: '6.625in x 10.25in',
        execution: { resourceClass: 'document' },
      },
    }),
    nodeBase({
      key: 'artifact',
      nodeType: 'output_artifact',
      label: 'Register Comic PDF',
      x: 2320,
      y: 120,
      config: { purpose: 'comic_artifact', artifactKind: 'comic_pdf', execution: { resourceClass: 'utility' } },
    }),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'relevant_entities', 'context'),
    edgeBase('skill_context', 'guidance', 'relevant_entities', 'guidance'),
    edgeBase('world_context', 'context', 'comic_scene_script', 'context'),
    edgeBase('skill_context', 'guidance', 'comic_scene_script', 'guidance'),
    edgeBase('relevant_entities', 'asset_pack', 'comic_scene_script', 'asset_pack'),
    edgeBase('comic_scene_script', 'sceneScript', 'comic_page_plan', 'sceneScript'),
    edgeBase('world_context', 'context', 'comic_page_plan', 'context'),
    edgeBase('skill_context', 'guidance', 'comic_page_plan', 'guidance'),
    edgeBase('relevant_entities', 'asset_pack', 'comic_page_plan', 'asset_pack'),
    edgeBase('comic_scene_script', 'sceneScript', 'comic_script', 'sceneScript'),
    edgeBase('comic_page_plan', 'pagePlan', 'comic_script', 'pagePlan'),
    edgeBase('world_context', 'context', 'comic_script', 'context'),
    edgeBase('skill_context', 'guidance', 'comic_script', 'guidance'),
    edgeBase('relevant_entities', 'asset_pack', 'comic_script', 'asset_pack'),
    ...pagePromptNodes.flatMap((node, index) => [
      edgeBase('comic_script', 'script', node.key, 'script'),
      edgeBase('relevant_entities', 'asset_pack', node.key, 'asset_pack'),
      edgeBase('skill_context', 'guidance', node.key, 'guidance'),
      edgeBase(node.key, 'text', pageImageNodes[index].key, 'prompt'),
      edgeBase(node.key, 'asset_pack', pageImageNodes[index].key, 'asset_pack'),
    ]),
    ...pageImageNodes.flatMap((node) => [
      edgeBase('relevant_entities', 'asset_pack', node.key, 'references'),
      edgeBase('skill_context', 'guidance', node.key, 'guidance'),
      edgeBase(node.key, 'image', 'comic_pdf_render', 'pages', { pageNumber: node.config.pageNumber }),
    ]),
    edgeBase('comic_script', 'text', 'comic_pdf_render', 'source'),
    edgeBase('comic_pdf_render', 'document', 'artifact', 'input'),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset: 'comic_issue_from_sequence',
    name,
    description: 'Generate a comic issue PDF from one selected sequence unit and parallel page art using direct entity reference sheets.',
    prompt,
    targetFormat: 'pdf',
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: [selectedSequenceUnitKey],
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(requestedSequenceKeys.length !== 1 ? ['Comic V1 expects one selected sequence_unit; the first available sequence unit was used.'] : []),
      ...(request.pageCount > COMIC_PAGE_FANOUT_LIMIT ? [`Comic page fan-out is capped at ${COMIC_PAGE_FANOUT_LIMIT} pages in V1.`] : []),
    ],
  })
}

function inferCinematicPresetFamily(prompt: string, outputKind?: z.infer<typeof outputRequestKindSchema> | null): CinematicPresetFamily {
  const lowerPrompt = prompt.toLowerCase()
  if (outputKind === 'ugc_episode') {
    if (promptIncludesAny(lowerPrompt, ['direct response', 'cta', 'conversion', 'ad creative', 'advert'])) return 'ugc_direct_response_ad'
    if (promptIncludesAny(lowerPrompt, ['faceless', 'screen recording', 'app demo', 'product demo'])) return 'ugc_faceless_format'
    return 'ugc_creator'
  }
  if (promptLooksLikeUgcVideo(lowerPrompt)) {
    if (promptIncludesAny(lowerPrompt, ['faceless', 'screen recording', 'app demo', 'product demo'])) return 'ugc_faceless_format'
    if (promptIncludesAny(lowerPrompt, ['direct response', 'cta', 'conversion', 'ad creative', 'advert'])) return 'ugc_direct_response_ad'
    return 'ugc_creator'
  }
  return 'story_movie_tv'
}

function inferCinematicPresetFromKind(outputKind: z.infer<typeof outputRequestKindSchema> | undefined, prompt: string): z.infer<typeof outputWorkflowPresetSchema> {
  if (outputKind === 'ugc_episode' || inferCinematicPresetFamily(prompt, outputKind).startsWith('ugc')) return 'ugc_episode'
  if (outputKind === 'cinematic_trailer' || prompt.toLowerCase().includes('trailer')) return 'cinematic_trailer'
  return 'cinematic_episode_from_sequence'
}

function inferCinematicPresetFromRequest(
  request: z.infer<typeof outputWorkflowPlanRequestSchema>,
  outputKind: z.infer<typeof outputRequestKindSchema> | undefined,
  prompt: string,
): z.infer<typeof outputWorkflowPresetSchema> {
  if (request.sequenceAnimaticMode === 'master_script_only') return 'cinematic_episode_from_sequence'
  return inferCinematicPresetFromKind(outputKind, prompt)
}

function resolveSeedance2Model(resolution: CinematicResolution) {
  return resolution === '1080p'
    ? aiGenerationSettings.outputWorkflow.videoFalHighResolutionModel
    : aiGenerationSettings.outputWorkflow.videoFalModel
}

function resolveDefaultVideoProvider() {
  return aiGenerationSettings.outputWorkflow.videoProviderDefault
}

function resolveDefaultVideoModel(provider: string, resolution: CinematicResolution) {
  return provider === 'muapi'
    ? aiGenerationSettings.outputWorkflow.videoMuapiModel
    : resolveSeedance2Model(resolution)
}

function isCinematicVisualEntity(entity: z.infer<typeof worldEntitySchema> | null | undefined) {
  if (!entity) return false
  if (entity.nodeType === 'sequence_unit' || entity.nodeType === 'event') return false
  return [
    'actor',
    'group',
    'place',
    'object',
    'concept',
    'location_spot',
    'inventory_item',
    'screen_mockup',
    'image_region',
  ].includes(entity.nodeType)
}

function chooseCinematicEntityKeys(input: {
  selectedEntityKeys: string[]
  selectedSequenceUnitKey: string
  sequenceUnit: z.infer<typeof worldEntitySchema> | null
  worldEntities: z.infer<typeof worldEntitySchema>[]
  worldRelationships: z.infer<typeof worldRelationshipSchema>[]
}) {
  const entityByKey = new Map(input.worldEntities.map((entity) => [entity.key, entity]))
  const selectedVisualKeys = input.selectedEntityKeys
    .filter((key) => isCinematicVisualEntity(entityByKey.get(key)))
  if (input.selectedSequenceUnitKey) {
    if (selectedVisualKeys.length > 0) return selectedVisualKeys.slice(0, 12)
    const sequenceText = input.sequenceUnit ? normalizeComicReferenceText(sequenceSearchText(input.sequenceUnit)) : ''
    const referenceStrings = input.sequenceUnit
      ? collectSequenceReferenceStrings(input.sequenceUnit.customProperties)
      : new Set<string>()
    const inferredKeys = new Set<string>()
    for (const entity of input.worldEntities) {
      if (!isCinematicVisualEntity(entity)) continue
      if (entityMentionedBySequence(entity, sequenceText, referenceStrings)) inferredKeys.add(entity.key)
    }
    for (const relationship of input.worldRelationships) {
      if (relationship.sourceEntityKey === input.selectedSequenceUnitKey) {
        const target = entityByKey.get(relationship.targetEntityKey)
        if (isCinematicVisualEntity(target)) inferredKeys.add(relationship.targetEntityKey)
      }
      if (relationship.targetEntityKey === input.selectedSequenceUnitKey) {
        const source = entityByKey.get(relationship.sourceEntityKey)
        if (isCinematicVisualEntity(source)) inferredKeys.add(relationship.sourceEntityKey)
      }
    }
    return [...inferredKeys].slice(0, 12)
  }
  const keys = chooseComicEntityKeys(input)
    .filter((key) => isCinematicVisualEntity(entityByKey.get(key)))
    .slice(0, 16)
  if (keys.length > 0) return keys
  return input.worldEntities
    .filter(isCinematicVisualEntity)
    .map((entity) => entity.key)
    .slice(0, 12)
}

export function buildCinematicV3ScriptStoryboardPlan(
  request: z.infer<typeof outputWorkflowPlanRequestSchema>,
  outputKind?: z.infer<typeof outputRequestKindSchema>,
) {
  const worldWiki = request.snapshot.worldWiki
  const sequenceUnits = sortedSequenceUnits(request.snapshot.worldEntities)
  const requestedSequenceKeys = request.selectedSequenceUnitKeys.filter(Boolean)
  const selectedSequenceUnitKey = requestedSequenceKeys[0] ?? ''
  const selectedSequenceUnit = selectedSequenceUnitKey
    ? sequenceUnits.find((entity) => entity.key === selectedSequenceUnitKey) ?? null
    : null
  const sourceSequenceUnitKeys = selectedSequenceUnitKey ? [selectedSequenceUnitKey] : []
  const selectedEntityKeys = chooseCinematicEntityKeys({
    selectedEntityKeys: request.selectedEntityKeys,
    selectedSequenceUnitKey,
    sequenceUnit: selectedSequenceUnit,
    worldEntities: request.snapshot.worldEntities,
    worldRelationships: request.snapshot.worldRelationships,
  })
  const prompt = request.prompt.trim() || 'Create a directed cinematic storyboard sequence from this world context.'
  const presetFamily = request.cinematicPresetFamily ?? inferCinematicPresetFamily(prompt, outputKind)
  const preset = inferCinematicPresetFromRequest(request, outputKind, prompt)
  const aspectRatio: CinematicAspectRatio = request.aspectRatio ?? '16:9'
  const resolution: CinematicResolution = request.videoResolution ?? '720p'
  const cinematicReferenceMode: CinematicReferenceMode = request.cinematicReferenceMode ?? 'storyboard_sheet'
  const debugSkipVideoGeneration = request.debugSkipVideoGeneration ?? true
  const sequenceAnimaticMode = request.sequenceAnimaticMode
  const cinematicAnimaticMode = request.cinematicAnimaticMode
  const fullSequenceUnitAnimatic = sequenceAnimaticMode === 'master_script_only'
  const promptCinematicAnimatic = cinematicAnimaticMode === 'prompt_cinematic_master'
  const screenplayAnimaticMaster = fullSequenceUnitAnimatic || promptCinematicAnimatic
  const videoProvider = resolveDefaultVideoProvider()
  const videoModel = resolveDefaultVideoModel(videoProvider, resolution)
  const title = worldWiki.title || request.snapshot.project.name
  const sequenceTitle = selectedSequenceUnit?.name || ''
  const name = preset === 'cinematic_trailer'
    ? `${title} Cinematic Trailer`
    : preset === 'ugc_episode'
      ? `${title} UGC Cinematic`
    : sequenceTitle
      ? `${title} - ${sequenceTitle} Cinematic`
      : `${title} Cinematic`
  const maxShotCount = screenplayAnimaticMaster ? sequenceAnimaticMasterMaxShotCount : deriveCinematicV2MaxShotCount(null)
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 120,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys,
        includeWiki: true,
        includeVisualReferences: true,
        strictSourceEntityFilter: sourceSequenceUnitKeys.length > 0,
        sequenceAnimaticMode,
        cinematicAnimaticMode,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Cinematic Skills',
      x: 80,
      y: 300,
      config: {
        skillKeys: [
          'cinematic_screenwriting_craft',
          'cinematic_sequence_structure',
          'cinematic_directorial_language',
          'cinematic_shot_direction',
          'cinematic_beat_sheet_planning',
          'storyboard_panel_accuracy',
          'entity_reference_fidelity',
          'character_reference_continuity',
          'environment_staging',
          'provider_prompt_hygiene',
        ],
        autoSkillTags: ['cinematic_v3', 'screenplay', 'shot_json', 'storyboard', 'panel_grid', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'cinematic_entities',
      nodeType: 'text_llm',
      label: 'Cinematic References',
      x: 360,
      y: 120,
      inputs: { prompt: 'Select canonical references for this cinematic scene.' },
      config: {
        purpose: 'cinematic_entity_selector',
        sequenceUnitKey: selectedSequenceUnitKey,
        sequenceUnitName: sequenceTitle,
        skillKeys: ['entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'],
        guidanceMode: 'append',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'cinematic_v3_reference_select',
      nodeType: 'text_llm',
      label: 'Reference Plan',
      x: 680,
      y: 120,
      inputs: { prompt: 'Select the reference plan for this cinematic storyboard.' },
      config: {
        purpose: 'cinematic_v3_reference_select',
        cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
        maxReferenceCount: 16,
        guidanceMode: 'append',
        execution: { resourceClass: 'llm', groupKey: 'cinematic_v3_planning', maxConcurrency: 1 },
      },
    }),
    nodeBase({
      key: 'cinematic_v3_screenplay_author',
      nodeType: 'text_llm',
      label: 'Author Screenplay',
      x: 1000,
      y: 120,
      inputs: { prompt: 'Author the creative screenplay treatment for this cinematic.' },
      config: {
        purpose: 'cinematic_v3_screenplay_author',
        cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
        presetFamily,
        sequenceAnimaticMode,
        cinematicAnimaticMode,
        maxShotCount,
        skillKeys: ['cinematic_screenwriting_craft', 'cinematic_sequence_structure', 'provider_prompt_hygiene'],
        guidanceMode: 'append',
        execution: { resourceClass: 'llm', groupKey: 'cinematic_v3_planning', maxConcurrency: 1 },
      },
    }),
    ...(screenplayAnimaticMaster
      ? [
        nodeBase({
          key: 'sequence_animatic_scene_graph_assignment',
          nodeType: 'utility_transform',
          label: 'Scene Graph Assignment',
          x: 1320,
          y: 120,
          inputs: { prompt: 'Assign screenplay scenes to world locations, output-local sets, zones, and spots.' },
          config: {
            purpose: 'sequence_animatic_scene_graph_assignment',
            role: 'sequence_animatic_scene_graph_assignment',
            graphSpecVersion: 'sequence_animatic_graph_v2',
            cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
            presetFamily,
            maxShotCount,
            sequenceAnimaticMode,
            cinematicAnimaticMode,
            aspectRatio,
            resolution,
            execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_scene_graph_assignment', maxConcurrency: 1 },
          },
        }),
        nodeBase({
          key: 'sequence_animatic_scene_register',
          nodeType: 'utility_transform',
          label: 'Register Scenes',
          x: 1640,
          y: 120,
          config: {
            purpose: 'sequence_animatic_scene_register',
            role: 'sequence_animatic_scene_register',
            graphSpecVersion: 'sequence_animatic_graph_v2',
            cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
            presetFamily,
            maxShotCount,
            sequenceAnimaticMode,
            cinematicAnimaticMode,
            aspectRatio,
            resolution,
            autoStartFirstScene: true,
            execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_register', maxConcurrency: 1 },
          },
        }),
      ]
      : [
        nodeBase({
          key: 'cinematic_v3_shot_break_plan',
          nodeType: 'utility_transform',
          label: 'Plan Shot Breaks',
          x: 1320,
          y: 120,
          inputs: { prompt: 'Extract screenplay shot markers and storyboard/video parse groups.' },
          config: {
            purpose: 'cinematic_v3_shot_break_plan',
            cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
            maxShotCount,
            sequenceAnimaticMode,
            cinematicAnimaticMode,
            aspectRatio,
            resolution,
            maxPanelsPerSheet: 9,
            maxDurationPerGroupSeconds: 15,
            execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_shot_break_plan', maxConcurrency: 1 },
          },
        }),
        nodeBase({
          key: 'cinematic_v3_dynamic_shot_parse_fanout',
          nodeType: 'utility_transform',
          label: 'Materialize Shot Parses',
          x: 1640,
          y: 120,
          config: {
            purpose: 'cinematic_v3_dynamic_shot_parse_fanout',
            role: 'dynamic_cinematic_v3_shot_parse_fanout',
            cinematicPipelineVersion: 'v3_script_storyboards' satisfies CinematicPipelineVersion,
            maxShotCount,
            sequenceAnimaticMode,
            cinematicAnimaticMode,
            aspectRatio,
            resolution,
            maxPanelsPerSheet: 9,
            maxDurationPerGroupSeconds: 15,
            cinematicReferenceMode,
            videoProvider,
            videoModel,
            debugSkipVideoGeneration,
            execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_dynamic_shot_parse_fanout', maxConcurrency: 1 },
          },
        }),
      ]),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'cinematic_entities', 'context'),
    edgeBase('skill_context', 'guidance', 'cinematic_entities', 'guidance'),
    edgeBase('world_context', 'context', 'cinematic_v3_reference_select', 'context'),
    edgeBase('skill_context', 'guidance', 'cinematic_v3_reference_select', 'guidance'),
    edgeBase('cinematic_entities', 'asset_pack', 'cinematic_v3_reference_select', 'asset_pack'),
    edgeBase('world_context', 'context', 'cinematic_v3_screenplay_author', 'context'),
    edgeBase('skill_context', 'guidance', 'cinematic_v3_screenplay_author', 'guidance'),
    edgeBase('cinematic_v3_reference_select', 'asset_pack', 'cinematic_v3_screenplay_author', 'asset_pack'),
    ...(screenplayAnimaticMaster
      ? [
        edgeBase('world_context', 'context', 'sequence_animatic_scene_graph_assignment', 'context'),
        edgeBase('skill_context', 'guidance', 'sequence_animatic_scene_graph_assignment', 'guidance'),
        edgeBase('cinematic_v3_reference_select', 'asset_pack', 'sequence_animatic_scene_graph_assignment', 'asset_pack'),
        edgeBase('cinematic_v3_screenplay_author', 'text', 'sequence_animatic_scene_graph_assignment', 'screenplay'),
        edgeBase('world_context', 'context', 'sequence_animatic_scene_register', 'context'),
        edgeBase('skill_context', 'guidance', 'sequence_animatic_scene_register', 'guidance'),
        edgeBase('cinematic_v3_reference_select', 'asset_pack', 'sequence_animatic_scene_register', 'asset_pack'),
        edgeBase('cinematic_v3_screenplay_author', 'text', 'sequence_animatic_scene_register', 'screenplay'),
        edgeBase('sequence_animatic_scene_graph_assignment', 'scene_package', 'sequence_animatic_scene_register', 'scene_package'),
      ]
      : [
        edgeBase('world_context', 'context', 'cinematic_v3_shot_break_plan', 'context'),
        edgeBase('skill_context', 'guidance', 'cinematic_v3_shot_break_plan', 'guidance'),
        edgeBase('cinematic_v3_reference_select', 'asset_pack', 'cinematic_v3_shot_break_plan', 'asset_pack'),
        edgeBase('cinematic_v3_screenplay_author', 'text', 'cinematic_v3_shot_break_plan', 'screenplay'),
        edgeBase('world_context', 'context', 'cinematic_v3_dynamic_shot_parse_fanout', 'context'),
        edgeBase('skill_context', 'guidance', 'cinematic_v3_dynamic_shot_parse_fanout', 'guidance'),
        edgeBase('cinematic_v3_reference_select', 'asset_pack', 'cinematic_v3_dynamic_shot_parse_fanout', 'asset_pack'),
        edgeBase('cinematic_v3_screenplay_author', 'text', 'cinematic_v3_dynamic_shot_parse_fanout', 'screenplay'),
        edgeBase('cinematic_v3_shot_break_plan', 'text', 'cinematic_v3_dynamic_shot_parse_fanout', 'shot_break_plan'),
      ]),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset,
    name,
    description: 'Generate a simplified cinematic storyboard animatic from references, authored screenplay, direct shot JSON, grouped storyboard sheets, and extracted timeline panels.',
    prompt,
    targetFormat: 'video',
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys,
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(screenplayAnimaticMaster
        ? ['Sequence animatic scene-graph assignment mode is enabled: the creative screenplay is assigned to output-local scene graph packages and scenes are registered; each scene then runs as its own child shot-plan workflow (scene-by-scene), with the combined shot continuity plan assembled incrementally as scenes complete.']
        : ['Cinematics V3 is enabled: screenplay authors mark shot breaks, parse groups run in parallel, then merged timed shot JSON materializes grouped storyboard sheets.']),
      'V3 omits scene-state, layout, per-shot asset-pack, keyframe QA, and per-shot video nodes for a smaller graph.',
      'Storyboard sheets use deterministic V3 crop grids: 1x1 for one panel, 1x2 for two, 2x2 for three to four, 2x3 for five to six, and 3x3 for seven to nine panels.',
      'Video production remains approval-gated and is deferred from the initial storyboard pass.',
      ...(fullSequenceUnitAnimatic
        ? ['Sequence-unit screenplay animatic mode is enabled: author the selected chapter as a fuller screenplay from its synopsis, dramatic question, outcome, arc deltas, consequences, open loops, and visual identity before storyboard grouping.']
        : []),
      ...(promptCinematicAnimatic
        ? ['Prompt cinematic screenplay animatic mode is enabled: create a master screenplay/shot-block manifest first; storyboard, block video, and shot video generation are manual child workflows.']
        : []),
    ],
  })
}

export function buildCinematicSequencePlan(
  request: z.infer<typeof outputWorkflowPlanRequestSchema>,
  outputKind?: z.infer<typeof outputRequestKindSchema>,
) {
  const requestedSequenceKeys = request.selectedSequenceUnitKeys.filter(Boolean)
  const selectedSequenceUnitKey = requestedSequenceKeys[0] ?? ''
  if (request.cinematicPipelineVersion === 'v1_take_blocks' || request.cinematicPipelineVersion === 'v2_shot_orchestration') {
    throw new Error('Legacy cinematic pipelines v1_take_blocks and v2_shot_orchestration are retired for new workflow planning.')
  }
  if (!request.sequenceAnimaticMode && selectedSequenceUnitKey) {
    request = {
      ...request,
      cinematicPipelineVersion: request.cinematicPipelineVersion ?? 'v3_script_storyboards',
      sequenceAnimaticMode: 'master_script_only',
      cinematicAnimaticMode: undefined,
    }
  } else if (!request.sequenceAnimaticMode && !request.cinematicAnimaticMode) {
    request = {
      ...request,
      cinematicPipelineVersion: request.cinematicPipelineVersion ?? 'v3_script_storyboards',
      cinematicAnimaticMode: 'prompt_cinematic_master',
    }
  }
  return buildCinematicV3ScriptStoryboardPlan(request, outputKind)
}

export function buildImageOutputPlan(
  request: z.infer<typeof outputWorkflowPlanRequestSchema>,
  outputKind: 'concept_art_image' | 'poster_image' = 'concept_art_image',
) {
  const worldWiki = request.snapshot.worldWiki
  const boundScope = bindOutputPromptWorldScope({
    prompt: request.prompt,
    worldEntities: request.snapshot.worldEntities,
    selectedEntityKeys: request.selectedEntityKeys,
    selectedSequenceUnitKeys: request.selectedSequenceUnitKeys,
  })
  const selectedEntityKeys = boundScope.selectedEntityKeys
  const selectedSequenceUnitKeys = boundScope.selectedSequenceUnitKeys.slice(0, 3)
  const selectedEntityTypes = request.snapshot.worldEntities
    .filter((entity) => selectedEntityKeys.includes(entity.key))
    .map((entity) => entity.nodeType)
  const title = worldWiki.title || request.snapshot.project.name
  const poster = outputKind === 'poster_image'
  const prompt = request.prompt.trim() || (poster
    ? `Create a finished poster image from ${title}.`
    : `Create concept art from ${title}.`)
  const name = poster ? `${title} Poster Image` : `${title} Concept Art`
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 140,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys: selectedSequenceUnitKeys,
        includeWiki: true,
        includeVisualReferences: true,
        strictSourceEntityFilter: true,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Image Skills',
      x: 80,
      y: 300,
      config: {
        skillKeys: ['image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        autoSkillTags: ['image_prompt', 'visual_only', 'entity_reference', 'environment', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'visual_prompt',
      nodeType: 'text_llm',
      label: poster ? 'Poster Prompt' : 'Image Prompt',
      x: 360,
      y: 120,
      inputs: { prompt },
      config: {
        purpose: poster ? 'poster_prompt' : 'concept_art_prompt',
        outputKind,
        skillKeys: ['image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'image_references',
      nodeType: 'text_llm',
      label: 'Image References',
      x: 360,
      y: 320,
      inputs: { prompt: 'Select canonical entity image references for this image output.' },
      config: {
        purpose: 'image_reference_selector',
        outputKind,
        skillKeys: ['entity_reference_fidelity', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'generated_image',
      nodeType: 'image_generation',
      label: poster ? 'Poster Image' : 'Concept Image',
      x: 660,
      y: 180,
      inputs: { prompt },
      config: {
        purpose: outputKind,
        role: outputKind,
        model: 'openai/gpt-image-2',
        referenceModel: 'openai/gpt-image-2/edit',
        quality: resolveOutputImageGenerationQuality({
          requestedQuality: request.imageQuality,
          outputKind,
          role: outputKind,
          purpose: outputKind,
          prompt,
          selectedEntityTypes,
        }),
        outputFormat: resolveOutputImageGenerationOutputFormat({ requestedFormat: request.imageOutputFormat }),
        imageSize: poster ? { width: 1792, height: 2688 } : { width: 1536, height: 1536 },
        skillKeys: ['image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'image', groupKey: outputKind, maxConcurrency: 2 },
      },
    }),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'visual_prompt', 'context'),
    edgeBase('skill_context', 'guidance', 'visual_prompt', 'guidance'),
    edgeBase('world_context', 'context', 'image_references', 'context'),
    edgeBase('skill_context', 'guidance', 'image_references', 'guidance'),
    edgeBase('image_references', 'asset_pack', 'visual_prompt', 'asset_pack'),
    edgeBase('visual_prompt', 'text', 'generated_image', 'prompt'),
    edgeBase('image_references', 'asset_pack', 'generated_image', 'references'),
    edgeBase('skill_context', 'guidance', 'generated_image', 'guidance'),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset: 'composite_reference',
    name,
    description: poster
      ? 'Generate poster/key art from world graph context and selected entities.'
      : 'Generate concept art from world graph context and selected entities.',
    prompt,
    targetFormat: 'image',
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: selectedSequenceUnitKeys,
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(selectedEntityKeys.length === 0 ? ['No prompt-bound entities were matched for this image request; the workflow will use project style and prompt text without unrelated entity references.'] : []),
    ],
  })
}

function withOutputWorkflowUsageEstimate(plan: z.infer<typeof outputWorkflowPlanResponseSchema>['plan']) {
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    ...plan,
    usageEstimate: estimateOutputWorkflowUsage(plan),
  })
}

export function planOutputRequestWorkflow(request: z.input<typeof outputWorkflowPlanRequestSchema>, outputKind: z.infer<typeof outputRequestKindSchema>) {
  const parsedRequest = outputWorkflowPlanRequestSchema.parse(request)
  if (outputKind === 'concept_art_image' || outputKind === 'poster_image') {
    return withOutputWorkflowUsageEstimate(buildImageOutputPlan(parsedRequest, outputKind))
  }
  if (
    outputKind === 'story_bible_from_world'
    || outputKind === 'world_reference_document'
    || outputKind === 'lore_guide'
    || outputKind === 'character_dossier_pack'
  ) {
    return withOutputWorkflowUsageEstimate(buildStoryBibleFromWorldPlan(parsedRequest, outputKind))
  }
  if (outputKind === 'comic_issue_from_sequence') {
    return withOutputWorkflowUsageEstimate(buildComicIssueFromSequencePlan(parsedRequest))
  }
  if (outputKind === 'cinematic_episode' || outputKind === 'cinematic_trailer' || outputKind === 'ugc_episode') {
    return withOutputWorkflowUsageEstimate(buildCinematicSequencePlan(parsedRequest, outputKind))
  }
  if (outputKind === 'short_story' || outputKind === 'narrative_chapter_or_ebook') {
    return withOutputWorkflowUsageEstimate(buildEbookFromWorldPlan({
      ...parsedRequest,
      prompt: outputKind === 'short_story'
        ? `${parsedRequest.prompt}\n\nOutput request: create a shorter story-style document rather than a full-length book. Keep the workflow document/PDF-oriented and preserve canon.`
        : parsedRequest.prompt,
    }))
  }
  return planOutputWorkflow(parsedRequest)
}

export function planOutputWorkflow(request: z.input<typeof outputWorkflowPlanRequestSchema>) {
  const parsedRequest = outputWorkflowPlanRequestSchema.parse(request)
  const lowerPrompt = parsedRequest.prompt.toLowerCase()
  if (parsedRequest.preset === 'comic_issue_from_sequence' || lowerPrompt.includes('comic')) {
    return withOutputWorkflowUsageEstimate(buildComicIssueFromSequencePlan(parsedRequest))
  }
  if (
    parsedRequest.preset === 'cinematic_episode_from_sequence'
    || parsedRequest.preset === 'cinematic_trailer'
    || parsedRequest.preset === 'ugc_episode'
    || promptLooksCinematic(lowerPrompt)
  ) {
    const classification = classifyOutputPrompt(parsedRequest.prompt)
    const outputKind = classification.outputKind === 'cinematic_episode'
      || classification.outputKind === 'cinematic_trailer'
      || classification.outputKind === 'ugc_episode'
      ? classification.outputKind
      : parsedRequest.preset === 'ugc_episode'
        ? 'ugc_episode'
        : parsedRequest.preset === 'cinematic_trailer'
          ? 'cinematic_trailer'
          : 'cinematic_episode'
    return withOutputWorkflowUsageEstimate(buildCinematicSequencePlan(parsedRequest, outputKind))
  }
  if (parsedRequest.preset === 'story_bible_from_world' || promptIncludesAny(lowerPrompt, ['story bible', 'world bible', 'series bible', 'reference document', 'lore guide', 'character dossier'])) {
    const classification = classifyOutputPrompt(parsedRequest.prompt)
    const outputKind = classification.outputKind === 'world_reference_document'
      || classification.outputKind === 'lore_guide'
      || classification.outputKind === 'character_dossier_pack'
      ? classification.outputKind
      : 'story_bible_from_world'
    return withOutputWorkflowUsageEstimate(buildStoryBibleFromWorldPlan(parsedRequest, outputKind))
  }
  if (
    parsedRequest.preset === 'composite_reference'
    || lowerPrompt.includes('poster')
    || lowerPrompt.includes('concept art')
    || lowerPrompt.includes('character art')
    || lowerPrompt.includes('environment art')
  ) {
    return withOutputWorkflowUsageEstimate(buildImageOutputPlan(parsedRequest, lowerPrompt.includes('poster') ? 'poster_image' : 'concept_art_image'))
  }
  return withOutputWorkflowUsageEstimate(buildEbookFromWorldPlan(parsedRequest))
}

export type OutputWorkflow = z.infer<typeof outputWorkflowSchema>
export type OutputWorkflowNode = z.infer<typeof outputWorkflowNodeSchema>
export type OutputWorkflowEdge = z.infer<typeof outputWorkflowEdgeSchema>
export type OutputWorkflowRun = z.infer<typeof outputWorkflowRunSchema>
export type OutputWorkflowRunStep = z.infer<typeof outputWorkflowRunStepSchema>
export type OutputArtifact = z.infer<typeof outputArtifactSchema>
export type OutputRequest = z.infer<typeof outputRequestSchema>
export type OutputRequestKind = z.infer<typeof outputRequestKindSchema>
export type OutputRequestStatus = z.infer<typeof outputRequestStatusSchema>
export type OutputWorkflowPreset = z.infer<typeof outputWorkflowPresetSchema>
export type OutputPromptPlannerResult = z.infer<typeof outputPromptPlannerResultSchema>
export type OutputWorkflowPlanRequest = z.infer<typeof outputWorkflowPlanRequestSchema>
export type OutputWorkflowPlanResponse = z.infer<typeof outputWorkflowPlanResponseSchema>
export type OutputWorkflowStartResponse = z.infer<typeof outputWorkflowStartResponseSchema>
export type OutputWorkflowRunStatusResponse = z.infer<typeof outputWorkflowRunStatusResponseSchema>
export type SequenceAnimaticBlockWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticBlockWorkflowEnsureResponseSchema>
export type SequenceAnimaticSceneWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticSceneWorkflowEnsureResponseSchema>
export type SequenceAnimaticContinuityWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticContinuityWorkflowEnsureResponseSchema>
export type SequenceAnimaticContinuityBlockDeriveResponse = z.infer<typeof sequenceAnimaticContinuityBlockDeriveResponseSchema>
export type SequenceAnimaticContinuityStructureDeriveResponse = z.infer<typeof sequenceAnimaticContinuityStructureDeriveResponseSchema>
export type SequenceAnimaticContinuityAssetWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema>
export type SequenceAnimaticKeyframeWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticKeyframeWorkflowEnsureResponseSchema>
export type SequenceAnimaticShotProductionGraphEnsureResponse = z.infer<typeof sequenceAnimaticShotProductionGraphEnsureResponseSchema>
export type SequenceAnimaticZoneCoverageBoardEnsureResponse = z.infer<typeof sequenceAnimaticZoneCoverageBoardEnsureResponseSchema>
export type SequenceAnimaticCoverageIntentRecord = z.infer<typeof sequenceAnimaticCoverageIntentRecordSchema>
export type SequenceAnimaticShotCoverageIntentEnsureResponse = z.infer<typeof sequenceAnimaticShotCoverageIntentEnsureResponseSchema>
export type SequenceAnimaticSceneBoardPrepRun = z.infer<typeof sequenceAnimaticSceneBoardPrepRunSchema>
export type SequenceAnimaticSceneBoardPrepResponse = z.infer<typeof sequenceAnimaticSceneBoardPrepResponseSchema>
export type SequenceAnimaticSceneBoardWorkflowCommandAction = z.infer<typeof sequenceAnimaticSceneBoardWorkflowCommandActionSchema>
export type SequenceAnimaticSceneBoardWorkflowCommandResponse = z.infer<typeof sequenceAnimaticSceneBoardWorkflowCommandResponseSchema>
export type SequenceAnimaticSceneGraphNodeKind = z.infer<typeof sequenceAnimaticSceneGraphNodeKindSchema>
export type SequenceAnimaticSceneGraphNodeOverride = z.infer<typeof sequenceAnimaticSceneGraphNodeOverrideSchema>
export type SequenceAnimaticSceneGraphOverrides = z.infer<typeof sequenceAnimaticSceneGraphOverridesSchema>
export type SequenceAnimaticSceneGraphNodeUpdateRequest = z.infer<typeof sequenceAnimaticSceneGraphNodeUpdateRequestSchema>
export type SequenceAnimaticSceneGraphNodeUpdateResponse = z.infer<typeof sequenceAnimaticSceneGraphNodeUpdateResponseSchema>
export type SequenceAnimaticShotRevisionWorkflowEnsureResponse = z.infer<typeof sequenceAnimaticShotRevisionWorkflowEnsureResponseSchema>
export type SequenceAnimaticStateResponse = z.infer<typeof sequenceAnimaticStateResponseSchema>
export type OutputWorkflowGraphRequest = z.infer<typeof outputWorkflowGraphRequestSchema>
export type OutputWorkflowGraphResponse = z.infer<typeof outputWorkflowGraphResponseSchema>
export type OutputWorkflowNodeOutputResponse = z.infer<typeof outputWorkflowNodeOutputResponseSchema>
export type OutputWorkflowCancelResponse = z.infer<typeof outputWorkflowCancelResponseSchema>
export type OutputRequestStatusResponse = z.infer<typeof outputRequestStatusResponseSchema>
export type OutputFeedResponse = z.infer<typeof outputFeedResponseSchema>
export type OutputRequestStatusProjection = z.infer<typeof outputRequestStatusProjectionSchema>
export type OutputRequestDeleteResponse = z.infer<typeof outputRequestDeleteResponseSchema>
export type OutputWorkflowRepairRequest = z.infer<typeof outputWorkflowRepairRequestSchema>
export type OutputWorkflowRepairResponse = z.infer<typeof outputWorkflowRepairResponseSchema>
export type OutputWorkflowNodeUpdateRequest = z.infer<typeof outputWorkflowNodeUpdateRequestSchema>
export type OutputWorkflowNodeUpdateResponse = z.infer<typeof outputWorkflowNodeUpdateResponseSchema>
export type OutputWorkflowUpgradeResponse = z.infer<typeof outputWorkflowUpgradeResponseSchema>
