import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type OpenAiResponsesRequest = {
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
}

function extractOutputText(payload: Record<string, unknown>) {
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)

  if (preflight) {
    return preflight
  }

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    await requireUserClient(request, 'ai-openai')

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const baseUrl = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'

    if (!apiKey) {
      throw new HttpError(500, 'OPENAI_API_KEY is not configured.')
    }

    const payload = (await request.json()) as OpenAiResponsesRequest

    if (!payload.model?.trim()) {
      throw new HttpError(400, 'A model is required.')
    }

    if (payload.input === undefined || payload.input === null || payload.input === '') {
      throw new HttpError(400, 'An input payload is required.')
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

    const upstreamResponse = await fetch(`${baseUrl.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    })

    const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as Record<string, unknown>

    if (!upstreamResponse.ok) {
      return json(
        {
          error: typeof upstreamJson.error === 'object' && upstreamJson.error !== null
            ? (upstreamJson.error as { message?: string }).message ?? 'OpenAI request failed.'
            : 'OpenAI request failed.',
          provider: 'openai',
          model: payload.model,
          requestId: upstreamResponse.headers.get('x-request-id'),
          raw: upstreamJson,
        },
        { status: upstreamResponse.status },
      )
    }

    return json({
      provider: 'openai',
      model: payload.model,
      responseId: typeof upstreamJson.id === 'string' ? upstreamJson.id : null,
      requestId: upstreamResponse.headers.get('x-request-id'),
      outputText: extractOutputText(upstreamJson),
      output: Array.isArray(upstreamJson.output) ? upstreamJson.output : [],
      usage: upstreamJson.usage ?? null,
      raw: upstreamJson,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to complete the OpenAI request.')
  }
})
