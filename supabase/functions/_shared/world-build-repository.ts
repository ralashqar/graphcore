import { normalizeProviderQueueHandle } from '../../../src/core/providerQueue.ts'

export type DatabaseClient = any

export type WorldBuildBatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  planner_mode: string | null
  status: string
  diagnostics: string[] | null
  plan_json: unknown[]
  cinematic_plan: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type WorldBuildJobRow = {
  id: string
  batch_id: string
  plan_item_id: string
  kind: string
  status: string
  depends_on_job_ids: string[] | null
  target_keys: Record<string, string> | null
  prompt: string
  options: Record<string, unknown> | null
  provider_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  result_context: Record<string, unknown> | null
  error_message: string | null
  order_index: number
  attempt_count: number | null
  next_retry_at: string | null
  lease_expires_at: string | null
  last_transition_at: string | null
  created_at: string
  updated_at: string
}

const worldBuildBatchSelect = 'id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, plan_json, cinematic_plan, created_at, updated_at'
const worldBuildJobSelect = 'id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, provider_request_id, status_url, response_url, cancel_url, result_context, error_message, order_index, attempt_count, next_retry_at, lease_expires_at, last_transition_at, created_at, updated_at'

export async function loadWorldBuildBatch(
  client: DatabaseClient,
  batchId: string,
) {
  const batchResponse = await client
    .from('world_build_batches')
    .select(worldBuildBatchSelect)
    .eq('id', batchId)
    .single()

  if (batchResponse.error || !batchResponse.data) {
    throw new Error(batchResponse.error?.message ?? `World build batch ${batchId} was not found.`)
  }

  const jobsResponse = await client
    .from('world_build_jobs')
    .select(worldBuildJobSelect)
    .eq('batch_id', batchId)
    .order('order_index', { ascending: true })

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  return {
    batch: batchResponse.data as WorldBuildBatchRow,
    jobs: (jobsResponse.data ?? []) as WorldBuildJobRow[],
  }
}

export async function loadWorldBuildBatchResources(
  client: DatabaseClient,
  draftId: string,
  projectId: string,
  batchId: string,
) {
  const batchJobsResponse = await client
    .from('world_build_jobs')
    .select('kind, target_keys')
    .eq('batch_id', batchId)

  if (batchJobsResponse.error) {
    throw new Error(batchJobsResponse.error.message)
  }

  const existingDefinitionKeys = Array.from(new Set(
    ((batchJobsResponse.data ?? []) as Array<{ kind?: string | null; target_keys?: Record<string, unknown> | null }>)
      .flatMap((job) => {
        const definitionKey = typeof job.target_keys?.definitionKey === 'string' ? job.target_keys.definitionKey : null
        if (!definitionKey) return []
        if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image' || job.kind === 'environment_concept_image') {
          return [definitionKey]
        }
        return []
      }),
  ))

  const [definitionsResponse, graphsResponse, graphNodesResponse, graphEdgesResponse, assetsResponse] = await Promise.all([
    client
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
    client
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    client
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', projectId)
      .contains('metadata', { generation: { batchId } }),
  ])

  if (definitionsResponse.error || graphsResponse.error || assetsResponse.error || graphNodesResponse.error || graphEdgesResponse.error) {
    throw new Error(
      definitionsResponse.error?.message
      ?? graphsResponse.error?.message
      ?? graphNodesResponse.error?.message
      ?? graphEdgesResponse.error?.message
      ?? assetsResponse.error?.message
      ?? 'Failed to load world build resources.',
    )
  }

  const directDefinitionsResponse = existingDefinitionKeys.length > 0
    ? await client
        .from('project_definitions')
        .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
        .eq('draft_id', draftId)
        .in('key', existingDefinitionKeys)
    : { data: [], error: null }

  if (directDefinitionsResponse.error) {
    throw new Error(directDefinitionsResponse.error.message)
  }

  const mergedDefinitionRows = Array.from(
    new Map(
      [...(definitionsResponse.data ?? []), ...(directDefinitionsResponse.data ?? [])].map((definition) => [definition.key, definition]),
    ).values(),
  )

  const definitions = await Promise.all(mergedDefinitionRows.map(async (definition) => {
    const componentsResponse = await client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)

    if (componentsResponse.error) {
      throw new Error(componentsResponse.error.message)
    }

    return {
      id: definition.id,
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary ?? '',
      status: definition.status,
      iconAssetKey: definition.icon_asset_key,
      archetypeKey: definition.archetype_key,
      tags: definition.tags ?? [],
      schemaVersion: definition.schema_version ?? 1,
      metadata: definition.metadata ?? {},
      llmHints: definition.llm_hints ?? {},
      assetRefs: definition.asset_refs ?? [],
      definitionData: definition.definition_data ?? {},
      fieldValues: [],
      customFields: [],
      components: (componentsResponse.data ?? []).map((component) => ({
        type: component.component_type,
        config: component.config ?? {},
      })),
    }
  }))

  const graphRows = graphsResponse.data ?? []
  const nodes = graphNodesResponse.data ?? []
  const edges = graphEdgesResponse.data ?? []

  const graphs = graphRows.map((graph) => ({
    id: graph.id,
    key: graph.key,
    name: graph.name,
    graphType: graph.graph_type,
    summary: graph.summary ?? '',
    entryNodeKey: graph.entry_node_key,
    metadata: graph.metadata ?? {},
    llmHints: graph.llm_hints ?? {},
    nodes: nodes
      .filter((node) => node.graph_id === graph.id)
      .map((node) => ({
        id: node.id,
        key: node.key,
        type: node.node_type,
        title: node.title,
        templateKey: node.template_key,
        subtitle: node.subtitle,
        position: { x: Number(node.position_x), y: Number(node.position_y) },
        body: node.body ?? {},
        condition: node.condition_expr,
        effects: node.effect_ops ?? [],
        ports: node.ports ?? [],
        display: node.display ?? {},
        metadata: node.metadata ?? {},
      })),
    edges: edges
      .filter((edge) => edge.graph_id === graph.id)
      .map((edge) => ({
        id: edge.id,
        key: edge.key,
        source: { nodeKey: edge.source_node_key, portId: edge.source_port },
        target: { nodeKey: edge.target_node_key, portId: edge.target_port },
        label: edge.label,
        condition: edge.condition_expr,
        metadata: edge.metadata ?? {},
      })),
  }))

  const assets = (assetsResponse.data ?? []).map((asset) => ({
    id: asset.id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }))

  return { definitions, graphs, assets }
}

export function parseWorldBuildJobRow(
  row: WorldBuildJobRow,
  schema: { parse: (value: unknown) => unknown },
) {
  const queueHandle = normalizeProviderQueueHandle({
    resultContext: row.result_context,
    overrides: {
      providerRequestId: row.provider_request_id,
      statusUrl: row.status_url,
      responseUrl: row.response_url,
      cancelUrl: row.cancel_url,
    },
  })

  return schema.parse({
    id: row.id,
    batchId: row.batch_id,
    planItemId: row.plan_item_id,
    kind: row.kind,
    status: row.status,
    dependsOnJobIds: row.depends_on_job_ids ?? [],
    targetKeys: row.target_keys ?? {},
    prompt: row.prompt ?? '',
    options: row.options ?? {},
    providerRequestId: queueHandle.providerRequestId,
    statusUrl: queueHandle.statusUrl,
    responseUrl: queueHandle.responseUrl,
    cancelUrl: queueHandle.cancelUrl,
    resultContext: row.result_context ?? null,
    errorMessage: row.error_message ?? null,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export async function updateWorldBuildJob(
  client: DatabaseClient,
  jobId: string,
  changes: Record<string, unknown>,
) {
  const nextChanges = { ...changes }
  if (
    !Object.prototype.hasOwnProperty.call(nextChanges, 'last_transition_at')
    && (
      Object.prototype.hasOwnProperty.call(nextChanges, 'status')
      || Object.prototype.hasOwnProperty.call(nextChanges, 'result_context')
      || Object.prototype.hasOwnProperty.call(nextChanges, 'error_message')
    )
  ) {
    nextChanges.last_transition_at = new Date().toISOString()
  }
  const response = await client.from('world_build_jobs').update(nextChanges).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

export async function updateWorldBuildBatch(
  client: DatabaseClient,
  batchId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_batches').update(changes).eq('id', batchId)
  if (response.error) throw new Error(response.error.message)
}

export function readWorldBuildNumericResultContextValue(resultContext: Record<string, unknown> | null | undefined, key: string) {
  const value = resultContext?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function buildWorldBuildBatchFailureStatus(jobs: WorldBuildJobRow[], failedJobId: string) {
  const nextJobs = jobs.map((job) => (
    job.id === failedJobId
      ? { ...job, status: 'failed' }
      : job
  ))
  const hasFailed = nextJobs.some((job) => job.status === 'failed')
  const hasRunning = nextJobs.some((job) => job.status === 'queued' || job.status === 'running')
  if (hasRunning) return 'running'
  if (hasFailed && nextJobs.some((job) => job.status === 'succeeded')) return 'completed_with_errors'
  return 'failed'
}
