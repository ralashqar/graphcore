import {
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
} from '../../../src/domain/cinematics.ts'
import {
  outputWorkflowDefaultVideoModel,
  resolveOutputVideoProvider,
} from './output-workflow-media-runtime.ts'
import {
  buildCinematicV3StoryboardGroupFromShotBreakGroup,
  buildSequenceAnimaticMasterDynamicFanoutRows,
} from './output-workflow-sequence-animatic-planning-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicV3FanoutNodeInput = {
  key: string
  nodeType: string
  label: string
  x: number
  y: number
  config: LooseRecord
}

type CinematicV3FanoutEdgeInput = {
  key: string
  sourceNodeKey: string
  sourcePort: string
  targetNodeKey: string
  targetPort: string
  metadata?: LooseRecord
}

export type CinematicV3FanoutRowFactories<TNode extends LooseRecord = LooseRecord, TEdge extends LooseRecord = LooseRecord> = {
  node: (input: CinematicV3FanoutNodeInput) => TNode
  edge: (input: CinematicV3FanoutEdgeInput) => TEdge
}

export type CinematicV3DynamicFanoutMaterializerInput = {
  client: unknown
  run: {
    id?: unknown
  }
  workflow: {
    id?: unknown
    metadata?: unknown
  }
  compileOutputs: LooseRecord
  config: LooseRecord
}

export type CinematicV3DynamicFanoutMaterializerHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  hashOutputWorkflowValue: (value: unknown) => string
  hasStoredOutputs: (value: unknown) => boolean
  isStaleDynamicCinematicNode: (node: unknown) => boolean
  loadWorkflowNodes: (input: { client: unknown; workflowId: string }) => Promise<LooseRecord[]>
  loadWorkflowRunSteps: (input: { client: unknown; workflowId: string; runId: string }) => Promise<LooseRecord[]>
  loadWorkflowEdges: (input: { client: unknown; workflowId: string }) => Promise<LooseRecord[]>
  dynamicNodeRow: (input: LooseRecord) => LooseRecord
  dynamicEdgeRow: (input: LooseRecord) => LooseRecord
  preserveExistingDynamicNodeOutput: (input: {
    nextRow: LooseRecord
    existingNode?: LooseRecord | null
    existingStep?: LooseRecord | null
    compileHash: string
    preserve: boolean
  }) => LooseRecord
  persistDynamicWorkflowGraphRevision: (input: {
    client: unknown
    workflow: unknown
    nodeRows: LooseRecord[]
    edgeRows: LooseRecord[]
    existingDynamicNodes: LooseRecord[]
    dynamicEdgeKeys: string[]
    compileHash: string
    staleReason: string
    workflowMetadataPatch: LooseRecord
  }) => Promise<void>
}

function numericValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function recordArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

export function parseAspectRatio(value: string) {
  const [rawWidth, rawHeight] = value.split(':').map((part) => Number(part))
  if (Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth > 0 && rawHeight > 0) {
    return { width: rawWidth, height: rawHeight }
  }
  return { width: 16, height: 9 }
}

export function storyboardLayoutForShotCount(shotCount: number) {
  const count = Math.max(1, Math.min(16, Math.ceil(shotCount)))
  if (count <= 3) return { columns: count, rows: 1, panelCount: count }
  if (count === 4) return { columns: 2, rows: 2, panelCount: count }
  if (count <= 6) return { columns: 3, rows: 2, panelCount: count }
  if (count <= 8) return { columns: 4, rows: 2, panelCount: count }
  if (count === 9) return { columns: 3, rows: 3, panelCount: count }
  if (count <= 12) return { columns: 4, rows: 3, panelCount: count }
  return { columns: 4, rows: 4, panelCount: count }
}

function normalizeStoryboardImageDimension(value: number) {
  return Math.max(16, Math.min(3072, Math.round(value / 16) * 16))
}

export function storyboardImageSizeForLayout(input: {
  columns: number
  rows: number
  aspectRatio: string
}) {
  const ratio = parseAspectRatio(input.aspectRatio)
  const landscapeOrSquare = ratio.width >= ratio.height
  const panelShortSide = 432
  const rawWidth = landscapeOrSquare
    ? input.columns * panelShortSide * (ratio.width / ratio.height)
    : input.columns * panelShortSide
  const rawHeight = landscapeOrSquare
    ? input.rows * panelShortSide
    : input.rows * panelShortSide * (ratio.height / ratio.width)
  const scale = Math.min(1, 3072 / Math.max(rawWidth, rawHeight))
  return {
    width: normalizeStoryboardImageDimension(rawWidth * scale),
    height: normalizeStoryboardImageDimension(rawHeight * scale),
  }
}

export function cinematicV3StoryboardGroupShots(input: {
  shotPlan: LooseRecord
  storyboardGroup?: LooseRecord | null
}) {
  const parsedShotPlan = cinematicV2ShotPlanSchema.safeParse(input.shotPlan)
  if (!parsedShotPlan.success) return []
  const parsedGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {})
  if (!parsedGroup.success) return parsedShotPlan.data.shots
  const groupShotIds = new Set(parsedGroup.data.shotIds)
  const matchedGroupShots = parsedShotPlan.data.shots.filter((shot) => groupShotIds.has(shot.id))
  return matchedGroupShots.length > 0 ? matchedGroupShots : parsedShotPlan.data.shots
}

export function buildCinematicV3StoryboardDynamicFanoutGroupRows<TNode extends LooseRecord = LooseRecord, TEdge extends LooseRecord = LooseRecord>(input: {
  factories: CinematicV3FanoutRowFactories<TNode, TEdge>
  group: LooseRecord
  groupIndex: number
  groupCount: number
  storyboardImageSize: LooseRecord
  aspectRatio: string
  resolution: string
  videoProvider: string
  videoModel: string
  debugSkipVideoGeneration: boolean
}) {
  const storyboardLayout = {
    rows: input.group.rows,
    columns: input.group.columns,
    panelCount: input.group.panelCount,
  }
  const y = 80 + input.groupIndex * 180
  const promptKey = `${input.group.id}_prompt`
  const sheetKey = `${input.group.id}_sheet`
  const extractKey = `${input.group.id}_panel_extract`
  const videoPromptKey = `${input.group.id}_video_prompt`
  const videoKey = `${input.group.id}_video`
  const groupDurationSeconds = Math.max(
    4,
    Math.min(
      15,
      Math.ceil(numericValue(input.group.providerDurationSeconds || input.group.editorialDurationSeconds, 0) || recordArrayLength(input.group.shotIds) * 3),
    ),
  )
  const assetPackSourceNodeKey = 'cinematic_v3_reference_select'
  const nodeRows = [
    input.factories.node({ key: promptKey, nodeType: 'utility_transform', label: `Storyboard ${input.group.index} Prompt`, x: 1760, y, config: { purpose: 'cinematic_v3_storyboard_prompt', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio: input.aspectRatio, storyboardGroup: input.group, storyboardLayout, planningOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_storyboard_prompts', maxConcurrency: 6 } } }),
    input.factories.node({ key: sheetKey, nodeType: 'image_generation', label: `Storyboard ${input.group.index} Sheet`, x: 2040, y, config: { purpose: 'cinematic_v3_storyboard_sheet', role: 'cinematic_v3_storyboard_sheet', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: input.group, storyboardGroupId: input.group.id, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'high', outputFormat: 'webp', maxReferenceImages: 16, imageSize: input.storyboardImageSize, aspectRatio: input.aspectRatio, storyboardLayout, planningOnly: true, planning_only: true, usedAsVideoReference: true, used_as_video_reference: true, skillKeys: ['cinematic_beat_sheet_planning', 'storyboard_panel_accuracy', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'storyboard_sheet', 'panel_grid', 'image_prompt', 'entity_reference', 'panel_accuracy'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v3_storyboard_sheets', maxConcurrency: Math.min(input.groupCount, 8), continueOnError: true } } }),
    input.factories.node({ key: extractKey, nodeType: 'utility_transform', label: `Extract Storyboard ${input.group.index}`, x: 2320, y, config: { purpose: 'cinematic_v3_panel_extract', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: input.group, storyboardGroupId: input.group.id, storyboardLayout, aspectRatio: input.aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_panel_extract', maxConcurrency: 6 } } }),
    input.factories.node({ key: videoPromptKey, nodeType: 'utility_transform', label: `Storyboard ${input.group.index} Video Prompt`, x: 2600, y, config: { purpose: 'cinematic_v3_storyboard_group_video_prompt', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: input.group, storyboardGroupId: input.group.id, durationSeconds: groupDurationSeconds, aspectRatio: input.aspectRatio, resolution: input.resolution, generateAudio: false, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_video_prompts', maxConcurrency: 6 } } }),
    input.factories.node({ key: videoKey, nodeType: 'video_generation', label: `Storyboard ${input.group.index} Video`, x: 2880, y, config: { purpose: 'cinematic_v3_storyboard_group_video', role: 'cinematic_v3_storyboard_group_video', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup: input.group, storyboardGroupId: input.group.id, provider: input.videoProvider, videoProvider: input.videoProvider, model: input.videoModel, durationSeconds: groupDurationSeconds, aspectRatio: input.aspectRatio, resolution: input.resolution, generateAudio: false, cinematicReferenceMode: 'storyboard_sheet', assetPackReferenceLimit: 4, debugSkipVideoGeneration: input.debugSkipVideoGeneration, syncMode: false, manualOnly: true, manual_only: true, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'cinematic_shot_direction', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'video_prompt', 'storyboard_sheet', 'seedance', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_v3_storyboard_group_videos', maxConcurrency: Math.min(input.groupCount, 4), manualOnly: true } } }),
  ]
  const edgeRows = [
    input.factories.edge({ key: `shot_plan__${promptKey}`, sourceNodeKey: 'cinematic_v3_shot_plan_merge', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'shot_plan' }),
    input.factories.edge({ key: `${assetPackSourceNodeKey}__${promptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: promptKey, targetPort: 'asset_pack' }),
    input.factories.edge({ key: `skill_context__${promptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: promptKey, targetPort: 'guidance' }),
    input.factories.edge({ key: `${promptKey}__${sheetKey}`, sourceNodeKey: promptKey, sourcePort: 'text', targetNodeKey: sheetKey, targetPort: 'prompt' }),
    input.factories.edge({ key: `${assetPackSourceNodeKey}__${sheetKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: sheetKey, targetPort: 'references' }),
    input.factories.edge({ key: `skill_context__${sheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sheetKey, targetPort: 'guidance' }),
    input.factories.edge({ key: `${sheetKey}__${extractKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: extractKey, targetPort: 'image' }),
    input.factories.edge({ key: `shot_plan__${extractKey}`, sourceNodeKey: 'cinematic_v3_shot_plan_merge', sourcePort: 'text', targetNodeKey: extractKey, targetPort: 'shot_plan' }),
    input.factories.edge({ key: `shot_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v3_shot_plan_merge', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'shot_plan' }),
    input.factories.edge({ key: `${assetPackSourceNodeKey}__${videoPromptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack' }),
    input.factories.edge({ key: `skill_context__${videoPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoPromptKey, targetPort: 'guidance' }),
    input.factories.edge({ key: `${sheetKey}__${videoPromptKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references' }),
    input.factories.edge({ key: `${videoPromptKey}__${videoKey}_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt' }),
    input.factories.edge({ key: `${sheetKey}__${videoKey}_reference`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references' }),
    input.factories.edge({ key: `${extractKey}__timeline_panels`, sourceNodeKey: extractKey, sourcePort: 'panels', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'panels', metadata: { storyboardGroupId: input.group.id, storyboardGroupIndex: input.group.index, optional: true, optionalDependency: true, authoringOptional: true } }),
    input.factories.edge({ key: `${videoPromptKey}__timeline_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'video_prompts', metadata: { storyboardGroupId: input.group.id, storyboardGroupIndex: input.group.index, optional: true, optionalDependency: true, authoringOptional: true } }),
    input.factories.edge({ key: `${videoKey}__timeline`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'videos', metadata: { storyboardGroupId: input.group.id, storyboardGroupIndex: input.group.index, optional: true, optionalDependency: true, manualOnly: true } }),
  ]
  return { nodeRows, edgeRows }
}

export function buildCinematicV3StoryboardDynamicFanoutTimelineRows<TNode extends LooseRecord = LooseRecord, TEdge extends LooseRecord = LooseRecord>(input: {
  factories: CinematicV3FanoutRowFactories<TNode, TEdge>
  shotCount: number
  aspectRatio: string
  resolution: string
  debugSkipVideoGeneration: boolean
}) {
  return {
    nodeRows: [
      input.factories.node({ key: 'cinematic_v3_timeline_assemble', nodeType: 'utility_transform', label: 'Assemble Storyboard Timeline', x: 3160, y: 120, config: { purpose: 'cinematic_v3_timeline_assemble', role: 'cinematic_v3_final_timeline', cinematicPipelineVersion: 'v3_script_storyboards', dynamicShotCount: input.shotCount, aspectRatio: input.aspectRatio, resolution: input.resolution, debugSkipVideoGeneration: input.debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'cinematic_v3_timeline_assemble', maxConcurrency: 1 } } }),
      input.factories.node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Cinematic', x: 3440, y: 120, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    ],
    edgeRows: [
      input.factories.edge({ key: 'shot_plan__timeline', sourceNodeKey: 'cinematic_v3_shot_plan_merge', sourcePort: 'text', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'shot_plan' }),
      input.factories.edge({ key: 'timeline__artifact', sourceNodeKey: 'cinematic_v3_timeline_assemble', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input' }),
    ],
  }
}

export async function materializeDynamicCinematicV3StoryboardFanoutRuntime(
  input: CinematicV3DynamicFanoutMaterializerInput,
  helpers: CinematicV3DynamicFanoutMaterializerHelpers,
) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.compileOutputs.shotPlan)
  const storyboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.parse(input.compileOutputs.storyboardGroupPlan)
  const screenplayDraft = helpers.asRecord(input.compileOutputs.screenplayDraft)
  const referencePlan = helpers.asRecord(input.compileOutputs.cinematicReferencePlan)
  const compileHash = helpers.readText(input.compileOutputs.compileHash) || helpers.hashOutputWorkflowValue({
    shotPlan,
    storyboardGroupPlan,
    screenplayDraft,
    referencePlan,
  })
  const aspectRatio = helpers.readText(input.config.aspectRatio) || '16:9'
  const resolution = helpers.readText(input.config.resolution) || '720p'
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration !== false
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = helpers.readText(input.config.videoModel)
    || helpers.readText(input.config.model)
    || outputWorkflowDefaultVideoModel(videoProvider, resolution)
  const generatedByNodeKey = 'cinematic_v3_dynamic_storyboard_fanout'
  const dynamicV3GraphPersistenceVersion = 'v3_persistence_authoring_1'
  const workflowId = helpers.readText(input.workflow.id)
  const runId = helpers.readText(input.run.id)

  const existingNodeRows = await helpers.loadWorkflowNodes({ client: input.client, workflowId })
  const allExistingDynamicNodes = existingNodeRows
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
    .filter((row) => {
      const generatedBy = helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey)
      return generatedBy === generatedByNodeKey || generatedBy === 'cinematic_v3_dynamic_storyboard_fanout'
    })
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !helpers.isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [helpers.readText(row.key), row] as const))
  const existingStepRows = await helpers.loadWorkflowRunSteps({ client: input.client, workflowId, runId })
  const existingStepByNodeKey = new Map(existingStepRows.map((row) => [helpers.readText(row.node_key), row] as const))
  const hasRecoverableStepOutput = existingDynamicNodes.some((row) => {
    if (helpers.readText(row.output_hash) || helpers.hasStoredOutputs(row.outputs)) return false
    const step = existingStepByNodeKey.get(helpers.readText(row.key))
    return Boolean(step && (helpers.readText(step.output_hash) || helpers.hasStoredOutputs(step.outputs)))
  })
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicV3GraphPersistenceVersion) === dynamicV3GraphPersistenceVersion)
    && existingDynamicNodes.some((row) => helpers.readText(row.key) === 'cinematic_v3_timeline_assemble')
    && existingDynamicNodes.some((row) => helpers.readText(row.key) === 'artifact')
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_prompt`))
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_sheet`))
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_panel_extract`))
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_video_prompt`))
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_video`))
  if (existingSameHash && !hasRecoverableStepOutput) return { expanded: false, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }

  const existingEdgeRows = await helpers.loadWorkflowEdges({ client: input.client, workflowId })
  const dynamicEdgeKeys = existingEdgeRows
    .filter((row) => {
      const generatedBy = helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey)
      return generatedBy === generatedByNodeKey || generatedBy === 'cinematic_v3_dynamic_storyboard_fanout'
    })
    .map((row) => helpers.readText(row.key))
    .filter(Boolean)

  const preserveV3NodeRow = (row: LooseRecord) => {
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
  const v3Node = (args: LooseRecord) => {
    const row = helpers.dynamicNodeRow({
      workflow: input.workflow,
      compileHash,
      generatedByNodeKey,
      ...args,
    })
    return preserveV3NodeRow({
      ...row,
      metadata: {
        ...helpers.asRecord(row.metadata),
        dynamicV3GraphPersistenceVersion,
      },
    })
  }
  const v3Edge = (args: LooseRecord) => helpers.dynamicEdgeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })

  const nodeRows: LooseRecord[] = []
  const edgeRows: LooseRecord[] = []
  storyboardGroupPlan.groups.forEach((group, index) => {
    const storyboardImageSize = storyboardImageSizeForLayout({ columns: group.columns, rows: group.rows, aspectRatio })
    const groupRows = buildCinematicV3StoryboardDynamicFanoutGroupRows({
      factories: {
        node: (row) => v3Node(row as never),
        edge: (row) => v3Edge(row as never),
      },
      group: group as never,
      groupIndex: index,
      groupCount: storyboardGroupPlan.groups.length,
      storyboardImageSize: storyboardImageSize as never,
      aspectRatio,
      resolution,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
    })
    nodeRows.push(...groupRows.nodeRows)
    edgeRows.push(...groupRows.edgeRows)
  })

  const timelineRows = buildCinematicV3StoryboardDynamicFanoutTimelineRows({
    factories: {
      node: (row) => v3Node(row as never),
      edge: (row) => v3Edge(row as never),
    },
    shotCount: shotPlan.shots.length,
    aspectRatio,
    resolution,
    debugSkipVideoGeneration,
  })
  nodeRows.push(...timelineRows.nodeRows)
  edgeRows.push(...timelineRows.edgeRows)

  await helpers.persistDynamicWorkflowGraphRevision({
    client: input.client,
    workflow: input.workflow,
    nodeRows,
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'dynamic_v3_storyboard_fanout_rematerialized',
    workflowMetadataPatch: {
      cinematicPipelineVersion: 'v3_script_storyboards',
      cinematicV2ScreenplayDraft: screenplayDraft,
      cinematicV2ShotPlan: shotPlan,
      cinematicV2StoryboardGroupPlan: storyboardGroupPlan,
      cinematicV3ScreenplayDraft: screenplayDraft,
      cinematicV3ShotPlan: shotPlan,
      cinematicV3StoryboardGroupPlan: storyboardGroupPlan,
      dynamicShotCount: shotPlan.shots.length,
      storyboardSheetCount: storyboardGroupPlan.groups.length,
      totalDurationSeconds: shotPlan.totalEditorialDurationSeconds,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: 'v3_script_storyboards',
    },
  })
  return { expanded: true, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }
}

export async function materializeDynamicCinematicV3ShotParseFanoutRuntime(
  input: CinematicV3DynamicFanoutMaterializerInput,
  helpers: CinematicV3DynamicFanoutMaterializerHelpers,
) {
  const shotBreakPlan = helpers.asRecord(input.compileOutputs.shotBreakPlan)
  const groups = (Array.isArray(shotBreakPlan.groups) ? shotBreakPlan.groups.map(helpers.asRecord) : [])
    .filter((group) => helpers.readText(group.id))
  const screenplayDraft = helpers.asRecord(input.compileOutputs.screenplayDraft)
  const referencePlan = helpers.asRecord(input.compileOutputs.cinematicReferencePlan)
  const compileHash = helpers.readText(input.compileOutputs.compileHash) || helpers.hashOutputWorkflowValue({
    shotBreakPlan,
    screenplayDraft,
    referencePlan,
  })
  const aspectRatio = helpers.readText(input.config.aspectRatio) || '16:9'
  const resolution = helpers.readText(input.config.resolution) || '720p'
  const maxShotCount = Number(input.config.maxShotCount ?? 0) || 36
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration !== false
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = helpers.readText(input.config.videoModel)
    || helpers.readText(input.config.model)
    || outputWorkflowDefaultVideoModel(videoProvider, resolution)
  const generatedByNodeKey = 'cinematic_v3_dynamic_shot_parse_fanout'
  const sequenceAnimaticMode = helpers.readText(input.config.sequenceAnimaticMode)
  const cinematicAnimaticMode = helpers.readText(input.config.cinematicAnimaticMode)
    || helpers.readText(helpers.asRecord(input.workflow.metadata).cinematicAnimaticMode)
  const workflowMetadata = helpers.asRecord(input.workflow.metadata)
  const screenplayAnimaticMasterMode = sequenceAnimaticMode === 'master_script_only'
    || cinematicAnimaticMode === 'prompt_cinematic_master'
    || helpers.readText(workflowMetadata.screenplayAnimaticRole) === 'master'
    || helpers.readText(workflowMetadata.sequenceAnimaticRole) === 'master'
  const screenplayAnimaticSource = helpers.readText(workflowMetadata.screenplayAnimaticSource)
    || (cinematicAnimaticMode === 'prompt_cinematic_master' ? 'prompt_cinematic' : '')
  const dynamicV3ParsePersistenceVersion = screenplayAnimaticMasterMode
    ? 'v3_sequence_master_director_first_2'
    : 'v3_parse_groups_direct_storyboards_1'
  const storyboardGroups = groups.map((group, index) => buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index))
  const workflowId = helpers.readText(input.workflow.id)
  const runId = helpers.readText(input.run.id)

  const existingNodeRows = await helpers.loadWorkflowNodes({ client: input.client, workflowId })
  const allExistingDynamicNodes = existingNodeRows
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
    .filter((row) => {
      const generatedBy = helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey)
      return generatedBy === generatedByNodeKey || generatedBy === 'cinematic_v3_dynamic_storyboard_fanout'
    })
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !helpers.isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [helpers.readText(row.key), row] as const))
  const existingStepRows = await helpers.loadWorkflowRunSteps({ client: input.client, workflowId, runId })
  const existingStepByNodeKey = new Map(existingStepRows.map((row) => [helpers.readText(row.node_key), row] as const))
  const groupParseKeys = screenplayAnimaticMasterMode
    ? []
    : groups.map((group) => `${helpers.readText(group.id)}_shot_parse`)
  const directStoryboardKeys = screenplayAnimaticMasterMode
    ? []
    : storyboardGroups.flatMap((group) => [
      `${group.id}_prompt`,
      `${group.id}_sheet`,
      `${group.id}_panel_extract`,
      `${group.id}_video_prompt`,
      `${group.id}_video`,
    ])
  const expectedDynamicKeys = screenplayAnimaticMasterMode
    ? [
      'sequence_animatic_manifest',
      'sequence_animatic_director_plan',
      'sequence_animatic_director_plan_artifact',
      'sequence_animatic_orchestrator',
      'artifact',
    ]
    : [...groupParseKeys, ...directStoryboardKeys, 'cinematic_v3_timeline_assemble', 'artifact']
  const hasRecoverableStepOutput = existingDynamicNodes.some((row) => {
    if (helpers.readText(row.output_hash) || helpers.hasStoredOutputs(row.outputs)) return false
    const step = existingStepByNodeKey.get(helpers.readText(row.key))
    return Boolean(step && (helpers.readText(step.output_hash) || helpers.hasStoredOutputs(step.outputs)))
  })
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicV3ParsePersistenceVersion) === dynamicV3ParsePersistenceVersion)
    && expectedDynamicKeys.every((key) => existingDynamicNodes.some((row) => helpers.readText(row.key) === key))
  if (existingSameHash && !hasRecoverableStepOutput) {
    return { expanded: false, compileHash, parseGroupCount: screenplayAnimaticMasterMode ? 0 : groups.length, storyboardSheetCount: screenplayAnimaticMasterMode ? 0 : storyboardGroups.length }
  }

  const existingEdgeRows = await helpers.loadWorkflowEdges({ client: input.client, workflowId })
  const dynamicEdgeKeys = existingEdgeRows
    .filter((row) => {
      const generatedBy = helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey)
      return generatedBy === generatedByNodeKey || generatedBy === 'cinematic_v3_dynamic_storyboard_fanout'
    })
    .map((row) => helpers.readText(row.key))
    .filter(Boolean)

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
  const v3Node = (args: LooseRecord) => {
    const row = helpers.dynamicNodeRow({
      workflow: input.workflow,
      compileHash,
      generatedByNodeKey,
      ...args,
    })
    return preserveNodeRow({
      ...row,
      metadata: {
        ...helpers.asRecord(row.metadata),
        dynamicV3ParsePersistenceVersion,
      },
    })
  }
  const v3Edge = (args: LooseRecord) => helpers.dynamicEdgeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })

  const nodeRows: LooseRecord[] = []
  const edgeRows: LooseRecord[] = []
  const assetPackSourceNodeKey = 'cinematic_v3_reference_select'
  groups.forEach((group, index) => {
    if (screenplayAnimaticMasterMode) return
    const groupId = helpers.readText(group.id)
    const storyboardGroup = storyboardGroups[index]
    const storyboardLayout = { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    const storyboardImageSize = storyboardImageSizeForLayout({ columns: storyboardGroup.columns, rows: storyboardGroup.rows, aspectRatio })
    const parseKey = `${groupId}_shot_parse`
    const promptKey = `${storyboardGroup.id}_prompt`
    const sheetKey = `${storyboardGroup.id}_sheet`
    const extractKey = `${storyboardGroup.id}_panel_extract`
    const videoPromptKey = `${storyboardGroup.id}_video_prompt`
    const videoKey = `${storyboardGroup.id}_video`
    const y = 80 + index * 180
    const groupDurationSeconds = Math.max(4, Math.min(15, Math.ceil(Number(storyboardGroup.providerDurationSeconds || storyboardGroup.editorialDurationSeconds) || storyboardGroup.shotIds.length * 3)))
    nodeRows.push(
      v3Node({
        key: parseKey,
        nodeType: 'text_llm',
        label: `Parse Storyboard ${storyboardGroup.index}`,
        x: 1960,
        y,
        config: {
          purpose: 'cinematic_v3_shot_parse_group',
          cinematicPipelineVersion: 'v3_script_storyboards',
          storyboardGroup: group,
          storyboardGroupId: groupId,
          maxShotCount: Math.max(1, Math.min(9, helpers.readStringArray(group.shotBreakIds).length || maxShotCount)),
          aspectRatio,
          resolution,
          skillKeys: ['cinematic_shot_direction', 'cinematic_directorial_language', 'provider_prompt_hygiene'],
          guidanceMode: 'strict',
          execution: { resourceClass: 'llm', groupKey: 'cinematic_v3_shot_parse_groups', maxConcurrency: Math.min(groups.length, 6) },
        },
      }),
      v3Node({ key: promptKey, nodeType: 'utility_transform', label: `Storyboard ${storyboardGroup.index} Prompt`, x: 2240, y, config: { purpose: 'cinematic_v3_storyboard_prompt', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio, storyboardGroup, storyboardLayout, planningOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_storyboard_prompts', maxConcurrency: 6 } } }),
      v3Node({ key: sheetKey, nodeType: 'image_generation', label: `Storyboard ${storyboardGroup.index} Sheet`, x: 2520, y, config: { purpose: 'cinematic_v3_storyboard_sheet', role: 'cinematic_v3_storyboard_sheet', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup, storyboardGroupId: storyboardGroup.id, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'high', outputFormat: 'webp', maxReferenceImages: 16, imageSize: storyboardImageSize, aspectRatio, storyboardLayout, planningOnly: true, planning_only: true, usedAsVideoReference: true, used_as_video_reference: true, skillKeys: ['cinematic_beat_sheet_planning', 'storyboard_panel_accuracy', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'storyboard_sheet', 'panel_grid', 'image_prompt', 'entity_reference', 'panel_accuracy'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v3_storyboard_sheets', maxConcurrency: Math.min(storyboardGroups.length, 8), continueOnError: true } } }),
      v3Node({ key: extractKey, nodeType: 'utility_transform', label: `Extract Storyboard ${storyboardGroup.index}`, x: 2800, y, config: { purpose: 'cinematic_v3_panel_extract', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup, storyboardGroupId: storyboardGroup.id, storyboardLayout, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_panel_extract', maxConcurrency: 6 } } }),
      v3Node({ key: videoPromptKey, nodeType: 'utility_transform', label: `Storyboard ${storyboardGroup.index} Video Prompt`, x: 3080, y, config: { purpose: 'cinematic_v3_storyboard_group_video_prompt', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup, storyboardGroupId: storyboardGroup.id, durationSeconds: groupDurationSeconds, aspectRatio, resolution, generateAudio: false, execution: { resourceClass: 'utility', groupKey: 'cinematic_v3_video_prompts', maxConcurrency: 6 } } }),
      v3Node({ key: videoKey, nodeType: 'video_generation', label: `Storyboard ${storyboardGroup.index} Video`, x: 3360, y, config: { purpose: 'cinematic_v3_storyboard_group_video', role: 'cinematic_v3_storyboard_group_video', cinematicPipelineVersion: 'v3_script_storyboards', storyboardGroup, storyboardGroupId: storyboardGroup.id, provider: videoProvider, videoProvider, model: videoModel, durationSeconds: groupDurationSeconds, aspectRatio, resolution, generateAudio: false, cinematicReferenceMode: 'storyboard_sheet', assetPackReferenceLimit: 4, debugSkipVideoGeneration, syncMode: false, manualOnly: true, manual_only: true, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'cinematic_shot_direction', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v3', 'video_prompt', 'storyboard_sheet', 'seedance', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_v3_storyboard_group_videos', maxConcurrency: Math.min(storyboardGroups.length, 4), manualOnly: true } } }),
    )
    edgeRows.push(
      v3Edge({ key: `screenplay__${parseKey}`, sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: parseKey, targetPort: 'screenplay' }),
      v3Edge({ key: `shot_break_plan__${parseKey}`, sourceNodeKey: 'cinematic_v3_shot_break_plan', sourcePort: 'text', targetNodeKey: parseKey, targetPort: 'shot_break_plan' }),
      v3Edge({ key: `context__${parseKey}`, sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: parseKey, targetPort: 'context' }),
      v3Edge({ key: `guidance__${parseKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: parseKey, targetPort: 'guidance' }),
      v3Edge({ key: `references__${parseKey}`, sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: parseKey, targetPort: 'asset_pack' }),
      v3Edge({ key: `${parseKey}__${promptKey}`, sourceNodeKey: parseKey, sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `${assetPackSourceNodeKey}__${promptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: promptKey, targetPort: 'asset_pack' }),
      v3Edge({ key: `skill_context__${promptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: promptKey, targetPort: 'guidance' }),
      v3Edge({ key: `${promptKey}__${sheetKey}`, sourceNodeKey: promptKey, sourcePort: 'text', targetNodeKey: sheetKey, targetPort: 'prompt' }),
      v3Edge({ key: `${assetPackSourceNodeKey}__${sheetKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: sheetKey, targetPort: 'references' }),
      v3Edge({ key: `skill_context__${sheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sheetKey, targetPort: 'guidance' }),
      v3Edge({ key: `${sheetKey}__${extractKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: extractKey, targetPort: 'image' }),
      v3Edge({ key: `${parseKey}__${extractKey}`, sourceNodeKey: parseKey, sourcePort: 'text', targetNodeKey: extractKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `${parseKey}__${videoPromptKey}`, sourceNodeKey: parseKey, sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'shot_plan' }),
      v3Edge({ key: `${assetPackSourceNodeKey}__${videoPromptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack' }),
      v3Edge({ key: `skill_context__${videoPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoPromptKey, targetPort: 'guidance' }),
      v3Edge({ key: `${sheetKey}__${videoPromptKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references' }),
      v3Edge({ key: `${videoPromptKey}__${videoKey}_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt' }),
      v3Edge({ key: `${sheetKey}__${videoKey}_reference`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references' }),
      v3Edge({ key: `${parseKey}__timeline`, sourceNodeKey: parseKey, sourcePort: 'text', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'shot_plan', metadata: { storyboardGroupId: storyboardGroup.id, storyboardGroupIndex: storyboardGroup.index } }),
      v3Edge({ key: `${extractKey}__timeline_panels`, sourceNodeKey: extractKey, sourcePort: 'panels', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'panels', metadata: { storyboardGroupId: storyboardGroup.id, storyboardGroupIndex: storyboardGroup.index, optional: true, optionalDependency: true, authoringOptional: true } }),
      v3Edge({ key: `${videoPromptKey}__timeline_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'video_prompts', metadata: { storyboardGroupId: storyboardGroup.id, storyboardGroupIndex: storyboardGroup.index, optional: true, optionalDependency: true, authoringOptional: true } }),
      v3Edge({ key: `${videoKey}__timeline`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'cinematic_v3_timeline_assemble', targetPort: 'videos', metadata: { storyboardGroupId: storyboardGroup.id, storyboardGroupIndex: storyboardGroup.index, optional: true, optionalDependency: true, manualOnly: true } }),
    )
  })
  if (screenplayAnimaticMasterMode) {
    const masterRows = buildSequenceAnimaticMasterDynamicFanoutRows({
      factories: {
        node: (row) => v3Node(row as never),
        edge: (row) => v3Edge(row as never),
      },
      maxShotCount,
      aspectRatio,
      resolution,
    })
    nodeRows.push(...masterRows.nodeRows)
    edgeRows.push(...masterRows.edgeRows)
  } else {
    const dynamicShotCount = Array.isArray(shotBreakPlan.shotBreaks)
      ? shotBreakPlan.shotBreaks.length
      : groups.reduce((total, group) => total + helpers.readStringArray(group.shotBreakIds).length, 0)
    nodeRows.push(
      v3Node({ key: 'cinematic_v3_timeline_assemble', nodeType: 'utility_transform', label: 'Assemble Storyboard Timeline', x: 3660, y: 120, config: { purpose: 'cinematic_v3_timeline_assemble', role: 'cinematic_v3_final_timeline', cinematicPipelineVersion: 'v3_script_storyboards', dynamicShotCount, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'cinematic_v3_timeline_assemble', maxConcurrency: 1 } } }),
      v3Node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Cinematic', x: 3940, y: 120, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    )
    edgeRows.push(
      v3Edge({ key: 'timeline__artifact', sourceNodeKey: 'cinematic_v3_timeline_assemble', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input' }),
    )
  }

  await helpers.persistDynamicWorkflowGraphRevision({
    client: input.client,
    workflow: input.workflow,
    nodeRows,
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'dynamic_v3_shot_parse_fanout_rematerialized',
    workflowMetadataPatch: {
      cinematicPipelineVersion: 'v3_script_storyboards',
      cinematicV3ScreenplayDraft: screenplayDraft,
      cinematicV3ShotBreakPlan: shotBreakPlan,
      dynamicCinematicParseCompileHash: compileHash,
      dynamicV3ParseGroupCount: groups.length,
      screenplayAnimaticRole: screenplayAnimaticMasterMode ? 'master' : workflowMetadata.screenplayAnimaticRole,
      screenplayAnimaticSource: screenplayAnimaticMasterMode ? screenplayAnimaticSource || workflowMetadata.screenplayAnimaticSource : workflowMetadata.screenplayAnimaticSource,
      sequenceAnimaticRole: screenplayAnimaticMasterMode ? 'master' : workflowMetadata.sequenceAnimaticRole,
      storyboardSheetCount: screenplayAnimaticMasterMode ? 0 : storyboardGroups.length,
      dynamicShotCount: groups.reduce((total, group) => total + helpers.readStringArray(group.shotBreakIds).length, 0),
      dynamicGraphVersion: `${compileHash}:${nodeRows.length}:${edgeRows.length}`,
    },
  })
  return { expanded: true, compileHash, parseGroupCount: screenplayAnimaticMasterMode ? 0 : groups.length, storyboardSheetCount: screenplayAnimaticMasterMode ? 0 : storyboardGroups.length }
}
