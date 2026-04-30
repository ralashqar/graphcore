import { requireAuthedAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { continueWorldSeedGeneration } from '../_shared/world-prompt.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = await request.json()
    const { client } = await requireAuthedAdminClient(request, 'continue-world-seed-generation')
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization token is required.')
    }
    const result = await continueWorldSeedGeneration({
      client,
      authHeader,
      payload,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'World seed generation failed.')
  }
})
