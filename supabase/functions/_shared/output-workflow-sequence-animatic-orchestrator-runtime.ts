type LooseRecord = Record<string, unknown>

type SequenceAnimaticRuntimeRequest = {
  id: string
  projectId: string
  draftId: string
  workflowId?: string | null
  sourceSurface?: string | null
  requestedBy?: string | null
  prompt: string
  title: string
  status: string
  selectedEntityKeys: string[]
  selectedSequenceUnitKeys: string[]
  metadata?: LooseRecord | null
}

type SequenceAnimaticOrchestratorRuntimeContext = {
  client: unknown
  run: {
    id: string
    projectId: string
    draftId: string
    requestedBy?: string | null
  }
  workflow: {
    id: string
    name: string
  }
  node: {
    key: string
    config: unknown
  }
  upstream: Record<string, unknown>
}

type SequenceAnimaticTemplateGraphResult = {
  ok: boolean
  diagnostics: string[]
  sourceHash: string
  graph?: {
    nodes: unknown[]
    edges: unknown[]
  } | null
}

type SequenceAnimaticEnsureChildInput = {
  client: unknown
  projectId: string
  draftId: string
  parentRequestId: string
  role: string
  identityKey: string
  identityValue: string
  workflow: LooseRecord
  nodes: unknown[]
  edges: unknown[]
  request: LooseRecord
}

export type SequenceAnimaticOrchestratorRuntimeHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readArray: (value: unknown) => unknown[]
  readStringArray: (value: unknown) => string[]
  slugify: (value: string) => string
  sequenceAnimaticStableHash: (value: unknown) => string
  sequenceAnimaticGraphSpecVersion: string
  readScreenplayAnimaticRoleFromMetadata: (metadata: LooseRecord) => string
  readScreenplayAnimaticSourceFromMetadata: (
    metadata: LooseRecord,
    fallback?: 'wiki_sequence_unit' | 'prompt_cinematic',
  ) => 'wiki_sequence_unit' | 'prompt_cinematic'
  sequenceAnimaticBlocksFromManifestAndDirectorPlan: (manifest: LooseRecord, directorPlan: LooseRecord) => LooseRecord[]
  sequenceAnimaticContinuityAssetBatches: (input: {
    directorPlan: LooseRecord
    manifest: LooseRecord
  }) => LooseRecord[]
  sequenceAnimaticContinuityVisualDependencyEdges: (graphInput: unknown) => unknown[]
  sequenceAnimaticStoryboardImageSize: (columns: number, rows: number, aspectRatio: string) => { width: number; height: number }
  loadMasterRequestForWorkflow: (input: {
    client: unknown
    draftId: string
    workflowId: string
  }) => Promise<SequenceAnimaticRuntimeRequest | null>
  loadChildRequests: (input: {
    client: unknown
    projectId: string
    draftId: string
    parentRequestId: string
  }) => Promise<SequenceAnimaticRuntimeRequest[]>
  insertSequenceAnimaticEvent: (input: {
    client: unknown
    projectId: string
    draftId: string
    requestId: string
    workflowId?: string | null
    runId?: string | null
    eventType: string
    payload: LooseRecord
    metadata?: LooseRecord
    dedupe?: LooseRecord
  }) => Promise<void>
  buildSequenceAnimaticTemplateGraph: (input: {
    templateKey: string
    rawInput: LooseRecord
  }) => SequenceAnimaticTemplateGraphResult
  sequenceAnimaticContinuityBatchTemplateKey: string
  sequenceAnimaticStoryboardBlocksTemplateKey: string
  ensureMappedChildWorkflow: (input: SequenceAnimaticEnsureChildInput) => Promise<{
    request: SequenceAnimaticRuntimeRequest
    created?: boolean
  }>
  startSequenceAnimaticChildRun: (input: {
    client: unknown
    request: SequenceAnimaticRuntimeRequest
    workflowId: string
    runIntent: 'prepare_storyboard_block' | 'generate_continuity_asset'
    targetNodeKeys: string[]
  }) => Promise<{
    started: boolean
    runId?: string | null
    status: string
  }>
  updateMasterRequestMetadata: (input: {
    client: unknown
    requestId: string
    metadata: LooseRecord
  }) => Promise<void>
  refreshOutputRequestStatusProjection: (input: {
    client: unknown
    requestId: string
  }) => Promise<void>
}

export async function runSequenceAnimaticOrchestratorRuntime(input: {
  context: SequenceAnimaticOrchestratorRuntimeContext
  helpers: SequenceAnimaticOrchestratorRuntimeHelpers
}): Promise<LooseRecord> {
  const { context, helpers } = input
  const masterRequest = await helpers.loadMasterRequestForWorkflow({
    client: context.client,
    draftId: context.run.draftId,
    workflowId: context.workflow.id,
  })
  if (!masterRequest) throw new Error('Sequence animatic orchestrator could not find the master output request.')
  const masterMetadata = helpers.asRecord(masterRequest.metadata)
  if (helpers.readScreenplayAnimaticRoleFromMetadata(masterMetadata) !== 'master') {
    throw new Error('Sequence animatic orchestrator requires a master animatic request.')
  }

  const directorPlan = helpers.asRecord(
    context.upstream.shotContinuityPlan
      ?? context.upstream.shot_continuity_plan
      ?? context.upstream.directorPlan
      ?? context.upstream.director_plan,
  )
  const manifest = helpers.asRecord(
    context.upstream.manifest
      ?? context.upstream.sequenceAnimaticManifest
      ?? context.upstream.sequence_animatic_manifest,
  )
  if (Object.keys(directorPlan).length === 0) throw new Error('Sequence animatic orchestrator requires a shot continuity plan.')
  if (Object.keys(manifest).length === 0) throw new Error('Sequence animatic orchestrator requires the master manifest.')

  const blocks = helpers.sequenceAnimaticBlocksFromManifestAndDirectorPlan(manifest, directorPlan)
  if (blocks.length === 0) throw new Error('Sequence animatic orchestrator found no storyboard blocks to queue.')

  const screenplayAnimaticSource = helpers.readScreenplayAnimaticSourceFromMetadata(
    masterMetadata,
    masterRequest.sourceSurface === 'wiki_sequence_unit' ? 'wiki_sequence_unit' : 'prompt_cinematic',
  )
  const manifestHash = helpers.sequenceAnimaticStableHash(manifest)
  const directorPlanHash = helpers.readText(directorPlan.shotPlanHash) || helpers.sequenceAnimaticStableHash(directorPlan)
  const masterManifestArtifactKey = helpers.readText(masterMetadata.masterManifestArtifactKey)
    || `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-manifest`
  const existingChildren = await helpers.loadChildRequests({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    parentRequestId: masterRequest.id,
  })
  const existingByBlockId = new Map(existingChildren
    .filter((child) => helpers.asRecord(child.metadata).sequenceAnimaticStale !== true && helpers.readScreenplayAnimaticRoleFromMetadata(helpers.asRecord(child.metadata)) === 'storyboard_block')
    .map((child) => [helpers.readText(helpers.asRecord(child.metadata).storyboardBlockId), child] as const)
    .filter(([id]) => id))
  const childRequests: SequenceAnimaticRuntimeRequest[] = [...existingChildren]
  const now = new Date().toISOString()

  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: masterRequest.id,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'orchestrator_started',
    payload: { blockCount: blocks.length, directorPlanHash, manifestHash },
    metadata: { source: 'sequence_animatic_orchestrator' },
    dedupe: { directorPlanHash },
  })

  for (const requirement of helpers.readArray(directorPlan.assetRequirements ?? directorPlan.asset_requirements).map(helpers.asRecord)) {
    await helpers.insertSequenceAnimaticEvent({
      client: context.client,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      requestId: masterRequest.id,
      workflowId: context.workflow.id,
      runId: context.run.id,
      eventType: 'reference_asset_queued',
      payload: {
        sceneGraphNodeId: helpers.readText(requirement.sceneGraphNodeId ?? requirement.nodeId ?? requirement.id),
        assetType: helpers.readText(requirement.assetType ?? requirement.type),
        priority: helpers.readText(requirement.priority),
        required: requirement.required === true,
        reason: helpers.readText(requirement.reason),
      },
      metadata: { source: 'sequence_animatic_orchestrator' },
      dedupe: { sceneGraphNodeId: helpers.readText(requirement.sceneGraphNodeId ?? requirement.nodeId ?? requirement.id) },
    })
  }

  const continuityAssetBatches = helpers.sequenceAnimaticContinuityAssetBatches({ directorPlan, manifest })
  const existingBatchChildren = existingChildren
    .filter((child) => helpers.asRecord(child.metadata).sequenceAnimaticStale !== true && helpers.readScreenplayAnimaticRoleFromMetadata(helpers.asRecord(child.metadata)) === 'continuity_asset_batch')
  const existingBatchById = new Map(existingBatchChildren
    .map((child) => [helpers.readText(helpers.asRecord(child.metadata).continuityBatchId), child] as const)
    .filter(([id]) => id))
  const batchRequestIds: string[] = []
  const startedBatchRunIds: string[] = []
  for (const batch of continuityAssetBatches) {
    const batchId = helpers.readText(batch.batchId)
    if (!batchId) continue
    let child = existingBatchById.get(batchId) ?? null
    const batchHash = helpers.sequenceAnimaticStableHash(batch)
    if (!child) {
      const targetNodeIds = helpers.readStringArray(batch.targetNodeIds)
      const targetNodes = helpers.readArray(batch.targetNodes).map(helpers.asRecord).filter((node) => targetNodeIds.includes(helpers.readText(node.id)))
      const workflowId = crypto.randomUUID()
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: helpers.sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'continuity_asset_batch',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'continuity_asset_batch',
        parentRequestId: masterRequest.id,
        masterRequestId: masterRequest.id,
        continuityBatchId: batchId,
        continuityBatchHash: batchHash,
        manifestHash,
        directorPlanHash,
        masterManifestArtifactKey,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
      }
      const graphResult = helpers.buildSequenceAnimaticTemplateGraph({
        templateKey: helpers.sequenceAnimaticContinuityBatchTemplateKey,
        rawInput: {
          workflowId,
          draftId: context.run.draftId,
          commonConfig,
          batch,
          targetNodes,
          continuityGraphV2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
          relevantShots: helpers.readArray(directorPlan.shots).map(helpers.asRecord).filter((shot) => helpers.readStringArray(batch.blockIds).length === 0 || helpers.readStringArray(batch.blockIds).includes(helpers.readText(shot.storyboardBlockId))),
          shotBindings: helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
          assetPack: helpers.asRecord(manifest.assetPack),
          referenceAssetKeys: helpers.readStringArray(batch.worldReferenceAssetKeys),
          visualDependencyEdges: helpers.sequenceAnimaticContinuityVisualDependencyEdges(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
          aspectRatio: helpers.readText(helpers.asRecord(manifest.assetPack).aspectRatio) || '16:9',
        },
      })
      if (!graphResult.ok || !graphResult.graph) throw new Error(graphResult.diagnostics.join(' '))
      const { nodes, edges } = graphResult.graph
      const workflowTemplateMetadata = {
        workflowTemplateKey: helpers.sequenceAnimaticContinuityBatchTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      }
      const workflowPayload = {
        project_id: context.run.projectId,
        draft_id: context.run.draftId,
        key: `sequence_animatic_${helpers.slugify(masterRequest.id)}_${helpers.slugify(batchId)}_${manifestHash.slice(0, 8)}`,
        name: `${masterRequest.title} / ${helpers.readText(batch.batchKind) || 'Continuity refs'}`,
        description: 'Sequence animatic continuity reference batch workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: masterRequest.requestedBy ?? context.run.requestedBy,
        metadata: { ...commonConfig, ...workflowTemplateMetadata, readyToRun: true },
      }
      const requestPayload = {
        project_id: context.run.projectId,
        draft_id: context.run.draftId,
        parent_request_id: masterRequest.id,
        requested_by: masterRequest.requestedBy ?? context.run.requestedBy,
        source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `${masterRequest.prompt}\n\nGenerate continuity reference batch ${batchId}.`,
        title: `${masterRequest.title} / ${helpers.readText(batch.batchKind) || 'Continuity refs'}`,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'image',
        planner_notes: 'Continuity reference batch prepared by the sequence animatic Fly orchestrator.',
        metadata: {
          ...commonConfig,
          ...workflowTemplateMetadata,
          continuityBatchId: batchId,
          continuityBatchHash: batchHash,
          continuityBatchKind: helpers.readText(batch.batchKind),
          continuityBatchRequired: batch.required === true,
          targetNodeIds: helpers.readStringArray(batch.targetNodeIds),
          blockIds: helpers.readStringArray(batch.blockIds),
          batch,
          readyToRun: true,
          createdFromDirectorPlanAt: now,
        },
      }
      const ensured = await helpers.ensureMappedChildWorkflow({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        parentRequestId: masterRequest.id,
        role: 'continuity_asset_batch',
        identityKey: 'continuityBatchId',
        identityValue: batchId,
        workflow: workflowPayload,
        nodes,
        edges,
        request: requestPayload,
      })
      child = ensured.request
      childRequests.push(child)
      existingBatchById.set(batchId, child)
    }
    if (!child) continue
    batchRequestIds.push(child.id)
    await helpers.insertSequenceAnimaticEvent({
      client: context.client,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      requestId: masterRequest.id,
      workflowId: child.workflowId,
      runId: null,
      eventType: 'reference_asset_queued',
      payload: {
        batchId,
        batchKind: helpers.readText(batch.batchKind),
        targetNodeIds: helpers.readStringArray(batch.targetNodeIds),
        blockIds: helpers.readStringArray(batch.blockIds),
        required: batch.required === true,
      },
      metadata: { source: 'sequence_animatic_orchestrator_batch' },
      dedupe: { batchId },
    })
    if (child.workflowId && child.status !== 'running' && child.status !== 'queued' && child.status !== 'completed') {
      const startResult = await helpers.startSequenceAnimaticChildRun({
        client: context.client,
        request: child,
        workflowId: child.workflowId,
        runIntent: 'generate_continuity_asset',
        targetNodeKeys: ['continuity_batch_artifact'],
      })
      if (startResult.runId) startedBatchRunIds.push(startResult.runId)
    }
  }

  const queuedBlockRequestIds: string[] = []
  const createdBlockRequestIds: string[] = []
  for (const block of blocks) {
    const blockId = helpers.readText(block.id)
    if (!blockId) continue
    let child = existingByBlockId.get(blockId) ?? null
    const blockHash = helpers.sequenceAnimaticStableHash(block)
    if (!child) {
      const storyboardGroup = helpers.asRecord(block.storyboardGroup)
      const layout = helpers.asRecord(block.storyboardLayout)
      const rows = Math.max(1, Number(layout.rows ?? storyboardGroup.rows ?? 1) || 1)
      const columns = Math.max(1, Number(layout.columns ?? storyboardGroup.columns ?? 1) || 1)
      const panelCount = Math.max(1, Number(layout.panelCount ?? storyboardGroup.panelCount ?? helpers.readArray(block.shots).length) || 1)
      const aspectRatio = helpers.readText(helpers.asRecord(manifest.assetPack).aspectRatio) || '16:9'
      const imageSize = helpers.sequenceAnimaticStoryboardImageSize(columns, rows, aspectRatio)
      const workflowId = crypto.randomUUID()
      const blockShotPlan = {
        ...helpers.asRecord(manifest.shotPlan),
        totalEditorialDurationSeconds: Number(block.durationSeconds ?? storyboardGroup.editorialDurationSeconds ?? 0) || helpers.readArray(block.shots).reduce<number>((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds ?? 0) || 0), 0),
        shots: helpers.readArray(block.shots).map(helpers.asRecord),
      }
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: helpers.sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'storyboard_block',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'storyboard_block',
        parentRequestId: masterRequest.id,
        masterRequestId: masterRequest.id,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        storyboardBlockId: blockId,
        manifestHash,
        blockHash,
        directorPlanHash,
        masterManifestArtifactKey,
      }
      const durationSeconds = Math.max(4, Math.min(15, Number(block.durationSeconds ?? storyboardGroup.providerDurationSeconds ?? 0) || 8))
      const graphResult = helpers.buildSequenceAnimaticTemplateGraph({
        templateKey: helpers.sequenceAnimaticStoryboardBlocksTemplateKey,
        rawInput: {
          workflowId,
          draftId: context.run.draftId,
          commonConfig,
          block,
          manifestSummary: {
            title: helpers.readText(manifest.title) || masterRequest.title,
            screenplayMarkdown: helpers.readText(manifest.screenplayMarkdown),
          },
          shotPlan: blockShotPlan,
          storyboardGroup,
          storyboardLayout: { rows, columns, panelCount },
          assetPack: helpers.asRecord(manifest.assetPack),
          aspectRatio,
          imageSize,
          durationSeconds,
        },
      })
      if (!graphResult.ok || !graphResult.graph) throw new Error(graphResult.diagnostics.join(' '))
      const { nodes, edges } = graphResult.graph
      const workflowTemplateMetadata = {
        workflowTemplateKey: helpers.sequenceAnimaticStoryboardBlocksTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      }
      const workflowPayload = {
        project_id: context.run.projectId,
        draft_id: context.run.draftId,
        key: `sequence_animatic_${helpers.slugify(masterRequest.id)}_${helpers.slugify(blockId)}_${manifestHash.slice(0, 8)}`,
        name: `${masterRequest.title} / Block ${Number(block.index ?? 0) || queuedBlockRequestIds.length + 1}`,
        description: 'Sequence animatic storyboard block workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: masterRequest.requestedBy ?? context.run.requestedBy,
        metadata: {
          ...commonConfig,
          ...workflowTemplateMetadata,
          sourceMasterWorkflowId: context.workflow.id,
          readyToRun: true,
        },
      }
      const requestPayload = {
        project_id: context.run.projectId,
        draft_id: context.run.draftId,
        parent_request_id: masterRequest.id,
        requested_by: masterRequest.requestedBy ?? context.run.requestedBy,
        source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `${masterRequest.prompt}\n\nStoryboard block ${Number(block.index ?? 0) || queuedBlockRequestIds.length + 1}: ${helpers.readText(block.title) || blockId}`,
        title: `${masterRequest.title} / Block ${Number(block.index ?? 0) || queuedBlockRequestIds.length + 1}`,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'video',
        planner_notes: 'Storyboard block graph prepared by the sequence animatic Fly orchestrator.',
        metadata: {
          graphSpecVersion: helpers.sequenceAnimaticGraphSpecVersion,
          directorPlanHash,
          screenplayAnimaticRole: 'storyboard_block',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'storyboard_block',
          ...workflowTemplateMetadata,
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          storyboardBlockId: blockId,
          storyboardBlockIndex: Number(block.index ?? 0) || queuedBlockRequestIds.length + 1,
          manifestHash,
          blockHash,
          masterManifestArtifactKey,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          sourceMasterWorkflowId: context.workflow.id,
          readyToRun: true,
          createdFromManifestAt: now,
          block,
        },
      }
      const ensured = await helpers.ensureMappedChildWorkflow({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        parentRequestId: masterRequest.id,
        role: 'storyboard_block',
        identityKey: 'storyboardBlockId',
        identityValue: blockId,
        workflow: workflowPayload,
        nodes,
        edges,
        request: requestPayload,
      })
      child = ensured.request
      childRequests.push(child)
      existingByBlockId.set(blockId, child)
      if (ensured.created === true) createdBlockRequestIds.push(child.id)
    }
    if (!child) continue
    queuedBlockRequestIds.push(child.id)
    await helpers.insertSequenceAnimaticEvent({
      client: context.client,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      requestId: masterRequest.id,
      workflowId: child.workflowId,
      runId: null,
      eventType: 'block_queued',
      payload: {
        blockRequestId: child.id,
        workflowId: child.workflowId,
        storyboardBlockId: blockId,
        blockHash,
        directorPlanHash,
        title: helpers.readText(block.title) || child.title,
        shotIds: helpers.readStringArray(block.shotIds),
        created: createdBlockRequestIds.includes(child.id),
      },
      metadata: { source: 'sequence_animatic_orchestrator' },
      dedupe: { storyboardBlockId: blockId },
    })
  }

  const activeBlockRuns = childRequests.filter((child) => {
    const role = helpers.readScreenplayAnimaticRoleFromMetadata(helpers.asRecord(child.metadata))
    return role === 'storyboard_block' && (child.status === 'running' || child.status === 'queued' || child.status === 'planning')
  })
  const activeRequiredBatchRuns = childRequests.filter((child) => {
    const metadata = helpers.asRecord(child.metadata)
    const role = helpers.readScreenplayAnimaticRoleFromMetadata(metadata)
    return role === 'continuity_asset_batch' && metadata.continuityBatchRequired === true && (child.status === 'running' || child.status === 'queued' || child.status === 'planning')
  })
  const blockConcurrency = Math.max(1, Number(helpers.asRecord(context.node.config).blockConcurrency ?? 1) || 1)
  const startableChildren = childRequests
    .filter((child) => helpers.readScreenplayAnimaticRoleFromMetadata(helpers.asRecord(child.metadata)) === 'storyboard_block')
    .filter((child) => child.workflowId)
    .filter((child) => child.status !== 'running' && child.status !== 'queued' && child.status !== 'completed')
    .sort((left, right) => (Number(helpers.asRecord(left.metadata).storyboardBlockIndex ?? 0) || 999) - (Number(helpers.asRecord(right.metadata).storyboardBlockIndex ?? 0) || 999))
  const startedRunIds: string[] = []
  const startSlots = activeRequiredBatchRuns.length > 0 || startedBatchRunIds.length > 0 ? 0 : Math.max(0, blockConcurrency - activeBlockRuns.length)
  for (const child of startableChildren.slice(0, startSlots)) {
    if (!child.workflowId) continue
    const startResult = await helpers.startSequenceAnimaticChildRun({
      client: context.client,
      request: child,
      workflowId: child.workflowId,
      runIntent: 'prepare_storyboard_block',
      targetNodeKeys: ['artifact'],
    })
    if (startResult.runId) startedRunIds.push(startResult.runId)
    if (startResult.started) {
      await helpers.insertSequenceAnimaticEvent({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        requestId: masterRequest.id,
        workflowId: child.workflowId,
        runId: startResult.runId,
        eventType: 'block_started',
        payload: {
          blockRequestId: child.id,
          workflowId: child.workflowId,
          storyboardBlockId: helpers.readText(helpers.asRecord(child.metadata).storyboardBlockId),
          runId: startResult.runId,
          status: startResult.status,
        },
        metadata: { source: 'sequence_animatic_orchestrator' },
        dedupe: { storyboardBlockId: helpers.readText(helpers.asRecord(child.metadata).storyboardBlockId), runId: startResult.runId },
      })
    }
  }

  await helpers.updateMasterRequestMetadata({
    client: context.client,
    requestId: masterRequest.id,
    metadata: {
      ...masterMetadata,
      screenplayAnimaticRole: 'master',
      sequenceAnimaticRole: 'master',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      directorPlanHash,
      orchestrationStatus: startableChildren.length > startSlots ? 'partial' : 'queued',
      orchestrationUpdatedAt: new Date().toISOString(),
      childBlockRequestIds: queuedBlockRequestIds,
      continuityBatchRequestIds: batchRequestIds,
      childBlockWorkflowIds: childRequests.map((child) => child.workflowId).filter(Boolean),
      activeStoryboardBlockRunIds: startedRunIds,
      activeContinuityBatchRunIds: startedBatchRunIds,
    },
  })
  await helpers.refreshOutputRequestStatusProjection({
    client: context.client,
    requestId: masterRequest.id,
  })

  return {
    orchestration: {
      status: startableChildren.length > startSlots ? 'partial' : 'queued',
      blockCount: blocks.length,
      queuedBlockCount: queuedBlockRequestIds.length,
      startedRunCount: startedRunIds.length,
      startedBatchRunCount: startedBatchRunIds.length,
      activeBlockRunCount: activeBlockRuns.length + startedRunIds.length,
      activeRequiredBatchRunCount: activeRequiredBatchRuns.length + startedBatchRunIds.length,
      blockConcurrency,
      directorPlanHash,
      manifestHash,
      continuityAssetBatchCount: continuityAssetBatches.length,
    },
    childRequests: childRequests.map((child) => ({
      id: child.id,
      workflowId: child.workflowId,
      status: child.status,
      storyboardBlockId: helpers.readText(helpers.asRecord(child.metadata).storyboardBlockId),
      title: child.title,
    })),
    startedRunIds,
  }
}
