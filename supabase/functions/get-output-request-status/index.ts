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

type DatabaseClient = ReturnType<typeof createAdminClient>

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function chunkStringsForPostgrestIn(values: string[], options: { maxCount?: number; maxEncodedLength?: number } = {}) {
  const maxCount = Math.max(1, options.maxCount ?? 24)
  const maxEncodedLength = Math.max(500, options.maxEncodedLength ?? 2800)
  const chunks: string[][] = []
  let current: string[] = []
  let encodedLength = 0
  for (const value of [...new Set(values.map((entry) => entry.trim()).filter(Boolean))]) {
    const valueLength = encodeURIComponent(value).length + 4
    if (current.length > 0 && (current.length >= maxCount || encodedLength + valueLength > maxEncodedLength)) {
      chunks.push(current)
      current = []
      encodedLength = 0
    }
    current.push(value)
    encodedLength += valueLength
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

async function loadOutputArtifactsByKeys(client: DatabaseClient, draftId: string, artifactKeys: string[]) {
  const rows: Record<string, unknown>[] = []
  const seenIds = new Set<string>()
  for (const keyBatch of chunkStringsForPostgrestIn(artifactKeys)) {
    const response = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('draft_id', draftId)
      .in('key', keyBatch)
      .order('created_at', { ascending: false })
    if (response.error) throw new Error(response.error.message)
    for (const row of (response.data ?? []) as Record<string, unknown>[]) {
      const id = readText(row.id)
      if (id && seenIds.has(id)) continue
      if (id) seenIds.add(id)
      rows.push(row)
    }
  }
  return rows
}

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
    if (projection) {
      outputRequest = {
        ...outputRequest,
        latestRunId: projection.latestRunId ?? outputRequest.latestRunId,
        metadata: {
          ...outputRequest.metadata,
          outputStatusProjection: projection,
        },
      }
    }

    let workflow = null
    let run = null
    let artifacts = []
    if (outputRequest.workflowId) {
      const artifactKeys = projection?.artifactKeys ?? []
      const [workflowResponse, artifactResponse] = await Promise.all([
        admin.from('output_workflows').select(outputWorkflowSelect).eq('id', outputRequest.workflowId).eq('draft_id', outputRequest.draftId).single(),
        Promise.resolve({ data: [], error: null }),
      ])
      if (!workflowResponse.error && workflowResponse.data) workflow = mapOutputWorkflowRow(workflowResponse.data)
      if (artifactResponse.error) throw new Error(artifactResponse.error.message)
      const artifactRows = artifactKeys.length > 0
        ? await loadOutputArtifactsByKeys(admin, outputRequest.draftId, artifactKeys)
        : []
      artifacts = await hydrateOutputArtifactSignedUrls(admin, artifactRows.map(mapOutputArtifactRow))
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
