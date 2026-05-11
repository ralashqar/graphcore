import { requireUserClient } from '../_shared/auth.ts'
import {
  applyCinematicDirectorPatchToWorkflow,
  loadCinematicDirectorContext,
} from '../_shared/cinematic-director-notes.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  cinematicDirectorPatchApplyRequestSchema,
  cinematicDirectorPatchApplyResponseSchema,
} from '../../../src/domain/cinematicDirectorNotes.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'apply-output-cinematic-director-patch')
    const payload = cinematicDirectorPatchApplyRequestSchema.parse(await request.json())
    if (payload.preview.status === 'requires_scene_replan') {
      throw new HttpError(400, 'This director note requires a scene replan before it can be applied.')
    }
    const context = await loadCinematicDirectorContext(client as never, payload)
    const applied = await applyCinematicDirectorPatchToWorkflow({
      client: client as never,
      context,
      preview: payload.preview,
      userId: user.id,
    })
    return json(cinematicDirectorPatchApplyResponseSchema.parse({
      ok: true,
      ...applied,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to apply cinematic director patch.')
  }
})
