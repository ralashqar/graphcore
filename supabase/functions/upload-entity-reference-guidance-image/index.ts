import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image'
}

function decodeBase64(value: string) {
  const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const binary = atob(normalized)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/avif') return 'avif'
  return 'jpg'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'upload-entity-reference-guidance-image')
    const admin = createAdminClient('upload-entity-reference-guidance-image')
    const payload = asRecord(await request.json())
    const projectId = readString(payload.projectId)
    const draftId = readString(payload.draftId)
    const entityKey = readString(payload.entityKey)
    const fileName = readString(payload.fileName)
    const mimeType = readString(payload.mimeType).toLowerCase()
    const dataBase64 = readString(payload.dataBase64)

    if (!projectId || !draftId || !entityKey || !fileName || !dataBase64) {
      throw new HttpError(400, 'projectId, draftId, entityKey, fileName, and dataBase64 are required.')
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new HttpError(400, 'Reference guidance image must be PNG, JPEG, WebP, or AVIF.')
    }

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', draftId)
      .eq('project_id', projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) {
      throw new HttpError(404, draftResponse.error?.message ?? 'Draft was not found.')
    }

    const entityResponse = await client
      .from('world_entities')
      .select('id, key, name')
      .eq('draft_id', draftId)
      .eq('key', entityKey)
      .single()
    if (entityResponse.error || !entityResponse.data) {
      throw new HttpError(404, entityResponse.error?.message ?? 'World entity was not found.')
    }

    const bytes = decodeBase64(dataBase64)
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new HttpError(400, 'Reference guidance image must be smaller than 8 MB.')
    }

    const id = crypto.randomUUID()
    const extension = extensionForMimeType(mimeType)
    const entitySlug = safeSlug(entityKey)
    const fileSlug = safeSlug(fileName.replace(/\.[^.]+$/, ''))
    const assetKey = `entity_reference_guidance_${entitySlug}_${id.replace(/-/g, '').slice(0, 12)}`
    const storagePath = `uploads/entity-reference-guidance/${draftId}/${entitySlug}/${id}-${fileSlug}.${extension}`

    const uploadResponse = await admin.storage.from('project-assets').upload(
      storagePath,
      new Blob([bytes], { type: mimeType }),
      {
        cacheControl: '31536000',
        contentType: mimeType,
        upsert: false,
      },
    )
    if (uploadResponse.error) throw new Error(uploadResponse.error.message)

    const assetResponse = await admin
      .from('project_assets')
      .insert({
        project_id: projectId,
        key: assetKey,
        name: `${readString(asRecord(entityResponse.data).name) || entityKey} guidance image`,
        kind: 'image',
        mime_type: mimeType,
        storage_path: storagePath,
        metadata: {
          role: 'entity_reference_guidance_image',
          generatedBy: 'user_upload',
          entityKey,
          draftId,
          originalFileName: fileName,
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString(),
        },
      })
    if (assetResponse.error) throw new Error(assetResponse.error.message)

    return json({
      ok: true,
      assetKey,
      storagePath,
      mimeType,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to upload entity reference guidance image.')
  }
})
