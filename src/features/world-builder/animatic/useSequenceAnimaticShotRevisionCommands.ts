import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'
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

type EnsureSequenceAnimaticBlockWorkflows = (request: {
  masterRequestId: string
  sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
  blockRequestId?: string
  storyboardBlockId?: string
  shotId?: string
  panelAssetKey?: string
}) => Promise<{ childRequests: OutputRequest[] }> | { childRequests: OutputRequest[] }

type EnsureSequenceAnimaticShotRevisionWorkflow = (request: {
  masterRequestId: string
  storyboardBlockId: string
  shotId: string
  prompt: string
}) => Promise<{ revisionRequest: OutputRequest | null }> | { revisionRequest: OutputRequest | null }

type ShotRevisionPromptState = {
  masterRequestId: string
  storyboardBlockId: string
  shotId: string
  shotTitle: string
  prompt: string
  status: 'idle' | 'rewriting' | 'generating' | 'saving' | 'failed'
  error: string | null
}

function shotRevisionRunKey(masterRequestId: string, blockId: string, shotId: string) {
  return `${masterRequestId}:${blockId}:${shotId}:shot_revision`
}

export function useSequenceAnimaticShotRevisionCommands({
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
}: {
  outputWorkflowRuns: readonly OutputWorkflowRun[]
  busyRunKeys: ReadonlySet<string>
  beginRun: (runKey: string) => void
  endRun: (runKey: string) => void
  loadAndStoreSequenceAnimaticState: (request: { masterRequestId: string; knownRevision: string | null }) => Promise<unknown>
  onEnsureSequenceAnimaticBlockWorkflows: EnsureSequenceAnimaticBlockWorkflows
  onEnsureSequenceAnimaticShotRevisionWorkflow: EnsureSequenceAnimaticShotRevisionWorkflow
  onStartOutputWorkflowRun: StartOutputWorkflowRun
  pollSequenceAnimaticOutputRequest: (requestId: string) => Promise<unknown>
  setSequenceAnimaticErrorByKey: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const [shotPrompt, setShotPrompt] = useState<ShotRevisionPromptState | null>(null)
  const [shotPromptDraftByKey, setShotPromptDraftByKey] = useState<Record<string, string>>({})

  const setShotPromptDraft = useCallback((runKey: string, prompt: string) => {
    setShotPromptDraftByKey((previous) => ({ ...previous, [runKey]: prompt }))
    setShotPrompt((current) => {
      if (!current) return current
      const currentRunKey = shotRevisionRunKey(current.masterRequestId, current.storyboardBlockId, current.shotId)
      return currentRunKey === runKey
        ? { ...current, prompt, status: 'idle', error: null }
        : current
    })
  }, [])

  const runShotRevision = useCallback(async (
    model: SequenceAnimaticViewModel,
    block: SequenceAnimaticBlockView,
    shot: SequenceAnimaticShotView,
    prompt: string,
  ) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setShotPrompt({
        masterRequestId: model.request.id,
        storyboardBlockId: block.id,
        shotId: shot.id,
        shotTitle: shot.title,
        prompt,
        status: 'failed',
        error: 'Describe the shot change first.',
      })
      return
    }
    const runKey = shotRevisionRunKey(model.request.id, block.id, shot.id)
    if (busyRunKeys.has(runKey)) return
    beginRun(runKey)
    setShotPrompt({
      masterRequestId: model.request.id,
      storyboardBlockId: block.id,
      shotId: shot.id,
      shotTitle: shot.title,
      prompt: cleanPrompt,
      status: 'rewriting',
      error: null,
    })
    try {
      let targetBlock = block
      if (!targetBlock.childRequestId) {
        const ensureBlocks = await Promise.resolve(onEnsureSequenceAnimaticBlockWorkflows({ masterRequestId: model.request.id }))
        const ensuredBlock = ensureBlocks.childRequests.find((request) => trimOptionalString(readLooseRecord(request.metadata).storyboardBlockId) === block.id) ?? null
        targetBlock = {
          ...targetBlock,
          childRequestId: ensuredBlock?.id ?? targetBlock.childRequestId,
          childWorkflowId: ensuredBlock?.workflowId ?? targetBlock.childWorkflowId,
        }
      }
      if (!targetBlock.childRequestId) throw new Error('Storyboard block workflow is not ready yet.')
      if (!shot.panelUrl) throw new Error('Generate/extract the storyboard panel before revising this shot.')
      const ensureResult = await Promise.resolve(onEnsureSequenceAnimaticShotRevisionWorkflow({
        masterRequestId: model.request.id,
        storyboardBlockId: block.id,
        shotId: shot.id,
        prompt: cleanPrompt,
      }))
      const revisionRequest = ensureResult.revisionRequest
      if (!revisionRequest?.workflowId) throw new Error('Shot revision workflow is not ready yet.')
      setShotPrompt((current) => current ? { ...current, status: 'generating', error: null } : current)
      const existingRun = revisionRequest.latestRunId
        ? outputWorkflowRuns.find((run) => run.id === revisionRequest.latestRunId) ?? null
        : outputWorkflowRuns.find((run) => run.workflowId === revisionRequest.workflowId) ?? null
      await Promise.resolve(onStartOutputWorkflowRun({
        workflowId: revisionRequest.workflowId,
        prompt: cleanPrompt,
        targetFormat: 'image',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          ...readLooseRecord(existingRun?.input),
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
        },
        metadata: {
          runIntent: 'revise_sequence_animatic_shot',
          runMode: 'sequence_animatic_shot_revision',
          runScope: 'upstream_to_node',
          targetNodeKeys: ['shot_revision_artifact'],
          forceNodeKeys: ['shot_revision_plan', 'shot_keyframe_prompt', 'shot_keyframe_image', 'shot_revision_artifact'],
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: true,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: false,
          sourceRunId: existingRun?.id ?? revisionRequest.latestRunId ?? null,
          parentRequestId: targetBlock.childRequestId,
          masterRequestId: model.request.id,
          sequenceAnimaticRole: 'shot_revision',
          storyboardBlockId: block.id,
          shotId: shot.id,
        },
      }))
      setShotPrompt((current) => current ? { ...current, status: 'saving', error: null } : current)
      await pollSequenceAnimaticOutputRequest(revisionRequest.id)
      await loadAndStoreSequenceAnimaticState({ masterRequestId: model.request.id, knownRevision: null })
      setShotPromptDraftByKey((previous) => {
        if (!previous[runKey]) return previous
        const next = { ...previous }
        delete next[runKey]
        return next
      })
      setShotPrompt(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setShotPrompt((current) => current ? { ...current, status: 'failed', error: message } : current)
      const sequenceKey = model.request.selectedSequenceUnitKeys[0] ?? model.request.id
      setSequenceAnimaticErrorByKey((previous) => ({ ...previous, [sequenceKey]: message }))
    } finally {
      endRun(runKey)
    }
  }, [
    beginRun,
    busyRunKeys,
    endRun,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticBlockWorkflows,
    onEnsureSequenceAnimaticShotRevisionWorkflow,
    onStartOutputWorkflowRun,
    outputWorkflowRuns,
    pollSequenceAnimaticOutputRequest,
    setSequenceAnimaticErrorByKey,
  ])

  return {
    shotPrompt,
    shotPromptDraftByKey,
    setShotPromptDraft,
    runShotRevision,
  }
}
