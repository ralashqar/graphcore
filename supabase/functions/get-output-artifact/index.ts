import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputArtifactRow,
  outputArtifactResponseSchema,
  outputArtifactSelect,
} from '../_shared/output-workflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-output-artifact')
    const payload = await request.json() as Record<string, unknown>
    const artifactId = typeof payload.artifactId === 'string' ? payload.artifactId : ''
    const artifactKey = typeof payload.artifactKey === 'string' ? payload.artifactKey : ''
    if (!artifactId && !artifactKey) throw new HttpError(400, 'artifactId or artifactKey is required.')
    let query = client.from('output_artifacts').select(outputArtifactSelect)
    query = artifactId ? query.eq('id', artifactId) : query.eq('key', artifactKey)
    const response = await query.maybeSingle()
    if (response.error) throw new Error(response.error.message)
    return json(outputArtifactResponseSchema.parse({
      ok: true,
      artifact: response.data ? mapOutputArtifactRow(response.data) : null,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load output artifact.')
  }
})
