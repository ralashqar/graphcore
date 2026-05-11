import {
  AiImageProvider,
  AiModel,
  DurableImageJobRequest,
  DurableImageJobResponse,
  ProviderCapability,
  StandardImageRequest,
  StandardImageResponse,
} from '../registry.ts'

const FAL_QUEUE_BASE_URL = 'https://queue.fal.run'

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeImageSize(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const rawWidth = Number(record.width ?? 0)
    const rawHeight = Number(record.height ?? 0)
    const normalizeDimension = (dimension: number) => {
      if (!Number.isFinite(dimension) || dimension <= 0) return 1024
      return Math.max(16, Math.round(dimension / 16) * 16)
    }
    const width = normalizeDimension(rawWidth)
    const height = normalizeDimension(rawHeight)
    return { width, height }
  }
  return { width: 1024, height: 1024 }
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

function falErrorMessage(body: Record<string, unknown>, fallback: string) {
  const detail = body.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const first = detail.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined
    const message = readText(first?.msg) || readText(first?.message)
    if (message) return message
  }
  const error = body.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error && typeof error === 'object') {
    const message = readText((error as Record<string, unknown>).message)
    if (message) return message
  }
  return fallback
}

function normalizeFalResultBody(body: Record<string, unknown>) {
  const data = body.data
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : body
}

function extractFalImageRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const directUrl = readText(record.url)
  if (directUrl) return record
  const images = record.images
  if (Array.isArray(images)) {
    const first = images.find((item) => item && typeof item === 'object')
    if (first) return first as Record<string, unknown>
  }
  const image = record.image
  if (image && typeof image === 'object') return image as Record<string, unknown>
  for (const key of ['result', 'output']) {
    const nested = extractFalImageRecord(record[key])
    if (nested) return nested
  }
  return null
}

function modelName(modelPreference?: string) {
  const raw = modelPreference && modelPreference !== 'auto' ? modelPreference : 'fal/openai/gpt-image-2'
  return raw.startsWith('fal/') ? raw.replace('fal/', '') : raw
}

function mapAspectRatioToImageSize(ratio?: string): unknown {
  switch (ratio) {
    case '1:1': return { width: 1024, height: 1024 }
    case '16:9': return { width: 1792, height: 1024 }
    case '9:16': return { width: 1024, height: 1792 }
    case '2:3': return { width: 1024, height: 1536 }
    default: return { width: 1024, height: 1024 }
  }
}

function outputWorkflowFalTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 1_200_000
}

function outputWorkflowFalPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 3_000
}

async function submitFalImageRequest(input: {
  apiKey: string
  model: string
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
}) {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: normalizeImageSize(input.imageSize),
    quality: input.quality,
    num_images: 1,
    output_format: input.outputFormat,
    sync_mode: false,
  }
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    body.image_urls = input.referenceImageUrls
  }
  return fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

async function getFalStatus(input: {
  apiKey: string
  model: string
  requestId: string
  statusUrl?: string | null
}) {
  const candidates = [
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/status`,
    input.statusUrl,
  ].filter((url, index, urls): url is string => (
    typeof url === 'string' && url.trim().length > 0 && urls.indexOf(url) === index
  ))

  let lastResult: Awaited<ReturnType<typeof fetchFalJson>> | null = null
  for (const candidate of candidates) {
    const url = new URL(candidate)
    url.searchParams.set('logs', '1')
    const result = await fetchFalJson(url.toString(), {
      method: 'GET',
      headers: buildFalHeaders(input.apiKey),
    })
    lastResult = result
    if (result.response.ok) return result
    if (result.response.status !== 404 && result.response.status !== 405) return result
  }
  const url = new URL(`${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/status`)
  url.searchParams.set('logs', '1')
  return lastResult ?? fetchFalJson(url.toString(), {
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
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/response`,
    `${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}`,
    input.responseUrl,
  ].filter((url, index, urls): url is string => (
    typeof url === 'string' && url.trim().length > 0 && urls.indexOf(url) === index
  ))

  let lastResult: Awaited<ReturnType<typeof fetchFalJson>> | null = null
  for (const url of candidates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await fetchFalJson(url, {
        method: 'GET',
        headers: buildFalHeaders(input.apiKey),
      })
      lastResult = result
      if (result.response.ok) return result
      const transient = [500, 502, 503, 504].includes(result.response.status)
      if (!transient) break
      await sleep(1000 * (attempt + 1))
    }
    if (
      lastResult
      && lastResult.response.status !== 404
      && lastResult.response.status !== 405
      && ![500, 502, 503, 504].includes(lastResult.response.status)
    ) return lastResult
  }
  return lastResult ?? fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}/requests/${input.requestId}/response`, {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

function cancelledError() {
  const error = new Error('Output workflow run was cancelled.') as Error & { workflowCancelled?: boolean }
  error.name = 'WorkflowCancelledError'
  error.workflowCancelled = true
  return error
}

export class FalProvider implements AiImageProvider {
  id = 'fal'
  name = 'Fal.ai'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['image']

  getAvailableModels(): AiModel[] {
    return [
      {
        id: 'fal/openai/gpt-image-2',
        name: 'GPT Image 2 via Fal',
        provider: 'fal',
        modality: 'image',
        costCategory: 'cheap',
        supportsDurableImageJobs: true,
        supportsReferenceImages: true,
      },
      {
        id: 'fal/openai/gpt-image-2/edit',
        name: 'GPT Image 2 Edit via Fal',
        provider: 'fal',
        modality: 'image',
        costCategory: 'cheap',
        supportsDurableImageJobs: true,
        supportsReferenceImages: true,
      },
    ]
  }

  getCapabilities(): ProviderCapability[] {
    return [{
      provider: this.id,
      modality: 'image',
      defaultModelId: 'fal/openai/gpt-image-2',
      modelIds: this.getAvailableModels().map((model) => model.id),
      costCategory: 'cheap',
      supportsDurableImageJobs: true,
      supportsReferenceImages: true,
    }]
  }

  private getApiKey() {
    const apiKey = Deno.env.get('FAL_KEY')
    if (!apiKey) throw new Error('FAL_KEY is not configured for Fal image generation.')
    return apiKey
  }

  async generateImage(req: StandardImageRequest): Promise<StandardImageResponse> {
    const result = await this.runImageJob({
      modelPreference: req.modelPreference,
      task: req.task,
      costPolicy: req.costPolicy,
      prompt: req.prompt,
      imageSize: mapAspectRatioToImageSize(req.aspectRatio),
      quality: 'high',
      outputFormat: req.outputFormat ?? 'png',
      referenceImageUrls: [],
    })
    return {
      images: [{
        url: result.imageUrl,
        width: result.width ?? undefined,
        height: result.height ?? undefined,
      }],
      provider: result.provider,
      model: result.model,
      attempts: result.attempts,
      providerRequestId: result.providerRequestId,
      finishReason: result.providerStatus,
    }
  }

  async runImageJob(req: DurableImageJobRequest): Promise<DurableImageJobResponse> {
    const apiKey = this.getApiKey()
    const model = modelName(req.modelPreference)
    const priorMetadata = req.priorMetadata ?? {}
    let requestId = readText(req.priorProviderRequestId) || readText(priorMetadata.falRequestId)
    let statusUrl: string | null = readText(priorMetadata.falStatusUrl) || null
    let responseUrl: string | null = readText(priorMetadata.falResponseUrl) || null

    if (!requestId) {
      const submit = await submitFalImageRequest({
        apiKey,
        model,
        prompt: req.prompt,
        imageSize: req.imageSize,
        quality: req.quality,
        outputFormat: req.outputFormat,
        referenceImageUrls: req.referenceImageUrls,
      })
      if (!submit.response.ok) {
        throw new Error(falErrorMessage(submit.body, `Fal image submission failed with HTTP ${submit.response.status}.`))
      }
      requestId = readText(submit.body.request_id)
      statusUrl = readText(submit.body.status_url) || null
      responseUrl = readText(submit.body.response_url) || null
      if (!requestId) throw new Error('Fal did not return a request id for the output image generation node.')
    }

    await req.onProgress?.({
      provider: 'fal',
      model: req.modelPreference ?? `fal/${model}`,
      providerRequestId: requestId,
      providerStatus: 'IN_QUEUE',
      providerMode: 'fal_queue',
      lastProviderPollAt: new Date().toISOString(),
      metadata: {
        falRequestId: requestId,
        falStatusUrl: statusUrl,
        falResponseUrl: responseUrl,
      },
    })

    const timeoutMs = outputWorkflowFalTimeoutMs()
    const pollIntervalMs = outputWorkflowFalPollIntervalMs()
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      if (await req.shouldCancel?.()) {
        throw cancelledError()
      }
      const status = await getFalStatus({
        apiKey,
        model,
        requestId,
        statusUrl,
      })
      const providerStatus = readText(status.body.status) || 'UNKNOWN'
      await req.onProgress?.({
        provider: 'fal',
        model: req.modelPreference ?? `fal/${model}`,
        providerRequestId: requestId,
        providerStatus,
        providerMode: 'fal_queue',
        lastProviderPollAt: new Date().toISOString(),
        metadata: {
          falRequestId: requestId,
          falStatusUrl: statusUrl,
          falResponseUrl: responseUrl,
        },
      })

      if (providerStatus === 'COMPLETED' || providerStatus === 'UNKNOWN') {
        const result = await getFalResult({
          apiKey,
          model,
          requestId,
          responseUrl,
        })
        if (!result.response.ok) {
          if (
            providerStatus === 'UNKNOWN'
            && [404, 405, 409, 425].includes(result.response.status)
          ) {
            await sleep(pollIntervalMs)
            continue
          }
          throw new Error(falErrorMessage(result.body, `Fal image result failed with HTTP ${result.response.status}.`))
        }
        const resultBody = normalizeFalResultBody(result.body)
        const image = extractFalImageRecord(resultBody) ?? extractFalImageRecord(result.body)
        const imageUrl = readText(image?.url)
        if (!imageUrl) throw new Error('Fal completed the output image request but did not return an image URL.')
        return {
          provider: 'fal',
          model: req.modelPreference ?? `fal/${model}`,
          providerRequestId: requestId,
          providerMode: 'fal_queue',
          providerStatus: 'COMPLETED',
          imageUrl,
          width: Number(image?.width ?? 0) || null,
          height: Number(image?.height ?? 0) || null,
          mimeType: readText(image?.content_type) || `image/${req.outputFormat}`,
          fileName: readText(image?.file_name) || null,
          fileSize: Number(image?.file_size ?? 0) || null,
          resultBody,
          statusUrl,
          responseUrl,
          attempts: [],
        }
      }

      const errorMessage = falErrorMessage(status.body, '')
      if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
        throw new Error(errorMessage)
      }

      await sleep(pollIntervalMs)
    }

    throw new Error(`Fal image request timed out before completion after ${timeoutMs}ms.`)
  }
}
