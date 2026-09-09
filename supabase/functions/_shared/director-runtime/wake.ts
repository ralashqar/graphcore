import { signWorkerWakeBody } from '../worker-wake.ts'
export async function wakeDirector() {
  const url = Deno.env.get('DIRECTOR_WORKER_WAKE_URL'), secret = Deno.env.get('DIRECTOR_WORKER_WAKE_SECRET')
  if (!url || !secret) return
  const body = '{"source":"director"}', timestamp = new Date().toISOString()
  const signature = await signWorkerWakeBody({ secret, timestamp, body })
  await fetch(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-GraphCore-Wake-Timestamp': timestamp,
      'X-GraphCore-Wake-Signature': signature,
    },
    signal: AbortSignal.timeout(750),
  }).then(async (r) => {
    await r.body?.cancel()
  }).catch(() => {})
}
