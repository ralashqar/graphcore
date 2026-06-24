import { z } from 'zod'

import { composeWorldEntityVoiceDescription } from '../../../src/domain/worldEntityVisuals.ts'
import { compactSeedanceControlText } from './output-workflow-seedance-video-prompt-runtime.ts'

type LooseRecord = Record<string, unknown>

export const seedanceDirectedControlsSchema = z.object({
  cameraMotion: z.string().max(220).default(''),
  subjectMotion: z.string().max(260).default(''),
  focusTarget: z.string().max(180).default(''),
  framingLock: z.string().max(180).default(''),
  visibility: z.string().max(220).default(''),
  motionIntensity: z.string().max(160).default(''),
  performance: z.string().max(280).default(''),
  voice: z.string().max(260).default(''),
})

export type SeedanceDirectedControls = z.infer<typeof seedanceDirectedControlsSchema>

export const sequenceAnimaticShotVideoTimingSchema = z.object({
  editorialDurationSeconds: z.number().min(1).max(15),
  rationale: z.string().max(600).default(''),
  pacingNotes: z.string().max(500).default(''),
  directedControls: seedanceDirectedControlsSchema.default({
    cameraMotion: '',
    subjectMotion: '',
    focusTarget: '',
    framingLock: '',
    visibility: '',
    motionIntensity: '',
    performance: '',
    voice: '',
  }),
})

const emptyShotVisualCallSheet = {
  goal: {
    shotTitle: '',
    purpose: '',
    emotionalBeat: '',
    continuityLink: '',
  },
  camera: {
    framing: '',
    angle: '',
    lens: '',
    movement: '',
    startFrame: '',
    endFrame: '',
    screenDirectionRule: '',
    horizonAxisLock: '',
  },
  composition: {
    subjectPlacement: '',
    focusTarget: '',
    foregroundBackgroundAnchors: '',
    visibilityRules: '',
  },
  action: {
    primary: '',
    secondaryMotion: '',
    startBeat: '',
    endState: '',
    settle: '',
  },
  performance: {
    body: '',
    face: '',
    gaze: '',
    dialogueDelivery: '',
    voice: '',
  },
  environment: {
    locationContinuity: '',
    lighting: '',
    referenceContinuity: '',
    cameraGridUse: '',
  },
  video: {
    durationSeconds: 3,
    motionIntensity: '',
    audioPolicy: '',
    artifactBan: '',
  },
}

export const sequenceAnimaticShotVisualCallSheetV1Schema = z.object({
  version: z.literal('shot_visual_call_sheet_v1').default('shot_visual_call_sheet_v1'),
  goal: z.object({
    shotTitle: z.string().max(160).default(''),
    purpose: z.string().max(260).default(''),
    emotionalBeat: z.string().max(220).default(''),
    continuityLink: z.string().max(220).default(''),
  }).default(emptyShotVisualCallSheet.goal),
  camera: z.object({
    framing: z.string().max(180).default(''),
    angle: z.string().max(160).default(''),
    lens: z.string().max(140).default(''),
    movement: z.string().max(220).default(''),
    startFrame: z.string().max(220).default(''),
    endFrame: z.string().max(220).default(''),
    screenDirectionRule: z.string().max(220).default(''),
    horizonAxisLock: z.string().max(220).default(''),
  }).default(emptyShotVisualCallSheet.camera),
  composition: z.object({
    subjectPlacement: z.string().max(240).default(''),
    focusTarget: z.string().max(180).default(''),
    foregroundBackgroundAnchors: z.string().max(260).default(''),
    visibilityRules: z.string().max(260).default(''),
  }).default(emptyShotVisualCallSheet.composition),
  action: z.object({
    primary: z.string().max(320).default(''),
    secondaryMotion: z.string().max(260).default(''),
    startBeat: z.string().max(220).default(''),
    endState: z.string().max(220).default(''),
    settle: z.string().max(180).default(''),
  }).default(emptyShotVisualCallSheet.action),
  performance: z.object({
    body: z.string().max(260).default(''),
    face: z.string().max(220).default(''),
    gaze: z.string().max(220).default(''),
    dialogueDelivery: z.string().max(260).default(''),
    voice: z.string().max(260).default(''),
  }).default(emptyShotVisualCallSheet.performance),
  environment: z.object({
    locationContinuity: z.string().max(320).default(''),
    lighting: z.string().max(220).default(''),
    referenceContinuity: z.string().max(900).default(''),
    cameraGridUse: z.string().max(220).default(''),
  }).default(emptyShotVisualCallSheet.environment),
  video: z.object({
    durationSeconds: z.number().min(1).max(15).default(3),
    motionIntensity: z.string().max(180).default(''),
    audioPolicy: z.string().max(260).default(''),
    artifactBan: z.string().max(260).default(''),
  }).default(emptyShotVisualCallSheet.video),
})

export type SequenceAnimaticShotVisualCallSheetV1 = z.infer<typeof sequenceAnimaticShotVisualCallSheetV1Schema>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readText).filter(Boolean)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function readReferenceRole(entry: LooseRecord) {
  return readText(entry.role).toLowerCase()
}

function referenceLabel(entry: LooseRecord) {
  return readText(entry.label) || readText(entry.name) || readText(entry.imageTag) || readText(entry.tag)
}

function referenceLine(entry: LooseRecord) {
  return readText(entry.line) || [
    readText(entry.tag) || readText(entry.imageTag),
    referenceLabel(entry),
    readText(entry.guidance) || readText(entry.role),
  ].filter(Boolean).join(' ')
}

function joinLimited(values: string[], maxWords = 42) {
  return compactSeedanceControlText(values.filter(Boolean).join('; '), maxWords)
}

export function estimateSequenceShotVideoDurationSeconds(shot: LooseRecord) {
  const dialogueText = Array.isArray(shot.dialogue)
    ? shot.dialogue.map((line) => readText(asRecord(line).text)).filter(Boolean).join(' ')
    : ''
  const actionText = [
    readText(shot.action),
    readText(shot.description),
    readText(shot.storyboardPanelPrompt),
    readText(shot.videoDirection),
    readText(asRecord(shot.camera).movement),
    readText(asRecord(shot.camera).framing),
  ].filter(Boolean).join(' ')
  const dialogueWords = dialogueText.split(/\s+/).filter(Boolean).length
  const actionWords = actionText.split(/\s+/).filter(Boolean).length
  const dialogueSeconds = dialogueWords > 0 ? Math.max(1.2, dialogueWords / 2.6 + 0.6) : 0
  const actionSeconds = Math.max(1.8, Math.min(8, actionWords / 12))
  const hasFastAction = /\b(run|runs|running|leap|leaps|jump|jumps|fight|fighting|strike|strikes|slam|slams|crash|chase|skid|rush|dash|spin|falls?|lands?|burst|explodes?)\b/i.test(actionText)
  const hasQuietActing = /\b(looks?|glances?|holds?|listens?|waits?|breathes?|realizes?|smiles?|frowns?|stares?|hesitates?|settles?)\b/i.test(actionText)
  const cameraSeconds = /\b(slow|push|dolly|drift|linger|hold)\b/i.test(actionText) ? 0.8 : 0.3
  const actionBias = hasFastAction ? 1.1 : hasQuietActing ? 0.4 : 0.7
  return Math.max(2, Math.min(12, Number((dialogueSeconds + actionSeconds + cameraSeconds + actionBias).toFixed(1))))
}

export function seedanceShotPhysicalityText(shot: LooseRecord) {
  return [
    readText(shot.title),
    readText(shot.action),
    readText(shot.description),
    readText(shot.videoDirection),
    readText(shot.mood),
    readText(shot.lighting),
    JSON.stringify(shot.performanceBeats ?? ''),
  ].join(' ').toLowerCase()
}

export function seedanceMotionIntensityForShot(shot: LooseRecord) {
  const text = seedanceShotPhysicalityText(shot)
  if (/\b(fight|combat|strike|kick|punch|sword|staff|leap|jump|chase|sprint|crash|impact|explosion|vortex|shockwave)\b/i.test(text)) return 'high intensity; prioritize readable action direction and clean motion arcs'
  if (/\b(run|rush|dash|skid|climb|fall|spin|turn|grab|throw|slam)\b/i.test(text)) return 'moderate intensity; keep movement readable with natural follow-through'
  if (/\b(look|glance|listen|hold|wait|breathe|smile|frown|hesitate|realize|watch|stare)\b/i.test(text)) return 'low intensity; subtle face, eye, breath, ear, cloth, and prop micro-motion'
  return 'controlled intensity; natural physical motion and stable final settle'
}

export function buildSequenceAnimaticShotVisualCallSheet(input: {
  shot: LooseRecord
  coverageSetup?: LooseRecord
  coverageAnchor?: LooseRecord
  previousKeyframe?: LooseRecord
  storyboardPanel?: LooseRecord
  referenceManifest?: unknown[]
  directedControls?: unknown
  durationSeconds?: number
  sceneStateText?: string
}) {
  const shot = input.shot
  const camera = asRecord(shot.camera)
  const coverageSetup = asRecord(input.coverageSetup)
  const coverageAnchor = asRecord(input.coverageAnchor)
  const controls = seedanceDirectedControlsSchema.safeParse(input.directedControls).success
    ? seedanceDirectedControlsSchema.parse(input.directedControls)
    : buildSeedanceDirectedControlsFromShot({ shot })
  const rawPerformanceBeats = shot.performanceBeats ?? shot.performance
  const performanceBeats = Array.isArray(rawPerformanceBeats)
    ? rawPerformanceBeats.map(asRecord)
    : []
  const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  const references = Array.isArray(input.referenceManifest) ? input.referenceManifest.map(asRecord) : []
  const locationRefs = references.filter((entry) => /(location|set|zone|spot|viewpoint)/i.test(readReferenceRole(entry)))
  const cameraGridRefs = references.filter((entry) => /camera[_ -]?grid|angle[_ -]?coverage/i.test(`${readReferenceRole(entry)} ${referenceLabel(entry)} ${referenceLine(entry)}`))
  const continuityLink = asRecord(shot.continuityLink)
  const coverageAnchorText = readText(coverageAnchor.assetKey)
    ? 'Match coverage anchor camera position, horizon, screen direction, and subject placement.'
    : ''
  const setupText = [
    readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief),
    readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction),
    readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief),
  ].filter(Boolean)
  const bodyPerformance = performanceBeats
    .map((beat) => [readText(beat.bodyLanguage), readText(beat.gesture), readText(beat.description)].filter(Boolean).join(', '))
    .filter(Boolean)
  const facePerformance = performanceBeats
    .map((beat) => [readText(beat.emotion), readText(beat.facialExpression)].filter(Boolean).join(', '))
    .filter(Boolean)
  const gazePerformance = performanceBeats.map((beat) => readText(beat.gaze)).filter(Boolean)
  const dialogueDelivery = dialogue
    .map((line) => [readText(line.speakerName) || readText(line.speakerRefId), readText(line.emotion), readText(line.text)].filter(Boolean).join(': '))
    .filter(Boolean)
  const primaryAction = readText(shot.action) || readText(shot.description) || readText(shot.storyboardPanelPrompt) || readText(shot.title)
  const videoDirection = readText(shot.videoDirection)
  const screenDirectionRule = readText(camera.screenDirectionRule) || readText(shot.screenDirectionRule) || readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
  return sequenceAnimaticShotVisualCallSheetV1Schema.parse({
    version: 'shot_visual_call_sheet_v1',
    goal: {
      shotTitle: readText(shot.title),
      purpose: joinLimited([readText(shot.coverageIntent), primaryAction], 34),
      emotionalBeat: joinLimited([readText(shot.mood), readText(shot.caption), ...facePerformance.slice(0, 2)], 28),
      continuityLink: joinLimited([readText(continuityLink.mode), readText(continuityLink.description)], 28),
    },
    camera: {
      framing: compactSeedanceControlText(readText(camera.framing), 18),
      angle: compactSeedanceControlText(readText(camera.angle), 16),
      lens: compactSeedanceControlText(readText(camera.lens), 14),
      movement: compactSeedanceControlText(readText(camera.movement) || controls.cameraMotion, 22),
      startFrame: joinLimited([coverageAnchorText, readText(asRecord(input.storyboardPanel).prompt)], 28),
      endFrame: compactSeedanceControlText(videoDirection || primaryAction, 28),
      screenDirectionRule: compactSeedanceControlText(screenDirectionRule, 20),
      horizonAxisLock: coverageAnchorText || (screenDirectionRule ? 'Preserve the established screen axis and horizon.' : ''),
    },
    composition: {
      subjectPlacement: joinLimited([coverageAnchorText, ...setupText], 32),
      focusTarget: compactSeedanceControlText(controls.focusTarget || readText(shot.title), 16),
      foregroundBackgroundAnchors: joinLimited(locationRefs.slice(0, 3).map(referenceLine), 38),
      visibilityRules: compactSeedanceControlText(controls.visibility, 26),
    },
    action: {
      primary: compactSeedanceControlText(primaryAction, 42),
      secondaryMotion: compactSeedanceControlText(controls.subjectMotion, 30),
      startBeat: compactSeedanceControlText(readText(asRecord(input.previousKeyframe).assetKey) ? 'Continue from the previous keyframe state.' : primaryAction, 24),
      endState: compactSeedanceControlText(videoDirection || primaryAction, 28),
      settle: 'End on a readable settled pose or camera hold unless the shot explicitly cuts mid-action.',
    },
    performance: {
      body: joinLimited(bodyPerformance, 30),
      face: joinLimited(facePerformance, 26),
      gaze: joinLimited(gazePerformance, 22),
      dialogueDelivery: joinLimited(dialogueDelivery, 34),
      voice: compactSeedanceControlText(controls.voice, 28),
    },
    environment: {
      locationContinuity: joinLimited([readText(input.sceneStateText), ...locationRefs.slice(0, 4).map(referenceLine)], 44),
      lighting: compactSeedanceControlText(readText(shot.lighting) || readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief), 24),
      referenceContinuity: joinLimited(references.slice(0, 6).map(referenceLine), 46),
      cameraGridUse: cameraGridRefs.length > 0
        ? 'Use the spot camera grid for angle vocabulary and screen direction; do not render the grid layout or multiple cells.'
        : '',
    },
    video: {
      durationSeconds: Math.max(1, Math.min(15, Number(input.durationSeconds) || estimateSequenceShotVideoDurationSeconds(shot))),
      motionIntensity: compactSeedanceControlText(controls.motionIntensity || seedanceMotionIntensityForShot(shot), 24),
      audioPolicy: 'Scripted dialogue and direct diegetic sound only; no music or ambience bed.',
      artifactBan: 'No labels, captions, subtitles, UI, watermarks, board arrows, gutters, or map/grid artifacts.',
    },
  })
}

export function formatSequenceAnimaticShotVisualCallSheetForPrompt(callSheet: unknown) {
  const sheet = sequenceAnimaticShotVisualCallSheetV1Schema.parse(callSheet)
  return [
    [sheet.goal.shotTitle, sheet.goal.purpose].filter(Boolean).join(' - '),
    sheet.goal.emotionalBeat ? `Director beat: ${sheet.goal.emotionalBeat}.` : '',
    sheet.goal.continuityLink ? `Continuity link: ${sheet.goal.continuityLink}.` : '',
    formatSequenceAnimaticShotVisualCallSheetCameraPlan(sheet),
    [sheet.composition.subjectPlacement, sheet.composition.focusTarget, sheet.composition.foregroundBackgroundAnchors, sheet.composition.visibilityRules]
      .filter(Boolean).length > 0
      ? `Composition: ${[sheet.composition.subjectPlacement, sheet.composition.focusTarget, sheet.composition.foregroundBackgroundAnchors, sheet.composition.visibilityRules].filter(Boolean).join('; ')}.`
      : '',
    [sheet.action.primary, sheet.action.secondaryMotion, sheet.action.endState, sheet.action.settle]
      .filter(Boolean).length > 0
      ? `Action: ${[sheet.action.primary, sheet.action.secondaryMotion, sheet.action.endState, sheet.action.settle].filter(Boolean).join('; ')}.`
      : '',
    [sheet.performance.body, sheet.performance.face, sheet.performance.gaze, sheet.performance.dialogueDelivery, sheet.performance.voice]
      .filter(Boolean).length > 0
      ? `Performance: ${[sheet.performance.body, sheet.performance.face, sheet.performance.gaze, sheet.performance.dialogueDelivery, sheet.performance.voice].filter(Boolean).join('; ')}.`
      : '',
    [sheet.environment.locationContinuity, sheet.environment.lighting, sheet.environment.cameraGridUse]
      .filter(Boolean).length > 0
      ? `Environment: ${[sheet.environment.locationContinuity, sheet.environment.lighting, sheet.environment.cameraGridUse].filter(Boolean).join('; ')}.`
      : '',
  ].filter(Boolean).join('\n')
}

export function formatSequenceAnimaticShotVisualCallSheetCameraPlan(callSheet: unknown) {
  const sheet = sequenceAnimaticShotVisualCallSheetV1Schema.parse(callSheet)
  const camera = [
    sheet.camera.framing ? `framing ${sheet.camera.framing}` : '',
    sheet.camera.angle ? `angle ${sheet.camera.angle}` : '',
    sheet.camera.lens ? `lens ${sheet.camera.lens}` : '',
    sheet.camera.movement ? `movement ${sheet.camera.movement}` : '',
    sheet.camera.screenDirectionRule ? `screen direction ${sheet.camera.screenDirectionRule}` : '',
    sheet.camera.horizonAxisLock ? `axis ${sheet.camera.horizonAxisLock}` : '',
  ].filter(Boolean).join('; ')
  return camera ? `Camera plan: ${camera}.` : ''
}

export function buildSeedanceDirectedControlsFromShot(input: {
  shot: LooseRecord
  entityByKey?: Map<string, LooseRecord>
  visibleCharacterRefIds?: string[]
}) {
  const shot = input.shot
  const camera = asRecord(shot.camera)
  const visibleKeys = input.visibleCharacterRefIds ?? readStringArray(shot.visibleCharacterRefIds)
  const speakerKeys = readStringArray(shot.speakerRefIds)
  const entityName = (key: string) => readText(input.entityByKey?.get(key)?.name) || key
  const visibleNames = visibleKeys.map(entityName).filter(Boolean)
  const offscreenNames = speakerKeys.filter((key) => key && !visibleKeys.includes(key)).map(entityName).filter(Boolean)
  const dialogueRecords = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  const dialogueSpeakers = dialogueRecords
    .map((line) => readText(line.speakerName) || entityName(readText(line.speakerRefId)))
    .filter(Boolean)
  const dialogueSpeakerVoiceGuides = uniqueStrings(dialogueRecords
    .map((line) => readText(line.speakerRefId))
    .filter(Boolean))
    .map((key) => {
      const entity = input.entityByKey?.get(key)
      const name = entityName(key)
      const voice = entity
        ? readText(entity.voiceDescription) || composeWorldEntityVoiceDescription(asRecord(entity.voice))
        : ''
      return voice ? `${name}: ${compactSeedanceControlText(voice, 14)}` : ''
    })
    .filter(Boolean)
  const dialogueEmotion = dialogueRecords
    .map((line) => readText(line.emotion))
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  const performanceBeats = Array.isArray(shot.performanceBeats) ? shot.performanceBeats.map(asRecord) : []
  const performanceText = performanceBeats
    .map((beat) => {
      const who = entityName(readText(beat.characterRefId))
      const parts = [
        readText(beat.bodyLanguage),
        readText(beat.facialExpression),
        readText(beat.gaze),
        readText(beat.gesture),
      ].filter(Boolean).join(', ')
      return parts ? `${who}: ${parts}` : ''
    })
    .filter(Boolean)
    .join('; ')
  const voiceText = [
    dialogueSpeakers.length > 0 ? `${uniqueStrings(dialogueSpeakers).join(', ')} speaking` : '',
    dialogueEmotion ? `delivery: ${dialogueEmotion}` : '',
    dialogueSpeakerVoiceGuides.slice(0, 2).join('; '),
    performanceBeats.map((beat) => readText(beat.voiceEnergy)).filter(Boolean).slice(0, 2).join(', '),
  ].filter(Boolean).join('; ')
  const focusFallback = [
    visibleNames[0],
    readText(shot.caption),
    readText(shot.title),
    readText(shot.locationRefId),
    ...readStringArray(shot.propRefIds).slice(0, 1),
  ].filter(Boolean).join(', ')
  const movement = readText(shot.videoDirection)
    || readText(shot.action)
    || readText(shot.description)
    || readText(shot.storyboardPanelPrompt)
  return seedanceDirectedControlsSchema.parse({
    cameraMotion: compactSeedanceControlText([readText(camera.framing), readText(camera.angle), readText(camera.movement)].filter(Boolean).join('; '), 18),
    subjectMotion: compactSeedanceControlText(movement, 22),
    focusTarget: compactSeedanceControlText(focusFallback || 'main visible subject and key prop', 14),
    framingLock: compactSeedanceControlText(readText(camera.framing) ? `preserve ${readText(camera.framing)} composition` : 'preserve keyframe composition and subject scale', 14),
    visibility: compactSeedanceControlText([
      visibleNames.length > 0 ? `show ${visibleNames.join(', ')}` : 'show only subjects visible in the keyframe',
      offscreenNames.length > 0 ? `${offscreenNames.join(', ')} speaks offscreen; do not reveal them` : '',
    ].filter(Boolean).join('; '), 22),
    motionIntensity: seedanceMotionIntensityForShot(shot),
    performance: compactSeedanceControlText(performanceText || readText(shot.mood) || readText(shot.caption) || readText(shot.title), 24),
    voice: compactSeedanceControlText(voiceText || (dialogueRecords.length > 0 ? 'match dialogue emotion and timing' : 'no dialogue; use silent facial/body acting'), 22),
  })
}

export function mergeSeedanceDirectedControls(primary: unknown, fallback: SeedanceDirectedControls) {
  const parsed = seedanceDirectedControlsSchema.safeParse(primary)
  const value = parsed.success ? parsed.data : seedanceDirectedControlsSchema.parse({})
  return seedanceDirectedControlsSchema.parse({
    cameraMotion: readText(value.cameraMotion) || fallback.cameraMotion,
    subjectMotion: readText(value.subjectMotion) || fallback.subjectMotion,
    focusTarget: readText(value.focusTarget) || fallback.focusTarget,
    framingLock: readText(value.framingLock) || fallback.framingLock,
    visibility: readText(value.visibility) || fallback.visibility,
    motionIntensity: readText(value.motionIntensity) || fallback.motionIntensity,
    performance: readText(value.performance) || fallback.performance,
    voice: readText(value.voice) || fallback.voice,
  })
}

export async function inferSequenceShotVideoTimingRuntime(input: {
  nodeKey: string
  shot: LooseRecord
  entityByKey?: Map<string, LooseRecord>
  runStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: z.ZodType<TValue>
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
  }) => Promise<{
    value: TValue
    provider: string
    model: string
    fallbackUsed: boolean
    fallbackReason: string
  }>
}) {
  const fallbackDuration = estimateSequenceShotVideoDurationSeconds(input.shot)
  const fallbackDirectedControls = buildSeedanceDirectedControlsFromShot({
    shot: input.shot,
    entityByKey: input.entityByKey,
  })
  const dialogue = Array.isArray(input.shot.dialogue)
    ? input.shot.dialogue.map((line) => {
      const record = asRecord(line)
      const speaker = readText(record.speakerName) || readText(record.speakerRefId) || 'Speaker'
      const text = readText(record.text)
      return text ? `${speaker}: ${text}` : ''
    }).filter(Boolean).join('\n')
    : ''
  const prompt = [
    'Infer compact video-generation controls for one Seedance shot. Ignore any screenplay marker or existing tagged duration.',
    'Base the duration only on visible action, dialogue length, camera movement, performance beats, and the time needed for a readable settle.',
    'Return the shortest realistic duration that still feels cinematic. Do not pad to 15 seconds.',
    'Also return direct, short controls for camera, subject motion, focus, framing, visibility, motion intensity, performance, and voice.',
    'For offscreen speakers, put delivery in voice and visibility, but do not imply they are visible.',
    '',
    `Title: ${readText(input.shot.title) || 'Untitled shot'}`,
    `Action: ${readText(input.shot.action) || readText(input.shot.description) || readText(input.shot.storyboardPanelPrompt)}`,
    `Video direction: ${readText(input.shot.videoDirection)}`,
    `Camera: ${readText(asRecord(input.shot.camera).framing)}; ${readText(asRecord(input.shot.camera).angle)}; ${readText(asRecord(input.shot.camera).movement)}`,
    `Performance: ${Array.isArray(input.shot.performanceBeats) ? input.shot.performanceBeats.map((beat) => readText(asRecord(beat).description) || JSON.stringify(beat)).filter(Boolean).join('; ') : ''}`,
    dialogue ? `Dialogue:\n${dialogue}` : 'Dialogue: none',
  ].join('\n')
  const result = await input.runStructuredNode({
    nodeKey: input.nodeKey,
    schemaName: 'sequence_animatic_shot_video_timing',
    schema: sequenceAnimaticShotVideoTimingSchema,
    instructions: 'You are a cinematic editor timing a single shot for reference-to-video generation. Return strict JSON only.',
    prompt,
    fallback: {
      editorialDurationSeconds: fallbackDuration,
      rationale: 'Deterministic fallback based on action, dialogue, camera movement, and settle time.',
      pacingNotes: 'Use a natural shot pace without padding to the screenplay marker.',
      directedControls: fallbackDirectedControls,
    },
    maxOutputTokens: 900,
  })
  const value = sequenceAnimaticShotVideoTimingSchema.parse(result.value)
  const directedControls = mergeSeedanceDirectedControls(value.directedControls, fallbackDirectedControls)
  return {
    editorialDurationSeconds: Math.max(1, Math.min(15, Number(value.editorialDurationSeconds) || fallbackDuration)),
    rationale: readText(value.rationale),
    pacingNotes: readText(value.pacingNotes),
    directedControls,
    provider: result.provider,
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
  }
}
