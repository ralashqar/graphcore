import '@supabase/functions-js/edge-runtime.d.ts'

import {
  resetProjectWorldRequestSchema,
  resetProjectWorldResponseSchema,
} from '../../../src/domain/worldGraph.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type DraftRow = {
  id: string
  project_id: string
}

async function verifyDraftAccess(client: Awaited<ReturnType<typeof requireUserClient>>['client'], projectId: string, draftId: string) {
  const response = await client
    .from('project_drafts')
    .select('id, project_id')
    .eq('id', draftId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (response.error) {
    throw new Error(response.error.message)
  }

  if (!response.data) {
    throw new HttpError(404, 'The selected project draft was not found or is not accessible.')
  }

  return response.data as DraftRow
}
Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { client } = await requireUserClient(request, 'reset-project-world')
    const payload = resetProjectWorldRequestSchema.parse(await request.json())
    await verifyDraftAccess(client, payload.projectId, payload.draftId)

    const admin = createAdminClient('reset-project-world')
    const rpcResponse = await admin.rpc('reset_project_world', {
      target_project_id: payload.projectId,
      target_draft_id: payload.draftId,
    })

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message)
    }

    return json(resetProjectWorldResponseSchema.parse({
      ok: true,
      projectId: payload.projectId,
      draftId: payload.draftId,
      deleted: rpcResponse.data ?? {},
    }))
  } catch (error) {
    return errorResponse(error, 'Resetting the project world failed.')
  }
})
