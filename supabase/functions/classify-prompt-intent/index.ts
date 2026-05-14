import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { classifyPromptIntentServer } from '../_shared/prompt-intent.ts'
import {
  promptIntentClassificationRequestSchema,
  promptIntentClassificationResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'classify-prompt-intent')
    const payload = promptIntentClassificationRequestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const classification = await classifyPromptIntentServer(payload)
    return json(promptIntentClassificationResponseSchema.parse({
      ok: true,
      classification,
    }))
  } catch (error) {
    return errorResponse(error, 'Prompt intent classification failed.')
  }
})
