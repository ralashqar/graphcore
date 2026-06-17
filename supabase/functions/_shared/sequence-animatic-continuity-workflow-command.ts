import { HttpError } from './http.ts'
import {
  ensureMappedChildWorkflow,
  loadChildWorkflowGraphBundle,
  markChildWorkflowStale,
} from './output-workflow-child-utils.ts'
import {
  mapOutputRequestRow,
  outputArtifactSelect,
  outputRequestSelect,
} from './output-workflow.ts'
import {
  sequenceAnimaticContinuityWorkflowEnsureRequestSchema,
  sequenceAnimaticContinuityWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticContinuityWorkflowTemplateKey,
} from './sequence-animatic-template-registry.ts'
import { buildValidatedSequenceAnimaticTemplateGraph } from './sequence-animatic-command-utils.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

export async function runSequenceAnimaticContinuityWorkflowCommand(input: {
  client: {
    from: (table: string) => any
  }
  admin: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
  }
  userId: string
  payload: unknown
}) {
  const { client, admin, userId } = input
  const payload = sequenceAnimaticContinuityWorkflowEnsureRequestSchema.parse(input.payload)

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
    .find((row: unknown) => readText(asRecord(asRecord(row).metadata).role) === 'sequence_animatic_manifest') ?? null
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
    await markChildWorkflowStale({
      client,
      request: stale,
      status: 'awaiting_confirmation',
      readyToRun: false,
      reason: 'master_manifest_changed',
      metadata: {
        staleManifestHash: readText(metadata.manifestHash) || null,
        replacedByManifestHash: manifestHash,
      },
    })
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
    const graphBundle = await loadChildWorkflowGraphBundle({
      client,
      workflowIds: [activeExisting.workflowId],
    })
    return sequenceAnimaticContinuityWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      continuityRequest: activeExisting,
      workflow: graphBundle.workflows[0] ?? null,
      nodes: graphBundle.nodes,
      edges: graphBundle.edges,
    })
  }

  const workflowPayload = {
    project_id: payload.projectId,
    draft_id: payload.draftId,
    key: `sequence_animatic_continuity_${slugify(masterRequest.id)}_${manifestHash.slice(0, 8)}`,
    name: `${masterRequest.title} / Continuity Pack`,
    description: 'Sequence animatic continuity sidecar workflow.',
    preset: 'cinematic_episode_from_sequence',
    status: 'active',
    created_by: userId,
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
  const graphResult = buildValidatedSequenceAnimaticTemplateGraph({
    registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
    templateKey: sequenceAnimaticContinuityWorkflowTemplateKey,
    rawInput: {
      workflowId: crypto.randomUUID(),
      draftId: payload.draftId,
      commonConfig,
      manifest,
      assetPack: asRecord(manifest.assetPack),
      aspectRatio: readText(asRecord(manifest.assetPack).aspectRatio) || '16:9',
    },
  })
  const { nodes, edges } = graphResult.graph
  Object.assign(workflowPayload.metadata, {
    workflowTemplateKey: sequenceAnimaticContinuityWorkflowTemplateKey,
    workflowTemplateSourceHash: graphResult.sourceHash,
  })
  const requestPayload = {
    project_id: payload.projectId,
    draft_id: payload.draftId,
    parent_request_id: masterRequest.id,
    requested_by: userId,
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
      workflowTemplateKey: sequenceAnimaticContinuityWorkflowTemplateKey,
      workflowTemplateSourceHash: graphResult.sourceHash,
      createdFromManifestAt: new Date().toISOString(),
      blockStates,
      pendingDeltas: {},
      continuityGraphStatus: 'empty',
    },
  }

  const ensured = await ensureMappedChildWorkflow({
    client: admin,
    projectId: payload.projectId,
    draftId: payload.draftId,
    parentRequestId: masterRequest.id,
    role: 'continuity_pack',
    identityKey: '',
    identityValue: '',
    workflow: workflowPayload,
    nodes,
    edges,
    request: requestPayload,
  })
  const continuityRequest = ensured.request
  console.info('[GraphCore] sequence animatic continuity ensure rpc completed.', {
    masterRequestId: masterRequest.id,
    continuityRequestId: continuityRequest.id,
    manifestHash,
    created: ensured.created,
    reused: ensured.reused,
  })

  return sequenceAnimaticContinuityWorkflowEnsureResponseSchema.parse({
    ok: true,
    masterRequest,
    continuityRequest,
    workflow: ensured.workflow,
    nodes: ensured.nodes,
    edges: ensured.edges,
  })
}
