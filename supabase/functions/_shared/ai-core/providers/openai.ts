import { AiTextProvider, AiImageProvider, StandardTextRequest, StandardImageRequest, StandardImageResponse, StreamHooks, CoreMessage as GatewayMessage, AiModel, ProviderCapability } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, ModelMessage, experimental_generateImage as generateImage } from 'npm:ai@6'
import { createOpenAI } from 'npm:@ai-sdk/openai@3'
import { z } from 'npm:zod@4'

export class OpenAiProvider implements AiTextProvider, AiImageProvider {
  id = 'openai'
  name = 'OpenAI'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text', 'image']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai', modality: 'text', costCategory: 'expensive' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', modality: 'text', costCategory: 'cheap' },
      { id: 'openai/o1-mini', name: 'o1 Mini', provider: 'openai', modality: 'text', costCategory: 'expensive' },
      { id: 'openai/dall-e-3', name: 'DALL-E 3', provider: 'openai', modality: 'image', costCategory: 'expensive' },
    ]
  }

  getCapabilities(): ProviderCapability[] {
    return [
      {
        provider: this.id,
        modality: 'text',
        defaultModelId: 'openai/gpt-4o-mini',
        modelIds: this.getAvailableModels().filter((model) => model.modality === 'text').map((model) => model.id),
        costCategory: 'cheap',
        supportsStrictObjectOutput: true,
        supportsStreaming: true,
      },
      {
        provider: this.id,
        modality: 'image',
        defaultModelId: 'openai/dall-e-3',
        modelIds: this.getAvailableModels().filter((model) => model.modality === 'image').map((model) => model.id),
        costCategory: 'expensive',
        supportsReferenceImages: false,
      },
    ]
  }

  private getClient() {
    return createOpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY') || '',
    })
  }

  private mapMessages(system?: string, genericMessages: GatewayMessage[] = []): ModelMessage[] {
    const msgs: ModelMessage[] = []
    if (system) msgs.push({ role: 'system', content: system })
    
    for (const msg of genericMessages) {
      if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
        msgs.push(msg as ModelMessage)
      }
    }
    return msgs
  }

  private resolveModelName(modelPref?: string) {
    if (!modelPref || modelPref === 'auto') return 'gpt-4o-mini' // Default auto logic
    return modelPref.split('/')[1] || 'gpt-4o-mini'
  }

  private schemaFor<T>(schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string) {
    void schemaName
    const isJsonSchema = schema && typeof schema === 'object' && !('_def' in schema)
    return isJsonSchema
      ? jsonSchema<T>(schema as any)
      : schema as z.ZodType<T>
  }

  async generateText(req: StandardTextRequest) {
    const openai = this.getClient()
    const result = await generateText({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens
    })
    return { text: result.text, usage: result.usage, finishReason: result.finishReason ?? null, providerRequestId: (result as any).response?.id ?? null }
  }

  async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const openai = this.getClient()
    const result = await streamText({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
      if (hooks.onChunk) {
        await hooks.onChunk(chunk)
      }
    }

    if (hooks.onFinish) {
      await hooks.onFinish(fullText)
    }
    const usage = await result.usage
    return { text: fullText, usage, finishReason: await result.finishReason, providerRequestId: (await result.response as any)?.id ?? null }
  }

  async generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }) {
    const openai = this.getClient()
    
    const result = await generateObject({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      schema: this.schemaFor(req.schema, req.schemaName),
      temperature: req.temperature ?? 0.7,
    })
    return { object: result.object as T, usage: result.usage, finishReason: result.finishReason ?? null, providerRequestId: (result as any).response?.id ?? null }
  }

  async generateImage(req: StandardImageRequest): Promise<StandardImageResponse> {
    const openai = this.getClient()
    const modelId = req.modelPreference && req.modelPreference !== 'auto' 
      ? req.modelPreference.split('/')[1] 
      : 'dall-e-3'

    const result = await generateImage({
      model: openai.image(modelId),
      prompt: req.prompt,
      n: req.numGenerations ?? 1,
      aspectRatio: req.aspectRatio === '1:1' ? '1:1' : req.aspectRatio === '16:9' ? '16:9' : req.aspectRatio === '9:16' ? '9:16' : req.aspectRatio === '2:3' ? '9:16' : '1:1'
    })

    return {
      images: result.images.map(img => ({
        base64: img.base64
      }))
    }
  }
}
