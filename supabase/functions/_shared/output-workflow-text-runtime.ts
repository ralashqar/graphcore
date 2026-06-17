import {
  cancelOpenAiResponse,
  createOpenAiBackgroundResponse,
  retrieveOpenAiResponse,
  type OpenAiResponseResult,
  type OpenAiResponsesRequest,
} from './openai.ts'

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type OpenAiBackgroundProgress = {
  providerRequestId: string
  providerStatus: string
  providerMode: 'background'
  lastProviderPollAt: string
  providerStartedAt: string
  providerIncompleteReason?: string
  providerIncompleteDetails?: Record<string, unknown> | null
}

export function retryDelayMs(attempt: number) {
  return Math.min(10_000, 1_500 * attempt)
}

export function isRetryableOpenAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('rate limit')
    || lower.includes('temporarily unavailable')
    || lower.includes('overloaded')
    || lower.includes('status 408')
    || lower.includes('status 409')
    || lower.includes('status 429')
    || lower.includes('status 500')
    || lower.includes('status 502')
    || lower.includes('status 503')
    || lower.includes('status 504')
}

export function isTransientOpenAiResponseStatus(status: number) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

export function openAiResponseRetryDelayMs(result: OpenAiResponseResult | null, attempt: number) {
  const retryAfter = result?.response.headers.get('Retry-After') ?? ''
  const retryAfterSeconds = Number(retryAfter)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(30_000, Math.max(1_000, Math.floor(retryAfterSeconds * 1000)))
  }
  const retryAfterDate = Date.parse(retryAfter)
  if (Number.isFinite(retryAfterDate)) {
    return Math.min(30_000, Math.max(1_000, retryAfterDate - Date.now()))
  }
  return Math.min(30_000, retryDelayMs(attempt))
}

export function openAiIncompleteDetails(result: OpenAiResponseResult): Record<string, unknown> | null {
  const body = asRecord(result.body)
  const details = asRecord(body.incomplete_details)
  if (Object.keys(details).length > 0) return details
  const camelDetails = asRecord(body.incompleteDetails)
  if (Object.keys(camelDetails).length > 0) return camelDetails
  return null
}

export function openAiIncompleteReason(result: OpenAiResponseResult) {
  const details = openAiIncompleteDetails(result)
  if (!details) return ''
  return readText(details.reason) || readText(details.code) || readText(details.type)
}

export function openAiErrorMessage(result: OpenAiResponseResult, fallback: string) {
  const error = result.body.error
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = readText((error as Record<string, unknown>).message)
    if (message) return message
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  const incompleteReason = openAiIncompleteReason(result)
  if (incompleteReason) return `${fallback} Incomplete reason: ${incompleteReason}.`
  return fallback
}

export function isOpenAiTerminalStatus(status: string) {
  return ['completed', 'failed', 'cancelled', 'incomplete'].includes(status)
}

export async function waitForOpenAiBackgroundResponse(input: {
  request: OpenAiResponsesRequest
  priorProviderRequestId?: string | null
  providerStartedAt?: string | null
  timeoutMs: number
  pollIntervalMs?: number
  shouldCancel?: () => Promise<boolean>
  createCancelledError?: () => Error
  onProgress?: (progress: OpenAiBackgroundProgress) => Promise<void>
  createFailureMessage?: (status: number) => string
  pollFailureMessage?: (status: number) => string
  terminalFailureMessage?: (providerStatus: string) => string
  missingResponseIdMessage?: string
}) {
  let result = input.priorProviderRequestId
    ? await retrieveOpenAiResponse(input.priorProviderRequestId, 45_000)
    : await createOpenAiBackgroundResponse(input.request)

  if (!result.response.ok) {
    throw new Error(openAiErrorMessage(result, input.createFailureMessage?.(result.response.status)
      ?? `OpenAI background response failed with status ${result.response.status}.`))
  }
  if (!result.id) throw new Error(input.missingResponseIdMessage ?? 'OpenAI background response did not return a response id.')

  let providerRequestId = result.id
  let providerStatus = result.status
  const providerStartedAt = readText(input.providerStartedAt) || new Date().toISOString()
  const parsedStartedAt = Date.parse(providerStartedAt)
  const startedAt = Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now()
  const pollIntervalMs = Math.max(500, input.pollIntervalMs ?? 3_000)
  let transientPollAttempt = 0

  while (!isOpenAiTerminalStatus(providerStatus)) {
    await input.onProgress?.({
      providerRequestId,
      providerStatus,
      providerMode: 'background',
      lastProviderPollAt: new Date().toISOString(),
      providerStartedAt,
    })
    if (await input.shouldCancel?.()) {
      await cancelOpenAiResponse(providerRequestId, 30_000).catch(() => null)
      await input.onProgress?.({
        providerRequestId,
        providerStatus: 'cancelled',
        providerMode: 'background',
        lastProviderPollAt: new Date().toISOString(),
        providerStartedAt,
      })
      throw input.createCancelledError?.() ?? new Error('OpenAI background response was cancelled.')
    }
    if (Date.now() - startedAt > input.timeoutMs) {
      throw new Error(`OpenAI background response did not complete after ${input.timeoutMs}ms. Response id: ${providerRequestId}.`)
    }

    await sleep(pollIntervalMs)
    try {
      result = await retrieveOpenAiResponse(providerRequestId, 45_000)
    } catch (error) {
      transientPollAttempt += 1
      if (!isRetryableOpenAiError(error) || Date.now() - startedAt > input.timeoutMs) throw error
      await input.onProgress?.({
        providerRequestId,
        providerStatus: `${providerStatus}:poll_retry`,
        providerMode: 'background',
        lastProviderPollAt: new Date().toISOString(),
        providerStartedAt,
      })
      await sleep(openAiResponseRetryDelayMs(null, transientPollAttempt))
      continue
    }

    if (!result.response.ok) {
      if (isTransientOpenAiResponseStatus(result.response.status) && Date.now() - startedAt <= input.timeoutMs) {
        transientPollAttempt += 1
        await input.onProgress?.({
          providerRequestId,
          providerStatus: `${providerStatus}:poll_retry_${result.response.status}`,
          providerMode: 'background',
          lastProviderPollAt: new Date().toISOString(),
          providerStartedAt,
        })
        await sleep(openAiResponseRetryDelayMs(result, transientPollAttempt))
        continue
      }
      throw new Error(openAiErrorMessage(result, input.pollFailureMessage?.(result.response.status)
        ?? `OpenAI background response poll failed with status ${result.response.status}.`))
    }
    transientPollAttempt = 0
    providerRequestId = result.id ?? providerRequestId
    providerStatus = result.status
  }

  await input.onProgress?.({
    providerRequestId,
    providerStatus,
    providerMode: 'background',
    lastProviderPollAt: new Date().toISOString(),
    providerStartedAt,
    providerIncompleteReason: openAiIncompleteReason(result),
    providerIncompleteDetails: openAiIncompleteDetails(result),
  })

  if (providerStatus !== 'completed') {
    throw new Error(openAiErrorMessage(result, input.terminalFailureMessage?.(providerStatus)
      ?? `OpenAI background response ended with status ${providerStatus}.`))
  }

  return {
    response: result,
    providerRequestId,
    providerStatus,
    providerStartedAt,
  }
}
