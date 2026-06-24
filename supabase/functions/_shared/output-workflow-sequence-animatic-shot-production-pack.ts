import { cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import { formatSequenceAnimaticSceneStateForPrompt } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  buildCompactSeedanceVideoPrompt,
  buildSeedanceCharacterVoiceGuide,
  buildSeedanceReferenceManifest,
  compactSeedanceControlText,
  formatSeedanceShotLine,
  seedanceLabanMovementBlock,
  seedanceProductionBoardArtifactBan,
  seedanceReferenceRecordsFromAssetPack,
  seedanceReferenceRecordsFromImages,
} from './output-workflow-seedance-video-prompt-runtime.ts'
import { buildCinematicV3StoryboardGroupAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  buildSequenceAnimaticShotVisualCallSheet,
  formatSequenceAnimaticShotVisualCallSheetCameraPlan,
  formatSequenceAnimaticShotVisualCallSheetForPrompt,
  inferSequenceShotVideoTimingRuntime,
} from './output-workflow-sequence-animatic-shot-video-runtime.ts'
import {
  orderSequenceAnimaticAssetPackReferences,
  scopeAssetPackToReferenceAssetKeys,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
  sequenceAnimaticReferenceName,
  sequenceAnimaticReferenceRole,
  sequenceAnimaticReferenceVisual,
} from './output-workflow-sequence-animatic-reference-runtime.ts'

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
  status?: string
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}
function readPreferredUpstreamImage(input: {
  upstream: Record<string, Record<string, unknown>>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  preferredNodeKeys: string[]
  fields?: string[]
  role?: string
}) {
  const fields = input.fields ?? ['image', 'keyframe', 'primaryReferenceImage', 'coverImage']
  const readFromOutputs = (outputs: unknown) => {
    const record = input.helpers.asRecord(outputs)
    for (const field of fields) {
      const image = input.helpers.asRecord(record[field])
      if (input.helpers.readText(image.assetKey) || input.helpers.readText(image.storagePath) || input.helpers.readText(image.url)) return image
    }
    if (input.helpers.readText(record.assetKey) || input.helpers.readText(record.storagePath) || input.helpers.readText(record.url)) return record
    return null
  }
  for (const key of input.preferredNodeKeys) {
    const direct = readFromOutputs(input.upstream[key])
    if (direct) return direct
  }
  if (input.role) {
    for (const outputs of Object.values(input.upstream)) {
      const image = readFromOutputs(outputs)
      if (!image) continue
      if (input.helpers.readText(image.role) === input.role || input.helpers.readText(input.helpers.asRecord(outputs).role) === input.role) return image
    }
  }
  return input.helpers.readFirstUpstreamImage(input.upstream, fields)
}

function readUpstreamImages(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['image', 'coverImage'],
) {
  const images: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !images.some((image) => helpers.readText(image.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(image.storagePath ?? image.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      images.push(outputs)
    }
  }
  return images
}

function readUpstreamVideos(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['video', 'videos'],
) {
  const videos: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !videos.some((video) => helpers.readText(video.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(video.storagePath ?? video.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      videos.push(outputs)
    }
  }
  return videos
}

export async function sequenceAnimaticPlannedKeyframePrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const canonicalShotReferenceMode = ['primary_chain_v12_canonical_shot_refs', 'primary_chain_v13_ui_ingredient_override']
    .includes(helpers.readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version))
    || helpers.readText(config.dependencyMode ?? config.dependency_mode) === 'ingredient_refs'
  const sceneState = helpers.asRecord(config.sceneState ?? config.scene_state)
  const sceneStateText = helpers.compactStoryboardSentence(formatSequenceAnimaticSceneStateForPrompt(sceneState as never), '', 42)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const coverageSetup = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const coverageAnchor = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['coverageAnchor', 'coverage_anchor'])
  const previousKeyframe = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['previousKeyframe', 'previous_keyframe'])
  const storyboardPanel = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['storyboardPanel', 'storyboard_panel'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const canonicalReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const referenceAssetKeys = canonicalShotReferenceMode && canonicalReferenceAssetKeys.length > 0
    ? canonicalReferenceAssetKeys
    : [...new Set([
    ...helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys),
    ...referenceManifest.map((entry) => helpers.readText(helpers.asRecord(entry).assetKey)),
  ].filter(Boolean))]
  const referenceManifestText = referenceManifest
    .map((entry) => helpers.readText(helpers.asRecord(entry).line))
    .filter(Boolean)
    .join('\n')
  const upstreamVisualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const visualCallSheet = helpers.readText(upstreamVisualCallSheet.version)
    ? upstreamVisualCallSheet
    : buildSequenceAnimaticShotVisualCallSheet({
      shot,
      coverageSetup,
      coverageAnchor,
      previousKeyframe,
      storyboardPanel,
      referenceManifest,
      sceneStateText,
    })
  const visualCallSheetText = formatSequenceAnimaticShotVisualCallSheetForPrompt(visualCallSheet)
  const visibleSubjects = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => ['character_reference', 'temp_character_reference'].includes(sequenceAnimaticReferenceRole(entity)))
    .map((entity) => {
      const name = sequenceAnimaticReferenceName(entity, 'Subject')
      const visual = sequenceAnimaticReferenceVisual(entity, 16)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 8)
    .join('\n')
  const locationRefs = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => ['spot_reference', 'zone_reference', 'set_reference', 'viewpoint_reference', 'location_reference', 'camera_grid_reference'].includes(sequenceAnimaticReferenceRole(entity)))
    .map((entity) => {
      const name = sequenceAnimaticReferenceName(entity, 'Location ref')
      const visual = sequenceAnimaticReferenceVisual(entity, 14)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 5)
    .join('\n')
  const propRefs = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => sequenceAnimaticReferenceRole(entity) === 'prop_reference')
    .map((entity) => {
      const name = sequenceAnimaticReferenceName(entity, 'Prop')
      const visual = sequenceAnimaticReferenceVisual(entity, 12)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 5)
    .join('\n')
  const camera = helpers.asRecord(shot.camera)
  const dialogue = helpers.readArray(shot.dialogue).map(helpers.asRecord).map((line) => {
    const text = helpers.readText(line.text)
    if (!text) return ''
    return `${helpers.readText(line.speakerName) || helpers.readText(line.speakerRefId) || 'Speaker'}: "${text}"`
  }).filter(Boolean).join(' ')
  const action = helpers.compactStoryboardSentence(helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt), '', 34)
  const cameraBrief = formatSequenceAnimaticShotVisualCallSheetCameraPlan(visualCallSheet)
    || [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')
    || helpers.readText(shot.camera)
  const lighting = helpers.compactStoryboardSentence(helpers.readText(shot.lighting) || helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief), '', 26)
  const coverageFallback = !helpers.readText(coverageAnchor.assetKey) && (
    helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)
    || helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
    || helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief)
  )
  const hasCoverageAnchor = Boolean(helpers.readText(coverageAnchor.assetKey))
  const promptText = [
    'Generate one finished cinematic keyframe for this exact animatic shot. Single final frame only.',
    !canonicalShotReferenceMode && hasCoverageAnchor
      ? 'Composition lock: @Image1 is the coverage anchor. Match its camera position, framing, screen direction, horizon/ground plane, major foreground/background shapes, and subject placement. Replace blockout placeholders with final art.'
      : '',
    '',
    'Reference map',
    referenceManifestText || 'No attached image references; use only the written visual facts.',
    '',
    'Director call sheet',
    visualCallSheetText,
    '',
    'Frame target',
    `${helpers.readText(shot.title) || 'Untitled shot'} - ${action || 'one clear visible moment.'}`,
    dialogue ? `Dialogue visible cue: ${helpers.compactStoryboardSentence(dialogue, '', 26)}` : '',
    '',
    'Visible subjects',
    visibleSubjects || 'Only subjects explicitly visible in the shot action.',
    propRefs ? `Props/items\n${propRefs}` : '',
    '',
    'Action/blocking',
    action || 'Hold the exact readable action from the shot.',
    !canonicalShotReferenceMode && hasCoverageAnchor
      ? 'Use @Image1 coverage anchor as the framing/background/blocking source of truth. Do not copy labels, arrows, placeholder figures, or blockout styling.'
      : (!canonicalShotReferenceMode && coverageFallback ? `Coverage facts: ${helpers.compactStoryboardSentence(coverageFallback, '', 30)}` : ''),
    !canonicalShotReferenceMode && helpers.readText(previousKeyframe.assetKey) ? 'Use the previous keyframe reference only for same-setup motion continuity and established state.' : '',
    '',
    'Camera/framing',
    cameraBrief || 'Camera and framing follow the shot plan.',
    helpers.readText(shot.performance) ? `Performance: ${helpers.compactStoryboardSentence(shot.performance, '', 20)}` : '',
    '',
    'Lighting/environment',
    [lighting, locationRefs ? `Location refs\n${locationRefs}` : '', sceneStateText ? `Visual continuity facts: ${sceneStateText}` : ''].filter(Boolean).join('\n') || 'Preserve environment, weather, material, and lighting continuity.',
    '',
    'Negative rules',
    canonicalShotReferenceMode
      ? 'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Use only the attached ingredient identities plus the written shot facts; do not introduce unlisted characters, props, locations, or stale visual references. Do not mention workflow, schema, IDs, or asset keys in the image.'
      : 'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Do not render blockout labels from the coverage anchor. Do not change the coverage-anchor camera angle, lens feel, background layout, or screen direction unless the written shot facts explicitly contradict it. Do not mention workflow, schema, IDs, or asset keys in the image.',
  ].filter(Boolean).join('\n')
  const outputs = {
    prompt: promptText,
    text: promptText,
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    sceneState,
    scene_state: sceneState,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-prompt-v3' })
}

export async function sequenceAnimaticPlannedKeyframeInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.asRecord(config.shot)
  const coverageSetup = helpers.asRecord(config.coverageSetup ?? config.coverage_setup)
  const coverageAnchor = helpers.asRecord(config.coverageAnchor ?? config.coverage_anchor)
  const previousKeyframe = helpers.asRecord(config.previousKeyframe ?? config.previous_keyframe)
  const storyboardPanel = helpers.asRecord(config.storyboardPanel ?? config.storyboard_panel)
  const requiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const extraReferenceEntities = [
    coverageAnchor,
    previousKeyframe,
    storyboardPanel,
  ].flatMap((image, index): LooseRecord[] => {
    const assetKey = helpers.readText(image.assetKey)
    if (!assetKey) return []
    const label = index === 0 ? 'Coverage anchor' : index === 1 ? 'Previous keyframe' : 'Storyboard panel'
    return [{
      key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${helpers.slugify(assetKey)}`,
      name: label,
      type: 'continuity_asset',
      role: index === 0 ? 'coverage_anchor_reference' : index === 1 ? 'previous_keyframe_reference' : 'storyboard_panel_reference',
      summary: `${label} for this shot.`,
      visualDescription: `Use this ${label.toLowerCase()} to preserve composition and continuity.`,
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: index === 0 ? 'coverage_anchor' : index === 1 ? 'previous_keyframe' : 'storyboard_panel',
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
    }]
  }).filter((entry) => !requiredReferenceAssetKeys.includes(helpers.readText(entry.primaryAssetKey)))
  const baseAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack ?? config.asset_pack),
    shots: [shot],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const extraReferenceAssetKeys = extraReferenceEntities
    .map((entity) => helpers.readText(entity.primaryAssetKey))
    .filter(Boolean)
  const assetPack = orderSequenceAnimaticAssetPackReferences(scopeAssetPackToReferenceAssetKeys({
    assetPack: baseAssetPack,
    referenceAssetKeys: [...requiredReferenceAssetKeys, ...extraReferenceAssetKeys],
    fallbackEntities: extraReferenceEntities,
    referenceScope: 'sequence_animatic_shot_keyframe',
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = sequenceAnimaticReferenceManifestText(assetPack)
  const visualCallSheet = buildSequenceAnimaticShotVisualCallSheet({
    shot,
    coverageSetup,
    coverageAnchor,
    previousKeyframe,
    storyboardPanel,
    referenceManifest,
  })
  const outputs = {
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    text: JSON.stringify({ shot, coverageSetup, coverageAnchor, previousKeyframe, storyboardPanel, assetPack, visualCallSheet }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-input-v1' })
}

export async function sequenceAnimaticPlannedKeyframeArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const image = readPreferredUpstreamImage({
    upstream: context.upstream,
    helpers,
    preferredNodeKeys: ['planned_keyframe_image', 'shot_keyframe_image'],
    fields: ['image', 'keyframe', 'primaryReferenceImage'],
    role: 'sequence_animatic_shot_keyframe',
  }) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const visualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const shotId = helpers.readText(shot.id) || helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot keyframe artifact requires a shot id.')
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Shot keyframe image did not produce an asset key.')
  const qcFindings: string[] = assetKey ? [] : ['Shot keyframe image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const keyframe = {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'shot_keyframe',
    sequenceAnimaticRole: 'shot_keyframe',
    masterRequestId: helpers.readText(config.masterRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId,
    coverageSetupId: helpers.readText(config.coverageSetupId),
    assetKey,
    image,
    prompt,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    qcStatus,
    qcFindings,
    status: assetKey ? 'ready' : 'failed',
    generatedAt: new Date().toISOString(),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(shotId)}.sequence-animatic-shot-keyframe`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(shot.title) || helpers.titleFromRefLike(shotId)} Keyframe`,
    summary: 'Final shot keyframe generated from the animatic shot plan, coverage anchor, and shot-scoped references.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-keyframe-artifact-v1',
      role: 'sequence_animatic_shot_keyframe',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'shot_keyframe',
      screenplayAnimaticRole: 'shot_keyframe',
      masterRequestId: keyframe.masterRequestId,
      storyboardBlockId: keyframe.storyboardBlockId,
      shotId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      requiredReferenceAssetKeys: helpers.readStringArray(config.requiredReferenceAssetKeys),
      omittedReferenceAssetKeys: helpers.readStringArray(config.omittedReferenceAssetKeys),
      sourceReferenceHash: helpers.readText(config.sourceReferenceHash),
      visualPlanHash: helpers.readText(config.visualPlanHash),
      qcStatus,
      qcFindings,
      prompt,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
      image,
      shot,
      keyframe,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: keyframe.masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: assetKey ? 'shot_keyframe_ready' : 'shot_keyframe_failed',
    payload: {
      shotId,
      storyboardBlockId: keyframe.storyboardBlockId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      artifactKey: artifact.key,
      status: keyframe.status,
    },
    metadata: { source: 'sequence_animatic_keyframe_workflow' },
    dedupe: { shotId },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    shotKeyframe: keyframe,
    shot_keyframe: keyframe,
    keyframe,
    image,
    shot,
    prompt,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-keyframe-artifact-v1' })
}

export async function sequenceAnimaticPlannedKeyframeImage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeImageGeneration(context)
}

export async function sequenceAnimaticShotVideoPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotRecord = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...shotRecord,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage'])
  const assetPackReferenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6))
  const visualAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: false,
    includePerformanceRefs: false,
    includeTextMentionedRefs: false,
  })
  const voiceGuideAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const entityByKey = helpers.cinematicEntityByKey(voiceGuideAssetPack)
  const timing = await inferSequenceShotVideoTimingRuntime({
    nodeKey: context.node.key,
    shot: shot as unknown as LooseRecord,
    entityByKey,
    runStructuredNode: helpers.runStructuredNode,
  })
  const editorialDurationSeconds = Math.max(1, Math.min(15, Number(timing.editorialDurationSeconds) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const dialogueLines = shot.dialogue
    .map((line) => {
      const text = helpers.readText(line.text)
      if (!text) return ''
      const speakerKey = helpers.readText(line.speakerRefId)
      const speaker = helpers.readText(entityByKey.get(speakerKey)?.name) || helpers.readText(line.speakerName) || speakerKey || 'Speaker'
      const emotion = helpers.readText(line.emotion)
      return `${speaker}: "${text}"${emotion ? ` (${emotion})` : ''}`
    })
    .filter(Boolean)
    .join(' ')
  const seedanceReferenceManifest = buildSeedanceReferenceManifest({
    imageReferences: [
      ...seedanceReferenceRecordsFromImages(upstreamImages.slice(0, 1), 'keyframes'),
      ...seedanceReferenceRecordsFromAssetPack(visualAssetPack, assetPackReferenceLimit),
    ].slice(0, 9),
    cinematicReferenceMode: 'keyframes',
  })
  const visualCallSheet = buildSequenceAnimaticShotVisualCallSheet({
    shot: shot as unknown as LooseRecord,
    referenceManifest: seedanceReferenceManifest,
    directedControls: timing.directedControls,
    durationSeconds: providerDurationSeconds,
  })
  const cameraPlan = formatSequenceAnimaticShotVisualCallSheetCameraPlan(visualCallSheet)
  const continuityPlan = [
    helpers.readText(visualCallSheet.environment.locationContinuity),
    helpers.readText(visualCallSheet.environment.lighting),
    helpers.readText(visualCallSheet.environment.cameraGridUse),
  ].filter(Boolean).join(' ')
  const referenceInstruction = upstreamImages.length > 0
    ? 'Treat @Image1 as the cropped shot keyframe reference, not a storyboard sheet. Preserve composition, visible subjects, lighting, environment, and props while animating the shot.'
    : 'Use attached references only for visible subject, location, prop, and camera-continuity guidance. No storyboard or keyframe reference is attached.'
  const characterVoiceGuide = buildSeedanceCharacterVoiceGuide({
    assetPack: voiceGuideAssetPack,
    shots: [shot as unknown as LooseRecord],
    limit: 4,
    visualIdentityKeys: new Set(shot.visibleCharacterRefIds),
  })
  const shotAction = helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt) || helpers.readText(shot.title)
  const shotLine = [
    formatSeedanceShotLine({
      shot: shot as unknown as LooseRecord,
      startSeconds: 0,
      endSeconds: providerDurationSeconds,
      dialogueLines,
    }),
    helpers.readText(shot.lighting) ? `Lighting: ${compactSeedanceControlText(shot.lighting, 12)}.` : '',
  ].filter(Boolean).join(' ')
  const prompt = buildCompactSeedanceVideoPrompt({
    durationSeconds: providerDurationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    referenceManifest: seedanceReferenceManifest,
    referenceInstruction,
    cameraPlan,
    directedControls: helpers.asRecord(timing.directedControls),
    shotSectionTitle: 'SHOT',
    shotLines: shotLine || shotAction,
    continuityPlan,
    identityGuide: characterVoiceGuide,
    audioPolicy: 'No music, score, audio bed, room tone, crowd wash, or background ambience. Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen shot action.',
    movementLogic: seedanceLabanMovementBlock([shot as unknown as LooseRecord], helpers.readText(context.run.prompt)),
    artifactBan: seedanceProductionBoardArtifactBan(seedanceReferenceManifest),
    clipLabel: 'this single shot',
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const timedShot = { ...shot, editorialDurationSeconds, providerDurationSeconds }
  const outputs = {
    prompt,
    text: prompt,
    shot: timedShot,
    shotPlan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    shot_plan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    assetPack: visualAssetPack,
    asset_pack: visualAssetPack,
    voiceGuideAssetPack,
    voice_guide_asset_pack: voiceGuideAssetPack,
    primaryReferenceImage: upstreamImages[0] ?? null,
    referenceImageCount: upstreamImages.length,
    seedanceReferenceManifest,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    cameraPlan,
    camera_plan: cameraPlan,
    directedControls: timing.directedControls,
    audioPolicy: 'dialogue_and_direct_diegetic_sfx_only',
    visualReferencePolicy: 'visible_characters_location_props_only',
    offscreenSpeakerVisualReferencesExcluded: true,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    timingInference: {
      mode: 'llm_from_shot_details',
      ignoredTaggedShotTiming: true,
      rationale: helpers.readText(timing.rationale),
      pacingNotes: helpers.readText(timing.pacingNotes),
      provider: helpers.readText(timing.provider),
      model: helpers.readText(timing.model),
      fallbackUsed: timing.fallbackUsed,
      fallbackReason: helpers.readText(timing.fallbackReason),
    },
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    sequenceAnimaticRole: 'shot_video',
    guidance,
    deterministic: helpers.readText(timing.provider) === 'graphcore',
  }
  return result({
    context,
    helpers,
    outputs,
    provider: helpers.readText(timing.provider) || 'graphcore',
    model: helpers.readText(timing.model) || 'sequence-animatic-shot-video-prompt-v2',
  })
}

export async function sequenceAnimaticShotVideoArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const video = readUpstreamVideos(context.upstream, helpers, ['video', 'videos'])[0] ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text', 'providerPrompt'])
  const keyframe = helpers.readFirstUpstreamImage(context.upstream, ['keyframe', 'image', 'primaryReferenceImage'])
  const visualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const shotId = helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot video artifact requires a shot id.')
  const assetKey = helpers.readText(video.assetKey)
  if (!assetKey) {
    const outputs = {
      video,
      prompt,
      keyframe,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
      assetKey: '',
      skipped: true,
      skippedReason: helpers.readText(video.skippedReason) || 'shot_video_missing_asset',
      authoringReady: false,
    }
    return result({
      status: 'skipped',
      context,
      helpers,
      outputs,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-video-artifact-skip-v1',
    })
  }
  const storagePath = helpers.readText(video.storagePath) || helpers.readText(video.storage_path)
  if (!storagePath) throw new Error('Shot video artifact requires a storage path.')
  const mimeType = helpers.readText(video.mimeType) || helpers.readText(video.mime_type) || 'video/mp4'
  const artifact = await helpers.registerVideoArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    mimeType,
    name: `${helpers.titleFromRefLike(helpers.readText(config.shotId))} Video`,
    summary: 'Generated per-shot sequence animatic video.',
    metadata: {
      ...helpers.asRecord(video.metadata),
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: helpers.readText(video.provider),
      model: helpers.readText(video.model),
      providerRequestId: helpers.readText(video.providerRequestId),
      role: 'sequence_animatic_shot_video',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'shot_production',
      screenplayAnimaticRole: 'shot_production',
      masterRequestId: helpers.readText(config.masterRequestId),
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      shotId,
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      storagePath,
      prompt,
      keyframe,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: helpers.readText(config.masterRequestId),
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'shot_video_ready',
    payload: {
      shotId,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      artifactKey: artifact.key,
      status: 'ready',
    },
    metadata: { source: 'sequence_animatic_shot_production_workflow' },
    dedupe: { shotId, assetKey },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    video: {
      ...video,
      assetKey,
      storagePath,
      mimeType,
      role: 'sequence_animatic_shot_video',
    },
    keyframe,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-video-artifact-v1' })
}

export async function sequenceAnimaticShotVideo(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeVideoGeneration(context)
}

const sequenceAnimaticShotProductionHandlers = {
  sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt,
  sequence_animatic_planned_keyframe_input: sequenceAnimaticPlannedKeyframeInput,
  sequence_animatic_planned_keyframe_image: sequenceAnimaticPlannedKeyframeImage,
  sequence_animatic_planned_keyframe_artifact: sequenceAnimaticPlannedKeyframeArtifact,
  sequence_animatic_shot_video_prompt: sequenceAnimaticShotVideoPrompt,
  sequence_animatic_shot_video: sequenceAnimaticShotVideo,
  sequence_animatic_shot_video_artifact: sequenceAnimaticShotVideoArtifact,
}

const sequenceAnimaticShotProductionWorkflowNodePackKey = 'sequence_animatic_shot_production'

export const sequenceAnimaticShotProductionWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticShotProductionHandlers
>({
  packKey: sequenceAnimaticShotProductionWorkflowNodePackKey,
  handlers: sequenceAnimaticShotProductionHandlers,
})

export const sequenceAnimaticShotProductionWorkflowNodeHandlerKeys = sequenceAnimaticShotProductionWorkflowNodePack.handlerKeys

function createSequenceAnimaticShotProductionNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticShotProductionHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic shot production workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticShotProductionWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

const shotProductionProjectionMetadataKeys = [
  'activeManifestPurpose',
  'activeProgressLabel',
  'readyArtifactCount',
  'scopedAssetKeys',
  'recoveryHints',
]

export const sequenceAnimaticShotProductionWorkflowNodeScaffolds = [
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.coverageSetup',
      'upstream.coverageAnchor',
      'upstream.previousKeyframe',
      'upstream.storyboardPanel',
      'upstream.assetPack',
      'upstream.visualCallSheet',
      'config.shotId',
      'config.sceneState',
      'config.keyframePromptPolicyVersion',
      'config.referenceAssetKeys',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
      'config.shot',
      'config.coverageSetup',
      'config.coverageAnchor',
      'config.previousKeyframe',
      'config.storyboardPanel',
      'config.assetPack',
      'config.requiredReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
      'config.assetPackReferenceLimit',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_image',
    runtimeKind: 'image_generation',
    sourceHashKeys: [
      'upstream.prompt',
      'upstream.referenceManifest',
      'config.shotId',
      'config.coverageSetupId',
      'config.imageModel',
      'config.imageSize',
      'config.quality',
      'config.requiredReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.image',
      'upstream.prompt',
      'upstream.visualCallSheet',
      'upstream.shot',
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
      'config.requiredReferenceAssetKeys',
      'config.omittedReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video_prompt',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.image',
      'upstream.keyframe',
      'upstream.visualCallSheet',
      'config.shotId',
      'config.storyboardBlockId',
      'config.aspectRatio',
      'config.resolution',
      'config.editorialDurationSeconds',
      'config.assetPackReferenceLimit',
      'config.videoPromptPolicyVersion',
      'config.videoTimingPolicyVersion',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video',
    runtimeKind: 'video_generation',
    sourceHashKeys: [
      'upstream.prompt',
      'upstream.primaryReferenceImage',
      'upstream.seedanceReferenceManifest',
      'upstream.durationSeconds',
      'upstream.directedControls',
      'upstream.visualCallSheet',
      'config.shotId',
      'config.videoModel',
      'config.videoProvider',
      'config.aspectRatio',
      'config.resolution',
      'config.durationSeconds',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.video',
      'upstream.prompt',
      'upstream.keyframe',
      'upstream.visualCallSheet',
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
]

export const sequenceAnimaticShotProductionWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticShotProductionWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticShotProductionWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticShotProductionWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
