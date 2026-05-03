import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { iconGenerationStatusResponseSchema, mapIconGenerationJobRow } from '../_shared/entity-icon-generation.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualJobRowToIconGenerationJob, visualIconJobSelect } from '../_shared/visual-icon-compat.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function recoverStaleVisualJobIfNeeded(client: unknown, row: Record<string, unknown>) {
  if (row.status !== 'running') return row
  const heartbeatAt = typeof row.heartbeat_at === 'string' ? row.heartbeat_at : typeof row.updated_at === 'string' ? row.updated_at : typeof row.created_at === 'string' ? row.created_at : ''
  const heartbeatMs = Date.parse(heartbeatAt)
  if (!Number.isFinite(heartbeatMs) || Date.now() - heartbeatMs < 8 * 60_000) return row
  const outputs = asRecord(row.outputs)
  const status = Array.isArray(outputs.assets) && outputs.assets.length > 0 ? 'completed_with_errors' : 'failed'
  const updateResponse = await (client as { from: (table: string) => any })
    .from('visual_generation_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_message: status === 'failed' ? 'Visual generation worker stopped heartbeating before completion.' : row.error_message,
      metadata: {
        ...asRecord(row.metadata),
        staleRecoveryAt: new Date().toISOString(),
        staleRecoveryStatus: status,
      },
    })
    .eq('id', row.id)
    .eq('status', 'running')
    .select(visualIconJobSelect)
    .maybeSingle()
  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return updateResponse.data ?? row
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'get-world-entity-icon-batch-status')
    const payload = requestSchema.parse(await request.json())

    const visualResponse = await client
      .from('visual_generation_jobs')
      .select(visualIconJobSelect)
      .eq('id', payload.jobId)
      .maybeSingle()

    if (visualResponse.error) throw new Error(visualResponse.error.message)
    if (visualResponse.data) {
      const visualRow = await recoverStaleVisualJobIfNeeded(client, visualResponse.data as Record<string, unknown>)
      const visualJob = mapVisualJobRowToIconGenerationJob(visualRow as Record<string, unknown>)
      return json(iconGenerationStatusResponseSchema.parse({
        ok: true,
        job: visualJob,
        terminal: ['completed', 'failed', 'cancelled'].includes(visualJob.status),
      }))
    }

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
