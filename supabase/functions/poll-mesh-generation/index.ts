import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  bindCharacterMeshAsset,
  deleteProjectAssetRow,
  formatFalLogMessages,
  loadCharacterDefinition,
  loadMeshJobById,
  meshGenerationStatusResponseSchema,
  loadProjectAsset,
  trellisGlbResultSchema,
  updateMeshJob,
} from '../_shared/mesh-generation.ts'

const meshGenerationPollRequestSchema = z.object({
  snapshot: z.object({
    project: z.object({ id: z.string() }),
    draft: z.object({ id: z.string() }),
  }),
  jobId: z.string().min(1),
})

function isTerminalMeshGenerationJobStatus(status: string) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getSourceUrl(metadata: Record<string, unknown>) {
  if (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl.trim()) return metadata.sourceUrl
  if (typeof metadata.previewUrl === 'string' && metadata.previewUrl.trim()) return metadata.previewUrl
  return null
}

async function resolveAssetAccessUrl(
  admin: ReturnType<typeof createAdminClient>,
  asset: Awaited<ReturnType<typeof loadProjectAsset>>,
) {
  if (!asset) return null

  const directUrl = getSourceUrl(asset.metadata)
  if (directUrl) return directUrl
  if (!asset.storagePath || asset.storagePath.startsWith('external/') || asset.storagePath.startsWith('local-upload/')) {
    return null
  }

  const bucket = typeof asset.metadata.storageBucket === 'string' && asset.metadata.storageBucket.trim()
    ? asset.metadata.storageBucket.trim()
    : 'project-assets'
  const signedResponse = await admin.storage.from(bucket).createSignedUrl(asset.storagePath, 60 * 60)
  if (signedResponse.error || !signedResponse.data?.signedUrl) return null
  return signedResponse.data.signedUrl
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function verifyUploadedMeshReadable(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  storagePath: string,
) {
  const attempts = [0, 300, 900]

  for (const delay of attempts) {
    if (delay > 0) await sleep(delay)

    const downloadResponse = await admin.storage.from(bucket).download(storagePath)
    if (!downloadResponse.error && downloadResponse.data) {
      return { ok: true as const, size: downloadResponse.data.size }
    }
  }

  const finalResponse = await admin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
  if (!finalResponse.error && finalResponse.data?.signedUrl) {
    return { ok: true as const, size: null }
  }

  return {
    ok: false as const,
    message: finalResponse.error?.message ?? 'The uploaded GLB could not be read back from Supabase Storage.',
  }
}

async function withSignedMeshUrl(
  admin: ReturnType<typeof createAdminClient>,
  asset: Awaited<ReturnType<typeof loadProjectAsset>>,
) {
  if (!asset || asset.kind !== 'mesh' || !asset.storagePath) return asset

  const generation = typeof asset.metadata.generation === 'object' && asset.metadata.generation !== null
    ? asset.metadata.generation as Record<string, unknown>
    : null
  const generationState = typeof generation?.state === 'string' ? generation.state : null
  if (generationState === 'pending' || generationState === 'running') return asset

  const bucket = typeof asset.metadata.storageBucket === 'string' && asset.metadata.storageBucket.trim()
    ? asset.metadata.storageBucket
    : 'project-assets'
  const signedResponse = await admin.storage.from(bucket).createSignedUrl(asset.storagePath, 60 * 60)
  if (signedResponse.error || !signedResponse.data?.signedUrl) return asset

  return {
    ...asset,
    metadata: {
      ...asset.metadata,
      sourceUrl: signedResponse.data.signedUrl,
      previewUrl: signedResponse.data.signedUrl,
    },
  }
}

async function cleanupFailedJob(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  projectId: string,
  draftId: string,
  definitionKey: string,
  targetMeshAssetKey: string,
  status: 'failed' | 'cancelled',
  errorMessage: string,
  providerStatus: string | null,
  providerLogs: string[],
) {
  const deletedAssetKeys: string[] = []
  const existingAsset = await loadProjectAsset(client, projectId, targetMeshAssetKey)
  if (existingAsset) {
    if (existingAsset.storagePath) {
      await admin.storage.from('project-assets').remove([existingAsset.storagePath]).catch(() => undefined)
    }
    await deleteProjectAssetRow(client, projectId, targetMeshAssetKey)
    deletedAssetKeys.push(targetMeshAssetKey)
  }

  await bindCharacterMeshAsset(client, draftId, definitionKey, null)
  await updateMeshJob(client, jobId, {
    status,
    provider_status: providerStatus,
    provider_logs: providerLogs,
    error_message: errorMessage,
  })

  const nextDefinition = await loadCharacterDefinition(client, draftId, definitionKey)
  const nextJob = await loadMeshJobById(client, jobId)
  return { nextDefinition, nextJob, deletedAssetKeys }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'poll-mesh-generation')
    const admin = createAdminClient('poll-mesh-generation')
    const payload = meshGenerationPollRequestSchema.parse(await request.json())

    if (!isUuidLike(payload.snapshot.project.id) || !isUuidLike(payload.snapshot.draft.id)) {
      throw new HttpError(400, 'A live GraphCore project/draft is required before polling mesh generation.')
    }

    const job = await loadMeshJobById(client, payload.jobId)
    if (!job) throw new HttpError(404, `Mesh generation job ${payload.jobId} was not found.`)

    if (isTerminalMeshGenerationJobStatus(job.status)) {
      const nextDefinition = await loadCharacterDefinition(client, job.draftId, job.definitionKey)
      const nextAsset = await withSignedMeshUrl(admin, await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey))
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: [job],
        definitions: nextDefinition ? [nextDefinition] : [],
        assets: nextAsset ? [nextAsset] : [],
        deletedAssetKeys: [],
      }))
    }

    const definition = await loadCharacterDefinition(client, job.draftId, job.definitionKey)
    if (!definition) {
      const deletedAssetKeys: string[] = []
      const existingAsset = await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey)
      if (existingAsset) {
        if (existingAsset.storagePath) {
          await admin.storage.from('project-assets').remove([existingAsset.storagePath]).catch(() => undefined)
        }
        await deleteProjectAssetRow(client, job.projectId, job.targetMeshAssetKey)
        deletedAssetKeys.push(job.targetMeshAssetKey)
      }

      await updateMeshJob(client, job.id, {
        status: 'failed',
        provider_status: 'FAILED',
        error_message: `Definition ${job.definitionKey} no longer exists in this draft.`,
      })
      const nextJob = await loadMeshJobById(client, job.id)
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: nextJob ? [nextJob] : [],
        definitions: [],
        assets: [],
        deletedAssetKeys,
      }))
    }
    const renderBinding = getCharacterRenderBinding(definition)

    if (!job.providerRequestId) {
      const previewAsset = await loadProjectAsset(client, job.projectId, job.sourceImageAssetKey)
      if (!previewAsset) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          'The concept image asset for this mesh job was not found.',
          'FAILED',
          [],
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const sourceImageUrl = await resolveAssetAccessUrl(admin, previewAsset)
      if (!sourceImageUrl) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          'The concept image asset does not expose a usable URL for Trellis 2.',
          'FAILED',
          [],
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const submitResponse = await client.functions.invoke('ai-fal', {
        body: {
          action: 'submit',
          model: job.model,
          input: {
            image_url: sourceImageUrl,
            resolution: 1024,
            texture_size: 2048,
            remesh: true,
            decimation_target: 50000,
          },
          logs: true,
        },
      })

      if (submitResponse.error) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          submitResponse.error.message,
          'FAILED',
          [],
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const submitData = (submitResponse.data as { requestId?: string | null; data?: unknown } | null) ?? {}
      const submitRequestId = submitData.requestId ?? null
      if (!submitRequestId) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          'Trellis 2 did not return a request id.',
          'FAILED',
          [],
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      await updateMeshJob(client, job.id, {
        status: 'running',
        provider_request_id: submitRequestId,
        provider_status: 'IN_QUEUE',
        provider_logs: formatFalLogMessages(submitData.data),
        error_message: null,
      })

      const nextJob = await loadMeshJobById(client, job.id)
      const nextDefinition = await loadCharacterDefinition(client, job.draftId, job.definitionKey)
      const nextAsset = await withSignedMeshUrl(admin, await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey))
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: nextJob ? [nextJob] : [],
        definitions: nextDefinition ? [nextDefinition] : [],
        assets: nextAsset ? [nextAsset] : [],
        deletedAssetKeys: [],
      }))
    }

    const statusResponse = await client.functions.invoke('ai-fal', {
      body: {
        action: 'status',
        model: job.model,
        requestId: job.providerRequestId,
        logs: true,
      },
    })

    if (statusResponse.error) {
      const failure = await cleanupFailedJob(
        client,
        admin,
        job.id,
        job.projectId,
        job.draftId,
        job.definitionKey,
        job.targetMeshAssetKey,
        'failed',
        statusResponse.error.message,
        'FAILED',
        [],
      )
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: failure.nextJob ? [failure.nextJob] : [],
        definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
        assets: [],
        deletedAssetKeys: failure.deletedAssetKeys,
      }))
    }

    const statusData = ((statusResponse.data as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
    const providerStatus = typeof statusData.status === 'string' ? statusData.status : job.providerStatus
    const providerLogs = formatFalLogMessages(statusData)

    if (providerStatus === 'COMPLETED') {
      const resultResponse = await client.functions.invoke('ai-fal', {
        body: {
          action: 'result',
          model: job.model,
          requestId: job.providerRequestId,
        },
      })

      if (resultResponse.error) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          resultResponse.error.message,
          providerStatus,
          providerLogs,
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const resultData = ((resultResponse.data as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
      const parsedResult = trellisGlbResultSchema.safeParse(resultData)
      if (!parsedResult.success) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          'Trellis 2 completed without returning a usable GLB URL.',
          providerStatus,
          providerLogs,
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const modelUrl = parsedResult.data.model_glb.url
      const fileResponse = await fetch(modelUrl)
      if (!fileResponse.ok) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          `The generated GLB could not be downloaded from Trellis 2 (${fileResponse.status}).`,
          providerStatus,
          providerLogs,
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const storagePath = job.storagePath ?? `${job.targetMeshAssetKey}.glb`
      const meshBlob = await fileResponse.blob()
      const uploadResponse = await admin.storage.from('project-assets').upload(storagePath, meshBlob, {
        contentType: fileResponse.headers.get('content-type') || 'model/gltf-binary',
        upsert: true,
      })
      if (uploadResponse.error) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          uploadResponse.error.message,
          providerStatus,
          providerLogs,
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const storageVerification = await verifyUploadedMeshReadable(admin, 'project-assets', storagePath)
      if (!storageVerification.ok) {
        const failure = await cleanupFailedJob(
          client,
          admin,
          job.id,
          job.projectId,
          job.draftId,
          job.definitionKey,
          job.targetMeshAssetKey,
          'failed',
          `The generated GLB uploaded to Supabase Storage but could not be read back. ${storageVerification.message}`,
          providerStatus,
          providerLogs,
        )
        return json(meshGenerationStatusResponseSchema.parse({
          jobs: failure.nextJob ? [failure.nextJob] : [],
          definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
          assets: [],
          deletedAssetKeys: failure.deletedAssetKeys,
        }))
      }

      const assetUpdate = await client.from('project_assets').update({
        name: `${definition.name} Mesh`,
        kind: 'mesh',
        mime_type: 'model/gltf-binary',
        storage_path: storagePath,
        metadata: {
          definitionKey: job.definitionKey,
          generatedBy: 'trellis_mesh',
          provider: 'fal',
          model: job.model,
          requestId: job.providerRequestId,
          sourceImageAssetKey: job.sourceImageAssetKey,
          storageBucket: 'project-assets',
          storagePath,
          generatedAt: new Date().toISOString(),
          generation: {
            batchId: null,
            jobId: job.id,
            state: 'completed',
            placeholder: false,
            source: 'mesh_generation',
          },
        },
      }).eq('project_id', job.projectId).eq('key', job.targetMeshAssetKey)

      if (assetUpdate.error) throw new Error(assetUpdate.error.message)

      await bindCharacterMeshAsset(client, job.draftId, job.definitionKey, job.targetMeshAssetKey)
      await updateMeshJob(client, job.id, {
        status: 'succeeded',
        provider_status: providerStatus,
        provider_logs: providerLogs,
        error_message: null,
      })

      const nextJob = await loadMeshJobById(client, job.id)
      const nextDefinition = await loadCharacterDefinition(client, job.draftId, job.definitionKey)
      const nextAsset = await withSignedMeshUrl(admin, await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey))
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: nextJob ? [nextJob] : [],
        definitions: nextDefinition ? [nextDefinition] : [],
        assets: nextAsset ? [nextAsset] : [],
        deletedAssetKeys: [],
      }))
    }

    if (providerStatus === 'FAILED' || providerStatus === 'CANCELLED' || typeof statusData.error === 'string') {
      const failure = await cleanupFailedJob(
        client,
        admin,
        job.id,
        job.projectId,
        job.draftId,
        job.definitionKey,
        job.targetMeshAssetKey,
        providerStatus === 'CANCELLED' ? 'cancelled' : 'failed',
        typeof statusData.error === 'string' ? statusData.error : providerStatus === 'CANCELLED' ? 'Mesh generation was cancelled.' : 'Mesh generation failed.',
        providerStatus,
        providerLogs,
      )
      return json(meshGenerationStatusResponseSchema.parse({
        jobs: failure.nextJob ? [failure.nextJob] : [],
        definitions: failure.nextDefinition ? [failure.nextDefinition] : [],
        assets: [],
        deletedAssetKeys: failure.deletedAssetKeys,
      }))
    }

    await updateMeshJob(client, job.id, {
      status: 'running',
      provider_status: providerStatus,
      provider_logs: providerLogs,
      error_message: null,
    })

    const nextJob = await loadMeshJobById(client, job.id)
    const nextDefinition = await loadCharacterDefinition(client, job.draftId, job.definitionKey)
    const nextAsset = renderBinding.primaryMeshAssetKey
      ? await withSignedMeshUrl(admin, await loadProjectAsset(client, job.projectId, renderBinding.primaryMeshAssetKey))
      : await withSignedMeshUrl(admin, await loadProjectAsset(client, job.projectId, job.targetMeshAssetKey))

    return json(meshGenerationStatusResponseSchema.parse({
      jobs: nextJob ? [nextJob] : [],
      definitions: nextDefinition ? [nextDefinition] : [],
      assets: nextAsset ? [nextAsset] : [],
      deletedAssetKeys: [],
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to poll mesh generation.')
  }
})
