import { z } from 'zod'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { rpc } from '../_shared/director-runtime/types.ts'
import { wakeDirector } from '../_shared/director-runtime/wake.ts'
Deno.serve(async (request) => {
  const options = maybeHandleOptions(request)
  if (options) return options
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    const { user } = await requireUserClient(request, 'director-recover')
    const input = z.object({ runId: z.string().uuid() }).parse(await request.json())
    const result = await rpc(createAdminClient('director-recover'), 'director_recover_job', {
      p_actor: user.id,
      p_run: input.runId,
    })
    void wakeDirector()
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Could not recover Director job')
  }
})
