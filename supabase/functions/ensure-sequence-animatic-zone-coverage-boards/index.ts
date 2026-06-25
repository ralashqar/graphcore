import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  runSequenceAnimaticZoneCoverageBoardsCommand,
  ZoneCoverageHttpError,
} from '../_shared/sequence-animatic-zone-coverage-boards-command.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-zone-coverage-boards')
    const admin = createAdminClient('ensure-sequence-animatic-zone-coverage-boards')
    const body = await runSequenceAnimaticZoneCoverageBoardsCommand({
      client: client as never,
      admin: admin as never,
      userId: user.id,
      payload: await request.json(),
    })
    return json(body)
  } catch (error) {
    if (error instanceof ZoneCoverageHttpError) {
      return json({ error: error.message, details: error.details }, { status: error.status })
    }
    return errorResponse(error, 'Failed to ensure sequence animatic zone camera grids.')
  }
})
