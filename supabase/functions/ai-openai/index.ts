import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses, type OpenAiResponsesRequest } from '../_shared/openai.ts'

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

    const payload = (await request.json()) as OpenAiResponsesRequest

    if (!payload.model?.trim()) {
      throw new HttpError(400, 'A model is required.')
    }

    if (payload.input === undefined || payload.input === null || payload.input === '') {
      throw new HttpError(400, 'An input payload is required.')
    }

    const { response: upstreamResponse, body: upstreamJson, outputText } = await runOpenAiResponses(payload)

    if (!upstreamResponse.ok) {
      console.error('[ai-openai] upstream request failed', {
        model: payload.model,
        status: upstreamResponse.status,
        requestId: upstreamResponse.headers.get('x-request-id'),
        body: upstreamJson,
      })

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
      outputText,
      output: Array.isArray(upstreamJson.output) ? upstreamJson.output : [],
      usage: upstreamJson.usage ?? null,
      raw: upstreamJson,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to complete the OpenAI request.')
  }
})
