import { z } from 'npm:zod@4'

import { runOpenAiResponses } from './openai.ts'

function isTruthyEnv(value: string | undefined | null) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.trim().toLowerCase())
}

function shouldDebugWorldBuildOpenAi() {
  return isTruthyEnv(Deno.env.get('WORLD_BUILD_DEBUG_OPENAI'))
}

function previewJson(value: unknown, maxLength = 4000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...<truncated>`
}

function stringifyJson(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

export function slugifyWorldBuildName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

export function uniqueWorldBuildKey(existingKeys: Iterable<string>, seed: string) {
  const seen = new Set(existingKeys)
  let candidate = seed
  let index = 2

  while (seen.has(candidate)) {
    candidate = `${seed}_${index}`
    index += 1
  }

  return candidate
}

export function extractJsonBlock(text: string) {
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

export async function runStructuredWorldBuildModel<TPayload>({
  model,
  passLabel,
  systemText,
  promptContext,
  schema,
  maxOutputTokens,
  reasoningEffort,
  timeoutMs,
}: {
  model: string
  passLabel: string
  systemText: string
  promptContext: Record<string, unknown>
  schema: z.ZodType<TPayload>
  maxOutputTokens: number
  /** Task-complexity-aware reasoning effort; defaults to 'low' (previous hardcoded behavior). */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | null
  timeoutMs?: number
}) {
  const debugEnabled = shouldDebugWorldBuildOpenAi()

  if (debugEnabled) {
    console.log(`[world-build-debug] ${passLabel} request-meta`, previewJson({
      model,
      passLabel,
      maxOutputTokens,
    }))
    console.log(`[world-build-debug] ${passLabel} request-systemText`, systemText)
    console.log(`[world-build-debug] ${passLabel} request-promptContext`, stringifyJson(promptContext))
  }

  const aiResponse = await runOpenAiResponses({
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemText }] },
      { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(promptContext, null, 2) }] },
    ],
    text: {
      format: {
        type: 'json_object',
      },
    },
    reasoning: { effort: reasoningEffort ?? 'low' },
    metadata: {
      feature: 'world-build',
      pass: passLabel,
    },
    store: false,
    maxOutputTokens,
    timeoutMs,
  })

  if (debugEnabled) {
    console.log(`[world-build-debug] ${passLabel} response-meta`, previewJson({
      ok: aiResponse.response.ok,
      status: aiResponse.response.status,
      requestId: aiResponse.response.headers.get('x-request-id'),
      outputText: aiResponse.outputText,
      body: aiResponse.body,
    }))
  }

  if (!aiResponse.response.ok) {
    const upstreamMessage =
      typeof aiResponse.body.error === 'object' && aiResponse.body.error !== null
        ? ((aiResponse.body.error as { message?: string }).message ?? 'OpenAI request failed.')
        : 'OpenAI request failed.'

    throw new Error(`[world-build-json-object-v2] ${passLabel} failed: ${upstreamMessage}`)
  }

  const parsedJson = extractJsonBlock(aiResponse.outputText)
  if (!parsedJson) {
    if (debugEnabled) {
      console.log(`[world-build-debug] ${passLabel} parse-failed`, previewJson({
        outputText: aiResponse.outputText,
        body: aiResponse.body,
      }))
    }
    throw new Error(`${passLabel} returned invalid JSON.`)
  }

  if (debugEnabled) {
    console.log(`[world-build-debug] ${passLabel} parsed-json`, previewJson(parsedJson))
  }

  if (!schema || typeof (schema as { safeParse?: unknown }).safeParse !== 'function') {
    const schemaKeys =
      schema && typeof schema === 'object'
        ? Object.keys(schema as Record<string, unknown>)
        : []
    throw new Error(`${passLabel} was invoked with an invalid schema object. keys=${schemaKeys.join(',') || '<none>'}`)
  }

  const validated = schema.safeParse(parsedJson)
  if (!validated.success) {
    if (debugEnabled) {
      console.log(`[world-build-debug] ${passLabel} schema-failed`, previewJson(validated.error.issues))
    }
    throw new Error(`${passLabel} returned JSON that did not match the expected schema. ${formatIssues(validated.error.issues)}`)
  }

  return validated.data
}

export function isTerminalWorldBuildStatus(status: string) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}
