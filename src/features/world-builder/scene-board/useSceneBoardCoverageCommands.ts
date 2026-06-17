import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
  SequenceAnimaticZoneCoverageBoardEnsureResponse,
} from '../../../domain/outputWorkflow'
import {
  sequenceAnimaticZoneCoverageBoardForceNodeKeys,
  sequenceAnimaticZoneCoverageBoardTargetNodeKeys,
} from '../../../domain/sequenceAnimaticNodeKeys'
import {
  buildSequenceAnimaticSceneBoardView,
  sequenceAnimaticSceneBoardCoverageReferencesReady,
  sequenceAnimaticSceneBoardReferenceReady,
  sequenceAnimaticSceneBoardReferenceRequiredForCoverage,
  sequenceAnimaticSceneBoardShotSnapshot,
  sequenceAnimaticSceneBoardZoneScopeForNode,
  type SequenceAnimaticSceneView,
  type SequenceAnimaticViewModel,
} from './sceneBoardProjection'

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readLooseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])
const ACTIVE_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function requestProjectionTerminal(request: OutputRequest | null) {
  const metadata = readLooseRecord(request?.metadata)
  const projection = readLooseRecord(metadata.statusProjection ?? metadata.status_projection)
  const status = trimOptionalString(projection.status)
  return status === 'succeeded' || status === 'complete' || status === 'failed' || status === 'cancelled'
}

function requestIsActive(request: OutputRequest | null, run?: OutputWorkflowRun | null) {
  if (!request) return false
  if (run && !TERMINAL_RUN_STATUSES.has(run.status)) return true
  if (run?.status === 'failed' || run?.status === 'cancelled') return false
  if (requestProjectionTerminal(request)) return false
  return ACTIVE_REQUEST_STATUSES.has(request.status)
}

type StartOutputWorkflowRun = (request: {
  workflowId: string
  prompt: string
  targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
  selectedEntityKeys?: string[]
  selectedSequenceUnitKeys?: string[]
  pageCount?: number
  input?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) => Promise<{ run: OutputWorkflowRun }> | { run: OutputWorkflowRun }

type EnsureZoneCoverageBoards = (request: {
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  shotIds?: string[]
  scopedShots?: Record<string, unknown>[]
  forceRefresh?: boolean
}) => Promise<SequenceAnimaticZoneCoverageBoardEnsureResponse> | SequenceAnimaticZoneCoverageBoardEnsureResponse

export function useSceneBoardCoverageCommands({
  outputWorkflowRuns,
  busyRunKeys,
  beginRun,
  endRun,
  loadAndStoreSequenceAnimaticState,
  onEnsureZoneCoverageBoards,
  onStartOutputWorkflowRun,
  setSequenceAnimaticErrorByKey,
}: {
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureZoneCoverageBoards: EnsureZoneCoverageBoards
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const startZoneCoverageBoardRuns = useCallback(async (
    model: SequenceAnimaticViewModel,
    scene: SequenceAnimaticSceneView,
    scope: { setId?: string | null; zoneId?: string | null; scopeNodeId?: string | null; shotIds?: string[]; scopedShots?: Record<string, unknown>[] },
    options: { forceRefresh?: boolean } = {},
  ) => {
    const boardEnsureResult = await Promise.resolve(onEnsureZoneCoverageBoards({
      masterRequestId: model.request.id,
      sceneId: scene.id,
      setId: trimOptionalString(scope.setId) || null,
      zoneId: trimOptionalString(scope.zoneId) || null,
      shotIds: scope.shotIds ?? [],
      scopedShots: scope.scopedShots ?? [],
      forceRefresh: options.forceRefresh ?? false,
    }))
    const boardRuns = boardEnsureResult.boardRequests
      .map((request) => {
        const workflowId = request.workflowId || boardEnsureResult.workflows.find((workflow) => workflow.id === request.workflowId)?.id || ''
        return workflowId ? { workflowId, request } : null
      })
      .filter((entry): entry is { workflowId: string; request: OutputRequest } => Boolean(entry))
    if (boardRuns.length === 0) {
      throw new Error('Zone camera grid workflows could not be prepared for this scene.')
    }
    let startedOrActiveCount = 0
    for (const { workflowId, request } of boardRuns) {
      const existingRun = request.latestRunId
        ? outputWorkflowRuns.find((run) => run.id === request.latestRunId) ?? null
        : outputWorkflowRuns.find((run) => run.workflowId === workflowId) ?? null
      if (requestIsActive(request, existingRun)) {
        startedOrActiveCount += 1
        continue
      }
      await Promise.resolve(onStartOutputWorkflowRun({
        workflowId,
        prompt: request.prompt || request.title || `Regenerate zone camera grid for ${scene.title}.`,
        targetFormat: 'image',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          ...readLooseRecord(existingRun?.input),
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
        },
        metadata: {
          runIntent: 'generate_keyframes',
          runMode: 'sequence_animatic_zone_coverage_board',
          runScope: 'upstream_to_node',
          targetNodeKeys: [...sequenceAnimaticZoneCoverageBoardTargetNodeKeys],
          forceNodeKeys: [...sequenceAnimaticZoneCoverageBoardForceNodeKeys],
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: true,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
          sourceRunId: existingRun?.id ?? request.latestRunId ?? model.request.latestRunId,
          parentRequestId: request.parentRequestId ?? model.request.id,
          masterRequestId: model.request.id,
          sequenceAnimaticRole: 'zone_coverage_board',
          sceneId: scene.id,
          scopeNodeId: trimOptionalString(scope.scopeNodeId) || trimOptionalString(scope.zoneId) || trimOptionalString(scope.setId) || null,
          scopeSetId: trimOptionalString(scope.setId) || null,
          scopeZoneId: trimOptionalString(scope.zoneId) || null,
        },
      }))
      startedOrActiveCount += 1
    }
    return startedOrActiveCount
  }, [onEnsureZoneCoverageBoards, onStartOutputWorkflowRun, outputWorkflowRuns])

  const regenerateSceneCoverageAnchors = useCallback(async (
    model: SequenceAnimaticViewModel,
    scene: SequenceAnimaticSceneView,
    scopeNodeId?: string | null,
  ) => {
    const scopeKey = trimOptionalString(scopeNodeId) || 'all'
    const runKey = `${model.request.id}:${scene.id}:${scopeKey}:coverage_anchors`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    try {
      if (scene.status !== 'ready') {
        throw new Error('Generate this scene before regenerating camera coverage grids.')
      }
      const board = buildSequenceAnimaticSceneBoardView({ model, scene, scopeNodeId })
      const blockedUnits = board.prepUnits.filter((unit) => (
        unit.coverageGridShotCount > 0
        && !sequenceAnimaticSceneBoardCoverageReferencesReady(unit.referenceTiles)
      ))
      if (blockedUnits.length > 0) {
        const missingRefs = blockedUnits
          .flatMap((unit) => unit.referenceTiles.filter((tile) => (
            sequenceAnimaticSceneBoardReferenceRequiredForCoverage(tile)
            && !sequenceAnimaticSceneBoardReferenceReady(tile)
          )))
        const missingLabel = missingRefs
          .slice(0, 4)
          .map((tile) => tile.label || tile.nodeId)
          .join(', ')
        throw new Error(missingLabel
          ? `Prepare Selected Board first. Missing required continuity refs: ${missingLabel}.`
          : 'Prepare Selected Board first. Required set, zone, and spot continuity refs are not ready.')
      }
      const sceneShots = board.shots.filter((tile) => !tile.shot.isProvisional)
      if (sceneShots.length === 0) {
        throw new Error('This scene has no finalized shots yet.')
      }
      await startZoneCoverageBoardRuns(model, scene, {
        ...sequenceAnimaticSceneBoardZoneScopeForNode(model, scopeNodeId),
        scopeNodeId,
        shotIds: sceneShots.map((tile) => tile.shot.id).filter(Boolean),
        scopedShots: sceneShots.map((tile) => sequenceAnimaticSceneBoardShotSnapshot(tile, scene)),
      }, { forceRefresh: true })
      await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
    } catch (error) {
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      endRun(runKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    setSequenceAnimaticErrorByKey,
    startZoneCoverageBoardRuns,
  ])

  return {
    regenerateSceneCoverageAnchors,
    startZoneCoverageBoardRuns,
  }
}
