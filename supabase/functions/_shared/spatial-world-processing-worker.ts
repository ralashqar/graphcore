import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { spatialWorldManifestSchema } from '../../../src/domain/spatialWorldGeneration.ts'

type DatabaseClient = SupabaseClient<any, any, any>

type ProcessingRow = {
  id: string
  project_id: string
  draft_id: string
  variant_id: string
  status: string
  operation: 'validate' | 'optimize' | 'generate_lods'
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  requested_by: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function loadProcessingJob(client: DatabaseClient, id: string) {
  const response = await client.from('spatial_world_processing_jobs').select('*').eq('id', id).single()
  if (response.error || !response.data) throw new Error(response.error?.message || 'Spatial processing job was not found.')
  return response.data as ProcessingRow
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const processingTimeoutMs = readNumber(Deno.env.get('SPATIAL_WORLD_PROCESSING_TIMEOUT_MS'), 15 * 60_000)

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function runSplatTransform(command: string, inputPath: string, outputPath: string, percent: number) {
  const child = new Deno.Command(command, {
    args: ['--no-tty', '--overwrite', inputPath, '--filter-nan', '--morton-order', '--decimate', `${percent}%`, outputPath],
    stdout: 'piped',
    stderr: 'piped',
  })
  const process = child.spawn()
  const timeout = setTimeout(() => {
    try { process.kill('SIGKILL') } catch { /* Process already exited. */ }
  }, processingTimeoutMs)
  const result = await process.output().finally(() => clearTimeout(timeout))
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim()
    throw new Error(`SplatTransform exited with code ${result.code}${stderr ? `: ${stderr.slice(0, 1200)}` : ''}. The processing timeout is ${processingTimeoutMs}ms.`)
  }
}

async function persistProcessedAsset(input: {
  client: DatabaseClient
  job: ProcessingRow
  bytes: Uint8Array
  label: string
  percent: number
}) {
  const key = `spatial-world.processed.${safeKeyPart(input.job.variant_id)}.${safeKeyPart(input.label)}`.slice(0, 240)
  const storagePath = `generated/spatial-worlds/${input.job.draft_id}/processed/${input.job.id}/${input.label}.spz`
  const upload = await input.client.storage.from('project-assets').upload(
    storagePath,
    new Blob([input.bytes], { type: 'application/octet-stream' }),
    { contentType: 'application/octet-stream', cacheControl: '31536000', upsert: true },
  )
  if (upload.error) throw new Error(upload.error.message)
  const asset = await input.client.from('project_assets').upsert({
    project_id: input.job.project_id,
    key,
    name: `Spatial world ${input.label.replace(/-/g, ' ')}`,
    kind: 'spatial_world',
    mime_type: 'application/octet-stream',
    storage_path: storagePath,
    created_by: input.job.requested_by,
    metadata: {
      generatedBy: 'playcanvas_splat_transform',
      spatialWorldProcessingJobId: input.job.id,
      variantId: input.job.variant_id,
      decimationPercent: input.percent,
      outputHash: await sha256(input.bytes),
    },
  }, { onConflict: 'project_id,key' })
  if (asset.error) throw new Error(asset.error.message)
  return { assetKey: key, byteSize: input.bytes.byteLength, qualityRank: Math.max(0, 100 - input.percent), percent: input.percent }
}

async function generateDerivedAssets(client: DatabaseClient, job: ProcessingRow, manifest: ReturnType<typeof spatialWorldManifestSchema.parse>, command: string) {
  const sourceAsset = await client.from('project_assets')
    .select('storage_path')
    .eq('project_id', job.project_id)
    .eq('key', manifest.primarySplatAssetKey)
    .single()
  if (sourceAsset.error || !sourceAsset.data?.storage_path) throw new Error(sourceAsset.error?.message || 'Primary SPZ asset storage path was not found.')
  const sourceDownload = await client.storage.from('project-assets').download(String(sourceAsset.data.storage_path))
  if (sourceDownload.error || !sourceDownload.data) throw new Error(sourceDownload.error?.message || 'Primary SPZ asset could not be downloaded.')
  const sourceBytes = new Uint8Array(await sourceDownload.data.arrayBuffer())
  const sourceHash = await sha256(sourceBytes)
  const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-spatial-' })
  const inputPath = `${tempDir}/source.spz`
  await Deno.writeFile(inputPath, sourceBytes)
  try {
    const requested = asRecord(job.input)
    const percentages = job.operation === 'optimize'
      ? [Math.min(100, readNumber(requested.decimationPercent, 65))]
      : (Array.isArray(requested.lodPercentages) ? requested.lodPercentages : [50, 25, 12])
        .map((value) => Math.min(100, readNumber(value, 25)))
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => right - left)
    const derived = []
    for (const percent of percentages) {
      const label = job.operation === 'optimize' ? 'optimized' : `lod-${percent}pct`
      const outputPath = `${tempDir}/${label}.spz`
      await runSplatTransform(command, inputPath, outputPath, percent)
      const bytes = await Deno.readFile(outputPath)
      derived.push(await persistProcessedAsset({ client, job, bytes, label, percent }))
    }
    return { derived, sourceHash }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => undefined)
  }
}

async function processJob(client: DatabaseClient, job: ProcessingRow, workerId: string) {
  const variantResponse = await client.from('spatial_world_variants').select('manifest,metadata').eq('id', job.variant_id).single()
  if (variantResponse.error || !variantResponse.data) throw new Error(variantResponse.error?.message || 'Spatial world variant was not found.')
  const manifest = spatialWorldManifestSchema.parse(variantResponse.data.manifest)
  if (!manifest.primarySplatAssetKey) throw new Error('Spatial world manifest has no primary splat asset.')
  const processor = Deno.env.get('SPATIAL_WORLD_SPLAT_TRANSFORM_COMMAND')?.trim() || null
  if (job.operation !== 'validate' && !processor) {
    throw new Error('SplatTransform processing is not configured. Set SPATIAL_WORLD_SPLAT_TRANSFORM_COMMAND in the worker deployment.')
  }

  const processed = job.operation === 'validate'
    ? { derived: [] as Array<{ assetKey: string; byteSize: number; qualityRank: number; percent: number }>, sourceHash: null as string | null }
    : await generateDerivedAssets(client, job, manifest, processor as string)
  const diagnostics = {
    validatedManifestVersion: manifest.version,
    lodCount: manifest.lods.length || manifest.lodAssetKeys.length,
    colliderAvailable: Boolean(manifest.colliderMeshAssetKey),
    processorConfigured: Boolean(processor),
    derivedAssetCount: processed.derived.length,
  }
  const now = new Date().toISOString()
  const derivedLods = processed.derived.map((asset) => ({
    assetKey: asset.assetKey,
    role: job.operation === 'optimize' ? 'processed_optimized' : `processed_lod_${asset.percent}pct`,
    estimatedSplats: null,
    byteSize: asset.byteSize,
    qualityRank: asset.qualityRank,
  }))
  const derivedAssetKeys = processed.derived.map((asset) => asset.assetKey)
  const nextManifest = spatialWorldManifestSchema.parse({
    ...manifest,
    visualAssetKeys: [...new Set([...manifest.visualAssetKeys, ...derivedAssetKeys])],
    primarySplatAssetKey: job.operation === 'optimize' && derivedAssetKeys[0] ? derivedAssetKeys[0] : manifest.primarySplatAssetKey,
    lodAssetKeys: [...new Set([...manifest.lodAssetKeys, ...derivedAssetKeys])],
    lods: [...manifest.lods.filter((lod) => !derivedAssetKeys.includes(lod.assetKey)), ...derivedLods],
    processing: {
      status: 'completed', processor: job.operation === 'validate' ? 'graphcore-manifest-validator' : 'playcanvas-splat-transform',
      sourceHash: processed.sourceHash, processedAt: now, derivedAssetKeys, diagnostics,
    },
    performanceHints: {
      ...manifest.performanceHints,
      preferredLodAssetKey: job.operation === 'optimize' && derivedAssetKeys[0]
        ? derivedAssetKeys[0]
        : manifest.performanceHints.preferredLodAssetKey,
    },
  })
  const variantUpdate = await client.from('spatial_world_variants').update({
    manifest: nextManifest,
    metadata: { ...asRecord(variantResponse.data.metadata), lastProcessingJobId: job.id, lastProcessedAt: now },
  }).eq('id', job.variant_id)
  if (variantUpdate.error) throw new Error(variantUpdate.error.message)
  const complete = await client.from('spatial_world_processing_jobs').update({
    status: 'completed', outputs: { manifest: nextManifest, diagnostics }, completed_at: now, heartbeat_at: now, lease_expires_at: null,
  }).eq('id', job.id).eq('worker_id', workerId)
  if (complete.error) throw new Error(complete.error.message)
}

export async function processFlySpatialWorldProcessingJobs(input: { client: DatabaseClient; workerId: string }) {
  const claim = await input.client.rpc('claim_spatial_world_processing_job', { worker_id: input.workerId, lease_seconds: 300 })
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) return { processed: false, jobId: null as string | null, status: null as string | null }
  const job = await loadProcessingJob(input.client, String(claim.data))
  try {
    await processJob(input.client, job, input.workerId)
    return { processed: true, jobId: job.id, status: 'completed' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await input.client.from('spatial_world_processing_jobs').update({
      status: 'failed', error_message: message, completed_at: new Date().toISOString(), lease_expires_at: null,
    }).eq('id', job.id).eq('worker_id', input.workerId)
    return { processed: true, jobId: job.id, status: 'failed' }
  }
}
