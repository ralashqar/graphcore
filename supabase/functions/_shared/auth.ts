import { createClient } from 'npm:@supabase/supabase-js@2'

import { HttpError } from './http.ts'

// New-style API keys (sb_secret_/sb_publishable_) are provided as custom function
// secrets because the platform-injected SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY
// stop working once legacy JWT-based API keys are disabled for the project.
export function resolveServiceRoleKey() {
  return Deno.env.get('SB_SECRET_KEY')?.trim() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

export function resolvePublishableKey() {
  return Deno.env.get('SB_PUBLISHABLE_KEY')?.trim() || Deno.env.get('SUPABASE_ANON_KEY')
}

export async function requireUserClient(request: Request, functionName: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = resolvePublishableKey()
  const authHeader = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey) {
    throw new HttpError(500, `Supabase environment is incomplete for ${functionName}.`)
  }

  if (!authHeader) {
    throw new HttpError(401, 'Authorization token is required.')
  }

  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken) {
    throw new HttpError(401, 'Authorization token is required.')
  }

  const admin = createAdminClient(functionName)
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken)

  if (error || !user) {
    throw new HttpError(401, 'User context is required to access this function.')
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return { client, user }
}

export async function requireAuthedAdminClient(request: Request, functionName: string) {
  const { user } = await requireUserClient(request, functionName)
  const client = createAdminClient(functionName)
  return { client, user }
}

export function createAdminClient(functionName: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = resolveServiceRoleKey()

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError(500, `Supabase service role environment is incomplete for ${functionName}.`)
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
