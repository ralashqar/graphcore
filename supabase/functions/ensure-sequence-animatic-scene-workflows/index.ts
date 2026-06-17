import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runSequenceAnimaticSceneWorkflowCommand } from '../_shared/sequence-animatic-scene-workflow-command.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    await requireUserClient(request, 'ensure-sequence-animatic-scene-workflows')
    const admin = createAdminClient('ensure-sequence-animatic-scene-workflows')
    const body = await runSequenceAnimaticSceneWorkflowCommand({
      admin: admin as never,
      payload: await request.json(),
    })
    return json(body)
  } catch (error) {
    return errorResponse(error)
  }
})
