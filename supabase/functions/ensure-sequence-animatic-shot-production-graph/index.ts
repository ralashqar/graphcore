import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  resolveSequenceAnimaticCombinedManifest,
} from '../_shared/output-workflow.ts'
import {
  buildSequenceAnimaticShotProductionWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'
import {
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

const SHOT_GRAPH_POLICY_VERSION = 'primary_chain_v5'
const SHOT_GRAPH_DEPENDENCY_MODE = 'single_node_chain'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function artifactMetadataRecord(
  artifacts: readonly Record<string, unknown>[],
  roles: readonly string[],
  fields: readonly string[],
) {
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    if (!roles.includes(readText(metadata.role))) continue
    for (const field of fields) {
      const record = asRecord(metadata[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

function assetEntityForKey(assetKey: string, label: string) {
  return {
    key: `continuity_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role: 'continuity_reference',
    summary: 'Previously generated continuity asset used as a visual dependency.',
    visualDescription: 'Use this reference to preserve style, material, lighting, spatial layout, and design continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_asset',
    selectedReferenceVariantLabel: label || 'Continuity reference',
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Scene-graph continuity visual dependency.',
  }
}

function entityAssetKeys(entity: Record<string, unknown>) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

function shotEntityRefIds(shot: Record<string, unknown>) {
  const refs = asRecord(shot.refs ?? shot.references)
  return uniqueTexts([
    ...readStringArray(refs.characterRefIds ?? refs.character_ref_ids),
    ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
    ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
    ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
    ...readStringArray(refs.itemRefIds ?? refs.item_ref_ids),
    ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
    ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
    ...readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
    ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
    ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
    ...readArray(shot.dialogue).map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)),
  ])
}

function coverageSetupEntityRefIds(coverageSetup: Record<string, unknown>) {
  return uniqueTexts([
    ...readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
    ...readStringArray(coverageSetup.visibleCharacterRefIds ?? coverageSetup.visible_character_ref_ids),
    ...readStringArray(coverageSetup.subjectRefIds ?? coverageSetup.subject_ref_ids),
    ...readStringArray(coverageSetup.speakerRefIds ?? coverageSetup.speaker_ref_ids),
    ...readStringArray(coverageSetup.propRefIds ?? coverageSetup.prop_ref_ids),
    ...readStringArray(coverageSetup.itemRefIds ?? coverageSetup.item_ref_ids),
  ])
}

function scopedAssetPackForShot(
  assetPack: Record<string, unknown>,
  shot: Record<string, unknown>,
  coverageSetup: Record<string, unknown>,
) {
  const entityIds = new Set([
    ...shotEntityRefIds(shot),
    ...coverageSetupEntityRefIds(coverageSetup),
  ])
  const entities = readArray(assetPack.entities).map(asRecord).filter((entity) => entityIds.has(readText(entity.key)))
  const requiredReferenceAssetKeys = uniqueTexts(entities.flatMap(entityAssetKeys)).slice(0, 8)
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
      reason: 'Selected from shot-visible refs and coverage setup subjects.',
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-shot-production-graph')
    const admin = createAdminClient('ensure-sequence-animatic-shot-production-graph')
    const payload = sequenceAnimaticShotProductionGraphEnsureRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    const masterMetadata = asRecord(masterRequest.metadata)
    if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
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
    const { shot, block, mergedShots, coverageSetup, coverageSetupId, coverageShots, sceneState } = mergedShotPlan({
      manifest,
      directorPlan,
      shotId: payload.shotId,
    })
    const requestedCoverageSetupId = payload.coverageSetupId ? readText(payload.coverageSetupId) : ''
    if (requestedCoverageSetupId && coverageSetupId && requestedCoverageSetupId !== coverageSetupId) {
      throw new HttpError(409, `Shot ${payload.shotId} belongs to coverage setup ${coverageSetupId}, not ${requestedCoverageSetupId}.`)
    }

    const graph = asRecord(
      manifest.continuityGraphV2
        ?? manifest.continuity_graph_v2
        ?? directorPlan.continuityGraphV2
        ?? directorPlan.continuity_graph_v2,
    )
    const allGraphNodes = continuityNodeCollections(graph)
    const graphNodeById = new Map(allGraphNodes.map((node) => [readText(node.id), node] as const).filter(([id]) => id))
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
      return orderedIds.map((nodeId) => graphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
    }
    const relevantShotsForNodes = (nodes: readonly Record<string, unknown>[]) => {
      const targetShotIds = new Set(nodes.flatMap((node) => readStringArray(node.shotIds)))
      const requestedNodeIds = new Set(nodes.map((node) => readText(node.id)).filter(Boolean))
      Object.entries(shotBindings).forEach(([shotId, bindingValue]) => {
        const binding = asRecord(bindingValue)
        const bindingNodeIds = new Set([
          readText(binding.setId),
          readText(binding.zoneId),
          readText(binding.angleId),
          readText(binding.viewpointId),
          readText(binding.primarySpotId),
          ...readStringArray(binding.spotIds),
        ].filter(Boolean))
        if ([...requestedNodeIds].some((nodeId) => bindingNodeIds.has(nodeId))) targetShotIds.add(shotId)
      })
      return mergedShots.filter((entry) => targetShotIds.has(readText(entry.id))).slice(0, 12)
    }
    const referenceAssetKeysForTargets = (targetNodes: readonly Record<string, unknown>[]) => {
      const requestedNodeIdSet = new Set(targetNodes.map((node) => readText(node.id)).filter(Boolean))
      const firstTarget = targetNodes[0] ?? {}
      const parentId = continuityNodeParentId(firstTarget)
      const siblingReferenceKeys = parentId
        ? allGraphNodes
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
    const continuityDependencies = shotContinuityDependencyNodes().map((targetNode) => {
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
    const scopedRefs = scopedAssetPackForShot(assetPack, shot, coverageSetup)
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
      sourceReferenceHash,
      graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
    })

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

    let nodes: ReturnType<typeof mapOutputWorkflowNodeRow>[] = []
    let edges: ReturnType<typeof mapOutputWorkflowEdgeRow>[] = []
    let workflow: ReturnType<typeof mapOutputWorkflowRow> | null = null
    if (!child) {
      const workflowId = crypto.randomUUID()
      const keyframeHash = sequenceAnimaticStableHash({
        shotId: payload.shotId,
        shot,
        coverageSetupId,
        manifestHash,
        directorPlanHash,
        sourceReferenceHash,
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
        manifestHash,
        directorPlanHash,
        masterManifestArtifactKey,
        requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
        omittedReferenceAssetKeys: [],
        sourceReferenceHash,
        dependencyWave: 5,
        continuityDependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
        missingContinuityNodeIds: [],
        referenceSelection: {
          selectedReferences: scopedRefs.selectedReferences,
          omittedReferences: [],
        },
        sharedDependencyRequests: [
          ...(coverageSetupId ? [{
            role: 'coverage_anchor',
            identityKey: 'coverageSetupId',
            identityValue: coverageSetupId,
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
      const graphPlan = buildSequenceAnimaticShotProductionWorkflowGraph({
        workflowId,
        draftId: payload.draftId,
        commonConfig: { ...commonConfig, sceneState, scene_state: sceneState },
        block,
        shot,
        panel: {},
        coverageAnchor: {},
        coverageSetup,
        coverageShots: coverageShots.length > 0 ? coverageShots : [shot],
        coverageReferenceAssetKeys: [],
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
      })
      const title = readText(shot.title) || `Shot ${readText(shot.index) || payload.shotId}`
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: masterRequest.id,
        p_role: 'shot_production',
        p_identity_key: 'shotId',
        p_identity_value: payload.shotId,
        p_workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_shot_production_${slugify(masterRequest.id)}_${slugify(payload.shotId)}_${slugify(SHOT_GRAPH_POLICY_VERSION)}_${keyframeHash.slice(0, 8)}`,
          name: `${masterRequest.title} / ${title} Production`,
          description: 'Sequence animatic graph-native shot production workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: commonConfig,
        },
        p_nodes: graphPlan.nodes,
        p_edges: graphPlan.edges,
        p_request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: user.id,
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
          metadata: { ...commonConfig, shot, createdFromManifestAt: new Date().toISOString() },
        },
      })
      if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure shot production workflow.')
      const ensured = asRecord(ensureResponse.data)
      child = mapOutputRequestRow(asRecord(ensured.request) as never)
      workflow = mapOutputWorkflowRow(asRecord(ensured.workflow) as never)
      nodes = readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
    }

    if (!child?.workflowId) throw new HttpError(409, 'Shot production graph is not ready yet.')
    if (!workflow) {
      const workflowResponse = await client
        .from('output_workflows')
        .select('*')
        .eq('id', child.workflowId)
        .maybeSingle()
      if (workflowResponse.error) throw new Error(workflowResponse.error.message)
      workflow = workflowResponse.data ? mapOutputWorkflowRow(asRecord(workflowResponse.data) as never) : null
    }
    if (nodes.length === 0 || edges.length === 0) {
      const nodeResponse = await client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', child.workflowId)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)
      const edgeResponse = await client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', child.workflowId)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      nodes = (nodeResponse.data ?? []).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = (edgeResponse.data ?? []).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
    }

    return json(sequenceAnimaticShotProductionGraphEnsureResponseSchema.parse({
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
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic shot production graph.')
  }
})
