import type { WorldBuildPlanItem } from '../../domain/worldBuild'
import {
  cinematicFormatSubtypeSchema,
  coerceFormatSubtypeForPresetFamily,
  getCinematicFormatSubtypeLabel,
  getCinematicPresetLabel,
  isUgcPresetFamily,
  type CinematicFormatSubtype,
  type CinematicPresetFamily,
} from '../../domain/cinematics'
import { EntityIcon } from '../../shared/entityIcons'

type WorldBuildPlanModalProps = {
  isStarting: boolean
  plannerMode?: 'world_build' | 'cinematic_build'
  cinematicPlan?: {
    entityRefs?: Array<{ id: string; sourceName: string; role: string; resolution: 'existing' | 'create'; definitionKey?: string | null }>
    relationshipRefs?: Array<{ id: string; type: string; sourceRefId: string; targetRefId: string }>
    compositeRefPlans?: Array<{ id: string; title: string }>
    graphSettings?: { presetFamily?: string; presetId?: string; presetSource?: string; specializationMode?: string; formatSubtype?: string | null; formulaFamily?: string | null } | null
    storyboardPlan?: { mode?: string; panels?: Array<{ id: string; title: string }> } | null
    scriptDoc?: {
      title?: string
      logline?: string
      scenes?: Array<{ id: string; title: string; shotIds?: string[] }>
      shots?: Array<{ id: string; title: string; beat?: string; dialogue?: Array<unknown>; actions?: Array<unknown>; audio?: Array<unknown> }>
    } | null
    shots?: Array<{ id: string; title: string; beat: string }>
  } | null
  planItems: WorldBuildPlanItem[]
  prompt: string
  requestSummary: string
  onCancel: () => void
  onConfirm: () => void
  onChangePresetFamily?: (presetFamily: CinematicPresetFamily) => void
  onChangeFormatSubtype?: (formatSubtype: CinematicFormatSubtype) => void
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
    case 'cinematic_graph':
      return 'cinematic'
  }
}

export function WorldBuildPlanModal({
  cinematicPlan,
  isStarting,
  plannerMode = 'world_build',
  planItems,
  prompt,
  requestSummary,
  onCancel,
  onChangePresetFamily,
  onChangeFormatSubtype,
  onConfirm,
  onToggleEnabled,
  onToggleOption,
}: WorldBuildPlanModalProps) {
  const hasPlanItems = planItems.length > 0
  const presetFamily = (cinematicPlan?.graphSettings?.presetFamily as CinematicPresetFamily | undefined) ?? 'story_movie_tv'
  const isUgcPreset = isUgcPresetFamily(presetFamily)
  const subtypeOptions = cinematicFormatSubtypeSchema.options.filter((option) => option === 'contrast_narrative' || coerceFormatSubtypeForPresetFamily(presetFamily, option) === option)
  const formatSubtype = isUgcPreset
    ? coerceFormatSubtypeForPresetFamily(presetFamily, (cinematicPlan?.graphSettings?.formatSubtype as CinematicFormatSubtype | undefined) ?? null)
    : null

  return (
    <div className="bootstrap-overlay" onClick={onCancel} role="presentation">
      <section className="bootstrap-dialog world-build-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="surface-head">
          <div>
            <span className="eyebrow">{plannerMode === 'cinematic_build' ? 'Prompt Cinematic Build' : 'Global World Build'}</span>
            <h2>{requestSummary}</h2>
            <p className="subtle-line">{prompt}</p>
          </div>
          <button className="ghost-button compact" onClick={onCancel} type="button">Close</button>
        </div>
        <div className="world-build-dialog-body">
          {plannerMode === 'cinematic_build' && cinematicPlan ? (
            <div className="world-build-dialog-controls">
              <label className="field-block compact-block">
                <span>Preset</span>
                <select
                  value={presetFamily}
                  onChange={(event) => onChangePresetFamily?.(event.target.value as CinematicPresetFamily)}
                >
                  <option value="story_movie_tv">{getCinematicPresetLabel('story_movie_tv')}</option>
                  <option value="ugc_creator">{getCinematicPresetLabel('ugc_creator')}</option>
                  <option value="ugc_direct_response_ad">{getCinematicPresetLabel('ugc_direct_response_ad')}</option>
                  <option value="ugc_faceless_format">{getCinematicPresetLabel('ugc_faceless_format')}</option>
                </select>
              </label>
              {isUgcPreset && formatSubtype ? (
                <label className="field-block compact-block">
                  <span>Format subtype</span>
                  <select
                    value={formatSubtype}
                    onChange={(event) => onChangeFormatSubtype?.(event.target.value as CinematicFormatSubtype)}
                  >
                    {subtypeOptions.map((option) => <option key={option} value={option}>{getCinematicFormatSubtypeLabel(option)}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {plannerMode === 'cinematic_build' && cinematicPlan?.scriptDoc ? (
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Script Preview</span>
                  <h3>{cinematicPlan.scriptDoc.title ?? 'Generated Script'}</h3>
                </div>
              </div>
              {cinematicPlan.scriptDoc.logline ? <div className="inline-note">{cinematicPlan.scriptDoc.logline}</div> : null}
              <div className="diagnostic-stack">
                {(cinematicPlan.scriptDoc.scenes ?? []).map((scene) => (
                  <div key={scene.id} className="inline-note">
                    <strong>{scene.title}</strong>
                    <span> {(scene.shotIds?.length ?? 0)} shot{(scene.shotIds?.length ?? 0) === 1 ? '' : 's'}</span>
                  </div>
                ))}
                {(cinematicPlan.scriptDoc.shots ?? []).map((shot) => (
                  <div key={shot.id} className="inline-note">
                    <strong>{shot.title}</strong>
                    <span> {shot.beat?.trim() || 'No description yet'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
