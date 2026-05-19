import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { cancelOpenAiResponse } from '../_shared/openai.ts'
import {
  outputRequestStatusRequestSchema,
  outputRequestStatusResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  loadOutputWorkflowRunBundle,
  mapOutputRequestRow,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'

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
    const { client } = await requireUserClient(request, 'cancel-output-request')
    const payload = outputRequestStatusRequestSchema.parse(await request.json())

    const requestResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.requestId)
      .single()
    if (requestResponse.error || !requestResponse.data) throw new HttpError(404, 'Output request not found.')
    let outputRequest = mapOutputRequestRow(requestResponse.data)

    if (outputRequest.latestRunId) {
      await cancelOpenAiProviderSteps(client, outputRequest.latestRunId)
      await client.rpc('cancel_output_workflow_run', {
        run_id: outputRequest.latestRunId,
      })
    }
    const updateResponse = await client
      .from('output_requests')
      .update({ status: 'cancelled', error_message: null })
      .eq('id', outputRequest.id)
      .select(outputRequestSelect)
      .single()
    if (updateResponse.error || !updateResponse.data) throw new Error(updateResponse.error?.message ?? 'Failed to cancel output request.')
    outputRequest = mapOutputRequestRow(updateResponse.data)

    const bundle = outputRequest.latestRunId ? await loadOutputWorkflowRunBundle(client, outputRequest.latestRunId).catch(() => null) : null
    return json(outputRequestStatusResponseSchema.parse({
      ok: true,
      request: outputRequest,
      workflow: bundle?.workflow ?? null,
      nodes: bundle?.nodes ?? [],
      edges: bundle?.edges ?? [],
      run: bundle?.run ?? null,
      artifacts: bundle?.run.artifacts ?? [],
      terminal: true,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to cancel output request.')
  }
})
