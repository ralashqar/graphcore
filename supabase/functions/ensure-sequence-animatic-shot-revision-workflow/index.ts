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
  sequenceAnimaticShotRevisionWorkflowEnsureRequestSchema,
  sequenceAnimaticShotRevisionWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildSequenceAnimaticShotRevisionWorkflowGraph,
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

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function continuityAnchorAssetPackEntity(anchor: Record<string, unknown>) {
  const id = readText(anchor.id)
  const assetKey = readText(anchor.assetKey)
  if (!id || !assetKey) return null
  const anchorType = readText(anchor.anchorType) || readText(anchor.type)
  const name = readText(anchor.name) || id
  const isCharacter = anchorType === 'character'
  const isLocation = anchorType === 'location_spot'
  return {
    key: id,
    name,
    type: isCharacter ? 'character' : isLocation ? 'location_spot' : 'prop',
    role: isCharacter ? 'character_reference' : isLocation ? 'location_reference' : 'prop_reference',
    summary: readText(anchor.summary),
    visualDescription: readText(anchor.visualBrief) || readText(anchor.summary),
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_anchor',
    selectedReferenceVariantLabel: name,
    selectedReferenceVariantSummary: readText(anchor.summary),
    selectedReferenceVariantType: anchorType,
    continuityAnchor: true,
    continuityAnchorType: anchorType,
    shotIds: readStringArray(anchor.shotIds),
    storyboardBlockIds: readStringArray(anchor.storyboardBlockIds),
    referenceSelectionReason: 'Sequence animatic continuity anchor generated from the parsed screenplay.',
  }
}

function assetPackWithContinuityAnchors(assetPack: Record<string, unknown>, continuitySource: Record<string, unknown>, anchorIds: string[]) {
  const idSet = new Set(anchorIds.filter(Boolean))
  if (idSet.size === 0) return assetPack
  const anchors = [
    ...readArray(continuitySource.characterAnchors).map(asRecord),
    ...readArray(continuitySource.propAnchors).map(asRecord),
    ...readArray(continuitySource.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const anchorEntities = anchors
    .filter((anchor) => idSet.has(readText(anchor.id)))
    .map(continuityAnchorAssetPackEntity)
    .filter((entry): entry is NonNullable<ReturnType<typeof continuityAnchorAssetPackEntity>> => Boolean(entry))
  if (anchorEntities.length === 0) return assetPack
  const existingEntities = readArray(assetPack.entities).map(asRecord)
  const existingKeys = new Set(existingEntities.map((entity) => readText(entity.key)).filter(Boolean))
  return {
    ...assetPack,
    entities: [
      ...existingEntities,
      ...anchorEntities.filter((entity) => !existingKeys.has(readText(entity.key))),
    ],
    continuityAnchors: anchorEntities,
  }
}

function continuityAnchorIdsForShot(continuitySource: Record<string, unknown>, shotId: string) {
  const shotContinuityMap = asRecord(continuitySource.shotContinuityMap ?? continuitySource.shot_continuity_map ?? continuitySource.continuityAnchorIdsByShotId)
  const mappedIds = readStringArray(shotContinuityMap[shotId])
  const anchors = [
    ...readArray(continuitySource.characterAnchors).map(asRecord),
    ...readArray(continuitySource.propAnchors).map(asRecord),
    ...readArray(continuitySource.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const validAnchorIds = new Set(anchors.map((anchor) => readText(anchor.id)).filter(Boolean))
  const scopedIds = anchors
    .filter((anchor) => readStringArray(anchor.shotIds).includes(shotId))
    .map((anchor) => readText(anchor.id))
    .filter(Boolean)
  return [...new Set([...mappedIds, ...scopedIds])].filter((id) => validAnchorIds.has(id))
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-shot-revision-workflow')
    const admin = createAdminClient('ensure-sequence-animatic-shot-revision-workflow')
    const payload = sequenceAnimaticShotRevisionWorkflowEnsureRequestSchema.parse(await request.json())

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
      masterRequest.sourceSurface === 'wiki_sequence_unit' ? 'wiki_sequence_unit' : 'prompt_cinematic',
    )

    const artifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', masterRequest.workflowId)
      .order('created_at', { ascending: false })
    if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
    const manifestArtifactRow = (artifactsResponse.data ?? [])
      .find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
    const manifestArtifactMetadata = asRecord(asRecord(manifestArtifactRow).metadata)
    const manifest = asRecord(manifestArtifactMetadata.manifest)
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic master first; no manifest is available yet.')
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const masterManifestArtifactKey = readText(asRecord(manifestArtifactRow).key)
    const blocks = readArray(manifest.blocks).map(asRecord)
    const block = blocks.find((entry) => readText(entry.id) === payload.storyboardBlockId) ?? null
    if (!block) throw new HttpError(404, 'Storyboard block was not found in the sequence animatic manifest.')
    const shots = readArray(block.shots).map(asRecord)
    const shot = shots.find((entry) => readText(entry.id) === payload.shotId) ?? null
    if (!shot) throw new HttpError(404, 'Shot was not found in the storyboard block.')

    const blockRequestResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (blockRequestResponse.error) throw new Error(blockRequestResponse.error.message)
    const blockRequest = (blockRequestResponse.data ?? [])
      .map(mapOutputRequestRow)
      .find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'storyboard_block'
          && readText(metadata.storyboardBlockId) === payload.storyboardBlockId
          && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
      }) ?? null
    if (!blockRequest?.workflowId) throw new HttpError(409, 'Generate the storyboard block before revising a shot.')

    const panelArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', blockRequest.workflowId)
      .order('created_at', { ascending: false })
    if (panelArtifactsResponse.error) throw new Error(panelArtifactsResponse.error.message)
    const panelArtifact = (panelArtifactsResponse.data ?? []).find((row) => {
      const record = asRecord(row)
      const metadata = asRecord(record.metadata)
      const role = readText(metadata.role)
      return readText(record.asset_key)
        && readText(metadata.shotId) === payload.shotId
        && (role === 'sequence_animatic_block_panel' || role === 'cinematic_v3_storyboard_panel' || role === 'cinematic_v2_storyboard_panel')
    }) ?? null
    if (!panelArtifact) throw new HttpError(409, 'Generate/extract the storyboard panel before revising this shot.')

    const blockHash = sequenceAnimaticStableHash(block)
    const promptHash = sequenceAnimaticStableHash(payload.prompt)
    const revisionId = `shot_revision_${slugify(payload.shotId)}_${promptHash.slice(0, 8)}`
    const panelRecord = asRecord(panelArtifact)
    const panelMetadata = asRecord(panelRecord.metadata)
    const basePanelAssetKey = readText(panelRecord.asset_key)
    const panel = {
      id: readText(panelMetadata.panelId) || `${payload.shotId}_panel`,
      role: 'sequence_animatic_shot_revision_base_keyframe',
      name: `${readText(shot.title) || payload.shotId} base keyframe`,
      assetKey: basePanelAssetKey,
      artifactKey: readText(panelRecord.key),
      mimeType: readText(panelRecord.mime_type),
      sourceSheetAssetKey: readText(panelMetadata.sourceSheetAssetKey),
      cropRect: panelMetadata.cropRect ?? panelMetadata.crop ?? null,
      storyboardBlockId: payload.storyboardBlockId,
      shotId: payload.shotId,
      metadata: panelMetadata,
    }

    const childResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', blockRequest.id)
      .order('created_at', { ascending: false })
    if (childResponse.error) throw new Error(childResponse.error.message)
    const existing = (childResponse.data ?? []).map(mapOutputRequestRow).find((child) => {
      const metadata = asRecord(child.metadata)
      return metadata.sequenceAnimaticStale !== true
        && readScreenplayAnimaticRole(metadata) === 'shot_revision'
        && readText(metadata.shotId) === payload.shotId
        && readText(metadata.revisionPromptHash) === promptHash
        && readText(metadata.manifestHash) === manifestHash
        && readText(metadata.blockHash) === blockHash
    }) ?? null
    if (existing?.workflowId) {
      return json(sequenceAnimaticShotRevisionWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        revisionRequest: existing,
        workflow: null,
        nodes: [],
        edges: [],
      }))
    }

    let continuitySource = manifest
    let continuityPackHash = ''
    const continuityRequest = (blockRequestResponse.data ?? [])
      .map(mapOutputRequestRow)
      .find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'continuity_pack'
          && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
      }) ?? null
    if (continuityRequest?.workflowId) {
      const continuityArtifactsResponse = await client
        .from('output_artifacts')
        .select(outputArtifactSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('workflow_id', continuityRequest.workflowId)
        .order('created_at', { ascending: false })
      if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)
      const continuityArtifact = (continuityArtifactsResponse.data ?? []).find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_continuity_pack') ?? null
      const continuityPack = asRecord(asRecord(asRecord(continuityArtifact).metadata).continuityPack)
      if (Object.keys(continuityPack).length > 0) {
        continuitySource = continuityPack
        continuityPackHash = readText(asRecord(asRecord(continuityArtifact).metadata).continuityPackHash) || sequenceAnimaticStableHash(continuityPack)
      }
    }

    const shotContinuityAnchorIds = [
      ...readStringArray(shot.continuityAnchorIds),
      ...readStringArray(shot.continuityAnchorRefIds),
      ...continuityAnchorIdsForShot(continuitySource, payload.shotId),
    ].filter((value, index, values) => value && values.indexOf(value) === index)
    const assetPack = assetPackWithContinuityAnchors(asRecord(manifest.assetPack), continuitySource, shotContinuityAnchorIds)
    const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
    const shotHash = sequenceAnimaticStableHash({ shot, basePanelAssetKey, revisionPromptHash: promptHash })
    const workflowId = crypto.randomUUID()
    const commonConfig = {
      cinematicPipelineVersion: 'v3_script_storyboards',
      graphSpecVersion: sequenceAnimaticGraphSpecVersion,
      screenplayAnimaticRole: 'shot_revision',
      screenplayAnimaticSource,
      sequenceAnimaticRole: 'shot_revision',
      masterRequestId: masterRequest.id,
      parentRequestId: blockRequest.id,
      storyboardBlockId: payload.storyboardBlockId,
      shotId: payload.shotId,
      revisionId,
      revisionPromptHash: promptHash,
      manifestHash,
      blockHash,
      shotHash,
      continuityPackHash: continuityPackHash || null,
      masterManifestArtifactKey,
      basePanelAssetKey,
      sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
      sourceMasterWorkflowId: masterRequest.workflowId,
      sourceBlockWorkflowId: blockRequest.workflowId,
    }
    const { nodes, edges } = buildSequenceAnimaticShotRevisionWorkflowGraph({
      workflowId,
      draftId: payload.draftId,
      commonConfig,
      block,
      shot,
      panel,
      assetPack,
      revisionPrompt: payload.prompt,
      revisionId,
      aspectRatio,
    })
    const workflowPayload = {
      project_id: payload.projectId,
      draft_id: payload.draftId,
      key: `sequence_animatic_revision_${slugify(blockRequest.id)}_${slugify(payload.shotId)}_${promptHash.slice(0, 8)}`,
      name: `${blockRequest.title} / Revise ${readText(shot.title) || payload.shotId}`,
      description: 'Sequence animatic single-shot revision workflow.',
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
      parent_request_id: blockRequest.id,
      requested_by: user.id,
      source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
      prompt: payload.prompt,
      title: `${blockRequest.title} / ${readText(shot.title) || payload.shotId} revision`,
      intent: 'output_generation',
      output_kind: 'cinematic_episode',
      status: 'awaiting_confirmation',
      selected_entity_keys: masterRequest.selectedEntityKeys,
      selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
      page_count: null,
      target_format: 'image',
      planner_notes: 'Single-shot sequence animatic revision prepared from a storyboard panel and shot-scoped references.',
      metadata: {
        ...commonConfig,
        shotIndex: Number(shot.index ?? 0) || shots.indexOf(shot) + 1,
        readyToRun: true,
        createdFromManifestAt: new Date().toISOString(),
        revisionPrompt: payload.prompt,
        shot,
      },
    }
    const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
      p_project_id: payload.projectId,
      p_draft_id: payload.draftId,
      p_parent_request_id: blockRequest.id,
      p_role: 'shot_revision',
      p_identity_key: 'revisionId',
      p_identity_value: revisionId,
      p_workflow: workflowPayload,
      p_nodes: nodes,
      p_edges: edges,
      p_request: requestPayload,
    })
    if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure shot revision workflow.')
    const ensured = asRecord(ensureResponse.data)
    const revisionRequest = mapOutputRequestRow(asRecord(ensured.request) as never)
    const workflow = Object.keys(asRecord(ensured.workflow)).length > 0 ? mapOutputWorkflowRow(asRecord(ensured.workflow) as never) : null
    console.info('[GraphCore] sequence animatic shot revision ensure rpc completed.', {
      masterRequestId: masterRequest.id,
      blockRequestId: blockRequest.id,
      revisionRequestId: revisionRequest.id,
      shotId: payload.shotId,
      revisionId,
      created: ensured.created === true,
      reused: ensured.reused === true,
    })
    return json(sequenceAnimaticShotRevisionWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      revisionRequest,
      workflow,
      nodes: readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never)),
      edges: readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never)),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic shot revision workflow.')
  }
})
