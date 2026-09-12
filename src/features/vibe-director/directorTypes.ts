import type { ProjectSnapshot } from '../../domain/graphcore'
import type { VisualGenerationJob, VisualGenerationStartResponse } from '../../domain/visualGeneration'
import type { WorldEntity, WorldEntityCreateInput } from '../../domain/worldGraph'
import type { WorldPromptSourceContext } from '../../domain/worldPrompt'

/**
 * App-level contract for the Vibe Director route. Both the default workspace and the legacy
 * phase-wizard page receive this shape; the legacy-only callbacks stay so `App.tsx` wiring is stable.
 */
export type VibeDirectorPageProps = {
  snapshot: ProjectSnapshot
  canRun: boolean
  /** Active/recent visual generation jobs (reference sheets, composed frames) for status pills. */
  visualGenerationJobs?: VisualGenerationJob[]
  onCreateWorldEntity?: (input: WorldEntityCreateInput) => Promise<unknown>
  /** Polls one visual job; the App merges the result into `visualGenerationJobs` and applies terminal effects to the snapshot. */
  onGetVisualGenerationStatus?: (jobId: string) => Promise<unknown>
  /** Loads a workflow graph with its latest/selected run; used for the take-preparation graph progress. */
  onLoadOutputWorkflowGraph?: (
    workflowId: string,
    runId?: string | null,
    selectedNodeKey?: string | null,
    options?: { knownGraphRevision?: string | null; assetHydrationMode?: 'none' | 'preview' | 'selected' | 'all' },
  ) => Promise<unknown>
  onRefineWorldEntityVisualProfile?: (input: {
    entityKey: string
    guidance: string
    referenceImageAssetKey: string | null
  }) => Promise<{ entity: WorldEntity } | unknown>
  onGenerateWorldBrandAtlasImage: (prompt?: string) => Promise<{
    brandAtlasAssetKey: string
    visualJobId: string | null
    signedUrl: string | null
  } | null | undefined>
  onStartVisualGenerationJob: (request: {
    kind: 'entity_reference_sheet' | 'director_frame'
    targetKeys?: Record<string, unknown>
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<VisualGenerationStartResponse | unknown>
  onStartWorldPromptTurn: (input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
    selectedRootEntityKey?: string | null
  }) => Promise<void>
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    outputKindOverride?: 'comic_issue_from_sequence' | 'cinematic_episode'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    targetFormat?: 'pdf' | 'video' | 'image'
    imageQuality?: 'low' | 'medium' | 'high'
    pageCount?: number
    comicContinuityMode?: 'previous_page' | 'parallel' | 'selected_references'
    comicApprovedReferenceEntityKeys?: string[]
    comicPageReferenceDepth?: number
    qualityGateMode?: 'standard' | 'strict' | 'off'
    cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
    cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration' | 'v3_script_storyboards'
    cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
    sequenceAnimaticMode?: 'full_sequence_unit' | 'master_script_only'
    debugSkipVideoGeneration?: boolean
    vibeDirector?: Record<string, unknown>
  }) => Promise<unknown>
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt?: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedSequenceUnitKeys?: string[]
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<unknown>
  onEnsureSequenceAnimaticBlockWorkflows: (request: {
    masterRequestId: string
    sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
    blockRequestId?: string
    storyboardBlockId?: string
    shotId?: string
    panelAssetKey?: string
    shotVideoReferenceOverride?: Record<string, unknown>
  }) => Promise<{ childRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }> }>
  onEnsureSequenceAnimaticKeyframeWorkflows: (request: {
    masterRequestId: string
    mode?: 'generate' | 'regenerate'
    shotIds?: string[]
    coverageSetupIds?: string[]
    allowProvisional?: boolean
    shotReferenceOverride?: Record<string, unknown>
    shotContinuityOptions?: Record<string, unknown>
  }) => Promise<{
    nextAction?: Record<string, unknown> | null
    childRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    continuityAssetRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    coverageAnchorRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    shotKeyframeRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
  }>
  onLoadSequenceAnimaticState: (request: {
    masterRequestId: string
    knownRevision: string | null
  }) => Promise<unknown>
  onGetOutputRequestStatus: (requestId: string) => Promise<unknown>
  onOpenWiki: () => void
  onOpenOutputs: () => void
  onRefreshLiveSnapshot: () => Promise<void> | void
}
