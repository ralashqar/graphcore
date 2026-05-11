import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  compactOutputWorkflowRunForStatus,
  compactRecordForStatus,
  hydrateOutputArtifactSignedUrls,
  mapOutputArtifactRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowNodeStatusSelect,
  outputWorkflowRunStatusSelect,
  outputWorkflowRunStepStatusSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  outputWorkflowGraphResponseSchema,
  outputWorkflowGraphRequestSchema,
} from '../../../src/domain/outputWorkflow.ts'

type DatabaseClient = ReturnType<typeof createAdminClient>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => readText(entry)).filter(Boolean)
    : []
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

function addPreviewAssetKeys(value: unknown, assetKeys: Set<string>) {
  const preview = asRecord(value)
  for (const key of readStringArray(preview.assetKeys)) assetKeys.add(key)
  const assetKey = readText(preview.assetKey) || readText(preview.asset_key)
  if (assetKey) assetKeys.add(assetKey)
}

function assetRowToDefinition(row: Record<string, unknown>, signedUrl: string | null) {
  const metadata = asRecord(row.metadata)
  return {
    id: readText(row.id),
    projectId: readText(row.project_id),
    key: readText(row.key),
    name: readText(row.name),
    kind: readText(row.kind) || 'image',
    mimeType: readText(row.mime_type),
    storagePath: readText(row.storage_path),
    metadata: signedUrl ? { ...metadata, signedUrl, sourceUrl: signedUrl, previewUrl: signedUrl } : metadata,
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
    if (storagePath) {
      const signed = await client.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
      const data = asRecord(signed.data)
      signedUrl = signed.error ? null : readText(data.signedUrl) || readText(data.signedURL) || null
    }
    return assetRowToDefinition(row, signedUrl)
  }))
}

function graphRevision(input: {
  workflow: Record<string, unknown> | null
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  steps: Record<string, unknown>[]
  artifacts: Record<string, unknown>[]
}) {
  return hashOutputWorkflowValue({
    workflowUpdatedAt: input.workflow?.updated_at ?? null,
    nodeCount: input.nodes.length,
    edgeCount: input.edges.length,
    stepCount: input.steps.length,
    artifactCount: input.artifacts.length,
    nodes: input.nodes.map((row) => ({
      key: row.key,
      outputHash: row.output_hash,
      dirty: row.dirty,
      updatedAt: row.updated_at,
      outputPreview: asRecord(asRecord(row.metadata).outputPreview).outputHash ?? null,
    })),
    steps: input.steps.map((row) => ({
      nodeKey: row.node_key,
      status: row.status,
      outputHash: row.output_hash,
      updatedAt: row.updated_at,
    })),
    edges: input.edges.map((row) => ({ key: row.key, updatedAt: row.updated_at })),
    artifacts: input.artifacts.map((row) => ({ key: row.key, assetKey: row.asset_key, updatedAt: row.updated_at })),
  })
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-workflow-graph')
    const admin = createAdminClient('get-output-workflow-graph')
    const payload = outputWorkflowGraphRequestSchema.parse(await request.json())

    const accessResponse = await client
      .from('output_workflows')
      .select('id')
      .eq('id', payload.workflowId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .maybeSingle()
    if (accessResponse.error) throw new Error(accessResponse.error.message)
    if (!accessResponse.data) throw new HttpError(404, 'Output workflow not found.')

    const [workflowResponse, nodeResponse, edgeResponse, artifactResponse] = await Promise.all([
      admin.from('output_workflows').select(outputWorkflowSelect).eq('id', payload.workflowId).eq('draft_id', payload.draftId).single(),
      admin.from('output_workflow_nodes').select(outputWorkflowNodeStatusSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId).order('created_at', { ascending: true }),
      admin.from('output_workflow_edges').select(outputWorkflowEdgeSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId).order('created_at', { ascending: true }),
      admin.from('output_artifacts').select(outputArtifactSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId).order('created_at', { ascending: false }),
    ])
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Output workflow not found.')
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)

    let runRow: Record<string, unknown> | null = null
    const runId = readText(payload.runId)
    if (runId) {
      const runResponse = await admin
        .from('output_workflow_runs')
        .select(outputWorkflowRunStatusSelect)
        .eq('id', runId)
        .eq('workflow_id', payload.workflowId)
        .eq('draft_id', payload.draftId)
        .maybeSingle()
      if (runResponse.error) throw new Error(runResponse.error.message)
      runRow = runResponse.data as Record<string, unknown> | null
    } else {
      const runResponse = await admin
        .from('output_workflow_runs')
        .select(outputWorkflowRunStatusSelect)
        .eq('workflow_id', payload.workflowId)
        .eq('draft_id', payload.draftId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (runResponse.error) throw new Error(runResponse.error.message)
      runRow = ((runResponse.data ?? []) as Record<string, unknown>[])[0] ?? null
    }

    const stepResponse = runRow
      ? await admin
          .from('output_workflow_run_steps')
          .select(outputWorkflowRunStepStatusSelect)
          .eq('run_id', readText(runRow.id))
          .order('order_index', { ascending: true })
      : { data: [], error: null }
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const selectedNodeKey = readText(payload.selectedNodeKey)
    let selectedNodeOutput = null
    if (payload.includeSelectedNodeOutput && selectedNodeKey) {
      const selectedResponse = await admin
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', payload.workflowId)
        .eq('draft_id', payload.draftId)
        .eq('key', selectedNodeKey)
        .maybeSingle()
      if (selectedResponse.error) throw new Error(selectedResponse.error.message)
      if (selectedResponse.data) {
        const outputs = asRecord((selectedResponse.data as Record<string, unknown>).outputs)
        const compact = compactRecordForStatus(outputs, 650_000)
        selectedNodeOutput = {
          nodeKey: selectedNodeKey,
          outputs: compact,
          truncated: compact._truncatedForStatus === true,
        }
      }
    }

    const artifacts = (artifactResponse.data ?? []).map(mapOutputArtifactRow)
    const hydratedArtifacts = await hydrateOutputArtifactSignedUrls(admin, artifacts)
    const steps = ((stepResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputWorkflowRunStepRow(row as never))
    const runArtifacts = runRow ? hydratedArtifacts.filter((artifact) => artifact.runId === readText(runRow?.id)) : []
    const run = runRow ? compactOutputWorkflowRunForStatus(mapOutputWorkflowRunRow(runRow as never, steps, runArtifacts)) : null
    const nodes = ((nodeResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputWorkflowNodeRow(row as never))
    const edges = ((edgeResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputWorkflowEdgeRow(row as never))

    const assetKeys = new Set<string>()
    for (const artifact of hydratedArtifacts) {
      if (artifact.assetKey) assetKeys.add(artifact.assetKey)
    }
    for (const node of nodes) addPreviewAssetKeys(asRecord(node.metadata).outputPreview, assetKeys)
    if (selectedNodeOutput) addAssetKey(selectedNodeOutput.outputs, assetKeys)
    const assets = await loadSignedAssets(admin, payload.projectId, [...assetKeys])

    return json(outputWorkflowGraphResponseSchema.parse({
      ok: true,
      workflow: mapOutputWorkflowRow(workflowResponse.data as never),
      nodes,
      edges,
      run,
      artifacts: hydratedArtifacts,
      assets,
      graphRevision: graphRevision({
        workflow: workflowResponse.data as Record<string, unknown>,
        nodes: (nodeResponse.data ?? []) as Record<string, unknown>[],
        edges: (edgeResponse.data ?? []) as Record<string, unknown>[],
        steps: (stepResponse.data ?? []) as Record<string, unknown>[],
        artifacts: (artifactResponse.data ?? []) as Record<string, unknown>[],
      }),
      selectedNodeOutput,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output workflow graph.')
  }
})
