import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldEntityIconGenerationStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const worldEntityIconGenerationCandidateSchema = z.object({
  entityKey: z.string().min(1),
  linkedDefinitionKey: z.string().nullable().default(null),
  name: z.string().min(1),
  nodeType: z.string().min(1),
  summary: z.string().default(''),
  visualPrompt: z.string().default(''),
  orderIndex: z.number().int().nonnegative().default(0),
})

export const worldEntityIconGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  status: worldEntityIconGenerationStatusSchema,
  provider: z.string().default('fal'),
  model: z.string().default('openai/gpt-image-2'),
  gridRows: z.number().int().positive(),
  gridCols: z.number().int().positive(),
  entityKeys: z.array(z.string()).default([]),
  sourceGridAssetKey: z.string().nullable().default(null),
  createdAssetKeys: z.record(z.string(), z.string()).default({}),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldEntityIconGenerationStartResponseSchema = z.object({
  ok: z.literal(true),
  job: worldEntityIconGenerationJobSchema,
  candidates: z.array(worldEntityIconGenerationCandidateSchema).default([]),
  skippedCount: z.number().int().nonnegative().default(0),
})

export const worldEntityIconGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: worldEntityIconGenerationJobSchema,
  terminal: z.boolean().default(false),
})

export type WorldEntityIconGenerationStatus = z.infer<typeof worldEntityIconGenerationStatusSchema>
export type WorldEntityIconGenerationCandidate = z.infer<typeof worldEntityIconGenerationCandidateSchema>
export type WorldEntityIconGenerationJob = z.infer<typeof worldEntityIconGenerationJobSchema>
export type WorldEntityIconGenerationStartResponse = z.infer<typeof worldEntityIconGenerationStartResponseSchema>
export type WorldEntityIconGenerationStatusResponse = z.infer<typeof worldEntityIconGenerationStatusResponseSchema>
