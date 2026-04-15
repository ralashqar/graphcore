import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type CleanupRow = {
  id: string
  label: string
  status: string
}

async function updateCinematicRuns(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('cinematic_runs')
    .select('id, graph_key, status')
    .in('status', ['queued', 'running'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('cinematic_runs')
    .update({
      status: 'cancelled',
      diagnostics: ['Cancelled manually during debugging.'],
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.graph_key ?? ''),
    status: 'cancelled',
  }))
}

async function updateCinematicJobs(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('cinematic_run_jobs')
    .select('id, kind, status')
    .in('status', ['queued', 'running'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('cinematic_run_jobs')
    .update({
      status: 'cancelled',
      error_message: 'Cancelled manually during debugging.',
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.kind ?? ''),
    status: 'cancelled',
  }))
}

async function updateMeshJobs(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('mesh_generation_jobs')
    .select('id, definition_key, status')
    .in('status', ['queued', 'submitting', 'running'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('mesh_generation_jobs')
    .update({
      status: 'cancelled',
      provider_status: 'CANCELLED',
      error_message: 'Cancelled manually during debugging.',
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.definition_key ?? ''),
    status: 'cancelled',
  }))
}

async function updateWorldBuildBatches(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('world_build_batches')
    .select('id, planner_mode, status')
    .eq('status', 'running')

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('world_build_batches')
    .update({
      status: 'failed',
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.planner_mode ?? ''),
    status: 'failed',
  }))
}

async function updateWorldBuildJobs(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('world_build_jobs')
    .select('id, kind, status')
    .in('status', ['queued', 'running'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('world_build_jobs')
    .update({
      status: 'failed',
      error_message: 'Stopped manually during debugging.',
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.kind ?? ''),
    status: 'failed',
  }))
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const admin = createAdminClient('cleanup-active-generation')
    const [cinematicRuns, cinematicJobs, meshJobs, worldBuildBatches, worldBuildJobs] = await Promise.all([
      updateCinematicRuns(admin),
      updateCinematicJobs(admin),
      updateMeshJobs(admin),
      updateWorldBuildBatches(admin),
      updateWorldBuildJobs(admin),
    ])

    return json({
      ok: true,
      results: {
        cinematicRuns,
        cinematicJobs,
        meshJobs,
        worldBuildBatches,
        worldBuildJobs,
      },
    })
  } catch (error) {
    return errorResponse(error, 'Failed to clean up active generation rows.')
  }
})
