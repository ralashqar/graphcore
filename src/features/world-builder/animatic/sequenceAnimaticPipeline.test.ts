import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deriveSequenceAnimaticPipeline, type SequenceAnimaticPipelineModel } from './sequenceAnimaticPipeline.ts'

function baseModel(overrides: Partial<SequenceAnimaticPipelineModel> = {}): SequenceAnimaticPipelineModel {
  return {
    screenplayMarkdown: '',
    directorPlanReady: false,
    continuityStructureRunning: false,
    continuityGraphStatus: 'empty',
    continuityAssetGenerationStatus: 'none',
    continuityAssetTargets: [],
    blocks: [],
    keyframeReadyCount: 0,
    keyframeTotalCount: 0,
    keyframeRunning: false,
    currentStepLabel: '',
    ...overrides,
  }
}

test('fresh request: script pending and marked as next action', () => {
  const stages = deriveSequenceAnimaticPipeline(baseModel())
  assert.equal(stages[0].id, 'script')
  assert.equal(stages[0].status, 'pending')
  assert.equal(stages[0].isNextAction, true)
  assert.equal(stages.length, 6)
})

test('script done, continuity plan running', () => {
  const stages = deriveSequenceAnimaticPipeline(baseModel({
    screenplayMarkdown: '# Script',
    continuityStructureRunning: true,
  }))
  assert.equal(stages[0].status, 'ready')
  assert.equal(stages[1].status, 'active')
})

test('stale continuity assets win the next-action marker over later pending stages', () => {
  const stages = deriveSequenceAnimaticPipeline(baseModel({
    screenplayMarkdown: '# Script',
    directorPlanReady: true,
    continuityGraphStatus: 'ready',
    continuityAssetGenerationStatus: 'stale',
    continuityAssetTargets: [{ status: 'ready' }, { status: 'stale' }],
    blocks: [{ storyboardReady: false, storyboardRunning: false, videoReady: false, videoRunning: false, videoError: '', shots: [] }],
  }))
  const assets = stages.find((entry) => entry.id === 'continuity_assets')
  assert.equal(assets?.status, 'stale')
  assert.equal(assets?.isNextAction, true)
  assert.equal(assets?.detail.includes('1 stale'), true)
})

test('full pipeline ready', () => {
  const stages = deriveSequenceAnimaticPipeline(baseModel({
    screenplayMarkdown: '# Script',
    directorPlanReady: true,
    continuityGraphStatus: 'ready',
    continuityAssetGenerationStatus: 'ready',
    continuityAssetTargets: [{ status: 'ready' }],
    blocks: [{
      storyboardReady: true,
      storyboardRunning: false,
      videoReady: true,
      videoRunning: false,
      videoError: '',
      shots: [{ shotVideoReady: true }],
    }],
    keyframeReadyCount: 1,
    keyframeTotalCount: 1,
  }))
  assert.deepEqual(stages.map((entry) => entry.status), ['ready', 'ready', 'ready', 'ready', 'ready', 'ready'])
  assert.equal(stages.some((entry) => entry.isNextAction), false)
})

test('keyframes partially done shows counts', () => {
  const stages = deriveSequenceAnimaticPipeline(baseModel({
    screenplayMarkdown: '# Script',
    directorPlanReady: true,
    continuityGraphStatus: 'ready',
    continuityAssetGenerationStatus: 'ready',
    continuityAssetTargets: [{ status: 'ready' }],
    blocks: [{ storyboardReady: true, storyboardRunning: false, videoReady: false, videoRunning: false, videoError: '', shots: [] }],
    keyframeReadyCount: 3,
    keyframeTotalCount: 8,
  }))
  const keyframes = stages.find((entry) => entry.id === 'keyframes')
  assert.equal(keyframes?.status, 'partial')
  assert.equal(keyframes?.detail, '3/8')
})
