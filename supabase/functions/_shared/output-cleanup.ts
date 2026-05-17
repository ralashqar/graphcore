type SupabaseQuery = {
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQuery
  eq: (column: string, value: unknown) => SupabaseQuery
  in: (column: string, values: unknown[]) => SupabaseQuery
  delete: () => SupabaseQuery
  update: (values: Record<string, unknown>) => SupabaseQuery
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
  single: () => Promise<{ data: unknown; error: { message: string } | null }>
  then: Promise<{ data: unknown; error: { message: string } | null }>['then']
}

type SupabaseAdminClient = {
  from: (table: string) => SupabaseQuery
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  }
}

type OutputRequestRow = {
  id: string
  parent_request_id: string | null
  workflow_id: string | null
  latest_run_id: string | null
}

type OutputWorkflowRow = {
  id: string
}

type OutputWorkflowRunRow = {
  id: string
  workflow_id: string
  status: string
}

type OutputArtifactRow = {
  id: string
  workflow_id: string | null
  run_id: string | null
  asset_key: string | null
}

type ProjectAssetRow = {
  id: string
  key: string
  storage_path: string
  metadata: Record<string, unknown> | null
}

export type OutputCleanupCounts = {
  outputRequests: number
  outputWorkflows: number
  outputWorkflowRuns: number
  outputWorkflowRunSteps: number
  outputWorkflowNodes: number
  outputWorkflowEdges: number
  outputArtifacts: number
  projectAssets: number
  storageObjects: number
}

export type OutputCleanupResult = {
  counts: OutputCleanupCounts
  requestIds: string[]
  workflowIds: string[]
  runIds: string[]
  assetKeys: string[]
}

const emptyCounts = (): OutputCleanupCounts => ({
  outputRequests: 0,
  outputWorkflows: 0,
  outputWorkflowRuns: 0,
  outputWorkflowRunSteps: 0,
  outputWorkflowNodes: 0,
  outputWorkflowEdges: 0,
  outputArtifacts: 0,
  projectAssets: 0,
  storageObjects: 0,
})

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean)))
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function readStorageBucket(asset: ProjectAssetRow) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}
  const bucket = typeof metadata.storageBucket === 'string' && metadata.storageBucket.trim()
    ? metadata.storageBucket.trim()
    : 'project-assets'
  return bucket
}

function isOutputOwnedAsset(
  asset: ProjectAssetRow,
  workflowIds: Set<string>,
  runIds: Set<string>,
  projectId: string,
) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}
  const generatedBy = typeof metadata.generatedBy === 'string' ? metadata.generatedBy : ''
  const workflowId = typeof metadata.workflowId === 'string' ? metadata.workflowId : ''
  const runId = typeof metadata.runId === 'string' ? metadata.runId : ''
  const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : ''
  return generatedBy === 'output_workflow'
    || (workflowId && workflowIds.has(workflowId))
    || (runId && runIds.has(runId))
    || storagePath.startsWith(`generated/output-workflows/${projectId}/`)
}

function isStorageManagedPath(storagePath: string) {
  return Boolean(storagePath)
    && !storagePath.startsWith('external/')
    && !storagePath.startsWith('local-upload/')
}

function isActiveRunStatus(status: string) {
  return status === 'queued' || status === 'running'
}

async function selectRows<T>(query: SupabaseQuery) {
  const response = await query as { data: unknown; error: { message: string } | null }
  if (response.error) throw new Error(response.error.message)
  return (response.data ?? []) as T[]
}

async function countRows(
  admin: SupabaseAdminClient,
  table: string,
  column: string,
  values: string[],
  projectId?: string,
  draftId?: string,
) {
  if (values.length === 0) return 0
  let total = 0
  for (const valueBatch of chunk(values, 100)) {
    let query = admin.from(table).select('id').in(column, valueBatch)
    if (projectId) query = query.eq('project_id', projectId)
    if (draftId) query = query.eq('draft_id', draftId)
    const rows = await selectRows<{ id: string }>(query)
    total += rows.length
  }
  return total
}

async function deleteRowsByIds(
  admin: SupabaseAdminClient,
  table: string,
  ids: string[],
  projectId?: string,
  draftId?: string,
) {
  let deleted = 0
  for (const idBatch of chunk(unique(ids), 100)) {
    let query = admin.from(table).delete().in('id', idBatch)
    if (projectId) query = query.eq('project_id', projectId)
    if (draftId) query = query.eq('draft_id', draftId)
    const rows = await selectRows<{ id: string }>(query.select('id'))
    deleted += rows.length
  }
  return deleted
}

async function loadOutputRequests(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  requestIds?: string[],
) {
  let query = admin
    .from('output_requests')
    .select('id, parent_request_id, workflow_id, latest_run_id')
    .eq('project_id', projectId)
    .eq('draft_id', draftId)
  if (requestIds && requestIds.length > 0) {
    query = query.in('id', requestIds)
  }
  return selectRows<OutputRequestRow>(query)
}

async function loadOutputRequestDescendants(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  parentIds: string[],
) {
  const descendants: OutputRequestRow[] = []
  let frontier = unique(parentIds)
  const seen = new Set(frontier)
  while (frontier.length > 0) {
    const batchRows: OutputRequestRow[] = []
    for (const parentBatch of chunk(frontier, 100)) {
      batchRows.push(...await selectRows<OutputRequestRow>(
        admin
          .from('output_requests')
          .select('id, parent_request_id, workflow_id, latest_run_id')
          .eq('project_id', projectId)
          .eq('draft_id', draftId)
          .in('parent_request_id', parentBatch),
      ))
    }
    descendants.push(...batchRows)
    frontier = unique(batchRows.map((row) => row.id)).filter((id) => !seen.has(id))
    frontier.forEach((id) => seen.add(id))
  }
  return descendants
}

async function loadDraftWorkflows(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
) {
  return selectRows<OutputWorkflowRow>(
    admin
      .from('output_workflows')
      .select('id')
      .eq('project_id', projectId)
      .eq('draft_id', draftId),
  )
}

async function loadWorkflowsByIds(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  workflowIds: string[],
) {
  if (workflowIds.length === 0) return []
  const rows: OutputWorkflowRow[] = []
  for (const workflowBatch of chunk(workflowIds, 100)) {
    rows.push(...await selectRows<OutputWorkflowRow>(
      admin
        .from('output_workflows')
        .select('id')
        .eq('project_id', projectId)
        .eq('draft_id', draftId)
        .in('id', workflowBatch),
    ))
  }
  return rows
}

async function loadRunsForWorkflows(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  workflowIds: string[],
) {
  if (workflowIds.length === 0) return []
  const rows: OutputWorkflowRunRow[] = []
  for (const workflowBatch of chunk(workflowIds, 100)) {
    rows.push(...await selectRows<OutputWorkflowRunRow>(
      admin
        .from('output_workflow_runs')
        .select('id, workflow_id, status')
        .eq('project_id', projectId)
        .eq('draft_id', draftId)
        .in('workflow_id', workflowBatch),
    ))
  }
  return rows
}

async function loadRunsByIds(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  runIds: string[],
) {
  if (runIds.length === 0) return []
  const rows: OutputWorkflowRunRow[] = []
  for (const runBatch of chunk(runIds, 100)) {
    rows.push(...await selectRows<OutputWorkflowRunRow>(
      admin
        .from('output_workflow_runs')
        .select('id, workflow_id, status')
        .eq('project_id', projectId)
        .eq('draft_id', draftId)
        .in('id', runBatch),
    ))
  }
  return rows
}

function mergeRuns(rows: OutputWorkflowRunRow[]) {
  const byId = new Map<string, OutputWorkflowRunRow>()
  rows.forEach((row) => byId.set(row.id, row))
  return Array.from(byId.values())
}

async function loadArtifacts(
  admin: SupabaseAdminClient,
  projectId: string,
  draftId: string,
  workflowIds: string[],
  runIds: string[],
  includeAllDraftArtifacts: boolean,
) {
  if (includeAllDraftArtifacts) {
    return selectRows<OutputArtifactRow>(
      admin
        .from('output_artifacts')
        .select('id, workflow_id, run_id, asset_key')
        .eq('project_id', projectId)
        .eq('draft_id', draftId),
    )
  }

  const artifactsById = new Map<string, OutputArtifactRow>()
  for (const workflowBatch of chunk(workflowIds, 100)) {
    const rows = await selectRows<OutputArtifactRow>(
      admin
        .from('output_artifacts')
        .select('id, workflow_id, run_id, asset_key')
        .eq('project_id', projectId)
        .eq('draft_id', draftId)
        .in('workflow_id', workflowBatch),
    )
    rows.forEach((row) => artifactsById.set(row.id, row))
  }
  for (const runBatch of chunk(runIds, 100)) {
    const rows = await selectRows<OutputArtifactRow>(
      admin
        .from('output_artifacts')
        .select('id, workflow_id, run_id, asset_key')
        .eq('project_id', projectId)
        .eq('draft_id', draftId)
        .in('run_id', runBatch),
    )
    rows.forEach((row) => artifactsById.set(row.id, row))
  }
  return Array.from(artifactsById.values())
}

async function loadProjectAssetsByKey(
  admin: SupabaseAdminClient,
  projectId: string,
  assetKeys: string[],
) {
  const rows: ProjectAssetRow[] = []
  for (const keyBatch of chunk(unique(assetKeys), 100)) {
    rows.push(...await selectRows<ProjectAssetRow>(
      admin
        .from('project_assets')
        .select('id, key, storage_path, metadata')
        .eq('project_id', projectId)
        .in('key', keyBatch),
    ))
  }
  return rows
}

async function removeStorageObjects(admin: SupabaseAdminClient, assets: ProjectAssetRow[]) {
  let removedStorageObjects = 0
  const pathsByBucket = new Map<string, string[]>()
  for (const asset of assets) {
    const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path.trim() : ''
    if (!isStorageManagedPath(storagePath)) continue
    const bucket = readStorageBucket(asset)
    pathsByBucket.set(bucket, [...(pathsByBucket.get(bucket) ?? []), storagePath])
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    for (const pathBatch of chunk(unique(paths), 100)) {
      const removeResponse = await admin.storage.from(bucket).remove(pathBatch)
      if (!removeResponse.error) {
        removedStorageObjects += pathBatch.length
      } else {
        console.warn('[output-cleanup] failed to remove output storage objects.', {
          bucket,
          count: pathBatch.length,
          message: removeResponse.error.message,
        })
      }
    }
  }
  return removedStorageObjects
}

async function cancelActiveRuns(admin: SupabaseAdminClient, runIds: string[]) {
  const activeRunIds = unique(runIds)
  if (activeRunIds.length === 0) return
  const now = new Date().toISOString()
  for (const runBatch of chunk(activeRunIds, 100)) {
    const runResponse = await admin
      .from('output_workflow_runs')
      .update({
        status: 'cancelled',
        completed_at: now,
        heartbeat_at: now,
      })
      .in('id', runBatch)
      .in('status', ['queued', 'running'])
    if (runResponse.error) throw new Error(runResponse.error.message)

    const stepResponse = await admin
      .from('output_workflow_run_steps')
      .update({
        status: 'cancelled',
        completed_at: now,
      })
      .in('run_id', runBatch)
      .in('status', ['queued', 'running'])
    if (stepResponse.error) throw new Error(stepResponse.error.message)
  }
}

export async function cleanupOutputRequests(input: {
  admin: SupabaseAdminClient
  projectId: string
  draftId: string
  requestIds?: string[]
  workflowIds?: string[]
  includeAllDraftWorkflows?: boolean
  includeAllDraftArtifacts?: boolean
  allowActiveRuns?: boolean
  cancelActiveRuns?: boolean
  dryRun?: boolean
}): Promise<OutputCleanupResult> {
  const counts = emptyCounts()
  const rootRequests = await loadOutputRequests(input.admin, input.projectId, input.draftId, input.requestIds)
  if (input.requestIds && rootRequests.length !== unique(input.requestIds).length) {
    throw new Error('One or more output requests could not be found for cleanup.')
  }
  const childRequests = input.requestIds
    ? await loadOutputRequestDescendants(input.admin, input.projectId, input.draftId, rootRequests.map((row) => row.id))
    : []
  const requests = [
    ...rootRequests,
    ...childRequests.filter((child) => !rootRequests.some((root) => root.id === child.id)),
  ]

  const draftWorkflows = input.includeAllDraftWorkflows
    ? await loadDraftWorkflows(input.admin, input.projectId, input.draftId)
    : []
  const explicitWorkflows = input.workflowIds
    ? await loadWorkflowsByIds(input.admin, input.projectId, input.draftId, unique(input.workflowIds))
    : []
  if (input.workflowIds && explicitWorkflows.length !== unique(input.workflowIds).length) {
    throw new Error('One or more output workflows could not be found for cleanup.')
  }
  const workflowIds = unique([
    ...requests.map((row) => row.workflow_id),
    ...draftWorkflows.map((row) => row.id),
    ...explicitWorkflows.map((row) => row.id),
  ])
  const requestRunIds = requests.map((row) => row.latest_run_id)
  const runs = mergeRuns([
    ...await loadRunsForWorkflows(input.admin, input.projectId, input.draftId, workflowIds),
    ...await loadRunsByIds(input.admin, input.projectId, input.draftId, unique(requestRunIds)),
  ])
  const runIds = unique([...runs.map((row) => row.id), ...requestRunIds])
  const activeRunIds = unique(runs.filter((run) => isActiveRunStatus(run.status)).map((run) => run.id))

  if (activeRunIds.length > 0 && !input.allowActiveRuns) {
    throw new Error('Cancel the active output run before deleting this request.')
  }
  if (activeRunIds.length > 0 && input.cancelActiveRuns) {
    await cancelActiveRuns(input.admin, activeRunIds)
  }

  const artifacts = await loadArtifacts(
    input.admin,
    input.projectId,
    input.draftId,
    workflowIds,
    runIds,
    Boolean(input.includeAllDraftArtifacts),
  )
  const assetKeys = unique(artifacts.map((artifact) => artifact.asset_key))
  const workflowIdSet = new Set(workflowIds)
  const runIdSet = new Set(runIds)
  const outputOwnedAssets = (await loadProjectAssetsByKey(input.admin, input.projectId, assetKeys))
    .filter((asset) => isOutputOwnedAsset(asset, workflowIdSet, runIdSet, input.projectId))

  counts.outputRequests = requests.length
  counts.outputWorkflows = workflowIds.length
  counts.outputWorkflowRuns = runs.length
  counts.outputWorkflowRunSteps = await countRows(input.admin, 'output_workflow_run_steps', 'run_id', runIds, undefined, input.draftId)
  counts.outputWorkflowNodes = await countRows(input.admin, 'output_workflow_nodes', 'workflow_id', workflowIds, undefined, input.draftId)
  counts.outputWorkflowEdges = await countRows(input.admin, 'output_workflow_edges', 'workflow_id', workflowIds, undefined, input.draftId)
  counts.outputArtifacts = artifacts.length
  counts.storageObjects = outputOwnedAssets
    .map((asset) => asset.storage_path)
    .filter(isStorageManagedPath).length
  counts.projectAssets = outputOwnedAssets.length

  if (input.dryRun) {
    return {
      counts,
      requestIds: requests.map((row) => row.id),
      workflowIds,
      runIds,
      assetKeys: outputOwnedAssets.map((asset) => asset.key),
    }
  }

  counts.storageObjects = await removeStorageObjects(input.admin, outputOwnedAssets)
  counts.projectAssets = await deleteRowsByIds(
    input.admin,
    'project_assets',
    outputOwnedAssets.map((asset) => asset.id),
    input.projectId,
  )
  counts.outputArtifacts = await deleteRowsByIds(
    input.admin,
    'output_artifacts',
    artifacts.map((artifact) => artifact.id),
    input.projectId,
    input.draftId,
  )
  counts.outputWorkflowRuns = await deleteRowsByIds(
    input.admin,
    'output_workflow_runs',
    runIds,
    input.projectId,
    input.draftId,
  )
  counts.outputWorkflows = await deleteRowsByIds(
    input.admin,
    'output_workflows',
    workflowIds,
    input.projectId,
    input.draftId,
  )
  counts.outputRequests = await deleteRowsByIds(
    input.admin,
    'output_requests',
    requests.map((row) => row.id),
    input.projectId,
    input.draftId,
  )

  return {
    counts,
    requestIds: requests.map((row) => row.id),
    workflowIds,
    runIds,
    assetKeys: outputOwnedAssets.map((asset) => asset.key),
  }
}
