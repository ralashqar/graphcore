import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const spatialWorldProviderSchema = z.enum([
  'worldlabs',
  'spaitial',
])

export const spatialWorldTargetKindSchema = z.enum([
  'environment',
  'world_model',
  'cinematic_location',
])

export const spatialWorldGenerationStatusSchema = z.enum([
  'queued',
  'submitting',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const spatialWorldQualitySchema = z.enum([
  'draft',
  'standard',
  'high',
])

export const spatialWorldSourceImageSchema = z.object({
  assetKey: z.string().min(1),
  role: z.enum(['primary', 'reference', 'panorama']).default('reference'),
})

export const spatialWorldProviderInputSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().nullable().default(null),
  quality: spatialWorldQualitySchema.default('draft'),
  sourceImages: z.array(spatialWorldSourceImageSchema).default([]),
  sourceVideoAssetKey: z.string().min(1).nullable().default(null),
  spatialDocumentSummary: z.string().nullable().default(null),
  idempotencyKey: z.string().min(1),
  metadata: looseRecordSchema.default({}),
})

export const spatialWorldBoundsSchema = z.object({
  min: z.tuple([z.number(), z.number(), z.number()]),
  max: z.tuple([z.number(), z.number(), z.number()]),
})

export const spatialWorldTransformSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
})

export const spatialWorldManifestSchema = z.object({
  version: z.literal(1),
  provider: z.string().min(1),
  providerWorldId: z.string().nullable().default(null),
  visualAssetKeys: z.array(z.string()).default([]),
  primarySplatAssetKey: z.string().nullable().default(null),
  lodAssetKeys: z.array(z.string()).default([]),
  colliderMeshAssetKey: z.string().nullable().default(null),
  panoramaAssetKey: z.string().nullable().default(null),
  thumbnailAssetKey: z.string().nullable().default(null),
  hostedPreviewUrl: z.string().url().nullable().default(null),
  units: z.enum(['meters', 'provider_native']).default('provider_native'),
  metricScaleFactor: z.number().positive().nullable().default(null),
  groundPlaneOffset: z.number().nullable().default(null),
  bounds: spatialWorldBoundsSchema.nullable().default(null),
  generation: looseRecordSchema.default({}),
})

export const spatialWorldGenerationOutputsSchema = z.object({
  manifest: spatialWorldManifestSchema.nullable().default(null),
  manifestAssetKey: z.string().nullable().default(null),
}).catchall(z.unknown())

export const spatialWorldGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  requestedBy: z.string().nullable().default(null),
  targetKind: spatialWorldTargetKindSchema,
  targetKey: z.string().min(1),
  variantKey: z.string().default('default'),
  comparisonId: z.string().nullable().default(null),
  provider: spatialWorldProviderSchema,
  model: z.string().min(1),
  status: spatialWorldGenerationStatusSchema,
  providerOperationId: z.string().nullable().default(null),
  providerWorldId: z.string().nullable().default(null),
  providerStatus: z.string().nullable().default(null),
  input: spatialWorldProviderInputSchema,
  outputs: spatialWorldGenerationOutputsSchema.default({
    manifest: null,
    manifestAssetKey: null,
  }),
  estimatedUsd: z.number().nonnegative().nullable().default(null),
  actualUsd: z.number().nonnegative().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  workerId: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const spatialWorldVariantSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  targetKind: spatialWorldTargetKindSchema,
  targetKey: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['generating', 'ready', 'failed', 'archived']).default('generating'),
  provider: spatialWorldProviderSchema,
  model: z.string().min(1),
  sourceJobId: z.string().nullable().default(null),
  manifestAssetKey: z.string().nullable().default(null),
  manifest: spatialWorldManifestSchema.nullable().default(null),
  alignmentTransform: spatialWorldTransformSchema.default({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
  alignmentConfidence: z.number().min(0).max(1).nullable().default(null),
  isActive: z.boolean().default(false),
  archivedAt: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const spatialWorldMarkerKindSchema = z.enum([
  'annotation',
  'entry_point',
  'canon_anchor',
  'camera_viewpoint',
])

export const spatialWorldMarkerSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  variantId: z.string(),
  key: z.string().min(1),
  kind: spatialWorldMarkerKindSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  transform: spatialWorldTransformSchema,
  camera: z.object({
    fov: z.number().positive().default(50),
    target: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
    projection: z.enum(['perspective', 'orthographic']).default('perspective'),
  }).nullable().default(null),
  linkedEntityKey: z.string().nullable().default(null),
  linkedLocationKey: z.string().nullable().default(null),
  linkedSceneId: z.string().nullable().default(null),
  linkedSpotId: z.string().nullable().default(null),
  linkedCoverageSetupId: z.string().nullable().default(null),
  screenshotAssetKey: z.string().nullable().default(null),
  visible: z.boolean().default(true),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const spatialWorldGenerationStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  targetKind: spatialWorldTargetKindSchema,
  targetKey: z.string().min(1),
  variantKey: z.string().default('default'),
  providers: z.array(spatialWorldProviderSchema).min(1).max(2).refine(
    (providers) => new Set(providers).size === providers.length,
    'Spatial world providers must be unique.',
  ),
  modelByProvider: z.object({
    worldlabs: z.string().min(1).optional(),
    spaitial: z.string().min(1).optional(),
  }).default({}),
  input: spatialWorldProviderInputSchema,
  metadata: looseRecordSchema.default({}),
})

export const spatialWorldGenerationQuoteSchema = z.object({
  provider: spatialWorldProviderSchema,
  model: z.string().min(1),
  quality: spatialWorldQualitySchema,
  estimatedUsd: z.number().nonnegative(),
  estimatedCredits: z.number().int().nonnegative(),
  pricingSource: z.string().min(1),
})

export const spatialWorldGenerationPreviewResponseSchema = z.object({
  ok: z.literal(true),
  quotes: z.array(spatialWorldGenerationQuoteSchema).min(1),
  totalEstimatedUsd: z.number().nonnegative(),
  totalEstimatedCredits: z.number().int().nonnegative(),
  quoteToken: z.string().min(1),
  expiresAt: z.string(),
})

export const spatialWorldGenerationConfirmedStartRequestSchema = spatialWorldGenerationStartRequestSchema.extend({
  quoteToken: z.string().min(1),
})

export const spatialWorldGenerationStartResponseSchema = z.object({
  ok: z.literal(true),
  jobs: z.array(spatialWorldGenerationJobSchema).min(1),
})

export const spatialWorldGenerationStatusRequestSchema = z.object({
  jobId: z.string().min(1),
})

export const spatialWorldGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: spatialWorldGenerationJobSchema,
  terminal: z.boolean().default(false),
})

export const spatialWorldGenerationCancelResponseSchema = z.object({
  ok: z.literal(true),
  job: spatialWorldGenerationJobSchema.nullable().default(null),
  cancelled: z.boolean().default(false),
})

export const spatialWorldVariantActivationRequestSchema = z.object({
  variantId: z.string().uuid(),
})

export const spatialWorldVariantActivationResponseSchema = z.object({
  ok: z.literal(true),
  variant: spatialWorldVariantSchema,
})

export type SpatialWorldProvider = z.infer<typeof spatialWorldProviderSchema>
export type SpatialWorldQuality = z.infer<typeof spatialWorldQualitySchema>
export type SpatialWorldProviderInput = z.infer<typeof spatialWorldProviderInputSchema>
export type SpatialWorldManifest = z.infer<typeof spatialWorldManifestSchema>
export type SpatialWorldGenerationJob = z.infer<typeof spatialWorldGenerationJobSchema>
export type SpatialWorldVariant = z.infer<typeof spatialWorldVariantSchema>
export type SpatialWorldMarker = z.infer<typeof spatialWorldMarkerSchema>
export type SpatialWorldGenerationStartRequest = z.infer<typeof spatialWorldGenerationStartRequestSchema>
export type SpatialWorldGenerationPreviewResponse = z.infer<typeof spatialWorldGenerationPreviewResponseSchema>
export type SpatialWorldGenerationConfirmedStartRequest = z.infer<typeof spatialWorldGenerationConfirmedStartRequestSchema>
export type SpatialWorldGenerationStartResponse = z.infer<typeof spatialWorldGenerationStartResponseSchema>
export type SpatialWorldGenerationStatusResponse = z.infer<typeof spatialWorldGenerationStatusResponseSchema>
export type SpatialWorldGenerationCancelResponse = z.infer<typeof spatialWorldGenerationCancelResponseSchema>
export type SpatialWorldVariantActivationResponse = z.infer<typeof spatialWorldVariantActivationResponseSchema>

export function isTerminalSpatialWorldGenerationStatus(status: string) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function createSpatialWorldIdempotencyKey(input: {
  projectId: string
  draftId: string
  targetKind: z.infer<typeof spatialWorldTargetKindSchema>
  targetKey: string
  variantKey?: string
  provider: SpatialWorldProvider
}) {
  return [
    'spatial-world',
    input.projectId,
    input.draftId,
    input.targetKind,
    input.targetKey,
    input.variantKey || 'default',
    input.provider,
  ].join(':')
}
