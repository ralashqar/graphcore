import { z } from 'zod'

const rawRecordSchema = z.record(z.string(), z.unknown())

export const cinematicAspectRatioSchema = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
export const cinematicStillResolutionSchema = z.enum(['1K', '2K'])
export const cinematicVideoResolutionSchema = z.enum(['480p', '720p', '1080p'])
export const cinematicSpecializationModeSchema = z.enum(['story', 'ugc'])
export const cinematicReferenceKindSchema = z.enum(['definition', 'asset', 'video', 'audio', 'style', 'storyboard', 'composite'])
export const cinematicNodeAssetRoleSchema = z.enum(['character', 'environment', 'item', 'audio', 'style', 'storyboard', 'composite'])
export const cinematicReferencePrioritySchema = z.number().int().min(0).max(100)
export const cinematicRelationshipTypeSchema = z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of'])
export const cinematicStoryboardModeSchema = z.enum(['none', 'sequence_board', 'shot_panels', 'hybrid'])
export const cinematicBeatTypeSchema = z.enum(['action', 'dialogue', 'audio', 'camera', 'transition', 'custom'])
export const cinematicAudioCueKindSchema = z.enum(['dialogue', 'ambience', 'sfx', 'music', 'silence', 'offscreen'])
export const seedanceEndpointSchema = z.enum(['reference-to-video', 'image-to-video'])
export const seedanceModePreferenceSchema = z.enum(['auto', 'reference-to-video', 'image-to-video'])
export const seedanceInputModalitySchema = z.enum(['image', 'video', 'audio'])

export const cinematicSettingsSchema = z.object({
  stillAspectRatio: cinematicAspectRatioSchema.default('16:9'),
  stillResolution: cinematicStillResolutionSchema.default('1K'),
  videoResolution: cinematicVideoResolutionSchema.default('720p'),
  defaultClipSeconds: z.number().int().positive().max(20).default(5),
  defaultFps: z.number().int().positive().max(60).default(24),
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
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  beat: z.string().default(''),
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
  durationSeconds: z.number().int().positive().max(20).nullable().default(null),
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

export const cinematicSequenceSchema = z.object({
  references: z.array(cinematicReferenceSchema).default([]),
  compositeRefs: z.array(cinematicCompositeReferenceSchema).default([]),
  relationships: z.array(cinematicRelationshipSchema).default([]),
  storyboard: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotSpecSchema).default([]),
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
  storyboardKind: z.enum(['sequence_board', 'shot_panel']).default('shot_panel'),
  assetKey: z.string().nullable().default(null),
  notes: z.string().default(''),
  priority: cinematicReferencePrioritySchema.default(90),
})

export const cinematicGraphMetadataSchema = z.object({
  cinematics: cinematicSettingsSchema.partial().default({}),
  cinematicSequence: cinematicSequenceSchema.optional(),
  cinematicAuthoring: rawRecordSchema.optional(),
}).catchall(z.unknown())

export const cinematicRunStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const cinematicRunModeSchema = z.enum(['graph_run', 'preview_still', 'preview_video'])
export const cinematicRunJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'])
export const cinematicRunJobKindSchema = z.enum(['shot_still', 'shot_video'])

export const cinematicRunJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  graphKey: z.string(),
  shotNodeKey: z.string(),
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
  shotNodeKey: z.string().nullable().optional(),
})

export const cinematicRunStatusResponseSchema = z.object({
  run: cinematicRunSchema,
  graphs: z.array(rawRecordSchema).default([]),
  assets: z.array(rawRecordSchema).default([]),
})

export type CinematicSettings = z.infer<typeof cinematicSettingsSchema>
export type CinematicReference = z.infer<typeof cinematicReferenceSchema>
export type CinematicCompositeReference = z.infer<typeof cinematicCompositeReferenceSchema>
export type CinematicRelationship = z.infer<typeof cinematicRelationshipSchema>
export type DialogueBeat = z.infer<typeof dialogueBeatSchema>
export type ActionBeat = z.infer<typeof actionBeatSchema>
export type AudioBeat = z.infer<typeof audioBeatSchema>
export type CinematicBeat = z.infer<typeof cinematicBeatSchema>
export type StoryboardSpec = z.infer<typeof storyboardSpecSchema>
export type SeedanceExecutionPlan = z.infer<typeof seedanceExecutionPlanSchema>
export type CinematicShotSpec = z.infer<typeof cinematicShotSpecSchema>
export type CinematicSequence = z.infer<typeof cinematicSequenceSchema>
export type AssetRefNodeConfig = z.infer<typeof assetRefNodeConfigSchema>
export type CompositeRefNodeConfig = z.infer<typeof compositeRefNodeConfigSchema>
export type StoryboardRefNodeConfig = z.infer<typeof storyboardRefNodeConfigSchema>
export type CinematicShotNodeConfig = z.infer<typeof cinematicShotNodeConfigSchema>
export type CinematicRun = z.infer<typeof cinematicRunSchema>
export type CinematicRunJob = z.infer<typeof cinematicRunJobSchema>
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

export function getCinematicSettings(gameSpec: unknown, graphMetadata: unknown): CinematicSettings {
  const gameSpecCinematics = cinematicSettingsSchema.partial().safeParse(
    gameSpec && typeof gameSpec === 'object' && (gameSpec as { cinematics?: unknown }).cinematics
      ? (gameSpec as { cinematics?: unknown }).cinematics
      : {},
  )
  const graphCinematics = cinematicSettingsSchema.partial().safeParse(
    graphMetadata && typeof graphMetadata === 'object' && (graphMetadata as { cinematics?: unknown }).cinematics
      ? (graphMetadata as { cinematics?: unknown }).cinematics
      : {},
  )

  return {
    ...defaultCinematicSettings,
    ...(gameSpecCinematics.success ? gameSpecCinematics.data : {}),
    ...(graphCinematics.success ? graphCinematics.data : {}),
  }
}

export function getCinematicSequence(graphMetadata: unknown): CinematicSequence {
  const metadata = graphMetadata && typeof graphMetadata === 'object'
    ? graphMetadata as { cinematicSequence?: unknown }
    : {}
  const parsed = cinematicSequenceSchema.safeParse(metadata.cinematicSequence ?? {})
  return parsed.success ? parsed.data : cinematicSequenceSchema.parse({})
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

export function updateNodeMetadataWithShot(
  metadata: Record<string, unknown> | undefined,
  changes: Partial<CinematicShotNodeConfig>,
) {
  return {
    ...(metadata ?? {}),
    ...getCinematicShotNodeConfig({ metadata }),
    ...changes,
  }
}
