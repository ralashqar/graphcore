import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
  SequenceAnimaticContinuityAssetWorkflowEnsureResponse,
  SequenceAnimaticKeyframeWorkflowEnsureResponse,
  SequenceAnimaticSceneBoardWorkflowCommandResponse,
  SequenceAnimaticShotProductionGraphEnsureResponse,
  SequenceAnimaticZoneCoverageBoardEnsureResponse,
} from '../../../domain/outputWorkflow'
import type {
  SequenceAnimaticViewModel,
} from '../scene-board/sceneBoardProjection'
import { useSceneBoardCoverageCommands } from '../scene-board/useSceneBoardCoverageCommands'
import { useSceneBoardWorkflowCommand } from '../scene-board/useSceneBoardWorkflowCommand'
import { useSequenceAnimaticContinuityCommands } from './useSequenceAnimaticContinuityCommands'
import { useSequenceAnimaticGraphCommands } from './useSequenceAnimaticGraphCommands'
import { useSequenceAnimaticKeyframeCommands } from './useSequenceAnimaticKeyframeCommands'
import { useSequenceAnimaticShotRevisionCommands } from './useSequenceAnimaticShotRevisionCommands'
import { useSequenceAnimaticShotVideoCommands } from './useSequenceAnimaticShotVideoCommands'
import type { StartOutputWorkflowRun } from './sequenceAnimaticCommandHelpers'

type LoadSequenceAnimaticState = (request: {
  masterRequestId: string
  knownRevision: string | null
}) => Promise<unknown>

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

type EnsureSequenceAnimaticContinuityAssetWorkflow = (request: {
  masterRequestId: string
  continuityRequestId?: string | null
  nodeId: string
  nodeIds?: string[]
  targetNode?: Record<string, unknown>
  targetNodes?: Record<string, unknown>[]
  batchKind?: 'location_zone_board' | 'angle_grid' | 'viewpoint_grid' | 'spot_grid' | 'zone_spatial_map' | 'spot_camera_grid' | 'spot_atlas_grid' | 'viewpoint_atlas_grid' | 'temp_character_grid' | 'prop_grid' | 'single_hero_ref'
  mode?: 'generate' | 'regenerate'
}) => Promise<SequenceAnimaticContinuityAssetWorkflowEnsureResponse> | SequenceAnimaticContinuityAssetWorkflowEnsureResponse

type EnsureSequenceAnimaticKeyframeWorkflows = (request: {
  masterRequestId: string
  mode?: 'generate' | 'regenerate'
  shotIds?: string[]
  coverageSetupIds?: string[]
  allowProvisional?: boolean
}) => Promise<SequenceAnimaticKeyframeWorkflowEnsureResponse> | SequenceAnimaticKeyframeWorkflowEnsureResponse

type EnsureSequenceAnimaticShotProductionGraph = (request: {
  masterRequestId: string
  shotId: string
  coverageSetupId?: string | null
  forceRefresh?: boolean
  allowProvisional?: boolean
}) => Promise<SequenceAnimaticShotProductionGraphEnsureResponse> | SequenceAnimaticShotProductionGraphEnsureResponse

type EnsureSequenceAnimaticZoneCoverageBoards = (request: {
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  shotIds?: string[]
  scopedShots?: Record<string, unknown>[]
  forceRefresh?: boolean
}) => Promise<SequenceAnimaticZoneCoverageBoardEnsureResponse> | SequenceAnimaticZoneCoverageBoardEnsureResponse

type EnsureSequenceAnimaticShotRevisionWorkflow = (request: {
  masterRequestId: string
  storyboardBlockId: string
  shotId: string
  prompt: string
}) => Promise<{ revisionRequest: OutputRequest | null }> | { revisionRequest: OutputRequest | null }

type SceneBoardPrepPersistRequest = {
  masterRequestId: string
  runId?: string
  runKey?: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  scopeNodeId?: string | null
  shotIds?: string[]
  stage?: 'idle' | 'set_refs' | 'scaffold_refs' | 'spot_angles' | 'coverage_directions' | 'coverage_grids' | 'complete' | 'failed' | 'cancelled'
  status?: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
  activeUnitId?: string | null
  activeUnitLabel?: string
  stageLabel?: string
  message?: string
  queued?: number
  running?: number
  ready?: number
  failed?: number
  activeRequestIds?: string[]
  activeRunIds?: string[]
  activeReferenceNodeIds?: string[]
  activeCoverageShotIds?: string[]
  activeRunStepKey?: string
  error?: string
  action?: 'start' | 'update' | 'complete' | 'fail' | 'cancel' | 'resume'
  forceRefresh?: boolean
}

type SceneBoardWorkflowCommandRequest = {
  masterRequestId: string
  sceneId: string
  action?: 'prepare_selected_board' | 'regenerate_zone_top_down' | 'generate_spot_angle_coverage' | 'generate_zone_coverage_grids' | 'generate_selected_coverage_anchors'
  setId?: string | null
  zoneId?: string | null
  scopeNodeId?: string | null
  shotIds?: string[]
  forceRefresh?: boolean
}

export function useSequenceAnimaticWorkflowCommands({
  outputRequests,
  outputWorkflowRuns,
  previewModel,
  modelByRequestId,
  sceneBoardModel,
  sceneBoardScopeSceneId,
  sceneBoardScopeNodeId,
  loadAndStoreSequenceAnimaticState,
  onEnsureSequenceAnimaticBlockWorkflows,
  onEnsureSequenceAnimaticSceneWorkflows,
  onEnsureSequenceAnimaticContinuityAssetWorkflow,
  onEnsureSequenceAnimaticKeyframeWorkflows,
  onEnsureSequenceAnimaticShotProductionGraph,
  onEnsureSequenceAnimaticZoneCoverageBoards,
  onEnsureSequenceAnimaticShotRevisionWorkflow,
  onStartSequenceAnimaticSceneBoardWorkflowCommand,
  onPrepareSequenceAnimaticSceneBoard,
  onGetOutputRequestStatus,
  onStartOutputWorkflowRun,
  pollSequenceAnimaticOutputRequest,
  openOutputGraph,
  setSequenceAnimaticErrorByKey,
}: {
  outputRequests: readonly OutputRequest[]
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  previewModel: SequenceAnimaticViewModel | null
  modelByRequestId: ReadonlyMap<string, SequenceAnimaticViewModel>
  sceneBoardModel: SequenceAnimaticViewModel | null
  sceneBoardScopeSceneId: string | null
  sceneBoardScopeNodeId: string | null
  loadAndStoreSequenceAnimaticState: LoadSequenceAnimaticState
  onEnsureSequenceAnimaticBlockWorkflows: EnsureSequenceAnimaticBlockWorkflows
  onEnsureSequenceAnimaticSceneWorkflows: EnsureSequenceAnimaticSceneWorkflows
  onEnsureSequenceAnimaticContinuityAssetWorkflow: EnsureSequenceAnimaticContinuityAssetWorkflow
  onEnsureSequenceAnimaticKeyframeWorkflows: EnsureSequenceAnimaticKeyframeWorkflows
  onEnsureSequenceAnimaticShotProductionGraph: EnsureSequenceAnimaticShotProductionGraph
  onEnsureSequenceAnimaticZoneCoverageBoards: EnsureSequenceAnimaticZoneCoverageBoards
  onEnsureSequenceAnimaticShotRevisionWorkflow: EnsureSequenceAnimaticShotRevisionWorkflow
  onStartSequenceAnimaticSceneBoardWorkflowCommand: (request: SceneBoardWorkflowCommandRequest) => Promise<SequenceAnimaticSceneBoardWorkflowCommandResponse> | SequenceAnimaticSceneBoardWorkflowCommandResponse
  onPrepareSequenceAnimaticSceneBoard: (request: SceneBoardPrepPersistRequest) => Promise<{ masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }> | { masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }
  onGetOutputRequestStatus: (requestId: string) => Promise<{ terminal?: boolean; run?: OutputWorkflowRun | null }> | { terminal?: boolean; run?: OutputWorkflowRun | null }
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  pollSequenceAnimaticOutputRequest: (requestId: string) => Promise<unknown>
  openOutputGraph: (model: { request: OutputRequest }, requestId: string, selectedNodeKey?: string | null) => void
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [busyRunKeys, setBusyRunKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [shotVideoRunKeys, setShotVideoRunKeys] = useState<Record<string, number>>({})

  const beginRun = useCallback((runKey: string) => {
    setBusyRunKeys((previous) => {
      if (previous.has(runKey)) return previous
      const next = new Set(previous)
      next.add(runKey)
      return next
    })
  }, [])

  const endRun = useCallback((runKey: string) => {
    setBusyRunKeys((previous) => {
      if (!previous.has(runKey)) return previous
      const next = new Set(previous)
      next.delete(runKey)
      return next
    })
  }, [])

  const markShotVideoRunKey = useCallback((runKey: string) => {
    setShotVideoRunKeys((previous) => ({ ...previous, [runKey]: Date.now() }))
  }, [])

  const clearShotVideoRunKey = useCallback((runKey: string) => {
    setShotVideoRunKeys((previous) => {
      if (!previous[runKey]) return previous
      const next = { ...previous }
      delete next[runKey]
      return next
    })
  }, [])

  const shotVideoRunKeyActive = useCallback((runKey: string) => (
    Boolean(shotVideoRunKeys[runKey])
  ), [shotVideoRunKeys])

  useEffect(() => {
    if (!previewModel) return
    setShotVideoRunKeys((previous) => {
      const now = Date.now()
      let changed = false
      const next = { ...previous }
      for (const [runKey, startedAt] of Object.entries(previous)) {
        const [, blockId, shotId] = runKey.split(':')
        const shot = previewModel.blocks
          .find((block) => block.id === blockId)
          ?.shots.find((entry) => entry.id === shotId) ?? null
        if (shot?.shotVideoRunning || shot?.shotVideoReady || shot?.shotVideoError || now - startedAt > 30_000) {
          delete next[runKey]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [previewModel])

  const {
    prepRun: sceneBoardPrepRun,
    prepareContinuity: prepareSceneBoardContinuity,
    cancelPrep: cancelSceneBoardPrep,
  } = useSceneBoardWorkflowCommand({
    model: sceneBoardModel,
    scopeSceneId: sceneBoardScopeSceneId,
    scopeNodeId: sceneBoardScopeNodeId,
    busyRunKeys,
    beginRun,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onStartWorkflowCommand: onStartSequenceAnimaticSceneBoardWorkflowCommand,
    onPersistLegacyPrepRun: onPrepareSequenceAnimaticSceneBoard,
    setSequenceAnimaticErrorByKey,
  })

  const {
    regenerateSceneCoverageAnchors,
  } = useSceneBoardCoverageCommands({
    outputWorkflowRuns,
    busyRunKeys,
    beginRun,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureZoneCoverageBoards: onEnsureSequenceAnimaticZoneCoverageBoards,
    onStartOutputWorkflowRun,
    setSequenceAnimaticErrorByKey,
  })

  const {
    pendingContinuityAssets,
    pendingCoverageAnchor,
    runContinuityAssets,
    runCoverageAnchor,
  } = useSequenceAnimaticContinuityCommands({
    outputWorkflowRuns,
    previewModel,
    modelByRequestId,
    busyRunKeys,
    beginRun,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticContinuityAssetWorkflow,
    onEnsureSequenceAnimaticKeyframeWorkflows,
    onStartOutputWorkflowRun,
    setSequenceAnimaticErrorByKey,
  })

  const {
    pendingShotKeyframe,
    runKeyframes,
    runShotKeyframe,
  } = useSequenceAnimaticKeyframeCommands({
    outputRequests,
    outputWorkflowRuns,
    previewModel,
    busyRunKeys,
    beginRun,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticKeyframeWorkflows,
    onStartOutputWorkflowRun,
    setSequenceAnimaticErrorByKey,
  })

  const {
    runShotVideo,
  } = useSequenceAnimaticShotVideoCommands({
    outputWorkflowRuns,
    isRunKeyActive: shotVideoRunKeyActive,
    markRunKey: markShotVideoRunKey,
    clearRunKey: clearShotVideoRunKey,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticBlockWorkflows,
    onGetOutputRequestStatus,
    onStartOutputWorkflowRun,
    pollSequenceAnimaticOutputRequest,
    setSequenceAnimaticErrorByKey,
  })

  const {
    graphOpenKey,
    runBlock,
    runScene,
    openShotGraph,
  } = useSequenceAnimaticGraphCommands({
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
  })

  const {
    shotPrompt,
    shotPromptDraftByKey,
    setShotPromptDraft,
    runShotRevision,
  } = useSequenceAnimaticShotRevisionCommands({
    outputWorkflowRuns,
    busyRunKeys,
    beginRun,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticBlockWorkflows,
    onEnsureSequenceAnimaticShotRevisionWorkflow,
    onStartOutputWorkflowRun,
    pollSequenceAnimaticOutputRequest,
    setSequenceAnimaticErrorByKey,
  })

  return {
    busyRunKeys,
    shotVideoRunKeyActive,
    sceneBoardPrepRun,
    prepareSceneBoardContinuity,
    cancelSceneBoardPrep,
    regenerateSceneCoverageAnchors,
    pendingContinuityAssets,
    pendingCoverageAnchor,
    runContinuityAssets,
    runCoverageAnchor,
    pendingShotKeyframe,
    runKeyframes,
    runShotKeyframe,
    runShotVideo,
    graphOpenKey,
    runBlock,
    runScene,
    openShotGraph,
    shotPrompt,
    shotPromptDraftByKey,
    setShotPromptDraft,
    runShotRevision,
  }
}
