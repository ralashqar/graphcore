import { z } from 'zod'

import { worldBuildPlanRequestSchema } from './worldBuild'

export const meshGenerationJobStatusSchema = z.enum([
  'queued',
  'submitting',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

export const meshGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  definitionKey: z.string(),
  sourceImageAssetKey: z.string(),
  targetMeshAssetKey: z.string(),
  provider: z.string(),
  model: z.string(),
  providerRequestId: z.string().nullable().default(null),
  status: meshGenerationJobStatusSchema,
  providerStatus: z.string().nullable().default(null),
  providerLogs: z.array(z.string()).default([]),
  errorMessage: z.string().nullable().default(null),
  storagePath: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const meshGenerationStartRequestSchema = z.object({
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  definitionKey: z.string().min(1),
})

export const meshGenerationPollRequestSchema = z.object({
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  jobId: z.string().min(1),
})

export const deleteGeneratedMeshRequestSchema = z.object({
  snapshot: worldBuildPlanRequestSchema.shape.snapshot,
  definitionKey: z.string().min(1),
})

export const meshGenerationStatusResponseSchema = z.object({
  jobs: z.array(meshGenerationJobSchema).default([]),
  definitions: z.array(z.record(z.string(), z.unknown())).default([]),
  assets: z.array(z.record(z.string(), z.unknown())).default([]),
  deletedAssetKeys: z.array(z.string()).default([]),
})

export type MeshGenerationJobStatus = z.infer<typeof meshGenerationJobStatusSchema>
export type MeshGenerationJob = z.infer<typeof meshGenerationJobSchema>
export type MeshGenerationStartRequest = z.infer<typeof meshGenerationStartRequestSchema>
export type MeshGenerationPollRequest = z.infer<typeof meshGenerationPollRequestSchema>
export type DeleteGeneratedMeshRequest = z.infer<typeof deleteGeneratedMeshRequestSchema>
export type MeshGenerationStatusResponse = z.infer<typeof meshGenerationStatusResponseSchema>

export function isTerminalMeshGenerationJobStatus(status: string) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

