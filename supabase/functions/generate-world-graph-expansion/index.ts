import '@supabase/functions-js/edge-runtime.d.ts'

import { worldGraphExpansionRequestSchema } from '../../../src/domain/worldGraph.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { generateExpansionPlan, persistWorldGraphPlan } from '../_shared/world-graph.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = worldGraphExpansionRequestSchema.parse(await request.json())
    const { client } = await requireUserClient(request, 'generate-world-graph-expansion')
    const plan = await generateExpansionPlan(payload)
    await persistWorldGraphPlan({
      client,
      draftId: payload.snapshot.draft.id,
      plan,
    })
    return json({
      ok: true,
      requestSummary: plan.requestSummary,
      assistantNote: plan.assistantNote,
    })
  } catch (error) {
    return errorResponse(error, 'World expansion generation failed.')
  }
})
