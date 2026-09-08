import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { runTrackedOpenAiResponses } from '../../supabase/functions/_shared/ai-provider-gateway.ts'
// The gateway's narrow repository port declares Promise while Supabase returns
// an awaitable PostgrestBuilder. Both execute the same awaited operations.
export function usageClient(admin: SupabaseClient) {
  return admin as unknown as NonNullable<Parameters<typeof runTrackedOpenAiResponses>[0]['client']>
}
