import type { ReactNode } from 'react'
import { ArrowsClockwise, ImageSquare, Plus, Sparkle, UserPlus, X } from '@phosphor-icons/react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { EntityIcon } from '../../shared/entityIcons'
import { iconForWorldEntity } from '../../domain/worldGraphHelpers'
import { DIRECTOR_CAST_KIND_LABEL, directorCastReadiness, type DirectorCastMember } from '../../domain/directorCast'
import type { DirectorController } from './useDirectorController'
import type { DirectorRailTab } from './directorStore'
import { sourceExcerpt, type DirectorSource } from './sourceBridge'

export type DirectorRailActions = {
  onChangeSource: (source: DirectorSource) => void
  onPrepareKeyframe: () => void
  preparingKeyframe: boolean
  onOpenEntityPicker: () => void
  onOpenNewEntity: () => void
  onGenerateSheet: (member: DirectorCastMember) => void
  onGenerateMissing: () => void
  onRemoveCast: (key: string) => void
  onOpenFramePicker: (slot: 'first' | 'end') => void
  onClearFrame: (slot: 'first' | 'end') => void
  onComposeFrame: () => void
  composingFrame: boolean
  sheetJobsStarting: Set<string>
}

export function DirectorSceneRail({ controller: c, snapshot, sources, activeSource, cast, actions, shotBrief }: {
  controller: DirectorController
  snapshot: ProjectSnapshot
  sources: DirectorSource[]
  activeSource: DirectorSource | undefined
  cast: DirectorCastMember[]
  actions: DirectorRailActions
  /** Chapter shot picker and brief for animatic-sourced sessions. */
  shotBrief?: ReactNode
}) {
  const session = c.state.session
  const script = String(session?.source.script ?? '')
  const readiness = directorCastReadiness(cast)
  const tab = c.ui.railTab
  const setTab = (railTab: DirectorRailTab) => c.ui.patch({ railTab })
  const canCompose = c.canRun && !actions.composingFrame && Boolean(c.ui.direction.trim() || script.trim()) && (readiness.ready > 0 || cast.length === 0)
  const frameSlot = (slot: 'first' | 'end') => {
    const key = slot === 'first' ? c.ui.settings.firstFrameAssetKey : c.ui.settings.endFrameAssetKey
    const asset = snapshot.assets.find((a) => a.key === key)
    const url = key ? c.urls[key] : undefined
    return (
      <div className={`director-frame-slot ${key ? 'is-set' : ''}`}>
        <button type="button" className="director-frame-thumb" onClick={() => actions.onOpenFramePicker(slot)} aria-label={`${slot === 'first' ? 'Starting' : 'Ending'} frame`}>
          {url ? <img src={url} alt="" /> : <span className="director-frame-empty"><ImageSquare size={22} aria-hidden="true" />{slot === 'first' ? 'Choose start frame' : 'Choose end frame'}</span>}
        </button>
        <div className="director-frame-meta">
          <strong>{slot === 'first' ? 'Start' : 'End'}</strong>
          <span className="director-muted">{asset ? asset.name || asset.key : slot === 'first' ? 'Optional · uses cast references when empty' : 'Optional · needs a start frame'}</span>
          {key ? <button type="button" className="director-text-button" onClick={() => actions.onClearFrame(slot)}>Clear</button> : null}
        </div>
      </div>
    )
  }

  return (
    <nav className="director-rail" aria-label="Scene, cast and frames">
      <div className="tabbar director-rail-tabs" role="tablist" aria-label="Rail sections">
        {(['scene', 'cast', 'frames'] as DirectorRailTab[]).map((id) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} className={`tab-button ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            {id === 'scene' ? 'Scene' : id === 'cast' ? `Cast${cast.length ? ` · ${cast.length}` : ''}` : 'Frames'}
          </button>
        ))}
      </div>

      <section className={`director-rail-section ${tab === 'scene' ? 'is-active' : ''}`} aria-label="Scene">
        <div className="director-panel-heading"><span>Scene</span></div>
        <div className="director-source-current">
          <span className="director-source-kind">{activeSource ? (activeSource.kind === 'shot' ? 'Shot' : activeSource.kind === 'output' ? 'Screenplay' : 'Sequence') : 'Scene brief'}</span>
          <strong>{activeSource?.title ?? session?.title ?? 'Scene'}</strong>
          {activeSource?.subtitle ? <span className="director-muted">{activeSource.subtitle}</span> : null}
          {script.trim() ? (
            <details className="director-script">
              <summary>{sourceExcerpt(script, 140)}</summary>
              <p>{script}</p>
            </details>
          ) : <p className="director-muted">No script text. Your direction carries the scene.</p>}
        </div>
        {shotBrief}
        {sources.length ? (
          <label className="director-field">
            <span className="section-label">{shotBrief ? 'Switch to another source' : 'Switch scene or shot'}</span>
            <select value="" disabled={c.ui.busy || !c.canRun} onChange={(e) => { const next = sources.find((s) => s.id === e.target.value); if (next) actions.onChangeSource(next) }}>
              <option value="">Keep current scene</option>
              {(['shot', 'output', 'sequence'] as const).filter((kind) => sources.some((s) => s.kind === kind)).map((kind) => (
                <optgroup key={kind} label={kind === 'shot' ? 'Shots' : kind === 'output' ? 'Screenplays' : 'Sequences'}>
                  {sources.filter((s) => s.kind === kind).slice(0, 80).map((s) => <option key={s.id} value={s.id}>{s.title}{s.subtitle ? ` — ${s.subtitle}` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}
        <p className="director-muted director-rail-note">Switching scenes keeps saved takes and the edit; only the script context changes.</p>
      </section>

      <section className={`director-rail-section ${tab === 'cast' ? 'is-active' : ''}`} aria-label="Cast and ingredients">
        <div className="director-panel-heading">
          <span>Cast & ingredients</span>
          <span className={`director-pill ${readiness.total === 0 ? 'is-muted' : readiness.ready === readiness.total ? 'is-ready' : 'is-active'}`}>{readiness.total ? `${readiness.ready}/${readiness.total} ready` : 'none'}</span>
        </div>
        {cast.length ? (
          <ul className="director-cast-list">
            {cast.map((member) => {
              const url = member.referenceAssetKey ? c.urls[member.referenceAssetKey] : undefined
              const starting = actions.sheetJobsStarting.has(member.key)
              return (
                <li key={member.key} className={`director-cast-card is-${member.status}`}>
                  <div className="director-cast-thumb">
                    {url ? <img src={url} alt="" /> : <EntityIcon id={iconForWorldEntity(member.nodeType)} className="director-cast-icon" />}
                  </div>
                  <div className="director-cast-body">
                    <strong title={member.visual}>{member.name}</strong>
                    <span className="director-muted">{DIRECTOR_CAST_KIND_LABEL[member.kind]} · <span className={`director-pill is-${member.status === 'ready' ? 'ready' : member.status === 'generating' ? 'active' : member.status === 'failed' ? 'failed' : 'muted'}`}>{starting ? 'Starting…' : member.statusLabel}</span></span>
                    {member.errorMessage ? <span className="director-take-error" title={member.errorMessage}>{member.errorMessage}</span> : null}
                  </div>
                  <div className="director-cast-actions">
                    {member.status === 'missing' || member.status === 'failed' ? (
                      <button type="button" className="ghost-button compact" disabled={!c.canRun || starting} title="Generate a reference sheet in the project art style" onClick={() => actions.onGenerateSheet(member)}><Sparkle size={13} /> {member.status === 'failed' ? 'Retry sheet' : 'Sheet'}</button>
                    ) : member.status === 'ready' ? (
                      <button type="button" className="ghost-button compact" disabled={!c.canRun || starting} title="Regenerate the reference sheet" onClick={() => actions.onGenerateSheet(member)}><ArrowsClockwise size={13} /></button>
                    ) : null}
                    <button type="button" className="ghost-button compact" aria-label={`Remove ${member.name} from cast`} onClick={() => actions.onRemoveCast(member.key)}><X size={13} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <p className="director-muted director-rail-note">No cast yet. Add characters, locations and props from your world, or create new ones here; each needs a reference sheet before it can appear in a take.</p>}
        <div className="director-inline-actions director-rail-actions">
          <button type="button" className="ghost-button compact" disabled={!c.canRun} onClick={actions.onOpenEntityPicker}><Plus size={14} /> From world</button>
          <button type="button" className="ghost-button compact" disabled={!c.canRun} onClick={actions.onOpenNewEntity}><UserPlus size={14} /> New character</button>
          {readiness.missing.length > 1 ? <button type="button" className="ghost-button compact" disabled={!c.canRun} title="Generates the missing reference sheets in parallel on the workflow graph" onClick={actions.onGenerateMissing}><Sparkle size={14} /> Prepare {readiness.missing.length} sheets</button> : null}
        </div>
      </section>

      <section className={`director-rail-section ${tab === 'frames' ? 'is-active' : ''}`} aria-label="Frames">
        <div className="director-panel-heading"><span>Frames</span></div>
        {frameSlot('first')}
        {frameSlot('end')}
        <div className="director-inline-actions director-rail-actions">
          <button type="button" className="ghost-button compact" disabled={!canCompose} title="Generate a starting frame from the scene, cast references and direction" onClick={actions.onComposeFrame}><Sparkle size={14} /> {actions.composingFrame ? 'Composing…' : 'Compose start frame'}</button>
          {session?.source.requestId ? <button type="button" className="ghost-button compact" disabled={!c.canRun || actions.preparingKeyframe || c.ui.busy} title="Run the animatic keyframe workflow for this shot" onClick={actions.onPrepareKeyframe}>{actions.preparingKeyframe ? 'Preparing…' : 'Prepare shot keyframe'}</button> : null}
        </div>
        <p className="director-muted director-rail-note">A start frame switches the take to image-to-video and locks its aspect ratio. Turbo requires one.</p>
      </section>
    </nav>
  )
}
