import { z } from 'zod'
import {
  deriveUgcShotDefaults,
  getDefaultUgcFormatSubtypeForPresetFamily,
  getUgcDefaultShotDurationSeconds,
  getUgcDurationRangeForShot,
  getUgcPresetProfile,
  resolveUgcCreativeProfile,
} from './ugcPresetProfiles.ts'
import {
  getDefaultStoryLanguagePreset,
  getDefaultStoryScenePreset,
  getStoryLanguagePresetLabel,
  getStoryScenePresetLabel,
  resolveStoryRuntimeContract,
} from './storyPresetProfiles.ts'
import { getRecommendedArtStylePresetForCinematic } from './artStylePresets.ts'

const rawRecordSchema = z.record(z.string(), z.unknown())
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

export const cinematicAspectRatioSchema = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
export const cinematicStillResolutionSchema = z.enum(['1K', '2K'])
export const cinematicVideoResolutionSchema = z.enum(['480p', '720p', '1080p'])
export const cinematicSpecializationModeSchema = z.enum(['story', 'ugc'])
export const cinematicPresetFamilySchema = z.enum(['story_movie_tv', 'ugc_creator', 'ugc_direct_response_ad', 'ugc_faceless_format'])
export const cinematicStoryScenePresetSchema = z.enum([
  'dialogue_two_hander',
  'interrogation_pressure_cooker',
  'procedural_discovery',
  'reveal_then_reversal',
  'dread_build_reveal',
  'family_argument_power_shift',
  'duel_showdown',
  'chase_escape_fragmented',
  'ambush_counterambush',
  'battlefield_push_and_collapse',
  'heroic_arrival_reversal',
  'siege_last_stand',
])
export const cinematicStoryLanguagePresetSchema = z.enum([
  'grounded_naturalist',
  'precision_procedural',
  'lyrical_intimate',
  'handheld_chaos',
  'tactical_combat',
  'operatic_epic',
  'war_immersion',
  'mythic_tableau',
])
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
export const cinematicAuthorshipPipelineSchema = z.enum([
  'json_shot_authoring_v1',
  'story_script_ingest_v1',
  'ugc_script_ingest_v1',
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

function isCinematicReferenceRole(value: string | null | undefined): value is CinematicReferenceRole {
  return cinematicReferenceRoleSchema.options.includes(value as CinematicReferenceRole)
}

function sanitizeCinematicReferenceRoles(values: Array<string | null | undefined> | null | undefined) {
  return uniqueStrings((values ?? []).filter((value): value is CinematicReferenceRole => isCinematicReferenceRole(value)))
}

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
  storyScenePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryScenePresetSchema.options), cinematicStoryScenePresetSchema.nullable()).default(null),
  storyLanguagePreset: z.preprocess(coerceEnumLikeValue(cinematicStoryLanguagePresetSchema.options), cinematicStoryLanguagePresetSchema.nullable()).default(null),
  formatSubtype: z.preprocess(coerceEnumLikeValue(cinematicFormatSubtypeSchema.options), cinematicFormatSubtypeSchema.nullable()).default(null),
  formulaFamily: z.preprocess(coerceEnumLikeValue(cinematicFormulaFamilySchema.options), cinematicFormulaFamilySchema.nullable()).default(null),
  dominantTrigger: z.preprocess(coerceEnumLikeValue(cinematicDominantTriggerSchema.options), cinematicDominantTriggerSchema.nullable()).default(null),
  creativeTreatment: z.preprocess(coerceEnumLikeValue(cinematicCreativeTreatmentSchema.options), cinematicCreativeTreatmentSchema.nullable()).default(null),
  hookFamily: z.preprocess(coerceEnumLikeValue(cinematicHookFamilySchema.options), cinematicHookFamilySchema.nullable()).default(null),
  narrationMode: z.preprocess(coerceEnumLikeValue(cinematicNarrationModeSchema.options), cinematicNarrationModeSchema.nullable()).default(null),
  authorshipPipeline: z.preprocess(coerceEnumLikeValue(cinematicAuthorshipPipelineSchema.options), cinematicAuthorshipPipelineSchema).default('story_script_ingest_v1'),
  backdropRole: z.preprocess(coerceEnumLikeValue(cinematicBackdropRoleSchema.options), cinematicBackdropRoleSchema.nullable()).default(null),
  backdropStrategy: z.string().default(''),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  targetTotalDurationSeconds: z.number().int().positive().max(90).nullable().default(null),
  targetTotalDurationRangeSeconds: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().default(null),
  targetShotCount: z.number().int().positive().max(20).nullable().default(null),
  targetShotCountRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().default(null),
  proofDeadlineShotIndex: z.number().int().positive().max(20).nullable().default(null),
  idealShotDurationRangeSeconds: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().default(null),
  maxDialogueWordsPerShot: z.number().int().positive().max(120).nullable().default(null),
  maxActionBeatsPerShot: z.number().int().positive().max(10).nullable().default(null),
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
  speakerName: z.string().default(''),
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

export const cinematicTakeStoryboardPanelStatusSchema = z.enum(['none', 'generated', 'stale'])

export const cinematicTakeStoryboardPanelSchema = z.object({
  id: z.string(),
  shotId: z.string().nullable().default(null),
  title: z.string().default(''),
  description: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMotion: z.string().default(''),
})

export const cinematicTakeStoryboardPanelPlanSchema = z.object({
  panels: z.array(cinematicTakeStoryboardPanelSchema).default([]),
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
  stillAtSeconds: z.number().nonnegative().nullable().default(null),
  startSeconds: z.number().nonnegative().default(0),
  endSeconds: z.number().nonnegative().default(0),
  approvedForTake: z.boolean().default(false),
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
  stillAtSeconds: z.number().nonnegative().nullable().default(null),
  startSeconds: z.number().nonnegative().default(0),
  endSeconds: z.number().nonnegative().default(0),
  inferredDurationSeconds: z.number().int().positive().max(15).nullable().default(null),
  durationSource: cinematicDurationSourceSchema.default('inferred'),
  timingSummary: z.string().default(''),
  takeId: z.string().nullable().default(null),
  takeIndex: z.number().int().nullable().default(null),
  approvedForTake: z.boolean().default(false),
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
  artStylePreset: z.string().nullable().default(null),
  contrastAxis: z.string().default(''),
  proofMoment: z.string().default(''),
  ctaStyle: z.string().default(''),
  representativeStillPrompt: z.string().default(''),
  requiredSourceRefIds: z.array(z.string()).default([]),
  directingPackage: cinematicDirectingPackageSchema.default(defaultCinematicDirectingPackage),
  referencePlan: cinematicReferencePlanSchema.default(defaultCinematicReferencePlan),
  storyboardPanelPlan: cinematicTakeStoryboardPanelPlanSchema.nullable().default(null),
  storyboardPanelScriptText: z.string().default(''),
  storyboardPanelPlanVersion: z.string().nullable().default(null),
  storyboardPanelStatus: cinematicTakeStoryboardPanelStatusSchema.default('none'),
  previewImageAssetKey: z.string().nullable().default(null),
  storyboardAssetKey: z.string().nullable().default(null),
  storyboardSourceStillAssetKey: z.string().nullable().default(null),
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

export const cinematicV2PipelineVersionSchema = z.enum(['v1_take_blocks', 'v2_shot_orchestration', 'v3_script_storyboards'])
export const cinematicV2SourceInputTypeSchema = z.enum(['prompt', 'script', 'storyBeat', 'shotList'])
export const cinematicV2ShotPurposeSchema = z.enum([
  'establishing',
  'character_intro',
  'dialogue',
  'reaction',
  'action',
  'impact',
  'insert',
  'transition',
  'closing',
])
export const cinematicV2BeatTypeSchema = z.enum(['action', 'dialogue', 'audio', 'emotion', 'camera', 'transition', 'custom'])
export const cinematicV2TaskStatusSchema = z.enum(['planned', 'queued', 'running', 'complete', 'failed', 'skipped'])

// Model output is coerced, not rejected, for recoverable shape drift: numeric ids,
// near-miss enum values, and out-of-range durations must never fail a whole plan.
const cinematicLenientIdSchema = z.preprocess((value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return value
}, z.string())

const cinematicLenientShotPurposeSchema = (fallback: z.infer<typeof cinematicV2ShotPurposeSchema>) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value === null || value === undefined ? undefined : value
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    return (cinematicV2ShotPurposeSchema.options as readonly string[]).includes(normalized) ? normalized : undefined
  }, cinematicV2ShotPurposeSchema.default(fallback))

const cinematicClampedNumber = (options: { min: number; max: number; round?: boolean }) =>
  (value: unknown) => {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (!Number.isFinite(parsed)) return value
    const clamped = Math.min(Math.max(parsed, options.min), options.max)
    return options.round ? Math.round(clamped) : clamped
  }

export const cinematicV2ScriptBeatSchema = z.object({
  id: z.string(),
  type: cinematicV2BeatTypeSchema.default('custom'),
  text: z.string().default(''),
  speakerRefId: z.string().nullable().default(null),
  characterRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  emotionalIntent: z.string().default(''),
  estimatedDurationSeconds: z.number().positive().max(15).nullable().default(null),
})

export const cinematicV2ParsedScriptSchema = z.object({
  title: z.string().default('Cinematic Scene'),
  summary: z.string().default(''),
  sourceInputType: cinematicV2SourceInputTypeSchema.default('prompt'),
  characterRefIds: z.array(z.string()).default([]),
  locationRefId: z.string().nullable().default(null),
  propRefIds: z.array(z.string()).default([]),
  beats: z.array(cinematicV2ScriptBeatSchema).min(1),
  targetDurationSeconds: z.number().positive().max(180).nullable().default(null),
  diagnostics: z.array(z.string()).default([]),
})

export const cinematicV2CharacterSceneStateSchema = z.object({
  characterRefId: z.string(),
  startingPosition: z.string().default(''),
  emotionalState: z.string().default(''),
  physicalState: z.string().default(''),
  outfitState: z.string().default(''),
  injuries: z.array(z.string()).default([]),
  carriedPropRefIds: z.array(z.string()).default([]),
  continuityNotes: z.array(z.string()).default([]),
})

export const cinematicV2SceneStateSchema = z.object({
  sceneId: z.string().default('scene_1'),
  title: z.string().default('Scene 1'),
  summary: z.string().default(''),
  locationRefId: z.string().nullable().default(null),
  characterRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  timeOfDay: z.string().default(''),
  weather: z.string().default(''),
  atmosphere: z.string().default(''),
  lighting: z.object({
    direction: z.string().default(''),
    quality: z.string().default(''),
    colorTemperature: z.string().default(''),
    contrast: z.string().default(''),
  }).default({ direction: '', quality: '', colorTemperature: '', contrast: '' }),
  mood: z.string().default(''),
  visualContinuity: z.object({
    palette: z.array(z.string()).default([]),
    lensLanguage: z.string().default(''),
    cameraMovementStyle: z.string().default(''),
    grainOrTexture: z.string().optional(),
  }).default({ palette: [], lensLanguage: '', cameraMovementStyle: '' }),
  characterStates: z.array(cinematicV2CharacterSceneStateSchema).default([]),
  locationState: z.object({
    description: z.string().default(''),
    continuityNotes: z.array(z.string()).default([]),
  }).default({ description: '', continuityNotes: [] }),
})

export const cinematicV2CameraPlanSchema = z.object({
  id: z.string(),
  purpose: cinematicLenientShotPurposeSchema('establishing'),
  position: z.string().default(''),
  lens: z.string().default(''),
  movement: z.string().default(''),
  screenDirectionRule: z.string().default(''),
})

export const cinematicV2SceneLayoutPlanSchema = z.object({
  sceneId: z.string().default('scene_1'),
  summary: z.string().default(''),
  spatialMapDescription: z.string().default(''),
  characterPositions: z.array(z.object({
    characterRefId: z.string(),
    zone: z.string().default(''),
    facing: z.string().default(''),
    movementDirection: z.string().optional(),
  })).default([]),
  landmarks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.string().default(''),
    continuityRole: z.string().default(''),
  })).default([]),
  cameraPlan: z.array(cinematicV2CameraPlanSchema).default([]),
  generatedLayoutImageAssetKey: z.string().nullable().default(null),
})

export const cinematicV2ReferencePlanSchema = z.object({
  primaryCastRefIds: z.array(z.string()).default([]),
  supportingCastRefIds: z.array(z.string()).default([]),
  locationRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  conceptRefIds: z.array(z.string()).default([]),
  continuityAnchorRefIds: z.array(z.string()).default([]),
  rejectedRefs: z.array(z.object({
    refId: z.string(),
    reason: z.string().default(''),
  })).default([]),
  rationale: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.75),
})

export const cinematicV2ScreenplayDraftSchema = z.object({
  title: z.string().default('Cinematic Scene'),
  screenplayMarkdown: z.string().min(1),
  sceneObjective: z.string().default(''),
  emotionalArc: z.string().default(''),
  suggestedDurationSeconds: z.number().positive().max(180).nullable().default(null),
  sourceRefIds: z.array(z.string()).default([]),
  visualMotifs: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
  metadata: rawRecordSchema.default({}),
})

export const cinematicV2DialogueLineSchema = z.object({
  id: cinematicLenientIdSchema,
  speakerRefId: cinematicLenientIdSchema,
  speakerName: z.string().default(''),
  text: z.string().default(''),
  emotion: z.string().default(''),
  delivery: z.string().default(''),
  subtext: z.string().default(''),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
})

export const cinematicV2PerformanceBeatSchema = z.object({
  characterRefId: cinematicLenientIdSchema,
  valence: z.number().min(-1).max(1).default(0),
  arousal: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  dominance: z.number().min(0).max(1).default(0.5),
  bodyLanguage: z.string().default(''),
  facialExpression: z.string().default(''),
  gaze: z.string().default(''),
  gesture: z.string().default(''),
  voiceEnergy: z.string().optional(),
})

export const cinematicV2ShotSpatialContinuitySchema = z.object({
  cameraPosition: z.string().default(''),
  facingDirection: z.string().default(''),
  subjectPosition: z.string().default(''),
  visibleLandmarks: z.array(z.string()).default([]),
  entryPath: z.string().default(''),
  exitPath: z.string().default(''),
  lightSourceDirection: z.string().default(''),
  notes: z.string().default(''),
})

export const cinematicV2ShotSchema = z.object({
  id: z.string(),
  sceneId: z.string().default('scene_1'),
  index: z.number().int().positive(),
  title: z.string(),
  purpose: cinematicLenientShotPurposeSchema('action'),
  editorialDurationSeconds: z.preprocess(cinematicClampedNumber({ min: 0.1, max: 8 }), z.number().positive().max(8).default(2)),
  providerDurationSeconds: z.preprocess(cinematicClampedNumber({ min: 4, max: 15, round: true }), z.number().int().min(4).max(15).default(4)),
  description: z.string().default(''),
  action: z.string().default(''),
  caption: z.string().default(''),
  lighting: z.string().default(''),
  mood: z.string().default(''),
  storyboardPanelPrompt: z.string().default(''),
  videoDirection: z.string().default(''),
  dialogue: z.array(cinematicV2DialogueLineSchema).default([]),
  speakerRefIds: z.array(z.string()).default([]),
  visibleCharacterRefIds: z.array(z.string()).default([]),
  performanceBeats: z.array(cinematicV2PerformanceBeatSchema).default([]),
  locationRefId: z.string().nullable().default(null),
  worldLocationRefId: z.string().nullable().default(null),
  continuitySetId: z.string().default(''),
  continuityZoneId: z.string().default(''),
  continuitySpotIds: z.array(z.string()).default([]),
  continuityAngleId: z.string().default(''),
  spatialContinuity: cinematicV2ShotSpatialContinuitySchema.default({
    cameraPosition: '',
    facingDirection: '',
    subjectPosition: '',
    visibleLandmarks: [],
    entryPath: '',
    exitPath: '',
    lightSourceDirection: '',
    notes: '',
  }),
  propRefIds: z.array(z.string()).default([]),
  continuityInputs: z.array(z.string()).default([]),
  continuityAnchorIds: z.array(z.string()).default([]),
  coverageSetupId: z.string().default(''),
  coverage_setup_id: z.string().default(''),
  continuityLink: z.record(z.string(), z.unknown()).default({}),
  continuity_link: z.record(z.string(), z.unknown()).default({}),
  camera: z.object({
    framing: z.string().default(''),
    angle: z.string().default(''),
    lens: z.string().default(''),
    movement: z.string().default(''),
    screenDirectionRule: z.string().default(''),
  }).default({ framing: '', angle: '', lens: '', movement: '', screenDirectionRule: '' }),
  requiresLipSync: z.boolean().default(false),
  status: cinematicV2TaskStatusSchema.default('planned'),
})

export const cinematicV2ShotPlanSchema = z.object({
  sceneId: z.string().default('scene_1'),
  // Chapter-length sequence animatics legitimately exceed the short-form 180s budget;
  // out-of-range totals clamp instead of failing the whole plan.
  totalEditorialDurationSeconds: z.preprocess(cinematicClampedNumber({ min: 0.1, max: 3600 }), z.number().positive().max(3600)),
  shots: z.array(cinematicV2ShotSchema).min(1).max(200),
  performanceArc: z.array(z.object({
    characterRefId: z.string(),
    startState: z.string().default(''),
    endState: z.string().default(''),
    arc: z.string().default(''),
  })).default([]),
  audioPlan: z.object({
    ambience: z.string().default(''),
    music: z.string().default(''),
    sfx: z.array(z.string()).default([]),
    dialogueTrackCount: z.number().int().nonnegative().default(0),
    placeholderOnly: z.boolean().default(true),
  }).default({ ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true }),
  diagnostics: z.array(z.string()).default([]),
})

export const cinematicV2StoryboardLayoutSchema = z.object({
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  panelCount: z.number().int().positive(),
})

export const cinematicV2StoryboardGroupSchema = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  shotIds: z.array(z.string()).min(1).max(9),
  summary: z.string().default(''),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  panelCount: z.number().int().positive().max(9),
  startSeconds: z.number().nonnegative().default(0),
  endSeconds: z.number().nonnegative().default(0),
  editorialDurationSeconds: z.number().nonnegative().max(180).default(0),
  providerDurationSeconds: z.number().int().min(4).max(15).default(4),
  coverageSetupIds: z.array(z.string()).default([]),
  coverageSetups: z.array(z.record(z.string(), z.unknown())).default([]),
  continuityNotes: z.array(z.string()).default([]),
})

export const cinematicV2StoryboardGroupPlanSchema = z.object({
  groups: z.array(cinematicV2StoryboardGroupSchema).min(1).max(24),
  maxPanelsPerSheet: z.number().int().positive().max(9).default(9),
  maxDurationPerGroupSeconds: z.number().positive().max(15).nullable().default(null),
  diagnostics: z.array(z.string()).default([]),
})

export const cinematicV2StoryboardSheetSchema = z.object({
  id: z.string(),
  sceneId: z.string().default('scene_1'),
  storyboardGroupId: z.string().nullable().default(null),
  assetKey: z.string().nullable().default(null),
  storagePath: z.string().nullable().default(null),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  shotIds: z.array(z.string()).default([]),
  generationPrompt: z.string().default(''),
  model: z.string().default(''),
})

export const cinematicV2PanelAssetSchema = z.object({
  id: z.string(),
  shotId: z.string(),
  shotIndex: z.number().int().positive().nullable().default(null),
  storyboardGroupId: z.string().nullable().default(null),
  panelIndexInGroup: z.number().int().nonnegative().nullable().default(null),
  assetKey: z.string().nullable().default(null),
  storagePath: z.string().nullable().default(null),
  sourceSheetAssetKey: z.string().nullable().default(null),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  cropRect: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).nullable().default(null),
})

export const cinematicV2ShotKeyframeSchema = z.object({
  id: z.string(),
  shotId: z.string(),
  type: z.enum(['storyboard_panel', 'refined_start', 'refined_end', 'intermediate', 'carryover']).default('refined_start'),
  assetKey: z.string().nullable().default(null),
  storagePath: z.string().nullable().default(null),
  prompt: z.string().default(''),
  sourceAssetKeys: z.array(z.string()).default([]),
  qualityScore: z.number().min(0).max(1).nullable().default(null),
})

export const cinematicV2KeyframeQaSchema = z.object({
  shotId: z.string(),
  shotIndex: z.number().int().positive(),
  status: z.enum(['passed', 'needs_review', 'missing_media']).default('needs_review'),
  expectedEntityRefIds: z.array(z.string()).default([]),
  expectedEntityCount: z.number().int().nonnegative().default(0),
  issueCategories: z.array(z.enum([
    'missing_keyframe',
    'wrong_character_count',
    'missing_signature_detail',
    'duplicate_subject_risk',
    'storyboard_artifact_risk',
    'prompt_adherence_risk',
  ])).default([]),
  notes: z.array(z.string()).default([]),
})

export const cinematicV2VideoTaskSchema = z.object({
  id: z.string(),
  shotId: z.string(),
  provider: z.string().default('seedance'),
  inputKeyframeAssetKeys: z.array(z.string()).default([]),
  prompt: z.string().default(''),
  durationSeconds: z.number().positive().max(15),
  aspectRatio: z.string().default('16:9'),
  status: cinematicV2TaskStatusSchema.default('planned'),
  outputVideoAssetKey: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
})

export const cinematicV2TimelineSchema = z.object({
  id: z.string(),
  sceneId: z.string().default('scene_1'),
  durationSeconds: z.number().nonnegative(),
  videoClips: z.array(z.object({
    shotId: z.string(),
    videoAssetKey: z.string().nullable().default(null),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
    trimIn: z.number().nonnegative().default(0),
    trimOut: z.number().nonnegative().default(0),
  })).default([]),
  audioClips: z.array(z.object({
    type: z.enum(['dialogue', 'ambience', 'music', 'sfx']),
    label: z.string().default(''),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
    volumeDb: z.number().nullable().default(null),
    placeholder: z.boolean().default(true),
  })).default([]),
})

export type CinematicV2ParsedScript = z.infer<typeof cinematicV2ParsedScriptSchema>
export type CinematicV2SceneState = z.infer<typeof cinematicV2SceneStateSchema>
export type CinematicV2SceneLayoutPlan = z.infer<typeof cinematicV2SceneLayoutPlanSchema>
export type CinematicV2ReferencePlan = z.infer<typeof cinematicV2ReferencePlanSchema>
export type CinematicV2ScreenplayDraft = z.infer<typeof cinematicV2ScreenplayDraftSchema>
export type CinematicV2PerformanceBeat = z.infer<typeof cinematicV2PerformanceBeatSchema>
export type CinematicV2Shot = z.infer<typeof cinematicV2ShotSchema>
export type CinematicV2ShotPlan = z.infer<typeof cinematicV2ShotPlanSchema>
export type CinematicV2StoryboardLayout = z.infer<typeof cinematicV2StoryboardLayoutSchema>
export type CinematicV2StoryboardGroupPlan = z.infer<typeof cinematicV2StoryboardGroupPlanSchema>
export type CinematicV2KeyframeQa = z.infer<typeof cinematicV2KeyframeQaSchema>

export function buildCinematicV2StoryboardLayout(shotCount: number): CinematicV2StoryboardLayout {
  const panelCount = Math.max(1, Math.min(9, Math.ceil(shotCount)))
  if (panelCount <= 1) return { rows: 1, columns: 1, panelCount }
  if (panelCount <= 4) return { rows: 2, columns: 2, panelCount }
  return { rows: 3, columns: 3, panelCount }
}

export function buildCinematicV3StoryboardLayout(shotCount: number): CinematicV2StoryboardLayout {
  const panelCount = Math.max(1, Math.min(9, Math.ceil(shotCount)))
  if (panelCount <= 1) return { rows: 1, columns: 1, panelCount }
  if (panelCount === 2) return { rows: 1, columns: 2, panelCount }
  if (panelCount <= 4) return { rows: 2, columns: 2, panelCount }
  if (panelCount <= 6) return { rows: 2, columns: 3, panelCount }
  return { rows: 3, columns: 3, panelCount }
}

export function deriveCinematicV2MaxShotCount(durationSeconds: number | null | undefined) {
  const duration = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? durationSeconds : 64
  return Math.max(4, Math.min(36, Math.ceil(duration / 4)))
}

export function buildCinematicV2StoryboardGroupPlan(shotPlan: CinematicV2ShotPlan, maxPanelsPerSheet = 9): CinematicV2StoryboardGroupPlan {
  const maxPanels = Math.max(1, Math.min(9, Math.floor(maxPanelsPerSheet) || 9))
  const groups: z.infer<typeof cinematicV2StoryboardGroupSchema>[] = []
  let runningSeconds = 0
  for (let index = 0; index < shotPlan.shots.length; index += maxPanels) {
    const shots = shotPlan.shots.slice(index, index + maxPanels)
    const layout = buildCinematicV2StoryboardLayout(shots.length)
    const groupIndex = groups.length + 1
    const editorialDurationSeconds = shots.reduce((total, shot) => total + Math.max(0, shot.editorialDurationSeconds || 0), 0)
    const startSeconds = runningSeconds
    const endSeconds = startSeconds + editorialDurationSeconds
    runningSeconds = endSeconds
    groups.push({
      id: `cinematic_v2_storyboard_group_${String(groupIndex).padStart(3, '0')}`,
      index: groupIndex,
      shotIds: shots.map((shot) => shot.id),
      summary: shots.map((shot) => shot.title).filter(Boolean).join(' / '),
      rows: layout.rows,
      columns: layout.columns,
      panelCount: layout.panelCount,
      startSeconds,
      endSeconds,
      editorialDurationSeconds,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(editorialDurationSeconds),
      coverageSetupIds: [],
      coverageSetups: [],
      continuityNotes: [],
    })
  }
  return cinematicV2StoryboardGroupPlanSchema.parse({
    groups,
    maxPanelsPerSheet: maxPanels,
    diagnostics: shotPlan.shots.length > maxPanels ? [`Split ${shotPlan.shots.length} shots into ${groups.length} storyboard sheets.`] : [],
  })
}

export function buildCinematicV3StoryboardGroupPlan(
  shotPlan: CinematicV2ShotPlan,
  options: {
    maxPanelsPerSheet?: number
    maxDurationPerGroupSeconds?: number
  } = {},
): CinematicV2StoryboardGroupPlan {
  const maxPanels = Math.max(1, Math.min(9, Math.floor(options.maxPanelsPerSheet ?? 9) || 9))
  const maxDuration = Math.max(1, Math.min(15, Number(options.maxDurationPerGroupSeconds ?? 15) || 15))
  const groups: z.infer<typeof cinematicV2StoryboardGroupSchema>[] = []
  let currentShots: CinematicV2Shot[] = []
  let currentStartSeconds = 0
  let currentDurationSeconds = 0
  let runningSeconds = 0

  const flush = () => {
    if (!currentShots.length) return
    const groupIndex = groups.length + 1
    const layout = buildCinematicV3StoryboardLayout(currentShots.length)
    const endSeconds = currentStartSeconds + currentDurationSeconds
    groups.push({
      id: `cinematic_v3_storyboard_group_${String(groupIndex).padStart(3, '0')}`,
      index: groupIndex,
      shotIds: currentShots.map((shot) => shot.id),
      summary: currentShots.map((shot) => shot.title).filter(Boolean).join(' / '),
      rows: layout.rows,
      columns: layout.columns,
      panelCount: layout.panelCount,
      startSeconds: currentStartSeconds,
      endSeconds,
      editorialDurationSeconds: currentDurationSeconds,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(currentDurationSeconds),
      coverageSetupIds: [],
      coverageSetups: [],
      continuityNotes: [
        `Storyboard/video block ${groupIndex}: ${currentDurationSeconds.toFixed(1).replace(/\.0$/, '')}s across ${currentShots.length} shot${currentShots.length === 1 ? '' : 's'}.`,
      ],
    })
    currentShots = []
    currentDurationSeconds = 0
    currentStartSeconds = runningSeconds
  }

  for (const shot of shotPlan.shots) {
    const shotDuration = Math.max(0.1, Math.min(15, Number(shot.editorialDurationSeconds) || 2))
    const wouldExceedDuration = currentShots.length > 0 && currentDurationSeconds + shotDuration > maxDuration
    const wouldExceedPanels = currentShots.length >= maxPanels
    if (wouldExceedDuration || wouldExceedPanels) flush()
    if (!currentShots.length) currentStartSeconds = runningSeconds
    currentShots.push(shot)
    currentDurationSeconds += shotDuration
    runningSeconds += shotDuration
  }
  flush()

  return cinematicV2StoryboardGroupPlanSchema.parse({
    groups,
    maxPanelsPerSheet: maxPanels,
    maxDurationPerGroupSeconds: maxDuration,
    diagnostics: groups.length > 1
      ? [`Split ${shotPlan.shots.length} shots into ${groups.length} storyboard/video blocks of ${maxDuration} seconds or less.`]
      : [`Kept ${shotPlan.shots.length} shots in one storyboard/video block of ${maxDuration} seconds or less.`],
  })
}

export function providerSafeCinematicV2DurationSeconds(editorialDurationSeconds: number) {
  if (!Number.isFinite(editorialDurationSeconds)) return 4
  return Math.max(4, Math.min(15, Math.ceil(editorialDurationSeconds)))
}

export function validateCinematicV2ShotPlanReferences(input: {
  shotPlan: CinematicV2ShotPlan
  referenceIds: readonly string[]
}) {
  const allowed = new Set(input.referenceIds)
  const diagnostics: string[] = []
  for (const shot of input.shotPlan.shots) {
    const refs = [
      ...shot.visibleCharacterRefIds,
      ...shot.speakerRefIds,
      ...shot.propRefIds,
      ...(shot.locationRefId ? [shot.locationRefId] : []),
    ]
    refs.forEach((refId) => {
      if (refId && !allowed.has(refId)) diagnostics.push(`Shot ${shot.id} references unknown cinematic ref "${refId}".`)
    })
    if (!shot.camera.framing && !shot.camera.angle && !shot.camera.movement) {
      diagnostics.push(`Shot ${shot.id} is missing a primary camera intent.`)
    }
    if (shot.providerDurationSeconds < 4) {
      diagnostics.push(`Shot ${shot.id} has provider duration below 4 seconds.`)
    }
  }
  return diagnostics
}

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

function clampReferencePriority(priority: unknown) {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) return 50
  return Math.min(100, Math.max(0, Math.round(priority)))
}

function normalizeSeedanceReferenceInput(
  input: Partial<z.infer<typeof seedanceReferenceInputSchema>> | null | undefined,
): z.infer<typeof seedanceReferenceInputSchema> | null {
  if (!input || typeof input !== 'object') return null
  const parsed = seedanceReferenceInputSchema.safeParse({
    ...input,
    priority: clampReferencePriority(input.priority),
  })
  return parsed.success ? parsed.data : null
}

function normalizeSeedanceExecutionPlan(
  input: Partial<z.infer<typeof seedanceExecutionPlanSchema>> | null | undefined,
): z.infer<typeof seedanceExecutionPlanSchema> | null {
  if (!input || typeof input !== 'object') return null
  const parsed = seedanceExecutionPlanSchema.safeParse({
    ...input,
    referenceInputs: Array.isArray(input.referenceInputs)
      ? input.referenceInputs
          .map((entry) => normalizeSeedanceReferenceInput(entry))
          .filter((entry): entry is z.infer<typeof seedanceReferenceInputSchema> => Boolean(entry))
      : [],
  })
  return parsed.success ? parsed.data : null
}

export type CinematicSettings = z.infer<typeof cinematicSettingsSchema>
export type CinematicPresetFamily = z.infer<typeof cinematicPresetFamilySchema>
export type CinematicStoryScenePreset = z.infer<typeof cinematicStoryScenePresetSchema>
export type CinematicStoryLanguagePreset = z.infer<typeof cinematicStoryLanguagePresetSchema>
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
export type CinematicTakeStoryboardPanelStatus = z.infer<typeof cinematicTakeStoryboardPanelStatusSchema>
export type CinematicTakeStoryboardPanel = z.infer<typeof cinematicTakeStoryboardPanelSchema>
export type CinematicTakeStoryboardPanelPlan = z.infer<typeof cinematicTakeStoryboardPanelPlanSchema>
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

export type CinematicShotTiming = {
  id: string
  durationSeconds: number
  startSeconds: number
  endSeconds: number
}

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

export function coerceStoryScenePresetForPresetFamily(
  presetFamily: CinematicPresetFamily,
  storyScenePreset: z.infer<typeof cinematicStoryScenePresetSchema> | null | undefined,
) {
  return presetFamily === 'story_movie_tv'
    ? (storyScenePreset ?? getDefaultStoryScenePreset())
    : null
}

export function coerceStoryLanguagePresetForPresetFamily(
  presetFamily: CinematicPresetFamily,
  storyLanguagePreset: z.infer<typeof cinematicStoryLanguagePresetSchema> | null | undefined,
) {
  return presetFamily === 'story_movie_tv'
    ? (storyLanguagePreset ?? getDefaultStoryLanguagePreset())
    : null
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

export function getCinematicStoryScenePresetLabel(storyScenePreset: z.infer<typeof cinematicStoryScenePresetSchema> | null | undefined) {
  return getStoryScenePresetLabel(storyScenePreset ?? getDefaultStoryScenePreset())
}

export function getCinematicStoryLanguagePresetLabel(storyLanguagePreset: z.infer<typeof cinematicStoryLanguagePresetSchema> | null | undefined) {
  return getStoryLanguagePresetLabel(storyLanguagePreset ?? getDefaultStoryLanguagePreset())
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

export type CinematicPresetContract = {
  presetFamily: CinematicPresetFamily
  kind: 'story' | 'ugc'
  formatSubtype: CinematicFormatSubtype | null
  storyScenePreset: z.infer<typeof cinematicStoryScenePresetSchema> | null
  storyLanguagePreset: z.infer<typeof cinematicStoryLanguagePresetSchema> | null
  shotRoleSequence: CinematicHookRole[]
  targetTotalDurationRangeSeconds: readonly [number, number] | null
  targetShotCountRange: readonly [number, number] | null
  idealShotDurationRangeSeconds: readonly [number, number] | null
  proofDeadlineShotIndex: number | null
  maxDialogueWordsPerShot: number | null
  maxActionBeatsPerShot: number | null
  plannerDirectives: string[]
  authorshipDirectives: string[]
  repairDirectives: string[]
}

function buildStorySettingsPacingPatch(
  storyScenePreset: z.infer<typeof cinematicStoryScenePresetSchema> | null | undefined,
  storyLanguagePreset: z.infer<typeof cinematicStoryLanguagePresetSchema> | null | undefined,
): Pick<CinematicSettings, 'targetTotalDurationSeconds' | 'targetTotalDurationRangeSeconds' | 'targetShotCount' | 'targetShotCountRange' | 'proofDeadlineShotIndex' | 'idealShotDurationRangeSeconds' | 'maxDialogueWordsPerShot' | 'maxActionBeatsPerShot'> {
  const contract = resolveStoryRuntimeContract({
    storyScenePreset,
    storyLanguagePreset,
  })
  return {
    targetTotalDurationSeconds: Math.round((contract.targetSceneDurationRangeSeconds[0] + contract.targetSceneDurationRangeSeconds[1]) / 2),
    targetTotalDurationRangeSeconds: [...contract.targetSceneDurationRangeSeconds] as [number, number],
    targetShotCount: Math.round((contract.targetShotCountRange[0] + contract.targetShotCountRange[1]) / 2),
    targetShotCountRange: [...contract.targetShotCountRange] as [number, number],
    proofDeadlineShotIndex: contract.revealDeadlineShotIndex,
    idealShotDurationRangeSeconds: [...contract.idealShotDurationRangeSeconds] as [number, number],
    maxDialogueWordsPerShot: contract.maxDialogueWordsPerShot,
    maxActionBeatsPerShot: contract.maxActionBeatsPerShot,
  }
}

export function getCinematicPresetContract(input: {
  presetFamily: CinematicPresetFamily
  formatSubtype?: CinematicFormatSubtype | null
  storyScenePreset?: z.infer<typeof cinematicStoryScenePresetSchema> | null
  storyLanguagePreset?: z.infer<typeof cinematicStoryLanguagePresetSchema> | null
}): CinematicPresetContract | null {
  if (input.presetFamily === 'story_movie_tv') {
    const storyScenePreset = coerceStoryScenePresetForPresetFamily(input.presetFamily, input.storyScenePreset)
    const storyLanguagePreset = coerceStoryLanguagePresetForPresetFamily(input.presetFamily, input.storyLanguagePreset)
    const contract = resolveStoryRuntimeContract({
      storyScenePreset,
      storyLanguagePreset,
    })
    return {
      presetFamily: input.presetFamily,
      kind: 'story',
      formatSubtype: null,
      storyScenePreset,
      storyLanguagePreset,
      shotRoleSequence: contract.shotRoleSequence,
      targetTotalDurationRangeSeconds: contract.targetSceneDurationRangeSeconds,
      targetShotCountRange: contract.targetShotCountRange,
      idealShotDurationRangeSeconds: contract.idealShotDurationRangeSeconds,
      proofDeadlineShotIndex: contract.revealDeadlineShotIndex,
      maxDialogueWordsPerShot: contract.maxDialogueWordsPerShot,
      maxActionBeatsPerShot: contract.maxActionBeatsPerShot,
      plannerDirectives: contract.plannerDirectives,
      authorshipDirectives: contract.authorshipDirectives,
      repairDirectives: contract.repairDirectives,
    }
  }

  const formatSubtype = coerceFormatSubtypeForPresetFamily(input.presetFamily, input.formatSubtype)
  const profile = getUgcPresetProfile(formatSubtype, input.presetFamily)
  if (!profile) return null
  return {
    presetFamily: input.presetFamily,
    kind: 'ugc',
    formatSubtype,
    storyScenePreset: null,
    storyLanguagePreset: null,
    shotRoleSequence: profile.shotRoleSequence,
    targetTotalDurationRangeSeconds: profile.pacingContract.targetTotalDurationRangeSeconds,
    targetShotCountRange: profile.pacingContract.targetShotCountRange,
    idealShotDurationRangeSeconds: profile.pacingContract.idealShotDurationRangeSeconds,
    proofDeadlineShotIndex: profile.pacingContract.proofShouldLandByShotIndex,
    maxDialogueWordsPerShot: profile.pacingContract.maxDialogueWordsPerShot,
    maxActionBeatsPerShot: profile.pacingContract.maxActionBeatsPerShot,
    plannerDirectives: [],
    authorshipDirectives: [],
    repairDirectives: [],
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

function buildUgcSettingsPacingPatch(
  formatSubtype: CinematicFormatSubtype | null,
  presetFamily: CinematicPresetFamily,
): Pick<CinematicSettings, 'targetTotalDurationSeconds' | 'targetTotalDurationRangeSeconds' | 'targetShotCount' | 'targetShotCountRange' | 'proofDeadlineShotIndex' | 'idealShotDurationRangeSeconds' | 'maxDialogueWordsPerShot' | 'maxActionBeatsPerShot'> {
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  if (!profile) {
    return {
      targetTotalDurationSeconds: null,
      targetTotalDurationRangeSeconds: null,
      targetShotCount: null,
      targetShotCountRange: null,
      proofDeadlineShotIndex: null,
      idealShotDurationRangeSeconds: null,
      maxDialogueWordsPerShot: null,
      maxActionBeatsPerShot: null,
    }
  }
  const targetTotalDurationRangeSeconds = profile.pacingContract.targetTotalDurationRangeSeconds
  const targetShotCountRange = profile.pacingContract.targetShotCountRange
  return {
    targetTotalDurationSeconds: Math.round((targetTotalDurationRangeSeconds[0] + targetTotalDurationRangeSeconds[1]) / 2),
    targetTotalDurationRangeSeconds: [...targetTotalDurationRangeSeconds] as [number, number],
    targetShotCount: Math.round((targetShotCountRange[0] + targetShotCountRange[1]) / 2),
    targetShotCountRange: [...targetShotCountRange] as [number, number],
    proofDeadlineShotIndex: profile.pacingContract.proofShouldLandByShotIndex,
    idealShotDurationRangeSeconds: [...profile.pacingContract.idealShotDurationRangeSeconds] as [number, number],
    maxDialogueWordsPerShot: profile.pacingContract.maxDialogueWordsPerShot,
    maxActionBeatsPerShot: profile.pacingContract.maxActionBeatsPerShot,
  }
}

function getDefaultAuthorshipPipelineForPresetFamily(presetFamily: CinematicPresetFamily) {
  return presetFamily === 'story_movie_tv' ? 'story_script_ingest_v1' as const : 'ugc_script_ingest_v1' as const
}

function resolveStoryPresetSelection(input: {
  presetFamily: CinematicPresetFamily
  storyScenePreset?: z.infer<typeof cinematicStoryScenePresetSchema> | null
  storyLanguagePreset?: z.infer<typeof cinematicStoryLanguagePresetSchema> | null
}) {
  const storyScenePreset = coerceStoryScenePresetForPresetFamily(input.presetFamily, input.storyScenePreset)
  const storyLanguagePreset = coerceStoryLanguagePresetForPresetFamily(input.presetFamily, input.storyLanguagePreset)
  return {
    storyScenePreset,
    storyLanguagePreset,
    contract:
      input.presetFamily === 'story_movie_tv'
        ? resolveStoryRuntimeContract({ storyScenePreset, storyLanguagePreset })
        : null,
  }
}

export function buildCinematicSettingsPatchFromFormatSubtype(
  presetFamily: CinematicPresetFamily,
  formatSubtype: CinematicFormatSubtype | null,
): Pick<CinematicSettings, 'storyScenePreset' | 'storyLanguagePreset' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'creativeTreatment' | 'hookFamily' | 'narrationMode' | 'authorshipPipeline' | 'backdropRole' | 'backdropStrategy' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset' | 'targetTotalDurationSeconds' | 'targetTotalDurationRangeSeconds' | 'targetShotCount' | 'targetShotCountRange' | 'proofDeadlineShotIndex' | 'idealShotDurationRangeSeconds' | 'maxDialogueWordsPerShot' | 'maxActionBeatsPerShot'> {
  if (presetFamily === 'story_movie_tv') {
    const storyScenePreset = getDefaultStoryScenePreset()
    const storyLanguagePreset = getDefaultStoryLanguagePreset()
    return {
      ...buildStorySettingsPacingPatch(storyScenePreset, storyLanguagePreset),
      storyScenePreset,
      storyLanguagePreset,
      formatSubtype: null,
      formulaFamily: null,
      dominantTrigger: null,
      creativeTreatment: null,
      hookFamily: null,
      narrationMode: null,
      authorshipPipeline: getDefaultAuthorshipPipelineForPresetFamily(presetFamily),
      backdropRole: null,
      backdropStrategy: '',
      proofMoment: '',
      ctaStyle: '',
      contrastAxis: '',
      stillAspectRatio: deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
      defaultClipSeconds: defaultCinematicSettings.defaultClipSeconds,
      inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype: null }),
    }
  }

  const nextSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, formatSubtype)
  const profile = getUgcPresetProfile(nextSubtype, presetFamily)
  const creativeProfile = resolveUgcCreativeProfile({
    formatSubtype: nextSubtype,
    presetFamily,
  })
  return {
    ...buildUgcSettingsPacingPatch(nextSubtype, presetFamily),
    storyScenePreset: null,
    storyLanguagePreset: null,
    formatSubtype: nextSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(nextSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(nextSubtype),
    creativeTreatment: creativeProfile.creativeTreatment,
    hookFamily: creativeProfile.hookFamily,
    narrationMode: creativeProfile.narrationMode,
    authorshipPipeline: getDefaultAuthorshipPipelineForPresetFamily(presetFamily),
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

export function buildCinematicSettingsPatchFromPresetFamily(presetFamily: CinematicPresetFamily): Pick<CinematicSettings, 'presetFamily' | 'presetId' | 'specializationMode' | 'storyScenePreset' | 'storyLanguagePreset' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'creativeTreatment' | 'hookFamily' | 'narrationMode' | 'authorshipPipeline' | 'backdropRole' | 'backdropStrategy' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset' | 'targetTotalDurationSeconds' | 'targetTotalDurationRangeSeconds' | 'targetShotCount' | 'targetShotCountRange' | 'proofDeadlineShotIndex' | 'idealShotDurationRangeSeconds' | 'maxDialogueWordsPerShot' | 'maxActionBeatsPerShot'> {
  if (presetFamily === 'story_movie_tv') {
    const storyScenePreset = getDefaultStoryScenePreset()
    const storyLanguagePreset = getDefaultStoryLanguagePreset()
    return {
      ...buildStorySettingsPacingPatch(storyScenePreset, storyLanguagePreset),
      presetFamily,
      presetId: presetFamily,
      storyScenePreset,
      storyLanguagePreset,
      formatSubtype: null,
      formulaFamily: null,
      dominantTrigger: null,
      creativeTreatment: null,
      hookFamily: null,
      narrationMode: null,
      authorshipPipeline: getDefaultAuthorshipPipelineForPresetFamily(presetFamily),
      backdropRole: null,
      backdropStrategy: '',
      proofMoment: '',
      ctaStyle: '',
      contrastAxis: '',
      specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
      stillAspectRatio: deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
      defaultClipSeconds: defaultCinematicSettings.defaultClipSeconds,
      inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype: null }),
    }
  }

  const formatSubtype = coerceFormatSubtypeForPresetFamily(presetFamily, null)
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  const creativeProfile = resolveUgcCreativeProfile({
    formatSubtype,
    presetFamily,
  })
  return {
    ...buildUgcSettingsPacingPatch(formatSubtype, presetFamily),
    presetFamily,
    presetId: presetFamily,
    storyScenePreset: null,
    storyLanguagePreset: null,
    stillAspectRatio: profile?.preferredAspectRatio ?? deriveDefaultStillAspectRatioFromPresetFamily(presetFamily),
    defaultClipSeconds: profile?.preferredClipSeconds ?? defaultCinematicSettings.defaultClipSeconds,
    formatSubtype,
    formulaFamily: deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype),
    dominantTrigger: deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype),
    creativeTreatment: creativeProfile.creativeTreatment,
    hookFamily: creativeProfile.hookFamily,
    narrationMode: creativeProfile.narrationMode,
    authorshipPipeline: getDefaultAuthorshipPipelineForPresetFamily(presetFamily),
    backdropRole: creativeProfile.backdropRole,
    backdropStrategy: creativeProfile.backdropStrategy,
    proofMoment: profile?.defaultProofMoment ?? '',
    ctaStyle: profile?.defaultCtaStyle ?? '',
    contrastAxis: profile?.defaultContrastAxis ?? '',
    specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily, formatSubtype }),
  }
}

export function buildCinematicSettingsPatchFromStoryPresets(
  storyScenePreset: z.infer<typeof cinematicStoryScenePresetSchema> | null,
  storyLanguagePreset: z.infer<typeof cinematicStoryLanguagePresetSchema> | null,
): Pick<CinematicSettings, 'presetFamily' | 'presetId' | 'specializationMode' | 'storyScenePreset' | 'storyLanguagePreset' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger' | 'creativeTreatment' | 'hookFamily' | 'narrationMode' | 'authorshipPipeline' | 'backdropRole' | 'backdropStrategy' | 'proofMoment' | 'ctaStyle' | 'contrastAxis' | 'stillAspectRatio' | 'defaultClipSeconds' | 'inferredArtStylePreset' | 'targetTotalDurationSeconds' | 'targetTotalDurationRangeSeconds' | 'targetShotCount' | 'targetShotCountRange' | 'proofDeadlineShotIndex' | 'idealShotDurationRangeSeconds' | 'maxDialogueWordsPerShot' | 'maxActionBeatsPerShot'> {
  const resolvedStoryScenePreset = storyScenePreset ?? getDefaultStoryScenePreset()
  const resolvedStoryLanguagePreset = storyLanguagePreset ?? getDefaultStoryLanguagePreset()
  return {
    ...buildStorySettingsPacingPatch(resolvedStoryScenePreset, resolvedStoryLanguagePreset),
    presetFamily: 'story_movie_tv',
    presetId: 'story_movie_tv',
    specializationMode: 'story',
    storyScenePreset: resolvedStoryScenePreset,
    storyLanguagePreset: resolvedStoryLanguagePreset,
    formatSubtype: null,
    formulaFamily: null,
    dominantTrigger: null,
    creativeTreatment: null,
    hookFamily: null,
    narrationMode: null,
    authorshipPipeline: 'story_script_ingest_v1',
    backdropRole: null,
    backdropStrategy: '',
    proofMoment: '',
    ctaStyle: '',
    contrastAxis: '',
    stillAspectRatio: '16:9',
    defaultClipSeconds: defaultCinematicSettings.defaultClipSeconds,
    inferredArtStylePreset: getRecommendedArtStylePresetForCinematic({ presetFamily: 'story_movie_tv', formatSubtype: null }),
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
  const currentRequiredRoles = sanitizeCinematicReferenceRoles(input.current?.requiredRoles)
  const requiredRoles = sanitizeCinematicReferenceRoles([
    ...currentRequiredRoles,
    ...(input.shot.storyboardRefIds.length > 0 ? ['board_lock'] : []),
    ...(input.shot.compositeRefIds.length > 0 ? ['composite_lock'] : []),
    ...(input.shot.participantRefIds.length > 0 ? ['subject_lock'] : []),
    ...(input.shot.propRefIds.length > 0 ? ['prop_lock'] : []),
    ...(input.shot.locationRefId ? ['environment_lock'] : []),
    ...(proofSurfaceRole ? ['proof_surface_lock'] : []),
  ])
  const dropOrder = (
    sanitizeCinematicReferenceRoles(input.current?.dropOrder).length
      ? sanitizeCinematicReferenceRoles(input.current?.dropOrder)
      : input.presetFamily === 'story_movie_tv'
        ? STORY_REFERENCE_DROP_ORDER
        : UGC_REFERENCE_DROP_ORDER
  ).filter((role) => requiredRoles.includes(role) || role === 'style_lock')
  const preferredPrimaryRefRole =
    (isCinematicReferenceRole(input.current?.preferredPrimaryRefRole) ? input.current?.preferredPrimaryRefRole : null)
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
  const requiredRoles = sanitizeCinematicReferenceRoles([
    ...sanitizeCinematicReferenceRoles(current?.requiredRoles),
    ...shots.flatMap((shot) => shot.referencePlan.requiredRoles),
  ])
  const baseDropOrder =
    sanitizeCinematicReferenceRoles(current?.dropOrder).length
      ? sanitizeCinematicReferenceRoles(current?.dropOrder)
      : presetFamily === 'story_movie_tv'
        ? STORY_REFERENCE_DROP_ORDER
        : UGC_REFERENCE_DROP_ORDER
  return cinematicReferencePlanSchema.parse({
    requiredRoles,
    preferredPrimaryRefRole:
      (isCinematicReferenceRole(current?.preferredPrimaryRefRole) ? current?.preferredPrimaryRefRole : null)
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

function clampDurationToRange(value: number, minDurationSeconds: number | null, maxDurationSeconds: number | null) {
  const minimum = typeof minDurationSeconds === 'number' ? clampShotDuration(minDurationSeconds) : 1
  const maximum = typeof maxDurationSeconds === 'number' ? clampShotDuration(maxDurationSeconds) : 15
  const nextMinimum = Math.min(minimum, maximum)
  const nextMaximum = Math.max(minimum, maximum)
  return Math.min(nextMaximum, Math.max(nextMinimum, clampShotDuration(value)))
}

function normalizeActionPacingText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function isStoryActionScenePreset(scenePreset: string | null | undefined) {
  return [
    'duel_showdown',
    'chase_escape_fragmented',
    'ambush_counterambush',
    'battlefield_push_and_collapse',
    'heroic_arrival_reversal',
    'siege_last_stand',
  ].includes(scenePreset ?? '')
}

function actionTextHasTurnCue(text: string) {
  return /\b(counter|reversal|reverse|disarm|breach|breaks through|collapse|collapses|stumble|falls|drop|yield|retreat|arrival|arrives|rescue|escape|capture|obstacle|barrier|door|gate|wall|corner)\b/.test(text)
}

function actionTextIsCombatLike(text: string) {
  return /\b(clash|strike|parry|slash|stab|lunge|feint|block|riposte|swing|duel|melee|fight|weapon|blade|sword|hit|kick|punch)\b/.test(text)
}

function actionTextIsChaseLike(text: string) {
  return /\b(run|sprint|chase|pursue|pursuit|flee|escape|vault|jump|leap|duck|scramble|rush|dodge|weave|slide|climb)\b/.test(text)
}

function shotReadsAsActionSetPiece(shot: Pick<CinematicScriptShot, 'actions' | 'beat' | 'storyScenePreset' | 'participantRefIds'>) {
  if (isStoryActionScenePreset(shot.storyScenePreset)) return true
  const normalizedBeat = normalizeActionPacingText(shot.beat)
  const actionText = normalizeActionPacingText(
    shot.actions.map((action) => `${action.verb} ${action.stagingNotes}`).join(' '),
  )
  const actionLike =
    actionTextIsCombatLike(normalizedBeat)
    || actionTextIsChaseLike(normalizedBeat)
    || actionTextIsCombatLike(actionText)
    || actionTextIsChaseLike(actionText)
  return actionLike && (shot.participantRefIds.length >= 2 || shot.actions.length >= 2)
}

function shouldBreakForStoryActionRhythm(input: {
  shot: CinematicScriptShot & { _compiledDurationSeconds: number }
  previousShot: (CinematicScriptShot & { _compiledDurationSeconds: number }) | null
  currentDuration: number
}) {
  const { shot, previousShot, currentDuration } = input
  if (!previousShot) return false
  const previousIsAction = shotReadsAsActionSetPiece(previousShot)
  const currentIsAction = shotReadsAsActionSetPiece(shot)
  if (!previousIsAction && !currentIsAction) return false

  const normalizedBeat = normalizeActionPacingText(shot.beat)
  const previousBeat = normalizeActionPacingText(previousShot.beat)
  const currentIsTurn = actionTextHasTurnCue(normalizedBeat)
  const previousIsTurn = actionTextHasTurnCue(previousBeat)
  const settleCue = /\b(reset|stare|staredown|standoff|hold|holds|measure|measuring|control|advancing|forced to respect|forced back|breathing)\b/.test(normalizedBeat)

  if (currentDuration >= 13) return true
  if (currentDuration >= 11 && (currentIsTurn || previousIsTurn)) return true
  if (currentDuration >= 9 && settleCue) return true
  return false
}

function preferredMinimumStoryActionShotsPerTake(
  shots: Array<Pick<CinematicScriptShot, 'storyScenePreset'>>,
) {
  const scenePresets = shots.map((shot) => shot.storyScenePreset).filter((value): value is NonNullable<typeof value> => Boolean(value))
  if (scenePresets.includes('duel_showdown')) return 3
  if (scenePresets.includes('battlefield_push_and_collapse')) return 3
  if (scenePresets.includes('siege_last_stand')) return 3
  return 2
}

function countStoryActionExchanges(shot: Pick<CinematicScriptShot, 'actions' | 'beat' | 'storyScenePreset'>) {
  if (!isStoryActionScenePreset(shot.storyScenePreset) || shot.actions.length === 0) {
    return {
      exchangeCount: shot.actions.length,
      microBeatCount: shot.actions.length,
    }
  }

  let exchangeCount = 0
  let previousAction: CinematicScriptShot['actions'][number] | null = null
  let previousText = normalizeActionPacingText(shot.beat)

  for (const action of shot.actions) {
    const actionText = normalizeActionPacingText(`${action.verb} ${action.stagingNotes}`)
    const currentCombatLike = actionTextIsCombatLike(actionText) || actionTextIsCombatLike(previousText)
    const currentChaseLike = actionTextIsChaseLike(actionText) || actionTextIsChaseLike(previousText)
    const sameActorPair =
      previousAction !== null
      && previousAction.actorRefId === action.actorRefId
      && previousAction.targetRefId === action.targetRefId
    const reversedActorPair =
      previousAction !== null
      && previousAction.actorRefId === action.targetRefId
      && previousAction.targetRefId === action.actorRefId
    const sameProp = previousAction !== null && previousAction.propRefId === action.propRefId
    const sameVector =
      previousAction !== null
      && (
        sameActorPair
        || (currentCombatLike && reversedActorPair)
        || (currentChaseLike && previousAction.actorRefId === action.actorRefId)
      )
    const shouldSplit =
      previousAction === null
      || actionTextHasTurnCue(actionText)
      || actionTextHasTurnCue(previousText)
      || !sameVector
      || (!sameProp && !currentCombatLike && !currentChaseLike)

    if (shouldSplit) exchangeCount += 1

    previousAction = action
    previousText = actionText || previousText
  }

  return {
    exchangeCount: Math.max(1, exchangeCount),
    microBeatCount: shot.actions.length,
  }
}

function takeQualifiesForStoryboardPanelPlan(shots: Array<Pick<CinematicScriptShot, 'actions' | 'beat' | 'storyScenePreset' | 'participantRefIds'>>) {
  if (shots.length === 0) return false
  const totalActionMicroBeats = shots.reduce((total, shot) => total + shot.actions.length, 0)
  return (
    shots.some((shot) => shotReadsAsActionSetPiece(shot))
    || totalActionMicroBeats >= 4
    || shots.some((shot) => shot.actions.length >= 3)
  )
}

function deriveTakeStoryboardActionDensity(shots: Array<Pick<CinematicScriptShot, 'actions' | 'storyScenePreset' | 'beat' | 'participantRefIds'>>) {
  const totalActionMicroBeats = shots.reduce((total, shot) => total + shot.actions.length, 0)
  if (totalActionMicroBeats >= 8 || shots.some((shot) => isStoryActionScenePreset(shot.storyScenePreset) && shot.actions.length >= 4)) return 'high' as const
  if (totalActionMicroBeats >= 4 || shots.some((shot) => shot.actions.length >= 2) || shots.some((shot) => shotReadsAsActionSetPiece(shot))) return 'medium' as const
  return 'low' as const
}

function buildStoryboardPanelPhases(panelCount: number) {
  if (panelCount >= 5) return ['engage', 'exchange', 'exchange', 'turn', 'payoff']
  if (panelCount === 4) return ['engage', 'exchange', 'turn', 'payoff']
  if (panelCount === 3) return ['engage', 'exchange', 'turn/payoff']
  if (panelCount === 2) return ['engage', 'exchange']
  return ['hold']
}

function buildTakeStoryboardPanelDescription(input: {
  shot: Pick<CinematicScriptShot, 'beat' | 'title'>
  actionLine: string
  phase: string
  panelCount: number
  panelIndex: number
}) {
  const baseLine = (input.actionLine || input.shot.beat || input.shot.title).trim().replace(/\.$/, '')
  if (!baseLine) return input.shot.title
  return `${baseLine}.`
}

function buildTakeStoryboardPanelTitle(input: {
  shotTitle: string
  phase: string
  panelCount: number
  panelIndex: number
}) {
  if (input.panelCount === 1) return input.shotTitle
  return `${input.shotTitle} - Panel ${input.panelIndex + 1}`
}

function formatTakeStoryboardPanelScriptText(input: {
  title: string
  panels: CinematicTakeStoryboardPanel[]
}) {
  const sections = [
    `TAKE: ${input.title}`,
    ...input.panels.map((panel, index) => [
      `PANEL ${index + 1}`,
      panel.shotId ? `SHOT: ${panel.shotId}` : null,
      panel.title ? `TITLE: ${panel.title}` : null,
      `DESCRIPTION: ${panel.description}`,
      panel.cameraAngle ? `CAMERA_ANGLE: ${panel.cameraAngle}` : null,
      panel.cameraMotion ? `CAMERA_MOTION: ${panel.cameraMotion}` : null,
    ].filter((entry): entry is string => Boolean(entry)).join('\n')),
  ]

  return sections.filter((entry): entry is string => Boolean(entry)).join('\n\n')
}

export function parseTakeStoryboardPanelScriptText(storyboardPanelScriptText: string | null | undefined) {
  const normalized = typeof storyboardPanelScriptText === 'string'
    ? storyboardPanelScriptText.replace(/\r\n/g, '\n').trim()
    : ''
  if (!normalized || !/\bPANEL\s+\d+\b/i.test(normalized)) return []

  const rawBlocks = normalized
    .split(/\n(?=PANEL\s+\d+\b)/g)
    .map((entry) => entry.trim())
    .filter((entry) => /^PANEL\s+\d+\b/i.test(entry))

  const knownLabels = new Set(['SHOT', 'TITLE', 'DESCRIPTION', 'CAMERA_ANGLE', 'CAMERA_MOTION'])
  return rawBlocks.map((block, index) => {
    const lines = block.split('\n')
    const parsedValues: Record<string, string> = {}
    let activeLabel: string | null = null

    for (const rawLine of lines.slice(1)) {
      const line = rawLine.trim()
      if (!line) continue
      const labelMatch = line.match(/^([A-Z_]+):\s*(.*)$/)
      if (labelMatch && knownLabels.has(labelMatch[1])) {
        activeLabel = labelMatch[1]
        parsedValues[activeLabel] = labelMatch[2] ?? ''
        continue
      }
      if (activeLabel) {
        parsedValues[activeLabel] = parsedValues[activeLabel]
          ? `${parsedValues[activeLabel]} ${line}`.trim()
          : line
      }
    }

    return cinematicTakeStoryboardPanelSchema.parse({
      id: `parsed_panel_${index + 1}`,
      shotId: parsedValues.SHOT?.trim() || null,
      title: parsedValues.TITLE?.trim() || `Panel ${index + 1}`,
      description: parsedValues.DESCRIPTION?.trim() || '',
      cameraAngle: parsedValues.CAMERA_ANGLE?.trim() || '',
      cameraMotion: parsedValues.CAMERA_MOTION?.trim() || '',
    })
  })
}

function buildTakeRepresentativeStillPrompt(input: {
  title: string
  shots: Array<Pick<CinematicScriptShot, 'title' | 'beat' | 'visualPrompt' | 'hookRole' | 'actions'>>
}) {
  const rankedShots = [...input.shots].sort((left, right) => {
    const leftScore =
      (left.hookRole === 'payoff' ? 40 : left.hookRole === 'proof' ? 30 : left.hookRole === 'hook' ? 20 : 0)
      + ((left.actions?.length ?? 0) * 3)
      + (left.visualPrompt.trim() ? 2 : 0)
      + (left.beat.trim() ? 1 : 0)
    const rightScore =
      (right.hookRole === 'payoff' ? 40 : right.hookRole === 'proof' ? 30 : right.hookRole === 'hook' ? 20 : 0)
      + ((right.actions?.length ?? 0) * 3)
      + (right.visualPrompt.trim() ? 2 : 0)
      + (right.beat.trim() ? 1 : 0)
    return rightScore - leftScore
  })
  const anchorShot = rankedShots[0] ?? null
  if (!anchorShot) return input.title
  const anchorText = [anchorShot.visualPrompt.trim(), anchorShot.beat.trim(), anchorShot.title.trim()]
    .find((entry) => entry.length > 0)
    ?? input.title
  return anchorText.replace(/\s+/g, ' ').replace(/\.$/, '').trim()
}

export function buildSimpleStoryboardGridLabel(panelCount: number) {
  if (panelCount <= 1) return '1x1'
  if (panelCount <= 4) return '2x2'
  if (panelCount <= 9) return '3x3'
  if (panelCount <= 12) return '3x4'
  return '4x4'
}

export function buildStoryTakeStillImagePrompt(input: {
  representativeStillPrompt: string
  representativeFrameSeconds?: number | null
  sceneBias?: string | null
  cameraBias?: string | null
  entitySummaries?: string[]
}) {
  return [
    'Create one cinematic still image.',
    input.representativeStillPrompt.trim() ? `Visual: ${input.representativeStillPrompt.trim().replace(/\.$/, '')}.` : null,
    ...(input.entitySummaries ?? []),
    'No text, captions, or borders.',
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
}

export function buildStoryStoryboardBoardPrompt(input: {
  panelDescriptions: string[]
  entitySummaries?: string[]
}) {
  const panelCount = Math.max(1, input.panelDescriptions.length)
  return [
    `Draw the actors and entities in a cinematic sequence in a ${buildSimpleStoryboardGridLabel(panelCount)} grid.`,
    'Use the reference image as the representative look of the take.',
    ...input.panelDescriptions.map((description, index) => `PANEL ${index + 1}: ${description.replace(/\s+/g, ' ').replace(/\.$/, '')}.`),
    ...(input.entitySummaries ?? []),
    'No text or borders.',
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
}

export function deriveTakeStoryboardPanelArtifacts(input: {
  title: string
  shots: Array<Pick<CinematicScriptShot, 'id' | 'title' | 'beat' | 'cameraAngle' | 'cameraMovement' | 'framing' | 'participantRefIds' | 'locationRefId' | 'propRefIds' | 'storyScenePreset' | 'storyLanguagePreset' | 'actions'>>
}) {
  if (!takeQualifiesForStoryboardPanelPlan(input.shots)) {
    return {
      storyboardPanelPlan: null,
      storyboardPanelScriptText: '',
      storyboardPanelPlanVersion: null,
      storyboardPanelStatus: 'none' as const,
    }
  }

  const panels: CinematicTakeStoryboardPanel[] = []
  for (const shot of input.shots) {
    const storyContract =
      shot.storyScenePreset || shot.storyLanguagePreset
        ? resolveStoryRuntimeContract({
            storyScenePreset: shot.storyScenePreset ?? null,
            storyLanguagePreset: shot.storyLanguagePreset ?? null,
          })
        : null
    const densityBias = storyContract?.storyboardPanelDensityBias ?? deriveTakeStoryboardActionDensity([shot])
    const actionPressure =
      shot.actions.length
      + (actionTextIsCombatLike(normalizeActionPacingText(shot.beat)) || actionTextIsChaseLike(normalizeActionPacingText(shot.beat)) ? 1 : 0)
    let panelCount = 1
    if (densityBias === 'high') {
      panelCount = actionPressure >= 5 ? 4 : actionPressure >= 3 ? 3 : actionPressure >= 2 ? 2 : 1
    } else if (densityBias === 'medium') {
      panelCount = actionPressure >= 4 ? 3 : actionPressure >= 2 ? 2 : 1
    } else if (actionPressure >= 3) {
      panelCount = 2
    }

    const phases = buildStoryboardPanelPhases(panelCount)
    for (let index = 0; index < phases.length; index += 1) {
      const phase = phases[index]
      const action = shot.actions[Math.min(index, Math.max(0, shot.actions.length - 1))] ?? null
      const actionLine =
        action
          ? [(action.verb ?? '').trim(), (action.stagingNotes ?? '').trim()].filter((entry) => entry.length > 0).join('. ')
          : shot.beat.trim()
      const description = buildTakeStoryboardPanelDescription({
        shot,
        actionLine,
        phase,
        panelCount,
        panelIndex: index,
      })
      panels.push(cinematicTakeStoryboardPanelSchema.parse({
        id: `${shot.id}_panel_${index + 1}`,
        shotId: shot.id,
        title: buildTakeStoryboardPanelTitle({
          shotTitle: shot.title,
          phase,
          panelCount,
          panelIndex: index,
        }),
        description,
        cameraAngle: '',
        cameraMotion: '',
      }))
    }
  }

  if (panels.length === 0) {
    return {
      storyboardPanelPlan: null,
      storyboardPanelScriptText: '',
      storyboardPanelPlanVersion: 'v1',
      storyboardPanelStatus: 'stale' as const,
    }
  }

  const storyboardPanelPlan = cinematicTakeStoryboardPanelPlanSchema.parse({
    panels,
  })
  return {
    storyboardPanelPlan,
    storyboardPanelScriptText: formatTakeStoryboardPanelScriptText({
      title: input.title,
      panels,
    }),
    storyboardPanelPlanVersion: 'v1',
    storyboardPanelStatus: 'generated' as const,
  }
}

function resolveShotEditorialDurationContract(shot: CinematicScriptShot) {
  const storyContract =
    shot.storyScenePreset || shot.storyLanguagePreset
      ? resolveStoryRuntimeContract({
        storyScenePreset: shot.storyScenePreset ?? null,
        storyLanguagePreset: shot.storyLanguagePreset ?? null,
      })
      : null
  const ugcProfile = getUgcPresetProfile(shot.formatSubtype)
  const roleRange = ugcProfile
    ? (getUgcDurationRangeForShot({
        formatSubtype: shot.formatSubtype,
        hookRole: shot.hookRole,
      }) ?? ugcProfile.pacingContract.idealShotDurationRangeSeconds)
    : storyContract?.idealShotDurationRangeSeconds ?? null
  const minDurationSeconds = shot.minDurationSeconds ?? roleRange?.[0] ?? null
  const maxDurationSeconds = shot.maxDurationSeconds ?? roleRange?.[1] ?? null
  const targetDurationSeconds =
    shot.targetDurationSeconds
    ?? getUgcDefaultShotDurationSeconds({
      formatSubtype: shot.formatSubtype,
      hookRole: shot.hookRole,
    })
    ?? (roleRange ? Math.round((roleRange[0] + roleRange[1]) / 2) : null)

  return {
    storyContract,
    ugcProfile,
    roleRange,
    minDurationSeconds,
    maxDurationSeconds,
    targetDurationSeconds,
  }
}

function normalizeTimelineShotDuration(durationSeconds: number | null | undefined) {
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
    return Math.min(15, Math.max(1, Math.round(durationSeconds)))
  }
  return 4
}

function resolveCompiledShotStillAtSeconds(input: {
  stillAtSeconds: number | null | undefined
  durationSeconds: number
}) {
  if (typeof input.stillAtSeconds === 'number' && Number.isFinite(input.stillAtSeconds)) {
    return Math.round(Math.max(0, Math.min(input.durationSeconds, input.stillAtSeconds)) * 10) / 10
  }
  return Math.round((input.durationSeconds / 2) * 10) / 10
}

function deriveAuthoredLocalTimingDurationSeconds(
  shot: Pick<CinematicScriptShot, 'dialogue' | 'actions' | 'audio' | 'beats'>,
) {
  const maxTimedEnd = Math.max(
    0,
    ...shot.dialogue.flatMap((entry) => [entry.startSeconds ?? 0, entry.endSeconds ?? 0]),
    ...shot.actions.flatMap((entry) => [entry.startSeconds ?? 0, entry.endSeconds ?? 0]),
    ...shot.audio.flatMap((entry) => [entry.startSeconds ?? 0, entry.endSeconds ?? 0]),
    ...shot.beats.flatMap((entry) => [entry.startSeconds ?? 0, entry.endSeconds ?? 0]),
  )
  if (!(maxTimedEnd > 0)) return null
  return Math.min(15, Math.max(1, Math.ceil(maxTimedEnd)))
}

export function buildCinematicShotTimingMap<TShot extends { id: string; durationSeconds: number | null | undefined }>(shots: TShot[]) {
  const timingMap = new Map<string, CinematicShotTiming>()
  let currentStartSeconds = 0

  for (const shot of shots) {
    const durationSeconds = normalizeTimelineShotDuration(shot.durationSeconds)
    const startSeconds = currentStartSeconds
    const endSeconds = startSeconds + durationSeconds
    timingMap.set(shot.id, {
      id: shot.id,
      durationSeconds,
      startSeconds,
      endSeconds,
    })
    currentStartSeconds = endSeconds
  }

  return timingMap
}

function inferShotDuration(shot: CinematicScriptShot) {
  const editorialContract = resolveShotEditorialDurationContract(shot)
  if (typeof shot.durationSeconds === 'number' && Number.isFinite(shot.durationSeconds)) {
    const durationSeconds = clampDurationToRange(
      shot.durationSeconds,
      editorialContract.minDurationSeconds,
      editorialContract.maxDurationSeconds,
    )
    return {
      durationSeconds,
      durationSource: 'manual' as const,
      timingSummary: editorialContract.targetDurationSeconds
        ? `Manual shot duration override shaped to the editorial contract around ${editorialContract.targetDurationSeconds}s.`
        : 'Manual shot duration override.',
    }
  }

  const authoredTimedDurationSeconds = deriveAuthoredLocalTimingDurationSeconds(shot)
  if (typeof authoredTimedDurationSeconds === 'number' && Number.isFinite(authoredTimedDurationSeconds)) {
    const durationSeconds = clampDurationToRange(
      authoredTimedDurationSeconds,
      editorialContract.minDurationSeconds,
      editorialContract.maxDurationSeconds,
    )
    return {
      durationSeconds,
      durationSource: 'inferred' as const,
      timingSummary: `Authored local beat timing reaches ${Math.round(authoredTimedDurationSeconds * 10) / 10}s.`,
    }
  }

  const estimated = estimateShotContentDurationSeconds(shot)
  let inferred = estimated.inferredDurationSeconds
  const ugcProfile = editorialContract.ugcProfile
  if (ugcProfile) {
    const roleRange = editorialContract.roleRange ?? ugcProfile.pacingContract.idealShotDurationRangeSeconds
    const defaultDuration = editorialContract.targetDurationSeconds ?? inferred
    const dialogueWords = countDialogueWords(shot)
    const overDialogueLimit = dialogueWords > ugcProfile.pacingContract.maxDialogueWordsPerShot
    const actionOverflow = shot.actions.length > ugcProfile.pacingContract.maxActionBeatsPerShot
    const targetBias = Math.round(((defaultDuration * 2) + Math.min(roleRange[1], inferred)) / 3)
    const biased = overDialogueLimit || actionOverflow
      ? Math.min(roleRange[1], Math.max(roleRange[0], defaultDuration))
      : targetBias
    inferred = clampDurationToRange(
      Math.min(roleRange[1], Math.max(roleRange[0], biased)),
      editorialContract.minDurationSeconds,
      editorialContract.maxDurationSeconds,
    )
  } else if (editorialContract.storyContract && editorialContract.roleRange) {
    const roleRange = editorialContract.roleRange
    const defaultDuration = editorialContract.targetDurationSeconds ?? inferred
    const dialogueWords = countDialogueWords(shot)
    const actionGrouping = countStoryActionExchanges(shot)
    const overDialogueLimit =
      editorialContract.storyContract.maxDialogueWordsPerShot !== null
      && dialogueWords > editorialContract.storyContract.maxDialogueWordsPerShot
    const actionOverflow =
      editorialContract.storyContract.maxActionMicroBeatsPerShot !== null
      && actionGrouping.microBeatCount > editorialContract.storyContract.maxActionMicroBeatsPerShot
    const bundledActionBias =
      isStoryActionScenePreset(editorialContract.storyContract.scenePreset)
        ? Math.min(
            roleRange[1],
            Math.max(
              roleRange[0],
              defaultDuration
              + Math.max(0, actionGrouping.exchangeCount - 1)
              + (actionGrouping.microBeatCount >= 4 ? 1 : 0),
            ),
          )
        : Math.min(roleRange[1], inferred)
    const compressedActionBias =
      isStoryActionScenePreset(editorialContract.storyContract.scenePreset)
        ? Math.max(
            roleRange[0],
            Math.min(
              roleRange[1],
              defaultDuration
              - (dialogueWords === 0 ? 1 : 0)
              - (actionGrouping.exchangeCount <= 1 ? 1 : 0)
              + (actionGrouping.microBeatCount >= 4 ? 1 : 0),
            ),
          )
        : defaultDuration
    const targetBias = Math.round(((defaultDuration * 2) + Math.min(roleRange[1], inferred)) / 3)
    const biased = overDialogueLimit || actionOverflow
      ? Math.min(roleRange[1], Math.max(roleRange[0], defaultDuration))
      : isStoryActionScenePreset(editorialContract.storyContract.scenePreset)
        ? Math.round((targetBias + bundledActionBias + compressedActionBias) / 3)
        : targetBias
    inferred = clampDurationToRange(
      Math.min(roleRange[1], Math.max(roleRange[0], biased)),
      editorialContract.minDurationSeconds,
      editorialContract.maxDurationSeconds,
    )
  }

  const actionSummary = (() => {
    if (shot.actions.length === 0) return null
    const groupedActions = countStoryActionExchanges(shot)
    if (isStoryActionScenePreset(shot.storyScenePreset)) {
      return `${groupedActions.microBeatCount} action micro-beat${groupedActions.microBeatCount === 1 ? '' : 's'} in ${groupedActions.exchangeCount} exchange${groupedActions.exchangeCount === 1 ? '' : 's'} ~${Math.round(estimated.actionSeconds * 10) / 10}s`
    }
    return `${shot.actions.length} action beat${shot.actions.length === 1 ? '' : 's'} ~${Math.round(estimated.actionSeconds * 10) / 10}s`
  })()

  return {
    durationSeconds: inferred,
    durationSource: 'inferred' as const,
    timingSummary: [
      shot.dialogue.length > 0 ? `${shot.dialogue.length} dialogue beat${shot.dialogue.length === 1 ? '' : 's'} ~${Math.round(estimated.dialogueSeconds * 10) / 10}s` : null,
      actionSummary,
      shot.shotType !== 'custom' ? `${shot.shotType} shot` : null,
    ].filter((entry): entry is string => Boolean(entry)).join(' · ') || 'Default cinematic pacing.',
  }
}

function clampRelativeSeconds(value: number, durationSeconds: number) {
  return Math.round(Math.max(0, Math.min(durationSeconds, value)) * 10) / 10
}

function normalizeTimedShotEntries<TEntry extends {
  startSeconds: number | null
  endSeconds: number | null
}>(
  entries: TEntry[],
  durationSeconds: number,
  options: {
    inferDurationSeconds: (entry: TEntry) => number
    minWindowSeconds?: number
    singleEntryDefaultsToFullShot?: boolean
  },
) {
  if (entries.length === 0) return entries
  const minWindowSeconds = options.minWindowSeconds ?? 0.6
  return entries.map((entry, index) => {
    const hasExplicitStart = typeof entry.startSeconds === 'number' && Number.isFinite(entry.startSeconds)
    const hasExplicitEnd = typeof entry.endSeconds === 'number' && Number.isFinite(entry.endSeconds)
    const slotStart = durationSeconds * (index / entries.length)
    const slotEnd = durationSeconds * ((index + 1) / entries.length)
    const estimatedDuration = Math.max(minWindowSeconds, options.inferDurationSeconds(entry))

    if (!hasExplicitStart && !hasExplicitEnd && entries.length === 1 && options.singleEntryDefaultsToFullShot) {
      return {
        ...entry,
        startSeconds: 0,
        endSeconds: clampRelativeSeconds(durationSeconds, durationSeconds),
      }
    }

    let startSeconds = hasExplicitStart
      ? clampRelativeSeconds(entry.startSeconds ?? 0, durationSeconds)
      : clampRelativeSeconds(slotStart, durationSeconds)
    let endSeconds = hasExplicitEnd
      ? clampRelativeSeconds(entry.endSeconds ?? durationSeconds, durationSeconds)
      : clampRelativeSeconds(Math.min(durationSeconds, startSeconds + estimatedDuration), durationSeconds)

    if (!hasExplicitStart && hasExplicitEnd) {
      startSeconds = clampRelativeSeconds(
        Math.max(0, endSeconds - estimatedDuration),
        durationSeconds,
      )
    }

    if (hasExplicitStart && !hasExplicitEnd) {
      const slotBoundedEnd = entries.length > 1
        ? Math.min(durationSeconds, Math.max(startSeconds + minWindowSeconds, slotEnd))
        : durationSeconds
      endSeconds = clampRelativeSeconds(
        Math.min(durationSeconds, Math.max(startSeconds + minWindowSeconds, Math.min(slotBoundedEnd, startSeconds + estimatedDuration))),
        durationSeconds,
      )
    }

    if (!hasExplicitStart && !hasExplicitEnd && entries.length > 1) {
      const boundedSlotEnd = Math.max(slotStart + minWindowSeconds, slotEnd)
      startSeconds = clampRelativeSeconds(slotStart, durationSeconds)
      endSeconds = clampRelativeSeconds(
        Math.min(durationSeconds, Math.max(startSeconds + minWindowSeconds, Math.min(boundedSlotEnd, startSeconds + estimatedDuration))),
        durationSeconds,
      )
    }

    if (endSeconds <= startSeconds) {
      endSeconds = clampRelativeSeconds(Math.min(durationSeconds, startSeconds + minWindowSeconds), durationSeconds)
      if (endSeconds <= startSeconds) {
        startSeconds = clampRelativeSeconds(Math.max(0, startSeconds - minWindowSeconds), durationSeconds)
        endSeconds = clampRelativeSeconds(Math.min(durationSeconds, startSeconds + minWindowSeconds), durationSeconds)
      }
    }

    return {
      ...entry,
      startSeconds,
      endSeconds,
    }
  })
}

function fillBeatTimingsForShot(shot: CinematicScriptShot, durationSeconds: number) {
  const nextDialogue = normalizeTimedShotEntries(shot.dialogue, durationSeconds, {
    inferDurationSeconds: (line) => estimateDialogueDurationSeconds(line),
    minWindowSeconds: 0.8,
  })

  const nextActions = normalizeTimedShotEntries(shot.actions, durationSeconds, {
    inferDurationSeconds: (action) => Math.max(0.9, Math.min(3, estimateActionDurationSeconds(action))),
    minWindowSeconds: 0.9,
  })

  const nextAudio = normalizeTimedShotEntries(shot.audio, durationSeconds, {
    inferDurationSeconds: (cue) => {
      if (cue.kind === 'ambience' || cue.kind === 'music' || cue.kind === 'silence') {
        return durationSeconds
      }
      return Math.max(0.8, durationSeconds / Math.max(1, shot.audio.length))
    },
    minWindowSeconds: 0.8,
    singleEntryDefaultsToFullShot: true,
  })

  const nextBeats = normalizeTimedShotEntries(shot.beats, durationSeconds, {
    inferDurationSeconds: () => Math.max(0.8, durationSeconds / Math.max(1, shot.beats.length)),
    minWindowSeconds: 0.8,
    singleEntryDefaultsToFullShot: true,
  })

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
    || (left.storyScenePreset ?? null) !== (right.storyScenePreset ?? null)
    || (left.storyLanguagePreset ?? null) !== (right.storyLanguagePreset ?? null)
    || (left.formatSubtype ?? null) !== (right.formatSubtype ?? null)
    || (left.formulaFamily ?? null) !== (right.formulaFamily ?? null)
    || (left.dominantTrigger ?? null) !== (right.dominantTrigger ?? null)
    || (left.creativeTreatment ?? null) !== (right.creativeTreatment ?? null)
    || (left.narrationMode ?? null) !== (right.narrationMode ?? null)
    || (left.contrastAxis.trim() || '') !== (right.contrastAxis.trim() || '')
  )
}

function isStoryTakeMetadataBreak(
  left: CinematicScriptShot & { _compiledDurationSeconds: number },
  right: CinematicScriptShot & { _compiledDurationSeconds: number },
) {
  const leftFamily = inferPresetFamilyForShot(left)
  const rightFamily = inferPresetFamilyForShot(right)
  if (leftFamily !== 'story_movie_tv' || rightFamily !== 'story_movie_tv') return false
  return (
    (left.storyScenePreset ?? null) !== (right.storyScenePreset ?? null)
    || (left.storyLanguagePreset ?? null) !== (right.storyLanguagePreset ?? null)
  )
}

function shouldHonorForcedTakeBreak(input: {
  shot: CinematicScriptShot & { _compiledDurationSeconds: number }
  previousShot: (CinematicScriptShot & { _compiledDurationSeconds: number }) | null
}) {
  const { shot, previousShot } = input
  if (!shot.forceTakeBreak) return false
  if (!previousShot) return true

  const storyActionBoundary = shotReadsAsActionSetPiece(shot) || shotReadsAsActionSetPiece(previousShot)
  const locationChanged = previousShot.locationRefId !== shot.locationRefId
  const sceneChanged = previousShot.sceneId !== shot.sceneId
  const sharedParticipants = sharesTakeParticipants(previousShot, shot)
  const formatChanged = isStrongTakeFormatBreak(previousShot, shot)
  const storyMetadataOnlyBreak = isStoryTakeMetadataBreak(previousShot, shot)

  if (!storyActionBoundary) return true
  if (formatChanged && !storyMetadataOnlyBreak) return true
  if (sceneChanged || locationChanged) return true
  if (!sharedParticipants) return true
  return false
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
  if (shouldHonorForcedTakeBreak({ shot, previousShot })) return 'Explicit take break.'
  if (currentDuration + shot._compiledDurationSeconds > 15) return 'Split to stay within the 15-second take limit.'
  if (!previousShot) return ''

  const locationChanged = previousShot.locationRefId !== shot.locationRefId
  const sceneChanged = previousShot.sceneId !== shot.sceneId
  const sharedParticipants = sharesTakeParticipants(previousShot, shot)
  const formatChanged = isStrongTakeFormatBreak(previousShot, shot)
  const storyMetadataOnlyBreak = isStoryTakeMetadataBreak(previousShot, shot)
  const hardLocationJump = locationChanged && !sharedParticipants
  const hardSceneJump = sceneChanged && locationChanged && !sharedParticipants
  const softContinuityShift = (locationChanged || sceneChanged) && !hardLocationJump && !hardSceneJump

  if (previousShot.variationGroupId.trim() !== shot.variationGroupId.trim()) return 'Split on a variation pack boundary.'
  if (formatChanged && !storyMetadataOnlyBreak) return 'Split on a strong format or messaging shift.'
  if (hardSceneJump) return 'Split on a scene and location change with no shared participants.'
  if (hardLocationJump) return 'Split on a hard location change with no shared participants.'
  if (softContinuityShift && currentDuration >= 10) return 'Split on a softer continuity shift after a long take.'
  if (shouldBreakForStoryActionRhythm({ shot, previousShot, currentDuration })) {
    return 'Split on a major action turn or settle point after a sustained combat exchange.'
  }
  if (isUgcShot(shot) && previousShot && shouldBreakForUgcEditorialRhythm({ shot, previousShot, currentDuration })) {
    return 'Split on a UGC editorial beat boundary or dominant-action change.'
  }
  return ''
}

function inferPresetFamilyForShot(shot: Pick<CinematicScriptShot, 'storyScenePreset' | 'storyLanguagePreset' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger'>) {
  if (shot.storyScenePreset || shot.storyLanguagePreset) return 'story_movie_tv' as const
  if (shot.formatSubtype || shot.formulaFamily || shot.dominantTrigger) return 'ugc_creator' as const
  return 'story_movie_tv' as const
}

function isUgcShot(shot: Pick<CinematicScriptShot, 'storyScenePreset' | 'storyLanguagePreset' | 'formatSubtype' | 'formulaFamily' | 'dominantTrigger'>) {
  return inferPresetFamilyForShot(shot) !== 'story_movie_tv'
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
    || (previousShot.hookRole !== null && shot.hookRole !== null && previousShot.hookRole !== shot.hookRole)
  const proofBeforeCloseBoundary =
    (shot.hookRole === 'payoff' || shot.hookRole === 'cta')
    && previousShot.hookRole !== 'proof'
    && currentDuration >= 5
  const previousTargetDuration = previousShot.targetDurationSeconds ?? previousShot._compiledDurationSeconds
  return (
    (currentDuration >= 4 && actionChanged)
    || (roleBoundary && currentDuration >= Math.min(4, Math.max(2, previousTargetDuration - 1)))
    || proofBeforeCloseBoundary
  )
}

function groupUgcShotsByVariation(shots: CinematicScriptShot[]) {
  const groups = new Map<string, CinematicScriptShot[]>()
  for (const shot of shots) {
    const key = shot.variationGroupId.trim() || '__primary'
    const current = groups.get(key)
    if (current) {
      current.push(shot)
      continue
    }
    groups.set(key, [shot])
  }
  return Array.from(groups.values())
}

function shapeUgcVariationShots(shots: CinematicScriptShot[]) {
  if (shots.length === 0) return shots
  const profile = getUgcPresetProfile(shots[0].formatSubtype)
  let nextShots = shots.map((shot) => {
    const editorialContract = resolveShotEditorialDurationContract(shot)
    const maxActionBeats = editorialContract.ugcProfile?.pacingContract.maxActionBeatsPerShot ?? shot.actions.length
    const nextActions = shot.actions.slice(0, Math.max(1, maxActionBeats))
    const targetDurationSeconds = editorialContract.targetDurationSeconds
    return {
      ...shot,
      targetDurationSeconds,
      minDurationSeconds: editorialContract.minDurationSeconds,
      maxDurationSeconds: editorialContract.maxDurationSeconds,
      durationSeconds: typeof shot.durationSeconds === 'number'
        ? clampDurationToRange(shot.durationSeconds, editorialContract.minDurationSeconds, editorialContract.maxDurationSeconds)
        : targetDurationSeconds,
      actions: nextActions,
    }
  })

  if (!profile || profile.pacingContract.proofShouldLandByShotIndex === null) return nextShots
  const proofDeadlineIndex = Math.max(0, profile.pacingContract.proofShouldLandByShotIndex - 1)
  const proofIndex = nextShots.findIndex((shot) => shot.hookRole === 'proof')
  if (proofIndex > proofDeadlineIndex) {
    const [proofShot] = nextShots.splice(proofIndex, 1)
    const targetIndex = Math.min(proofDeadlineIndex, nextShots.length)
    nextShots.splice(targetIndex, 0, proofShot)
  }

  return nextShots
}

function applyUgcEditorialShaping(shots: CinematicScriptShot[]) {
  if (!shots.every((shot) => isUgcShot(shot))) return shots
  const grouped = groupUgcShotsByVariation(shots)
  return grouped.flatMap((variationShots) => shapeUgcVariationShots(variationShots))
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
    const title = `Take ${takes.length + 1}`
    const storyboardPanels = deriveTakeStoryboardPanelArtifacts({
      title,
      shots: currentShots,
    })
    const representativeStillPrompt = buildTakeRepresentativeStillPrompt({
      title,
      shots: currentShots,
    })
    const endpoint =
      currentShots.length === 1 && currentShots[0]._seedanceModePreference === 'image-to-video' && requiredSourceRefIds.length <= 1
        ? 'image-to-video'
        : 'reference-to-video'
    takes.push(cinematicTakeSpecSchema.parse({
      id: `take_${takes.length + 1}`,
      takeIndex: takes.length,
      title,
      shotIds,
      durationSeconds,
      startSeconds: currentStart,
      endSeconds: currentStart + durationSeconds,
      breakReason: currentBreakReason,
      continuityRefIds,
      seedanceEndpoint: endpoint,
      storyScenePreset: coalesceTakeField(currentShots, (shot) => shot.storyScenePreset, null),
      storyLanguagePreset: coalesceTakeField(currentShots, (shot) => shot.storyLanguagePreset, null),
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
      representativeStillPrompt,
      requiredSourceRefIds,
      storyboardPanelPlan: storyboardPanels.storyboardPanelPlan,
      storyboardPanelScriptText: storyboardPanels.storyboardPanelScriptText,
      storyboardPanelPlanVersion: storyboardPanels.storyboardPanelPlanVersion,
      storyboardPanelStatus: storyboardPanels.storyboardPanelStatus,
    }))
    currentStart += durationSeconds
    currentShots = []
    currentDuration = 0
    currentBreakReason = ''
  }

  for (const shot of shots) {
    const previousShot = currentShots.length > 0 ? currentShots[currentShots.length - 1] : null
    const honorForcedBreak = shouldHonorForcedTakeBreak({ shot, previousShot })
    const locationChanged = Boolean(previousShot && previousShot.locationRefId !== shot.locationRefId)
    const sceneChanged = Boolean(previousShot && previousShot.sceneId !== shot.sceneId)
    const sharedParticipants = previousShot ? sharesTakeParticipants(previousShot, shot) : false
    const formatChanged = previousShot ? isStrongTakeFormatBreak(previousShot, shot) : false
    const hardLocationJump = locationChanged && !sharedParticipants
    const hardSceneJump = sceneChanged && locationChanged && !sharedParticipants
    const softContinuityShift = (locationChanged || sceneChanged) && !hardLocationJump && !hardSceneJump
    const ugcTake = currentShots.some((candidate) => isUgcShot(candidate)) || isUgcShot(shot)
    const storyActionTake = currentShots.some((candidate) => shotReadsAsActionSetPiece(candidate)) || shotReadsAsActionSetPiece(shot)
    const storyTake = currentShots.some((candidate) => inferPresetFamilyForShot(candidate) === 'story_movie_tv') || inferPresetFamilyForShot(shot) === 'story_movie_tv'
    const minimumStoryActionShots = preferredMinimumStoryActionShotsPerTake([...currentShots, shot])
    const canUseSoftStoryActionBreaks = currentShots.length >= minimumStoryActionShots
    const sameStoryContinuityRun = Boolean(
      previousShot
      && storyTake
      && previousShot.sceneId === shot.sceneId
      && previousShot.locationRefId === shot.locationRefId
      && sharedParticipants,
    )
    const protectedStoryEarlyPack =
      sameStoryContinuityRun
      && currentShots.length < Math.max(2, minimumStoryActionShots)
      && currentDuration < 10
    const continuityBreak = currentShots.length > 0 && (
      honorForcedBreak
      || currentDuration + shot._compiledDurationSeconds > 15
      || (formatChanged && !protectedStoryEarlyPack)
      || hardLocationJump
      || hardSceneJump
      || (softContinuityShift && currentDuration >= (storyActionTake ? 13 : 10) && (!storyActionTake || canUseSoftStoryActionBreaks))
      || (storyActionTake && canUseSoftStoryActionBreaks && shouldBreakForStoryActionRhythm({ shot, previousShot, currentDuration }))
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
  const shapedScriptShots = applyUgcEditorialShaping(scriptDoc.shots)
  const dominantStoryScenePreset =
    shapedScriptShots.find((shot) => shot.storyScenePreset)?.storyScenePreset
    ?? null
  const dominantStoryLanguagePreset =
    shapedScriptShots.find((shot) => shot.storyLanguagePreset)?.storyLanguagePreset
    ?? null
  const compiledShots = shapedScriptShots.map((shot) => {
    const normalizedStoryShot =
      shot.formatSubtype || shot.formulaFamily || shot.dominantTrigger
        ? shot
        : {
            ...shot,
            storyScenePreset: shot.storyScenePreset ?? dominantStoryScenePreset,
            storyLanguagePreset: shot.storyLanguagePreset ?? dominantStoryLanguagePreset,
          }
    const inferredTiming = inferShotDuration(normalizedStoryShot)
    const timedShot = fillBeatTimingsForShot(normalizedStoryShot, inferredTiming.durationSeconds)
    const sourceRefIds = buildRequiredSourceRefIdsForScriptShot(timedShot)
    const presetFamily = inferPresetFamilyForShot(timedShot)
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
  const isUgcFlow = compiledShots.some((shot) => isUgcShot(shot))
  const takes = buildCompiledTakes(compiledShots)
  const shotTimingById = buildCinematicShotTimingMap(compiledShots.map((shot) => ({
    id: shot.id,
    durationSeconds: shot._compiledDurationSeconds,
  })))
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
      ...(shotTimingById.get(shot.id) ?? {
        id: shot.id,
        durationSeconds: shot._compiledDurationSeconds,
        startSeconds: 0,
        endSeconds: shot._compiledDurationSeconds,
      }),
      sceneId: shot.sceneId,
      id: shot.id,
      title: shot.title,
      subtitle: shot.subtitle,
      beat: shot.beat,
      emotionalBeat: shot.emotionalBeat,
      hookRole: shot.hookRole,
      storyScenePreset: shot.storyScenePreset,
      storyLanguagePreset: shot.storyLanguagePreset,
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
      shotJob: shot.shotJob,
      targetDurationSeconds: shot.targetDurationSeconds,
      minDurationSeconds: shot.minDurationSeconds,
      maxDurationSeconds: shot.maxDurationSeconds,
      cutTrigger: shot.cutTrigger,
      communicationGoal: shot.communicationGoal,
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
      stillAtSeconds: resolveCompiledShotStillAtSeconds({
        stillAtSeconds: shot.stillAtSeconds ?? null,
        durationSeconds: shot._compiledDurationSeconds,
      }),
      inferredDurationSeconds: shot._durationSource === 'inferred' ? shot._compiledDurationSeconds : null,
      durationSource: shot._durationSource,
      timingSummary: shot._timingSummary,
      takeId: takeByShotId.get(shot.id)?.id ?? null,
      takeIndex: takeByShotId.get(shot.id)?.index ?? null,
      approvedForTake: shot.approvedForTake ?? false,
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
          take.storyScenePreset || take.storyLanguagePreset ? 'story_movie_tv' : (isUgcFlow ? 'ugc_creator' : 'story_movie_tv'),
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
      executionPlan: normalizeSeedanceExecutionPlan(source.executionPlan),
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
      executionPlan: normalizeSeedanceExecutionPlan(source.executionPlan),
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
      storyScenePreset: shot.storyScenePreset,
      storyLanguagePreset: shot.storyLanguagePreset,
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
      shotJob: shot.shotJob,
      targetDurationSeconds: shot.targetDurationSeconds,
      minDurationSeconds: shot.minDurationSeconds,
      maxDurationSeconds: shot.maxDurationSeconds,
      cutTrigger: shot.cutTrigger,
      communicationGoal: shot.communicationGoal,
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
      stillAtSeconds: shot.stillAtSeconds,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      approvedForTake: shot.approvedForTake,
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
  const {
    storyScenePreset,
    storyLanguagePreset,
    contract: storyContract,
  } = resolveStoryPresetSelection({
    presetFamily,
    storyScenePreset: graphOverrides.storyScenePreset ?? projectOverrides.storyScenePreset ?? null,
    storyLanguagePreset: graphOverrides.storyLanguagePreset ?? projectOverrides.storyLanguagePreset ?? null,
  })
  const formulaFamily =
    graphOverrides.formulaFamily
    ?? projectOverrides.formulaFamily
    ?? deriveDefaultFormulaFamilyFromFormatSubtype(formatSubtype)
  const dominantTrigger =
    graphOverrides.dominantTrigger
    ?? projectOverrides.dominantTrigger
    ?? deriveDefaultDominantTriggerFromFormatSubtype(formatSubtype)
  const formatDefaults = isUgcPresetFamily(presetFamily)
    ? deriveUgcShotDefaults({
        presetFamily,
        formatSubtype,
        shotIndex: 0,
        shotCount: 1,
        hookRole: 'hook',
      })
    : null
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
    storyScenePreset,
    storyLanguagePreset,
    formatSubtype,
    formulaFamily,
    dominantTrigger,
    proofMoment:
      (typeof graphOverrides.proofMoment === 'string' && graphOverrides.proofMoment.trim().length > 0 ? graphOverrides.proofMoment : null)
      ?? (typeof projectOverrides.proofMoment === 'string' && projectOverrides.proofMoment.trim().length > 0 ? projectOverrides.proofMoment : null)
      ?? formatDefaults?.proofMoment
      ?? '',
    ctaStyle:
      (typeof graphOverrides.ctaStyle === 'string' && graphOverrides.ctaStyle.trim().length > 0 ? graphOverrides.ctaStyle : null)
      ?? (typeof projectOverrides.ctaStyle === 'string' && projectOverrides.ctaStyle.trim().length > 0 ? projectOverrides.ctaStyle : null)
      ?? formatDefaults?.ctaStyle
      ?? '',
    authorshipPipeline:
      graphOverrides.authorshipPipeline
      ?? projectOverrides.authorshipPipeline
      ?? getDefaultAuthorshipPipelineForPresetFamily(presetFamily),
    contrastAxis:
      (typeof graphOverrides.contrastAxis === 'string' && graphOverrides.contrastAxis.trim().length > 0 ? graphOverrides.contrastAxis : null)
      ?? (typeof projectOverrides.contrastAxis === 'string' && projectOverrides.contrastAxis.trim().length > 0 ? projectOverrides.contrastAxis : null)
      ?? formatDefaults?.contrastAxis
      ?? '',
    defaultClipSeconds:
      graphOverrides.defaultClipSeconds
      ?? projectOverrides.defaultClipSeconds
      ?? getUgcPresetProfile(formatSubtype, presetFamily)?.preferredClipSeconds
      ?? defaultCinematicSettings.defaultClipSeconds,
    targetTotalDurationSeconds:
      graphOverrides.targetTotalDurationSeconds
      ?? projectOverrides.targetTotalDurationSeconds
      ?? (storyContract ? Math.round((storyContract.targetSceneDurationRangeSeconds[0] + storyContract.targetSceneDurationRangeSeconds[1]) / 2) : defaultCinematicSettings.targetTotalDurationSeconds),
    targetTotalDurationRangeSeconds:
      graphOverrides.targetTotalDurationRangeSeconds
      ?? projectOverrides.targetTotalDurationRangeSeconds
      ?? (storyContract ? [...storyContract.targetSceneDurationRangeSeconds] as [number, number] : defaultCinematicSettings.targetTotalDurationRangeSeconds),
    targetShotCount:
      graphOverrides.targetShotCount
      ?? projectOverrides.targetShotCount
      ?? (storyContract ? Math.round((storyContract.targetShotCountRange[0] + storyContract.targetShotCountRange[1]) / 2) : defaultCinematicSettings.targetShotCount),
    targetShotCountRange:
      graphOverrides.targetShotCountRange
      ?? projectOverrides.targetShotCountRange
      ?? (storyContract ? [...storyContract.targetShotCountRange] as [number, number] : defaultCinematicSettings.targetShotCountRange),
    proofDeadlineShotIndex:
      graphOverrides.proofDeadlineShotIndex
      ?? projectOverrides.proofDeadlineShotIndex
      ?? storyContract?.revealDeadlineShotIndex
      ?? defaultCinematicSettings.proofDeadlineShotIndex,
    idealShotDurationRangeSeconds:
      graphOverrides.idealShotDurationRangeSeconds
      ?? projectOverrides.idealShotDurationRangeSeconds
      ?? (storyContract ? [...storyContract.idealShotDurationRangeSeconds] as [number, number] : defaultCinematicSettings.idealShotDurationRangeSeconds),
    maxDialogueWordsPerShot:
      graphOverrides.maxDialogueWordsPerShot
      ?? projectOverrides.maxDialogueWordsPerShot
      ?? storyContract?.maxDialogueWordsPerShot
      ?? defaultCinematicSettings.maxDialogueWordsPerShot,
    maxActionBeatsPerShot:
      graphOverrides.maxActionBeatsPerShot
      ?? projectOverrides.maxActionBeatsPerShot
      ?? storyContract?.maxActionBeatsPerShot
      ?? defaultCinematicSettings.maxActionBeatsPerShot,
    stillAspectRatio,
    specializationMode: deriveSpecializationModeFromPresetFamily(presetFamily),
  }
}

export function materializeCinematicGraphSettings(
  graphSettings: unknown,
): CinematicSettings {
  const overrides = cinematicSettingsSchema.partial().parse(graphSettings ?? {})
  const inferredPresetFamily =
    overrides.presetFamily
    ?? (overrides.storyScenePreset || overrides.storyLanguagePreset ? 'story_movie_tv' : null)
    ?? (
      overrides.formatSubtype
        ? overrides.formatSubtype.startsWith('ad_')
          ? 'ugc_direct_response_ad'
          : overrides.formatSubtype.startsWith('faceless_')
            ? 'ugc_faceless_format'
            : 'ugc_creator'
        : null
    )
    ?? (overrides.specializationMode ? derivePresetFamilyFromSpecializationMode(overrides.specializationMode) : null)
    ?? defaultCinematicSettings.presetFamily

  return getCinematicSettings({}, {
    cinematics: {
      ...overrides,
      presetFamily: inferredPresetFamily,
    },
  })
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
    executionPlan: normalizeSeedanceExecutionPlan(metadata.executionPlan as Partial<SeedanceExecutionPlan> | null | undefined),
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
    executionPlan: normalizeSeedanceExecutionPlan(metadata.executionPlan as Partial<SeedanceExecutionPlan> | null | undefined),
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
