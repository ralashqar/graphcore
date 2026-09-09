import { useEffect, useRef, useState } from 'react'
import { FilmSlate, Play, Scissors } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'

export function DirectorPlayer({ controller: c }: { controller: DirectorController }) {
  const video = useRef<HTMLVideoElement>(null)
  const [playEdit, setPlayEdit] = useState(false)
  const [clipIndex, setClipIndex] = useState(0)
  const [playhead,setPlayhead]=useState(0)
  const advancing=useRef(false)
  const edit = c.state.edits.find(e => e.id === c.state.session?.active_edit_id)
  const clip = playEdit ? edit?.clips[clipIndex] : undefined
  const take = c.state.takes.find(t => t.id === (clip?.takeId ?? c.ui.takeId))
  const url = take?.asset_key ? c.urls[take.asset_key] : undefined
  useEffect(() => { if (video.current && c.ui.seek) {video.current.currentTime = c.ui.seek.time;setPlayhead(c.ui.seek.time)} }, [c.ui.seek])
  useEffect(() => { setPlayEdit(false); setClipIndex(0);setPlayhead(0) }, [c.ui.takeId, c.state.session?.active_edit_id])
  const nextClip = () => {
    if (!playEdit || advancing.current) return
    advancing.current=true
    if (clipIndex + 1 < (edit?.clips.length ?? 0)) setClipIndex(i => i + 1)
    else { video.current?.pause(); setPlayEdit(false); setClipIndex(0) }
  }
  useEffect(() => {
    advancing.current=false
    if (!playEdit || !video.current || !clip) return
    video.current.currentTime = clip.inSeconds
    void video.current.play().catch(() => {})
  }, [clipIndex, playEdit, clip?.inSeconds])
  const generating = take && ['queued', 'preparing', 'generating', 'saving'].includes(take.status)
  const job=c.state.jobs.find(j=>j.take_id===take?.id)
  const phaseLabels:Record<string,string>={prepare:'Preparing references',submit:'Waiting for video provider',await_provider:'Generating footage',ingest:'Saving footage',finalize:'Finishing saved take',attention:'This take needs recovery'}
  const nextTake=c.state.takes.find(t=>t.id===edit?.clips[clipIndex+1]?.takeId)
  const nextUrl=nextTake?.asset_key?c.urls[nextTake.asset_key]:undefined
  return <section className="director-player" aria-label="Video preview">
    <div className="director-panel-heading"><span>{playEdit ? 'Edit preview' : 'Selected take'}</span><span>{take ? `${take.settings.resolution} · ${take.settings.aspectRatio}` : 'Ready to direct'}</span></div>
    <div className="director-screen">
      {playEdit && nextUrl && <video src={nextUrl} preload="auto" muted hidden aria-hidden="true" />}
      {url ? <video key={take?.id} ref={video} src={url} controls playsInline preload="metadata" onLoadedMetadata={() => {
        if (!playEdit && c.ui.seek && video.current) video.current.currentTime = c.ui.seek.time
        if (playEdit && clip && video.current) { video.current.currentTime = clip.inSeconds; void video.current.play().catch(() => {}) }
      }} onTimeUpdate={() => {
        const time = video.current?.currentTime ?? 0
        setPlayhead(time)
        if (clip && time >= clip.outSeconds - 0.03) nextClip()
      }} onEnded={nextClip} onError={() => {c.refreshMedia();c.ui.patch({ error: 'Refreshing this video’s media link. Retry playback when it loads.' })}} /> : <div className={`director-player-empty ${generating ? 'is-generating' : ''}`}>
        <FilmSlate size={44} weight="light" />
        <strong>{job && phaseLabels[job.phase] ? phaseLabels[job.phase] : generating ? `${take.status === 'queued' ? 'Queued' : take.status === 'preparing' ? 'Preparing references' : take.status === 'saving' ? 'Saving footage' : 'Generating footage'}` : take?.status === 'failed' ? 'Generation did not finish' : 'Your next take starts here'}</strong>
        <p>{job?.error_message || (generating ? 'You can keep reviewing your saved takes.' : take?.error_message || 'Choose your scene, add direction, and generate a take.')}</p>
        {job?.phase==='attention' && <button disabled={c.ui.busy} onClick={()=>void c.recover(job.run_id)}>Recover saved job</button>}
        {generating && <div className="director-progress" aria-label="Generation in progress" />}
      </div>}
    </div>
    <div className="director-player-toolbar"><span className="director-time">{playhead.toFixed(2)}s {take?.duration_seconds ? `/ ${take.duration_seconds.toFixed(2)}s` : ''}</span>
      <button disabled={!edit?.clips.length} onClick={() => { setClipIndex(0); setPlayEdit(true) }}><Play size={16} /> Play edit</button>
      <button disabled={c.ui.busy || take?.status !== 'completed' || !edit?.clips.some(x => x.takeId === take.id)} onClick={() => take && void c.generate({ parentTakeId: take.id, branchSeconds: video.current?.currentTime??playhead, branchMode: 'frame' })}><Scissors size={16} /> Branch here</button>
      {playhead>=2 && take?.status==='completed' && <button disabled={c.ui.busy || !edit?.clips.some(x=>x.takeId===take.id)} onClick={()=>void c.generate({parentTakeId:take.id,branchSeconds:video.current?.currentTime??playhead,branchMode:'motion'})}>Continue with motion · extra reference cost</button>}
    </div>
  </section>
}
