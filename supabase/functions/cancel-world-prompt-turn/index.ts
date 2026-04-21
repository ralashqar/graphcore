import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { cancelWorldPromptTurn } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireUserClient(request, 'cancel-world-prompt-turn')
    const result = await cancelWorldPromptTurn({
      client,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Cancelling the world prompt turn failed.')
  }
})
