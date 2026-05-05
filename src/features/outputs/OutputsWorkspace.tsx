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
  type OutputRequest,
  type OutputRequestStatusResponse,
  type OutputArtifact,
} from '../../domain/outputWorkflow'
import { OutputWorkflowGraphOverlay } from './OutputWorkflowGraphOverlay'

type OutputsWorkspaceProps = {
  snapshot: ProjectSnapshot
  canRunOutputs: boolean
  cinematicsPanel: ReactNode
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image'
  }) => Promise<OutputRequestStatusResponse>
  onGetOutputRequestStatus: (requestId: string) => Promise<OutputRequestStatusResponse>
  onCancelOutputRequest: (requestId: string) => Promise<OutputRequestStatusResponse>
  onDeleteOutputRequest: (requestId: string) => Promise<unknown>
  onPlanOutputWorkflow: (request: {
    prompt: string
    preset?: 'ebook_from_world' | 'story_bible_from_world' | 'comic_issue_from_sequence'
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

function readImageAspectRatio(...records: Array<unknown>) {
  for (const value of records) {
    const record = readRecord(value)
    const image = readRecord(record.image)
    const imageSize = readRecord(record.imageSize)
    const width = readNumber(record.width) ?? readNumber(image.width) ?? readNumber(imageSize.width)
    const height = readNumber(record.height) ?? readNumber(image.height) ?? readNumber(imageSize.height)
    if (width && height && width > 0 && height > 0) return `${width} / ${height}`
  }
  return ''
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

function statusClass(value: string) {
  return value.replace(/\s+/g, '-')
}

type OutputStudioStageKey = 'context' | 'writing' | 'images' | 'render' | 'artifacts'

function outputStageForNode(node: OutputWorkflowNode): OutputStudioStageKey {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  if (node.nodeType === 'world_context_query' || node.nodeType === 'skill_context_query' || purpose === 'comic_entity_selector') {
    return 'context'
  }
  if (node.nodeType === 'image_generation') return 'images'
  if (node.nodeType === 'document_render') return 'render'
  if (node.nodeType === 'output_artifact') return 'artifacts'
  return 'writing'
}

const OUTPUT_STAGE_COPY: Record<OutputStudioStageKey, { title: string; eyebrow: string; empty: string }> = {
  context: {
    title: 'Context',
    eyebrow: 'World graph inputs',
    empty: 'World, sequence, and guidance inputs appear here once a workflow exists.',
  },
  writing: {
    title: 'Writing',
    eyebrow: 'Scripts, prose, prompts',
    empty: 'Script, chapter, prompt, and planning nodes will collect here.',
  },
  images: {
    title: 'Images',
    eyebrow: 'Cover, atlas, pages',
    empty: 'Image generation nodes will show previews and provider status here.',
  },
  render: {
    title: 'Render',
    eyebrow: 'PDF assembly',
    empty: 'Document and comic PDF render nodes appear here.',
  },
  artifacts: {
    title: 'Artifacts',
    eyebrow: 'Open and download',
    empty: 'Final registration nodes appear here before files land in the gallery.',
  },
}

const OUTPUT_STAGE_ORDER = ['context', 'writing', 'images', 'render', 'artifacts'] as const

function buildWorkflowStages(input: {
  nodes: OutputWorkflowNode[]
  levels: string[][]
  nodeByKey: Map<string, OutputWorkflowNode>
  stepsByNodeKey: Map<string, OutputWorkflowRunStep>
}) {
  const stages = OUTPUT_STAGE_ORDER.map((key) => ({
    key,
    ...OUTPUT_STAGE_COPY[key],
    levels: [] as Array<{ levelIndex: number; nodes: OutputWorkflowNode[] }>,
    counts: new Map<string, number>(),
    total: 0,
  }))
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]))
  const placed = new Set<string>()

  input.levels.forEach((level, levelIndex) => {
    const grouped = new Map<OutputStudioStageKey, OutputWorkflowNode[]>()
    for (const nodeKey of level) {
      const node = input.nodeByKey.get(nodeKey)
      if (!node) continue
      const stageKey = outputStageForNode(node)
      const group = grouped.get(stageKey) ?? []
      group.push(node)
      grouped.set(stageKey, group)
      placed.add(node.key)
    }
    for (const [stageKey, nodes] of grouped) {
      stageByKey.get(stageKey)?.levels.push({ levelIndex, nodes })
    }
  })

  for (const node of input.nodes) {
    if (placed.has(node.key)) continue
    const stage = stageByKey.get(outputStageForNode(node))
    if (stage) stage.levels.push({ levelIndex: stage.levels.length, nodes: [node] })
  }

  for (const stage of stages) {
    for (const level of stage.levels) {
      for (const node of level.nodes) {
        stage.total += 1
        const status = statusKeyForStep(input.stepsByNodeKey.get(node.key))
        stage.counts.set(status, (stage.counts.get(status) ?? 0) + 1)
      }
    }
  }

  return stages
}

function workflowPresetLabel(value: string | null | undefined) {
  if (value === 'comic_issue_from_sequence') return 'Comic Issue'
  if (value === 'ebook_from_world') return 'Ebook PDF'
  if (value === 'story_bible_from_world') return 'Story Bible'
  return value ? value.replace(/_/g, ' ') : 'No workflow yet'
}

function outputKindLabel(value: string | null | undefined) {
  if (value === 'concept_art_image') return 'Concept Art'
  if (value === 'poster_image') return 'Poster Image'
  if (value === 'story_bible_from_world') return 'Story Bible'
  if (value === 'world_reference_document') return 'World Reference'
  if (value === 'lore_guide') return 'Lore Guide'
  if (value === 'character_dossier_pack') return 'Character Dossiers'
  if (value === 'short_story') return 'Short Story'
  if (value === 'narrative_chapter_or_ebook') return 'Narrative Ebook'
  if (value === 'ebook_from_world') return 'Ebook PDF'
  if (value === 'comic_issue_from_sequence') return 'Comic Issue'
  if (value === 'cinematic_trailer') return 'Cinematic Trailer'
  if (value === 'cinematic_episode') return 'Cinematic Episode'
  if (value === 'ugc_episode') return 'UGC Episode'
  return 'Output'
}

function plannedSectionTitles(request: OutputRequest | null | undefined) {
  const metadata = readRecord(request?.metadata)
  const rawSections = Array.isArray(metadata.plannedSections) ? metadata.plannedSections : []
  return rawSections
    .map((entry) => readTrimmedString(readRecord(entry).title))
    .filter(Boolean)
}

function purposeLabel(node: OutputWorkflowNode) {
  const purpose = readTrimmedString(readRecord(node.config).purpose)
  return purpose ? purpose.replace(/_/g, ' ') : node.nodeType.replace(/_/g, ' ')
}

function isImageArtifact(artifact: OutputArtifact, mimeType: string) {
  return mimeType.startsWith('image/') || artifact.kind === 'image'
}

function compactStatusForSteps(steps: OutputWorkflowRunStep[]) {
  if (steps.some((step) => step.status === 'running')) return 'running'
  if (steps.some((step) => {
    const status = String(step.status)
    return status === 'failed' || status === 'blocked'
  })) return 'failed'
  if (steps.length > 0 && steps.every((step) => {
    const status = String(step.status)
    return status === 'completed' || status === 'skipped'
  })) return 'completed'
  if (steps.some((step) => step.status === 'cancelled')) return 'cancelled'
  return steps.length > 0 ? 'queued' : 'empty'
}

export function OutputsWorkspace({
  snapshot,
  canRunOutputs,
  cinematicsPanel,
  onPlanOutputWorkflow,
  onStartOutputRequest,
  onGetOutputRequestStatus,
  onCancelOutputRequest,
  onDeleteOutputRequest,
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
  const [requestPrompt, setRequestPrompt] = useState('Make a poster image from this world using the main characters and strongest location.')
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(snapshot.outputRequests[0]?.id ?? null)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
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
  const worldEntityNameByKey = useMemo(
    () => new Map(snapshot.worldEntities.map((entity) => [entity.key, entity.name || entity.key])),
    [snapshot.worldEntities],
  )
  const outputRequests = useMemo(() => snapshot.outputRequests.slice().sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )), [snapshot.outputRequests])
  const selectedOutputRequest = selectedRequestId
    ? outputRequests.find((request) => request.id === selectedRequestId) ?? null
    : outputRequests[0] ?? null
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
  const assetByKey = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.key, asset])), [snapshot.assets])
  const selectedStep = selectedNode ? stepsByNodeKey.get(selectedNode.key) ?? null : null
  const selectedOutputPreview = truncatePreview(readOutputPreview(selectedStep))
  const selectedOutputImageUrl = useMemo(() => {
    const outputs = readRecord(selectedStep?.outputs)
    const image = readRecord(outputs.image)
    const assetKey = readTrimmedString(image.assetKey) || readTrimmedString(outputs.assetKey)
    const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
    return resolveAssetSourceUrl(asset) || null
  }, [assetByKey, selectedStep?.outputs])
  const runStepCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const step of displayRun?.steps ?? []) {
      const key = statusKeyForStep(step)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [displayRun?.steps])
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
  const activeRunStatusLabel = activeRun ? formatStatus(displayRun?.status ?? activeRun.status) : 'Idle'
  const runningNodeCount = runStepCounts.get('running') ?? 0
  const failedNodeCount = (runStepCounts.get('failed') ?? 0) + (runStepCounts.get('blocked') ?? 0)
  const completedNodeCount = (runStepCounts.get('completed') ?? 0) + (runStepCounts.get('skipped') ?? 0)
  const workflowStages = useMemo(() => buildWorkflowStages({
    nodes: activeNodes,
    levels: workflowExecutionPlan?.levels ?? [],
    nodeByKey,
    stepsByNodeKey,
  }), [activeNodes, nodeByKey, stepsByNodeKey, workflowExecutionPlan?.levels])
  const primaryArtifact = artifacts.find((artifact) => artifact.mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' || artifact.kind === 'pdf')
    ?? artifacts.find((artifact) => artifact.kind === 'image')
    ?? artifacts[0]
    ?? null
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

  async function createPromptOutputRequest() {
    const cleanPrompt = requestPrompt.trim()
    if (!cleanPrompt) {
      setError('Describe the output you want to make from this world.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await onStartOutputRequest({
        prompt: cleanPrompt,
        sourceSurface: 'outputs',
      })
      setSelectedRequestId(response.request.id)
      if (response.run) {
        setActiveRunId(response.run.id)
        rememberLiveRun(response.run)
      }
      setBusy(false)
      if (response.request.latestRunId) await pollRequest(response.request.id)
      await onRefreshLiveSnapshot()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Output request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pollRequest(requestId: string) {
    let status = await onGetOutputRequestStatus(requestId)
    if (status.run) {
      setActiveRunId(status.run.id)
      rememberLiveRun(status.run)
    }
    while (!status.terminal && status.run && !isTerminalOutputWorkflowRunStatus(status.run.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1800))
      status = await onGetOutputRequestStatus(requestId)
      if (status.run) rememberLiveRun(status.run)
    }
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
      <header className="outputs-hero">
        <div className="outputs-hero-copy">
          <p className="outputs-eyebrow">Output Studio</p>
          <p>Prompt books, comics, images, and video packages from this world without rebuilding canon.</p>
        </div>
        <div className="outputs-hero-actions">
          <div className="outputs-mode-switch" role="tablist" aria-label="Output modes">
            <button className={mode === 'workflows' ? 'is-active' : ''} onClick={() => setMode('workflows')} type="button">
              Workflows
            </button>
            <button className={mode === 'cinematics' ? 'is-active' : ''} onClick={() => setMode('cinematics')} type="button">
              Cinematics
            </button>
          </div>
        </div>
      </header>

      {mode === 'cinematics' ? (
        <div className="outputs-cinematics-shell">{cinematicsPanel}</div>
      ) : (
        <>
          <section className="outputs-command-center is-prompt-only">
            <section className="outputs-panel outputs-request-composer">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Prompt-first output</p>
                  <h3>What do you want to make from this world?</h3>
                </div>
                <span>{outputRequests.length} requests</span>
              </div>
              <label className="outputs-input-block">
                <span>Output request</span>
                <textarea
                  value={requestPrompt}
                  onChange={(event) => setRequestPrompt(event.target.value)}
                  rows={5}
                  aria-label="Prompt an output from this world"
                  placeholder="Make a poster of Ilya and Anya at the checkpoint..."
                />
                <small>Routes to approved output workflows, binds world entities, then runs the generated workflow.</small>
              </label>
              <div className="outputs-example-strip" aria-label="Example output prompts">
                {[
                  'Poster image of two characters at the checkpoint',
                  'Short story about a missing artifact',
                  'Comic issue from Chapter 1',
                ].map((example) => (
                  <button key={example} type="button" onClick={() => setRequestPrompt(example)}>
                    {example}
                  </button>
                ))}
              </div>
              <div className="outputs-composer-submit-row">
                <button
                  className="outputs-primary-action"
                  disabled={!canRunOutputs || busy}
                  onClick={createPromptOutputRequest}
                  type="button"
                >
                  {busy ? 'Creating output...' : 'Generate output'}
                </button>
                {!canRunOutputs ? <p className="outputs-error">Output workflows require a live Supabase-backed draft.</p> : null}
                {error ? <p className="outputs-error">{error}</p> : null}
              </div>
            </section>
            <aside className="outputs-top-results">
              <section className="outputs-panel outputs-artifacts">
                <div className="outputs-panel-heading">
                  <div>
                    <p className="outputs-eyebrow">Results</p>
                    <h3>Artifacts</h3>
                  </div>
                  <span>{artifacts.length}</span>
                </div>
                {primaryArtifact ? (
                  <div className="outputs-primary-artifact">
                    <span>Latest deliverable</span>
                    <strong>{primaryArtifact.name}</strong>
                    <small>{primaryArtifact.kind.replace(/_/g, ' ')}</small>
                  </div>
                ) : (
                  <div className="outputs-primary-artifact is-empty">
                    <span>Nothing exported yet</span>
                    <strong>Run a workflow to create PDFs, images, and packages.</strong>
                  </div>
                )}
                <div className="outputs-artifact-list">
                  {artifacts.length > 0 ? artifacts.slice(0, 3).map((artifact) => {
                    const asset = artifact.assetKey ? assetByKey.get(artifact.assetKey) ?? null : null
                    const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(readRecord(artifact.metadata))
                    const mimeType = artifact.mimeType || asset?.mimeType || ''
                    const actionLabels = artifactActionLabels(mimeType, artifact.kind)
                    const imageArtifact = isImageArtifact(artifact, mimeType)
                    return (
                      <article className={`outputs-artifact-card ${imageArtifact ? 'is-image' : ''}`} key={`top-${artifact.id}`}>
                        {imageArtifact && url ? (
                          <img className="outputs-artifact-image" src={url} alt={artifact.name} loading="lazy" />
                        ) : (
                          <div className="outputs-artifact-fileplate">
                            <span>{mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' ? 'PDF' : artifact.kind.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                        <div className="outputs-artifact-body">
                          <strong>{artifact.name}</strong>
                          <span>{artifact.kind.toUpperCase()} - {mimeType || 'artifact'}</span>
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
                          </div>
                        </div>
                      </article>
                    )
                  }) : (
                    <p className="outputs-muted">Openable files appear here as soon as render or image nodes finish.</p>
                  )}
                </div>
              </section>
            </aside>

            <section className="outputs-panel outputs-composer outputs-advanced-presets">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Advanced presets</p>
                  <h3>{outputPreset === 'ebook' ? 'Ebook PDF' : 'Comic Issue'}</h3>
                </div>
                <span>{outputPreset === 'ebook' ? `${sequenceUnits.length} sequence units` : `${comicPageCount} pages`}</span>
              </div>
              <div className="outputs-preset-switch" role="tablist" aria-label="Output workflow preset">
                <button className={outputPreset === 'ebook' ? 'is-active' : ''} onClick={() => setOutputPreset('ebook')} type="button">
                  <strong>Ebook PDF</strong>
                  <span>Manuscript and cover-ready PDF</span>
                </button>
                <button className={outputPreset === 'comic' ? 'is-active' : ''} onClick={() => setOutputPreset('comic')} type="button">
                  <strong>Comic Issue</strong>
                  <span>Script, atlas, pages, PDF</span>
                </button>
              </div>
              <div className="outputs-composer-meta">
                <span>{castAndContext.length} world entities</span>
                <span>{sequenceUnits.length} sequence units</span>
                <span>{artifacts.length} artifacts</span>
              </div>
              {outputPreset === 'ebook' ? (
                <label className="outputs-input-block">
                  <span>Output prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={6}
                    aria-label="Output workflow prompt"
                  />
                  <small>Uses the project wiki, sequence units, entity context, output skills, and cached workflow outputs.</small>
                </label>
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
                  <label className="outputs-input-block">
                    <span>Comic direction</span>
                    <textarea
                      value={comicPrompt}
                      onChange={(event) => setComicPrompt(event.target.value)}
                      rows={6}
                      aria-label="Comic workflow prompt"
                    />
                    <small>Creates one selected-sequence comic with script, atlas references, page images, and a PDF package.</small>
                  </label>
                </div>
              )}
              <button
                className="outputs-primary-action"
                disabled={!canRunOutputs || busy || (outputPreset === 'comic' && !selectedComicSequenceKey)}
                onClick={outputPreset === 'ebook' ? createAndRunEbookWorkflow : createAndRunComicWorkflow}
                type="button"
              >
                {busy ? 'Starting workflow...' : outputPreset === 'ebook' ? 'Generate PDF' : 'Generate Comic PDF'}
              </button>
            </section>
          </section>

          <div className="outputs-studio-grid">
            <main className="outputs-production-main">
              <section className="outputs-panel outputs-request-feed">
                <div className="outputs-panel-heading">
                  <div>
                    <p className="outputs-eyebrow">Production Feed</p>
                    <h3>Prompted Outputs</h3>
                  </div>
                  <span>{outputRequests.length} total</span>
                </div>
                {outputRequests.length === 0 ? (
                  <div className="outputs-empty-feed">
                    <strong>No prompted outputs yet</strong>
                    <p>Use the composer above to create a poster, story, comic, ebook, or future video from this world.</p>
                  </div>
                ) : (
                  <div className="outputs-request-list">
                    {outputRequests.map((request) => {
                      const requestRun = request.latestRunId
                        ? recentOutputRuns.find((run) => run.id === request.latestRunId) ?? null
                        : null
                      const requestWorkflow = request.workflowId
                        ? workflows.find((workflow) => workflow.id === request.workflowId) ?? null
                        : null
                      const requestArtifacts = snapshot.outputArtifacts.filter((artifact) => (
                        artifact.runId === request.latestRunId || artifact.workflowId === request.workflowId
                      ))
                      const requestPrimaryArtifact = requestArtifacts.find((artifact) => artifact.mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' || artifact.kind === 'pdf')
                        ?? requestArtifacts.find((artifact) => artifact.kind === 'image')
                        ?? requestArtifacts[0]
                        ?? null
                      const imageArtifact = requestArtifacts.find((artifact) => artifact.kind === 'image') ?? requestPrimaryArtifact
                      const imageAsset = imageArtifact?.assetKey ? assetByKey.get(imageArtifact.assetKey) ?? null : null
                      const imageUrl = resolveAssetSourceUrl(imageAsset) || (imageArtifact ? resolveArtifactUrlFromMetadata(readRecord(imageArtifact.metadata)) : '')
                      const imageAspectRatio = imageArtifact
                        ? readImageAspectRatio(imageArtifact.metadata, imageAsset?.metadata)
                        : ''
                      const primaryAsset = requestPrimaryArtifact?.assetKey ? assetByKey.get(requestPrimaryArtifact.assetKey) ?? null : null
                      const primaryUrl = requestPrimaryArtifact ? resolveAssetSourceUrl(primaryAsset) || resolveArtifactUrlFromMetadata(readRecord(requestPrimaryArtifact.metadata)) : ''
                      const primaryMimeType = requestPrimaryArtifact?.mimeType || primaryAsset?.mimeType || ''
                      const primaryActionLabels = requestPrimaryArtifact ? artifactActionLabels(primaryMimeType, requestPrimaryArtifact.kind) : null
                      const rowStatus = requestRun?.status ?? request.status
                      const progressSteps = requestRun?.steps ?? []
                      const completedCount = progressSteps.filter((step) => {
                        const stepStatus = String(step.status)
                        return stepStatus === 'completed' || stepStatus === 'skipped'
                      }).length
                      const failedCount = progressSteps.filter((step) => {
                        const stepStatus = String(step.status)
                        return stepStatus === 'failed' || stepStatus === 'blocked'
                      }).length
                      const activeStep = progressSteps.find((step) => step.status === 'running')
                        ?? progressSteps.find((step) => {
                          const stepStatus = String(step.status)
                          return stepStatus === 'failed' || stepStatus === 'blocked'
                        })
                        ?? progressSteps.find((step) => step.status === 'queued')
                        ?? null
                      const rowStageSummary = [
                        {
                          label: 'Context',
                          steps: progressSteps.filter((step) => step.nodeType === 'world_context_query' || step.nodeType === 'skill_context_query'),
                        },
                        {
                          label: 'Writing',
                          steps: progressSteps.filter((step) => step.nodeType === 'text_llm' || step.nodeType === 'utility_transform'),
                        },
                        {
                          label: 'Images',
                          steps: progressSteps.filter((step) => step.nodeType === 'image_generation'),
                        },
                        {
                          label: 'Render',
                          steps: progressSteps.filter((step) => step.nodeType === 'document_render' || step.nodeType === 'output_artifact'),
                        },
                      ].filter((stage) => stage.steps.length > 0)
                      const isSelected = selectedOutputRequest?.id === request.id
                      const progressPercent = progressSteps.length > 0 ? Math.round((completedCount / progressSteps.length) * 100) : 0
                      const plannedSections = plannedSectionTitles(request)
                      return (
                        <article className={`outputs-request-row ${isSelected ? 'is-selected' : ''} is-${statusClass(rowStatus)}`} key={request.id}>
                          <button
                            className="outputs-request-main"
                            type="button"
                            onClick={() => {
                              setSelectedRequestId(request.id)
                              if (request.latestRunId) setActiveRunId(request.latestRunId)
                              if (request.workflowId) setSelectedNodeKey(null)
                            }}
                          >
                            <span
                              className={`outputs-request-preview ${imageUrl ? 'has-image' : ''}`}
                              style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined}
                            >
                              {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className={`outputs-status-icon is-${statusClass(rowStatus)}`} aria-hidden="true" />}
                            </span>
                            <span className="outputs-request-content">
                              <span className="outputs-request-kicker">
                                <small>{outputKindLabel(request.outputKind)}</small>
                                <small>{requestWorkflow ? workflowPresetLabel(requestWorkflow.preset) : formatStatus(request.status)}</small>
                                <small>{formatStatus(rowStatus)}</small>
                              </span>
                              <strong>{request.title}</strong>
                              <em>{request.prompt}</em>
                              <span className="outputs-request-context">
                                {request.selectedEntityKeys.slice(0, 3).map((key) => <small key={key}>{worldEntityNameByKey.get(key) ?? key}</small>)}
                                {request.selectedSequenceUnitKeys.slice(0, 2).map((key) => <small key={key}>{worldEntityNameByKey.get(key) ?? key}</small>)}
                                {plannedSections.slice(0, 3).map((title) => <small key={title}>{title}</small>)}
                                {plannedSections.length > 3 ? <small>{plannedSections.length} sections</small> : null}
                                {request.outputKind === 'comic_issue_from_sequence' && request.pageCount ? <small>{request.pageCount} pages</small> : null}
                              </span>
                              <span className="outputs-row-workflow" aria-label="Workflow stage summary">
                                {rowStageSummary.length > 0 ? rowStageSummary.map((stage) => (
                                  <small className={`is-${compactStatusForSteps(stage.steps)}`} key={stage.label}>
                                    <i aria-hidden="true" />
                                    {stage.label}
                                    <b>{stage.steps.filter((step) => {
                                      const status = String(step.status)
                                      return status === 'completed' || status === 'skipped'
                                    }).length}/{stage.steps.length}</b>
                                  </small>
                                )) : (
                                  <small className="is-empty"><i aria-hidden="true" />Planning<b>0/0</b></small>
                                )}
                              </span>
                            </span>
                          </button>
                          <div className="outputs-request-side">
                            <div className="outputs-request-progress">
                              <span>{progressSteps.length > 0 ? `${completedCount}/${progressSteps.length} nodes` : formatStatus(request.status)}</span>
                              <i style={{ ['--progress' as string]: `${progressPercent}%` }} />
                            </div>
                            {activeStep ? <small>{activeStep.label}</small> : failedCount > 0 ? <small>{failedCount} nodes need attention</small> : <small>{requestPrimaryArtifact ? requestPrimaryArtifact.name : 'Waiting for artifact'}</small>}
                            <div className="outputs-request-actions">
                              {requestPrimaryArtifact && primaryUrl && primaryActionLabels ? <a className="outputs-secondary-action outputs-compact-action" href={primaryUrl} target="_blank" rel="noreferrer">{primaryActionLabels.open}</a> : null}
                              {requestPrimaryArtifact && primaryUrl && primaryActionLabels ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={downloadingArtifactKey === requestPrimaryArtifact.key}
                                  type="button"
                                  onClick={() => downloadArtifact(primaryUrl, requestPrimaryArtifact.name, primaryActionLabels.extension, primaryMimeType, requestPrimaryArtifact.key)}
                                >
                                  {downloadingArtifactKey === requestPrimaryArtifact.key ? 'Downloading...' : 'Download'}
                                </button>
                              ) : null}
                              <button
                                className="outputs-secondary-action outputs-compact-action"
                                disabled={busyRequestId === request.id}
                                onClick={async () => {
                                  setSelectedRequestId(request.id)
                                  if (request.latestRunId) setActiveRunId(request.latestRunId)
                                  setBusyRequestId(request.id)
                                  setError(null)
                                  try {
                                    await pollRequest(request.id)
                                    await onRefreshLiveSnapshot()
                                  } catch (requestError) {
                                    setError(requestError instanceof Error ? requestError.message : 'Could not refresh output request.')
                                  } finally {
                                    setBusyRequestId(null)
                                  }
                                }}
                                type="button"
                              >
                                {busyRequestId === request.id ? 'Refreshing...' : 'Details'}
                              </button>
                              {requestWorkflow ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequestId(request.id)
                                    if (request.latestRunId) setActiveRunId(request.latestRunId)
                                    openOutputGraph()
                                  }}
                                >
                                  Graph
                                </button>
                              ) : null}
                              {!requestRun || isTerminalOutputWorkflowRunStatus(requestRun.status) ? null : (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={busyRequestId === request.id}
                                  onClick={async () => {
                                    setBusyRequestId(request.id)
                                    setError(null)
                                    try {
                                      await onCancelOutputRequest(request.id)
                                      await onRefreshLiveSnapshot()
                                    } catch (requestError) {
                                      setError(requestError instanceof Error ? requestError.message : 'Could not cancel output request.')
                                    } finally {
                                      setBusyRequestId(null)
                                    }
                                  }}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              )}
                              {!requestRun || isTerminalOutputWorkflowRunStatus(requestRun.status) ? (
                                <button
                                  className="outputs-secondary-action outputs-compact-action"
                                  disabled={busyRequestId === request.id}
                                  onClick={async () => {
                                    const confirmed = window.confirm('Remove this output request from the list? Generated assets and workflow records are left intact.')
                                    if (!confirmed) return
                                    setBusyRequestId(request.id)
                                    setError(null)
                                    try {
                                      await onDeleteOutputRequest(request.id)
                                      if (selectedRequestId === request.id) {
                                        const nextRequest = outputRequests.find((entry) => entry.id !== request.id) ?? null
                                        setSelectedRequestId(nextRequest?.id ?? null)
                                        if (nextRequest?.latestRunId) setActiveRunId(nextRequest.latestRunId)
                                      }
                                      await onRefreshLiveSnapshot()
                                    } catch (requestError) {
                                      setError(requestError instanceof Error ? requestError.message : 'Could not delete output request.')
                                    } finally {
                                      setBusyRequestId(null)
                                    }
                                  }}
                                  type="button"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </main>

            <aside className="outputs-results-rail">
              <section className="outputs-panel outputs-run-card">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Run</p>
                  <h3>Production Status</h3>
                </div>
                <span>{activeRunStatusLabel}</span>
              </div>
              <div className="outputs-run-metrics">
                <div>
                  <strong>{runningNodeCount}</strong>
                  <span>Running</span>
                </div>
                <div>
                  <strong>{completedNodeCount}</strong>
                  <span>Done</span>
                </div>
                <div>
                  <strong>{failedNodeCount}</strong>
                  <span>Needs attention</span>
                </div>
              </div>
              {activeRun ? (
                <div className="outputs-run-summary" aria-label="Run step summary">
                  {['running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped', 'queued'].map((status) => (
                    <span className={`is-${status}`} key={status}>{formatStatus(status)} {runStepCounts.get(status) ?? 0}</span>
                  ))}
                </div>
              ) : (
                <p className="outputs-muted">Start a preset to see queued, running, completed, failed, and skipped nodes.</p>
              )}
              <div className="outputs-run-actions">
                {activeRun && !isTerminalOutputWorkflowRunStatus(activeRun.status) ? (
                  <button className="outputs-secondary-action" disabled={busy} onClick={cancelActiveRun} type="button">
                    Cancel run
                  </button>
                ) : null}
                {activeRun && canRetryActiveRun ? (
                  <button className="outputs-secondary-action" disabled={busy} onClick={retryActiveRunFromFailedNodes} type="button">
                    {busy ? 'Retrying...' : 'Retry failed nodes'}
                  </button>
                ) : null}
              </div>
            </section>
            <section className="outputs-panel outputs-workflow-board">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Workflow</p>
                  <h3>{workflowPresetLabel(activeWorkflow?.preset)}</h3>
                </div>
                <button
                  className="outputs-secondary-action outputs-compact-action"
                  disabled={!activeWorkflow || activeNodes.length === 0}
                  onClick={openOutputGraph}
                  type="button"
                >
                  {refreshingGraph ? 'Refreshing...' : 'Expand graph'}
                </button>
              </div>
              {activeWorkflowNeedsCoverUpgrade ? (
                <div className="outputs-upgrade-callout">
                  <div>
                    <strong>Cover branch available</strong>
                    <p>Add cover prompt and GPT Image 2 cover nodes without rerunning chapter prose.</p>
                  </div>
                  <div className="outputs-upgrade-actions">
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('graph')} type="button">
                      {upgradeMode === 'graph' ? 'Upgrading...' : 'Upgrade graph'}
                    </button>
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('cover')} type="button">
                      {upgradeMode === 'cover' ? 'Generating...' : 'Cover only'}
                    </button>
                    <button className="outputs-secondary-action" disabled={!canRunOutputs || Boolean(upgradeMode)} onClick={() => void upgradeActiveWorkflow('pdf')} type="button">
                      {upgradeMode === 'pdf' ? 'Rebuilding...' : 'Rebuild PDF'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="outputs-stage-board">
                {workflowStages.map((stage) => (
                  <section className="outputs-stage" key={stage.key}>
                    <div className="outputs-stage-head">
                      <div>
                        <span>{stage.eyebrow}</span>
                        <strong>{stage.title}</strong>
                      </div>
                      <small>{stage.total} nodes</small>
                    </div>
                    <div className="outputs-stage-progress" aria-label={`${stage.title} status`}>
                      <span className="is-running">{stage.counts.get('running') ?? 0}</span>
                      <span className="is-completed">{(stage.counts.get('completed') ?? 0) + (stage.counts.get('skipped') ?? 0)}</span>
                      <span className="is-failed">{(stage.counts.get('failed') ?? 0) + (stage.counts.get('blocked') ?? 0)}</span>
                    </div>
                    {stage.levels.length > 0 ? (
                      <div className="outputs-node-list">
                        {stage.levels.map((level) => (
                          <div className="outputs-execution-level" key={`${stage.key}-${level.levelIndex}`}>
                            <div className="outputs-level-heading">
                              <strong>{level.nodes.length > 1 ? `Parallel group ${level.levelIndex + 1}` : `Step ${level.levelIndex + 1}`}</strong>
                              <span>{level.nodes.length > 1 ? `${level.nodes.length} nodes` : '1 node'}</span>
                            </div>
                            <div className="outputs-level-nodes">
                              {level.nodes.map((node) => {
                                const step = stepsByNodeKey.get(node.key)
                                const skillKeys = readNodeSkillKeys(node)
                                const statusKey = statusKeyForStep(step)
                                const outputPreview = readOutputPreview(step)
                                const isTargeted = targetedNodeKeys.includes(node.key)
                                return (
                                  <article
                                    className={`outputs-node-card ${selectedNode?.key === node.key ? 'is-selected' : ''} is-${statusClass(statusKey)} ${isTargeted ? 'is-targeted' : ''}`}
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
                                      <span className={`outputs-status-icon is-${statusClass(isTargeted ? 'running' : statusKey)}`} aria-hidden="true" />
                                      <span>
                                        <strong>{node.label}</strong>
                                        <small>{purposeLabel(node)}</small>
                                      </span>
                                    </button>
                                    {skillKeys.length > 0 ? (
                                      <div className="outputs-skill-chips">
                                        {skillKeys.slice(0, 3).map((skillKey) => <small key={skillKey}>{skillKey.replace(/_/g, ' ')}</small>)}
                                        {skillKeys.length > 3 ? <small>+{skillKeys.length - 3}</small> : null}
                                      </div>
                                    ) : null}
                                    <div className="outputs-node-footer">
                                      <em>{isTargeted ? 'starting' : statusLabelForStep(step)}</em>
                                      <button
                                        className="outputs-node-action"
                                        disabled={!outputPreview && !step?.errorMessage}
                                        onClick={() => {
                                          setSelectedNodeKey(node.key)
                                          setInspectorMode('output')
                                        }}
                                        type="button"
                                      >
                                        View
                                      </button>
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="outputs-muted">{stage.empty}</p>
                    )}
                  </section>
                ))}
              </div>
            </section>
            <section className="outputs-panel outputs-artifacts outputs-detail-artifacts">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Results</p>
                  <h3>Artifacts</h3>
                </div>
                <span>{artifacts.length}</span>
              </div>
              {primaryArtifact ? (
                <div className="outputs-primary-artifact">
                  <span>Latest deliverable</span>
                  <strong>{primaryArtifact.name}</strong>
                  <small>{primaryArtifact.kind.replace(/_/g, ' ')}</small>
                </div>
              ) : (
                <div className="outputs-primary-artifact is-empty">
                  <span>Nothing exported yet</span>
                  <strong>Run a workflow to create PDFs, images, and packages.</strong>
                </div>
              )}
              <div className="outputs-artifact-list">
                {artifacts.length > 0 ? artifacts.map((artifact) => {
                  const asset = artifact.assetKey ? assetByKey.get(artifact.assetKey) ?? null : null
                  const url = resolveAssetSourceUrl(asset) || resolveArtifactUrlFromMetadata(readRecord(artifact.metadata))
                  const metadata = readRecord(artifact.metadata)
                  const renderMetadata = readRecord(metadata.render)
                  const markdownPreview = readTrimmedString(metadata.markdownPreview)
                  const mimeType = artifact.mimeType || asset?.mimeType || ''
                  const actionLabels = artifactActionLabels(mimeType, artifact.kind)
                  const imageArtifact = isImageArtifact(artifact, mimeType)
                  const byteSize = formatByteSize(renderMetadata.byteSize)
                  const pageCount = readNumber(renderMetadata.pageCount)
                  const manuscriptLength = readNumber(renderMetadata.manuscriptCharacterCount)
                  const pageSize = readTrimmedString(renderMetadata.pageSize)
                  return (
                    <article className={`outputs-artifact-card ${imageArtifact ? 'is-image' : ''}`} key={artifact.id}>
                      {imageArtifact && url ? (
                        <img className="outputs-artifact-image" src={url} alt={artifact.name} loading="lazy" />
                      ) : (
                        <div className="outputs-artifact-fileplate">
                          <span>{mimeType === 'application/pdf' || artifact.kind === 'comic_pdf' ? 'PDF' : artifact.kind.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      <div className="outputs-artifact-body">
                        <strong>{artifact.name}</strong>
                        <span>{artifact.kind.toUpperCase()} - {mimeType || 'artifact'}</span>
                        <div className="outputs-artifact-meta">
                          {pageCount ? <small>{pageCount} pages</small> : null}
                          {byteSize ? <small>{byteSize}</small> : null}
                          {manuscriptLength ? <small>{manuscriptLength.toLocaleString()} chars</small> : null}
                          {pageSize ? <small>{pageSize}</small> : null}
                        </div>
                        {artifact.summary ? <p>{artifact.summary}</p> : null}
                        {markdownPreview ? (
                          <details className="outputs-artifact-preview">
                            <summary>Preview manuscript excerpt</summary>
                            <pre>{markdownPreview}</pre>
                          </details>
                        ) : null}
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
                      </div>
                    </article>
                  )
                }) : (
                  <p className="outputs-muted">Openable files will appear here as soon as render or image nodes finish and storage URLs are signed.</p>
                )}
              </div>
            </section>

            <section className="outputs-panel outputs-inspector-panel">
              <div className="outputs-panel-heading">
                <div>
                  <p className="outputs-eyebrow">Inspector</p>
                  <h3>{selectedNode ? selectedNode.label : 'Node Details'}</h3>
                </div>
                <span>{selectedStep ? statusLabelForStep(selectedStep) : 'Not run'}</span>
              </div>
              {selectedNode ? (
                <div className="outputs-inspector">
                  <div className="outputs-inspector-header">
                    <span className={`outputs-status-icon is-${statusClass(targetedNodeKey === selectedNode.key ? 'running' : statusKeyForStep(selectedStep))}`} aria-hidden="true" />
                    <div>
                      <strong>{selectedNode.label}</strong>
                      <span>{purposeLabel(selectedNode)}</span>
                    </div>
                  </div>
                  <div className="outputs-inspector-actions">
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'node_only')} type="button">
                      {targetedNodeKey === selectedNode.key && targetedRunScope === 'node_only' ? 'Starting...' : 'Run node only'}
                    </button>
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'upstream_to_node')} type="button">
                      Run up to node
                    </button>
                    <button className="outputs-node-action" disabled={!canRunOutputs || !activeRun || targetedNodeKey === selectedNode.key} onClick={() => void runSelectedNodeOnly(selectedNode, 'node_and_downstream')} type="button">
                      Node + dependents
                    </button>
                  </div>
                  <div className="outputs-inspector-tabs" role="tablist" aria-label="Node detail views">
                    <button className={inspectorMode === 'output' ? 'is-active' : ''} onClick={() => setInspectorMode('output')} type="button">Latest Output</button>
                    <button className={inspectorMode === 'guidance' ? 'is-active' : ''} onClick={() => setInspectorMode('guidance')} type="button">Prompt / Guidance</button>
                    <button className={inspectorMode === 'metadata' ? 'is-active' : ''} onClick={() => setInspectorMode('metadata')} type="button">Metadata</button>
                  </div>
                  {inspectorMode === 'output' ? (
                    <div className="outputs-output-preview">
                      {selectedOutputImageUrl ? <img className="outputs-selected-image" src={selectedOutputImageUrl} alt={selectedNode.label} loading="lazy" /> : null}
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
                          <ul>{selectedGuidance.guidance.map((entry, index) => <li key={`guidance-${index}`}>{entry}</li>)}</ul>
                        </div>
                      ) : null}
                      {selectedGuidance.avoid.length > 0 ? (
                        <div className="outputs-guidance-section">
                          <strong>Full avoid list sent to node</strong>
                          <ul>{selectedGuidance.avoid.map((entry, index) => <li key={`avoid-${index}`}>{entry}</li>)}</ul>
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
                <p className="outputs-muted">Select a workflow node to inspect output, guidance, cache state, provider metadata, and local run actions.</p>
              )}
            </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
