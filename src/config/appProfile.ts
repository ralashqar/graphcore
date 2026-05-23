export type GraphCoreAppProfile = 'full' | 'landing'

function normalizeAppProfile(value: unknown): GraphCoreAppProfile {
  return value === 'landing' ? 'landing' : 'full'
}

export const appProfile = normalizeAppProfile(import.meta.env.VITE_APP_PROFILE)
export const isLandingOnly = appProfile === 'landing'

export const waitlistSupabaseUrl = String(import.meta.env.VITE_WAITLIST_SUPABASE_URL ?? '').trim()
export const waitlistSupabasePublishableKey = String(import.meta.env.VITE_WAITLIST_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
export const waitlistFunctionName = String(import.meta.env.VITE_WAITLIST_FUNCTION_NAME ?? 'join-waitlist').trim() || 'join-waitlist'
export const waitlistTurnstileSiteKey = String(import.meta.env.VITE_WAITLIST_TURNSTILE_SITE_KEY ?? '').trim()
