import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { spatialWorldManifestSchema, type SpatialWorldGenerationJob } from '../../../src/domain/spatialWorldGeneration.ts'
import { mapSpatialWorldJobRow, spatialWorldJobSelect, type SpatialWorldJobRow } from './spatial-world-generation.ts'
import { pollSpatialWorldProviderJob, submitSpatialWorldProviderJob } from './spatial-world-providers.ts'

type DatabaseClient = SupabaseClient<any, any, any>

function readPositiveInt(name: string, fallback: number) {
  const value = Number(Deno.env.get(name) || fallback)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const pollIntervalMs = readPositiveInt('SPATIAL_WORLD_PROVIDER_POLL_INTERVAL_MS', 5000)
const maxPollMs = readPositiveInt('SPATIAL_WORLD_PROVIDER_MAX_POLL_MS', 20 * 60_000)
const downloadTimeoutMs = readPositiveInt('SPATIAL_WORLD_DOWNLOAD_TIMEOUT_MS', 60_000)

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }

async function loadJob(client: DatabaseClient, id: string) {
  const response = await client.from('spatial_world_generation_jobs').select(spatialWorldJobSelect).eq('id', id).single()
  if (response.error || !response.data) throw new Error(response.error?.message || 'Spatial world job was not found.')
  return mapSpatialWorldJobRow(response.data as SpatialWorldJobRow)
}

async function heartbeat(client: DatabaseClient, job: SpatialWorldGenerationJob, workerId: string, values: Record<string, unknown> = {}) {
  const response = await client.from('spatial_world_generation_jobs').update({
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...values,
  }).eq('id', job.id).eq('worker_id', workerId).in('status', ['submitting', 'running']).select('id').maybeSingle()
  if (response.error) throw new Error(response.error.message)
  if (!response.data) throw new Error('Spatial world job was cancelled or its worker lease was lost.')
}

async function download(url: string) {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), downloadTimeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`download returned ${response.status}`)
      return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'application/octet-stream' }
    } catch (error) {
      lastError = error
      if (attempt < 3) await sleep(750 * attempt)
    } finally { clearTimeout(timeout) }
  }
  throw new Error(`Spatial world artifact download failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

function assetKey(job: SpatialWorldGenerationJob, role: string) {
  const safeTarget = job.targetKey.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `spatial-world.${safeTarget}.${job.variantKey}.${role}`.slice(0, 240)
}

async function persistProviderAssets(client: DatabaseClient, job: SpatialWorldGenerationJob, providerResult: Awaited<ReturnType<typeof pollSpatialWorldProviderJob>>) {
  const roleAssets = new Map<string, { key: string; byteSize: number }>()
  for (const asset of providerResult.assets) {
    const key = assetKey(job, asset.role)
    const storagePath = `generated/spatial-worlds/${job.draftId}/${job.id}/${asset.role}.${asset.suggestedExtension}`
    const payload = await download(asset.url)
    const upload = await client.storage.from('project-assets').upload(storagePath, new Blob([payload.bytes], { type: payload.contentType }), {
      contentType: payload.contentType, cacheControl: '31536000', upsert: true,
    })
    if (upload.error) throw new Error(upload.error.message)
    const upsert = await client.from('project_assets').upsert({
      project_id: job.projectId,
      key,
      name: `${job.targetKey} ${asset.role.replace(/_/g, ' ')}`,
      kind: 'spatial_world',
      mime_type: payload.contentType,
      storage_path: storagePath,
      created_by: job.requestedBy,
      metadata: { generatedBy: 'spatial_world_generation', spatialWorldJobId: job.id, provider: job.provider, model: job.model, role: asset.role, sourceUrl: asset.url },
    }, { onConflict: 'project_id,key' })
    if (upsert.error) throw new Error(upsert.error.message)
    roleAssets.set(asset.role, { key, byteSize: payload.bytes.byteLength })
  }

  const splatEntries = [...roleAssets.entries()].filter(([role]) => role.startsWith('splat_'))
  const splatRank = (role: string) => {
    if (role.includes('100k')) return 0
    if (role.includes('500k')) return 1
    if (role.includes('full')) return 2
    return 1
  }
  const lods = splatEntries.map(([role, asset]) => ({
    assetKey: asset.key,
    role,
    estimatedSplats: Number(role.match(/(\d+)k/)?.[1] ?? 0) * 1000 || null,
    byteSize: asset.byteSize,
    qualityRank: splatRank(role),
  })).sort((left, right) => left.qualityRank - right.qualityRank)
  const lodAssetKeys = lods.map((entry) => entry.assetKey)
  const primarySplatAssetKey = roleAssets.get('splat_full_res')?.key || roleAssets.get('splat_500k')?.key || lodAssetKeys[0] || null
  const colliderAssetKey = roleAssets.get('collider_mesh')?.key || null
  const manifest = spatialWorldManifestSchema.parse({
    version: 1,
    provider: job.provider,
    providerWorldId: providerResult.providerWorldId,
    visualAssetKeys: [...roleAssets.values()].map((asset) => asset.key),
    primarySplatAssetKey,
    lodAssetKeys,
    lods,
    colliderMeshAssetKey: colliderAssetKey,
    panoramaAssetKey: roleAssets.get('panorama')?.key || null,
    thumbnailAssetKey: roleAssets.get('thumbnail')?.key || null,
    hostedPreviewUrl: providerResult.hostedPreviewUrl,
    processing: { status: 'not_requested' },
    colliderDiagnostics: { available: Boolean(colliderAssetKey), triangleCount: null, bounds: null, walkable: colliderAssetKey ? true : null, notes: colliderAssetKey ? [] : ['Provider did not return a collider mesh.'] },
    performanceHints: { preferredLodAssetKey: primarySplatAssetKey, minimumDeviceMemoryGb: lods.length > 1 ? 4 : null, recommendedPixelRatio: 1.5, maxWalkDistance: null },
    generation: { jobId: job.id, operationId: job.providerOperationId, completedAt: new Date().toISOString() },
  })
  const manifestKey = assetKey(job, 'manifest')
  const manifestPath = `generated/spatial-worlds/${job.draftId}/${job.id}/manifest.json`
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  const manifestUpload = await client.storage.from('project-assets').upload(manifestPath, new Blob([manifestBytes], { type: 'application/json' }), {
    contentType: 'application/json', cacheControl: '31536000', upsert: true,
  })
  if (manifestUpload.error) throw new Error(manifestUpload.error.message)
  const manifestAsset = await client.from('project_assets').upsert({
    project_id: job.projectId, key: manifestKey, name: `${job.targetKey} spatial manifest`, kind: 'spatial_world',
    mime_type: 'application/json', storage_path: manifestPath, created_by: job.requestedBy,
    metadata: { generatedBy: 'spatial_world_generation', spatialWorldJobId: job.id, provider: job.provider, model: job.model, role: 'manifest' },
  }, { onConflict: 'project_id,key' })
  if (manifestAsset.error) throw new Error(manifestAsset.error.message)
  return { manifest, manifestKey }
}

async function processJob(client: DatabaseClient, job: SpatialWorldGenerationJob, workerId: string) {
  let current = job
  if (!current.providerOperationId) {
    const submission = await submitSpatialWorldProviderJob(current)
    await heartbeat(client, current, workerId, {
      status: 'running', provider_operation_id: submission.operationId, provider_status: submission.providerStatus,
      metadata: { ...current.metadata, submission: submission.raw },
    })
    current = await loadJob(client, current.id)
  }

  const startedAt = Date.now()
  let providerResult: Awaited<ReturnType<typeof pollSpatialWorldProviderJob>>
  while (true) {
    providerResult = await pollSpatialWorldProviderJob(current)
    await heartbeat(client, current, workerId, { provider_status: providerResult.providerStatus })
    if (providerResult.done) break
    if (Date.now() - startedAt > maxPollMs) throw new Error('Spatial world provider polling exceeded the configured time limit.')
    await sleep(pollIntervalMs)
    current = await loadJob(client, current.id)
    if (current.status === 'cancelled') throw new Error('Spatial world generation was cancelled.')
  }

  const persisted = await persistProviderAssets(client, current, providerResult)
  const now = new Date().toISOString()
  const variant = await client.from('spatial_world_variants').update({
    status: 'ready', manifest_asset_key: persisted.manifestKey, manifest: persisted.manifest,
    metadata: { comparisonId: current.comparisonId, generationState: 'completed', completedAt: now },
  }).eq('source_job_id', current.id)
  if (variant.error) throw new Error(variant.error.message)
  const completed = await client.from('spatial_world_generation_jobs').update({
    status: 'completed', provider_world_id: providerResult.providerWorldId, provider_status: providerResult.providerStatus,
    outputs: { manifest: persisted.manifest, manifestAssetKey: persisted.manifestKey },
    heartbeat_at: now, lease_expires_at: null, completed_at: now, error_message: null,
  }).eq('id', current.id).eq('worker_id', workerId).neq('status', 'cancelled')
  if (completed.error) throw new Error(completed.error.message)
}

export async function processFlySpatialWorldGenerationJobs(input: { client: DatabaseClient; workerId: string }) {
  const claim = await input.client.rpc('claim_spatial_world_generation_job', { worker_id: input.workerId, lease_seconds: 300 })
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) return { processed: false, job: null as SpatialWorldGenerationJob | null }
  const job = await loadJob(input.client, String(claim.data))
  try {
    await processJob(input.client, job, input.workerId)
    return { processed: true, job: { ...job, status: 'completed' as const } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const now = new Date().toISOString()
    await input.client.from('spatial_world_variants').update({ status: 'failed', metadata: { comparisonId: job.comparisonId, generationState: 'failed', error: message } }).eq('source_job_id', job.id)
    await input.client.from('spatial_world_generation_jobs').update({
      status: 'failed', error_message: message, completed_at: now, heartbeat_at: now, lease_expires_at: null,
    }).eq('id', job.id).eq('worker_id', input.workerId).neq('status', 'cancelled')
    return { processed: true, job: { ...job, status: 'failed' as const, errorMessage: message } }
  }
}
