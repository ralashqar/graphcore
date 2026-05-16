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
  outputWorkflowRunStepSelect,
  outputWorkflowRunStepStatusSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  outputWorkflowGraphResponseSchema,
  outputWorkflowGraphRequestSchema,
  outputWorkflowNodeSchema,
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

function nodeHasUsefulPreview(node: Record<string, unknown>) {
  const preview = asRecord(asRecord(node.metadata).outputPreview)
  if (Object.keys(preview).length === 0) return false
  return readStringArray(preview.assetKeys).length > 0
    || readText(preview.text).length > 0
    || Object.keys(asRecord(preview.preview)).length > 0
}

function artifactBelongsToNode(artifact: Record<string, unknown>, node: Record<string, unknown>) {
  const metadata = asRecord(artifact.metadata)
  const nodeKey = readText(node.key)
  return readText(metadata.nodeKey) === nodeKey
    || readText(metadata.node_key) === nodeKey
    || readText(artifact.node_id) === readText(node.id)
}

function buildRecoveredNodeOutputPreview(input: {
  node: Record<string, unknown>
  artifacts: Record<string, unknown>[]
  step: Record<string, unknown> | null
}) {
  const stepPreview = asRecord(asRecord(input.step?.metadata).outputPreview)
  if (Object.keys(stepPreview).length > 0) {
    return {
      ...stepPreview,
      recoveredFromRunStepPreview: true,
    }
  }

  const relatedArtifacts = input.artifacts.filter((artifact) => artifactBelongsToNode(artifact, input.node))
  if (relatedArtifacts.length === 0) return null
  const assetKeys = relatedArtifacts.map((artifact) => readText(artifact.asset_key)).filter(Boolean)
  const artifactKeys = relatedArtifacts.map((artifact) => readText(artifact.key)).filter(Boolean)
  const role = readText(asRecord(relatedArtifacts[0]?.metadata).role) || readText(relatedArtifacts[0]?.kind)
  return {
    nodeKey: readText(input.node.key),
    nodeType: readText(input.node.node_type ?? input.node.nodeType),
    outputHash: readText(input.node.output_hash ?? input.node.outputHash) || readText(input.step?.output_hash ?? input.step?.outputHash) || hashOutputWorkflowValue({ artifactKeys, assetKeys }),
    outputBytes: 0,
    truncated: false,
    text: readText(relatedArtifacts[0]?.summary) || readText(relatedArtifacts[0]?.name) || 'Recovered durable output preview from output artifacts.',
    preview: {
      recoveredFromArtifacts: true,
      artifactKeys,
      artifactCount: relatedArtifacts.length,
    },
    assetKeys,
    role,
    recoveredFromArtifacts: true,
  }
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

function hasGraphNodeOutput(node: Record<string, unknown> | null | undefined, step?: Record<string, unknown> | null) {
  if (!node) return false
  if (readText(node.outputHash) || readText(node.output_hash)) return true
  const preview = asRecord(asRecord(node.metadata).outputPreview)
  if (Object.keys(preview).length > 0) return true
  if (step && (readText(step.outputHash) || readText(step.output_hash))) return true
  return false
}

function graphEdgeIsOptional(edge: Record<string, unknown>) {
  const metadata = asRecord(edge.metadata)
  if (metadata.optional === true || metadata.optionalDependency === true) return true
  const sourceNodeKey = readText(edge.sourceNodeKey ?? edge.source_node_key)
  const targetNodeKey = readText(edge.targetNodeKey ?? edge.target_node_key)
  const targetPort = readText(edge.targetPort ?? edge.target_port)
  return sourceNodeKey.startsWith('cinematic_v2_shot_')
    && sourceNodeKey.endsWith('_asset_pack')
    && targetNodeKey.startsWith('cinematic_v2_shot_')
    && targetNodeKey.endsWith('_video')
    && targetPort === 'references'
}

function buildGraphNodesWithCacheStatus(input: {
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  steps: Record<string, unknown>[]
}) {
  const nodeByKey = new Map(input.nodes.map((node) => [readText(node.key), node]))
  const stepByNodeKey = new Map(input.steps.map((step) => [readText(step.nodeKey ?? step.node_key), step]))
  return input.nodes.map((node) => {
    const key = readText(node.key)
    const step = stepByNodeKey.get(key) ?? null
    const stepStatus = readText(step?.status)
    const incomingEdges = input.edges.filter((edge) => readText(edge.targetNodeKey ?? edge.target_node_key) === key && !graphEdgeIsOptional(edge))
    const missingRequiredUpstreamKeys = incomingEdges
      .map((edge) => readText(edge.sourceNodeKey ?? edge.source_node_key))
      .filter((sourceKey) => !hasGraphNodeOutput(nodeByKey.get(sourceKey), stepByNodeKey.get(sourceKey)))
    const staleUpstreamKeys = incomingEdges
      .map((edge) => readText(edge.sourceNodeKey ?? edge.source_node_key))
      .filter((sourceKey) => {
        const source = nodeByKey.get(sourceKey)
        return Boolean(source && source.dirty === true && hasGraphNodeOutput(source, stepByNodeKey.get(sourceKey)))
      })
    const nodeHasOutput = hasGraphNodeOutput(node, step)
    const metadata = asRecord(node.metadata)
    const execution = asRecord(metadata.execution)
    const cacheStatus = ['queued', 'running'].includes(stepStatus)
      ? 'running'
      : missingRequiredUpstreamKeys.length > 0
        ? 'missing_upstream'
        : staleUpstreamKeys.length > 0 || metadata.dynamicCinematicStale === true
          ? 'stale_upstream'
          : !nodeHasOutput && incomingEdges.length > 0
            ? 'output_missing'
            : 'ready'
    return {
      ...node,
      metadata: {
        ...metadata,
        cacheStatus,
        missingRequiredUpstreamKeys,
        staleUpstreamKeys,
        execution: {
          ...execution,
          cacheStatus,
          missingRequiredUpstreamKeys,
          staleUpstreamKeys,
        },
      },
    }
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

    const revision = graphRevision({
      workflow: workflowResponse.data as Record<string, unknown>,
      nodes: (nodeResponse.data ?? []) as Record<string, unknown>[],
      edges: (edgeResponse.data ?? []) as Record<string, unknown>[],
      steps: (stepResponse.data ?? []) as Record<string, unknown>[],
      artifacts: (artifactResponse.data ?? []) as Record<string, unknown>[],
    })

    if (!payload.includeSelectedNodeOutput && readText(payload.knownGraphRevision) && readText(payload.knownGraphRevision) === revision) {
      return json(outputWorkflowGraphResponseSchema.parse({
        ok: true,
        unchanged: true,
        workflow: null,
        nodes: [],
        edges: [],
        run: null,
        artifacts: [],
        assets: [],
        graphRevision: revision,
        selectedNodeOutput: null,
      }))
    }

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
        let outputs = asRecord((selectedResponse.data as Record<string, unknown>).outputs)
        if (Object.keys(outputs).length === 0 && runRow) {
          const selectedStepResponse = await admin
            .from('output_workflow_run_steps')
            .select(outputWorkflowRunStepSelect)
            .eq('run_id', readText(runRow.id))
            .eq('workflow_id', payload.workflowId)
            .eq('node_key', selectedNodeKey)
            .order('updated_at', { ascending: false })
            .limit(1)
          if (selectedStepResponse.error) throw new Error(selectedStepResponse.error.message)
          const selectedStepRow = ((selectedStepResponse.data ?? []) as Record<string, unknown>[])[0] ?? null
          outputs = asRecord(selectedStepRow?.outputs)
        }
        if (Object.keys(outputs).length === 0) {
          outputs = buildRecoveredNodeOutputsFromArtifacts({
            node: selectedResponse.data as Record<string, unknown>,
            artifacts: (artifactResponse.data ?? []) as Record<string, unknown>[],
          })
        }
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
    const edges = ((edgeResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputWorkflowEdgeRow(row as never))
    const rawStepByNodeKey = new Map(((stepResponse.data ?? []) as Record<string, unknown>[]).map((row) => [readText(row.node_key), row] as const))
    const rawArtifacts = (artifactResponse.data ?? []) as Record<string, unknown>[]
    const mappedNodeRows = ((nodeResponse.data ?? []) as Record<string, unknown>[])
      .map((row) => mapOutputWorkflowNodeRow(row as never) as unknown as Record<string, unknown>)
      .map((node) => {
        if (nodeHasUsefulPreview(node)) return node
        const fallbackPreview = buildRecoveredNodeOutputPreview({
          node,
          artifacts: rawArtifacts,
          step: rawStepByNodeKey.get(readText(node.key)) ?? null,
        })
        if (!fallbackPreview) return node
        return {
          ...node,
          metadata: {
            ...asRecord(node.metadata),
            outputPreview: fallbackPreview,
            outputRecoverable: true,
          },
        }
      })
    const nodes = buildGraphNodesWithCacheStatus({
      nodes: mappedNodeRows,
      edges: edges as unknown as Record<string, unknown>[],
      steps: steps as unknown as Record<string, unknown>[],
    }).map((row) => outputWorkflowNodeSchema.parse(row))

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
      graphRevision: revision,
      selectedNodeOutput,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output workflow graph.')
  }
})
