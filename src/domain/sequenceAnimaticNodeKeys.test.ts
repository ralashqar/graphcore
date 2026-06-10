import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SEQUENCE_ANIMATIC_NODE_KEYS,
  sequenceAnimaticContinuityAssetForceNodeKeys,
  sequenceAnimaticContinuityBatchForceNodeKeys,
  sequenceAnimaticCoverageAnchorForceNodeKeys,
  sequenceAnimaticPlannedKeyframeForceNodeKeys,
  sequenceAnimaticShotVideoForceNodeKeys,
} from './sequenceAnimaticNodeKeys.ts'
import {
  buildSequenceAnimaticContinuityAssetWorkflowGraph,
  buildSequenceAnimaticContinuityBatchWorkflowGraph,
  buildSequenceAnimaticCoverageAnchorWorkflowGraph,
  buildSequenceAnimaticPlannedKeyframeWorkflowGraph,
  buildSequenceAnimaticShotVideoWorkflowGraph,
} from '../../supabase/functions/_shared/sequence-animatic-workflow-factory.ts'

function nodeKeysOf(graph: { nodes: Array<Record<string, unknown>> }) {
  return new Set(graph.nodes.map((node) => String((node as { key?: unknown }).key ?? '')))
}

function assertGraphContains(graph: { nodes: Array<Record<string, unknown>> }, expectedKeys: readonly string[], label: string) {
  const keys = nodeKeysOf(graph)
  for (const expected of expectedKeys) {
    assert.ok(keys.has(expected), `${label}: expected factory graph to contain node key "${expected}" (has: ${[...keys].join(', ')})`)
  }
}

// These tests pin the contract between the client run orchestration
// (forceNodeKeys / targetNodeKeys) and the server workflow factory. If a node
// key is renamed on either side, this test fails instead of runs silently
// no-oping in production.

test('continuity asset workflow exposes the canonical node keys', () => {
  const graph = buildSequenceAnimaticContinuityAssetWorkflowGraph({
    workflowId: 'wf-1',
    draftId: 'draft-1',
    commonConfig: {},
    continuityPack: {},
    targetNode: { id: 'node-1', name: 'Hero' },
    targetNodeId: 'node-1',
    assetKind: 'character',
    relevantShots: [],
    shotBindings: {},
    assetPack: {},
    referenceAssetKeys: [],
    visualDependencyEdges: [],
    aspectRatio: '16:9',
  })
  assertGraphContains(graph, sequenceAnimaticContinuityAssetForceNodeKeys, 'continuity_asset')
})

test('continuity batch workflow exposes the canonical node keys', () => {
  const graph = buildSequenceAnimaticContinuityBatchWorkflowGraph({
    workflowId: 'wf-2',
    draftId: 'draft-1',
    commonConfig: {},
    batch: { id: 'batch-1', layout: { rows: 1, columns: 2 } },
    targetNodes: [{ id: 'node-1' }, { id: 'node-2' }],
    continuityGraphV2: {},
    relevantShots: [],
    shotBindings: {},
    assetPack: {},
    referenceAssetKeys: [],
    visualDependencyEdges: [],
    aspectRatio: '16:9',
  })
  assertGraphContains(graph, sequenceAnimaticContinuityBatchForceNodeKeys, 'continuity_asset_batch')
})

test('coverage anchor workflow exposes the canonical node keys', () => {
  const graph = buildSequenceAnimaticCoverageAnchorWorkflowGraph({
    workflowId: 'wf-3',
    draftId: 'draft-1',
    commonConfig: {},
    coverageSetup: { id: 'setup-1' },
    shots: [],
    assetPack: {},
    referenceAssetKeys: [],
    aspectRatio: '16:9',
  })
  assertGraphContains(graph, sequenceAnimaticCoverageAnchorForceNodeKeys, 'coverage_anchor')
})

test('planned keyframe workflow exposes the canonical node keys', () => {
  const graph = buildSequenceAnimaticPlannedKeyframeWorkflowGraph({
    workflowId: 'wf-4',
    draftId: 'draft-1',
    commonConfig: {},
    block: { id: 'block-1' },
    shot: { id: 'shot-1' },
    coverageSetup: {},
    coverageAnchor: {},
    previousKeyframe: {},
    storyboardPanel: {},
    assetPack: {},
    aspectRatio: '16:9',
  })
  assertGraphContains(graph, sequenceAnimaticPlannedKeyframeForceNodeKeys, 'planned_keyframe')
})

test('shot video workflow exposes the canonical node keys', () => {
  const graph = buildSequenceAnimaticShotVideoWorkflowGraph({
    workflowId: 'wf-5',
    draftId: 'draft-1',
    commonConfig: {},
    block: { id: 'block-1' },
    shot: { id: 'shot-1' },
    panel: {},
    assetPack: {},
    editorialDurationSeconds: 4,
    providerDurationSeconds: 5,
    aspectRatio: '16:9',
  })
  assertGraphContains(graph, sequenceAnimaticShotVideoForceNodeKeys, 'shot_video')
})

test('node key constants are unique', () => {
  const values = Object.values(SEQUENCE_ANIMATIC_NODE_KEYS)
  assert.equal(values.length, new Set(values).size)
})
