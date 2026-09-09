// Async fakes deliberately implement fetch/RPC's promise-based contracts.
// deno-lint-ignore-file require-await
import { executePhase } from '../../supabase/functions/_shared/director-runtime/runner.ts'
import type { Client, Job } from '../../supabase/functions/_shared/director-runtime/types.ts'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message)
}
function fixture(overrides: Partial<Job> = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let inbox: unknown[] = []
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name === 'director_begin_submission' ? true : {}, error: null }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: inbox.map((payload) => ({ payload })), error: null }) }),
        }),
      }),
    }),
  } as unknown as Client
  const job = {
    id: crypto.randomUUID(),
    run_id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    project_id: crypto.randomUUID(),
    draft_id: crypto.randomUUID(),
    take_id: crypto.randomUUID(),
    operation: 'take',
    phase: 'submit',
    lease_owner: 'test',
    lease_token: 1,
    attempt_count: 1,
    submission_started: false,
    provider_request_id: null,
    provider_permit: true,
    provider_deadline: new Date(Date.now() + 600000).toISOString(),
    snapshot: {},
    checkpoint: {
      model: 'minimax/h3-max/text-to-video',
      prompt: 'A quiet observatory',
      references: [],
      settings: {
        speed: 'standard',
        resolution: '768p',
        durationSeconds: 5,
        aspectRatio: '16:9',
        mode: 'scripted',
        firstFrameAssetKey: '',
        endFrameAssetKey: '',
      },
    },
    ...overrides,
  } as Job
  return {
    client,
    job,
    calls,
    setInbox: (rows: unknown[]) => {
      inbox = rows
    },
    last: () => calls.filter((c) => c.name === 'director_checkpoint').at(-1)?.args,
  }
}
async function withFetch(handler: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch, key = Deno.env.get('FAL_KEY'), url = Deno.env.get('DIRECTOR_FAL_WEBHOOK_URL')
  globalThis.fetch = handler
  Deno.env.set('FAL_KEY', 'test-only')
  Deno.env.set('DIRECTOR_FAL_WEBHOOK_URL', 'https://example.invalid/director')
  try {
    await fn()
  } finally {
    globalThis.fetch = original
    for (const [name, value] of [['FAL_KEY', key], ['DIRECTOR_FAL_WEBHOOK_URL', url]]) {
      if (value === undefined) Deno.env.delete(name!)
      else Deno.env.set(name!, value)
    }
  }
}
Deno.test('submission saves provider handle and releases to await_provider', async () => {
  const f = fixture()
  let posts = 0
  await withFetch(async (_url, init) => {
    assert(init?.method === 'POST', 'must submit once')
    posts++
    return Response.json({ request_id: 'request-1' })
  }, () => executePhase(f.client, f.job))
  assert(posts === 1, 'duplicate POST')
  assert(f.calls.some((c) => c.name === 'director_record_provider'), 'handle not durable')
  assert(f.last()?.p_phase === 'await_provider', 'worker did not yield')
})
Deno.test('ambiguous submit never automatically resubmits', async () => {
  const f = fixture()
  let posts = 0
  await withFetch(async () => {
    posts++
    throw new TypeError('connection lost')
  }, async () => {
    await executePhase(f.client, f.job)
    assert(f.last()?.p_phase === 'attention', 'must require reconciliation')
    await executePhase(f.client, f.job)
  })
  assert(posts === 1, 'uncertain paid request was submitted twice')
})
Deno.test('429 rejection refunds once via idempotent settlement and ends attempt', async () => {
  const f = fixture()
  await withFetch(
    async () => Response.json({ error: 'rate limit' }, { status: 429 }),
    () => executePhase(f.client, f.job),
  )
  assert(f.last()?.p_phase === 'failed', 'known rejected submit should not be ambiguous')
  assert(
    f.calls.some((c) => c.name === 'director_settle_credits' && c.args.p_charge === 0),
    'unused reservation not refunded',
  )
})
Deno.test('restart with persisted handle reuses request without POST', async () => {
  const f = fixture({ submission_started: true, provider_request_id: 'persisted' })
  await withFetch(async () => {
    throw new Error('NETWORK MUST NOT BE USED')
  }, () => executePhase(f.client, f.job))
  assert(f.last()?.p_phase === 'await_provider', 'did not reuse provider handle')
  assert(!f.calls.some((c) => c.name === 'director_begin_submission'), 'submission marker repeated')
})
Deno.test('early or out-of-order successful webhook wins and skips polling', async () => {
  const f = fixture({ phase: 'await_provider', provider_request_id: 'persisted' })
  f.setInbox([{ status: 'ERROR' }, { status: 'OK', payload: { video: { url: 'https://example.invalid/video.mp4' } } }, {
    status: 'ERROR',
  }])
  await withFetch(async () => {
    throw new Error('NETWORK MUST NOT BE USED')
  }, () => executePhase(f.client, f.job))
  assert(f.last()?.p_phase === 'ingest', 'successful webhook not ingested')
  assert((f.last()?.p_patch as Record<string, unknown>).providerTerminal === true, 'permit not released')
})
Deno.test('lost webhook uses status/result and moves only to ingest', async () => {
  const f = fixture({ phase: 'await_provider', provider_request_id: 'persisted' })
  await withFetch(
    async (url) =>
      String(url).endsWith('/status')
        ? Response.json({ status: 'COMPLETED' })
        : Response.json({ video: { url: 'https://example.invalid/video.mp4' } }),
    () => executePhase(f.client, f.job),
  )
  assert(f.last()?.p_phase === 'ingest', 'fallback did not ingest')
})
Deno.test('poll throttling preserves request and schedules bounded backoff', async () => {
  const f = fixture({ phase: 'await_provider', provider_request_id: 'persisted' })
  await withFetch(
    async () => Response.json({ error: 'throttled' }, { status: 429 }),
    () => executePhase(f.client, f.job),
  )
  assert(f.last()?.p_phase === 'await_provider', 'poll throttling resubmitted/failed generation')
  assert(Number(f.last()?.p_delay) > 0, 'no backoff')
})
Deno.test('completed provider without usable media cannot finalize', async () => {
  const f = fixture({
    phase: 'await_provider',
    provider_request_id: 'persisted',
    provider_deadline: new Date(0).toISOString(),
  })
  await withFetch(
    async (url) => String(url).endsWith('/status') ? Response.json({ status: 'COMPLETED' }) : Response.json({}),
    () => executePhase(f.client, f.job),
  )
  assert(f.last()?.p_phase === 'attention', 'invalid media was accepted')
  assert(!f.calls.some((c) => c.name === 'director_finalize_job'), 'invalid take finalized')
})
Deno.test('unsubmitted cancellation refunds, submitted unknown cancellation is held', async () => {
  const f = fixture({ phase: 'cancel' })
  await executePhase(f.client, f.job)
  assert(f.last()?.p_phase === 'cancelled', 'unsubmitted cancel failed')
  assert(f.calls.some((c) => c.name === 'director_settle_credits'), 'refund missing')
  const unknown = fixture({ phase: 'cancel', submission_started: true })
  await executePhase(unknown.client, unknown.job)
  assert(unknown.last()?.p_phase === 'attention', 'unknown submission silently refunded')
  assert(!unknown.calls.some((c) => c.name === 'director_settle_credits'), 'uncertain charge refunded')
})
Deno.test('failed storage download retries ingestion without another provider POST', async () => {
  const f = fixture({
    phase: 'ingest',
    submission_started: true,
    provider_request_id: 'persisted',
    checkpoint: { videoUrl: 'https://example.invalid/video.mp4' },
  })
  let posts = 0
  await withFetch(async (_url, init) => {
    if (init?.method === 'POST') posts++
    return new Response('unavailable', { status: 503 })
  }, () => executePhase(f.client, f.job))
  assert(posts === 0, 'ingestion re-generated video')
  assert(f.last()?.p_phase === 'ingest', 'ingestion recovery phase changed')
})

Deno.test('expired provider media is refreshed using its existing request', async () => {
  const f = fixture({
    phase: 'ingest',
    provider_request_id: 'saved-request',
    submission_started: true,
    checkpoint: { model: 'minimax/h3-max/text-to-video', videoUrl: 'https://fixture.invalid/expired.mp4' },
  })
  let posts = 0
  await withFetch(async (url, init) => {
    if (init?.method === 'POST') posts++
    if (String(url).includes('fixture.invalid')) return new Response('expired', { status: 403 })
    if (String(url).endsWith('/status')) return Response.json({ status: 'COMPLETED' })
    return Response.json({ video: { url: 'https://fixture.invalid/renewed.mp4' } })
  }, () => executePhase(f.client, f.job))
  assert(posts === 0, 'renewing media submitted inference')
  assert(f.last()?.p_phase === 'ingest', 'renewing media left ingestion')
  assert(
    (f.last()?.p_patch as Record<string, unknown>).videoUrl === 'https://fixture.invalid/renewed.mp4',
    'renewed link was not persisted',
  )
})
