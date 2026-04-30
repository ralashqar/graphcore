import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { cancelWorldGenerationJob } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'cancel-world-generation-job')
    const result = await cancelWorldGenerationJob({
      client,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Cancelling world generation failed.')
  }
})
