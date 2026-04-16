import '@supabase/functions-js/edge-runtime.d.ts'

import {
  cinematicRunStartRequestSchema,
  cinematicRunStatusResponseSchema,
  getCinematicShotNodeConfig,
  getCinematicSettings,
  getCinematicTakeNodeConfig,
  getCinematicSequence,
  getStoryboardRefNodeConfig,
} from '../../../src/domain/cinematics.ts'
import { requireUserClient } from '../_shared/auth.ts'
import {
  buildStoryboardStillPrompt,
  buildTakeStoryboardStillPrompt,
  applyTakeBindingToGraph,
  applyStoryboardBindingToGraph,
  applyShotBindingToGraph,
  buildVirtualShotNode,
  buildTakeStillPrompt,
  buildTakeSeedanceExecutionPlan,
  buildSeedanceExecutionPlan,
  buildStillPrompt,
  findGraph,
  findNode,
  markGeneratedImageAssetFailed,
  reserveGeneratedImageAsset,
  persistStoryboardBindingsIfPresent,
  persistTakeBindingsIfPresent,
  persistShotBindingsIfPresent,
  resolveStoryboardSources,
  resolveStoryboardStillReferenceImageUrls,
  resolveTakeSources,
  resolveTakeStillReferenceImageUrls,
  resolveShotSources,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { buildFalWebhookUrl } from '../_shared/fal-webhooks.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

function readFalQueueUrl(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
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

function buildAffectedShotTargets(
  mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still',
  graph: NonNullable<ReturnType<typeof findGraph>>,
  targetNodeKey: string | null | undefined,
  shotId: string | null | undefined,
) {
  if (mode === 'graph_run' || mode === 'preview_take_still' || mode === 'preview_storyboard_still') {
    return []
  }

  if (!targetNodeKey) {
    throw new HttpError(400, 'A cinematic take node or cinematic shot node is required for preview runs.')
  }

  const node = findNode(graph, targetNodeKey)
  if (node?.type === 'cinematic_shot') {
    return [{
      nodeKey: targetNodeKey,
      shotId: getCinematicShotNodeConfig(node).id,
      shotNode: node,
    }]
  }

  if (!shotId) {
    throw new HttpError(400, 'A shot id is required when previewing a nested shot inside a take.')
  }

  if (!node || node.type !== 'cinematic_take') {
    throw new HttpError(404, `Cinematic take "${targetNodeKey}" was not found.`)
  }

  const virtualShotNode = buildVirtualShotNode(graph, shotId, targetNodeKey)
  if (!virtualShotNode) {
    throw new HttpError(404, `Cinematic shot "${shotId}" was not found in the sequence.`)
  }

  return [{
    nodeKey: targetNodeKey,
    shotId,
    shotNode: virtualShotNode,
  }]
}

function buildAffectedTakePreviewOrder(
  mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still',
  graph: NonNullable<ReturnType<typeof findGraph>>,
  targetNodeKey: string | null | undefined,
) {
  if (mode !== 'preview_take_still') return []
  if (!targetNodeKey) {
    throw new HttpError(400, 'A cinematic take node is required for take still preview runs.')
  }
  const node = findNode(graph, targetNodeKey)
  if (!node || node.type !== 'cinematic_take') {
    throw new HttpError(404, `Cinematic take "${targetNodeKey}" was not found.`)
  }
  return [targetNodeKey]
}

function buildAffectedStoryboardPreviewOrder(
  mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still',
  graph: NonNullable<ReturnType<typeof findGraph>>,
  targetNodeKey: string | null | undefined,
) {
  if (mode !== 'preview_storyboard_still') return []
  if (!targetNodeKey) {
    throw new HttpError(400, 'A storyboard ref or cinematic take node is required for storyboard preview runs.')
  }
  const node = findNode(graph, targetNodeKey)
  if (!node || (node.type !== 'storyboard_ref' && node.type !== 'cinematic_take')) {
    throw new HttpError(404, `Storyboard ref "${targetNodeKey}" was not found.`)
  }
  return [targetNodeKey]
}

function buildAffectedTakeOrder(
  graph: NonNullable<ReturnType<typeof findGraph>>,
  targetNodeKeys: string[] = [],
) {
  const sequence = getCinematicSequence(graph.metadata)
  const orderedTakeNodeKeys = sequence.takes
    .map((take) => graph.nodes.find((node) => node.type === 'cinematic_take' && typeof node.metadata?.takeId === 'string' && node.metadata.takeId === take.id)?.key ?? null)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (targetNodeKeys.length === 0) {
    return orderedTakeNodeKeys
  }

  const requestedKeys = new Set(targetNodeKeys)
  const filteredKeys = orderedTakeNodeKeys.filter((nodeKey) => requestedKeys.has(nodeKey))
  for (const nodeKey of targetNodeKeys) {
    const node = findNode(graph, nodeKey)
    if (!node || node.type !== 'cinematic_take') {
      throw new HttpError(404, `Cinematic take "${nodeKey}" was not found.`)
    }
    if (!filteredKeys.includes(nodeKey)) {
      filteredKeys.push(nodeKey)
    }
  }
  return filteredKeys
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
    throw new Error(runRow.error?.message ?? `Cinematic run "${runId}" was not found after creation.`)
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

    const { client, user } = await requireUserClient(request, 'start-cinematic-run')
    const payload = cinematicRunStartRequestSchema.parse(await request.json())
    const targetNodeKey = payload.targetNodeKey ?? payload.shotNodeKey ?? null
    const graph = findGraph(payload.snapshot, payload.graphKey)
    if (!graph) {
      throw new HttpError(404, `Cinematic graph "${payload.graphKey}" was not found.`)
    }

    const shotTargets = buildAffectedShotTargets(payload.mode, graph, targetNodeKey, payload.shotId ?? null)
    const takeNodeKeys = payload.mode === 'graph_run'
      ? buildAffectedTakeOrder(graph, payload.targetNodeKeys ?? [])
      : buildAffectedTakePreviewOrder(payload.mode, graph, targetNodeKey)
    const storyboardNodeKeys = buildAffectedStoryboardPreviewOrder(payload.mode, graph, targetNodeKey)
    if (payload.mode === 'graph_run' && takeNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no compiled cinematic takes to run.')
    }
    if ((payload.mode === 'preview_still' || payload.mode === 'preview_video') && shotTargets.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no reachable cinematic shots to run.')
    }
    if (payload.mode === 'preview_take_still' && takeNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no cinematic take node selected for still preview.')
    }
    if (payload.mode === 'preview_storyboard_still' && storyboardNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no storyboard ref node selected for still preview.')
    }

    const insertedRun = await client
      .from('cinematic_runs')
      .insert({
        draft_id: payload.snapshot.draft.id,
        project_id: payload.snapshot.project.id,
        graph_key: graph.key,
        graph_name: graph.name,
        mode: payload.mode,
        status: 'queued',
        shot_node_key: targetNodeKey,
        diagnostics: [],
        created_by: user.id,
      })
      .select('id, draft_id, project_id, graph_key, graph_name, mode, status, shot_node_key, diagnostics, created_at, updated_at')
      .single()

    if (insertedRun.error || !insertedRun.data) {
      throw new Error(insertedRun.error?.message ?? 'Failed to create cinematic run.')
    }

    const runId = insertedRun.data.id
    const jobsToInsert: Array<Record<string, unknown>> = []
    const reservedAssets: Array<Record<string, unknown>> = []
    let previousJobId: string | null = null
    let updatedGraph = graph

    for (const target of shotTargets) {
      const shotNode = target.shotNode
      const sourceInputs = resolveShotSources(payload.snapshot, graph, target.nodeKey, target.shotId)
      const stillPrompt = buildStillPrompt({
        snapshot: payload.snapshot,
        graph,
        shotNode,
        sourceInputs,
      })
      const executionPlan = buildSeedanceExecutionPlan({
        snapshot: payload.snapshot,
        graph,
        shotNode,
        sourceInputs,
      })

      let stillJobId: string | null = null
      let videoJobId: string | null = null
      const needsStillJob = payload.mode === 'preview_still'
      const reservedShotStillAsset = needsStillJob
        ? await reserveGeneratedImageAsset({
            client,
            projectId: payload.snapshot.project.id,
            userId: user.id,
            assetKey: getCinematicShotNodeConfig(shotNode).stillAssetKey,
            name: `${shotNode.title} Still`,
            metadata: {
              generatedBy: 'cinematic_still',
              graphKey: graph.key,
              shotNodeKey: target.nodeKey,
              shotId: target.shotId,
              runId,
            },
          })
        : null
      if (needsStillJob) {
        stillJobId = crypto.randomUUID()
        if (reservedShotStillAsset) {
          reservedAssets.push(reservedShotStillAsset)
        }
        jobsToInsert.push({
          id: stillJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: target.nodeKey,
          kind: 'shot_still',
          status: 'queued',
          still_asset_key: reservedShotStillAsset?.key ?? null,
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: stillPrompt,
          result_context: {
            mode: payload.mode,
            assetKey: reservedShotStillAsset?.key ?? null,
            shotId: target.shotId,
          },
        })
      }

      if (payload.mode !== 'preview_still') {
        videoJobId = crypto.randomUUID()
        jobsToInsert.push({
          id: videoJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: target.nodeKey,
          kind: 'shot_video',
          status: 'queued',
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: executionPlan.prompt,
          result_context: {
            mode: payload.mode,
            executionPlan,
            shotId: target.shotId,
          },
        })
      }

      previousJobId = videoJobId ?? stillJobId ?? previousJobId
      updatedGraph = applyShotBindingToGraph(updatedGraph, target.nodeKey, target.shotId, {
        ...(reservedShotStillAsset ? { bodyImageAssetKey: reservedShotStillAsset.key } : {}),
        metadata: {
          ...(reservedShotStillAsset ? { stillAssetKey: reservedShotStillAsset.key } : {}),
          lastRunId: runId,
          lastStillJobId: stillJobId,
          lastVideoJobId: videoJobId,
          executionPlan,
        },
      })
      await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, target.nodeKey, target.shotId, {
        ...(reservedShotStillAsset ? { bodyImageAssetKey: reservedShotStillAsset.key } : {}),
        metadata: {
          ...(reservedShotStillAsset ? { stillAssetKey: reservedShotStillAsset.key } : {}),
          lastRunId: runId,
          lastStillJobId: stillJobId,
          lastVideoJobId: videoJobId,
          executionPlan,
        },
      })
    }

    for (const takeNodeKey of takeNodeKeys) {
      const takeNode = findNode(graph, takeNodeKey)
      if (!takeNode) continue
      const sourceInputs = resolveTakeSources(payload.snapshot, graph, takeNodeKey)
      const takeConfig = getCinematicTakeNodeConfig(takeNode)
      const reservedTakeStillAsset = payload.mode === 'preview_take_still'
        ? await reserveGeneratedImageAsset({
            client,
            projectId: payload.snapshot.project.id,
            userId: user.id,
            assetKey: takeConfig.outputStillAssetKey,
            name: `${takeNode.title} Still`,
            metadata: {
              generatedBy: 'cinematic_take_still',
              graphKey: graph.key,
              takeNodeKey,
              runId,
            },
          })
        : null
      const takeStillJobId = payload.mode === 'preview_take_still' ? crypto.randomUUID() : null
      const executionPlan = payload.mode === 'preview_take_still'
        ? null
        : buildTakeSeedanceExecutionPlan({
            snapshot: payload.snapshot,
            graph,
            takeNode,
            sourceInputs,
          })
      const takeVideoJobId = payload.mode === 'graph_run' ? crypto.randomUUID() : null
      if (takeStillJobId) {
        if (reservedTakeStillAsset) {
          reservedAssets.push(reservedTakeStillAsset)
        }
        jobsToInsert.push({
          id: takeStillJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: takeNodeKey,
          kind: 'take_still',
          status: 'queued',
          still_asset_key: reservedTakeStillAsset?.key ?? null,
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: buildTakeStillPrompt({
            snapshot: payload.snapshot,
            graph,
            takeNode,
            sourceInputs,
          }),
          result_context: {
            mode: payload.mode,
            takeId: takeNode.metadata?.takeId ?? null,
            assetKey: reservedTakeStillAsset?.key ?? null,
          },
        })
      }
      if (takeVideoJobId && executionPlan) {
        jobsToInsert.push({
          id: takeVideoJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: takeNodeKey,
          kind: 'take_video',
          status: 'queued',
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: executionPlan.prompt,
          result_context: {
            mode: payload.mode,
            executionPlan,
            takeId: takeNode.metadata?.takeId ?? null,
          },
        })
      }
      previousJobId = takeVideoJobId ?? takeStillJobId ?? previousJobId
      updatedGraph = applyTakeBindingToGraph(updatedGraph, takeNodeKey, {
        ...(reservedTakeStillAsset
          ? { bodyImageAssetKey: reservedTakeStillAsset.key }
          : {}),
        metadata: {
          ...(reservedTakeStillAsset
            ? { outputStillAssetKey: reservedTakeStillAsset.key }
            : {}),
          lastRunId: runId,
          lastStillJobId: takeStillJobId,
          lastVideoJobId: takeVideoJobId,
          ...(executionPlan ? { executionPlan } : {}),
        },
      })
      await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, takeNodeKey, {
        ...(reservedTakeStillAsset
          ? { bodyImageAssetKey: reservedTakeStillAsset.key }
          : {}),
        metadata: {
          ...(reservedTakeStillAsset
            ? { outputStillAssetKey: reservedTakeStillAsset.key }
            : {}),
          lastRunId: runId,
          lastStillJobId: takeStillJobId,
          lastVideoJobId: takeVideoJobId,
          ...(executionPlan ? { executionPlan } : {}),
        },
      })
    }

    for (const storyboardNodeKey of storyboardNodeKeys) {
      const storyboardNode = findNode(graph, storyboardNodeKey)
      if (!storyboardNode) continue
      const isTakeStoryboard = storyboardNode.type === 'cinematic_take'
      const storyboardAssetKey = isTakeStoryboard
        ? getCinematicTakeNodeConfig(storyboardNode).storyboardAssetKey
        : getStoryboardRefNodeConfig(storyboardNode).assetKey
      const sourceInputs = isTakeStoryboard
        ? resolveTakeSources(payload.snapshot, graph, storyboardNodeKey)
        : resolveStoryboardSources(payload.snapshot, graph, storyboardNodeKey)
      const reservedStoryboardAsset = await reserveGeneratedImageAsset({
        client,
        projectId: payload.snapshot.project.id,
        userId: user.id,
        assetKey: storyboardAssetKey,
        name: `${storyboardNode.title} Storyboard`,
        metadata: {
          generatedBy: isTakeStoryboard ? 'cinematic_take_storyboard_still' : 'cinematic_storyboard_still',
          graphKey: graph.key,
          storyboardNodeKey,
          runId,
        },
      })
      const stillJobId = crypto.randomUUID()
      reservedAssets.push(reservedStoryboardAsset)
      const storyboardPrompt = isTakeStoryboard
        ? buildTakeStoryboardStillPrompt({
            snapshot: payload.snapshot,
            graph,
            takeNode: storyboardNode,
            sourceInputs: sourceInputs as ReturnType<typeof resolveTakeSources>,
          })
        : buildStoryboardStillPrompt({
            snapshot: payload.snapshot,
            graph,
            storyboardNode,
            sourceInputs: sourceInputs as ReturnType<typeof resolveStoryboardSources>,
          })

      console.info('[start-cinematic-run] compiled storyboard prompt.', {
        runId,
        graphKey: graph.key,
        storyboardNodeKey,
        isTakeStoryboard,
        prompt: storyboardPrompt,
      })

      jobsToInsert.push({
        id: stillJobId,
        run_id: runId,
        graph_key: graph.key,
        shot_node_key: storyboardNodeKey,
        kind: 'storyboard_still',
        status: 'queued',
        still_asset_key: reservedStoryboardAsset.key,
        order_index: jobsToInsert.length,
        depends_on_job_ids: previousJobId ? [previousJobId] : [],
        prompt: storyboardPrompt,
        result_context: {
          mode: payload.mode,
          storyboardKind: storyboardNode.type === 'storyboard_ref' ? storyboardNode.metadata?.storyboardKind ?? null : 'take_sequence_board',
          takeId: storyboardNode.type === 'cinematic_take' ? getCinematicTakeNodeConfig(storyboardNode).id : null,
          assetKey: reservedStoryboardAsset.key,
        },
      })
      previousJobId = stillJobId
      if (isTakeStoryboard) {
        updatedGraph = applyTakeBindingToGraph(updatedGraph, storyboardNodeKey, {
          metadata: {
            storyboardAssetKey: reservedStoryboardAsset.key,
            lastRunId: runId,
            lastStoryboardJobId: stillJobId,
          },
        })
        await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, storyboardNodeKey, {
          metadata: {
            storyboardAssetKey: reservedStoryboardAsset.key,
            lastRunId: runId,
            lastStoryboardJobId: stillJobId,
          },
        })
      } else {
        updatedGraph = applyStoryboardBindingToGraph(updatedGraph, storyboardNodeKey, {
          bodyImageAssetKey: reservedStoryboardAsset.key,
          metadata: {
            assetKey: reservedStoryboardAsset.key,
            lastRunId: runId,
            lastStillJobId: stillJobId,
          },
        })
        await persistStoryboardBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, storyboardNodeKey, {
          bodyImageAssetKey: reservedStoryboardAsset.key,
          metadata: {
            assetKey: reservedStoryboardAsset.key,
            lastRunId: runId,
            lastStillJobId: stillJobId,
          },
        })
      }
    }

    const insertedJobs = jobsToInsert.length === 0
      ? { data: [], error: null }
      : await client
          .from('cinematic_run_jobs')
          .insert(jobsToInsert)
          .select('id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, prompt, result_context, created_at, updated_at')

    if (insertedJobs.error) {
      throw new Error(insertedJobs.error.message)
    }

    const insertedJobRows = (insertedJobs.data ?? []).map((row) => toCinematicRunJob(row as Record<string, unknown>))

    if (payload.mode === 'preview_storyboard_still' && storyboardNodeKeys.length === 1 && insertedJobRows.length === 1) {
      const storyboardNodeKey = storyboardNodeKeys[0]
      const storyboardNode = findNode(updatedGraph, storyboardNodeKey)
      const storyboardJob = insertedJobRows[0]
      const cinematicSettings = getCinematicSettings(payload.snapshot.gameSpec ?? null, updatedGraph.metadata)
      const aspectRatio = cinematicSettings.stillAspectRatio || '16:9'

      if (!storyboardNode || storyboardJob.kind !== 'storyboard_still' || !storyboardJob.stillAssetKey) {
        throw new Error('Storyboard preview did not produce a valid reserved asset job.')
      }

      try {
        const referenceImageUrls = storyboardNode.type === 'cinematic_take'
          ? resolveTakeStillReferenceImageUrls(
              payload.snapshot,
              updatedGraph,
              storyboardNodeKey,
              resolveTakeSources(payload.snapshot, updatedGraph, storyboardNodeKey),
            )
          : resolveStoryboardStillReferenceImageUrls(
              payload.snapshot,
              updatedGraph,
              storyboardNodeKey,
              resolveStoryboardSources(payload.snapshot, updatedGraph, storyboardNodeKey),
            )
        const storyboardStillModel = resolveStoryboardStillFalModel(referenceImageUrls.length > 0)
        console.info('[start-cinematic-run] storyboard model selection.', {
          runId,
          jobId: storyboardJob.id,
          graphKey: graph.key,
          storyboardNodeKey,
          sourceImageCount: referenceImageUrls.length,
          referenceImageUrls,
          selectedModel: storyboardStillModel,
        })

        const falResponse = await client.functions.invoke('ai-fal', {
          body: {
            action: 'submit',
            model: storyboardStillModel,
            webhookUrl: buildFalWebhookUrl(),
            input: {
              prompt: storyboardJob.prompt,
              ...(referenceImageUrls.length > 0 ? { image_urls: referenceImageUrls } : {}),
              num_images: 1,
              aspect_ratio: aspectRatio,
              output_format: 'png',
              resolution: '1K',
            },
          },
        })

        if (falResponse.error || !falResponse.data) {
          throw new Error(falResponse.error?.message ?? 'Storyboard generation returned no Fal response.')
        }

        const falResult = (falResponse.data as {
          data?: unknown
          provider?: string | null
          model?: string | null
          requestId?: string | null
        }) ?? {}
        const falSubmitData = falResult.data && typeof falResult.data === 'object'
          ? falResult.data as Record<string, unknown>
          : {}
        const statusUrl =
          readFalQueueUrl(falSubmitData.status_url)
          ?? readFalQueueUrl(falSubmitData.statusUrl)
          ?? readFalQueueUrl((falSubmitData.urls && typeof falSubmitData.urls === 'object' ? (falSubmitData.urls as Record<string, unknown>).status : null))
        const responseUrl =
          readFalQueueUrl(falSubmitData.response_url)
          ?? readFalQueueUrl(falSubmitData.responseUrl)
          ?? readFalQueueUrl((falSubmitData.urls && typeof falSubmitData.urls === 'object' ? (falSubmitData.urls as Record<string, unknown>).response : null))
        console.info('[start-cinematic-run] storyboard submit payload.', {
          runId,
          jobId: storyboardJob.id,
          shotNodeKey: storyboardNodeKey,
          model: storyboardStillModel,
          requestId: falResult.requestId ?? null,
          rawData: falSubmitData,
          statusUrl,
          responseUrl,
        })
        const requestId = falResult.requestId ?? null
        if (!requestId) {
          throw new Error('Fal did not return a request id for the storyboard job.')
        }

        await client
          .from('cinematic_run_jobs')
          .update({
            status: 'running',
            provider: falResult.provider ?? 'fal',
            model: falResult.model ?? storyboardStillModel,
            provider_request_id: requestId,
            error_message: null,
            result_context: {
              ...(storyboardJob.resultContext ?? {}),
              assetKey: storyboardJob.stillAssetKey,
              imageUrls: referenceImageUrls,
              sourceImageCount: referenceImageUrls.length,
              submittedAt: new Date().toISOString(),
              statusUrl,
              responseUrl,
            },
          })
          .eq('id', storyboardJob.id)

        if (storyboardNode.type === 'cinematic_take') {
          updatedGraph = applyTakeBindingToGraph(updatedGraph, storyboardNodeKey, {
            metadata: {
              storyboardAssetKey: storyboardJob.stillAssetKey,
              lastRunId: runId,
              lastStoryboardJobId: storyboardJob.id,
              provider: falResult.provider ?? 'fal',
              providerModel: falResult.model ?? storyboardStillModel,
              providerRequestId: requestId,
            },
          })
          await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, storyboardNodeKey, {
            metadata: {
              storyboardAssetKey: storyboardJob.stillAssetKey,
              lastRunId: runId,
              lastStoryboardJobId: storyboardJob.id,
              provider: falResult.provider ?? 'fal',
              providerModel: falResult.model ?? storyboardStillModel,
              providerRequestId: requestId,
            },
          })
        } else {
          updatedGraph = applyStoryboardBindingToGraph(updatedGraph, storyboardNodeKey, {
            bodyImageAssetKey: storyboardJob.stillAssetKey,
            metadata: {
              assetKey: storyboardJob.stillAssetKey,
              lastRunId: runId,
              lastStillJobId: storyboardJob.id,
              provider: falResult.provider ?? 'fal',
              providerModel: falResult.model ?? storyboardStillModel,
              providerRequestId: requestId,
            },
          })
          await persistStoryboardBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, storyboardNodeKey, {
            bodyImageAssetKey: storyboardJob.stillAssetKey,
            metadata: {
              assetKey: storyboardJob.stillAssetKey,
              lastRunId: runId,
              lastStillJobId: storyboardJob.id,
              provider: falResult.provider ?? 'fal',
              providerModel: falResult.model ?? storyboardStillModel,
              providerRequestId: requestId,
            },
          })
        }

        await client
          .from('cinematic_runs')
          .update({
            status: 'running',
            diagnostics: [],
          })
          .eq('id', runId)
      } catch (storyboardError) {
        const errorMessage = storyboardError instanceof Error
          ? storyboardError.message
          : 'Storyboard generation failed.'

        const failedAsset = await markGeneratedImageAssetFailed({
          client,
          projectId: payload.snapshot.project.id,
          assetKey: storyboardJob.stillAssetKey,
          errorMessage,
          metadata: {
            generatedBy: storyboardNode.type === 'cinematic_take' ? 'cinematic_take_storyboard_still' : 'cinematic_storyboard_still',
            prompt: storyboardJob.prompt,
          },
        })

        await client
          .from('cinematic_run_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
          })
          .eq('id', storyboardJob.id)

        await client
          .from('cinematic_runs')
          .update({
            status: 'failed',
            diagnostics: [errorMessage],
          })
          .eq('id', runId)
      }

      const finalState = await loadRunState(client, runId)
      return json(cinematicRunStatusResponseSchema.parse({
        run: toCinematicRun(finalState),
        graphs: [updatedGraph],
        assets: reservedAssets,
      }))
    }

    const run = toCinematicRun({
      row: insertedRun.data,
      jobs: insertedJobRows,
    })

    return json(cinematicRunStatusResponseSchema.parse({
      run,
      graphs: [updatedGraph],
      assets: reservedAssets,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start cinematic run.')
  }
})
