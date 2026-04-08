import type {
  FalInvokeRequest,
  FalInvokeResult,
  OpenAiResponsesRequest,
  OpenAiResponsesResult,
} from '../domain/ai'
import { supabase } from '../utils/supabase'

function getInvokeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

export async function invokeOpenAiResponses(request: OpenAiResponsesRequest) {
  const response = await supabase.functions.invoke('ai-openai', {
    body: request,
  })

  if (response.error) {
    throw new Error(getInvokeErrorMessage(response.error, 'OpenAI request failed.'))
  }

  return response.data as OpenAiResponsesResult
}

export async function invokeFal(request: FalInvokeRequest) {
  const response = await supabase.functions.invoke('ai-fal', {
    body: request,
  })

  if (response.error) {
    throw new Error(getInvokeErrorMessage(response.error, 'Fal request failed.'))
  }

  return response.data as FalInvokeResult
}
