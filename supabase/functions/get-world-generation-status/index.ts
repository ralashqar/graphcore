import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { getWorldGenerationStatus } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'get-world-generation-status')
    const result = await getWorldGenerationStatus({
      client,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Loading world generation status failed.')
  }
})
