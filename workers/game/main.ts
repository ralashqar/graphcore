import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { planGame } from './planner.ts'
import { buildGame } from './build.ts'
import { produceAsset } from './assets.ts'
import { gameWorkflowStages } from '../../src/domain/game/workflows.ts'
import { planModules, buildModules } from './modules.ts'
import { generateUnified, buildUnified } from './unified.ts'
import { produceAnimation, cancelAnimationJobs } from './animations.ts'
const WORKER_VERSION = 'game-humanoid-retarget-3.5.5'

type Job = { id: string; draft_id: string; requested_by: string; lease_owner: string; kind: 'generate' | 'build' | 'asset'; fence: number; phase: string; checkpoint: Record<string, any>; input: Record<string, any>; provider_started: boolean }
export type JobContext = { job: Job; admin: SupabaseClient; checkpoint: (phase: string, data: Record<string, unknown>) => Promise<void> }
export async function processGameJob(admin: SupabaseClient, worker: string, job: Job, onAlive: () => void = () => {}) {
  let lost = false, heartbeatBusy = false
  const progress = (phase: string) => {
    if(job.input.template==='unified.v1')return [{key:phase,label:phase,status:'running'}]
    const stages = gameWorkflowStages[job.kind], index = stages.findIndex(s => s.key === phase)
    return stages.map((stage, n) => ({ ...stage, status: n === index ? 'running' : job.kind === 'generate' && !['scope','contracts','register'].includes(stage.key) ? (job.checkpoint.completedSections?.includes(stage.key) ? 'completed' : job.checkpoint.scope && !job.checkpoint.scope.sections.includes(stage.key) ? 'skipped' : 'pending') : n < index ? 'completed' : 'pending' }))
  }
  const checkpoint = async (phase: string, data: Record<string, unknown>) => {
    if (lost) throw new Error('Game job lease was lost')
    const result = await admin.rpc('game_checkpoint', { p_job: job.id, p_worker: worker, p_fence: job.fence, p_phase: phase, p_checkpoint: data, p_progress: progress(phase), p_provider_started: data.pendingProvider === true })
    if (result.error || !result.data) { lost = true; throw new Error('Game job was cancelled or its lease expired') }
    job.phase = phase; job.checkpoint = data; job.provider_started ||= data.pendingProvider === true
    onAlive()
  }
  const timer = setInterval(async () => {
    if (heartbeatBusy || lost) return
    heartbeatBusy = true
    try { const result = await admin.rpc('game_heartbeat', { p_job: job.id, p_worker: worker, p_fence: job.fence }); if (result.error || !result.data) lost = true; else onAlive() } catch { lost = true } finally { heartbeatBusy = false }
  }, 20000)
  try {
    if (job.checkpoint.pendingProvider) throw new Error('Uncertain provider submission requires reconciliation')
    const ctx = { job, admin, checkpoint }
    if (job.input.animation) { await produceAnimation(ctx); return }
    const modules = job.input.design?.schemaVersion === 2 || job.input.template === 'combat_traversal.v1'
    const unified = job.input.design?.schemaVersion === 3 || job.input.template === 'unified.v1'
    const result = unified ? job.kind === 'build' ? await buildUnified(ctx) : await generateUnified(ctx) : modules && job.kind === 'generate' ? await planModules(ctx) : modules && job.kind === 'build' ? await buildModules(ctx) : job.kind === 'generate' ? await planGame(ctx) : job.kind === 'build' ? await buildGame(ctx) : await produceAsset(ctx)
    const completed = await admin.rpc('game_finish_job', { p_job: job.id, p_worker: worker, p_fence: job.fence, p_result: result })
    if (completed.error) throw completed.error
    console.info(JSON.stringify({ event: 'game_job_finished', jobId: job.id, kind: job.kind, accepted: completed.data, version: WORKER_VERSION }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ event: 'game_job_failed', jobId: job.id, phase: job.phase, message }))
    if (!lost) await admin.rpc('game_fail_job', { p_job: job.id, p_worker: worker, p_fence: job.fence, p_error: message, p_attention: job.checkpoint.pendingProvider === true })
  } finally { clearInterval(timer) }
}
if (import.meta.main) {
  const url = Deno.env.get('SUPABASE_URL'), secret = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !secret) throw new Error('Game worker credentials are missing')
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }), worker = `game:${crypto.randomUUID()}`
  const kind = Deno.env.get('GAME_WORKER_KIND') ?? 'build'
  if (!['generate', 'build', 'asset'].includes(kind)) throw new Error('Invalid game worker kind')
  let lastPoll = Date.now(), stopped = false
  let lastAnimationMaintenance = 0
  Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8080) }, () => Response.json({ version: WORKER_VERSION, kind, healthy: Date.now() - lastPoll < 240000 }, { status: Date.now() - lastPoll < 240000 ? 200 : 503 }))
  Deno.addSignalListener('SIGTERM', () => { stopped = true })
  while (!stopped) {
    try {
      if (kind === 'asset' && Deno.env.get('GAME_ANIMATION_WORKER_ENABLED') === 'true' && Date.now() - lastAnimationMaintenance > 30000) {
        await cancelAnimationJobs(admin); lastAnimationMaintenance = Date.now()
      }
      const claim = await admin.rpc('game_claim_job', { p_worker: worker, p_kind: kind })
      if (claim.error) throw claim.error
      lastPoll = Date.now()
      if (claim.data) { await processGameJob(admin, worker, claim.data, () => { lastPoll = Date.now() }); lastPoll = Date.now() }
    } catch (error) { console.error(JSON.stringify({ event: 'game_poll_failed', message: String(error) })) }
    if (!stopped) await new Promise(resolve => setTimeout(resolve, 3000))
  }
  Deno.exit(0)
}
