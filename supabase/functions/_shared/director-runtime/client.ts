// Match the shared auth import; the worker import map pins this dependency.
// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveServiceRoleKey } from '../auth.ts'
/** Bound database and storage requests without changing the legacy worker client. */
export function createDirectorClient() {
  const url = Deno.env.get('SUPABASE_URL'), key = resolveServiceRoleKey()
  if (!url || !key) throw new Error('Director Supabase service credentials are missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(String(input).includes('/storage/') ? 90000 : 20000)
        const existing = init?.signal ?? (input instanceof Request ? input.signal : null)
        return fetch(input, { ...init, signal: existing ? AbortSignal.any([existing, timeout]) : timeout })
      },
    },
  })
}
