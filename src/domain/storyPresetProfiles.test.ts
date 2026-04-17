// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_STORY_LANGUAGE_PRESET,
  DEFAULT_STORY_SCENE_PRESET,
  getStoryLanguagePresetLabel,
  getStoryScenePresetLabel,
  inferStoryLanguagePresetFromPromptText,
  inferStoryScenePresetFromPromptText,
  resolveStoryRuntimeContract,
} from './storyPresetProfiles.ts'

test('story preset defaults resolve to the starter-pack dialogue baseline', () => {
  const contract = resolveStoryRuntimeContract({})

  assert.equal(contract.scenePreset, DEFAULT_STORY_SCENE_PRESET)
  assert.equal(contract.languagePreset, DEFAULT_STORY_LANGUAGE_PRESET)
  assert.equal(contract.sceneLabel, 'Dialogue Two-Hander')
  assert.equal(contract.languageLabel, 'Grounded Naturalist')
})

test('story preset labels stay human-readable', () => {
  assert.equal(getStoryScenePresetLabel('family_argument_power_shift'), 'Family Argument Power Shift')
  assert.equal(getStoryLanguagePresetLabel('precision_procedural'), 'Precision Procedural')
  assert.equal(getStoryScenePresetLabel('duel_showdown'), 'Duel Showdown')
  assert.equal(getStoryLanguagePresetLabel('operatic_epic'), 'Operatic Epic')
})

test('story inference pulls scene and language cues from prompt text', () => {
  const prompt = 'A tense interrogation in a fluorescent interview room, staged with precise procedural coverage and controlled push-ins.'

  assert.equal(inferStoryScenePresetFromPromptText(prompt), 'interrogation_pressure_cooker')
  assert.equal(inferStoryLanguagePresetFromPromptText(prompt), 'precision_procedural')
})

test('story inference routes direct combat prompts into the action taxonomy', () => {
  const prompt = 'Create a cinematic where Kharzag fights Brakk in a tactical duel.'

  assert.equal(inferStoryScenePresetFromPromptText(prompt), 'duel_showdown')
  assert.equal(inferStoryLanguagePresetFromPromptText(prompt), 'tactical_combat')
})

test('story inference covers war-scale and epic language prompts', () => {
  const prompt = 'A battlefield collapse in a war zone staged with operatic epic scale.'

  assert.equal(inferStoryScenePresetFromPromptText(prompt), 'battlefield_push_and_collapse')
  assert.equal(inferStoryLanguagePresetFromPromptText(prompt), 'war_immersion')
})

test('story runtime contract merges scene and language directives', () => {
  const contract = resolveStoryRuntimeContract({
    storyScenePreset: 'dread_build_reveal',
    storyLanguagePreset: 'handheld_chaos',
  })

  assert.equal(contract.scenePreset, 'dread_build_reveal')
  assert.equal(contract.languagePreset, 'handheld_chaos')
  assert.deepEqual(contract.targetShotCountRange, [5, 9])
  assert.deepEqual(contract.idealShotDurationRangeSeconds, [4, 8])
  assert.match(contract.cameraBehaviorRules, /handheld/i)
  assert.ok(contract.plannerDirectives.some((entry) => /Delay full information|Build toward the reveal/i.test(entry)))
  assert.ok(contract.authorshipDirectives.some((entry) => /negative space|handheld/i.test(entry)))
  assert.ok(contract.repairDirectives.length > 0)
})

test('action story runtime contract carries combat pacing and coverage rules', () => {
  const contract = resolveStoryRuntimeContract({
    storyScenePreset: 'duel_showdown',
    storyLanguagePreset: 'tactical_combat',
  })

  assert.equal(contract.scenePreset, 'duel_showdown')
  assert.equal(contract.languagePreset, 'tactical_combat')
  assert.deepEqual(contract.targetShotCountRange, [4, 8])
  assert.deepEqual(contract.idealShotDurationRangeSeconds, [2, 6])
  assert.equal(contract.maxDialogueWordsPerShot, 22)
  assert.equal(contract.maxActionBeatsPerShot, 5)
  assert.equal(contract.maxActionMicroBeatsPerShot, 6)
  assert.equal(contract.actionExchangeBundling, 'moderate')
  assert.equal(contract.actionDensityBias, 'high')
  assert.equal(contract.storyboardPanelDensityBias, 'high')
  assert.match(contract.coverageStrategy, /shared combat geography|impact inserts/i)
  assert.match(contract.cameraBehaviorRules, /combat coverage|shifting advantage/i)
})
