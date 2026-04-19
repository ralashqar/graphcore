import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const WORLD_BUILD_CONTRACT_VERSION = '2026-04-19-story-authorship-pipeline-v1'
void WORLD_BUILD_CONTRACT_VERSION

const plannerItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['character', 'environment', 'item']),
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
    'Only plan these item kinds: character, environment, item.',
    'Infer user intent from the single global prompt.',
    'Use the supplied project name, project summary, and art direction as the default world context when the prompt is underspecified.',
    'If project summary or art style imply a clear setting, tone, or visual language, reflect that in names and summaries.',
    'Generate concise implementation-facing plan items with stable ids.',
    'The summary must read like a concrete creative brief, not a generic checklist.',
    'Avoid bland phrases like "core traits", "appearance", "abilities", "role hooks", or other meta category lists.',
    'For character, item, and environment summaries, write 1-2 vivid implementation-facing sentences with specific fantasy or visual direction when possible.',
    'Use grounded, evocative nouns and adjectives so the resulting plan item feels like an actual concept, not a template placeholder.',
    'Do not plan narrative graphs in this planner.',
    'If the prompt is asking for cinematics, shots, cutscenes, trailers, storyboards, framing, or camera direction, that belongs to the cinematic planner path instead.',
    'If the prompt is asking for story/quest/dialogue graph logic, still only return supporting characters, items, or environments here.',
    'Do not include duplicate items.',
    'Keep the plan compact and useful.',
    'Example: {"requestSummary":"Create mage character","planItems":[{"id":"character_mage","kind":"character","name":"Ilyra the Ember Veil","summary":"Create a battle mage wrapped in ember-dyed robes, carrying a scorched brass staff and a reputation for precise fire warding under pressure.","dependsOn":[]}],"diagnostics":[],"assistantNotes":"Optional short note."}',
  ].join('\n')
}

function normalizePromptText(prompt: string) {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hasExplicitCinematicIntent(prompt: string) {
  const normalized = normalizePromptText(prompt)
  if (!normalized) return false

  const directCinematicTerms = [
    'cinematic',
    'cinematics',
    'cutscene',
    'cut scene',
    'trailer',
    'storyboard',
    'storyboarding',
    'storyboarded',
    'animatic',
    'video',
    'shot list',
    'shotlist',
  ]
  if (directCinematicTerms.some((term) => normalized.includes(term))) {
    return true
  }

  const sequenceTerms = ['shot', 'shots', 'scene', 'sequence']
  const cameraTerms = ['camera', 'framing', 'lens', 'angle', 'close up', 'closeup', 'wide shot', 'establishing shot']
  return sequenceTerms.some((term) => normalized.includes(term)) && cameraTerms.some((term) => normalized.includes(term))
}

function normalizeEntityToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function pruneIncidentalCinematicEntityRefs(entityRefs: Array<{
  id: string
  kind: 'character' | 'environment' | 'item'
  role: string
  sourceName: string
  summary: string
  resolution: 'existing' | 'create'
  definitionKey?: string | null
  planItemId?: string | null
}>) {
  const hasEnvironment = entityRefs.some((entry) => entry.kind === 'environment')
  if (!hasEnvironment) return entityRefs

  const incidentalItemNames = new Set([
    'table',
    'chair',
    'stool',
    'bench',
    'bar',
    'counter',
    'mug',
    'cup',
    'glass',
    'bottle',
    'plate',
    'bowl',
    'door',
    'window',
  ])

  return entityRefs.filter((entry) => {
    if (entry.kind !== 'item' || entry.resolution !== 'create') return true
    const normalizedName = normalizeEntityToken(entry.sourceName)
    const normalizedRole = normalizeEntityToken(entry.role)
    if (incidentalItemNames.has(normalizedName)) return false
    if (normalizedRole.includes('surface') || normalizedRole.includes('set dressing') || normalizedRole.includes('background')) {
      return false
    }
    return true
  })
}

function trimPromptForSummary(prompt: string, maxLength = 160) {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`
}

function buildDeferredCinematicGraphName(entityRefs: Array<{
  kind: 'character' | 'environment' | 'item'
  sourceName: string
}>, prompt: string) {
  const participants = entityRefs.filter((entry) => entry.kind === 'character').map((entry) => entry.sourceName.trim()).filter(Boolean)
  const environments = entityRefs.filter((entry) => entry.kind === 'environment').map((entry) => entry.sourceName.trim()).filter(Boolean)

  if (participants.length >= 2 && environments[0]) {
    return `${participants[0]} and ${participants[1]} in ${environments[0]}`
  }
  if (participants.length >= 2) {
    return `${participants[0]} and ${participants[1]} Cinematic`
  }
  if (participants[0] && environments[0]) {
    return `${participants[0]} in ${environments[0]}`
  }
  if (participants[0]) {
    return `${participants[0]} Cinematic`
  }
  if (environments[0]) {
    return `${environments[0]} Cinematic`
  }

  return trimPromptForSummary(prompt, 72) || 'Prompt Cinematic'
}

function buildDeferredCinematicGraphSummary(prompt: string, entityRefs: Array<{
  kind: 'character' | 'environment' | 'item'
  sourceName: string
}>) {
  const compactPrompt = trimPromptForSummary(prompt, 220)
  const participants = entityRefs.filter((entry) => entry.kind === 'character').map((entry) => entry.sourceName.trim()).filter(Boolean)
  const environments = entityRefs.filter((entry) => entry.kind === 'environment').map((entry) => entry.sourceName.trim()).filter(Boolean)
  const items = entityRefs.filter((entry) => entry.kind === 'item').map((entry) => entry.sourceName.trim()).filter(Boolean)

  if (participants[0] && environments[0] && items[0]) {
    return `${participants[0]} in ${environments[0]} using ${items[0]}.`
  }
  if (participants[0] && environments[0]) {
    return `${participants[0]} in ${environments[0]}.`
  }
  if (participants[0] && items[0]) {
    return `${participants[0]} featuring ${items[0]}.`
  }
  if (participants[0]) {
    return `${participants[0]} creator sequence.`
  }

  return compactPrompt || 'Cinematic sequence generated from the prompt.'
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

function buildPlanItemSummaryForEntity(entityRef: {
  kind: 'character' | 'environment' | 'item'
  sourceName: string
  summary: string
  role: string
}) {
  if (entityRef.summary.trim()) {
    return entityRef.summary.trim()
  }

  return entityRef.kind === 'environment'
    ? `Create the environment "${entityRef.sourceName}" so it can anchor the ${entityRef.role} cinematic beats.`
    : `Create ${entityRef.kind} "${entityRef.sourceName}" so it can be used in the ${entityRef.role} cinematic action.`
}

function mergeCinematicEntityRefs<T extends {
  id: string
  kind: 'character' | 'environment' | 'item'
  role: string
  sourceName: string
  summary: string
  resolution: 'existing' | 'create'
  definitionKey?: string | null
  planItemId?: string | null
}>(
  primary: T[],
  secondary: T[],
) {
  const merged = [...primary]
  const seen = new Set(
    primary.map((entry) => `${entry.definitionKey ?? ''}::${entry.kind}::${entry.sourceName.trim().toLowerCase()}`),
  )

  for (const entry of secondary) {
    const key = `${entry.definitionKey ?? ''}::${entry.kind}::${entry.sourceName.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }

  return merged
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    const [
      cinematicsDomain,
      worldBuildDomain,
      authModule,
      worldBuildModule,
      worldBuildCinematicsModule,
    ] = await Promise.all([
      import('../../../src/domain/cinematics.ts'),
      import('../../../src/domain/worldBuild.ts'),
      import('../_shared/auth.ts'),
      import('../_shared/world-build.ts'),
      import('../_shared/world-build-cinematics.ts'),
    ])
    const {
      buildCinematicSettingsPatchFromFormatSubtype,
      buildCinematicSettingsPatchFromPresetFamily,
      buildCinematicSettingsPatchFromStoryPresets,
      getCinematicSettings,
    } = cinematicsDomain
    const { worldBuildPlanRequestSchema, worldBuildPlanResponseSchema } = worldBuildDomain
    const { requireUserClient } = authModule
    const { runStructuredWorldBuildModel } = worldBuildModule
    const {
      buildCinematicDefinitionCatalog,
      buildPromptMatchedEntityRefs,
      coerceCinematicEntityExtractionRaw,
      correctUgcPresetSelectionForPrompt,
      cinematicEntityExtractionSystemPrompt,
      cinematicEntityResolutionSystemPrompt,
      cinematicIntentSchema,
      cinematicIntentSystemPrompt,
      finalizeCinematicEntityRefs,
      inferCinematicFormatSubtypeFromPrompt,
      inferCinematicPresetFamilyFromPrompt,
      inferStoryLanguagePresetFromPrompt,
      inferStoryScenePresetFromPrompt,
    } = worldBuildCinematicsModule
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    await requireUserClient(request, 'plan-world-build')
    const payload = worldBuildPlanRequestSchema.parse(await request.json())

    const plannerModeHint = payload.plannerModeHint ?? null
    const explicitCinematicIntent = hasExplicitCinematicIntent(payload.prompt)
    const intent = plannerModeHint === 'cinematic_build'
      ? { plannerMode: 'cinematic_build' as const, reason: 'Client requested cinematic planning context.' }
      : explicitCinematicIntent
      ? { plannerMode: 'cinematic_build' as const, reason: 'Matched explicit cinematic prompt keywords.' }
      : await runStructuredWorldBuildModel({
        model: payload.model,
        passLabel: 'World build intent classifier',
        systemText: cinematicIntentSystemPrompt(),
        promptContext: {
          prompt: payload.prompt,
          project: payload.snapshot.project,
          gameSpec: payload.snapshot.gameSpec ?? null,
        },
        schema: cinematicIntentSchema,
        maxOutputTokens: 1200,
      })

    if (intent.plannerMode === 'cinematic_build') {
      const catalog = buildCinematicDefinitionCatalog((payload.snapshot.definitions ?? []) as Array<{
        key: string
        kind: string
        name: string
        summary?: string | null
      }>)
      const promptMatchedEntityRefs = buildPromptMatchedEntityRefs(payload.prompt, catalog)
      const extractedEntitiesRaw = await runStructuredWorldBuildModel({
        model: payload.model,
        passLabel: 'Cinematic entity extraction',
        systemText: cinematicEntityExtractionSystemPrompt(),
        promptContext: {
          prompt: payload.prompt,
          project: payload.snapshot.project,
          draft: payload.snapshot.draft,
          gameSpec: payload.snapshot.gameSpec ?? null,
          existingDefinitions: catalog.map((entry) => ({
            definitionKey: entry.definitionKey,
            kind: entry.kind,
            name: entry.name,
            summary: entry.summary,
          })),
        },
        schema: z.record(z.string(), z.unknown()),
        maxOutputTokens: 4000,
      })
      const extractedEntities = coerceCinematicEntityExtractionRaw(extractedEntitiesRaw)
      const resolvedEntitiesRaw = await runStructuredWorldBuildModel({
        model: payload.model,
        passLabel: 'Cinematic entity resolution',
        systemText: cinematicEntityResolutionSystemPrompt(),
        promptContext: {
          prompt: payload.prompt,
          project: payload.snapshot.project,
          extractedEntityRefs: extractedEntities.entityRefs,
          existingDefinitions: catalog.map((entry) => ({
            definitionKey: entry.definitionKey,
            kind: entry.kind,
            name: entry.name,
            summary: entry.summary,
          })),
        },
        schema: z.record(z.string(), z.unknown()),
        maxOutputTokens: 5000,
      })
      const resolvedEntities = coerceCinematicEntityExtractionRaw(resolvedEntitiesRaw)
      const resolvedEntityRefs = finalizeCinematicEntityRefs(
        mergeCinematicEntityRefs(promptMatchedEntityRefs, resolvedEntities.entityRefs),
        catalog,
        payload.prompt,
      )
      const requestSummary = extractedEntities.requestSummary || trimPromptForSummary(payload.prompt, 96) || 'Cinematic build plan'
      const filteredEntityRefs = pruneIncidentalCinematicEntityRefs(resolvedEntityRefs)
      const graphName = buildDeferredCinematicGraphName(filteredEntityRefs, payload.prompt)
      const graphSummary = buildDeferredCinematicGraphSummary(payload.prompt, filteredEntityRefs)
      const rawProjectCinematics =
        payload.snapshot.gameSpec && typeof payload.snapshot.gameSpec === 'object' && (payload.snapshot.gameSpec as { cinematics?: unknown }).cinematics && typeof (payload.snapshot.gameSpec as { cinematics?: unknown }).cinematics === 'object'
          ? (payload.snapshot.gameSpec as { cinematics?: Record<string, unknown> }).cinematics ?? {}
          : {}
      const hasExplicitProjectPresetOverride =
        rawProjectCinematics.presetSource === 'manual_override'
      const hasLockedProjectPreset = hasExplicitProjectPresetOverride && (
        typeof rawProjectCinematics.presetFamily === 'string'
        || typeof rawProjectCinematics.presetId === 'string'
        || typeof rawProjectCinematics.specializationMode === 'string'
        || typeof rawProjectCinematics.storyScenePreset === 'string'
        || typeof rawProjectCinematics.storyLanguagePreset === 'string'
        || typeof rawProjectCinematics.formatSubtype === 'string'
      )
      const lockedProjectSettings = hasLockedProjectPreset
        ? getCinematicSettings(payload.snapshot.gameSpec ?? null, {})
        : null
      const resolvedPresetFamily = hasLockedProjectPreset
        ? lockedProjectSettings?.presetFamily ?? 'story_movie_tv'
        : inferCinematicPresetFamilyFromPrompt(payload.prompt)
      const initiallyResolvedFormatSubtype = hasLockedProjectPreset
        ? lockedProjectSettings?.formatSubtype ?? null
        : inferCinematicFormatSubtypeFromPrompt(payload.prompt, resolvedPresetFamily)
      const correctedPresetSelection = correctUgcPresetSelectionForPrompt({
        prompt: payload.prompt,
        presetFamily: resolvedPresetFamily,
        formatSubtype: initiallyResolvedFormatSubtype,
      })
      const resolvedFormatSubtype = correctedPresetSelection.formatSubtype
      const resolvedEffectivePresetFamily = correctedPresetSelection.presetFamily
      const resolvedStoryScenePreset = resolvedEffectivePresetFamily === 'story_movie_tv'
        ? (hasLockedProjectPreset ? lockedProjectSettings?.storyScenePreset ?? null : inferStoryScenePresetFromPrompt(payload.prompt))
        : null
      const resolvedStoryLanguagePreset = resolvedEffectivePresetFamily === 'story_movie_tv'
        ? (hasLockedProjectPreset ? lockedProjectSettings?.storyLanguagePreset ?? null : inferStoryLanguagePresetFromPrompt(payload.prompt))
        : null
      const presetSource = hasLockedProjectPreset ? 'project_default' : 'prompt_inference'
      const graphSettings =
        resolvedEffectivePresetFamily === 'story_movie_tv'
          ? {
            ...buildCinematicSettingsPatchFromStoryPresets(resolvedStoryScenePreset, resolvedStoryLanguagePreset),
            presetSource,
          }
          : {
            ...buildCinematicSettingsPatchFromPresetFamily(resolvedEffectivePresetFamily),
            ...buildCinematicSettingsPatchFromFormatSubtype(resolvedEffectivePresetFamily, resolvedFormatSubtype),
            presetSource,
          }
      const cinematicPlan = {
        graphName,
        graphSummary,
        entityRefs: filteredEntityRefs,
        rawScriptMarkdown: '',
        scriptDoc: null,
        relationshipRefs: [],
        compositeRefPlans: [],
        storyboardPlan: null,
        shots: [],
        graphSettings,
        autoRun: false,
      } as const
      const missingPlanItems = filteredEntityRefs
        .filter((entityRef) => entityRef.resolution === 'create' && entityRef.planItemId)
        .map((entityRef) => ({
          id: entityRef.planItemId ?? entityRef.id,
          kind: entityRef.kind,
          name: entityRef.sourceName,
          summary: buildPlanItemSummaryForEntity(entityRef),
          dependsOn: [],
          enabled: true,
          generationOptions: { generateConceptImage: true },
        }))

      const responseDraft = {
        plannerMode: 'cinematic_build' as const,
        requestSummary,
        planItems: [
          ...missingPlanItems,
          {
            id: 'cinematic_graph',
            kind: 'cinematic_graph' as const,
            name: cinematicPlan.graphName,
            summary: cinematicPlan.graphSummary,
            dependsOn: missingPlanItems.map((item) => item.id),
            enabled: true,
            generationOptions: {},
          },
        ],
        cinematicPlan,
        diagnostics: [
          ...extractedEntities.diagnostics,
          ...resolvedEntities.diagnostics,
          'Detailed cinematic shot planning is deferred to generation start so preview returns quickly.',
        ],
        assistantNotes: [
          extractedEntities.assistantNotes,
          resolvedEntities.assistantNotes,
          filteredEntityRefs.length > 0
            ? `Matched ${filteredEntityRefs.length} cinematic reference${filteredEntityRefs.length === 1 ? '' : 's'} for preview.`
            : 'No cinematic references were locked during preview.',
        ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).join('\n\n') || undefined,
      }

      const responseCheck = worldBuildPlanResponseSchema.safeParse(responseDraft)
      if (!responseCheck.success) {
        throw new HttpError(500, `Cinematic planner response validation failed. ${formatIssues(responseCheck.error.issues)}`)
      }

      return json(responseCheck.data)
    }

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
      plannerMode: 'world_build' as const,
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
                ? { generateConceptImage: true }
                : {},
      })),
      cinematicPlan: null,
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
