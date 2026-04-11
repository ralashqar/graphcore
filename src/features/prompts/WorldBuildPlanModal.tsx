import type { WorldBuildPlanItem } from '../../domain/worldBuild'
import { EntityIcon } from '../../shared/entityIcons'

type WorldBuildPlanModalProps = {
  isStarting: boolean
  planItems: WorldBuildPlanItem[]
  prompt: string
  requestSummary: string
  onCancel: () => void
  onConfirm: () => void
  onToggleEnabled: (itemId: string, enabled: boolean) => void
  onToggleOption: (itemId: string, optionKey: 'generateConceptImage' | 'generateConceptGallery', enabled: boolean) => void
}

function iconForPlanKind(kind: WorldBuildPlanItem['kind']) {
  switch (kind) {
    case 'character':
      return 'character'
    case 'environment':
      return 'environment'
    case 'item':
      return 'item'
    case 'narrative_graph':
      return 'graph'
  }
}

export function WorldBuildPlanModal({
  isStarting,
  planItems,
  prompt,
  requestSummary,
  onCancel,
  onConfirm,
  onToggleEnabled,
  onToggleOption,
}: WorldBuildPlanModalProps) {
  const hasPlanItems = planItems.length > 0

  return (
    <div className="bootstrap-overlay" onClick={onCancel} role="presentation">
      <section className="bootstrap-dialog world-build-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="surface-head">
          <div>
            <span className="eyebrow">Global World Build</span>
            <h2>{requestSummary}</h2>
            <p className="subtle-line">{prompt}</p>
          </div>
          <button className="ghost-button compact" onClick={onCancel} type="button">Close</button>
        </div>
        <div className="world-build-plan-list">
          {hasPlanItems ? planItems.map((item) => (
            <article key={item.id} className={item.enabled ? 'world-build-plan-card' : 'world-build-plan-card is-disabled'}>
              <div className="world-build-plan-card-head">
                <label className="world-build-plan-toggle">
                  <input checked={item.enabled} onChange={(event) => onToggleEnabled(item.id, event.target.checked)} type="checkbox" />
                  <span className="world-build-plan-icon"><EntityIcon id={iconForPlanKind(item.kind)} /></span>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.kind.replace(/_/g, ' ')}</span>
                  </div>
                </label>
              </div>
              <p>{item.summary}</p>
              {item.dependsOn.length > 0 ? <div className="inline-note">Depends on: {item.dependsOn.join(', ')}</div> : null}
              {item.kind === 'character' || item.kind === 'item' ? (
                <label className="world-build-option-row">
                  <input
                    checked={Boolean(item.generationOptions.generateConceptImage)}
                    disabled={!item.enabled}
                    onChange={(event) => onToggleOption(item.id, 'generateConceptImage', event.target.checked)}
                    type="checkbox"
                  />
                  <span>Generate concept image</span>
                </label>
              ) : null}
              {item.kind === 'environment' ? (
                <label className="world-build-option-row">
                  <input
                    checked={Boolean(item.generationOptions.generateConceptGallery)}
                    disabled={!item.enabled}
                    onChange={(event) => onToggleOption(item.id, 'generateConceptGallery', event.target.checked)}
                    type="checkbox"
                  />
                  <span>Generate concept gallery</span>
                </label>
              ) : null}
            </article>
          )) : (
            <div className="inline-note">The planner returned no actionable items for this prompt.</div>
          )}
        </div>
        <div className="bootstrap-footer">
          <div className="inline-note">Confirm to create placeholders immediately and continue generation in the background.</div>
          <button className="primary-button button-with-spinner" disabled={isStarting || !hasPlanItems || planItems.every((item) => !item.enabled)} onClick={onConfirm} type="button">
            {isStarting ? <><span className="button-spinner" aria-hidden="true" />Starting...</> : 'Start generation'}
          </button>
        </div>
      </section>
    </div>
  )
}
