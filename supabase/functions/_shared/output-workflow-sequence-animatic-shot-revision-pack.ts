import { cinematicV2ShotSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
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
  status?: string
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}
export async function sequenceAnimaticShotRevisionInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const rawShot = helpers.asRecord(config.shot)
  const shot = cinematicV2ShotSchema.parse({
    ...rawShot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(rawShot.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(rawShot.editorialDurationSeconds ?? 0) || 3),
  })
  const panel = helpers.asRecord(config.panel)
  const basePanelAssetKey = helpers.readText(panel.assetKey)
  if (!basePanelAssetKey) {
    throw new Error('Sequence animatic shot revision requires a cropped panel asset. Generate/extract the storyboard panel before revising this shot.')
  }
  const assetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack),
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const baseKeyframe = {
    ...panel,
    assetKey: basePanelAssetKey,
    role: 'sequence_animatic_shot_revision_base_keyframe',
    name: helpers.readText(panel.name) || `${shot.title || `Shot ${shot.index}`} base keyframe`,
    shotId: shot.id,
    shotIndex: shot.index,
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    usedAsVideoReference: true,
    metadata: {
      ...helpers.asRecord(panel.metadata),
      role: 'sequence_animatic_shot_revision_base_keyframe',
      shotId: shot.id,
      shotIndex: shot.index,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
    },
  }
  const revisionPrompt = helpers.readText(config.revisionPrompt)
  const outputs = {
    shot,
    baseShot: shot,
    base_shot: shot,
    baseKeyframe,
    base_keyframe: baseKeyframe,
    image: baseKeyframe,
    keyframe: baseKeyframe,
    panel,
    assetPack,
    asset_pack: assetPack,
    revisionPrompt,
    revision_prompt: revisionPrompt,
    revisionId: helpers.readText(config.revisionId),
    revision_id: helpers.readText(config.revisionId),
    screenplayAnimaticRole: 'shot_revision',
    sequenceAnimaticRole: 'shot_revision',
    text: JSON.stringify({ shot, baseKeyframe, revisionPrompt, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-revision-input-v1' })
}

export async function sequenceAnimaticShotRevisionPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot', 'baseShot', 'base_shot'])
  const revisionPrompt = helpers.readFirstUpstreamText(context.upstream, ['revisionPrompt', 'revision_prompt']) || helpers.readText(config.revisionPrompt)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const baseKeyframe = helpers.readFirstUpstreamRecord(context.upstream, ['baseKeyframe', 'base_keyframe', 'image', 'keyframe'])
  const priorStepMetadata = helpers.asRecord(context.priorStep?.metadata)
  const revision = await helpers.planSequenceAnimaticShotRevision({
    nodeKey: context.node.key,
    shot,
    revisionPrompt,
    assetPack,
    baseKeyframe,
    priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(priorStepMetadata.providerRequestId),
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
          shotRevisionPlanner: true,
        },
      })
    },
  })
  const provider = helpers.readText(revision.provider) || 'graphcore'
  const model = helpers.readText(revision.model) || 'sequence-animatic-shot-revision-plan-v1'
  const providerRequestId = helpers.readText(revision.providerRequestId)
  const fallbackReason = helpers.readText(revision.fallbackReason)
  const outputs = {
    revisionPlan: revision,
    revision_plan: revision,
    revisedShot: revision.revisedShot,
    revised_shot: revision.revisedShot,
    baseShot: shot,
    base_shot: shot,
    revisionPrompt,
    revision_prompt: revisionPrompt,
    changeSummary: revision.changeSummary,
    change_summary: revision.changeSummary,
    keyframeIntent: revision.keyframeIntent,
    keyframe_intent: revision.keyframeIntent,
    diagnostics: [
      ...helpers.readStringArray(revision.diagnostics),
      ...(revision.fallbackUsed ? [`Fallback used: ${fallbackReason || 'structured revision unavailable'}`] : []),
    ],
    text: JSON.stringify(revision, null, 2),
    providerRequestId,
    plannerProvider: provider,
    plannerModel: model,
    deterministic: provider === 'graphcore',
  }
  return result({ context, helpers, outputs, provider, model, providerRequestId: providerRequestId || undefined })
}

export async function sequenceAnimaticShotKeyframePrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const revisedShot = cinematicV2ShotSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['revisedShot', 'revised_shot', 'shot']))
  const baseKeyframe = helpers.readFirstUpstreamRecord(context.upstream, ['baseKeyframe', 'base_keyframe', 'image', 'keyframe'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceEntities = helpers.readArray(assetPack.entities).map(helpers.asRecord).map((entity) => {
    const name = helpers.readText(entity.name)
    const visual = helpers.readText(entity.visualDescription) || helpers.readText(entity.summary)
    return name && visual ? `${name}: ${visual}` : name || visual
  }).filter(Boolean).slice(0, 8).join('\n')
  const camera = helpers.asRecord(revisedShot.camera)
  const dialogue = revisedShot.dialogue.map((line) => {
    const text = helpers.readText(line.text)
    if (!text) return ''
    return `${helpers.readText(line.speakerName) || helpers.readText(line.speakerRefId) || 'Speaker'}: "${text}"`
  }).filter(Boolean).join(' ')
  const promptText = [
    'Generate one revised cinematic keyframe for this exact animatic shot. Use the base keyframe reference to preserve identity, location, wardrobe, props, aspect ratio, and continuity, while applying the revised shot direction.',
    'Do not create a storyboard grid, captions, UI, watermarks, labels, or multiple panels. Produce one finished frame only.',
    '',
    `Shot title: ${revisedShot.title}`,
    `Action: ${revisedShot.action || revisedShot.description || revisedShot.storyboardPanelPrompt}`,
    dialogue ? `Dialogue context: ${dialogue}` : '',
    `Camera: ${[helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')}`,
    helpers.readText(revisedShot.lighting) ? `Lighting: ${helpers.readText(revisedShot.lighting)}` : '',
    helpers.readText(revisedShot.mood) ? `Mood: ${helpers.readText(revisedShot.mood)}` : '',
    helpers.readText(revisedShot.storyboardPanelPrompt) ? `Panel composition: ${helpers.readText(revisedShot.storyboardPanelPrompt)}` : '',
    '',
    referenceEntities ? `Relevant references:\n${referenceEntities}` : '',
    helpers.readText(config.revisionPrompt) ? `User revision: ${helpers.readText(config.revisionPrompt)}` : '',
    `Base keyframe asset: ${helpers.readText(baseKeyframe.assetKey)}`,
  ].filter(Boolean).join('\n')
  const outputs = {
    prompt: promptText,
    text: promptText,
    revisedShot,
    revised_shot: revisedShot,
    shot: revisedShot,
    baseKeyframe,
    base_keyframe: baseKeyframe,
    image: baseKeyframe,
    assetPack,
    asset_pack: assetPack,
    revisionId: helpers.readText(config.revisionId),
    revision_id: helpers.readText(config.revisionId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId: helpers.readText(config.shotId),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-keyframe-prompt-v1' })
}

export async function sequenceAnimaticShotKeyframeImage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeImageGeneration(context)
}

export async function sequenceAnimaticShotRevisionArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const revisedShot = cinematicV2ShotSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['revisedShot', 'revised_shot', 'shot']))
  const revisionPlan = helpers.readFirstUpstreamRecord(context.upstream, ['revisionPlan', 'revision_plan'])
  const keyframe = helpers.readFirstUpstreamRecord(context.upstream, ['keyframe', 'image'])
  const keyframeAssetKey = helpers.readText(keyframe.assetKey)
  const revisionId = helpers.readText(config.revisionId) || `shot_revision_${helpers.slugify(helpers.readText(config.shotId))}_${context.run.id.slice(0, 8)}`
  const revisionPrompt = helpers.readText(config.revisionPrompt) || helpers.readText(context.run.prompt)
  const sourceManifestHash = helpers.readText(config.manifestHash) || helpers.readText(workflowMetadata.manifestHash)
  const basePanelAssetKey = helpers.readText(config.basePanelAssetKey) || helpers.readText(workflowMetadata.basePanelAssetKey)
  const diagnostics = [
    ...helpers.readStringArray(revisionPlan.diagnostics),
    ...(keyframeAssetKey ? [] : ['Shot text was revised, but no replacement keyframe image was generated.']),
  ]
  const revision = {
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'shot_revision',
    sequenceAnimaticRole: 'shot_revision',
    masterRequestId: helpers.readText(config.masterRequestId) || helpers.readText(workflowMetadata.masterRequestId),
    parentRequestId: helpers.readText(config.parentRequestId) || helpers.readText(workflowMetadata.parentRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId: helpers.readText(config.shotId),
    revisionId,
    sourceManifestHash,
    manifestHash: sourceManifestHash,
    blockHash: helpers.readText(config.blockHash),
    shotHash: helpers.readText(config.shotHash),
    continuityPackHash: helpers.readText(config.continuityPackHash),
    masterManifestArtifactKey: helpers.readText(config.masterManifestArtifactKey),
    basePanelAssetKey,
    revisedShot,
    keyframeAssetKey,
    keyframe,
    prompt: revisionPrompt,
    changeSummary: helpers.readText(revisionPlan.changeSummary),
    keyframeIntent: helpers.readText(revisionPlan.keyframeIntent),
    diagnostics,
    revisionHash: helpers.hashOutputWorkflowValue({
      revisedShot,
      keyframeAssetKey,
      revisionPrompt,
      sourceManifestHash,
    }),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-shot-revision`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Artifact`,
    summary: 'Sequence animatic output-local single-shot revision.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-revision-artifact-v1',
      role: 'sequence_animatic_shot_revision',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'shot_revision',
      screenplayAnimaticRole: 'shot_revision',
      masterRequestId: revision.masterRequestId,
      parentRequestId: revision.parentRequestId,
      storyboardBlockId: revision.storyboardBlockId,
      shotId: revision.shotId,
      revisionId,
      sourceManifestHash,
      manifestHash: sourceManifestHash,
      blockHash: revision.blockHash,
      shotHash: revision.shotHash,
      basePanelAssetKey,
      keyframeAssetKey,
      prompt: revisionPrompt,
      revisedShot,
      keyframe,
      revision,
      diagnostics,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: keyframeAssetKey,
    artifact,
    artifacts: [artifact],
    revision,
    shotRevision: revision,
    shot_revision: revision,
    revisedShot,
    revised_shot: revisedShot,
    keyframe,
    image: keyframe,
    keyframeAssetKey,
    keyframe_asset_key: keyframeAssetKey,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-revision-artifact-v1' })
}
