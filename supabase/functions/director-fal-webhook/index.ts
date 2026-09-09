import { createAdminClient } from '../_shared/auth.ts'
import { verifyFalWebhookRequest } from '../_shared/fal-webhooks.ts'
import { wakeDirector } from '../_shared/director-runtime/wake.ts'
import { errorResponse, HttpError, json } from '../_shared/http.ts'
Deno.serve(async (request) => {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    if (Number(request.headers.get('content-length')) > 1024 * 1024) throw new HttpError(413, 'Webhook too large')
    const reader = request.body?.getReader()
    if (!reader) throw new HttpError(400, 'Missing webhook body')
    const chunks: Uint8Array[] = []
    let size = 0, timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      void reader.cancel()
    }, 15000)
    try {
      while (true) {
        const part = await reader.read()
        if (timedOut) throw new HttpError(408, 'Webhook read timed out')
        if (part.done) break
        size += part.value.byteLength
        if (size > 1024 * 1024) {
          await reader.cancel()
          throw new HttpError(413, 'Webhook too large')
        }
        chunks.push(part.value)
      }
    } finally {
      clearTimeout(timer)
      reader.releaseLock()
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    const verified = await verifyFalWebhookRequest(
      new Request(request.url, { method: 'POST', headers: request.headers, body }),
    )
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', verified.rawBody))).map((b) =>
      b.toString(16).padStart(2, '0')
    ).join('')
    const client = createAdminClient('director-fal-webhook')
    const requestId = verified.payload.request_id
    const inbox = await client.from('director_provider_inbox').upsert({
      request_id: requestId,
      digest,
      payload: verified.payload,
    }, { onConflict: 'request_id,digest', ignoreDuplicates: true })
    if (inbox.error) throw inbox.error
    const wake = await client.from('director_runtime_jobs').update({ next_attempt_at: new Date().toISOString() }).eq(
      'provider_request_id',
      requestId,
    ).eq('phase', 'await_provider')
    if (wake.error) throw wake.error
    // Durable inbox commits before acknowledgement; early notifications need no matching job yet.
    void wakeDirector()
    return json({ received: true })
  } catch (error) {
    return errorResponse(error, 'Director webhook failed')
  }
})
