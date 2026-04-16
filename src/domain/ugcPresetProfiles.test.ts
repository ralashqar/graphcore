// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  getCinematicSettings,
} from './cinematics.ts'
import {
  correctUgcPresetSelectionForPromptText,
  deriveUgcShotDefaults,
  getUgcPresetProfile,
  inferCinematicFormatSubtypeFromPromptText,
  inferCinematicPresetFamilyFromPromptText,
} from './ugcPresetProfiles.ts'

test('creator prompts infer creator preset family and subtype', () => {
  const presetFamily = inferCinematicPresetFamilyFromPromptText('Make a native TikTok creator video about overthinking at night')
  const subtype = inferCinematicFormatSubtypeFromPromptText('Make a native TikTok creator video about overthinking at night', presetFamily)

  assert.equal(presetFamily, 'ugc_creator')
  assert.equal(subtype, 'creator_reframe')
})

test('wellness creator prompts stay in creator family instead of drifting to direct response just because they mention an app', () => {
  const prompt = 'Create a native TikTok-style UGC creator video for women who feel guilty about stress drinking at night. The app helps regulate cortisol, reduce evening overwhelm, and improve sleep. Make it feel validating, emotionally accurate, and non-preachy.'
  const presetFamily = inferCinematicPresetFamilyFromPromptText(prompt)
  const corrected = correctUgcPresetSelectionForPromptText({
    prompt,
    presetFamily,
    formatSubtype: 'ad_mechanism_proof',
  })

  assert.equal(presetFamily, 'ugc_creator')
  assert.equal(corrected.presetFamily, 'ugc_creator')
  assert.equal(corrected.formatSubtype, 'creator_problem_solution')
})

test('direct-response mechanism prompts infer ad mechanism proof', () => {
  const presetFamily = inferCinematicPresetFamilyFromPromptText('Create a direct response ad showing how the product works and proving the mechanism')
  const subtype = inferCinematicFormatSubtypeFromPromptText('Create a direct response ad showing how the product works and proving the mechanism', presetFamily)

  assert.equal(presetFamily, 'ugc_direct_response_ad')
  assert.equal(subtype, 'ad_mechanism_proof')
})

test('fruit drama app promotion prompts infer trojan horse drama ad', () => {
  const prompt = 'Create an app promotion using AI fruit drama episodes with betrayal and a reveal where the app fixes everything'
  const presetFamily = inferCinematicPresetFamilyFromPromptText(prompt)
  const subtype = inferCinematicFormatSubtypeFromPromptText(prompt, presetFamily)

  assert.equal(presetFamily, 'ugc_direct_response_ad')
  assert.equal(subtype, 'ad_trojan_horse_drama')
})

test('absurd faceless drama prompts infer faceless serialized drama', () => {
  const prompt = 'Make a faceless animated fruit drama with personified gossip and serialized betrayal'
  const presetFamily = inferCinematicPresetFamilyFromPromptText(prompt)
  const subtype = inferCinematicFormatSubtypeFromPromptText(prompt, presetFamily)

  assert.equal(presetFamily, 'ugc_faceless_format')
  assert.equal(subtype, 'faceless_serialized_drama')
})

test('contrast prompts infer contrast narrative', () => {
  const presetFamily = inferCinematicPresetFamilyFromPromptText('Build a rich vs poor split screen short with escalating scenes')
  const subtype = inferCinematicFormatSubtypeFromPromptText('Build a rich vs poor split screen short with escalating scenes', presetFamily)

  assert.equal(subtype, 'contrast_narrative')
})

test('preset family patch applies stronger UGC defaults', () => {
  const patch = buildCinematicSettingsPatchFromPresetFamily('ugc_direct_response_ad')

  assert.equal(patch.presetFamily, 'ugc_direct_response_ad')
  assert.equal(patch.formatSubtype, 'ad_problem_solution')
  assert.equal(patch.formulaFamily, 'problem_solution')
  assert.equal(patch.dominantTrigger, 'transformation_desire')
  assert.equal(patch.stillAspectRatio, '9:16')
  assert.equal(patch.defaultClipSeconds, 5)
  assert.equal(patch.inferredArtStylePreset, 'ugc_phone_rear_28_home_demo')
  assert.ok(patch.proofMoment.length > 0)
  assert.ok(patch.ctaStyle.length > 0)
})

test('format subtype patch applies subtype-specific defaults', () => {
  const patch = buildCinematicSettingsPatchFromFormatSubtype('ugc_creator', 'creator_validation')

  assert.equal(patch.formatSubtype, 'creator_validation')
  assert.equal(patch.formulaFamily, 'validation')
  assert.equal(patch.dominantTrigger, 'parasocial_reassurance')
  assert.ok(patch.ctaStyle.includes('soft') || patch.ctaStyle.includes('Soft'))
})

test('serialized drama subtype patch applies story-led ad defaults', () => {
  const patch = buildCinematicSettingsPatchFromFormatSubtype('ugc_direct_response_ad', 'ad_trojan_horse_drama')

  assert.equal(patch.formatSubtype, 'ad_trojan_horse_drama')
  assert.equal(patch.formulaFamily, 'problem_solution')
  assert.equal(patch.dominantTrigger, 'curiosity_gap')
  assert.ok(patch.proofMoment.toLowerCase().includes('reveal') || patch.proofMoment.toLowerCase().includes('twist'))
})

test('shot defaults provide persona and target emotion for creator formats', () => {
  const defaults = deriveUgcShotDefaults({
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_reframe',
    shotIndex: 0,
    shotCount: 5,
    hookRole: 'hook',
  })

  assert.equal(defaults.formulaFamily, 'reframe')
  assert.equal(defaults.dominantTrigger, 'belief_reset')
  assert.ok(defaults.personaStyle.length > 0)
  assert.ok(defaults.targetEmotion.length > 0)
})

test('getCinematicSettings fills UGC proof and CTA defaults from graph metadata', () => {
  const settings = getCinematicSettings(
    {},
    {
      cinematics: {
        presetFamily: 'ugc_faceless_format',
        formatSubtype: 'faceless_explainer',
      },
    },
  )

  assert.equal(settings.presetFamily, 'ugc_faceless_format')
  assert.equal(settings.formatSubtype, 'faceless_explainer')
  assert.equal(settings.formulaFamily, 'doing_it_wrong')
  assert.equal(settings.dominantTrigger, 'belief_reset')
  assert.equal(settings.inferredArtStylePreset, 'ugc_app_demo_over_shoulder_phone')
  assert.equal(settings.useInferredArtStyle, true)
  assert.ok(settings.proofMoment.length > 0)
  assert.ok(settings.ctaStyle.length > 0)
})

test('profile exposes locked rules for contrast narratives', () => {
  const profile = getUgcPresetProfile('contrast_narrative')

  assert.ok(profile)
  assert.equal(profile?.prefersStoryboardSupport, true)
  assert.equal(profile?.visualFirst, true)
  assert.ok((profile?.shotRoleSequence.length ?? 0) >= 6)
})

test('serialized drama profiles preserve absurd packaging and storyboard preferences', () => {
  const profile = getUgcPresetProfile('faceless_serialized_drama')

  assert.ok(profile)
  assert.equal(profile?.prefersStoryboardSupport, true)
  assert.equal(profile?.visualFirst, true)
  assert.equal(profile?.defaultContrastAxis, 'chaos vs restored order')
})
