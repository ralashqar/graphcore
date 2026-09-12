import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUDownLeft, ArrowUDownRight, X } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'
import type { DirectorClip } from '../../domain/directorWorkspace'
import { formatClock, formatSeconds, takeNumber } from './directorPresentation'

const PX_PER_SECOND = 44
const MIN_CLIP_SECONDS = 0.2
const STEP = 0.04
const round = (value: number) => Math.round(value / STEP) * STEP

type Drag = { clipId: string; edge: 'in' | 'out'; startX: number; startIn: number; startOut: number; max: number }

export function DirectorTimeline({ controller: c }: { controller: DirectorController }) {
  const edit = c.state.edits.find((e) => e.id === c.state.session?.active_edit_id)
  const clips = edit?.clips ?? []
  const children = useMemo(() => c.state.edits.filter((e) => e.parent_id === edit?.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)), [c.state.edits, edit?.id])
  const redo = children.at(-1)
  const [draft, setDraft] = useState<DirectorClip[] | null>(null)
  const drag = useRef<Drag | null>(null)
  const shown = draft ?? clips
  const total = shown.reduce((n, x) => n + x.outSeconds - x.inSeconds, 0)
  const update = (next: DirectorClip[]) => void c.execute({ action: 'edit', clips: next })
  const move = (index: number, delta: number) => {
    const next = [...clips]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    update(next)
  }
  useEffect(() => setDraft(null), [edit?.id])

  const beginDrag = (event: React.PointerEvent, clip: DirectorClip, edge: 'in' | 'out') => {
    if (c.ui.busy) return
    const take = c.state.takes.find((t) => t.id === clip.takeId)
    drag.current = { clipId: clip.id, edge, startX: event.clientX, startIn: clip.inSeconds, startOut: clip.outSeconds, max: take?.duration_seconds ?? clip.outSeconds }
    setDraft(clips)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  const onDrag = (event: React.PointerEvent) => {
    const active = drag.current
    if (!active) return
    const delta = (event.clientX - active.startX) / PX_PER_SECOND
    setDraft((current) => (current ?? clips).map((x) => {
      if (x.id !== active.clipId) return x
      if (active.edge === 'in') return { ...x, inSeconds: round(Math.min(Math.max(0, active.startIn + delta), active.startOut - MIN_CLIP_SECONDS)) }
      return { ...x, outSeconds: round(Math.max(Math.min(active.max, active.startOut + delta), active.startIn + MIN_CLIP_SECONDS)) }
    }))
  }
  const endDrag = () => {
    const active = drag.current
    drag.current = null
    if (!active || !draft) return
    const changed = draft.find((x) => x.id === active.clipId)
    const original = clips.find((x) => x.id === active.clipId)
    setDraft(null)
    if (changed && original && (changed.inSeconds !== original.inSeconds || changed.outSeconds !== original.outSeconds)) update(draft)
  }

  return (
    <section className="director-timeline" aria-label="Edit timeline">
      <div className="director-panel-heading">
        <span>Edit <span className="director-muted">{formatSeconds(total, 1)} · {clips.length} clip{clips.length === 1 ? '' : 's'}</span></span>
        <div className="director-inline-actions">
          <button type="button" className="ghost-button compact" aria-label="Undo edit" title="Undo" disabled={c.ui.busy || !edit?.parent_id} onClick={() => edit?.parent_id && void c.execute({ action: 'restore_edit', editId: edit.parent_id })}><ArrowUDownLeft size={15} /></button>
          <button type="button" className="ghost-button compact" aria-label="Redo latest edit" title={children.length > 1 ? 'Redo (latest revision)' : 'Redo'} disabled={c.ui.busy || !redo} onClick={() => redo && void c.execute({ action: 'restore_edit', editId: redo.id })}><ArrowUDownRight size={15} /></button>
          {children.length > 1 ? (
            <label className="director-revision-pick">
              <span className="sr-only">Restore a later revision</span>
              <select value="" disabled={c.ui.busy} onChange={(event) => event.target.value && void c.execute({ action: 'restore_edit', editId: event.target.value })}>
                <option value="">{children.length} later revisions…</option>
                {children.map((e, i) => <option key={e.id} value={e.id}>Revision {i + 1} · {formatClock(e.created_at)} · {e.clips.length} clips</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      {!clips.length ? <p className="director-empty-line">Keep a take to start the edit. Trim by dragging clip edges; original footage is never changed.</p> : (
        <div className="director-timeline-clips" onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {shown.map((clip, i) => {
            const take = c.state.takes.find((t) => t.id === clip.takeId)
            const length = clip.outSeconds - clip.inSeconds
            const selected = c.ui.takeId === clip.takeId
            const number = takeNumber(c.state.takes, clip.takeId)
            return (
              <div className={`director-edit-clip ${selected ? 'is-selected' : ''}`} key={`${edit?.id}:${clip.id}`} style={{ flexBasis: `${Math.max(150, length * PX_PER_SECOND + 24)}px` }}>
                <button type="button" className="director-clip-select" onClick={() => c.ui.patch({ takeId: clip.takeId, seek: { time: clip.inSeconds, nonce: Date.now() } })}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <strong>Take {number ?? '·'}</strong>
                  <em>{formatSeconds(length, 2)}</em>
                </button>
                <div className="director-clip-track" aria-label={`Clip ${i + 1} trim`}>
                  <div className="director-clip-range" style={{ left: `${take?.duration_seconds ? (clip.inSeconds / take.duration_seconds) * 100 : 0}%`, right: `${take?.duration_seconds ? 100 - (clip.outSeconds / take.duration_seconds) * 100 : 0}%` }}>
                    <button type="button" className="director-clip-handle is-in" aria-label={`Clip ${i + 1} in point ${clip.inSeconds.toFixed(2)} seconds`} onPointerDown={(event) => beginDrag(event, clip, 'in')} />
                    <button type="button" className="director-clip-handle is-out" aria-label={`Clip ${i + 1} out point ${clip.outSeconds.toFixed(2)} seconds`} onPointerDown={(event) => beginDrag(event, clip, 'out')} />
                  </div>
                </div>
                <div className="director-clip-readout"><span>In {clip.inSeconds.toFixed(2)}</span><span>Out {clip.outSeconds.toFixed(2)}</span></div>
                <div className="director-inline-actions">
                  <button type="button" className="ghost-button compact" aria-label={`Move clip ${i + 1} earlier`} disabled={c.ui.busy || i === 0} onClick={() => move(i, -1)}><ArrowLeft size={14} /></button>
                  <button type="button" className="ghost-button compact" aria-label={`Move clip ${i + 1} later`} disabled={c.ui.busy || i === clips.length - 1} onClick={() => move(i, 1)}><ArrowRight size={14} /></button>
                  <button type="button" className="ghost-button compact" disabled={c.ui.busy || !c.ui.takeId || c.ui.takeId === clip.takeId} title="Replace with the selected take" onClick={() => {
                    const replacement = c.state.takes.find((t) => t.id === c.ui.takeId)
                    if (replacement?.status === 'completed') update(clips.map((x) => x.id === clip.id ? { ...x, takeId: replacement.id, inSeconds: 0, outSeconds: Math.min(replacement.duration_seconds ?? 5, clip.outSeconds - clip.inSeconds) } : x))
                  }}>Replace</button>
                  <button type="button" className="ghost-button compact" aria-label={`Remove clip ${i + 1}`} disabled={c.ui.busy} onClick={() => update(clips.filter((x) => x.id !== clip.id))}><X size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
