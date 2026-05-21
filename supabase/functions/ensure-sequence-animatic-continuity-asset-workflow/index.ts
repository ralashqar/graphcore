import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'
import {
  continuityAssetStateSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityAssetWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'

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

function continuityNodeCollections(graph: Record<string, unknown>) {
  return [
    ...readArray(graph.locationSets ?? graph.location_sets).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_set', assetKind: 'location_set' })),
    ...readArray(graph.zones).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...readArray(graph.spots).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_spot', assetKind: 'location_spot' })),
    ...readArray(graph.angles).map((entry) => ({ ...asRecord(entry), nodeKind: 'location_angle', assetKind: 'location_angle' })),
    ...readArray(graph.assetAnchors ?? graph.asset_anchors).map((entry) => {
      const record = asRecord(entry)
      const type = readText(record.type) || readText(record.anchorType)
      return {
        ...record,
        nodeKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : 'location_anchor',
        assetKind: type === 'character' ? 'temporary_character' : type === 'prop' ? 'prop' : 'location_spot',
      }
    }),
  ].filter((entry) => readText(entry.id))
}

function continuityVisualDependencyEdges(graph: Record<string, unknown>) {
  const edges: Record<string, unknown>[] = []
  const push = (sourceNodeId: string, targetNodeId: string, relationship: string, required = false, evidence = '') => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return
    edges.push({ sourceNodeId, targetNodeId, relationship, required, evidence })
  }
  readArray(graph.locationSets).map(asRecord).forEach((set) => push(readText(set.worldLocationRefId), readText(set.id), 'world_location_to_set', true))
  readArray(graph.zones).map(asRecord).forEach((zone) => push(readText(zone.setId), readText(zone.id), 'set_to_zone', true))
  readArray(graph.spots).map(asRecord).forEach((spot) => push(readText(spot.zoneId), readText(spot.id), 'zone_to_spot', true))
  readArray(graph.angles).map(asRecord).forEach((angle) => {
    push(readText(angle.setId), readText(angle.id), 'set_to_angle', true)
    push(readText(angle.zoneId), readText(angle.id), 'zone_to_angle', true)
    readStringArray(angle.spotIds).forEach((spotId) => push(spotId, readText(angle.id), 'spot_to_angle', false))
  })
  readArray(graph.edges).map(asRecord).forEach((edge) => {
    const relationship = readText(edge.relationship)
    if (['adjacent_to', 'visible_from', 'entrance_to', 'connected_to', 'same_space_angle'].includes(relationship)) {
      push(readText(edge.sourceId), readText(edge.targetId), relationship, false, readText(edge.evidence))
    }
  })
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.sourceNodeId}:${edge.relationship}:${edge.targetNodeId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

    const continuityResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.continuityRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .single()
    if (continuityResponse.error || !continuityResponse.data) throw new HttpError(404, 'Continuity request not found. Prepare continuity first.')
    const continuityRequest = mapOutputRequestRow(continuityResponse.data)
    const continuityMetadata = asRecord(continuityRequest.metadata)
    if (readScreenplayAnimaticRole(continuityMetadata) !== 'continuity_pack') throw new HttpError(409, 'This request is not a continuity pack.')
    if (!continuityRequest.workflowId) throw new HttpError(409, 'Continuity workflow is not ready yet.')

    const [masterArtifactsResponse, continuityArtifactsResponse] = await Promise.all([
      client.from('output_artifacts').select(outputArtifactSelect).eq('project_id', payload.projectId).eq('draft_id', payload.draftId).eq('workflow_id', masterRequest.workflowId).order('created_at', { ascending: false }),
      client.from('output_artifacts').select(outputArtifactSelect).eq('project_id', payload.projectId).eq('draft_id', payload.draftId).eq('workflow_id', continuityRequest.workflowId).order('created_at', { ascending: false }),
    ])
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)

    const manifestArtifact = (masterArtifactsResponse.data ?? []).find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
    const manifest = asRecord(asRecord(asRecord(manifestArtifact).metadata).manifest)
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic master first; no manifest is available yet.')
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const masterManifestArtifactKey = readText(asRecord(manifestArtifact).key)

    const continuityArtifact = (continuityArtifactsResponse.data ?? []).find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_continuity_pack') ?? null
    const continuityPack = asRecord(asRecord(asRecord(continuityArtifact).metadata).continuityPack)
    const graph = asRecord(continuityPack.continuityGraphV2 ?? continuityPack.continuity_graph_v2)
    if (Object.keys(graph).length === 0) throw new HttpError(409, 'Derive continuity structure before generating continuity assets.')
    const targetNode = continuityNodeCollections(graph).find((entry) => readText(entry.id) === payload.nodeId) ?? null
    if (!targetNode) throw new HttpError(404, 'Continuity node was not found in the current scene graph.')

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
    const targetShotIds = new Set(readStringArray(targetNode.shotIds))
    const bindings = asRecord(continuityPack.shotBindings ?? continuityPack.shot_bindings ?? graph.shotBindings)
    Object.entries(bindings).forEach(([shotId, bindingValue]) => {
      const binding = asRecord(bindingValue)
      if (readText(binding.setId) === payload.nodeId || readText(binding.zoneId) === payload.nodeId || readText(binding.angleId) === payload.nodeId || readStringArray(binding.spotIds).includes(payload.nodeId)) {
        targetShotIds.add(shotId)
      }
    })
    const relevantShots = uniqueShots.filter((shot) => targetShotIds.has(readText(shot.id))).slice(0, 12)
    const visualDependencyEdges = readArray(continuityPack.visualDependencyEdges ?? continuityPack.visual_dependency_edges).map(asRecord)
    const dependencyEdges = visualDependencyEdges.length > 0 ? visualDependencyEdges : continuityVisualDependencyEdges(graph)
    const assetStates = asRecord(continuityPack.assetStateByNodeId ?? continuityPack.asset_state_by_node_id)
    const referenceAssetKeys = dependencyEdges
      .filter((edge) => readText(edge.targetNodeId) === payload.nodeId)
      .map((edge) => readText(asRecord(assetStates[readText(edge.sourceNodeId)]).assetKey))
      .filter(Boolean)
      .slice(0, 6)
    const worldLocationRefId = readText(targetNode.worldLocationRefId) || readText(targetNode.baseLocationRefId)
    const assetPack = asRecord(manifest.assetPack)
    const assetPackEntities = readArray(assetPack.entities).map(asRecord)
    const targetWorldEntity = worldLocationRefId ? assetPackEntities.find((entity) => readText(entity.key) === worldLocationRefId) ?? null : null
    const worldReferenceAssetKeys = targetWorldEntity ? [
      readText(targetWorldEntity.primaryAssetKey),
      readText(targetWorldEntity.selectedReferenceAssetKey),
      ...readStringArray(targetWorldEntity.assetKeys),
    ].filter(Boolean).slice(0, 2) : []
    const allReferenceAssetKeys = [...new Set([...worldReferenceAssetKeys, ...referenceAssetKeys])].slice(0, 8)
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
    const inputHash = sequenceAnimaticStableHash({
      targetNode,
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

    const childResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', continuityRequest.id)
      .order('created_at', { ascending: false })
    if (childResponse.error) throw new Error(childResponse.error.message)
    const assetIdentity = `${payload.nodeId}:${inputHash}`
    const existing = (childResponse.data ?? []).map(mapOutputRequestRow).find((child) => {
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
      continuityRequestId: continuityRequest.id,
      continuityWorkflowId: continuityRequest.workflowId,
      targetNodeId: payload.nodeId,
      assetKind,
      assetInputHash: inputHash,
      assetIdentity,
      manifestHash,
      continuityPackHash: readText(continuityPack.continuityPackHash),
      masterManifestArtifactKey,
      sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
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
      key: `sequence_animatic_continuity_asset_${slugify(continuityRequest.id)}_${slugify(payload.nodeId)}_${inputHash.slice(0, 8)}`,
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
      parent_request_id: continuityRequest.id,
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
      p_parent_request_id: continuityRequest.id,
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
