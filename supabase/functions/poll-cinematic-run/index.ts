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
  applyShotBindingToGraph,
  buildStillPrompt,
  buildVideoPrompt,
  createStoredGeneratedAsset,
  extractFalVideoUrl,
  findGraph,
  findNode,
  isTerminalCinematicJobStatus,
  isTerminalCinematicRunStatus,
  persistShotBindingsIfPresent,
  resolveAssetUrl,
  resolveShotSources,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

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
  mode: z.enum(['graph_run', 'preview_still', 'preview_video']),
  shotNodeKey: z.string().nullable().optional(),
})

function resolveStillSourceAssetUrl(
  snapshot: z.infer<typeof requestSchema>['snapshot'],
  graph: NonNullable<ReturnType<typeof findGraph>>,
  shotNodeKey: string,
) {
  const shotNode = findNode(graph, shotNodeKey)
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'poll-cinematic-run')
    const admin = createAdminClient('poll-cinematic-run')
    const payload = requestSchema.parse(await request.json())
    const initialState = await loadRunState(client, payload.runId)

    if (isTerminalCinematicRunStatus(String(initialState.row.status ?? ''))) {
      return json(cinematicRunStatusResponseSchema.parse({
        run: toCinematicRun(initialState),
        graphs: [],
        assets: [],
      }))
    }

    const graph = findGraph(payload.snapshot, String(initialState.row.graph_key))
    if (!graph) {
      throw new HttpError(404, `Cinematic graph "${String(initialState.row.graph_key)}" was not found in the current snapshot.`)
    }

    let updatedGraph = graph
    const createdAssets: Array<Record<string, unknown>> = []

    for (const job of initialState.jobs) {
      if (job.status !== 'queued') continue
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

      const shotNode = findNode(updatedGraph, job.shotNodeKey)
      if (!shotNode) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: `Shot node "${job.shotNodeKey}" was not found.`,
        }).eq('id', job.id)
        break
      }

      const settings = getCinematicSettings(payload.snapshot.gameSpec ?? null, updatedGraph.metadata)
      const sourceInputs = resolveShotSources(payload.snapshot, updatedGraph, job.shotNodeKey)

      if (job.kind === 'shot_still') {
        const imageUrls = sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry))
        const stillModel = imageUrls.length > 0
          ? Deno.env.get('CINEMATIC_STILL_FAL_MODEL') ?? 'fal-ai/nano-banana-2/edit'
          : Deno.env.get('CINEMATIC_STILL_TEXT_FAL_MODEL') ?? 'fal-ai/nano-banana-2'

        const falResponse = await client.functions.invoke('ai-fal', {
          body: {
            action: 'subscribe',
            model: stillModel,
            input: {
              prompt: job.prompt || buildStillPrompt({
                snapshot: payload.snapshot,
                graph: updatedGraph,
                shotNode,
                sourceInputs,
              }),
              num_images: 1,
              aspect_ratio: settings.stillAspectRatio,
              output_format: 'png',
              resolution: settings.stillResolution,
              ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
            },
            logs: true,
            timeoutMs: 120000,
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
        const imageUrl = extractFalImageUrls(resultData)[0] ?? null
        if (!imageUrl) {
          await client.from('cinematic_run_jobs').update({
            status: 'failed',
            error_message: 'The still-generation provider returned no image URL.',
          }).eq('id', job.id)
          break
        }

        const storedAsset = await createStoredGeneratedAsset({
          admin,
          client,
          projectId: payload.snapshot.project.id,
          userId: user.id,
          sourceUrl: imageUrl,
          graphKey: updatedGraph.key,
          runId: payload.runId,
          name: `${shotNode.title} Still`,
          kind: 'image',
          metadata: {
            generatedBy: 'cinematic_still',
            provider: 'fal',
            model: (falResponse.data as { model?: unknown } | null)?.model ?? stillModel,
            requestId: (falResponse.data as { requestId?: unknown } | null)?.requestId ?? null,
            prompt: job.prompt,
          },
        })

        createdAssets.push(storedAsset)
        await client.from('cinematic_run_jobs').update({
          status: 'succeeded',
          still_asset_key: storedAsset.key,
          provider: 'fal',
          model: (falResponse.data as { model?: unknown } | null)?.model ?? stillModel,
          provider_request_id: (falResponse.data as { requestId?: unknown } | null)?.requestId ?? null,
          result_context: {
            imageUrl,
            stillAssetKey: storedAsset.key,
            sourceImageCount: imageUrls.length,
          },
        }).eq('id', job.id)

        updatedGraph = applyShotBindingToGraph(updatedGraph, job.shotNodeKey, {
          bodyImageAssetKey: storedAsset.key,
          metadata: {
            stillAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: String((falResponse.data as { model?: unknown } | null)?.model ?? stillModel),
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
          },
        })
        await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
          bodyImageAssetKey: storedAsset.key,
          metadata: {
            stillAssetKey: storedAsset.key,
            provider: 'fal',
            providerModel: String((falResponse.data as { model?: unknown } | null)?.model ?? stillModel),
            providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
          },
        })
        break
      }

      const stillUrl = resolveStillSourceAssetUrl({
        ...payload.snapshot,
        assets: [...payload.snapshot.assets, ...createdAssets],
      }, updatedGraph, job.shotNodeKey)
      if (!stillUrl) {
        await client.from('cinematic_run_jobs').update({
          status: 'failed',
          error_message: 'Generate a still for this shot before video generation can run.',
        }).eq('id', job.id)
        break
      }

      const videoModel = Deno.env.get('CINEMATIC_VIDEO_FAL_MODEL') ?? 'fal-ai/minimax/video-01/image-to-video'
      const falResponse = await client.functions.invoke('ai-fal', {
        body: {
          action: 'subscribe',
          model: videoModel,
          input: {
            image_url: stillUrl,
            prompt: job.prompt || buildVideoPrompt({
              snapshot: payload.snapshot,
              graph: updatedGraph,
              shotNode,
              sourceInputs,
            }),
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

      const storedAsset = await createStoredGeneratedAsset({
        admin,
        client,
        projectId: payload.snapshot.project.id,
        userId: user.id,
        sourceUrl: videoUrl,
        graphKey: updatedGraph.key,
        runId: payload.runId,
        name: `${shotNode.title} Clip`,
        kind: 'video',
        metadata: {
          generatedBy: 'cinematic_video',
          provider: 'fal',
          model: videoModel,
          requestId: (falResponse.data as { requestId?: unknown } | null)?.requestId ?? null,
          prompt: job.prompt,
          previewUrl: videoUrl,
        },
      })

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
          effectiveVideoResolution: settings.videoResolution === '720p' ? '720p' : '720p',
        },
      }).eq('id', job.id)

      updatedGraph = applyShotBindingToGraph(updatedGraph, job.shotNodeKey, {
        metadata: {
          videoAssetKey: storedAsset.key,
          provider: 'fal',
          providerModel: videoModel,
          providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
        },
      })
      await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, updatedGraph.key, job.shotNodeKey, {
        metadata: {
          videoAssetKey: storedAsset.key,
          provider: 'fal',
          providerModel: videoModel,
          providerRequestId: String((falResponse.data as { requestId?: unknown } | null)?.requestId ?? ''),
        },
      })
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

    return json(cinematicRunStatusResponseSchema.parse({
      run,
      graphs: [updatedGraph],
      assets: createdAssets,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to poll cinematic run.')
  }
})
