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

export const spatialWorldProviderCapabilitySchema = z.object({
  text: z.boolean().default(true),
  primaryImage: z.boolean().default(false),
  multiViewImages: z.boolean().default(false),
  panorama: z.boolean().default(false),
  video: z.boolean().default(false),
  cancellation: z.boolean().default(false),
  collider: z.boolean().default(false),
})

export const spatialWorldProviderCapabilities: Record<z.infer<typeof spatialWorldProviderSchema>, z.infer<typeof spatialWorldProviderCapabilitySchema>> = {
  worldlabs: { text: true, primaryImage: false, multiViewImages: false, panorama: false, video: false, cancellation: false, collider: true },
  spaitial: { text: false, primaryImage: false, multiViewImages: false, panorama: false, video: false, cancellation: false, collider: false },
}

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

export const spatialWorldLodSchema = z.object({
  assetKey: z.string().min(1),
  role: z.string().min(1),
  estimatedSplats: z.number().int().positive().nullable().default(null),
  byteSize: z.number().int().nonnegative().nullable().default(null),
  qualityRank: z.number().int().nonnegative().default(0),
})

export const spatialWorldProcessingStateSchema = z.object({
  status: z.enum(['not_requested', 'queued', 'running', 'completed', 'failed']).default('not_requested'),
  processor: z.string().nullable().default(null),
  sourceHash: z.string().nullable().default(null),
  processedAt: z.string().nullable().default(null),
  derivedAssetKeys: z.array(z.string()).default([]),
  diagnostics: looseRecordSchema.default({}),
})

export const spatialWorldColliderDiagnosticsSchema = z.object({
  available: z.boolean().default(false),
  triangleCount: z.number().int().nonnegative().nullable().default(null),
  bounds: spatialWorldBoundsSchema.nullable().default(null),
  walkable: z.boolean().nullable().default(null),
  notes: z.array(z.string()).default([]),
})

export const spatialWorldPerformanceHintsSchema = z.object({
  preferredLodAssetKey: z.string().nullable().default(null),
  minimumDeviceMemoryGb: z.number().positive().nullable().default(null),
  recommendedPixelRatio: z.number().positive().nullable().default(null),
  maxWalkDistance: z.number().positive().nullable().default(null),
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
  lods: z.array(spatialWorldLodSchema).default([]),
  colliderMeshAssetKey: z.string().nullable().default(null),
  panoramaAssetKey: z.string().nullable().default(null),
  thumbnailAssetKey: z.string().nullable().default(null),
  hostedPreviewUrl: z.string().url().nullable().default(null),
  units: z.enum(['meters', 'provider_native']).default('provider_native'),
  metricScaleFactor: z.number().positive().nullable().default(null),
  groundPlaneOffset: z.number().nullable().default(null),
  bounds: spatialWorldBoundsSchema.nullable().default(null),
  processing: spatialWorldProcessingStateSchema.default({
    status: 'not_requested', processor: null, sourceHash: null, processedAt: null, derivedAssetKeys: [], diagnostics: {},
  }),
  colliderDiagnostics: spatialWorldColliderDiagnosticsSchema.default({ available: false, triangleCount: null, bounds: null, walkable: null, notes: [] }),
  performanceHints: spatialWorldPerformanceHintsSchema.default({ preferredLodAssetKey: null, minimumDeviceMemoryGb: null, recommendedPixelRatio: null, maxWalkDistance: null }),
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

export const spatialWorldMarkerCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  variantId: z.string().min(1),
  key: z.string().min(1),
  kind: spatialWorldMarkerKindSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  transform: spatialWorldTransformSchema,
  camera: spatialWorldMarkerSchema.shape.camera.default(null),
  linkedEntityKey: z.string().nullable().default(null),
  linkedLocationKey: z.string().nullable().default(null),
  linkedSceneId: z.string().nullable().default(null),
  linkedSpotId: z.string().nullable().default(null),
  linkedCoverageSetupId: z.string().nullable().default(null),
  screenshotAssetKey: z.string().nullable().default(null),
  visible: z.boolean().default(true),
  metadata: looseRecordSchema.default({}),
})

export const spatialWorldMarkerUpdateRequestSchema = spatialWorldMarkerCreateRequestSchema.partial().extend({
  markerId: z.string().min(1),
})

export const spatialWorldMarkerDeleteRequestSchema = z.object({ markerId: z.string().min(1) })
export const spatialWorldMarkerMutationResponseSchema = z.object({ ok: z.literal(true), marker: spatialWorldMarkerSchema.nullable() })

export const spatialWorldVariantAlignmentUpdateRequestSchema = z.object({
  variantId: z.string().min(1),
  transform: spatialWorldTransformSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  groundPlaneOffset: z.number().nullable().default(null),
  validationNotes: z.array(z.string()).default([]),
})
export const spatialWorldVariantAlignmentUpdateResponseSchema = z.object({ ok: z.literal(true), variant: spatialWorldVariantSchema })

export const spatialWorldProcessingStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled'])
export const spatialWorldProcessingJobSchema = z.object({
  id: z.string(), projectId: z.string(), draftId: z.string(), variantId: z.string(), requestedBy: z.string().nullable().default(null),
  status: spatialWorldProcessingStatusSchema, operation: z.enum(['validate', 'optimize', 'generate_lods']).default('validate'),
  input: looseRecordSchema.default({}), outputs: looseRecordSchema.default({}), errorMessage: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0), metadata: looseRecordSchema.default({}), createdAt: z.string(), updatedAt: z.string(),
})
export const spatialWorldProcessingStartRequestSchema = z.object({ variantId: z.string().min(1), operation: z.enum(['validate', 'optimize', 'generate_lods']).default('validate') })
export const spatialWorldProcessingResponseSchema = z.object({ ok: z.literal(true), job: spatialWorldProcessingJobSchema })
export const spatialWorldPerformanceEventSchema = z.object({
  projectId: z.string().min(1), draftId: z.string().min(1), variantId: z.string().min(1),
  eventType: z.enum(['load', 'frame_sample', 'walk_recovery', 'webgl_error']), fps: z.number().nonnegative().nullable().default(null),
  frameTimeMs: z.number().nonnegative().nullable().default(null), loadTimeMs: z.number().int().nonnegative().nullable().default(null),
  selectedLodAssetKey: z.string().nullable().default(null), deviceMemoryGb: z.number().nonnegative().nullable().default(null), metadata: looseRecordSchema.default({}),
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
export type SpatialWorldMarkerCreateRequest = z.infer<typeof spatialWorldMarkerCreateRequestSchema>
export type SpatialWorldMarkerUpdateRequest = z.infer<typeof spatialWorldMarkerUpdateRequestSchema>
export type SpatialWorldVariantAlignmentUpdateRequest = z.infer<typeof spatialWorldVariantAlignmentUpdateRequestSchema>
export type SpatialWorldProcessingJob = z.infer<typeof spatialWorldProcessingJobSchema>
export type SpatialWorldPerformanceEvent = z.infer<typeof spatialWorldPerformanceEventSchema>

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

export function validateSpatialWorldProviderInput(provider: SpatialWorldProvider, input: SpatialWorldProviderInput) {
  const capabilities = spatialWorldProviderCapabilities[provider]
  if (!capabilities.text) return `${provider} is not enabled for live generation.`
  const primaryImages = input.sourceImages.filter((image) => image.role === 'primary')
  const referenceImages = input.sourceImages.filter((image) => image.role === 'reference')
  const panoramas = input.sourceImages.filter((image) => image.role === 'panorama')
  if (primaryImages.length > 0 && !capabilities.primaryImage) return `${provider} does not currently support verified primary-image input.`
  if (referenceImages.length > 0 && (!capabilities.multiViewImages || referenceImages.length > 1)) return `${provider} does not currently support verified multi-view image input.`
  if (panoramas.length > 0 && !capabilities.panorama) return `${provider} does not currently support verified panorama input.`
  if (input.sourceVideoAssetKey && !capabilities.video) return `${provider} does not currently support verified video input.`
  return null
}

export function selectSpatialWorldLod(input: {
  manifest: SpatialWorldManifest
  deviceMemoryGb?: number | null
  fps?: number | null
}) {
  const lods = input.manifest.lods.length > 0
    ? input.manifest.lods
    : input.manifest.lodAssetKeys.map((assetKey, index) => ({ assetKey, role: `lod_${index}`, estimatedSplats: null, byteSize: null, qualityRank: index }))
  if (lods.length === 0) return input.manifest.primarySplatAssetKey
  const ordered = [...lods].sort((left, right) => {
    const leftWeight = left.estimatedSplats ?? left.byteSize ?? left.qualityRank
    const rightWeight = right.estimatedSplats ?? right.byteSize ?? right.qualityRank
    return leftWeight - rightWeight
  })
  const constrained = (input.deviceMemoryGb != null && input.deviceMemoryGb < 6) || (input.fps != null && input.fps < 28)
  if (constrained) return ordered[0]?.assetKey ?? input.manifest.primarySplatAssetKey
  return input.manifest.performanceHints.preferredLodAssetKey ?? ordered[ordered.length - 1]?.assetKey ?? input.manifest.primarySplatAssetKey
}

export function resolveSpatialWorldSpawn(input: { markers: SpatialWorldMarker[]; manifest: SpatialWorldManifest | null }) {
  const entry = input.markers.find((marker) => marker.visible && marker.kind === 'entry_point')
  if (entry) return entry.transform.position
  const bounds = input.manifest?.bounds
  if (bounds) return [(bounds.min[0] + bounds.max[0]) / 2, (input.manifest?.groundPlaneOffset ?? bounds.min[1]) + 1.7, (bounds.min[2] + bounds.max[2]) / 2] as [number, number, number]
  return [0, (input.manifest?.groundPlaneOffset ?? 0) + 1.7, 0] as [number, number, number]
}

export function isSpatialWorldPositionOutOfBounds(position: [number, number, number], bounds: SpatialWorldManifest['bounds'], margin = 8) {
  if (!bounds) return position[1] < -25
  return position[0] < bounds.min[0] - margin || position[0] > bounds.max[0] + margin
    || position[1] < bounds.min[1] - margin || position[1] > bounds.max[1] + margin
    || position[2] < bounds.min[2] - margin || position[2] > bounds.max[2] + margin
}

export function buildSpatialWorldComparisonReport(input: { jobs: SpatialWorldGenerationJob[]; variants: SpatialWorldVariant[] }) {
  return input.variants.map((variant) => {
    const job = input.jobs.find((entry) => entry.id === variant.sourceJobId) ?? null
    const storedBytes = variant.manifest?.lods.reduce((sum, lod) => sum + (lod.byteSize ?? 0), 0) ?? 0
    const createdAt = job ? Date.parse(job.createdAt) : Number.NaN
    const updatedAt = job ? Date.parse(job.updatedAt) : Number.NaN
    return {
      variantId: variant.id,
      provider: variant.provider,
      model: variant.model,
      status: variant.status,
      estimatedUsd: job?.estimatedUsd ?? null,
      actualUsd: job?.actualUsd ?? null,
      generationMs: Number.isFinite(createdAt) && Number.isFinite(updatedAt) ? Math.max(0, updatedAt - createdAt) : null,
      storedBytes,
      lodCount: variant.manifest?.lods.length || variant.manifest?.lodAssetKeys.length || 0,
      colliderAvailable: Boolean(variant.manifest?.colliderMeshAssetKey),
      active: variant.isActive,
    }
  }).sort((left, right) => Number(right.active) - Number(left.active) || left.provider.localeCompare(right.provider))
}
