import {
  compileCinematicSequence,
  type AudioBeat,
  type CinematicSequence,
  type DialogueBeat,
} from './cinematics.ts'

export type CinematicTimelineCue = {
  id: string
  shotId: string
  type: 'dialogue' | 'audio'
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
  activeRefIds: string[]
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
