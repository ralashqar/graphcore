import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  outputRequestDeleteResponseSchema,
  outputRequestStatusRequestSchema,
} from '../../../src/domain/outputWorkflow.ts'
import { cleanupOutputRequests } from '../_shared/output-cleanup.ts'
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

    const admin = createAdminClient('delete-output-request')
    const cleanupStartedAt = new Date().toISOString()
    const cleanupMetadata = typeof outputRequest.metadata.cleanup === 'object' && outputRequest.metadata.cleanup !== null
      ? outputRequest.metadata.cleanup as Record<string, unknown>
      : {}
    const cleanupAttemptCount = Number(cleanupMetadata.attemptCount ?? 0) || 0
    await admin
      .from('output_requests')
      .update({
        metadata: {
          ...outputRequest.metadata,
          cleanup: {
            ...cleanupMetadata,
            state: 'deleting',
            startedAt: typeof cleanupMetadata.startedAt === 'string' ? cleanupMetadata.startedAt : cleanupStartedAt,
            lastAttemptAt: cleanupStartedAt,
            attemptCount: cleanupAttemptCount + 1,
            lastError: null,
          },
        },
      })
      .eq('id', outputRequest.id)
      .eq('project_id', outputRequest.projectId)
      .eq('draft_id', outputRequest.draftId)

    let cleanup
    try {
      cleanup = await cleanupOutputRequests({
        admin,
        projectId: outputRequest.projectId,
        draftId: outputRequest.draftId,
        requestIds: [outputRequest.id],
        allowActiveRuns: false,
      })
    } catch (cleanupError) {
      await admin
        .from('output_requests')
        .update({
          metadata: {
            ...outputRequest.metadata,
            cleanup: {
              ...cleanupMetadata,
              state: 'delete_failed',
              startedAt: typeof cleanupMetadata.startedAt === 'string' ? cleanupMetadata.startedAt : cleanupStartedAt,
              lastAttemptAt: new Date().toISOString(),
              attemptCount: cleanupAttemptCount + 1,
              lastError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            },
          },
        })
        .eq('id', outputRequest.id)
        .eq('project_id', outputRequest.projectId)
        .eq('draft_id', outputRequest.draftId)
      throw cleanupError
    }

    return json(outputRequestDeleteResponseSchema.parse({
      ok: true,
      requestId: outputRequest.id,
      projectId: outputRequest.projectId,
      draftId: outputRequest.draftId,
      workflowId: outputRequest.workflowId,
      latestRunId: outputRequest.latestRunId,
      deleted: true,
      deletedCounts: cleanup.counts,
    }))
  } catch (error) {
    if (error instanceof Error && error.message === 'Cancel the active output run before deleting this request.') {
      return errorResponse(new HttpError(409, error.message), 'Failed to delete output request.')
    }
    return errorResponse(error, 'Failed to delete output request.')
  }
})
