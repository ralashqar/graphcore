import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  resolveSequenceAnimaticCombinedManifest,
} from '../_shared/output-workflow.ts'
import {
  continuityAssetStateSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  continuityBatchKindForNodes,
  continuityBatchLayoutForTargetCount,
  continuityNodeCollections,
  continuityNodeParentId,
  continuityNodeUsesParent,
  continuityVisualDependencyEdges,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import {
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'
import {
  sanitizeSequenceAnimaticSpatialNodeFields,
  sequenceAnimaticSpatialForbiddenNamesFromShots,
  sequenceAnimaticSpatialPromptPolicyVersion,
} from '../../../src/domain/sequenceAnimaticSpatialPrompt.ts'

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

function readArtifactMetadataRecord(
  artifacts: readonly Record<string, unknown>[],
  roles: readonly string[],
  fields: readonly string[],
) {
  for (const row of artifacts) {
    const metadata = asRecord(row.metadata)
    if (!roles.includes(readText(metadata.role))) continue
    for (const field of fields) {
      const record = asRecord(metadata[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function defaultAssetStateForNode(node: Record<string, unknown>, inputHash: string) {
  const nodeId = readText(node.id)
  return continuityAssetStateSchema.parse({
    status: 'missing',
    inputHash,
    assetKey: null,
    artifactKey: null,
    prompt: '',
    referenceAssetKeys: [],
    sourceNodeId: nodeId,
    assetKind: readText(node.assetKind) || readText(node.nodeKind) || 'continuity_asset',
    generatedAt: null,
    warnings: [],
    error: '',
  })
}

function assetGenerationStatus(assetStateByNodeId: Record<string, unknown>) {
  const states = Object.values(assetStateByNodeId).map(asRecord)
  if (states.length === 0) return 'none'
  if (states.some((state) => readText(state.status) === 'failed')) return 'failed'
  if (states.some((state) => readText(state.status) === 'stale')) return 'stale'
  const readyCount = states.filter((state) => readText(state.status) === 'ready').length
  if (readyCount === states.length) return 'ready'
  if (readyCount > 0) return 'partial'
  return 'none'
}

function continuityPackFromMasterArtifacts(input: {
  masterRequestId: string
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  existingPack: Record<string, unknown>
}) {
  if (Object.keys(input.existingPack).length > 0) return input.existingPack
  const graph = asRecord(
    input.manifest.continuityGraphV2
      ?? input.manifest.continuity_graph_v2
      ?? input.directorPlan.continuityGraphV2
      ?? input.directorPlan.continuity_graph_v2,
  )
  const shotBindings = asRecord(
    input.manifest.shotBindings
      ?? input.manifest.shot_bindings
      ?? input.directorPlan.shotBindings
      ?? input.directorPlan.shot_bindings
      ?? graph.shotBindings,
  )
  if (Object.keys(graph).length === 0) return {}
  const assetStateByNodeId = Object.fromEntries(continuityNodeCollections(graph).map((node) => {
    const nodeId = readText(node.id)
    return [nodeId, defaultAssetStateForNode(node, sequenceAnimaticStableHash({ node }))]
  }).filter(([nodeId]) => Boolean(nodeId)))
  const visualDependencyEdges = continuityVisualDependencyEdges(graph)
  return {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'shot_continuity_plan_v2',
    masterRequestId: input.masterRequestId,
    continuityGraphV2: graph,
    continuity_graph_v2: graph,
    locationSets: readArray(graph.locationSets ?? graph.location_sets ?? graph.sets),
    location_sets: readArray(graph.locationSets ?? graph.location_sets ?? graph.sets),
    locationAngles: readArray(graph.viewpoints).length > 0 ? readArray(graph.viewpoints) : readArray(graph.angles),
    location_angles: readArray(graph.viewpoints).length > 0 ? readArray(graph.viewpoints) : readArray(graph.angles),
    shotBindings,
    shot_bindings: shotBindings,
    assetStateByNodeId,
    asset_state_by_node_id: assetStateByNodeId,
    visualDependencyEdges,
    visual_dependency_edges: visualDependencyEdges,
    assetGenerationStatus: assetGenerationStatus(assetStateByNodeId),
    asset_generation_status: assetGenerationStatus(assetStateByNodeId),
    continuityGraphStatus: 'ready',
    anchorAssets: readArray(graph.assetAnchors ?? graph.asset_anchors),
    continuityPackHash: sequenceAnimaticStableHash({ graph, shotBindings }),
  }
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-continuity-asset-workflow')
    const admin = createAdminClient('ensure-sequence-animatic-continuity-asset-workflow')
    const payload = sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    if (readScreenplayAnimaticRole(asRecord(masterRequest.metadata)) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')

    let continuityRequest: ReturnType<typeof mapOutputRequestRow> | null = null
    if (payload.continuityRequestId) {
      const continuityResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('id', payload.continuityRequestId)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', masterRequest.id)
        .single()
      if (continuityResponse.error || !continuityResponse.data) throw new HttpError(404, 'Continuity request not found.')
      continuityRequest = mapOutputRequestRow(continuityResponse.data)
      const continuityMetadata = asRecord(continuityRequest.metadata)
      if (readScreenplayAnimaticRole(continuityMetadata) !== 'continuity_pack') throw new HttpError(409, 'This request is not a continuity pack.')
    } else {
      const continuityResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', masterRequest.id)
        .order('updated_at', { ascending: false })
        .limit(20)
      if (continuityResponse.error) throw new Error(continuityResponse.error.message)
      continuityRequest = (continuityResponse.data ?? [])
        .map(mapOutputRequestRow)
        .find((entry) => readScreenplayAnimaticRole(asRecord(entry.metadata)) === 'continuity_pack') ?? null
    }
    if (continuityRequest && !continuityRequest.workflowId) continuityRequest = null

    const [masterArtifactsResponse, continuityArtifactsResponse] = await Promise.all([
      client.from('output_artifacts').select(outputArtifactSelect).eq('project_id', payload.projectId).eq('draft_id', payload.draftId).eq('workflow_id', masterRequest.workflowId).order('created_at', { ascending: false }),
      continuityRequest?.workflowId
        ? client.from('output_artifacts').select(outputArtifactSelect).eq('project_id', payload.projectId).eq('draft_id', payload.draftId).eq('workflow_id', continuityRequest.workflowId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)

    const manifestArtifact = (masterArtifactsResponse.data ?? []).find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
    let manifest = asRecord(asRecord(asRecord(manifestArtifact).metadata).manifest)
    let masterManifestArtifactKey = readText(asRecord(manifestArtifact).key)
    let directorPlan = readArtifactMetadataRecord(
      (masterArtifactsResponse.data ?? []).map(asRecord),
      ['sequence_animatic_director_plan'],
      ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'],
    )
    if (Object.keys(manifest).length === 0) {
      // Per-scene architecture: the master has no manifest artifact; combine the
      // ready scene children's manifests at read time instead.
      const combined = await resolveSequenceAnimaticCombinedManifest({ client, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        masterManifestArtifactKey = combined.manifestArtifactKey
      }
    }
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate shots for at least one scene first; no scene manifest is available yet.')
    const manifestHash = sequenceAnimaticStableHash(manifest)

    const continuityArtifact = (continuityArtifactsResponse.data ?? []).find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_continuity_pack') ?? null
    const existingPack = asRecord(asRecord(asRecord(continuityArtifact).metadata).continuityPack)
    const continuityPack = continuityPackFromMasterArtifacts({
      masterRequestId: masterRequest.id,
      manifest,
      directorPlan,
      existingPack,
    })
    const graph = asRecord(continuityPack.continuityGraphV2 ?? continuityPack.continuity_graph_v2)
    if (Object.keys(graph).length === 0) throw new HttpError(409, 'Generate the shot continuity plan first.')
    const allGraphNodes = continuityNodeCollections(graph)
    let requestedNodeIds = [...new Set([payload.nodeId, ...readStringArray(payload.nodeIds)].map(readText).filter(Boolean))].slice(0, 4)
    const targetNodes = requestedNodeIds.map((nodeId) => allGraphNodes.find((entry) => readText(entry.id) === nodeId) ?? null)
    if (targetNodes.some((node) => !node)) throw new HttpError(404, 'One or more continuity nodes were not found in the current scene graph.')
    let resolvedTargetNodes = (targetNodes as Record<string, unknown>[])
      .map((node) => applySceneGraphOverrideToNode(node, sceneGraphOverrideForNode(asRecord(masterRequest.metadata), readText(node.id))))
    let targetNode = resolvedTargetNodes[0] ?? null
    if (!targetNode) throw new HttpError(404, 'Continuity node was not found in the current scene graph.')
    let batchKind = resolvedTargetNodes.length > 1 ? continuityBatchKindForNodes(resolvedTargetNodes) : ''
    let batchParentId = resolvedTargetNodes.length > 1
      ? batchKind === 'parent_child_scaffold_grid'
        ? readText(targetNode.id)
        : continuityNodeParentId(targetNode)
      : ''
    if (resolvedTargetNodes.length > 1) {
      if (!batchKind) throw new HttpError(400, 'Only sibling spots or viewpoints can be generated as a continuity asset grid.')
      const validBatchParent = batchKind === 'parent_child_scaffold_grid'
        ? batchParentId && resolvedTargetNodes.slice(1).every((node) => continuityNodeParentId(node) === batchParentId)
        : batchParentId && resolvedTargetNodes.every((node) => continuityNodeParentId(node) === batchParentId)
      if (!validBatchParent) {
        throw new HttpError(400, 'Continuity asset grids require sibling nodes with the same parent.')
      }
    }

    const allShots = readArray(asRecord(manifest.shotPlan).shots)
      .map(asRecord)
      .concat(readArray(manifest.blocks).flatMap((block) => readArray(asRecord(block).shots).map(asRecord)))
    const seenShotIds = new Set<string>()
    const uniqueShots = allShots.filter((shot) => {
      const id = readText(shot.id)
      if (!id || seenShotIds.has(id)) return false
      seenShotIds.add(id)
      return true
    })
    const targetShotIds = new Set(resolvedTargetNodes.flatMap((node) => readStringArray(node.shotIds)))
    const bindings = asRecord(continuityPack.shotBindings ?? continuityPack.shot_bindings ?? graph.shotBindings)
    Object.entries(bindings).forEach(([shotId, bindingValue]) => {
      const binding = asRecord(bindingValue)
      const bindingNodeIds = new Set([
        readText(binding.setId),
        readText(binding.zoneId),
        readText(binding.angleId),
        readText(binding.viewpointId),
        readText(binding.primarySpotId),
        ...readStringArray(binding.spotIds),
      ].filter(Boolean))
      if (requestedNodeIds.some((nodeId) => bindingNodeIds.has(nodeId))) {
        targetShotIds.add(shotId)
      }
    })
    const relevantShots = uniqueShots.filter((shot) => targetShotIds.has(readText(shot.id))).slice(0, 12)
    const visualDependencyEdges = readArray(continuityPack.visualDependencyEdges ?? continuityPack.visual_dependency_edges).map(asRecord)
    const dependencyEdges = visualDependencyEdges.length > 0 ? visualDependencyEdges : continuityVisualDependencyEdges(graph)
    const assetParentRequest = continuityRequest ?? masterRequest
    const childResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', assetParentRequest.id)
      .order('created_at', { ascending: false })
    if (childResponse.error) throw new Error(childResponse.error.message)
    const assetStates = {
      ...asRecord(continuityPack.assetStateByNodeId ?? continuityPack.asset_state_by_node_id),
    }
    const assetChildren = (childResponse.data ?? [])
      .map(mapOutputRequestRow)
      .filter((child) => {
        const role = readScreenplayAnimaticRole(asRecord(child.metadata))
        return role === 'continuity_asset' || role === 'continuity_asset_batch'
      })
    const assetChildWorkflowIds = [...new Set(assetChildren.map((child) => child.workflowId).filter((id): id is string => Boolean(id)))]
    if (assetChildWorkflowIds.length > 0) {
      const assetArtifactsResponse = await client
        .from('output_artifacts')
        .select(outputArtifactSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .in('workflow_id', assetChildWorkflowIds)
        .order('created_at', { ascending: false })
      if (assetArtifactsResponse.error) throw new Error(assetArtifactsResponse.error.message)
      for (const artifact of assetArtifactsResponse.data ?? []) {
        const metadata = asRecord(asRecord(artifact).metadata)
        const role = readText(metadata.role)
        if (role === 'sequence_animatic_continuity_asset') {
          const state = asRecord(metadata.assetState ?? metadata.asset_state)
          const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
          if (nodeId) assetStates[nodeId] = state
        }
        if (role === 'sequence_animatic_continuity_asset_batch') {
          const stateByNodeId = asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)
          Object.entries(stateByNodeId).forEach(([nodeId, state]) => {
            if (readText(nodeId) && Object.keys(asRecord(state)).length > 0) assetStates[nodeId] = state
          })
        }
      }
    }
    const requestedNodeIdSet = new Set(requestedNodeIds)
    const referenceAssetKeys = dependencyEdges
      .filter((edge) => requestedNodeIdSet.has(readText(edge.targetNodeId)))
      .map((edge) => readText(asRecord(assetStates[readText(edge.sourceNodeId)]).assetKey))
      .filter(Boolean)
      .slice(0, 6)
    const batchSiblingReferenceAssetKeys = resolvedTargetNodes.length > 1
      ? allGraphNodes
        .filter((node) => !requestedNodeIdSet.has(readText(node.id)))
        .filter((node) => readText(node.nodeKind) === readText(targetNode.nodeKind))
        .filter((node) => continuityNodeUsesParent(node, batchParentId))
        .map((node) => readText(asRecord(assetStates[readText(node.id)]).assetKey))
        .filter(Boolean)
        .slice(0, 4)
      : []
    const worldLocationRefId = readText(targetNode.worldLocationRefId) || readText(targetNode.baseLocationRefId)
    const assetPack = asRecord(manifest.assetPack)
    const assetPackEntities = readArray(assetPack.entities).map(asRecord)
    const targetWorldEntity = worldLocationRefId ? assetPackEntities.find((entity) => readText(entity.key) === worldLocationRefId) ?? null : null
    const worldReferenceAssetKeys = targetWorldEntity ? [
      readText(targetWorldEntity.primaryAssetKey),
      readText(targetWorldEntity.selectedReferenceAssetKey),
      ...readStringArray(targetWorldEntity.assetKeys),
    ].filter(Boolean).slice(0, 2) : []
    const graphNodeIds = new Set(allGraphNodes.map((entry) => readText(entry.id)).filter(Boolean))
    const missingParent = dependencyEdges.find((edge) => {
      if (!requestedNodeIdSet.has(readText(edge.targetNodeId)) || edge.required === false) return false
      const sourceNodeId = readText(edge.sourceNodeId)
      if (!sourceNodeId || !graphNodeIds.has(sourceNodeId)) return false
      return !readText(asRecord(assetStates[sourceNodeId]).assetKey)
    })
    if (missingParent) {
      const parentNodeId = readText(missingParent.sourceNodeId)
      const rawParentNode = allGraphNodes.find((node) => readText(node.id) === parentNodeId) ?? null
      const parentNode = rawParentNode
        ? applySceneGraphOverrideToNode(rawParentNode, sceneGraphOverrideForNode(asRecord(masterRequest.metadata), parentNodeId))
        : null
      const parentKind = readText(parentNode?.nodeKind)
      const targetKind = readText(targetNode.nodeKind)
      const canScaffold = parentNode
        && (parentKind === 'location_set' || parentKind === 'location_zone' || parentKind === 'location_spot')
        && (targetKind === 'location_zone' || targetKind === 'location_spot' || targetKind === 'location_viewpoint' || targetKind === 'location_angle')
        && continuityNodeParentId(targetNode) === parentNodeId
      if (!canScaffold) {
        throw new HttpError(409, `Generate parent continuity asset first: ${parentNodeId}.`)
      }
      const siblingChildren = allGraphNodes
        .filter((node) => readText(node.id) !== readText(targetNode.id))
        .filter((node) => {
          const kind = readText(node.nodeKind)
          return kind === targetKind || (targetKind === 'location_viewpoint' && kind === 'location_angle') || (targetKind === 'location_angle' && kind === 'location_viewpoint')
        })
        .filter((node) => continuityNodeParentId(node) === parentNodeId)
        .filter((node) => !readText(asRecord(assetStates[readText(node.id)]).assetKey))
        .slice(0, 2)
      resolvedTargetNodes = [parentNode, targetNode, ...siblingChildren].slice(0, 4)
      requestedNodeIds = resolvedTargetNodes.map((node) => readText(node.id)).filter(Boolean)
      requestedNodeIdSet.clear()
      requestedNodeIds.forEach((nodeId) => requestedNodeIdSet.add(nodeId))
      targetNode = resolvedTargetNodes[0]
      batchKind = 'parent_child_scaffold_grid'
      batchParentId = parentNodeId
    }
    const parentReferenceAssetKeys = batchParentId
      ? [readText(asRecord(assetStates[batchParentId]).assetKey)].filter(Boolean)
      : []
    if (
      resolvedTargetNodes.length > 1
      && (batchKind === 'spot_grid' || batchKind === 'viewpoint_grid')
      && parentReferenceAssetKeys.length === 0
    ) {
      throw new HttpError(409, `Generate parent continuity asset first: ${batchParentId || 'parent spatial node'}.`)
    }
    const allReferenceAssetKeys = [...new Set([...referenceAssetKeys, ...parentReferenceAssetKeys, ...batchSiblingReferenceAssetKeys, ...worldReferenceAssetKeys])].slice(0, 8)
    const referenceEntities = allReferenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || payload.nodeId} dependency`))
    const augmentedAssetPack = {
      ...assetPack,
      entities: [
        ...assetPackEntities,
        ...referenceEntities,
      ],
      continuityReferenceAssetKeys: allReferenceAssetKeys,
    }
    const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
    if (resolvedTargetNodes.length > 1 && batchKind) {
      const batchTargetIds = resolvedTargetNodes.map((node) => readText(node.id)).filter(Boolean)
      const isParentChildScaffold = batchKind === 'parent_child_scaffold_grid'
      const sourceReferenceNodeIds = isParentChildScaffold
        ? [continuityNodeParentId(targetNode)].filter(Boolean)
        : [
            batchParentId,
            ...allGraphNodes
              .filter((node) => !requestedNodeIdSet.has(readText(node.id)))
              .filter((node) => readText(node.nodeKind) === readText(targetNode.nodeKind))
              .filter((node) => continuityNodeUsesParent(node, batchParentId))
              .filter((node) => readText(asRecord(assetStates[readText(node.id)]).assetKey))
              .map((node) => readText(node.id)),
          ].filter(Boolean)
      const generationPolicy = isParentChildScaffold ? 'parent_child_scaffold_grid' : 'manual_sibling_grid'
      const cellRoles = isParentChildScaffold ? ['parent', ...batchTargetIds.slice(1).map(() => 'child')] : batchTargetIds.map(() => 'sibling')
      const layout = continuityBatchLayoutForTargetCount(batchTargetIds.length)
      const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(relevantShots)
      const sanitizedPromptNodes = resolvedTargetNodes.map((node) => sanitizeSequenceAnimaticSpatialNodeFields(node, { forbiddenNames }))
      const batch = {
        batchId: `${isParentChildScaffold ? 'manual_scaffold' : 'manual'}_${batchKind}_${slugify(batchParentId)}_${sequenceAnimaticStableHash(batchTargetIds).slice(0, 8)}`,
        batchKind,
        targetNodeIds: batchTargetIds,
        sourceReferenceNodeIds,
        worldReferenceAssetKeys,
        blockIds: [...new Set(resolvedTargetNodes.flatMap((node) => readStringArray(node.storyboardBlockIds ?? node.blockIds)))],
        layout,
        gridLayout: layout,
        cellRoles,
        required: true,
        generationPolicy,
      }
      const batchInputHash = sequenceAnimaticStableHash({
        spatialPromptPolicyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
        batch,
        targetNodes: resolvedTargetNodes,
        sanitizedPromptNodes,
        relevantShotIds: relevantShots.map((shot) => readText(shot.id)),
        referenceAssetKeys: allReferenceAssetKeys,
        manifestHash,
      })
      const continuityBatchIdentity = `${readText(batch.batchId)}:${batchInputHash}`
      const existingBatch = assetChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'continuity_asset_batch'
          && readText(metadata.continuityBatchIdentity) === continuityBatchIdentity
      }) ?? null
      let existingBatchReusable = false
      if (existingBatch?.workflowId) {
        existingBatchReusable = existingBatch.status === 'completed'
          || existingBatch.status === 'queued'
          || existingBatch.status === 'running'
          || existingBatch.status === 'planning'
        if (existingBatch.latestRunId) {
          const existingRunResponse = await admin
            .from('output_workflow_runs')
            .select('id, status')
            .eq('id', existingBatch.latestRunId)
            .maybeSingle()
          const existingRunStatus = readText(existingRunResponse.data?.status)
          if (existingRunStatus === 'failed' || existingRunStatus === 'cancelled') {
            existingBatchReusable = false
          }
        }
      }
      if (existingBatch?.workflowId && existingBatchReusable) {
        return json(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
          ok: true,
          masterRequest,
          continuityRequest,
          assetRequest: existingBatch,
          workflow: null,
          nodes: [],
          edges: [],
          assetState: null,
          reused: true,
        }))
      }

      const workflowId = crypto.randomUUID()
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'continuity_asset_batch',
        screenplayAnimaticSource: readText(asRecord(masterRequest.metadata).screenplayAnimaticSource) || 'wiki_sequence_unit',
        sequenceAnimaticRole: 'continuity_asset_batch',
        masterRequestId: masterRequest.id,
        continuityRequestId: continuityRequest?.id ?? null,
        continuityWorkflowId: continuityRequest?.workflowId ?? null,
        continuityBatchId: readText(batch.batchId),
        continuityBatchHash: batchInputHash,
        continuityBatchIdentity,
        targetNodeIds: batchTargetIds,
        assetKind: batchKind,
        assetInputHash: batchInputHash,
        generationPolicy,
        gridLayout: layout,
        cellRoles,
        manifestHash,
        continuityPackHash: readText(continuityPack.continuityPackHash),
        masterManifestArtifactKey,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        worldLocationRefId,
        parentNodeIds: sourceReferenceNodeIds,
        spatialPromptPolicyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
      }
      const { nodes, edges } = buildSequenceAnimaticContinuityBatchWorkflowGraph({
        workflowId,
        draftId: payload.draftId,
        commonConfig,
        batch,
        targetNodes: resolvedTargetNodes,
        continuityGraphV2: graph,
        relevantShots,
        shotBindings: bindings,
        assetPack: augmentedAssetPack,
        referenceAssetKeys: allReferenceAssetKeys,
        visualDependencyEdges: dependencyEdges,
        aspectRatio: readText(assetPack.aspectRatio) || '1:1',
      })
      const targetNames = resolvedTargetNodes.map((node) => readText(node.name) || readText(node.id)).filter(Boolean)
      const workflowPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: `sequence_animatic_continuity_asset_batch_${slugify(assetParentRequest.id)}_${slugify(readText(batch.batchId))}_${batchInputHash.slice(0, 8)}`,
        name: `${targetNames.slice(0, 3).join(', ')} continuity grid`,
        description: 'Sequence animatic sibling scene-graph continuity asset grid workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: user.id,
        metadata: {
          ...commonConfig,
          batch,
          readyToRun: true,
        },
      }
      const requestPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        parent_request_id: assetParentRequest.id,
        requested_by: user.id,
        source_surface: masterRequest.sourceSurface === 'outputs' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `Generate continuity asset grid for ${targetNames.join(', ')}.`,
        title: `${targetNames.slice(0, 3).join(', ')} continuity grid`,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'image',
        planner_notes: 'Sibling continuity assets generated as one grid and cropped per scene-graph node.',
        metadata: {
          ...commonConfig,
          batch,
          targetNodes: resolvedTargetNodes,
          referenceAssetKeys: allReferenceAssetKeys,
          readyToRun: true,
          createdFromContinuityAt: new Date().toISOString(),
        },
      }
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: assetParentRequest.id,
        p_role: 'continuity_asset_batch',
        p_identity_key: 'continuityBatchIdentity',
        p_identity_value: continuityBatchIdentity,
        p_workflow: workflowPayload,
        p_nodes: nodes,
        p_edges: edges,
        p_request: requestPayload,
      })
      if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure continuity asset batch workflow.')
      const ensured = asRecord(ensureResponse.data)
      const assetRequest = mapOutputRequestRow(asRecord(ensured.request) as never)
      const workflow = Object.keys(asRecord(ensured.workflow)).length > 0 ? mapOutputWorkflowRow(asRecord(ensured.workflow) as never) : null
      return json(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        assetRequest,
        workflow,
        nodes: readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never)),
        edges: readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never)),
        assetState: null,
        reused: ensured.reused === true,
      }))
    }

    const targetIsSpatial = ['location_set', 'location_zone', 'location_spot', 'location_angle', 'location_viewpoint'].includes(assetKind)
    const singleForbiddenNames = targetIsSpatial ? sequenceAnimaticSpatialForbiddenNamesFromShots(relevantShots) : []
    const sanitizedPromptNode = targetIsSpatial
      ? sanitizeSequenceAnimaticSpatialNodeFields(targetNode, { forbiddenNames: singleForbiddenNames })
      : null
    const inputHash = sequenceAnimaticStableHash({
      spatialPromptPolicyVersion: targetIsSpatial ? sequenceAnimaticSpatialPromptPolicyVersion : '',
      targetNode,
      sanitizedPromptNode,
      relevantShotIds: relevantShots.map((shot) => readText(shot.id)),
      referenceAssetKeys: allReferenceAssetKeys,
      manifestHash,
    })
    const currentAssetState = continuityAssetStateSchema.safeParse(asRecord(assetStates[payload.nodeId]))
    if (payload.mode === 'generate' && currentAssetState.success && currentAssetState.data.status === 'ready' && currentAssetState.data.inputHash === inputHash) {
      return json(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        assetRequest: null,
        workflow: null,
        nodes: [],
        edges: [],
        assetState: currentAssetState.data,
        reused: true,
      }))
    }

    const assetIdentity = `${payload.nodeId}:${inputHash}`
    const existing = assetChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return metadata.sequenceAnimaticStale !== true
        && readScreenplayAnimaticRole(metadata) === 'continuity_asset'
        && readText(metadata.assetIdentity) === assetIdentity
    }) ?? null
    if (existing?.workflowId) {
      return json(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        assetRequest: existing,
        workflow: null,
        nodes: [],
        edges: [],
        assetState: currentAssetState.success ? currentAssetState.data : null,
        reused: true,
      }))
    }

    const workflowId = crypto.randomUUID()
    const commonConfig = {
      cinematicPipelineVersion: 'v3_script_storyboards',
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'continuity_asset',
      screenplayAnimaticSource: readText(asRecord(masterRequest.metadata).screenplayAnimaticSource) || 'wiki_sequence_unit',
      sequenceAnimaticRole: 'continuity_asset',
      masterRequestId: masterRequest.id,
      continuityRequestId: continuityRequest?.id ?? null,
      continuityWorkflowId: continuityRequest?.workflowId ?? null,
      targetNodeId: payload.nodeId,
      assetKind,
      assetInputHash: inputHash,
      assetIdentity,
      manifestHash,
      continuityPackHash: readText(continuityPack.continuityPackHash),
      masterManifestArtifactKey,
      sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
      worldLocationRefId,
      parentNodeIds: dependencyEdges.filter((edge) => readText(edge.targetNodeId) === payload.nodeId).map((edge) => readText(edge.sourceNodeId)).filter(Boolean),
      spatialPromptPolicyVersion: targetIsSpatial ? sequenceAnimaticSpatialPromptPolicyVersion : '',
    }
    const { nodes, edges } = buildSequenceAnimaticContinuityAssetWorkflowGraph({
      workflowId,
      draftId: payload.draftId,
      commonConfig,
      continuityPack,
      targetNode,
      targetNodeId: payload.nodeId,
      assetKind,
      relevantShots,
      shotBindings: bindings,
      assetPack: augmentedAssetPack,
      referenceAssetKeys: allReferenceAssetKeys,
      visualDependencyEdges: dependencyEdges,
      aspectRatio: readText(assetPack.aspectRatio) || '16:9',
    })
    const workflowPayload = {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      key: `sequence_animatic_continuity_asset_${slugify(assetParentRequest.id)}_${slugify(payload.nodeId)}_${inputHash.slice(0, 8)}`,
      name: `${readText(targetNode.name) || payload.nodeId} continuity asset`,
      description: 'Sequence animatic node-scoped continuity asset workflow.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: user.id,
      metadata: {
        ...commonConfig,
        readyToRun: true,
      },
    }
    const requestPayload = {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      parent_request_id: assetParentRequest.id,
      requested_by: user.id,
      source_surface: masterRequest.sourceSurface === 'outputs' ? 'outputs' : 'wiki_sequence_unit',
      prompt: `Generate continuity asset for ${readText(targetNode.name) || payload.nodeId}.`,
      title: `${readText(targetNode.name) || payload.nodeId} continuity asset`,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
      page_count: null,
      target_format: 'image',
      planner_notes: 'Node-scoped continuity asset generated from the evolving scene graph.',
      metadata: {
        ...commonConfig,
        targetNode,
        referenceAssetKeys: allReferenceAssetKeys,
        readyToRun: true,
        createdFromContinuityAt: new Date().toISOString(),
      },
    }
    const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
      p_project_id: payload.projectId,
      p_draft_id: payload.draftId,
      p_parent_request_id: assetParentRequest.id,
      p_role: 'continuity_asset',
      p_identity_key: 'assetIdentity',
      p_identity_value: assetIdentity,
      p_workflow: workflowPayload,
      p_nodes: nodes,
      p_edges: edges,
      p_request: requestPayload,
    })
    if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure continuity asset workflow.')
    const ensured = asRecord(ensureResponse.data)
    const assetRequest = mapOutputRequestRow(asRecord(ensured.request) as never)
    const workflow = Object.keys(asRecord(ensured.workflow)).length > 0 ? mapOutputWorkflowRow(asRecord(ensured.workflow) as never) : null
    const assetState = continuityAssetStateSchema.parse({
      status: 'generating',
      inputHash,
      assetKey: null,
      artifactKey: null,
      prompt: '',
      referenceAssetKeys: allReferenceAssetKeys,
      sourceNodeId: payload.nodeId,
      assetKind,
      generatedAt: null,
      warnings: [],
      error: '',
    })
    return json(sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      continuityRequest,
      assetRequest,
      workflow,
      nodes: readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never)),
      edges: readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never)),
      assetState,
      reused: ensured.reused === true,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic continuity asset workflow.')
  }
})
