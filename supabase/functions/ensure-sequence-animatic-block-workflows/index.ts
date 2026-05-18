import { requireUserClient } from '../_shared/auth.ts'
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
  providerSafeSequenceAnimaticVideoDurationSeconds,
  sequenceAnimaticStoryboardImageSize,
  sequenceAnimaticWorkflowEdge,
  sequenceAnimaticWorkflowNode,
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
  const anchorType = readText(anchor.anchorType)
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
    ...readArray(manifest.locationSpotAnchors).map(asRecord),
    ...readArray(manifest.anchorAssets).map(asRecord),
  ]
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

const buildNode = sequenceAnimaticWorkflowNode
const buildEdge = sequenceAnimaticWorkflowEdge

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-block-workflows')
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
    const manifestArtifact = (artifactsResponse.data ?? [])
      .map((row) => asRecord(asRecord(row).metadata))
      .find((metadata) => readText(metadata.role) === 'sequence_animatic_manifest')
    const manifest = asRecord(manifestArtifact?.manifest)
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
    const existingByBlockId = new Map(existingChildren.map((child) => [readText(asRecord(child.metadata).storyboardBlockId), child] as const).filter(([id]) => id))

    if (payload.sequenceAnimaticMode === 'shot_video') {
      const blockRequestId = readText(payload.blockRequestId)
      const shotId = readText(payload.shotId)
      if (!blockRequestId) throw new HttpError(400, 'blockRequestId is required when preparing a shot video workflow.')
      if (!shotId) throw new HttpError(400, 'shotId is required when preparing a shot video workflow.')

      const blockRequest = existingChildren.find((child) => child.id === blockRequestId) ?? null
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

      const shotChildrenResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', blockRequest.id)
        .order('created_at', { ascending: true })
      if (shotChildrenResponse.error) throw new Error(shotChildrenResponse.error.message)
      const shotChildren = (shotChildrenResponse.data ?? []).map(mapOutputRequestRow)
      const existingShotChild = shotChildren.find((child) => {
        const metadata = asRecord(child.metadata)
        return readScreenplayAnimaticRole(metadata) === 'shot_video' && readText(metadata.shotId) === shotId
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
        const panelArtifactRecord = asRecord(panelArtifact)
        const panelMetadata = asRecord(panelArtifactRecord.metadata)
        const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(shot.editorialDurationSeconds ?? 0) || Number(panelMetadata.editorialDurationSeconds ?? 0) || 3))
        const providerDurationSeconds = providerSafeSequenceAnimaticVideoDurationSeconds(shot.providerDurationSeconds ?? editorialDurationSeconds)
        const workflowResponse = await client
          .from('output_workflows')
          .insert({
            project_id: payload.projectId,
            draft_id: payload.draftId,
            key: `sequence_animatic_shot_${slugify(blockRequest.id)}_${slugify(shotId)}`,
            name: `${blockRequest.title} / Shot ${Number(shot.index ?? 0) || shots.indexOf(shot) + 1}`,
            description: 'Sequence animatic per-shot video workflow.',
            preset: 'cinematic_episode_from_sequence',
            status: 'active',
            created_by: user.id,
            metadata: {
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              storyboardBlockId,
              shotId,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              readyToRun: true,
            },
          })
          .select(outputWorkflowSelect)
          .single()
        if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to create shot video workflow.')
        const workflow = mapOutputWorkflowRow(workflowResponse.data)
        const aspectRatio = readText(asRecord(manifest.assetPack).aspectRatio) || '16:9'
        const commonConfig = {
          cinematicPipelineVersion: 'v3_script_storyboards',
          screenplayAnimaticRole: 'shot_video',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'shot_video',
          masterRequestId: masterRequest.id,
          parentRequestId: blockRequest.id,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          storyboardBlockId,
          shotId,
        }
        const panel = {
          id: readText(panelMetadata.panelId) || `${shotId}_panel`,
          role: 'cinematic_v2_shot_keyframe',
          name: `${readText(shot.title) || `Shot ${Number(shot.index ?? 0) || shots.indexOf(shot) + 1}`} cropped panel keyframe`,
          assetKey: readText(panelArtifactRecord.asset_key),
          artifactKey: readText(panelArtifactRecord.key),
          mimeType: readText(panelArtifactRecord.mime_type),
          sourceSheetAssetKey: readText(panelMetadata.sourceSheetAssetKey),
          cropRect: panelMetadata.cropRect ?? panelMetadata.crop ?? null,
          storyboardBlockId,
          shotId,
          metadata: panelMetadata,
        }
        const shotAssetPack = assetPackWithContinuityAnchors(
          asRecord(manifest.assetPack),
          manifest,
          readStringArray(shot.continuityAnchorIds).concat(readStringArray(shot.continuityAnchorRefIds)),
        )
        const nodes = [
          buildNode(workflow.id, payload.draftId, 'shot_input', 'utility_transform', 'Shot Input', 80, 100, {
            purpose: 'sequence_animatic_shot_input',
            ...commonConfig,
            block,
            shot,
            panel,
            assetPack: shotAssetPack,
            editorialDurationSeconds,
            providerDurationSeconds,
            aspectRatio,
          }, {}, 'shot_video'),
          buildNode(workflow.id, payload.draftId, 'shot_video_prompt', 'utility_transform', 'Shot Video Prompt', 360, 100, {
            purpose: 'sequence_animatic_shot_video_prompt',
            ...commonConfig,
            editorialDurationSeconds,
            providerDurationSeconds,
            durationSeconds: providerDurationSeconds,
            aspectRatio,
            resolution: '720p',
            generateAudio: false,
            execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_shot_video_prompt', maxConcurrency: 4 },
          }, {}, 'shot_video'),
          buildNode(workflow.id, payload.draftId, 'shot_video', 'video_generation', 'Shot Video', 640, 100, {
            purpose: 'sequence_animatic_shot_video',
            role: 'sequence_animatic_shot_video',
            ...commonConfig,
            editorialDurationSeconds,
            providerDurationSeconds,
            durationSeconds: providerDurationSeconds,
            aspectRatio,
            resolution: '720p',
            quality: 'high',
            generateAudio: false,
            cinematicReferenceMode: 'keyframes',
            assetPackReferenceLimit: 6,
            debugSkipVideoGeneration: true,
            manualOnly: true,
            manual_only: true,
            execution: { resourceClass: 'video', groupKey: 'sequence_animatic_shot_video', maxConcurrency: 1, manualOnly: true },
          }, {}, 'shot_video'),
        ]
        const nodeResponse = await client.from('output_workflow_nodes').insert(nodes).select(outputWorkflowNodeSelect)
        if (nodeResponse.error) throw new Error(nodeResponse.error.message)
        const edges = [
          buildEdge(workflow.id, payload.draftId, 'shot_input__prompt_plan', 'shot_input', 'shot', 'shot_video_prompt', 'shot', {}, 'shot_video'),
          buildEdge(workflow.id, payload.draftId, 'shot_input__prompt_refs', 'shot_input', 'asset_pack', 'shot_video_prompt', 'asset_pack', {}, 'shot_video'),
          buildEdge(workflow.id, payload.draftId, 'shot_panel__prompt_refs', 'shot_input', 'image', 'shot_video_prompt', 'references', {}, 'shot_video'),
          buildEdge(workflow.id, payload.draftId, 'shot_prompt__video', 'shot_video_prompt', 'text', 'shot_video', 'prompt', {}, 'shot_video'),
          buildEdge(workflow.id, payload.draftId, 'shot_panel__video_refs', 'shot_input', 'image', 'shot_video', 'references', {}, 'shot_video'),
          buildEdge(workflow.id, payload.draftId, 'shot_input__video_refs', 'shot_input', 'asset_pack', 'shot_video', 'asset_pack', {}, 'shot_video'),
        ]
        const edgeResponse = await client.from('output_workflow_edges').insert(edges).select(outputWorkflowEdgeSelect)
        if (edgeResponse.error) throw new Error(edgeResponse.error.message)

        const childResponse = await client
          .from('output_requests')
          .insert({
            project_id: payload.projectId,
            draft_id: payload.draftId,
            parent_request_id: blockRequest.id,
            workflow_id: workflow.id,
            requested_by: user.id,
            source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
            prompt: `Generate a per-shot video take for ${readText(shot.title) || shotId}.`,
            title: `${blockRequest.title} / Shot ${Number(shot.index ?? 0) || shots.indexOf(shot) + 1}`,
            intent: 'output_generation',
            output_kind: 'cinematic_episode',
            status: 'awaiting_confirmation',
            selected_entity_keys: masterRequest.selectedEntityKeys,
            selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
            page_count: null,
            target_format: 'video',
            planner_notes: 'Per-shot sequence animatic video graph prepared from a cropped storyboard panel.',
            metadata: {
              screenplayAnimaticRole: 'shot_video',
              screenplayAnimaticSource,
              sequenceAnimaticRole: 'shot_video',
              parentRequestId: blockRequest.id,
              masterRequestId: masterRequest.id,
              storyboardBlockId,
              shotId,
              shotIndex: Number(shot.index ?? 0) || shots.indexOf(shot) + 1,
              sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
              sourceMasterWorkflowId: masterRequest.workflowId,
              sourceBlockWorkflowId: blockRequest.workflowId,
              panelAssetKey: readText(panelArtifactRecord.asset_key),
              editorialDurationSeconds,
              providerDurationSeconds,
              readyToRun: true,
              createdFromManifestAt: now,
              shot,
            },
          })
          .select(outputRequestSelect)
          .single()
        if (childResponse.error || !childResponse.data) throw new Error(childResponse.error?.message ?? 'Failed to create shot video request.')
        shotChild = mapOutputRequestRow(childResponse.data)
        await client.rpc('refresh_output_request_status_projection', { p_request_id: shotChild.id })
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
    const childRequests = [...existingChildren]
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
      const workflowResponse = await client
        .from('output_workflows')
        .insert({
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_${slugify(masterRequest.id)}_${slugify(blockId)}`,
          name: `${masterRequest.title} / Block ${Number(block.index ?? 0) || childRequests.length + 1}`,
          description: 'Sequence animatic storyboard block workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: {
            parentRequestId: masterRequest.id,
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            storyboardBlockId: blockId,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
          },
        })
        .select(outputWorkflowSelect)
        .single()
      if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to create block workflow.')
      const workflow = mapOutputWorkflowRow(workflowResponse.data)
      createdWorkflowIds.push(workflow.id)

      const blockShotPlan = {
        ...asRecord(manifest.shotPlan),
        totalEditorialDurationSeconds: Number(block.durationSeconds ?? storyboardGroup.editorialDurationSeconds ?? 0) || readArray(block.shots).reduce((total, shot) => total + (Number(asRecord(shot).editorialDurationSeconds ?? 0) || 0), 0),
        shots: readArray(block.shots).map(asRecord),
      }
      const blockAssetPack = assetPackWithContinuityAnchors(
        asRecord(manifest.assetPack),
        manifest,
        readStringArray(block.continuityAnchorIds),
      )
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        screenplayAnimaticRole: 'storyboard_block',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'storyboard_block',
        parentRequestId: masterRequest.id,
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        storyboardBlockId: blockId,
      }
      const nodes = [
        buildNode(workflow.id, payload.draftId, 'block_input', 'utility_transform', 'Block Input', 80, 100, {
          purpose: 'sequence_animatic_block_input',
          ...commonConfig,
          block,
          manifestSummary: {
            title: readText(manifest.title) || masterRequest.title,
            screenplayMarkdown: readText(manifest.screenplayMarkdown),
          },
          shotPlan: blockShotPlan,
          storyboardGroup,
          storyboardLayout: { rows, columns, panelCount },
          assetPack: blockAssetPack,
        }),
        buildNode(workflow.id, payload.draftId, 'storyboard_prompt', 'utility_transform', 'Storyboard Prompt', 360, 100, {
          purpose: 'cinematic_v3_storyboard_prompt',
          ...commonConfig,
          aspectRatio,
          storyboardGroup,
          storyboardLayout: { rows, columns, panelCount },
          planningOnly: true,
          execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_prompt', maxConcurrency: 1 },
        }),
        buildNode(workflow.id, payload.draftId, 'storyboard_sheet', 'image_generation', 'Storyboard Sheet', 640, 100, {
          purpose: 'cinematic_v3_storyboard_sheet',
          role: 'cinematic_v3_storyboard_sheet',
          ...commonConfig,
          storyboardGroup,
          storyboardGroupId: blockId,
          model: 'openai/gpt-image-2',
          referenceModel: 'openai/gpt-image-2/edit',
          quality: 'high',
          outputFormat: 'webp',
          maxReferenceImages: 16,
          imageSize,
          aspectRatio,
          storyboardLayout: { rows, columns, panelCount },
          planningOnly: true,
          planning_only: true,
          usedAsVideoReference: true,
          used_as_video_reference: true,
          execution: { resourceClass: 'image', groupKey: `sequence_animatic_block_${slugify(blockId)}`, maxConcurrency: 1 },
        }),
        buildNode(workflow.id, payload.draftId, 'panel_extract', 'utility_transform', 'Extract Panels', 920, 100, {
          purpose: 'cinematic_v3_panel_extract',
          ...commonConfig,
          storyboardGroup,
          storyboardGroupId: blockId,
          storyboardLayout: { rows, columns, panelCount },
          aspectRatio,
          execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_extract', maxConcurrency: 1 },
        }),
        buildNode(workflow.id, payload.draftId, 'video_prompt', 'utility_transform', 'Video Prompt', 1200, 100, {
          purpose: 'cinematic_v3_storyboard_group_video_prompt',
          ...commonConfig,
          storyboardGroup,
          storyboardGroupId: blockId,
          durationSeconds: Math.max(4, Math.min(15, Number(block.durationSeconds ?? storyboardGroup.providerDurationSeconds ?? 0) || 8)),
          aspectRatio,
          resolution: '720p',
          generateAudio: false,
          execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_block_video_prompt', maxConcurrency: 1 },
        }),
        buildNode(workflow.id, payload.draftId, 'video', 'video_generation', 'Video', 1480, 100, {
          purpose: 'cinematic_v3_storyboard_group_video',
          role: 'cinematic_v3_storyboard_group_video',
          ...commonConfig,
          storyboardGroup,
          storyboardGroupId: blockId,
          durationSeconds: Math.max(4, Math.min(15, Number(block.durationSeconds ?? storyboardGroup.providerDurationSeconds ?? 0) || 8)),
          aspectRatio,
          resolution: '720p',
          generateAudio: false,
          cinematicReferenceMode: 'storyboard_sheet',
          debugSkipVideoGeneration: true,
          manualOnly: true,
          manual_only: true,
          execution: { resourceClass: 'video', groupKey: 'sequence_animatic_block_video', maxConcurrency: 1, manualOnly: true },
        }),
        buildNode(workflow.id, payload.draftId, 'artifact', 'output_artifact', 'Register Block', 1760, 100, {
          purpose: 'sequence_animatic_block_artifact',
          artifactKind: 'other',
          ...commonConfig,
          execution: { resourceClass: 'utility' },
        }),
      ]
      const nodeResponse = await client.from('output_workflow_nodes').insert(nodes).select(outputWorkflowNodeSelect)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)

      const edges = [
        buildEdge(workflow.id, payload.draftId, 'block__prompt_plan', 'block_input', 'text', 'storyboard_prompt', 'shot_plan'),
        buildEdge(workflow.id, payload.draftId, 'block__prompt_refs', 'block_input', 'asset_pack', 'storyboard_prompt', 'asset_pack'),
        buildEdge(workflow.id, payload.draftId, 'prompt__sheet', 'storyboard_prompt', 'text', 'storyboard_sheet', 'prompt'),
        buildEdge(workflow.id, payload.draftId, 'block__sheet_refs', 'block_input', 'asset_pack', 'storyboard_sheet', 'references'),
        buildEdge(workflow.id, payload.draftId, 'sheet__extract', 'storyboard_sheet', 'image', 'panel_extract', 'image'),
        buildEdge(workflow.id, payload.draftId, 'block__extract_plan', 'block_input', 'text', 'panel_extract', 'shot_plan'),
        buildEdge(workflow.id, payload.draftId, 'block__video_prompt_plan', 'block_input', 'text', 'video_prompt', 'shot_plan'),
        buildEdge(workflow.id, payload.draftId, 'block__video_prompt_refs', 'block_input', 'asset_pack', 'video_prompt', 'asset_pack'),
        buildEdge(workflow.id, payload.draftId, 'sheet__video_prompt_refs', 'storyboard_sheet', 'image', 'video_prompt', 'references'),
        buildEdge(workflow.id, payload.draftId, 'video_prompt__video', 'video_prompt', 'text', 'video', 'prompt'),
        buildEdge(workflow.id, payload.draftId, 'sheet__video_refs', 'storyboard_sheet', 'image', 'video', 'references'),
        buildEdge(workflow.id, payload.draftId, 'video_prompt__artifact', 'video_prompt', 'text', 'artifact', 'input'),
        buildEdge(workflow.id, payload.draftId, 'panels__artifact', 'panel_extract', 'panels', 'artifact', 'panels', { optional: true, optionalDependency: true }),
      ]
      const edgeResponse = await client.from('output_workflow_edges').insert(edges).select(outputWorkflowEdgeSelect)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)

      const childResponse = await client
        .from('output_requests')
        .insert({
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          workflow_id: workflow.id,
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
            screenplayAnimaticRole: 'storyboard_block',
            screenplayAnimaticSource,
            sequenceAnimaticRole: 'storyboard_block',
            parentRequestId: masterRequest.id,
            storyboardBlockId: blockId,
            storyboardBlockIndex: Number(block.index ?? 0) || childRequests.length + 1,
            sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
            sourceMasterWorkflowId: masterRequest.workflowId,
            readyToRun: true,
            createdFromManifestAt: now,
            block,
          },
        })
        .select(outputRequestSelect)
        .single()
      if (childResponse.error || !childResponse.data) throw new Error(childResponse.error?.message ?? 'Failed to create block request.')
      const child = mapOutputRequestRow(childResponse.data)
      childRequests.push(child)
      await client.rpc('refresh_output_request_status_projection', { p_request_id: child.id })
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
