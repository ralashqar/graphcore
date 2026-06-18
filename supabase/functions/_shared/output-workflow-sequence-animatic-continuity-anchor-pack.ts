import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}

export async function sequenceAnimaticContinuityAnchorPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const directShotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const continuityPlannerContext = helpers.readFirstUpstreamRecord(context.upstream, ['continuityPlannerContext', 'continuity_planner_context'])
  const continuityGraphV2 = helpers.readFirstUpstreamRecord(context.upstream, ['continuityGraphV2', 'continuity_graph_v2'])
  const groupPlans = helpers.collectCinematicV3ShotPlansFromUpstream(context.upstream)
  const shotPlan = Array.isArray(directShotPlan.shots) && directShotPlan.shots.length > 0
    ? directShotPlan
    : helpers.mergeCinematicV3ShotPlansForTimeline(groupPlans)
  const mergedShotPlan = helpers.repairCinematicV2ShotPlanVisualReferences({ shotPlan, assetPack })
  const continuityAnchorPlan = await helpers.planSequenceAnimaticContinuityAnchors({
    nodeKey: context.node.key,
    prompt: context.run.prompt,
    screenplayDraft,
    shotPlan: mergedShotPlan,
    shotBreakPlan,
    assetPack,
    continuityPlannerContext,
    continuityGraphV2,
    priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerRequestId),
    priorProviderStartedAt: helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerStartedAt) || context.priorStep?.startedAt,
    shouldCancel: context.shouldCancel,
    onProgress: async (progress) => {
      await context.onProgress?.({
        provider: 'openai',
        model: helpers.outputWorkflowTextModel(),
        providerRequestId: progress.providerRequestId,
        metadata: {
          providerMode: progress.providerMode,
          providerStatus: progress.providerStatus,
          lastProviderPollAt: progress.lastProviderPollAt,
          providerStartedAt: progress.providerStartedAt,
          continuityPlanner: true,
        },
      })
    },
  })
  const plan = helpers.asRecord(continuityAnchorPlan)
  const outputs = {
    continuityAnchorPlan,
    continuity_anchor_plan: continuityAnchorPlan,
    characterAnchors: continuityAnchorPlan.characterAnchors,
    character_anchors: continuityAnchorPlan.characterAnchors,
    propAnchors: continuityAnchorPlan.propAnchors,
    prop_anchors: continuityAnchorPlan.propAnchors,
    locationSpotAnchors: continuityAnchorPlan.locationSpotAnchors,
    location_spot_anchors: continuityAnchorPlan.locationSpotAnchors,
    continuityGraphV2: continuityAnchorPlan.continuityGraphV2,
    continuity_graph_v2: continuityAnchorPlan.continuityGraphV2,
    continuityAnchorIdsByShotId: continuityAnchorPlan.continuityAnchorIdsByShotId,
    shotContinuityMap: continuityAnchorPlan.shotContinuityMap,
    shot_continuity_map: continuityAnchorPlan.shotContinuityMap,
    shotBindings: continuityAnchorPlan.shotBindings,
    shot_bindings: continuityAnchorPlan.shotBindings,
    locationSets: continuityAnchorPlan.locationSets,
    location_sets: continuityAnchorPlan.locationSets,
    locationAngles: continuityAnchorPlan.locationAngles,
    location_angles: continuityAnchorPlan.locationAngles,
    sceneGraph: continuityAnchorPlan.sceneGraph,
    scene_graph: continuityAnchorPlan.sceneGraph,
    rejectedCandidates: continuityAnchorPlan.rejectedCandidates,
    rejected_candidates: continuityAnchorPlan.rejectedCandidates,
    shotContinuityAnchorIds: continuityAnchorPlan.continuityAnchorIdsByShotId,
    shotPlan: mergedShotPlan,
    shot_plan: mergedShotPlan,
    text: JSON.stringify(continuityAnchorPlan, null, 2),
    deterministic: continuityAnchorPlan.planningMode === 'deterministic_fallback',
    providerRequestId: helpers.readText(plan.providerRequestId),
    plannerProvider: helpers.readText(plan.plannerProvider),
    plannerModel: helpers.readText(plan.plannerModel),
    plannerFallbackReason: helpers.readText(plan.plannerFallbackReason),
  }
  return result({
    context,
    helpers,
    outputs,
    provider: helpers.readText(plan.plannerProvider) || (continuityAnchorPlan.planningMode === 'llm_structured_v2' ? 'openai' : 'graphcore'),
    model: helpers.readText(plan.plannerModel) || (continuityAnchorPlan.planningMode === 'llm_structured_v2' ? helpers.outputWorkflowTextModel() : 'deterministic-sequence-animatic-continuity-anchor-plan-fallback-v2'),
    providerRequestId: helpers.readText(plan.providerRequestId) || undefined,
  })
}

function sequenceAnimaticAnchorTypeFromPurpose(purpose: string) {
  if (purpose.includes('character_anchor')) return 'character' as const
  if (purpose.includes('prop_anchor')) return 'prop' as const
  return 'location_spot' as const
}

function sequenceAnimaticAnchorTypeLabel(anchorType: 'character' | 'prop' | 'location_spot') {
  return anchorType === 'character' ? 'temporary character' : anchorType === 'prop' ? 'prop' : 'location spot'
}

function sequenceAnimaticAnchorRole(anchorType: 'character' | 'prop' | 'location_spot') {
  return anchorType === 'character'
    ? 'sequence_animatic_character_anchor'
    : anchorType === 'prop' ? 'sequence_animatic_prop_anchor' : 'sequence_animatic_location_anchor'
}

function sequenceAnimaticAnchorsForType(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  plan: LooseRecord,
  anchorType: 'character' | 'prop' | 'location_spot',
) {
  return (anchorType === 'character'
    ? helpers.readArray(plan.characterAnchors)
    : anchorType === 'prop'
      ? helpers.readArray(plan.propAnchors)
      : helpers.readArray(plan.locationSpotAnchors))
    .map(helpers.asRecord)
    .slice(0, 9)
}

export async function sequenceAnimaticAnchorAtlasPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const purpose = helpers.readText(helpers.asRecord(context.node.config).purpose)
  const anchorType = sequenceAnimaticAnchorTypeFromPurpose(purpose)
  const plan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const anchors = sequenceAnimaticAnchorsForType(helpers, plan, anchorType)
  const layout = helpers.sequenceAnimaticAtlasLayout(anchors.length)
  if (anchors.length === 0) {
    const outputs = {
      skipImageGeneration: true,
      skip_image_generation: true,
      skipReason: `No ${sequenceAnimaticAnchorTypeLabel(anchorType)} continuity anchors needed.`,
      anchors,
      atlasLayout: layout,
      imageSize: helpers.sequenceAnimaticAtlasImageSize(layout),
      text: `No ${sequenceAnimaticAnchorTypeLabel(anchorType)} continuity anchors needed.`,
      deterministic: true,
    }
    return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-anchor-atlas-prompt-v1' })
  }
  const prompt = helpers.buildSequenceAnimaticAnchorAtlasPrompt({ anchorType, anchors, layout, assetPack })
  const outputs = {
    prompt,
    text: prompt,
    anchors,
    atlasLayout: layout,
    imageSize: helpers.sequenceAnimaticAtlasImageSize(layout),
    continuityAnchorPlan: plan,
    continuity_anchor_plan: plan,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-anchor-atlas-prompt-v1' })
}

export async function sequenceAnimaticAnchorExtract(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const purpose = helpers.readText(helpers.asRecord(context.node.config).purpose)
  const anchorType = sequenceAnimaticAnchorTypeFromPurpose(purpose)
  const plan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const anchors = sequenceAnimaticAnchorsForType(helpers, plan, anchorType)
  const atlasImage = helpers.readFirstUpstreamImage(context.upstream, ['image'])
  if (anchors.length === 0 || !atlasImage) {
    const outputs = {
      anchors: [],
      anchorAssets: [],
      anchor_assets: [],
      characterAnchors: anchorType === 'character' ? [] : undefined,
      propAnchors: anchorType === 'prop' ? [] : undefined,
      locationSpotAnchors: anchorType === 'location_spot' ? [] : undefined,
      text: `No ${sequenceAnimaticAnchorTypeLabel(anchorType)} continuity anchor atlas to extract.`,
      deterministic: true,
    }
    return result({ context, helpers, outputs, model: 'ffmpeg-sequence-animatic-anchor-extract-v1' })
  }
  const layout = helpers.sequenceAnimaticAtlasLayout(anchors.length)
  const atlasStoragePath = helpers.readText(atlasImage.storagePath) || helpers.readText(atlasImage.storage_path)
  const atlasBytes = atlasStoragePath
    ? await helpers.downloadProjectAssetBytes(context.client, atlasStoragePath)
    : await helpers.downloadRemoteBytes(helpers.readText(atlasImage.url))
  const sourceMimeType = helpers.readText(atlasImage.mimeType) || helpers.readText(atlasImage.mime_type) || 'image/webp'
  const tempDir = await helpers.makeTempDir('graphcore-sequence-anchors-')
  const extractedAnchors: Record<string, unknown>[] = []
  try {
    const sourcePath = `${tempDir}/atlas.${sourceMimeType.includes('png') ? 'png' : sourceMimeType.includes('jpeg') || sourceMimeType.includes('jpg') ? 'jpg' : 'webp'}`
    await helpers.writeFile(sourcePath, atlasBytes)
    const probedSize = await helpers.probeImageSize(sourcePath)
    const width = probedSize?.width || Number(atlasImage.width ?? 0) || 2048
    const height = probedSize?.height || Number(atlasImage.height ?? 0) || 2048
    for (const [index, anchor] of anchors.entries()) {
      const anchorId = helpers.readText(anchor.id)
      const anchorName = helpers.readText(anchor.name) || helpers.titleFromRefLike(anchorId)
      const row = Math.floor(index / layout.columns)
      const column = index % layout.columns
      const cropX = Math.floor((width * column) / layout.columns)
      const cropY = Math.floor((height * row) / layout.rows)
      const nextX = Math.floor((width * (column + 1)) / layout.columns)
      const nextY = Math.floor((height * (row + 1)) / layout.rows)
      const cellWidth = Math.max(1, Math.min(width - cropX, nextX - cropX))
      const cellHeight = Math.max(1, Math.min(height - cropY, nextY - cropY))
      const outputPath = `${tempDir}/anchor-${String(index + 1).padStart(3, '0')}.webp`
      const crop = await helpers.runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${cellWidth}:${cellHeight}:${cropX}:${cropY}`, outputPath])
      if (!crop.ok) {
        throw new Error(`Sequence animatic continuity anchor crop failed for ${anchorId}: ${crop.stderr.slice(0, 1200)}`)
      }
      const cropVerification = await helpers.verifySequenceAnimaticAnchorCrop({
        outputPath,
        anchorId,
        expectedWidth: cellWidth,
        expectedHeight: cellHeight,
        row,
        column,
      })
      const anchorBytes = await helpers.readFile(outputPath)
      const assetKey = `seq_anchor.${context.run.id.slice(0, 8)}.${anchorType === 'character' ? 'char' : anchorType === 'prop' ? 'prop' : 'spot'}.${helpers.slugify(anchorId).slice(0, 54)}`
      const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/sequence-anchors/${anchorType}/${helpers.slugify(anchorId)}.webp`
      const mimeType = 'image/webp'
      await helpers.uploadBytes(context.client, storagePath, anchorBytes, mimeType)
      const cropRect = { x: cropX, y: cropY, width: cellWidth, height: cellHeight }
      const role = sequenceAnimaticAnchorRole(anchorType)
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: context.workflow.id,
        workflowKey: context.workflow.key,
        runId: context.run.id,
        nodeId: context.node.id,
        nodeKey: context.node.key,
        preset: context.run.preset,
        role,
        sequenceAnimaticArtifactRole: role,
        parentRequestId: context.run.metadata?.outputRequestId ?? null,
        sequenceUnitKey: helpers.readStringArray(context.run.input?.sourceSequenceUnitKeys)[0] ?? null,
        anchorId,
        anchorType,
        anchorName,
        baseLocationRefId: anchor.baseLocationRefId ?? null,
        shotIds: anchor.shotIds,
        storyboardBlockIds: anchor.storyboardBlockIds,
        sourceAtlasAssetKey: helpers.readText(atlasImage.assetKey),
        sourceAtlasStoragePath: atlasStoragePath,
        row,
        column,
        crop: cropRect,
        cropRect,
        cropVerification,
        cropMode: 'ffmpeg_crop',
        storageBucket: 'project-assets',
        storagePath,
      }
      const artifact = await helpers.registerImageArtifact({
        client: context.client,
        run: context.run,
        workflow: context.workflow,
        node: context.node,
        assetKey,
        storagePath,
        name: `${anchorName} Continuity Anchor`,
        summary: helpers.readText(anchor.summary),
        mimeType,
        metadata,
      })
      extractedAnchors.push({
        ...anchor,
        assetKey,
        storagePath,
        mimeType,
        artifactKey: artifact.key,
        sourceAtlasAssetKey: helpers.readText(atlasImage.assetKey) || null,
        row,
        column,
        cropRect,
        cropVerification,
        role,
        artifact,
      })
    }
    if (extractedAnchors.length !== anchors.length) {
      throw new Error(`Sequence animatic continuity anchor extraction count mismatch for ${anchorType}: expected ${anchors.length}, extracted ${extractedAnchors.length}.`)
    }
  } finally {
    await helpers.removeDir(tempDir)
  }
  const outputs = {
    anchors: extractedAnchors,
    anchorAssets: extractedAnchors,
    anchor_assets: extractedAnchors,
    characterAnchors: anchorType === 'character' ? extractedAnchors : [],
    character_anchors: anchorType === 'character' ? extractedAnchors : [],
    propAnchors: anchorType === 'prop' ? extractedAnchors : [],
    prop_anchors: anchorType === 'prop' ? extractedAnchors : [],
    locationSpotAnchors: anchorType === 'location_spot' ? extractedAnchors : [],
    location_spot_anchors: anchorType === 'location_spot' ? extractedAnchors : [],
    sourceAtlasImage: atlasImage,
    sourceAtlasAssetKey: helpers.readText(atlasImage.assetKey) || null,
    atlasLayout: layout,
    deterministic: true,
    text: `Extracted ${extractedAnchors.length} ${sequenceAnimaticAnchorTypeLabel(anchorType)} continuity anchor${extractedAnchors.length === 1 ? '' : 's'}.`,
  }
  return result({ context, helpers, outputs, model: 'ffmpeg-sequence-animatic-anchor-extract-v1' })
}
