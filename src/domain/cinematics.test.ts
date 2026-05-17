// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCinematicShotTimingMap,
  buildCinematicV2StoryboardGroupPlan,
  buildCinematicV2StoryboardLayout,
  buildCinematicV3StoryboardLayout,
  buildCinematicV3StoryboardGroupPlan,
  buildCinematicSequenceFromScriptDoc,
  buildCinematicSettingsPatchFromPresetFamily,
  buildCinematicSettingsPatchFromStoryPresets,
  buildStoryStoryboardBoardPrompt,
  buildStoryTakeStillImagePrompt,
  cinematicScriptDocSchema,
  deriveTakeStoryboardPanelArtifacts,
  deriveCinematicScriptFromSequence,
  materializeCinematicGraphSettings,
  parseTakeStoryboardPanelScriptText,
  providerSafeCinematicV2DurationSeconds,
  validateCinematicV2ShotPlanReferences,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ShotPlanSchema,
} from './cinematics.ts'
import {
  buildCinematicTimelineProjection,
  buildCinematicV2TimelineProjection,
  findTimelineShotAtSeconds,
  findTimelineTakeAtSeconds,
} from './cinematicTimelineProjection.ts'
import { compileCinematicGraphFromScriptDoc } from './cinematicScriptCompiler.ts'
import { ingestCinematicCreativeScriptToAuthoredShots } from './cinematicCreativeScript.ts'
import {
  cinematicGraphSettingsSchema,
  cinematicPlanSchema,
  worldBuildPlanResponseSchema,
  worldBuildStartRequestSchema,
} from './worldBuild.ts'

test('Cinematics V2 schemas validate scene state, layout, short shots, and storyboard grids', () => {
  const screenplay = cinematicV2ScreenplayDraftSchema.parse({
    title: 'Arena Faceoff',
    screenplayMarkdown: 'Kharzag enters the arena.\n\nBrakk waits in silence.\n\nKharzag says, "You should have stayed buried."',
    sceneObjective: 'Turn a duel premise into a tense confrontation.',
    emotionalArc: 'ritual tension -> threat -> impact',
    suggestedDurationSeconds: 28,
    sourceRefIds: ['kharzag', 'brakk', 'arena'],
    visualMotifs: ['dust haze', 'low sunset rim light'],
  })
  assert.equal(screenplay.suggestedDurationSeconds, 28)
  assert.equal(cinematicV2ScreenplayDraftSchema.parse({
    title: 'Raw Screenplay',
    screenplayMarkdown: 'EXT. ARENA - SUNSET\n\nKharzag steps into the light.',
  }).title, 'Raw Screenplay')

  const sceneState = cinematicV2SceneStateSchema.parse({
    sceneId: 'scene_1',
    title: 'Arena Faceoff',
    locationRefId: 'arena',
    characterRefIds: ['kharzag', 'brakk'],
    lighting: {
      direction: 'low sunset through the east gate',
      quality: 'hard rim light',
      colorTemperature: 'warm highlights and cool shadows',
      contrast: 'high',
    },
    visualContinuity: {
      palette: ['burnt orange', 'dark iron'],
      lensLanguage: 'wide masters and tense closeups',
      cameraMovementStyle: 'controlled push-ins before fast impact shots',
    },
  })
  assert.equal(sceneState.locationRefId, 'arena')

  const layout = cinematicV2SceneLayoutPlanSchema.parse({
    sceneId: 'scene_1',
    summary: 'Kharzag starts screen-left, Brakk screen-right.',
    spatialMapDescription: 'Oval arena with east gate backlight.',
    characterPositions: [
      { characterRefId: 'kharzag', zone: 'west', facing: 'east', movementDirection: 'left-to-right' },
      { characterRefId: 'brakk', zone: 'east', facing: 'west', movementDirection: 'right-to-left' },
    ],
    cameraPlan: [
      { id: 'cam_a', purpose: 'establishing', position: 'northwest high angle', lens: '28mm', movement: 'slow push', screenDirectionRule: 'Kharzag remains screen-left.' },
    ],
  })
  assert.equal(layout.cameraPlan[0].purpose, 'establishing')

  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'scene_1',
    totalEditorialDurationSeconds: 7.5,
    shots: [
      {
        id: 'shot_1',
        index: 1,
        title: 'Arena Establishing',
        purpose: 'establishing',
        editorialDurationSeconds: 2.5,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(2.5),
        visibleCharacterRefIds: ['kharzag', 'brakk'],
        performanceBeats: [{
          characterRefId: 'kharzag',
          valence: -0.35,
          arousal: 0.78,
          confidence: 0.62,
          dominance: 0.58,
          bodyLanguage: 'shoulders forward, grip tight',
          facialExpression: 'controlled anger',
          gaze: 'locked on Brakk',
          gesture: 'slow cleaver lift',
        }],
        locationRefId: 'arena',
        camera: { framing: 'wide', angle: 'high', lens: '28mm', movement: 'push', screenDirectionRule: 'left/right locked' },
      },
      {
        id: 'shot_2',
        index: 2,
        title: 'Kharzag Threatens',
        purpose: 'dialogue',
        editorialDurationSeconds: 3,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(3),
        visibleCharacterRefIds: ['kharzag'],
        speakerRefIds: ['kharzag'],
        locationRefId: 'arena',
        dialogue: [{ id: 'line_1', speakerRefId: 'kharzag', text: 'You should have stayed buried.' }],
        camera: { framing: 'medium closeup', angle: 'low', lens: '50mm', movement: 'subtle push', screenDirectionRule: 'looks screen-right' },
        requiresLipSync: true,
      },
      {
        id: 'shot_3',
        index: 3,
        title: 'Impact Clash',
        purpose: 'impact',
        editorialDurationSeconds: 2,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(2),
        visibleCharacterRefIds: ['kharzag', 'brakk'],
        locationRefId: 'arena',
        camera: { framing: 'tight impact', angle: 'low', lens: '35mm', movement: 'short lateral track', screenDirectionRule: 'attack left-to-right' },
      },
    ],
    performanceArc: [{
      characterRefId: 'kharzag',
      startState: 'angry restraint',
      endState: 'violent commitment',
      arc: 'arousal rises while valence stays low',
    }],
  })

  assert.equal(shotPlan.shots[0].performanceBeats[0].arousal, 0.78)
  assert.throws(() => cinematicV2ShotPlanSchema.parse({
    ...shotPlan,
    shots: [{
      ...shotPlan.shots[0],
      performanceBeats: [{ ...shotPlan.shots[0].performanceBeats[0], arousal: 1.5 }],
    }],
  }))
  assert.deepEqual(buildCinematicV2StoryboardLayout(2), { rows: 2, columns: 2, panelCount: 2 })
  assert.deepEqual(buildCinematicV2StoryboardLayout(3), { rows: 2, columns: 2, panelCount: 3 })
  assert.deepEqual(buildCinematicV2StoryboardLayout(5), { rows: 3, columns: 3, panelCount: 5 })
  assert.deepEqual(buildCinematicV2StoryboardLayout(9), { rows: 3, columns: 3, panelCount: 9 })
  assert.deepEqual(buildCinematicV2StoryboardLayout(12), { rows: 3, columns: 3, panelCount: 9 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(1), { rows: 1, columns: 1, panelCount: 1 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(2), { rows: 1, columns: 2, panelCount: 2 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(3), { rows: 2, columns: 2, panelCount: 3 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(4), { rows: 2, columns: 2, panelCount: 4 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(5), { rows: 2, columns: 3, panelCount: 5 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(6), { rows: 2, columns: 3, panelCount: 6 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(7), { rows: 3, columns: 3, panelCount: 7 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(9), { rows: 3, columns: 3, panelCount: 9 })
  assert.deepEqual(buildCinematicV3StoryboardLayout(12), { rows: 3, columns: 3, panelCount: 9 })
  const groupedStoryboard = buildCinematicV2StoryboardGroupPlan({
    ...shotPlan,
    shots: Array.from({ length: 23 }, (_, index) => ({
      ...shotPlan.shots[0],
      id: `shot_${index + 1}`,
      index: index + 1,
      title: `Shot ${index + 1}`,
    })),
    totalEditorialDurationSeconds: 92,
  })
  assert.equal(groupedStoryboard.groups.length, 3)
  assert.ok(groupedStoryboard.groups.every((group) => group.panelCount <= 9))
  assert.deepEqual(
    groupedStoryboard.groups.map((group) => `${group.rows}x${group.columns}`),
    ['3x3', '3x3', '3x3'],
  )
  assert.equal(providerSafeCinematicV2DurationSeconds(1.2), 4)
  assert.equal(providerSafeCinematicV2DurationSeconds(16), 15)
  assert.deepEqual(validateCinematicV2ShotPlanReferences({
    shotPlan,
    referenceIds: ['kharzag', 'brakk', 'arena'],
  }), [])
  assert.ok(validateCinematicV2ShotPlanReferences({
    shotPlan,
    referenceIds: ['kharzag'],
  }).some((diagnostic) => diagnostic.includes('unknown cinematic ref')))
})

test('Cinematics V3 storyboard grouping creates video-sized blocks with matching crop layouts', () => {
  const shot = (index, duration) => ({
    id: `shot_${index}`,
    sceneId: 'scene_1',
    index,
    title: `Shot ${index}`,
    purpose: 'action',
    editorialDurationSeconds: duration,
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
    description: `Shot ${index} description`,
    action: `Shot ${index} action`,
    visibleCharacterRefIds: [],
    locationRefId: null,
    propRefIds: [],
    camera: { framing: 'medium', angle: 'eye level', lens: '35mm', movement: 'locked', screenDirectionRule: 'continuous' },
  })
  const grouped = buildCinematicV3StoryboardGroupPlan({
    sceneId: 'scene_1',
    totalEditorialDurationSeconds: 40,
    shots: [
      shot(1, 6),
      shot(2, 7),
      shot(3, 4),
      shot(4, 5),
      shot(5, 5),
      shot(6, 5),
      shot(7, 2),
      shot(8, 2),
      shot(9, 2),
      shot(10, 2),
    ],
  })

  assert.deepEqual(grouped.groups.map((group) => group.shotIds), [
    ['shot_1', 'shot_2'],
    ['shot_3', 'shot_4', 'shot_5'],
    ['shot_6', 'shot_7', 'shot_8', 'shot_9', 'shot_10'],
  ])
  assert.deepEqual(grouped.groups.map((group) => group.editorialDurationSeconds), [13, 14, 13])
  assert.ok(grouped.groups.every((group) => group.editorialDurationSeconds <= 15))
  assert.deepEqual(grouped.groups.map((group) => `${group.rows}x${group.columns}:${group.panelCount}`), [
    '1x2:2',
    '2x2:3',
    '2x3:5',
  ])
  assert.deepEqual(grouped.groups.map((group) => group.providerDurationSeconds), [13, 14, 13])
  assert.equal(grouped.maxDurationPerGroupSeconds, 15)
})

test('Cinematics V2 timeline projection maps editorial clips, active shots, and media fallbacks', () => {
  const shotPlan = {
    sceneId: 'scene_1',
    totalEditorialDurationSeconds: 5.5,
    shots: [
      {
        id: 'shot_1',
        index: 1,
        title: 'Wide Reveal',
        purpose: 'establishing',
        editorialDurationSeconds: 2.5,
        providerDurationSeconds: 4,
        description: 'The arena opens under sunset.',
        visibleCharacterRefIds: ['kharzag', 'brakk'],
        performanceBeats: [{
          characterRefId: 'kharzag',
          valence: -0.2,
          arousal: 0.6,
          confidence: 0.5,
          dominance: 0.5,
          bodyLanguage: 'measured stance',
          facialExpression: 'watchful',
          gaze: 'toward Brakk',
          gesture: 'still grip',
        }],
        locationRefId: 'arena',
        camera: { framing: 'wide', angle: 'high', lens: '28mm', movement: 'push', screenDirectionRule: 'locked' },
      },
      {
        id: 'shot_2',
        index: 2,
        title: 'Threat',
        purpose: 'dialogue',
        editorialDurationSeconds: 3,
        providerDurationSeconds: 4,
        action: 'Kharzag threatens Brakk.',
        visibleCharacterRefIds: ['kharzag'],
        speakerRefIds: ['kharzag'],
        locationRefId: 'arena',
        dialogue: [{ id: 'line_1', speakerRefId: 'kharzag', text: 'You should have stayed buried.', startSeconds: 0.5, endSeconds: 2.5 }],
        camera: { framing: 'closeup', angle: 'low', lens: '50mm', movement: 'subtle push', screenDirectionRule: 'looks right' },
      },
    ],
  }
  const projection = buildCinematicV2TimelineProjection({
    shotPlan,
    timeline: {
      id: 'timeline_1',
      sceneId: 'scene_1',
      durationSeconds: 5.5,
      videoClips: [
        { shotId: 'shot_1', videoAssetKey: 'video_shot_1', startTime: 0, endTime: 2.5, trimIn: 0, trimOut: 1.5 },
        { shotId: 'shot_2', videoAssetKey: null, startTime: 2.5, endTime: 5.5, trimIn: 0, trimOut: 1 },
      ],
      audioClips: [{ type: 'ambience', label: 'Arena bed', startTime: 0, endTime: 5.5, placeholder: true }],
    },
    panels: [{ id: 'panel_2', shotId: 'shot_2', assetKey: 'panel_shot_2', role: 'cinematic_v2_storyboard_panel' }],
    keyframes: [{ id: 'keyframe_2', shotId: 'shot_2', assetKey: 'keyframe_shot_2', role: 'cinematic_v2_shot_keyframe' }],
    videos: [{ id: 'video_1', shotId: 'shot_1', assetKey: 'video_shot_1', role: 'cinematic_v2_shot_video' }],
    storyboardSheets: [{ id: 'sheet_1', assetKey: 'storyboard_sheet', role: 'cinematic_v2_storyboard_sheet' }],
  })

  assert.equal(projection.totalDurationSeconds, 5.5)
  assert.equal(projection.shots[0]?.startSeconds, 0)
  assert.equal(projection.shots[0]?.endSeconds, 2.5)
  assert.equal(projection.shots[0]?.previewAssetKey, 'video_shot_1')
  assert.equal(projection.shots[0]?.previewKind, 'video')
  assert.equal(projection.shots[0]?.performanceBeats[0]?.facialExpression, 'watchful')
  assert.equal(projection.shots[1]?.previewAssetKey, 'keyframe_shot_2')
  assert.equal(projection.shots[1]?.previewKind, 'image')
  assert.equal(findTimelineShotAtSeconds(projection, 3)?.id, 'shot_2')
  assert.equal(projection.shots[0]?.subtitleCues[0]?.type, 'caption')
  assert.equal(projection.shots[0]?.subtitleCues[0]?.text, 'The arena opens under sunset.')
  assert.equal(projection.dialogueCues.find((cue) => cue.type === 'dialogue')?.startSeconds, 3)
  assert.equal(projection.audioCues[0]?.label, 'ambience')
})

test('Cinematics V2 timeline projection keeps valid shot clips when media is missing', () => {
  const projection = buildCinematicV2TimelineProjection({
    shotPlan: {
      sceneId: 'scene_1',
      totalEditorialDurationSeconds: 2,
      shots: [{
        id: 'shot_1',
        index: 1,
        title: 'Planned Shot',
        purpose: 'reaction',
        editorialDurationSeconds: 2,
        providerDurationSeconds: 4,
        description: 'A silent reaction shot.',
        camera: { framing: 'medium', angle: 'eye level', lens: '50mm', movement: 'static', screenDirectionRule: 'neutral' },
      }],
    },
  })

  assert.equal(projection.shots.length, 1)
  assert.equal(projection.shots[0]?.previewAssetKey, null)
  assert.equal(projection.shots[0]?.previewKind, 'placeholder')
  assert.equal(findTimelineShotAtSeconds(projection, 0.5)?.id, 'shot_1')
})

test('legacy UGC shots derive directing and reference packages', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'UGC Test',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
      { id: 'product_1', kind: 'item', role: 'product', label: 'Product', sourceName: 'Product' },
    ],
    shots: [{
      id: 'shot_1',
      orderIndex: 0,
      title: 'Hook',
      beat: 'The creator lifts the phone into frame and shows the app screen while admitting this is her hardest hour.',
      hookRole: 'hook',
      formatSubtype: 'creator_problem_solution',
      framing: 'tight handheld medium close-up',
      cameraAngle: 'eye level',
      cameraMovement: 'slow handheld push-in',
      lensPreference: 'phone-native 28mm equivalent',
      visualPrompt: 'soft daylight, realistic phone-native texture',
      compositionGuide: 'keep the phone screen readable and the face stable',
      participantRefIds: ['creator_1'],
      propRefIds: ['product_1'],
      dialogue: [{ id: 'd1', line: 'This is the hour I usually want a drink.', delivery: 'quiet confession' }],
      actions: [{ id: 'a1', verb: 'lifts the phone into frame', propRefId: 'product_1' }],
      audio: [],
    }],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)
  const shot = sequence.shots[0]
  const take = sequence.takes[0]

  assert.equal(shot.directingPackage.primaryCameraMove, 'slow handheld push-in')
  assert.ok(shot.directingPackage.dominantAction.length > 0)
  assert.ok(shot.referencePlan.requiredRoles.includes('subject_lock'))
  assert.ok(shot.referencePlan.requiredRoles.includes('prop_lock'))
  assert.ok(shot.referencePlan.requiredRoles.includes('proof_surface_lock'))
  assert.ok(take.directingPackage.dominantAction.length > 0)
  assert.ok(take.referencePlan.requiredRoles.includes('proof_surface_lock'))
})

test('UGC take shaping breaks on editorial beat boundaries', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Take Split Test',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
      { id: 'product_1', kind: 'item', role: 'product', label: 'Product', sourceName: 'Product' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Hook',
        beat: 'She pauses with the drink in her hand and looks into the front camera.',
        hookRole: 'hook',
        formatSubtype: 'creator_problem_solution',
        cameraMovement: 'static handheld',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        actions: [{ id: 'a1', verb: 'pauses with the drink in her hand', propRefId: 'product_1' }],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'Proof',
        beat: 'She opens the app and starts the guided reset on screen.',
        hookRole: 'proof',
        formatSubtype: 'creator_problem_solution',
        cameraMovement: 'slow push-in',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        actions: [{ id: 'a2', verb: 'opens the app', propRefId: 'product_1' }],
      },
      {
        id: 'shot_3',
        orderIndex: 2,
        title: 'Payoff',
        beat: 'She sets the drink down and exhales with the phone still visible.',
        hookRole: 'payoff',
        formatSubtype: 'creator_problem_solution',
        cameraMovement: 'locked handheld',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        actions: [{ id: 'a3', verb: 'sets the drink down', propRefId: 'product_1' }],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok(sequence.takes.length >= 2)
})

test('cinematic script compiler groups dynamic runtimes into natural max-15s takes', () => {
  const makeShot = (index, durationSeconds) => ({
    id: `shot_${index}`,
    orderIndex: index - 1,
    title: `Shot ${index}`,
    beat: `The scene advances through visual beat ${index}.`,
    shotType: 'custom',
    framing: 'medium cinematic frame',
    cameraMovement: 'steady slow push',
    visualPrompt: `visual beat ${index}`,
    compositionGuide: 'keep blocking continuous and readable',
    participantRefIds: ['eva'],
    locationRefId: 'garden',
    durationSeconds,
    actions: [{ id: `a${index}`, actorRefId: 'eva', verb: `performs beat ${index}` }],
  })
  const script = cinematicScriptDocSchema.parse({
    title: 'Dynamic Runtime Test',
    entityBindings: [
      { id: 'eva', kind: 'character', role: 'singer', label: 'Eva-9', sourceName: 'Eva-9' },
      { id: 'garden', kind: 'environment', role: 'location', label: 'Skybridge Garden', sourceName: 'Skybridge Garden' },
    ],
    shots: [5, 5, 5, 5, 5, 5, 4, 4].map((duration, index) => makeShot(index + 1, duration)),
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.deepEqual(sequence.takes.map((take) => take.durationSeconds), [15, 15, 8])
  assert.ok(sequence.takes.every((take) => take.durationSeconds <= 15))

  const shortScript = cinematicScriptDocSchema.parse({
    title: 'Short Runtime Test',
    entityBindings: script.entityBindings,
    shots: [4, 4, 3].map((duration, index) => makeShot(index + 1, duration)),
  })
  const shortSequence = buildCinematicSequenceFromScriptDoc(shortScript)

  assert.deepEqual(shortSequence.takes.map((take) => take.durationSeconds), [11])
})

test('UGC shot duration inference stays inside preset pacing bands', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Pacing Test',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
      { id: 'product_1', kind: 'item', role: 'product', label: 'Product', sourceName: 'Product' },
    ],
    shots: [{
      id: 'shot_1',
      orderIndex: 0,
      title: 'Hook',
      beat: 'She looks into the front camera, names the late-night stress spiral, and starts reframing it out loud.',
      hookRole: 'hook',
      formatSubtype: 'creator_reframe',
      participantRefIds: ['creator_1'],
      propRefIds: ['product_1'],
      dialogue: [{
        id: 'd1',
        line: 'If you hit that late-night point where your skin feels too tight and your brain starts bargaining for a drink, that is not some secret proof that you are weak or broken or missing discipline.',
        delivery: 'quiet direct-to-camera confession',
      }],
      actions: [{ id: 'a1', verb: 'raises the phone into selfie position', propRefId: 'product_1' }],
      audio: [],
    }],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok((sequence.shots[0]?.durationSeconds ?? 0) >= 2)
  assert.ok((sequence.shots[0]?.durationSeconds ?? 0) <= 4)
})

test('variation groups force take splits and survive compilation', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Variation Pack Test',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
      { id: 'product_1', kind: 'item', role: 'product', label: 'Product', sourceName: 'Product' },
    ],
    shots: [
      {
        id: 'shot_1_primary',
        orderIndex: 0,
        title: 'Primary Hook',
        beat: 'The creator names the late-night stress loop directly into the phone camera.',
        hookRole: 'hook',
        formatSubtype: 'creator_reframe',
        creativeTreatment: 'creator_direct_to_camera',
        hookFamily: 'wrong_belief_interrupt',
        narrationMode: 'spoken_to_camera',
        variationGroupId: 'variation_primary',
        variationLabel: 'Primary Recommended',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        actions: [{ id: 'a1', verb: 'raises the phone into selfie position', propRefId: 'product_1' }],
      },
      {
        id: 'shot_1_backdrop',
        orderIndex: 1,
        title: 'Backdrop Hook',
        beat: 'Calm evening backdrop footage plays while the narrator reframes the stress behavior.',
        hookRole: 'hook',
        formatSubtype: 'creator_reframe',
        creativeTreatment: 'narrator_over_backdrop',
        hookFamily: 'wrong_belief_interrupt',
        narrationMode: 'spoken_over_footage',
        backdropRole: 'engagement_backdrop',
        backdropStrategy: 'Use calm backdrop footage while the narration reframes the problem.',
        variationGroupId: 'variation_backdrop',
        variationLabel: 'Narrator Backdrop',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        actions: [{ id: 'a2', verb: 'holds the phone lower while evening footage stays dominant', propRefId: 'product_1' }],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.equal(sequence.takes.length, 2)
  assert.equal(sequence.takes[0]?.variationLabel, 'Primary Recommended')
  assert.equal(sequence.takes[1]?.variationLabel, 'Narrator Backdrop')
  assert.equal(sequence.takes[1]?.creativeTreatment, 'narrator_over_backdrop')
})

test('UGC preset families default to the creative-script ingestion pipeline', () => {
  const ugcSettings = buildCinematicSettingsPatchFromPresetFamily('ugc_creator')
  const storySettings = buildCinematicSettingsPatchFromPresetFamily('story_movie_tv')

  assert.equal(ugcSettings.authorshipPipeline, 'ugc_script_ingest_v1')
  assert.equal(storySettings.authorshipPipeline, 'story_script_ingest_v1')
})

test('story preset patches lock scene and language selectors with story pacing defaults', () => {
  const settings = buildCinematicSettingsPatchFromStoryPresets('interrogation_pressure_cooker', 'precision_procedural')

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'interrogation_pressure_cooker')
  assert.equal(settings.storyLanguagePreset, 'precision_procedural')
  assert.equal(settings.formatSubtype, null)
  assert.equal(settings.authorshipPipeline, 'story_script_ingest_v1')
  assert.deepEqual(settings.targetShotCountRange, [5, 9])
  assert.deepEqual(settings.idealShotDurationRangeSeconds, [3, 7])
})

test('action story preset patches derive combat pacing defaults', () => {
  const settings = buildCinematicSettingsPatchFromStoryPresets('duel_showdown', 'tactical_combat')

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'duel_showdown')
  assert.equal(settings.storyLanguagePreset, 'tactical_combat')
  assert.equal(settings.authorshipPipeline, 'story_script_ingest_v1')
  assert.deepEqual(settings.targetShotCountRange, [3, 6])
  assert.deepEqual(settings.idealShotDurationRangeSeconds, [2, 5])
  assert.equal(settings.maxDialogueWordsPerShot, 14)
  assert.equal(settings.maxActionBeatsPerShot, 5)
})

test('materialized graph settings preserve explicit story presets without project overrides', () => {
  const settings = materializeCinematicGraphSettings({
    presetFamily: 'story_movie_tv',
    storyScenePreset: 'duel_showdown',
    storyLanguagePreset: 'tactical_combat',
  })

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'duel_showdown')
  assert.equal(settings.storyLanguagePreset, 'tactical_combat')
  assert.equal(settings.formatSubtype, null)
})

test('world build cinematic graph settings allow nullable story string fields', () => {
  const parsed = cinematicGraphSettingsSchema.parse({
    presetFamily: 'story_movie_tv',
    storyScenePreset: 'duel_showdown',
    storyLanguagePreset: 'tactical_combat',
    ctaStyle: null,
    proofMoment: null,
  })

  assert.equal(parsed.ctaStyle, null)
  assert.equal(parsed.proofMoment, null)
})

test('shot timing round-trips through script and sequence without drift', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Roundtrip',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Opening',
        beat: 'The creator turns toward the camera and starts the hook.',
        participantRefIds: ['creator_1'],
        durationSeconds: 3,
        dialogue: [{ id: 'd1', speakerRefId: 'creator_1', line: 'Wait, stop doing this.', startSeconds: 0, endSeconds: 2 }],
        actions: [{ id: 'a1', actorRefId: 'creator_1', verb: 'turns toward the camera', startSeconds: 0, endSeconds: 3 }],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'Proof',
        beat: 'The phone screen fills frame and shows the product working.',
        hookRole: 'proof',
        participantRefIds: ['creator_1'],
        durationSeconds: 5,
        dialogue: [],
        actions: [{ id: 'a2', actorRefId: 'creator_1', verb: 'holds the phone toward camera', startSeconds: 0, endSeconds: 4 }],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)
  const roundTrip = deriveCinematicScriptFromSequence(sequence)

  assert.equal(sequence.shots[0]?.startSeconds, 0)
  assert.equal(sequence.shots[0]?.endSeconds, 3)
  assert.equal(sequence.shots[1]?.startSeconds, 3)
  assert.equal(sequence.shots[1]?.endSeconds, 8)
  assert.equal(roundTrip.shots[0]?.startSeconds, 0)
  assert.equal(roundTrip.shots[0]?.endSeconds, 3)
  assert.equal(roundTrip.shots[1]?.startSeconds, 3)
  assert.equal(roundTrip.shots[1]?.endSeconds, 8)
})

test('compiler fills ordered local timing windows for untimed shot beats', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Local Timing Fill',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Hook',
        beat: 'The creator demonstrates the problem and then points at the fix.',
        participantRefIds: ['creator_1'],
        durationSeconds: 6,
        dialogue: [
          { id: 'd1', speakerRefId: 'creator_1', line: 'This is the part everyone gets wrong.' },
          { id: 'd2', speakerRefId: 'creator_1', line: 'Here is the fix.' },
        ],
        actions: [
          { id: 'a1', actorRefId: 'creator_1', verb: 'holds up the product' },
          { id: 'a2', actorRefId: 'creator_1', verb: 'points at the result screen' },
        ],
        audio: [
          { id: 'au1', kind: 'sfx', cue: 'soft whoosh accent' },
          { id: 'au2', kind: 'music', cue: 'uplift sting' },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)
  const shot = sequence.shots[0]

  assert.ok(typeof shot?.dialogue[0]?.startSeconds === 'number')
  assert.ok(typeof shot?.dialogue[0]?.endSeconds === 'number')
  assert.ok(typeof shot?.dialogue[1]?.startSeconds === 'number')
  assert.ok(typeof shot?.dialogue[1]?.endSeconds === 'number')
  assert.ok((shot?.dialogue[0]?.endSeconds ?? 0) <= (shot?.dialogue[1]?.startSeconds ?? 0))
  assert.ok((shot?.actions[0]?.endSeconds ?? 0) <= (shot?.actions[1]?.startSeconds ?? 0))
  assert.notEqual(shot?.audio[0]?.endSeconds, shot?.durationSeconds)
  assert.equal(shot?.audio[1]?.endSeconds, shot?.durationSeconds)
  assert.ok((shot?.audio[0]?.startSeconds ?? 0) < (shot?.audio[1]?.startSeconds ?? 0))
})

test('shot timing map reflows contiguous durations and updates take windows', () => {
  const timingMap = buildCinematicShotTimingMap([
    { id: 'shot_1', durationSeconds: 2 },
    { id: 'shot_2', durationSeconds: 4 },
    { id: 'shot_3', durationSeconds: 3 },
  ])

  assert.deepEqual(timingMap.get('shot_1'), { id: 'shot_1', durationSeconds: 2, startSeconds: 0, endSeconds: 2 })
  assert.deepEqual(timingMap.get('shot_2'), { id: 'shot_2', durationSeconds: 4, startSeconds: 2, endSeconds: 6 })
  assert.deepEqual(timingMap.get('shot_3'), { id: 'shot_3', durationSeconds: 3, startSeconds: 6, endSeconds: 9 })
})

test('timeline projection resolves cue timing, preview fallback, and active ranges', () => {
  const sequence = buildCinematicSequenceFromScriptDoc(cinematicScriptDocSchema.parse({
    title: 'Timeline Projection',
    entityBindings: [
      { id: 'creator_1', kind: 'character', role: 'creator', label: 'Creator', sourceName: 'Creator' },
      { id: 'product_1', kind: 'item', role: 'product', label: 'Product', sourceName: 'Product' },
    ],
    storyboard: {
      mode: 'shot_panels',
      summary: '',
      sequenceAssetKey: 'asset.sequence_board',
      panels: [{
        id: 'panel_1',
        shotId: 'shot_1',
        title: 'Hook Panel',
        assetKey: 'asset.panel_1',
        notes: '',
        orderIndex: 0,
      }],
    },
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Hook',
        beat: 'The creator points at the phone and opens with a sharp hook.',
        hookRole: 'hook',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        storyboardRefIds: ['panel_1'],
        durationSeconds: 3,
        dialogue: [{
          id: 'd1',
          speakerRefId: 'creator_1',
          line: 'This changes everything.',
          startSeconds: 1,
          endSeconds: 3,
        }],
        actions: [{ id: 'a1', actorRefId: 'creator_1', verb: 'points at the phone', startSeconds: 0, endSeconds: 2 }],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'Payoff',
        beat: 'The phone stays in frame as the creator shows the result.',
        hookRole: 'payoff',
        participantRefIds: ['creator_1'],
        propRefIds: ['product_1'],
        durationSeconds: 4,
        dialogue: [],
        actions: [{ id: 'a2', actorRefId: 'creator_1', verb: 'shows the result screen', startSeconds: 0, endSeconds: 4 }],
      },
    ],
  }))
  const projection = buildCinematicTimelineProjection({
    ...sequence,
    shots: sequence.shots.map((shot) => shot.id === 'shot_2' ? { ...shot, stillAssetKey: 'asset.shot_2' } : shot),
    takes: sequence.takes.map((take, index) => index === 0 ? { ...take, previewImageAssetKey: 'asset.take_1' } : take),
  })

  assert.equal(projection.shots[0]?.previewAssetKey, 'asset.panel_1')
  assert.equal(projection.shots[1]?.previewAssetKey, 'asset.shot_2')
  assert.equal(projection.dialogueCues[0]?.startSeconds, 1)
  assert.equal(projection.dialogueCues[0]?.endSeconds, 3)
  assert.equal(findTimelineShotAtSeconds(projection, 0.5)?.id, 'shot_1')
  assert.equal(findTimelineShotAtSeconds(projection, 3.5)?.id, 'shot_2')
  assert.equal(findTimelineTakeAtSeconds(projection, 1.5)?.id, projection.takes[0]?.id)
})

test('world build request and response schemas accept story authorship pipeline for cinematic graphs', () => {
  const cinematicPlan = cinematicPlanSchema.parse({
    graphName: 'Arena Duel',
    graphSummary: 'Kharzag fights Brakk in the arena.',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'story_movie_tv',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      authorshipPipeline: 'story_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_01_faceoff',
        title: 'Face-off',
        participantRefIds: ['kharzag', 'brakk'],
        locationRefId: 'arena_1',
      },
    ],
  })

  const planResponse = worldBuildPlanResponseSchema.parse({
    plannerMode: 'cinematic_build',
    requestSummary: 'Build a cinematic duel.',
    planItems: [],
    cinematicPlan,
    diagnostics: [],
  })

  const startRequest = worldBuildStartRequestSchema.parse({
    plannerMode: 'cinematic_build',
    prompt: 'Create a cinematic where Kharzag fights Brakk in the arena.',
    requestSummary: 'Build a cinematic duel.',
    snapshot: {
      workspace: { id: 'workspace_1', name: 'Workspace', slug: 'workspace', role: 'owner' },
      project: { id: 'project_1', name: 'Project', slug: 'project', summary: '', visibility: 'private' },
      draft: { id: 'draft_1', name: 'Draft', version: 1, isPrimary: true, updatedAt: '2026-04-19T00:00:00.000Z', metadata: {} },
      definitions: [],
      graphs: [],
      assets: [],
      gameSpec: null,
    },
    planItems: [],
    cinematicPlan: planResponse.cinematicPlan,
    model: 'gpt-5.4',
  })

  assert.equal(planResponse.cinematicPlan?.graphSettings.authorshipPipeline, 'story_script_ingest_v1')
  assert.equal(startRequest.cinematicPlan?.graphSettings.authorshipPipeline, 'story_script_ingest_v1')
})

test('story duel shots keep dense continuous action inside one readable exchange', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Duel',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
      { id: 'arena_1', kind: 'environment', role: 'arena', label: 'Arena', sourceName: 'Arena' },
    ],
    shots: [{
      id: 'shot_1',
      orderIndex: 0,
      title: 'Continuous exchange',
      beat: 'Kharzag and Brakk close, trade steel in one continuous exchange, then Kharzag drives Brakk backward before the next reset.',
      hookRole: 'proof',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      participantRefIds: ['fighter_1', 'fighter_2'],
      locationRefId: 'arena_1',
      actions: [
        { id: 'a1', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'closes the distance with his sword raised' },
        { id: 'a2', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'parries and circles left' },
        { id: 'a3', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'presses with another linked strike' },
        { id: 'a4', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'blocks and stumbles back a half step' },
        { id: 'a5', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'drives him backward with the final heavy clash' },
      ],
    }],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.equal(sequence.shots.length, 1)
  assert.equal(sequence.shots[0]?.actions.length, 5)
  assert.ok((sequence.shots[0]?.durationSeconds ?? 0) >= 3)
  assert.ok((sequence.shots[0]?.durationSeconds ?? 0) <= 6)
  assert.equal(sequence.takes[0]?.storyboardPanelStatus, 'generated')
  assert.ok((sequence.takes[0]?.storyboardPanelPlan?.panels.length ?? 0) >= 2)
  assert.match(sequence.takes[0]?.storyboardPanelScriptText ?? '', /PANEL 1/)
})

test('story duel sequence packs tactical beats into fewer action takes', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Arena duel',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
      { id: 'arena_1', kind: 'environment', role: 'arena', label: 'Arena', sourceName: 'Arena' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Arena lock-in',
        beat: 'The arena pit opens wide under hard lights with both fighters reading the distance and line of attack.',
        hookRole: 'hook',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a1', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'tightens his grip and squares up' },
          { id: 'a2', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'plants his stance on the center line' },
        ],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'First test',
        beat: 'Kharzag probes Brakk and Brakk absorbs the first test without giving ground.',
        hookRole: 'setup',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a3', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'steps in with a short cleaver probe' },
          { id: 'a4', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'catches the line on a compact guard' },
        ],
      },
      {
        id: 'shot_3',
        orderIndex: 2,
        title: 'Advantage shifts',
        beat: 'Brakk surges forward and forces Kharzag to give ground under pressure.',
        hookRole: 'proof',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a5', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'surges forward and owns the center line' },
          { id: 'a6', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'yields a step while guarding high' },
        ],
      },
      {
        id: 'shot_4',
        orderIndex: 3,
        title: 'Disarm turn',
        beat: 'Kharzag slips inside the pressure and turns the angle with a tight counter.',
        hookRole: 'proof',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a7', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'slips inside and cuts across the line' },
          { id: 'a8', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'recoils as the angle breaks' },
        ],
      },
      {
        id: 'shot_5',
        orderIndex: 4,
        title: 'Final control',
        beat: 'Both fighters slow and reset, but Kharzag now holds the better ground in the arena.',
        hookRole: 'payoff',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a9', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'holds center with the cleaver low and ready' },
          { id: 'a10', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'steps back and resets his shoulders' },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok(sequence.takes.length <= 2)
  assert.ok((sequence.takes[0]?.shotIds.length ?? 0) >= 3)
})

test('story action sequences ignore overused forced take breaks inside one continuous arena exchange', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Forced break duel',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
      { id: 'arena_1', kind: 'environment', role: 'arena', label: 'Arena', sourceName: 'Arena' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Entry',
        beat: 'Kharzag enters fast and Brakk absorbs the opening clash.',
        hookRole: 'hook',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        forceTakeBreak: true,
        actions: [
          { id: 'a1', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'drives in with a chopping advance' },
          { id: 'a2', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'turns the attack aside with force' },
        ],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'Pressure',
        beat: 'Brakk crowds Kharzag back and the footing battle takes over the center lane.',
        hookRole: 'proof',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        forceTakeBreak: true,
        actions: [
          { id: 'a3', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'drives the shoulder line forward' },
          { id: 'a4', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'slides aside and retakes a sliver of space' },
        ],
      },
      {
        id: 'shot_3',
        orderIndex: 2,
        title: 'Reversal',
        beat: 'Kharzag turns the next push into a visible reversal and breaks Brakk off the center.',
        hookRole: 'payoff',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        forceTakeBreak: true,
        actions: [
          { id: 'a5', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'twists the line and yanks the guard open' },
          { id: 'a6', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'stumbles off the center' },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok(sequence.takes.length <= 2)
  assert.ok(sequence.takes.some((take) => take.shotIds.length >= 2))
})

test('story action take packing tolerates missing per-shot story preset metadata', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Metadata drift duel',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
      { id: 'arena_1', kind: 'environment', role: 'arena', label: 'Arena', sourceName: 'Arena' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Face-off',
        beat: 'Kharzag and Brakk square off in the center lane of the arena.',
        hookRole: 'hook',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a1', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'plants the cleaver low' },
          { id: 'a2', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'holds the center line' },
        ],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'First entry',
        beat: 'Kharzag bursts in and Brakk meets the first clash head on.',
        hookRole: 'setup',
        storyScenePreset: null,
        storyLanguagePreset: null,
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a3', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'drives in with a chopping advance' },
          { id: 'a4', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'catches and shoves the attack off-line' },
        ],
      },
      {
        id: 'shot_3',
        orderIndex: 2,
        title: 'Pressure trade',
        beat: 'Brakk presses forward and Kharzag slips aside to reclaim a sliver of space.',
        hookRole: 'proof',
        storyScenePreset: null,
        storyLanguagePreset: null,
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a5', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'crowds the line with shoulder pressure' },
          { id: 'a6', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'slides off and resets the lane' },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok(sequence.takes.length <= 2)
  assert.ok(sequence.takes.some((take) => take.shotIds.length >= 2))
})

test('quiet dialogue takes skip storyboard panel scripting', () => {
  const panels = deriveTakeStoryboardPanelArtifacts({
    title: 'Quiet exchange',
    shots: [{
      id: 'shot_1',
      title: 'Shared silence',
      beat: 'They hold eye contact across the table and let the silence sit.',
      cameraAngle: 'eye level',
      cameraMovement: 'static',
      framing: 'medium two-shot',
      participantRefIds: ['speaker_1', 'speaker_2'],
      locationRefId: 'room_1',
      propRefIds: [],
      storyScenePreset: 'dialogue_two_hander',
      storyLanguagePreset: 'grounded_naturalist',
      actions: [{ id: 'a1', actorRefId: 'speaker_1', targetRefId: 'speaker_2', verb: 'holds eye contact across the table' }],
    }],
  })

  assert.equal(panels.storyboardPanelStatus, 'none')
  assert.equal(panels.storyboardPanelPlan, null)
  assert.equal(panels.storyboardPanelScriptText, '')
})

test('combat-flavored take beats generate storyboard panel scripts even with light action arrays', () => {
  const panels = deriveTakeStoryboardPanelArtifacts({
    title: 'Arena fight',
    shots: [{
      id: 'shot_1',
      title: 'Steel meets in the arena',
      beat: 'Kharzag fights Brakk in the arena, closing hard and forcing Brakk to give ground while the camera tracks the clash.',
      cameraAngle: 'low angle',
      cameraMovement: 'fast lateral tracking',
      framing: 'wide combat two-shot',
      participantRefIds: ['kharzag', 'brakk'],
      locationRefId: 'arena_1',
      propRefIds: [],
      storyScenePreset: null,
      storyLanguagePreset: null,
      actions: [{ id: 'a1', actorRefId: 'kharzag', targetRefId: 'brakk', verb: 'drives forward into the fight' }],
    }],
  })

  assert.equal(panels.storyboardPanelStatus, 'generated')
  assert.ok((panels.storyboardPanelPlan?.panels.length ?? 0) >= 2)
  assert.doesNotMatch(panels.storyboardPanelScriptText, /Focus this panel on the/i)
  assert.doesNotMatch(panels.storyboardPanelScriptText, /visually distinct from the previous one/i)
  assert.doesNotMatch(panels.storyboardPanelScriptText, /Opening commitment|Pressure change|Turn \/ payoff/i)
  assert.ok((panels.storyboardPanelPlan?.panels ?? []).every((panel) => panel.cameraAngle === '' && panel.cameraMotion === ''))
})

test('storyboard panel script text parses back into panel metadata', () => {
  const panels = parseTakeStoryboardPanelScriptText(`
TAKE: Take 1

PANEL 1
SHOT: shot_1
TITLE: Arena lock-in
DESCRIPTION: Kharzag and Brakk hold the line across the pit.
CAMERA_ANGLE: Eye-level wide.
CAMERA_MOTION: Slow push.

PANEL 2
SHOT: shot_2
TITLE: First clash
DESCRIPTION: Kharzag crashes in and Brakk jams the entry.
CAMERA_ANGLE: Chest-high combat angle.
CAMERA_MOTION: Lateral follow.
  `)

  assert.equal(panels.length, 2)
  assert.equal(panels[0]?.shotId, 'shot_1')
  assert.equal(panels[1]?.title, 'First clash')
  assert.match(panels[1]?.description ?? '', /Brakk jams the entry/i)
  assert.match(panels[1]?.cameraMotion ?? '', /Lateral follow/i)
})

test('story shots compile into story takes without relying on formatSubtype', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Interrogation',
    entityBindings: [
      { id: 'detective_1', kind: 'character', role: 'detective', label: 'Detective', sourceName: 'Detective' },
      { id: 'suspect_1', kind: 'character', role: 'suspect', label: 'Suspect', sourceName: 'Suspect' },
      { id: 'room_1', kind: 'environment', role: 'interrogation_room', label: 'Interview Room', sourceName: 'Interview Room' },
    ],
    shots: [
      {
        id: 'shot_1',
        sceneId: 'scene_1',
        orderIndex: 0,
        title: 'Asymmetry',
        beat: 'The detective leans in across the metal table while the suspect stays pinned in silence.',
        hookRole: 'hook',
        storyScenePreset: 'interrogation_pressure_cooker',
        storyLanguagePreset: 'precision_procedural',
        participantRefIds: ['detective_1', 'suspect_1'],
        locationRefId: 'room_1',
        actions: [{ id: 'a1', actorRefId: 'detective_1', targetRefId: 'suspect_1', verb: 'leans in across the table' }],
      },
      {
        id: 'shot_2',
        sceneId: 'scene_1',
        orderIndex: 1,
        title: 'Crack',
        beat: 'The suspect finally looks down and admits he hid the ledger under the sink.',
        hookRole: 'proof',
        storyScenePreset: 'interrogation_pressure_cooker',
        storyLanguagePreset: 'precision_procedural',
        participantRefIds: ['suspect_1'],
        locationRefId: 'room_1',
        actions: [{ id: 'a2', actorRefId: 'suspect_1', verb: 'looks down and admits the truth' }],
        dialogue: [{ id: 'd1', speakerRefId: 'suspect_1', line: 'It is under the sink.', delivery: 'cracking under pressure' }],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)
  const roundTrippedScript = deriveCinematicScriptFromSequence(sequence)

  assert.ok(sequence.takes.length >= 1)
  assert.equal(sequence.shots[0]?.storyScenePreset, 'interrogation_pressure_cooker')
  assert.equal(sequence.shots[0]?.storyLanguagePreset, 'precision_procedural')
  assert.equal(sequence.shots[0]?.formatSubtype, null)
  assert.equal(sequence.takes[0]?.storyScenePreset, 'interrogation_pressure_cooker')
  assert.equal(sequence.takes[0]?.storyLanguagePreset, 'precision_procedural')
  assert.equal(roundTrippedScript.shots[0]?.storyScenePreset, 'interrogation_pressure_cooker')
  assert.equal(roundTrippedScript.shots[0]?.formatSubtype, null)
})

test('creative script ingestion preserves shot ids and dialogue verbatim', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Wellness',
    graphSummary: 'Creator reframe',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'ugc_creator',
      formatSubtype: 'creator_reframe',
      narrationMode: 'spoken_to_camera',
      authorshipPipeline: 'ugc_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_01_hook',
        title: 'Hook',
        hookRole: 'hook',
        formatSubtype: 'creator_reframe',
        narrationMode: 'spoken_to_camera',
        participantRefIds: ['creator_1'],
        propRefIds: ['phone_1'],
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '## SHOT: shot_01_hook',
      'PURPOSE: Stop-scroll reframe.',
      'ON_SCREEN: She pauses in selfie mode and looks straight into camera like she caught herself in the nightly spiral.',
      'DIALOGUE_OR_VO: If your brain jumps straight to I need a drink, that does not automatically mean you are weak.',
      'CAMERA: Tight handheld selfie close-up, eye-level, slight wrist drift.',
      'AUDIO: Quiet room tone.',
    ].join('\n'),
  })

  assert.equal(ingested.authoredShots[0]?.id, 'shot_01_hook')
  assert.equal(
    ingested.authoredShots[0]?.dialogue[0]?.line,
    'If your brain jumps straight to I need a drink, that does not automatically mean you are weak.',
  )
  assert.match(ingested.authoredShots[0]?.actions[0]?.verb ?? '', /nightly spiral/i)
})

test('spoken-over-footage creative scripts ingest voiceover into audio without forcing dialogue', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Backdrop',
    graphSummary: 'Narrated backdrop ad',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'ugc_creator',
      formatSubtype: 'creator_reframe',
      narrationMode: 'spoken_over_footage',
      authorshipPipeline: 'ugc_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_02_backdrop',
        title: 'Backdrop',
        hookRole: 'setup',
        formatSubtype: 'creator_reframe',
        narrationMode: 'spoken_over_footage',
        participantRefIds: ['creator_1'],
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '## SHOT: shot_02_backdrop',
      'PURPOSE: Calm backdrop with sharp narration.',
      'ON_SCREEN: Calm evening footage drifts across the kitchen while the creator stays off camera.',
      'DIALOGUE_OR_VO: This is the part where people think they need more discipline, when usually they just need relief.',
      'CAMERA: Slow handheld drift over calm home details.',
      'AUDIO: Soft room tone under the voiceover.',
    ].join('\n'),
  })

  assert.equal(ingested.authoredShots[0]?.dialogue.length, 0)
  assert.equal(
    ingested.authoredShots[0]?.audio[0]?.cue,
    'This is the part where people think they need more discipline, when usually they just need relief.',
  )
})

test('visual-only creative scripts ingest without dialogue and keep visible action', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Faceless',
    graphSummary: 'Proof demo',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'ugc_faceless_format',
      formatSubtype: 'faceless_demo',
      narrationMode: 'visual_only',
      authorshipPipeline: 'ugc_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_03_proof',
        title: 'Proof',
        hookRole: 'proof',
        formatSubtype: 'faceless_demo',
        narrationMode: 'visual_only',
        propRefIds: ['phone_1'],
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '## SHOT: shot_03_proof',
      'PURPOSE: Show the app solving something in-frame.',
      'ON_SCREEN: The phone fills the frame, the thumb taps the reset, and the guided routine starts visibly on screen.',
      'DIALOGUE_OR_VO:',
      'CAMERA: Tight phone insert with natural handheld micro-movement.',
      'AUDIO: Soft thumb taps only.',
    ].join('\n'),
  })

  assert.equal(ingested.authoredShots[0]?.dialogue.length, 0)
  assert.ok((ingested.authoredShots[0]?.actions[0]?.verb ?? '').includes('phone fills the frame'))
  assert.equal(ingested.authoredShots[0]?.audio[0]?.cue, 'Soft thumb taps only.')
})

test('story takes derive a representative still prompt', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Arena Duel',
    entityBindings: [
      { id: 'kharzag', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag', summary: 'orc warrior' },
      { id: 'brakk', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk', summary: 'tauren bull-man' },
    ],
    shots: [{
      id: 'shot_1',
      orderIndex: 0,
      title: 'Clash',
      beat: 'Kharzag and Brakk crash together in the arena and lock blades at the center of the pit.',
      visualPrompt: 'Kharzag and Brakk clash swords in the arena',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      participantRefIds: ['kharzag', 'brakk'],
      actions: [{ id: 'a1', actorRefId: 'kharzag', targetRefId: 'brakk', verb: 'crashes into the duel' }],
      dialogue: [],
      audio: [],
    }],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.match(sequence.takes[0]?.representativeStillPrompt ?? '', /Kharzag|Brakk|arena/i)
})

test('story take still prompt stays compact and visual', () => {
  const prompt = buildStoryTakeStillImagePrompt({
    representativeStillPrompt: 'Kharzag and Brakk clash swords in the arena',
    representativeFrameSeconds: 2.2,
    sceneBias: 'duel showdown',
    cameraBias: 'tactical combat',
    entitySummaries: ['Ingredient refs: Kharzag, Brakk.'],
  })

  assert.match(prompt, /Create one cinematic still image\./i)
  assert.match(prompt, /Visual: Kharzag and Brakk clash swords in the arena\./i)
  assert.match(prompt, /Ingredient refs: Kharzag, Brakk\./i)
  assert.doesNotMatch(prompt, /Use the supplied reference images as the canonical look/i)
  assert.doesNotMatch(prompt, /Scene bias:/i)
  assert.doesNotMatch(prompt, /Camera bias:/i)
  assert.doesNotMatch(prompt, /Representative frame:/i)
  assert.doesNotMatch(prompt, /Composition:/i)
  assert.doesNotMatch(prompt, /directing package/i)
})

test('story storyboard board prompt uses simple panel beats and omits heavy style framing', () => {
  const prompt = buildStoryStoryboardBoardPrompt({
    panelDescriptions: [
      'Kharzag and Brakk clash swords',
      'Kharzag grabs Brakk by the neck',
      'Brakk drives him back into the railing',
    ],
    entitySummaries: ['Kharzag: orc warrior.', 'Brakk: tauren bull-man.'],
  })

  assert.match(prompt, /3x3|2x2/i)
  assert.match(prompt, /PANEL 1: Kharzag and Brakk clash swords\./i)
  assert.match(prompt, /Brakk: tauren bull-man\./i)
  assert.doesNotMatch(prompt, /grayscale wash/i)
  assert.doesNotMatch(prompt, /clean gutters/i)
  assert.doesNotMatch(prompt, /composition/i)
})

test('story creative scripts ingest scene headings and speaker-prefixed dialogue', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Arena Duel',
    graphSummary: 'Kharzag fights Brakk in the arena.',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'story_movie_tv',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      authorshipPipeline: 'story_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_01_faceoff',
        title: 'Face-off',
        sceneId: 'scene_1',
        participantRefIds: ['kharzag', 'brakk'],
        locationRefId: 'arena_1',
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '# SCENE: Arena Floor',
      '## SHOT: shot_01_faceoff',
      'ACTION: Kharzag and Brakk circle in the torchlit sand until Kharzag snaps forward first.',
      'DIALOGUE: Kharzag: Move.',
      'CAMERA: Wide combat two-shot, low angle, fast lateral track.',
      'AUDIO: Crowd hush, chain rattle, then the scrape of boots in sand.',
    ].join('\n'),
  })

  assert.equal(ingested.authoredShots[0]?.dialogue[0]?.delivery, 'Kharzag')
  assert.equal(ingested.authoredShots[0]?.dialogue[0]?.line, 'Move.')
  assert.match(ingested.authoredShots[0]?.actions[0]?.verb ?? '', /circle in the torchlit sand/i)
  assert.match(ingested.authoredShots[0]?.cameraMovement ?? '', /fast lateral track/i)
})

test('story creative scripts ingest local shot timing for action dialogue and audio bullets', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Arena Duel',
    graphSummary: 'Kharzag fights Brakk in the arena.',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'story_movie_tv',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      authorshipPipeline: 'story_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_02_entry',
        title: 'First Entry',
        sceneId: 'scene_1',
        participantRefIds: ['kharzag', 'brakk'],
        locationRefId: 'arena_1',
        propRefIds: ['cleaver_1'],
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '# SCENE: Arena Floor',
      '## SHOT: shot_02_entry',
      'DURATION: 3.4s',
      'VISUAL: Low wide two-shot at center pit, Kharzag driving in low toward Brakk under hard stone tiers.',
      'STILL_AT: 2.2s',
      'ACTION:',
      '- 0.0-1.0 Kharzag drops into a low feint and loads his weight forward.',
      '- 1.0-2.2 He explodes toward Brakk with the cleaver low.',
      '- 2.2-3.4 Brakk pivots inside the line and checks the entry on contact.',
      'DIALOGUE:',
      '- 0.8-1.2 Kharzag: Move.',
      'CAMERA: Wide combat two-shot, low angle, fast lateral track.',
      'AUDIO:',
      '- 0.0-1.0 Crowd hush.',
      '- 1.0-2.2 Heavy footfall.',
      '- 2.2-3.4 Metal scrape on contact.',
    ].join('\n'),
  })

  assert.equal(ingested.authoredShots[0]?.actions.length, 3)
  assert.equal(ingested.authoredShots[0]?.actions[0]?.startSeconds, 0)
  assert.equal(ingested.authoredShots[0]?.actions[1]?.startSeconds, 1)
  assert.equal(ingested.authoredShots[0]?.actions[2]?.endSeconds, 3.4)
  assert.equal(ingested.authoredShots[0]?.dialogue[0]?.startSeconds, 0.8)
  assert.equal(ingested.authoredShots[0]?.dialogue[0]?.endSeconds, 1.2)
  assert.equal(ingested.authoredShots[0]?.audio[0]?.startSeconds, 0)
  assert.equal(ingested.authoredShots[0]?.audio[2]?.endSeconds, 3.4)
  assert.equal(ingested.authoredShots[0]?.durationSeconds, 4)
  assert.equal(ingested.authoredShots[0]?.stillAtSeconds, 2.2)
  assert.match(ingested.authoredShots[0]?.visualPrompt ?? '', /Low wide two-shot/i)
})

test('story creative scripts report missing required visual fields', () => {
  const plan = cinematicPlanSchema.parse({
    graphName: 'Arena Duel',
    graphSummary: 'Kharzag fights Brakk in the arena.',
    entityRefs: [],
    graphSettings: {
      presetFamily: 'story_movie_tv',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      authorshipPipeline: 'story_script_ingest_v1',
    },
    shots: [
      {
        id: 'shot_03_missing_visual',
        title: 'Missing Visual',
        sceneId: 'scene_1',
        participantRefIds: ['kharzag', 'brakk'],
        locationRefId: 'arena_1',
      },
    ],
  })

  const ingested = ingestCinematicCreativeScriptToAuthoredShots({
    plan,
    rawScriptMarkdown: [
      '# SCENE: Arena Floor',
      '## SHOT: shot_03_missing_visual',
      'DURATION: 3.0s',
      'ACTION:',
      '- 0.0-3.0 Kharzag advances while Brakk holds center.',
      'CAMERA: Wide tactical two-shot.',
      'AUDIO:',
      '- 0.0-3.0 Crowd murmur and boots on stone.',
    ].join('\n'),
  })

  assert.ok(ingested.diagnostics.some((entry) => /missing required VISUAL/i.test(entry)))
})

test('story shot duration inference follows authored local timing windows', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Authored timing wins',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Entry',
        beat: 'Kharzag feints, surges, and collides with Brakk at center.',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        actions: [
          { id: 'a1', actorRefId: 'fighter_1', verb: 'drops into a low feint', startSeconds: 0, endSeconds: 1 },
          { id: 'a2', actorRefId: 'fighter_1', verb: 'surges forward', startSeconds: 1, endSeconds: 2.2 },
          { id: 'a3', actorRefId: 'fighter_2', verb: 'checks the entry on contact', startSeconds: 2.2, endSeconds: 3.4 },
        ],
        dialogue: [
          { id: 'd1', speakerRefId: 'fighter_1', line: 'Move.', startSeconds: 0.8, endSeconds: 1.2 },
        ],
        audio: [
          { id: 'au1', kind: 'ambience', cue: 'Crowd hush.', startSeconds: 0, endSeconds: 1 },
          { id: 'au2', kind: 'sfx', cue: 'Metal scrape on contact.', startSeconds: 2.2, endSeconds: 3.4 },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.equal(sequence.shots[0]?.durationSeconds, 4)
  assert.equal(sequence.shots[0]?.stillAtSeconds, 2)
  assert.equal(sequence.shots[0]?.startSeconds, 0)
  assert.equal(sequence.shots[0]?.endSeconds, 4)
})

test('story shot still markers round-trip through script and compiled sequence', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Still marker roundtrip',
    entityBindings: [],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Reveal',
        beat: 'The fighter turns into the light at the pit rim.',
        visualPrompt: 'Low rim-lit reveal of the fighter turning into the arena light.',
        stillAtSeconds: 2.3,
        durationSeconds: 4,
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)
  const roundTrip = deriveCinematicScriptFromSequence(sequence)

  assert.equal(sequence.shots[0]?.visualPrompt, 'Low rim-lit reveal of the fighter turning into the arena light.')
  assert.equal(sequence.shots[0]?.stillAtSeconds, 2.3)
  assert.equal(roundTrip.shots[0]?.stillAtSeconds, 2.3)
})

test('story duel keeps packing across mixed shot-level preset metadata when continuity is continuous', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Mixed metadata duel',
    entityBindings: [
      { id: 'fighter_1', kind: 'character', role: 'fighter', label: 'Kharzag', sourceName: 'Kharzag' },
      { id: 'fighter_2', kind: 'character', role: 'fighter', label: 'Brakk', sourceName: 'Brakk' },
      { id: 'arena_1', kind: 'environment', role: 'arena', label: 'Arena', sourceName: 'Arena' },
    ],
    shots: [
      {
        id: 'shot_1',
        orderIndex: 0,
        title: 'Face-off',
        beat: 'Both fighters read the line in the center lane before the first collision.',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a1', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'sets the cleaver low and forward' },
          { id: 'a2', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'holds the center line' },
        ],
      },
      {
        id: 'shot_2',
        orderIndex: 1,
        title: 'First clash',
        beat: 'Kharzag crashes in and Brakk redirects the strike without losing ground.',
        storyScenePreset: null,
        storyLanguagePreset: null,
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a3', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'swings high on entry' },
          { id: 'a4', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'catches and shoves the line aside' },
        ],
      },
      {
        id: 'shot_3',
        orderIndex: 2,
        title: 'Pressure line',
        beat: 'Brakk presses across the arena floor and forces Kharzag into a defensive retreat.',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'grounded_naturalist',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a5', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'drives through the center lane' },
          { id: 'a6', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'gives ground while guarding high' },
        ],
      },
      {
        id: 'shot_4',
        orderIndex: 3,
        title: 'Turn',
        beat: 'Kharzag cuts inside and flips the angle with a sharp reversal.',
        storyScenePreset: 'duel_showdown',
        storyLanguagePreset: 'tactical_combat',
        participantRefIds: ['fighter_1', 'fighter_2'],
        locationRefId: 'arena_1',
        actions: [
          { id: 'a7', actorRefId: 'fighter_1', targetRefId: 'fighter_2', verb: 'slips inside and twists the exchange' },
          { id: 'a8', actorRefId: 'fighter_2', targetRefId: 'fighter_1', verb: 'stumbles off the center' },
        ],
      },
    ],
  })

  const sequence = buildCinematicSequenceFromScriptDoc(script)

  assert.ok(sequence.takes.length <= 2)
  assert.ok((sequence.takes[0]?.shotIds.length ?? 0) >= 2)
})

test('compiled cinematic graphs persist fully materialized story settings from partial story graph settings', () => {
  const script = cinematicScriptDocSchema.parse({
    title: 'Story graph settings persistence',
    entityBindings: [],
    shots: [{
      id: 'shot_1',
      orderIndex: 0,
      title: 'Duel beat',
      beat: 'Kharzag and Brakk close into a tactical duel exchange.',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      participantRefIds: [],
      propRefIds: [],
      dialogue: [],
      actions: [],
      audio: [],
    }],
  })

  const graph = compileCinematicGraphFromScriptDoc({
    graphKey: 'graph.story_test',
    graphName: 'Story Test',
    graphSummary: 'Story graph',
    graphSettings: {
      presetFamily: 'story_movie_tv',
      storyScenePreset: 'duel_showdown',
      storyLanguagePreset: 'tactical_combat',
      formatSubtype: null,
    },
    scriptDoc: script,
  })

  const cinematics = (graph.metadata as { cinematics?: unknown }).cinematics
  const settings = materializeCinematicGraphSettings(cinematics ?? {})

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'duel_showdown')
  assert.equal(settings.storyLanguagePreset, 'tactical_combat')
  assert.equal(settings.formatSubtype, null)
})
