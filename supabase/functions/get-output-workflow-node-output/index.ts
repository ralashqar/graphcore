import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  compactRecordForStatus,
  mapOutputWorkflowRunStepRow,
  outputArtifactSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunStepSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  outputWorkflowNodeOutputRequestSchema,
  outputWorkflowNodeOutputResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

type DatabaseClient = ReturnType<typeof createAdminClient>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

function artifactBelongsToNode(artifact: Record<string, unknown>, node: Record<string, unknown>) {
  const metadata = asRecord(artifact.metadata)
  const nodeKey = readText(node.key)
  return readText(metadata.nodeKey) === nodeKey
    || readText(metadata.node_key) === nodeKey
    || readText(artifact.node_id) === readText(node.id)
}

function buildRecoveredNodeOutputsFromArtifacts(input: {
  node: Record<string, unknown>
  artifacts: Record<string, unknown>[]
}) {
  const relatedArtifacts = input.artifacts.filter((artifact) => artifactBelongsToNode(artifact, input.node))
  if (relatedArtifacts.length === 0) return {}
  const images = relatedArtifacts
    .filter((artifact) => readText(artifact.kind) === 'image' && readText(artifact.asset_key))
    .map((artifact) => ({
      assetKey: readText(artifact.asset_key),
      mimeType: readText(artifact.mime_type),
      role: readText(asRecord(artifact.metadata).role) || 'image',
      artifactKey: readText(artifact.key),
      nodeKey: readText(input.node.key),
      metadata: asRecord(artifact.metadata),
      recoveredFromArtifact: true,
    }))
  const artifactOutputs = relatedArtifacts.map((artifact) => ({
    key: readText(artifact.key),
    name: readText(artifact.name),
    kind: readText(artifact.kind),
    assetKey: readText(artifact.asset_key) || null,
    mimeType: readText(artifact.mime_type),
    summary: readText(artifact.summary),
    metadata: asRecord(artifact.metadata),
    recoveredFromArtifact: true,
  }))
  if (images.length > 0) return { image: images[0], images, artifact: artifactOutputs[0] ?? {}, artifacts: artifactOutputs, recoveredFromArtifacts: true }
  return { artifact: artifactOutputs[0] ?? {}, artifacts: artifactOutputs, recoveredFromArtifacts: true }
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
  const cleanKeys = [...new Set(assetKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 120)
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
    const { client } = await requireUserClient(request, 'get-output-workflow-node-output')
    const admin = createAdminClient('get-output-workflow-node-output')
    const payload = outputWorkflowNodeOutputRequestSchema.parse(await request.json())

    const accessResponse = await client
      .from('output_workflows')
      .select('id')
      .eq('id', payload.workflowId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .maybeSingle()
    if (accessResponse.error) throw new Error(accessResponse.error.message)
    if (!accessResponse.data) throw new HttpError(404, 'Output workflow not found.')

    const [workflowResponse, nodeRowsResponse, edgeResponse, artifactResponse, nodeResponse] = await Promise.all([
      admin.from('output_workflows').select(outputWorkflowSelect).eq('id', payload.workflowId).eq('draft_id', payload.draftId).single(),
      admin.from('output_workflow_nodes').select('id, key, output_hash, dirty, metadata, updated_at').eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId),
      admin.from('output_workflow_edges').select(outputWorkflowEdgeSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId),
      admin.from('output_artifacts').select(outputArtifactSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId).order('created_at', { ascending: false }),
      admin.from('output_workflow_nodes').select(outputWorkflowNodeSelect).eq('workflow_id', payload.workflowId).eq('draft_id', payload.draftId).eq('key', payload.nodeKey).maybeSingle(),
    ])
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Output workflow not found.')
    if (nodeRowsResponse.error) throw new Error(nodeRowsResponse.error.message)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    if (!nodeResponse.data) throw new HttpError(404, 'Output workflow node not found.')

    let runRow: Record<string, unknown> | null = null
    const runId = readText(payload.runId)
    if (runId) {
      const runResponse = await admin
        .from('output_workflow_runs')
        .select('id, workflow_id')
        .eq('id', runId)
        .eq('workflow_id', payload.workflowId)
        .eq('draft_id', payload.draftId)
        .maybeSingle()
      if (runResponse.error) throw new Error(runResponse.error.message)
      runRow = runResponse.data as Record<string, unknown> | null
    } else {
      const runResponse = await admin
        .from('output_workflow_runs')
        .select('id, workflow_id')
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
          .select(outputWorkflowRunStepSelect)
          .eq('run_id', readText(runRow.id))
          .eq('workflow_id', payload.workflowId)
          .eq('node_key', payload.nodeKey)
          .order('updated_at', { ascending: false })
          .limit(1)
      : { data: [], error: null }
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const allStepResponse = runRow
      ? await admin
          .from('output_workflow_run_steps')
          .select('node_key, status, output_hash, updated_at')
          .eq('run_id', readText(runRow.id))
      : { data: [], error: null }
    if (allStepResponse.error) throw new Error(allStepResponse.error.message)
    const revision = graphRevision({
      workflow: workflowResponse.data as Record<string, unknown>,
      nodes: (nodeRowsResponse.data ?? []) as Record<string, unknown>[],
      edges: (edgeResponse.data ?? []) as Record<string, unknown>[],
      steps: (allStepResponse.data ?? []) as Record<string, unknown>[],
      artifacts: (artifactResponse.data ?? []) as Record<string, unknown>[],
    })

    let outputs = asRecord((nodeResponse.data as Record<string, unknown>).outputs)
    const selectedStepRow = ((stepResponse.data ?? []) as Record<string, unknown>[])[0] ?? null
    if (Object.keys(outputs).length === 0) outputs = asRecord(selectedStepRow?.outputs)
    if (Object.keys(outputs).length === 0) {
      outputs = buildRecoveredNodeOutputsFromArtifacts({
        node: nodeResponse.data as Record<string, unknown>,
        artifacts: (artifactResponse.data ?? []) as Record<string, unknown>[],
      })
    }
    const compact = compactRecordForStatus(outputs, 650_000)
    const selectedNodeOutput = {
      nodeKey: payload.nodeKey,
      outputs: compact,
      truncated: compact._truncatedForStatus === true,
    }
    const assetKeys = new Set<string>()
    addAssetKey(selectedNodeOutput.outputs, assetKeys)
    const assets = await loadSignedAssets(admin, payload.projectId, [...assetKeys])
    console.info('[GraphCore] output workflow selected node output hydrated.', {
      workflowId: payload.workflowId,
      runId: readText(runRow?.id) || null,
      nodeKey: payload.nodeKey,
      graphRevision: revision,
      outputRecoveredFromArtifact: asRecord(selectedNodeOutput.outputs).recoveredFromArtifacts === true,
      signedAssetCount: assets.length,
      truncated: selectedNodeOutput.truncated,
    })

    return json(outputWorkflowNodeOutputResponseSchema.parse({
      ok: true,
      workflowId: payload.workflowId,
      runId: readText(runRow?.id) || null,
      graphRevision: revision,
      selectedNodeOutput,
      assets,
      step: selectedStepRow ? mapOutputWorkflowRunStepRow(selectedStepRow as never) : null,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output workflow node output.')
  }
})
