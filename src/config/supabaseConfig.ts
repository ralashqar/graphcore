const DEFAULT_SUPABASE_URL = 'https://znwdatidqdkzidempvkt.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5EkU5knI16oAgqxPMYPxnw_Sb8QOgdS'

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL

export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY
