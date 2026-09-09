import { useEffect, useRef, useState } from 'react'
import { invokeDirector } from '../../../data/directorRepository'
import { supabase } from '../../../utils/supabase'
import type { DirectorController } from '../useDirectorController'
import { storeRecordingChunk, recordingChunks, deleteRecordingChunk } from './directorRecordingStore'

type Connection = { send: (message: object) => void; close: () => Promise<void> }
type LiveConfig = { expiresAt: string; prompt: string; imageUrl: string; resolution: string; aspectRatio: string }
export default function DirectorLivePanel({ controller: c }: { controller: DirectorController }) {
  const [status, setStatus] = useState('Ready')
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [telemetry, setTelemetry] = useState('')
  const [recovery, setRecovery] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const connection = useRef<Connection | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const takeId = useRef<string | null>(null)
  const version = useRef(1)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const uploads = useRef<Promise<unknown>>(Promise.resolve())
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingStart = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopping = useRef(false)
  const recordingError = useRef<unknown>(null)
  const sid = c.state.session!.id; const pid = c.state.session!.project_id
  const gateway = <T,>(action: string, extra = {}) => invokeDirector<T>('director-live-gateway', { takeId: takeId.current, action, ...extra })
  const recover = async () => {
    setBusy(true)
    try {
      const chunks = await recordingChunks(pid, sid)
      for (const id of new Set(chunks.map(chunk => chunk.takeId))) {
        takeId.current = id
        const group = chunks.filter(chunk => chunk.takeId === id)
        const existing = await gateway<{ chunkCount: number | null; runId: string | null }>('recording')
        for (const chunk of existing.runId ? [] : group) {
          const signed = await gateway<{ path: string; token: string }>('chunk', { index: chunk.index })
          const uploaded = await supabase.storage.from('project-assets').uploadToSignedUrl(signed.path, signed.token, chunk.blob, { contentType: 'video/webm', upsert: true })
          if (uploaded.error) throw uploaded.error
        }
        const result = await c.execute({ action: 'live_finish', takeId: id, chunkCount: group.length })
        if (!result) throw new Error('Could not finish the recording. Retry recovery after refreshing the session.')
        for (const chunk of group) await deleteRecordingChunk(chunk.key)
      }
      setRecovery(false); setStatus(chunks.length ? 'Saving recorded footage…' : 'No local recording to recover')
    } catch (error) { c.ui.patch({ error: String(error) }); setRecovery(true) }
    finally { setBusy(false) }
  }
  const stop = async () => {
    if (stopping.current) return
    stopping.current = true; setBusy(true); setStatus('Saving recording…')
    if (expiry.current) clearTimeout(expiry.current)
    if (recordingStart.current) clearTimeout(recordingStart.current)
    connection.current?.send({ type: 'stop' })
    try {
      if (recorder.current && recorder.current.state !== 'inactive') {
        await new Promise<void>(resolve => { recorder.current!.addEventListener('stop', () => resolve(), { once: true }); recorder.current!.stop() })
      }
      await connection.current?.close()
      await gateway('stop')
      await writes.current
      if (recordingError.current) throw recordingError.current
      await uploads.current.catch(() => {})
      if (!(await recordingChunks(pid, sid)).length && takeId.current) await c.execute({ action: 'cancel', takeId: takeId.current })
      await recover()
    } catch (error) { c.ui.patch({ error: String(error) }); setRecovery(true) }
    finally { setActive(false); setBusy(false); stopping.current = false; connection.current = null }
  }
  useEffect(() => {
    void recordingChunks(pid, sid).then(chunks => setRecovery(chunks.length > 0)).catch(error => c.ui.patch({ error: String(error) }))
    return () => {
      if (expiry.current) clearTimeout(expiry.current)
      if (recordingStart.current) clearTimeout(recordingStart.current)
      connection.current?.send({ type: 'stop' }); void connection.current?.close()
      if (recorder.current?.state === 'recording') recorder.current.stop()
      // Raw chunks remain in IndexedDB for explicit recovery on the next visit.
    }
  // Session identity is fixed by the keyed parent; do not reconnect on controller renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, sid])
  const start = async () => {
    if (busy || active) return
    setBusy(true); setStatus('Opening live session…'); recordingError.current = null
    try {
      const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('Live recording requires a browser with WebM MediaRecorder support.')
      // Verify durable local storage before opening a paid provider connection.
      await recordingChunks(pid, sid)
      if (!await c.saveDirection()) return
      const created = await c.execute({ action: 'live_start' })
      if (!created?.takeId) return
      takeId.current = created.takeId
      const config = await gateway<LiveConfig>('config')
      const [{ createFalClient }, { wma }] = await Promise.all([import('@fal-ai/client'), import('@fal-ai/client/realtime')])
      const fal = createFalClient({ credentials: () => undefined, fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        if (url.origin !== 'https://wma.fal.run' || !['/ice','/session','/session/heartbeat'].includes(url.pathname)) throw new Error('Unsupported live transport route.')
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
        return new Response(JSON.stringify(await gateway('transport', { path: url.pathname, body })), { headers: { 'Content-Type': 'application/json' } })
      } })
      let index = 0
      const handle = fal.realtime.open(wma('minimax/h3-max/director'), { receive: ['video','audio'], negotiationTimeoutMs: 105000,
        onMedia: stream => {
          if (video.current) { video.current.srcObject = stream; void video.current.play().catch(() => {}) }
          if (recorder.current?.state === 'recording' || recordingStart.current) return
          recordingStart.current = setTimeout(() => {
            recordingStart.current = null
            if (stopping.current || !stream.getVideoTracks().length) return
            try {
              const capture = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000, audioBitsPerSecond: 128000 })
              recorder.current = capture
              capture.ondataavailable = event => {
                if (!event.data.size) return
                const chunk = { takeId: created.takeId!, sessionId: sid, projectId: pid, index: index++, blob: event.data }
                writes.current = writes.current.then(async () => {
                  await storeRecordingChunk(chunk)
                  // Persist locally first; network backpressure cannot block recording storage.
                  uploads.current = uploads.current.catch(() => {}).then(async () => {
                    const signed = await gateway<{ path: string; token: string }>('chunk', { index: chunk.index })
                    const result = await supabase.storage.from('project-assets').uploadToSignedUrl(signed.path, signed.token, chunk.blob, { contentType: 'video/webm', upsert: true })
                    if (result.error) throw result.error
                  }).catch(() => { setRecovery(true) })
                }).catch(error => { recordingError.current = error; c.ui.patch({ error: `Recording storage failed: ${String(error)}` }); void stop() })
              }
              capture.onerror = event => { recordingError.current = event; void stop() }
              capture.start(2000); setStatus('Live · recording locally')
            } catch (error) { recordingError.current = error; void stop() }
          }, 500)
        },
        onData: raw => { try { const event = JSON.parse(raw); if (event.type === 'chunk') setTelemetry(`Chunk ${event.chunk_index + 1} · ${Number(event.buffer_depth_seconds).toFixed(1)}s buffered`); if (event.type === 'error') { c.ui.patch({ error: event.message ?? 'Live provider error' }); void stop() } } catch { /* Unknown alpha telemetry does not affect recording. */ } },
        onError: error => { c.ui.patch({ error: String(error) }); void stop() },
      })
      connection.current = handle; version.current = 1; setActive(true)
      handle.send({ type: 'configure', protocol_version: 1, prompt_version: 1, prompt: config.prompt, image_url: config.imageUrl, resolution: config.resolution, aspect_ratio: config.aspectRatio })
      expiry.current = setTimeout(() => void stop(), Math.max(0, Date.parse(config.expiresAt) - Date.now() - 2000))
    } catch (error) { c.ui.patch({ error: String(error) }); setStatus('Could not start live Director'); await connection.current?.close(); setActive(false) }
    finally { setBusy(false) }
  }
  return <section className="director-live-panel"><div className="director-panel-heading"><strong>Live Director · beta</strong><span>{status}</span></div><p>Starts from your chosen frame. Maximum two minutes; provider minimum billing is one minute. Conservative session budget: $9.60. Recorded footage is saved when you stop.</p>{active && <video ref={video} controls autoPlay playsInline className="director-live-video" />}<p aria-live="polite">{telemetry}</p><div className="director-inline-actions"><button disabled={!c.canRun || c.ui.busy || busy || active || !c.ui.settings.firstFrameAssetKey || c.state.takes.some(t => ['queued','preparing','generating','saving'].includes(t.status))} onClick={() => void start()}>Start live</button>{active && <><button disabled={busy || !c.ui.direction.trim()} onClick={() => { connection.current?.send({ type: 'prompt', prompt_version: ++version.current, prompt: c.ui.direction }); setTelemetry(`Direction ${version.current} sent`) }}>Send next direction</button><button disabled={busy} onClick={() => void stop()}>Stop and save</button></>}{recovery && <button disabled={busy || c.ui.busy} onClick={() => void recover()}>Recover recording</button>}</div></section>
}
