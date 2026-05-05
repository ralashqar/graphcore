import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { isResolvableAssetUrl, resolveAssetSourceUrl } from '../../domain/assets'
import type { ProjectSnapshot } from '../../domain/graphcore'
import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  type OutputWorkflowNode,
  type OutputWorkflowNodeUpdateResponse,
  type OutputWorkflowPlanResponse,
  type OutputWorkflowRun,
  type OutputWorkflowRunScope,
  type OutputWorkflowRunStep,
  type OutputWorkflowRunStatusResponse,
  type OutputWorkflowStartResponse,
  type OutputWorkflowUpgradeResponse,
} from '../../domain/outputWorkflow'
import { OutputWorkflowGraphOverlay } from './OutputWorkflowGraphOverlay'

type OutputsWorkspaceProps = {
  snapshot: ProjectSnapshot
  canRunOutputs: boolean
  cinematicsPanel: ReactNode
  onPlanOutputWorkflow: (request: {
    prompt: string
    preset?: 'ebook_from_world' | 'comic_issue_from_sequence'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown'
  }) => Promise<OutputWorkflowPlanResponse>
  onStartOutputWorkflow: (plan: OutputWorkflowPlanResponse['plan']) => Promise<OutputWorkflowStartResponse>
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
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
  onUpgradeOutputWorkflowPreset: (request: {
    workflowId: string
    preset?: 'ebook_from_world'
  }) => Promise<OutputWorkflowUpgradeResponse>
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

function resolveArtifactUrlFromMetadata(metadata: Record<string, unknown>) {
  const sourceUrl = readTrimmedString(metadata.sourceUrl)
  if (isResolvableAssetUrl(sourceUrl)) return sourceUrl
  const previewUrl = readTrimmedString(metadata.previewUrl)
  return isResolvableAssetUrl(previewUrl) ? previewUrl : null
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
  if (mimeType.startsWith('image/') || kind === 'image') {
    const extension = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    return { open: 'Open Image', download: 'Download Image', extension }
  }
  if (mimeType.includes('markdown') || kind === 'manuscript') {
    return { open: 'Open Markdown', download: 'Download Markdown', extension: 'md' }
  }
  return { open: 'Open File', download: 'Download File', extension: 'download' }
}

function artifactDownloadFileName(name: string, extension: string) {
  const baseName = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    || 'graphcore-output'
  return baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`
}

async function downloadArtifactUrl(url: string, fileName: string, mimeType: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download artifact (${response.status}).`)
  const sourceBlob = await response.blob()
  const blob = sourceBlob.type || !mimeType
    ? sourceBlob
    : new Blob([sourceBlob], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
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
  onUpgradeOutputWorkflowPreset,
  onRefreshLiveSnapshot,
}: OutputsWorkspaceProps) {
  const [mode, setMode] = useState<'workflows' | 'cinematics'>('workflows')
  const [outputPreset, setOutputPreset] = useState<'ebook' | 'comic'>('ebook')
  const [prompt, setPrompt] = useState('Turn this world into a polished ebook PDF with chapters from the sequence units.')
  const [comicPrompt, setComicPrompt] = useState('Create a polished comic issue from the selected sequence unit, with clear page storytelling, readable lettering, and consistent character art.')
  const [selectedComicSequenceKey, setSelectedComicSequenceKey] = useState('')
  const [comicPageCount, setComicPageCount] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(snapshot.outputWorkflowRuns[0]?.id ?? null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<'output' | 'guidance' | 'metadata'>('output')
  const [targetedNodeKey, setTargetedNodeKey] = useState<string | null>(null)
  const [targetedNodeKeys, setTargetedNodeKeys] = useState<string[]>([])
  const [targetedRunScope, setTargetedRunScope] = useState<OutputWorkflowRunScope | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [refreshingGraph, setRefreshingGraph] = useState(false)
  const [downloadingArtifactKey, setDownloadingArtifactKey] = useState<string | null>(null)
  const [upgradeMode, setUpgradeMode] = useState<'graph' | 'cover' | 'pdf' | null>(null)

  const sequenceUnits = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType === 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const castAndContext = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const workflows = snapshot.outputWorkflows
  const [liveRunsById, setLiveRunsById] = useState<Record<string, OutputWorkflowRun>>({})
  const recentOutputRuns = useMemo(() => {
    const byId = new Map(snapshot.outputWorkflowRuns.map((run) => [run.id, run]))
    for (const run of Object.values(liveRunsById)) byId.set(run.id, run)
    return [...byId.values()].sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))
  }, [liveRunsById, snapshot.outputWorkflowRuns])
  const snapshotActiveRun = recentOutputRuns.find((run) => run.id === activeRunId) ?? recentOutputRuns[0] ?? null
  const liveRun = activeRunId ? liveRunsById[activeRunId] ?? null : null
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
  const activeWorkflowRuns = activeWorkflow
    ? recentOutputRuns.filter((run) => run.workflowId === activeWorkflow.id)
    : []
  const displayRun = useMemo(() => {
    if (!activeRun) return null
    const stepByNodeKey = new Map<string, OutputWorkflowRunStep>()
    const orderedRuns = activeWorkflowRuns.slice().sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    ))
    for (const run of orderedRuns) {
      for (const step of run.steps) stepByNodeKey.set(step.nodeKey, step)
    }
    const artifactById = new Map<string, OutputWorkflowRun['artifacts'][number]>()
    for (const run of orderedRuns) {
      for (const artifact of run.artifacts) artifactById.set(artifact.id, artifact)
    }
    const hasRunningRun = activeWorkflowRuns.some((run) => !isTerminalOutputWorkflowRunStatus(run.status))
    return {
      ...activeRun,
      status: hasRunningRun ? 'running' : activeRun.status,
      steps: [...stepByNodeKey.values()].sort((left, right) => left.orderIndex - right.orderIndex),
      artifacts: [...artifactById.values()],
    } satisfies OutputWorkflowRun
  }, [activeRun, activeWorkflowRuns])
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
    () => new Map((displayRun?.steps ?? []).map((step) => [step.nodeKey, step])),
    [displayRun?.steps],
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
  const artifacts = useMemo(() => {
    const byId = new Map(snapshot.outputArtifacts.map((artifact) => [artifact.id, artifact]))
    for (const artifact of displayRun?.artifacts ?? []) {
      byId.set(artifact.id, artifact)
    }
    return [...byId.values()].sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))
  }, [displayRun?.artifacts, snapshot.outputArtifacts])
  const title = readWorldWikiTitle(snapshot)
  const activeWorkflowNeedsCoverUpgrade = Boolean(
    activeWorkflow
    && activeWorkflow.preset === 'ebook_from_world'
    && activeNodes.length > 0
    && (!nodeByKey.has('cover_prompt') || !nodeByKey.has('cover_image')),
  )

  useEffect(() => {
    if (selectedComicSequenceKey && sequenceUnits.some((entity) => entity.key === selectedComicSequenceKey)) return
    setSelectedComicSequenceKey(sequenceUnits[0]?.key ?? '')
  }, [selectedComicSequenceKey, sequenceUnits])

  useEffect(() => {
    setLiveRunsById((current) => {
      let changed = false
      const next = { ...current }
      for (const run of snapshot.outputWorkflowRuns) {
        const existing = next[run.id]
        if (existing && existing.updatedAt !== run.updatedAt) {
          next[run.id] = run
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [snapshot.outputWorkflowRuns])

  useEffect(() => {
    setTargetedNodeKey((current) => current && targetedNodeKeys.includes(current) ? current : targetedNodeKeys[0] ?? null)
    if (targetedNodeKeys.length === 0) setTargetedRunScope(null)
  }, [targetedNodeKeys])

  function rememberLiveRun(run: OutputWorkflowRun) {
    setLiveRunsById((current) => ({ ...current, [run.id]: run }))
  }

  async function createAndRunEbookWorkflow() {
    setBusy(true)
    setError(null)
    try {
      const sequenceKeys = sequenceUnits.map((entity) => entity.key)
      const entityKeys = castAndContext.slice(0, 24).map((entity) => entity.key)
      const planResponse = await onPlanOutputWorkflow({
        prompt,
        preset: 'ebook_from_world',
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
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Output workflow failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createAndRunComicWorkflow() {
    if (!selectedComicSequenceKey) {
      setError('Select one sequence unit before generating a comic issue.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pageCount = Math.max(1, Math.min(12, comicPageCount))
      const planResponse = await onPlanOutputWorkflow({
        prompt: comicPrompt,
        preset: 'comic_issue_from_sequence',
        selectedEntityKeys: [],
        selectedSequenceUnitKeys: [selectedComicSequenceKey],
        pageCount,
        targetFormat: 'pdf',
      })
      const startResponse = await onStartOutputWorkflow(planResponse.plan)
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: startResponse.workflow.id,
        prompt: planResponse.plan.prompt,
        targetFormat: 'pdf',
        selectedEntityKeys: planResponse.plan.sourceEntityKeys,
        selectedSequenceUnitKeys: planResponse.plan.sourceSequenceUnitKeys,
        pageCount,
        input: { pageCount },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Comic workflow failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pollRun(runId: string) {
    let status = await onGetOutputWorkflowStatus(runId)
    rememberLiveRun(status.run)
    while (!isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputWorkflowStatus(runId)
      rememberLiveRun(status.run)
    }
  }

  async function refreshOutputGraph() {
    if (refreshingGraph) return
    setRefreshingGraph(true)
    setError(null)
    try {
      if (activeRun) {
        const status = await onGetOutputWorkflowStatus(activeRun.id)
        setActiveRunId(status.run.id)
        rememberLiveRun(status.run)
      }
      await onRefreshLiveSnapshot()
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh output workflow graph.')
    } finally {
      setRefreshingGraph(false)
    }
  }

  function openOutputGraph() {
    setGraphOpen(true)
    void refreshOutputGraph()
  }

  function markTargetedNodes(nodeKeys: string[], runScope: OutputWorkflowRunScope) {
    const cleanKeys = nodeKeys.map((key) => key.trim()).filter(Boolean)
    if (cleanKeys.length === 0) return
    setTargetedRunScope(runScope)
    setTargetedNodeKeys((current) => Array.from(new Set([...current, ...cleanKeys])))
  }

  function unmarkTargetedNodes(nodeKeys: string[]) {
    const removeKeys = new Set(nodeKeys)
    setTargetedNodeKeys((current) => current.filter((key) => !removeKeys.has(key)))
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
      rememberLiveRun(runResponse.run)
      setBusy(false)
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Could not retry output workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function runSelectedNodeOnly(
    node: OutputWorkflowNode,
    runScope: OutputWorkflowRunScope = 'node_only',
  ) {
    if (!activeWorkflow) {
      setError('Select or create an output workflow before running a node.')
      return
    }
    const config = readRecord(node.config)
    const purpose = readTrimmedString(config.purpose)
    const isComicWorkflow = activeWorkflow?.preset === 'comic_issue_from_sequence' || nodeByKey.has('comic_pdf_render')
    const renderNodeKey = isComicWorkflow ? 'comic_pdf_render' : 'document_render'
    const pageNumber = readNumber(config.pageNumber) ?? 0
    const pageImageKey = pageNumber > 0 ? `page_${String(pageNumber).padStart(3, '0')}_image` : ''
    const pdfRebake = node.nodeType === 'output_artifact'
    const documentRefresh = node.nodeType === 'document_render'
    const comicAtlasRerun = purpose === 'comic_atlas_prompt' || purpose === 'comic_style_atlas'
    const comicPageRerun = purpose === 'comic_page_prompt' || purpose === 'comic_page'
    const effectiveRunScope: OutputWorkflowRunScope = pdfRebake ? 'artifact_rebake' : documentRefresh && runScope === 'node_only' ? 'artifact_rebake' : runScope
    const defaultDownstreamTarget = comicAtlasRerun
      ? 'comic_atlas_image'
      : purpose === 'ebook_cover_image' || purpose === 'ebook_cover_prompt' || comicPageRerun
        ? 'artifact'
        : documentRefresh
          ? renderNodeKey
          : node.key
    const targetNodeKeys = effectiveRunScope === 'node_and_downstream'
      ? [node.key]
      : effectiveRunScope === 'artifact_rebake'
        ? ['artifact']
        : effectiveRunScope === 'upstream_to_node'
          ? [node.key]
          : [node.key]
    const forceNodeKeys = effectiveRunScope === 'artifact_rebake'
      ? Array.from(new Set([renderNodeKey, 'artifact'].filter(Boolean)))
      : effectiveRunScope === 'node_and_downstream'
        ? Array.from(new Set([
            node.key,
            purpose === 'comic_page_prompt' && pageImageKey ? pageImageKey : '',
            purpose === 'ebook_cover_prompt' || purpose === 'ebook_cover_image' ? 'document_render' : '',
            comicPageRerun ? renderNodeKey : '',
            defaultDownstreamTarget,
          ].filter(Boolean)))
        : [node.key]
    markTargetedNodes([node.key], effectiveRunScope)
    setError(null)
    try {
      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        pageCount: readNumber(previousInput.pageCount) ?? undefined,
        input: previousInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: effectiveRunScope === 'artifact_rebake' ? 'pdf_rebake_from_existing_outputs' : 'targeted_node_preview',
          runScope: effectiveRunScope,
          targetNodeKeys,
          forceNodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: effectiveRunScope === 'node_only',
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(node.key)
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : 'Could not rerun the selected output node.')
    } finally {
      unmarkTargetedNodes([node.key])
    }
  }

  async function runSelectedNodesOnly(
    nodes: OutputWorkflowNode[],
    runScope: OutputWorkflowRunScope = 'node_only',
  ) {
    const uniqueNodes = Array.from(new Map(nodes.map((node) => [node.key, node])).values())
    if (uniqueNodes.length === 0) return
    if (uniqueNodes.length === 1) {
      await runSelectedNodeOnly(uniqueNodes[0], runScope)
      return
    }
    if (!activeWorkflow) {
      setError('Select or create an output workflow before running nodes.')
      return
    }
    const nodeKeys = uniqueNodes.map((node) => node.key)
    markTargetedNodes(nodeKeys, runScope)
    setError(null)
    try {
      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
        pageCount: readNumber(workflowMetadata.pageCount) ?? undefined,
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        pageCount: readNumber(previousInput.pageCount) ?? undefined,
        input: previousInput,
        metadata: {
          sourceRunId: activeRun?.id ?? null,
          runMode: 'targeted_node_batch_preview',
          runScope,
          targetNodeKeys: nodeKeys,
          forceNodeKeys: nodeKeys,
          reuseExistingUpstreamOutputs: true,
          allowStaleUpstreamOutputs: runScope === 'node_only',
        },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(uniqueNodes[0].key)
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : 'Could not rerun the selected output nodes.')
    } finally {
      unmarkTargetedNodes(nodeKeys)
    }
  }

  async function downloadArtifact(assetUrl: string, artifactName: string, extension: string, mimeType: string, artifactKey: string) {
    setDownloadingArtifactKey(artifactKey)
    setError(null)
    try {
      await downloadArtifactUrl(assetUrl, artifactDownloadFileName(artifactName, extension), mimeType)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download the artifact file.')
    } finally {
      setDownloadingArtifactKey(null)
    }
  }

  async function upgradeActiveWorkflow(mode: 'graph' | 'cover' | 'pdf') {
    if (!activeWorkflow) return
    setUpgradeMode(mode)
    setError(null)
    try {
      await onUpgradeOutputWorkflowPreset({
        workflowId: activeWorkflow.id,
        preset: 'ebook_from_world',
      })
      if (mode === 'graph') {
        await onRefreshLiveSnapshot()
        return
      }

      const workflowMetadata = readRecord(activeWorkflow.metadata)
      const previousInput = activeRun ? readRecord(activeRun.input) : {
        sourceEntityKeys: readStringArray(workflowMetadata.sourceEntityKeys),
        sourceSequenceUnitKeys: readStringArray(workflowMetadata.sourceSequenceUnitKeys),
      }
      const runResponse = await onStartOutputWorkflowRun({
        workflowId: activeWorkflow.id,
        prompt: activeRun?.prompt || readTrimmedString(workflowMetadata.prompt) || prompt,
        targetFormat: (activeRun?.targetFormat || readTrimmedString(workflowMetadata.targetFormat) || 'pdf') as 'pdf' | 'epub' | 'docx' | 'markdown',
        selectedEntityKeys: readStringArray(previousInput.sourceEntityKeys),
        selectedSequenceUnitKeys: readStringArray(previousInput.sourceSequenceUnitKeys),
        input: previousInput,
            metadata: mode === 'cover'
              ? {
                  sourceRunId: activeRun?.id ?? null,
                  runMode: 'upgrade_cover_only',
                  targetNodeKeys: ['cover_image'],
                  forceNodeKeys: ['cover_prompt', 'cover_image'],
                }
              : {
                  sourceRunId: activeRun?.id ?? null,
                  runMode: 'upgrade_cover_and_rebuild_pdf',
                  targetNodeKeys: ['artifact'],
                  forceNodeKeys: ['cover_prompt', 'cover_image', 'document_render', 'artifact'],
                  reuseExistingUpstreamOutputs: true,
                },
      })
      setActiveRunId(runResponse.run.id)
      rememberLiveRun(runResponse.run)
      setSelectedNodeKey(mode === 'cover' ? 'cover_image' : 'artifact')
      setInspectorMode('output')
      await pollRun(runResponse.run.id)
      await onRefreshLiveSnapshot()
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : 'Could not upgrade the output workflow.')
    } finally {
      setUpgradeMode(null)
    }
  }

  function selectedNodeRunLabel(node: OutputWorkflowNode) {
    const purpose = readTrimmedString(readRecord(node.config).purpose)
    if (node.nodeType === 'output_artifact') return 'Render/register PDF only'
    if (node.nodeType === 'document_render') return 'Refresh document only'
    if (purpose === 'ebook_cover_prompt') return 'Regenerate cover prompt and PDF'
    if (purpose === 'ebook_cover_image') return 'Regenerate cover and PDF'
    if (purpose === 'comic_atlas_prompt') return 'Regenerate atlas prompt, pages, and PDF'
    if (purpose === 'comic_style_atlas') return 'Regenerate atlas, pages, and PDF'
    if (purpose === 'comic_page_prompt') return 'Regenerate page and PDF'
    if (purpose === 'comic_page') return 'Regenerate page image and PDF'
    if (purpose === 'chapter_prose') return 'Regenerate chapter only'
    if (purpose === 'chapter_section_prose') return 'Regenerate section only'
    return 'Rerun node only'
  }

  return (
    <div className="outputs-workspace">
      {graphOpen && activeWorkflow ? (
        <OutputWorkflowGraphOverlay
          activeRun={displayRun}
          assets={snapshot.assets}
          canRunOutputs={canRunOutputs}
          edges={activeEdges}
          nodes={activeNodes}
          worldEntities={snapshot.worldEntities as unknown as Array<Record<string, unknown>>}
          worldRelationships={snapshot.worldRelationships as unknown as Array<Record<string, unknown>>}
          onCancelRun={cancelActiveRun}
          onClose={() => setGraphOpen(false)}
          onRefreshGraph={() => void refreshOutputGraph()}
          onRunNode={(node, runScope) => void runSelectedNodeOnly(node, runScope)}
          onRunNodes={(nodes, runScope) => void runSelectedNodesOnly(nodes, runScope)}
          onSaveNode={onUpdateOutputWorkflowNode}
          onSelectNode={(nodeKey) => {
            setSelectedNodeKey(nodeKey)
            setInspectorMode('output')
          }}
          readNodeSkillKeys={readNodeSkillKeys}
          readOutputPreview={(step) => truncatePreview(readOutputPreview(step), 14000)}
          runErrorMessage={error}
          refreshingGraph={refreshingGraph}
          selectedNodeKey={selectedNode?.key ?? selectedNodeKey}
          targetedNodeKey={targetedNodeKey}
          targetedNodeKeys={targetedNodeKeys}
          targetedRunScope={targetedRunScope}
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
              <h3>{outputPreset === 'ebook' ? 'Ebook From World' : 'Comic Issue'}</h3>
              <span>{outputPreset === 'ebook' ? `${sequenceUnits.length} sequence units` : '1 sequence unit'}</span>
            </div>
            <div className="outputs-preset-switch" role="tablist" aria-label="Output workflow preset">
              <button className={outputPreset === 'ebook' ? 'is-active' : ''} onClick={() => setOutputPreset('ebook')} type="button">
                Ebook PDF
              </button>
              <button className={outputPreset === 'comic' ? 'is-active' : ''} onClick={() => setOutputPreset('comic')} type="button">
                Comic Issue
              </button>
            </div>
            {outputPreset === 'ebook' ? (
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                aria-label="Output workflow prompt"
              />
            ) : (
              <div className="outputs-comic-controls">
                <label>
                  <span>Sequence unit</span>
                  <select
                    value={selectedComicSequenceKey}
                    onChange={(event) => setSelectedComicSequenceKey(event.target.value)}
                    disabled={sequenceUnits.length === 0}
                  >
                    {sequenceUnits.map((entity) => (
                      <option key={entity.key} value={entity.key}>{entity.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Pages</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={comicPageCount}
                    onChange={(event) => setComicPageCount(Math.max(1, Math.min(12, Number(event.target.value) || 8)))}
                  />
                </label>
                <textarea
                  value={comicPrompt}
                  onChange={(event) => setComicPrompt(event.target.value)}
                  rows={5}
                  aria-label="Comic workflow prompt"
                />
              </div>
            )}
            <button
              className="outputs-primary-action"
              disabled={!canRunOutputs || busy || (outputPreset === 'comic' && !selectedComicSequenceKey)}
              onClick={outputPreset === 'ebook' ? createAndRunEbookWorkflow : createAndRunComicWorkflow}
              type="button"
            >
              {busy ? 'Running workflow...' : outputPreset === 'ebook' ? 'Generate PDF' : 'Generate Comic PDF'}
            </button>
            {!canRunOutputs ? <p className="outputs-error">Output workflows require a live Supabase-backed draft.</p> : null}
            {error ? <p className="outputs-error">{error}</p> : null}
          </section>

          <section className="outputs-panel">
            <div className="outputs-panel-heading">
              <h3>Workflow</h3>
              <span>{activeWorkflow?.preset.replace(/_/g, ' ') ?? 'No workflow yet'}</span>
            </div>
            {activeWorkflowNeedsCoverUpgrade ? (
              <div className="outputs-upgrade-callout">
                <div>
                  <strong>Cover branch available</strong>
                  <p>This workflow was created before ebook cover generation. Upgrade the graph to add cover prompt and GPT Image 2 cover nodes without rerunning chapter prose.</p>
                </div>
                <div className="outputs-upgrade-actions">
                  <button
                    className="outputs-secondary-action"
                    disabled={!canRunOutputs || Boolean(upgradeMode)}
                    onClick={() => void upgradeActiveWorkflow('graph')}
                    type="button"
                  >
                    {upgradeMode === 'graph' ? 'Upgrading...' : 'Upgrade graph'}
                  </button>
                  <button
                    className="outputs-secondary-action"
                    disabled={!canRunOutputs || Boolean(upgradeMode)}
                    onClick={() => void upgradeActiveWorkflow('cover')}
                    type="button"
                  >
                    {upgradeMode === 'cover' ? 'Generating...' : 'Upgrade + cover only'}
                  </button>
                  <button
                    className="outputs-secondary-action"
                    disabled={!canRunOutputs || Boolean(upgradeMode)}
                    onClick={() => void upgradeActiveWorkflow('pdf')}
                    type="button"
                  >
                    {upgradeMode === 'pdf' ? 'Rebuilding...' : 'Upgrade + rebuild PDF'}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="outputs-workflow-actions">
              <button
                className="outputs-secondary-action"
                disabled={!activeWorkflow || activeNodes.length === 0}
                onClick={openOutputGraph}
                type="button"
              >
                {refreshingGraph ? 'Refreshing graph...' : 'Expand graph'}
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
              const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(readRecord(artifact.metadata))
              const metadata = readRecord(artifact.metadata)
              const renderMetadata = readRecord(metadata.render)
              const markdownPreview = readTrimmedString(metadata.markdownPreview)
              const mimeType = artifact.mimeType || asset?.mimeType || ''
              const actionLabels = artifactActionLabels(mimeType, artifact.kind)
              const isImageArtifact = mimeType.startsWith('image/') || artifact.kind === 'image'
              const byteSize = formatByteSize(renderMetadata.byteSize)
              const pageCount = readNumber(renderMetadata.pageCount)
              const manuscriptLength = readNumber(renderMetadata.manuscriptCharacterCount)
              const pageSize = readTrimmedString(renderMetadata.pageSize)
              return (
                <article className="outputs-artifact-card" key={artifact.id}>
                  <div>
                    {isImageArtifact && url ? (
                      <img className="outputs-artifact-image" src={url} alt={artifact.name} loading="lazy" />
                    ) : null}
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
                    {url ? (
                      <button
                        className="outputs-artifact-action-button"
                        disabled={downloadingArtifactKey === artifact.key}
                        type="button"
                        onClick={() => downloadArtifact(url, artifact.name, actionLabels.extension, mimeType, artifact.key)}
                      >
                        {downloadingArtifactKey === artifact.key ? 'Downloading...' : actionLabels.download}
                      </button>
                    ) : <span>{actionLabels.download}</span>}
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
