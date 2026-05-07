// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCharacterConceptPrompt,
  buildCharacterReferenceSheetPrompt,
  buildGroupReferenceSheetPrompt,
  buildItemReferenceSheetPrompt,
  buildLocationReferenceSheetPrompt,
  buildItemConceptPrompt,
  normalizeCharacterConceptArtMode,
  resolveCharacterConceptVariantSet,
  resolveConceptImageAspectRatio,
} from './visualAssetGeneration.ts'

const referenceSheetBase = {
  entityName: 'Eva-9',
  entitySummary: 'A synthetic singer in Skybridge Garden.',
  entityContext: 'Appears in a neon rain sci-fi world.',
  projectArtStyle: 'cinematic realism with restrained cyberpunk color',
  projectTone: 'melancholic, romantic, high tension',
  visualDescription: 'porcelain android with silver hair and translucent facial seams',
  visualTraits: ['synthetic adult', 'slender build', 'silver bob hair', 'cool blue palette'],
  visualTraitMap: { hair: 'silver bob', materials: 'porcelain shell and brushed chrome' },
  referenceAssetNotes: ['existing thumbnail locks face and hair silhouette'],
}

test('character reference sheet prompt uses simplified low-quality-safe turnaround sections', () => {
  const prompt = buildCharacterReferenceSheetPrompt(referenceSheetBase)

  assert.match(prompt, /CHARACTER TURNAROUND REFERENCE SHEET/i)
  assert.match(prompt, /4:3 horizontal layout/i)
  assert.match(prompt, /front, 3\/4 front, side profile, and back/i)
  assert.match(prompt, /HEAD AND IDENTITY DETAILS/i)
  assert.match(prompt, /FEATURE CALLOUTS/i)
  assert.match(prompt, /cinematic chest-up or shoulder-up profile close-up/i)
  assert.match(prompt, /Do not include expression grids/i)
  assert.match(prompt, /hand gesture sheets/i)
  assert.match(prompt, /Project art style:/i)
  assert.match(prompt, /Visual traits:/i)
  assert.doesNotMatch(prompt, /MICRO EXPRESSIONS/i)
  assert.doesNotMatch(prompt, /EXPRESSION PROGRESSION/i)
})

test('location reference sheet prompt requests square multi-view sheet with map view', () => {
  const prompt = buildLocationReferenceSheetPrompt({
    ...referenceSheetBase,
    entityName: 'Skybridge Garden',
    includeMapView: true,
  })

  assert.match(prompt, /2048x2048 square/i)
  assert.match(prompt, /cinematic establishing view/i)
  assert.match(prompt, /entrance\/threshold view/i)
  assert.match(prompt, /top-down or isometric map view/i)
  assert.match(prompt, /key feature highlights/i)
  assert.match(prompt, /cinematic profile-like hero panel/i)
})

test('group reference sheet prompt focuses on faction visual identity system', () => {
  const prompt = buildGroupReferenceSheetPrompt({
    ...referenceSheetBase,
    entityName: 'The Glass Choir',
  })

  assert.match(prompt, /MASTER GROUP \/ FACTION DESIGN SHEET/i)
  assert.match(prompt, /emblem or sigil/i)
  assert.match(prompt, /uniform or dress-code/i)
  assert.match(prompt, /representative member silhouettes/i)
  assert.match(prompt, /cinematic close-up\/profile panel/i)
  assert.match(prompt, /not every individual member/i)
})

test('item reference sheet prompt includes rotation, material, in-use, and close-up panels', () => {
  const prompt = buildItemReferenceSheetPrompt({
    ...referenceSheetBase,
    entityName: 'Archive Key',
  })

  assert.match(prompt, /MASTER ITEM \/ PROP DESIGN SHEET/i)
  assert.match(prompt, /front\/side\/back or 3\/4 rotation views/i)
  assert.match(prompt, /scale reference/i)
  assert.match(prompt, /material callouts/i)
  assert.match(prompt, /in-hand or in-use view/i)
  assert.match(prompt, /cinematic close-up\/profile panel/i)
})

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
