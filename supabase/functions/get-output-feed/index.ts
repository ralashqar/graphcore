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
  outputWorkflowRunStatusSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  outputFeedRequestSchema,
  outputFeedResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

type DatabaseClient = ReturnType<typeof createAdminClient>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

function collectReferenceSelectionAssetKeys(value: unknown, keys = new Set<string>(), depth = 0) {
  if (depth > 8 || value == null) return keys
  if (Array.isArray(value)) {
    for (const entry of value) collectReferenceSelectionAssetKeys(entry, keys, depth + 1)
    return keys
  }
  if (typeof value !== 'object') return keys
  const record = value as Record<string, unknown>
  for (const field of ['assetKey', 'primaryAssetKey', 'selectedReferenceVariantAssetKey', 'variantAssetKey']) {
    const text = readText(record[field])
    if (text) keys.add(text)
  }
  for (const entry of Object.values(record)) collectReferenceSelectionAssetKeys(entry, keys, depth + 1)
  return keys
}

async function loadSignedAssets(client: DatabaseClient, projectId: string, assetKeys: string[], knownAssetKeys: string[]) {
  const known = new Set(knownAssetKeys.map((key) => key.trim()).filter(Boolean))
  const cleanKeys = [...new Set(assetKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 160)
    .filter((key) => !known.has(key))
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

function feedRevision(input: {
  projections: Record<string, unknown>[]
  cursor: string | null | undefined
  hasMore: boolean
}) {
  return hashOutputWorkflowValue({
    cursor: input.cursor ?? null,
    hasMore: input.hasMore,
    projections: input.projections.map((row) => ({
      requestId: row.request_id,
      status: row.status,
      latestRunId: row.latest_run_id,
      graphRevision: row.graph_revision,
      timelineRevision: row.timeline_revision,
      updatedAt: row.updated_at,
      metadataVersion: asRecord(row.metadata).projectionVersion ?? null,
    })),
  })
}

function buildProjectionQuery(admin: DatabaseClient, draftId: string, cursor: string | null | undefined, limit: number) {
  let query = admin
    .from('output_request_status_projections')
    .select(outputRequestStatusProjectionSelect)
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('created_at', cursor)
  return query
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-feed')
    const admin = createAdminClient('get-output-feed')
    const payload = outputFeedRequestSchema.parse(await request.json())
    const limit = Math.max(1, Math.min(100, payload.limit ?? 30))

    const draftResponse = await client
      .from('project_drafts')
      .select('id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .maybeSingle()
    if (draftResponse.error) throw new Error(draftResponse.error.message)
    if (!draftResponse.data) throw new HttpError(404, 'Draft not found.')

    let projectionResponse = await buildProjectionQuery(admin, payload.draftId, payload.cursor, limit)
    if (projectionResponse.error) throw new Error(projectionResponse.error.message)
    let projectionRows = (projectionResponse.data ?? []) as Record<string, unknown>[]

    if (projectionRows.length === 0 && !payload.cursor) {
      const fallbackRequestResponse = await client
        .from('output_requests')
        .select('id')
        .eq('draft_id', payload.draftId)
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 6))
      if (fallbackRequestResponse.error) throw new Error(fallbackRequestResponse.error.message)
      for (const row of ((fallbackRequestResponse.data ?? []) as Record<string, unknown>[])) {
        const requestId = readText(row.id)
        if (requestId) await admin.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
      }
      projectionResponse = await buildProjectionQuery(admin, payload.draftId, payload.cursor, limit)
      if (projectionResponse.error) throw new Error(projectionResponse.error.message)
      projectionRows = (projectionResponse.data ?? []) as Record<string, unknown>[]
    }

    const hasMore = projectionRows.length > limit
    const pageProjectionRows = projectionRows.slice(0, limit)
    const revision = feedRevision({ projections: pageProjectionRows, cursor: payload.cursor, hasMore })
    if (!payload.cursor && readText(payload.knownFeedRevision) && readText(payload.knownFeedRevision) === revision) {
      return json(outputFeedResponseSchema.parse({
        ok: true,
        unchanged: true,
        feedRevision: revision,
        requests: [],
        workflows: [],
        runs: [],
        artifacts: [],
        assets: [],
        projections: [],
        page: {
          limit,
          hasMore,
          nextCursor: hasMore ? readText(pageProjectionRows[pageProjectionRows.length - 1]?.created_at) || null : null,
        },
      }))
    }

    const requestIds = pageProjectionRows.map((row) => readText(row.request_id)).filter(Boolean)
    const requestResponse = requestIds.length > 0
      ? await client
          .from('output_requests')
          .select(outputRequestSelect)
          .eq('draft_id', payload.draftId)
          .in('id', requestIds)
      : { data: [], error: null }
    if (requestResponse.error) throw new Error(requestResponse.error.message)
    const requestById = new Map(((requestResponse.data ?? []) as Record<string, unknown>[]).map((row) => [readText(row.id), row]))
    const requests = requestIds.flatMap((id) => {
      const row = requestById.get(id)
      return row ? [mapOutputRequestRow(row as never)] : []
    })
    const nextCursor = hasMore ? readText(pageProjectionRows[pageProjectionRows.length - 1]?.created_at) || null : null

    const projections = pageProjectionRows.map((row) => mapOutputRequestStatusProjectionRow(row as never))
    const workflowIds = [...new Set(requests.map((entry) => entry.workflowId).filter((id): id is string => Boolean(id)))]
    const latestRunIds = [...new Set([
      ...requests.map((entry) => entry.latestRunId),
      ...projections.map((entry) => entry.latestRunId),
    ].filter((id): id is string => Boolean(id)))]
    const artifactKeys = [...new Set(projections.flatMap((projection) => projection.artifactKeys).filter(Boolean))].slice(0, 180)

    const [workflowResponse, runResponse, artifactResponse] = await Promise.all([
      workflowIds.length > 0
        ? admin.from('output_workflows').select(outputWorkflowSelect).in('id', workflowIds).eq('draft_id', payload.draftId)
        : Promise.resolve({ data: [], error: null }),
      latestRunIds.length > 0
        ? admin.from('output_workflow_runs').select(outputWorkflowRunStatusSelect).in('id', latestRunIds).eq('draft_id', payload.draftId)
        : Promise.resolve({ data: [], error: null }),
      artifactKeys.length > 0
        ? admin.from('output_artifacts').select(outputArtifactSelect).eq('draft_id', payload.draftId).in('key', artifactKeys).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (workflowResponse.error) throw new Error(workflowResponse.error.message)
    if (runResponse.error) throw new Error(runResponse.error.message)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)

    const artifacts = await hydrateOutputArtifactSignedUrls(
      admin,
      ((artifactResponse.data ?? []) as never[]).map(mapOutputArtifactRow),
    )
    const requestReferenceAssetKeys = requests.flatMap((request) => {
      const metadata = asRecord(request.metadata)
      return [...collectReferenceSelectionAssetKeys(metadata.outputReferenceSelection)]
    })
    const assets = await loadSignedAssets(admin, payload.projectId, [
      ...artifacts.map((artifact) => artifact.assetKey).filter((key): key is string => Boolean(key)),
      ...projections.flatMap((projection) => projection.previewAssetKeys),
      ...requestReferenceAssetKeys,
    ], payload.knownAssetKeys ?? [])

    return json(outputFeedResponseSchema.parse({
      ok: true,
      unchanged: false,
      feedRevision: revision,
      requests,
      workflows: ((workflowResponse.data ?? []) as never[]).map(mapOutputWorkflowRow),
      runs: ((runResponse.data ?? []) as never[]).map((row) => mapOutputWorkflowRunRow(row, [], [])),
      artifacts,
      assets,
      projections,
      page: {
        limit,
        hasMore,
        nextCursor,
      },
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output feed.')
  }
})
