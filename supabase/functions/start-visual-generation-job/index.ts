import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualGenerationJobRow, visualGenerationStartResponseSchema, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'
import { visualGenerationStartRequestSchema } from '../../../src/domain/visualGeneration.ts'

type AuthedClient = Awaited<ReturnType<typeof requireUserClient>>['client']

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function persistPendingWorldConceptImage(input: {
  client: AuthedClient
  projectId: string
  draftId: string
  jobId: string
  assetKey: string
  storagePath: string
  imagePrompt: string
  sourcePrompt: string
}) {
  const draftResponse = await input.client
    .from('project_drafts')
    .select('metadata')
    .eq('id', input.draftId)
    .eq('project_id', input.projectId)
    .single()
  if (draftResponse.error) throw new Error(draftResponse.error.message)

  const now = new Date().toISOString()
  const insertAssetResponse = await input.client
    .from('project_assets')
    .insert({
      project_id: input.projectId,
      key: input.assetKey,
      name: 'World Concept Image',
      kind: 'image',
      mime_type: 'image/webp',
      storage_path: input.storagePath,
      metadata: {
        generatedBy: 'world_concept_image',
        visualJobId: input.jobId,
        jobKind: 'wiki_visual',
        provider: 'fal',
        model: 'openai/gpt-image-2',
        storageBucket: 'project-assets',
        storagePath: input.storagePath,
        prompt: input.imagePrompt,
        sourcePrompt: input.sourcePrompt || input.imagePrompt,
        role: 'world_concept_image',
        generation: {
          jobId: input.jobId,
          state: 'pending',
          queuedAt: now,
          source: 'visual_generation',
        },
      },
    })
  if (insertAssetResponse.error) throw new Error(insertAssetResponse.error.message)

  const currentMetadata = asRecord(draftResponse.data?.metadata)
  const currentWiki = asRecord(currentMetadata.worldWiki)
  const updateDraftResponse = await input.client
    .from('project_drafts')
    .update({
      metadata: {
        ...currentMetadata,
        worldWiki: {
          ...currentWiki,
          worldConceptPrompt: readString(currentWiki.worldConceptPrompt) || input.sourcePrompt || input.imagePrompt,
          worldConceptAssetKey: input.assetKey,
          worldConceptVisualJobId: input.jobId,
        },
      },
    })
    .eq('id', input.draftId)
    .eq('project_id', input.projectId)
  if (updateDraftResponse.error) throw new Error(updateDraftResponse.error.message)
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-visual-generation-job')
    const payload = visualGenerationStartRequestSchema.parse(await request.json())

    const insertResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        status: 'queued',
        kind: payload.kind,
        provider: payload.provider,
        model: payload.model,
        target_keys: payload.targetKeys,
        input: payload.input,
        metadata: payload.metadata,
      })
      .select(visualJobSelect)
      .single()

    if (insertResponse.error) throw new Error(insertResponse.error.message)
    const job = mapVisualGenerationJobRow(insertResponse.data as VisualGenerationJobRow)

    const role = readString(payload.targetKeys.role) || readString(payload.input.role)
    if (payload.kind === 'wiki_visual' && role === 'world_concept_image') {
      const assetKey = readString(payload.input.assetKey) || readString(payload.targetKeys.assetKey)
      const storagePath = readString(payload.input.storagePath) || (assetKey ? `generated/wiki-concept-images/${payload.draftId}/${assetKey}.webp` : '')
      const imagePrompt = readString(payload.input.imagePrompt) || readString(payload.input.prompt)
      if (!assetKey || !storagePath || !imagePrompt) {
        throw new HttpError(400, 'World concept image jobs require assetKey, storagePath, and imagePrompt.')
      }
      await persistPendingWorldConceptImage({
        client,
        projectId: payload.projectId,
        draftId: payload.draftId,
        jobId: job.id,
        assetKey,
        storagePath,
        imagePrompt,
        sourcePrompt: readString(payload.input.sourcePrompt),
      })
    }

    return json(visualGenerationStartResponseSchema.parse({
      ok: true,
      job,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start visual generation job.')
  }
})
