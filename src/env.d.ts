interface ImportMetaEnv {
  readonly VITE_APP_PROFILE?: 'full' | 'landing'
  readonly VITE_PUBLIC_SITE_URL?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string
  readonly VITE_WAITLIST_SUPABASE_URL?: string
  readonly VITE_WAITLIST_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_WAITLIST_FUNCTION_NAME?: string
  readonly VITE_WAITLIST_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
