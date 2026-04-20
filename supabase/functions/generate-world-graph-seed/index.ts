import '@supabase/functions-js/edge-runtime.d.ts'

import { worldGraphSeedRequestSchema } from '../../../src/domain/worldGraph.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, json, maybeHandleOptions } from '../_shared/http.ts'
import { generateSeedPlan, persistWorldGraphPlan } from '../_shared/world-graph.ts'

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    const payload = worldGraphSeedRequestSchema.parse(await request.json())
    const { client } = await requireUserClient(request, 'generate-world-graph-seed')
    const plan = await generateSeedPlan(payload)
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
    return errorResponse(error, 'Starter world generation failed.')
  }
})
