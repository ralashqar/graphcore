import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from '../config/supabaseConfig'

type SupabaseLockFunction = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>
type GraphCoreGlobal = typeof globalThis & {
  __graphcoreSupabaseClient?: SupabaseClient
}

const AUTH_FETCH_TIMEOUT_MS = 45_000
const EDGE_FUNCTION_FETCH_TIMEOUT_MS = 120_000
const DEFAULT_FETCH_TIMEOUT_MS = 60_000
const authProcessLocks = new Map<string, Promise<void>>()

function supabaseProjectRef() {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'local'
  } catch {
    return 'local'
  }
}

export const supabaseAuthStoragePrefix = `sb-${supabaseProjectRef()}-auth-token`

const supabaseAuthProcessLock: SupabaseLockFunction = async (name, _acquireTimeout, fn) => {
  const previous = authProcessLocks.get(name) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(fn)
  authProcessLocks.set(name, next.then(() => undefined, () => undefined))
  return next
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function timeoutForSupabaseRequest(input: RequestInfo | URL) {
  const url = requestUrl(input)
  if (url.includes('/functions/v1/')) return EDGE_FUNCTION_FETCH_TIMEOUT_MS
  if (url.includes('/auth/v1/')) return AUTH_FETCH_TIMEOUT_MS
  return DEFAULT_FETCH_TIMEOUT_MS
}

function abortWithReason(controller: AbortController, reason: unknown) {
  if (controller.signal.aborted) return
  controller.abort(reason instanceof Error ? reason : new Error(String(reason || 'Supabase request was aborted.')))
}

const supabaseFetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const timeoutMs = timeoutForSupabaseRequest(input)
  const timeoutId = globalThis.setTimeout(
    () => abortWithReason(controller, `Supabase request timed out after ${timeoutMs}ms.`),
    timeoutMs,
  )
  const upstreamSignal = init?.signal

  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortWithReason(controller, upstreamSignal.reason ?? 'Supabase request was cancelled by the caller.')
    else {
      upstreamSignal.addEventListener(
        'abort',
        () => abortWithReason(controller, upstreamSignal.reason ?? 'Supabase request was cancelled by the caller.'),
        { once: true },
      )
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

const graphCoreGlobal = globalThis as GraphCoreGlobal

export const supabase = graphCoreGlobal.__graphcoreSupabaseClient ?? createClient(supabaseUrl, supabasePublishableKey, {
  db: {
    timeout: 30_000,
  },
  global: {
    fetch: supabaseFetchWithTimeout,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: supabaseAuthProcessLock,
  },
})

graphCoreGlobal.__graphcoreSupabaseClient = supabase

export function isSupabaseAuthLockError(error: unknown) {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const message = [
    typeof record.message === 'string' ? record.message : '',
    typeof record.name === 'string' ? record.name : '',
    error instanceof Error ? error.message : '',
  ].join(' ').toLowerCase()

  return message.includes('lockacquiretimeouterror')
    || message.includes('navigatorlockacquiretimeouterror')
    || message.includes('auth-token')
    || message.includes('another request stole it')
    || message.includes('lock was released')
}

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
    || message.includes('aborterror')
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
