import type {
  FalInvokeRequest,
  FalInvokeResult,
  OpenAiResponsesRequest,
  OpenAiResponsesResult,
} from '../domain/ai'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'

function getInvokeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

async function invokeAuthedFunction<TResponse>(functionName: string, body: Record<string, unknown>, session: Session) {
  return supabase.functions.invoke<TResponse>(functionName, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
}

export async function invokeOpenAiResponses(request: OpenAiResponsesRequest) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Sign in before invoking OpenAI through Supabase.')
  }

  const response = await invokeAuthedFunction<OpenAiResponsesResult>('ai-openai', request, session)

  if (response.error) {
    throw new Error(getInvokeErrorMessage(response.error, 'OpenAI request failed.'))
  }

  return response.data as OpenAiResponsesResult
}

export async function invokeFal(request: FalInvokeRequest) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Sign in before invoking Fal through Supabase.')
  }

  const response = await invokeAuthedFunction<FalInvokeResult>('ai-fal', request, session)

  if (response.error) {
    throw new Error(getInvokeErrorMessage(response.error, 'Fal request failed.'))
  }

  return response.data as FalInvokeResult
}
