import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import {
  cinematicRunStatusResponseSchema,
  getCinematicSettings,
  getCinematicShotNodeConfig,
} from '../../../src/domain/cinematics.ts'
import { extractFalImageUrls } from '../../../src/domain/visualAssetGeneration.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import {
  buildStoryboardStillPrompt,
  buildTakeStoryboardStillPrompt,
  buildTakeStillPrompt,
  applyStoryboardBindingToGraph,
  applyTakeBindingToGraph,
  applyShotBindingToGraph,
  buildVirtualShotNode,
  buildTakeSeedanceExecutionPlan,
  buildSeedanceExecutionPlan,
  buildStillPrompt,
  buildGraphScopedTakeAssetKey,
  completeReservedGeneratedImageAsset,
  createStoredGeneratedAsset,
  extractFalVideoUrl,
  findGraph,
  findNode,
  isTerminalCinematicJobStatus,
  isTerminalCinematicRunStatus,
  markGeneratedImageAssetFailed,
  persistStoryboardBindingsIfPresent,
  persistTakeBindingsIfPresent,
  persistShotBindingsIfPresent,
  resolveAssetUrl,
  resolveStoryboardStillReferenceImageUrls,
  resolveStoryboardSources,
  resolveShotStillReferenceImageUrls,
  resolveTakeStoryboardReferenceImageUrls,
  resolveTakeStillReferenceImageUrls,
  resolveTakeSources,
  resolveShotSources,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { buildFalWebhookUrl } from '../_shared/fal-webhooks.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const falQueueBaseUrl = 'https://queue.fal.run'

const requestSchema = z.object({
  runId: z.string(),
  snapshot: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      summary: z.string(),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
    }),
    definitions: z.array(z.record(z.string(), z.unknown())).default([]),
    graphs: z.array(z.record(z.string(), z.unknown())).default([]),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    gameSpec: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  graphKey: z.string(),
  mode: z.enum(['graph_run', 'preview_still', 'preview_video', 'preview_take_still', 'preview_storyboard_still']),
  targetNodeKey: z.string().nullable().optional(),
  shotNodeKey: z.string().nullable().optional(),
  shotId: z.string().nullable().optional(),
})

function buildFalHeaders(apiKey: string) {
  return new Headers({
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json',
  })
}

async function fetchFalJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const rawText = await response.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return { response, body, rawText }
}

async function submitFalRequest(input: {
  apiKey: string
  model: string
  payload: Record<string, unknown>
  webhookUrl?: string | null
}) {
  const body = input.webhookUrl
    ? {
        ...input.payload,
        webhook_url: input.webhookUrl,
      }
    : input.payload
  return fetchFalJson(`${falQueueBaseUrl}/${input.model}`, {
    method: 'POST',
    headers: buildFalHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
}

async function getFalStatus(input: {
  apiKey: string
  model: string
  requestId: string
  logs?: boolean
  statusUrl?: string | null
}) {
  const url = input.statusUrl
    ? new URL(input.statusUrl)
    : new URL(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/status`)
  if (input.logs) {
    url.searchParams.set('logs', '1')
  }
  return fetchFalJson(url.toString(), {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
}

function resolveStoryboardStillFalModel(hasImageReferences: boolean) {
  if (hasImageReferences) {
    return Deno.env.get('CINEMATIC_STORYBOARD_EDIT_FAL_MODEL')
      ?? Deno.env.get('CINEMATIC_STILL_FAL_MODEL')
      ?? 'fal-ai/nano-banana-2/edit'
  }

  return Deno.env.get('CINEMATIC_STORYBOARD_TEXT_FAL_MODEL')
    ?? Deno.env.get('CINEMATIC_STILL_TEXT_FAL_MODEL')
    ?? 'fal-ai/nano-banana-2'
}

function isFalEditModel(model: string) {
  return model.includes('/edit')
}

async function getFalResult(input: {
  apiKey: string
  model: string
  requestId: string
  responseUrl?: string | null
}) {
  let { response, body, rawText } = await fetchFalJson(input.responseUrl || `${falQueueBaseUrl}/${input.model}/requests/${input.requestId}/response`, {
    method: 'GET',
    headers: buildFalHeaders(input.apiKey),
  })
  if (!input.responseUrl && (response.status === 404 || response.status === 405)) {
    ({ response, body, rawText } = await fetchFalJson(`${falQueueBaseUrl}/${input.model}/requests/${input.requestId}`, {
      method: 'GET',
      headers: buildFalHeaders(input.apiKey),
    }))
  }
  const normalizedData =
    body && typeof body.response === 'object' && body.response !== null
      ? body.response as Record<string, unknown>
      : body

  return {
    response,
    body,
    rawText,
    normalizedData,
  }
}

function getFalErrorMessage(body: Record<string, unknown>, fallback: string) {
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  return fallback
}

function isNonTerminalFalProgressMessage(body: Record<string, unknown>, providerStatus: string | null) {
  const errorMessage = typeof body.error === 'string' ? body.error.trim().toLowerCase() : ''
  const detailMessage = typeof body.detail === 'string' ? body.detail.trim().toLowerCase() : ''
  const message = errorMessage || detailMessage
  const status = providerStatus?.trim().toUpperCase() ?? null
  const indicatesProgressMessage = message === 'request is still in progress'
    || message === 'still in progress'
    || message === 'request in progress'
  const indicatesProgressStatus = status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'QUEUED'
  return indicatesProgressMessage && indicatesProgressStatus
}

function resolveStillSourceAssetUrl(
  snapshot: z.infer<typeof requestSchema>['snapshot'],
  graph: NonNullable<ReturnType<typeof findGraph>>,
  shotNodeKey: string,
  shotId: string | null,
) {
  const shotNode = shotId
    ? buildVirtualShotNode(graph, shotId, shotNodeKey)
    : findNode(graph, shotNodeKey)
  if (!shotNode || shotNode.type !== 'cinematic_shot') return null
  const shotConfig = getCinematicShotNodeConfig(shotNode)
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => (entry && typeof entry === 'object' ? entry : {})) : []
  const stillAsset = assets.find((asset) => (asset as { key?: unknown }).key === shotConfig.stillAssetKey) as { metadata?: unknown } | undefined

  return shotConfig.stillAssetKey
    ? resolveAssetUrl(stillAsset as { metadata?: unknown } | null)
    : null
}

function summarizeRunStatus(jobs: ReturnType<typeof toCinematicRunJob>[]) {
  if (jobs.length === 0) return 'failed' as const
  const terminal = jobs.every((job) => isTerminalCinematicJobStatus(job.status))
  const failedCount = jobs.filter((job) => job.status === 'failed').length
  const succeededCount = jobs.filter((job) => job.status === 'succeeded').length

  if (!terminal) return 'running' as const
  if (failedCount > 0 && succeededCount === 0) return 'failed' as const
  if (failedCount > 0 || jobs.some((job) => job.status === 'skipped' || job.status === 'cancelled')) {
    return 'completed_with_errors' as const
  }
  return 'completed' as const
}

async function loadRunState(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  runId: string,
) {
  const runRow = await client
    .from('cinematic_runs')
    .select('id, draft_id, project_id, graph_key, graph_name, mode, status, shot_node_key, diagnostics, created_at, updated_at')
    .eq('id', runId)
    .single()
  if (runRow.error || !runRow.data) {
    throw new HttpError(404, `Cinematic run "${runId}" was not found.`)
  }

  const jobRows = await client
    .from('cinematic_run_jobs')
    .select('id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, prompt, result_context, created_at, updated_at')
    .eq('run_id', runId)
    .order('order_index', { ascending: true })
  if (jobRows.error) {
    throw new Error(jobRows.error.message)
  }

  return {
    row: runRow.data as Record<string, unknown>,
    jobs: (jobRows.data ?? []).map((row) => toCinematicRunJob(row as Record<string, unknown>)),
  }
}

function toAssetDefinition(row: Record<string, unknown>) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    llmHints: row.llm_hints && typeof row.llm_hints === 'object' ? row.llm_hints : {},
  }
}

function getJobExecutionPlan(job: ReturnType<typeof toCinematicRunJob>) {
  const resultContext = job.resultContext
  if (!resultContext || typeof resultContext !== 'object') return undefined
  const executionPlan = resultContext.executionPlan
  return executionPlan && typeof executionPlan === 'object' ? executionPlan : undefined
}

function rebuildGraphFromRunJobs(
  graph: NonNullable<ReturnType<typeof findGraph>>,
  jobs: ReturnType<typeof toCinematicRunJob>[],
) {
  let nextGraph = graph

  for (const job of jobs) {
    const targetNode = findNode(nextGraph, job.shotNodeKey)
    const shotNode = job.shotId ? buildVirtualShotNode(nextGraph, job.shotId, job.shotNodeKey) : null
    if (!targetNode && !shotNode) continue

    if (job.kind === 'shot_still' && job.stillAssetKey) {
      nextGraph = applyShotBindingToGraph(nextGraph, job.shotNodeKey, job.shotId, {
        bodyImageAssetKey: job.stillAssetKey,
        metadata: {
          stillAssetKey: job.stillAssetKey,
          provider: job.provider,
          providerModel: job.model,
          providerRequestId: job.providerRequestId,
        },
      })
      continue
    }

    if (job.kind === 'take_still' && job.stillAssetKey) {
      nextGraph = applyTakeBindingToGraph(nextGraph, job.shotNodeKey, {
        bodyImageAssetKey: job.stillAssetKey,
        metadata: {
          previewImageAssetKey: job.stillAssetKey,
          outputStillAssetKey: job.stillAssetKey,
          provider: job.provider,
          providerModel: job.model,
          providerRequestId: job.providerRequestId,
        },
      })
      continue
    }

    if (job.kind === 'storyboard_still' && job.stillAssetKey) {
      if (targetNode?.type === 'cinematic_take') {
        nextGraph = applyTakeBindingToGraph(nextGraph, job.shotNodeKey, {
          bodyImageAssetKey: job.stillAssetKey,
          metadata: {
            previewImageAssetKey: job.stillAssetKey,
            storyboardAssetKey: job.stillAssetKey,
            provider: job.provider,
            providerModel: job.model,
            providerRequestId: job.providerRequestId,
          },
        })
      } else if (targetNode.type === 'storyboard_ref') {
        nextGraph = applyStoryboardBindingToGraph(nextGraph, job.shotNodeKey, {
          bodyImageAssetKey: job.stillAssetKey,
          metadata: {
            assetKey: job.stillAssetKey,
            provider: job.provider,
            providerModel: job.model,
            providerRequestId: job.providerRequestId,
          },
        })
      }
      continue
    }

    if (job.status !== 'succeeded') continue

    if (job.kind === 'shot_video' && job.videoAssetKey) {
      nextGraph = applyShotBindingToGraph(nextGraph, job.shotNodeKey, job.shotId, {
        metadata: {
          videoAssetKey: job.videoAssetKey,
          provider: job.provider,
          providerModel: job.model,
          providerRequestId: job.providerRequestId,
          ...(getJobExecutionPlan(job) ? { executionPlan: getJobExecutionPlan(job) } : {}),
        },
      })
      continue
    }

    if (job.kind === 'take_video' && job.videoAssetKey) {
      nextGraph = applyTakeBindingToGraph(nextGraph, job.shotNodeKey, {
        metadata: {
          outputVideoAssetKey: job.videoAssetKey,
          provider: job.provider,
          providerModel: job.model,
          providerRequestId: job.providerRequestId,
          ...(getJobExecutionPlan(job) ? { executionPlan: getJobExecutionPlan(job) } : {}),
        },
      })
    }
  }

  return nextGraph
}

async function loadPersistedRunAssets(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  projectId: string,
  jobs: ReturnType<typeof toCinematicRunJob>[],
) {
  const assetKeys = Array.from(new Set(
    jobs
      .flatMap((job) => [job.stillAssetKey, job.videoAssetKey])
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  ))

  if (assetKeys.length === 0) return []

  const assetRows = await client
    .from('project_assets')
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .in('key', assetKeys)

  if (assetRows.error) {
    throw new Error(assetRows.error.message)
  }

  const assetByKey = new Map(
    (assetRows.data ?? []).map((row) => [String(row.key), toAssetDefinition(row as Record<string, unknown>)]),
  )

  return assetKeys
    .map((key) => assetByKey.get(key) ?? null)
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
}

async function buildCinematicRunResponse(input: {
  client: Awaited<ReturnType<typeof requireUserClient>>['client']
  projectId: string
  snapshot: z.infer<typeof requestSchema>['snapshot']
  state: Awaited<ReturnType<typeof loadRunState>>
  baseGraph?: NonNullable<ReturnType<typeof findGraph>> | null
}) {
  const authoritativeAssets = await loadPersistedRunAssets(input.client, input.projectId, input.state.jobs)
  const graphKey = String(input.state.row.graph_key ?? '')
  const baseGraph = input.baseGraph ?? findGraph(input.snapshot, graphKey) ?? null
  const authoritativeGraph = baseGraph ? rebuildGraphFromRunJobs(baseGraph, input.state.jobs) : null

  return {
    run: toCinematicRun(input.state),
    graphs: authoritativeGraph ? [authoritativeGraph] : [],
    assets: authoritativeAssets,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'poll-cinematic-run')
    const admin = createAdminClient('poll-cinematic-run')
    const payload = requestSchema.parse(await request.json())
    const falApiKey = Deno.env.get('FAL_KEY')
    const initialState = await loadRunState(client, payload.runId)

    if (!falApiKey) {
      throw new Error('FAL_KEY is not configured.')
    }

    if (isTerminalCinematicRunStatus(String(initialState.row.status ?? ''))) {
      return json(cinematicRunStatusResponseSchema.parse(await buildCinematicRunResponse({
        client,
        projectId: payload.snapshot.project.id,
        snapshot: payload.snapshot,
        state: initialState,
      })))
    }

    const graph = findGraph(payload.snapshot, String(initialState.row.graph_key))
    if (!graph) {
      throw new HttpError(404, `Cinematic graph "${String(initialState.row.graph_key)}" was not found in the current snapshot.`)
    }

    let updatedGraph = graph
    const createdAssets: Array<Record<string, unknown>> = []

    for (const job of initialState.jobs) {
      if (job.status !== 'queued' && job.status !== 'running') continue
      const hasFailedDependency = job.dependsOnJobIds.some((dependencyId) => {
        const dependency = initialState.jobs.find((candidate) => candidate.id === dependencyId)
        return dependency ? dependency.status !== 'succeeded' && isTerminalCinematicJobStatus(dependency.status) : false
      })
      if (hasFailedDependency) {
        await client
          .from('cinematic_run_jobs')
          .update({
            status: 'skipped',
            error_message: 'Skipped because a dependency job failed.',
          })
          .eq('id', job.id)
        continue
      }

      const allDependenciesSucceeded = job.dependsOnJobIds.every((dependencyId) => {
        const dependency = initialState.jobs.find((candidate) => candidate.id === dependencyId)
        return dependency?.status === 'succeeded'
      })
      if (!allDependenciesSucceeded) continue

      const targetNode = findNode(updatedGraph, job.shotNodeKey)
      const nestedShotNode = job.shotId ? buildVirtualShotNode(updatedGraph, job.shotId, job.shotNodeKey) : null
      if (!targetNode && !nestedShotNode) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: job.shotId
            ? `Cinematic shot "${job.shotId}" or target node "${job.shotNodeKey}" was not found.`
            : `Cinematic node "${job.shotNodeKey}" was not found.`,
        }).eq('id', job.id)
        break
      }
      const isTakeJob = job.kind === 'take_video' || job.kind === 'take_still'
      const isStoryboardJob = job.kind === 'storyboard_still'
      const isTakeStoryboardJob = isStoryboardJob && targetNode?.type === 'cinematic_take'
      const shotNode = !isTakeJob && !isStoryboardJob
        ? (targetNode?.type === 'cinematic_shot' ? targetNode : nestedShotNode)
        : null
      const takeNode = (isTakeJob || isTakeStoryboardJob) ? targetNode : null
      const storyboardNode = isStoryboardJob ? targetNode : null

      const settings = getCinematicSettings(payload.snapshot.gameSpec ?? null, updatedGraph.metadata)
      const sourceInputs = isTakeJob
        ? resolveTakeSources(payload.snapshot, updatedGraph, job.shotNodeKey)
        : isStoryboardJob
          ? isTakeStoryboardJob
            ? resolveTakeSources(payload.snapshot, updatedGraph, job.shotNodeKey)
            : resolveStoryboardSources(payload.snapshot, updatedGraph, job.shotNodeKey)
          : resolveShotSources(payload.snapshot, updatedGraph, job.shotNodeKey, job.shotId)

      if (job.kind === 'shot_still' || job.kind === 'take_still' || job.kind === 'storyboard_still') {
        if (job.kind === 'shot_still' && !shotNode) {
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: 'Still jobs require a cinematic shot target.',
          }).eq('id', job.id)
          break
        }
        if (job.kind === 'take_still' && !takeNode) {
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: 'Take still jobs require a cinematic take node.',
          }).eq('id', job.id)
          break
        }
        if (job.kind === 'storyboard_still' && !storyboardNode) {
          if (!isTakeStoryboardJob) {
            await client.from('cinematic_run_jobs').update({
              status: 'failed',
              error_message: 'Storyboard still jobs require a storyboard ref node or cinematic take node.',
            }).eq('id', job.id)
            break
          }
        }
        const imageUrls = job.kind === 'take_still'
          ? resolveTakeStillReferenceImageUrls(payload.snapshot, updatedGraph, job.shotNodeKey, sourceInputs as ReturnType<typeof resolveTakeSources>)
          : job.kind === 'storyboard_still'
            ? isTakeStoryboardJob
              ? resolveTakeStoryboardReferenceImageUrls(payload.snapshot, updatedGraph, job.shotNodeKey)
              : resolveStoryboardStillReferenceImageUrls(payload.snapshot, updatedGraph, job.shotNodeKey, sourceInputs as ReturnType<typeof resolveStoryboardSources>)
            : resolveShotStillReferenceImageUrls(payload.snapshot, updatedGraph, sourceInputs as ReturnType<typeof resolveShotSources>)
        if (job.kind === 'storyboard_still' && isTakeStoryboardJob && imageUrls.length !== 1) {
          const message = 'Take storyboard generation requires exactly one representative still reference image. Refusing text-only or multi-reference fallback.'
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: message,
          }).eq('id', job.id)
          if (job.stillAssetKey) {
            await markGeneratedImageAssetFailed({
              client,
              projectId: payload.snapshot.project.id,
              assetKey: job.stillAssetKey,
              errorMessage: message,
              metadata: {
                kind: job.kind,
                shotNodeKey: job.shotNodeKey,
              },
            })
          }
          break
        }
        const stillModel = job.kind === 'storyboard_still'
          ? resolveStoryboardStillFalModel(imageUrls.length > 0)
          : imageUrls.length > 0
            ? Deno.env.get('CINEMATIC_STILL_FAL_MODEL') ?? 'fal-ai/nano-banana-2/edit'
            : Deno.env.get('CINEMATIC_STILL_TEXT_FAL_MODEL') ?? 'fal-ai/nano-banana-2'
        let stillPrompt: string
        try {
          stillPrompt =
            job.kind === 'take_still'
              ? buildTakeStillPrompt({
                  snapshot: payload.snapshot,
                  graph: updatedGraph,
                  takeNode: takeNode!,
                  sourceInputs: sourceInputs as ReturnType<typeof resolveTakeSources>,
                })
              : job.kind === 'storyboard_still'
                ? isTakeStoryboardJob
                  ? buildTakeStoryboardStillPrompt({
                      snapshot: payload.snapshot,
                      graph: updatedGraph,
                      takeNode: targetNode!,
                      sourceInputs: sourceInputs as ReturnType<typeof resolveTakeSources>,
                    })
                  : buildStoryboardStillPrompt({
                      snapshot: payload.snapshot,
                      graph: updatedGraph,
                      storyboardNode: storyboardNode!,
                      sourceInputs: sourceInputs as ReturnType<typeof resolveStoryboardSources>,
                    })
                : buildStillPrompt({
                    snapshot: payload.snapshot,
                    graph: updatedGraph,
                    shotNode: shotNode!,
                    sourceInputs: sourceInputs as ReturnType<typeof resolveShotSources>,
                  })
        } catch (promptError) {
          const message = promptError instanceof Error
            ? promptError.message
            : 'Still prompt assembly failed.'
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: message,
          }).eq('id', job.id)
          if (job.stillAssetKey) {
            await markGeneratedImageAssetFailed({
              client,
              projectId: payload.snapshot.project.id,
              assetKey: job.stillAssetKey,
              errorMessage: message,
              metadata: {
                kind: job.kind,
                shotNodeKey: job.shotNodeKey,
              },
            })
          }
          break
        }
        const reservedStillAssetKey =
          job.stillAssetKey
          ?? (
            job.resultContext
            && typeof job.resultContext === 'object'
            && typeof job.resultContext.assetKey === 'string'
            && job.resultContext.assetKey.trim().length > 0
              ? job.resultContext.assetKey.trim()
              : null
          )
        const resultContextRecord = job.resultContext && typeof job.resultContext === 'object'
          ? job.resultContext as Record<string, unknown>
          : {}
        const providerStatusUrl = typeof resultContextRecord.statusUrl === 'string' && resultContextRecord.statusUrl.trim().length > 0
          ? resultContextRecord.statusUrl.trim()
          : null
        const providerResponseUrl = typeof resultContextRecord.responseUrl === 'string' && resultContextRecord.responseUrl.trim().length > 0
          ? resultContextRecord.responseUrl.trim()
          : null

        if (job.status === 'queued') {
          const submitResult = await submitFalRequest({
            apiKey: falApiKey,
            model: stillModel,
            payload: {
              prompt: stillPrompt,
              num_images: 1,
              aspect_ratio: settings.stillAspectRatio,
              output_format: 'png',
              resolution: settings.stillResolution,
              ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
            },
            webhookUrl: buildFalWebhookUrl(),
          })

          const requestId = typeof submitResult.body.request_id === 'string' ? submitResult.body.request_id : null

          if (!submitResult.response.ok) {
            const message = getFalErrorMessage(
              submitResult.body,
              `Fal still submission failed with HTTP ${submitResult.response.status}.`,
            )
            console.error('[poll-cinematic-run] still submit failed.', {
              runId: payload.runId,
              jobId: job.id,
            shotNodeKey: job.shotNodeKey,
            shotId: job.shotId,
            kind: job.kind,
              model: stillModel,
              requestId,
              message,
            })
            await client.from('cinematic_run_jobs').update({
              status: 'failed',
              provider: 'fal',
              model: stillModel,
              provider_request_id: requestId,
              prompt: stillPrompt,
              error_message: message,
            }).eq('id', job.id)
            if (reservedStillAssetKey) {
              await markGeneratedImageAssetFailed({
                client,
                projectId: payload.snapshot.project.id,
                assetKey: reservedStillAssetKey,
                errorMessage: message,
                metadata: {
                  provider: 'fal',
                  model: stillModel,
                  requestId,
                  prompt: stillPrompt,
                },
              })
            }
            break
          }

          if (!requestId) {
            await client.from('cinematic_run_jobs').update({
              status: 'failed',
              provider: 'fal',
              model: stillModel,
              prompt: stillPrompt,
              error_message: 'Fal did not return a request id for the cinematic still job.',
            }).eq('id', job.id)
            if (reservedStillAssetKey) {
              await markGeneratedImageAssetFailed({
                client,
                projectId: payload.snapshot.project.id,
                assetKey: reservedStillAssetKey,
                errorMessage: 'Fal did not return a request id for the cinematic still job.',
                metadata: {
                  provider: 'fal',
                  model: stillModel,
                  prompt: stillPrompt,
                },
              })
            }
            break
          }

          await client.from('cinematic_run_jobs').update({
            status: 'running',
            provider: 'fal',
            model: stillModel,
            provider_request_id: requestId,
            prompt: stillPrompt,
            result_context: {
              ...resultContextRecord,
              assetKey: reservedStillAssetKey,
              sourceImageCount: imageUrls.length,
              submittedAt: new Date().toISOString(),
              statusUrl: typeof submitResult.body.status_url === 'string' ? submitResult.body.status_url : null,
              responseUrl: typeof submitResult.body.response_url === 'string' ? submitResult.body.response_url : null,
            },
            error_message: null,
          }).eq('id', job.id)
          break
        }

        const providerRequestId = job.providerRequestId
        if (!providerRequestId) {
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: 'Still-generation job is missing a provider request id.',
          }).eq('id', job.id)
          if (reservedStillAssetKey) {
            await markGeneratedImageAssetFailed({
              client,
              projectId: payload.snapshot.project.id,
              assetKey: reservedStillAssetKey,
              errorMessage: 'Still-generation job is missing a provider request id.',
              metadata: {
                provider: 'fal',
                model: job.model ?? stillModel,
                prompt: job.prompt ?? stillPrompt,
              },
            })
          }
          break
        }

        if (!reservedStillAssetKey) {
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: 'Still-generation job is missing a reserved asset key.',
          }).eq('id', job.id)
          break
        }

        const falResult = await getFalResult({
          apiKey: falApiKey,
          model: job.model ?? stillModel,
          requestId: providerRequestId,
          responseUrl: providerResponseUrl,
        })
        if (job.kind === 'storyboard_still' && isFalEditModel(job.model ?? stillModel)) {
          console.info('[poll-cinematic-run] storyboard edit result payload.', {
            runId: payload.runId,
            jobId: job.id,
            shotNodeKey: job.shotNodeKey,
            requestId: providerRequestId,
            model: job.model ?? stillModel,
            httpStatus: falResult.response.status,
            normalizedData: falResult.normalizedData,
            rawBody: falResult.body,
            rawText: falResult.rawText,
          })
        }
        const resultImageUrl =
          extractFalImageUrls(falResult.normalizedData)[0]
          ?? extractFalImageUrls(falResult.body)[0]
          ?? null
        let imageUrl = resultImageUrl
        if (!imageUrl) {
          const statusResult = await getFalStatus({
            apiKey: falApiKey,
            model: job.model ?? stillModel,
            requestId: providerRequestId,
            logs: true,
            statusUrl: providerStatusUrl,
          })
          const providerStatus = typeof statusResult.body.status === 'string' ? statusResult.body.status : null
          if (job.kind === 'storyboard_still' && isFalEditModel(job.model ?? stillModel)) {
            console.info('[poll-cinematic-run] storyboard edit status payload.', {
              runId: payload.runId,
              jobId: job.id,
              shotNodeKey: job.shotNodeKey,
              requestId: providerRequestId,
              model: job.model ?? stillModel,
              httpStatus: statusResult.response.status,
              providerStatus,
              rawBody: statusResult.body,
              rawText: statusResult.rawText,
            })
          }
          imageUrl = extractFalImageUrls(statusResult.body)[0] ?? null

          if (typeof statusResult.body.error === 'string') {
            if (isNonTerminalFalProgressMessage(statusResult.body, providerStatus)) {
              await client.from('cinematic_run_jobs').update({
                status: 'running',
                provider: 'fal',
                model: job.model ?? stillModel,
                provider_request_id: providerRequestId,
                result_context: {
                  ...(job.resultContext && typeof job.resultContext === 'object' ? job.resultContext : {}),
                  lastObservedProviderStatus: providerStatus,
                  lastStatusCheckAt: new Date().toISOString(),
                },
                error_message: null,
              }).eq('id', job.id)
              break
            }

            await client.from('cinematic_run_jobs').update({
              status: 'failed',
              error_message: statusResult.body.error,
            }).eq('id', job.id)
            await markGeneratedImageAssetFailed({
              client,
              projectId: payload.snapshot.project.id,
              assetKey: reservedStillAssetKey,
              errorMessage: statusResult.body.error,
              metadata: {
                provider: 'fal',
                model: job.model ?? stillModel,
                requestId: providerRequestId,
                prompt: job.prompt ?? stillPrompt,
              },
            })
            break
          }

          if (imageUrl) {
            // Fal sometimes exposes finished image payloads through status-like envelopes before the canonical result shape stabilizes.
          } else if (providerStatus === 'COMPLETED') {
            const message = getFalErrorMessage(
              falResult.body,
              'The still-generation provider reported completion but returned no image URL.',
            )
            await client.from('cinematic_run_jobs').update({
              status: 'failed',
              error_message: message,
            }).eq('id', job.id)
            await markGeneratedImageAssetFailed({
              client,
              projectId: payload.snapshot.project.id,
              assetKey: reservedStillAssetKey,
              errorMessage: message,
              metadata: {
                provider: 'fal',
                model: job.model ?? stillModel,
                requestId: providerRequestId,
                prompt: job.prompt ?? stillPrompt,
              },
            })
            break
          } else {
            await client.from('cinematic_run_jobs').update({
              status: 'running',
              provider: 'fal',
              model: job.model ?? stillModel,
              provider_request_id: providerRequestId,
              result_context: {
                ...(job.resultContext && typeof job.resultContext === 'object' ? job.resultContext : {}),
                lastObservedProviderStatus: providerStatus,
                lastStatusCheckAt: new Date().toISOString(),
              },
              error_message: null,
            }).eq('id', job.id)
            break
          }
        }

        const statusResult = await getFalStatus({
          apiKey: falApiKey,
          model: job.model ?? stillModel,
          requestId: providerRequestId,
          logs: true,
          statusUrl: providerStatusUrl,
        })
        const providerStatus = typeof statusResult.body.status === 'string' ? statusResult.body.status : null
          if (typeof statusResult.body.error === 'string' && !isNonTerminalFalProgressMessage(statusResult.body, providerStatus)) {
            const message = getFalErrorMessage(
              statusResult.body,
              'The still-generation provider returned an error.',
            )
            await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: message,
          }).eq('id', job.id)
          await markGeneratedImageAssetFailed({
            client,
            projectId: payload.snapshot.project.id,
            assetKey: reservedStillAssetKey,
            errorMessage: message,
            metadata: {
              provider: 'fal',
              model: job.model ?? stillModel,
              requestId: providerRequestId,
              prompt: job.prompt ?? stillPrompt,
            },
            })
            break
          }

          if (isNonTerminalFalProgressMessage(statusResult.body, providerStatus)) {
            await client.from('cinematic_run_jobs').update({
              status: 'running',
              provider: 'fal',
              model: job.model ?? stillModel,
              provider_request_id: providerRequestId,
              result_context: {
                ...(job.resultContext && typeof job.resultContext === 'object' ? job.resultContext : {}),
                lastObservedProviderStatus: providerStatus,
                lastStatusCheckAt: new Date().toISOString(),
              },
              error_message: null,
            }).eq('id', job.id)
            break
          }

        let storedAsset
        try {
          storedAsset = await completeReservedGeneratedImageAsset({
            client,
            projectId: payload.snapshot.project.id,
            assetKey: reservedStillAssetKey,
            imageUrl,
            name: job.kind === 'storyboard_still' ? `${targetNode.title} Storyboard` : `${targetNode.title} Still`,
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
              model: job.model ?? stillModel,
              requestId: providerRequestId,
              prompt: job.prompt ?? stillPrompt,
            },
          })
        } catch (assetError) {
          const message = assetError instanceof Error ? assetError.message : 'Failed to persist the generated cinematic image asset.'
          console.error('[poll-cinematic-run] failed to persist generated image asset.', {
            runId: payload.runId,
            jobId: job.id,
            shotNodeKey: job.shotNodeKey,
            imageUrl,
            message,
          })
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: message,
          }).eq('id', job.id)
          await markGeneratedImageAssetFailed({
            client,
            projectId: payload.snapshot.project.id,
            assetKey: reservedStillAssetKey,
            errorMessage: message,
            metadata: {
              provider: 'fal',
              model: job.model ?? stillModel,
              requestId: providerRequestId,
              prompt: job.prompt ?? stillPrompt,
            },
          })
          break
        }

        createdAssets.push(storedAsset)
        await client.from('cinematic_run_jobs').update({
          status: 'succeeded',
          still_asset_key: storedAsset.key,
          provider: 'fal',
          model: job.model ?? stillModel,
          provider_request_id: providerRequestId,
          result_context: {
            ...(job.resultContext && typeof job.resultContext === 'object' ? job.resultContext : {}),
            assetKey: storedAsset.key,
            imageUrl,
            stillAssetKey: storedAsset.key,
            sourceImageCount: imageUrls.length,
            status: providerStatus,
            statusData: statusResult.body,
          },
          error_message: null,
        }).eq('id', job.id)

        if (job.kind === 'take_still') {
          updatedGraph = applyTakeBindingToGraph(updatedGraph, job.shotNodeKey, {
            bodyImageAssetKey: storedAsset.key,
            metadata: {
              previewImageAssetKey: storedAsset.key,
              outputStillAssetKey: storedAsset.key,
              provider: 'fal',
              providerModel: String(job.model ?? stillModel),
              providerRequestId: String(providerRequestId),
            },
          })
          await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
            bodyImageAssetKey: storedAsset.key,
            metadata: {
              previewImageAssetKey: storedAsset.key,
              outputStillAssetKey: storedAsset.key,
              provider: 'fal',
              providerModel: String(job.model ?? stillModel),
              providerRequestId: String(providerRequestId),
            },
          })
        } else if (job.kind === 'storyboard_still') {
          if (isTakeStoryboardJob) {
            const sourceStillAssetKey =
              typeof job.resultContext?.sourceStillAssetKey === 'string' && job.resultContext.sourceStillAssetKey.trim().length > 0
                ? job.resultContext.sourceStillAssetKey
                : null
            updatedGraph = applyTakeBindingToGraph(updatedGraph, job.shotNodeKey, {
              bodyImageAssetKey: storedAsset.key,
              metadata: {
                previewImageAssetKey: storedAsset.key,
                storyboardAssetKey: storedAsset.key,
                storyboardSourceStillAssetKey: sourceStillAssetKey,
                provider: 'fal',
                providerModel: String(job.model ?? stillModel),
                providerRequestId: String(providerRequestId),
              },
            })
            await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
              bodyImageAssetKey: storedAsset.key,
              metadata: {
                previewImageAssetKey: storedAsset.key,
                storyboardAssetKey: storedAsset.key,
                storyboardSourceStillAssetKey: sourceStillAssetKey,
                provider: 'fal',
                providerModel: String(job.model ?? stillModel),
                providerRequestId: String(providerRequestId),
              },
            })
          } else {
            updatedGraph = applyStoryboardBindingToGraph(updatedGraph, job.shotNodeKey, {
              bodyImageAssetKey: storedAsset.key,
              metadata: {
                assetKey: storedAsset.key,
                provider: 'fal',
                providerModel: String(job.model ?? stillModel),
                providerRequestId: String(providerRequestId),
              },
            })
            await persistStoryboardBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
              bodyImageAssetKey: storedAsset.key,
              metadata: {
                assetKey: storedAsset.key,
                provider: 'fal',
                providerModel: String(job.model ?? stillModel),
                providerRequestId: String(providerRequestId),
              },
            })
          }
        } else {
          updatedGraph = applyShotBindingToGraph(updatedGraph, job.shotNodeKey, job.shotId, {
            bodyImageAssetKey: storedAsset.key,
            metadata: {
              stillAssetKey: storedAsset.key,
              provider: 'fal',
              providerModel: String(job.model ?? stillModel),
              providerRequestId: String(providerRequestId),
            },
          })
          await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, job.shotId, {
            bodyImageAssetKey: storedAsset.key,
            metadata: {
              stillAssetKey: storedAsset.key,
              provider: 'fal',
              providerModel: String(job.model ?? stillModel),
              providerRequestId: String(providerRequestId),
            },
          })
        }
        break
      }

      const executionPlan =
        job.resultContext && typeof job.resultContext === 'object' && job.resultContext.executionPlan && typeof job.resultContext.executionPlan === 'object'
          ? job.resultContext.executionPlan
          : isTakeJob
            ? buildTakeSeedanceExecutionPlan({
                snapshot: payload.snapshot,
                graph: updatedGraph,
                takeNode: takeNode!,
                sourceInputs: sourceInputs as ReturnType<typeof resolveTakeSources>,
              })
            : buildSeedanceExecutionPlan({
                snapshot: payload.snapshot,
                graph: updatedGraph,
                shotNode: shotNode!,
                sourceInputs: sourceInputs as ReturnType<typeof resolveShotSources>,
              })
      const fallbackStillUrl = resolveStillSourceAssetUrl({
        ...payload.snapshot,
        assets: [...payload.snapshot.assets, ...createdAssets],
      }, updatedGraph, job.shotNodeKey, job.shotId)
      if (executionPlan.endpoint === 'image-to-video' && !executionPlan.imageUrl && !fallbackStillUrl && !isTakeJob) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: 'This shot needs at least one image reference or generated still before Seedance image-to-video can run.',
        }).eq('id', job.id)
        break
      }
      if (executionPlan.endpoint === 'image-to-video' && !executionPlan.imageUrl && isTakeJob) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: 'This compiled take needs at least one primary image reference before image-to-video can run.',
        }).eq('id', job.id)
        break
      }

      const videoModel = executionPlan.endpoint === 'image-to-video'
        ? (Deno.env.get('CINEMATIC_SEEDANCE_IMAGE_MODEL') ?? 'bytedance/seedance-2.0/image-to-video')
        : (Deno.env.get('CINEMATIC_SEEDANCE_REFERENCE_MODEL') ?? 'bytedance/seedance-2.0/reference-to-video')
      const falResponse = await client.functions.invoke('ai-fal', {
        body: {
          action: 'subscribe',
          model: videoModel,
          input: executionPlan.endpoint === 'image-to-video'
            ? {
                image_url: executionPlan.imageUrl ?? fallbackStillUrl,
                ...(executionPlan.endImageUrl ? { end_image_url: executionPlan.endImageUrl } : {}),
                prompt: job.prompt || executionPlan.prompt,
                resolution: executionPlan.resolution,
                duration: executionPlan.duration,
                aspect_ratio: executionPlan.aspectRatio,
                generate_audio: executionPlan.generateAudio,
                ...(executionPlan.seed ? { seed: executionPlan.seed } : {}),
              }
            : {
                prompt: job.prompt || executionPlan.prompt,
                image_urls: executionPlan.imageUrls,
                video_urls: executionPlan.videoUrls,
                audio_urls: executionPlan.audioUrls,
                resolution: executionPlan.resolution,
                duration: executionPlan.duration,
                aspect_ratio: executionPlan.aspectRatio,
                generate_audio: executionPlan.generateAudio,
                ...(executionPlan.seed ? { seed: executionPlan.seed } : {}),
              },
          logs: true,
          timeoutMs: 180000,
        },
      })

      if (falResponse.error) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: falResponse.error.message,
        }).eq('id', job.id)
        break
      }

      const resultData = ((falResponse.data as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
      const videoUrl = extractFalVideoUrl(resultData)
      if (!videoUrl) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: 'The video-generation provider returned no video URL.',
        }).eq('id', job.id)
        break
      }

      let storedAsset
      try {
        storedAsset = await createStoredGeneratedAsset({
          admin,
          client,
          projectId: payload.snapshot.project.id,
          userId: user.id,
          sourceUrl: videoUrl,
          graphKey: updatedGraph.key,
          runId: payload.runId,
          name: isTakeJob
            ? `${updatedGraph.name} / ${targetNode.title} / Clip`
            : `${targetNode.title} Clip`,
          kind: 'video',
          existingAssetKey: isTakeJob
            ? buildGraphScopedTakeAssetKey({ graphKey: updatedGraph.key, takeNodeKey: job.shotNodeKey, kind: 'video', uniqueScope: job.id })
            : undefined,
          metadata: {
            generatedBy: isTakeJob ? 'cinematic_take_video' : 'cinematic_video',
            provider: 'fal',
            model: videoModel,
            requestId: (falResponse.data as { requestId?: unknown } | null)?.requestId ?? null,
            prompt: job.prompt,
            previewUrl: videoUrl,
          },
        })
      } catch (assetError) {
        const message = assetError instanceof Error ? assetError.message : 'Failed to persist the generated cinematic video asset.'
        console.error('[poll-cinematic-run] failed to persist generated video asset.', {
          runId: payload.runId,
          jobId: job.id,
          shotNodeKey: job.shotNodeKey,
          videoUrl,
          message,
        })
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: message,
        }).eq('id', job.id)
        break
      }

      createdAssets.push(storedAsset)
      await client.from('cinematic_run_jobs').update({
        status: 'succeeded',
        video_asset_key: storedAsset.key,
        provider: 'fal',
        model: videoModel,
        provider_request_id: (falResponse.data as { requestId?: unknown } | null)?.requestId ?? null,
        result_context: {
          videoUrl,
          videoAssetKey: storedAsset.key,
          effectiveVideoResolution: executionPlan.resolution,
          executionPlan,
        },
      }).eq('id', job.id)

      if (isTakeJob) {
        updatedGraph = applyTakeBindingToGraph(updatedGraph, job.shotNodeKey, {
          metadata: {
            outputVideoAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: videoModel,
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
            executionPlan,
          },
        })
        await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
          metadata: {
            outputVideoAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: videoModel,
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
            executionPlan,
          },
        })
      } else {
        updatedGraph = applyShotBindingToGraph(updatedGraph, job.shotNodeKey, job.shotId, {
          metadata: {
            videoAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: videoModel,
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
            executionPlan,
          },
        })
        await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, job.shotId, {
          metadata: {
            videoAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: videoModel,
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
            executionPlan,
          },
        })
      }
      break
    }

    const nextState = await loadRunState(client, payload.runId)
    const runStatus = summarizeRunStatus(nextState.jobs)
    const diagnostics = [
      ...(Array.isArray(nextState.row.diagnostics) ? nextState.row.diagnostics.filter((entry): entry is string => typeof entry === 'string') : []),
      ...(getCinematicSettings(payload.snapshot.gameSpec ?? null, updatedGraph.metadata).videoResolution !== '720p'
        ? ['Current cinematic video generation uses MiniMax Video 01 on fal.ai, which outputs 720p / 25fps.']
        : []),
    ]

    await client.from('cinematic_runs').update({
      status: runStatus,
      diagnostics,
    }).eq('id', payload.runId)

    const finalState = await loadRunState(client, payload.runId)
    const run = toCinematicRun({
      row: {
        ...finalState.row,
        status: runStatus,
        diagnostics,
      },
      jobs: finalState.jobs,
    })

    return json(cinematicRunStatusResponseSchema.parse(await buildCinematicRunResponse({
      client,
      projectId: payload.snapshot.project.id,
      snapshot: payload.snapshot,
      state: {
        row: {
          ...finalState.row,
          status: run.status,
          diagnostics: run.diagnostics,
        },
        jobs: finalState.jobs,
      },
      baseGraph: updatedGraph,
    })))
  } catch (error) {
    return errorResponse(error, 'Failed to poll cinematic run.')
  }
})
