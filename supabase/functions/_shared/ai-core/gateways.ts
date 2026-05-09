import { Registry, StandardTextRequest, StandardImageRequest, StreamHooks } from './registry.ts'
import { z } from 'npm:zod@4'
import { OpenAiProvider } from './providers/openai.ts'
import { FalProvider } from './providers/fal.ts'
import { AnthropicProvider } from './providers/anthropic.ts'
import { GoogleProvider } from './providers/google.ts'
import { GroqProvider } from './providers/groq.ts'
import { OpenRouterProvider } from './providers/openrouter.ts'

Registry.register(new OpenAiProvider())
Registry.register(new FalProvider())
Registry.register(new AnthropicProvider())
Registry.register(new GoogleProvider())
Registry.register(new GroqProvider())
Registry.register(new OpenRouterProvider())

const TEXT_AUTO_PRIORITY = ['groq', 'google', 'anthropic', 'openai', 'openrouter']

export class TextGateway {
  private static isAuto(req: StandardTextRequest): boolean {
    return !req.modelPreference || req.modelPreference === 'auto'
  }

  private static getProvidersToTry(req: StandardTextRequest): string[] {
    if (this.isAuto(req)) return TEXT_AUTO_PRIORITY
    return [this.resolveProviderFromModel(req.modelPreference)]
  }

  private static shouldFallback(err: any): boolean {
    const status = Number(err?.statusCode ?? err?.response?.status ?? err?.message?.match(/(?:status code |status: )(\d+)/)?.[1])
    const isMissing = err?.message?.includes('is not registered') || err?.message?.includes('does not support')
    // 429: Rate limit, 402: Payment Required, 5xx: Server Errors, or Provider isn't implemented yet
    return status === 429 || status === 402 || status >= 500 || !!isMissing
  }

  static async generateText(req: StandardTextRequest) {
    const providersToTry = this.getProvidersToTry(req)
    let lastError: unknown

    for (const providerId of providersToTry) {
      try {
        const provider = Registry.getTextProvider(providerId)
        return await provider.generateText(req)
      } catch (err: any) {
        lastError = err
        if (this.isAuto(req) && this.shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${providerId}' failed/missing. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  static async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const providersToTry = this.getProvidersToTry(req)
    let lastError: unknown

    for (const providerId of providersToTry) {
      try {
        const provider = Registry.getTextProvider(providerId)
        return await provider.streamText(req, hooks)
      } catch (err: any) {
        lastError = err
        if (this.isAuto(req) && this.shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${providerId}' failed/missing. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  static async generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }) {
    const providersToTry = this.getProvidersToTry(req)
    let lastError: unknown

    for (const providerId of providersToTry) {
      try {
        const provider = Registry.getTextProvider(providerId)
        return await provider.generateObject<T>(req)
      } catch (err: any) {
        lastError = err
        if (this.isAuto(req) && this.shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${providerId}' failed/missing. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  private static resolveProviderFromModel(modelId?: string): string {
    if (!modelId || modelId === 'auto') return 'openai' // Fallback if auto logic bypasses loop somehow
    const parts = modelId.split('/')
    return parts.length > 1 ? parts[0] : 'openai'
  }
}

const IMAGE_AUTO_PRIORITY = ['fal', 'openai', 'google']

export class ImageGateway {
  private static isAuto(req: StandardImageRequest): boolean {
    return !req.modelPreference || req.modelPreference === 'auto'
  }

  private static getProvidersToTry(req: StandardImageRequest): string[] {
    if (this.isAuto(req)) return IMAGE_AUTO_PRIORITY
    return [this.resolveProviderFromModel(req.modelPreference)]
  }

  private static shouldFallback(err: any): boolean {
    const status = Number(err?.statusCode ?? err?.response?.status ?? err?.message?.match(/(?:status code |status: )(\d+)/)?.[1])
    const isMissing = err?.message?.includes('is not registered') || err?.message?.includes('does not support')
    return status === 429 || status === 402 || status >= 500 || !!isMissing
  }

  static async generateImage(req: StandardImageRequest) {
    const providersToTry = this.getProvidersToTry(req)
    let lastError: unknown

    for (const providerId of providersToTry) {
      try {
        const provider = Registry.getImageProvider(providerId)
        return await provider.generateImage(req)
      } catch (err: any) {
        lastError = err
        if (this.isAuto(req) && this.shouldFallback(err)) {
          console.warn(`[ImageGateway] Provider '${providerId}' failed/missing. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  private static resolveProviderFromModel(modelId?: string): string {
    if (!modelId || modelId === 'auto') return 'fal' // Fallback to fal for images by default
    const parts = modelId.split('/')
    return parts.length > 1 ? parts[0] : 'fal'
  }
}
