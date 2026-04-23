import '@supabase/functions-js/edge-runtime.d.ts'

import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { startWorldPromptTurn } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'start-world-prompt-turn')
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization token is required.')
    }
    const result = await startWorldPromptTurn({
      client,
      authHeader,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'World prompt turn failed.')
  }
})
