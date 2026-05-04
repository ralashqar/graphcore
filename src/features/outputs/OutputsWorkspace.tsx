import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { resolveAssetSourceUrl } from '../../domain/assets'
import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  type OutputWorkflowNode,
  type OutputWorkflowNodeUpdateResponse,
  type OutputWorkflowPlanResponse,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
  type OutputWorkflowRunStatusResponse,
  type OutputWorkflowStartResponse,
} from '../../domain/outputWorkflow'
import { OutputWorkflowGraphOverlay } from './OutputWorkflowGraphOverlay'

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
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<OutputWorkflowRunStatusResponse>
  onGetOutputWorkflowStatus: (runId: string) => Promise<OutputWorkflowRunStatusResponse>
  onCancelOutputWorkflowRun: (runId: string) => Promise<unknown>
  onUpdateOutputWorkflowNode: (request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
  }) => Promise<OutputWorkflowNodeUpdateResponse>
  onRefreshLiveSnapshot: () => Promise<void>
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatByteSize(value: unknown) {
  const bytes = readNumber(value)
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

function artifactActionLabels(mimeType: string, kind: string) {
  if (mimeType === 'application/pdf' || kind === 'pdf') {
    return { open: 'Open PDF', download: 'Download PDF', extension: 'pdf' }
  }
  if (mimeType.includes('markdown') || kind === 'manuscript') {
    return { open: 'Open Markdown', download: 'Download Markdown', extension: 'md' }
  }
  return { open: 'Open File', download: 'Download File', extension: 'download' }
}

function statusKeyForStep(step: { status: string; metadata?: Record<string, unknown> } | null | undefined) {
  if (!step) return 'queued'
  if (readRecord(step.metadata).blocked) return 'blocked'
  if (readRecord(step.metadata).skipped) return 'skipped'
  return step.status
}

function statusLabelForStep(step: { status: string; metadata?: Record<string, unknown> } | null | undefined) {
  return formatStatus(statusKeyForStep(step))
}

function readOutputPreview(step: Pick<OutputWorkflowRunStep, 'outputs' | 'errorMessage' | 'provider' | 'model'> | null | undefined) {
  if (!step) return ''
  if (step.errorMessage) return step.errorMessage
  const outputs = readRecord(step.outputs)
  const directText = readTrimmedString(outputs.markdown)
    || readTrimmedString(outputs.text)
    || readTrimmedString(outputs.output)
    || readTrimmedString(outputs.artifactKey)
  if (directText) return directText
  const guidance = readRecord(outputs.guidance)
  const guidancePreview = readTrimmedString(guidance.resolvedGuidancePreview)
  if (guidancePreview) return guidancePreview
  if (Object.keys(outputs).length === 0) return ''
  return JSON.stringify(outputs, null, 2)
}

function truncatePreview(value: string, maxLength = 14000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[Output truncated in preview]` : value
}

function readNodeSkillKeys(node: Pick<OutputWorkflowNode, 'config' | 'metadata'>) {
  const config = readRecord(node.config)
  const configGuidance = readRecord(config.guidance)
  const metadataGuidance = readRecord(node.metadata).guidance
  const skillKeys = [
    ...readStringArray(config.skillKeys),
    ...readStringArray(configGuidance.skillKeys),
    ...readStringArray(readRecord(metadataGuidance).skillKeys),
  ]
  return [...new Set(skillKeys)]
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
  onUpdateOutputWorkflowNode,
  onRefreshLiveSnapshot,
}: OutputsWorkspaceProps) {
  const [mode, setMode] = useState<'workflows' | 'cinematics'>('workflows')
  const [prompt, setPrompt] = useState('Turn this world into a polished ebook PDF with chapters from the sequence units.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(snapshot.outputWorkflowRuns[0]?.id ?? null)
  const [liveRun, setLiveRun] = useState<OutputWorkflowRun | null>(null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<'output' | 'guidance' | 'metadata'>('output')
  const [targetedNodeKey, setTargetedNodeKey] = useState<string | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)

  const sequenceUnits = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType === 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const castAndContext = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const workflows = snapshot.outputWorkflows
  const snapshotActiveRun = snapshot.outputWorkflowRuns.find((run) => run.id === activeRunId) ?? snapshot.outputWorkflowRuns[0] ?? null
  const activeRun = liveRun && liveRun.id === (activeRunId ?? liveRun.id) ? liveRun : snapshotActiveRun
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
  const selectedNode = selectedNodeKey
    ? nodeByKey.get(selectedNodeKey) ?? activeNodes[0] ?? null
    : activeNodes[0] ?? null
  const selectedGuidance = selectedNode
    ? buildOutputGuidanceBundleForNode({
      node: selectedNode,
      worldWiki: readRecord(snapshot.draft.metadata).worldWiki,
    })
    : null
  const stepsByNodeKey = useMemo(
    () => new Map((activeRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [activeRun?.steps],
  )
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedOutputPreview = truncatePreview(readOutputPreview(selectedStep))
  const runStepCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const step of activeRun?.steps ?? []) {
      const key = statusKeyForStep(step)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [activeRun?.steps])
  const canRetryActiveRun = activeRun
    ? isTerminalOutputWorkflowRunStatus(activeRun.status)
      && ['failed', 'blocked', 'cancelled'].some((status) => (runStepCounts.get(status) ?? 0) > 0)
    : false
  const artifacts = snapshot.outputArtifacts
  const title = readWorldWikiTitle(snapshot)

  useEffect(() => {
    if (!liveRun) return
    const refreshedRun = snapshot.outputWorkflowRuns.find((run) => run.id === liveRun.id) ?? null
    if (refreshedRun && refreshedRun.updatedAt !== liveRun.updatedAt) {
      setLiveRun(refreshedRun)
    }
  }, [liveRun, snapshot.outputWorkflowRuns])

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
      setLiveRun(runResponse.run)
      setBusy(false)
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
    setLiveRun(status.run)
    while (!isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputWorkflowStatus(runId)
      setLiveRun(status.run)
    }
  }

  async function cancelActiveRun() {
    if (!activeRun) return
    setBusy(true)
    setError(null)
    try {
      await onCancelOutputWorkflowRun(activeRun.id)
      setLiveRun(null)
      await onRefreshLiveSnapshot()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel output workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function retryActiveRunFromFailedNodes() {
    if (!activeRun) return
    setBusy(true)
    setError(null)
    try {
      const previousInput = readRecord(activeRun.input)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeRun.workflowId,
        prompt: activeRun.prompt || prompt,
        targetFormat: activeRun.targetFormat as 'pdf' | 'epub' | 'docx' | 'markdown',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        input: previousInput,
        metadata: {
          retryOfRunId: activeRun.id,
          retryMode: 'reuse_completed_node_hashes',
        },
      })
      setActiveRunId(runResponse.run.id)
      setLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Could not retry output workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function runSelectedNodeOnly(node: OutputWorkflowNode) {
    if (!activeRun) return
    setTargetedNodeKey(node.key)
    setError(null)
    try {
      const previousInput = readRecord(activeRun.input)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeRun.workflowId,
        prompt: activeRun.prompt || prompt,
        targetFormat: activeRun.targetFormat as 'pdf' | 'epub' | 'docx' | 'markdown',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        input: previousInput,
        metadata: {
          sourceRunId: activeRun.id,
          runMode: 'targeted_node_preview',
          targetNodeKeys: [node.key],
          forceNodeKeys: [node.key],
        },
      })
      setActiveRunId(runResponse.run.id)
      setLiveRun(runResponse.run)
      setSelectedNodeKey(node.key)
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : 'Could not rerun the selected output node.')
    } finally {
      setTargetedNodeKey(null)
    }
  }

  function selectedNodeRunLabel(node: OutputWorkflowNode) {
    const purpose = readTrimmedString(readRecord(node.config).purpose)
    if (node.nodeType === 'output_artifact') return 'Render/register PDF only'
    if (node.nodeType === 'document_render') return 'Refresh document only'
    if (purpose === 'chapter_prose') return 'Regenerate chapter only'
    if (purpose === 'chapter_section_prose') return 'Regenerate section only'
    return 'Rerun node only'
  }

  return (
    <div className="outputs-workspace">
      {graphOpen && activeWorkflow ? (
        <OutputWorkflowGraphOverlay
          activeRun={activeRun}
          canRunOutputs={canRunOutputs}
          edges={activeEdges}
          nodes={activeNodes}
          onCancelRun={cancelActiveRun}
          onClose={() => setGraphOpen(false)}
          onRunNode={(node) => void runSelectedNodeOnly(node)}
          onSaveNode={onUpdateOutputWorkflowNode}
          onSelectNode={(nodeKey) => {
            setSelectedNodeKey(nodeKey)
            setInspectorMode('output')
          }}
          readNodeSkillKeys={readNodeSkillKeys}
          readOutputPreview={(step) => truncatePreview(readOutputPreview(step), 14000)}
          selectedNodeKey={selectedNode?.key ?? selectedNodeKey}
          targetedNodeKey={targetedNodeKey}
          workflow={activeWorkflow}
          worldWiki={readRecord(snapshot.draft.metadata).worldWiki}
        />
      ) : null}
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
            <div className="outputs-workflow-actions">
              <button
                className="outputs-secondary-action"
                disabled={!activeWorkflow || activeNodes.length === 0}
                onClick={() => setGraphOpen(true)}
                type="button"
              >
                Expand graph
              </button>
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
                      const skillKeys = readNodeSkillKeys(node)
                      const statusKey = statusKeyForStep(step)
                      const outputPreview = readOutputPreview(step)
                      return (
                        <article
                          className={`outputs-node-card ${selectedNode?.key === node.key ? 'is-selected' : ''} is-${statusKey.replace(/\s+/g, '-')}`}
                          key={node.id}
                        >
                          <button
                            className="outputs-node-main"
                            onClick={() => {
                              setSelectedNodeKey(node.key)
                              setInspectorMode('output')
                            }}
                            type="button"
                          >
                            <span className={`outputs-status-icon is-${statusKey.replace(/\s+/g, '-')}`} aria-hidden="true" />
                            <span>
                              <strong>{node.label}</strong>
                              <small>{node.nodeType.replace(/_/g, ' ')}</small>
                            </span>
                          </button>
                          {skillKeys.length > 0 ? (
                            <div className="outputs-skill-chips">
                              {skillKeys.slice(0, 3).map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                              {skillKeys.length > 3 ? <small>+{skillKeys.length - 3}</small> : null}
                            </div>
                          ) : null}
                          <div className="outputs-node-footer">
                            <em>{statusLabelForStep(step)}</em>
                            <button
                              className="outputs-node-action"
                              disabled={!outputPreview && !step?.errorMessage}
                              onClick={() => {
                                setSelectedNodeKey(node.key)
                                setInspectorMode('output')
                              }}
                              type="button"
                            >
                              View output
                            </button>
                          </div>
                        </article>
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
              <h3>Node Details</h3>
              <span>{selectedStep ? statusLabelForStep(selectedStep) : 'Not run'}</span>
            </div>
            {selectedNode ? (
              <div className="outputs-inspector">
                <div className="outputs-inspector-header">
                  <span className={`outputs-status-icon is-${statusKeyForStep(selectedStep).replace(/\s+/g, '-')}`} aria-hidden="true" />
                  <div>
                    <strong>{selectedNode.label}</strong>
                    <span>{selectedNode.nodeType.replace(/_/g, ' ')}</span>
                  </div>
                  <button
                    className="outputs-node-action"
                    disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key}
                    onClick={() => void runSelectedNodeOnly(selectedNode)}
                    type="button"
                  >
                    {targetedNodeKey === selectedNode.key ? 'Starting...' : selectedNodeRunLabel(selectedNode)}
                  </button>
                </div>
                <div className="outputs-inspector-tabs" role="tablist" aria-label="Node detail views">
                  <button className={inspectorMode === 'output' ? 'is-active' : ''} onClick={() => setInspectorMode('output')} type="button">
                    Output
                  </button>
                  <button className={inspectorMode === 'guidance' ? 'is-active' : ''} onClick={() => setInspectorMode('guidance')} type="button">
                    Guidance
                  </button>
                  <button className={inspectorMode === 'metadata' ? 'is-active' : ''} onClick={() => setInspectorMode('metadata')} type="button">
                    Metadata
                  </button>
                </div>
                {inspectorMode === 'output' ? (
                  <div className="outputs-output-preview">
                    {selectedStep?.errorMessage ? <p className="outputs-error">{selectedStep.errorMessage}</p> : null}
                    {selectedOutputPreview ? <pre>{selectedOutputPreview}</pre> : (
                      <p className="outputs-muted">No node output has been persisted yet. Queued and running nodes will fill this when they complete.</p>
                    )}
                  </div>
                ) : null}
                {inspectorMode === 'guidance' && selectedGuidance ? (
                  <div className="outputs-guidance-panel">
                    <div className="outputs-skill-chips">
                      {selectedGuidance.skillKeys.map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                    </div>
                    {selectedGuidance.resolvedGuidancePreview ? (
                      <div className="outputs-guidance-section">
                        <strong>Preview</strong>
                        <p>{selectedGuidance.resolvedGuidancePreview}</p>
                      </div>
                    ) : (
                      <p className="outputs-muted">This node does not have explicit output skills yet.</p>
                    )}
                    {selectedGuidance.guidance.length > 0 ? (
                      <div className="outputs-guidance-section">
                        <strong>Full guidance sent to node</strong>
                        <ul>
                          {selectedGuidance.guidance.map((entry, index) => <li key={`guidance-${index}`}>{entry}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {selectedGuidance.avoid.length > 0 ? (
                      <div className="outputs-guidance-section">
                        <strong>Full avoid list sent to node</strong>
                        <ul>
                          {selectedGuidance.avoid.map((entry, index) => <li key={`avoid-${index}`}>{entry}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {selectedGuidance.guidanceHash ? <span className="outputs-guidance-hash">Guidance hash {selectedGuidance.guidanceHash}</span> : null}
                  </div>
                ) : null}
                {inspectorMode === 'metadata' ? (
                  <div className="outputs-output-preview">
                    <pre>{JSON.stringify({
                      inputHash: selectedStep?.inputHash || selectedNode.inputHash,
                      outputHash: selectedStep?.outputHash || selectedNode.outputHash,
                      provider: selectedStep?.provider ?? null,
                      model: selectedStep?.model ?? null,
                      providerRequestId: selectedStep?.providerRequestId ?? null,
                      providerMode: readRecord(selectedStep?.metadata).providerMode ?? null,
                      providerStatus: readRecord(selectedStep?.metadata).providerStatus ?? null,
                      retryAttempts: readRecord(selectedStep?.outputs).retryAttempts ?? null,
                      startedAt: selectedStep?.startedAt ?? null,
                      completedAt: selectedStep?.completedAt ?? null,
                      metadata: selectedStep?.metadata ?? selectedNode.metadata,
                    }, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="outputs-muted">Select a node to inspect its output, error state, provider metadata, and guidance.</p>
            )}
          </section>

          <section className="outputs-panel">
            <div className="outputs-panel-heading">
              <h3>Run Timeline</h3>
              {activeRun ? <span>{formatStatus(activeRun.status)}</span> : <span>Idle</span>}
            </div>
            {activeRun ? (
              <div className="outputs-run-summary" aria-label="Run step summary">
                {['running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped', 'queued'].map((status) => (
                  <span className={`is-${status}`} key={status}>{formatStatus(status)} {runStepCounts.get(status) ?? 0}</span>
                ))}
              </div>
            ) : null}
            {activeRun && !isTerminalOutputWorkflowRunStatus(activeRun.status) ? (
              <button className="outputs-secondary-action" disabled={busy} onClick={cancelActiveRun} type="button">
                Cancel run
              </button>
            ) : null}
            {activeRun && canRetryActiveRun ? (
              <button className="outputs-secondary-action" disabled={busy} onClick={retryActiveRunFromFailedNodes} type="button">
                {busy ? 'Retrying...' : 'Retry failed/blocked nodes'}
              </button>
            ) : null}
            <div className="outputs-step-list">
              {activeRun?.steps.length ? activeRun.steps.map((step) => (
                <button
                  className={`outputs-step-row is-${statusKeyForStep(step).replace(/\s+/g, '-')}`}
                  key={step.id}
                  onClick={() => {
                    setActiveRunId(activeRun.id)
                    setSelectedNodeKey(step.nodeKey)
                    setInspectorMode('output')
                  }}
                  type="button"
                >
                  <span className={`outputs-status-icon is-${statusKeyForStep(step).replace(/\s+/g, '-')}`} aria-hidden="true" />
                  <span>{step.label}</span>
                  <strong>{statusLabelForStep(step)}</strong>
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
              const metadata = readRecord(artifact.metadata)
              const renderMetadata = readRecord(metadata.render)
              const markdownPreview = readTrimmedString(metadata.markdownPreview)
              const mimeType = artifact.mimeType || asset?.mimeType || ''
              const actionLabels = artifactActionLabels(mimeType, artifact.kind)
              const byteSize = formatByteSize(renderMetadata.byteSize)
              const pageCount = readNumber(renderMetadata.pageCount)
              const manuscriptLength = readNumber(renderMetadata.manuscriptCharacterCount)
              const pageSize = readTrimmedString(renderMetadata.pageSize)
              return (
                <article className="outputs-artifact-card" key={artifact.id}>
                  <div>
                    <strong>{artifact.name}</strong>
                    <span>{artifact.kind.toUpperCase()} - {mimeType || 'artifact'}</span>
                    <div className="outputs-artifact-meta">
                      {pageCount ? <small>{pageCount} pages</small> : null}
                      {byteSize ? <small>{byteSize}</small> : null}
                      {manuscriptLength ? <small>{manuscriptLength.toLocaleString()} manuscript chars</small> : null}
                      {pageSize ? <small>{pageSize}</small> : null}
                    </div>
                    {artifact.summary ? <p>{artifact.summary}</p> : null}
                    {markdownPreview ? (
                      <details className="outputs-artifact-preview">
                        <summary>Preview manuscript text (first excerpt only)</summary>
                        <pre>{markdownPreview}</pre>
                      </details>
                    ) : null}
                  </div>
                  <div className="outputs-artifact-actions">
                    {url ? <a href={url} target="_blank" rel="noreferrer">{actionLabels.open}</a> : <span>{actionLabels.open}</span>}
                    {url ? <a href={url} download={`${artifact.name}.${actionLabels.extension}`}>{actionLabels.download}</a> : <span>{actionLabels.download}</span>}
                    {!url ? <small>Preparing signed file URL</small> : null}
                  </div>
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
