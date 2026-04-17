import type { WorldBuildPlanItem, WorldBuildPlannerMode } from '../../domain/worldBuild'
import {
  cinematicFormatSubtypeSchema,
  cinematicStoryLanguagePresetSchema,
  cinematicStoryScenePresetSchema,
  coerceFormatSubtypeForPresetFamily,
  getCinematicFormatSubtypeLabel,
  getCinematicPresetLabel,
  getCinematicStoryLanguagePresetLabel,
  getCinematicStoryScenePresetLabel,
  isUgcPresetFamily,
  type CinematicFormatSubtype,
  type CinematicPresetFamily,
  type CinematicStoryLanguagePreset,
  type CinematicStoryScenePreset,
} from '../../domain/cinematics'
import { EntityIcon } from '../../shared/entityIcons'

type WorldBuildPlanModalProps = {
  isStarting: boolean
  plannerMode?: WorldBuildPlannerMode
  cinematicPlan?: {
    graphSummary?: string
    entityRefs?: Array<{ id: string; kind: 'character' | 'environment' | 'item'; sourceName: string; role: string; resolution: 'existing' | 'create'; definitionKey?: string | null }>
    relationshipRefs?: Array<{ id: string; type: string; sourceRefId: string; targetRefId: string }>
    compositeRefPlans?: Array<{ id: string; title: string }>
    graphSettings?: { presetFamily?: string; presetId?: string; presetSource?: string; specializationMode?: string; storyScenePreset?: string | null; storyLanguagePreset?: string | null; formatSubtype?: string | null; formulaFamily?: string | null } | null
    storyboardPlan?: { mode?: string; panels?: Array<{ id: string; title: string }> } | null
    scriptDoc?: {
      title?: string
      logline?: string
      scenes?: Array<{ id: string; title: string; shotIds?: string[] }>
      shots?: Array<{ id: string; title: string; beat?: string; durationSeconds?: number | null; dialogue?: Array<unknown>; actions?: Array<unknown>; audio?: Array<unknown> }>
    } | null
    shots?: Array<{ id: string; title: string; beat: string; durationSeconds?: number | null }>
  } | null
  planItems: WorldBuildPlanItem[]
  prompt: string
  requestSummary: string
  onCancel: () => void
  onConfirm: () => void
  onChangePresetFamily?: (presetFamily: CinematicPresetFamily) => void
  onChangeFormatSubtype?: (formatSubtype: CinematicFormatSubtype) => void
  onChangeStoryScenePreset?: (storyScenePreset: CinematicStoryScenePreset) => void
  onChangeStoryLanguagePreset?: (storyLanguagePreset: CinematicStoryLanguagePreset) => void
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
  onChangeStoryLanguagePreset,
  onChangeStoryScenePreset,
  onConfirm,
  onToggleEnabled,
  onToggleOption,
}: WorldBuildPlanModalProps) {
  const hasPlanItems = planItems.length > 0
  const presetFamily = (cinematicPlan?.graphSettings?.presetFamily as CinematicPresetFamily | undefined) ?? 'story_movie_tv'
  const isUgcPreset = isUgcPresetFamily(presetFamily)
  const storyScenePreset = presetFamily === 'story_movie_tv'
    ? ((cinematicPlan?.graphSettings?.storyScenePreset as CinematicStoryScenePreset | undefined) ?? 'dialogue_two_hander')
    : null
  const storyLanguagePreset = presetFamily === 'story_movie_tv'
    ? ((cinematicPlan?.graphSettings?.storyLanguagePreset as CinematicStoryLanguagePreset | undefined) ?? 'grounded_naturalist')
    : null
  const subtypeOptions = cinematicFormatSubtypeSchema.options.filter((option) => option === 'contrast_narrative' || coerceFormatSubtypeForPresetFamily(presetFamily, option) === option)
  const formatSubtype = isUgcPreset
    ? coerceFormatSubtypeForPresetFamily(presetFamily, (cinematicPlan?.graphSettings?.formatSubtype as CinematicFormatSubtype | undefined) ?? null)
    : null
  const previewShots = cinematicPlan?.scriptDoc?.shots ?? cinematicPlan?.shots ?? []
  const previewEntities = cinematicPlan?.entityRefs ?? []
  const estimatedRuntimeSeconds = previewShots.reduce((sum, shot) => {
    const duration =
      'durationSeconds' in shot && typeof shot.durationSeconds === 'number'
        ? shot.durationSeconds
        : null
    return sum + (duration ?? 0)
  }, 0)

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
              {!isUgcPreset && storyScenePreset ? (
                <label className="field-block compact-block">
                  <span>Scene preset</span>
                  <select
                    value={storyScenePreset}
                    onChange={(event) => onChangeStoryScenePreset?.(event.target.value as CinematicStoryScenePreset)}
                  >
                    {cinematicStoryScenePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryScenePresetLabel(option)}</option>)}
                  </select>
                </label>
              ) : null}
              {!isUgcPreset && storyLanguagePreset ? (
                <label className="field-block compact-block">
                  <span>Language preset</span>
                  <select
                    value={storyLanguagePreset}
                    onChange={(event) => onChangeStoryLanguagePreset?.(event.target.value as CinematicStoryLanguagePreset)}
                  >
                    {cinematicStoryLanguagePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryLanguagePresetLabel(option)}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {plannerMode === 'cinematic_build' && cinematicPlan ? (
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Cinematic Preview</span>
                  <h3>{cinematicPlan.graphSummary ?? 'Prompt cinematic'}</h3>
                </div>
              </div>
              <div className="diagnostic-stack">
                <div className="inline-note">
                  <strong>Preset</strong>
                  <span>
                    {' '}
                    {getCinematicPresetLabel(presetFamily)}
                    {presetFamily === 'story_movie_tv' && storyScenePreset && storyLanguagePreset
                      ? ` · ${getCinematicStoryScenePresetLabel(storyScenePreset)} · ${getCinematicStoryLanguagePresetLabel(storyLanguagePreset)}`
                      : formatSubtype
                        ? ` · ${getCinematicFormatSubtypeLabel(formatSubtype)}`
                        : ''}
                  </span>
                </div>
                <div className="inline-note">
                  <strong>Resolved refs</strong>
                  <span> {previewEntities.length}</span>
                </div>
                <div className="inline-note">
                  <strong>Shots</strong>
                  <span> {previewShots.length}{estimatedRuntimeSeconds > 0 ? ` · ~${estimatedRuntimeSeconds}s` : ''}</span>
                </div>
              </div>
              {previewEntities.length > 0 ? (
                <div className="script-chip-row">
                  {previewEntities.map((entity) => (
                    <div key={entity.id} className="script-binding-chip">
                      <span className="script-binding-chip-icon"><EntityIcon id={entity.kind} /></span>
                      <div className="script-binding-chip-copy">
                        <strong>{entity.sourceName}</strong>
                        <span>{entity.kind} / {entity.role} / {entity.resolution}</span>
                      </div>
                    </div>
                  ))}
                </div>
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
                {(cinematicPlan.scriptDoc.shots ?? []).slice(0, 4).map((shot) => (
                  <div key={shot.id} className="inline-note">
                    <strong>{shot.title}</strong>
                    <span> {shot.beat?.trim() || 'No description yet'}{typeof (shot as { durationSeconds?: unknown }).durationSeconds === 'number' ? ` · ${(shot as { durationSeconds: number }).durationSeconds}s` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {plannerMode === 'cinematic_build' && !cinematicPlan?.scriptDoc && previewShots.length > 0 ? (
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Shot Breakdown</span>
                  <h3>{previewShots.length} planned shot{previewShots.length === 1 ? '' : 's'}</h3>
                </div>
              </div>
              <div className="diagnostic-stack">
                {previewShots.slice(0, 4).map((shot) => (
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
                {item.kind === 'character' || item.kind === 'item' || item.kind === 'environment' ? (
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
