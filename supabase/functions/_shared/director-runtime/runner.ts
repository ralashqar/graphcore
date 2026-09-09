import { aiUsageLineSchema } from '../../../../src/domain/aiUsage.ts'
import { recordAiUsageEvent } from '../ai-provider-gateway.ts'
import { type Client, fence, type Job, type Phase, rpc } from './types.ts'
import { ingestTake, prepareTake, renderEdit } from './media.ts'
import * as provider from './provider.ts'

function usage(job: Job) {
  const t = job.snapshot.take!
  return {
    idempotencyKey: `director:${job.take_id}`,
    creditsCharged: t.credits_reserved,
    context: {
      projectId: job.project_id,
      draftId: job.draft_id,
      outputWorkflowRunId: job.run_id,
      userId: job.snapshot.userId,
    },
    line: aiUsageLineSchema.parse({
      provider: 'fal',
      model: job.checkpoint.model,
      modality: 'video',
      operation: 'video_generation',
      status: 'succeeded',
      requestId: job.provider_request_id,
      media: { durationSeconds: job.checkpoint.asset?.durationSeconds },
      cost: {
        estimatedCostUsd: t.estimated_cost_usd,
        estimatedCredits: t.credits_reserved,
        pricingSource: 'h3_list_rate_estimate',
        priceSnapshot: t.pricing_snapshot,
      },
    }),
  }
}
export async function executePhase(client: Client, job: Job) {
  const checkpoint = (phase: Phase, patch: Record<string, unknown> = {}, delay = 0, error: string | null = null) =>
    rpc(client, 'director_checkpoint', {
      ...fence(job),
      p_phase: phase,
      p_patch: patch,
      p_delay: delay,
      p_error: error,
    })
  try {
    if (job.phase === 'prepare') {
      if (job.operation === 'export') await checkpoint('finalize', { asset: await renderEdit(client, job) })
      else await checkpoint('submit', await prepareTake(client, job))
    } else if (job.phase === 'submit') {
      if (job.provider_request_id) {
        await checkpoint('await_provider', {}, 5)
        return
      }
      if (job.submission_started) {
        await checkpoint('attention', {}, 0, 'Provider submission outcome is unknown. Reconciliation required.')
        return
      }
      // Resolve expiring URLs before the submission marker: signing failures are safe to retry.
      const body = await provider.submissionBody(client, job)
      if (!Deno.env.get('FAL_KEY') || !Deno.env.get('DIRECTOR_FAL_WEBHOOK_URL')?.startsWith('https://')) {
        throw new Error('Director provider configuration is incomplete')
      }
      if (!await rpc<boolean>(client, 'director_begin_submission', fence(job))) {
        await checkpoint('attention', {}, 0, 'Provider submission already started')
        return
      }
      job.submission_started = true
      const result = await provider.submit(job, body)
      if (typeof result.request_id !== 'string' || !result.request_id) {
        throw new Error('Provider response has no request ID')
      }
      // This restricted write is allowed after lease loss/cancellation to preserve the paid handle.
      await rpc(client, 'director_record_provider', { p_job: job.id, p_request: result.request_id })
      await checkpoint('await_provider', { requestId: result.request_id }, 5)
    } else if (job.phase === 'await_provider') {
      const inbox = await client.from('director_provider_inbox').select('payload').eq(
        'request_id',
        job.provider_request_id!,
      ).order('received_at', { ascending: false }).limit(10)
      if (inbox.error) throw inbox.error
      // A successful terminal notification wins over duplicates/out-of-order failures.
      const success = inbox.data.map((r) => r.payload).find((p) =>
        p.status === 'OK' && (p.payload?.video?.url || p.payload?.data?.video?.url)
      )
      const result = success
        ? { completed: true, videoUrl: success.payload.video?.url ?? success.payload.data?.video?.url }
        : await provider.poll(job)
      if (result.completed && result.videoUrl) {
        await checkpoint('ingest', { videoUrl: result.videoUrl, providerTerminal: true })
        return
      }
      if ('failed' in result && result.failed) {
        await checkpoint(
          'attention',
          { providerTerminal: true },
          0,
          `Provider failed: ${result.error}. Credit reconciliation required.`,
        )
        return
      }
      if (Date.now() > Date.parse(job.provider_deadline!)) {
        await checkpoint('attention', {}, 0, 'Provider deadline exceeded. Recover this request without regenerating.')
        return
      }
      const polls = (job.checkpoint.polls ?? 0) + 1
      await checkpoint('await_provider', { polls }, Math.min(15, 5 + polls * 2))
    } else if (job.phase === 'ingest') {
      await checkpoint('finalize', { asset: await ingestTake(client, job) })
    } else if (job.phase === 'finalize') {
      await rpc(client, 'director_finalize_job', { ...fence(job), p_usage: job.take_id ? usage(job) : null })
    } else if (job.phase === 'cancel') {
      if (!job.submission_started) {
        if (job.take_id) await rpc(client, 'director_settle_credits', { p_take: job.take_id, p_charge: 0 })
        await checkpoint('cancelled', { providerTerminal: true })
      } else if (!job.provider_request_id) {
        await checkpoint('attention', {}, 0, 'Cancelled with an unknown submission outcome; reconciliation required')
      } else {
        await provider.cancel(job)
        // A cancellation acknowledgement is not billing evidence. Keep the permit until reconciliation.
        await checkpoint('cancelled', {}, 0, 'Cancellation requested; provider charges await reconciliation')
      }
    }
  } catch (error) {
    const message = String(error).slice(0, 1500)
    if (/lease lost|generation cancelled|job is terminal/i.test(message)) return
    if (
      job.phase === 'ingest' && job.provider_request_id && job.attempt_count < 5 &&
      /Media download failed \((401|403|404)\)/.test(message)
    ) {
      // Renew an expired provider download using the same handle; never resubmit inference.
      const refreshed = await provider.poll(job).catch(() => null)
      if (refreshed?.completed && refreshed.videoUrl) {
        await checkpoint('ingest', { videoUrl: refreshed.videoUrl }, 1, message)
        return
      }
    }
    const uncertain = job.phase === 'submit' && job.submission_started
    const rejected = uncertain && error instanceof provider.ProviderError &&
      [400, 401, 403, 404, 422, 429].includes(error.status)
    if (rejected && job.take_id) await rpc(client, 'director_settle_credits', { p_take: job.take_id, p_charge: 0 })
    const phase: Phase = uncertain
      ? (rejected ? 'failed' : 'attention')
      : job.attempt_count >= 5
      ? 'attention'
      : job.phase
    await checkpoint(
      phase,
      rejected ? { providerTerminal: true } : {},
      Math.min(60, 2 ** Math.min(job.attempt_count, 5)),
      message,
    ).catch((e) => {
      if (!/lease lost/i.test(String(e))) throw e
    })
  }
}
export async function deliverUsage(client: Client) {
  const pending = await client.from('director_usage_outbox').select('*').is('delivered_at', null).lte(
    'next_attempt_at',
    new Date().toISOString(),
  ).limit(10)
  if (pending.error) throw pending.error
  for (const event of pending.data) {
    const result = await recordAiUsageEvent(client as never, event.payload)
    const update = await client.from('director_usage_outbox').update({
      attempts: event.attempts + 1,
      ...(result.ok ? { delivered_at: new Date().toISOString(), error_message: null } : {
        error_message: String(result.error),
        next_attempt_at: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.min(event.attempts, 6)))
          .toISOString(),
      }),
    }).eq('job_id', event.job_id)
    if (update.error) throw update.error
  }
}
