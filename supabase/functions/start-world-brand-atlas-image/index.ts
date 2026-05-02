import { z } from 'npm:zod@4'

import { assetDefinitionSchema } from '../../../src/domain/graphcore.ts'
import { readWorldWikiPresentationMetadata } from '../../../src/domain/worldWiki.ts'
import { worldBrandAtlasImageRequestSchema, worldBrandAtlasImageResponseSchema } from '../../../src/domain/worldBrandAtlasImage.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiImages } from '../_shared/openai.ts'

const assetRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  key: z.string(),
  name: z.string(),
  kind: z.literal('image'),
  mime_type: z.string(),
  storage_path: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  llm_hints: z.record(z.string(), z.unknown()).nullable().default(null),
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function decodeBase64ToBytes(base64: string) {
  const normalized = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(normalized)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function buildImagePrompt(input: {
  suppliedPrompt: string
  wiki: ReturnType<typeof readWorldWikiPresentationMetadata>
}) {
  const colorText = Object.entries(input.wiki.colorScheme ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
  return [
    input.suppliedPrompt,
    input.wiki.title ? `Title: ${input.wiki.title}.` : '',
    input.wiki.logline ? `Logline: ${input.wiki.logline}.` : '',
    input.wiki.synopsis ? `Overview: ${input.wiki.synopsis}.` : '',
    input.wiki.artStyleDescription ? `Art direction: ${input.wiki.artStyleDescription}.` : '',
    input.wiki.visualMotifs.length > 0 ? `Visual motifs: ${input.wiki.visualMotifs.join(', ')}.` : '',
    colorText ? `Color system: ${colorText}.` : '',
    'Create one cohesive high-end brand atlas image. Include palette swatches, typography mood, icon/shape language, material/texture samples, and representative screen or world fragments as appropriate. Keep it visual, polished, and implementation-friendly. No internal IDs, no schema diagrams, no GraphCore branding.',
  ].filter(Boolean).join('\n')
}

async function loadImageBytesFromOpenAiResponse(body: Record<string, unknown>) {
  const data = Array.isArray(body.data) ? body.data : []
  const first = data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : null
  const b64Json = readString(first?.b64_json)
  if (b64Json) {
    return {
      bytes: decodeBase64ToBytes(b64Json),
      sourceUrl: null as string | null,
    }
  }
  const url = readString(first?.url)
  if (!url) throw new Error('OpenAI image response did not include image data.')
  const download = await fetch(url)
  if (!download.ok) throw new Error(`Generated brand atlas image could not be downloaded (${download.status}).`)
  return {
    bytes: new Uint8Array(await download.arrayBuffer()),
    sourceUrl: url,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-world-brand-atlas-image')
    const admin = createAdminClient('start-world-brand-atlas-image')
    const payload = worldBrandAtlasImageRequestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id, metadata')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) {
      throw new HttpError(404, 'Draft not found or not editable.')
    }

    const currentMetadata = asRecord(draftResponse.data.metadata)
    const wiki = readWorldWikiPresentationMetadata(currentMetadata.worldWiki)
    const suppliedPrompt = readString(payload.prompt) || wiki.brandAtlasPrompt
    if (!suppliedPrompt) {
      throw new HttpError(400, 'Create a brand atlas prompt before generating the atlas image.')
    }

    const imagePrompt = buildImagePrompt({ suppliedPrompt, wiki })
    const imageResponse = await runOpenAiImages({
      action: 'generate',
      model: 'gpt-image-2',
      prompt: imagePrompt,
      size: '1536x1024',
      quality: 'high',
      outputFormat: 'png',
      n: 1,
      user: user.id,
      timeoutMs: 180_000,
    })

    if (!imageResponse.response.ok) {
      const upstreamMessage =
        typeof imageResponse.body.error === 'object' && imageResponse.body.error !== null
          ? ((imageResponse.body.error as { message?: string }).message ?? 'OpenAI image request failed.')
          : 'OpenAI image request failed.'
      throw new Error(upstreamMessage)
    }

    const image = await loadImageBytesFromOpenAiResponse(imageResponse.body)
    const assetKey = `brand_atlas_${slugify(wiki.title || 'project')}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const storagePath = `generated/wiki-brand-atlas/${payload.draftId}/${assetKey}.png`
    const uploadResponse = await admin.storage.from('project-assets').upload(storagePath, new Blob([image.bytes], { type: 'image/png' }), {
      cacheControl: '31536000',
      contentType: 'image/png',
      upsert: true,
    })
    if (uploadResponse.error) throw new Error(uploadResponse.error.message)

    const insertResponse = await client
      .from('project_assets')
      .insert({
        project_id: payload.projectId,
        key: assetKey,
        name: 'Brand Atlas',
        kind: 'image',
        mime_type: 'image/png',
        storage_path: storagePath,
        metadata: {
          generatedBy: 'world_brand_atlas',
          provider: 'openai',
          model: imageResponse.model,
          requestId: imageResponse.response.headers.get('x-request-id'),
          sourceImageUrl: image.sourceUrl,
          storageBucket: 'project-assets',
          storagePath,
          prompt: imagePrompt,
          sourcePrompt: suppliedPrompt,
          generatedAt: new Date().toISOString(),
        },
      })
      .select('id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .single()
    if (insertResponse.error) throw new Error(insertResponse.error.message)

    const nextMetadata = {
      ...currentMetadata,
      worldWiki: {
        ...wiki,
        brandAtlasAssetKey: assetKey,
      },
    }
    const updateDraftResponse = await client
      .from('project_drafts')
      .update({ metadata: nextMetadata })
      .eq('id', payload.draftId)
      .select('metadata')
      .single()
    if (updateDraftResponse.error) throw new Error(updateDraftResponse.error.message)

    const signedResponse = await admin.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
    const assetRow = assetRowSchema.parse(insertResponse.data)
    const asset = assetDefinitionSchema.parse({
      id: assetRow.id,
      projectId: assetRow.project_id,
      key: assetRow.key,
      name: assetRow.name,
      kind: assetRow.kind,
      mimeType: assetRow.mime_type,
      storagePath: assetRow.storage_path,
      metadata: assetRow.metadata ?? {},
      llmHints: assetRow.llm_hints ?? {},
    })

    return json(worldBrandAtlasImageResponseSchema.parse({
      ok: true,
      asset,
      draftMetadata: updateDraftResponse.data?.metadata ?? nextMetadata,
      brandAtlasAssetKey: assetKey,
      signedUrl: signedResponse.data?.signedUrl ?? null,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to generate brand atlas image.')
  }
})
