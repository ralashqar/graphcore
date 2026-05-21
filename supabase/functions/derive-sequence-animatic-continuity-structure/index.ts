import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunSelect,
} from '../_shared/output-workflow.ts'
import {
  outputWorkflowRunStatusResponseSchema,
  sequenceAnimaticContinuityStructureDeriveRequestSchema,
  sequenceAnimaticContinuityStructureDeriveResponseSchema,
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

function activeGlobalState(metadata: Record<string, unknown>, fallbackStatus = '') {
  const state = asRecord(metadata.globalStructureState)
  return {
    ...state,
    status: readText(state.status) || fallbackStatus,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'derive-sequence-animatic-continuity-structure')
    const admin = createAdminClient('derive-sequence-animatic-continuity-structure')
    const payload = sequenceAnimaticContinuityStructureDeriveRequestSchema.parse(await request.json())

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
    if (!continuityRequestRow) throw new HttpError(409, 'Prepare continuity before deriving continuity structure.')
    const continuityRequest = mapOutputRequestRow(continuityRequestRow as never)
    if (!continuityRequest.workflowId) throw new HttpError(409, 'Continuity request has no workflow.')

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
          && readText(metadata.runIntent) === 'derive_continuity_structure'
      }) ?? null
    if (activeRun) {
      return json(sequenceAnimaticContinuityStructureDeriveResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest,
        run: null,
        globalStructureState: activeGlobalState(asRecord(continuityRequest.metadata), 'deriving'),
        coverage: asRecord(asRecord(continuityRequest.metadata).continuityCoverage),
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
    let structureNode = workflowNodes.find((node) => readText(node.key) === 'continuity_global_structure') ?? null
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
              repairedContinuityGlobalStructureGraphAt: new Date().toISOString(),
            },
          })
          .eq('id', continuityRequest.id)
      }
      const repairedNodeResponse = await admin
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', continuityRequest.workflowId)
        .order('created_at', { ascending: true })
      if (repairedNodeResponse.error) throw new Error(repairedNodeResponse.error.message)
      workflowNodes = ((repairedNodeResponse.data ?? []) as Record<string, unknown>[])
      structureNode = workflowNodes.find((node) => readText(node.key) === 'continuity_global_structure') ?? null
    }
    if (!structureNode) throw new HttpError(404, 'Global continuity structure node was not found after automatic workflow repair. Prepare continuity again to rebuild this sidecar.')

    const now = new Date().toISOString()
    const metadata = asRecord(continuityRequest.metadata)
    const globalStructureState = {
      ...asRecord(metadata.globalStructureState),
      status: 'deriving',
      error: '',
      updatedAt: now,
    }
    const updateResponse = await admin
      .from('output_requests')
      .update({
        status: 'running',
        error_message: null,
        metadata: {
          ...metadata,
          globalStructureState,
          continuityGraphStatus: metadata.continuityGraphStatus ?? 'partial',
          lastContinuityStructureDeriveStartedAt: now,
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
        prompt: continuityRequest.prompt || `Derive global continuity structure for ${masterRequest.title || 'sequence animatic'}.`,
        targetFormat: 'video',
        input: {
          sourceEntityKeys: masterRequest.selectedEntityKeys,
          sourceSequenceUnitKeys: masterRequest.selectedSequenceUnitKeys,
        },
        metadata: {
          runIntent: 'derive_continuity_structure',
          runMode: 'sequence_animatic_continuity_structure',
          runScope: 'upstream_to_node',
          allowStaleUpstreamOutputs: true,
          targetNodeKeys: ['continuity_global_structure'],
          forceNodeKeys: ['continuity_input', 'continuity_seed_graph', 'continuity_global_plan', 'continuity_global_merge', 'continuity_global_structure'],
          parentRequestId: masterRequest.id,
          continuityRequestId: continuityRequest.id,
          deriveMode: payload.mode,
        },
      }),
    })
    const startPayload = await startResponse.json().catch(() => ({}))
    if (!startResponse.ok) {
      const startError = readText(asRecord(startPayload).error)
        || readText(asRecord(startPayload).message)
        || 'Failed to start continuity structure derivation.'
      const failedGlobalStructureState = {
        ...globalStructureState,
        status: 'failed',
        error: startError,
        failedAt: new Date().toISOString(),
      }
      await admin
        .from('output_requests')
        .update({
          status: 'awaiting_confirmation',
          error_message: startError,
          metadata: {
            ...metadata,
            globalStructureState: failedGlobalStructureState,
            continuityGraphStatus: readText(metadata.continuityGraphStatus) || 'failed',
            lastContinuityStructureDeriveFailedAt: failedGlobalStructureState.failedAt,
          },
        })
        .eq('id', continuityRequest.id)
      await admin.rpc('refresh_output_request_status_projection', { p_request_id: continuityRequest.id })
      throw new HttpError(startResponse.status >= 500 ? 502 : startResponse.status, startError)
    }
    const started = outputWorkflowRunStatusResponseSchema.parse(startPayload)
    const updatedRequest = {
      ...continuityRequest,
      status: 'running' as const,
      latestRunId: started.run.id,
      metadata: {
        ...metadata,
        globalStructureState,
      },
    }
    return json(sequenceAnimaticContinuityStructureDeriveResponseSchema.parse({
      ok: true,
      masterRequest,
      continuityRequest: updatedRequest,
      run: started.run,
      globalStructureState,
      coverage: asRecord(metadata.continuityCoverage),
      reused: false,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to derive sequence animatic continuity structure.')
  }
})
