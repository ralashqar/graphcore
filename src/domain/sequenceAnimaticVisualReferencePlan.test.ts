import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSequenceAnimaticVisualReferencePlan,
  readSequenceAnimaticContinuityLinkMode,
  sequenceAnimaticContinuityLinkRequiresPrevious,
} from './sequenceAnimaticVisualReferencePlan.ts'

test('continuity link parser supports string and object forms', () => {
  assert.equal(readSequenceAnimaticContinuityLinkMode({ continuityLink: 'match_action' }), 'match_action')
  assert.equal(readSequenceAnimaticContinuityLinkMode({ continuityLink: { mode: 'blocking_change' } }), 'blocking_change')
  assert.equal(readSequenceAnimaticContinuityLinkMode({ continuity_link: { continuity_mode: 'same_motion' } }), 'same_motion')
  assert.equal(sequenceAnimaticContinuityLinkRequiresPrevious({ continuityLink: { mode: 'match_action' } }), true)
  assert.equal(sequenceAnimaticContinuityLinkRequiresPrevious({ continuityLink: { mode: 'reverse_angle' } }), false)
})

test('visual reference plan summarizes dependency readiness and blocked keyframes', () => {
  const plan = buildSequenceAnimaticVisualReferencePlan({
    keyframePlan: {
      coverageAnchorJobs: [
        { coverageSetupId: 'setup_a', shotIds: ['shot_1', 'shot_2'] },
      ],
      shotKeyframeJobs: [
        { shotId: 'shot_1', storyboardBlockId: 'block_1', coverageSetupId: 'setup_a', requiresCoverageAnchor: true },
        { shotId: 'shot_2', storyboardBlockId: 'block_1', coverageSetupId: 'setup_a', requiresCoverageAnchor: true, previousShotId: 'shot_1' },
      ],
    },
    dependencyNodeIds: ['set_1', 'spot_1'],
    missingDependencyNodeIds: ['spot_1'],
    coverageAnchorAssetKeysBySetupId: {},
    shotKeyframeAssetKeysByShotId: {},
    coverageAnchorReferenceAssetKeysBySetupId: { setup_a: ['asset_set_1'] },
    shotRequiredReferenceAssetKeysByShotId: {
      shot_1: ['asset_set_1'],
      shot_2: ['asset_set_1', 'asset_prev'],
    },
  })

  assert.equal(plan.dependencyReadiness.status, 'waiting_for_keyframe_refs')
  assert.deepEqual(plan.dependencyReadiness.readyDependencyNodeIds, ['set_1'])
  assert.equal(plan.counts.coverageAnchors, 1)
  assert.equal(plan.counts.blockedShotKeyframes, 2)
  assert.deepEqual(plan.coverageAnchors[0].requiredReferenceAssetKeys, ['asset_set_1'])
  assert.deepEqual(plan.shotKeyframes[1].blockingAssetIds, ['coverage:setup_a', 'shot:shot_1'])
})

test('visual reference plan includes stable source reference hashes', () => {
  const base = buildSequenceAnimaticVisualReferencePlan({
    keyframePlan: {
      coverageAnchorJobs: [{ coverageSetupId: 'setup_a', shotIds: ['shot_1'] }],
      shotKeyframeJobs: [{ shotId: 'shot_1', coverageSetupId: 'setup_a' }],
    },
    dependencyNodeIds: [],
    missingDependencyNodeIds: [],
    coverageAnchorAssetKeysBySetupId: { setup_a: 'anchor_a' },
    shotKeyframeAssetKeysByShotId: {},
    shotRequiredReferenceAssetKeysByShotId: { shot_1: ['asset_a'] },
  })
  const changed = buildSequenceAnimaticVisualReferencePlan({
    keyframePlan: {
      coverageAnchorJobs: [{ coverageSetupId: 'setup_a', shotIds: ['shot_1'] }],
      shotKeyframeJobs: [{ shotId: 'shot_1', coverageSetupId: 'setup_a' }],
    },
    dependencyNodeIds: [],
    missingDependencyNodeIds: [],
    coverageAnchorAssetKeysBySetupId: { setup_a: 'anchor_a' },
    shotKeyframeAssetKeysByShotId: {},
    shotRequiredReferenceAssetKeysByShotId: { shot_1: ['asset_b'] },
  })

  assert.notEqual(base.shotKeyframes[0].sourceReferenceHash, changed.shotKeyframes[0].sourceReferenceHash)
  assert.notEqual(base.visualPlanHash, changed.visualPlanHash)
})
