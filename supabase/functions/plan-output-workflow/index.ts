import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { planOutputWorkflowFromRequest } from '../_shared/output-workflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    await requireUserClient(request, 'plan-output-workflow')
    return json(planOutputWorkflowFromRequest(await request.json()))
  } catch (error) {
    return errorResponse(error, 'Failed to plan output workflow.')
  }
})
