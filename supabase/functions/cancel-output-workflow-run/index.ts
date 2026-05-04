import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  loadOutputWorkflowRunBundle,
  outputWorkflowCancelResponseSchema,
} from '../_shared/output-workflow.ts'
import { outputWorkflowRunStatusRequestSchema } from '../../../src/domain/outputWorkflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'cancel-output-workflow-run')
    const payload = outputWorkflowRunStatusRequestSchema.parse(await request.json())
    const cancelResponse = await client.rpc('cancel_output_workflow_run', { run_id: payload.runId })
    if (cancelResponse.error) throw new Error(cancelResponse.error.message)
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
