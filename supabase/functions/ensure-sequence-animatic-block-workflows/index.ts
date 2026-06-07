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
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
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

function isStoryboardPanelRole(role: string) {
  return role === 'cinematic_v3_storyboard_panel'
    || role === 'cinematic_v2_storyboard_panel'
    || role === 'sequence_animatic_block_panel'
}

function storyboardPanelCandidateForShot(value: unknown, shotId: string) {
  const record = asRecord(value)
  const metadata = asRecord(record.metadata)
  const role = readText(metadata.role) || readText(record.role) || readText(metadata.sequenceAnimaticArtifactRole)
  const sequenceRole = readText(metadata.sequenceAnimaticArtifactRole) || readText(record.sequenceAnimaticArtifactRole)
  const candidateShotId = readText(metadata.shotId) || readText(record.shotId)
  const assetKey = readText(record.asset_key) || readText(record.assetKey) || readText(metadata.assetKey)
  return Boolean(assetKey)
    && candidateShotId === shotId
    && (isStoryboardPanelRole(role) || isStoryboardPanelRole(sequenceRole))
}

function normalizeStoryboardPanelRecord(value: unknown, shotId: string) {
  const record = asRecord(value)
  const metadata = asRecord(record.metadata)
  const artifact = asRecord(record.artifact)
  const role = readText(metadata.role) || readText(record.role) || 'cinematic_v3_storyboard_panel'
  const assetKey = readText(record.asset_key) || readText(record.assetKey) || readText(metadata.assetKey)
  const storagePath = readText(record.storage_path) || readText(record.storagePath) || readText(metadata.storagePath)
  const mimeType = readText(record.mime_type) || readText(record.mimeType) || readText(metadata.mimeType) || 'image/webp'
  return {
    ...record,
    key: readText(record.key) || readText(artifact.key),
    asset_key: assetKey,
    storage_path: storagePath,
    mime_type: mimeType,
    metadata: {
      ...metadata,
      ...record,
      role,
      shotId,
      assetKey,
      storagePath,
      mimeType,
    },
  }
}

function collectStoryboardPanelCandidatesFromOutputs(outputs: unknown) {
  const record = asRecord(outputs)
  return [
    ...readArray(record.panels),
    ...readArray(record.images),
    record.image,
  ].filter((entry) => Object.keys(asRecord(entry)).length > 0)
}

function storyboardPanelRecordFromAsset(row: unknown, shotId: string) {
  const record = asRecord(row)
  const metadata = asRecord(record.metadata)
  const assetKey = readText(record.key)
  const storagePath = readText(record.storage_path)
  const mimeType = readText(record.mime_type) || 'image/webp'
  return {
    key: '',
    asset_key: assetKey,
    storage_path: storagePath,
    mime_type: mimeType,
    metadata: {
      ...metadata,
      role: 'cinematic_v3_storyboard_panel',
      sequenceAnimaticArtifactRole: 'sequence_animatic_block_panel',
      shotId,
      assetKey,
      storagePath,
      mimeType,
      source: 'explicit_panel_asset_key',
    },
  }
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
    const directorPlanArtifactRow = (artifactsResponse.data ?? [])
      .find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_director_plan') ?? null
    const directorPlanMetadata = asRecord(asRecord(directorPlanArtifactRow).metadata)
    const directorPlan = asRecord(directorPlanMetadata.directorPlan ?? directorPlanMetadata.director_plan)
    const directorShots = readArray(directorPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
    const directorShotById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
    const directorBlocks = readArray(directorPlan.blocks).map(asRecord).filter((block) => readText(block.id))
    const directorBlockById = new Map(directorBlocks.map((block) => [readText(block.id), block] as const).filter(([id]) => id))
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const masterManifestArtifactKey = readText(asRecord(manifestArtifactRow).key)
    const blocks = readArray(manifest.blocks).map(asRecord).filter((block) => readText(block.id)).map((block) => {
      const blockId = readText(block.id)
      const directorBlock = directorBlockById.get(blockId) ?? {}
      const manifestShotIds = readStringArray(block.shotIds)
      const directorShotIds = readStringArray(directorBlock.shotIds)
      const shotIds = directorShotIds.length > 0 ? directorShotIds : manifestShotIds
      const manifestShotsById = new Map(readArray(block.shots).map(asRecord).map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
      const shots = shotIds
        .map((shotId) => ({ ...asRecord(manifestShotsById.get(shotId)), ...asRecord(directorShotById.get(shotId)), id: shotId }))
        .filter((shot) => readText(shot.id))
      return {
        ...block,
        ...directorBlock,
        id: blockId,
        shotIds: shotIds.length > 0 ? shotIds : readStringArray(block.shotIds),
        shots: shots.length > 0 ? shots : readArray(block.shots).map(asRecord),
        storyboardGroup: asRecord(block.storyboardGroup),
        storyboardLayout: asRecord(block.storyboardLayout),
        durationSeconds: Number(directorBlock.durationSeconds ?? block.durationSeconds ?? 0) || Number(block.durationSeconds ?? 0) || undefined,
      }
    })
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
    if (Object.keys(directorPlan).length > 0) {
      continuityAnchorSource = {
        ...continuityAnchorSource,
        ...directorPlan,
        continuityGraphV2: asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
        shotBindings: asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      }
      continuityPackHash = continuityPackHash || readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    }

    if (payload.sequenceAnimaticMode === 'shot_video') {
      const blockRequestId = readText(payload.blockRequestId)
      const shotId = readText(payload.shotId)
      const requestedStoryboardBlockId = readText(payload.storyboardBlockId)
      const requestedPanelAssetKey = readText(payload.panelAssetKey)
      if (!blockRequestId && !requestedStoryboardBlockId) {
        throw new HttpError(400, 'blockRequestId or storyboardBlockId is required when preparing a shot video workflow.')
      }
      if (!shotId) throw new HttpError(400, 'shotId is required when preparing a shot video workflow.')

      const blockRequest = activeExistingChildren.find((child) => child.id === blockRequestId)
        ?? (requestedStoryboardBlockId ? existingByBlockId.get(requestedStoryboardBlockId) ?? null : null)
      if (!blockRequest) {
        throw new HttpError(404, 'Storyboard block request was not found under this sequence animatic master. Refresh the animatic state or regenerate the storyboard block workflow.')
      }
      const blockMetadata = asRecord(blockRequest.metadata)
      if (readScreenplayAnimaticRole(blockMetadata) !== 'storyboard_block') {
        throw new HttpError(409, 'The selected parent request is not a storyboard block workflow.')
      }
      if (!blockRequest.workflowId) throw new HttpError(409, 'Storyboard block request has no workflow yet.')

      const storyboardBlockId = readText(blockMetadata.storyboardBlockId) || requestedStoryboardBlockId
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
      if (shotChild && requestedPanelAssetKey) {
        const existingMetadata = asRecord(shotChild.metadata)
        const existingPanelAssetKey = readText(existingMetadata.panelAssetKey)
        if (existingPanelAssetKey && existingPanelAssetKey !== requestedPanelAssetKey) {
          const staleResponse = await admin
            .from('output_requests')
            .update({
              metadata: {
                ...existingMetadata,
                sequenceAnimaticStale: true,
                staleReason: 'shot_panel_asset_changed',
                staleMarkedAt: now,
                replacementPanelAssetKey: requestedPanelAssetKey,
              },
            })
            .eq('id', shotChild.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
          await admin.rpc('refresh_output_request_status_projection', { p_request_id: shotChild.id })
          shotChild = null
        }
      }
      if (!shotChild) {
        const panelArtifactsResponse = await client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .eq('workflow_id', blockRequest.workflowId)
          .order('created_at', { ascending: false })
        if (panelArtifactsResponse.error) throw new Error(panelArtifactsResponse.error.message)
        let panelArtifact = (panelArtifactsResponse.data ?? []).find((row) => storyboardPanelCandidateForShot(row, shotId)) ?? null
        const availableArtifactPanelShotIds = new Set((panelArtifactsResponse.data ?? [])
          .map((row) => readText(asRecord(asRecord(row).metadata).shotId))
          .filter(Boolean))
        if (!panelArtifact) {
          const [runRows, stepRows] = await Promise.all([
            client
              .from('output_workflow_runs')
              .select(outputWorkflowRunSelect)
              .eq('project_id', payload.projectId)
              .eq('draft_id', payload.draftId)
              .eq('workflow_id', blockRequest.workflowId)
              .order('updated_at', { ascending: false })
              .limit(5),
            client
              .from('output_workflow_run_steps')
              .select(outputWorkflowRunStepSelect)
              .eq('workflow_id', blockRequest.workflowId)
              .eq('node_key', 'panel_extract')
              .order('updated_at', { ascending: false })
              .limit(5),
          ])
          if (runRows.error) throw new Error(runRows.error.message)
          if (stepRows.error) throw new Error(stepRows.error.message)
          const outputPanelCandidates = [
            ...(stepRows.data ?? []).flatMap((row) => collectStoryboardPanelCandidatesFromOutputs(asRecord(row).outputs)),
            ...(runRows.data ?? []).flatMap((row) => collectStoryboardPanelCandidatesFromOutputs(asRecord(row).outputs)),
          ]
          for (const candidate of outputPanelCandidates) {
            const candidateShotId = readText(asRecord(candidate).shotId) || readText(asRecord(asRecord(candidate).metadata).shotId)
            if (candidateShotId) availableArtifactPanelShotIds.add(candidateShotId)
          }
          const outputPanel = outputPanelCandidates.find((candidate) => storyboardPanelCandidateForShot(candidate, shotId)) ?? null
          if (outputPanel) panelArtifact = normalizeStoryboardPanelRecord(outputPanel, shotId)
        }
        if (!panelArtifact && requestedPanelAssetKey) {
          const panelAssetResponse = await admin
            .from('project_assets')
            .select('key, storage_path, mime_type, metadata')
            .eq('project_id', payload.projectId)
            .eq('key', requestedPanelAssetKey)
            .maybeSingle()
          if (panelAssetResponse.error) throw new Error(panelAssetResponse.error.message)
          if (panelAssetResponse.data) panelArtifact = storyboardPanelRecordFromAsset(panelAssetResponse.data, shotId)
        }
        if (!panelArtifact) {
          const availableShotSummary = Array.from(availableArtifactPanelShotIds).slice(0, 12).join(', ')
          throw new HttpError(
            409,
            `Generate/extract the storyboard panel before creating a shot video workflow. No panel asset was found for shot "${shotId}" on this block${requestedPanelAssetKey ? `, and the requested panel asset "${requestedPanelAssetKey}" was not found` : ''}${availableShotSummary ? `; available panel shots: ${availableShotSummary}` : ''}.`,
          )
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
