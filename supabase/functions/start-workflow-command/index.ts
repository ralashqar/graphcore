import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { assertWorkflowCommandHandlerCoverage, runWorkflowCommandHandler } from '../_shared/workflow-command-handlers.ts'
import {
  assertWorkflowCommandRouteCoverage,
  legacyPayloadForWorkflowCommand,
  workflowCommandProxyResponseSchema,
  workflowCommandSchema,
} from '../../../src/domain/workflowCommandRegistry.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-workflow-command')
    const command = workflowCommandSchema.parse(await request.json())
    if (!command.projectId || !command.draftId) {
      throw new HttpError(400, 'Workflow commands require projectId and draftId.')
    }

    assertWorkflowCommandRouteCoverage()
    assertWorkflowCommandHandlerCoverage()
    const { payload, parsed } = legacyPayloadForWorkflowCommand(command)
    const admin = createAdminClient('start-workflow-command')
    const body = await runWorkflowCommandHandler({
      client: client as never,
      admin: admin as never,
      userId: user.id,
      payload,
      parsed,
    })
    const { manifest: _manifest, ...normalizedCommand } = parsed
    return json(workflowCommandProxyResponseSchema.parse({
      ok: true,
      command: normalizedCommand,
      manifest: parsed.manifest,
      routedTo: parsed.manifest.templateKey,
      result: body,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start workflow command.')
  }
})
