import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualGenerationJobRow, visualGenerationStartResponseSchema, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'
import { visualGenerationStartRequestSchema } from '../../../src/domain/visualGeneration.ts'

type AuthedClient = Awaited<ReturnType<typeof requireUserClient>>['client']

const worldConceptImageSize = { width: 1536, height: 864 } as const
const worldConceptImageQuality = 'low'
const worldConceptOutputFormat = 'webp'
const worldConceptMimeType = 'image/webp'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeVisualGenerationProvider(value: unknown) {
  const provider = readString(value).toLowerCase()
  if (provider === 'openai' || provider === 'openai_direct' || provider === 'direct_openai') return 'openai'
  if (provider === 'graphcore') return 'graphcore'
  return 'fal'
}

function readVisualGenerationProviderMode(value: unknown) {
  const provider = readString(value).toLowerCase()
  if (provider === 'openai' || provider === 'openai_direct' || provider === 'direct_openai') return 'openai'
  if (provider === 'both' || provider === 'balanced' || provider === 'load_balance' || provider === 'load-balanced' || provider === 'hybrid') return 'both'
  return 'fal'
}

async function chooseBalancedImageProvider(client: AuthedClient, projectId: string, draftId: string) {
  const response = await client
    .from('visual_generation_jobs')
    .select('provider, status, updated_at')
    .eq('project_id', projectId)
    .eq('draft_id', draftId)
    .in('provider', ['openai', 'fal'])
    .in('status', ['queued', 'running', 'failed'])
    .order('updated_at', { ascending: false })
    .limit(80)

  if (response.error) {
    console.warn('[GraphCore] mixed visual provider selector fell back to Fal.', {
      projectId,
      draftId,
      message: response.error.message,
    })
    return 'fal'
  }

  const scores = {
    openai: 0,
    fal: 0,
  }
  const recentFailureCutoff = Date.now() - 10 * 60_000
  for (const row of response.data ?? []) {
    const provider = row.provider === 'fal' ? 'fal' : row.provider === 'openai' ? 'openai' : null
    if (!provider) continue
    if (row.status === 'queued' || row.status === 'running') scores[provider] += 1
    if (row.status === 'failed' && Date.parse(String(row.updated_at ?? '')) > recentFailureCutoff) scores[provider] += 3
  }

  if (scores.openai === scores.fal) return 'fal'
  return scores.openai < scores.fal ? 'openai' : 'fal'
}

function normalizeVisualGenerationModel(provider: string, model: unknown) {
  const trimmed = readString(model)
  if (provider === 'openai') {
    if (!trimmed || trimmed === 'openai/gpt-image-2' || trimmed === 'openai/gpt-image-2/edit') return 'gpt-image-2'
    if (trimmed.startsWith('openai/')) return trimmed.slice('openai/'.length)
    return trimmed
  }
  if (!trimmed || trimmed === 'gpt-image-2') return 'openai/gpt-image-2'
  return trimmed
}

function isWorldConceptImageJob(input: {
  kind: string
  targetKeys: Record<string, unknown>
  input: Record<string, unknown>
}) {
  const role = readString(input.targetKeys.role) || readString(input.input.role)
  return input.kind === 'wiki_visual' && role === 'world_concept_image'
}

function normalizeVisualGenerationInput(input: {
  kind: string
  targetKeys: Record<string, unknown>
  input: Record<string, unknown>
}) {
  if (!isWorldConceptImageJob(input)) return input.input
  return {
    ...input.input,
    role: 'world_concept_image',
    quality: worldConceptImageQuality,
    outputFormat: worldConceptOutputFormat,
    mimeType: worldConceptMimeType,
    imageSize: worldConceptImageSize,
  }
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
  provider: string
  model: string
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
        provider: input.provider,
        model: input.model,
        storageBucket: 'project-assets',
        storagePath: input.storagePath,
        prompt: input.imagePrompt,
        sourcePrompt: input.sourcePrompt || input.imagePrompt,
        role: 'world_concept_image',
        quality: worldConceptImageQuality,
        outputFormat: worldConceptOutputFormat,
        imageSize: worldConceptImageSize,
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
          worldConceptPrompt: input.sourcePrompt || input.imagePrompt || readString(currentWiki.worldConceptPrompt),
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
    const rawPayload = asRecord(await request.json())
    const payload = visualGenerationStartRequestSchema.parse(rawPayload)
    if (payload.kind === 'world_entity_icon_grid') {
      throw new HttpError(
        410,
        'Legacy world entity icon-grid generation is disabled. Use entity_reference_sheet jobs for entity art.',
      )
    }
    const normalizedInput = normalizeVisualGenerationInput(payload)
    const explicitProvider = readString(rawPayload.provider)
    const providerMode = readVisualGenerationProviderMode(explicitProvider || Deno.env.get('VISUAL_GENERATION_IMAGE_PROVIDER'))
    const normalizedProvider = payload.kind === 'app_screen_analysis'
      ? normalizeVisualGenerationProvider(explicitProvider || 'graphcore')
      : explicitProvider
        ? normalizeVisualGenerationProvider(explicitProvider)
        : providerMode === 'both'
          ? await chooseBalancedImageProvider(client, payload.projectId, payload.draftId)
          : providerMode
    const normalizedModel = normalizeVisualGenerationModel(normalizedProvider, rawPayload.model ?? payload.model)

    const insertResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        status: 'queued',
        kind: payload.kind,
        provider: normalizedProvider,
        model: normalizedModel,
        target_keys: payload.targetKeys,
        input: normalizedInput,
        metadata: {
          ...payload.metadata,
          provider: normalizedProvider,
          model: normalizedModel,
          providerSelectionMode: explicitProvider ? 'request' : providerMode,
          providerDefaultSource: explicitProvider ? 'request' : 'environment_or_default',
        },
      })
      .select(visualJobSelect)
      .single()

    if (insertResponse.error) throw new Error(insertResponse.error.message)
    const job = mapVisualGenerationJobRow(insertResponse.data as VisualGenerationJobRow)

    if (isWorldConceptImageJob({ kind: payload.kind, targetKeys: payload.targetKeys, input: normalizedInput })) {
      const assetKey = readString(normalizedInput.assetKey) || readString(payload.targetKeys.assetKey)
      const storagePath = readString(normalizedInput.storagePath) || (assetKey ? `generated/wiki-concept-images/${payload.draftId}/${assetKey}.webp` : '')
      const imagePrompt = readString(normalizedInput.imagePrompt) || readString(normalizedInput.prompt)
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
        sourcePrompt: readString(normalizedInput.sourcePrompt),
        provider: normalizedProvider,
        model: normalizedModel,
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
