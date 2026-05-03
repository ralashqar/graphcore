import {
  buildIconGenerationPrompt,
  iconGenerationCandidateSchema,
  type IconGenerationCandidate,
} from './entity-icon-generation.ts'

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob | Uint8Array | ArrayBuffer, options?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  }
}

type VisualJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
type VisualJobKind = 'world_entity_icon_grid' | 'brand_atlas' | 'screen_mockup' | 'character_sheet' | 'wiki_visual' | 'app_screen_mockup'

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
}) {
  return fetchFalJson(`${falQueueBaseUrl}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: 'square_hd',
      quality: Deno.env.get('VISUAL_GENERATION_FAL_QUALITY') ?? 'high',
      num_images: 1,
      output_format: 'png',
      sync_mode: false,
    }),
  })
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
      promptChars: input.prompt.length,
    })
    await heartbeat(input.client, input.job.id, input.workerId, {
      phase: `${input.phasePrefix}_submitting_fal_image`,
      promptChars: input.prompt.length,
      provider: 'fal',
      model: input.model,
    })

    const submit = await submitFalImageRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
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
  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
    phasePrefix: 'entity_icon_grid',
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
