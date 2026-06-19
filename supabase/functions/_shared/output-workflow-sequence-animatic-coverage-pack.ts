import { z } from 'zod'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  applySequenceAnimaticCoveragePlanToDirectorPlan,
  normalizeSequenceAnimaticCoveragePlan,
  sequenceAnimaticCoveragePlanLlmSchema,
  sequenceAnimaticCoverageShotRefs,
  sequenceAnimaticCoverageSpatialFields,
} from './output-workflow-sequence-animatic-coverage-runtime.ts'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  buildCinematicV3StoryboardGroupAssetPack,
  cinematicAssetPackEntityKeys,
} from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  orderSequenceAnimaticAssetPackReferences,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
  sequenceAnimaticReferenceName,
  sequenceAnimaticReferenceRole,
  scopeAssetPackToReferenceAssetKeys,
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
const sequenceAnimaticCoverageIntentBatchSchema = z.object({
  intents: z.array(z.object({
    shotId: z.string().max(160),
    cameraFraming: z.string().max(220).default(''),
    cameraAngle: z.string().max(220).default(''),
    screenDirection: z.string().max(220).default(''),
    subjectFocus: z.string().max(360).default(''),
    stagingBrief: z.string().max(520).default(''),
    coverageIntent: z.string().max(700).default(''),
  })).min(1).max(150),
  diagnostics: z.array(z.string().max(260)).default([]),
})

const sequenceAnimaticCoverageAnchorBriefSchema = z.object({
  cameraPosition: z.string().max(420).default(''),
  framing: z.string().max(260).default(''),
  screenDirection: z.string().max(260).default(''),
  subjectBlocking: z.string().max(720).default(''),
  foregroundBackgroundPlan: z.string().max(620).default(''),
  movementArrows: z.array(z.string().max(160)).max(12).default([]),
  labels: z.array(z.string().max(80)).max(16).default([]),
  visualNotes: z.array(z.string().max(220)).max(12).default([]),
  mustNotInclude: z.array(z.string().max(160)).max(12).default([]),
})

export async function sequenceAnimaticCoverageIntentInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const intentBatch = helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const shots = helpers.readArray(config.shots).map(helpers.asRecord)
  const assetPack = helpers.asRecord(config.assetPack ?? config.asset_pack)
  const shotIds = helpers.readStringArray(intentBatch.shotIds ?? intentBatch.shot_ids)
  const outputs = {
    intentBatch,
    intent_batch: intentBatch,
    shots,
    assetPack,
    asset_pack: assetPack,
    shotIds,
    shot_ids: shotIds,
    text: JSON.stringify({
      sceneId: helpers.readText(intentBatch.sceneId),
      setId: helpers.readText(intentBatch.setId),
      zoneId: helpers.readText(intentBatch.zoneId),
      shotIds,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-intent-input-v1' })
}

export async function sequenceAnimaticCoverageIntentPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const intentBatch = helpers.readFirstUpstreamRecord(context.upstream, ['intentBatch', 'intent_batch'])
  const batchRecord = Object.keys(intentBatch).length > 0
    ? intentBatch
    : helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const upstreamShots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const shots = upstreamShots.length > 0 ? upstreamShots : helpers.readArray(config.shots).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const pack = Object.keys(assetPack).length > 0 ? assetPack : helpers.asRecord(config.assetPack ?? config.asset_pack)
  const shotById = new Map(shots.map((shot) => [helpers.readText(shot.id), shot] as const).filter(([shotId]) => Boolean(shotId)))
  const fallbackIntents = helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids).map((shotId) => {
    const shot = helpers.asRecord(shotById.get(shotId))
    const camera = helpers.asRecord(shot.camera)
    const cameraFraming = helpers.readText(camera.framing) || helpers.readText(shot.framing) || 'shot-appropriate framing'
    const cameraAngle = [helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')
    const screenDirection = helpers.readText(camera.screenDirectionRule ?? camera.screen_direction_rule)
      || helpers.readText(shot.screenDirection ?? shot.screen_direction)
    const action = helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.title)
    return {
      shotId,
      cameraFraming,
      cameraAngle,
      screenDirection,
      subjectFocus: helpers.readText(shot.subjectFocus ?? shot.subject_focus)
        || helpers.readStringArray(helpers.asRecord(shot.refs).visibleCharacterRefIds ?? helpers.asRecord(shot.refs).visible_character_ref_ids)[0]
        || 'primary story subject',
      stagingBrief: helpers.readText(shot.stagingBrief ?? shot.staging_brief) || action,
      coverageIntent: [
        `Create a coverage direction for ${helpers.readText(shot.title) || shotId}.`,
        cameraFraming ? `Framing: ${cameraFraming}.` : '',
        cameraAngle ? `Angle/lens/movement: ${cameraAngle}.` : '',
        screenDirection ? `Screen direction: ${screenDirection}.` : '',
        action ? `Stage around: ${action}.` : '',
      ].filter(Boolean).join(' '),
    }
  }).filter((intent) => intent.shotId)
  const fallback = sequenceAnimaticCoverageIntentBatchSchema.parse({
    intents: fallbackIntents.length > 0 ? fallbackIntents : [{
      shotId: 'shot',
      cameraFraming: 'wide',
      coverageIntent: 'Create a clear coverage direction from the shot camera facts and spatial binding.',
    }],
    diagnostics: ['Deterministic coverage intent fallback.'],
  })
  const planningPrompt = [
    'Plan shot coverage directions for a fresh Scene Board zone before image generation.',
    'Return one compact JSON intent per shot. Do not create coverage setup ids, image prompts, captions, labels, or storyboard text.',
    'Each intent should preserve camera/framing, subject focus, screen direction, staging, and the specific coverage purpose for this shot.',
    'Use existing formal camera facts first. If a shot is sparse, infer a conservative cinematic coverage direction from title, action, dialogue, and spatial binding.',
    '',
    'Board scope',
    JSON.stringify({
      sceneId: helpers.readText(batchRecord.sceneId),
      setId: helpers.readText(batchRecord.setId),
      zoneId: helpers.readText(batchRecord.zoneId),
      shotIds: helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids),
      sceneGraphOverrides: helpers.readArray(batchRecord.sceneGraphOverrides ?? batchRecord.scene_graph_overrides).map(helpers.asRecord),
      referenceAssetKeys: helpers.readStringArray(batchRecord.referenceAssetKeys ?? batchRecord.reference_asset_keys),
    }, null, 2),
    '',
    'Shots',
    JSON.stringify(shots.map((shot) => ({
      id: helpers.readText(shot.id),
      title: helpers.readText(shot.title),
      action: helpers.readText(shot.action) || helpers.readText(shot.description),
      camera: helpers.asRecord(shot.camera),
      lighting: helpers.readText(shot.lighting),
      dialogue: helpers.readArray(shot.dialogue).map(helpers.asRecord).slice(0, 5),
      performance: helpers.readArray(shot.performance ?? shot.performanceBeats ?? shot.performance_beats).map(helpers.asRecord).slice(0, 5),
      refs: helpers.asRecord(shot.refs),
      sceneBinding: helpers.asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.shotBinding ?? shot.shot_binding),
    })), null, 2),
    '',
    'Location references',
    JSON.stringify(helpers.readArray(pack.entities).map(helpers.asRecord).map((entity) => ({
      name: helpers.readText(entity.name ?? entity.title ?? entity.label),
      role: helpers.readText(entity.role),
      summary: helpers.readText(entity.summary ?? entity.visualDescription ?? entity.visual_description),
    })).slice(0, 16), null, 2),
  ].filter(Boolean).join('\n')
  const structuredResult = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_coverage_intent_batch',
    schema: sequenceAnimaticCoverageIntentBatchSchema,
    instructions: 'Return strict JSON only. Produce coverage direction records keyed by shot id; never invent workflow ids or reusable coverage setup ids.',
    prompt: planningPrompt,
    fallback,
    maxOutputTokens: 5200,
  })
  const requestedShotIds = new Set(helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids))
  const intents = structuredResult.value.intents
    .map((intent) => ({
      ...intent,
      shotId: helpers.readText(intent.shotId),
      cameraFraming: helpers.readText(intent.cameraFraming),
      cameraAngle: helpers.readText(intent.cameraAngle),
      screenDirection: helpers.readText(intent.screenDirection),
      subjectFocus: helpers.readText(intent.subjectFocus),
      stagingBrief: helpers.readText(intent.stagingBrief),
      coverageIntent: helpers.readText(intent.coverageIntent),
    }))
    .filter((intent) => intent.shotId && requestedShotIds.has(intent.shotId))
  const normalized = sequenceAnimaticCoverageIntentBatchSchema.parse({
    ...structuredResult.value,
    intents: intents.length > 0 ? intents : fallback.intents,
  })
  const outputs = {
    coverageIntents: normalized.intents,
    coverage_intents: normalized.intents,
    coverageIntentBatch: normalized,
    coverage_intent_batch: normalized,
    intentBatch: batchRecord,
    intent_batch: batchRecord,
    shots,
    assetPack: pack,
    asset_pack: pack,
    text: JSON.stringify(normalized, null, 2),
    prompt: planningPrompt,
    fallbackUsed: structuredResult.fallbackUsed,
    fallbackReason: structuredResult.fallbackReason,
    deterministic: structuredResult.fallbackUsed,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structuredResult.provider,
    model: structuredResult.model,
  })
}

export async function sequenceAnimaticCoverageIntentArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamIntentBatch = helpers.readFirstUpstreamRecord(context.upstream, ['intentBatch', 'intent_batch'])
  const batchRecord = Object.keys(upstreamIntentBatch).length > 0
    ? upstreamIntentBatch
    : helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const intents = helpers.readFirstUpstreamArray(context.upstream, ['coverageIntents', 'coverage_intents']).map(helpers.asRecord)
  const batchId = helpers.readText(batchRecord.id ?? batchRecord.batchId) || helpers.readText(config.coverageIntentBatchId)
  if (!batchId) throw new Error('Coverage intent artifact requires a batch id.')

  const now = new Date().toISOString()
  const masterRequestId = helpers.readText(config.masterRequestId)
  const sourceHash = helpers.readText(batchRecord.sourceHash ?? config.sourceHash)
  const coverageIntentByShotId = Object.fromEntries(intents.map((intent) => {
    const shotId = helpers.readText(intent.shotId)
    return [shotId, {
      shotId,
      sceneId: helpers.readText(batchRecord.sceneId ?? config.sceneId),
      setId: helpers.readText(batchRecord.setId ?? config.setId),
      zoneId: helpers.readText(batchRecord.zoneId ?? config.zoneId),
      primarySpotId: helpers.readText(intent.primarySpotId ?? intent.primary_spot_id),
      coverageIntent: helpers.readText(intent.coverageIntent ?? intent.coverage_intent),
      cameraFraming: helpers.readText(intent.cameraFraming ?? intent.camera_framing),
      cameraAngle: helpers.readText(intent.cameraAngle ?? intent.camera_angle),
      screenDirection: helpers.readText(intent.screenDirection ?? intent.screen_direction),
      subjectFocus: helpers.readText(intent.subjectFocus ?? intent.subject_focus),
      stagingBrief: helpers.readText(intent.stagingBrief ?? intent.staging_brief),
      sourceHash,
      updatedAt: now,
      workflowRequestId: context.run.requestId,
    }]
  }).filter(([shotId]) => Boolean(shotId)))
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(batchId)}.sequence-animatic-coverage-intent-batch`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(batchRecord.title) || helpers.titleFromRefLike(batchId)} Coverage Directions`,
    summary: 'Shot coverage directions planned for a Scene Board zone before zone camera grid generation.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-coverage-intent-artifact-v1',
      role: 'sequence_animatic_coverage_intent_batch',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'coverage_intent_batch',
      screenplayAnimaticRole: 'coverage_intent_batch',
      masterRequestId,
      sceneId: helpers.readText(batchRecord.sceneId ?? config.sceneId),
      setId: helpers.readText(batchRecord.setId ?? config.setId),
      zoneId: helpers.readText(batchRecord.zoneId ?? config.zoneId),
      shotIds: helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids),
      sourceHash,
      intentBatch: batchRecord,
      intent_batch: batchRecord,
      prompt,
      coverageIntentByShotId,
      coverage_intent_by_shot_id: coverageIntentByShotId,
      coverageIntents: Object.values(coverageIntentByShotId),
      coverage_intents: Object.values(coverageIntentByShotId),
    },
  })

  if (masterRequestId) {
    const client = context.client as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
          }
        }
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
    const masterResponse = await client
      .from('output_requests')
      .select('metadata')
      .eq('id', masterRequestId)
      .maybeSingle()
    if (!masterResponse.error && masterResponse.data) {
      const masterMetadata = helpers.asRecord(helpers.asRecord(masterResponse.data).metadata)
      const previousRegistry = helpers.asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
      const previousCoverageRegistry = helpers.asRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry)
      const previousIntents = {
        ...helpers.asRecord(previousCoverageRegistry.coverageIntentByShotId ?? previousCoverageRegistry.coverage_intent_by_shot_id),
        ...helpers.asRecord(previousRegistry.coverageIntentByShotId ?? previousRegistry.coverage_intent_by_shot_id),
      }
      const nextIntents = { ...previousIntents, ...coverageIntentByShotId }
      const registry = {
        ...previousRegistry,
        role: 'sequence_animatic_zone_coverage_registry',
        contractVersion: helpers.readText(previousRegistry.contractVersion) || 'zone_camera_coverage_grid_registry_v1',
        sourceMasterRequestId: masterRequestId,
        revision: (Number(previousRegistry.revision ?? 0) || 0) + 1,
        coverageIntentByShotId: nextIntents,
        coverage_intent_by_shot_id: nextIntents,
        updatedAt: now,
        updatedByCoverageIntentBatchId: batchId,
      }
      const coverageRegistry = {
        ...previousCoverageRegistry,
        coverageIntentByShotId: nextIntents,
        coverage_intent_by_shot_id: nextIntents,
        updatedAt: now,
        updatedByCoverageIntentBatchId: batchId,
      }
      const updateResponse = await client
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            sequenceAnimaticZoneCoverageRegistry: registry,
            sequence_animatic_zone_coverage_registry: registry,
            sequenceAnimaticCoverageRegistry: coverageRegistry,
            sequence_animatic_coverage_registry: coverageRegistry,
          },
        })
        .eq('id', masterRequestId)
      if (updateResponse.error) throw new Error(updateResponse.error.message)
    }
  }

  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'coverage_intent_batch_ready',
    payload: {
      batchId,
      artifactKey: artifact.key,
      shotIds: Object.keys(coverageIntentByShotId),
    },
    metadata: { source: 'sequence_animatic_coverage_intent_workflow' },
    dedupe: { batchId },
  })

  const outputs = {
    artifactKey: artifact.key,
    artifact,
    artifacts: [artifact],
    coverageIntentByShotId,
    coverage_intent_by_shot_id: coverageIntentByShotId,
    coverageIntents: Object.values(coverageIntentByShotId),
    coverage_intents: Object.values(coverageIntentByShotId),
    intentBatch: batchRecord,
    intent_batch: batchRecord,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-intent-artifact-v1' })
}

export async function sequenceAnimaticCoveragePlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
  if (!Object.keys(directorPlan).length) throw new Error('Coverage planner requires a merged shot continuity plan.')
  const fallbackCoveragePlan = normalizeSequenceAnimaticCoveragePlan({ directorPlan })
  let providerRequestId: string | undefined
  let fallbackUsed = false
  let fallbackReason = ''
  let proposedCoveragePlan: LooseRecord = {}
  try {
    const structuredResult = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_coverage_plan',
      schema: sequenceAnimaticCoveragePlanLlmSchema,
      instructions: [
        'You are a film coverage supervisor assigning reusable camera/staging setups after shots already exist.',
        'Return strict JSON only. Do not create shots, scene graph nodes, image prompts, or coverage anchor art.',
      ].join('\n'),
      prompt: [
        'Assign every shot to exactly one coverage setup.',
        'Only group shots when they share the same set, zone, primary spot, camera side/framing intent, screen direction, and visible subject arrangement.',
        'Never assign a setup subject that is not visible in every shot using that setup.',
        'Never group shots across different primarySpotId values unless the setupKind is wide_master and all shots share the same set and zone.',
        'Create a new setup when blocking, camera side, subject arrangement, or primary spot changes.',
        'Use concise setup titles and stagingBrief fields. These are planning records, not image prompts.',
        'Return coverageSetups plus coverageSetupByShotId. Every shot id must appear in coverageSetupByShotId exactly once.',
        helpers.compactForPrompt({
          shots: helpers.readArray(directorPlan.shots).map(helpers.asRecord).map((shot) => ({
            id: helpers.readText(shot.id),
            index: Number(shot.index ?? 0) || 0,
            blockId: helpers.readText(shot.blockId ?? shot.storyboardBlockId),
            title: helpers.readText(shot.title),
            action: helpers.readText(shot.action ?? shot.description),
            camera: helpers.asRecord(shot.camera),
            lighting: helpers.readText(shot.lighting),
            refs: sequenceAnimaticCoverageShotRefs(shot),
            sceneBinding: sequenceAnimaticCoverageSpatialFields(shot),
            sourceSceneId: helpers.readText(shot.sourceSceneId ?? shot.sceneId),
          })),
          blocks: helpers.readArray(directorPlan.blocks).map(helpers.asRecord).map((block) => ({
            id: helpers.readText(block.id),
            index: Number(block.index ?? 0) || 0,
            title: helpers.readText(block.title),
            summary: helpers.readText(block.summary),
            shotIds: helpers.readStringArray(block.shotIds ?? block.shot_ids),
          })),
          continuityGraphV2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
          screenplay: {
            title: helpers.readText(screenplayDraft.title),
            summary: helpers.readText(screenplayDraft.summary),
            text: helpers.readText(screenplayDraft.screenplayMarkdown ?? screenplayDraft.markdown ?? screenplayDraft.text).slice(0, 8000),
          },
          assetPackSummary: {
            selectedEntityKeys: cinematicAssetPackEntityKeys(assetPack),
            entityCount: helpers.readArray(assetPack.entities).length,
          },
          world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        }, 22000),
      ].join('\n\n'),
      fallback: fallbackCoveragePlan,
      maxOutputTokens: 12000,
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
            sequenceAnimaticCoveragePlan: true,
          },
        })
      },
    })
    providerRequestId = structuredResult.providerRequestId
    fallbackUsed = structuredResult.fallbackUsed
    fallbackReason = structuredResult.fallbackReason
    proposedCoveragePlan = helpers.asRecord(structuredResult.value)
  } catch (error) {
    fallbackUsed = true
    fallbackReason = error instanceof Error ? error.message : 'Coverage planner LLM failed.'
    proposedCoveragePlan = fallbackCoveragePlan
  }
  const coveragePlan = normalizeSequenceAnimaticCoveragePlan({ directorPlan, proposedPlan: proposedCoveragePlan })
  const finalizedDirectorPlan = applySequenceAnimaticCoveragePlanToDirectorPlan({ directorPlan, coveragePlan })
  const outputs = {
    coveragePlan,
    coverage_plan: coveragePlan,
    coverageSetups: helpers.readArray(coveragePlan.coverageSetups),
    coverage_setups: helpers.readArray(coveragePlan.coverageSetups),
    coverageSetupByShotId: helpers.asRecord(coveragePlan.coverageSetupByShotId),
    coverage_setup_by_shot_id: helpers.asRecord(coveragePlan.coverageSetupByShotId),
    directorPlan: finalizedDirectorPlan,
    director_plan: finalizedDirectorPlan,
    shotContinuityPlan: finalizedDirectorPlan,
    shot_continuity_plan: finalizedDirectorPlan,
    blocks: helpers.readArray(finalizedDirectorPlan.blocks),
    continuityGraphV2: helpers.asRecord(finalizedDirectorPlan.continuityGraphV2),
    continuity_graph_v2: helpers.asRecord(finalizedDirectorPlan.continuityGraphV2),
    shotBindings: helpers.asRecord(finalizedDirectorPlan.shotBindings),
    shot_bindings: helpers.asRecord(finalizedDirectorPlan.shotBindings),
    fallbackUsed,
    fallbackReason,
    text: JSON.stringify({ coveragePlan, fallbackUsed, fallbackReason }, null, 2),
    deterministic: fallbackUsed,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: fallbackUsed ? 'graphcore' : 'openai',
    model: fallbackUsed ? 'deterministic-sequence-animatic-coverage-plan-v1' : helpers.outputWorkflowTextModel(),
    providerRequestId,
  })
}

export async function sequenceAnimaticCoverageAnchorInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.asRecord(config.coverageSetup ?? config.coverage_setup)
  const shots = helpers.readArray(config.shots).map(helpers.asRecord)
  const rawAssetPack = helpers.asRecord(config.assetPack ?? config.asset_pack)
  const referenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8))
  const baseAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots,
    maxEntityCount: referenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys)
  const extraReferenceEntities = referenceAssetKeys.map((assetKey, index) => ({
    key: `coverage_anchor_ref_${index + 1}_${helpers.slugify(assetKey)}`,
    name: `Coverage dependency ${index + 1}`,
    type: 'continuity_asset',
    role: 'coverage_anchor_dependency_reference',
    summary: 'Generated scene-graph or canonical reference used to ground this coverage anchor.',
    visualDescription: 'Use this image to preserve spatial layout, materials, palette, lighting logic, and identity continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'coverage_anchor_dependency',
    selectedReferenceVariantLabel: `Coverage dependency ${index + 1}`,
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Coverage anchor visual reference plan dependency.',
  }))
  const assetPack = orderSequenceAnimaticAssetPackReferences({
    ...scopeAssetPackToReferenceAssetKeys({
      assetPack: baseAssetPack,
      referenceAssetKeys,
      fallbackEntities: extraReferenceEntities,
      referenceScope: 'sequence_animatic_coverage_anchor',
      limit: referenceLimit,
    }),
    continuityReferenceAssetKeys: referenceAssetKeys,
    coverageAnchorReferenceAssetKeys: referenceAssetKeys,
  })
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const outputs = {
    coverageSetup,
    coverage_setup: coverageSetup,
    shots,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText: sequenceAnimaticReferenceManifestText(assetPack),
    reference_manifest_text: sequenceAnimaticReferenceManifestText(assetPack),
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    text: JSON.stringify({ coverageSetup, shots, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-coverage-anchor-input-v1' })
}

export async function sequenceAnimaticCoverageAnchorBrief(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const sceneGraphOverride = helpers.asRecord(
    coverageSetup.sceneGraphOverride
      ?? coverageSetup.scene_graph_override
      ?? config.sceneGraphOverride
      ?? config.scene_graph_override,
  )
  const visualBriefOverride = helpers.readText(sceneGraphOverride.visualBriefOverride)
  const extraPromptDirection = helpers.readText(sceneGraphOverride.extraPromptDirection)
  const shots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const subjectLabels = [...new Set([
    ...helpers.readArray(assetPack.entities).map(helpers.asRecord)
      .filter((entity) => ['character_reference', 'temp_character_reference'].includes(sequenceAnimaticReferenceRole(entity)))
      .map((entity) => sequenceAnimaticReferenceName(entity, 'Subject')),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.visibleCharacterNames ?? shot.visible_character_names)),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.characterNames ?? shot.character_names)),
  ].map((label) => label.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 8)
  const camera = helpers.asRecord(coverageSetup.camera)
  const fallbackBrief = sequenceAnimaticCoverageAnchorBriefSchema.parse({
    cameraPosition: helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief) || helpers.readText(camera.framing),
    framing: helpers.readText(camera.framing) || helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind).replace(/_/g, ' '),
    screenDirection: helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
      || helpers.readText(camera.screenDirectionRule ?? camera.screen_direction_rule),
    subjectBlocking: helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)
      || shots.map((shot) => helpers.compactStoryboardSentence(helpers.readText(shot.action), '', 18)).filter(Boolean).join(' '),
    foregroundBackgroundPlan: 'Keep the parent spot/zone geography readable with clear foreground, midground, and background depth.',
    movementArrows: helpers.readStringArray(coverageSetup.movementArrows ?? coverageSetup.movement_arrows),
    labels: subjectLabels.length > 0 ? [...subjectLabels, 'camera', 'movement'] : ['subject', 'camera', 'movement'],
    visualNotes: shots.slice(0, 4)
      .map((shot) => helpers.compactStoryboardSentence(helpers.readText(shot.action ?? shot.description), '', 20))
      .filter(Boolean),
    mustNotInclude: ['final character likeness', 'wardrobe detail', 'decorative captions', 'UI panels', 'watermarks'],
  })
  let providerRequestId: string | undefined
  let brief = fallbackBrief
  let fallbackUsed = false
  let fallbackReason = ''
  try {
    const structuredResult = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_coverage_anchor_brief',
      schema: sequenceAnimaticCoverageAnchorBriefSchema,
      instructions: [
        'You are a cinematographer making a concise coverage-anchor staging brief.',
        'Return strict JSON only. This is not final art and not an image prompt.',
      ].join('\n'),
      prompt: [
        'Create a visual staging brief for one coverage anchor blockout plate.',
        'Use only the scoped setup, shot actions, visible subjects, camera facts, and location/reference summary below.',
        'Decide the camera position, framing, screen direction, subject placeholder positions, movement arrows, and foreground/background layout.',
        'Do not add subjects that are not visible in the provided shots. Do not create coverage setup ids.',
        JSON.stringify({
          coverageSetup: {
            id: setupId,
            title: helpers.readText(coverageSetup.title),
            setupKind: helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind),
            setId: helpers.readText(coverageSetup.setId ?? coverageSetup.set_id),
            zoneId: helpers.readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
            primarySpotId: helpers.readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id),
            viewpointId: helpers.readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
            characterRefIds: helpers.readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
            screenDirection: helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction),
            camera,
            lighting: helpers.readText(coverageSetup.lighting),
            stagingBrief: helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief),
            visualBriefOverride,
            extraPromptDirection,
          },
          shots: shots.slice(0, 8).map((shot) => ({
            id: helpers.readText(shot.id),
            title: helpers.readText(shot.title),
            action: helpers.readText(shot.action ?? shot.description),
            camera: helpers.asRecord(shot.camera),
            lighting: helpers.readText(shot.lighting),
            refs: helpers.asRecord(shot.refs),
            sceneBinding: helpers.asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.shotBinding ?? shot.shot_binding),
          })),
          referenceSummary: sequenceAnimaticReferenceManifestText(assetPack),
        }, null, 2).slice(0, 14000),
      ].join('\n\n'),
      fallback: fallbackBrief,
      maxOutputTokens: 3000,
      shouldCancel: context.shouldCancel,
      onProgress: async (progress) => {
        await context.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            sequenceAnimaticCoverageAnchorBrief: true,
          },
        })
      },
    })
    providerRequestId = structuredResult.providerRequestId
    brief = sequenceAnimaticCoverageAnchorBriefSchema.parse(structuredResult.value)
    fallbackUsed = structuredResult.fallbackUsed
    fallbackReason = structuredResult.fallbackReason
  } catch (error) {
    fallbackUsed = true
    fallbackReason = error instanceof Error ? error.message : 'Coverage anchor brief LLM failed.'
    brief = fallbackBrief
  }
  const text = [
    brief.cameraPosition ? `Camera position: ${brief.cameraPosition}` : '',
    brief.framing ? `Framing: ${brief.framing}` : '',
    brief.screenDirection ? `Screen direction: ${brief.screenDirection}` : '',
    brief.subjectBlocking ? `Subject blocking: ${brief.subjectBlocking}` : '',
    brief.foregroundBackgroundPlan ? `Foreground/background: ${brief.foregroundBackgroundPlan}` : '',
    brief.movementArrows.length > 0 ? `Movement arrows: ${brief.movementArrows.join('; ')}` : '',
    brief.labels.length > 0 ? `Labels: ${brief.labels.join(', ')}` : '',
    brief.visualNotes.length > 0 ? `Visual notes: ${brief.visualNotes.join('; ')}` : '',
  ].filter(Boolean).join('\n')
  const outputs = {
    coverageBrief: brief,
    coverage_brief: brief,
    promptBrief: text,
    prompt_brief: text,
    coverageSetup,
    coverage_setup: coverageSetup,
    sceneGraphOverride,
    scene_graph_override: sceneGraphOverride,
    shots,
    assetPack,
    asset_pack: assetPack,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    fallbackUsed,
    fallbackReason,
    text,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: fallbackUsed ? 'graphcore' : 'openai',
    model: fallbackUsed ? 'deterministic-sequence-animatic-coverage-anchor-brief-v1' : helpers.outputWorkflowTextModel(),
    providerRequestId,
  })
}

export async function sequenceAnimaticCoverageAnchorPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const sceneGraphOverride = helpers.asRecord(
    coverageSetup.sceneGraphOverride
      ?? coverageSetup.scene_graph_override
      ?? config.sceneGraphOverride
      ?? config.scene_graph_override,
  )
  const visualBriefOverride = helpers.readText(sceneGraphOverride.visualBriefOverride)
  const extraPromptDirection = helpers.readText(sceneGraphOverride.extraPromptDirection)
  const shots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const coverageBrief = helpers.readFirstUpstreamRecord(context.upstream, ['coverageBrief', 'coverage_brief'])
  const coverageBriefText = helpers.readFirstUpstreamText(context.upstream, ['promptBrief', 'prompt_brief', 'coverageBriefText', 'coverage_brief_text'])
  const referenceManifestText = sequenceAnimaticReferenceManifestText(assetPack)
  const coverageScope = helpers.readText(config.coverageAnchorScope ?? config.coverage_anchor_scope)
  const placementLabels = [...new Set([
    ...helpers.readArray(assetPack.entities).map(helpers.asRecord)
      .filter((entity) => ['character_reference', 'temp_character_reference'].includes(sequenceAnimaticReferenceRole(entity)))
      .map((entity) => sequenceAnimaticReferenceName(entity, 'Subject')),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.visibleCharacterNames ?? shot.visible_character_names)),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.characterNames ?? shot.character_names)),
  ].map((label) => label.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 8)
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const linkedShotSummary = shots.slice(0, 8).map((shot) => {
    const camera = helpers.asRecord(shot.camera)
    return [
      helpers.readText(shot.title),
      helpers.readText(shot.action) || helpers.readText(shot.description),
      [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; '),
    ].filter(Boolean).join(' / ')
  }).join('\n')
  const promptText = [
    'Create one labeled coverage blockout plate for an animatic shot setup. This is a planning reference, not final art.',
    'Show environment framing, camera position feel, screen direction, movement arrows, and simple subject placeholders.',
    'Use attached set/zone/spot reference images as location references for spatial layout, materials, weather, lighting logic, and geography.',
    'Use named character/item reference images only to know which placeholders to place, their scale, and their rough silhouette; do not render detailed faces, wardrobe likeness, or final character art.',
    'Every subject placeholder must correspond to a visible shot subject in the reference map or linked shot summary. Do not add unrelated setup subjects.',
    'Sparse placement labels and arrows are allowed and required. Keep labels short and readable.',
    'Ban decorative captions, paragraphs, UI panels, watermarks, borders, split panels, and polished final-frame character detail.',
    '',
    `Coverage blockout: ${helpers.readText(coverageSetup.title) || setupId}`,
    coverageBriefText ? `Creative staging brief:\n${coverageBriefText}` : '',
    helpers.readStringArray(coverageBrief.labels).length > 0 ? `Required labels: ${helpers.readStringArray(coverageBrief.labels).join(', ')}` : '',
    helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind) ? `Setup kind: ${helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind).replace(/_/g, ' ')}` : '',
    helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief) ? `Staging: ${helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)}` : '',
    helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction) ? `Screen direction: ${helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)}` : '',
    helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief) ? `Camera: ${helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief)}` : '',
    helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief) ? `Lighting: ${helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief)}` : '',
    coverageScope === 'shot_scoped' ? 'Scope: current shot only; ignore unrelated linked setup shots.' : '',
    placementLabels.length > 0 ? `Placement labels: ${placementLabels.join(', ')}, camera, movement` : 'Placement labels: camera, movement, subject placeholders',
    linkedShotSummary ? `Linked shots:\n${linkedShotSummary}` : '',
    referenceManifestText ? `Reference map:\n${referenceManifestText}` : '',
    visualBriefOverride ? `User-edited coverage visual brief:\n${visualBriefOverride}` : '',
    extraPromptDirection ? `Additional user generation direction:\n${extraPromptDirection}` : '',
  ].filter(Boolean).join('\n')
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const outputs = {
    prompt: promptText,
    text: promptText,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageBrief,
    coverage_brief: coverageBrief,
    sceneGraphOverride,
    scene_graph_override: sceneGraphOverride,
    promptBrief: coverageBriefText,
    prompt_brief: coverageBriefText,
    shots,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-coverage-anchor-prompt-v1' })
}

export async function sequenceAnimaticCoverageAnchorArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const image = helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const coverageAnchorScopeKey = helpers.readText(config.coverageAnchorScopeKey)
  const coverageSetupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const coverageIdentityValue = coverageAnchorScopeKey || coverageSetupId
  if (!coverageIdentityValue) throw new Error('Coverage anchor artifact requires a coverage scope key or setup id.')
  const coverageAnchorScope = helpers.readText(config.coverageAnchorScope)
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Coverage anchor image did not produce an asset key.')
  const qcFindings = assetKey ? [] : ['Coverage anchor image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const anchor = {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'coverage_anchor',
    sequenceAnimaticRole: 'coverage_anchor',
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    masterRequestId: helpers.readText(config.masterRequestId),
    coverageSetupId,
    coverageAnchorScopeKey,
    coverageAnchorScope,
    coverageSetup,
    coverage_setup: coverageSetup,
    shotIds: helpers.readStringArray(config.shotIds).length > 0 ? helpers.readStringArray(config.shotIds) : helpers.readStringArray(coverageSetup.shotIds),
    storyboardBlockIds: helpers.readStringArray(config.storyboardBlockIds).length > 0 ? helpers.readStringArray(config.storyboardBlockIds) : helpers.readStringArray(coverageSetup.blockIds ?? coverageSetup.storyboardBlockIds),
    assetKey,
    image,
    prompt,
    qcStatus,
    qcFindings,
    status: assetKey ? 'ready' : 'failed',
    generatedAt: new Date().toISOString(),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(coverageIdentityValue)}.sequence-animatic-coverage-anchor`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(coverageSetup.title) || helpers.titleFromRefLike(coverageIdentityValue)} Coverage Anchor`,
    summary: 'Reusable visual keyframe anchor for a sequence animatic coverage setup.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-coverage-anchor-artifact-v1',
      role: 'sequence_animatic_coverage_anchor',
      coverageAnchorMode: helpers.coverageAnchorMode,
      coverage_anchor_mode: helpers.coverageAnchorMode,
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'coverage_anchor',
      screenplayAnimaticRole: 'coverage_anchor',
      masterRequestId: anchor.masterRequestId,
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      coverageSetup,
      coverage_setup: coverageSetup,
      shotIds: anchor.shotIds,
      storyboardBlockIds: anchor.storyboardBlockIds,
      assetKey,
      requiredReferenceAssetKeys: helpers.readStringArray(config.requiredReferenceAssetKeys),
      omittedReferenceAssetKeys: helpers.readStringArray(config.omittedReferenceAssetKeys),
      sourceReferenceHash: helpers.readText(config.sourceReferenceHash),
      visualPlanHash: helpers.readText(config.visualPlanHash),
      qcStatus,
      qcFindings,
      prompt,
      image,
      anchor,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: anchor.masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: assetKey ? 'coverage_anchor_ready' : 'coverage_anchor_failed',
    payload: {
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      assetKey,
      artifactKey: artifact.key,
      status: anchor.status,
      shotIds: anchor.shotIds,
    },
    metadata: { source: 'sequence_animatic_keyframe_workflow' },
    dedupe: { coverageSetupId: coverageSetupId || null, coverageAnchorScopeKey: coverageAnchorScopeKey || null },
  })
  const identityKey = coverageAnchorScopeKey ? 'coverageAnchorScopeKey' : 'coverageSetupId'
  const identityValue = coverageIdentityValue
  const globalAssetStatus = assetKey ? helpers.readText(image.globalAssetStatus ?? image.global_asset_status) || 'generated' : 'missing'
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    reference: {
      status: assetKey ? 'ready' : 'missing',
      assetKey: assetKey || null,
      artifactKey: artifact.key,
      role: 'coverage_anchor',
      sourceArtifactRole: 'sequence_animatic_coverage_anchor',
      identityKey,
      identityValue,
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      globalAssetStatus,
    },
    coverageAnchor: anchor,
    coverage_anchor: anchor,
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    coverageSetup,
    coverage_setup: coverageSetup,
    image,
    keyframe: image,
    primaryReferenceImage: image,
    globalAssetStatus,
    global_asset_status: globalAssetStatus,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-anchor-artifact-v1' })
}

const sequenceAnimaticCoverageHandlers = {
  sequence_animatic_coverage_plan: sequenceAnimaticCoveragePlan,
  sequence_animatic_coverage_intent_input: sequenceAnimaticCoverageIntentInput,
  sequence_animatic_coverage_intent_plan: sequenceAnimaticCoverageIntentPlan,
  sequence_animatic_coverage_intent_artifact: sequenceAnimaticCoverageIntentArtifact,
  sequence_animatic_coverage_anchor_input: sequenceAnimaticCoverageAnchorInput,
  sequence_animatic_coverage_anchor_brief: sequenceAnimaticCoverageAnchorBrief,
  sequence_animatic_coverage_anchor_prompt: sequenceAnimaticCoverageAnchorPrompt,
  sequence_animatic_coverage_anchor_artifact: sequenceAnimaticCoverageAnchorArtifact,
}

const sequenceAnimaticCoverageWorkflowNodePackKey = 'sequence_animatic_coverage'

export const sequenceAnimaticCoverageWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticCoverageHandlers
>({
  packKey: sequenceAnimaticCoverageWorkflowNodePackKey,
  handlers: sequenceAnimaticCoverageHandlers,
})

export const sequenceAnimaticCoverageWorkflowNodeHandlerKeys = sequenceAnimaticCoverageWorkflowNodePack.handlerKeys

function createSequenceAnimaticCoverageNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticCoverageHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic coverage workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticCoverageWorkflowNodePackKey,
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

export const sequenceAnimaticCoverageWorkflowNodeScaffolds = [
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shotContinuityPlan',
      'upstream.directorPlan',
      'upstream.screenplayDraft',
      'upstream.assetPack',
      'upstream.context',
      'config.masterRequestId',
      'config.coveragePlanPolicyVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'providerStatus',
      'providerRequestId',
      'readyArtifactCount',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_intent_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.intentBatch',
      'config.shots',
      'config.assetPack',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_intent_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.intentBatch',
      'upstream.shots',
      'upstream.assetPack',
      'config.intentBatch',
      'config.shots',
      'config.assetPack',
      'config.masterRequestId',
      'config.coverageIntentPolicyVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'providerStatus',
      'providerRequestId',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_intent_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.intentBatch',
      'upstream.coverageIntents',
      'upstream.prompt',
      'config.coverageIntentBatchId',
      'config.masterRequestId',
      'config.sourceHash',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_anchor_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.coverageSetup',
      'config.shots',
      'config.assetPack',
      'config.referenceAssetKeys',
      'config.assetPackReferenceLimit',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_anchor_brief',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.coverageSetup',
      'upstream.shots',
      'upstream.assetPack',
      'config.coverageSetupId',
      'config.sceneGraphOverride',
      'config.masterRequestId',
      'config.coverageAnchorBriefPolicyVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'providerStatus',
      'providerRequestId',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_anchor_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.coverageSetup',
      'upstream.coverageBrief',
      'upstream.shots',
      'upstream.assetPack',
      'config.coverageSetupId',
      'config.coverageAnchorScope',
      'config.sceneGraphOverride',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticCoverageNodeScaffold({
    purpose: 'sequence_animatic_coverage_anchor_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.coverageSetup',
      'upstream.image',
      'upstream.prompt',
      'config.coverageAnchorScopeKey',
      'config.coverageAnchorScope',
      'config.coverageSetupId',
      'config.requiredReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
]

export const sequenceAnimaticCoverageWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticCoverageWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticCoverageWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticCoverageWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
