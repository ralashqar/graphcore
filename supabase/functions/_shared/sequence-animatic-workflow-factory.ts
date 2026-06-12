export const sequenceAnimaticGraphSpecVersion = 'sequence_animatic_graph_v1'
export const sequenceAnimaticGraphSpecVersionV2 = 'sequence_animatic_graph_v2'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((entry) => asRecord(entry)) : []
}

type ContinuityWorkflowBlock = {
  id: string
  index: number
  title: string
  shotIds: string[]
  sourceText: string
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function sequenceAnimaticStableHash(value: unknown) {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function sequenceAnimaticStoryboardImageSize(columns: number, rows: number, aspectRatio: string) {
  const cellWidth = aspectRatio === '9:16' || aspectRatio === '3:4' ? 864 : 960
  const cellHeight = aspectRatio === '9:16' ? 1536 : aspectRatio === '1:1' ? 1024 : 540
  return {
    width: Math.max(1024, Math.min(4096, columns * cellWidth)),
    height: Math.max(1024, Math.min(4096, rows * cellHeight)),
  }
}

export function providerSafeSequenceAnimaticVideoDurationSeconds(value: unknown) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return 5
  if (seconds <= 5) return 5
  if (seconds <= 10) return 10
  return 15
}

export function sequenceAnimaticWorkflowNode(
  workflowId: string,
  draftId: string,
  key: string,
  nodeType: string,
  label: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  sequenceAnimaticRole = 'storyboard_block',
) {
  return {
    workflow_id: workflowId,
    draft_id: draftId,
    key,
    node_type: nodeType,
    label,
    position: { x, y },
    config,
    inputs,
    outputs: {},
    dirty: true,
    input_hash: '',
    output_hash: '',
    metadata: {
      sequenceAnimaticGenerated: true,
      graphSpecVersion: typeof config.graphSpecVersion === 'string' ? config.graphSpecVersion : sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: typeof config.screenplayAnimaticRole === 'string' ? config.screenplayAnimaticRole : sequenceAnimaticRole,
      screenplayAnimaticSource: typeof config.screenplayAnimaticSource === 'string' ? config.screenplayAnimaticSource : null,
      sequenceAnimaticRole,
      manifestHash: typeof config.manifestHash === 'string' ? config.manifestHash : null,
      blockHash: typeof config.blockHash === 'string' ? config.blockHash : null,
      masterManifestArtifactKey: typeof config.masterManifestArtifactKey === 'string' ? config.masterManifestArtifactKey : null,
    },
  }
}

export function sequenceAnimaticWorkflowEdge(
  workflowId: string,
  draftId: string,
  key: string,
  sourceNodeKey: string,
  sourcePort: string,
  targetNodeKey: string,
  targetPort: string,
  metadata: Record<string, unknown> = {},
  sequenceAnimaticRole = 'storyboard_block',
) {
  return {
    workflow_id: workflowId,
    draft_id: draftId,
    key,
    source_node_key: sourceNodeKey,
    source_port: sourcePort,
    target_node_key: targetNodeKey,
    target_port: targetPort,
    metadata: {
      sequenceAnimaticGenerated: true,
      graphSpecVersion: typeof metadata.graphSpecVersion === 'string' ? metadata.graphSpecVersion : sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: sequenceAnimaticRole,
      screenplayAnimaticSource: typeof metadata.screenplayAnimaticSource === 'string' ? metadata.screenplayAnimaticSource : null,
      sequenceAnimaticRole,
      ...metadata,
    },
  }
}

/**
 * Per-scene shot-plan child workflow: a self-contained "mini animatic" for one
 * screenplay scene. The scene streams its own shot continuity plan, normalizes
 * it through the (single-entry) scene plan merge, and registers its own
 * director-plan and manifest artifacts — no cross-scene merge exists by design;
 * the combined animatic is simply the ordered list of scene children.
 */
export function buildSequenceAnimaticSceneWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  sceneId: string
  sceneIndex: number
  sceneTitle: string
  scenePackageOutput: Record<string, unknown>
  screenplayText: string
  assetPack: Record<string, unknown>
  context: Record<string, unknown>
  guidance: Record<string, unknown>
  maxShotCount: number
  aspectRatio: string
  resolution: string
}) {
  const role = 'scene_shot_plan'
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersionV2,
    cinematicPipelineVersion: 'v3_script_storyboards',
    ...input.commonConfig,
    sceneId: input.sceneId,
    sceneIndex: input.sceneIndex,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
  }
  const shotPlanNodeKey = `sequence_animatic_scene_shot_plan_${input.sceneId}`
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'scene_input', 'utility_transform', `Scene ${input.sceneIndex} Input`, 80, 120, {
      ...config,
      purpose: 'sequence_animatic_scene_input',
      // Neutral key names on purpose: config.guidance/skillKeys are interpreted as
      // the node's own skill assignment by graph validation, and the master's
      // guidance bundle carries LLM-node skills that do not apply to a utility node.
      scenePackage: input.scenePackageOutput,
      sceneScreenplayText: input.screenplayText,
      sceneAssetPack: input.assetPack,
      sceneContext: input.context,
      sceneGuidance: input.guidance,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_input', maxConcurrency: 1 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, shotPlanNodeKey, 'utility_transform', `Scene ${input.sceneIndex} Shot Plan`, 360, 120, {
      ...config,
      purpose: 'sequence_animatic_scene_shot_plan',
      role: 'sequence_animatic_scene_shot_plan',
      maxShotCount: input.maxShotCount,
      execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_scene_shot_plan', maxConcurrency: 1 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'sequence_animatic_scene_plan_merge', 'utility_transform', 'Normalize Scene Shot Plan', 640, 120, {
      ...config,
      purpose: 'sequence_animatic_scene_plan_merge',
      role: 'sequence_animatic_director_plan',
      maxShotCount: input.maxShotCount,
      // Keep scene-scoped shot/block ids (scene_001_shot_001) instead of remapping
      // to shot_001: ids stay globally unique across sibling scenes and match the
      // streamed events the UI accumulated.
      preserveSceneScopedIds: true,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_plan_merge', maxConcurrency: 1 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'sequence_animatic_director_plan_artifact', 'output_artifact', 'Register Scene Shot Plan', 920, 120, {
      ...config,
      purpose: 'sequence_animatic_director_plan_artifact',
      artifactKind: 'other',
      execution: { resourceClass: 'utility' },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'sequence_animatic_manifest', 'utility_transform', 'Build Scene Manifest', 1200, 120, {
      ...config,
      purpose: 'sequence_animatic_manifest',
      role: 'sequence_animatic_manifest',
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_manifest', maxConcurrency: 1 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'artifact', 'output_artifact', 'Register Scene Manifest', 1480, 120, {
      ...config,
      purpose: 'sequence_animatic_manifest_artifact',
      artifactKind: 'other',
      execution: { resourceClass: 'utility' },
    }, {}, role),
  ]
  const edge = (key: string, sourceNodeKey: string, sourcePort: string, targetNodeKey: string, targetPort: string) =>
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, key, sourceNodeKey, sourcePort, targetNodeKey, targetPort, { graphSpecVersion: sequenceAnimaticGraphSpecVersionV2 }, role)
  const edges = [
    edge('scene_input__shot_plan_scene_package', 'scene_input', 'scene_package', shotPlanNodeKey, 'scene_package'),
    edge('scene_input__shot_plan_screenplay', 'scene_input', 'screenplay', shotPlanNodeKey, 'screenplay'),
    edge('scene_input__shot_plan_context', 'scene_input', 'context', shotPlanNodeKey, 'context'),
    edge('scene_input__shot_plan_guidance', 'scene_input', 'guidance', shotPlanNodeKey, 'guidance'),
    edge('scene_input__shot_plan_asset_pack', 'scene_input', 'asset_pack', shotPlanNodeKey, 'asset_pack'),
    edge('shot_plan__scene_plan_merge', shotPlanNodeKey, 'scene_plan', 'sequence_animatic_scene_plan_merge', 'scene_plan'),
    edge('scene_input__merge_scene_package', 'scene_input', 'scene_package', 'sequence_animatic_scene_plan_merge', 'scene_package'),
    edge('scene_input__merge_screenplay', 'scene_input', 'screenplay', 'sequence_animatic_scene_plan_merge', 'screenplay'),
    edge('scene_input__merge_asset_pack', 'scene_input', 'asset_pack', 'sequence_animatic_scene_plan_merge', 'asset_pack'),
    edge('scene_input__merge_context', 'scene_input', 'context', 'sequence_animatic_scene_plan_merge', 'context'),
    edge('scene_plan_merge__director_plan_artifact', 'sequence_animatic_scene_plan_merge', 'director_plan', 'sequence_animatic_director_plan_artifact', 'director_plan'),
    edge('scene_plan_merge__manifest', 'sequence_animatic_scene_plan_merge', 'director_plan', 'sequence_animatic_manifest', 'director_plan'),
    edge('scene_input__manifest_screenplay', 'scene_input', 'screenplay', 'sequence_animatic_manifest', 'screenplay'),
    edge('scene_input__manifest_asset_pack', 'scene_input', 'asset_pack', 'sequence_animatic_manifest', 'asset_pack'),
    edge('scene_input__manifest_context', 'scene_input', 'context', 'sequence_animatic_manifest', 'context'),
    edge('manifest__artifact', 'sequence_animatic_manifest', 'manifest', 'artifact', 'input'),
  ]
  return { nodes, edges, shotPlanNodeKey }
}

export function buildSequenceAnimaticBlockWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  block: Record<string, unknown>
  manifestSummary: Record<string, unknown>
  shotPlan: Record<string, unknown>
  storyboardGroup: Record<string, unknown>
  storyboardLayout: { rows: number; columns: number; panelCount: number }
  assetPack: Record<string, unknown>
  aspectRatio: string
  imageSize: { width: number; height: number }
  durationSeconds: number
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'block_input', 'utility_transform', 'Block Input', 80, 100, {
      purpose: 'sequence_animatic_block_input',
      ...config,
      block: input.block,
      manifestSummary: input.manifestSummary,
      shotPlan: input.shotPlan,
      storyboardGroup: input.storyboardGroup,
      storyboardLayout: input.storyboardLayout,
      assetPack: input.assetPack,
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'storyboard_prompt', 'utility_transform', 'Storyboard Prompt', 360, 100, {
      purpose: 'cinematic_v3_storyboard_prompt',
      ...config,
      aspectRatio: input.aspectRatio,
      storyboardGroup: input.storyboardGroup,
      storyboardLayout: input.storyboardLayout,
      planningOnly: true,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_prompt', maxConcurrency: 1 },
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'storyboard_sheet', 'image_generation', 'Storyboard Sheet', 640, 100, {
      purpose: 'cinematic_v3_storyboard_sheet',
      role: 'cinematic_v3_storyboard_sheet',
      ...config,
      storyboardGroup: input.storyboardGroup,
      storyboardGroupId: input.commonConfig.storyboardBlockId,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'high',
      outputFormat: 'webp',
      maxReferenceImages: 16,
      imageSize: input.imageSize,
      aspectRatio: input.aspectRatio,
      storyboardLayout: input.storyboardLayout,
      planningOnly: true,
      planning_only: true,
      usedAsVideoReference: true,
      used_as_video_reference: true,
      execution: { resourceClass: 'image', groupKey: `sequence_animatic_block_${String(input.commonConfig.storyboardBlockId ?? 'block').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, maxConcurrency: 1 },
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'panel_extract', 'utility_transform', 'Extract Panels', 920, 100, {
      purpose: 'cinematic_v3_panel_extract',
      ...config,
      storyboardGroup: input.storyboardGroup,
      storyboardGroupId: input.commonConfig.storyboardBlockId,
      storyboardLayout: input.storyboardLayout,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_extract', maxConcurrency: 1 },
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'video_prompt', 'utility_transform', 'Video Prompt', 1200, 100, {
      purpose: 'cinematic_v3_storyboard_group_video_prompt',
      ...config,
      storyboardGroup: input.storyboardGroup,
      storyboardGroupId: input.commonConfig.storyboardBlockId,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: '720p',
      generateAudio: false,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_video_prompt', maxConcurrency: 1 },
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'video', 'video_generation', 'Video', 1480, 100, {
      purpose: 'cinematic_v3_storyboard_group_video',
      role: 'cinematic_v3_storyboard_group_video',
      ...config,
      storyboardGroup: input.storyboardGroup,
      storyboardGroupId: input.commonConfig.storyboardBlockId,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: '720p',
      generateAudio: false,
      cinematicReferenceMode: 'storyboard_sheet',
      debugSkipVideoGeneration: true,
      manualOnly: true,
      manual_only: true,
      execution: { resourceClass: 'video', groupKey: 'sequence_animatic_block_video', maxConcurrency: 1, manualOnly: true },
    }),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'artifact', 'output_artifact', 'Register Block', 1760, 100, {
      purpose: 'sequence_animatic_block_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility' },
    }),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__prompt_plan', 'block_input', 'text', 'storyboard_prompt', 'shot_plan'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__prompt_refs', 'block_input', 'asset_pack', 'storyboard_prompt', 'asset_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__sheet', 'storyboard_prompt', 'text', 'storyboard_sheet', 'prompt'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__sheet_refs', 'block_input', 'asset_pack', 'storyboard_sheet', 'references'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'sheet__extract', 'storyboard_sheet', 'image', 'panel_extract', 'image'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__extract_plan', 'block_input', 'text', 'panel_extract', 'shot_plan'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__video_prompt_plan', 'block_input', 'text', 'video_prompt', 'shot_plan'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'block__video_prompt_refs', 'block_input', 'asset_pack', 'video_prompt', 'asset_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'sheet__video_prompt_refs', 'storyboard_sheet', 'image', 'video_prompt', 'references'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'video_prompt__video', 'video_prompt', 'text', 'video', 'prompt'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'sheet__video_refs', 'storyboard_sheet', 'image', 'video', 'references'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'video_prompt__artifact', 'video_prompt', 'text', 'artifact', 'input'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'panels__artifact', 'panel_extract', 'panels', 'artifact', 'panels', { optional: true, optionalDependency: true }),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticShotVideoWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  block: Record<string, unknown>
  shot: Record<string, unknown>
  panel: Record<string, unknown>
  assetPack: Record<string, unknown>
  editorialDurationSeconds: number
  providerDurationSeconds: number
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_input', 'utility_transform', 'Shot Input', 80, 100, {
      purpose: 'sequence_animatic_shot_input',
      ...config,
      block: input.block,
      shot: input.shot,
      panel: input.panel,
      assetPack: input.assetPack,
      editorialDurationSeconds: input.editorialDurationSeconds,
      providerDurationSeconds: input.providerDurationSeconds,
      aspectRatio: input.aspectRatio,
    }, {}, 'shot_video'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_video_prompt', 'utility_transform', 'Shot Video Prompt', 360, 100, {
      purpose: 'sequence_animatic_shot_video_prompt',
      ...config,
      editorialDurationSeconds: input.editorialDurationSeconds,
      providerDurationSeconds: input.providerDurationSeconds,
      durationSeconds: input.providerDurationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: '720p',
      generateAudio: false,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_shot_video_prompt', maxConcurrency: 4 },
    }, {}, 'shot_video'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_video', 'video_generation', 'Shot Video', 640, 100, {
      purpose: 'sequence_animatic_shot_video',
      role: 'sequence_animatic_shot_video',
      ...config,
      editorialDurationSeconds: input.editorialDurationSeconds,
      providerDurationSeconds: input.providerDurationSeconds,
      durationSeconds: input.providerDurationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: '720p',
      quality: 'high',
      generateAudio: false,
      cinematicReferenceMode: 'keyframes',
      assetPackReferenceLimit: 6,
      debugSkipVideoGeneration: true,
      manualOnly: true,
      manual_only: true,
      execution: { resourceClass: 'video', groupKey: 'sequence_animatic_shot_video', maxConcurrency: 1, manualOnly: true },
    }, {}, 'shot_video'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_input__prompt_plan', 'shot_input', 'shot', 'shot_video_prompt', 'shot', {}, 'shot_video'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_input__prompt_refs', 'shot_input', 'asset_pack', 'shot_video_prompt', 'asset_pack', {}, 'shot_video'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_panel__prompt_refs', 'shot_input', 'image', 'shot_video_prompt', 'references', {}, 'shot_video'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_prompt__video', 'shot_video_prompt', 'text', 'shot_video', 'prompt', {}, 'shot_video'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_panel__video_refs', 'shot_input', 'image', 'shot_video', 'references', {}, 'shot_video'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'shot_input__video_refs', 'shot_input', 'asset_pack', 'shot_video', 'asset_pack', {}, 'shot_video'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticShotRevisionWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  block: Record<string, unknown>
  shot: Record<string, unknown>
  panel: Record<string, unknown>
  assetPack: Record<string, unknown>
  revisionPrompt: string
  revisionId: string
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_revision_input', 'utility_transform', 'Shot Revision Input', 80, 120, {
      purpose: 'sequence_animatic_shot_revision_input',
      ...config,
      block: input.block,
      shot: input.shot,
      panel: input.panel,
      assetPack: input.assetPack,
      revisionPrompt: input.revisionPrompt,
      revisionId: input.revisionId,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_shot_revision_input', maxConcurrency: 4 },
    }, {}, 'shot_revision'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_revision_plan', 'utility_transform', 'Revise Shot', 360, 120, {
      purpose: 'sequence_animatic_shot_revision_plan',
      ...config,
      revisionPrompt: input.revisionPrompt,
      revisionId: input.revisionId,
      execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_shot_revision_plan', maxConcurrency: 4 },
    }, {}, 'shot_revision'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_keyframe_prompt', 'utility_transform', 'Shot Keyframe Prompt', 640, 120, {
      purpose: 'sequence_animatic_shot_keyframe_prompt',
      ...config,
      revisionId: input.revisionId,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_shot_keyframe_prompt', maxConcurrency: 4 },
    }, {}, 'shot_revision'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_keyframe_image', 'image_generation', 'Shot Keyframe Image', 920, 120, {
      purpose: 'sequence_animatic_shot_keyframe_image',
      role: 'sequence_animatic_shot_keyframe',
      ...config,
      revisionId: input.revisionId,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'low',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: input.aspectRatio === '9:16'
        ? { width: 864, height: 1536 }
        : input.aspectRatio === '1:1'
          ? { width: 1024, height: 1024 }
          : { width: 1536, height: 864 },
      aspectRatio: input.aspectRatio,
      usedAsVideoReference: true,
      used_as_video_reference: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_shot_keyframes', maxConcurrency: 4 },
    }, {}, 'shot_revision'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'shot_revision_artifact', 'output_artifact', 'Register Shot Revision', 1200, 120, {
      purpose: 'sequence_animatic_shot_revision_artifact',
      artifactKind: 'other',
      ...config,
      revisionPrompt: input.revisionPrompt,
      revisionId: input.revisionId,
      execution: { resourceClass: 'utility' },
    }, {}, 'shot_revision'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_shot', 'shot_revision_input', 'shot', 'shot_revision_plan', 'shot', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_prompt', 'shot_revision_input', 'revision_prompt', 'shot_revision_plan', 'revision_prompt', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_base', 'shot_revision_input', 'base_keyframe', 'shot_keyframe_prompt', 'base_keyframe', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'shot_revision_input', 'asset_pack', 'shot_keyframe_prompt', 'asset_pack', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__prompt_shot', 'shot_revision_plan', 'revised_shot', 'shot_keyframe_prompt', 'revised_shot', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'shot_keyframe_prompt', 'text', 'shot_keyframe_image', 'prompt', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__image_base', 'shot_revision_input', 'base_keyframe', 'shot_keyframe_image', 'references', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'shot_keyframe_prompt', 'asset_pack', 'shot_keyframe_image', 'asset_pack', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__artifact', 'shot_revision_plan', 'revised_shot', 'shot_revision_artifact', 'revised_shot', {}, 'shot_revision'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__artifact', 'shot_keyframe_image', 'image', 'shot_revision_artifact', 'keyframe', { optional: true, optionalDependency: true }, 'shot_revision'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticContinuityAssetWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  continuityPack: Record<string, unknown>
  targetNode: Record<string, unknown>
  targetNodeId: string
  assetKind: string
  relevantShots: Record<string, unknown>[]
  shotBindings: Record<string, unknown>
  assetPack: Record<string, unknown>
  referenceAssetKeys: string[]
  visualDependencyEdges: Record<string, unknown>[]
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    continuityPack: input.continuityPack,
    targetNode: input.targetNode,
    targetNodeId: input.targetNodeId,
    assetKind: input.assetKind,
    relevantShots: input.relevantShots,
    shotBindings: input.shotBindings,
    assetPack: input.assetPack,
    referenceAssetKeys: input.referenceAssetKeys,
    visualDependencyEdges: input.visualDependencyEdges,
    aspectRatio: input.aspectRatio,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_asset_input', 'utility_transform', 'Continuity Asset Input', 80, 120, {
      purpose: 'sequence_animatic_continuity_asset_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_asset_input', maxConcurrency: 4 },
    }, {}, 'continuity_asset'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_asset_prompt', 'utility_transform', 'Continuity Asset Prompt', 360, 120, {
      purpose: 'sequence_animatic_continuity_asset_prompt',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_asset_prompt', maxConcurrency: 4 },
    }, {}, 'continuity_asset'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_asset_image', 'image_generation', 'Continuity Asset Image', 640, 120, {
      purpose: 'sequence_animatic_continuity_asset_image',
      role: 'sequence_animatic_continuity_asset_image',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'low',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: { width: 1536, height: 1536 },
      planningOnly: false,
      planning_only: false,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_continuity_asset_image', maxConcurrency: 2, continueOnError: true },
    }, {}, 'continuity_asset'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_asset_artifact', 'output_artifact', 'Register Continuity Asset', 920, 120, {
      purpose: 'sequence_animatic_continuity_asset_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_asset_artifact', maxConcurrency: 4 },
    }, {}, 'continuity_asset'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_target', 'continuity_asset_input', 'target_node', 'continuity_asset_prompt', 'target_node', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_pack', 'continuity_asset_input', 'continuity_pack', 'continuity_asset_prompt', 'continuity_pack', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_shots', 'continuity_asset_input', 'relevant_shots', 'continuity_asset_prompt', 'relevant_shots', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'continuity_asset_input', 'asset_pack', 'continuity_asset_prompt', 'asset_pack', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'continuity_asset_prompt', 'text', 'continuity_asset_image', 'prompt', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'continuity_asset_prompt', 'asset_pack', 'continuity_asset_image', 'asset_pack', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_target', 'continuity_asset_input', 'target_node', 'continuity_asset_artifact', 'target_node', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__artifact_prompt', 'continuity_asset_prompt', 'text', 'continuity_asset_artifact', 'prompt', {}, 'continuity_asset'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__artifact', 'continuity_asset_image', 'image', 'continuity_asset_artifact', 'image', { optional: true, optionalDependency: true }, 'continuity_asset'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticCoverageAnchorWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  coverageSetup: Record<string, unknown>
  shots: Record<string, unknown>[]
  assetPack: Record<string, unknown>
  referenceAssetKeys: string[]
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    coverageSetup: input.coverageSetup,
    coverage_setup: input.coverageSetup,
    shots: input.shots,
    assetPack: input.assetPack,
    asset_pack: input.assetPack,
    referenceAssetKeys: input.referenceAssetKeys,
    reference_asset_keys: input.referenceAssetKeys,
    aspectRatio: input.aspectRatio,
  }
  const imageSize = input.aspectRatio === '9:16'
    ? { width: 864, height: 1536 }
    : input.aspectRatio === '1:1'
      ? { width: 1024, height: 1024 }
      : { width: 1536, height: 864 }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_anchor_input', 'utility_transform', 'Coverage Anchor Input', 80, 120, {
      purpose: 'sequence_animatic_coverage_anchor_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_coverage_anchor_input', maxConcurrency: 4 },
    }, {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_anchor_prompt', 'utility_transform', 'Coverage Anchor Prompt', 360, 120, {
      purpose: 'sequence_animatic_coverage_anchor_prompt',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_coverage_anchor_prompt', maxConcurrency: 4 },
    }, {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_anchor_image', 'image_generation', 'Coverage Anchor Image', 640, 120, {
      purpose: 'sequence_animatic_coverage_anchor_image',
      role: 'sequence_animatic_coverage_anchor_image',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize,
      aspectRatio: input.aspectRatio,
      usedAsVideoReference: true,
      used_as_video_reference: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_coverage_anchors', maxConcurrency: 2 },
    }, {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_anchor_artifact', 'output_artifact', 'Register Coverage Anchor', 920, 120, {
      purpose: 'sequence_animatic_coverage_anchor_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_coverage_anchor_artifact', maxConcurrency: 4 },
    }, {}, 'coverage_anchor'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_setup', 'coverage_anchor_input', 'coverage_setup', 'coverage_anchor_prompt', 'coverage_setup', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_shots', 'coverage_anchor_input', 'shots', 'coverage_anchor_prompt', 'shots', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'coverage_anchor_input', 'asset_pack', 'coverage_anchor_prompt', 'asset_pack', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'coverage_anchor_prompt', 'text', 'coverage_anchor_image', 'prompt', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'coverage_anchor_prompt', 'asset_pack', 'coverage_anchor_image', 'asset_pack', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_setup', 'coverage_anchor_input', 'coverage_setup', 'coverage_anchor_artifact', 'coverage_setup', {}, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__artifact', 'coverage_anchor_image', 'image', 'coverage_anchor_artifact', 'image', { optional: true, optionalDependency: true }, 'coverage_anchor'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__artifact_prompt', 'coverage_anchor_prompt', 'text', 'coverage_anchor_artifact', 'prompt', {}, 'coverage_anchor'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticPlannedKeyframeWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  block: Record<string, unknown>
  shot: Record<string, unknown>
  coverageSetup: Record<string, unknown>
  coverageAnchor: Record<string, unknown>
  previousKeyframe: Record<string, unknown>
  storyboardPanel: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    block: input.block,
    shot: input.shot,
    coverageSetup: input.coverageSetup,
    coverage_setup: input.coverageSetup,
    coverageAnchor: input.coverageAnchor,
    coverage_anchor: input.coverageAnchor,
    previousKeyframe: input.previousKeyframe,
    previous_keyframe: input.previousKeyframe,
    storyboardPanel: input.storyboardPanel,
    storyboard_panel: input.storyboardPanel,
    assetPack: input.assetPack,
    asset_pack: input.assetPack,
    aspectRatio: input.aspectRatio,
  }
  const imageSize = input.aspectRatio === '9:16'
    ? { width: 864, height: 1536 }
    : input.aspectRatio === '1:1'
      ? { width: 1024, height: 1024 }
      : { width: 1536, height: 864 }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'planned_keyframe_input', 'utility_transform', 'Shot Keyframe Input', 80, 120, {
      purpose: 'sequence_animatic_planned_keyframe_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_planned_keyframe_input', maxConcurrency: 8 },
    }, {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'planned_keyframe_prompt', 'utility_transform', 'Shot Keyframe Prompt', 360, 120, {
      purpose: 'sequence_animatic_planned_keyframe_prompt',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_planned_keyframe_prompt', maxConcurrency: 8 },
    }, {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'planned_keyframe_image', 'image_generation', 'Shot Keyframe Image', 640, 120, {
      purpose: 'sequence_animatic_planned_keyframe_image',
      role: 'sequence_animatic_shot_keyframe',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize,
      aspectRatio: input.aspectRatio,
      usedAsVideoReference: true,
      used_as_video_reference: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_shot_keyframes', maxConcurrency: 3 },
    }, {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'planned_keyframe_artifact', 'output_artifact', 'Register Shot Keyframe', 920, 120, {
      purpose: 'sequence_animatic_planned_keyframe_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_planned_keyframe_artifact', maxConcurrency: 8 },
    }, {}, 'shot_keyframe'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_shot', 'planned_keyframe_input', 'shot', 'planned_keyframe_prompt', 'shot', {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_setup', 'planned_keyframe_input', 'coverage_setup', 'planned_keyframe_prompt', 'coverage_setup', { optional: true, optionalDependency: true }, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_anchor', 'planned_keyframe_input', 'coverage_anchor', 'planned_keyframe_prompt', 'coverage_anchor', { optional: true, optionalDependency: true }, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_previous', 'planned_keyframe_input', 'previous_keyframe', 'planned_keyframe_prompt', 'previous_keyframe', { optional: true, optionalDependency: true }, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_panel', 'planned_keyframe_input', 'storyboard_panel', 'planned_keyframe_prompt', 'storyboard_panel', { optional: true, optionalDependency: true }, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'planned_keyframe_input', 'asset_pack', 'planned_keyframe_prompt', 'asset_pack', {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'planned_keyframe_prompt', 'text', 'planned_keyframe_image', 'prompt', {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'planned_keyframe_prompt', 'asset_pack', 'planned_keyframe_image', 'asset_pack', {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_shot', 'planned_keyframe_input', 'shot', 'planned_keyframe_artifact', 'shot', {}, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__artifact', 'planned_keyframe_image', 'image', 'planned_keyframe_artifact', 'image', { optional: true, optionalDependency: true }, 'shot_keyframe'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__artifact_prompt', 'planned_keyframe_prompt', 'text', 'planned_keyframe_artifact', 'prompt', {}, 'shot_keyframe'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticContinuityBatchWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  batch: Record<string, unknown>
  targetNodes: Record<string, unknown>[]
  continuityGraphV2: Record<string, unknown>
  relevantShots: Record<string, unknown>[]
  shotBindings: Record<string, unknown>
  assetPack: Record<string, unknown>
  referenceAssetKeys: string[]
  visualDependencyEdges: Record<string, unknown>[]
  aspectRatio: string
}) {
  const layout = asRecord(input.batch.layout)
  const rows = Math.max(1, Number(layout.rows ?? 1) || 1)
  const columns = Math.max(1, Number(layout.columns ?? (input.targetNodes.length || 1)) || 1)
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    batch: input.batch,
    targetNodes: input.targetNodes,
    continuityGraphV2: input.continuityGraphV2,
    continuity_graph_v2: input.continuityGraphV2,
    relevantShots: input.relevantShots,
    shotBindings: input.shotBindings,
    assetPack: input.assetPack,
    referenceAssetKeys: input.referenceAssetKeys,
    visualDependencyEdges: input.visualDependencyEdges,
    aspectRatio: input.aspectRatio,
    gridLayout: { rows, columns, cellCount: Math.max(1, Number(layout.cellCount ?? input.targetNodes.length) || input.targetNodes.length || 1) },
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_batch_input', 'utility_transform', 'Continuity Batch Input', 80, 120, {
      purpose: 'sequence_animatic_continuity_batch_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_batch_input', maxConcurrency: 4 },
    }, {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_batch_prompt', 'utility_transform', 'Continuity Batch Prompt', 360, 120, {
      purpose: 'sequence_animatic_continuity_batch_prompt',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_batch_prompt', maxConcurrency: 4 },
    }, {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_batch_image', 'image_generation', 'Continuity Batch Image', 640, 120, {
      purpose: 'sequence_animatic_continuity_batch_image',
      role: 'sequence_animatic_continuity_batch_image',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: { width: 2048, height: 2048 },
      planningOnly: false,
      planning_only: false,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_continuity_batch_image', maxConcurrency: 2, continueOnError: true },
    }, {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_batch_extract', 'utility_transform', 'Extract Continuity Batch', 920, 120, {
      purpose: 'sequence_animatic_continuity_batch_extract',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_batch_extract', maxConcurrency: 4 },
    }, {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_batch_artifact', 'output_artifact', 'Register Continuity Batch', 1200, 120, {
      purpose: 'sequence_animatic_continuity_batch_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_batch_artifact', maxConcurrency: 4 },
    }, {}, 'continuity_asset_batch'),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_batch', 'continuity_batch_input', 'batch', 'continuity_batch_prompt', 'batch', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_targets', 'continuity_batch_input', 'target_nodes', 'continuity_batch_prompt', 'target_nodes', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'continuity_batch_input', 'asset_pack', 'continuity_batch_prompt', 'asset_pack', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'continuity_batch_prompt', 'text', 'continuity_batch_image', 'prompt', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'continuity_batch_prompt', 'asset_pack', 'continuity_batch_image', 'asset_pack', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__extract_batch', 'continuity_batch_input', 'batch', 'continuity_batch_extract', 'batch', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__extract_targets', 'continuity_batch_input', 'target_nodes', 'continuity_batch_extract', 'target_nodes', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__extract', 'continuity_batch_image', 'image', 'continuity_batch_extract', 'image', { optional: true, optionalDependency: true }, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__artifact_prompt', 'continuity_batch_prompt', 'text', 'continuity_batch_artifact', 'prompt', {}, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'extract__artifact_assets', 'continuity_batch_extract', 'assets', 'continuity_batch_artifact', 'assets', { optional: true, optionalDependency: true }, 'continuity_asset_batch'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_batch', 'continuity_batch_input', 'batch', 'continuity_batch_artifact', 'batch', {}, 'continuity_asset_batch'),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticContinuityWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  manifest: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
}) {
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
  }
  const manifestBlocks = readRecordArray(input.manifest.blocks).filter((block) => readText(block.id))
  const shotBreakGroups = readRecordArray(asRecord(input.manifest.shotBreakPlan).groups).filter((block) => readText(block.id))
  const continuityBlocks: ContinuityWorkflowBlock[] = (manifestBlocks.length > 0 ? manifestBlocks : shotBreakGroups)
    .map((block: Record<string, unknown>, index: number) => ({
      id: readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`,
      index: Number(block.index ?? index + 1) || index + 1,
      title: readText(block.title) || readText(block.summary) || `Storyboard block ${index + 1}`,
      shotIds: readStringArray(block.shotIds).length > 0 ? readStringArray(block.shotIds) : readStringArray(block.shotBreakIds),
      sourceText: readText(block.sourceText) || readText(block.screenplayExcerpt),
    }))
  const continuityBlockNodes = continuityBlocks.flatMap((block: ContinuityWorkflowBlock, index: number) => {
    const suffix = String(index + 1).padStart(3, '0')
    const y = 60 + index * 170
    return [
      sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, `continuity_block_${suffix}_plan`, 'utility_transform', `Plan Continuity Block ${index + 1}`, 640, y, {
        purpose: 'sequence_animatic_continuity_block_plan',
        ...config,
        storyboardBlock: block,
        storyboardBlockId: block.id,
        storyboardBlockIndex: block.index,
        aspectRatio: input.aspectRatio,
        execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_block_plan', maxConcurrency: 1, continueOnError: true },
      }, {}, 'continuity_pack'),
      sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, `continuity_block_${suffix}_merge`, 'utility_transform', `Merge Continuity Block ${index + 1}`, 920, y, {
        purpose: 'sequence_animatic_continuity_block_merge',
        ...config,
        storyboardBlock: block,
        storyboardBlockId: block.id,
        storyboardBlockIndex: block.index,
        aspectRatio: input.aspectRatio,
        execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_block_merge', maxConcurrency: 1 },
      }, {}, 'continuity_pack'),
      sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, `continuity_block_${suffix}_structure`, 'output_artifact', `Save Continuity Block ${index + 1}`, 1200, y, {
        purpose: 'sequence_animatic_continuity_structure_artifact',
        artifactKind: 'other',
        ...config,
        storyboardBlock: block,
        storyboardBlockId: block.id,
        storyboardBlockIndex: block.index,
        aspectRatio: input.aspectRatio,
        execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_structure_artifact', maxConcurrency: 1 },
      }, {}, 'continuity_pack'),
    ]
  })
  const latestContinuityGraphNodeKey = continuityBlocks.length > 0
    ? `continuity_block_${String(continuityBlocks.length).padStart(3, '0')}_merge`
    : 'continuity_global_merge'
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_input', 'utility_transform', 'Continuity Input', 80, 120, {
      purpose: 'sequence_animatic_continuity_input',
      ...config,
      manifest: input.manifest,
      assetPack: input.assetPack,
      animaticReferenceCatalog: Array.isArray(input.manifest.animaticReferenceCatalog) ? input.manifest.animaticReferenceCatalog : [],
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_input', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_seed_graph', 'utility_transform', 'Seed Scene Graph', 360, 120, {
      purpose: 'sequence_animatic_continuity_seed_graph',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_seed_graph', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_global_plan', 'utility_transform', 'Plan Global Structure', 640, -120, {
      purpose: 'sequence_animatic_continuity_global_plan',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_global_plan', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_global_merge', 'utility_transform', 'Merge Global Structure', 920, -120, {
      purpose: 'sequence_animatic_continuity_global_merge',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_global_merge', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_global_structure', 'output_artifact', 'Save Global Structure', 1200, -120, {
      purpose: 'sequence_animatic_continuity_structure_artifact',
      artifactKind: 'other',
      ...config,
      storyboardBlockId: 'global',
      storyboardBlockIndex: 0,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_structure_artifact', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    ...continuityBlockNodes,
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_graph_finalize', 'utility_transform', 'Finalize Scene Graph', 1200, 120, {
      purpose: 'sequence_animatic_continuity_graph_finalize',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_graph_finalize', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_plan', 'utility_transform', 'Plan Continuity', 1480, 120, {
      purpose: 'sequence_animatic_continuity_anchor_plan',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_continuity_plan', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'character_anchor_atlas_prompt', 'utility_transform', 'Character Atlas Prompt', 1760, -120, {
      purpose: 'sequence_animatic_character_anchor_atlas_prompt',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_atlas_prompts', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'character_anchor_atlas', 'image_generation', 'Character Atlas', 2040, -120, {
      purpose: 'sequence_animatic_character_anchor_atlas',
      role: 'sequence_animatic_character_anchor_atlas',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: { width: 2048, height: 2048 },
      planningOnly: true,
      planning_only: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_character_anchor_atlas', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'character_anchor_extract', 'utility_transform', 'Extract Characters', 2320, -120, {
      purpose: 'sequence_animatic_character_anchor_extract',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_extract', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'prop_anchor_atlas_prompt', 'utility_transform', 'Prop Atlas Prompt', 1760, 120, {
      purpose: 'sequence_animatic_prop_anchor_atlas_prompt',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_atlas_prompts', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'prop_anchor_atlas', 'image_generation', 'Prop Atlas', 2040, 120, {
      purpose: 'sequence_animatic_prop_anchor_atlas',
      role: 'sequence_animatic_prop_anchor_atlas',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: { width: 2048, height: 2048 },
      planningOnly: true,
      planning_only: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_prop_anchor_atlas', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'prop_anchor_extract', 'utility_transform', 'Extract Props', 2320, 120, {
      purpose: 'sequence_animatic_prop_anchor_extract',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_extract', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'location_anchor_atlas_prompt', 'utility_transform', 'Location Atlas Prompt', 1760, 360, {
      purpose: 'sequence_animatic_location_anchor_atlas_prompt',
      ...config,
      aspectRatio: input.aspectRatio,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_atlas_prompts', maxConcurrency: 1 },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'location_anchor_atlas', 'image_generation', 'Location Atlas', 2040, 360, {
      purpose: 'sequence_animatic_location_anchor_atlas',
      role: 'sequence_animatic_location_anchor_atlas',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 8,
      imageSize: { width: 2048, height: 2048 },
      planningOnly: true,
      planning_only: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_location_anchor_atlas', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'location_anchor_extract', 'utility_transform', 'Extract Locations', 2320, 360, {
      purpose: 'sequence_animatic_location_anchor_extract',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_anchor_extract', maxConcurrency: 1, continueOnError: true },
    }, {}, 'continuity_pack'),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'continuity_artifact', 'output_artifact', 'Register Continuity', 2600, 120, {
      purpose: 'sequence_animatic_continuity_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility' },
    }, {}, 'continuity_pack'),
  ]
  const blockEdges = continuityBlocks.flatMap((_block: ContinuityWorkflowBlock, index: number) => {
    const suffix = String(index + 1).padStart(3, '0')
    const previousGraphNodeKey = index === 0 ? 'continuity_global_merge' : `continuity_block_${String(index).padStart(3, '0')}_merge`
    const planNodeKey = `continuity_block_${suffix}_plan`
    const mergeNodeKey = `continuity_block_${suffix}_merge`
    const structureNodeKey = `continuity_block_${suffix}_structure`
    return [
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${previousGraphNodeKey}__${planNodeKey}`, previousGraphNodeKey, 'continuity_graph_v2', planNodeKey, 'continuity_graph_v2', {}, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `input__${planNodeKey}_context`, 'continuity_input', 'continuity_planner_context', planNodeKey, 'continuity_planner_context', {}, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${previousGraphNodeKey}__${mergeNodeKey}`, previousGraphNodeKey, 'continuity_graph_v2', mergeNodeKey, 'continuity_graph_v2', {}, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${planNodeKey}__${mergeNodeKey}`, planNodeKey, 'continuity_block_delta', mergeNodeKey, 'continuity_block_delta', { requiredDependency: true }, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${mergeNodeKey}__${structureNodeKey}`, mergeNodeKey, 'continuity_graph_v2', structureNodeKey, 'continuity_graph_v2', {}, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${planNodeKey}__${structureNodeKey}_delta`, planNodeKey, 'continuity_block_delta', structureNodeKey, 'continuity_block_delta', { optional: true, optionalDependency: true }, 'continuity_pack'),
      sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `input__${structureNodeKey}_context`, 'continuity_input', 'continuity_planner_context', structureNodeKey, 'continuity_planner_context', {}, 'continuity_pack'),
    ]
  })
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__seed_context', 'continuity_input', 'continuity_planner_context', 'continuity_seed_graph', 'continuity_planner_context', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'seed__global_plan', 'continuity_seed_graph', 'continuity_graph_v2', 'continuity_global_plan', 'continuity_graph_v2', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__global_plan_context', 'continuity_input', 'continuity_planner_context', 'continuity_global_plan', 'continuity_planner_context', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'seed__global_merge', 'continuity_seed_graph', 'continuity_graph_v2', 'continuity_global_merge', 'continuity_graph_v2', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'global_plan__global_merge', 'continuity_global_plan', 'continuity_block_delta', 'continuity_global_merge', 'continuity_block_delta', { requiredDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'global_merge__global_structure', 'continuity_global_merge', 'continuity_graph_v2', 'continuity_global_structure', 'continuity_graph_v2', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'global_plan__global_structure_delta', 'continuity_global_plan', 'continuity_block_delta', 'continuity_global_structure', 'continuity_block_delta', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__global_structure_context', 'continuity_input', 'continuity_planner_context', 'continuity_global_structure', 'continuity_planner_context', {}, 'continuity_pack'),
    ...blockEdges,
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, `${latestContinuityGraphNodeKey}__finalize`, latestContinuityGraphNodeKey, 'continuity_graph_v2', 'continuity_graph_finalize', 'continuity_graph_v2', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_screenplay', 'continuity_input', 'screenplay', 'continuity_plan', 'screenplay', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_shots', 'continuity_input', 'shot_plan', 'continuity_plan', 'shot_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_breaks', 'continuity_input', 'shot_break_plan', 'continuity_plan', 'shot_break_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_refs', 'continuity_input', 'asset_pack', 'continuity_plan', 'asset_pack', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_context', 'continuity_input', 'continuity_planner_context', 'continuity_plan', 'continuity_planner_context', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'finalize__plan_graph', 'continuity_graph_finalize', 'continuity_graph_v2', 'continuity_plan', 'continuity_graph_v2', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__character_prompt', 'continuity_plan', 'text', 'character_anchor_atlas_prompt', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__character_prompt_refs', 'continuity_input', 'asset_pack', 'character_anchor_atlas_prompt', 'asset_pack', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'character_prompt__atlas', 'character_anchor_atlas_prompt', 'text', 'character_anchor_atlas', 'prompt', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__character_atlas_refs', 'continuity_input', 'asset_pack', 'character_anchor_atlas', 'references', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__character_extract', 'continuity_plan', 'text', 'character_anchor_extract', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'character_atlas__extract', 'character_anchor_atlas', 'image', 'character_anchor_extract', 'image', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__prop_prompt', 'continuity_plan', 'text', 'prop_anchor_atlas_prompt', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prop_prompt_refs', 'continuity_input', 'asset_pack', 'prop_anchor_atlas_prompt', 'asset_pack', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prop_prompt__atlas', 'prop_anchor_atlas_prompt', 'text', 'prop_anchor_atlas', 'prompt', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prop_atlas_refs', 'continuity_input', 'asset_pack', 'prop_anchor_atlas', 'references', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__prop_extract', 'continuity_plan', 'text', 'prop_anchor_extract', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prop_atlas__extract', 'prop_anchor_atlas', 'image', 'prop_anchor_extract', 'image', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__location_prompt', 'continuity_plan', 'text', 'location_anchor_atlas_prompt', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__location_prompt_refs', 'continuity_input', 'asset_pack', 'location_anchor_atlas_prompt', 'asset_pack', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'location_prompt__atlas', 'location_anchor_atlas_prompt', 'text', 'location_anchor_atlas', 'prompt', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__location_atlas_refs', 'continuity_input', 'asset_pack', 'location_anchor_atlas', 'references', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__location_extract', 'continuity_plan', 'text', 'location_anchor_extract', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'location_atlas__extract', 'location_anchor_atlas', 'image', 'location_anchor_extract', 'image', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__artifact', 'continuity_plan', 'text', 'continuity_artifact', 'continuity_anchor_plan', {}, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'character_extract__artifact', 'character_anchor_extract', 'anchors', 'continuity_artifact', 'character_anchors', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prop_extract__artifact', 'prop_anchor_extract', 'anchors', 'continuity_artifact', 'prop_anchors', { optional: true, optionalDependency: true }, 'continuity_pack'),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'location_extract__artifact', 'location_anchor_extract', 'anchors', 'continuity_artifact', 'location_anchors', { optional: true, optionalDependency: true }, 'continuity_pack'),
  ]
  return { nodes, edges }
}
