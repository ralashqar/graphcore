import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { normalizeProviderQueueHandle } from '../../../src/core/providerQueue.ts'
import { extractFalImageUrls } from '../../../src/domain/visualAssetGeneration.ts'
import {
  advanceDependentCinematicJobs,
  completeReservedGeneratedImageAsset,
  createStoredGeneratedAsset,
  extractFalVideoUrl,
  markGeneratedImageAssetFailed,
  persistShotBindingsIfPresent,
  persistStoryboardBindingsIfPresent,
  persistTakeBindingsIfPresent,
} from '../_shared/cinematics.ts'
import {
  bindCharacterMeshAsset,
  deleteProjectAssetRow,
  formatFalLogMessages,
  loadCharacterDefinition,
  loadProjectAsset,
  trellisGlbResultSchema,
  updateMeshJob,
} from '../_shared/mesh-generation.ts'
import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  isFalWebhookIpAllowed,
  parseFalWebhookRequestWithoutSignature,
  readFalWebhookErrorMessage,
  verifyFalWebhookRequest,
} from '../_shared/fal-webhooks.ts'

type WorldBuildJobRow = {
  id: string
  batch_id: string
  kind: string
  status: string
  target_keys: Record<string, unknown> | null
  prompt: string | null
  provider_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  result_context: Record<string, unknown> | null
  error_message: string | null
}

type WorldBuildBatchRow = {
  id: string
  project_id: string
  draft_id: string
  status: string
}

type CinematicRunJobRow = {
  id: string
  run_id: string
  graph_key: string
  shot_node_key: string
  kind: string
  status: string
  still_asset_key: string | null
  video_asset_key: string | null
  provider: string | null
  model: string | null
  provider_request_id: string | null
  prompt: string | null
  result_context: Record<string, unknown> | null
}

type CinematicRunRow = {
  id: string
  draft_id: string
  project_id: string
  graph_key: string
  status: string
  created_by: string | null
}

type MeshJobLookupRow = {
  id: string
}

const falWebhookPayloadOnlySchema = z.object({
  request_id: z.string().min(1),
  gateway_request_id: z.string().nullable().optional(),
  status: z.enum(['OK', 'ERROR']),
  payload: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  payload_error: z.string().nullable().optional(),
}).passthrough()

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function falWebhookRequiresSignature() {
  const raw = Deno.env.get('FAL_WEBHOOK_REQUIRE_SIGNATURE')?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function buildFalWebhookProviderMetadata(payload: z.infer<typeof falWebhookPayloadOnlySchema>) {
  const payloadRecord = asRecord(payload.payload)
  const imageUrl = extractFalImageUrls(payload.payload)[0] ?? ''
  const errorMessage = readFalWebhookErrorMessage(payload.payload)
    || readText(payload.error)
    || readText(payload.payload_error)
  return {
    webhookStatus: payload.status,
    webhookReceivedAt: new Date().toISOString(),
    webhookGatewayRequestId: payload.gateway_request_id ?? null,
    providerStatus: payload.status === 'OK' ? (imageUrl ? 'COMPLETED' : 'OK') : 'ERROR',
    falWebhookPayload: payloadRecord,
    falWebhookImageUrl: imageUrl || null,
    falImageUrl: imageUrl || null,
    webhookPayloadError: readText(payload.payload_error) || null,
    webhookErrorMessage: errorMessage || null,
  }
}

function readWorldBuildQueueMetadata(
  resultContext: Record<string, unknown> | null | undefined,
  overrides?: {
    providerRequestId?: string | null
    statusUrl?: string | null
    responseUrl?: string | null
    cancelUrl?: string | null
  },
) {
  return normalizeProviderQueueHandle({
    resultContext,
    overrides,
  })
}

function buildWorldBuildTerminalStatus(jobStatuses: string[]) {
  const failed = jobStatuses.some((status) => status === 'failed')
  const queuedOrRunning = jobStatuses.some((status) => status === 'queued' || status === 'running')

  if (queuedOrRunning) return 'running'
  if (failed && jobStatuses.some((status) => status === 'succeeded')) return 'completed_with_errors'
  if (failed) return 'failed'
  return 'completed'
}

function buildCinematicRunTerminalStatus(jobStatuses: string[]) {
  if (jobStatuses.length === 0) return 'failed'
  const terminal = jobStatuses.every((status) => ['succeeded', 'failed', 'cancelled', 'skipped'].includes(status))
  if (!terminal) return 'running'
  const failedCount = jobStatuses.filter((status) => status === 'failed').length
  const succeededCount = jobStatuses.filter((status) => status === 'succeeded').length
  if (failedCount > 0 && succeededCount === 0) return 'failed'
  if (failedCount > 0 || jobStatuses.some((status) => status === 'cancelled' || status === 'skipped')) {
    return 'completed_with_errors'
  }
  return 'completed'
}

function worldBuildGeneratedBy(kind: string, targetKeys: Record<string, unknown> | null) {
  if (kind === 'character_concept_image') return 'character_concept'
  if (kind === 'item_concept_image') return 'item_concept'
  if (kind === 'environment_concept_image') return 'environment_concept'
  if (kind === 'cinematic_composite_image') return 'cinematic_composite'
  if (kind === 'cinematic_take_still_image') return 'cinematic_take_still'
  if (kind === 'cinematic_storyboard_image') return 'cinematic_storyboard'
  if (typeof targetKeys?.storyboardAssetId === 'string') return 'cinematic_storyboard'
  return 'generated_image'
}

function worldBuildImageAssetName(job: WorldBuildJobRow) {
  const targetKeys = job.target_keys ?? {}
  const definitionName = typeof targetKeys.definitionName === 'string' ? targetKeys.definitionName : null
  const view = typeof targetKeys.view === 'string' ? targetKeys.view.replace(/_/g, ' ') : null
  if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image') {
    return definitionName ? `${definitionName} Concept` : 'Concept'
  }
  if (job.kind === 'environment_concept_image') {
    if (definitionName && view) return `${definitionName} ${view}`
    if (definitionName) return `${definitionName} Hero`
    return view ?? 'Environment'
  }
  if (job.kind === 'cinematic_composite_image') {
    return typeof targetKeys.compositeRefTitle === 'string' ? `${targetKeys.compositeRefTitle} Composite` : 'Composite'
  }
  if (job.kind === 'cinematic_take_still_image') {
    return typeof targetKeys.takeTitle === 'string' ? `${targetKeys.takeTitle} Still` : 'Take Still'
  }
  if (job.kind === 'cinematic_storyboard_image') {
    return typeof targetKeys.storyboardTitle === 'string' ? `${targetKeys.storyboardTitle} Storyboard` : 'Storyboard'
  }
  return 'Generated Image'
}

function resolveWorldBuildAssetKey(job: WorldBuildJobRow) {
  const resultContext = asRecord(job.result_context)
  const targetKeys = job.target_keys ?? {}
  return typeof resultContext.assetKey === 'string'
    ? resultContext.assetKey
    : typeof targetKeys.assetKey === 'string'
      ? targetKeys.assetKey
      : null
}

function resolveWorldBuildDefinitionKey(job: WorldBuildJobRow) {
  const targetKeys = job.target_keys ?? {}
  return typeof targetKeys.definitionKey === 'string' ? targetKeys.definitionKey : null
}

function shouldBindWorldBuildDefinitionIcon(job: WorldBuildJobRow) {
  if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image') return true
  return job.kind === 'environment_concept_image' && job.target_keys?.view === 'hero'
}

async function recomputeWorldBuildBatchStatus(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
) {
  const jobsResponse = await admin
    .from('world_build_jobs')
    .select('status')
    .eq('batch_id', batchId)

  if (jobsResponse.error) throw new Error(jobsResponse.error.message)
  const nextStatus = buildWorldBuildTerminalStatus((jobsResponse.data ?? []).map((row) => String(row.status ?? 'queued')))
  const updateResponse = await admin
    .from('world_build_batches')
    .update({ status: nextStatus })
    .eq('id', batchId)

  if (updateResponse.error) throw new Error(updateResponse.error.message)
}

/**
 * Server-side advancement: once a cinematic job reaches a terminal status via
 * webhook, submit any dependent queued jobs (e.g. shot_video waiting on its
 * still) so chains progress without an open client tab polling.
 */
async function advanceCinematicDependents(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  completedJobId: string,
  completedStillUrl?: string | null,
) {
  const falApiKey = Deno.env.get('FAL_KEY')
  if (!falApiKey) return
  try {
    const summary = await advanceDependentCinematicJobs({
      client: admin,
      falApiKey,
      runId,
      completedJobId,
      completedStillUrl: completedStillUrl ?? null,
    })
    if (summary.submitted > 0 || summary.skipped > 0 || summary.failed > 0) {
      console.info('[fal-webhook] advanced dependent cinematic jobs.', { runId, completedJobId, ...summary })
    }
  } catch (error) {
    console.error('[fal-webhook] failed to advance dependent cinematic jobs.', {
      runId,
      completedJobId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function recomputeCinematicRunStatus(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
) {
  const jobsResponse = await admin
    .from('cinematic_run_jobs')
    .select('status')
    .eq('run_id', runId)

  if (jobsResponse.error) throw new Error(jobsResponse.error.message)
  const nextStatus = buildCinematicRunTerminalStatus((jobsResponse.data ?? []).map((row) => String(row.status ?? 'queued')))
  const updateResponse = await admin
    .from('cinematic_runs')
    .update({ status: nextStatus })
    .eq('id', runId)

  if (updateResponse.error) throw new Error(updateResponse.error.message)
}

async function upsertDefinitionIconAsset(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  definitionKey: string,
  assetKey: string,
) {
  const updateResponse = await admin
    .from('project_definitions')
    .update({ icon_asset_key: assetKey })
    .eq('draft_id', draftId)
    .eq('key', definitionKey)

  if (updateResponse.error) throw new Error(updateResponse.error.message)
}

async function markWorldBuildWebhookPendingFallback(
  admin: ReturnType<typeof createAdminClient>,
  job: WorldBuildJobRow,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  const resultContext = asRecord(job.result_context)
  const queueMetadata = readWorldBuildQueueMetadata(resultContext, {
    providerRequestId: job.provider_request_id,
    statusUrl: job.status_url,
    responseUrl: job.response_url,
    cancelUrl: job.cancel_url,
  })
  const updateResponse = await admin
    .from('world_build_jobs')
    .update({
      status: 'running',
      provider_request_id: queueMetadata.providerRequestId,
      status_url: queueMetadata.statusUrl,
      response_url: queueMetadata.responseUrl,
      cancel_url: queueMetadata.cancelUrl,
      error_message: null,
      result_context: {
        ...resultContext,
        providerRequestId: queueMetadata.providerRequestId,
        statusUrl: queueMetadata.statusUrl,
        responseUrl: queueMetadata.responseUrl,
        cancelUrl: queueMetadata.cancelUrl,
        webhookStatus: payload.status,
        webhookPayloadError: payload.payload_error ?? null,
        webhookReceivedAt: new Date().toISOString(),
        webhookGatewayRequestId: payload.gateway_request_id ?? null,
      },
    })
    .eq('id', job.id)

  if (updateResponse.error) throw new Error(updateResponse.error.message)
}

async function handleWorldBuildJobWebhook(
  admin: ReturnType<typeof createAdminClient>,
  job: WorldBuildJobRow,
  batch: WorldBuildBatchRow,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  if (['succeeded', 'failed', 'cancelled', 'skipped'].includes(job.status)) {
    return
  }

  const assetKey = resolveWorldBuildAssetKey(job)
  const definitionKey = resolveWorldBuildDefinitionKey(job)
  const webhookMetadata = {
    webhookStatus: payload.status,
    webhookGatewayRequestId: payload.gateway_request_id ?? null,
    webhookReceivedAt: new Date().toISOString(),
  }

  if (payload.status === 'ERROR') {
    const message = readFalWebhookErrorMessage(payload)
    const updateResponse = await admin
      .from('world_build_jobs')
      .update({
        status: 'failed',
        provider_request_id: payload.request_id,
        error_message: message,
        result_context: {
          ...asRecord(job.result_context),
          ...webhookMetadata,
          webhookPayload: payload.payload ?? null,
        },
      })
      .eq('id', job.id)

    if (updateResponse.error) throw new Error(updateResponse.error.message)
    if (assetKey) {
      await markGeneratedImageAssetFailed({
        client: admin,
        projectId: batch.project_id,
        assetKey,
        errorMessage: message,
        metadata: {
          provider: 'fal',
          model: asRecord(job.result_context).model ?? null,
          requestId: payload.request_id,
          prompt: job.prompt ?? '',
        },
      })
    }
    await recomputeWorldBuildBatchStatus(admin, batch.id)
    return
  }

  const imageUrl = extractFalImageUrls(payload.payload)[0] ?? null
  if (!imageUrl || !assetKey) {
    await markWorldBuildWebhookPendingFallback(admin, job, payload)
    return
  }

  await completeReservedGeneratedImageAsset({
    client: admin,
    projectId: batch.project_id,
    assetKey,
    imageUrl,
    name: worldBuildImageAssetName(job),
    metadata: {
      generatedBy: worldBuildGeneratedBy(job.kind, job.target_keys),
      provider: 'fal',
      model: typeof asRecord(job.result_context).model === 'string' ? String(asRecord(job.result_context).model) : 'fal',
      requestId: payload.request_id,
      prompt: job.prompt ?? '',
      generation: {
        batchId: batch.id,
        jobId: job.id,
        state: 'completed',
        placeholder: false,
        source: 'global_prompt',
      },
      ...webhookMetadata,
    },
  })

  if (definitionKey && shouldBindWorldBuildDefinitionIcon(job)) {
    await upsertDefinitionIconAsset(admin, batch.draft_id, definitionKey, assetKey)
  }

  const updateResponse = await admin
    .from('world_build_jobs')
    .update({
      status: 'succeeded',
      provider_request_id: payload.request_id,
      status_url: job.status_url,
      response_url: job.response_url,
      cancel_url: job.cancel_url,
      error_message: null,
      result_context: {
        ...asRecord(job.result_context),
        assetKey,
        imageUrl,
        providerRequestId: payload.request_id,
        providerStatus: 'COMPLETED',
        statusData: payload.payload ?? null,
        ...webhookMetadata,
      },
    })
    .eq('id', job.id)

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  await recomputeWorldBuildBatchStatus(admin, batch.id)
}

async function markCinematicWebhookPendingFallback(
  admin: ReturnType<typeof createAdminClient>,
  job: CinematicRunJobRow,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  const resultContext = asRecord(job.result_context)
  const updateResponse = await admin
    .from('cinematic_run_jobs')
    .update({
      status: 'running',
      error_message: null,
      result_context: {
        ...resultContext,
        webhookStatus: payload.status,
        webhookPayloadError: payload.payload_error ?? null,
        webhookReceivedAt: new Date().toISOString(),
        webhookGatewayRequestId: payload.gateway_request_id ?? null,
      },
    })
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  if (updateResponse.error) throw new Error(updateResponse.error.message)
}

async function handleCinematicStillWebhook(
  admin: ReturnType<typeof createAdminClient>,
  run: CinematicRunRow,
  job: CinematicRunJobRow,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  if (['succeeded', 'failed', 'cancelled', 'skipped'].includes(job.status)) {
    // Already finalized by a concurrent poll; never double-process.
    return
  }
  const assetKey = job.still_asset_key
    ?? (typeof asRecord(job.result_context).assetKey === 'string' ? String(asRecord(job.result_context).assetKey) : null)
  const targetShotId = typeof asRecord(job.result_context).shotId === 'string'
    ? String(asRecord(job.result_context).shotId)
    : null

  if (payload.status === 'ERROR') {
    const message = readFalWebhookErrorMessage(payload)
    const updateResponse = await admin
      .from('cinematic_run_jobs')
      .update({
        status: 'failed',
        error_message: message,
        result_context: {
          ...asRecord(job.result_context),
          webhookStatus: payload.status,
          webhookPayload: payload.payload ?? null,
          webhookReceivedAt: new Date().toISOString(),
          webhookGatewayRequestId: payload.gateway_request_id ?? null,
        },
      })
      .eq('id', job.id)
      .in('status', ['queued', 'running'])
    if (updateResponse.error) throw new Error(updateResponse.error.message)

    if (assetKey) {
      await markGeneratedImageAssetFailed({
        client: admin,
        projectId: run.project_id,
        assetKey,
        errorMessage: message,
        metadata: {
          provider: 'fal',
          model: job.model ?? null,
          requestId: payload.request_id,
          prompt: job.prompt ?? '',
        },
      })
    }
    await advanceCinematicDependents(admin, run.id, job.id)
    await recomputeCinematicRunStatus(admin, run.id)
    return
  }

  const imageUrl = extractFalImageUrls(payload.payload)[0] ?? null
  if (!imageUrl || !assetKey) {
    await markCinematicWebhookPendingFallback(admin, job, payload)
    return
  }

  const isTakeStoryboardJob = job.kind === 'storyboard_still' && typeof asRecord(job.result_context).takeId === 'string'
  const storedAsset = await completeReservedGeneratedImageAsset({
    client: admin,
    projectId: run.project_id,
    assetKey,
    imageUrl,
    name: job.kind === 'storyboard_still' ? 'Storyboard' : 'Still',
    metadata: {
      generatedBy:
        job.kind === 'take_still'
          ? 'cinematic_take_still'
          : job.kind === 'storyboard_still'
            ? isTakeStoryboardJob
              ? 'cinematic_take_storyboard_still'
              : 'cinematic_storyboard_still'
            : 'cinematic_still',
      provider: 'fal',
      model: job.model ?? null,
      requestId: payload.request_id,
      prompt: job.prompt ?? '',
      webhookStatus: payload.status,
      webhookGatewayRequestId: payload.gateway_request_id ?? null,
      webhookReceivedAt: new Date().toISOString(),
    },
  })

  const updateResponse = await admin
    .from('cinematic_run_jobs')
    .update({
      status: 'succeeded',
      still_asset_key: storedAsset.key,
      error_message: null,
      result_context: {
        ...asRecord(job.result_context),
        assetKey: storedAsset.key,
        stillAssetKey: storedAsset.key,
        imageUrl,
        providerStatus: 'COMPLETED',
        statusData: payload.payload ?? null,
        webhookStatus: payload.status,
        webhookGatewayRequestId: payload.gateway_request_id ?? null,
        webhookReceivedAt: new Date().toISOString(),
      },
    })
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  if (updateResponse.error) throw new Error(updateResponse.error.message)

  if (job.kind === 'take_still') {
    await persistTakeBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, {
      bodyImageAssetKey: storedAsset.key,
      metadata: {
        outputStillAssetKey: storedAsset.key,
        provider: 'fal',
        providerModel: String(job.model ?? ''),
        providerRequestId: payload.request_id,
      },
    })
  } else if (job.kind === 'storyboard_still') {
    if (isTakeStoryboardJob) {
      const sourceStillAssetKey =
        typeof asRecord(job.result_context).sourceStillAssetKey === 'string'
          ? String(asRecord(job.result_context).sourceStillAssetKey)
          : null
      await persistTakeBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, {
        metadata: {
          storyboardAssetKey: storedAsset.key,
          storyboardSourceStillAssetKey: sourceStillAssetKey,
          provider: 'fal',
          providerModel: String(job.model ?? ''),
          providerRequestId: payload.request_id,
        },
      })
    } else {
      await persistStoryboardBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, {
        bodyImageAssetKey: storedAsset.key,
        metadata: {
          assetKey: storedAsset.key,
          provider: 'fal',
          providerModel: String(job.model ?? ''),
          providerRequestId: payload.request_id,
        },
      })
    }
  } else {
    await persistShotBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, targetShotId, {
      bodyImageAssetKey: storedAsset.key,
      metadata: {
        stillAssetKey: storedAsset.key,
        provider: 'fal',
        providerModel: String(job.model ?? ''),
        providerRequestId: payload.request_id,
      },
    })
  }

  await advanceCinematicDependents(admin, run.id, job.id, imageUrl)
  await recomputeCinematicRunStatus(admin, run.id)
}

async function handleCinematicVideoWebhook(
  admin: ReturnType<typeof createAdminClient>,
  run: CinematicRunRow,
  job: CinematicRunJobRow,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  if (['succeeded', 'failed', 'cancelled', 'skipped'].includes(job.status)) {
    // Already finalized by a concurrent poll; never double-process.
    return
  }
  const targetShotId = typeof asRecord(job.result_context).shotId === 'string'
    ? String(asRecord(job.result_context).shotId)
    : null
  if (payload.status === 'ERROR') {
    const message = readFalWebhookErrorMessage(payload)
    const updateResponse = await admin
      .from('cinematic_run_jobs')
      .update({
        status: 'failed',
        error_message: message,
        result_context: {
          ...asRecord(job.result_context),
          webhookStatus: payload.status,
          webhookPayload: payload.payload ?? null,
          webhookReceivedAt: new Date().toISOString(),
          webhookGatewayRequestId: payload.gateway_request_id ?? null,
        },
      })
      .eq('id', job.id)
      .in('status', ['queued', 'running'])
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    await advanceCinematicDependents(admin, run.id, job.id)
    await recomputeCinematicRunStatus(admin, run.id)
    return
  }

  const videoUrl = extractFalVideoUrl(payload.payload)
  if (!videoUrl) {
    await markCinematicWebhookPendingFallback(admin, job, payload)
    return
  }

  const storedAsset = await createStoredGeneratedAsset({
    admin,
    client: admin,
    projectId: run.project_id,
    userId: run.created_by ?? '00000000-0000-0000-0000-000000000000',
    sourceUrl: videoUrl,
    graphKey: run.graph_key,
    runId: run.id,
    name: `${job.shot_node_key} Clip`,
    kind: 'video',
    existingAssetKey: job.video_asset_key ?? undefined,
    metadata: {
      generatedBy: job.kind === 'take_video' ? 'cinematic_take_video' : 'cinematic_video',
      provider: 'fal',
      model: job.model ?? null,
      requestId: payload.request_id,
      prompt: job.prompt ?? '',
      previewUrl: videoUrl,
      webhookStatus: payload.status,
      webhookGatewayRequestId: payload.gateway_request_id ?? null,
      webhookReceivedAt: new Date().toISOString(),
    },
  })

  const executionPlan = asRecord(job.result_context).executionPlan
  const updateResponse = await admin
    .from('cinematic_run_jobs')
    .update({
      status: 'succeeded',
      video_asset_key: storedAsset.key,
      error_message: null,
      result_context: {
        ...asRecord(job.result_context),
        videoUrl,
        videoAssetKey: storedAsset.key,
        statusData: payload.payload ?? null,
        webhookStatus: payload.status,
        webhookGatewayRequestId: payload.gateway_request_id ?? null,
        webhookReceivedAt: new Date().toISOString(),
        ...(executionPlan && typeof executionPlan === 'object' ? { executionPlan } : {}),
      },
    })
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  if (updateResponse.error) throw new Error(updateResponse.error.message)

  if (job.kind === 'take_video') {
    await persistTakeBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, {
      metadata: {
        outputVideoAssetKey: storedAsset.key,
        provider: 'fal',
        providerModel: String(job.model ?? ''),
        providerRequestId: payload.request_id,
        ...(executionPlan && typeof executionPlan === 'object' ? { executionPlan } : {}),
      },
    })
  } else {
    await persistShotBindingsIfPresent(admin, run.draft_id, run.graph_key, job.shot_node_key, targetShotId, {
      metadata: {
        videoAssetKey: storedAsset.key,
        provider: 'fal',
        providerModel: String(job.model ?? ''),
        providerRequestId: payload.request_id,
        ...(executionPlan && typeof executionPlan === 'object' ? { executionPlan } : {}),
      },
    })
  }

  await advanceCinematicDependents(admin, run.id, job.id)
  await recomputeCinematicRunStatus(admin, run.id)
}

async function verifyUploadedMeshReadable(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  storagePath: string,
) {
  const attempts = [0, 300, 900]
  for (const delay of attempts) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    const downloadResponse = await admin.storage.from(bucket).download(storagePath)
    if (!downloadResponse.error && downloadResponse.data) {
      return { ok: true as const }
    }
  }

  const signedResponse = await admin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
  if (!signedResponse.error && signedResponse.data?.signedUrl) {
    return { ok: true as const }
  }

  return {
    ok: false as const,
    message: signedResponse.error?.message ?? 'The uploaded GLB could not be read back from Supabase Storage.',
  }
}

async function markMeshJobFailedFromWebhook(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  projectId: string,
  draftId: string,
  definitionKey: string,
  targetMeshAssetKey: string,
  message: string,
  providerStatus: string,
  providerLogs: string[],
) {
  const existingAsset = await loadProjectAsset(admin, projectId, targetMeshAssetKey)
  if (existingAsset) {
    if (existingAsset.storagePath) {
      await admin.storage.from('project-assets').remove([existingAsset.storagePath]).catch(() => undefined)
    }
    await deleteProjectAssetRow(admin, projectId, targetMeshAssetKey)
  }

  await bindCharacterMeshAsset(admin, draftId, definitionKey, null)
  await updateMeshJob(admin, jobId, {
    status: providerStatus === 'CANCELLED' ? 'cancelled' : 'failed',
    provider_status: providerStatus,
    provider_logs: providerLogs,
    error_message: message,
  })
}

async function handleMeshWebhook(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  const meshJob = await admin
    .from('mesh_generation_jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle()
  if (meshJob.error) throw new Error(meshJob.error.message)
  if (!meshJob.data) return

  const jobResponse = await admin
    .from('mesh_generation_jobs')
    .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
    .eq('id', jobId)
    .single()
  if (jobResponse.error || !jobResponse.data) {
    throw new Error(jobResponse.error?.message ?? `Mesh generation job ${jobId} was not found.`)
  }

  const job = jobResponse.data
  if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
    return
  }

  const providerLogs = formatFalLogMessages(payload.payload)
  if (payload.status === 'ERROR') {
    const message = readFalWebhookErrorMessage(payload)
    await markMeshJobFailedFromWebhook(
      admin,
      job.id,
      job.project_id,
      job.draft_id,
      job.definition_key,
      job.target_mesh_asset_key,
      message,
      'FAILED',
      providerLogs,
    )
    return
  }

  const parsedResult = trellisGlbResultSchema.safeParse(payload.payload)
  if (!parsedResult.success) {
    await updateMeshJob(admin, job.id, {
      status: 'running',
      provider_status: 'COMPLETED',
      provider_logs: providerLogs,
      error_message: null,
    })
    return
  }

  const definition = await loadCharacterDefinition(admin, job.draft_id, job.definition_key)
  if (!definition) {
    await markMeshJobFailedFromWebhook(
      admin,
      job.id,
      job.project_id,
      job.draft_id,
      job.definition_key,
      job.target_mesh_asset_key,
      `Definition ${job.definition_key} no longer exists in this draft.`,
      'FAILED',
      providerLogs,
    )
    return
  }

  const modelUrl = parsedResult.data.model_glb.url
  const fileResponse = await fetch(modelUrl)
  if (!fileResponse.ok) {
    await markMeshJobFailedFromWebhook(
      admin,
      job.id,
      job.project_id,
      job.draft_id,
      job.definition_key,
      job.target_mesh_asset_key,
      `The generated GLB could not be downloaded from Trellis 2 (${fileResponse.status}).`,
      'FAILED',
      providerLogs,
    )
    return
  }

  const storagePath = job.storage_path ?? `${job.target_mesh_asset_key}.glb`
  const meshBlob = await fileResponse.blob()
  const uploadResponse = await admin.storage.from('project-assets').upload(storagePath, meshBlob, {
    contentType: fileResponse.headers.get('content-type') || 'model/gltf-binary',
    upsert: true,
  })
  if (uploadResponse.error) {
    await markMeshJobFailedFromWebhook(
      admin,
      job.id,
      job.project_id,
      job.draft_id,
      job.definition_key,
      job.target_mesh_asset_key,
      uploadResponse.error.message,
      'FAILED',
      providerLogs,
    )
    return
  }

  const storageVerification = await verifyUploadedMeshReadable(admin, 'project-assets', storagePath)
  if (!storageVerification.ok) {
    await markMeshJobFailedFromWebhook(
      admin,
      job.id,
      job.project_id,
      job.draft_id,
      job.definition_key,
      job.target_mesh_asset_key,
      `The generated GLB uploaded to Supabase Storage but could not be read back. ${storageVerification.message}`,
      'FAILED',
      providerLogs,
    )
    return
  }

  const assetUpdate = await admin
    .from('project_assets')
    .update({
      name: `${definition.name} Mesh`,
      kind: 'mesh',
      mime_type: 'model/gltf-binary',
      storage_path: storagePath,
      metadata: {
        definitionKey: job.definition_key,
        generatedBy: 'trellis_mesh',
        provider: 'fal',
        model: job.model,
        requestId: payload.request_id,
        sourceImageAssetKey: job.source_image_asset_key,
        storageBucket: 'project-assets',
        storagePath,
        generatedAt: new Date().toISOString(),
        generation: {
          batchId: null,
          jobId: job.id,
          state: 'completed',
          placeholder: false,
          source: 'mesh_generation',
        },
        webhookStatus: payload.status,
        webhookGatewayRequestId: payload.gateway_request_id ?? null,
        webhookReceivedAt: new Date().toISOString(),
      },
    })
    .eq('project_id', job.project_id)
    .eq('key', job.target_mesh_asset_key)

  if (assetUpdate.error) throw new Error(assetUpdate.error.message)

  await bindCharacterMeshAsset(admin, job.draft_id, job.definition_key, job.target_mesh_asset_key)
  await updateMeshJob(admin, job.id, {
    status: 'succeeded',
    provider_status: 'COMPLETED',
    provider_logs: providerLogs,
    error_message: null,
  })
}

async function recordVisualGenerationFalWebhook(
  admin: ReturnType<typeof createAdminClient>,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  const lookup = await admin
    .from('visual_generation_jobs')
    .select('id, status, metadata')
    .filter('metadata->>falRequestId', 'eq', payload.request_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookup.error) throw new Error(lookup.error.message)
  const job = lookup.data as { id: string; status: string | null; metadata: Record<string, unknown> | null } | null
  if (!job) return false
  const metadata = asRecord(job.metadata)
  if (readText(metadata.falRequestId) !== payload.request_id) return false
  if (['completed', 'succeeded', 'failed', 'cancelled', 'canceled'].includes(readText(job.status))) {
    console.info('[fal-webhook] ignoring terminal visual generation job webhook.', {
      requestId: payload.request_id,
      jobId: job.id,
      status: job.status,
    })
    return true
  }
  const update = await admin
    .from('visual_generation_jobs')
    .update({
      metadata: {
        ...metadata,
        ...buildFalWebhookProviderMetadata(payload),
        falRequestId: payload.request_id,
        webhookMatchedAt: new Date().toISOString(),
        webhookMatchedTable: 'visual_generation_jobs',
      },
    })
    .eq('id', job.id)
  if (update.error) throw new Error(update.error.message)
  console.info('[fal-webhook] recorded visual generation provider result metadata.', {
    requestId: payload.request_id,
    jobId: job.id,
    status: payload.status,
  })
  return true
}

async function recordOutputWorkflowStepFalWebhook(
  admin: ReturnType<typeof createAdminClient>,
  payload: z.infer<typeof falWebhookPayloadOnlySchema>,
) {
  let lookup = await admin
    .from('output_workflow_run_steps')
    .select('id, status, provider_request_id, metadata')
    .eq('provider_request_id', payload.request_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookup.error) throw new Error(lookup.error.message)
  if (!lookup.data) {
    lookup = await admin
      .from('output_workflow_run_steps')
      .select('id, status, provider_request_id, metadata')
      .filter('metadata->>falRequestId', 'eq', payload.request_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lookup.error) throw new Error(lookup.error.message)
  }
  const step = lookup.data as { id: string; status: string | null; provider_request_id: string | null; metadata: Record<string, unknown> | null } | null
  if (!step) return false
  const metadata = asRecord(step.metadata)
  const currentRequestId = readText(step.provider_request_id) || readText(metadata.falRequestId)
  if (currentRequestId !== payload.request_id) return false
  if (['completed', 'failed', 'cancelled', 'canceled', 'skipped'].includes(readText(step.status))) {
    console.info('[fal-webhook] ignoring terminal output workflow step webhook.', {
      requestId: payload.request_id,
      stepId: step.id,
      status: step.status,
    })
    return true
  }
  const update = await admin
    .from('output_workflow_run_steps')
    .update({
      provider_request_id: step.provider_request_id || payload.request_id,
      metadata: {
        ...metadata,
        ...buildFalWebhookProviderMetadata(payload),
        falRequestId: payload.request_id,
        webhookMatchedAt: new Date().toISOString(),
        webhookMatchedTable: 'output_workflow_run_steps',
      },
    })
    .eq('id', step.id)
  if (update.error) throw new Error(update.error.message)
  console.info('[fal-webhook] recorded output workflow provider result metadata.', {
    requestId: payload.request_id,
    stepId: step.id,
    status: payload.status,
  })
  return true
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    console.info('[fal-webhook] incoming request headers.', {
      hasRequestIdHeader: request.headers.has('x-fal-webhook-request-id'),
      hasUserIdHeader: request.headers.has('x-fal-webhook-user-id'),
      hasTimestampHeader: request.headers.has('x-fal-webhook-timestamp'),
      hasSignatureHeader: request.headers.has('x-fal-webhook-signature'),
      userAgent: request.headers.get('user-agent') ?? null,
    })

    const verificationRequest = request.clone()
    const parsed = await parseFalWebhookRequestWithoutSignature(request)
    const requestIp = parsed.headers.requestIp
    const ipAllowed = await isFalWebhookIpAllowed(requestIp)
    if (!ipAllowed) {
      throw new HttpError(401, 'Fal webhook source IP is not allowlisted.')
    }

    console.info('[fal-webhook] accepted webhook source IP.', {
      requestId: parsed.headers.requestId,
      requestIp,
    })

    try {
      await verifyFalWebhookRequest(verificationRequest)
      console.info('[fal-webhook] signature verification succeeded.', {
        requestId: parsed.headers.requestId,
      })
    } catch (error) {
      if (falWebhookRequiresSignature()) {
        throw new HttpError(401, `Fal webhook signature verification failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      console.warn('[fal-webhook] proceeding without signature verification.', {
        requestId: parsed.headers.requestId,
        requestIp,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const payload = falWebhookPayloadOnlySchema.parse(parsed.payload)
    console.info('[fal-webhook] verified webhook.', {
      requestId: payload.request_id,
      status: payload.status,
      gatewayRequestId: payload.gateway_request_id ?? null,
    })
    const admin = createAdminClient('fal-webhook')

    const cinematicJobResponse = await admin
      .from('cinematic_run_jobs')
      .select('id, run_id, graph_key, shot_node_key, kind, status, still_asset_key, video_asset_key, provider, model, provider_request_id, prompt, result_context')
      .eq('provider_request_id', payload.request_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cinematicJobResponse.error) throw new Error(cinematicJobResponse.error.message)
    const cinematicJob = cinematicJobResponse.data as CinematicRunJobRow | null
    if (cinematicJob) {
      const runResponse = await admin
        .from('cinematic_runs')
        .select('id, draft_id, project_id, graph_key, status, created_by')
        .eq('id', cinematicJob.run_id)
        .single()
      if (runResponse.error || !runResponse.data) {
        throw new Error(runResponse.error?.message ?? `Cinematic run ${cinematicJob.run_id} was not found.`)
      }
      const run = runResponse.data as CinematicRunRow
      if (['shot_still', 'take_still', 'storyboard_still'].includes(cinematicJob.kind)) {
        await handleCinematicStillWebhook(admin, run, cinematicJob, payload)
      } else if (['shot_video', 'take_video'].includes(cinematicJob.kind)) {
        await handleCinematicVideoWebhook(admin, run, cinematicJob, payload)
      }
      return json({ ok: true, handled: 'cinematic', requestId: payload.request_id })
    }

    const meshJobLookup = await admin
      .from('mesh_generation_jobs')
      .select('id')
      .eq('provider_request_id', payload.request_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (meshJobLookup.error) throw new Error(meshJobLookup.error.message)
    const meshJob = meshJobLookup.data as MeshJobLookupRow | null
    if (meshJob) {
      await handleMeshWebhook(admin, meshJob.id, payload)
      return json({ ok: true, handled: 'mesh', requestId: payload.request_id })
    }

    let worldBuildJobResponse = await admin
      .from('world_build_jobs')
      .select('id, batch_id, kind, status, target_keys, prompt, provider_request_id, status_url, response_url, cancel_url, result_context, error_message')
      .eq('provider_request_id', payload.request_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (worldBuildJobResponse.error) throw new Error(worldBuildJobResponse.error.message)
    if (!worldBuildJobResponse.data) {
      worldBuildJobResponse = await admin
        .from('world_build_jobs')
        .select('id, batch_id, kind, status, target_keys, prompt, provider_request_id, status_url, response_url, cancel_url, result_context, error_message')
        .filter('result_context->>providerRequestId', 'eq', payload.request_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (worldBuildJobResponse.error) throw new Error(worldBuildJobResponse.error.message)
    }
    const worldBuildJob = worldBuildJobResponse.data as WorldBuildJobRow | null
    if (worldBuildJob) {
      console.info('[fal-webhook] matched world build job.', {
        requestId: payload.request_id,
        jobId: worldBuildJob.id,
        batchId: worldBuildJob.batch_id,
        kind: worldBuildJob.kind,
        jobStatus: worldBuildJob.status,
      })
      const batchResponse = await admin
        .from('world_build_batches')
        .select('id, project_id, draft_id, status')
        .eq('id', worldBuildJob.batch_id)
        .single()
      if (batchResponse.error || !batchResponse.data) {
        throw new Error(batchResponse.error?.message ?? `World build batch ${worldBuildJob.batch_id} was not found.`)
      }
      await handleWorldBuildJobWebhook(admin, worldBuildJob, batchResponse.data as WorldBuildBatchRow, payload)
      console.info('[fal-webhook] completed world build webhook handling.', {
        requestId: payload.request_id,
        jobId: worldBuildJob.id,
        batchId: worldBuildJob.batch_id,
        status: payload.status,
      })
      return json({ ok: true, handled: 'world_build', requestId: payload.request_id })
    }

    const visualGenerationHandled = await recordVisualGenerationFalWebhook(admin, payload)
    if (visualGenerationHandled) {
      return json({ ok: true, handled: 'visual_generation', requestId: payload.request_id })
    }

    const outputWorkflowHandled = await recordOutputWorkflowStepFalWebhook(admin, payload)
    if (outputWorkflowHandled) {
      return json({ ok: true, handled: 'output_workflow_step', requestId: payload.request_id })
    }

    console.warn('[fal-webhook] no matching queued job found.', {
      requestId: payload.request_id,
      status: payload.status,
    })
    return json({ ok: true, handled: 'none', requestId: payload.request_id })
  } catch (error) {
    return errorResponse(error, 'Failed to process Fal webhook.')
  }
})
