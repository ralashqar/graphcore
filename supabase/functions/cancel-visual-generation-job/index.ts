import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualGenerationJobRow, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'
import { visualGenerationCancelResponseSchema } from '../../../src/domain/visualGeneration.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'cancel-visual-generation-job')
    const payload = requestSchema.parse(await request.json())

    const existingResponse = await client
      .from('visual_generation_jobs')
      .select(visualJobSelect)
      .eq('id', payload.jobId)
      .single()
    if (existingResponse.error || !existingResponse.data) {
      throw new HttpError(404, 'Visual generation job was not found.')
    }

    const updateResponse = await client
      .from('visual_generation_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', payload.jobId)
      .in('status', ['queued', 'running'])
      .select(visualJobSelect)
      .maybeSingle()
    if (updateResponse.error) throw new Error(updateResponse.error.message)

    const job = updateResponse.data
      ? mapVisualGenerationJobRow(updateResponse.data as VisualGenerationJobRow)
      : mapVisualGenerationJobRow(existingResponse.data as VisualGenerationJobRow)
    return json(visualGenerationCancelResponseSchema.parse({
      ok: true,
      job,
      cancelled: job.status === 'cancelled',
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to cancel visual generation job.')
  }
})
