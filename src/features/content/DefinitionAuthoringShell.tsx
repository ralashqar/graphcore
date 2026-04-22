import type { ReactNode } from 'react'

type PromptSuggestion = {
  label: string
  prompt: string
}

type DefinitionAuthoringShellProps = {
  title: string
  subtitle: string
  promptLabel: string
  promptPlaceholder: string
  promptText: string
  promptBusyLabel?: string
  promptStatus?: string | null
  promptSuggestions?: PromptSuggestion[]
  promptFocusLabel?: string | null
  promptFocusMeta?: string | null
  promptSecondary?: ReactNode
  isPromptBusy?: boolean
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  onPromptSuggestionSelect?: (prompt: string) => void
  stageHeader: ReactNode
  collectionPane: ReactNode
  focusPane: ReactNode
  focusMeta?: ReactNode
}

export function DefinitionAuthoringShell({
  title,
  subtitle,
  promptLabel,
  promptPlaceholder,
  promptText,
  promptBusyLabel = 'Generating...',
  promptStatus = null,
  promptSuggestions = [],
  promptFocusLabel = null,
  promptFocusMeta = null,
  promptSecondary = null,
  isPromptBusy = false,
  onPromptChange,
  onPromptSubmit,
  onPromptSuggestionSelect,
  stageHeader,
  collectionPane,
  focusPane,
  focusMeta = null,
}: DefinitionAuthoringShellProps) {
  return (
    <div className="definition-authoring-shell">
      <aside className="definition-authoring-rail">
        <div className="definition-authoring-rail-head">
          <div className="definition-authoring-copy">
            <span className="eyebrow">Authoring Workspace</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {promptFocusLabel ? (
            <div className="definition-authoring-focus-chip">
              <strong>{promptFocusLabel}</strong>
              {promptFocusMeta ? <span>{promptFocusMeta}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="definition-authoring-prompt-card">
          <div className="definition-authoring-prompt-head">
            <div>
              <span className="section-label">Prompt</span>
              <strong>{promptLabel}</strong>
            </div>
            {promptStatus ? <span className="inline-note">{promptStatus}</span> : null}
          </div>
          <label className="field-block">
            <span>Describe what to add or refine</span>
            <textarea
              className="definition-authoring-prompt-input"
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={promptPlaceholder}
              rows={6}
              value={promptText}
            />
          </label>
          <button
            className={isPromptBusy ? 'primary-button button-with-spinner' : 'primary-button'}
            disabled={isPromptBusy || promptText.trim().length === 0}
            onClick={onPromptSubmit}
            type="button"
          >
            {isPromptBusy ? <><span className="button-spinner" aria-hidden="true" />{promptBusyLabel}</> : 'Generate'}
          </button>
          {promptSuggestions.length > 0 ? (
            <div className="definition-authoring-suggestion-grid">
              {promptSuggestions.map((suggestion) => (
                <button
                  key={suggestion.label}
                  className="definition-authoring-suggestion"
                  onClick={() => onPromptSuggestionSelect?.(suggestion.prompt)}
                  type="button"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {promptSecondary}
      </aside>

      <section className="definition-authoring-stage">
        {stageHeader}
        <div className="definition-authoring-stage-grid">
          <div className="definition-authoring-collection-pane">
            {collectionPane}
          </div>
          <div className="definition-authoring-focus-pane">
            {focusPane}
            {focusMeta}
          </div>
        </div>
      </section>
    </div>
  )
}
