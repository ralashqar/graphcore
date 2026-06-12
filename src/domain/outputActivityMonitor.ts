import type { ProjectSnapshot } from './graphcore'
import type { SequenceAnimaticStateResponse } from './outputWorkflow'

type OutputRequestLike = ProjectSnapshot['outputRequests'][number]
type OutputWorkflowRunLike = ProjectSnapshot['outputWorkflowRuns'][number]

const ACTIVE_OUTPUT_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])
const TERMINAL_OUTPUT_REQUEST_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'])
const ACTIVE_OUTPUT_RUN_STATUSES = new Set(['queued', 'running'])
const ACTIVE_OUTPUT_STEP_STATUSES = new Set(['queued', 'running'])

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readOutputStatusProjectionMetadata(request: OutputRequestLike) {
  return readRecord(readRecord(request.metadata).outputStatusProjection)
}

export function isTerminalOutputActivityStatus(status: string | null | undefined) {
  return TERMINAL_OUTPUT_REQUEST_STATUSES.has(readText(status))
}

export function outputRequestEffectiveStatus(request: OutputRequestLike) {
  const projection = readOutputStatusProjectionMetadata(request)
  const projectionStatus = readText(projection.status)
  if (projectionStatus) return projectionStatus
  return request.status
}

export function isActiveOutputRequest(request: OutputRequestLike, runsById: Map<string, OutputWorkflowRunLike>) {
  const projection = readOutputStatusProjectionMetadata(request)
  if (projection.terminal === true) return false
  const projectionStatus = readText(projection.status)
  if (projectionStatus) return ACTIVE_OUTPUT_REQUEST_STATUSES.has(projectionStatus)
  const runId = readText(projection.latestRunId) || request.latestRunId
  const run = runId ? runsById.get(runId) ?? null : null
  if (run && isTerminalOutputActivityStatus(run.status)) return false
  if (run && ACTIVE_OUTPUT_REQUEST_STATUSES.has(run.status)) return true
  return ACTIVE_OUTPUT_REQUEST_STATUSES.has(request.status)
}

export function collectActiveOutputRequestIds(snapshot: Pick<ProjectSnapshot, 'outputRequests' | 'outputWorkflowRuns'>) {
  const runsById = new Map(snapshot.outputWorkflowRuns.map((run) => [run.id, run] as const))
  return snapshot.outputRequests
    .filter((request) => isActiveOutputRequest(request, runsById))
    .map((request) => request.id)
    .sort()
}

export function outputProgressSignature(snapshot: Pick<ProjectSnapshot, 'outputRequests' | 'outputWorkflowRuns'> | null | undefined) {
  if (!snapshot) return ''
  const activeIds = collectActiveOutputRequestIds(snapshot)
  if (activeIds.length === 0) return ''
  return activeIds.map((requestId) => {
    const request = snapshot.outputRequests.find((entry) => entry.id === requestId)
    if (!request) return requestId
    const projection = readOutputStatusProjectionMetadata(request)
    return [
      request.id,
      outputRequestEffectiveStatus(request),
      readText(projection.activeNodeKey),
      readText(projection.activeNodeLabel),
      readText(projection.graphRevision),
      readText(projection.timelineRevision),
      request.updatedAt,
    ].join(':')
  }).join('|')
}

export function hasActiveSequenceAnimaticWork(state: SequenceAnimaticStateResponse | null | undefined) {
  if (!state) return false
  const requests = [
    ...(state.masterRequest ? [state.masterRequest] : []),
    ...state.requests,
  ]
  const runsById = new Map(state.runs.map((run) => [run.id, run] as const))
  if (requests.some((request) => isActiveOutputRequest(request, runsById))) return true
  return state.runs.some((run) => (
    ACTIVE_OUTPUT_RUN_STATUSES.has(run.status)
    || run.steps.some((step) => ACTIVE_OUTPUT_STEP_STATUSES.has(step.status))
  ))
}
