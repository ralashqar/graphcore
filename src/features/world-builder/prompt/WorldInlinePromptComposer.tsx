import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { EntityIcon } from '../../../shared/entityIcons'

type WorldInlinePromptComposerProps = {
  activeTurnId?: string | null
  busy?: boolean
  cancelBusy?: boolean
  className?: string
  disabled?: boolean
  error?: string | null
  id: string
  label: string
  modelLabel?: string | null
  placeholder: string
  rows?: number
  value: string
  onCancelTurn?: (turnId: string) => Promise<void> | void
  onChange: (value: string) => void
  onSubmit: () => Promise<void> | void
}

export function WorldInlinePromptComposer({
  activeTurnId = null,
  busy = false,
  cancelBusy = false,
  className,
  disabled = false,
  error,
  id,
  label,
  modelLabel,
  placeholder,
  rows = 3,
  value,
  onCancelTurn,
  onChange,
  onSubmit,
}: WorldInlinePromptComposerProps) {
  const hasActiveTurn = Boolean(activeTurnId)
  const inputDisabled = disabled || hasActiveTurn || busy
  const submitDisabled = inputDisabled || !value.trim()
  const actionLabel = hasActiveTurn ? (cancelBusy ? 'Cancelling prompt' : 'Cancel prompt') : 'Send prompt'

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || hasActiveTurn) return
    event.preventDefault()
    if (!submitDisabled) void onSubmit()
  }

  function handleAction() {
    if (activeTurnId) {
      if (!cancelBusy && onCancelTurn) void onCancelTurn(activeTurnId)
      return
    }
    if (!submitDisabled) void onSubmit()
  }

  return (
    <section className={['world-inline-prompt-composer', className ?? ''].filter(Boolean).join(' ')} aria-label={label}>
      <label htmlFor={id}>{label}</label>
      <div className="world-prompt-input-shell">
        <textarea
          id={id}
          disabled={inputDisabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          value={value}
        />
        <button
          aria-label={actionLabel}
          className={`world-prompt-send-button${hasActiveTurn ? ' is-stop' : ''}`}
          disabled={hasActiveTurn ? cancelBusy || !onCancelTurn : submitDisabled}
          onClick={handleAction}
          title={actionLabel}
          type="button"
        >
          {cancelBusy ? <span className="button-spinner" aria-hidden="true" /> : <EntityIcon id={hasActiveTurn ? 'stop' : 'send'} />}
        </button>
      </div>
      {modelLabel ? <div className="world-inline-prompt-meta">{modelLabel}</div> : null}
      {error ? <div className="world-feed-error">{error}</div> : null}
    </section>
  )
}
