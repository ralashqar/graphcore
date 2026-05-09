import { z } from 'npm:zod@4'

export type Modality = 'text' | 'image' | 'video' | 'audio'

export interface AiModel {
  id: string // e.g., 'openai/gpt-4o', 'groq/llama-3.1-8b-instant', 'auto'
  name: string
  provider: string
  modality: Modality
  costCategory?: 'free' | 'cheap' | 'expensive'
}

export interface AiProvider {
  id: string
  name: string
  supportedModalities: Modality[]
  getAvailableModels(): AiModel[]
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
  generateText(req: StandardTextRequest): Promise<{ text: string; usage?: any }>
  streamText(req: StandardTextRequest, hooks: StreamHooks): Promise<{ text: string, usage?: any }>
  generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }): Promise<{ object: T; usage?: any }>
}

// ----------------------------------------------------------------------------
// Modality: Image
// ----------------------------------------------------------------------------
export interface StandardImageRequest {
  modelPreference?: string
  action: 'generate' | 'edit'
  prompt: string
  aspectRatio?: '1:1' | '16:9' | '2:3' | '9:16'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  referenceImages?: Array<{ data: string; mimeType: string }> // For edits/masks
  numGenerations?: number
}

export interface StandardImageResponse {
  images: Array<{
    url: string
    base64?: string
    width?: number
    height?: number
  }>
}

export interface AiImageProvider extends AiProvider {
  generateImage(req: StandardImageRequest): Promise<StandardImageResponse>
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
}

export const Registry = new ProviderRegistry()
