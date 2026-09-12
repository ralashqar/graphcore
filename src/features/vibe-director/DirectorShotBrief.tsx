import { ArrowsClockwise, FilmStrip, TextAlignLeft } from '@phosphor-icons/react'
import type { SequenceAnimaticShotView } from '../world-builder/animatic/sequenceAnimaticViewModel'
import type { SequenceAnimaticShotIngredient } from '../world-builder/animatic/sequenceAnimaticShotWorkspace'
import type { DirectorShotPick } from './useDirectorShotModel'

function ingredientTone(status: SequenceAnimaticShotIngredient['status']) {
  if (status === 'ready') return 'ready'
  if (status === 'generating') return 'active'
  if (status === 'failed' || status === 'stale') return 'failed'
  return 'muted'
}

/**
 * Chapter shot brief for animatic-sourced sessions: scene → shot picker from the animatic view model,
 * the shot's action / dialogue / camera / performance, and its ingredients with their readiness.
 */
export function DirectorShotBrief({ scenes, shot, sceneTitle, ingredients, loading, error, busy, attachedCount, onPickShot, onUseBrief, onRefreshIngredients }: {
  scenes: DirectorShotPick[]
  shot: SequenceAnimaticShotView | null
  sceneTitle: string
  ingredients: SequenceAnimaticShotIngredient[]
  loading: boolean
  error: string | null
  busy: boolean
  /** Ingredient references currently stored on the session source. */
  attachedCount: number
  onPickShot: (shotId: string) => void
  onUseBrief: () => void
  onRefreshIngredients: () => void
}) {
  const visual = ingredients.filter((ingredient) => ingredient.kind !== 'camera' && ingredient.kind !== 'lighting' && ingredient.kind !== 'dialogue' && ingredient.kind !== 'performance')
  const ready = visual.filter((ingredient) => ingredient.status === 'ready' && ingredient.assetKey).length
  return (
    <div className="director-shot-brief">
      <label className="director-field">
        <span className="section-label">Chapter shot</span>
        <select value={shot?.id ?? ''} disabled={busy || !scenes.length} onChange={(event) => event.target.value && onPickShot(event.target.value)}>
          <option value="">{scenes.length ? 'Choose a shot…' : loading ? 'Loading shots…' : 'No shots planned yet'}</option>
          {scenes.map((scene) => (
            <optgroup key={scene.sceneId} label={scene.sceneTitle}>
              {scene.shots.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.durationLabel ? ` · ${entry.durationLabel}` : ''}{entry.shotVideoReady ? ' · video' : entry.keyframeStatusLabel.includes('ready') ? ' · keyframe' : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {error ? <p className="director-hint is-warning">{error}</p> : null}
      {shot ? (
        <div className="director-shot-detail">
          <div className="director-source-kind"><FilmStrip size={13} /> {sceneTitle} · {shot.title}{shot.timeLabel ? ` · ${shot.timeLabel}` : ''}</div>
          {shot.action ? <p className="director-shot-action">{shot.action}</p> : null}
          {shot.dialogue.length ? (
            <ul className="director-shot-dialogue">
              {shot.dialogue.slice(0, 6).map((line) => <li key={line.id}><strong>{line.speakerName || 'Voice'}</strong> “{line.text}”{line.emotion ? <span className="director-muted"> · {line.emotion}</span> : null}</li>)}
            </ul>
          ) : null}
          <dl className="director-shot-meta">
            {shot.camera ? <><dt>Camera</dt><dd>{shot.camera}</dd></> : null}
            {shot.lighting ? <><dt>Lighting</dt><dd>{shot.lighting}</dd></> : null}
            {shot.performance ? <><dt>Performance</dt><dd>{shot.performance}</dd></> : null}
            {shot.coverageSetupLabel ? <><dt>Coverage</dt><dd>{shot.coverageSetupLabel}</dd></> : null}
          </dl>
          <div className="director-inline-actions">
            <button type="button" className="ghost-button compact" disabled={busy} title="Seed the direction from the shot's action, dialogue, camera and performance" onClick={onUseBrief}><TextAlignLeft size={13} /> Use shot brief as direction</button>
            <button type="button" className="ghost-button compact" disabled={busy || ready === attachedCount} title="Attach the shot's ready ingredients as H3 references" onClick={onRefreshIngredients}><ArrowsClockwise size={13} /> Attach {ready} ingredient{ready === 1 ? '' : 's'}</button>
          </div>
          {visual.length ? (
            <ul className="director-ingredients" aria-label="Shot ingredients">
              {visual.map((ingredient) => (
                <li key={ingredient.id} className={`director-ingredient is-${ingredientTone(ingredient.status)}`} title={ingredient.visualBrief || ingredient.usageLabel}>
                  {ingredient.imageUrl ? <img src={ingredient.imageUrl} alt="" /> : <span className="director-ingredient-blank" aria-hidden="true" />}
                  <span className="director-ingredient-body"><strong>{ingredient.name}</strong><span className="director-muted">{ingredient.typeLabel}</span></span>
                  <span className={`director-pill is-${ingredientTone(ingredient.status)}`}>{ingredient.statusLabel}</span>
                </li>
              ))}
            </ul>
          ) : <p className="director-muted director-rail-note">No continuity ingredients for this shot yet. Prepare them in the World animatic view.</p>}
          <p className="director-muted director-rail-note">{attachedCount} ingredient reference{attachedCount === 1 ? '' : 's'} attached to takes. Cast sheets carry identity; ingredients carry setting and props.</p>
        </div>
      ) : null}
    </div>
  )
}
