import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  isTerminalOutputWorkflowRunStatus,
  outputRequestStatusRequestSchema,
  outputRequestStatusResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  compactOutputWorkflowNodesForStatus,
  compactOutputWorkflowRunForStatus,
  hydrateOutputArtifactSignedUrls,
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowSelect,
  loadOutputWorkflowRunBundle,
} from '../_shared/output-workflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-request-status')
    const payload = outputRequestStatusRequestSchema.parse(await request.json())

    const requestResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.requestId)
      .single()
    if (requestResponse.error || !requestResponse.data) throw new HttpError(404, 'Output request not found.')
    let outputRequest = mapOutputRequestRow(requestResponse.data)

    let workflow = null
    let nodes = []
    let edges = []
    let run = null
    let artifacts = []
    if (outputRequest.workflowId) {
      const [workflowResponse, nodeResponse, edgeResponse, artifactResponse] = await Promise.all([
        client.from('output_workflows').select(outputWorkflowSelect).eq('id', outputRequest.workflowId).single(),
        client.from('output_workflow_nodes').select(outputWorkflowNodeSelect).eq('workflow_id', outputRequest.workflowId).order('created_at', { ascending: true }),
        client.from('output_workflow_edges').select(outputWorkflowEdgeSelect).eq('workflow_id', outputRequest.workflowId).order('created_at', { ascending: true }),
        client.from('output_artifacts').select(outputArtifactSelect).eq('workflow_id', outputRequest.workflowId).order('created_at', { ascending: false }),
      ])
      if (!workflowResponse.error && workflowResponse.data) workflow = mapOutputWorkflowRow(workflowResponse.data)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      if (artifactResponse.error) throw new Error(artifactResponse.error.message)
      nodes = compactOutputWorkflowNodesForStatus((nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow))
      edges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)
      artifacts = await hydrateOutputArtifactSignedUrls(client, (artifactResponse.data ?? []).map(mapOutputArtifactRow))
    }
    if (outputRequest.latestRunId) {
      const bundle = await loadOutputWorkflowRunBundle(client, outputRequest.latestRunId)
      run = compactOutputWorkflowRunForStatus(bundle.run)
      artifacts = bundle.run.artifacts.length > 0 ? bundle.run.artifacts : artifacts
      if (isTerminalOutputWorkflowRunStatus(bundle.run.status) && outputRequest.status !== bundle.run.status) {
        const updateResponse = await client
          .from('output_requests')
          .update({
            status: bundle.run.status,
            error_message: bundle.run.errorMessage,
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
      nodes,
      edges,
      run,
      artifacts,
      terminal: run ? isTerminalOutputWorkflowRunStatus(run.status) : false,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output request.')
  }
})
