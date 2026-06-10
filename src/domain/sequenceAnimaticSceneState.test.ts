import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveSequenceAnimaticSceneStates,
  formatSequenceAnimaticSceneStateForPrompt,
  readTimeOfDayHint,
} from './sequenceAnimaticSceneState.ts'

test('readTimeOfDayHint parses common phrases', () => {
  assert.equal(readTimeOfDayHint('warm golden hour rim light'), 'dusk')
  assert.equal(readTimeOfDayHint('cold moonlight through blinds'), 'night')
  assert.equal(readTimeOfDayHint('harsh midday sun'), 'day')
  assert.equal(readTimeOfDayHint('soft practicals'), '')
})

test('lighting is inherited within a set and resets across sets', () => {
  const states = deriveSequenceAnimaticSceneStates({
    shots: [
      { id: 's1', index: 1, lighting: 'dusty sunset key from west window', sceneBinding: { setId: 'barn' } },
      { id: 's2', index: 2, sceneBinding: { setId: 'barn' } },
      { id: 's3', index: 3, sceneBinding: { setId: 'field' } },
    ],
    coverageSetups: [],
  })
  assert.equal(states.get('s2')?.lighting, 'dusty sunset key from west window')
  assert.equal(states.get('s2')?.carriedLightingFromShotId, 's1')
  assert.equal(states.get('s2')?.timeOfDayHint, 'dusk')
  assert.equal(states.get('s3')?.lighting, '')
})

test('props accumulate as established within a set', () => {
  const states = deriveSequenceAnimaticSceneStates({
    shots: [
      { id: 's1', index: 1, sceneBinding: { setId: 'barn' }, refs: { propRefIds: ['lantern'] } },
      { id: 's2', index: 2, sceneBinding: { setId: 'barn' }, refs: { propRefIds: ['pitchfork'] } },
      { id: 's3', index: 3, sceneBinding: { setId: 'barn' }, refs: { propRefIds: [] } },
    ],
    coverageSetups: [],
  })
  assert.deepEqual(states.get('s2')?.activePropRefIds, ['pitchfork'])
  assert.deepEqual(states.get('s2')?.establishedPropRefIds, ['lantern'])
  assert.deepEqual(states.get('s3')?.establishedPropRefIds?.sort(), ['lantern', 'pitchfork'])
})

test('previous shot and previous same-setup shot are tracked', () => {
  const states = deriveSequenceAnimaticSceneStates({
    shots: [
      { id: 's1', index: 1, coverageSetupId: 'a' },
      { id: 's2', index: 2, coverageSetupId: 'b' },
      { id: 's3', index: 3, coverageSetupId: 'a' },
    ],
    coverageSetups: [{ id: 'a' }, { id: 'b' }],
  })
  assert.equal(states.get('s3')?.previousShotId, 's2')
  assert.equal(states.get('s3')?.previousSameSetupShotId, 's1')
  assert.equal(states.get('s1')?.previousShotId, '')
})

test('setup fields backfill location, lighting, and screen direction', () => {
  const states = deriveSequenceAnimaticSceneStates({
    shots: [
      { id: 's1', index: 1, coverageSetupId: 'a' },
    ],
    coverageSetups: [{
      id: 'a',
      setId: 'set_dock',
      zoneId: 'zone_pier',
      primarySpotId: 'spot_edge',
      lighting: 'fog-diffused dawn light',
      screenDirection: 'left to right',
      continuityMode: 'same_setup',
    }],
  })
  const state = states.get('s1')
  assert.equal(state?.setId, 'set_dock')
  assert.equal(state?.spotId, 'spot_edge')
  assert.equal(state?.timeOfDayHint, 'dawn')
  assert.equal(state?.screenDirection, 'left to right')
  assert.equal(state?.continuityMode, 'same_setup')
})

test('prompt formatter emits only present fields', () => {
  const text = formatSequenceAnimaticSceneStateForPrompt({
    setId: 'barn',
    lighting: 'sunset key',
    carriedLightingFromShotId: 's1',
    presentCharacterRefIds: ['hero'],
    establishedPropRefIds: ['lantern'],
    screenDirection: 'left to right',
  })
  assert.ok(text.includes('Location continuity: barn'))
  assert.ok(text.includes('carried over from shot s1'))
  assert.ok(text.includes('Props already established'))
  assert.ok(text.includes('Screen direction: left to right'))
  assert.equal(formatSequenceAnimaticSceneStateForPrompt(null), '')
  assert.equal(formatSequenceAnimaticSceneStateForPrompt({}), '')
})
