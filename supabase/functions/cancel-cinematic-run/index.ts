import '@supabase/functions-js/edge-runtime.d.ts'

import {
  cinematicRunCancelRequestSchema,
  cinematicRunStatusResponseSchema,
} from '../../../src/domain/cinematics.ts'
import { requireUserClient } from '../_shared/auth.ts'
import {
  findGraph,
  isTerminalCinematicRunStatus,
  markGeneratedImageAssetFailed,
  toCinematicRun,
  toCinematicRunJob,
} from '../_shared/cinematics.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'cancel-cinematic-run')
    const payload = cinematicRunCancelRequestSchema.parse(await request.json())
    const initialState = await loadRunState(client, payload.runId)

    if (!isTerminalCinematicRunStatus(String(initialState.row.status ?? ''))) {
      for (const job of initialState.jobs) {
        if (job.status !== 'queued' && job.status !== 'running') continue

        if (job.providerRequestId) {
          const cancelResponse = await client.functions.invoke('ai-fal', {
            body: {
              action: 'cancel',
              model: job.model,
              requestId: job.providerRequestId,
            },
          })

          if (cancelResponse.error) {
            console.error('[cancel-cinematic-run] provider cancel failed.', {
              runId: payload.runId,
              jobId: job.id,
              requestId: job.providerRequestId,
              message: cancelResponse.error.message,
            })
          }
        }

        await client
          .from('cinematic_run_jobs')
          .update({
            status: 'cancelled',
            error_message: 'Cinematic generation was cancelled by the user.',
          })
          .eq('id', job.id)

        if (job.stillAssetKey) {
          await markGeneratedImageAssetFailed({
            client,
            projectId: payload.snapshot.project.id,
            assetKey: job.stillAssetKey,
            errorMessage: 'Cinematic generation was cancelled by the user.',
            metadata: {
              cancelledAt: new Date().toISOString(),
            },
          })
        }
      }

      const diagnostics = Array.isArray(initialState.row.diagnostics)
        ? initialState.row.diagnostics.filter((entry): entry is string => typeof entry === 'string')
        : []
      diagnostics.push('Cancelled by user.')

      await client
        .from('cinematic_runs')
        .update({
          status: 'cancelled',
          diagnostics,
        })
        .eq('id', payload.runId)
    }

    const finalState = await loadRunState(client, payload.runId)
    const graphKey = String(finalState.row.graph_key ?? '')
    const graph = findGraph(payload.snapshot, graphKey)
    const assets = await loadPersistedRunAssets(client, payload.snapshot.project.id, finalState.jobs)

    return json(cinematicRunStatusResponseSchema.parse({
      run: toCinematicRun(finalState),
      graphs: graph ? [graph] : [],
      assets,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to cancel cinematic run.')
  }
})
