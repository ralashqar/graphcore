import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import type {
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  buildSequenceAnimaticContinuityAssetPrompt,
  buildSequenceAnimaticContinuityBatchPrompt,
} from './output-workflow-sequence-animatic-continuity-asset-runtime.ts'
import {
  scopeAssetPackToReferenceAssetKeys,
  sequenceAnimaticReferenceRole,
} from './output-workflow-sequence-animatic-reference-runtime.ts'
import {
  analyzeSequenceAnimaticZonePoiLabels,
  failedSequenceAnimaticZonePoiAnalysis,
  mergeZonePoiAnalysisIntoAssetState,
  type SequenceAnimaticZonePoiAnalysis,
} from './sequence-animatic-zone-poi-analysis.ts'

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}

async function latestContinuityAssetStateByNodeId(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  config: Record<string, unknown>,
) {
  const continuityPack = helpers.asRecord(config.continuityPack ?? config.continuity_pack)
  const stateByNodeId: Record<string, Record<string, unknown>> = {}
  Object.entries(helpers.asRecord(continuityPack.assetStateByNodeId ?? continuityPack.asset_state_by_node_id)).forEach(([nodeId, state]) => {
    const cleanNodeId = helpers.readText(nodeId)
    const record = helpers.asRecord(state)
    if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
  })

  const continuityWorkflowId = helpers.readText(config.continuityWorkflowId)
  const continuityRequestId = helpers.readText(config.continuityRequestId ?? config.continuity_request_id)
  const masterRequestId = helpers.readText(config.masterRequestId ?? config.master_request_id)
  const draftId = helpers.readText(helpers.asRecord(context.run).draftId)
  const workflowIds = new Set<string>()
  if (continuityWorkflowId) workflowIds.add(continuityWorkflowId)

  try {
    const client = context.client as any
    const parentRequestIds = [...new Set([continuityRequestId, masterRequestId].map(helpers.readText).filter(Boolean))]
    if (parentRequestIds.length > 0 && draftId) {
      const childResponse = await client
        .from('output_requests')
        .select('id, workflow_id, metadata, created_at')
        .eq('draft_id', draftId)
        .in('parent_request_id', parentRequestIds)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!childResponse.error) {
        ;(childResponse.data ?? []).forEach((row: unknown) => {
          const record = helpers.asRecord(row)
          const metadata = helpers.asRecord(record.metadata)
          const role = helpers.readText(metadata.screenplayAnimaticRole) || helpers.readText(metadata.sequenceAnimaticRole)
          const workflowId = helpers.readText(record.workflow_id)
          if ((role === 'continuity_asset' || role === 'continuity_asset_batch') && workflowId) workflowIds.add(workflowId)
        })
      }
    }
    if (workflowIds.size === 0 || !draftId) return stateByNodeId

    const response = await client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect)
      .eq('draft_id', draftId)
      .in('workflow_id', [...workflowIds])
      .order('updated_at', { ascending: false })
      .limit(150)
    if (response.error) return stateByNodeId

    ;[...(response.data ?? [])].reverse().forEach((row) => {
      const metadata = helpers.asRecord(helpers.asRecord(row).metadata)
      const role = helpers.readText(metadata.role)
      if (role === 'sequence_animatic_continuity_pack') {
        const pack = helpers.asRecord(metadata.continuityPack ?? metadata.continuity_pack)
        Object.entries(helpers.asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id)).forEach(([nodeId, state]) => {
          const cleanNodeId = helpers.readText(nodeId)
          const record = helpers.asRecord(state)
          if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
        })
      } else if (role === 'sequence_animatic_continuity_asset') {
        const state = helpers.asRecord(metadata.assetState ?? metadata.asset_state)
        const nodeId = helpers.readText(state.sourceNodeId) || helpers.readText(metadata.targetNodeId)
        if (nodeId && Object.keys(state).length > 0) stateByNodeId[nodeId] = state
      } else if (role === 'sequence_animatic_continuity_asset_batch') {
        Object.entries(helpers.asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, state]) => {
          const cleanNodeId = helpers.readText(nodeId)
          const record = helpers.asRecord(state)
          if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
        })
      }
    })
  } catch {
    return stateByNodeId
  }

  return stateByNodeId
}

function assetKeyForContinuityNodeState(
  stateByNodeId: Record<string, Record<string, unknown>>,
  nodeId: string,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.readText(helpers.asRecord(stateByNodeId[nodeId]).assetKey)
}

function parentZoneIdForTargetNode(targetNode: Record<string, unknown>, helpers: SequenceAnimaticWorkflowNodePackHelpers) {
  return helpers.readText(targetNode.zoneId ?? targetNode.zone_id)
    || helpers.readText(targetNode.parentZoneId ?? targetNode.parent_zone_id)
    || helpers.readText(targetNode.parentId ?? targetNode.parent_id)
}

function spotIdForTargetNode(targetNode: Record<string, unknown>, helpers: SequenceAnimaticWorkflowNodePackHelpers) {
  return helpers.readText(targetNode.spotId ?? targetNode.spot_id)
    || helpers.readStringArray(targetNode.spotIds ?? targetNode.spot_ids)[0]
    || helpers.readText(targetNode.parentId ?? targetNode.parent_id)
    || helpers.readText(targetNode.id)
}

function latestSpatialReferenceAssetKeys(input: {
  assetKind: string
  targetNode: Record<string, unknown>
  targetNodes?: Record<string, unknown>[]
  batchKind?: string
  stateByNodeId: Record<string, Record<string, unknown>>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
}) {
  const keys: string[] = []
  if (Object.keys(input.stateByNodeId).length === 0) return null
  const targetNodes = input.targetNodes && input.targetNodes.length > 0 ? input.targetNodes : [input.targetNode]
  const addNodeKey = (nodeId: string) => {
    const key = assetKeyForContinuityNodeState(input.stateByNodeId, nodeId, input.helpers)
    if (key) keys.push(key)
  }

  if (input.assetKind === 'location_spot') {
    targetNodes.slice(0, 1).forEach((node) => addNodeKey(parentZoneIdForTargetNode(node, input.helpers)))
    return [...new Set(keys)].slice(0, 1)
  }

  if (input.batchKind === 'spot_grid' || input.batchKind === 'spot_atlas_grid') {
    targetNodes.forEach((node) => addNodeKey(parentZoneIdForTargetNode(node, input.helpers)))
    return [...new Set(keys)].slice(0, 4)
  }

  if (input.assetKind === 'spot_camera_grid' || input.batchKind === 'angle_grid' || input.batchKind === 'viewpoint_grid') {
    targetNodes.forEach((node) => {
      addNodeKey(parentZoneIdForTargetNode(node, input.helpers))
      addNodeKey(spotIdForTargetNode(node, input.helpers))
    })
    return [...new Set(keys)].slice(0, 6)
  }

  return null
}

export async function sequenceAnimaticContinuityAssetInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const targetNode = helpers.asRecord(config.targetNode)
  const continuityPack = helpers.asRecord(config.continuityPack)
  const relevantShots = helpers.readArray(config.relevantShots).map(helpers.asRecord)
  const shotBindings = helpers.asRecord(config.shotBindings)
  const assetPack = helpers.asRecord(config.assetPack)
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map(helpers.readText)
    .filter(Boolean)
  const referenceAssetKeys = upstreamReferenceAssetKeys.length > 0 ? upstreamReferenceAssetKeys : helpers.readStringArray(config.referenceAssetKeys)
  const outputs = {
    continuityPack,
    continuity_pack: continuityPack,
    targetNode,
    target_node: targetNode,
    relevantShots,
    relevant_shots: relevantShots,
    shotBindings,
    shot_bindings: shotBindings,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    text: JSON.stringify({
      targetNode,
      relevantShotCount: relevantShots.length,
      referenceAssetKeys,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-asset-input-v1' })
}

export async function sequenceAnimaticContinuityBatchInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const batch = helpers.asRecord(config.batch)
  const targetNodes = helpers.readArray(config.targetNodes).map(helpers.asRecord)
  const relevantShots = helpers.readArray(config.relevantShots).map(helpers.asRecord)
  const shotBindings = helpers.asRecord(config.shotBindings)
  const assetPack = helpers.asRecord(config.assetPack)
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys)
  const gridLayout = helpers.asRecord(batch.gridLayout ?? batch.grid_layout ?? batch.layout)
  const cellRoles = helpers.readStringArray(batch.cellRoles ?? batch.cell_roles)
  const outputs = {
    batch,
    targetNodes,
    target_nodes: targetNodes,
    relevantShots,
    relevant_shots: relevantShots,
    shotBindings,
    shot_bindings: shotBindings,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    gridLayout,
    grid_layout: gridLayout,
    cellRoles,
    cell_roles: cellRoles,
    text: JSON.stringify({
      batchId: helpers.readText(batch.batchId),
      batchKind: helpers.readText(batch.batchKind),
      targetNodeIds: helpers.readStringArray(batch.targetNodeIds),
      generationPolicy: helpers.readText(batch.generationPolicy),
      gridLayout,
      cellRoles,
      referenceAssetKeys,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-batch-input-v1' })
}

export async function sequenceAnimaticContinuityBatchPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const batch = helpers.readFirstUpstreamRecord(context.upstream, ['batch'])
  const targetNodes = helpers.readFirstUpstreamArray(context.upstream, ['targetNodes', 'target_nodes']).map(helpers.asRecord)
  const relevantShots = helpers.readFirstUpstreamArray(context.upstream, ['relevantShots', 'relevant_shots']).map(helpers.asRecord)
  const upstreamAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const assetPack = Object.keys(upstreamAssetPack).length > 0 ? upstreamAssetPack : helpers.asRecord(config.assetPack)
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map(helpers.readText)
    .filter(Boolean)
  const configuredReferenceAssetKeys = upstreamReferenceAssetKeys.length > 0
    ? upstreamReferenceAssetKeys
    : helpers.readStringArray(config.referenceAssetKeys)
  const effectiveBatch = Object.keys(batch).length > 0 ? batch : helpers.asRecord(config.batch)
  const batchKind = helpers.readText(effectiveBatch.batchKind ?? effectiveBatch.batch_kind)
  const fallbackTargetNodes = helpers.readArray(config.targetNodes).map(helpers.asRecord)
  const effectiveTargetNodes = targetNodes.length > 0 ? targetNodes : fallbackTargetNodes
  const latestStateByNodeId = await latestContinuityAssetStateByNodeId(context, helpers, config)
  const latestReferenceAssetKeys = latestSpatialReferenceAssetKeys({
    assetKind: helpers.readText(helpers.asRecord(effectiveTargetNodes[0] ?? {}).assetKind ?? helpers.asRecord(effectiveTargetNodes[0] ?? {}).nodeKind),
    targetNode: helpers.asRecord(effectiveTargetNodes[0] ?? {}),
    targetNodes: effectiveTargetNodes,
    batchKind,
    stateByNodeId: latestStateByNodeId,
    helpers,
  })
  const referenceAssetKeys = latestReferenceAssetKeys ?? configuredReferenceAssetKeys
  const spatialBatch = [
    'angle_grid',
    'viewpoint_grid',
    'parent_child_scaffold_grid',
    'spot_grid',
    'spot_atlas_grid',
    'viewpoint_atlas_grid',
    'location_zone_board',
  ].includes(batchKind)
  const scopedAssetPack = spatialBatch
    ? scopeAssetPackToReferenceAssetKeys({
      assetPack,
      referenceAssetKeys,
      fallbackEntities: [],
      referenceScope: 'sequence_animatic_spatial_continuity_only',
      limit: 8,
    })
    : assetPack
  const promptResult = buildSequenceAnimaticContinuityBatchPrompt({
    batch: effectiveBatch,
    targetNodes: effectiveTargetNodes,
    relevantShots,
    referenceAssetKeys,
    worldLocationVisualGuide: batchKind === 'spot_grid' || batchKind === 'spot_atlas_grid' || batchKind === 'angle_grid' || batchKind === 'viewpoint_grid'
      ? ''
      : helpers.readText(config.worldLocationVisualGuide ?? config.world_location_visual_guide),
    visualCanonGuard: helpers.readText(config.visualCanonGuard ?? config.visual_canon_guard),
  })
  const prompt = promptResult.prompt
  const outputs = {
    prompt,
    text: prompt,
    batch: effectiveBatch,
    targetNodes: effectiveTargetNodes,
    target_nodes: effectiveTargetNodes,
    sanitizedTargetNodes: promptResult.sanitizedTargetNodes,
    sanitized_target_nodes: promptResult.sanitizedTargetNodes,
    locationEvidenceLines: promptResult.locationEvidenceLines,
    location_evidence_lines: promptResult.locationEvidenceLines,
    promptDiagnostics: promptResult.promptDiagnostics,
    prompt_diagnostics: promptResult.promptDiagnostics,
    relevantShots,
    relevant_shots: relevantShots,
    assetPack: scopedAssetPack,
    asset_pack: scopedAssetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-batch-prompt-v1' })
}

export async function sequenceAnimaticContinuityBatchExtract(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const batch = helpers.readFirstUpstreamRecord(context.upstream, ['batch'])
  const targetNodes = helpers.readFirstUpstreamArray(context.upstream, ['targetNodes', 'target_nodes']).map(helpers.asRecord)
  const image = helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {}
  const assetKey = helpers.readText(image.assetKey)
  const storagePath = helpers.readText(image.storagePath) || helpers.readText(image.storage_path)
  if (!assetKey || !storagePath) throw new Error('Continuity batch extraction requires a generated batch image.')
  const effectiveBatch = Object.keys(batch).length > 0 ? batch : helpers.asRecord(config.batch)
  const batchKind = helpers.readText(effectiveBatch.batchKind)
  const latestStateByNodeId = await latestContinuityAssetStateByNodeId(context, helpers, config)
  const latestReferenceAssetKeys = latestSpatialReferenceAssetKeys({
    assetKind: helpers.readText(helpers.asRecord(targetNodes[0] ?? {}).assetKind ?? helpers.asRecord(targetNodes[0] ?? {}).nodeKind),
    targetNode: helpers.asRecord(targetNodes[0] ?? {}),
    targetNodes,
    batchKind,
    stateByNodeId: latestStateByNodeId,
    helpers,
  })
  const batchReferenceAssetKeys = latestReferenceAssetKeys ?? helpers.readStringArray(config.referenceAssetKeys)
  const layout = helpers.asRecord(effectiveBatch.layout)
  const rows = Math.max(1, Number(layout.rows ?? 1) || 1)
  const columns = Math.max(1, Number(layout.columns ?? 1) || 1)
  const generationPolicy = helpers.readText(effectiveBatch.generationPolicy ?? effectiveBatch.generation_policy ?? helpers.asRecord(config.batch).generationPolicy)
  const strictSpotAtlasGrid = batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid' || generationPolicy === 'spot_atlas_grid_rectangular_ref_v3'
  const referenceImageCount = Number(helpers.asRecord(image).referenceImageCount ?? helpers.asRecord(image).reference_image_count ?? 0) || 0
  if (strictSpotAtlasGrid && generationPolicy !== 'spot_atlas_grid_rectangular_ref_v3') {
    throw new Error(`Spot atlas extraction rejected obsolete generation policy "${generationPolicy || 'missing'}". Regenerate with spot_atlas_grid_rectangular_ref_v3.`)
  }
  if (strictSpotAtlasGrid && referenceImageCount < 1) {
    throw new Error('Spot atlas extraction rejected image with no parent zone map reference. Regenerate the spot atlas from the zone map.')
  }
  const mimeType = helpers.readText(image.mimeType) || helpers.readText(image.mime_type) || 'image/webp'
  const sourceBytes = await helpers.downloadProjectAssetBytes(context.client, storagePath)
  const tempDir = await helpers.makeTempDir('graphcore-continuity-batch-')
  const sourceExt = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'webp'
  const sourcePath = `${tempDir}/source.${sourceExt}`
  const extractedAssets: Record<string, unknown>[] = []
  const assetStateByNodeId: Record<string, unknown> = {}
  try {
    await helpers.writeFile(sourcePath, sourceBytes)
    const size = await helpers.probeImageSize(sourcePath)
    if (!size) throw new Error('Continuity batch extraction could not read generated image dimensions.')
    if (strictSpotAtlasGrid) {
      const expectedWidth = Math.max(1024, Math.min(4096, columns * 1024))
      const expectedHeight = Math.max(1024, Math.min(4096, rows * 1024))
      if (size.width !== expectedWidth || size.height !== expectedHeight) {
        throw new Error(`Spot atlas extraction rejected ${size.width}x${size.height} source for ${rows}x${columns} layout; expected ${expectedWidth}x${expectedHeight}.`)
      }
    }
    for (let index = 0; index < targetNodes.length; index += 1) {
      const targetNode = targetNodes[index]
      const targetNodeId = helpers.readText(targetNode.id)
      if (!targetNodeId) continue
      const row = Math.floor(index / columns)
      const column = index % columns
      if (row >= rows) break
      const cropX = Math.floor((size.width * column) / columns)
      const cropY = Math.floor((size.height * row) / rows)
      const nextX = Math.floor((size.width * (column + 1)) / columns)
      const nextY = Math.floor((size.height * (row + 1)) / rows)
      const cellWidth = Math.max(1, Math.min(size.width - cropX, nextX - cropX))
      const cellHeight = Math.max(1, Math.min(size.height - cropY, nextY - cropY))
      if (strictSpotAtlasGrid && (cellWidth !== 1024 || cellHeight !== 1024)) {
        throw new Error(`Spot atlas extraction rejected ${cellWidth}x${cellHeight} cell for ${rows}x${columns} layout; expected 1024x1024 cells.`)
      }
      const outputPath = `${tempDir}/${helpers.slugify(targetNodeId)}.webp`
      const crop = await helpers.runFfmpeg(['-y', '-i', sourcePath, '-vf', `crop=${cellWidth}:${cellHeight}:${cropX}:${cropY}`, outputPath])
      if (!crop.ok) throw new Error(`Continuity batch crop failed for ${targetNodeId}: ${crop.stderr.slice(0, 1200)}`)
      const cropVerification = await helpers.verifySequenceAnimaticAnchorCrop({
        outputPath,
        anchorId: targetNodeId,
        expectedWidth: cellWidth,
        expectedHeight: cellHeight,
        row,
        column,
      })
      const bytes = await helpers.readFile(outputPath)
      const targetAssetKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(targetNodeId)}.sequence-animatic-continuity-asset`
      const targetStoragePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/continuity-${helpers.slugify(targetNodeId)}.webp`
      await helpers.uploadBytes(context.client, targetStoragePath, bytes, 'image/webp')
      const artifact = await helpers.registerImageArtifact({
        client: context.client,
        run: context.run,
        workflow: context.workflow,
        node: context.node,
        assetKey: targetAssetKey,
        storagePath: targetStoragePath,
        name: `${helpers.readText(targetNode.name) || helpers.titleFromRefLike(targetNodeId)} Continuity Reference`,
        summary: 'Cropped continuity reference generated from an animatic scene-graph batch.',
        mimeType: 'image/webp',
        metadata: {
          generatedBy: 'output_workflow',
          workflowId: context.workflow.id,
          workflowKey: context.workflow.key,
          runId: context.run.id,
          nodeId: context.node.id,
          nodeKey: context.node.key,
          provider: 'graphcore',
          model: 'ffmpeg-sequence-animatic-continuity-batch-extract-v1',
          role: 'sequence_animatic_continuity_asset_image',
          sequenceAnimaticRole: 'continuity_asset_batch',
          masterRequestId: helpers.readText(config.masterRequestId),
          continuityBatchId: helpers.readText(helpers.asRecord(config.batch).batchId),
          generationPolicy: helpers.readText(helpers.asRecord(config.batch).generationPolicy),
          gridLayout: helpers.asRecord(helpers.asRecord(config.batch).gridLayout ?? helpers.asRecord(config.batch).layout),
          cellRole: helpers.readStringArray(helpers.asRecord(config.batch).cellRoles)[index] || '',
          targetNodeId,
          targetNode,
          sourceBatchAssetKey: assetKey,
          sourceBatchStoragePath: storagePath,
          row,
          column,
          cropRect: { x: cropX, y: cropY, width: cellWidth, height: cellHeight },
          cropVerification,
          storageBucket: 'project-assets',
          storagePath: targetStoragePath,
        },
      })
      const state = helpers.sequenceAnimaticContinuityAssetStateParse({
        status: 'ready',
        inputHash: helpers.readText(config.continuityBatchHash) || helpers.readText(config.assetInputHash) || helpers.hashOutputWorkflowValue({ targetNode, assetKey }),
        assetKey: targetAssetKey,
        artifactKey: artifact.key,
        prompt: helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text']),
        referenceAssetKeys: batchReferenceAssetKeys,
        generationPolicy,
        batchKind,
        gridLayout: layout,
        referenceImageCount,
        sourceNodeId: targetNodeId,
        parentNodeId: helpers.readText(targetNode.parentId ?? targetNode.parent_id),
        sourceSpotId: helpers.readText(targetNode.spotId ?? targetNode.spot_id ?? targetNode.parentId ?? targetNode.parent_id),
        sourceZoneId: helpers.readText(targetNode.zoneId ?? targetNode.zone_id),
        sourceSetId: helpers.readText(targetNode.setId ?? targetNode.set_id),
        assetKind: helpers.readText(targetNode.assetKind) || helpers.readText(targetNode.nodeKind) || 'continuity_asset',
        generatedAt: new Date().toISOString(),
        warnings: [],
        error: '',
        name: helpers.readText(targetNode.name),
        summary: helpers.readText(targetNode.summary) || helpers.readText(targetNode.visualBrief),
      })
      assetStateByNodeId[targetNodeId] = state
      extractedAssets.push({
        targetNodeId,
        targetNode,
        assetKey: targetAssetKey,
        storagePath: targetStoragePath,
        artifactKey: artifact.key,
        image: { assetKey: targetAssetKey, storagePath: targetStoragePath, mimeType: 'image/webp', artifact },
        assetState: state,
        cropRect: { x: cropX, y: cropY, width: cellWidth, height: cellHeight },
        cropVerification,
      })
    }
  } finally {
    await helpers.removeDir(tempDir)
  }
  const outputs = {
    assets: extractedAssets,
    extractedAssets,
    extracted_assets: extractedAssets,
    assetStateByNodeId,
    asset_state_by_node_id: assetStateByNodeId,
    batch: effectiveBatch,
    targetNodes,
    target_nodes: targetNodes,
    sourceImage: image,
    source_image: image,
    text: `Extracted ${extractedAssets.length} continuity reference crop${extractedAssets.length === 1 ? '' : 's'}.`,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-batch-extract-v1' })
}

export async function sequenceAnimaticContinuityAssetPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamTargetNode = helpers.readFirstUpstreamRecord(context.upstream, ['targetNode', 'target_node'])
  const targetNode = Object.keys(upstreamTargetNode).length > 0 ? upstreamTargetNode : helpers.asRecord(config.targetNode)
  const sceneGraphOverride = helpers.asRecord(targetNode.sceneGraphOverride ?? targetNode.scene_graph_override ?? config.sceneGraphOverride ?? config.scene_graph_override)
  const visualBriefOverride = helpers.readText(sceneGraphOverride.visualBriefOverride)
  const extraPromptDirection = helpers.readText(sceneGraphOverride.extraPromptDirection)
  const relevantShots = helpers.readFirstUpstreamArray(context.upstream, ['relevantShots', 'relevant_shots']).map(helpers.asRecord)
  const upstreamAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const assetPack = Object.keys(upstreamAssetPack).length > 0 ? upstreamAssetPack : helpers.asRecord(config.assetPack)
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map(helpers.readText)
    .filter(Boolean)
  const assetKind = helpers.readText(config.assetKind) || helpers.readText(targetNode.assetKind) || helpers.readText(targetNode.nodeKind) || 'continuity_asset'
  const configuredReferenceAssetKeys = upstreamReferenceAssetKeys.length > 0 ? upstreamReferenceAssetKeys : helpers.readStringArray(config.referenceAssetKeys)
  const latestStateByNodeId = await latestContinuityAssetStateByNodeId(context, helpers, config)
  const latestReferenceAssetKeys = latestSpatialReferenceAssetKeys({
    assetKind,
    targetNode,
    stateByNodeId: latestStateByNodeId,
    helpers,
  })
  const referenceAssetKeys = latestReferenceAssetKeys ?? configuredReferenceAssetKeys
  if (assetKind === 'location_spot' && referenceAssetKeys.length < 1) {
    throw new Error('Spot continuity asset prompt requires a ready parent zone image reference. Generate or regenerate the parent zone first.')
  }
  const spatialAsset = ['location_set', 'location_zone', 'location_spot', 'location_angle', 'location_viewpoint'].includes(assetKind)
  const scopedAssetPack = spatialAsset
    ? scopeAssetPackToReferenceAssetKeys({
      assetPack,
      referenceAssetKeys,
      fallbackEntities: [],
      referenceScope: 'sequence_animatic_spatial_continuity_only',
      limit: 8,
    })
    : assetPack
  const effectiveTargetNode = visualBriefOverride
    ? { ...targetNode, visualBrief: visualBriefOverride, summary: visualBriefOverride }
    : targetNode
  const promptResult = buildSequenceAnimaticContinuityAssetPrompt({
    targetNode: effectiveTargetNode,
    assetKind,
    generationPolicy: helpers.readText(config.generationPolicy),
    worldLocationVisualGuide: assetKind === 'location_spot' || assetKind === 'location_angle' || assetKind === 'location_viewpoint' || assetKind === 'spot_camera_grid'
      ? ''
      : helpers.readText(config.worldLocationVisualGuide ?? config.world_location_visual_guide),
    zoneMapPoiLines: helpers.readStringArray(config.zoneMapPoiLines ?? config.zone_map_poi_lines),
    relevantShots,
    referenceAssetKeys,
    visualCanonGuard: helpers.readText(config.visualCanonGuard ?? config.visual_canon_guard),
  })
  const prompt = [
    promptResult.prompt,
    visualBriefOverride ? `User-edited visual brief:\n${visualBriefOverride}` : '',
    extraPromptDirection ? `Additional user generation direction:\n${extraPromptDirection}` : '',
  ].filter(Boolean).join('\n\n')
  const outputs = {
    prompt,
    text: prompt,
    targetNode: effectiveTargetNode,
    target_node: effectiveTargetNode,
    sanitizedTargetNode: promptResult.sanitizedTargetNode,
    sanitized_target_node: promptResult.sanitizedTargetNode,
    locationEvidenceLines: promptResult.locationEvidenceLines,
    location_evidence_lines: promptResult.locationEvidenceLines,
    promptDiagnostics: promptResult.promptDiagnostics,
    prompt_diagnostics: promptResult.promptDiagnostics,
    sceneGraphOverride,
    scene_graph_override: sceneGraphOverride,
    relevantShots,
    relevant_shots: relevantShots,
    assetPack: scopedAssetPack,
    asset_pack: scopedAssetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-asset-prompt-v1' })
}

export async function sequenceAnimaticContinuityAssetArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamTargetNode = helpers.readFirstUpstreamRecord(context.upstream, ['targetNode', 'target_node'])
  const targetNode = Object.keys(upstreamTargetNode).length > 0 ? upstreamTargetNode : helpers.asRecord(config.targetNode)
  const image = helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const targetNodeId = helpers.readText(config.targetNodeId) || helpers.readText(targetNode.id)
  if (!targetNodeId) throw new Error('Continuity asset artifact requires a target node id.')
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Continuity asset image did not produce an asset key.')
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map(helpers.readText)
    .filter(Boolean)
  const referenceAssetKeys = upstreamReferenceAssetKeys.length > 0
    ? upstreamReferenceAssetKeys
    : helpers.readStringArray(config.referenceAssetKeys)
  const assetKind = helpers.readText(config.assetKind) || helpers.readText(targetNode.assetKind) || helpers.readText(targetNode.nodeKind) || 'continuity_asset'
  const referenceRole = sequenceAnimaticReferenceRole({
    role: assetKind,
    type: assetKind,
    name: helpers.readText(targetNode.name) || helpers.readText(targetNode.title),
  })
  const qcFindings = assetKey ? [] : ['Continuity asset image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  let assetState = helpers.sequenceAnimaticContinuityAssetStateParse({
    status: assetKey ? 'ready' : 'failed',
    inputHash: helpers.readText(config.assetInputHash) || helpers.sequenceAnimaticContinuityAssetTargetInputHash(targetNode),
    assetKey: assetKey || null,
    artifactKey: helpers.readText(helpers.asRecord(image.artifact).key) || null,
    prompt,
    referenceAssetKeys,
    sourceNodeId: targetNodeId,
    assetKind,
    generatedAt: new Date().toISOString(),
    warnings: qcFindings,
    error: assetKey ? '' : 'Continuity asset image did not produce an asset key.',
  })
  const storagePath = helpers.readText(image.storagePath) || helpers.readText(image.storage_path)
  const mimeType = helpers.readText(image.mimeType) || helpers.readText(image.mime_type) || 'image/webp'
  let zoneImagePoiAnalysis: SequenceAnimaticZonePoiAnalysis | null = null
  if (assetKind === 'location_zone' && assetKey && storagePath) {
    try {
      const packForAnalysis = helpers.asRecord(config.continuityPack ?? config.continuity_pack)
      zoneImagePoiAnalysis = await analyzeSequenceAnimaticZonePoiLabels({
        client: context.client as never,
        runVisionStructuredNode: helpers.runVisionStructuredNode,
        targetNodeId,
        targetNode,
        continuityPack: packForAnalysis,
        graphNodes: [],
        image: {
          assetKey,
          storagePath,
          mimeType,
        },
      })
    } catch (error) {
      zoneImagePoiAnalysis = failedSequenceAnimaticZonePoiAnalysis({
        targetNodeId,
        sourceAssetKey: assetKey,
        sourceStoragePath: storagePath,
        error,
      })
    }
    assetState = helpers.sequenceAnimaticContinuityAssetStateParse(mergeZonePoiAnalysisIntoAssetState({
      assetState,
      analysis: zoneImagePoiAnalysis,
    }))
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(targetNodeId)}.sequence-animatic-continuity-asset`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(targetNode.name) || helpers.titleFromRefLike(targetNodeId)} Continuity Asset`,
    summary: 'Node-scoped sequence animatic continuity asset generated from the evolving scene graph.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-continuity-asset-artifact-v1',
      role: 'sequence_animatic_continuity_asset',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'continuity_asset',
      masterRequestId: helpers.readText(config.masterRequestId),
      continuityRequestId: helpers.readText(config.continuityRequestId),
      worldLocationRefId: helpers.readText(config.worldLocationRefId),
      parentNodeIds: helpers.readStringArray(config.parentNodeIds),
      targetNodeId,
      assetKind,
      targetNode,
      prompt,
      referenceAssetKeys,
      qcStatus,
      qcFindings,
      assetState,
      zoneImagePoiAnalysis,
      zone_image_poi_analysis: zoneImagePoiAnalysis,
      zoneImagePoiAnchors: zoneImagePoiAnalysis?.anchors ?? [],
      zone_image_poi_anchors: zoneImagePoiAnalysis?.anchors ?? [],
      image,
      assetKey,
    },
  })

  const continuityWorkflowId = helpers.readText(config.continuityWorkflowId)
  if (continuityWorkflowId) {
    const client = context.client as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => unknown
        }
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
    const packQuery = client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect) as unknown as {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
          }
        }
      }
    }
    const latestPackResponse = await packQuery
      .eq('draft_id', context.run.draftId)
      .eq('workflow_id', continuityWorkflowId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!latestPackResponse.error) {
      const packRow = (latestPackResponse.data ?? []).find((row: unknown) => helpers.readText(helpers.asRecord(helpers.asRecord(row).metadata).role) === 'sequence_animatic_continuity_pack') ?? null
      if (packRow) {
        const packMetadata = helpers.asRecord(helpers.asRecord(packRow).metadata)
        const pack = helpers.asRecord(packMetadata.continuityPack ?? packMetadata.continuity_pack)
        const assetStateByNodeId = {
          ...helpers.asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
          [targetNodeId]: assetState,
        }
        const assetGenerationStatus = helpers.sequenceAnimaticAssetGenerationStatus(assetStateByNodeId)
        const nextPack = {
          ...pack,
          assetStateByNodeId,
          asset_state_by_node_id: assetStateByNodeId,
          assetGenerationStatus,
          asset_generation_status: assetGenerationStatus,
          anchorAssets: [
            ...helpers.readArray(pack.anchorAssets).map(helpers.asRecord).filter((entry) => helpers.readText(entry.id) !== targetNodeId),
            {
              ...targetNode,
              id: targetNodeId,
              anchorType: assetKind === 'temporary_character' ? 'character' : assetKind === 'prop' ? 'prop' : 'location_spot',
              type: assetKind === 'temporary_character' ? 'character' : assetKind === 'prop' ? 'prop' : 'location_spot',
              assetKey,
              artifactKey: artifact.key,
              prompt,
              referenceAssetKeys,
              ...(zoneImagePoiAnalysis
                ? {
                    zoneImagePoiAnalysis,
                    zone_image_poi_analysis: zoneImagePoiAnalysis,
                    zoneImagePoiAnchors: zoneImagePoiAnalysis.anchors,
                    zone_image_poi_anchors: zoneImagePoiAnalysis.anchors,
                  }
                : {}),
            },
          ].filter((entry) => helpers.readText(entry.assetKey)),
        }
        await client
          .from('output_artifacts')
          .update({
            metadata: {
              ...packMetadata,
              continuityPack: nextPack,
              continuity_pack: nextPack,
              assetStateByNodeId,
              asset_state_by_node_id: assetStateByNodeId,
              assetGenerationStatus,
              asset_generation_status: assetGenerationStatus,
              anchorAssets: nextPack.anchorAssets,
            },
          })
          .eq('id', helpers.readText(helpers.asRecord(packRow).id))
      }
    }
  }

  const globalAssetStatus = assetKey ? helpers.readText(image.globalAssetStatus ?? image.global_asset_status) || 'generated' : 'missing'
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    reference: {
      status: assetKey ? 'ready' : 'missing',
      assetKey: assetKey || null,
      artifactKey: artifact.key,
      role: referenceRole,
      sourceArtifactRole: 'sequence_animatic_continuity_asset',
      identityKey: 'targetNodeId',
      identityValue: targetNodeId,
      sourceSceneGraphNodeId: targetNodeId,
      globalAssetStatus,
    },
    continuityAsset: {
      targetNodeId,
      assetKind,
      assetState,
      image,
      zoneImagePoiAnalysis,
      zone_image_poi_analysis: zoneImagePoiAnalysis,
    },
    continuity_asset: {
      targetNodeId,
      assetKind,
      assetState,
      image,
      zoneImagePoiAnalysis,
      zone_image_poi_analysis: zoneImagePoiAnalysis,
    },
    assetState,
    asset_state: assetState,
    assetStateByNodeId: { [targetNodeId]: assetState },
    asset_state_by_node_id: { [targetNodeId]: assetState },
    targetNode,
    target_node: targetNode,
    image,
    keyframe: image,
    primaryReferenceImage: image,
    globalAssetStatus,
    global_asset_status: globalAssetStatus,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-asset-artifact-v1' })
}

export async function sequenceAnimaticContinuityBatchArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const batch = helpers.readFirstUpstreamRecord(context.upstream, ['batch'])
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const assets = helpers.readFirstUpstreamArray(context.upstream, ['assets', 'extractedAssets', 'extracted_assets']).map(helpers.asRecord)
  const upstreamState = helpers.readFirstUpstreamRecord(context.upstream, ['assetStateByNodeId', 'asset_state_by_node_id'])
  const batchId = helpers.readText(batch.batchId) || helpers.readText(config.continuityBatchId) || helpers.readText(helpers.asRecord(config.batch).batchId)
  if (!batchId) throw new Error('Continuity batch artifact requires a batch id.')
  const targetNodeIds = helpers.readStringArray(batch.targetNodeIds)
  const readyAssetCount = Object.values(upstreamState).map(helpers.asRecord).filter((state) => helpers.readText(state.assetKey)).length
  const qcFindings = targetNodeIds.length > 0 && readyAssetCount < targetNodeIds.length
    ? [`Continuity batch produced ${readyAssetCount} of ${targetNodeIds.length} expected crops.`]
    : []
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'needs_review'
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(batchId)}.sequence-animatic-continuity-batch`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(batch.batchKind) || 'Continuity'} Reference Batch`,
    summary: 'Batch of animatic scene-graph continuity references generated and cropped for downstream storyboard use.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-continuity-batch-artifact-v1',
      role: 'sequence_animatic_continuity_asset_batch',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'continuity_asset_batch',
      masterRequestId: helpers.readText(config.masterRequestId),
      continuityBatchId: batchId,
      batch,
      prompt,
      assets,
      qcStatus,
      qcFindings,
      generationPolicy: helpers.readText(batch.generationPolicy),
      gridLayout: helpers.asRecord(batch.gridLayout ?? batch.grid_layout ?? batch.layout),
      cellRoles: helpers.readStringArray(batch.cellRoles ?? batch.cell_roles),
      assetStateByNodeId: upstreamState,
      asset_state_by_node_id: upstreamState,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    batch,
    prompt,
    assets,
    extractedAssets: assets,
    extracted_assets: assets,
    assetStateByNodeId: upstreamState,
    asset_state_by_node_id: upstreamState,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-batch-artifact-v1' })
}

const sequenceAnimaticContinuityAssetHandlers = {
  sequence_animatic_continuity_asset_input: sequenceAnimaticContinuityAssetInput,
  sequence_animatic_continuity_batch_input: sequenceAnimaticContinuityBatchInput,
  sequence_animatic_continuity_batch_prompt: sequenceAnimaticContinuityBatchPrompt,
  sequence_animatic_continuity_batch_extract: sequenceAnimaticContinuityBatchExtract,
  sequence_animatic_continuity_asset_prompt: sequenceAnimaticContinuityAssetPrompt,
  sequence_animatic_continuity_asset_artifact: sequenceAnimaticContinuityAssetArtifact,
  sequence_animatic_continuity_batch_artifact: sequenceAnimaticContinuityBatchArtifact,
}

const sequenceAnimaticContinuityAssetWorkflowNodePackKey = 'sequence_animatic_continuity_asset'

export const sequenceAnimaticContinuityAssetWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticContinuityAssetHandlers
>({
  packKey: sequenceAnimaticContinuityAssetWorkflowNodePackKey,
  handlers: sequenceAnimaticContinuityAssetHandlers,
})

export const sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys = sequenceAnimaticContinuityAssetWorkflowNodePack.handlerKeys

function createSequenceAnimaticContinuityAssetNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticContinuityAssetHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic continuity asset workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticContinuityAssetWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

const continuityAssetProjectionMetadataKeys = [
  'activeManifestPurpose',
  'activeProgressLabel',
  'readyArtifactCount',
  'scopedAssetKeys',
  'recoveryHints',
]

export const sequenceAnimaticContinuityAssetWorkflowNodeScaffolds = [
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_asset_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.targetNode',
      'config.continuityPack',
      'config.relevantShots',
      'config.shotBindings',
      'config.assetPack',
      'config.referenceAssetKeys',
      'config.masterRequestId',
      'config.assetInputHash',
      'config.visualCanonGuardHash',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_batch_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.batch',
      'config.targetNodes',
      'config.relevantShots',
      'config.shotBindings',
      'config.assetPack',
      'config.referenceAssetKeys',
      'config.masterRequestId',
      'config.continuityBatchId',
      'config.visualCanonGuardHash',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_batch_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.batch',
      'upstream.targetNodes',
      'upstream.relevantShots',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'config.batch',
      'config.targetNodes',
      'config.assetPack',
      'config.masterRequestId',
      'config.visualCanonGuardHash',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_batch_extract',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.batch',
      'upstream.targetNodes',
      'upstream.image',
      'config.batch',
      'config.masterRequestId',
      'config.continuityBatchId',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_asset_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.targetNode',
      'upstream.relevantShots',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'config.targetNode',
      'config.assetPack',
      'config.masterRequestId',
      'config.assetInputHash',
      'config.visualCanonGuardHash',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_asset_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.targetNode',
      'upstream.image',
      'upstream.prompt',
      'config.targetNode',
      'config.assetInputHash',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
  createSequenceAnimaticContinuityAssetNodeScaffold({
    purpose: 'sequence_animatic_continuity_batch_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.batch',
      'upstream.assetStateByNodeId',
      'upstream.assets',
      'upstream.prompt',
      'config.batch',
      'config.continuityBatchId',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: continuityAssetProjectionMetadataKeys,
  }),
]

export const sequenceAnimaticContinuityAssetWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticContinuityAssetWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticContinuityAssetWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticContinuityAssetWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
