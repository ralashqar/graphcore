import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type BatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  planner_mode: string | null
  status: string
  diagnostics: string[] | null
  plan_json: unknown[]
  cinematic_plan: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type JobRow = {
  id: string
  batch_id: string
  plan_item_id: string
  kind: string
  status: string
  depends_on_job_ids: string[] | null
  target_keys: Record<string, string> | null
  prompt: string
  options: Record<string, unknown> | null
  provider_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  result_context: Record<string, unknown> | null
  error_message: string | null
  order_index: number
  created_at: string
  updated_at: string
}

let worldBuildAuthorCinematicRequestSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildBatchSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildBatchCinematicPlanSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildJobSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildStatusResponseSchemaRuntime: z.ZodTypeAny | null = null

async function loadBatch(
  client: any,
  batchId: string,
) {
  const batchResponse = await client
    .from('world_build_batches')
    .select('id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, plan_json, cinematic_plan, created_at, updated_at')
    .eq('id', batchId)
    .single()

  if (batchResponse.error || !batchResponse.data) {
    throw new Error(batchResponse.error?.message ?? `World build batch ${batchId} was not found.`)
  }

  const jobsResponse = await client
    .from('world_build_jobs')
    .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, provider_request_id, status_url, response_url, cancel_url, result_context, error_message, order_index, created_at, updated_at')
    .eq('batch_id', batchId)
    .order('order_index', { ascending: true })

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  return {
    batch: batchResponse.data as BatchRow,
    jobs: (jobsResponse.data ?? []) as JobRow[],
  }
}

async function loadBatchResources(
  client: any,
  draftId: string,
  projectId: string,
  batchId: string,
) {
  const batchJobsResponse = await client
    .from('world_build_jobs')
    .select('kind, target_keys')
    .eq('batch_id', batchId)

  if (batchJobsResponse.error) {
    throw new Error(batchJobsResponse.error.message)
  }

  const existingDefinitionKeys = Array.from(new Set(
    ((batchJobsResponse.data ?? []) as Array<{ kind?: string | null; target_keys?: Record<string, unknown> | null }>)
      .flatMap((job) => {
        const definitionKey = typeof job.target_keys?.definitionKey === 'string' ? job.target_keys.definitionKey : null
        if (!definitionKey) return []
        if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image' || job.kind === 'environment_concept_image') {
          return [definitionKey]
        }
        return []
      }),
  ))

  const [definitionsResponse, graphsResponse, graphNodesResponse, graphEdgesResponse, assetsResponse] = await Promise.all([
    client
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
    client
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    client
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', projectId)
      .contains('metadata', { generation: { batchId } }),
  ])

  if (definitionsResponse.error || graphsResponse.error || assetsResponse.error || graphNodesResponse.error || graphEdgesResponse.error) {
    throw new Error(
      definitionsResponse.error?.message
      ?? graphsResponse.error?.message
      ?? graphNodesResponse.error?.message
      ?? graphEdgesResponse.error?.message
      ?? assetsResponse.error?.message
      ?? 'Failed to load world build resources.',
    )
  }

  const directDefinitionsResponse = existingDefinitionKeys.length > 0
    ? await client
        .from('project_definitions')
        .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
        .eq('draft_id', draftId)
        .in('key', existingDefinitionKeys)
    : { data: [], error: null }

  if (directDefinitionsResponse.error) {
    throw new Error(directDefinitionsResponse.error.message)
  }

  const mergedDefinitionRows = Array.from(
    new Map(
      [...(definitionsResponse.data ?? []), ...(directDefinitionsResponse.data ?? [])].map((definition) => [definition.key, definition]),
    ).values(),
  )

  const definitions = await Promise.all(mergedDefinitionRows.map(async (definition) => {
    const componentsResponse = await client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)

    if (componentsResponse.error) {
      throw new Error(componentsResponse.error.message)
    }

    return {
      id: definition.id,
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary ?? '',
      status: definition.status,
      iconAssetKey: definition.icon_asset_key,
      archetypeKey: definition.archetype_key,
      tags: definition.tags ?? [],
      schemaVersion: definition.schema_version ?? 1,
      metadata: definition.metadata ?? {},
      llmHints: definition.llm_hints ?? {},
      assetRefs: definition.asset_refs ?? [],
      definitionData: definition.definition_data ?? {},
      fieldValues: [],
      customFields: [],
      components: (componentsResponse.data ?? []).map((component) => ({
        type: component.component_type,
        config: component.config ?? {},
      })),
    }
  }))

  const graphRows = graphsResponse.data ?? []
  const nodes = graphNodesResponse.data ?? []
  const edges = graphEdgesResponse.data ?? []

  const graphs = graphRows.map((graph) => ({
    id: graph.id,
    key: graph.key,
    name: graph.name,
    graphType: graph.graph_type,
    summary: graph.summary ?? '',
    entryNodeKey: graph.entry_node_key,
    metadata: graph.metadata ?? {},
    llmHints: graph.llm_hints ?? {},
    nodes: nodes
      .filter((node) => node.graph_id === graph.id)
      .map((node) => ({
        id: node.id,
        key: node.key,
        type: node.node_type,
        title: node.title,
        templateKey: node.template_key,
        subtitle: node.subtitle,
        position: { x: Number(node.position_x), y: Number(node.position_y) },
        body: node.body ?? {},
        condition: node.condition_expr,
        effects: node.effect_ops ?? [],
        ports: node.ports ?? [],
        display: node.display ?? {},
        metadata: node.metadata ?? {},
      })),
    edges: edges
      .filter((edge) => edge.graph_id === graph.id)
      .map((edge) => ({
        id: edge.id,
        key: edge.key,
        source: { nodeKey: edge.source_node_key, portId: edge.source_port },
        target: { nodeKey: edge.target_node_key, portId: edge.target_port },
        label: edge.label,
        condition: edge.condition_expr,
        metadata: edge.metadata ?? {},
      })),
  }))

  const assets = (assetsResponse.data ?? []).map((asset) => ({
    id: asset.id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }))

  return { definitions, graphs, assets }
}

function parseWorldBuildJob(row: JobRow) {
  if (!worldBuildJobSchemaRuntime) {
    throw new Error('worldBuildJobSchema is not initialized.')
  }
  return worldBuildJobSchemaRuntime.parse({
    id: row.id,
    batchId: row.batch_id,
    planItemId: row.plan_item_id,
    kind: row.kind,
    status: row.status,
    dependsOnJobIds: row.depends_on_job_ids ?? [],
    targetKeys: row.target_keys ?? {},
    prompt: row.prompt ?? '',
    options: row.options ?? {},
    providerRequestId: row.provider_request_id,
    statusUrl: row.status_url,
    responseUrl: row.response_url,
    cancelUrl: row.cancel_url,
    resultContext: row.result_context ?? null,
    errorMessage: row.error_message ?? null,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

async function updateJob(
  client: any,
  jobId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_jobs').update(changes).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

async function updateBatch(
  client: any,
  batchId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_batches').update(changes).eq('id', batchId)
  if (response.error) throw new Error(response.error.message)
}

function readNumericResultContextValue(resultContext: Record<string, unknown> | null | undefined, key: string) {
  const value = resultContext?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function buildBatchFailureStatus(jobs: JobRow[], failedJobId: string) {
  const nextJobs = jobs.map((job) => (
    job.id === failedJobId
      ? { ...job, status: 'failed' }
      : job
  ))
  const hasFailed = nextJobs.some((job) => job.status === 'failed')
  const hasRunning = nextJobs.some((job) => job.status === 'queued' || job.status === 'running')
  if (hasRunning) return 'running'
  if (hasFailed && nextJobs.some((job) => job.status === 'succeeded')) return 'completed_with_errors'
  return 'failed'
}

function selectAuthorshipModel(requestedModel: string, presetFamily: string | null | undefined) {
  const normalized = requestedModel.trim().toLowerCase()
  const shouldUpgradeForUgc =
    presetFamily && presetFamily !== 'story_movie_tv' && (
      normalized === 'gpt-5.4-mini'
      || normalized === 'gpt-5.1-codex-mini'
    )

  if (shouldUpgradeForUgc) {
    return {
      requestedModel,
      model: 'gpt-5.4',
      qualityTier: 'upgraded_for_authorship' as const,
    }
  }

  return {
    requestedModel,
    model: requestedModel,
    qualityTier: 'requested' as const,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  let failureClient: any = null
  let failureBatch: BatchRow | null = null
  let failureJobs: JobRow[] = []
  let failureCinematicJob: JobRow | null = null

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

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
      buildCinematicSequenceFromScriptDoc,
      buildCinematicSettingsPatchFromFormatSubtype,
      buildCinematicSettingsPatchFromPresetFamily,
      buildCinematicSettingsPatchFromStoryPresets,
      cinematicScriptDocSchema,
      materializeCinematicGraphSettings,
    } = cinematicsDomain
    const {
      normalizeCinematicPlanForTransport,
      worldBuildAuthorCinematicRequestSchema,
      worldBuildBatchSchema,
      worldBuildJobSchema,
      worldBuildStatusResponseSchema,
    } = worldBuildDomain
    const { requireUserClient } = authModule
    const { runStructuredWorldBuildModel } = worldBuildModule
    const {
      authorCinematicPlanSkeleton,
      cinematicCreativeScriptAuthorshipRawSchema,
      cinematicCreativeScriptAuthorshipSystemPrompt,
      cinematicShotSkeletonPlannerSystemPrompt,
      coerceCinematicPlannerRaw,
      correctUgcPresetSelectionForPrompt,
      ingestCreativeScriptPlan,
      cinematicShotAuthorshipRawSchema,
      cinematicShotAuthorshipSystemPrompt,
      evaluateCinematicScriptQuality,
      materializeCinematicPlanSkeleton,
      resolveTargetShotCount,
    } = worldBuildCinematicsModule
    worldBuildAuthorCinematicRequestSchemaRuntime = worldBuildAuthorCinematicRequestSchema
    worldBuildBatchSchemaRuntime = worldBuildBatchSchema
    worldBuildBatchCinematicPlanSchemaRuntime = worldBuildBatchSchema.shape.cinematicPlan
    worldBuildJobSchemaRuntime = worldBuildJobSchema
    worldBuildStatusResponseSchemaRuntime = worldBuildStatusResponseSchema

    const { client } = await requireUserClient(request, 'author-cinematic-script')
    failureClient = client
    const payload = worldBuildAuthorCinematicRequestSchemaRuntime.parse(await request.json())
    const loaded = await loadBatch(client, payload.batchId)
    const batch = loaded.batch
    const cinematicJob = loaded.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
    failureBatch = batch
    failureJobs = loaded.jobs
    failureCinematicJob = cinematicJob

    if (!cinematicJob) {
      throw new HttpError(404, `World build batch ${payload.batchId} does not have a cinematic graph job.`)
    }

    const cinematicPlan = batch.cinematic_plan && worldBuildBatchCinematicPlanSchemaRuntime
      ? worldBuildBatchCinematicPlanSchemaRuntime.parse(batch.cinematic_plan)
      : null
    if (!cinematicPlan) {
      throw new HttpError(400, `World build batch ${payload.batchId} does not have a cinematic plan.`)
    }

    if (cinematicPlan.scriptDoc) {
      const resources = await loadBatchResources(client, batch.draft_id, batch.project_id, payload.batchId)
      return json(worldBuildStatusResponseSchemaRuntime.parse({
        batch: worldBuildBatchSchemaRuntime.parse({
          id: batch.id,
          projectId: batch.project_id,
          draftId: batch.draft_id,
          prompt: batch.prompt,
          requestSummary: batch.request_summary,
          plannerMode: batch.planner_mode ?? 'world_build',
          status: batch.status,
          diagnostics: batch.diagnostics ?? [],
          planItems: batch.plan_json ?? [],
          cinematicPlan,
          createdAt: batch.created_at,
          updatedAt: batch.updated_at,
          jobs: loaded.jobs.map(parseWorldBuildJob),
        }),
        definitions: resources.definitions,
        graphs: resources.graphs,
        assets: resources.assets,
        cinematicRuns: [],
      }))
    }

    const baseSettings = materializeCinematicGraphSettings(cinematicPlan.graphSettings ?? {})
    const storyPresetLocked =
      baseSettings.presetFamily === 'story_movie_tv'
      || Boolean(baseSettings.storyScenePreset)
      || Boolean(baseSettings.storyLanguagePreset)
    const correctedPresetSelection = storyPresetLocked
      ? {
          presetFamily: 'story_movie_tv' as const,
          formatSubtype: null,
        }
      : correctUgcPresetSelectionForPrompt({
          prompt: batch.prompt,
          presetFamily: baseSettings.presetFamily,
          formatSubtype: baseSettings.formatSubtype,
        })
    const effectiveSettings = correctedPresetSelection.presetFamily === 'story_movie_tv'
      ? {
          ...baseSettings,
          ...buildCinematicSettingsPatchFromStoryPresets(
            baseSettings.storyScenePreset ?? null,
            baseSettings.storyLanguagePreset ?? null,
          ),
          ...(cinematicPlan.graphSettings ?? {}),
          presetFamily: 'story_movie_tv' as const,
          formatSubtype: null,
          storyScenePreset: baseSettings.storyScenePreset ?? null,
          storyLanguagePreset: baseSettings.storyLanguagePreset ?? null,
        }
      : {
          ...baseSettings,
          ...buildCinematicSettingsPatchFromPresetFamily(correctedPresetSelection.presetFamily),
          ...buildCinematicSettingsPatchFromFormatSubtype(correctedPresetSelection.presetFamily, correctedPresetSelection.formatSubtype),
          ...(cinematicPlan.graphSettings ?? {}),
          presetFamily: correctedPresetSelection.presetFamily,
          formatSubtype: correctedPresetSelection.formatSubtype,
        }
    const correctedPlanForAuthorship = {
      ...cinematicPlan,
      graphSettings: {
        ...(cinematicPlan.graphSettings ?? {}),
        presetFamily: effectiveSettings.presetFamily,
        storyScenePreset: effectiveSettings.storyScenePreset,
        storyLanguagePreset: effectiveSettings.storyLanguagePreset,
        formatSubtype: effectiveSettings.formatSubtype,
        formulaFamily: effectiveSettings.formulaFamily,
        dominantTrigger: effectiveSettings.dominantTrigger,
        creativeTreatment: effectiveSettings.creativeTreatment,
        hookFamily: effectiveSettings.hookFamily,
        narrationMode: effectiveSettings.narrationMode,
        authorshipPipeline: effectiveSettings.authorshipPipeline,
        backdropRole: effectiveSettings.backdropRole,
        backdropStrategy: effectiveSettings.backdropStrategy,
        proofMoment: effectiveSettings.proofMoment,
        ctaStyle: effectiveSettings.ctaStyle,
        contrastAxis: effectiveSettings.contrastAxis,
      },
      shots: cinematicPlan.shots.map((shot) => ({
        ...shot,
        storyScenePreset: shot.storyScenePreset || effectiveSettings.storyScenePreset || null,
        storyLanguagePreset: shot.storyLanguagePreset || effectiveSettings.storyLanguagePreset || null,
        formatSubtype: effectiveSettings.formatSubtype,
        formulaFamily: effectiveSettings.formulaFamily,
        dominantTrigger: effectiveSettings.dominantTrigger,
        creativeTreatment: shot.creativeTreatment || effectiveSettings.creativeTreatment || null,
        hookFamily: shot.hookFamily || effectiveSettings.hookFamily || null,
        narrationMode: shot.narrationMode || effectiveSettings.narrationMode || null,
        backdropRole: shot.backdropRole || effectiveSettings.backdropRole || null,
        backdropStrategy: shot.backdropStrategy || effectiveSettings.backdropStrategy || '',
        contrastAxis: shot.contrastAxis || effectiveSettings.contrastAxis || '',
        proofMoment: shot.proofMoment || effectiveSettings.proofMoment || '',
        ctaStyle: shot.ctaStyle || effectiveSettings.ctaStyle || '',
      })),
    }
    let planForAuthorship = correctedPlanForAuthorship
    const skeletonPlannerDiagnostics: string[] = []

    if (planForAuthorship.shots.length === 0) {
      const targetShotCount = resolveTargetShotCount(batch.prompt, effectiveSettings.formatSubtype)
      const skeletonRaw = await runStructuredWorldBuildModel({
        model: payload.model,
        passLabel: 'Cinematic shot planner',
        systemText: cinematicShotSkeletonPlannerSystemPrompt(
          effectiveSettings.presetFamily,
          effectiveSettings.formatSubtype,
          targetShotCount,
          effectiveSettings.storyScenePreset ?? null,
          effectiveSettings.storyLanguagePreset ?? null,
        ),
        promptContext: {
          prompt: batch.prompt,
          project: payload.snapshot.project,
          draft: payload.snapshot.draft,
          gameSpec: payload.snapshot.gameSpec ?? null,
          requestSummary: batch.request_summary,
          graphName: cinematicPlan.graphName,
          graphSummary: cinematicPlan.graphSummary,
          lockedEntityRefs: cinematicPlan.entityRefs,
          existingEntityRefs: cinematicPlan.entityRefs.filter((entry) => entry.resolution === 'existing'),
          createEntityRefs: [],
        },
        schema: z.record(z.string(), z.unknown()),
        maxOutputTokens: 6000,
      })
      const skeletonDraft = coerceCinematicPlannerRaw(skeletonRaw, {
        lockedEntityRefs: cinematicPlan.entityRefs,
        allowEntityCreation: false,
        promptText: batch.prompt,
        enableFallbackShaping: false,
      })
      skeletonPlannerDiagnostics.push(...skeletonDraft.diagnostics)
      const nextGraphSettings =
        effectiveSettings.presetFamily === 'story_movie_tv'
          ? {
            ...buildCinematicSettingsPatchFromStoryPresets(
              effectiveSettings.storyScenePreset ?? null,
              effectiveSettings.storyLanguagePreset ?? null,
            ),
            ...effectiveSettings,
            ...(skeletonDraft.graphSettings ?? {}),
            presetFamily: 'story_movie_tv' as const,
            formatSubtype: null,
            storyScenePreset: effectiveSettings.storyScenePreset ?? null,
            storyLanguagePreset: effectiveSettings.storyLanguagePreset ?? null,
            formulaFamily: effectiveSettings.formulaFamily,
            dominantTrigger: effectiveSettings.dominantTrigger,
            creativeTreatment: effectiveSettings.creativeTreatment,
            hookFamily: effectiveSettings.hookFamily,
            narrationMode: effectiveSettings.narrationMode,
            backdropRole: effectiveSettings.backdropRole,
            backdropStrategy: effectiveSettings.backdropStrategy,
            contrastAxis: effectiveSettings.contrastAxis,
            proofMoment: effectiveSettings.proofMoment,
            ctaStyle: effectiveSettings.ctaStyle,
          }
          : {
            ...buildCinematicSettingsPatchFromPresetFamily(effectiveSettings.presetFamily),
            ...buildCinematicSettingsPatchFromFormatSubtype(effectiveSettings.presetFamily, effectiveSettings.formatSubtype),
            ...effectiveSettings,
            ...(skeletonDraft.graphSettings ?? {}),
          }

      planForAuthorship = materializeCinematicPlanSkeleton({
        ...skeletonDraft,
        requestSummary: skeletonDraft.requestSummary || batch.request_summary,
        graphName: skeletonDraft.graphName || cinematicPlan.graphName,
        graphSummary: skeletonDraft.graphSummary || cinematicPlan.graphSummary,
        entityRefs: cinematicPlan.entityRefs,
        graphSettings: nextGraphSettings,
      })

      await updateBatch(client, batch.id, {
        cinematic_plan: planForAuthorship,
      })
    }
    const authorshipModel = selectAuthorshipModel(payload.model, effectiveSettings.presetFamily)
    const existingResultContext = cinematicJob.result_context ?? {}
    const authoringAttempts = readNumericResultContextValue(existingResultContext, 'authoringAttempts') + 1
    const repairAttempts = readNumericResultContextValue(existingResultContext, 'repairAttempts')
    const maxRepairAttempts = Math.max(1, readNumericResultContextValue(existingResultContext, 'maxRepairAttempts') || 1)

    await updateJob(client, cinematicJob.id, {
      result_context: {
        ...existingResultContext,
        phase: 'authoring_script',
        authoringAttempts,
        repairAttempts,
        maxRepairAttempts,
        authorshipModelRequested: authorshipModel.requestedModel,
        authorshipModelUsed: authorshipModel.model,
        authorshipModelTier: authorshipModel.qualityTier,
      },
      error_message: null,
    })

    const useCreativeScriptPipeline = effectiveSettings.authorshipPipeline === 'ugc_script_ingest_v1'
    const authoredRaw = useCreativeScriptPipeline
      ? await runStructuredWorldBuildModel({
          model: authorshipModel.model,
          passLabel: 'Cinematic creative script authorship',
          systemText: cinematicCreativeScriptAuthorshipSystemPrompt({
            presetFamily: effectiveSettings.presetFamily,
            storyScenePreset: effectiveSettings.storyScenePreset,
            storyLanguagePreset: effectiveSettings.storyLanguagePreset,
            formatSubtype: effectiveSettings.formatSubtype,
            formulaFamily: effectiveSettings.formulaFamily,
            dominantTrigger: effectiveSettings.dominantTrigger,
            proofMoment: effectiveSettings.proofMoment,
            ctaStyle: effectiveSettings.ctaStyle,
            contrastAxis: effectiveSettings.contrastAxis,
            graphSettings: cinematicPlan.graphSettings ?? {},
            projectArtStylePreset: effectiveSettings.artStylePreset ?? null,
          }),
          promptContext: {
            prompt: batch.prompt,
            project: payload.snapshot.project,
            draft: payload.snapshot.draft,
            gameSpec: payload.snapshot.gameSpec ?? null,
            requestSummary: batch.request_summary,
            graphName: planForAuthorship.graphName,
            graphSummary: planForAuthorship.graphSummary,
            lockedGraphSettings: effectiveSettings,
            lockedEntityRefs: planForAuthorship.entityRefs,
            plannedShots: planForAuthorship.shots,
          },
          schema: cinematicCreativeScriptAuthorshipRawSchema,
          maxOutputTokens: 9000,
        })
      : await runStructuredWorldBuildModel({
          model: authorshipModel.model,
          passLabel: 'Cinematic shot authorship',
          systemText: cinematicShotAuthorshipSystemPrompt({
            presetFamily: effectiveSettings.presetFamily,
            storyScenePreset: effectiveSettings.storyScenePreset,
            storyLanguagePreset: effectiveSettings.storyLanguagePreset,
            formatSubtype: effectiveSettings.formatSubtype,
            formulaFamily: effectiveSettings.formulaFamily,
            dominantTrigger: effectiveSettings.dominantTrigger,
            proofMoment: effectiveSettings.proofMoment,
            ctaStyle: effectiveSettings.ctaStyle,
            contrastAxis: effectiveSettings.contrastAxis,
            graphSettings: cinematicPlan.graphSettings ?? {},
            projectArtStylePreset: effectiveSettings.artStylePreset ?? null,
          }),
          promptContext: {
            prompt: batch.prompt,
            project: payload.snapshot.project,
            draft: payload.snapshot.draft,
            gameSpec: payload.snapshot.gameSpec ?? null,
            requestSummary: batch.request_summary,
            graphName: planForAuthorship.graphName,
            graphSummary: planForAuthorship.graphSummary,
            lockedGraphSettings: effectiveSettings,
            lockedEntityRefs: planForAuthorship.entityRefs,
            plannedShots: planForAuthorship.shots,
          },
          schema: cinematicShotAuthorshipRawSchema,
          maxOutputTokens: 9000,
        })

    const ingestionResult = useCreativeScriptPipeline
      ? ingestCreativeScriptPlan({
          plan: planForAuthorship,
          rawScriptMarkdown: authoredRaw.rawScriptMarkdown,
        })
      : {
          diagnostics: [] as string[],
          authoredShots: authoredRaw.shots,
        }

    const authoredPlan = authorCinematicPlanSkeleton({
      plan: planForAuthorship,
      authoredShots: ingestionResult.authoredShots,
      rawScriptMarkdown: useCreativeScriptPipeline ? authoredRaw.rawScriptMarkdown : planForAuthorship.rawScriptMarkdown,
    })

    const authoredScriptDoc = cinematicScriptDocSchema.parse(authoredPlan.scriptDoc)
    const authoredSequence = buildCinematicSequenceFromScriptDoc(authoredScriptDoc)
    if (authoredScriptDoc.shots.length === 0) {
      throw new Error('Authoring produced zero cinematic shots. Refusing to persist an empty cinematic script.')
    }
    if (authoredSequence.takes.length === 0) {
      throw new Error('Authoring produced zero cinematic takes. Refusing to persist an empty cinematic graph.')
    }

    const qualityReport = evaluateCinematicScriptQuality({
      promptText: batch.prompt,
      scriptDoc: authoredScriptDoc,
      graphSettings: effectiveSettings,
    })

    const nextDiagnostics = Array.from(new Set([
      ...(Array.isArray(batch.diagnostics) ? batch.diagnostics : []),
      ...skeletonPlannerDiagnostics,
      ...(authoredRaw.diagnostics ?? []),
      ...ingestionResult.diagnostics,
      ...qualityReport.failures,
    ]))

    const nextPhase = qualityReport.hardFailures.length > 0 ? 'needs_repair' : 'authored'

    await updateBatch(client, batch.id, {
      cinematic_plan: authoredPlan,
      diagnostics: nextDiagnostics,
    })
    await updateJob(client, cinematicJob.id, {
      result_context: {
        ...existingResultContext,
        phase: nextPhase,
        authoringAttempts,
        repairAttempts,
        maxRepairAttempts,
        repairQueuedAt: nextPhase === 'needs_repair' ? new Date().toISOString() : null,
        plannerDiagnostics: [...skeletonPlannerDiagnostics, ...(authoredRaw.diagnostics ?? [])],
        creativeScriptDiagnostics: useCreativeScriptPipeline ? authoredRaw.diagnostics ?? [] : [],
        ingestorDiagnostics: ingestionResult.diagnostics,
        authoringDiagnostics: qualityReport.failures,
        authoringDiagnosticEntries: qualityReport.diagnostics,
        qualityHardFailures: qualityReport.hardFailures,
        qualitySoftFailures: qualityReport.softFailures,
        authorshipModelRequested: authorshipModel.requestedModel,
        authorshipModelUsed: authorshipModel.model,
        authorshipModelTier: authorshipModel.qualityTier,
        authorshipPipeline: effectiveSettings.authorshipPipeline,
        correctedPresetFamily: effectiveSettings.presetFamily,
        correctedFormatSubtype: effectiveSettings.formatSubtype,
      },
      error_message: null,
    })

    const refreshed = await loadBatch(client, payload.batchId)
    const resources = await loadBatchResources(client, refreshed.batch.draft_id, refreshed.batch.project_id, payload.batchId)

    return json(worldBuildStatusResponseSchemaRuntime.parse({
      batch: worldBuildBatchSchemaRuntime.parse({
        id: refreshed.batch.id,
        projectId: refreshed.batch.project_id,
        draftId: refreshed.batch.draft_id,
        prompt: refreshed.batch.prompt,
        requestSummary: refreshed.batch.request_summary,
        plannerMode: refreshed.batch.planner_mode ?? 'world_build',
        status: refreshed.batch.status,
        diagnostics: refreshed.batch.diagnostics ?? [],
        planItems: refreshed.batch.plan_json ?? [],
        cinematicPlan: normalizeCinematicPlanForTransport(refreshed.batch.cinematic_plan ?? null),
        createdAt: refreshed.batch.created_at,
        updatedAt: refreshed.batch.updated_at,
        jobs: refreshed.jobs.map(parseWorldBuildJob),
      }),
      definitions: resources.definitions,
      graphs: resources.graphs,
      assets: resources.assets,
      cinematicRuns: [],
    }))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to author cinematic script.'
    if (failureClient && failureBatch && failureCinematicJob) {
      const existingResultContext = failureCinematicJob.result_context ?? {}
      const nextDiagnostics = Array.from(new Set([
        ...(Array.isArray(failureBatch.diagnostics) ? failureBatch.diagnostics : []),
        `Cinematic authorship failed: ${errorMessage}`,
      ]))
      try {
        await updateJob(failureClient, failureCinematicJob.id, {
          status: 'failed',
          result_context: {
            ...existingResultContext,
            phase: 'authorship_failed',
            authoringAttempts: readNumericResultContextValue(existingResultContext, 'authoringAttempts') + 1,
            repairAttempts: readNumericResultContextValue(existingResultContext, 'repairAttempts'),
            maxRepairAttempts: Math.max(1, readNumericResultContextValue(existingResultContext, 'maxRepairAttempts') || 1),
            lastErrorMessage: errorMessage,
            failedAt: new Date().toISOString(),
          },
          error_message: errorMessage,
        })
        await updateBatch(failureClient, failureBatch.id, {
          status: buildBatchFailureStatus(failureJobs, failureCinematicJob.id),
          diagnostics: nextDiagnostics,
        })
      } catch (persistError) {
        console.error('[GraphCore] failed to persist cinematic authorship failure state.', persistError)
      }
    }
    return errorResponse(error, 'Failed to author cinematic script.')
  }
})
