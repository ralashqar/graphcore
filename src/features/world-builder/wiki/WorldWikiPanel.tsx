import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react'

import type { WorldEntity, WorldRelationship } from '../../../domain/worldGraph'
import type { WorldEntityIconGenerationJob } from '../../../domain/worldEntityIconGeneration'
import type { WorldWikiGap, WorldWikiModel, WorldWikiSection } from '../../../domain/worldWiki'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import type { WorldWikiSubView } from '../../../shared/workspace'
import { iconForWikiSection } from './wikiSectionLabels'

type WorldWikiSubViewToggleProps = {
  wikiSubView: WorldWikiSubView
  onSelectWikiSubView: (subView: WorldWikiSubView) => void
}

export function WorldWikiSubViewToggle({
  wikiSubView,
  onSelectWikiSubView,
}: WorldWikiSubViewToggleProps) {
  return (
    <div className="world-wiki-subview-toggle" role="tablist" aria-label="Wiki view mode">
      <button
        aria-selected={wikiSubView === 'wiki'}
        className={wikiSubView === 'wiki' ? 'is-active' : ''}
        onClick={() => onSelectWikiSubView('wiki')}
        role="tab"
        type="button"
      >
        <EntityIcon id="content" />
        <span>Wiki</span>
      </button>
      <button
        aria-selected={wikiSubView === 'feed'}
        className={wikiSubView === 'feed' ? 'is-active' : ''}
        onClick={() => onSelectWikiSubView('feed')}
        role="tab"
        type="button"
      >
        <EntityIcon id="activity" />
        <span>Create</span>
      </button>
      <button
        aria-selected={wikiSubView === 'outputs'}
        className={wikiSubView === 'outputs' ? 'is-active' : ''}
        onClick={() => onSelectWikiSubView('outputs')}
        role="tab"
        type="button"
      >
        <EntityIcon id="cinematic" />
        <span>Outputs</span>
      </button>
    </div>
  )
}

type WorldWikiPanelProps = {
  activeWikiSectionKind: WorldWikiSection['kind']
  iconBatchError: string | null
  iconBatchJob: WorldEntityIconGenerationJob | null
  iconBatchRunning: boolean
  iconGenerationCandidates: readonly unknown[]
  isPromptSubmitting: boolean
  wikiDocumentRef: RefObject<HTMLDivElement | null>
  wikiModel: WorldWikiModel
  wikiOverviewActionGaps: Array<{ gap: WorldWikiGap; label: string }>
  wikiOverviewGraphicImageStyle?: CSSProperties
  wikiOverviewGraphicMediaStyle?: CSSProperties
  wikiOverviewGraphicPending: boolean
  wikiOverviewGraphicUrl: string | null
  wikiOverviewIcon: EntityIconId
  wikiOverviewLabel: string
  wikiOverviewSectionStyle?: CSSProperties
  wikiOverviewTags: string[]
  wikiSearchActive: boolean
  wikiSearchMatchCount: number | null
  wikiSearchQuery: string
  wikiSubView: WorldWikiSubView
  worldEntities: readonly WorldEntity[]
  worldRelationships: readonly WorldRelationship[]
  describeIconBatchProgress: (job: WorldEntityIconGenerationJob | null) => string
  onGenerateMissingEntityIcons: () => void
  onGrowWorkbenchResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
  onResetGrowWorkbenchWidth: () => void
  onRunWikiGap: (gap: WorldWikiGap) => void
  onScrollToWikiSection: (sectionKind: WorldWikiSection['kind']) => void
  onSelectWikiSubView: (subView: WorldWikiSubView) => void
  onSetWikiSearchQuery: (query: string) => void
  renderAppPreviewPipelinePanel: () => ReactNode
  renderInteractivePrototypeModal: () => ReactNode
  renderNarrativeRpgPlayablePanel: () => ReactNode
  renderOutputLibraryPanel: () => ReactNode
  renderOutputLibraryRail: () => ReactNode
  renderWikiSection: (section: WorldWikiSection) => ReactNode
}

export function WorldWikiPanel({
  activeWikiSectionKind,
  iconBatchError,
  iconBatchJob,
  iconBatchRunning,
  iconGenerationCandidates,
  isPromptSubmitting,
  wikiDocumentRef,
  wikiModel,
  wikiOverviewActionGaps,
  wikiOverviewGraphicImageStyle,
  wikiOverviewGraphicMediaStyle,
  wikiOverviewGraphicPending,
  wikiOverviewGraphicUrl,
  wikiOverviewIcon,
  wikiOverviewLabel,
  wikiOverviewSectionStyle,
  wikiOverviewTags,
  wikiSearchActive,
  wikiSearchMatchCount,
  wikiSearchQuery,
  wikiSubView,
  worldEntities,
  worldRelationships,
  describeIconBatchProgress,
  onGenerateMissingEntityIcons,
  onGrowWorkbenchResizeStart,
  onResetGrowWorkbenchWidth,
  onRunWikiGap,
  onScrollToWikiSection,
  onSelectWikiSubView,
  onSetWikiSearchQuery,
  renderAppPreviewPipelinePanel,
  renderInteractivePrototypeModal,
  renderNarrativeRpgPlayablePanel,
  renderOutputLibraryPanel,
  renderOutputLibraryRail,
  renderWikiSection,
}: WorldWikiPanelProps) {
  return (
    <div className="world-alt-surface world-wiki-surface">
      <aside className="world-wiki-index" aria-label="Wiki sections">
        <WorldWikiSubViewToggle wikiSubView={wikiSubView} onSelectWikiSubView={onSelectWikiSubView} />
        {wikiSubView === 'outputs' ? renderOutputLibraryRail() : (
          <>
        <button className="world-wiki-create-entry" onClick={() => onSelectWikiSubView('feed')} type="button">
          <span className="world-wiki-create-icon">
            <EntityIcon id={isPromptSubmitting ? 'activity' : 'plus'} />
          </span>
          <span>
            <strong>{isPromptSubmitting ? 'View progress' : 'Create'}</strong>
            <small>{isPromptSubmitting ? 'Follow the active world update' : 'Prompt canon changes'}</small>
          </span>
        </button>
        <div className="world-wiki-index-list">
          {wikiModel.sections.map((section) => {
            const count = section.entityKeys.length + section.threadKeys.length + section.resultKeys.length
            return (
              <button
                key={section.kind}
                className={[
                  'world-wiki-index-row',
                  section.gap ? 'is-gap' : '',
                  activeWikiSectionKind === section.kind ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onScrollToWikiSection(section.kind)}
                type="button"
              >
                <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection(section.kind)} /></span>
                <span className="world-wiki-index-copy">
                  <strong>{section.title}</strong>
                  <small>{section.gap ? 'Needs content' : count > 0 ? `${count} source${count === 1 ? '' : 's'}` : 'Ready'}</small>
                </span>
                <em>{count}</em>
              </button>
            )
          })}
        </div>
        {wikiModel.gaps.length > 0 || iconGenerationCandidates.length > 0 || iconBatchJob || iconBatchError ? (
          <div className="world-wiki-gap-list">
            <span className="eyebrow">Gaps</span>
            {iconGenerationCandidates.length > 0 || iconBatchRunning ? (
              <button
                className={`world-wiki-gap-button world-wiki-icon-batch-button${iconBatchRunning ? ' is-running' : ''}`}
                disabled={iconBatchRunning || iconGenerationCandidates.length === 0}
                onClick={onGenerateMissingEntityIcons}
                type="button"
              >
                <EntityIcon id="asset" />
                <span>
                  {iconBatchRunning
                    ? describeIconBatchProgress(iconBatchJob)
                    : `Generate missing icons (${iconGenerationCandidates.length})`}
                </span>
              </button>
            ) : null}
            {iconBatchJob && !iconBatchRunning ? (
              <div className={`world-wiki-icon-batch-status is-${iconBatchJob.status}`}>
                {describeIconBatchProgress(iconBatchJob)}
              </div>
            ) : null}
            {iconBatchError ? <div className="world-wiki-icon-batch-status is-failed">{iconBatchError}</div> : null}
            {wikiModel.gaps.slice(0, 5).map((gap) => (
              <button key={gap.key} className="world-wiki-gap-button" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
                <EntityIcon id="plus" />
                <span>{gap.label}</span>
              </button>
            ))}
          </div>
        ) : null}
          </>
        )}
      </aside>
      <div
        aria-label="Resize wiki navigation"
        className="world-grow-resizer world-wiki-resizer"
        onDoubleClick={onResetGrowWorkbenchWidth}
        onMouseDown={onGrowWorkbenchResizeStart}
        role="separator"
      />
      <div className="world-wiki-document" ref={wikiDocumentRef}>
        {wikiSubView === 'outputs' ? renderOutputLibraryPanel() : (
          <>
        <section id="world-wiki-section-overview" className="world-wiki-overview" style={wikiOverviewSectionStyle}>
          <div className="world-wiki-overview-copy">
            <span className="eyebrow">{wikiOverviewLabel}</span>
            <h2>{wikiModel.title}</h2>
            <div className="world-wiki-logline">
              {wikiModel.overview.logline || 'No logline yet.'}
              {!wikiModel.overview.logline ? (
                <button
                  className="world-context-strip-action"
                  disabled={isPromptSubmitting}
                  onClick={() => {
                    const gap = wikiModel.gaps.find((entry) => entry.kind === 'world_logline') ?? null
                    if (gap) onRunWikiGap(gap)
                  }}
                  type="button"
                >
                  Generate
                </button>
              ) : null}
            </div>
            {wikiOverviewActionGaps.length > 0 ? (
              <div className="world-wiki-overview-actions">
                {wikiOverviewActionGaps.map(({ gap, label }) => (
                  <button key={gap.kind} className="world-context-strip-action" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="world-wiki-overview-bottom-row">
            <div className="world-wiki-overview-stats" aria-label="World wiki counts">
              <span><strong>{worldEntities.length}</strong><small>Entities</small></span>
              <span><strong>{worldRelationships.length}</strong><small>Links</small></span>
              <span><strong>{wikiModel.threadPages.length}</strong><small>Threads</small></span>
              <span><strong>{wikiModel.sequence.units.length || wikiModel.timeline.events.length}</strong><small>Beats</small></span>
            </div>
            <div className="world-wiki-overview-tools">
              <label className={wikiSearchQuery.trim() ? 'world-wiki-overview-search has-value' : 'world-wiki-overview-search'}>
                <span>Search wiki</span>
                <input
                  aria-label="Search wiki"
                  onChange={(event) => onSetWikiSearchQuery(event.target.value)}
                  placeholder="Find canon..."
                  type="search"
                  value={wikiSearchQuery}
                />
                {wikiSearchQuery.trim() ? (
                  <button aria-label="Clear wiki search" onClick={() => onSetWikiSearchQuery('')} type="button">
                    <EntityIcon id="close" />
                  </button>
                ) : null}
              </label>
              {wikiOverviewTags.length > 0 ? (
                <div className="world-wiki-overview-tags" aria-label="World tone tags">
                  {wikiOverviewTags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                </div>
              ) : null}
            </div>
          </div>
          <div
            className={`world-wiki-overview-media ${wikiOverviewGraphicUrl ? 'has-image' : 'has-icon'}${wikiOverviewGraphicPending ? ' is-pending' : ''}`}
            style={wikiOverviewGraphicMediaStyle}
          >
            {wikiOverviewGraphicUrl ? (
              <img src={wikiOverviewGraphicUrl} alt="" style={wikiOverviewGraphicImageStyle} />
            ) : (
              <div className="world-wiki-overview-placeholder">
                <EntityIcon id={wikiOverviewIcon} />
                {wikiOverviewGraphicPending ? <span>Concept image generating</span> : null}
              </div>
            )}
          </div>
        </section>
        {renderNarrativeRpgPlayablePanel()}
        {renderAppPreviewPipelinePanel()}
        {renderInteractivePrototypeModal()}
        {wikiSearchActive && wikiSearchMatchCount === 0 ? (
          <div className="world-wiki-search-empty">
            <span className="eyebrow">Search</span>
            <strong>No wiki matches</strong>
            <small>Try a character, place, faction, story arc, output, or canon keyword.</small>
          </div>
        ) : null}
        <div className="world-wiki-section-grid">
          {wikiModel.sections.filter((section) => section.kind !== 'overview').map(renderWikiSection)}
        </div>
        <div className="world-wiki-diagnostics">
          {wikiModel.diagnostics.map((diagnostic) => <span key={diagnostic}>{diagnostic}</span>)}
        </div>
          </>
        )}
      </div>
    </div>
  )
}
