import { Registry, StandardTextRequest, StandardImageRequest, StreamHooks } from './registry.ts'
import { z } from 'npm:zod@4'
import { OpenAiProvider } from './providers/openai.ts'
import { FalProvider } from './providers/fal.ts'
import { AnthropicProvider } from './providers/anthropic.ts'
import { GoogleProvider } from './providers/google.ts'
import { GroqProvider } from './providers/groq.ts'

Registry.register(new OpenAiProvider())
Registry.register(new FalProvider())
Registry.register(new AnthropicProvider())
Registry.register(new GoogleProvider())
Registry.register(new GroqProvider())

export class TextGateway {
  static async generateText(req: StandardTextRequest) {
    const providerId = this.resolveProviderFromModel(req.modelPreference)
    const provider = Registry.getTextProvider(providerId)
    return provider.generateText(req)
  }

  static async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const providerId = this.resolveProviderFromModel(req.modelPreference)
    const provider = Registry.getTextProvider(providerId)
    return provider.streamText(req, hooks)
  }

  static async generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }) {
    const providerId = this.resolveProviderFromModel(req.modelPreference)
    const provider = Registry.getTextProvider(providerId)
    return provider.generateObject<T>(req)
  }

  private static resolveProviderFromModel(modelId?: string): string {
    if (!modelId || modelId === 'auto') return 'openai' // Fallback default until proxy routing is built
    // Models in registry are expected to be formatted as "provider/model-name", e.g. "openai/gpt-4o"
    const parts = modelId.split('/')
    return parts.length > 1 ? parts[0] : 'openai'
  }
}

export class ImageGateway {
  static async generateImage(req: StandardImageRequest) {
    const providerId = this.resolveProviderFromModel(req.modelPreference)
    const provider = Registry.getImageProvider(providerId)
    return provider.generateImage(req)
  }

  private static resolveProviderFromModel(modelId?: string): string {
    if (!modelId || modelId === 'auto') return 'fal' // Fallback to fal for images by default
    const parts = modelId.split('/')
    return parts.length > 1 ? parts[0] : 'fal'
  }
}
