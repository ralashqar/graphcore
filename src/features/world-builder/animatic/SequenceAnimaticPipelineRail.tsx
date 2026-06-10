import { deriveSequenceAnimaticPipeline, type SequenceAnimaticPipelineModel, type SequenceAnimaticStageId } from './sequenceAnimaticPipeline'

/**
 * Single horizontal stage tracker for the sequence-animatic pipeline:
 * Script → Continuity plan → Continuity assets → Storyboards → Keyframes → Video.
 * Replaces scattered per-stage chips with one glanceable "where am I, what's
 * next, what needs attention" rail.
 */
export function SequenceAnimaticPipelineRail({
  model,
  onSelectStage,
}: {
  model: SequenceAnimaticPipelineModel
  onSelectStage?: (stageId: SequenceAnimaticStageId) => void
}) {
  const stages = deriveSequenceAnimaticPipeline(model)
  return (
    <div className="sequence-animatic-pipeline-rail" role="list" aria-label="Animatic pipeline progress">
      {stages.map((stage, index) => (
        <div key={stage.id} className="sequence-animatic-pipeline-rail__segment" role="listitem">
          {index > 0 ? <span className="sequence-animatic-pipeline-rail__connector" aria-hidden="true" /> : null}
          <button
            type="button"
            className={[
              'sequence-animatic-pipeline-rail__stage',
              `is-${stage.status}`,
              stage.isNextAction ? 'is-next-action' : '',
            ].filter(Boolean).join(' ')}
            onClick={onSelectStage ? () => onSelectStage(stage.id) : undefined}
            title={`${stage.label}: ${stage.status}${stage.detail ? ` (${stage.detail})` : ''}`}
          >
            <span className="sequence-animatic-pipeline-rail__dot" aria-hidden="true">
              {stage.status === 'ready' ? '✓' : stage.status === 'failed' ? '!' : stage.status === 'active' ? '' : index + 1}
            </span>
            <span className="sequence-animatic-pipeline-rail__label">{stage.label}</span>
            {stage.detail ? <span className="sequence-animatic-pipeline-rail__detail">{stage.detail}</span> : null}
          </button>
        </div>
      ))}
    </div>
  )
}
