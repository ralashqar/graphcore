import { z } from 'zod'

const rawRecordSchema = z.record(z.string(), z.unknown())

export const cinematicAspectRatioSchema = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
export const cinematicStillResolutionSchema = z.enum(['1K', '2K'])
export const cinematicVideoResolutionSchema = z.enum(['480p', '720p', '1080p'])
export const cinematicSpecializationModeSchema = z.enum(['story', 'ugc'])

export const cinematicSettingsSchema = z.object({
  stillAspectRatio: cinematicAspectRatioSchema.default('16:9'),
  stillResolution: cinematicStillResolutionSchema.default('1K'),
  videoResolution: cinematicVideoResolutionSchema.default('720p'),
  defaultClipSeconds: z.number().int().positive().max(20).default(5),
  defaultFps: z.number().int().positive().max(60).default(24),
  specializationMode: cinematicSpecializationModeSchema.default('story'),
})

export const assetRefNodeConfigSchema = z.object({
  entityRefId: z.string().nullable().default(null),
  definitionKey: z.string().nullable().default(null),
  assetRole: z.enum(['character', 'environment', 'item']).nullable().default(null),
  stagingNotes: z.string().default(''),
})

export const cinematicShotNodeConfigSchema = z.object({
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
  durationSeconds: z.number().int().positive().max(20).nullable().default(null),
  stillAssetKey: z.string().nullable().default(null),
  videoAssetKey: z.string().nullable().default(null),
  lastRunId: z.string().nullable().default(null),
  lastStillJobId: z.string().nullable().default(null),
  lastVideoJobId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  providerModel: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
})

export const cinematicGraphMetadataSchema = z.object({
  cinematics: cinematicSettingsSchema.partial().default({}),
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
export type AssetRefNodeConfig = z.infer<typeof assetRefNodeConfigSchema>
export type CinematicShotNodeConfig = z.infer<typeof cinematicShotNodeConfigSchema>
export type CinematicRun = z.infer<typeof cinematicRunSchema>
export type CinematicRunJob = z.infer<typeof cinematicRunJobSchema>
export type CinematicRunStartRequest = z.infer<typeof cinematicRunStartRequestSchema>
export type CinematicRunStatusResponse = z.infer<typeof cinematicRunStatusResponseSchema>

const defaultCinematicSettings = cinematicSettingsSchema.parse({})
const defaultAssetRefNodeConfig = assetRefNodeConfigSchema.parse({})
const defaultShotNodeConfig = cinematicShotNodeConfigSchema.parse({})

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

export function getAssetRefNodeConfig(node: { metadata?: unknown } | null | undefined): AssetRefNodeConfig {
  const parsed = assetRefNodeConfigSchema.safeParse(node?.metadata ?? {})
  return parsed.success ? parsed.data : defaultAssetRefNodeConfig
}

export function getCinematicShotNodeConfig(node: { metadata?: unknown } | null | undefined): CinematicShotNodeConfig {
  const parsed = cinematicShotNodeConfigSchema.safeParse(node?.metadata ?? {})
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
