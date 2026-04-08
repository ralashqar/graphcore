import { createClient } from 'npm:@supabase/supabase-js@2'

import { HttpError } from './http.ts'

export async function requireUserClient(request: Request, functionName: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const authHeader = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !authHeader) {
    throw new HttpError(500, `Supabase environment is incomplete for ${functionName}.`)
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    throw new HttpError(401, 'User context is required to access this AI function.')
  }

  return { client, user }
}
