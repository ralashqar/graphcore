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
  buildValidatedSequenceAnimaticTemplateGraph,
  coverageSetupEntityRefIds,
  entityAssetKeys,
  loadScreenplayAnimaticMasterRequest,
  prioritizedEntityAssetKeys,
  readArray,
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
  shotReferenceNodeIds,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import { deriveSequenceAnimaticSceneStates } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import { sequenceAnimaticVisualReferenceHash } from '../../../src/domain/sequenceAnimaticVisualReferencePlan.ts'
import {
  loadSceneContinuityManifests,
  resolveSceneContinuityForShot,
  sceneContinuityBlockingReason,
} from './scene-continuity-manifest-utils.ts'
import {
  buildShotReferenceReadinessHash,
} from '../../../src/domain/sceneContinuityManifest.ts'

const SHOT_GRAPH_POLICY_VERSION = 'primary_chain_v7'
const SHOT_GRAPH_DEPENDENCY_MODE = 'single_node_chain'

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
    const sceneContinuityBlockReason = payload.allowProvisional ? null : sceneContinuityBlockingReason(sceneContinuity)
    if (sceneContinuityBlockReason) {
      const missingNodeIds = readStringArray(sceneContinuity.readiness?.spatialNodeIds)
      return sequenceAnimaticShotProductionGraphEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        shotRequest: null,
        workflow: null,
        nodes: [],
        edges: [],
        cacheStatus: 'blocked',
        nextAction: {
          kind: 'blocked',
          requestId: null,
          workflowId: null,
          role: null,
          reason: sceneContinuityBlockReason === 'missing_scene_continuity_manifest'
            ? 'Prepare the Scene Board before creating this shot production graph.'
            : 'Scene continuity references are not ready for this shot.',
          shotId: payload.shotId,
          coverageSetupId: coverageSetupId || null,
          dependencyNodeIds: missingNodeIds,
        },
        blockedShotKeyframes: [{
          shotId: payload.shotId,
          storyboardBlockId: readText(shot.storyboardBlockId ?? shot.blockId) || null,
          reason: sceneContinuityBlockReason,
          coverageSetupId: coverageSetupId || null,
          previousShotId: null,
          missingContinuityNodeIds: missingNodeIds,
        }],
        shotId: payload.shotId,
        coverageSetupId: coverageSetupId || null,
        dependencyNodeIds: missingNodeIds,
        graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
      })
    }
    const sceneContinuityManifest = sceneContinuity.manifest ?? {}
    const sceneContinuityManifestHash = readText(sceneContinuity.manifest?.sourceHash)
    const shotReferenceReadinessHash = readText(sceneContinuity.readiness?.hash)
      || (sceneContinuity.readiness ? buildShotReferenceReadinessHash(sceneContinuity.readiness) : '')

    const graph = asRecord(
      manifest.continuityGraphV2
        ?? manifest.continuity_graph_v2
        ?? directorPlan.continuityGraphV2
        ?? directorPlan.continuity_graph_v2,
    )
    const allGraphNodes = continuityNodeCollections(graph)
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

    const primaryShotSpatialNodeIds = () => {
      const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
      const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
      const setupSpotIds = readStringArray(coverageSetup.spotIds ?? coverageSetup.spot_ids)
      const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
        || bindingSpotIds[0]
        || readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id)
        || setupSpotIds[0]
      return [
        readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(coverageSetup.setId ?? coverageSetup.set_id),
        readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
        primarySpotId,
        readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
        readText(binding.angleId ?? binding.angle_id ?? shot.angleId ?? shot.angle_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
      ].filter(Boolean)
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
      const dependencyReferenceKeys = visualDependencyEdges
        .filter((edge) => requestedNodeIdSet.has(readText(edge.targetNodeId)))
        .flatMap((edge) => entityAssetKeys(asRecord(graphNodeById.get(readText(edge.sourceNodeId))?.assetState ?? graphNodeById.get(readText(edge.sourceNodeId))?.asset_state)))
        .filter(Boolean)
      if (targetKind === 'location_spot') {
        const zoneId = readText(firstTarget.zoneId ?? firstTarget.zone_id) || parentId
        return uniqueTexts([
          ...entityAssetKeys(asRecord(graphNodeById.get(zoneId)?.assetState ?? graphNodeById.get(zoneId)?.asset_state)),
          ...dependencyReferenceKeys,
        ]).slice(0, 2)
      }
      if (targetKind === 'spot_camera_grid') {
        const zoneId = readText(firstTarget.zoneId ?? firstTarget.zone_id)
        const spotId = readText(firstTarget.spotId ?? firstTarget.spot_id) || parentId
        return uniqueTexts([
          ...entityAssetKeys(asRecord(graphNodeById.get(zoneId)?.assetState ?? graphNodeById.get(zoneId)?.asset_state)),
          ...entityAssetKeys(asRecord(graphNodeById.get(spotId)?.assetState ?? graphNodeById.get(spotId)?.asset_state)),
          ...dependencyReferenceKeys,
        ]).slice(0, 4)
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
    const scopedRefs = scopedAssetPackForShot(assetPack, shot)
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
      requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
      omittedReferenceAssetKeys: [],
    })
    const sourceShotHash = sequenceAnimaticStableHash({
      shotId: payload.shotId,
      shot,
      coverageSetupId,
      sceneGraphOverride: asRecord(coverageSetup.sceneGraphOverride ?? coverageSetup.scene_graph_override),
      coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
      sourceReferenceHash,
      coverageRegistryRevision: coverageRegistryNext.revision,
      zoneCoverageRegistryRevision,
      zoneCoverageAnchorScopeKey,
      zoneCoverageAnchorAssetKey,
      sceneContinuityManifestHash,
      shotReferenceReadinessHash,
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
        coverageAnchorScopeKey,
        coverageAnchorSource,
        manifestHash,
        directorPlanHash,
        sourceReferenceHash,
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
        requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
        omittedReferenceAssetKeys: [],
        sourceReferenceHash,
        coverageAnchorScopeKey,
        coverageAnchorSource,
        coverage_anchor_source: coverageAnchorSource,
        zoneCoverageBoardId: zoneCoverageBoardId || null,
        zoneCoverageCell: Object.keys(zoneCoverageCell).length > 0 ? zoneCoverageCell : null,
        zoneCoverageRegistryRevision,
        coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
        coverageAnchorScope: zoneCoverageAnchorScopeKey ? zoneCoverageAnchorScope : scopedCoverageShots.length === coverageShots.length ? 'coverage_setup' : 'shot_scoped',
        coverageDecision: coverageResolution.coverageDecision,
        coverageDecisionReason: coverageResolution.coverageDecisionReason,
        coverageCompatibilityDiagnostics: coverageResolution.compatibilityDiagnostics,
        coverageRegistryRevision: coverageRegistryNext.revision,
        coverageSetupSource: coverageResolution.coverageSetupSource,
        requestedCoverageSetupId: requestedCoverageSetupId || null,
        dependencyWave: 5,
        continuityDependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
        missingContinuityNodeIds: [],
        referenceSelection: {
          selectedReferences: scopedRefs.selectedReferences,
          omittedReferences: [],
        },
        sharedDependencyRequests: [
          ...(coverageAnchorScopeKey ? [{
            role: 'coverage_anchor',
            identityKey: 'coverageAnchorScopeKey',
            identityValue: coverageAnchorScopeKey,
            coverageSetupId: coverageSetupId || null,
            coverageAnchorSource,
            status: 'graph_node',
          }] : []),
          ...scopedRefs.requiredReferenceAssetKeys.map((assetKey) => ({
            role: 'entity_reference',
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
          coverageReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
          previousKeyframe: {},
          assetPack: scopedRefs.assetPack,
          continuityDependencies,
          dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
          requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
          omittedReferenceAssetKeys: [],
          selectedReferences: scopedRefs.selectedReferences,
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
          planner_notes: 'Shot production graph prepared from direct shot, coverage, continuity, and scoped reference data.',
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
