import {
  Registry,
  type DurableImageJobRequest,
  type ResolvedGenerationAttempt,
  type StandardImageRequest,
  type StandardTextRequest,
  type StreamHooks,
} from './registry.ts'
import { resolveGenerationAttempts } from './policies.ts'
import { registerBuiltInProviders } from './providers.ts'
import { z } from 'npm:zod@4'

registerBuiltInProviders()

function shouldFallback(err: any): boolean {
  const status = Number(err?.statusCode ?? err?.response?.status ?? err?.message?.match(/(?:status code |status: )(\d+)/)?.[1])
  const isMissing = err?.message?.includes('is not registered') || err?.message?.includes('does not support')
  return status === 408 || status === 409 || status === 425 || status === 429 || status === 402 || status >= 500 || !!isMissing
}

function withResolvedTextModel(req: StandardTextRequest, attempt: ResolvedGenerationAttempt): StandardTextRequest {
  return {
    ...req,
    task: attempt.task,
    costPolicy: attempt.costPolicy,
    modelPreference: attempt.modelId,
  }
}

function withResolvedImageModel(req: StandardImageRequest, attempt: ResolvedGenerationAttempt): StandardImageRequest {
  return {
    ...req,
    task: attempt.task,
    costPolicy: attempt.costPolicy,
    modelPreference: attempt.modelId,
  }
}

function withResolvedImageJobModel(req: DurableImageJobRequest, attempt: ResolvedGenerationAttempt): DurableImageJobRequest {
  return {
    ...req,
    task: attempt.task,
    costPolicy: attempt.costPolicy,
    modelPreference: attempt.modelId,
  }
}

export class TextGateway {
  static resolveAttempts(req: StandardTextRequest, options?: { requiresStrictObjectOutput?: boolean; requiresStreaming?: boolean }) {
    return resolveGenerationAttempts({
      task: req.task,
      modality: 'text',
      modelPreference: req.modelPreference,
      costPolicy: req.costPolicy,
      requiresStrictObjectOutput: options?.requiresStrictObjectOutput,
      requiresStreaming: options?.requiresStreaming,
    })
  }

  static async generateText(req: StandardTextRequest) {
    const attempts = this.resolveAttempts(req)
    let lastError: unknown
    const usedAttempts: ResolvedGenerationAttempt[] = []

    for (const attempt of attempts) {
      usedAttempts.push(attempt)
      try {
        const provider = Registry.getTextProvider(attempt.providerId)
        const result = await provider.generateText(withResolvedTextModel(req, attempt))
        return {
          ...result,
          provider: attempt.providerId,
          model: attempt.modelId,
          attempts: usedAttempts,
          task: attempt.task,
          finishReason: result.finishReason ?? null,
          providerRequestId: result.providerRequestId ?? null,
        }
      } catch (err: any) {
        lastError = err
        if (attempt.attemptIndex < attempts.length - 1 && shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${attempt.providerId}' failed. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error('No text provider attempts were available.')
  }

  static async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const attempts = this.resolveAttempts(req, { requiresStreaming: true })
    let lastError: unknown
    const usedAttempts: ResolvedGenerationAttempt[] = []

    for (const attempt of attempts) {
      usedAttempts.push(attempt)
      try {
        const provider = Registry.getTextProvider(attempt.providerId)
        const result = await provider.streamText(withResolvedTextModel(req, attempt), hooks)
        return {
          ...result,
          provider: attempt.providerId,
          model: attempt.modelId,
          attempts: usedAttempts,
          task: attempt.task,
          finishReason: result.finishReason ?? null,
          providerRequestId: result.providerRequestId ?? null,
        }
      } catch (err: any) {
        lastError = err
        if (attempt.attemptIndex < attempts.length - 1 && shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${attempt.providerId}' failed. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error('No streaming text provider attempts were available.')
  }

  static async generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }) {
    const attempts = this.resolveAttempts(req, { requiresStrictObjectOutput: true })
    let lastError: unknown
    const usedAttempts: ResolvedGenerationAttempt[] = []

    for (const attempt of attempts) {
      usedAttempts.push(attempt)
      try {
        const provider = Registry.getTextProvider(attempt.providerId)
        const result = await provider.generateObject<T>({
          ...withResolvedTextModel(req, attempt),
          schema: req.schema,
          schemaName: req.schemaName,
        })
        return {
          ...result,
          provider: attempt.providerId,
          model: attempt.modelId,
          attempts: usedAttempts,
          task: attempt.task,
          finishReason: result.finishReason ?? null,
          providerRequestId: result.providerRequestId ?? null,
        }
      } catch (err: any) {
        lastError = err
        if (attempt.attemptIndex < attempts.length - 1 && shouldFallback(err)) {
          console.warn(`[TextGateway] Provider '${attempt.providerId}' failed. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error('No structured text provider attempts were available.')
  }
}

export class ImageGateway {
  static resolveAttempts(req: StandardImageRequest | DurableImageJobRequest, options?: { durable?: boolean; supportsReferenceImages?: boolean }) {
    return resolveGenerationAttempts({
      task: req.task,
      modality: 'image',
      modelPreference: req.modelPreference,
      costPolicy: req.costPolicy,
      requiresDurableImageJob: options?.durable,
      supportsReferenceImages: options?.supportsReferenceImages,
    })
  }

  static async generateImage(req: StandardImageRequest) {
    const attempts = this.resolveAttempts(req, { supportsReferenceImages: (req.referenceImages?.length ?? 0) > 0 })
    let lastError: unknown
    const usedAttempts: ResolvedGenerationAttempt[] = []

    for (const attempt of attempts) {
      usedAttempts.push(attempt)
      try {
        const provider = Registry.getImageProvider(attempt.providerId)
        const result = await provider.generateImage(withResolvedImageModel(req, attempt))
        return {
          ...result,
          provider: attempt.providerId,
          model: attempt.modelId,
          attempts: usedAttempts,
          finishReason: result.finishReason ?? null,
          providerRequestId: result.providerRequestId ?? null,
        }
      } catch (err: any) {
        lastError = err
        if (attempt.attemptIndex < attempts.length - 1 && shouldFallback(err)) {
          console.warn(`[ImageGateway] Provider '${attempt.providerId}' failed. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error('No image provider attempts were available.')
  }

  static async runImageJob(req: DurableImageJobRequest) {
    const attempts = this.resolveAttempts(req, {
      durable: true,
      supportsReferenceImages: (req.referenceImageUrls?.length ?? 0) > 0,
    })
    let lastError: unknown
    const usedAttempts: ResolvedGenerationAttempt[] = []

    for (const attempt of attempts) {
      usedAttempts.push(attempt)
      try {
        const provider = Registry.getImageProvider(attempt.providerId)
        if (!provider.runImageJob) throw new Error(`Provider '${attempt.providerId}' does not support durable image jobs.`)
        const result = await provider.runImageJob(withResolvedImageJobModel(req, attempt))
        return {
          ...result,
          attempts: usedAttempts,
        }
      } catch (err: any) {
        lastError = err
        if (err && typeof err === 'object' && err.workflowCancelled === true) throw err
        if (attempt.attemptIndex < attempts.length - 1 && shouldFallback(err)) {
          console.warn(`[ImageGateway] Provider '${attempt.providerId}' durable job failed. Falling back...`, err?.message)
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error('No durable image provider attempts were available.')
  }
}
