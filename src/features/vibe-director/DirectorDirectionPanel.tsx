import { useEffect, useMemo, useRef } from 'react'
import { ArrowClockwise, ArrowUDownLeft, ArrowUpRight, MagicWand, Sparkle, Stop } from '@phosphor-icons/react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import type { DirectorController } from './useDirectorController'
import { isActiveTakeStatus } from './useDirectorController'
import { directorAspectRatios, directorResolutions, directorSourceSchema } from '../../domain/directorWorkspace'
import { estimateH3Cost, h3Model } from '../../domain/h3Video'
import { directorEstimateReferences, type DirectorCastMember } from '../../domain/directorCast'
import { VIBE_DIRECTING_STYLE_PRESETS } from '../../domain/vibeDirector'
import { formatClock } from './directorPresentation'

const CREDITS_PER_USD = 100
const STYLE_LINE = /^Style:.*$/m

function withStyleLine(direction: string, line: string) {
  const stripped = direction.replace(STYLE_LINE, '').trim()
  return `${stripped}${stripped ? '\n' : ''}${line}`
}

export function DirectorDirectionPanel({ controller: c, cast, snapshot, onOpenCast }: {
  controller: DirectorController
  cast: DirectorCastMember[]
  snapshot: ProjectSnapshot
  onOpenCast: () => void
}) {
  const settings = c.ui.settings
  const session = c.state.session
  const active = c.state.takes.find((t) => isActiveTakeStatus(t.status))
  const selected = c.state.takes.find((t) => t.id === c.ui.takeId)
  const selectedClip = c.state.edits.find((e) => e.id === session?.active_edit_id)?.clips.find((clip) => clip.takeId === selected?.id)
  const shotReferences = useMemo(() => { const parsed = directorSourceSchema.safeParse(session?.source); return parsed.success ? (parsed.data.references ?? []) : [] }, [session?.source])
  const references = useMemo(() => directorEstimateReferences({ settings, cast, assets: snapshot.assets, shotReferences }), [settings, cast, snapshot.assets, shotReferences])
  const estimate = estimateH3Cost(settings, references)
  const credits = Math.max(1, Math.ceil(estimate * CREDITS_PER_USD))
  const readyCast = cast.filter((member) => member.status === 'ready')
  let modelLabel = ''
  let contractError = ''
  try {
    const model = h3Model(settings, references)
    modelLabel = model.endsWith('reference-to-video') ? 'Reference to video' : model.endsWith('image-to-video') ? 'Image to video' : 'Text to video'
  } catch (error) {
    contractError = error instanceof Error ? error.message : String(error)
  }
  const castMissing = cast.length > 0 && readyCast.length === 0 && !settings.firstFrameAssetKey
  const blockers = [
    !c.canRun && 'This workspace is read-only.',
    !session && 'Open a scene first.',
    !c.ui.direction.trim() && 'Describe the take.',
    contractError,
    castMissing && 'The cast has no reference images yet. Generate sheets or pick a starting frame.',
    active && 'A take is already generating.',
  ].filter((entry): entry is string => Boolean(entry))
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [c.state.messages.length])

  const applyPreset = (id: string) => {
    const preset = VIBE_DIRECTING_STYLE_PRESETS.find((entry) => entry.id === id)
    if (!preset) return
    c.setDirection(withStyleLine(c.ui.direction, `Style: ${preset.label} — ${preset.coverageStyle}; ${preset.cameraLanguage}; ${preset.moodEngine}.`))
  }
  const activePreset = VIBE_DIRECTING_STYLE_PRESETS.find((preset) => c.ui.direction.includes(`Style: ${preset.label}`))?.id ?? ''
  const autosave = () => {
    if (c.ui.dirty && session && !c.ui.busy) void c.saveDirection()
  }

  return (
    <aside className="director-direction" aria-label="Direction">
      <div className="director-panel-heading"><span>Direct</span><span className="director-muted">{c.ui.dirty ? 'Unsaved changes' : session ? 'Saved' : ''}</span></div>
      <div className="director-conversation" ref={log} aria-live="polite">
        {c.state.messages.length ? c.state.messages.map((m) => (
          <div className={`director-message is-${m.role}`} key={m.id}>
            <span>{m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Director’s assistant' : 'Studio'} · {formatClock(m.created_at)}</span>
            <p>{m.text}</p>
          </div>
        )) : (
          <div className="director-conversation-intro">
            <strong>What should happen in this take?</strong>
            <p>Describe the action, camera and performance. Your cast references stay attached; each take keeps a snapshot of them.</p>
          </div>
        )}
      </div>
      <div className="director-compose">
        <label htmlFor="director-direction-input" className="section-label">Next take</label>
        <textarea
          id="director-direction-input"
          placeholder="A slow push toward her face. She pauses before answering…"
          value={c.ui.direction}
          onChange={(e) => c.setDirection(e.target.value)}
          onBlur={autosave}
          rows={5}
        />
        <div className="director-inline-actions director-assist-row">
          <button type="button" className="ghost-button compact" disabled={!c.canRun || c.ui.busy || !session || !c.ui.direction.trim()} title="Rewrite the direction as a tight H3 shot direction" onClick={() => void c.assist('polish')}><MagicWand size={14} /> Polish direction</button>
          <button type="button" className="ghost-button compact" disabled={!c.canRun || c.ui.busy || !session} title="Ask the assistant what the next take could be" onClick={() => void c.assist('suggest')}><Sparkle size={14} /> Suggest next take</button>
          {c.ui.assistUndo !== null ? <button type="button" className="ghost-button compact" onClick={c.undoAssist}><ArrowUDownLeft size={14} /> Undo rewrite</button> : null}
        </div>
        <div className="chip-row director-presets" role="group" aria-label="Directing style">
          {VIBE_DIRECTING_STYLE_PRESETS.map((preset) => (
            <button type="button" key={preset.id} className={`chip director-preset-chip ${activePreset === preset.id ? 'is-active' : ''}`} title={`${preset.coverageStyle}. ${preset.cameraLanguage}.`} onClick={() => applyPreset(preset.id)}>{preset.label}</button>
          ))}
        </div>
        <div className="director-settings">
          <label>Mode
            <select value={settings.mode} onChange={(e) => c.updateSettings({ mode: e.target.value as typeof settings.mode })}><option value="scripted">Follow script</option><option value="explore">Explore scene</option></select>
          </label>
          <label>Model
            <select value={settings.speed} onChange={(e) => c.updateSettings({ speed: e.target.value as typeof settings.speed })}><option value="standard">H3 Max</option><option value="turbo">H3 Max Turbo</option></select>
          </label>
          <label>Resolution
            <select value={settings.resolution} onChange={(e) => c.updateSettings({ resolution: e.target.value as typeof settings.resolution })}>{directorResolutions.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label>Aspect
            <select value={settings.aspectRatio} disabled={Boolean(settings.firstFrameAssetKey)} title={settings.firstFrameAssetKey ? 'Image-to-video inherits the starting frame’s ratio' : undefined} onChange={(e) => c.updateSettings({ aspectRatio: e.target.value as typeof settings.aspectRatio })}>
              {directorAspectRatios.filter((r) => r !== 'adaptive' || readyCast.length > 0).map((r) => <option key={r} value={r}>{r === 'adaptive' ? 'Adaptive (from references)' : r}</option>)}
            </select>
          </label>
          <label className="director-length">Length <span className="director-muted">{Math.max(5, Math.ceil(settings.durationSeconds))} s</span>
            <input type="range" min={5} max={15} step={1} value={Math.max(5, Math.ceil(settings.durationSeconds))} onChange={(e) => c.updateSettings({ durationSeconds: Number(e.target.value) })} />
          </label>
          <label>Prompt expansion
            <select value={settings.promptExpansion} onChange={(e) => c.updateSettings({ promptExpansion: e.target.value as typeof settings.promptExpansion })}><option value="balanced">Balanced (fast)</option><option value="quality">Quality (slower)</option></select>
          </label>
        </div>
        <p className="director-estimate">
          {modelLabel ? <span className="director-pill is-muted">{modelLabel}</span> : null}
          <span>≈ ${estimate.toFixed(2)} · {credits} credits · {Math.max(5, Math.ceil(settings.durationSeconds))} s at {settings.resolution}{references.length ? ` · ${references.length} reference${references.length === 1 ? '' : 's'}` : ''}</span>
        </p>
        {cast.length > 0 ? (
          <p className="director-hint">
            {readyCast.length} of {cast.length} cast references ready{readyCast.length < cast.length ? <> · <button type="button" className="director-text-button" onClick={onOpenCast}>fix in Cast <ArrowUpRight size={12} /></button></> : null}
          </p>
        ) : null}
        {blockers.length && session && c.ui.direction.trim() ? <p className="director-hint is-warning">{blockers[0]}</p> : null}
        <button type="button" className="primary-button director-generate" disabled={blockers.length > 0 || c.ui.busy} onClick={() => void c.generate()}>Generate take <ArrowUpRight size={18} /></button>
        <div className="director-inline-actions">
          <button type="button" className="ghost-button compact" disabled={c.ui.busy || !selected || Boolean(active) || blockers.some((b) => b !== 'Describe the take.')} title="Generate again with the current direction" onClick={() => void c.generate()}><ArrowClockwise size={14} /> Try again</button>
          <button type="button" className="ghost-button compact" disabled={c.ui.busy || selected?.status !== 'completed' || !selectedClip || Boolean(active)} title="Continue from the end of the selected clip" onClick={() => selected && void c.generate({ parentTakeId: selected.id, branchSeconds: selectedClip?.outSeconds ?? 0, branchMode: 'frame' })}>Continue</button>
          {active ? <button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.execute({ action: 'cancel', takeId: active.id })}><Stop size={14} /> Cancel take</button> : null}
        </div>
      </div>
    </aside>
  )
}
