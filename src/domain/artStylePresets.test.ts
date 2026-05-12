// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getArtStylePreset,
  getArtStylePresetBestFor,
  getArtStylePresetPromptDirectives,
  getArtStylePresetsByGroup,
  getOnboardingArtStylePresets,
  getRecommendedArtStylePresetForCinematic,
  resolveArtStylePresetForCinematic,
} from './artStylePresets.ts'

test('UGC rear-camera preset exposes phone-native camera and lighting directives', () => {
  const preset = getArtStylePreset('ugc_phone_rear_28_home_demo')
  const directives = getArtStylePresetPromptDirectives('ugc_phone_rear_28_home_demo').join(' ')

  assert.equal(preset.id, 'ugc_phone_rear_28_home_demo')
  assert.equal(preset.group, 'Photoreal UGC')
  assert.match(directives, /28mm/i)
  assert.match(directives, /iPhone 15/i)
  assert.match(directives, /Avoid:/)
})

test('art style preset groups include photoreal ugc range', () => {
  const groups = getArtStylePresetsByGroup()
  const ugcGroup = groups.find((entry) => entry.group === 'Photoreal UGC')

  assert.ok(ugcGroup)
  assert.ok((ugcGroup?.presets.length ?? 0) >= 8)
})

test('best-for guidance is available for UGC presets', () => {
  const bestFor = getArtStylePresetBestFor('ugc_phone_selfie_soft_daylight')

  assert.match(bestFor, /creator/i)
  assert.match(bestFor, /validation|reframe|confession/i)
})

test('story onboarding exposes live-action cinematic as a first-class story style', () => {
  const presets = getOnboardingArtStylePresets({
    projectType: 'story',
    projectSubtype: 'feature_film',
  })

  assert.ok(presets.some((preset) => preset.id === 'live_action_cinematic'))
  assert.equal(presets[0]?.id, 'live_action_cinematic')
})

test('story onboarding exposes family feature CG for animated stories', () => {
  const presets = getOnboardingArtStylePresets({
    projectType: 'story',
    projectSubtype: 'animated_story',
  })
  const familyFeaturePreset = getArtStylePreset('family_feature_cg')
  const directives = getArtStylePresetPromptDirectives('family_feature_cg').join(' ')

  assert.ok(presets.some((preset) => preset.id === 'family_feature_cg'))
  assert.equal(familyFeaturePreset.group, 'Stylized 3D')
  assert.match(directives, /animated feature CG/i)
  assert.match(directives, /avoid naming or imitating a specific animation studio/i)
})

test('custom onboarding style stays last after story style ranking', () => {
  const presets = getOnboardingArtStylePresets({
    projectType: 'story',
    projectSubtype: 'feature_film',
  })

  assert.equal(presets.at(-1)?.id, 'custom')
})

test('app onboarding exposes app-specific mobile UI art styles', () => {
  const presets = getOnboardingArtStylePresets({
    projectType: 'app',
    projectSubtype: 'mascot_daily_ritual',
  })

  assert.ok(presets.some((preset) => preset.id === 'playful_ritual_companion'))
  assert.ok(presets.some((preset) => preset.id === 'premium_mobile_utility'))
  assert.equal(presets[0]?.id, 'playful_ritual_companion')
  assert.equal(presets.at(-1)?.id, 'custom')
})

test('app project context falls back to premium mobile utility style', async () => {
  const { getFallbackArtStyleForProjectType } = await import('./projectContextProfiles.ts')

  assert.equal(getFallbackArtStyleForProjectType('app'), 'premium_mobile_utility')
})

test('cinematic subtype recommendations map creator and faceless UGC to appropriate capture presets', () => {
  assert.equal(
    getRecommendedArtStylePresetForCinematic({ presetFamily: 'ugc_creator', formatSubtype: 'creator_validation' }),
    'ugc_phone_selfie_soft_daylight',
  )
  assert.equal(
    getRecommendedArtStylePresetForCinematic({ presetFamily: 'ugc_faceless_format', formatSubtype: 'faceless_explainer' }),
    'ugc_app_demo_over_shoulder_phone',
  )
  assert.equal(
    getRecommendedArtStylePresetForCinematic({ presetFamily: 'ugc_faceless_format', formatSubtype: 'faceless_serialized_drama' }),
    'cartoon_3d',
  )
})

test('cinematic art style resolution preserves explicit UGC-family project styles', () => {
  const resolution = resolveArtStylePresetForCinematic({
    projectArtStylePreset: 'ugc_phone_35_testimonial',
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_trojan_horse_drama',
  })

  assert.equal(resolution.presetId, 'ugc_phone_35_testimonial')
  assert.equal(resolution.source, 'project')
})

test('cinematic art style resolution upgrades broad project styles to subtype-specific UGC capture presets', () => {
  const resolution = resolveArtStylePresetForCinematic({
    projectArtStylePreset: 'premium_stylized_3d',
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_problem_solution',
  })

  assert.equal(resolution.presetId, 'ugc_phone_rear_28_home_demo')
  assert.equal(resolution.source, 'recommended')
})

test('graph and node overrides take precedence over recommendations', () => {
  const graphResolution = resolveArtStylePresetForCinematic({
    graphArtStylePreset: 'ugc_founder_softbox_clean',
    projectArtStylePreset: 'premium_stylized_3d',
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_problem_solution',
  })
  const nodeResolution = resolveArtStylePresetForCinematic({
    nodeArtStylePreset: 'ugc_bathroom_mirror_get_ready',
    graphArtStylePreset: 'ugc_founder_softbox_clean',
    projectArtStylePreset: 'premium_stylized_3d',
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_problem_solution',
  })

  assert.equal(graphResolution.presetId, 'ugc_founder_softbox_clean')
  assert.equal(graphResolution.source, 'graph')
  assert.equal(nodeResolution.presetId, 'ugc_bathroom_mirror_get_ready')
  assert.equal(nodeResolution.source, 'node')
})

test('graph inferred art style is used when enabled and no manual override exists', () => {
  const resolution = resolveArtStylePresetForCinematic({
    inferredGraphArtStylePreset: 'ugc_phone_35_testimonial',
    projectArtStylePreset: 'premium_stylized_3d',
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_trojan_horse_drama',
    useInferredArtStyle: true,
  })

  assert.equal(resolution.presetId, 'ugc_phone_35_testimonial')
  assert.equal(resolution.source, 'inferred')
})

test('disabling inferred art style falls back to the project global style', () => {
  const resolution = resolveArtStylePresetForCinematic({
    inferredGraphArtStylePreset: 'ugc_phone_35_testimonial',
    projectArtStylePreset: 'premium_stylized_3d',
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_trojan_horse_drama',
    useInferredArtStyle: false,
  })

  assert.equal(resolution.presetId, 'premium_stylized_3d')
  assert.equal(resolution.source, 'project')
})
