import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputWorkflowEdgeSelect,
  outputRequestSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunSelect,
} from '../_shared/output-workflow.ts'
import {
  outputWorkflowRunStatusResponseSchema,
  sequenceAnimaticContinuityBlockDeriveRequestSchema,
  sequenceAnimaticContinuityBlockDeriveResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildSequenceAnimaticContinuityWorkflowGraph,
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

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function isTerminalStatus(value: unknown) {
  const status = readText(value)
  return ['completed', 'failed', 'cancelled'].includes(status)
}

function blockStateFromMetadata(metadata: Record<string, unknown>, storyboardBlockId: string) {
  return asRecord(asRecord(metadata.blockStates)[storyboardBlockId])
}

function initialContinuityBlockStates(manifest: Record<string, unknown>) {
  const blocks = readArray(manifest.blocks).map(asRecord).length > 0
    ? readArray(manifest.blocks).map(asRecord)
    : readArray(asRecord(manifest.shotBreakPlan).groups).map(asRecord)
  const now = new Date().toISOString()
  const states: Record<string, Record<string, unknown>> = {}
  blocks.forEach((block, index) => {
    const blockId = readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
    const shotIds = readStringArray(block.shotIds).length > 0 ? readStringArray(block.shotIds) : readStringArray(block.shotBreakIds)
    states[blockId] = {
      blockId,
      status: 'not_started',
      inputHash: sequenceAnimaticStableHash({ blockId, shotIds }),
      lastDeltaHash: '',
      warnings: [],
      error: '',
      createdAt: now,
      updatedAt: now,
    }
  })
  return states
}

async function repairContinuityPlanMergeEdges(admin: ReturnType<typeof createAdminClient>, workflowId: string) {
  const edgeResponse = await admin
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', workflowId)
    .like('source_node_key', 'continuity_block_%_plan')
    .like('target_node_key', 'continuity_block_%_merge')
  if (edgeResponse.error) throw new Error(edgeResponse.error.message)

  const repairs = ((edgeResponse.data ?? []) as Record<string, unknown>[])
    .map((edge) => ({
      id: readText(edge.id),
      metadata: asRecord(edge.metadata),
    }))
    .filter((edge) => edge.id && (edge.metadata.optional === true || edge.metadata.optionalDependency === true))

  await Promise.all(repairs.map(async (edge) => {
    const updateResponse = await admin
      .from('output_workflow_edges')
      .update({
        metadata: {
          ...edge.metadata,
          optional: false,
          optionalDependency: false,
          requiredDependency: true,
          repairedRequiredDependencyAt: new Date().toISOString(),
        },
      })
      .eq('id', edge.id)
    if (updateResponse.error) throw new Error(updateResponse.error.message)
  }))

  return repairs.length
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'derive-sequence-animatic-continuity-block')
    const admin = createAdminClient('derive-sequence-animatic-continuity-block')
    const payload = sequenceAnimaticContinuityBlockDeriveRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    if (readScreenplayAnimaticRole(asRecord(masterRequest.metadata)) !== 'master') {
      throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    }

    let continuityRequestRow: Record<string, unknown> | null = null
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
      continuityRequestRow = continuityResponse.data as Record<string, unknown>
    } else {
      const continuityResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .eq('parent_request_id', masterRequest.id)
        .order('created_at', { ascending: false })
        .limit(25)
      if (continuityResponse.error) throw new Error(continuityResponse.error.message)
      continuityRequestRow = ((continuityResponse.data ?? []) as Record<string, unknown>[])
        .find((row) => {
          const metadata = asRecord(row.metadata)
          return metadata.sequenceAnimaticStale !== true && readScreenplayAnimaticRole(metadata) === 'continuity_pack'
        }) ?? null
    }
    if (!continuityRequestRow) throw new HttpError(409, 'Prepare continuity before deriving a block.')
    const continuityRequest = mapOutputRequestRow(continuityRequestRow as never)
    if (!continuityRequest.workflowId) throw new HttpError(409, 'Continuity request has no workflow.')

    const artifactResponse = await admin
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', continuityRequest.workflowId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)
    const latestPackMetadata = ((artifactResponse.data ?? []) as Record<string, unknown>[])
      .map((row) => asRecord(row.metadata))
      .find((metadata) => readText(metadata.role) === 'sequence_animatic_continuity_pack') ?? {}
    const latestPack = asRecord(latestPackMetadata.continuityPack ?? latestPackMetadata.continuity_pack)
    const latestBlockState = blockStateFromMetadata(latestPack, payload.storyboardBlockId)
    if (payload.mode === 'derive' && readText(latestBlockState.status) === 'ready') {
      return json(sequenceAnimaticContinuityBlockDeriveResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        run: null,
        blockState: latestBlockState,
        reused: true,
      }))
    }

    const runningResponse = await admin
      .from('output_workflow_runs')
      .select(outputWorkflowRunSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', continuityRequest.workflowId)
      .order('created_at', { ascending: false })
      .limit(12)
    if (runningResponse.error) throw new Error(runningResponse.error.message)
    const activeRun = ((runningResponse.data ?? []) as Record<string, unknown>[])
      .find((row) => {
        const metadata = asRecord(row.metadata)
        return !isTerminalStatus(row.status)
          && readText(metadata.runIntent) === 'derive_continuity_block'
          && readText(metadata.storyboardBlockId) === payload.storyboardBlockId
      }) ?? null
    if (activeRun) {
      const metadata = asRecord(continuityRequest.metadata)
      return json(sequenceAnimaticContinuityBlockDeriveResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        run: null,
        blockState: blockStateFromMetadata(metadata, payload.storyboardBlockId),
        reused: true,
      }))
    }

    const nodeResponse = await admin
      .from('output_workflow_nodes')
      .select(outputWorkflowNodeSelect)
      .eq('workflow_id', continuityRequest.workflowId)
      .order('created_at', { ascending: true })
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    let workflowNodes = ((nodeResponse.data ?? []) as Record<string, unknown>[])
    let structureNode = workflowNodes
      .find((node) => {
        const config = asRecord(node.config)
        return readText(config.purpose) === 'sequence_animatic_continuity_structure_artifact'
          && readText(config.storyboardBlockId) === payload.storyboardBlockId
      }) ?? null
    if (!structureNode) {
      const [masterArtifactResponse, edgeResponse] = await Promise.all([
        admin
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', payload.projectId)
          .eq('draft_id', payload.draftId)
          .eq('workflow_id', masterRequest.workflowId)
          .order('created_at', { ascending: false })
          .limit(20),
        admin
          .from('output_workflow_edges')
          .select(outputWorkflowEdgeSelect)
          .eq('workflow_id', continuityRequest.workflowId)
          .order('created_at', { ascending: true }),
      ])
      if (masterArtifactResponse.error) throw new Error(masterArtifactResponse.error.message)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      const manifestArtifact = ((masterArtifactResponse.data ?? []) as Record<string, unknown>[])
        .find((row) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
      const manifest = asRecord(asRecord(asRecord(manifestArtifact).metadata).manifest)
      if (Object.keys(manifest).length === 0) {
        throw new HttpError(409, 'Generate the screenplay animatic master first; no manifest is available for continuity workflow repair.')
      }
      const manifestHash = sequenceAnimaticStableHash(manifest)
      const masterManifestArtifactKey = readText(asRecord(manifestArtifact).key)
      const continuityMetadata = asRecord(continuityRequest.metadata)
      const screenplayAnimaticSource = readText(continuityMetadata.screenplayAnimaticSource) || readText(asRecord(masterRequest.metadata).screenplayAnimaticSource) || 'wiki_sequence_unit'
      const generated = buildSequenceAnimaticContinuityWorkflowGraph({
        workflowId: continuityRequest.workflowId,
        draftId: payload.draftId,
        commonConfig: {
          cinematicPipelineVersion: 'v3_script_storyboards',
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'continuity_pack',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'continuity_pack',
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          manifestHash,
          masterManifestArtifactKey,
        },
        manifest,
        assetPack: asRecord(manifest.assetPack),
        aspectRatio: readText(asRecord(manifest.assetPack).aspectRatio) || '16:9',
      })
      const existingNodeKeys = new Set(workflowNodes.map((node) => readText(node.key)).filter(Boolean))
      const existingEdgeKeys = new Set(((edgeResponse.data ?? []) as Record<string, unknown>[]).map((edge) => readText(edge.key)).filter(Boolean))
      const missingNodes = generated.nodes.filter((node) => !existingNodeKeys.has(readText(node.key)))
      const missingEdges = generated.edges.filter((edge) => !existingEdgeKeys.has(readText(edge.key)))
      if (missingNodes.length > 0) {
        const insertNodesResponse = await admin.from('output_workflow_nodes').insert(missingNodes)
        if (insertNodesResponse.error) throw new Error(insertNodesResponse.error.message)
      }
      if (missingEdges.length > 0) {
        const insertEdgesResponse = await admin.from('output_workflow_edges').insert(missingEdges)
        if (insertEdgesResponse.error) throw new Error(insertEdgesResponse.error.message)
      }
      if (missingNodes.length > 0 || missingEdges.length > 0 || Object.keys(asRecord(continuityMetadata.blockStates)).length === 0) {
        await admin
          .from('output_requests')
          .update({
            metadata: {
              ...continuityMetadata,
              graphSpecVersion: sequenceAnimaticGraphSpecVersion,
              manifestHash: readText(continuityMetadata.manifestHash) || manifestHash,
              masterManifestArtifactKey: readText(continuityMetadata.masterManifestArtifactKey) || masterManifestArtifactKey,
              blockStates: Object.keys(asRecord(continuityMetadata.blockStates)).length > 0 ? asRecord(continuityMetadata.blockStates) : initialContinuityBlockStates(manifest),
              pendingDeltas: asRecord(continuityMetadata.pendingDeltas),
              continuityGraphStatus: readText(continuityMetadata.continuityGraphStatus) || 'empty',
              repairedContinuityStructureGraphAt: new Date().toISOString(),
            },
          })
          .eq('id', continuityRequest.id)
      }
      if (missingNodes.length > 0 || missingEdges.length > 0) {
        console.info('[GraphCore] repaired legacy sequence animatic continuity workflow with missing block structure nodes.', {
          masterRequestId: masterRequest.id,
          continuityRequestId: continuityRequest.id,
          workflowId: continuityRequest.workflowId,
          insertedNodes: missingNodes.length,
          insertedEdges: missingEdges.length,
        })
      }
      const repairedNodeResponse = await admin
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', continuityRequest.workflowId)
        .order('created_at', { ascending: true })
      if (repairedNodeResponse.error) throw new Error(repairedNodeResponse.error.message)
      workflowNodes = ((repairedNodeResponse.data ?? []) as Record<string, unknown>[])
      structureNode = workflowNodes
        .find((node) => {
          const config = asRecord(node.config)
          return readText(config.purpose) === 'sequence_animatic_continuity_structure_artifact'
            && readText(config.storyboardBlockId) === payload.storyboardBlockId
        }) ?? null
    }
    if (!structureNode) throw new HttpError(404, 'Continuity structure node for this block was not found after automatic workflow repair. Prepare continuity again to rebuild this sidecar.')
    const structureNodeKey = readText(structureNode.key)
    const blockIndex = Number(asRecord(structureNode.config).storyboardBlockIndex) || Number(readText(structureNodeKey).match(/continuity_block_(\d+)_structure/)?.[1]) || 0
    const blockSuffix = blockIndex > 0 ? String(blockIndex).padStart(3, '0') : readText(structureNodeKey).match(/continuity_block_(\d+)_structure/)?.[1] ?? ''
    const planNodeKey = blockSuffix ? `continuity_block_${blockSuffix}_plan` : ''
    const mergeNodeKey = blockSuffix ? `continuity_block_${blockSuffix}_merge` : ''

    const repairedPlanMergeEdgeCount = await repairContinuityPlanMergeEdges(admin, continuityRequest.workflowId)
    if (repairedPlanMergeEdgeCount > 0) {
      console.info('[GraphCore] repaired sequence animatic continuity block plan-to-merge dependencies.', {
        masterRequestId: masterRequest.id,
        continuityRequestId: continuityRequest.id,
        workflowId: continuityRequest.workflowId,
        repairedEdges: repairedPlanMergeEdgeCount,
      })
    }

    const now = new Date().toISOString()
    const metadata = asRecord(continuityRequest.metadata)
    const blockStates = {
      ...asRecord(metadata.blockStates),
      [payload.storyboardBlockId]: {
        ...blockStateFromMetadata(metadata, payload.storyboardBlockId),
        blockId: payload.storyboardBlockId,
        status: 'deriving',
        error: '',
        updatedAt: now,
      },
    }
    const updateResponse = await admin
      .from('output_requests')
      .update({
        status: 'running',
        error_message: null,
        metadata: {
          ...metadata,
          blockStates,
          continuityGraphStatus: metadata.continuityGraphStatus ?? 'partial',
          lastContinuityBlockDeriveStartedAt: now,
        },
      })
      .eq('id', continuityRequest.id)
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    await admin.rpc('refresh_output_request_status_projection', { p_request_id: continuityRequest.id })

    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/start-output-workflow-run`
    const startResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: request.headers.get('authorization') ?? '',
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
      body: JSON.stringify({
        projectId: payload.projectId,
        draftId: payload.draftId,
        workflowId: continuityRequest.workflowId,
        prompt: continuityRequest.prompt || `Derive continuity for storyboard block ${payload.storyboardBlockId}.`,
        targetFormat: 'video',
        input: {
          sourceEntityKeys: masterRequest.selectedEntityKeys,
          sourceSequenceUnitKeys: masterRequest.selectedSequenceUnitKeys,
        },
        metadata: {
          runIntent: 'derive_continuity_block',
          runMode: 'sequence_animatic_continuity_block',
          runScope: 'upstream_to_node',
          allowStaleUpstreamOutputs: true,
          targetNodeKeys: [structureNodeKey],
          forceNodeKeys: [planNodeKey, mergeNodeKey, structureNodeKey].filter(Boolean),
          parentRequestId: masterRequest.id,
          continuityRequestId: continuityRequest.id,
          storyboardBlockId: payload.storyboardBlockId,
          deriveMode: payload.mode,
        },
      }),
    })
    const startPayload = await startResponse.json().catch(() => ({}))
    if (!startResponse.ok) {
      throw new HttpError(startResponse.status, readText(asRecord(startPayload).message) || 'Failed to start block continuity derivation.')
    }
    const started = outputWorkflowRunStatusResponseSchema.parse(startPayload)
    const updatedRequest = {
      ...continuityRequest,
      status: 'running' as const,
      latestRunId: started.run.id,
      metadata: {
        ...metadata,
        blockStates,
      },
    }
    return json(sequenceAnimaticContinuityBlockDeriveResponseSchema.parse({
      ok: true,
      masterRequest,
      continuityRequest: updatedRequest,
      run: started.run,
      blockState: asRecord(blockStates[payload.storyboardBlockId]),
      reused: false,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to derive sequence animatic continuity block.')
  }
})
