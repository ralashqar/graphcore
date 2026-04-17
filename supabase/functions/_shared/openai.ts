export type OpenAiResponsesRequest = {
  model: string
  input: string | Array<Record<string, unknown>>
  instructions?: string
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

export function extractOutputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : []
  const textFragments: string[] = []

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : []

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue
      }

      const typedPart = part as { type?: unknown; text?: unknown }

      if (typeof typedPart.text === 'string' && typeof typedPart.type === 'string' && typedPart.type.includes('text')) {
        textFragments.push(typedPart.text)
      }
    }
  }

  return textFragments.join('\n').trim()
}

export async function runOpenAiResponses(payload: OpenAiResponsesRequest) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  const baseUrl = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const upstreamBody: Record<string, unknown> = {
    model: payload.model,
    input: payload.input,
    ...payload.extraBody,
  }

  if (payload.instructions) upstreamBody.instructions = payload.instructions
  if (payload.temperature !== undefined) upstreamBody.temperature = payload.temperature
  if (payload.maxOutputTokens !== undefined) upstreamBody.max_output_tokens = payload.maxOutputTokens
  if (payload.metadata) upstreamBody.metadata = payload.metadata
  if (payload.reasoning) upstreamBody.reasoning = payload.reasoning
  if (payload.text) upstreamBody.text = payload.text
  if (payload.tools) upstreamBody.tools = payload.tools
  if (payload.toolChoice !== undefined) upstreamBody.tool_choice = payload.toolChoice
  if (payload.previousResponseId) upstreamBody.previous_response_id = payload.previousResponseId
  if (payload.store !== undefined) upstreamBody.store = payload.store

  const timeoutMs = resolveOpenAiTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(`OpenAI responses request timed out after ${timeoutMs}ms.`), timeoutMs)

  let response: Response
  let body: Record<string, unknown>

  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    })
    body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('timed out after')) {
      throw new Error(message)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  return {
    response,
    body,
    outputText: extractOutputText(body),
  }
}
