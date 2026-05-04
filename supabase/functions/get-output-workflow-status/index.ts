import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  hydrateOutputArtifactSignedUrls,
  isTerminalOutputWorkflowRunStatus,
  loadOutputWorkflowRunBundle,
  outputWorkflowRunStatusResponseSchema,
} from '../_shared/output-workflow.ts'
import { outputWorkflowRunStatusRequestSchema } from '../../../src/domain/outputWorkflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-workflow-status')
    const payload = outputWorkflowRunStatusRequestSchema.parse(await request.json())
    const bundle = await loadOutputWorkflowRunBundle(client, payload.runId)
    const artifacts = await hydrateOutputArtifactSignedUrls(client, bundle.run.artifacts)
    const run = {
      ...bundle.run,
      artifacts,
    }
    return json(outputWorkflowRunStatusResponseSchema.parse({
      ok: true,
      run,
      terminal: isTerminalOutputWorkflowRunStatus(run.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output workflow status.')
  }
})
