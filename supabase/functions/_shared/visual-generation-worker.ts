import {
  buildIconGenerationPrompt,
  iconGenerationCandidateSchema,
  type IconGenerationCandidate,
} from './entity-icon-generation.ts'
import {
  buildCharacterReferenceSheetPrompt,
  buildGroupReferenceSheetPrompt,
  buildItemReferenceSheetPrompt,
  buildLocationReferenceSheetPrompt,
} from '../../../src/domain/visualAssetGeneration.ts'
import {
  readWorldEntityVisualDescription,
  readWorldEntityVisualIdentity,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
} from '../../../src/domain/worldEntityVisuals.ts'

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob | Uint8Array | ArrayBuffer, options?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: { message: string } | null }>
    }
  }
}

type VisualJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
type VisualJobKind = 'world_entity_icon_grid' | 'brand_atlas' | 'screen_mockup' | 'entity_reference_sheet' | 'character_sheet' | 'wiki_visual' | 'app_screen_mockup' | 'app_screen_analysis'

type VisualJob = {
  id: string
  projectId: string
  draftId: string
  requestedBy: string | null
  status: VisualJobStatus
  kind: VisualJobKind
  provider: string
  model: string
  targetKeys: Record<string, unknown>
  input: Record<string, unknown>
  outputs: Record<string, unknown>
  errorMessage: string | null
  workerId: string | null
  heartbeatAt: string | null
  attemptCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type FalImageResult = {
  requestId: string
  statusUrl: string | null
  responseUrl: string | null
  imageUrl: string
  resultBody: Record<string, unknown>
}

const visualJobSelect = 'id, project_id, draft_id, requested_by, status, kind, provider, model, target_keys, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, created_at, updated_at'
const falQueueBaseUrl = 'https://queue.fal.run'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInt(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'asset'
}

function normalizeFalImageModel(model: string | null | undefined) {
  const trimmed = typeof model === 'string' ? model.trim() : ''
  if (!trimmed || trimmed === 'gpt-image-2') return 'openai/gpt-image-2'
  return trimmed
}

function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })
}

async function fetchFalJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const rawText = await response.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (rawText.trim()) {
    try {
      body = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return { response, body, rawText }
}

function getFalErrorMessage(body: Record<string, unknown>, fallback: string) {
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  return fallback
}

function normalizeFalResultBody(body: Record<string, unknown>) {
  return body && typeof body.response === 'object' && body.response !== null
    ? body.response as Record<string, unknown>
    : body
}

function extractFalImageUrl(value: unknown): string | null {
  const record = asRecord(value)
  const images = Array.isArray(record.images) ? record.images : []
  for (const image of images) {
    if (typeof image === 'string' && /^https?:\/\//i.test(image)) return image
    const url = readString(asRecord(image).url)
    if (url) return url
  }
  const directUrl = readString(record.url)
  if (directUrl) return directUrl
  const outputUrl = readString(record.output_url)
  if (outputUrl) return outputUrl
  const image = asRecord(record.image)
  const imageUrl = readString(image.url)
  if (imageUrl) return imageUrl
  if (typeof record.image === 'string' && /^https?:\/\//i.test(record.image)) return record.image
  for (const key of ['output', 'response', 'data', 'result']) {
    const nested = extractFalImageUrl(record[key])
    if (nested) return nested
  }
  return null
}

async function submitFalImageRequest(input: {
  apiKey: string
  model: string
  prompt: string
  imageSize?: unknown
  quality?: string
  outputFormat?: string
  referenceImageUrls?: string[]
}) {
  return fetchFalJson(`${falQueueBaseUrl}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: input.imageSize ?? 'square_hd',
      quality: input.quality ?? Deno.env.get('VISUAL_GENERATION_FAL_QUALITY') ?? 'high',
      num_images: 1,
      output_format: input.outputFormat ?? 'png',
      ...(input.referenceImageUrls && input.referenceImageUrls.length > 0 ? { image_urls: input.referenceImageUrls } : {}),
      sync_mode: false,
    }),
  })
}

function resolveEntityIconGridImageSettings(input: { gridRows: number; gridCols: number }) {
  const cellCount = Math.max(1, input.gridRows * input.gridCols)
  return {
    imageSize: cellCount >= 9 ? { width: 2048, height: 2048 } : 'square_hd',
    quality: Deno.env.get('VISUAL_GENERATION_ENTITY_ICON_QUALITY') ?? 'low',
  }
}

async function getFalStatus(input: {
  apiKey: string
  model: string
  requestId: string
  statusUrl?: string | null
}) {
  const url = input.statusUrl
    ? new URL(input.statusUrl)
    : new URL(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/status`)
  url.searchParams.set('logs', '1')
  return fetchFalJson(url.toString(), {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

async function getFalResult(input: {
  apiKey: string
  model: string
  requestId: string
  responseUrl?: string | null
}) {
  const candidates = [
    input.responseUrl,
    `${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/response`,
    `${falQueueBaseUrl}/${input.model}/requests/${input.requestId}`,
  ].filter((url, index, urls): url is string => (
    typeof url === 'string' && url.trim().length > 0 && urls.indexOf(url) === index
  ))

  let lastResult: Awaited<ReturnType<typeof fetchFalJson>> | null = null
  for (const url of candidates) {
    const result = await fetchFalJson(url, {
      method: 'GET',
      headers: buildFalHeaders(input.apiKey),
    })
    lastResult = result
    if (result.response.ok) return result
    if (result.response.status !== 404 && result.response.status !== 405) return result
  }
  return lastResult ?? fetchFalJson(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/response`, {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

function mapVisualJobRow(row: Record<string, unknown>): VisualJob {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    draftId: String(row.draft_id),
    requestedBy: typeof row.requested_by === 'string' ? row.requested_by : null,
    status: String(row.status) as VisualJobStatus,
    kind: String(row.kind) as VisualJobKind,
    provider: readString(row.provider) || 'fal',
    model: readString(row.model) || 'openai/gpt-image-2',
    targetKeys: asRecord(row.target_keys),
    input: asRecord(row.input),
    outputs: asRecord(row.outputs),
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    workerId: typeof row.worker_id === 'string' ? row.worker_id : null,
    heartbeatAt: typeof row.heartbeat_at === 'string' ? row.heartbeat_at : null,
    attemptCount: typeof row.attempt_count === 'number' ? row.attempt_count : 0,
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

async function loadVisualJob(client: DatabaseClient, jobId: string) {
  const response = await client
    .from('visual_generation_jobs')
    .select(visualJobSelect)
    .eq('id', jobId)
    .single()

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? `Visual generation job ${jobId} was not found.`)
  }

  return mapVisualJobRow(response.data)
}

async function heartbeat(client: DatabaseClient, jobId: string, workerId: string, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('heartbeat_visual_generation_job', {
    job_id: jobId,
    worker_id: workerId,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
}

async function completeJob(client: DatabaseClient, jobId: string, workerId: string, outputs: Record<string, unknown>, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('complete_visual_generation_job', {
    job_id: jobId,
    worker_id: workerId,
    outputs,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
}

async function failJob(client: DatabaseClient, jobId: string, workerId: string, message: string, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('fail_visual_generation_job', {
    job_id: jobId,
    worker_id: workerId,
    error_message: message,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
}

async function waitForFalImage(input: {
  client: DatabaseClient
  job: VisualJob
  workerId: string
  apiKey: string
  model: string
  prompt: string
  phasePrefix: string
  imageSize?: unknown
  quality?: string
  outputFormat?: string
  referenceImageUrls?: string[]
}): Promise<FalImageResult> {
  const existingRequestId = readString(input.job.metadata.falRequestId)
  const existingStatusUrl = readString(input.job.metadata.falStatusUrl)
  const existingResponseUrl = readString(input.job.metadata.falResponseUrl)

  let requestId = existingRequestId
  let statusUrl: string | null = existingStatusUrl || null
  let responseUrl: string | null = existingResponseUrl || null

  if (!requestId) {
    console.info('[visual-generation-job] submitting Fal image request.', {
      jobId: input.job.id,
      workerId: input.workerId,
      kind: input.job.kind,
      model: input.model,
      imageSize: input.imageSize ?? 'square_hd',
      quality: input.quality ?? null,
      outputFormat: input.outputFormat ?? 'png',
      referenceImageCount: input.referenceImageUrls?.length ?? 0,
      promptChars: input.prompt.length,
    })
    await heartbeat(input.client, input.job.id, input.workerId, {
      phase: `${input.phasePrefix}_submitting_fal_image`,
      promptChars: input.prompt.length,
      provider: 'fal',
      model: input.model,
      imageSize: input.imageSize ?? 'square_hd',
      quality: input.quality ?? null,
      outputFormat: input.outputFormat ?? 'png',
      referenceImageCount: input.referenceImageUrls?.length ?? 0,
    })

    const submit = await submitFalImageRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      imageSize: input.imageSize,
      quality: input.quality,
      outputFormat: input.outputFormat,
      referenceImageUrls: input.referenceImageUrls,
    })
    requestId = readString(submit.body.request_id)
    statusUrl = readString(submit.body.status_url) || null
    responseUrl = readString(submit.body.response_url) || null

    if (!submit.response.ok) {
      console.error('[visual-generation-job] Fal image submission failed.', {
        jobId: input.job.id,
        workerId: input.workerId,
        kind: input.job.kind,
        model: input.model,
        httpStatus: submit.response.status,
        body: submit.body,
        rawText: submit.rawText,
      })
      throw new Error(getFalErrorMessage(submit.body, `Fal image submission failed with HTTP ${submit.response.status}.`))
    }
    if (!requestId) {
      throw new Error('Fal did not return a request id for the visual generation job.')
    }

    await heartbeat(input.client, input.job.id, input.workerId, {
      phase: `${input.phasePrefix}_fal_image_queued`,
      provider: 'fal',
      model: input.model,
      falRequestId: requestId,
      falStatusUrl: statusUrl,
      falResponseUrl: responseUrl,
      falImageSize: input.imageSize ?? 'square_hd',
      falQuality: input.quality ?? null,
      falOutputFormat: input.outputFormat ?? 'png',
      falReferenceImageCount: input.referenceImageUrls?.length ?? 0,
      falSubmittedAt: new Date().toISOString(),
    })
  }

  const timeoutMs = Number(Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS') ?? 1_200_000)
  const pollIntervalMs = Number(Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS') ?? 3_000)
  const startedAt = Date.now()
  let lastHeartbeatAt = 0

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getFalStatus({
      apiKey: input.apiKey,
      model: input.model,
      requestId,
      statusUrl,
    })
    const providerStatus = readString(status.body.status)
    const now = Date.now()
    if (now - lastHeartbeatAt > 15_000 || providerStatus === 'COMPLETED') {
      lastHeartbeatAt = now
      await heartbeat(input.client, input.job.id, input.workerId, {
        phase: `${input.phasePrefix}_waiting_for_fal_image`,
        provider: 'fal',
        model: input.model,
        falRequestId: requestId,
        falStatus: providerStatus || null,
        falLastStatusAt: new Date().toISOString(),
      })
    }

    if (providerStatus === 'COMPLETED') {
      const result = await getFalResult({
        apiKey: input.apiKey,
        model: input.model,
        requestId,
        responseUrl,
      })
      if (!result.response.ok) {
        throw new Error(getFalErrorMessage(result.body, `Fal image result failed with HTTP ${result.response.status}.`))
      }
      const normalized = normalizeFalResultBody(result.body)
      const imageUrl = extractFalImageUrl(normalized) ?? extractFalImageUrl(result.body)
      if (!imageUrl) {
        console.error('[visual-generation-job] Fal image completed without image URL.', {
          jobId: input.job.id,
          workerId: input.workerId,
          kind: input.job.kind,
          model: input.model,
          requestId,
          resultBody: result.body,
          rawText: result.rawText,
        })
        throw new Error('Fal completed the visual generation request but did not return an image URL.')
      }
      await heartbeat(input.client, input.job.id, input.workerId, {
        phase: `${input.phasePrefix}_fal_image_ready`,
        provider: 'fal',
        model: input.model,
        falRequestId: requestId,
        falImageUrl: imageUrl,
      })
      return {
        requestId,
        statusUrl,
        responseUrl,
        imageUrl,
        resultBody: normalized,
      }
    }

    const errorMessage = getFalErrorMessage(status.body, '')
    if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
      throw new Error(errorMessage)
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Fal image request timed out before completion.')
}

async function downloadImageBytes(imageUrl: string) {
  const download = await fetch(imageUrl)
  if (!download.ok) throw new Error(`Generated Fal image could not be downloaded (${download.status}).`)
  return new Uint8Array(await download.arrayBuffer())
}

async function uploadBytes(client: DatabaseClient, path: string, bytes: Uint8Array, contentType: string) {
  const response = await client.storage.from('project-assets').upload(path, new Blob([bytes], { type: contentType }), {
    cacheControl: '31536000',
    contentType,
    upsert: true,
  })
  if (response.error) throw new Error(response.error.message)
}

async function upsertAssetRows(client: DatabaseClient, rows: Array<Record<string, unknown>>) {
  const response = await client
    .from('project_assets')
    .upsert(rows, { onConflict: 'project_id,key' })
  if (response.error) throw new Error(response.error.message)
}

async function upsertDefinitionPreviewImageBinding(
  client: DatabaseClient,
  definitionId: string,
  componentType: 'render_3d_binding' | 'environment_render_binding',
  assetKey: string,
) {
  const componentResponse = await client
    .from('project_definition_components')
    .select('id, config')
    .eq('definition_id', definitionId)
    .eq('component_type', componentType)
    .maybeSingle()
  if (componentResponse.error) throw new Error(componentResponse.error.message)

  const nextConfig = {
    ...asRecord(asRecord(componentResponse.data).config),
    previewImageAssetKey: assetKey,
  }

  if (componentResponse.data) {
    const updateResponse = await client
      .from('project_definition_components')
      .update({ config: nextConfig })
      .eq('id', readString(asRecord(componentResponse.data).id))
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    return
  }

  const insertResponse = await client
    .from('project_definition_components')
    .insert({
      definition_id: definitionId,
      component_type: componentType,
      config: nextConfig,
    })
  if (insertResponse.error) throw new Error(insertResponse.error.message)
}

function readIconCandidates(job: VisualJob): IconGenerationCandidate[] {
  const rawCandidates = Array.isArray(job.input.candidates) ? job.input.candidates : []
  return rawCandidates
    .map((candidate) => iconGenerationCandidateSchema.safeParse(candidate))
    .filter((parsed): parsed is { success: true; data: IconGenerationCandidate } => parsed.success)
    .map((parsed) => parsed.data)
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

function buildGeneratedAssetMetadata(input: {
  job: VisualJob
  generatedBy: string
  model: string
  prompt: string
  storagePath: string
  falResult: FalImageResult
  extra?: Record<string, unknown>
}) {
  return {
    generatedBy: input.generatedBy,
    visualJobId: input.job.id,
    jobKind: input.job.kind,
    provider: 'fal',
    model: input.model,
    falRequestId: input.falResult.requestId,
    falStatusUrl: input.falResult.statusUrl,
    falResponseUrl: input.falResult.responseUrl,
    falImageUrl: input.falResult.imageUrl,
    storageBucket: 'project-assets',
    storagePath: input.storagePath,
    prompt: input.prompt,
    generatedAt: new Date().toISOString(),
    generation: {
      jobId: input.job.id,
      state: 'completed',
      completedAt: new Date().toISOString(),
      source: 'visual_generation',
    },
    ...(input.extra ?? {}),
  }
}

async function processEntityIconGridJob(client: DatabaseClient, job: VisualJob, workerId: string) {
  const candidates = readIconCandidates(job)
  if (candidates.length === 0) {
    throw new Error('World entity icon grid job has no valid candidates.')
  }

  const gridRows = readPositiveInt(job.input.gridRows, 4)
  const gridCols = readPositiveInt(job.input.gridCols, 4)
  const artStyle = asRecord(job.input.artStyle)
  const prompt = buildIconGenerationPrompt({
    candidates,
    gridRows,
    gridCols,
    artStyleName: readString(artStyle.artStyleName) || 'cohesive project art style',
    artStyleDescription: readString(artStyle.artStyleDescription) || 'cohesive, polished, high-quality worldbuilding icon art',
  })

  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly visual generation worker.')
  const model = normalizeFalImageModel(Deno.env.get('VISUAL_GENERATION_FAL_MODEL') ?? job.model)
  const imageSettings = resolveEntityIconGridImageSettings({ gridRows, gridCols })
  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
    phasePrefix: 'entity_icon_grid',
    imageSize: imageSettings.imageSize,
    quality: imageSettings.quality,
  })

  const gridBytes = await downloadImageBytes(falResult.imageUrl)
  await heartbeat(client, job.id, workerId, { phase: 'entity_icon_grid_cropping_image', imageBytes: gridBytes.byteLength })

  const sharpModule = await import('npm:sharp@0.33.5')
  const sharp = sharpModule.default
  const image = sharp(gridBytes)
  const metadata = await image.metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width <= 0 || height <= 0) {
    throw new Error('Generated image dimensions could not be read.')
  }

  const gridAssetKey = `world_icon_grid_${job.id.replace(/-/g, '').slice(0, 16)}`
  const gridPath = `generated/world-icons/${job.draftId}/${job.id}/grid.png`
  await uploadBytes(client, gridPath, gridBytes, 'image/png')

  const cellWidth = Math.floor(width / gridCols)
  const cellHeight = Math.floor(height / gridRows)
  const createdAssetKeys: Record<string, string> = {}
  const outputs: Array<Record<string, unknown>> = [{
    assetKey: gridAssetKey,
    storagePath: gridPath,
    targetKind: 'visual_job',
    targetKey: job.id,
    role: 'source_grid',
  }]
  const assetRows: Array<Record<string, unknown>> = [{
    project_id: job.projectId,
    key: gridAssetKey,
    name: 'World Entity Icon Grid',
    kind: 'image',
    mime_type: 'image/png',
    storage_path: gridPath,
    metadata: buildGeneratedAssetMetadata({
      job,
      generatedBy: 'world_entity_icon_grid',
      model,
      prompt,
      storagePath: gridPath,
      falResult,
      extra: {
        gridRows,
        gridCols,
        requestedImageSize: imageSettings.imageSize,
        requestedQuality: imageSettings.quality,
        entityKeys: candidates.map((candidate) => candidate.entityKey),
      },
    }),
  }]

  for (const [index, candidate] of candidates.entries()) {
    const row = Math.floor(index / gridCols)
    const col = index % gridCols
    const assetKey = `world_icon_${slugify(candidate.name)}_${candidate.entityKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`
    const storagePath = `generated/world-icons/${job.draftId}/${job.id}/${String(index + 1).padStart(2, '0')}_${slugify(candidate.name)}.webp`
    const crop = await sharp(gridBytes)
      .extract({
        left: col * cellWidth,
        top: row * cellHeight,
        width: col === gridCols - 1 ? width - col * cellWidth : cellWidth,
        height: row === gridRows - 1 ? height - row * cellHeight : cellHeight,
      })
      .resize(768, 768, { fit: 'cover' })
      .webp({ quality: 92 })
      .toBuffer()
    await uploadBytes(client, storagePath, new Uint8Array(crop), 'image/webp')
    createdAssetKeys[candidate.entityKey] = assetKey
    outputs.push({
      assetKey,
      storagePath,
      targetKind: 'world_entity',
      targetKey: candidate.entityKey,
      role: 'icon',
    })
    assetRows.push({
      project_id: job.projectId,
      key: assetKey,
      name: `${candidate.name} Icon`,
      kind: 'image',
      mime_type: 'image/webp',
      storage_path: storagePath,
      metadata: buildGeneratedAssetMetadata({
        job,
        generatedBy: 'world_entity_icon_grid',
        model,
        prompt,
        storagePath,
        falResult,
        extra: {
          sourceGridAssetKey: gridAssetKey,
          entityKey: candidate.entityKey,
          gridIndex: index,
          row,
          col,
          gridRows,
          gridCols,
          requestedImageSize: imageSettings.imageSize,
          requestedQuality: imageSettings.quality,
          promptFragment: candidate.visualPrompt || candidate.summary,
        },
      }),
    })
  }

  await heartbeat(client, job.id, workerId, { phase: 'entity_icon_grid_upserting_assets', assetCount: assetRows.length })
  await upsertAssetRows(client, assetRows)

  for (const candidate of candidates) {
    const assetKey = createdAssetKeys[candidate.entityKey]
    if (!assetKey) continue
    const entityUpdate = await client
      .from('world_entities')
      .update({ thumbnail_asset_key: assetKey })
      .eq('draft_id', job.draftId)
      .eq('key', candidate.entityKey)
    if (entityUpdate.error) throw new Error(entityUpdate.error.message)

    if (candidate.linkedDefinitionKey) {
      const definitionUpdate = await client
        .from('project_definitions')
        .update({ icon_asset_key: assetKey })
        .eq('draft_id', job.draftId)
        .eq('key', candidate.linkedDefinitionKey)
      if (definitionUpdate.error) throw new Error(definitionUpdate.error.message)
    }
  }

  await completeJob(client, job.id, workerId, { assets: outputs, createdAssetKeys, sourceGridAssetKey: gridAssetKey }, {
    phase: 'completed',
    provider: 'fal',
    model,
    falRequestId: falResult.requestId,
    falStatusUrl: falResult.statusUrl,
    falResponseUrl: falResult.responseUrl,
    falImageUrl: falResult.imageUrl,
    completedCount: Object.keys(createdAssetKeys).length,
    imageSize: { width, height },
    requestedImageSize: imageSettings.imageSize,
    requestedQuality: imageSettings.quality,
  })

  return { completedCount: Object.keys(createdAssetKeys).length }
}

async function processBrandAtlasJob(client: DatabaseClient, job: VisualJob, workerId: string) {
  const prompt = readString(job.input.imagePrompt) || readString(job.input.prompt)
  if (!prompt) throw new Error('Brand atlas visual job is missing an image prompt.')

  const assetKey = readString(job.input.assetKey) || readString(job.targetKeys.assetKey)
  const storagePath = readString(job.input.storagePath) || (assetKey ? `generated/wiki-brand-atlas/${job.draftId}/${assetKey}.png` : '')
  if (!assetKey || !storagePath) {
    throw new Error('Brand atlas visual job is missing an asset key or storage path.')
  }

  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly visual generation worker.')
  const model = normalizeFalImageModel(Deno.env.get('VISUAL_GENERATION_FAL_MODEL') ?? job.model)
  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
    phasePrefix: 'brand_atlas',
  })

  const imageBytes = await downloadImageBytes(falResult.imageUrl)
  await heartbeat(client, job.id, workerId, { phase: 'brand_atlas_uploading_asset', imageBytes: imageBytes.byteLength })
  await uploadBytes(client, storagePath, imageBytes, 'image/png')

  const sourcePrompt = readString(job.input.sourcePrompt)
  await upsertAssetRows(client, [{
    project_id: job.projectId,
    key: assetKey,
    name: 'Brand Atlas',
    kind: 'image',
    mime_type: 'image/png',
    storage_path: storagePath,
    metadata: buildGeneratedAssetMetadata({
      job,
      generatedBy: 'world_brand_atlas',
      model,
      prompt,
      storagePath,
      falResult,
      extra: {
        sourcePrompt,
      },
    }),
  }])

  const draftResponse = await client
    .from('project_drafts')
    .select('metadata')
    .eq('id', job.draftId)
    .single()
  if (draftResponse.error) throw new Error(draftResponse.error.message)
  const currentMetadata = asRecord(draftResponse.data?.metadata)
  const currentWiki = asRecord(currentMetadata.worldWiki)
  const updateDraftResponse = await client
    .from('project_drafts')
    .update({
      metadata: {
        ...currentMetadata,
        worldWiki: {
          ...currentWiki,
          brandAtlasAssetKey: assetKey,
        },
      },
    })
    .eq('id', job.draftId)
  if (updateDraftResponse.error) throw new Error(updateDraftResponse.error.message)

  const outputs = {
    assets: [{
      assetKey,
      storagePath,
      targetKind: 'world_wiki',
      targetKey: 'brandAtlasAssetKey',
      role: 'brand_atlas',
    }],
  }
  await completeJob(client, job.id, workerId, outputs, {
    phase: 'completed',
    provider: 'fal',
    model,
    falRequestId: falResult.requestId,
    falStatusUrl: falResult.statusUrl,
    falResponseUrl: falResult.responseUrl,
    falImageUrl: falResult.imageUrl,
    assetKey,
  })

  return { assetKey }
}

function mapWorldEntityRow(row: Record<string, unknown>) {
  return {
    id: readString(row.id),
    key: readString(row.key),
    name: readString(row.name),
    summary: readString(row.summary),
    context: readString(row.context),
    nodeType: readString(row.node_type),
    tags: readStringArray(row.tags),
    thumbnailAssetKey: typeof row.thumbnail_asset_key === 'string' ? row.thumbnail_asset_key : null,
    linkedDefinitionKey: typeof row.linked_definition_key === 'string' ? row.linked_definition_key : null,
    customProperties: asRecord(row.custom_properties),
    metadata: asRecord(row.metadata),
  }
}

function resolveEntityReferenceSheetKind(nodeType: string, explicitKind = '') {
  const normalized = explicitKind.trim().toLowerCase()
  if (normalized === 'character' || normalized === 'location' || normalized === 'group' || normalized === 'item') return normalized
  if (nodeType === 'actor' || nodeType === 'persona' || nodeType === 'player_profile') return 'character'
  if (nodeType === 'place' || nodeType === 'location_spot' || nodeType === 'travel_link' || nodeType === 'environment' || nodeType === 'screen' || nodeType === 'section') return 'location'
  if (nodeType === 'group' || nodeType === 'faction' || nodeType === 'business_goal') return 'group'
  if (nodeType === 'object' || nodeType === 'inventory_item' || nodeType === 'currency' || nodeType === 'shadow_token' || nodeType === 'marketplace' || nodeType === 'trade_offer' || nodeType === 'component' || nodeType === 'feature') return 'item'
  return 'item'
}

function resolveEntityReferenceSheetImageSize(sheetKind: string) {
  if (sheetKind === 'character') return { width: 2048, height: 1536 }
  return { width: 2048, height: 2048 }
}

function resolveEntityReferenceSheetPrompt(input: {
  sheetKind: string
  entity: ReturnType<typeof mapWorldEntityRow>
  projectArtStyle: string
  projectTone: string
  projectContextDescription: string
  visualDescription: string
  visualTraits: string[]
  visualTraitMap: Record<string, string>
  referenceAssetNotes: string[]
}) {
  const base = {
    entityName: input.entity.name || input.entity.key,
    entitySummary: input.entity.summary,
    entityContext: input.entity.context,
    projectArtStyle: input.projectArtStyle,
    projectTone: input.projectTone,
    projectContextDescription: input.projectContextDescription,
    visualDescription: input.visualDescription,
    visualTraits: input.visualTraits,
    visualTraitMap: input.visualTraitMap,
    referenceAssetNotes: input.referenceAssetNotes,
  }
  if (input.sheetKind === 'character') return buildCharacterReferenceSheetPrompt(base)
  if (input.sheetKind === 'location') {
    const text = `${input.entity.name} ${input.entity.summary} ${input.entity.context} ${input.visualDescription}`.toLowerCase()
    const includeMapView = /(city|district|building|garden|dungeon|arena|settlement|route|station|ship|camp|base|temple|market|street|bridge|room|facility|map|layout|zone)/i.test(text)
    return buildLocationReferenceSheetPrompt({ ...base, includeMapView })
  }
  if (input.sheetKind === 'group') return buildGroupReferenceSheetPrompt(base)
  return buildItemReferenceSheetPrompt(base)
}

async function loadProjectAssetRows(client: DatabaseClient, projectId: string, assetKeys: string[]) {
  const uniqueKeys = [...new Set(assetKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 8)
  if (uniqueKeys.length === 0) return []
  const response = await client
    .from('project_assets')
    .select('key, name, kind, mime_type, storage_path, metadata')
    .eq('project_id', projectId)
    .in('key', uniqueKeys)
  if (response.error) throw new Error(response.error.message)
  return Array.isArray(response.data) ? response.data.map((row) => asRecord(row)) : []
}

async function createProjectAssetSignedUrls(client: DatabaseClient, assetRows: Record<string, unknown>[]) {
  const storage = client.storage.from('project-assets')
  if (typeof storage.createSignedUrl !== 'function') return []
  const urls: string[] = []
  for (const asset of assetRows) {
    const storagePath = readString(asset.storage_path)
    if (!storagePath || !/\.(avif|jpe?g|png|webp)$/i.test(storagePath)) continue
    const signed = await storage.createSignedUrl(storagePath, 3600)
    if (signed.error) {
      console.warn('[visual-generation-job] failed to sign reference asset.', {
        assetKey: readString(asset.key),
        storagePath,
        message: signed.error.message,
      })
      continue
    }
    const url = readString(signed.data?.signedUrl)
    if (url) urls.push(url)
  }
  return urls
}

async function processEntityReferenceSheetJob(client: DatabaseClient, job: VisualJob, workerId: string) {
  const entityKey = readString(job.input.entityKey) || readString(job.targetKeys.entityKey)
  if (!entityKey) throw new Error('Entity reference sheet job is missing entityKey.')
  await heartbeat(client, job.id, workerId, { phase: 'entity_reference_sheet_loading_context', entityKey })

  const entityResponse = await client
    .from('world_entities')
    .select('*')
    .eq('draft_id', job.draftId)
    .eq('key', entityKey)
    .single()
  if (entityResponse.error || !entityResponse.data) {
    throw new Error(entityResponse.error?.message ?? `World entity ${entityKey} was not found.`)
  }
  const entity = mapWorldEntityRow(asRecord(entityResponse.data))
  const draftResponse = await client
    .from('project_drafts')
    .select('metadata')
    .eq('id', job.draftId)
    .single()
  if (draftResponse.error) throw new Error(draftResponse.error.message)
  const draftMetadata = asRecord(draftResponse.data?.metadata)
  const worldWiki = asRecord(draftMetadata.worldWiki)
  const inputArtStyle = asRecord(job.input.artStyle)
  const projectArtStyle = readString(job.input.projectArtStyle)
    || readString(inputArtStyle.artStyleDescription)
    || readString(inputArtStyle.artStyleName)
    || readString(worldWiki.artStyleDescription)
    || 'cohesive project art style'
  const projectTone = readString(job.input.projectTone)
    || readString(worldWiki.genre)
    || readStringArray(worldWiki.toneTags).join(', ')
    || 'coherent project tone'
  const projectContextDescription = readString(job.input.projectContextDescription)
    || readString(worldWiki.logline)
    || readString(worldWiki.synopsis)
    || ''
  const visualDescription = readWorldEntityVisualDescription(entity)
  const visualIdentity = readWorldEntityVisualIdentity(entity)
  const visualTraits = readWorldEntityVisualTraits(entity)
  const visualTraitMap = readWorldEntityVisualTraitMap(entity) as Record<string, string>
  const sheetKind = resolveEntityReferenceSheetKind(entity.nodeType, readString(job.input.sheetKind) || readString(job.targetKeys.sheetKind))
  const referenceAssets: Record<string, unknown>[] = []
  const referenceImageUrls: string[] = []
  const referenceAssetNotes: string[] = []
  const prompt = resolveEntityReferenceSheetPrompt({
    sheetKind,
    entity,
    projectArtStyle,
    projectTone,
    projectContextDescription,
    visualDescription: visualDescription || visualIdentity.description || entity.summary || entity.context,
    visualTraits,
    visualTraitMap,
    referenceAssetNotes,
  })

  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly visual generation worker.')
  const explicitModel = readString(job.input.model) || readString(job.targetKeys.model)
  const configuredModel = readString(Deno.env.get('VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_MODEL'))
  const baseModel = normalizeFalImageModel(explicitModel || configuredModel || 'openai/gpt-image-2')
  const model = baseModel === 'openai/gpt-image-2/edit' ? 'openai/gpt-image-2' : baseModel
  const quality = readString(job.input.quality) || Deno.env.get('VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_QUALITY') || 'low'
  const outputFormat = readString(job.input.outputFormat) || Deno.env.get('VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_OUTPUT_FORMAT') || 'webp'
  const imageSize = asRecord(job.input.imageSize)
  const resolvedImageSize = Object.keys(imageSize).length > 0 ? imageSize : resolveEntityReferenceSheetImageSize(sheetKind)

  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
    phasePrefix: 'entity_reference_sheet',
    imageSize: resolvedImageSize,
    quality,
    outputFormat,
    referenceImageUrls,
  })

  const imageBytes = await downloadImageBytes(falResult.imageUrl)
  const extension = outputFormat === 'webp' ? 'webp' : outputFormat === 'jpeg' || outputFormat === 'jpg' ? 'jpg' : 'png'
  const mimeType = extension === 'webp' ? 'image/webp' : extension === 'jpg' ? 'image/jpeg' : 'image/png'
  const assetKey = readString(job.input.assetKey)
    || `entity_reference_sheet_${slugify(entity.name || entity.key)}_${entity.key.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`
  const storagePath = readString(job.input.storagePath)
    || `generated/entity-reference-sheets/${job.draftId}/${job.id}/${slugify(entity.name || entity.key)}.${extension}`
  await heartbeat(client, job.id, workerId, { phase: 'entity_reference_sheet_uploading_asset', imageBytes: imageBytes.byteLength, assetKey })
  await uploadBytes(client, storagePath, imageBytes, mimeType)

  const linkedDefinitionKey = entity.linkedDefinitionKey || readString(job.input.linkedDefinitionKey) || null
  await upsertAssetRows(client, [{
    project_id: job.projectId,
    key: assetKey,
    name: `${entity.name || entity.key} Reference Sheet`,
    kind: 'image',
    mime_type: mimeType,
    storage_path: storagePath,
    metadata: buildGeneratedAssetMetadata({
      job,
      generatedBy: 'entity_reference_sheet',
      model,
      prompt,
      storagePath,
      falResult,
      extra: {
        entityKey,
        entityName: entity.name,
        entityNodeType: entity.nodeType,
        linkedDefinitionKey,
        sheetKind,
        visualDescription,
        visualTraits,
        visualTraitMap,
        referenceAssetKeys: referenceAssets.map((asset) => readString(asset.key)).filter(Boolean),
        imageSize: resolvedImageSize,
        quality,
        outputFormat,
      },
    }),
  }])

  const currentMetadata = asRecord(entity.metadata)
  const currentReferenceSheets = Array.isArray(currentMetadata.referenceSheetAssetKeys)
    ? currentMetadata.referenceSheetAssetKeys.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
  const entityUpdate = await client
    .from('world_entities')
    .update({
      thumbnail_asset_key: assetKey,
      metadata: {
        ...currentMetadata,
        referenceSheetAssetKey: assetKey,
        referenceSheetAssetKeys: [...new Set([assetKey, ...currentReferenceSheets])].slice(0, 8),
        referenceSheetVisualJobId: job.id,
      },
    })
    .eq('draft_id', job.draftId)
    .eq('key', entityKey)
  if (entityUpdate.error) throw new Error(entityUpdate.error.message)

  if (linkedDefinitionKey) {
    const definitionResponse = await client
      .from('project_definitions')
      .select('id, kind, metadata')
      .eq('draft_id', job.draftId)
      .eq('key', linkedDefinitionKey)
      .maybeSingle()
    if (definitionResponse.error) throw new Error(definitionResponse.error.message)
    const definitionRow = asRecord(definitionResponse.data)
    const definitionMetadata = asRecord(definitionRow.metadata)
    const definitionUpdate = await client
      .from('project_definitions')
      .update({
        icon_asset_key: assetKey,
        metadata: {
          ...definitionMetadata,
          referenceSheetAssetKey: assetKey,
          referenceSheetVisualJobId: job.id,
        },
      })
      .eq('draft_id', job.draftId)
      .eq('key', linkedDefinitionKey)
    if (definitionUpdate.error) throw new Error(definitionUpdate.error.message)

    const definitionId = readString(definitionRow.id)
    if (definitionId) {
      const definitionKind = readString(definitionRow.kind)
      await upsertDefinitionPreviewImageBinding(
        client,
        definitionId,
        definitionKind === 'environment' ? 'environment_render_binding' : 'render_3d_binding',
        assetKey,
      )
    }
  }

  await completeJob(client, job.id, workerId, {
    assets: [{
      assetKey,
      storagePath,
      targetKind: 'world_entity',
      targetKey: entityKey,
      role: 'entity_reference_sheet',
    }],
    assetKey,
    entityKey,
    sheetKind,
  }, {
    phase: 'completed',
    provider: 'fal',
    model,
    falRequestId: falResult.requestId,
    falStatusUrl: falResult.statusUrl,
    falResponseUrl: falResult.responseUrl,
    falImageUrl: falResult.imageUrl,
    assetKey,
    entityKey,
    sheetKind,
    requestedImageSize: resolvedImageSize,
    requestedQuality: quality,
    outputFormat,
    referenceImageCount: referenceImageUrls.length,
  })

  return { assetKey, entityKey, sheetKind }
}

async function processAppScreenMockupJob(client: DatabaseClient, job: VisualJob, workerId: string) {
  const prompt = readString(job.input.prompt) || readString(job.input.imagePrompt)
  if (!prompt) throw new Error('App screen mockup visual job is missing an image prompt.')

  const screenKey = readString(job.input.screenKey) || readString(job.targetKeys.screenKey)
  const screenName = readString(job.input.screenName) || readString(job.targetKeys.screenName) || 'App Screen'
  const route = readString(job.input.route) || readString(job.targetKeys.route)
  if (!screenKey) throw new Error('App screen mockup visual job is missing screenKey.')

  const assetKey = readString(job.input.assetKey)
    || `app_screen_mockup_${slugify(screenName)}_${screenKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`
  const storagePath = readString(job.input.storagePath)
    || `generated/app-screen-mockups/${job.draftId}/${job.id}/${slugify(screenName)}.png`

  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly visual generation worker.')
  const model = normalizeFalImageModel(Deno.env.get('VISUAL_GENERATION_FAL_MODEL') ?? job.model)
  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
    phasePrefix: 'app_screen_mockup',
  })

  const imageBytes = await downloadImageBytes(falResult.imageUrl)
  await heartbeat(client, job.id, workerId, { phase: 'app_screen_mockup_uploading_asset', imageBytes: imageBytes.byteLength, screenKey })
  await uploadBytes(client, storagePath, imageBytes, 'image/png')

  await upsertAssetRows(client, [{
    project_id: job.projectId,
    key: assetKey,
    name: `${screenName} Screen Art`,
    kind: 'image',
    mime_type: 'image/png',
    storage_path: storagePath,
    metadata: buildGeneratedAssetMetadata({
      job,
      generatedBy: 'app_screen_mockup',
      model,
      prompt,
      storagePath,
      falResult,
      extra: {
        targetKind: 'app_screen_mockup',
        targetKey: screenKey,
        screenKey,
        screenName,
        route,
        viewport: asRecord(job.input.viewport),
        brandAtlasAssetKey: readString(job.input.brandAtlasAssetKey),
      },
    }),
  }])

  const mockupKey = readString(job.input.screenMockupKey) || `screen_mockup_${screenKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}`
  const now = new Date().toISOString()
  const mockupResponse = await client
    .from('world_entities')
    .upsert({
      draft_id: job.draftId,
      key: mockupKey,
      name: `${screenName} Mockup`,
      summary: `Generated screen art for ${screenName}${route ? ` (${route})` : ''}.`,
      context: 'Generated app screen art used as the visual reference for layout, styling, and implementation decomposition.',
      node_type: 'screen_mockup',
      aliases: [],
      tags: ['app', 'screen-art', 'mockup'],
      status: 'active',
      thumbnail_asset_key: assetKey,
      linked_definition_key: null,
      source: 'ai',
      custom_properties: {
        app: {
          screenKey,
          targetScreenKey: screenKey,
          route,
          sourceAssetKey: assetKey,
          visualJobId: job.id,
          viewport: asRecord(job.input.viewport),
          status: 'generated',
          generatedAt: now,
        },
      },
      metadata: {
        visualDescription: prompt,
        source: 'app_screen_mockup',
        visualJobId: job.id,
        sourceAssetKey: assetKey,
      },
    }, { onConflict: 'draft_id,key' })
  if (mockupResponse.error) throw new Error(mockupResponse.error.message)

  const outputs = {
    assets: [{
      assetKey,
      storagePath,
      targetKind: 'screen',
      targetKey: screenKey,
      role: 'app_screen_mockup',
    }],
    screenMockupKey: mockupKey,
    screenKey,
  }
  await completeJob(client, job.id, workerId, outputs, {
    phase: 'completed',
    provider: 'fal',
    model,
    falRequestId: falResult.requestId,
    falStatusUrl: falResult.statusUrl,
    falResponseUrl: falResult.responseUrl,
    falImageUrl: falResult.imageUrl,
    assetKey,
    screenKey,
    screenMockupKey: mockupKey,
  })

  return { assetKey, screenMockupKey: mockupKey }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : []
}

function readFrame(value: unknown) {
  const record = asRecord(value)
  return {
    x: typeof record.x === 'number' ? record.x : 0,
    y: typeof record.y === 'number' ? record.y : 0,
    width: typeof record.width === 'number' ? record.width : 0,
    height: typeof record.height === 'number' ? record.height : 0,
  }
}

async function loadWorldEntity(client: DatabaseClient, draftId: string, key: string) {
  if (!key) return null
  const response = await client
    .from('world_entities')
    .select('*')
    .eq('draft_id', draftId)
    .eq('key', key)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return response.data ? asRecord(response.data) : null
}

function buildAppScreenAnalysisSpec(input: {
  screenKey: string
  route: string
  sourceAssetKey: string
  components: Array<Record<string, unknown>>
  actions: string[]
  colorScheme: Record<string, unknown>
}) {
  const primary = readString(input.colorScheme.primary) || '#2563eb'
  const secondary = readString(input.colorScheme.secondary) || '#14b8a6'
  const tertiary = readString(input.colorScheme.tertiary) || '#f8fafc'
  const contentComponent = input.components[0]
  const ctaComponent = input.components.find((component) => /button|cta|action|footer/i.test(readString(component.name) || readString(component.key)))
  const layoutTree = [
    {
      id: `${input.screenKey}_background`,
      role: 'background',
      frame: { x: 0, y: 0, width: 390, height: 844 },
      style: { backgroundColor: tertiary },
    },
    {
      id: `${input.screenKey}_header`,
      role: 'header',
      frame: { x: 24, y: 54, width: 342, height: 132 },
      style: { alignItems: 'flex-start', gap: 10 },
      textStyle: { color: '#0f172a', fontSize: 32, fontWeight: '800', lineHeight: 36 },
    },
    {
      id: `${input.screenKey}_content`,
      componentKey: readString(contentComponent?.key) || undefined,
      role: 'content',
      frame: { x: 20, y: 204, width: 350, height: 448 },
      style: { backgroundColor: '#ffffff', borderRadius: 28, padding: 20, borderColor: 'rgba(15,23,42,0.08)' },
      textStyle: { color: '#334155', fontSize: 16, lineHeight: 23 },
    },
    {
      id: `${input.screenKey}_primary_cta`,
      componentKey: readString(ctaComponent?.key) || undefined,
      role: 'cta',
      frame: { x: 24, y: 698, width: 342, height: 58 },
      style: { backgroundColor: primary, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
      textStyle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
    },
  ]
  const requiredAssets = input.components
    .filter((component) => /mascot|avatar|hero|image|illustration/i.test(`${readString(component.name)} ${readString(component.visualRole)} ${readString(component.key)}`))
    .slice(0, 3)
    .map((component, index) => ({
      key: `${input.screenKey}_asset_${index + 1}`,
      role: /mascot|avatar/i.test(readString(component.name)) ? 'mascot' : 'illustration',
      transparentBackground: true,
      prompt: readString(component.visualDescription) || `Reusable transparent app visual asset for ${readString(component.name) || input.screenKey}.`,
      targetSize: '1024x1024',
    }))
  return {
    screenKey: input.screenKey,
    route: input.route || '/',
    sourceAssetKey: input.sourceAssetKey,
    viewport: { width: 390, height: 844, device: 'iphone' },
    designTokensUsed: ['color.primary', 'color.secondary', 'color.tertiary', 'spacing.screen', 'radius.card', 'radius.control'],
    layoutTree,
    sharedTokenCandidates: {
      color: { primary, secondary, tertiary, text: '#0f172a', muted: '#64748b', surface: '#ffffff' },
      radius: { card: 28, control: 999 },
      spacing: { screenX: 24, sectionGap: 18 },
    },
    requiredAssets,
  }
}

async function processAppScreenAnalysisJob(client: DatabaseClient, job: VisualJob, workerId: string) {
  const screenKey = readString(job.input.screenKey) || readString(job.targetKeys.screenKey)
  if (!screenKey) throw new Error('App screen analysis job is missing screenKey.')
  const explicitMockupKey = readString(job.input.screenMockupKey) || readString(job.targetKeys.screenMockupKey)
  await heartbeat(client, job.id, workerId, { phase: 'app_screen_analysis_loading_context', screenKey, screenMockupKey: explicitMockupKey })

  const screen = await loadWorldEntity(client, job.draftId, screenKey)
  const mockup = explicitMockupKey
    ? await loadWorldEntity(client, job.draftId, explicitMockupKey)
    : null
  const screenApp = asRecord(asRecord(screen?.custom_properties).app)
  const mockupApp = asRecord(asRecord(mockup?.custom_properties).app)
  const screenName = readString(job.input.screenName) || readString(screen?.name) || 'App Screen'
  const route = readString(job.input.route) || readString(screenApp.route) || readString(mockupApp.route) || '/'
  const sourceAssetKey = readString(job.input.sourceAssetKey)
    || readString(mockupApp.sourceAssetKey)
    || readString(mockup?.thumbnail_asset_key)
  if (!sourceAssetKey) throw new Error(`App screen analysis for ${screenName} is missing sourceAssetKey.`)

  const components = Array.isArray(job.input.components)
    ? job.input.components.map((component) => asRecord(component))
    : []
  const actions = readStringArray(job.input.actions).length > 0
    ? readStringArray(job.input.actions)
    : readStringArray(screenApp.actions)
  const colorScheme = asRecord(job.input.colorScheme)
  const visualSpec = buildAppScreenAnalysisSpec({
    screenKey,
    route,
    sourceAssetKey,
    components,
    actions,
    colorScheme,
  })
  const parsedLayoutTree = Array.isArray(visualSpec.layoutTree) ? visualSpec.layoutTree : []
  const mockupKey = explicitMockupKey || readString(job.input.screenMockupKey) || `screen_mockup_${screenKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}`
  const now = new Date().toISOString()
  const regionKeys: string[] = []

  await heartbeat(client, job.id, workerId, { phase: 'app_screen_analysis_writing_regions', screenKey, regionCount: parsedLayoutTree.length })
  for (const region of parsedLayoutTree) {
    const role = readString(region.role) || 'content'
    const regionKey = `image_region_${screenKey}_${slugify(readString(region.id) || role)}`
    regionKeys.push(regionKey)
    const frame = readFrame(region.frame)
    const upsertRegion = await client
      .from('world_entities')
      .upsert({
        draft_id: job.draftId,
        key: regionKey,
        name: `${screenName} ${role.replace(/_/g, ' ')}`,
        summary: `Detected ${role} region for ${screenName}.`,
        context: 'App screen visual analysis region used for static prototype hotspots and implementation layout guidance.',
        node_type: 'image_region',
        aliases: [],
        tags: ['app', 'visual-analysis', role],
        status: 'active',
        thumbnail_asset_key: null,
        linked_definition_key: null,
        source: 'ai',
        custom_properties: {
          app: {
            phase: 'visual',
            screenKey,
            screenMockupKey: mockupKey,
            mockupKey,
            sourceAssetKey,
            role,
            frame,
            boundingBox: frame,
            mappedComponentKey: readString(region.componentKey),
            visualDescription: `${role} region in ${screenName}.`,
            style: asRecord(region.style),
            textStyle: asRecord(region.textStyle),
            assetRequirementKey: readString(region.assetRequirementKey),
            analysisJobId: job.id,
          },
        },
        metadata: {
          source: 'app_screen_analysis',
          screenKey,
          mockupKey,
          screenMockupKey: mockupKey,
          sourceAssetKey,
          visualJobId: job.id,
          frame,
        },
      }, { onConflict: 'draft_id,key' })
    if (upsertRegion.error) throw new Error(upsertRegion.error.message)
  }

  await heartbeat(client, job.id, workerId, { phase: 'app_screen_analysis_updating_mockup', screenKey, screenMockupKey: mockupKey })
  const existingMockupCustom = asRecord(mockup?.custom_properties)
  const updateMockup = await client
    .from('world_entities')
    .update({
      custom_properties: {
        ...existingMockupCustom,
        app: {
          ...mockupApp,
          phase: 'visual',
          screenKey,
          targetScreenKey: screenKey,
          route,
          sourceAssetKey,
          visualSpec,
          analysisStatus: 'completed',
          analysisJobId: job.id,
          analyzedAt: now,
          imageRegionKeys: regionKeys,
        },
      },
      metadata: {
        ...asRecord(mockup?.metadata),
        source: 'app_screen_mockup',
        screenKey,
        sourceAssetKey,
        visualSpec,
        visualAnalysisJobId: job.id,
      },
    })
    .eq('draft_id', job.draftId)
    .eq('key', mockupKey)
  if (updateMockup.error) throw new Error(updateMockup.error.message)

  const warnings = [
    ...(components.length === 0 ? ['No component list was supplied, so layout regions use generic screen roles.'] : []),
    ...(actions.length === 0 ? ['No screen actions were supplied, so hotspot intent falls back to route transitions.'] : []),
  ]
  await completeJob(client, job.id, workerId, {
    assets: [],
    visualSpec,
    imageRegionKeys: regionKeys,
    requiredAssets: visualSpec.requiredAssets,
    warnings,
  }, {
    phase: 'completed',
    provider: 'graphcore',
    model: 'app-screen-analysis-v1',
    screenKey,
    screenMockupKey: mockupKey,
    imageRegionCount: regionKeys.length,
    warningCount: warnings.length,
  })
}

export async function processFlyVisualGenerationJobs(input: {
  client: DatabaseClient
  workerId: string
}) {
  const claim = await input.client.rpc('claim_visual_generation_job', {
    worker_id: input.workerId,
  })
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) {
    return { processed: false, job: null as VisualJob | null }
  }

  const jobId = String(claim.data)
  let job: VisualJob | null = null
  try {
    job = await loadVisualJob(input.client, jobId)
    if (job.kind === 'world_entity_icon_grid') {
      await processEntityIconGridJob(input.client, job, input.workerId)
    } else if (job.kind === 'brand_atlas') {
      await processBrandAtlasJob(input.client, job, input.workerId)
    } else if (job.kind === 'entity_reference_sheet' || job.kind === 'character_sheet') {
      await processEntityReferenceSheetJob(input.client, job, input.workerId)
    } else if (job.kind === 'app_screen_mockup') {
      await processAppScreenMockupJob(input.client, job, input.workerId)
    } else if (job.kind === 'app_screen_analysis') {
      await processAppScreenAnalysisJob(input.client, job, input.workerId)
    } else {
      throw new Error(`Visual generation job kind "${job.kind}" is not implemented yet.`)
    }
    return {
      processed: true,
      job: {
        ...job,
        status: 'completed' as const,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[visual-generation-job] failed job.', {
      jobId,
      workerId: input.workerId,
      kind: job?.kind ?? null,
      message,
    })
    try {
      await failJob(input.client, jobId, input.workerId, message, { phase: 'failed' })
    } catch (failureError) {
      console.error('[visual-generation-job] failed to persist job failure.', {
        jobId,
        workerId: input.workerId,
        message: failureError instanceof Error ? failureError.message : String(failureError),
      })
    }
    throw error
  }
}
