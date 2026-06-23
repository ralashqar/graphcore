import test from 'node:test'
import assert from 'node:assert/strict'

import type { SequenceAnimaticViewModel } from '../scene-board/sceneBoardProjection'
import {
  continuityNodeCollections,
  continuityNodeParentId,
  continuityVisualDependencyEdges,
  spotCameraGridNodeId,
} from '../../../domain/sequenceAnimaticContinuityDependencies.ts'
import {
  planSequenceAnimaticContinuityCommand,
} from './sequenceAnimaticContinuityCommandPlanner.ts'

function target(nodeId: string, status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed', assetKind = 'location_zone') {
  return {
    nodeId,
    name: nodeId,
    assetKind,
    status,
    statusLabel: status,
    actionLabel: status,
    assetKey: status === 'ready' ? `${nodeId}_asset` : null,
    assetUrl: status === 'ready' ? `https://example.test/${nodeId}.webp` : null,
    blockIds: [],
    shotIds: ['shot_1'],
  }
}

function model(overrides: Partial<SequenceAnimaticViewModel> = {}): SequenceAnimaticViewModel {
  const continuityAssetTargets = [
    target('set_a', 'ready', 'location_set'),
    target('zone_a', 'ready', 'location_zone'),
    target('spot_a', 'ready', 'location_spot'),
    target('spot_a::camera_grid', 'ready', 'spot_camera_grid'),
  ]
  return {
    request: {} as never,
    title: 'Planner fixture',
    scenes: [],
    blocks: [],
    coverageAnchors: [],
    continuityGraphView: {
      nodes: [
        { id: 'world_location_a', kind: 'world_location', label: 'World', kindLabel: 'World location', parentId: null, shotIds: [], blockIds: [] },
        { id: 'set_a', kind: 'set', label: 'Set', kindLabel: 'Set', parentId: 'world_location_a', shotIds: ['shot_1'], blockIds: [] },
        { id: 'zone_a', kind: 'zone', label: 'Zone', kindLabel: 'Zone', parentId: 'set_a', shotIds: ['shot_1'], blockIds: [] },
        { id: 'spot_a', kind: 'spot', label: 'Spot', kindLabel: 'Spot', parentId: 'zone_a', shotIds: ['shot_1'], blockIds: [] },
        { id: 'spot_a::camera_grid', kind: 'camera_grid', label: 'Camera grid', kindLabel: 'Camera grid', parentId: 'spot_a', shotIds: ['shot_1'], blockIds: [] },
      ],
    },
    continuityAssetTargets,
    ...overrides,
  } as SequenceAnimaticViewModel
}

test('ready node regenerate creates a refresh command plan', () => {
  const fixture = model()
  const plan = planSequenceAnimaticContinuityCommand({
    model: fixture,
    action: 'regenerate_node',
    targets: [fixture.continuityAssetTargets.find((entry) => entry.nodeId === 'zone_a')!],
  })
  assert.equal(plan.status, 'ready')
  assert.equal(plan.mode, 'regenerate')
  assert.equal(plan.forceRefresh, true)
  assert.deepEqual(plan.targets.map((entry) => entry.nodeId), ['zone_a'])
  assert.deepEqual(plan.staleDescendantNodeIds.sort(), ['spot_a', 'spot_a::camera_grid'])
})

test('missing child with missing parent returns blocked parent diagnostics', () => {
  const fixture = model({
    continuityAssetTargets: [
      target('set_a', 'ready', 'location_set'),
      target('zone_a', 'missing', 'location_zone'),
      target('spot_a', 'missing', 'location_spot'),
    ],
  })
  const plan = planSequenceAnimaticContinuityCommand({
    model: fixture,
    action: 'generate_node',
    targets: [fixture.continuityAssetTargets.find((entry) => entry.nodeId === 'spot_a')!],
  })
  assert.equal(plan.status, 'blocked')
  assert.deepEqual(plan.blockedParentNodeIds, ['zone_a'])
  assert.match(plan.diagnostics.join(' '), /Generate parent continuity asset first/)
})

test('spot camera grid requires ready spot reference', () => {
  const fixture = model({
    continuityAssetTargets: [
      target('set_a', 'ready', 'location_set'),
      target('zone_a', 'ready', 'location_zone'),
      target('spot_a', 'missing', 'location_spot'),
      target('spot_a::camera_grid', 'missing', 'spot_camera_grid'),
    ],
  })
  const plan = planSequenceAnimaticContinuityCommand({
    model: fixture,
    action: 'generate_camera_grid',
    targets: [fixture.continuityAssetTargets.find((entry) => entry.nodeId === 'spot_a::camera_grid')!],
    batchKind: 'spot_camera_grid',
  })
  assert.equal(plan.status, 'blocked')
  assert.deepEqual(plan.blockedParentNodeIds, ['spot_a'])
})

test('no eligible target returns explicit noop instead of silent success', () => {
  const fixture = model()
  const plan = planSequenceAnimaticContinuityCommand({
    model: fixture,
    action: 'generate_node',
    targets: [fixture.continuityAssetTargets.find((entry) => entry.nodeId === 'zone_a')!],
  })
  assert.equal(plan.status, 'noop')
  assert.deepEqual(plan.runGroups, [])
  assert.match(plan.diagnostics.join(' '), /No eligible continuity asset targets/)
})

test('missing local prop graph node can still generate from planned reference target', () => {
  const fixture = model({
    continuityAssetTargets: [
      target('prop_sky_sutra_disc', 'missing', 'prop'),
    ],
  })
  const plan = planSequenceAnimaticContinuityCommand({
    model: fixture,
    action: 'generate_node',
    targets: [fixture.continuityAssetTargets.find((entry) => entry.nodeId === 'prop_sky_sutra_disc')!],
  })
  assert.equal(plan.status, 'ready')
  assert.deepEqual(plan.targets.map((entry) => entry.nodeId), ['prop_sky_sutra_disc'])
  assert.deepEqual(plan.runGroups.map((group) => group.targets.map((entry) => entry.nodeId)), [['prop_sky_sutra_disc']])
})

test('continuity dependency graph maps snake_case spot parents to zone references', () => {
  const graph = {
    zones: [{ id: 'zone_market', set_id: 'set_square', name: 'Market' }],
    spots: [{ id: 'spot_gate', zone_id: 'zone_market', set_id: 'set_square', name: 'Gate' }],
  }
  const nodes = continuityNodeCollections(graph)
  const spotNode = nodes.find((node) => node.id === 'spot_gate')
  const gridNode = nodes.find((node) => node.id === spotCameraGridNodeId('spot_gate'))
  assert.equal(continuityNodeParentId(spotNode!), 'zone_market')
  assert.equal(gridNode?.zoneId, 'zone_market')

  const edges = continuityVisualDependencyEdges(graph)
  assert.ok(edges.some((edge) => edge.sourceNodeId === 'zone_market' && edge.targetNodeId === 'spot_gate' && edge.relationship === 'zone_to_spot' && edge.required === true))
  assert.ok(edges.some((edge) => edge.sourceNodeId === 'zone_market' && edge.targetNodeId === 'spot_gate::camera_grid' && edge.relationship === 'zone_to_spot_camera_grid' && edge.required === true))
})
