import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetPreviewUrl } from '../../domain/assets.ts'
import {
  type CinematicRun,
  type CinematicSequence,
  type CinematicSettings,
} from '../../domain/cinematics.ts'
import {
  buildCinematicTimelineProjection,
  findTimelineShotAtSeconds,
  findTimelineTakeAtSeconds,
  type CinematicTimelineProjection,
  type CinematicTimelineShotClip,
  type CinematicTimelineTakeClip,
} from '../../domain/cinematicTimelineProjection.ts'
import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../../domain/graphcore.ts'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons.tsx'

type TimelineSurfaceProps = {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  currentGraph: GraphDefinition | null
  currentRuns: CinematicRun[]
  definitions: DefinitionBase[]
  generatingShotStillIds: Set<string>
  generatingShotVideoIds: Set<string>
  generatingTakeStillIds: Set<string>
  generatingTakeStoryboardIds: Set<string>
  generatingTakeVideoIds: Set<string>
  graphSettings: CinematicSettings
  sequence: CinematicSequence | null
  onGenerateShot: (shotId: string, mode: 'preview_still' | 'preview_video') => void
  onGenerateTakeStill: (takeId: string) => void
  onGenerateTakeStoryboard: (takeId: string) => void
  onGenerateTakeVideo: (takeId: string) => void
  onToggleShotApproval: (shotId: string, approved: boolean) => void
  onToggleTakeApproval: (takeId: string, approved: boolean) => void
  onUpdateShotDuration: (shotId: string, durationSeconds: number) => void
}

type TimelineBlocker = {
  id: string
  level: 'error' | 'warning'
  message: string
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

function buildReferenceMeta(sequence: CinematicSequence) {
  const referenceById = new Map<string, { label: string; kind: 'character' | 'environment' | 'item' | 'composite' | 'storyboard' | 'other' }>()
  sequence.references.forEach((reference) => {
    referenceById.set(reference.id, {
      label: reference.label,
      kind:
        reference.assetRole === 'character'
          ? 'character'
          : reference.assetRole === 'environment'
            ? 'environment'
            : reference.assetRole === 'item'
              ? 'item'
              : 'other',
    })
  })
  sequence.compositeRefs.forEach((reference) => {
    referenceById.set(reference.id, { label: reference.title, kind: 'composite' })
  })
  sequence.storyboard?.panels.forEach((panel) => {
    referenceById.set(panel.id, { label: panel.title || panel.id, kind: 'storyboard' })
  })
  if (sequence.storyboard?.sequenceAssetKey) {
    referenceById.set('storyboard_sequence', { label: 'Sequence Board', kind: 'storyboard' })
  }
  return referenceById
}

function kindIcon(kind: ReturnType<typeof buildReferenceMeta> extends Map<string, infer TValue> ? TValue extends { kind: infer TKind } ? TKind : never : never): EntityIconId {
  switch (kind) {
    case 'character':
      return 'character'
    case 'environment':
      return 'environment'
    case 'item':
      return 'item'
    default:
      return 'asset'
  }
}

function resolvePreviewAsset(assets: AssetDefinition[], assetKeys: string[]) {
  for (const assetKey of assetKeys) {
    const asset = assets.find((entry) => entry.key === assetKey) ?? null
    if (!asset) continue
    const previewUrl = resolveAssetPreviewUrl(asset)
    if (!previewUrl) continue
    return { asset, previewUrl }
  }
  return null
}

function takeBlockers(input: {
  projection: CinematicTimelineProjection
  take: CinematicTimelineTakeClip
}) {
  const takeShots = input.take.shotIds
    .map((shotId) => input.projection.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is CinematicTimelineShotClip => Boolean(shot))
  const blockers: TimelineBlocker[] = []

  if (!input.take.approvedForVideo) {
    blockers.push({
      id: `${input.take.id}-approval`,
      level: 'error',
      message: 'Take is not approved for video.',
    })
  }
  if (takeShots.some((shot) => !shot.approvedForTake)) {
    blockers.push({
      id: `${input.take.id}-shot-approval`,
      level: 'warning',
      message: 'One or more shots still need shot-level approval.',
    })
  }
  if (takeShots.some((shot) => !shot.previewAssetKey)) {
    blockers.push({
      id: `${input.take.id}-shot-stills`,
      level: 'warning',
      message: 'One or more shots are missing still previews.',
    })
  }
  if (!input.take.previewAssetKey) {
    blockers.push({
      id: `${input.take.id}-primary-image`,
      level: 'error',
      message: 'No primary still or storyboard image is available for this take.',
    })
  }
  if (!takeShots.some((shot) => shot.hookRole === 'proof' || shot.beat.toLowerCase().includes('proof'))) {
    blockers.push({
      id: `${input.take.id}-proof`,
      level: 'warning',
      message: 'This take does not currently surface a clear proof beat.',
    })
  }

  return blockers
}

export function CinematicTimelineSurface({
  assets,
  canRunCinematics,
  currentGraph,
  currentRuns,
  generatingShotStillIds,
  generatingShotVideoIds,
  generatingTakeStillIds,
  generatingTakeStoryboardIds,
  generatingTakeVideoIds,
  graphSettings,
  sequence,
  onGenerateShot,
  onGenerateTakeStill,
  onGenerateTakeStoryboard,
  onGenerateTakeVideo,
  onToggleShotApproval,
  onToggleTakeApproval,
  onUpdateShotDuration,
}: TimelineSurfaceProps) {
  const projection = useMemo(
    () => (sequence ? buildCinematicTimelineProjection(sequence) : null),
    [sequence],
  )
  const referenceMeta = useMemo(
    () => (projection ? buildReferenceMeta(projection.sequence) : new Map()),
    [projection],
  )
  const [playheadSeconds, setPlayheadSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(BASE_PIXELS_PER_SECOND)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null)
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null)
  const timelineScrollShellRef = useRef<HTMLDivElement | null>(null)
  const playbackFrameRef = useRef<number | null>(null)
  const playbackStartedAtRef = useRef<number | null>(null)
  const playbackOriginSecondsRef = useRef(0)
  const playheadSecondsRef = useRef(0)
  const pixelsPerSecondRef = useRef(BASE_PIXELS_PER_SECOND)
  const resizeStateRef = useRef<{
    shotId: string
    startClientX: number
    initialDurationSeconds: number
  } | null>(null)
  const scrubStateRef = useRef<{ isDragging: boolean } | null>(null)

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
      const delta = Math.min(32, Math.max(8, clientX - (bounds.right - edgeThreshold)))
      shell.scrollLeft += delta
      return
    }
    if (clientX < bounds.left + edgeThreshold) {
      const delta = Math.min(32, Math.max(8, (bounds.left + edgeThreshold) - clientX))
      shell.scrollLeft -= delta
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
    if (!projection) {
      setSelectedShotId(null)
      setSelectedTakeId(null)
      return
    }
    if (!selectedShotId || !projection.shots.some((shot) => shot.id === selectedShotId)) {
      setSelectedShotId(projection.shots[0]?.id ?? null)
    }
    if (!selectedTakeId || !projection.takes.some((take) => take.id === selectedTakeId)) {
      setSelectedTakeId(projection.takes[0]?.id ?? null)
    }
  }, [projection, selectedShotId, selectedTakeId])

  useEffect(() => {
    if (!projection) return
    const playheadShot = findTimelineShotAtSeconds(projection, playheadSeconds) ?? projection.shots[0] ?? null
    const playheadTake = findTimelineTakeAtSeconds(projection, playheadSeconds) ?? projection.takes[0] ?? null
    if ((playheadShot?.id ?? null) !== selectedShotId) {
      setSelectedShotId(playheadShot?.id ?? null)
    }
    if ((playheadTake?.id ?? null) !== selectedTakeId) {
      setSelectedTakeId(playheadTake?.id ?? null)
    }
  }, [playheadSeconds, projection, selectedShotId, selectedTakeId])

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

    if (playheadSecondsRef.current >= projection.totalDurationSeconds) {
      playbackOriginSecondsRef.current = 0
      setPlayheadSeconds(0)
    } else {
      playbackOriginSecondsRef.current = playheadSecondsRef.current
    }

    playbackStartedAtRef.current = null

    const tick = (timestamp: number) => {
      if (playbackStartedAtRef.current === null) {
        playbackStartedAtRef.current = timestamp
      }
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
    const nextLeft = Math.max(0, playheadSecondsRef.current * pixelsPerSecond - shell.clientWidth / 2)
    shell.scrollTo({ left: nextLeft, behavior: 'auto' })
  }, [pixelsPerSecond])

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
    function handlePointerMove(event: MouseEvent) {
      if (resizeStateRef.current) {
        adjustScrollForPointerEdge(event.clientX)
        const deltaSeconds = Math.round((event.clientX - resizeStateRef.current.startClientX) / pixelsPerSecondRef.current)
        const nextDurationSeconds = Math.min(15, Math.max(1, resizeStateRef.current.initialDurationSeconds + deltaSeconds))
        onUpdateShotDuration(resizeStateRef.current.shotId, nextDurationSeconds)
        return
      }
      if (scrubStateRef.current?.isDragging) {
        adjustScrollForPointerEdge(event.clientX)
        updatePlayheadFromClientX(event.clientX)
      }
    }

    function handlePointerUp() {
      resizeStateRef.current = null
      scrubStateRef.current = null
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [adjustScrollForPointerEdge, onUpdateShotDuration, updatePlayheadFromClientX])

  if (!currentGraph || !projection) {
    return (
      <div className="timeline-surface">
        <div className="inline-note">Select a cinematic flow to work on the timeline.</div>
      </div>
    )
  }

  const timelineWidth = Math.max(960, projection.totalDurationSeconds * pixelsPerSecond)
  const zoomPercent = Math.round((pixelsPerSecond / BASE_PIXELS_PER_SECOND) * 100)
  const activeShot = findTimelineShotAtSeconds(projection, playheadSeconds)
    ?? (selectedShotId ? projection.shots.find((shot) => shot.id === selectedShotId) ?? null : null)
  const activeTake = findTimelineTakeAtSeconds(projection, playheadSeconds)
    ?? (selectedTakeId ? projection.takes.find((take) => take.id === selectedTakeId) ?? null : null)
  const currentSubtitle = activeShot?.subtitleCues.find((cue) => playheadSeconds >= cue.startSeconds && playheadSeconds <= cue.endSeconds) ?? null
  const currentPreview = resolvePreviewAsset(
    assets,
    activeShot?.previewAssetKeys ?? activeTake?.previewAssetKeys ?? [],
  )
  const activeTakeBlockers = activeTake ? takeBlockers({ projection, take: activeTake }) : []
  const activeShotStillGenerating = Boolean(activeShot && generatingShotStillIds.has(activeShot.id))
  const activeShotVideoGenerating = Boolean(activeShot && generatingShotVideoIds.has(activeShot.id))
  const activeTakeStillGenerating = Boolean(activeTake && generatingTakeStillIds.has(activeTake.id))
  const activeTakeStoryboardGenerating = Boolean(activeTake && generatingTakeStoryboardIds.has(activeTake.id))
  const activeTakeVideoGenerating = Boolean(activeTake && generatingTakeVideoIds.has(activeTake.id))
  const canApproveTake = activeTake ? activeTakeBlockers.every((blocker) => blocker.id.endsWith('-proof') || blocker.id.endsWith('-shot-stills') ? true : blocker.id === `${activeTake.id}-approval`) : false
  const canGenerateTakeVideo = Boolean(
    canRunCinematics
    && activeTake
    && activeTake.approvedForVideo
    && activeTakeBlockers.every((blocker) => blocker.level !== 'error'),
  )
  const activeIngredients = activeShot?.activeRefIds
    .map((refId) => ({
      refId,
      label: referenceMeta.get(refId)?.label ?? refId,
      kind: referenceMeta.get(refId)?.kind ?? 'other',
    }))
    .filter((entry, index, items) => items.findIndex((candidate) => candidate.refId === entry.refId) === index)
    ?? []
  const startScrub = (clientX: number) => {
    setIsPlaying(false)
    scrubStateRef.current = { isDragging: true }
    updatePlayheadFromClientX(clientX)
  }

  return (
    <div className="timeline-surface">
      <div className="timeline-preview-shell">
        <div className="timeline-preview-stage">
          {currentPreview ? (
            <img
              alt={currentPreview.asset.name}
              className="timeline-preview-image"
              src={currentPreview.previewUrl}
            />
          ) : (
            <div className="timeline-preview-placeholder">
              <EntityIcon id="cinematic" />
              <strong>{activeShot?.title ?? currentGraph.name}</strong>
              <span>{activeShot?.beat ?? 'Generate a still or storyboard to preview this beat while scrubbing.'}</span>
            </div>
          )}
          <div className="timeline-preview-overlay">
            <div className="timeline-preview-meta">
              <span className="eyebrow">Timeline Preview</span>
              <strong>{activeShot?.title ?? currentGraph.name}</strong>
              <span>{activeShot ? `${formatTimecode(activeShot.startSeconds)} - ${formatTimecode(activeShot.endSeconds)} · ${activeShot.durationSeconds}s` : 'No active shot'}</span>
            </div>
            {currentSubtitle ? (
              <div className="timeline-preview-subtitle">
                <span>{currentSubtitle.label}</span>
                <strong>{currentSubtitle.text}</strong>
              </div>
            ) : null}
          </div>
        </div>
        <div className="timeline-transport">
          <div className="timeline-transport-copy">
            <span className="eyebrow">Transport</span>
            <strong>{formatTimecode(playheadSeconds)}</strong>
            <span>{activeTake ? `${activeTake.title} · ${activeTake.durationSeconds}s` : 'No active take'}</span>
            <span>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
          <div className="timeline-transport-actions">
            <button className="ghost-button compact" onClick={() => jumpPlayhead(0)} type="button">Start</button>
            <button className="ghost-button compact" onClick={() => stepPlayhead(-1)} type="button">-1s</button>
            <button className="primary-button compact" onClick={() => togglePlayback()} type="button">
              {isPlaying ? 'Pause' : 'Play'}
            </button>
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
              <button className="ghost-button compact" onClick={() => fitTimelineToViewport()} type="button">Fit</button>
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
                <div
                  className="timeline-ruler-tick"
                  key={`tick-${index}`}
                  style={{ left: index * pixelsPerSecond }}
                >
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
                  const preview = resolvePreviewAsset(assets, shot.previewAssetKeys)
                  const latestRun = currentRuns.find((run) => run.jobs.some((job) => job.shotId === shot.id)) ?? null
                  return (
                    <button
                      className={shot.id === activeShot?.id ? 'timeline-shot-block is-active' : 'timeline-shot-block'}
                      key={shot.id}
                      onClick={() => {
                        setSelectedShotId(shot.id)
                        if (shot.takeId) setSelectedTakeId(shot.takeId)
                        setClampedPlayhead(shot.startSeconds)
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      style={{
                        left: shot.startSeconds * pixelsPerSecond,
                        width: Math.max(84, shot.durationSeconds * pixelsPerSecond),
                      }}
                      type="button"
                    >
                      {preview ? <img alt="" className="timeline-shot-thumb" src={preview.previewUrl} /> : null}
                      <div className="timeline-shot-block-overlay" />
                      <div className="timeline-shot-copy">
                        <strong>{shot.title}</strong>
                        <span>{shot.hookRole ?? shot.shotType} · {shot.durationSeconds}s</span>
                        <span>{shot.approvedForTake ? 'Approved' : latestRun ? `${latestRun.mode} · ${latestRun.status}` : 'Awaiting approval'}</span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="timeline-shot-resize-handle"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          resizeStateRef.current = {
                            shotId: shot.id,
                            startClientX: event.clientX,
                            initialDurationSeconds: shot.durationSeconds,
                          }
                        }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="timeline-track-shell">
              <div className="timeline-track-label">
                <span className="eyebrow">Subtitles</span>
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
                    className="timeline-cue timeline-cue-dialogue"
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
                  {formatTimecode(activeShot.startSeconds)} - {formatTimecode(activeShot.endSeconds)} · {activeShot.durationSeconds}s · {activeShot.hookRole ?? activeShot.shotType}
                </div>
                <div className="timeline-sidebar-actions">
                  <button
                    className={activeShotStillGenerating ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'}
                    disabled={!canRunCinematics || activeShotStillGenerating}
                    onClick={() => onGenerateShot(activeShot.id, 'preview_still')}
                    type="button"
                  >
                    {activeShotStillGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating Still...</> : 'Generate Still'}
                  </button>
                  <button
                    className={activeShotVideoGenerating ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'}
                    disabled={!canRunCinematics || activeShotVideoGenerating}
                    onClick={() => onGenerateShot(activeShot.id, 'preview_video')}
                    type="button"
                  >
                    {activeShotVideoGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating Clip...</> : 'Generate Clip'}
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={!activeShot.previewAssetKey}
                    onClick={() => onToggleShotApproval(activeShot.id, !activeShot.approvedForTake)}
                    type="button"
                  >
                    {activeShot.approvedForTake ? 'Unapprove Shot' : 'Approve Shot'}
                  </button>
                </div>
                {activeShotStillGenerating ? <div className="inline-note"><span className="button-spinner" aria-hidden="true" />Shot still is generating.</div> : null}
                {!activeShot.previewAssetKey ? <div className="inline-note is-warning">Generate a shot still before approving composition and timing.</div> : null}
                <label className="field-block compact-block">
                  <span>Duration</span>
                  <input
                    max="15"
                    min="1"
                    onChange={(event) => onUpdateShotDuration(activeShot.id, Math.min(15, Math.max(1, Number(event.target.value) || activeShot.durationSeconds)))}
                    type="number"
                    value={activeShot.durationSeconds}
                  />
                </label>
                <div className="inline-note">{activeShot.beat}</div>
              </>
            ) : null}
          </div>

          <div className="timeline-sidebar-section">
            <span className="eyebrow">Take Review</span>
            <h3>{activeTake?.title ?? 'No take selected'}</h3>
            {activeTake ? (
              <>
                <div className="inline-note">
                  {formatTimecode(activeTake.startSeconds)} - {formatTimecode(activeTake.endSeconds)} · {activeTake.durationSeconds}s · {graphSettings.presetFamily === 'story_movie_tv' ? 'story' : 'ugc'}
                </div>
                <div className="timeline-sidebar-actions">
                  <button
                    className={activeTakeStoryboardGenerating ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'}
                    disabled={!canRunCinematics || activeTakeStoryboardGenerating}
                    onClick={() => onGenerateTakeStoryboard(activeTake.id)}
                    type="button"
                  >
                    {activeTakeStoryboardGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating Storyboard...</> : 'Generate Storyboard'}
                  </button>
                  <button
                    className={activeTakeStillGenerating ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'}
                    disabled={!canRunCinematics || activeTakeStillGenerating}
                    onClick={() => onGenerateTakeStill(activeTake.id)}
                    type="button"
                  >
                    {activeTakeStillGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating Still...</> : 'Generate Still'}
                  </button>
                  <button
                    className="ghost-button compact"
                    disabled={activeTake.approvedForVideo ? false : !canApproveTake}
                    onClick={() => onToggleTakeApproval(activeTake.id, !activeTake.approvedForVideo)}
                    type="button"
                  >
                    {activeTake.approvedForVideo ? 'Unapprove Take' : 'Approve Take'}
                  </button>
                  <button
                    className={activeTakeVideoGenerating ? 'primary-button compact button-with-spinner' : 'primary-button compact'}
                    disabled={!canGenerateTakeVideo || activeTakeVideoGenerating}
                    onClick={() => onGenerateTakeVideo(activeTake.id)}
                    type="button"
                  >
                    {activeTakeVideoGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating Video...</> : 'Generate Video'}
                  </button>
                </div>
                {activeTakeStillGenerating ? <div className="inline-note"><span className="button-spinner" aria-hidden="true" />Take still is generating.</div> : null}
                {activeTakeStoryboardGenerating ? <div className="inline-note"><span className="button-spinner" aria-hidden="true" />Storyboard is generating.</div> : null}
                <div className="diagnostic-stack">
                  {activeTakeBlockers.length > 0 ? activeTakeBlockers.map((blocker) => (
                    <div className={`inline-note ${blocker.level === 'error' ? 'is-danger' : 'is-warning'}`} key={blocker.id}>{blocker.message}</div>
                  )) : <div className="inline-note">No blockers. This take is ready for video generation once approved.</div>}
                </div>
              </>
            ) : null}
          </div>

          <div className="timeline-sidebar-section">
            <span className="eyebrow">Active Ingredients</span>
            <h3>{activeIngredients.length}</h3>
            <div className="timeline-ingredient-list">
              {activeIngredients.length > 0 ? activeIngredients.map((ingredient) => (
                <div className="timeline-ingredient" key={ingredient.refId}>
                  <EntityIcon id={kindIcon(ingredient.kind)} />
                  <div>
                    <strong>{ingredient.label}</strong>
                    <span>{ingredient.kind.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              )) : <div className="inline-note">Scrub to a shot with linked characters, items, environments, composites, or boards.</div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
