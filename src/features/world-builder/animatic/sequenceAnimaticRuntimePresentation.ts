import type {
  OutputArtifact,
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'

import {
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers.ts'

export type SequenceAnimaticRequestState = 'none' | 'in_progress' | 'animatic_ready' | 'video_ready' | 'failed'

export const ACTIVE_SEQUENCE_ANIMATIC_STATUSES = new Set(['queued', 'planning', 'running'])
export const FAILED_SEQUENCE_ANIMATIC_STATUSES = new Set(['failed', 'cancelled'])
export const TERMINAL_SEQUENCE_ANIMATIC_RUN_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

function readNonEmptyLooseRecord(value: unknown): Record<string, unknown> | null {
  const record = readLooseRecord(value)
  return Object.keys(record).length > 0 ? record : null
}

export function artifactBelongsToRequest(artifact: OutputArtifact, request: OutputRequest) {
  return Boolean(
    (request.workflowId && artifact.workflowId === request.workflowId)
    || (request.latestRunId && artifact.runId === request.latestRunId),
  )
}

function readArtifactRole(artifact: OutputArtifact) {
  return trimOptionalString(readLooseRecord(artifact.metadata).role)
}

export function sequenceAnimaticRequestUpdatedAtMs(request: OutputRequest) {
  return Date.parse(request.updatedAt || request.createdAt || '') || 0
}

export function isWikiSequenceAnimaticRequest(request: OutputRequest, sequenceKey: string) {
  const metadata = readLooseRecord(request.metadata)
  return request.sourceSurface === 'wiki_sequence_unit'
    && !request.parentRequestId
    && request.selectedSequenceUnitKeys.includes(sequenceKey)
    && (request.outputKind === 'cinematic_episode' || request.outputKind === 'cinematic_trailer')
    && metadata.sequenceAnimaticRole !== 'storyboard_block'
    && metadata.sequenceAnimaticStale !== true
}

export function readOutputRequestScreenplayAnimaticRole(request: OutputRequest) {
  const metadata = readLooseRecord(request.metadata)
  return trimOptionalString(metadata.screenplayAnimaticRole) || trimOptionalString(metadata.sequenceAnimaticRole)
}

export function sequenceAnimaticProjectionForRequest(request: OutputRequest | null) {
  if (!request) return null
  const projection = readLooseRecord(readLooseRecord(request.metadata).outputStatusProjection)
  return Object.keys(projection).length > 0 ? projection : null
}

export function sequenceAnimaticEffectiveStatus(request: OutputRequest | null) {
  const projection = sequenceAnimaticProjectionForRequest(request)
  const projectionStatus = trimOptionalString(projection?.status)
  return projectionStatus || request?.status || ''
}

export function sequenceAnimaticProjectionTerminal(request: OutputRequest | null) {
  return sequenceAnimaticProjectionForRequest(request)?.terminal === true
}

export function sequenceAnimaticProjectionActiveLabel(request: OutputRequest | null) {
  const projection = sequenceAnimaticProjectionForRequest(request)
  return trimOptionalString(projection?.activeNodeLabel)
}

export function sequenceAnimaticProjectionActiveNodeKey(request: OutputRequest | null) {
  const projection = sequenceAnimaticProjectionForRequest(request)
  return trimOptionalString(projection?.activeNodeKey)
}

export function outputWorkflowRunHasFailedExecution(run: OutputWorkflowRun | null | undefined) {
  return run?.status === 'failed'
    || run?.status === 'cancelled'
    || run?.steps.some((step) => step.status === 'failed') === true
}

export function sequenceAnimaticRequestIsActive(request: OutputRequest | null, run?: OutputWorkflowRun | null) {
  if (!request) return false
  if (run && !TERMINAL_SEQUENCE_ANIMATIC_RUN_STATUSES.has(run.status)) return true
  if (run?.status === 'failed' || run?.status === 'cancelled') return false
  if (sequenceAnimaticProjectionTerminal(request)) return false
  const effectiveStatus = sequenceAnimaticEffectiveStatus(request)
  if (!run && (effectiveStatus === 'queued' || effectiveStatus === 'awaiting_confirmation')) return false
  return ACTIVE_SEQUENCE_ANIMATIC_STATUSES.has(effectiveStatus)
}

export function sequenceAnimaticRequestHasViewablePlan(
  request: OutputRequest | null,
  artifacts: readonly OutputArtifact[],
  requests: readonly OutputRequest[] = [],
) {
  if (!request) return false
  // Per-scene architecture: once the master registered its scenes, the animatic
  // is enterable even before every scene has generated final shots.
  const hasSceneChildren = requests.some((entry) => {
    if (entry.parentRequestId !== request.id) return false
    return readOutputRequestScreenplayAnimaticRole(entry) === 'scene_shot_plan'
  })
  if (hasSceneChildren) return true
  const requestArtifacts = artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))
  return requestArtifacts.some((artifact) => {
    const role = readArtifactRole(artifact)
    if (role === 'sequence_animatic_manifest') return true
    if (role !== 'sequence_animatic_director_plan') return false
    const metadata = readLooseRecord(artifact.metadata)
    return Boolean(
      readNonEmptyLooseRecord(metadata.shotContinuityPlan)
      || readNonEmptyLooseRecord(metadata.shot_continuity_plan)
      || readNonEmptyLooseRecord(metadata.directorPlan)
      || readNonEmptyLooseRecord(metadata.director_plan),
    )
  })
}

export function sequenceAnimaticStateForRequest(
  request: OutputRequest | null,
  runs: readonly OutputWorkflowRun[],
  artifacts: readonly OutputArtifact[],
  requests: readonly OutputRequest[] = [],
): SequenceAnimaticRequestState {
  if (!request) return 'none'
  const effectiveStatus = sequenceAnimaticEffectiveStatus(request)
  const projectionTerminal = sequenceAnimaticProjectionTerminal(request)
  const run = request.latestRunId
    ? runs.find((entry) => entry.id === request.latestRunId) ?? null
    : request.workflowId
      ? runs.find((entry) => entry.workflowId === request.workflowId) ?? null
      : null
  const requestArtifacts = artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))
  if (requestArtifacts.some((artifact) => artifact.kind === 'video' || artifact.mimeType.startsWith('video/'))) return 'video_ready'
  const hasViewablePlan = sequenceAnimaticRequestHasViewablePlan(request, artifacts, requests)
  if (!projectionTerminal && (ACTIVE_SEQUENCE_ANIMATIC_STATUSES.has(effectiveStatus) || (run && !TERMINAL_SEQUENCE_ANIMATIC_RUN_STATUSES.has(run.status)))) {
    return 'in_progress'
  }
  if (FAILED_SEQUENCE_ANIMATIC_STATUSES.has(effectiveStatus) || outputWorkflowRunHasFailedExecution(run)) {
    return hasViewablePlan ? 'animatic_ready' : 'failed'
  }
  if (hasViewablePlan) return 'animatic_ready'
  return 'none'
}

export function latestWikiSequenceAnimaticRequest(
  requests: readonly OutputRequest[],
  sequenceKey: string,
  runs: readonly OutputWorkflowRun[] = [],
  artifacts: readonly OutputArtifact[] = [],
) {
  const candidates = requests
    .filter((request) => isWikiSequenceAnimaticRequest(request, sequenceKey))
    .sort((left, right) => sequenceAnimaticRequestUpdatedAtMs(right) - sequenceAnimaticRequestUpdatedAtMs(left))
  if (candidates.length === 0) return null
  const active = candidates.find((request) => {
    const run = request.latestRunId
      ? runs.find((entry) => entry.id === request.latestRunId) ?? null
      : request.workflowId
        ? runs.find((entry) => entry.workflowId === request.workflowId) ?? null
        : null
    return sequenceAnimaticRequestIsActive(request, run)
  })
  if (active) return active
  const viewable = candidates.find((request) => {
    const state = sequenceAnimaticStateForRequest(request, runs, artifacts, requests)
    return state === 'animatic_ready' || state === 'video_ready'
  })
  return viewable ?? candidates[0]
}
