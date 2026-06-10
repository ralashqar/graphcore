import { createAdminClient } from '../../supabase/functions/_shared/auth.ts'
import { processFlyAppGenerationJobs } from '../../supabase/functions/_shared/app-generation-worker.ts'
import { processFlyOutputWorkflowRuns } from '../../supabase/functions/_shared/output-workflow.ts'
import { processFlyVisualGenerationJobs } from '../../supabase/functions/_shared/visual-generation-worker.ts'
import { processFlyWorldGenerationJobs } from '../../supabase/functions/_shared/world-prompt.ts'
import { renderOutputPdf } from './ebook-pdf-renderer.ts'

const workerCodeVersion = '2026-06-06-sequence-animatic-script-shots'
const workerId = Deno.env.get('FLY_MACHINE_ID')
  ?? Deno.env.get('GRAPHCORE_WORKER_ID')
  ?? crypto.randomUUID()
const workerBuildVersion = Deno.env.get('GRAPHCORE_WORKER_BUILD_VERSION')
  ?? Deno.env.get('FLY_IMAGE_REF')
  ?? Deno.env.get('FLY_MACHINE_VERSION')
  ?? workerCodeVersion
const workerSecret = Deno.env.get('GRAPHCORE_WORKER_SECRET') ?? null
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const pollIntervalMs = Math.max(5_000, Number(Deno.env.get('GRAPHCORE_WORKER_POLL_INTERVAL_MS') ?? 10_000))
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

function readPositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.floor(parsed))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  visualWorkerConcurrency,
  outputWorkflowWorkerConcurrency,
  runtime: 'fly',
})

async function runVisualWorkerLoop(laneIndex: number) {
  const visualWorkerId = `${workerId}:visual:${laneIndex + 1}`
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('visual')
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
        continue
      }
      await sleep(pollIntervalMs)
    } catch (error) {
      await handleWorkerLoopError('visual', error)
    }
  }
}

async function runGenerationWorkerLoop() {
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('generation')
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
      await sleep(pollIntervalMs)
    } catch (error) {
      await handleWorkerLoopError('generation', error)
    }
  }
}

async function runAppGenerationWorkerLoop() {
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('app_generation')
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
        continue
      }
      await sleep(pollIntervalMs)
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
    } catch (error) {
      await handleWorkerLoopError('maintenance', error)
    }
    await sleep(maintenanceIntervalMs)
  }
}

async function runOutputWorkflowWorkerLoop(laneIndex: number) {
  const outputWorkerId = `${workerId}:output:${laneIndex + 1}`
  while (!shuttingDown) {
    try {
      await waitForDatabaseCircuit('output_workflow')
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
        continue
      }
      await sleep(pollIntervalMs)
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

console.log('[world-generation-worker] stopped', { workerId })
