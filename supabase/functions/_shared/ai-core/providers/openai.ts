import { AiTextProvider, AiImageProvider, StandardTextRequest, StandardImageRequest, StandardImageResponse, StreamHooks, CoreMessage as GatewayMessage, AiModel } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, CoreMessage, experimental_generateImage as generateImage } from 'npm:ai@6'
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
      { id: 'auto', name: 'Auto (Best/Cheapest)', provider: 'auto', modality: 'text', costCategory: 'cheap' }
    ]
  }

  private getClient() {
    return createOpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY') || '',
    })
  }

  private mapMessages(system?: string, genericMessages: GatewayMessage[] = []): CoreMessage[] {
    const msgs: CoreMessage[] = []
    if (system) msgs.push({ role: 'system', content: system })
    
    for (const msg of genericMessages) {
      if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
        msgs.push(msg as CoreMessage)
      }
    }
    return msgs
  }

  private resolveModelName(modelPref?: string) {
    if (!modelPref || modelPref === 'auto') return 'gpt-4o-mini' // Default auto logic
    return modelPref.split('/')[1] || 'gpt-4o-mini'
  }

  async generateText(req: StandardTextRequest) {
    const openai = this.getClient()
    const result = await generateText({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      temperature: req.temperature ?? 0.7,
      maxTokens: req.maxTokens
    })
    return { text: result.text, usage: result.usage }
  }

  async streamText(req: StandardTextRequest, hooks: StreamHooks) {
    const openai = this.getClient()
    const result = await streamText({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      temperature: req.temperature ?? 0.7,
      maxTokens: req.maxTokens
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
    return { text: fullText, usage }
  }

  async generateObject<T>(req: StandardTextRequest & { schema: z.ZodType<T> | Record<string, unknown>, schemaName?: string }) {
    const openai = this.getClient()
    
    const isJsonSchema = req.schema && typeof req.schema === 'object' && !('_def' in req.schema)
    const finalSchema = isJsonSchema 
      ? jsonSchema<T>(req.schemaName || 'response', req.schema as any)
      : (req.schema as z.ZodType<T>)

    const result = await generateObject({
      model: openai(this.resolveModelName(req.modelPreference)),
      messages: this.mapMessages(req.system, req.messages),
      schema: finalSchema,
      temperature: req.temperature ?? 0.7,
    })
    return { object: result.object as T, usage: result.usage }
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
