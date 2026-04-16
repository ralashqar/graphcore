import { z } from 'zod'
import {
  deriveUgcShotDefaults,
  getDefaultUgcFormatSubtypeForPresetFamily,
  getUgcPresetProfile,
} from './ugcPresetProfiles.ts'
import { getRecommendedArtStylePresetForCinematic } from './artStylePresets.ts'

const rawRecordSchema = z.record(z.string(), z.unknown())
const normalizeEnumCandidate = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const coerceEnumLikeValue = <TOption extends string>(options: readonly TOption[]) => (value: unknown) => {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (options.includes(trimmed as TOption)) return trimmed
  const normalized = normalizeEnumCandidate(trimmed)
  const matched = options.find((option) => normalizeEnumCandidate(option) === normalized)
  return matched ?? null
}

export const cinematicAspectRatioSchema = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
export const cinematicStillResolutionSchema = z.enum(['1K', '2K'])
export const cinematicVideoResolutionSchema = z.enum(['480p', '720p', '1080p'])
export const cinematicSpecializationModeSchema = z.enum(['story', 'ugc'])
export const cinematicPresetFamilySchema = z.enum(['story_movie_tv', 'ugc_creator', 'ugc_direct_response_ad', 'ugc_faceless_format'])
export const cinematicFormatSubtypeSchema = z.enum([
  'creator_problem_solution',
  'creator_reframe',
  'creator_validation',
  'creator_serialized_drama',
  'ad_problem_solution',
  'ad_mechanism_proof',
  'ad_before_after',
  'ad_comparison',
  'ad_trojan_horse_drama',
  'faceless_demo',
  'faceless_explainer',
  'faceless_process',
  'faceless_serialized_drama',
  'contrast_narrative',
])
export const cinematicFormulaFamilySchema = z.enum([
  'problem_solution',
  'reframe',
  'validation',
  'doing_it_wrong',
  'mechanism_proof',
  'mistake_warning',
  'result_reveal',
  'before_after',
  'contrast_comparison',
  'contrast_narrative',
  'personal_confession',
])
export const cinematicDominantTriggerSchema = z.enum([
  'curiosity_gap',
  'status_comparison',
  'belief_reset',
  'social_proof',
  'parasocial_reassurance',
  'transformation_desire',
  'guilt_pressure',
  'defiance_trigger',
])
export const cinematicReferenceKindSchema = z.enum(['definition', 'asset', 'video', 'audio', 'style', 'storyboard', 'composite'])
export const cinematicNodeAssetRoleSchema = z.enum(['character', 'environment', 'item', 'audio', 'style', 'storyboard', 'composite'])
export const cinematicReferencePrioritySchema = z.number().int().min(0).max(100)
export const cinematicRelationshipTypeSchema = z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of'])
export const cinematicStoryboardModeSchema = z.enum(['none', 'sequence_board', 'shot_panels', 'hybrid'])
export const cinematicBeatTypeSchema = z.enum(['action', 'dialogue', 'audio', 'camera', 'transition', 'custom'])
export const cinematicAudioCueKindSchema = z.enum(['dialogue', 'ambience', 'sfx', 'music', 'silence', 'offscreen'])
export const cinematicScriptBindingKindSchema = z.enum(['character', 'environment', 'item', 'audio', 'style'])
export const seedanceEndpointSchema = z.enum(['reference-to-video', 'image-to-video'])
export const seedanceModePreferenceSchema = z.enum(['auto', 'reference-to-video', 'image-to-video'])
export const seedanceInputModalitySchema = z.enum(['image', 'video', 'audio'])
export const cinematicDurationSourceSchema = z.enum(['manual', 'inferred'])
export const cinematicHookRoleSchema = z.enum(['hook', 'setup', 'proof', 'payoff', 'cta'])
export const cinematicPlatformTargetSchema = z.enum(['tiktok', 'instagram_reels', 'youtube_shorts', 'facebook', 'x', 'web', 'general'])

export const cinematicSettingsSchema = z.object({
  stillAspectRatio: cinematicAspectRatioSchema.default('16:9'),
  stillResolution: cinematicStillResolutionSchema.default('1K'),
  videoResolution: cinematicVideoResolutionSchema.default('720p'),
  defaultClipSeconds: z.number().int().min(4).max(15).default(5),
  defaultFps: z.number().int().positive().max(60).default(24),
  artStylePreset: z.string().nullable().default(null),
  inferredArtStylePreset: z.string().nullable().default(null),
  useInferredArtStyle: z.boolean().default(true),
  presetFamily: cinematicPresetFamilySchema.default('story_movie_tv'),
  presetId: z.string().default('story_movie_tv'),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  specializationMode: cinematicSpecializationModeSchema.default('story'),
})

export const cinematicReferenceSchema = z.object({
  id: z.string(),
  refKind: cinematicReferenceKindSchema.default('definition'),
  role: z.string().default('reference'),
  label: z.string(),
  summary: z.string().default(''),
  definitionKey: z.string().nullable().default(null),
  assetKey: z.string().nullable().default(null),
  assetRole: cinematicNodeAssetRoleSchema.nullable().default(null),
  stagingNotes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(50),
  required: z.boolean().default(false),
})

export const cinematicRelationshipSchema = z.object({
  id: z.string(),
  type: cinematicRelationshipTypeSchema,
  sourceRefId: z.string(),
  targetRefId: z.string(),
  notes: z.string().default(''),
})

export const cinematicCompositeReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  relationshipType: cinematicRelationshipTypeSchema.default('equip'),
  sourceRefIds: z.array(z.string()).min(2),
  outputAssetKey: z.string().nullable().default(null),
  generationPrompt: z.string().default(''),
  stagingNotes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(80),
})

export const dialogueBeatSchema = z.object({
  id: z.string(),
  speakerRefId: z.string().nullable().default(null),
  line: z.string().default(''),
  delivery: z.string().default(''),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
  lipSync: z.boolean().default(true),
})

export const actionBeatSchema = z.object({
  id: z.string(),
  actorRefId: z.string().nullable().default(null),
  targetRefId: z.string().nullable().default(null),
  verb: z.string().default(''),
  propRefId: z.string().nullable().default(null),
  stagingNotes: z.string().default(''),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
})

export const audioBeatSchema = z.object({
  id: z.string(),
  kind: cinematicAudioCueKindSchema.default('ambience'),
  cue: z.string().default(''),
  sourceRefId: z.string().nullable().default(null),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
})

export const cinematicBeatSchema = z.object({
  id: z.string(),
  type: cinematicBeatTypeSchema.default('custom'),
  summary: z.string().default(''),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
})

export const storyboardPanelSchema = z.object({
  id: z.string(),
  shotId: z.string().nullable().default(null),
  title: z.string().default(''),
  assetKey: z.string().nullable().default(null),
  notes: z.string().default(''),
  orderIndex: z.number().int().default(0),
})

export const storyboardSpecSchema = z.object({
  mode: cinematicStoryboardModeSchema.default('none'),
  summary: z.string().default(''),
  sequenceAssetKey: z.string().nullable().default(null),
  panels: z.array(storyboardPanelSchema).default([]),
})

export const cinematicReferenceVaultEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
})

export const cinematicScriptEntityBindingSchema = z.object({
  id: z.string(),
  kind: cinematicScriptBindingKindSchema.default('character'),
  role: z.string().default('reference'),
  label: z.string(),
  sourceName: z.string().default(''),
  summary: z.string().default(''),
  definitionKey: z.string().nullable().default(null),
  assetKey: z.string().nullable().default(null),
  stagingNotes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(50),
  required: z.boolean().default(true),
})

export const cinematicSequenceSceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  locationRefId: z.string().nullable().default(null),
  shotIds: z.array(z.string()).default([]),
  continuityNotes: z.string().default(''),
  orderIndex: z.number().int().default(0),
})
export const cinematicScriptSceneSchema = cinematicSequenceSceneSchema

export const cinematicScriptShotSchema = z.object({
  id: z.string(),
  sceneId: z.string().nullable().default(null),
  orderIndex: z.number().int().default(0),
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  beat: z.string().default(''),
  emotionalBeat: z.string().default(''),
  hookRole: cinematicHookRoleSchema.nullable().default(null),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  hookType: z.string().default(''),
  targetEmotion: z.string().default(''),
  personaStyle: z.string().default(''),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  proofType: z.string().default(''),
  ctaType: z.string().default(''),
  platformTarget: cinematicPlatformTargetSchema.nullable().default(null),
  artStylePreset: z.string().nullable().default(null),
  shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
  framing: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMovement: z.string().default(''),
  lensPreference: z.string().default(''),
  visualPrompt: z.string().default(''),
  compositionGuide: z.string().default(''),
  continuityNotes: z.string().default(''),
  participantRefIds: z.array(z.string()).default([]),
  locationRefId: z.string().nullable().default(null),
  propRefIds: z.array(z.string()).default([]),
  requiredSourceRefIds: z.array(z.string()).default([]),
  compositeRefIds: z.array(z.string()).default([]),
  storyboardRefIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().positive().max(15).nullable().default(null),
  forceTakeBreak: z.boolean().default(false),
  beats: z.array(cinematicBeatSchema).default([]),
  dialogue: z.array(dialogueBeatSchema).default([]),
  actions: z.array(actionBeatSchema).default([]),
  audio: z.array(audioBeatSchema).default([]),
})

export const cinematicScriptDocSchema = z.object({
  title: z.string().default('Prompt Cinematic'),
  logline: z.string().default(''),
  tone: z.string().default(''),
  continuityNotes: z.string().default(''),
  statusPayoffType: z.string().default(''),
  narrativeArcTemplate: z.string().default(''),
  sceneCount: z.number().int().positive().nullable().default(null),
  referenceVault: z.array(cinematicReferenceVaultEntrySchema).default([]),
  entityBindings: z.array(cinematicScriptEntityBindingSchema).default([]),
  scenes: z.array(cinematicScriptSceneSchema).default([]),
  shots: z.array(cinematicScriptShotSchema).default([]),
  relationships: z.array(cinematicRelationshipSchema).default([]),
  compositeRefs: z.array(cinematicCompositeReferenceSchema).default([]),
  storyboard: storyboardSpecSchema.nullable().default(null),
})

export const seedanceReferenceInputSchema = z.object({
  id: z.string(),
  sourceRefId: z.string().nullable().default(null),
  nodeKey: z.string().nullable().default(null),
  label: z.string(),
  modality: seedanceInputModalitySchema,
  url: z.string(),
  priority: cinematicReferencePrioritySchema.default(50),
  truncated: z.boolean().default(false),
})

export const seedanceExecutionPlanSchema = z.object({
  endpoint: seedanceEndpointSchema.default('reference-to-video'),
  modeReason: z.string().default(''),
  prompt: z.string().default(''),
  resolution: z.enum(['480p', '720p']).default('720p'),
  duration: z.union([z.literal('auto'), z.string().regex(/^(4|5|6|7|8|9|10|11|12|13|14|15)$/)]).default('auto'),
  aspectRatio: z.union([z.literal('auto'), cinematicAspectRatioSchema]).default('auto'),
  generateAudio: z.boolean().default(true),
  seed: z.number().int().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  endImageUrl: z.string().nullable().default(null),
  imageUrls: z.array(z.string()).default([]),
  videoUrls: z.array(z.string()).default([]),
  audioUrls: z.array(z.string()).default([]),
  referenceInputs: z.array(seedanceReferenceInputSchema).default([]),
  droppedRefIds: z.array(z.string()).default([]),
})

export const cinematicShotSpecSchema = z.object({
  id: z.string(),
  sceneId: z.string().nullable().default(null),
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  beat: z.string().default(''),
  emotionalBeat: z.string().default(''),
  hookRole: cinematicHookRoleSchema.nullable().default(null),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  hookType: z.string().default(''),
  targetEmotion: z.string().default(''),
  personaStyle: z.string().default(''),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  proofType: z.string().default(''),
  ctaType: z.string().default(''),
  platformTarget: cinematicPlatformTargetSchema.nullable().default(null),
  artStylePreset: z.string().nullable().default(null),
  shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
  framing: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMovement: z.string().default(''),
  lensPreference: z.string().default(''),
  visualPrompt: z.string().default(''),
  compositionGuide: z.string().default(''),
  participantRefIds: z.array(z.string()).default([]),
  locationRefId: z.string().nullable().default(null),
  propRefIds: z.array(z.string()).default([]),
  requiredSourceRefIds: z.array(z.string()).default([]),
  compositeRefIds: z.array(z.string()).default([]),
  storyboardRefIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().positive().max(15).nullable().default(null),
  inferredDurationSeconds: z.number().int().positive().max(15).nullable().default(null),
  durationSource: cinematicDurationSourceSchema.default('inferred'),
  timingSummary: z.string().default(''),
  takeId: z.string().nullable().default(null),
  takeIndex: z.number().int().nullable().default(null),
  forceTakeBreak: z.boolean().default(false),
  seedanceModePreference: seedanceModePreferenceSchema.default('auto'),
  beats: z.array(cinematicBeatSchema).default([]),
  dialogue: z.array(dialogueBeatSchema).default([]),
  actions: z.array(actionBeatSchema).default([]),
  audio: z.array(audioBeatSchema).default([]),
  stillAssetKey: z.string().nullable().default(null),
  videoAssetKey: z.string().nullable().default(null),
  lastRunId: z.string().nullable().default(null),
  lastStillJobId: z.string().nullable().default(null),
  lastVideoJobId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  providerModel: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  executionPlan: seedanceExecutionPlanSchema.nullable().default(null),
})
export const cinematicShotNodeConfigSchema = cinematicShotSpecSchema

export const cinematicTakeSpecSchema = z.object({
  id: z.string(),
  takeIndex: z.number().int().nonnegative().nullable().default(null),
  title: z.string(),
  shotIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().min(4).max(15),
  startSeconds: z.number().nonnegative().default(0),
  endSeconds: z.number().nonnegative().default(0),
  breakReason: z.string().default(''),
  continuityRefIds: z.array(z.string()).default([]),
  seedanceEndpoint: seedanceEndpointSchema.default('reference-to-video'),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  artStylePreset: z.string().nullable().default(null),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  requiredSourceRefIds: z.array(z.string()).default([]),
  previewImageAssetKey: z.string().nullable().default(null),
  storyboardAssetKey: z.string().nullable().default(null),
  outputVideoAssetKey: z.string().nullable().default(null),
  outputStillAssetKey: z.string().nullable().default(null),
  approvedForVideo: z.boolean().default(false),
  approvalNotes: z.string().default(''),
  lastRunId: z.string().nullable().default(null),
  lastStoryboardJobId: z.string().nullable().default(null),
  lastStillJobId: z.string().nullable().default(null),
  lastVideoJobId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  providerModel: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  executionPlan: seedanceExecutionPlanSchema.nullable().default(null),
})
export const cinematicTakeNodeConfigSchema = cinematicTakeSpecSchema

export const cinematicSequenceSchema = z.object({
  title: z.string().default('Prompt Cinematic'),
  logline: z.string().default(''),
  tone: z.string().default(''),
  continuityNotes: z.string().default(''),
  statusPayoffType: z.string().default(''),
  narrativeArcTemplate: z.string().default(''),
  references: z.array(cinematicReferenceSchema).default([]),
  scenes: z.array(cinematicSequenceSceneSchema).default([]),
  compositeRefs: z.array(cinematicCompositeReferenceSchema).default([]),
  relationships: z.array(cinematicRelationshipSchema).default([]),
  storyboard: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotSpecSchema).default([]),
  takes: z.array(cinematicTakeSpecSchema).default([]),
})

export const assetRefNodeConfigSchema = z.object({
  entityRefId: z.string().nullable().default(null),
  definitionKey: z.string().nullable().default(null),
  assetKey: z.string().nullable().default(null),
  refKind: cinematicReferenceKindSchema.default('definition'),
  assetRole: cinematicNodeAssetRoleSchema.nullable().default(null),
  role: z.string().default('reference'),
  priority: cinematicReferencePrioritySchema.default(50),
  stagingNotes: z.string().default(''),
})

export const compositeRefNodeConfigSchema = z.object({
  compositeRefId: z.string().nullable().default(null),
  title: z.string().default('Composite Reference'),
  sourceRefIds: z.array(z.string()).default([]),
  relationshipType: cinematicRelationshipTypeSchema.default('equip'),
  outputAssetKey: z.string().nullable().default(null),
  generationPrompt: z.string().default(''),
  stagingNotes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(80),
})

export const storyboardRefNodeConfigSchema = z.object({
  storyboardId: z.string().nullable().default(null),
  panelId: z.string().nullable().default(null),
  shotId: z.string().nullable().default(null),
  takeId: z.string().nullable().default(null),
  storyboardKind: z.enum(['sequence_board', 'shot_panel']).default('shot_panel'),
  assetKey: z.string().nullable().default(null),
  generationPrompt: z.string().default(''),
  notes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(90),
  lastRunId: z.string().nullable().default(null),
  lastStillJobId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  providerModel: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
})

export const cinematicTakeNodeMetadataSchema = cinematicTakeNodeConfigSchema

export const cinematicGraphMetadataSchema = z.object({
  cinematics: cinematicSettingsSchema.partial().default({}),
  cinematicScript: cinematicScriptDocSchema.optional(),
  cinematicSequence: cinematicSequenceSchema.optional(),
  cinematicAuthoring: rawRecordSchema.optional(),
}).catchall(z.unknown())

export const cinematicRunStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const cinematicRunModeSchema = z.enum(['graph_run', 'preview_still', 'preview_video', 'preview_take_still', 'preview_storyboard_still'])
export const cinematicRunJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'])
export const cinematicRunJobKindSchema = z.enum(['shot_still', 'shot_video', 'take_still', 'take_video', 'storyboard_still'])

export const cinematicRunJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  graphKey: z.string(),
  shotNodeKey: z.string(),
  shotId: z.string().nullable().default(null),
  kind: cinematicRunJobKindSchema,
  status: cinematicRunJobStatusSchema,
  orderIndex: z.number().int().default(0),
  dependsOnJobIds: z.array(z.string()).default([]),
  stillAssetKey: z.string().nullable().default(null),
  videoAssetKey: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  prompt: z.string().default(''),
  resultContext: rawRecordSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const cinematicRunSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  projectId: z.string(),
  graphKey: z.string(),
  graphName: z.string(),
  mode: cinematicRunModeSchema,
  status: cinematicRunStatusSchema,
  shotNodeKey: z.string().nullable().default(null),
  diagnostics: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobs: z.array(cinematicRunJobSchema).default([]),
})

const cinematicSnapshotSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
  }),
  draft: z.object({
    id: z.string(),
    name: z.string(),
  }),
  definitions: z.array(rawRecordSchema).default([]),
  graphs: z.array(rawRecordSchema).default([]),
  assets: z.array(rawRecordSchema).default([]),
  gameSpec: rawRecordSchema.nullable().optional(),
})

export const cinematicRunStartRequestSchema = z.object({
  snapshot: cinematicSnapshotSchema,
  graphKey: z.string(),
  mode: cinematicRunModeSchema,
  targetNodeKey: z.string().nullable().optional(),
  targetNodeKeys: z.array(z.string()).default([]),
  shotNodeKey: z.string().nullable().optional(),
  shotId: z.string().nullable().optional(),
})

export const cinematicRunCancelRequestSchema = z.object({
  snapshot: cinematicSnapshotSchema,
  runId: z.string(),
})

export const cinematicRunStatusResponseSchema = z.object({
  run: cinematicRunSchema,
  graphs: z.array(rawRecordSchema).default([]),
  assets: z.array(rawRecordSchema).default([]),
})

export type CinematicSettings = z.infer<typeof cinematicSettingsSchema>
export type CinematicPresetFamily = z.infer<typeof cinematicPresetFamilySchema>
export type CinematicFormatSubtype = z.infer<typeof cinematicFormatSubtypeSchema>
export type CinematicFormulaFamily = z.infer<typeof cinematicFormulaFamilySchema>
export type CinematicDominantTrigger = z.infer<typeof cinematicDominantTriggerSchema>
export type CinematicHookRole = z.infer<typeof cinematicHookRoleSchema>
export type CinematicReference = z.infer<typeof cinematicReferenceSchema>
export type CinematicCompositeReference = z.infer<typeof cinematicCompositeReferenceSchema>
export type CinematicRelationship = z.infer<typeof cinematicRelationshipSchema>
export type DialogueBeat = z.infer<typeof dialogueBeatSchema>
export type ActionBeat = z.infer<typeof actionBeatSchema>
export type AudioBeat = z.infer<typeof audioBeatSchema>
export type CinematicBeat = z.infer<typeof cinematicBeatSchema>
export type StoryboardSpec = z.infer<typeof storyboardSpecSchema>
export type CinematicScriptEntityBinding = z.infer<typeof cinematicScriptEntityBindingSchema>
export type CinematicScriptScene = z.infer<typeof cinematicScriptSceneSchema>
export type CinematicScriptShot = z.infer<typeof cinematicScriptShotSchema>
export type CinematicScriptDoc = z.infer<typeof cinematicScriptDocSchema>
export type SeedanceExecutionPlan = z.infer<typeof seedanceExecutionPlanSchema>
export type CinematicShotSpec = z.infer<typeof cinematicShotSpecSchema>
export type CinematicTakeSpec = z.infer<typeof cinematicTakeSpecSchema>
export type CinematicSequenceScene = z.infer<typeof cinematicSequenceSceneSchema>
export type CinematicSequence = z.infer<typeof cinematicSequenceSchema>
export type AssetRefNodeConfig = z.infer<typeof assetRefNodeConfigSchema>
export type CompositeRefNodeConfig = z.infer<typeof compositeRefNodeConfigSchema>
export type StoryboardRefNodeConfig = z.infer<typeof storyboardRefNodeConfigSchema>
export type CinematicShotNodeConfig = z.infer<typeof cinematicShotNodeConfigSchema>
export type CinematicTakeNodeConfig = z.infer<typeof cinematicTakeNodeConfigSchema>
export type CinematicRun = z.infer<typeof cinematicRunSchema>
export type CinematicRunJob = z.infer<typeof cinematicRunJobSchema>
export type CinematicRunCancelRequest = z.infer<typeof cinematicRunCancelRequestSchema>
export type CinematicRunStartRequest = z.infer<typeof cinematicRunStartRequestSchema>
export type CinematicRunStatusResponse = z.infer<typeof cinematicRunStatusResponseSchema>

const defaultCinematicSettings = cinematicSettingsSchema.parse({})
const defaultAssetRefNodeConfig = assetRefNodeConfigSchema.parse({})
const defaultCompositeRefNodeConfig = compositeRefNodeConfigSchema.parse({})
const defaultStoryboardRefNodeConfig = storyboardRefNodeConfigSchema.parse({})
const defaultShotNodeConfig = cinematicShotSpecSchema.parse({
  id: 'shot',
  title: 'Shot',
})
const defaultTakeNodeConfig = cinematicTakeSpecSchema.parse({
  id: 'take',
  title: 'Take',
  durationSeconds: 4,
})

export function deriveSpecializationModeFromPresetFamily(presetFamily: CinematicPresetFamily): CinematicSettings['specializationMode'] {
  return presetFamily === 'story_movie_tv' ? 'story' : 'ugc'
}

export function derivePresetFamilyFromSpecializationMode(mode: CinematicSettings['specializationMode'] | null | undefined): CinematicPresetFamily {
  return mode === 'ugc' ? 'ugc_creator' : 'story_movie_tv'
}

export function isUgcPresetFamily(presetFamily: CinematicPresetFamily) {
  return presetFamily !== 'story_movie_tv'
}

export function deriveDefaultFormatSubtypeFromPresetFamily(presetFamily: CinematicPresetFamily): CinematicFormatSubtype | null {
  return getDefaultUgcFormatSubtypeForPresetFamily(presetFamily)
}

export function deriveDefaultStillAspectRatioFromPresetFamily(presetFamily: CinematicPresetFamily): CinematicSettings['stillAspectRatio'] {
  return isUgcPresetFamily(presetFamily) ? '9:16' : '16:9'
}

export function deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype: CinematicFormatSubtype | null | undefined): CinematicFormulaFamily | null {
  return getUgcPresetProfile(formatSubtype)?.defaultFormulaFamily ?? null
}

export function deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype: CinematicFormatSubtype | null | undefined): CinematicDominantTrigger | null {
  return getUgcPresetProfile(formatSubtype)?.defaultDominantTrigger ?? null
}

export function isFormatSubtypeAllowedForPresetFamily(
  presetFamily: CinematicPresetFamily,
  formatSubtype: CinematicFormatSubtype | null | undefined,
) {
  if (!formatSubtype) return !isUgcPresetFamily(presetFamily)
  if (!isUgcPresetFamily(presetFamily)) return false
  if (formatSubtype === 'contrast_narrative') return true
  if (presetFamily === 'ugc_creator') return formatSubtype.startsWith('creator_')
  if (presetFamily === 'ugc_direct_response_ad') return formatSubtype.startsWith('ad_')
  if (presetFamily === 'ugc_faceless_format') return formatSubtype.startsWith('faceless_')
  return false
}

export function coerceFormatSubtypeForPresetFamily(
  presetFamily: CinematicPresetFamily,
  formatSubtype: CinematicFormatSubtype | null | undefined,
): CinematicFormatSubtype | null {
  if (!isUgcPresetFamily(presetFamily)) return null
  if (formatSubtype && isFormatSubtypeAllowedForPresetFamily(presetFamily, formatSubtype)) return formatSubtype
  return deriveDefaultFormatSubtypeFromPresetFamily(presetFamily)
}

export function getCinematicPresetLabel(presetFamily: CinematicPresetFamily) {
  switch (presetFamily) {
    case 'story_movie_tv':
      return 'Movie / TV Story'
    case 'ugc_creator':
      return 'UGC Creator'
    case 'ugc_direct_response_ad':
      return 'UGC Direct Response Ad'
    case 'ugc_faceless_format':
      return 'UGC Faceless Format'
  }
}

export function getCinematicFormatSubtypeLabel(formatSubtype: CinematicFormatSubtype) {
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return 'Creator Problem / Solution'
    case 'creator_reframe':
      return 'Creator Reframe'
    case 'creator_validation':
      return 'Creator Validation'
    case 'creator_serialized_drama':
      return 'Creator Serialized Drama'
    case 'ad_problem_solution':
      return 'Ad Problem / Solution'
    case 'ad_mechanism_proof':
      return 'Ad Mechanism / Proof'
    case 'ad_before_after':
      return 'Ad Before / After'
    case 'ad_comparison':
      return 'Ad Comparison'
    case 'ad_trojan_horse_drama':
      return 'Ad Trojan Horse Drama'
    case 'faceless_demo':
      return 'Faceless Demo'
    case 'faceless_explainer':
      return 'Faceless Explainer'
    case 'faceless_process':
      return 'Faceless Process'
    case 'faceless_serialized_drama':
      return 'Faceless Serialized Drama'
    case 'contrast_narrative':
      return 'Contrast Narrative'
  }
}

export function getCinematicFormulaFamilyLabel(formulaFamily: CinematicFormulaFamily) {
  switch (formulaFamily) {
    case 'problem_solution':
      return 'Problem / Solution'
    case 'reframe':
      return 'Reframe'
    case 'validation':
      return 'Validation'
    case 'doing_it_wrong':
      return 'Doing It Wrong'
    case 'mechanism_proof':
      return 'Mechanism / Proof'
    case 'mistake_warning':
      return 'Mistake Warning'
    case 'result_reveal':
      return 'Result Reveal'
    case 'before_after':
      return 'Before / After'
    case 'contrast_comparison':
      return 'Contrast Comparison'
    case 'contrast_narrative':
      return 'Contrast Narrative'
    case 'personal_confession':
      return 'Personal Confession'
  }
}

export function buildCinematicSettingsPatchFromFormatSubtype(
  presetFamily: CinematicPresetFamily,
  formatSubtype: CinematicFormatSubtype | null,
): Pick<CinematicSettings, 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset'> {
  const nextSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, formatSubtype)
  const profile = getUgcPresetProfile(nextSubtype, presetFamily)
  return {
    formatSubtype: nextSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(nextSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(nextSubtype),
    proofMoment: profile?.defaultProofMoment ?? '',
    ctaStyle: profile?.defaultCtaStyle ?? '',
    contrastAxis: profile?.defaultContrastAxis ?? '',
    stillAspectRatio: profile?.preferredAspectRatio ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
    defaultClipSeconds: profile?.preferredClipSeconds ?? defaultCinematicSettings.defaultClipSeconds,
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype: nextSubtype }),
  }
}

export function buildCinematicSettingsPatchFromPresetFamily(presetFamily: CinematicPresetFamily): Pick<CinematicSettings, 'presetFamily' | 'presetId' | 'specializationMode' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset'> {
  const formatSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, null)
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  return {
    presetFamily,
    presetId: presetFamily,
    stillAspectRatio: profile?.preferredAspectRatio ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
    defaultClipSeconds: profile?.preferredClipSeconds ?? defaultCinematicSettings.defaultClipSeconds,
    formatSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype),
    proofMoment: profile?.defaultProofMoment ?? '',
    ctaStyle: profile?.defaultCtaStyle ?? '',
    contrastAxis: profile?.defaultContrastAxis ?? '',
    specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype }),
  }
}

function inferSequenceReferenceKindFromBinding(binding: CinematicScriptEntityBinding): CinematicReference['refKind'] {
  if (binding.kind === 'audio') return 'audio'
  if (binding.kind === 'style') return 'style'
  return binding.definitionKey ? 'definition' : 'asset'
}

function inferSequenceAssetRoleFromBinding(binding: CinematicScriptEntityBinding): CinematicReference['assetRole'] {
  if (binding.kind === 'audio') return 'audio'
  if (binding.kind === 'style') return 'style'
  return binding.kind
}

function buildRequiredSourceRefIdsForScriptShot(shot: CinematicScriptShot) {
  const sourceRefIds = shot.requiredSourceRefIds.length > 0
    ? shot.requiredSourceRefIds
    : [
        ...shot.storyboardRefIds,
        ...shot.compositeRefIds,
        ...shot.participantRefIds,
        ...(shot.locationRefId ? [shot.locationRefId] : []),
        ...shot.propRefIds,
      ]
  return Array.from(new Set(sourceRefIds.filter((entry) => entry.trim().length > 0)))
}

function clampShotDuration(value: number) {
  return Math.min(15, Math.max(1, Math.round(value)))
}

function estimateDialogueDurationSeconds(line: DialogueBeat) {
  const words = line.line.trim().split(/\s+/).filter(Boolean).length
  const spokenSeconds = words > 0 ? words / 2.4 : 0
  const punctuationPauseSeconds = (line.line.match(/[,:;!?]/g)?.length ?? 0) * 0.22
  const deliveryWeight =
    /(slow|careful|measured|cold|warning|threat|mock|taunt|whisper|quiet|deliberate)/i.test(line.delivery)
      ? 0.65
      : line.delivery.trim().length > 0
        ? 0.35
        : 0
  const base = spokenSeconds + punctuationPauseSeconds + deliveryWeight + 0.6
  return Math.max(1.2, Math.min(8, Math.ceil(base * 2) / 2))
}

function estimateActionDurationSeconds(action: ActionBeat) {
  const notesWeight = action.stagingNotes.trim().length > 48 ? 0.5 : 0
  const verbWeight = /slash|strike|slap|hit|throw|draw|unsheathe|embrace|kneel|turn|step|rise|sit|circle|circling|walk|approach|recoil|stagger/i.test(action.verb) ? 0.75 : 0.25
  return Math.max(1, Math.min(5, Math.ceil((1.1 + notesWeight + verbWeight) * 2) / 2))
}

export function estimateShotContentDurationSeconds(shot: Pick<CinematicScriptShot, 'shotType' | 'beat' | 'dialogue' | 'actions' | 'audio'>) {
  const dialogueSeconds = shot.dialogue.reduce((sum, line) => sum + estimateDialogueDurationSeconds(line), 0)
  const actionSeconds = shot.actions.reduce((sum, action) => sum + estimateActionDurationSeconds(action), 0)
  const audioWeight = shot.audio.some((cue) => cue.kind === 'ambience' || cue.kind === 'music') ? 1 : 0
  const baseByType =
    shot.shotType === 'establishing'
      ? 3
      : shot.shotType === 'insert'
        ? 2
        : shot.shotType === 'action'
          ? 3
          : shot.shotType === 'transition'
            ? 2
            : shot.shotType === 'dialogue'
              ? 4
              : 3
  const cueBonus =
    /(linger|pause|hold|slowly)/i.test(shot.beat)
      ? 2
      : /(brief|quick|sudden|fast)/i.test(shot.beat)
        ? 0
        : 1

  return {
    dialogueSeconds,
    actionSeconds,
    audioWeight,
    inferredDurationSeconds: clampShotDuration(Math.max(
      baseByType + cueBonus + audioWeight,
      dialogueSeconds + actionSeconds,
      shot.dialogue.length > 0 ? 3 : 2,
    )),
  }
}

function inferShotDuration(shot: CinematicScriptShot) {
  if (typeof shot.durationSeconds === 'number' && Number.isFinite(shot.durationSeconds)) {
    return {
      durationSeconds: clampShotDuration(shot.durationSeconds),
      durationSource: 'manual' as const,
      timingSummary: 'Manual shot duration override.',
    }
  }

  const estimated = estimateShotContentDurationSeconds(shot)
  const inferred = estimated.inferredDurationSeconds

  return {
    durationSeconds: inferred,
    durationSource: 'inferred' as const,
    timingSummary: [
      shot.dialogue.length > 0 ? `${shot.dialogue.length} dialogue beat${shot.dialogue.length === 1 ? '' : 's'} ~${Math.round(estimated.dialogueSeconds * 10) / 10}s` : null,
      shot.actions.length > 0 ? `${shot.actions.length} action beat${shot.actions.length === 1 ? '' : 's'} ~${Math.round(estimated.actionSeconds * 10) / 10}s` : null,
      shot.shotType !== 'custom' ? `${shot.shotType} shot` : null,
    ].filter((entry): entry is string => Boolean(entry)).join(' · ') || 'Default cinematic pacing.',
  }
}

function fillBeatTimingsForShot(shot: CinematicScriptShot, durationSeconds: number) {
  let cursor = 0
  const nextDialogue = shot.dialogue.map((line) => {
    const lineDuration = typeof line.startSeconds === 'number' && typeof line.endSeconds === 'number'
      ? Math.max(0, line.endSeconds - line.startSeconds)
      : estimateDialogueDurationSeconds(line)
    const startSeconds = line.startSeconds ?? Math.min(cursor, Math.max(0, durationSeconds - 1))
    const endSeconds = line.endSeconds ?? Math.min(durationSeconds, startSeconds + lineDuration)
    cursor = Math.max(cursor, endSeconds)
    return {
      ...line,
      startSeconds,
      endSeconds,
    }
  })

  const unspecifiedActions = shot.actions.filter((action) => typeof action.startSeconds !== 'number' && typeof action.endSeconds !== 'number')
  const actionSlotSeconds = unspecifiedActions.length > 0 ? durationSeconds / unspecifiedActions.length : durationSeconds
  let unspecifiedActionIndex = 0
  const nextActions = shot.actions.map((action) => {
    const actionDuration = typeof action.startSeconds === 'number' && typeof action.endSeconds === 'number'
      ? Math.max(0, action.endSeconds - action.startSeconds)
      : estimateActionDurationSeconds(action)
    const hasExplicitTiming = typeof action.startSeconds === 'number' || typeof action.endSeconds === 'number'
    const inferredStartSeconds = hasExplicitTiming
      ? null
      : Math.min(
          Math.max(0, durationSeconds - 1),
          Math.max(0, Math.round(actionSlotSeconds * unspecifiedActionIndex)),
        )
    const inferredEndSeconds = hasExplicitTiming
      ? null
      : Math.min(durationSeconds, (inferredStartSeconds ?? 0) + Math.max(1, Math.min(3, actionDuration)))
    if (!hasExplicitTiming) {
      unspecifiedActionIndex += 1
    }
    const startSeconds = action.startSeconds ?? inferredStartSeconds
    const endSeconds = action.endSeconds ?? inferredEndSeconds
    cursor = Math.max(cursor, endSeconds ?? cursor)
    return {
      ...action,
      startSeconds,
      endSeconds,
    }
  })

  const nextAudio = shot.audio.map((cue) => ({
    ...cue,
    startSeconds: cue.startSeconds ?? 0,
    endSeconds: cue.endSeconds ?? durationSeconds,
  }))

  const nextBeats = shot.beats.map((beat) => ({
    ...beat,
    startSeconds: beat.startSeconds ?? 0,
    endSeconds: beat.endSeconds ?? durationSeconds,
  }))

  return {
    ...shot,
    dialogue: nextDialogue,
    actions: nextActions,
    audio: nextAudio,
    beats: nextBeats,
  }
}

function buildTakeSourceRefIds(shots: Array<CinematicScriptShot>) {
  return Array.from(new Set(
    shots.flatMap((shot) => buildRequiredSourceRefIdsForScriptShot(shot)),
  ))
}

function buildTakeContinuityRefIds(shots: Array<CinematicScriptShot>) {
  return Array.from(new Set(
    shots.flatMap((shot) => [
      ...shot.participantRefIds,
      ...(shot.locationRefId ? [shot.locationRefId] : []),
      ...shot.propRefIds,
      ...shot.compositeRefIds,
      ...shot.storyboardRefIds,
    ]).filter((entry) => entry.trim().length > 0),
  ))
}

function sharesTakeParticipants(
  left: CinematicScriptShot & { _compiledDurationSeconds: number },
  right: CinematicScriptShot & { _compiledDurationSeconds: number },
) {
  const leftParticipants = new Set(left.participantRefIds)
  return right.participantRefIds.some((entry) => leftParticipants.has(entry))
}

function isStrongTakeFormatBreak(
  left: CinematicScriptShot & { _compiledDurationSeconds: number },
  right: CinematicScriptShot & { _compiledDurationSeconds: number },
) {
  return (
    (left.formatSubtype ?? null) !== (right.formatSubtype ?? null)
    || (left.formulaFamily ?? null) !== (right.formulaFamily ?? null)
    || (left.dominantTrigger ?? null) !== (right.dominantTrigger ?? null)
    || (left.contrastAxis.trim() || '') !== (right.contrastAxis.trim() || '')
  )
}

function coalesceTakeField<TValue>(shots: Array<CinematicScriptShot & { _compiledDurationSeconds: number }>, selector: (shot: CinematicScriptShot) => TValue, fallback: TValue) {
  for (const shot of shots) {
    const value = selector(shot)
    if (typeof value === 'string') {
      if (value.trim().length > 0) return value as TValue
      continue
    }
    if (value !== null && value !== undefined) return value
  }
  return fallback
}

function describeTakeBreakReason(input: {
  shot: CinematicScriptShot & { _compiledDurationSeconds: number }
  previousShot: (CinematicScriptShot & { _compiledDurationSeconds: number }) | null
  currentDuration: number
}) {
  const { shot, previousShot, currentDuration } = input
  if (shot.forceTakeBreak) return 'Explicit take break.'
  if (currentDuration + shot._compiledDurationSeconds > 15) return 'Split to stay within the 15-second take limit.'
  if (!previousShot) return ''

  const locationChanged = previousShot.locationRefId !== shot.locationRefId
  const sceneChanged = previousShot.sceneId !== shot.sceneId
  const sharedParticipants = sharesTakeParticipants(previousShot, shot)
  const formatChanged = isStrongTakeFormatBreak(previousShot, shot)
  const hardLocationJump = locationChanged && !sharedParticipants
  const hardSceneJump = sceneChanged && locationChanged && !sharedParticipants
  const softContinuityShift = (locationChanged || sceneChanged) && !hardLocationJump && !hardSceneJump

  if (formatChanged) return 'Split on a strong format or messaging shift.'
  if (hardSceneJump) return 'Split on a scene and location change with no shared participants.'
  if (hardLocationJump) return 'Split on a hard location change with no shared participants.'
  if (softContinuityShift && currentDuration >= 10) return 'Split on a softer continuity shift after a long take.'
  return ''
}

function buildCompiledTakes(shots: Array<CinematicScriptShot & {
  _compiledDurationSeconds: number
  _seedanceModePreference: z.infer<typeof seedanceModePreferenceSchema>
}>) {
  const takes: Array<z.infer<typeof cinematicTakeSpecSchema>> = []
  let currentShots: typeof shots = []
  let currentDuration = 0
  let currentStart = 0
  let currentBreakReason = ''

  function flushTake() {
    if (currentShots.length === 0) return
    const durationSeconds = Math.min(15, Math.max(4, currentDuration))
    const shotIds = currentShots.map((shot) => shot.id)
    const requiredSourceRefIds = buildTakeSourceRefIds(currentShots)
    const continuityRefIds = buildTakeContinuityRefIds(currentShots)
    const endpoint =
      currentShots.length === 1 && currentShots[0]._seedanceModePreference === 'image-to-video' && requiredSourceRefIds.length <= 1
        ? 'image-to-video'
        : 'reference-to-video'
    takes.push(cinematicTakeSpecSchema.parse({
      id: `take_${takes.length + 1}`,
      takeIndex: takes.length,
      title: `Take ${takes.length + 1}`,
      shotIds,
      durationSeconds,
      startSeconds: currentStart,
      endSeconds: currentStart + durationSeconds,
      breakReason: currentBreakReason,
      continuityRefIds,
      seedanceEndpoint: endpoint,
      formatSubtype: coalesceTakeField(currentShots, (shot) => shot.formatSubtype, null),
      formulaFamily: coalesceTakeField(currentShots, (shot) => shot.formulaFamily, null),
      dominantTrigger: coalesceTakeField(currentShots, (shot) => shot.dominantTrigger, null),
      contrastAxis: coalesceTakeField(currentShots, (shot) => shot.contrastAxis, ''),
      proofMoment: coalesceTakeField(currentShots, (shot) => shot.proofMoment, ''),
      ctaStyle: coalesceTakeField(currentShots, (shot) => shot.ctaStyle, ''),
      requiredSourceRefIds,
    }))
    currentStart += durationSeconds
    currentShots = []
    currentDuration = 0
    currentBreakReason = ''
  }

  for (const shot of shots) {
    const previousShot = currentShots.length > 0 ? currentShots[currentShots.length - 1] : null
    const locationChanged = Boolean(previousShot && previousShot.locationRefId !== shot.locationRefId)
    const sceneChanged = Boolean(previousShot && previousShot.sceneId !== shot.sceneId)
    const sharedParticipants = previousShot ? sharesTakeParticipants(previousShot, shot) : false
    const formatChanged = previousShot ? isStrongTakeFormatBreak(previousShot, shot) : false
    const hardLocationJump = locationChanged && !sharedParticipants
    const hardSceneJump = sceneChanged && locationChanged && !sharedParticipants
    const softContinuityShift = (locationChanged || sceneChanged) && !hardLocationJump && !hardSceneJump
    const continuityBreak = currentShots.length > 0 && (
      shot.forceTakeBreak
      || currentDuration + shot._compiledDurationSeconds > 15
      || formatChanged
      || hardLocationJump
      || hardSceneJump
      || (softContinuityShift && currentDuration >= 10)
    )
    if (continuityBreak) {
      const nextBreakReason = describeTakeBreakReason({
        shot,
        previousShot,
        currentDuration,
      })
      flushTake()
      currentBreakReason = nextBreakReason
    }
    currentShots.push(shot)
    currentDuration += shot._compiledDurationSeconds
  }
  flushTake()

  return takes
}

export function buildCinematicSequenceFromScriptDoc(scriptDoc: CinematicScriptDoc): CinematicSequence {
  const compiledShots = scriptDoc.shots.map((shot) => {
    const inferredTiming = inferShotDuration(shot)
    const timedShot = fillBeatTimingsForShot(shot, inferredTiming.durationSeconds)
    const sourceRefIds = buildRequiredSourceRefIdsForScriptShot(timedShot)
    return {
      ...timedShot,
      _compiledDurationSeconds: inferredTiming.durationSeconds,
      _timingSummary: inferredTiming.timingSummary,
      _durationSource: inferredTiming.durationSource,
      _seedanceModePreference:
        shot.storyboardRefIds.length > 0 || shot.compositeRefIds.length > 0 || sourceRefIds.length > 1
          ? 'reference-to-video' as const
          : 'auto' as const,
      _requiredSourceRefIds: sourceRefIds,
    }
  })
  const takes = buildCompiledTakes(compiledShots)
  const takeByShotId = new Map<string, { id: string; index: number }>()
  takes.forEach((take, index) => {
    take.shotIds.forEach((shotId) => takeByShotId.set(shotId, { id: take.id, index }))
  })

  return cinematicSequenceSchema.parse({
    title: scriptDoc.title,
    logline: scriptDoc.logline,
    tone: scriptDoc.tone,
    continuityNotes: scriptDoc.continuityNotes,
    statusPayoffType: scriptDoc.statusPayoffType,
    narrativeArcTemplate: scriptDoc.narrativeArcTemplate,
    references: scriptDoc.entityBindings.map((binding) => ({
      id: binding.id,
      refKind: inferSequenceReferenceKindFromBinding(binding),
      role: binding.role,
      label: binding.label,
      summary: binding.summary,
      definitionKey: binding.definitionKey,
      assetKey: binding.assetKey,
      assetRole: inferSequenceAssetRoleFromBinding(binding),
      stagingNotes: binding.stagingNotes,
      priority: binding.priority,
      required: binding.required,
    })),
    scenes: scriptDoc.scenes,
    compositeRefs: scriptDoc.compositeRefs,
    relationships: scriptDoc.relationships,
    storyboard: scriptDoc.storyboard,
    shots: compiledShots.map((shot) => ({
      sceneId: shot.sceneId,
      id: shot.id,
      title: shot.title,
      subtitle: shot.subtitle,
      beat: shot.beat,
      emotionalBeat: shot.emotionalBeat,
      hookRole: shot.hookRole,
      formatSubtype: shot.formatSubtype,
      formulaFamily: shot.formulaFamily,
      dominantTrigger: shot.dominantTrigger,
      hookType: shot.hookType,
      targetEmotion: shot.targetEmotion,
      personaStyle: shot.personaStyle,
      contrastAxis: shot.contrastAxis,
      proofMoment: shot.proofMoment,
      ctaStyle: shot.ctaStyle,
      proofType: shot.proofType,
      ctaType: shot.ctaType,
      platformTarget: shot.platformTarget,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: shot._requiredSourceRefIds,
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot._compiledDurationSeconds,
      inferredDurationSeconds: shot._durationSource === 'inferred' ? shot._compiledDurationSeconds : null,
      durationSource: shot._durationSource,
      timingSummary: shot._timingSummary,
      takeId: takeByShotId.get(shot.id)?.id ?? null,
      takeIndex: takeByShotId.get(shot.id)?.index ?? null,
      forceTakeBreak: shot.forceTakeBreak,
      seedanceModePreference: shot._seedanceModePreference,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    takes,
  })
}

function preserveCompiledShotRuntimeFields(
  compiledSequence: CinematicSequence,
  sourceSequence: CinematicSequence,
) {
  const sourceShotById = new Map(sourceSequence.shots.map((shot) => [shot.id, shot] as const))
  return compiledSequence.shots.map((shot) => {
    const source = sourceShotById.get(shot.id)
    if (!source) return shot
    return {
      ...shot,
      stillAssetKey: source.stillAssetKey ?? null,
      videoAssetKey: source.videoAssetKey ?? null,
      lastRunId: source.lastRunId ?? null,
      lastStillJobId: source.lastStillJobId ?? null,
      lastVideoJobId: source.lastVideoJobId ?? null,
      provider: source.provider ?? null,
      providerModel: source.providerModel ?? null,
      providerRequestId: source.providerRequestId ?? null,
      executionPlan: source.executionPlan ?? null,
    }
  })
}

function preserveCompiledTakeRuntimeFields(
  compiledSequence: CinematicSequence,
  sourceSequence: CinematicSequence,
) {
  return compiledSequence.takes.map((take, index) => {
    const source = sourceSequence.takes[index] ?? null
    if (!source) return take
    return {
      ...take,
      previewImageAssetKey: source.previewImageAssetKey ?? null,
      storyboardAssetKey: source.storyboardAssetKey ?? null,
      outputVideoAssetKey: source.outputVideoAssetKey ?? null,
      outputStillAssetKey: source.outputStillAssetKey ?? null,
      approvedForVideo: source.approvedForVideo ?? false,
      approvalNotes: source.approvalNotes ?? '',
      lastRunId: source.lastRunId ?? null,
      lastStoryboardJobId: source.lastStoryboardJobId ?? null,
      lastStillJobId: source.lastStillJobId ?? null,
      lastVideoJobId: source.lastVideoJobId ?? null,
      provider: source.provider ?? null,
      providerModel: source.providerModel ?? null,
      providerRequestId: source.providerRequestId ?? null,
      executionPlan: source.executionPlan ?? null,
    }
  })
}

export function compileCinematicSequence(sequence: CinematicSequence): CinematicSequence {
  const parsedSequence = cinematicSequenceSchema.parse(sequence)
  const compiledSequence = buildCinematicSequenceFromScriptDoc(deriveCinematicScriptFromSequence(parsedSequence))
  const indexedCompiledSequence = {
    ...compiledSequence,
    takes: compiledSequence.takes.map((take, index) => ({
      ...take,
      takeIndex: index,
    })),
  } as CinematicSequence
  return cinematicSequenceSchema.parse({
    ...indexedCompiledSequence,
    shots: preserveCompiledShotRuntimeFields(indexedCompiledSequence, parsedSequence),
    takes: preserveCompiledTakeRuntimeFields(indexedCompiledSequence, parsedSequence),
  })
}

export function deriveCinematicScriptFromSequence(sequence: CinematicSequence): CinematicScriptDoc {
  const parsedSequence = cinematicSequenceSchema.parse(sequence)
  const normalizedScenes = parsedSequence.scenes.length > 0
    ? [...parsedSequence.scenes]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((scene, index) => ({
        ...scene,
        shotIds: scene.shotIds.filter((shotId) => parsedSequence.shots.some((shot) => shot.id === shotId)),
        orderIndex: index,
      }))
    : (parsedSequence.shots.length > 0
      ? [{
          id: 'scene_1',
          title: 'Scene 1',
          summary: parsedSequence.logline,
          locationRefId: parsedSequence.shots[0]?.locationRefId ?? null,
          shotIds: parsedSequence.shots.map((shot) => shot.id),
          continuityNotes: parsedSequence.continuityNotes,
          orderIndex: 0,
        }]
      : [])
  const fallbackSceneId = normalizedScenes[0]?.id ?? null

  return cinematicScriptDocSchema.parse({
    title: parsedSequence.title || (parsedSequence.shots[0]?.title ? `${parsedSequence.shots[0].title} Sequence` : 'Prompt Cinematic'),
    logline: parsedSequence.logline || parsedSequence.shots.map((shot) => shot.beat).filter((entry) => entry.trim().length > 0).join(' '),
    tone: parsedSequence.tone,
    continuityNotes: parsedSequence.continuityNotes,
    statusPayoffType: parsedSequence.statusPayoffType,
    narrativeArcTemplate: parsedSequence.narrativeArcTemplate,
    sceneCount: normalizedScenes.length > 0 ? normalizedScenes.length : null,
    referenceVault: [],
    entityBindings: parsedSequence.references.map((reference) => ({
      id: reference.id,
      kind:
        reference.assetRole === 'audio'
          ? 'audio'
          : reference.assetRole === 'style'
            ? 'style'
            : reference.assetRole === 'environment'
              ? 'environment'
              : reference.assetRole === 'item'
                ? 'item'
                : 'character',
      role: reference.role,
      label: reference.label,
      sourceName: reference.label,
      summary: reference.summary,
      definitionKey: reference.definitionKey,
      assetKey: reference.assetKey,
      stagingNotes: reference.stagingNotes,
      priority: reference.priority,
      required: reference.required,
    })),
    scenes: normalizedScenes,
    shots: parsedSequence.shots.map((shot, index) => ({
      id: shot.id,
      sceneId: shot.sceneId ?? normalizedScenes.find((scene) => scene.shotIds.includes(shot.id))?.id ?? fallbackSceneId,
      orderIndex: index,
      title: shot.title,
      subtitle: shot.subtitle,
      beat: shot.beat,
      emotionalBeat: shot.emotionalBeat,
      hookRole: shot.hookRole,
      formatSubtype: shot.formatSubtype,
      formulaFamily: shot.formulaFamily,
      dominantTrigger: shot.dominantTrigger,
      hookType: shot.hookType,
      targetEmotion: shot.targetEmotion,
      personaStyle: shot.personaStyle,
      contrastAxis: shot.contrastAxis,
      proofMoment: shot.proofMoment,
      ctaStyle: shot.ctaStyle,
      proofType: shot.proofType,
      ctaType: shot.ctaType,
      platformTarget: shot.platformTarget,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      continuityNotes: '',
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: shot.requiredSourceRefIds,
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot.durationSeconds,
      forceTakeBreak: shot.forceTakeBreak,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    relationships: parsedSequence.relationships,
    compositeRefs: parsedSequence.compositeRefs,
    storyboard: parsedSequence.storyboard,
  })
}

export function getCinematicSettings(gameSpec: unknown, graphMetadata: unknown): CinematicSettings {
  const rawProjectCinematics =
    gameSpec && typeof gameSpec === 'object' && (gameSpec as { cinematics?: unknown }).cinematics && typeof (gameSpec as { cinematics?: unknown }).cinematics === 'object'
      ? (gameSpec as { cinematics?: Record<string, unknown> }).cinematics ?? {}
      : {}
  const rawGraphCinematics =
    graphMetadata && typeof graphMetadata === 'object' && (graphMetadata as { cinematics?: unknown }).cinematics && typeof (graphMetadata as { cinematics?: unknown }).cinematics === 'object'
      ? (graphMetadata as { cinematics?: Record<string, unknown> }).cinematics ?? {}
      : {}
  const gameSpecCinematics = cinematicSettingsSchema.partial().safeParse(
    rawProjectCinematics,
  )
  const graphCinematics = cinematicSettingsSchema.partial().safeParse(
    rawGraphCinematics,
  )

  const projectOverrides: Partial<CinematicSettings> = gameSpecCinematics.success
    ? Object.fromEntries(Object.keys(rawProjectCinematics).map((key) => [key, gameSpecCinematics.data[key as keyof typeof gameSpecCinematics.data]])) as Partial<CinematicSettings>
    : {}
  const graphOverrides: Partial<CinematicSettings> = graphCinematics.success
    ? Object.fromEntries(Object.keys(rawGraphCinematics).map((key) => [key, graphCinematics.data[key as keyof typeof graphCinematics.data]])) as Partial<CinematicSettings>
    : {}
  const presetFamily =
    graphOverrides.presetFamily
    ?? projectOverrides.presetFamily
    ?? (graphOverrides.specializationMode ? derivePresetFamilyFromSpecializationMode(graphOverrides.specializationMode) : null)
    ?? (projectOverrides.specializationMode ? derivePresetFamilyFromSpecializationMode(projectOverrides.specializationMode) : null)
    ?? defaultCinematicSettings.presetFamily
  const presetId =
    graphOverrides.presetId
    ?? graphOverrides.presetFamily
    ?? projectOverrides.presetId
    ?? projectOverrides.presetFamily
    ?? presetFamily
  const formatSubtype = coerceFormatSubtypeForPresetFamily(
    presetFamily,
    graphOverrides.formatSubtype
    ?? projectOverrides.formatSubtype
    ?? null,
  )
  const formulaFamily =
    graphOverrides.formulaFamily
    ?? projectOverrides.formulaFamily
    ?? deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype)
  const dominantTrigger =
    graphOverrides.dominantTrigger
    ?? projectOverrides.dominantTrigger
    ?? deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype)
  const formatDefaults = deriveUgcShotDefaults({
    presetFamily,
    formatSubtype,
    shotIndex: 0,
    shotCount: 1,
    hookRole: 'hook',
  })
  const stillAspectRatio =
    graphOverrides.stillAspectRatio
    ?? projectOverrides.stillAspectRatio
    ?? getUgcPresetProfile(formatSubtype, presetFamily)?.preferredAspectRatio
    ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily)

  return {
    ...defaultCinematicSettings,
    ...projectOverrides,
    ...graphOverrides,
    artStylePreset:
      (typeof graphOverrides.artStylePreset === 'string' && graphOverrides.artStylePreset.trim().length > 0 ? graphOverrides.artStylePreset : null)
      ?? (typeof projectOverrides.artStylePreset === 'string' && projectOverrides.artStylePreset.trim().length > 0 ? projectOverrides.artStylePreset : null)
      ?? null,
    inferredArtStylePreset:
      (typeof graphOverrides.inferredArtStylePreset === 'string' && graphOverrides.inferredArtStylePreset.trim().length > 0 ? graphOverrides.inferredArtStylePreset : null)
      ?? (typeof projectOverrides.inferredArtStylePreset === 'string' && projectOverrides.inferredArtStylePreset.trim().length > 0 ? projectOverrides.inferredArtStylePreset : null)
      ?? getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype }),
    useInferredArtStyle:
      typeof graphOverrides.useInferredArtStyle === 'boolean'
        ? graphOverrides.useInferredArtStyle
        : typeof projectOverrides.useInferredArtStyle === 'boolean'
          ? projectOverrides.useInferredArtStyle
          : defaultCinematicSettings.useInferredArtStyle,
    presetFamily,
    presetId,
    formatSubtype,
    formulaFamily,
    dominantTrigger,
    proofMoment:
      (typeof graphOverrides.proofMoment === 'string' && graphOverrides.proofMoment.trim().length > 0 ? graphOverrides.proofMoment : null)
      ?? (typeof projectOverrides.proofMoment === 'string' && projectOverrides.proofMoment.trim().length > 0 ? projectOverrides.proofMoment : null)
      ?? formatDefaults.proofMoment,
    ctaStyle:
      (typeof graphOverrides.ctaStyle === 'string' && graphOverrides.ctaStyle.trim().length > 0 ? graphOverrides.ctaStyle : null)
      ?? (typeof projectOverrides.ctaStyle === 'string' && projectOverrides.ctaStyle.trim().length > 0 ? projectOverrides.ctaStyle : null)
      ?? formatDefaults.ctaStyle,
    contrastAxis:
      (typeof graphOverrides.contrastAxis === 'string' && graphOverrides.contrastAxis.trim().length > 0 ? graphOverrides.contrastAxis : null)
      ?? (typeof projectOverrides.contrastAxis === 'string' && projectOverrides.contrastAxis.trim().length > 0 ? projectOverrides.contrastAxis : null)
      ?? formatDefaults.contrastAxis,
    defaultClipSeconds:
      graphOverrides.defaultClipSeconds
      ?? projectOverrides.defaultClipSeconds
      ?? getUgcPresetProfile(formatSubtype, presetFamily)?.preferredClipSeconds
      ?? defaultCinematicSettings.defaultClipSeconds,
    stillAspectRatio,
    specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
  }
}

export function getCinematicScript(graphMetadata: unknown): CinematicScriptDoc | null {
  const metadata = graphMetadata && typeof graphMetadata === 'object'
    ? graphMetadata as { cinematicScript?: unknown; cinematicSequence?: unknown }
    : {}
  const parsedSequence = cinematicSequenceSchema.safeParse(metadata.cinematicSequence ?? null)
  if (parsedSequence.success) return deriveCinematicScriptFromSequence(compileCinematicSequence(parsedSequence.data))
  const parsedScript = cinematicScriptDocSchema.safeParse(metadata.cinematicScript ?? null)
  if (parsedScript.success) return parsedScript.data

  return null
}

export function getCinematicSequence(graphMetadata: unknown): CinematicSequence {
  const metadata = graphMetadata && typeof graphMetadata === 'object'
    ? graphMetadata as { cinematicSequence?: unknown; cinematicScript?: unknown }
    : {}
  const parsed = cinematicSequenceSchema.safeParse(metadata.cinematicSequence ?? {})
  if (parsed.success) return compileCinematicSequence(parsed.data)

  const parsedScript = cinematicScriptDocSchema.safeParse(metadata.cinematicScript ?? null)
  return parsedScript.success ? buildCinematicSequenceFromScriptDoc(parsedScript.data) : cinematicSequenceSchema.parse({})
}

export function getAssetRefNodeConfig(node: { metadata?: unknown } | null | undefined): AssetRefNodeConfig {
  const parsed = assetRefNodeConfigSchema.safeParse(node?.metadata ?? {})
  return parsed.success ? parsed.data : defaultAssetRefNodeConfig
}

export function getCompositeRefNodeConfig(node: { metadata?: unknown } | null | undefined): CompositeRefNodeConfig {
  const parsed = compositeRefNodeConfigSchema.safeParse(node?.metadata ?? {})
  return parsed.success ? parsed.data : defaultCompositeRefNodeConfig
}

export function getStoryboardRefNodeConfig(node: { metadata?: unknown } | null | undefined): StoryboardRefNodeConfig {
  const parsed = storyboardRefNodeConfigSchema.safeParse(node?.metadata ?? {})
  return parsed.success ? parsed.data : defaultStoryboardRefNodeConfig
}

export function getCinematicTakeNodeConfig(node: { metadata?: unknown; key?: unknown; title?: unknown } | null | undefined): CinematicTakeNodeConfig {
  const metadata = node?.metadata && typeof node.metadata === 'object' ? node.metadata as Record<string, unknown> : {}
  const inferredTakeIndex =
    typeof node?.key === 'string'
      ? (() => {
          const match = node.key.match(/\.cinematic_take_(\d+)(?:_|$)/)
          if (!match) return null
          const parsed = Number(match[1])
          return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null
        })()
      : null
  const parsed = cinematicTakeNodeConfigSchema.safeParse({
    id: typeof metadata.id === 'string'
      ? metadata.id
      : typeof metadata.takeId === 'string'
        ? metadata.takeId
      : typeof node?.key === 'string'
        ? node.key
        : defaultTakeNodeConfig.id,
    takeIndex: typeof metadata.takeIndex === 'number' ? metadata.takeIndex : inferredTakeIndex,
    title: typeof node?.title === 'string' ? node.title : defaultTakeNodeConfig.title,
    ...metadata,
  })
  return parsed.success ? parsed.data : defaultTakeNodeConfig
}

export function getCinematicShotNodeConfig(node: { metadata?: unknown; key?: unknown; title?: unknown } | null | undefined): CinematicShotNodeConfig {
  const metadata = node?.metadata && typeof node.metadata === 'object' ? node.metadata as Record<string, unknown> : {}
  const parsed = cinematicShotSpecSchema.safeParse({
    id: typeof metadata.sequenceShotId === 'string'
      ? metadata.sequenceShotId
      : typeof node?.key === 'string'
        ? node.key
        : defaultShotNodeConfig.id,
    title: typeof node?.title === 'string' ? node.title : defaultShotNodeConfig.title,
    ...metadata,
  })
  return parsed.success ? parsed.data : defaultShotNodeConfig
}

export function updateNodeMetadataWithAssetRef(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<AssetRefNodeConfig>,
) {
  return {
    ...(metadata ?? {}),
    ...getAssetRefNodeConfig({ metadata }),
    ...changes,
  }
}

export function updateNodeMetadataWithCompositeRef(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<CompositeRefNodeConfig>,
) {
  return {
    ...(metadata ?? {}),
    ...getCompositeRefNodeConfig({ metadata }),
    ...changes,
  }
}

export function updateNodeMetadataWithStoryboardRef(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<StoryboardRefNodeConfig>,
) {
  return {
    ...(metadata ?? {}),
    ...getStoryboardRefNodeConfig({ metadata }),
    ...changes,
  }
}

export function updateNodeMetadataWithTake(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<CinematicTakeNodeConfig>,
) {
  const current = getCinematicTakeNodeConfig({ metadata })
  const resolvedId =
    typeof changes.id === 'string' && changes.id.trim().length > 0
      ? changes.id
      : current.id
  const resolvedTakeIndex =
    typeof changes.takeIndex === 'number'
      ? changes.takeIndex
      : current.takeIndex
  return {
    ...(metadata ?? {}),
    ...current,
    ...changes,
    id: resolvedId,
    takeId: resolvedId,
    takeIndex: resolvedTakeIndex,
  }
}

export function updateNodeMetadataWithShot(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<CinematicShotNodeConfig>,
) {
  const current = getCinematicShotNodeConfig({ metadata })
  const resolvedId =
    typeof changes.id === 'string' && changes.id.trim().length > 0
      ? changes.id
      : current.id
  return {
    ...(metadata ?? {}),
    ...current,
    ...changes,
    id: resolvedId,
    sequenceShotId: resolvedId,
  }
}
