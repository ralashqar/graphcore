import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  outputRequestDeleteResponseSchema,
  outputRequestStatusRequestSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'delete-output-request')
    const payload = outputRequestStatusRequestSchema.parse(await request.json())

    const requestResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.requestId)
      .single()
    if (requestResponse.error || !requestResponse.data) throw new HttpError(404, 'Output request not found.')
    const outputRequest = mapOutputRequestRow(requestResponse.data)

    if (outputRequest.latestRunId) {
      const runResponse = await client
        .from('output_workflow_runs')
        .select('id, status')
        .eq('id', outputRequest.latestRunId)
        .maybeSingle()
      if (runResponse.error) throw new Error(runResponse.error.message)
      const status = runResponse.data?.status
      if (status === 'queued' || status === 'running') {
        throw new HttpError(409, 'Cancel the active output run before deleting this request.')
      }
    }

    const deleteResponse = await client
      .from('output_requests')
      .delete()
      .eq('id', outputRequest.id)
    if (deleteResponse.error) throw new Error(deleteResponse.error.message)

    return json(outputRequestDeleteResponseSchema.parse({
      ok: true,
      requestId: outputRequest.id,
      projectId: outputRequest.projectId,
      draftId: outputRequest.draftId,
      workflowId: outputRequest.workflowId,
      latestRunId: outputRequest.latestRunId,
      deleted: true,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to delete output request.')
  }
})
