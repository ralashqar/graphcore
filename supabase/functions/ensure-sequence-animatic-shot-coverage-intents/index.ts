import {
  createAdminClient,
  requireUserClient,
} from '../_shared/auth.ts'
import {
  errorResponse,
  HttpError,
  json,
  maybeHandleOptions,
} from '../_shared/http.ts'
import { ensureChildWorkflow } from '../_shared/output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
} from '../_shared/output-workflow.ts'
import { planSceneBoardCoverageIntentChildren } from '../_shared/sequence-animatic-scene-board-child-planners.ts'
import {
  sequenceAnimaticShotCoverageIntentEnsureRequestSchema,
  sequenceAnimaticShotCoverageIntentEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

class CoverageIntentHttpError extends HttpError {
  details: Record<string, unknown>

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(status, message)
    this.details = details
  }
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function outputRequestIsActive(request: { status?: string | null } | null | undefined) {
  return ACTIVE_OUTPUT_REQUEST_STATUSES.has(readText(request?.status))
}

function coverageIntentRegistryFromMaster(masterRequest: ReturnType<typeof mapOutputRequestRow>) {
  const metadata = asRecord(masterRequest.metadata)
  const zoneRegistry = asRecord(metadata.sequenceAnimaticZoneCoverageRegistry ?? metadata.sequence_animatic_zone_coverage_registry)
  const broaderRegistry = asRecord(metadata.sequenceAnimaticCoverageRegistry ?? metadata.sequence_animatic_coverage_registry)
  return {
    ...asRecord(broaderRegistry.coverageIntentByShotId ?? broaderRegistry.coverage_intent_by_shot_id),
    ...asRecord(zoneRegistry.coverageIntentByShotId ?? zoneRegistry.coverage_intent_by_shot_id),
  }
}

async function fetchWorkflowRows(input: {
  client: ReturnType<typeof createAdminClient>
  workflowId: string | null
}) {
  if (!input.workflowId) {
    return {
      workflow: null,
      nodes: [],
      edges: [],
    }
  }
  const workflowResponse = await input.client
    .from('output_workflows')
    .select('*')
    .eq('id', input.workflowId)
    .maybeSingle()
  if (workflowResponse.error) throw new Error(workflowResponse.error.message)

  const nodeResponse = await input.client
    .from('output_workflow_nodes')
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.workflowId)
  if (nodeResponse.error) throw new Error(nodeResponse.error.message)

  const edgeResponse = await input.client
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', input.workflowId)
  if (edgeResponse.error) throw new Error(edgeResponse.error.message)

  return {
    workflow: workflowResponse.data ? mapOutputWorkflowRow(asRecord(workflowResponse.data) as never) : null,
    nodes: (nodeResponse.data ?? []).map((row: unknown) => mapOutputWorkflowNodeRow(asRecord(row) as never)),
    edges: (edgeResponse.data ?? []).map((row: unknown) => mapOutputWorkflowEdgeRow(asRecord(row) as never)),
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-shot-coverage-intents')
    const admin = createAdminClient('ensure-sequence-animatic-shot-coverage-intents')
    const payload = sequenceAnimaticShotCoverageIntentEnsureRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(asRecord(masterResponse.data) as never)

    const plan = await planSceneBoardCoverageIntentChildren({
      client: admin as never,
      projectId: payload.projectId,
      draftId: payload.draftId,
      masterRequestId: payload.masterRequestId,
      sceneId: payload.sceneId,
      setId: payload.setId,
      zoneId: payload.zoneId,
      shotIds: payload.shotIds,
      scopedShots: payload.scopedShots,
      requestedBy: user.id,
      forceRefresh: payload.forceRefresh,
    })
    if (plan.childWorkflows.length === 0) {
      throw new CoverageIntentHttpError(409, plan.diagnostics[0] || 'No coverage direction workflow could be prepared.', {
        ...asRecord(plan.metadata),
        sceneId: payload.sceneId,
        setId: payload.setId ?? null,
        zoneId: payload.zoneId ?? null,
        shotIds: payload.shotIds,
      })
    }

    const spec = plan.childWorkflows[0]
    if (!spec) throw new CoverageIntentHttpError(409, 'No coverage direction workflow could be prepared.', asRecord(plan.metadata))
    const ensured = await ensureChildWorkflow({
      client: admin as never,
      projectId: payload.projectId,
      draftId: payload.draftId,
      parentRequestId: payload.masterRequestId,
      role: spec.role,
      identityKey: spec.identityKey,
      identityValue: spec.identityValue,
      workflow: spec.workflow,
      nodes: spec.nodes,
      edges: spec.edges,
      request: spec.request,
    })
    const intentRequest = mapOutputRequestRow(ensured.request as never)
    const cached = await fetchWorkflowRows({ client: admin, workflowId: intentRequest.workflowId })
    const shotIds = readArray(asRecord(spec.metadata).shotIds).map(readText).filter(Boolean)
    const registry = coverageIntentRegistryFromMaster(masterRequest)
    const expectedSourceHash = readText(asRecord(spec.metadata).sourceHash)
    const coverageIntentByShotId = Object.fromEntries(shotIds.map((shotId) => [
      shotId,
      asRecord(registry[shotId]),
    ]).filter(([, intent]) => {
      const sourceHash = readText(asRecord(intent).sourceHash ?? asRecord(intent).source_hash)
      return Object.keys(asRecord(intent)).length > 0 && (!expectedSourceHash || sourceHash === expectedSourceHash)
    }))
    const cacheStatus = payload.forceRefresh && !ensured.reused
      ? 'refreshed'
      : ensured.reused || outputRequestIsActive(intentRequest)
        ? 'reused'
        : 'created'

    return json(sequenceAnimaticShotCoverageIntentEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      intentRequest,
      workflow: cached.workflow,
      nodes: cached.nodes,
      edges: cached.edges,
      coverageIntentByShotId,
      cacheStatus,
      sceneId: payload.sceneId,
      shotIds,
    }))
  } catch (error) {
    if (error instanceof CoverageIntentHttpError) {
      return json({ error: error.message, details: error.details }, { status: error.status })
    }
    return errorResponse(error, 'Failed to ensure sequence animatic coverage directions.')
  }
})
