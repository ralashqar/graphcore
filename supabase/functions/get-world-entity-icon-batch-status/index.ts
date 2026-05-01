import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { iconGenerationStatusResponseSchema, mapIconGenerationJobRow } from '../_shared/entity-icon-generation.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'get-world-entity-icon-batch-status')
    const payload = requestSchema.parse(await request.json())

    const response = await client
      .from('world_entity_icon_generation_jobs')
      .select('id, project_id, draft_id, status, provider, model, grid_rows, grid_cols, entity_keys, source_grid_asset_key, created_asset_keys, error_message, metadata, created_at, updated_at')
      .eq('id', payload.jobId)
      .single()

    if (response.error || !response.data) {
      throw new HttpError(404, 'Icon generation job was not found.')
    }

    const job = mapIconGenerationJobRow(response.data)
    return json(iconGenerationStatusResponseSchema.parse({
      ok: true,
      job,
      terminal: ['completed', 'failed', 'cancelled'].includes(job.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load world entity icon generation status.')
  }
})
