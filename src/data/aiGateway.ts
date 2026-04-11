import type {
  FalInvokeRequest,
  FalInvokeResult,
  OpenAiResponsesRequest,
  OpenAiResponsesResult,
} from '../domain/ai'
import type { FunctionsHttpError, Session } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'

function getInvokeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

async function readFunctionsErrorMessage(error: FunctionsHttpError | Error, fallback: string) {
  if (!('context' in error)) {
    return getInvokeErrorMessage(error, fallback)
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return getInvokeErrorMessage(error, fallback)
  }

  try {
    const payload = await context.clone().json() as { error?: string }
    return payload.error ?? getInvokeErrorMessage(error, fallback)
  } catch {
    try {
      const text = await context.clone().text()
      return text || getInvokeErrorMessage(error, fallback)
    } catch {
      return getInvokeErrorMessage(error, fallback)
    }
  }
}

function isUnauthorizedFunctionsError(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return false
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  return context instanceof Response && context.status === 401
}

async function getRequiredSession(signInMessage: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (!session) {
    throw new Error(signInMessage)
  }

  return session
}

async function invokeAuthedFunction<TResponse>(functionName: string, body: Record<string, unknown>, session: Session) {
  return supabase.functions.invoke<TResponse>(functionName, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
}

async function invokeWithSessionRecovery<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  signInMessage: string,
  failureMessage: string,
) {
  let session = await getRequiredSession(signInMessage)
  let response = await invokeAuthedFunction<TResponse>(functionName, body, session)

  if (response.error && isUnauthorizedFunctionsError(response.error)) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      throw refreshed.error
    }

    if (!refreshed.data.session) {
      throw new Error(signInMessage)
    }

    session = refreshed.data.session
    response = await invokeAuthedFunction<TResponse>(functionName, body, session)
  }

  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error, failureMessage))
  }

  if (!response.data) {
    throw new Error(failureMessage)
  }

  return response.data
}

export async function invokeOpenAiResponses(request: OpenAiResponsesRequest) {
  return await invokeWithSessionRecovery<OpenAiResponsesResult>(
    'ai-openai',
    request,
    'Sign in before invoking OpenAI through Supabase.',
    'OpenAI request failed.',
  ) as OpenAiResponsesResult
}

export async function invokeFal(request: FalInvokeRequest) {
  return await invokeWithSessionRecovery<FalInvokeResult>(
    'ai-fal',
    request,
    'Sign in before invoking Fal through Supabase.',
    'Fal request failed.',
  ) as FalInvokeResult
}
