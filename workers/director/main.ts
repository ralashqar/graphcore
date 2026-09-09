import { createDirectorClient } from '../../supabase/functions/_shared/director-runtime/client.ts'
import { deliverUsage, executePhase } from '../../supabase/functions/_shared/director-runtime/runner.ts'
import { fence, type Job, rpc } from '../../supabase/functions/_shared/director-runtime/types.ts'
import { verifyWorkerWakeSignature } from '../../supabase/functions/_shared/worker-wake.ts'
import { maintainDirector } from './maintenance.ts'

const lane = Deno.args[0] ?? 'orchestration'
if (!['orchestration', 'media', 'export'].includes(lane)) throw new Error('Invalid Director process group')
const version = 'director-v2-2026-09-06'
const client = createDirectorClient()
const worker = `${Deno.env.get('FLY_MACHINE_ID') ?? crypto.randomUUID()}:${lane}`
const concurrency = lane === 'orchestration' ? 4 : 1
const running = new Set<Promise<void>>()
let wake: (() => void) | undefined, stopping = false, lastClaim = 0, lastMaintenance = 0
const delay = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wake = undefined
      resolve()
    }, 500)
    wake = () => {
      clearTimeout(timer)
      wake = undefined
      resolve()
    }
  })
Deno.addSignalListener('SIGTERM', () => {
  stopping = true
  wake?.()
})
Deno.serve({ port: 8080 }, async (request) => {
  const url = new URL(request.url)
  if (url.pathname === '/health') {
    return Response.json({
      ok: !stopping && Date.now() - lastClaim < 30000,
      version,
      lane,
      active: running.size,
      lastClaim,
    }, { status: !stopping && Date.now() - lastClaim < 30000 ? 200 : 503 })
  }
  if (url.pathname !== '/wake' || request.method !== 'POST') return new Response('Not found', { status: 404 })
  if (Number(request.headers.get('content-length')) > 4096) return new Response('Too large', { status: 413 })
  const body = await request.text()
  if (body.length > 4096) return new Response('Too large', { status: 413 })
  const verified = await verifyWorkerWakeSignature({
    secret: Deno.env.get('DIRECTOR_WORKER_WAKE_SECRET') ?? '',
    timestamp: request.headers.get('X-GraphCore-Wake-Timestamp'),
    signature: request.headers.get('X-GraphCore-Wake-Signature'),
    body,
  })
  if (!verified.ok) return new Response('Unauthorized', { status: 401 })
  wake?.()
  return Response.json({ ok: true })
})
console.info(JSON.stringify({ event: 'director_worker_started', version, lane, worker, concurrency }))
while (!stopping) {
  try {
    if (running.size < concurrency) {
      const job = await rpc<Job | null>(client, 'director_claim_job', { p_worker: worker, p_lane: lane })
      lastClaim = Date.now()
      if (job) {
        const started = Date.now()
        console.info(JSON.stringify({event:'director_job_dispatched',jobId:job.id,phase:job.phase,lane,
          eligibleDelayMs:job.next_attempt_at?Math.max(0,started-Date.parse(job.next_attempt_at)):null}))
        const heartbeat = setInterval(() => {
          void rpc(client, 'director_checkpoint', { ...fence(job), p_phase: 'heartbeat' }).catch((error) =>
            console.warn('director_heartbeat', String(error))
          )
        }, 20000)
        const task = executePhase(client, job).catch((error) =>
          console.error(
            JSON.stringify({ event: 'director_phase_error', jobId: job.id, phase: job.phase, error: String(error) }),
          )
        ).finally(() => {
          clearInterval(heartbeat)
          running.delete(task)
          wake?.()
          console.info(
            JSON.stringify({
              event: 'director_phase_finished',
              jobId: job.id,
              phase: job.phase,
              elapsedMs: Date.now() - started,
            }),
          )
        })
        running.add(task)
        continue
      }
    } else lastClaim = Date.now()
    if (lane === 'orchestration' && Date.now() - lastMaintenance > 60000) {
      lastMaintenance = Date.now()
      // Maintenance is independent of interactive claim slots, bounded and idempotent.
      void deliverUsage(client).then(() => maintainDirector(client)).catch((error) =>
        console.error('director_maintenance', String(error))
      )
    }
  } catch (error) {
    console.error('director_claim_failed', String(error))
  }
  await delay()
}
await Promise.allSettled(running)
Deno.exit(0)
