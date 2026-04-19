import '@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4'

import { buildCinematicSequenceFromScriptDoc, buildCinematicSettingsPatchFromFormatSubtype, buildCinematicSettingsPatchFromPresetFamily, cinematicScriptDocSchema, getCinematicSettings } from '../../../src/domain/cinematics.ts'
import { mergeWorldBuildJobContext, readWorldBuildAttemptCount } from '../../../src/core/generationWorkflow.ts'
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
import {
  authorCinematicPlanSkeleton,
  cinematicCreativeScriptAuthorshipSystemPrompt,
  cinematicShotAuthorshipRawSchema,
  cinematicShotAuthorshipSystemPrompt,
  correctUgcPresetSelectionForPrompt,
  evaluateCinematicScriptQuality,
  ingestCreativeScriptPlan,
} from '../_shared/world-build-cinematics.ts'

const REPAIR_CINEMATIC_CONTRACT_VERSION = '2026-04-19-story-authorship-pipeline-v2'
void REPAIR_CINEMATIC_CONTRACT_VERSION
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
    const workflowAttemptCount = Math.max(cinematicJob.attempt_count ?? 0, readWorldBuildAttemptCount(existingResultContext)) + 1
    const useStoryScriptIngestPipeline = effectiveSettings.authorshipPipeline === STORY_SCRIPT_INGEST_PIPELINE
    const useCreativeScriptPipeline =
      effectiveSettings.authorshipPipeline === 'ugc_script_ingest_v1'
      || useStoryScriptIngestPipeline
    const authorshipPromptVersion = useStoryScriptIngestPipeline
      ? STORY_PROMPT_VERSION
      : useCreativeScriptPipeline
        ? 'ugc_creative_script_prompt_v1'
        : 'legacy_json_shot_authoring_v1'
    const repairingContext = mergeWorldBuildJobContext({
      kind: cinematicJob.kind,
      current: existingResultContext,
      phase: 'repairing_script',
      attemptCount: workflowAttemptCount,
      transitionReason: 'cinematic_repair_started',
      errorCategory: 'repair',
      diagnostics: [{
        category: 'repair',
        message: `Repair started for ${targetShotIds.length} shot(s).`,
        source: 'repair-cinematic-script',
      }],
      patch: {
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
    })

    await updateJob(client, cinematicJob.id, {
      attempt_count: workflowAttemptCount,
      lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      next_retry_at: null,
      result_context: repairingContext,
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
          schema: creativeScriptAuthorshipSchemaRuntime,
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

    const creativeScriptContractFailures =
      useStoryScriptIngestPipeline
        ? ingestionResult.diagnostics.filter((message) => /missing required (DURATION|VISUAL)/i.test(message))
        : []
    if (creativeScriptContractFailures.length > 0) {
      throw new Error(`Story creative script omitted required fields: ${creativeScriptContractFailures.join(' ')}`)
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
      lease_expires_at: null,
      next_retry_at: repairStillFailing && !repairExhausted ? new Date().toISOString() : null,
      result_context: mergeWorldBuildJobContext({
        kind: cinematicJob.kind,
        current: repairingContext,
        phase: nextPhase,
        attemptCount: workflowAttemptCount,
        transitionReason: repairStillFailing ? (repairExhausted ? 'repair_exhausted' : 'repair_requeued') : 'repair_completed',
        errorCategory: repairStillFailing ? 'repair' : 'none',
        diagnostics: qualityReport.failures.map((message) => ({
          category: 'quality_gate',
          message,
          source: 'repair-cinematic-script',
        })),
        patch: {
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
      }),
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
        jobs: refreshed.jobs.map((row) => parseWorldBuildJob(row, worldBuildJobSchema)),
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
          lease_expires_at: null,
          result_context: mergeWorldBuildJobContext({
            kind: failureCinematicJob.kind,
            current: existingResultContext,
            phase: 'repair_failed',
            attemptCount: Math.max(failureCinematicJob.attempt_count ?? 0, readWorldBuildAttemptCount(existingResultContext), 1),
            transitionReason: 'cinematic_repair_failed',
            errorCategory: 'repair',
            diagnostics: [{
              category: 'repair',
              message: errorMessage,
              source: 'repair-cinematic-script',
            }],
            patch: {
              authoringAttempts: Math.max(1, readNumericResultContextValue(existingResultContext, 'authoringAttempts')),
              repairAttempts: readNumericResultContextValue(existingResultContext, 'repairAttempts') + 1,
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
        console.error('[GraphCore] failed to persist cinematic repair failure state.', persistError)
      }
    }
    return errorResponse(error, 'Failed to repair cinematic script.')
  }
})
