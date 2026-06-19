import {
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeExecutionMetadata,
  selectOutputWorkflowRunSubgraph,
  validateOutputWorkflowGraph,
  type OutputRequest,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
} from '../../../src/domain/outputWorkflow.ts'
import { outputWorkflowRunIntentDefaults } from '../../../src/domain/outputWorkflowNodeContracts.ts'

type LooseRecord = Record<string, unknown>

export type SequenceAnimaticChildRunIntent =
  | 'prepare_storyboard_block'
  | 'generate_continuity_asset'
  | 'generate_scene_shot_plan'

export type SequenceAnimaticChildRunStartRequest = Pick<
  OutputRequest,
  | 'id'
  | 'projectId'
  | 'draftId'
  | 'parentRequestId'
  | 'latestRunId'
  | 'requestedBy'
  | 'prompt'
  | 'targetFormat'
  | 'selectedEntityKeys'
  | 'selectedSequenceUnitKeys'
  | 'metadata'
>

type SequenceAnimaticChildWorkflowBundle = {
  workflow: OutputWorkflow
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
}

export type SequenceAnimaticChildRunRuntimeHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readArray: (value: unknown) => unknown[]
  readStringArray: (value: unknown) => string[]
  slugify: (value: string) => string
  titleFromRefLike: (value: string) => string
  readScreenplayAnimaticRoleFromMetadata: (metadata: LooseRecord) => string
  buildOutputWorkflowInputFingerprint: (raw: unknown) => string
  loadLatestRunStatus: (input: {
    runId: string
  }) => Promise<string>
  loadContinuityAssetMetadata: (input: {
    projectId: string
    draftId: string
  }) => Promise<LooseRecord[]>
  loadWorkflowNodeByKey: (input: {
    workflowId: string
    nodeKey: string
  }) => Promise<OutputWorkflowNode | null>
  updateWorkflowNodeConfig: (input: {
    nodeId: string
    config: LooseRecord
  }) => Promise<void>
  loadWorkflowBundle: (input: {
    workflowId: string
  }) => Promise<SequenceAnimaticChildWorkflowBundle>
  insertOutputWorkflowRun: (input: {
    projectId: string
    draftId: string
    workflowId: string
    requestedBy?: string | null
    status: 'queued'
    preset: string
    prompt: string
    targetFormat?: string | null
    worldSnapshotFingerprint: string
    runInput: LooseRecord
    metadata: LooseRecord
    heartbeatAt: string
  }) => Promise<{
    id: string
  }>
  insertOutputWorkflowRunSteps: (input: {
    steps: Array<{
      runId: string
      workflowId: string
      nodeId: string
      draftId: string
      nodeKey: string
      nodeType: string
      status: 'queued'
      orderIndex: number
      label: string
      metadata: LooseRecord
    }>
  }) => Promise<void>
  updateOutputRequestForStartedRun: (input: {
    requestId: string
    runId: string
    metadata: LooseRecord
  }) => Promise<void>
  refreshOutputRequestStatusProjection: (input: {
    requestId: string
  }) => Promise<void>
  notifyWorkerWakeBestEffort: (input: {
    runId: string
    projectId: string
    draftId: string
  }) => Promise<void>
}

function continuityAssetEntityFromState(stateInput: unknown, helpers: SequenceAnimaticChildRunRuntimeHelpers) {
  const state = helpers.asRecord(stateInput)
  const assetKey = helpers.readText(state.assetKey)
  const sourceNodeId = helpers.readText(state.sourceNodeId)
  if (!assetKey || !sourceNodeId || helpers.readText(state.status) !== 'ready') return null
  const assetKind = helpers.readText(state.assetKind) || 'continuity_asset'
  return {
    key: `continuity_ref_${helpers.slugify(sourceNodeId)}`,
    name: helpers.readText(state.name) || helpers.titleFromRefLike(sourceNodeId),
    type: assetKind === 'location_angle' || assetKind === 'location_zone' || assetKind === 'location_spot'
      ? 'location_spot'
      : assetKind === 'temporary_character'
        ? 'character'
        : assetKind === 'prop'
          ? 'prop'
          : 'continuity_asset',
    role: 'continuity_reference',
    summary: helpers.readText(state.summary) || 'Animatic-specific scene graph reference generated for continuity.',
    visualDescription: 'Use this generated animatic scene-graph reference to preserve spatial layout, materials, camera setup, identity, and prop design.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_asset',
    selectedReferenceVariantLabel: helpers.readText(state.name) || helpers.titleFromRefLike(sourceNodeId),
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: `Ready continuity asset for scene graph node ${sourceNodeId}.`,
    continuitySourceNodeId: sourceNodeId,
  }
}

async function augmentStoryboardBlockWorkflowAssetPackWithContinuityAssets(input: {
  request: SequenceAnimaticChildRunStartRequest
  workflowId: string
  helpers: SequenceAnimaticChildRunRuntimeHelpers
}) {
  const { helpers } = input
  const requestMetadata = helpers.asRecord(input.request.metadata)
  if (helpers.readScreenplayAnimaticRoleFromMetadata(requestMetadata) !== 'storyboard_block') return
  const masterRequestId = helpers.readText(requestMetadata.masterRequestId)
    || helpers.readText(requestMetadata.parentRequestId)
    || input.request.parentRequestId
  if (!masterRequestId) return
  const continuityEntities = (await helpers.loadContinuityAssetMetadata({
    projectId: input.request.projectId,
    draftId: input.request.draftId,
  }))
    .filter((metadata) => {
      const role = helpers.readText(metadata.role)
      return (role === 'sequence_animatic_continuity_asset' || role === 'sequence_animatic_continuity_asset_batch')
        && helpers.readText(metadata.masterRequestId) === masterRequestId
    })
    .flatMap((metadata) => {
      if (helpers.readText(metadata.role) === 'sequence_animatic_continuity_asset_batch') {
        return Object.values(helpers.asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id))
          .map((state) => continuityAssetEntityFromState(state, helpers))
      }
      return [continuityAssetEntityFromState(metadata.assetState ?? metadata.asset_state, helpers)]
    })
    .filter((entry): entry is LooseRecord => Boolean(entry))
  if (continuityEntities.length === 0) return
  const node = await helpers.loadWorkflowNodeByKey({
    workflowId: input.workflowId,
    nodeKey: 'block_input',
  })
  if (!node) return
  const config = helpers.asRecord(node.config)
  const assetPack = helpers.asRecord(config.assetPack)
  const existingEntities = helpers.readArray(assetPack.entities).map(helpers.asRecord)
  const existingKeys = new Set(existingEntities.map((entity) => helpers.readText(entity.key)).filter(Boolean))
  const mergedContinuityEntities = continuityEntities.filter((entity) => {
    const key = helpers.readText(entity.key)
    if (!key || existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })
  if (mergedContinuityEntities.length === 0) return
  const nextAssetPack = {
    ...assetPack,
    entities: [...existingEntities, ...mergedContinuityEntities].slice(0, 32),
    continuityReferenceAssetKeys: [...new Set([
      ...helpers.readStringArray(assetPack.continuityReferenceAssetKeys),
      ...mergedContinuityEntities.map((entity) => helpers.readText(entity.primaryAssetKey)).filter(Boolean),
    ])],
  }
  await helpers.updateWorkflowNodeConfig({
    nodeId: node.id,
    config: {
      ...config,
      assetPack: nextAssetPack,
      asset_pack: nextAssetPack,
    },
  })
}

export async function startSequenceAnimaticChildRunRuntime(input: {
  request: SequenceAnimaticChildRunStartRequest
  workflowId: string
  runIntent: SequenceAnimaticChildRunIntent
  targetNodeKeys: string[]
  helpers: SequenceAnimaticChildRunRuntimeHelpers
}) {
  const { helpers } = input
  await augmentStoryboardBlockWorkflowAssetPackWithContinuityAssets({
    request: input.request,
    workflowId: input.workflowId,
    helpers,
  })
  const existingRunId = helpers.readText(input.request.latestRunId)
  if (existingRunId) {
    const status = await helpers.loadLatestRunStatus({ runId: existingRunId })
    if (status === 'queued' || status === 'running' || status === 'completed') {
      return { started: false, runId: existingRunId, status }
    }
  }

  const { workflow, nodes, edges } = await helpers.loadWorkflowBundle({ workflowId: input.workflowId })
  const nodeKeySet = new Set(nodes.map((node) => node.key))
  const activeEdges = edges.filter((edge) => nodeKeySet.has(edge.sourceNodeKey) && nodeKeySet.has(edge.targetNodeKey))
  const validation = validateOutputWorkflowGraph({ nodes, edges: activeEdges })
  if (!validation.ok) throw new Error(validation.diagnostics.join(' '))
  const intentDefaults = outputWorkflowRunIntentDefaults(input.runIntent)
  const requestMetadata = helpers.asRecord(input.request.metadata)
  const metadata = {
    runIntent: input.runIntent,
    runScope: intentDefaults?.runScope ?? 'upstream_to_node',
    debugSkipVideoGeneration: intentDefaults?.debugSkipVideoGeneration ?? true,
    cinematicVideoApproved: intentDefaults?.cinematicVideoApproved ?? false,
    allowStaleUpstreamOutputs: intentDefaults?.allowStaleUpstreamOutputs ?? false,
    targetNodeKeys: input.targetNodeKeys,
    parentRequestId: helpers.readText(requestMetadata.parentRequestId) || input.request.parentRequestId,
    masterRequestId: helpers.readText(requestMetadata.masterRequestId)
      || helpers.readText(requestMetadata.parentRequestId)
      || input.request.parentRequestId,
    storyboardBlockId: helpers.readText(requestMetadata.storyboardBlockId),
    outputRequestId: input.request.id,
    queuedAt: new Date().toISOString(),
    startedBy: 'sequence_animatic_orchestrator',
  }
  const selectedSubgraph = selectOutputWorkflowRunSubgraph({
    nodes,
    edges: activeEdges,
    targetNodeKeys: input.targetNodeKeys,
    runScope: 'upstream_to_node',
  })
  if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
  const executionPlan = buildOutputWorkflowExecutionPlan(selectedSubgraph.nodes, selectedSubgraph.edges)
  const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
  const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
  const runInput = {
    sourceEntityKeys: input.request.selectedEntityKeys,
    sourceSequenceUnitKeys: input.request.selectedSequenceUnitKeys,
    masterRequestId: helpers.readText(metadata.masterRequestId),
    storyboardBlockId: helpers.readText(metadata.storyboardBlockId),
  }
  const now = new Date().toISOString()
  const run = await helpers.insertOutputWorkflowRun({
    projectId: input.request.projectId,
    draftId: input.request.draftId,
    workflowId: input.workflowId,
    requestedBy: input.request.requestedBy,
    status: 'queued',
    preset: workflow.preset,
    prompt: input.request.prompt,
    targetFormat: input.request.targetFormat,
    worldSnapshotFingerprint: helpers.buildOutputWorkflowInputFingerprint(runInput),
    runInput,
    metadata,
    heartbeatAt: now,
  })
  await helpers.insertOutputWorkflowRunSteps({
    steps: selectedSubgraph.nodes
      .slice()
      .sort((left, right) => (nodeOrder.get(left.key) ?? 999) - (nodeOrder.get(right.key) ?? 999))
      .map((node, index) => {
        const executionMetadata = getOutputWorkflowNodeExecutionMetadata(node)
        return {
          runId: run.id,
          workflowId: input.workflowId,
          nodeId: node.id,
          draftId: input.request.draftId,
          nodeKey: node.key,
          nodeType: node.nodeType,
          status: 'queued',
          orderIndex: index,
          label: node.label,
          metadata: {
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: executionMetadata.resourceClass,
            groupKey: executionMetadata.groupKey ?? null,
            runScope: metadata.runScope,
            outputRequestId: input.request.id,
          },
        }
      }),
  })
  await helpers.updateOutputRequestForStartedRun({
    requestId: input.request.id,
    runId: run.id,
    metadata: {
      ...requestMetadata,
      readyToRun: false,
      latestRunId: run.id,
      lastRunStartedAt: now,
      startedBy: 'sequence_animatic_orchestrator',
    },
  })
  await helpers.refreshOutputRequestStatusProjection({ requestId: input.request.id })
  await helpers.notifyWorkerWakeBestEffort({
    runId: run.id,
    projectId: input.request.projectId,
    draftId: input.request.draftId,
  })
  return { started: true, runId: helpers.readText(run.id), status: 'queued' }
}
