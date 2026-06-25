import type { ReactNode } from 'react'

import type { WorkflowProgressNodeView, WorkflowProgressViewModel } from '../../domain/workflowProgressView'

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function activeLabel(model: WorkflowProgressViewModel) {
  return model.activeProgressLabel || model.activeNodeLabel || model.activeManifestPurpose || statusLabel(model.status)
}

export function WorkflowProviderStatusBadge({ model }: { model: WorkflowProgressViewModel }) {
  if (!model.providerStatus && !model.providerRequestId) return null
  return (
    <span className="workflow-provider-status-badge" title={model.providerRequestId || model.providerStatus}>
      {model.providerStatus || 'provider running'}
    </span>
  )
}

export function WorkflowGraphButton({
  disabled = false,
  label = 'Workflow graph',
  onOpen,
}: {
  disabled?: boolean
  label?: string
  onOpen?: () => void
}) {
  if (!onOpen) return null
  return (
    <button className="workflow-graph-button ghost-button compact" disabled={disabled} onClick={onOpen} type="button">
      {label}
    </button>
  )
}

export function WorkflowActiveNodeStrip({
  nodes,
  className = '',
  label = 'Active workflow nodes',
}: {
  nodes: Array<{ key: string; label: string; status: string }>
  className?: string
  label?: string
}) {
  if (nodes.length === 0) return null
  return (
    <div className={['workflow-active-node-strip', className].filter(Boolean).join(' ')} aria-label={label}>
      {nodes.map((node) => (
        <span className={`is-${node.status}`} key={node.key}>
          <i className={`workflow-status-dot is-${node.status}`} aria-hidden="true" />
          <b>{node.label}</b>
        </span>
      ))}
    </div>
  )
}

export function WorkflowLiveStatus({
  label,
  className = '',
}: {
  label: string
  className?: string
}) {
  const cleanLabel = label.trim()
  if (!cleanLabel) return null
  return (
    <div className={['workflow-live-status', className].filter(Boolean).join(' ')}>
      <span className="world-mini-spinner" aria-hidden="true" />
      <strong>{cleanLabel}</strong>
    </div>
  )
}

export function WorkflowProgressSummary({
  model,
  compact = false,
  children,
}: {
  model: WorkflowProgressViewModel
  compact?: boolean
  children?: ReactNode
}) {
  const active = activeLabel(model)
  return (
    <div className={compact ? 'workflow-progress-summary is-compact' : 'workflow-progress-summary'} data-status={model.status}>
      <div className="workflow-progress-summary__head">
        <span className={`workflow-status-dot is-${model.status}`} aria-hidden="true" />
        <div>
          <strong>{active}</strong>
          <span>{model.title}</span>
        </div>
        <WorkflowProviderStatusBadge model={model} />
      </div>
      <div className="workflow-progress-summary__meter" aria-label={`${model.completedSteps} of ${model.totalSteps} workflow steps complete`}>
        <i style={{ ['--workflow-progress' as string]: `${model.percent}%` }} />
      </div>
      <div className="workflow-progress-summary__meta">
        <span>{model.totalSteps > 0 ? `${model.completedSteps}/${model.totalSteps} nodes` : statusLabel(model.status)}</span>
        {model.runningSteps > 0 ? <span>{model.runningSteps} running</span> : null}
        {model.queuedSteps > 0 ? <span>{model.queuedSteps} queued</span> : null}
        {model.streamingStatus ? <span>{statusLabel(model.streamingStatus)}</span> : null}
        {model.streamingEventCount > 0 ? <span>{model.streamingEventCount} stream events</span> : null}
        {model.readyArtifactCount > 0 ? <span>{model.readyArtifactCount} artifacts</span> : null}
        {model.failedSteps > 0 ? <span className="is-danger">{model.failedSteps} failed</span> : null}
      </div>
      {model.latestError ? <p className="workflow-progress-summary__error">{model.latestError}</p> : null}
      {children ? <div className="workflow-progress-summary__actions">{children}</div> : null}
    </div>
  )
}

export function WorkflowNodeTimeline({
  nodes,
  limit = 7,
}: {
  nodes: WorkflowProgressNodeView[]
  limit?: number
}) {
  if (nodes.length === 0) return null
  const visible = nodes.slice(0, limit)
  return (
    <ol className="workflow-node-timeline" aria-label="Workflow node progress">
      {visible.map((node) => (
        <li key={node.key} className={`is-${node.status}`}>
          <span className="workflow-status-dot" aria-hidden="true" />
          <div>
            <strong>{node.progressLabel || node.label}</strong>
            <span>{statusLabel(node.status)}{node.providerStatus ? ` / ${node.providerStatus}` : ''}</span>
          </div>
        </li>
      ))}
      {nodes.length > visible.length ? <li className="is-more">{nodes.length - visible.length} more nodes</li> : null}
    </ol>
  )
}

export function WorkflowStageRail({
  stages,
}: {
  stages: Array<{ key: string; label: string; status: string; detail?: string }>
}) {
  if (stages.length === 0) return null
  return (
    <div className="workflow-stage-rail" role="list" aria-label="Workflow stages">
      {stages.map((stage) => (
        <span key={stage.key} className={`is-${stage.status}`} role="listitem" title={`${stage.label}: ${statusLabel(stage.status)}`}>
          <i aria-hidden="true" />
          <b>{stage.label}</b>
          {stage.detail ? <small>{stage.detail}</small> : null}
        </span>
      ))}
    </div>
  )
}
