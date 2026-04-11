import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses } from '../_shared/openai.ts'
import {
  augmentSnapshotForPrompting,
  buildPromptContext,
  CONTENT_PASS_ALLOWED_OPS,
  CONTENT_PASS_MAX_OPS,
  contentPassSystemPrompt,
  GRAPH_PASS_ALLOWED_OPS,
  GRAPH_PASS_MAX_OPS,
  graphPassSystemPrompt,
  repairOperations,
  validateOperations,
  validatePassOperations,
} from '../_shared/prompt-patch.ts'

const requestSchema = z.object({
  prompt: z.string().min(1),
  snapshot: z.object({
    workspace: z.object({ slug: z.string(), name: z.string() }),
    project: z.object({ id: z.string(), slug: z.string(), name: z.string(), summary: z.string().optional() }),
    draft: z.object({ id: z.string() }),
    definitions: z.array(z.record(z.string(), z.unknown())).default([]),
    archetypes: z.array(z.record(z.string(), z.unknown())).default([]),
    graphs: z.array(z.record(z.string(), z.unknown())).default([]),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  context: z.object({
    graphKey: z.string().nullable().optional(),
    nodeKey: z.string().nullable().optional(),
    edgeKey: z.string().nullable().optional(),
    target: z.enum(['graph', 'node', 'content']).nullable().optional(),
  }).optional(),
  targetMode: z.enum(['current_graph', 'new_graph', 'auto']).optional(),
  graphType: z.enum(['narrative_flow', 'quest_flow', 'system_graph']).optional(),
  model: z.string().min(1),
})

const modelResponseSchema = z.object({
  summary: z.string().default('Generated GraphCore patch proposal.'),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
  operations: z.array(z.record(z.string(), z.unknown())).default([]),
})

type PromptRequest = z.infer<typeof requestSchema>

type PromptPatchHttpResponse = {
  summary: string
  operations: Array<Record<string, unknown>>
  diagnostics: string[]
  assistantNotes?: string
  debugRawOutput?: string
}

type PromptPassSuccess = {
  ok: true
  summary: string
  assistantNotes?: string
  modelDiagnostics: string[]
  operations: Array<Record<string, unknown>>
}

type PromptPassFailure = {
  ok: false
  response: PromptPatchHttpResponse
}

function inferGraphIntentFromPrompt(payload: PromptRequest) {
  const normalized = payload.prompt.toLowerCase()
  const asksForGraph =
    /\b(graph|node|edge|branch|choice node|story node|narrative flow|quest flow|system graph)\b/.test(normalized)
    || /\bcreate a new .*graph\b/.test(normalized)
  const asksForNewGraph =
    /\b(create|build|generate|make)\b/.test(normalized) && /\bnew\b/.test(normalized) && /\bgraph\b/.test(normalized)

  let inferredGraphType: 'narrative_flow' | 'quest_flow' | 'system_graph' | undefined
  if (/\bquest\b/.test(normalized)) {
    inferredGraphType = 'quest_flow'
  } else if (/\bsystem\b/.test(normalized)) {
    inferredGraphType = 'system_graph'
  } else if (/\bnarrative\b|\bstory\b|\bscene\b/.test(normalized)) {
    inferredGraphType = 'narrative_flow'
  }

  return {
    asksForGraph,
    asksForNewGraph,
    inferredGraphType,
  }
}

function extractJsonBlock(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```([\s\S]*?)```/i)
    if (!fencedMatch?.[1]) return null
    try {
      return JSON.parse(fencedMatch[1].trim()) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function previewText(text: string, maxLength = 1200) {
  const normalized = text.trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function prefixDiagnostics(passLabel: string, diagnostics: string[]) {
  return diagnostics.map((diagnostic) => `${passLabel}: ${diagnostic}`)
}

function combineAssistantNotes(...notes: Array<string | undefined>) {
  return notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0).join('\n\n')
}

function requiresGraphPass(payload: PromptRequest) {
  const inferredIntent = inferGraphIntentFromPrompt(payload)
  return Boolean(
    payload.targetMode === 'new_graph'
      || payload.targetMode === 'current_graph'
      || payload.graphType
      || payload.context?.target === 'graph'
      || payload.context?.target === 'node'
      || payload.context?.graphKey
      || inferredIntent.asksForGraph,
  )
}

async function persistPatchSet(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  userId: string,
  payload: PromptPatchHttpResponse,
  prompt: string,
  status: 'proposed' | 'rejected',
) {
  await client.from('patch_sets').insert({
    draft_id: draftId,
    prompt,
    summary: payload.summary,
    status,
    operations: payload.operations,
    diagnostics: payload.diagnostics,
    created_by: userId,
  })
}

async function runPromptPass({
  payload,
  passLabel,
  systemText,
  promptContext,
  validationSnapshot,
  allowedOps,
  maxOperations,
  maxOutputTokens,
}: {
  payload: PromptRequest
  passLabel: string
  systemText: string
  promptContext: Record<string, unknown>
  validationSnapshot: Record<string, unknown>
  allowedOps: Set<string>
  maxOperations: number
  maxOutputTokens: number
}): Promise<PromptPassSuccess | PromptPassFailure> {
    const aiResponse = await runOpenAiResponses({
      model: payload.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemText }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(promptContext, null, 2) }] },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
      reasoning: { effort: 'low' },
    metadata: { feature: 'prompt-patch', pass: passLabel, target_mode: payload.targetMode ?? 'auto' },
    store: false,
    maxOutputTokens,
  })

  if (!aiResponse.response.ok) {
    console.error(`[prompt-patch] ${passLabel} upstream OpenAI request failed`, {
      model: payload.model,
      status: aiResponse.response.status,
      requestId: aiResponse.response.headers.get('x-request-id'),
      body: aiResponse.body,
    })

    const upstreamMessage =
      typeof aiResponse.body.error === 'object' && aiResponse.body.error !== null
        ? ((aiResponse.body.error as { message?: string }).message ?? 'OpenAI request failed.')
        : 'OpenAI request failed.'

    return {
      ok: false,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [`${passLabel}: ${upstreamMessage}`],
        assistantNotes: `GraphCore could not complete the ${passLabel.toLowerCase()} generation pass.`,
      },
    }
  }

  const parsedJson = extractJsonBlock(aiResponse.outputText)
  if (!parsedJson) {
    const rawOutput = aiResponse.outputText || JSON.stringify(aiResponse.body ?? {}, null, 2)
    const rawPreview = previewText(rawOutput)
    console.error(`[prompt-patch] ${passLabel} returned invalid JSON payload`, {
      model: payload.model,
      outputText: rawOutput,
      outputPreview: rawPreview,
      body: aiResponse.body,
    })

    return {
      ok: false,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [`${passLabel}: The model did not return a valid JSON patch object. Check the browser console or Supabase function logs for the raw model output.`],
        assistantNotes: `GraphCore could not parse the ${passLabel.toLowerCase()} output as a patch proposal.`,
        debugRawOutput: rawOutput || 'The model returned no textual output.',
      },
    }
  }

  const parsedResponse = modelResponseSchema.parse(parsedJson)
  const repairedOperations = repairOperations(parsedResponse.operations)
  const validation = validatePassOperations(validationSnapshot, repairedOperations, allowedOps, maxOperations, payload.graphType)

  if (validation.diagnostics.length > 0) {
    console.error(`[prompt-patch] ${passLabel} failed validator`, {
      model: payload.model,
      diagnostics: validation.diagnostics,
      operations: parsedResponse.operations,
      repairedOperations,
    })

    return {
      ok: false,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [
          ...prefixDiagnostics(passLabel, parsedResponse.diagnostics),
          ...prefixDiagnostics(passLabel, validation.diagnostics),
        ],
        assistantNotes: parsedResponse.assistantNotes,
      },
    }
  }

  return {
    ok: true,
    summary: parsedResponse.summary,
    assistantNotes: parsedResponse.assistantNotes,
    modelDiagnostics: prefixDiagnostics(passLabel, parsedResponse.diagnostics),
    operations: validation.operations,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { client, user } = await requireUserClient(request, 'prompt-patch')
    const payload = requestSchema.parse(await request.json())
    const inferredIntent = inferGraphIntentFromPrompt(payload)
    const effectivePayload: PromptRequest = {
      ...payload,
      context: {
        ...payload.context,
        target:
          payload.context?.target === 'content' && inferredIntent.asksForGraph
            ? 'graph'
            : payload.context?.target,
      },
      targetMode:
        payload.targetMode === 'auto' || payload.targetMode === undefined
          ? inferredIntent.asksForNewGraph
            ? 'new_graph'
            : inferredIntent.asksForGraph
              ? 'current_graph'
              : payload.targetMode
          : payload.targetMode,
      graphType: payload.graphType ?? inferredIntent.inferredGraphType,
    }
    const graphMode = requiresGraphPass(effectivePayload)

    const contentContext = {
      phase: 'content_support',
      maxOperations: CONTENT_PASS_MAX_OPS,
      guidance: {
        createArchetypesOnlyWhenMissing: true,
        doNotCreateGraphs: true,
      },
      ...buildPromptContext(effectivePayload),
    }

    const contentPass = await runPromptPass({
      payload: effectivePayload,
      passLabel: 'Content pass',
      systemText: contentPassSystemPrompt(),
      promptContext: contentContext,
      validationSnapshot: effectivePayload.snapshot,
      allowedOps: CONTENT_PASS_ALLOWED_OPS,
      maxOperations: CONTENT_PASS_MAX_OPS,
      maxOutputTokens: 8000,
    })

    if (!contentPass.ok) {
      await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, contentPass.response, effectivePayload.prompt, 'rejected')
      return json(contentPass.response)
    }

    let operations = contentPass.operations
    let summary = contentPass.summary
    let assistantNotes = contentPass.assistantNotes
    const diagnostics = [...contentPass.modelDiagnostics]

    if (graphMode) {
      const augmentedSnapshot = augmentSnapshotForPrompting(effectivePayload.snapshot, contentPass.operations)
      const graphContext = {
        phase: 'graph_structure',
        maxOperations: GRAPH_PASS_MAX_OPS,
        contentSupportOperations: contentPass.operations,
        ...buildPromptContext({ ...effectivePayload, snapshot: augmentedSnapshot }),
      }

      const graphPass = await runPromptPass({
        payload: effectivePayload,
        passLabel: 'Graph pass',
        systemText: graphPassSystemPrompt(),
        promptContext: graphContext,
        validationSnapshot: augmentedSnapshot,
        allowedOps: GRAPH_PASS_ALLOWED_OPS,
        maxOperations: GRAPH_PASS_MAX_OPS,
        maxOutputTokens: 32000,
      })

      if (!graphPass.ok) {
        const rejectedResponse = {
          ...graphPass.response,
          diagnostics: [...diagnostics, ...graphPass.response.diagnostics],
          assistantNotes: combineAssistantNotes(contentPass.assistantNotes, graphPass.response.assistantNotes),
        }
        await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
        return json(rejectedResponse)
      }

      diagnostics.push(...graphPass.modelDiagnostics)
      summary = graphPass.summary
      assistantNotes = combineAssistantNotes(contentPass.assistantNotes, graphPass.assistantNotes)
      operations = [...contentPass.operations, ...graphPass.operations]
    }

    const finalValidation = validateOperations(effectivePayload.snapshot, operations, effectivePayload.graphType)
    if (finalValidation.diagnostics.length > 0) {
      const rejectedResponse = {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [...diagnostics, ...prefixDiagnostics('Final validation', finalValidation.diagnostics)],
        assistantNotes,
      }
      console.error('[prompt-patch] combined proposal failed final validation', {
        model: effectivePayload.model,
        diagnostics: finalValidation.diagnostics,
        operations,
      })
      await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
      return json(rejectedResponse)
    }

    const responsePayload = {
      summary,
      operations: finalValidation.operations,
      diagnostics,
      assistantNotes,
    }

    await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, responsePayload, effectivePayload.prompt, 'proposed')

    return json(responsePayload)
  } catch (error) {
    return errorResponse(error, 'Failed to generate patch.')
  }
})
