import '@supabase/functions-js/edge-runtime.d.ts'

import {
  cinematicRunStartRequestSchema,
  cinematicRunStatusResponseSchema,
  getCinematicSequence,
} from '../../../src/domain/cinematics.ts'
import { requireUserClient } from '../_shared/auth.ts'
import {
  buildStoryboardStillPrompt,
  applyTakeBindingToGraph,
  applyStoryboardBindingToGraph,
  applyShotBindingToGraph,
  buildTakeStillPrompt,
  buildTakeSeedanceExecutionPlan,
  buildSeedanceExecutionPlan,
  buildStillPrompt,
  findGraph,
  findNode,
  persistStoryboardBindingsIfPresent,
  persistTakeBindingsIfPresent,
  persistShotBindingsIfPresent,
  resolveStoryboardSources,
  resolveTakeSources,
  resolveShotSources,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

function buildAffectedShotOrder(
  mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still',
  graph: NonNullable<ReturnType<typeof findGraph>>,
  targetNodeKey: string | null | undefined,
) {
  if (mode === 'graph_run' || mode === 'preview_take_still' || mode === 'preview_storyboard_still') {
    return []
  }

  if (!targetNodeKey) {
    throw new HttpError(400, 'A cinematic shot node is required for preview runs.')
  }

  const node = findNode(graph, targetNodeKey)
  if (!node || node.type !== 'cinematic_shot') {
    throw new HttpError(404, `Cinematic shot "${targetNodeKey}" was not found.`)
  }

  return [targetNodeKey]
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
    throw new HttpError(400, 'A storyboard ref node is required for storyboard preview runs.')
  }
  const node = findNode(graph, targetNodeKey)
  if (!node || node.type !== 'storyboard_ref') {
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

    const shotNodeKeys = buildAffectedShotOrder(payload.mode, graph, targetNodeKey)
    const takeNodeKeys = payload.mode === 'graph_run'
      ? buildAffectedTakeOrder(graph, payload.targetNodeKeys ?? [])
      : buildAffectedTakePreviewOrder(payload.mode, graph, targetNodeKey)
    const storyboardNodeKeys = buildAffectedStoryboardPreviewOrder(payload.mode, graph, targetNodeKey)
    if (payload.mode === 'graph_run' && takeNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no compiled cinematic takes to run.')
    }
    if ((payload.mode === 'preview_still' || payload.mode === 'preview_video') && shotNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no reachable cinematic shot nodes to run.')
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
    let previousJobId: string | null = null
    let updatedGraph = graph

    for (const shotNodeKey of shotNodeKeys) {
      const shotNode = findNode(graph, shotNodeKey)
      if (!shotNode) continue
      const sourceInputs = resolveShotSources(payload.snapshot, graph, shotNodeKey)
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
      if (needsStillJob) {
        stillJobId = crypto.randomUUID()
        jobsToInsert.push({
          id: stillJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: shotNodeKey,
          kind: 'shot_still',
          status: 'queued',
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: stillPrompt,
          result_context: {
            mode: payload.mode,
          },
        })
      }

      if (payload.mode !== 'preview_still') {
        videoJobId = crypto.randomUUID()
        jobsToInsert.push({
          id: videoJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: shotNodeKey,
          kind: 'shot_video',
          status: 'queued',
          order_index: jobsToInsert.length,
          depends_on_job_ids: previousJobId ? [previousJobId] : [],
          prompt: executionPlan.prompt,
          result_context: {
            mode: payload.mode,
            executionPlan,
          },
        })
      }

      previousJobId = videoJobId ?? stillJobId ?? previousJobId
      updatedGraph = applyShotBindingToGraph(updatedGraph, shotNodeKey, {
        metadata: {
          lastRunId: runId,
          lastStillJobId: stillJobId,
          lastVideoJobId: videoJobId,
          executionPlan,
        },
      })
      await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, shotNodeKey, {
        metadata: {
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
        jobsToInsert.push({
          id: takeStillJobId,
          run_id: runId,
          graph_key: graph.key,
          shot_node_key: takeNodeKey,
          kind: 'take_still',
          status: 'queued',
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
        metadata: {
          lastRunId: runId,
          lastStillJobId: takeStillJobId,
          lastVideoJobId: takeVideoJobId,
          ...(executionPlan ? { executionPlan } : {}),
        },
      })
      await persistTakeBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, takeNodeKey, {
        metadata: {
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
      const sourceInputs = resolveStoryboardSources(payload.snapshot, graph, storyboardNodeKey)
      const stillJobId = crypto.randomUUID()
      jobsToInsert.push({
        id: stillJobId,
        run_id: runId,
        graph_key: graph.key,
        shot_node_key: storyboardNodeKey,
        kind: 'storyboard_still',
        status: 'queued',
        order_index: jobsToInsert.length,
        depends_on_job_ids: previousJobId ? [previousJobId] : [],
        prompt: buildStoryboardStillPrompt({
          snapshot: payload.snapshot,
          graph,
          storyboardNode,
          sourceInputs,
        }),
        result_context: {
          mode: payload.mode,
          storyboardKind: storyboardNode.metadata?.storyboardKind ?? null,
        },
      })
      previousJobId = stillJobId
      updatedGraph = applyStoryboardBindingToGraph(updatedGraph, storyboardNodeKey, {
        metadata: {
          lastRunId: runId,
          lastStillJobId: stillJobId,
        },
      })
      await persistStoryboardBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, storyboardNodeKey, {
        metadata: {
          lastRunId: runId,
          lastStillJobId: stillJobId,
        },
      })
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

    const run = toCinematicRun({
      row: insertedRun.data,
      jobs: (insertedJobs.data ?? []).map((row) => toCinematicRunJob(row as Record<string, unknown>)),
    })

    return json(cinematicRunStatusResponseSchema.parse({
      run,
      graphs: [updatedGraph],
      assets: [],
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start cinematic run.')
  }
})
