import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const visualGenerationStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
])

export const visualGenerationKindSchema = z.enum([
  'world_entity_icon_grid',
  'brand_atlas',
  'screen_mockup',
  'entity_reference_sheet',
  'character_sheet',
  'wiki_visual',
  'app_screen_mockup',
  'app_screen_analysis',
])

export const visualGenerationProviderSchema = z.enum([
  'fal',
  'openai',
  'graphcore',
])

export const visualGenerationAssetOutputSchema = z.object({
  assetKey: z.string().min(1),
  storagePath: z.string().default(''),
  targetKind: z.string().default(''),
  targetKey: z.string().default(''),
  role: z.string().default('primary'),
})

export const visualGenerationOutputsSchema = z.object({
  assets: z.array(visualGenerationAssetOutputSchema).default([]),
}).catchall(z.unknown())

export const visualGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  requestedBy: z.string().nullable().default(null),
  status: visualGenerationStatusSchema,
  kind: visualGenerationKindSchema,
  provider: visualGenerationProviderSchema.default('fal'),
  model: z.string().default('openai/gpt-image-2'),
  targetKeys: looseRecordSchema.default({}),
  input: looseRecordSchema.default({}),
  outputs: visualGenerationOutputsSchema.default({ assets: [] }),
  errorMessage: z.string().nullable().default(null),
  workerId: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const visualGenerationStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  kind: visualGenerationKindSchema,
  provider: visualGenerationProviderSchema.default('fal'),
  model: z.string().default('openai/gpt-image-2'),
  targetKeys: looseRecordSchema.default({}),
  input: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const visualGenerationStartResponseSchema = z.object({
  ok: z.literal(true),
  job: visualGenerationJobSchema,
})

export const visualGenerationStatusRequestSchema = z.object({
  jobId: z.string().min(1),
})

export const visualGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: visualGenerationJobSchema,
  terminal: z.boolean().default(false),
})

export const visualGenerationCancelResponseSchema = z.object({
  ok: z.literal(true),
  job: visualGenerationJobSchema.nullable().default(null),
  cancelled: z.boolean().default(false),
})

export type VisualGenerationStatus = z.infer<typeof visualGenerationStatusSchema>
export type VisualGenerationKind = z.infer<typeof visualGenerationKindSchema>
export type VisualGenerationProvider = z.infer<typeof visualGenerationProviderSchema>
export type VisualGenerationJob = z.infer<typeof visualGenerationJobSchema>
export type VisualGenerationStartRequest = z.infer<typeof visualGenerationStartRequestSchema>
export type VisualGenerationStartResponse = z.infer<typeof visualGenerationStartResponseSchema>
export type VisualGenerationStatusResponse = z.infer<typeof visualGenerationStatusResponseSchema>
export type VisualGenerationCancelResponse = z.infer<typeof visualGenerationCancelResponseSchema>
