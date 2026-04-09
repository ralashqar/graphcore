import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createGameSpecFromArchetype } from '../../../src/domain/gameArchetypes.ts'
import { gameSpecSchema } from '../../../src/domain/gameSpec.ts'
import { archetypePresetMap, buildBootstrapPatch, definitionPresetMap, expandPackPresetIds, graphPresetMap, packPresetMap } from '../../../src/domain/presetCatalog.ts'
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

const scopeWeightSchema = z.enum(['none', 'light', 'medium', 'heavy'])

const requestSchema = z.object({
  prompt: z.string().min(1),
  snapshot: z.object({
    workspace: z.object({ slug: z.string(), name: z.string() }),
    project: z.object({ id: z.string(), slug: z.string(), name: z.string(), summary: z.string().optional() }),
    draft: z.object({ id: z.string(), metadata: z.record(z.string(), z.unknown()).optional() }),
    definitions: z.array(z.record(z.string(), z.unknown())).default([]),
    archetypes: z.array(z.record(z.string(), z.unknown())).default([]),
    graphs: z.array(z.record(z.string(), z.unknown())).default([]),
    assemblyGraphs: z.array(z.record(z.string(), z.unknown())).default([]),
    environmentBlueprints: z.array(z.record(z.string(), z.unknown())).default([]),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    gameSpec: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  context: z.object({
    graphKey: z.string().nullable().optional(),
    nodeKey: z.string().nullable().optional(),
    edgeKey: z.string().nullable().optional(),
    target: z.enum(['graph', 'node', 'content', 'environment']).nullable().optional(),
  }).optional(),
  selectionContext: z.object({
    graphKey: z.string().nullable().optional(),
    nodeKey: z.string().nullable().optional(),
    edgeKey: z.string().nullable().optional(),
    definitionKey: z.string().nullable().optional(),
    archetypeKey: z.string().nullable().optional(),
    assetKey: z.string().nullable().optional(),
    target: z.enum(['graph', 'node', 'content', 'environment']).nullable().optional(),
  }).optional(),
  targetMode: z.enum(['current_graph', 'new_graph', 'auto']).optional(),
  graphType: z.enum(['narrative_flow', 'quest_flow', 'system_graph']).optional(),
  intent: z.enum(['bootstrap_game', 'create_content', 'extend_graph', 'repair_graph', 'polish_text']).optional(),
  phase: z.enum(['spec', 'content', 'graph_skeleton', 'graph_wiring', 'text_polish', 'bootstrap_orchestrator', 'dependency_generation', 'graph_generation_parallel', 'merge_and_apply']).optional(),
  mode: z.literal('orchestrate').optional(),
  autoApply: z.boolean().optional(),
  gameSpec: z.record(z.string(), z.unknown()).nullable().optional(),
  gameArchetypeId: z.string().optional(),
  gameConceptPrompt: z.string().optional(),
  selectedPresetIds: z.array(z.string()).optional(),
  allowedPresetIds: z.array(z.string()).optional(),
  operationBudget: z.number().int().positive().optional(),
  model: z.string().min(1),
})

const graphJobSchema = z.object({
  title: z.string().default('Generated graph job'),
  prompt: z.string().default('Create a graph that fits the request.'),
  graphType: z.enum(['narrative_flow', 'quest_flow', 'system_graph']).nullable().optional(),
  graphKey: z.string().nullable().optional(),
  targetMode: z.enum(['current_graph', 'new_graph', 'auto']).optional(),
})

const orchestratorPlanSchema = z.object({
  requestSummary: z.string().default('Generated GraphCore execution plan.'),
  classification: z.enum(['bootstrap', 'single_content', 'content_bundle', 'single_graph', 'multi_graph', 'mixed_request']).default('content_bundle'),
  dependencyPrompt: z.string().default(''),
  dependencyKinds: z.array(z.enum(['item', 'character', 'ability', 'location', 'environment', 'world_model', 'market', 'archetype', 'asset'])).default([]),
  graphJobs: z.array(graphJobSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

const bootstrapBlueprintSchema = z.object({
  requestSummary: z.string().default('Bootstrap game data layer.'),
  title: z.string().optional(),
  theme: z.object({
    tone: z.string().optional(),
    playerFantasy: z.string().optional(),
    worldPremise: z.string().optional(),
    namingStyle: z.string().optional(),
  }).partial().default({}),
  systems: z.object({
    progressionStyle: z.enum(['linear', 'branching', 'hub_and_spoke', 'open']).optional(),
    combatStyle: z.enum(['none', 'turn_based', 'real_time', 'hybrid']).optional(),
    inputStyle: z.enum(['none', 'direct_control', 'party_commands', 'dialogue_choice']).optional(),
    inventoryStyle: z.enum(['none', 'slots', 'weight', 'stacked']).optional(),
    economyStyle: z.enum(['none', 'gold', 'barter', 'energy']).optional(),
  }).partial().default({}),
  contentScope: z.object({
    items: scopeWeightSchema.optional(),
    characters: scopeWeightSchema.optional(),
    abilities: scopeWeightSchema.optional(),
    locations: scopeWeightSchema.optional(),
    environments: scopeWeightSchema.optional(),
    worldModels: scopeWeightSchema.optional(),
    markets: scopeWeightSchema.optional(),
    quests: scopeWeightSchema.optional(),
    graphs: scopeWeightSchema.optional(),
  }).partial().default({}),
  selectedPackIds: z.array(z.string()).default([]),
  starterArchetypePresetIds: z.array(z.string()).default([]),
  starterDefinitionPresetIds: z.array(z.string()).default([]),
  starterGraphPresetIds: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

const patchResponseSchema = z.object({
  summary: z.string().default('Generated GraphCore patch proposal.'),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
  operations: z.array(z.record(z.string(), z.unknown())).default([]),
})

type PromptRequest = z.infer<typeof requestSchema>

type PromptPatchHttpResponse = {
  patchSetId?: string
  requestSummary?: string
  executionPlan?: {
    classification: 'bootstrap' | 'single_content' | 'content_bundle' | 'single_graph' | 'multi_graph' | 'mixed_request'
    requiresDependencies: boolean
    dependencyKinds: string[]
    graphJobCount: number
    graphJobs: Array<{
      title: string
      prompt: string
      graphType?: 'narrative_flow' | 'quest_flow' | 'system_graph' | null
      graphKey?: string | null
      targetMode?: 'current_graph' | 'new_graph' | 'auto'
    }>
  }
  activityEntries?: Array<{
    phase: 'spec' | 'content' | 'graph_skeleton' | 'graph_wiring' | 'text_polish' | 'bootstrap_orchestrator' | 'dependency_generation' | 'graph_generation_parallel' | 'merge_and_apply' | 'fallback'
    status: 'planned' | 'completed' | 'applied' | 'failed'
    title: string
    detail?: string
  }>
  summary: string
  operations: Array<Record<string, unknown>>
  diagnostics: string[]
  assistantNotes?: string
  debugRawOutput?: string
}

type StructuredModelResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; response: PromptPatchHttpResponse }

const genericJsonSchema = {
  name: 'graphcore_json_response',
  schema: {
    type: 'object',
    additionalProperties: true,
  },
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
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`
}

function prefixDiagnostics(passLabel: string, diagnostics: string[]) {
  return diagnostics.map((diagnostic) => `${passLabel}: ${diagnostic}`)
}

function combineAssistantNotes(...notes: Array<string | undefined>) {
  return notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0).join('\n\n')
}

async function runStructuredModel<TPayload>({
  payload,
  passLabel,
  systemText,
  promptContext,
  schema,
  maxOutputTokens,
}: {
  payload: PromptRequest
  passLabel: string
  systemText: string
  promptContext: Record<string, unknown>
  schema: z.ZodType<TPayload>
  maxOutputTokens: number
}): Promise<StructuredModelResult<TPayload>> {
  const aiResponse = await runOpenAiResponses({
    model: payload.model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemText }] },
      { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(promptContext, null, 2) }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        ...genericJsonSchema,
      },
    },
    reasoning: { effort: 'low' },
    metadata: { feature: 'prompt-patch', pass: passLabel, mode: payload.mode ?? 'orchestrate' },
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
        assistantNotes: `GraphCore could not complete the ${passLabel.toLowerCase()} step.`,
      },
    }
  }

  const parsedJson = extractJsonBlock(aiResponse.outputText)
  if (!parsedJson) {
    const rawOutput = aiResponse.outputText || JSON.stringify(aiResponse.body ?? {}, null, 2)
    console.error(`[prompt-patch] ${passLabel} returned invalid JSON payload`, {
      model: payload.model,
      outputText: rawOutput,
      outputPreview: previewText(rawOutput),
      body: aiResponse.body,
    })
    return {
      ok: false,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [`${passLabel}: The model did not return valid JSON.`],
        assistantNotes: `GraphCore could not parse the ${passLabel.toLowerCase()} output.`,
        debugRawOutput: rawOutput || 'The model returned no textual output.',
      },
    }
  }

  try {
    return { ok: true, payload: schema.parse(parsedJson) }
  } catch (error) {
    console.error(`[prompt-patch] ${passLabel} failed schema validation`, { error, parsedJson })
    return {
      ok: false,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [`${passLabel}: The model returned an invalid structured payload.`],
        assistantNotes: `GraphCore could not validate the ${passLabel.toLowerCase()} output.`,
      },
    }
  }
}

async function runPatchPass({
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
}) {
  const modelResult = await runStructuredModel({
    payload,
    passLabel,
    systemText,
    promptContext,
    schema: patchResponseSchema,
    maxOutputTokens,
  })

  if (!modelResult.ok) return modelResult

  const repairedOperations = repairOperations(modelResult.payload.operations)
  const validation = validatePassOperations(validationSnapshot, repairedOperations, allowedOps, maxOperations, payload.graphType)

  if (validation.diagnostics.length > 0) {
    console.error(`[prompt-patch] ${passLabel} failed validator`, {
      model: payload.model,
      diagnostics: validation.diagnostics,
      operations: modelResult.payload.operations,
      repairedOperations,
    })

    return {
      ok: false as const,
      response: {
        summary: 'Rejected prompt proposal',
        operations: [],
        diagnostics: [
          ...prefixDiagnostics(passLabel, modelResult.payload.diagnostics),
          ...prefixDiagnostics(passLabel, validation.diagnostics),
        ],
        assistantNotes: modelResult.payload.assistantNotes,
      },
    }
  }

  return {
    ok: true as const,
    summary: modelResult.payload.summary,
    assistantNotes: modelResult.payload.assistantNotes,
    modelDiagnostics: prefixDiagnostics(passLabel, modelResult.payload.diagnostics),
    operations: validation.operations,
  }
}

function orchestratorSystemPrompt() {
  return [
    'You are the GraphCore orchestrator.',
    'Return JSON only.',
    'Decide whether the request is bootstrap, content-only, graph-only, or mixed.',
    'Plan dependencies first, then graph jobs.',
    'If graphs are needed, split them into independent jobs that can run in parallel.',
    'Graph jobs must rely on shared dependencies instead of inventing their own copies.',
    'Use compact, implementation-facing prompts for dependencyPrompt and each graph job.',
    'Prefer existing preset-backed content and compact starter graphs.',
  ].join('\n')
}

function bootstrapSystemPrompt() {
  return [
    'You are generating a starter game data layer for GraphCore.',
    'Return JSON only.',
    'Use the selected top-level game archetype and concept prompt to infer a compact initial GameSpec.',
    'Choose a small useful starter set, not an exhaustive game.',
    'Prefer existing preset families and only select preset IDs that exist in the provided catalog.',
    'Always include progression token support.',
    'If the game implies markets, include at least one currency and one market starter.',
  ].join('\n')
}

function buildExecutionPlan(
  classification: 'bootstrap' | 'single_content' | 'content_bundle' | 'single_graph' | 'multi_graph' | 'mixed_request',
  dependencyKinds: string[],
  graphJobs: Array<z.infer<typeof graphJobSchema>>,
) {
  return {
    classification,
    requiresDependencies: dependencyKinds.length > 0,
    dependencyKinds,
    graphJobCount: graphJobs.length,
    graphJobs: graphJobs.map((job) => ({
      title: job.title,
      prompt: job.prompt,
      graphType: job.graphType ?? null,
      graphKey: job.graphKey ?? null,
      targetMode: job.targetMode,
    })),
  }
}

function normalizeBootstrapSpec(payload: PromptRequest, blueprint: z.infer<typeof bootstrapBlueprintSchema>) {
  const baseSpec = createGameSpecFromArchetype(payload.gameArchetypeId ?? 'rpg', payload.gameConceptPrompt ?? payload.prompt)
  const packIds = [...new Set([
    ...baseSpec.selectedPresetIds.packs,
    ...blueprint.selectedPackIds.filter((packId) => packPresetMap.has(packId)),
  ])]
  const expanded = expandPackPresetIds(packIds)
  const starterArchetypes = [...new Set([
    ...expanded.archetypePresetIds,
    ...blueprint.starterArchetypePresetIds.filter((presetId) => archetypePresetMap.has(presetId)),
  ])]
  const starterDefinitions = [...new Set([
    ...expanded.definitionPresetIds,
    ...blueprint.starterDefinitionPresetIds.filter((presetId) => definitionPresetMap.has(presetId)),
  ])]
  const starterGraphs = [...new Set([
    ...(blueprint.starterGraphPresetIds.filter((presetId) => graphPresetMap.has(presetId)).length > 0
      ? blueprint.starterGraphPresetIds.filter((presetId) => graphPresetMap.has(presetId))
      : expanded.graphPresetIds),
  ])]

  return gameSpecSchema.parse({
    ...baseSpec,
    title: blueprint.title ?? baseSpec.title,
    theme: {
      ...baseSpec.theme,
      ...blueprint.theme,
      worldPremise: payload.gameConceptPrompt?.trim() || blueprint.theme.worldPremise || baseSpec.theme.worldPremise,
    },
    systems: {
      ...baseSpec.systems,
      ...blueprint.systems,
    },
    contentScope: {
      ...baseSpec.contentScope,
      ...blueprint.contentScope,
    },
    selectedPresetIds: {
      packs: packIds,
      archetypes: starterArchetypes,
      definitions: starterDefinitions,
      graphs: starterGraphs,
    },
    bootstrapTargets: {
      starterArchetypePresetIds: starterArchetypes,
      starterDefinitionPresetIds: starterDefinitions,
      starterGraphPresetIds: starterGraphs,
    },
    overrides: {
      ...baseSpec.overrides,
      bootstrapRequestSummary: blueprint.requestSummary,
    },
  })
}

async function persistPatchSet(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  userId: string,
  payload: PromptPatchHttpResponse,
  prompt: string,
  status: 'proposed' | 'rejected',
) {
  const insert = await client.from('patch_sets').insert({
    draft_id: draftId,
    prompt,
    summary: payload.summary,
    status,
    operations: payload.operations,
    diagnostics: payload.diagnostics,
    created_by: userId,
  }).select('id').single()

  return insert.data?.id ?? undefined
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
    const effectivePayload: PromptRequest = {
      ...payload,
      mode: 'orchestrate',
      context: payload.context ?? {
        graphKey: payload.selectionContext?.graphKey ?? null,
        nodeKey: payload.selectionContext?.nodeKey ?? null,
        edgeKey: payload.selectionContext?.edgeKey ?? null,
        target: payload.selectionContext?.target ?? 'content',
      },
      gameSpec: payload.gameSpec ?? payload.snapshot.gameSpec ?? null,
      gameConceptPrompt: payload.gameConceptPrompt ?? payload.prompt,
    }

    const promptContext = buildPromptContext({
      ...effectivePayload,
      context: effectivePayload.context,
    })

    if (effectivePayload.intent === 'bootstrap_game' || effectivePayload.phase === 'bootstrap_orchestrator' || effectivePayload.gameArchetypeId) {
      const bootstrapResult = await runStructuredModel({
        payload: effectivePayload,
        passLabel: 'Bootstrap orchestrator',
        systemText: bootstrapSystemPrompt(),
        promptContext: {
          ...promptContext,
          gameArchetypeId: effectivePayload.gameArchetypeId ?? 'rpg',
          gameConceptPrompt: effectivePayload.gameConceptPrompt ?? effectivePayload.prompt,
        },
        schema: bootstrapBlueprintSchema,
        maxOutputTokens: 8000,
      })

      if (!bootstrapResult.ok) {
        const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, bootstrapResult.response, effectivePayload.prompt, 'rejected')
        return json({ ...bootstrapResult.response, patchSetId })
      }

      const gameSpec = normalizeBootstrapSpec(effectivePayload, bootstrapResult.payload)
      const operations = buildBootstrapPatch(gameSpec)
      const validation = validateOperations(effectivePayload.snapshot, operations)

      if (validation.diagnostics.length > 0) {
        const rejectedResponse: PromptPatchHttpResponse = {
          requestSummary: bootstrapResult.payload.requestSummary,
          executionPlan: buildExecutionPlan('bootstrap', ['archetype', 'item', 'character', 'ability', 'location', 'market'], []),
          activityEntries: [
            { phase: 'bootstrap_orchestrator', status: 'completed', title: 'Derived starter game spec.', detail: `Archetype ${effectivePayload.gameArchetypeId ?? 'rpg'}.` },
            { phase: 'merge_and_apply', status: 'failed', title: 'Bootstrap validation failed.', detail: validation.diagnostics.join(' ') },
          ],
          summary: 'Rejected bootstrap proposal',
          operations: [],
          diagnostics: [...prefixDiagnostics('Bootstrap validation', validation.diagnostics), ...prefixDiagnostics('Bootstrap orchestrator', bootstrapResult.payload.diagnostics)],
          assistantNotes: bootstrapResult.payload.assistantNotes,
        }
        const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
        return json({ ...rejectedResponse, patchSetId })
      }

      const responsePayload: PromptPatchHttpResponse = {
        requestSummary: bootstrapResult.payload.requestSummary,
        executionPlan: buildExecutionPlan('bootstrap', ['archetype', 'item', 'character', 'ability', 'location', 'market'], []),
        activityEntries: [
          { phase: 'bootstrap_orchestrator', status: 'completed', title: 'Derived starter game spec.', detail: `Using ${effectivePayload.gameArchetypeId ?? 'rpg'} as the top-level archetype.` },
          { phase: 'merge_and_apply', status: 'planned', title: 'Bootstrap patch ready.', detail: `${validation.operations.length} operations ready for apply.` },
        ],
        summary: bootstrapResult.payload.requestSummary,
        operations: validation.operations,
        diagnostics: prefixDiagnostics('Bootstrap orchestrator', bootstrapResult.payload.diagnostics),
        assistantNotes: bootstrapResult.payload.assistantNotes,
      }

      const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, responsePayload, effectivePayload.prompt, 'proposed')
      return json({ ...responsePayload, patchSetId })
    }

    const orchestrationResult = await runStructuredModel({
      payload: effectivePayload,
      passLabel: 'Orchestrator',
      systemText: orchestratorSystemPrompt(),
      promptContext: {
        ...promptContext,
        selectionContext: effectivePayload.selectionContext ?? null,
        autoApply: effectivePayload.autoApply ?? false,
        gameArchetypeId: effectivePayload.gameArchetypeId ?? null,
      },
      schema: orchestratorPlanSchema,
      maxOutputTokens: 6000,
    })

    if (!orchestrationResult.ok) {
      const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, orchestrationResult.response, effectivePayload.prompt, 'rejected')
      return json({ ...orchestrationResult.response, patchSetId })
    }

    const executionPlan = buildExecutionPlan(
      orchestrationResult.payload.classification,
      orchestrationResult.payload.dependencyKinds,
      orchestrationResult.payload.graphJobs,
    )
    const diagnostics = [...prefixDiagnostics('Orchestrator', orchestrationResult.payload.diagnostics)]
    const activityEntries: PromptPatchHttpResponse['activityEntries'] = [
      {
        phase: 'bootstrap_orchestrator',
        status: 'completed',
        title: 'Generated execution plan.',
        detail: `${executionPlan.classification} with ${executionPlan.graphJobCount} graph job${executionPlan.graphJobCount === 1 ? '' : 's'}.`,
      },
    ]

    let operations: Array<Record<string, unknown>> = []
    let assistantNotes = orchestrationResult.payload.assistantNotes
    let workingSnapshot = effectivePayload.snapshot as Record<string, unknown>

    const shouldRunDependencyPass =
      orchestrationResult.payload.classification !== 'single_graph'
      || orchestrationResult.payload.dependencyPrompt.trim().length > 0
      || orchestrationResult.payload.dependencyKinds.length > 0

    if (shouldRunDependencyPass) {
      const dependencyPrompt = orchestrationResult.payload.dependencyPrompt.trim() || effectivePayload.prompt
      const dependencyPass = await runPatchPass({
        payload: { ...effectivePayload, prompt: dependencyPrompt, phase: 'dependency_generation' },
        passLabel: 'Dependency generation',
        systemText: contentPassSystemPrompt(),
        promptContext: {
          phase: 'dependency_generation',
          maxOperations: CONTENT_PASS_MAX_OPS,
          sharedExecutionPlan: executionPlan,
          ...buildPromptContext({ ...effectivePayload, prompt: dependencyPrompt, snapshot: workingSnapshot }),
        },
        validationSnapshot: workingSnapshot,
        allowedOps: CONTENT_PASS_ALLOWED_OPS,
        maxOperations: CONTENT_PASS_MAX_OPS,
        maxOutputTokens: 12000,
      })

      if (!dependencyPass.ok) {
        const rejectedResponse: PromptPatchHttpResponse = {
          requestSummary: orchestrationResult.payload.requestSummary,
          executionPlan,
          activityEntries: [
            ...activityEntries,
            { phase: 'dependency_generation', status: 'failed', title: 'Dependency generation failed.', detail: dependencyPass.response.diagnostics.join(' ') },
          ],
          summary: dependencyPass.response.summary,
          operations: [],
          diagnostics: [...diagnostics, ...dependencyPass.response.diagnostics],
          assistantNotes: combineAssistantNotes(assistantNotes, dependencyPass.response.assistantNotes),
          debugRawOutput: dependencyPass.response.debugRawOutput,
        }
        const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
        return json({ ...rejectedResponse, patchSetId })
      }

      diagnostics.push(...dependencyPass.modelDiagnostics)
      assistantNotes = combineAssistantNotes(assistantNotes, dependencyPass.assistantNotes)
      operations = [...operations, ...dependencyPass.operations]
      workingSnapshot = augmentSnapshotForPrompting(workingSnapshot, dependencyPass.operations)
      activityEntries.push({
        phase: 'dependency_generation',
        status: 'completed',
        title: 'Generated shared dependencies.',
        detail: `${dependencyPass.operations.length} operation${dependencyPass.operations.length === 1 ? '' : 's'} for shared content.`,
      })
    }

    if (orchestrationResult.payload.graphJobs.length > 0) {
      const graphWorkerResults = await Promise.all(orchestrationResult.payload.graphJobs.map(async (job, index) => {
        const graphPayload: PromptRequest = {
          ...effectivePayload,
          prompt: job.prompt,
          phase: 'graph_generation_parallel',
          targetMode: job.targetMode ?? (job.graphKey ? 'current_graph' : 'new_graph'),
          graphType: job.graphType ?? effectivePayload.graphType,
          context: {
            ...(effectivePayload.context ?? {}),
            graphKey: job.graphKey ?? effectivePayload.context?.graphKey ?? null,
            target: 'graph',
          },
        }

        return runPatchPass({
          payload: graphPayload,
          passLabel: `Graph worker ${index + 1}`,
          systemText: graphPassSystemPrompt(),
          promptContext: {
            phase: 'graph_generation_parallel',
            graphJob: job,
            sharedExecutionPlan: executionPlan,
            sharedDependencyOperations: operations,
            ...buildPromptContext({ ...graphPayload, snapshot: workingSnapshot }),
          },
          validationSnapshot: workingSnapshot,
          allowedOps: GRAPH_PASS_ALLOWED_OPS,
          maxOperations: GRAPH_PASS_MAX_OPS,
          maxOutputTokens: 20000,
        })
      }))

      for (const [index, result] of graphWorkerResults.entries()) {
        if (!result.ok) {
          const rejectedResponse: PromptPatchHttpResponse = {
            requestSummary: orchestrationResult.payload.requestSummary,
            executionPlan,
            activityEntries: [
              ...activityEntries,
              { phase: 'graph_generation_parallel', status: 'failed', title: `Graph worker ${index + 1} failed.`, detail: result.response.diagnostics.join(' ') },
            ],
            summary: result.response.summary,
            operations: [],
            diagnostics: [...diagnostics, ...result.response.diagnostics],
            assistantNotes: combineAssistantNotes(assistantNotes, result.response.assistantNotes),
            debugRawOutput: result.response.debugRawOutput,
          }
          const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
          return json({ ...rejectedResponse, patchSetId })
        }

        diagnostics.push(...result.modelDiagnostics)
        assistantNotes = combineAssistantNotes(assistantNotes, result.assistantNotes)
        operations = [...operations, ...result.operations]
        workingSnapshot = augmentSnapshotForPrompting(workingSnapshot, result.operations)
      }

      activityEntries.push({
        phase: 'graph_generation_parallel',
        status: 'completed',
        title: 'Generated graph jobs in parallel.',
        detail: `${orchestrationResult.payload.graphJobs.length} graph worker${orchestrationResult.payload.graphJobs.length === 1 ? '' : 's'} completed.`,
      })
    }

    const finalValidation = validateOperations(effectivePayload.snapshot, operations, effectivePayload.graphType)
    if (finalValidation.diagnostics.length > 0) {
      const rejectedResponse: PromptPatchHttpResponse = {
        requestSummary: orchestrationResult.payload.requestSummary,
        executionPlan,
        activityEntries: [
          ...activityEntries,
          { phase: 'merge_and_apply', status: 'failed', title: 'Final validation failed.', detail: finalValidation.diagnostics.join(' ') },
        ],
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
      const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, rejectedResponse, effectivePayload.prompt, 'rejected')
      return json({ ...rejectedResponse, patchSetId })
    }

    const responsePayload: PromptPatchHttpResponse = {
      requestSummary: orchestrationResult.payload.requestSummary,
      executionPlan,
      activityEntries: [
        ...activityEntries,
        { phase: 'merge_and_apply', status: 'planned', title: 'Merged operations ready.', detail: `${finalValidation.operations.length} operation${finalValidation.operations.length === 1 ? '' : 's'} ready for apply.` },
      ],
      summary: orchestrationResult.payload.requestSummary,
      operations: finalValidation.operations,
      diagnostics,
      assistantNotes,
    }

    const patchSetId = await persistPatchSet(client, effectivePayload.snapshot.draft.id, user.id, responsePayload, effectivePayload.prompt, 'proposed')
    return json({ ...responsePayload, patchSetId })
  } catch (error) {
    return errorResponse(error, 'Failed to generate patch.')
  }
})
