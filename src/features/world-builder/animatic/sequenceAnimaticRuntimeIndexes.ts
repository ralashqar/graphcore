import type {
  OutputArtifact,
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'

import {
  isOutputRunStepActive,
  outputRunStepForNode,
} from './sequenceAnimaticProgressPresentation'
import {
  artifactBelongsToRequest,
  readOutputRequestScreenplayAnimaticRole,
  sequenceAnimaticRequestIsActive,
  sequenceAnimaticRequestUpdatedAtMs,
} from './sequenceAnimaticRuntimePresentation'
import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'

function latestRunForRequest(request: OutputRequest | null, runs: readonly OutputWorkflowRun[]) {
  if (!request) return null
  return request.latestRunId
    ? runs.find((entry) => entry.id === request.latestRunId) ?? null
    : request.workflowId
      ? runs
          .filter((entry) => entry.workflowId === request.workflowId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
      : null
}

function dedupeArtifacts(artifacts: readonly OutputArtifact[]) {
  const seen = new Set<string>()
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.id)) return false
    seen.add(artifact.id)
    return true
  })
}

export function buildSequenceAnimaticRuntimeIndexes(input: {
  request: OutputRequest
  requests: readonly OutputRequest[]
  runs: readonly OutputWorkflowRun[]
  artifacts: readonly OutputArtifact[]
}) {
  const requestArtifacts = input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, input.request))
  const childRequests = input.requests
    .filter((request) => request.parentRequestId === input.request.id && readOutputRequestScreenplayAnimaticRole(request) === 'storyboard_block')
    .sort((left, right) => (Number(readLooseRecord(left.metadata).storyboardBlockIndex ?? 0) || 0) - (Number(readLooseRecord(right.metadata).storyboardBlockIndex ?? 0) || 0))
  const continuityRequest = input.requests
    .filter((request) => request.parentRequestId === input.request.id && readOutputRequestScreenplayAnimaticRole(request) === 'continuity_pack')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  const activeStoryboardChild = childRequests.find((request) => {
    const run = request.latestRunId ? input.runs.find((entry) => entry.id === request.latestRunId) ?? null : null
    return request.status === 'running'
      || request.status === 'planning'
      || request.status === 'queued'
      || (run ? sequenceAnimaticRequestIsActive(request, run) : false)
  }) ?? null
  const readyStoryboardChildCount = childRequests.filter((request) => {
    const run = request.latestRunId ? input.runs.find((entry) => entry.id === request.latestRunId) ?? null : null
    return request.status === 'completed' || run?.status === 'completed'
  }).length
  const continuityRun = latestRunForRequest(continuityRequest, input.runs)
  const childRequestByBlockId = new Map(childRequests
    .map((request) => [trimOptionalString(readLooseRecord(request.metadata).storyboardBlockId), request] as const)
    .filter(([blockId]) => Boolean(blockId)))
  const childRunByRequestId = new Map(childRequests
    .map((request) => [request.id, latestRunForRequest(request, input.runs)] as const))
  const shotVideoRequests = input.requests
    .filter((request) => readOutputRequestScreenplayAnimaticRole(request) === 'shot_video')
  const shotRevisionRequests = input.requests
    .filter((request) => readOutputRequestScreenplayAnimaticRole(request) === 'shot_revision')
  const plannedKeyframeRequests = input.requests
    .filter((request) => {
      const role = readOutputRequestScreenplayAnimaticRole(request)
      return role === 'shot_keyframe' || role === 'shot_production'
    })
  const coverageAnchorRequests = input.requests
    .filter((request) => readOutputRequestScreenplayAnimaticRole(request) === 'coverage_anchor')
  const zoneCoverageBoardRequests = input.requests
    .filter((request) => readOutputRequestScreenplayAnimaticRole(request) === 'zone_coverage_board')
  const coverageIntentRequests = input.requests
    .filter((request) => readOutputRequestScreenplayAnimaticRole(request) === 'coverage_intent_batch')
  const continuityAssetRequests = input.requests
    .filter((request) => {
      const role = readOutputRequestScreenplayAnimaticRole(request)
      return role === 'continuity_asset' || role === 'continuity_asset_batch'
    })
  const readRunForRequest = (request: OutputRequest | null) => latestRunForRequest(request, input.runs)
  const rankShotVideoRequest = (request: OutputRequest) => {
    const metadata = readLooseRecord(request.metadata)
    const run = readRunForRequest(request)
    const stalePenalty = metadata.sequenceAnimaticStale === true ? -1_000_000 : 0
    const activeBonus = sequenceAnimaticRequestIsActive(request, run) ? 1_000_000 : 0
    const readyBonus = request.status === 'completed' || request.status === 'completed_with_errors' ? 100_000 : 0
    return stalePenalty + activeBonus + readyBonus + sequenceAnimaticRequestUpdatedAtMs(request)
  }
  const shotVideoRequestsByParentAndShot = new Map<string, OutputRequest>()
  for (const request of [...shotVideoRequests].sort((left, right) => rankShotVideoRequest(right) - rankShotVideoRequest(left))) {
    const metadata = readLooseRecord(request.metadata)
    if (metadata.sequenceAnimaticStale === true) continue
    const parentId = request.parentRequestId || trimOptionalString(metadata.parentRequestId)
    const shotId = trimOptionalString(metadata.shotId)
    if (parentId && shotId && !shotVideoRequestsByParentAndShot.has(`${parentId}:${shotId}`)) {
      shotVideoRequestsByParentAndShot.set(`${parentId}:${shotId}`, request)
    }
  }
  const shotVideoRunByRequestId = new Map(shotVideoRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const shotRevisionRunByRequestId = new Map(shotRevisionRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const plannedKeyframeRunByRequestId = new Map(plannedKeyframeRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const shotProductionCoverageRunBySetupId = new Map<string, OutputWorkflowRun>()
  const shotProductionCoverageRunByShotId = new Map<string, OutputWorkflowRun>()
  for (const request of plannedKeyframeRequests) {
    if (readOutputRequestScreenplayAnimaticRole(request) !== 'shot_production') continue
    const requestMetadata = readLooseRecord(request.metadata)
    const setupId = trimOptionalString(requestMetadata.coverageSetupId)
    const shotId = trimOptionalString(requestMetadata.shotId)
    const run = plannedKeyframeRunByRequestId.get(request.id) ?? null
    if (!run) continue
    const coverageStepActive = [
      outputRunStepForNode(run, 'coverage_anchor_brief'),
      outputRunStepForNode(run, 'coverage_anchor_prompt'),
      outputRunStepForNode(run, 'coverage_anchor_image'),
      outputRunStepForNode(run, 'coverage_anchor_artifact'),
    ].some(isOutputRunStepActive)
    if (coverageStepActive || sequenceAnimaticRequestIsActive(request, run)) {
      if (setupId && !shotProductionCoverageRunBySetupId.has(setupId)) shotProductionCoverageRunBySetupId.set(setupId, run)
      if (shotId && !shotProductionCoverageRunByShotId.has(shotId)) shotProductionCoverageRunByShotId.set(shotId, run)
    }
  }
  const coverageAnchorRunByRequestId = new Map(coverageAnchorRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const zoneCoverageBoardRunByRequestId = new Map(zoneCoverageBoardRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const coverageIntentRunByRequestId = new Map(coverageIntentRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const continuityAssetRequestByNodeId = new Map<string, OutputRequest>()
  for (const request of [...continuityAssetRequests].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const metadata = readLooseRecord(request.metadata)
    const targetNodeIds = [
      trimOptionalString(metadata.targetNodeId),
      ...readLooseArray(metadata.targetNodeIds).map(trimOptionalString),
    ].filter(Boolean)
    for (const nodeId of targetNodeIds) {
      if (!continuityAssetRequestByNodeId.has(nodeId)) continuityAssetRequestByNodeId.set(nodeId, request)
    }
  }
  const continuityAssetRunByRequestId = new Map(continuityAssetRequests
    .map((request) => [request.id, readRunForRequest(request)] as const))
  const childArtifacts = childRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request)))
  const continuityArtifacts = continuityRequest
    ? input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, continuityRequest))
    : []
  const continuityAssetArtifacts = dedupeArtifacts([
    ...continuityAssetRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...continuityAssetRequests.flatMap((request) => continuityAssetRunByRequestId.get(request.id)?.artifacts ?? []),
  ])
  const shotVideoArtifacts = dedupeArtifacts([
    ...shotVideoRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...shotVideoRequests.flatMap((request) => shotVideoRunByRequestId.get(request.id)?.artifacts ?? []),
  ])
  const shotRevisionArtifacts = dedupeArtifacts([
    ...shotRevisionRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...shotRevisionRequests.flatMap((request) => shotRevisionRunByRequestId.get(request.id)?.artifacts ?? []),
  ])
  const plannedKeyframeArtifacts = dedupeArtifacts([
    ...plannedKeyframeRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...plannedKeyframeRequests.flatMap((request) => plannedKeyframeRunByRequestId.get(request.id)?.artifacts ?? []),
  ])
  const coverageAnchorArtifacts = dedupeArtifacts([
    ...coverageAnchorRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...coverageAnchorRequests.flatMap((request) => coverageAnchorRunByRequestId.get(request.id)?.artifacts ?? []),
    ...plannedKeyframeRequests.flatMap((request) => input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, request))),
    ...plannedKeyframeRequests.flatMap((request) => plannedKeyframeRunByRequestId.get(request.id)?.artifacts ?? []),
  ])
  const revisionRequestByShotId = new Map<string, OutputRequest>()
  for (const request of [...shotRevisionRequests].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const shotId = trimOptionalString(readLooseRecord(request.metadata).shotId)
    if (shotId && !revisionRequestByShotId.has(shotId)) revisionRequestByShotId.set(shotId, request)
  }
  const plannedKeyframeRequestByShotId = new Map<string, OutputRequest>()
  for (const request of [...plannedKeyframeRequests].sort((left, right) => {
    const leftRole = readOutputRequestScreenplayAnimaticRole(left)
    const rightRole = readOutputRequestScreenplayAnimaticRole(right)
    const leftPriority = leftRole === 'shot_production' ? 1 : 0
    const rightPriority = rightRole === 'shot_production' ? 1 : 0
    if (leftPriority !== rightPriority) return rightPriority - leftPriority
    return right.updatedAt.localeCompare(left.updatedAt)
  })) {
    const shotId = trimOptionalString(readLooseRecord(request.metadata).shotId)
    if (shotId && !plannedKeyframeRequestByShotId.has(shotId)) plannedKeyframeRequestByShotId.set(shotId, request)
  }

  return {
    requestArtifacts,
    childRequests,
    continuityRequest,
    activeStoryboardChild,
    readyStoryboardChildCount,
    continuityRun,
    childRequestByBlockId,
    childRunByRequestId,
    shotVideoRequests,
    shotRevisionRequests,
    plannedKeyframeRequests,
    coverageAnchorRequests,
    zoneCoverageBoardRequests,
    coverageIntentRequests,
    continuityAssetRequests,
    readRunForRequest,
    shotVideoRequestsByParentAndShot,
    shotVideoRunByRequestId,
    shotRevisionRunByRequestId,
    plannedKeyframeRunByRequestId,
    shotProductionCoverageRunBySetupId,
    shotProductionCoverageRunByShotId,
    coverageAnchorRunByRequestId,
    zoneCoverageBoardRunByRequestId,
    coverageIntentRunByRequestId,
    continuityAssetRequestByNodeId,
    continuityAssetRunByRequestId,
    childArtifacts,
    continuityArtifacts,
    continuityAssetArtifacts,
    shotVideoArtifacts,
    shotRevisionArtifacts,
    plannedKeyframeArtifacts,
    coverageAnchorArtifacts,
    revisionRequestByShotId,
    plannedKeyframeRequestByShotId,
  }
}
