import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetPreviewUrl, resolveAssetSourceUrl } from '../../domain/assets.ts'
import {
  findTimelineShotAtSeconds,
  findTimelineTakeAtSeconds,
  type CinematicTimelineProjection,
  type CinematicTimelineShotClip,
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
  referenceIconUrlByAssetKey?: ReadonlyMap<string, string | null>
  referenceIconUrlByEntityKey?: ReadonlyMap<string, string | null>
  referenceVariantIconUrlByVariantKey?: ReadonlyMap<string, string | null>
  directorNotes?: {
    onPreview: (request: { note: string; scope: CinematicDirectorNoteScope }) => Promise<CinematicDirectorNotePreviewResponse>
    onApply: (preview: CinematicDirectorPatchPreview) => Promise<void>
    canUndoLast?: boolean
    undoLabel?: string
    onUndoLast?: () => Promise<void>
  }
  qualityKeyframes?: {
    busyShotId?: string | null
    onGenerateShot: (shot: CinematicTimelineShotClip) => Promise<void> | void
  }
}

type ResolvedTimelineMedia = {
  asset: AssetDefinition
  kind: 'image' | 'video'
  url: string
}

type TimelineReferencePreview = {
  id: string
  label: string
  asset: AssetDefinition | null
  url: string | null
}

type TimelineReferenceSource = {
  assetKey: string | null
  label: string
}

const BASE_PIXELS_PER_SECOND = 84
const MIN_PIXELS_PER_SECOND = 36
const MAX_PIXELS_PER_SECOND = 196
const ZOOM_STEP_PIXELS = 18
const MAX_PREVIEW_REFERENCE_ICONS = 8

function formatTimecode(seconds: number) {
  const total = Math.max(0, seconds)
  const wholeSeconds = Math.floor(total)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainderSeconds = wholeSeconds % 60
  const frames = Math.floor((total - wholeSeconds) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(remainderSeconds).padStart(2, '0')}.${frames}`
}

function formatPerformanceNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') : '0'
}

function performanceToneLabel(valence: number, arousal: number) {
  const valenceLabel = valence < -0.25 ? 'low valence' : valence > 0.25 ? 'high valence' : 'neutral valence'
  const arousalLabel = arousal > 0.66 ? 'high arousal' : arousal < 0.33 ? 'low arousal' : 'medium arousal'
  return `${valenceLabel}, ${arousalLabel}`
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

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readMetadataStringArray(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : []
}

function humanizeReferenceId(refId: string) {
  return refId
    .replace(/^entity_reference_sheet_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function assetMatchesReferenceId(asset: AssetDefinition, refId: string) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {}
  const directMetadataMatches = [
    'entityKey',
    'worldEntityKey',
    'sourceEntityKey',
    'sourceRefId',
    'refId',
    'referenceId',
    'characterRefId',
    'locationRefId',
    'propRefId',
  ].some((key) => readMetadataString(metadata, key) === refId)
  if (directMetadataMatches) return true
  const arrayMetadataMatches = [
    'entityKeys',
    'worldEntityKeys',
    'sourceEntityKeys',
    'sourceRefIds',
    'refIds',
    'referenceIds',
  ].some((key) => readMetadataStringArray(metadata, key).includes(refId))
  if (arrayMetadataMatches) return true
  return asset.key === refId
    || asset.key.endsWith(`_${refId}`)
    || asset.key.includes(`_${refId}_`)
}

function readAssetReferenceEntityKey(asset: AssetDefinition | null | undefined) {
  const metadata = asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {}
  return readMetadataString(metadata, 'entityKey')
    || readMetadataString(metadata, 'worldEntityKey')
    || readMetadataString(metadata, 'sourceEntityKey')
    || readMetadataString(metadata, 'targetEntityKey')
}

function readAssetReferenceVariantKey(asset: AssetDefinition | null | undefined) {
  const metadata = asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {}
  return readMetadataString(metadata, 'variantKey')
    || readMetadataString(metadata, 'referenceVariantKey')
    || readMetadataString(metadata, 'selectedReferenceVariantKey')
}

function resolveCroppedReferenceIcon(input: {
  asset: AssetDefinition | null
  refId: string
  referenceIconUrlByAssetKey?: ReadonlyMap<string, string | null>
  referenceIconUrlByEntityKey?: ReadonlyMap<string, string | null>
  referenceVariantIconUrlByVariantKey?: ReadonlyMap<string, string | null>
}) {
  const assetKeyIcon = input.asset?.key ? input.referenceIconUrlByAssetKey?.get(input.asset.key) ?? null : null
  if (assetKeyIcon) return assetKeyIcon

  const entityKey = readAssetReferenceEntityKey(input.asset) || input.refId
  const variantKey = readAssetReferenceVariantKey(input.asset)
  const variantIcon = entityKey && variantKey
    ? input.referenceVariantIconUrlByVariantKey?.get(`${entityKey}:${variantKey}`) ?? null
    : null
  if (variantIcon) return variantIcon

  return entityKey ? input.referenceIconUrlByEntityKey?.get(entityKey) ?? null : null
}

function resolveReferencePreview(input: {
  assets: AssetDefinition[]
  refId: string
  source: TimelineReferenceSource | null
  referenceIconUrlByAssetKey?: ReadonlyMap<string, string | null>
  referenceIconUrlByEntityKey?: ReadonlyMap<string, string | null>
  referenceVariantIconUrlByVariantKey?: ReadonlyMap<string, string | null>
}): TimelineReferencePreview {
  const sourceAsset = input.source?.assetKey
    ? input.assets.find((asset) => asset.key === input.source?.assetKey) ?? null
    : null
  const candidates = input.assets
    .filter((asset) => asset.kind === 'image' && assetMatchesReferenceId(asset, input.refId))
    .map((asset) => ({ asset, url: resolveAssetPreviewUrl(asset) || resolveAssetSourceUrl(asset) }))
    .filter((entry): entry is { asset: AssetDefinition; url: string } => Boolean(entry.url))
  const referenceSheet = candidates.find((entry) => entry.asset.key.startsWith('entity_reference_sheet_'))
  const chosen = referenceSheet ?? candidates[0] ?? null
  const asset = sourceAsset ?? chosen?.asset ?? null
  const croppedIconUrl = resolveCroppedReferenceIcon({
    asset,
    refId: input.refId,
    referenceIconUrlByAssetKey: input.referenceIconUrlByAssetKey,
    referenceIconUrlByEntityKey: input.referenceIconUrlByEntityKey,
    referenceVariantIconUrlByVariantKey: input.referenceVariantIconUrlByVariantKey,
  })
  return {
    id: input.refId,
    label: input.source?.label || asset?.name || chosen?.asset.name || humanizeReferenceId(input.refId),
    asset,
    url: croppedIconUrl ?? (asset ? resolveAssetPreviewUrl(asset) || resolveAssetSourceUrl(asset) : chosen?.url ?? null),
  }
}

function timelineTrackWidth(projection: CinematicTimelineProjection | null, pixelsPerSecond: number) {
  return Math.max(960, (projection?.totalDurationSeconds ?? 0) * pixelsPerSecond)
}

export function CinematicTimelinePlayer({
  assets,
  directorNotes,
  qualityKeyframes,
  projection,
  referenceIconUrlByAssetKey,
  referenceIconUrlByEntityKey,
  referenceVariantIconUrlByVariantKey,
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
  const currentMediaMetadata = currentMedia?.asset.metadata && typeof currentMedia.asset.metadata === 'object' && !Array.isArray(currentMedia.asset.metadata)
    ? currentMedia.asset.metadata as Record<string, unknown>
    : {}
  const currentMediaRole = typeof currentMediaMetadata.role === 'string' ? currentMediaMetadata.role : ''
  const currentMediaGeneratedBy = typeof currentMediaMetadata.generatedBy === 'string' ? currentMediaMetadata.generatedBy : ''
  const currentMediaKeyframeMode = typeof currentMediaMetadata.keyframeMode === 'string' ? currentMediaMetadata.keyframeMode : ''
  const activeShotHasEnhancedKeyframe = currentMediaRole === 'cinematic_v2_shot_keyframe'
    && currentMediaGeneratedBy !== 'deterministic_panel_passthrough'
    && currentMediaKeyframeMode !== 'storyboard_panel_crop'
    && currentMedia?.kind === 'image'
  const qualityKeyframeBusy = Boolean(activeShot && qualityKeyframes?.busyShotId === activeShot.id)
  const timelineWidth = timelineTrackWidth(projection, pixelsPerSecond)
  const zoomPercent = Math.round((pixelsPerSecond / BASE_PIXELS_PER_SECOND) * 100)
  const activeRefs = useMemo(() => activeShot?.activeRefIds ?? [], [activeShot])
  const referenceSourceById = useMemo(() => {
    const next = new Map<string, TimelineReferenceSource>()
    if (!projection) return next
    for (const reference of projection.sequence.references) {
      next.set(reference.id, {
        assetKey: reference.assetKey,
        label: reference.label || humanizeReferenceId(reference.id),
      })
    }
    for (const reference of projection.sequence.compositeRefs) {
      next.set(reference.id, {
        assetKey: reference.outputAssetKey,
        label: reference.title || humanizeReferenceId(reference.id),
      })
    }
    for (const panel of projection.sequence.storyboard?.panels ?? []) {
      next.set(panel.id, {
        assetKey: panel.assetKey,
        label: panel.title || humanizeReferenceId(panel.id),
      })
    }
    return next
  }, [projection])
  const activeReferencePreviews = useMemo(
    () => activeRefs.map((refId) => resolveReferencePreview({
      assets,
      refId,
      source: referenceSourceById.get(refId) ?? null,
      referenceIconUrlByAssetKey,
      referenceIconUrlByEntityKey,
      referenceVariantIconUrlByVariantKey,
    })),
    [activeRefs, assets, referenceIconUrlByAssetKey, referenceIconUrlByEntityKey, referenceSourceById, referenceVariantIconUrlByVariantKey],
  )
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

  const applyDirectorPreview = useCallback(async (explicitPreview?: CinematicDirectorPatchPreview | null) => {
    if (!directorNotes) return
    const preview = explicitPreview ?? directorPreview ?? directorPreviewRef.current
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
            <div className="timeline-preview-top-stack">
              <div className="timeline-preview-meta">
              <span className="eyebrow">{subtitle}</span>
              <strong>{activeShot?.title ?? title}</strong>
              <span>
                {activeShot
                  ? `${formatTimecode(activeShot.startSeconds)} - ${formatTimecode(activeShot.endSeconds)} · ${activeShot.durationSeconds.toFixed(1)}s`
                  : `${projection.shots.length} shots`}
              </span>
              </div>
              {activeReferencePreviews.length > 0 ? (
                <div className="timeline-preview-reference-rail" aria-label="Active shot references" role="list">
                  {activeReferencePreviews.slice(0, MAX_PREVIEW_REFERENCE_ICONS).map((reference) => (
                    <div
                      className={reference.url ? 'timeline-preview-reference-icon has-image' : 'timeline-preview-reference-icon'}
                      key={reference.id}
                      role="listitem"
                      title={reference.label}
                    >
                      <span className="timeline-preview-reference-thumb">
                        {reference.url ? <img alt="" src={reference.url} /> : <EntityIcon id="asset" />}
                      </span>
                      <span className="timeline-preview-reference-label">{reference.label}</span>
                    </div>
                  ))}
                  {activeReferencePreviews.length > MAX_PREVIEW_REFERENCE_ICONS ? (
                    <div
                      className="timeline-preview-reference-icon is-count"
                      role="listitem"
                      title={`${activeReferencePreviews.length - MAX_PREVIEW_REFERENCE_ICONS} more references`}
                    >
                      +{activeReferencePreviews.length - MAX_PREVIEW_REFERENCE_ICONS}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
            <strong className="timeline-timecode">{formatTimecode(playheadSeconds)}</strong>
            <span>{activeTake ? `${activeTake.title} · ${activeTake.durationSeconds.toFixed(1)}s` : 'No active take'}</span>
            <span className={isPlaying ? 'timeline-play-state is-playing' : 'timeline-play-state'}>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
          <div className="timeline-transport-actions">
            <button aria-label="Jump to start" className="timeline-transport-button" onClick={() => jumpPlayhead(0)} title="Jump to start" type="button">
              <span aria-hidden="true" className="timeline-icon timeline-icon-skip-start" />
            </button>
            <button aria-label="Step back one second" className="timeline-transport-button timeline-step-button" onClick={() => stepPlayhead(-1)} title="Step back one second" type="button">-1</button>
            <button
              aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
              className={isPlaying ? 'timeline-transport-button timeline-play-toggle is-playing' : 'timeline-transport-button timeline-play-toggle'}
              onClick={togglePlayback}
              title={isPlaying ? 'Pause' : 'Play'}
              type="button"
            >
              <span aria-hidden="true" className={isPlaying ? 'timeline-icon timeline-icon-pause' : 'timeline-icon timeline-icon-play'} />
            </button>
            <button aria-label="Step forward one second" className="timeline-transport-button timeline-step-button" onClick={() => stepPlayhead(1)} title="Step forward one second" type="button">+1</button>
            <button aria-label="Jump to end" className="timeline-transport-button" onClick={() => jumpPlayhead(projection.totalDurationSeconds)} title="Jump to end" type="button">
              <span aria-hidden="true" className="timeline-icon timeline-icon-skip-end" />
            </button>
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
                {qualityKeyframes ? (
                  <div className="timeline-quality-keyframe-panel">
                    <button
                      className="primary-button compact"
                      disabled={qualityKeyframeBusy}
                      onClick={() => void qualityKeyframes.onGenerateShot(activeShot)}
                      type="button"
                    >
                      {qualityKeyframeBusy ? 'Enhancing...' : activeShotHasEnhancedKeyframe ? 'Regenerate High-Res Keyframe' : 'Generate High-Res Keyframe'}
                    </button>
                    <span>
                      {activeShotHasEnhancedKeyframe
                        ? 'This shot is using an enhanced keyframe.'
                        : 'Uses this shot panel plus shot-scoped references and keyframe repair guidance.'}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {activeShot && activeShot.performanceBeats.length > 0 ? (
            <div className="timeline-sidebar-section">
              <span className="eyebrow">Performance</span>
              <div className="timeline-performance-list">
                {activeShot.performanceBeats.map((beat) => (
                  <div className="timeline-performance-card" key={beat.characterRefId}>
                    <div className="timeline-performance-card-header">
                      <strong>{beat.characterRefId}</strong>
                      <span>{performanceToneLabel(beat.valence, beat.arousal)}</span>
                    </div>
                    <div className="timeline-performance-meter-row" aria-label={`Performance values for ${beat.characterRefId}`}>
                      <span>V {formatPerformanceNumber(beat.valence)}</span>
                      <span>A {formatPerformanceNumber(beat.arousal)}</span>
                      <span>C {formatPerformanceNumber(beat.confidence)}</span>
                      <span>D {formatPerformanceNumber(beat.dominance)}</span>
                    </div>
                    {[beat.facialExpression, beat.bodyLanguage, beat.gaze, beat.gesture, beat.voiceEnergy].filter(Boolean).length > 0 ? (
                      <p>
                        {[beat.facialExpression, beat.bodyLanguage, beat.gaze, beat.gesture, beat.voiceEnergy].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
                    onClick={() => void applyDirectorPreview(directorPreview)}
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
