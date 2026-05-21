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
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  sequenceAnimaticBlockWorkflowEnsureRequestSchema,
  sequenceAnimaticBlockWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildSequenceAnimaticBlockWorkflowGraph,
  buildSequenceAnimaticShotVideoWorkflowGraph,
  providerSafeSequenceAnimaticVideoDurationSeconds,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStoryboardImageSize,
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
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
    baseLocationRefId: readText(anchor.baseLocationRefId) || null,
    shotIds: readStringArray(anchor.shotIds),
    storyboardBlockIds: readStringArray(anchor.storyboardBlockIds),
    referenceSelectionReason: 'Sequence animatic continuity anchor generated from the parsed screenplay.',
  }
}

function assetPackWithContinuityAnchors(assetPack: Record<string, unknown>, manifest: Record<string, unknown>, anchorIds: string[]) {
  const idSet = new Set(anchorIds.filter(Boolean))
  if (idSet.size === 0) return assetPack
  const anchors = [
    ...readArray(manifest.characterAnchors).map(asRecord),
    ...readArray(manifest.propAnchors).map(asRecord),
    ...readArray(manifest.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const anchorEntities = anchors
    .filter((anchor) => idSet.has(readText(anchor.id)))
    .map(continuityAnchorAssetPackEntity)
    .filter((entity): entity is NonNullable<ReturnType<typeof continuityAnchorAssetPackEntity>> => Boolean(entity))
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

function continuityAnchorIdsForScope(manifest: Record<string, unknown>, scopeKey: 'storyboardBlockIds' | 'shotIds', scopeId: string) {
  if (!scopeId) return []
  const shotContinuityMap = asRecord(manifest.shotContinuityMap ?? manifest.shot_continuity_map ?? manifest.continuityAnchorIdsByShotId)
  const shotBindings = asRecord(manifest.shotBindings ?? manifest.shot_bindings ?? asRecord(manifest.continuityGraphV2 ?? manifest.continuity_graph_v2).shotBindings)
  const mappedShotIds = scopeKey === 'shotIds'
    ? [
      ...readStringArray(shotContinuityMap[scopeId]),
      ...readStringArray(asRecord(shotBindings[scopeId]).continuityAnchorIds),
      ...readStringArray(asRecord(shotBindings[scopeId]).characterAnchorIds),
      ...readStringArray(asRecord(shotBindings[scopeId]).propAnchorIds),
    ].filter(Boolean)
    : []
  const blockMappedIds = scopeKey === 'storyboardBlockIds'
    ? Object.values(shotBindings)
      .map(asRecord)
      .filter((binding) => readText(binding.storyboardBlockId) === scopeId)
      .flatMap((binding) => [
        ...readStringArray(binding.continuityAnchorIds),
        ...readStringArray(binding.characterAnchorIds),
        ...readStringArray(binding.propAnchorIds),
      ])
      .filter(Boolean)
    : []
  const anchors = [
    ...readArray(manifest.characterAnchors).map(asRecord),
    ...readArray(manifest.propAnchors).map(asRecord),
    ...readArray(manifest.anchorAssets).map(asRecord),
  ].filter((anchor) => {
    const type = readText(anchor.type) || readText(anchor.anchorType)
    return type === 'character' || type === 'prop'
  })
  const validAnchorIds = new Set(anchors.map((anchor) => readText(anchor.id)).filter(Boolean))
  const anchorScopedIds = anchors
    .filter((anchor) => readStringArray(anchor[scopeKey]).includes(scopeId))
    .map((anchor) => readText(anchor.id))
    .filter(Boolean)
  return [...new Set([...mappedShotIds, ...blockMappedIds, ...anchorScopedIds])].filter((id) => validAnchorIds.has(id))
}

function mergeAnchorIds(...groups: string[][]) {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const id of group) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      merged.push(id)
    }
  }
  return merged
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-block-workflows')
    const admin = createAdminClient('ensure-sequence-animatic-block-workflows')
    const payload = sequenceAnimaticBlockWorkflowEnsureRequestSchema.parse(await request.json())

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
    if (readScreenplayAnimaticRole(masterMetadata) !== 'master') {
      throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    }
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
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const masterManifestArtifactKey = readText(asRecord(manifestArtifactRow).key)
    const blocks = readArray(manifest.blocks).map(asRecord).filter((block) => readText(block.id))
    if (blocks.length === 0) throw new HttpError(409, 'Generate the screenplay animatic master first; no parsed storyboard blocks are available yet.')

    const existingChildrenResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (existingChildrenResponse.error) throw new Error(existingChildrenResponse.error.message)
    const existingChildren = (existingChildrenResponse.data ?? []).map(mapOutputRequestRow)
    const currentBlockHashById = new Map(blocks.map((block) => [readText(block.id), sequenceAnimaticStableHash(block)] as const).filter(([id]) => id))
    const staleChildren: typeof existingChildren = []
    const activeExistingChildren = existingChildren.filter((child) => {
      const metadata = asRecord(child.metadata)
      if (metadata.sequenceAnimaticStale === true) return false
      const role = readScreenplayAnimaticRole(metadata)
      if (role === 'storyboard_block') {
        const blockId = readText(metadata.storyboardBlockId)
        const currentBlockHash = currentBlockHashById.get(blockId)
        const stale = readText(metadata.manifestHash) && readText(metadata.manifestHash) !== manifestHash
          || currentBlockHash && readText(metadata.blockHash) && readText(metadata.blockHash) !== currentBlockHash
        if (stale) {
          staleChildren.push(child)
          return false
        }
      }
      return true
    })
    for (const staleChild of staleChildren) {
      const metadata = asRecord(staleChild.metadata)
      await client
        .from('output_requests')
        .update({
          status: 'awaiting_confirmation',
          metadata: {
            ...metadata,
            readyToRun: false,
            sequenceAnimaticStale: true,
            staleReason: 'master_manifest_changed',
            staleManifestHash: readText(metadata.manifestHash) || null,
            replacedByManifestHash: manifestHash,
            staleAt: new Date().toISOString(),
          },
        })
        .eq('id', staleChild.id)
    }
    const existingByBlockId = new Map(activeExistingChildren.map((child) => [readText(asRecord(child.metadata).storyboardBlockId), child] as const).filter(([id]) => id))
    const continuityChild = activeExistingChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return readScreenplayAnimaticRole(metadata) === 'continuity_pack'
        && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
    }) ?? null
    let continuityAnchorSource = manifest
    let continuityPackHash = ''
    if (continuityChild?.workflowId) {
      const continuityArtifactsResponse = await client
        .from('output_artifacts')
        .select(outputArtifactSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('workflow_id', continuityChild.workflowId)
        .order('created_at', { ascending: false })
      if (continuityArtifactsResponse.error) throw new Error(continuityArtifactsResponse.error.message)
      const continuityArtifact = (continuityArtifactsResponse.data ?? []).find((row) => {
        const metadata = asRecord(asRecord(row).metadata)
        return readText(metadata.role) === 'sequence_animatic_continuity_pack'
      }) ?? null
      const continuityMetadata = asRecord(asRecord(continuityArtifact).metadata)
      const continuityPack = asRecord(continuityMetadata.continuityPack)
      if (Object.keys(continuityPack).length > 0) {
        continuityAnchorSource = continuityPack
        continuityPackHash = readText(continuityMetadata.continuityPackHash) || sequenceAnimaticStableHash(continuityPack)
      }
    }

    if (payload.sequenceAnimaticMode === 'shot_video') {
      const blockRequestId = readText(payload.blockRequestId)
      const shotId = readText(payload.shotId)
      if (!blockRequestId) throw new HttpError(400, 'blockRequestId is required when preparing a shot video workflow.')
      if (!shotId) throw new HttpError(400, 'shotId is required when preparing a shot video workflow.')

      const blockRequest = activeExistingChildren.find((child) => child.id === blockRequestId) ?? null
      if (!blockRequest) throw new HttpError(404, 'Storyboard block request was not found under this sequence animatic master.')
      const blockMetadata = asRecord(blockRequest.metadata)
      if (readScreenplayAnimaticRole(blockMetadata) !== 'storyboard_block') {
        throw new HttpError(409, 'The selected parent request is not a storyboard block workflow.')
      }
      if (!blockRequest.workflowId) throw new HttpError(409, 'Storyboard block request has no workflow yet.')

      const storyboardBlockId = readText(blockMetadata.storyboardBlockId) || readText(payload.storyboardBlockId)
      const block = blocks.find((entry) => readText(entry.id) === storyboardBlockId) ?? null
      if (!block) throw new HttpError(404, 'Storyboard block was not found in the sequence animatic manifest.')
      const shots = readArray(block.shots).map(asRecord)
      const shot = shots.find((entry) => readText(entry.id) === shotId) ?? null
      if (!shot) throw new HttpError(404, 'Shot was not found in the storyboard block.')
      const currentBlockHash = sequenceAnimaticStableHash(block)

      const shotChildrenResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', blockRequest.id)
        .order('created_at', { ascending: true })
      if (shotChildrenResponse.error) throw new Error(shotChildrenResponse.error.message)
      const shotChildren = (shotChildrenResponse.data ?? []).map(mapOutputRequestRow)
      const revisionWorkflowIds = shotChildren
        .filter((child) => {
          const metadata = asRecord(child.metadata)
          return metadata.sequenceAnimaticStale !== true
            && readScreenplayAnimaticRole(metadata) === 'shot_revision'
            && readText(metadata.shotId) === shotId
            && child.workflowId
        })
        .map((child) => child.workflowId as string)
      let latestShotRevision: Record<string, unknown> | null = null
      if (revisionWorkflowIds.length > 0) {
        const revisionArtifactsResponse = await client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .in('workflow_id', revisionWorkflowIds)
          .order('created_at', { ascending: false })
        if (revisionArtifactsResponse.error) throw new Error(revisionArtifactsResponse.error.message)
        latestShotRevision = (revisionArtifactsResponse.data ?? [])
          .map(asRecord)
          .find((row) => {
            const metadata = asRecord(row.metadata)
            return readText(metadata.role) === 'sequence_animatic_shot_revision'
              && readText(metadata.shotId) === shotId
              && (readText(metadata.keyframeAssetKey) || readText(row.asset_key))
          }) ?? null
      }
      const existingShotChild = shotChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true
          && readScreenplayAnimaticRole(metadata) === 'shot_video'
          && readText(metadata.shotId) === shotId
          && (!readText(metadata.manifestHash) || readText(metadata.manifestHash) === manifestHash)
          && (!readText(metadata.blockHash) || readText(metadata.blockHash) === currentBlockHash)
      }) ?? null

      let shotChild = existingShotChild
      const now = new Date().toISOString()
      if (!shotChild) {
        const panelArtifactsResponse = await client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .eq('workflow_id', blockRequest.workflowId)
          .order('created_at', { ascending: false })
        if (panelArtifactsResponse.error) throw new Error(panelArtifactsResponse.error.message)
        const panelArtifact = (panelArtifactsResponse.data ?? []).find((row) => {
          const rowRecord = asRecord(row)
          const metadata = asRecord(rowRecord.metadata)
          const role = readText(metadata.role)
          return readText(rowRecord.asset_key)
            && readText(metadata.shotId) === shotId
            && (
              role === 'cinematic_v3_storyboard_panel'
              || role === 'cinematic_v2_storyboard_panel'
              || role === 'sequence_animatic_block_panel'
            )
        })
        if (!panelArtifact) {
          throw new HttpError(409, 'Generate/extract the storyboard panel before creating a shot video workflow.')
        }
        const revisionMetadata = asRecord(latestShotRevision?.metadata)
        const revisionRecord = asRecord(revisionMetadata.revision)
        const revisedShot = asRecord(revisionMetadata.revisedShot ?? revisionRecord.revisedShot)
        const effectiveShot = Object.keys(revisedShot).length > 0 ? { ...shot, ...revisedShot, id: shotId } : shot
        const basePanelArtifactRecord = asRecord(panelArtifact)
        const panelArtifactRecord = latestShotRevision && (readText(revisionMetadata.keyframeAssetKey) || readText(latestShotRevision.asset_key))
          ? {
            ...basePanelArtifactRecord,
            asset_key: readText(revisionMetadata.keyframeAssetKey) || readText(latestShotRevision.asset_key),
            key: readText(latestShotRevision.key) || readText(basePanelArtifactRecord.key),
            metadata: {
              ...asRecord(basePanelArtifactRecord.metadata),
              ...revisionMetadata,
              role: 'sequence_animatic_shot_revision_keyframe',
              sourcePanelAssetKey: readText(basePanelArtifactRecord.asset_key),
              revisionArtifactKey: readText(latestShotRevision.key),
            },
          }
          : basePanelArtifactRecord
        const panelMetadata = asRecord(panelArtifactRecord.metadata)
        const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(effectiveShot.editorialDurationSeconds ?? 0) || Number(panelMetadata.editorialDurationSeconds ?? 0) || 3))
        const providerDurationSeconds = providerSafeSequenceAnimaticVideoDurationSeconds(effectiveShot.providerDurationSeconds ?? editorialDurationSeconds)
        const blockHash = sequenceAnimaticStableHash(block)
        const shotHash = sequenceAnimaticStableHash({ blockId: storyboardBlockId, shot: effectiveShot, panelAssetKey: readText(panelArtifactRecord.asset_key) })
        const workflowPayload = {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_shot_${slugify(blockRequest.id)}_${slugify(shotId)}_${shotHash.slice(0, 8)}`,
            name: `${blockRequest.title} / Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`,
            description: 'Sequence animatic per-shot video workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: user.id,
            metadata: {
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              graphSpecVersion: sequenceAnimaticGraphSpecVersion,
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              storyboardBlockId,
              shotId,
              manifestHash,
              blockHash,
              shotHash,
              continuityPackHash: continuityPackHash || null,
              masterManifestArtifactKey,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              readyToRun: true,
            },
          }
        const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'shot_video',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'shot_video',
          masterRequestId: masterRequest.id,
          parentRequestId: blockRequest.id,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          storyboardBlockId,
          shotId,
          manifestHash,
          blockHash,
          shotHash,
          continuityPackHash: continuityPackHash || null,
          masterManifestArtifactKey,
        }
        const panel = {
          id: readText(panelMetadata.panelId) || `${shotId}_panel`,
          role: 'cinematic_v2_shot_keyframe',
          name: `${readText(effectiveShot.title) || `Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`} cropped panel keyframe`,
          assetKey: readText(panelArtifactRecord.asset_key),
          artifactKey: readText(panelArtifactRecord.key),
          mimeType: readText(panelArtifactRecord.mime_type),
          sourceSheetAssetKey: readText(panelMetadata.sourceSheetAssetKey),
          cropRect: panelMetadata.cropRect ?? panelMetadata.crop ?? null,
          storyboardBlockId,
          shotId,
          metadata: panelMetadata,
        }
        const shotContinuityAnchorIds = mergeAnchorIds(
          readStringArray(shot.continuityAnchorIds),
          readStringArray(shot.continuityAnchorRefIds),
          readStringArray(effectiveShot.continuityAnchorIds),
          readStringArray(effectiveShot.continuityAnchorRefIds),
          continuityAnchorIdsForScope(continuityAnchorSource, 'shotIds', shotId),
        )
        const shotAssetPack = assetPackWithContinuityAnchors(
          asRecord(manifest.assetPack),
          continuityAnchorSource,
          shotContinuityAnchorIds,
        )
        const { nodes, edges } = buildSequenceAnimaticShotVideoWorkflowGraph({
          workflowId: crypto.randomUUID(),
          draftId: payload.draftId,
          commonConfig,
          block,
          shot: effectiveShot,
          panel,
          assetPack: shotAssetPack,
          editorialDurationSeconds,
          providerDurationSeconds,
          aspectRatio,
        })
        const requestPayload = {
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: blockRequest.id,
            requested_by: user.id,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate a per-shot video take for ${readText(effectiveShot.title) || shotId}.`,
            title: `${blockRequest.title} / Shot ${Number(effectiveShot.index ?? 0) || shots.indexOf(shot) + 1}`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'video',
            planner_notes: 'Per-shot sequence animatic video graph prepared from a cropped storyboard panel.',
            metadata: {
              graphSpecVersion: sequenceAnimaticGraphSpecVersion,
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              storyboardBlockId,
              shotId,
              manifestHash,
              blockHash: sequenceAnimaticStableHash(block),
              shotHash,
              continuityPackHash: continuityPackHash || null,
              masterManifestArtifactKey,
              shotIndex: Number(shot.index ?? 0) || shots.indexOf(shot) + 1,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              panelAssetKey: readText(panelArtifactRecord.asset_key),
              editorialDurationSeconds,
              providerDurationSeconds,
              readyToRun: true,
              createdFromManifestAt: now,
              shot: effectiveShot,
              sourceShotRevisionId: readText(revisionMetadata.revisionId) || null,
              sourceShotRevisionArtifactKey: readText(latestShotRevision?.key) || null,
            },
          }
        const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
          p_project_id: payload.projectId,
          p_draft_id: payload.draftId,
          p_parent_request_id: blockRequest.id,
          p_role: 'shot_video',
          p_identity_key: 'shotId',
          p_identity_value: shotId,
          p_workflow: workflowPayload,
          p_nodes: nodes,
          p_edges: edges,
          p_request: requestPayload,
        })
        if (ensureResponse.error || !ensureResponse.data) {
          throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure shot video workflow.')
        }
        const ensured = asRecord(ensureResponse.data)
        shotChild = mapOutputRequestRow(asRecord(ensured.request) as never)
        console.info('[GraphCore] sequence animatic shot ensure rpc completed.', {
          masterRequestId: masterRequest.id,
          blockRequestId: blockRequest.id,
          shotRequestId: shotChild.id,
          shotId,
          manifestHash,
          blockHash,
          shotHash,
          created: ensured.created === true,
          reused: ensured.reused === true,
        })
      }

      const allChildrenResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .or(`parent_request_id.eq.${masterRequest.id},parent_request_id.eq.${blockRequest.id}`)
        .order('created_at', { ascending: true })
      if (allChildrenResponse.error) throw new Error(allChildrenResponse.error.message)
      const allChildren = (allChildrenResponse.data ?? []).map(mapOutputRequestRow)
      const workflowIds = allChildren.map((child) => child.workflowId).filter((id): id is string => Boolean(id))
      const [workflowRows, nodeRows, edgeRows, latestMasterResponse] = await Promise.all([
        workflowIds.length > 0
          ? client.from('output_workflows').select(outputWorkflowSelect).in('id', workflowIds)
          : Promise.resolve({ data: [], error: null }),
        workflowIds.length > 0
          ? client.from('output_workflow_nodes').select(outputWorkflowNodeSelect).in('workflow_id', workflowIds)
          : Promise.resolve({ data: [], error: null }),
        workflowIds.length > 0
          ? client.from('output_workflow_edges').select(outputWorkflowEdgeSelect).in('workflow_id', workflowIds)
          : Promise.resolve({ data: [], error: null }),
        client.from('output_requests').select(outputRequestSelect).eq('id', masterRequest.id).single(),
      ])
      if (workflowRows.error) throw new Error(workflowRows.error.message)
      if (nodeRows.error) throw new Error(nodeRows.error.message)
      if (edgeRows.error) throw new Error(edgeRows.error.message)
      if (latestMasterResponse.error || !latestMasterResponse.data) throw new Error(latestMasterResponse.error?.message ?? 'Failed to reload master request.')

      return json(sequenceAnimaticBlockWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest: mapOutputRequestRow(latestMasterResponse.data),
        childRequests: allChildren,
        workflows: (workflowRows.data ?? []).map(mapOutputWorkflowRow),
        nodes: (nodeRows.data ?? []).map(mapOutputWorkflowNodeRow),
        edges: (edgeRows.data ?? []).map(mapOutputWorkflowEdgeRow),
      }))
    }

    const createdWorkflowIds: string[] = []
    const childRequests = [...activeExistingChildren]
    const now = new Date().toISOString()
    for (const block of blocks) {
      const blockId = readText(block.id)
      if (!blockId || existingByBlockId.has(blockId)) continue
      const storyboardGroup = asRecord(block.storyboardGroup)
      const layout = asRecord(block.storyboardLayout)
      const rows = Math.max(1, Number(layout.rows ?? storyboardGroup.rows ?? 1) || 1)
      const columns = Math.max(1, Number(layout.columns ?? storyboardGroup.columns ?? 1) || 1)
      const panelCount = Math.max(1, Number(layout.panelCount ?? storyboardGroup.panelCount ?? readArray(block.shots).length) || 1)
      const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
      const imageSize = sequenceAnimaticStoryboardImageSize(columns, rows, aspectRatio)
      const blockHash = sequenceAnimaticStableHash(block)
      const workflowPayload = {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_${slugify(masterRequest.id)}_${slugify(blockId)}_${manifestHash.slice(0, 8)}`,
          name: `${masterRequest.title} / Block ${Number(block.index ?? 0) || childRequests.length + 1}`,
          description: 'Sequence animatic storyboard block workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: {
            parentRequestId: masterRequest.id,
            graphSpecVersion: sequenceAnimaticGraphSpecVersion,
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            storyboardBlockId: blockId,
            manifestHash,
            blockHash,
            continuityPackHash: continuityPackHash || null,
            masterManifestArtifactKey,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
          },
        }

      const blockShotPlan = {
        ...asRecord(manifest.shotPlan),
        totalEditorialDurationSeconds: Number(block.durationSeconds ?? storyboardGroup.editorialDurationSeconds ?? 0) || readArray(block.shots).reduce((total, shot) => total + (Number(asRecord(shot).editorialDurationSeconds ?? 0) || 0), 0),
        shots: readArray(block.shots).map(asRecord),
      }
      const blockContinuityAnchorIds = mergeAnchorIds(
        readStringArray(block.continuityAnchorIds),
        continuityAnchorIdsForScope(continuityAnchorSource, 'storyboardBlockIds', blockId),
      )
      const blockAssetPack = assetPackWithContinuityAnchors(
        asRecord(manifest.assetPack),
        continuityAnchorSource,
        blockContinuityAnchorIds,
      )
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'storyboard_block',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'storyboard_block',
        parentRequestId: masterRequest.id,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        storyboardBlockId: blockId,
        manifestHash,
        blockHash,
        continuityPackHash: continuityPackHash || null,
        masterManifestArtifactKey,
      }
      const durationSeconds = Math.max(4, Math.min(15, Number(block.durationSeconds ?? storyboardGroup.providerDurationSeconds ?? 0) || 8))
      const { nodes, edges } = buildSequenceAnimaticBlockWorkflowGraph({
        workflowId: crypto.randomUUID(),
        draftId: payload.draftId,
        commonConfig,
        block,
        manifestSummary: {
          title: readText(manifest.title) || masterRequest.title,
          screenplayMarkdown: readText(manifest.screenplayMarkdown),
        },
        shotPlan: blockShotPlan,
        storyboardGroup,
        storyboardLayout: { rows, columns, panelCount },
        assetPack: blockAssetPack,
        aspectRatio,
        imageSize,
        durationSeconds,
      })
      const requestPayload = {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: user.id,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `${masterRequest.prompt}\n\nStoryboard block ${Number(block.index ?? 0) || childRequests.length + 1}: ${readText(block.title) || blockId}`,
          title: `${masterRequest.title} / Block ${Number(block.index ?? 0) || childRequests.length + 1}`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'video',
          planner_notes: 'Storyboard block graph prepared from a sequence animatic master manifest.',
          metadata: {
            graphSpecVersion: sequenceAnimaticGraphSpecVersion,
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            parentRequestId: masterRequest.id,
            storyboardBlockId: blockId,
            storyboardBlockIndex: Number(block.index ?? 0) || childRequests.length + 1,
            manifestHash,
            blockHash,
            continuityPackHash: continuityPackHash || null,
            masterManifestArtifactKey,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
            createdFromManifestAt: now,
            block,
          },
        }
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: masterRequest.id,
        p_role: 'storyboard_block',
        p_identity_key: 'storyboardBlockId',
        p_identity_value: blockId,
        p_workflow: workflowPayload,
        p_nodes: nodes,
        p_edges: edges,
        p_request: requestPayload,
      })
      if (ensureResponse.error || !ensureResponse.data) {
        throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure storyboard block workflow.')
      }
      const ensured = asRecord(ensureResponse.data)
      const child = mapOutputRequestRow(asRecord(ensured.request) as never)
      const ensuredWorkflowId = readText(asRecord(ensured.workflow).id)
      if (ensuredWorkflowId) createdWorkflowIds.push(ensuredWorkflowId)
      childRequests.push(child)
      console.info('[GraphCore] sequence animatic storyboard block ensure rpc completed.', {
        masterRequestId: masterRequest.id,
        blockRequestId: child.id,
        storyboardBlockId: blockId,
        manifestHash,
        blockHash,
        created: ensured.created === true,
        reused: ensured.reused === true,
      })
    }

    if (createdWorkflowIds.length > 0) {
      await client
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            screenplayAnimaticRole: 'master',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'master',
            childBlockRequestIds: childRequests.map((child) => child.id),
            childBlockWorkflowIds: childRequests.map((child) => child.workflowId).filter(Boolean),
            blockWorkflowsEnsuredAt: now,
          },
        })
        .eq('id', masterRequest.id)
      await client.rpc('refresh_output_request_status_projection', { p_request_id: masterRequest.id })
    }

    const workflowIds = childRequests.map((child) => child.workflowId).filter((id): id is string => Boolean(id))
    const [workflowRows, nodeRows, edgeRows, latestMasterResponse] = await Promise.all([
      workflowIds.length > 0
        ? client.from('output_workflows').select(outputWorkflowSelect).in('id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      workflowIds.length > 0
        ? client.from('output_workflow_nodes').select(outputWorkflowNodeSelect).in('workflow_id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      workflowIds.length > 0
        ? client.from('output_workflow_edges').select(outputWorkflowEdgeSelect).in('workflow_id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('output_requests').select(outputRequestSelect).eq('id', masterRequest.id).single(),
    ])
    if (workflowRows.error) throw new Error(workflowRows.error.message)
    if (nodeRows.error) throw new Error(nodeRows.error.message)
    if (edgeRows.error) throw new Error(edgeRows.error.message)
    if (latestMasterResponse.error || !latestMasterResponse.data) throw new Error(latestMasterResponse.error?.message ?? 'Failed to reload master request.')

    return json(sequenceAnimaticBlockWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest: mapOutputRequestRow(latestMasterResponse.data),
      childRequests,
      workflows: (workflowRows.data ?? []).map(mapOutputWorkflowRow),
      nodes: (nodeRows.data ?? []).map(mapOutputWorkflowNodeRow),
      edges: (edgeRows.data ?? []).map(mapOutputWorkflowEdgeRow),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to prepare sequence animatic block workflows.')
  }
})
