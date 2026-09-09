import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { wakeDirector } from '../_shared/director-runtime/wake.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { cancelOpenAiResponse } from '../_shared/openai.ts'
import {
  loadOutputWorkflowRunBundle,
  outputWorkflowCancelResponseSchema,
} from '../_shared/output-workflow.ts'
import { outputWorkflowRunStatusRequestSchema } from '../../../src/domain/outputWorkflow.ts'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function cancelOpenAiProviderSteps(client: Awaited<ReturnType<typeof requireUserClient>>['client'], runId: string) {
  const stepResponse = await client
    .from('output_workflow_run_steps')
    .select('provider, provider_request_id, metadata')
    .eq('run_id', runId)
    .in('status', ['queued', 'running'])
  if (stepResponse.error) throw new Error(stepResponse.error.message)
  const responseIds = new Set<string>()
  for (const step of stepResponse.data ?? []) {
    const metadata = readRecord(step.metadata)
    const provider = readText(step.provider)
    const providerMode = readText(metadata.providerMode)
    const requestId = readText(step.provider_request_id) || readText(metadata.providerRequestId)
    if (provider === 'openai' && providerMode === 'background' && requestId.startsWith('resp_')) {
      responseIds.add(requestId)
    }
  }
  await Promise.all([...responseIds].map((responseId) => cancelOpenAiResponse(responseId, 15_000).catch(() => null)))
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'cancel-output-workflow-run')
    const payload = outputWorkflowRunStatusRequestSchema.parse(await request.json())
    const owned = await client.from('output_workflow_runs').select('metadata').eq('id',payload.runId).maybeSingle()
    if (owned.error) throw owned.error
    if (owned.data?.metadata?.executionOwner === 'director_v2') {
      const cancelled = await createAdminClient('cancel-output-workflow-run').rpc('director_cancel_job',{p_actor:user.id,p_run:payload.runId})
      if (cancelled.error) throw new HttpError(403,cancelled.error.message)
      void wakeDirector()
      const workflowClient = { from: client.from.bind(client), storage: client.storage,
        rpc: async (fn: string,args?: Record<string,unknown>) => await client.rpc(fn,args) }
      const run = (await loadOutputWorkflowRunBundle(workflowClient,payload.runId)).run
      return json(outputWorkflowCancelResponseSchema.parse({ok:true,run,cancelled:cancelled.data}))
    }
    await cancelOpenAiProviderSteps(client, payload.runId)
    const cancelResponse = await client.rpc('cancel_output_workflow_run', { run_id: payload.runId })
    if (cancelResponse.error) throw new Error(cancelResponse.error.message)
    if (cancelResponse.data === true) {
      const requestResponse = await client
        .from('output_requests')
        .update({ status: 'cancelled', error_message: null })
        .eq('latest_run_id', payload.runId)
        .select('id')
      if (requestResponse.error) throw new Error(requestResponse.error.message)
      for (const row of requestResponse.data ?? []) {
        const requestId = typeof row.id === 'string' ? row.id : ''
        if (requestId) await client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
      }
    }
    let run = null
    try {
      run = (await loadOutputWorkflowRunBundle(client, payload.runId)).run
    } catch {
      run = null
    }
    return json(outputWorkflowCancelResponseSchema.parse({
      ok: true,
      run,
      cancelled: cancelResponse.data === true,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to cancel output workflow run.')
  }
})
