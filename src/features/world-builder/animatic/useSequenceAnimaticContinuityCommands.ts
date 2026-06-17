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

function continuityAssetRunGroups(
  model: ContinuityCommandViewModel,
  targets: readonly SequenceAnimaticContinuityAssetTargetView[],
): SequenceAnimaticContinuityAssetRunGroup[] {
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const targetByNodeId = new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const unresolved = targets.filter((target) => ['missing', 'stale', 'failed'].includes(target.status))
  const missingParentIds = new Set<string>()
  for (const target of unresolved) {
    const parentId = trimOptionalString(graphNodeById.get(target.nodeId)?.parentId)
    const parentTarget = parentId ? targetByNodeId.get(parentId) ?? null : null
    if (parentTarget && ['missing', 'stale', 'failed'].includes(parentTarget.status)) missingParentIds.add(parentId)
  }
  const consumedNodeIds = new Set<string>()
  const scaffoldGroups: SequenceAnimaticContinuityAssetRunGroup[] = []
  for (const parentId of missingParentIds) {
    const parentTarget = unresolved.find((target) => target.nodeId === parentId) ?? null
    if (!parentTarget) continue
    const childTargets = unresolved
      .filter((target) => trimOptionalString(graphNodeById.get(target.nodeId)?.parentId) === parentId)
      .filter((target) => {
        const node = graphNodeById.get(target.nodeId) ?? null
        const kind = node?.kind
        return kind === 'zone' || kind === 'spot' || kind === 'viewpoint' || kind === 'angle' || target.assetKind.includes('spot') || target.assetKind.includes('viewpoint') || target.assetKind.includes('angle')
      })
      .slice(0, 8)
    if (childTargets.length === 0) continue
    const groupTargets = [parentTarget, ...childTargets]
    groupTargets.forEach((target) => consumedNodeIds.add(target.nodeId))
    scaffoldGroups.push({ targets: groupTargets, isBatch: true })
  }
  const eligible = unresolved.filter((target) => !consumedNodeIds.has(target.nodeId))
  const grouped = new Map<string, SequenceAnimaticContinuityAssetTargetView[]>()
  const singles: SequenceAnimaticContinuityAssetRunGroup[] = []
  for (const target of eligible) {
    const node = graphNodeById.get(target.nodeId) ?? null
    const kind = node?.kind
    const isSpot = kind === 'spot' || target.assetKind.includes('spot')
    const isViewpoint = kind === 'viewpoint' || kind === 'angle' || target.assetKind.includes('angle') || target.assetKind.includes('viewpoint')
    if (!isSpot && !isViewpoint) {
      singles.push({ targets: [target], isBatch: false })
      continue
    }
    const parentId = trimOptionalString(node?.parentId)
    if (!parentId) {
      singles.push({ targets: [target], isBatch: false })
      continue
    }
    const key = `${isSpot ? 'spot_grid' : 'viewpoint_grid'}:${parentId}`
    grouped.set(key, [...(grouped.get(key) ?? []), target])
  }
  const batched = [...grouped.values()].flatMap((group) => {
    if (group.length <= 1) return group.map((target) => ({ targets: [target], isBatch: false }))
    const chunks: SequenceAnimaticContinuityAssetRunGroup[] = []
    for (let index = 0; index < group.length; index += 9) {
      const chunk = group.slice(index, index + 9)
      chunks.push({ targets: chunk, isBatch: chunk.length > 1 })
    }
    return chunks
  })
  return [...scaffoldGroups, ...batched, ...singles]
}

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
      const assetRequest = ensureResult.assetRequest
      if (!assetRequest?.workflowId) continue
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
  ) => {
    const runKey = `${model.request.id}:continuity_assets`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    try {
      if (model.continuityGraphView.nodes.length === 0 || model.continuityAssetTargets.length === 0) {
        throw new Error('Generate the shot continuity plan first.')
      }
      const targets = (requestedTargets && requestedTargets.length > 0 ? [...requestedTargets] : model.continuityAssetTargets)
        .filter((target) => target.status === 'missing' || target.status === 'stale' || target.status === 'failed')
      if (targets.length === 0) {
        await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
        return
      }
      await startContinuityAssetRunGroups(model, continuityAssetRunGroups(model, targets))
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
