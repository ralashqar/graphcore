import { aiGenerationSettings } from '../../../src/config/aiGenerationSettings.ts'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

type LooseRecord = Record<string, unknown>

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as LooseRecord
    : {}
}

const DEFAULT_OUTPUT_WORKFLOW_VIDEO_PROVIDER = aiGenerationSettings.outputWorkflow.videoProviderDefault
const DEFAULT_MUAPI_VIDEO_MODEL = aiGenerationSettings.outputWorkflow.videoMuapiModel
const DEFAULT_FAL_VIDEO_MODEL = aiGenerationSettings.outputWorkflow.videoFalModel
const DEFAULT_FAL_VIDEO_HIGH_RESOLUTION_MODEL = aiGenerationSettings.outputWorkflow.videoFalHighResolutionModel
export const FAL_QUEUE_BASE_URL = 'https://queue.fal.run'
export const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1'
export const MUAPI_VIDEO_PROMPT_MAX_CHARS = 4000
export const MUAPI_VIDEO_PROMPT_SAFE_CHARS = 3900

export type WorkflowMediaNodeExecutionContext = {
  client: unknown
  inputHash: string
  node: {
    id: string
    key: string
    label: string
    nodeType?: string
    type?: string
    config: unknown
    inputs?: LooseRecord
  }
  workflow: {
    id: string
    key: string
    name: string
    metadata?: unknown
  }
  run: {
    id: string
    projectId: string
    draftId: string
    preset: string
    requestId?: string | null
    prompt?: string | null
    input?: LooseRecord
  }
  upstream: Record<string, Record<string, unknown>>
  priorStep?: {
    inputHash?: string | null
    outputHash?: string | null
    outputs?: unknown
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: unknown
    errorMessage?: string | null
    startedAt?: string | null
  } | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

export type WorkflowMediaNodeExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider?: string | null
  model?: string | null
  providerRequestId?: string | null
}

export type WorkflowMediaRuntime = {
  executeImageGeneration: (context: WorkflowMediaNodeExecutionContext) => Promise<WorkflowMediaNodeExecutionResult>
  executeVideoGeneration: (context: WorkflowMediaNodeExecutionContext) => Promise<WorkflowMediaNodeExecutionResult>
}

export function createWorkflowMediaRuntime(runtime: WorkflowMediaRuntime): WorkflowMediaRuntime {
  return runtime
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function outputWorkflowImageModel(configModel?: unknown) {
  const configured = readText(configModel) || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_MODEL')?.trim() || 'openai/gpt-image-2'
  return configured === 'gpt-image-2' ? 'openai/gpt-image-2' : configured
}

export function normalizeImageSize(value: unknown) {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const width = Number(record.width)
  const height = Number(record.height)
  if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
    const normalizeDimension = (dimension: number) => Math.max(16, Math.min(3840, Math.round(dimension / 16) * 16))
    return {
      width: normalizeDimension(width),
      height: normalizeDimension(height),
    }
  }
  const text = readText(value)
  return text || { width: 1792, height: 2688 }
}

export function normalizeOutputVideoProvider(value: unknown) {
  const provider = readText(value).toLowerCase()
  return provider === 'fal' || provider === 'muapi' ? provider : DEFAULT_OUTPUT_WORKFLOW_VIDEO_PROVIDER
}

export function resolveOutputVideoProvider(config: Record<string, unknown>) {
  return normalizeOutputVideoProvider(readText(config.provider) || readText(config.videoProvider) || Deno.env.get('OUTPUT_WORKFLOW_VIDEO_PROVIDER'))
}

export function resolveFalVideoModel(resolution: string) {
  return resolution === '1080p' ? DEFAULT_FAL_VIDEO_HIGH_RESOLUTION_MODEL : DEFAULT_FAL_VIDEO_MODEL
}

export function outputWorkflowDefaultVideoModel(provider: string, resolution: string) {
  return provider === 'muapi' ? DEFAULT_MUAPI_VIDEO_MODEL : resolveFalVideoModel(resolution)
}

export function resolveMuapiVideoModel(value: unknown) {
  const model = readText(value) || DEFAULT_MUAPI_VIDEO_MODEL
  const aliases: Record<string, string> = {
    'seedance-2.0-omni-reference': DEFAULT_MUAPI_VIDEO_MODEL,
    'sd-2-omni-reference': DEFAULT_MUAPI_VIDEO_MODEL,
    'seedance-2-omni-reference': DEFAULT_MUAPI_VIDEO_MODEL,
    'sd-2-vip-omni-reference': DEFAULT_MUAPI_VIDEO_MODEL,
    'seedance-2-vip-omni-reference': DEFAULT_MUAPI_VIDEO_MODEL,
    'sd-2-vip-omni-reference-fast': DEFAULT_MUAPI_VIDEO_MODEL,
    'seedance-2-vip-omni-reference-fast': DEFAULT_MUAPI_VIDEO_MODEL,
  }
  return aliases[model] ?? model
}

export function resolveMuapiVideoQuality(value: unknown) {
  const quality = readText(value).toLowerCase()
  return quality === 'standard' || quality === 'high' ? quality : 'high'
}

export function resolveMuapiVideoDurationSeconds(value: unknown) {
  const duration = Math.max(1, Math.round(Number(value) || 5))
  if (duration <= 5) return 5
  if (duration <= 10) return 10
  return 15
}

export function referenceLimitForImageNode(config: Record<string, unknown>, role: string) {
  const configured = Number(config.maxReferenceImages ?? config.referenceLimit ?? 0)
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(16, Math.floor(configured)))
  }
  if (role === 'comic_page') return 6
  if (role === 'comic_atlas' || role === 'cinematic_atlas' || role === 'cinematic_storyboard' || role === 'cinematic_direction_sheet') return 16
  return 16
}

export function outputWorkflowFalStaleRequestMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_STALE_REQUEST_MS') ?? Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 900_000
}

export function outputWorkflowFalTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 1_200_000
}

export function outputWorkflowFalPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 3_000
}

export function outputWorkflowFalWebhookPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_FAL_WEBHOOK_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_WEBHOOK_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 10_000
}

export function outputWorkflowMuapiTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_TIMEOUT_MS') ?? Deno.env.get('OUTPUT_WORKFLOW_FAL_TIMEOUT_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, Math.floor(parsed)) : 1_200_000
}

export function outputWorkflowMuapiPollIntervalMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_POLL_INTERVAL_MS') ?? Deno.env.get('OUTPUT_WORKFLOW_FAL_POLL_INTERVAL_MS') ?? Deno.env.get('VISUAL_GENERATION_FAL_POLL_INTERVAL_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, Math.floor(parsed)) : 3_000
}

function outputWorkflowMuapiWebhookSecret() {
  return Deno.env.get('OUTPUT_WORKFLOW_MUAPI_WEBHOOK_SECRET')?.trim()
    || Deno.env.get('MUAPI_WEBHOOK_SECRET')?.trim()
    || ''
}

export function buildOutputWorkflowMuapiWebhookUrl() {
  const secret = outputWorkflowMuapiWebhookSecret()
  if (!secret) return ''

  const overrideUrl = Deno.env.get('OUTPUT_WORKFLOW_MUAPI_WEBHOOK_URL')?.trim()
  if (overrideUrl) {
    try {
      const url = new URL(overrideUrl)
      if (!url.searchParams.has('secret')) {
        url.searchParams.set('secret', secret)
      }
      return url.toString()
    } catch {
      return ''
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '')
  if (!supabaseUrl) return ''
  const url = new URL(`${supabaseUrl}/functions/v1/muapi-webhook`)
  url.searchParams.set('secret', secret)
  return url.toString()
}

export function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })
}

export function buildMuapiHeaders(apiKey: string) {
  return new Headers({
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  })
}

export function buildFalImageRequestBody(input: {
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
  webhookUrl?: string
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
  if (input.webhookUrl) {
    body.webhook_url = input.webhookUrl
  }
  return body
}

export function buildFalVideoRequestBody(input: {
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  syncMode?: boolean
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.durationSeconds,
    aspect_ratio: input.aspectRatio ?? '16:9',
    resolution: input.resolution ?? '720p',
    generate_audio: input.generateAudio ?? true,
    sync_mode: input.syncMode ?? false,
  }
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    body.image_urls = input.referenceImageUrls
  }
  if (input.referenceVideoUrls && input.referenceVideoUrls.length > 0) {
    body.video_urls = input.referenceVideoUrls
  }
  if (input.referenceAudioUrls && input.referenceAudioUrls.length > 0) {
    body.audio_urls = input.referenceAudioUrls
  }
  return body
}

export async function fetchFalJson(url: string, init: RequestInit) {
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

export async function fetchMuapiJson(url: string, init: RequestInit) {
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

export async function submitFalImageRequest(input: {
  apiKey: string
  model: string
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
  webhookUrl?: string
}) {
  const body = buildFalImageRequestBody(input)
  const url = new URL(`${FAL_QUEUE_BASE_URL}/${input.model}`)
  if (input.webhookUrl) {
    url.searchParams.set('fal_webhook', input.webhookUrl)
  }
  return fetchFalJson(url.toString(), {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

export async function submitFalVideoRequest(input: {
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  syncMode?: boolean
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  const body = buildFalVideoRequestBody(input)
  return fetchFalJson(`${FAL_QUEUE_BASE_URL}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

export async function submitMuapiVideoRequest(input: {
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  quality?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  webhookUrl?: string
}) {
  const url = new URL(`${MUAPI_BASE_URL}/${resolveMuapiVideoModel(input.model)}`)
  if (input.webhookUrl) {
    url.searchParams.set('webhook', input.webhookUrl)
  }
  return fetchMuapiJson(url.toString(), {
    method: 'POST',
    headers: buildMuapiHeaders(input.apiKey),
    body: JSON.stringify(buildMuapiVideoPayload(input)),
  })
}

export async function getMuapiResult(input: {
  apiKey: string
  requestId: string
}) {
  return fetchMuapiJson(`${MUAPI_BASE_URL}/predictions/${encodeURIComponent(input.requestId)}/result`, {
    method: 'GET',
    headers: buildMuapiHeaders(input.apiKey),
  })
}

export async function getFalStatus(input: {
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

export async function getFalResult(input: {
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

export type FalWebhookImageResult = {
  status: 'completed' | 'failed' | 'pending'
  imageUrl: string
  errorMessage: string
  resultBody: Record<string, unknown>
}

export function readFalWebhookImageResult(metadata: Record<string, unknown>, requestId: string): FalWebhookImageResult | null {
  const currentRequestId = readText(metadata.falRequestId)
  if (currentRequestId && currentRequestId !== requestId) return null
  const webhookStatus = readText(metadata.webhookStatus)
  if (!webhookStatus) return null
  const imageUrl = readText(metadata.falWebhookImageUrl) || readText(metadata.falImageUrl)
  const errorMessage = readText(metadata.webhookErrorMessage)
    || readText(metadata.falWebhookErrorMessage)
    || readText(metadata.webhookPayloadError)
  const resultBody = asRecord(metadata.falWebhookPayload)
  if (webhookStatus === 'ERROR') {
    return { status: 'failed', imageUrl: '', errorMessage: errorMessage || 'Fal webhook reported an image generation error.', resultBody }
  }
  if (imageUrl) return { status: 'completed', imageUrl, errorMessage: '', resultBody }
  return { status: 'pending', imageUrl: '', errorMessage: '', resultBody }
}

type ProviderWaitPriorStep = {
  providerRequestId?: string | null
  startedAt?: string | null
  metadata?: unknown
} | null | undefined

type FalProgress = {
  providerRequestId: string
  providerStatus: string
  providerMode: string
  lastProviderPollAt: string
  webhookConfigured?: boolean
  providerSubmittedAt?: string | null
  providerElapsedMs?: number | null
  staleRequestRestarted?: boolean
  statusUrl?: string | null
  responseUrl?: string | null
}

type MuapiProgress = {
  providerRequestId: string
  providerStatus: string
  providerMode: string
  lastProviderPollAt: string
  resultUrl: string
  webhookConfigured?: boolean
}

function inferUuidV7TimestampIso(value: unknown) {
  const clean = readText(value).replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(clean)) return ''
  const timestampMs = Number.parseInt(clean.slice(0, 12), 16)
  if (!Number.isFinite(timestampMs)) return ''
  const earliestReasonable = Date.parse('2020-01-01T00:00:00.000Z')
  const latestReasonable = Date.now() + 24 * 60 * 60 * 1000
  if (timestampMs < earliestReasonable || timestampMs > latestReasonable) return ''
  return new Date(timestampMs).toISOString()
}

export async function waitForOutputFalImage(input: {
  priorStep?: ProviderWaitPriorStep
  apiKey: string
  model: string
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
  webhookUrl?: string
  shouldCancel?: () => Promise<boolean>
  createCancelledError?: () => Error
  onProgress?: (progress: FalProgress) => Promise<void>
  getWebhookResult?: (requestId: string) => Promise<FalWebhookImageResult | null>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.falRequestId)
  let statusUrl: string | null = readText(priorMetadata.falStatusUrl) || null
  let responseUrl: string | null = readText(priorMetadata.falResponseUrl) || null
  let providerSubmittedAt = readText(priorMetadata.providerSubmittedAt)
    || readText(priorMetadata.falSubmittedAt)
    || inferUuidV7TimestampIso(requestId)
    || readText(input.priorStep?.startedAt)
    || ''
  let staleRequestRestarted = false

  const providerSubmittedAtMs = providerSubmittedAt ? Date.parse(providerSubmittedAt) : NaN
  if (
    requestId
    && Number.isFinite(providerSubmittedAtMs)
    && Date.now() - providerSubmittedAtMs > outputWorkflowFalStaleRequestMs()
  ) {
    requestId = ''
    statusUrl = null
    responseUrl = null
    providerSubmittedAt = ''
    staleRequestRestarted = true
  }

  const webhookConfigured = Boolean(input.webhookUrl)
  if (!requestId) {
    const submit = await submitFalImageRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      imageSize: input.imageSize,
      quality: input.quality,
      outputFormat: input.outputFormat,
      referenceImageUrls: input.referenceImageUrls,
      webhookUrl: input.webhookUrl,
    })
    if (!submit.response.ok) {
      throw new Error(falErrorMessage(submit.body, `Fal image submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readText(submit.body.request_id)
    statusUrl = readText(submit.body.status_url) || null
    responseUrl = readText(submit.body.response_url) || null
    if (!requestId) throw new Error('Fal did not return a request id for the output image generation node.')
    providerSubmittedAt = new Date().toISOString()
  }

  if (!providerSubmittedAt) providerSubmittedAt = new Date().toISOString()
  const providerElapsedMs = () => {
    const submittedAtMs = Date.parse(providerSubmittedAt)
    return Number.isFinite(submittedAtMs) ? Math.max(0, Date.now() - submittedAtMs) : null
  }

  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode: webhookConfigured ? 'fal_webhook_polling' : 'fal_queue',
    lastProviderPollAt: new Date().toISOString(),
    webhookConfigured,
    providerSubmittedAt,
    providerElapsedMs: providerElapsedMs(),
    staleRequestRestarted,
    statusUrl,
    responseUrl,
  })

  const timeoutMs = outputWorkflowFalTimeoutMs()
  const pollIntervalMs = webhookConfigured
    ? Math.max(outputWorkflowFalPollIntervalMs(), outputWorkflowFalWebhookPollIntervalMs())
    : outputWorkflowFalPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw input.createCancelledError?.() ?? new Error('Output workflow run was cancelled.')
    }
    const webhookResult = await input.getWebhookResult?.(requestId)
    if (webhookResult?.status === 'failed') {
      throw new Error(webhookResult.errorMessage || 'Fal webhook reported an output image generation error.')
    }
    if (webhookResult?.status === 'completed' && webhookResult.imageUrl) {
      await input.onProgress?.({
        providerRequestId: requestId,
        providerStatus: 'COMPLETED',
        providerMode: 'fal_webhook_result',
        lastProviderPollAt: new Date().toISOString(),
        webhookConfigured,
        providerSubmittedAt,
        providerElapsedMs: providerElapsedMs(),
        statusUrl,
        responseUrl,
      })
      const image = extractFalImageRecord(webhookResult.resultBody)
      return {
        requestId,
        statusUrl,
        responseUrl,
        imageUrl: webhookResult.imageUrl,
        width: Number(image?.width ?? 0) || null,
        height: Number(image?.height ?? 0) || null,
        mimeType: readText(image?.content_type) || `image/${input.outputFormat}`,
        fileName: readText(image?.file_name),
        fileSize: Number(image?.file_size ?? 0) || null,
        resultBody: webhookResult.resultBody,
      }
    }
    const status = await getFalStatus({
      apiKey: input.apiKey,
      model: input.model,
      requestId,
      statusUrl,
    })
    const providerStatus = readText(status.body.status) || 'UNKNOWN'
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode: webhookConfigured ? 'fal_webhook_polling' : 'fal_queue',
      lastProviderPollAt: new Date().toISOString(),
      webhookConfigured,
      providerSubmittedAt,
      providerElapsedMs: providerElapsedMs(),
      statusUrl,
      responseUrl,
    })

    if (providerStatus === 'COMPLETED' || providerStatus === 'UNKNOWN') {
      const result = await getFalResult({
        apiKey: input.apiKey,
        model: input.model,
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
        requestId,
        statusUrl,
        responseUrl,
        imageUrl,
        width: Number(image?.width ?? 0) || null,
        height: Number(image?.height ?? 0) || null,
        mimeType: readText(image?.content_type) || `image/${input.outputFormat}`,
        fileName: readText(image?.file_name),
        fileSize: Number(image?.file_size ?? 0) || null,
        resultBody,
      }
    }

    const errorMessage = falErrorMessage(status.body, '')
    if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
      throw new Error(errorMessage)
    }

    await sleep(pollIntervalMs)
  }

  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'TIMED_OUT',
    providerMode: webhookConfigured ? 'fal_webhook_polling' : 'fal_queue',
    lastProviderPollAt: new Date().toISOString(),
    webhookConfigured,
    providerSubmittedAt,
    providerElapsedMs: providerElapsedMs(),
    staleRequestRestarted,
    statusUrl,
    responseUrl,
  })

  throw new Error(`Fal image request ${requestId} timed out before completion after ${timeoutMs}ms.`)
}

export async function waitForOutputFalVideo(input: {
  priorStep?: ProviderWaitPriorStep
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  syncMode?: boolean
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  createCancelledError?: () => Error
  onProgress?: (progress: FalProgress) => Promise<void>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.falRequestId)
  let statusUrl: string | null = readText(priorMetadata.falStatusUrl) || null
  let responseUrl: string | null = readText(priorMetadata.falResponseUrl) || null

  if (!requestId) {
    const submit = await submitFalVideoRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      syncMode: input.syncMode,
      referenceImageUrls: input.referenceImageUrls,
      referenceVideoUrls: input.referenceVideoUrls,
      referenceAudioUrls: input.referenceAudioUrls,
    })
    if (!submit.response.ok) {
      throw new Error(falErrorMessage(submit.body, `Fal video submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readText(submit.body.request_id)
    statusUrl = readText(submit.body.status_url) || null
    responseUrl = readText(submit.body.response_url) || null
    if (!requestId) throw new Error('Fal did not return a request id for the output video generation node.')
  }

  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode: 'fal_queue',
    lastProviderPollAt: new Date().toISOString(),
    statusUrl,
    responseUrl,
  })

  const timeoutMs = outputWorkflowFalTimeoutMs()
  const pollIntervalMs = outputWorkflowFalPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw input.createCancelledError?.() ?? new Error('Output workflow run was cancelled.')
    }
    const status = await getFalStatus({ apiKey: input.apiKey, model: input.model, requestId, statusUrl })
    const providerStatus = readText(status.body.status) || 'UNKNOWN'
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode: 'fal_queue',
      lastProviderPollAt: new Date().toISOString(),
      statusUrl,
      responseUrl,
    })

    if (providerStatus === 'COMPLETED' || providerStatus === 'UNKNOWN') {
      const result = await getFalResult({ apiKey: input.apiKey, model: input.model, requestId, responseUrl })
      if (!result.response.ok) {
        if (providerStatus === 'UNKNOWN' && [404, 405, 409, 425].includes(result.response.status)) {
          await sleep(pollIntervalMs)
          continue
        }
        throw new Error(falErrorMessage(result.body, `Fal video result failed with HTTP ${result.response.status}.`))
      }
      const resultBody = normalizeFalResultBody(result.body)
      const video = extractFalVideoRecord(resultBody) ?? extractFalVideoRecord(result.body)
      const videoUrl = readText(video?.url)
      if (!videoUrl) throw new Error('Fal completed the output video request but did not return a video URL.')
      return {
        requestId,
        statusUrl,
        responseUrl,
        videoUrl,
        mimeType: readText(video?.content_type) || 'video/mp4',
        fileName: readText(video?.file_name),
        fileSize: Number(video?.file_size ?? 0) || null,
        resultBody,
      }
    }

    const errorMessage = falErrorMessage(status.body, '')
    if (errorMessage && providerStatus !== 'IN_PROGRESS' && providerStatus !== 'IN_QUEUE') {
      throw new Error(errorMessage)
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`Fal video request timed out before completion after ${timeoutMs}ms.`)
}

export async function waitForOutputMuapiVideo(input: {
  priorStep?: ProviderWaitPriorStep
  apiKey: string
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  quality?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  createCancelledError?: () => Error
  onProgress?: (progress: MuapiProgress) => Promise<void>
}) {
  const priorMetadata = asRecord(input.priorStep?.metadata)
  let requestId = readText(input.priorStep?.providerRequestId) || readText(priorMetadata.muapiRequestId)
  const webhookUrl = buildOutputWorkflowMuapiWebhookUrl()
  const providerMode = webhookUrl ? 'muapi_webhook_polling' : 'muapi_polling'

  if (!requestId) {
    const submit = await submitMuapiVideoRequest({
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      referenceImageUrls: input.referenceImageUrls,
      referenceVideoUrls: input.referenceVideoUrls,
      referenceAudioUrls: input.referenceAudioUrls,
      webhookUrl,
    })
    if (!submit.response.ok) {
      throw new Error(muapiErrorMessageWithRaw(submit.body, submit.rawText, `MUAPI video submission failed with HTTP ${submit.response.status}.`))
    }
    requestId = readMuapiRequestId(submit.body)
    if (!requestId) throw new Error('MUAPI did not return a request id for the output video generation node.')
  }

  const resultUrl = `${MUAPI_BASE_URL}/predictions/${encodeURIComponent(requestId)}/result`
  await input.onProgress?.({
    providerRequestId: requestId,
    providerStatus: 'IN_QUEUE',
    providerMode,
    lastProviderPollAt: new Date().toISOString(),
    resultUrl,
    webhookConfigured: Boolean(webhookUrl),
  })

  const timeoutMs = outputWorkflowMuapiTimeoutMs()
  const pollIntervalMs = outputWorkflowMuapiPollIntervalMs()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await input.shouldCancel?.()) {
      throw input.createCancelledError?.() ?? new Error('Output workflow run was cancelled.')
    }

    const result = await getMuapiResult({ apiKey: input.apiKey, requestId })
    const providerStatus = readMuapiProviderStatus(result.body)
    await input.onProgress?.({
      providerRequestId: requestId,
      providerStatus,
      providerMode,
      lastProviderPollAt: new Date().toISOString(),
      resultUrl,
      webhookConfigured: Boolean(webhookUrl),
    })

    const videoUrl = extractMuapiVideoUrlFromResult(result.body)
    if (result.response.ok && (videoUrl || muapiStatusIsComplete(providerStatus))) {
      if (!videoUrl) throw new Error('MUAPI completed the output video request but did not return a video URL.')
      return {
        requestId,
        resultUrl,
        videoUrl,
        mimeType: videoUrl.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4',
        fileName: videoUrl.split('/').pop()?.split('?')[0] || '',
        fileSize: null,
        resultBody: result.body,
      }
    }

    if (!result.response.ok && ![404, 409, 425, 429, 500, 502, 503, 504].includes(result.response.status)) {
      throw new Error(muapiErrorMessageWithRaw(result.body, result.rawText, `MUAPI video result failed with HTTP ${result.response.status}.`))
    }
    if (muapiStatusIsFailed(providerStatus)) {
      throw new Error(muapiErrorMessage(result.body, `MUAPI video generation failed with status ${providerStatus}.`))
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`MUAPI video request timed out before completion after ${timeoutMs}ms.`)
}

export function muapiErrorMessage(body: Record<string, unknown>, fallback: string) {
  const direct = readText(body.error_message)
    || readText(body.error)
    || readText(body.message)
    || readText(body.detail)
    || readText(asRecord(body.error).message)
    || readText(asRecord(body.data).error_message)
    || readText(asRecord(body.result).error_message)
  return direct || fallback
}

export function muapiErrorMessageWithRaw(body: Record<string, unknown>, rawText: string, fallback: string) {
  const message = muapiErrorMessage(body, fallback)
  const raw = rawText.trim()
  if (!raw || message !== fallback) return message
  return `${fallback} Provider response: ${raw.slice(0, 800)}`
}

export function readMuapiRequestId(body: Record<string, unknown>) {
  return readText(body.request_id)
    || readText(body.requestId)
    || readText(body.id)
    || readText(body.prediction_id)
    || readText(body.predictionId)
    || readText(asRecord(body.data).request_id)
    || readText(asRecord(body.data).id)
}

export function readMuapiProviderStatus(body: Record<string, unknown>) {
  return (readText(body.status)
    || readText(body.state)
    || readText(body.task_status)
    || readText(body.taskStatus)
    || readText(asRecord(body.data).status)
    || readText(asRecord(body.result).status)
    || 'UNKNOWN').toUpperCase()
}

export function muapiStatusIsComplete(status: string) {
  return ['COMPLETED', 'COMPLETE', 'SUCCEEDED', 'SUCCESS', 'DONE', 'FINISHED'].includes(status)
}

export function muapiStatusIsFailed(status: string) {
  return ['FAILED', 'ERROR', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status)
}

export function falErrorMessage(body: Record<string, unknown>, fallback: string) {
  if (Array.isArray(body.detail)) {
    const details = body.detail
      .map((entry) => {
        const record = asRecord(entry)
        const loc = Array.isArray(record.loc) ? record.loc.map(String).join('.') : readText(record.loc)
        const msg = readText(record.msg) || readText(record.message)
        const type = readText(record.type)
        const ctx = asRecord(record.ctx)
        const extra = asRecord(ctx.extra_info)
        const reason = readText(extra.reason) || readText(ctx.reason)
        return [
          loc ? `loc=${loc}` : '',
          type ? `type=${type}` : '',
          reason ? `reason=${reason}` : '',
          msg,
        ].filter(Boolean).join(' ')
      })
      .filter(Boolean)
    if (details.length > 0) return details.join('; ').slice(0, 2000)
  }
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  if (body.detail !== undefined) {
    try {
      return JSON.stringify(body.detail)
    } catch {
      // Fall through to the generic fallback below.
    }
  }
  if (body.error !== undefined) {
    try {
      return JSON.stringify(body.error)
    } catch {
      // Fall through to the generic fallback below.
    }
  }
  return fallback
}

export function isFalReferencePolicyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /content_policy_violation|partner_validation_failed|likenesses of real people|private information|loc=body\.image_urls|image_urls/i.test(message)
}

export function normalizeFalResultBody(body: Record<string, unknown>) {
  return body && typeof body.response === 'object' && body.response !== null
    ? body.response as Record<string, unknown>
    : body
}

export function extractFalImageRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  const images = Array.isArray(record.images) ? record.images : []
  for (const image of images) {
    if (typeof image === 'string' && /^https?:\/\//i.test(image)) return { url: image }
    const imageRecord = asRecord(image)
    const url = readText(imageRecord.url)
    if (url) return imageRecord
  }
  for (const key of ['image', 'output', 'response', 'data', 'result']) {
    const nested = extractFalImageRecord(record[key])
    if (nested) return nested
  }
  const directUrl = readText(record.url) || readText(record.output_url)
  return directUrl ? { url: directUrl } : null
}

export function extractFalVideoRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  for (const key of ['video', 'output', 'response', 'data', 'result']) {
    const nested = record[key]
    if (typeof nested === 'string' && /^https?:\/\//i.test(nested)) return { url: nested }
    const nestedRecord = asRecord(nested)
    const url = readText(nestedRecord.url) || readText(nestedRecord.output_url)
    if (url) return nestedRecord
    const recursive = extractFalVideoRecord(nested)
    if (recursive) return recursive
  }
  const videos = Array.isArray(record.videos) ? record.videos : []
  for (const video of videos) {
    if (typeof video === 'string' && /^https?:\/\//i.test(video)) return { url: video }
    const videoRecord = asRecord(video)
    const url = readText(videoRecord.url) || readText(videoRecord.output_url)
    if (url) return videoRecord
  }
  const directUrl = readText(record.url) || readText(record.output_url)
  return directUrl ? { url: directUrl } : null
}

function compactSeedanceIdentitySectionForProvider(section: string) {
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const speakerLines = lines
    .filter((line) => line.startsWith('- '))
    .slice(0, 6)
    .map((line) => {
      const withoutRole = line
        .replace(/; role:[^;.]*/gi, '')
        .replace(/; visual traits:[^;.]*/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
      return withoutRole.length > 240 ? `${withoutRole.slice(0, 237).replace(/\s+\S*$/, '')}.` : withoutRole
    })
    .filter(Boolean)
  return speakerLines.length > 0
    ? ['[IDENTITY AND SPEAKER GUIDE]', ...speakerLines].join('\n')
    : ''
}

function replaceSeedanceSection(prompt: string, header: string, replacement: string) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\n?\\n?\\[${escaped}\\][\\s\\S]*?(?=\\n\\n\\[[A-Z][^\\]]+\\]|\\s*$)`, 'i')
  return prompt.replace(pattern, replacement ? `\n\n${replacement}` : '')
}

export function compactSeedancePromptForProvider(prompt: string, maxChars = MUAPI_VIDEO_PROMPT_SAFE_CHARS) {
  let next = prompt.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (next.length <= maxChars) return next

  const identityMatch = next.match(/\[IDENTITY AND SPEAKER GUIDE\][\s\S]*?(?=\n\n\[[A-Z][^\]]+\]|\s*$)/i)
  if (identityMatch) {
    next = replaceSeedanceSection(next, 'IDENTITY AND SPEAKER GUIDE', compactSeedanceIdentitySectionForProvider(identityMatch[0]))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (next.length <= maxChars) return next
  }

  next = replaceSeedanceSection(next, 'MOVEMENT LOGIC', '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (next.length <= maxChars) return next

  next = replaceSeedanceSection(
    next,
    'POSITIVE CONSTRAINTS',
    '[POSITIVE CONSTRAINTS]\nPreserve attached reference identity, shot location, props, lighting, readable acting, natural motion, clean camera movement, and no captions/UI/watermarks.',
  ).replace(/\n{3,}/g, '\n\n').trim()
  if (next.length <= maxChars) return next

  const hardLimit = Math.max(1000, maxChars)
  const sliced = next.slice(0, hardLimit)
  const boundary = Math.max(
    sliced.lastIndexOf('\n\n'),
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('\n'),
  )
  return `${sliced.slice(0, boundary > 1200 ? boundary : hardLimit).trim()}\n\nDo not render captions, subtitles, UI, logos, watermarks, or production-board markings.`
    .slice(0, maxChars)
    .trim()
}

export function buildMuapiVideoPayload(input: {
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  quality?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  return {
    prompt: compactSeedancePromptForProvider(input.prompt, MUAPI_VIDEO_PROMPT_MAX_CHARS),
    images_list: input.referenceImageUrls ?? [],
    video_files: input.referenceVideoUrls ?? [],
    audio_files: input.referenceAudioUrls ?? [],
    aspect_ratio: input.aspectRatio ?? '16:9',
    quality: resolveMuapiVideoQuality(input.quality),
    duration: input.durationSeconds,
  }
}

function extractStringUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return readText(record.video_url)
    || readText(record.videoUrl)
    || readText(record.url)
    || readText(record.file_url)
    || readText(record.fileUrl)
}

export function extractMuapiVideoUrlFromResult(value: unknown): string {
  const record = asRecord(value)
  const direct = extractStringUrl(record.video_url)
    || extractStringUrl(record.videoUrl)
    || extractStringUrl(record.url)
    || extractStringUrl(record.output)
    || extractStringUrl(record.result)
    || extractStringUrl(record.data)
  if (direct) return direct

  for (const key of ['output', 'result', 'data']) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      const url = extractMuapiVideoUrlFromResult(nested)
      if (url) return url
    }
  }

  for (const key of ['videos', 'video_urls', 'videoUrls', 'response', 'outputs']) {
    const array = Array.isArray(record[key]) ? record[key] : []
    for (const entry of array) {
      const url = extractStringUrl(entry) || extractMuapiVideoUrlFromResult(entry)
      if (url) return url
    }
  }
  return ''
}
