import {
  buildOpenAiUsageLine,
  estimateFalMediaCost,
  estimateOpenAiTextCost,
  readAiTokenUsage,
  type AiUsageCost,
  type AiUsageLine,
} from '../../../src/domain/aiUsage.ts'
import {
  cancelOpenAiResponse,
  createOpenAiBackgroundResponse,
  retrieveOpenAiResponse,
  runOpenAiImages,
  runOpenAiResponses,
  runOpenAiResponsesStream,
  type OpenAiImagesRequest,
  type OpenAiResponsesRequest,
  type OpenAiResponsesStreamingEvent,
} from './openai.ts'

type DatabaseClient = {
  from: (table: string) => {
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => {
      select: (columns?: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>
      }
    }
  }
  rpc?: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
}

export type AiUsageContext = {
  userId?: string | null
  projectId?: string | null
  draftId?: string | null
  surface?: string
  outputWorkflowId?: string | null
  outputWorkflowRunId?: string | null
  outputWorkflowRunStepId?: string | null
  worldPromptTurnId?: string | null
  worldPromptGenerationJobId?: string | null
  worldPromptGenerationStepId?: string | null
  visualGenerationJobId?: string | null
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export type AiUsageRecordResult = {
  ok: boolean
  eventId: string | null
  error?: string
}

function envNumber(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  const parsed = raw ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function creditsForAiCost(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) {
    return 0
  }
  return Math.ceil(usd * envNumber('GRAPHCORE_CREDITS_PER_USD', 100))
}

function eventPayloadFromLine(input: {
  line: AiUsageLine
  context: AiUsageContext
  status?: string
  creditsCharged?: number
  idempotencyKey: string
}) {
  const cost = input.line.cost
  return {
    user_id: input.context.userId ?? null,
    project_id: input.context.projectId ?? null,
    draft_id: input.context.draftId ?? null,
    surface: input.context.surface ?? '',
    provider: input.line.provider,
    model: input.line.model,
    modality: input.line.modality,
    operation: input.line.operation,
    status: input.status ?? input.line.status,
    idempotency_key: input.idempotencyKey,
    provider_request_id: input.line.requestId ?? null,
    provider_response_id: input.line.responseId ?? null,
    output_workflow_id: input.context.outputWorkflowId ?? null,
    output_workflow_run_id: input.context.outputWorkflowRunId ?? null,
    output_workflow_run_step_id: input.context.outputWorkflowRunStepId ?? null,
    world_prompt_turn_id: input.context.worldPromptTurnId ?? null,
    world_prompt_generation_job_id: input.context.worldPromptGenerationJobId ?? null,
    world_prompt_generation_step_id: input.context.worldPromptGenerationStepId ?? null,
    visual_generation_job_id: input.context.visualGenerationJobId ?? null,
    usage: {
      tokens: input.line.tokens ?? null,
      media: input.line.media ?? null,
    },
    cost,
    price_snapshot: cost.priceSnapshot,
    estimated_cost_usd: cost.estimatedCostUsd,
    actual_cost_usd: cost.actualCostUsd,
    credits_charged: input.creditsCharged ?? input.line.cost.actualCredits,
    metadata: {
      ...(input.context.metadata ?? {}),
      ...(input.line.metadata ?? {}),
      nodeKey: input.line.nodeKey || null,
      nodeLabel: input.line.nodeLabel || null,
      nodeType: input.line.nodeType || null,
    },
  }
}

export async function recordAiUsageEvent(
  client: DatabaseClient | null | undefined,
  input: {
    line: AiUsageLine
    context?: AiUsageContext
    idempotencyKey?: string
    creditsCharged?: number
    status?: string
  },
): Promise<AiUsageRecordResult> {
  if (!client) {
    return { ok: false, eventId: null, error: 'missing-client' }
  }
  const context = input.context ?? {}
  const idempotencyKey = input.idempotencyKey
    ?? context.idempotencyKey
    ?? input.line.responseId
    ?? input.line.requestId
    ?? `${input.line.provider}:${input.line.model}:${crypto.randomUUID()}`

  try {
    const { data, error } = await client
      .from('ai_usage_events')
      .upsert(eventPayloadFromLine({
        line: input.line,
        context,
        idempotencyKey,
        creditsCharged: input.creditsCharged,
        status: input.status,
      }), { onConflict: 'provider,idempotency_key' })
      .select('id')
      .maybeSingle()

    if (error) {
      console.warn('[ai-provider-gateway] failed to record usage event', error)
      return { ok: false, eventId: null, error: error.message ?? 'record-failed' }
    }
    return { ok: true, eventId: typeof data?.id === 'string' ? data.id : null }
  } catch (error) {
    console.warn('[ai-provider-gateway] usage ledger unavailable', error)
    return { ok: false, eventId: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deductAiCredits(
  client: DatabaseClient,
  input: {
    userId: string
    credits: number
    model: string
    referenceId?: string | null
    metadata?: Record<string, unknown>
  },
) {
  if (input.credits <= 0 || !client.rpc) {
    return { deducted: 0 }
  }
  const { data, error } = await client.rpc('deduct_credits', {
    p_user_id: input.userId,
    p_amount: input.credits,
    p_reason: `AI generation: ${input.model}`,
    p_reference_type: 'ai_generation',
    p_reference_id: input.referenceId ?? null,
    p_metadata: input.metadata ?? {},
  })
  if (error) {
    throw new Error(error.message ?? 'Failed to deduct credits for the AI request.')
  }
  const row = Array.isArray(data) ? data[0] as { success?: boolean; error_message?: string } | undefined : null
  if (row?.success === false) {
    throw new Error(row.error_message ?? 'Insufficient credits.')
  }
  return { deducted: input.credits }
}

export async function runTrackedOpenAiResponses(input: {
  client?: DatabaseClient | null
  payload: OpenAiResponsesRequest
  context?: AiUsageContext
  chargeCredits?: boolean
}) {
  const result = await runOpenAiResponses(input.payload)
  const body = result.body as Record<string, unknown>
  const requestId = result.response.headers.get('x-request-id')
  const responseId = typeof body.id === 'string' ? body.id : null
  const usage = body.usage
  let usageLine: AiUsageLine | null = null
  let actualCost: AiUsageCost | null = null
  let creditsCharged = 0

  if (usage) {
    usageLine = buildOpenAiUsageLine({
      model: input.payload.model,
      usage,
      requestId,
      responseId,
      status: result.response.ok ? 'succeeded' : 'failed',
      metadata: { providerStatus: result.response.status },
    })
    actualCost = usageLine.cost
    if (result.response.ok && input.chargeCredits && input.context?.userId && input.client) {
      creditsCharged = creditsForAiCost(actualCost.actualCostUsd)
      await deductAiCredits(input.client, {
        userId: input.context.userId,
        credits: creditsCharged,
        model: input.payload.model,
        referenceId: responseId ?? requestId,
        metadata: {
          aiUsage: usageLine,
        },
      })
    }
    await recordAiUsageEvent(input.client, {
      line: usageLine,
      context: input.context,
      creditsCharged,
      idempotencyKey: input.context?.idempotencyKey ?? responseId ?? requestId ?? undefined,
    })
  }

  return {
    ...result,
    usageLine,
    actualCost,
    creditsCharged,
  }
}

export async function runTrackedOpenAiResponsesStream(input: {
  payload: OpenAiResponsesRequest
  onEvent: (event: OpenAiResponsesStreamingEvent) => void | Promise<void>
  client?: DatabaseClient | null
  context?: AiUsageContext
}) {
  const result = await runOpenAiResponsesStream(input.payload, { onEvent: input.onEvent })
  const body = result.body as Record<string, unknown>
  const usage = body.usage
  if (usage) {
    const line = buildOpenAiUsageLine({
      model: input.payload.model,
      usage,
      operation: 'responses_stream',
      requestId: result.response.headers.get('x-request-id'),
      responseId: typeof body.id === 'string' ? body.id : null,
      status: result.response.ok ? 'succeeded' : 'failed',
    })
    await recordAiUsageEvent(input.client, { line, context: input.context })
    return { ...result, usageLine: line }
  }
  return { ...result, usageLine: null }
}

export async function createTrackedOpenAiBackgroundResponse(input: {
  client?: DatabaseClient | null
  payload: OpenAiResponsesRequest
  context?: AiUsageContext
}) {
  const result = await createOpenAiBackgroundResponse(input.payload)
  const body = result.body as Record<string, unknown>
  const responseId = typeof body.id === 'string' ? body.id : null
  const estimate = estimateOpenAiTextCost({
    model: input.payload.model,
    inputTokens: 1,
    outputTokens: 1,
  })
  await recordAiUsageEvent(input.client, {
    line: {
      id: '',
      nodeKey: '',
      nodeLabel: '',
      nodeType: '',
      provider: 'openai',
      model: input.payload.model,
      modality: 'text',
      operation: 'responses_background',
      status: 'estimated',
      requestId: result.response.headers.get('x-request-id'),
      responseId,
      cost: estimate,
      skipped: false,
      cached: false,
      metadata: {},
    },
    context: input.context,
    idempotencyKey: input.context?.idempotencyKey ?? responseId ?? undefined,
    creditsCharged: 0,
  })
  return result
}

export async function retrieveTrackedOpenAiResponse(responseId: string) {
  return retrieveOpenAiResponse(responseId)
}

export async function cancelTrackedOpenAiResponse(responseId: string) {
  return cancelOpenAiResponse(responseId)
}

export async function runTrackedOpenAiImages(input: {
  client?: DatabaseClient | null
  payload: OpenAiImagesRequest
  context?: AiUsageContext
}) {
  const result = await runOpenAiImages(input.payload)
  const body = result.body as Record<string, unknown>
  const model = input.payload.model
  const estimatedCostUsd = estimateFalMediaCost({ model: 'openai/gpt-image-2', units: 1 }).estimatedCostUsd
  const cost: AiUsageCost = {
    estimatedCostUsd,
    actualCostUsd: result.response.ok ? estimatedCostUsd : 0,
    estimatedCredits: creditsForAiCost(estimatedCostUsd),
    actualCredits: result.response.ok ? creditsForAiCost(estimatedCostUsd) : 0,
    currency: 'USD',
    pricingSource: 'openai_image_generation_snapshot',
    priceSnapshot: {
      provider: 'openai',
      model,
      unitUsd: estimatedCostUsd,
      size: input.payload.size ?? null,
      quality: input.payload.quality ?? null,
    },
  }
  const line: AiUsageLine = {
    id: '',
    nodeKey: '',
    nodeLabel: '',
    nodeType: '',
    provider: 'openai',
    model,
    modality: 'image',
    operation: 'image_generation',
    status: result.response.ok ? 'succeeded' : 'failed',
    requestId: result.response.headers.get('x-request-id'),
    responseId: typeof body.id === 'string' ? body.id : null,
    media: { units: 1, size: typeof input.payload.size === 'string' ? input.payload.size : undefined },
    cost,
    skipped: false,
    cached: false,
    metadata: {},
  }
  await recordAiUsageEvent(input.client, { line, context: input.context })
  return { ...result, usageLine: line }
}

export function readOpenAiActualCost(model: string, usage: unknown): AiUsageCost {
  const tokens = readAiTokenUsage(usage)
  return estimateOpenAiTextCost({
    model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cachedInputTokens: tokens.cachedInputTokens,
  })
}
