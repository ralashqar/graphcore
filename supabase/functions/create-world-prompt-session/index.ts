import '@supabase/functions-js/edge-runtime.d.ts'

import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { createWorldPromptSession } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'create-world-prompt-session')
    const result = await createWorldPromptSession({
      client,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Creating the world prompt session failed.')
  }
})
