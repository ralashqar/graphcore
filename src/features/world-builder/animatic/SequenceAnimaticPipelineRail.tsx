import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'
import { WorkflowGraphButton, WorkflowProgressSummary } from '../../workflows/WorkflowProgressWidgets'
import { deriveSequenceAnimaticPipeline, type SequenceAnimaticPipelineModel, type SequenceAnimaticStageId } from './sequenceAnimaticPipeline'

/**
 * Single horizontal stage tracker for the sequence-animatic pipeline:
 * Script -> Continuity plan -> Continuity assets -> Storyboards -> Keyframes -> Video.
 * The optional workflow progress model is the shared runtime view used by
 * Scene Board and output workflows, so this rail can show graph-native state
 * without rebuilding progress logic locally.
 */
export function SequenceAnimaticPipelineRail({
  model,
  onSelectStage,
  workflowProgress,
  onOpenWorkflowGraph,
}: {
  model: SequenceAnimaticPipelineModel
  onSelectStage?: (stageId: SequenceAnimaticStageId) => void
  workflowProgress?: WorkflowProgressViewModel | null
  onOpenWorkflowGraph?: () => void
}) {
  const stages = deriveSequenceAnimaticPipeline(model)
  return (
    <div className="sequence-animatic-pipeline-shell">
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
                {stage.status === 'failed' ? '!' : stage.status === 'ready' || stage.status === 'active' ? '' : index + 1}
              </span>
              <span className="sequence-animatic-pipeline-rail__label">{stage.label}</span>
              {stage.detail ? <span className="sequence-animatic-pipeline-rail__detail">{stage.detail}</span> : null}
            </button>
          </div>
        ))}
      </div>
      {workflowProgress ? (
        <WorkflowProgressSummary model={workflowProgress} compact>
          <WorkflowGraphButton disabled={!workflowProgress.workflowId} onOpen={onOpenWorkflowGraph} />
        </WorkflowProgressSummary>
      ) : null}
    </div>
  )
}
