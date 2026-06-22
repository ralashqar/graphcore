import { HttpError } from './http.ts'
import { ensureMappedChildWorkflow, markChildWorkflowStale } from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
  resolveSequenceAnimaticCombinedManifest,
} from './output-workflow.ts'
import {
  continuityAssetStateSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  continuityAtlasLayoutForTargetCount,
  continuityBatchKindForNodes,
  continuityBatchLayoutForTargetCount,
  continuityNodeCollections,
  continuityNodeParentId,
  continuityNodeUsesParent,
  continuitySpotCameraGridLayoutForTargetCount,
  continuityVisualDependencyEdges,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticContinuityAssetTemplateKey,
  sequenceAnimaticContinuityBatchTemplateKey,
} from './sequence-animatic-template-registry.ts'
import { buildValidatedSequenceAnimaticTemplateGraph } from './sequence-animatic-command-utils.ts'
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

function spatialNodeKind(node: Record<string, unknown>) {
  return readText(node.nodeKind ?? node.assetKind ?? node.kind)
}

function compactPromptLine(value: string, maxLength = 150) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength).replace(/\s+\S*$/, '').trim()
  return clipped ? `${clipped}.` : normalized.slice(0, maxLength).trim()
}

function zoneMapPoiLinesForNode(input: {
  zoneNode: Record<string, unknown>
  graphNodes: readonly Record<string, unknown>[]
  relevantShots: readonly Record<string, unknown>[]
}) {
  const zoneId = readText(input.zoneNode.id)
  if (!zoneId) return []
  const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(input.relevantShots)
  const children = input.graphNodes
    .filter((node) => continuityNodeParentId(node) === zoneId)
    .filter((node) => ['location_spot', 'location_angle', 'location_viewpoint'].includes(spatialNodeKind(node)))
    .slice(0, 12)
  return children.map((node) => {
    const sanitized = sanitizeSequenceAnimaticSpatialNodeFields(node, { forbiddenNames })
    const kind = sanitized.kindLabel || spatialNodeKind(node) || 'POI'
    const name = sanitized.name || readText(node.name) || readText(node.id) || 'POI'
    const brief = compactPromptLine(sanitized.brief || readText(node.visualBrief) || readText(node.summary), 140)
    return brief ? `${name} (${kind}): ${brief}` : `${name} (${kind})`
  }).filter(Boolean)
}

function descendantContinuityNodeIds(input: {
  graphNodes: readonly Record<string, unknown>[]
  rootNodeIds: readonly string[]
}) {
  const rootIds = new Set(input.rootNodeIds.map(readText).filter(Boolean))
  if (rootIds.size === 0) return new Set<string>()
  const childrenByParentId = new Map<string, Record<string, unknown>[]>()
  for (const node of input.graphNodes) {
    const parentId = continuityNodeParentId(node)
    if (!parentId) continue
    childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), node])
  }
  const descendants = new Set<string>()
  const visit = (nodeId: string) => {
    for (const child of childrenByParentId.get(nodeId) ?? []) {
      const childId = readText(child.id)
      if (!childId || descendants.has(childId) || rootIds.has(childId)) continue
      descendants.add(childId)
      visit(childId)
    }
  }
  rootIds.forEach(visit)
  return descendants
}

function continuityAssetRequestNodeIds(request: { metadata: unknown }) {
  const metadata = asRecord(request.metadata)
  const assetState = asRecord(metadata.assetState ?? metadata.asset_state)
  const assetStateByNodeId = asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)
  return new Set([
    readText(metadata.targetNodeId),
    readText(assetState.sourceNodeId),
    ...readStringArray(metadata.targetNodeIds),
    ...readStringArray(asRecord(metadata.batch).targetNodeIds),
    ...Object.keys(assetStateByNodeId).map(readText),
  ].filter(Boolean))
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

function worldLocationVisualGuideForEntity(entity: Record<string, unknown> | null) {
  if (!entity) return ''
  const metadata = asRecord(entity.metadata)
  const visual = asRecord(metadata.visual ?? entity.visual)
  return [
    readText(entity.name),
    readText(visual.description),
    readText(entity.visualDescription),
    readText(entity.summary),
    readText(entity.context),
  ].filter(Boolean).join(' - ')
}

function commandLifecycle(input: {
  status: 'started' | 'already_running' | 'already_ready' | 'blocked' | 'failed'
  requests?: readonly { id?: string | null; workflowId?: string | null; latestRunId?: string | null }[]
  targetNodeIds?: readonly string[]
  diagnostics?: readonly string[]
  regenerationRequestId?: string
  providerStartExpected?: boolean
}) {
  const requests = input.requests ?? []
  return {
    status: input.status,
    requestIds: requests.map((request) => readText(request.id)).filter(Boolean),
    workflowIds: requests.map((request) => readText(request.workflowId)).filter(Boolean),
    runIds: requests.map((request) => readText(request.latestRunId)).filter(Boolean),
    targetNodeIds: [...new Set((input.targetNodeIds ?? []).map(readText).filter(Boolean))],
    diagnostics: [...new Set((input.diagnostics ?? []).map(readText).filter(Boolean))],
    regenerationRequestId: readText(input.regenerationRequestId),
    providerStartExpected: input.providerStartExpected === true,
  }
}

export async function runSequenceAnimaticContinuityAssetWorkflowCommand(input: {
  client: {
    from: (table: string) => any
  }
  admin: {
    from: (table: string) => any
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  userId: string
  payload: unknown
}) {
    const { client, admin, userId } = input
    const payload = sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema.parse(input.payload)
    const regenerationRequestId = payload.mode === 'regenerate' ? (readText(payload.regenerationRequestId) || crypto.randomUUID()) : ''
    const regenerationKeySuffix = regenerationRequestId ? `_refresh_${slugify(regenerationRequestId).slice(0, 8)}` : ''

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
    let requestedNodeIds = [...new Set([payload.nodeId, ...readStringArray(payload.nodeIds)].map(readText).filter(Boolean))].slice(0, 9)
    const targetNodes = requestedNodeIds.map((nodeId) => allGraphNodes.find((entry) => readText(entry.id) === nodeId) ?? null)
    if (targetNodes.some((node) => !node)) throw new HttpError(404, 'One or more continuity nodes were not found in the current scene graph.')
    let resolvedTargetNodes = (targetNodes as Record<string, unknown>[])
      .map((node) => applySceneGraphOverrideToNode(node, sceneGraphOverrideForNode(asRecord(masterRequest.metadata), readText(node.id))))
    let targetNode = resolvedTargetNodes[0] ?? null
    if (!targetNode) throw new HttpError(404, 'Continuity node was not found in the current scene graph.')
    const requestedBatchKind = readText(payload.batchKind)
    let batchKind = resolvedTargetNodes.length > 1 ? (requestedBatchKind || continuityBatchKindForNodes(resolvedTargetNodes)) : ''
    let batchParentId = resolvedTargetNodes.length > 1
      ? batchKind === 'parent_child_scaffold_grid'
        ? readText(targetNode.id)
        : continuityNodeParentId(targetNode)
      : ''
    if (resolvedTargetNodes.length > 1) {
      if (!batchKind) throw new HttpError(400, 'Only sibling spots or viewpoints can be generated as a continuity asset grid.')
      const inferredBatchKind = continuityBatchKindForNodes(resolvedTargetNodes)
      if ((batchKind === 'spot_atlas_grid' && inferredBatchKind !== 'spot_grid')
        || (batchKind === 'viewpoint_atlas_grid' && inferredBatchKind !== 'viewpoint_grid')
        || (batchKind === 'spot_camera_grid' && inferredBatchKind !== 'viewpoint_grid' && inferredBatchKind !== 'spot_camera_grid')) {
        throw new HttpError(400, 'Atlas and camera grids require sibling spots or viewpoints with the same parent.')
      }
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
    if (payload.mode === 'regenerate') {
      const descendantNodeIds = descendantContinuityNodeIds({
        graphNodes: allGraphNodes,
        rootNodeIds: requestedNodeIds,
      })
      if (descendantNodeIds.size > 0) {
        for (const child of assetChildren) {
          const metadata = asRecord(child.metadata)
          if (metadata.sequenceAnimaticStale === true) continue
          const childNodeIds = continuityAssetRequestNodeIds(child)
          if (![...childNodeIds].some((nodeId) => descendantNodeIds.has(nodeId))) continue
          await markChildWorkflowStale({
            client: admin,
            request: child,
            reason: `Upstream continuity node regenerated: ${requestedNodeIds.join(', ')}.`,
            readyToRun: true,
            metadata: {
              staleSourceNodeIds: requestedNodeIds,
              staleDownstreamNodeIds: [...descendantNodeIds],
            },
            refreshProjection: true,
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
    const worldLocationVisualGuide = worldLocationVisualGuideForEntity(targetWorldEntity)
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
        const lifecycle = commandLifecycle({
          status: 'blocked',
          requests: [],
          targetNodeIds: requestedNodeIds,
          diagnostics: [`Generate parent continuity asset first: ${parentNodeId}.`],
          regenerationRequestId,
          providerStartExpected: false,
        })
        return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
          ok: true,
          status: lifecycle.status,
          commandLifecycle: lifecycle,
          masterRequest,
          continuityRequest,
          assetRequest: null,
          runnableRequest: null,
          workflow: null,
          nodes: [],
          edges: [],
          assetState: null,
          reused: false,
        })
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
    const batchParentNode = batchParentId
      ? allGraphNodes.find((node) => readText(node.id) === batchParentId) ?? null
      : null
    const batchGrandparentId = batchParentNode ? continuityNodeParentId(batchParentNode) : ''
    const grandparentReferenceAssetKeys = batchGrandparentId
      ? [readText(asRecord(assetStates[batchGrandparentId]).assetKey)].filter(Boolean)
      : []
    if (
      resolvedTargetNodes.length > 1
      && (batchKind === 'spot_grid' || batchKind === 'viewpoint_grid' || batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid' || batchKind === 'spot_camera_grid')
      && parentReferenceAssetKeys.length === 0
    ) {
      const lifecycle = commandLifecycle({
        status: 'blocked',
        requests: [],
        targetNodeIds: requestedNodeIds,
        diagnostics: [`Generate parent continuity asset first: ${batchParentId || 'parent spatial node'}.`],
        regenerationRequestId,
        providerStartExpected: false,
      })
      return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        status: lifecycle.status,
        commandLifecycle: lifecycle,
        masterRequest,
        continuityRequest,
        assetRequest: null,
        runnableRequest: null,
        workflow: null,
        nodes: [],
        edges: [],
        assetState: null,
        reused: false,
      })
    }
    if (
      resolvedTargetNodes.length > 1
      && batchKind === 'spot_camera_grid'
      && readText(batchParentNode?.nodeKind) !== 'location_spot'
    ) {
      throw new HttpError(400, 'Spot camera grids require sibling camera/viewpoint nodes under the same spot.')
    }
    if (
      resolvedTargetNodes.length > 1
      && batchKind === 'spot_camera_grid'
      && batchGrandparentId
      && grandparentReferenceAssetKeys.length === 0
    ) {
      throw new HttpError(409, `Generate parent zone map first: ${batchGrandparentId}.`)
    }
    const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
    const targetIsSpatialAsset = ['location_set', 'location_zone', 'location_spot', 'location_angle', 'location_viewpoint', 'spot_camera_grid'].includes(assetKind)
    const batchIsSpatialAsset = resolvedTargetNodes.every((node) => ['location_set', 'location_zone', 'location_spot', 'location_angle', 'location_viewpoint', 'spot_camera_grid'].includes(readText(node.assetKind) || readText(node.nodeKind)))
    const batchIsAtlas = batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid'
    const batchIsSpotCameraGrid = batchKind === 'spot_camera_grid'
    const allReferenceAssetKeys = batchIsSpotCameraGrid
      ? [...new Set([...grandparentReferenceAssetKeys, ...parentReferenceAssetKeys])].slice(0, 2)
      : batchIsAtlas
      ? parentReferenceAssetKeys.slice(0, 1)
      : [...new Set([...referenceAssetKeys, ...parentReferenceAssetKeys, ...batchSiblingReferenceAssetKeys, ...worldReferenceAssetKeys])].slice(0, 8)
    const referenceEntities = allReferenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || payload.nodeId} spatial dependency`))
    const augmentedAssetPack = (targetIsSpatialAsset || batchIsSpatialAsset) ? {
      ...assetPack,
      entities: referenceEntities,
      selectedEntityKeys: referenceEntities.map((entity) => readText(entity.key)).filter(Boolean),
      missingReferenceEntityKeys: [],
      continuityReferenceAssetKeys: allReferenceAssetKeys,
      scopedReferenceAssetKeys: allReferenceAssetKeys,
      referenceScope: 'sequence_animatic_spatial_continuity_only',
      referenceDiagnostics: [
        'Spatial continuity generation only receives parent/set/zone/spot reference images. Character, prop, and shot-subject references are excluded.',
      ],
    } : {
      ...assetPack,
      entities: [
        ...assetPackEntities,
        ...referenceEntities,
      ],
      continuityReferenceAssetKeys: allReferenceAssetKeys,
    }
    if (resolvedTargetNodes.length > 1 && batchKind) {
      const batchTargetIds = resolvedTargetNodes.map((node) => readText(node.id)).filter(Boolean)
      const isParentChildScaffold = batchKind === 'parent_child_scaffold_grid'
      const isSpatialAtlas = batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid'
      const isSpotCameraGrid = batchKind === 'spot_camera_grid'
      const sourceReferenceNodeIds = isSpotCameraGrid
        ? [batchGrandparentId, batchParentId].filter(Boolean)
        : isSpatialAtlas
        ? [batchParentId].filter(Boolean)
        : isParentChildScaffold
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
      const generationPolicy = isSpotCameraGrid ? 'spot_camera_grid_v1' : isParentChildScaffold ? 'parent_child_scaffold_grid' : isSpatialAtlas ? 'spot_atlas_grid_v2' : 'manual_sibling_grid'
      const cameraCellRoles = ['north', 'east', 'south', 'west', 'high', 'low', 'insert', 'reverse', 'wide']
      const cellRoles = isSpotCameraGrid
        ? batchTargetIds.map((_, index) => cameraCellRoles[index] ?? 'camera')
        : isParentChildScaffold ? ['parent', ...batchTargetIds.slice(1).map(() => 'child')] : batchTargetIds.map(() => 'sibling')
      const layout = isSpotCameraGrid
        ? continuitySpotCameraGridLayoutForTargetCount(batchTargetIds.length)
        : isSpatialAtlas ? continuityAtlasLayoutForTargetCount(batchTargetIds.length) : continuityBatchLayoutForTargetCount(batchTargetIds.length)
      const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(relevantShots)
      const sanitizedPromptNodes = resolvedTargetNodes.map((node) => sanitizeSequenceAnimaticSpatialNodeFields(node, { forbiddenNames }))
      const batch = {
        batchId: `${isParentChildScaffold ? 'manual_scaffold' : 'manual'}_${batchKind}_${slugify(batchParentId)}_${sequenceAnimaticStableHash(batchTargetIds).slice(0, 8)}`,
        batchKind,
        targetNodeIds: batchTargetIds,
        sourceReferenceNodeIds,
        worldReferenceAssetKeys: isSpatialAtlas ? [] : worldReferenceAssetKeys,
        blockIds: [...new Set(resolvedTargetNodes.flatMap((node) => readStringArray(node.storyboardBlockIds ?? node.blockIds)))],
        layout,
        gridLayout: layout,
        cellRoles,
        required: true,
        generationPolicy,
        referencePolicy: isSpotCameraGrid ? 'zone_and_spot_to_camera_grid' : isSpatialAtlas ? 'zone_map_to_spot_atlas' : isParentChildScaffold ? 'parent_child_scaffold' : 'sibling_grid',
      }
      const batchInputHash = sequenceAnimaticStableHash({
        spatialPromptPolicyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
        batch,
        worldLocationVisualGuide,
        targetNodes: resolvedTargetNodes,
        sanitizedPromptNodes,
        relevantShotIds: relevantShots.map((shot) => readText(shot.id)),
        referenceAssetKeys: allReferenceAssetKeys,
        manifestHash,
      })
      const continuityBatchStableIdentity = `${readText(batch.batchId)}:${batchInputHash}`
      const continuityBatchIdentity = regenerationRequestId
        ? `${continuityBatchStableIdentity}:refresh:${regenerationRequestId}`
        : continuityBatchStableIdentity
      const existingBatch = assetChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'continuity_asset_batch'
          && (
            readText(metadata.continuityBatchIdentity) === continuityBatchStableIdentity
            || readText(metadata.continuityBatchStableIdentity) === continuityBatchStableIdentity
          )
      }) ?? null
      let existingBatchReusable = false
      let existingBatchActive = false
      if (existingBatch?.workflowId) {
        const requestStatus = readText(existingBatch.status)
        existingBatchActive = requestStatus === 'queued' || requestStatus === 'running' || requestStatus === 'planning'
        existingBatchReusable = requestStatus === 'completed' || existingBatchActive
        if (existingBatch.latestRunId) {
          const existingRunResponse = await admin
            .from('output_workflow_runs')
            .select('id, status')
            .eq('id', existingBatch.latestRunId)
            .maybeSingle()
          const existingRunStatus = readText(existingRunResponse.data?.status)
          if (existingRunStatus === 'failed' || existingRunStatus === 'cancelled') {
            existingBatchReusable = false
            existingBatchActive = false
          }
        }
      }
      if (existingBatch?.workflowId && ((!existingBatchReusable) || (payload.mode === 'regenerate' && !existingBatchActive))) {
        await markChildWorkflowStale({
          client: admin,
          request: existingBatch,
          reason: payload.mode === 'regenerate'
            ? 'Continuity atlas refresh requested.'
            : 'Previous continuity atlas workflow is not reusable.',
        })
      } else
      if (existingBatch?.workflowId && existingBatchReusable) {
        const lifecycle = commandLifecycle({
          status: existingBatchActive ? 'already_running' : 'already_ready',
          requests: [existingBatch],
          targetNodeIds: batchTargetIds,
          diagnostics: existingBatchActive ? ['Continuity asset workflow is already running.'] : ['Continuity asset workflow is already ready.'],
          regenerationRequestId,
          providerStartExpected: false,
        })
        return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
          ok: true,
          status: lifecycle.status,
          commandLifecycle: lifecycle,
          masterRequest,
          continuityRequest,
          assetRequest: existingBatch,
          runnableRequest: existingBatchActive ? existingBatch : null,
          workflow: null,
          nodes: [],
          edges: [],
          assetState: null,
          reused: true,
        })
      }

      const workflowId = crypto.randomUUID()
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'continuity_asset_batch',
        screenplayAnimaticSource: readText(asRecord(masterRequest.metadata).screenplayAnimaticSource) || 'wiki_sequence_unit',
        sequenceAnimaticRole: 'continuity_asset_batch',
        workflowCommandAction: 'generate_continuity_assets',
        workflowCommandMode: payload.mode,
        masterRequestId: masterRequest.id,
        continuityRequestId: continuityRequest?.id ?? null,
        continuityWorkflowId: continuityRequest?.workflowId ?? null,
        continuityBatchId: readText(batch.batchId),
        continuityBatchHash: batchInputHash,
        continuityBatchIdentity,
        continuityBatchStableIdentity,
        regenerationRequestId,
        targetNodeIds: batchTargetIds,
        commandTargetNodeIds: batchTargetIds,
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
        worldLocationVisualGuide,
        world_location_visual_guide: worldLocationVisualGuide,
        parentNodeIds: sourceReferenceNodeIds,
        spatialPromptPolicyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
        lastWorkflowCommand: {
          action: 'generate_continuity_assets',
          mode: payload.mode,
          targetNodeIds: batchTargetIds,
          batchKind,
          regenerationRequestId,
          providerStartExpected: true,
        },
      }
      const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: sequenceAnimaticContinuityBatchTemplateKey,
        rawInput: {
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
        },
      })
      const { nodes, edges } = graphResult.graph
      const targetNames = resolvedTargetNodes.map((node) => readText(node.name) || readText(node.id)).filter(Boolean)
      const workflowPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: `sequence_animatic_continuity_asset_batch_${slugify(assetParentRequest.id)}_${slugify(readText(batch.batchId))}_${batchInputHash.slice(0, 8)}${regenerationKeySuffix}`,
        name: `${targetNames.slice(0, 3).join(', ')} ${isSpotCameraGrid ? 'camera grid' : 'continuity grid'}`,
        description: isSpotCameraGrid
          ? 'Sequence animatic spot camera grid workflow.'
          : 'Sequence animatic sibling scene-graph continuity asset grid workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: userId,
        metadata: {
          ...commonConfig,
          batch,
          readyToRun: true,
          workflowTemplateKey: sequenceAnimaticContinuityBatchTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
        },
      }
      const requestPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        parent_request_id: assetParentRequest.id,
        requested_by: userId,
        source_surface: masterRequest.sourceSurface === 'outputs' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `Generate ${isSpotCameraGrid ? 'spot camera grid' : 'continuity asset grid'} for ${targetNames.join(', ')}.`,
        title: `${targetNames.slice(0, 3).join(', ')} ${isSpotCameraGrid ? 'camera grid' : 'continuity grid'}`,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'image',
        planner_notes: isSpotCameraGrid
          ? 'Spot camera references generated as one reusable angle grid and cropped per camera node.'
          : 'Sibling continuity assets generated as one grid and cropped per scene-graph node.',
        metadata: {
          ...commonConfig,
          batch,
          targetNodes: resolvedTargetNodes,
          referenceAssetKeys: allReferenceAssetKeys,
          readyToRun: true,
          workflowTemplateKey: sequenceAnimaticContinuityBatchTemplateKey,
          workflowTemplateSourceHash: graphResult.sourceHash,
          createdFromContinuityAt: new Date().toISOString(),
        },
      }
      const ensured = await ensureMappedChildWorkflow({
        client: admin,
        projectId: payload.projectId,
        draftId: payload.draftId,
        parentRequestId: assetParentRequest.id,
        role: 'continuity_asset_batch',
        identityKey: 'continuityBatchIdentity',
        identityValue: continuityBatchIdentity,
        workflow: workflowPayload,
        nodes,
        edges,
        request: requestPayload,
      })
      const lifecycle = commandLifecycle({
        status: 'started',
        requests: [ensured.request],
        targetNodeIds: batchTargetIds,
        diagnostics: ensured.reused ? ['Continuity asset batch workflow was reused and is ready to run.'] : ['Continuity asset batch workflow was created and is ready to run.'],
        regenerationRequestId,
        providerStartExpected: true,
      })
      return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        status: lifecycle.status,
        commandLifecycle: lifecycle,
        masterRequest,
        continuityRequest,
        assetRequest: ensured.request,
        runnableRequest: ensured.request,
        workflow: ensured.workflow,
        nodes: ensured.nodes,
        edges: ensured.edges,
        assetState: null,
        reused: ensured.reused,
      })
    }

    const targetIsSpatial = ['location_set', 'location_zone', 'location_spot', 'location_angle', 'location_viewpoint', 'spot_camera_grid'].includes(assetKind)
    const singleGenerationPolicy = assetKind === 'location_zone'
      ? 'zone_spatial_map_v2'
      : assetKind === 'spot_camera_grid'
        ? 'spot_camera_grid_v1'
      : assetKind === 'location_spot' || assetKind === 'location_angle' || assetKind === 'location_viewpoint'
        ? 'spot_local_reference_v1'
        : ''
    const singleForbiddenNames = targetIsSpatial ? sequenceAnimaticSpatialForbiddenNamesFromShots(relevantShots) : []
    const sanitizedPromptNode = targetIsSpatial
      ? sanitizeSequenceAnimaticSpatialNodeFields(targetNode, { forbiddenNames: singleForbiddenNames })
      : null
    const zoneMapPoiLines = assetKind === 'location_zone'
      ? zoneMapPoiLinesForNode({ zoneNode: targetNode, graphNodes: allGraphNodes, relevantShots })
      : []
    const inputHash = sequenceAnimaticStableHash({
      spatialPromptPolicyVersion: targetIsSpatial ? sequenceAnimaticSpatialPromptPolicyVersion : '',
      generationPolicy: singleGenerationPolicy,
      targetNode,
      sanitizedPromptNode,
      worldLocationVisualGuide,
      zoneMapPoiLines,
      relevantShotIds: relevantShots.map((shot) => readText(shot.id)),
      referenceAssetKeys: allReferenceAssetKeys,
      manifestHash,
    })
    const currentAssetState = continuityAssetStateSchema.safeParse(asRecord(assetStates[payload.nodeId]))
    if (payload.mode === 'generate' && currentAssetState.success && currentAssetState.data.status === 'ready' && currentAssetState.data.inputHash === inputHash) {
      const lifecycle = commandLifecycle({
        status: 'already_ready',
        requests: [],
        targetNodeIds: [payload.nodeId],
        diagnostics: ['Continuity asset is already ready for the current input hash.'],
        regenerationRequestId,
        providerStartExpected: false,
      })
      return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        status: lifecycle.status,
        commandLifecycle: lifecycle,
        masterRequest,
        continuityRequest,
        assetRequest: null,
        runnableRequest: null,
        workflow: null,
        nodes: [],
        edges: [],
        assetState: currentAssetState.data,
        reused: true,
      })
    }

    const assetStableIdentity = `${payload.nodeId}:${inputHash}`
    const assetIdentity = regenerationRequestId
      ? `${assetStableIdentity}:refresh:${regenerationRequestId}`
      : assetStableIdentity
    const existing = assetChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return metadata.sequenceAnimaticStale !== true
        && readScreenplayAnimaticRole(metadata) === 'continuity_asset'
        && (
          readText(metadata.assetIdentity) === assetStableIdentity
          || readText(metadata.assetStableIdentity) === assetStableIdentity
        )
    }) ?? null
    if (existing?.workflowId) {
      let existingActive = existing.status === 'queued' || existing.status === 'running' || existing.status === 'planning'
      let existingReusable = existing.status === 'completed' || existingActive
      if (existing.latestRunId) {
        const existingRunResponse = await admin
          .from('output_workflow_runs')
          .select('id, status')
          .eq('id', existing.latestRunId)
          .maybeSingle()
        const existingRunStatus = readText(existingRunResponse.data?.status)
        if (existingRunStatus === 'failed' || existingRunStatus === 'cancelled') {
          existingReusable = false
          existingActive = false
        }
      }
      if ((!existingReusable) || (payload.mode === 'regenerate' && !existingActive)) {
        await markChildWorkflowStale({
          client: admin,
          request: existing,
          reason: payload.mode === 'regenerate'
            ? 'Continuity asset refresh requested.'
            : 'Previous continuity asset workflow is not reusable.',
        })
      } else {
      const lifecycle = commandLifecycle({
        status: existingActive ? 'already_running' : 'already_ready',
        requests: [existing],
        targetNodeIds: [payload.nodeId],
        diagnostics: existingActive ? ['Continuity asset workflow is already running.'] : ['Continuity asset workflow is already ready.'],
        regenerationRequestId,
        providerStartExpected: false,
      })
      return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
        ok: true,
        status: lifecycle.status,
        commandLifecycle: lifecycle,
        masterRequest,
        continuityRequest,
        assetRequest: existing,
        runnableRequest: existingActive ? existing : null,
        workflow: null,
        nodes: [],
        edges: [],
        assetState: currentAssetState.success ? currentAssetState.data : null,
        reused: true,
      })
      }
    }

    const workflowId = crypto.randomUUID()
    const commonConfig = {
      cinematicPipelineVersion: 'v3_script_storyboards',
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'continuity_asset',
      screenplayAnimaticSource: readText(asRecord(masterRequest.metadata).screenplayAnimaticSource) || 'wiki_sequence_unit',
      sequenceAnimaticRole: 'continuity_asset',
      workflowCommandAction: 'generate_continuity_assets',
      workflowCommandMode: payload.mode,
      masterRequestId: masterRequest.id,
      continuityRequestId: continuityRequest?.id ?? null,
      continuityWorkflowId: continuityRequest?.workflowId ?? null,
      targetNodeId: payload.nodeId,
      commandTargetNodeIds: [payload.nodeId],
      assetKind,
      assetInputHash: inputHash,
      assetIdentity,
      assetStableIdentity,
      regenerationRequestId,
      manifestHash,
      continuityPackHash: readText(continuityPack.continuityPackHash),
      masterManifestArtifactKey,
      sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
      worldLocationRefId,
      worldLocationVisualGuide,
      world_location_visual_guide: worldLocationVisualGuide,
      parentNodeIds: dependencyEdges.filter((edge) => readText(edge.targetNodeId) === payload.nodeId).map((edge) => readText(edge.sourceNodeId)).filter(Boolean),
      spatialPromptPolicyVersion: targetIsSpatial ? sequenceAnimaticSpatialPromptPolicyVersion : '',
      generationPolicy: singleGenerationPolicy,
      zoneMapPoiLines,
      lastWorkflowCommand: {
        action: 'generate_continuity_assets',
        mode: payload.mode,
        targetNodeIds: [payload.nodeId],
        batchKind: '',
        regenerationRequestId,
        providerStartExpected: true,
      },
    }
    const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
      registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
      templateKey: sequenceAnimaticContinuityAssetTemplateKey,
      rawInput: {
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
      },
    })
    const { nodes, edges } = graphResult.graph
    const workflowPayload = {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      key: `sequence_animatic_continuity_asset_${slugify(assetParentRequest.id)}_${slugify(payload.nodeId)}_${inputHash.slice(0, 8)}${regenerationKeySuffix}`,
      name: `${readText(targetNode.name) || payload.nodeId} continuity asset`,
      description: 'Sequence animatic node-scoped continuity asset workflow.',
      preset: 'cinematic_episode_from_sequence',
      status: 'active',
      created_by: userId,
      metadata: {
        ...commonConfig,
        readyToRun: true,
        workflowTemplateKey: sequenceAnimaticContinuityAssetTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
      },
    }
    const requestPayload = {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      parent_request_id: assetParentRequest.id,
      requested_by: userId,
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
        workflowTemplateKey: sequenceAnimaticContinuityAssetTemplateKey,
        workflowTemplateSourceHash: graphResult.sourceHash,
        createdFromContinuityAt: new Date().toISOString(),
      },
    }
    const ensured = await ensureMappedChildWorkflow({
      client: admin,
      projectId: payload.projectId,
      draftId: payload.draftId,
      parentRequestId: assetParentRequest.id,
      role: 'continuity_asset',
      identityKey: 'assetIdentity',
      identityValue: assetIdentity,
      workflow: workflowPayload,
      nodes,
      edges,
      request: requestPayload,
    })
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
    const lifecycle = commandLifecycle({
      status: 'started',
      requests: [ensured.request],
      targetNodeIds: [payload.nodeId],
      diagnostics: ensured.reused ? ['Continuity asset workflow was reused and is ready to run.'] : ['Continuity asset workflow was created and is ready to run.'],
      regenerationRequestId,
      providerStartExpected: true,
    })
    return sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema.parse({
      ok: true,
      status: lifecycle.status,
      commandLifecycle: lifecycle,
      masterRequest,
      continuityRequest,
      assetRequest: ensured.request,
      runnableRequest: ensured.request,
      workflow: ensured.workflow,
      nodes: ensured.nodes,
      edges: ensured.edges,
      assetState,
      reused: ensured.reused,
    })
}
