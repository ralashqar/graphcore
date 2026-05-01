import {
  buildIconGenerationPrompt,
  iconGenerationCandidateSchema,
  mapIconGenerationJobRow,
  type IconGenerationCandidate,
  type IconGenerationJob,
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

const falQueueBaseUrl = 'https://queue.fal.run'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'entity'
}

function normalizeFalIconModel(model: string | null | undefined) {
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
      quality: Deno.env.get('WORLD_ENTITY_ICON_FAL_QUALITY') ?? 'high',
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

async function waitForFalImage(input: {
  client: DatabaseClient
  job: IconGenerationJob
  workerId: string
  apiKey: string
  model: string
  prompt: string
}) {
  const existingRequestId = readString(input.job.metadata.falRequestId)
  const existingStatusUrl = readString(input.job.metadata.falStatusUrl)
  const existingResponseUrl = readString(input.job.metadata.falResponseUrl)

  let requestId = existingRequestId
  let statusUrl: string | null = existingStatusUrl || null
  let responseUrl: string | null = existingResponseUrl || null

  if (!requestId) {
    console.info('[world-entity-icon-job] submitting Fal icon grid request.', {
      jobId: input.job.id,
      workerId: input.workerId,
      model: input.model,
      candidateCount: Array.isArray(input.job.metadata.candidates) ? input.job.metadata.candidates.length : null,
      gridRows: input.job.gridRows,
      gridCols: input.job.gridCols,
      promptChars: input.prompt.length,
    })
    await heartbeat(input.client, input.job.id, input.workerId, {
      phase: 'submitting_fal_image',
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
      console.error('[world-entity-icon-job] Fal icon grid submission failed.', {
        jobId: input.job.id,
        workerId: input.workerId,
        model: input.model,
        httpStatus: submit.response.status,
        body: submit.body,
        rawText: submit.rawText,
      })
      throw new Error(getFalErrorMessage(submit.body, `Fal image submission failed with HTTP ${submit.response.status}.`))
    }
    if (!requestId) {
      throw new Error('Fal did not return a request id for the entity icon grid.')
    }

    await heartbeat(input.client, input.job.id, input.workerId, {
      phase: 'fal_image_queued',
      provider: 'fal',
      model: input.model,
      falRequestId: requestId,
      falStatusUrl: statusUrl,
      falResponseUrl: responseUrl,
      falSubmittedAt: new Date().toISOString(),
    })
    console.info('[world-entity-icon-job] Fal icon grid request queued.', {
      jobId: input.job.id,
      workerId: input.workerId,
      model: input.model,
      requestId,
      statusUrl,
      responseUrl,
    })
  }

  const timeoutMs = Number(Deno.env.get('WORLD_ENTITY_ICON_FAL_TIMEOUT_MS') ?? 1_200_000)
  const pollIntervalMs = Number(Deno.env.get('WORLD_ENTITY_ICON_FAL_POLL_INTERVAL_MS') ?? 3_000)
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
      console.info('[world-entity-icon-job] Fal icon grid status.', {
        jobId: input.job.id,
        workerId: input.workerId,
        model: input.model,
        requestId,
        providerStatus: providerStatus || null,
        httpStatus: status.response.status,
      })
      await heartbeat(input.client, input.job.id, input.workerId, {
        phase: 'waiting_for_fal_image',
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
        console.error('[world-entity-icon-job] Fal icon grid completed without image URL.', {
          jobId: input.job.id,
          workerId: input.workerId,
          model: input.model,
          requestId,
          resultBody: result.body,
          rawText: result.rawText,
        })
        throw new Error('Fal completed the icon grid request but did not return an image URL.')
      }
      console.info('[world-entity-icon-job] Fal icon grid result ready.', {
        jobId: input.job.id,
        workerId: input.workerId,
        model: input.model,
        requestId,
        imageUrl,
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

  throw new Error('Fal icon grid request timed out before completion.')
}

async function loadIconJob(client: DatabaseClient, jobId: string) {
  const response = await client
    .from('world_entity_icon_generation_jobs')
    .select('id, project_id, draft_id, status, provider, model, grid_rows, grid_cols, entity_keys, source_grid_asset_key, created_asset_keys, error_message, metadata, created_at, updated_at')
    .eq('id', jobId)
    .single()

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? `Icon generation job ${jobId} was not found.`)
  }

  return mapIconGenerationJobRow(response.data)
}

function readCandidates(job: IconGenerationJob): IconGenerationCandidate[] {
  const rawCandidates = Array.isArray(job.metadata.candidates) ? job.metadata.candidates : []
  return rawCandidates
    .map((candidate) => iconGenerationCandidateSchema.safeParse(candidate))
    .filter((parsed): parsed is { success: true; data: IconGenerationCandidate } => parsed.success)
    .map((parsed) => parsed.data)
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

async function heartbeat(client: DatabaseClient, jobId: string, workerId: string, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('heartbeat_world_entity_icon_generation_job', {
    job_id: jobId,
    worker_id: workerId,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
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

async function processIconJob(client: DatabaseClient, job: IconGenerationJob, workerId: string) {
  const candidates = readCandidates(job)
  if (candidates.length === 0) {
    throw new Error('Icon generation job has no valid candidates.')
  }
  console.info('[world-entity-icon-job] processing claimed job.', {
    jobId: job.id,
    workerId,
    provider: job.provider,
    model: job.model,
    candidateCount: candidates.length,
    gridRows: job.gridRows,
    gridCols: job.gridCols,
  })

  const artStyle = asRecord(job.metadata.artStyle)
  const prompt = buildIconGenerationPrompt({
    candidates,
    gridRows: job.gridRows,
    gridCols: job.gridCols,
    artStyleName: readString(artStyle.artStyleName) || 'GraphCore project art style',
    artStyleDescription: readString(artStyle.artStyleDescription) || 'cohesive, polished, high-quality worldbuilding icon art',
  })

  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) {
    throw new Error('FAL_KEY is not configured for the Fly world generation worker.')
  }
  const model = normalizeFalIconModel(Deno.env.get('WORLD_ENTITY_ICON_FAL_MODEL') ?? job.model)
  const falResult = await waitForFalImage({
    client,
    job,
    workerId,
    apiKey: falApiKey,
    model,
    prompt,
  })

  const download = await fetch(falResult.imageUrl)
  if (!download.ok) throw new Error(`Generated Fal image could not be downloaded (${download.status}).`)
  const gridBytes = new Uint8Array(await download.arrayBuffer())
  console.info('[world-entity-icon-job] downloaded Fal icon grid.', {
    jobId: job.id,
    workerId,
    requestId: falResult.requestId,
    bytes: gridBytes.byteLength,
  })

  await heartbeat(client, job.id, workerId, { phase: 'cropping_image', imageBytes: gridBytes.byteLength })

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

  const cellWidth = Math.floor(width / job.gridCols)
  const cellHeight = Math.floor(height / job.gridRows)
  const createdAssetKeys: Record<string, string> = {}
  const assetRows: Array<Record<string, unknown>> = [{
    project_id: job.projectId,
    key: gridAssetKey,
    name: 'World Entity Icon Grid',
    kind: 'image',
    mime_type: 'image/png',
    storage_path: gridPath,
    metadata: {
      generatedBy: 'world_entity_icon_grid',
      provider: 'fal',
      model,
      falRequestId: falResult.requestId,
      falImageUrl: falResult.imageUrl,
      storageBucket: 'project-assets',
      storagePath: gridPath,
      jobId: job.id,
      gridRows: job.gridRows,
      gridCols: job.gridCols,
      entityKeys: candidates.map((candidate) => candidate.entityKey),
      prompt,
      generatedAt: new Date().toISOString(),
    },
  }]

  for (const [index, candidate] of candidates.entries()) {
    const row = Math.floor(index / job.gridCols)
    const col = index % job.gridCols
    const assetKey = `world_icon_${slugify(candidate.name)}_${candidate.entityKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`
    const storagePath = `generated/world-icons/${job.draftId}/${job.id}/${String(index + 1).padStart(2, '0')}_${slugify(candidate.name)}.webp`
    const crop = await sharp(gridBytes)
      .extract({
        left: col * cellWidth,
        top: row * cellHeight,
        width: col === job.gridCols - 1 ? width - col * cellWidth : cellWidth,
        height: row === job.gridRows - 1 ? height - row * cellHeight : cellHeight,
      })
      .resize(768, 768, { fit: 'cover' })
      .webp({ quality: 92 })
      .toBuffer()
    await uploadBytes(client, storagePath, new Uint8Array(crop), 'image/webp')
    createdAssetKeys[candidate.entityKey] = assetKey
    assetRows.push({
      project_id: job.projectId,
      key: assetKey,
      name: `${candidate.name} Icon`,
      kind: 'image',
      mime_type: 'image/webp',
      storage_path: storagePath,
      metadata: {
        generatedBy: 'world_entity_icon_grid',
        provider: 'fal',
        model,
        falRequestId: falResult.requestId,
        falImageUrl: falResult.imageUrl,
        storageBucket: 'project-assets',
        storagePath,
        sourceGridAssetKey: gridAssetKey,
        jobId: job.id,
        gridIndex: index,
        row,
        col,
        gridRows: job.gridRows,
        gridCols: job.gridCols,
        entityKey: candidate.entityKey,
        promptFragment: candidate.visualPrompt || candidate.summary,
        generatedAt: new Date().toISOString(),
      },
    })
  }

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

  const complete = await client.rpc('complete_world_entity_icon_generation_job', {
    job_id: job.id,
    worker_id: workerId,
    source_grid_asset_key: gridAssetKey,
    created_asset_keys: createdAssetKeys,
    metadata_patch: {
      phase: 'completed',
      provider: 'fal',
      model,
      falRequestId: falResult.requestId,
      falStatusUrl: falResult.statusUrl,
      falResponseUrl: falResult.responseUrl,
      falImageUrl: falResult.imageUrl,
      completedCount: Object.keys(createdAssetKeys).length,
      imageSize: { width, height },
    },
  })
  if (complete.error) throw new Error(complete.error.message)
  console.info('[world-entity-icon-job] completed icon job.', {
    jobId: job.id,
    workerId,
    completedCount: Object.keys(createdAssetKeys).length,
    gridAssetKey,
  })

  return {
    completedCount: Object.keys(createdAssetKeys).length,
  }
}

export async function processFlyWorldEntityIconJobs(input: {
  client: DatabaseClient
  workerId: string
}) {
  const claim = await input.client.rpc('claim_world_entity_icon_generation_job', {
    worker_id: input.workerId,
  })
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) {
    return { processed: false, job: null as IconGenerationJob | null }
  }

  const jobId = String(claim.data)
  let job: IconGenerationJob | null = null
  try {
    job = await loadIconJob(input.client, jobId)
    const result = await processIconJob(input.client, job, input.workerId)
    return {
      processed: true,
      job: {
        ...job,
        status: 'completed' as const,
        metadata: {
          ...job.metadata,
          completedCount: result.completedCount,
        },
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[world-entity-icon-job] failed icon job.', {
      jobId,
      workerId: input.workerId,
      message,
    })
    try {
      const failed = await input.client.rpc('fail_world_entity_icon_generation_job', {
        job_id: jobId,
        worker_id: input.workerId,
        error_message: message,
        metadata_patch: { phase: 'failed' },
      })
      if (failed.error) {
        console.error('[world-entity-icon-job] failed to persist icon job failure.', {
          jobId,
          workerId: input.workerId,
          message: failed.error.message,
        })
      }
    } catch {
      // Keep the worker loop alive even if failure persistence itself fails.
    }
    throw error
  }
}
