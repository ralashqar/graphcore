import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { mapVisualGenerationJobRow, visualGenerationStartResponseSchema, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'
import { visualGenerationStartRequestSchema } from '../../../src/domain/visualGeneration.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-visual-generation-job')
    const payload = visualGenerationStartRequestSchema.parse(await request.json())

    const insertResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        status: 'queued',
        kind: payload.kind,
        provider: payload.provider,
        model: payload.model,
        target_keys: payload.targetKeys,
        input: payload.input,
        metadata: payload.metadata,
      })
      .select(visualJobSelect)
      .single()

    if (insertResponse.error) throw new Error(insertResponse.error.message)

    return json(visualGenerationStartResponseSchema.parse({
      ok: true,
      job: mapVisualGenerationJobRow(insertResponse.data as VisualGenerationJobRow),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start visual generation job.')
  }
})
