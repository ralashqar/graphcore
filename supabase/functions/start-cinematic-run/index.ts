import '@supabase/functions-js/edge-runtime.d.ts'

import {
  cinematicRunStartRequestSchema,
  cinematicRunStatusResponseSchema,
  getCinematicShotNodeConfig,
} from '../../../src/domain/cinematics.ts'
import { requireUserClient } from '../_shared/auth.ts'
import {
  applyShotBindingToGraph,
  buildStillPrompt,
  buildVideoPrompt,
  collectReachableShotNodeKeys,
  findGraph,
  findNode,
  persistShotBindingsIfPresent,
  resolveShotSources,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

function buildAffectedShotOrder(
  mode: 'graph_run' | 'preview_still' | 'preview_video',
  graph: NonNullable<ReturnType<typeof findGraph>>,
  shotNodeKey: string | null | undefined,
) {
  if (mode === 'graph_run') {
    return collectReachableShotNodeKeys(graph)
  }

  if (!shotNodeKey) {
    throw new HttpError(400, 'A cinematic shot node is required for preview runs.')
  }

  const node = findNode(graph, shotNodeKey)
  if (!node || node.type !== 'cinematic_shot') {
    throw new HttpError(404, `Cinematic shot "${shotNodeKey}" was not found.`)
  }

  return [shotNodeKey]
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-cinematic-run')
    const payload = cinematicRunStartRequestSchema.parse(await request.json())
    const graph = findGraph(payload.snapshot, payload.graphKey)
    if (!graph) {
      throw new HttpError(404, `Cinematic graph "${payload.graphKey}" was not found.`)
    }

    const shotNodeKeys = buildAffectedShotOrder(payload.mode, graph, payload.shotNodeKey ?? null)
    if (shotNodeKeys.length === 0) {
      throw new HttpError(400, 'This cinematic graph has no reachable cinematic shot nodes to run.')
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
        shot_node_key: payload.shotNodeKey ?? null,
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
      const shotConfig = getCinematicShotNodeConfig(shotNode)
      const sourceInputs = resolveShotSources(payload.snapshot, graph, shotNodeKey)
      const stillPrompt = buildStillPrompt({
        snapshot: payload.snapshot,
        graph,
        shotNode,
        sourceInputs,
      })
      const videoPrompt = buildVideoPrompt({
        snapshot: payload.snapshot,
        graph,
        shotNode,
        sourceInputs,
      })

      let stillJobId: string | null = null
      let videoJobId: string | null = null
      const needsStillJob = payload.mode !== 'preview_video' || !shotConfig.stillAssetKey
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
          depends_on_job_ids: stillJobId ? [stillJobId] : previousJobId ? [previousJobId] : [],
          prompt: videoPrompt,
          result_context: {
            mode: payload.mode,
          },
        })
      }

      previousJobId = videoJobId ?? stillJobId ?? previousJobId
      updatedGraph = applyShotBindingToGraph(updatedGraph, shotNodeKey, {
        metadata: {
          lastRunId: runId,
          lastStillJobId: stillJobId,
          lastVideoJobId: videoJobId,
        },
      })
      await persistShotBindingsIfPresent(client, payload.snapshot.draft.id, graph.key, shotNodeKey, {
        metadata: {
          lastRunId: runId,
          lastStillJobId: stillJobId,
          lastVideoJobId: videoJobId,
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
