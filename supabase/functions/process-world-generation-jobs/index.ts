import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions, HttpError } from '../_shared/http.ts'
import { processWorldGenerationJobs } from '../_shared/world-prompt.ts'

function requireWorkerAuthorization(request: Request) {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!serviceRoleKey || token !== serviceRoleKey) {
    throw new HttpError(401, 'World generation worker authorization is required.')
  }
  return `Bearer ${serviceRoleKey}`
}

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const authHeader = requireWorkerAuthorization(request)
    const client = createAdminClient('process-world-generation-jobs')
    const result = await processWorldGenerationJobs({
      client,
      authHeader,
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'World generation worker failed.')
  }
})
