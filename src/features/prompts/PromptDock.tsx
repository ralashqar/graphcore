import type { KeyboardEvent } from 'react'
import type { WorkspaceTab } from '../../shared/workspace'
import { EntityIcon } from '../../shared/entityIcons'
import { useEditorStore } from '../../state/editorStore'
import { CompactPromptComposer } from './CompactPromptComposer'

type PromptDockProps = {
  activeTab: WorkspaceTab
  currentContextLabel: string
  isApplyingPatch: boolean
  isGeneratingPatch: boolean
  model: string
  needsInitialization: boolean
  promptRuntimeError: string | null
  promptText?: string
  sessionEmail?: string | null
  onChangeModel: (value: string) => void
  onChangePromptText?: (value: string) => void
  onGenerate: () => void
  onOpenOnboarding: () => void
}

export function PromptDock({
  activeTab,
  currentContextLabel: _currentContextLabel,
  isApplyingPatch,
  isGeneratingPatch,
  model,
  needsInitialization,
  promptRuntimeError,
  promptText: promptTextProp,
  sessionEmail,
  onChangeModel,
  onChangePromptText: onChangePromptTextProp,
  onGenerate,
  onOpenOnboarding,
}: PromptDockProps) {
  const storePromptText = useEditorStore((state) => state.promptText)
  const setStorePromptText = useEditorStore((state) => state.setPromptText)
  const promptText = promptTextProp ?? storePromptText
  const onChangePromptText = onChangePromptTextProp ?? setStorePromptText
  const isBusy = isGeneratingPatch || isApplyingPatch
  const buttonDisabled = isBusy || (!needsInitialization && promptText.trim().length === 0)
  const tabLabel = activeTab === 'outputs'
    ? 'Outputs'
    : activeTab === 'global'
      ? 'Global'
      : activeTab === 'library'
        ? 'Library'
        : 'World'
  const promptPlaceholder = activeTab === 'outputs'
    ? 'Plan a teaser built around the harbor bells and the cathedral reveal.'
    : activeTab === 'library'
      ? 'Add a rival scholar with a cracked relic and one signature ability.'
      : 'Add a fire mage enemy with a vendor quest hub and one starter narrative graph.'
  const handleSubmit = () => {
    if (buttonDisabled) return
    if (needsInitialization) {
      onOpenOnboarding()
      return
    }
    onGenerate()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    handleSubmit()
  }

  if (activeTab === 'library') {
    return (
      <section className="prompt-dock prompt-dock-library-compact" aria-label="Library prompt">
        <CompactPromptComposer
          ariaLabel="Prompt library"
          busy={isBusy}
          busyLabel={isApplyingPatch ? 'Applying generated changes...' : 'Planning library changes...'}
          disabled={isBusy}
          expandIcon={needsInitialization ? 'plus' : 'content'}
          expandLabel={needsInitialization ? 'Initialize game' : 'Library prompt'}
          placeholder={promptPlaceholder}
          submitDisabled={buttonDisabled}
          value={promptText}
          onChange={onChangePromptText}
          onExpand={needsInitialization ? onOpenOnboarding : undefined}
          onSubmit={handleSubmit}
        />
        {!sessionEmail ? <div className="inline-note">Hosted AI, patch apply, and publishing require Supabase sign-in. You can still explore the demo workspace.</div> : null}
        {promptRuntimeError ? <div className="inline-note is-error">{promptRuntimeError}</div> : null}
        {needsInitialization ? <div className="inline-note">This active game is still empty. Initialize it first, then use normal prompts to expand it.</div> : null}
      </section>
    )
  }

  return (
    <section className="prompt-dock prompt-dock-contextual">
      <div className="prompt-dock-context-copy">
        <span className="eyebrow">{tabLabel} Prompt</span>
        <h2>Plan the next focused change</h2>
      </div>
      <div className="prompt-dock-row">
        <label className="field-block compact-block">
          <span>Model</span>
          <select value={model} onChange={(event) => onChangeModel(event.target.value)}>
            <option value="gpt-5.4-mini">gpt-5.4-mini</option>
            <option value="gpt-5.4">gpt-5.4</option>
            <option value="gpt-5.3-codex">gpt-5.3-codex</option>
          </select>
        </label>
        <label className="field-block compact-block prompt-inline-input">
          <span>Prompt</span>
          <input
            aria-label="Prompt editor"
            className="prompt-composer prompt-composer-inline"
            onChange={(event) => onChangePromptText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={promptPlaceholder}
            type="text"
            value={promptText}
          />
        </label>
        <div className="prompt-actions prompt-actions-inline">
          <button
            className={isBusy ? 'prompt-dock-send-button is-busy' : 'prompt-dock-send-button'}
            disabled={buttonDisabled}
            onClick={handleSubmit}
            type="button"
            aria-label={needsInitialization ? 'Initialize game' : 'Send prompt'}
            title={needsInitialization ? 'Initialize game' : 'Send prompt'}
          >
            {isBusy ? <span className="button-spinner" aria-hidden="true" /> : <EntityIcon id={needsInitialization ? 'plus' : 'send'} />}
          </button>
        </div>
      </div>
      {!sessionEmail ? <div className="inline-note">Hosted AI, patch apply, and publishing require Supabase sign-in. You can still explore the demo workspace.</div> : null}
      {promptRuntimeError ? <div className="inline-note is-error">{promptRuntimeError}</div> : null}
      {needsInitialization ? <div className="inline-note">This active game is still empty. Initialize it first, then use normal prompts to expand it.</div> : null}
    </section>
  )
}
