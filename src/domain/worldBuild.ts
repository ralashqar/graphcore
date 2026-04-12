import { z } from 'zod'
import { cinematicRunSchema } from './cinematics.ts'

export const WORLD_BUILD_ENVIRONMENT_VIEWS = ['hero', 'wide_alt', 'detail_area'] as const

export const worldBuildPlanItemKindSchema = z.enum(['character', 'environment', 'item', 'narrative_graph', 'cinematic_graph'])
export const worldBuildBatchStatusSchema = z.enum(['planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const worldBuildJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped'])
export const resourceGenerationStateSchema = z.enum(['pending', 'running', 'completed', 'failed'])
export const worldBuildPlannerModeSchema = z.enum(['world_build', 'cinematic_build'])

export const worldBuildGenerationOptionsSchema = z.object({
  generateConceptImage: z.boolean().optional(),
  generateConceptGallery: z.boolean().optional(),
  environmentViews: z.array(z.enum(WORLD_BUILD_ENVIRONMENT_VIEWS)).optional(),
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
})

export const cinematicShotPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  beat: z.string(),
  participantRefIds: z.array(z.string()).default([]),
  locationRefId: z.string().nullable().default(null),
  propRefIds: z.array(z.string()).default([]),
  shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
  framing: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMovement: z.string().default(''),
  lensPreference: z.string().default(''),
  durationSeconds: z.number().int().positive().max(20).nullable().default(null),
  visualPrompt: z.string().default(''),
})

export const cinematicGraphSettingsSchema = z.object({
  stillAspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']).optional(),
  stillResolution: z.enum(['1K', '2K']).optional(),
  videoResolution: z.enum(['480p', '720p', '1080p']).optional(),
  defaultClipSeconds: z.number().int().positive().max(20).optional(),
  defaultFps: z.number().int().positive().max(60).optional(),
  specializationMode: z.enum(['story', 'ugc']).optional(),
}).default({})

export const cinematicPlanSchema = z.object({
  graphName: z.string(),
  graphSummary: z.string(),
  entityRefs: z.array(cinematicEntityRefSchema).default([]),
  shots: z.array(cinematicShotPlanSchema).min(1),
  graphSettings: cinematicGraphSettingsSchema,
  autoRun: z.boolean().default(true),
})

export const worldBuildPlanRequestSchema = z.object({
  prompt: z.string().min(1),
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
  source: z.enum(['global_prompt', 'mesh_generation']).default('global_prompt'),
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
export type WorldBuildDeletePlaceholderRequest = z.infer<typeof worldBuildDeletePlaceholderRequestSchema>
export type WorldBuildDeletePlaceholderResponse = z.infer<typeof worldBuildDeletePlaceholderResponseSchema>
export type WorldBuildPlannerMode = z.infer<typeof worldBuildPlannerModeSchema>
export type CinematicPlan = z.infer<typeof cinematicPlanSchema>
export type CinematicEntityRef = z.infer<typeof cinematicEntityRefSchema>
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
