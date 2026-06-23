import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const sceneContinuityBlockerReasonSchema = z.enum([
  'missing_scene_continuity_manifest',
  'missing_spatial_ref',
  'missing_spot_angle',
  'missing_coverage_anchor',
  'missing_local_ref',
  'missing_previous_keyframe',
])

export const sceneContinuityRecoveryActionSchema = z.object({
  action: z.string().min(1),
  label: z.string().default(''),
  reason: sceneContinuityBlockerReasonSchema,
  shotId: z.string().default(''),
  nodeId: z.string().default(''),
  coverageSetupId: z.string().default(''),
}).strict()

export const shotReferenceReadinessSchema = z.object({
  shotId: z.string().default(''),
  status: z.enum(['ready', 'waiting', 'blocked', 'keyframe_ready']).default('blocked'),
  sceneId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  viewpointId: z.string().default(''),
  angleIds: z.array(z.string()).default([]),
  worldRefIds: z.array(z.string()).default([]),
  localRefIds: z.array(z.string()).default([]),
  spatialNodeIds: z.array(z.string()).default([]),
  requiredArtifactKeys: z.array(z.string()).default([]),
  readyArtifactKeys: z.array(z.string()).default([]),
  zoneAssetKeys: z.array(z.string()).default([]),
  spotAtlasAssetKeys: z.array(z.string()).default([]),
  spotAngleAssetKeys: z.array(z.string()).default([]),
  missingArtifactRoles: z.array(z.string()).default([]),
  coverageSetupId: z.string().default(''),
  coverageAnchorAssetKey: z.string().default(''),
  coverageCellAssetKey: z.string().default(''),
  coverageBoardId: z.string().default(''),
  previousShotId: z.string().default(''),
  previousKeyframeAssetKey: z.string().default(''),
  blockers: z.array(sceneContinuityBlockerReasonSchema).default([]),
  recoveryActions: z.array(sceneContinuityRecoveryActionSchema).default([]),
  hash: z.string().default(''),
}).strict()

export const sceneContinuityManifestSchema = z.object({
  contractVersion: z.literal('scene_continuity_manifest_v1').default('scene_continuity_manifest_v1'),
  status: z.enum(['ready', 'waiting', 'blocked']).default('blocked'),
  masterRequestId: z.string().default(''),
  sceneId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  scopeNodeId: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  hierarchy: z.object({
    setIds: z.array(z.string()).default([]),
    zoneIds: z.array(z.string()).default([]),
    spotIds: z.array(z.string()).default([]),
    viewpointIds: z.array(z.string()).default([]),
    angleIds: z.array(z.string()).default([]),
  }).strict().default({ setIds: [], zoneIds: [], spotIds: [], viewpointIds: [], angleIds: [] }),
  requiredWorldRefIds: z.array(z.string()).default([]),
  requiredLocalRefIds: z.array(z.string()).default([]),
  requiredSpatialNodeIds: z.array(z.string()).default([]),
  readyArtifactKeys: z.array(z.string()).default([]),
  zoneAssetKeys: z.array(z.string()).default([]),
  spotAtlasAssetKeys: z.array(z.string()).default([]),
  spotAngleAssetKeys: z.array(z.string()).default([]),
  coverageCellAssetKeys: z.array(z.string()).default([]),
  missingBlockers: z.array(sceneContinuityBlockerReasonSchema).default([]),
  recoveryActions: z.array(sceneContinuityRecoveryActionSchema).default([]),
  shotReadiness: z.array(shotReferenceReadinessSchema).default([]),
  sourceHash: z.string().default(''),
  policyVersion: z.string().default('scene_continuity_manifest_v1'),
  metadata: looseRecordSchema.default({}),
}).strict()

export type SceneContinuityBlockerReason = z.infer<typeof sceneContinuityBlockerReasonSchema>
export type SceneContinuityRecoveryAction = z.infer<typeof sceneContinuityRecoveryActionSchema>
export type ShotReferenceReadiness = z.infer<typeof shotReferenceReadinessSchema>
export type SceneContinuityManifest = z.infer<typeof sceneContinuityManifestSchema>

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForHash(entry)]),
    )
  }
  return value
}

export function sceneContinuityStableHash(value: unknown) {
  const text = JSON.stringify(normalizeForHash(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildShotReferenceReadinessHash(readiness: Omit<ShotReferenceReadiness, 'hash'>) {
  return sceneContinuityStableHash({
    shotId: readiness.shotId,
    status: readiness.status,
    sceneId: readiness.sceneId,
    setId: readiness.setId,
    zoneId: readiness.zoneId,
    spotIds: readiness.spotIds,
    viewpointId: readiness.viewpointId,
    angleIds: readiness.angleIds,
    worldRefIds: readiness.worldRefIds,
    localRefIds: readiness.localRefIds,
    spatialNodeIds: readiness.spatialNodeIds,
    requiredArtifactKeys: readiness.requiredArtifactKeys,
    readyArtifactKeys: readiness.readyArtifactKeys,
    zoneAssetKeys: readiness.zoneAssetKeys,
    spotAtlasAssetKeys: readiness.spotAtlasAssetKeys,
    spotAngleAssetKeys: readiness.spotAngleAssetKeys,
    missingArtifactRoles: readiness.missingArtifactRoles,
    coverageSetupId: readiness.coverageSetupId,
    coverageAnchorAssetKey: readiness.coverageAnchorAssetKey,
    coverageCellAssetKey: readiness.coverageCellAssetKey,
    coverageBoardId: readiness.coverageBoardId,
    previousShotId: readiness.previousShotId,
    previousKeyframeAssetKey: readiness.previousKeyframeAssetKey,
    blockers: readiness.blockers,
  })
}

export function buildSceneContinuityManifestSourceHash(input: {
  policyVersion: string
  masterRequestId: string
  sceneId: string
  setId?: string
  zoneId?: string
  scopeNodeId?: string
  shotIds?: readonly string[]
  spatialNodeIds?: readonly string[]
  readyArtifactKeys?: readonly string[]
  zoneAssetKeys?: readonly string[]
  spotAtlasAssetKeys?: readonly string[]
  spotAngleAssetKeys?: readonly string[]
  coverageCellAssetKeys?: readonly string[]
  forceRefresh?: boolean
}) {
  return sceneContinuityStableHash({
    policyVersion: input.policyVersion,
    masterRequestId: input.masterRequestId,
    sceneId: input.sceneId,
    setId: input.setId ?? '',
    zoneId: input.zoneId ?? '',
    scopeNodeId: input.scopeNodeId ?? '',
    shotIds: [...(input.shotIds ?? [])].sort(),
    spatialNodeIds: [...(input.spatialNodeIds ?? [])].sort(),
    readyArtifactKeys: [...(input.readyArtifactKeys ?? [])].sort(),
    zoneAssetKeys: [...(input.zoneAssetKeys ?? [])].sort(),
    spotAtlasAssetKeys: [...(input.spotAtlasAssetKeys ?? [])].sort(),
    spotAngleAssetKeys: [...(input.spotAngleAssetKeys ?? [])].sort(),
    coverageCellAssetKeys: [...(input.coverageCellAssetKeys ?? [])].sort(),
    forceRefresh: input.forceRefresh === true,
  })
}

export function sceneContinuityManifestForShot(
  manifests: readonly SceneContinuityManifest[],
  input: { shotId: string; sceneId?: string | null },
) {
  const shotId = input.shotId.trim()
  const sceneId = (input.sceneId ?? '').trim()
  if (!shotId) return null
  return manifests.find((manifest) => {
    if (sceneId && manifest.sceneId && manifest.sceneId !== sceneId) return false
    if (sceneId && manifest.sceneId === sceneId && manifest.shotIds.length === 0 && manifest.shotReadiness.length === 0) return true
    if (manifest.shotIds.includes(shotId)) return true
    return manifest.shotReadiness.some((entry) => entry.shotId === shotId)
  }) ?? null
}

export function shotReadinessFromManifest(
  manifest: SceneContinuityManifest | null | undefined,
  shotId: string,
) {
  if (!manifest) return null
  return manifest.shotReadiness.find((entry) => entry.shotId === shotId) ?? null
}
