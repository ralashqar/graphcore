import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
  SequenceAnimaticShotProductionGraphEnsureResponse,
} from '../../../domain/outputWorkflow'
import type {
  SequenceAnimaticBlockView,
  SequenceAnimaticSceneView,
  SequenceAnimaticShotView,
  SequenceAnimaticViewModel,
} from '../scene-board/sceneBoardProjection'
import { buildSequenceAnimaticShotKeyframeReferenceOverride } from './sequenceAnimaticShotWorkspace'
import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
  type StartOutputWorkflowRun,
} from './sequenceAnimaticCommandHelpers'

type GraphCommandViewModel = SequenceAnimaticViewModel & {
  directorPlanReady?: boolean
}

type GraphCommandBlockView = SequenceAnimaticBlockView & {
  childRequestId?: string | null
  childWorkflowId?: string | null
  childRunId?: string | null
  storyboardReady?: boolean
  videoPromptReady?: boolean
  videoNodeKey?: string
  sheetNodeKey?: string
  panelExtractNodeKey?: string
  videoPromptNodeKey?: string
}

type GraphCommandShotView = SequenceAnimaticShotView & {
  keyframeRequestId?: string | null
  keyframeWorkflowId?: string | null
  keyframeDependencyMode?: string | null
  keyframeGraphPolicyVersion?: string | null
}

type EnsureSequenceAnimaticBlockWorkflows = (request: {
  masterRequestId: string
  sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
  blockRequestId?: string
  storyboardBlockId?: string
  shotId?: string
  panelAssetKey?: string
}) => Promise<{ childRequests: OutputRequest[] }> | { childRequests: OutputRequest[] }

type EnsureSequenceAnimaticSceneWorkflows = (request: {
  masterRequestId: string
  sceneIds?: string[]
  startSceneId?: string
}) => Promise<unknown> | unknown

type EnsureSequenceAnimaticShotProductionGraph = (request: {
  masterRequestId: string
  shotId: string
  coverageSetupId?: string | null
  forceRefresh?: boolean
  allowProvisional?: boolean
  shotReferenceOverride?: Record<string, unknown>
}) => Promise<SequenceAnimaticShotProductionGraphEnsureResponse> | SequenceAnimaticShotProductionGraphEnsureResponse

function shotCanOpenProvisionalGraph(shot: GraphCommandShotView) {
  return Boolean(
    shot.panelAssetKey
    || shot.panelUrl
    || shot.coverageSetupId
    || shot.spatialBindingView?.hierarchy?.length,
  )
}

function readStoryboardBlockIndexFromRequest(request: OutputRequest) {
  const metadata = readLooseRecord(request.metadata)
  const block = readLooseRecord(metadata.block)
  const value = Number(metadata.storyboardBlockIndex ?? block.index ?? 0)
  return Number.isFinite(value) ? value : 0
}

function readStoryboardBlockShotIds(value: unknown) {
  const record = readLooseRecord(value)
  const storyboardGroup = readLooseRecord(record.storyboardGroup)
  const storyboardGroupSnake = readLooseRecord(record.storyboard_group)
  const ids = [
    ...readLooseArray(record.shotIds).map(trimOptionalString),
    ...readLooseArray(record.shot_ids).map(trimOptionalString),
    ...readLooseArray(storyboardGroup.shotIds).map(trimOptionalString),
    ...readLooseArray(storyboardGroup.shot_ids).map(trimOptionalString),
    ...readLooseArray(storyboardGroupSnake.shotIds).map(trimOptionalString),
    ...readLooseArray(storyboardGroupSnake.shot_ids).map(trimOptionalString),
    ...readLooseArray(record.shots).map((shot) => trimOptionalString(readLooseRecord(shot).id)),
  ].filter(Boolean)
  return ids.filter((id, index) => ids.indexOf(id) === index)
}

function findStoryboardBlockChildRequest(childRequests: readonly OutputRequest[], block: GraphCommandBlockView) {
  const exact = childRequests.find((request) => {
    const metadata = readLooseRecord(request.metadata)
    return trimOptionalString(metadata.storyboardBlockId) === block.id
      || trimOptionalString(readLooseRecord(metadata.block).id) === block.id
  }) ?? null
  if (exact) return exact

  const indexMatches = childRequests.filter((request) => readStoryboardBlockIndexFromRequest(request) === Number(block.index ?? 0))
  if (indexMatches.length === 1) return indexMatches[0] ?? null

  const blockShotIds = block.shots.map((shot) => trimOptionalString(shot.id)).filter(Boolean)
  if (blockShotIds.length === 0) return null
  const blockShotIdSet = new Set(blockShotIds)
  const scored = childRequests.map((request) => {
    const childShotIds = readStoryboardBlockShotIds(readLooseRecord(request.metadata).block)
    const overlap = childShotIds.filter((shotId) => blockShotIdSet.has(shotId)).length
    const exactShotSet = overlap === blockShotIds.length && childShotIds.length === blockShotIds.length
    return { request, score: exactShotSet ? 100 : overlap }
  }).filter((entry) => entry.score >= Math.min(2, blockShotIds.length))
    .sort((left, right) => right.score - left.score)
  if (scored.length === 0) return null
  return scored[0]?.score === scored[1]?.score ? null : scored[0]?.request ?? null
}

export function useSequenceAnimaticGraphCommands({
  outputWorkflowRuns,
  busyRunKeys,
  beginRun,
  endRun,
  loadAndStoreSequenceAnimaticState,
  onEnsureSequenceAnimaticBlockWorkflows,
  onEnsureSequenceAnimaticSceneWorkflows,
  onEnsureSequenceAnimaticShotProductionGraph,
  onGetOutputRequestStatus,
  onStartOutputWorkflowRun,
  openOutputGraph,
  setSequenceAnimaticErrorByKey,
}: {
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureSequenceAnimaticBlockWorkflows: EnsureSequenceAnimaticBlockWorkflows
  onEnsureSequenceAnimaticSceneWorkflows: EnsureSequenceAnimaticSceneWorkflows
  onEnsureSequenceAnimaticShotProductionGraph: EnsureSequenceAnimaticShotProductionGraph
  onGetOutputRequestStatus: (requestId: string) => Promise<unknown> | unknown
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  openOutputGraph: (model: GraphCommandViewModel, requestId: string, selectedNodeKey?: string | null) => void
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [graphOpenKey, setGraphOpenKey] = useState<string | null>(null)

  const runBlock = useCallback(async (
    model: GraphCommandViewModel,
    block: GraphCommandBlockView,
    mode: 'regenerate_storyboard' | 'generate_video',
  ) => {
    const blockRunKey = `${model.request.id}:${block.id}:${mode}`
    if (busyRunKeys.has(blockRunKey)) return
    beginRun(blockRunKey)
    setSequenceAnimaticErrorByKey((previous) => {
      const next = { ...previous }
      for (const key of model.request.selectedSequenceUnitKeys) delete next[key]
      return next
    })
    try {
      let targetBlock = block
      if (!targetBlock.childWorkflowId) {
        const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticBlockWorkflows({ masterRequestId: model.request.id }))
        const ensuredChild = findStoryboardBlockChildRequest(ensureResult.childRequests, block)
        targetBlock = {
          ...targetBlock,
          childRequestId: ensuredChild?.id ?? targetBlock.childRequestId,
          childWorkflowId: ensuredChild?.workflowId ?? targetBlock.childWorkflowId,
        }
      }
      if (!targetBlock.childWorkflowId) throw new Error('Storyboard block workflow is not ready yet.')
      if (mode === 'generate_video' && (!targetBlock.storyboardReady || !targetBlock.videoPromptReady)) {
        throw new Error('Generate the storyboard panels and video prompt before generating video.')
      }
      const videoNodeKey = targetBlock.videoNodeKey || 'video'
      const sheetNodeKey = targetBlock.sheetNodeKey || 'storyboard_sheet'
      const panelExtractNodeKey = targetBlock.panelExtractNodeKey || 'panel_extract'
      const videoPromptNodeKey = targetBlock.videoPromptNodeKey || 'video_prompt'
      const forceNodeKeys = mode === 'generate_video'
        ? [videoNodeKey]
        : [sheetNodeKey, panelExtractNodeKey, videoPromptNodeKey, 'artifact']
      const targetNodeKeys = mode === 'generate_video'
        ? [videoNodeKey]
        : ['artifact']
      const childRun = targetBlock.childRunId
        ? outputWorkflowRuns.find((run) => run.id === targetBlock.childRunId) ?? null
        : outputWorkflowRuns.find((run) => run.workflowId === targetBlock.childWorkflowId) ?? null
      const latestRunInput = readLooseRecord(childRun?.input)
      await Promise.resolve(onStartOutputWorkflowRun({
        workflowId: targetBlock.childWorkflowId,
        prompt: model.request.prompt,
        targetFormat: 'video',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          ...latestRunInput,
          debugSkipVideoGeneration: mode !== 'generate_video',
          cinematicVideoApproved: mode === 'generate_video',
          cinematicVideoApprovalScope: mode === 'generate_video' ? 'sequence_animatic_block' : undefined,
        },
        metadata: {
          runIntent: mode === 'generate_video'
            ? 'generate_block_video'
            : 'prepare_storyboard_block',
          runMode: mode === 'generate_video'
            ? 'sequence_animatic_block_video'
            : 'sequence_animatic_storyboard_block_regenerate',
          runScope: mode === 'generate_video' ? 'node_only' : 'upstream_to_node',
          targetNodeKeys,
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: mode === 'generate_video',
          debugSkipVideoGeneration: mode !== 'generate_video',
          cinematicVideoApproved: mode === 'generate_video',
          sourceRunId: childRun?.id ?? targetBlock.childRunId ?? model.request.latestRunId,
          parentRequestId: model.request.id,
          sequenceAnimaticRole: 'storyboard_block',
          sequenceAnimaticBlockId: targetBlock.id,
          storyboardBlockId: targetBlock.id,
        },
      }))
      await Promise.resolve(onGetOutputRequestStatus(targetBlock.childRequestId ?? model.request.id))
      await Promise.resolve(onGetOutputRequestStatus(model.request.id))
    } catch (error) {
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      endRun(blockRunKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    onEnsureSequenceAnimaticBlockWorkflows,
    onGetOutputRequestStatus,
    onStartOutputWorkflowRun,
    outputWorkflowRuns,
    setSequenceAnimaticErrorByKey,
  ])

  const runScene = useCallback(async (
    model: GraphCommandViewModel,
    scene: SequenceAnimaticSceneView,
  ) => {
    const sceneRunKey = `${model.request.id}:${scene.id}:generate_scene`
    if (busyRunKeys.has(sceneRunKey)) return
    beginRun(sceneRunKey)
    try {
      await Promise.resolve(onEnsureSequenceAnimaticSceneWorkflows({
        masterRequestId: model.request.id,
        sceneIds: [scene.id],
        startSceneId: scene.id,
      }))
      void Promise.resolve(loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null }))
        .catch((error) => {
          console.warn('[GraphCore] sequence animatic state refresh after scene start failed.', error)
        })
    } catch (error) {
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      endRun(sceneRunKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticSceneWorkflows,
    setSequenceAnimaticErrorByKey,
  ])

  const openShotGraph = useCallback(async (
    model: GraphCommandViewModel,
    block: GraphCommandBlockView,
    shot: GraphCommandShotView,
    refresh = false,
  ) => {
    const nextGraphOpenKey = `${model.request.id}:${block.id}:${shot.id}:${refresh ? 'refresh_shot_graph' : 'shot_graph'}`
    if (graphOpenKey) return
    setGraphOpenKey(nextGraphOpenKey)
    try {
      const allowProvisional = shotCanOpenProvisionalGraph(shot)
      if (!model.directorPlanReady && !allowProvisional) {
        throw new Error(shot.isProvisional ? 'Shot binding is not ready for early graph inspection yet.' : 'Generate the shot continuity plan first.')
      }
      const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticShotProductionGraph({
        masterRequestId: model.request.id,
        shotId: shot.id,
        coverageSetupId: shot.coverageSetupId || null,
        forceRefresh: true,
        allowProvisional,
        shotReferenceOverride: buildSequenceAnimaticShotKeyframeReferenceOverride(model, shot),
      }))
      const shotRequest = ensureResult.shotRequest
      if (!shotRequest?.workflowId) {
        const nextAction = readLooseRecord(ensureResult.nextAction)
        const reason = trimOptionalString(nextAction.reason) || trimOptionalString(nextAction.label)
        throw new Error(reason || 'Shot production graph is not ready yet.')
      }
      openOutputGraph(model, shotRequest.id, 'planned_keyframe_artifact')
      void Promise.resolve(onGetOutputRequestStatus(shotRequest.id)).catch((statusError) => {
        console.warn('[GraphCore] sequence animatic shot graph status refresh failed.', statusError)
      })
      void Promise.resolve(loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })).catch((stateError) => {
        console.warn('[GraphCore] sequence animatic state refresh after shot graph open failed.', stateError)
      })
    } catch (error) {
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setGraphOpenKey(null)
    }
  }, [
    graphOpenKey,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticShotProductionGraph,
    onGetOutputRequestStatus,
    openOutputGraph,
    setSequenceAnimaticErrorByKey,
  ])

  return {
    graphOpenKey,
    runBlock,
    runScene,
    openShotGraph,
  }
}
