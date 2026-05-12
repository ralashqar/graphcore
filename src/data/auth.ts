import type { AuthChangeEvent, Provider, Session } from '@supabase/supabase-js'

import { appRedirectUrl } from '../shared/appRoutes'
import {
  clearLocalSupabaseSession,
  completeSupabaseAuthRedirectFromUrl,
  isSupabaseAuthNetworkError,
  supabase,
} from '../utils/supabase'

let authRedirectHandled = false

async function completeAuthRedirectOnce() {
  if (authRedirectHandled) return
  authRedirectHandled = true
  try {
    await completeSupabaseAuthRedirectFromUrl()
  } catch (error) {
    console.warn('[GraphCore] Supabase auth redirect could not be completed.', error)
  }
}

export async function getCurrentSession() {
  await completeAuthRedirectOnce()

  let session: Session | null = null
  let error: Error | null = null

  try {
    const result = await supabase.auth.getSession()
    session = result.data.session
    error = result.error
  } catch (sessionError) {
    if (!isSupabaseAuthNetworkError(sessionError)) {
      throw sessionError
    }

    console.warn('[GraphCore] Supabase auth session refresh failed during bootstrap; clearing local session.', sessionError)
    await clearLocalSupabaseSession()
    return null
  }

  if (error) {
    if (isSupabaseAuthNetworkError(error)) {
      console.warn('[GraphCore] Supabase auth session refresh failed during bootstrap; clearing local session.', error)
      await clearLocalSupabaseSession()
      return null
    }

    throw error
  }

  return session
}

export function subscribeToAuthChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return () => {
    data.subscription.unsubscribe()
  }
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return data
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: appRedirectUrl(),
    },
  })

  if (error) {
    throw error
  }

  return data
}

export async function sendMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: appRedirectUrl(),
    },
  })

  if (error) {
    throw error
  }
}

export async function resendSignupConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: appRedirectUrl(),
    },
  })

  if (error) {
    throw error
  }
}

const oauthScopes: Partial<Record<Provider, string>> = {
  apple: 'name email',
  discord: 'identify email',
  github: 'read:user user:email',
  google: 'email profile',
}

export async function signInWithOAuthProvider(provider: Provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: appRedirectUrl(),
      scopes: oauthScopes[provider],
    },
  })

  if (error) {
    throw error
  }

  return data
}

export async function signInWithGoogle() {
  return signInWithOAuthProvider('google')
}

export async function signOut() {
  let result: Awaited<ReturnType<typeof supabase.auth.signOut>>

  try {
    result = await supabase.auth.signOut()
  } catch (signOutError) {
    if (!isSupabaseAuthNetworkError(signOutError)) {
      throw signOutError
    }

    console.warn('[GraphCore] Supabase sign out failed over the network; clearing local session.', signOutError)
    await clearLocalSupabaseSession()
    return
  }

  const { error } = result

  if (error) {
    if (isSupabaseAuthNetworkError(error)) {
      console.warn('[GraphCore] Supabase sign out failed over the network; clearing local session.', error)
      await clearLocalSupabaseSession()
      return
    }

    throw error
  }
}

export async function signOutLocally() {
  await clearLocalSupabaseSession()
}
