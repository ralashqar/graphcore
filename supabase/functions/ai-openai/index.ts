import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses, type OpenAiResponsesRequest } from '../_shared/openai.ts'

// Credit cost per 1K tokens by model
const MODEL_COSTS: Record<string, number> = {
  'gpt-4o': 1,      // $0.001 per 1K tokens
  'gpt-4o-mini': 0.05, // $0.00005 per 1K tokens
  'gpt-4-turbo': 1,
  'gpt-4': 1.5,
  'gpt-3.5-turbo': 0.05,
}

function calculateCreditCost(usage: { prompt_tokens?: number; completion_tokens?: number }, model: string): number {
  const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
  const costPer1K = MODEL_COSTS[model] || 0.1
  return Math.ceil((totalTokens / 1000) * costPer1K)
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

    const userClient = await requireUserClient(request, 'ai-openai')
    const user = userClient.user

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload = (await request.json()) as OpenAiResponsesRequest

    if (!payload.model?.trim()) {
      throw new HttpError(400, 'A model is required.')
    }

    if (payload.input === undefined || payload.input === null || payload.input === '') {
      throw new HttpError(400, 'An input payload is required.')
    }

    // Check user credit balance
    const { data: creditData, error: creditError } = await supabase.rpc('get_credit_balance', {
      user_id: user.id,
    })

    const currentBalance = creditData?.[0]?.balance ?? 0
    
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

    // Deduct credits based on actual usage
    if (upstreamJson.usage) {
      const creditCost = calculateCreditCost(upstreamJson.usage, payload.model)
      
      if (creditCost > 0) {
        await supabase.rpc('deduct_credits', {
          p_user_id: user.id,
          p_amount: creditCost,
          p_reason: `AI generation: ${payload.model}`,
          p_reference_type: 'ai_generation',
          p_reference_id: upstreamJson.id,
          p_metadata: JSON.stringify({
            model: payload.model,
            prompt_tokens: upstreamJson.usage.prompt_tokens,
            completion_tokens: upstreamJson.usage.completion_tokens,
            total_tokens: upstreamJson.usage.total_tokens,
          }),
        })
        
        console.log(`[ai-openai] Deducted ${creditCost} credits for user ${user.id}`)
      }
    }

    // Get updated balance
    const { data: updatedCreditData } = await supabase.rpc('get_credit_balance', {
      user_id: user.id,
    })

    return json({
      provider: 'openai',
      model: payload.model,
      responseId: typeof upstreamJson.id === 'string' ? upstreamJson.id : null,
      requestId: upstreamResponse.headers.get('x-request-id'),
      outputText,
      output: Array.isArray(upstreamJson.output) ? upstreamJson.output : [],
      usage: upstreamJson.usage ?? null,
      credits: {
        cost: calculateCreditCost(upstreamJson.usage || {}, payload.model),
        balance: updatedCreditData?.[0]?.balance ?? 0,
      },
      raw: upstreamJson,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to complete the OpenAI request.')
  }
})
