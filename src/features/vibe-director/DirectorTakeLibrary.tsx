import { useEffect, useState } from 'react'
import { ArrowClockwise, Check, GitBranch, LifebuoyIcon, X } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'
import { isActiveTakeStatus } from './useDirectorController'
import { formatElapsed, formatSeconds, formatUsd, takeModelLabel, takeNumber, takeStatusLabel, takeTone } from './directorPresentation'

export function DirectorTakeLibrary({ controller: c }: { controller: DirectorController }) {
  const [showRejected, setShowRejected] = useState(false)
  const anyActive = c.state.takes.some((t) => isActiveTakeStatus(t.status))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!anyActive) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [anyActive])
  const takes = c.state.takes.filter((t) => showRejected || t.review !== 'rejected')
  const active = c.state.takes.find((t) => isActiveTakeStatus(t.status))
  return (
    <section className="director-takes" aria-label="Take library">
      <div className="director-panel-heading">
        <span>Takes <span className="director-muted">{c.state.takes.length}</span></span>
        <label className="director-check"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected</label>
      </div>
      {!takes.length ? <p className="director-empty-line">Generated takes appear here for comparison. Keep the ones you like to build the edit.</p> : null}
      <div className="director-take-strip">
        {takes.map((t) => {
          const job = c.state.jobs.find((j) => j.take_id === t.id)
          const tone = takeTone(t, job)
          const number = takeNumber(c.state.takes, t.id)
          const selected = c.ui.takeId === t.id
          return (
            <article className={`director-take is-${tone} ${selected ? 'is-selected' : ''}`} key={t.id}>
              <button type="button" className="director-take-preview" onClick={() => c.ui.patch({ takeId: t.id, seek: { time: 0, nonce: Date.now() } })} aria-label={`Select take ${number ?? ''}`} aria-pressed={selected}>
                {t.asset_key && c.urls[t.asset_key]
                  ? <video src={`${c.urls[t.asset_key]}#t=0.1`} preload="metadata" muted playsInline />
                  : <span className={`director-take-state is-${tone}`}>{takeStatusLabel(t, job)}{isActiveTakeStatus(t.status) ? <small>{formatElapsed(t.created_at, now)}</small> : null}</span>}
                {t.parent_take_id ? <span className="director-branch-badge"><GitBranch size={13} /> {t.branch_mode === 'motion' ? 'motion' : 'frame'} · {formatSeconds(t.branch_seconds, 1)}</span> : null}
                {t.asset_key && c.urls[t.asset_key] ? <span className={`director-pill is-${tone} director-take-pill`}>{takeStatusLabel(t, job)}</span> : null}
              </button>
              <div className="director-take-meta">
                <strong>Take {number ?? '·'}</strong>
                <span className="director-muted">{formatSeconds(t.duration_seconds ?? t.settings.durationSeconds, 1)} · {takeModelLabel(t)} · {t.settings.resolution} · {formatUsd(t.estimated_cost_usd)}</span>
              </div>
              {t.status === 'failed' && t.error_message ? <p className="director-take-error" title={t.error_message}>{t.error_message}</p> : null}
              <div className="director-inline-actions">
                {t.status === 'completed' ? (
                  <button type="button" className={t.review === 'kept' ? 'ghost-button compact is-active' : 'primary-button compact'} disabled={c.ui.busy || t.review === 'kept'} onClick={() => void c.execute({ action: 'review', takeId: t.id, review: 'kept' })}><Check size={14} /> {t.review === 'kept' ? 'Kept' : 'Keep'}</button>
                ) : null}
                {t.status === 'failed' || t.status === 'cancelled' ? (
                  <button type="button" className="ghost-button compact" disabled={c.ui.busy || Boolean(active)} onClick={() => void c.generate()}><ArrowClockwise size={14} /> Retry</button>
                ) : null}
                {job?.phase === 'attention' ? (
                  <button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.recover(job.run_id)}><LifebuoyIcon size={14} /> Recover</button>
                ) : null}
                {isActiveTakeStatus(t.status) ? (
                  <button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.execute({ action: 'cancel', takeId: t.id })}><X size={14} /> Cancel</button>
                ) : (
                  <button type="button" className="ghost-button compact" aria-label={t.review === 'rejected' ? 'Restore take' : 'Reject take'} disabled={c.ui.busy} onClick={() => void c.execute({ action: 'review', takeId: t.id, review: t.review === 'rejected' ? 'candidate' : 'rejected' })}>{t.review === 'rejected' ? 'Restore' : <X size={14} />}</button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {c.state.nextCursor ? <button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.loadMore().catch((e) => c.ui.patch({ error: String(e) }))}>Load older takes</button> : null}
    </section>
  )
}
