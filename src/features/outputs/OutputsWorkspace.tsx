import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { resolveAssetSourceUrl } from '../../domain/assets'
import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  type OutputWorkflowPlanResponse,
  type OutputWorkflowRunStatusResponse,
  type OutputWorkflowStartResponse,
} from '../../domain/outputWorkflow'

type OutputsWorkspaceProps = {
  snapshot: ProjectSnapshot
  canRunOutputs: boolean
  cinematicsPanel: ReactNode
  onPlanOutputWorkflow: (request: {
    prompt: string
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown'
  }) => Promise<OutputWorkflowPlanResponse>
  onStartOutputWorkflow: (plan: OutputWorkflowPlanResponse['plan']) => Promise<OutputWorkflowStartResponse>
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
  }) => Promise<OutputWorkflowRunStatusResponse>
  onGetOutputWorkflowStatus: (runId: string) => Promise<OutputWorkflowRunStatusResponse>
  onCancelOutputWorkflowRun: (runId: string) => Promise<unknown>
  onRefreshLiveSnapshot: () => Promise<void>
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function formatStepStatus(step: { status: string; metadata?: Record<string, unknown> }) {
  return readRecord(step.metadata).blocked ? 'blocked' : formatStatus(readRecord(step.metadata).skipped ? 'skipped' : step.status)
}

function readWorldWikiTitle(snapshot: ProjectSnapshot) {
  const metadata = snapshot.draft.metadata ?? {}
  const worldWiki = metadata.worldWiki && typeof metadata.worldWiki === 'object'
    ? metadata.worldWiki as Record<string, unknown>
    : {}
  return typeof worldWiki.title === 'string' && worldWiki.title.trim()
    ? worldWiki.title.trim()
    : snapshot.project.name
}

export function OutputsWorkspace({
  snapshot,
  canRunOutputs,
  cinematicsPanel,
  onPlanOutputWorkflow,
  onStartOutputWorkflow,
  onStartOutputWorkflowRun,
  onGetOutputWorkflowStatus,
  onCancelOutputWorkflowRun,
  onRefreshLiveSnapshot,
}: OutputsWorkspaceProps) {
  const [mode, setMode] = useState<'workflows' | 'cinematics'>('workflows')
  const [prompt, setPrompt] = useState('Turn this world into a polished ebook PDF with chapters from the sequence units.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(snapshot.outputWorkflowRuns[0]?.id ?? null)

  const sequenceUnits = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType === 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const castAndContext = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const workflows = snapshot.outputWorkflows
  const activeRun = snapshot.outputWorkflowRuns.find((run) => run.id === activeRunId) ?? snapshot.outputWorkflowRuns[0] ?? null
  const activeWorkflow = activeRun
    ? workflows.find((workflow) => workflow.id === activeRun.workflowId) ?? null
    : workflows[0] ?? null
  const activeNodes = activeWorkflow
    ? snapshot.outputWorkflowNodes.filter((node) => node.workflowId === activeWorkflow.id)
    : []
  const activeEdges = activeWorkflow
    ? snapshot.outputWorkflowEdges.filter((edge) => edge.workflowId === activeWorkflow.id)
    : []
  const workflowExecutionPlan = useMemo(
    () => activeNodes.length > 0
      ? buildOutputWorkflowExecutionPlan(activeNodes, activeEdges)
      : null,
    [activeNodes, activeEdges],
  )
  const nodeByKey = useMemo(() => new Map(activeNodes.map((node) => [node.key, node])), [activeNodes])
  const stepsByNodeKey = useMemo(
    () => new Map((activeRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [activeRun?.steps],
  )
  const artifacts = snapshot.outputArtifacts
  const title = readWorldWikiTitle(snapshot)

  async function createAndRunEbookWorkflow() {
    setBusy(true)
    setError(null)
    try {
      const sequenceKeys = sequenceUnits.map((entity) => entity.key)
      const entityKeys = castAndContext.slice(0, 24).map((entity) => entity.key)
      const planResponse = await onPlanOutputWorkflow({
        prompt,
        selectedEntityKeys: entityKeys,
        selectedSequenceUnitKeys: sequenceKeys,
        targetFormat: 'pdf',
      })
      const startResponse = await onStartOutputWorkflow(planResponse.plan)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: startResponse.workflow.id,
        prompt: planResponse.plan.prompt,
        targetFormat: 'pdf',
        selectedEntityKeys: planResponse.plan.sourceEntityKeys,
        selectedSequenceUnitKeys: planResponse.plan.sourceSequenceUnitKeys,
      })
      setActiveRunId(runResponse.run.id)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Output workflow failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pollRun(runId: string) {
    let status = await onGetOutputWorkflowStatus(runId)
    while (!isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputWorkflowStatus(runId)
    }
  }

  async function cancelActiveRun() {
    if (!activeRun) return
    setBusy(true)
    setError(null)
    try {
      await onCancelOutputWorkflowRun(activeRun.id)
      await onRefreshLiveSnapshot()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel output workflow.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="outputs-workspace">
      <header className="outputs-header">
        <div>
          <p className="outputs-eyebrow">Outputs</p>
          <h2>{title}</h2>
        </div>
        <div className="outputs-mode-switch" role="tablist" aria-label="Output modes">
          <button className={mode === 'workflows' ? 'is-active' : ''} onClick={() => setMode('workflows')} type="button">
            Workflows
          </button>
          <button className={mode === 'cinematics' ? 'is-active' : ''} onClick={() => setMode('cinematics')} type="button">
            Cinematics
          </button>
        </div>
      </header>

      {mode === 'cinematics' ? cinematicsPanel : (
        <div className="outputs-grid">
          <section className="outputs-panel outputs-composer">
            <div className="outputs-panel-heading">
              <h3>Ebook From World</h3>
              <span>{sequenceUnits.length} sequence units</span>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              aria-label="Output workflow prompt"
            />
            <button
              className="outputs-primary-action"
              disabled={!canRunOutputs || busy}
              onClick={createAndRunEbookWorkflow}
              type="button"
            >
              {busy ? 'Running workflow...' : 'Generate PDF'}
            </button>
            {!canRunOutputs ? <p className="outputs-error">Output workflows require a live Supabase-backed draft.</p> : null}
            {error ? <p className="outputs-error">{error}</p> : null}
          </section>

          <section className="outputs-panel">
            <div className="outputs-panel-heading">
              <h3>Workflow</h3>
              <span>{activeWorkflow?.preset.replace(/_/g, ' ') ?? 'No workflow yet'}</span>
            </div>
            <div className="outputs-node-list">
              {workflowExecutionPlan?.levels.length ? workflowExecutionPlan.levels.map((level, levelIndex) => (
                <div className="outputs-execution-level" key={`level-${levelIndex}`}>
                  <div className="outputs-level-heading">
                    <strong>Level {levelIndex + 1}</strong>
                    <span>{level.length > 1 ? `${level.length} parallel nodes` : '1 node'}</span>
                  </div>
                  <div className="outputs-level-nodes">
                    {level.map((nodeKey) => {
                      const node = nodeByKey.get(nodeKey)
                      const step = stepsByNodeKey.get(nodeKey)
                      if (!node) return null
                      return (
                        <div className={`outputs-node-card ${step ? `is-${formatStepStatus(step).replace(/\s+/g, '-')}` : ''}`} key={node.id}>
                          <strong>{node.label}</strong>
                          <span>{node.nodeType.replace(/_/g, ' ')}</span>
                          {step ? <em>{formatStepStatus(step)}</em> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )) : (
                <p className="outputs-muted">Create the ebook preset to materialize the node chain.</p>
              )}
            </div>
          </section>

          <section className="outputs-panel">
            <div className="outputs-panel-heading">
              <h3>Run Timeline</h3>
              {activeRun ? <span>{formatStatus(activeRun.status)}</span> : <span>Idle</span>}
            </div>
            {activeRun && !isTerminalOutputWorkflowRunStatus(activeRun.status) ? (
              <button className="outputs-secondary-action" disabled={busy} onClick={cancelActiveRun} type="button">
                Cancel run
              </button>
            ) : null}
            <div className="outputs-step-list">
              {activeRun?.steps.length ? activeRun.steps.map((step) => (
                <button
                  className={`outputs-step-row is-${step.status}`}
                  key={step.id}
                  onClick={() => setActiveRunId(activeRun.id)}
                  type="button"
                >
                  <span>{step.label}</span>
                  <strong>{formatStepStatus(step)}</strong>
                </button>
              )) : (
                <p className="outputs-muted">Runs will show per-node status, retries, hashes, and provider metadata here.</p>
              )}
            </div>
          </section>

          <section className="outputs-panel outputs-artifacts">
            <div className="outputs-panel-heading">
              <h3>Artifacts</h3>
              <span>{artifacts.length}</span>
            </div>
            {artifacts.length > 0 ? artifacts.map((artifact) => {
              const asset = artifact.assetKey
                ? snapshot.assets.find((entry) => entry.key === artifact.assetKey) ?? null
                : null
              const url = resolveAssetSourceUrl(asset)
              return (
                <article className="outputs-artifact-card" key={artifact.id}>
                  <div>
                    <strong>{artifact.name}</strong>
                    <span>{artifact.kind.toUpperCase()} · {artifact.mimeType || asset?.mimeType || 'artifact'}</span>
                    {artifact.summary ? <p>{artifact.summary}</p> : null}
                  </div>
                  {url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : null}
                </article>
              )
            }) : (
              <p className="outputs-muted">Finished PDFs and future comic/video packages will collect here.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
