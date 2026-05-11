import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import {
  applyCinematicDirectorPatchToWorkflow,
  loadCinematicDirectorContext,
} from '../_shared/cinematic-director-notes.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  cinematicDirectorPatchApplyRequestSchema,
  cinematicDirectorPatchApplyResponseSchema,
} from '../../../src/domain/cinematicDirectorNotes.ts'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeApplyPayload(raw: unknown): Record<string, unknown> {
  const payload = readRecord(raw)
  const previewResponse = readRecord(payload.previewResponse)
  const request = readRecord(payload.request)
  const normalizedPreview =
    payload.preview
    ?? payload.directorPreview
    ?? payload.patchPreview
    ?? previewResponse.preview
    ?? request.preview
  return {
    ...payload,
    preview: normalizedPreview,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'apply-output-cinematic-director-patch')
    const payload = cinematicDirectorPatchApplyRequestSchema.parse(normalizeApplyPayload(await request.json()))
    if (payload.preview.status === 'requires_scene_replan') {
      throw new HttpError(400, 'This director note requires a scene replan before it can be applied.')
    }
    const context = await loadCinematicDirectorContext(client as never, payload)
    const admin = createAdminClient('apply-output-cinematic-director-patch')
    const applied = await applyCinematicDirectorPatchToWorkflow({
      client: admin as never,
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
