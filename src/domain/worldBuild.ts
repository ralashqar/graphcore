import { z } from 'zod'
import {
  actionBeatSchema,
  audioBeatSchema,
  cinematicBackdropRoleSchema,
  cinematicCreativeTreatmentSchema,
  cinematicDirectingPackageSchema,
  cinematicDominantTriggerSchema,
  cinematicDownstreamUseSchema,
  cinematicFormatSubtypeSchema,
  cinematicFormulaFamilySchema,
  cinematicHookFamilySchema,
  cinematicHookRoleSchema,
  cinematicStoryLanguagePresetSchema,
  cinematicStoryScenePresetSchema,
  cinematicNarrationModeSchema,
  cinematicAuthorshipPipelineSchema,
  cinematicPlatformTargetSchema,
  cinematicPresetFamilySchema,
  cinematicReferencePlanSchema,
  cinematicReferenceRoleSchema,
  cinematicScriptDocSchema,
  cinematicRelationshipSchema,
  cinematicRunSchema,
  dialogueBeatSchema,
  storyboardSpecSchema,
} from './cinematics.ts'

const normalizeEnumCandidate = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
function coerceEnumLikeValue<TOption extends string>(options: readonly TOption[]) {
  return (value: unknown) => {
    if (value === null || value === undefined) return value
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (options.includes(trimmed as TOption)) return trimmed
    const normalized = normalizeEnumCandidate(trimmed)
    const matched = options.find((option) => normalizeEnumCandidate(option) === normalized)
    return matched ?? null
  }
}

const defaultCinematicDirectingPackage = () => ({
  subjectAnchor: '',
  dominantAction: '',
  primaryCameraMove: '',
  styleDirectives: [] as string[],
  continuityConstraints: [] as string[],
  proofSurfaceRole: '',
})

const defaultCinematicReferencePlan = () => ({
  requiredRoles: [] as Array<'subject_lock' | 'prop_lock' | 'environment_lock' | 'composite_lock' | 'board_lock' | 'style_lock' | 'proof_surface_lock'>,
  preferredPrimaryRefRole: null as 'subject_lock' | 'prop_lock' | 'environment_lock' | 'composite_lock' | 'board_lock' | 'style_lock' | 'proof_surface_lock' | null,
  maxReferenceCount: 6,
  dropOrder: [] as Array<'subject_lock' | 'prop_lock' | 'environment_lock' | 'composite_lock' | 'board_lock' | 'style_lock' | 'proof_surface_lock'>,
})

export const WORLD_BUILD_ENVIRONMENT_VIEWS = ['hero', 'wide_alt', 'detail_area'] as const

export const worldBuildPlanItemKindSchema = z.enum(['character', 'environment', 'item', 'narrative_graph', 'cinematic_graph'])
export const worldBuildBatchStatusSchema = z.enum(['planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const worldBuildJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped'])
export const resourceGenerationStateSchema = z.enum(['pending', 'running', 'completed', 'failed'])
export const worldBuildPlannerModeSchema = z.enum(['world_build', 'cinematic_build', 'direct_asset_generation'])
export const conceptArtModeSchema = z.enum(['showcase', 'design_sheet', 'continuity', 'proof_surface'])

export const worldBuildGenerationOptionsSchema = z.object({
  generateConceptImage: z.boolean().optional(),
  generateConceptGallery: z.boolean().optional(),
  environmentViews: z.array(z.enum(WORLD_BUILD_ENVIRONMENT_VIEWS)).optional(),
  existingDefinitionKey: z.string().min(1).optional(),
  existingAssetKey: z.string().min(1).nullable().optional(),
  conceptArtMode: conceptArtModeSchema.optional(),
  conceptVariantSet: z.array(z.string().min(1)).optional(),
  captureProfileOverride: z.string().min(1).nullable().optional(),
}).default({})

export const worldBuildPlanItemSchema = z.object({
  id: z.string(),
  kind: worldBuildPlanItemKindSchema,
  name: z.string(),
  summary: z.string(),
  dependsOn: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  generationOptions: worldBuildGenerationOptionsSchema,
})

export const cinematicEntityRefSchema = z.object({
  id: z.string(),
  kind: z.enum(['character', 'environment', 'item']),
  role: z.string(),
  sourceName: z.string(),
  summary: z.string().default(''),
  resolution: z.enum(['existing', 'create']),
  definitionKey: z.string().nullable().optional(),
  planItemId: z.string().nullable().optional(),
  referenceRole: cinematicReferenceRoleSchema.nullable().optional(),
  downstreamUse: cinematicDownstreamUseSchema.nullable().optional(),
  captureProfile: z.string().nullable().optional(),
  conceptArtMode: conceptArtModeSchema.nullable().optional(),
  conceptVariantSet: z.array(z.string()).optional(),
})

export const cinematicCompositeRefPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  relationshipType: z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of']).default('equip'),
  sourceRefIds: z.array(z.string()).min(2),
  generationPrompt: z.string().default(''),
  outputAssetKey: z.string().nullable().default(null),
  stagingNotes: z.string().default(''),
  priority: z.number().int().min(0).max(100).default(80),
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
})

export const cinematicShotPlanSchema = z.object({
  id: z.string(),
  sceneId: z.string().nullable().default(null),
  title: z.string(),
  beat: z.string().default(''),
  hookRole: cinematicHookRoleSchema.nullable().default(null),
  storyScenePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryScenePresetSchema.options), cinematicStoryScenePresetSchema.nullable()).default(null),
  storyLanguagePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryLanguagePresetSchema.options), cinematicStoryLanguagePresetSchema.nullable()).default(null),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
  variationGroupId: z.string().default(''),
  variationLabel: z.string().default(''),
  shotJob: z.string().default(''),
  targetDurationSeconds: z.number().int().positive().max(15).nullable().default(null),
  minDurationSeconds: z.number().int().positive().max(15).nullable().default(null),
  maxDurationSeconds: z.number().int().positive().max(15).nullable().default(null),
  cutTrigger: z.string().default(''),
  communicationGoal: z.string().default(''),
  hookType: z.string().default(''),
  targetEmotion: z.string().default(''),
  personaStyle: z.string().default(''),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  proofType: z.string().default(''),
  ctaType: z.string().default(''),
  platformTarget: cinematicPlatformTargetSchema.nullable().default(null),
  participantRefIds: z.array(z.string()).default([]),
  locationRefId: z.string().nullable().default(null),
  propRefIds: z.array(z.string()).default([]),
  backdropRefIds: z.array(z.string()).default([]),
  requiredSourceRefIds: z.array(z.string()).default([]),
  compositeRefIds: z.array(z.string()).default([]),
  storyboardRefIds: z.array(z.string()).default([]),
  directingPackage: cinematicDirectingPackageSchema.default(defaultCinematicDirectingPackage),
  referencePlan: cinematicReferencePlanSchema.default(defaultCinematicReferencePlan),
  shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
  framing: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMovement: z.string().default(''),
  lensPreference: z.string().default(''),
  durationSeconds: z.number().int().positive().max(15).nullable().default(null),
  stillAtSeconds: z.number().nonnegative().nullable().default(null),
  forceTakeBreak: z.boolean().default(false),
  visualPrompt: z.string().default(''),
  compositionGuide: z.string().default(''),
  beats: z.array(z.object({
    id: z.string(),
    type: z.enum(['action', 'dialogue', 'audio', 'camera', 'transition', 'custom']).default('custom'),
    summary: z.string().default(''),
    startSeconds: z.number().nonnegative().nullable().default(null),
    endSeconds: z.number().nonnegative().nullable().default(null),
  })).default([]),
  dialogue: z.array(dialogueBeatSchema).default([]),
  actions: z.array(actionBeatSchema).default([]),
  audio: z.array(audioBeatSchema).default([]),
})

export const cinematicGraphSettingsSchema = z.object({
  stillAspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']).optional(),
  stillResolution: z.enum(['1K', '2K']).optional(),
  videoResolution: z.enum(['480p', '720p', '1080p']).optional(),
  defaultClipSeconds: z.number().int().positive().min(4).max(15).optional(),
  defaultFps: z.number().int().positive().max(60).optional(),
  artStylePreset: z.string().nullable().optional(),
  inferredArtStylePreset: z.string().nullable().optional(),
  useInferredArtStyle: z.boolean().optional(),
  presetFamily: z.preprocess(coerceEnumLikeValue(cinematicPresetFamilySchema.options), cinematicPresetFamilySchema).optional(),
  presetId: z.string().optional(),
  storyScenePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryScenePresetSchema.options), cinematicStoryScenePresetSchema.nullable()).optional(),
  storyLanguagePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryLanguagePresetSchema.options), cinematicStoryLanguagePresetSchema.nullable()).optional(),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).optional(),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).optional(),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).optional(),
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).optional(),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).optional(),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).optional(),
  authorshipPipeline: z.preprocess(coerceEnumLikeValue(cinematicAuthorshipPipelineSchema.options), cinematicAuthorshipPipelineSchema).optional(),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).optional(),
  backdropStrategy: z.string().nullable().optional(),
  contrastAxis: z.string().nullable().optional(),
  proofMoment: z.string().nullable().optional(),
  ctaStyle: z.string().nullable().optional(),
  targetTotalDurationSeconds: z.number().int().positive().max(90).nullable().optional(),
  targetTotalDurationRangeSeconds: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().optional(),
  targetShotCount: z.number().int().positive().max(20).nullable().optional(),
  targetShotCountRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().optional(),
  proofDeadlineShotIndex: z.number().int().positive().max(20).nullable().optional(),
  idealShotDurationRangeSeconds: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().optional(),
  maxDialogueWordsPerShot: z.number().int().positive().max(120).nullable().optional(),
  maxActionBeatsPerShot: z.number().int().positive().max(10).nullable().optional(),
  presetSource: z.enum(['graph_override', 'project_default', 'prompt_inference', 'fallback', 'manual_override']).optional(),
  specializationMode: z.enum(['story', 'ugc']).optional(),
}).default({})

export const cinematicPlanSchema = z.object({
  graphName: z.string(),
  graphSummary: z.string(),
  entityRefs: z.array(cinematicEntityRefSchema).default([]),
  rawScriptMarkdown: z.string().default(''),
  scriptDoc: cinematicScriptDocSchema.nullable().default(null),
  relationshipRefs: z.array(cinematicRelationshipSchema).default([]),
  compositeRefPlans: z.array(cinematicCompositeRefPlanSchema).default([]),
  storyboardPlan: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotPlanSchema).default([]),
  graphSettings: cinematicGraphSettingsSchema,
  autoRun: z.boolean().default(false),
})

export function normalizeCinematicPlanForTransport(plan: unknown) {
  if (plan === null || plan === undefined) return null
  const parsed = cinematicPlanSchema.parse(plan)
  return cinematicPlanSchema.parse({
    ...parsed,
    graphSettings: {
      ...parsed.graphSettings,
      backdropStrategy: parsed.graphSettings.backdropStrategy ?? '',
      contrastAxis: parsed.graphSettings.contrastAxis ?? '',
      proofMoment: parsed.graphSettings.proofMoment ?? '',
      ctaStyle: parsed.graphSettings.ctaStyle ?? '',
    },
  })
}

export const worldBuildPlanRequestSchema = z.object({
  prompt: z.string().min(1),
  plannerModeHint: worldBuildPlannerModeSchema.optional(),
  snapshot: z.object({
    workspace: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(['owner', 'editor', 'viewer']),
    }),
    project: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      summary: z.string(),
      visibility: z.enum(['private', 'internal', 'public']),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
      version: z.number().int().positive(),
      isPrimary: z.boolean(),
      updatedAt: z.string(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
    definitions: z.array(z.record(z.string(), z.unknown())).default([]),
    graphs: z.array(z.record(z.string(), z.unknown())).default([]),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    gameSpec: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  model: z.string().min(1),
})

export const worldBuildPlanResponseSchema = z.object({
  plannerMode: worldBuildPlannerModeSchema.default('world_build'),
  requestSummary: z.string(),
  planItems: z.array(worldBuildPlanItemSchema),
  cinematicPlan: cinematicPlanSchema.nullable().optional(),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

export const worldBuildStartRequestSchema = z.object({
  plannerMode: worldBuildPlannerModeSchema.default('world_build'),
  prompt: z.string().min(1),
  requestSummary: z.string().min(1),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  planItems: z.array(worldBuildPlanItemSchema),
  cinematicPlan: cinematicPlanSchema.nullable().optional(),
  model: z.string().min(1),
})

export const resourceGenerationMetadataSchema = z.object({
  batchId: z.string().nullable().optional(),
  jobId: z.string(),
  state: resourceGenerationStateSchema,
  placeholder: z.boolean().default(false),
  source: z.enum(['global_prompt', 'mesh_generation', 'cinematic_storyboard_preview']).default('global_prompt'),
})

export const worldBuildJobSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  planItemId: z.string(),
  kind: z.string(),
  status: worldBuildJobStatusSchema,
  dependsOnJobIds: z.array(z.string()).default([]),
  targetKeys: z.record(z.string(), z.string()).default({}),
  prompt: z.string().default(''),
  options: z.record(z.string(), z.unknown()).default({}),
  providerRequestId: z.string().nullable().default(null),
  statusUrl: z.string().nullable().default(null),
  responseUrl: z.string().nullable().default(null),
  cancelUrl: z.string().nullable().default(null),
  resultContext: z.record(z.string(), z.unknown()).nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  orderIndex: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldBuildBatchSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  prompt: z.string(),
  requestSummary: z.string(),
  plannerMode: worldBuildPlannerModeSchema.default('world_build'),
  status: worldBuildBatchStatusSchema,
  diagnostics: z.array(z.string()).default([]),
  planItems: z.array(worldBuildPlanItemSchema),
  cinematicPlan: cinematicPlanSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobs: z.array(worldBuildJobSchema).default([]),
})

export const worldBuildStatusResponseSchema = z.object({
  batch: worldBuildBatchSchema,
  definitions: z.array(z.record(z.string(), z.unknown())).default([]),
  graphs: z.array(z.record(z.string(), z.unknown())).default([]),
  assets: z.array(z.record(z.string(), z.unknown())).default([]),
  cinematicRuns: z.array(cinematicRunSchema).default([]),
})

export const worldBuildPollRequestSchema = z.object({
  batchId: z.string(),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  model: z.string().min(1),
})

export const worldBuildAuthorCinematicRequestSchema = z.object({
  batchId: z.string(),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  model: z.string().min(1),
})

export const worldBuildRepairCinematicRequestSchema = z.object({
  batchId: z.string(),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  model: z.string().min(1),
  shotIds: z.array(z.string()).default([]),
  failureCategories: z.array(z.enum(['schema', 'preset_fit', 'hook', 'proof', 'dialogue', 'action', 'camera', 'cta', 'structure', 'directing', 'continuity', 'reference_roles', 'proof_surface', 'pacing', 'concept_mode'])).default([]),
  fieldScopes: z.array(z.enum(['beat', 'framing', 'cameraAngle', 'cameraMovement', 'lensPreference', 'stillAtSeconds', 'visualPrompt', 'compositionGuide', 'directingPackage', 'referencePlan', 'dialogue', 'actions', 'audio'])).default([]),
})

export const worldBuildDeletePlaceholderRequestSchema = z.object({
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  resourceType: z.enum(['definition', 'graph', 'asset']),
  key: z.string().min(1),
})

export const worldBuildDeletePlaceholderResponseSchema = z.object({
  batch: worldBuildBatchSchema,
  deleted: z.object({
    definitions: z.array(z.string()).default([]),
    graphs: z.array(z.string()).default([]),
    assets: z.array(z.string()).default([]),
  }),
})

export type WorldBuildPlanItemKind = z.infer<typeof worldBuildPlanItemKindSchema>
export type WorldBuildGenerationOptions = z.infer<typeof worldBuildGenerationOptionsSchema>
export type WorldBuildPlanItem = z.infer<typeof worldBuildPlanItemSchema>
export type WorldBuildPlanRequest = z.infer<typeof worldBuildPlanRequestSchema>
export type WorldBuildPlanResponse = z.infer<typeof worldBuildPlanResponseSchema>
export type WorldBuildStartRequest = z.infer<typeof worldBuildStartRequestSchema>
export type ResourceGenerationMetadata = z.infer<typeof resourceGenerationMetadataSchema>
export type WorldBuildBatch = z.infer<typeof worldBuildBatchSchema>
export type WorldBuildJob = z.infer<typeof worldBuildJobSchema>
export type WorldBuildStatusResponse = z.infer<typeof worldBuildStatusResponseSchema>
export type WorldBuildPollRequest = z.infer<typeof worldBuildPollRequestSchema>
export type WorldBuildAuthorCinematicRequest = z.infer<typeof worldBuildAuthorCinematicRequestSchema>
export type WorldBuildRepairCinematicRequest = z.infer<typeof worldBuildRepairCinematicRequestSchema>
export type WorldBuildDeletePlaceholderRequest = z.infer<typeof worldBuildDeletePlaceholderRequestSchema>
export type WorldBuildDeletePlaceholderResponse = z.infer<typeof worldBuildDeletePlaceholderResponseSchema>
export type WorldBuildPlannerMode = z.infer<typeof worldBuildPlannerModeSchema>
export type CinematicPlan = z.infer<typeof cinematicPlanSchema>
export type CinematicEntityRef = z.infer<typeof cinematicEntityRefSchema>
export type CinematicCompositeRefPlan = z.infer<typeof cinematicCompositeRefPlanSchema>
export type CinematicShotPlan = z.infer<typeof cinematicShotPlanSchema>

export function getResourceGenerationMetadata(value: { metadata?: unknown } | null | undefined) {
  if (!value || typeof value !== 'object') return null
  const metadata = (value as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== 'object') return null
  const parsed = resourceGenerationMetadataSchema.safeParse((metadata as { generation?: unknown }).generation)
  return parsed.success ? parsed.data : null
}

export function isPendingGenerationResource(value: { metadata?: unknown } | null | undefined) {
  const generation = getResourceGenerationMetadata(value)
  return generation?.state === 'pending' || generation?.state === 'running'
}

export function isTerminalWorldBuildBatchStatus(status: string) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}
