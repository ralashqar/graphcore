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
  continuityBlockNodeSuffix,
  emptySequenceAnimaticContinuityBlockDelta,
  finalizeSequenceAnimaticContinuityGraphV2,
  mergeSequenceAnimaticContinuityGraphV2,
  parseSequenceAnimaticGraphV2,
  previousContinuityGraphNodeKeys,
  repairSequenceAnimaticContinuityBlockDelta,
  sequenceAnimaticBlockShots,
  sequenceAnimaticContinuityBlockDeltaSchema,
  sequenceAnimaticContinuityBlockStatesFromGraph,
  sequenceAnimaticContinuityCoverage,
  sequenceAnimaticContinuityGraphStatusFromBlockStates,
  sequenceAnimaticEmptyGraphV2,
  sequenceAnimaticGlobalStoryboardBlock,
  sequenceAnimaticSeededBlockStatesFromCoverage,
  withSequenceAnimaticContinuityAssetState,
} from './output-workflow-sequence-animatic-continuity-graph-runtime.ts'
import {
  buildSequenceAnimaticContinuityPlannerContext,
  sequenceAnimaticReferenceCatalog,
} from './output-workflow-sequence-animatic-reference-runtime.ts'

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

function repairContinuityBlockDelta(input: {
  delta: LooseRecord
  graph: LooseRecord
  continuityPlannerContext: LooseRecord
  storyboardBlock: LooseRecord
  allowDeterministicFallback?: boolean
}): LooseRecord {
  return repairSequenceAnimaticContinuityBlockDelta(input as never) as LooseRecord
}

export async function sequenceAnimaticContinuityInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const manifest = helpers.asRecord(config.manifest)
  const configuredAssetPack = helpers.asRecord(config.assetPack)
  const assetPack = Object.keys(configuredAssetPack).length > 0 ? configuredAssetPack : helpers.asRecord(manifest.assetPack)
  const configuredCatalog = helpers.readArray(config.animaticReferenceCatalog)
  const animaticReferenceCatalog = configuredCatalog.length > 0
    ? configuredCatalog.map(helpers.asRecord)
    : helpers.readArray(sequenceAnimaticReferenceCatalog({
      animaticReferenceCatalog: helpers.asRecord(manifest.animaticReferenceCatalog),
      assetPack,
    })).map(helpers.asRecord)
  const screenplayDraft = helpers.asRecord(manifest.screenplayDraft)
  const shotPlan = helpers.asRecord(manifest.shotPlan)
  const shotBreakPlan = helpers.asRecord(manifest.shotBreakPlan)
  const continuityPlannerContext = buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan,
    shotBreakPlan,
    assetPack,
    animaticReferenceCatalog: animaticReferenceCatalog as never,
  })
  const outputs = {
    masterManifest: manifest,
    master_manifest: manifest,
    screenplay: screenplayDraft,
    screenplayDraft,
    screenplay_draft: screenplayDraft,
    shotBreakPlan,
    shot_break_plan: shotBreakPlan,
    shotPlan,
    shot_plan: shotPlan,
    assetPack,
    asset_pack: assetPack,
    animaticReferenceCatalog,
    animatic_reference_catalog: animaticReferenceCatalog,
    continuityPlannerContext,
    continuity_planner_context: continuityPlannerContext,
    screenplayAnimaticRole: 'continuity_pack',
    sequenceAnimaticRole: 'continuity_pack',
    text: JSON.stringify({
      continuityPlannerContext,
      shotBreakPlan,
      shotPlan,
      blockCount: Array.isArray(manifest.blocks) ? manifest.blocks.length : 0,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-continuity-input-v1' })
}

export async function sequenceAnimaticContinuitySeedGraph(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const continuityPlannerContext = helpers.readFirstUpstreamRecord(context.upstream, ['continuityPlannerContext', 'continuity_planner_context'])
  const continuityGraphV2 = sequenceAnimaticEmptyGraphV2(continuityPlannerContext)
  const outputs = {
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    text: JSON.stringify(continuityGraphV2, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-graph-seed-v2' })
}

export async function sequenceAnimaticContinuityGlobalPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const continuityPlannerContext = helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_input'], ['continuityPlannerContext', 'continuity_planner_context'])
  const graph = parseSequenceAnimaticGraphV2(helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_seed_graph'], ['continuityGraphV2', 'continuity_graph_v2']))
  const storyboardBlock = sequenceAnimaticGlobalStoryboardBlock(continuityPlannerContext)
  let planned: Awaited<ReturnType<SequenceAnimaticWorkflowNodePackHelpers['runBackgroundStructuredNode']>>
  try {
    const allShots = sequenceAnimaticBlockShots(continuityPlannerContext, storyboardBlock)
    planned = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_continuity_global_delta_v1',
      schema: sequenceAnimaticContinuityBlockDeltaSchema,
      instructions: 'You are a film continuity scene-graph planner. Return strict JSON only. Propose a compact output-local global scene-graph seed for all shots.',
      prompt: [
        'Plan a coherent global continuity structure across the whole animatic before per-block refinement.',
        'Create only physical location sets, zones, spots, and camera angles. Reuse the same IDs for repeated shots in the same physical place or angle.',
        'Assign preliminary shotBindings for every shot you can confidently bind. Missing/ambiguous shots may be left for block refinement and noted in warnings.',
        'Do not create world entities. Existing world refs and per-shot resolvedRefs are canonical and must be rejected as existing_world_entity if proposed as anchors.',
        'Never use a character name, speaker name, shot title, mood, action phrase, weather, fog, rain, lighting-only cue, or emotion as a set/zone/spot/angle name.',
        'continuityAnchorIds are only temporary character/prop asset anchor IDs. Spatial IDs must stay in setId, zoneId, primarySpotId, spotIds, viewpointId/angleId, and spatialNodeIds.',
        'Accept temporary characters/props only when they are physical, drawable, output-local, continuity-critical, and not existing world refs.',
        'assetAnchors must include specific visible incidental characters without canonical refs, even one-shot concrete roles such as vole mechanic, guard, courier, attendant, or shopkeeper.',
        'For props, use shot.description as the primary evidence. assetAnchors may include physical props without canonical refs only when the same prop appears in at least two shots and is the subject of action, character gaze, diagnosis, manipulation, failure, or repeated comparison.',
        'Audit every shot.description for physical object candidates. Every named object, mechanism, door/hatch, gauge, clock part, tube, valve, lever, clamp, tool, panel, note, map, or set-piece that appears in two or more shots must appear either in assetAnchors or rejectedCandidates; do not silently omit it.',
        'If a repeated physical object is better represented as a set-piece/spot/zone than a prop, create the appropriate location/spot structure and still include a rejectedCandidates entry explaining why it is not a prop anchor.',
        'Do not create one-shot prop anchors. Reject background-only objects, decor, practical lights, or props that are merely named but not acted on or compared.',
        'Do not promote passive background props or practical lights just because they appear in lighting notes.',
        'If a candidate is canonical, abstract, atmospheric, too generic, or low confidence, put it in rejectedCandidates with a reason instead of silently omitting it.',
        helpers.compactForPrompt({
          currentGraph: graph,
          blocks: helpers.readArray(continuityPlannerContext.blocks).map(helpers.asRecord),
          shots: allShots,
          existingWorldReferences: continuityPlannerContext.existingWorldReferences,
          unresolvedRefs: continuityPlannerContext.unresolvedRefs,
        }, 14000),
      ].filter(Boolean).join('\n\n'),
      fallback: emptySequenceAnimaticContinuityBlockDelta('global', 'LLM global continuity planner did not produce valid structured output.'),
      maxOutputTokens: 5200,
      priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerRequestId),
      providerStartedAt: helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerStartedAt) || helpers.readText(context.priorStep?.startedAt),
      timeoutMs: helpers.outputWorkflowContinuityBlockPlannerTimeoutMs(),
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
            continuityGlobalPlanner: true,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Continuity global planner failed.'
    throw new Error(`LLM continuity global planner failed and deterministic fallback is disabled: ${reason}`)
  }
  if (planned.fallbackUsed) {
    throw new Error(`LLM continuity global planner returned fallback output and deterministic fallback is disabled: ${planned.fallbackReason || 'structured output unavailable'}`)
  }
  const continuityBlockDelta = repairContinuityBlockDelta({
    delta: sequenceAnimaticContinuityBlockDeltaSchema.parse({
      ...helpers.asRecord(planned.value),
      blockId: 'global',
      warnings: [...helpers.readStringArray(helpers.asRecord(planned.value).warnings)],
    }),
    graph,
    continuityPlannerContext,
    storyboardBlock,
    allowDeterministicFallback: false,
  })
  const outputs = {
    continuityBlockDelta,
    continuity_block_delta: continuityBlockDelta,
    text: JSON.stringify(continuityBlockDelta, null, 2),
    deterministic: false,
    providerRequestId: planned.providerRequestId,
  }
  return result({ context, helpers, outputs, provider: planned.provider, model: planned.model, providerRequestId: planned.providerRequestId })
}

export async function sequenceAnimaticContinuityGlobalMerge(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const continuityPlannerContext = helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_input'], ['continuityPlannerContext', 'continuity_planner_context'])
  const graph = parseSequenceAnimaticGraphV2(helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_seed_graph'], ['continuityGraphV2', 'continuity_graph_v2']))
  const deltaRecord = helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_global_plan'], ['continuityBlockDelta', 'continuity_block_delta'])
  const storyboardBlock = sequenceAnimaticGlobalStoryboardBlock(continuityPlannerContext)
  if (Object.keys(deltaRecord).length === 0) {
    throw new Error('Continuity global merge missing LLM planner delta. Deterministic fallback is disabled.')
  }
  const delta = sequenceAnimaticContinuityBlockDeltaSchema.parse(repairContinuityBlockDelta({
    delta: sequenceAnimaticContinuityBlockDeltaSchema.parse(deltaRecord),
    graph,
    continuityPlannerContext,
    storyboardBlock,
    allowDeterministicFallback: false,
  }))
  const continuityGraphV2 = mergeSequenceAnimaticContinuityGraphV2({ graph, delta, continuityPlannerContext })
  const coverage = sequenceAnimaticContinuityCoverage(continuityGraphV2, continuityPlannerContext)
  const globalStructureState = {
    status: Number(coverage.boundShots ?? 0) > 0 ? 'ready' : 'needs_review',
    inputHash: helpers.hashOutputWorkflowValue({ shots: helpers.readArray(continuityPlannerContext.shots).map(helpers.asRecord), graphVersion: graph.version }),
    lastDeltaHash: helpers.hashOutputWorkflowValue(delta),
    warnings: delta.warnings,
    error: '',
    updatedAt: new Date().toISOString(),
  }
  const outputs = {
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    continuityBlockDelta: delta,
    continuity_block_delta: delta,
    globalStructureState,
    global_structure_state: globalStructureState,
    coverage,
    text: JSON.stringify({ globalStructureState, coverage, continuityGraphV2 }, null, 2),
    deterministic: false,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-global-merge-v1' })
}

export async function sequenceAnimaticContinuityBlockPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const continuityPlannerContext = helpers.readFirstUpstreamRecord(context.upstream, ['continuityPlannerContext', 'continuity_planner_context'])
  const graph = parseSequenceAnimaticGraphV2(helpers.readFirstUpstreamRecord(context.upstream, ['continuityGraphV2', 'continuity_graph_v2']))
  const storyboardBlock = helpers.asRecord(config.storyboardBlock)
  let planned: Awaited<ReturnType<SequenceAnimaticWorkflowNodePackHelpers['runBackgroundStructuredNode']>>
  try {
    const blockShots = sequenceAnimaticBlockShots(continuityPlannerContext, storyboardBlock)
    planned = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_continuity_block_delta_v2',
      schema: sequenceAnimaticContinuityBlockDeltaSchema,
      instructions: 'You are a film continuity scene-graph planner. Return strict JSON only. Propose an output-local graph delta for one storyboard block.',
      prompt: [
        'Plan continuity for exactly one storyboard block against the current evolving scene graph.',
        'Reuse existing graph IDs whenever the shot remains in the same set, zone, spot, or angle. Add new zones/spots/angles only when the shot needs distinct spatial continuity.',
        'Do not create world entities. Existing world refs are canonical; only create output-local graph nodes and temporary asset anchors.',
        'Never use a character name, speaker name, shot title, emotion, action phrase, or task phrase as a set/zone/spot/angle name. Spatial nodes must be physical spaces, camera positions, landmarks, thresholds, rooms, zones, or reusable set pieces.',
        'Never put setId, zoneId, primarySpotId, spotIds, viewpointId, or angleId into continuityAnchorIds. continuityAnchorIds are only temporary character/prop asset anchor IDs.',
        'Every shot in the block must receive a shotBindings entry with setId or worldLocationRefId, preferably zoneId, and primarySpotId/spotIds whenever a concrete physical point of interest matters. viewpointId/angleId is optional camera setup metadata.',
        'assetAnchors must include specific visible incidental characters without canonical refs, even one-shot concrete roles such as vole mechanic, guard, courier, attendant, or shopkeeper.',
        'For props, use shot.description as the primary evidence. assetAnchors may include physical props without canonical refs only when the same prop appears in at least two shots and is the subject of action, character gaze, diagnosis, manipulation, failure, or repeated comparison.',
        'Audit every shot.description for physical object candidates. Every named object, mechanism, door/hatch, gauge, clock part, tube, valve, lever, clamp, tool, panel, note, map, or set-piece that appears in two or more shots must appear either in assetAnchors or rejectedCandidates; do not silently omit it.',
        'If a repeated physical object is better represented as a set-piece/spot/zone than a prop, create the appropriate location/spot structure and still include a rejectedCandidates entry explaining why it is not a prop anchor.',
        'Do not create one-shot prop anchors. Reject background-only objects, decor, practical lights, or props that are merely named but not acted on or compared.',
        'Do not promote passive background props or practical lights just because they appear in lighting notes.',
        'Reject abstract, atmospheric, generic, or duplicate-world candidates in rejectedCandidates.',
        `Storyboard block:\n${helpers.compactForPrompt(storyboardBlock, 2000)}`,
        helpers.compactForPrompt({ currentGraph: graph, blockShots, existingWorldReferences: continuityPlannerContext.existingWorldReferences }, 9000),
      ].filter(Boolean).join('\n\n'),
      fallback: emptySequenceAnimaticContinuityBlockDelta(helpers.readText(storyboardBlock.id) || context.node.key, 'LLM block continuity planner did not produce valid structured output.'),
      maxOutputTokens: 3200,
      priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerRequestId),
      providerStartedAt: helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerStartedAt) || helpers.readText(context.priorStep?.startedAt),
      timeoutMs: helpers.outputWorkflowContinuityBlockPlannerTimeoutMs(),
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
            continuityBlockPlanner: true,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Continuity block planner failed.'
    throw new Error(`LLM continuity block planner failed and deterministic fallback is disabled: ${reason}`)
  }
  if (planned.fallbackUsed) {
    throw new Error(`LLM continuity block planner returned fallback output and deterministic fallback is disabled: ${planned.fallbackReason || 'structured output unavailable'}`)
  }
  const continuityBlockDelta = repairContinuityBlockDelta({
    delta: sequenceAnimaticContinuityBlockDeltaSchema.parse({
      ...helpers.asRecord(planned.value),
      warnings: [...helpers.readStringArray(helpers.asRecord(planned.value).warnings)],
    }),
    graph,
    continuityPlannerContext,
    storyboardBlock,
    allowDeterministicFallback: false,
  })
  const outputs = {
    continuityBlockDelta,
    continuity_block_delta: continuityBlockDelta,
    text: JSON.stringify(continuityBlockDelta, null, 2),
    deterministic: false,
    providerRequestId: planned.providerRequestId,
  }
  return result({ context, helpers, outputs, provider: planned.provider, model: planned.model, providerRequestId: planned.providerRequestId })
}

export async function sequenceAnimaticContinuityBlockMerge(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const blockSuffix = continuityBlockNodeSuffix(context.node.key)
  const continuityPlannerContext = helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_input'], ['continuityPlannerContext', 'continuity_planner_context'])
  const graph = parseSequenceAnimaticGraphV2(helpers.readPreferredUpstreamRecord(context.upstream, previousContinuityGraphNodeKeys(blockSuffix), ['continuityGraphV2', 'continuity_graph_v2']))
  const deltaRecord = helpers.readPreferredUpstreamRecord(context.upstream, [`continuity_block_${blockSuffix}_plan`], ['continuityBlockDelta', 'continuity_block_delta'])
  const storyboardBlock = helpers.asRecord(config.storyboardBlock)
  if (Object.keys(deltaRecord).length === 0) {
    throw new Error(`Continuity block merge missing LLM planner delta for ${helpers.readText(storyboardBlock.id) || context.node.key}. Deterministic fallback is disabled.`)
  }
  const delta = sequenceAnimaticContinuityBlockDeltaSchema.parse(repairContinuityBlockDelta({
    delta: sequenceAnimaticContinuityBlockDeltaSchema.parse(deltaRecord),
    graph,
    continuityPlannerContext,
    storyboardBlock,
    allowDeterministicFallback: false,
  }))
  const continuityGraphV2 = mergeSequenceAnimaticContinuityGraphV2({ graph, delta, continuityPlannerContext })
  const outputs = {
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    continuityBlockDelta: delta,
    continuity_block_delta: delta,
    text: JSON.stringify(continuityGraphV2, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-block-merge-v2' })
}

export async function sequenceAnimaticContinuityGraphFinalize(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const continuityGraphV2 = parseSequenceAnimaticGraphV2(helpers.readFirstUpstreamRecord(context.upstream, ['continuityGraphV2', 'continuity_graph_v2']))
  const finalized = finalizeSequenceAnimaticContinuityGraphV2(continuityGraphV2)
  const outputs = {
    ...finalized,
    continuity_graph_v2: finalized.continuityGraphV2,
    scene_graph: finalized.sceneGraph,
    shot_continuity_map: finalized.shotContinuityMap,
    shot_bindings: finalized.shotBindings,
    asset_anchors: finalized.assetAnchors,
    rejected_candidates: finalized.rejectedCandidates,
    text: JSON.stringify(finalized, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-graph-finalize-v2' })
}

export async function sequenceAnimaticContinuityStructureArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const blockSuffix = continuityBlockNodeSuffix(context.node.key)
  const isGlobalStructure = helpers.readText(config.storyboardBlockId) === 'global' || context.node.key === 'continuity_global_structure'
  const preferredGraphNodeKeys = isGlobalStructure ? ['continuity_global_merge'] : [`continuity_block_${blockSuffix}_merge`]
  const preferredDeltaNodeKeys = isGlobalStructure
    ? ['continuity_global_merge', 'continuity_global_plan']
    : [`continuity_block_${blockSuffix}_merge`, `continuity_block_${blockSuffix}_plan`]
  const continuityGraphV2 = parseSequenceAnimaticGraphV2(helpers.readPreferredUpstreamRecord(context.upstream, preferredGraphNodeKeys, ['continuityGraphV2', 'continuity_graph_v2']))
  const continuityBlockDelta = helpers.readPreferredUpstreamRecord(context.upstream, preferredDeltaNodeKeys, ['continuityBlockDelta', 'continuity_block_delta'])
  const continuityPlannerContext = helpers.readPreferredUpstreamRecord(context.upstream, ['continuity_input'], ['continuityPlannerContext', 'continuity_planner_context'])
  const finalized = finalizeSequenceAnimaticContinuityGraphV2(continuityGraphV2)
  const previousPack = helpers.readFirstUpstreamRecord(context.upstream, ['continuityPack', 'continuity_pack'])
  const previousBlockStates = helpers.asRecord(previousPack.blockStates ?? previousPack.block_states)
  const blockStates = isGlobalStructure
    ? sequenceAnimaticSeededBlockStatesFromCoverage(continuityGraphV2, continuityPlannerContext, previousBlockStates)
    : {
      ...previousBlockStates,
      ...sequenceAnimaticContinuityBlockStatesFromGraph(continuityGraphV2, {
        activeBlockId: helpers.readText(config.storyboardBlockId),
        activeDelta: continuityBlockDelta,
        status: 'ready',
      }),
    }
  const pendingDeltas = Object.keys(continuityBlockDelta).length > 0 && helpers.readText(config.storyboardBlockId) && !isGlobalStructure
    ? { [helpers.readText(config.storyboardBlockId)]: continuityBlockDelta }
    : {}
  const coverage = sequenceAnimaticContinuityCoverage(continuityGraphV2, continuityPlannerContext, blockStates)
  const upstreamGlobalState = helpers.readFirstUpstreamRecord(context.upstream, ['globalStructureState', 'global_structure_state'])
  const globalStructureState = isGlobalStructure
    ? (Object.keys(upstreamGlobalState).length > 0
      ? upstreamGlobalState
      : {
        status: Number(coverage.boundShots ?? 0) > 0 ? 'ready' : 'needs_review',
        inputHash: helpers.hashOutputWorkflowValue({ shots: helpers.readArray(continuityPlannerContext.shots).map(helpers.asRecord) }),
        lastDeltaHash: Object.keys(continuityBlockDelta).length > 0 ? helpers.hashOutputWorkflowValue(continuityBlockDelta) : '',
        warnings: finalized.warnings,
        error: '',
        updatedAt: new Date().toISOString(),
      })
    : helpers.asRecord(previousPack.globalStructureState ?? previousPack.global_structure_state)
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const manifestHash = helpers.readText(config.manifestHash) || helpers.readText(workflowMetadata.manifestHash)
  const masterManifestArtifactKey = helpers.readText(config.masterManifestArtifactKey) || helpers.readText(workflowMetadata.masterManifestArtifactKey)
  const packBase = {
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'continuity_pack',
    sequenceAnimaticRole: 'continuity_pack',
    planningMode: 'block_graph_v2',
    masterRequestId: helpers.readText(config.parentRequestId) || helpers.readText(workflowMetadata.parentRequestId) || helpers.readText(context.run.metadata?.parentRequestId),
    masterManifestArtifactKey,
    manifestHash,
    characterAnchors: finalized.assetAnchors.filter((anchor) => helpers.readText(anchor.type) === 'character'),
    propAnchors: finalized.assetAnchors.filter((anchor) => helpers.readText(anchor.type) === 'prop'),
    locationSpotAnchors: finalized.locationSpotAnchors,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    locationSets: finalized.locationSets,
    locationAngles: finalized.locationAngles,
    sceneGraph: finalized.sceneGraph,
    shotContinuityMap: finalized.shotContinuityMap,
    shotBindings: finalized.shotBindings,
    blockStates,
    pendingDeltas,
    globalStructureState,
    global_structure_state: globalStructureState,
    coverage,
    continuityGraphStatus: Number(coverage.totalShots ?? 0) > 0 && helpers.readStringArray(coverage.missingShotIds).length === 0
      ? 'ready'
      : sequenceAnimaticContinuityGraphStatusFromBlockStates(blockStates),
    rejectedCandidates: finalized.rejectedCandidates,
    plannerWarnings: finalized.warnings,
    plannerDiagnostics: finalized.diagnostics,
    anchorAssets: [],
    warnings: finalized.warnings,
    diagnostics: finalized.diagnostics,
  }
  const packWithAssets = withSequenceAnimaticContinuityAssetState(packBase, continuityGraphV2)
  const continuityPack: LooseRecord = {
    ...packWithAssets,
    continuityPackHash: helpers.hashOutputWorkflowValue(packWithAssets),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(helpers.readText(config.storyboardBlockId) || context.node.key)}.sequence-animatic-continuity-structure`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Structure`,
    summary: 'Sequence animatic continuity scene graph structure for storyboard block derivation.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-continuity-structure-v1',
      role: 'sequence_animatic_continuity_pack',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'continuity_pack',
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      planningMode: 'block_graph_v2',
      manifestHash,
      masterManifestArtifactKey,
      continuityPack,
      continuityGraphV2,
      continuity_graph_v2: continuityGraphV2,
      locationSets: finalized.locationSets,
      locationAngles: finalized.locationAngles,
      sceneGraph: finalized.sceneGraph,
      shotContinuityMap: finalized.shotContinuityMap,
      shotBindings: finalized.shotBindings,
      blockStates,
      pendingDeltas,
      globalStructureState,
      global_structure_state: globalStructureState,
      coverage,
      continuityGraphStatus: helpers.readText(continuityPack.continuityGraphStatus),
      assetStateByNodeId: continuityPack.assetStateByNodeId,
      asset_state_by_node_id: continuityPack.assetStateByNodeId,
      visualDependencyEdges: continuityPack.visualDependencyEdges,
      visual_dependency_edges: continuityPack.visualDependencyEdges,
      assetGenerationStatus: continuityPack.assetGenerationStatus,
      asset_generation_status: continuityPack.assetGenerationStatus,
      rejectedCandidates: finalized.rejectedCandidates,
      plannerWarnings: finalized.warnings,
      plannerDiagnostics: finalized.diagnostics,
    },
  })
  await helpers.persistSequenceAnimaticContinuityRequestState({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    artifactKey: artifact.key,
    continuityPack,
    blockStates,
    pendingDeltas,
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    continuityPack,
    continuity_pack: continuityPack,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    locationSets: finalized.locationSets,
    location_sets: finalized.locationSets,
    locationAngles: finalized.locationAngles,
    location_angles: finalized.locationAngles,
    sceneGraph: finalized.sceneGraph,
    scene_graph: finalized.sceneGraph,
    shotContinuityMap: finalized.shotContinuityMap,
    shot_continuity_map: finalized.shotContinuityMap,
    shotBindings: finalized.shotBindings,
    shot_bindings: finalized.shotBindings,
    blockStates,
    block_states: blockStates,
    pendingDeltas,
    pending_deltas: pendingDeltas,
    globalStructureState,
    global_structure_state: globalStructureState,
    coverage,
    assetStateByNodeId: continuityPack.assetStateByNodeId,
    asset_state_by_node_id: continuityPack.assetStateByNodeId,
    visualDependencyEdges: continuityPack.visualDependencyEdges,
    visual_dependency_edges: continuityPack.visualDependencyEdges,
    assetGenerationStatus: continuityPack.assetGenerationStatus,
    asset_generation_status: continuityPack.assetGenerationStatus,
    rejectedCandidates: finalized.rejectedCandidates,
    rejected_candidates: finalized.rejectedCandidates,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-structure-v1' })
}

export async function sequenceAnimaticContinuityArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const continuityAnchorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const readAnchorArray = (fields: string[]) => {
    const arrays = Object.values(context.upstream).flatMap((outputs) => fields.flatMap((field) => {
      const value = outputs[field]
      return Array.isArray(value) ? value.map(helpers.asRecord) : []
    }))
    const withAssets = arrays.filter((anchor) => helpers.readText(anchor.assetKey))
    return (withAssets.length > 0 ? withAssets : arrays)
      .filter((anchor, index, values) => helpers.readText(anchor.id) && values.findIndex((candidate) => helpers.readText(candidate.id) === helpers.readText(anchor.id)) === index)
  }
  const characterAnchors = readAnchorArray(['characterAnchors', 'character_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'character')
  const propAnchors = readAnchorArray(['propAnchors', 'prop_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) !== 'location_spot' && helpers.readText(anchor.anchorType) !== 'character')
  const locationSpotAnchors = readAnchorArray(['locationSpotAnchors', 'location_spot_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'location_spot' || helpers.readText(anchor.baseLocationRefId))
  const anchorAssets = [...characterAnchors, ...propAnchors, ...locationSpotAnchors].filter((anchor) => helpers.readText(anchor.assetKey))
  const locationSets = helpers.readArray(continuityAnchorPlan.locationSets ?? continuityAnchorPlan.location_sets).map(helpers.asRecord)
  const locationAngles = helpers.readArray(continuityAnchorPlan.locationAngles ?? continuityAnchorPlan.location_angles).map(helpers.asRecord)
  const sceneGraph = helpers.asRecord(continuityAnchorPlan.sceneGraph ?? continuityAnchorPlan.scene_graph)
  const shotContinuityMap = helpers.asRecord(continuityAnchorPlan.shotContinuityMap ?? continuityAnchorPlan.shot_continuity_map ?? continuityAnchorPlan.continuityAnchorIdsByShotId)
  const continuityGraphV2 = helpers.asRecord(continuityAnchorPlan.continuityGraphV2 ?? continuityAnchorPlan.continuity_graph_v2)
  const shotBindings = helpers.asRecord(continuityAnchorPlan.shotBindings ?? continuityAnchorPlan.shot_bindings ?? helpers.asRecord(continuityGraphV2).shotBindings)
  const continuityBlockDelta = helpers.readFirstUpstreamRecord(context.upstream, ['continuityBlockDelta', 'continuity_block_delta'])
  const blockStates = Object.keys(continuityGraphV2).length > 0
    ? sequenceAnimaticContinuityBlockStatesFromGraph(continuityGraphV2, {
      activeBlockId: helpers.readText(config.storyboardBlockId),
      activeDelta: continuityBlockDelta,
      status: 'ready',
    })
    : {}
  const pendingDeltas = Object.keys(continuityBlockDelta).length > 0 && helpers.readText(config.storyboardBlockId)
    ? { [helpers.readText(config.storyboardBlockId)]: continuityBlockDelta }
    : {}
  const rejectedCandidates = helpers.readArray(continuityAnchorPlan.rejectedCandidates ?? continuityAnchorPlan.rejected_candidates).map(helpers.asRecord)
  const plannerWarnings = helpers.readStringArray(continuityAnchorPlan.warnings)
  const plannerDiagnostics = helpers.readStringArray(continuityAnchorPlan.diagnostics)
  const planningMode = helpers.readText(continuityAnchorPlan.planningMode) || 'legacy_manifest'
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const manifestHash = helpers.readText(config.manifestHash) || helpers.readText(workflowMetadata.manifestHash)
  const masterManifestArtifactKey = helpers.readText(config.masterManifestArtifactKey) || helpers.readText(workflowMetadata.masterManifestArtifactKey)
  const packBase = {
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'continuity_pack',
    sequenceAnimaticRole: 'continuity_pack',
    planningMode,
    masterRequestId: helpers.readText(config.parentRequestId) || helpers.readText(workflowMetadata.parentRequestId) || helpers.readText(context.run.metadata?.parentRequestId),
    masterManifestArtifactKey,
    manifestHash,
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    locationSets,
    locationAngles,
    sceneGraph,
    shotContinuityMap,
    shotBindings,
    blockStates,
    pendingDeltas,
    continuityGraphStatus: sequenceAnimaticContinuityGraphStatusFromBlockStates(blockStates),
    rejectedCandidates,
    plannerWarnings,
    plannerDiagnostics,
    anchorAssets,
    warnings: [
      ...plannerWarnings,
      ...(anchorAssets.length === 0 && (
        characterAnchors.length > 0 || propAnchors.length > 0 || locationSpotAnchors.length > 0
      ) ? ['Continuity anchors were planned, but no visual anchor assets were extracted. Storyboards can still run with missing-reference warnings.'] : []),
    ],
    diagnostics: plannerDiagnostics,
  }
  const packWithAssets = withSequenceAnimaticContinuityAssetState(packBase, continuityGraphV2)
  const continuityPack: LooseRecord = {
    ...packWithAssets,
    continuityPackHash: helpers.hashOutputWorkflowValue(packWithAssets),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-continuity`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Pack`,
    summary: 'Sequence animatic continuity pack with temporary character, prop, and location spot references.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-continuity-pack-v1',
      role: 'sequence_animatic_continuity_pack',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'continuity_pack',
      planningMode,
      manifestHash,
      masterManifestArtifactKey,
      continuityPack,
      characterAnchors,
      propAnchors,
      locationSpotAnchors,
      continuityGraphV2,
      continuity_graph_v2: continuityGraphV2,
      locationSets,
      locationAngles,
      sceneGraph,
      shotContinuityMap,
      shotBindings,
      blockStates,
      pendingDeltas,
      continuityGraphStatus: continuityPack.continuityGraphStatus,
      assetStateByNodeId: continuityPack.assetStateByNodeId,
      asset_state_by_node_id: continuityPack.assetStateByNodeId,
      visualDependencyEdges: continuityPack.visualDependencyEdges,
      visual_dependency_edges: continuityPack.visualDependencyEdges,
      assetGenerationStatus: continuityPack.assetGenerationStatus,
      asset_generation_status: continuityPack.assetGenerationStatus,
      rejectedCandidates,
      plannerWarnings,
      plannerDiagnostics,
      anchorAssets,
    },
  })
  await helpers.persistSequenceAnimaticContinuityRequestState({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    artifactKey: artifact.key,
    continuityPack,
    blockStates,
    pendingDeltas,
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    continuityPack,
    continuity_pack: continuityPack,
    continuityAnchorPlan,
    continuity_anchor_plan: continuityAnchorPlan,
    characterAnchors,
    character_anchors: characterAnchors,
    propAnchors,
    prop_anchors: propAnchors,
    locationSpotAnchors,
    location_spot_anchors: locationSpotAnchors,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    locationSets,
    location_sets: locationSets,
    locationAngles,
    location_angles: locationAngles,
    sceneGraph,
    scene_graph: sceneGraph,
    shotContinuityMap,
    shot_continuity_map: shotContinuityMap,
    shotBindings,
    shot_bindings: shotBindings,
    blockStates,
    block_states: blockStates,
    pendingDeltas,
    pending_deltas: pendingDeltas,
    assetStateByNodeId: continuityPack.assetStateByNodeId,
    asset_state_by_node_id: continuityPack.assetStateByNodeId,
    visualDependencyEdges: continuityPack.visualDependencyEdges,
    visual_dependency_edges: continuityPack.visualDependencyEdges,
    assetGenerationStatus: continuityPack.assetGenerationStatus,
    asset_generation_status: continuityPack.assetGenerationStatus,
    rejectedCandidates,
    rejected_candidates: rejectedCandidates,
    anchorAssets,
    anchor_assets: anchorAssets,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-pack-v1' })
}

const sequenceAnimaticContinuityGraphHandlers = {
  sequence_animatic_continuity_input: sequenceAnimaticContinuityInput,
  sequence_animatic_continuity_seed_graph: sequenceAnimaticContinuitySeedGraph,
  sequence_animatic_continuity_global_plan: sequenceAnimaticContinuityGlobalPlan,
  sequence_animatic_continuity_global_merge: sequenceAnimaticContinuityGlobalMerge,
  sequence_animatic_continuity_block_plan: sequenceAnimaticContinuityBlockPlan,
  sequence_animatic_continuity_block_merge: sequenceAnimaticContinuityBlockMerge,
  sequence_animatic_continuity_graph_finalize: sequenceAnimaticContinuityGraphFinalize,
  sequence_animatic_continuity_structure_artifact: sequenceAnimaticContinuityStructureArtifact,
  sequence_animatic_continuity_artifact: sequenceAnimaticContinuityArtifact,
}

const sequenceAnimaticContinuityGraphWorkflowNodePackKey = 'sequence_animatic_continuity_graph'

export const sequenceAnimaticContinuityGraphWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticContinuityGraphHandlers
>({
  packKey: sequenceAnimaticContinuityGraphWorkflowNodePackKey,
  handlers: sequenceAnimaticContinuityGraphHandlers,
})

export const sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys = sequenceAnimaticContinuityGraphWorkflowNodePack.handlerKeys

function createSequenceAnimaticContinuityGraphNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticContinuityGraphHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic continuity graph workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticContinuityGraphWorkflowNodePackKey,
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

const continuityGraphProjectionMetadataKeys = [
  'activeManifestPurpose',
  'activeProgressLabel',
  'providerStatus',
  'providerRequestId',
  'readyArtifactCount',
  'scopedAssetKeys',
  'recoveryHints',
]

export const sequenceAnimaticContinuityGraphWorkflowNodeScaffolds = [
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.manifest',
      'config.assetPack',
      'config.animaticReferenceCatalog',
      'config.parentRequestId',
      'config.masterManifestArtifactKey',
      'config.manifestHash',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_seed_graph',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.continuityPlannerContext',
      'upstream.continuity_planner_context',
      'config.parentRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_global_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.continuityPlannerContext',
      'upstream.continuityGraphV2',
      'config.parentRequestId',
      'config.graphSpecVersion',
      'config.continuityGlobalPlannerPolicyVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_global_merge',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.continuityPlannerContext',
      'upstream.continuityGraphV2',
      'upstream.continuityBlockDelta',
      'config.parentRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_block_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.continuityPlannerContext',
      'upstream.continuityGraphV2',
      'config.storyboardBlockId',
      'config.parentRequestId',
      'config.graphSpecVersion',
      'config.continuityBlockPlannerPolicyVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_block_merge',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.continuityPlannerContext',
      'upstream.continuityGraphV2',
      'upstream.continuityBlockDelta',
      'config.storyboardBlockId',
      'config.parentRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_graph_finalize',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.continuityGraphV2',
      'upstream.blockStates',
      'upstream.pendingDeltas',
      'config.parentRequestId',
      'config.graphSpecVersion',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_structure_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.continuityGraphV2',
      'upstream.blockStates',
      'upstream.pendingDeltas',
      'config.parentRequestId',
      'config.masterManifestArtifactKey',
      'config.manifestHash',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityGraphNodeScaffold({
    purpose: 'sequence_animatic_continuity_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.continuityAnchorPlan',
      'upstream.continuityGraphV2',
      'upstream.anchorAssets',
      'upstream.continuityBlockDelta',
      'config.parentRequestId',
      'config.masterManifestArtifactKey',
      'config.manifestHash',
      'config.storyboardBlockId',
    ],
    projectionMetadataKeys: continuityGraphProjectionMetadataKeys,
  }),
]

export const sequenceAnimaticContinuityGraphWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticContinuityGraphWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticContinuityGraphWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticContinuityGraphWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
