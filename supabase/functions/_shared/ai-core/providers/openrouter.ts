import { AiTextProvider, StandardTextRequest, StreamHooks, CoreMessage as GatewayMessage, AiModel } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, CoreMessage } from 'npm:ai@6'
import { createOpenRouter } from 'npm:@openrouter/ai-sdk-provider'
import { z } from 'npm:zod@4'

export class OpenRouterProvider implements AiTextProvider {
  id = 'openrouter'
  name = 'OpenRouter'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'openrouter/meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (OR)', provider: 'openrouter', modality: 'text', costCategory: 'cheap' },
      { id: 'openrouter/anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (OR)', provider: 'openrouter', modality: 'text', costCategory: 'expensive' },
      { id: 'openrouter/google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash (OR)', provider: 'openrouter', modality: 'text', costCategory: 'cheap' },
      { id: 'openrouter/deepseek/deepseek-r1', name: 'DeepSeek R1 (OR)', provider: 'openrouter', modality: 'text', costCategory: 'cheap' }
    ]
  }

  private getClient() {
    return createOpenRouter({
      apiKey: Deno.env.get('OPENROUTER_API_KEY') || '',
    })
  }

  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference
    if (raw.startsWith('openrouter/')) return raw.replace('openrouter/', '')
    if (raw === 'auto') return 'meta-llama/llama-3.3-70b-instruct'
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
