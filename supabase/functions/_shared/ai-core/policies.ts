import { Registry, type AiModel, type CostPolicy, type GenerationTask, type Modality, type ResolvedGenerationAttempt } from './registry.ts'

type TaskPolicy = {
  costPolicy: CostPolicy
  textModels?: string[]
  imageModels?: string[]
  allowFallback: boolean
  reason: string
}

export const SYNTHETIC_AUTO_MODEL_ID = 'auto'

const TEXT_BALANCED = ['google/gemini-2.5-flash', 'anthropic/claude-3-5-haiku-latest', 'openai/gpt-4o-mini', 'openrouter/meta-llama/llama-3.3-70b-instruct']
const TEXT_QUALITY = ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.5-pro', 'openai/gpt-4o']
const TEXT_FREE_SAFE = ['groq/llama-3.1-8b-instant', 'google/gemini-2.5-flash', 'openrouter/meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini']
const IMAGE_DURABLE = ['fal/openai/gpt-image-2', 'openai/dall-e-3', 'google/imagen-3.0-generate-002']
const IMAGE_SYNC = ['openai/dall-e-3', 'google/imagen-3.0-generate-002']

export const DEFAULT_TASK_POLICIES: Record<GenerationTask, TaskPolicy> = {
  world_planner: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Canon-changing world planning requires reliable structured output.',
  },
  world_repair: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Repair passes protect canon and schema validity.',
  },
  prompt_patch: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Prompt patches produce user-reviewable graph mutations.',
  },
  world_build: {
    costPolicy: 'balanced',
    textModels: TEXT_BALANCED,
    allowFallback: true,
    reason: 'World build passes need good structure with cost control.',
  },
  world_graph_extract: {
    costPolicy: 'balanced',
    textModels: TEXT_BALANCED,
    allowFallback: true,
    reason: 'World graph extraction benefits from balanced cost and reliability.',
  },
  output_chapter_prose: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Chapter prose is a final user-facing artifact.',
  },
  output_comic_script: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Comic scripts require strict structured production JSON.',
  },
  output_comic_planning: {
    costPolicy: 'quality_first',
    textModels: TEXT_QUALITY,
    allowFallback: true,
    reason: 'Comic planning feeds downstream images and scripts.',
  },
  output_cover_prompt: {
    costPolicy: 'balanced',
    textModels: TEXT_BALANCED,
    allowFallback: true,
    reason: 'Cover prompts are visual direction, not canon mutation.',
  },
  output_image_job: {
    costPolicy: 'quality_first',
    imageModels: IMAGE_DURABLE,
    allowFallback: true,
    reason: 'Output images are durable user-facing artifacts.',
  },
  prompt_suggestions: {
    costPolicy: 'free_first_safe',
    textModels: TEXT_FREE_SAFE,
    allowFallback: true,
    reason: 'Suggestions are low-risk and can use cheap/free capacity first.',
  },
}

function parseList(raw: string | null | undefined) {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseOverrideJson(envName: string): Record<string, Partial<TaskPolicy>> {
  const raw = Deno.env.get(envName)?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, Partial<TaskPolicy>>
      : {}
  } catch (error) {
    console.warn(`[ai-policy] Ignoring invalid ${envName}.`, error instanceof Error ? error.message : String(error))
    return {}
  }
}

function disabledProviders() {
  return new Set(parseList(Deno.env.get('AI_DISABLED_PROVIDERS')).map((provider) => provider.toLowerCase()))
}

function providerFromModel(modelId: string) {
  return modelId.includes('/') ? modelId.split('/')[0] : 'openai'
}

function normalizeModelForProvider(modelId: string, providerId: string) {
  return modelId.includes('/') ? modelId : `${providerId}/${modelId}`
}

function allModelIds(modality: Modality) {
  return new Set(Registry.getAllModels(modality).map((model) => model.id))
}

function configuredTaskModel(task: GenerationTask, modality: Modality) {
  const names = modality === 'text'
    ? [
      `AI_TASK_${task.toUpperCase()}_TEXT_MODEL`,
      task === 'output_chapter_prose' ? 'OUTPUT_WORKFLOW_TEXT_MODEL' : '',
      task === 'output_comic_script' || task === 'output_comic_planning' ? 'OUTPUT_WORKFLOW_COMIC_TEXT_MODEL' : '',
    ]
    : [
      `AI_TASK_${task.toUpperCase()}_IMAGE_MODEL`,
      task === 'output_image_job' ? 'OUTPUT_WORKFLOW_IMAGE_MODEL' : '',
    ]

  for (const name of names.filter(Boolean)) {
    const value = Deno.env.get(name)?.trim()
    if (value) {
      if (task === 'output_image_job' && (value === 'gpt-image-2' || value === 'openai/gpt-image-2')) return 'fal/openai/gpt-image-2'
      if (task === 'output_image_job' && (value === 'gpt-image-2/edit' || value === 'openai/gpt-image-2/edit')) return 'fal/openai/gpt-image-2/edit'
      return value
    }
  }
  return null
}

function applyOverrides(task: GenerationTask, policy: TaskPolicy, modality: Modality): TaskPolicy {
  const overrides = parseOverrideJson(modality === 'image' ? 'AI_IMAGE_POLICY_OVERRIDES' : 'AI_TEXT_POLICY_OVERRIDES')
  const override = overrides[task]
  const merged = override ? { ...policy, ...override } : policy
  const envModel = configuredTaskModel(task, modality)
  if (!envModel || envModel === SYNTHETIC_AUTO_MODEL_ID) return merged
  return {
    ...merged,
    costPolicy: 'explicit_model',
    allowFallback: false,
    textModels: modality === 'text' ? [envModel] : merged.textModels,
    imageModels: modality === 'image' ? [envModel] : merged.imageModels,
    reason: `Explicit ${task} model override from environment.`,
  }
}

export function getTaskPolicy(task: GenerationTask, modality: Modality): TaskPolicy {
  return applyOverrides(task, DEFAULT_TASK_POLICIES[task], modality)
}

export function resolveGenerationAttempts(input: {
  task?: GenerationTask
  modality: Modality
  modelPreference?: string | null
  costPolicy?: CostPolicy
  requiresDurableImageJob?: boolean
  requiresStrictObjectOutput?: boolean
  requiresStreaming?: boolean
  supportsReferenceImages?: boolean
}): ResolvedGenerationAttempt[] {
  const task = input.task ?? (input.modality === 'image' ? 'output_image_job' : 'world_planner')
  const basePolicy = getTaskPolicy(task, input.modality)
  const explicit = input.modelPreference?.trim()
  const policy: TaskPolicy = explicit && explicit !== SYNTHETIC_AUTO_MODEL_ID
    ? {
      ...basePolicy,
      costPolicy: 'explicit_model',
      allowFallback: false,
      textModels: input.modality === 'text' ? [explicit] : basePolicy.textModels,
      imageModels: input.modality === 'image' ? [explicit] : basePolicy.imageModels,
      reason: 'Explicit model requested by caller.',
    }
    : input.costPolicy
      ? { ...basePolicy, costPolicy: input.costPolicy }
      : basePolicy

  const disabled = disabledProviders()
  const knownModels = allModelIds(input.modality)
  const candidates = input.modality === 'image'
    ? (policy.imageModels ?? IMAGE_SYNC)
    : (policy.textModels ?? TEXT_BALANCED)

  const attempts: ResolvedGenerationAttempt[] = []
  for (const candidate of candidates) {
    const providerId = providerFromModel(candidate)
    if (disabled.has(providerId.toLowerCase())) continue
    const modelId = normalizeModelForProvider(candidate, providerId)
    if (!knownModels.has(modelId)) continue
    const providerCapability = Registry.getCapabilities(input.modality).find((capability) => capability.provider === providerId)
    if (!providerCapability) continue
    if (input.requiresDurableImageJob && !providerCapability.supportsDurableImageJobs) continue
    if (input.requiresStrictObjectOutput && providerCapability.supportsStrictObjectOutput === false) continue
    if (input.requiresStreaming && providerCapability.supportsStreaming === false) continue
    if (input.supportsReferenceImages && providerCapability.supportsReferenceImages === false) continue
    attempts.push({
      providerId,
      modelId,
      task,
      modality: input.modality,
      costPolicy: policy.costPolicy,
      policyReason: policy.reason,
      attemptIndex: attempts.length,
      fallbackReason: attempts.length === 0 ? null : 'previous_attempt_failed',
    })
    if (!policy.allowFallback) break
  }

  if (attempts.length > 0) return attempts

  const fallbackModels = input.modality === 'image' ? IMAGE_SYNC : TEXT_QUALITY
  for (const candidate of fallbackModels) {
    const providerId = providerFromModel(candidate)
    if (disabled.has(providerId.toLowerCase())) continue
    const modelId = normalizeModelForProvider(candidate, providerId)
    if (!knownModels.has(modelId)) continue
    const providerCapability = Registry.getCapabilities(input.modality).find((capability) => capability.provider === providerId)
    if (!providerCapability) continue
    if (input.requiresDurableImageJob && !providerCapability.supportsDurableImageJobs) continue
    if (input.requiresStrictObjectOutput && providerCapability.supportsStrictObjectOutput === false) continue
    if (input.requiresStreaming && providerCapability.supportsStreaming === false) continue
    if (input.supportsReferenceImages && providerCapability.supportsReferenceImages === false) continue
    attempts.push({
      providerId,
      modelId,
      task,
      modality: input.modality,
      costPolicy: 'balanced',
      policyReason: 'Safe fallback because configured policy resolved no available providers.',
      attemptIndex: attempts.length,
      fallbackReason: 'policy_empty',
    })
    break
  }
  return attempts
}

export function getSyntheticAutoModels(modality?: Modality): AiModel[] {
  const modalities: Modality[] = modality ? [modality] : ['text', 'image']
  const models: AiModel[] = []
  for (const targetModality of modalities) {
    for (const [task, policy] of Object.entries(DEFAULT_TASK_POLICIES) as Array<[GenerationTask, TaskPolicy]>) {
      const supportsModality = targetModality === 'text' ? policy.textModels : policy.imageModels
      if (!supportsModality) continue
      models.push({
        id: `${SYNTHETIC_AUTO_MODEL_ID}/${task}`,
        name: `Auto: ${policy.costPolicy.replaceAll('_', ' ')}`,
        provider: SYNTHETIC_AUTO_MODEL_ID,
        modality: targetModality,
        costCategory: policy.costPolicy === 'quality_first' ? 'expensive' : 'cheap',
        task,
      })
    }
  }
  return models
}
