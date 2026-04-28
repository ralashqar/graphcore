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
  promptSecondary = null,
  stageHeader,
  collectionPane,
  focusPane,
  focusMeta = null,
}: DefinitionAuthoringShellProps) {
  return (
    <div className="definition-authoring-shell">
      <aside className="definition-authoring-rail">
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
