import { validateSpatialWorldProviderInput, type SpatialWorldGenerationJob } from '../../../src/domain/spatialWorldGeneration.ts'

export type SpatialWorldProviderResult = {
  done: boolean
  providerStatus: string
  providerWorldId: string | null
  hostedPreviewUrl: string | null
  assets: Array<{ role: string; url: string; suggestedExtension: string }>
  raw: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function responseJson(response: Response, label: string) {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text.slice(0, 1000) } }
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${readString(asRecord(body).message) || text.slice(0, 500)}`)
  return asRecord(body)
}

function worldLabsKey() {
  const key = Deno.env.get('WORLDLABS_API_KEY')?.trim()
  if (!key) throw new Error('WORLDLABS_API_KEY is required for World Labs spatial generation.')
  return key
}

export async function submitSpatialWorldProviderJob(job: SpatialWorldGenerationJob) {
  const capabilityError = validateSpatialWorldProviderInput(job.provider, job.input)
  if (capabilityError) throw new Error(capabilityError)
  const response = await fetch('https://api.worldlabs.ai/marble/v1/worlds:generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'WLT-Api-Key': worldLabsKey() },
    body: JSON.stringify({
      display_name: `${job.targetKey} ${job.variantKey}`.slice(0, 120),
      model: job.model,
      world_prompt: { type: 'text', text_prompt: job.input.prompt },
    }),
  })
  const body = await responseJson(response, 'World Labs submission')
  const operationId = readString(body.operation_id) || readString(body.name).split('/').pop() || readString(body.id)
  if (!operationId) throw new Error('World Labs submission did not return an operation ID.')
  return { operationId, providerStatus: readString(body.status) || 'submitted', raw: body }
}

export async function pollSpatialWorldProviderJob(job: SpatialWorldGenerationJob): Promise<SpatialWorldProviderResult> {
  if (job.provider === 'spaitial') throw new Error('SpAItial polling is unavailable until its API contract is configured.')
  if (!job.providerOperationId) throw new Error('World Labs job is missing its provider operation ID.')
  const response = await fetch(`https://api.worldlabs.ai/marble/v1/operations/${encodeURIComponent(job.providerOperationId)}`, {
    headers: { 'WLT-Api-Key': worldLabsKey() },
  })
  const body = await responseJson(response, 'World Labs operation poll')
  const error = asRecord(body.error)
  if (Object.keys(error).length > 0) throw new Error(readString(error.message) || 'World Labs generation failed.')
  const done = body.done === true
  const world = asRecord(body.response)
  const assetsRoot = asRecord(world.assets)
  const splats = asRecord(assetsRoot.splats)
  const splatUrls = asRecord(splats.spz_urls)
  const mesh = asRecord(assetsRoot.mesh)
  const imagery = asRecord(assetsRoot.imagery)
  const assets: SpatialWorldProviderResult['assets'] = []
  for (const [lod, url] of Object.entries(splatUrls)) {
    if (readString(url)) assets.push({ role: `splat_${lod}`, url: readString(url), suggestedExtension: 'spz' })
  }
  const colliderUrl = readString(mesh.collider_mesh_url)
  if (colliderUrl) assets.push({ role: 'collider_mesh', url: colliderUrl, suggestedExtension: 'glb' })
  const panoUrl = readString(imagery.pano_url)
  if (panoUrl) assets.push({ role: 'panorama', url: panoUrl, suggestedExtension: 'jpg' })
  const thumbnailUrl = readString(assetsRoot.thumbnail_url)
  if (thumbnailUrl) assets.push({ role: 'thumbnail', url: thumbnailUrl, suggestedExtension: 'webp' })
  return {
    done,
    providerStatus: done ? 'completed' : readString(body.status) || 'running',
    providerWorldId: readString(world.id) || null,
    hostedPreviewUrl: readString(world.world_marble_url) || null,
    assets,
    raw: body,
  }
}
