import type { AuthChangeEvent, Provider, Session } from '@supabase/supabase-js'

import { appRedirectUrl } from '../shared/appRoutes'
import { completeSupabaseAuthRedirectFromUrl, supabase } from '../utils/supabase'

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

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
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
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
