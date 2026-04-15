import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type FalAction = 'submit' | 'status' | 'result' | 'cancel' | 'subscribe'

type FalInvokeRequest = {
  action?: FalAction
  model?: string
  input?: Record<string, unknown>
  requestId?: string
  logs?: boolean
  webhookUrl?: string
  headers?: Record<string, string>
  startTimeout?: number
  hint?: string
  priority?: 'normal' | 'low'
  timeoutMs?: number
  pollIntervalMs?: number
}

const defaultModel = 'fal-ai/nano-banana-2/edit'
const queueBaseUrl = 'https://queue.fal.run'

function buildFalHeaders(payload: FalInvokeRequest, apiKey: string) {
  const headers = new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })

  if (payload.startTimeout !== undefined) {
    headers.set('X-Fal-Request-Timeout', String(payload.startTimeout))
  }

  if (payload.hint) {
    headers.set('X-Fal-Runner-Hint', payload.hint)
  }

  if (payload.priority) {
    headers.set('X-Fal-Queue-Priority', payload.priority)
  }

  for (const [key, value] of Object.entries(payload.headers ?? {})) {
    headers.set(key, value)
  }

  return headers
}

async function fetchFalJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>

  return { response, body }
}

async function getStatus(model: string, requestId: string, logs: boolean, headers: HeadersInit) {
  const url = new URL(`${queueBaseUrl}/${model}/requests/${requestId}/status`)

  if (logs) {
    url.searchParams.set('logs', '1')
  }

  return fetchFalJson(url.toString(), {
    method: 'GET',
    headers,
  })
}

async function getResult(model: string, requestId: string, headers: HeadersInit) {
  return fetchFalJson(`${queueBaseUrl}/${model}/requests/${requestId}/response`, {
    method: 'GET',
    headers,
  })
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

    await requireUserClient(request, 'ai-fal')

    const apiKey = Deno.env.get('FAL_KEY')

    if (!apiKey) {
      throw new HttpError(500, 'FAL_KEY is not configured.')
    }

    const payload = (await request.json()) as FalInvokeRequest
    const action = payload.action ?? 'submit'
    const model = payload.model?.trim() || defaultModel
    const headers = buildFalHeaders(payload, apiKey)

    if (action === 'submit') {
      if (!payload.input) {
        throw new HttpError(400, 'An input payload is required for submit.')
      }

      const submitBody: Record<string, unknown> = { ...payload.input }

      if (payload.webhookUrl) {
        submitBody.webhook_url = payload.webhookUrl
      }

      const { response, body } = await fetchFalJson(`${queueBaseUrl}/${model}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(submitBody),
      })

      return json(
        {
          provider: 'fal',
          action,
          model,
          requestId: typeof body.request_id === 'string' ? body.request_id : null,
          data: body,
        },
        { status: response.status },
      )
    }

    if (action !== 'submit' && action !== 'subscribe' && !payload.requestId?.trim()) {
      throw new HttpError(400, 'A requestId is required for this Fal action.')
    }

    if (action === 'status') {
      const { response, body } = await getStatus(model, payload.requestId, payload.logs ?? false, headers)

      return json(
        {
          provider: 'fal',
          action,
          model,
          requestId: payload.requestId,
          data: body,
        },
        { status: response.status },
      )
    }

    if (action === 'result') {
      const { response, body } = await getResult(model, payload.requestId, headers)
      const normalizedData =
        body && typeof body.response === 'object' && body.response !== null
          ? body.response
          : body

      return json(
        {
          provider: 'fal',
          action,
          model,
          requestId: payload.requestId,
          data: normalizedData,
          status: typeof body.status === 'string' ? body.status : undefined,
          statusData: body,
        },
        { status: response.status },
      )
    }

    if (action === 'cancel') {
      const { response, body } = await fetchFalJson(`${queueBaseUrl}/${model}/requests/${payload.requestId}/cancel`, {
        method: 'POST',
        headers,
      })

      return json(
        {
          provider: 'fal',
          action,
          model,
          requestId: payload.requestId,
          data: body,
        },
        { status: response.status },
      )
    }

    if (!payload.input) {
      throw new HttpError(400, 'An input payload is required for subscribe.')
    }

    const submitBody: Record<string, unknown> = { ...payload.input }

    if (payload.webhookUrl) {
      submitBody.webhook_url = payload.webhookUrl
    }

    const submitResult = await fetchFalJson(`${queueBaseUrl}/${model}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(submitBody),
    })

    if (!submitResult.response.ok) {
      return json(
        {
          provider: 'fal',
          action,
          model,
          requestId: typeof submitResult.body.request_id === 'string' ? submitResult.body.request_id : null,
          data: submitResult.body,
        },
        { status: submitResult.response.status },
      )
    }

    const requestId = typeof submitResult.body.request_id === 'string' ? submitResult.body.request_id : null

    if (!requestId) {
      throw new HttpError(502, 'Fal did not return a request id.')
    }

    const timeoutMs = payload.timeoutMs ?? 120000
    const pollIntervalMs = payload.pollIntervalMs ?? 1500
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const statusResult = await getStatus(model, requestId, payload.logs ?? true, headers)
      const status = typeof statusResult.body.status === 'string' ? statusResult.body.status : null

      if (status === 'COMPLETED') {
        const responseResult = await getResult(model, requestId, headers)
        const normalizedData =
          responseResult.body && typeof responseResult.body.response === 'object' && responseResult.body.response !== null
            ? responseResult.body.response
            : responseResult.body

        return json({
          provider: 'fal',
          action,
          model,
          requestId,
          status,
          statusData: statusResult.body,
          data: normalizedData,
        })
      }

      if (typeof statusResult.body.error === 'string') {
        return json(
          {
            provider: 'fal',
            action,
            model,
            requestId,
            status,
            data: statusResult.body,
          },
          { status: statusResult.response.status || 500 },
        )
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    return json(
      {
        provider: 'fal',
        action,
        model,
        requestId,
        status: 'TIMEOUT',
        error: 'Fal request timed out before completion.',
      },
      { status: 504 },
    )
  } catch (error) {
    return errorResponse(error, 'Failed to complete the Fal request.')
  }
})
