import type { Ref } from 'react'

import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'
import { EntityIcon } from '../../../shared/entityIcons'
import { WorkflowLiveStatus } from '../../workflows/WorkflowProgressWidgets'
import type { WorldWikiDetailModalInput } from '../wiki/WorldWikiSections'
import {
  SequenceAnimaticBlockTimeline,
  type SequenceAnimaticPendingShotView,
  type SequenceAnimaticShotInspectorInput,
  type SequenceAnimaticShotPromptState,
  sequenceAnimaticShotPreviewInput,
} from './SequenceAnimaticBlockTimeline'
import { SequenceAnimaticPipelineRail } from './SequenceAnimaticPipelineRail'
import { SequenceAnimaticThinkingState, sequenceAnimaticShouldShowThinking } from './SequenceAnimaticThinkingState'
import { SequenceAnimaticWorkflowHeaderActions } from './SequenceAnimaticWorkflowHeaderActions'
import type { SequenceAnimaticVideoPreview, SequenceAnimaticViewModel } from './sequenceAnimaticViewModel'

type SequenceAnimaticBlockView = SequenceAnimaticViewModel['blocks'][number]
type SequenceAnimaticShotView = SequenceAnimaticBlockView['shots'][number]
type SequenceAnimaticCoverageAnchorView = SequenceAnimaticViewModel['coverageAnchors'][number]

export type SequenceAnimaticHydrationState = {
  status: 'idle' | 'checking' | 'failed'
  error?: string | null
}

type SequenceAnimaticOverlayViewerProps = {
  model: SequenceAnimaticViewModel
  workflowProgress: WorkflowProgressViewModel | null
  activeSceneId: string | null
  busyRunKeys: ReadonlySet<string>
  latestStreamedShotKey: string | null
  followLatest: boolean
  graphOpenKey: string | null
  nextPendingShot: SequenceAnimaticPendingShotView | null
  recentlyStreamedShotIds: Readonly<Record<string, number>>
  shotPrompt: SequenceAnimaticShotPromptState | null
  shotPromptDraftByKey: Readonly<Record<string, string>>
  onSetShotPromptDraft: (runKey: string, prompt: string) => void
  shotVideoRunKeyActive: (runKey: string) => boolean
  onBindShotElement: (shotElementKey: string, node: HTMLElement | null) => void
  onClose: () => void
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
  onRunKeyframes: (model: SequenceAnimaticViewModel, mode: 'generate' | 'regenerate') => void
  onOpenWorkflowGraph: (model: SequenceAnimaticViewModel, requestId: string) => void
  onRegenerateSceneCoverage: (model: SequenceAnimaticViewModel, scene: SequenceAnimaticViewModel['scenes'][number]) => void
  onJumpToLatest: () => void
  onOpenTimeline: (model: SequenceAnimaticViewModel) => void
}

export function SequenceAnimaticOverlayViewer({
  model,
  workflowProgress,
  activeSceneId,
  busyRunKeys,
  latestStreamedShotKey,
  followLatest,
  graphOpenKey,
  nextPendingShot,
  recentlyStreamedShotIds,
  shotPrompt,
  shotPromptDraftByKey,
  onSetShotPromptDraft,
  shotVideoRunKeyActive,
  onBindShotElement,
  onClose,
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
  onRunKeyframes,
  onOpenWorkflowGraph,
  onRegenerateSceneCoverage,
  onJumpToLatest,
  onOpenTimeline,
}: SequenceAnimaticOverlayViewerProps) {
  return (
    <div className="world-wiki-sequence-animatic-overlay" onClick={onClose}>
      <section
        className="world-wiki-sequence-animatic-viewer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sequence screenplay animatic"
      >
        <SequenceAnimaticOverlayCloseButton onClose={onClose} ariaLabel="Close animatic preview" />
        <header className="world-wiki-sequence-animatic-head">
          <div>
            <span className="eyebrow">Screenplay animatic</span>
            <h2>{model.title}</h2>
            <SequenceAnimaticPipelineRail
              model={model}
              workflowProgress={workflowProgress}
              onOpenWorkflowGraph={() => onOpenWorkflowGraph(model, model.request.id)}
            />
          </div>
          <div className="world-wiki-sequence-animatic-head-actions">
            <span>{model.statusLabel}</span>
            {model.progressLabel ? <em>{model.progressLabel}</em> : null}
            <SequenceAnimaticWorkflowHeaderActions
              model={model}
              activeSceneId={activeSceneId}
              busyRunKeys={busyRunKeys}
              latestStreamedShotKey={latestStreamedShotKey}
              followLatest={followLatest}
              onOpenContinuityGraph={onOpenContinuityGraph}
              onOpenSceneBoard={onOpenSceneBoard}
              onRunKeyframes={onRunKeyframes}
              onOpenWorkflowGraph={onOpenWorkflowGraph}
              onRegenerateSceneCoverage={onRegenerateSceneCoverage}
              onJumpToLatest={onJumpToLatest}
              onOpenTimeline={onOpenTimeline}
            />
          </div>
        </header>
        <WorkflowLiveStatus label={model.currentStepLabel} className="is-spaced" />
        {model.blocks.length > 0 ? (
          <div className="world-wiki-sequence-animatic-document">
            {model.blocks.map((block) => (
              <SequenceAnimaticBlockTimeline
                key={block.id}
                model={model}
                block={block}
                variant="overlay"
                busyRunKeys={busyRunKeys}
                graphOpenKey={graphOpenKey}
                nextPendingShot={nextPendingShot}
                recentlyStreamedShotIds={recentlyStreamedShotIds}
                shotPrompt={shotPrompt}
                shotPromptDraftByKey={shotPromptDraftByKey}
                onSetShotPromptDraft={onSetShotPromptDraft}
                shotVideoRunKeyActive={shotVideoRunKeyActive}
                onBindShotElement={onBindShotElement}
                onRunBlock={onRunBlock}
                onRunShotRevision={onRunShotRevision}
                onRunShotKeyframe={onRunShotKeyframe}
                onRunShotVideo={onRunShotVideo}
                onOpenShotGraph={onOpenShotGraph}
                onPlayBlockVideo={onPlayVideo}
                onPlayShotVideo={onPlayVideo}
                onOpenShotPreview={(shot) => onOpenShotPreview(sequenceAnimaticShotPreviewInput(shot))}
                onOpenShotInspector={onOpenShotInspector}
                onOpenSpatialInspector={onOpenSpatialInspector}
                onOpenCoverageInspector={onOpenCoverageInspector}
              />
            ))}
          </div>
        ) : (
          sequenceAnimaticShouldShowThinking(model) ? <SequenceAnimaticThinkingState /> : (
            <div className="world-wiki-sequence-animatic-empty">
              <strong>Screenplay generation has started.</strong>
              <p>Shot blocks and storyboard panels will appear here as the output graph saves them.</p>
              {model.screenplayMarkdown ? <pre>{model.screenplayMarkdown}</pre> : null}
            </div>
          )
        )}
      </section>
    </div>
  )
}

export function SequenceAnimaticLoadingOverlay({
  hydration,
  viewerRef,
  onScroll,
  onClose,
  onRetry,
}: {
  hydration: SequenceAnimaticHydrationState
  viewerRef?: Ref<HTMLElement>
  onScroll?: () => void
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <div className="world-wiki-sequence-animatic-overlay" onClick={onClose}>
      <section
        className="world-wiki-sequence-animatic-viewer"
        ref={viewerRef}
        onScroll={onScroll}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sequence screenplay animatic loading"
      >
        <SequenceAnimaticOverlayCloseButton onClose={onClose} ariaLabel="Close animatic preview" />
        <header className="world-wiki-sequence-animatic-head">
          <div>
            <span className="eyebrow">Screenplay animatic</span>
            <h2>{hydration.status === 'failed' ? 'Animatic unavailable' : 'Loading linked animatic'}</h2>
          </div>
          <div className="world-wiki-sequence-animatic-head-actions">
            <span>{hydration.status === 'failed' ? 'Load failed' : 'Checking outputs'}</span>
          </div>
        </header>
        <section className="world-wiki-sequence-animatic-empty">
          {hydration.status === 'failed' ? (
            <>
              <strong>Could not load this animatic.</strong>
              <p>{hydration.error || 'The linked output may have been deleted or is not available in this workspace.'}</p>
              <button className="ghost-button compact" onClick={onRetry} type="button">Retry</button>
            </>
          ) : (
            <>
              <strong>Checking output state...</strong>
              <p>The animatic viewer is opening from the linked request while the compact state sync catches up.</p>
            </>
          )}
        </section>
      </section>
    </div>
  )
}

function SequenceAnimaticOverlayCloseButton({
  onClose,
  ariaLabel,
}: {
  onClose: () => void
  ariaLabel: string
}) {
  return (
    <button
      className="world-wiki-sequence-animatic-close"
      onClick={onClose}
      type="button"
      aria-label={ariaLabel}
    >
      <EntityIcon id="close" />
    </button>
  )
}
