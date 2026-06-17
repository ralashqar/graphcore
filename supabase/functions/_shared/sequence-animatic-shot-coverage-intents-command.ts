import {
  HttpError,
} from './http.ts'
import {
  ensureChildWorkflow,
  loadChildWorkflowGraphBundle,
} from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from './output-workflow.ts'
import { planSceneBoardCoverageIntentChildren } from './sequence-animatic-scene-board-child-planners.ts'
import {
  sequenceAnimaticShotCoverageIntentEnsureRequestSchema,
  sequenceAnimaticShotCoverageIntentEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export class CoverageIntentHttpError extends HttpError {
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

export async function runSequenceAnimaticShotCoverageIntentsCommand(input: {
  client: {
    from: (table: string) => any
  }
  admin: {
    from: (table: string) => any
  }
  userId: string
  payload: unknown
}) {
    const { client, admin, userId } = input
    const payload = sequenceAnimaticShotCoverageIntentEnsureRequestSchema.parse(input.payload)

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
      requestedBy: userId,
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
    const graphBundle = await loadChildWorkflowGraphBundle({ client: admin, workflowIds: [intentRequest.workflowId] })
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

    return sequenceAnimaticShotCoverageIntentEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      intentRequest,
      workflow: graphBundle.workflows[0] ?? null,
      nodes: graphBundle.nodes,
      edges: graphBundle.edges,
      coverageIntentByShotId,
      cacheStatus,
      sceneId: payload.sceneId,
      shotIds,
    })
}
