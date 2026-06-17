import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runSequenceAnimaticKeyframeWorkflowsCommand } from '../_shared/sequence-animatic-keyframe-workflows-command.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-keyframe-workflows')
    const admin = createAdminClient('ensure-sequence-animatic-keyframe-workflows')
    const body = await runSequenceAnimaticKeyframeWorkflowsCommand({
      client: client as never,
      admin: admin as never,
      userId: user.id,
      payload: await request.json(),
    })
    return json(body)
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic keyframe workflows.')
  }
})
