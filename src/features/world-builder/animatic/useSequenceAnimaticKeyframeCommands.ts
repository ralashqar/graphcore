import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
  SequenceAnimaticKeyframeWorkflowEnsureResponse,
} from '../../../domain/outputWorkflow'
import {
  sequenceAnimaticContinuityAssetForceNodeKeys,
  sequenceAnimaticContinuityAssetTargetNodeKeys,
  sequenceAnimaticContinuityBatchForceNodeKeys,
  sequenceAnimaticContinuityBatchTargetNodeKeys,
  sequenceAnimaticCoverageAnchorForceNodeKeys,
  sequenceAnimaticCoverageAnchorTargetNodeKeys,
  sequenceAnimaticPlannedKeyframeForceNodeKeys,
  sequenceAnimaticPlannedKeyframeTargetNodeKeys,
  sequenceAnimaticShotProductionKeyframeForceNodeKeys,
  sequenceAnimaticShotProductionKeyframeTargetNodeKeys,
} from '../../../domain/sequenceAnimaticNodeKeys'
import type {
  SequenceAnimaticBlockView,
  SequenceAnimaticContinuityAssetTargetView,
  SequenceAnimaticShotView,
  SequenceAnimaticViewModel,
} from '../scene-board/sceneBoardProjection'
import {
  readLooseArray,
  readLooseRecord,
  sequenceAnimaticRequestIsActive,
  trimOptionalString,
  type StartOutputWorkflowRun,
} from './sequenceAnimaticCommandHelpers'
import { planSequenceAnimaticContinuityCommand } from './sequenceAnimaticContinuityCommandPlanner'

function shotCanGenerateEarlyKeyframe(shot: SequenceAnimaticShotView) {
  return Boolean(shot.spatialBindingView?.hierarchy?.length)
}

function shotKeyframeDependencyTargets(model: SequenceAnimaticViewModel, shot: SequenceAnimaticShotView) {
  const coverageAnchor = shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
  const spatialNodeIds = new Set((shot.spatialBindingView?.hierarchy ?? []).map((node) => node.id).filter(Boolean))
  const references = readLooseArray(shot.references).map(readLooseRecord)
  const referenceNodeIds = new Set(
    [
      ...references.map((reference) => trimOptionalString(reference.entityKey)),
      coverageAnchor?.setId,
      coverageAnchor?.zoneId,
      coverageAnchor?.primarySpotId,
      ...(coverageAnchor?.spotIds ?? []),
      coverageAnchor?.viewpointId,
    ].filter(Boolean),
  )
  return model.continuityAssetTargets.filter((target) => (
    target.shotIds.includes(shot.id)
    || spatialNodeIds.has(target.nodeId)
    || referenceNodeIds.has(target.nodeId)
  ))
}

type EnsureKeyframeWorkflows = (request: {
  masterRequestId: string
  mode?: 'generate' | 'regenerate'
  shotIds?: string[]
  coverageSetupIds?: string[]
  allowProvisional?: boolean
}) => Promise<SequenceAnimaticKeyframeWorkflowEnsureResponse> | SequenceAnimaticKeyframeWorkflowEnsureResponse

export function useSequenceAnimaticKeyframeCommands({
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
}: {
  outputRequests: readonly OutputRequest[]
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  previewModel: SequenceAnimaticViewModel | null
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureSequenceAnimaticKeyframeWorkflows: EnsureKeyframeWorkflows
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [pendingShotKeyframe, setPendingShotKeyframe] = useState<{
    masterRequestId: string
    blockId: string
    shotId: string
    mode: 'generate' | 'regenerate'
    startedAt: number
  } | null>(null)

  const startKeyframeRequestRun = useCallback(async (
    model: SequenceAnimaticViewModel,
    request: OutputRequest,
    kind: 'coverage_anchor' | 'shot_keyframe' | 'shot_production',
    fallbackStoryboardBlockId?: string | null,
  ) => {
    if (!request.workflowId) return false
    const existingRun = request.latestRunId
      ? outputWorkflowRuns.find((run) => run.id === request.latestRunId) ?? null
      : outputWorkflowRuns.find((run) => run.workflowId === request.workflowId) ?? null
    if (sequenceAnimaticRequestIsActive(request, existingRun)) return false
    const metadata = readLooseRecord(request.metadata)
    const isShotProduction = kind === 'shot_production'
    await Promise.resolve(onStartOutputWorkflowRun({
      workflowId: request.workflowId,
      prompt: request.prompt || request.title || (kind === 'coverage_anchor' ? 'Generate coverage anchor.' : 'Generate shot keyframe.'),
      targetFormat: 'image',
      selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
      input: {
        ...readLooseRecord(existingRun?.input),
        debugSkipVideoGeneration: false,
        cinematicVideoApproved: false,
      },
      metadata: {
        runIntent: 'generate_keyframes',
        runMode: kind === 'coverage_anchor'
          ? 'sequence_animatic_coverage_anchor'
          : isShotProduction ? 'sequence_animatic_shot_production_keyframe' : 'sequence_animatic_shot_keyframe',
        runScope: 'upstream_to_node',
        targetNodeKeys: kind === 'coverage_anchor'
          ? [...sequenceAnimaticCoverageAnchorTargetNodeKeys]
          : isShotProduction ? [...sequenceAnimaticShotProductionKeyframeTargetNodeKeys] : [...sequenceAnimaticPlannedKeyframeTargetNodeKeys],
        forceNodeKeys: kind === 'coverage_anchor'
          ? [...sequenceAnimaticCoverageAnchorForceNodeKeys]
          : isShotProduction ? [...sequenceAnimaticShotProductionKeyframeForceNodeKeys] : [...sequenceAnimaticPlannedKeyframeForceNodeKeys],
        reuseExistingUpstreamOutputs: true,
        allowStaleUpstreamOutputs: true,
        debugSkipVideoGeneration: false,
        cinematicVideoApproved: false,
        sourceRunId: existingRun?.id ?? request.latestRunId ?? model.request.latestRunId,
        parentRequestId: request.parentRequestId ?? model.request.id,
        masterRequestId: model.request.id,
        sequenceAnimaticRole: kind,
        coverageSetupId: trimOptionalString(metadata.coverageSetupId) || null,
        shotId: trimOptionalString(metadata.shotId) || null,
        storyboardBlockId: trimOptionalString(metadata.storyboardBlockId) || trimOptionalString(fallbackStoryboardBlockId) || null,
      },
    }))
    return true
  }, [onStartOutputWorkflowRun, outputWorkflowRuns])

  const startContinuityRequestRun = useCallback(async (
    model: SequenceAnimaticViewModel,
    request: OutputRequest,
    options: { shotId?: string | null; storyboardBlockId?: string | null } = {},
  ) => {
    if (!request.workflowId) return false
    const existingRun = request.latestRunId
      ? outputWorkflowRuns.find((run) => run.id === request.latestRunId) ?? null
      : outputWorkflowRuns.find((run) => run.workflowId === request.workflowId) ?? null
    if (sequenceAnimaticRequestIsActive(request, existingRun)) return false
    const metadata = readLooseRecord(request.metadata)
    const role = trimOptionalString(metadata.screenplayAnimaticRole ?? metadata.sequenceAnimaticRole)
    const isBatchRun = role === 'continuity_asset_batch'
    await Promise.resolve(onStartOutputWorkflowRun({
      workflowId: request.workflowId,
      prompt: request.prompt || request.title || (isBatchRun ? 'Generate continuity asset grid.' : 'Generate continuity asset.'),
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
        sourceRunId: existingRun?.id ?? request.latestRunId ?? model.request.latestRunId,
        parentRequestId: request.parentRequestId ?? model.request.id,
        masterRequestId: model.request.id,
        sequenceAnimaticRole: role,
        targetNodeId: trimOptionalString(metadata.targetNodeId) || null,
        targetNodeIds: readLooseArray(metadata.targetNodeIds).map(trimOptionalString).filter(Boolean),
        continuityBatchId: trimOptionalString(metadata.continuityBatchId) || null,
        shotId: trimOptionalString(options.shotId) || null,
        storyboardBlockId: trimOptionalString(options.storyboardBlockId) || null,
      },
    }))
    return true
  }, [onStartOutputWorkflowRun, outputWorkflowRuns])

  const requestForNextAction = useCallback((
    ensureResult: SequenceAnimaticKeyframeWorkflowEnsureResponse,
    requestId: string,
  ) => [
    ...ensureResult.continuityAssetRequests,
    ...ensureResult.coverageAnchorRequests,
    ...ensureResult.shotKeyframeRequests,
    ...ensureResult.childRequests,
  ].find((request) => request.id === requestId) ?? null, [])

  const runKeyframes = useCallback(async (
    model: SequenceAnimaticViewModel,
    mode: 'generate' | 'regenerate' = 'generate',
  ) => {
    const runKey = `${model.request.id}:keyframes`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    try {
      if (!model.directorPlanReady || model.blocks.every((block) => block.shots.length === 0)) {
        throw new Error('Generate the shot continuity plan first.')
      }
      let startedAny = false
      const shots = model.blocks.flatMap((block) => block.shots.map((shot) => ({ block, shot })))
      for (const { shot } of shots) {
        if (mode === 'generate' && (shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready')) continue
        if (shot.keyframeRunning || shot.keyframeDependencyRunning) continue
        const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticKeyframeWorkflows({
          masterRequestId: model.request.id,
          mode,
          shotIds: [shot.id],
          coverageSetupIds: shot.coverageSetupId ? [shot.coverageSetupId] : undefined,
          allowProvisional: shot.isProvisional && shotCanGenerateEarlyKeyframe(shot),
        }))
        const nextAction = readLooseRecord(ensureResult.nextAction)
        const nextKind = trimOptionalString(nextAction.kind)
        if (nextKind === 'keyframe_ready') continue
        if (nextKind === 'blocked') continue
        const nextRequestId = trimOptionalString(nextAction.requestId)
        const nextRequest = requestForNextAction(ensureResult, nextRequestId)
        if (!nextRequest) continue
        if (nextKind === 'run_continuity_asset') startedAny = (await startContinuityRequestRun(model, nextRequest)) || startedAny
        else if (nextKind === 'run_coverage_anchor') startedAny = (await startKeyframeRequestRun(model, nextRequest, 'coverage_anchor')) || startedAny
        else if (nextKind === 'run_shot_production_keyframe') startedAny = (await startKeyframeRequestRun(model, nextRequest, 'shot_production')) || startedAny
      }
      if (!startedAny) throw new Error('No keyframe work could start yet. Existing dependency work may still be running; refresh and retry shortly.')
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
    onEnsureSequenceAnimaticKeyframeWorkflows,
    requestForNextAction,
    setSequenceAnimaticErrorByKey,
    startContinuityRequestRun,
    startKeyframeRequestRun,
  ])

  const runShotKeyframe = useCallback(async (
    model: SequenceAnimaticViewModel,
    block: SequenceAnimaticBlockView,
    shot: SequenceAnimaticShotView,
    mode: 'generate' | 'regenerate' = 'generate',
  ) => {
    const runKey = `${model.request.id}:${block.id}:${shot.id}:keyframe`
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    let keepPending = true
    setPendingShotKeyframe({
      masterRequestId: model.request.id,
      blockId: block.id,
      shotId: shot.id,
      mode,
      startedAt: Date.now(),
    })
    try {
      const allowProvisional = shot.isProvisional && shotCanGenerateEarlyKeyframe(shot)
      if (!model.directorPlanReady && !allowProvisional) {
        throw new Error(shot.isProvisional ? 'Shot binding is not ready for early keyframe generation yet.' : 'Generate the shot continuity plan first.')
      }
      if (mode === 'generate' && (shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready')) {
        keepPending = false
        return
      }

      const dependencyTargets = shotKeyframeDependencyTargets(model, shot)
      const dependencyPlan = planSequenceAnimaticContinuityCommand({
        model,
        action: mode === 'regenerate' ? 'regenerate_node' : 'generate_missing',
        targets: dependencyTargets,
      })
      if (dependencyPlan.status === 'blocked') {
        throw new Error(dependencyPlan.diagnostics.join(' ') || 'Shot keyframe continuity dependencies are blocked.')
      }
      const runningDependencyTargets = dependencyTargets.filter((target: SequenceAnimaticContinuityAssetTargetView) => target.status === 'generating')
      if (runningDependencyTargets.length > 0) {
        await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
        return
      }

      const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticKeyframeWorkflows({
        masterRequestId: model.request.id,
        mode,
        shotIds: [shot.id],
        coverageSetupIds: shot.coverageSetupId ? [shot.coverageSetupId] : undefined,
        allowProvisional,
      }))
      let startedKeyframeWork = false
      const nextAction = readLooseRecord(ensureResult.nextAction)
      const nextKind = trimOptionalString(nextAction.kind)
      const nextRequestId = trimOptionalString(nextAction.requestId)
      if (!nextKind) {
        throw new Error('Shot keyframe preparation returned no next action.')
      } else if (nextKind === 'keyframe_ready') {
        keepPending = false
      } else if (nextKind === 'blocked') {
        throw new Error(trimOptionalString(nextAction.reason) || 'Shot keyframe generation is blocked.')
      } else {
        let nextRequest = requestForNextAction(ensureResult, nextRequestId)
        if (!nextRequest && nextKind === 'run_shot_production_keyframe') {
          const cachedShotGraphIsCurrent = Boolean(
            shot.keyframeRequestId
            && shot.keyframeWorkflowId
            && shot.keyframeDependencyMode === 'single_node_chain'
            && shot.keyframeGraphPolicyVersion === 'primary_chain_v8_zone_spatial_refs',
          )
          nextRequest = cachedShotGraphIsCurrent
            ? outputRequests.find((request) => request.id === shot.keyframeRequestId && request.workflowId === shot.keyframeWorkflowId) ?? null
            : null
        }
        if (nextKind === 'run_continuity_asset' && nextRequest) {
          startedKeyframeWork = (await startContinuityRequestRun(model, nextRequest, { shotId: shot.id, storyboardBlockId: block.id })) || startedKeyframeWork
        } else if (nextKind === 'run_coverage_anchor' && nextRequest) {
          startedKeyframeWork = (await startKeyframeRequestRun(model, nextRequest, 'coverage_anchor', block.id)) || startedKeyframeWork
        } else if (nextKind === 'run_shot_production_keyframe' && nextRequest) {
          startedKeyframeWork = (await startKeyframeRequestRun(model, nextRequest, 'shot_production', block.id)) || startedKeyframeWork
        }
      }
      if (!startedKeyframeWork && shot.keyframeStatusLabel === 'Keyframe ready') {
        keepPending = false
      }
      await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
    } catch (error) {
      keepPending = false
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceKey]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      if (!keepPending) setPendingShotKeyframe(null)
      endRun(runKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticKeyframeWorkflows,
    outputRequests,
    requestForNextAction,
    setSequenceAnimaticErrorByKey,
    startContinuityRequestRun,
    startKeyframeRequestRun,
  ])

  useEffect(() => {
    if (!pendingShotKeyframe || busyRunKeys.size > 0 || !previewModel) return undefined
    if (previewModel.request.id !== pendingShotKeyframe.masterRequestId) return undefined
    const block = previewModel.blocks.find((entry) => entry.id === pendingShotKeyframe.blockId) ?? null
    const shot = block?.shots.find((entry) => entry.id === pendingShotKeyframe.shotId) ?? null
    if (!block || !shot) {
      setPendingShotKeyframe(null)
      return undefined
    }
    if (shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready') {
      setPendingShotKeyframe(null)
      return undefined
    }
    if (shot.keyframeRunning || shot.keyframeDependencyRunning) return undefined
    if (Date.now() - pendingShotKeyframe.startedAt > 20 * 60 * 1000) {
      setPendingShotKeyframe(null)
      return undefined
    }
    const timeoutId = window.setTimeout(() => {
      void runShotKeyframe(previewModel, block, shot, pendingShotKeyframe.mode)
    }, 500)
    return () => window.clearTimeout(timeoutId)
  }, [busyRunKeys, pendingShotKeyframe, previewModel, runShotKeyframe])

  return {
    pendingShotKeyframe,
    runKeyframes,
    runShotKeyframe,
  }
}
