import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'

import type { WorldEntity, WorldRelationship, WorldResult } from '../../../domain/worldGraph'
import type {
  WorldPromptEvent,
  WorldPromptGenerationJob,
  WorldPromptGenerationJobStep,
  WorldPromptMessage,
  WorldPromptSession,
  WorldPromptSuggestion,
  WorldPromptSuggestionRecord,
  WorldPromptTurn,
} from '../../../domain/worldPrompt'
import type { WorldThread } from '../../../domain/worldThread'
import { iconForWorldEntity, labelForWorldEntity } from '../../../domain/worldGraphHelpers'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import {
  WORLD_FEED_FILTERS,
  buildWorldPromptSessionTokenMeter,
  type WorldFeedEntry,
  type WorldFeedFilter,
} from '../../world/worldPresentation'
import { WorldInlinePromptComposer } from '../prompt/WorldInlinePromptComposer'
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
  sessionEvents: WorldPromptEvent[]
  sessionGenerationJobs: WorldPromptGenerationJob[]
  sessionGenerationJobSteps: WorldPromptGenerationJobStep[]
  sessionMessages: WorldPromptMessage[]
  sessionTurns: WorldPromptTurn[]
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
  onCancelPromptTurn: (turnId: string) => Promise<void> | void
  onFeedScroll: () => void
  onGrowWorkbenchResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void
  onLoadMoreWorldFeedEntries: () => void
  onRefreshPromptSuggestions: (reason: string) => Promise<void> | void
  onRunPromptSuggestion: (suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) => Promise<void> | void
  onSelectGraphEdge: (key: string) => void
  onSelectGraphNode: (key: string) => void
  onSelectPromptSessionKey: (key: string | null) => void
  onSetHistoryOpen: (open: boolean) => void
  onSetWorldFeedFilter: (filter: WorldFeedFilter) => void
  onSetWorldPromptText: (value: string) => void
  onResetGrowWorkbenchWidth: () => void
  onStartNewPromptSession: () => Promise<void> | void
  onSubmitWorldPrompt: () => Promise<void> | void
  renderWikiSubViewToggle: () => ReactNode
  setSelectedWorldFeedEntryId: (entryId: string | null) => void
}

export function WorldFeedPanel({
  activePromptTurn,
  activeSessionSuggestions,
  activeSuggestionCountBySessionId,
  entityByKey,
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
  sessionEvents,
  sessionGenerationJobs,
  sessionGenerationJobSteps,
  sessionMessages,
  sessionTurns,
  worldFeedFilter,
  worldFeedGroups,
  worldFeedLoadMoreRef,
  worldFeedMainRef,
  worldFeedModel,
  worldPromptError,
  worldPromptSessions,
  worldPromptText,
  onCancelPromptTurn,
  onFeedScroll,
  onGrowWorkbenchResizeStart,
  onLoadMoreWorldFeedEntries,
  onRefreshPromptSuggestions,
  onRunPromptSuggestion,
  onSelectGraphEdge,
  onSelectGraphNode,
  onSelectPromptSessionKey,
  onSetHistoryOpen,
  onSetWorldFeedFilter,
  onSetWorldPromptText,
  onResetGrowWorkbenchWidth,
  onStartNewPromptSession,
  onSubmitWorldPrompt,
  renderWikiSubViewToggle,
  setSelectedWorldFeedEntryId,
}: WorldFeedPanelProps) {
  const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false)
  const [collapsedTurnIds, setCollapsedTurnIds] = useState<Set<string>>(() => new Set())
  const [selectedFeedRelationshipDetailKey, setSelectedFeedRelationshipDetailKey] = useState<string | null>(null)
  const detailPopoverRef = useRef<HTMLDivElement | null>(null)
  const activeTurnId = activePromptTurn && ['queued', 'streaming'].includes(activePromptTurn.status) ? activePromptTurn.id : null
  const tokenMeter = useMemo(
    () => buildWorldPromptSessionTokenMeter({
      turns: sessionTurns,
      messages: sessionMessages,
      events: sessionEvents,
      generationJobs: sessionGenerationJobs,
      generationJobSteps: sessionGenerationJobSteps,
      model: selectedPromptSession?.model ?? activePromptTurn?.model ?? sessionTurns.at(-1)?.model ?? null,
    }),
    [activePromptTurn?.model, selectedPromptSession?.model, sessionEvents, sessionGenerationJobSteps, sessionGenerationJobs, sessionMessages, sessionTurns],
  )
  const sessionTurnCountLabel = `${sessionTurns.length} turn${sessionTurns.length === 1 ? '' : 's'}`
  useEffect(() => {
    if (!activeTurnId) return
    setCollapsedTurnIds(() => new Set(
      worldFeedGroups
        .flatMap((group) => group.entries)
        .filter((entry) => (entry.kind === 'turn_update' || entry.kind === 'active_turn') && entry.turnId && entry.turnId !== activeTurnId)
        .map((entry) => entry.turnId as string),
    ))
  }, [activeTurnId, worldFeedGroups])
  useEffect(() => {
    if (!selectedWorldFeedEntry) return
    const handlePointerDown = (event: PointerEvent) => {
      const popover = detailPopoverRef.current
      if (!popover || !(event.target instanceof Node) || popover.contains(event.target)) return
      setSelectedWorldFeedEntryId(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedWorldFeedEntryId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedWorldFeedEntry, setSelectedWorldFeedEntryId])
  useEffect(() => {
    setSelectedFeedRelationshipDetailKey(null)
  }, [selectedWorldFeedEntry?.id])

  function renderWorldFeedThumb(entity: WorldEntity | null, fallbackIcon: EntityIconId = 'content') {
    const imageUrl = entity ? imageUrlByEntityKey.get(entity.key) ?? null : null
    const iconId = entity ? iconForWorldEntity(entity.nodeType) : fallbackIcon
    return (
      <span className="world-feed-thumb" aria-hidden="true">
        {imageUrl ? <img alt="" src={imageUrl} /> : <EntityIcon id={iconId} />}
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

  function relationshipKeysForFeedDetail(entry: WorldFeedEntry) {
    const keys = new Set<string>()
    if (entry.relationshipKey) keys.add(entry.relationshipKey)
    if (Array.isArray(entry.audit?.relationshipKeys)) {
      for (const key of entry.audit.relationshipKeys) {
        if (typeof key === 'string' && key.trim()) keys.add(key)
      }
    }
    if (entry.filter === 'relationships' || entry.kind === 'relationship_created' || entry.kind === 'relationship_updated' || entry.kind === 'relationship_rewired') {
      for (const key of entry.turnLens?.relationshipKeys ?? []) {
        if (key.trim()) keys.add(key)
      }
      for (const key of (entry.fullDetail ?? '').split(/\s+/)) {
        const normalizedKey = key.trim()
        if (normalizedKey && relationshipByKey.has(normalizedKey)) keys.add(normalizedKey)
      }
    }
    return [...keys]
  }

  function relationshipEntityKeysForFeedEntry(entry: WorldFeedEntry) {
    const entityKeys = new Set<string>()
    for (const relationshipKey of relationshipKeysForFeedDetail(entry)) {
      const relationship = relationshipByKey.get(relationshipKey) ?? null
      if (!relationship) continue
      if (relationship.sourceEntityKey) entityKeys.add(relationship.sourceEntityKey)
      if (relationship.targetEntityKey) entityKeys.add(relationship.targetEntityKey)
    }
    return [...entityKeys]
  }

  function renderRelationshipEntityIconStack(entry: WorldFeedEntry) {
    const entityKeys = relationshipEntityKeysForFeedEntry(entry)
    if (entityKeys.length === 0) return null
    const visibleEntityKeys = entityKeys.slice(0, 4)
    const overflowCount = Math.max(0, entityKeys.length - visibleEntityKeys.length)
    return (
      <span className="world-feed-relationship-icons" aria-label={`${entityKeys.length} linked entities`}>
        {visibleEntityKeys.map((entityKey) => (
          <span className="world-feed-relationship-icon" key={entityKey} title={entityByKey.get(entityKey)?.name ?? entityKey}>
            {renderWorldFeedThumb(entityByKey.get(entityKey) ?? null, 'graph')}
          </span>
        ))}
        {overflowCount > 0 ? <span className="world-feed-relationship-overflow">+{overflowCount}</span> : null}
      </span>
    )
  }

  function readRelationshipFullText(relationship: WorldRelationship) {
    const metadata = relationship.metadata && typeof relationship.metadata === 'object' && !Array.isArray(relationship.metadata)
      ? relationship.metadata as Record<string, unknown>
      : {}
    const candidate = [
      relationship.notes,
      metadata.summary,
      metadata.description,
      metadata.context,
      metadata.detail,
      metadata.rationale,
      metadata.canon,
      metadata.relationshipText,
    ].find((value) => typeof value === 'string' && value.trim().length > 0)
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    const sourceName = entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
    const targetName = entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
    return `${sourceName} ${relationship.verb.replace(/_/g, ' ') || 'is linked to'} ${targetName}.`
  }

  function renderRelationshipGraphRow(relationship: WorldRelationship) {
    const source = entityByKey.get(relationship.sourceEntityKey) ?? null
    const target = entityByKey.get(relationship.targetEntityKey) ?? null
    const sourceName = source?.name ?? relationship.sourceEntityKey
    const targetName = target?.name ?? relationship.targetEntityKey
    const selected = selectedFeedRelationshipDetailKey === relationship.key
    const relationshipText = readRelationshipFullText(relationship)
    const relationshipMeta = [
      relationship.direction ? relationship.direction : null,
      relationship.state ? relationship.state : null,
      typeof relationship.strength === 'number' ? `${Math.round(relationship.strength * 100)}% strength` : null,
      typeof relationship.confidence === 'number' ? `${Math.round(relationship.confidence * 100)}% confidence` : null,
    ].filter((value): value is string => Boolean(value))
    return (
      <div className={selected ? 'world-feed-relationship is-selected' : 'world-feed-relationship'} key={relationship.key}>
        <button className="world-feed-relationship-node" onClick={() => onSelectGraphNode(relationship.sourceEntityKey)} type="button">
          {renderWorldFeedThumb(source, 'content')}
          <strong>{sourceName}</strong>
        </button>
        <button
          className="world-feed-relationship-connector"
          onClick={() => {
            setSelectedFeedRelationshipDetailKey((current) => current === relationship.key ? null : relationship.key)
            onSelectGraphEdge(relationship.key)
          }}
          type="button"
          aria-expanded={selected}
        >
          <span className="world-feed-relationship-line" aria-hidden="true"><i /></span>
          <strong>{relationship.verb.replace(/_/g, ' ') || 'linked'}</strong>
        </button>
        <button className="world-feed-relationship-node" onClick={() => onSelectGraphNode(relationship.targetEntityKey)} type="button">
          {renderWorldFeedThumb(target, 'content')}
          <strong>{targetName}</strong>
        </button>
        {selected ? (
          <div className="world-feed-relationship-detail">
            <p>{relationshipText}</p>
            {relationshipMeta.length > 0 ? <small>{relationshipMeta.map((value) => value.replace(/_/g, ' ')).join(' / ')}</small> : null}
          </div>
        ) : null}
      </div>
    )
  }

  function renderWorldFeedDetailCloseButton() {
    return (
      <button
        className="world-feed-detail-close"
        onClick={() => setSelectedWorldFeedEntryId(null)}
        type="button"
        aria-label="Close details"
      >
        <EntityIcon id="close" />
      </button>
    )
  }

  function renderWorldFeedDetailPanel(entry: WorldFeedEntry, variant: 'rail' | 'sheet' = 'rail') {
    const relationship = entry.relationshipKey ? relationshipByKey.get(entry.relationshipKey) ?? null : null
    const detailRelationshipKeys = relationshipKeysForFeedDetail(entry)
    const detailRelationships = detailRelationshipKeys
      .map((key) => relationshipByKey.get(key) ?? null)
      .filter((item): item is WorldRelationship => Boolean(item))
    const shouldShowRelationshipOnlyDetail = detailRelationships.length > 0
      && (entry.filter === 'relationships' || entry.kind === 'relationship_created' || entry.kind === 'relationship_updated' || entry.kind === 'relationship_rewired')
    const connectedEntityKeys = entry.connectedEntityKeys ?? [
      ...(entry.entityKey ? [entry.entityKey] : []),
      ...(relationship ? [relationship.sourceEntityKey, relationship.targetEntityKey] : []),
    ]
    const visibleConnectedEntityKeys = connectedEntityKeys.filter((entityKey, index, list) => (
      entityKey !== entry.entityKey && list.indexOf(entityKey) === index
    ))
    const detailText = entry.fullDetail || entry.detail || 'No extra detail for this feed entry yet.'
    const changeDetails = Array.isArray(entry.audit?.changeDetails)
      ? entry.audit.changeDetails.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
    const prompt = typeof entry.audit?.prompt === 'string' ? entry.audit.prompt : ''
    const assistantSummary = typeof entry.audit?.assistantSummary === 'string' ? entry.audit.assistantSummary : ''
    const shouldShowGenericAuditBlock = Boolean(entry.audit)
      && entry.kind !== 'turn_update'
      && entry.kind !== 'active_turn'
      && changeDetails.length === 0
    const countRows = entry.changeCounts
      ? [
          ['New', entry.changeCounts.addedEntities],
          ['Updated', entry.changeCounts.updatedEntities],
          ['Links', entry.changeCounts.relationships],
          ['Wiki', entry.changeCounts.wiki],
          ['Media', entry.changeCounts.media],
          ['Suggestions', entry.changeCounts.suggestions],
        ].filter(([, count]) => Number(count) > 0)
      : []
    const showDetailParagraph = !(
      entry.kind === 'entity_updated'
      && changeDetails.length > 0
    )
    if (shouldShowRelationshipOnlyDetail) {
      return (
        <section className={`world-feed-detail-panel is-${variant} is-relationships-only`}>
          <div className="world-feed-context-head">
            <span className="eyebrow">Relationships</span>
            {renderWorldFeedDetailCloseButton()}
          </div>
          <div className="world-feed-relationship-list">
            {detailRelationships.map(renderRelationshipGraphRow)}
          </div>
        </section>
      )
    }
    return (
      <section className={`world-feed-detail-panel is-${variant}`}>
        <div className="world-feed-context-head">
          <span className="eyebrow">{entry.kind === 'turn_update' || entry.kind === 'active_turn' ? 'Prompt Details' : 'Selected Entry'}</span>
          {renderWorldFeedDetailCloseButton()}
        </div>
        <div className="world-feed-detail-title">
          {renderWorldFeedThumb(connectedEntityKeys[0] ? entityByKey.get(connectedEntityKeys[0]) ?? null : null, entry.relationshipKey ? 'graph' : 'content')}
          <div>
            <span>{entry.badge}</span>
            <strong>{entry.title}</strong>
          </div>
        </div>
        {prompt ? (
          <div className="world-feed-prompt-detail">
            <span>Prompt</span>
            <p>{prompt}</p>
          </div>
        ) : null}
        {assistantSummary ? (
          <div className="world-feed-prompt-detail">
            <span>Assistant Summary</span>
            <p>{assistantSummary}</p>
          </div>
        ) : null}
        {countRows.length > 0 ? (
          <div className="world-feed-detail-counts">
            {countRows.map(([label, count]) => <span key={label}>{label}<strong>{count}</strong></span>)}
          </div>
        ) : null}
        {changeDetails.length > 0 ? (
          <div className="world-feed-change-highlight">
            <span className="eyebrow">Changed in this turn</span>
            {changeDetails.map((detail) => <strong key={detail}>{detail}</strong>)}
          </div>
        ) : null}
        {showDetailParagraph ? <p>{detailText}</p> : null}
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
        {shouldShowGenericAuditBlock && entry.audit ? (
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
        {visibleConnectedEntityKeys.length > 0 ? (
          <div className="world-feed-detail-links">
            <span className="eyebrow">Connected</span>
            {visibleConnectedEntityKeys.slice(0, 6).map((entityKey) => {
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

  function isTurnCollapsed(turnId: string | null | undefined) {
    return Boolean(turnId && collapsedTurnIds.has(turnId))
  }

  function toggleTurnCollapsed(turnId: string | null | undefined) {
    if (!turnId) return
    setCollapsedTurnIds((current) => {
      const next = new Set(current)
      if (next.has(turnId)) next.delete(turnId)
      else next.add(turnId)
      return next
    })
  }

  function renderFeedThinkingHeader() {
    const showOptimisticThinking = isPromptBusy || Boolean(activeTurnId && activePromptTurn)
    if (!showOptimisticThinking) return null
    const promptPreview = activePromptTurn?.prompt || worldPromptText.trim() || 'Sending prompt to the world worker...'
    const statusLabel = activeTurnId ? 'Thinking' : 'Starting'
    const title = activeTurnId ? 'Generating world update' : 'Starting world update'
    return (
      <div className="world-feed-thinking-header" role="status" aria-live="polite">
        <div className="world-feed-thinking-brain" aria-hidden="true">
          <img src="/landing/hero-world-core-v4.png" alt="" />
        </div>
        <div>
          <span className="eyebrow">{statusLabel}</span>
          <strong>{title}</strong>
          <small>{promptPreview}</small>
        </div>
        <span className="world-feed-thinking-spinner" aria-hidden="true" />
      </div>
    )
  }

  const starterPrompts = [
    'Deepen the main character with a sharper flaw, secret, and relationship pressure.',
    'Add three story tensions that connect the cast, places, and factions.',
    'Flesh out the next chapter with a clear dramatic question and consequence.',
  ]
  const emptyFeedSuggestions = activeSessionSuggestions.slice(0, 4)

  function focusFeedComposer() {
    window.requestAnimationFrame(() => {
      const composer = document.getElementById('world-feed-composer-input')
      if (composer instanceof HTMLTextAreaElement) {
        composer.focus()
      }
    })
  }

  function renderEmptyFeedState() {
    const isFreshChat = sessionTurns.length === 0 && worldFeedFilter === 'all'
    if (!isFreshChat) {
      return (
        <div className="world-feed-empty is-filter-empty">
          <strong>No feed entries for this filter</strong>
          <span>Try another filter or prompt from the left rail to create new canon updates.</span>
        </div>
      )
    }
    return (
      <div className="world-feed-empty is-new-chat">
        <div className="world-feed-empty-copy">
          <span className="eyebrow">New chat</span>
          <strong>Prompt the world to build on what exists.</strong>
          <p>
            Ask for a new chapter, a sharper relationship, a missing faction, or a contradiction to resolve.
            Each turn will appear here as a compact canon update with the entities it changed underneath.
          </p>
        </div>
        <div className="world-feed-empty-suggestions">
          <span>{emptyFeedSuggestions.length > 0 ? 'Suggested next moves' : 'Try one of these'}</span>
          {emptyFeedSuggestions.length > 0 ? (
            emptyFeedSuggestions.map((suggestion) => (
              <button key={suggestion.id} disabled={isPromptBusy} onClick={() => void onRunPromptSuggestion(suggestion)} type="button">
                <EntityIcon id="plus" />
                <strong>{suggestion.label || suggestion.summary}</strong>
                {suggestion.prompt ? <small>{suggestion.prompt}</small> : null}
              </button>
            ))
          ) : (
            starterPrompts.map((prompt) => (
              <button key={prompt} disabled={isPromptBusy} onClick={() => {
                onSetWorldPromptText(prompt)
                focusFeedComposer()
              }} type="button">
                <EntityIcon id="send" />
                <strong>{prompt}</strong>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  function renderWorldFeedCard(entry: WorldFeedEntry) {
    const entity = entry.entityKey ? entityByKey.get(entry.entityKey) ?? null : null
    const relationship = entry.relationshipKey ? relationshipByKey.get(entry.relationshipKey) ?? null : null
    const isTurnUpdate = entry.kind === 'turn_update' || entry.kind === 'active_turn'
    const isChildEntry = Boolean(entry.parentTurnId)
    const parentCollapsed = isChildEntry && isTurnCollapsed(entry.parentTurnId)
    if (parentCollapsed) return null
    const collapsed = isTurnUpdate && isTurnCollapsed(entry.turnId)
    const primaryThumbEntity = entity ?? (entry.thumbnailEntityKeys?.[0] ? entityByKey.get(entry.thumbnailEntityKeys[0]) ?? null : null)
    const relationshipIconStack = relationship ? renderRelationshipEntityIconStack(entry) : null
    const isSelected = selectedWorldFeedEntry?.id === entry.id
    const isNew = newWorldFeedEntryIds.has(entry.id)
    const displayDetail = entry.compactDetail ?? entry.detail
    const inspectEntry = () => setSelectedWorldFeedEntryId(entry.id)
    const activateEntry = () => {
      if (isTurnUpdate) {
        toggleTurnCollapsed(entry.turnId)
      } else {
        inspectEntry()
      }
    }
    const changeCounts = entry.changeCounts
    const countPills = changeCounts
      ? [
          changeCounts.addedEntities > 0 ? `${changeCounts.addedEntities} new` : null,
          changeCounts.updatedEntities > 0 ? `${changeCounts.updatedEntities} updated` : null,
          changeCounts.relationships > 0 ? `${changeCounts.relationships} links` : null,
          changeCounts.wiki > 0 ? `${changeCounts.wiki} wiki` : null,
          changeCounts.media > 0 ? `${changeCounts.media} media` : null,
        ].filter((value): value is string => Boolean(value))
      : []
    const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      activateEntry()
    }
    const turnTime = formatWorldFeedTurnTimestamp(entry.createdAt)
    const feedFocusActive = isPromptBusy || Boolean(activeTurnId)
    const entryBelongsToActiveTurn = Boolean(
      activeTurnId
      && (entry.turnId === activeTurnId || entry.parentTurnId === activeTurnId),
    )
    const dimmedDuringActiveTurn = Boolean(feedFocusActive && !entryBelongsToActiveTurn)
    if (entry.kind === 'turn_summary') {
      return (
        <article
          key={entry.id}
          className={`world-feed-turn-divider${dimmedDuringActiveTurn ? ' is-background-during-active-turn' : ''}${isSelected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
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
        className={`world-feed-row is-${entry.kind} tone-${entry.tone ?? 'normal'}${isTurnUpdate ? ' is-turn-row' : ''}${isChildEntry ? ' is-child-entry' : ''}${entry.kind === 'suggestion' && isChildEntry ? ' is-suggestion-child' : ''}${entry.entityKey ? ' is-entity-row' : ''}${relationshipIconStack ? ' is-relationship-row' : ''}${dimmedDuringActiveTurn ? ' is-background-during-active-turn' : ''}${collapsed ? ' is-collapsed' : ''}${isSelected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
        onClick={activateEntry}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
      >
        <div className="world-feed-row-main">
          {isTurnUpdate ? (
            <>
              <span className="world-feed-row-icon is-prompt"><EntityIcon id={entry.kind === 'active_turn' ? 'activity' : 'send'} /></span>
              <div className="world-feed-row-copy">
                <div className="world-feed-row-topline">
                  <span className="world-feed-row-badge">{entry.kind === 'active_turn' ? entry.title : 'Prompt'}</span>
                  {turnTime.time ? <em>{turnTime.time}</em> : null}
                  {entry.kind === 'active_turn' ? <span className="world-feed-row-state">Running</span> : null}
                  {collapsed ? <span className="world-feed-row-state">Collapsed</span> : null}
                </div>
                <strong>{entry.promptExcerpt || entry.title}</strong>
                {displayDetail ? <p>{displayDetail}</p> : null}
              </div>
              <div className="world-feed-row-counts">
                {countPills.length > 0 ? countPills.slice(0, 4).map((pill) => <span key={pill}>{pill}</span>) : <span>{entry.badge}</span>}
              </div>
            </>
          ) : (
            <>
              {relationshipIconStack ?? renderWorldFeedThumb(primaryThumbEntity, entry.kind === 'media_job' ? 'activity' : relationship ? 'graph' : 'content')}
              <div className="world-feed-row-copy">
                <div className="world-feed-row-topline">
                  <span className="world-feed-row-badge">{entry.badge}</span>
                  {entry.entityNodeType ? <em>{labelForWorldEntity(entry.entityNodeType)}</em> : null}
                </div>
                <strong>{entry.title}</strong>
                {displayDetail ? <p>{displayDetail}</p> : null}
              </div>
              <span className="world-feed-row-change">{entry.kind === 'entity_created' ? 'New' : entry.kind === 'entity_updated' ? 'Updated' : entry.filter}</span>
            </>
          )}
        </div>
        <div className="world-feed-row-actions" aria-label="Feed row actions">
          {isTurnUpdate ? (
            <button onClick={(event) => {
              event.stopPropagation()
              inspectEntry()
            }} type="button" aria-label="Open prompt turn details" title="Details">
              <EntityIcon id="info" />
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  function renderWorldFeedPanel() {
    return (
      <div className="world-feed-surface">
        <aside className="world-feed-prompt-rail" aria-label="Feed world updates">
          {renderWikiSubViewToggle()}
          <div className="world-feed-prompt-head">
            <div className="world-feed-prompt-status">
              <span>{sessionTurnCountLabel}</span>
              <span className="world-prompt-token-shell">
                <button
                  className="world-prompt-token-meter"
                  onClick={() => setTokenDetailsOpen((open) => !open)}
                  title={tokenMeter.title}
                  type="button"
                >
                  {tokenMeter.label} tokens
                </button>
                {tokenDetailsOpen ? (
                  <span className="world-prompt-token-popover">
                    <strong>{tokenMeter.estimated ? 'Estimated usage' : 'Provider usage'}</strong>
                    <span>Session {tokenMeter.usedTokens.toLocaleString()} / {tokenMeter.tokenLimit.toLocaleString()}</span>
                    <span>Current turn {tokenMeter.currentTurnTokens.toLocaleString()}</span>
                    <span>Last step {tokenMeter.lastStepTokens.toLocaleString()}</span>
                    {tokenMeter.rows.slice(0, 6).map((row, index) => (
                      <span key={`${row.label}-${index}`}>{row.label}: {row.inputTokens.toLocaleString()} in / {row.outputTokens.toLocaleString()} out</span>
                    ))}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="world-prompt-head-actions">
              <button className="world-prompt-icon-button" onClick={() => onSetHistoryOpen(true)} type="button" aria-label="Open history">
                <EntityIcon id="activity" />
              </button>
              <button className="world-prompt-icon-button" onClick={() => void onStartNewPromptSession()} type="button" aria-label="Start new chat">
                <EntityIcon id="plus" />
              </button>
            </div>
          </div>
          <div className="world-feed-suggestion-list">
            <div className="world-feed-rail-head">
              <span className="eyebrow">Suggestion sample</span>
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
          <WorldInlinePromptComposer
            activeTurnId={activePromptTurn?.id ?? null}
            busy={isPromptBusy}
            cancelBusy={isPromptCancelling}
            className="world-feed-composer"
            error={worldPromptError}
            id="world-feed-composer-input"
            label="Prompt this world"
            modelLabel={selectedPromptSession?.model ?? 'gpt-5.4-mini'}
            onCancelTurn={onCancelPromptTurn}
            onChange={onSetWorldPromptText}
            onSubmit={onSubmitWorldPrompt}
            placeholder="Add a faction, resolve a tension, deepen a character, or change the canon..."
            rows={5}
            value={worldPromptText}
          />
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
          aria-label="Resize feed rail"
          className="world-grow-resizer world-wiki-resizer world-feed-resizer"
          onDoubleClick={onResetGrowWorkbenchWidth}
          onMouseDown={onGrowWorkbenchResizeStart}
          role="separator"
        />
        <main className="world-feed-main" onScroll={onFeedScroll} ref={worldFeedMainRef}>
          <header className="world-feed-header">
            <h2>Live Canon</h2>
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
          {renderFeedThinkingHeader()}
          <div className="world-feed-timeline">
            {worldFeedGroups.length === 0 ? renderEmptyFeedState() : null}
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
        {selectedWorldFeedEntry ? (
          <div className="world-feed-detail-popover" ref={detailPopoverRef} role="dialog" aria-modal="false" aria-label="Selected feed entry">
            {renderWorldFeedDetailPanel(selectedWorldFeedEntry, 'sheet')}
          </div>
        ) : null}
      </div>
    )
  }
  return renderWorldFeedPanel()
}
