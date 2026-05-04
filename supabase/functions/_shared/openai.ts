export type OpenAiResponsesRequest = {
  model: string
  input: string | Array<Record<string, unknown>>
  instructions?: string
  background?: boolean
  temperature?: number
  maxOutputTokens?: number
  metadata?: Record<string, string>
  reasoning?: Record<string, unknown>
  text?: Record<string, unknown>
  tools?: Array<Record<string, unknown>>
  toolChoice?: string | Record<string, unknown>
  previousResponseId?: string
  store?: boolean
  extraBody?: Record<string, unknown>
  timeoutMs?: number
}

export type OpenAiResponseStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'incomplete' | string

export type OpenAiResponseResult = {
  response: Response
  body: Record<string, unknown>
  id: string | null
  status: OpenAiResponseStatus
  outputText: string
}

export type OpenAiResponsesStreamingEvent = {
  type: string
  sequenceNumber: number | null
  rawEvent: string | null
  data: Record<string, unknown>
}

export type OpenAiResponsesStreamHooks = {
  onEvent?: (event: OpenAiResponsesStreamingEvent) => Promise<void> | void
  onTextDelta?: (delta: string, event: OpenAiResponsesStreamingEvent) => Promise<void> | void
}

export type OpenAiImageBinaryInput = {
  data: string
  filename?: string
  mimeType: string
}

export type OpenAiImagesRequest = {
  action?: 'generate' | 'edit'
  model?: string
  prompt: string
  size?: string
  quality?: 'low' | 'medium' | 'high' | 'auto'
  background?: 'transparent' | 'opaque' | 'auto'
  moderation?: 'low' | 'auto'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
  n?: number
  images?: OpenAiImageBinaryInput[]
  mask?: OpenAiImageBinaryInput | null
  user?: string
  extraBody?: Record<string, unknown>
  timeoutMs?: number
}

const DEFAULT_OPENAI_TIMEOUT_MS = 45_000

function resolveOpenAiTimeoutMs(override: number | undefined) {
  if (Number.isFinite(override) && typeof override === 'number' && override > 0) {
    return Math.max(1_000, Math.floor(override))
  }

  const rawEnv = Deno.env.get('OPENAI_REQUEST_TIMEOUT_MS')
  if (!rawEnv) return DEFAULT_OPENAI_TIMEOUT_MS
  const parsed = Number(rawEnv)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_OPENAI_TIMEOUT_MS
  return Math.max(1_000, Math.floor(parsed))
}

function openAiApiKey() {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  return apiKey
}

function openAiBaseUrl() {
  return (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
}

export function extractOutputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : []
  const textFragments: string[] = []

  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const typedPart = part as { type?: unknown; text?: unknown }
      if (typeof typedPart.text === 'string' && typeof typedPart.type === 'string' && typedPart.type.includes('text')) {
        textFragments.push(typedPart.text)
      }
    }
  }

  return textFragments.join('\n').trim()
}

function buildOpenAiResponsesBody(payload: OpenAiResponsesRequest, overrides: Record<string, unknown> = {}) {
  const upstreamBody: Record<string, unknown> = {
    model: payload.model,
    input: payload.input,
    ...payload.extraBody,
    ...overrides,
  }

  if (payload.instructions) upstreamBody.instructions = payload.instructions
  if (payload.background !== undefined) upstreamBody.background = payload.background
  if (payload.temperature !== undefined) upstreamBody.temperature = payload.temperature
  if (payload.maxOutputTokens !== undefined) upstreamBody.max_output_tokens = payload.maxOutputTokens
  if (payload.metadata) upstreamBody.metadata = payload.metadata
  if (payload.reasoning) upstreamBody.reasoning = payload.reasoning
  if (payload.text) upstreamBody.text = payload.text
  if (payload.tools) upstreamBody.tools = payload.tools
  if (payload.toolChoice !== undefined) upstreamBody.tool_choice = payload.toolChoice
  if (payload.previousResponseId) upstreamBody.previous_response_id = payload.previousResponseId
  if (payload.store !== undefined) upstreamBody.store = payload.store
  return upstreamBody
}

function parseOpenAiResponseResult(response: Response, body: Record<string, unknown>): OpenAiResponseResult {
  return {
    response,
    body,
    id: typeof body.id === 'string' ? body.id : null,
    status: typeof body.status === 'string' ? body.status : response.ok ? 'completed' : 'failed',
    outputText: extractOutputText(body),
  }
}

export function parseOpenAiResponseStatus(body: Record<string, unknown>) {
  return {
    id: typeof body.id === 'string' ? body.id : null,
    status: typeof body.status === 'string' ? body.status : 'unknown',
    outputText: extractOutputText(body),
  }
}

export async function runOpenAiResponses(payload: OpenAiResponsesRequest) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const timeoutMs = resolveOpenAiTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI responses request timed out after ${timeoutMs}ms.`), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiResponsesBody(payload)),
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return parseOpenAiResponseResult(response, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('timed out after')) throw new Error(message)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function createOpenAiBackgroundResponse(payload: OpenAiResponsesRequest) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const timeoutMs = resolveOpenAiTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI background response create timed out after ${timeoutMs}ms.`), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiResponsesBody(payload, { background: true, store: true })),
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return parseOpenAiResponseResult(response, body)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function retrieveOpenAiResponse(responseId: string, timeoutMs?: number) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const resolvedTimeoutMs = resolveOpenAiTimeoutMs(timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI response retrieve timed out after ${resolvedTimeoutMs}ms.`), resolvedTimeoutMs)

  try {
    const response = await fetch(`${baseUrl}/responses/${encodeURIComponent(responseId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return parseOpenAiResponseResult(response, body)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function cancelOpenAiResponse(responseId: string, timeoutMs?: number) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const resolvedTimeoutMs = resolveOpenAiTimeoutMs(timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI response cancel timed out after ${resolvedTimeoutMs}ms.`), resolvedTimeoutMs)

  try {
    const response = await fetch(`${baseUrl}/responses/${encodeURIComponent(responseId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return parseOpenAiResponseResult(response, body)
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeStreamingEvent(rawEvent: string | null, data: Record<string, unknown>): OpenAiResponsesStreamingEvent {
  return {
    type: typeof data.type === 'string' ? data.type : (rawEvent ?? 'unknown'),
    sequenceNumber: typeof data.sequence_number === 'number' ? data.sequence_number : null,
    rawEvent,
    data,
  }
}

async function processOpenAiSseChunk(
  chunk: string,
  hooks: OpenAiResponsesStreamHooks,
  state: {
    outputText: string
    finalBody: Record<string, unknown> | null
    streamErrorMessage: string | null
  },
) {
  const lines = chunk.split(/\r?\n/)
  let eventName: string | null = null
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }

  const rawData = dataLines.join('\n').trim()
  if (!rawData || rawData === '[DONE]') return

  let parsedData: Record<string, unknown>
  try {
    parsedData = JSON.parse(rawData) as Record<string, unknown>
  } catch {
    return
  }

  const event = normalizeStreamingEvent(eventName, parsedData)
  await hooks.onEvent?.(event)

  if (event.type === 'response.output_text.delta' && typeof parsedData.delta === 'string') {
    state.outputText += parsedData.delta
    await hooks.onTextDelta?.(parsedData.delta, event)
  }

  if (
    (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'response.incomplete')
    && parsedData.response
    && typeof parsedData.response === 'object'
    && !Array.isArray(parsedData.response)
  ) {
    state.finalBody = parsedData.response as Record<string, unknown>
  }

  if (event.type === 'error') {
    const message =
      typeof parsedData.message === 'string'
        ? parsedData.message
        : typeof (parsedData.error as { message?: unknown } | undefined)?.message === 'string'
          ? ((parsedData.error as { message: string }).message)
          : 'OpenAI streaming request failed.'
    state.streamErrorMessage = message
  }
}

export async function runOpenAiResponsesStream(
  payload: OpenAiResponsesRequest,
  hooks: OpenAiResponsesStreamHooks = {},
) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const timeoutMs = resolveOpenAiTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI responses request timed out after ${timeoutMs}ms.`), timeoutMs)
  const state = {
    outputText: '',
    finalBody: null as Record<string, unknown> | null,
    streamErrorMessage: null as string | null,
  }

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiResponsesBody(payload, {
        stream: true,
        stream_options: { include_obfuscation: false },
      })),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      return parseOpenAiResponseResult(response, body)
    }
    if (!response.body) throw new Error('OpenAI streaming response did not include a response body.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() ?? ''
      for (const chunk of chunks) await processOpenAiSseChunk(chunk, hooks, state)
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const chunk of buffer.split(/\r?\n\r?\n/)) {
        if (chunk.trim()) await processOpenAiSseChunk(chunk, hooks, state)
      }
    }
    if (state.streamErrorMessage) throw new Error(state.streamErrorMessage)
    if (!state.finalBody) throw new Error('OpenAI streaming response ended before a terminal response event was received.')

    return parseOpenAiResponseResult(response, {
      ...state.finalBody,
      output: state.finalBody.output ?? [{ content: [{ type: 'output_text', text: state.outputText.trim() }] }],
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function decodeBase64ToUint8Array(base64: string) {
  const normalized = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(normalized)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toOpenAiFile(input: OpenAiImageBinaryInput, fallbackName: string) {
  return new File([decodeBase64ToUint8Array(input.data)], input.filename ?? fallbackName, { type: input.mimeType })
}

export async function runOpenAiImages(payload: OpenAiImagesRequest) {
  const apiKey = openAiApiKey()
  const baseUrl = openAiBaseUrl()
  const action = payload.action === 'edit' ? 'edit' : 'generate'
  const model = payload.model?.trim() || 'gpt-image-2'
  const timeoutMs = resolveOpenAiTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI images request timed out after ${timeoutMs}ms.`), timeoutMs)

  try {
    let response: Response
    if (action === 'edit') {
      const formData = new FormData()
      formData.set('model', model)
      formData.set('prompt', payload.prompt)
      for (const [index, image] of (payload.images ?? []).entries()) {
        formData.append('image[]', toOpenAiFile(image, `image-${index}.png`))
      }
      if (payload.mask) formData.set('mask', toOpenAiFile(payload.mask, 'mask.png'))
      if (payload.size) formData.set('size', payload.size)
      if (payload.quality) formData.set('quality', payload.quality)
      if (payload.background) formData.set('background', payload.background)
      if (payload.moderation) formData.set('moderation', payload.moderation)
      if (payload.outputFormat) formData.set('output_format', payload.outputFormat)
      if (payload.outputCompression !== undefined) formData.set('output_compression', String(payload.outputCompression))
      if (payload.n !== undefined) formData.set('n', String(payload.n))
      if (payload.user) formData.set('user', payload.user)
      for (const [key, value] of Object.entries(payload.extraBody ?? {})) {
        if (value !== undefined && value !== null) formData.set(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
      response = await fetch(`${baseUrl}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      })
    } else {
      const upstreamBody: Record<string, unknown> = {
        model,
        prompt: payload.prompt,
        ...payload.extraBody,
      }
      if (payload.size) upstreamBody.size = payload.size
      if (payload.quality) upstreamBody.quality = payload.quality
      if (payload.background) upstreamBody.background = payload.background
      if (payload.moderation) upstreamBody.moderation = payload.moderation
      if (payload.outputFormat) upstreamBody.output_format = payload.outputFormat
      if (payload.outputCompression !== undefined) upstreamBody.output_compression = payload.outputCompression
      if (payload.n !== undefined) upstreamBody.n = payload.n
      if (payload.user) upstreamBody.user = payload.user
      if (payload.images && payload.images.length > 0) {
        upstreamBody.image = payload.images.map((image) => `data:${image.mimeType};base64,${image.data}`)
      }
      response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { action, model, response, body }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('timed out after')) throw new Error(message)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
