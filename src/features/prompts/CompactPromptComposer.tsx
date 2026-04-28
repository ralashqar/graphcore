import type { KeyboardEvent } from 'react'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'

type CompactPromptComposerProps = {
  ariaLabel: string
  busy?: boolean
  busyLabel?: string
  cancelBusy?: boolean
  disabled?: boolean
  expandIcon?: EntityIconId
  expandLabel?: string
  placeholder: string
  sendLabel?: string
  stopLabel?: string
  submitDisabled?: boolean
  value: string
  onCancel?: () => void
  onChange: (value: string) => void
  onExpand?: () => void
  onSubmit: () => void
}

export function CompactPromptComposer({
  ariaLabel,
  busy = false,
  busyLabel = 'Thinking...',
  cancelBusy = false,
  disabled = false,
  expandIcon = 'content',
  expandLabel = 'Expand prompt',
  placeholder,
  sendLabel = 'Send prompt',
  stopLabel = 'Stop prompt',
  submitDisabled = false,
  value,
  onCancel,
  onChange,
  onExpand,
  onSubmit,
}: CompactPromptComposerProps) {
  const canStop = busy && Boolean(onCancel) && !cancelBusy
  const buttonDisabled = busy ? !canStop : submitDisabled || disabled

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!busy && !buttonDisabled) {
      onSubmit()
    }
  }

  return (
    <div className={busy ? 'compact-prompt-composer is-busy' : 'compact-prompt-composer'}>
      <button
        className="compact-prompt-expand"
        disabled={!onExpand || busy}
        onClick={onExpand}
        type="button"
        aria-label={expandLabel}
      >
        <EntityIcon id={expandIcon} />
      </button>
      {busy ? (
        <div className="compact-prompt-thinking" aria-live="polite">
          <span className="button-spinner" aria-hidden="true" />
          <span>{busyLabel}</span>
        </div>
      ) : (
        <textarea
          aria-label={ariaLabel}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          value={value}
        />
      )}
      <button
        className={busy ? 'compact-prompt-send-button is-stop' : 'compact-prompt-send-button'}
        disabled={buttonDisabled}
        onClick={() => {
          if (busy) {
            onCancel?.()
            return
          }
          onSubmit()
        }}
        type="button"
        aria-label={busy ? stopLabel : sendLabel}
        title={busy ? stopLabel : sendLabel}
      >
        <EntityIcon id={busy ? 'stop' : 'send'} />
      </button>
    </div>
  )
}
