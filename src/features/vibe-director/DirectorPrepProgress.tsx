import { X } from '@phosphor-icons/react'
import type { DirectorPrepRunState } from './useDirectorPrepRun'
import { formatElapsed } from './directorPresentation'

function tone(status: string, waiting: boolean) {
  if (status === 'completed' || status === 'succeeded') return 'ready'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'muted'
  if (status === 'running' || waiting) return 'active'
  return 'muted'
}
function label(status: string, waiting: boolean) {
  if (waiting) return 'Generating'
  switch (status) {
    case 'completed': case 'succeeded': return 'Done'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    case 'running': return 'Running'
    default: return 'Queued'
  }
}

/** Compact progress strip for the take-preparation workflow run (one row per graph node). */
export function DirectorPrepProgress({ run, onDismiss }: { run: DirectorPrepRunState; onDismiss: () => void }) {
  const summary = run.summary
  const title = run.intent === 'frame' ? 'Preparing cast and start frame' : 'Preparing cast references'
  return (
    <section className={`director-prep ${summary?.terminal ? `is-${summary.status}` : 'is-running'}`} aria-live="polite" aria-label="Take preparation progress">
      <div className="director-prep-head">
        <strong>{summary?.terminal ? (summary.status === 'completed' ? 'Preparation complete' : `Preparation ${summary.status.replace(/_/g, ' ')}`) : title}</strong>
        <span className="director-muted">{summary ? `${summary.completed}/${summary.total}` : 'starting'} · {formatElapsed(new Date(run.startedAt).toISOString())}</span>
        {summary?.terminal ? <button type="button" className="ghost-button compact" aria-label="Dismiss preparation" onClick={onDismiss}><X size={13} /></button> : null}
      </div>
      {!summary ? <div className="director-progress" aria-hidden="true" /> : (
        <ul className="director-prep-steps">
          {summary.steps.map((step) => (
            <li key={step.key}>
              <span className={`director-pill is-${tone(step.status, step.waiting)}`}>{label(step.status, step.waiting)}</span>
              <span className="director-prep-step-label">{step.label}</span>
              {step.errorMessage ? <span className="director-take-error" title={step.errorMessage}>{step.errorMessage}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {run.error ? <p className="director-hint is-warning">{run.error}</p> : null}
    </section>
  )
}
