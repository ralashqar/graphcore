import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapSpatialWorldJobRow, spatialWorldJobIsTerminal, spatialWorldJobSelect, type SpatialWorldJobRow } from '../_shared/spatial-world-generation.ts'
import { spatialWorldGenerationStatusRequestSchema, spatialWorldGenerationStatusResponseSchema } from '../../../src/domain/spatialWorldGeneration.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-spatial-world-generation-status')
    const payload = spatialWorldGenerationStatusRequestSchema.parse(await request.json())
    const response = await client.from('spatial_world_generation_jobs').select(spatialWorldJobSelect).eq('id', payload.jobId).single()
    if (response.error || !response.data) throw new HttpError(404, 'Spatial world generation job was not found.')
    const job = mapSpatialWorldJobRow(response.data as SpatialWorldJobRow)
    return json(spatialWorldGenerationStatusResponseSchema.parse({ ok: true, job, terminal: spatialWorldJobIsTerminal(job) }))
  } catch (error) {
    return errorResponse(error, 'Failed to load spatial world generation status.')
  }
})
