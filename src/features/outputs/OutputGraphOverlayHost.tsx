import { useEffect, useMemo, useRef, useState } from 'react'

import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  isTerminalOutputWorkflowRunStatus,
  type OutputRequest,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunScope,
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
  onCancelOutputWorkflowRun: (runId: string) => Promise<unknown> | unknown
  onStartOutputWorkflowRun?: (request: {
    workflowId: string
    prompt?: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<{ run: OutputWorkflowRun }> | { run: OutputWorkflowRun }
  onSubscribeOutputWorkflowGraphSignals: (input: {
    draftId: string
    workflowId: string
    runId?: string | null
    onSignal: (signal: { table: string; eventType?: string }) => void
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

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const sequenceAnimaticCoverageAnchorOnwardForceNodeKeys = [
  'coverage_anchor_input',
  'coverage_anchor_brief',
  'coverage_anchor_prompt',
  'coverage_anchor_image',
  'coverage_anchor_artifact',
  'shot_reference_pack',
  'planned_keyframe_prompt',
  'planned_keyframe_image',
  'planned_keyframe_artifact',
]

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readTrimmedString(metadata.screenplayAnimaticRole) || readTrimmedString(metadata.sequenceAnimaticRole)
}

function isSequenceAnimaticCoverageAnchorNodeKey(key: string) {
  return key === 'coverage_anchor_input'
    || key === 'coverage_anchor_brief'
    || key === 'coverage_anchor_prompt'
    || key === 'coverage_anchor_image'
    || key === 'coverage_anchor_artifact'
}

function readOutputRequestGraphRevision(request: OutputRequest | null | undefined) {
  const projection = readRecord(readRecord(request?.metadata).outputStatusProjection)
  return readTrimmedString(projection.graphRevision)
}

function readOutputTargetFormat(value: unknown): 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video' {
  const text = readTrimmedString(value)
  return text === 'pdf'
    || text === 'epub'
    || text === 'docx'
    || text === 'markdown'
    || text === 'image'
    || text === 'video'
    ? text
    : 'pdf'
}

function isActiveOutputWorkflowStepStatus(status: string) {
  return status === 'queued' || status === 'running'
}

function outputWorkflowStepHasActiveProvider(step: OutputWorkflowRunStep | null | undefined) {
  const metadata = readRecord(step?.metadata)
  const providerStatus = readTrimmedString(metadata.providerStatus).toUpperCase()
  return providerStatus === 'IN_PROGRESS'
    || providerStatus === 'PROCESSING'
    || providerStatus === 'QUEUED'
    || Boolean(readTrimmedString(step?.providerRequestId))
    || Boolean(readTrimmedString(metadata.providerRequestId))
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

function mergeWorkflowRunsForDisplay(
  runs: OutputWorkflowRun[],
  activeRun: OutputWorkflowRun | null,
  previousDisplayRun: OutputWorkflowRun | null,
) {
  if (!activeRun) return null
  const priorStepByNodeKey = new Map((previousDisplayRun?.id === activeRun.id ? previousDisplayRun.steps : []).map((step) => [step.nodeKey, step] as const))
  const stepByNodeKey = new Map<string, OutputWorkflowRunStep>()
  const artifactById = new Map<string, OutputWorkflowRun['artifacts'][number]>()
  const runIsActive = !isTerminalOutputWorkflowRunStatus(activeRun.status)
  for (const step of activeRun.steps) {
    const priorStep = priorStepByNodeKey.get(step.nodeKey) ?? null
    if (step.status === 'failed' && runIsActive && priorStep && isActiveOutputWorkflowStepStatus(priorStep.status)) {
      stepByNodeKey.set(step.nodeKey, priorStep)
    } else if (step.status === 'failed' && runIsActive && outputWorkflowStepHasActiveProvider(step)) {
      stepByNodeKey.set(step.nodeKey, { ...step, status: 'running', errorMessage: null })
    } else {
      stepByNodeKey.set(step.nodeKey, step)
    }
  }
  if (runIsActive) {
    for (const priorStep of priorStepByNodeKey.values()) {
      if (!stepByNodeKey.has(priorStep.nodeKey) && isActiveOutputWorkflowStepStatus(priorStep.status)) {
        stepByNodeKey.set(priorStep.nodeKey, priorStep)
      }
    }
  }
  for (const run of runs) {
    for (const artifact of run.artifacts) artifactById.set(artifact.id, artifact)
  }
  const hasRunningRun = runs.some((run) => !isTerminalOutputWorkflowRunStatus(run.status))
  return {
    ...activeRun,
    status: hasRunningRun ? 'running' : activeRun.status,
    steps: [...stepByNodeKey.values()].sort((left, right) => left.orderIndex - right.orderIndex),
    artifacts: [...artifactById.values()],
  } satisfies OutputWorkflowRun
}

type LastGoodGraphState = {
  request: OutputRequest | null
  workflow: ProjectSnapshot['outputWorkflows'][number]
  nodes: OutputWorkflowNode[]
  edges: ProjectSnapshot['outputWorkflowEdges']
  displayRun: OutputWorkflowRun | null
}

export function OutputGraphOverlayHost({
  canRunOutputs,
  openIntent,
  snapshot,
  onClose,
  onGetOutputRequestStatus,
  onLoadOutputWorkflowGraph,
  onLoadOutputWorkflowNodeOutput,
  onCancelOutputWorkflowRun,
  onStartOutputWorkflowRun,
  onSubscribeOutputWorkflowGraphSignals,
  onUpdateOutputWorkflowNode,
}: OutputGraphOverlayHostProps) {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(openIntent?.selectedNodeKey ?? null)
  const [refreshingGraph, setRefreshingGraph] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [runBusy, setRunBusy] = useState(false)
  const [targetedNodeKeys, setTargetedNodeKeys] = useState<string[]>([])
  const [targetedRunScope, setTargetedRunScope] = useState<OutputWorkflowRunScope | null>(null)
  const [cancelledRunIds, setCancelledRunIds] = useState<Set<string>>(() => new Set())
  const graphRevisionRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const lastRefreshAtRef = useRef(0)
  const graphRefreshInFlightRef = useRef(false)
  const previousDisplayRunRef = useRef<OutputWorkflowRun | null>(null)
  const lastGoodGraphStateRef = useRef<LastGoodGraphState | null>(null)
  const requestId = openIntent?.requestId ?? null
  const request = requestId ? snapshot.outputRequests.find((entry) => entry.id === requestId) ?? null : null
  const workflow = request?.workflowId
    ? snapshot.outputWorkflows.find((entry) => entry.id === request.workflowId) ?? null
    : null
  const workflowRuns = useMemo(
    () => workflow ? snapshot.outputWorkflowRuns.filter((run) => run.workflowId === workflow.id) : [],
    [snapshot.outputWorkflowRuns, workflow?.id],
  )
  const activeRun = request?.latestRunId
    ? workflowRuns.find((run) => run.id === request.latestRunId) ?? workflowRuns[0] ?? null
    : workflowRuns[0] ?? null
  const displayRun = useMemo(() => {
    const merged = mergeWorkflowRunsForDisplay(workflowRuns, activeRun, previousDisplayRunRef.current)
    if (!merged || !cancelledRunIds.has(merged.id)) return merged
    return {
      ...merged,
      status: 'cancelled',
      steps: merged.steps.map((step) => ['queued', 'running'].includes(step.status)
        ? { ...step, status: 'cancelled' as const }
        : step),
    } satisfies OutputWorkflowRun
  }, [activeRun, cancelledRunIds, workflowRuns])
  const nodes = useMemo(
    () => workflow ? snapshot.outputWorkflowNodes.filter((node) => node.workflowId === workflow.id) : [],
    [snapshot.outputWorkflowNodes, workflow?.id],
  )
  const edges = useMemo(
    () => workflow ? snapshot.outputWorkflowEdges.filter((edge) => edge.workflowId === workflow.id) : [],
    [snapshot.outputWorkflowEdges, workflow?.id],
  )
  const displayGraphState = useMemo(
    () => workflow && nodes.length > 0
      ? { request, workflow, nodes, edges, displayRun }
      : lastGoodGraphStateRef.current,
    [displayRun, edges, nodes, request, workflow],
  )
  const knownGraphRevision = readOutputRequestGraphRevision(request) || graphRevisionRef.current
  const loadedGraphNodeCount = displayGraphState?.nodes.length ?? nodes.length

  const runTargetedNodes = async (
    targetNodes: OutputWorkflowNode[],
    runScope: OutputWorkflowRunScope = 'node_only',
  ) => {
    const targetWorkflow = workflow ?? displayGraphState?.workflow ?? null
    if (!targetWorkflow) {
      setSyncMessage('Workflow graph is still loading.')
      return
    }
    if (!canRunOutputs) {
      setSyncMessage('Load a live GraphCore draft before running graph nodes.')
      return
    }
    if (typeof onStartOutputWorkflowRun !== 'function') {
      setSyncMessage('Graph node runner is still loading. Close and reopen the graph, then try again.')
      return
    }
    const uniqueNodes = Array.from(new Map(targetNodes.map((node) => [node.key, node])).values())
    const nodeKeys = uniqueNodes.map((node) => node.key).filter(Boolean)
    if (nodeKeys.length === 0) return

    const workflowMetadata = readRecord(targetWorkflow.metadata)
    const previousInput = activeRun ? readRecord(activeRun.input) : {
      sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
      sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
      pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
    }
    const graphNodes = displayGraphState?.nodes ?? nodes
    const graphNodeKeySet = new Set(graphNodes.map((node) => node.key))
    const coverageAnchorOnwardRun = runScope === 'node_and_downstream'
      && readScreenplayAnimaticRole(workflowMetadata) === 'shot_production'
      && nodeKeys.some(isSequenceAnimaticCoverageAnchorNodeKey)
      && graphNodeKeySet.has('planned_keyframe_artifact')
    const effectiveRunScope: OutputWorkflowRunScope = coverageAnchorOnwardRun ? 'upstream_to_node' : runScope
    const targetNodeKeys = coverageAnchorOnwardRun
      ? ['planned_keyframe_artifact']
      : runScope === 'artifact_rebake'
        ? ['artifact']
        : nodeKeys
    const forceNodeKeys = coverageAnchorOnwardRun
      ? sequenceAnimaticCoverageAnchorOnwardForceNodeKeys.filter((key) => graphNodeKeySet.has(key))
      : runScope === 'artifact_rebake'
        ? Array.from(new Set([...nodeKeys, 'artifact']))
        : nodeKeys

    setRunBusy(true)
    setTargetedRunScope(effectiveRunScope)
    setTargetedNodeKeys(nodeKeys)
    setSyncMessage(`Starting ${nodeKeys.length === 1 ? nodeKeys[0] : `${nodeKeys.length} nodes`}...`)
    try {
      const runResponse = await Promise.resolve(onStartOutputWorkflowRun({
        workflowId: targetWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || request?.prompt || '',
        targetFormat: readOutputTargetFormat(activeRun?.targetFormat || workflowMetadata.targetFormat || request?.targetFormat),
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        pageCount: readNumber(previousInput.pageCount) ?? undefined,
        input: previousInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: nodeKeys.length === 1 ? 'targeted_node_preview' : 'targeted_node_batch_preview',
          requestedRunScope: runScope,
          effectiveRunScope,
          runScope: effectiveRunScope,
          targetNodeKeys,
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: runScope === 'node_only',
          startedFrom: 'output_graph_overlay_host',
        },
      }))
      const nextRunId = runResponse.run.id
      graphRevisionRef.current = null
      setSelectedNodeKey(nodeKeys[0] ?? null)
      setSyncMessage('Node run started.')
      void Promise.resolve(onLoadOutputWorkflowGraph(targetWorkflow.id, nextRunId, nodeKeys[0] ?? null, {
        knownGraphRevision: null,
        assetHydrationMode: 'selected',
      })).catch((error) => {
        console.warn('[GraphCore] app graph node run refresh delayed.', error)
      })
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not run selected graph node.')
    } finally {
      setRunBusy(false)
      window.setTimeout(() => {
        setTargetedNodeKeys([])
        setTargetedRunScope(null)
      }, 1200)
    }
  }

  useEffect(() => {
    if (!displayRun) return
    previousDisplayRunRef.current = displayRun
  }, [displayRun])

  useEffect(() => {
    setSelectedNodeKey(openIntent?.selectedNodeKey ?? null)
    setSyncMessage(null)
    previousDisplayRunRef.current = null
    lastGoodGraphStateRef.current = null
  }, [openIntent?.nonce, openIntent?.selectedNodeKey])

  useEffect(() => {
    if (!workflow || nodes.length === 0) return
    lastGoodGraphStateRef.current = { request, workflow, nodes, edges, displayRun }
  }, [displayRun, edges, nodes, request, workflow])

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
    const targetWorkflow = workflow ?? displayGraphState?.workflow ?? null
    const targetWorkflowId = targetWorkflow?.id ?? request?.workflowId ?? null
    if (!targetWorkflowId) return
    if (quiet && graphRefreshInFlightRef.current) return
    graphRefreshInFlightRef.current = true
    if (!quiet) setRefreshingGraph(true)
    lastRefreshAtRef.current = Date.now()
    const shouldUseKnownRevision = loadedGraphNodeCount > 0
    void Promise.resolve(onLoadOutputWorkflowGraph(targetWorkflowId, activeRun?.id ?? request?.latestRunId ?? displayGraphState?.displayRun?.id ?? null, selectedNodeKey, {
      knownGraphRevision: shouldUseKnownRevision ? knownGraphRevision : null,
      assetHydrationMode: selectedNodeKey ? 'selected' : 'preview',
    })).then((result) => {
      if (result?.graphRevision) graphRevisionRef.current = result.graphRevision
      if (!quiet) setSyncMessage(result?.unchanged ? 'Cached graph is current.' : null)
    }).catch((error) => {
      setSyncMessage(error instanceof Error ? error.message : 'Graph sync delayed. Showing cached graph data.')
    }).finally(() => {
      graphRefreshInFlightRef.current = false
      if (!quiet) setRefreshingGraph(false)
    })
  }

  const cancelActiveRun = () => {
    const runId = activeRun?.id ?? request?.latestRunId ?? null
    if (!runId || cancelBusy) return
    setCancelBusy(true)
    setSyncMessage('Cancelling run...')
    void Promise.resolve(onCancelOutputWorkflowRun(runId))
      .then(() => {
        setCancelledRunIds((current) => new Set([...current, runId]))
        graphRevisionRef.current = null
        setSyncMessage('Run cancelled.')
        refreshGraph(false)
      })
      .catch((error) => {
        setSyncMessage(error instanceof Error ? error.message : 'Could not cancel output workflow.')
      })
      .finally(() => setCancelBusy(false))
  }

  useEffect(() => {
    const targetWorkflow = workflow ?? displayGraphState?.workflow ?? null
    const targetWorkflowId = targetWorkflow?.id ?? request?.workflowId ?? null
    if (!targetWorkflowId) return undefined
    refreshGraph(loadedGraphNodeCount > 0)
    if (!targetWorkflow) return undefined
    const scheduleRefresh = (delayMs = 450) => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        refreshGraph(true)
      }, delayMs)
    }
    const subscription = onSubscribeOutputWorkflowGraphSignals({
      draftId: snapshot.draft.id,
      workflowId: targetWorkflow.id,
      runId: activeRun?.id ?? displayGraphState?.displayRun?.id ?? null,
      onSignal: (signal) => {
        const runProgressOnly = signal.table === 'output_workflow_run_steps' || signal.table === 'output_workflow_runs'
        scheduleRefresh(runProgressOnly ? 3500 : 650)
      },
    })
    const watchdog = window.setInterval(() => {
      if (!activeRun || isTerminalOutputWorkflowRunStatus(activeRun.status)) return
      if (Date.now() - lastRefreshAtRef.current > 12000) scheduleRefresh(0)
    }, 12000)
    return () => {
      void subscription.unsubscribe()
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      window.clearInterval(watchdog)
    }
  }, [activeRun?.id, activeRun?.status, displayGraphState?.displayRun?.id, displayGraphState?.workflow.id, loadedGraphNodeCount, request?.workflowId, workflow?.id, openIntent?.nonce])

  useEffect(() => {
    const targetWorkflow = workflow ?? displayGraphState?.workflow ?? null
    if (!targetWorkflow || !selectedNodeKey) return
    void Promise.resolve(onLoadOutputWorkflowNodeOutput(targetWorkflow.id, activeRun?.id ?? displayGraphState?.displayRun?.id ?? null, selectedNodeKey, graphRevisionRef.current))
      .catch((error) => console.warn('[GraphCore] app graph node output sync delayed.', error))
  }, [activeRun?.id, displayGraphState?.displayRun?.id, displayGraphState?.workflow.id, onLoadOutputWorkflowNodeOutput, selectedNodeKey, workflow?.id])

  if (!openIntent) return null

  if (!displayGraphState || (displayGraphState.nodes.length === 0 && refreshingGraph)) {
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

  if (!displayGraphState.workflow) {
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
      activeRun={displayGraphState.displayRun}
      assets={snapshot.assets}
      canRunOutputs={canRunOutputs && !runBusy}
      edges={displayGraphState.edges}
      nodes={displayGraphState.nodes}
      worldEntities={snapshot.worldEntities as unknown as Array<Record<string, unknown>>}
      worldRelationships={snapshot.worldRelationships as unknown as Array<Record<string, unknown>>}
      onCancelRun={cancelActiveRun}
      onClose={onClose}
      onRefreshGraph={() => refreshGraph(false)}
      onRunNode={(node, runScope) => void runTargetedNodes([node], runScope)}
      onRunNodes={(runNodes, runScope) => void runTargetedNodes(runNodes, runScope)}
      onSaveNode={onUpdateOutputWorkflowNode}
      onSelectNode={(nodeKey) => setSelectedNodeKey(nodeKey)}
      readNodeSkillKeys={readNodeSkillKeys}
      readOutputPreview={readOutputPreview}
      runErrorMessage={cancelBusy ? 'Cancelling run...' : runBusy ? 'Starting node run...' : syncMessage}
      refreshingGraph={refreshingGraph}
      selectedNodeKey={selectedNodeKey}
      targetedNodeKey={null}
      targetedNodeKeys={targetedNodeKeys}
      targetedRunScope={targetedRunScope}
      workflow={displayGraphState.workflow}
      worldWiki={readRecord(snapshot.draft.metadata).worldWiki}
    />
  )
}
