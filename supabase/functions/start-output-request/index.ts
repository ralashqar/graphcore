import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runOpenAiResponses } from '../_shared/openai.ts'
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

function buildEntityScopeCatalog(snapshot: z.infer<typeof outputRequestStartRequestSchema>['snapshot']) {
  return snapshot.worldEntities
    .filter((entity) => entity.nodeType !== 'sequence_unit')
    .slice(0, 160)
    .map((entity) => {
      const metadata = recordFromUnknown(entity.metadata)
      return {
        key: entity.key,
        name: entity.name,
        type: entity.nodeType,
        aliases: entity.aliases,
        summary: entity.summary,
        context: entity.context,
        visualDescription: textFromUnknown(metadata.visualDescription),
        hasImageAsset: Boolean(entity.thumbnailAssetKey || entity.thumbnail_asset_key || textFromUnknown(metadata.assetKey) || textFromUnknown(metadata.brandAtlasAssetKey)),
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
}) {
  if (!isImageOutputKind(input.planner.outputKind) || input.planner.intent !== 'output_generation') {
    return {
      planner: input.planner,
      scopeResolver: null as Record<string, unknown> | null,
    }
  }

  const entities = buildEntityScopeCatalog(input.snapshot)
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

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const initialPlanner = planOutputPrompt({
      prompt: payload.prompt,
      snapshot: payload.snapshot,
      selectedEntityKeys: payload.selectedEntityKeys,
      selectedSequenceUnitKeys: payload.selectedSequenceUnitKeys,
      targetFormat: payload.targetFormat,
    })
    const scopeResolution = await resolveOutputRequestWorldScope({
      prompt: payload.prompt,
      planner: initialPlanner,
      snapshot: payload.snapshot,
    })
    const planner = scopeResolution.planner
    const comicOutput = planner.outputKind === 'comic_issue_from_sequence'
    const cinematicOutput = planner.outputKind === 'cinematic_episode'
      || planner.outputKind === 'cinematic_trailer'
      || planner.outputKind === 'ugc_episode'
    const effectivePageCount = comicOutput ? payload.pageCount ?? 8 : null
    const debugSkipVideoGeneration = payload.debugSkipVideoGeneration ?? true
    const cinematicReferenceMode = payload.cinematicReferenceMode ?? 'storyboard_sheet'
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
              debugSkipVideoGeneration,
            }
            : null,
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
              debugSkipVideoGeneration,
            }
            : null,
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
              debugSkipVideoGeneration,
            }
            : null,
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
              debugSkipVideoGeneration,
            }
            : null,
          usageEstimate: plan.usageEstimate ?? null,
        },
      })
      .eq('id', outputRequest.id)
      .select(outputRequestSelect)
      .single()
    if (requestUpdateResponse.error || !requestUpdateResponse.data) throw new Error(requestUpdateResponse.error?.message ?? 'Failed to update output request.')
    outputRequest = mapOutputRequestRow(requestUpdateResponse.data)

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
