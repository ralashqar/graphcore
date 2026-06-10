import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { mergeWorldBuildJobContext, readWorldBuildAttemptCount } from '../../../src/core/generationWorkflow.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { resolveOutputTextModelPolicy } from '../_shared/model-policy.ts'
import {
  type WorldBuildBatchRow as BatchRow,
  type WorldBuildJobRow as JobRow,
  buildWorldBuildBatchFailureStatus as buildBatchFailureStatus,
  loadWorldBuildBatch as loadBatch,
  loadWorldBuildBatchResources as loadBatchResources,
  parseWorldBuildJobRow as parseWorldBuildJob,
  readWorldBuildNumericResultContextValue as readNumericResultContextValue,
  updateWorldBuildBatch as updateBatch,
  updateWorldBuildJob as updateJob,
} from '../_shared/world-build-repository.ts'

let worldBuildAuthorCinematicRequestSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildBatchSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildBatchCinematicPlanSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildJobSchemaRuntime: z.ZodTypeAny | null = null
let worldBuildStatusResponseSchemaRuntime: z.ZodTypeAny | null = null
const AUTHOR_CINEMATIC_CONTRACT_VERSION = '2026-04-19-story-authorship-pipeline-v2'
void AUTHOR_CINEMATIC_CONTRACT_VERSION
const creativeScriptAuthorshipSchemaRuntime = z.object({
  rawScriptMarkdown: z.preprocess((value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string').join('\n')
    }
    return ''
  }, z.string().default('')),
  diagnostics: z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    }
    if (typeof value === 'string') {
      return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${key}: ${String(entry)}`)
    }
    return []
  }, z.array(z.string()).default([])),
  assistantNotes: z.preprocess((value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string').join('\n')
    }
    if (value && typeof value === 'object') return JSON.stringify(value)
    return undefined
  }, z.string().optional()),
})

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
  }
}

function selectAuthorshipModel(requestedModel: string, presetFamily: string | null | undefined) {
  const normalized = requestedModel.trim().toLowerCase()
  const authorshipPolicy = resolveOutputTextModelPolicy('screenplay_author')
  const shouldUpgradeForUgc =
    presetFamily && presetFamily !== 'story_movie_tv' && (
      normalized === 'gpt-5.4-mini'
      || normalized === 'gpt-5.1-codex-mini'
    )

  if (shouldUpgradeForUgc) {
    return {
      requestedModel,
      model: authorshipPolicy.model,
      reasoningEffort: authorshipPolicy.reasoningEffort,
      qualityTier: 'upgraded_for_authorship' as const,
    }
  }

  return {
    requestedModel,
    model: requestedModel,
    reasoningEffort: authorshipPolicy.reasoningEffort,
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
      storyPromptBuildersDomain,
      worldBuildDomain,
      authModule,
      worldBuildModule,
      worldBuildCinematicsModule,
    ] = await Promise.all([
      import('../../../src/domain/cinematics.ts'),
      import('../../../src/domain/storyPromptBuilders.ts'),
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
      STORY_PROMPT_VERSION,
      STORY_SCRIPT_INGEST_PIPELINE,
      buildStoryCreativeScriptPrompt,
      buildStoryShotSkeletonPlannerPrompt,
    } = storyPromptBuildersDomain
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
          jobs: loaded.jobs.map((row) => parseWorldBuildJob(row, worldBuildJobSchemaRuntime!)),
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
    const useStoryScriptIngestPipeline = effectiveSettings.authorshipPipeline === STORY_SCRIPT_INGEST_PIPELINE

    if (planForAuthorship.shots.length === 0) {
      const targetShotCount = resolveTargetShotCount(batch.prompt, effectiveSettings.formatSubtype)
      const skeletonRaw = await runStructuredWorldBuildModel({
        model: payload.model,
        passLabel: useStoryScriptIngestPipeline ? 'Story shot skeleton planner' : 'Cinematic shot planner',
        systemText: useStoryScriptIngestPipeline
          ? buildStoryShotSkeletonPlannerPrompt({
              targetShotCount,
              storyScenePreset: effectiveSettings.storyScenePreset ?? null,
              storyLanguagePreset: effectiveSettings.storyLanguagePreset ?? null,
            })
          : cinematicShotSkeletonPlannerSystemPrompt(
              effectiveSettings.presetFamily,
              effectiveSettings.formatSubtype,
              targetShotCount,
              effectiveSettings.storyScenePreset ?? null,
              effectiveSettings.storyLanguagePreset ?? null,
            ),
        promptContext: useStoryScriptIngestPipeline
          ? buildStoryPromptContext({
              prompt: batch.prompt,
              requestSummary: batch.request_summary,
              graphName: cinematicPlan.graphName,
              graphSummary: cinematicPlan.graphSummary,
              entityRefs: cinematicPlan.entityRefs,
              shots: [],
            })
          : {
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
    const workflowAttemptCount = Math.max(cinematicJob.attempt_count ?? 0, readWorldBuildAttemptCount(existingResultContext)) + 1
    const useCreativeScriptPipeline =
      effectiveSettings.authorshipPipeline === 'ugc_script_ingest_v1'
      || effectiveSettings.authorshipPipeline === STORY_SCRIPT_INGEST_PIPELINE
    const authorshipPromptVersion = useStoryScriptIngestPipeline
      ? STORY_PROMPT_VERSION
      : useCreativeScriptPipeline
        ? 'ugc_creative_script_prompt_v1'
        : 'legacy_json_shot_authoring_v1'
    const authoringContext = mergeWorldBuildJobContext({
      kind: cinematicJob.kind,
      current: existingResultContext,
      phase: 'authoring_script',
      attemptCount: workflowAttemptCount,
      transitionReason: 'cinematic_authorship_started',
      errorCategory: 'none',
      diagnostics: [{
        category: 'none',
        message: 'Cinematic authorship started.',
        source: 'author-cinematic-script',
      }],
      patch: {
        authoringAttempts,
        repairAttempts,
        maxRepairAttempts,
        authorshipModelRequested: authorshipModel.requestedModel,
        authorshipModelUsed: authorshipModel.model,
        authorshipModelTier: authorshipModel.qualityTier,
        authorshipPipeline: effectiveSettings.authorshipPipeline,
        authorshipPromptVersion,
      },
    })

    await updateJob(client, cinematicJob.id, {
      attempt_count: workflowAttemptCount,
      lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      next_retry_at: null,
      result_context: authoringContext,
      error_message: null,
    })

    const authoredRaw = useCreativeScriptPipeline
      ? await runStructuredWorldBuildModel({
          model: authorshipModel.model,
          reasoningEffort: authorshipModel.reasoningEffort,
          passLabel: useStoryScriptIngestPipeline ? 'Story creative script authorship' : 'Cinematic creative script authorship',
          systemText: useStoryScriptIngestPipeline
            ? buildStoryCreativeScriptPrompt({
                storyScenePreset: effectiveSettings.storyScenePreset ?? null,
                storyLanguagePreset: effectiveSettings.storyLanguagePreset ?? null,
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
          promptContext: useStoryScriptIngestPipeline
            ? buildStoryPromptContext({
                prompt: batch.prompt,
                requestSummary: batch.request_summary,
                graphName: planForAuthorship.graphName,
                graphSummary: planForAuthorship.graphSummary,
                entityRefs: planForAuthorship.entityRefs,
                shots: planForAuthorship.shots,
              })
            : {
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
          schema: creativeScriptAuthorshipSchemaRuntime,
          maxOutputTokens: 9000,
          timeoutMs: 300_000,
        })
      : await runStructuredWorldBuildModel({
          model: authorshipModel.model,
          reasoningEffort: authorshipModel.reasoningEffort,
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
          timeoutMs: 300_000,
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

    const creativeScriptContractFailures =
      useStoryScriptIngestPipeline
        ? ingestionResult.diagnostics.filter((message) => /missing required (DURATION|VISUAL)/i.test(message))
        : []
    if (creativeScriptContractFailures.length > 0) {
      throw new Error(`Story creative script omitted required fields: ${creativeScriptContractFailures.join(' ')}`)
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
      lease_expires_at: null,
      next_retry_at: nextPhase === 'needs_repair' ? new Date().toISOString() : null,
      result_context: mergeWorldBuildJobContext({
        kind: cinematicJob.kind,
        current: authoringContext,
        phase: nextPhase,
        attemptCount: workflowAttemptCount,
        transitionReason: nextPhase === 'needs_repair' ? 'quality_gate_failed' : 'cinematic_authorship_completed',
        errorCategory: nextPhase === 'needs_repair' ? 'quality_gate' : 'none',
        diagnostics: qualityReport.failures.map((message) => ({
          category: 'quality_gate',
          message,
          source: 'author-cinematic-script',
        })),
        patch: {
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
          authorshipPromptVersion,
          correctedPresetFamily: effectiveSettings.presetFamily,
          correctedFormatSubtype: effectiveSettings.formatSubtype,
        },
      }),
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
        jobs: refreshed.jobs.map((row) => parseWorldBuildJob(row, worldBuildJobSchemaRuntime!)),
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
          lease_expires_at: null,
          result_context: mergeWorldBuildJobContext({
            kind: failureCinematicJob.kind,
            current: existingResultContext,
            phase: 'authorship_failed',
            attemptCount: Math.max(failureCinematicJob.attempt_count ?? 0, readWorldBuildAttemptCount(existingResultContext), 1),
            transitionReason: 'cinematic_authorship_failed',
            errorCategory: 'authorship',
            diagnostics: [{
              category: 'authorship',
              message: errorMessage,
              source: 'author-cinematic-script',
            }],
            patch: {
              authoringAttempts: readNumericResultContextValue(existingResultContext, 'authoringAttempts') + 1,
              repairAttempts: readNumericResultContextValue(existingResultContext, 'repairAttempts'),
              maxRepairAttempts: Math.max(1, readNumericResultContextValue(existingResultContext, 'maxRepairAttempts') || 1),
              lastErrorMessage: errorMessage,
              failedAt: new Date().toISOString(),
            },
          }),
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
