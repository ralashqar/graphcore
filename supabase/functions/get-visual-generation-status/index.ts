import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualGenerationJobRow, visualGenerationJobIsTerminal, visualGenerationStatusResponseSchema, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasWrittenOutputs(outputs: Record<string, unknown>) {
  return Array.isArray(outputs.assets) && outputs.assets.length > 0
}

async function maybeRecoverStaleJob(client: unknown, row: VisualGenerationJobRow): Promise<VisualGenerationJobRow> {
  if (row.status !== 'running') return row
  const heartbeatAt = row.heartbeat_at ?? row.updated_at ?? row.created_at
  const heartbeatMs = Date.parse(heartbeatAt)
  if (!Number.isFinite(heartbeatMs) || Date.now() - heartbeatMs < 8 * 60_000) return row

  const outputs = asRecord(row.outputs)
  const recoveredStatus = hasWrittenOutputs(outputs) ? 'completed_with_errors' : 'failed'
  const updateResponse = await (client as { from: (table: string) => any })
    .from('visual_generation_jobs')
    .update({
      status: recoveredStatus,
      completed_at: new Date().toISOString(),
      error_message: recoveredStatus === 'failed' ? 'Visual generation worker stopped heartbeating before completion.' : row.error_message,
      metadata: {
        ...(row.metadata ?? {}),
        staleRecoveryAt: new Date().toISOString(),
        staleRecoveryStatus: recoveredStatus,
      },
    })
    .eq('id', row.id)
    .eq('status', 'running')
    .select(visualJobSelect)
    .maybeSingle()
  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return (updateResponse.data as VisualGenerationJobRow | null) ?? row
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'get-visual-generation-status')
    const payload = requestSchema.parse(await request.json())

    const response = await client
      .from('visual_generation_jobs')
      .select(visualJobSelect)
      .eq('id', payload.jobId)
      .single()

    if (response.error || !response.data) {
      throw new HttpError(404, 'Visual generation job was not found.')
    }

    const recoveredRow = await maybeRecoverStaleJob(client, response.data as VisualGenerationJobRow)
    const job = mapVisualGenerationJobRow(recoveredRow)
    return json(visualGenerationStatusResponseSchema.parse({
      ok: true,
      job,
      terminal: visualGenerationJobIsTerminal(job),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load visual generation status.')
  }
})
