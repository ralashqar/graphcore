import {
  mapOutputArtifactRow,
  outputArtifactSelect,
} from './output-workflow.ts'
import {
  sceneContinuityManifestForShot,
  sceneContinuityManifestSchema,
  shotReadinessFromManifest,
  type SceneContinuityManifest,
  type ShotReferenceReadiness,
} from '../../../src/domain/sceneContinuityManifest.ts'

type QueryClient = {
  from: (table: string) => any
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function manifestFromArtifactMetadata(metadata: Record<string, unknown>) {
  const raw = asRecord(metadata.sceneContinuityManifest ?? metadata.scene_continuity_manifest)
  const parsed = sceneContinuityManifestSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function loadSceneContinuityManifestArtifacts(input: {
  client: QueryClient
  projectId: string
  draftId: string
  masterRequestId: string
  limit?: number
}) {
  let query = input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .contains('metadata', { masterRequestId: input.masterRequestId })
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 64)

  const response = await query
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? [])
    .map(mapOutputArtifactRow)
    .map((artifact) => {
      const metadata = asRecord(artifact.metadata)
      const manifest = manifestFromArtifactMetadata(metadata)
      return manifest ? { artifact, manifest } : null
    })
    .filter((entry): entry is { artifact: ReturnType<typeof mapOutputArtifactRow>; manifest: SceneContinuityManifest } => Boolean(entry))
}

export async function loadSceneContinuityManifests(input: {
  client: QueryClient
  projectId: string
  draftId: string
  masterRequestId: string
}) {
  const entries = await loadSceneContinuityManifestArtifacts(input)
  return entries.map((entry) => entry.manifest)
}

export function resolveSceneContinuityForShot(input: {
  manifests: readonly SceneContinuityManifest[]
  shot: Record<string, unknown>
  fallbackSceneId?: string
}): {
  manifest: SceneContinuityManifest | null
  readiness: ShotReferenceReadiness | null
} {
  const shotId = readText(input.shot.id)
  const sceneId = readText(input.shot.sourceSceneId ?? input.shot.source_scene_id ?? input.shot.sceneId ?? input.shot.scene_id) || input.fallbackSceneId || ''
  const manifest = sceneContinuityManifestForShot(input.manifests, { shotId, sceneId })
  return {
    manifest,
    readiness: shotReadinessFromManifest(manifest, shotId),
  }
}

export function sceneContinuityBlockingReason(input: {
  manifest: SceneContinuityManifest | null
  readiness: ShotReferenceReadiness | null
}) {
  if (!input.manifest) return 'missing_scene_continuity_manifest' as const
  if (input.manifest.status !== 'ready') return input.manifest.missingBlockers[0] ?? 'missing_spatial_ref'
  if (!input.readiness) return input.manifest.shotReadiness.length === 0 ? null : 'missing_scene_continuity_manifest' as const
  if (input.readiness.status !== 'ready' && input.readiness.status !== 'keyframe_ready') {
    return input.readiness.blockers[0] ?? 'missing_spatial_ref'
  }
  const missing = readArray(input.readiness.missingArtifactRoles).map(readText).filter(Boolean)
  if (missing.some((role) => role.includes('local'))) return 'missing_local_ref' as const
  if (missing.length > 0) return 'missing_spatial_ref' as const
  const zoneId = readText(input.readiness.zoneId)
  const zoneAssetKeys = readArray(input.readiness.zoneAssetKeys).map(readText).filter(Boolean)
  if (zoneId && zoneAssetKeys.length === 0) return 'missing_spatial_ref' as const
  return null
}
