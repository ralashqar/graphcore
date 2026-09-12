import { ArrowUpRight } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'

export function DirectorExports({ controller: c, onOpenOutputs }: { controller: DirectorController; onOpenOutputs: () => void }) {
  if (!c.state.exports.length) return null
  return (
    <section className="director-exports" aria-label="Exports">
      <div className="director-panel-heading"><span>Exports</span><button type="button" className="ghost-button compact" onClick={onOpenOutputs}>Open in Outputs <ArrowUpRight size={13} /></button></div>
      <ul>
        {c.state.exports.map((e) => {
          const key = (e.outputs.director as { assetKey?: string } | undefined)?.assetKey
          const url = key ? c.urls[key] : undefined
          const tone = e.status === 'completed' ? 'ready' : e.status === 'failed' || e.status === 'cancelled' ? 'failed' : 'active'
          return (
            <li key={e.id}>
              <span className={`director-pill is-${tone}`}>{e.status === 'completed' ? 'Ready' : e.status === 'failed' ? 'Failed' : e.status === 'cancelled' ? 'Cancelled' : 'Rendering'}</span>
              {url ? <a href={url} target="_blank" rel="noreferrer">Download edit <ArrowUpRight size={13} /></a> : <span className="director-muted">Export {e.id.slice(0, 6)}</span>}
              {e.error_message ? <span className="director-take-error" role="alert">{e.error_message}</span> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
