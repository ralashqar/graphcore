import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetPreviewUrl, resolveAssetSourceUrl } from '../../domain/assets.ts'
import {
  findTimelineShotAtSeconds,
  findTimelineTakeAtSeconds,
  type CinematicTimelineProjection,
} from '../../domain/cinematicTimelineProjection.ts'
import type {
  CinematicDirectorNotePreviewResponse,
  CinematicDirectorNoteScope,
  CinematicDirectorPatchPreview,
} from '../../domain/cinematicDirectorNotes.ts'
import type { AssetDefinition } from '../../domain/graphcore.ts'
import { EntityIcon } from '../../shared/entityIcons.tsx'

type CinematicTimelinePlayerProps = {
  assets: AssetDefinition[]
  projection: CinematicTimelineProjection | null
  title?: string
  subtitle?: string
  emptyMessage?: string
  directorNotes?: {
    onPreview: (request: { note: string; scope: CinematicDirectorNoteScope }) => Promise<CinematicDirectorNotePreviewResponse>
    onApply: (preview: CinematicDirectorPatchPreview) => Promise<void>
    canUndoLast?: boolean
    undoLabel?: string
    onUndoLast?: () => Promise<void>
  }
}

type ResolvedTimelineMedia = {
  asset: AssetDefinition
  kind: 'image' | 'video'
  url: string
}

const BASE_PIXELS_PER_SECOND = 84
const MIN_PIXELS_PER_SECOND = 36
const MAX_PIXELS_PER_SECOND = 196
const ZOOM_STEP_PIXELS = 18

function formatTimecode(seconds: number) {
  const total = Math.max(0, seconds)
  const wholeSeconds = Math.floor(total)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainderSeconds = wholeSeconds % 60
  const frames = Math.floor((total - wholeSeconds) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(remainderSeconds).padStart(2, '0')}.${frames}`
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button'
}

function resolveTimelineMedia(assets: AssetDefinition[], assetKeys: string[], preferredKind?: 'image' | 'video' | 'placeholder'): ResolvedTimelineMedia | null {
  const candidates = assetKeys
    .map((assetKey) => assets.find((asset) => asset.key === assetKey) ?? null)
    .filter((asset): asset is AssetDefinition => Boolean(asset))
  const orderedCandidates = preferredKind === 'video'
    ? [...candidates.filter((asset) => asset.kind === 'video'), ...candidates.filter((asset) => asset.kind !== 'video')]
    : candidates

  for (const asset of orderedCandidates) {
    const url = resolveAssetSourceUrl(asset) || resolveAssetPreviewUrl(asset)
    if (!url) continue
    return {
      asset,
      kind: asset.kind === 'video' ? 'video' : 'image',
      url,
    }
  }
  return null
}

function timelineTrackWidth(projection: CinematicTimelineProjection | null, pixelsPerSecond: number) {
  return Math.max(960, (projection?.totalDurationSeconds ?? 0) * pixelsPerSecond)
}

export function CinematicTimelinePlayer({
  assets,
  directorNotes,
  projection,
  title = 'Cinematic Timeline',
  subtitle = 'Read-only production preview',
  emptyMessage = 'Shot planning has not produced a timeline yet.',
}: CinematicTimelinePlayerProps) {
  const [playheadSeconds, setPlayheadSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(BASE_PIXELS_PER_SECOND)
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null)
  const timelineScrollShellRef = useRef<HTMLDivElement | null>(null)
  const playbackFrameRef = useRef<number | null>(null)
  const playbackStartedAtRef = useRef<number | null>(null)
  const playbackOriginSecondsRef = useRef(0)
  const playheadSecondsRef = useRef(0)
  const pixelsPerSecondRef = useRef(BASE_PIXELS_PER_SECOND)
  const scrubStateRef = useRef<{ isDragging: boolean } | null>(null)
  const [directorScopeMode, setDirectorScopeMode] = useState<'shot' | 'shot_range' | 'scene'>('shot')
  const [directorSelectedShotIds, setDirectorSelectedShotIds] = useState<string[]>([])
  const [directorNoteText, setDirectorNoteText] = useState('')
  const [directorPreview, setDirectorPreview] = useState<CinematicDirectorPatchPreview | null>(null)
  const [directorBusy, setDirectorBusy] = useState(false)
  const [directorError, setDirectorError] = useState<string | null>(null)
  const directorPreviewRef = useRef<CinematicDirectorPatchPreview | null>(null)

  const activeShot = projection ? findTimelineShotAtSeconds(projection, playheadSeconds) : null
  const activeTake = projection ? findTimelineTakeAtSeconds(projection, playheadSeconds) : null
  const currentSubtitle = activeShot?.subtitleCues.find((cue) => playheadSeconds >= cue.startSeconds && playheadSeconds <= cue.endSeconds) ?? null
  const currentMedia = resolveTimelineMedia(
    assets,
    activeShot?.previewAssetKeys ?? activeTake?.previewAssetKeys ?? [],
    activeShot?.previewKind ?? activeTake?.previewKind,
  )
  const timelineWidth = timelineTrackWidth(projection, pixelsPerSecond)
  const zoomPercent = Math.round((pixelsPerSecond / BASE_PIXELS_PER_SECOND) * 100)
  const activeRefs = useMemo(() => activeShot?.activeRefIds ?? [], [activeShot])
  const directorScopeSummary = directorScopeMode === 'scene'
    ? 'Whole scene'
    : directorScopeMode === 'shot_range'
      ? `${directorSelectedShotIds.length || 1} selected shots`
      : activeShot?.title ?? 'Active shot'

  const selectShotForDirection = useCallback((shotId: string) => {
    setDirectorPreview(null)
    directorPreviewRef.current = null
    if (directorScopeMode === 'scene') return
    if (directorScopeMode === 'shot_range') {
      setDirectorSelectedShotIds((current) => current.includes(shotId)
        ? current.filter((id) => id !== shotId)
        : [...current, shotId])
      return
    }
    setDirectorSelectedShotIds([shotId])
  }, [directorScopeMode])

  const buildDirectorScope = useCallback((): CinematicDirectorNoteScope | null => {
    if (!projection) return null
    if (directorScopeMode === 'scene') return { type: 'scene' }
    const fallbackShotId = activeShot?.id ?? projection.shots[0]?.id
    if (directorScopeMode === 'shot_range') {
      const selectedIds = directorSelectedShotIds.length > 0 ? directorSelectedShotIds : fallbackShotId ? [fallbackShotId] : []
      return selectedIds.length > 0 ? { type: 'shot_range', shotIds: selectedIds } : null
    }
    const shotId = directorSelectedShotIds[0] ?? fallbackShotId
    return shotId ? { type: 'shot', shotId } : null
  }, [activeShot?.id, directorScopeMode, directorSelectedShotIds, projection])

  const previewDirectorNote = useCallback(async () => {
    if (!directorNotes) return
    const note = directorNoteText.trim()
    const scope = buildDirectorScope()
    if (!note || !scope) return
    setDirectorBusy(true)
    setDirectorError(null)
    setDirectorPreview(null)
    directorPreviewRef.current = null
    try {
      const response = await directorNotes.onPreview({ note, scope })
      setDirectorPreview(response.preview)
      directorPreviewRef.current = response.preview
    } catch (error) {
      setDirectorError(error instanceof Error ? error.message : 'Could not preview director note.')
    } finally {
      setDirectorBusy(false)
    }
  }, [buildDirectorScope, directorNoteText, directorNotes])

  const applyDirectorPreview = useCallback(async () => {
    if (!directorNotes) return
    const preview = directorPreview ?? directorPreviewRef.current
    if (!preview) {
      setDirectorError('Preview the director note before applying it.')
      return
    }
    setDirectorBusy(true)
    setDirectorError(null)
    try {
      await directorNotes.onApply(preview)
      setDirectorNoteText('')
      setDirectorPreview(null)
      directorPreviewRef.current = null
    } catch (error) {
      setDirectorError(error instanceof Error ? error.message : 'Could not apply director note.')
    } finally {
      setDirectorBusy(false)
    }
  }, [directorNotes, directorPreview])

  const undoLastDirectorNote = useCallback(async () => {
    if (!directorNotes?.onUndoLast) return
    setDirectorBusy(true)
    setDirectorError(null)
    try {
      await directorNotes.onUndoLast()
      setDirectorNoteText('')
      setDirectorPreview(null)
    } catch (error) {
      setDirectorError(error instanceof Error ? error.message : 'Could not undo the last director edit.')
    } finally {
      setDirectorBusy(false)
    }
  }, [directorNotes])

  const setClampedPlayhead = useCallback((nextSeconds: number) => {
    const totalDurationSeconds = projection?.totalDurationSeconds ?? 0
    setPlayheadSeconds(Math.min(totalDurationSeconds, Math.max(0, nextSeconds)))
  }, [projection])

  const updatePlayheadFromClientX = useCallback((clientX: number) => {
    if (!timelineCanvasRef.current || !projection) return
    const bounds = timelineCanvasRef.current.getBoundingClientRect()
    const seconds = (clientX - bounds.left) / pixelsPerSecondRef.current
    setClampedPlayhead(seconds)
  }, [projection, setClampedPlayhead])

  const adjustScrollForPointerEdge = useCallback((clientX: number) => {
    const shell = timelineScrollShellRef.current
    if (!shell) return
    const bounds = shell.getBoundingClientRect()
    const edgeThreshold = 72
    if (clientX > bounds.right - edgeThreshold) {
      shell.scrollLeft += Math.min(32, Math.max(8, clientX - (bounds.right - edgeThreshold)))
      return
    }
    if (clientX < bounds.left + edgeThreshold) {
      shell.scrollLeft -= Math.min(32, Math.max(8, (bounds.left + edgeThreshold) - clientX))
    }
  }, [])

  const togglePlayback = useCallback(() => {
    if (!projection || projection.totalDurationSeconds <= 0) return
    setIsPlaying((current) => !current)
  }, [projection])

  const stepPlayhead = useCallback((deltaSeconds: number) => {
    setIsPlaying(false)
    setClampedPlayhead(playheadSeconds + deltaSeconds)
  }, [playheadSeconds, setClampedPlayhead])

  const jumpPlayhead = useCallback((nextSeconds: number) => {
    setIsPlaying(false)
    setClampedPlayhead(nextSeconds)
  }, [setClampedPlayhead])

  const zoomTimeline = useCallback((direction: 'in' | 'out') => {
    setPixelsPerSecond((current) => {
      const delta = direction === 'in' ? ZOOM_STEP_PIXELS : -ZOOM_STEP_PIXELS
      return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, current + delta))
    })
  }, [])

  const fitTimelineToViewport = useCallback(() => {
    const shell = timelineScrollShellRef.current
    if (!shell || !projection || projection.totalDurationSeconds <= 0) return
    const nextPixelsPerSecond = Math.floor((shell.clientWidth - 48) / projection.totalDurationSeconds)
    setPixelsPerSecond(Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, nextPixelsPerSecond)))
  }, [projection])

  const startScrub = useCallback((clientX: number) => {
    setIsPlaying(false)
    scrubStateRef.current = { isDragging: true }
    updatePlayheadFromClientX(clientX)
  }, [updatePlayheadFromClientX])

  useEffect(() => {
    playheadSecondsRef.current = playheadSeconds
  }, [playheadSeconds])

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond
  }, [pixelsPerSecond])

  useEffect(() => {
    if (!projection) {
      setPlayheadSeconds(0)
      setIsPlaying(false)
      return
    }
    setPlayheadSeconds((current) => Math.min(current, projection.totalDurationSeconds))
  }, [projection])

  useEffect(() => {
    if (!activeShot || directorScopeMode !== 'shot') return
    setDirectorSelectedShotIds((current) => current[0] === activeShot.id ? current : [activeShot.id])
  }, [activeShot, directorScopeMode])

  useEffect(() => {
    if (!projection) return
    if (!isPlaying) {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current)
        playbackFrameRef.current = null
      }
      playbackStartedAtRef.current = null
      playbackOriginSecondsRef.current = playheadSecondsRef.current
      return
    }

    playbackOriginSecondsRef.current = playheadSecondsRef.current >= projection.totalDurationSeconds ? 0 : playheadSecondsRef.current
    if (playheadSecondsRef.current >= projection.totalDurationSeconds) {
      setPlayheadSeconds(0)
    }
    playbackStartedAtRef.current = null

    const tick = (timestamp: number) => {
      if (playbackStartedAtRef.current === null) playbackStartedAtRef.current = timestamp
      const elapsedSeconds = (timestamp - playbackStartedAtRef.current) / 1000
      const nextSeconds = playbackOriginSecondsRef.current + elapsedSeconds
      if (nextSeconds >= projection.totalDurationSeconds) {
        setPlayheadSeconds(projection.totalDurationSeconds)
        setIsPlaying(false)
        playbackFrameRef.current = null
        return
      }
      setPlayheadSeconds(nextSeconds)
      playbackFrameRef.current = window.requestAnimationFrame(tick)
    }

    playbackFrameRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current)
        playbackFrameRef.current = null
      }
    }
  }, [isPlaying, projection])

  useEffect(() => {
    const shell = timelineScrollShellRef.current
    if (!shell) return
    const playheadOffset = playheadSeconds * pixelsPerSecond
    const leftEdge = shell.scrollLeft + 96
    const rightEdge = shell.scrollLeft + shell.clientWidth - 96
    const behavior = isPlaying ? 'auto' : 'smooth'
    if (playheadOffset < leftEdge) {
      shell.scrollTo({ left: Math.max(0, playheadOffset - 96), behavior })
      return
    }
    if (playheadOffset > rightEdge) {
      shell.scrollTo({ left: Math.max(0, playheadOffset - shell.clientWidth + 96), behavior })
    }
  }, [isPlaying, pixelsPerSecond, playheadSeconds])

  useEffect(() => {
    const shell = timelineScrollShellRef.current
    if (!shell) return
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setPixelsPerSecond((current) => {
        const delta = event.deltaY < 0 ? ZOOM_STEP_PIXELS : -ZOOM_STEP_PIXELS
        return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, current + delta))
      })
    }
    shell.addEventListener('wheel', handleWheel, { passive: false })
    return () => shell.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      togglePlayback()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayback])

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      if (!scrubStateRef.current?.isDragging) return
      adjustScrollForPointerEdge(event.clientX)
      updatePlayheadFromClientX(event.clientX)
    }
    function handlePointerUp() {
      scrubStateRef.current = null
    }
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [adjustScrollForPointerEdge, updatePlayheadFromClientX])

  if (!projection) {
    return (
      <div className="timeline-surface">
        <div className="inline-note">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="timeline-surface timeline-player">
      <div className="timeline-preview-shell">
        <div className="timeline-preview-stage">
          {currentMedia?.kind === 'video' ? (
            <video
              key={currentMedia.asset.key}
              className="timeline-preview-image"
              controls
              muted
              playsInline
              src={currentMedia.url}
            />
          ) : currentMedia ? (
            <img alt={currentMedia.asset.name} className="timeline-preview-image" src={currentMedia.url} />
          ) : (
            <div className="timeline-preview-placeholder">
              <EntityIcon id="cinematic" />
              <strong>{activeShot?.title ?? title}</strong>
              <span>{activeShot?.beat ?? 'Panels, keyframes, and videos will appear here as the workflow completes.'}</span>
            </div>
          )}
          <div className="timeline-preview-overlay">
            <div className="timeline-preview-meta">
              <span className="eyebrow">{subtitle}</span>
              <strong>{activeShot?.title ?? title}</strong>
              <span>
                {activeShot
                  ? `${formatTimecode(activeShot.startSeconds)} - ${formatTimecode(activeShot.endSeconds)} · ${activeShot.durationSeconds.toFixed(1)}s`
                  : `${projection.shots.length} shots`}
              </span>
            </div>
            {currentSubtitle ? (
              <div className="timeline-preview-subtitle">
                <span>{currentSubtitle.type === 'caption' ? 'Caption' : currentSubtitle.label}</span>
                <strong>{currentSubtitle.text}</strong>
              </div>
            ) : null}
          </div>
        </div>

        <div className="timeline-transport">
          <div className="timeline-transport-copy">
            <span className="eyebrow">Transport</span>
            <strong>{formatTimecode(playheadSeconds)}</strong>
            <span>{activeTake ? `${activeTake.title} · ${activeTake.durationSeconds.toFixed(1)}s` : 'No active take'}</span>
            <span>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
          <div className="timeline-transport-actions">
            <button className="ghost-button compact" onClick={() => jumpPlayhead(0)} type="button">Start</button>
            <button className="ghost-button compact" onClick={() => stepPlayhead(-1)} type="button">-1s</button>
            <button className="primary-button compact" onClick={togglePlayback} type="button">{isPlaying ? 'Pause' : 'Play'}</button>
            <button className="ghost-button compact" onClick={() => stepPlayhead(1)} type="button">+1s</button>
            <button className="ghost-button compact" onClick={() => jumpPlayhead(projection.totalDurationSeconds)} type="button">End</button>
          </div>
          <div className="timeline-zoom-row">
            <span className="eyebrow">Zoom</span>
            <div className="timeline-zoom-controls">
              <button className="ghost-button compact" disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND} onClick={() => zoomTimeline('out')} type="button">-</button>
              <input
                className="timeline-zoom-range"
                max={MAX_PIXELS_PER_SECOND}
                min={MIN_PIXELS_PER_SECOND}
                onChange={(event) => setPixelsPerSecond(Number(event.target.value))}
                step={2}
                type="range"
                value={pixelsPerSecond}
              />
              <button className="ghost-button compact" disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND} onClick={() => zoomTimeline('in')} type="button">+</button>
              <button className="ghost-button compact" onClick={fitTimelineToViewport} type="button">Fit</button>
              <strong>{zoomPercent}%</strong>
              <span>Space toggles playback</span>
            </div>
          </div>
          <input
            className="timeline-range"
            max={Math.max(0, projection.totalDurationSeconds)}
            min={0}
            onChange={(event) => setClampedPlayhead(Number(event.target.value))}
            step={0.1}
            type="range"
            value={playheadSeconds}
          />
        </div>
      </div>

      <div className="timeline-layout">
        <div className="timeline-scroll-shell" ref={timelineScrollShellRef}>
          <div className="timeline-scroll">
            <div className="timeline-canvas" ref={timelineCanvasRef} style={{ width: timelineWidth }}>
              <button
                aria-label="Drag timeline playhead"
                className="timeline-playhead-scrubber"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startScrub(event.clientX)
                }}
                style={{ left: playheadSeconds * pixelsPerSecond }}
                type="button"
              >
                <span className="timeline-playhead-grip" />
                <span className="timeline-playhead-line" />
              </button>

              <div
                className="timeline-ruler"
                onMouseDown={(event) => {
                  event.preventDefault()
                  startScrub(event.clientX)
                }}
              >
                {Array.from({ length: Math.max(1, Math.ceil(projection.totalDurationSeconds) + 1) }).map((_, index) => (
                  <div className="timeline-ruler-tick" key={`tick-${index}`} style={{ left: index * pixelsPerSecond }}>
                    <span>{formatTimecode(index)}</span>
                  </div>
                ))}
              </div>

              <div className="timeline-track-shell">
                <div className="timeline-track-label">
                  <span className="eyebrow">Shots</span>
                  <strong>{projection.shots.length}</strong>
                </div>
                <div
                  className="timeline-track timeline-track-shots"
                  onMouseDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    startScrub(event.clientX)
                  }}
                >
                  {projection.shots.map((shot) => {
                    const preview = resolveTimelineMedia(assets, shot.previewAssetKeys, shot.previewKind)
                    const isSelectedForDirection = directorSelectedShotIds.includes(shot.id)
                    return (
                      <button
                        className={[
                          'timeline-shot-block',
                          shot.id === activeShot?.id ? 'is-active' : '',
                          isSelectedForDirection ? 'is-director-selected' : '',
                        ].filter(Boolean).join(' ')}
                        key={shot.id}
                        onClick={() => {
                          setClampedPlayhead(shot.startSeconds)
                          selectShotForDirection(shot.id)
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        style={{
                          left: shot.startSeconds * pixelsPerSecond,
                          width: Math.max(84, shot.durationSeconds * pixelsPerSecond),
                        }}
                        type="button"
                      >
                        {preview?.kind === 'image' ? <img alt="" className="timeline-shot-thumb" src={preview.url} /> : null}
                        <div className="timeline-shot-block-overlay" />
                        <div className="timeline-shot-copy">
                          <strong>{shot.title}</strong>
                          <span>{shot.shotType} · {shot.durationSeconds.toFixed(1)}s</span>
                          <span>{shot.previewKind === 'video' ? 'Video ready' : shot.previewAssetKey ? 'Still preview' : 'Awaiting media'}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="timeline-track-shell">
                <div className="timeline-track-label">
                  <span className="eyebrow">Scene</span>
                  <strong>{projection.takes.length}</strong>
                </div>
                <div
                  className="timeline-track timeline-track-takes"
                  onMouseDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    startScrub(event.clientX)
                  }}
                >
                  {projection.takes.map((take) => (
                    <button
                      className={take.id === activeTake?.id ? 'timeline-take-block is-active' : 'timeline-take-block'}
                      key={take.id}
                      onClick={() => setClampedPlayhead(take.startSeconds)}
                      onMouseDown={(event) => event.stopPropagation()}
                      style={{
                        left: take.startSeconds * pixelsPerSecond,
                        width: Math.max(120, take.durationSeconds * pixelsPerSecond),
                      }}
                      type="button"
                    >
                      <strong>{take.title}</strong>
                      <span>{take.durationSeconds.toFixed(1)}s · {take.shotIds.length} shots</span>
                      <span>Read-only timing preview</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="timeline-track-shell">
                <div className="timeline-track-label">
                  <span className="eyebrow">Dialogue / Captions</span>
                  <strong>{projection.dialogueCues.length}</strong>
                </div>
                <div
                  className="timeline-track timeline-track-cues"
                  onMouseDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    startScrub(event.clientX)
                  }}
                >
                  {projection.dialogueCues.map((cue) => (
                    <div
                      className={`timeline-cue ${cue.type === 'caption' ? 'timeline-cue-caption' : 'timeline-cue-dialogue'}`}
                      key={cue.id}
                      style={{
                        left: cue.startSeconds * pixelsPerSecond,
                        width: Math.max(48, (cue.endSeconds - cue.startSeconds) * pixelsPerSecond),
                      }}
                    >
                      <span>{cue.label}</span>
                      <strong>{cue.text}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="timeline-track-shell">
                <div className="timeline-track-label">
                  <span className="eyebrow">Audio Plan</span>
                  <strong>{projection.audioCues.length}</strong>
                </div>
                <div
                  className="timeline-track timeline-track-cues"
                  onMouseDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    startScrub(event.clientX)
                  }}
                >
                  {projection.audioCues.map((cue) => (
                    <div
                      className="timeline-cue timeline-cue-audio"
                      key={cue.id}
                      style={{
                        left: cue.startSeconds * pixelsPerSecond,
                        width: Math.max(48, (cue.endSeconds - cue.startSeconds) * pixelsPerSecond),
                      }}
                    >
                      <span>{cue.label}</span>
                      <strong>{cue.text}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="timeline-sidebar">
          <div className="timeline-sidebar-section">
            <span className="eyebrow">Selected Shot</span>
            <h3>{activeShot?.title ?? 'No shot selected'}</h3>
            {activeShot ? (
              <>
                <div className="inline-note">
                  {formatTimecode(activeShot.startSeconds)} - {formatTimecode(activeShot.endSeconds)} · {activeShot.durationSeconds.toFixed(1)}s · {activeShot.shotType}
                </div>
                <div className="inline-note">{activeShot.beat}</div>
                <div className="outputs-script-meta">
                  <span>{activeShot.previewKind === 'video' ? 'Video ready' : activeShot.previewAssetKey ? 'Still ready' : 'Media pending'}</span>
                  <span>{activeShot.subtitleCues.length} dialogue/caption cues</span>
                  <span>{activeShot.activeRefIds.length} refs</span>
                </div>
              </>
            ) : null}
          </div>

          <div className="timeline-sidebar-section">
            <span className="eyebrow">Active References</span>
            <h3>{activeRefs.length}</h3>
            <div className="timeline-ingredient-list">
              {activeRefs.length > 0 ? activeRefs.map((refId) => (
                <div className="timeline-ingredient" key={refId}>
                  <EntityIcon id="asset" />
                  <div>
                    <strong>{refId}</strong>
                    <span>canonical reference</span>
                  </div>
                </div>
              )) : <div className="inline-note">Scrub to a shot with linked characters, locations, or props.</div>}
            </div>
          </div>

          {directorNotes ? (
            <div className="timeline-sidebar-section timeline-director-panel">
              <span className="eyebrow">Direct</span>
              <h3>Director Notes</h3>
              <div className="timeline-director-scope-row" role="group" aria-label="Director note scope">
                {(['shot', 'shot_range', 'scene'] as const).map((scopeMode) => (
                  <button
                    className={directorScopeMode === scopeMode ? 'timeline-director-scope is-active' : 'timeline-director-scope'}
                    key={scopeMode}
                    onClick={() => {
                      setDirectorScopeMode(scopeMode)
                      setDirectorPreview(null)
                      directorPreviewRef.current = null
                      if (scopeMode === 'scene') setDirectorSelectedShotIds([])
                      if (scopeMode === 'shot' && activeShot) setDirectorSelectedShotIds([activeShot.id])
                    }}
                    type="button"
                  >
                    {scopeMode === 'shot' ? 'Shot' : scopeMode === 'shot_range' ? 'Range' : 'Scene'}
                  </button>
                ))}
              </div>
              <div className="inline-note">{directorScopeSummary}</div>
              <textarea
                className="timeline-director-note-input"
                maxLength={4000}
                onChange={(event) => {
                  setDirectorNoteText(event.target.value)
                  setDirectorPreview(null)
                  directorPreviewRef.current = null
                }}
                placeholder="Make this lower angle, slower, more tense..."
                rows={4}
                value={directorNoteText}
              />
              {directorError ? <div className="outputs-error compact">{directorError}</div> : null}
              <button
                className="primary-button compact timeline-director-preview-button"
                disabled={directorBusy || directorNoteText.trim().length === 0}
                onClick={() => void previewDirectorNote()}
                type="button"
              >
                {directorBusy && !directorPreview ? 'Previewing...' : 'Preview Changes'}
              </button>
              {directorPreview ? (
                <div className={`timeline-director-preview is-${directorPreview.riskLevel}`}>
                  <strong>{directorPreview.summary || directorPreview.regenerationPlan.summary}</strong>
                  <span>{directorPreview.regenerationPlan.summary}</span>
                  <div className="outputs-script-meta">
                    <span>{directorPreview.operations.length} edits</span>
                    <span>{directorPreview.regenerationPlan.affectedShotIds.length} shots</span>
                    <span>{directorPreview.regenerationPlan.dirtyNodeKeys.length} dirty nodes</span>
                  </div>
                  {directorPreview.diagnostics.length > 0 ? (
                    <div className="inline-note">{directorPreview.diagnostics.slice(0, 2).join(' ')}</div>
                  ) : null}
                  <button
                    className="primary-button compact"
                    disabled={directorBusy || directorPreview.status === 'requires_scene_replan'}
                    onClick={() => void applyDirectorPreview()}
                    type="button"
                  >
                    {directorBusy ? 'Applying...' : 'Apply & Regenerate Animatic'}
                  </button>
                </div>
              ) : null}
              {directorNotes.canUndoLast && directorNotes.onUndoLast ? (
                <button
                  className="ghost-button compact timeline-director-undo-button"
                  disabled={directorBusy}
                  onClick={() => void undoLastDirectorNote()}
                  type="button"
                >
                  {directorBusy ? 'Working...' : directorNotes.undoLabel ?? 'Undo Last Director Edit'}
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
