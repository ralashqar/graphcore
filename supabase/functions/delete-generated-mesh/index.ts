import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  bindCharacterMeshAsset,
  deleteProjectAssetRow,
  formatFalLogMessages,
  isActiveMeshGenerationJobStatus,
  isTrellisGeneratedAsset,
  loadActiveMeshJobsForDefinition,
  loadCharacterDefinition,
  loadLatestMeshJobForDefinition,
  meshGenerationStatusResponseSchema,
  loadProjectAsset,
  updateMeshJob,
} from '../_shared/mesh-generation.ts'

const deleteGeneratedMeshRequestSchema = z.object({
  snapshot: z.object({
    project: z.object({ id: z.string() }),
    draft: z.object({ id: z.string() }),
  }),
  definitionKey: z.string().min(1),
})

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getCharacterRenderBinding(definition: Awaited<ReturnType<typeof loadCharacterDefinition>>) {
  const component = definition?.components.find((entry) => entry.type === 'render_3d_binding')
  const config = component && typeof component.config === 'object' && component.config !== null
    ? component.config as Record<string, unknown>
    : {}

  return {
    primaryMeshAssetKey: typeof config.primaryMeshAssetKey === 'string' ? config.primaryMeshAssetKey : null,
    previewImageAssetKey: typeof config.previewImageAssetKey === 'string' ? config.previewImageAssetKey : null,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'delete-generated-mesh')
    const admin = createAdminClient('delete-generated-mesh')
    const payload = deleteGeneratedMeshRequestSchema.parse(await request.json())

    if (!isUuidLike(payload.snapshot.project.id) || !isUuidLike(payload.snapshot.draft.id)) {
      throw new HttpError(400, 'A live GraphCore project/draft is required before deleting a generated mesh.')
    }

    const definition = await loadCharacterDefinition(client, payload.snapshot.draft.id, payload.definitionKey)
    if (!definition) throw new HttpError(404, `Definition ${payload.definitionKey} was not found.`)
    if (definition.kind !== 'character' && definition.kind !== 'item') {
      throw new HttpError(400, 'Generated mesh deletion is currently enabled for characters and items only.')
    }

    const renderBinding = getCharacterRenderBinding(definition)
    const deletedAssetKeys: string[] = []

    const activeJobs = await loadActiveMeshJobsForDefinition(client, payload.snapshot.draft.id, definition.key)
    for (const job of activeJobs) {
      if (job.providerRequestId) {
        const cancelResponse = await client.functions.invoke('ai-fal', {
          body: {
            action: 'cancel',
            model: job.model,
            requestId: job.providerRequestId,
            cancelUrl: job.cancelUrl,
          },
        })
        const cancelStatusData = (cancelResponse.data as { data?: unknown } | null)?.data
        await updateMeshJob(client, job.id, {
          status: 'cancelled',
          provider_status: 'CANCELLED',
          provider_logs: formatFalLogMessages(cancelStatusData),
          error_message: 'Mesh generation was cancelled by the user.',
        })
      } else if (isActiveMeshGenerationJobStatus(job.status)) {
        await updateMeshJob(client, job.id, {
          status: 'cancelled',
          provider_status: 'CANCELLED',
          error_message: 'Mesh generation was cancelled by the user.',
        })
      }

      const jobAsset = await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey)
      if (jobAsset && isTrellisGeneratedAsset(jobAsset)) {
        if (jobAsset.storagePath) {
          await admin.storage.from('project-assets').remove([jobAsset.storagePath]).catch(() => undefined)
        }
        await deleteProjectAssetRow(client, job.projectId, jobAsset.key)
        deletedAssetKeys.push(jobAsset.key)
      }
    }

    if (renderBinding.primaryMeshAssetKey) {
      const boundAsset = await loadProjectAsset(client, payload.snapshot.project.id, renderBinding.primaryMeshAssetKey)
      if (boundAsset && isTrellisGeneratedAsset(boundAsset) && !deletedAssetKeys.includes(boundAsset.key)) {
        if (boundAsset.storagePath) {
          await admin.storage.from('project-assets').remove([boundAsset.storagePath]).catch(() => undefined)
        }
        await deleteProjectAssetRow(client, payload.snapshot.project.id, boundAsset.key)
        deletedAssetKeys.push(boundAsset.key)
      }
    }

    await bindCharacterMeshAsset(client, payload.snapshot.draft.id, definition.key, null)

    const nextDefinition = await loadCharacterDefinition(client, payload.snapshot.draft.id, definition.key)
    const latestJob = await loadLatestMeshJobForDefinition(client, payload.snapshot.draft.id, definition.key)
    return json(meshGenerationStatusResponseSchema.parse({
      jobs: latestJob ? [latestJob] : [],
      definitions: nextDefinition ? [nextDefinition] : [],
      assets: [],
      deletedAssetKeys,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to delete the generated mesh.')
  }
})
