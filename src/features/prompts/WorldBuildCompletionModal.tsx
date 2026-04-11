import type { WorldBuildBatch } from '../../domain/worldBuild'
import { EntityIcon } from '../../shared/entityIcons'

type WorldBuildCompletionModalProps = {
  batch: WorldBuildBatch
  onClose: () => void
}

function iconForPlanKind(kind: WorldBuildBatch['planItems'][number]['kind']) {
  switch (kind) {
    case 'character':
      return 'character'
    case 'environment':
      return 'environment'
    case 'item':
      return 'item'
    case 'narrative_graph':
      return 'graph'
  }
}

export function WorldBuildCompletionModal({ batch, onClose }: WorldBuildCompletionModalProps) {
  return (
    <div className="bootstrap-overlay" onClick={onClose} role="presentation">
      <section className="bootstrap-dialog world-build-dialog world-build-completion-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="surface-head">
          <div>
            <span className="eyebrow">World Build Complete</span>
            <h2>{batch.requestSummary}</h2>
            <p className="subtle-line">Status: {batch.status.replace(/_/g, ' ')}</p>
          </div>
          <button className="ghost-button compact" onClick={onClose} type="button">Close</button>
        </div>
        <div className="world-build-completion-list">
          {batch.planItems.filter((item) => item.enabled).map((item) => {
            const relatedJobs = batch.jobs.filter((job) => job.planItemId === item.id)
            const hasFailure = relatedJobs.some((job) => job.status === 'failed')
            const isComplete = relatedJobs.length > 0 && relatedJobs.every((job) => job.status === 'succeeded' || job.status === 'skipped')

            return (
              <div key={item.id} className={hasFailure ? 'world-build-completion-row is-error' : 'world-build-completion-row is-success'}>
                <span className="world-build-plan-icon"><EntityIcon id={iconForPlanKind(item.kind)} /></span>
                <div>
                  <strong>{item.name}</strong>
                  <span>{hasFailure ? 'Failed' : isComplete ? 'Completed' : 'In progress'}</span>
                </div>
                <span className="world-build-completion-mark">{hasFailure ? '!' : '✓'}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
