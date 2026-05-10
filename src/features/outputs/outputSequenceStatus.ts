import type { ProjectSnapshot } from '../../domain/graphcore'
import type { OutputArtifact, OutputRequest, OutputWorkflowRun } from '../../domain/outputWorkflow'

export type SequenceRenderState = 'none' | 'in_progress' | 'animatic_ready' | 'video_ready' | 'comic_ready' | 'failed'

export type SequenceOutputStatus = {
  sequenceKey: string
  cinematicState: Exclude<SequenceRenderState, 'comic_ready'>
  comicState: Exclude<SequenceRenderState, 'animatic_ready' | 'video_ready'>
  latestCinematicRequest: OutputRequest | null
  latestComicRequest: OutputRequest | null
  latestRequest: OutputRequest | null
}

type SequenceEntity = ProjectSnapshot['worldEntities'][number]

const ACTIVE_REQUEST_STATUSES = new Set(['queued', 'planning', 'awaiting_confirmation', 'running'])
const FAILED_REQUEST_STATUSES = new Set(['failed', 'cancelled'])

function isCinematicRequest(request: OutputRequest) {
  return request.outputKind === 'cinematic_episode' || request.outputKind === 'cinematic_trailer'
}

function isComicRequest(request: OutputRequest) {
  return request.outputKind === 'comic_issue_from_sequence'
}

function requestUpdatedAt(request: OutputRequest) {
  return Date.parse(request.updatedAt || request.createdAt || '') || 0
}

function latestRequestForSequence(
  requests: OutputRequest[],
  sequenceKey: string,
  predicate: (request: OutputRequest) => boolean,
) {
  return requests
    .filter((request) => request.selectedSequenceUnitKeys.includes(sequenceKey) && predicate(request))
    .sort((left, right) => requestUpdatedAt(right) - requestUpdatedAt(left))[0] ?? null
}

function artifactsForRequest(artifacts: OutputArtifact[], request: OutputRequest | null) {
  if (!request) return []
  return artifacts.filter((artifact) => (
    (request.workflowId && artifact.workflowId === request.workflowId)
    || (request.latestRunId && artifact.runId === request.latestRunId)
  ))
}

function requestHasRunningRun(request: OutputRequest | null, runs: OutputWorkflowRun[]) {
  if (!request?.latestRunId) return false
  const run = runs.find((entry) => entry.id === request.latestRunId)
  return run ? !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) : false
}

function cinematicStateForRequest(request: OutputRequest | null, runs: OutputWorkflowRun[], artifacts: OutputArtifact[]): SequenceOutputStatus['cinematicState'] {
  if (!request) return 'none'
  if (ACTIVE_REQUEST_STATUSES.has(request.status) || requestHasRunningRun(request, runs)) return 'in_progress'
  if (FAILED_REQUEST_STATUSES.has(request.status)) return 'failed'
  const requestArtifacts = artifactsForRequest(artifacts, request)
  if (requestArtifacts.some((artifact) => artifact.kind === 'video' || artifact.mimeType.startsWith('video/'))) return 'video_ready'
  return 'animatic_ready'
}

function comicStateForRequest(request: OutputRequest | null, runs: OutputWorkflowRun[], artifacts: OutputArtifact[]): SequenceOutputStatus['comicState'] {
  if (!request) return 'none'
  if (ACTIVE_REQUEST_STATUSES.has(request.status) || requestHasRunningRun(request, runs)) return 'in_progress'
  if (FAILED_REQUEST_STATUSES.has(request.status)) return 'failed'
  const requestArtifacts = artifactsForRequest(artifacts, request)
  if (requestArtifacts.some((artifact) => artifact.kind === 'comic_pdf' || artifact.kind === 'pdf' || artifact.mimeType === 'application/pdf')) return 'comic_ready'
  return request.status === 'completed' || request.status === 'completed_with_errors' ? 'comic_ready' : 'none'
}

export function deriveSequenceOutputStatuses(input: {
  sequenceUnits: SequenceEntity[]
  outputRequests: OutputRequest[]
  outputRuns: OutputWorkflowRun[]
  outputArtifacts: OutputArtifact[]
}) {
  const statuses = new Map<string, SequenceOutputStatus>()
  for (const sequence of input.sequenceUnits) {
    const latestCinematicRequest = latestRequestForSequence(input.outputRequests, sequence.key, isCinematicRequest)
    const latestComicRequest = latestRequestForSequence(input.outputRequests, sequence.key, isComicRequest)
    const latestRequest = [latestCinematicRequest, latestComicRequest]
      .filter((request): request is OutputRequest => Boolean(request))
      .sort((left, right) => requestUpdatedAt(right) - requestUpdatedAt(left))[0] ?? null
    statuses.set(sequence.key, {
      sequenceKey: sequence.key,
      cinematicState: cinematicStateForRequest(latestCinematicRequest, input.outputRuns, input.outputArtifacts),
      comicState: comicStateForRequest(latestComicRequest, input.outputRuns, input.outputArtifacts),
      latestCinematicRequest,
      latestComicRequest,
      latestRequest,
    })
  }
  return statuses
}
