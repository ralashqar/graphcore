import { z } from 'npm:zod@^4.1.0'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { runTrackedOpenAiResponses } from '../_shared/ai-provider-gateway.ts'
import {
  loadCinematicDirectorContext,
} from '../_shared/cinematic-director-notes.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { extractOutputText } from '../_shared/openai.ts'
import { normalizeStrictJsonSchema } from '../_shared/structured-output.ts'
import {
  buildCinematicDirectorPatchPreview,
  buildFallbackCinematicDirectorPatch,
  cinematicDirectorNotePreviewRequestSchema,
  cinematicDirectorNotePreviewResponseSchema,
  cinematicDirectorPatchOperationSchema,
} from '../../../src/domain/cinematicDirectorNotes.ts'

const directorInterpreterSchema = z.object({
  status: z.enum(['preview', 'requires_scene_replan']).default('preview'),
  summary: z.string().default(''),
  operations: z.array(cinematicDirectorPatchOperationSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
})

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return {}
    return JSON.parse(match[0])
  }
}

function outputWorkflowTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')
    ?? Deno.env.get('OPENAI_OUTPUT_WORKFLOW_TEXT_MODEL')
    ?? 'gpt-5.4'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'preview-output-cinematic-director-note')
    const admin = createAdminClient('preview-output-cinematic-director-note')
    const payload = cinematicDirectorNotePreviewRequestSchema.parse(await request.json())
    const context = await loadCinematicDirectorContext(client as never, payload)
    const fallbackOperations = buildFallbackCinematicDirectorPatch({
      note: payload.note,
      scope: payload.scope,
      shotPlan: context.shotPlan,
    })
    let interpreted = directorInterpreterSchema.parse({
      status: 'preview',
      summary: '',
      operations: fallbackOperations,
      diagnostics: ['Used deterministic director-note fallback.'],
    })
    let aiUsage: Record<string, unknown> | null = null

    const prompt = [
      'Interpret the user director note into structured Cinematics V2 graph patch operations.',
      'Do not edit image or video prompts directly. Mutate shot plan, scene state, layout plan, timing, or regeneration markers.',
      'Do not add, delete, split, or reorder shots in this version. If the note requires that, return status requires_scene_replan and no destructive operations.',
      'Prefer shot-level updates for shot scopes. Use scene_state/layout updates only when the note changes global lighting, weather, location, spatial geography, or continuity.',
      '',
      `Scope: ${JSON.stringify(payload.scope)}`,
      `Director note: ${payload.note}`,
      '',
      `Shot plan JSON: ${JSON.stringify(context.shotPlan).slice(0, 24000)}`,
      `Scene state JSON: ${JSON.stringify(context.sceneState ?? {}).slice(0, 8000)}`,
      `Layout plan JSON: ${JSON.stringify(context.layoutPlan ?? {}).slice(0, 8000)}`,
    ].join('\n')

    try {
      const response = await runTrackedOpenAiResponses({
        client: admin,
        chargeCredits: false,
        context: {
          userId: user.id,
          projectId: payload.projectId,
          draftId: payload.draftId,
          outputWorkflowId: payload.workflowId,
          outputWorkflowRunId: payload.runId ?? null,
          surface: 'output_cinematic_director_note',
          idempotencyKey: `director-note-preview:${payload.workflowId}:${payload.runId ?? 'no-run'}:${payload.note}:${JSON.stringify(payload.scope)}`,
        },
        payload: {
          model: outputWorkflowTextModel(),
          instructions: 'You are GraphCore/SynArc Director Notes. Return strict JSON only.',
          input: prompt,
          text: {
            format: {
              type: 'json_schema',
              name: 'output_cinematic_director_note_preview',
              schema: normalizeStrictJsonSchema(z.toJSONSchema(directorInterpreterSchema)),
              strict: true,
            },
          },
          maxOutputTokens: 2600,
          timeoutMs: 120_000,
          metadata: {
            graphcore_task: 'output_cinematic_director_note_preview',
            workflow_id: payload.workflowId,
          },
        },
      })
      aiUsage = response.usageLine as unknown as Record<string, unknown> | null
      if (response.response.ok) {
        interpreted = directorInterpreterSchema.parse(parseJsonObject(extractOutputText(response.body)))
      }
    } catch (error) {
      console.warn('[preview-output-cinematic-director-note] AI interpretation failed; using fallback.', error)
    }

    const preview = buildCinematicDirectorPatchPreview({
      note: payload.note,
      scope: payload.scope,
      shotPlan: context.shotPlan,
      sceneState: context.sceneState,
      layoutPlan: context.layoutPlan,
      nodes: context.nodes,
      operations: interpreted.operations.length > 0 ? interpreted.operations : fallbackOperations,
      status: interpreted.status,
      summary: interpreted.summary,
      diagnostics: interpreted.diagnostics,
    })

    return json(cinematicDirectorNotePreviewResponseSchema.parse({
      ok: true,
      preview,
      aiUsage,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to preview cinematic director note.')
  }
})
