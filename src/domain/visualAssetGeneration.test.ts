// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCharacterConceptPrompt,
  buildItemConceptPrompt,
} from './visualAssetGeneration.ts'

test('character continuity prompts ask for continuity-ready reference framing', () => {
  const prompt = buildCharacterConceptPrompt({
    characterName: 'Maya',
    conceptArtMode: 'continuity',
    conceptVariant: 'phone_in_hand',
    captureProfile: 'ugc_phone_rear_28_home_demo',
    visualDescription: 'late-20s creator with dark curls and a soft grey hoodie',
  })

  assert.match(prompt, /continuity-ready character reference/i)
  assert.match(prompt, /holding a phone/i)
  assert.match(prompt, /Capture profile:/i)
})

test('item proof-surface prompts bias toward readable proof framing', () => {
  const prompt = buildItemConceptPrompt({
    itemName: 'Calm App',
    conceptArtMode: 'proof_surface',
    conceptVariant: 'readable_close_proof',
    captureProfile: 'ugc_app_demo_over_shoulder_phone',
    visualDescription: 'phone screen showing a guided reset flow',
  })

  assert.match(prompt, /proof-surface reference image/i)
  assert.match(prompt, /readable proof-friendly framing/i)
  assert.match(prompt, /Capture profile:/i)
})
