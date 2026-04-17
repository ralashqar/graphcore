// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCinematicSequenceFromScriptDoc,
  buildCinematicSettingsPatchFromPresetFamily,
  cinematicScriptDocSchema,
} from './cinematics.ts'
import { ingestCinematicCreativeScriptToAuthoredShots } from './cinematicCreativeScript.ts'
import { cinematicPlanSchema } from './worldBuild.ts'

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
