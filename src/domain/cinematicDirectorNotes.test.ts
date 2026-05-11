// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyCinematicDirectorPatch,
  buildCinematicDirectorPatchPreview,
  deriveCinematicDirectorRegenerationPlan,
} from './cinematicDirectorNotes.ts'

const now = '2026-05-11T00:00:00.000Z'

function node(key, nodeType = 'utility_transform') {
  return {
    id: `node-${key}`,
    workflowId: 'workflow-1',
    key,
    nodeType,
    label: key,
    position: { x: 0, y: 0 },
    config: {},
    inputs: {},
    outputs: {},
    dirty: false,
    inputHash: '',
    outputHash: '',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}

function shotPlan() {
  return {
    sceneId: 'scene_1',
    totalEditorialDurationSeconds: 6,
    shots: [
      {
        id: 'shot_1',
        index: 1,
        title: 'Wide Approach',
        purpose: 'establishing',
        editorialDurationSeconds: 2,
        providerDurationSeconds: 4,
        description: 'A wide view of the checkpoint.',
        action: 'Workers move through rain.',
        visibleCharacterRefIds: ['ilya'],
        speakerRefIds: [],
        locationRefId: 'checkpoint',
        propRefIds: [],
        continuityInputs: ['left-to-right flow'],
        camera: {
          framing: 'wide',
          angle: 'eye level',
          lens: '28mm',
          movement: 'slow push',
          screenDirectionRule: 'left-to-right',
        },
        dialogue: [],
        requiresLipSync: false,
        status: 'planned',
      },
      {
        id: 'shot_2',
        index: 2,
        title: 'Ilya Notices',
        purpose: 'reaction',
        editorialDurationSeconds: 2,
        providerDurationSeconds: 4,
        description: 'Ilya notices Anya through the glass.',
        action: 'Ilya stops in the worker line.',
        visibleCharacterRefIds: ['ilya'],
        speakerRefIds: [],
        locationRefId: 'checkpoint',
        propRefIds: [],
        continuityInputs: ['hold eyeline screen-right'],
        camera: {
          framing: 'medium closeup',
          angle: 'eye level',
          lens: '65mm',
          movement: 'micro push',
          screenDirectionRule: 'Ilya looks screen-right',
        },
        dialogue: [],
        requiresLipSync: false,
        status: 'planned',
      },
    ],
  }
}

const nodes = [
  node('cinematic_v2_storyboard_prompt'),
  node('cinematic_v2_storyboard_sheet', 'image_generation'),
  node('cinematic_v2_panel_extract'),
  node('cinematic_v2_shot_001_asset_pack'),
  node('cinematic_v2_shot_001_keyframe_prompt'),
  node('cinematic_v2_shot_001_keyframe', 'image_generation'),
  node('cinematic_v2_shot_001_video_prompt'),
  node('cinematic_v2_shot_001_video', 'video_generation'),
  node('cinematic_v2_shot_002_asset_pack'),
  node('cinematic_v2_shot_002_keyframe_prompt'),
  node('cinematic_v2_shot_002_keyframe', 'image_generation'),
  node('cinematic_v2_shot_002_video_prompt'),
  node('cinematic_v2_shot_002_video', 'video_generation'),
  node('cinematic_v2_timeline_assemble'),
]

test('shot-only director patch dirties one shot branch plus timeline', () => {
  const plan = deriveCinematicDirectorRegenerationPlan({
    scope: { type: 'shot', shotId: 'shot_2' },
    operations: [
      {
        op: 'update_shot',
        shotId: 'shot_2',
        set: { camera: { angle: 'low angle' }, description: 'Ilya feels smaller beneath the checkpoint architecture.' },
        rationale: 'Increase intimidation.',
      },
    ],
    shotPlan: shotPlan(),
    nodes,
  })

  assert.deepEqual(plan.affectedShotIds, ['shot_2'])
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_shot_001_keyframe'), false)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_shot_002_asset_pack'), true)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_shot_002_keyframe'), true)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_timeline_assemble'), true)
  assert.equal(plan.riskLevel, 'low')
})

test('scene-level director patch dirties storyboard, panels, all shots, and timeline', () => {
  const plan = deriveCinematicDirectorRegenerationPlan({
    scope: { type: 'scene' },
    operations: [
      {
        op: 'update_scene_state',
        set: { mood: 'colder and more oppressive' },
        rationale: 'Global mood change.',
      },
    ],
    shotPlan: shotPlan(),
    nodes,
  })

  assert.deepEqual(plan.affectedShotIds, ['shot_1', 'shot_2'])
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_storyboard_sheet'), true)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_panel_extract'), true)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_shot_001_keyframe'), true)
  assert.equal(plan.dirtyNodeKeys.includes('cinematic_v2_shot_002_keyframe'), true)
  assert.equal(plan.riskLevel, 'high')
})

test('applying a director patch updates shot graph data and returns inverse undo ops', () => {
  const applied = applyCinematicDirectorPatch({
    shotPlan: shotPlan(),
    operations: [
      {
        op: 'update_shot',
        shotId: 'shot_2',
        set: { editorialDurationSeconds: 3, camera: { angle: 'low angle' } },
        rationale: 'Hold tension longer.',
      },
    ],
  })

  const shot = applied.shotPlan.shots.find((entry) => entry.id === 'shot_2')
  assert.equal(shot.editorialDurationSeconds, 3)
  assert.equal(shot.providerDurationSeconds, 4)
  assert.equal(shot.camera.angle, 'low angle')
  assert.equal(applied.inverseOperations[0].op, 'update_shot')
  assert.equal(applied.inverseOperations[0].shotId, 'shot_2')
  assert.equal(applied.inverseOperations[0].set.editorialDurationSeconds, 2)
  assert.equal(applied.inverseOperations[0].set.camera.angle, 'eye level')
})

test('director patch preview recommends scene replan for structural notes', () => {
  const preview = buildCinematicDirectorPatchPreview({
    note: 'Split shot 2 into three separate reveals.',
    scope: { type: 'shot', shotId: 'shot_2' },
    operations: [],
    status: 'requires_scene_replan',
    shotPlan: shotPlan(),
    nodes,
  })

  assert.equal(preview.status, 'requires_scene_replan')
  assert.equal(preview.regenerationPlan.requiresSceneReplan, true)
})
