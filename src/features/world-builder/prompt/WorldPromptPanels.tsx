import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

import type { ProjectContext } from '../../../domain/projectContext'
import type { WorldEntity, WorldView } from '../../../domain/worldGraph'
import { iconForWorldEntity } from '../../../domain/worldGraphHelpers'
import {
  worldPromptEventPayloadSchema,
  type PromptToWorldOp,
  type WorldPromptEvent,
  type WorldPromptGenerationJob,
  type WorldPromptGenerationJobStep,
  type WorldPromptMessage,
  type WorldPromptSession,
  type WorldPromptSuggestion,
  type WorldPromptSuggestionRecord,
  type WorldPromptTurn,
} from '../../../domain/worldPrompt'
import type { WorldThread } from '../../../domain/worldThread'
import { EntityIcon } from '../../../shared/entityIcons'
import {
  activePreviewForTurn,
  buildWorldPromptRailViewModel,
  buildWorldPromptSessionTokenMeter,
  buildWorldPromptTranscriptEntries as buildWorldPromptTranscriptEntriesModel,
  type WorldPromptTranscriptEntry,
  type WorldPromptTurnLens,
} from '../../world/worldPresentation'
import { getWorldPromptSmartPrompts, getWorldPromptStarterCards, getWorldPromptTypeAccelerators } from './promptCatalog'
const WORLD_PROMPT_LOG_DETAIL_LIMIT = 180
const WORLD_PROMPT_LOG_MESSAGE_LIMIT = 360

type WorldPromptExpandedLogEntry = {
  title: string
  body: string
  meta?: string[]
}

function compactWorldPromptLogText(text: string, limit = WORLD_PROMPT_LOG_DETAIL_LIMIT) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return text
  return `${normalized.slice(0, limit).trimEnd()}...`
}

function isLongWorldPromptLogText(text: string | null | undefined, limit = WORLD_PROMPT_LOG_DETAIL_LIMIT) {
  return Boolean(text && text.replace(/\s+/g, ' ').trim().length > limit)
}

function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity': {
      const displayName =
        typeof op.metadata?.displayName === 'string' && op.metadata.displayName.trim()
          ? op.metadata.displayName.trim()
          : op.payload.entity.name
      return `Add or extend ${displayName}`
    }
    case 'update_entity':
      return `Update ${op.payload.targetEntityKey}`
    case 'upsert_relationship':
      return `Link ${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'source'} to ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'target'}`
    case 'update_relationship':
      return `Update relationship ${op.payload.targetRelationshipKey}`
    case 'create_derived_result':
      return `Create ${op.payload.title ?? op.payload.operatorType}`
    case 'queue_image_generation':
      return 'Queue image generation'
    case 'queue_cinematic_generation':
      return 'Queue cinematic generation'
    case 'update_world_wiki_metadata':
      return op.payload.target === 'view' ? 'Update wiki page metadata' : 'Update world wiki overview'
    case 'assistant_note':
      return op.payload.message
  }
}

function promptSuggestionImpactLabel(suggestion: WorldPromptSuggestion) {
  const parts = [
    suggestion.estimatedNodeCount > 0 ? `+${suggestion.estimatedNodeCount} nodes` : null,
    suggestion.estimatedEdgeCount > 0 ? `+${suggestion.estimatedEdgeCount} links` : null,
    suggestion.willQueueImages ? 'images' : null,
    suggestion.willQueueCinematics ? 'cinematics' : null,
  ].filter(Boolean)
  return parts.join(' � ')
}
function LegacyWorldPromptChatPanel({
  activePromptPreview: _activePromptPreview,
  activePromptTurn,
  busy,
  cancelBusy,
  promptText,
  promptError,
  entityByKey,
  selectedSession,
  selectedThreadKey,
  sessionEvents,
  sessionMessages,
  sessionTurns,
  worldThreads,
  worldPromptSessions,
  onApplyPreview: _onApplyPreview,
  onApproveOp: _onApproveOp,
  variant,
  onCancelTurn,
  onChangePromptText,
  onOpenEntityComposer,
  onOpenLegacy,
  onRejectOp: _onRejectOp,
  onResolveThread,
  onRunSuggestion,
  onSelectSession,
  onSelectThread,
  onSubmit,
  onParkThread,
  onToggleDerivedLayer,
  showDerivedLayer,
}: {
  activePromptPreview: ReturnType<typeof activePreviewForTurn>
  activePromptTurn: WorldPromptTurn | null
  busy: boolean
  cancelBusy: boolean
  promptText: string
  promptError: string | null
  entityByKey: Map<string, WorldEntity>
  selectedEntity: WorldEntity | null
  selectedSession: WorldPromptSession | null
  selectedThreadKey: string | null
  selectedView: WorldView
  sessionEvents: WorldPromptEvent[]
  sessionMessages: WorldPromptMessage[]
  sessionTurns: WorldPromptTurn[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  onApplyPreview: (turnId: string) => Promise<void> | void
  onApproveOp: (turnId: string, opId: string) => Promise<void> | void
  variant: 'drawer' | 'grow'
  onCancelTurn: (turnId: string) => Promise<void> | void
  onChangePromptText: (value: string) => void
  onOpenEntityComposer: () => void
  onOpenLegacy: () => void
  onRejectOp: (turnId: string, opId: string) => Promise<void> | void
  onResolveThread: (threadKey: string) => Promise<void> | void
  onRunSuggestion: (suggestion: WorldPromptSuggestion) => Promise<void> | void
  onSelectSession: (key: string | null) => void
  onSelectThread: (threadKey: string | null) => void
  onSubmit: (promptOverride?: string) => Promise<void> | void
  onParkThread: (threadKey: string) => Promise<void> | void
  onToggleDerivedLayer: () => void
  showDerivedLayer: boolean
}) {
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const transcriptEntries = useMemo(
    () => buildWorldPromptTranscriptEntriesModel({
      events: sessionEvents,
      messages: sessionMessages,
      entityByKey,
      turns: sessionTurns,
    }),
    [entityByKey, sessionEvents, sessionMessages, sessionTurns],
  )
  const canCancelTurn = Boolean(activePromptTurn && ['queued', 'streaming'].includes(activePromptTurn.status))
  const railView = useMemo(
    () => buildWorldPromptRailViewModel({
      activeTurn: activePromptTurn,
      turns: sessionTurns,
      events: sessionEvents,
      entityByKey,
      promptError,
    }),
    [activePromptTurn, entityByKey, promptError, sessionEvents, sessionTurns],
  )
  const activeSuggestionRowId = useMemo(() => {
    for (const entry of [...transcriptEntries].reverse()) {
      if (entry.kind === 'suggestion_set' || entry.kind === 'clarification_question') {
        return entry.id
      }
    }
    return null
  }, [transcriptEntries])

  useEffect(() => {
    if (!stickToBottom) return
    transcriptEndRef.current?.scrollIntoView({ block: 'end', behavior: activePromptTurn ? 'smooth' : 'auto' })
  }, [activePromptTurn, stickToBottom, transcriptEntries.length])

  function handleTranscriptScroll() {
    const element = transcriptRef.current
    if (!element) return
    const threshold = 56
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setStickToBottom(distanceFromBottom <= threshold)
  }

  const recentTurns = useMemo(
    () => [...sessionTurns].reverse().slice(0, 6),
    [sessionTurns],
  )
  const recentEvents = useMemo(
    () => sessionEvents.slice(-8).reverse().map((event) => {
      const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
      const label = parsedPayload.success && parsedPayload.data.op
        ? describePromptOp(parsedPayload.data.op)
        : parsedPayload.success && parsedPayload.data.note
          ? parsedPayload.data.note
          : event.eventType
      return {
        id: event.id,
        title: event.eventType.replace(/_/g, ' '),
        detail: label,
        sequence: event.sequence,
      }
    }),
    [sessionEvents],
  )
  const suggestionSectionLabel = railView.state === 'needs_clarification' ? 'Clarify to continue' : 'Suggested next moves'
  const composerLabel = railView.primaryActionKind === 'continue'
    ? 'Continue building'
    : railView.primaryActionKind === 'generate'
      ? 'Generate'
      : 'Use prompt'
  const flowTurnCountLabel = `${sessionTurns.length} turn${sessionTurns.length === 1 ? '' : 's'}`
  return (
    <div className={`world-prompt-chat-shell${variant === 'grow' ? ' is-grow' : ''}`}>
      <div className="world-prompt-chat-head world-prompt-flow-head">
        <div className="world-prompt-chat-meta">
          <div className="world-prompt-chat-subline is-compact">
            <span>{flowTurnCountLabel}</span>
          </div>
        </div>
        <div className="world-prompt-head-actions">
          <button className="ghost-button compact" onClick={onOpenEntityComposer} type="button">Manual Add</button>
        </div>
      </div>

      <div className="world-prompt-composer">
        <label className="world-prompt-composer-label">
          <span className="eyebrow">Prompt</span>
          <span>Describe the next entity, relationship, conflict, or lore change.</span>
        </label>
        <textarea
          rows={variant === 'grow' ? 4 : 3}
          placeholder="Add two rival siblings, establish their shared history, and give one a ruined observatory as a base."
          value={promptText}
          onChange={(event) => onChangePromptText(event.target.value)}
        />
        <div className="world-prompt-composer-actions">
          {canCancelTurn ? (
            <button className="ghost-button compact" disabled={cancelBusy} onClick={() => void onCancelTurn(activePromptTurn!.id)} type="button">
              Cancel Turn
            </button>
          ) : (
            <span className="inline-note">{busy ? 'Working...' : 'This prompt continues in the current session stream.'}</span>
          )}
          <button className={railView.primaryActionKind === 'generate' || railView.primaryActionKind === 'continue' ? 'primary-button compact' : 'ghost-button compact'} disabled={busy || !promptText.trim()} onClick={() => void onSubmit()} type="button">
            {busy ? 'Generating...' : composerLabel}
          </button>
        </div>
      </div>

      <div className={`world-prompt-state-card is-${railView.state}`}>
        <div className="world-prompt-state-head">
          <div>
            <span className="eyebrow">{railView.statusLabel}</span>
            <h4>{railView.title}</h4>
          </div>
          {railView.latestPlannerStatus ? <span className="chip">{railView.latestPlannerStatus}</span> : null}
        </div>
        <p>{railView.detail}</p>

        {(railView.appliedEntities.length > 0 || railView.appliedRelationships.length > 0 || railView.queuedLabels.length > 0) ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">Graph Changes Applied</span>
            <div className="world-prompt-change-list">
              {railView.appliedEntities.slice(0, 4).map((label, index) => <span key={`entity:${index}:${label}`} className="chip">{label}</span>)}
              {railView.appliedRelationships.slice(0, 3).map((label, index) => <span key={`relationship:${index}:${label}`} className="chip">{label}</span>)}
              {railView.queuedLabels.slice(0, 2).map((label, index) => <span key={`queue:${index}:${label}`} className="chip">{label}</span>)}
            </div>
          </div>
        ) : null}

        {railView.latestSuggestions.length > 0 && railView.state === 'completed' ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">{suggestionSectionLabel}</span>
            <div className="world-prompt-inline-choices">
              {railView.latestSuggestions.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion.id}
                  className={`world-prompt-suggestion-card${suggestion.style === 'primary' ? ' is-primary' : ''}`}
                  disabled={busy}
                  onClick={() => void onRunSuggestion(suggestion)}
                  type="button"
                >
                  <strong>{suggestion.label}</strong>
                  {suggestion.summary ? <span>{suggestion.summary}</span> : null}
                  {promptSuggestionImpactLabel(suggestion) ? <small>{promptSuggestionImpactLabel(suggestion)}</small> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {railView.state === 'idle' ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">What you can do</span>
            <div className="world-prompt-change-list">
              <span className="chip">Create a protagonist</span>
              <span className="chip">Establish a city or faction</span>
              <span className="chip">Add a conflict or prophecy</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="world-prompt-transcript-shell">
        <div className="world-prompt-transcript-head">
          <span className="eyebrow">Creation Stream</span>
          <span className="inline-note">{transcriptEntries.length} entries</span>
        </div>
        <div className="world-prompt-transcript" onScroll={handleTranscriptScroll} ref={transcriptRef}>
          {transcriptEntries.length === 0 && !promptError ? (
            <div className="world-prompt-empty">
              <span className="eyebrow">Ready</span>
              <strong>Describe the first characters, places, lore, or conflicts you want in this world.</strong>
            </div>
          ) : null}
          {transcriptEntries.map((entry) => {
            if (entry.kind === 'suggestion_set' || entry.kind === 'clarification_question') {
              const choiceTone = entry.kind === 'clarification_question' ? ' is-clarify' : ''
              return (
                <div key={entry.id} className={`world-prompt-row world-prompt-row-system${choiceTone}`}>
                  <span className="world-prompt-row-label">
                    {entry.kind === 'clarification_question' ? 'Clarification Required' : entry.label ?? 'Next move'}
                  </span>
                  <div className="world-prompt-inline-choices">
                    {entry.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        className={`world-prompt-suggestion-card${suggestion.style === 'primary' ? ' is-primary' : ''}`}
                        disabled={busy}
                        onClick={() => void onRunSuggestion(suggestion)}
                        type="button"
                      >
                        <strong>{suggestion.label}</strong>
                        {suggestion.summary ? <span>{suggestion.summary}</span> : null}
                        {promptSuggestionImpactLabel(suggestion) ? <small>{promptSuggestionImpactLabel(suggestion)}</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            if (entry.kind === 'user_message' || entry.kind === 'assistant_message') {
              return (
                <div key={entry.id} className={`world-prompt-row ${entry.kind === 'user_message' ? 'world-prompt-row-user' : 'world-prompt-row-assistant'}`}>
                  <span className="world-prompt-row-label">{entry.kind === 'user_message' ? 'You' : 'GraphCore'}</span>
                  <div className={`world-prompt-bubble${entry.pending ? ' is-pending' : ''}`}>
                    {entry.content}
                  </div>
                </div>
              )
            }

            if (entry.kind === 'system_status' || entry.kind === 'entity_created' || entry.kind === 'entity_replaced' || entry.kind === 'relationship_created' || entry.kind === 'queue_started') {
              return (
                <div
                  key={entry.id}
                  className={`world-prompt-row world-prompt-row-system${entry.kind === 'system_status' && entry.tone === 'error' ? ' is-error' : ''}`}
                >
                  <span className="world-prompt-row-label">{entry.label}</span>
                  {entry.detail ? <div className="world-prompt-line">{entry.detail}</div> : null}
                </div>
              )
            }

            return null
          })}
          {promptError ? (
            <div className="world-prompt-row world-prompt-row-system is-error">
              <span className="world-prompt-row-label">Prompt failed</span>
              <div className="world-prompt-line">Open the browser console for the full debug error.</div>
            </div>
          ) : null}
          {!activePromptTurn && activeSuggestionRowId ? (
            <div className="world-prompt-row world-prompt-row-system">
              <span className="world-prompt-row-label">Continue</span>
              <div className="world-prompt-line">Choose a next move or type a follow-up below.</div>
            </div>
          ) : null}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <div className="world-prompt-drawers">
        <details className="world-prompt-context-drawer">
          <summary>
            <span>History</span>
            <span className="chip">{sessionTurns.length} turns</span>
          </summary>
          <div className="world-prompt-drawer-body">
            <label className="world-prompt-session-select">
              <span>Session</span>
              <select value={selectedSession?.key ?? ''} onChange={(event) => onSelectSession(event.target.value || null)}>
                {worldPromptSessions.length === 0 ? <option value="">Default session</option> : null}
                {worldPromptSessions.map((session) => (
                  <option key={session.id} value={session.key}>{session.title}</option>
                ))}
              </select>
            </label>
            <div className="world-prompt-history-list">
              {recentTurns.length === 0 ? <div className="inline-note">No turns in this session yet.</div> : null}
              {recentTurns.map((turn) => (
                <div key={turn.id} className="world-prompt-history-item">
                  <strong>{turn.prompt}</strong>
                  <span>{turn.status}</span>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="world-prompt-context-drawer">
          <summary>
            <span>Threads</span>
            <span className="chip">{worldThreads.length}</span>
          </summary>
          <div className="world-prompt-drawer-body">
            {worldThreads.length === 0 ? <div className="inline-note">No active threads yet. Unresolved tensions will surface here.</div> : null}
            <div className="world-thread-list">
              {worldThreads.map((thread) => (
                <div key={thread.key} className={thread.key === selectedThreadKey ? 'schema-card world-thread-card is-selected' : 'schema-card world-thread-card'}>
                  <div className="schema-card-head">
                    <div>
                      <strong>{thread.title}</strong>
                      <div className="inline-note">{thread.priority} priority</div>
                    </div>
                    <button className="ghost-button compact" onClick={() => onSelectThread(thread.key === selectedThreadKey ? null : thread.key)} type="button">
                      {thread.key === selectedThreadKey ? 'Focused' : 'Focus'}
                    </button>
                  </div>
                  {thread.summary ? <div className="inline-note">{thread.summary}</div> : null}
                  <div className="world-inspector-actions">
                    <button className="ghost-button compact" onClick={() => void onParkThread(thread.key)} type="button">Park</button>
                    <button className="primary-button compact" onClick={() => void onResolveThread(thread.key)} type="button">Resolve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="world-prompt-context-drawer">
          <summary>
            <span>Workspace</span>
            <span className="chip">{showDerivedLayer ? 'Derived on' : 'Derived off'}</span>
          </summary>
          <div className="world-prompt-drawer-body">
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={onOpenLegacy} type="button">Legacy Editor</button>
              <button className={showDerivedLayer ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={onToggleDerivedLayer} type="button">
                Derived Layer
              </button>
            </div>
            <div className="world-prompt-history-list">
              {recentEvents.length === 0 ? <div className="inline-note">No activity yet.</div> : null}
              {recentEvents.map((event) => (
                <div key={event.id} className="world-prompt-history-item">
                  <strong>{event.title}</strong>
                  <span>#{event.sequence} · {event.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}

void LegacyWorldPromptChatPanel

export function WorldPromptChatPanel({
  activePromptPreview: _activePromptPreview,
  activePromptTurn,
  busy,
  cancelBusy,
  promptText,
  promptError,
  projectContext,
  entityByKey,
  selectedEntity,
  selectedSession,
  selectedSessionKey,
  selectedThreadKey,
  selectedView,
  sessionEvents,
  sessionMessages,
  sessionSuggestions,
  sessionTurns,
  sessionGenerationJobs,
  sessionGenerationJobSteps,
  sessionSuggestionCountBySessionId,
  turnLensByTurnId,
  activeTurnLensId,
  worldPromptTurns,
  worldPromptSessions,
  onApplyPreview: _onApplyPreview,
  onApproveOp: _onApproveOp,
  onCancelTurn,
  onChangePromptText,
  onDismissSuggestion: _onDismissSuggestion,
  onRejectOp: _onRejectOp,
  onRunSuggestion,
  onContinueWithoutSuggestion,
  onSelectSession,
  onStartNewSession,
  onSubmit,
  onSelectGraphNode,
  onSelectGraphEdge,
  onOpenTurnLens,
  onOpenHistory,
  onCloseHistory,
  historyOpen,
  variant,
  headerActionEnd = null,
}: {
  activePromptPreview: ReturnType<typeof activePreviewForTurn>
  activePromptTurn: WorldPromptTurn | null
  busy: boolean
  cancelBusy: boolean
  promptText: string
  promptError: string | null
  projectContext: ProjectContext | null
  entityByKey: Map<string, WorldEntity>
  selectedEntity: WorldEntity | null
  selectedSession: WorldPromptSession | null
  selectedSessionKey: string | null
  selectedThreadKey: string | null
  selectedView: WorldView
  sessionEvents: WorldPromptEvent[]
  sessionMessages: WorldPromptMessage[]
  sessionSuggestions: WorldPromptSuggestionRecord[]
  sessionTurns: WorldPromptTurn[]
  sessionGenerationJobs: WorldPromptGenerationJob[]
  sessionGenerationJobSteps: WorldPromptGenerationJobStep[]
  sessionSuggestionCountBySessionId: Record<string, number>
  turnLensByTurnId: Map<string, WorldPromptTurnLens>
  activeTurnLensId: string | null
  worldPromptTurns: WorldPromptTurn[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  onApplyPreview: (turnId: string) => Promise<void> | void
  onApproveOp: (turnId: string, opId: string) => Promise<void> | void
  onCancelTurn: (turnId: string) => Promise<void> | void
  onChangePromptText: (value: string) => void
  onDismissSuggestion: (suggestionId: string) => Promise<void> | void
  onRejectOp: (turnId: string, opId: string) => Promise<void> | void
  onRunSuggestion: (suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) => Promise<void> | void
  onContinueWithoutSuggestion: () => void
  onSelectSession: (key: string | null) => void
  onStartNewSession: () => void
  onSubmit: (promptOverride?: string) => Promise<void> | void
  onSelectGraphNode: (key: string) => void
  onSelectGraphEdge: (key: string) => void
  onOpenTurnLens: (lens: WorldPromptTurnLens) => void
  onCloseTurnLens: () => void
  onOpenHistory: () => void
  onCloseHistory: () => void
  historyOpen: boolean
  variant: 'drawer' | 'grow'
  headerActionEnd?: ReactNode
}) {
  const hiddenTranscriptKinds = new Set<WorldPromptTranscriptEntry['kind']>([
    'suggestion_set',
    'clarification_question',
    'clarification_answer',
    'continuation_without_suggestion',
    'planner_progress',
  ])
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const plannerFailureLogKeyRef = useRef<string | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [suppressedSuggestionSignature, setSuppressedSuggestionSignature] = useState<string | null>(null)
  const [expandedLogEntry, setExpandedLogEntry] = useState<WorldPromptExpandedLogEntry | null>(null)
  const transcriptEntries = useMemo(
    () => buildWorldPromptTranscriptEntriesModel({
      events: sessionEvents,
      messages: sessionMessages,
      entityByKey,
      turns: sessionTurns,
    }),
    [entityByKey, sessionEvents, sessionMessages, sessionTurns],
  )
  const canCancelTurn = Boolean(activePromptTurn && ['queued', 'streaming'].includes(activePromptTurn.status))
  const railView = useMemo(
    () => buildWorldPromptRailViewModel({
      activeTurn: activePromptTurn,
      turns: sessionTurns,
      events: sessionEvents,
      entityByKey,
      promptError,
    }),
    [activePromptTurn, entityByKey, promptError, sessionEvents, sessionTurns],
  )
  const transcriptStream = useMemo(() => {
    const entries = [...transcriptEntries]
    if (
      sessionSuggestions.length > 0
      && !entries.some((entry) => entry.kind === 'suggestion_set' || entry.kind === 'clarification_question')
    ) {
      const hasClarification = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'clarification')
      entries.push({
        id: `persisted-suggestions:${selectedSession?.id ?? selectedSessionKey ?? 'session'}`,
        createdAt: sessionSuggestions[0]?.updatedAt ?? selectedSession?.updatedAt ?? new Date().toISOString(),
        kind: hasClarification ? 'clarification_question' : 'suggestion_set',
        label: hasClarification ? 'Clarification required' : 'Next moves',
        suggestions: sessionSuggestions.map((suggestion) => ({
          id: suggestion.id,
          label: suggestion.label,
          prompt: suggestion.prompt,
          kind: suggestion.kind,
          style: suggestion.style,
          source: suggestion.source,
          threadKey: suggestion.threadKey,
          summary: suggestion.summary || (typeof suggestion.metadata?.generatedReason === 'string' ? suggestion.metadata.generatedReason : ''),
          estimatedNodeCount: suggestion.estimatedNodeCount,
          estimatedEdgeCount: suggestion.estimatedEdgeCount,
          willQueueImages: suggestion.willQueueImages,
          willQueueCinematics: suggestion.willQueueCinematics,
        })),
      })
    }
    return entries.sort((left, right) => {
      const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
    })
  }, [activePromptTurn, selectedSession?.id, selectedSession?.updatedAt, selectedSessionKey, sessionSuggestions, transcriptEntries])
  const visibleTranscriptStream = useMemo(
    () => transcriptStream.filter((entry) => !hiddenTranscriptKinds.has(entry.kind)),
    [transcriptStream],
  )
  const suggestionSignature = useMemo(
    () => sessionSuggestions.map((suggestion) => `${suggestion.id}:${suggestion.updatedAt}:${suggestion.state}`).join('|'),
    [sessionSuggestions],
  )
  const recentTurns = useMemo(
    () => [...sessionTurns].reverse().slice(0, 6),
    [sessionTurns],
  )
  const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false)
  const tokenMeter = useMemo(
    () => buildWorldPromptSessionTokenMeter({
      turns: sessionTurns,
      messages: sessionMessages,
      events: sessionEvents,
      generationJobs: sessionGenerationJobs,
      generationJobSteps: sessionGenerationJobSteps,
      model: selectedSession?.model ?? activePromptTurn?.model ?? sessionTurns.at(-1)?.model ?? null,
    }),
    [activePromptTurn?.model, selectedSession?.model, sessionEvents, sessionGenerationJobSteps, sessionGenerationJobs, sessionMessages, sessionTurns],
  )
  const sessionStatusByKey = useMemo(() => {
    return Object.fromEntries(worldPromptSessions.map((session) => {
      const turnsForSession = worldPromptTurns
        .filter((turn) => turn.sessionId === session.id)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      const currentTurn = turnsForSession.at(-1) ?? null
      const currentClassification = currentTurn?.metadata?.classification
      const activeSuggestionCount = sessionSuggestionCountBySessionId[session.id] ?? 0
      const status = currentClassification === 'graph_diagnosis'
          ? 'diagnosis'
          : currentClassification === 'advisory_question'
            ? 'advisory'
            : activeSuggestionCount > 0 && (currentClassification === 'contradictory_or_low_confidence' || currentClassification === 'not_graphable')
              ? 'clarification'
              : currentTurn?.status ?? 'empty'
      return [session.key, status]
    }))
  }, [sessionSuggestionCountBySessionId, worldPromptSessions, worldPromptTurns])
  const isPromptCenter = !busy && !activePromptTurn && transcriptStream.length === 0 && sessionTurns.length === 0
  const hasClarificationSuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'clarification')
  const hasDiagnosticSuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'diagnostic')
  const hasAdvisorySuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'advisory')
  const showComposerSuggestions = !busy && sessionSuggestions.length > 0 && suppressedSuggestionSignature !== suggestionSignature
  const sessionTurnCountLabel = `${sessionTurns.length} turn${sessionTurns.length === 1 ? '' : 's'}`
  const isSubmittingWithoutActiveTurn = busy && !activePromptTurn
  const liveBusyStatusLabel = isSubmittingWithoutActiveTurn
    ? 'Planning'
    : (railView.latestPlannerStatus ?? railView.statusLabel ?? 'Planning')
  const liveBusyDetail = isSubmittingWithoutActiveTurn
    ? 'Preparing the next world-building turn.'
    : (railView.detail || 'Working through the next graph changes.')
  const promptTypeAccelerators = useMemo(() => getWorldPromptTypeAccelerators(projectContext), [projectContext])
  const promptStarterCards = useMemo(() => getWorldPromptStarterCards(projectContext), [projectContext])
  const promptSmartPrompts = useMemo(() => getWorldPromptSmartPrompts(projectContext), [projectContext])
  const promptCenterHeading = 'What do you want to create?'
  const composerLabel = railView.primaryActionKind === 'continue'
    ? 'Continue building'
    : railView.primaryActionKind === 'generate'
      ? 'Generate'
      : 'Use prompt'
  const composerActionDisabled = busy
    ? !canCancelTurn || cancelBusy || !activePromptTurn
    : !promptText.trim()
  const composerActionLabel = busy
    ? (cancelBusy ? 'Stopping turn' : 'Stop turn')
    : composerLabel

  useEffect(() => {
    if (!stickToBottom || isPromptCenter) return
    transcriptEndRef.current?.scrollIntoView({ block: 'end', behavior: activePromptTurn ? 'smooth' : 'auto' })
  }, [activePromptTurn, isPromptCenter, stickToBottom, visibleTranscriptStream.length])

  useEffect(() => {
    if (!suppressedSuggestionSignature) return
    if (!suggestionSignature || suggestionSignature !== suppressedSuggestionSignature) {
      setSuppressedSuggestionSignature(null)
    }
  }, [suggestionSignature, suppressedSuggestionSignature])

  useEffect(() => {
    setSuppressedSuggestionSignature(null)
  }, [selectedSessionKey])

  useEffect(() => {
    if (!expandedLogEntry) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpandedLogEntry(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [expandedLogEntry])

  useEffect(() => {
    if (!railView.plannerFailure) return
    const logKey = [
      railView.plannerFailure.occurredAt,
      railView.plannerFailure.category,
      railView.plannerFailure.message,
      activePromptTurn?.id ?? sessionTurns.at(-1)?.id ?? '',
    ].join(':')
    if (plannerFailureLogKeyRef.current === logKey) return
    plannerFailureLogKeyRef.current = logKey
    console.error('[GraphCore] hosted world prompt planner reported failure.', {
      plannerFailure: railView.plannerFailure,
      turnId: activePromptTurn?.id ?? sessionTurns.at(-1)?.id ?? null,
      sessionId: selectedSession?.id ?? null,
      sessionKey: selectedSession?.key ?? selectedSessionKey ?? null,
      selectedEntityKey: selectedEntity?.key ?? null,
      selectedThreadKey,
      selectedViewKey: selectedView.key,
    })
  }, [
    activePromptTurn?.id,
    railView.plannerFailure,
    selectedEntity?.key,
    selectedSession?.id,
    selectedSession?.key,
    selectedSessionKey,
    selectedThreadKey,
    selectedView.key,
    sessionTurns,
  ])

  function handleTranscriptScroll() {
    const element = transcriptRef.current
    if (!element) return
    const threshold = 56
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setStickToBottom(distanceFromBottom <= threshold)
  }

  function seedPrompt(prompt: string) {
    onChangePromptText(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  function suppressCurrentSuggestions() {
    if (suggestionSignature) {
      setSuppressedSuggestionSignature(suggestionSignature)
    }
  }

  function handleRunSuggestion(suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) {
    suppressCurrentSuggestions()
    return onRunSuggestion(suggestion)
  }

  function handleContinueWithoutSuggestion() {
    suppressCurrentSuggestions()
    onContinueWithoutSuggestion()
  }

  function handleSubmitPrompt(promptOverride?: string) {
    if (sessionSuggestions.length > 0) {
      suppressCurrentSuggestions()
    }
    return onSubmit(promptOverride)
  }

  function handleComposerAction() {
    if (busy) {
      if (canCancelTurn && activePromptTurn) {
        return onCancelTurn(activePromptTurn.id)
      }
      return undefined
    }
    return handleSubmitPrompt()
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.nativeEvent.isComposing
    ) {
      return
    }
    event.preventDefault()
    if (busy || !promptText.trim()) return
    void handleSubmitPrompt()
  }

  function handleExpandableLogKeyDown(event: ReactKeyboardEvent<HTMLElement>, logEntry: WorldPromptExpandedLogEntry) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setExpandedLogEntry(logEntry)
  }

  function renderEntry(entry: WorldPromptTranscriptEntry) {
    if (hiddenTranscriptKinds.has(entry.kind)) return null

    if (entry.kind === 'user_message' || entry.kind === 'assistant_message') {
      const expandableLogEntry = isLongWorldPromptLogText(entry.content, WORLD_PROMPT_LOG_MESSAGE_LIMIT)
        ? {
            title: entry.kind === 'user_message' ? 'You' : 'GraphCore',
            body: entry.content,
          }
        : null
      return (
        <div key={entry.id} className={`world-prompt-row ${entry.kind === 'user_message' ? 'world-prompt-row-user' : 'world-prompt-row-assistant'}`}>
          <span className="world-prompt-row-label">{entry.kind === 'user_message' ? 'You' : 'GraphCore'}</span>
          <div
            className={`world-prompt-bubble${entry.pending ? ' is-pending' : ''}${expandableLogEntry ? ' is-expandable' : ''}`}
            onClick={expandableLogEntry ? () => setExpandedLogEntry(expandableLogEntry) : undefined}
            onKeyDown={expandableLogEntry ? (event) => handleExpandableLogKeyDown(event, expandableLogEntry) : undefined}
            role={expandableLogEntry ? 'button' : undefined}
            tabIndex={expandableLogEntry ? 0 : undefined}
          >
            <span className="world-prompt-log-text world-prompt-message-preview">
              {compactWorldPromptLogText(entry.content, WORLD_PROMPT_LOG_MESSAGE_LIMIT)}
            </span>
            {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
          </div>
        </div>
      )
    }

    if (entry.kind === 'planner_progress') {
      const fullBody = [entry.detail, ...entry.outline].filter(Boolean).join('\n')
      const expandableLogEntry = isLongWorldPromptLogText(fullBody)
        ? {
            title: entry.label,
            body: fullBody,
            meta: entry.done ? ['Completed'] : ['In progress'],
          }
        : null
      return (
        <div
          key={entry.id}
          className={`world-prompt-row world-prompt-row-system world-prompt-card world-prompt-row-progress${entry.done ? ' is-complete' : ''}${expandableLogEntry ? ' is-expandable' : ''}`}
          onClick={expandableLogEntry ? () => setExpandedLogEntry(expandableLogEntry) : undefined}
          onKeyDown={expandableLogEntry ? (event) => handleExpandableLogKeyDown(event, expandableLogEntry) : undefined}
          role={expandableLogEntry ? 'button' : undefined}
          tabIndex={expandableLogEntry ? 0 : undefined}
        >
          <div className="world-prompt-entry-icon">
            <div className={`world-prompt-inline-spinner${entry.done ? ' is-done' : ''}`} aria-hidden="true" />
          </div>
          <div className="world-prompt-entry-copy">
            <span className="world-prompt-row-label">{entry.label}</span>
            {entry.detail ? <div className="world-prompt-line world-prompt-log-text">{compactWorldPromptLogText(entry.detail)}</div> : null}
            {entry.outline.length > 0 ? (
              <div className="world-prompt-outline-list">
                {entry.outline.map((item) => (
                  <span key={`${entry.id}:${item}`} className="chip">{compactWorldPromptLogText(item, 70)}</span>
                ))}
              </div>
            ) : null}
            {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
          </div>
        </div>
      )
    }

    if (
      entry.kind !== 'system_status'
      && entry.kind !== 'entity_created'
      && entry.kind !== 'entity_updated'
      && entry.kind !== 'entity_replaced'
      && entry.kind !== 'relationship_created'
      && entry.kind !== 'relationship_updated'
      && entry.kind !== 'derived_result_created'
      && entry.kind !== 'turn_lens'
      && entry.kind !== 'queue_started'
      && entry.kind !== 'advisory_answer'
      && entry.kind !== 'diagnostic_finding'
    ) {
      return null
    }

    if (entry.kind === 'system_status' && entry.tone !== 'error') {
      return null
    }

    const iconId = entry.kind === 'turn_lens'
      ? 'graph'
      : entry.kind === 'entity_created' || entry.kind === 'entity_updated' || entry.kind === 'entity_replaced'
      ? iconForWorldEntity(entry.entityNodeType)
      : entry.kind === 'relationship_created' || entry.kind === 'relationship_updated'
        ? 'graph'
        : entry.kind === 'derived_result_created'
          ? 'content'
        : entry.kind === 'advisory_answer'
          ? 'info'
          : entry.kind === 'diagnostic_finding'
            ? 'concept'
        : entry.kind === 'queue_started'
          ? 'activity'
          : 'content'
    const entryTurnLens = entry.kind === 'turn_lens' ? entry.turnLens : undefined
    const entryEntityKey = entry.kind === 'entity_created' || entry.kind === 'entity_updated' || entry.kind === 'entity_replaced'
      ? entry.entityKey
      : null
    const entryRelationshipKey = entry.kind === 'relationship_created' || entry.kind === 'relationship_updated'
      ? entry.relationshipKey
      : null
    const hasGraphTarget = Boolean(entryEntityKey || entryRelationshipKey)
    const isTitleOnlyResult = !entry.detail && entry.kind !== 'relationship_created' && !entryTurnLens
    const ResultWrapper = entryTurnLens || hasGraphTarget ? 'button' : 'div'
    const fullBody = [
      entry.detail,
      entry.kind === 'relationship_created' ? `${entry.sourceLabel} -> ${entry.targetLabel}` : null,
      entryTurnLens
        ? `${entryTurnLens.counts.entities} nodes / ${entryTurnLens.counts.relationships} links${entryTurnLens.counts.derived > 0 ? ` / ${entryTurnLens.counts.derived} derived` : ''}`
        : null,
    ].filter(Boolean).join('\n')
    const expandableLogEntry = !entryTurnLens && isLongWorldPromptLogText(fullBody)
      ? {
          title: entry.label,
          body: fullBody,
        }
      : null
    function handleResultRowClick() {
      if (entryTurnLens) {
        onOpenTurnLens(entryTurnLens)
        return
      }
      if (entryEntityKey) {
        onSelectGraphNode(entryEntityKey)
        return
      }
      if (entryRelationshipKey) {
        onSelectGraphEdge(entryRelationshipKey)
        return
      }
      if (expandableLogEntry) {
        setExpandedLogEntry(expandableLogEntry)
      }
    }
    function handleResultRowKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
      if (entryTurnLens || hasGraphTarget) return
      if (expandableLogEntry) {
        handleExpandableLogKeyDown(event, expandableLogEntry)
      }
    }

    return (
      <ResultWrapper
        key={entry.id}
        className={`world-prompt-row world-prompt-row-system world-prompt-card world-prompt-row-result${entry.kind === 'system_status' && entry.tone === 'error' ? ' is-error' : ''}${entryTurnLens || hasGraphTarget ? ' is-clickable' : ''}${entryTurnLens?.turnId === activeTurnLensId ? ' is-active-lens' : ''}${expandableLogEntry && !hasGraphTarget ? ' is-expandable' : ''}${isTitleOnlyResult ? ' is-title-only' : ''}`}
        onClick={entryTurnLens || hasGraphTarget || expandableLogEntry ? handleResultRowClick : undefined}
        onKeyDown={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? handleResultRowKeyDown : undefined}
        role={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? 'button' : undefined}
        tabIndex={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? 0 : undefined}
        type={entryTurnLens || hasGraphTarget ? 'button' : undefined}
      >
        <div className="world-prompt-entry-icon">
          <EntityIcon id={iconId} />
        </div>
        <div className="world-prompt-entry-copy">
          <span className="world-prompt-row-label">{entry.label}</span>
          {entry.detail ? <div className="world-prompt-line world-prompt-log-text">{compactWorldPromptLogText(entry.detail)}</div> : null}
          {entry.kind === 'relationship_created' ? (
            <div className="world-prompt-entry-route">
              {compactWorldPromptLogText(`${entry.sourceLabel} -> ${entry.targetLabel}`, 120)}
            </div>
          ) : null}
          {entryTurnLens ? (
            <span className="world-prompt-lens-chip">
              {entryTurnLens.counts.entities} nodes
              {' / '}
              {entryTurnLens.counts.relationships} links
              {entryTurnLens.counts.derived > 0 ? ` / ${entryTurnLens.counts.derived} derived` : ''}
            </span>
          ) : null}
          {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
        </div>
      </ResultWrapper>
    )
  }

  return (
    <div className={`world-prompt-chat-shell${variant === 'grow' ? ' is-grow' : ''}${isPromptCenter ? ' is-prompt-center' : ''}`}>
      <div className="world-prompt-chat-head">
        <div className="world-prompt-chat-meta">
          <div className="world-prompt-chat-subline is-compact">
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
        </div>
        <div className="world-prompt-head-actions">
          <button className="world-prompt-icon-button" onClick={onOpenHistory} type="button" aria-label="Open history">
            <EntityIcon id="activity" />
          </button>
          <button className="world-prompt-icon-button" onClick={onStartNewSession} type="button" aria-label="Start new chat">
            <EntityIcon id="plus" />
          </button>
          {headerActionEnd}
        </div>
      </div>

      {isPromptCenter ? (
        <div className="world-prompt-center">
          <div className="world-prompt-center-copy">
            <h2>{promptCenterHeading}</h2>
          </div>

          <div className="world-prompt-composer world-prompt-composer-center">
            <div className="world-prompt-input-shell">
              <textarea
                ref={composerRef}
                rows={6}
                placeholder="Create a secret order that manipulates events from the shadows and tie it to two existing factions."
                value={promptText}
                onChange={(event) => onChangePromptText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
              <button
                aria-label={composerActionLabel}
                className={`world-prompt-send-button${busy ? ' is-stop' : ''}`}
                disabled={composerActionDisabled}
                onClick={() => void handleComposerAction()}
                title={composerActionLabel}
                type="button"
              >
                <EntityIcon id={busy ? 'stop' : 'send'} />
              </button>
            </div>
          </div>

          <div className="world-prompt-type-chips">
            {promptTypeAccelerators.map((chip) => (
              <button key={chip.label} className="world-prompt-type-chip" onClick={() => seedPrompt(chip.prompt)} type="button">
                <EntityIcon id={chip.iconId} />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          <div className="world-prompt-starter-grid">
            {promptStarterCards.map((card) => (
              <button key={card.title} className="world-prompt-starter-card" onClick={() => seedPrompt(card.prompt)} type="button">
                <strong>{card.title}</strong>
                <span>{card.summary}</span>
              </button>
            ))}
          </div>

          <div className="world-prompt-smart-list">
            <div className="world-prompt-smart-grid">
              {promptSmartPrompts.map((prompt) => (
                <button key={prompt} className="world-prompt-smart-chip" onClick={() => seedPrompt(prompt)} type="button">
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="world-prompt-transcript-shell">
            <div className="world-prompt-transcript" onScroll={handleTranscriptScroll} ref={transcriptRef}>
              {visibleTranscriptStream.map(renderEntry)}
              {promptError ? (
                <div className="world-prompt-row world-prompt-row-system world-prompt-card is-error">
                  <span className="world-prompt-row-label">Prompt failed</span>
                  <div className="world-prompt-line">Open the browser console for the full debug error.</div>
                </div>
              ) : null}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          <div className="world-prompt-composer world-prompt-composer-pinned">
            {showComposerSuggestions ? (
              <div className={`world-prompt-composer-suggestions${hasClarificationSuggestions ? ' is-clarification' : ''}`}>
                <div className="world-prompt-composer-suggestions-head">
                  <span className="world-prompt-composer-suggestions-label">
                    {hasClarificationSuggestions
                      ? 'Choose a direction'
                      : hasDiagnosticSuggestions
                        ? 'Weak points to explore'
                        : hasAdvisorySuggestions
                          ? 'Options'
                          : 'Next moves'}
                  </span>
                  <button className="ghost-button compact" disabled={busy} onClick={handleContinueWithoutSuggestion} type="button">
                    Continue with my own prompt
                  </button>
                </div>
                <div className="world-prompt-composer-suggestion-list">
                  {sessionSuggestions.map((suggestion) => {
                    const summary = suggestion.summary || (typeof suggestion.metadata?.generatedReason === 'string' ? suggestion.metadata.generatedReason : '')
                    return (
                      <div key={suggestion.id} className="world-prompt-composer-suggestion-row">
                        <button
                          className="world-prompt-composer-suggestion-button"
                          disabled={busy}
                          onClick={() => void handleRunSuggestion(suggestion)}
                          type="button"
                        >
                          <span className="world-prompt-composer-suggestion-title">{suggestion.label}</span>
                        </button>
                        {summary ? (
                          <button
                            aria-label={`More information about ${suggestion.label}`}
                            className="world-prompt-composer-suggestion-info"
                            title={summary}
                            type="button"
                          >
                            <EntityIcon id="info" />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {busy ? (
              <div className="world-prompt-composer-thinking" aria-live="polite">
                <div className="world-prompt-planning-spinner" aria-hidden="true" />
                <div className="world-prompt-planning-copy">
                  <span className="world-prompt-row-label">{liveBusyStatusLabel}</span>
                  <div className="world-prompt-line">{liveBusyDetail}</div>
                </div>
                <button
                  aria-label={composerActionLabel}
                  className="world-prompt-send-button world-prompt-composer-stop-button is-stop"
                  disabled={composerActionDisabled}
                  onClick={() => void handleComposerAction()}
                  title={composerActionLabel}
                  type="button"
                >
                  <EntityIcon id="stop" />
                </button>
              </div>
            ) : (
              <div className="world-prompt-input-shell">
                <textarea
                  ref={composerRef}
                  rows={variant === 'grow' ? 3 : 2}
                  placeholder="Describe the next character, relationship, place, or turn in the story."
                  value={promptText}
                  onChange={(event) => onChangePromptText(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                <button
                  aria-label={composerActionLabel}
                  className="world-prompt-send-button"
                  disabled={composerActionDisabled}
                  onClick={() => void handleComposerAction()}
                  title={composerActionLabel}
                  type="button"
                >
                  <EntityIcon id="send" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {historyOpen ? (
        <div className="world-prompt-history-overlay" onClick={onCloseHistory} role="presentation">
          <div className="world-prompt-history-panel" onClick={(event) => event.stopPropagation()}>
            <div className="world-prompt-history-head">
              <div>
                <span className="eyebrow">History</span>
                <h4>Context windows</h4>
              </div>
              <button className="world-prompt-icon-button is-close" onClick={onCloseHistory} type="button" aria-label="Close history">
                <EntityIcon id="plus" />
              </button>
            </div>

            {selectedSessionKey && !selectedSession ? (
              <div className="world-prompt-history-draft">
                <strong>New chat</strong>
                <span>This fresh context is ready. Submit a first prompt to persist it.</span>
              </div>
            ) : null}

            <div className="world-prompt-history-list">
              {worldPromptSessions.length === 0 ? <div className="inline-note">No saved chats yet.</div> : null}
              {worldPromptSessions.map((session) => (
                <button
                  key={session.id}
                  className={`world-prompt-history-item${session.key === (selectedSession?.key ?? selectedSessionKey) ? ' is-active' : ''}`}
                  onClick={() => {
                    onSelectSession(session.key)
                    onCloseHistory()
                  }}
                  type="button"
                >
                  <strong>{session.title}</strong>
                  <span>
                    {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : 'Recent session'}
                    {sessionSuggestionCountBySessionId[session.id] ? ` · ${sessionSuggestionCountBySessionId[session.id]} active suggestion${sessionSuggestionCountBySessionId[session.id] === 1 ? '' : 's'}` : ''}
                    {sessionStatusByKey[session.key] ? ` · ${sessionStatusByKey[session.key]}` : ''}
                  </span>
                </button>
              ))}
            </div>

            <div className="world-prompt-history-turns">
              <div className="world-prompt-smart-head">
                <span className="eyebrow">Recent turns</span>
                <span className="inline-note">{recentTurns.length} in this session</span>
              </div>
              <div className="world-prompt-history-list">
                {recentTurns.length === 0 ? <div className="inline-note">No turns in this context window yet.</div> : null}
                {recentTurns.map((turn) => {
                  const lens = turnLensByTurnId.get(turn.id) ?? null
                  if (!lens) {
                    return (
                      <div key={turn.id} className="world-prompt-history-item is-static">
                        <strong>{turn.prompt}</strong>
                        <span>{turn.status}</span>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={turn.id}
                      className={`world-prompt-history-item${activeTurnLensId === turn.id ? ' is-active-lens' : ''}`}
                      onClick={() => {
                        onOpenTurnLens(lens)
                        onCloseHistory()
                      }}
                      type="button"
                    >
                      <strong>{turn.prompt}</strong>
                      <span>{turn.status} / {lens.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {expandedLogEntry ? (
        <div
          className="world-prompt-modal-backdrop world-prompt-log-modal-backdrop"
          onClick={() => setExpandedLogEntry(null)}
          role="presentation"
        >
          <div
            aria-modal="true"
            className="world-prompt-modal world-prompt-log-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="world-popup-head">
              <div>
                <span className="eyebrow">Log entry</span>
                <h3>{expandedLogEntry.title}</h3>
              </div>
              <button
                aria-label="Close log entry"
                className="world-popup-close"
                onClick={() => setExpandedLogEntry(null)}
                type="button"
              >
                <EntityIcon id="plus" />
              </button>
            </div>
            {expandedLogEntry.meta && expandedLogEntry.meta.length > 0 ? (
              <div className="world-prompt-log-modal-meta">
                {expandedLogEntry.meta.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
            <div className="world-prompt-log-modal-body">{expandedLogEntry.body}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function WorldPromptActivityPanel({
  selectedSession,
  sessionEvents,
  sessionTurns,
}: {
  selectedSession: WorldPromptSession | null
  sessionEvents: WorldPromptEvent[]
  sessionTurns: WorldPromptTurn[]
}) {
  return (
    <div className="detail-stack compact">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">World Prompt Activity</span>
          <h3>{selectedSession?.title ?? 'No session selected'}</h3>
        </div>
      </div>
      <div className="chip-row">
        <span className="chip">{sessionTurns.length} turns</span>
        <span className="chip">{sessionEvents.length} events</span>
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Recent Events</span>
            <h3>Timeline</h3>
          </div>
        </div>
        {sessionEvents.length === 0 ? <div className="inline-note">No world prompt activity yet.</div> : null}
        <div className="diagnostic-stack">
          {sessionEvents.slice(-20).reverse().map((event) => {
            const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
            const label = parsedPayload.success && parsedPayload.data.workItem?.label
              ? parsedPayload.data.workItem.label
              : parsedPayload.success && parsedPayload.data.plannerProgress?.message
                ? parsedPayload.data.plannerProgress.message
                : parsedPayload.success && parsedPayload.data.op
                  ? describePromptOp(parsedPayload.data.op)
                  : parsedPayload.success && parsedPayload.data.note
                    ? parsedPayload.data.note
                    : event.eventType
            return (
              <div key={event.id} className="inline-note">
                <strong>{event.eventType}</strong>
                <span> #{event.sequence} · {label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function WorldPromptThreadsPanel({
  selectedThreadKey,
  threads,
  onParkThread,
  onResolveThread,
  onSelectThread,
}: {
  selectedThreadKey: string | null
  threads: WorldThread[]
  onParkThread: (threadKey: string) => Promise<void> | void
  onResolveThread: (threadKey: string) => Promise<void> | void
  onSelectThread: (threadKey: string | null) => void
}) {
  return (
    <div className="detail-stack compact">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">Open Threads</span>
          <h3>Story pressure points</h3>
        </div>
      </div>
      {threads.length === 0 ? <div className="inline-note">No active threads yet. Prompts that introduce unresolved tensions will surface here.</div> : null}
      <div className="world-thread-list">
        {threads.map((thread) => (
          <div key={thread.key} className={thread.key === selectedThreadKey ? 'schema-card world-thread-card is-selected' : 'schema-card world-thread-card'}>
            <div className="schema-card-head">
              <div>
                <strong>{thread.title}</strong>
                <div className="inline-note">{thread.priority} priority</div>
              </div>
              <button className="ghost-button compact" onClick={() => onSelectThread(thread.key)} type="button">
                {thread.key === selectedThreadKey ? 'Selected' : 'Focus'}
              </button>
            </div>
            {thread.summary ? <div className="inline-note">{thread.summary}</div> : null}
            <div className="chip-row">
              <span className="chip">{thread.status}</span>
              <span className="chip">{thread.linkedEntityKeys.length} linked</span>
            </div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => void onParkThread(thread.key)} type="button">Park</button>
              <button className="primary-button compact" onClick={() => void onResolveThread(thread.key)} type="button">Resolve</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
