type LooseRecord = Record<string, unknown>

type SequenceAnimaticDirectorPlanRuntimeContext = {
  client: unknown
  run: {
    id: string
    projectId: string
    draftId: string
    prompt?: string | null
    metadata?: LooseRecord | null
  }
  workflow: {
    id: string
    name: string
  }
  node: {
    id?: string
    key: string
    label?: string
    type?: string
    config: unknown
  }
  upstream: Record<string, Record<string, unknown>>
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

type SequenceAnimaticShotContinuityStreamResult = {
  value: LooseRecord
  response: LooseRecord & {
    body?: unknown
  }
  provider: string
  model: string
  providerRequestId?: string | null
  acceptedRecordCount?: number
  warningCount?: number
}

export type SequenceAnimaticDirectorPlanRuntimeHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readArray: (value: unknown) => unknown[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  outputWorkflowTextModel: () => string
  sequenceAnimaticShotContinuityPolicy: {
    maxShotCount: number
    maxDurationSeconds: number
    preferredDurationSeconds: number
    maxDialogueLines: number
    maxDialogueCharacters: number
  }
  buildCinematicV3ShotBreakPlan: (input: {
    screenplayDraft: LooseRecord
    maxShotCount: number
    maxPanelsPerSheet: number
    maxDurationPerGroupSeconds: number
  }) => LooseRecord
  deriveCinematicV2MaxShotCount: (suggestedDurationSeconds: number | null) => number
  buildSequenceAnimaticShotPlanFromBreaks: (input: {
    shotBreakPlan: LooseRecord
    assetPack: LooseRecord
    context?: LooseRecord
  }) => LooseRecord
  buildSequenceAnimaticScenePackageFromTaggedScreenplay: (input: {
    screenplayDraft: LooseRecord
    assetPack: LooseRecord
    context: LooseRecord
    contractVersion: string
  }) => LooseRecord & {
    scenePackages: LooseRecord[]
    dialogueRows: unknown[]
    sceneGraphDraft: LooseRecord & { additions: unknown[] }
    spotRelations: unknown[]
    screenplayScenes?: unknown
  }
  buildFallbackSequenceAnimaticSceneGraphAssignment: (scenePackage: LooseRecord) => LooseRecord
  runSequenceAnimaticSceneGraphAssignmentProvider: (input: {
    nodeKey: string
    instructions: string
    prompt: string
    fallback: LooseRecord
    maxOutputTokens: number
    shouldCancel?: SequenceAnimaticDirectorPlanRuntimeContext['shouldCancel']
    onProgress?: (progress: {
      providerRequestId?: string | null
      providerMode?: string | null
      providerStatus?: string | null
      lastProviderPollAt?: string | null
      providerStartedAt?: string | null
    }) => Promise<void>
  }) => Promise<{
    value: LooseRecord
    providerRequestId?: string | null
    fallbackUsed: boolean
    fallbackReason?: string | null
  }>
  mergeSequenceAnimaticSceneGraphAssignment: (input: {
    parsed: LooseRecord
    assignment: LooseRecord
    assetPack: LooseRecord
    context: LooseRecord
  }) => LooseRecord & {
    scenePackages: LooseRecord[]
    dialogueRows: unknown[]
    sceneGraphDraft: LooseRecord & { additions: unknown[] }
    spotRelations: unknown[]
    screenplayScenes?: unknown
  }
  insertSequenceAnimaticEvent: (input: {
    client: unknown
    projectId: string
    draftId: string
    requestId: string
    workflowId: string
    runId: string
    eventType: string
    payload: LooseRecord
    metadata?: LooseRecord
    dedupe?: LooseRecord
  }) => Promise<void>
  parseSequenceAnimaticScenePackageOutput: (value: unknown) => LooseRecord & {
    scenePackages: LooseRecord[]
    sceneGraphDraft?: unknown
    spotRelations?: unknown
  }
  safeParseSequenceAnimaticTaggedScenePackage: (value: unknown) => { success: true; data: LooseRecord } | { success: false }
  loadWorkflowNodes: (input: {
    client: unknown
    workflowId: string
  }) => Promise<LooseRecord[]>
  loadWorkflowRunSteps: (input: {
    client: unknown
    runId: string
    workflowId: string
  }) => Promise<LooseRecord[]>
  loadWorkflowEdges: (input: {
    client: unknown
    workflowId: string
  }) => Promise<LooseRecord[]>
  hasStoredOutputs: (value: unknown) => boolean
  isStaleDynamicCinematicNode: (node: LooseRecord | null | undefined) => boolean
  preserveExistingDynamicNodeOutput: (input: {
    nextRow: LooseRecord
    existingNode?: LooseRecord | null
    existingStep?: LooseRecord | null
    compileHash: string
    preserve: boolean
  }) => LooseRecord
  dynamicNodeRow: (input: {
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    compileHash: string
    generatedByNodeKey: string
    key: string
    nodeType: string
    label: string
    x: number
    y: number
    config: LooseRecord
  }) => LooseRecord
  dynamicEdgeRow: (input: {
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    compileHash: string
    generatedByNodeKey: string
    key: string
    sourceNodeKey: string
    sourcePort: string
    targetNodeKey: string
    targetPort: string
    metadata?: LooseRecord
  }) => LooseRecord
  persistDynamicWorkflowGraphRevision: (input: {
    client: unknown
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    nodeRows: LooseRecord[]
    edgeRows: LooseRecord[]
    existingDynamicNodes: LooseRecord[]
    dynamicEdgeKeys: string[]
    compileHash: string
    staleReason: string
    workflowMetadataPatch: LooseRecord
  }) => Promise<void>
  buildSequenceAnimaticScriptShotProjection: (shotBreakPlan: LooseRecord) => LooseRecord & {
    scriptShots: unknown[]
  }
  buildCinematicV3StoryboardGroupFromShotBreakGroup: (group: LooseRecord, index: number) => LooseRecord
  sequenceAnimaticReferenceCatalog: (input: {
    animaticReferenceCatalog?: LooseRecord
    assetPack: LooseRecord
  }) => LooseRecord
  buildSequenceAnimaticContinuityPlannerContext: (input: {
    screenplayDraft: LooseRecord
    shotPlan: LooseRecord
    shotBreakPlan: LooseRecord
    assetPack: LooseRecord
    animaticReferenceCatalog: LooseRecord
  }) => LooseRecord
  normalizeSequenceAnimaticDirectorPlan: (input: {
    rawPlan: LooseRecord
    manifest: LooseRecord
    manifestHash: string
    masterManifestArtifactKey: string
    continuityPlannerContext: LooseRecord
  }) => LooseRecord & {
    shots: LooseRecord[]
    blocks: LooseRecord[]
    continuityGraphV2?: unknown
    shotBindings?: unknown
  }
  runSequenceAnimaticShotContinuityPlanStreamWithRetry: (input: {
    client: unknown
    run: SequenceAnimaticDirectorPlanRuntimeContext['run']
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    node: SequenceAnimaticDirectorPlanRuntimeContext['node']
    requestId: string
    taskClass?: string
    instructions: string
    prompt: string
    maxOutputTokens: number
    shouldCancel?: SequenceAnimaticDirectorPlanRuntimeContext['shouldCancel']
    onProgress?: (progress: {
      providerRequestId?: string | null
      providerMode?: string | null
      providerStatus?: string | null
      lastProviderPollAt?: string | null
      providerStartedAt?: string | null
    }) => Promise<void>
  }) => Promise<SequenceAnimaticShotContinuityStreamResult>
}

export async function materializeSequenceAnimaticScenePlanFanoutRuntime(input: {
  context: {
    client: unknown
    run: SequenceAnimaticDirectorPlanRuntimeContext['run']
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
  }
  compileOutputs: LooseRecord
  config: LooseRecord
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  expanded: boolean
  compileHash: string
  sceneCount: number
}> {
  const { context, compileOutputs, config, helpers } = input
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(helpers.asRecord(compileOutputs.scenePackage))
  const scenePackages = scenePackageOutput.scenePackages
  if (scenePackages.length === 0) throw new Error('Scene plan fanout requires at least one parsed screenplay scene package.')
  const screenplayDraft = helpers.asRecord(compileOutputs.screenplayDraft)
  const referencePlan = helpers.asRecord(compileOutputs.cinematicReferencePlan)
  const compileHash = helpers.readText(compileOutputs.compileHash) || helpers.hashOutputWorkflowValue({
    scenePackageOutput,
    screenplayDraft,
    referencePlan,
  })
  const aspectRatio = helpers.readText(config.aspectRatio) || '16:9'
  const resolution = helpers.readText(config.resolution) || '720p'
  const maxShotCount = Number(config.maxShotCount ?? 0) || helpers.sequenceAnimaticShotContinuityPolicy.maxShotCount
  const generatedByNodeKey = 'sequence_animatic_scene_plan_fanout'
  let scenePackageSourceNodeKey = 'sequence_animatic_scene_graph_assignment'
  const scenePlannerConcurrency = Math.max(1, Math.min(8, Number(config.scenePlannerConcurrency ?? 4) || 4))
  const dynamicPersistenceVersion = 'sequence_animatic_scene_graph_assignment_parallel_1'

  const allWorkflowNodes = await helpers.loadWorkflowNodes({
    client: context.client,
    workflowId: context.workflow.id,
  })
  if (!allWorkflowNodes.some((row) => helpers.readText(row.key) === scenePackageSourceNodeKey) && allWorkflowNodes.some((row) => helpers.readText(row.key) === 'sequence_animatic_scene_package')) {
    scenePackageSourceNodeKey = 'sequence_animatic_scene_package'
  }
  const allExistingDynamicNodes = allWorkflowNodes
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
    .filter((row) => helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !helpers.isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [helpers.readText(row.key), row] as const))
  const existingSteps = await helpers.loadWorkflowRunSteps({
    client: context.client,
    runId: context.run.id,
    workflowId: context.workflow.id,
  })
  const existingStepByNodeKey = new Map(existingSteps.map((row) => [helpers.readText(row.node_key), row] as const))
  const scenePlanKeys = scenePackages.map((scene) => `sequence_animatic_scene_shot_plan_${helpers.slugify(helpers.readText(scene.sceneId)).slice(0, 64)}`)
  const expectedDynamicKeys = [
    ...scenePlanKeys,
    'sequence_animatic_scene_plan_merge',
    'sequence_animatic_director_plan_artifact',
    'sequence_animatic_manifest',
    'artifact',
    'sequence_animatic_orchestrator',
  ]
  const hasRecoverableStepOutput = existingDynamicNodes.some((row) => {
    if (helpers.readText(row.output_hash) || helpers.hasStoredOutputs(row.outputs)) return false
    const step = existingStepByNodeKey.get(helpers.readText(row.key))
    return Boolean(step && (helpers.readText(step.output_hash) || helpers.hasStoredOutputs(step.outputs)))
  })
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicV3ParsePersistenceVersion) === dynamicPersistenceVersion)
    && expectedDynamicKeys.every((key) => existingDynamicNodes.some((row) => helpers.readText(row.key) === key))
  if (existingSameHash && !hasRecoverableStepOutput) {
    return { expanded: false, compileHash, sceneCount: scenePackages.length }
  }

  const existingEdges = await helpers.loadWorkflowEdges({
    client: context.client,
    workflowId: context.workflow.id,
  })
  const dynamicEdgeKeys = existingEdges
    .filter((row) => helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
    .map((row) => helpers.readText(row.key))

  const preserveNodeRow = (row: LooseRecord) => {
    const key = helpers.readText(row.key)
    const existingNode = existingDynamicNodeByKey.get(key)
    const existingMetadata = helpers.asRecord(existingNode?.metadata)
    const sameCompileHash = helpers.readText(existingMetadata.dynamicCompileHash) === compileHash
    return helpers.preserveExistingDynamicNodeOutput({
      nextRow: row,
      existingNode,
      existingStep: existingStepByNodeKey.get(key) ?? null,
      compileHash,
      preserve: Boolean(existingNode)
        && sameCompileHash
        && helpers.readText(existingNode?.node_type) === helpers.readText(row.node_type)
        && helpers.readText(helpers.asRecord(existingNode?.config).purpose) === helpers.readText(helpers.asRecord(row.config).purpose),
    })
  }
  const sceneNode = (args: {
    key: string
    nodeType: string
    label: string
    x: number
    y: number
    config: LooseRecord
  }) => {
    const row = helpers.dynamicNodeRow({
      workflow: context.workflow,
      compileHash,
      generatedByNodeKey,
      ...args,
    })
    return preserveNodeRow({
      ...row,
      metadata: {
        ...helpers.asRecord(row.metadata),
        dynamicV3ParsePersistenceVersion: dynamicPersistenceVersion,
      },
    })
  }
  const sceneEdge = (args: {
    key: string
    sourceNodeKey: string
    sourcePort: string
    targetNodeKey: string
    targetPort: string
    metadata?: LooseRecord
  }) => helpers.dynamicEdgeRow({
    workflow: context.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })

  const nodeRows: LooseRecord[] = []
  const edgeRows: LooseRecord[] = []
  scenePackages.forEach((scenePackage, index) => {
    const sceneKey = scenePlanKeys[index]
    const sceneId = helpers.readText(scenePackage.sceneId)
    const y = 80 + index * 150
    nodeRows.push(sceneNode({
      key: sceneKey,
      nodeType: 'utility_transform',
      label: `Scene ${scenePackage.index} Shot Plan`,
      x: 1960,
      y,
      config: {
        purpose: 'sequence_animatic_scene_shot_plan',
        role: 'sequence_animatic_scene_shot_plan',
        graphSpecVersion: 'sequence_animatic_graph_v2',
        cinematicPipelineVersion: 'v3_script_storyboards',
        sceneId,
        scenePackage,
        maxShotCount,
        aspectRatio,
        resolution,
        execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_scene_shot_plan', maxConcurrency: scenePlannerConcurrency },
      },
    }))
    edgeRows.push(
      sceneEdge({ key: `scene_package__${sceneKey}`, sourceNodeKey: scenePackageSourceNodeKey, sourcePort: 'scene_package', targetNodeKey: sceneKey, targetPort: 'scene_package' }),
      sceneEdge({ key: `screenplay__${sceneKey}`, sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: sceneKey, targetPort: 'screenplay' }),
      sceneEdge({ key: `context__${sceneKey}`, sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: sceneKey, targetPort: 'context' }),
      sceneEdge({ key: `guidance__${sceneKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sceneKey, targetPort: 'guidance' }),
      sceneEdge({ key: `references__${sceneKey}`, sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: sceneKey, targetPort: 'asset_pack' }),
      sceneEdge({ key: `${sceneKey}__scene_plan_merge`, sourceNodeKey: sceneKey, sourcePort: 'scene_plan', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'scene_plan', metadata: { sceneId, sceneIndex: scenePackage.index } }),
    )
  })
  nodeRows.push(
    sceneNode({ key: 'sequence_animatic_scene_plan_merge', nodeType: 'utility_transform', label: 'Merge Shot Continuity Plan', x: 2240, y: 120, config: { purpose: 'sequence_animatic_scene_plan_merge', role: 'sequence_animatic_director_plan', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', maxShotCount, aspectRatio, resolution, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_plan_merge', maxConcurrency: 1 } } }),
    sceneNode({ key: 'sequence_animatic_director_plan_artifact', nodeType: 'output_artifact', label: 'Register Shot Continuity Plan', x: 2520, y: 120, config: { purpose: 'sequence_animatic_director_plan_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    sceneNode({ key: 'sequence_animatic_manifest', nodeType: 'utility_transform', label: 'Build Animatic Manifest', x: 2800, y: 120, config: { purpose: 'sequence_animatic_manifest', role: 'sequence_animatic_manifest', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio, resolution, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_manifest', maxConcurrency: 1 } } }),
    sceneNode({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Animatic Manifest', x: 3080, y: 120, config: { purpose: 'sequence_animatic_manifest_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    sceneNode({ key: 'sequence_animatic_orchestrator', nodeType: 'utility_transform', label: 'Queue Animatic Blocks', x: 3360, y: 120, config: { purpose: 'sequence_animatic_orchestrator', role: 'sequence_animatic_orchestrator', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', blockConcurrency: 1, autoStartStoryboards: true, autoStartVideos: false, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_orchestrator', maxConcurrency: 1 } } }),
  )
  edgeRows.push(
    sceneEdge({ key: 'scene_package__scene_plan_merge', sourceNodeKey: scenePackageSourceNodeKey, sourcePort: 'scene_package', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'scene_package' }),
    sceneEdge({ key: 'screenplay__scene_plan_merge', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'screenplay' }),
    sceneEdge({ key: 'references__scene_plan_merge', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'asset_pack' }),
    sceneEdge({ key: 'context__scene_plan_merge', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'context' }),
    sceneEdge({ key: 'scene_plan_merge__director_plan_artifact', sourceNodeKey: 'sequence_animatic_scene_plan_merge', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_director_plan_artifact', targetPort: 'director_plan' }),
    sceneEdge({ key: 'scene_plan_merge__sequence_manifest', sourceNodeKey: 'sequence_animatic_scene_plan_merge', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'director_plan' }),
    sceneEdge({ key: 'screenplay__sequence_manifest', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'screenplay' }),
    sceneEdge({ key: 'references__sequence_manifest', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'asset_pack' }),
    sceneEdge({ key: 'context__sequence_manifest', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'context' }),
    sceneEdge({ key: 'sequence_manifest__artifact', sourceNodeKey: 'sequence_animatic_manifest', sourcePort: 'manifest', targetNodeKey: 'artifact', targetPort: 'input' }),
    sceneEdge({ key: 'director_plan__orchestrator', sourceNodeKey: 'sequence_animatic_director_plan_artifact', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'director_plan' }),
    sceneEdge({ key: 'sequence_manifest__orchestrator', sourceNodeKey: 'artifact', sourcePort: 'manifest', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'manifest' }),
  )

  await helpers.persistDynamicWorkflowGraphRevision({
    client: context.client,
    workflow: context.workflow,
    nodeRows,
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'sequence_animatic_scene_plan_fanout_rematerialized',
    workflowMetadataPatch: {
      cinematicPipelineVersion: 'v3_script_storyboards',
      sceneGraphAssignmentPackage: scenePackageOutput,
      sceneGraphAssignmentSceneCount: scenePackages.length,
      dynamicGraphVersion: dynamicPersistenceVersion,
    },
  })
  return { expanded: true, compileHash, sceneCount: scenePackages.length }
}

export async function runSequenceAnimaticScenePackageAssignmentRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
  purpose: 'sequence_animatic_scene_package' | 'sequence_animatic_scene_graph_assignment'
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers, purpose } = input
  const isSceneGraphAssignment = purpose.endsWith('_scene_graph_assignment')
  const isScenePackage = purpose.endsWith('_scene_package')
  const assetPack = helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const worldContext = helpers.readFirstUpstreamRecord(executionContext.upstream, ['context'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Scene graph assignment requires the authored screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Scene package builder requires the visual reference asset pack.')
  if (!Object.keys(worldContext).length) throw new Error('Scene package builder requires world context.')

  const parsedScenePackage = helpers.buildSequenceAnimaticScenePackageFromTaggedScreenplay({
    screenplayDraft,
    assetPack,
    context: worldContext,
    contractVersion: isScenePackage ? 'scene_tagged_screenplay_v2' : 'scene_graph_assignment_v1',
  })
  let scenePackage = parsedScenePackage
  let assignmentFallbackUsed = false
  let assignmentFallbackReason = ''
  let providerRequestId: string | null | undefined

  if (isSceneGraphAssignment) {
    const fallbackAssignment = helpers.buildFallbackSequenceAnimaticSceneGraphAssignment(parsedScenePackage)
    let result: Awaited<ReturnType<SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticSceneGraphAssignmentProvider']>>
    try {
      result = await helpers.runSequenceAnimaticSceneGraphAssignmentProvider({
        nodeKey: executionContext.node.key,
        instructions: [
          'You are a cinematic continuity designer and spatial scene graph planner.',
          'Return strict JSON only. Assign screenplay scenes to output-local scene graph structure before shot planning.',
        ].join('\n'),
        prompt: [
          'Assign each screenplay scene to a usable scene graph package for later parallel shot planning.',
          'The screenplay is creative only. Do not rewrite the script and do not create shots.',
          'For every scene, choose or create a worldLocationRefId, setId, zoneId, and useful spotIds where concrete physical points matter.',
          'Create new output-local scene graph additions only for visual, reusable places: set, zone, spot, or optional viewpoint.',
          'New graph additions must have stable IDs, valid parent links, human names, and isolated visual briefs that do not mention script beats, characters, shots, emotions, workflow nodes, model names, or providers.',
          'Parent rules: set parent is a canonical world location ref; zone parent is a set id; spot parent is a zone id; viewpoint parent may be a spot, zone, or set id.',
          'Prefer existing canonical world location refs from the supplied reference catalog and world context. Do not promote output-local sets/zones/spots into wiki entities.',
          'Keep assignments scene-level. The later scene shot planner will choose shot-level sceneBinding values from these assignments and may add only missing spots/viewpoints.',
          'Return sceneAssignments for every parsed scene id exactly once.',
          helpers.compactForPrompt({
            parsedScenes: parsedScenePackage.scenePackages.map((scene) => ({
              sceneId: scene.sceneId,
              index: scene.index,
              title: scene.title,
              sourceText: scene.sourceText,
              existingLocationRefId: scene.worldLocationRefId,
              dialogueRows: scene.dialogueRows,
            })),
            currentGraphDraft: parsedScenePackage.sceneGraphDraft,
            referenceCatalog: helpers.sequenceAnimaticReferenceCatalog({
              animaticReferenceCatalog: helpers.readFirstUpstreamRecord(executionContext.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
              assetPack,
            }),
            world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
            entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 80) : [],
          }, 22000),
        ].join('\n\n'),
        fallback: fallbackAssignment,
        maxOutputTokens: 12000,
        shouldCancel: executionContext.shouldCancel,
        onProgress: async (progress) => {
          await executionContext.onProgress?.({
            provider: 'openai',
            model: helpers.outputWorkflowTextModel(),
            providerRequestId: progress.providerRequestId,
            metadata: {
              providerMode: progress.providerMode,
              providerStatus: progress.providerStatus,
              lastProviderPollAt: progress.lastProviderPollAt,
              providerStartedAt: progress.providerStartedAt,
              sequenceAnimaticSceneGraphAssignment: true,
            },
          })
        },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Scene graph assignment failed.'
      throw new Error(`Sequence animatic scene graph assignment failed: ${reason}`)
    }
    providerRequestId = result.providerRequestId
    assignmentFallbackUsed = result.fallbackUsed
    assignmentFallbackReason = helpers.readText(result.fallbackReason)
    scenePackage = helpers.mergeSequenceAnimaticSceneGraphAssignment({
      parsed: parsedScenePackage,
      assignment: result.value,
      assetPack,
      context: worldContext,
    })
  }

  const outputRequestId = helpers.readText(executionContext.run.metadata?.outputRequestId) || helpers.readText(executionContext.run.metadata?.masterRequestId)
  if (outputRequestId) {
    await helpers.insertSequenceAnimaticEvent({
      client: executionContext.client,
      projectId: executionContext.run.projectId,
      draftId: executionContext.run.draftId,
      requestId: outputRequestId,
      workflowId: executionContext.workflow.id,
      runId: executionContext.run.id,
      eventType: isSceneGraphAssignment ? 'scene_graph_assignment_ready' : 'scene_packages_ready',
      payload: {
        sceneCount: scenePackage.scenePackages.length,
        dialogueRowCount: scenePackage.dialogueRows.length,
        graphAdditionCount: scenePackage.sceneGraphDraft.additions.length,
        spotRelationCount: scenePackage.spotRelations.length,
        sourceHash: helpers.hashOutputWorkflowValue(scenePackage),
        status: 'ready',
        fallbackUsed: assignmentFallbackUsed,
        fallbackReason: assignmentFallbackReason,
      },
      metadata: { source: purpose, nodeKey: executionContext.node.key },
      dedupe: { sourceHash: helpers.hashOutputWorkflowValue(scenePackage) },
    })
  }

  const outputs = {
    scenePackage,
    scene_package: scenePackage,
    scenePackages: scenePackage.scenePackages,
    scene_packages: scenePackage.scenePackages,
    screenplayScenes: scenePackage.screenplayScenes,
    screenplay_scenes: scenePackage.screenplayScenes,
    dialogueRows: scenePackage.dialogueRows,
    dialogue_rows: scenePackage.dialogueRows,
    sceneGraphDraft: scenePackage.sceneGraphDraft,
    scene_graph_draft: scenePackage.sceneGraphDraft,
    spotRelations: scenePackage.spotRelations,
    spot_relations: scenePackage.spotRelations,
    text: JSON.stringify(scenePackage, null, 2),
    fallbackUsed: assignmentFallbackUsed,
    fallbackReason: assignmentFallbackReason,
    deterministic: true,
  }
  return {
    outputs,
    provider: isSceneGraphAssignment && !assignmentFallbackUsed ? 'openai' : 'graphcore',
    model: isSceneGraphAssignment && !assignmentFallbackUsed ? helpers.outputWorkflowTextModel() : 'deterministic-sequence-animatic-scene-package-v1',
    providerRequestId,
  }
}

export async function runSequenceAnimaticDirectorPlanRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers } = input
  const upstreamManifest = helpers.readFirstUpstreamRecord(executionContext.upstream, ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  const worldContext = helpers.readFirstUpstreamRecord(executionContext.upstream, ['context'])
  const assetPack = Object.keys(helpers.asRecord(upstreamManifest.assetPack)).length > 0
    ? helpers.asRecord(upstreamManifest.assetPack)
    : helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = Object.keys(helpers.asRecord(upstreamManifest.screenplayDraft)).length > 0
    ? helpers.asRecord(upstreamManifest.screenplayDraft)
    : helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Sequence animatic shot continuity plan requires the authored screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Sequence animatic shot continuity plan requires the visual reference asset pack.')

  const suggestedDurationSeconds = Number(helpers.asRecord(screenplayDraft).suggestedDurationSeconds ?? 0) || null
  const configuredMaxShotCount = Number(helpers.asRecord(executionContext.node.config).maxShotCount ?? 0) || 0
  const screenplayMetadata = helpers.asRecord(helpers.asRecord(screenplayDraft).metadata)
  const scriptContract = helpers.readText(screenplayMetadata.scriptContract)
  const creativeScreenplayContract = scriptContract === 'creative_screenplay_v1'
  const legacyMarkerContract = scriptContract === 'screenplay_with_shot_markers_v1'
  const upstreamShotBreakPlan = helpers.asRecord(upstreamManifest.shotBreakPlan)
  const shotBreakPlan = Object.keys(upstreamShotBreakPlan).length > 0
    ? upstreamShotBreakPlan
    : legacyMarkerContract
      ? helpers.buildCinematicV3ShotBreakPlan({
        screenplayDraft,
        maxShotCount: configuredMaxShotCount > 0 ? configuredMaxShotCount : helpers.deriveCinematicV2MaxShotCount(suggestedDurationSeconds),
        maxPanelsPerSheet: 9,
        maxDurationPerGroupSeconds: 15,
      })
      : {}
  const shotPlan = Object.keys(helpers.asRecord(upstreamManifest.shotPlan)).length > 0
    ? helpers.asRecord(upstreamManifest.shotPlan)
    : Object.keys(shotBreakPlan).length > 0
      ? helpers.buildSequenceAnimaticShotPlanFromBreaks({ shotBreakPlan, assetPack, context: worldContext })
      : {}
  const scriptShotProjection = Object.keys(shotBreakPlan).length > 0
    ? helpers.buildSequenceAnimaticScriptShotProjection(shotBreakPlan)
    : { scriptShotStatus: 'missing', scriptShots: [], scriptBlocks: [] }
  const roughBlocks = helpers.readArray(shotBreakPlan.groups).map(helpers.asRecord).map((group, index) => {
    const storyboardGroup = helpers.buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index)
    return {
      id: storyboardGroup.id,
      index: storyboardGroup.index,
      title: helpers.readText(group.title) || helpers.readText(group.summary) || storyboardGroup.summary,
      summary: storyboardGroup.summary,
      shotIds: storyboardGroup.shotIds,
      storyboardGroup,
    }
  })
  const animaticReferenceCatalog = helpers.sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.asRecord(upstreamManifest.animaticReferenceCatalog),
    assetPack,
  })
  const continuityPlannerContext = helpers.buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan,
    shotBreakPlan,
    assetPack,
    animaticReferenceCatalog,
  })
  const manifest = Object.keys(upstreamManifest).length > 0
    ? upstreamManifest
    : {
      role: 'sequence_animatic_director_source',
      requestId: executionContext.run.metadata?.outputRequestId ?? null,
      workflowId: executionContext.workflow.id,
      runId: executionContext.run.id,
      screenplayDraft,
      screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
      shotBreakPlan,
      shotPlan,
      blocks: roughBlocks,
      assetPack,
      animaticReferenceCatalog,
    }
  const manifestHash = helpers.hashOutputWorkflowValue(manifest)
  const masterManifestArtifactKey = `output.${helpers.slugify(executionContext.workflow.name)}.${executionContext.run.id.slice(0, 8)}.sequence-animatic-manifest`
  const policy = helpers.sequenceAnimaticShotContinuityPolicy
  const shotContinuityPlannerMaxShotCount = Math.max(
    36,
    Math.min(
      policy.maxShotCount,
      configuredMaxShotCount > 0
        ? Math.max(configuredMaxShotCount, policy.maxShotCount)
        : Math.ceil((suggestedDurationSeconds && suggestedDurationSeconds > 0 ? suggestedDurationSeconds : 180) / 4),
    ),
  )
  const legacyAnchorPrompt = legacyMarkerContract || scriptShotProjection.scriptShots.length > 0
    ? [
      'Legacy screenplay shot anchors are included as optional source references. Preserve sourceScriptShotIds/sourceAnchorIds when useful, but do not let them override better final shot structure.',
      'For one-to-one legacy shots preserve the source script shot ID. For merges include multiple IDs. For splits reuse the same source ID on each split. For planner-added shots, return empty arrays.',
    ].join('\n')
    : 'This creative screenplay has no screenplay shot anchors. sourceScriptShotIds and sourceAnchorIds may be empty arrays; do not invent fake screenplay anchor IDs.'

  const outputRequestId = helpers.readText(executionContext.run.metadata?.outputRequestId) || helpers.readText(executionContext.run.metadata?.masterRequestId)
  if (!outputRequestId) throw new Error('Sequence animatic shot continuity stream requires an output request id.')

  let streamedPlan: SequenceAnimaticShotContinuityStreamResult
  try {
    streamedPlan = await helpers.runSequenceAnimaticShotContinuityPlanStreamWithRetry({
      client: executionContext.client,
      run: executionContext.run,
      workflow: executionContext.workflow,
      node: executionContext.node,
      requestId: outputRequestId,
      instructions: [
        'You are a senior animation shot planner and continuity supervisor.',
        'Return newline-delimited JSON only: one complete JSON object per record, no markdown, no array wrapper, no prose outside JSON records.',
        'Be token-frugal: omit optional descriptive fields whose value would be an empty string, empty array, or null. Structural keys are never optional: every shot record must include id, index, blockId, durationSeconds, action, camera, and sceneBinding; never drop id fields.',
        'Every shot must also include a concise lighting note (<=12 words: time of day, key light direction, mood) - lighting drives keyframe atmosphere and is not optional padding.',
        'Allowed record kinds: plan_start, block, shot, scene_graph_addition, spot_relation, local_reference, plan_done.',
        'Emit records in live-usable order: plan_start, then shot records in story order as soon as each shot is complete. Do not wait for a whole block to be finished before emitting shots.',
        'Block records are optional during streaming and may arrive before, between, or after related shots. If unsure, assign each shot a stable blockId and keep streaming shots.',
        'After all shots, emit remaining scene_graph_addition records, spot_relation records, local_reference records, optional block records, then plan_done.',
      ].join('\n'),
      prompt: [
        'Convert the creative screenplay into one compact streamed shot continuity plan for the entire animatic in a single coherent pass.',
        'The screenplay is the creative source. Your returned shots are the source of truth; do not spend tokens duplicating top-level shotBindings, assetRequirements, warnings, diagnostics, or compatibility fields.',
        'Create final shots from the script in story order. Preserve action, spoken dialogue, emotional beats, cause/effect, chapter outcome, and open loops, but choose shot boundaries that make the animatic filmable and continuous.',
        'The output must cover every final shot exactly once. Blocks are editorial grouping metadata; they must never delay shot records.',
        `Use as many shots as the screenplay needs, up to ${shotContinuityPlannerMaxShotCount}. Do not compress dialogue or multi-beat action to fit an old shot-count budget.`,
        `Hard shot boundary rules: durationSeconds must be <= ${policy.maxDurationSeconds}; preferred duration is 3-${policy.preferredDurationSeconds} seconds; each shot should contain one camera setup and one visible story beat.`,
        `Dialogue density rules: each shot may contain at most ${policy.maxDialogueLines} short dialogue rows, at most 140 characters per dialogue line, and at most ${policy.maxDialogueCharacters} total spoken characters. If a conversation exchange has more than that, split it into alternating dialogue/reaction/action shots.`,
        'Use reaction shots, inserts, movement beats, and silent performance shots to keep dialogue readable. Do not put a whole conversation paragraph into one shot.',
        'Coverage setup rules: do not emit coverage_setup records and do not set coverageSetupId. Capture only shot-local camera facts and optional coverageIntent text; a dedicated downstream coverage planner will assign reusable setups.',
        'Keep action, camera, lighting, performance, visual briefs, summaries, and notes concise. Prefer one strong sentence per field unless the shot requires more.',
        'Record contracts:',
        'plan_start: {"kind":"plan_start","contractVersion":"shot_continuity_plan_v2","graphSpecVersion":"sequence_animatic_graph_v2","note":"short optional note"}',
        'block: {"kind":"block","id":"block_001","index":1,"title":"...","summary":"...","shotIds":["shot_001"]} // optional during streaming; can be emitted after its shots',
        'shot: {"kind":"shot","id":"shot_001","index":1,"blockId":"block_001","title":"...","durationSeconds":3,"continuityLink":{"mode":"same_setup|reverse_angle|blocking_change|match_action|new_setup|insert_cutaway|new_scene","fromShotId":"...","description":"..."},"coverageIntent":"optional concise camera/staging intent, not an id","action":"...","camera":{"framing":"...","angle":"...","movement":"...","screenDirectionRule":"..."},"lighting":"...","dialogue":[{"id":"dlg_001","speakerRefId":"canonical_or_local_ref","text":"one short spoken line, max 140 chars","emotion":"..."}],"performance":[{"id":"perf_001","characterRefId":"canonical_or_local_ref","emotion":"...","valence":0,"arousal":0.5,"bodyLanguage":"...","facialExpression":"...","gaze":"..."}],"refs":{"visibleCharacterRefIds":[],"speakerRefIds":[],"propRefIds":[],"locationRefIds":[],"localReferenceIds":[]},"sceneBinding":{"setId":"set_...","zoneId":"...","primarySpotId":"...","viewpointId":"..."}} - include performance beats only for featured or speaking characters; omit fields that would be empty.',
        'scene_graph_addition: {"kind":"scene_graph_addition","nodeKind":"set|zone|spot|viewpoint","id":"set_or_zone_or_spot_or_viewpoint_id","name":"...","visualBrief":"...","worldLocationRefId":"optional_world_ref","setId":"parent_set_for_zone_spot_viewpoint","zoneId":"parent_zone_for_spot_viewpoint","spotIds":[],"shotIds":[],"storyboardBlockIds":[]}',
        'spot_relation: {"kind":"spot_relation","sourceId":"spot_a","targetId":"spot_b","relationship":"adjacent_to|connected_to|visible_from|entrance_to|faces|opposes|above_below|left_of|right_of|near|occludes","evidence":"short reason","direction":"optional world-space direction","screenDirection":"optional screen-space direction"}',
        'local_reference: {"kind":"local_reference","id":"local_ref_id","type":"temp_character|prop|item|faction|crowd|vehicle|location_spot","name":"...","visualBrief":"...","usedShotIds":[],"blockIds":[],"required":false,"importance":"hero|supporting|incidental","parentNodeId":"","sourceReferenceIds":[]}',
        'plan_done: {"kind":"plan_done","shotCount":0,"blockCount":0,"orderedShotIds":[],"orderedBlockIds":[],"screenplaySummary":"...","notes":[]}',
        legacyAnchorPrompt,
        'For every shot, fill refs.visibleCharacterRefIds, refs.speakerRefIds, refs.propRefIds, and refs.locationRefIds when matching world refs exist.',
        'For every spoken line in the screenplay, put one dialogue row on the shot where it is spoken. Every dialogue row must have speakerRefId and non-empty text. Do not create speaker-only dialogue rows.',
        'Never merge multiple screenplay dialogue turns into one dialogue row. Split dense dialogue across multiple shots rather than summarizing or packing it.',
        'For visible/speaking characters, add concise performance rows with emotion, valence, arousal, confidence, dominance, body language, facial expression, gaze, gesture, and voice energy when meaningful.',
        'Do not invent duplicate canonical characters, locations, factions, or props. If a world ref matches, use its key.',
        'Create output-local scene graph additions only when needed for the animatic: physical sets, zones, spots, and optional reusable viewpoints/camera setups.',
        'Scene graph nodes must be filmable physical things. Never create nodes for themes, emotions, fog/rain/lighting-only cues, shot titles, action phrases, or character names used as places.',
        'Spot-first rule: when a shot action is anchored to a concrete point of interest such as a bridge edge, door, custody table, crane hook, skiff prow, pier railing, checkpoint gate, shrine steps, or alley mouth, create or reuse a spot and set primarySpotId. Put the primary spot first in spotIds.',
        'Zone-only bindings are allowed only when the location is intentionally broad/non-descript and no reusable physical point matters.',
        'Use viewpointId only for reusable camera setups or important camera-reference continuity. Do not create a viewpoint for every shot just to satisfy structure.',
        'When two spots matter spatially, emit spot_relation records such as adjacent_to, connected_to, visible_from, entrance_to, faces, opposes, above_below, left_of, right_of, near, or occludes.',
        'Every shot must include sceneBinding with at least setId or worldLocationRefId. Prefer zoneId, use primarySpotId/spotIds whenever a concrete physical point matters, and use viewpointId only when useful. Reuse the same set/zone/spot/viewpoint IDs across shots.',
        'Define animatic-only temp characters, props/items, factions/crowds, vehicles, or other local refs in localReferences. Then attach their IDs to refs.localReferenceIds or sceneBinding.localReferenceIds on the shots that use them.',
        'For each shot, set blockId immediately even if the block record will be emitted later. Use stable block IDs such as block_001, block_002. Keep notes short and only for important ambiguity.',
        helpers.compactForPrompt({
          screenplay: screenplayDraft,
          scriptContract: creativeScreenplayContract ? 'creative_screenplay_v1' : scriptContract,
          legacyScreenplayShotAnchors: scriptShotProjection.scriptShots.length > 0 ? scriptShotProjection : undefined,
          legacyRoughShotCandidates: Object.keys(shotPlan).length > 0 ? shotPlan : undefined,
          legacyRoughBlockCandidates: roughBlocks.length > 0 ? roughBlocks : undefined,
          continuityPlannerContext,
          existingWorldReferences: animaticReferenceCatalog,
          assetPack,
        }, 26000),
      ].filter(Boolean).join('\n\n'),
      maxOutputTokens: 64000,
      shouldCancel: executionContext.shouldCancel,
      onProgress: async (progress) => {
        await executionContext.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            lastProviderPollAt: progress.lastProviderPollAt,
            providerStartedAt: progress.providerStartedAt,
            sequenceAnimaticDirectorPlan: true,
            sequenceAnimaticShotContinuityPlan: true,
            sequenceAnimaticShotContinuityStream: true,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Shot continuity plan generation failed.'
    throw new Error(`Sequence animatic shot continuity plan failed: ${reason}`)
  }

  const directorPlan = helpers.normalizeSequenceAnimaticDirectorPlan({
    rawPlan: streamedPlan.value,
    manifest,
    manifestHash,
    masterManifestArtifactKey,
    continuityPlannerContext,
  })
  const totalEditorialDurationSeconds = directorPlan.shots.reduce((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds) || 0), 0)
  const outputShotPlan = {
    ...shotPlan,
    shots: directorPlan.shots,
    totalEditorialDurationSeconds,
  }
  const outputs = {
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    shotPlan: outputShotPlan,
    shot_plan: outputShotPlan,
    blocks: directorPlan.blocks,
    continuityGraphV2: directorPlan.continuityGraphV2,
    continuity_graph_v2: directorPlan.continuityGraphV2,
    shotBindings: directorPlan.shotBindings,
    shot_bindings: directorPlan.shotBindings,
    roughShotBreakPlan: shotBreakPlan,
    rough_shot_break_plan: shotBreakPlan,
    roughShotPlan: shotPlan,
    rough_shot_plan: shotPlan,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: false,
    providerRequestId: streamedPlan.providerRequestId,
    acceptedStreamRecordCount: streamedPlan.acceptedRecordCount,
    streamWarningCount: streamedPlan.warningCount,
    usage: helpers.asRecord(helpers.asRecord(streamedPlan.response).body).usage,
  }
  return {
    outputs,
    provider: streamedPlan.provider,
    model: streamedPlan.model,
    providerRequestId: streamedPlan.providerRequestId || undefined,
  }
}

export async function runSequenceAnimaticSceneShotPlanRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers } = input
  const config = helpers.asRecord(executionContext.node.config)
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(
    helpers.readFirstUpstreamRecord(executionContext.upstream, ['scenePackage', 'scene_package']),
  )
  const configuredScenePackageParse = helpers.safeParseSequenceAnimaticTaggedScenePackage(config.scenePackage)
  const configuredScenePackage = configuredScenePackageParse.success ? configuredScenePackageParse.data : null
  const sceneId = helpers.readText(config.sceneId) || helpers.readText(configuredScenePackage?.sceneId) || ''
  const scenePackages = scenePackageOutput.scenePackages.map(helpers.asRecord)
  const scenePackage = configuredScenePackage
    ?? scenePackages.find((scene) => helpers.readText(scene.sceneId) === sceneId)
    ?? scenePackages[0]
  if (!scenePackage) throw new Error('Scene shot planner requires a parsed scene package.')

  const screenplayDraft = helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Scene shot planner requires the authored tagged screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Scene shot planner requires the visual reference asset pack.')

  const animaticReferenceCatalog = helpers.sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.readFirstUpstreamRecord(executionContext.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
    assetPack,
  })
  const continuityPlannerContext = helpers.buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan: {},
    shotBreakPlan: {},
    assetPack,
    animaticReferenceCatalog,
  })
  const scenePackageId = helpers.readText(scenePackage.sceneId)
  const manifest = {
    role: 'sequence_animatic_scene_director_source',
    requestId: executionContext.run.metadata?.outputRequestId ?? executionContext.run.metadata?.masterRequestId ?? null,
    workflowId: executionContext.workflow.id,
    runId: executionContext.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    scenePackage,
    scenePackageOutput,
    assetPack,
    animaticReferenceCatalog,
  }
  const manifestHash = helpers.hashOutputWorkflowValue(manifest)
  const masterManifestArtifactKey = `output.${helpers.slugify(executionContext.workflow.name)}.${executionContext.run.id.slice(0, 8)}.${helpers.slugify(scenePackageId)}-scene-shot-plan`
  const outputRequestId = helpers.readText(executionContext.run.metadata?.masterRequestId) || helpers.readText(executionContext.run.metadata?.outputRequestId)
  if (!outputRequestId) throw new Error('Scene shot continuity stream requires an output request id.')

  const policy = helpers.sequenceAnimaticShotContinuityPolicy
  let streamedPlan: SequenceAnimaticShotContinuityStreamResult
  try {
    streamedPlan = await helpers.runSequenceAnimaticShotContinuityPlanStreamWithRetry({
      client: executionContext.client,
      run: executionContext.run,
      workflow: executionContext.workflow,
      node: executionContext.node,
      requestId: outputRequestId,
      taskClass: 'scene_shot_plan',
      instructions: [
        'You are a senior animation shot planner and continuity supervisor.',
        'Return newline-delimited JSON only: one complete JSON object per record, no markdown, no array wrapper, no prose outside JSON records.',
        'Be token-frugal: omit optional descriptive fields whose value would be an empty string, empty array, or null. Structural keys are never optional: every shot record must include id, index, blockId, durationSeconds, action, camera, and sceneBinding; never drop id fields.',
        'Every shot must also include a concise lighting note (<=12 words: time of day, key light direction, mood) - lighting drives keyframe atmosphere and is not optional padding.',
        'Allowed record kinds for this scene node: scene_plan_start, shot, scene_graph_addition, spot_relation, local_reference, scene_plan_done. block is also allowed if helpful.',
        'Emit shot records as soon as each shot is complete. Do not wait for the entire scene to be complete before streaming shots.',
      ].join('\n'),
      prompt: [
        `Convert only this screenplay scene into a scene-scoped shot continuity plan: ${scenePackageId} (${helpers.readText(scenePackage.title)}).`,
        'Do not plan shots for any other scene. Preserve story order inside this scene.',
        `Use scene-scoped IDs: shot IDs must start with "${scenePackageId}_shot_" and block IDs must start with "${scenePackageId}_block_".`,
        'Use the scene graph assignment package as first-choice sceneBinding IDs. Add missing spots or viewpoints only when the assigned package lacks a concrete point needed by the action.',
        `Hard shot boundary rules: durationSeconds must be <= ${policy.maxDurationSeconds}; preferred duration is 3-${policy.preferredDurationSeconds} seconds; each shot should contain one camera setup and one visible story beat.`,
        `Dialogue density rules: each shot may contain at most ${policy.maxDialogueLines} short dialogue rows, at most 140 characters per dialogue line, and at most ${policy.maxDialogueCharacters} total spoken characters. Split dialogue exchanges across reaction/action shots.`,
        'Coverage setup rules: do not emit coverage_setup records and do not set coverageSetupId. Capture only shot-local camera facts and optional coverageIntent text; a dedicated downstream coverage planner will assign reusable setups.',
        'For every dialogue line from the scene package, put a dialogue row on the shot where it is spoken. Preserve speakerRefId exactly.',
        'Every shot must include sceneBinding with at least setId or worldLocationRefId. Prefer zoneId and primarySpotId/spotIds when present in the scene package.',
        'The scene planner returns compact shot-first records only. Do not emit top-level shotBindings, continuityGraphV2, assetRequirements, warnings, diagnostics, image prompts, or video prompts.',
        'Record contracts:',
        'scene_plan_start: {"kind":"scene_plan_start","contractVersion":"shot_continuity_plan_v2","graphSpecVersion":"sequence_animatic_graph_v2","note":"short optional note"}',
        'shot: {"kind":"shot","id":"scene_001_shot_001","index":1,"blockId":"scene_001_block_001","title":"...","durationSeconds":3,"continuityLink":{"mode":"same_setup|reverse_angle|blocking_change|match_action|new_setup|insert_cutaway|new_scene","fromShotId":"...","description":"..."},"coverageIntent":"optional concise camera/staging intent, not an id","action":"...","camera":{"framing":"...","angle":"...","movement":"...","screenDirectionRule":"..."},"lighting":"...","dialogue":[{"id":"dlg_001","speakerRefId":"canonical_or_local_ref","text":"one short spoken line, max 140 chars","emotion":"..."}],"performance":[{"id":"perf_001","characterRefId":"canonical_or_local_ref","emotion":"...","valence":0,"arousal":0.5,"bodyLanguage":"...","facialExpression":"...","gaze":"..."}],"refs":{"visibleCharacterRefIds":[],"speakerRefIds":[],"propRefIds":[],"locationRefIds":[],"localReferenceIds":[]},"sceneBinding":{"setId":"set_...","zoneId":"...","primarySpotId":"...","viewpointId":"..."}} - include performance beats only for featured or speaking characters; omit fields that would be empty.',
        'scene_graph_addition: {"kind":"scene_graph_addition","nodeKind":"set|zone|spot|viewpoint","id":"...","name":"...","visualBrief":"...","worldLocationRefId":"optional_world_ref","setId":"parent_set","zoneId":"parent_zone","spotIds":[],"shotIds":[],"storyboardBlockIds":[]}',
        'local_reference: {"kind":"local_reference","id":"local_ref_id","type":"temp_character|prop|item|faction|crowd|vehicle|location_spot","name":"...","visualBrief":"...","usedShotIds":[],"blockIds":[],"required":false,"importance":"hero|supporting|incidental","parentNodeId":"","sourceReferenceIds":[]}',
        'scene_plan_done: {"kind":"scene_plan_done","shotCount":0,"blockCount":0,"orderedShotIds":[],"orderedBlockIds":[],"screenplaySummary":"...","notes":[]}',
        helpers.compactForPrompt({
          scenePackage,
          screenplaySceneText: scenePackage.sourceText,
          sceneGraphAssignment: {
            worldLocationRefId: scenePackage.worldLocationRefId,
            setId: scenePackage.setId,
            zoneId: scenePackage.zoneId,
            spotIds: scenePackage.spotIds,
            graphAdditions: scenePackage.graphAdditions,
            graphAdditionIds: scenePackage.graphAdditionIds,
          },
          sceneGraphDraft: scenePackageOutput.sceneGraphDraft,
          spotRelations: scenePackageOutput.spotRelations,
          dialogueRows: scenePackage.dialogueRows,
          existingWorldReferences: animaticReferenceCatalog,
          assetPack,
        }, 22000),
      ].filter(Boolean).join('\n\n'),
      maxOutputTokens: Math.max(16000, Math.min(40000, Math.ceil(policy.maxShotCount / Math.max(1, scenePackages.length)) * 1800)),
      shouldCancel: executionContext.shouldCancel,
      onProgress: async (progress) => {
        await executionContext.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            lastProviderPollAt: progress.lastProviderPollAt,
            providerStartedAt: progress.providerStartedAt,
            sequenceAnimaticSceneShotPlan: true,
            sourceSceneId: scenePackageId,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Scene shot plan generation failed.'
    throw new Error(`Sequence animatic scene shot plan failed for ${scenePackageId}: ${reason}`)
  }

  const streamedValue = helpers.asRecord(streamedPlan.value)
  const directorPlan = helpers.normalizeSequenceAnimaticDirectorPlan({
    rawPlan: {
      ...streamedValue,
      planningMode: 'single_director_pass',
      notes: [
        ...helpers.readArray(streamedValue.notes),
        `Scene-scoped shot plan for ${scenePackageId}.`,
      ],
    },
    manifest,
    manifestHash,
    masterManifestArtifactKey,
    continuityPlannerContext,
  })
  const sourceSceneIndex = Number(scenePackage.index ?? 0) || 0
  const outputs = {
    sceneId: scenePackageId,
    scene_id: scenePackageId,
    sourceSceneIndex,
    source_scene_index: sourceSceneIndex,
    scenePackage,
    scene_package: scenePackage,
    scenePlan: directorPlan,
    scene_plan: directorPlan,
    sceneShotPlan: directorPlan,
    scene_shot_plan: directorPlan,
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: false,
    providerRequestId: streamedPlan.providerRequestId,
    acceptedStreamRecordCount: streamedPlan.acceptedRecordCount,
    streamWarningCount: streamedPlan.warningCount,
    usage: helpers.asRecord(helpers.asRecord(streamedPlan.response).body).usage,
  }
  return {
    outputs,
    provider: streamedPlan.provider,
    model: streamedPlan.model,
    providerRequestId: streamedPlan.providerRequestId || undefined,
  }
}
