import '@supabase/functions-js/edge-runtime.d.ts'

import {
  resetProjectWorldRequestSchema,
  resetProjectWorldResponseSchema,
} from '../../../src/domain/worldGraph.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { cleanupOutputRequests } from '../_shared/output-cleanup.ts'

type DraftRow = {
  id: string
  project_id: string
}

type ProjectAssetRow = {
  id: string
  key: string
  storage_path: string
  metadata: Record<string, unknown> | null
}

type VisualGenerationJobRow = {
  id: string
  target_keys: Record<string, unknown> | null
  input: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function verifyDraftAccess(client: Awaited<ReturnType<typeof requireUserClient>>['client'], projectId: string, draftId: string) {
  const response = await client
    .from('project_drafts')
    .select('id, project_id')
    .eq('id', draftId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (response.error) {
    throw new Error(response.error.message)
  }

  if (!response.data) {
    throw new HttpError(404, 'The selected project draft was not found or is not accessible.')
  }

  return response.data as DraftRow
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

async function deleteGeneratedWorldAssets(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  draftId: string,
) {
  const generatedWorldAssetPrefixes = [
    `generated/world-icons/${draftId}/`,
    `generate/world-icons/${draftId}/`,
    `generated/wiki-concept-images/${draftId}/`,
    `generated/entity-reference-sheets/${draftId}/`,
    `generated/wiki-brand-atlas/${draftId}/`,
  ]
  const assetResponse = await admin
    .from('project_assets')
    .select('id, key, storage_path, metadata')
    .eq('project_id', projectId)

  if (assetResponse.error) {
    throw new Error(assetResponse.error.message)
  }

  const assets = ((assetResponse.data ?? []) as ProjectAssetRow[]).filter((asset) => {
    const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path.trim() : ''
    return generatedWorldAssetPrefixes.some((prefix) => storagePath.startsWith(prefix))
  })
  if (assets.length === 0) {
    return { projectAssets: 0, storageObjects: 0 }
  }

  let removedStorageObjects = 0
  const pathsByBucket = new Map<string, string[]>()
  for (const asset of assets) {
    const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path.trim() : ''
    if (!storagePath || storagePath.startsWith('external/') || storagePath.startsWith('local-upload/')) continue
    const bucket = readStorageBucket(asset)
    pathsByBucket.set(bucket, [...(pathsByBucket.get(bucket) ?? []), storagePath])
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    for (const pathBatch of chunk([...new Set(paths)], 100)) {
      const removeResponse = await admin.storage.from(bucket).remove(pathBatch)
      if (!removeResponse.error) {
        removedStorageObjects += pathBatch.length
      } else {
        console.warn('[reset-project-world] failed to remove generated world asset storage objects.', {
          bucket,
          count: pathBatch.length,
          message: removeResponse.error.message,
        })
      }
    }
  }

  let deletedAssetRows = 0
  for (const idBatch of chunk(assets.map((asset) => asset.id), 100)) {
    const deleteResponse = await admin
      .from('project_assets')
      .delete()
      .eq('project_id', projectId)
      .in('id', idBatch)
      .select('id')
    if (deleteResponse.error) {
      throw new Error(deleteResponse.error.message)
    }
    deletedAssetRows += deleteResponse.data?.length ?? 0
  }

  return { projectAssets: deletedAssetRows, storageObjects: removedStorageObjects }
}

async function clearResetWorldWikiMetadata(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
) {
  const metadataResponse = await admin
    .from('project_drafts')
    .select('metadata')
    .eq('id', draftId)
    .single()
  if (metadataResponse.error) {
    throw new Error(metadataResponse.error.message)
  }

  const currentMetadata = asRecord(metadataResponse.data?.metadata)
  const { worldWiki: _worldWiki, ...metadataWithoutWorldWiki } = currentMetadata
  const updateResponse = await admin
    .from('project_drafts')
    .update({ metadata: metadataWithoutWorldWiki })
    .eq('id', draftId)
  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }
}

async function cancelActiveWorldConceptVisualJobs(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  draftId: string,
) {
  const jobsResponse = await admin
    .from('visual_generation_jobs')
    .select('id, target_keys, input')
    .eq('project_id', projectId)
    .eq('draft_id', draftId)
    .eq('kind', 'wiki_visual')
    .in('status', ['queued', 'running'])

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  const worldConceptJobs = ((jobsResponse.data ?? []) as VisualGenerationJobRow[]).filter((job) => {
    const targetKeys = asRecord(job.target_keys)
    const input = asRecord(job.input)
    const role = readString(targetKeys.role) || readString(input.role)
    return role === 'world_concept_image'
  })

  let cancelled = 0
  for (const job of worldConceptJobs) {
    const cancelResponse = await admin.rpc('cancel_visual_generation_job', { job_id: job.id })
    if (cancelResponse.error) {
      throw new Error(cancelResponse.error.message)
    }
    if (cancelResponse.data) cancelled += 1
  }

  return { visualGenerationJobs: cancelled }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { client } = await requireUserClient(request, 'reset-project-world')
    const payload = resetProjectWorldRequestSchema.parse(await request.json())
    await verifyDraftAccess(client, payload.projectId, payload.draftId)

    const admin = createAdminClient('reset-project-world')
    const cancelledVisualJobs = await cancelActiveWorldConceptVisualJobs(admin, payload.projectId, payload.draftId)
    const deletedOutputs = await cleanupOutputRequests({
      admin,
      projectId: payload.projectId,
      draftId: payload.draftId,
      includeAllDraftWorkflows: true,
      includeAllDraftArtifacts: true,
      allowActiveRuns: true,
      cancelActiveRuns: true,
    })
    const deletedGeneratedAssets = await deleteGeneratedWorldAssets(admin, payload.projectId, payload.draftId)
    const rpcResponse = await admin.rpc('reset_project_world', {
      target_project_id: payload.projectId,
      target_draft_id: payload.draftId,
    })

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message)
    }
    await clearResetWorldWikiMetadata(admin, payload.draftId)

    return json(resetProjectWorldResponseSchema.parse({
      ok: true,
      projectId: payload.projectId,
      draftId: payload.draftId,
      deleted: {
        ...(rpcResponse.data ?? {}),
        ...deletedGeneratedAssets,
        ...cancelledVisualJobs,
        outputRequests: deletedOutputs.counts.outputRequests,
        outputWorkflows: deletedOutputs.counts.outputWorkflows,
        outputWorkflowRuns: deletedOutputs.counts.outputWorkflowRuns,
        outputWorkflowRunSteps: deletedOutputs.counts.outputWorkflowRunSteps,
        outputWorkflowNodes: deletedOutputs.counts.outputWorkflowNodes,
        outputWorkflowEdges: deletedOutputs.counts.outputWorkflowEdges,
        outputArtifacts: deletedOutputs.counts.outputArtifacts,
        outputProjectAssets: deletedOutputs.counts.projectAssets,
        outputStorageObjects: deletedOutputs.counts.storageObjects,
      },
    }))
  } catch (error) {
    return errorResponse(error, 'Resetting the project world failed.')
  }
})
