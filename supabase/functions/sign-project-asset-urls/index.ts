import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { trellisGlbResultSchema } from '../_shared/mesh-generation.ts'

const requestSchema = z.object({
  projectId: z.string().min(1).optional(),
  assetKeys: z.array(z.string().min(1)).max(100),
})

const responseSchema = z.object({
  urls: z.array(z.object({
    assetKey: z.string(),
    signedUrl: z.string().url(),
  })).default([]),
})

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function resolveTrellisResultUrl(
  admin: ReturnType<typeof createAdminClient>,
  metadata: Record<string, unknown>,
) {
  const generatedBy = typeof metadata.generatedBy === 'string' ? metadata.generatedBy : null
  const requestId = typeof metadata.requestId === 'string' ? metadata.requestId : null
  const model = typeof metadata.model === 'string' && metadata.model.trim()
    ? metadata.model.trim()
    : 'fal-ai/trellis-2'

  if (generatedBy !== 'trellis_mesh' || !requestId) return null

  const resultResponse = await admin.functions.invoke('ai-fal', {
    body: {
      action: 'result',
      model,
      requestId,
    },
  })

  if (resultResponse.error) return null

  const resultData = ((resultResponse.data as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
  const parsed = trellisGlbResultSchema.safeParse(resultData)
  if (!parsed.success) return null
  return parsed.data.model_glb.url
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'sign-project-asset-urls')
    const admin = createAdminClient('sign-project-asset-urls')
    const payload = requestSchema.parse(await request.json())

    if (payload.projectId !== undefined && !isUuidLike(payload.projectId)) {
      throw new HttpError(400, 'A live GraphCore project is required before signing asset URLs.')
    }

    if (payload.assetKeys.length === 0) {
      return json(responseSchema.parse({ urls: [] }))
    }

    let assetQuery = client
      .from('project_assets')
      .select('key, kind, storage_path, metadata')
      .in('key', payload.assetKeys)

    if (payload.projectId) {
      assetQuery = assetQuery.eq('project_id', payload.projectId)
    }

    const assetResponse = await assetQuery

    if (assetResponse.error) throw new Error(assetResponse.error.message)

    const urls: Array<{ assetKey: string; signedUrl: string }> = []

    for (const asset of assetResponse.data ?? []) {
      const metadata = asset.metadata && typeof asset.metadata === 'object'
        ? asset.metadata as Record<string, unknown>
        : {}
      const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path.trim() : ''
      const bucket = typeof metadata.storageBucket === 'string' && metadata.storageBucket.trim()
        ? metadata.storageBucket.trim()
        : 'project-assets'

      if (!storagePath || (asset.kind !== 'mesh' && asset.kind !== 'video' && asset.kind !== 'image' && asset.kind !== 'document')) continue

      const signed = await admin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
      if (signed.error || !signed.data?.signedUrl) {
        const fallbackUrl = await resolveTrellisResultUrl(admin, metadata)
        if (!fallbackUrl) continue
        await client
          .from('project_assets')
          .update({
            metadata: {
              ...metadata,
              sourceUrl: fallbackUrl,
              previewUrl: fallbackUrl,
            },
          })
          .eq('project_id', payload.projectId)
          .eq('key', asset.key)
        urls.push({
          assetKey: asset.key,
          signedUrl: fallbackUrl,
        })
        continue
      }

      urls.push({
        assetKey: asset.key,
        signedUrl: signed.data.signedUrl,
      })
    }

    return json(responseSchema.parse({ urls }))
  } catch (error) {
    return errorResponse(error, 'Failed to sign project asset URLs.')
  }
})
