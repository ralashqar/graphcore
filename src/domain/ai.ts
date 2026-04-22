export type OpenAiResponsesRequest = {
  model: string
  input: string | Array<Record<string, unknown>>
  instructions?: string
  temperature?: number
  maxOutputTokens?: number
  metadata?: Record<string, string>
  reasoning?: Record<string, unknown>
  text?: Record<string, unknown>
  tools?: Array<Record<string, unknown>>
  toolChoice?: string | Record<string, unknown>
  previousResponseId?: string
  store?: boolean
  extraBody?: Record<string, unknown>
}

export type OpenAiResponsesResult = {
  provider: 'openai'
  model: string
  responseId: string | null
  requestId: string | null
  outputText: string
  output: unknown[]
  usage: unknown
  raw: Record<string, unknown>
}

export type OpenAiImageBinaryInput = {
  data: string
  filename?: string
  mimeType: string
}

export type OpenAiImagesRequest = {
  action?: 'generate' | 'edit'
  model?: string
  prompt: string
  size?: string
  quality?: 'low' | 'medium' | 'high' | 'auto'
  background?: 'transparent' | 'opaque' | 'auto'
  moderation?: 'low' | 'auto'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
  n?: number
  images?: OpenAiImageBinaryInput[]
  mask?: OpenAiImageBinaryInput | null
  user?: string
  extraBody?: Record<string, unknown>
}

export type OpenAiImagesResult = {
  provider: 'openai'
  action: 'generate' | 'edit'
  model: string
  created: number | null
  requestId: string | null
  images: Array<{
    b64Json: string | null
    revisedPrompt: string | null
    url: string | null
  }>
  raw: Record<string, unknown>
}

export type FalAction = 'submit' | 'status' | 'result' | 'cancel' | 'subscribe'

export type FalInvokeRequest = {
  action?: FalAction
  model?: string
  input?: Record<string, unknown>
  requestId?: string
  statusUrl?: string
  responseUrl?: string
  cancelUrl?: string
  logs?: boolean
  webhookUrl?: string
  headers?: Record<string, string>
  startTimeout?: number
  hint?: string
  priority?: 'normal' | 'low'
  timeoutMs?: number
  pollIntervalMs?: number
}

export type FalInvokeResult = {
  provider: 'fal'
  action: FalAction
  model: string
  requestId: string | null
  statusUrl?: string | null
  responseUrl?: string | null
  cancelUrl?: string | null
  status?: string
  statusData?: Record<string, unknown>
  data: Record<string, unknown>
  error?: string
}
