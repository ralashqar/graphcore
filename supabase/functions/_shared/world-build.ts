import { z } from 'npm:zod@4'

import { TextGateway } from './ai-core/gateways.ts'

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
}: {
  model: string
  passLabel: string
  systemText: string
  promptContext: Record<string, unknown>
  schema: z.ZodType<TPayload>
  maxOutputTokens: number
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

  try {
    const response = await TextGateway.generateObject({
      task: 'world_build',
      modelPreference: model,
      system: systemText,
      messages: [{ role: 'user', content: JSON.stringify(promptContext, null, 2) }],
      schema,
      schemaName: `world_build_${passLabel}`,
      maxTokens: maxOutputTokens,
    })
    
    if (debugEnabled) {
      console.log(`[world-build-debug] ${passLabel} response-meta`, previewJson({
        ok: true,
        status: 200,
        object: response.object,
      }))
    }
    
    return response.object
  } catch (err) {
    const upstreamMessage = err instanceof Error ? err.message : 'OpenAI request failed.'
    throw new Error(`[world-build-json-object-v2] ${passLabel} failed: ${upstreamMessage}`)
  }

  // Validation is natively handled by the Vercel AI SDK when a Zod schema is provided.
}

export function isTerminalWorldBuildStatus(status: string) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}
