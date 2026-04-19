// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STORY_PROMPT_VERSION,
  STORY_SCRIPT_INGEST_PIPELINE,
  buildStoryCreativeScriptPrompt,
  buildStoryShotSkeletonPlannerPrompt,
} from './storyPromptBuilders.ts'

test('story prompt builders expose the new story ingest pipeline constants', () => {
  assert.equal(STORY_SCRIPT_INGEST_PIPELINE, 'story_script_ingest_v1')
  assert.equal(STORY_PROMPT_VERSION, 'story_prompt_timeline_v2')
})

test('story skeleton planner prompt stays narrow and excludes packaging wall fields', () => {
  const prompt = buildStoryShotSkeletonPlannerPrompt({
    targetShotCount: 4,
    storyScenePreset: 'duel_showdown',
    storyLanguagePreset: 'tactical_combat',
  })

  assert.match(prompt, /Write about 4 ordered shots/i)
  assert.match(prompt, /Do not author graphSettings/i)
  assert.doesNotMatch(prompt, /directingPackage/i)
  assert.doesNotMatch(prompt, /referencePlan/i)
  assert.doesNotMatch(prompt, /requiredSourceRefIds/i)
  assert.doesNotMatch(prompt, /formulaFamily/i)
})

test('story creative prompt uses screenplay-style labels and keeps the rules compact', () => {
  const prompt = buildStoryCreativeScriptPrompt({
    storyScenePreset: 'duel_showdown',
    storyLanguagePreset: 'tactical_combat',
  })

  assert.match(prompt, /# SCENE:/)
  assert.match(prompt, /## SHOT:/)
  assert.match(prompt, /ACTION:/)
  assert.match(prompt, /DIALOGUE:/)
  assert.match(prompt, /0\.0-1\.4/)
  assert.match(prompt, /Use multiple bullets in ACTION, DIALOGUE, or AUDIO/)
  assert.match(prompt, /Write a strong scene, not GraphCore packaging\./)
  assert.doesNotMatch(prompt, /graphSettings/i)
  assert.doesNotMatch(prompt, /referencePlan/i)
  assert.doesNotMatch(prompt, /proofSurfaceRole/i)
})
