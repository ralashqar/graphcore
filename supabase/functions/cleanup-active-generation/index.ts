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
    .in('status', ['planned', 'running'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const updateResponse = await admin
    .from('world_build_batches')
    .update({
      status: 'cancelled',
      diagnostics: ['Cancelled manually during debugging cleanup.'],
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return rows.map((row) => ({
    id: row.id,
    label: String(row.planner_mode ?? ''),
    status: 'cancelled',
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

async function updateWorldPromptTurns(admin: ReturnType<typeof createAdminClient>) {
  const activeRows = await admin
    .from('world_prompt_turns')
    .select('id, session_id, prompt, status, approval_state, metadata')
    .in('status', ['queued', 'streaming', 'awaiting_approval'])

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) {
    return {
      turns: [] as CleanupRow[],
      sessionIds: [] as string[],
    }
  }

  const now = new Date().toISOString()
  const updateResponse = await admin
    .from('world_prompt_turns')
    .update({
      status: 'cancelled',
      approval_state: 'resolved',
      error_message: 'Cancelled manually during debugging cleanup.',
      metadata: {
        cleanup: {
          cancelledAt: now,
          reason: 'manual_debug_cleanup',
        },
      },
    })
    .in('id', rows.map((row) => row.id))

  if (updateResponse.error) throw new Error(updateResponse.error.message)
  return {
    turns: rows.map((row) => ({
      id: row.id,
      label: String(row.prompt ?? '').slice(0, 72) || row.session_id,
      status: 'cancelled',
    })),
    sessionIds: [...new Set(rows.map((row) => String(row.session_id)))],
  }
}

async function updateWorldPromptSuggestions(admin: ReturnType<typeof createAdminClient>, sessionIds: string[]) {
  if (sessionIds.length === 0) return [] as CleanupRow[]

  const activeRows = await admin
    .from('world_prompt_suggestions')
    .select('id, label, state, metadata, session_id')
    .in('session_id', sessionIds)
    .eq('state', 'active')

  if (activeRows.error) throw new Error(activeRows.error.message)
  const rows = activeRows.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const now = new Date().toISOString()
  await Promise.all(rows.map(async (row) => {
    const response = await admin
      .from('world_prompt_suggestions')
      .update({
        state: 'superseded',
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          cleanup: {
            supersededAt: now,
            reason: 'manual_debug_cleanup',
          },
        },
      })
      .eq('id', row.id)
    if (response.error) throw new Error(response.error.message)
  }))

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label ?? ''),
    status: 'superseded',
  }))
}

async function updateWorldPromptSessions(admin: ReturnType<typeof createAdminClient>, sessionIds: string[]) {
  if (sessionIds.length === 0) return [] as CleanupRow[]

  const rowsResponse = await admin
    .from('world_prompt_sessions')
    .select('id, title, status, metadata')
    .in('id', sessionIds)

  if (rowsResponse.error) throw new Error(rowsResponse.error.message)
  const rows = rowsResponse.data ?? []
  if (rows.length === 0) return [] as CleanupRow[]

  const now = new Date().toISOString()
  await Promise.all(rows.map(async (row) => {
    const response = await admin
      .from('world_prompt_sessions')
      .update({
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          hasUnreadUpdates: false,
          lastSuggestionRefreshAt: now,
          cleanup: {
            updatedAt: now,
            reason: 'manual_debug_cleanup',
          },
        },
      })
      .eq('id', row.id)
    if (response.error) throw new Error(response.error.message)
  }))

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.title ?? ''),
    status: String(row.status ?? 'active'),
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
    const [
      cinematicRuns,
      cinematicJobs,
      meshJobs,
      worldBuildBatches,
      worldBuildJobs,
      worldPromptCleanup,
    ] = await Promise.all([
      updateCinematicRuns(admin),
      updateCinematicJobs(admin),
      updateMeshJobs(admin),
      updateWorldBuildBatches(admin),
      updateWorldBuildJobs(admin),
      updateWorldPromptTurns(admin),
    ])
    const [worldPromptSuggestions, worldPromptSessions] = await Promise.all([
      updateWorldPromptSuggestions(admin, worldPromptCleanup.sessionIds),
      updateWorldPromptSessions(admin, worldPromptCleanup.sessionIds),
    ])

    return json({
      ok: true,
      results: {
        cinematicRuns,
        cinematicJobs,
        meshJobs,
        worldBuildBatches,
        worldBuildJobs,
        worldPromptTurns: worldPromptCleanup.turns,
        worldPromptSuggestions,
        worldPromptSessions,
      },
    })
  } catch (error) {
    return errorResponse(error, 'Failed to clean up active generation rows.')
  }
})
