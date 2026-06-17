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
import { planSceneBoardZoneCoverageGridChildren } from './sequence-animatic-scene-board-child-planners.ts'
import {
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  sequenceAnimaticZoneCoverageBoardEnsureRequestSchema,
  sequenceAnimaticZoneCoverageBoardEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])
const ZONE_COVERAGE_CELL_SOURCE = 'zone_camera_grid_cell'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export class ZoneCoverageHttpError extends HttpError {
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

export async function runSequenceAnimaticZoneCoverageBoardsCommand(input: {
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
    const payload = sequenceAnimaticZoneCoverageBoardEnsureRequestSchema.parse(input.payload)

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(asRecord(masterResponse.data) as never)

    const plan = await planSceneBoardZoneCoverageGridChildren({
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
      throw new ZoneCoverageHttpError(409, plan.diagnostics[0] || 'No zone camera grid workflows could be prepared.', {
        ...asRecord(plan.metadata),
        sceneId: payload.sceneId,
        setId: payload.setId ?? null,
        zoneId: payload.zoneId ?? null,
        shotIds: payload.shotIds,
      })
    }

    const boardRequests = []
    const workflows: OutputWorkflow[] = []
    let nodes: OutputWorkflowNode[] = []
    let edges: OutputWorkflowEdge[] = []
    const zoneCoverageBoards: Record<string, unknown>[] = []
    let createdCount = 0
    let reusedCount = 0
    let refreshedCount = 0

    for (const spec of plan.childWorkflows) {
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
      const childRequest = mapOutputRequestRow(ensured.request as never)
      const graphBundle = await loadChildWorkflowGraphBundle({ client: admin, workflowIds: [childRequest.workflowId] })
      const requestMetadata = asRecord(spec.request.metadata)
      const board = asRecord(requestMetadata.board)
      const coverageCells = readArray(requestMetadata.coverageCells).map(asRecord)
      boardRequests.push(childRequest)
      if (graphBundle.workflows[0]) workflows.push(graphBundle.workflows[0])
      nodes = [...nodes, ...graphBundle.nodes]
      edges = [...edges, ...graphBundle.edges]
      zoneCoverageBoards.push({
        ...board,
        coverageCells,
        requestId: childRequest.id,
        workflowId: childRequest.workflowId,
        latestRunId: childRequest.latestRunId,
        requestStatus: childRequest.status,
        active: outputRequestIsActive(childRequest),
      })
      if (ensured.reused || outputRequestIsActive(childRequest)) {
        reusedCount += 1
      } else {
        createdCount += 1
        if (payload.forceRefresh) refreshedCount += 1
      }
    }

    const coverageCellByShotId = Object.fromEntries(zoneCoverageBoards.flatMap((board) => readArray(board.coverageCells).map(asRecord).map((cell) => [
      readText(cell.shotId),
      {
        ...cell,
        boardId: readText(board.id),
        source: 'pending_zone_camera_grid_cell',
        coverageAnchorSource: ZONE_COVERAGE_CELL_SOURCE,
      },
    ]).filter(([shotId]) => Boolean(shotId))))
    const cacheStatus = reusedCount > 0 && createdCount > 0
      ? 'mixed'
      : payload.forceRefresh && refreshedCount > 0
        ? 'refreshed'
        : reusedCount > 0 && createdCount === 0
          ? 'reused'
          : 'created'

    return sequenceAnimaticZoneCoverageBoardEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      boardRequests,
      workflows,
      nodes,
      edges,
      zoneCoverageBoards,
      coverageCellByShotId,
      cacheStatus,
      sceneId: payload.sceneId,
    })
}
