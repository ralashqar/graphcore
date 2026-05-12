import { createClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from '../config/supabaseConfig'

function supabaseProjectRef() {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'local'
  } catch {
    return 'local'
  }
}

export const supabaseAuthStoragePrefix = `sb-${supabaseProjectRef()}-auth-token`

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export function isSupabaseAuthNetworkError(error: unknown) {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const message = [
    typeof record.message === 'string' ? record.message : '',
    typeof record.name === 'string' ? record.name : '',
    error instanceof Error ? error.message : '',
  ].join(' ').toLowerCase()

  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('authretryablefetcherror')
}

export function clearLocalSupabaseAuthState() {
  if (typeof window === 'undefined') return

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && key.startsWith(supabaseAuthStoragePrefix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) storage.removeItem(key)
  }
}

export async function clearLocalSupabaseSession() {
  clearLocalSupabaseAuthState()
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    clearLocalSupabaseAuthState()
  }
}

function hasAuthRedirectParams(url: URL, hashParams: URLSearchParams) {
  return url.searchParams.has('code')
    || url.searchParams.has('error')
    || url.searchParams.has('error_code')
    || url.searchParams.has('error_description')
    || hashParams.has('access_token')
    || hashParams.has('refresh_token')
    || hashParams.has('error')
    || hashParams.has('error_code')
    || hashParams.has('error_description')
}

function stripAuthRedirectParams(url: URL, hashParams: URLSearchParams) {
  const searchKeys = [
    'code',
    'access_token',
    'refresh_token',
    'expires_at',
    'expires_in',
    'provider_refresh_token',
    'provider_token',
    'token_type',
    'type',
    'error',
    'error_code',
    'error_description',
  ]
  for (const key of searchKeys) url.searchParams.delete(key)

  const hashKeys = [
    'access_token',
    'refresh_token',
    'expires_at',
    'expires_in',
    'provider_refresh_token',
    'provider_token',
    'token_type',
    'type',
    'error',
    'error_code',
    'error_description',
  ]
  for (const key of hashKeys) hashParams.delete(key)

  const nextHash = hashParams.toString()
  url.hash = nextHash ? `#${nextHash}` : ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export async function completeSupabaseAuthRedirectFromUrl() {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  if (!hasAuthRedirectParams(url, hashParams)) return null

  try {
    const errorDescription =
      url.searchParams.get('error_description')
      ?? hashParams.get('error_description')
      ?? url.searchParams.get('error')
      ?? hashParams.get('error')
    if (errorDescription) {
      throw new Error(errorDescription)
    }

    const code = url.searchParams.get('code')?.trim()
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      return data.session
    }

    const accessToken = hashParams.get('access_token')?.trim() || url.searchParams.get('access_token')?.trim()
    const refreshToken = hashParams.get('refresh_token')?.trim() || url.searchParams.get('refresh_token')?.trim()
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) throw error
      return data.session
    }

    return null
  } finally {
    stripAuthRedirectParams(url, hashParams)
  }
}
