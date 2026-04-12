import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  bindCharacterMeshAsset,
  deleteProjectAssetRow,
  formatFalLogMessages,
  isTrellisGeneratedAsset,
  loadActiveMeshJobsForDefinition,
  loadCharacterDefinition,
  loadLatestMeshJobForDefinition,
  loadProjectAsset,
  meshGenerationStatusResponseSchema,
  uniqueMeshAssetKey,
  updateMeshJob,
} from '../_shared/mesh-generation.ts'

const meshGenerationStartRequestSchema = z.object({
  snapshot: z.object({
    project: z.object({ id: z.string() }),
    draft: z.object({ id: z.string() }),
  }),
  definitionKey: z.string().min(1),
})

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getSourceUrl(metadata: Record<string, unknown>) {
  if (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl.trim()) return metadata.sourceUrl
  if (typeof metadata.previewUrl === 'string' && metadata.previewUrl.trim()) return metadata.previewUrl
  return null
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

    const { client, user } = await requireUserClient(request, 'start-mesh-generation')
    const admin = createAdminClient('start-mesh-generation')
    const payload = meshGenerationStartRequestSchema.parse(await request.json())

    if (!isUuidLike(payload.snapshot.project.id) || !isUuidLike(payload.snapshot.draft.id)) {
      throw new HttpError(400, 'A live GraphCore project/draft is required before generating a mesh.')
    }

    const definition = await loadCharacterDefinition(client, payload.snapshot.draft.id, payload.definitionKey)
    if (!definition) throw new HttpError(404, `Character ${payload.definitionKey} was not found.`)
    if (definition.kind !== 'character') throw new HttpError(400, 'Trellis mesh generation is only enabled for characters in v1.')

    const renderBinding = getCharacterRenderBinding(definition)
    const previewImageAssetKey = renderBinding.previewImageAssetKey
    if (!previewImageAssetKey) {
      throw new HttpError(400, 'Generate or assign a concept image before generating a 3D mesh.')
    }

    const previewAsset = await loadProjectAsset(client, payload.snapshot.project.id, previewImageAssetKey)
    if (!previewAsset) throw new HttpError(404, `Concept image asset ${previewImageAssetKey} was not found.`)

    const sourceImageUrl = getSourceUrl(previewAsset.metadata)
    if (!sourceImageUrl) {
      throw new HttpError(400, 'The selected concept image does not have a usable source URL for Trellis 2.')
    }

    const deletedAssetKeys: string[] = []
    const activeJobs = await loadActiveMeshJobsForDefinition(client, payload.snapshot.draft.id, definition.key)
    for (const staleJob of activeJobs) {
      if (staleJob.providerRequestId) {
        const cancelResponse = await client.functions.invoke('ai-fal', {
          body: {
            action: 'cancel',
            model: staleJob.model,
            requestId: staleJob.providerRequestId,
          },
        })
        if (!cancelResponse.error) {
          const statusData = (cancelResponse.data as { data?: unknown } | null)?.data
          await updateMeshJob(client, staleJob.id, {
            provider_status: 'CANCELLED',
            provider_logs: formatFalLogMessages(statusData),
          })
        }
      }

      const staleAsset = await loadProjectAsset(client, staleJob.projectId, staleJob.targetMeshAssetKey)
      if (staleAsset && isTrellisGeneratedAsset(staleAsset)) {
        if (staleAsset.storagePath) {
          await admin.storage.from('project-assets').remove([staleAsset.storagePath]).catch(() => undefined)
        }
        await deleteProjectAssetRow(client, staleJob.projectId, staleAsset.key)
        deletedAssetKeys.push(staleAsset.key)
      }

      await updateMeshJob(client, staleJob.id, {
        status: 'cancelled',
        provider_status: 'CANCELLED',
        error_message: 'Superseded by a new mesh generation request.',
      })
    }

    const jobId = crypto.randomUUID()
    const definitionSlug = definition.key.replace(/^character\./, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'character'
    const storagePath = `generated/meshes/${definitionSlug}/${jobId}.glb`

    const currentMeshAsset = renderBinding.primaryMeshAssetKey
      ? await loadProjectAsset(client, payload.snapshot.project.id, renderBinding.primaryMeshAssetKey)
      : null
    const shouldReuseCurrentAsset = currentMeshAsset && isTrellisGeneratedAsset(currentMeshAsset)

    let targetMeshAssetKey = shouldReuseCurrentAsset ? currentMeshAsset.key : null

    if (shouldReuseCurrentAsset) {
      if (currentMeshAsset.storagePath) {
        await admin.storage.from('project-assets').remove([currentMeshAsset.storagePath]).catch(() => undefined)
      }
      const updateResponse = await client
        .from('project_assets')
        .update({
          name: `${definition.name} Mesh`,
          kind: 'mesh',
          mime_type: 'model/gltf-binary',
          storage_path: storagePath,
          metadata: {
            definitionKey: definition.key,
            generatedBy: 'trellis_mesh',
            provider: 'fal',
            model: 'fal-ai/trellis-2',
            requestId: null,
            sourceImageAssetKey: previewAsset.key,
            storageBucket: 'project-assets',
            storagePath,
            generation: {
              batchId: null,
              jobId,
              state: 'pending',
              placeholder: true,
              source: 'mesh_generation',
            },
          },
        })
        .eq('project_id', payload.snapshot.project.id)
        .eq('key', currentMeshAsset.key)

      if (updateResponse.error) throw new Error(updateResponse.error.message)
    } else {
      const existingAssetsResponse = await client.from('project_assets').select('key').eq('project_id', payload.snapshot.project.id)
      if (existingAssetsResponse.error) throw new Error(existingAssetsResponse.error.message)
      targetMeshAssetKey = uniqueMeshAssetKey((existingAssetsResponse.data ?? []).map((asset) => asset.key as string), definition.key)

      const insertResponse = await client.from('project_assets').insert({
        project_id: payload.snapshot.project.id,
        key: targetMeshAssetKey,
        name: `${definition.name} Mesh`,
        kind: 'mesh',
        mime_type: 'model/gltf-binary',
        storage_path: storagePath,
        metadata: {
          definitionKey: definition.key,
          generatedBy: 'trellis_mesh',
          provider: 'fal',
          model: 'fal-ai/trellis-2',
          requestId: null,
          sourceImageAssetKey: previewAsset.key,
          storageBucket: 'project-assets',
          storagePath,
          generation: {
            batchId: null,
            jobId,
            state: 'pending',
            placeholder: true,
            source: 'mesh_generation',
          },
        },
        created_by: user.id,
      })
      if (insertResponse.error) throw new Error(insertResponse.error.message)
    }

    if (!targetMeshAssetKey) {
      throw new Error('A mesh asset key could not be reserved for the Trellis job.')
    }

    await bindCharacterMeshAsset(client, payload.snapshot.draft.id, definition.key, targetMeshAssetKey)

    const insertJobResponse = await client.from('mesh_generation_jobs').insert({
      id: jobId,
      project_id: payload.snapshot.project.id,
      draft_id: payload.snapshot.draft.id,
      definition_key: definition.key,
      source_image_asset_key: previewAsset.key,
      target_mesh_asset_key: targetMeshAssetKey,
      provider: 'fal',
      model: 'fal-ai/trellis-2',
      status: 'queued',
      provider_logs: [],
      storage_path: storagePath,
      created_by: user.id,
    })
    if (insertJobResponse.error) throw new Error(insertJobResponse.error.message)

    const nextDefinition = await loadCharacterDefinition(client, payload.snapshot.draft.id, definition.key)
    const nextAsset = await loadProjectAsset(client, payload.snapshot.project.id, targetMeshAssetKey)
    const nextJob = await loadLatestMeshJobForDefinition(client, payload.snapshot.draft.id, definition.key)

    return json(meshGenerationStatusResponseSchema.parse({
      jobs: nextJob ? [nextJob] : [],
      definitions: nextDefinition ? [nextDefinition] : [],
      assets: nextAsset ? [nextAsset] : [],
      deletedAssetKeys,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start mesh generation.')
  }
})
