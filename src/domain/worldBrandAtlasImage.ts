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
  asset: assetDefinitionSchema,
  draftMetadata: looseRecordSchema,
  brandAtlasAssetKey: z.string().min(1),
  signedUrl: z.string().nullable().default(null),
})

export type WorldBrandAtlasImageResponse = z.infer<typeof worldBrandAtlasImageResponseSchema>
