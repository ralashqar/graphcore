import '@supabase/functions-js/edge-runtime.d.ts'

import { buildCinematicSequenceFromScriptDoc, buildCinematicSettingsPatchFromFormatSubtype, buildCinematicSettingsPatchFromPresetFamily, cinematicScriptDocSchema, getCinematicSettings } from '../../../src/domain/cinematics.ts'
import {
  STORY_PROMPT_VERSION,
  STORY_SCRIPT_INGEST_PIPELINE,
  buildStoryCreativeScriptPrompt,
} from '../../../src/domain/storyPromptBuilders.ts'
import {
  worldBuildBatchSchema,
  worldBuildJobSchema,
  worldBuildRepairCinematicRequestSchema,
  worldBuildStatusResponseSchema,
} from '../../../src/domain/worldBuild.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { runStructuredWorldBuildModel } from '../_shared/world-build.ts'
import {
  authorCinematicPlanSkeleton,
  cinematicCreativeScriptAuthorshipRawSchema,
  cinematicCreativeScriptAuthorshipSystemPrompt,
  cinematicShotAuthorshipRawSchema,
  cinematicShotAuthorshipSystemPrompt,
  correctUgcPresetSelectionForPrompt,
  evaluateCinematicScriptQuality,
  ingestCreativeScriptPlan,
} from '../_shared/world-build-cinematics.ts'

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

async function loadBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
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

  if (jobsResponse.error) throw new Error(jobsResponse.error.message)

  return {
    batch: batchResponse.data as BatchRow,
    jobs: (jobsResponse.data ?? []) as JobRow[],
  }
}

async function loadBatchResources(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  projectId: string,
  batchId: string,
) {
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

  const definitions = (definitionsResponse.data ?? []).map((definition) => ({
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
    components: [],
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
  return worldBuildJobSchema.parse({
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
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  jobId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_jobs').update(changes).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

async function updateBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
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

function buildStoryPromptContext(input: {
  prompt: string
  requestSummary: string
  graphName: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: string
    role: string
    sourceName: string
    summary?: string | null
  }>
  shots: Array<{
    id: string
    sceneId?: string | null
    title: string
    beat?: string
    hookRole?: string | null
    shotType?: string | null
    participantRefIds: string[]
    locationRefId?: string | null
    propRefIds: string[]
  }>
  currentShotState?: Array<{
    id: string
    beat?: string
    dialogue?: Array<{ line?: string | null }>
    actions?: Array<{ verb?: string | null }>
  }>
  currentDiagnostics?: Array<{ shotId?: string | null; category: string; message: string }>
}) {
  const entityById = new Map(input.entityRefs.map((entry) => [entry.id, entry]))
  return {
    prompt: input.prompt,
    requestSummary: input.requestSummary,
    graphName: input.graphName,
    graphSummary: input.graphSummary,
    lockedEntities: input.entityRefs.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      role: entry.role,
      name: entry.sourceName,
      summary: entry.summary?.trim() || `${entry.kind} locked for scene continuity.`,
    })),
    plannedShots: input.shots.map((shot) => ({
      id: shot.id,
      sceneId: shot.sceneId ?? 'scene_1',
      title: shot.title,
      beat: shot.beat ?? '',
      hookRole: shot.hookRole ?? null,
      shotType: shot.shotType ?? null,
      participants: shot.participantRefIds.map((refId) => entityById.get(refId)?.sourceName ?? refId),
      location: shot.locationRefId ? (entityById.get(shot.locationRefId)?.sourceName ?? shot.locationRefId) : null,
      props: shot.propRefIds.map((refId) => entityById.get(refId)?.sourceName ?? refId),
    })),
    currentShotState: (input.currentShotState ?? []).map((shot) => ({
      id: shot.id,
      beat: shot.beat ?? '',
      dialogue: (shot.dialogue ?? []).map((entry) => entry.line ?? '').filter((entry) => entry.trim().length > 0),
      actions: (shot.actions ?? []).map((entry) => entry.verb ?? '').filter((entry) => entry.trim().length > 0),
    })),
    currentDiagnostics: (input.currentDiagnostics ?? []).map((entry) => ({
      shotId: entry.shotId ?? null,
      category: entry.category,
      message: entry.message,
    })),
  }
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

function selectRepairModel(requestedModel: string, presetFamily: string | null | undefined) {
  const normalized = requestedModel.trim().toLowerCase()
  const shouldUpgradeForUgc =
    presetFamily && presetFamily !== 'story_movie_tv' && (
      normalized === 'gpt-5.4-mini'
      || normalized === 'gpt-5.1-codex-mini'
    )

  return {
    requestedModel,
    model: shouldUpgradeForUgc ? 'gpt-5.4' : requestedModel,
    qualityTier: shouldUpgradeForUgc ? 'upgraded_for_repair' as const : 'requested' as const,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  let failureClient: Awaited<ReturnType<typeof requireUserClient>>['client'] | null = null
  let failureBatch: BatchRow | null = null
  let failureJobs: JobRow[] = []
  let failureCinematicJob: JobRow | null = null

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'repair-cinematic-script')
    failureClient = client
    const payload = worldBuildRepairCinematicRequestSchema.parse(await request.json())
    const loaded = await loadBatch(client, payload.batchId)
    const batch = loaded.batch
    const cinematicJob = loaded.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
    failureBatch = batch
    failureJobs = loaded.jobs
    failureCinematicJob = cinematicJob

    if (!cinematicJob) throw new HttpError(404, `World build batch ${payload.batchId} does not have a cinematic graph job.`)

    const cinematicPlan = batch.cinematic_plan ? worldBuildBatchSchema.shape.cinematicPlan.parse(batch.cinematic_plan) : null
    if (!cinematicPlan?.scriptDoc) {
      throw new HttpError(400, `World build batch ${payload.batchId} does not have an authored cinematic script to repair.`)
    }

    const baseSettings = getCinematicSettings(payload.snapshot.gameSpec ?? null, { cinematics: cinematicPlan.graphSettings })
    const correctedPresetSelection = correctUgcPresetSelectionForPrompt({
      prompt: batch.prompt,
      presetFamily: baseSettings.presetFamily,
      formatSubtype: baseSettings.formatSubtype,
    })
    const effectiveSettings = {
      ...baseSettings,
      ...buildCinematicSettingsPatchFromPresetFamily(correctedPresetSelection.presetFamily),
      ...buildCinematicSettingsPatchFromFormatSubtype(correctedPresetSelection.presetFamily, correctedPresetSelection.formatSubtype),
      ...(cinematicPlan.graphSettings ?? {}),
      presetFamily: correctedPresetSelection.presetFamily,
      formatSubtype: correctedPresetSelection.formatSubtype,
    }

    const currentScriptDoc = cinematicScriptDocSchema.parse(cinematicPlan.scriptDoc)
    const currentQuality = evaluateCinematicScriptQuality({
      promptText: batch.prompt,
      scriptDoc: currentScriptDoc,
      graphSettings: effectiveSettings,
    })

    const fallbackShotIds = currentQuality.diagnostics
      .map((entry) => entry.shotId)
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    const targetShotIds = Array.from(new Set((payload.shotIds.length > 0 ? payload.shotIds : fallbackShotIds)))

    if (targetShotIds.length === 0) {
      throw new HttpError(400, 'No repairable shot ids were provided or inferred from the current diagnostics.')
    }

    const targetedShots = cinematicPlan.shots
      .filter((shot) => targetShotIds.includes(shot.id))
      .map((shot) => ({
        ...shot,
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
      }))

    if (targetedShots.length === 0) {
      throw new HttpError(400, 'The requested shot ids were not found in the current cinematic plan.')
    }

    const repairModel = selectRepairModel(payload.model, effectiveSettings.presetFamily)
    const existingResultContext = cinematicJob.result_context ?? {}
    const repairAttempts = readNumericResultContextValue(existingResultContext, 'repairAttempts') + 1
    const authoringAttempts = Math.max(1, readNumericResultContextValue(existingResultContext, 'authoringAttempts'))
    const maxRepairAttempts = Math.max(1, readNumericResultContextValue(existingResultContext, 'maxRepairAttempts') || 1)
    const useStoryScriptIngestPipeline = effectiveSettings.authorshipPipeline === STORY_SCRIPT_INGEST_PIPELINE
    const useCreativeScriptPipeline =
      effectiveSettings.authorshipPipeline === 'ugc_script_ingest_v1'
      || useStoryScriptIngestPipeline
    const authorshipPromptVersion = useStoryScriptIngestPipeline
      ? STORY_PROMPT_VERSION
      : useCreativeScriptPipeline
        ? 'ugc_creative_script_prompt_v1'
        : 'legacy_json_shot_authoring_v1'

    await updateJob(client, cinematicJob.id, {
      result_context: {
        ...existingResultContext,
        phase: 'repairing_script',
        authoringAttempts,
        repairAttempts,
        maxRepairAttempts,
        repairShotIds: targetShotIds,
        repairFailureCategories: payload.failureCategories,
        repairFieldScopes: payload.fieldScopes,
        repairModelRequested: repairModel.requestedModel,
        repairModelUsed: repairModel.model,
        repairModelTier: repairModel.qualityTier,
        authorshipPipeline: effectiveSettings.authorshipPipeline,
        authorshipPromptVersion,
      },
      error_message: null,
    })

    const repairedRaw = useCreativeScriptPipeline
      ? await runStructuredWorldBuildModel({
          model: repairModel.model,
          passLabel: useStoryScriptIngestPipeline ? 'Story creative script repair' : 'Cinematic creative script repair',
          systemText: [
            useStoryScriptIngestPipeline
              ? buildStoryCreativeScriptPrompt({
                  storyScenePreset: effectiveSettings.storyScenePreset ?? null,
                  storyLanguagePreset: effectiveSettings.storyLanguagePreset ?? null,
                  repairMode: true,
                })
              : cinematicCreativeScriptAuthorshipSystemPrompt({
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
            `Repair scope: only repair these shot ids: ${targetShotIds.join(', ')}.`,
            payload.failureCategories.length > 0 ? `Target these failure categories: ${payload.failureCategories.join(', ')}.` : 'Target the currently failing authored fields only.',
            payload.fieldScopes.length > 0 ? `Only rewrite these field scopes when possible: ${payload.fieldScopes.join(', ')}.` : 'Repair whichever authored fields are needed to resolve the failures.',
            'Do not change unaffected shots.',
            useStoryScriptIngestPipeline ? 'Fix late contact, generic dialogue, abstract momentum language, repetitive reset beats, and weak final images before cosmetic polish.' : null,
          ].join('\n'),
          promptContext: useStoryScriptIngestPipeline
            ? buildStoryPromptContext({
                prompt: batch.prompt,
                requestSummary: batch.request_summary,
                graphName: cinematicPlan.graphName,
                graphSummary: cinematicPlan.graphSummary,
                entityRefs: cinematicPlan.entityRefs,
                shots: targetedShots,
                currentShotState: currentScriptDoc.shots.filter((shot) => targetShotIds.includes(shot.id)),
                currentDiagnostics: currentQuality.diagnostics.filter((entry) => !entry.shotId || targetShotIds.includes(entry.shotId)),
              })
            : {
                prompt: batch.prompt,
                project: payload.snapshot.project,
                draft: payload.snapshot.draft,
                gameSpec: payload.snapshot.gameSpec ?? null,
                requestSummary: batch.request_summary,
                graphName: cinematicPlan.graphName,
                graphSummary: cinematicPlan.graphSummary,
                lockedGraphSettings: effectiveSettings,
                lockedEntityRefs: cinematicPlan.entityRefs,
                plannedShots: targetedShots,
                currentShotState: currentScriptDoc.shots.filter((shot) => targetShotIds.includes(shot.id)),
                currentDiagnostics: currentQuality.diagnostics.filter((entry) => !entry.shotId || targetShotIds.includes(entry.shotId)),
              },
          schema: cinematicCreativeScriptAuthorshipRawSchema,
          maxOutputTokens: 9000,
        })
      : await runStructuredWorldBuildModel({
          model: repairModel.model,
          passLabel: 'Cinematic shot repair',
          systemText: [
            cinematicShotAuthorshipSystemPrompt({
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
            `Repair scope: only repair these shot ids: ${targetShotIds.join(', ')}.`,
            payload.failureCategories.length > 0 ? `Target these failure categories: ${payload.failureCategories.join(', ')}.` : 'Target the currently failing authored fields only.',
            payload.fieldScopes.length > 0 ? `Only rewrite these field scopes when possible: ${payload.fieldScopes.join(', ')}.` : 'Repair whichever authored fields are needed to resolve the failures.',
            'Do not change unaffected shots.',
          ].join('\n'),
          promptContext: {
            prompt: batch.prompt,
            project: payload.snapshot.project,
            draft: payload.snapshot.draft,
            gameSpec: payload.snapshot.gameSpec ?? null,
            requestSummary: batch.request_summary,
            graphName: cinematicPlan.graphName,
            graphSummary: cinematicPlan.graphSummary,
            lockedGraphSettings: effectiveSettings,
            lockedEntityRefs: cinematicPlan.entityRefs,
            plannedShots: targetedShots,
            currentShotState: currentScriptDoc.shots.filter((shot) => targetShotIds.includes(shot.id)),
            currentDiagnostics: currentQuality.diagnostics.filter((entry) => !entry.shotId || targetShotIds.includes(entry.shotId)),
          },
          schema: cinematicShotAuthorshipRawSchema,
          maxOutputTokens: 9000,
        })

    const planForRepair = {
      ...cinematicPlan,
      shots: cinematicPlan.shots.map((shot) => (
        targetShotIds.includes(shot.id)
          ? targetedShots.find((targeted) => targeted.id === shot.id) ?? shot
          : shot
      )),
    }
    const ingestionResult = useCreativeScriptPipeline
      ? ingestCreativeScriptPlan({
          plan: planForRepair,
          rawScriptMarkdown: repairedRaw.rawScriptMarkdown,
        })
      : {
          diagnostics: [] as string[],
          authoredShots: repairedRaw.shots,
        }

    const repairedPlan = authorCinematicPlanSkeleton({
      plan: {
        ...planForRepair,
        graphSettings: {
          ...(cinematicPlan.graphSettings ?? {}),
          presetFamily: effectiveSettings.presetFamily,
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
      },
      authoredShots: ingestionResult.authoredShots,
      rawScriptMarkdown: useCreativeScriptPipeline ? repairedRaw.rawScriptMarkdown : cinematicPlan.rawScriptMarkdown,
    })

    const repairedScriptDoc = cinematicScriptDocSchema.parse(repairedPlan.scriptDoc)
    const repairedSequence = buildCinematicSequenceFromScriptDoc(repairedScriptDoc)
    if (repairedScriptDoc.shots.length === 0 || repairedSequence.takes.length === 0) {
      throw new Error('Repair produced an invalid cinematic script.')
    }

    const qualityReport = evaluateCinematicScriptQuality({
      promptText: batch.prompt,
      scriptDoc: repairedScriptDoc,
      graphSettings: effectiveSettings,
    })

    const nextDiagnostics = Array.from(new Set([
      ...(Array.isArray(batch.diagnostics) ? batch.diagnostics : []),
      ...(repairedRaw.diagnostics ?? []),
      ...ingestionResult.diagnostics,
      ...qualityReport.failures,
    ]))

    const repairStillFailing = qualityReport.hardFailures.length > 0
    const repairExhausted = repairStillFailing && repairAttempts >= maxRepairAttempts
    const nextPhase = repairStillFailing
      ? (repairExhausted ? 'repair_failed' : 'needs_repair')
      : 'authored'

    await updateBatch(client, batch.id, {
      cinematic_plan: repairedPlan,
      diagnostics: nextDiagnostics,
      ...(repairExhausted ? { status: buildBatchFailureStatus(loaded.jobs, cinematicJob.id) } : {}),
    })
    await updateJob(client, cinematicJob.id, {
      status: repairExhausted ? 'failed' : 'running',
      result_context: {
        ...existingResultContext,
        phase: nextPhase,
        authoringAttempts,
        repairAttempts,
        maxRepairAttempts,
        repairQueuedAt: repairStillFailing && !repairExhausted ? new Date().toISOString() : null,
        authoringDiagnostics: qualityReport.failures,
        authoringDiagnosticEntries: qualityReport.diagnostics,
        qualityHardFailures: qualityReport.hardFailures,
        qualitySoftFailures: qualityReport.softFailures,
        repairShotIds: targetShotIds,
        repairFailureCategories: payload.failureCategories,
        repairFieldScopes: payload.fieldScopes,
        ingestorDiagnostics: ingestionResult.diagnostics,
        repairModelRequested: repairModel.requestedModel,
        repairModelUsed: repairModel.model,
        repairModelTier: repairModel.qualityTier,
        authorshipPipeline: effectiveSettings.authorshipPipeline,
        authorshipPromptVersion,
      },
      error_message: null,
    })

    const refreshed = await loadBatch(client, payload.batchId)
    const resources = await loadBatchResources(client, refreshed.batch.draft_id, refreshed.batch.project_id, payload.batchId)

    return json(worldBuildStatusResponseSchema.parse({
      batch: worldBuildBatchSchema.parse({
        id: refreshed.batch.id,
        projectId: refreshed.batch.project_id,
        draftId: refreshed.batch.draft_id,
        prompt: refreshed.batch.prompt,
        requestSummary: refreshed.batch.request_summary,
        plannerMode: refreshed.batch.planner_mode ?? 'world_build',
        status: refreshed.batch.status,
        diagnostics: refreshed.batch.diagnostics ?? [],
        planItems: refreshed.batch.plan_json ?? [],
        cinematicPlan: refreshed.batch.cinematic_plan ?? null,
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to repair cinematic script.'
    if (failureClient && failureBatch && failureCinematicJob) {
      const existingResultContext = failureCinematicJob.result_context ?? {}
      const nextDiagnostics = Array.from(new Set([
        ...(Array.isArray(failureBatch.diagnostics) ? failureBatch.diagnostics : []),
        `Cinematic repair failed: ${errorMessage}`,
      ]))
      try {
        await updateJob(failureClient, failureCinematicJob.id, {
          status: 'failed',
          result_context: {
            ...existingResultContext,
            phase: 'repair_failed',
            authoringAttempts: Math.max(1, readNumericResultContextValue(existingResultContext, 'authoringAttempts')),
            repairAttempts: readNumericResultContextValue(existingResultContext, 'repairAttempts') + 1,
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
        console.error('[GraphCore] failed to persist cinematic repair failure state.', persistError)
      }
    }
    return errorResponse(error, 'Failed to repair cinematic script.')
  }
})
