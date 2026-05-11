import { AiTextProvider, StandardTextRequest, StreamHooks, CoreMessage as GatewayMessage, AiModel, ProviderCapability } from '../registry.ts'
import { generateText, streamText, generateObject, jsonSchema, ModelMessage } from 'npm:ai@6'
import { createGroq } from 'npm:@ai-sdk/groq@3'
import { z } from 'npm:zod@4'

export class GroqProvider implements AiTextProvider {
  id = 'groq'
  name = 'Groq'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['text']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', modality: 'text', costCategory: 'cheap' },
      { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', modality: 'text', costCategory: 'cheap' },
      { id: 'groq/moonshotai/kimi-k2-instruct', name: 'Kimi K2 Instruct', provider: 'groq', modality: 'text', costCategory: 'cheap' },
      { id: 'groq/deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', provider: 'groq', modality: 'text', costCategory: 'cheap' }
    ]
  }

  getCapabilities(): ProviderCapability[] {
    return [{
      provider: this.id,
      modality: 'text',
      defaultModelId: 'groq/llama-3.1-8b-instant',
      modelIds: this.getAvailableModels().map((model) => model.id),
      costCategory: 'cheap',
      supportsStrictObjectOutput: true,
      supportsStreaming: true,
    }]
  }

  private getClient() {
    return createGroq({
      apiKey: Deno.env.get('GROQ_API_KEY') || '',
    })
  }

  private resolveModelName(req: StandardTextRequest): string {
    const raw = req.modelPreference ?? 'groq/llama-3.1-8b-instant'
    if (raw.startsWith('groq/')) return raw.replace('groq/', '')
    if (raw === 'auto') return 'llama-3.3-70b-versatile' // default fast free model
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
