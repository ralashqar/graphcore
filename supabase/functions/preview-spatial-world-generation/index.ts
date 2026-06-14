import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  createSpatialWorldQuoteToken,
  estimateSpatialWorldProviderCost,
  fingerprintSpatialWorldRequest,
} from '../_shared/spatial-world-generation.ts'
import {
  spatialWorldGenerationPreviewResponseSchema,
  spatialWorldGenerationStartRequestSchema,
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
    const { client, user } = await requireUserClient(request, 'preview-spatial-world-generation')
    const payload = spatialWorldGenerationStartRequestSchema.parse(await request.json())
    for (const provider of payload.providers) {
      const capabilityError = validateSpatialWorldProviderInput(provider, payload.input)
      if (capabilityError) throw new HttpError(provider === 'spaitial' ? 503 : 400, capabilityError)
    }
    const draft = await client.from('project_drafts').select('id').eq('id', payload.draftId).eq('project_id', payload.projectId).single()
    if (draft.error || !draft.data) throw new HttpError(404, 'Editable project draft was not found.')

    const inputSourceType = sourceType(payload.input)
    const quotes = payload.providers.map((provider) => ({
      provider,
      model: providerModel(provider, payload.input.quality, payload.modelByProvider[provider]),
      quality: payload.input.quality,
      ...estimateSpatialWorldProviderCost({ provider, quality: payload.input.quality, sourceType: inputSourceType }),
    }))
    const totalEstimatedUsd = quotes.reduce((sum, quote) => sum + quote.estimatedUsd, 0)
    const totalEstimatedCredits = quotes.reduce((sum, quote) => sum + quote.estimatedCredits, 0)
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const requestFingerprint = await fingerprintSpatialWorldRequest(payload)
    const quoteToken = await createSpatialWorldQuoteToken({
      secret: quoteSecret(), userId: user.id, projectId: payload.projectId, draftId: payload.draftId,
      providers: payload.providers, requestFingerprint, estimatedCredits: totalEstimatedCredits, expiresAt,
    })
    return json(spatialWorldGenerationPreviewResponseSchema.parse({
      ok: true, quotes, totalEstimatedUsd, totalEstimatedCredits, quoteToken, expiresAt,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to preview spatial world generation.')
  }
})
