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
  upsertDefinitionComponent,
  updateMeshJob,
} from '../_shared/mesh-generation.ts'

const meshGenerationStartRequestSchema = z.object({
  snapshot: z.object({
    project: z.object({ id: z.string() }),
    draft: z.object({ id: z.string() }),
  }),
  definitionKey: z.string().min(1),
  preferredImageAssetKey: z.string().min(1).nullable().optional(),
  preferredImageSourceUrl: z.string().min(1).nullable().optional(),
})

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

function resolvePreviewImageAssetKey(definition: Awaited<ReturnType<typeof loadCharacterDefinition>>) {
  const renderBinding = getCharacterRenderBinding(definition)
  if (renderBinding.previewImageAssetKey) return renderBinding.previewImageAssetKey
  if (definition.kind === 'item' && definition.iconAssetKey) return definition.iconAssetKey
  return null
}

async function syncPreferredPreviewImageBinding(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  definition: NonNullable<Awaited<ReturnType<typeof loadCharacterDefinition>>>,
  preferredImageAssetKey: string,
) {
  const currentBinding = getCharacterRenderBinding(definition)
  if (currentBinding.previewImageAssetKey === preferredImageAssetKey && (definition.kind !== 'item' || definition.iconAssetKey === preferredImageAssetKey)) {
    return
  }

  await upsertDefinitionComponent(client, definition.id, 'render_3d_binding', {
    ...currentBinding,
    previewImageAssetKey: preferredImageAssetKey,
  })

  if (definition.kind === 'item' && definition.iconAssetKey !== preferredImageAssetKey) {
    const updateResponse = await client
      .from('project_definitions')
      .update({ icon_asset_key: preferredImageAssetKey })
      .eq('id', definition.id)

    if (updateResponse.error) throw new Error(updateResponse.error.message)
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
    if (!definition) throw new HttpError(404, `Definition ${payload.definitionKey} was not found.`)
    if (definition.kind !== 'character' && definition.kind !== 'item') {
      throw new HttpError(400, 'Trellis mesh generation is currently enabled for characters and items only.')
    }

    const previewImageAssetKey = payload.preferredImageAssetKey ?? resolvePreviewImageAssetKey(definition)
    if (!previewImageAssetKey) {
      throw new HttpError(400, 'Generate or assign a concept image before generating a 3D mesh.')
    }

    if (payload.preferredImageAssetKey && payload.preferredImageAssetKey !== resolvePreviewImageAssetKey(definition)) {
      await syncPreferredPreviewImageBinding(client, definition, payload.preferredImageAssetKey)
    }

    const renderBinding = getCharacterRenderBinding(definition)

    const previewAsset = await loadProjectAsset(client, payload.snapshot.project.id, previewImageAssetKey)
    if (!previewAsset) throw new HttpError(404, `Concept image asset ${previewImageAssetKey} was not found.`)

    const sourceImageUrl = payload.preferredImageSourceUrl?.trim() || await resolveAssetAccessUrl(admin, previewAsset)
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
            cancelUrl: staleJob.cancelUrl,
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
    const definitionSlug = definition.key.replace(/^[^.]+\./, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || definition.kind
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
      status_url: null,
      response_url: null,
      cancel_url: null,
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
