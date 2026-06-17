import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'
import {
  sequenceAnimaticShotVideoForceNodeKeys,
  sequenceAnimaticShotVideoTargetNodeKeys,
} from '../../../domain/sequenceAnimaticNodeKeys'
import type {
  SequenceAnimaticBlockView,
  SequenceAnimaticShotView,
  SequenceAnimaticViewModel,
} from '../scene-board/sceneBoardProjection'
import {
  readLooseRecord,
  trimOptionalString,
  type StartOutputWorkflowRun,
} from './sequenceAnimaticCommandHelpers'

function readOptionalString(value: unknown) {
  return trimOptionalString(value) || null
}

type EnsureSequenceAnimaticBlockWorkflows = (request: {
  masterRequestId: string
  sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
  blockRequestId?: string
  storyboardBlockId?: string
  shotId?: string
  panelAssetKey?: string
}) => Promise<{ childRequests: OutputRequest[] }> | { childRequests: OutputRequest[] }

export function useSequenceAnimaticShotVideoCommands({
  outputWorkflowRuns,
  isRunKeyActive,
  markRunKey,
  clearRunKey,
  loadAndStoreSequenceAnimaticState,
  onEnsureSequenceAnimaticBlockWorkflows,
  onGetOutputRequestStatus,
  onStartOutputWorkflowRun,
  pollSequenceAnimaticOutputRequest,
  setSequenceAnimaticErrorByKey,
}: {
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  isRunKeyActive: (runKey: string) => boolean
  markRunKey: (runKey: string) => void
  clearRunKey: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureSequenceAnimaticBlockWorkflows: EnsureSequenceAnimaticBlockWorkflows
  onGetOutputRequestStatus: (requestId: string) => Promise<unknown> | unknown
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  pollSequenceAnimaticOutputRequest: (requestId: string) => Promise<unknown>
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const ensureShotVideoRequest = useCallback(async (
    model: SequenceAnimaticViewModel,
    block: SequenceAnimaticBlockView,
    shot: SequenceAnimaticShotView,
  ): Promise<OutputRequest> => {
    const ensureBlocks = await Promise.resolve(onEnsureSequenceAnimaticBlockWorkflows({ masterRequestId: model.request.id }))
    const refreshedBlockRequestId = ensureBlocks.childRequests.find((request) => {
      const metadata = readLooseRecord(request.metadata)
      return trimOptionalString(metadata.storyboardBlockId) === block.id
        && trimOptionalString(metadata.sequenceAnimaticRole) === 'storyboard_block'
        && metadata.sequenceAnimaticStale !== true
    })?.id ?? null
    const blockRequestId = refreshedBlockRequestId ?? readOptionalString(block.childRequestId)
    if (!blockRequestId) throw new Error('Storyboard block workflow is not ready yet.')
    if (!shot.panelUrl) throw new Error('Generate/extract the storyboard panel before generating shot video.')
    const ensureShot = await Promise.resolve(onEnsureSequenceAnimaticBlockWorkflows({
      masterRequestId: model.request.id,
      sequenceAnimaticMode: 'shot_video',
      blockRequestId,
      storyboardBlockId: block.id,
      shotId: shot.id,
      panelAssetKey: readOptionalString(shot.panelAssetKey) ?? undefined,
    }))
    const shotRequest = ensureShot.childRequests.find((request) => {
      const metadata = readLooseRecord(request.metadata)
      return request.parentRequestId === blockRequestId
        && trimOptionalString(metadata.sequenceAnimaticRole) === 'shot_video'
        && trimOptionalString(metadata.shotId) === shot.id
    }) ?? null
    if (!shotRequest?.workflowId) throw new Error('Shot video workflow is not ready yet.')
    return shotRequest
  }, [onEnsureSequenceAnimaticBlockWorkflows])

  const runShotVideo = useCallback(async (
    model: SequenceAnimaticViewModel,
    block: SequenceAnimaticBlockView,
    shot: SequenceAnimaticShotView,
  ) => {
    const runKey = `${model.request.id}:${block.id}:${shot.id}:shot_video`
    if (isRunKeyActive(runKey) || shot.shotVideoRunning) return
    markRunKey(runKey)
    setSequenceAnimaticErrorByKey((previous) => {
      const next = { ...previous }
      for (const key of model.request.selectedSequenceUnitKeys) delete next[key]
      return next
    })
    try {
      const shotRequest = await ensureShotVideoRequest(model, block, shot)
      const shotWorkflowId = shotRequest.workflowId
      if (!shotWorkflowId) throw new Error('Shot video workflow is not ready yet.')
      const blockRequestId = readOptionalString(block.childRequestId)
      const existingRun = shotRequest.latestRunId
        ? outputWorkflowRuns.find((run) => run.id === shotRequest.latestRunId) ?? null
        : outputWorkflowRuns.find((run) => run.workflowId === shotWorkflowId) ?? null
      const latestRunInput = readLooseRecord(existingRun?.input)
      await Promise.resolve(onStartOutputWorkflowRun({
        workflowId: shotWorkflowId,
        prompt: shotRequest.prompt || `Generate a per-shot video take for ${shot.title}.`,
        targetFormat: 'video',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          ...latestRunInput,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: true,
          cinematicVideoApprovalScope: 'sequence_animatic_shot',
        },
        metadata: {
          runIntent: 'generate_shot_video',
          runMode: 'sequence_animatic_shot_video',
          runScope: 'upstream_to_node',
          targetNodeKeys: [...sequenceAnimaticShotVideoTargetNodeKeys],
          forceNodeKeys: [...sequenceAnimaticShotVideoForceNodeKeys],
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: true,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: true,
          sourceRunId: existingRun?.id ?? shotRequest.latestRunId ?? null,
          parentRequestId: blockRequestId,
          masterRequestId: model.request.id,
          sequenceAnimaticRole: 'shot_video',
          storyboardBlockId: block.id,
          shotId: shot.id,
        },
      }))
      await Promise.resolve(onGetOutputRequestStatus(shotRequest.id))
      if (blockRequestId) void Promise.resolve(onGetOutputRequestStatus(blockRequestId)).catch((statusError) => {
        console.warn('[GraphCore] sequence animatic block status refresh after shot-video start failed.', statusError)
      })
      void Promise.resolve(onGetOutputRequestStatus(model.request.id)).catch((statusError) => {
        console.warn('[GraphCore] sequence animatic master status refresh after shot-video start failed.', statusError)
      })
      void Promise.resolve(pollSequenceAnimaticOutputRequest(shotRequest.id)).catch((pollError) => {
        console.warn('[GraphCore] sequence animatic shot-video background poll failed.', pollError)
      })
      void Promise.resolve(loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })).catch((stateError) => {
        console.warn('[GraphCore] sequence animatic state refresh after shot-video start failed.', stateError)
      })
    } catch (error) {
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
      clearRunKey(runKey)
    } finally {
      window.setTimeout(() => clearRunKey(runKey), 5000)
    }
  }, [
    clearRunKey,
    ensureShotVideoRequest,
    isRunKeyActive,
    loadAndStoreSequenceAnimaticState,
    markRunKey,
    onGetOutputRequestStatus,
    onStartOutputWorkflowRun,
    outputWorkflowRuns,
    pollSequenceAnimaticOutputRequest,
    setSequenceAnimaticErrorByKey,
  ])

  return {
    ensureShotVideoRequest,
    runShotVideo,
  }
}
