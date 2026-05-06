import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { runTrackedOpenAiResponses } from '../_shared/ai-provider-gateway.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import type { OpenAiResponsesRequest } from '../_shared/openai.ts'

type CreditBalanceRow = {
  balance: number | null
  lifetime_earned?: number | null
  updated_at?: string | null
}

type OpenAiUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

type OpenAiErrorPayload = {
  message?: string
}

type OpenAiResponsesBody = Record<string, unknown> & {
  id?: string
  output?: unknown[]
  usage?: OpenAiUsage | null
  error?: OpenAiErrorPayload | string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOpenAiResponsesRequest(value: unknown): OpenAiResponsesRequest {
  if (!isRecord(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }

  const model = typeof value.model === 'string' ? value.model.trim() : ''
  const input = value.input

  if (!model) {
    throw new HttpError(400, 'A model is required.')
  }

  if (
    input === undefined ||
    input === null ||
    (typeof input === 'string' && input.trim() === '') ||
    (Array.isArray(input) && input.length === 0)
  ) {
    throw new HttpError(400, 'An input payload is required.')
  }

  return value as OpenAiResponsesRequest
}

Deno.serve(async (request: Request) => {
  const preflight = maybeHandleOptions(request)

  if (preflight) {
    return preflight
  }

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { user } = await requireUserClient(request, 'ai-openai')
    const supabase = createAdminClient('ai-openai')
    const payload = parseOpenAiResponsesRequest(await request.json())

    const { data: creditData, error: creditError } = await supabase.rpc('get_credit_balance', {
      user_id: user.id,
    })

    if (creditError) {
      throw new HttpError(500, 'Failed to load credit balance.')
    }

    const currentBalance = ((creditData as CreditBalanceRow[] | null)?.[0]?.balance) ?? 0

    if (currentBalance < 10) {
      return json(
        {
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          currentBalance,
          required: 10,
          buyCreditsUrl: '/billing',
        },
        { status: 402 },
      )
    }

    const {
      response: upstreamResponse,
      body,
      outputText,
      usageLine,
      creditsCharged,
    } = await runTrackedOpenAiResponses({
      client: supabase,
      payload,
      chargeCredits: true,
      context: {
        userId: user.id,
        surface: 'ai-openai',
        idempotencyKey: request.headers.get('Idempotency-Key') ?? undefined,
      },
    })
    const upstreamJson = body as OpenAiResponsesBody

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
            ? upstreamJson.error.message ?? 'OpenAI request failed.'
            : typeof upstreamJson.error === 'string'
              ? upstreamJson.error
              : 'OpenAI request failed.',
          provider: 'openai',
          model: payload.model,
          requestId: upstreamResponse.headers.get('x-request-id'),
          raw: upstreamJson,
        },
        { status: upstreamResponse.status },
      )
    }

    const { data: updatedCreditData, error: updatedCreditError } = await supabase.rpc('get_credit_balance', {
      user_id: user.id,
    })

    if (updatedCreditError) {
      throw new HttpError(500, 'Failed to refresh credit balance.')
    }

    return json({
      provider: 'openai',
      model: payload.model,
      responseId: typeof upstreamJson.id === 'string' ? upstreamJson.id : null,
      requestId: upstreamResponse.headers.get('x-request-id'),
      outputText,
      output: Array.isArray(upstreamJson.output) ? upstreamJson.output : [],
      usage: upstreamJson.usage ?? null,
      credits: {
        cost: creditsCharged,
        balance: ((updatedCreditData as CreditBalanceRow[] | null)?.[0]?.balance) ?? 0,
      },
      aiUsage: usageLine ?? null,
      raw: upstreamJson,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to complete the OpenAI request.')
  }
})
