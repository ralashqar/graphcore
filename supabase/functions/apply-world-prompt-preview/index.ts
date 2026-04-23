import '@supabase/functions-js/edge-runtime.d.ts'

import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { applyWorldPromptPreview } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'apply-world-prompt-preview')
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization token is required.')
    }
    const result = await applyWorldPromptPreview({
      client,
      authHeader,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Applying the world prompt preview failed.')
  }
})
