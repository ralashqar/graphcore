import { AiTextProvider, AiImageProvider, StandardTextRequest, StandardImageRequest, StandardImageResponse, StreamHooks, CoreMessage as GatewayMessage, AiModel, ProviderCapability } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, ModelMessage, experimental_generateImage as generateImage } from 'npm:ai@6'
import { createGoogleGenerativeAI } from 'npm:@ai-sdk/google@3'
import { z } from 'npm:zod@4'

export class GoogleProvider implements AiTextProvider, AiImageProvider {
  id = 'google'
  name = 'Google'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text', 'image']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', modality: 'text', costCategory: 'expensive' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', modality: 'text', costCategory: 'cheap' },
      { id: 'google/imagen-3.0-generate-002', name: 'Imagen 3', provider: 'google', modality: 'image', costCategory: 'cheap' }
    ]
  }

  getCapabilities(): ProviderCapability[] {
    return [
      {
        provider: this.id,
        modality: 'text',
        defaultModelId: 'google/gemini-2.5-flash',
        modelIds: this.getAvailableModels().filter((model) => model.modality === 'text').map((model) => model.id),
        costCategory: 'cheap',
        supportsStrictObjectOutput: true,
        supportsStreaming: true,
      },
      {
        provider: this.id,
        modality: 'image',
        defaultModelId: 'google/imagen-3.0-generate-002',
        modelIds: this.getAvailableModels().filter((model) => model.modality === 'image').map((model) => model.id),
        costCategory: 'cheap',
        supportsReferenceImages: false,
      },
    ]
  }

  private getClient() {
    return createGoogleGenerativeAI({
      apiKey: Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '',
    })
  }

  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference ?? 'google/gemini-2.5-flash'
    if (raw.startsWith('google/')) return raw.replace('google/', '')
    if (raw === 'auto') return 'gemini-2.5-flash' // fallback
    return raw
  }

  private schemaFor(schema: z.ZodSchema<any> | Record<string, unknown>, schemaName?: string) {
    void schemaName
    const isJsonSchema = schema && typeof schema === 'object' && !('_def' in schema)
    return isJsonSchema ? jsonSchema(schema as any) : schema as z.ZodSchema<any>
  }

  async generateText(req: StandardTextRequest) {
    const result = await generateText({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as ModelMessage[],
      maxOutputTokens: req.maxTokens,
    })
    const usage = await result.usage
    return { text: result.text, usage, finishReason: result.finishReason ?? null, providerRequestId: (result as any).response?.id ?? null }
  }

  async generateObject(req: StandardTextRequest & { schema: z.ZodSchema<any> | Record<string, unknown>, schemaName?: string }) {
    const result = await generateObject({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as ModelMessage[],
      maxOutputTokens: req.maxTokens,
      schema: this.schemaFor(req.schema, req.schemaName),
      schemaName: req.schemaName,
    })
    const usage = await result.usage
    return { object: result.object, usage, finishReason: result.finishReason ?? null, providerRequestId: (result as any).response?.id ?? null }
  }

  async generateObjectRawSchema(req: StandardTextRequest & { rawSchema: any, schemaName?: string }): Promise<{ object: any; usage?: any }> {
    const result = await generateObject({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as ModelMessage[],
      maxOutputTokens: req.maxTokens,
      schema: jsonSchema(req.rawSchema),
      schemaName: req.schemaName,
    })
    const usage = await result.usage
    return { object: result.object, usage }
  }

  async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const result = streamText({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as ModelMessage[],
      maxOutputTokens: req.maxTokens,
    })

    for await (const textPart of result.textStream) {
      hooks.onChunk?.(textPart)
    }

    const text = await result.text
    const usage = await result.usage
    return { text, usage, finishReason: await result.finishReason, providerRequestId: (await result.response as any)?.id ?? null }
  }

  async generateImage(req: StandardImageRequest): Promise<StandardImageResponse> {
    const google = this.getClient()
    const modelId = req.modelPreference && req.modelPreference !== 'auto' && req.modelPreference.includes('imagen')
      ? req.modelPreference.replace('google/', '')
      : 'imagen-3.0-generate-002'

    const result = await generateImage({
      model: google.image(modelId),
      prompt: req.prompt,
      n: req.numGenerations ?? 1,
      aspectRatio: req.aspectRatio === '1:1' ? '1:1' : req.aspectRatio === '16:9' ? '16:9' : req.aspectRatio === '9:16' ? '9:16' : req.aspectRatio === '2:3' ? '3:4' : '1:1' 
    })

    return {
      images: result.images.map(img => ({
        base64: img.base64
      }))
    }
  }
}
