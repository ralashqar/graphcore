import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from '../_shared/output-workflow.ts'
import {
  sequenceAnimaticSceneBoardPrepRequestSchema,
  sequenceAnimaticSceneBoardPrepRunSchema,
  sequenceAnimaticSceneBoardPrepResponseSchema,
  sequenceAnimaticSceneBoardPrepRunsSchema,
} from '../../../src/domain/outputWorkflow.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function readNumber(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback
}

function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function stablePrepRunKey(input: {
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  scopeNodeId?: string | null
  shotIds: readonly string[]
}) {
  const scope = readText(input.scopeNodeId) || readText(input.zoneId) || readText(input.setId) || 'scene'
  const shots = uniqueTexts(input.shotIds).sort().join(',')
  return `${input.masterRequestId}:${input.sceneId}:${scope}:${shots}`
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'prepare-sequence-animatic-scene-board')
    const admin = createAdminClient('prepare-sequence-animatic-scene-board')
    const payload = sequenceAnimaticSceneBoardPrepRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')

    const masterRequest = mapOutputRequestRow(masterResponse.data)
    const metadata = asRecord(masterRequest.metadata)
    if (readScreenplayAnimaticRole(metadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')

    const now = new Date().toISOString()
    const currentRuns = sequenceAnimaticSceneBoardPrepRunsSchema.parse(asRecord(
      metadata.sequenceAnimaticSceneBoardPrepRuns ?? metadata.sequence_animatic_scene_board_prep_runs,
    ))
    const runKey = readText(payload.runKey) || stablePrepRunKey({
      masterRequestId: payload.masterRequestId,
      sceneId: payload.sceneId,
      setId: payload.setId,
      zoneId: payload.zoneId,
      scopeNodeId: payload.scopeNodeId,
      shotIds: payload.shotIds,
    })
    const activeForScope = Object.values(currentRuns)
      .filter((run) => run.runKey === runKey && run.status !== 'complete' && run.status !== 'failed' && run.status !== 'cancelled')
      .sort((left, right) => String(right.updatedAt || right.startedAt).localeCompare(String(left.updatedAt || left.startedAt)))[0] ?? null
    const runId = readText(payload.runId) || activeForScope?.runId || crypto.randomUUID()
    const previous = currentRuns[runId] ?? activeForScope ?? null
    const status = payload.status
      ?? (payload.action === 'complete' ? 'complete'
        : payload.action === 'fail' ? 'failed'
          : payload.action === 'cancel' ? 'cancelled'
            : 'running')
    const stage = payload.stage
      ?? (payload.action === 'complete' ? 'complete'
        : payload.action === 'fail' ? 'failed'
          : payload.action === 'cancel' ? 'cancelled'
            : previous?.stage ?? 'idle')

    const prepRun = sequenceAnimaticSceneBoardPrepRunSchema.parse({
      ...asRecord(previous),
      runId,
      runKey,
      sceneId: payload.sceneId,
      setId: payload.setId ?? previous?.setId ?? null,
      zoneId: payload.zoneId ?? previous?.zoneId ?? null,
      scopeNodeId: payload.scopeNodeId ?? previous?.scopeNodeId ?? null,
      shotIds: payload.shotIds.length > 0 ? uniqueTexts(payload.shotIds) : previous?.shotIds ?? [],
      stage,
      status,
      activeUnitId: payload.activeUnitId ?? previous?.activeUnitId ?? null,
      activeUnitLabel: payload.activeUnitLabel ?? previous?.activeUnitLabel ?? '',
      stageLabel: payload.stageLabel ?? previous?.stageLabel ?? 'Preparing selected board',
      message: payload.message ?? previous?.message ?? '',
      queued: readNumber(payload.queued, previous?.queued ?? 0),
      running: readNumber(payload.running, previous?.running ?? 0),
      ready: readNumber(payload.ready, previous?.ready ?? 0),
      failed: readNumber(payload.failed, previous?.failed ?? 0),
      activeRequestIds: payload.activeRequestIds ? uniqueTexts(payload.activeRequestIds) : previous?.activeRequestIds ?? [],
      activeRunIds: payload.activeRunIds ? uniqueTexts(payload.activeRunIds) : previous?.activeRunIds ?? [],
      activeReferenceNodeIds: payload.activeReferenceNodeIds ? uniqueTexts(payload.activeReferenceNodeIds) : previous?.activeReferenceNodeIds ?? [],
      activeCoverageShotIds: payload.activeCoverageShotIds ? uniqueTexts(payload.activeCoverageShotIds) : previous?.activeCoverageShotIds ?? [],
      activeRunStepKey: payload.activeRunStepKey ?? previous?.activeRunStepKey ?? '',
      startedAt: previous?.startedAt || now,
      updatedAt: now,
      error: payload.error ?? (status === 'failed' ? previous?.error ?? 'Selected board prep failed.' : ''),
      updatedBy: user.id,
    })

    const nextRuns = sequenceAnimaticSceneBoardPrepRunsSchema.parse({
      ...currentRuns,
      [prepRun.runId]: prepRun,
    })
    const nextMetadata = {
      ...metadata,
      sequenceAnimaticSceneBoardPrepRuns: nextRuns,
      sequence_animatic_scene_board_prep_runs: nextRuns,
      sequenceAnimaticSceneBoardPrepRunsUpdatedAt: now,
    }

    const updateResponse = await admin
      .from('output_requests')
      .update({ metadata: nextMetadata })
      .eq('id', masterRequest.id)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .select(outputRequestSelect)
      .single()
    if (updateResponse.error || !updateResponse.data) throw new Error(updateResponse.error?.message ?? 'Failed to persist scene board prep state.')

    return json(sequenceAnimaticSceneBoardPrepResponseSchema.parse({
      ok: true,
      masterRequest: mapOutputRequestRow(updateResponse.data),
      prepRun,
      prepRuns: nextRuns,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to prepare sequence animatic scene board.')
  }
})
