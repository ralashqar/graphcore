import {
  compileCinematicSequence,
  cinematicV2ShotPlanSchema,
  cinematicV2TimelineSchema,
  type AudioBeat,
  type CinematicSequence,
  type CinematicV2PerformanceBeat,
  type DialogueBeat,
} from './cinematics.ts'

export type CinematicTimelineCue = {
  id: string
  shotId: string
  type: 'dialogue' | 'caption' | 'audio'
  startSeconds: number
  endSeconds: number
  label: string
  text: string
}

export type CinematicTimelineShotClip = {
  id: string
  shotIndex: number
  takeId: string | null
  takeIndex: number | null
  title: string
  subtitle: string | null
  hookRole: string | null
  shotType: string
  beat: string
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  approvedForTake: boolean
  previewAssetKeys: string[]
  previewAssetKey: string | null
  previewKind?: 'image' | 'video' | 'placeholder'
  activeRefIds: string[]
  performanceBeats: CinematicV2PerformanceBeat[]
  subtitleCues: CinematicTimelineCue[]
  audioCues: CinematicTimelineCue[]
}

export type CinematicTimelineTakeClip = {
  id: string
  takeIndex: number
  title: string
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  shotIds: string[]
  approvedForVideo: boolean
  previewAssetKeys: string[]
  previewAssetKey: string | null
  previewKind?: 'image' | 'video' | 'placeholder'
}

export type CinematicTimelineProjection = {
  sequence: CinematicSequence
  totalDurationSeconds: number
  shots: CinematicTimelineShotClip[]
  takes: CinematicTimelineTakeClip[]
  dialogueCues: CinematicTimelineCue[]
  audioCues: CinematicTimelineCue[]
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index)
}

function looseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function looseArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(looseRecord).filter((entry) => Object.keys(entry).length > 0) : []
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function mediaAssetKey(value: Record<string, unknown>) {
  return readString(value.assetKey)
    || readString(value.asset_key)
    || readString(value.outputVideoAssetKey)
    || readString(value.output_video_asset_key)
    || readString(value.videoAssetKey)
    || readString(value.video_asset_key)
}

function mediaShotId(value: Record<string, unknown>) {
  return readString(value.shotId) || readString(value.shot_id)
}

function firstMediaForShot(records: Record<string, unknown>[], shotId: string) {
  return records.find((record) => mediaShotId(record) === shotId) ?? null
}

function clampCueWindow(startSeconds: number | null | undefined, endSeconds: number | null | undefined, durationSeconds: number) {
  const safeStart = typeof startSeconds === 'number' && Number.isFinite(startSeconds)
    ? Math.max(0, Math.min(durationSeconds, startSeconds))
    : 0
  const safeEnd = typeof endSeconds === 'number' && Number.isFinite(endSeconds)
    ? Math.max(safeStart, Math.min(durationSeconds, endSeconds))
    : durationSeconds
  return {
    startSeconds: safeStart,
    endSeconds: safeEnd,
  }
}

function buildDialogueCue(input: {
  shotId: string
  shotStartSeconds: number
  durationSeconds: number
  cue: DialogueBeat
  labelByRefId: Map<string, string>
}) {
  const text = input.cue.line.trim()
  if (!text) return null
  const relative = clampCueWindow(input.cue.startSeconds, input.cue.endSeconds, input.durationSeconds)
  return {
    id: input.cue.id,
    shotId: input.shotId,
    type: 'dialogue' as const,
    startSeconds: input.shotStartSeconds + relative.startSeconds,
    endSeconds: input.shotStartSeconds + relative.endSeconds,
    label: input.cue.speakerRefId ? input.labelByRefId.get(input.cue.speakerRefId) ?? 'Speaker' : 'Speaker',
    text,
  }
}

function buildAudioCue(input: {
  shotId: string
  shotStartSeconds: number
  durationSeconds: number
  cue: AudioBeat
  labelByRefId: Map<string, string>
}) {
  const text = input.cue.cue.trim()
  if (!text) return null
  const relative = clampCueWindow(input.cue.startSeconds, input.cue.endSeconds, input.durationSeconds)
  return {
    id: input.cue.id,
    shotId: input.shotId,
    type: 'audio' as const,
    startSeconds: input.shotStartSeconds + relative.startSeconds,
    endSeconds: input.shotStartSeconds + relative.endSeconds,
    label: input.cue.sourceRefId ? input.labelByRefId.get(input.cue.sourceRefId) ?? input.cue.kind : input.cue.kind,
    text,
  }
}

export function resolveTimelineShotPreviewAssetKeys(sequence: CinematicSequence, shot: CinematicSequence['shots'][number]) {
  const take =
    typeof shot.takeIndex === 'number'
      ? sequence.takes[shot.takeIndex] ?? null
      : shot.takeId
        ? sequence.takes.find((entry) => entry.id === shot.takeId) ?? null
        : null
  const storyboardPanelAssetKeys = shot.storyboardRefIds
    .map((refId) => sequence.storyboard?.panels.find((panel) => panel.id === refId)?.assetKey ?? null)
  const shotBoundStoryboardAssetKey = sequence.storyboard?.panels.find((panel) => panel.shotId === shot.id)?.assetKey ?? null

  return uniqueStrings([
    shot.stillAssetKey,
    ...storyboardPanelAssetKeys,
    shotBoundStoryboardAssetKey,
    take?.previewImageAssetKey ?? null,
    take?.outputStillAssetKey ?? null,
    take?.storyboardAssetKey ?? null,
    sequence.storyboard?.sequenceAssetKey ?? null,
  ])
}

export function buildCinematicTimelineProjection(sequenceInput: CinematicSequence): CinematicTimelineProjection {
  const sequence = compileCinematicSequence(sequenceInput)
  const labelByRefId = new Map(sequence.references.map((reference) => [reference.id, reference.label] as const))
  sequence.compositeRefs.forEach((reference) => labelByRefId.set(reference.id, reference.title))
  sequence.storyboard?.panels.forEach((panel) => labelByRefId.set(panel.id, panel.title || panel.id))
  if (sequence.storyboard?.sequenceAssetKey) {
    labelByRefId.set('storyboard_sequence', 'Sequence Board')
  }

  const dialogueCues: CinematicTimelineCue[] = []
  const audioCues: CinematicTimelineCue[] = []
  const shots: CinematicTimelineShotClip[] = sequence.shots.map((shot, shotIndex) => {
    const subtitleCues: CinematicTimelineCue[] = []
    for (const cue of shot.dialogue) {
      const timelineCue = buildDialogueCue({
        shotId: shot.id,
        shotStartSeconds: shot.startSeconds,
        durationSeconds: shot.durationSeconds ?? Math.max(1, shot.endSeconds - shot.startSeconds),
        cue,
        labelByRefId,
      })
      if (timelineCue) subtitleCues.push(timelineCue)
    }
    const shotAudioCues: CinematicTimelineCue[] = []
    for (const cue of shot.audio) {
      const timelineCue = buildAudioCue({
        shotId: shot.id,
        shotStartSeconds: shot.startSeconds,
        durationSeconds: shot.durationSeconds ?? Math.max(1, shot.endSeconds - shot.startSeconds),
        cue,
        labelByRefId,
      })
      if (timelineCue) shotAudioCues.push(timelineCue)
    }

    dialogueCues.push(...subtitleCues)
    audioCues.push(...shotAudioCues)

    const previewAssetKeys = resolveTimelineShotPreviewAssetKeys(sequence, shot)

    return {
      id: shot.id,
      shotIndex,
      takeId: shot.takeId,
      takeIndex: shot.takeIndex,
      title: shot.title,
      subtitle: shot.subtitle,
      hookRole: shot.hookRole,
      shotType: shot.shotType,
      beat: shot.beat,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      durationSeconds: shot.durationSeconds ?? Math.max(1, shot.endSeconds - shot.startSeconds),
      approvedForTake: shot.approvedForTake ?? false,
      previewAssetKeys,
      previewAssetKey: previewAssetKeys[0] ?? null,
      activeRefIds: uniqueStrings([
        ...shot.participantRefIds,
        shot.locationRefId,
        ...shot.propRefIds,
        ...shot.compositeRefIds,
        ...shot.storyboardRefIds,
      ]),
      performanceBeats: [],
      subtitleCues,
      audioCues: shotAudioCues,
    } satisfies CinematicTimelineShotClip
  })

  const takes = sequence.takes.map((take, takeIndex) => {
    const previewAssetKeys = uniqueStrings([
      take.previewImageAssetKey,
      take.outputStillAssetKey,
      take.storyboardAssetKey,
      ...take.shotIds.flatMap((shotId) => shots.find((shot) => shot.id === shotId)?.previewAssetKeys ?? []),
    ])
    return {
      id: take.id,
      takeIndex,
      title: take.title,
      startSeconds: take.startSeconds,
      endSeconds: take.endSeconds,
      durationSeconds: take.durationSeconds,
      shotIds: take.shotIds,
      approvedForVideo: take.approvedForVideo,
      previewAssetKeys,
      previewAssetKey: previewAssetKeys[0] ?? null,
    } satisfies CinematicTimelineTakeClip
  })

  return {
    sequence,
    totalDurationSeconds: takes[takes.length - 1]?.endSeconds ?? shots[shots.length - 1]?.endSeconds ?? 0,
    shots,
    takes,
    dialogueCues: dialogueCues.sort((left, right) => left.startSeconds - right.startSeconds),
    audioCues: audioCues.sort((left, right) => left.startSeconds - right.startSeconds),
  }
}

export function buildCinematicV2TimelineProjection(input: {
  shotPlan: unknown
  timeline?: unknown
  panels?: unknown[]
  keyframes?: unknown[]
  videos?: unknown[]
  storyboardSheets?: unknown[]
}): CinematicTimelineProjection {
  const shotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const parsedTimeline = cinematicV2TimelineSchema.safeParse(input.timeline)
  const timeline = parsedTimeline.success ? parsedTimeline.data : null
  const panels = looseArray(input.panels)
  const keyframes = looseArray(input.keyframes)
  const videos = looseArray(input.videos)
  const storyboardSheets = looseArray(input.storyboardSheets)
  const storyboardAssetKeys = uniqueStrings(storyboardSheets.map(mediaAssetKey))
  const videoClipByShotId = new Map((timeline?.videoClips ?? []).map((clip) => [clip.shotId, clip] as const))

  const dialogueCues: CinematicTimelineCue[] = []
  let cursorSeconds = 0
  const shots: CinematicTimelineShotClip[] = shotPlan.shots.map((shot, shotIndex) => {
    const clip = videoClipByShotId.get(shot.id)
    const startSeconds = typeof clip?.startTime === 'number' ? clip.startTime : cursorSeconds
    const endSeconds = typeof clip?.endTime === 'number' ? clip.endTime : startSeconds + shot.editorialDurationSeconds
    cursorSeconds = endSeconds
    const durationSeconds = Math.max(0.1, endSeconds - startSeconds)
    const video = firstMediaForShot(videos, shot.id)
    const keyframe = firstMediaForShot(keyframes, shot.id)
    const panel = firstMediaForShot(panels, shot.id)
    const previewAssetKeys = uniqueStrings([
      readString(clip?.videoAssetKey),
      video ? mediaAssetKey(video) : '',
      keyframe ? mediaAssetKey(keyframe) : '',
      panel ? mediaAssetKey(panel) : '',
      ...storyboardAssetKeys,
    ])
    const previewKind: CinematicTimelineShotClip['previewKind'] = (readString(clip?.videoAssetKey) || (video && mediaAssetKey(video)))
      ? 'video'
      : previewAssetKeys.length > 0
        ? 'image'
        : 'placeholder'
    const dialogueSubtitleCues: CinematicTimelineCue[] = shot.dialogue.map((line, lineIndex) => {
      const relativeStart = readNumber(line.startSeconds) ?? 0
      const relativeEnd = readNumber(line.endSeconds) ?? durationSeconds
      const cueStart = startSeconds + Math.max(0, Math.min(durationSeconds, relativeStart))
      const cueEnd = startSeconds + Math.max(0.1, Math.min(durationSeconds, Math.max(relativeStart + 0.1, relativeEnd)))
      return {
        id: line.id || `${shot.id}-dialogue-${lineIndex + 1}`,
        shotId: shot.id,
        type: 'dialogue' as const,
        startSeconds: cueStart,
        endSeconds: Math.min(endSeconds, Math.max(cueStart + 0.1, cueEnd)),
        label: line.speakerRefId || 'Dialogue',
        text: line.text,
      }
    }).filter((cue) => cue.text.trim().length > 0)
    const fallbackCaptionText = readString(shot.action) || readString(shot.description) || readString(shot.title)
    const subtitleCues: CinematicTimelineCue[] = dialogueSubtitleCues.length > 0 || !fallbackCaptionText
      ? dialogueSubtitleCues
      : [{
          id: `${shot.id}-caption`,
          shotId: shot.id,
          type: 'caption' as const,
          startSeconds,
          endSeconds,
          label: shot.purpose || 'Shot',
          text: fallbackCaptionText,
        }]
    dialogueCues.push(...subtitleCues)
    return {
      id: shot.id,
      shotIndex,
      takeId: 'v2_scene_1',
      takeIndex: 0,
      title: shot.title,
      subtitle: shot.purpose,
      hookRole: null,
      shotType: shot.purpose,
      beat: shot.action || shot.description,
      startSeconds,
      endSeconds,
      durationSeconds,
      approvedForTake: true,
      previewAssetKeys,
      previewAssetKey: previewAssetKeys[0] ?? null,
      previewKind,
      activeRefIds: uniqueStrings([
        ...shot.visibleCharacterRefIds,
        ...shot.speakerRefIds,
        shot.locationRefId,
        ...shot.propRefIds,
      ]),
      performanceBeats: shot.performanceBeats,
      subtitleCues,
      audioCues: [],
    }
  })

  const totalDurationSeconds = timeline?.durationSeconds ?? shots[shots.length - 1]?.endSeconds ?? shotPlan.totalEditorialDurationSeconds
  const audioCues: CinematicTimelineCue[] = (timeline?.audioClips ?? []).map((clip, index) => ({
    id: `v2-audio-${index + 1}`,
    shotId: 'v2_scene_1',
    type: 'audio' as const,
    startSeconds: clip.startTime,
    endSeconds: clip.endTime,
    label: clip.type,
    text: clip.label || `${clip.type} placeholder`,
  }))
  const takePreviewAssetKeys = uniqueStrings([
    shots.find((shot) => shot.previewKind === 'video')?.previewAssetKey,
    shots.find((shot) => shot.previewKind === 'image')?.previewAssetKey,
  ])

  return {
    sequence: compileCinematicSequence({
      title: shotPlan.sceneId || 'Cinematics V2 Timeline',
      logline: '',
      tone: '',
      continuityNotes: '',
      statusPayoffType: 'custom',
      narrativeArcTemplate: 'custom',
      references: [],
      scenes: [],
      compositeRefs: [],
      relationships: [],
      storyboard: null,
      shots: [],
      takes: [],
    }),
    totalDurationSeconds,
    shots,
    takes: [{
      id: 'v2_scene_1',
      takeIndex: 0,
      title: 'Scene Timeline',
      startSeconds: 0,
      endSeconds: totalDurationSeconds,
      durationSeconds: totalDurationSeconds,
      shotIds: shots.map((shot) => shot.id),
      approvedForVideo: true,
      previewAssetKeys: takePreviewAssetKeys,
      previewAssetKey: takePreviewAssetKeys[0] ?? null,
      previewKind: shots.some((shot) => shot.previewKind === 'video') ? 'video' : takePreviewAssetKeys.length > 0 ? 'image' : 'placeholder',
    }],
    dialogueCues: dialogueCues.sort((left, right) => left.startSeconds - right.startSeconds),
    audioCues: audioCues.sort((left, right) => left.startSeconds - right.startSeconds),
  }
}

export function findTimelineShotAtSeconds(projection: CinematicTimelineProjection, playheadSeconds: number) {
  const clampedSeconds = Math.max(0, Math.min(projection.totalDurationSeconds, playheadSeconds))
  return projection.shots.find((shot) => clampedSeconds >= shot.startSeconds && clampedSeconds < shot.endSeconds)
    ?? projection.shots[projection.shots.length - 1]
    ?? null
}

export function findTimelineTakeAtSeconds(projection: CinematicTimelineProjection, playheadSeconds: number) {
  const clampedSeconds = Math.max(0, Math.min(projection.totalDurationSeconds, playheadSeconds))
  return projection.takes.find((take) => clampedSeconds >= take.startSeconds && clampedSeconds < take.endSeconds)
    ?? projection.takes[projection.takes.length - 1]
    ?? null
}
