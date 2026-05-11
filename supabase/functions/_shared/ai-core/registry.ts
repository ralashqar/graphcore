import { z } from 'npm:zod@4'

export type Modality = 'text' | 'image' | 'video' | 'audio'
export type GenerationTask =
  | 'world_planner'
  | 'world_repair'
  | 'prompt_patch'
  | 'world_build'
  | 'world_graph_extract'
  | 'output_chapter_prose'
  | 'output_comic_script'
  | 'output_comic_planning'
  | 'output_cover_prompt'
  | 'output_image_job'
  | 'prompt_suggestions'

export type CostPolicy = 'free_first_safe' | 'balanced' | 'quality_first' | 'explicit_model'

export interface AiModel {
  id: string // e.g., 'openai/gpt-4o', 'groq/llama-3.1-8b-instant', 'auto'
  name: string
  provider: string
  modality: Modality
  costCategory?: 'free' | 'cheap' | 'expensive'
  supportsStrictObjectOutput?: boolean
  supportsStreaming?: boolean
  supportsDurableImageJobs?: boolean
  supportsReferenceImages?: boolean
  task?: GenerationTask
}

export interface AiProvider {
  id: string
  name: string
  supportedModalities: Modality[]
  getAvailableModels(): AiModel[]
  getCapabilities?(): ProviderCapability[]
}

export interface ProviderCapability {
  provider: string
  modality: Modality
  defaultModelId: string
  modelIds: string[]
  costCategory?: 'free' | 'cheap' | 'expensive'
  supportsStrictObjectOutput?: boolean
  supportsStreaming?: boolean
  supportsDurableImageJobs?: boolean
  supportsReferenceImages?: boolean
}

export interface ResolvedGenerationAttempt {
  providerId: string
  modelId: string
  task: GenerationTask
  modality: Modality
  costPolicy: CostPolicy
  policyReason: string
  attemptIndex: number
  fallbackReason?: string | null
}

export interface GenerationMetadata {
  provider: string
  model: string
  task: GenerationTask
  usage?: any
  attempts: ResolvedGenerationAttempt[]
  finishReason?: string | null
  providerRequestId?: string | null
}

// ----------------------------------------------------------------------------
// Modality: Text
// ----------------------------------------------------------------------------
// We map closely to the Vercel AI SDK CoreMessage interface to make the Facade seamless
export type CoreMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface CoreMessage {
  role: CoreMessageRole
  content: string | any[] // simplified for abstraction, Vercel supports rich content arrays
}

export interface StandardTextRequest {
  modelPreference?: string // The ID of the model from the registry, or 'auto'
  task?: GenerationTask
  costPolicy?: CostPolicy
  system?: string
  messages: CoreMessage[]
  temperature?: number
  maxTokens?: number
}

// Defines a callback interface so Gateways can push chunks directly to SSE connections
export interface StreamHooks {
  onChunk: (chunk: string) => Promise<void> | void
  onFinish?: (fullText: string) => Promise<void> | void
}

export interface AiTextProvider extends AiProvider {
  generateText(req: StandardTextRequest): Promise<{ text: string; usage?: any; finishReason?: string | null; providerRequestId?: string | null }>
  streamText(req: StandardTextRequest, hooks: StreamHooks): Promise<{ text: string, usage?: any; finishReason?: string | null; providerRequestId?: string | null }>
  generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }): Promise<{ object: T; usage?: any; finishReason?: string | null; providerRequestId?: string | null }>
}

// ----------------------------------------------------------------------------
// Modality: Image
// ----------------------------------------------------------------------------
export interface StandardImageRequest {
  modelPreference?: string
  task?: GenerationTask
  costPolicy?: CostPolicy
  action: 'generate' | 'edit'
  prompt: string
  aspectRatio?: '1:1' | '16:9' | '2:3' | '9:16'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  referenceImages?: Array<{ data: string; mimeType: string }> // For edits/masks
  numGenerations?: number
}

export interface StandardImageResponse {
  images: Array<{
    url?: string
    base64?: string
    width?: number
    height?: number
  }>
  provider?: string
  model?: string
  usage?: any
  attempts?: ResolvedGenerationAttempt[]
  finishReason?: string | null
  providerRequestId?: string | null
}

export interface DurableImageJobRequest {
  modelPreference?: string
  task?: GenerationTask
  costPolicy?: CostPolicy
  priorProviderRequestId?: string | null
  priorMetadata?: Record<string, unknown> | null
  prompt: string
  imageSize: unknown
  quality: string
  outputFormat: string
  referenceImageUrls?: string[]
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: DurableImageJobProgress) => Promise<void> | void
}

export interface DurableImageJobProgress {
  provider: string
  model: string
  providerRequestId: string
  providerStatus: string
  providerMode: string
  lastProviderPollAt: string
  metadata?: Record<string, unknown>
}

export interface DurableImageJobResponse {
  provider: string
  model: string
  providerRequestId: string
  providerMode: string
  providerStatus: string
  imageUrl: string
  width: number | null
  height: number | null
  mimeType: string
  fileName?: string | null
  fileSize?: number | null
  resultBody?: Record<string, unknown>
  statusUrl?: string | null
  responseUrl?: string | null
  attempts: ResolvedGenerationAttempt[]
}

export interface AiImageProvider extends AiProvider {
  generateImage(req: StandardImageRequest): Promise<StandardImageResponse>
  runImageJob?(req: DurableImageJobRequest): Promise<DurableImageJobResponse>
}

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------
class ProviderRegistry {
  private providers = new Map<string, AiProvider>()

  register(provider: AiProvider) {
    this.providers.set(provider.id, provider)
  }

  getProvider(id: string): AiProvider {
    const provider = this.providers.get(id)
    if (!provider) {
      throw new Error(`AI Provider '${id}' is not registered.`)
    }
    return provider
  }

  getTextProvider(id: string): AiTextProvider {
    const provider = this.getProvider(id)
    if (!provider.supportedModalities.includes('text')) {
      throw new Error(`Provider '${id}' does not support text generation.`)
    }
    return provider as AiTextProvider
  }

  getImageProvider(id: string): AiImageProvider {
    const provider = this.getProvider(id)
    if (!provider.supportedModalities.includes('image')) {
      throw new Error(`Provider '${id}' does not support image generation.`)
    }
    return provider as AiImageProvider
  }

  getAllModels(modality?: Modality): AiModel[] {
    const models: AiModel[] = []
    for (const provider of this.providers.values()) {
      const all = provider.getAvailableModels()
      models.push(...(modality ? all.filter(m => m.modality === modality) : all))
    }
    return models
  }

  getCapabilities(modality?: Modality): ProviderCapability[] {
    const capabilities: ProviderCapability[] = []
    for (const provider of this.providers.values()) {
      const providerCapabilities = provider.getCapabilities?.() ?? provider.supportedModalities.map((supportedModality) => {
        const models = provider.getAvailableModels().filter((model) => model.modality === supportedModality)
        return {
          provider: provider.id,
          modality: supportedModality,
          defaultModelId: models[0]?.id ?? provider.id,
          modelIds: models.map((model) => model.id),
          costCategory: models[0]?.costCategory,
        } satisfies ProviderCapability
      })
      capabilities.push(...(modality ? providerCapabilities.filter((capability) => capability.modality === modality) : providerCapabilities))
    }
    return capabilities
  }
}

export const Registry = new ProviderRegistry()
