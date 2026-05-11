import { AiTextProvider, StandardTextRequest, StreamHooks, CoreMessage as GatewayMessage, AiModel, ProviderCapability } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, ModelMessage } from 'npm:ai@6'
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

  getCapabilities(): ProviderCapability[] {
    return [{
      provider: this.id,
      modality: 'text',
      defaultModelId: 'anthropic/claude-3-5-haiku-latest',
      modelIds: this.getAvailableModels().map((model) => model.id),
      costCategory: 'expensive',
      supportsStrictObjectOutput: true,
      supportsStreaming: true,
    }]
  }

  private getClient() {
    return createAnthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })
  }

  // Anthropic prefixes model string with provider id internally or expects just the model name
  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference ?? 'anthropic/claude-3-5-haiku-latest'
    if (raw.startsWith('anthropic/')) return raw.replace('anthropic/', '')
    if (raw === 'auto') return 'claude-3-5-haiku-latest' // fallback if auto isn't resolved by registry
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
}
