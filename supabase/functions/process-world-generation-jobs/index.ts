import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions, HttpError } from '../_shared/http.ts'
import { processWorldGenerationJobs } from '../_shared/world-prompt.ts'

function requireWorkerAuthorization(request: Request) {
  // Accept both the new secret key and the legacy service_role JWT so callers
  // can migrate without a coordinated cutover.
  const acceptedKeys = [
    Deno.env.get('SB_SECRET_KEY')?.trim(),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
  ].filter((key): key is string => Boolean(key))
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (acceptedKeys.length === 0 || !acceptedKeys.includes(token)) {
    throw new HttpError(401, 'World generation worker authorization is required.')
  }
  return `Bearer ${acceptedKeys[0]}`
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
