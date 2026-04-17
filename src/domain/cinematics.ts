import { z } from 'zod'
import {
  deriveUgcShotDefaults,
  getDefaultUgcFormatSubtypeForPresetFamily,
  getUgcDefaultShotDurationSeconds,
  getUgcDurationRangeForShot,
  getUgcPresetProfile,
  resolveUgcCreativeProfile,
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
export const cinematicCreativeTreatmentSchema = z.enum([
  'creator_direct_to_camera',
  'narrator_over_backdrop',
  'faceless_proof_demo',
  'contrast_split',
  'aesthetic_mismatch',
  'comedic_absurd_container',
])
export const cinematicHookFamilySchema = z.enum([
  'sharp_pain_confession',
  'wrong_belief_interrupt',
  'danger_reframe',
  'status_or_before_after_contrast',
  'social_drama_open_loop',
  'odd_visual_plus_serious_narration',
])
export const cinematicNarrationModeSchema = z.enum([
  'spoken_to_camera',
  'spoken_over_footage',
  'sparse_overlay',
  'visual_only',
])
export const cinematicBackdropRoleSchema = z.enum([
  'engagement_backdrop',
  'proof_backdrop',
  'contrast_backdrop',
  'comedic_backdrop',
  'aesthetic_backdrop',
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
export const cinematicReferenceRoleSchema = z.enum([
  'subject_lock',
  'prop_lock',
  'environment_lock',
  'composite_lock',
  'board_lock',
  'style_lock',
  'proof_surface_lock',
])
export const cinematicDownstreamUseSchema = z.enum(['showcase', 'continuity', 'proof_surface'])
export const cinematicDirectingPackageSchema = z.object({
  subjectAnchor: z.string().default(''),
  dominantAction: z.string().default(''),
  primaryCameraMove: z.string().default(''),
  styleDirectives: z.array(z.string()).default([]),
  continuityConstraints: z.array(z.string()).default([]),
  proofSurfaceRole: z.string().default(''),
})
export const cinematicReferencePlanSchema = z.object({
  requiredRoles: z.array(cinematicReferenceRoleSchema).default([]),
  preferredPrimaryRefRole: cinematicReferenceRoleSchema.nullable().default(null),
  maxReferenceCount: z.number().int().min(1).max(12).default(6),
  dropOrder: z.array(cinematicReferenceRoleSchema).default([]),
})
const defaultCinematicDirectingPackage = () => ({
  subjectAnchor: '',
  dominantAction: '',
  primaryCameraMove: '',
  styleDirectives: [] as string[],
  continuityConstraints: [] as string[],
  proofSurfaceRole: '',
})
const defaultCinematicReferencePlan = () => ({
  requiredRoles: [] as z.infer<typeof cinematicReferenceRoleSchema>[],
  preferredPrimaryRefRole: null as z.infer<typeof cinematicReferenceRoleSchema> | null,
  maxReferenceCount: 6,
  dropOrder: [] as z.infer<typeof cinematicReferenceRoleSchema>[],
})

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
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
  variationGroupId: z.string().default(''),
  variationLabel: z.string().default(''),
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
  backdropRefIds: z.array(z.string()).default([]),
  requiredSourceRefIds: z.array(z.string()).default([]),
  compositeRefIds: z.array(z.string()).default([]),
  storyboardRefIds: z.array(z.string()).default([]),
  directingPackage: cinematicDirectingPackageSchema.default(defaultCinematicDirectingPackage),
  referencePlan: cinematicReferencePlanSchema.default(defaultCinematicReferencePlan),
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
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
  variationGroupId: z.string().default(''),
  variationLabel: z.string().default(''),
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
  backdropRefIds: z.array(z.string()).default([]),
  requiredSourceRefIds: z.array(z.string()).default([]),
  compositeRefIds: z.array(z.string()).default([]),
  storyboardRefIds: z.array(z.string()).default([]),
  directingPackage: cinematicDirectingPackageSchema.default(defaultCinematicDirectingPackage),
  referencePlan: cinematicReferencePlanSchema.default(defaultCinematicReferencePlan),
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
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
  variationGroupId: z.string().default(''),
  variationLabel: z.string().default(''),
  artStylePreset: z.string().nullable().default(null),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  requiredSourceRefIds: z.array(z.string()).default([]),
  directingPackage: cinematicDirectingPackageSchema.default(defaultCinematicDirectingPackage),
  referencePlan: cinematicReferencePlanSchema.default(defaultCinematicReferencePlan),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
  referenceRole: cinematicReferenceRoleSchema.nullable().default(null),
  downstreamUse: cinematicDownstreamUseSchema.nullable().default(null),
  captureProfile: z.string().nullable().default(null),
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
export type CinematicCreativeTreatment = z.infer<typeof cinematicCreativeTreatmentSchema>
export type CinematicHookFamily = z.infer<typeof cinematicHookFamilySchema>
export type CinematicNarrationMode = z.infer<typeof cinematicNarrationModeSchema>
export type CinematicBackdropRole = z.infer<typeof cinematicBackdropRoleSchema>
export type CinematicReferenceRole = z.infer<typeof cinematicReferenceRoleSchema>
export type CinematicDownstreamUse = z.infer<typeof cinematicDownstreamUseSchema>
export type CinematicDirectingPackage = z.infer<typeof cinematicDirectingPackageSchema>
export type CinematicReferencePlan = z.infer<typeof cinematicReferencePlanSchema>
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

export function getCinematicCreativeTreatmentLabel(creativeTreatment: CinematicCreativeTreatment) {
  switch (creativeTreatment) {
    case 'creator_direct_to_camera':
      return 'Creator Direct to Camera'
    case 'narrator_over_backdrop':
      return 'Narrator Over Backdrop'
    case 'faceless_proof_demo':
      return 'Faceless Proof Demo'
    case 'contrast_split':
      return 'Contrast Split'
    case 'aesthetic_mismatch':
      return 'Aesthetic Mismatch'
    case 'comedic_absurd_container':
      return 'Comedic / Absurd Container'
  }
}

export function getCinematicNarrationModeLabel(narrationMode: CinematicNarrationMode) {
  switch (narrationMode) {
    case 'spoken_to_camera':
      return 'Spoken to Camera'
    case 'spoken_over_footage':
      return 'Spoken Over Footage'
    case 'sparse_overlay':
      return 'Sparse Overlay'
    case 'visual_only':
      return 'Visual Only'
  }
}

export function getCinematicHookFamilyLabel(hookFamily: CinematicHookFamily) {
  switch (hookFamily) {
    case 'sharp_pain_confession':
      return 'Sharp Pain Confession'
    case 'wrong_belief_interrupt':
      return 'Wrong Belief Interrupt'
    case 'danger_reframe':
      return 'Danger Reframe'
    case 'status_or_before_after_contrast':
      return 'Status / Before-After Contrast'
    case 'social_drama_open_loop':
      return 'Social Drama Open Loop'
    case 'odd_visual_plus_serious_narration':
      return 'Odd Visual Plus Serious Narration'
  }
}

export function buildCinematicSettingsPatchFromFormatSubtype(
  presetFamily: CinematicPresetFamily,
  formatSubtype: CinematicFormatSubtype | null,
): Pick<CinematicSettings, 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'creativeTreatment' | 'hookFamily' | 'narrationMode' | 'backdropRole' | 'backdropStrategy' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset'> {
  const nextSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, formatSubtype)
  const profile = getUgcPresetProfile(nextSubtype, presetFamily)
  const creativeProfile = resolveUgcCreativeProfile({
    formatSubtype: nextSubtype,
    presetFamily,
  })
  return {
    formatSubtype: nextSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(nextSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(nextSubtype),
    creativeTreatment: creativeProfile.creativeTreatment,
    hookFamily: creativeProfile.hookFamily,
    narrationMode: creativeProfile.narrationMode,
    backdropRole: creativeProfile.backdropRole,
    backdropStrategy: creativeProfile.backdropStrategy,
    proofMoment: profile?.defaultProofMoment ?? '',
    ctaStyle: profile?.defaultCtaStyle ?? '',
    contrastAxis: profile?.defaultContrastAxis ?? '',
    stillAspectRatio: profile?.preferredAspectRatio ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
    defaultClipSeconds: profile?.preferredClipSeconds ?? defaultCinematicSettings.defaultClipSeconds,
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype: nextSubtype }),
  }
}

export function buildCinematicSettingsPatchFromPresetFamily(presetFamily: CinematicPresetFamily): Pick<CinematicSettings, 'presetFamily' | 'presetId' | 'specializationMode' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'creativeTreatment' | 'hookFamily' | 'narrationMode' | 'backdropRole' | 'backdropStrategy' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset'> {
  const formatSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, null)
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  const creativeProfile = resolveUgcCreativeProfile({
    formatSubtype,
    presetFamily,
  })
  return {
    presetFamily,
    presetId: presetFamily,
    stillAspectRatio: profile?.preferredAspectRatio ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
    defaultClipSeconds: profile?.preferredClipSeconds ?? defaultCinematicSettings.defaultClipSeconds,
    formatSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype),
    creativeTreatment: creativeProfile.creativeTreatment,
    hookFamily: creativeProfile.hookFamily,
    narrationMode: creativeProfile.narrationMode,
    backdropRole: creativeProfile.backdropRole,
    backdropStrategy: creativeProfile.backdropStrategy,
    proofMoment: profile?.defaultProofMoment ?? '',
    ctaStyle: profile?.defaultCtaStyle ?? '',
    contrastAxis: profile?.defaultContrastAxis ?? '',
    specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype }),
  }
}

const UGC_REFERENCE_DROP_ORDER: CinematicReferenceRole[] = [
  'proof_surface_lock',
  'board_lock',
  'composite_lock',
  'subject_lock',
  'prop_lock',
  'environment_lock',
  'style_lock',
]

const STORY_REFERENCE_DROP_ORDER: CinematicReferenceRole[] = [
  'board_lock',
  'composite_lock',
  'subject_lock',
  'environment_lock',
  'prop_lock',
  'style_lock',
  'proof_surface_lock',
]

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)))
}

function splitDirectingClauses(...values: Array<string | null | undefined>) {
  return uniqueStrings(values.flatMap((value) => {
    if (typeof value !== 'string') return []
    return value
      .split(/[.;]\s+|\n+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }))
}

function clipText(value: string, max = 140) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function inferShotProofSurfaceRole(shot: Pick<CinematicScriptShot, 'proofType' | 'proofMoment' | 'ctaType' | 'beat' | 'visualPrompt' | 'compositionGuide' | 'hookRole' | 'formatSubtype' | 'propRefIds'>) {
  const combined = [
    shot.proofType,
    shot.proofMoment,
    shot.ctaType,
    shot.beat,
    shot.visualPrompt,
    shot.compositionGuide,
  ].join(' ').toLowerCase()
  const subtype = shot.formatSubtype ?? null
  const adLike = typeof subtype === 'string' && (subtype.startsWith('ad_') || subtype === 'contrast_narrative')
  if (/\b(phone|screen|app|receipt|label|product|proof|package|countertop|demo)\b/.test(combined)) {
    return /\bapp|phone|screen\b/.test(combined)
      ? 'readable phone or app proof surface'
      : /\breceipt|countertop|label|package\b/.test(combined)
        ? 'readable proof surface'
        : 'product proof surface'
  }
  if ((shot.hookRole === 'proof' || shot.hookRole === 'cta' || adLike) && shot.propRefIds.length > 0) {
    return 'proof-carrying prop or product surface'
  }
  return ''
}

export function inferShotDirectingPackage(input: {
  shot: Pick<CinematicScriptShot, 'beat' | 'cameraMovement' | 'framing' | 'cameraAngle' | 'lensPreference' | 'visualPrompt' | 'compositionGuide' | 'proofType' | 'proofMoment' | 'ctaType' | 'hookRole' | 'formatSubtype' | 'participantRefIds' | 'propRefIds' | 'locationRefId' | 'actions'>
  current?: Partial<CinematicDirectingPackage> | null
}) {
  const proofSurfaceRole = inferShotProofSurfaceRole(input.shot)
  const firstAction = input.shot.actions.find((action) => action.verb.trim().length > 0)
  const subjectAnchor =
    input.current?.subjectAnchor?.trim()
    || (proofSurfaceRole && input.shot.participantRefIds.length === 0 ? proofSurfaceRole : '')
    || (input.shot.participantRefIds.length > 1
      ? `locked primary subject with ${input.shot.participantRefIds.length - 1} supporting participants`
      : input.shot.participantRefIds.length === 1
        ? 'locked primary subject'
        : input.shot.propRefIds.length > 0
          ? 'locked hero prop or product'
          : input.shot.locationRefId
            ? 'locked environment anchor'
            : clipText(input.shot.beat))
  const dominantAction =
    input.current?.dominantAction?.trim()
    || firstAction?.verb.trim()
    || clipText(input.shot.beat)
  const primaryCameraMove =
    input.current?.primaryCameraMove?.trim()
    || input.shot.cameraMovement.trim()
    || [input.shot.framing.trim(), input.shot.cameraAngle.trim()].filter(Boolean).join(', ')
  const styleDirectives = uniqueStrings([
    ...(input.current?.styleDirectives ?? []),
    ...splitDirectingClauses(input.shot.lensPreference, input.shot.visualPrompt),
  ])
  const continuityConstraints = uniqueStrings([
    ...(input.current?.continuityConstraints ?? []),
    ...splitDirectingClauses(
      input.shot.compositionGuide,
      proofSurfaceRole ? `keep ${proofSurfaceRole} readable and stable` : '',
      input.shot.participantRefIds.length > 0 ? 'preserve subject identity and wardrobe continuity' : '',
      input.shot.propRefIds.length > 0 ? 'preserve prop position and continuity' : '',
      input.shot.locationRefId ? 'preserve environment continuity' : '',
    ),
  ])
  return cinematicDirectingPackageSchema.parse({
    subjectAnchor,
    dominantAction,
    primaryCameraMove,
    styleDirectives,
    continuityConstraints,
    proofSurfaceRole: input.current?.proofSurfaceRole?.trim() || proofSurfaceRole,
  })
}

export function inferShotReferencePlan(input: {
  shot: Pick<CinematicScriptShot, 'participantRefIds' | 'propRefIds' | 'locationRefId' | 'compositeRefIds' | 'storyboardRefIds' | 'proofType' | 'proofMoment' | 'ctaType' | 'beat' | 'visualPrompt' | 'compositionGuide' | 'hookRole' | 'formatSubtype'>
  current?: Partial<CinematicReferencePlan> | null
  presetFamily: CinematicPresetFamily
}) {
  const proofSurfaceRole = inferShotProofSurfaceRole({
    ...input.shot,
    ctaType: input.shot.ctaType,
  })
  const requiredRoles = uniqueStrings([
    ...(input.current?.requiredRoles ?? []),
    ...(input.shot.storyboardRefIds.length > 0 ? ['board_lock'] : []),
    ...(input.shot.compositeRefIds.length > 0 ? ['composite_lock'] : []),
    ...(input.shot.participantRefIds.length > 0 ? ['subject_lock'] : []),
    ...(input.shot.propRefIds.length > 0 ? ['prop_lock'] : []),
    ...(input.shot.locationRefId ? ['environment_lock'] : []),
    ...(proofSurfaceRole ? ['proof_surface_lock'] : []),
  ]) as CinematicReferenceRole[]
  const dropOrder = (
    input.current?.dropOrder?.length
      ? input.current.dropOrder
      : input.presetFamily === 'story_movie_tv'
        ? STORY_REFERENCE_DROP_ORDER
        : UGC_REFERENCE_DROP_ORDER
  ).filter((role) => requiredRoles.includes(role) || role === 'style_lock')
  const preferredPrimaryRefRole =
    input.current?.preferredPrimaryRefRole
    ?? (requiredRoles.includes('proof_surface_lock')
      ? 'proof_surface_lock'
      : requiredRoles.includes('board_lock')
        ? 'board_lock'
        : requiredRoles.includes('composite_lock')
          ? 'composite_lock'
          : requiredRoles.includes('subject_lock')
            ? 'subject_lock'
            : requiredRoles[0] ?? null)
  return cinematicReferencePlanSchema.parse({
    requiredRoles,
    preferredPrimaryRefRole,
    maxReferenceCount: input.current?.maxReferenceCount ?? (input.presetFamily === 'story_movie_tv' ? 8 : 6),
    dropOrder,
  })
}

export function inferReferenceRoleFromBinding(binding: Pick<CinematicScriptEntityBinding, 'kind' | 'role'>): CinematicReferenceRole | null {
  const roleText = `${binding.kind} ${binding.role}`.toLowerCase()
  if (binding.kind === 'style') return 'style_lock'
  if (/\bproof|receipt|screen|phone|product\b/.test(roleText)) return 'proof_surface_lock'
  if (/\bcreator|character|speaker|subject\b/.test(roleText) || binding.kind === 'character') return 'subject_lock'
  if (/\benvironment|location|setting\b/.test(roleText) || binding.kind === 'environment') return 'environment_lock'
  if (binding.kind === 'item') return 'prop_lock'
  return null
}

export function inferReferenceDownstreamUse(input: {
  current: CinematicDownstreamUse | null | undefined
  referenceRole: CinematicReferenceRole | null | undefined
  required: boolean
  isUgcFlow: boolean
}) {
  if (input.current) return input.current
  if (input.isUgcFlow && input.required) return 'continuity' as const
  if (input.referenceRole === 'proof_surface_lock') return 'proof_surface' as const
  return null
}

export function inferTakeDirectingPackage(
  shots: Array<CinematicScriptShot & { directingPackage: CinematicDirectingPackage }>,
  current?: Partial<CinematicDirectingPackage> | null,
) {
  return cinematicDirectingPackageSchema.parse({
    subjectAnchor:
      current?.subjectAnchor?.trim()
      || shots.map((shot) => shot.directingPackage.subjectAnchor).find((value) => value.trim().length > 0)
      || '',
    dominantAction:
      current?.dominantAction?.trim()
      || clipText(shots.map((shot) => shot.directingPackage.dominantAction).filter((value) => value.trim().length > 0).join(' -> '), 160),
    primaryCameraMove:
      current?.primaryCameraMove?.trim()
      || clipText(uniqueStrings(shots.map((shot) => shot.directingPackage.primaryCameraMove)).join(' -> '), 160),
    styleDirectives: uniqueStrings([
      ...(current?.styleDirectives ?? []),
      ...shots.flatMap((shot) => shot.directingPackage.styleDirectives),
    ]),
    continuityConstraints: uniqueStrings([
      ...(current?.continuityConstraints ?? []),
      ...shots.flatMap((shot) => shot.directingPackage.continuityConstraints),
    ]),
    proofSurfaceRole:
      current?.proofSurfaceRole?.trim()
      || shots.map((shot) => shot.directingPackage.proofSurfaceRole).find((value) => value.trim().length > 0)
      || '',
  })
}

export function inferTakeReferencePlan(
  shots: Array<CinematicScriptShot & { referencePlan: CinematicReferencePlan }>,
  presetFamily: CinematicPresetFamily,
  current?: Partial<CinematicReferencePlan> | null,
) {
  const requiredRoles = uniqueStrings([
    ...(current?.requiredRoles ?? []),
    ...shots.flatMap((shot) => shot.referencePlan.requiredRoles),
  ]) as CinematicReferenceRole[]
  const baseDropOrder =
    current?.dropOrder?.length
      ? current.dropOrder
      : presetFamily === 'story_movie_tv'
        ? STORY_REFERENCE_DROP_ORDER
        : UGC_REFERENCE_DROP_ORDER
  return cinematicReferencePlanSchema.parse({
    requiredRoles,
    preferredPrimaryRefRole:
      current?.preferredPrimaryRefRole
      ?? shots.map((shot) => shot.referencePlan.preferredPrimaryRefRole).find((value): value is CinematicReferenceRole => Boolean(value))
      ?? (requiredRoles[0] ?? null),
    maxReferenceCount:
      current?.maxReferenceCount
      ?? Math.min(12, Math.max(4, shots.reduce((max, shot) => Math.max(max, shot.referencePlan.maxReferenceCount), presetFamily === 'story_movie_tv' ? 8 : 6))),
    dropOrder: baseDropOrder.filter((role) => requiredRoles.includes(role) || role === 'style_lock'),
  })
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
        ...shot.backdropRefIds,
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

function countDialogueWords(shot: Pick<CinematicScriptShot, 'dialogue'>) {
  return shot.dialogue.reduce((total, line) => total + line.line.trim().split(/\s+/).filter(Boolean).length, 0)
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
  let inferred = estimated.inferredDurationSeconds
  const ugcProfile = getUgcPresetProfile(shot.formatSubtype)
  if (ugcProfile) {
    const roleRange = getUgcDurationRangeForShot({
      formatSubtype: shot.formatSubtype,
      hookRole: shot.hookRole,
    }) ?? ugcProfile.pacingContract.idealShotDurationRangeSeconds
    const defaultDuration = getUgcDefaultShotDurationSeconds({
      formatSubtype: shot.formatSubtype,
      hookRole: shot.hookRole,
    }) ?? inferred
    const dialogueWords = countDialogueWords(shot)
    const overDialogueLimit = dialogueWords > ugcProfile.pacingContract.maxDialogueWordsPerShot
    const biased = overDialogueLimit
      ? Math.min(roleRange[1], Math.max(defaultDuration, inferred - 1))
      : Math.round((Math.min(roleRange[1], inferred) + defaultDuration) / 2)
    inferred = clampShotDuration(Math.min(roleRange[1], Math.max(roleRange[0], biased)))
  }

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
      ...shot.backdropRefIds,
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
    (left.variationGroupId.trim() || '') !== (right.variationGroupId.trim() || '')
    || (left.variationLabel.trim() || '') !== (right.variationLabel.trim() || '')
    || (left.formatSubtype ?? null) !== (right.formatSubtype ?? null)
    || (left.formulaFamily ?? null) !== (right.formulaFamily ?? null)
    || (left.dominantTrigger ?? null) !== (right.dominantTrigger ?? null)
    || (left.creativeTreatment ?? null) !== (right.creativeTreatment ?? null)
    || (left.narrationMode ?? null) !== (right.narrationMode ?? null)
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

  if (previousShot.variationGroupId.trim() !== shot.variationGroupId.trim()) return 'Split on a variation pack boundary.'
  if (formatChanged) return 'Split on a strong format or messaging shift.'
  if (hardSceneJump) return 'Split on a scene and location change with no shared participants.'
  if (hardLocationJump) return 'Split on a hard location change with no shared participants.'
  if (softContinuityShift && currentDuration >= 10) return 'Split on a softer continuity shift after a long take.'
  if (isUgcShot(shot) && previousShot && shouldBreakForUgcEditorialRhythm({ shot, previousShot, currentDuration })) {
    return 'Split on a UGC editorial beat boundary or dominant-action change.'
  }
  return ''
}

function isUgcShot(shot: Pick<CinematicScriptShot, 'formatSubtype'>) {
  return shot.formatSubtype !== null
}

function getShotPrimaryActionSignature(shot: Pick<CinematicScriptShot, 'actions' | 'beat' | 'directingPackage'>) {
  const action = shot.directingPackage.dominantAction.trim() || shot.actions[0]?.verb.trim() || shot.beat.trim()
  return action.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function shouldBreakForUgcEditorialRhythm(input: {
  shot: CinematicScriptShot & { _compiledDurationSeconds: number }
  previousShot: (CinematicScriptShot & { _compiledDurationSeconds: number }) | null
  currentDuration: number
}) {
  const { shot, previousShot, currentDuration } = input
  if (!previousShot) return false
  const actionChanged = getShotPrimaryActionSignature(previousShot) !== getShotPrimaryActionSignature(shot)
  const roleBoundary =
    (previousShot.hookRole === 'hook' && ['setup', 'proof', 'payoff', 'cta'].includes(shot.hookRole ?? ''))
    || (previousShot.hookRole === 'proof' && ['payoff', 'cta'].includes(shot.hookRole ?? ''))
  const proofBeforeCloseBoundary =
    (shot.hookRole === 'payoff' || shot.hookRole === 'cta')
    && previousShot.hookRole !== 'proof'
    && currentDuration >= 5
  return (
    (currentDuration >= 6 && actionChanged)
    || (currentDuration >= 5 && roleBoundary)
    || proofBeforeCloseBoundary
  )
}

function buildCompiledTakes(shots: Array<CinematicScriptShot & {
  _compiledDurationSeconds: number
  _seedanceModePreference: z.infer<typeof seedanceModePreferenceSchema>
  directingPackage: z.infer<typeof cinematicDirectingPackageSchema>
  referencePlan: z.infer<typeof cinematicReferencePlanSchema>
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
      creativeTreatment: coalesceTakeField(currentShots, (shot) => shot.creativeTreatment, null),
      hookFamily: coalesceTakeField(currentShots, (shot) => shot.hookFamily, null),
      narrationMode: coalesceTakeField(currentShots, (shot) => shot.narrationMode, null),
      backdropRole: coalesceTakeField(currentShots, (shot) => shot.backdropRole, null),
      backdropStrategy: coalesceTakeField(currentShots, (shot) => shot.backdropStrategy, ''),
      variationGroupId: coalesceTakeField(currentShots, (shot) => shot.variationGroupId, ''),
      variationLabel: coalesceTakeField(currentShots, (shot) => shot.variationLabel, ''),
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
    const ugcTake = currentShots.some((candidate) => isUgcShot(candidate)) || isUgcShot(shot)
    const continuityBreak = currentShots.length > 0 && (
      shot.forceTakeBreak
      || currentDuration + shot._compiledDurationSeconds > 15
      || formatChanged
      || hardLocationJump
      || hardSceneJump
      || (softContinuityShift && currentDuration >= 10)
      || (ugcTake && shouldBreakForUgcEditorialRhythm({ shot, previousShot, currentDuration }))
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
    const presetFamily = timedShot.formatSubtype ? 'ugc_creator' as const : 'story_movie_tv' as const
    const directingPackage = inferShotDirectingPackage({
      shot: timedShot,
      current: timedShot.directingPackage,
    })
    const referencePlan = inferShotReferencePlan({
      shot: timedShot,
      current: timedShot.referencePlan,
      presetFamily,
    })
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
      directingPackage,
      referencePlan,
    }
  })
  const isUgcFlow = compiledShots.some((shot) => shot.formatSubtype !== null)
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
      referenceRole: binding.referenceRole ?? inferReferenceRoleFromBinding(binding),
      downstreamUse: inferReferenceDownstreamUse({
        current: binding.downstreamUse,
        referenceRole: binding.referenceRole ?? inferReferenceRoleFromBinding(binding),
        required: binding.required,
        isUgcFlow,
      }),
      captureProfile: binding.captureProfile,
    })),
    scenes: scriptDoc.scenes,
    compositeRefs: scriptDoc.compositeRefs.map((reference) => ({
      ...reference,
      referenceRole: reference.referenceRole ?? 'composite_lock',
      downstreamUse: inferReferenceDownstreamUse({
        current: reference.downstreamUse,
        referenceRole: reference.referenceRole ?? 'composite_lock',
        required: true,
        isUgcFlow,
      }),
      captureProfile: reference.captureProfile,
    })),
    relationships: scriptDoc.relationships,
    storyboard: scriptDoc.storyboard
      ? {
          ...scriptDoc.storyboard,
          panels: scriptDoc.storyboard.panels.map((panel) => ({
            ...panel,
            referenceRole: panel.referenceRole ?? 'board_lock',
            downstreamUse: inferReferenceDownstreamUse({
              current: panel.downstreamUse,
              referenceRole: panel.referenceRole ?? 'board_lock',
              required: true,
              isUgcFlow,
            }),
            captureProfile: panel.captureProfile,
          })),
        }
      : null,
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
      creativeTreatment: shot.creativeTreatment,
      hookFamily: shot.hookFamily,
      narrationMode: shot.narrationMode,
      backdropRole: shot.backdropRole,
      backdropStrategy: shot.backdropStrategy,
      variationGroupId: shot.variationGroupId,
      variationLabel: shot.variationLabel,
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
      backdropRefIds: shot.backdropRefIds,
      requiredSourceRefIds: shot._requiredSourceRefIds,
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      directingPackage: shot.directingPackage,
      referencePlan: shot.referencePlan,
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
    takes: takes.map((take) => {
      const takeShots = compiledShots.filter((shot) => take.shotIds.includes(shot.id))
      return {
        ...take,
        directingPackage: inferTakeDirectingPackage(takeShots, take.directingPackage),
        referencePlan: inferTakeReferencePlan(
          takeShots.map((shot) => ({
            ...shot,
            referencePlan: shot.referencePlan,
          })),
          isUgcFlow ? 'ugc_creator' : 'story_movie_tv',
          take.referencePlan,
        ),
      }
    }),
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
      referenceRole: reference.referenceRole,
      downstreamUse: reference.downstreamUse,
      captureProfile: reference.captureProfile,
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
      creativeTreatment: shot.creativeTreatment,
      hookFamily: shot.hookFamily,
      narrationMode: shot.narrationMode,
      backdropRole: shot.backdropRole,
      backdropStrategy: shot.backdropStrategy,
      variationGroupId: shot.variationGroupId,
      variationLabel: shot.variationLabel,
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
      backdropRefIds: shot.backdropRefIds,
      requiredSourceRefIds: shot.requiredSourceRefIds,
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      directingPackage: shot.directingPackage,
      referencePlan: shot.referencePlan,
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
