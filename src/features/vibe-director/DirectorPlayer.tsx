import { useEffect, useMemo, useRef, useState } from 'react'
import { FilmSlate, Play, Scissors, Waveform } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'
import { isActiveTakeStatus } from './useDirectorController'
import { formatSeconds, takeStatusLabel, takeNumber } from './directorPresentation'

export function DirectorPlayer({ controller: c }: { controller: DirectorController }) {
  const video = useRef<HTMLVideoElement>(null)
  const [playEdit, setPlayEdit] = useState(false)
  const [clipIndex, setClipIndex] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const advancing = useRef(false)
  const edit = c.state.edits.find((e) => e.id === c.state.session?.active_edit_id)
  const clips = edit?.clips ?? []
  const clip = playEdit ? clips[clipIndex] : undefined
  const take = c.state.takes.find((t) => t.id === (clip?.takeId ?? c.ui.takeId))
  const url = take?.asset_key ? c.urls[take.asset_key] : undefined
  const job = c.state.jobs.find((j) => j.take_id === take?.id)
  const generating = Boolean(take && isActiveTakeStatus(take.status))
  const duration = take?.duration_seconds ?? 0

  useEffect(() => {
    if (video.current && c.ui.seek) {
      video.current.currentTime = c.ui.seek.time
      setPlayhead(c.ui.seek.time)
    }
  }, [c.ui.seek])
  useEffect(() => {
    setPlayEdit(false)
    setClipIndex(0)
    setPlayhead(0)
  }, [c.ui.takeId, c.state.session?.active_edit_id])

  const nextClip = () => {
    if (!playEdit || advancing.current) return
    advancing.current = true
    if (clipIndex + 1 < clips.length) setClipIndex((i) => i + 1)
    else {
      video.current?.pause()
      setPlayEdit(false)
      setClipIndex(0)
    }
  }
  useEffect(() => {
    advancing.current = false
    if (!playEdit || !video.current || !clip) return
    video.current.currentTime = clip.inSeconds
    void video.current.play().catch(() => {})
  }, [clipIndex, playEdit, clip?.inSeconds])

  // Edit-relative playhead and clip markers for the scrubber while previewing the edit.
  const editTimeline = useMemo(() => {
    let offset = 0
    return clips.map((entry) => {
      const start = offset
      offset += entry.outSeconds - entry.inSeconds
      return { id: entry.id, start, end: offset }
    })
  }, [clips])
  const editTotal = editTimeline.at(-1)?.end ?? 0
  const editPlayhead = playEdit && clip ? (editTimeline[clipIndex]?.start ?? 0) + Math.max(0, playhead - clip.inSeconds) : playhead
  const scrubMax = playEdit ? editTotal : duration
  const nextTake = c.state.takes.find((t) => t.id === clips[clipIndex + 1]?.takeId)
  const nextUrl = nextTake?.asset_key ? c.urls[nextTake.asset_key] : undefined

  const seekTo = (value: number) => {
    if (playEdit) {
      const target = editTimeline.findIndex((entry) => value >= entry.start && value <= entry.end)
      const index = target < 0 ? Math.max(0, editTimeline.length - 1) : target
      const entry = editTimeline[index]
      const local = clips[index] ? clips[index].inSeconds + (value - (entry?.start ?? 0)) : 0
      if (index !== clipIndex) setClipIndex(index)
      if (video.current) video.current.currentTime = local
      setPlayhead(local)
      return
    }
    if (video.current) video.current.currentTime = value
    setPlayhead(value)
  }

  const canBranch = Boolean(take && take.status === 'completed' && clips.some((x) => x.takeId === take.id) && !c.ui.busy)
  const branchSeconds = Math.min(video.current?.currentTime ?? playhead, Math.max(0, duration))
  const number = take ? takeNumber(c.state.takes, take.id) : null

  return (
    <section className="director-player" aria-label="Video preview">
      <div className="director-panel-heading">
        <span>{playEdit ? 'Edit preview' : number ? `Take ${number}` : 'Preview'}</span>
        <span className="director-muted">{take ? `${take.settings.resolution} · ${take.settings.aspectRatio}${take.duration_seconds ? ` · ${formatSeconds(take.duration_seconds)}` : ''}` : 'Ready to direct'}</span>
      </div>
      <div className="director-screen">
        {playEdit && nextUrl ? <video src={nextUrl} preload="auto" muted hidden aria-hidden="true" /> : null}
        {url ? (
          <video
            key={take?.id}
            ref={video}
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              if (!playEdit && c.ui.seek && video.current) video.current.currentTime = c.ui.seek.time
              if (playEdit && clip && video.current) {
                video.current.currentTime = clip.inSeconds
                void video.current.play().catch(() => {})
              }
            }}
            onTimeUpdate={() => {
              const time = video.current?.currentTime ?? 0
              setPlayhead(time)
              if (clip && time >= clip.outSeconds - 0.03) nextClip()
            }}
            onEnded={nextClip}
            onError={() => {
              c.refreshMedia()
              c.ui.patch({ error: 'Refreshing this video’s media link. Retry playback when it loads.' })
            }}
          />
        ) : (
          <div className={`director-player-empty ${generating ? 'is-generating' : ''}`}>
            <FilmSlate size={44} weight="light" aria-hidden="true" />
            <strong>{take ? takeStatusLabel(take, job) : 'Your next take starts here'}</strong>
            <p>{job?.error_message || (generating ? 'You can keep reviewing saved takes while this one renders.' : take?.error_message || 'Pick a scene, assemble the cast, add direction, and generate a take.')}</p>
            {job?.phase === 'attention' ? <button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.recover(job.run_id)}>Recover saved job</button> : null}
            {generating ? <div className="director-progress" aria-label="Generation in progress" /> : null}
          </div>
        )}
      </div>
      <div className="director-scrub">
        <input
          type="range"
          aria-label={playEdit ? 'Edit position' : 'Take position'}
          min={0}
          max={Math.max(scrubMax, 0.04)}
          step={0.04}
          value={Math.min(editPlayhead, Math.max(scrubMax, 0.04))}
          disabled={!url}
          onChange={(event) => seekTo(Number(event.target.value))}
        />
        {playEdit && editTotal > 0 ? (
          <div className="director-scrub-markers" aria-hidden="true">
            {editTimeline.slice(1).map((entry) => <span key={entry.id} style={{ left: `${(entry.start / editTotal) * 100}%` }} />)}
          </div>
        ) : null}
      </div>
      <div className="director-player-toolbar">
        <span className="director-time">{formatSeconds(editPlayhead, 2)} / {formatSeconds(scrubMax, 2)}</span>
        <button type="button" className="ghost-button compact" disabled={!clips.length} onClick={() => { setClipIndex(0); setPlayEdit(true) }}><Play size={15} /> Play edit</button>
        <button type="button" className="ghost-button compact" disabled={!canBranch} title="Continue from this exact frame" onClick={() => take && void c.generate({ parentTakeId: take.id, branchSeconds, branchMode: 'frame' })}><Scissors size={15} /> Branch here</button>
        <button type="button" className="ghost-button compact" disabled={!canBranch || branchSeconds < 2 || c.ui.settings.speed === 'turbo'} title="Continue using the preceding motion as a video reference (extra reference cost, H3 Max only)" onClick={() => take && void c.generate({ parentTakeId: take.id, branchSeconds, branchMode: 'motion' })}><Waveform size={15} /> Continue with motion</button>
      </div>
    </section>
  )
}
