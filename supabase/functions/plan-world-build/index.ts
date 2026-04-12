import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { worldBuildPlanRequestSchema, worldBuildPlanResponseSchema } from '../../../src/domain/worldBuild.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runStructuredWorldBuildModel } from '../_shared/world-build.ts'

const plannerItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['character', 'environment', 'item', 'narrative_graph']),
  name: z.string(),
  summary: z.string(),
  dependsOn: z.array(z.string()).default([]),
})

const plannerSchema = z.object({
  requestSummary: z.string().default('World build plan'),
  planItems: z.array(plannerItemSchema).min(1, 'Planner returned no actionable items.'),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

const plannerRawSchema = z.record(z.string(), z.unknown())

function plannerSystemPrompt() {
  return [
    'You are the GraphCore global world-builder planner.',
    'Return JSON only.',
    'Return exactly one JSON object with these top-level keys: requestSummary, planItems, diagnostics, assistantNotes.',
    'planItems must always be an array, even if it contains only one item.',
    'If the prompt is actionable, planItems must contain one or more items.',
    'Each item in planItems must be an object with keys: id, kind, name, summary, dependsOn.',
    'dependsOn must always be an array of ids.',
    'Only plan these item kinds: character, environment, item, narrative_graph.',
    'Infer user intent from the single global prompt.',
    'Generate concise implementation-facing plan items with stable ids.',
    'The summary must read like a concrete creative brief, not a generic checklist.',
    'Avoid bland phrases like "core traits", "appearance", "abilities", "role hooks", or other meta category lists.',
    'For character, item, and environment summaries, write 1-2 vivid implementation-facing sentences with specific fantasy or visual direction when possible.',
    'Use grounded, evocative nouns and adjectives so the resulting plan item feels like an actual concept, not a template placeholder.',
    'Use narrative_graph only when the prompt clearly asks for a story/quest/dialogue/narrative graph.',
    'When a narrative graph references created content, set dependsOn to those item ids.',
    'Do not include duplicate items.',
    'Keep the plan compact and useful.',
    'Example: {"requestSummary":"Create mage character","planItems":[{"id":"character_mage","kind":"character","name":"Ilyra the Ember Veil","summary":"Create a battle mage wrapped in ember-dyed robes, carrying a scorched brass staff and a reputation for precise fire warding under pressure.","dependsOn":[]}],"diagnostics":[],"assistantNotes":"Optional short note."}',
  ].join('\n')
}

function isTruthyEnv(value: string | undefined | null) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.trim().toLowerCase())
}

function shouldDebugPlanner() {
  return isTruthyEnv(Deno.env.get('WORLD_BUILD_DEBUG_OPENAI'))
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

function describeTopLevelKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '<not-an-object>'
  const keys = Object.keys(value as Record<string, unknown>)
  return keys.length > 0 ? keys.join(', ') : '<no-keys>'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    await requireUserClient(request, 'plan-world-build')
    const payload = worldBuildPlanRequestSchema.parse(await request.json())

    const plan = await runStructuredWorldBuildModel({
      model: payload.model,
      passLabel: 'World build planner',
      systemText: plannerSystemPrompt(),
      promptContext: {
        prompt: payload.prompt,
        project: payload.snapshot.project,
        draft: payload.snapshot.draft,
        gameSpec: payload.snapshot.gameSpec ?? null,
        existingDefinitionKeys: payload.snapshot.definitions.map((definition) => definition.key),
        existingGraphKeys: payload.snapshot.graphs.map((graph) => graph.key),
        existingAssetKeys: payload.snapshot.assets.map((asset) => asset.key),
      },
      schema: plannerRawSchema,
      maxOutputTokens: 32000,
    })

    const planCheck = plannerSchema.safeParse(plan)
    if (!planCheck.success) {
      throw new HttpError(500, `Planner output validation failed. keys=${describeTopLevelKeys(plan)}. ${formatIssues(planCheck.error.issues)}`)
    }

    if (shouldDebugPlanner()) {
      console.log('[world-build-debug] planner validated-plan', JSON.stringify(planCheck.data, null, 2))
    }

    const responseDraft = {
      requestSummary: plan.requestSummary,
      planItems: plan.planItems.map((item) => ({
        ...item,
        enabled: true,
        generationOptions:
          item.kind === 'character'
            ? { generateConceptImage: true }
            : item.kind === 'item'
              ? { generateConceptImage: true }
              : item.kind === 'environment'
                ? { generateConceptGallery: true, environmentViews: ['hero', 'wide_alt', 'detail_area'] }
                : {},
      })),
      diagnostics: plan.diagnostics,
      assistantNotes: plan.assistantNotes,
    }

    if (shouldDebugPlanner()) {
      console.log('[world-build-debug] planner response-draft', JSON.stringify(responseDraft, null, 2))
    }

    const responseCheck = worldBuildPlanResponseSchema.safeParse(responseDraft)
    if (!responseCheck.success) {
      throw new HttpError(500, `Planner response validation failed. ${formatIssues(responseCheck.error.issues)}`)
    }

    return json(responseCheck.data)
  } catch (error) {
    return errorResponse(error, 'Failed to plan world build.')
  }
})
