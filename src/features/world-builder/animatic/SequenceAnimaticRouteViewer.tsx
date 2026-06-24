import type { OutputWorkflowRun } from '../../../domain/outputWorkflow'
import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'
import { EntityIcon } from '../../../shared/entityIcons'
import type { WorldWikiDetailModalInput } from '../wiki/WorldWikiSections'
import {
  type SequenceAnimaticPendingShotView,
  type SequenceAnimaticShotInspectorInput,
  type SequenceAnimaticShotPromptState,
} from './sequenceAnimaticShotTypes'
import { SequenceAnimaticShotWorkspace } from './SequenceAnimaticFocusedWorkspace'
import { SequenceAnimaticThinkingState, sequenceAnimaticShouldShowThinking } from './SequenceAnimaticThinkingState'
import { SequenceAnimaticWorkflowHeaderActions } from './SequenceAnimaticWorkflowHeaderActions'
import {
  type SequenceAnimaticVideoPreview,
  type SequenceAnimaticViewModel,
} from './sequenceAnimaticViewModel'

type SequenceAnimaticBlockView = SequenceAnimaticViewModel['blocks'][number]
type SequenceAnimaticShotView = SequenceAnimaticBlockView['shots'][number]
type SequenceAnimaticSceneView = SequenceAnimaticViewModel['scenes'][number]
type SequenceAnimaticCoverageAnchorView = SequenceAnimaticViewModel['coverageAnchors'][number]

export type SequenceAnimaticRouteHydrationState = {
  status: 'idle' | 'checking' | 'failed'
  error?: string | null
}

type SequenceAnimaticRouteViewerProps = {
  entityKey: string
  entityName: string
  model: SequenceAnimaticViewModel | null
  hydration: SequenceAnimaticRouteHydrationState
  workflowRun: OutputWorkflowRun | null
  workflowProgress: WorkflowProgressViewModel | null
  workflowFallbackLabels: readonly string[]
  workflowProgressForRequest: (
    requestId: string | null | undefined,
    fallbackTitle?: string,
    fallbackActiveLabel?: string,
  ) => WorkflowProgressViewModel | null
  error: string
  activeSceneId: string | null
  busyRunKeys: ReadonlySet<string>
  graphOpenKey: string | null
  pendingContinuityAssets: {
    masterRequestId: string
    nodeIds: string[]
    previousAssetKeys: Record<string, string>
    forceRefresh: boolean
    startedAt: number
  } | null
  nextPendingShot: SequenceAnimaticPendingShotView | null
  recentlyStreamedShotIds: Readonly<Record<string, number>>
  shotPrompt: SequenceAnimaticShotPromptState | null
  shotPromptDraftByKey: Readonly<Record<string, string>>
  onSetShotPromptDraft: (runKey: string, prompt: string) => void
  shotVideoRunKeyActive: (runKey: string) => boolean
  onBindShotElement: (shotElementKey: string, node: HTMLElement | null) => void
  onRetryHydration: () => void
  onRunScene: (model: SequenceAnimaticViewModel, scene: SequenceAnimaticSceneView) => void
  onRunBlock: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, mode: 'regenerate_storyboard' | 'generate_video') => void
  onRunShotRevision: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, prompt: string) => void
  onRunShotKeyframe: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, mode: 'generate' | 'regenerate') => void
  onRunShotVideo: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenShotGraph: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, refresh?: boolean) => void
  onPlayVideo: (preview: SequenceAnimaticVideoPreview) => void
  onOpenShotPreview: (input: WorldWikiDetailModalInput) => void
  onOpenShotInspector: (input: SequenceAnimaticShotInspectorInput) => void
  onOpenSpatialInspector: (block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenCoverageInspector: (block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, anchor: SequenceAnimaticCoverageAnchorView) => void
  onOpenContinuityGraph: (requestId: string, scopeWorldLocationId?: string | null, scopeSceneId?: string | null) => void
  onOpenSceneBoard: (requestId: string, scopeSceneId?: string | null, scopeNodeId?: string | null) => void
  onGenerateContinuityAssets: (
    model: SequenceAnimaticViewModel,
    targets?: readonly SequenceAnimaticViewModel['continuityAssetTargets'][number][],
    options?: { batchKind?: 'spot_camera_grid'; forceRefresh?: boolean },
  ) => void
  onGenerateCoverageAnchor: (
    model: SequenceAnimaticViewModel,
    anchor: SequenceAnimaticViewModel['coverageAnchors'][number],
    mode: 'generate' | 'regenerate',
  ) => void
  onRunKeyframes: (model: SequenceAnimaticViewModel, mode: 'generate' | 'regenerate') => void
  onOpenWorkflowGraph: (model: SequenceAnimaticViewModel, requestId: string) => void
  onRegenerateSceneCoverage: (model: SequenceAnimaticViewModel, scene: SequenceAnimaticSceneView) => void
  onOpenTimeline: (model: SequenceAnimaticViewModel) => void
}

type SequenceAnimaticRouteTimelineProps = Pick<
  SequenceAnimaticRouteViewerProps,
  | 'activeSceneId'
  | 'busyRunKeys'
  | 'graphOpenKey'
  | 'pendingContinuityAssets'
  | 'nextPendingShot'
  | 'recentlyStreamedShotIds'
  | 'shotPrompt'
  | 'shotPromptDraftByKey'
  | 'onSetShotPromptDraft'
  | 'shotVideoRunKeyActive'
  | 'onBindShotElement'
  | 'onRunScene'
  | 'onRunBlock'
  | 'onRunShotRevision'
  | 'onRunShotKeyframe'
  | 'onRunShotVideo'
  | 'onOpenShotGraph'
  | 'onPlayVideo'
  | 'onOpenShotPreview'
  | 'onOpenShotInspector'
  | 'onOpenSpatialInspector'
  | 'onOpenCoverageInspector'
  | 'onOpenWorkflowGraph'
  | 'workflowProgressForRequest'
  | 'onOpenContinuityGraph'
  | 'onOpenSceneBoard'
  | 'onGenerateContinuityAssets'
  | 'onGenerateCoverageAnchor'
> & {
  model: SequenceAnimaticViewModel
  error: string
}

export function SequenceAnimaticRouteViewer({
  entityKey,
  model,
  hydration,
  error,
  activeSceneId,
  busyRunKeys,
  graphOpenKey,
  pendingContinuityAssets,
  nextPendingShot,
  recentlyStreamedShotIds,
  shotPrompt,
  shotPromptDraftByKey,
  onSetShotPromptDraft,
  shotVideoRunKeyActive,
  onBindShotElement,
  onRetryHydration,
  onRunScene,
  onRunBlock,
  onRunShotRevision,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayVideo,
  onOpenShotPreview,
  onOpenShotInspector,
  onOpenSpatialInspector,
  onOpenCoverageInspector,
  onOpenContinuityGraph,
  onOpenSceneBoard,
  onGenerateContinuityAssets,
  onGenerateCoverageAnchor,
  onRunKeyframes,
  onOpenWorkflowGraph,
  workflowProgressForRequest,
  onRegenerateSceneCoverage,
  onOpenTimeline,
}: SequenceAnimaticRouteViewerProps) {
  const loading = !model && hydration.status !== 'failed'

  return (
    <section className="world-wiki-entity-page world-wiki-sequence-animatic-page" data-world-wiki-entity-page={entityKey}>
      <main className="world-wiki-sequence-animatic-main">
        <header className="world-wiki-sequence-animatic-page-head">
          <div className="world-wiki-sequence-animatic-page-actions">
            {model ? (
              <>
                <SequenceAnimaticWorkflowHeaderActions
                  model={model}
                  activeSceneId={activeSceneId}
                  busyRunKeys={busyRunKeys}
                  masterGraphLabel="Master graph"
                  showSceneWorkflowButton
                  requireSceneRequestForSceneActions
                  onOpenContinuityGraph={onOpenContinuityGraph}
                  onOpenSceneBoard={onOpenSceneBoard}
                  onRunKeyframes={onRunKeyframes}
                  onOpenWorkflowGraph={onOpenWorkflowGraph}
                  onRegenerateSceneCoverage={onRegenerateSceneCoverage}
                  onOpenTimeline={onOpenTimeline}
                />
              </>
            ) : null}
          </div>
        </header>
        {error ? <div className="inline-note is-warning">{error}</div> : null}
        {hydration.status === 'failed' && !model ? (
          <section className="world-wiki-sequence-animatic-empty">
            <strong>Could not load this animatic.</strong>
            <p>{hydration.error || 'The linked output may have been deleted or is not available in this workspace.'}</p>
            <button className="ghost-button compact" onClick={onRetryHydration} type="button">Retry</button>
          </section>
        ) : null}
        {loading ? (
          <section className="world-wiki-sequence-animatic-skeleton">
            <span className="world-mini-spinner" aria-hidden="true" />
            <strong>Checking linked output state...</strong>
            <p>This page hydrates the animatic directly from the sequence unit without opening Output Studio.</p>
          </section>
        ) : null}
        {model ? (
          <SequenceAnimaticRouteTimeline
            model={model}
            error={error}
            activeSceneId={activeSceneId}
            busyRunKeys={busyRunKeys}
            graphOpenKey={graphOpenKey}
            pendingContinuityAssets={pendingContinuityAssets}
            nextPendingShot={nextPendingShot}
            recentlyStreamedShotIds={recentlyStreamedShotIds}
            shotPrompt={shotPrompt}
            shotPromptDraftByKey={shotPromptDraftByKey}
            onSetShotPromptDraft={onSetShotPromptDraft}
            shotVideoRunKeyActive={shotVideoRunKeyActive}
            onBindShotElement={onBindShotElement}
            onRunScene={onRunScene}
            onRunBlock={onRunBlock}
            onRunShotRevision={onRunShotRevision}
            onRunShotKeyframe={onRunShotKeyframe}
            onRunShotVideo={onRunShotVideo}
            onOpenShotGraph={onOpenShotGraph}
            onPlayVideo={onPlayVideo}
            onOpenShotPreview={onOpenShotPreview}
            onOpenShotInspector={onOpenShotInspector}
            onOpenSpatialInspector={onOpenSpatialInspector}
            onOpenCoverageInspector={onOpenCoverageInspector}
            onOpenContinuityGraph={onOpenContinuityGraph}
            onOpenSceneBoard={onOpenSceneBoard}
            onGenerateContinuityAssets={onGenerateContinuityAssets}
            onGenerateCoverageAnchor={onGenerateCoverageAnchor}
            onOpenWorkflowGraph={onOpenWorkflowGraph}
            workflowProgressForRequest={workflowProgressForRequest}
          />
        ) : null}
      </main>
    </section>
  )
}

function SequenceAnimaticRouteTimeline({
  model,
  error,
  activeSceneId,
  busyRunKeys,
  graphOpenKey,
  pendingContinuityAssets,
  nextPendingShot,
  recentlyStreamedShotIds,
  shotPrompt,
  shotPromptDraftByKey,
  onSetShotPromptDraft,
  shotVideoRunKeyActive,
  onBindShotElement,
  onRunScene,
  onRunShotRevision,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayVideo,
  onOpenShotPreview,
  onOpenShotInspector,
  onOpenSpatialInspector,
  onOpenCoverageInspector,
  onOpenContinuityGraph,
  onOpenSceneBoard,
  onGenerateContinuityAssets,
  onGenerateCoverageAnchor,
  onOpenWorkflowGraph,
  workflowProgressForRequest,
}: SequenceAnimaticRouteTimelineProps) {
  const scenes = model.scenes
  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0] ?? null

  return (
    <div className="world-wiki-sequence-animatic-timeline">
      {sequenceAnimaticShouldShowThinking(model) ? <SequenceAnimaticThinkingState /> : null}
      {activeScene && activeScene.status !== 'ready' ? (
        <SequenceAnimaticSceneGate
          model={model}
          scene={activeScene}
          busyRunKeys={busyRunKeys}
          onRunScene={onRunScene}
          onOpenWorkflowGraph={onOpenWorkflowGraph}
        />
      ) : null}
      {!sequenceAnimaticShouldShowThinking(model) && model.blocks.length === 0 && model.scenes.length === 0 ? (
        <section className="world-wiki-sequence-animatic-empty">
          <strong>No storyboard blocks yet.</strong>
          <p>Shot blocks will appear here once the animatic planner saves them.</p>
        </section>
      ) : null}
      {model.blocks.length > 0 ? (
          <SequenceAnimaticShotWorkspace
            model={model}
            commandError={error}
            activeSceneId={activeScene?.id ?? activeSceneId}
          busyRunKeys={busyRunKeys}
          graphOpenKey={graphOpenKey}
          pendingContinuityAssets={pendingContinuityAssets}
          nextPendingShot={nextPendingShot}
          recentlyStreamedShotIds={recentlyStreamedShotIds}
          shotPrompt={shotPrompt}
          shotPromptDraftByKey={shotPromptDraftByKey}
          onSetShotPromptDraft={onSetShotPromptDraft}
          shotVideoRunKeyActive={shotVideoRunKeyActive}
          onBindShotElement={onBindShotElement}
          onRunShotRevision={onRunShotRevision}
          onRunShotKeyframe={onRunShotKeyframe}
          onRunShotVideo={onRunShotVideo}
          onOpenShotGraph={onOpenShotGraph}
          onPlayShotVideo={onPlayVideo}
          onOpenShotPreview={onOpenShotPreview}
          onOpenShotInspector={onOpenShotInspector}
          onOpenSpatialInspector={onOpenSpatialInspector}
          onOpenCoverageInspector={onOpenCoverageInspector}
          onOpenContinuityGraph={onOpenContinuityGraph}
          onOpenSceneBoard={onOpenSceneBoard}
          onGenerateContinuityAssets={onGenerateContinuityAssets}
          onGenerateCoverageAnchor={onGenerateCoverageAnchor}
          workflowProgressForRequest={workflowProgressForRequest}
        />
      ) : null}
    </div>
  )
}

function SequenceAnimaticSceneGate({
  model,
  scene,
  busyRunKeys,
  onRunScene,
  onOpenWorkflowGraph,
}: {
  model: SequenceAnimaticViewModel
  scene: SequenceAnimaticSceneView
  busyRunKeys: ReadonlySet<string>
  onRunScene: (model: SequenceAnimaticViewModel, scene: SequenceAnimaticSceneView) => void
  onOpenWorkflowGraph: (model: SequenceAnimaticViewModel, requestId: string) => void
}) {
  const sceneBusy = busyRunKeys.has(`${model.request.id}:${scene.id}:generate_scene`)

  return (
    <section className="world-wiki-sequence-animatic-empty world-wiki-sequence-animatic-scene-gate">
      <strong>Scene {scene.index}: {scene.title}</strong>
      {scene.status === 'planning' || sceneBusy ? (
        <>
          <p><span className="world-mini-spinner" aria-hidden="true" /> Planning shots and continuity for this scene...</p>
          {scene.requestId ? (
            <button className="ghost-button compact" onClick={() => onOpenWorkflowGraph(model, scene.requestId!)} type="button">
              <EntityIcon id="graph" />
              Inspect scene workflow
            </button>
          ) : null}
        </>
      ) : scene.status === 'failed' ? (
        <>
          <p>Shot planning for this scene failed. You can retry it.</p>
          <button className="ghost-button compact" onClick={() => onRunScene(model, scene)} type="button">
            Retry scene shots
          </button>
        </>
      ) : (
        <>
          <p>This scene has no shots yet. Generate its shot plan when you are ready to work on it.</p>
          <button className="primary-button compact" onClick={() => onRunScene(model, scene)} type="button">
            Generate shots for this scene
          </button>
        </>
      )}
    </section>
  )
}
