import '@supabase/functions-js/edge-runtime.d.ts'

import {
  getResourceGenerationMetadata,
  worldBuildBatchSchema,
  worldBuildDeletePlaceholderRequestSchema,
  worldBuildDeletePlaceholderResponseSchema,
  worldBuildJobSchema,
  type WorldBuildJob,
} from '../../../src/domain/worldBuild.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type BatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  status: string
  diagnostics: string[] | null
  plan_json: unknown[]
  created_at: string
  updated_at: string
}

type JobRow = {
  id: string
  batch_id: string
  plan_item_id: string
  kind: string
  status: string
  depends_on_job_ids: string[] | null
  target_keys: Record<string, string> | null
  prompt: string
  options: Record<string, unknown> | null
  result_context: Record<string, unknown> | null
  error_message: string | null
  order_index: number
  created_at: string
  updated_at: string
}

function getGenerationFromSnapshotResource(
  payload: z.infer<typeof worldBuildDeletePlaceholderRequestSchema>,
) {
  const resource =
    payload.resourceType === 'definition'
      ? payload.snapshot.definitions.find((entry) => entry.key === payload.key)
      : payload.resourceType === 'graph'
        ? payload.snapshot.graphs.find((entry) => entry.key === payload.key)
        : payload.snapshot.assets.find((entry) => entry.key === payload.key)

  return getResourceGenerationMetadata(resource as { metadata?: unknown } | null)
}

async function loadBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
) {
  const batchResponse = await client
    .from('world_build_batches')
    .select('id, draft_id, project_id, prompt, request_summary, status, diagnostics, plan_json, created_at, updated_at')
    .eq('id', batchId)
    .single()

  if (batchResponse.error || !batchResponse.data) {
    throw new Error(batchResponse.error?.message ?? `World build batch ${batchId} was not found.`)
  }

  const jobsResponse = await client
    .from('world_build_jobs')
    .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, result_context, error_message, order_index, created_at, updated_at')
    .eq('batch_id', batchId)
    .order('order_index', { ascending: true })

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  return {
    batch: batchResponse.data as BatchRow,
    jobs: (jobsResponse.data ?? []) as JobRow[],
  }
}

function terminalStatusFromJobs(jobs: WorldBuildJob[]) {
  const failed = jobs.some((job) => job.status === 'failed')
  const queuedOrRunning = jobs.some((job) => job.status === 'queued' || job.status === 'running')

  if (queuedOrRunning) return 'running'
  if (failed && jobs.some((job) => job.status === 'succeeded')) return 'completed_with_errors'
  if (failed) return 'failed'
  return 'completed'
}

function collectAssetKeys(jobs: JobRow[]) {
  const keys = new Set<string>()
  for (const job of jobs) {
    for (const [targetKey, targetValue] of Object.entries(job.target_keys ?? {})) {
      if ((targetKey === 'assetKey' || targetKey.startsWith('assetKey:')) && typeof targetValue === 'string') {
        keys.add(targetValue)
      }
    }
  }
  return [...keys]
}

async function updateJobsSkipped(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  jobIds: string[],
) {
  if (jobIds.length === 0) return

  const response = await client
    .from('world_build_jobs')
    .update({ status: 'skipped', error_message: 'Removed by user.' })
    .in('id', jobIds)

  if (response.error) {
    throw new Error(response.error.message)
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'delete-world-build-placeholder')
    const payload = worldBuildDeletePlaceholderRequestSchema.parse(await request.json())

    const generationSourceRow =
      payload.resourceType === 'definition'
        ? await client.from('project_definitions').select('metadata').eq('draft_id', payload.snapshot.draft.id).eq('key', payload.key).maybeSingle()
        : payload.resourceType === 'graph'
          ? await client.from('draft_graphs').select('metadata').eq('draft_id', payload.snapshot.draft.id).eq('key', payload.key).maybeSingle()
          : await client.from('project_assets').select('metadata').eq('project_id', payload.snapshot.project.id).eq('key', payload.key).maybeSingle()

    if (generationSourceRow.error) {
      throw new Error(generationSourceRow.error.message)
    }

    const generation = getResourceGenerationMetadata(generationSourceRow.data as { metadata?: unknown } | null)
      ?? getGenerationFromSnapshotResource(payload)
    if (!generation || generation.source !== 'global_prompt') {
      throw new HttpError(400, 'This resource is not a managed world-build placeholder.')
    }

    const loaded = await loadBatch(client, generation.batchId)
    const matchingJobs =
      payload.resourceType === 'definition'
        ? loaded.jobs.filter((job) => job.target_keys?.definitionKey === payload.key)
        : payload.resourceType === 'graph'
          ? loaded.jobs.filter((job) => job.target_keys?.graphKey === payload.key)
          : loaded.jobs.filter((job) => Object.values(job.target_keys ?? {}).includes(payload.key))

    const affectedJobs =
      payload.resourceType === 'asset'
        ? matchingJobs
        : loaded.jobs.filter((job) => matchingJobs.some((match) => match.plan_item_id === job.plan_item_id))

    const affectedJobIds = affectedJobs.map((job) => job.id)
    const deletedDefinitionKeys = payload.resourceType === 'definition' ? [payload.key] : []
    const deletedGraphKeys = payload.resourceType === 'graph' ? [payload.key] : []
    const deletedAssetKeys = payload.resourceType === 'definition'
      ? collectAssetKeys(affectedJobs)
      : payload.resourceType === 'asset'
        ? [payload.key]
        : []

    await updateJobsSkipped(client, affectedJobIds)

    if (payload.resourceType === 'definition') {
      const deleteDefinition = await client.from('project_definitions').delete().eq('draft_id', payload.snapshot.draft.id).eq('key', payload.key)
      if (deleteDefinition.error) throw new Error(deleteDefinition.error.message)
    }

    if (payload.resourceType === 'graph') {
      const deleteGraph = await client.from('draft_graphs').delete().eq('draft_id', payload.snapshot.draft.id).eq('key', payload.key)
      if (deleteGraph.error) throw new Error(deleteGraph.error.message)
    }

    if (deletedAssetKeys.length > 0) {
      const deleteAssets = await client.from('project_assets').delete().eq('project_id', payload.snapshot.project.id).in('key', deletedAssetKeys)
      if (deleteAssets.error) throw new Error(deleteAssets.error.message)
    }

    if (payload.resourceType === 'asset' && deletedAssetKeys.length === 0) {
      const deleteAsset = await client.from('project_assets').delete().eq('project_id', payload.snapshot.project.id).eq('key', payload.key)
      if (deleteAsset.error) throw new Error(deleteAsset.error.message)
    }

    const refreshed = await loadBatch(client, generation.batchId)
    const parsedJobs = refreshed.jobs.map((job) => worldBuildJobSchema.parse({
      id: job.id,
      batchId: job.batch_id,
      planItemId: job.plan_item_id,
      kind: job.kind,
      status: job.status,
      dependsOnJobIds: job.depends_on_job_ids ?? [],
      targetKeys: job.target_keys ?? {},
      prompt: job.prompt ?? '',
      options: job.options ?? {},
      resultContext: job.result_context ?? null,
      errorMessage: job.error_message ?? null,
      orderIndex: job.order_index,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }))

    const nextBatchStatus = terminalStatusFromJobs(parsedJobs)
    if (refreshed.batch.status !== nextBatchStatus) {
      const batchUpdate = await client.from('world_build_batches').update({ status: nextBatchStatus }).eq('id', refreshed.batch.id)
      if (batchUpdate.error) throw new Error(batchUpdate.error.message)
    }

    const finalLoaded = await loadBatch(client, generation.batchId)
    const finalJobs = finalLoaded.jobs.map((job) => worldBuildJobSchema.parse({
      id: job.id,
      batchId: job.batch_id,
      planItemId: job.plan_item_id,
      kind: job.kind,
      status: job.status,
      dependsOnJobIds: job.depends_on_job_ids ?? [],
      targetKeys: job.target_keys ?? {},
      prompt: job.prompt ?? '',
      options: job.options ?? {},
      resultContext: job.result_context ?? null,
      errorMessage: job.error_message ?? null,
      orderIndex: job.order_index,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }))

    const batch = worldBuildBatchSchema.parse({
      id: finalLoaded.batch.id,
      projectId: finalLoaded.batch.project_id,
      draftId: finalLoaded.batch.draft_id,
      prompt: finalLoaded.batch.prompt,
      requestSummary: finalLoaded.batch.request_summary,
      status: finalLoaded.batch.status,
      diagnostics: finalLoaded.batch.diagnostics ?? [],
      planItems: finalLoaded.batch.plan_json ?? [],
      createdAt: finalLoaded.batch.created_at,
      updatedAt: finalLoaded.batch.updated_at,
      jobs: finalJobs,
    })

    return json(worldBuildDeletePlaceholderResponseSchema.parse({
      batch,
      deleted: {
        definitions: deletedDefinitionKeys,
        graphs: deletedGraphKeys,
        assets: deletedAssetKeys,
      },
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to delete world-build placeholder.')
  }
})
