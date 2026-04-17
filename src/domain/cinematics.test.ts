// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCinematicSequenceFromScriptDoc,
  buildCinematicSettingsPatchFromPresetFamily,
  buildCinematicSettingsPatchFromStoryPresets,
  cinematicScriptDocSchema,
  deriveTakeStoryboardPanelArtifacts,
  deriveCinematicScriptFromSequence,
  materializeCinematicGraphSettings,
} from './cinematics.ts'
import { compileCinematicGraphFromScriptDoc } from './cinematicScriptCompiler.ts'
import { ingestCinematicCreativeScriptToAuthoredShots } from './cinematicCreativeScript.ts'
import { cinematicGraphSettingsSchema, cinematicPlanSchema } from './worldBuild.ts'

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
  assert.equal(storySettings.authorshipPipeline, 'json_shot_authoring_v1')
})

test('story preset patches lock scene and language selectors with story pacing defaults', () => {
  const settings = buildCinematicSettingsPatchFromStoryPresets('interrogation_pressure_cooker', 'precision_procedural')

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'interrogation_pressure_cooker')
  assert.equal(settings.storyLanguagePreset, 'precision_procedural')
  assert.equal(settings.formatSubtype, null)
  assert.equal(settings.authorshipPipeline, 'json_shot_authoring_v1')
  assert.deepEqual(settings.targetShotCountRange, [5, 9])
  assert.deepEqual(settings.idealShotDurationRangeSeconds, [3, 7])
})

test('action story preset patches derive combat pacing defaults', () => {
  const settings = buildCinematicSettingsPatchFromStoryPresets('duel_showdown', 'tactical_combat')

  assert.equal(settings.presetFamily, 'story_movie_tv')
  assert.equal(settings.storyScenePreset, 'duel_showdown')
  assert.equal(settings.storyLanguagePreset, 'tactical_combat')
  assert.equal(settings.authorshipPipeline, 'json_shot_authoring_v1')
  assert.deepEqual(settings.targetShotCountRange, [4, 8])
  assert.deepEqual(settings.idealShotDurationRangeSeconds, [2, 6])
  assert.equal(settings.maxDialogueWordsPerShot, 22)
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
