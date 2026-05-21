import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  hydrateOutputArtifactSignedUrls,
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputRequestStatusProjectionRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputRequestStatusProjectionSelect,
  outputWorkflowRunSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  sequenceAnimaticStateRequestSchema,
  sequenceAnimaticStateResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

type DatabaseClient = ReturnType<typeof createAdminClient>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readContinuityState(input: {
  requests: ReturnType<typeof mapOutputRequestRow>[]
  artifacts: ReturnType<typeof mapOutputArtifactRow>[]
}) {
  const continuityRequest = input.requests.find((entry) => readScreenplayAnimaticRole(asRecord(entry.metadata)) === 'continuity_pack') ?? null
  const packMetadata = input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .find((metadata) => readText(metadata.role) === 'sequence_animatic_continuity_pack') ?? {}
  const pack = asRecord(packMetadata.continuityPack ?? packMetadata.continuity_pack)
  const blockStates = {
    ...asRecord(asRecord(continuityRequest?.metadata).blockStates),
    ...asRecord(pack.blockStates ?? pack.block_states),
  }
  const assetStateByNodeId = {
    ...asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
  }
  input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .filter((metadata) => readText(metadata.role) === 'sequence_animatic_continuity_asset')
    .forEach((metadata) => {
      const state = asRecord(metadata.assetState ?? metadata.asset_state)
      const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
      if (nodeId) assetStateByNodeId[nodeId] = state
    })
  const visualDependencyEdges = readArray(pack.visualDependencyEdges ?? pack.visual_dependency_edges).map(asRecord)
  const assetStatuses = Object.values(assetStateByNodeId).map(asRecord).map((state) => readText(state.status))
  const assetGenerationStatus = (() => {
    const explicit = readText(pack.assetGenerationStatus ?? pack.asset_generation_status)
    if (explicit === 'none' || explicit === 'partial' || explicit === 'ready' || explicit === 'stale' || explicit === 'failed') return explicit
    if (assetStatuses.length === 0) return 'none'
    if (assetStatuses.includes('failed')) return 'failed'
    if (assetStatuses.includes('stale')) return 'stale'
    const readyCount = assetStatuses.filter((status) => status === 'ready').length
    if (readyCount === assetStatuses.length) return 'ready'
    if (readyCount > 0) return 'partial'
    return 'none'
  })()
  const status = readText(pack.continuityGraphStatus ?? pack.continuity_graph_status ?? asRecord(continuityRequest?.metadata).continuityGraphStatus)
  const globalStructureState = {
    ...asRecord(asRecord(continuityRequest?.metadata).globalStructureState),
    ...asRecord(pack.globalStructureState ?? pack.global_structure_state),
  }
  const continuityCoverage = {
    ...asRecord(asRecord(continuityRequest?.metadata).continuityCoverage),
    ...asRecord(pack.coverage),
  }
  return {
    continuityGraphStatus: status === 'ready' || status === 'partial' || status === 'stale' || status === 'failed' || status === 'empty'
      ? status
      : Object.keys(blockStates).some((blockId) => readText(asRecord(blockStates[blockId]).status) === 'ready')
        ? 'partial'
        : 'empty',
    continuityBlockStates: blockStates,
    globalStructureState,
    continuityCoverage,
    assetStateByNodeId,
    visualDependencyEdges,
    assetGenerationStatus,
  }
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function addAssetKey(value: unknown, assetKeys: Set<string>, depth = 0) {
  if (depth > 8 || value == null) return
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 100)) addAssetKey(entry, assetKeys, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = asRecord(value)
  const key = readText(record.assetKey) || readText(record.asset_key)
  if (key) assetKeys.add(key)
  for (const entry of Object.values(record).slice(0, 100)) addAssetKey(entry, assetKeys, depth + 1)
}

function assetRowToDefinition(row: Record<string, unknown>, signedUrl: string | null, signedUrlExpiresAt: string | null) {
  const metadata = asRecord(row.metadata)
  return {
    id: readText(row.id),
    projectId: readText(row.project_id),
    key: readText(row.key),
    name: readText(row.name),
    kind: readText(row.kind) || 'image',
    mimeType: readText(row.mime_type),
    storagePath: readText(row.storage_path),
    metadata: signedUrl ? { ...metadata, signedUrl, sourceUrl: signedUrl, previewUrl: signedUrl, signedUrlExpiresAt } : metadata,
    llmHints: asRecord(row.llm_hints),
  }
}

async function loadSignedAssets(client: DatabaseClient, projectId: string, assetKeys: string[]) {
  const cleanKeys = [...new Set(assetKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 240)
  if (cleanKeys.length === 0) return []
  const response = await client
    .from('project_assets')
    .select('id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .in('key', cleanKeys)
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as Record<string, unknown>[]
  return Promise.all(rows.map(async (row) => {
    const storagePath = readText(row.storage_path)
    let signedUrl: string | null = null
    let signedUrlExpiresAt: string | null = null
    if (storagePath) {
      const signed = await client.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
      const data = asRecord(signed.data)
      signedUrl = signed.error ? null : readText(data.signedUrl) || readText(data.signedURL) || null
      signedUrlExpiresAt = signedUrl ? new Date(Date.now() + 55 * 60 * 1000).toISOString() : null
    }
    return assetRowToDefinition(row, signedUrl, signedUrlExpiresAt)
  }))
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-sequence-animatic-state')
    const admin = createAdminClient('get-sequence-animatic-state')
    const payload = sequenceAnimaticStateRequestSchema.parse(await request.json())

    let masterRequestId = readText(payload.masterRequestId)
    if (!masterRequestId) {
      const sequenceUnitKey = readText(payload.sequenceUnitKey)
      const lookupResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .is('parent_request_id', null)
        .contains('selected_sequence_unit_keys', [sequenceUnitKey])
        .order('created_at', { ascending: false })
        .limit(20)
      if (lookupResponse.error) throw new Error(lookupResponse.error.message)
      const candidate = (lookupResponse.data ?? [])
        .map(mapOutputRequestRow)
        .find((entry) => readScreenplayAnimaticRole(asRecord(entry.metadata)) === 'master') ?? null
      if (!candidate) {
        const revision = hashOutputWorkflowValue({
          projectId: payload.projectId,
          draftId: payload.draftId,
          sequenceUnitKey,
          state: 'not_generated',
        })
        return json(sequenceAnimaticStateResponseSchema.parse({
          ok: true,
          unchanged: readText(payload.knownRevision) === revision,
          revision,
          masterRequest: null,
          requests: [],
          workflows: [],
          runs: [],
          artifacts: [],
          assets: [],
          projections: [],
        }))
      }
      masterRequestId = candidate.id
    } else {
      const masterAccess = await client
        .from('output_requests')
        .select('id')
        .eq('id', masterRequestId)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .maybeSingle()
      if (masterAccess.error) throw new Error(masterAccess.error.message)
      if (!masterAccess.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    }

    const masterResponse = await admin
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new Error(masterResponse.error?.message ?? 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    if (readScreenplayAnimaticRole(asRecord(masterRequest.metadata)) !== 'master') {
      throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    }

    const directChildrenResponse = await admin
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (directChildrenResponse.error) throw new Error(directChildrenResponse.error.message)
    const directChildren = (directChildrenResponse.data ?? []).map(mapOutputRequestRow)
    const blockRequestIds = directChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'storyboard_block')
      .map((child) => child.id)
    const continuityRequestIds = directChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'continuity_pack')
      .map((child) => child.id)
    let shotChildren: ReturnType<typeof mapOutputRequestRow>[] = []
    const nestedParentRequestIds = [...blockRequestIds, ...continuityRequestIds]
    if (nestedParentRequestIds.length > 0) {
      const shotChildrenResponse = await admin
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .in('parent_request_id', nestedParentRequestIds)
        .order('created_at', { ascending: true })
      if (shotChildrenResponse.error) throw new Error(shotChildrenResponse.error.message)
      shotChildren = (shotChildrenResponse.data ?? []).map(mapOutputRequestRow)
    }
    const requests = [masterRequest, ...directChildren, ...shotChildren]
    const workflowIds = [...new Set(requests.map((entry) => entry.workflowId).filter((id): id is string => Boolean(id)))]
    const runIds = [...new Set(requests.map((entry) => entry.latestRunId).filter((id): id is string => Boolean(id)))]

    const [workflowResponse, runResponse, artifactResponse, projectionResponse] = await Promise.all([
      workflowIds.length > 0
        ? admin.from('output_workflows').select(outputWorkflowSelect).eq('draft_id', payload.draftId).in('id', workflowIds)
        : { data: [], error: null },
      runIds.length > 0
        ? admin.from('output_workflow_runs').select(outputWorkflowRunSelect).eq('draft_id', payload.draftId).in('id', runIds)
        : { data: [], error: null },
      workflowIds.length > 0
        ? admin.from('output_artifacts').select(outputArtifactSelect).eq('draft_id', payload.draftId).in('workflow_id', workflowIds).order('created_at', { ascending: false })
        : { data: [], error: null },
      admin.from('output_request_status_projections').select(outputRequestStatusProjectionSelect).eq('draft_id', payload.draftId).in('request_id', requests.map((entry) => entry.id)),
    ])
    if (workflowResponse.error) throw new Error(workflowResponse.error.message)
    if (runResponse.error) throw new Error(runResponse.error.message)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)
    if (projectionResponse.error) throw new Error(projectionResponse.error.message)

    const artifacts = (artifactResponse.data ?? []).map(mapOutputArtifactRow)
    const hydratedArtifacts = await hydrateOutputArtifactSignedUrls(admin, artifacts)
    const assetKeys = new Set<string>()
    for (const artifact of hydratedArtifacts) {
      if (artifact.assetKey) assetKeys.add(artifact.assetKey)
      addAssetKey(artifact.metadata, assetKeys)
    }
    for (const projection of (projectionResponse.data ?? []) as Record<string, unknown>[]) {
      addAssetKey(asRecord(projection.progress), assetKeys)
      for (const key of Array.isArray(projection.preview_asset_keys) ? projection.preview_asset_keys : []) {
        const text = readText(key)
        if (text) assetKeys.add(text)
      }
    }
    const assets = await loadSignedAssets(admin, payload.projectId, [...assetKeys])
    const workflows = (workflowResponse.data ?? []).map(mapOutputWorkflowRow)
    const runs = (runResponse.data ?? []).map((row) => mapOutputWorkflowRunRow(row as never, [], hydratedArtifacts.filter((artifact) => artifact.runId === readText((row as Record<string, unknown>).id))))
    const projections = ((projectionResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputRequestStatusProjectionRow(row as never))
    const revision = hashOutputWorkflowValue({
      requests: requests.map((entry) => ({ id: entry.id, status: entry.status, workflowId: entry.workflowId, latestRunId: entry.latestRunId, updatedAt: entry.updatedAt, metadata: entry.metadata })),
      workflows: workflows.map((entry) => ({ id: entry.id, updatedAt: entry.updatedAt, metadata: entry.metadata })),
      runs: runs.map((entry) => ({ id: entry.id, status: entry.status, updatedAt: entry.updatedAt, outputHash: entry.outputHash ?? '' })),
      artifacts: hydratedArtifacts.map((entry) => ({ id: entry.id, key: entry.key, assetKey: entry.assetKey, updatedAt: entry.updatedAt })),
      projections: projections.map((entry) => ({ requestId: entry.requestId, graphRevision: entry.graphRevision, timelineRevision: entry.timelineRevision, status: entry.status, updatedAt: entry.updatedAt })),
    })
    const continuityState = readContinuityState({ requests, artifacts: hydratedArtifacts })
    if (readText(payload.knownRevision) && readText(payload.knownRevision) === revision) {
      return json(sequenceAnimaticStateResponseSchema.parse({
        ok: true,
        unchanged: true,
        revision,
        masterRequest: null,
        requests: [],
        workflows: [],
        runs: [],
        artifacts: [],
        assets: [],
        projections: [],
        ...continuityState,
      }))
    }

    return json(sequenceAnimaticStateResponseSchema.parse({
      ok: true,
      unchanged: false,
      revision,
      masterRequest,
      requests,
      workflows,
      runs,
      artifacts: hydratedArtifacts,
      assets,
      projections,
      ...continuityState,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load sequence animatic state.')
  }
})
