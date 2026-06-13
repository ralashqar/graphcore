import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapSpatialWorldJobRow, spatialWorldJobSelect, type SpatialWorldJobRow } from '../_shared/spatial-world-generation.ts'
import { spatialWorldGenerationCancelResponseSchema, spatialWorldGenerationStatusRequestSchema } from '../../../src/domain/spatialWorldGeneration.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'cancel-spatial-world-generation')
    const payload = spatialWorldGenerationStatusRequestSchema.parse(await request.json())
    const existing = await client.from('spatial_world_generation_jobs').select(spatialWorldJobSelect).eq('id', payload.jobId).single()
    if (existing.error || !existing.data) throw new HttpError(404, 'Spatial world generation job was not found.')
    const updated = await client.from('spatial_world_generation_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
      .eq('id', payload.jobId).in('status', ['queued', 'submitting', 'running']).select(spatialWorldJobSelect).maybeSingle()
    if (updated.error) throw new Error(updated.error.message)
    const job = mapSpatialWorldJobRow((updated.data ?? existing.data) as SpatialWorldJobRow)
    return json(spatialWorldGenerationCancelResponseSchema.parse({ ok: true, job, cancelled: job.status === 'cancelled' }))
  } catch (error) {
    return errorResponse(error, 'Failed to cancel spatial world generation.')
  }
})
