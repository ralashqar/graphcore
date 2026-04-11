import { z } from 'zod'

export const WORLD_BUILD_ENVIRONMENT_VIEWS = ['hero', 'wide_alt', 'detail_area'] as const

export const worldBuildPlanItemKindSchema = z.enum(['character', 'environment', 'item', 'narrative_graph'])
export const worldBuildBatchStatusSchema = z.enum(['planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const worldBuildJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped'])
export const resourceGenerationStateSchema = z.enum(['pending', 'running', 'completed', 'failed'])

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
  requestSummary: z.string(),
  planItems: z.array(worldBuildPlanItemSchema),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

export const worldBuildStartRequestSchema = z.object({
  prompt: z.string().min(1),
  requestSummary: z.string().min(1),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  planItems: z.array(worldBuildPlanItemSchema),
  model: z.string().min(1),
})

export const resourceGenerationMetadataSchema = z.object({
  batchId: z.string(),
  jobId: z.string(),
  state: resourceGenerationStateSchema,
  placeholder: z.boolean().default(false),
  source: z.literal('global_prompt').default('global_prompt'),
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
  status: worldBuildBatchStatusSchema,
  diagnostics: z.array(z.string()).default([]),
  planItems: z.array(worldBuildPlanItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobs: z.array(worldBuildJobSchema).default([]),
})

export const worldBuildStatusResponseSchema = z.object({
  batch: worldBuildBatchSchema,
  definitions: z.array(z.record(z.string(), z.unknown())).default([]),
  graphs: z.array(z.record(z.string(), z.unknown())).default([]),
  assets: z.array(z.record(z.string(), z.unknown())).default([]),
})

export const worldBuildPollRequestSchema = z.object({
  batchId: z.string(),
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  model: z.string().min(1),
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
