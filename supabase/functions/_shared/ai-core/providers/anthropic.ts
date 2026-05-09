import { AiTextProvider, StandardTextRequest, StreamHooks, CoreMessage as GatewayMessage, AiModel } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, CoreMessage } from 'npm:ai@6'
import { createAnthropic } from 'npm:@ai-sdk/anthropic@3'
import { z } from 'npm:zod@4'

export class AnthropicProvider implements AiTextProvider {
  id = 'anthropic'
  name = 'Anthropic'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'anthropic/claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', modality: 'text', costCategory: 'expensive' },
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', modality: 'text', costCategory: 'expensive' },
      { id: 'anthropic/claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', provider: 'anthropic', modality: 'text', costCategory: 'expensive' },
      { id: 'anthropic/claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic', modality: 'text', costCategory: 'cheap' }
    ]
  }

  private getClient() {
    return createAnthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })
  }

  // Anthropic prefixes model string with provider id internally or expects just the model name
  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference
    if (raw.startsWith('anthropic/')) return raw.replace('anthropic/', '')
    if (raw === 'auto') return 'claude-3-5-haiku-latest' // fallback if auto isn't resolved by registry
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
