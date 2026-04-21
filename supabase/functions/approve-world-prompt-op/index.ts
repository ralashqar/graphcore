import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { approveWorldPromptOp } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireUserClient(request, 'approve-world-prompt-op')
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization token is required.')
    }
    const result = await approveWorldPromptOp({
      client,
      authHeader,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Approving the world prompt op failed.')
  }
})
