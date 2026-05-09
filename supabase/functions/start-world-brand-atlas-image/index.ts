import { z } from 'npm:zod@4'

import { assetDefinitionSchema } from '../../../src/domain/graphcore.ts'
import { readWorldWikiPresentationMetadata } from '../../../src/domain/worldWiki.ts'
import { worldBrandAtlasImageRequestSchema, worldBrandAtlasImageResponseSchema } from '../../../src/domain/worldBrandAtlasImage.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

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

function markGenerationSuperseded(metadata: Record<string, unknown>, now: string, replacementAssetKey: string | null) {
  const generation = asRecord(metadata.generation)
  return {
    ...metadata,
    generation: {
      ...generation,
      state: 'failed',
      cancelledAt: now,
      failureReason: 'superseded',
      supersededByAssetKey: replacementAssetKey,
    },
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-world-brand-atlas-image')
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
    const assetKey = `brand_atlas_${slugify(wiki.title || 'project')}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const storagePath = `generated/wiki-brand-atlas/${payload.draftId}/${assetKey}.png`
    const now = new Date().toISOString()

    const activeJobsResponse = await client
      .from('visual_generation_jobs')
      .select('id')
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('kind', 'brand_atlas')
      .in('status', ['queued', 'running'])
    if (activeJobsResponse.error) throw new Error(activeJobsResponse.error.message)
    const activeJobIds = (activeJobsResponse.data ?? [])
      .map((row) => typeof row.id === 'string' ? row.id : '')
      .filter(Boolean)

    if (activeJobIds.length > 0) {
      const cancelResponse = await client
        .from('visual_generation_jobs')
        .update({
          status: 'cancelled',
          completed_at: now,
          heartbeat_at: now,
          error_message: 'Superseded by a newer brand atlas generation request.',
        })
        .in('id', activeJobIds)
      if (cancelResponse.error) throw new Error(cancelResponse.error.message)

      const pendingAssetsResponse = await client
        .from('project_assets')
        .select('id, metadata')
        .eq('project_id', payload.projectId)
        .eq('metadata->>generatedBy', 'world_brand_atlas')
        .in('metadata->>visualJobId', activeJobIds)
      if (pendingAssetsResponse.error) throw new Error(pendingAssetsResponse.error.message)

      await Promise.all((pendingAssetsResponse.data ?? []).map(async (row) => {
        const metadata = markGenerationSuperseded(asRecord(row.metadata), now, assetKey)
        const updateResponse = await client
          .from('project_assets')
          .update({ metadata })
          .eq('id', row.id)
        if (updateResponse.error) throw new Error(updateResponse.error.message)
      }))
    }

    const jobResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        status: 'queued',
        kind: 'brand_atlas',
        provider: 'fal',
        model: 'openai/gpt-image-2',
        target_keys: {
          assetKey,
          wikiField: 'brandAtlasAssetKey',
        },
        input: {
          imagePrompt,
          sourcePrompt: suppliedPrompt,
          assetKey,
          storagePath,
          wiki: {
            title: wiki.title,
            logline: wiki.logline,
            artStyleDescription: wiki.artStyleDescription,
            visualMotifs: wiki.visualMotifs,
            colorScheme: wiki.colorScheme,
          },
        },
        metadata: {
          runtime: 'fly',
          queuedBy: 'start-world-brand-atlas-image',
        },
      })
      .select('id')
      .single()
    if (jobResponse.error || !jobResponse.data) throw new Error(jobResponse.error?.message ?? 'Failed to create visual generation job.')

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
          visualJobId: jobResponse.data.id,
          jobKind: 'brand_atlas',
          provider: 'fal',
          model: 'openai/gpt-image-2',
          storageBucket: 'project-assets',
          storagePath,
          prompt: imagePrompt,
          sourcePrompt: suppliedPrompt,
          generation: {
            jobId: jobResponse.data.id,
            state: 'pending',
            queuedAt: new Date().toISOString(),
            source: 'visual_generation',
          },
        },
      })
      .select('id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .single()
    if (insertResponse.error) throw new Error(insertResponse.error.message)

    const currentWiki = asRecord(currentMetadata.worldWiki)
    const nextMetadata = {
      ...currentMetadata,
      worldWiki: {
        ...currentWiki,
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
      status: 'queued',
      asset,
      draftMetadata: updateDraftResponse.data?.metadata ?? nextMetadata,
      brandAtlasAssetKey: assetKey,
      visualJobId: jobResponse.data.id,
      signedUrl: null,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to generate brand atlas image.')
  }
})
