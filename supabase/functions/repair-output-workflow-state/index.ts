import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { cleanupOutputRequests } from '../_shared/output-cleanup.ts'
import {
  outputWorkflowRepairRequestSchema,
  outputWorkflowRepairResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

type OutputRequestRepairRow = {
  id: string
  workflow_id: string | null
  latest_run_id: string | null
  status: string
  metadata: Record<string, unknown> | null
  updated_at: string
}

type OutputWorkflowRepairRow = {
  id: string
  metadata: Record<string, unknown> | null
}

type OutputWorkflowRunRepairRow = {
  id: string
  workflow_id: string
  status: string
  heartbeat_at: string | null
  updated_at: string
}

const activeRunStatuses = new Set(['queued', 'running'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean)))
}

function isCleanupDeleting(metadata: Record<string, unknown> | null) {
  const cleanup = asRecord(asRecord(metadata).cleanup)
  return cleanup.state === 'deleting' || cleanup.state === 'delete_failed'
}

function isStaleRun(row: OutputWorkflowRunRepairRow, cutoffMs: number) {
  if (!activeRunStatuses.has(row.status)) return false
  const heartbeatAt = row.heartbeat_at ? new Date(row.heartbeat_at).getTime() : 0
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0
  return Math.max(heartbeatAt, updatedAt) < cutoffMs
}

async function selectRows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const response = await query as { data: unknown; error: { message: string } | null }
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? []) as T[]
}

async function cancelRuns(admin: ReturnType<typeof createAdminClient>, runIds: string[]) {
  const ids = unique(runIds)
  if (ids.length === 0) return []
  const now = new Date().toISOString()
  const runResponse = await admin
    .from('output_workflow_runs')
    .update({
      status: 'cancelled',
      completed_at: now,
      heartbeat_at: now,
    })
    .in('id', ids)
    .in('status', ['queued', 'running'])
    .select('id')
  if (runResponse.error) throw new Error(runResponse.error.message)

  const stepResponse = await admin
    .from('output_workflow_run_steps')
    .update({
      status: 'cancelled',
      completed_at: now,
    })
    .in('run_id', ids)
    .in('status', ['queued', 'running'])
  if (stepResponse.error) throw new Error(stepResponse.error.message)

  return ((runResponse.data ?? []) as Array<{ id: string }>).map((row) => row.id)
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'repair-output-workflow-state')
    const admin = createAdminClient('repair-output-workflow-state')
    const payload = outputWorkflowRepairRequestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .maybeSingle()
    if (draftResponse.error) throw new Error(draftResponse.error.message)
    if (!draftResponse.data) throw new HttpError(404, 'Project draft not found.')

    const requestRows = payload.requestId
      ? await selectRows<OutputRequestRepairRow>(
          admin
            .from('output_requests')
            .select('id, workflow_id, latest_run_id, status, metadata, updated_at')
            .eq('project_id', payload.projectId)
            .eq('draft_id', payload.draftId)
            .eq('id', payload.requestId),
        )
      : []
    const requestRow = requestRows[0] ?? null
    const workflowId = payload.workflowId ?? requestRow?.workflow_id ?? null
    if (!requestRow && payload.requestId && !workflowId) {
      throw new HttpError(404, 'Output request not found. Provide workflowId to repair an orphaned workflow.')
    }

    const workflowRows = workflowId
      ? await selectRows<OutputWorkflowRepairRow>(
          admin
            .from('output_workflows')
            .select('id, metadata')
            .eq('project_id', payload.projectId)
            .eq('draft_id', payload.draftId)
            .eq('id', workflowId),
        )
      : []
    const workflowRow = workflowRows[0] ?? null
    if (workflowId && !workflowRow) throw new HttpError(404, 'Output workflow not found.')

    const requestForWorkflowRows = workflowId
      ? await selectRows<OutputRequestRepairRow>(
          admin
            .from('output_requests')
            .select('id, workflow_id, latest_run_id, status, metadata, updated_at')
            .eq('project_id', payload.projectId)
            .eq('draft_id', payload.draftId)
            .eq('workflow_id', workflowId),
        )
      : []
    const hasRequestForWorkflow = requestForWorkflowRows.length > 0
    const effectiveRequestRow = requestRow ?? requestForWorkflowRows[0] ?? null
    const orphanWorkflowIds = workflowRow && !hasRequestForWorkflow ? [workflowRow.id] : []

    const workflowIdsForRepair = unique([
      workflowId && (!effectiveRequestRow || orphanWorkflowIds.includes(workflowId)) ? workflowId : null,
    ])
    const requestIdsForRepair = unique([effectiveRequestRow?.id])
    const cleanupPreview = await cleanupOutputRequests({
      admin,
      projectId: payload.projectId,
      draftId: payload.draftId,
      requestIds: requestIdsForRepair.length > 0 ? requestIdsForRepair : undefined,
      workflowIds: workflowIdsForRepair.length > 0 ? workflowIdsForRepair : undefined,
      allowActiveRuns: true,
      dryRun: true,
    })

    const runRows = cleanupPreview.runIds.length > 0
      ? await selectRows<OutputWorkflowRunRepairRow>(
          admin
            .from('output_workflow_runs')
            .select('id, workflow_id, status, heartbeat_at, updated_at')
            .eq('project_id', payload.projectId)
            .eq('draft_id', payload.draftId)
            .in('id', cleanupPreview.runIds),
        )
      : []
    const cutoffMs = Date.now() - payload.staleRunAgeMinutes * 60_000
    const activeRunIds = unique(runRows.filter((row) => activeRunStatuses.has(row.status)).map((row) => row.id))
    const staleRunIds = unique(runRows.filter((row) => isStaleRun(row, cutoffMs)).map((row) => row.id))
    const stuckCleanupRequestIds = unique([
      ...(effectiveRequestRow && isCleanupDeleting(effectiveRequestRow.metadata) ? [effectiveRequestRow.id] : []),
      ...requestForWorkflowRows.filter((row) => isCleanupDeleting(row.metadata)).map((row) => row.id),
    ])

    const diagnostics: string[] = []
    if (activeRunIds.length > 0) diagnostics.push(`${activeRunIds.length} active run(s) block cleanup until cancelled.`)
    if (staleRunIds.length > 0) diagnostics.push(`${staleRunIds.length} active run(s) look stale by heartbeat/update age.`)
    if (stuckCleanupRequestIds.length > 0) diagnostics.push(`${stuckCleanupRequestIds.length} request(s) are marked deleting/delete_failed.`)
    if (orphanWorkflowIds.length > 0) diagnostics.push(`${orphanWorkflowIds.length} workflow(s) have no owning output request.`)

    let cancelledRunIds: string[] = []
    let deletedCounts = null
    if (payload.mode === 'apply') {
      if (payload.cancelStaleRuns && staleRunIds.length > 0) {
        cancelledRunIds = await cancelRuns(admin, staleRunIds)
      }
      const remainingActiveRunIds = activeRunIds.filter((id) => !cancelledRunIds.includes(id))
      if (remainingActiveRunIds.length > 0) {
        throw new HttpError(409, 'Active output runs still block repair cleanup. Cancel stale runs or wait for active runs to finish.')
      }
      const cleanup = await cleanupOutputRequests({
        admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        requestIds: requestIdsForRepair.length > 0 ? requestIdsForRepair : undefined,
        workflowIds: workflowIdsForRepair.length > 0 ? workflowIdsForRepair : undefined,
        allowActiveRuns: false,
      })
      deletedCounts = cleanup.counts
    }

    return json(outputWorkflowRepairResponseSchema.parse({
      ok: true,
      mode: payload.mode,
      applied: payload.mode === 'apply',
      projectId: payload.projectId,
      draftId: payload.draftId,
      requestId: effectiveRequestRow?.id ?? payload.requestId ?? null,
      workflowId,
      findings: {
        stuckCleanupRequestIds,
        staleRunIds,
        orphanWorkflowIds,
        activeRunIds,
        cleanupCounts: cleanupPreview.counts,
        diagnostics,
      },
      deletedCounts,
      cancelledRunIds,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to repair output workflow state.')
  }
})
