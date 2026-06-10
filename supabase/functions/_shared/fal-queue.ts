// Shared helpers for interacting with the FAL queue API.
// Used by poll-cinematic-run (client-driven fallback polling) and
// fal-webhook (server-driven dependent-job advancement) so both paths
// submit and inspect provider requests identically.

export const falQueueBaseUrl = 'https://queue.fal.run'

export function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })
}

export async function fetchFalJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const rawText = await response.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return { response, body, rawText }
}

export async function submitFalRequest(input: {
  apiKey: string
  model: string
  payload: Record<string, unknown>
  webhookUrl?: string | null
}) {
  const body = input.webhookUrl
    ? {
        ...input.payload,
        webhook_url: input.webhookUrl,
      }
    : input.payload
  return fetchFalJson(`${falQueueBaseUrl}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

export async function getFalStatus(input: {
  apiKey: string
  model: string
  requestId: string
  logs?: boolean
  statusUrl?: string | null
}) {
  const url = input.statusUrl
    ? new URL(input.statusUrl)
    : new URL(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/status`)
  if (input.logs) {
    url.searchParams.set('logs', '1')
  }
  return fetchFalJson(url.toString(), {
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
  let { response, body, rawText } = await fetchFalJson(input.responseUrl || `${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/response`, {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
  if (!input.responseUrl && (response.status === 404 || response.status === 405)) {
    ({ response, body, rawText } = await fetchFalJson(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}`, {
      method: 'GET',
      headers: buildFalHeaders(input.apiKey),
    }))
  }
  const normalizedData =
    body && typeof body.response === 'object' && body.response !== null
      ? body.response as Record<string, unknown>
      : body

  return {
    response,
    body,
    rawText,
    normalizedData,
  }
}

export function getFalErrorMessage(body: Record<string, unknown>, fallback: string) {
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  return fallback
}

export function isNonTerminalFalProgressMessage(body: Record<string, unknown>, providerStatus: string | null) {
  const errorMessage = typeof body.error === 'string' ? body.error.trim().toLowerCase() : ''
  const detailMessage = typeof body.detail === 'string' ? body.detail.trim().toLowerCase() : ''
  const message = errorMessage || detailMessage
  const status = providerStatus?.trim().toUpperCase() ?? null
  const indicatesProgressMessage = message === 'request is still in progress'
    || message === 'still in progress'
    || message === 'request in progress'
  const indicatesProgressStatus = status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'QUEUED'
  return indicatesProgressMessage && indicatesProgressStatus
}
