import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapSpatialWorldVariantRow, spatialWorldVariantSelect } from '../_shared/spatial-world-generation.ts'
import { spatialWorldVariantActivationRequestSchema, spatialWorldVariantActivationResponseSchema } from '../../../src/domain/spatialWorldGeneration.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'activate-spatial-world-variant')
    const payload = spatialWorldVariantActivationRequestSchema.parse(await request.json())
    const visible = await client.from('spatial_world_variants').select('id, draft_id').eq('id', payload.variantId).single()
    if (visible.error || !visible.data) throw new HttpError(404, 'Spatial world variant was not found.')
    const editAccess = await client.rpc('can_edit_project_draft', { p_draft_id: visible.data.draft_id })
    if (editAccess.error || editAccess.data !== true) throw new HttpError(403, 'Draft edit access is required to activate a spatial world variant.')
    const admin = createAdminClient('activate-spatial-world-variant')
    const activation = await admin.rpc('activate_spatial_world_variant', { p_variant_id: payload.variantId })
    if (activation.error) throw new Error(activation.error.message)
    const response = await admin.from('spatial_world_variants').select(spatialWorldVariantSelect).eq('id', payload.variantId).single()
    if (response.error || !response.data) throw new Error(response.error?.message || 'Activated spatial world variant could not be loaded.')
    return json(spatialWorldVariantActivationResponseSchema.parse({ ok: true, variant: mapSpatialWorldVariantRow(response.data) }))
  } catch (error) {
    return errorResponse(error, 'Failed to activate spatial world variant.')
  }
})
