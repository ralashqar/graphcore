import { useEffect, useMemo, useRef, useState } from 'react'

import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  isTerminalOutputWorkflowRunStatus,
  type OutputRequest,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../domain/outputWorkflow'
import type { OutputStudioReturnTarget } from '../world-builder/wiki/outputLibraryPresentation'
import { OutputWorkflowGraphOverlay } from './OutputWorkflowGraphOverlay'

export type OutputGraphOverlayIntent = {
  requestId: string | null
  selectedNodeKey?: string | null
  returnTarget?: OutputStudioReturnTarget | null
  nonce: number
}

type OutputGraphOverlayHostProps = {
  canRunOutputs: boolean
  openIntent: OutputGraphOverlayIntent | null
  snapshot: ProjectSnapshot
  onClose: () => void
  onGetOutputRequestStatus: (requestId: string) => Promise<unknown> | unknown
  onLoadOutputWorkflowGraph: (
    workflowId: string,
    runId?: string | null,
    selectedNodeKey?: string | null,
    options?: { knownGraphRevision?: string | null; assetHydrationMode?: 'none' | 'preview' | 'selected' | 'all' },
  ) => Promise<{ unchanged?: boolean; graphRevision?: string } | undefined> | { unchanged?: boolean; graphRevision?: string } | undefined
  onLoadOutputWorkflowNodeOutput: (
    workflowId: string,
    runId: string | null | undefined,
    nodeKey: string,
    graphRevision?: string | null,
  ) => Promise<unknown> | unknown
  onSubscribeOutputWorkflowGraphSignals: (input: {
    draftId: string
    workflowId: string
    runId?: string | null
    onSignal: () => void
  }) => { unsubscribe: () => Promise<unknown> | unknown }
  onUpdateOutputWorkflowNode: (request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
  }) => Promise<unknown>
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function readOutputRequestGraphRevision(request: OutputRequest | null | undefined) {
  const projection = readRecord(readRecord(request?.metadata).outputStatusProjection)
  return readTrimmedString(projection.graphRevision)
}

function readOutputPreview(step: Pick<OutputWorkflowRunStep, 'outputs' | 'errorMessage' | 'provider' | 'model'> | null | undefined) {
  if (!step) return ''
  if (step.errorMessage) return step.errorMessage
  const outputs = readRecord(step.outputs)
  const image = readRecord(outputs.image)
  const imageAssetKey = readTrimmedString(image.assetKey) || readTrimmedString(outputs.assetKey)
  const imagePrompt = readTrimmedString(image.prompt) || readTrimmedString(outputs.prompt)
  if (imageAssetKey && (readTrimmedString(image.mimeType).startsWith('image/') || step.provider === 'fal')) {
    return [`Generated image asset: ${imageAssetKey}`, imagePrompt ? `Prompt: ${imagePrompt}` : ''].filter(Boolean).join('\n\n')
  }
  const directText = readTrimmedString(outputs.markdown)
    || readTrimmedString(outputs.text)
    || readTrimmedString(outputs.output)
    || readTrimmedString(outputs.artifactKey)
  if (directText) return directText
  const guidancePreview = readTrimmedString(readRecord(outputs.guidance).resolvedGuidancePreview)
  if (guidancePreview) return guidancePreview
  return Object.keys(outputs).length === 0 ? '' : JSON.stringify(outputs, null, 2)
}

function readNodeSkillKeys(node: Pick<OutputWorkflowNode, 'config' | 'metadata'>) {
  const config = readRecord(node.config)
  const configGuidance = readRecord(config.guidance)
  const metadataGuidance = readRecord(node.metadata).guidance
  return [...new Set([
    ...readStringArray(config.skillKeys),
    ...readStringArray(configGuidance.skillKeys),
    ...readStringArray(readRecord(metadataGuidance).skillKeys),
  ])]
}

function mergeWorkflowRunsForDisplay(runs: OutputWorkflowRun[], activeRun: OutputWorkflowRun | null) {
  if (!activeRun) return null
  const orderedRuns = runs.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
  const stepByNodeKey = new Map<string, OutputWorkflowRunStep>()
  const artifactById = new Map<string, OutputWorkflowRun['artifacts'][number]>()
  for (const run of orderedRuns) {
    for (const step of run.steps) stepByNodeKey.set(step.nodeKey, step)
    for (const artifact of run.artifacts) artifactById.set(artifact.id, artifact)
  }
  const hasRunningRun = orderedRuns.some((run) => !isTerminalOutputWorkflowRunStatus(run.status))
  return {
    ...activeRun,
    status: hasRunningRun ? 'running' : activeRun.status,
    steps: [...stepByNodeKey.values()].sort((left, right) => left.orderIndex - right.orderIndex),
    artifacts: [...artifactById.values()],
  } satisfies OutputWorkflowRun
}

export function OutputGraphOverlayHost({
  canRunOutputs,
  openIntent,
  snapshot,
  onClose,
  onGetOutputRequestStatus,
  onLoadOutputWorkflowGraph,
  onLoadOutputWorkflowNodeOutput,
  onSubscribeOutputWorkflowGraphSignals,
  onUpdateOutputWorkflowNode,
}: OutputGraphOverlayHostProps) {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(openIntent?.selectedNodeKey ?? null)
  const [refreshingGraph, setRefreshingGraph] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const graphRevisionRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const lastRefreshAtRef = useRef(0)
  const requestId = openIntent?.requestId ?? null
  const request = requestId ? snapshot.outputRequests.find((entry) => entry.id === requestId) ?? null : null
  const workflow = request?.workflowId
    ? snapshot.outputWorkflows.find((entry) => entry.id === request.workflowId) ?? null
    : null
  const workflowRuns = workflow
    ? snapshot.outputWorkflowRuns.filter((run) => run.workflowId === workflow.id)
    : []
  const activeRun = request?.latestRunId
    ? workflowRuns.find((run) => run.id === request.latestRunId) ?? workflowRuns[0] ?? null
    : workflowRuns[0] ?? null
  const displayRun = useMemo(() => mergeWorkflowRunsForDisplay(workflowRuns, activeRun), [activeRun, workflowRuns])
  const nodes = workflow ? snapshot.outputWorkflowNodes.filter((node) => node.workflowId === workflow.id) : []
  const edges = workflow ? snapshot.outputWorkflowEdges.filter((edge) => edge.workflowId === workflow.id) : []
  const knownGraphRevision = readOutputRequestGraphRevision(request) || graphRevisionRef.current

  useEffect(() => {
    setSelectedNodeKey(openIntent?.selectedNodeKey ?? null)
    setSyncMessage(null)
  }, [openIntent?.nonce, openIntent?.selectedNodeKey])

  useEffect(() => {
    if (!requestId || request) return
    let cancelled = false
    setSyncMessage('Loading linked output...')
    void Promise.resolve(onGetOutputRequestStatus(requestId))
      .catch((error) => {
        if (!cancelled) setSyncMessage(error instanceof Error ? error.message : 'Could not load the linked output.')
      })
    return () => {
      cancelled = true
    }
  }, [onGetOutputRequestStatus, request, requestId])

  const refreshGraph = (quiet = false) => {
    if (!workflow) return
    if (!quiet) setRefreshingGraph(true)
    lastRefreshAtRef.current = Date.now()
    void Promise.resolve(onLoadOutputWorkflowGraph(workflow.id, activeRun?.id ?? request?.latestRunId ?? null, selectedNodeKey, {
      knownGraphRevision,
      assetHydrationMode: selectedNodeKey ? 'selected' : 'preview',
    })).then((result) => {
      if (result?.graphRevision) graphRevisionRef.current = result.graphRevision
      setSyncMessage(result?.unchanged ? 'Cached graph is current.' : null)
    }).catch((error) => {
      setSyncMessage(error instanceof Error ? error.message : 'Graph sync delayed. Showing cached graph data.')
    }).finally(() => {
      if (!quiet) setRefreshingGraph(false)
    })
  }

  useEffect(() => {
    if (!workflow) return undefined
    refreshGraph(nodes.length > 0)
    const scheduleRefresh = (delayMs = 450) => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        refreshGraph(true)
      }, delayMs)
    }
    const subscription = onSubscribeOutputWorkflowGraphSignals({
      draftId: snapshot.draft.id,
      workflowId: workflow.id,
      runId: activeRun?.id ?? null,
      onSignal: () => scheduleRefresh(450),
    })
    const watchdog = window.setInterval(() => {
      if (!activeRun || isTerminalOutputWorkflowRunStatus(activeRun.status)) return
      if (Date.now() - lastRefreshAtRef.current > 7500) scheduleRefresh(0)
    }, 7500)
    return () => {
      void subscription.unsubscribe()
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      window.clearInterval(watchdog)
    }
  }, [activeRun?.id, activeRun?.status, workflow?.id, openIntent?.nonce])

  useEffect(() => {
    if (!workflow || !selectedNodeKey) return
    void Promise.resolve(onLoadOutputWorkflowNodeOutput(workflow.id, activeRun?.id ?? null, selectedNodeKey, graphRevisionRef.current))
      .catch((error) => console.warn('[GraphCore] app graph node output sync delayed.', error))
  }, [activeRun?.id, onLoadOutputWorkflowNodeOutput, selectedNodeKey, workflow?.id])

  if (!openIntent) return null

  if (!workflow || (nodes.length === 0 && refreshingGraph)) {
    return (
      <div className="outputs-graph-overlay" role="dialog" aria-modal="true" aria-label="Output workflow graph">
        <header className="outputs-graph-toolbar">
          <div>
            <span className="eyebrow">Output graph</span>
            <h2>{request?.title || request?.prompt || 'Loading linked output'}</h2>
            <p>{syncMessage || 'Opening cached graph shell and syncing workflow state.'}</p>
          </div>
          <button onClick={onClose} type="button">Close</button>
        </header>
        <div className="outputs-graph-canvas-shell">
          <div className="outputs-graph-loading-state">
            <span className="outputs-graph-mini-spinner" aria-hidden="true" />
            <strong>{request ? 'Syncing graph...' : 'Loading linked output...'}</strong>
            <p>Wiki stays interactive while the graph shell catches up.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="outputs-graph-overlay" role="dialog" aria-modal="true" aria-label="Output workflow graph">
        <header className="outputs-graph-toolbar">
          <div>
            <span className="eyebrow">Output graph</span>
            <h2>Graph unavailable</h2>
            <p>{syncMessage || 'This output does not have a workflow graph yet.'}</p>
          </div>
          <button onClick={onClose} type="button">Close</button>
        </header>
      </div>
    )
  }

  return (
    <OutputWorkflowGraphOverlay
      activeRun={displayRun}
      assets={snapshot.assets}
      canRunOutputs={canRunOutputs && false}
      edges={edges}
      nodes={nodes}
      worldEntities={snapshot.worldEntities as unknown as Array<Record<string, unknown>>}
      worldRelationships={snapshot.worldRelationships as unknown as Array<Record<string, unknown>>}
      onCancelRun={() => undefined}
      onClose={onClose}
      onRefreshGraph={() => refreshGraph(false)}
      onRunNode={() => setSyncMessage('Open Output Studio to run individual graph nodes.')}
      onRunNodes={() => setSyncMessage('Open Output Studio to run individual graph nodes.')}
      onSaveNode={onUpdateOutputWorkflowNode}
      onSelectNode={(nodeKey) => setSelectedNodeKey(nodeKey)}
      readNodeSkillKeys={readNodeSkillKeys}
      readOutputPreview={readOutputPreview}
      runErrorMessage={syncMessage}
      refreshingGraph={refreshingGraph}
      selectedNodeKey={selectedNodeKey}
      targetedNodeKey={null}
      targetedNodeKeys={[]}
      targetedRunScope={null}
      workflow={workflow}
      worldWiki={readRecord(snapshot.draft.metadata).worldWiki}
    />
  )
}
