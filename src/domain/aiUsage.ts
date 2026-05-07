import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const aiProviderSchema = z.enum(['openai', 'fal', 'muapi', 'graphcore', 'unknown'])
export const aiUsageModalitySchema = z.enum(['text', 'image', 'video', 'audio', 'embedding', 'mixed'])
export const aiUsageOperationSchema = z.enum([
  'responses',
  'responses_stream',
  'responses_background',
  'image_generation',
  'image_edit',
  'video_generation',
  'provider_queue',
  'estimate',
])
export const aiUsageStatusSchema = z.enum(['estimated', 'succeeded', 'failed', 'cancelled', 'cached', 'skipped'])

export const aiTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
})

export const aiMediaUsageSchema = z.object({
  units: z.number().nonnegative().default(0),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  frames: z.number().int().nonnegative().optional(),
  quality: z.string().optional(),
  size: z.string().optional(),
})

export const aiUsageCostSchema = z.object({
  estimatedCostUsd: z.number().nonnegative().default(0),
  actualCostUsd: z.number().nonnegative().default(0),
  estimatedCredits: z.number().int().nonnegative().default(0),
  actualCredits: z.number().int().nonnegative().default(0),
  currency: z.literal('USD').default('USD'),
  pricingSource: z.string().default('local_snapshot'),
  priceSnapshot: looseRecordSchema.default({}),
})

export const aiUsageLineSchema = z.object({
  id: z.string().default(''),
  nodeKey: z.string().default(''),
  nodeLabel: z.string().default(''),
  nodeType: z.string().default(''),
  provider: aiProviderSchema.default('unknown'),
  model: z.string().default(''),
  modality: aiUsageModalitySchema.default('text'),
  operation: aiUsageOperationSchema.default('estimate'),
  status: aiUsageStatusSchema.default('estimated'),
  requestId: z.string().nullable().default(null),
  responseId: z.string().nullable().default(null),
  tokens: aiTokenUsageSchema.optional(),
  media: aiMediaUsageSchema.optional(),
  cost: aiUsageCostSchema.default({
    estimatedCostUsd: 0,
    actualCostUsd: 0,
    estimatedCredits: 0,
    actualCredits: 0,
    currency: 'USD',
    pricingSource: 'local_snapshot',
    priceSnapshot: {},
  }),
  skipped: z.boolean().default(false),
  cached: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
})

export const aiUsageSummarySchema = z.object({
  status: aiUsageStatusSchema.default('estimated'),
  estimatedCostUsd: z.number().nonnegative().default(0),
  actualCostUsd: z.number().nonnegative().default(0),
  estimatedCredits: z.number().int().nonnegative().default(0),
  actualCredits: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
  mediaUnits: z.number().nonnegative().default(0),
  lines: z.array(aiUsageLineSchema).default([]),
})

export type AiProvider = z.infer<typeof aiProviderSchema>
export type AiUsageModality = z.infer<typeof aiUsageModalitySchema>
export type AiUsageOperation = z.infer<typeof aiUsageOperationSchema>
export type AiTokenUsage = z.infer<typeof aiTokenUsageSchema>
export type AiMediaUsage = z.infer<typeof aiMediaUsageSchema>
export type AiUsageCost = z.infer<typeof aiUsageCostSchema>
export type AiUsageLine = z.infer<typeof aiUsageLineSchema>
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>

type TextPrice = {
  inputPer1M: number
  outputPer1M: number
  cachedInputPer1M?: number
  source: string
}

type ImagePrice = {
  unitUsd: number
  source: string
}

const DEFAULT_CREDITS_PER_USD = 100
const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-5.4'

export const OPENAI_TEXT_PRICE_SNAPSHOT: Record<string, TextPrice> = {
  'gpt-5.4': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, source: 'openai_pricing_snapshot_gpt5_family_fallback' },
  'gpt-5.1': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, source: 'openai_pricing_snapshot' },
  'gpt-5.1-mini': { inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025, source: 'openai_pricing_snapshot' },
  'gpt-5.1-nano': { inputPer1M: 0.05, outputPer1M: 0.4, cachedInputPer1M: 0.005, source: 'openai_pricing_snapshot' },
  'gpt-5': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, source: 'openai_pricing_snapshot' },
  'gpt-5-mini': { inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025, source: 'openai_pricing_snapshot' },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8, cachedInputPer1M: 0.5, source: 'openai_pricing_snapshot' },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1, source: 'openai_pricing_snapshot' },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25, source: 'openai_pricing_snapshot' },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075, source: 'openai_pricing_snapshot' },
}

export const FAL_MEDIA_PRICE_SNAPSHOT: Record<string, ImagePrice> = {
  'openai/gpt-image-2': { unitUsd: 0.08, source: 'fal_pricing_snapshot' },
  'fal-ai/nano-banana-2': { unitUsd: 0.08, source: 'fal_pricing_snapshot' },
  'fal-ai/nano-banana-2/edit': { unitUsd: 0.08, source: 'fal_pricing_snapshot' },
  'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video': { unitUsd: 0.12, source: 'fal_seedance_formula_fallback' },
  'bytedance/seedance-2.0/fast/reference-to-video': { unitUsd: 0.2419, source: 'fal_seedance_2_reference_pricing_snapshot' },
  'bytedance/seedance-2.0/reference-to-video': { unitUsd: 0.3024, source: 'fal_seedance_2_reference_pricing_snapshot' },
}

export const MUAPI_MEDIA_PRICE_SNAPSHOT: Record<string, ImagePrice> = {
  'seedance-2-vip-omni-reference': { unitUsd: 0, source: 'muapi_pricing_not_configured' },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function creditsForUsd(usd: number, creditsPerUsd = DEFAULT_CREDITS_PER_USD): number {
  if (!Number.isFinite(usd) || usd <= 0) {
    return 0
  }
  return Math.ceil(usd * creditsPerUsd)
}

export function estimateTextTokensFromChars(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function readAiTokenUsage(value: unknown): AiTokenUsage {
  const usage = readRecord(value)
  const inputDetails = readRecord(usage.input_tokens_details ?? usage.prompt_tokens_details)
  const outputDetails = readRecord(usage.output_tokens_details ?? usage.completion_tokens_details)
  const inputTokens = readNumber(usage.input_tokens ?? usage.prompt_tokens)
  const outputTokens = readNumber(usage.output_tokens ?? usage.completion_tokens)
  const totalTokens = readNumber(usage.total_tokens) || inputTokens + outputTokens
  const cachedInputTokens = readNumber(inputDetails.cached_tokens ?? usage.cached_input_tokens)
  const reasoningTokens = readNumber(outputDetails.reasoning_tokens ?? usage.reasoning_tokens)
  return aiTokenUsageSchema.parse({
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
  })
}

export function estimateOpenAiTextCost(input: {
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  creditsPerUsd?: number
}): AiUsageCost {
  const price = OPENAI_TEXT_PRICE_SNAPSHOT[input.model] ?? OPENAI_TEXT_PRICE_SNAPSHOT[DEFAULT_OPENAI_TEXT_MODEL]
  const cachedInputTokens = Math.min(Math.max(0, input.cachedInputTokens ?? 0), Math.max(0, input.inputTokens))
  const uncachedInputTokens = Math.max(0, input.inputTokens - cachedInputTokens)
  const inputCost = (uncachedInputTokens / 1_000_000) * price.inputPer1M
  const cachedInputCost = (cachedInputTokens / 1_000_000) * (price.cachedInputPer1M ?? price.inputPer1M)
  const outputCost = (Math.max(0, input.outputTokens) / 1_000_000) * price.outputPer1M
  const actualCostUsd = inputCost + cachedInputCost + outputCost
  return aiUsageCostSchema.parse({
    estimatedCostUsd: actualCostUsd,
    actualCostUsd,
    estimatedCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    actualCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    pricingSource: price.source,
    priceSnapshot: {
      provider: 'openai',
      model: input.model,
      inputPer1M: price.inputPer1M,
      cachedInputPer1M: price.cachedInputPer1M ?? null,
      outputPer1M: price.outputPer1M,
    },
  })
}

export function estimateFalMediaCost(input: {
  model: string
  units?: number
  width?: number
  height?: number
  durationSeconds?: number
  creditsPerUsd?: number
}): AiUsageCost {
  const price = FAL_MEDIA_PRICE_SNAPSHOT[input.model] ?? { unitUsd: 0.08, source: 'fal_pricing_fallback' }
  const units = Math.max(1, input.units ?? 1)
  const actualCostUsd = units * price.unitUsd
  return aiUsageCostSchema.parse({
    estimatedCostUsd: actualCostUsd,
    actualCostUsd,
    estimatedCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    actualCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    pricingSource: price.source,
    priceSnapshot: {
      provider: 'fal',
      model: input.model,
      unitUsd: price.unitUsd,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  })
}

export function estimateMuapiMediaCost(input: {
  model: string
  units?: number
  width?: number
  height?: number
  durationSeconds?: number
  creditsPerUsd?: number
}): AiUsageCost {
  const price = MUAPI_MEDIA_PRICE_SNAPSHOT[input.model] ?? { unitUsd: 0, source: 'muapi_pricing_not_configured' }
  const units = Math.max(1, input.units ?? 1)
  const actualCostUsd = units * price.unitUsd
  return aiUsageCostSchema.parse({
    estimatedCostUsd: actualCostUsd,
    actualCostUsd,
    estimatedCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    actualCredits: creditsForUsd(actualCostUsd, input.creditsPerUsd),
    pricingSource: price.source,
    priceSnapshot: {
      provider: 'muapi',
      model: input.model,
      unitUsd: price.unitUsd,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  })
}

export function buildOpenAiUsageLine(input: {
  model: string
  usage: unknown
  operation?: AiUsageOperation
  nodeKey?: string
  nodeLabel?: string
  nodeType?: string
  requestId?: string | null
  responseId?: string | null
  status?: AiUsageLine['status']
  creditsPerUsd?: number
  metadata?: Record<string, unknown>
}): AiUsageLine {
  const tokens = readAiTokenUsage(input.usage)
  const cost = estimateOpenAiTextCost({
    model: input.model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cachedInputTokens: tokens.cachedInputTokens,
    creditsPerUsd: input.creditsPerUsd,
  })
  return aiUsageLineSchema.parse({
    nodeKey: input.nodeKey ?? '',
    nodeLabel: input.nodeLabel ?? '',
    nodeType: input.nodeType ?? '',
    provider: 'openai',
    model: input.model,
    modality: 'text',
    operation: input.operation ?? 'responses',
    status: input.status ?? 'succeeded',
    requestId: input.requestId ?? null,
    responseId: input.responseId ?? null,
    tokens,
    cost,
    metadata: input.metadata ?? {},
  })
}

export function buildFalMediaUsageLine(input: {
  model: string
  modality: 'image' | 'video'
  operation: 'image_generation' | 'image_edit' | 'video_generation' | 'provider_queue'
  nodeKey?: string
  nodeLabel?: string
  nodeType?: string
  requestId?: string | null
  responseId?: string | null
  status?: AiUsageLine['status']
  units?: number
  width?: number
  height?: number
  durationSeconds?: number
  quality?: string
  size?: string
  creditsPerUsd?: number
  metadata?: Record<string, unknown>
}): AiUsageLine {
  const media = aiMediaUsageSchema.parse({
    units: Math.max(1, input.units ?? 1),
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    quality: input.quality,
    size: input.size,
  })
  const cost = estimateFalMediaCost({
    model: input.model,
    units: media.units,
    width: media.width,
    height: media.height,
    durationSeconds: media.durationSeconds,
    creditsPerUsd: input.creditsPerUsd,
  })
  return aiUsageLineSchema.parse({
    nodeKey: input.nodeKey ?? '',
    nodeLabel: input.nodeLabel ?? '',
    nodeType: input.nodeType ?? '',
    provider: 'fal',
    model: input.model,
    modality: input.modality,
    operation: input.operation,
    status: input.status ?? 'succeeded',
    requestId: input.requestId ?? null,
    responseId: input.responseId ?? null,
    media,
    cost,
    metadata: input.metadata ?? {},
  })
}

export function buildMuapiMediaUsageLine(input: {
  model: string
  modality: 'video'
  operation: 'video_generation' | 'provider_queue'
  nodeKey?: string
  nodeLabel?: string
  nodeType?: string
  requestId?: string | null
  responseId?: string | null
  status?: AiUsageLine['status']
  units?: number
  width?: number
  height?: number
  durationSeconds?: number
  quality?: string
  size?: string
  creditsPerUsd?: number
  metadata?: Record<string, unknown>
}): AiUsageLine {
  const media = aiMediaUsageSchema.parse({
    units: Math.max(1, input.units ?? 1),
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    quality: input.quality,
    size: input.size,
  })
  const cost = estimateMuapiMediaCost({
    model: input.model,
    units: media.units,
    width: media.width,
    height: media.height,
    durationSeconds: media.durationSeconds,
    creditsPerUsd: input.creditsPerUsd,
  })
  return aiUsageLineSchema.parse({
    nodeKey: input.nodeKey ?? '',
    nodeLabel: input.nodeLabel ?? '',
    nodeType: input.nodeType ?? '',
    provider: 'muapi',
    model: input.model,
    modality: input.modality,
    operation: input.operation,
    status: input.status ?? 'succeeded',
    requestId: input.requestId ?? null,
    responseId: input.responseId ?? null,
    media,
    cost,
    metadata: input.metadata ?? {},
  })
}

export function summarizeAiUsageLines(lines: AiUsageLine[], status: AiUsageSummary['status'] = 'succeeded'): AiUsageSummary {
  const summary = lines.reduce((acc, line) => {
    const tokens = line.tokens
    const media = line.media
    acc.estimatedCostUsd += line.cost.estimatedCostUsd
    acc.actualCostUsd += line.cost.actualCostUsd
    acc.estimatedCredits += line.cost.estimatedCredits
    acc.actualCredits += line.cost.actualCredits
    acc.inputTokens += tokens?.inputTokens ?? 0
    acc.outputTokens += tokens?.outputTokens ?? 0
    acc.totalTokens += tokens?.totalTokens ?? 0
    acc.cachedInputTokens += tokens?.cachedInputTokens ?? 0
    acc.reasoningTokens += tokens?.reasoningTokens ?? 0
    acc.mediaUnits += media?.units ?? 0
    return acc
  }, aiUsageSummarySchema.parse({ status, lines }))
  return aiUsageSummarySchema.parse({
    ...summary,
    lines,
  })
}

export function estimateOutputWorkflowUsage(plan: {
  nodes?: Array<{
    key?: string
    label?: string
    nodeType?: string
    config?: Record<string, unknown>
    inputs?: Record<string, unknown>
  }>
  prompt?: string
}): AiUsageSummary {
  const promptTokenEstimate = estimateTextTokensFromChars(plan.prompt ?? '')
  const lines = (plan.nodes ?? []).flatMap((node): AiUsageLine[] => {
    const config = readRecord(node.config)
    if (node.nodeType === 'text_llm') {
      const model = typeof config.model === 'string' ? config.model : DEFAULT_OPENAI_TEXT_MODEL
      const purpose = typeof config.purpose === 'string' ? config.purpose : ''
      const outputTokens = purpose.includes('chapter')
        ? 9000
        : purpose.includes('comic_script')
          ? 8000
          : purpose.includes('section')
            ? 3500
            : 2000
      const inputTokens = promptTokenEstimate + estimateTextTokensFromChars(JSON.stringify(node.inputs ?? {})) + 2500
      const cost = estimateOpenAiTextCost({ model, inputTokens, outputTokens })
      return [aiUsageLineSchema.parse({
        nodeKey: node.key ?? '',
        nodeLabel: node.label ?? '',
        nodeType: node.nodeType,
        provider: 'openai',
        model,
        modality: 'text',
        operation: 'estimate',
        status: 'estimated',
        tokens: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cachedInputTokens: 0,
          reasoningTokens: 0,
        },
        cost,
      })]
    }
    if (node.nodeType === 'image_generation') {
      const model = typeof config.model === 'string' ? config.model : 'openai/gpt-image-2'
      const size = typeof config.size === 'string' ? config.size : typeof config.imageSize === 'string' ? config.imageSize : undefined
      const imageSize = readRecord(config.imageSize)
      const width = readNumber(imageSize.width) || undefined
      const height = readNumber(imageSize.height) || undefined
      return [buildFalMediaUsageLine({
        model,
        modality: 'image',
        operation: 'image_generation',
        nodeKey: node.key ?? '',
        nodeLabel: node.label ?? '',
        nodeType: node.nodeType,
        status: 'estimated',
        size,
        width,
        height,
      })]
    }
    if (node.nodeType === 'video_generation') {
      const provider = typeof config.provider === 'string' ? config.provider : 'muapi'
      const model = typeof config.model === 'string'
        ? config.model
        : provider === 'muapi'
          ? 'seedance-2-vip-omni-reference'
          : 'bytedance/seedance-2.0/fast/reference-to-video'
      const durationSeconds = readNumber(config.durationSeconds) || 8
      const usageInput = {
        model,
        modality: 'video' as const,
        operation: 'video_generation' as const,
        nodeKey: node.key ?? '',
        nodeLabel: node.label ?? '',
        nodeType: node.nodeType,
        status: 'estimated' as const,
        units: durationSeconds,
        durationSeconds,
      }
      return [provider === 'muapi' ? buildMuapiMediaUsageLine(usageInput) : buildFalMediaUsageLine(usageInput)]
    }
    return []
  })
  return summarizeAiUsageLines(lines, 'estimated')
}

export function formatAiUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00'
  }
  if (value < 0.01) {
    return `<$0.01`
  }
  return `$${value.toFixed(2)}`
}
