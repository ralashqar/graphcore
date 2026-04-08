import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses } from '../_shared/openai.ts'
import { buildPromptContext, systemPrompt, validateOperations } from '../_shared/prompt-patch.ts'

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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { client, user } = await requireUserClient(request, 'prompt-patch')
    const payload = requestSchema.parse(await request.json())
    const aiResponse = await runOpenAiResponses({
      model: payload.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt() }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(buildPromptContext(payload), null, 2) }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'graphcore_patch_response',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              assistantNotes: { type: 'string' },
              diagnostics: { type: 'array', items: { type: 'string' } },
              operations: { type: 'array', items: { type: 'object' } },
            },
            required: ['summary', 'diagnostics', 'operations'],
          },
        },
      },
      reasoning: { effort: 'medium' },
      metadata: { feature: 'prompt-patch', target_mode: payload.targetMode ?? 'auto' },
      store: false,
      maxOutputTokens: 8000,
    })

    if (!aiResponse.response.ok) {
      console.error('[prompt-patch] upstream OpenAI request failed', {
        model: payload.model,
        status: aiResponse.response.status,
        requestId: aiResponse.response.headers.get('x-request-id'),
        body: aiResponse.body,
      })

      const diagnostics = [
        typeof aiResponse.body.error === 'object' && aiResponse.body.error !== null
          ? (aiResponse.body.error as { message?: string }).message ?? 'OpenAI request failed.'
          : 'OpenAI request failed.',
      ]
      return json({ summary: 'Prompt proposal failed.', operations: [], diagnostics }, { status: aiResponse.response.status })
    }

    const parsedJson = extractJsonBlock(aiResponse.outputText)
    if (!parsedJson) {
      console.error('[prompt-patch] model returned invalid JSON payload', {
        model: payload.model,
        outputText: aiResponse.outputText,
        body: aiResponse.body,
      })

      const diagnostics = ['The model did not return a valid JSON patch object.']
      await client.from('patch_sets').insert({ draft_id: payload.snapshot.draft.id, prompt: payload.prompt, summary: 'Rejected prompt proposal', status: 'rejected', operations: [], diagnostics, created_by: user.id })
      return json({ summary: 'Rejected prompt proposal', operations: [], diagnostics })
    }

    const parsedResponse = modelResponseSchema.parse(parsedJson)
    const validated = validateOperations(payload.snapshot, parsedResponse.operations, payload.graphType)
    const diagnostics = [...parsedResponse.diagnostics, ...validated.diagnostics]
    const status = diagnostics.length > 0 ? 'rejected' : 'proposed'
    const operations = status === 'proposed' ? validated.operations : []

    if (status === 'rejected') {
      console.error('[prompt-patch] generated patch was rejected by validator', {
        model: payload.model,
        diagnostics,
        operations: parsedResponse.operations,
      })
    }

    await client.from('patch_sets').insert({
      draft_id: payload.snapshot.draft.id,
      prompt: payload.prompt,
      summary: parsedResponse.summary,
      status,
      operations,
      diagnostics,
      created_by: user.id,
    })

    return json({
      summary: parsedResponse.summary,
      operations,
      diagnostics,
      assistantNotes: parsedResponse.assistantNotes,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to generate patch.')
  }
})
