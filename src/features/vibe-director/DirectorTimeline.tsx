import { ArrowLeft, ArrowRight, ArrowUDownLeft, ArrowUDownRight, X } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'
import type { DirectorClip } from '../../domain/directorWorkspace'

export function DirectorTimeline({ controller: c }: { controller: DirectorController }) {
  const edit = c.state.edits.find(e => e.id === c.state.session?.active_edit_id)
  const clips = edit?.clips ?? []
  const redo = c.state.edits.filter(e => e.parent_id === edit?.id).at(-1)
  const update = (next: DirectorClip[]) => void c.execute({ action: 'edit', clips: next })
  const move = (index: number, delta: number) => { const next = [...clips]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; update(next) }
  return <section className="director-timeline" aria-label="Edit timeline">
    <div className="director-panel-heading"><span>Edit <span className="director-muted">{clips.reduce((n, x) => n + x.outSeconds - x.inSeconds, 0).toFixed(1)}s</span></span><div className="director-inline-actions">
      <button aria-label="Undo edit" disabled={c.ui.busy || !edit?.parent_id} onClick={() => edit?.parent_id && void c.execute({ action: 'restore_edit', editId: edit.parent_id })}><ArrowUDownLeft /></button>
      <button aria-label="Redo edit" disabled={c.ui.busy || !redo} onClick={() => redo && void c.execute({ action: 'restore_edit', editId: redo.id })}><ArrowUDownRight /></button>
    </div></div>
    {!clips.length ? <p className="director-empty-line">Keep a take to begin your edit. Original footage stays available.</p> : <div className="director-timeline-clips">{clips.map((clip, i) => {
      const take = c.state.takes.find(t => t.id === clip.takeId)
      return <div className={`director-edit-clip ${c.ui.takeId === clip.takeId ? 'is-selected' : ''}`} key={`${edit?.id}:${clip.id}`}>
        <button className="director-clip-select" onClick={() => c.ui.patch({ takeId: clip.takeId, playhead: clip.inSeconds, seek: { time: clip.inSeconds, nonce: Date.now() } })}><span>{String(i + 1).padStart(2, '0')}</span><strong>Take {c.state.takes.length - c.state.takes.findIndex(t => t.id === clip.takeId)}</strong></button>
        <div className="director-trim"><label>In<input aria-label={`Clip ${i + 1} in seconds`} type="number" min="0" step="0.04" defaultValue={clip.inSeconds} onBlur={e => { const value = Number(e.target.value); if (value !== clip.inSeconds && value >= 0 && value < clip.outSeconds) update(clips.map(x => x.id === clip.id ? { ...x, inSeconds: value } : x)) }} /></label><label>Out<input aria-label={`Clip ${i + 1} out seconds`} type="number" min={clip.inSeconds + 0.04} max={take?.duration_seconds ?? 15} step="0.04" defaultValue={clip.outSeconds} onBlur={e => { const value = Number(e.target.value); if (value !== clip.outSeconds && value > clip.inSeconds && value <= (take?.duration_seconds ?? 0)) update(clips.map(x => x.id === clip.id ? { ...x, outSeconds: value } : x)) }} /></label></div>
        <div className="director-inline-actions"><button aria-label={`Move clip ${i + 1} earlier`} disabled={c.ui.busy || i === 0} onClick={() => move(i, -1)}><ArrowLeft /></button><button aria-label={`Move clip ${i + 1} later`} disabled={c.ui.busy || i === clips.length - 1} onClick={() => move(i, 1)}><ArrowRight /></button><button aria-label={`Remove clip ${i + 1}`} disabled={c.ui.busy} onClick={() => update(clips.filter(x => x.id !== clip.id))}><X /></button><button disabled={c.ui.busy || !c.ui.takeId || c.ui.takeId === clip.takeId} onClick={() => {
          const replacement = c.state.takes.find(t => t.id === c.ui.takeId)
          if (replacement?.status === 'completed') update(clips.map(x => x.id === clip.id ? { ...x, takeId: replacement.id, inSeconds: 0, outSeconds: Math.min(replacement.duration_seconds ?? 5, clip.outSeconds - clip.inSeconds) } : x))
        }}>Replace</button></div>
      </div>
    })}</div>}
  </section>
}
