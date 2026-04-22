import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiImages, type OpenAiImagesRequest } from '../_shared/openai.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)

  if (preflight) {
    return preflight
  }

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    await requireUserClient(request, 'ai-openai-images')

    const payload = (await request.json()) as OpenAiImagesRequest
    const action = payload.action === 'edit' ? 'edit' : 'generate'
    const model = payload.model?.trim() || 'gpt-image-2'

    if (!payload.prompt?.trim()) {
      throw new HttpError(400, 'A prompt is required.')
    }

    if (action === 'edit' && (!payload.images || payload.images.length === 0)) {
      throw new HttpError(400, 'At least one source image is required for image edits.')
    }

    const { action: resolvedAction, response: upstreamResponse, body: upstreamJson } = await runOpenAiImages({
      ...payload,
      action,
      model,
    })

    if (!upstreamResponse.ok) {
      console.error('[ai-openai-images] upstream request failed', {
        action: resolvedAction,
        model,
        status: upstreamResponse.status,
        requestId: upstreamResponse.headers.get('x-request-id'),
        body: upstreamJson,
      })

      return json(
        {
          error: typeof upstreamJson.error === 'object' && upstreamJson.error !== null
            ? (upstreamJson.error as { message?: string }).message ?? 'OpenAI image request failed.'
            : 'OpenAI image request failed.',
          provider: 'openai',
          action: resolvedAction,
          model,
          requestId: upstreamResponse.headers.get('x-request-id'),
          raw: upstreamJson,
        },
        { status: upstreamResponse.status },
      )
    }

    const data = Array.isArray(upstreamJson.data) ? upstreamJson.data : []

    return json({
      provider: 'openai',
      action: resolvedAction,
      model,
      created: typeof upstreamJson.created === 'number' ? upstreamJson.created : null,
      requestId: upstreamResponse.headers.get('x-request-id'),
      images: data.map((item) => {
        const typed = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        return {
          b64Json: typeof typed.b64_json === 'string' ? typed.b64_json : null,
          revisedPrompt: typeof typed.revised_prompt === 'string' ? typed.revised_prompt : null,
          url: typeof typed.url === 'string' ? typed.url : null,
        }
      }),
      raw: upstreamJson,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to complete the OpenAI image request.')
  }
})
