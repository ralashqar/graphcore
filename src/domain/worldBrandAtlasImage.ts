import { z } from 'zod'

import { assetDefinitionSchema } from './graphcore.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldBrandAtlasImageRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  prompt: z.string().trim().optional(),
})

export const worldBrandAtlasImageResponseSchema = z.object({
  ok: z.literal(true),
  status: z.enum(['queued', 'completed']).default('completed'),
  asset: assetDefinitionSchema,
  draftMetadata: looseRecordSchema,
  brandAtlasAssetKey: z.string().min(1),
  visualJobId: z.string().nullable().default(null),
  signedUrl: z.string().nullable().default(null),
})

export type WorldBrandAtlasImageResponse = z.infer<typeof worldBrandAtlasImageResponseSchema>
