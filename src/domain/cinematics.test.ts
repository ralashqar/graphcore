// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCinematicSequenceFromScriptDoc,
  cinematicScriptDocSchema,
} from './cinematics.ts'

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

  assert.equal(sequence.shots[0]?.durationSeconds, 4)
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
