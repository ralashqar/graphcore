import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  continuityBatchKindForNodes,
  continuityBatchLayoutForTargetCount,
  continuityNodeCollections,
  continuityVisualDependencyEdges,
  dependencyNodeIdsForKeyframePlan,
  spotCameraGridNodeId,
} from './sequenceAnimaticContinuityDependencies.ts'

test('continuity batch layout uses crop-safe 1x1, 1x2, and 2x2 grids', () => {
  assert.deepEqual(continuityBatchLayoutForTargetCount(1), { rows: 1, columns: 1, cellCount: 1 })
  assert.deepEqual(continuityBatchLayoutForTargetCount(2), { rows: 1, columns: 2, cellCount: 2 })
  assert.deepEqual(continuityBatchLayoutForTargetCount(3), { rows: 2, columns: 2, cellCount: 3 })
  assert.deepEqual(continuityBatchLayoutForTargetCount(4), { rows: 2, columns: 2, cellCount: 4 })
  assert.deepEqual(continuityBatchLayoutForTargetCount(6), { rows: 2, columns: 2, cellCount: 4 })
})

test('continuity batch kind supports zones, parent-child scaffolds, temporary characters, and props', () => {
  assert.equal(continuityBatchKindForNodes([
    { id: 'zone_a', nodeKind: 'location_zone', setId: 'set_bridge' },
    { id: 'zone_b', nodeKind: 'location_zone', setId: 'set_bridge' },
  ]), 'location_zone_board')
  assert.equal(continuityBatchKindForNodes([
    { id: 'set_bridge', nodeKind: 'location_set' },
    { id: 'zone_console', nodeKind: 'location_zone', setId: 'set_bridge' },
    { id: 'zone_airlock', nodeKind: 'location_zone', setId: 'set_bridge' },
  ]), 'parent_child_scaffold_grid')
  assert.equal(continuityBatchKindForNodes([
    { id: 'temp_reno', nodeKind: 'temporary_character' },
    { id: 'temp_guard', nodeKind: 'temporary_character' },
  ]), 'temp_character_grid')
  assert.equal(continuityBatchKindForNodes([
    { id: 'prop_chip', nodeKind: 'prop' },
    { id: 'prop_key', nodeKind: 'prop' },
  ]), 'prop_grid')
  assert.equal(continuityBatchKindForNodes([
    { id: spotCameraGridNodeId('spot_terminal'), nodeKind: 'spot_camera_grid', spotId: 'spot_terminal' },
  ]), 'spot_camera_grid')
})

test('dependency helpers collect scene graph nodes and shot/coverage dependencies', () => {
  const graph = {
    locationSets: [{ id: 'set_bridge', worldLocationRefId: 'world_bridge' }],
    zones: [{ id: 'zone_console', setId: 'set_bridge' }],
    spots: [{ id: 'spot_terminal', zoneId: 'zone_console' }],
    viewpoints: [{ id: 'view_terminal', spotIds: ['spot_terminal'] }],
    assetAnchors: [
      { id: 'temp_reno', type: 'character' },
      { id: 'prop_decoder', type: 'prop' },
    ],
  }
  const nodes = continuityNodeCollections(graph)
  const nodeIds = new Set(nodes.map((node) => String(node.id)))

  assert.deepEqual(nodes.map((node) => node.nodeKind), [
    'location_set',
    'location_zone',
    'location_spot',
    'spot_camera_grid',
    'location_viewpoint',
    'temporary_character',
    'prop',
  ])
  assert.deepEqual(continuityVisualDependencyEdges(graph).map((edge) => `${edge.sourceNodeId}->${edge.targetNodeId}`), [
    'world_bridge->set_bridge',
    'set_bridge->zone_console',
    'zone_console->spot_terminal',
    'zone_console->spot_terminal::camera_grid',
    'spot_terminal->spot_terminal::camera_grid',
    'spot_terminal->view_terminal',
  ])
  assert.deepEqual(dependencyNodeIdsForKeyframePlan({
    graphNodeIds: nodeIds,
    keyframePlan: {
      coverageAnchorJobs: [{ coverageSetup: { id: 'setup_a', setId: 'set_bridge', zoneId: 'zone_console', primarySpotId: 'spot_terminal' } }],
      shotKeyframeJobs: [{
        shot: {
          id: 'shot_1',
          sceneBinding: { setId: 'set_bridge', zoneId: 'zone_console', primarySpotId: 'spot_terminal', viewpointId: 'view_terminal' },
          refs: { visibleCharacterRefIds: ['temp_reno'], propRefIds: ['prop_decoder'] },
        },
      }],
    },
  }), ['set_bridge', 'zone_console', 'spot_terminal', 'spot_terminal::camera_grid', 'view_terminal', 'temp_reno', 'prop_decoder'])
})
