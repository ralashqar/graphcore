import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses } from '../_shared/openai.ts'
import { classifyPromptIntentServer } from '../_shared/prompt-intent.ts'
import {
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  getOutputWorkflowNodeExecutionMetadata,
  getOutputWorkflowNodeGuidanceConfig,
  isTerminalOutputWorkflowRunStatus,
  outputPromptPlannerResultSchema,
  outputRequestStartRequestSchema,
  outputRequestStatusResponseSchema,
  planOutputPrompt,
  planOutputRequestWorkflow,
  resolveCinematicStorySourceScope,
} from '../../../src/domain/outputWorkflow.ts'
import { z } from 'zod'
import {
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
  outputWorkflowSelect,
  validateOutputWorkflowGraph,
} from '../_shared/output-workflow.ts'
import { aiGenerationSettings } from '../../../src/config/aiGenerationSettings.ts'

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'output'
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned || 'Output request'
}

const outputScopeResolverSchema = z.object({
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  rationale: z.string().default(''),
})

function textFromUnknown(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function outputRequestPlannerModel() {
  return Deno.env.get('OUTPUT_REQUEST_PLANNER_MODEL')?.trim()
    || Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim()
    || 'gpt-5.4'
}

function isImageOutputKind(outputKind: string) {
  return outputKind === 'concept_art_image' || outputKind === 'poster_image'
}

function isCinematicOutputKind(outputKind: string) {
  return outputKind === 'cinematic_episode' || outputKind === 'cinematic_trailer' || outputKind === 'ugc_episode'
}

async function markPreviousSequenceAnimaticMastersStale(input: {
  client: any
  projectId: string
  draftId: string
  replacementRequestId: string
  selectedSequenceUnitKeys: string[]
}) {
  const sequenceKeys = [...new Set(input.selectedSequenceUnitKeys.map((key) => key.trim()).filter(Boolean))]
  if (sequenceKeys.length === 0) return

  const previousResponse = await input.client
    .from('output_requests')
    .select('id, latest_run_id, status, metadata, selected_sequence_unit_keys, parent_request_id, source_surface')
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .is('parent_request_id', null)
    .contains('selected_sequence_unit_keys', sequenceKeys)
    .neq('id', input.replacementRequestId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (previousResponse.error) throw new Error(previousResponse.error.message)

  const now = new Date().toISOString()
  const activeStatuses = new Set(['planning', 'queued', 'running'])
  for (const row of previousResponse.data ?? []) {
    const metadata = recordFromUnknown(row.metadata)
    const role = textFromUnknown(metadata.screenplayAnimaticRole) || textFromUnknown(metadata.sequenceAnimaticRole)
    const selectedKeys = stringArrayFromUnknown(row.selected_sequence_unit_keys)
    const sameSequence = sequenceKeys.every((key) => selectedKeys.includes(key))
    if (
      role !== 'master'
      || metadata.sequenceAnimaticStale === true
      || row.source_surface !== 'wiki_sequence_unit'
      || !sameSequence
    ) continue

    const runId = textFromUnknown(row.latest_run_id)
    let cancelWarning = ''
    if (runId && activeStatuses.has(textFromUnknown(row.status))) {
      try {
        const cancelResponse = await input.client.rpc('cancel_output_workflow_run', { run_id: runId })
        if (cancelResponse.error) {
          cancelWarning = cancelResponse.error.message
        }
      } catch (error) {
        cancelWarning = error instanceof Error ? error.message : String(error)
      }
    }

    const updatePayload: Record<string, unknown> = {
      metadata: {
        ...metadata,
        sequenceAnimaticStale: true,
        sequenceAnimaticStaleAt: now,
        sequenceAnimaticReplacedByRequestId: input.replacementRequestId,
        ...(cancelWarning ? { sequenceAnimaticCancelWarning: cancelWarning } : {}),
      },
    }
    if (activeStatuses.has(textFromUnknown(row.status))) {
      updatePayload.status = 'cancelled'
      updatePayload.error_message = null
    }

    const updateResponse = await input.client
      .from('output_requests')
      .update(updatePayload)
      .eq('id', row.id)
    if (updateResponse.error) throw new Error(updateResponse.error.message)

    try {
      await input.client.rpc('refresh_output_request_status_projection', { p_request_id: row.id })
    } catch {
      // Status projection refresh is best-effort here; stale marking already persisted.
    }
  }
}

function buildVariantScopeCatalog(variants: Record<string, unknown>[]) {
  return variants
    .slice(0, 12)
    .map((variant) => ({
      variantKey: textFromUnknown(variant.variant_key) || textFromUnknown(variant.variantKey),
      label: textFromUnknown(variant.label),
      summary: textFromUnknown(variant.summary),
      variantType: textFromUnknown(variant.variant_type) || textFromUnknown(variant.variantType),
      guidance: textFromUnknown(variant.guidance),
      status: textFromUnknown(variant.status),
      hasAsset: Boolean(textFromUnknown(variant.asset_key) || textFromUnknown(variant.assetKey)),
    }))
    .filter((variant) => variant.variantKey || variant.label || variant.summary)
}

function buildEntityScopeCatalog(
  snapshot: z.infer<typeof outputRequestStartRequestSchema>['snapshot'],
  variantsByEntityKey = new Map<string, Record<string, unknown>[]>(),
) {
  return snapshot.worldEntities
    .filter((entity) => entity.nodeType !== 'sequence_unit')
    .slice(0, 160)
    .map((entity) => {
      const metadata = recordFromUnknown(entity.metadata)
      const variants = buildVariantScopeCatalog(variantsByEntityKey.get(entity.key) ?? [])
      return {
        key: entity.key,
        name: entity.name,
        type: entity.nodeType,
        aliases: entity.aliases,
        summary: entity.summary,
        context: entity.context,
        visualDescription: textFromUnknown(metadata.visualDescription),
        referenceVariants: variants,
        hasImageAsset: Boolean(
          entity.thumbnailAssetKey
          || entity.thumbnail_asset_key
          || textFromUnknown(metadata.assetKey)
          || textFromUnknown(metadata.brandAtlasAssetKey)
          || variants.some((variant) => variant.hasAsset && variant.status === 'completed')
        ),
      }
    })
}

function buildSequenceScopeCatalog(snapshot: z.infer<typeof outputRequestStartRequestSchema>['snapshot']) {
  return snapshot.worldEntities
    .filter((entity) => entity.nodeType === 'sequence_unit')
    .slice(0, 80)
    .map((entity) => ({
      key: entity.key,
      name: entity.name,
      summary: entity.summary,
      context: entity.context,
    }))
}

async function resolveOutputRequestWorldScope(input: {
  prompt: string
  planner: z.infer<typeof outputPromptPlannerResultSchema>
  snapshot: z.infer<typeof outputRequestStartRequestSchema>['snapshot']
  variantsByEntityKey?: Map<string, Record<string, unknown>[]>
}) {
  if (isCinematicOutputKind(input.planner.outputKind) && input.planner.intent === 'output_generation') {
    const sourceResolution = resolveCinematicStorySourceScope({
      prompt: input.prompt,
      worldEntities: input.snapshot.worldEntities,
      selectedSequenceUnitKeys: input.planner.selectedSequenceUnitKeys,
    })
    const sequences = buildSequenceScopeCatalog(input.snapshot)
    const validEntityKeys = new Set(buildEntityScopeCatalog(input.snapshot, input.variantsByEntityKey).map((entity) => entity.key))
    const validSequenceKeys = new Set(sequences.map((sequence) => sequence.key))
    const selectedEntityKeys = input.planner.selectedEntityKeys.filter((key) => validEntityKeys.has(key))
    let selectedSequenceUnitKeys = sourceResolution.selectedSequenceUnitKeys
      .filter((key) => validSequenceKeys.has(key))
      .slice(0, 3)
    let resolverMode = 'cinematic_source'
    let resolverConfidence = sourceResolution.confidence
    let resolverRationale = sourceResolution.rationale
    let resolverError = ''
    if (selectedSequenceUnitKeys.length === 0 && sourceResolution.confidence < 0.9 && sequences.length > 0) {
      const model = outputRequestPlannerModel()
      try {
        const response = await runOpenAiResponses({
          model,
          instructions: [
            'You are GraphCore\'s cinematic story-source resolver.',
            'Infer from the user prompt whether this cinematic should adapt an existing sequence unit or be an independent new moment.',
            'Select a sequence unit when the prompt semantically asks for existing story material, including ordinal references like "first chapter", "opening scene", "finale", or phrases like "adapt", "from", "based on", "for this scene", or "where the uprising happens".',
            'Do not select a sequence unit merely because it mentions the same character or location as the prompt.',
            'If the user asks for a freeform moment with characters/locations, leave selectedSequenceUnitKeys empty.',
            'If multiple sequence units fit, choose the smallest most specific unit. If none clearly fit, return an empty selection with a concise rationale.',
            'Use only keys from the supplied sequence catalog. Return JSON only.',
          ].join('\n'),
          input: JSON.stringify({
            prompt: input.prompt,
            outputKind: input.planner.outputKind,
            project: input.snapshot.project,
            worldWiki: input.snapshot.worldWiki,
            sequenceCatalog: sequences,
          }),
          text: {
            format: {
              type: 'json_schema',
              name: 'graphcore_cinematic_source_resolution',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['selectedEntityKeys', 'selectedSequenceUnitKeys', 'confidence', 'rationale'],
                properties: {
                  selectedEntityKeys: { type: 'array', items: { type: 'string' } },
                  selectedSequenceUnitKeys: { type: 'array', items: { type: 'string' } },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  rationale: { type: 'string' },
                },
              },
            },
          },
          maxOutputTokens: 700,
          metadata: {
            graphcore_task: 'cinematic_source_resolver',
            graphcore_output_kind: input.planner.outputKind,
          },
          timeoutMs: 45_000,
        })
        if (!response.response.ok) throw new Error(`OpenAI cinematic source resolver failed with HTTP ${response.response.status}.`)
        const parsed = outputScopeResolverSchema.parse(JSON.parse(response.outputText))
        selectedSequenceUnitKeys = parsed.selectedSequenceUnitKeys
          .filter((key) => validSequenceKeys.has(key))
          .slice(0, 1)
        resolverMode = 'cinematic_source_llm'
        resolverConfidence = parsed.confidence
        resolverRationale = parsed.rationale || sourceResolution.rationale
      } catch (error) {
        resolverError = error instanceof Error ? error.message : String(error)
      }
    }
    const planner = outputPromptPlannerResultSchema.parse({
      ...input.planner,
      selectedEntityKeys,
      selectedSequenceUnitKeys,
      worldScope: selectedEntityKeys.length > 0 || selectedSequenceUnitKeys.length > 0 ? 'prompt_bound_scope' : 'full_world',
      plannerNotes: [
        input.planner.plannerNotes,
        resolverRationale ? `Cinematic source routing: ${resolverRationale}` : '',
      ].filter(Boolean).join('\n'),
    })
    return {
      planner,
      scopeResolver: {
        mode: resolverMode,
        sourceMode: sourceResolution.sourceMode,
        confidence: resolverConfidence,
        rationale: resolverRationale,
        ...(resolverError ? { error: resolverError } : {}),
        selectedEntityKeys: planner.selectedEntityKeys,
        selectedSequenceUnitKeys: planner.selectedSequenceUnitKeys,
      },
    }
  }

  if (!isImageOutputKind(input.planner.outputKind) || input.planner.intent !== 'output_generation') {
    return {
      planner: input.planner,
      scopeResolver: null as Record<string, unknown> | null,
    }
  }

  const entities = buildEntityScopeCatalog(input.snapshot, input.variantsByEntityKey)
  const sequences = buildSequenceScopeCatalog(input.snapshot)
  if (entities.length === 0 && sequences.length === 0) {
    return {
      planner: input.planner,
      scopeResolver: {
        mode: 'skipped',
        reason: 'no_world_entities_available',
      },
    }
  }

  const validEntityKeys = new Set(entities.map((entity) => entity.key))
  const validSequenceKeys = new Set(sequences.map((sequence) => sequence.key))
  const model = outputRequestPlannerModel()

  try {
    const response = await runOpenAiResponses({
      model,
      instructions: [
        'You are GraphCore\'s output world-scope resolver.',
        'Select only the world graph entities and sequence units directly needed by the user prompt for this output.',
        'For image prompts, choose the characters, places, objects, or concepts explicitly named or clearly required as visual references.',
        'If the prompt names a visual variant such as wardrobe, gear, outfit, room, chamber, cafe, or shot-location, select the parent entity that owns that referenceVariants entry.',
        'For place phrases like "in the leader\'s chamber of Whistlewick", select the Whistlewick/location parent that owns the Leader\'s Chamber-style variant; do not select unrelated props or items just because their names include one generic word such as chamber.',
        'Prefer exact or multi-word variant label/summary matches over single-word entity-name matches.',
        'Do not broaden to the surrounding cast, chapter cast, factions, or related characters unless the prompt asks for them.',
        'If a prompt says "Ilya saluting to Anya", select Ilya and Anya only, plus a location only if it is named or visually required.',
        'Use only keys from the supplied catalog. Return JSON only.',
      ].join('\n'),
      input: JSON.stringify({
        prompt: input.prompt,
        outputKind: input.planner.outputKind,
        targetFormat: input.planner.targetFormat,
        project: input.snapshot.project,
        worldWiki: input.snapshot.worldWiki,
        currentPlannerSelection: {
          selectedEntityKeys: input.planner.selectedEntityKeys,
          selectedSequenceUnitKeys: input.planner.selectedSequenceUnitKeys,
        },
        entityCatalog: entities,
        sequenceCatalog: sequences,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'graphcore_output_scope_resolution',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['selectedEntityKeys', 'selectedSequenceUnitKeys', 'confidence', 'rationale'],
            properties: {
              selectedEntityKeys: {
                type: 'array',
                items: { type: 'string' },
              },
              selectedSequenceUnitKeys: {
                type: 'array',
                items: { type: 'string' },
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
              },
              rationale: {
                type: 'string',
              },
            },
          },
        },
      },
      maxOutputTokens: 900,
      metadata: {
        graphcore_task: 'output_request_scope_resolver',
        graphcore_output_kind: input.planner.outputKind,
      },
      timeoutMs: 45_000,
    })

    if (!response.response.ok) throw new Error(`OpenAI scope resolver failed with HTTP ${response.response.status}.`)
    const parsed = outputScopeResolverSchema.parse(JSON.parse(response.outputText))
    const selectedEntityKeys = parsed.selectedEntityKeys
      .filter((key) => validEntityKeys.has(key))
      .slice(0, 12)
    const selectedSequenceUnitKeys = parsed.selectedSequenceUnitKeys
      .filter((key) => validSequenceKeys.has(key))
      .slice(0, 3)
    const keepExistingEntityKeys = input.planner.selectedEntityKeys.filter((key) => validEntityKeys.has(key))
    const keepExistingSequenceKeys = input.planner.selectedSequenceUnitKeys.filter((key) => validSequenceKeys.has(key))
    const resolvedEntityKeys = selectedEntityKeys.length > 0
      ? selectedEntityKeys
      : keepExistingEntityKeys
    const resolvedSequenceKeys = selectedSequenceUnitKeys.length > 0
      ? selectedSequenceUnitKeys
      : keepExistingSequenceKeys
    const planner = outputPromptPlannerResultSchema.parse({
      ...input.planner,
      selectedEntityKeys: [...new Set(resolvedEntityKeys)],
      selectedSequenceUnitKeys: [...new Set(resolvedSequenceKeys)],
      worldScope: resolvedEntityKeys.length > 0 || resolvedSequenceKeys.length > 0 ? 'prompt_bound_scope' : 'full_world',
      plannerNotes: [
        input.planner.plannerNotes,
        parsed.rationale ? `Scope resolver: ${parsed.rationale}` : '',
      ].filter(Boolean).join('\n'),
    })
    return {
      planner,
      scopeResolver: {
        mode: 'llm',
        model,
        confidence: parsed.confidence,
        rationale: parsed.rationale,
        selectedEntityKeys: planner.selectedEntityKeys,
        selectedSequenceUnitKeys: planner.selectedSequenceUnitKeys,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      planner: input.planner,
      scopeResolver: {
        mode: 'fallback',
        model,
        error: message,
        selectedEntityKeys: input.planner.selectedEntityKeys,
        selectedSequenceUnitKeys: input.planner.selectedSequenceUnitKeys,
      },
    }
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-output-request')
    const payload = outputRequestStartRequestSchema.parse(await request.json())
    let sequenceAnimaticMode = payload.sequenceAnimaticMode ?? null
    let cinematicAnimaticMode = payload.cinematicAnimaticMode ?? null

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const outputKindOverride = payload.outputKindOverride && payload.outputKindOverride !== 'unknown'
      ? payload.outputKindOverride
      : null
    const promptIntentClassification = outputKindOverride
      ? {
        intent: 'output_generation' as const,
        outputKind: outputKindOverride,
        targetFormat: payload.targetFormat,
        confidence: 1,
        requiresConfirmation: false,
        rationale: `Trusted UI action from ${payload.sourceSurface} selected ${outputKindOverride}.`,
        alternatives: [],
        catalogVersion: 'trusted-ui-output-kind-override-v1',
        classifierMode: 'trusted_ui_override',
      }
      : await classifyPromptIntentServer({
        projectId: payload.projectId,
        draftId: payload.draftId,
        prompt: payload.prompt,
        sourceSurface: payload.sourceSurface,
        selectedSuggestionId: null,
        selectedEntityKeys: payload.selectedEntityKeys,
        selectedSequenceUnitKeys: payload.selectedSequenceUnitKeys,
        snapshot: payload.snapshot,
      })
    const initialPlanner = outputKindOverride
      ? outputPromptPlannerResultSchema.parse({
        intent: 'output_generation',
        outputKind: outputKindOverride,
        confidence: 1,
        targetFormat: outputKindOverride === 'poster_image' || outputKindOverride === 'concept_art_image'
          ? 'image'
          : outputKindOverride === 'cinematic_episode' || outputKindOverride === 'cinematic_trailer' || outputKindOverride === 'ugc_episode'
            ? 'video'
            : payload.targetFormat,
        worldScope: payload.selectedSequenceUnitKeys.length > 0
          ? 'selected_sequence_units'
          : payload.selectedEntityKeys.length > 0
            ? 'selected_entities'
            : 'prompt_bound_scope',
        selectedEntityKeys: payload.selectedEntityKeys,
        selectedSequenceUnitKeys: payload.selectedSequenceUnitKeys,
        documentMode: outputKindOverride === 'poster_image' || outputKindOverride === 'concept_art_image'
          ? 'visual'
          : outputKindOverride === 'cinematic_episode' || outputKindOverride === 'cinematic_trailer' || outputKindOverride === 'ugc_episode'
            ? 'cinematic'
            : outputKindOverride === 'comic_issue_from_sequence'
              ? 'comic'
              : 'narrative',
        sections: [],
        visualReferencePolicy: outputKindOverride === 'poster_image'
          || outputKindOverride === 'concept_art_image'
          || outputKindOverride === 'cinematic_episode'
          || outputKindOverride === 'cinematic_trailer'
          || outputKindOverride === 'ugc_episode'
          ? 'use_prompt_bound_entity_refs'
          : 'none',
        requiresConfirmation: false,
        plannerNotes: `Trusted UI action from ${payload.sourceSurface} bypassed prompt intent classification.`,
        classifierMode: 'trusted_ui_override',
        classifierCatalogVersion: 'trusted-ui-output-kind-override-v1',
        classifierRationale: `Trusted UI action selected ${outputKindOverride}.`,
        classifierCandidates: [],
      })
      : planOutputPrompt({
        prompt: payload.prompt,
        snapshot: payload.snapshot,
        selectedEntityKeys: payload.selectedEntityKeys,
        selectedSequenceUnitKeys: payload.selectedSequenceUnitKeys,
        targetFormat: payload.targetFormat,
        classification: promptIntentClassification,
      })
    const variantsByEntityKey = new Map<string, Record<string, unknown>[]>()
    if (isImageOutputKind(initialPlanner.outputKind) && initialPlanner.intent === 'output_generation') {
      const variantResponse = await client
        .from('world_entity_visual_variants')
        .select('entity_key, variant_key, label, summary, variant_type, asset_key, guidance, status')
        .eq('draft_id', payload.draftId)
      if (!variantResponse.error) {
        for (const row of variantResponse.data ?? []) {
          const record = recordFromUnknown(row)
          const entityKey = textFromUnknown(record.entity_key)
          if (!entityKey) continue
          variantsByEntityKey.set(entityKey, [...(variantsByEntityKey.get(entityKey) ?? []), record])
        }
      } else {
        console.warn('[start-output-request] failed to load entity visual variants for scope resolver', {
          draftId: payload.draftId,
          message: variantResponse.error.message,
        })
      }
    }
    const scopeResolution = await resolveOutputRequestWorldScope({
      prompt: payload.prompt,
      planner: initialPlanner,
      snapshot: payload.snapshot,
      variantsByEntityKey,
    })
    const planner = scopeResolution.planner
    const comicOutput = planner.outputKind === 'comic_issue_from_sequence'
    const cinematicOutput = planner.outputKind === 'cinematic_episode'
      || planner.outputKind === 'cinematic_trailer'
      || planner.outputKind === 'ugc_episode'
    const effectivePageCount = comicOutput ? payload.pageCount ?? 8 : null
    const debugSkipVideoGeneration = payload.debugSkipVideoGeneration ?? true
    const cinematicReferenceMode = payload.cinematicReferenceMode ?? aiGenerationSettings.outputWorkflow.cinematicReferenceModeDefault
    const cinematicV2AnimaticMode = payload.cinematicV2AnimaticMode ?? 'fast_panels'
    if (cinematicOutput && (payload.cinematicPipelineVersion === 'v1_take_blocks' || payload.cinematicPipelineVersion === 'v2_shot_orchestration')) {
      throw new HttpError(400, 'Legacy cinematic pipelines v1_take_blocks and v2_shot_orchestration are retired for new requests. Use the current screenplay animatic pipeline.')
    }
    const cinematicPipelineVersion = payload.cinematicPipelineVersion
      ?? (cinematicOutput ? 'v3_script_storyboards' : undefined)
    if (
      !sequenceAnimaticMode
      && cinematicOutput
      && cinematicPipelineVersion === 'v3_script_storyboards'
      && payload.selectedSequenceUnitKeys.length > 0
    ) {
      sequenceAnimaticMode = 'master_script_only'
    }
    if (
      !sequenceAnimaticMode
      && !cinematicAnimaticMode
      && cinematicOutput
      && cinematicPipelineVersion === 'v3_script_storyboards'
    ) {
      cinematicAnimaticMode = 'prompt_cinematic_master'
    }
    const sequenceAnimaticMasterRequest = sequenceAnimaticMode === 'master_script_only'
      && payload.selectedSequenceUnitKeys.length > 0
    const promptCinematicAnimaticMasterRequest = cinematicOutput
      && cinematicPipelineVersion === 'v3_script_storyboards'
      && cinematicAnimaticMode === 'prompt_cinematic_master'
    const screenplayAnimaticMasterRequest = sequenceAnimaticMasterRequest || promptCinematicAnimaticMasterRequest
    const screenplayAnimaticRole = screenplayAnimaticMasterRequest ? 'master' : null
    const screenplayAnimaticSource = sequenceAnimaticMasterRequest
      ? 'wiki_sequence_unit'
      : promptCinematicAnimaticMasterRequest
        ? 'prompt_cinematic'
        : null
    const sequenceAnimaticRole = screenplayAnimaticRole
    const debugCinematicStoryboardStyleSafeMode = payload.debugCinematicStoryboardStyleSafeMode
      ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault
    const cinematicStoryboardStyleOverride = debugCinematicStoryboardStyleSafeMode
      ? payload.cinematicStoryboardStyleOverride ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt
      : ''
    const requestInsertResponse = await client
      .from('output_requests')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        requested_by: user.id,
        source_surface: payload.sourceSurface,
        prompt: payload.prompt,
        title: titleFromPrompt(payload.prompt),
        intent: planner.intent,
        output_kind: planner.outputKind,
        status: planner.intent === 'output_generation' && !planner.requiresConfirmation ? 'planning' : 'awaiting_confirmation',
        selected_entity_keys: planner.selectedEntityKeys.length > 0 ? planner.selectedEntityKeys : payload.selectedEntityKeys,
        selected_sequence_unit_keys: planner.selectedSequenceUnitKeys.length > 0 ? planner.selectedSequenceUnitKeys : payload.selectedSequenceUnitKeys,
        page_count: effectivePageCount,
        target_format: planner.targetFormat,
        planner_notes: planner.plannerNotes,
        metadata: {
          planner,
          classification: planner,
          promptIntentClassifier: promptIntentClassification,
          scopeResolver: scopeResolution.scopeResolver,
          confidence: planner.confidence,
          plannedSections: planner.sections,
          cinematicOptions: cinematicOutput
            ? {
              videoBlockCount: payload.videoBlockCount ?? null,
              durationPerBlockSeconds: payload.durationPerBlockSeconds ?? null,
              aspectRatio: payload.aspectRatio ?? null,
              videoResolution: payload.videoResolution ?? null,
              generateAudio: payload.generateAudio ?? null,
              cinematicPresetFamily: payload.cinematicPresetFamily ?? null,
              cinematicReferenceMode,
              cinematicPipelineVersion,
              cinematicV2AnimaticMode,
              sequenceAnimaticMode,
              cinematicAnimaticMode,
              debugCinematicStoryboardStyleSafeMode,
              cinematicStoryboardStyleOverride,
              debugSkipVideoGeneration,
            }
            : null,
          screenplayAnimaticRole,
          screenplayAnimaticSource,
          sequenceAnimaticRole,
        },
      })
      .select(outputRequestSelect)
      .single()
    if (requestInsertResponse.error || !requestInsertResponse.data) throw new Error(requestInsertResponse.error?.message ?? 'Failed to create output request.')
    let outputRequest = mapOutputRequestRow(requestInsertResponse.data)

    if (planner.intent !== 'output_generation' || planner.requiresConfirmation) {
      return json(outputRequestStatusResponseSchema.parse({
        ok: true,
        request: outputRequest,
        workflow: null,
        nodes: [],
        edges: [],
        run: null,
        artifacts: [],
        terminal: false,
      }))
    }

    const plan = planOutputRequestWorkflow({
      projectId: payload.projectId,
      draftId: payload.draftId,
      prompt: payload.prompt,
      selectedEntityKeys: planner.selectedEntityKeys,
      selectedSequenceUnitKeys: planner.selectedSequenceUnitKeys,
      pageCount: effectivePageCount ?? undefined,
      targetFormat: planner.targetFormat,
      documentMode: planner.documentMode === 'designed_reference'
        ? 'designed_reference'
        : planner.documentMode === 'reference'
          ? 'reference'
          : undefined,
      pageSize: planner.documentMode === 'designed_reference' ? 'a4' : undefined,
      imagePolicy: planner.documentMode === 'designed_reference' ? 'inline_entity_images' : undefined,
      imageQuality: payload.imageQuality,
      imageOutputFormat: payload.imageOutputFormat,
      videoBlockCount: payload.videoBlockCount,
      durationPerBlockSeconds: payload.durationPerBlockSeconds,
      aspectRatio: payload.aspectRatio,
      videoResolution: payload.videoResolution,
      generateAudio: payload.generateAudio,
      cinematicPresetFamily: payload.cinematicPresetFamily,
      cinematicReferenceMode,
      cinematicPipelineVersion,
      debugCinematicStoryboardStyleSafeMode,
      cinematicStoryboardStyleOverride,
      sequenceAnimaticMode,
      cinematicAnimaticMode,
      debugSkipVideoGeneration,
      snapshot: payload.snapshot,
    }, planner.outputKind)
    const validation = validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges })
    if (!validation.ok) throw new HttpError(400, validation.diagnostics.join(' '))

    const workflowKey = `output.${slugify(plan.name)}.${crypto.randomUUID().slice(0, 8)}`
    const workflowResponse = await client
      .from('output_workflows')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: workflowKey,
        name: plan.name,
        description: plan.description,
        preset: plan.preset,
        status: 'active',
        created_by: user.id,
        metadata: {
          prompt: plan.prompt,
          targetFormat: plan.targetFormat,
          sourceEntityKeys: plan.sourceEntityKeys,
          sourceSequenceUnitKeys: plan.sourceSequenceUnitKeys,
          diagnostics: plan.diagnostics,
          outputRequestId: outputRequest.id,
          outputKind: planner.outputKind,
          planner,
          scopeResolver: scopeResolution.scopeResolver,
          plannedSections: planner.sections,
          documentMode: planner.documentMode,
          pageSize: planner.documentMode === 'designed_reference' ? 'a4' : null,
          imageQuality: payload.imageQuality ?? null,
          imageOutputFormat: payload.imageOutputFormat ?? null,
          cinematicOptions: cinematicOutput
            ? {
              videoBlockCount: payload.videoBlockCount ?? null,
              durationPerBlockSeconds: payload.durationPerBlockSeconds ?? null,
              aspectRatio: payload.aspectRatio ?? null,
              videoResolution: payload.videoResolution ?? null,
              generateAudio: payload.generateAudio ?? null,
              cinematicPresetFamily: payload.cinematicPresetFamily ?? null,
              cinematicReferenceMode,
              cinematicPipelineVersion,
              cinematicV2AnimaticMode,
              sequenceAnimaticMode,
              cinematicAnimaticMode,
              debugCinematicStoryboardStyleSafeMode,
              cinematicStoryboardStyleOverride,
              debugSkipVideoGeneration,
            }
            : null,
          screenplayAnimaticRole,
          screenplayAnimaticSource,
          sequenceAnimaticRole,
          usageEstimate: plan.usageEstimate ?? null,
        },
      })
      .select(outputWorkflowSelect)
      .single()
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to create output workflow.')
    const workflow = mapOutputWorkflowRow(workflowResponse.data)

    const nodeResponse = await client
      .from('output_workflow_nodes')
      .insert(plan.nodes.map((node) => ({
        workflow_id: workflow.id,
        draft_id: payload.draftId,
        key: node.key,
        node_type: node.nodeType,
        label: node.label,
        position: node.position,
        config: node.config,
        inputs: node.inputs,
        outputs: node.outputs,
        dirty: node.dirty,
        input_hash: node.inputHash,
        output_hash: node.outputHash,
        metadata: node.metadata,
      })))
      .select(outputWorkflowNodeSelect)
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    const nodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)

    const edgeResponse = await client
      .from('output_workflow_edges')
      .insert(plan.edges.map((edge) => ({
        workflow_id: workflow.id,
        draft_id: payload.draftId,
        key: edge.key,
        source_node_key: edge.sourceNodeKey,
        source_port: edge.sourcePort,
        target_node_key: edge.targetNodeKey,
        target_port: edge.targetPort,
        metadata: edge.metadata,
      })))
      .select(outputWorkflowEdgeSelect)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    const edges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)

    const now = new Date().toISOString()
    const input = {
      projectContext: payload.snapshot.projectContext,
      worldEntities: payload.snapshot.worldEntities,
      worldRelationships: payload.snapshot.worldRelationships,
      worldThreads: payload.snapshot.worldThreads,
      worldWiki: payload.snapshot.worldWiki,
      assets: Array.isArray(payload.runInput.assets) ? payload.runInput.assets : [],
      sourceEntityKeys: plan.sourceEntityKeys,
      sourceSequenceUnitKeys: plan.sourceSequenceUnitKeys,
      ...(effectivePageCount ? { pageCount: effectivePageCount } : {}),
      documentMode: planner.documentMode,
      pageSize: planner.documentMode === 'designed_reference' ? 'a4' : null,
      imagePolicy: planner.documentMode === 'designed_reference' ? 'inline_entity_images' : 'none',
      ...(cinematicOutput
        ? {
          videoBlockCount: payload.videoBlockCount ?? null,
          durationPerBlockSeconds: payload.durationPerBlockSeconds ?? null,
          aspectRatio: payload.aspectRatio ?? null,
          videoResolution: payload.videoResolution ?? null,
          generateAudio: payload.generateAudio ?? true,
          cinematicPresetFamily: payload.cinematicPresetFamily ?? null,
          cinematicReferenceMode,
          cinematicPipelineVersion,
          cinematicV2AnimaticMode,
          sequenceAnimaticMode,
          cinematicAnimaticMode,
          debugCinematicStoryboardStyleSafeMode,
          cinematicStoryboardStyleOverride,
          debugSkipVideoGeneration,
        }
        : {}),
    }
    const runResponse = await client
      .from('output_workflow_runs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        workflow_id: workflow.id,
        requested_by: user.id,
        status: 'queued',
        preset: workflow.preset,
        prompt: payload.prompt,
        target_format: plan.targetFormat,
        world_snapshot_fingerprint: buildOutputWorkflowFingerprint(input),
        input,
        metadata: {
          queuedAt: now,
          startedBy: 'start-output-request',
          outputRequestId: outputRequest.id,
          outputKind: planner.outputKind,
          planner,
          scopeResolver: scopeResolution.scopeResolver,
          plannedSections: planner.sections,
          documentMode: planner.documentMode,
          pageSize: planner.documentMode === 'designed_reference' ? 'a4' : null,
          imageQuality: payload.imageQuality ?? null,
          imageOutputFormat: payload.imageOutputFormat ?? null,
          cinematicOptions: cinematicOutput
            ? {
              videoBlockCount: payload.videoBlockCount ?? null,
              durationPerBlockSeconds: payload.durationPerBlockSeconds ?? null,
              aspectRatio: payload.aspectRatio ?? null,
              videoResolution: payload.videoResolution ?? null,
              generateAudio: payload.generateAudio ?? null,
              cinematicPresetFamily: payload.cinematicPresetFamily ?? null,
              cinematicReferenceMode,
              cinematicPipelineVersion,
              cinematicV2AnimaticMode,
              sequenceAnimaticMode,
              cinematicAnimaticMode,
              debugCinematicStoryboardStyleSafeMode,
              cinematicStoryboardStyleOverride,
              debugSkipVideoGeneration,
            }
            : null,
          screenplayAnimaticRole,
          screenplayAnimaticSource,
          usageEstimate: plan.usageEstimate ?? null,
        },
        heartbeat_at: now,
      })
      .select(outputWorkflowRunSelect)
      .single()
    if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Failed to create output workflow run.')

    const executionPlan = buildOutputWorkflowExecutionPlan(nodes, edges)
    const nodeOrder = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const stepResponse = await client
      .from('output_workflow_run_steps')
      .insert(nodes
        .slice()
        .sort((left, right) => (nodeOrder.get(left.key) ?? 999) - (nodeOrder.get(right.key) ?? 999))
        .map((node, index) => ({
          run_id: runResponse.data.id,
          workflow_id: workflow.id,
          node_id: node.id,
          draft_id: payload.draftId,
          node_key: node.key,
          node_type: node.nodeType,
          status: 'queued',
          order_index: index,
          label: node.label,
          metadata: {
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            skillKeys: getOutputWorkflowNodeGuidanceConfig(node).skillKeys,
            guidanceMode: getOutputWorkflowNodeGuidanceConfig(node).guidanceMode,
            outputRequestId: outputRequest.id,
            aiUsageEstimate: plan.usageEstimate?.lines.find((line) => line.nodeKey === node.key) ?? null,
          },
        })))
      .select(outputWorkflowRunStepSelect)
    if (stepResponse.error) throw new Error(stepResponse.error.message)

    const requestUpdateResponse = await client
      .from('output_requests')
      .update({
        workflow_id: workflow.id,
        latest_run_id: runResponse.data.id,
        status: 'running',
        selected_entity_keys: plan.sourceEntityKeys,
        selected_sequence_unit_keys: plan.sourceSequenceUnitKeys,
        target_format: plan.targetFormat,
        planner_notes: [planner.plannerNotes, ...plan.diagnostics].filter(Boolean).join('\n'),
        metadata: {
          ...outputRequest.metadata,
          planner,
          classification: planner,
          scopeResolver: scopeResolution.scopeResolver,
          planDiagnostics: plan.diagnostics,
          preset: plan.preset,
          plannedSections: planner.sections,
          imageQuality: payload.imageQuality ?? null,
          imageOutputFormat: payload.imageOutputFormat ?? null,
          cinematicOptions: cinematicOutput
            ? {
              videoBlockCount: payload.videoBlockCount ?? null,
              durationPerBlockSeconds: payload.durationPerBlockSeconds ?? null,
              aspectRatio: payload.aspectRatio ?? null,
              videoResolution: payload.videoResolution ?? null,
              generateAudio: payload.generateAudio ?? null,
              cinematicPresetFamily: payload.cinematicPresetFamily ?? null,
              cinematicReferenceMode,
              cinematicPipelineVersion,
              cinematicV2AnimaticMode,
              sequenceAnimaticMode,
              cinematicAnimaticMode,
              debugCinematicStoryboardStyleSafeMode,
              cinematicStoryboardStyleOverride,
              debugSkipVideoGeneration,
            }
            : null,
          screenplayAnimaticRole,
          screenplayAnimaticSource,
          sequenceAnimaticRole,
          usageEstimate: plan.usageEstimate ?? null,
        },
      })
      .eq('id', outputRequest.id)
      .select(outputRequestSelect)
      .single()
    if (requestUpdateResponse.error || !requestUpdateResponse.data) throw new Error(requestUpdateResponse.error?.message ?? 'Failed to update output request.')
    outputRequest = mapOutputRequestRow(requestUpdateResponse.data)

    if (sequenceAnimaticMasterRequest) {
      await markPreviousSequenceAnimaticMastersStale({
        client,
        projectId: payload.projectId,
        draftId: payload.draftId,
        replacementRequestId: outputRequest.id,
        selectedSequenceUnitKeys: plan.sourceSequenceUnitKeys.length > 0
          ? plan.sourceSequenceUnitKeys
          : payload.selectedSequenceUnitKeys,
      })
    }

    const artifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runResponse.data.id)
    if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
    const artifacts = (artifactsResponse.data ?? []).map(mapOutputArtifactRow)
    const run = mapOutputWorkflowRunRow(
      runResponse.data,
      (stepResponse.data ?? []).map(mapOutputWorkflowRunStepRow),
      artifacts,
    )
    return json(outputRequestStatusResponseSchema.parse({
      ok: true,
      request: outputRequest,
      workflow,
      nodes,
      edges,
      run,
      artifacts,
      terminal: isTerminalOutputWorkflowRunStatus(run.status),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start output request.')
  }
})
