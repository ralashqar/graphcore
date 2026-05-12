import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, maybeHandleOptions } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    await requireUserClient(request, 'start-world-entity-icon-batch')
    throw new HttpError(
      410,
      'Legacy world entity icon-grid generation is disabled. Generate per-entity entity_reference_sheet visual jobs instead.',
    )
  } catch (error) {
    return errorResponse(error, 'World entity icon-grid generation is disabled.')
  }
})
