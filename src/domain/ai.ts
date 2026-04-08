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

export type FalAction = 'submit' | 'status' | 'result' | 'cancel' | 'subscribe'

export type FalInvokeRequest = {
  action?: FalAction
  model?: string
  input?: Record<string, unknown>
  requestId?: string
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
  status?: string
  statusData?: Record<string, unknown>
  data: Record<string, unknown>
  error?: string
}
