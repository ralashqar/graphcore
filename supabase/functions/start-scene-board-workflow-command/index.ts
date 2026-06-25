import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runSceneBoardWorkflowCommand } from '../_shared/scene-board-workflow-command.ts'
import { sequenceAnimaticSceneBoardWorkflowCommandRequestSchema } from '../../../src/domain/outputWorkflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-scene-board-workflow-command')
    const admin = createAdminClient('start-scene-board-workflow-command')
    const payload = sequenceAnimaticSceneBoardWorkflowCommandRequestSchema.parse(await request.json())
    const result = await runSceneBoardWorkflowCommand({
      client: client as never,
      admin: admin as never,
      userId: user.id,
      payload,
      startedBy: 'start-scene-board-workflow-command',
    })
    return json(result)
  } catch (error) {
    return errorResponse(error, 'Failed to start Scene Board workflow command.')
  }
})
