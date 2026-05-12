import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  isTerminalOutputWorkflowRunStatus,
  outputRequestStatusRequestSchema,
  outputRequestStatusResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  hydrateOutputArtifactSignedUrls,
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputRequestStatusProjectionRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputRequestStatusProjectionSelect,
  outputWorkflowRunStatusSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-request-status')
    const admin = createAdminClient('get-output-request-status')
    const payload = outputRequestStatusRequestSchema.parse(await request.json())

    const requestResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.requestId)
      .single()
    if (requestResponse.error || !requestResponse.data) throw new HttpError(404, 'Output request not found.')
    let outputRequest = mapOutputRequestRow(requestResponse.data)

    await admin.rpc('refresh_output_request_status_projection', { p_request_id: outputRequest.id })
    const projectionResponse = await admin
      .from('output_request_status_projections')
      .select(outputRequestStatusProjectionSelect)
      .eq('request_id', outputRequest.id)
      .maybeSingle()
    if (projectionResponse.error) throw new Error(projectionResponse.error.message)
    const projection = projectionResponse.data ? mapOutputRequestStatusProjectionRow(projectionResponse.data as never) : null

    let workflow = null
    let run = null
    let artifacts = []
    if (outputRequest.workflowId) {
      const artifactKeys = projection?.artifactKeys ?? []
      const [workflowResponse, artifactResponse] = await Promise.all([
        admin.from('output_workflows').select(outputWorkflowSelect).eq('id', outputRequest.workflowId).eq('draft_id', outputRequest.draftId).single(),
        artifactKeys.length > 0
          ? admin.from('output_artifacts').select(outputArtifactSelect).eq('draft_id', outputRequest.draftId).in('key', artifactKeys).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])
      if (!workflowResponse.error && workflowResponse.data) workflow = mapOutputWorkflowRow(workflowResponse.data)
      if (artifactResponse.error) throw new Error(artifactResponse.error.message)
      artifacts = await hydrateOutputArtifactSignedUrls(admin, (artifactResponse.data ?? []).map(mapOutputArtifactRow))
    }
    if (outputRequest.latestRunId) {
      const runResponse = await admin
        .from('output_workflow_runs')
        .select(outputWorkflowRunStatusSelect)
        .eq('id', outputRequest.latestRunId)
        .eq('draft_id', outputRequest.draftId)
        .maybeSingle()
      if (runResponse.error) throw new Error(runResponse.error.message)
      if (runResponse.data) run = mapOutputWorkflowRunRow(runResponse.data as never, [], artifacts)
      if (run && isTerminalOutputWorkflowRunStatus(run.status) && outputRequest.status !== run.status) {
        const updateResponse = await client
          .from('output_requests')
          .update({
            status: run.status,
            error_message: run.errorMessage,
          })
          .eq('id', outputRequest.id)
          .select(outputRequestSelect)
          .single()
        if (!updateResponse.error && updateResponse.data) outputRequest = mapOutputRequestRow(updateResponse.data)
      }
    }
    return json(outputRequestStatusResponseSchema.parse({
      ok: true,
      request: outputRequest,
      workflow,
      nodes: [],
      edges: [],
      run,
      artifacts,
      terminal: projection?.terminal ?? (run ? isTerminalOutputWorkflowRunStatus(run.status) : false),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output request.')
  }
})
