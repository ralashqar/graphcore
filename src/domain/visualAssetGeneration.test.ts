// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCharacterConceptPrompt,
  buildItemConceptPrompt,
  normalizeCharacterConceptArtMode,
  resolveCharacterConceptVariantSet,
  resolveConceptImageAspectRatio,
} from './visualAssetGeneration.ts'

test('character design-sheet prompts replace showcase t-pose sheets', () => {
  const prompt = buildCharacterConceptPrompt({
    characterName: 'Kharzag',
    conceptArtMode: 'design_sheet',
    visualDescription: 'scarred orc warrior in patched iron armor with a chipped cleaver',
  })

  assert.match(prompt, /character sheet, three-view/i)
  assert.match(prompt, /clean white studio background/i)
  assert.match(prompt, /front view/i)
  assert.match(prompt, /side view/i)
  assert.match(prompt, /three-quarter view/i)
  assert.match(prompt, /3 square panels on the right/i)
  assert.match(prompt, /head and other important features/i)
  assert.match(prompt, /playable in-engine character asset/i)
  assert.doesNotMatch(prompt, /neutral T-pose/i)
  assert.doesNotMatch(prompt, /modeling reference/i)
})

test('legacy character showcase mode normalizes to design-sheet prompts', () => {
  const prompt = buildCharacterConceptPrompt({
    characterName: 'Kharzag',
    conceptArtMode: 'showcase',
    visualDescription: 'scarred orc warrior in patched iron armor with a chipped cleaver',
  })

  assert.match(prompt, /character sheet, three-view/i)
  assert.doesNotMatch(prompt, /square game concept art image/i)
  assert.doesNotMatch(prompt, /neutral T-pose/i)
})

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

test('character design-sheet defaults use one sheet variant and 4:3 aspect ratio', () => {
  assert.equal(normalizeCharacterConceptArtMode(null), 'design_sheet')
  assert.equal(normalizeCharacterConceptArtMode('showcase'), 'design_sheet')
  assert.deepEqual(resolveCharacterConceptVariantSet({
    conceptArtMode: 'design_sheet',
    descriptiveText: 'orc warrior with chipped cleaver',
  }), ['design_sheet_default'])
  assert.equal(resolveConceptImageAspectRatio({
    jobKind: 'character_concept_image',
    conceptArtMode: 'design_sheet',
  }), '4:3')
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
