import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { isTransientRequestError } from '../../../data/requestCoordinator'
import type { OutputRequest, SequenceAnimaticSceneBoardWorkflowCommandResponse } from '../../../domain/outputWorkflow'
import {
  buildSequenceAnimaticSceneBoardView,
  sequenceAnimaticSceneBoardPrepRunForScope,
  sequenceAnimaticSceneBoardPrepRunKey,
  type SequenceAnimaticSceneBoardPrepRunState,
  type SequenceAnimaticSceneView,
  type SequenceAnimaticViewModel,
} from './sceneBoardProjection'

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

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

export function useSceneBoardWorkflowCommand({
  model,
  scopeSceneId,
  scopeNodeId,
  busyRunKeys,
  beginRun,
  endRun,
  loadAndStoreSequenceAnimaticState,
  onStartWorkflowCommand,
  onPersistLegacyPrepRun,
  setSequenceAnimaticErrorByKey,
}: {
  model: SequenceAnimaticViewModel | null
  scopeSceneId: string | null
  scopeNodeId: string | null
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onStartWorkflowCommand: (request: SceneBoardWorkflowCommandRequest) => Promise<SequenceAnimaticSceneBoardWorkflowCommandResponse> | SequenceAnimaticSceneBoardWorkflowCommandResponse
  onPersistLegacyPrepRun: (request: SceneBoardPrepPersistRequest) => Promise<{ masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }> | { masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [prepRun, setPrepRun] = useState<SequenceAnimaticSceneBoardPrepRunState | null>(null)

  const persistedPrepRun = useMemo(() => {
    if (!model || !scopeSceneId) return null
    const runKey = sequenceAnimaticSceneBoardPrepRunKey({
      masterRequestId: model.request.id,
      sceneId: scopeSceneId,
      scopeNodeId: trimOptionalString(scopeNodeId) || 'all',
    })
    return sequenceAnimaticSceneBoardPrepRunForScope({
      request: model.request,
      runKey,
    })
  }, [model, scopeNodeId, scopeSceneId])

  useEffect(() => {
    if (!persistedPrepRun) return
    setPrepRun((current) => {
      if (current?.runId === persistedPrepRun.runId && current.updatedAt >= persistedPrepRun.updatedAt) return current
      return persistedPrepRun
    })
  }, [persistedPrepRun])

  useEffect(() => {
    if (!model || !prepRun) return undefined
    if (prepRun.stage === 'complete' || prepRun.stage === 'failed') return undefined
    let cancelled = false
    const intervalId = window.setInterval(() => {
      if (cancelled) return
      void Promise.resolve(loadAndStoreSequenceAnimaticState({
        masterRequestId: model.request.id,
        knownRevision: null,
      })).catch((error) => {
        if (!cancelled && !isTransientRequestError(error)) {
          console.warn('[GraphCore] Scene Board prep fallback refresh failed.', error)
        } else if (!cancelled && import.meta.env.DEV && import.meta.env.VITE_GRAPHCORE_OUTPUT_MONITOR_DEBUG === 'true') {
          console.info('[GraphCore] Scene Board prep fallback refresh skipped after transient failure.', error)
        }
      })
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadAndStoreSequenceAnimaticState, model, prepRun])

  const prepareContinuity = useCallback(async (
    targetModel: SequenceAnimaticViewModel,
    scene: SequenceAnimaticSceneView,
    targetScopeNodeId?: string | null,
    options: { forceRefresh?: boolean } = {},
  ) => {
    const runKey = sequenceAnimaticSceneBoardPrepRunKey({
      masterRequestId: targetModel.request.id,
      sceneId: scene.id,
      scopeNodeId: trimOptionalString(targetScopeNodeId) || 'all',
    })
    const existingPrepRun = prepRun?.runKey === runKey ? prepRun : null
    const prepRunId = existingPrepRun?.runId ?? crypto.randomUUID()
    let prepShotIds: string[] = []
    let lastPrepRunState: SequenceAnimaticSceneBoardPrepRunState | null = existingPrepRun
    const startedAt = Date.now()
    const updatePrepRun = (patch: Partial<SequenceAnimaticSceneBoardPrepRunState>) => {
      const next: SequenceAnimaticSceneBoardPrepRunState = {
        runKey,
        runId: prepRunId,
        sceneId: scene.id,
        setId: null,
        zoneId: null,
        scopeNodeId: trimOptionalString(targetScopeNodeId) || null,
        activeUnitId: null,
        activeUnitLabel: scene.title,
        stage: 'set_refs',
        stageLabel: 'Checking set refs',
        message: options.forceRefresh ? 'Regenerating selected zone top-down.' : 'Preparing selected board.',
        queued: 0,
        running: 0,
        ready: 0,
        failed: 0,
        activeReferenceNodeIds: [],
        activeCoverageShotIds: [],
        activeRequestIds: [],
        activeRunIds: [],
        activeRunStepKey: '',
        startedAt,
        updatedAt: Date.now(),
        error: '',
        ...(lastPrepRunState?.runKey === runKey ? lastPrepRunState : {}),
        ...patch,
      }
      lastPrepRunState = next
      setPrepRun((current) => ({
        ...(current?.runKey === runKey ? current : next),
        ...next,
      }))
    }
    if (busyRunKeys.has(runKey)) {
      updatePrepRun({
        activeUnitId: null,
        activeUnitLabel: scene.title,
        stage: 'set_refs',
        stageLabel: 'Preparing selected board',
        message: 'Selected board prep is already running.',
      })
      return
    }
    beginRun(runKey)
    try {
      if (scene.status !== 'ready') {
        throw new Error('Generate this scene before preparing continuity.')
      }
      const board = buildSequenceAnimaticSceneBoardView({
        model: targetModel,
        scene,
        scopeNodeId: targetScopeNodeId,
        filter: 'all',
        grouping: 'zone_spot',
      })
      if (board.shots.length === 0) {
        throw new Error('No shots match this Scene Board scope.')
      }
      prepShotIds = board.shots.map((tile) => tile.id).filter(Boolean)
      const activeUnit = board.prepUnits.find((unit) => unit.scopeNodeId === targetScopeNodeId || unit.zoneId === targetScopeNodeId || unit.setId === targetScopeNodeId)
        ?? board.prepUnits[0]
        ?? null
      updatePrepRun({
        setId: activeUnit?.setId || null,
        zoneId: activeUnit?.zoneId || null,
        activeUnitId: activeUnit?.id ?? null,
        activeUnitLabel: activeUnit?.title ?? scene.title,
        stage: options.forceRefresh ? 'scaffold_refs' : 'set_refs',
        stageLabel: options.forceRefresh ? 'Starting top-down regeneration' : 'Starting graph prep',
        message: options.forceRefresh
          ? 'Starting graph-native selected zone regeneration.'
          : 'Starting graph-native selected board prep.',
        queued: board.prepStages.reduce((total, stage) => total + stage.missing, 0),
        running: 0,
        ready: board.prepStages.reduce((total, stage) => total + stage.ready, 0),
        failed: board.prepStages.reduce((total, stage) => total + stage.failed, 0),
        activeReferenceNodeIds: activeUnit?.referenceTiles.filter((tile) => tile.running).map((tile) => tile.nodeId) ?? [],
        activeCoverageShotIds: prepShotIds,
        activeRequestIds: [],
        activeRunIds: [],
        activeRunStepKey: 'scope_input',
      })
      const result = await Promise.resolve(onStartWorkflowCommand({
        masterRequestId: targetModel.request.id,
        sceneId: scene.id,
        action: options.forceRefresh ? 'regenerate_zone_top_down' : 'prepare_selected_board',
        setId: activeUnit?.setId || null,
        zoneId: activeUnit?.zoneId || null,
        scopeNodeId: trimOptionalString(targetScopeNodeId) || null,
        shotIds: prepShotIds,
        forceRefresh: options.forceRefresh ?? false,
      }))
      if (result.prepRun) {
        setPrepRun({
          ...result.prepRun,
          startedAt: Date.parse(result.prepRun.startedAt || '') || Date.now(),
          updatedAt: Date.parse(result.prepRun.updatedAt || '') || Date.now(),
        } as SequenceAnimaticSceneBoardPrepRunState)
      }
      await loadAndStoreSequenceAnimaticState({ masterRequestId: targetModel.request.id, knownRevision: null })
    } catch (error) {
      const sequenceKey = targetModel.request.selectedSequenceUnitKeys[0] ?? targetModel.request.id
      const message = error instanceof Error ? error.message : String(error)
      updatePrepRun({
        stage: 'failed',
        stageLabel: 'Failed',
        message,
        error: message,
      })
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: message,
      }))
    } finally {
      endRun(runKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onStartWorkflowCommand,
    prepRun,
    setSequenceAnimaticErrorByKey,
  ])

  const cancelPrep = useCallback((run: SequenceAnimaticSceneBoardPrepRunState) => {
    const next: SequenceAnimaticSceneBoardPrepRunState = {
      ...run,
      stage: 'failed',
      stageLabel: 'Stopped',
      message: 'Auto-advance stopped. Already queued workflows can still finish and hydrate the board.',
      running: 0,
      activeReferenceNodeIds: [],
      activeCoverageShotIds: [],
      activeRequestIds: [],
      activeRunIds: [],
      activeRunStepKey: '',
      updatedAt: Date.now(),
      error: '',
    }
    setPrepRun(next)
    void Promise.resolve(onPersistLegacyPrepRun({
      masterRequestId: model?.request.id ?? run.runKey.split(':')[0] ?? '',
      runId: run.runId,
      runKey: run.runKey,
      sceneId: run.sceneId,
      setId: run.setId,
      zoneId: run.zoneId,
      scopeNodeId: run.scopeNodeId,
      stage: 'cancelled',
      status: 'cancelled',
      activeUnitId: run.activeUnitId,
      activeUnitLabel: run.activeUnitLabel,
      stageLabel: 'Stopped',
      message: next.message,
      queued: run.queued,
      running: 0,
      ready: run.ready,
      failed: run.failed,
      activeRequestIds: [],
      activeRunIds: [],
      activeReferenceNodeIds: [],
      activeCoverageShotIds: [],
      activeRunStepKey: '',
      action: 'cancel',
    })).catch((error) => {
      console.warn('[GraphCore] Failed to persist Scene Board prep cancellation.', error)
    })
  }, [model?.request.id, onPersistLegacyPrepRun])

  return {
    prepRun,
    setPrepRun,
    persistedPrepRun,
    prepareContinuity,
    cancelPrep,
  }
}
