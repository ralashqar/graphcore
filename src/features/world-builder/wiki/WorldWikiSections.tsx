import type { CSSProperties, Dispatch, SetStateAction } from 'react'

import type { ProjectContext } from '../../../domain/projectContext'
import type { WorldEntity, WorldResult } from '../../../domain/worldGraph'
import {
  iconForWorldEntity,
  labelForWorldEntity,
  labelForWorldResult,
} from '../../../domain/worldGraphHelpers'
import { readWorldSequenceMetadata } from '../../../domain/worldSequence'
import type { WorldThread } from '../../../domain/worldThread'
import type { WorldWikiGap, WorldWikiModel, WorldWikiSection } from '../../../domain/worldWiki'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import type { OutputLibraryModel } from './outputLibraryPresentation'
import { iconForWikiSection, labelForWikiSection } from './wikiSectionLabels'

export type WorldWikiDetailModalInput = {
  title: string
  eyebrow: string
  body: string
  icon?: EntityIconId
  imageUrl?: string | null
  meta?: string[]
  variant?: 'detail' | 'image'
}

type WikiSearchInput = {
  entityByKey: ReadonlyMap<string, WorldEntity>
  normalizedWikiSearchQuery: string
  resultByKey: ReadonlyMap<string, WorldResult>
  threadByKey: ReadonlyMap<string, WorldThread>
  wikiModel: WorldWikiModel
}

function wikiTextMatches(normalizedWikiSearchQuery: string, parts: Array<unknown>) {
  if (!normalizedWikiSearchQuery) return true
  const haystack = parts
    .map((part) => {
      if (typeof part === 'string') return part
      if (Array.isArray(part)) return part.filter((entry) => typeof entry === 'string').join(' ')
      return ''
    })
    .join(' ')
    .toLocaleLowerCase()
  return haystack.includes(normalizedWikiSearchQuery)
}

export function wikiSectionMatchesSearch(section: WorldWikiSection, normalizedWikiSearchQuery: string) {
  return wikiTextMatches(normalizedWikiSearchQuery, [
    section.title,
    section.summary,
    labelForWikiSection(section.kind),
  ])
}

export function wikiEntityMatchesSearch(entityKey: string, input: WikiSearchInput) {
  const entity = input.entityByKey.get(entityKey) ?? null
  if (!entity) return false
  const profile = input.wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key)
  return wikiTextMatches(input.normalizedWikiSearchQuery, [
    entity.name,
    entity.nodeType,
    labelForWorldEntity(entity.nodeType),
    entity.summary,
    entity.context,
    profile?.roleLabel,
    profile?.shortSummary,
    entity.tags,
  ])
}

export function wikiThreadMatchesSearch(threadKey: string, input: WikiSearchInput) {
  const thread = input.threadByKey.get(threadKey) ?? null
  if (!thread) return false
  return wikiTextMatches(input.normalizedWikiSearchQuery, [
    thread.title,
    thread.summary,
    thread.status,
    thread.priority,
  ])
}

export function wikiResultMatchesSearch(resultKey: string, input: WikiSearchInput) {
  const result = input.resultByKey.get(resultKey) ?? null
  if (!result) return false
  return wikiTextMatches(input.normalizedWikiSearchQuery, [
    result.title,
    result.summary,
    result.resultType,
    result.status,
  ])
}

export function countWorldWikiSearchMatches(input: WikiSearchInput) {
  if (!input.normalizedWikiSearchQuery) return null
  return input.wikiModel.sections
    .filter((section) => section.kind !== 'overview')
    .reduce((count, section) => {
      if (wikiSectionMatchesSearch(section, input.normalizedWikiSearchQuery)) return count + 1
      const entityMatches = section.entityKeys.filter((key) => wikiEntityMatchesSearch(key, input)).length
      const threadMatches = section.threadKeys.filter((key) => wikiThreadMatchesSearch(key, input)).length
      const resultMatches = section.resultKeys.filter((key) => wikiResultMatchesSearch(key, input)).length
      return count + entityMatches + threadMatches + resultMatches
    }, 0)
}

function buildWikiDetailBody(parts: Array<string | null | undefined>) {
  const seen = new Set<string>()
  return parts
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n\n')
}

type LiveWikiTextElement = 'strong' | 'em' | 'small' | 'span'

function LiveWikiRevealText({
  as,
  className,
  live,
  text,
}: {
  as: LiveWikiTextElement
  className?: string
  live: boolean
  text: string
}) {
  const Component = as
  if (!live) return <Component className={className}>{text}</Component>

  let wordIndex = 0
  return (
    <Component className={className ? `${className} world-wiki-live-text` : 'world-wiki-live-text'} aria-label={text}>
      {text.split(/(\s+)/).map((part, index) => {
        if (!part) return null
        if (/^\s+$/.test(part)) return part
        const style = {
          '--world-wiki-word-index': wordIndex,
        } as CSSProperties
        wordIndex += 1
        return (
          <span
            key={`${index}:${part}`}
            aria-hidden="true"
            className="world-wiki-live-text-word"
            style={style}
          >
            {part}
          </span>
        )
      })}
    </Component>
  )
}

type WorldWikiSectionViewProps = {
  brandAtlasError: string | null
  brandAtlasGenerating: boolean
  entityByKey: ReadonlyMap<string, WorldEntity>
  imageUrlByEntityKey: ReadonlyMap<string, string | null>
  imageUrlByResultKey: ReadonlyMap<string, string | null>
  inspectorNodeKey: string | null
  isPromptSubmitting: boolean
  normalizedWikiSearchQuery: string
  liveRevealEntryKeys: ReadonlySet<string>
  outputLibraryModel?: OutputLibraryModel
  projectContext: ProjectContext | null | undefined
  referenceArtStateByEntityKey: ReadonlyMap<string, 'queued' | 'generating'>
  resultByKey: ReadonlyMap<string, WorldResult>
  section: WorldWikiSection
  selectedPromptThreadKey: string | null
  selectedWorldNodeKey: string | null
  threadByKey: ReadonlyMap<string, WorldThread>
  wikiBrandAtlasImageUrl: string | null
  wikiBrandAtlasPending: boolean
  wikiHasAppSections: boolean
  wikiModel: WorldWikiModel
  wikiSearchActive: boolean
  wikiStyleExpanded: boolean
  onGenerateBrandAtlasImage: () => void
  onOpenBrandAtlasImageSplash: (imageUrl: string | null | undefined) => void
  onOpenWikiDetailModal: (input: WorldWikiDetailModalInput) => void
  onRunWikiGap: (gap: WorldWikiGap) => void
  onSelectWorldNode: (nodeKey: string) => void
  onSetActiveInspectorTab: (tab: 'overview' | 'relationships' | 'usage' | 'suggestions' | 'history') => void
  onSetSelectedPromptThreadKey: (threadKey: string) => void
  onSetWikiStyleExpanded: Dispatch<SetStateAction<boolean>>
}

export function WorldWikiSectionView({
  brandAtlasError,
  brandAtlasGenerating,
  entityByKey,
  imageUrlByEntityKey,
  imageUrlByResultKey,
  inspectorNodeKey,
  isPromptSubmitting,
  normalizedWikiSearchQuery,
  liveRevealEntryKeys,
  outputLibraryModel,
  projectContext,
  referenceArtStateByEntityKey,
  resultByKey,
  section,
  selectedPromptThreadKey,
  selectedWorldNodeKey,
  threadByKey,
  wikiBrandAtlasImageUrl,
  wikiBrandAtlasPending,
  wikiHasAppSections,
  wikiModel,
  wikiSearchActive,
  wikiStyleExpanded,
  onGenerateBrandAtlasImage,
  onOpenBrandAtlasImageSplash,
  onOpenWikiDetailModal,
  onRunWikiGap,
  onSelectWorldNode,
  onSetActiveInspectorTab,
  onSetSelectedPromptThreadKey,
  onSetWikiStyleExpanded,
}: WorldWikiSectionViewProps) {
  const searchInput: WikiSearchInput = {
    entityByKey,
    normalizedWikiSearchQuery,
    resultByKey,
    threadByKey,
    wikiModel,
  }
  const liveEntryProps = (kind: 'entity' | 'thread' | 'result', key: string) => {
    const entryKey = `${kind}:${key}`
    return {
      className: liveRevealEntryKeys.has(entryKey) ? ' is-live-entry-new' : '',
      dataEntryKey: entryKey,
    }
  }

  function renderEntityCard(entityKey: string, variant: 'large' | 'compact' = 'compact') {
    const entity = entityByKey.get(entityKey) ?? null
    if (!entity) return null
    const imageUrl = imageUrlByEntityKey.get(entity.key) ?? null
    const referenceArtState = referenceArtStateByEntityKey.get(entity.key) ?? null
    const profile = wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key)
    const active = selectedWorldNodeKey === entity.key || inspectorNodeKey === entity.key
    const summary = profile?.shortSummary || entity.summary || entity.context || 'No wiki summary yet.'
    const detailBody = buildWikiDetailBody([profile?.shortSummary, entity.summary, entity.context])
    const reveal = liveEntryProps('entity', entity.key)
    const isLiveReveal = liveRevealEntryKeys.has(reveal.dataEntryKey)
    return (
      <button
        key={entity.key}
        className={`world-wiki-entity-card world-wiki-cell-reveal is-${entity.nodeType} is-${variant}${active ? ' is-active' : ''}${reveal.className}`}
        data-wiki-entry-key={reveal.dataEntryKey}
        onClick={() => {
          onSelectWorldNode(entity.key)
          onSetActiveInspectorTab('overview')
          onOpenWikiDetailModal({
            title: entity.name,
            eyebrow: profile?.roleLabel || labelForWorldEntity(entity.nodeType),
            body: detailBody,
            icon: iconForWorldEntity(entity.nodeType),
            imageUrl,
            meta: [
              labelForWorldEntity(entity.nodeType),
              profile?.relationshipKeys.length ? `${profile.relationshipKeys.length} link${profile.relationshipKeys.length === 1 ? '' : 's'}` : null,
              profile?.threadKeys.length ? `${profile.threadKeys.length} thread${profile.threadKeys.length === 1 ? '' : 's'}` : null,
            ].filter((value): value is string => Boolean(value)),
          })
        }}
        type="button"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : referenceArtState ? (
          <span className={`world-wiki-reference-art-state is-${referenceArtState}`}>
            <span aria-hidden="true" />
            <em>{referenceArtState === 'generating' ? 'Making sheet' : 'Sheet queued'}</em>
          </span>
        ) : (
          <span className="world-wiki-entity-icon"><EntityIcon id={iconForWorldEntity(entity.nodeType)} /></span>
        )}
        <span className="world-wiki-entry-text">
          <LiveWikiRevealText as="strong" live={isLiveReveal} text={entity.name} />
          <LiveWikiRevealText as="em" live={isLiveReveal} text={profile?.roleLabel || labelForWorldEntity(entity.nodeType)} />
          <LiveWikiRevealText as="small" live={isLiveReveal} text={summary} />
        </span>
      </button>
    )
  }

  function renderTimelineCard(entityKey: string, fallbackOrdinal: number) {
    const entity = entityByKey.get(entityKey) ?? null
    if (!entity) return null
    const profile = wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key)
    const sequence = entity.nodeType === 'sequence_unit' ? readWorldSequenceMetadata(entity) : null
    const active = selectedWorldNodeKey === entity.key || inspectorNodeKey === entity.key
    const ordinal = sequence?.ordinal ?? null
    const imageUrl = imageUrlByEntityKey.get(entity.key) ?? null
    const referenceArtState = referenceArtStateByEntityKey.get(entity.key) ?? null
    const summary = sequence?.synopsis || profile?.shortSummary || entity.summary || entity.context || 'No story beat summary yet.'
    const outcome = sequence?.outcome || ''
    const reveal = liveEntryProps('entity', entity.key)
    const isLiveReveal = liveRevealEntryKeys.has(reveal.dataEntryKey)
    const detailBody = buildWikiDetailBody([
      sequence?.synopsis,
      sequence?.dramaticQuestion ? `Dramatic question: ${sequence.dramaticQuestion}` : null,
      outcome ? `Outcome: ${outcome}` : null,
      entity.context,
    ])
    return (
      <button
        key={entity.key}
        className={`world-wiki-timeline-card world-wiki-cell-reveal is-${entity.nodeType}${active ? ' is-active' : ''}${reveal.className}`}
        data-wiki-entry-key={reveal.dataEntryKey}
        onClick={() => {
          onSelectWorldNode(entity.key)
          onSetActiveInspectorTab('overview')
          onOpenWikiDetailModal({
            title: entity.name,
            eyebrow: sequence?.unitKind || labelForWorldEntity(entity.nodeType),
            body: detailBody,
            icon: iconForWorldEntity(entity.nodeType),
            imageUrl,
            meta: [
              ordinal !== null ? `Step ${ordinal}` : null,
              sequence?.actLabel || null,
              sequence?.storyFunction ? sequence.storyFunction.replace(/_/g, ' ') : null,
              sequence?.scriptExpansionReady ? 'Script ready' : null,
            ].filter((value): value is string => Boolean(value)),
          })
        }}
        type="button"
      >
        <span className="world-wiki-timeline-ordinal">{ordinal ?? fallbackOrdinal}</span>
        <span className={imageUrl ? 'world-wiki-timeline-body has-image' : 'world-wiki-timeline-body'}>
          {imageUrl ? <img className="world-wiki-timeline-image" src={imageUrl} alt="" /> : referenceArtState ? (
            <span className={`world-wiki-timeline-image world-wiki-reference-art-state is-${referenceArtState}`}>
              <span aria-hidden="true" />
              <em>{referenceArtState === 'generating' ? 'Making sheet' : 'Sheet queued'}</em>
            </span>
          ) : null}
          <span className="world-wiki-timeline-copy world-wiki-entry-text">
            <LiveWikiRevealText
              as="span"
              className="world-wiki-timeline-kicker"
              live={isLiveReveal}
              text={[sequence?.actLabel, sequence?.unitKind || labelForWorldEntity(entity.nodeType)].filter(Boolean).join(' / ')}
            />
            <LiveWikiRevealText as="strong" live={isLiveReveal} text={entity.name} />
            <LiveWikiRevealText as="small" live={isLiveReveal} text={summary} />
            {outcome ? (
              <span className="world-wiki-timeline-outcome">
                <LiveWikiRevealText as="em" live={isLiveReveal} text="Outcome" />
                <LiveWikiRevealText as="span" live={isLiveReveal} text={outcome} />
              </span>
            ) : null}
          </span>
        </span>
      </button>
    )
  }

  if (section.kind === 'style') {
    const isStyleHiddenBySearch = wikiSearchActive && !wikiSectionMatchesSearch(section, normalizedWikiSearchQuery)
    const styleGaps = wikiModel.gaps.filter((entry) => entry.sectionKind === 'style')
    const colorEntries = Object.entries(wikiModel.overview.colorScheme)
    const hasAtlas = Boolean(wikiModel.overview.brandAtlasPrompt.trim() || wikiBrandAtlasImageUrl)
    const atlasBody = wikiModel.overview.brandAtlasPrompt.trim() || 'No brand atlas prompt has been established yet.'
    const styleSummary = wikiModel.overview.artStyleDescription || section.summary || 'Not established yet'
    const styleMeta = [
      wikiModel.overview.visualMotifs.length ? `${wikiModel.overview.visualMotifs.length} motifs` : null,
      colorEntries.length ? `${colorEntries.length} colors` : null,
      hasAtlas ? 'Atlas ready' : null,
    ].filter((value): value is string => Boolean(value))
    return (
      <div key={section.kind} className={isStyleHiddenBySearch ? 'world-wiki-search-collapse is-search-hidden' : 'world-wiki-search-collapse'}>
        <section
          id={`world-wiki-section-${section.kind}`}
          className={`world-wiki-section world-wiki-section-${section.kind} ${wikiStyleExpanded ? 'is-expanded' : 'is-collapsed'}`}
        >
          <div className="world-wiki-style-summary-row">
            <button
              className="world-wiki-style-summary"
              onClick={() => onSetWikiStyleExpanded((value) => !value)}
              type="button"
              aria-expanded={wikiStyleExpanded}
            >
              <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection(section.kind)} /></span>
              <span className="world-wiki-style-summary-copy">
                <span className="eyebrow">{labelForWikiSection(section.kind)}</span>
                <strong>{section.title}</strong>
                <small>{styleSummary}</small>
              </span>
              {styleMeta.length > 0 ? <span className="world-wiki-style-summary-meta">{styleMeta.slice(0, 2).join(' / ')}</span> : null}
              <span className="world-wiki-style-summary-toggle" aria-hidden="true">{wikiStyleExpanded ? '-' : '+'}</span>
            </button>
            {!wikiStyleExpanded && styleGaps.length > 0 ? (
              <button className="ghost-button compact" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(styleGaps[0])} type="button">
                {styleGaps[0].label}
              </button>
            ) : null}
          </div>
          {wikiStyleExpanded ? (
            <>
              {styleGaps.length > 0 ? (
                <div className="world-wiki-section-actions world-wiki-style-gap-actions">
                  {styleGaps.slice(0, 3).map((gap) => (
                    <button key={gap.key} className="ghost-button compact" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
                      {gap.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={wikiBrandAtlasImageUrl ? 'world-wiki-style-grid has-atlas-image' : 'world-wiki-style-grid'}>
                <button
                  className="world-wiki-style-card is-wide"
                  onClick={() => onOpenWikiDetailModal({
                    title: section.title,
                    eyebrow: projectContext?.projectType === 'app' || wikiHasAppSections ? 'App art direction' : 'Art style',
                    body: wikiModel.overview.artStyleDescription || section.summary,
                    icon: 'design',
                    meta: [
                      wikiModel.overview.genre || null,
                      wikiModel.overview.toneTags.length ? wikiModel.overview.toneTags.slice(0, 3).join(', ') : null,
                    ].filter((value): value is string => Boolean(value)),
                  })}
                  type="button"
                >
                  <span className="eyebrow">Art Style</span>
                  <strong>{wikiModel.overview.artStyleDescription || 'Not established yet'}</strong>
                </button>
                <button
                  className={[
                    hasAtlas ? 'world-wiki-style-card is-atlas' : 'world-wiki-style-card is-atlas is-empty',
                    wikiBrandAtlasImageUrl ? 'has-image' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (wikiBrandAtlasImageUrl) {
                      onOpenBrandAtlasImageSplash(wikiBrandAtlasImageUrl)
                      return
                    }
                    onOpenWikiDetailModal({
                      title: projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Brand Atlas' : 'Brand Atlas',
                      eyebrow: 'Visual image prompt',
                      body: atlasBody,
                      icon: 'asset',
                      meta: wikiModel.overview.brandAtlasPrompt ? ['Prompt ready'] : ['Needs prompt'],
                    })
                  }}
                  type="button"
                  aria-label={wikiBrandAtlasImageUrl ? 'Open brand atlas image' : 'Open brand atlas prompt'}
                >
                  {wikiBrandAtlasImageUrl ? <img src={wikiBrandAtlasImageUrl} alt="" /> : <span className="world-wiki-style-card-icon"><EntityIcon id="asset" /></span>}
                  {wikiBrandAtlasImageUrl ? null : (
                    <span>
                      <em>Brand Atlas</em>
                      <strong>{wikiBrandAtlasPending ? 'Image generating' : wikiModel.overview.brandAtlasPrompt ? 'Prompt ready' : 'No atlas prompt yet'}</strong>
                    </span>
                  )}
                </button>
                <div className="world-wiki-style-side-column">
                  <div className="world-wiki-style-card">
                    <span className="eyebrow">Visual Motifs</span>
                    {wikiModel.overview.visualMotifs.length > 0 ? (
                      <div className="world-wiki-chip-row">
                        {wikiModel.overview.visualMotifs.map((motif) => <span key={motif} className="chip">{motif}</span>)}
                      </div>
                    ) : <strong>Not established yet</strong>}
                  </div>
                  <div className="world-wiki-style-card">
                    <span className="eyebrow">{projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Colors' : 'Palette Notes'}</span>
                    {colorEntries.length > 0 ? (
                      <div className="world-wiki-color-list">
                        {colorEntries.slice(0, 8).map(([name, value]) => (
                          <span key={name} className="world-wiki-color-row">
                            <i style={{ background: value.split(/\s+/)[0] }} />
                            <span><strong>{name}</strong><em>{value}</em></span>
                          </span>
                        ))}
                      </div>
                    ) : <strong>Not established yet</strong>}
                  </div>
                </div>
              </div>
              <div className="world-wiki-style-actions">
                <button
                  className="ghost-button compact"
                  disabled={brandAtlasGenerating || wikiBrandAtlasPending || isPromptSubmitting}
                  onClick={onGenerateBrandAtlasImage}
                  type="button"
                >
                  {brandAtlasGenerating || wikiBrandAtlasPending
                    ? 'Generating atlas...'
                    : wikiModel.overview.brandAtlasPrompt
                      ? wikiBrandAtlasImageUrl
                        ? 'Regenerate atlas image'
                        : 'Generate atlas image'
                      : 'Draft atlas prompt'}
                </button>
                {brandAtlasError ? <span className="world-wiki-style-error">{brandAtlasError}</span> : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    )
  }

  const sectionMatchesSearch = wikiSectionMatchesSearch(section, normalizedWikiSearchQuery)
  const cappedEntityKeys = Array.from(new Set(section.entityKeys)).slice(0, section.kind === 'cast' ? 8 : 6)
    .filter((key) => !wikiSearchActive || sectionMatchesSearch || wikiEntityMatchesSearch(key, searchInput))
  const cappedThreadKeys = Array.from(new Set(section.threadKeys)).slice(0, 6)
    .filter((key) => !wikiSearchActive || sectionMatchesSearch || wikiThreadMatchesSearch(key, searchInput))
  const cappedResultKeys = Array.from(new Set(section.resultKeys)).slice(0, 6)
    .filter((key) => !wikiSearchActive || sectionMatchesSearch || wikiResultMatchesSearch(key, searchInput))
  const cappedOutputArtifacts = section.kind === 'outputs'
    ? (outputLibraryModel?.artifacts ?? [])
        .filter((artifact) => !wikiSearchActive || sectionMatchesSearch || wikiTextMatches(normalizedWikiSearchQuery, [
          artifact.name,
          artifact.kind,
          artifact.requestTitle,
          artifact.promptExcerpt,
        ]))
        .slice(0, 6)
    : []
  const targetCellCount = cappedEntityKeys.length + cappedThreadKeys.length + cappedResultKeys.length + cappedOutputArtifacts.length
  const visibleCellCount = targetCellCount
  const visibleEntityKeys = cappedEntityKeys.slice(0, visibleCellCount)
  const remainingAfterEntities = Math.max(0, visibleCellCount - visibleEntityKeys.length)
  const visibleThreadKeys = cappedThreadKeys.slice(0, remainingAfterEntities)
  const remainingAfterThreads = Math.max(0, remainingAfterEntities - visibleThreadKeys.length)
  const visibleResultKeys = cappedResultKeys.slice(0, remainingAfterThreads)
  const remainingAfterResults = Math.max(0, remainingAfterThreads - visibleResultKeys.length)
  const visibleOutputArtifacts = cappedOutputArtifacts.slice(0, remainingAfterResults)
  const gap = wikiModel.gaps.find((entry) => entry.sectionKind === section.kind) ?? null
  const isCastSection = section.kind === 'cast'
  const isSearchHidden = wikiSearchActive && !sectionMatchesSearch && targetCellCount === 0
  const hasEntryCells = targetCellCount > 0

  return (
    <section
      id={`world-wiki-section-${section.kind}`}
      key={section.kind}
      className={`world-wiki-section world-wiki-section-${section.kind}${isSearchHidden ? ' is-search-hidden' : ''}`}
    >
      <div className="world-wiki-section-head">
        <div className="world-wiki-section-title-row">
          <EntityIcon id={iconForWikiSection(section.kind)} />
          <h3>{isCastSection ? 'Characters' : section.title}</h3>
        </div>
        {gap ? (
          <button className="ghost-button compact" disabled={isPromptSubmitting} onClick={() => onRunWikiGap(gap)} type="button">
            {gap.label}
          </button>
        ) : null}
      </div>
      {!hasEntryCells ? (
        <button
          className="world-wiki-summary-button"
          onClick={() => onOpenWikiDetailModal({
            title: section.title,
            eyebrow: labelForWikiSection(section.kind),
            body: section.summary,
            icon: iconForWikiSection(section.kind),
          })}
          type="button"
        >
          <span className="world-wiki-summary-clamp">{section.summary}</span>
        </button>
      ) : null}
      {visibleEntityKeys.length > 0 ? (
        <div className={section.kind === 'timeline' ? 'world-wiki-timeline-list' : section.kind === 'cast' ? 'world-wiki-card-grid is-cast' : 'world-wiki-card-grid'}>
          {visibleEntityKeys.map((key, index) => (
            section.kind === 'timeline'
              ? renderTimelineCard(key, index + 1)
              : renderEntityCard(key, section.kind === 'cast' ? 'large' : 'compact')
          ))}
        </div>
      ) : null}
      {visibleThreadKeys.length > 0 ? (
        <div className="world-wiki-thread-list">
          {visibleThreadKeys.map((key) => {
            const thread = threadByKey.get(key) ?? null
            if (!thread) return null
            const active = selectedPromptThreadKey === thread.key
            const summary = thread.summary || 'No arc summary yet.'
            const reveal = liveEntryProps('thread', thread.key)
            const isLiveReveal = liveRevealEntryKeys.has(reveal.dataEntryKey)
            return (
              <button
                key={thread.key}
                className={`world-wiki-thread-card world-wiki-cell-reveal${active ? ' is-active' : ''}${reveal.className}`}
                data-wiki-entry-key={reveal.dataEntryKey}
                onClick={() => {
                  onSetSelectedPromptThreadKey(thread.key)
                  onOpenWikiDetailModal({
                    title: thread.title,
                    eyebrow: `${thread.priority} story arc`,
                    body: summary,
                    icon: 'thread',
                    meta: [
                      thread.status,
                      thread.linkedEntityKeys.length ? `${thread.linkedEntityKeys.length} linked node${thread.linkedEntityKeys.length === 1 ? '' : 's'}` : null,
                    ].filter((value): value is string => Boolean(value)),
                  })
                }}
                type="button"
              >
                <span className="world-wiki-thread-priority">{thread.priority}</span>
                <span className="world-wiki-entry-text">
                  <LiveWikiRevealText as="strong" live={isLiveReveal} text={thread.title} />
                  <LiveWikiRevealText as="small" live={isLiveReveal} text={summary} />
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {visibleResultKeys.length > 0 ? (
        <div className="world-wiki-output-grid">
          {visibleResultKeys.map((key) => {
            const result = resultByKey.get(key) ?? null
            if (!result) return null
            const imageUrl = imageUrlByResultKey.get(result.key) ?? null
            const summary = result.summary || result.resultType
            const reveal = liveEntryProps('result', result.key)
            const isLiveReveal = liveRevealEntryKeys.has(reveal.dataEntryKey)
            return (
              <button
                key={result.key}
                className={`world-wiki-output-card world-wiki-cell-reveal${reveal.className}`}
                data-wiki-entry-key={reveal.dataEntryKey}
                onClick={() => {
                  onSelectWorldNode(result.key)
                  onOpenWikiDetailModal({
                    title: result.title,
                    eyebrow: labelForWorldResult(result.resultType),
                    body: summary,
                    icon: 'result',
                    imageUrl,
                    meta: [result.status],
                  })
                }}
                type="button"
              >
                {imageUrl ? <img src={imageUrl} alt="" /> : null}
                <span className="world-wiki-entry-text">
                  <LiveWikiRevealText as="strong" live={isLiveReveal} text={result.title} />
                  <LiveWikiRevealText as="small" live={isLiveReveal} text={summary} />
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {visibleOutputArtifacts.length > 0 ? (
        <div className="world-wiki-output-grid">
          {visibleOutputArtifacts.map((artifact) => (
            <a
              key={artifact.id}
              className="world-wiki-output-card world-wiki-cell-reveal"
              href={artifact.url ?? undefined}
              onClick={(event) => {
                if (artifact.url) return
                event.preventDefault()
                onOpenWikiDetailModal({
                  title: artifact.name,
                  eyebrow: artifact.kind.replace(/_/g, ' '),
                  body: artifact.promptExcerpt || artifact.requestTitle || 'Output artifact',
                  icon: 'result',
                  imageUrl: artifact.thumbnailUrl,
                  meta: [artifact.status],
                })
              }}
              rel="noreferrer"
              target={artifact.url ? '_blank' : undefined}
            >
              {artifact.thumbnailUrl ? <img src={artifact.thumbnailUrl} alt="" /> : <span className="world-wiki-output-file"><EntityIcon id={artifact.type === 'video' ? 'cinematic' : 'content'} /></span>}
              <strong>{artifact.name}</strong>
              <small>{artifact.requestTitle ?? artifact.kind.replace(/_/g, ' ')}</small>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}
