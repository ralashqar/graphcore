import { EntityIcon } from '../../../shared/entityIcons'
import {
  sequenceAnimaticPerformanceBeatLine,
  sequenceAnimaticShotCanGenerateEarlyKeyframe,
  sequenceAnimaticShotPreviewEyebrow,
  type SequenceAnimaticVideoPreview,
  type SequenceAnimaticViewModel,
} from './sequenceAnimaticViewModel'
import { sequenceAnimaticShotKeyframeBusyLabel } from './sequenceAnimaticProgressPresentation'

type SequenceAnimaticBlockView = SequenceAnimaticViewModel['blocks'][number]
type SequenceAnimaticShotView = SequenceAnimaticBlockView['shots'][number]
type SequenceAnimaticCoverageAnchorView = SequenceAnimaticViewModel['coverageAnchors'][number]

export type SequenceAnimaticPendingShotView = {
  blockId: string
  shotId: string
  index: number
}

export type SequenceAnimaticShotInspectorInput = {
  kind: 'lighting' | 'performance'
  blockTitle: string
  shotTitle: string
  content: string
}

export type SequenceAnimaticShotPromptState = {
  masterRequestId: string
  storyboardBlockId: string
  shotId: string
  shotTitle: string
  prompt: string
  status: 'idle' | 'rewriting' | 'generating' | 'saving' | 'failed'
  error: string | null
}

type SequenceAnimaticBlockTimelineProps = {
  model: SequenceAnimaticViewModel
  block: SequenceAnimaticBlockView
  variant: 'route' | 'overlay'
  busyRunKeys: ReadonlySet<string>
  graphOpenKey: string | null
  nextPendingShot: SequenceAnimaticPendingShotView | null
  recentlyStreamedShotIds: Readonly<Record<string, number>>
  shotPrompt: SequenceAnimaticShotPromptState | null
  shotPromptDraftByKey: Readonly<Record<string, string>>
  onSetShotPromptDraft: (runKey: string, prompt: string) => void
  shotVideoRunKeyActive: (runKey: string) => boolean
  onBindShotElement: (shotElementKey: string, node: HTMLElement | null) => void
  onRunBlock: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, mode: 'regenerate_storyboard' | 'generate_video') => void
  onRunShotRevision: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, prompt: string) => void
  onRunShotKeyframe: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, mode: 'generate' | 'regenerate') => void
  onRunShotVideo: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenShotGraph: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, refresh?: boolean) => void
  onPlayBlockVideo: (preview: SequenceAnimaticVideoPreview) => void
  onPlayShotVideo: (preview: SequenceAnimaticVideoPreview) => void
  onOpenShotPreview: (shot: SequenceAnimaticShotView) => void
  onOpenShotInspector: (input: SequenceAnimaticShotInspectorInput) => void
  onOpenSpatialInspector: (block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenCoverageInspector: (
    block: SequenceAnimaticBlockView,
    shot: SequenceAnimaticShotView,
    anchor: SequenceAnimaticCoverageAnchorView,
  ) => void
}

export function SequenceAnimaticBlockTimeline(props: SequenceAnimaticBlockTimelineProps) {
  return props.variant === 'route'
    ? <SequenceAnimaticRouteBlockTimeline {...props} />
    : <SequenceAnimaticOverlayBlockTimeline {...props} />
}

function SequenceAnimaticRouteBlockTimeline(props: SequenceAnimaticBlockTimelineProps) {
  const {
    model,
    block,
    busyRunKeys,
    nextPendingShot,
    onRunBlock,
    onPlayBlockVideo,
  } = props
  const storyboardRunKey = `${model.request.id}:${block.id}:regenerate_storyboard`
  const videoRunKey = `${model.request.id}:${block.id}:generate_video`

  return (
    <section
      key={block.id}
      id={`wiki-animatic-block-${block.id}`}
      className="world-wiki-sequence-animatic-block-section"
      data-animatic-block-id={block.id}
    >
      <header className="world-wiki-sequence-animatic-block-toolbar">
        <div>
          <span>Block {block.index} / {block.durationLabel}</span>
          <h3>{block.title}</h3>
          <small>{block.shotRangeLabel}</small>
        </div>
        <div>
          <button className="ghost-button compact" disabled={block.isProvisional || block.storyboardRunning || busyRunKeys.has(storyboardRunKey)} onClick={() => onRunBlock(model, block, 'regenerate_storyboard')} type="button">
            {block.storyboardRunning || busyRunKeys.has(storyboardRunKey) ? <><span className="world-mini-spinner" aria-hidden="true" />Generating</> : block.storyboardReady ? 'Regenerate storyboard' : 'Generate storyboard'}
          </button>
          {block.videoReady && block.videoUrl ? (
            <button className="ghost-button compact" onClick={() => onPlayBlockVideo({ title: `${block.title} - last take`, url: block.videoUrl ?? '', durationLabel: block.durationLabel, statusLabel: block.videoProgressLabel })} type="button">Play video</button>
          ) : block.storyboardReady && block.videoPromptReady ? (
            <button className="ghost-button compact" disabled={block.isProvisional || block.videoRunning || busyRunKeys.has(videoRunKey)} onClick={() => onRunBlock(model, block, 'generate_video')} type="button">
              {block.videoRunning ? 'Generating video' : 'Generate video'}
            </button>
          ) : null}
          <small className={block.storyboardContinuityStale ? 'world-wiki-sequence-animatic-video-status is-error' : 'world-wiki-sequence-animatic-video-status'}>
            {block.storyboardContinuityLabel}
          </small>
        </div>
      </header>
      <div className="world-wiki-sequence-animatic-shot-timeline">
        {block.shots.map((shot) => (
          <SequenceAnimaticRouteShotCard key={shot.id} {...props} shot={shot} />
        ))}
        {nextPendingShot?.blockId === block.id ? <SequenceAnimaticPendingShotCard pendingShot={nextPendingShot} variant="route" /> : null}
      </div>
    </section>
  )
}

function SequenceAnimaticOverlayBlockTimeline(props: SequenceAnimaticBlockTimelineProps) {
  const {
    model,
    block,
    busyRunKeys,
    nextPendingShot,
    onRunBlock,
    onPlayBlockVideo,
  } = props
  const storyboardRunKey = `${model.request.id}:${block.id}:regenerate_storyboard`
  const videoRunKey = `${model.request.id}:${block.id}:generate_video`

  return (
    <section key={block.id} className="world-wiki-sequence-animatic-block">
      <div className="world-wiki-sequence-animatic-block-head">
        <div>
          <span>Block {block.index} / {block.durationLabel}</span>
          <h3>{block.title}</h3>
          <em>{block.shotRangeLabel}</em>
        </div>
        <div>
          <button
            className="ghost-button compact"
            disabled={block.isProvisional || block.storyboardRunning || busyRunKeys.has(storyboardRunKey)}
            onClick={() => onRunBlock(model, block, 'regenerate_storyboard')}
            type="button"
          >
            {block.storyboardRunning || busyRunKeys.has(storyboardRunKey)
              ? <><span className="world-mini-spinner" aria-hidden="true" />{block.storyboardProgressLabel || 'Generating storyboard'}</>
              : block.storyboardReady && block.videoPromptReady
                ? 'Regenerate storyboard'
                : block.storyboardReady
                  ? 'Finish storyboard prep'
                  : 'Generate storyboard'}
          </button>
          {block.videoReady && block.videoUrl ? (
            <button
              className="ghost-button compact world-wiki-sequence-animatic-video-action"
              onClick={() => onPlayBlockVideo({
                title: `${block.title} - last take`,
                url: block.videoUrl ?? '',
                durationLabel: block.durationLabel,
                statusLabel: block.videoProgressLabel,
              })}
              type="button"
            >
              <span className="world-wiki-sequence-animatic-play-glyph" aria-hidden="true" />
              Play last take
            </button>
          ) : block.storyboardReady && block.videoPromptReady ? (
            <button
              className="ghost-button compact world-wiki-sequence-animatic-video-action"
              disabled={block.isProvisional || block.videoRunning || busyRunKeys.has(videoRunKey)}
              onClick={() => onRunBlock(model, block, 'generate_video')}
              type="button"
            >
              {block.videoRunning || busyRunKeys.has(videoRunKey)
                ? <><span className="world-mini-spinner" aria-hidden="true" />Generating video</>
                : 'Generate video'}
            </button>
          ) : null}
          {block.videoReady && block.videoUrl && block.storyboardReady && block.videoPromptReady ? (
            <button
              className="ghost-button compact"
              disabled={block.isProvisional || block.videoRunning || busyRunKeys.has(videoRunKey)}
              onClick={() => onRunBlock(model, block, 'generate_video')}
              type="button"
            >
              {busyRunKeys.has(videoRunKey) ? 'Starting...' : 'Regenerate video'}
            </button>
          ) : null}
          <small className={block.videoError ? 'world-wiki-sequence-animatic-video-status is-error' : 'world-wiki-sequence-animatic-video-status'}>
            {block.videoRunning ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
            {block.videoProgressLabel}
          </small>
          <small className={block.storyboardContinuityStale ? 'world-wiki-sequence-animatic-video-status is-error' : 'world-wiki-sequence-animatic-video-status'}>
            {block.storyboardContinuityLabel}
          </small>
        </div>
      </div>
      <div className="world-wiki-sequence-animatic-shot-list">
        {block.shots.map((shot) => (
          <SequenceAnimaticOverlayShotCard key={shot.id} {...props} shot={shot} />
        ))}
        {nextPendingShot?.blockId === block.id ? <SequenceAnimaticPendingShotCard pendingShot={nextPendingShot} variant="overlay" /> : null}
      </div>
    </section>
  )
}

function SequenceAnimaticRouteShotCard({
  model,
  block,
  shot,
  busyRunKeys,
  graphOpenKey,
  recentlyStreamedShotIds,
  shotPrompt,
  shotPromptDraftByKey,
  onSetShotPromptDraft,
  shotVideoRunKeyActive,
  onBindShotElement,
  onRunShotRevision,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayShotVideo,
  onOpenShotPreview,
  onOpenShotInspector,
  onOpenSpatialInspector,
  onOpenCoverageInspector,
}: SequenceAnimaticBlockTimelineProps & { shot: SequenceAnimaticShotView }) {
  const shotRevisionRunKey = `${model.request.id}:${block.id}:${shot.id}:shot_revision`
  const shotKeyframeRunKey = `${model.request.id}:${block.id}:${shot.id}:keyframe`
  const shotVideoRunKey = `${model.request.id}:${block.id}:${shot.id}:shot_video`
  const shotVideoStarting = shotVideoRunKeyActive(shotVideoRunKey)
  const shotKeyframeStarting = busyRunKeys.has(shotKeyframeRunKey)
  const shotKeyframeBusy = shotKeyframeStarting || shot.keyframeRunning || shot.keyframeDependencyRunning
  const shotKeyframeBusyLabel = sequenceAnimaticShotKeyframeBusyLabel(shot, shotKeyframeStarting)
  const shotKeyframeReady = sequenceAnimaticShotKeyframeReady(shot)
  const shotCanGenerateEarlyKeyframe = sequenceAnimaticShotCanGenerateEarlyKeyframe(shot)
  const activeShotPrompt = activeShotPromptFor(shotPrompt, model.request.id, block.id, shot.id)
  const shotPromptValue = activeShotPrompt?.prompt ?? shotPromptDraftByKey[shotRevisionRunKey] ?? ''
  const shotPromptBusy = Boolean(activeShotPrompt && !['idle', 'failed'].includes(activeShotPrompt.status))
    || shot.revisionRunning
    || busyRunKeys.has(shotRevisionRunKey)
  const shotPromptDisabled = !shot.panelUrl || shotPromptBusy
  const shotPromptStatusLabel = shotPromptStatusText(activeShotPrompt, shot.panelUrl)
  const shotCoverageAnchor = coverageAnchorForShot(model, shot)
  const shotElementKey = `${model.request.id}:${block.id}:${shot.id}`
  const timelineShotClassName = [
    'world-wiki-sequence-animatic-timeline-shot',
    shot.isRevised ? 'is-revised' : '',
    shot.isProvisional ? 'is-streaming' : '',
    recentlyStreamedShotIds[shotElementKey] ? 'is-streaming-new' : '',
  ].filter(Boolean).join(' ')

  return (
    <article
      ref={(node) => onBindShotElement(shotElementKey, node)}
      className={timelineShotClassName}
    >
      <div className="world-wiki-sequence-animatic-time-rail">
        <strong>{String(shot.index).padStart(3, '0')}</strong>
        <span>{shot.timeLabel}</span>
        <small>{shot.durationLabel}</small>
      </div>
      <div className="world-wiki-sequence-animatic-shot-body">
        <div className="world-wiki-sequence-animatic-shot-text">
          <div className="world-wiki-sequence-animatic-shot-title-row">
            <h4>{shot.title}</h4>
            {shot.coverageSetupLabel ? <span title={shot.coverageSetupDetail || shot.coverageSetupLabel}>{shot.coverageSetupLabel}</span> : null}
            {shot.keyframeStatusLabel !== 'Keyframe not generated' ? (
              <span>
                {shotKeyframeBusy ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
                {shotKeyframeBusy ? shotKeyframeBusyLabel : shot.keyframeStatusLabel}
              </span>
            ) : null}
            {shot.isRevised ? <span>Revised</span> : null}
            {shot.revisionRunning ? <span><span className="world-mini-spinner" aria-hidden="true" />Revising</span> : null}
          </div>
          <p>{shot.action || 'Shot action is still being parsed.'}</p>
          <SequenceAnimaticDialogueList shot={shot} />
          {shot.revisionError ? <small className="world-wiki-sequence-animatic-video-status is-error">{shot.revisionError}</small> : null}
          <div className="world-wiki-sequence-shot-detail-rows">
            <div className="world-wiki-sequence-shot-core-details">
              <button className="world-wiki-sequence-shot-detail-row is-core-detail" title={shot.lighting || 'No lighting instructions recorded.'} disabled={!shot.lighting} onClick={() => onOpenShotInspector({ kind: 'lighting', blockTitle: block.title, shotTitle: shot.title, content: shot.lighting || 'No lighting instructions recorded.' })} type="button">
                <EntityIcon id="lighting" />
                <strong>Lighting</strong>
                <span>{shot.lighting || 'No lighting instructions recorded.'}</span>
              </button>
              <button className="world-wiki-sequence-shot-detail-row is-core-detail" title={shot.spatialContinuityDetail || shot.spatialContinuityLabel} onClick={() => onOpenSpatialInspector(block, shot)} type="button">
                <EntityIcon id="environment" />
                <strong>Set</strong>
                <span>{shot.spatialContinuityLabel}</span>
              </button>
              {shotCoverageAnchor ? (
                <button
                  className="world-wiki-sequence-shot-detail-row is-core-detail"
                  title={shot.coverageSetupDetail || shotCoverageAnchor.stagingBrief || shot.coverageSetupLabel}
                  onClick={() => onOpenCoverageInspector(block, shot, shotCoverageAnchor)}
                  type="button"
                >
                  <EntityIcon id="camera" />
                  <strong>Coverage</strong>
                  <span>
                    {shotCoverageAnchor.running ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
                    {shot.coverageSetupLabel || shotCoverageAnchor.title}
                  </span>
                </button>
              ) : null}
            </div>
            <SequenceAnimaticRoutePerformanceRows block={block} shot={shot} onOpenShotInspector={onOpenShotInspector} />
          </div>
          <form
            className={activeShotPrompt?.status === 'failed' ? 'world-wiki-sequence-shot-inline-prompt is-error' : 'world-wiki-sequence-shot-inline-prompt'}
            onSubmit={(event) => {
              event.preventDefault()
              if (shotPromptDisabled) return
              onRunShotRevision(model, block, shot, shotPromptValue)
            }}
          >
            <label htmlFor={`shot-revision-${shotRevisionRunKey}`}>Prompt this shot</label>
            <div>
              <input
                id={`shot-revision-${shotRevisionRunKey}`}
                value={shotPromptValue}
                disabled={shotPromptDisabled}
                onChange={(event) => onSetShotPromptDraft(shotRevisionRunKey, event.target.value)}
                placeholder="Change camera angle, expression, staging, lighting..."
              />
              <button
                type="submit"
                aria-label="Send shot revision prompt"
                disabled={shotPromptDisabled}
              >
                {shotPromptBusy ? <span className="world-mini-spinner" aria-hidden="true" /> : <EntityIcon id="send" />}
              </button>
            </div>
            {shotPromptStatusLabel ? <small>{shotPromptStatusLabel}</small> : null}
          </form>
        </div>
        <SequenceAnimaticShotPanel
          model={model}
          block={block}
          shot={shot}
          variant="route"
          graphOpenKey={graphOpenKey}
          shotVideoStarting={shotVideoStarting}
          shotKeyframeBusy={shotKeyframeBusy}
          shotKeyframeBusyLabel={shotKeyframeBusyLabel}
          shotKeyframeReady={shotKeyframeReady}
          shotCanGenerateEarlyKeyframe={shotCanGenerateEarlyKeyframe}
          onRunShotKeyframe={onRunShotKeyframe}
          onRunShotVideo={onRunShotVideo}
          onOpenShotGraph={onOpenShotGraph}
          onPlayShotVideo={onPlayShotVideo}
          onOpenShotPreview={onOpenShotPreview}
          extraKeyframeDisabled={busyRunKeys.has(shotRevisionRunKey)}
        />
      </div>
    </article>
  )
}

function SequenceAnimaticOverlayShotCard({
  model,
  block,
  shot,
  busyRunKeys,
  graphOpenKey,
  recentlyStreamedShotIds,
  shotVideoRunKeyActive,
  onBindShotElement,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayShotVideo,
  onOpenShotPreview,
  onOpenCoverageInspector,
}: SequenceAnimaticBlockTimelineProps & { shot: SequenceAnimaticShotView }) {
  const shotKeyframeRunKey = `${model.request.id}:${block.id}:${shot.id}:keyframe`
  const shotVideoRunKey = `${model.request.id}:${block.id}:${shot.id}:shot_video`
  const shotVideoStarting = shotVideoRunKeyActive(shotVideoRunKey)
  const shotKeyframeStarting = busyRunKeys.has(shotKeyframeRunKey)
  const shotKeyframeBusy = shotKeyframeStarting || shot.keyframeRunning || shot.keyframeDependencyRunning
  const shotKeyframeBusyLabel = sequenceAnimaticShotKeyframeBusyLabel(shot, shotKeyframeStarting)
  const shotKeyframeReady = sequenceAnimaticShotKeyframeReady(shot)
  const shotCanGenerateEarlyKeyframe = sequenceAnimaticShotCanGenerateEarlyKeyframe(shot)
  const shotCoverageAnchor = coverageAnchorForShot(model, shot)
  const shotElementKey = `${model.request.id}:${block.id}:${shot.id}`
  const shotClassName = [
    'world-wiki-sequence-animatic-shot',
    shot.isProvisional ? 'is-streaming' : '',
    recentlyStreamedShotIds[shotElementKey] ? 'is-streaming-new' : '',
  ].filter(Boolean).join(' ')

  return (
    <article
      ref={(node) => onBindShotElement(shotElementKey, node)}
      className={shotClassName}
    >
      <div className="world-wiki-sequence-animatic-shot-copy">
        <div className="world-wiki-sequence-animatic-shot-kicker">
          <span>Shot {String(shot.index).padStart(3, '0')}</span>
          {shot.isProvisional ? <span>Script draft</span> : null}
          <span>Chapter time {shot.timeLabel}</span>
          <span>Duration {shot.durationLabel}</span>
          {shot.keyframeStatusLabel !== 'Keyframe not generated' ? (
            <span>
              {shotKeyframeBusy ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
              {shotKeyframeBusy ? shotKeyframeBusyLabel : shot.keyframeStatusLabel}
            </span>
          ) : null}
          {shot.isRevised ? <span>Revised</span> : null}
          {shot.revisionRunning ? <span><span className="world-mini-spinner" aria-hidden="true" />Revising</span> : null}
        </div>
        <h4>{shot.title}</h4>
        <p>{shot.action || 'Shot action is still being parsed.'}</p>
        {shot.revisionError ? <small className="world-wiki-sequence-animatic-video-status is-error">{shot.revisionError}</small> : null}
        {shot.lighting || shot.spatialContinuityLabel || shotCoverageAnchor || (shot.performance && shot.performanceBeats.length === 0) ? (
          <dl className="world-wiki-sequence-shot-notes">
            {shot.lighting ? <div><dt>Lighting</dt><dd>{shot.lighting}</dd></div> : null}
            {shot.spatialContinuityLabel ? <div><dt>Set</dt><dd title={shot.spatialContinuityDetail || shot.spatialContinuityLabel}>{shot.spatialContinuityLabel}</dd></div> : null}
            {shotCoverageAnchor ? (
              <div>
                <dt>Coverage</dt>
                <dd>
                  <button
                    className="world-wiki-sequence-shot-note-button"
                    title={shot.coverageSetupDetail || shotCoverageAnchor.stagingBrief || shotCoverageAnchor.title}
                    onClick={() => onOpenCoverageInspector(block, shot, shotCoverageAnchor)}
                    type="button"
                  >
                    {shotCoverageAnchor.running ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
                    {shot.coverageSetupLabel || shotCoverageAnchor.title}
                  </button>
                </dd>
              </div>
            ) : null}
            {shot.performance && shot.performanceBeats.length === 0 ? <div><dt>Performance</dt><dd>{shot.performance}</dd></div> : null}
          </dl>
        ) : null}
        <SequenceAnimaticOverlayPerformanceList shot={shot} />
        <SequenceAnimaticDialogueList shot={shot} />
      </div>
      <SequenceAnimaticShotPanel
        model={model}
        block={block}
        shot={shot}
        variant="overlay"
        graphOpenKey={graphOpenKey}
        shotVideoStarting={shotVideoStarting}
        shotKeyframeBusy={shotKeyframeBusy}
        shotKeyframeBusyLabel={shotKeyframeBusyLabel}
        shotKeyframeReady={shotKeyframeReady}
        shotCanGenerateEarlyKeyframe={shotCanGenerateEarlyKeyframe}
        onRunShotKeyframe={onRunShotKeyframe}
        onRunShotVideo={onRunShotVideo}
        onOpenShotGraph={onOpenShotGraph}
        onPlayShotVideo={onPlayShotVideo}
        onOpenShotPreview={onOpenShotPreview}
      />
    </article>
  )
}

function SequenceAnimaticShotPanel({
  model,
  block,
  shot,
  variant,
  graphOpenKey,
  shotVideoStarting,
  shotKeyframeBusy,
  shotKeyframeBusyLabel,
  shotKeyframeReady,
  shotCanGenerateEarlyKeyframe,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayShotVideo,
  onOpenShotPreview,
  extraKeyframeDisabled = false,
}: {
  model: SequenceAnimaticViewModel
  block: SequenceAnimaticBlockView
  shot: SequenceAnimaticShotView
  variant: 'route' | 'overlay'
  graphOpenKey: string | null
  shotVideoStarting: boolean
  shotKeyframeBusy: boolean
  shotKeyframeBusyLabel: string
  shotKeyframeReady: boolean
  shotCanGenerateEarlyKeyframe: boolean
  onRunShotKeyframe: SequenceAnimaticBlockTimelineProps['onRunShotKeyframe']
  onRunShotVideo: SequenceAnimaticBlockTimelineProps['onRunShotVideo']
  onOpenShotGraph: SequenceAnimaticBlockTimelineProps['onOpenShotGraph']
  onPlayShotVideo: SequenceAnimaticBlockTimelineProps['onPlayShotVideo']
  onOpenShotPreview: SequenceAnimaticBlockTimelineProps['onOpenShotPreview']
  extraKeyframeDisabled?: boolean
}) {
  const shotGraphRunKey = `${model.request.id}:${block.id}:${shot.id}:shot_graph`
  const refreshShotGraphRunKey = `${model.request.id}:${block.id}:${shot.id}:refresh_shot_graph`
  const keyframeDisabled = (shot.isProvisional && !shotCanGenerateEarlyKeyframe) || shotKeyframeBusy || extraKeyframeDisabled

  return (
    <div className="world-wiki-sequence-animatic-panel-stack">
      <div className={shot.panelUrl ? 'world-wiki-sequence-animatic-frame has-image' : 'world-wiki-sequence-animatic-frame is-empty'}>
        {shot.panelUrl ? (
          <>
            <img src={shot.panelUrl} alt="" />
            <button
              className="world-wiki-sequence-animatic-frame-expand"
              onClick={() => onOpenShotPreview(shot)}
              type="button"
              aria-label={`Open ${shot.title} preview full size`}
            >
              <EntityIcon id="expand" />
            </button>
          </>
        ) : (
          <span>
            {shot.panelRunning ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
            {shot.panelStatusLabel}
            {shot.panelError ? <small>{shot.panelError}</small> : null}
          </span>
        )}
      </div>
      <SequenceAnimaticReferenceStrip shot={shot} limit={variant === 'route' ? 8 : undefined} />
      <div className="world-wiki-sequence-animatic-shot-actions">
        <button
          className="ghost-button compact"
          disabled={keyframeDisabled}
          onClick={() => onRunShotKeyframe(model, block, shot, shotKeyframeReady ? 'regenerate' : 'generate')}
          type="button"
          title={shot.keyframeDependencyStatusLabel}
        >
          {shotKeyframeBusy
            ? <><span className="world-mini-spinner" aria-hidden="true" />{shotKeyframeBusyLabel}</>
            : shotKeyframeReady
              ? 'Regenerate keyframe'
              : shot.isProvisional
                ? 'Generate early keyframe'
                : 'Generate keyframe'}
        </button>
        {shot.shotVideoReady && shot.shotVideoUrl ? (
          <button
            className={variant === 'overlay' ? 'ghost-button compact world-wiki-sequence-animatic-video-action world-wiki-sequence-animatic-shot-video-primary' : 'ghost-button compact'}
            onClick={() => onPlayShotVideo({ title: `${shot.title} - shot take`, url: shot.shotVideoUrl ?? '', durationLabel: shot.durationLabel, statusLabel: shot.shotVideoProgressLabel })}
            type="button"
          >
            {variant === 'overlay' ? <span className="world-wiki-sequence-animatic-play-glyph" aria-hidden="true" /> : null}
            Play shot take
          </button>
        ) : (
          <button
            className={variant === 'route' ? 'ghost-button compact world-wiki-sequence-animatic-video-action world-wiki-sequence-animatic-shot-video-primary' : 'ghost-button compact world-wiki-sequence-animatic-video-action'}
            disabled={shot.isProvisional || !shot.panelUrl || shot.shotVideoRunning || shotVideoStarting}
            onClick={() => onRunShotVideo(model, block, shot)}
            type="button"
          >
            {shot.shotVideoRunning || shotVideoStarting
              ? <><span className="world-mini-spinner" aria-hidden="true" />{shot.shotVideoRunning ? shot.shotVideoProgressLabel : 'Starting shot video'}</>
              : 'Generate shot video'}
          </button>
        )}
        {variant === 'overlay' && shot.shotVideoReady && shot.shotVideoUrl ? (
          <button
            className="ghost-button compact"
            disabled={shot.isProvisional || shot.shotVideoRunning || shotVideoStarting}
            onClick={() => onRunShotVideo(model, block, shot)}
            type="button"
          >
            Regenerate
          </button>
        ) : null}
        <button
          className="ghost-button compact"
          disabled={(shot.isProvisional && !shotCanGenerateEarlyKeyframe) || graphOpenKey === shotGraphRunKey}
          onClick={() => onOpenShotGraph(model, block, shot)}
          type="button"
        >
          {graphOpenKey === shotGraphRunKey
            ? <><span className="world-mini-spinner" aria-hidden="true" />Opening graph</>
            : variant === 'route' ? 'Shot graph' : 'Open shot graph'}
        </button>
        <button
          className="ghost-button compact"
          disabled={(shot.isProvisional && !shotCanGenerateEarlyKeyframe) || Boolean(graphOpenKey)}
          onClick={() => onOpenShotGraph(model, block, shot, true)}
          type="button"
        >
          {graphOpenKey === refreshShotGraphRunKey
            ? <><span className="world-mini-spinner" aria-hidden="true" />Refreshing graph</>
            : 'Refresh graph'}
        </button>
        <small className={shot.shotVideoError ? 'world-wiki-sequence-animatic-video-status is-error' : 'world-wiki-sequence-animatic-video-status'}>
          {shotKeyframeBusy ? <span className="world-mini-spinner" aria-hidden="true" /> : variant === 'overlay' && shot.shotVideoRunning ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
          {shotKeyframeBusy ? shotKeyframeBusyLabel : shot.shotVideoProgressLabel}
        </small>
      </div>
    </div>
  )
}

function SequenceAnimaticDialogueList({ shot }: { shot: SequenceAnimaticShotView }) {
  if (shot.dialogue.length === 0) return null

  return (
    <div className="world-wiki-sequence-animatic-dialogue-list">
      {shot.dialogue.map((line) => (
        <div key={line.id} className="world-wiki-sequence-animatic-dialogue-line">
          <span className="world-wiki-sequence-animatic-dialogue-speaker" title={line.speakerName}>
            {line.speakerIconUrl ? <img src={line.speakerIconUrl} alt="" /> : <EntityIcon id={line.speakerIconId} />}
            <strong>{line.speakerName}</strong>
            {line.speakerRefId ? <em>{line.speakerRefId}</em> : null}
          </span>
          <p>
            {line.text}
            {[line.emotion, line.delivery, line.subtext].filter(Boolean).length > 0 ? (
              <small>{[line.emotion, line.delivery, line.subtext].filter(Boolean).join(' / ')}</small>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  )
}

function SequenceAnimaticRoutePerformanceRows({
  block,
  shot,
  onOpenShotInspector,
}: {
  block: SequenceAnimaticBlockView
  shot: SequenceAnimaticShotView
  onOpenShotInspector: SequenceAnimaticBlockTimelineProps['onOpenShotInspector']
}) {
  if (shot.performanceBeats.length > 0) {
    return (
      <>
        {shot.performanceBeats.map((beat) => {
          const performanceLine = sequenceAnimaticPerformanceBeatLine(beat)
          return (
            <button
              key={beat.id}
              className="world-wiki-sequence-shot-detail-row is-performance"
              title={`${beat.characterName}: ${performanceLine}`}
              onClick={() => onOpenShotInspector({ kind: 'performance', blockTitle: block.title, shotTitle: `${shot.title} / ${beat.characterName}`, content: performanceLine || 'No performance notes recorded.' })}
              type="button"
            >
              {beat.characterIconUrl ? <img src={beat.characterIconUrl} alt="" /> : <EntityIcon id={beat.characterIconId} />}
              <strong>{beat.characterName}</strong>
              <span>{performanceLine || 'No performance notes recorded.'}</span>
            </button>
          )
        })}
      </>
    )
  }

  return shot.performance ? (
    <button className="world-wiki-sequence-shot-detail-row is-performance" title={shot.performance} onClick={() => onOpenShotInspector({ kind: 'performance', blockTitle: block.title, shotTitle: shot.title, content: shot.performance })} type="button">
      <EntityIcon id="character" />
      <strong>Performance</strong>
      <span>{shot.performance}</span>
    </button>
  ) : null
}

function SequenceAnimaticOverlayPerformanceList({ shot }: { shot: SequenceAnimaticShotView }) {
  if (shot.performanceBeats.length === 0) return null

  return (
    <div className="world-wiki-sequence-animatic-performance-list" aria-label="Shot performance beats">
      {shot.performanceBeats.map((beat) => (
        <div key={beat.id} className="world-wiki-sequence-animatic-performance-card">
          <div className="world-wiki-sequence-animatic-performance-head">
            <span title={beat.characterName}>
              {beat.characterIconUrl
                ? <img src={beat.characterIconUrl} alt="" />
                : <EntityIcon id={beat.characterIconId} />}
              <strong>{beat.characterName}</strong>
            </span>
            <em>{beat.toneLabel}</em>
          </div>
          <div className="world-wiki-sequence-animatic-performance-values" aria-label={`Performance values for ${beat.characterName}`}>
            <span>V {beat.valenceLabel}</span>
            <span>A {beat.arousalLabel}</span>
            <span>C {beat.confidenceLabel}</span>
            <span>D {beat.dominanceLabel}</span>
          </div>
          {[beat.facialExpression, beat.bodyLanguage, beat.gaze, beat.gesture, beat.voiceEnergy].filter(Boolean).length > 0 ? (
            <p>{[beat.facialExpression, beat.bodyLanguage, beat.gaze, beat.gesture, beat.voiceEnergy].filter(Boolean).join(' / ')}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function SequenceAnimaticReferenceStrip({
  shot,
  limit,
}: {
  shot: SequenceAnimaticShotView
  limit?: number
}) {
  if (shot.references.length === 0) return null
  const references = typeof limit === 'number' ? shot.references.slice(0, limit) : shot.references

  return (
    <div className="world-wiki-sequence-animatic-ref-strip" aria-label="Shot references">
      {references.map((reference) => (
        <span
          key={reference.entityKey}
          className={reference.isContinuityAnchor ? 'world-wiki-sequence-animatic-ref-chip is-continuity' : 'world-wiki-sequence-animatic-ref-chip'}
          title={reference.isContinuityAnchor
            ? `Continuity ${reference.continuityAnchorType === 'character' ? 'temporary character' : reference.continuityAnchorType === 'location_spot' ? 'location spot' : 'prop'}: ${reference.name}`
            : `${reference.role}: ${reference.name}`}
        >
          {reference.iconUrl ? <img src={reference.iconUrl} alt="" /> : <EntityIcon id={reference.iconId} />}
          <em>{reference.name}</em>
          {reference.isContinuityAnchor && limit === undefined ? <small>Continuity</small> : null}
        </span>
      ))}
    </div>
  )
}

function SequenceAnimaticPendingShotCard({
  pendingShot,
  variant,
}: {
  pendingShot: SequenceAnimaticPendingShotView
  variant: 'route' | 'overlay'
}) {
  if (variant === 'route') {
    return (
      <article className="world-wiki-sequence-animatic-timeline-shot is-pending-shot" aria-live="polite">
        <div className="world-wiki-sequence-animatic-time-rail">
          <strong>{String(pendingShot.index).padStart(3, '0')}</strong>
          <span>Planning</span>
          <small>Pending</small>
        </div>
        <div className="world-wiki-sequence-animatic-shot-body">
          <div className="world-wiki-sequence-animatic-shot-text">
            <div className="world-wiki-sequence-animatic-shot-title-row">
              <h4>{pendingShot.shotId.replace(/_/g, ' ')}</h4>
              <span>Next</span>
            </div>
            <p>Building action, dialogue, references, and scene binding for the next streamed shot.</p>
          </div>
          <div className="world-wiki-sequence-animatic-panel-stack">
            <div className="world-wiki-sequence-animatic-frame is-empty">
              <span>
                <span className="world-mini-spinner" aria-hidden="true" />
                Planning next shot
              </span>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="world-wiki-sequence-animatic-shot is-pending-shot" aria-live="polite">
      <div className="world-wiki-sequence-animatic-shot-copy">
        <div className="world-wiki-sequence-animatic-shot-kicker">
          <span>Shot {String(pendingShot.index).padStart(3, '0')}</span>
          <span>Planning</span>
        </div>
        <h4>{pendingShot.shotId.replace(/_/g, ' ')}</h4>
        <p>Building action, dialogue, references, and scene binding for the next shot.</p>
      </div>
      <div className="world-wiki-sequence-animatic-panel-stack">
        <div className="world-wiki-sequence-animatic-frame is-empty">
          <span>
            <span className="world-mini-spinner" aria-hidden="true" />
            Planning next shot
            <small>Waiting for the next streamed shot record.</small>
          </span>
        </div>
      </div>
    </article>
  )
}

function activeShotPromptFor(
  shotPrompt: SequenceAnimaticShotPromptState | null,
  masterRequestId: string,
  blockId: string,
  shotId: string,
) {
  return shotPrompt?.masterRequestId === masterRequestId
    && shotPrompt.storyboardBlockId === blockId
    && shotPrompt.shotId === shotId
    ? shotPrompt
    : null
}

function shotPromptStatusText(activeShotPrompt: SequenceAnimaticShotPromptState | null, panelUrl: string | null) {
  if (activeShotPrompt) {
    return activeShotPrompt.status === 'rewriting'
      ? 'Rewriting shot'
      : activeShotPrompt.status === 'generating'
        ? 'Generating keyframe'
        : activeShotPrompt.status === 'saving'
          ? 'Saving revision'
          : activeShotPrompt.status === 'failed'
            ? activeShotPrompt.error || 'Revision failed'
            : ''
  }

  return !panelUrl ? 'Generate the storyboard panel before revising this shot.' : ''
}

function coverageAnchorForShot(model: SequenceAnimaticViewModel, shot: SequenceAnimaticShotView) {
  return shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
}

function sequenceAnimaticShotKeyframeReady(shot: SequenceAnimaticShotView) {
  return shot.keyframeStatusLabel === 'Keyframe ready'
    || shot.keyframeStatusLabel === 'Revised keyframe ready'
    || shot.keyframeStatusLabel === 'Storyboard keyframe ready'
}

export function sequenceAnimaticShotPreviewInput(shot: SequenceAnimaticShotView) {
  return {
    title: `${shot.title} preview`,
    eyebrow: sequenceAnimaticShotPreviewEyebrow(shot),
    body: shot.action || shot.camera || shot.lighting || 'Preview image for this animatic shot.',
    icon: 'asset' as const,
    imageUrl: shot.panelUrl ?? '',
    variant: 'image' as const,
  }
}
