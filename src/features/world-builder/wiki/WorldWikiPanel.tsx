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
  liveGenerationState?: {
    active: boolean
    message: string
    phase: string
    sectionStates: Partial<Record<WorldWikiSection['kind'], 'pending' | 'active' | 'done'>>
  }
  wikiDocumentRef: RefObject<HTMLDivElement | null>
  wikiModel: WorldWikiModel
  wikiOverviewActionGaps: Array<{ gap: WorldWikiGap; label: string }>
  wikiBrandAtlasImageUrl: string | null
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

const ENTITY_FIRST_WIKI_SECTION_KINDS: ReadonlySet<WorldWikiSection['kind']> = new Set([
  'cast',
  'places',
  'factions',
  'items',
  'lore',
  'events',
  'game_world',
  'game_inventory',
  'game_economy',
  'game_travel',
  'game_quests',
  'game_narrative',
  'game_dialogue',
  'game_progression',
  'game_rules',
  'app_product',
  'app_people',
  'app_features',
  'app_flows',
  'app_screens',
  'app_components',
  'app_data',
  'app_backend',
  'app_capabilities',
  'app_design',
  'app_towers',
  'app_code_files',
])

function countWikiSectionItems(section: WorldWikiSection) {
  return section.entityKeys.length + section.threadKeys.length + section.resultKeys.length
}

function hasWikiStyleContent(input: {
  model: WorldWikiModel
  brandAtlasImageUrl: string | null
}) {
  return Boolean(
    input.model.overview.artStyleDescription.trim()
    || input.model.overview.brandAtlasPrompt.trim()
    || input.brandAtlasImageUrl
    || input.model.overview.visualMotifs.length > 0
    || Object.keys(input.model.overview.colorScheme).length > 0,
  )
}

function isWikiSectionPopulated(input: {
  section: WorldWikiSection
  model: WorldWikiModel
  brandAtlasImageUrl: string | null
}) {
  if (input.section.kind === 'overview') return false
  if (input.section.kind === 'style') {
    return hasWikiStyleContent({
      model: input.model,
      brandAtlasImageUrl: input.brandAtlasImageUrl,
    })
  }
  return countWikiSectionItems(input.section) > 0
}

function orderWikiSectionsForLiveDocument(sections: WorldWikiSection[]) {
  const sectionRank = (section: WorldWikiSection) => {
    if (ENTITY_FIRST_WIKI_SECTION_KINDS.has(section.kind)) return 0
    if (section.kind === 'timeline') return 1
    if (section.kind === 'threads') return 2
    if (section.kind === 'style') return 3
    if (section.kind === 'outputs') return 4
    return 5
  }
  return sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) => {
      const rankDelta = sectionRank(left.section) - sectionRank(right.section)
      return rankDelta || left.index - right.index
    })
    .map((entry) => entry.section)
}

export function WorldWikiPanel({
  activeWikiSectionKind,
  iconBatchError,
  iconBatchJob,
  iconBatchRunning,
  iconGenerationCandidates,
  isPromptSubmitting,
  liveGenerationState,
  wikiDocumentRef,
  wikiModel,
  wikiOverviewActionGaps,
  wikiBrandAtlasImageUrl,
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
  const liveGenerationActive = Boolean(liveGenerationState?.active)
  const populatedWikiSections = orderWikiSectionsForLiveDocument(
    wikiModel.sections.filter((section) => isWikiSectionPopulated({
      section,
      model: wikiModel,
      brandAtlasImageUrl: wikiBrandAtlasImageUrl,
    })),
  )
  return (
    <div className={`world-alt-surface world-wiki-surface${liveGenerationActive ? ' is-live-generating' : ''}`}>
      <aside className="world-wiki-index" aria-label="Wiki sections">
        <WorldWikiSubViewToggle wikiSubView={wikiSubView} onSelectWikiSubView={onSelectWikiSubView} />
        {wikiSubView === 'outputs' ? renderOutputLibraryRail() : (
          <>
        <button
          className={`world-wiki-create-entry${liveGenerationActive ? ' is-generating' : ''}`}
          disabled={liveGenerationActive}
          onClick={() => onSelectWikiSubView('feed')}
          type="button"
        >
          <span className="world-wiki-create-icon">
            <EntityIcon id={liveGenerationActive || isPromptSubmitting ? 'activity' : 'plus'} />
          </span>
          <span>
            <strong>{liveGenerationActive ? 'Generating' : isPromptSubmitting ? 'View progress' : 'Create'}</strong>
            <small>{liveGenerationActive ? liveGenerationState?.message || 'Your world is forming' : isPromptSubmitting ? 'Follow the active world update' : 'Prompt canon changes'}</small>
          </span>
        </button>
        <div className="world-wiki-index-list">
          {populatedWikiSections.map((section) => {
            const count = section.kind === 'style' ? 1 : countWikiSectionItems(section)
            const generationState = liveGenerationState?.sectionStates[section.kind] ?? null
            return (
              <button
                key={section.kind}
                className={[
                  'world-wiki-index-row',
                  section.gap ? 'is-gap' : '',
                  activeWikiSectionKind === section.kind ? 'is-active' : '',
                  generationState ? `is-generation-${generationState}` : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onScrollToWikiSection(section.kind)}
                type="button"
              >
                <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection(section.kind)} /></span>
                <span className="world-wiki-index-copy">
                  <strong>{section.title}</strong>
                  <small>
                    {generationState === 'active'
                      ? 'Generating now'
                      : generationState === 'pending'
                        ? 'Waiting'
                        : section.gap ? 'Needs content' : count > 0 ? `${count} source${count === 1 ? '' : 's'}` : 'Ready'}
                  </small>
                </span>
                <em>{generationState === 'active' ? <span className="world-wiki-nav-spinner" aria-hidden="true" /> : count}</em>
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
        {liveGenerationActive ? (
          <div className="world-wiki-forming-banner">
            <div className="world-wiki-forming-brain-stage" aria-hidden="true">
              <img className="world-wiki-forming-brain" src="/landing/hero-world-core-v4.png" alt="" />
            </div>
            <div>
              <span className="eyebrow">World assembly</span>
              <strong>Your world is forming</strong>
              <small>{liveGenerationState?.message || 'Streaming canon, references, and the wiki hero into place.'}</small>
            </div>
          </div>
        ) : null}
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
          {populatedWikiSections.map(renderWikiSection)}
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
