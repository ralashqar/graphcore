import type { ReactNode } from 'react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../domain/assets'
import { aiGenerationSettings } from '../../config/aiGenerationSettings'
import {
  estimateFalMediaCost,
  estimateMuapiMediaCost,
  aiUsageLineSchema,
  aiUsageSummarySchema,
  formatAiUsd,
  summarizeAiUsageLines,
} from '../../domain/aiUsage'
import { buildCinematicV2TimelineProjection, type CinematicTimelineProjection } from '../../domain/cinematicTimelineProjection'
import type { CinematicTimelineShotClip } from '../../domain/cinematicTimelineProjection'
import type {
  CinematicDirectorNotePreviewResponse,
  CinematicDirectorNoteScope,
  CinematicDirectorPatchApplyResponse,
  CinematicDirectorPatchPreview,
} from '../../domain/cinematicDirectorNotes'
import { cinematicDirectorPatchPreviewSchema } from '../../domain/cinematicDirectorNotes'
import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowNodeUpdateResponse,
  type OutputWorkflowPlanResponse,
  type OutputWorkflowRun,
  type OutputWorkflowRunScope,
  type OutputWorkflowRunStep,
  type OutputWorkflowRunStatusResponse,
  type OutputWorkflowStartResponse,
  type OutputWorkflowUpgradeResponse,
  type OutputRequest,
  type OutputRequestStatusResponse,
  type OutputArtifact,
} from '../../domain/outputWorkflow'
import { OutputWorkflowGraphOverlay } from './OutputWorkflowGraphOverlay'
import { CinematicTimelinePlayer } from '../cinematics/CinematicTimelinePlayer'
import { deriveSequenceOutputStatuses, type SequenceOutputStatus } from './outputSequenceStatus'
import {
  useOutputWorkspaceState,
  type OutputImageFormatChoice,
  type OutputImageQualityChoice,
} from './useOutputWorkspaceState'

type OutputsWorkspaceProps = {
  snapshot: ProjectSnapshot
  canRunOutputs: boolean
  cinematicsPanel: ReactNode
  openIntent?: {
    requestId: string | null
    target?: 'details' | 'graph' | 'timeline'
    nonce: number
    returnToSourceOnClose?: boolean
  } | null
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    imageQuality?: 'low' | 'medium' | 'high'
    imageOutputFormat?: 'png' | 'jpeg' | 'webp'
    cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
    cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration' | 'v3_script_storyboards'
    cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
    debugSkipVideoGeneration?: boolean
  }) => Promise<OutputRequestStatusResponse>
  onGetOutputRequestStatus: (requestId: string) => Promise<OutputRequestStatusResponse>
  onCancelOutputRequest: (requestId: string) => Promise<OutputRequestStatusResponse>
  onRequestDeleteOutputRequest: (requestId: string) => void
  onLoadOutputInbox: () => Promise<void>
  onLoadOutputWorkflowGraph: (workflowId: string, runId?: string | null, selectedNodeKey?: string | null) => Promise<void>
  onSubscribeOutputWorkflowGraphSignals: (input: {
    draftId: string
    workflowId: string
    runId?: string | null
    onSignal: () => void
  }) => { unsubscribe(): Promise<unknown> | void }
  onPlanOutputWorkflow: (request: {
    prompt: string
    preset?: 'ebook_from_world' | 'story_bible_from_world' | 'comic_issue_from_sequence'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    imageQuality?: 'low' | 'medium' | 'high'
    imageOutputFormat?: 'png' | 'jpeg' | 'webp'
  }) => Promise<OutputWorkflowPlanResponse>
  onStartOutputWorkflow: (plan: OutputWorkflowPlanResponse['plan']) => Promise<OutputWorkflowStartResponse>
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<OutputWorkflowRunStatusResponse>
  onPreviewCinematicDirectorNote: (request: {
    workflowId: string
    runId?: string | null
    note: string
    scope: CinematicDirectorNoteScope
  }) => Promise<CinematicDirectorNotePreviewResponse>
  onApplyCinematicDirectorPatch: (request: {
    workflowId: string
    runId?: string | null
    preview: CinematicDirectorPatchPreview
    startRegeneration: boolean
  }) => Promise<CinematicDirectorPatchApplyResponse>
  onGetOutputWorkflowStatus: (runId: string) => Promise<OutputWorkflowRunStatusResponse>
  onCancelOutputWorkflowRun: (runId: string) => Promise<unknown>
  onUpdateOutputWorkflowNode: (request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
  }) => Promise<OutputWorkflowNodeUpdateResponse>
  onUpgradeOutputWorkflowPreset: (request: {
    workflowId: string
    preset?: 'ebook_from_world'
  }) => Promise<OutputWorkflowUpgradeResponse>
  onRefreshLiveSnapshot: () => Promise<void>
  onReturnToSourceSurface?: () => void
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function sequenceStateLabel(status: SequenceOutputStatus['cinematicState'] | SequenceOutputStatus['comicState']) {
  if (status === 'none') return 'No output'
  if (status === 'in_progress') return 'In progress'
  if (status === 'animatic_ready') return 'Animatic ready'
  if (status === 'video_ready') return 'Video ready'
  if (status === 'comic_ready') return 'Comic ready'
  return 'Failed'
}

function sequenceOrdinalLabel(sequence: ProjectSnapshot['worldEntities'][number], fallbackIndex: number) {
  const sequenceData = readRecord(sequence.customProperties?.sequence)
  const ordinal = readNumber(sequenceData.ordinal)
  return ordinal ? `Chapter ${ordinal}` : `Unit ${fallbackIndex + 1}`
}

const DEFAULT_OUTPUT_REQUEST_PROMPT = 'Make a poster image from this world using the main characters and strongest location.'

type OutputPromptComposerProps = {
  busy: boolean
  canRunOutputs: boolean
  error: string | null
  requestImageQuality: OutputImageQualityChoice
  requestImageOutputFormat: OutputImageFormatChoice
  onImageQualityChange: (value: OutputImageQualityChoice) => void
  onImageOutputFormatChange: (value: OutputImageFormatChoice) => void
  onSubmit: (prompt: string) => void
}

const OutputPromptComposer = memo(function OutputPromptComposer({
  busy,
  canRunOutputs,
  error,
  requestImageQuality,
  requestImageOutputFormat,
  onImageQualityChange,
  onImageOutputFormatChange,
  onSubmit,
}: OutputPromptComposerProps) {
  const [draftPrompt, setDraftPrompt] = useState(DEFAULT_OUTPUT_REQUEST_PROMPT)

  return (
    <>
      <label className="outputs-input-block">
        <span>Output request</span>
        <textarea
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
          rows={5}
          aria-label="Prompt an output from this world"
          placeholder="Make a poster of Ilya and Anya at the checkpoint..."
        />
        <small>Independent cinematic prompts bind named characters and locations only. Chapter or scene wording binds story-source units.</small>
      </label>
      <div className="outputs-example-strip" aria-label="Example output prompts">
        {[
          'Poster image of two characters at the checkpoint',
          'Create a cinematic where Mara performs in The Archive',
          'Create a cinematic for first chapter',
        ].map((example) => (
          <button key={example} type="button" onClick={() => setDraftPrompt(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="outputs-composer-options">
        <label>
          <span>Image quality</span>
          <select
            aria-label="Image generation quality"
            value={requestImageQuality}
            onChange={(event) => onImageQualityChange(event.target.value as OutputImageQualityChoice)}
          >
            <option value="preset">Preset default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          <span>Image format</span>
          <select
            aria-label="Image generation output format"
            value={requestImageOutputFormat}
            onChange={(event) => onImageOutputFormatChange(event.target.value as OutputImageFormatChoice)}
          >
            <option value="preset">Preset default</option>
            <option value="webp">WebP</option>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
        <small>Preset default uses low for character concept art, medium for posters/comics/covers, and WebP output.</small>
      </div>
      <div className="outputs-composer-submit-row">
        <button
          className="outputs-primary-action"
          disabled={!canRunOutputs || busy}
          onClick={() => onSubmit(draftPrompt)}
          type="button"
        >
          {busy ? 'Creating output...' : 'Generate output'}
        </button>
        {!canRunOutputs ? <p className="outputs-error">Output workflows require a live Supabase-backed draft.</p> : null}
        {error ? <p className="outputs-error">{error}</p> : null}
      </div>
    </>
  )
})

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNonEmptyRecord(value: unknown) {
  const record = readRecord(value)
  return Object.keys(record).length > 0 ? record : null
}

function readFirstStepRecord(run: OutputWorkflowRun | null | undefined, keys: string[]) {
  for (const step of run?.steps ?? []) {
    const outputs = readRecord(step.outputs)
    for (const key of keys) {
      const record = readNonEmptyRecord(outputs[key])
      if (record) return record
    }
  }
  return null
}

function readAllStepRecords(run: OutputWorkflowRun | null | undefined, keys: string[]) {
  const records: Record<string, unknown>[] = []
  for (const step of run?.steps ?? []) {
    const outputs = readRecord(step.outputs)
    for (const key of keys) {
      const value = outputs[key]
      if (Array.isArray(value)) {
        records.push(...value.map(readRecord).filter((entry) => Object.keys(entry).length > 0))
        continue
      }
      const record = readNonEmptyRecord(value)
      if (record) records.push(record)
    }
  }
  return records
}

function readArtifactMediaRecords(run: OutputWorkflowRun | null | undefined, roles: string[]) {
  const roleSet = new Set(roles)
  const records: Record<string, unknown>[] = []
  for (const artifact of run?.artifacts ?? []) {
    const metadata = readRecord(artifact.metadata)
    const role = readTrimmedString(metadata.role)
    if (!roleSet.has(role)) continue
    records.push({
      id: artifact.id,
      artifactKey: artifact.key,
      assetKey: artifact.assetKey,
      mimeType: artifact.mimeType,
      role,
      shotId: readTrimmedString(metadata.shotId),
      shotIndex: metadata.shotIndex,
      storyboardGroupId: readTrimmedString(metadata.storyboardGroupId),
      panelIndexInGroup: metadata.panelIndexInGroup,
      sourceSheetAssetKey: readTrimmedString(metadata.sourceSheetAssetKey),
      storagePath: readTrimmedString(metadata.storagePath),
      cropRect: metadata.cropRect ?? metadata.crop,
      metadata,
    })
  }
  return records
}

function mergeMediaRecords(primary: Record<string, unknown>[], fallback: Record<string, unknown>[]) {
  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []
  for (const record of [...primary, ...fallback]) {
    const key = readTrimmedString(record.assetKey)
      || readTrimmedString(record.artifactKey)
      || `${readTrimmedString(record.role)}:${readTrimmedString(record.shotId)}:${readTrimmedString(record.id)}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(record)
  }
  return merged
}

function formatScriptSeconds(value: unknown) {
  const seconds = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(seconds)) return '0s'
  return `${Number(seconds.toFixed(2))}s`
}

function cinematicArray(value: unknown) {
  return Array.isArray(value) ? value.map(readRecord).filter((entry) => Object.keys(entry).length > 0) : []
}

function buildCinematicScriptViewData(
  workflow: { preset?: string; metadata?: Record<string, unknown> } | null,
  run: OutputWorkflowRun | null | undefined,
) {
  const workflowMetadata = readRecord(workflow?.metadata)
  const directorScriptDoc = readNonEmptyRecord(workflowMetadata.directorScriptDoc)
    ?? readFirstStepRecord(run, ['directorScriptDoc', 'script'])
  const executionScriptDoc = readNonEmptyRecord(workflowMetadata.cinematicScriptDoc)
    ?? readFirstStepRecord(run, ['cinematicScriptDoc', 'executionScriptDoc', 'scriptDoc'])
  const compiledCinematicSequence = readNonEmptyRecord(workflowMetadata.compiledCinematicSequence)
    ?? readFirstStepRecord(run, ['compiledCinematicSequence'])
  const cinematicV2ParsedScript = readNonEmptyRecord(workflowMetadata.cinematicV2ParsedScript)
    ?? readFirstStepRecord(run, ['parsedScript', 'parsed_script'])
  const cinematicV2SceneState = readNonEmptyRecord(workflowMetadata.cinematicV2SceneState)
    ?? readFirstStepRecord(run, ['sceneState', 'scene_state'])
  const cinematicV2LayoutPlan = readNonEmptyRecord(workflowMetadata.cinematicV2LayoutPlan)
    ?? readFirstStepRecord(run, ['layoutPlan', 'layout_plan'])
  const cinematicV2ShotPlan = readNonEmptyRecord(workflowMetadata.cinematicV2ShotPlan)
    ?? readFirstStepRecord(run, ['shotPlan', 'shot_plan'])
  const cinematicV2StoryboardGroupPlan = readNonEmptyRecord(workflowMetadata.cinematicV2StoryboardGroupPlan)
    ?? readFirstStepRecord(run, ['storyboardGroupPlan', 'storyboard_group_plan'])
  const cinematicV2Panels = mergeMediaRecords(
    readArtifactMediaRecords(run, ['cinematic_v2_storyboard_panel', 'cinematic_v3_storyboard_panel']),
    readAllStepRecords(run, ['panels']).filter((panel) => ['cinematic_v2_storyboard_panel', 'cinematic_v3_storyboard_panel'].includes(readTrimmedString(panel.role)) || readTrimmedString(panel.shotId)),
  )
  const cinematicV2ArtifactImages = readArtifactMediaRecords(run, ['cinematic_v2_storyboard_sheet', 'cinematic_v2_shot_keyframe', 'cinematic_v3_storyboard_sheet'])
  const cinematicV2Images = mergeMediaRecords(
    cinematicV2ArtifactImages,
    readAllStepRecords(run, ['image']).filter((image) => readTrimmedString(image.role).startsWith('cinematic_v2_') || readTrimmedString(image.role).startsWith('cinematic_v3_')),
  )
  const cinematicV2ArtifactVideos = readArtifactMediaRecords(run, ['cinematic_v2_shot_video', 'cinematic_v2_final_timeline', 'cinematic_v3_storyboard_group_video', 'cinematic_v3_final_timeline'])
  const cinematicV2Videos = mergeMediaRecords(
    cinematicV2ArtifactVideos,
    readAllStepRecords(run, ['video']).filter((video) => readTrimmedString(video.role).startsWith('cinematic_v2_') || readTrimmedString(video.role).startsWith('cinematic_v3_')),
  )
  const cinematicV2Timeline = readFirstStepRecord(run, ['timeline'])
  const preset = readTrimmedString(workflow?.preset)
  const isV2 = readTrimmedString(workflowMetadata.cinematicPipelineVersion) === 'v2_shot_orchestration'
    || readTrimmedString(workflowMetadata.cinematicPipelineVersion) === 'v3_script_storyboards'
    || Boolean(cinematicV2ParsedScript || cinematicV2SceneState || cinematicV2LayoutPlan || cinematicV2ShotPlan)
  const isCinematic = preset.includes('cinematic') || preset.includes('ugc') || Boolean(directorScriptDoc || executionScriptDoc || compiledCinematicSequence || isV2)
  return {
    isCinematic,
    isV2,
    directorScriptDoc,
    executionScriptDoc,
    compiledCinematicSequence,
    cinematicV2: {
      parsedScript: cinematicV2ParsedScript,
      sceneState: cinematicV2SceneState,
      layoutPlan: cinematicV2LayoutPlan,
      shotPlan: cinematicV2ShotPlan,
      storyboardGroupPlan: cinematicV2StoryboardGroupPlan,
      panels: cinematicV2Panels,
      keyframes: cinematicV2Images.filter((image) => readTrimmedString(image.role) === 'cinematic_v2_shot_keyframe'),
      storyboardSheets: cinematicV2Images.filter((image) => ['cinematic_v2_storyboard_sheet', 'cinematic_v3_storyboard_sheet'].includes(readTrimmedString(image.role))),
      videos: cinematicV2Videos.filter((video) => ['cinematic_v2_shot_video', 'cinematic_v3_storyboard_group_video'].includes(readTrimmedString(video.role))),
      finalVideos: cinematicV2Videos.filter((video) => ['cinematic_v2_final_timeline', 'cinematic_v3_final_timeline'].includes(readTrimmedString(video.role))),
      timeline: cinematicV2Timeline,
    },
    title: readTrimmedString(cinematicV2ParsedScript?.title) || readTrimmedString(cinematicV2SceneState?.title) || readTrimmedString(directorScriptDoc?.title) || readTrimmedString(executionScriptDoc?.title) || 'Cinematic Script',
    logline: readTrimmedString(cinematicV2ParsedScript?.summary) || readTrimmedString(cinematicV2SceneState?.summary) || readTrimmedString(directorScriptDoc?.logline) || readTrimmedString(executionScriptDoc?.logline),
    tone: readTrimmedString(directorScriptDoc?.tone) || readTrimmedString(executionScriptDoc?.tone),
    continuityLock: readTrimmedString(directorScriptDoc?.continuityLock) || readTrimmedString(executionScriptDoc?.continuityNotes),
    entityRefs: cinematicArray(directorScriptDoc?.entityRefs).length > 0
      ? cinematicArray(directorScriptDoc?.entityRefs)
      : cinematicArray(executionScriptDoc?.entityBindings),
    scenes: cinematicArray(directorScriptDoc?.scenes).length > 0
      ? cinematicArray(directorScriptDoc?.scenes)
      : cinematicArray(executionScriptDoc?.scenes),
    shots: cinematicArray(directorScriptDoc?.shots).length > 0
      ? cinematicArray(directorScriptDoc?.shots)
      : cinematicArray(compiledCinematicSequence?.shots),
    takes: cinematicArray(compiledCinematicSequence?.takes),
  }
}

function buildSafeCinematicV2TimelineProjection(data: ReturnType<typeof buildCinematicScriptViewData>): CinematicTimelineProjection | null {
  if (!data.cinematicV2.shotPlan) return null
  try {
    return buildCinematicV2TimelineProjection({
      shotPlan: data.cinematicV2.shotPlan,
      timeline: data.cinematicV2.timeline,
      panels: data.cinematicV2.panels,
      keyframes: data.cinematicV2.keyframes,
      videos: data.cinematicV2.videos,
      storyboardSheets: data.cinematicV2.storyboardSheets,
    })
  } catch {
    return null
  }
}

function buildCinematicV2TimelineModalData(
  workflow: OutputWorkflow | null | undefined,
  run: OutputWorkflowRun | null | undefined,
): { title: string; projection: CinematicTimelineProjection; workflowId: string; runId: string | null; canUndoLastDirectorEdit: boolean } | null {
  const data = buildCinematicScriptViewData(workflow ?? null, run ?? null)
  if (!data.isV2 || !workflow) return null
  const projection = buildSafeCinematicV2TimelineProjection(data)
  if (!projection) return null
  const workflowId = readTrimmedString(workflow.id) || readTrimmedString(run?.workflowId)
  if (!workflowId) return null
  const edits = readRecord(workflow.metadata).cinematicV2DirectorEdits
  return {
    title: data.title || workflow?.name || 'Cinematic Timeline',
    projection,
    workflowId,
    runId: run?.id ?? null,
    canUndoLastDirectorEdit: Array.isArray(edits) && edits.length > 0,
  }
}

type CinematicV2ProductionEstimate = {
  clipCount: number
  generatedSeconds: number
  estimatedCostUsd: number
  provider: string
  model: string
  pricePerSecondUsd: number
}

function isCinematicV2ProductionNodeConfig(config: Record<string, unknown>, nodeType?: string) {
  const purpose = readTrimmedString(config.purpose)
  const role = readTrimmedString(config.role)
  const pipelineVersion = readTrimmedString(config.cinematicPipelineVersion)
  return (pipelineVersion === 'v2_shot_orchestration' || pipelineVersion === 'v3_script_storyboards')
    && (
      purpose === 'cinematic_v2_shot_video'
      || role === 'cinematic_v2_shot_video'
      || purpose === 'cinematic_v2_timeline_assemble'
      || role === 'cinematic_v2_final_timeline'
      || purpose === 'cinematic_v3_storyboard_group_video'
      || role === 'cinematic_v3_storyboard_group_video'
      || purpose === 'cinematic_v3_timeline_assemble'
      || role === 'cinematic_v3_final_timeline'
      || (nodeType === 'output_artifact' && purpose === 'cinematic_video_artifact')
    )
}

function buildCinematicV2ProductionEstimate(
  data: ReturnType<typeof buildCinematicScriptViewData>,
  nodes: OutputWorkflowNode[],
): CinematicV2ProductionEstimate | null {
  const shotPlan = readRecord(data.cinematicV2.shotPlan)
  const shots = cinematicArray(shotPlan.shots)
  const shotVideoNodes = nodes.filter((node) => {
    const config = readRecord(node.config)
    return node.nodeType === 'video_generation' && isCinematicV2ProductionNodeConfig(config, node.nodeType)
  })
  const clipCount = Math.max(shots.length, shotVideoNodes.length)
  if (clipCount === 0) return null

  const shotSeconds = shots.reduce((sum, shot) => {
    const providerSeconds = readNumber(shot.providerDurationSeconds)
    const editorialSeconds = readNumber(shot.editorialDurationSeconds)
    return sum + Math.max(0, providerSeconds ?? editorialSeconds ?? 0)
  }, 0)
  const nodeSeconds = shotVideoNodes.reduce((sum, node) => {
    const config = readRecord(node.config)
    return sum + Math.max(0, readNumber(config.durationSeconds) ?? 0)
  }, 0)
  const generatedSeconds = shotSeconds > 0 ? shotSeconds : nodeSeconds
  if (generatedSeconds <= 0) return null

  const firstVideoConfig = readRecord(shotVideoNodes[0]?.config)
  const provider = readTrimmedString(firstVideoConfig.videoProvider)
    || readTrimmedString(firstVideoConfig.provider)
    || aiGenerationSettings.outputWorkflow.videoProviderDefault
  const model = readTrimmedString(firstVideoConfig.model)
    || (provider === 'fal'
      ? aiGenerationSettings.outputWorkflow.videoFalModel
      : aiGenerationSettings.outputWorkflow.videoMuapiModel)
  const cost = provider === 'fal'
    ? estimateFalMediaCost({ model, durationSeconds: generatedSeconds, units: generatedSeconds })
    : estimateMuapiMediaCost({ model, durationSeconds: generatedSeconds, units: generatedSeconds })
  const unitUsd = typeof cost.priceSnapshot.unitUsd === 'number'
    ? cost.priceSnapshot.unitUsd
    : generatedSeconds > 0
      ? cost.estimatedCostUsd / generatedSeconds
      : 0

  return {
    clipCount,
    generatedSeconds,
    estimatedCostUsd: cost.estimatedCostUsd,
    provider,
    model,
    pricePerSecondUsd: unitUsd,
  }
}

function CinematicV2TimelineModal({
  assets,
  enhancingShotId,
  onApplyDirectorPatch,
  onClose,
  onGenerateQualityKeyframe,
  onPreviewDirectorNote,
  onUndoLastDirectorEdit,
  projection,
  runId,
  title,
  workflowId,
  canUndoLastDirectorEdit,
}: {
  assets: ProjectSnapshot['assets']
  enhancingShotId?: string | null
  onApplyDirectorPatch: (request: { workflowId: string; runId?: string | null; preview: CinematicDirectorPatchPreview; startRegeneration: boolean }) => Promise<void>
  onClose: () => void
  onGenerateQualityKeyframe?: (request: { workflowId: string; runId?: string | null; shot: CinematicTimelineShotClip }) => Promise<void>
  onPreviewDirectorNote: (request: { workflowId: string; runId?: string | null; note: string; scope: CinematicDirectorNoteScope }) => Promise<CinematicDirectorNotePreviewResponse>
  onUndoLastDirectorEdit: (request: { workflowId: string; runId?: string | null }) => Promise<void>
  projection: CinematicTimelineProjection
  runId?: string | null
  title: string
  workflowId: string
  canUndoLastDirectorEdit: boolean
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div aria-label="Cinematic timeline preview" aria-modal="true" className="outputs-cinematic-timeline-modal" role="dialog">
      <button aria-label="Close cinematic timeline" className="outputs-cinematic-timeline-backdrop" onClick={onClose} type="button" />
      <div className="outputs-cinematic-timeline-panel">
        <div className="outputs-cinematic-timeline-header">
          <div>
            <p className="outputs-eyebrow">Cinematic Timeline</p>
            <h3>{title}</h3>
          </div>
          <button className="outputs-node-action" onClick={onClose} type="button">Close</button>
        </div>
        <CinematicTimelinePlayer
          assets={assets}
          directorNotes={{
            canUndoLast: canUndoLastDirectorEdit,
            onApply: (preview) => {
              if (!preview || typeof preview !== 'object') {
                return Promise.reject(new Error('Preview the director note before applying it.'))
              }
              return onApplyDirectorPatch({ workflowId, runId, preview, startRegeneration: true })
            },
            onPreview: ({ note, scope }) => onPreviewDirectorNote({ workflowId, runId, note, scope }),
            onUndoLast: () => onUndoLastDirectorEdit({ workflowId, runId }),
          }}
          qualityKeyframes={onGenerateQualityKeyframe ? {
            busyShotId: enhancingShotId,
            onGenerateShot: (shot) => onGenerateQualityKeyframe({ workflowId, runId, shot }),
          } : undefined}
          projection={projection}
          subtitle="V2 shot orchestration preview"
          title={title}
        />
      </div>
    </div>
  )
}

function CinematicV2ProductionPanel({
  canRunOutputs,
  data,
  estimate,
  isApprovingVideo,
  isUpgradingQuality,
  isVideoApproved,
  onApproveVideoProduction,
  onGenerateQualityKeyframes,
  onOpenTimeline,
}: {
  canRunOutputs: boolean
  data: ReturnType<typeof buildCinematicScriptViewData>
  estimate: CinematicV2ProductionEstimate | null
  isApprovingVideo: boolean
  isUpgradingQuality: boolean
  isVideoApproved: boolean
  onApproveVideoProduction: () => void
  onGenerateQualityKeyframes: () => void
  onOpenTimeline: () => void
}) {
  const parsedScript = readRecord(data.cinematicV2.parsedScript)
  const sceneState = readRecord(data.cinematicV2.sceneState)
  const layoutPlan = readRecord(data.cinematicV2.layoutPlan)
  const shotPlan = readRecord(data.cinematicV2.shotPlan)
  const storyboardGroupPlan = readRecord(data.cinematicV2.storyboardGroupPlan)
  const shots = cinematicArray(shotPlan.shots)
  const storyboardGroups = cinematicArray(storyboardGroupPlan.groups)
  const shotPlanDiagnostics = readStringArray(shotPlan.diagnostics)
  const fallbackUsed = shotPlanDiagnostics.some((diagnostic) => diagnostic.toLowerCase().includes('fallback'))
  const timeline = readRecord(data.cinematicV2.timeline)
  const timelineProjection = useMemo(() => buildSafeCinematicV2TimelineProjection(data), [data])
  const panelsByShotId = new Map(data.cinematicV2.panels.map((panel) => [readTrimmedString(panel.shotId), panel]))
  const keyframesByShotId = new Map(data.cinematicV2.keyframes.map((image) => [readTrimmedString(image.shotId), image]))
  const videosByShotId = new Map(data.cinematicV2.videos.map((video) => [readTrimmedString(video.shotId), video]))
  const qualityKeyframeCount = data.cinematicV2.keyframes.filter((image) => (
    readTrimmedString(image.keyframeMode) !== 'storyboard_panel_crop'
    && readTrimmedString(image.generatedBy) !== 'deterministic_panel_passthrough'
  )).length
  const keyframesReady = shots.length > 0 && data.cinematicV2.keyframes.length > 0
  const qualityKeyframesReady = shots.length > 0 && qualityKeyframeCount >= shots.length
  const finalVideoReady = data.cinematicV2.finalVideos.length > 0
  const approvalStatus = finalVideoReady
    ? 'Final video ready'
    : data.cinematicV2.videos.length > 0
      ? 'Generating video'
      : isVideoApproved
        ? 'Approved'
        : keyframesReady
          ? 'Animatic ready'
          : 'Building animatic'
  const estimateLabel = estimate
    ? `${estimate.clipCount} clips · ${formatScriptSeconds(estimate.generatedSeconds)} generated · ~${formatAiUsd(estimate.estimatedCostUsd)}`
    : 'Production estimate pending'

  return (
    <div className="outputs-script-panel outputs-cinematic-v2-panel">
      <div className="outputs-script-header">
        <small>Cinematics V2 · Animatic approval</small>
        <strong>{data.title}</strong>
        {data.logline ? <p>{data.logline}</p> : null}
        <div className="outputs-script-meta">
          {shots.length > 0 ? <span>{shots.length} shots</span> : null}
          {storyboardGroups.length > 0 ? <span>{storyboardGroups.length} storyboard sheets</span> : null}
          {readNumber(shotPlan.totalEditorialDurationSeconds) ? <span>{formatScriptSeconds(shotPlan.totalEditorialDurationSeconds)} editorial</span> : null}
          {data.cinematicV2.storyboardSheets.length > 0 ? <span>Storyboard ready</span> : <span>Storyboard pending</span>}
          <span>{approvalStatus}</span>
          <button className="outputs-node-action" disabled={!timelineProjection} onClick={onOpenTimeline} type="button">Open Timeline</button>
        </div>
        {fallbackUsed ? (
          <div className="inline-note is-warning">
            Directed shot planner fell back to a deterministic plan. Regenerate the directed plan before final production.
          </div>
        ) : null}
        <div className="outputs-cinematic-v2-approval">
          <div>
            <span>Final video production</span>
            <strong>{estimateLabel}</strong>
            {estimate ? <small>{estimate.provider.toUpperCase()} · {estimate.model} · {formatAiUsd(estimate.pricePerSecondUsd)}/s</small> : null}
          </div>
          <button
            className="outputs-node-action"
            disabled={!canRunOutputs || !keyframesReady || qualityKeyframesReady || isUpgradingQuality || isApprovingVideo}
            onClick={onGenerateQualityKeyframes}
            type="button"
          >
            {isUpgradingQuality ? 'Enhancing...' : qualityKeyframesReady ? 'Quality Keyframes Ready' : 'Generate Quality Keyframes'}
          </button>
          <button
            className="outputs-primary-action"
            disabled={!canRunOutputs || !keyframesReady || finalVideoReady || isApprovingVideo}
            onClick={onApproveVideoProduction}
            type="button"
          >
            {isApprovingVideo ? 'Starting...' : finalVideoReady ? 'Video Ready' : 'Approve & Generate Video'}
          </button>
        </div>
      </div>

      <div className="outputs-cinematic-v2-grid">
        <section className="outputs-script-section">
          <strong>Scene State</strong>
          {readTrimmedString(sceneState.mood) ? <p><b>Mood:</b> {readTrimmedString(sceneState.mood)}</p> : null}
          {readTrimmedString(sceneState.atmosphere) ? <p><b>Atmosphere:</b> {readTrimmedString(sceneState.atmosphere)}</p> : null}
          {readTrimmedString(readRecord(sceneState.lighting).direction) ? <p><b>Lighting:</b> {[readTrimmedString(readRecord(sceneState.lighting).direction), readTrimmedString(readRecord(sceneState.lighting).quality), readTrimmedString(readRecord(sceneState.lighting).colorTemperature)].filter(Boolean).join(' · ')}</p> : null}
          {readStringArray(readRecord(sceneState.visualContinuity).palette).length > 0 ? (
            <div className="outputs-script-chips">{readStringArray(readRecord(sceneState.visualContinuity).palette).map((entry) => <span key={entry}>{entry}</span>)}</div>
          ) : null}
        </section>

        <section className="outputs-script-section">
          <strong>Layout / Blocking</strong>
          {readTrimmedString(layoutPlan.summary) ? <p>{readTrimmedString(layoutPlan.summary)}</p> : null}
          {readTrimmedString(layoutPlan.spatialMapDescription) ? <p><b>Spatial map:</b> {readTrimmedString(layoutPlan.spatialMapDescription)}</p> : null}
          {cinematicArray(layoutPlan.cameraPlan).length > 0 ? (
            <div className="outputs-script-chips">
              {cinematicArray(layoutPlan.cameraPlan).slice(0, 4).map((camera, index) => (
                <span key={`${readTrimmedString(camera.id) || index}`}>{readTrimmedString(camera.purpose) || `Camera ${index + 1}`}</span>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {cinematicArray(parsedScript.beats).length > 0 ? (
        <section className="outputs-script-section">
          <strong>Parsed Beats</strong>
          <div className="outputs-script-chips">
            {cinematicArray(parsedScript.beats).slice(0, 9).map((beat, index) => (
              <span key={`${readTrimmedString(beat.id) || index}`}>{readTrimmedString(beat.type) || 'beat'} · {readTrimmedString(beat.text).slice(0, 72)}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="outputs-script-section">
        <strong>Production Shots</strong>
        {shots.length === 0 ? <p className="outputs-muted">Shot planning has not completed yet.</p> : null}
        <div className="outputs-cinematic-v2-shot-grid">
          {shots.map((shot, index) => {
            const shotId = readTrimmedString(shot.id)
            const panel = panelsByShotId.get(shotId)
            const keyframe = keyframesByShotId.get(shotId)
            const video = videosByShotId.get(shotId)
            return (
              <article className="outputs-script-shot outputs-cinematic-v2-shot" key={shotId || index}>
                <div className="outputs-script-shot-head">
                  <b>{readTrimmedString(shot.title) || `Shot ${index + 1}`}</b>
                  <span>{readTrimmedString(shot.purpose) || 'shot'} · {formatScriptSeconds(shot.editorialDurationSeconds)} / {formatScriptSeconds(shot.providerDurationSeconds)}</span>
                </div>
                <p>{readTrimmedString(shot.description) || readTrimmedString(shot.action)}</p>
                <p><b>Camera:</b> {[readTrimmedString(readRecord(shot.camera).framing), readTrimmedString(readRecord(shot.camera).movement), readTrimmedString(readRecord(shot.camera).screenDirectionRule)].filter(Boolean).join(' · ')}</p>
                <div className="outputs-script-meta">
                  {panel ? <span>Panel</span> : <span>Panel pending</span>}
                  {keyframe ? <span>Keyframe</span> : <span>Keyframe pending</span>}
                  {video ? <span>Video</span> : <span>Video pending</span>}
                  {shot.requiresLipSync === true ? <span>Lip sync later</span> : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {Object.keys(timeline).length > 0 ? (
        <section className="outputs-script-section">
          <div className="outputs-cinematic-v2-section-head">
            <strong>Timeline</strong>
            <button className="outputs-node-action" disabled={!timelineProjection} onClick={onOpenTimeline} type="button">Cinematic</button>
          </div>
          <div className="outputs-cinematic-v2-timeline">
            {cinematicArray(timeline.videoClips).map((clip, index) => (
              <span key={`${readTrimmedString(clip.shotId) || index}`} style={{ flexGrow: Math.max(1, Number(clip.endTime ?? 0) - Number(clip.startTime ?? 0)) }}>
                {readTrimmedString(clip.shotId) || `Shot ${index + 1}`}
              </span>
            ))}
          </div>
          {cinematicArray(timeline.audioClips).length > 0 ? <p className="outputs-muted">Placeholder audio plan stored for ambience/music; dialogue audio and lip sync are deferred.</p> : null}
        </section>
      ) : null}
    </div>
  )
}

function CinematicScriptPanel({
  canRunOutputs,
  data,
  estimate,
  isApprovingVideo,
  isUpgradingQuality,
  isVideoApproved,
  onApproveVideoProduction,
  onGenerateQualityKeyframes,
  onOpenTimeline,
}: {
  canRunOutputs: boolean
  data: ReturnType<typeof buildCinematicScriptViewData>
  estimate: CinematicV2ProductionEstimate | null
  isApprovingVideo: boolean
  isUpgradingQuality: boolean
  isVideoApproved: boolean
  onApproveVideoProduction: () => void
  onGenerateQualityKeyframes: () => void
  onOpenTimeline: () => void
}) {
  if (!data.isCinematic) {
    return <p className="outputs-muted">This workflow is not a cinematic output.</p>
  }
  if (data.isV2) {
    return (
      <CinematicV2ProductionPanel
        canRunOutputs={canRunOutputs}
        data={data}
        estimate={estimate}
        isApprovingVideo={isApprovingVideo}
        isUpgradingQuality={isUpgradingQuality}
        isVideoApproved={isVideoApproved}
        onApproveVideoProduction={onApproveVideoProduction}
        onGenerateQualityKeyframes={onGenerateQualityKeyframes}
        onOpenTimeline={onOpenTimeline}
      />
    )
  }
  if (!data.directorScriptDoc && !data.executionScriptDoc && !data.compiledCinematicSequence) {
    return <p className="outputs-muted">The cinematic script has not been authored yet. Run the script node or refresh after compile.</p>
  }
  return (
    <div className="outputs-script-panel">
      <div className="outputs-script-header">
        <strong>{data.title}</strong>
        {data.logline ? <p>{data.logline}</p> : null}
        <div className="outputs-script-meta">
          {data.tone ? <span>Tone: {data.tone}</span> : null}
          {data.shots.length > 0 ? <span>{data.shots.length} shots</span> : null}
          {data.takes.length > 0 ? <span>{data.takes.length} compiled takes</span> : null}
        </div>
      </div>

      {data.continuityLock ? (
        <div className="outputs-script-section">
          <strong>Continuity Lock</strong>
          <p>{data.continuityLock}</p>
        </div>
      ) : null}

      {data.entityRefs.length > 0 ? (
        <div className="outputs-script-section">
          <strong>Entity Bindings</strong>
          <div className="outputs-script-chips">
            {data.entityRefs.map((entity, index) => (
              <span key={`${readTrimmedString(entity.id) || readTrimmedString(entity.label) || index}`}>
                {readTrimmedString(entity.label) || readTrimmedString(entity.id) || readTrimmedString(entity.sourceName) || `Entity ${index + 1}`}
                {readTrimmedString(entity.role) ? ` · ${readTrimmedString(entity.role)}` : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {data.scenes.length > 0 ? (
        <div className="outputs-script-section">
          <strong>Scenes</strong>
          {data.scenes.map((scene, index) => (
            <div className="outputs-script-card" key={`${readTrimmedString(scene.id) || index}`}>
              <b>{readTrimmedString(scene.title) || `Scene ${index + 1}`}</b>
              {readTrimmedString(scene.location) || readTrimmedString(scene.locationRefId) ? <span>{readTrimmedString(scene.location) || readTrimmedString(scene.locationRefId)}</span> : null}
              {readTrimmedString(scene.summary) ? <p>{readTrimmedString(scene.summary)}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {data.shots.length > 0 ? (
        <div className="outputs-script-section">
          <strong>Shot Script</strong>
          {data.shots.map((shot, index) => {
            const actions = cinematicArray(shot.actions)
            const dialogue = cinematicArray(shot.dialogue)
            const audioCues: Record<string, unknown>[] = readStringArray(shot.audioCues).length > 0
              ? readStringArray(shot.audioCues).map((cue) => ({ cue }))
              : cinematicArray(shot.audio)
            return (
              <div className="outputs-script-shot" key={`${readTrimmedString(shot.id) || index}`}>
                <div className="outputs-script-shot-head">
                  <b>{readTrimmedString(shot.title) || `Shot ${index + 1}`}</b>
                  <span>{formatScriptSeconds(shot.startSeconds)}-{formatScriptSeconds(shot.endSeconds)} · {formatScriptSeconds(shot.durationSeconds)}</span>
                </div>
                {readTrimmedString(shot.beat) ? <p>{readTrimmedString(shot.beat)}</p> : null}
                {readTrimmedString(shot.visualAction) || readTrimmedString(shot.visualPrompt) ? (
                  <p><b>Action:</b> {readTrimmedString(shot.visualAction) || readTrimmedString(shot.visualPrompt)}</p>
                ) : null}
                {readTrimmedString(shot.composition) || readTrimmedString(shot.compositionGuide) ? (
                  <p><b>Composition:</b> {readTrimmedString(shot.composition) || readTrimmedString(shot.compositionGuide)}</p>
                ) : null}
                {(readTrimmedString(shot.framing) || readTrimmedString(shot.cameraMovement)) ? (
                  <p><b>Camera:</b> {[readTrimmedString(shot.framing), readTrimmedString(shot.cameraMovement)].filter(Boolean).join(' · ')}</p>
                ) : null}
                {actions.length > 0 ? (
                  <ul>{actions.map((action, actionIndex) => (
                    <li key={actionIndex}>{[readTrimmedString(action.actor) || readTrimmedString(action.actorRefId), readTrimmedString(action.verb), readTrimmedString(action.target) || readTrimmedString(action.targetRefId), readTrimmedString(action.stagingNotes)].filter(Boolean).join(' ')}</li>
                  ))}</ul>
                ) : null}
                {dialogue.length > 0 ? (
                  <ul>{dialogue.map((line, lineIndex) => (
                    <li key={lineIndex}>{readTrimmedString(line.speaker) || readTrimmedString(line.speakerRefId) || 'Dialogue'}: "{readTrimmedString(line.line)}"{readTrimmedString(line.delivery) ? ` · ${readTrimmedString(line.delivery)}` : ''}</li>
                  ))}</ul>
                ) : null}
                {audioCues.length > 0 ? (
                  <p><b>Audio:</b> {audioCues.map((cue) => readTrimmedString(cue.cue) || readTrimmedString(cue.kind)).filter(Boolean).join(' · ')}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {data.takes.length > 0 ? (
        <div className="outputs-script-section">
          <strong>Compiled Takes</strong>
          <div className="outputs-script-chips">
            {data.takes.map((take, index) => (
              <span key={`${readTrimmedString(take.id) || index}`}>
                {readTrimmedString(take.title) || `Take ${index + 1}`} · {formatScriptSeconds(take.durationSeconds)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {data.executionScriptDoc ? (
        <details className="outputs-script-json">
          <summary>Execution JSON</summary>
          <pre>{JSON.stringify(data.executionScriptDoc, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}

function readAiUsageSummary(value: unknown) {
  const parsed = aiUsageSummarySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function readStepAiUsage(step: OutputWorkflowRunStep | null | undefined) {
  const metadata = readRecord(step?.metadata)
  return readAiUsageSummary(metadata.aiUsage)
}

function readStepAiUsageEstimate(step: OutputWorkflowRunStep | null | undefined) {
  const metadata = readRecord(step?.metadata)
  const parsedLine = aiUsageLineSchema.safeParse(metadata.aiUsageEstimate)
  if (!parsedLine.success) return null
  return aiUsageSummarySchema.parse({
    status: 'estimated',
    lines: [parsedLine.data],
  })
}

function buildRunUsageSummary(run: OutputWorkflowRun | null | undefined, workflow: { metadata?: Record<string, unknown> } | null) {
  const actualLines = (run?.steps ?? [])
    .flatMap((step) => readStepAiUsage(step)?.lines ?? [])
  if (actualLines.length > 0) {
    return summarizeAiUsageLines(actualLines)
  }
  const runMetadata = readRecord(run?.metadata)
  const workflowMetadata = readRecord(workflow && 'metadata' in workflow ? workflow.metadata : {})
  return readAiUsageSummary(runMetadata.usageEstimate) ?? readAiUsageSummary(workflowMetadata.usageEstimate)
}

function resolveArtifactUrlFromMetadata(metadata: Record<string, unknown>) {
  const sourceUrl = readTrimmedString(metadata.sourceUrl)
  if (isResolvableAssetUrl(sourceUrl)) return sourceUrl
  const previewUrl = readTrimmedString(metadata.previewUrl)
  return isResolvableAssetUrl(previewUrl) ? previewUrl : null
}

function formatByteSize(value: unknown) {
  const bytes = readNumber(value)
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

function readImageAspectRatio(...records: Array<unknown>) {
  for (const value of records) {
    const record = readRecord(value)
    const image = readRecord(record.image)
    const imageSize = readRecord(record.imageSize)
    const width = readNumber(record.width) ?? readNumber(image.width) ?? readNumber(imageSize.width)
    const height = readNumber(record.height) ?? readNumber(image.height) ?? readNumber(imageSize.height)
    if (width && height && width > 0 && height > 0) return `${width} / ${height}`
  }
  return ''
}

function artifactActionLabels(mimeType: string, kind: string) {
  if (mimeType === 'application/pdf' || kind === 'pdf') {
    return { open: 'Open PDF', download: 'Download PDF', extension: 'pdf' }
  }
  if (mimeType.startsWith('image/') || kind === 'image') {
    const extension = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    return { open: 'Open Image', download: 'Download Image', extension }
  }
  if (mimeType.includes('html') || kind === 'html') {
    return { open: 'Open HTML', download: 'Download HTML', extension: 'html' }
  }
  if (mimeType.includes('markdown') || kind === 'manuscript') {
    return { open: 'Open Markdown', download: 'Download Markdown', extension: 'md' }
  }
  return { open: 'Open File', download: 'Download File', extension: 'download' }
}

function artifactDownloadFileName(name: string, extension: string) {
  const baseName = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    || 'graphcore-output'
  return baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`
}

async function downloadArtifactUrl(url: string, fileName: string, mimeType: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download artifact (${response.status}).`)
  const sourceBlob = await response.blob()
  const blob = sourceBlob.type || !mimeType
    ? sourceBlob
    : new Blob([sourceBlob], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function statusKeyForStep(step: { status: string; metadata?: Record<string, unknown> } | null | undefined) {
  if (!step) return 'queued'
  if (readRecord(step.metadata).blocked) return 'blocked'
  if (readRecord(step.metadata).skipped) return 'skipped'
  return step.status
}

function statusLabelForStep(step: { status: string; metadata?: Record<string, unknown> } | null | undefined) {
  return formatStatus(statusKeyForStep(step))
}

function readOutputPreview(step: Pick<OutputWorkflowRunStep, 'outputs' | 'errorMessage' | 'provider' | 'model'> | null | undefined) {
  if (!step) return ''
  if (step.errorMessage) return step.errorMessage
  const outputs = readRecord(step.outputs)
  const image = readRecord(outputs.image)
  const imageAssetKey = readTrimmedString(image.assetKey) || readTrimmedString(outputs.assetKey)
  const imagePrompt = readTrimmedString(image.prompt) || readTrimmedString(outputs.prompt)
  if (imageAssetKey && (readTrimmedString(image.mimeType).startsWith('image/') || step.provider === 'fal')) {
    return [`Generated image asset: ${imageAssetKey}`, imagePrompt ? `Prompt: ${imagePrompt}` : ''].filter(Boolean).join('\n\n')
  }
  const directText = readTrimmedString(outputs.markdown)
    || readTrimmedString(outputs.text)
    || readTrimmedString(outputs.output)
    || readTrimmedString(outputs.artifactKey)
  if (directText) return directText
  const guidance = readRecord(outputs.guidance)
  const guidancePreview = readTrimmedString(guidance.resolvedGuidancePreview)
  if (guidancePreview) return guidancePreview
  if (Object.keys(outputs).length === 0) return ''
  return JSON.stringify(outputs, null, 2)
}

function readNodeOutputPreview(node: Pick<OutputWorkflowNode, 'metadata' | 'outputs'> | null | undefined) {
  const metadataPreview = readRecord(readRecord(node?.metadata).outputPreview)
  const previewText = readTrimmedString(metadataPreview.text) || readTrimmedString(metadataPreview.preview)
  if (previewText) return previewText
  const assetKeys = readStringArray(metadataPreview.assetKeys)
  if (assetKeys.length > 0) return `Generated assets: ${assetKeys.join(', ')}`
  const outputBytes = Number(metadataPreview.outputBytes)
  if (Number.isFinite(outputBytes) && outputBytes > 0) return `Output cached (${Math.round(outputBytes / 1024)} KB). Select the node to hydrate full output.`
  return readOutputPreview({ outputs: readRecord(node?.outputs), errorMessage: null, provider: null, model: null })
}

function outputNodeHasReusableCache(node: OutputWorkflowNode | undefined, step: OutputWorkflowRunStep | undefined) {
  if (!node) return false
  if (Object.keys(readRecord(node.outputs)).length > 0) return true
  if (readTrimmedString(node.outputHash)) return true
  if (readNodeOutputPreview(node)) return true
  if (step && (Object.keys(readRecord(step.outputs)).length > 0 || readTrimmedString(step.outputHash))) return true
  return false
}

function outputEdgeIsOptionalForCache(edge: OutputWorkflowEdge) {
  const metadata = readRecord(edge.metadata)
  if (metadata.optional === true || metadata.optionalDependency === true) return true
  return edge.sourceNodeKey.startsWith('cinematic_v2_shot_')
    && edge.sourceNodeKey.endsWith('_asset_pack')
    && edge.targetNodeKey.startsWith('cinematic_v2_shot_')
    && edge.targetNodeKey.endsWith('_video')
    && edge.targetPort === 'references'
}

function buildTargetedRunCachePreflight(input: {
  node: OutputWorkflowNode
  edges: OutputWorkflowEdge[]
  nodeByKey: Map<string, OutputWorkflowNode>
  stepsByNodeKey: Map<string, OutputWorkflowRunStep>
}) {
  const incomingEdges = input.edges.filter((edge) => edge.targetNodeKey === input.node.key && !outputEdgeIsOptionalForCache(edge))
  const missingRequiredUpstreamKeys = incomingEdges
    .map((edge) => edge.sourceNodeKey)
    .filter((sourceKey) => !outputNodeHasReusableCache(input.nodeByKey.get(sourceKey), input.stepsByNodeKey.get(sourceKey)))
  const staleUpstreamKeys = incomingEdges
    .map((edge) => edge.sourceNodeKey)
    .filter((sourceKey) => {
      const sourceNode = input.nodeByKey.get(sourceKey)
      return Boolean(sourceNode?.dirty && outputNodeHasReusableCache(sourceNode, input.stepsByNodeKey.get(sourceKey)))
    })
  return {
    cacheStatus: missingRequiredUpstreamKeys.length > 0
      ? 'missing_upstream'
      : staleUpstreamKeys.length > 0
        ? 'stale_upstream'
        : 'ready',
    missingRequiredUpstreamKeys,
    staleUpstreamKeys,
    requiredUpstreamKeys: incomingEdges.map((edge) => edge.sourceNodeKey),
  }
}

function truncatePreview(value: string, maxLength = 14000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[Output truncated in preview]` : value
}

function readNodeSkillKeys(node: Pick<OutputWorkflowNode, 'config' | 'metadata'>) {
  const config = readRecord(node.config)
  const configGuidance = readRecord(config.guidance)
  const metadataGuidance = readRecord(node.metadata).guidance
  const skillKeys = [
    ...readStringArray(config.skillKeys),
    ...readStringArray(configGuidance.skillKeys),
    ...readStringArray(readRecord(metadataGuidance).skillKeys),
  ]
  return [...new Set(skillKeys)]
}

function statusClass(value: string) {
  return value.replace(/\s+/g, '-')
}

type OutputStudioStageKey = 'context' | 'writing' | 'images' | 'render' | 'artifacts'

function outputStageForNode(node: OutputWorkflowNode): OutputStudioStageKey {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  if (node.nodeType === 'world_context_query' || node.nodeType === 'skill_context_query' || purpose === 'comic_entity_selector') {
    return 'context'
  }
  if (node.nodeType === 'image_generation') return 'images'
  if (node.nodeType === 'document_render') return 'render'
  if (node.nodeType === 'output_artifact') return 'artifacts'
  return 'writing'
}

const OUTPUT_STAGE_COPY: Record<OutputStudioStageKey, { title: string; eyebrow: string; empty: string }> = {
  context: {
    title: 'Context',
    eyebrow: 'World graph inputs',
    empty: 'World, sequence, and guidance inputs appear here once a workflow exists.',
  },
  writing: {
    title: 'Writing',
    eyebrow: 'Scripts, prose, prompts',
    empty: 'Script, chapter, prompt, and planning nodes will collect here.',
  },
  images: {
    title: 'Images',
    eyebrow: 'Cover, atlas, pages',
    empty: 'Image generation nodes will show previews and provider status here.',
  },
  render: {
    title: 'Render',
    eyebrow: 'PDF assembly',
    empty: 'Document and comic PDF render nodes appear here.',
  },
  artifacts: {
    title: 'Artifacts',
    eyebrow: 'Open and download',
    empty: 'Final registration nodes appear here before files land in the gallery.',
  },
}

const OUTPUT_STAGE_ORDER = ['context', 'writing', 'images', 'render', 'artifacts'] as const

function buildWorkflowStages(input: {
  nodes: OutputWorkflowNode[]
  levels: string[][]
  nodeByKey: Map<string, OutputWorkflowNode>
  stepsByNodeKey: Map<string, OutputWorkflowRunStep>
}) {
  const stages = OUTPUT_STAGE_ORDER.map((key) => ({
    key,
    ...OUTPUT_STAGE_COPY[key],
    levels: [] as Array<{ levelIndex: number; nodes: OutputWorkflowNode[] }>,
    counts: new Map<string, number>(),
    total: 0,
  }))
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]))
  const placed = new Set<string>()

  input.levels.forEach((level, levelIndex) => {
    const grouped = new Map<OutputStudioStageKey, OutputWorkflowNode[]>()
    for (const nodeKey of level) {
      const node = input.nodeByKey.get(nodeKey)
      if (!node) continue
      const stageKey = outputStageForNode(node)
      const group = grouped.get(stageKey) ?? []
      group.push(node)
      grouped.set(stageKey, group)
      placed.add(node.key)
    }
    for (const [stageKey, nodes] of grouped) {
      stageByKey.get(stageKey)?.levels.push({ levelIndex, nodes })
    }
  })

  for (const node of input.nodes) {
    if (placed.has(node.key)) continue
    const stage = stageByKey.get(outputStageForNode(node))
    if (stage) stage.levels.push({ levelIndex: stage.levels.length, nodes: [node] })
  }

  for (const stage of stages) {
    for (const level of stage.levels) {
      for (const node of level.nodes) {
        stage.total += 1
        const status = statusKeyForStep(input.stepsByNodeKey.get(node.key))
        stage.counts.set(status, (stage.counts.get(status) ?? 0) + 1)
      }
    }
  }

  return stages
}

function workflowPresetLabel(value: string | null | undefined) {
  if (value === 'comic_issue_from_sequence') return 'Comic Issue'
  if (value === 'ebook_from_world') return 'Ebook PDF'
  if (value === 'story_bible_from_world') return 'Story Bible'
  return value ? value.replace(/_/g, ' ') : 'No workflow yet'
}

function outputKindLabel(value: string | null | undefined) {
  if (value === 'concept_art_image') return 'Concept Art'
  if (value === 'poster_image') return 'Poster Image'
  if (value === 'story_bible_from_world') return 'Story Bible'
  if (value === 'world_reference_document') return 'World Reference'
  if (value === 'lore_guide') return 'Lore Guide'
  if (value === 'character_dossier_pack') return 'Character Dossiers'
  if (value === 'short_story') return 'Short Story'
  if (value === 'narrative_chapter_or_ebook') return 'Narrative Ebook'
  if (value === 'ebook_from_world') return 'Ebook PDF'
  if (value === 'comic_issue_from_sequence') return 'Comic Issue'
  if (value === 'cinematic_trailer') return 'Cinematic Trailer'
  if (value === 'cinematic_episode') return 'Cinematic Episode'
  if (value === 'ugc_episode') return 'UGC Episode'
  return 'Output'
}

function plannedSectionTitles(request: OutputRequest | null | undefined) {
  const metadata = readRecord(request?.metadata)
  const rawSections = Array.isArray(metadata.plannedSections) ? metadata.plannedSections : []
  return rawSections
    .map((entry) => readTrimmedString(readRecord(entry).title))
    .filter(Boolean)
}

function purposeLabel(node: OutputWorkflowNode) {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  return purpose ? purpose.replace(/_/g, ' ') : node.nodeType.replace(/_/g, ' ')
}

function isImageArtifact(artifact: OutputArtifact, mimeType: string) {
  return mimeType.startsWith('image/') || artifact.kind === 'image'
}

function artifactSortPriority(artifact: OutputArtifact) {
  const metadata = readRecord(artifact.metadata)
  const role = readTrimmedString(metadata.role)
  const usedAsVideoReference = metadata.usedAsVideoReference === true || metadata.used_as_video_reference === true
  if (usedAsVideoReference || role === 'cinematic_beat_sheet') return 0
  if (artifact.kind === 'video' || String(artifact.mimeType ?? '').startsWith('video/')) return 2
  return 1
}

function compactStatusForSteps(steps: OutputWorkflowRunStep[]) {
  if (steps.some((step) => step.status === 'running')) return 'running'
  if (steps.some((step) => {
    const status = String(step.status)
    return status === 'failed' || status === 'blocked'
  })) return 'failed'
  if (steps.length > 0 && steps.every((step) => {
    const status = String(step.status)
    return status === 'completed' || status === 'skipped'
  })) return 'completed'
  if (steps.some((step) => step.status === 'cancelled')) return 'cancelled'
  return steps.length > 0 ? 'queued' : 'empty'
}

export function OutputsWorkspace({
  snapshot,
  canRunOutputs,
  cinematicsPanel,
  openIntent,
  onPlanOutputWorkflow,
  onStartOutputRequest,
  onGetOutputRequestStatus,
  onCancelOutputRequest,
  onRequestDeleteOutputRequest,
  onLoadOutputInbox,
  onLoadOutputWorkflowGraph,
  onSubscribeOutputWorkflowGraphSignals,
  onStartOutputWorkflow,
  onStartOutputWorkflowRun,
  onPreviewCinematicDirectorNote,
  onApplyCinematicDirectorPatch,
  onGetOutputWorkflowStatus,
  onCancelOutputWorkflowRun,
  onUpdateOutputWorkflowNode,
  onUpgradeOutputWorkflowPreset,
  onRefreshLiveSnapshot,
  onReturnToSourceSurface,
}: OutputsWorkspaceProps) {
  const [approvingVideoProduction, setApprovingVideoProduction] = useState(false)
  const [upgradingAnimaticQuality, setUpgradingAnimaticQuality] = useState(false)
  const [enhancingTimelineShotId, setEnhancingTimelineShotId] = useState<string | null>(null)
  const [creationMode, setCreationMode] = useState<'prompt' | 'story_unit'>('prompt')
  const [returnToSourceOnClose, setReturnToSourceOnClose] = useState(false)
  const [cinematicTimelineModal, setCinematicTimelineModal] = useState<{
    title: string
    projection: CinematicTimelineProjection
    workflowId: string
    runId: string | null
    canUndoLastDirectorEdit: boolean
  } | null>(null)
  const [timelineOpeningRequestId, setTimelineOpeningRequestId] = useState<string | null>(null)
  const {
    activeRunId,
    busy,
    busyRequestId,
    comicPageCount,
    comicPrompt,
    downloadingArtifactKey,
    error,
    graphOpen,
    inspectorMode,
    liveRunsById,
    mode,
    outputPreset,
    prompt,
    refreshingGraph,
    rememberLiveRun,
    requestImageOutputFormat,
    requestImageQuality,
    selectedComicSequenceKey,
    selectedNodeKey,
    selectedRequestId,
    setActiveRunId,
    setBusy,
    setBusyRequestId,
    setComicPageCount,
    setComicPrompt,
    setDownloadingArtifactKey,
    setError,
    setGraphOpen,
    setInspectorMode,
    setMode,
    setOutputPreset,
    setPrompt,
    setRefreshingGraph,
    setRequestImageOutputFormat,
    setRequestImageQuality,
    setSelectedComicSequenceKey,
    setSelectedNodeKey,
    setSelectedRequestId,
    setTargetedNodeKeys,
    setTargetedRunScope,
    setUpgradeMode,
    setUsageBreakdownOpen,
    targetedNodeKey,
    targetedNodeKeys,
    targetedRunScope,
    upgradeMode,
    usageBreakdownOpen,
  } = useOutputWorkspaceState(snapshot)
  const graphRefreshSeqRef = useRef(0)
  const graphRefreshTimerRef = useRef<number | null>(null)
  const graphRetryTimerRef = useRef<number | null>(null)
  const graphWatchdogTimerRef = useRef<number | null>(null)
  const graphBackoffMsRef = useRef(0)
  const graphLastRefreshAtRef = useRef(0)
  const [graphSyncDelayed, setGraphSyncDelayed] = useState(false)
  const [graphSyncDelayedMessage, setGraphSyncDelayedMessage] = useState<string | null>(null)

  const sequenceUnits = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType === 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const castAndContext = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const worldEntityNameByKey = useMemo(
    () => new Map(snapshot.worldEntities.map((entity) => [entity.key, entity.name || entity.key])),
    [snapshot.worldEntities],
  )
  const outputRequests = useMemo(() => snapshot.outputRequests.slice().sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )), [snapshot.outputRequests])
  const selectedOutputRequest = selectedRequestId
    ? outputRequests.find((request) => request.id === selectedRequestId) ?? null
    : outputRequests[0] ?? null
  const workflows = snapshot.outputWorkflows
  const recentOutputRuns = useMemo(() => {
    const byId = new Map(snapshot.outputWorkflowRuns.map((run) => [run.id, run]))
    for (const run of Object.values(liveRunsById)) byId.set(run.id, run)
    return [...byId.values()].sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))
  }, [liveRunsById, snapshot.outputWorkflowRuns])
  const snapshotActiveRun = recentOutputRuns.find((run) => run.id === activeRunId) ?? recentOutputRuns[0] ?? null
  const liveRun = activeRunId ? liveRunsById[activeRunId] ?? null : null
  const activeRun = liveRun && liveRun.id === (activeRunId ?? liveRun.id) ? liveRun : snapshotActiveRun
  const activeWorkflow = activeRun
    ? workflows.find((workflow) => workflow.id === activeRun.workflowId) ?? null
    : workflows[0] ?? null
  const activeNodes = activeWorkflow
    ? snapshot.outputWorkflowNodes.filter((node) => node.workflowId === activeWorkflow.id)
    : []
  const activeEdges = activeWorkflow
    ? snapshot.outputWorkflowEdges.filter((edge) => edge.workflowId === activeWorkflow.id)
    : []
  const activeWorkflowRuns = activeWorkflow
    ? recentOutputRuns.filter((run) => run.workflowId === activeWorkflow.id)
    : []
  const displayRun = useMemo(() => {
    if (!activeRun) return null
    const stepByNodeKey = new Map<string, OutputWorkflowRunStep>()
    const orderedRuns = activeWorkflowRuns.slice().sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    ))
    for (const run of orderedRuns) {
      for (const step of run.steps) stepByNodeKey.set(step.nodeKey, step)
    }
    const artifactById = new Map<string, OutputWorkflowRun['artifacts'][number]>()
    for (const run of orderedRuns) {
      for (const artifact of run.artifacts) artifactById.set(artifact.id, artifact)
    }
    const hasRunningRun = activeWorkflowRuns.some((run) => !isTerminalOutputWorkflowRunStatus(run.status))
    return {
      ...activeRun,
      status: hasRunningRun ? 'running' : activeRun.status,
      steps: [...stepByNodeKey.values()].sort((left, right) => left.orderIndex - right.orderIndex),
      artifacts: [...artifactById.values()],
    } satisfies OutputWorkflowRun
  }, [activeRun, activeWorkflowRuns])
  const workflowExecutionPlan = useMemo(
    () => activeNodes.length > 0
      ? buildOutputWorkflowExecutionPlan(activeNodes, activeEdges)
      : null,
    [activeNodes, activeEdges],
  )
  const nodeByKey = useMemo(() => new Map(activeNodes.map((node) => [node.key, node])), [activeNodes])
  const selectedNode = selectedNodeKey
    ? nodeByKey.get(selectedNodeKey) ?? activeNodes[0] ?? null
    : activeNodes[0] ?? null
  const selectedGuidance = selectedNode
    ? buildOutputGuidanceBundleForNode({
      node: selectedNode,
      worldWiki: readRecord(snapshot.draft.metadata).worldWiki,
    })
    : null
  const stepsByNodeKey = useMemo(
    () => new Map((displayRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [displayRun?.steps],
  )
  const assetByKey = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.key, asset])), [snapshot.assets])
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedOutputPreview = truncatePreview(readOutputPreview(selectedStep) || readNodeOutputPreview(selectedNode))
  const selectedOutputImageUrl = useMemo(() => {
    const outputs = readRecord(selectedStep?.outputs)
    const image = readRecord(outputs.image)
    const preview = readRecord(readRecord(selectedNode?.metadata).outputPreview)
    const assetKey = readTrimmedString(image.assetKey)
      || readTrimmedString(outputs.assetKey)
      || readStringArray(preview.assetKeys)[0]
    const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
    return resolveAssetSourceUrl(asset) || null
  }, [assetByKey, selectedNode?.metadata, selectedStep?.outputs])
  const runStepCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const step of displayRun?.steps ?? []) {
      const key = statusKeyForStep(step)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [displayRun?.steps])
  const canRetryActiveRun = activeRun
    ? isTerminalOutputWorkflowRunStatus(activeRun.status)
      && ['failed', 'blocked', 'cancelled'].some((status) => (runStepCounts.get(status) ?? 0) > 0)
    : false
  const artifacts = useMemo(() => {
    const byId = new Map(snapshot.outputArtifacts.map((artifact) => [artifact.id, artifact]))
    for (const artifact of displayRun?.artifacts ?? []) {
      byId.set(artifact.id, artifact)
    }
    return [...byId.values()].sort((left, right) => {
      const priorityDelta = artifactSortPriority(left) - artifactSortPriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
  }, [displayRun?.artifacts, snapshot.outputArtifacts])
  const sequenceOutputStatuses = useMemo(() => deriveSequenceOutputStatuses({
    sequenceUnits,
    outputRequests,
    outputRuns: recentOutputRuns,
    outputArtifacts: artifacts,
  }), [artifacts, outputRequests, recentOutputRuns, sequenceUnits])
  const activeRunStatusLabel = activeRun ? formatStatus(displayRun?.status ?? activeRun.status) : 'Idle'
  const runningNodeCount = runStepCounts.get('running') ?? 0
  const failedNodeCount = (runStepCounts.get('failed') ?? 0) + (runStepCounts.get('blocked') ?? 0)
  const completedNodeCount = (runStepCounts.get('completed') ?? 0) + (runStepCounts.get('skipped') ?? 0)
  const runUsageSummary = useMemo(
    () => buildRunUsageSummary(displayRun, activeWorkflow),
    [activeWorkflow, displayRun],
  )
  const selectedUsageSummary = readStepAiUsage(selectedStep) ?? readStepAiUsageEstimate(selectedStep)
  const cinematicScriptViewData = useMemo(
    () => buildCinematicScriptViewData(activeWorkflow, displayRun),
    [activeWorkflow, displayRun],
  )
  const cinematicV2ProductionEstimate = useMemo(
    () => buildCinematicV2ProductionEstimate(cinematicScriptViewData, activeNodes),
    [activeNodes, cinematicScriptViewData],
  )
  const activeCinematicTimelineModalData = useMemo(
    () => buildCinematicV2TimelineModalData(activeWorkflow, displayRun),
    [activeWorkflow, displayRun],
  )
  const cinematicVideoApproved = readRecord(displayRun?.input).cinematicVideoApproved === true
    || readRecord(displayRun?.metadata).cinematicVideoApproved === true
  const workflowStages = useMemo(() => buildWorkflowStages({
    nodes: activeNodes,
    levels: workflowExecutionPlan?.levels ?? [],
    nodeByKey,
    stepsByNodeKey,
  }), [activeNodes, nodeByKey, stepsByNodeKey, workflowExecutionPlan?.levels])
  const primaryArtifact = artifacts.find((artifact) => artifact.mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' || artifact.kind === 'pdf')
    ?? artifacts.find((artifact) => artifact.kind === 'image')
    ?? artifacts[0]
    ?? null
  const activeWorkflowNeedsCoverUpgrade = Boolean(
    activeWorkflow
    && activeWorkflow.preset === 'ebook_from_world'
    && activeNodes.length > 0
    && (!nodeByKey.has('cover_prompt') || !nodeByKey.has('cover_image')),
  )

  useEffect(() => {
    let cancelled = false
    void onLoadOutputInbox().catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load output history.')
    })
    return () => {
      cancelled = true
    }
  }, [snapshot.draft.id])

  useEffect(() => {
    if (!graphOpen || !activeWorkflow) return undefined
    const subscription = onSubscribeOutputWorkflowGraphSignals({
      draftId: snapshot.draft.id,
      workflowId: activeWorkflow.id,
      runId: activeRun?.id ?? null,
      onSignal: () => scheduleOutputGraphRefresh(500),
    })
    graphLastRefreshAtRef.current = Date.now()
    const pollActive = () => {
      if (activeRun && !isTerminalOutputWorkflowRunStatus(activeRun.status)) {
        const elapsed = Date.now() - graphLastRefreshAtRef.current
        if (elapsed >= 1200) scheduleOutputGraphRefresh(0)
      }
      graphWatchdogTimerRef.current = window.setTimeout(pollActive, 1500)
    }
    graphWatchdogTimerRef.current = window.setTimeout(pollActive, 1500)
    void refreshOutputGraph({ quiet: true })
    return () => {
      void subscription.unsubscribe()
      if (graphRefreshTimerRef.current !== null) window.clearTimeout(graphRefreshTimerRef.current)
      if (graphRetryTimerRef.current !== null) window.clearTimeout(graphRetryTimerRef.current)
      if (graphWatchdogTimerRef.current !== null) window.clearTimeout(graphWatchdogTimerRef.current)
      graphRefreshTimerRef.current = null
      graphRetryTimerRef.current = null
      graphWatchdogTimerRef.current = null
    }
  }, [activeRun?.id, activeRun?.status, activeWorkflow?.id, graphOpen, snapshot.draft.id])

  useEffect(() => {
    if (!graphOpen || !activeWorkflow || !selectedNodeKey) return
    scheduleOutputGraphRefresh(0)
  }, [activeWorkflow?.id, graphOpen, selectedNodeKey])

  useEffect(() => {
    if (selectedComicSequenceKey && sequenceUnits.some((entity) => entity.key === selectedComicSequenceKey)) return
    setSelectedComicSequenceKey(sequenceUnits[0]?.key ?? '')
  }, [selectedComicSequenceKey, sequenceUnits])

  async function createPromptOutputRequest(promptText: string) {
    const cleanPrompt = promptText.trim()
    if (!cleanPrompt) {
      setError('Describe the output you want to make from this world.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await onStartOutputRequest({
        prompt: cleanPrompt,
        sourceSurface: 'outputs',
        imageQuality: requestImageQuality === 'preset' ? undefined : requestImageQuality,
        imageOutputFormat: requestImageOutputFormat === 'preset' ? undefined : requestImageOutputFormat,
        cinematicReferenceMode: aiGenerationSettings.outputWorkflow.cinematicReferenceModeDefault,
        cinematicV2AnimaticMode: 'fast_panels',
        debugCinematicStoryboardStyleSafeMode: aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault,
        cinematicStoryboardStyleOverride: aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt,
        debugSkipVideoGeneration: aiGenerationSettings.outputWorkflow.debugSkipVideoGenerationDefault,
      })
      setSelectedRequestId(response.request.id)
      if (response.run) {
        setActiveRunId(response.run.id)
        rememberLiveRun(response.run)
      }
      setBusy(false)
      if (response.request.latestRunId) await pollRequest(response.request.id)
      await onRefreshLiveSnapshot()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Output request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createSequenceOutputRequest(sequenceKey: string, outputKind: 'cinematic' | 'comic') {
    const sequence = sequenceUnits.find((entity) => entity.key === sequenceKey)
    if (!sequence) {
      setError('Select a story unit before generating from it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const cinematic = outputKind === 'cinematic'
      const response = await onStartOutputRequest({
        prompt: cinematic
          ? `Create a cinematic animatic from ${sequence.name}.`
          : `Create a comic issue from ${sequence.name}.`,
        sourceSurface: 'outputs_story_unit',
        selectedSequenceUnitKeys: [sequence.key],
        pageCount: cinematic ? undefined : comicPageCount,
        targetFormat: cinematic ? 'video' : 'pdf',
        imageQuality: requestImageQuality === 'preset' ? undefined : requestImageQuality,
        imageOutputFormat: requestImageOutputFormat === 'preset' ? undefined : requestImageOutputFormat,
        cinematicReferenceMode: cinematic ? aiGenerationSettings.outputWorkflow.cinematicReferenceModeDefault : undefined,
        cinematicPipelineVersion: cinematic ? 'v3_script_storyboards' : undefined,
        cinematicV2AnimaticMode: cinematic ? 'fast_panels' : undefined,
        debugCinematicStoryboardStyleSafeMode: cinematic ? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault : undefined,
        cinematicStoryboardStyleOverride: cinematic ? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt : undefined,
        debugSkipVideoGeneration: cinematic ? true : undefined,
      })
      setSelectedRequestId(response.request.id)
      if (response.run) {
        setActiveRunId(response.run.id)
        rememberLiveRun(response.run)
      }
      setBusy(false)
      if (response.request.latestRunId) await pollRequest(response.request.id)
      await onRefreshLiveSnapshot()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Story-unit output request failed.')
    } finally {
      setBusy(false)
    }
  }

  function openSequenceOutput(status: SequenceOutputStatus) {
    const request = status.latestRequest
    if (!request) return
    setSelectedRequestId(request.id)
    setInspectorMode('output')
    if (request.latestRunId) setActiveRunId(request.latestRunId)
  }

  async function pollRequest(requestId: string) {
    let status = await onGetOutputRequestStatus(requestId)
    if (status.run) {
      setActiveRunId(status.run.id)
      rememberLiveRun(status.run)
    }
    while (!status.terminal && status.run && !isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputRequestStatus(requestId)
      if (status.run) rememberLiveRun(status.run)
    }
  }

  async function createAndRunEbookWorkflow() {
    setBusy(true)
    setError(null)
    try {
      const sequenceKeys = sequenceUnits.map((entity) => entity.key)
      const entityKeys = castAndContext.slice(0, 24).map((entity) => entity.key)
      const planResponse = await onPlanOutputWorkflow({
        prompt,
        preset: 'ebook_from_world',
        selectedEntityKeys: entityKeys,
        selectedSequenceUnitKeys: sequenceKeys,
        targetFormat: 'pdf',
      })
      const startResponse = await onStartOutputWorkflow(planResponse.plan)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: startResponse.workflow.id,
        prompt: planResponse.plan.prompt,
        targetFormat: 'pdf',
        selectedEntityKeys: planResponse.plan.sourceEntityKeys,
        selectedSequenceUnitKeys: planResponse.plan.sourceSequenceUnitKeys,
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Output workflow failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createAndRunComicWorkflow() {
    if (!selectedComicSequenceKey) {
      setError('Select one sequence unit before generating a comic issue.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pageCount = Math.max(1, Math.min(12, comicPageCount))
      const planResponse = await onPlanOutputWorkflow({
        prompt: comicPrompt,
        preset: 'comic_issue_from_sequence',
        selectedEntityKeys: [],
        selectedSequenceUnitKeys: [selectedComicSequenceKey],
        pageCount,
        targetFormat: 'pdf',
        imageQuality: requestImageQuality === 'preset' ? undefined : requestImageQuality,
        imageOutputFormat: requestImageOutputFormat === 'preset' ? undefined : requestImageOutputFormat,
      })
      const startResponse = await onStartOutputWorkflow(planResponse.plan)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: startResponse.workflow.id,
        prompt: planResponse.plan.prompt,
        targetFormat: 'pdf',
        selectedEntityKeys: planResponse.plan.sourceEntityKeys,
        selectedSequenceUnitKeys: planResponse.plan.sourceSequenceUnitKeys,
        pageCount,
        input: { pageCount },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Comic workflow failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pollRun(runId: string) {
    let status = await onGetOutputWorkflowStatus(runId)
    rememberLiveRun(status.run)
    while (!isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputWorkflowStatus(runId)
      rememberLiveRun(status.run)
    }
    return status
  }

  async function refreshOutputGraph(options: {
    manual?: boolean
    quiet?: boolean
    selectedNodeKey?: string | null
    workflowId?: string
    runId?: string | null
  } = {}) {
    const workflowId = options.workflowId ?? activeWorkflow?.id
    if (!workflowId) return
    const sequence = graphRefreshSeqRef.current + 1
    graphRefreshSeqRef.current = sequence
    const selectedKey = options.selectedNodeKey ?? selectedNodeKey ?? null
    if (!options.quiet) setRefreshingGraph(true)
    if (options.manual) setError(null)
    const graphRunId = options.runId ?? activeRun?.id ?? null
    try {
      await onLoadOutputWorkflowGraph(workflowId, graphRunId, selectedKey)
      if (sequence !== graphRefreshSeqRef.current) return
      graphLastRefreshAtRef.current = Date.now()
      graphBackoffMsRef.current = 0
      setGraphSyncDelayed(false)
      setGraphSyncDelayedMessage(null)
    } catch (refreshError) {
      if (sequence !== graphRefreshSeqRef.current) return
      const message = refreshError instanceof Error ? refreshError.message : 'Could not refresh output workflow graph.'
      console.warn('[GraphCore] output workflow graph sync delayed.', {
        workflowId,
        runId: graphRunId,
        selectedNodeKey: selectedKey,
        message,
      })
      if (options.manual || !options.quiet) setError(message)
      setGraphSyncDelayed(true)
      setGraphSyncDelayedMessage(message)
      const nextBackoff = graphBackoffMsRef.current > 0
        ? Math.min(10000, graphBackoffMsRef.current * 2)
        : 1500
      graphBackoffMsRef.current = nextBackoff
      if (graphRetryTimerRef.current !== null) window.clearTimeout(graphRetryTimerRef.current)
      const jitter = Math.round(Math.random() * 350)
      graphRetryTimerRef.current = window.setTimeout(() => {
        graphRetryTimerRef.current = null
        void refreshOutputGraph({ quiet: true, workflowId, runId: graphRunId, selectedNodeKey: selectedKey })
      }, nextBackoff + jitter)
    } finally {
      if (!options.quiet && sequence === graphRefreshSeqRef.current) setRefreshingGraph(false)
    }
  }

  function scheduleOutputGraphRefresh(delayMs = 500) {
    if (!graphOpen || !activeWorkflow) return
    if (graphRefreshTimerRef.current !== null) window.clearTimeout(graphRefreshTimerRef.current)
    graphRefreshTimerRef.current = window.setTimeout(() => {
      graphRefreshTimerRef.current = null
      void refreshOutputGraph({ quiet: true })
    }, delayMs)
  }

  function openOutputGraph() {
    setGraphOpen(true)
    void refreshOutputGraph({ manual: true })
  }

  async function openOutputGraphForRequest(request: OutputRequest | null | undefined) {
    if (!request?.workflowId) return
    setSelectedRequestId(request.id)
    if (request.latestRunId) setActiveRunId(request.latestRunId)
    setSelectedNodeKey(null)
    setGraphOpen(true)
    setRefreshingGraph(true)
    setError(null)
    try {
      await onLoadOutputWorkflowGraph(request.workflowId, request.latestRunId ?? null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not open output workflow graph.')
    } finally {
      setRefreshingGraph(false)
    }
  }

  async function refreshOpenGraphAfterRun(workflowId: string, runId: string) {
    if (!graphOpen) return
    await onLoadOutputWorkflowGraph(workflowId, runId, selectedNodeKey ?? null)
  }

  async function openCinematicTimelineForRequest(request: OutputRequest | null | undefined) {
    if (!request?.workflowId) return
    setSelectedRequestId(request.id)
    if (request.latestRunId) setActiveRunId(request.latestRunId)
    setTimelineOpeningRequestId(request.id)
    setError(null)
    try {
      let workflow = workflows.find((entry) => entry.id === request.workflowId) ?? null
      let run = request.latestRunId
        ? recentOutputRuns.find((entry) => entry.id === request.latestRunId) ?? null
        : null
      let modalData = buildCinematicV2TimelineModalData(workflow, run)
      if (!modalData) {
        const status = await onGetOutputRequestStatus(request.id)
        if (status.run) {
          run = status.run
          setActiveRunId(status.run.id)
          rememberLiveRun(status.run)
        }
        if (!workflow) {
          await onLoadOutputWorkflowGraph(request.workflowId, run?.id ?? request.latestRunId ?? null)
          workflow = workflows.find((entry) => entry.id === request.workflowId) ?? null
        }
        modalData = buildCinematicV2TimelineModalData(workflow, run)
      }
      if (!modalData) {
        throw new Error('Timeline pending. Run or refresh this cinematic until the V2 shot plan is available.')
      }
      setCinematicTimelineModal(modalData)
    } catch (timelineError) {
      setError(timelineError instanceof Error ? timelineError.message : 'Could not open cinematic timeline.')
    } finally {
      setTimelineOpeningRequestId(null)
    }
  }

  function openCinematicTimelineForActiveWorkflow() {
    if (!activeCinematicTimelineModalData) {
      setError('Timeline pending. Run or refresh this cinematic until the V2 shot plan is available.')
      return
    }
    setCinematicTimelineModal(activeCinematicTimelineModalData)
  }

  function closeOutputGraphOverlay() {
    setGraphOpen(false)
    if (returnToSourceOnClose) {
      setReturnToSourceOnClose(false)
      onReturnToSourceSurface?.()
    }
  }

  function closeCinematicTimelineModal() {
    setCinematicTimelineModal(null)
    if (returnToSourceOnClose) {
      setReturnToSourceOnClose(false)
      onReturnToSourceSurface?.()
    }
  }

  useEffect(() => {
    if (!openIntent) return
    const request = openIntent.requestId
      ? outputRequests.find((entry) => entry.id === openIntent.requestId) ?? null
      : outputRequests[0] ?? null
    if (!request) return
    setSelectedRequestId(request.id)
    setActiveRunId(request.latestRunId ?? null)
    if (request.workflowId) setSelectedNodeKey(null)
    setReturnToSourceOnClose(Boolean(openIntent.returnToSourceOnClose && (openIntent.target === 'graph' || openIntent.target === 'timeline')))
    if (openIntent.target === 'graph') {
      void openOutputGraphForRequest(request)
    } else if (openIntent.target === 'timeline') {
      void openCinematicTimelineForRequest(request)
    }
  }, [openIntent?.nonce])

  function resolveTimelineWorkflowId(workflowId?: string | null, runId?: string | null) {
    const directWorkflowId = readTrimmedString(workflowId)
    if (directWorkflowId) return directWorkflowId
    const runWorkflowId = runId
      ? readTrimmedString(recentOutputRuns.find((run) => run.id === runId)?.workflowId)
      : ''
    if (runWorkflowId) return runWorkflowId
    return readTrimmedString(activeWorkflow?.id)
  }

  async function previewCinematicDirectorNoteFromTimeline(request: {
    workflowId: string
    runId?: string | null
    note: string
    scope: CinematicDirectorNoteScope
  }) {
    const workflowId = resolveTimelineWorkflowId(request.workflowId, request.runId)
    if (!workflowId) throw new Error('Timeline is missing its workflow id. Reopen the timeline from the output row and try again.')
    return onPreviewCinematicDirectorNote({
      ...request,
      workflowId,
    })
  }

  async function applyCinematicDirectorPatchAndRegenerate(request: {
    workflowId: string
    runId?: string | null
    preview: CinematicDirectorPatchPreview
    startRegeneration: boolean
  }) {
    setBusy(true)
    setError(null)
    try {
      const resolvedWorkflowId = resolveTimelineWorkflowId(request.workflowId, request.runId)
      if (!resolvedWorkflowId) throw new Error('Timeline is missing its workflow id. Reopen the timeline from the output row and try again.')
      const normalizedRequest = { ...request, workflowId: resolvedWorkflowId }
      const result = await onApplyCinematicDirectorPatch(normalizedRequest)
      const patchedWorkflow = result.workflow as unknown as OutputWorkflow
      const refreshedModalData = buildCinematicV2TimelineModalData(patchedWorkflow, activeRun)
      if (refreshedModalData) setCinematicTimelineModal(refreshedModalData)
      const runRequest = result.regenerationRunRequest && typeof result.regenerationRunRequest === 'object'
        ? result.regenerationRunRequest as Record<string, unknown>
        : null
      if (normalizedRequest.startRegeneration && runRequest) {
        const priorRun = request.runId
          ? recentOutputRuns.find((run) => run.id === request.runId) ?? null
          : activeRun
        const priorInput = readRecord(priorRun?.input)
        const runResponse = await onStartOutputWorkflowRun({
          workflowId: normalizedRequest.workflowId,
          prompt: readTrimmedString(priorRun?.prompt) || request.preview.userNote,
          targetFormat: 'video',
          selectedEntityKeys: Array.isArray(priorInput.sourceEntityKeys) ? priorInput.sourceEntityKeys.map(String) : [],
          selectedSequenceUnitKeys: Array.isArray(priorInput.sourceSequenceUnitKeys) ? priorInput.sourceSequenceUnitKeys.map(String) : [],
          input: {
            ...priorInput,
            debugSkipVideoGeneration: true,
            cinematicVideoApproved: false,
          },
          metadata: runRequest,
        })
        setActiveRunId(runResponse.run.id)
        rememberLiveRun(runResponse.run)
        void pollRun(runResponse.run.id)
          .then(() => onRefreshLiveSnapshot())
          .catch((pollError) => {
            setError(pollError instanceof Error ? pollError.message : 'Director-note rerun failed.')
          })
      }
      await onRefreshLiveSnapshot()
      await onLoadOutputWorkflowGraph(normalizedRequest.workflowId, request.runId ?? null)
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not apply director notes.')
      throw applyError
    } finally {
      setBusy(false)
    }
  }

  async function undoLastCinematicDirectorEdit(request: {
    workflowId: string
    runId?: string | null
  }) {
    const workflow = workflows.find((entry) => entry.id === request.workflowId) ?? activeWorkflow
    const metadata = readRecord(workflow?.metadata)
    const edits = Array.isArray(metadata.cinematicV2DirectorEdits)
      ? metadata.cinematicV2DirectorEdits.map(readRecord).filter((entry) => Object.keys(entry).length > 0)
      : []
    const lastEdit = edits[edits.length - 1]
    const inversePatch = Array.isArray(lastEdit?.inversePatch) ? lastEdit.inversePatch : []
    const scope = readRecord(lastEdit?.scope)
    const regenerationPlan = readRecord(lastEdit?.regenerationPlan)
    if (!lastEdit || inversePatch.length === 0 || !scope.type || Object.keys(regenerationPlan).length === 0) {
      throw new Error('No reversible director edit is available for this cinematic.')
    }
    const preview = cinematicDirectorPatchPreviewSchema.parse({
      id: `undo_${readTrimmedString(lastEdit.versionId) || Date.now()}`,
      status: 'preview',
      userNote: `Undo director edit: ${readTrimmedString(lastEdit.userNote) || 'previous change'}`,
      scope,
      summary: `Undo last director edit${readTrimmedString(lastEdit.userNote) ? `: ${readTrimmedString(lastEdit.userNote)}` : ''}.`,
      riskLevel: readTrimmedString(regenerationPlan.riskLevel) || 'medium',
      operations: inversePatch,
      regenerationPlan,
      inverseOperations: Array.isArray(lastEdit.patch) ? lastEdit.patch : [],
      diagnostics: [],
    })
    await applyCinematicDirectorPatchAndRegenerate({
      workflowId: request.workflowId,
      runId: request.runId ?? null,
      preview,
      startRegeneration: true,
    })
  }

  function markTargetedNodes(nodeKeys: string[], runScope: OutputWorkflowRunScope) {
    const cleanKeys = nodeKeys.map((key) => key.trim()).filter(Boolean)
    if (cleanKeys.length === 0) return
    setTargetedRunScope(runScope)
    setTargetedNodeKeys((current) => Array.from(new Set([...current, ...cleanKeys])))
  }

  function unmarkTargetedNodes(nodeKeys: string[]) {
    const removeKeys = new Set(nodeKeys)
    setTargetedNodeKeys((current) => current.filter((key) => !removeKeys.has(key)))
  }

  async function cancelActiveRun() {
    if (!activeRun) return
    setBusy(true)
    setError(null)
    try {
      await onCancelOutputWorkflowRun(activeRun.id)
      await onRefreshLiveSnapshot()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel output workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function retryActiveRunFromFailedNodes() {
    if (!activeRun) return
    setBusy(true)
    setError(null)
    try {
      const previousInput = readRecord(activeRun.input)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeRun.workflowId,
        prompt: activeRun.prompt || prompt,
        targetFormat: activeRun.targetFormat as 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        input: previousInput,
        metadata: {
          retryOfRunId: activeRun.id,
          retryMode: 'reuse_completed_node_hashes',
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Could not retry output workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function runSelectedNodeOnly(
    node: OutputWorkflowNode,
    runScope: OutputWorkflowRunScope = 'node_only',
  ) {
    if (!activeWorkflow) {
      setError('Select or create an output workflow before running a node.')
      return
    }
    const config = readRecord(node.config)
    const purpose = readTrimmedString(config.purpose)
    const isComicWorkflow = activeWorkflow?.preset === 'comic_issue_from_sequence' || nodeByKey.has('comic_pdf_render')
    const renderNodeKey = isComicWorkflow ? 'comic_pdf_render' : 'document_render'
    const pageNumber = readNumber(config.pageNumber) ?? 0
    const pageImageKey = pageNumber > 0 ? `page_${String(pageNumber).padStart(3, '0')}_image` : ''
    const pdfRebake = node.nodeType === 'output_artifact'
    const documentRefresh = node.nodeType === 'document_render'
    const comicAtlasRerun = purpose === 'comic_atlas_prompt' || purpose === 'comic_style_atlas'
    const comicPageRerun = purpose === 'comic_page_prompt' || purpose === 'comic_page'
    const requestedRunScope: OutputWorkflowRunScope = pdfRebake ? 'artifact_rebake' : documentRefresh && runScope === 'node_only' ? 'artifact_rebake' : runScope
    const cachePreflight = buildTargetedRunCachePreflight({
      node,
      edges: activeEdges,
      nodeByKey,
      stepsByNodeKey,
    })
    const autoRepairUpstream = requestedRunScope === 'node_only'
      && (cachePreflight.missingRequiredUpstreamKeys.length > 0 || cachePreflight.staleUpstreamKeys.length > 0)
    const effectiveRunScope: OutputWorkflowRunScope = autoRepairUpstream ? 'upstream_to_node' : requestedRunScope
    const defaultDownstreamTarget = comicAtlasRerun
      ? 'comic_atlas_image'
      : purpose === 'ebook_cover_image' || purpose === 'ebook_cover_prompt' || comicPageRerun
        ? 'artifact'
        : documentRefresh
          ? renderNodeKey
          : node.key
    const targetNodeKeys = effectiveRunScope === 'node_and_downstream'
      ? [node.key]
      : effectiveRunScope === 'artifact_rebake'
        ? ['artifact']
        : effectiveRunScope === 'upstream_to_node'
          ? [node.key]
          : [node.key]
    const forceNodeKeys = effectiveRunScope === 'artifact_rebake'
      ? Array.from(new Set([renderNodeKey, 'artifact'].filter(Boolean)))
      : effectiveRunScope === 'node_and_downstream'
        ? Array.from(new Set([
            node.key,
            purpose === 'comic_page_prompt' && pageImageKey ? pageImageKey : '',
            purpose === 'ebook_cover_prompt' || purpose === 'ebook_cover_image' ? 'document_render' : '',
            comicPageRerun ? renderNodeKey : '',
            defaultDownstreamTarget,
          ].filter(Boolean)))
        : [node.key]
    const isCinematicV2ProductionVideo = node.nodeType === 'video_generation'
      && isCinematicV2ProductionNodeConfig(config, node.nodeType)
    const debugForceVideoGeneration = node.nodeType === 'video_generation' && !isCinematicV2ProductionVideo
    const approveCinematicV2VideoNode = isCinematicV2ProductionVideo
    markTargetedNodes([node.key], effectiveRunScope)
    setError(null)
    try {
      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput: Record<string, unknown> = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runInput = debugForceVideoGeneration
        ? { ...previousInput, debugSkipVideoGeneration: false }
        : approveCinematicV2VideoNode
          ? {
              ...previousInput,
              debugSkipVideoGeneration: false,
              cinematicVideoApproved: true,
              cinematicVideoApprovalScope: 'manual_node_run',
              cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
            }
          : previousInput
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (approveCinematicV2VideoNode ? 'video' : activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video',
        selectedEntityKeys: readStringArray(runInput['sourceEntityKeys']),
        selectedSequenceUnitKeys: readStringArray(runInput['sourceSequenceUnitKeys']),
        pageCount: readNumber(runInput['pageCount']) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: effectiveRunScope === 'artifact_rebake' ? 'pdf_rebake_from_existing_outputs' : 'targeted_node_preview',
          requestedRunScope,
          effectiveRunScope,
          autoRepairUpstream,
          cachePreflight,
          runScope: effectiveRunScope,
          targetNodeKeys,
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: effectiveRunScope === 'node_only',
          debugForceVideoGeneration,
          ...(approveCinematicV2VideoNode
            ? {
                debugSkipVideoGeneration: false,
                cinematicVideoApproved: true,
                cinematicVideoApprovalScope: 'manual_node_run',
                cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
              }
            : {}),
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(node.key)
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(activeWorkflow.id, runResponse.run.id)
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : 'Could not rerun the selected output node.')
    } finally {
      unmarkTargetedNodes([node.key])
    }
  }

  async function runSelectedNodesOnly(
    nodes: OutputWorkflowNode[],
    runScope: OutputWorkflowRunScope = 'node_only',
  ) {
    const uniqueNodes = Array.from(new Map(nodes.map((node) => [node.key, node])).values())
    if (uniqueNodes.length === 0) return
    if (uniqueNodes.length === 1) {
      await runSelectedNodeOnly(uniqueNodes[0], runScope)
      return
    }
    if (!activeWorkflow) {
      setError('Select or create an output workflow before running nodes.')
      return
    }
    const nodeKeys = uniqueNodes.map((node) => node.key)
    const debugForceVideoGeneration = uniqueNodes.some((node) => (
      node.nodeType === 'video_generation'
      && !isCinematicV2ProductionNodeConfig(readRecord(node.config), node.nodeType)
    ))
    const approveCinematicV2VideoNodes = uniqueNodes.some((node) => (
      node.nodeType === 'video_generation'
      && isCinematicV2ProductionNodeConfig(readRecord(node.config), node.nodeType)
    ))
    const cachePreflights = uniqueNodes.map((node) => ({
      nodeKey: node.key,
      ...buildTargetedRunCachePreflight({
        node,
        edges: activeEdges,
        nodeByKey,
        stepsByNodeKey,
      }),
    }))
    const autoRepairUpstream = runScope === 'node_only'
      && cachePreflights.some((entry) => entry.missingRequiredUpstreamKeys.length > 0 || entry.staleUpstreamKeys.length > 0)
    const effectiveRunScope: OutputWorkflowRunScope = autoRepairUpstream ? 'upstream_to_node' : runScope
    markTargetedNodes(nodeKeys, effectiveRunScope)
    setError(null)
    try {
      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput: Record<string, unknown> = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runInput = debugForceVideoGeneration
        ? { ...previousInput, debugSkipVideoGeneration: false }
        : approveCinematicV2VideoNodes
          ? {
              ...previousInput,
              debugSkipVideoGeneration: false,
              cinematicVideoApproved: true,
              cinematicVideoApprovalScope: 'manual_node_batch_run',
              cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
            }
          : previousInput
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (approveCinematicV2VideoNodes ? 'video' : activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video',
        selectedEntityKeys: readStringArray(runInput['sourceEntityKeys']),
        selectedSequenceUnitKeys: readStringArray(runInput['sourceSequenceUnitKeys']),
        pageCount: readNumber(runInput['pageCount']) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: 'targeted_node_batch_preview',
          requestedRunScope: runScope,
          effectiveRunScope,
          autoRepairUpstream,
          cachePreflight: cachePreflights,
          runScope: effectiveRunScope,
          targetNodeKeys: nodeKeys,
          forceNodeKeys: nodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: effectiveRunScope === 'node_only',
          debugForceVideoGeneration,
          ...(approveCinematicV2VideoNodes
            ? {
                debugSkipVideoGeneration: false,
                cinematicVideoApproved: true,
                cinematicVideoApprovalScope: 'manual_node_batch_run',
                cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
              }
            : {}),
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(uniqueNodes[0].key)
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(activeWorkflow.id, runResponse.run.id)
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : 'Could not rerun the selected output nodes.')
    } finally {
      unmarkTargetedNodes(nodeKeys)
    }
  }

  async function approveCinematicV2VideoProduction() {
    if (!activeWorkflow) {
      setError('Select a cinematic workflow before approving video production.')
      return
    }
    const workflowMetadata = readRecord(activeWorkflow.metadata)
    const videoNodes = activeNodes.filter((node) => (
      node.nodeType === 'video_generation'
      && isCinematicV2ProductionNodeConfig(readRecord(node.config), node.nodeType)
    ))
    const timelineNode = activeNodes.find((node) => (
      readTrimmedString(readRecord(node.config).purpose) === 'cinematic_v2_timeline_assemble'
    ))
    const artifactNode = activeNodes.find((node) => (
      node.nodeType === 'output_artifact'
      && readTrimmedString(readRecord(node.config).purpose) === 'cinematic_video_artifact'
    ))
    if (videoNodes.length === 0) {
      setError('Run the animatic until shot video nodes are available, then approve final video production.')
      return
    }

    const targetNodeKeys = videoNodes.map((node) => node.key)
    const forceNodeKeys = Array.from(new Set([
      ...targetNodeKeys,
      timelineNode?.key ?? '',
      artifactNode?.key ?? '',
    ].filter(Boolean)))
    markTargetedNodes(forceNodeKeys, 'node_and_downstream')
    setApprovingVideoProduction(true)
    setError(null)
    try {
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runInput: Record<string, unknown> = {
        ...previousInput,
        debugSkipVideoGeneration: false,
        cinematicVideoApproved: true,
        cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: 'video',
        selectedEntityKeys: readStringArray(runInput['sourceEntityKeys']),
        selectedSequenceUnitKeys: readStringArray(runInput['sourceSequenceUnitKeys']),
        pageCount: readNumber(runInput['pageCount']) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: 'cinematic_v2_video_production',
          runScope: 'node_and_downstream',
          targetNodeKeys,
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: false,
          debugSkipVideoGeneration: false,
          cinematicVideoApproved: true,
          cinematicVideoProductionEstimate: cinematicV2ProductionEstimate,
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setInspectorMode('script')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(activeWorkflow.id, runResponse.run.id)
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Could not approve cinematic video production.')
    } finally {
      setApprovingVideoProduction(false)
      unmarkTargetedNodes(forceNodeKeys)
    }
  }

  async function generateCinematicV2QualityKeyframes() {
    if (!activeWorkflow) {
      setError('Select a cinematic workflow before generating quality keyframes.')
      return
    }
    const fanoutNode = activeNodes.find((node) => readTrimmedString(readRecord(node.config).purpose) === 'cinematic_v2_dynamic_shot_fanout')
    if (!fanoutNode) {
      setError('Run the fast animatic until the V2 fanout node is available, then generate quality keyframes.')
      return
    }
    const workflowMetadata = readRecord(activeWorkflow.metadata)
    const forceNodeKeys = [fanoutNode.key]
    markTargetedNodes(forceNodeKeys, 'node_and_downstream')
    setUpgradingAnimaticQuality(true)
    setError(null)
    try {
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runInput: Record<string, unknown> = {
        ...previousInput,
        cinematicV2AnimaticMode: 'quality_keyframes',
        debugSkipVideoGeneration: true,
        cinematicVideoApproved: false,
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: 'video',
        selectedEntityKeys: readStringArray(runInput['sourceEntityKeys']),
        selectedSequenceUnitKeys: readStringArray(runInput['sourceSequenceUnitKeys']),
        pageCount: readNumber(runInput['pageCount']) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: 'cinematic_v2_quality_keyframes',
          runScope: 'full_workflow',
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: false,
          cinematicV2AnimaticMode: 'quality_keyframes',
          debugSkipVideoGeneration: true,
          cinematicVideoApproved: false,
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setInspectorMode('script')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(activeWorkflow.id, runResponse.run.id)
    } catch (qualityError) {
      setError(qualityError instanceof Error ? qualityError.message : 'Could not generate quality cinematic keyframes.')
    } finally {
      setUpgradingAnimaticQuality(false)
      unmarkTargetedNodes(forceNodeKeys)
    }
  }

  function cinematicV2QualityShotIdsForWorkflow(workflowId: string, nextShotId: string) {
    void workflowId
    return [nextShotId]
  }

  function cinematicV2ShotKeyPrefix(shot: CinematicTimelineShotClip) {
    const idMatch = /(?:^|_)(\d+)$/.exec(shot.id)
    const shotNumber = idMatch ? Number(idMatch[1]) : shot.shotIndex + 1
    return `cinematic_v2_shot_${String(shotNumber).padStart(3, '0')}`
  }

  async function generateTimelineShotQualityKeyframe(request: {
    workflowId: string
    runId?: string | null
    shot: CinematicTimelineShotClip
  }) {
    const workflow = workflows.find((entry) => entry.id === request.workflowId) ?? activeWorkflow
    if (!workflow || workflow.id !== request.workflowId) {
      setError('Load the cinematic workflow graph before generating a shot keyframe.')
      return
    }
    const workflowNodes = snapshot.outputWorkflowNodes.filter((node) => node.workflowId === workflow.id)
    const fanoutNodeKey = workflowNodes.find((node) => readTrimmedString(readRecord(node.config).purpose) === 'cinematic_v2_dynamic_shot_fanout')?.key
      ?? 'cinematic_v2_dynamic_shot_fanout'
    const shotKeyPrefix = cinematicV2ShotKeyPrefix(request.shot)
    const targetNodeKeys = [`${shotKeyPrefix}_keyframe`, `${shotKeyPrefix}_keyframe_qa`]
    const forceNodeKeys = [
      `${shotKeyPrefix}_asset_pack`,
      `${shotKeyPrefix}_keyframe_prompt`,
      `${shotKeyPrefix}_keyframe`,
      `${shotKeyPrefix}_keyframe_qa`,
    ]
    const allTargetedKeys = [fanoutNodeKey, ...forceNodeKeys]
    const workflowLatestRun = recentOutputRuns.find((run) => run.workflowId === workflow.id) ?? null
    const activeWorkflowRun = activeRun?.workflowId === workflow.id ? activeRun : null
    const sourceRun = request.runId
      ? recentOutputRuns.find((run) => run.id === request.runId) ?? activeWorkflowRun ?? workflowLatestRun
      : activeWorkflowRun ?? workflowLatestRun
    const workflowMetadata = readRecord(workflow.metadata)
    const previousInput: Record<string, unknown> = sourceRun ? readRecord(sourceRun.input) : {
      sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
      sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
      pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
    }
    const cinematicV2QualityShotIds = cinematicV2QualityShotIdsForWorkflow(workflow.id, request.shot.id)
    const runInput: Record<string, unknown> = {
      ...previousInput,
      cinematicV2AnimaticMode: 'fast_panels',
      cinematicV2QualityShotIds,
      debugSkipVideoGeneration: true,
      cinematicVideoApproved: false,
    }

    markTargetedNodes(allTargetedKeys, 'upstream_to_node')
    setEnhancingTimelineShotId(request.shot.id)
    setError(null)
    try {
      const materializeRun = await onStartOutputWorkflowRun({
        workflowId: workflow.id,
        prompt: sourceRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: 'video',
        selectedEntityKeys: readStringArray(runInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(runInput.sourceSequenceUnitKeys),
        pageCount: readNumber(runInput.pageCount) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: sourceRun?.id ?? null,
          runMode: 'cinematic_v2_materialize_shot_quality_keyframe',
          materializationMode: 'selected_shots',
          runScope: 'upstream_to_node',
          targetNodeKeys: [fanoutNodeKey],
          forceNodeKeys: [fanoutNodeKey],
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: false,
          cinematicV2QualityShotIds,
          debugSkipVideoGeneration: true,
          cinematicVideoApproved: false,
        },
      })
      setActiveRunId(materializeRun.run.id)
      rememberLiveRun(materializeRun.run)
      await pollRun(materializeRun.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(workflow.id, materializeRun.run.id)

      const keyframeRun = await onStartOutputWorkflowRun({
        workflowId: workflow.id,
        prompt: sourceRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: 'video',
        selectedEntityKeys: readStringArray(runInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(runInput.sourceSequenceUnitKeys),
        pageCount: readNumber(runInput.pageCount) ?? undefined,
        input: runInput,
        metadata: {
          sourceRunId: sourceRun?.id ?? null,
          materializedRunId: materializeRun.run.id,
          runMode: 'cinematic_v2_shot_quality_keyframe',
          materializationMode: 'selected_shots',
          runScope: 'node_only',
          targetNodeKeys: [`${shotKeyPrefix}_keyframe_prompt`, ...targetNodeKeys],
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: true,
          cinematicV2QualityShotIds,
          debugSkipVideoGeneration: true,
          cinematicVideoApproved: false,
        },
      })
      setActiveRunId(keyframeRun.run.id)
      rememberLiveRun(keyframeRun.run)
      const completedStatus = await pollRun(keyframeRun.run.id)
      await onRefreshLiveSnapshot()
      await refreshOpenGraphAfterRun(workflow.id, keyframeRun.run.id)
      const refreshedModalData = buildCinematicV2TimelineModalData(workflow, completedStatus.run)
      if (refreshedModalData) setCinematicTimelineModal(refreshedModalData)
    } catch (qualityError) {
      setError(qualityError instanceof Error ? qualityError.message : 'Could not generate the shot keyframe.')
    } finally {
      setEnhancingTimelineShotId(null)
      unmarkTargetedNodes(allTargetedKeys)
    }
  }

  async function downloadArtifact(assetUrl: string, artifactName: string, extension: string, mimeType: string, artifactKey: string) {
    setDownloadingArtifactKey(artifactKey)
    setError(null)
    try {
      await downloadArtifactUrl(assetUrl, artifactDownloadFileName(artifactName, extension), mimeType)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download the artifact file.')
    } finally {
      setDownloadingArtifactKey(null)
    }
  }

  async function upgradeActiveWorkflow(mode: 'graph' | 'cover' | 'pdf') {
    if (!activeWorkflow) return
    setUpgradeMode(mode)
    setError(null)
    try {
      await onUpgradeOutputWorkflowPreset({
        workflowId: activeWorkflow.id,
        preset: 'ebook_from_world',
      })
      if (mode === 'graph') {
        await onRefreshLiveSnapshot()
        return
      }

      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        input: previousInput,
            metadata: mode === 'cover'
              ? {
                  sourceRunId: activeRun?.id ?? null,
                  runMode: 'upgrade_cover_only',
                  targetNodeKeys: ['cover_image'],
                  forceNodeKeys: ['cover_prompt', 'cover_image'],
                }
              : {
                  sourceRunId: activeRun?.id ?? null,
                  runMode: 'upgrade_cover_and_rebuild_pdf',
                  targetNodeKeys: ['artifact'],
                  forceNodeKeys: ['cover_prompt', 'cover_image', 'document_render', 'artifact'],
                  reuseExistingUpstreamOutputs: true,
                },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(mode === 'cover' ? 'cover_image' : 'artifact')
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : 'Could not upgrade the output workflow.')
    } finally {
      setUpgradeMode(null)
    }
  }

  return (
    <div className="outputs-workspace">
      {graphOpen && activeWorkflow ? (
        <OutputWorkflowGraphOverlay
          activeRun={displayRun}
          assets={snapshot.assets}
          canRunOutputs={canRunOutputs}
          edges={activeEdges}
          nodes={activeNodes}
          worldEntities={snapshot.worldEntities as unknown as Array<Record<string, unknown>>}
          worldRelationships={snapshot.worldRelationships as unknown as Array<Record<string, unknown>>}
          canOpenTimeline={Boolean(activeCinematicTimelineModalData)}
          onCancelRun={cancelActiveRun}
          onClose={closeOutputGraphOverlay}
          onOpenTimeline={openCinematicTimelineForActiveWorkflow}
          onRefreshGraph={() => void refreshOutputGraph({ manual: true })}
          onRunNode={(node, runScope) => void runSelectedNodeOnly(node, runScope)}
          onRunNodes={(nodes, runScope) => void runSelectedNodesOnly(nodes, runScope)}
          onSaveNode={onUpdateOutputWorkflowNode}
          onSelectNode={(nodeKey) => {
            setSelectedNodeKey(nodeKey)
            setInspectorMode('output')
          }}
          readNodeSkillKeys={readNodeSkillKeys}
          readOutputPreview={readOutputPreview}
          runErrorMessage={graphSyncDelayed
            ? [error, `Graph sync delayed. Showing the last loaded graph while retrying.${graphSyncDelayedMessage ? ` Last error: ${graphSyncDelayedMessage}` : ''}`].filter(Boolean).join('\n')
            : error}
          refreshingGraph={refreshingGraph}
          selectedNodeKey={selectedNode?.key ?? selectedNodeKey}
          targetedNodeKey={targetedNodeKey}
          targetedNodeKeys={targetedNodeKeys}
          targetedRunScope={targetedRunScope}
          workflow={activeWorkflow}
          worldWiki={readRecord(snapshot.draft.metadata).worldWiki}
        />
      ) : null}
      {cinematicTimelineModal ? (
        <CinematicV2TimelineModal
          assets={snapshot.assets}
          enhancingShotId={enhancingTimelineShotId}
          onApplyDirectorPatch={applyCinematicDirectorPatchAndRegenerate}
          onClose={closeCinematicTimelineModal}
          onGenerateQualityKeyframe={canRunOutputs ? generateTimelineShotQualityKeyframe : undefined}
          onPreviewDirectorNote={previewCinematicDirectorNoteFromTimeline}
          onUndoLastDirectorEdit={undoLastCinematicDirectorEdit}
          projection={cinematicTimelineModal.projection}
          runId={cinematicTimelineModal.runId}
          title={cinematicTimelineModal.title}
          workflowId={cinematicTimelineModal.workflowId}
          canUndoLastDirectorEdit={cinematicTimelineModal.canUndoLastDirectorEdit}
        />
      ) : null}
      <header className="outputs-hero">
        <div className="outputs-hero-copy">
          <p className="outputs-eyebrow">Output Studio</p>
          <p>Prompt books, comics, images, and video packages from this world without rebuilding canon.</p>
        </div>
        <div className="outputs-hero-actions">
          <div className="outputs-mode-switch" role="tablist" aria-label="Output modes">
            <button className={mode === 'workflows' ? 'is-active' : ''} onClick={() => setMode('workflows')} type="button">
              Workflows
            </button>
            <button className={mode === 'cinematics' ? 'is-active' : ''} onClick={() => setMode('cinematics')} type="button">
              Cinematics
            </button>
          </div>
        </div>
      </header>

      {mode === 'cinematics' ? (
        <div className="outputs-cinematics-shell">{cinematicsPanel}</div>
      ) : (
        <>
          <section className="outputs-command-center is-prompt-only">
            <section className="outputs-panel outputs-request-composer">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Output creation</p>
                  <h3>{creationMode === 'story_unit' ? 'Create from a story unit' : 'What do you want to make from this world?'}</h3>
                </div>
                <span>{outputRequests.length} requests</span>
              </div>
              <div className="outputs-creation-switch" role="tablist" aria-label="Output creation mode">
                <button className={creationMode === 'prompt' ? 'is-active' : ''} type="button" onClick={() => setCreationMode('prompt')}>
                  Freeform prompt
                </button>
                <button className={creationMode === 'story_unit' ? 'is-active' : ''} type="button" onClick={() => setCreationMode('story_unit')}>
                  From Story Unit
                </button>
              </div>
              {creationMode === 'prompt' ? (
                <OutputPromptComposer
                  busy={busy}
                  canRunOutputs={canRunOutputs}
                  error={error}
                  requestImageQuality={requestImageQuality}
                  requestImageOutputFormat={requestImageOutputFormat}
                  onImageQualityChange={setRequestImageQuality}
                  onImageOutputFormatChange={setRequestImageOutputFormat}
                  onSubmit={(promptText) => void createPromptOutputRequest(promptText)}
                />
              ) : (
                <div className="outputs-story-unit-browser">
                  {sequenceUnits.length === 0 ? (
                    <p className="outputs-muted">No story units are available in this world yet.</p>
                  ) : sequenceUnits.map((sequence, index) => {
                    const status = sequenceOutputStatuses.get(sequence.key) ?? null
                    return (
                      <article className="outputs-story-unit-card" key={sequence.key}>
                        <div className="outputs-story-unit-main">
                          <span>{sequenceOrdinalLabel(sequence, index)}</span>
                          <strong>{sequence.name}</strong>
                          <p>{sequence.summary || sequence.context || 'No story summary yet.'}</p>
                          <div className="outputs-story-unit-statuses">
                            <span className={`is-${status?.cinematicState ?? 'none'}`}>{sequenceStateLabel(status?.cinematicState ?? 'none')}</span>
                            <span className={`is-${status?.comicState ?? 'none'}`}>{sequenceStateLabel(status?.comicState ?? 'none')}</span>
                          </div>
                        </div>
                        <div className="outputs-story-unit-actions">
                          <button type="button" disabled={!canRunOutputs || busy} onClick={() => createSequenceOutputRequest(sequence.key, 'cinematic')}>
                            Generate Animatic
                          </button>
                          <button type="button" disabled={!canRunOutputs || busy} onClick={() => createSequenceOutputRequest(sequence.key, 'comic')}>
                            Generate Comic
                          </button>
                          <button type="button" disabled={!status?.latestRequest} onClick={() => status && openSequenceOutput(status)}>
                            Open Output
                          </button>
                          <button type="button" disabled={!status?.latestRequest?.workflowId || refreshingGraph} onClick={() => void openOutputGraphForRequest(status?.latestRequest)}>
                            {refreshingGraph ? 'Opening...' : 'Open Graph'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                  {!canRunOutputs ? <p className="outputs-error">Output workflows require a live Supabase-backed draft.</p> : null}
                  {error ? <p className="outputs-error">{error}</p> : null}
                </div>
              )}
            </section>
            <aside className="outputs-top-results">
              <section className="outputs-panel outputs-artifacts">
                <div className="outputs-panel-heading">
                  <div>
                    <p className="outputs-eyebrow">Results</p>
                    <h3>Artifacts</h3>
                  </div>
                  <span>{artifacts.length}</span>
                </div>
                {primaryArtifact ? (
                  <div className="outputs-primary-artifact">
                    <span>Latest deliverable</span>
                    <strong>{primaryArtifact.name}</strong>
                    <small>{primaryArtifact.kind.replace(/_/g, ' ')}</small>
                  </div>
                ) : (
                  <div className="outputs-primary-artifact is-empty">
                    <span>Nothing exported yet</span>
                    <strong>Run a workflow to create PDFs, images, and packages.</strong>
                  </div>
                )}
                <div className="outputs-artifact-list">
                  {artifacts.length > 0 ? artifacts.slice(0, 3).map((artifact) => {
                    const asset = artifact.assetKey ? assetByKey.get(artifact.assetKey) ?? null : null
                    const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(readRecord(artifact.metadata))
                    const mimeType = artifact.mimeType || asset?.mimeType || ''
                    const actionLabels = artifactActionLabels(mimeType, artifact.kind)
                    const imageArtifact = isImageArtifact(artifact, mimeType)
                    return (
                      <article className={`outputs-artifact-card ${imageArtifact ? 'is-image' : ''}`} key={`top-${artifact.id}`}>
                        {imageArtifact && url ? (
                          <img className="outputs-artifact-image" src={url} alt={artifact.name} loading="lazy" />
                        ) : (
                          <div className="outputs-artifact-fileplate">
                            <span>{mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' ? 'PDF' : artifact.kind.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                        <div className="outputs-artifact-body">
                          <strong>{artifact.name}</strong>
                          <span>{artifact.kind.toUpperCase()} - {mimeType || 'artifact'}</span>
                          <div className="outputs-artifact-actions">
                            {url ? <a href={url} target="_blank" rel="noreferrer">{actionLabels.open}</a> : <span>{actionLabels.open}</span>}
                            {url ? (
                              <button
                                className="outputs-artifact-action-button"
                                disabled={downloadingArtifactKey === artifact.key}
                                type="button"
                                onClick={() => downloadArtifact(url, artifact.name, actionLabels.extension, mimeType, artifact.key)}
                              >
                                {downloadingArtifactKey === artifact.key ? 'Downloading...' : actionLabels.download}
                              </button>
                            ) : <span>{actionLabels.download}</span>}
                          </div>
                        </div>
                      </article>
                    )
                  }) : (
                    <p className="outputs-muted">Openable files appear here as soon as render or image nodes finish.</p>
                  )}
                </div>
              </section>
            </aside>

            <section className="outputs-panel outputs-composer outputs-advanced-presets">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Advanced presets</p>
                  <h3>{outputPreset === 'ebook' ? 'Ebook PDF' : 'Comic Issue'}</h3>
                </div>
                <span>{outputPreset === 'ebook' ? `${sequenceUnits.length} sequence units` : `${comicPageCount} pages`}</span>
              </div>
              <div className="outputs-preset-switch" role="tablist" aria-label="Output workflow preset">
                <button className={outputPreset === 'ebook' ? 'is-active' : ''} onClick={() => setOutputPreset('ebook')} type="button">
                  <strong>Ebook PDF</strong>
                  <span>Manuscript and cover-ready PDF</span>
                </button>
                <button className={outputPreset === 'comic' ? 'is-active' : ''} onClick={() => setOutputPreset('comic')} type="button">
                  <strong>Comic Issue</strong>
                  <span>Script, atlas, pages, PDF</span>
                </button>
              </div>
              <div className="outputs-composer-meta">
                <span>{castAndContext.length} world entities</span>
                <span>{sequenceUnits.length} sequence units</span>
                <span>{artifacts.length} artifacts</span>
              </div>
              {outputPreset === 'ebook' ? (
                <label className="outputs-input-block">
                  <span>Output prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={6}
                    aria-label="Output workflow prompt"
                  />
                  <small>Uses the project wiki, sequence units, entity context, output skills, and cached workflow outputs.</small>
                </label>
              ) : (
                <div className="outputs-comic-controls">
                  <label>
                    <span>Sequence unit</span>
                    <select
                      value={selectedComicSequenceKey}
                      onChange={(event) => setSelectedComicSequenceKey(event.target.value)}
                      disabled={sequenceUnits.length === 0}
                    >
                      {sequenceUnits.map((entity) => (
                        <option key={entity.key} value={entity.key}>{entity.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Pages</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={comicPageCount}
                      onChange={(event) => setComicPageCount(Math.max(1, Math.min(12, Number(event.target.value) || 8)))}
                    />
                  </label>
                  <label className="outputs-input-block">
                    <span>Comic direction</span>
                    <textarea
                      value={comicPrompt}
                      onChange={(event) => setComicPrompt(event.target.value)}
                      rows={6}
                      aria-label="Comic workflow prompt"
                    />
                    <small>Creates one selected-sequence comic with script, atlas references, page images, and a PDF package.</small>
                  </label>
                </div>
              )}
              <button
                className="outputs-primary-action"
                disabled={!canRunOutputs || busy || (outputPreset === 'comic' && !selectedComicSequenceKey)}
                onClick={outputPreset === 'ebook' ? createAndRunEbookWorkflow : createAndRunComicWorkflow}
                type="button"
              >
                {busy ? 'Starting workflow...' : outputPreset === 'ebook' ? 'Generate PDF' : 'Generate Comic PDF'}
              </button>
            </section>
          </section>

          <div className="outputs-studio-grid">
            <main className="outputs-production-main">
              <section className="outputs-panel outputs-request-feed">
                <div className="outputs-panel-heading">
                  <div>
                    <p className="outputs-eyebrow">Production Feed</p>
                    <h3>Prompted Outputs</h3>
                  </div>
                  <span>{outputRequests.length} total</span>
                </div>
                {outputRequests.length === 0 ? (
                  <div className="outputs-empty-feed">
                    <strong>No prompted outputs yet</strong>
                    <p>Use the composer above to create a poster, story, comic, ebook, or future video from this world.</p>
                  </div>
                ) : (
                  <div className="outputs-request-list">
                    {outputRequests.map((request) => {
                      const requestRun = request.latestRunId
                        ? recentOutputRuns.find((run) => run.id === request.latestRunId) ?? null
                        : null
                      const requestWorkflow = request.workflowId
                        ? workflows.find((workflow) => workflow.id === request.workflowId) ?? null
                        : null
                      const requestArtifacts = snapshot.outputArtifacts
                        .filter((artifact) => (
                          artifact.runId === request.latestRunId || artifact.workflowId === request.workflowId
                        ))
                        .sort((left, right) => {
                          const priorityDelta = artifactSortPriority(left) - artifactSortPriority(right)
                          if (priorityDelta !== 0) return priorityDelta
                          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
                        })
                      const requestPrimaryArtifact = requestArtifacts.find((artifact) => artifact.mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' || artifact.kind === 'pdf')
                        ?? requestArtifacts.find((artifact) => artifact.kind === 'image')
                        ?? requestArtifacts[0]
                        ?? null
                      const imageArtifact = requestArtifacts.find((artifact) => artifact.kind === 'image') ?? requestPrimaryArtifact
                      const imageAsset = imageArtifact?.assetKey ? assetByKey.get(imageArtifact.assetKey) ?? null : null
                      const imageUrl = resolveAssetSourceUrl(imageAsset) || (imageArtifact ? resolveArtifactUrlFromMetadata(readRecord(imageArtifact.metadata)) : '')
                      const imageAspectRatio = imageArtifact
                        ? readImageAspectRatio(imageArtifact.metadata, imageAsset?.metadata)
                        : ''
                      const primaryAsset = requestPrimaryArtifact?.assetKey ? assetByKey.get(requestPrimaryArtifact.assetKey) ?? null : null
                      const primaryUrl = requestPrimaryArtifact ? resolveAssetSourceUrl(primaryAsset) || resolveArtifactUrlFromMetadata(readRecord(requestPrimaryArtifact.metadata)) : ''
                      const primaryMimeType = requestPrimaryArtifact?.mimeType || primaryAsset?.mimeType || ''
                      const primaryActionLabels = requestPrimaryArtifact ? artifactActionLabels(primaryMimeType, requestPrimaryArtifact.kind) : null
                      const rowStatus = requestRun?.status ?? request.status
                      const progressSteps = requestRun?.steps ?? []
                      const completedCount = progressSteps.filter((step) => {
                        const stepStatus = String(step.status)
                        return stepStatus === 'completed' || stepStatus === 'skipped'
                      }).length
                      const failedCount = progressSteps.filter((step) => {
                        const stepStatus = String(step.status)
                        return stepStatus === 'failed' || stepStatus === 'blocked'
                      }).length
                      const activeStep = progressSteps.find((step) => step.status === 'running')
                        ?? progressSteps.find((step) => {
                          const stepStatus = String(step.status)
                          return stepStatus === 'failed' || stepStatus === 'blocked'
                        })
                        ?? progressSteps.find((step) => step.status === 'queued')
                        ?? null
                      const rowStageSummary = [
                        {
                          label: 'Context',
                          steps: progressSteps.filter((step) => step.nodeType === 'world_context_query' || step.nodeType === 'skill_context_query'),
                        },
                        {
                          label: 'Writing',
                          steps: progressSteps.filter((step) => step.nodeType === 'text_llm' || step.nodeType === 'utility_transform'),
                        },
                        {
                          label: 'Images',
                          steps: progressSteps.filter((step) => step.nodeType === 'image_generation'),
                        },
                        {
                          label: 'Render',
                          steps: progressSteps.filter((step) => step.nodeType === 'document_render' || step.nodeType === 'output_artifact'),
                        },
                      ].filter((stage) => stage.steps.length > 0)
                      const isSelected = selectedOutputRequest?.id === request.id
                      const progressPercent = progressSteps.length > 0 ? Math.round((completedCount / progressSteps.length) * 100) : 0
                      const plannedSections = plannedSectionTitles(request)
                      const requestCinematicData = buildCinematicScriptViewData(requestWorkflow, requestRun)
                      const requestIsV2Animatic = requestCinematicData.isV2
                      const requestTimelineProjection = requestIsV2Animatic
                        ? buildSafeCinematicV2TimelineProjection(requestCinematicData)
                        : null
                      const requestAnimaticReady = requestIsV2Animatic && (
                        requestCinematicData.cinematicV2.keyframes.length > 0
                        || requestCinematicData.cinematicV2.panels.length > 0
                        || requestCinematicData.cinematicV2.storyboardSheets.length > 0
                        || Object.keys(readRecord(requestCinematicData.cinematicV2.timeline)).length > 0
                      )
                      const requestSideStatus = activeStep
                        ? activeStep.label
                        : failedCount > 0
                          ? `${failedCount} nodes need attention`
                          : requestPrimaryArtifact
                            ? requestPrimaryArtifact.name
                            : requestAnimaticReady
                              ? 'Animatic ready'
                              : requestIsV2Animatic
                                ? 'Generating animatic'
                                : 'Waiting for artifact'
                      return (
                        <article className={`outputs-request-row ${isSelected ? 'is-selected' : ''} is-${statusClass(rowStatus)}`} key={request.id}>
                          <button
                            className="outputs-request-main"
                            type="button"
                            onClick={() => {
                              setSelectedRequestId(request.id)
                              if (request.latestRunId) setActiveRunId(request.latestRunId)
                              if (request.workflowId) setSelectedNodeKey(null)
                            }}
                          >
                            <span
                              className={`outputs-request-preview ${imageUrl ? 'has-image' : ''}`}
                              style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined}
                            >
                              {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className={`outputs-status-icon is-${statusClass(rowStatus)}`} aria-hidden="true" />}
                            </span>
                            <span className="outputs-request-content">
                              <span className="outputs-request-kicker">
                                <small>{outputKindLabel(request.outputKind)}</small>
                                <small>{requestWorkflow ? workflowPresetLabel(requestWorkflow.preset) : formatStatus(request.status)}</small>
                                <small>{formatStatus(rowStatus)}</small>
                              </span>
                              <strong>{request.title}</strong>
                              <em>{request.prompt}</em>
                              <span className="outputs-request-context">
                                {request.selectedEntityKeys.slice(0, 3).map((key) => <small key={key}>{worldEntityNameByKey.get(key) ?? key}</small>)}
                                {request.selectedSequenceUnitKeys.slice(0, 2).map((key) => <small key={key}>{worldEntityNameByKey.get(key) ?? key}</small>)}
                                {plannedSections.slice(0, 3).map((title) => <small key={title}>{title}</small>)}
                                {plannedSections.length > 3 ? <small>{plannedSections.length} sections</small> : null}
                                {request.outputKind === 'comic_issue_from_sequence' && request.pageCount ? <small>{request.pageCount} pages</small> : null}
                              </span>
                              <span className="outputs-row-workflow" aria-label="Workflow stage summary">
                                {rowStageSummary.length > 0 ? rowStageSummary.map((stage) => (
                                  <small className={`is-${compactStatusForSteps(stage.steps)}`} key={stage.label}>
                                    <i aria-hidden="true" />
                                    {stage.label}
                                    <b>{stage.steps.filter((step) => {
                                      const status = String(step.status)
                                      return status === 'completed' || status === 'skipped'
                                    }).length}/{stage.steps.length}</b>
                                  </small>
                                )) : (
                                  <small className="is-empty"><i aria-hidden="true" />Planning<b>0/0</b></small>
                                )}
                              </span>
                            </span>
                          </button>
                          <div className="outputs-request-side">
                            <div className="outputs-request-progress">
                              <span>{progressSteps.length > 0 ? `${completedCount}/${progressSteps.length} nodes` : formatStatus(request.status)}</span>
                              <i style={{ ['--progress' as string]: `${progressPercent}%` }} />
                            </div>
                            <small>{requestSideStatus}</small>
                            <div className="outputs-request-actions">
                              {requestPrimaryArtifact && primaryUrl && primaryActionLabels ? <a className="outputs-secondary-action outputs-compact-action" href={primaryUrl} target="_blank" rel="noreferrer">{primaryActionLabels.open}</a> : null}
                              {requestPrimaryArtifact && primaryUrl && primaryActionLabels ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={downloadingArtifactKey === requestPrimaryArtifact.key}
                                  type="button"
                                  onClick={() => downloadArtifact(primaryUrl, requestPrimaryArtifact.name, primaryActionLabels.extension, primaryMimeType, requestPrimaryArtifact.key)}
                                >
                                  {downloadingArtifactKey === requestPrimaryArtifact.key ? 'Downloading...' : 'Download'}
                                </button>
                              ) : null}
                              <button
                                className="outputs-secondary-action outputs-compact-action"
                                disabled={busyRequestId === request.id}
                                onClick={async () => {
                                  setSelectedRequestId(request.id)
                                  if (request.latestRunId) setActiveRunId(request.latestRunId)
                                  setBusyRequestId(request.id)
                                  setError(null)
                                  try {
                                    await pollRequest(request.id)
                                    await onRefreshLiveSnapshot()
                                  } catch (requestError) {
                                    setError(requestError instanceof Error ? requestError.message : 'Could not refresh output request.')
                                  } finally {
                                    setBusyRequestId(null)
                                  }
                                }}
                                type="button"
                              >
                                {busyRequestId === request.id ? 'Refreshing...' : 'Details'}
                              </button>
                              {request.workflowId ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={refreshingGraph}
                                  type="button"
                                  onClick={() => void openOutputGraphForRequest(request)}
                                >
                                  {refreshingGraph && selectedRequestId === request.id ? 'Opening...' : 'Graph'}
                                </button>
                              ) : null}
                              {requestIsV2Animatic ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={timelineOpeningRequestId === request.id}
                                  type="button"
                                  onClick={() => void openCinematicTimelineForRequest(request)}
                                >
                                  {timelineOpeningRequestId === request.id ? 'Opening...' : requestTimelineProjection ? 'Timeline' : 'Load timeline'}
                                </button>
                              ) : null}
                              {!requestRun || isTerminalOutputWorkflowRunStatus(requestRun.status) ? null : (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={busyRequestId === request.id}
                                  onClick={async () => {
                                    setBusyRequestId(request.id)
                                    setError(null)
                                    try {
                                      await onCancelOutputRequest(request.id)
                                      await onRefreshLiveSnapshot()
                                    } catch (requestError) {
                                      setError(requestError instanceof Error ? requestError.message : 'Could not cancel output request.')
                                    } finally {
                                      setBusyRequestId(null)
                                    }
                                  }}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              )}
                                {!requestRun || isTerminalOutputWorkflowRunStatus(requestRun.status) ? (
                                  <button
                                    className="outputs-secondary-action outputs-compact-action"
                                    disabled={busyRequestId === request.id}
                                    onClick={() => {
                                      setError(null)
                                      if (selectedRequestId === request.id) {
                                        const nextRequest = outputRequests.find((entry) => entry.id !== request.id) ?? null
                                        setSelectedRequestId(nextRequest?.id ?? null)
                                        setActiveRunId(nextRequest?.latestRunId ?? null)
                                      }
                                      onRequestDeleteOutputRequest(request.id)
                                    }}
                                    type="button"
                                  >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </main>

            <aside className="outputs-results-rail">
              <section className="outputs-panel outputs-run-card">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Run</p>
                  <h3>Production Status</h3>
                </div>
                <span>{activeRunStatusLabel}</span>
              </div>
              <div className="outputs-run-metrics">
                <div>
                  <strong>{runningNodeCount}</strong>
                  <span>Running</span>
                </div>
                <div>
                  <strong>{completedNodeCount}</strong>
                  <span>Done</span>
                </div>
                <div>
                  <strong>{failedNodeCount}</strong>
                  <span>Needs attention</span>
                </div>
              </div>
              {activeRun ? (
                <div className="outputs-run-summary" aria-label="Run step summary">
                  {['running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped', 'queued'].map((status) => (
                    <span className={`is-${status}`} key={status}>{formatStatus(status)} {runStepCounts.get(status) ?? 0}</span>
                  ))}
                </div>
              ) : (
                <p className="outputs-muted">Start a preset to see queued, running, completed, failed, and skipped nodes.</p>
              )}
              {runUsageSummary ? (
                <div className="outputs-usage-summary">
                  <button className="outputs-usage-pill" onClick={() => setUsageBreakdownOpen((open) => !open)} type="button">
                    <span>{runUsageSummary.actualCostUsd > 0 ? 'Cost' : 'Estimate'}</span>
                    <strong>{formatAiUsd(runUsageSummary.actualCostUsd || runUsageSummary.estimatedCostUsd)}</strong>
                    <small>{runUsageSummary.totalTokens.toLocaleString()} tokens</small>
                  </button>
                  {usageBreakdownOpen ? (
                    <div className="outputs-usage-breakdown">
                      {runUsageSummary.lines.map((line, index) => (
                        <div className="outputs-usage-row" key={`${line.nodeKey || line.model}-${index}`}>
                          <div>
                            <strong>{line.nodeLabel || line.nodeKey || line.operation}</strong>
                            <span>{line.provider} · {line.model}</span>
                          </div>
                          <div>
                            <span>{line.tokens ? `${line.tokens.inputTokens.toLocaleString()} in / ${line.tokens.outputTokens.toLocaleString()} out` : `${line.media?.units ?? 1} media`}</span>
                            <strong>{formatAiUsd(line.cost.actualCostUsd || line.cost.estimatedCostUsd)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="outputs-run-actions">
                {activeRun && !isTerminalOutputWorkflowRunStatus(activeRun.status) ? (
                  <button className="outputs-secondary-action" disabled={busy} onClick={cancelActiveRun} type="button">
                    Cancel run
                  </button>
                ) : null}
                {activeRun && canRetryActiveRun ? (
                  <button className="outputs-secondary-action" disabled={busy} onClick={retryActiveRunFromFailedNodes} type="button">
                    {busy ? 'Retrying...' : 'Retry failed nodes'}
                  </button>
                ) : null}
              </div>
            </section>
            <section className="outputs-panel outputs-workflow-board">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Workflow</p>
                  <h3>{workflowPresetLabel(activeWorkflow?.preset)}</h3>
                </div>
                <button
                  className="outputs-secondary-action outputs-compact-action"
                  disabled={!activeWorkflow || activeNodes.length === 0}
                  onClick={openOutputGraph}
                  type="button"
                >
                  {refreshingGraph ? 'Refreshing...' : 'Expand graph'}
                </button>
              </div>
              {activeWorkflowNeedsCoverUpgrade ? (
                <div className="outputs-upgrade-callout">
                  <div>
                    <strong>Cover branch available</strong>
                    <p>Add cover prompt and GPT Image 2 cover nodes without rerunning chapter prose.</p>
                  </div>
                  <div className="outputs-upgrade-actions">
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('graph')} type="button">
                      {upgradeMode === 'graph' ? 'Upgrading...' : 'Upgrade graph'}
                    </button>
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('cover')} type="button">
                      {upgradeMode === 'cover' ? 'Generating...' : 'Cover only'}
                    </button>
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('pdf')} type="button">
                      {upgradeMode === 'pdf' ? 'Rebuilding...' : 'Rebuild PDF'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="outputs-stage-board">
                {workflowStages.map((stage) => (
                  <section className="outputs-stage" key={stage.key}>
                    <div className="outputs-stage-head">
                      <div>
                        <span>{stage.eyebrow}</span>
                        <strong>{stage.title}</strong>
                      </div>
                      <small>{stage.total} nodes</small>
                    </div>
                    <div className="outputs-stage-progress" aria-label={`${stage.title} status`}>
                      <span className="is-running">{stage.counts.get('running') ?? 0}</span>
                      <span className="is-completed">{(stage.counts.get('completed') ?? 0) + (stage.counts.get('skipped') ?? 0)}</span>
                      <span className="is-failed">{(stage.counts.get('failed') ?? 0) + (stage.counts.get('blocked') ?? 0)}</span>
                    </div>
                    {stage.levels.length > 0 ? (
                      <div className="outputs-node-list">
                        {stage.levels.map((level) => (
                          <div className="outputs-execution-level" key={`${stage.key}-${level.levelIndex}`}>
                            <div className="outputs-level-heading">
                              <strong>{level.nodes.length > 1 ? `Parallel group ${level.levelIndex + 1}` : `Step ${level.levelIndex + 1}`}</strong>
                              <span>{level.nodes.length > 1 ? `${level.nodes.length} nodes` : '1 node'}</span>
                            </div>
                            <div className="outputs-level-nodes">
                              {level.nodes.map((node) => {
                                const step = stepsByNodeKey.get(node.key)
                                const skillKeys = readNodeSkillKeys(node)
                                const statusKey = statusKeyForStep(step)
                                const outputPreview = readOutputPreview(step)
                                const isTargeted = targetedNodeKeys.includes(node.key)
                                return (
                                  <article
                                    className={`outputs-node-card ${selectedNode?.key === node.key ? 'is-selected' : ''} is-${statusClass(statusKey)} ${isTargeted ? 'is-targeted' : ''}`}
                                    key={node.id}
                                  >
                                    <button
                                      className="outputs-node-main"
                                      onClick={() => {
                                        setSelectedNodeKey(node.key)
                                        setInspectorMode('output')
                                      }}
                                      type="button"
                                    >
                                      <span className={`outputs-status-icon is-${statusClass(isTargeted ? 'running' : statusKey)}`} aria-hidden="true" />
                                      <span>
                                        <strong>{node.label}</strong>
                                        <small>{purposeLabel(node)}</small>
                                      </span>
                                    </button>
                                    {skillKeys.length > 0 ? (
                                      <div className="outputs-skill-chips">
                                        {skillKeys.slice(0, 3).map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                                        {skillKeys.length > 3 ? <small>+{skillKeys.length - 3}</small> : null}
                                      </div>
                                    ) : null}
                                    <div className="outputs-node-footer">
                                      <em>{isTargeted ? 'starting' : statusLabelForStep(step)}</em>
                                      <button
                                        className="outputs-node-action"
                                        disabled={!outputPreview && !step?.errorMessage}
                                        onClick={() => {
                                          setSelectedNodeKey(node.key)
                                          setInspectorMode('output')
                                        }}
                                        type="button"
                                      >
                                        View
                                      </button>
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="outputs-muted">{stage.empty}</p>
                    )}
                  </section>
                ))}
              </div>
            </section>
            <section className="outputs-panel outputs-artifacts outputs-detail-artifacts">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Results</p>
                  <h3>Artifacts</h3>
                </div>
                <span>{artifacts.length}</span>
              </div>
              {primaryArtifact ? (
                <div className="outputs-primary-artifact">
                  <span>Latest deliverable</span>
                  <strong>{primaryArtifact.name}</strong>
                  <small>{primaryArtifact.kind.replace(/_/g, ' ')}</small>
                </div>
              ) : (
                <div className="outputs-primary-artifact is-empty">
                  <span>Nothing exported yet</span>
                  <strong>Run a workflow to create PDFs, images, and packages.</strong>
                </div>
              )}
              <div className="outputs-artifact-list">
                {artifacts.length > 0 ? artifacts.map((artifact) => {
                  const asset = artifact.assetKey ? assetByKey.get(artifact.assetKey) ?? null : null
                  const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(readRecord(artifact.metadata))
                  const metadata = readRecord(artifact.metadata)
                  const renderMetadata = readRecord(metadata.render)
                  const markdownPreview = readTrimmedString(metadata.markdownPreview)
                  const mimeType = artifact.mimeType || asset?.mimeType || ''
                  const actionLabels = artifactActionLabels(mimeType, artifact.kind)
                  const imageArtifact = isImageArtifact(artifact, mimeType)
                  const byteSize = formatByteSize(renderMetadata.byteSize)
                  const pageCount = readNumber(renderMetadata.pageCount)
                  const manuscriptLength = readNumber(renderMetadata.manuscriptCharacterCount)
                  const pageSize = readTrimmedString(renderMetadata.pageSize)
                  return (
                    <article className={`outputs-artifact-card ${imageArtifact ? 'is-image' : ''}`} key={artifact.id}>
                      {imageArtifact && url ? (
                        <img className="outputs-artifact-image" src={url} alt={artifact.name} loading="lazy" />
                      ) : (
                        <div className="outputs-artifact-fileplate">
                          <span>{mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' ? 'PDF' : artifact.kind.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      <div className="outputs-artifact-body">
                        <strong>{artifact.name}</strong>
                        <span>{artifact.kind.toUpperCase()} - {mimeType || 'artifact'}</span>
                        <div className="outputs-artifact-meta">
                          {pageCount ? <small>{pageCount} pages</small> : null}
                          {byteSize ? <small>{byteSize}</small> : null}
                          {manuscriptLength ? <small>{manuscriptLength.toLocaleString()} chars</small> : null}
                          {pageSize ? <small>{pageSize}</small> : null}
                        </div>
                        {artifact.summary ? <p>{artifact.summary}</p> : null}
                        {markdownPreview ? (
                          <details className="outputs-artifact-preview">
                            <summary>Preview manuscript excerpt</summary>
                            <pre>{markdownPreview}</pre>
                          </details>
                        ) : null}
                        <div className="outputs-artifact-actions">
                          {url ? <a href={url} target="_blank" rel="noreferrer">{actionLabels.open}</a> : <span>{actionLabels.open}</span>}
                          {url ? (
                            <button
                              className="outputs-artifact-action-button"
                              disabled={downloadingArtifactKey === artifact.key}
                              type="button"
                              onClick={() => downloadArtifact(url, artifact.name, actionLabels.extension, mimeType, artifact.key)}
                            >
                              {downloadingArtifactKey === artifact.key ? 'Downloading...' : actionLabels.download}
                            </button>
                          ) : <span>{actionLabels.download}</span>}
                          {!url ? <small>Preparing signed file URL</small> : null}
                        </div>
                      </div>
                    </article>
                  )
                }) : (
                  <p className="outputs-muted">Openable files will appear here as soon as render or image nodes finish and storage URLs are signed.</p>
                )}
              </div>
            </section>

            <section className="outputs-panel outputs-inspector-panel">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Inspector</p>
                  <h3>{selectedNode ? selectedNode.label : 'Node Details'}</h3>
                </div>
                <span>{selectedStep ? statusLabelForStep(selectedStep) : 'Not run'}</span>
              </div>
              {selectedNode ? (
                <div className="outputs-inspector">
                  <div className="outputs-inspector-header">
                    <span className={`outputs-status-icon is-${statusClass(targetedNodeKey === selectedNode.key ? 'running' : statusKeyForStep(selectedStep))}`} aria-hidden="true" />
                    <div>
                      <strong>{selectedNode.label}</strong>
                      <span>{purposeLabel(selectedNode)}</span>
                    </div>
                  </div>
                  <div className="outputs-inspector-actions">
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'node_only')} type="button">
                      {targetedNodeKey === selectedNode.key && targetedRunScope === 'node_only' ? 'Starting...' : 'Run cached node only'}
                    </button>
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'upstream_to_node')} type="button">
                      Run with upstream
                    </button>
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'node_and_downstream')} type="button">
                      Node + dependents
                    </button>
                  </div>
                  <div className="outputs-inspector-tabs" role="tablist" aria-label="Node detail views">
                    <button className={inspectorMode === 'output' ? 'is-active' : ''} onClick={() => setInspectorMode('output')} type="button">Latest Output</button>
                    {cinematicScriptViewData.isCinematic ? (
                      <button className={inspectorMode === 'script' ? 'is-active' : ''} onClick={() => setInspectorMode('script')} type="button">Script</button>
                    ) : null}
                    <button className={inspectorMode === 'guidance' ? 'is-active' : ''} onClick={() => setInspectorMode('guidance')} type="button">Prompt / Guidance</button>
                    <button className={inspectorMode === 'usage' ? 'is-active' : ''} onClick={() => setInspectorMode('usage')} type="button">Usage</button>
                    <button className={inspectorMode === 'metadata' ? 'is-active' : ''} onClick={() => setInspectorMode('metadata')} type="button">Metadata</button>
                  </div>
                  {inspectorMode === 'output' ? (
                    <div className="outputs-output-preview">
                      {selectedOutputImageUrl ? <img className="outputs-selected-image" src={selectedOutputImageUrl} alt={selectedNode.label} loading="lazy" /> : null}
                      {selectedStep?.errorMessage ? <p className="outputs-error">{selectedStep.errorMessage}</p> : null}
                      {selectedOutputPreview ? <pre>{selectedOutputPreview}</pre> : (
                        <p className="outputs-muted">No node output has been persisted yet. Queued and running nodes will fill this when they complete.</p>
                      )}
                    </div>
                  ) : null}
                  {inspectorMode === 'script' ? (
                    <div className="outputs-output-preview">
                      <CinematicScriptPanel
                        canRunOutputs={canRunOutputs}
                        data={cinematicScriptViewData}
                        estimate={cinematicV2ProductionEstimate}
                        isApprovingVideo={approvingVideoProduction}
                        isUpgradingQuality={upgradingAnimaticQuality}
                        isVideoApproved={cinematicVideoApproved}
                        onApproveVideoProduction={approveCinematicV2VideoProduction}
                        onGenerateQualityKeyframes={generateCinematicV2QualityKeyframes}
                        onOpenTimeline={openCinematicTimelineForActiveWorkflow}
                      />
                    </div>
                  ) : null}
                  {inspectorMode === 'guidance' && selectedGuidance ? (
                    <div className="outputs-guidance-panel">
                      <div className="outputs-skill-chips">
                        {selectedGuidance.skillKeys.map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                      </div>
                      {selectedGuidance.resolvedGuidancePreview ? (
                        <div className="outputs-guidance-section">
                          <strong>Preview</strong>
                          <p>{selectedGuidance.resolvedGuidancePreview}</p>
                        </div>
                      ) : (
                        <p className="outputs-muted">This node does not have explicit output skills yet.</p>
                      )}
                      {selectedGuidance.guidance.length > 0 ? (
                        <div className="outputs-guidance-section">
                          <strong>Full guidance sent to node</strong>
                          <ul>{selectedGuidance.guidance.map((entry, index) => <li key={`guidance-${index}`}>{entry}</li>)}</ul>
                        </div>
                      ) : null}
                      {selectedGuidance.avoid.length > 0 ? (
                        <div className="outputs-guidance-section">
                          <strong>Full avoid list sent to node</strong>
                          <ul>{selectedGuidance.avoid.map((entry, index) => <li key={`avoid-${index}`}>{entry}</li>)}</ul>
                        </div>
                      ) : null}
                      {selectedGuidance.guidanceHash ? <span className="outputs-guidance-hash">Guidance hash {selectedGuidance.guidanceHash}</span> : null}
                    </div>
                  ) : null}
                  {inspectorMode === 'usage' ? (
                    <div className="outputs-output-preview outputs-usage-panel">
                      {selectedUsageSummary ? (
                        <>
                          <div className="outputs-usage-node-total">
                            <strong>{formatAiUsd(selectedUsageSummary.actualCostUsd || selectedUsageSummary.estimatedCostUsd)}</strong>
                            <span>{selectedUsageSummary.totalTokens.toLocaleString()} tokens · {selectedUsageSummary.actualCredits || selectedUsageSummary.estimatedCredits} credits</span>
                          </div>
                          {selectedUsageSummary.lines.map((line, index) => (
                            <div className="outputs-usage-row" key={`${line.nodeKey || line.model}-${index}`}>
                              <div>
                                <strong>{line.provider} · {line.model}</strong>
                                <span>{line.requestId || line.responseId || 'No provider request id yet'}</span>
                              </div>
                              <div>
                                <span>{line.tokens ? `${line.tokens.inputTokens.toLocaleString()} input / ${line.tokens.outputTokens.toLocaleString()} output` : `${line.media?.size ?? line.media?.units ?? 1} media`}</span>
                                <strong>{formatAiUsd(line.cost.actualCostUsd || line.cost.estimatedCostUsd)}</strong>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p className="outputs-muted">No usage has been recorded for this node yet.</p>
                      )}
                    </div>
                  ) : null}
                  {inspectorMode === 'metadata' ? (
                    <div className="outputs-output-preview">
                      <pre>{JSON.stringify({
                        inputHash: selectedStep?.inputHash || selectedNode.inputHash,
                        outputHash: selectedStep?.outputHash || selectedNode.outputHash,
                        provider: selectedStep?.provider ?? null,
                        model: selectedStep?.model ?? null,
                        providerRequestId: selectedStep?.providerRequestId ?? null,
                        providerMode: readRecord(selectedStep?.metadata).providerMode ?? null,
                        providerStatus: readRecord(selectedStep?.metadata).providerStatus ?? null,
                        retryAttempts: readRecord(selectedStep?.outputs).retryAttempts ?? null,
                        startedAt: selectedStep?.startedAt ?? null,
                        completedAt: selectedStep?.completedAt ?? null,
                        metadata: selectedStep?.metadata ?? selectedNode.metadata,
                      }, null, 2)}</pre>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="outputs-muted">Select a workflow node to inspect output, guidance, cache state, provider metadata, and local run actions.</p>
              )}
            </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
