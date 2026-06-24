import { HttpError } from './http.ts'
import {
  ensureMappedChildWorkflow,
  loadChildWorkflowGraphBundle,
} from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
  resolveSequenceAnimaticCombinedManifest,
} from './output-workflow.ts'
import {
  asRecord,
  artifactMetadataRecord,
  assetEntityForKey,
  assetPackWithShotWorldRefs,
  buildValidatedSequenceAnimaticTemplateGraph,
  coverageSetupEntityRefIds,
  entityAssetKeys,
  loadScreenplayAnimaticMasterRequest,
  prioritizedEntityAssetKeys,
  readArray,
  readScreenplayAnimaticRole,
  readScreenplayAnimaticSource,
  readStringArray,
  readText,
  shotEntityRefIds,
  slugify,
  uniqueTexts,
} from './sequence-animatic-command-utils.ts'
import {
  applyCoverageResolutionToRegistry,
  coverageRegistryFromSources,
  graphNodeMapForShot,
  incidentalCharacterNodesForShot,
  resolveCoverageSetupForShot,
  scopedCoverageShotsForShot,
  shotSpatialFingerprint,
} from './sequence-animatic-coverage-utils.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticShotProductionTemplateKey,
} from './sequence-animatic-template-registry.ts'
import {
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  sequenceAnimaticShotProductionGraphEnsureRequestSchema,
  sequenceAnimaticShotProductionGraphEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  continuityNodeCollections,
  continuityNodeParentId,
  continuityNodeUsesParent,
  continuityVisualDependencyEdges,
  shotSceneBindingNodeIds,
  shotReferenceNodeIds,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import { deriveSequenceAnimaticSceneStates } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import {
  buildSequenceAnimaticShotIngredientReferencePlan,
  sequenceAnimaticCanonicalShotGraphPolicyVersion,
  sequenceAnimaticVisualReferenceHash,
} from '../../../src/domain/sequenceAnimaticVisualReferencePlan.ts'
import {
  loadSceneContinuityManifests,
  resolveSceneContinuityForShot,
} from './scene-continuity-manifest-utils.ts'
import {
  buildShotReferenceReadinessHash,
} from '../../../src/domain/sceneContinuityManifest.ts'

const SHOT_GRAPH_POLICY_VERSION = sequenceAnimaticCanonicalShotGraphPolicyVersion
const SHOT_GRAPH_DEPENDENCY_MODE = 'ingredient_refs'

function normalizeShotReferenceOverride(value: unknown) {
  const override = asRecord(value)
  const shotId = readText(override.shotId ?? override.shot_id)
  const ingredients = readArray(override.ingredients)
    .map(asRecord)
    .map((entry, index) => {
      const assetKey = readText(entry.assetKey ?? entry.asset_key)
      const kind = readText(entry.kind)
      const nodeId = readText(entry.nodeId ?? entry.node_id)
      const entityKey = readText(entry.entityKey ?? entry.entity_key)
      return {
        ...entry,
        id: readText(entry.id) || `${kind || 'ingredient'}:${assetKey || nodeId || entityKey || index}`,
        kind,
        name: readText(entry.name) || readText(entry.label),
        nodeId,
        node_id: nodeId,
        entityKey,
        entity_key: entityKey,
        assetKey,
        asset_key: assetKey,
        assetUrl: readText(entry.assetUrl ?? entry.asset_url),
        asset_url: readText(entry.assetUrl ?? entry.asset_url),
        status: readText(entry.status) || (assetKey ? 'ready' : 'missing'),
        source: readText(entry.source) || 'focused_shot_ingredient_ui',
        role: readText(entry.role) || 'shot_ingredient_reference',
        sourceArtifactRole: readText(entry.sourceArtifactRole ?? entry.source_artifact_role),
        source_artifact_role: readText(entry.sourceArtifactRole ?? entry.source_artifact_role),
        requiredForKeyframe: entry.requiredForKeyframe !== false && entry.required_for_keyframe !== false,
        required_for_keyframe: entry.requiredForKeyframe !== false && entry.required_for_keyframe !== false,
        uiOrder: Number.isFinite(Number(entry.uiOrder ?? entry.ui_order)) ? Number(entry.uiOrder ?? entry.ui_order) : index,
        ui_order: Number.isFinite(Number(entry.uiOrder ?? entry.ui_order)) ? Number(entry.uiOrder ?? entry.ui_order) : index,
      }
    })
    .filter((entry) => entry.requiredForKeyframe)
    .sort((left, right) => Number(left.uiOrder) - Number(right.uiOrder))
  if (!shotId || ingredients.length === 0) return null
  const hash = readText(override.ingredientPlanHash ?? override.ingredient_plan_hash) || sequenceAnimaticStableHash({ shotId, ingredients })
  return {
    version: 'shot_keyframe_reference_override_v1',
    shotId,
    shot_id: shotId,
    ingredientPlanHash: hash,
    ingredient_plan_hash: hash,
    source: 'focused_shot_ingredient_ui',
    ingredients,
  }
}

function overrideReferencesFromUiIngredients(override: ReturnType<typeof normalizeShotReferenceOverride>) {
  if (!override) return null
  const seen = new Set<string>()
  const selectedReferences = override.ingredients
    .map((entry) => {
      const assetKey = readText(entry.assetKey)
      const status = readText(entry.status) || (assetKey ? 'ready' : 'missing')
      if (status !== 'ready' || !assetKey || seen.has(assetKey)) return null
      seen.add(assetKey)
      return {
        assetKey,
        role: readText(entry.role) || 'shot_ingredient_reference',
        sourceArtifactRole: readText(entry.sourceArtifactRole ?? entry.source_artifact_role),
        reason: 'Selected explicitly from the focused shot ingredient UI.',
        name: readText(entry.name),
        type: readText(entry.kind),
        kind: readText(entry.kind),
        nodeId: readText(entry.nodeId ?? entry.node_id),
        entityKey: readText(entry.entityKey ?? entry.entity_key),
        status: 'ready',
        assetUrl: readText(entry.assetUrl ?? entry.asset_url),
        source: 'focused_shot_ingredient_ui',
        uiOrder: Number(entry.uiOrder ?? entry.ui_order) || 0,
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
  return {
    requiredReferenceAssetKeys: selectedReferences.map((entry) => readText(entry.assetKey)).filter(Boolean),
    selectedReferences,
    referencePlanHash: readText(override.ingredientPlanHash ?? override.ingredient_plan_hash),
    shotIngredientReferencePlan: {
      version: 'sequence_animatic_shot_ingredient_reference_plan_v1',
      shotId: override.shotId,
      referencePlanHash: readText(override.ingredientPlanHash ?? override.ingredient_plan_hash),
      source: 'focused_shot_ingredient_ui',
      ingredients: override.ingredients,
      requiredReferenceAssetKeys: selectedReferences.map((entry) => readText(entry.assetKey)).filter(Boolean),
      selectedReferences,
      missingReferences: [],
      omittedReferences: [],
      uiOverride: true,
    },
  }
}

function sceneGraphOverrideForNode(metadata: Record<string, unknown>, nodeId: string) {
  const overrides = asRecord(metadata.sequenceAnimaticSceneGraphOverrides ?? metadata.sequence_animatic_scene_graph_overrides)
  const nodes = asRecord(overrides.nodes)
  const override = asRecord(nodes[nodeId])
  return {
    visualBriefOverride: readText(override.visualBriefOverride),
    extraPromptDirection: readText(override.extraPromptDirection),
    lastGeneratedAssetKey: readText(override.lastGeneratedAssetKey),
  }
}

function applySceneGraphOverrideToCoverageSetup(setup: Record<string, unknown>, override: ReturnType<typeof sceneGraphOverrideForNode>) {
  if (!override.visualBriefOverride && !override.extraPromptDirection) return setup
  return {
    ...setup,
    baseStagingBrief: readText(setup.stagingBrief ?? setup.staging_brief),
    stagingBrief: override.visualBriefOverride || readText(setup.stagingBrief ?? setup.staging_brief),
    staging_brief: override.visualBriefOverride || readText(setup.stagingBrief ?? setup.staging_brief),
    sceneGraphOverride: override,
    scene_graph_override: override,
  }
}

function applySceneGraphOverrideToNode(node: Record<string, unknown>, override: ReturnType<typeof sceneGraphOverrideForNode>) {
  if (!override.visualBriefOverride && !override.extraPromptDirection) return node
  return {
    ...node,
    baseVisualBrief: readText(node.visualBrief) || readText(node.summary),
    visualBrief: override.visualBriefOverride || readText(node.visualBrief),
    summary: override.visualBriefOverride || readText(node.summary),
    sceneGraphOverride: override,
    scene_graph_override: override,
  }
}

function scopedAssetPackForShot(
  assetPack: Record<string, unknown>,
  shot: Record<string, unknown>,
) {
  const shotRefIds = shotEntityRefIds(shot)
  const entityIds = new Set(shotRefIds)
  const entities = readArray(assetPack.entities).map(asRecord).filter((entity) => entityIds.has(readText(entity.key)))
  const requiredReferenceAssetKeys = prioritizedEntityAssetKeys(entities, 8)
  return {
    assetPack: {
      ...assetPack,
      entities,
      selectedEntityKeys: entities.map((entity) => readText(entity.key)).filter(Boolean),
      scopedReferenceAssetKeys: requiredReferenceAssetKeys,
      referenceScope: 'sequence_animatic_shot_graph_refresh',
    },
    requiredReferenceAssetKeys,
    selectedReferences: requiredReferenceAssetKeys.map((assetKey) => ({
      assetKey,
      role: 'entity_reference',
      reason: 'Selected from shot-visible refs.',
    })),
  }
}

function localReferenceAssetNodesFromSources(...sources: readonly Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const source of sources) {
    for (const rawReference of [
      ...readArray(source.targetNodes ?? source.target_nodes),
      ...[source.targetNode ?? source.target_node].filter(Boolean),
      ...readArray(source.assetAnchors ?? source.asset_anchors),
      ...readArray(source.outputLocalReferences ?? source.output_local_references),
      ...readArray(source.localReferences ?? source.local_references),
    ]) {
      const reference = asRecord(rawReference)
      const id = readText(reference.id ?? reference.nodeId ?? reference.node_id ?? reference.referenceId ?? reference.reference_id)
      if (!id) continue
      const rawType = readText(reference.type ?? reference.anchorType ?? reference.anchor_type ?? reference.assetKind ?? reference.asset_kind ?? reference.nodeKind ?? reference.node_kind)
      const normalizedType = rawType === 'temp_character'
        || rawType === 'temporary_character'
        || rawType === 'character'
        || rawType === 'person'
        || rawType === 'crowd'
        || rawType === 'group'
        || rawType === 'faction'
        ? 'character'
        : ['prop', 'item', 'vehicle', 'animatic_only'].includes(rawType)
          ? 'prop'
          : rawType
      const assetKind = normalizedType === 'character'
        ? 'temporary_character'
        : normalizedType === 'location_spot'
          ? 'location_spot'
          : 'prop'
      const nodeKind = normalizedType === 'character'
        ? 'temporary_character'
        : normalizedType === 'location_spot'
          ? 'location_anchor'
          : 'prop'
      const previous = byId.get(id) ?? {}
      byId.set(id, {
        ...previous,
        ...reference,
        id,
        type: normalizedType || 'prop',
        nodeKind,
        assetKind,
        name: readText(reference.name) || readText(previous.name) || id,
        visualBrief: readText(reference.visualBrief ?? reference.visual_brief ?? reference.description) || readText(previous.visualBrief),
        summary: readText(reference.summary) || readText(reference.visualBrief ?? reference.visual_brief ?? reference.description) || readText(previous.summary),
        shotIds: uniqueTexts([
          ...readStringArray(previous.shotIds),
          ...readStringArray(reference.shotIds ?? reference.shot_ids),
          ...readStringArray(reference.usedShotIds ?? reference.used_shot_ids),
        ]),
        storyboardBlockIds: uniqueTexts([
          ...readStringArray(previous.storyboardBlockIds ?? previous.storyboard_block_ids ?? previous.blockIds ?? previous.block_ids),
          ...readStringArray(reference.storyboardBlockIds ?? reference.storyboard_block_ids ?? reference.blockIds ?? reference.block_ids),
        ]),
      })
    }
  }
  return [...byId.values()]
}

function mergeContinuityNodesById(...groups: readonly Record<string, unknown>[][]) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const group of groups) {
    for (const node of group) {
      const id = readText(node.id)
      if (!id) continue
      byId.set(id, byId.has(id) ? { ...node, ...byId.get(id), id } : { ...node, id })
    }
  }
  return [...byId.values()]
}

function mergedShotPlan(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  shotId: string
}) {
  const manifestBlocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  const directorShots = readArray(input.directorPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
  const directorShotsById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const))
  const blockMap = new Map<string, Record<string, unknown>>()
  const manifestShots = manifestBlocks.flatMap((block) => {
    const blockId = readText(block.id)
    blockMap.set(blockId, block)
    return readArray(block.shots).map(asRecord).map((shot) => ({
      ...shot,
      blockId: readText(shot.blockId) || readText(shot.storyboardBlockId) || blockId,
      storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId) || blockId,
    }))
  }).filter((shot) => readText(shot.id))
  const shotIdsFromManifest = new Set(manifestShots.map((shot) => readText(shot.id)).filter(Boolean))
  const shots = [
    ...manifestShots,
    ...directorShots.filter((shot) => !shotIdsFromManifest.has(readText(shot.id))).map((shot) => {
      const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || `${readText(shot.sourceSceneId ?? shot.sceneId) || 'scene'}_block`
      if (!blockMap.has(blockId)) blockMap.set(blockId, { id: blockId, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Shot Block', shots: [] })
      return {
        ...shot,
        blockId,
        storyboardBlockId: blockId,
      }
    }),
  ]
  const mergedShots = shots.map((shot) => {
    const directorShot = directorShotsById.get(readText(shot.id)) ?? {}
    return {
      ...shot,
      ...directorShot,
      id: readText(shot.id),
      blockId: readText(directorShot.blockId ?? directorShot.storyboardBlockId) || readText(shot.blockId ?? shot.storyboardBlockId),
      storyboardBlockId: readText(directorShot.storyboardBlockId ?? directorShot.blockId) || readText(shot.storyboardBlockId ?? shot.blockId),
    }
  })
  const shot = mergedShots.find((entry) => readText(entry.id) === input.shotId)
  if (!shot) throw new HttpError(404, `Shot ${input.shotId} was not found in the animatic director plan.`)
  const blockId = readText(shot.storyboardBlockId ?? shot.blockId)
  const block = blockMap.get(blockId) ?? { id: blockId || `${input.shotId}_block`, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Shot Block', shots: [shot] }
  const coverageSetups = readArray(input.directorPlan.coverageSetups ?? input.directorPlan.coverage_setups).map(asRecord).filter((setup) => readText(setup.id))
  const coverageSetupId = readText(shot.coverageSetupId ?? shot.coverage_setup_id)
  const coverageSetup = coverageSetupId ? coverageSetups.find((setup) => readText(setup.id) === coverageSetupId) ?? { id: coverageSetupId, title: coverageSetupId } : {}
  const coverageShots = coverageSetupId
    ? mergedShots.filter((entry) => readText(entry.coverageSetupId ?? entry.coverage_setup_id) === coverageSetupId)
    : [shot]
  const sceneState = asRecord(deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups }).get(input.shotId))
  return { shot, block, mergedShots, coverageSetup, coverageSetupId, coverageShots, sceneState }
}

export async function runSequenceAnimaticShotProductionGraphCommand(input: {
  client: {
    from: (table: string) => any
  }
  admin: {
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  userId: string
  payload: unknown
}) {
    const { client, admin, userId } = input
    const payload = sequenceAnimaticShotProductionGraphEnsureRequestSchema.parse(input.payload)
    const shotReferenceOverride = normalizeShotReferenceOverride(payload.shotReferenceOverride ?? payload.shot_reference_override)

    const masterRequest = await loadScreenplayAnimaticMasterRequest({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      masterRequestId: payload.masterRequestId,
    })
    const masterMetadata = asRecord(masterRequest.metadata)
    const screenplayAnimaticSource = readScreenplayAnimaticSource(
      masterMetadata,
      masterRequest.sourceSurface === 'outputs' ? 'prompt_cinematic' : 'wiki_sequence_unit',
    )

    const masterArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', masterRequest.workflowId)
      .order('created_at', { ascending: false })
      .limit(24)
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    const masterArtifacts = (masterArtifactsResponse.data ?? []).map(asRecord)
    let manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
    let directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
    let combinedManifestArtifactKey = ''
    let shotReadySource = 'final_manifest'
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        combinedManifestArtifactKey = combined.manifestArtifactKey
        shotReadySource = 'combined_scene_plan'
      }
    }
    let provisionalContext = false
    if ((Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) && payload.allowProvisional) {
      throw new HttpError(409, 'Shot graph inspection needs the manifest or combined scene plan to be ready first.')
    }
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic manifest first.')
    if (Object.keys(directorPlan).length === 0) throw new HttpError(409, 'Generate the shot continuity plan first.')

    const manifestHash = sequenceAnimaticStableHash(manifest)
    const directorPlanHash = readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const masterManifestArtifactKey = readText(masterArtifacts.find((row) => readText(asRecord(row.metadata).role) === 'sequence_animatic_manifest')?.key) || combinedManifestArtifactKey
    const assetPack = asRecord(manifest.assetPack)
    const aspectRatio = readText(assetPack.aspectRatio) || '16:9'
    let { shot, block, mergedShots, coverageSetup, coverageSetupId, coverageShots, sceneState } = mergedShotPlan({
      manifest,
      directorPlan,
      shotId: payload.shotId,
    })
    const shotWorldRefIds = uniqueTexts(shotEntityRefIds(shot))
    const worldEntityResponse = shotWorldRefIds.length > 0
      ? await client
        .from('world_entities')
        .select('key, name, node_type, thumbnail_asset_key, metadata')
        .eq('draft_id', payload.draftId)
        .in('key', shotWorldRefIds)
      : { data: [], error: null }
    if (worldEntityResponse.error) throw new Error(worldEntityResponse.error.message)
    const worldEntityByKey = new Map(
      (worldEntityResponse.data ?? [])
        .map(asRecord)
        .map((entity) => [readText(entity.key), entity] as const)
        .filter(([key]) => key),
    )
    const scopedShotAssetPack = assetPackWithShotWorldRefs({ assetPack, shot, worldEntityByKey })
    const legacyCoverageSetup = coverageSetup
    const coverageRegistry = coverageRegistryFromSources({
      masterMetadata,
      directorPlan,
      masterRequestId: masterRequest.id,
    })
    const coverageResolution = resolveCoverageSetupForShot({
      shot,
      registry: coverageRegistry,
      legacySetup: legacyCoverageSetup,
      forceRefresh: payload.forceRefresh === true,
    })
    coverageSetup = coverageResolution.coverageSetup
    coverageSetupId = coverageResolution.coverageSetupId
    coverageShots = mergedShots.filter((entry) => readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids).includes(readText(entry.id)))
    if (coverageShots.length === 0) coverageShots = [shot]
    const scopedCoverageShots = scopedCoverageShotsForShot({ shot, coverageSetup, coverageShots })
    const requestedCoverageSetupId = payload.coverageSetupId ? readText(payload.coverageSetupId) : ''
    const nextSetupRecord = {
      ...coverageSetup,
      usedShotIds: uniqueTexts([...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids), payload.shotId]),
      used_shot_ids: uniqueTexts([...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids), payload.shotId]),
    }
    const priorSetupRecord = coverageRegistry.coverageSetups.find((setup) => readText(setup.id) === coverageSetupId) ?? null
    const needsRegistryUpdate = readText(coverageRegistry.coverageSetupByShotId[payload.shotId]) !== coverageSetupId
      || sequenceAnimaticStableHash(priorSetupRecord ?? {}) !== sequenceAnimaticStableHash(nextSetupRecord)
    const coverageRegistryNext = needsRegistryUpdate ? applyCoverageResolutionToRegistry({
      registry: coverageRegistry,
      shotId: payload.shotId,
      setup: nextSetupRecord,
    }) : {
      ...coverageRegistry,
      coverage_setups: coverageRegistry.coverageSetups,
      coverage_setup_by_shot_id: coverageRegistry.coverageSetupByShotId,
    }
    if (needsRegistryUpdate) {
      const updateResponse = await admin
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            sequenceAnimaticCoverageRegistry: coverageRegistryNext,
            sequence_animatic_coverage_registry: coverageRegistryNext,
          },
        })
        .eq('id', masterRequest.id)
      if (updateResponse.error) throw new Error(updateResponse.error.message)
    }
    coverageSetup = applySceneGraphOverrideToCoverageSetup(
      nextSetupRecord,
      sceneGraphOverrideForNode(asRecord(masterRequest.metadata), coverageSetupId),
    )
    sceneState = asRecord(deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups: coverageRegistryNext.coverageSetups }).get(payload.shotId))
    const sceneContinuityManifests = await loadSceneContinuityManifests({
      client,
      projectId: payload.projectId,
      draftId: payload.draftId,
      masterRequestId: masterRequest.id,
    })
    const sceneContinuity = resolveSceneContinuityForShot({
      manifests: sceneContinuityManifests,
      shot,
    })
    const sceneContinuityManifest = sceneContinuity.manifest ?? {}
    const sceneContinuityManifestHash = readText(sceneContinuity.manifest?.sourceHash)
    const shotReferenceReadinessHash = readText(sceneContinuity.readiness?.hash)
      || (sceneContinuity.readiness ? buildShotReferenceReadinessHash(sceneContinuity.readiness) : '')
    const continuityArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .contains('metadata', { masterRequestId: masterRequest.id })
      .order('created_at', { ascending: false })
      .limit(256)
    if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)
    const continuityAssetStateByNodeId: Record<string, Record<string, unknown>> = {}
    for (const artifact of (continuityArtifactsResponse.data ?? []).map(asRecord)) {
      const metadata = asRecord(artifact.metadata)
      const role = readText(metadata.role)
      if (role === 'sequence_animatic_continuity_asset') {
        const state = asRecord(metadata.assetState ?? metadata.asset_state)
        const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
        if (nodeId && Object.keys(state).length > 0) continuityAssetStateByNodeId[nodeId] = state
      }
      if (role === 'sequence_animatic_continuity_asset_batch') {
        const stateByNodeId = asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)
        Object.entries(stateByNodeId).forEach(([nodeId, state]) => {
          if (readText(nodeId) && Object.keys(asRecord(state)).length > 0) continuityAssetStateByNodeId[nodeId] = asRecord(state)
        })
      }
    }

    const graph = asRecord(
      manifest.continuityGraphV2
        ?? manifest.continuity_graph_v2
        ?? directorPlan.continuityGraphV2
        ?? directorPlan.continuity_graph_v2,
    )
    const allGraphNodes = mergeContinuityNodesById(
      continuityNodeCollections(graph),
      localReferenceAssetNodesFromSources(graph, manifest, directorPlan),
    ).map((node) => {
      const nodeId = readText(node.id)
      const state = asRecord(continuityAssetStateByNodeId[nodeId])
      return Object.keys(state).length > 0 ? { ...node, assetState: state, asset_state: state } : node
    })
    const graphNodeById = graphNodeMapForShot(allGraphNodes, shot)
    const graphNodeIds = new Set([...graphNodeById.keys()])
    const shotBindings = asRecord(
      manifest.shotBindings
        ?? manifest.shot_bindings
        ?? directorPlan.shotBindings
        ?? directorPlan.shot_bindings
        ?? graph.shotBindings,
    )
    const dependencyEdges = readArray(directorPlan.visualDependencyEdges ?? directorPlan.visual_dependency_edges).map(asRecord)
    const visualDependencyEdges = dependencyEdges.length > 0 ? dependencyEdges : continuityVisualDependencyEdges(graph)
    const assetPackEntities = readArray(assetPack.entities).map(asRecord)
    const zoneNodeIdsForShot = () => {
      const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
      return uniqueTexts([
        readText(binding.zoneId ?? binding.zone_id),
        readText(shot.zoneId ?? shot.zone_id),
        readText(shot.continuityZoneId ?? shot.continuity_zone_id),
        readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
      ]).filter((nodeId) => graphNodeIds.has(nodeId))
    }
    const zoneReferenceAssetKeys = () => uniqueTexts(zoneNodeIdsForShot()
      .flatMap((nodeId) => entityAssetKeys(asRecord(graphNodeById.get(nodeId)?.assetState ?? graphNodeById.get(nodeId)?.asset_state))))
      .slice(0, 1)
    const continuityReferenceEntriesForShot = () => {
      const zoneAssetKeys = zoneReferenceAssetKeys()
      const zoneAssetKeySet = new Set(zoneAssetKeys)
      const nodeIds = uniqueTexts([
        ...shotSceneBindingNodeIds(shot),
        ...shotReferenceNodeIds(shot, graphNodeIds),
      ]).filter((nodeId) => graphNodeIds.has(nodeId))
      const entries = nodeIds.flatMap((nodeId) => {
        const node = graphNodeById.get(nodeId) ?? {}
        const nodeKind = readText(node.nodeKind ?? node.assetKind)
        const assetKey = entityAssetKeys(asRecord(node.assetState ?? node.asset_state))[0] ?? ''
        if (!assetKey) return []
        if (zoneAssetKeySet.has(assetKey)) return []
        if (nodeKind === 'location_zone') return []
        if (nodeKind === 'location_spot') return []
        if (nodeKind === 'location_set' || nodeKind === 'spot_camera_grid' || nodeKind === 'location_viewpoint' || nodeKind === 'location_angle') return []
        return [{
          assetKey,
          role: 'continuity_asset' as const,
          reason: 'Current shot ingredient continuity asset.',
        }]
      })
      return [
        ...zoneAssetKeys.map((assetKey) => ({
          assetKey,
          role: 'continuity_asset' as const,
          reason: 'Zone map selected as the only scene-graph spatial reference for this shot.',
        })),
        ...entries,
      ].filter((entry, index, allEntries) => allEntries.findIndex((candidate) => readText(candidate.assetKey) === readText(entry.assetKey)) === index)
    }

    const primaryShotSpatialNodeIds = () => {
      return zoneNodeIdsForShot()
    }
    const referencedAnimaticAssetNodeIds = () => {
      const candidateIds = new Set([
        ...shotReferenceNodeIds(shot, graphNodeIds),
        ...shotEntityRefIds(shot),
      ])
      return [...candidateIds].filter((nodeId) => {
        const node = graphNodeById.get(nodeId)
        const kind = readText(node?.nodeKind)
        const assetKind = readText(node?.assetKind)
        return kind === 'temporary_character' || kind === 'prop' || assetKind === 'temporary_character' || assetKind === 'prop'
      })
    }
    const shotContinuityDependencyNodes = () => {
      const directNodeIds = [
        ...primaryShotSpatialNodeIds(),
        ...referencedAnimaticAssetNodeIds(),
      ].filter((nodeId) => graphNodeIds.has(nodeId))
      const orderedIds: string[] = []
      const seen = new Set<string>()
      const addWithParents = (nodeId: string) => {
        const chain: string[] = []
        let currentId = nodeId
        const localSeen = new Set<string>()
        while (currentId && graphNodeById.has(currentId) && !localSeen.has(currentId)) {
          localSeen.add(currentId)
          chain.push(currentId)
          const parentId = continuityNodeParentId(graphNodeById.get(currentId) ?? {})
          if (!parentId || !graphNodeById.has(parentId)) break
          currentId = parentId
        }
        for (const id of chain.reverse()) {
          if (seen.has(id)) continue
          seen.add(id)
          orderedIds.push(id)
        }
      }
      directNodeIds.forEach(addWithParents)
      const orderedNodes = orderedIds.map((nodeId) => graphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
      const incidentalNodes = incidentalCharacterNodesForShot({ shot, coverageSetup, graphNodeById, contextNodes: orderedNodes })
      return [...orderedNodes, ...incidentalNodes.filter((node) => !seen.has(readText(node.id)))]
    }
    const relevantShotsForNodes = (nodes: readonly Record<string, unknown>[]) => {
      const currentShotId = readText(shot.id)
      const currentShot = mergedShots.find((entry) => readText(entry.id) === currentShotId)
      return currentShot ? [currentShot] : [shot]
    }
    const referenceAssetKeysForTargets = (targetNodes: readonly Record<string, unknown>[]) => {
      const requestedNodeIdSet = new Set(targetNodes.map((node) => readText(node.id)).filter(Boolean))
      const firstTarget = targetNodes[0] ?? {}
      const targetKind = readText(firstTarget.nodeKind) || readText(firstTarget.assetKind)
      const parentId = continuityNodeParentId(firstTarget)
      if (targetKind === 'location_spot') {
        const zoneId = readText(firstTarget.zoneId ?? firstTarget.zone_id) || parentId
        return uniqueTexts(entityAssetKeys(asRecord(graphNodeById.get(zoneId)?.assetState ?? graphNodeById.get(zoneId)?.asset_state))).slice(0, 1)
      }
      if (targetKind === 'spot_camera_grid') {
        const zoneId = readText(firstTarget.zoneId ?? firstTarget.zone_id)
        return uniqueTexts(entityAssetKeys(asRecord(graphNodeById.get(zoneId)?.assetState ?? graphNodeById.get(zoneId)?.asset_state))).slice(0, 1)
      }
      const siblingReferenceKeys = parentId
        ? [...graphNodeById.values()]
          .filter((node) => !requestedNodeIdSet.has(readText(node.id)))
          .filter((node) => readText(node.nodeKind) === readText(firstTarget.nodeKind))
          .filter((node) => continuityNodeUsesParent(node, parentId))
          .flatMap((node) => entityAssetKeys(asRecord(node.assetState ?? node.asset_state)))
          .filter(Boolean)
        : []
      const worldLocationRefId = readText(firstTarget.worldLocationRefId) || readText(firstTarget.baseLocationRefId)
      const targetWorldEntity = worldLocationRefId ? assetPackEntities.find((entity) => readText(entity.key) === worldLocationRefId) ?? null : null
      const worldReferenceKeys = targetWorldEntity ? entityAssetKeys(targetWorldEntity).slice(0, 2) : []
      return uniqueTexts([...siblingReferenceKeys, ...worldReferenceKeys]).slice(0, 8)
    }
    const continuityDependencies = shotContinuityDependencyNodes().map((rawTargetNode) => {
      const targetNode = applySceneGraphOverrideToNode(
        rawTargetNode,
        sceneGraphOverrideForNode(asRecord(masterRequest.metadata), readText(rawTargetNode.id)),
      )
      const targetNodeId = readText(targetNode.id)
      const referenceAssetKeys = referenceAssetKeysForTargets([targetNode])
      const relevantShots = relevantShotsForNodes([targetNode])
      const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
      const assetInputHash = sequenceAnimaticStableHash({
        targetNode,
        relevantShotIds: relevantShots.map((entry) => readText(entry.id)),
        referenceAssetKeys,
        manifestHash,
      })
      const referenceEntities = referenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || targetNodeId} dependency`))
      return {
        targetNode,
        targetNodeId,
        assetKind,
        assetInputHash,
        assetState: {},
        parentNodeIds: visualDependencyEdges
          .filter((edge) => readText(edge.targetNodeId) === targetNodeId)
          .map((edge) => readText(edge.sourceNodeId))
          .filter(Boolean),
        referenceAssetKeys,
        relevantShots,
        shotBindings,
        assetPack: {
          ...assetPack,
          entities: [...assetPackEntities, ...referenceEntities],
          continuityReferenceAssetKeys: referenceAssetKeys,
        },
        globalAssetIdentity: `${targetNodeId}:${assetInputHash}`,
        dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
        dependencyWave: ['temporary_character', 'prop'].includes(assetKind) ? 3 : 1,
        referenceSelection: {
          selectedReferences: referenceAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset', reason: 'Selected scene-graph dependency reference.' })),
          omittedReferences: [],
        },
        visualBrief: {
          targetName: readText(targetNode.name) || targetNodeId,
          assetKind,
          summary: readText(targetNode.visualBrief) || readText(targetNode.summary),
        },
      }
    })
    const shotIngredientZoneNodeIds = () => {
      const ids = new Set(zoneNodeIdsForShot())
      for (const nodeId of uniqueTexts([
        ...shotSceneBindingNodeIds(shot),
        ...shotReferenceNodeIds(shot, graphNodeIds),
      ])) {
        const node = graphNodeById.get(nodeId)
        if (!node) continue
        const kind = readText(node.nodeKind ?? node.assetKind)
        if (kind === 'location_zone') ids.add(nodeId)
        if (kind === 'location_spot') {
          const parentId = continuityNodeParentId(node)
          const parent = parentId ? graphNodeById.get(parentId) : null
          if (parent && readText(parent.nodeKind ?? parent.assetKind) === 'location_zone') ids.add(parentId)
        }
      }
      return [...ids].filter((nodeId) => graphNodeIds.has(nodeId))
    }
    const referencePlanNodeRecord = (node: Record<string, unknown>) => {
      const assetState = asRecord(node.assetState ?? node.asset_state)
      const assetKey = entityAssetKeys(assetState)[0] ?? ''
      return {
        ...node,
        kind: readText(node.nodeKind ?? node.assetKind),
        nodeId: readText(node.id),
        assetKey,
        assetUrl: readText(assetState.assetUrl ?? assetState.asset_url),
        status: assetKey ? 'ready' : 'missing',
      }
    }
    const derivedShotIngredientReferencePlan = buildSequenceAnimaticShotIngredientReferencePlan({
      shot,
      spatialNodes: shotIngredientZoneNodeIds()
        .map((nodeId) => graphNodeById.get(nodeId))
        .filter((node): node is Record<string, unknown> => Boolean(node))
        .map(referencePlanNodeRecord),
      // Use raw continuity nodes for ingredient readiness. graphNodeById is
      // deliberately shot-scoped for legacy spatial fallback, and can rewrite
      // unrelated local refs as if they belong to the active shot.
      continuityTargets: allGraphNodes.map(referencePlanNodeRecord),
      assetPack: scopedShotAssetPack,
      explicitReferenceIds: [
        ...readStringArray(asRecord(shot.refs).referenceIds ?? asRecord(shot.refs).reference_ids),
        ...shotEntityRefIds(shot),
      ],
      maxReferences: 8,
    })
    const uiOverrideReferences = shotReferenceOverride && readText(shotReferenceOverride.shotId) === payload.shotId
      ? overrideReferencesFromUiIngredients(shotReferenceOverride)
      : null
    const shotIngredientReferencePlan = uiOverrideReferences?.shotIngredientReferencePlan ?? derivedShotIngredientReferencePlan
    if (!uiOverrideReferences && derivedShotIngredientReferencePlan.missingReferences.length > 0) {
      const missing = shotIngredientReferencePlan.missingReferences
        .map((entry) => `${entry.name || entry.id}${entry.nodeId ? ` (${entry.nodeId})` : ''}`)
        .join(', ')
      throw new HttpError(409, `Generate missing shot references before keyframe generation: ${missing}`)
    }
    const shotKeyframeReferenceAssetKeys = uiOverrideReferences?.requiredReferenceAssetKeys ?? derivedShotIngredientReferencePlan.requiredReferenceAssetKeys
    const shotKeyframeSelectedReferences = uiOverrideReferences?.selectedReferences ?? derivedShotIngredientReferencePlan.ingredients
      .filter((entry) => entry.status === 'ready' && readText(entry.assetKey))
      .map((entry) => ({
        assetKey: entry.assetKey,
        role: entry.role,
        sourceArtifactRole: entry.sourceArtifactRole,
        reason: entry.reason,
        name: entry.name,
        kind: entry.kind,
        nodeId: entry.nodeId,
        entityKey: entry.entityKey,
      }))
    const scopedRefs = {
      assetPack: {
        ...scopedShotAssetPack,
        scopedReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
        scoped_reference_asset_keys: shotKeyframeReferenceAssetKeys,
        referenceAssetKeys: shotKeyframeReferenceAssetKeys,
        reference_asset_keys: shotKeyframeReferenceAssetKeys,
        entities: shotKeyframeSelectedReferences.map((entry, index) => {
          const assetKey = readText(entry.assetKey)
          const kind = readText(entry.kind ?? entry.type)
          const role = readText(entry.role) || 'shot_ingredient_reference'
          const name = readText(entry.name) || `Shot reference ${index + 1}`
          return {
            key: readText(entry.entityKey) || readText(entry.nodeId) || `ui_ref_${index + 1}`,
            id: readText(entry.entityKey) || readText(entry.nodeId) || `ui_ref_${index + 1}`,
            name,
            type: kind || role,
            nodeType: kind || role,
            node_type: kind || role,
            role,
            assetKeys: [assetKey],
            primaryAssetKey: assetKey,
            primary_asset_key: assetKey,
            selectedReferenceAssetKey: assetKey,
            selected_reference_asset_key: assetKey,
            selectedReferenceVariantKey: role,
            selectedReferenceVariantLabel: name,
            selectedReferenceVariantType: role,
            referenceSelectionReason: 'Selected explicitly from the focused shot ingredient UI.',
          }
        }).filter((entry) => readText(entry.primaryAssetKey)),
        referenceScope: 'sequence_animatic_shot_ingredients_only',
      },
      requiredReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
      selectedReferences: shotKeyframeSelectedReferences,
    }
    const zoneCoverageRegistry = asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
    const zoneCoverageCellByShotId = asRecord(zoneCoverageRegistry.coverageCellByShotId ?? zoneCoverageRegistry.coverage_cell_by_shot_id)
    const zoneCoverageCell = asRecord(zoneCoverageCellByShotId[payload.shotId])
    const zoneCoverageAnchorScopeKey = readText(zoneCoverageCell.coverageAnchorScopeKey ?? zoneCoverageCell.coverage_anchor_scope_key)
    const zoneCoverageAnchorAssetKey = readText(zoneCoverageCell.assetKey ?? zoneCoverageCell.asset_key)
    const zoneCoverageBoardId = readText(zoneCoverageCell.boardId ?? zoneCoverageCell.board_id)
    const zoneCoverageAnchorSource = readText(zoneCoverageCell.coverageAnchorSource ?? zoneCoverageCell.coverage_anchor_source) || 'zone_camera_grid_cell'
    const zoneCoverageAnchorScope = readText(zoneCoverageCell.coverageAnchorScope ?? zoneCoverageCell.coverage_anchor_scope) || zoneCoverageAnchorSource
    const zoneCoverageRegistryRevision = Number(zoneCoverageRegistry.revision ?? 0) || 0
    const sourceReferenceHash = sequenceAnimaticVisualReferenceHash({
      shotId: payload.shotId,
      coverageSetupId,
      requiredReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
      omittedReferenceAssetKeys: [],
    })
    const sourceShotHash = sequenceAnimaticStableHash({
      shotId: payload.shotId,
      shot,
      coverageSetupId,
      sceneGraphOverride: asRecord(coverageSetup.sceneGraphOverride ?? coverageSetup.scene_graph_override),
      sourceReferenceHash,
      coverageRegistryRevision: coverageRegistryNext.revision,
      sceneContinuityManifestHash,
      shotReferenceReadinessHash,
      referencePlanHash: shotIngredientReferencePlan.referencePlanHash,
      coverageDecision: coverageResolution.coverageDecision,
      graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
    })
    const fallbackCoverageAnchorScopeKey = coverageSetupId ? sequenceAnimaticStableHash({
      coverageSetupId,
      spatial: shotSpatialFingerprint(shot, coverageSetup),
      shotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
      subjectRefIds: shotEntityRefIds(shot),
      policy: 'shot_scoped_coverage_anchor_v1',
    }) : ''
    const coverageAnchorScopeKey = zoneCoverageAnchorScopeKey || fallbackCoverageAnchorScopeKey
    const coverageAnchorSource = zoneCoverageAnchorScopeKey ? zoneCoverageAnchorSource : 'per_shot_anchor'

    const existingResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .eq('metadata->>shotId', payload.shotId)
      .or('metadata->>screenplayAnimaticRole.eq.shot_production,metadata->>sequenceAnimaticRole.eq.shot_production')
      .or('metadata->>sequenceAnimaticStale.is.null,metadata->>sequenceAnimaticStale.neq.true')
      .order('created_at', { ascending: false })
      .limit(8)
    if (existingResponse.error) throw new Error(existingResponse.error.message)
    const activeChildren = (existingResponse.data ?? []).map(mapOutputRequestRow)
      .filter((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true && readScreenplayAnimaticRole(metadata) === 'shot_production'
      })
    const matchingChild = activeChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return readText(metadata.dependencyMode) === SHOT_GRAPH_DEPENDENCY_MODE
        && readText(metadata.shotGraphPolicyVersion) === SHOT_GRAPH_POLICY_VERSION
        && readText(metadata.sourceShotHash) === sourceShotHash
        && Boolean(child.workflowId)
    }) ?? null
    let cacheStatus: 'reused' | 'created' | 'refreshed' = 'created'
    let child = matchingChild
    if (!payload.forceRefresh && child?.workflowId) {
      cacheStatus = 'reused'
    } else {
      const staleTargets = payload.forceRefresh ? activeChildren : activeChildren.filter((entry) => entry.id !== matchingChild?.id)
      if (staleTargets.length > 0) {
        const now = new Date().toISOString()
        for (const staleChild of staleTargets) {
          const metadata = asRecord(staleChild.metadata)
          const staleResponse = await admin
            .from('output_requests')
            .update({
              metadata: {
                ...metadata,
                sequenceAnimaticStale: true,
                staleReason: payload.forceRefresh
                  ? 'Shot production graph refresh requested.'
                  : 'Shot production graph source changed or policy was upgraded.',
                staleAt: now,
              },
            })
            .eq('id', staleChild.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
        }
      }
      child = null
      cacheStatus = payload.forceRefresh ? 'refreshed' : 'created'
    }

    let nodes: OutputWorkflowNode[] = []
    let edges: OutputWorkflowEdge[] = []
    let workflow: OutputWorkflow | null = null
    if (!child) {
      const workflowId = crypto.randomUUID()
      const keyframeHash = sequenceAnimaticStableHash({
        shotId: payload.shotId,
        shot,
        coverageSetupId,
        sceneGraphOverride: asRecord(coverageSetup.sceneGraphOverride ?? coverageSetup.scene_graph_override),
        manifestHash,
        directorPlanHash,
        sourceReferenceHash,
        referencePlanHash: shotIngredientReferencePlan.referencePlanHash,
        sceneContinuityManifestHash,
        shotReferenceReadinessHash,
        graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
      })
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'shot_production',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'shot_production',
        dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
        shotGraphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
        parentRequestId: masterRequest.id,
        masterRequestId: masterRequest.id,
        storyboardBlockId: readText(shot.storyboardBlockId ?? shot.blockId),
        shotId: payload.shotId,
        coverageSetupId,
        keyframeHash,
        sourceShotHash,
        sceneContinuityManifestHash,
        shotReferenceReadinessHash,
        sceneContinuityManifestStatus: readText(sceneContinuity.manifest?.status),
        manifestHash,
        directorPlanHash,
        masterManifestArtifactKey,
        requiredReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
        omittedReferenceAssetKeys: [],
        sourceReferenceHash,
        referencePlanHash: shotIngredientReferencePlan.referencePlanHash,
        shotIngredientReferencePlan,
        shot_ingredient_reference_plan: shotIngredientReferencePlan,
        coverageDecision: coverageResolution.coverageDecision,
        coverageDecisionReason: coverageResolution.coverageDecisionReason,
        coverageCompatibilityDiagnostics: coverageResolution.compatibilityDiagnostics,
        coverageRegistryRevision: coverageRegistryNext.revision,
        coverageSetupSource: coverageResolution.coverageSetupSource,
        requestedCoverageSetupId: requestedCoverageSetupId || null,
        dependencyWave: 5,
        continuityDependencyNodeIds: [],
        missingContinuityNodeIds: [],
        referenceSelection: {
          selectedReferences: shotKeyframeSelectedReferences,
          omittedReferences: [],
        },
        shotReferenceOverride: shotReferenceOverride && readText(shotReferenceOverride.shotId) === payload.shotId ? shotReferenceOverride : null,
        shot_reference_override: shotReferenceOverride && readText(shotReferenceOverride.shotId) === payload.shotId ? shotReferenceOverride : null,
        uiIngredientPlanHash: shotReferenceOverride && readText(shotReferenceOverride.shotId) === payload.shotId ? readText(shotReferenceOverride.ingredientPlanHash ?? shotReferenceOverride.ingredient_plan_hash) : '',
        ui_ingredient_plan_hash: shotReferenceOverride && readText(shotReferenceOverride.shotId) === payload.shotId ? readText(shotReferenceOverride.ingredientPlanHash ?? shotReferenceOverride.ingredient_plan_hash) : '',
        sharedDependencyRequests: [
          ...shotKeyframeReferenceAssetKeys.map((assetKey) => ({
            role: readText(shotKeyframeSelectedReferences.find((entry) => readText(entry.assetKey) === assetKey)?.role) || 'entity_reference',
            identityKey: 'assetKey',
            identityValue: assetKey,
            assetKey,
            status: 'ready',
          })),
        ],
        visualBrief: {
          title: readText(shot.title) || payload.shotId,
          action: readText(shot.action) || readText(shot.description),
          camera: asRecord(shot.camera),
          lighting: readText(shot.lighting),
        },
        shotReadySource,
        qcStatus: 'pending',
        qcFindings: [],
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        readyToRun: true,
        provisional: provisionalContext,
        sourceCoverageSetupId: coverageSetupId || null,
      }
      const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: sequenceAnimaticShotProductionTemplateKey,
        rawInput: {
          workflowId,
          draftId: payload.draftId,
          commonConfig: { ...commonConfig, sceneState, scene_state: sceneState },
          block,
          shot,
          panel: {},
          sceneContinuityManifest,
          coverageAnchor: {},
          coverageSetup,
          coverageShots: scopedCoverageShots.length > 0 ? scopedCoverageShots : [shot],
          coverageReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
          previousKeyframe: {},
          assetPack: scopedRefs.assetPack,
          continuityDependencies: [],
          dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
          requiredReferenceAssetKeys: shotKeyframeReferenceAssetKeys,
          omittedReferenceAssetKeys: [],
          selectedReferences: shotKeyframeSelectedReferences,
          omittedReferences: [],
          sharedDependencyRequests: readArray(commonConfig.sharedDependencyRequests).map(asRecord),
          editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shot.editorialDurationSeconds ?? 0) || 3)),
          providerDurationSeconds: Math.max(5, Math.min(15, Number(shot.providerDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 5)),
          aspectRatio,
        },
      })
      const graphPlan = graphResult.graph
      const workflowTemplateMetadata = {
        workflowTemplateKey: sequenceAnimaticShotProductionTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      }
      const title = readText(shot.title) || `Shot ${readText(shot.index) || payload.shotId}`
      const ensured = await ensureMappedChildWorkflow({
        client: admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        parentRequestId: masterRequest.id,
        role: 'shot_production',
        identityKey: 'shotId',
        identityValue: payload.shotId,
        workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_shot_production_${slugify(masterRequest.id)}_${slugify(payload.shotId)}_${slugify(SHOT_GRAPH_POLICY_VERSION)}_${keyframeHash.slice(0, 8)}`,
          name: `${masterRequest.title} / ${title} Production`,
          description: 'Sequence animatic graph-native shot production workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: userId,
          metadata: { ...commonConfig, ...workflowTemplateMetadata },
        },
        nodes: graphPlan.nodes,
        edges: graphPlan.edges,
        request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: userId,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `Prepare shot production graph for ${title}.`,
          title: `${masterRequest.title} / ${title} Production`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'video',
          planner_notes: 'Shot production graph prepared from canonical shot refs and scoped ingredient reference data.',
          metadata: { ...commonConfig, ...workflowTemplateMetadata, shot, createdFromManifestAt: new Date().toISOString() },
        },
      })
      child = ensured.request
      workflow = ensured.workflow
      nodes = ensured.nodes
      edges = ensured.edges
    }

    if (!child?.workflowId) throw new HttpError(409, 'Shot production graph is not ready yet.')
    if (!workflow || nodes.length === 0 || edges.length === 0) {
      const graphBundle = await loadChildWorkflowGraphBundle({ client, workflowIds: [child.workflowId] })
      workflow = workflow ?? graphBundle.workflows[0] ?? null
      nodes = nodes.length > 0 ? nodes : graphBundle.nodes
      edges = edges.length > 0 ? edges : graphBundle.edges
    }

    return sequenceAnimaticShotProductionGraphEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      shotRequest: child,
      workflow,
      nodes,
      edges,
      cacheStatus,
      shotId: payload.shotId,
      coverageSetupId: coverageSetupId || null,
      dependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
      graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
    })
}
