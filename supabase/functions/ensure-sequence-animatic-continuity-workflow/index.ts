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
  sequenceAnimaticContinuityWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityWorkflowEnsureResponseSchema,
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

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function initialContinuityBlockStates(manifest: Record<string, unknown>) {
  const blocks = Array.isArray(manifest.blocks)
    ? manifest.blocks.map(asRecord)
    : Array.isArray(asRecord(manifest.shotBreakPlan).groups)
      ? asRecord(manifest.shotBreakPlan).groups.map(asRecord)
      : []
  const now = new Date().toISOString()
  const states: Record<string, Record<string, unknown>> = {}
  blocks.forEach((block, index) => {
    const blockId = readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
    const shotIds = Array.isArray(block.shotIds)
      ? block.shotIds.map(readText).filter(Boolean)
      : Array.isArray(block.shotBreakIds)
        ? block.shotBreakIds.map(readText).filter(Boolean)
        : []
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-continuity-workflow')
    const admin = createAdminClient('ensure-sequence-animatic-continuity-workflow')
    const payload = sequenceAnimaticContinuityWorkflowEnsureRequestSchema.parse(await request.json())

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
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic master first; no manifest is available yet.')
    const manifestHash = sequenceAnimaticStableHash(manifest)
    const blockStates = initialContinuityBlockStates(manifest)
    const masterManifestArtifactKey = readText(asRecord(manifestArtifactRow).key)
    if (!masterManifestArtifactKey) throw new HttpError(409, 'The master manifest artifact is missing its key.')

    const existingResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (existingResponse.error) throw new Error(existingResponse.error.message)
    const existing = (existingResponse.data ?? []).map(mapOutputRequestRow)
    const staleChildren = existing.filter((child) => {
      const metadata = asRecord(child.metadata)
      return metadata.sequenceAnimaticStale !== true
        && readScreenplayAnimaticRole(metadata) === 'continuity_pack'
        && readText(metadata.manifestHash)
        && readText(metadata.manifestHash) !== manifestHash
    })
    for (const stale of staleChildren) {
      const metadata = asRecord(stale.metadata)
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
        .eq('id', stale.id)
    }

    const activeExisting = existing.find((child) => {
      const metadata = asRecord(child.metadata)
      return metadata.sequenceAnimaticStale !== true
        && readScreenplayAnimaticRole(metadata) === 'continuity_pack'
        && readText(metadata.manifestHash) === manifestHash
    }) ?? null
    if (activeExisting?.workflowId) {
      const activeMetadata = asRecord(activeExisting.metadata)
      if (Object.keys(asRecord(activeMetadata.blockStates)).length === 0 && Object.keys(blockStates).length > 0) {
        await client
          .from('output_requests')
          .update({
            metadata: {
              ...activeMetadata,
              blockStates,
              pendingDeltas: {},
              continuityGraphStatus: 'empty',
            },
          })
          .eq('id', activeExisting.id)
      }
      const workflowResponse = await client
        .from('output_workflows')
        .select(outputWorkflowSelect)
        .eq('id', activeExisting.workflowId)
        .maybeSingle()
      const nodeResponse = await client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', activeExisting.workflowId)
        .order('created_at', { ascending: true })
      const edgeResponse = await client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', activeExisting.workflowId)
        .order('created_at', { ascending: true })
      if (workflowResponse.error) throw new Error(workflowResponse.error.message)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      return json(sequenceAnimaticContinuityWorkflowEnsureResponseSchema.parse({
        ok: true,
        masterRequest,
        continuityRequest: activeExisting,
        workflow: workflowResponse.data ? mapOutputWorkflowRow(workflowResponse.data) : null,
        nodes: (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow),
        edges: (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow),
      }))
    }

    const workflowPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: `sequence_animatic_continuity_${slugify(masterRequest.id)}_${manifestHash.slice(0, 8)}`,
        name: `${masterRequest.title} / Continuity Pack`,
        description: 'Sequence animatic continuity sidecar workflow.',
        preset: 'cinematic_episode_from_sequence',
        status: 'active',
        created_by: user.id,
        metadata: {
          parentRequestId: masterRequest.id,
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'continuity_pack',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'continuity_pack',
          manifestHash,
          masterManifestArtifactKey,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          sourceMasterWorkflowId: masterRequest.workflowId,
          readyToRun: true,
          blockStates,
          pendingDeltas: {},
          continuityGraphStatus: 'empty',
        },
      }
    const commonConfig = {
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
    }
    const { nodes, edges } = buildSequenceAnimaticContinuityWorkflowGraph({
      workflowId: crypto.randomUUID(),
      draftId: payload.draftId,
      commonConfig,
      manifest,
      assetPack: asRecord(manifest.assetPack),
      aspectRatio: readText(asRecord(manifest.assetPack).aspectRatio) || '16:9',
    })
    const requestPayload = {
        project_id: payload.projectId,
        draft_id: payload.draftId,
        parent_request_id: masterRequest.id,
        requested_by: user.id,
        source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
        prompt: `Prepare continuity references for ${masterRequest.title}.`,
        title: `${masterRequest.title} / Continuity Pack`,
        intent: 'output_generation',
        output_kind: 'cinematic_episode',
        status: 'awaiting_confirmation',
        selected_entity_keys: masterRequest.selectedEntityKeys,
        selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
        page_count: null,
        target_format: 'video',
        planner_notes: 'Continuity sidecar graph prepared from a sequence animatic master manifest.',
        metadata: {
          graphSpecVersion: sequenceAnimaticGraphSpecVersion,
          screenplayAnimaticRole: 'continuity_pack',
          screenplayAnimaticSource,
          sequenceAnimaticRole: 'continuity_pack',
          parentRequestId: masterRequest.id,
          masterRequestId: masterRequest.id,
          manifestHash,
          masterManifestArtifactKey,
          sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
          sourceMasterWorkflowId: masterRequest.workflowId,
          readyToRun: true,
          createdFromManifestAt: new Date().toISOString(),
          blockStates,
          pendingDeltas: {},
          continuityGraphStatus: 'empty',
        },
      }

    const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
      p_project_id: payload.projectId,
      p_draft_id: payload.draftId,
      p_parent_request_id: masterRequest.id,
      p_role: 'continuity_pack',
      p_identity_key: '',
      p_identity_value: '',
      p_workflow: workflowPayload,
      p_nodes: nodes,
      p_edges: edges,
      p_request: requestPayload,
    })
    if (ensureResponse.error || !ensureResponse.data) {
      throw new Error(ensureResponse.error?.message ?? 'Failed to atomically ensure continuity workflow.')
    }
    const ensured = asRecord(ensureResponse.data)
    const continuityRequest = mapOutputRequestRow(asRecord(ensured.request) as never)
    const workflow = Object.keys(asRecord(ensured.workflow)).length > 0 ? mapOutputWorkflowRow(asRecord(ensured.workflow) as never) : null
    console.info('[GraphCore] sequence animatic continuity ensure rpc completed.', {
      masterRequestId: masterRequest.id,
      continuityRequestId: continuityRequest.id,
      manifestHash,
      created: ensured.created === true,
      reused: ensured.reused === true,
    })

    return json(sequenceAnimaticContinuityWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      continuityRequest,
      workflow,
      nodes: readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never)),
      edges: readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never)),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic continuity workflow.')
  }
})
