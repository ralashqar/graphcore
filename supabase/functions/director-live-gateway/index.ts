import { z } from 'zod'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { directorAssetUrl } from '../_shared/director-media.ts'

const schema = z.object({ takeId: z.string().uuid(), action: z.enum(['config','transport','chunk','stop','recording']),
  path: z.enum(['/ice','/session','/session/heartbeat']).optional(), body: z.record(z.string(), z.unknown()).optional(), index: z.number().int().min(0).max(149).optional() })
Deno.serve(async request => {
  const preflight = maybeHandleOptions(request); if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { user, client } = await requireUserClient(request, 'director-live-gateway')
    const input = schema.parse(await request.json())
    const admin = createAdminClient('director-live-gateway')
    const row = await admin.from('director_live_sessions').select('*').eq('take_id', input.takeId).eq('owner_id', user.id).single()
    if (row.error) throw new HttpError(404, 'Live session not found.')
    const live = row.data
    const takeResult = await client.from('director_takes').select('*').eq('id', input.takeId).single()
    if (takeResult.error) throw takeResult.error
    const take = takeResult.data
    if (input.action === 'recording') return json({ chunkCount: live.chunk_count, runId: take.run_id })
    // Upload/recovery remains available after the transport lease expires.
    if (input.action === 'stop') {
      const stopped = await admin.from('director_live_sessions').update({ stopped_at: live.stopped_at ?? new Date().toISOString() }).eq('take_id', input.takeId)
      if (stopped.error) throw stopped.error
      return json({ stopped: true })
    }
    if (input.action === 'chunk') {
      if (input.index === undefined || live.chunk_count !== null || Date.now() - Date.parse(live.created_at) > 72 * 3600_000) throw new HttpError(400, 'Recording cannot accept more chunks.')
      const path = `generated/director-live/${take.draft_id}/${take.id}/${input.index}.webm`
      const saved = await admin.from('director_live_chunks').upsert({ take_id: take.id, chunk_index: input.index, storage_path: path })
      if (saved.error) throw saved.error
      const signed = await admin.storage.from('project-assets').createSignedUploadUrl(path, { upsert: true })
      if (signed.error) throw signed.error
      return json({ path, token: signed.data.token })
    }
    if (Deno.env.get('DIRECTOR_LIVE_ENABLED') !== 'true' || !(Deno.env.get('DIRECTOR_LIVE_BETA_USERS') ?? '').split(',').map(s => s.trim()).includes(user.id)) throw new HttpError(403, 'Live beta is disabled.')
    if (live.stopped_at || Date.parse(live.expires_at) <= Date.now() || take.status !== 'generating') throw new HttpError(410, 'Live session has ended. Saved footage can still be recovered.')
    if (input.action === 'config') return json({ expiresAt: live.expires_at, prompt: take.prompt, imageUrl: await directorAssetUrl(admin, take.project_id, take.settings.firstFrameAssetKey), resolution: take.settings.resolution, aspectRatio: take.settings.aspectRatio })
    if (!input.path) throw new HttpError(400, 'Missing transport path.')
    let body: Record<string, unknown>
    if (input.path === '/session/heartbeat') {
      if (!live.provider_session_id || input.body?.session_id !== live.provider_session_id) throw new HttpError(403, 'Invalid transport session.')
      body = { session_id: live.provider_session_id }
    } else if (input.path === '/session') {
      if (input.body?.type !== 'offer' || typeof input.body.sdp !== 'string' || input.body.sdp.length > 100000) throw new HttpError(400, 'Invalid WebRTC offer.')
      const claim = await admin.from('director_live_sessions').update({ negotiating: true }).eq('take_id', take.id).eq('negotiating', false).is('provider_session_id', null).select('take_id')
      if (claim.error || !claim.data?.length) throw new HttpError(409, 'This live connection was already opened. Start another session to reconnect.')
      body = { app_id: 'minimax/h3-max/director', sdp: input.body.sdp, type: 'offer' }
    } else body = { app_id: 'minimax/h3-max/director' }
    const key = Deno.env.get('FAL_KEY'); if (!key) throw new HttpError(503, 'Live provider is not configured.')
    const response = await fetch(`https://wma.fal.run${input.path}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(110_000) })
    const data = await response.json()
    if (!response.ok) throw new HttpError(502, `Live provider rejected ${input.path} (${response.status}).`)
    if (input.path === '/session') {
      if (!data.session_id) throw new HttpError(502, 'Live provider returned no session identifier.')
      const saved = await admin.from('director_live_sessions').update({ provider_session_id: data.session_id }).eq('take_id', take.id)
      if (saved.error) throw saved.error
    }
    return json(data)
  } catch (error) { return errorResponse(error, 'Live Director failed.') }
})
