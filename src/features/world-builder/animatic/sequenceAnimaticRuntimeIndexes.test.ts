import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  OutputArtifact,
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow.ts'
import { buildSequenceAnimaticRuntimeIndexes } from './sequenceAnimaticRuntimeIndexes.ts'

function outputRequest(overrides: Partial<OutputRequest>): OutputRequest {
  return {
    id: 'request',
    projectId: 'project',
    draftId: 'draft',
    parentRequestId: null,
    workflowId: null,
    latestRunId: null,
    requestedBy: null,
    sourceSurface: 'wiki_sequence_unit',
    prompt: '',
    title: 'Output',
    intent: 'output_generation',
    outputKind: 'cinematic_episode',
    status: 'completed',
    selectedEntityKeys: [],
    selectedSequenceUnitKeys: ['sequence_a'],
    pageCount: null,
    targetFormat: 'image',
    plannerNotes: '',
    errorMessage: null,
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function outputRun(overrides: Partial<OutputWorkflowRun>): OutputWorkflowRun {
  return {
    id: 'run',
    projectId: 'project',
    draftId: 'draft',
    workflowId: 'workflow',
    requestedBy: null,
    status: 'completed',
    preset: 'cinematic_episode_from_sequence',
    prompt: '',
    targetFormat: 'image',
    worldSnapshotFingerprint: '',
    input: {},
    outputs: {},
    errorMessage: null,
    workerId: null,
    heartbeatAt: null,
    attemptCount: 0,
    metadata: {},
    steps: [],
    artifacts: [],
    startedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function outputArtifact(overrides: Partial<OutputArtifact>): OutputArtifact {
  return {
    id: 'artifact',
    projectId: 'project',
    draftId: 'draft',
    workflowId: null,
    runId: null,
    nodeId: null,
    key: 'artifact_key',
    name: 'Artifact',
    kind: 'image',
    assetKey: null,
    mimeType: 'image/webp',
    summary: '',
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('sequence animatic runtime indexes do not borrow same shot-id keyframes from another master', () => {
  const masterA = outputRequest({
    id: 'master_a',
    workflowId: 'workflow_master_a',
    selectedSequenceUnitKeys: ['sequence_a'],
    metadata: { sequenceAnimaticRole: 'master' },
  })
  const blockA = outputRequest({
    id: 'block_a',
    parentRequestId: masterA.id,
    workflowId: 'workflow_block_a',
    metadata: { sequenceAnimaticRole: 'storyboard_block', storyboardBlockId: 'block_001' },
  })
  const masterB = outputRequest({
    id: 'master_b',
    workflowId: 'workflow_master_b',
    selectedSequenceUnitKeys: ['sequence_b'],
    metadata: { sequenceAnimaticRole: 'master' },
  })
  const blockB = outputRequest({
    id: 'block_b',
    parentRequestId: masterB.id,
    workflowId: 'workflow_block_b',
    metadata: { sequenceAnimaticRole: 'storyboard_block', storyboardBlockId: 'block_001' },
  })
  const otherKeyframeRequest = outputRequest({
    id: 'keyframe_b',
    parentRequestId: masterB.id,
    workflowId: 'workflow_keyframe_b',
    latestRunId: 'run_keyframe_b',
    metadata: {
      sequenceAnimaticRole: 'shot_production',
      masterRequestId: masterB.id,
      storyboardBlockId: 'block_001',
      shotId: 'shot_001',
    },
  })
  const otherKeyframeRun = outputRun({
    id: 'run_keyframe_b',
    workflowId: 'workflow_keyframe_b',
    artifacts: [
      outputArtifact({
        id: 'artifact_keyframe_b_run',
        workflowId: 'workflow_keyframe_b',
        runId: 'run_keyframe_b',
        assetKey: 'wrong_keyframe_asset',
        metadata: {
          role: 'sequence_animatic_shot_keyframe',
          shotId: 'shot_001',
          assetKey: 'wrong_keyframe_asset',
        },
      }),
    ],
  })
  const otherKeyframeArtifact = outputArtifact({
    id: 'artifact_keyframe_b',
    workflowId: 'workflow_keyframe_b',
    runId: 'run_keyframe_b',
    assetKey: 'wrong_keyframe_asset',
    metadata: {
      role: 'sequence_animatic_shot_keyframe',
      shotId: 'shot_001',
      assetKey: 'wrong_keyframe_asset',
    },
  })

  const indexes = buildSequenceAnimaticRuntimeIndexes({
    request: masterA,
    requests: [masterA, blockA, masterB, blockB, otherKeyframeRequest],
    runs: [otherKeyframeRun],
    artifacts: [otherKeyframeArtifact],
  })

  assert.equal(indexes.plannedKeyframeRequests.length, 0)
  assert.equal(indexes.plannedKeyframeArtifacts.length, 0)
  assert.equal(indexes.plannedKeyframeRequestByShotId.has('shot_001'), false)
})

test('sequence animatic runtime indexes keep legacy block-owned keyframes for current master', () => {
  const master = outputRequest({
    id: 'master_a',
    workflowId: 'workflow_master_a',
    metadata: { sequenceAnimaticRole: 'master' },
  })
  const block = outputRequest({
    id: 'block_a',
    parentRequestId: master.id,
    workflowId: 'workflow_block_a',
    metadata: { sequenceAnimaticRole: 'storyboard_block', storyboardBlockId: 'block_001' },
  })
  const keyframeRequest = outputRequest({
    id: 'keyframe_a',
    parentRequestId: block.id,
    workflowId: 'workflow_keyframe_a',
    latestRunId: 'run_keyframe_a',
    metadata: {
      sequenceAnimaticRole: 'shot_keyframe',
      storyboardBlockId: 'block_001',
      shotId: 'shot_001',
    },
  })
  const keyframeArtifact = outputArtifact({
    id: 'artifact_keyframe_a',
    workflowId: 'workflow_keyframe_a',
    runId: 'run_keyframe_a',
    assetKey: 'right_keyframe_asset',
    metadata: {
      role: 'sequence_animatic_shot_keyframe',
      shotId: 'shot_001',
      assetKey: 'right_keyframe_asset',
    },
  })

  const indexes = buildSequenceAnimaticRuntimeIndexes({
    request: master,
    requests: [master, block, keyframeRequest],
    runs: [outputRun({ id: 'run_keyframe_a', workflowId: 'workflow_keyframe_a' })],
    artifacts: [keyframeArtifact],
  })

  assert.equal(indexes.plannedKeyframeRequests.map((request) => request.id).join(','), 'keyframe_a')
  assert.equal(indexes.plannedKeyframeArtifacts.map((artifact) => artifact.assetKey).join(','), 'right_keyframe_asset')
  assert.equal(indexes.plannedKeyframeRequestByShotId.get('shot_001')?.id, 'keyframe_a')
})
