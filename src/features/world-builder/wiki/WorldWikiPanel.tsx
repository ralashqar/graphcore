import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'

import type { WorldEntity, WorldRelationship } from '../../../domain/worldGraph'
import type { WorldPromptTurn } from '../../../domain/worldPrompt'
import type { WorldWikiGap, WorldWikiModel, WorldWikiSection } from '../../../domain/worldWiki'
import { iconForWorldEntity } from '../../../domain/worldGraphHelpers'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import type { WorldWikiSubView } from '../../../shared/workspace'
import { WorldInlinePromptComposer } from '../prompt/WorldInlinePromptComposer'
import type { WorldWikiDetailModalInput } from './WorldWikiSections'
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
        <span>Feed</span>
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
  activeWikiEntityPage: { sectionKind: WorldWikiSection['kind']; entityKey: string } | null
  activeWikiSectionKind: WorldWikiSection['kind']
  activePromptTurn: WorldPromptTurn | null
  isPromptSubmitting: boolean
  isPromptCancelling: boolean
  liveGenerationState?: {
    active: boolean
    message: string
    phase: string
    title: string
    sectionStates: Partial<Record<WorldWikiSection['kind'], 'pending' | 'active' | 'done'>>
  }
  wikiDocumentRef: RefObject<HTMLDivElement | null>
  wikiModel: WorldWikiModel
  wikiOverviewDisplayTitle: string
  wikiOverviewDisplayLogline: string
  wikiOverviewShowMetadata: boolean
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
  wikiPromptError: string | null
  wikiPromptModelLabel: string
  wikiPromptText: string
  wikiVisualGenerationStatus?: {
    message: string
    detail?: string
  } | null
  wikiSearchActive: boolean
  wikiSearchMatchCount: number | null
  wikiSearchQuery: string
  wikiSubView: WorldWikiSubView
  worldEntities: readonly WorldEntity[]
  worldRelationships: readonly WorldRelationship[]
  wikiEntityNavImageUrlByEntityKey: ReadonlyMap<string, string | null>
  onGrowWorkbenchResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
  onCancelPromptTurn: (turnId: string) => Promise<void> | void
  onResetGrowWorkbenchWidth: () => void
  onRunWikiGap: (gap: WorldWikiGap) => void
  onScrollToWikiSection: (sectionKind: WorldWikiSection['kind']) => void
  onSelectWikiSubView: (subView: WorldWikiSubView) => void
  onCloseWikiEntityPage: () => void
  onOpenWikiEntityPage: (sectionKind: WorldWikiSection['kind'], entityKey: string) => void
  onOpenWikiDetailModal: (input: WorldWikiDetailModalInput) => void
  onSetWikiSearchQuery: (query: string) => void
  onSetWikiPromptText: (value: string) => void
  onSubmitWikiPrompt: () => Promise<void> | void
  renderAppPreviewPipelinePanel: () => ReactNode
  renderInteractivePrototypeModal: () => ReactNode
  renderNarrativeRpgPlayablePanel: () => ReactNode
  renderWikiEntityPage: () => ReactNode
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

const LIVE_OVERVIEW_TITLE_PHRASES = [
  'Your world is forming live...',
  'Thinking through the world...',
  'Finding the first characters...',
  'Building the wiki...',
  'Sketching the story spine...',
] as const

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener?.('change', updatePreference)
    return () => mediaQuery.removeEventListener?.('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

function useCyclingLiveOverviewTitle(active: boolean) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing')
  const [visibleLength, setVisibleLength] = useState(0)
  const currentPhrase = LIVE_OVERVIEW_TITLE_PHRASES[phraseIndex % LIVE_OVERVIEW_TITLE_PHRASES.length]

  useEffect(() => {
    if (!active) {
      setPhraseIndex(0)
      setPhase('typing')
      setVisibleLength(0)
      return
    }
    if (prefersReducedMotion) {
      setVisibleLength(currentPhrase.length)
      return
    }

    const delayMs = phase === 'typing' ? 46 : phase === 'holding' ? 1350 : 24
    const timer = window.setTimeout(() => {
      if (phase === 'typing') {
        if (visibleLength < currentPhrase.length) {
          setVisibleLength((length) => Math.min(length + 1, currentPhrase.length))
          return
        }
        setPhase('holding')
        return
      }

      if (phase === 'holding') {
        setPhase('deleting')
        return
      }

      if (visibleLength > 0) {
        setVisibleLength((length) => Math.max(length - 1, 0))
        return
      }

      setPhraseIndex((index) => (index + 1) % LIVE_OVERVIEW_TITLE_PHRASES.length)
      setPhase('typing')
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [active, currentPhrase, phase, prefersReducedMotion, visibleLength])

  return {
    displayText: active ? currentPhrase.slice(0, visibleLength) : '',
    fullText: currentPhrase,
  }
}

function useTypewriterText(text: string, active: boolean, speedMs: number, startDelayMs = 0, inactiveDisplayText = text) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [displayText, setDisplayText] = useState(active ? '' : inactiveDisplayText)
  const [complete, setComplete] = useState(!active)

  useEffect(() => {
    if (!active || !text || prefersReducedMotion) {
      setDisplayText(active || prefersReducedMotion ? text : inactiveDisplayText)
      setComplete(true)
      return
    }

    let cancelled = false
    let typedLength = 0
    let timer: number | null = null

    setDisplayText('')
    setComplete(false)

    const typeNextCharacter = () => {
      if (cancelled) return
      typedLength += 1
      setDisplayText(text.slice(0, typedLength))
      if (typedLength >= text.length) {
        setComplete(true)
        return
      }
      timer = window.setTimeout(typeNextCharacter, speedMs)
    }

    timer = window.setTimeout(typeNextCharacter, startDelayMs)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [active, inactiveDisplayText, prefersReducedMotion, speedMs, startDelayMs, text])

  return { complete, displayText }
}

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
  activeWikiEntityPage,
  activeWikiSectionKind,
  activePromptTurn,
  isPromptSubmitting,
  isPromptCancelling,
  liveGenerationState,
  wikiDocumentRef,
  wikiModel,
  wikiOverviewDisplayTitle,
  wikiOverviewDisplayLogline,
  wikiOverviewShowMetadata,
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
  wikiPromptError,
  wikiPromptModelLabel,
  wikiPromptText,
  wikiVisualGenerationStatus,
  wikiSearchActive,
  wikiSearchMatchCount,
  wikiSearchQuery,
  wikiSubView,
  worldEntities,
  worldRelationships,
  wikiEntityNavImageUrlByEntityKey,
  onCancelPromptTurn,
  onCloseWikiEntityPage,
  onGrowWorkbenchResizeStart,
  onOpenWikiEntityPage,
  onOpenWikiDetailModal,
  onResetGrowWorkbenchWidth,
  onRunWikiGap,
  onScrollToWikiSection,
  onSelectWikiSubView,
  onSetWikiSearchQuery,
  onSetWikiPromptText,
  onSubmitWikiPrompt,
  renderAppPreviewPipelinePanel,
  renderInteractivePrototypeModal,
  renderNarrativeRpgPlayablePanel,
  renderWikiEntityPage,
  renderOutputLibraryPanel,
  renderOutputLibraryRail,
  renderWikiSection,
}: WorldWikiPanelProps) {
  const liveGenerationActive = Boolean(liveGenerationState?.active)
  const liveOverviewReady = !liveGenerationActive || wikiOverviewShowMetadata
  const liveOverviewTitleReady = liveGenerationActive && wikiOverviewDisplayTitle.trim().length > 0
  const liveOverviewLoglineReady = liveGenerationActive && wikiOverviewDisplayLogline.trim().length > 0
  const cyclingOverviewTitle = useCyclingLiveOverviewTitle(liveGenerationActive && !liveOverviewTitleReady)
  const typedOverviewTitle = useTypewriterText(wikiOverviewDisplayTitle, liveOverviewTitleReady, 38)
  const titleTypingComplete = !liveGenerationActive || !liveOverviewTitleReady || (
    typedOverviewTitle.complete && typedOverviewTitle.displayText === wikiOverviewDisplayTitle
  )
  const shouldTypeOverviewLogline = liveOverviewLoglineReady && titleTypingComplete
  const typedOverviewLogline = useTypewriterText(
    wikiOverviewDisplayLogline,
    shouldTypeOverviewLogline,
    22,
    180,
    liveGenerationActive ? '' : wikiOverviewDisplayLogline,
  )
  const overviewTitleText = liveGenerationActive
    ? liveOverviewTitleReady
      ? typedOverviewTitle.displayText
      : cyclingOverviewTitle.displayText
    : wikiOverviewDisplayTitle
  const overviewTitleAriaLabel = liveGenerationActive
    ? liveOverviewTitleReady
      ? wikiOverviewDisplayTitle
      : cyclingOverviewTitle.fullText
    : wikiOverviewDisplayTitle
  const showOverviewTitleCaret = liveGenerationActive && (!liveOverviewTitleReady || !typedOverviewTitle.complete)
  const showOverviewLogline = liveGenerationActive
    ? shouldTypeOverviewLogline
    : wikiOverviewShowMetadata && (wikiOverviewDisplayLogline || !liveGenerationActive)
  const overviewLoglineText = liveGenerationActive
    ? typedOverviewLogline.displayText
    : wikiOverviewDisplayLogline || 'No logline yet.'
  const showOverviewLoglineCaret = liveGenerationActive && shouldTypeOverviewLogline && !typedOverviewLogline.complete
  const populatedWikiSections = orderWikiSectionsForLiveDocument(
    liveOverviewReady
      ? wikiModel.sections.filter((section) => isWikiSectionPopulated({
        section,
        model: wikiModel,
        brandAtlasImageUrl: wikiBrandAtlasImageUrl,
      }))
      : [],
  )
  const visibleWikiGaps = liveGenerationActive ? [] : wikiModel.gaps.slice(0, 5)
  const wikiEntityByKey = new Map(worldEntities.map((entity) => [entity.key, entity]))
  const activeEntitySection = activeWikiEntityPage
    ? wikiModel.sections.find((section) => section.kind === activeWikiEntityPage.sectionKind) ?? null
    : null
  const activeEntitySectionEntities = activeEntitySection
    ? activeEntitySection.entityKeys.map((key) => wikiEntityByKey.get(key) ?? null).filter((entity): entity is WorldEntity => Boolean(entity))
    : []
  return (
    <div className={`world-alt-surface world-wiki-surface${liveGenerationActive ? ' is-live-generating' : ''}${activeWikiEntityPage ? ' is-entity-page' : ''}`}>
      <aside className="world-wiki-index" aria-label="Wiki sections">
        <div className="world-wiki-index-scroll">
          <WorldWikiSubViewToggle wikiSubView={wikiSubView} onSelectWikiSubView={onSelectWikiSubView} />
        {wikiSubView === 'outputs' ? renderOutputLibraryRail() : (
          <>
        <div className="world-wiki-index-list">
          {activeWikiEntityPage && activeEntitySection ? (
            <>
              <button className="world-wiki-entity-nav-crumb" onClick={onCloseWikiEntityPage} type="button">
                <EntityIcon id="close" />
                <strong>Back to world view</strong>
              </button>
              <button
                className="world-wiki-index-row is-active is-entity-parent"
                onClick={onCloseWikiEntityPage}
                type="button"
              >
                <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection(activeEntitySection.kind)} /></span>
                <span className="world-wiki-index-copy">
                  <strong>{activeEntitySection.title}</strong>
                  <small>{activeEntitySectionEntities.length} entit{activeEntitySectionEntities.length === 1 ? 'y' : 'ies'}</small>
                </span>
                <em>{activeEntitySectionEntities.length}</em>
              </button>
              <div className="world-wiki-entity-subnav" aria-label={`${activeEntitySection.title} entities`}>
                {activeEntitySectionEntities.map((entity) => {
                  const imageUrl = wikiEntityNavImageUrlByEntityKey.get(entity.key) ?? null
                  const active = activeWikiEntityPage.entityKey === entity.key
                  return (
                    <button
                      key={entity.key}
                      className={active ? 'world-wiki-entity-subnav-row is-active' : 'world-wiki-entity-subnav-row'}
                      onClick={() => onOpenWikiEntityPage(activeEntitySection.kind, entity.key)}
                      type="button"
                    >
                      <span className="world-wiki-entity-subnav-thumb">
                        {imageUrl ? <img src={imageUrl} alt="" /> : <EntityIcon id={iconForWorldEntity(entity.nodeType)} />}
                      </span>
                      <span>
                        <strong>{entity.name}</strong>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : populatedWikiSections.map((section) => {
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
          {!activeWikiEntityPage && visibleWikiGaps.length > 0 ? (
            <button
              key="gaps"
              className={[
                'world-wiki-index-row',
                'is-gap',
                activeWikiSectionKind === 'gaps' ? 'is-active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onScrollToWikiSection('gaps')}
              type="button"
            >
              <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection('gaps')} /></span>
              <span className="world-wiki-index-copy">
                <strong>Suggested actions</strong>
                <small>{visibleWikiGaps.length} action{visibleWikiGaps.length === 1 ? '' : 's'}</small>
              </span>
              <em>{visibleWikiGaps.length}</em>
            </button>
          ) : null}
        </div>
          </>
        )}
        </div>
        {wikiSubView === 'wiki' ? (
          <WorldInlinePromptComposer
            activeTurnId={activePromptTurn?.id ?? null}
            busy={isPromptSubmitting}
            cancelBusy={isPromptCancelling}
            className="world-wiki-docked-composer"
            error={wikiPromptError}
            id="world-wiki-composer-input"
            label="Prompt this world"
            modelLabel={wikiPromptModelLabel}
            onCancelTurn={onCancelPromptTurn}
            onChange={onSetWikiPromptText}
            onSubmit={onSubmitWikiPrompt}
            placeholder="Add a character, deepen a relationship, change a place, or extend the story..."
            rows={3}
            value={wikiPromptText}
          />
        ) : null}
      </aside>
      <div
        aria-label="Resize wiki navigation"
        className="world-grow-resizer world-wiki-resizer"
        onDoubleClick={onResetGrowWorkbenchWidth}
        onMouseDown={onGrowWorkbenchResizeStart}
        role="separator"
      />
      <div className="world-wiki-document-shell">
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
              <strong>{liveGenerationState?.title || 'Your world is forming'}</strong>
              <small>{liveGenerationState?.message || 'Streaming canon, references, and the wiki hero into place.'}</small>
            </div>
            <span className="world-wiki-forming-spinner" aria-hidden="true" />
          </div>
        ) : null}
        {wikiVisualGenerationStatus ? (
          <div className="world-wiki-visual-generation-strip" role="status" aria-live="polite">
            <span className="world-wiki-visual-generation-spinner" aria-hidden="true" />
            <span className="world-wiki-visual-generation-copy">
              <strong>{wikiVisualGenerationStatus.message}</strong>
              {wikiVisualGenerationStatus.detail ? <small>{wikiVisualGenerationStatus.detail}</small> : null}
            </span>
          </div>
        ) : null}
        {activeWikiEntityPage ? (
          renderWikiEntityPage()
        ) : (
          <>
        <section id="world-wiki-section-overview" data-world-wiki-section-kind="overview" className="world-wiki-overview" style={wikiOverviewSectionStyle}>
          <div className="world-wiki-overview-copy">
            <span className="eyebrow">{wikiOverviewLabel}</span>
            <h2
              key={liveGenerationActive ? liveOverviewTitleReady ? `live-title:${wikiOverviewDisplayTitle}` : 'live-title-placeholder' : 'stable-title'}
              aria-label={overviewTitleAriaLabel || undefined}
              className={[
                liveGenerationActive ? 'world-wiki-typewriter-title' : '',
                liveGenerationActive && liveOverviewTitleReady ? 'is-live-generated' : '',
                liveGenerationActive && !liveOverviewTitleReady ? 'is-placeholder' : '',
              ].filter(Boolean).join(' ') || undefined}
            >
              {overviewTitleText}
              {showOverviewTitleCaret ? <span className="world-wiki-typewriter-caret" aria-hidden="true" /> : null}
            </h2>
            {showOverviewLogline ? (
              <div
                key={liveGenerationActive ? `live-logline:${wikiOverviewDisplayLogline}` : 'stable-logline'}
                className={[
                  'world-wiki-logline',
                  liveGenerationActive && wikiOverviewDisplayLogline ? 'is-live-generated' : '',
                  liveGenerationActive ? 'is-typing' : '',
                ].filter(Boolean).join(' ')}
              >
                {wikiOverviewDisplayLogline ? (
                  <button
                    className="world-wiki-logline-text"
                    onClick={() => onOpenWikiDetailModal({
                      title: wikiOverviewDisplayTitle || wikiModel.title || 'World logline',
                      eyebrow: 'Logline',
                      body: wikiOverviewDisplayLogline,
                      icon: 'content',
                      meta: wikiOverviewTags.slice(0, 4),
                    })}
                    type="button"
                  >
                    <span>{overviewLoglineText}</span>
                  </button>
                ) : (
                  <span>{overviewLoglineText}</span>
                )}
                {showOverviewLoglineCaret ? <span className="world-wiki-typewriter-caret" aria-hidden="true" /> : null}
                {!liveGenerationActive && !wikiOverviewDisplayLogline ? (
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
            ) : null}
            {wikiOverviewShowMetadata && !liveGenerationActive && wikiOverviewActionGaps.length > 0 ? (
              <div className="world-wiki-overview-actions">
                {wikiOverviewActionGaps.map(({ gap, label }) => (
                  <button key={gap.kind} className="world-context-strip-action" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {liveOverviewReady ? <div className="world-wiki-overview-bottom-row">
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
              {wikiOverviewShowMetadata && wikiOverviewTags.length > 0 ? (
                <div className="world-wiki-overview-tags" aria-label="World tone tags">
                  {wikiOverviewTags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                </div>
              ) : null}
            </div>
          </div> : null}
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
        {liveOverviewReady ? renderNarrativeRpgPlayablePanel() : null}
        {liveOverviewReady ? renderAppPreviewPipelinePanel() : null}
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
        {visibleWikiGaps.length > 0 ? (
          <section className="world-wiki-section world-wiki-suggested-actions" id="world-wiki-section-gaps" data-world-wiki-section-kind="gaps">
            <div className="world-wiki-section-title-row">
              <EntityIcon id="activity" />
              <div>
                <span className="eyebrow">Next moves</span>
                <h3>Suggested actions</h3>
              </div>
            </div>
            <div className="world-wiki-suggested-action-grid">
              {visibleWikiGaps.map((gap) => (
                <button key={gap.key} className="world-wiki-suggested-action-button" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
                  <EntityIcon id="plus" />
                  <span>{gap.label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
          </>
        )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}
