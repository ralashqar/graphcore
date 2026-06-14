import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  estimateSpatialWorldProviderCost,
  fingerprintSpatialWorldRequest,
  mapSpatialWorldJobRow,
  spatialWorldJobSelect,
  verifySpatialWorldQuoteToken,
  type SpatialWorldJobRow,
} from '../_shared/spatial-world-generation.ts'
import { notifyWorkerWakeBestEffort } from '../_shared/worker-wake.ts'
import {
  spatialWorldGenerationConfirmedStartRequestSchema,
  spatialWorldGenerationStartRequestSchema,
  spatialWorldGenerationStartResponseSchema,
  validateSpatialWorldProviderInput,
} from '../../../src/domain/spatialWorldGeneration.ts'

function quoteSecret() {
  const secret = Deno.env.get('SPATIAL_WORLD_QUOTE_SECRET')?.trim()
    || Deno.env.get('GRAPHCORE_WORKER_SECRET')?.trim()
  if (!secret) throw new HttpError(500, 'Spatial world quote signing is not configured.')
  return secret
}

function sourceType(input: { sourceImages: Array<{ role: string }>; sourceVideoAssetKey: string | null }) {
  if (input.sourceVideoAssetKey) return 'video' as const
  if (input.sourceImages.length > 1) return 'multi-image' as const
  if (input.sourceImages.some((image) => image.role === 'panorama')) return 'panorama' as const
  if (input.sourceImages.length === 1) return 'image' as const
  return 'text' as const
}

function providerModel(provider: 'worldlabs' | 'spaitial', quality: 'draft' | 'standard' | 'high', requested?: string) {
  if (requested?.trim()) return requested.trim()
  if (provider === 'spaitial') return Deno.env.get('SPAITIAL_DEFAULT_MODEL')?.trim() || 'echo'
  if (quality === 'draft') return 'marble-1.0-draft'
  if (quality === 'high') return 'marble-1.1-plus'
  return 'marble-1.1'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-spatial-world-generation')
    const confirmed = spatialWorldGenerationConfirmedStartRequestSchema.parse(await request.json())
    const payload = spatialWorldGenerationStartRequestSchema.parse(confirmed)
    for (const provider of payload.providers) {
      const capabilityError = validateSpatialWorldProviderInput(provider, payload.input)
      if (capabilityError) throw new HttpError(provider === 'spaitial' ? 503 : 400, capabilityError)
    }
    const draft = await client.from('project_drafts').select('id').eq('id', payload.draftId).eq('project_id', payload.projectId).single()
    if (draft.error || !draft.data) throw new HttpError(404, 'Editable project draft was not found.')
    const editAccess = await client.rpc('can_edit_project_draft', { p_draft_id: payload.draftId })
    if (editAccess.error || editAccess.data !== true) throw new HttpError(403, 'Draft edit access is required to generate a spatial world.')
    if (payload.targetKind === 'environment' || payload.targetKind === 'world_model') {
      const definition = await client.from('project_definitions').select('key')
        .eq('draft_id', payload.draftId).eq('project_id', payload.projectId)
        .eq('key', payload.targetKey).eq('kind', payload.targetKind).maybeSingle()
      if (definition.error || !definition.data) throw new HttpError(404, `Target ${payload.targetKind} definition was not found.`)
    }

    const requestFingerprint = await fingerprintSpatialWorldRequest(payload)
    const verifiedQuote = await verifySpatialWorldQuoteToken({
      token: confirmed.quoteToken, secret: quoteSecret(), userId: user.id,
      projectId: payload.projectId, draftId: payload.draftId,
      providers: payload.providers, requestFingerprint,
    })
    if (!verifiedQuote.ok) throw new HttpError(409, `Spatial world quote is no longer valid: ${verifiedQuote.reason}.`)

    const comparison = payload.providers.length > 1
    const comparisonId = comparison ? crypto.randomUUID() : null
    const resolvedSourceType = sourceType(payload.input)
    const jobs = payload.providers.map((provider) => {
      const model = providerModel(provider, payload.input.quality, payload.modelByProvider[provider])
      const estimate = estimateSpatialWorldProviderCost({ provider, quality: payload.input.quality, sourceType: resolvedSourceType })
      const resolvedVariantKey = comparison ? `${payload.variantKey}-${provider}` : payload.variantKey
      return {
        targetKind: payload.targetKind,
        targetKey: payload.targetKey,
        variantKey: resolvedVariantKey,
        variantName: comparison ? `${payload.variantKey} (${provider})` : payload.variantKey,
        comparisonId,
        provider,
        model,
        input: payload.input,
        idempotencyKey: `${payload.input.idempotencyKey}:${provider}`,
        estimatedUsd: estimate.estimatedUsd,
        metadata: { ...payload.metadata, quoteExpiresAt: verifiedQuote.expiresAt, quotedCredits: estimate.estimatedCredits, requestFingerprint },
      }
    })

    const admin = createAdminClient('start-spatial-world-generation')
    const enqueue = await admin.rpc('enqueue_spatial_world_generation_jobs', {
      p_user_id: user.id,
      p_project_id: payload.projectId,
      p_draft_id: payload.draftId,
      p_credit_amount: verifiedQuote.estimatedCredits,
      p_credit_reference_id: `spatial-world:${payload.projectId}:${payload.input.idempotencyKey}`,
      p_jobs: jobs,
    })
    if (enqueue.error) throw new Error(enqueue.error.message)
    const result = Array.isArray(enqueue.data) ? enqueue.data[0] : enqueue.data
    if (!result?.success) throw new HttpError(result?.error_message === 'Insufficient credits.' ? 402 : 409, result?.error_message || 'Failed to enqueue spatial world generation.')

    const response = await admin.from('spatial_world_generation_jobs').select(spatialWorldJobSelect)
      .eq('project_id', payload.projectId).in('idempotency_key', jobs.map((job) => job.idempotencyKey))
      .order('created_at', { ascending: true })
    if (response.error || !response.data?.length) throw new Error(response.error?.message || 'Queued spatial world jobs could not be loaded.')
    const mappedJobs = (response.data as SpatialWorldJobRow[]).map(mapSpatialWorldJobRow)
    await notifyWorkerWakeBestEffort({ family: 'spatial_world', source: 'start-spatial-world-generation', jobId: mappedJobs[0]?.id ?? null, projectId: payload.projectId, draftId: payload.draftId })
    return json(spatialWorldGenerationStartResponseSchema.parse({ ok: true, jobs: mappedJobs }))
  } catch (error) {
    return errorResponse(error, 'Failed to start spatial world generation.')
  }
})
