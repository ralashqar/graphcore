import { createAdminClient } from '../../supabase/functions/_shared/auth.ts'
import { processFlyWorldEntityIconJobs } from '../../supabase/functions/_shared/entity-icon-worker.ts'
import { processFlyVisualGenerationJobs } from '../../supabase/functions/_shared/visual-generation-worker.ts'
import { processFlyWorldGenerationJobs } from '../../supabase/functions/_shared/world-prompt.ts'

const workerId = Deno.env.get('FLY_MACHINE_ID')
  ?? Deno.env.get('GRAPHCORE_WORKER_ID')
  ?? crypto.randomUUID()
const workerSecret = Deno.env.get('GRAPHCORE_WORKER_SECRET') ?? null
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const pollIntervalMs = Math.max(1_000, Number(Deno.env.get('GRAPHCORE_WORKER_POLL_INTERVAL_MS') ?? 2_500))
const idleLogIntervalMs = Math.max(30_000, Number(Deno.env.get('GRAPHCORE_WORKER_IDLE_LOG_INTERVAL_MS') ?? 120_000))

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the GraphCore world generation worker.')
}

const client = createAdminClient('fly-world-generation-worker')
const authHeader = `Bearer ${serviceRoleKey}`
let shuttingDown = false
let lastIdleLogAt = 0

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requestShutdown(signal: string) {
  console.log(`[world-generation-worker] received ${signal}; stopping after the current job.`)
  shuttingDown = true
}

Deno.addSignalListener('SIGTERM', () => requestShutdown('SIGTERM'))
Deno.addSignalListener('SIGINT', () => requestShutdown('SIGINT'))

console.log('[world-generation-worker] started', {
  workerId,
  pollIntervalMs,
  runtime: 'fly',
})

async function runIconWorkerLoop() {
  while (!shuttingDown) {
    try {
      const iconResult = await processFlyWorldEntityIconJobs({
        client,
        workerId,
      })
      if (iconResult.processed) {
        console.log('[world-generation-worker] processed entity icon job', {
          workerId,
          jobId: iconResult.job?.id ?? null,
          status: iconResult.job?.status ?? null,
        })
        continue
      }
      await sleep(pollIntervalMs)
    } catch (error) {
      console.error('[world-generation-worker] icon loop error', error)
      await sleep(Math.max(5_000, pollIntervalMs))
    }
  }
}

async function runVisualWorkerLoop() {
  while (!shuttingDown) {
    try {
      const visualResult = await processFlyVisualGenerationJobs({
        client,
        workerId,
      })
      if (visualResult.processed) {
        console.log('[world-generation-worker] processed visual generation job', {
          workerId,
          jobId: visualResult.job?.id ?? null,
          status: visualResult.job?.status ?? null,
          kind: visualResult.job?.kind ?? null,
        })
        continue
      }
      await sleep(pollIntervalMs)
    } catch (error) {
      console.error('[world-generation-worker] visual loop error', error)
      await sleep(Math.max(5_000, pollIntervalMs))
    }
  }
}

async function runGenerationWorkerLoop() {
  while (!shuttingDown) {
    try {
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
      console.error('[world-generation-worker] generation loop error', error)
      await sleep(Math.max(5_000, pollIntervalMs))
    }
  }
}

await Promise.all([
  runIconWorkerLoop(),
  runVisualWorkerLoop(),
  runGenerationWorkerLoop(),
])

console.log('[world-generation-worker] stopped', { workerId })
