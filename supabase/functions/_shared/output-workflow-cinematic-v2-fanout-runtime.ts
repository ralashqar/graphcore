import {
  buildCinematicV2StoryboardGroupPlan,
  cinematicV2ParsedScriptSchema,
  cinematicV2ReferencePlanSchema,
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  type CinematicV2Shot,
  type CinematicV2StoryboardGroupPlan,
} from '../../../src/domain/cinematics.ts'
import { aiGenerationSettings } from '../../../src/config/aiGenerationSettings.ts'
import {
  outputWorkflowDefaultVideoModel,
  resolveOutputVideoProvider,
} from './output-workflow-media-runtime.ts'
import {
  storyboardImageSizeForLayout,
} from './output-workflow-cinematic-v3-fanout-runtime.ts'

type LooseRecord = Record<string, unknown>

const CINEMATIC_STORYBOARD_IMAGE_QUALITY = aiGenerationSettings.outputWorkflow.cinematicStoryboardImageQuality

export type CinematicV2DynamicShotFanoutMaterializerInput = {
  client: unknown
  run: {
    input?: unknown
    metadata?: unknown
  }
  workflow: {
    id: string
    draftId: string
    metadata?: LooseRecord
  }
  compileOutputs: LooseRecord
  config: LooseRecord
}

export type CinematicV2DynamicShotFanoutMaterializerHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  hashOutputWorkflowValue: (value: unknown) => string
  isStaleDynamicCinematicNode: (node: unknown) => boolean
  loadWorkflowNodes: (input: { client: unknown; workflowId: string }) => Promise<LooseRecord[]>
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
  }) => Promise<unknown>
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function resolveCinematicV2AnimaticMode(input: {
  config: LooseRecord
  run: CinematicV2DynamicShotFanoutMaterializerInput['run']
  helpers: Pick<CinematicV2DynamicShotFanoutMaterializerHelpers, 'asRecord' | 'readText'>
}) {
  const runInput = input.helpers.asRecord(input.run.input)
  const runMetadata = input.helpers.asRecord(input.run.metadata)
  const raw = input.helpers.readText(runInput.cinematicV2AnimaticMode)
    || input.helpers.readText(runMetadata.cinematicV2AnimaticMode)
    || input.helpers.readText(input.config.cinematicV2AnimaticMode)
  return raw === 'quality_keyframes' ? 'quality_keyframes' : 'fast_panels'
}

function resolveCinematicV2QualityShotIds(input: {
  config: LooseRecord
  run: CinematicV2DynamicShotFanoutMaterializerInput['run']
  helpers: Pick<CinematicV2DynamicShotFanoutMaterializerHelpers, 'asRecord' | 'readStringArray'>
}) {
  const runInput = input.helpers.asRecord(input.run.input)
  const runMetadata = input.helpers.asRecord(input.run.metadata)
  return uniqueStrings([
    ...input.helpers.readStringArray(runInput.cinematicV2QualityShotIds),
    ...input.helpers.readStringArray(runMetadata.cinematicV2QualityShotIds),
    ...input.helpers.readStringArray(input.config.cinematicV2QualityShotIds),
  ])
}

export async function materializeDynamicCinematicV2ShotFanoutRuntime(
  input: CinematicV2DynamicShotFanoutMaterializerInput,
  helpers: CinematicV2DynamicShotFanoutMaterializerHelpers,
) {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.compileOutputs.shotPlan ?? input.compileOutputs.shot_plan)
  const sceneState = cinematicV2SceneStateSchema.parse(input.compileOutputs.sceneState ?? input.compileOutputs.scene_state)
  const layoutPlan = cinematicV2SceneLayoutPlanSchema.parse(input.compileOutputs.layoutPlan ?? input.compileOutputs.layout_plan)
  const parsedScript = cinematicV2ParsedScriptSchema.parse(input.compileOutputs.parsedScript ?? input.compileOutputs.parsed_script)
  const storyboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.safeParse(input.compileOutputs.storyboardGroupPlan ?? input.compileOutputs.storyboard_group_plan).success
    ? cinematicV2StoryboardGroupPlanSchema.parse(input.compileOutputs.storyboardGroupPlan ?? input.compileOutputs.storyboard_group_plan)
    : buildCinematicV2StoryboardGroupPlan(shotPlan)
  const screenplayDraft = cinematicV2ScreenplayDraftSchema.safeParse(input.compileOutputs.screenplayDraft ?? input.compileOutputs.screenplay_draft).success
    ? cinematicV2ScreenplayDraftSchema.parse(input.compileOutputs.screenplayDraft ?? input.compileOutputs.screenplay_draft)
    : null
  const referencePlan = cinematicV2ReferencePlanSchema.safeParse(input.compileOutputs.cinematicReferencePlan ?? input.compileOutputs.cinematic_reference_plan).success
    ? cinematicV2ReferencePlanSchema.parse(input.compileOutputs.cinematicReferencePlan ?? input.compileOutputs.cinematic_reference_plan)
    : null
  const aspectRatio = helpers.readText(input.config.aspectRatio) || '16:9'
  const resolution = helpers.readText(input.config.resolution) || '720p'
  const cinematicV2AnimaticMode = resolveCinematicV2AnimaticMode({ config: input.config, run: input.run, helpers })
  const useQualityKeyframes = cinematicV2AnimaticMode === 'quality_keyframes'
  const cinematicV2QualityShotIds = resolveCinematicV2QualityShotIds({ config: input.config, run: input.run, helpers })
  const cinematicV2QualityShotIdSet = new Set(cinematicV2QualityShotIds)
  const runMetadata = helpers.asRecord(input.run.metadata)
  const runInput = helpers.asRecord(input.run.input)
  const selectedShotMaterialization = helpers.readText(runMetadata.materializationMode) === 'selected_shots'
    || helpers.readText(runInput.materializationMode) === 'selected_shots'
  const shotUsesQualityKeyframe = (shot: CinematicV2Shot) => (
    useQualityKeyframes
    || cinematicV2QualityShotIdSet.has(shot.id)
    || cinematicV2QualityShotIdSet.has(String(shot.index))
    || cinematicV2QualityShotIdSet.has(String(shot.index).padStart(3, '0'))
  )
  const compileHash = helpers.readText(input.compileOutputs.compileHash) || helpers.hashOutputWorkflowValue({
    shotPlan,
    storyboardGroupPlan,
    sceneState,
    layoutPlan,
    parsedScript,
    screenplayDraft,
    referencePlan,
    cinematicV2AnimaticMode,
    cinematicV2QualityShotIds: cinematicV2QualityShotIds.slice().sort(),
  })
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration === true
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = helpers.readText(input.config.videoModel)
    || helpers.readText(input.config.model)
    || outputWorkflowDefaultVideoModel(videoProvider, resolution)
  const generatedByNodeKey = 'cinematic_v2_dynamic_shot_fanout'

  const allWorkflowNodes = await helpers.loadWorkflowNodes({ client: input.client, workflowId: input.workflow.id })
  const allExistingDynamicNodes = allWorkflowNodes
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !helpers.isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [helpers.readText(row.key), row]))
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
    && existingDynamicNodes.some((row) => helpers.readText(row.key) === 'cinematic_v2_timeline_assemble')
    && storyboardGroupPlan.groups.every((group) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `${group.id}_sheet`))
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_asset_pack`))
    && shotPlan.shots.every((shot) => {
      const keyframeNode = existingDynamicNodes.find((row) => helpers.readText(row.key) === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_keyframe`)
      const keyframePurpose = helpers.readText(helpers.asRecord(keyframeNode?.config).purpose)
      return shotUsesQualityKeyframe(shot)
        ? keyframePurpose === 'cinematic_v2_shot_keyframe'
        : keyframePurpose === 'cinematic_v2_shot_keyframe_passthrough'
    })
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_keyframe_qa`))
    && shotPlan.shots.every((shot) => existingDynamicNodes.some((row) => helpers.readText(row.key) === `cinematic_v2_shot_${String(shot.index).padStart(3, '0')}_video`))
  if (existingSameHash) return { expanded: false, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }

  const existingEdges = await helpers.loadWorkflowEdges({ client: input.client, workflowId: input.workflow.id })
  const dynamicEdgeKeys = existingEdges
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
    .map((row) => helpers.readText(row.key))
  const nodeRows: LooseRecord[] = []
  const edgeRows: LooseRecord[] = []
  const preserveNodeRow = (row: LooseRecord) => {
    const key = helpers.readText(row.key)
    const existingNode = existingDynamicNodeByKey.get(key)
    const nextPurpose = helpers.readText(helpers.asRecord(row.config).purpose)
    const existingPurpose = helpers.readText(helpers.asRecord(existingNode?.config).purpose)
    const selectedShotKeyframeNode = shotPlan.shots.some((shot, index) => {
      if (!shotUsesQualityKeyframe(shot)) return false
      const suffix = String(shot.index || index + 1).padStart(3, '0')
      const baseKey = `cinematic_v2_shot_${suffix}`
      return key === `${baseKey}_keyframe_prompt`
        || key === `${baseKey}_keyframe`
        || key === `${baseKey}_keyframe_qa`
    })
    return helpers.preserveExistingDynamicNodeOutput({
      nextRow: row,
      existingNode,
      compileHash,
      preserve: selectedShotMaterialization
        && !selectedShotKeyframeNode
        && Boolean(existingNode)
        && helpers.readText(existingNode?.node_type) === helpers.readText(row.node_type)
        && existingPurpose === nextPurpose,
    })
  }
  const v2Node = (args: LooseRecord) => helpers.dynamicNodeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })
  const v2Edge = (args: LooseRecord) => helpers.dynamicEdgeRow({
    workflow: input.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })
  const existingNodeKeys = new Set(allWorkflowNodes.map((row) => helpers.readText(row.key)))
  const assetPackSourceNodeKey = existingNodeKeys.has('cinematic_v2_reference_select')
    ? 'cinematic_v2_reference_select'
    : 'cinematic_entities'
  const storyboardGroupByShotId = new Map<string, CinematicV2StoryboardGroupPlan['groups'][number]>()
  storyboardGroupPlan.groups.forEach((group) => {
    group.shotIds.forEach((shotId) => storyboardGroupByShotId.set(shotId, group))
  })

  storyboardGroupPlan.groups.forEach((group, index) => {
    const storyboardLayout = { rows: group.rows, columns: group.columns, panelCount: group.panelCount }
    const storyboardImageSize = storyboardImageSizeForLayout({ columns: group.columns, rows: group.rows, aspectRatio })
    const y = 80 + index * 170
    const promptKey = `${group.id}_prompt`
    const sheetKey = `${group.id}_sheet`
    const extractKey = `${group.id}_panel_extract`
    nodeRows.push(
      v2Node({ key: promptKey, nodeType: 'utility_transform', label: `Storyboard Group ${group.index} Prompt`, x: 1760, y, config: { purpose: 'cinematic_v2_storyboard_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', aspectRatio, storyboardGroup: group, storyboardLayout, planningOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_storyboard_prompts', maxConcurrency: 6 } } }),
      v2Node({ key: sheetKey, nodeType: 'image_generation', label: `Storyboard Group ${group.index} Sheet`, x: 2040, y, config: { purpose: 'cinematic_v2_storyboard_sheet', role: 'cinematic_v2_storyboard_sheet', cinematicPipelineVersion: 'v2_shot_orchestration', storyboardGroup: group, storyboardGroupId: group.id, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: CINEMATIC_STORYBOARD_IMAGE_QUALITY, outputFormat: 'webp', maxReferenceImages: 16, imageSize: storyboardImageSize, aspectRatio, storyboardLayout, planningOnly: true, planning_only: true, usedAsVideoReference: false, used_as_video_reference: false, skillKeys: ['cinematic_beat_sheet_planning', 'storyboard_panel_accuracy', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'storyboard_sheet', 'panel_grid', 'image_prompt', 'entity_reference', 'panel_accuracy'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v2_storyboard_sheets', maxConcurrency: Math.min(storyboardGroupPlan.groups.length, 8) } } }),
      v2Node({ key: extractKey, nodeType: 'utility_transform', label: `Extract Group ${group.index} Panels`, x: 2320, y, config: { purpose: 'cinematic_v2_panel_extract', cinematicPipelineVersion: 'v2_shot_orchestration', storyboardGroup: group, storyboardGroupId: group.id, storyboardLayout, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_panel_extract', maxConcurrency: 6 } } }),
    )
    edgeRows.push(
      v2Edge({ key: `shot_plan__${promptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'shot_plan' }),
      v2Edge({ key: `scene_state__${promptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'scene_state' }),
      v2Edge({ key: `layout_plan__${promptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: promptKey, targetPort: 'layout_plan' }),
      v2Edge({ key: `${assetPackSourceNodeKey}__${promptKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: promptKey, targetPort: 'asset_pack' }),
      v2Edge({ key: `skill_context__${promptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: promptKey, targetPort: 'guidance' }),
      v2Edge({ key: `${promptKey}__${sheetKey}`, sourceNodeKey: promptKey, sourcePort: 'text', targetNodeKey: sheetKey, targetPort: 'prompt' }),
      v2Edge({ key: `${assetPackSourceNodeKey}__${sheetKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: sheetKey, targetPort: 'references' }),
      v2Edge({ key: `skill_context__${sheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sheetKey, targetPort: 'guidance' }),
      v2Edge({ key: `${sheetKey}__${extractKey}`, sourceNodeKey: sheetKey, sourcePort: 'image', targetNodeKey: extractKey, targetPort: 'image' }),
      v2Edge({ key: `shot_plan__${extractKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: extractKey, targetPort: 'shot_plan' }),
    )
  })

  shotPlan.shots.forEach((shot, index) => {
    const suffix = String(shot.index || index + 1).padStart(3, '0')
    const baseKey = `cinematic_v2_shot_${suffix}`
    const y = 260 + index * 170
    const keyframePromptKey = `${baseKey}_keyframe_prompt`
    const keyframeKey = `${baseKey}_keyframe`
    const keyframeQaKey = `${baseKey}_keyframe_qa`
    const videoPromptKey = `${baseKey}_video_prompt`
    const videoKey = `${baseKey}_video`
    const shotAssetPackKey = `${baseKey}_asset_pack`
    const storyboardGroup = storyboardGroupByShotId.get(shot.id)
    const panelExtractKey = storyboardGroup ? `${storyboardGroup.id}_panel_extract` : 'cinematic_v2_panel_extract'
    const shotMeta = { shotId: shot.id, shotIndex: shot.index, storyboardGroupId: storyboardGroup?.id ?? null }
    const shotQualityKeyframe = shotUsesQualityKeyframe(shot)
    const shotAnimaticMode = shotQualityKeyframe ? 'quality_keyframes' : cinematicV2AnimaticMode
    nodeRows.push(
      v2Node({ key: shotAssetPackKey, nodeType: 'utility_transform', label: `Shot ${shot.index} References`, x: 2460, y, config: { purpose: 'cinematic_v2_shot_asset_pack', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, maxEntityCount: 6, maxAssetKeysPerEntity: 2, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_shot_asset_packs', maxConcurrency: 12 } } }),
      ...(shotQualityKeyframe
        ? [
          v2Node({ key: keyframePromptKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Keyframe Enhancement Prompt`, x: 2600, y, config: { purpose: 'cinematic_v2_keyframe_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode: shotAnimaticMode, shotId: shot.id, shotIndex: shot.index, aspectRatio, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_keyframe_prompts', maxConcurrency: 6 } } }),
          v2Node({ key: keyframeKey, nodeType: 'image_generation', label: `Shot ${shot.index} Enhanced Keyframe`, x: 2880, y, config: { purpose: 'cinematic_v2_shot_keyframe', role: 'cinematic_v2_shot_keyframe', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode: shotAnimaticMode, shotId: shot.id, shotIndex: shot.index, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'medium', outputFormat: 'webp', maxReferenceImages: 6, imageSize: { width: 1536, height: 864 }, aspectRatio, usedAsVideoReference: true, used_as_video_reference: true, skillKeys: ['cinematic_keyframe_prompting', 'cinematic_keyframe_reference_repair', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'keyframe', 'image_prompt', 'visual_only', 'entity_reference', 'reference_continuity', 'reference_repair'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_v2_shot_keyframes', maxConcurrency: Math.min(shotPlan.shots.length, 8) } } }),
        ]
        : [
          v2Node({ key: keyframeKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Panel Keyframe`, x: 2880, y, config: { purpose: 'cinematic_v2_shot_keyframe_passthrough', role: 'cinematic_v2_shot_keyframe', cinematicPipelineVersion: 'v2_shot_orchestration', cinematicV2AnimaticMode, shotId: shot.id, shotIndex: shot.index, aspectRatio, planningOnly: true, planning_only: true, usedAsVideoReference: true, used_as_video_reference: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_panel_keyframes', maxConcurrency: 12 } } }),
        ]),
      v2Node({ key: keyframeQaKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Keyframe QA`, x: 3020, y, config: { purpose: 'cinematic_v2_keyframe_qa', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, advisoryOnly: true, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_keyframe_qa', maxConcurrency: 12 } } }),
      v2Node({ key: videoPromptKey, nodeType: 'utility_transform', label: `Shot ${shot.index} Video Prompt`, x: 3160, y, config: { purpose: 'cinematic_v2_video_prompt', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, durationSeconds: shot.providerDurationSeconds, aspectRatio, resolution, generateAudio: false, execution: { resourceClass: 'utility', groupKey: 'cinematic_v2_video_prompts', maxConcurrency: 6 } } }),
      v2Node({ key: videoKey, nodeType: 'video_generation', label: `Shot ${shot.index} Video`, x: 3440, y, config: { purpose: 'cinematic_v2_shot_video', role: 'cinematic_v2_shot_video', cinematicPipelineVersion: 'v2_shot_orchestration', shotId: shot.id, shotIndex: shot.index, provider: videoProvider, videoProvider, model: videoModel, durationSeconds: shot.providerDurationSeconds, aspectRatio, resolution, generateAudio: false, cinematicReferenceMode: 'keyframes', assetPackReferenceLimit: 5, debugSkipVideoGeneration, syncMode: false, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'cinematic_shot_direction', 'provider_prompt_hygiene'], autoSkillTags: ['cinematic_v2', 'video_prompt', 'seedance', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_v2_videos', maxConcurrency: Math.min(shotPlan.shots.length, 8) } } }),
    )
    edgeRows.push(
      v2Edge({ key: `${assetPackSourceNodeKey}__${shotAssetPackKey}`, sourceNodeKey: assetPackSourceNodeKey, sourcePort: 'asset_pack', targetNodeKey: shotAssetPackKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${shotAssetPackKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: shotAssetPackKey, targetPort: 'shot_plan', metadata: shotMeta }),
      ...(shotQualityKeyframe
        ? [
          v2Edge({ key: `${panelExtractKey}__${keyframePromptKey}`, sourceNodeKey: panelExtractKey, sourcePort: 'panels', targetNodeKey: keyframePromptKey, targetPort: 'panels', metadata: shotMeta }),
          v2Edge({ key: `shot_plan__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'shot_plan', metadata: shotMeta }),
          v2Edge({ key: `scene_state__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'scene_state', metadata: shotMeta }),
          v2Edge({ key: `layout_plan__${keyframePromptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: keyframePromptKey, targetPort: 'layout_plan', metadata: shotMeta }),
          v2Edge({ key: `${shotAssetPackKey}__${keyframePromptKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframePromptKey, targetPort: 'asset_pack', metadata: shotMeta }),
          v2Edge({ key: `${keyframePromptKey}__${keyframeKey}_prompt`, sourceNodeKey: keyframePromptKey, sourcePort: 'text', targetNodeKey: keyframeKey, targetPort: 'prompt', metadata: shotMeta }),
          v2Edge({ key: `${keyframePromptKey}__${keyframeKey}_panel`, sourceNodeKey: keyframePromptKey, sourcePort: 'image', targetNodeKey: keyframeKey, targetPort: 'references', metadata: shotMeta }),
        ]
        : [
          v2Edge({ key: `${panelExtractKey}__${keyframeKey}_panel`, sourceNodeKey: panelExtractKey, sourcePort: 'image', targetNodeKey: keyframeKey, targetPort: 'image', metadata: shotMeta }),
          v2Edge({ key: `${panelExtractKey}__${keyframeKey}_panels`, sourceNodeKey: panelExtractKey, sourcePort: 'panels', targetNodeKey: keyframeKey, targetPort: 'panels', metadata: shotMeta }),
          v2Edge({ key: `shot_plan__${keyframeKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframeKey, targetPort: 'shot_plan', metadata: shotMeta }),
        ]),
      v2Edge({ key: `${shotAssetPackKey}__${keyframeKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframeKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `skill_context__${keyframeKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframeKey, targetPort: 'guidance', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${keyframeQaKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: keyframeQaKey, targetPort: 'image', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${keyframeQaKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: keyframeQaKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${keyframeQaKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: keyframeQaKey, targetPort: 'shot_plan', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${videoPromptKey}_image`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `shot_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'shot_plan', metadata: shotMeta }),
      v2Edge({ key: `scene_state__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_scene_compile', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'scene_state', metadata: shotMeta }),
      v2Edge({ key: `layout_plan__${videoPromptKey}`, sourceNodeKey: 'cinematic_v2_layout_plan', sourcePort: 'text', targetNodeKey: videoPromptKey, targetPort: 'layout_plan', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${videoPromptKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack', metadata: shotMeta }),
      v2Edge({ key: `${videoPromptKey}__${videoKey}_prompt`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt', metadata: shotMeta }),
      v2Edge({ key: `${keyframeKey}__${videoKey}_reference`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', metadata: shotMeta }),
      v2Edge({ key: `${shotAssetPackKey}__${videoKey}`, sourceNodeKey: shotAssetPackKey, sourcePort: 'asset_pack', targetNodeKey: videoKey, targetPort: 'references', metadata: { ...shotMeta, optional: true, optionalDependency: true } }),
      v2Edge({ key: `${videoKey}__timeline`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'cinematic_v2_timeline_assemble', targetPort: 'videos', metadata: shotMeta }),
    )
  })

  nodeRows.push(
    v2Node({ key: 'cinematic_v2_timeline_assemble', nodeType: 'utility_transform', label: 'V2 Assemble Timeline', x: 3720, y: 120, config: { purpose: 'cinematic_v2_timeline_assemble', role: 'cinematic_v2_final_timeline', cinematicPipelineVersion: 'v2_shot_orchestration', dynamicShotCount: shotPlan.shots.length, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'cinematic_v2_timeline_assemble', maxConcurrency: 1 } } }),
    v2Node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register V2 Cinematic', x: 4000, y: 120, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', cinematicPipelineVersion: 'v2_shot_orchestration', execution: { resourceClass: 'utility' } } }),
  )
  edgeRows.push(
    v2Edge({ key: 'shot_plan__timeline', sourceNodeKey: 'cinematic_v2_shot_plan', sourcePort: 'text', targetNodeKey: 'cinematic_v2_timeline_assemble', targetPort: 'shot_plan' }),
    v2Edge({ key: 'timeline__artifact', sourceNodeKey: 'cinematic_v2_timeline_assemble', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input' }),
  )

  await helpers.persistDynamicWorkflowGraphRevision({
    client: input.client,
    workflow: input.workflow,
    nodeRows: nodeRows.map(preserveNodeRow),
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'dynamic_fanout_rematerialized',
    workflowMetadataPatch: {
      cinematicPipelineVersion: 'v2_shot_orchestration',
      cinematicV2ScreenplayDraft: screenplayDraft,
      cinematicV2ParsedScript: parsedScript,
      cinematicV2SceneState: sceneState,
      cinematicV2LayoutPlan: layoutPlan,
      cinematicV2ShotPlan: shotPlan,
      cinematicV2StoryboardGroupPlan: storyboardGroupPlan,
      cinematicV2QualityShotIds,
      dynamicShotCount: shotPlan.shots.length,
      storyboardSheetCount: storyboardGroupPlan.groups.length,
      totalDurationSeconds: shotPlan.totalEditorialDurationSeconds,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: `${compileHash}:${nodeRows.length}:${edgeRows.length}`,
    },
  })
  return { expanded: true, compileHash, shotCount: shotPlan.shots.length, storyboardSheetCount: storyboardGroupPlan.groups.length }
}
