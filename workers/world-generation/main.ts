import { createAdminClient } from '../../supabase/functions/_shared/auth.ts'
import { processFlyAppGenerationJobs } from '../../supabase/functions/_shared/app-generation-worker.ts'
import { processFlyOutputWorkflowRuns } from '../../supabase/functions/_shared/output-workflow.ts'
import { processFlyVisualGenerationJobs } from '../../supabase/functions/_shared/visual-generation-worker.ts'
import {
  normalizeWorkerWakeFamilies,
  setLocalWorkerWakeSink,
  verifyWorkerWakeSignature,
  type WorkerWakeFamily,
} from '../../supabase/functions/_shared/worker-wake.ts'
import { processFlyWorldGenerationJobs } from '../../supabase/functions/_shared/world-prompt.ts'
import { renderOutputPdf } from './ebook-pdf-renderer.ts'
import { createWorkerWakeScheduler, idleDelayForEmptyPolls } from './wake-scheduler.ts'

const workerCodeVersion = '2026-06-16-scene-board-spatial-map-atlas'
const workerId = Deno.env.get('FLY_MACHINE_ID')
  ?? Deno.env.get('GRAPHCORE_WORKER_ID')
  ?? crypto.randomUUID()
const workerBuildVersion = Deno.env.get('GRAPHCORE_WORKER_BUILD_VERSION')
  ?? Deno.env.get('FLY_IMAGE_REF')
  ?? Deno.env.get('FLY_MACHINE_VERSION')
  ?? workerCodeVersion
const workerSecret = Deno.env.get('GRAPHCORE_WORKER_SECRET') ?? null
const workerWakeSecret = Deno.env.get('GRAPHCORE_WORKER_WAKE_SECRET') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const pollIntervalMs = Math.max(5_000, Number(Deno.env.get('GRAPHCORE_WORKER_POLL_INTERVAL_MS') ?? 10_000))
const activePollIntervalMs = Math.max(1_000, Number(Deno.env.get('GRAPHCORE_WORKER_ACTIVE_POLL_INTERVAL_MS') ?? 5_000))
const idlePollIntervalMs = Math.max(activePollIntervalMs, Number(Deno.env.get('GRAPHCORE_WORKER_IDLE_POLL_INTERVAL_MS') ?? 60_000))
const wakePort = Math.max(1, Number(Deno.env.get('PORT') ?? 8080))
const idleLogIntervalMs = Math.max(30_000, Number(Deno.env.get('GRAPHCORE_WORKER_IDLE_LOG_INTERVAL_MS') ?? 120_000))
const visualWorkerConcurrency = readPositiveInt(
  Deno.env.get('VISUAL_GENERATION_WORKER_CONCURRENCY') ?? Deno.env.get('VISUAL_GENERATION_OPENAI_CONCURRENCY'),
  8,
)
const outputWorkflowWorkerConcurrency = readPositiveInt(
  Deno.env.get('OUTPUT_WORKFLOW_WORKER_CONCURRENCY'),
  3,
)
const dbCircuitBackoffMs = [10_000, 30_000, 120_000, 300_000, 900_000]
const dbCircuitProbeLogIntervalMs = Math.max(
  30_000,
  Number(Deno.env.get('GRAPHCORE_WORKER_DB_CIRCUIT_LOG_INTERVAL_MS') ?? 60_000),
)

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the GraphCore world generation worker.')
}

const client = createAdminClient('fly-world-generation-worker')
const authHeader = `Bearer ${serviceRoleKey}`
let shuttingDown = false
let lastIdleLogAt = 0
let dbCircuitFailureCount = 0
let dbCircuitOpenUntil = 0
let dbCircuitLastLogAt = 0
let dbCircuitLastReason = ''
const wakeScheduler = createWorkerWakeScheduler()
const wakePollJitterRatio = 0.15

setLocalWorkerWakeSink((families, payload) => {
  const releasedWaiters = wakeScheduler.signal(families)
  if (releasedWaiters > 0) {
    console.log('[world-generation-worker] local wake received', {
      workerId,
      families,
      source: payload.source ?? null,
      releasedWaiters,
    })
  }
})

function readPositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.floor(parsed))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function workerIdleDelay(emptyPolls: number) {
  return idleDelayForEmptyPolls({
    emptyPolls,
    activePollIntervalMs,
    idlePollIntervalMs,
    jitterRatio: wakePollJitterRatio,
  })
}

function requestShutdown(signal: string) {
  console.log(`[world-generation-worker] received ${signal}; stopping after the current job.`)
  const firstSignal = !shuttingDown
  shuttingDown = true
  // Hand claimed output workflow runs back to the queue immediately so the
  // replacement machine resumes them in seconds instead of waiting for the
  // stale-heartbeat reclaim. In-flight executors notice the lost lease via
  // their run-status checks and stop without writing further state.
  if (firstSignal) void releaseClaimedOutputWorkflowRunsForShutdown(signal)
  for (const family of ['visual', 'output_workflow', 'generation', 'app_generation'] as WorkerWakeFamily[]) {
    wakeScheduler.signal([family])
  }
}

async function releaseClaimedOutputWorkflowRunsForShutdown(signal: string) {
  try {
    const { data, error } = await client
      .from('output_workflow_runs')
      .update({ status: 'queued', worker_id: null, heartbeat_at: null })
      .eq('status', 'running')
      .like('worker_id', `${workerId}%`)
      .select('id')
    if (error) throw new Error(error.message)
    const released = (data ?? []).length
    if (released > 0) {
      console.warn('[world-generation-worker] released claimed output workflow runs for shutdown.', {
        workerId,
        signal,
        releasedRunIds: (data ?? []).map((row) => (row as { id: string }).id),
      })
    }
  } catch (error) {
    console.warn('[world-generation-worker] failed to release claimed runs during shutdown.', {
      workerId,
      signal,
      error: describeWorkerError(error),
    })
  }
}

function describeWorkerError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isTransientDatabaseError(error: unknown) {
  const message = describeWorkerError(error).toLowerCase()
  return [
    'pgrst002',
    'schema cache',
    '503',
    '521',
    '522',
    '544',
    'connection terminated',
    'connection timeout',
    'statement timeout',
    'canceling statement due to statement timeout',
    'failed to create login role',
    'could not query the database',
    'fetch failed',
  ].some((pattern) => message.includes(pattern))
}

async function probeDatabaseHealth() {
  const response = await client
    .from('project_drafts')
    .select('id')
    .limit(1)
  if (response.error) throw new Error(response.error.message)
}

function openDatabaseCircuit(error: unknown, loopName: string) {
  const reason = describeWorkerError(error)
  const backoffMs = dbCircuitBackoffMs[Math.min(dbCircuitFailureCount, dbCircuitBackoffMs.length - 1)]
  dbCircuitFailureCount += 1
  dbCircuitOpenUntil = Date.now() + backoffMs + Math.floor(Math.random() * Math.min(5_000, backoffMs / 4))
  dbCircuitLastReason = reason
  const now = Date.now()
  if (now - dbCircuitLastLogAt >= dbCircuitProbeLogIntervalMs) {
    dbCircuitLastLogAt = now
    console.warn('[world-generation-worker] Supabase database circuit opened; pausing all worker loops.', {
      workerId,
      loopName,
      retryInMs: Math.max(0, dbCircuitOpenUntil - now),
      failureCount: dbCircuitFailureCount,
      reason,
    })
  }
}

async function waitForDatabaseCircuit(loopName: string) {
  while (!shuttingDown) {
    const now = Date.now()
    if (now < dbCircuitOpenUntil) {
      await sleep(Math.min(dbCircuitOpenUntil - now, 10_000))
      continue
    }
    if (dbCircuitFailureCount === 0) return

    try {
      await probeDatabaseHealth()
      console.info('[world-generation-worker] Supabase database circuit recovered; resuming worker loops.', {
        workerId,
        loopName,
        previousFailureCount: dbCircuitFailureCount,
      })
      dbCircuitFailureCount = 0
      dbCircuitOpenUntil = 0
      dbCircuitLastReason = ''
      return
    } catch (error) {
      openDatabaseCircuit(error, `${loopName}:health_probe`)
    }
  }
}

async function handleWorkerLoopError(loopName: string, error: unknown) {
  if (isTransientDatabaseError(error)) {
    openDatabaseCircuit(error, loopName)
    await waitForDatabaseCircuit(loopName)
    return
  }
  console.error(`[world-generation-worker] ${loopName} loop error`, error)
  await sleep(Math.max(5_000, pollIntervalMs))
}

Deno.addSignalListener('SIGTERM', () => requestShutdown('SIGTERM'))
Deno.addSignalListener('SIGINT', () => requestShutdown('SIGINT'))

console.log('[world-generation-worker] started', {
  workerId,
  workerCodeVersion,
  workerBuildVersion,
  pollIntervalMs,
  activePollIntervalMs,
  idlePollIntervalMs,
  visualWorkerConcurrency,
  outputWorkflowWorkerConcurrency,
  runtime: 'fly',
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleWakeRequest(request: Request) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return jsonResponse({
      ok: true,
      workerId,
      workerCodeVersion,
      wakeEnabled: Boolean(workerWakeSecret),
      shuttingDown,
      dbCircuitOpenUntil,
    })
  }
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  const url = new URL(request.url)
  if (url.pathname !== '/internal/wake') return jsonResponse({ ok: false, error: 'Not found.' }, 404)
  if (!workerWakeSecret) return jsonResponse({ ok: false, error: 'Worker wake secret is not configured.' }, 503)

  const rawBody = await request.text()
  const verification = await verifyWorkerWakeSignature({
    secret: workerWakeSecret,
    timestamp: request.headers.get('X-GraphCore-Wake-Timestamp'),
    signature: request.headers.get('X-GraphCore-Wake-Signature'),
    body: rawBody,
  })
  if (!verification.ok) return jsonResponse({ ok: false, error: verification.reason }, 401)

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
  }
  const acceptedFamilies = normalizeWorkerWakeFamilies(
    Array.isArray(payload.families) ? payload.families : payload.family,
  )
  if (acceptedFamilies.length === 0) return jsonResponse({ ok: false, error: 'No supported worker wake family was provided.' }, 400)

  const releasedWaiters = wakeScheduler.signal(acceptedFamilies)
  console.info('[world-generation-worker] wake received.', {
    workerId,
    acceptedFamilies,
    source: typeof payload.source === 'string' ? payload.source : null,
    jobId: typeof payload.jobId === 'string' ? payload.jobId : null,
    runId: typeof payload.runId === 'string' ? payload.runId : null,
    releasedWaiters,
  })
  return jsonResponse({ ok: true, acceptedFamilies, workerId, releasedWaiters })
}

const wakeServer = Deno.serve({ hostname: '0.0.0.0', port: wakePort }, handleWakeRequest)

async function runVisualWorkerLoop(laneIndex: number) {
  const visualWorkerId = `${workerId}:visual:${laneIndex + 1}`
  let emptyPolls = 0
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('visual')
      const pollStartedAt = Date.now()
      const visualResult = await processFlyVisualGenerationJobs({
        client,
        workerId: visualWorkerId,
      })
      if (visualResult.processed) {
        console.log('[world-generation-worker] processed visual generation job', {
          workerId: visualWorkerId,
          laneIndex,
          jobId: visualResult.job?.id ?? null,
          status: visualResult.job?.status ?? null,
          kind: visualResult.job?.kind ?? null,
        })
        emptyPolls = 0
        continue
      }
      emptyPolls += 1
      await wakeScheduler.waitForWakeOrTimeout('visual', workerIdleDelay(emptyPolls), pollStartedAt)
    } catch (error) {
      await handleWorkerLoopError('visual', error)
    }
  }
}

async function runGenerationWorkerLoop() {
  let emptyPolls = 0
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('generation')
      const pollStartedAt = Date.now()
      const result = await processFlyWorldGenerationJobs({
        client,
        authHeader,
        workerId,
        workerSecret,
      })
      if (result.processed) {
        console.log('[world-generation-worker] processed generation job', {
          workerId,
          jobId: result.job?.id ?? null,
          status: result.job?.status ?? null,
        })
        emptyPolls = 0
        continue
      }
      if (result.job?.id) {
        console.log('[world-generation-worker] claimed generation job', {
          workerId,
          jobId: result.job.id,
          status: result.job.status,
        })
      }
      const now = Date.now()
      if (now - lastIdleLogAt >= idleLogIntervalMs) {
        lastIdleLogAt = now
        console.log('[world-generation-worker] idle; waiting for queued Fly generation jobs.', { workerId })
      }
      emptyPolls += 1
      await wakeScheduler.waitForWakeOrTimeout('generation', workerIdleDelay(emptyPolls), pollStartedAt)
    } catch (error) {
      await handleWorkerLoopError('generation', error)
    }
  }
}

async function runAppGenerationWorkerLoop() {
  let emptyPolls = 0
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('app_generation')
      const pollStartedAt = Date.now()
      const result = await processFlyAppGenerationJobs({
        client,
        workerId,
      })
      if (result.processed) {
        console.log('[world-generation-worker] processed app generation job', {
          workerId,
          jobId: result.job?.id ?? null,
          status: result.job?.status ?? null,
          kind: result.job?.kind ?? null,
        })
        emptyPolls = 0
        continue
      }
      emptyPolls += 1
      await wakeScheduler.waitForWakeOrTimeout('app_generation', workerIdleDelay(emptyPolls), pollStartedAt)
    } catch (error) {
      await handleWorkerLoopError('app_generation', error)
    }
  }
}

const maintenanceIntervalMs = Math.max(
  60_000,
  Number(Deno.env.get('GRAPHCORE_WORKER_MAINTENANCE_INTERVAL_MS') ?? 180_000),
)

/**
 * Periodic reliability sweep:
 * - terminally fails output workflow runs whose worker heartbeat went stale
 *   after exhausting their claim attempts (no more silent zombie runs),
 * - re-queues cinematic jobs that were claimed for provider submission but
 *   never received a provider request id (crashed mid-submit), and
 * - cancels queued/running steps left behind on terminal runs (zombie
 *   executors re-marking steps after the run already failed).
 */
async function runMaintenanceLoop() {
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('maintenance')
      const orphanResponse = await client.rpc('fail_orphaned_output_workflow_runs', {
        stale_minutes: 15,
        max_attempts: 4,
      })
      if (orphanResponse.error) throw new Error(orphanResponse.error.message)
      const requeueResponse = await client.rpc('requeue_unsubmitted_cinematic_jobs', {
        grace_minutes: 3,
      })
      if (requeueResponse.error) throw new Error(requeueResponse.error.message)
      const orphanStepResponse = await client.rpc('cancel_orphaned_output_workflow_run_steps', {
        grace_minutes: 10,
      })
      if (orphanStepResponse.error) throw new Error(orphanStepResponse.error.message)
      const failedRuns = Number(orphanResponse.data ?? 0)
      const requeuedJobs = Number(requeueResponse.data ?? 0)
      const sweptSteps = Number(orphanStepResponse.data ?? 0)
      if (failedRuns > 0 || requeuedJobs > 0 || sweptSteps > 0) {
        console.warn('[world-generation-worker] maintenance sweep acted.', {
          workerId,
          orphanedRunsFailed: failedRuns,
          cinematicJobsRequeued: requeuedJobs,
          orphanedStepsCancelled: sweptSteps,
        })
      }
      if (requeuedJobs > 0) {
        wakeScheduler.signal(['generation'])
      }
    } catch (error) {
      await handleWorkerLoopError('maintenance', error)
    }
    await sleep(maintenanceIntervalMs)
  }
}

async function runOutputWorkflowWorkerLoop(laneIndex: number) {
  const outputWorkerId = `${workerId}:output:${laneIndex + 1}`
  let emptyPolls = 0
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('output_workflow')
      const pollStartedAt = Date.now()
      const result = await processFlyOutputWorkflowRuns({
        client,
        workerId: outputWorkerId,
        workerCodeVersion,
        workerBuildVersion,
        documentRenderer: renderOutputPdf,
      })
      if (result.processed) {
        console.log('[world-generation-worker] processed output workflow run', {
          workerId: outputWorkerId,
          laneIndex,
          runId: result.run?.id ?? null,
          status: result.run?.status ?? null,
          preset: result.run?.preset ?? null,
        })
        emptyPolls = 0
        continue
      }
      emptyPolls += 1
      await wakeScheduler.waitForWakeOrTimeout('output_workflow', workerIdleDelay(emptyPolls), pollStartedAt)
    } catch (error) {
      await handleWorkerLoopError('output_workflow', error)
    }
  }
}

await Promise.all([
  ...Array.from({ length: visualWorkerConcurrency }, (_, index) => runVisualWorkerLoop(index)),
  runGenerationWorkerLoop(),
  runAppGenerationWorkerLoop(),
  ...Array.from({ length: outputWorkflowWorkerConcurrency }, (_, index) => runOutputWorkflowWorkerLoop(index)),
  runMaintenanceLoop(),
])

await wakeServer.shutdown()
console.log('[world-generation-worker] stopped', { workerId })
