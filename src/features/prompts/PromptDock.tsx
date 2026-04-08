type PromptDockProps = {
  currentContextLabel: string
  isApplyingPatch: boolean
  isGeneratingPatch: boolean
  model: string
  needsInitialization: boolean
  promptRuntimeError: string | null
  promptText: string
  sessionEmail?: string | null
  onChangeModel: (value: string) => void
  onChangePromptText: (value: string) => void
  onGenerate: () => void
  onOpenOnboarding: () => void
}

export function PromptDock({
  currentContextLabel,
  isApplyingPatch,
  isGeneratingPatch,
  model,
  needsInitialization,
  promptRuntimeError,
  promptText,
  sessionEmail,
  onChangeModel,
  onChangePromptText,
  onGenerate,
  onOpenOnboarding,
}: PromptDockProps) {
  const isBusy = isGeneratingPatch || isApplyingPatch
  const buttonDisabled = isBusy || (!needsInitialization && promptText.trim().length === 0)

  return (
    <section className="prompt-dock">
      <div className="prompt-dock-resize-handle" aria-hidden="true" />
      <div className="prompt-dock-head">
        <div>
          <span className="eyebrow">Prompt Dock</span>
          <h2>Describe what the game needs next</h2>
        </div>
        <p className="subtle-line">Context: {currentContextLabel}</p>
      </div>
      <div className="prompt-controls compact-prompt-controls">
        <label className="field-block compact-block">
          <span>Model</span>
          <select value={model} onChange={(event) => onChangeModel(event.target.value)}>
            <option value="gpt-5.4-mini">gpt-5.4-mini</option>
            <option value="gpt-5.4">gpt-5.4</option>
            <option value="gpt-5.3-codex">gpt-5.3-codex</option>
          </select>
        </label>
      </div>
      {!sessionEmail ? <div className="inline-note">Hosted AI, patch apply, and publishing require Supabase sign-in. You can still explore the demo workspace.</div> : null}
      {promptRuntimeError ? <div className="inline-note is-error">{promptRuntimeError}</div> : null}
      {needsInitialization ? <div className="inline-note">This active game is still empty. Initialize it first, then use normal prompts to expand it.</div> : null}
      <div className="prompt-dock-body">
        <textarea aria-label="Prompt editor" className="prompt-composer" placeholder="Add a fire mage enemy with a vendor quest hub and one starter narrative graph." value={promptText} onChange={(event) => onChangePromptText(event.target.value)} rows={3} />
        <div className="prompt-actions">
          <div className="prompt-hint"><span>The orchestrator plans dependencies first, fans out graph work if needed, and applies successful changes automatically.</span></div>
          <button className="primary-button button-with-spinner" disabled={buttonDisabled} onClick={needsInitialization ? onOpenOnboarding : onGenerate} type="button">
            {isBusy
              ? <><span className="button-spinner" aria-hidden="true" />Generating...</>
              : needsInitialization
                ? 'Initialize game'
                : 'Generate'}
          </button>
        </div>
      </div>
    </section>
  )
}
