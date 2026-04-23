import { createClient } from 'npm:@supabase/supabase-js@2'

import { HttpError } from './http.ts'

export async function requireUserClient(request: Request, functionName: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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
