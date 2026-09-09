import { useState } from 'react'
import { Check, GitBranch, X } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'

export function DirectorTakeLibrary({ controller: c }: { controller: DirectorController }) {
  const [showRejected, setShowRejected] = useState(false)
  const takes = c.state.takes.filter(t => showRejected || t.review !== 'rejected')
  return <section className="director-takes" aria-label="Take library"><div className="director-panel-heading"><span>Takes <span className="director-muted">{c.state.takes.length}</span></span><label className="director-check"><input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} /> Show rejected</label></div>
    {!takes.length && <p className="director-empty-line">Generated takes will appear here for comparison.</p>}
    <div className="director-take-strip">{takes.map(t => <article className={`director-take ${c.ui.takeId === t.id ? 'is-selected' : ''}`} key={t.id}>
      <button className="director-take-preview" onClick={() => c.ui.patch({ takeId: t.id, playhead: 0 })} aria-label={`Select take ${t.id.slice(0, 6)}`}>
        {t.asset_key && c.urls[t.asset_key] ? <video src={`${c.urls[t.asset_key]}#t=0.1`} preload="metadata" muted playsInline /> : <span className="director-take-status">{t.status}</span>}
        {t.parent_take_id && <span className="director-branch-badge"><GitBranch size={14} /> {t.branch_seconds?.toFixed(1)}s</span>}
      </button>
      <div className="director-take-label"><span>{t.id.slice(0, 6)} · {t.duration_seconds?.toFixed(1) ?? t.settings.durationSeconds}s</span><span>{t.review === 'kept' ? 'Kept' : t.settings.speed === 'turbo' ? 'Turbo' : 'H3 Max'}</span></div>
      <div className="director-inline-actions"><button disabled={c.ui.busy || t.status !== 'completed' || t.review === 'kept'} onClick={() => void c.execute({ action: 'review', takeId: t.id, review: 'kept' })}><Check size={14} /> Keep</button><button aria-label="Reject take" disabled={c.ui.busy} onClick={() => void c.execute({ action: 'review', takeId: t.id, review: t.review === 'rejected' ? 'candidate' : 'rejected' })}>{t.review === 'rejected' ? 'Restore' : <X size={14} />}</button></div>
    </article>)}</div>
    {c.state.nextCursor && <button disabled={c.ui.busy} onClick={() => void c.loadMore().catch(e => c.ui.patch({ error: String(e) }))}>Load older takes</button>}
  </section>
}
