import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'

import type { WorldEntity, WorldRelationship, WorldResult } from '../../../domain/worldGraph'
import type { WorldPromptSession, WorldPromptSuggestion, WorldPromptSuggestionRecord, WorldPromptTurn } from '../../../domain/worldPrompt'
import type { WorldThread } from '../../../domain/worldThread'
import { iconForWorldEntity, labelForWorldEntity } from '../../../domain/worldGraphHelpers'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import {
  WORLD_FEED_FILTERS,
  type WorldFeedEntry,
  type WorldFeedFilter,
  type WorldPromptTurnLens,
} from '../../world/worldPresentation'
type WorldFeedGroup = {
  id: string
  label: string
  entries: WorldFeedEntry[]
}

type FeedRelationshipCluster = {
  key: string
  source: string
  target: string
  verb: string
  strength: number
}

type WorldFeedPanelProps = {
  activePromptTurn: WorldPromptTurn | null
  activeSessionSuggestions: WorldPromptSuggestionRecord[]
  activeSuggestionCountBySessionId: Record<string, number>
  activeWorldThreads: WorldThread[]
  entityByKey: Map<string, WorldEntity>
  feedRelationshipClusters: FeedRelationshipCluster[]
  hasDeferredWorldFeedEntries: boolean
  historyOpen: boolean
  imageUrlByEntityKey: Map<string, string | null>
  isPromptBusy: boolean
  isPromptCancelling: boolean
  newWorldFeedEntryIds: Set<string>
  relationshipByKey: Map<string, WorldRelationship>
  renderedWorldFeedGroups: WorldFeedGroup[]
  selectedPromptSession: WorldPromptSession | null
  selectedPromptSessionKey: string | null
  selectedWorldFeedEntry: WorldFeedEntry | null
  worldEntities: WorldEntity[]
  worldFeedFilter: WorldFeedFilter
  worldFeedGroups: WorldFeedGroup[]
  worldFeedLoadMoreRef: RefObject<HTMLDivElement | null>
  worldFeedMainRef: RefObject<HTMLElement | null>
  worldFeedModel: { countsByFilter: Record<WorldFeedFilter, number> }
  worldPromptError: string | null
  worldPromptSessions: WorldPromptSession[]
  worldPromptText: string
  worldRelationships: WorldRelationship[]
  worldResults: WorldResult[]
  wikiTitle: string
  onCancelPromptTurn: (turnId: string) => Promise<void> | void
  onFeedScroll: () => void
  onGrowWorkbenchResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void
  onLoadMoreWorldFeedEntries: () => void
  onOpenTurnLens: (lens: WorldPromptTurnLens) => void
  onRefreshPromptSuggestions: (reason: string) => Promise<void> | void
  onRunPromptSuggestion: (suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) => Promise<void> | void
  onSelectGraphEdge: (key: string) => void
  onSelectGraphNode: (key: string) => void
  onSelectPromptSessionKey: (key: string | null) => void
  onSelectWikiSubView: (subView: 'wiki' | 'feed') => void
  onSetHistoryOpen: (open: boolean) => void
  onSetWorldFeedFilter: (filter: WorldFeedFilter) => void
  onSetWorldFeedGraphPreviewEntryId: (entryId: string | null) => void
  onSetWorldFeedGraphPreviewFocusKey: (nodeKey: string | null) => void
  onSetWorldFeedGraphPreviewSelectedNodeKey: (nodeKey: string | null) => void
  onSetWorldPromptText: (value: string) => void
  onResetGrowWorkbenchWidth: () => void
  onStartNewPromptSession: () => Promise<void> | void
  onSubmitWorldPrompt: () => Promise<void> | void
  onWorldViewModeChange: (mode: 'graph' | 'wiki' | 'timeline' | 'board' | 'code') => void
  renderWikiSubViewToggle: () => ReactNode
  setSelectedWorldFeedEntryId: (entryId: string | null) => void
}

export function WorldFeedPanel({
  activePromptTurn,
  activeSessionSuggestions,
  activeSuggestionCountBySessionId,
  activeWorldThreads,
  entityByKey,
  feedRelationshipClusters,
  hasDeferredWorldFeedEntries,
  historyOpen,
  imageUrlByEntityKey,
  isPromptBusy,
  isPromptCancelling,
  newWorldFeedEntryIds,
  relationshipByKey,
  renderedWorldFeedGroups,
  selectedPromptSession,
  selectedPromptSessionKey,
  selectedWorldFeedEntry,
  worldEntities,
  worldFeedFilter,
  worldFeedGroups,
  worldFeedLoadMoreRef,
  worldFeedMainRef,
  worldFeedModel,
  worldPromptError,
  worldPromptSessions,
  worldPromptText,
  worldRelationships,
  worldResults,
  wikiTitle,
  onCancelPromptTurn,
  onFeedScroll,
  onGrowWorkbenchResizeStart,
  onLoadMoreWorldFeedEntries,
  onOpenTurnLens,
  onRefreshPromptSuggestions,
  onRunPromptSuggestion,
  onSelectGraphEdge,
  onSelectGraphNode,
  onSelectPromptSessionKey,
  onSelectWikiSubView,
  onSetHistoryOpen,
  onSetWorldFeedFilter,
  onSetWorldFeedGraphPreviewEntryId,
  onSetWorldFeedGraphPreviewFocusKey,
  onSetWorldFeedGraphPreviewSelectedNodeKey,
  onSetWorldPromptText,
  onResetGrowWorkbenchWidth,
  onStartNewPromptSession,
  onSubmitWorldPrompt,
  onWorldViewModeChange,
  renderWikiSubViewToggle,
  setSelectedWorldFeedEntryId,
}: WorldFeedPanelProps) {
  function handleWorldFeedComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void onSubmitWorldPrompt()
  }

  function renderWorldFeedThumb(entity: WorldEntity | null, fallbackIcon: EntityIconId = 'content') {
    const imageUrl = entity ? imageUrlByEntityKey.get(entity.key) ?? null : null
    const iconId = entity ? iconForWorldEntity(entity.nodeType) : fallbackIcon
    return (
      <span className="world-feed-thumb" aria-hidden="true">
        {imageUrl ? <img alt="" src={imageUrl} /> : <EntityIcon id={iconId} />}
      </span>
    )
  }

  function openWorldFeedEntryTarget(entry: WorldFeedEntry, target: 'wiki' | 'graph' = 'graph') {
    if (entry.entityKey) {
      onSelectGraphNode(entry.entityKey)
    } else if (entry.relationshipKey) {
      onSelectGraphEdge(entry.relationshipKey)
    } else if (entry.resultKey) {
      onSelectGraphNode(entry.resultKey)
    } else if (entry.connectedEntityKeys?.[0]) {
      onSelectGraphNode(entry.connectedEntityKeys[0])
    }
    if (target === 'wiki') {
      onSelectWikiSubView('wiki')
    } else {
      onWorldViewModeChange('graph')
    }
  }

  function renderWorldFeedEndpoint(entityKey: string | null | undefined, fallbackLabel: string) {
    const entity = entityKey ? entityByKey.get(entityKey) ?? null : null
    return (
      <button
        className="world-feed-relationship-node"
        onClick={(event) => {
          event.stopPropagation()
          if (entity) onSelectGraphNode(entity.key)
        }}
        type="button"
      >
        {renderWorldFeedThumb(entity, entity ? iconForWorldEntity(entity.nodeType) : 'graph')}
        <strong>{entity?.name ?? fallbackLabel}</strong>
      </button>
    )
  }

  function renderWorldFeedThumbCluster(entry: WorldFeedEntry) {
    const keys = Array.from(new Set(entry.thumbnailEntityKeys ?? entry.connectedEntityKeys ?? [])).slice(0, 4)
    if (keys.length === 0) {
      return <span className="world-feed-hero-thumb">{renderWorldFeedThumb(null, entry.kind === 'active_turn' ? 'activity' : 'content')}</span>
    }
    return (
      <span className={`world-feed-thumb-cluster count-${keys.length}`} aria-hidden="true">
        {keys.map((entityKey) => (
          <span key={entityKey} className="world-feed-hero-thumb">
            {renderWorldFeedThumb(entityByKey.get(entityKey) ?? null, 'content')}
          </span>
        ))}
      </span>
    )
  }

  function renderWorldFeedDetailEntityList(label: string, keys: unknown) {
    const entityKeys = Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
      : []
    if (entityKeys.length === 0) return null
    return (
      <div className="world-feed-detail-links">
        <span className="eyebrow">{label}</span>
        {entityKeys.slice(0, 12).map((entityKey) => {
          const entity = entityByKey.get(entityKey) ?? null
          if (!entity) return null
          return (
            <button key={`${label}:${entity.key}`} onClick={() => onSelectGraphNode(entity.key)} type="button">
              {renderWorldFeedThumb(entity)}
              <span>{entity.name}</span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderWorldFeedDetailPanel(entry: WorldFeedEntry, variant: 'rail' | 'sheet' = 'rail') {
    const relationship = entry.relationshipKey ? relationshipByKey.get(entry.relationshipKey) ?? null : null
    const connectedEntityKeys = entry.connectedEntityKeys ?? [
      ...(entry.entityKey ? [entry.entityKey] : []),
      ...(relationship ? [relationship.sourceEntityKey, relationship.targetEntityKey] : []),
    ]
    const detailText = entry.fullDetail || entry.detail || 'No extra detail for this feed entry yet.'
    return (
      <section className={`world-feed-detail-panel is-${variant}`}>
        <div className="world-feed-context-head">
          <span className="eyebrow">Selected Entry</span>
          <button onClick={() => setSelectedWorldFeedEntryId(null)} type="button">Clear</button>
        </div>
        <div className="world-feed-detail-title">
          {renderWorldFeedThumb(connectedEntityKeys[0] ? entityByKey.get(connectedEntityKeys[0]) ?? null : null, entry.relationshipKey ? 'graph' : 'content')}
          <div>
            <span>{entry.badge}</span>
            <strong>{entry.title}</strong>
          </div>
        </div>
        <p>{detailText}</p>
        {relationship ? (
          <div className="world-feed-detail-relationship">
            <strong>{entityByKey.get(relationship.sourceEntityKey)?.name ?? entry.sourceLabel ?? relationship.sourceEntityKey}</strong>
            <span>{(entry.relationshipVerb || relationship.verb || 'linked').replace(/_/g, ' ')}</span>
            <strong>{entityByKey.get(relationship.targetEntityKey)?.name ?? entry.targetLabel ?? relationship.targetEntityKey}</strong>
          </div>
        ) : null}
        {entry.changedFields && entry.changedFields.length > 0 ? (
          <div className="world-feed-detail-chips">
            {entry.changedFields.map((field) => <span key={field}>{field}</span>)}
          </div>
        ) : null}
        {entry.transaction ? (
          <div className="world-feed-audit-block">
            {typeof entry.transaction.intent === 'string' ? <span>Intent: {entry.transaction.intent.replace(/_/g, ' ')}</span> : null}
            {typeof entry.transaction.risk === 'string' ? <span>Risk: {entry.transaction.risk}</span> : null}
            {typeof entry.transaction.status === 'string' ? <span>Status: {entry.transaction.status.replace(/_/g, ' ')}</span> : null}
          </div>
        ) : null}
        {entry.nodeEvolution && Array.isArray(entry.nodeEvolution.decisions) ? (
          <div className="world-feed-audit-block">
            {entry.nodeEvolution.decisions.slice(0, 5).map((decision, index) => {
              if (!decision || typeof decision !== 'object') return null
              const record = decision as Record<string, unknown>
              const subject = typeof record.subject === 'string' && record.subject.trim() ? record.subject : `Decision ${index + 1}`
              const decisionLabel = typeof record.decision === 'string' ? record.decision.replace(/_/g, ' ') : 'node decision'
              const confidence = typeof record.confidence === 'number' ? ` (${Math.round(record.confidence * 100)}%)` : ''
              return <span key={`${subject}:${index}`}>{subject}: {decisionLabel}{confidence}</span>
            })}
          </div>
        ) : null}
        {entry.audit ? (
          <div className="world-feed-audit-block">
            {Object.entries(entry.audit).slice(0, 6).map(([key, value]) => (
              <span key={key}>
                {key.replace(/([A-Z])/g, ' $1')}: {Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : typeof value === 'object' && value !== null ? 'updated' : String(value)}
              </span>
            ))}
          </div>
        ) : null}
        {entry.kind === 'turn_update' || entry.kind === 'active_turn' ? (
          <>
            {renderWorldFeedDetailEntityList('New entities', entry.audit?.addedEntityKeys)}
            {renderWorldFeedDetailEntityList('Changed entities', entry.audit?.changedEntityKeys)}
            {Array.isArray(entry.audit?.relationshipKeys) && entry.audit.relationshipKeys.length > 0 ? (
              <div className="world-feed-detail-links">
                <span className="eyebrow">Relationships</span>
                {entry.audit.relationshipKeys.slice(0, 12).map((relationshipKey) => {
                  if (typeof relationshipKey !== 'string') return null
                  const item = relationshipByKey.get(relationshipKey) ?? null
                  if (!item) return null
                  const sourceName = entityByKey.get(item.sourceEntityKey)?.name ?? item.sourceEntityKey
                  const targetName = entityByKey.get(item.targetEntityKey)?.name ?? item.targetEntityKey
                  return (
                    <button key={relationshipKey} onClick={() => onSelectGraphEdge(relationshipKey)} type="button">
                      {renderWorldFeedThumb(entityByKey.get(item.sourceEntityKey) ?? null, 'graph')}
                      <span>{sourceName} - {item.verb.replace(/_/g, ' ')} - {targetName}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : null}
        {connectedEntityKeys.length > 0 ? (
          <div className="world-feed-detail-links">
            <span className="eyebrow">Connected</span>
            {connectedEntityKeys.slice(0, 6).map((entityKey) => {
              const entity = entityByKey.get(entityKey) ?? null
              if (!entity) return null
              return (
                <button key={entity.key} onClick={() => onSelectGraphNode(entity.key)} type="button">
                  {renderWorldFeedThumb(entity)}
                  <span>{entity.name}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="world-feed-detail-actions">
          <button onClick={() => openWorldFeedEntryTarget(entry, 'wiki')} type="button">Open in Wiki</button>
          <button onClick={() => openWorldFeedEntryTarget(entry, 'graph')} type="button">View in Graph</button>
          {entry.turnLens ? <button onClick={() => onOpenTurnLens(entry.turnLens as WorldPromptTurnLens)} type="button">Open Turn</button> : null}
        </div>
      </section>
    )
  }

  function formatWorldFeedTurnTimestamp(createdAt: string) {
    const created = new Date(createdAt)
    if (Number.isNaN(created.getTime())) {
      return { label: 'Earlier', time: '' }
    }
    const now = new Date()
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const createdDay = startOfDay(created)
    const today = startOfDay(now)
    const ageMs = now.getTime() - created.getTime()
    const label = ageMs >= 0 && ageMs < 15 * 60 * 1000
      ? 'Just now'
      : createdDay === today
        ? 'Today'
        : createdDay === today - 24 * 60 * 60 * 1000
          ? 'Yesterday'
          : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(created)
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(created)
    return { label, time }
  }

  function worldFeedEntryHasGraphPreview(entry: WorldFeedEntry) {
    const hasAuditEntities = Array.isArray(entry.audit?.addedEntityKeys) && entry.audit.addedEntityKeys.length > 0
    const hasAuditChanges = Array.isArray(entry.audit?.changedEntityKeys) && entry.audit.changedEntityKeys.length > 0
    const hasAuditRelationships = Array.isArray(entry.audit?.relationshipKeys) && entry.audit.relationshipKeys.length > 0
    return Boolean(
      entry.entityKey
      || entry.resultKey
      || entry.relationshipKey
      || (entry.connectedEntityKeys?.length ?? 0) > 0
      || (entry.thumbnailEntityKeys?.length ?? 0) > 0
      || (entry.turnLens?.nodeKeys.length ?? 0) > 0
      || hasAuditEntities
      || hasAuditChanges
      || hasAuditRelationships,
    )
  }

  function openWorldFeedGraphPreview(entry: WorldFeedEntry) {
    if (!worldFeedEntryHasGraphPreview(entry)) return
    const focusKey = entry.entityKey ?? entry.thumbnailEntityKeys?.[0] ?? entry.connectedEntityKeys?.[0] ?? entry.turnLens?.rootEntityKey ?? null
    setSelectedWorldFeedEntryId(entry.id)
    onSetWorldFeedGraphPreviewEntryId(entry.id)
    onSetWorldFeedGraphPreviewFocusKey(focusKey)
    onSetWorldFeedGraphPreviewSelectedNodeKey(focusKey)
  }

  function renderWorldFeedCard(entry: WorldFeedEntry) {
    const entity = entry.entityKey ? entityByKey.get(entry.entityKey) ?? null : null
    const relationship = entry.relationshipKey ? relationshipByKey.get(entry.relationshipKey) ?? null : null
    const isRelationship = entry.kind === 'relationship_created' || entry.kind === 'relationship_updated'
    const isSequenceRewired = entry.kind === 'sequence_rewired' || entry.kind === 'relationship_rewired' || entry.kind === 'entity_merged'
    const isTurnUpdate = entry.kind === 'turn_update' || entry.kind === 'active_turn'
    const isChildEntry = Boolean(entry.parentTurnId)
    const primaryThumbEntity = entity ?? (entry.thumbnailEntityKeys?.[0] ? entityByKey.get(entry.thumbnailEntityKeys[0]) ?? null : null)
    const isSelected = selectedWorldFeedEntry?.id === entry.id
    const isNew = newWorldFeedEntryIds.has(entry.id)
    const displayDetail = entry.compactDetail ?? entry.detail
    const hasGraphPreview = worldFeedEntryHasGraphPreview(entry)
    const inspectEntry = () => setSelectedWorldFeedEntryId(entry.id)
    const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      inspectEntry()
    }
    if (entry.kind === 'turn_summary') {
      const turnTime = formatWorldFeedTurnTimestamp(entry.createdAt)
      return (
        <article
          key={entry.id}
          className={`world-feed-turn-divider${isSelected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
          onClick={inspectEntry}
          onKeyDown={handleCardKeyDown}
          role="button"
          tabIndex={0}
        >
          <span className="world-feed-turn-time">
            {turnTime.label}
            {turnTime.time ? <em>{turnTime.time}</em> : null}
          </span>
          <span className="world-feed-turn-rule" aria-hidden="true" />
          <span className="world-feed-turn-count">{displayDetail || entry.title}</span>
        </article>
      )
    }
    return (
      <article
        key={entry.id}
        className={`world-feed-card is-${entry.kind} tone-${entry.tone ?? 'normal'}${isChildEntry ? ' is-child-entry' : ''}${isSelected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
        onClick={inspectEntry}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
      >
        <div className="world-feed-card-main">
          <div className="world-feed-card-head">
            <span>{entry.badge}</span>
            {entry.entityNodeType ? <em>{labelForWorldEntity(entry.entityNodeType)}</em> : null}
            <button
              className="world-feed-card-expand"
              disabled={!hasGraphPreview}
              onClick={(event) => {
                event.stopPropagation()
                openWorldFeedGraphPreview(entry)
              }}
              type="button"
            >
              Expand
            </button>
          </div>
          {isTurnUpdate ? (
            <div className="world-feed-turn-card-layout">
              <div className="world-feed-card-title">
                <strong>{entry.title}</strong>
                {displayDetail ? <p>{displayDetail}</p> : null}
                {entry.changedFields && entry.changedFields.length > 0 ? (
                  <div className="world-feed-card-mini-meta">
                    {entry.changedFields.slice(0, 3).map((field) => <span key={field}>{field}</span>)}
                  </div>
                ) : null}
              </div>
              {renderWorldFeedThumbCluster(entry)}
            </div>
          ) : isRelationship ? (
            <div className="world-feed-relationship">
              {renderWorldFeedEndpoint(relationship?.sourceEntityKey, entry.sourceLabel ?? 'Source')}
              <span className="world-feed-relationship-connector">
                <span className="world-feed-relationship-line"><i /></span>
                <strong>{(entry.relationshipVerb || relationship?.verb || 'linked').replace(/_/g, ' ')}</strong>
              </span>
              {renderWorldFeedEndpoint(relationship?.targetEntityKey, entry.targetLabel ?? 'Target')}
            </div>
          ) : isSequenceRewired ? (
            <div className="world-feed-sequence-card">
              <div className="world-feed-card-title-row">
                {renderWorldFeedThumb(primaryThumbEntity, 'content')}
                <div className="world-feed-card-title">
                  <strong>{entry.title}</strong>
                  {displayDetail ? <p>{displayDetail}</p> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="world-feed-card-title-row">
              {renderWorldFeedThumb(primaryThumbEntity, entry.kind === 'active_turn' || entry.kind === 'media_job' ? 'activity' : 'content')}
              <div className="world-feed-card-title">
                <strong>{entry.title}</strong>
                {displayDetail ? <p>{displayDetail}</p> : null}
              </div>
            </div>
          )}
          {entry.suggestions && entry.suggestions.length > 0 ? (
            <div className="world-feed-card-chips">
              {entry.suggestions.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion.id}
                  disabled={isPromptBusy}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onRunPromptSuggestion(suggestion)
                  }}
                  type="button"
                >
                  {suggestion.label || suggestion.summary}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  function renderWorldFeedPanel() {
    const submitDisabled = !worldPromptText.trim() || isPromptBusy
    return (
      <div className="world-feed-surface">
        <aside className="world-feed-prompt-rail" aria-label="Create world updates">
          {renderWikiSubViewToggle()}
          <div className="world-feed-project-card">
            <span className="eyebrow">Create</span>
            <strong>{wikiTitle}</strong>
            <small>{activePromptTurn ? 'World update running' : 'World active'}</small>
          </div>
          <div className="world-feed-composer">
            <label htmlFor="world-feed-composer-input">Prompt this world</label>
            <textarea
              id="world-feed-composer-input"
              disabled={isPromptBusy}
              onChange={(event) => onSetWorldPromptText(event.target.value)}
              onKeyDown={handleWorldFeedComposerKeyDown}
              placeholder="Add a faction, resolve a tension, deepen a character, or change the canon..."
              value={worldPromptText}
            />
            {worldPromptError ? <div className="world-feed-error">{worldPromptError}</div> : null}
            <div className="world-feed-composer-actions">
              <span>{selectedPromptSession?.model ?? 'gpt-5.4-mini'}</span>
              {activePromptTurn ? (
                <button disabled={isPromptCancelling} onClick={() => void onCancelPromptTurn(activePromptTurn.id)} type="button">
                  {isPromptCancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              ) : (
                <button disabled={submitDisabled} onClick={() => void onSubmitWorldPrompt()} type="button">
                  Generate
                </button>
              )}
            </div>
          </div>
          <div className="world-feed-suggestion-list">
            <div className="world-feed-rail-head">
              <span className="eyebrow">Suggestions</span>
              <button onClick={() => void onRefreshPromptSuggestions('feed_manual_refresh')} type="button">Refresh</button>
            </div>
            {activeSessionSuggestions.slice(0, 5).map((suggestion) => (
              <button key={suggestion.id} disabled={isPromptBusy} onClick={() => void onRunPromptSuggestion(suggestion)} type="button">
                <EntityIcon id="plus" />
                <span>{suggestion.label || suggestion.summary}</span>
              </button>
            ))}
            {activeSessionSuggestions.length === 0 ? <small>No active suggestions yet.</small> : null}
          </div>
          <div className="world-feed-session-actions">
            <button onClick={() => onSetHistoryOpen(true)} type="button">Recent sessions</button>
            <button onClick={() => void onStartNewPromptSession()} type="button">New session</button>
          </div>
          {historyOpen ? (
            <div className="world-feed-session-list">
              <div className="world-feed-rail-head">
                <span className="eyebrow">Sessions</span>
                <button onClick={() => onSetHistoryOpen(false)} type="button">Close</button>
              </div>
              {worldPromptSessions.slice(0, 6).map((session) => (
                <button
                  key={session.key}
                  className={selectedPromptSessionKey === session.key ? 'is-active' : ''}
                  onClick={() => {
                    onSelectPromptSessionKey(session.key)
                    onSetHistoryOpen(false)
                  }}
                  type="button"
                >
                  <strong>{session.title || 'World session'}</strong>
                  <small>{activeSuggestionCountBySessionId[session.id] ?? 0} suggestion{(activeSuggestionCountBySessionId[session.id] ?? 0) === 1 ? '' : 's'}</small>
                </button>
              ))}
            </div>
          ) : null}
        </aside>
        <div
          aria-label="Resize create feed rail"
          className="world-grow-resizer world-wiki-resizer world-feed-resizer"
          onDoubleClick={onResetGrowWorkbenchWidth}
          onMouseDown={onGrowWorkbenchResizeStart}
          role="separator"
        />
        <main className="world-feed-main" onScroll={onFeedScroll} ref={worldFeedMainRef}>
          <header className="world-feed-header">
            <div>
              <span className="eyebrow">Live Canon</span>
              <h2>Create</h2>
              <p>Prompt changes and watch canon updates land here as the world evolves.</p>
            </div>
            <div className="world-feed-filter-row" role="tablist" aria-label="World feed filters">
              {WORLD_FEED_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  className={worldFeedFilter === filter.key ? 'is-active' : ''}
                  onClick={() => onSetWorldFeedFilter(filter.key)}
                  type="button"
                >
                  <span>{filter.label}</span>
                  <em>{worldFeedModel.countsByFilter[filter.key]}</em>
                </button>
              ))}
            </div>
          </header>
          <div className="world-feed-timeline">
            {worldFeedGroups.length === 0 ? (
              <div className="world-feed-empty">
                <EntityIcon id="activity" />
                <strong>No feed entries for this filter</strong>
                <span>Prompt from the left rail to create new canon updates.</span>
              </div>
            ) : null}
            {renderedWorldFeedGroups.map((group) => (
              <section key={group.id} className="world-feed-group">
                <div className="world-feed-time-marker"><span>{group.label}</span></div>
                <div className="world-feed-group-list">
                  {group.entries.map(renderWorldFeedCard)}
                </div>
              </section>
            ))}
            {hasDeferredWorldFeedEntries ? (
              <div className="world-feed-load-more" ref={worldFeedLoadMoreRef} aria-live="polite">
                <span className="world-loading-spinner" aria-hidden="true" />
                <small>Loading more feed entries...</small>
                <button onClick={onLoadMoreWorldFeedEntries} type="button">Load more</button>
              </div>
            ) : null}
          </div>
        </main>
        <aside className="world-feed-context-rail" aria-label="Feed context">
          {selectedWorldFeedEntry ? renderWorldFeedDetailPanel(selectedWorldFeedEntry, 'rail') : null}
          <section>
            <div className="world-feed-context-head">
              <span className="eyebrow">AI Suggestions</span>
              <button onClick={() => void onRefreshPromptSuggestions('feed_context_refresh')} type="button">View all</button>
            </div>
            {activeSessionSuggestions.slice(0, 3).map((suggestion) => (
              <button key={suggestion.id} className="world-feed-context-suggestion" disabled={isPromptBusy} onClick={() => void onRunPromptSuggestion(suggestion)} type="button">
                <strong>{suggestion.label || suggestion.summary}</strong>
                <span>{suggestion.summary}</span>
              </button>
            ))}
            {activeSessionSuggestions.length === 0 ? <p>No suggestions queued.</p> : null}
          </section>
          <section>
            <div className="world-feed-context-head">
              <span className="eyebrow">World Snapshot</span>
              <button onClick={() => onSelectWikiSubView('wiki')} type="button">Open Wiki</button>
            </div>
            <div className="world-feed-snapshot-grid">
              <span><strong>{worldEntities.length}</strong><small>Entities</small></span>
              <span><strong>{worldRelationships.length}</strong><small>Links</small></span>
              <span><strong>{activeWorldThreads.length}</strong><small>Threads</small></span>
              <span><strong>{worldResults.length}</strong><small>Outputs</small></span>
            </div>
            <button className="world-feed-context-action" onClick={() => onWorldViewModeChange('graph')} type="button">View World Graph</button>
          </section>
          <section>
            <div className="world-feed-context-head">
              <span className="eyebrow">Relationship Clusters</span>
            </div>
            {feedRelationshipClusters.map((cluster) => (
              <button key={cluster.key} className="world-feed-tension-row" onClick={() => onSelectGraphEdge(cluster.key)} type="button">
                <span><strong>{cluster.source}</strong><em>{cluster.verb}</em><strong>{cluster.target}</strong></span>
                <i style={{ '--cluster-strength': cluster.strength } as CSSProperties} />
              </button>
            ))}
            {feedRelationshipClusters.length === 0 ? <p>No relationship clusters yet.</p> : null}
          </section>
        </aside>
        {selectedWorldFeedEntry ? (
          <div className="world-feed-mobile-detail" role="dialog" aria-modal="false" aria-label="Selected feed entry">
            {renderWorldFeedDetailPanel(selectedWorldFeedEntry, 'sheet')}
          </div>
        ) : null}
      </div>
    )
  }
  return renderWorldFeedPanel()
}
