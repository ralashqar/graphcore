import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runSceneBoardWorkflowCommand } from '../_shared/scene-board-workflow-command.ts'
import {
  legacyPayloadForWorkflowCommand,
  workflowCommandProxyResponseSchema,
  workflowCommandSchema,
} from '../../../src/domain/workflowCommandRegistry.ts'
import { sequenceAnimaticSceneBoardWorkflowCommandRequestSchema } from '../../../src/domain/outputWorkflow.ts'

function readErrorMessage(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const error = record.error
    if (typeof error === 'string' && error.trim()) return error.trim()
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message.trim()) return message.trim()
    }
    const message = record.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return ''
}

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

    const { endpoint, payload, parsed } = legacyPayloadForWorkflowCommand(command)
    if (parsed.family === 'scene_board' && (parsed.action === 'prepare_scene_board' || parsed.action === 'regenerate_scene_board_zone')) {
      const admin = createAdminClient('start-workflow-command')
      const body = await runSceneBoardWorkflowCommand({
        client: client as never,
        admin: admin as never,
        userId: user.id,
        payload: sequenceAnimaticSceneBoardWorkflowCommandRequestSchema.parse(payload),
        startedBy: 'start-workflow-command',
      })
      const { manifest: _manifest, ...normalizedCommand } = parsed
      return json(workflowCommandProxyResponseSchema.parse({
        ok: true,
        command: normalizedCommand,
        manifest: parsed.manifest,
        routedTo: parsed.manifest.templateKey,
        result: body,
      }))
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new HttpError(500, 'SUPABASE_URL is not configured.')

    const headers = new Headers({ 'content-type': 'application/json' })
    for (const header of ['authorization', 'apikey', 'x-client-info']) {
      const value = request.headers.get(header)
      if (value) headers.set(header, value)
    }

    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new HttpError(response.status, readErrorMessage(body) || `Workflow command route failed through ${endpoint}.`)
    }

    const { manifest: _manifest, ...normalizedCommand } = parsed
    return json(workflowCommandProxyResponseSchema.parse({
      ok: true,
      command: normalizedCommand,
      manifest: parsed.manifest,
      routedTo: endpoint,
      result: body,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start workflow command.')
  }
})
