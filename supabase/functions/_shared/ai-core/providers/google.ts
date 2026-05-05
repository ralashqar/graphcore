import { AiTextProvider, StandardTextRequest, StreamHooks, CoreMessage as GatewayMessage, AiModel } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, CoreMessage } from 'npm:ai@4'
import { createGoogleGenerativeAI } from 'npm:@ai-sdk/google@1'
import { z } from 'npm:zod@4'

export class GoogleProvider implements AiTextProvider {
  id = 'google'
  name = 'Google'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', modality: 'text', costCategory: 'expensive' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', modality: 'text', costCategory: 'cheap' }
    ]
  }

  private getClient() {
    return createGoogleGenerativeAI({
      apiKey: Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '',
    })
  }

  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference
    if (raw.startsWith('google/')) return raw.replace('google/', '')
    if (raw === 'auto') return 'gemini-2.5-flash' // fallback
    return raw
  }

  async generateText(req: StandardTextRequest): Promise<{ text: string; usage?: any }> {
    const result = await generateText({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as CoreMessage[],
      maxTokens: req.maxTokens,
    })
    const usage = await result.usage
    return { text: result.text, usage }
  }

  async generateObject(req: StandardTextRequest & { schema: z.ZodSchema<any>, schemaName?: string }): Promise<{ object: any; usage?: any }> {
    const result = await generateObject({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as CoreMessage[],
      maxTokens: req.maxTokens,
      schema: req.schema,
      schemaName: req.schemaName,
    })
    const usage = await result.usage
    return { object: result.object, usage }
  }

  async generateObjectRawSchema(req: StandardTextRequest & { rawSchema: any, schemaName?: string }): Promise<{ object: any; usage?: any }> {
    const result = await generateObject({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as CoreMessage[],
      maxTokens: req.maxTokens,
      schema: jsonSchema(req.rawSchema, req.schemaName),
      schemaName: req.schemaName,
    })
    const usage = await result.usage
    return { object: result.object, usage }
  }

  async streamText(req: StandardTextRequest, hooks: StreamHooks): Promise<{ text: string; usage?: any }> {
    const result = streamText({
      model: this.getClient()(this.resolveModelName(req)),
      system: req.system,
      messages: req.messages as CoreMessage[],
      maxTokens: req.maxTokens,
    })

    for await (const textPart of result.textStream) {
      hooks.onChunk?.(textPart)
    }

    const text = await result.text
    const usage = await result.usage
    return { text, usage }
  }
}
