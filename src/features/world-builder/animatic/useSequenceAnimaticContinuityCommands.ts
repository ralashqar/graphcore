import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
  SequenceAnimaticContinuityAssetWorkflowEnsureResponse,
  SequenceAnimaticKeyframeWorkflowEnsureResponse,
} from '../../../domain/outputWorkflow'
import {
  sequenceAnimaticContinuityAssetForceNodeKeys,
  sequenceAnimaticContinuityAssetTargetNodeKeys,
  sequenceAnimaticContinuityBatchForceNodeKeys,
  sequenceAnimaticContinuityBatchTargetNodeKeys,
  sequenceAnimaticCoverageAnchorForceNodeKeys,
  sequenceAnimaticCoverageAnchorTargetNodeKeys,
} from '../../../domain/sequenceAnimaticNodeKeys'
import type {
  SequenceAnimaticContinuityAssetRunGroup,
  SequenceAnimaticContinuityAssetTargetView,
  SequenceAnimaticCoverageAnchorView,
  SequenceAnimaticViewModel,
} from '../scene-board/sceneBoardProjection'
import {
  readLooseArray,
  readLooseRecord,
  sequenceAnimaticRequestIsActive,
  trimOptionalString,
  type StartOutputWorkflowRun,
} from './sequenceAnimaticCommandHelpers'
import {
  continuityAssetRunGroups,
  planSequenceAnimaticContinuityCommand,
} from './sequenceAnimaticContinuityCommandPlanner'

type ContinuityCommandViewModel = SequenceAnimaticViewModel & {
  continuityRequest?: OutputRequest | null
  directorPlanReady?: boolean
}

type CoverageAnchorCommandView = SequenceAnimaticCoverageAnchorView & {
  title?: string
  characterRefIds?: string[]
  shotIds?: string[]
}

type EnsureContinuityAssetWorkflow = (request: {
  masterRequestId: string
  continuityRequestId?: string | null
  nodeId: string
  nodeIds?: string[]
  batchKind?: SequenceAnimaticContinuityAssetRunGroup['batchKind']
  mode?: 'generate' | 'regenerate'
}) => Promise<SequenceAnimaticContinuityAssetWorkflowEnsureResponse> | SequenceAnimaticContinuityAssetWorkflowEnsureResponse

type EnsureKeyframeWorkflows = (request: {
  masterRequestId: string
  mode?: 'generate' | 'regenerate'
  shotIds?: string[]
  coverageSetupIds?: string[]
  allowProvisional?: boolean
}) => Promise<SequenceAnimaticKeyframeWorkflowEnsureResponse> | SequenceAnimaticKeyframeWorkflowEnsureResponse

function coverageAnchorDependencyTargets(
  model: ContinuityCommandViewModel,
  anchor: CoverageAnchorCommandView,
) {
  const spotIds = readLooseArray(anchor.spotIds).map(trimOptionalString).filter(Boolean)
  const characterRefIds = readLooseArray(anchor.characterRefIds).map(trimOptionalString).filter(Boolean)
  const shotIds = readLooseArray(anchor.shotIds).map(trimOptionalString).filter(Boolean)
  const dependencyNodeIds = new Set([
    anchor.setId,
    anchor.zoneId,
    anchor.primarySpotId,
    ...spotIds,
    anchor.viewpointId,
    ...characterRefIds,
  ].map(trimOptionalString).filter(Boolean))
  return model.continuityAssetTargets.filter((target) => (
    dependencyNodeIds.has(target.nodeId)
    || target.shotIds.some((shotId) => shotIds.includes(shotId))
  ))
}

export function useSequenceAnimaticContinuityCommands({
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
}: {
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  previewModel: ContinuityCommandViewModel | null
  modelByRequestId: ReadonlyMap<string, ContinuityCommandViewModel>
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureSequenceAnimaticContinuityAssetWorkflow: EnsureContinuityAssetWorkflow
  onEnsureSequenceAnimaticKeyframeWorkflows: EnsureKeyframeWorkflows
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [pendingContinuityAssets, setPendingContinuityAssets] = useState<{
    masterRequestId: string
    nodeIds: string[]
    previousAssetKeys: Record<string, string>
    forceRefresh: boolean
    startedAt: number
  } | null>(null)
  const [pendingCoverageAnchor, setPendingCoverageAnchor] = useState<{
    masterRequestId: string
    anchorId: string
    mode: 'generate' | 'regenerate'
    startedAt: number
  } | null>(null)

  const startContinuityAssetRunGroups = useCallback(async (
    model: ContinuityCommandViewModel,
    runGroups: readonly SequenceAnimaticContinuityAssetRunGroup[],
    options: { forceRefresh?: boolean; coverageSetupId?: string | null } = {},
  ) => {
    let startedCount = 0
    for (const group of runGroups) {
      const target = group.targets[0]
      if (!target) continue
      const targetNodeIds = group.targets.map((entry) => entry.nodeId)
      const targetNames = group.targets.map((entry) => entry.name).filter(Boolean)
      const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticContinuityAssetWorkflow({
        masterRequestId: model.request.id,
        continuityRequestId: model.continuityRequest?.id ?? null,
        nodeId: target.nodeId,
        nodeIds: group.isBatch ? targetNodeIds : undefined,
        batchKind: group.batchKind,
        mode: options.forceRefresh || group.targets.some((entry) => entry.status === 'stale' || entry.status === 'ready') ? 'regenerate' : 'generate',
      }))
      const lifecycleDiagnostics = ensureResult.commandLifecycle.diagnostics.filter(Boolean)
      if (ensureResult.status === 'blocked' || ensureResult.status === 'failed') {
        throw new Error(lifecycleDiagnostics.join(' ') || `Continuity asset command ${ensureResult.status}.`)
      }
      if (ensureResult.status === 'already_ready' && !ensureResult.runnableRequest && !ensureResult.assetRequest) {
        continue
      }
      const assetRequest = ensureResult.runnableRequest ?? ensureResult.assetRequest
      if (!assetRequest?.workflowId) {
        if (options.forceRefresh) {
          throw new Error(lifecycleDiagnostics.join(' ') || `Regenerate did not create a runnable continuity asset workflow for ${target.name || target.nodeId}. Refresh the animatic state and try again.`)
        }
        continue
      }
      const existingRun = assetRequest.latestRunId
        ? outputWorkflowRuns.find((run) => run.id === assetRequest.latestRunId) ?? null
        : outputWorkflowRuns.find((run) => run.workflowId === assetRequest.workflowId) ?? null
      if (sequenceAnimaticRequestIsActive(assetRequest, existingRun)) {
        startedCount += 1
        continue
      }
      const requestMetadata = readLooseRecord(assetRequest.metadata)
      const requestRole = trimOptionalString(requestMetadata.screenplayAnimaticRole ?? requestMetadata.sequenceAnimaticRole)
      const isBatchRun = group.isBatch || requestRole === 'continuity_asset_batch'
      await Promise.resolve(onStartOutputWorkflowRun({
        workflowId: assetRequest.workflowId,
        prompt: assetRequest.prompt || (isBatchRun
          ? `Generate continuity asset grid for ${targetNames.join(', ')}.`
          : `Generate continuity asset for ${target.name}.`),
        targetFormat: 'image',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          ...readLooseRecord(existingRun?.input),
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
        },
        metadata: {
          runIntent: 'generate_continuity_asset',
          runMode: isBatchRun ? 'sequence_animatic_continuity_asset_batch' : 'sequence_animatic_continuity_asset',
          runScope: 'upstream_to_node',
          targetNodeKeys: isBatchRun
            ? [...sequenceAnimaticContinuityBatchTargetNodeKeys]
            : [...sequenceAnimaticContinuityAssetTargetNodeKeys],
          forceNodeKeys: isBatchRun
            ? [...sequenceAnimaticContinuityBatchForceNodeKeys]
            : [...sequenceAnimaticContinuityAssetForceNodeKeys],
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: true,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
          sourceRunId: existingRun?.id ?? assetRequest.latestRunId ?? model.continuityRequest?.latestRunId ?? model.request.latestRunId,
          parentRequestId: assetRequest.parentRequestId ?? model.continuityRequest?.id ?? model.request.id,
          masterRequestId: model.request.id,
          sequenceAnimaticRole: isBatchRun ? 'continuity_asset_batch' : 'continuity_asset',
          continuityRequestId: model.continuityRequest?.id ?? null,
          targetNodeId: target.nodeId,
          targetNodeIds,
          coverageSetupId: trimOptionalString(options.coverageSetupId) || null,
          continuityBatchId: trimOptionalString(requestMetadata.continuityBatchId) || null,
        },
      }))
      startedCount += 1
    }
    return startedCount
  }, [onEnsureSequenceAnimaticContinuityAssetWorkflow, onStartOutputWorkflowRun, outputWorkflowRuns])

  const runContinuityAssets = useCallback(async (
    model: ContinuityCommandViewModel,
    requestedTargets?: readonly SequenceAnimaticContinuityAssetTargetView[],
    options: { batchKind?: SequenceAnimaticContinuityAssetRunGroup['batchKind']; forceRefresh?: boolean } = {},
  ) => {
    const runKey = `${model.request.id}:continuity_assets`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    try {
      if (model.continuityGraphView.nodes.length === 0 || model.continuityAssetTargets.length === 0) {
        throw new Error('Generate the shot continuity plan first.')
      }
      const targets = (requestedTargets && requestedTargets.length > 0 ? [...requestedTargets] : model.continuityAssetTargets)
        .filter((target) => options.forceRefresh
          ? target.status !== 'generating'
          : target.status === 'missing' || target.status === 'stale' || target.status === 'failed')
      if (targets.length === 0) {
        await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
        return
      }
      const plan = planSequenceAnimaticContinuityCommand({
        model,
        action: options.forceRefresh ? 'regenerate_node' : options.batchKind === 'spot_camera_grid' ? 'generate_camera_grid' : requestedTargets?.length ? 'generate_node' : 'generate_missing',
        targets,
        batchKind: options.batchKind,
      })
      if (plan.status !== 'ready') {
        throw new Error(plan.diagnostics.join(' ') || 'No continuity asset workflows could start.')
      }
      setPendingContinuityAssets({
        masterRequestId: model.request.id,
        nodeIds: plan.targets.map((target) => target.nodeId),
        previousAssetKeys: Object.fromEntries(plan.targets.map((target) => [target.nodeId, trimOptionalString(target.assetKey)])),
        forceRefresh: plan.forceRefresh,
        startedAt: Date.now(),
      })
      const startedCount = await startContinuityAssetRunGroups(model, plan.runGroups, { forceRefresh: plan.forceRefresh })
      if (startedCount === 0) {
        setPendingContinuityAssets(null)
        throw new Error(options.forceRefresh
          ? 'Regenerate did not start any continuity asset workflows. Refresh the animatic state and try again.'
          : 'No continuity asset workflows needed to start after refreshing the animatic state.')
      }
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
  }, [beginRun, busyRunKeys, endRun, loadAndStoreSequenceAnimaticState, setSequenceAnimaticErrorByKey, startContinuityAssetRunGroups])

  useEffect(() => {
    if (!pendingContinuityAssets || busyRunKeys.size > 0) return undefined
    const model = previewModel?.request.id === pendingContinuityAssets.masterRequestId
      ? previewModel
      : modelByRequestId.get(pendingContinuityAssets.masterRequestId) ?? null
    if (!model) return undefined
    if (Date.now() - pendingContinuityAssets.startedAt > 20 * 60 * 1000) {
      setPendingContinuityAssets(null)
      return undefined
    }
    const targetByNodeId = new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
    const targets = pendingContinuityAssets.nodeIds
      .map((nodeId) => targetByNodeId.get(nodeId) ?? null)
      .filter((target): target is SequenceAnimaticContinuityAssetTargetView => Boolean(target))
    if (targets.length === 0) {
      setPendingContinuityAssets(null)
      return undefined
    }
    const allSettled = targets.every((target) => target.status !== 'generating')
    const allReadyWithUrls = targets.every((target) => target.status === 'ready' && Boolean(target.assetKey && target.assetUrl))
    const regeneratedTargetsReady = pendingContinuityAssets.forceRefresh
      ? targets.every((target) => {
        const previousAssetKey = pendingContinuityAssets.previousAssetKeys[target.nodeId] ?? ''
        return target.status === 'ready'
          && Boolean(target.assetKey && target.assetUrl)
          && (!previousAssetKey || target.assetKey !== previousAssetKey)
      })
      : allReadyWithUrls
    if (regeneratedTargetsReady) {
      setPendingContinuityAssets(null)
      return undefined
    }
    const failed = allSettled && targets.some((target) => target.status === 'failed')
    if (failed) {
      setPendingContinuityAssets(null)
      return undefined
    }
    const timeoutId = window.setTimeout(() => {
      void loadAndStoreSequenceAnimaticState({ masterRequestId: pendingContinuityAssets.masterRequestId, knownRevision: null })
        .finally(() => {
          setPendingContinuityAssets((current) => (
            current?.masterRequestId === pendingContinuityAssets.masterRequestId
              ? { ...current }
              : current
          ))
        })
    }, targets.some((target) => target.status === 'generating') ? 2000 : 1000)
    return () => window.clearTimeout(timeoutId)
  }, [
    busyRunKeys,
    loadAndStoreSequenceAnimaticState,
    modelByRequestId,
    pendingContinuityAssets,
    previewModel,
  ])

  const runCoverageAnchor = useCallback(async (
    model: ContinuityCommandViewModel,
    anchor: CoverageAnchorCommandView,
    mode: 'generate' | 'regenerate' = 'generate',
  ) => {
    const runKey = `${model.request.id}:${anchor.id}:coverage_anchor`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    let keepPending = true
    setPendingCoverageAnchor((current) => (
      current?.masterRequestId === model.request.id && current.anchorId === anchor.id && current.mode === mode
        ? current
        : {
            masterRequestId: model.request.id,
            anchorId: anchor.id,
            mode,
            startedAt: Date.now(),
          }
    ))
    try {
      if (!model.directorPlanReady || !anchor.id) {
        throw new Error('Generate the shot continuity plan first.')
      }
      if (mode === 'generate' && anchor.status === 'ready') {
        keepPending = false
        return
      }
      const dependencyTargets = coverageAnchorDependencyTargets(model, anchor)
      const runningDependencyTargets = dependencyTargets.filter((target) => target.status === 'generating')
      if (runningDependencyTargets.length > 0) {
        await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
        return
      }
      const unresolvedTargets = dependencyTargets.filter((target) => ['missing', 'stale', 'failed'].includes(target.status))
      if (unresolvedTargets.length > 0) {
        await startContinuityAssetRunGroups(model, continuityAssetRunGroups(model, unresolvedTargets), { coverageSetupId: anchor.id })
        await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
        return
      }

      const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticKeyframeWorkflows({
        masterRequestId: model.request.id,
        mode,
        coverageSetupIds: [anchor.id],
      }))
      let startedAnchor = false
      for (const request of ensureResult.childRequests) {
        const metadata = readLooseRecord(request.metadata)
        const role = trimOptionalString(metadata.screenplayAnimaticRole ?? metadata.sequenceAnimaticRole)
        const coverageSetupId = trimOptionalString(metadata.coverageSetupId)
        if (role !== 'coverage_anchor' || coverageSetupId !== anchor.id || !request.workflowId) continue
        const existingRun = request.latestRunId
          ? outputWorkflowRuns.find((run) => run.id === request.latestRunId) ?? null
          : outputWorkflowRuns.find((run) => run.workflowId === request.workflowId) ?? null
        if (sequenceAnimaticRequestIsActive(request, existingRun)) continue
        await Promise.resolve(onStartOutputWorkflowRun({
          workflowId: request.workflowId,
          prompt: request.prompt || request.title || `Generate coverage anchor for ${anchor.title || anchor.id}.`,
          targetFormat: 'image',
          selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
          input: {
            ...readLooseRecord(existingRun?.input),
            debugSkipVideoGeneration: false,
            cinematicVideoApproved: false,
          },
          metadata: {
            runIntent: 'generate_keyframes',
            runMode: 'sequence_animatic_coverage_anchor',
            runScope: 'upstream_to_node',
            targetNodeKeys: [...sequenceAnimaticCoverageAnchorTargetNodeKeys],
            forceNodeKeys: [...sequenceAnimaticCoverageAnchorForceNodeKeys],
            reuseExistingUpstreamOutputs: true,
            allowStaleUpstreamOutputs: true,
            debugSkipVideoGeneration: false,
            cinematicVideoApproved: false,
            sourceRunId: existingRun?.id ?? request.latestRunId ?? model.request.latestRunId,
            parentRequestId: request.parentRequestId ?? model.request.id,
            masterRequestId: model.request.id,
            sequenceAnimaticRole: 'coverage_anchor',
            coverageSetupId: anchor.id,
          },
        }))
        startedAnchor = true
      }
      keepPending = false
      if (!startedAnchor && anchor.status === 'ready' && mode === 'generate') return
      await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
    } catch (error) {
      keepPending = false
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      if (!keepPending) setPendingCoverageAnchor(null)
      endRun(runKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticKeyframeWorkflows,
    onStartOutputWorkflowRun,
    outputWorkflowRuns,
    setSequenceAnimaticErrorByKey,
    startContinuityAssetRunGroups,
  ])

  useEffect(() => {
    if (!pendingCoverageAnchor || busyRunKeys.size > 0) return undefined
    const model = previewModel?.request.id === pendingCoverageAnchor.masterRequestId
      ? previewModel
      : modelByRequestId.get(pendingCoverageAnchor.masterRequestId) ?? null
    if (!model) return undefined
    const anchor = model.coverageAnchors.find((entry) => entry.id === pendingCoverageAnchor.anchorId) as CoverageAnchorCommandView | null
    if (!anchor) {
      setPendingCoverageAnchor(null)
      return undefined
    }
    if (pendingCoverageAnchor.mode === 'generate' && anchor.status === 'ready') {
      setPendingCoverageAnchor(null)
      return undefined
    }
    if (anchor.running) return undefined
    if (Date.now() - pendingCoverageAnchor.startedAt > 20 * 60 * 1000) {
      setPendingCoverageAnchor(null)
      return undefined
    }
    const dependencyTargets = coverageAnchorDependencyTargets(model, anchor)
    const hasPendingDependencies = dependencyTargets.some((target) => (
      target.status === 'generating'
      || target.status === 'missing'
      || target.status === 'stale'
      || target.status === 'failed'
    ))
    const timeoutId = window.setTimeout(() => {
      void runCoverageAnchor(model, anchor, pendingCoverageAnchor.mode)
    }, hasPendingDependencies ? 1500 : 500)
    return () => window.clearTimeout(timeoutId)
  }, [
    busyRunKeys,
    modelByRequestId,
    pendingCoverageAnchor,
    previewModel,
    runCoverageAnchor,
  ])

  return {
    pendingCoverageAnchor,
    runContinuityAssets,
    runCoverageAnchor,
  }
}
