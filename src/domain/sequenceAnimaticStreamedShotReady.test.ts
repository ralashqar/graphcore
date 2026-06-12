import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSequenceAnimaticStreamedShotReadyContext } from './sequenceAnimaticStreamedShotReady.ts'

const referenceSelectStep = {
  node_key: 'cinematic_v3_reference_select',
  status: 'completed',
  outputs: {
    assetPack: {
      aspectRatio: '16:9',
      entities: [
        { key: 'hero', primaryAssetKey: 'asset_hero_ref', assetKeys: ['asset_hero_ref'] },
      ],
    },
  },
}

const sceneAssignmentStep = {
  node_key: 'sequence_animatic_scene_graph_assignment',
  status: 'completed',
  outputs: {
    scenePackage: {
      scenePackages: [
        {
          sceneId: 'scene_1',
          setId: 'set_bridge',
          zoneId: 'zone_deck',
          spotIds: ['spot_rail'],
          sceneGraphDraft: {
            additions: [
              { kind: 'set', id: 'set_bridge', worldLocationRefId: 'loc_bridge', name: 'Bridge' },
              { kind: 'zone', id: 'zone_deck', setId: 'set_bridge', name: 'Deck' },
              { kind: 'spot', id: 'spot_rail', zoneId: 'zone_deck', name: 'Rail' },
            ],
          },
        },
      ],
    },
  },
}

function baseEvents() {
  return [
    {
      event_type: 'block_planned',
      payload: {
        blockId: 'block_1',
        block: { id: 'block_1', index: 1, title: 'Block 1', shotIds: ['shot_1'] },
      },
    },
    {
      event_type: 'coverage_setup_registered',
      payload: {
        setupId: 'setup_wide',
        coverageSetup: {
          id: 'setup_wide',
          title: 'Wide bridge setup',
          setId: 'set_bridge',
          zoneId: 'zone_deck',
          primarySpotId: 'spot_rail',
          usedShotIds: ['shot_1'],
        },
      },
    },
    {
      event_type: 'shot_streamed',
      payload: {
        shotId: 'shot_1',
        blockId: 'block_1',
        shot: {
          id: 'shot_1',
          index: 1,
          blockId: 'block_1',
          sceneId: 'scene_1',
          title: 'Hero at the rail',
          action: 'The hero looks over the rail.',
          coverageSetupId: 'setup_wide',
          refs: { visibleCharacterRefIds: ['hero'] },
        },
      },
    },
  ]
}

test('streamed shot-ready context includes shot, coverage, graph, bindings, and refs', () => {
  const context = buildSequenceAnimaticStreamedShotReadyContext({
    masterRequestId: 'master_1',
    steps: [referenceSelectStep, sceneAssignmentStep],
    events: baseEvents(),
    requestedShotIds: ['shot_1'],
  })

  const entities = context.assetPack.entities as Array<Record<string, unknown>>
  const locationSets = context.continuityGraphV2.locationSets as Array<Record<string, unknown>>
  assert.equal(context.source, 'streamed_scene_plan')
  assert.deepEqual(context.includedShotIds, ['shot_1'])
  assert.equal(entities[0].key, 'hero')
  assert.equal(context.coverageSetups[0].id, 'setup_wide')
  assert.equal(context.shotBindings.shot_1.setId, 'set_bridge')
  assert.equal(locationSets[0].id, 'set_bridge')
  assert.equal(context.manifest.source, 'streamed_scene_plan')
  assert.equal(context.directorPlan.provisional, true)
})

test('streamed shot-ready context requires reference selection', () => {
  assert.throws(
    () => buildSequenceAnimaticStreamedShotReadyContext({
      masterRequestId: 'master_1',
      steps: [sceneAssignmentStep],
      events: baseEvents(),
      requestedShotIds: ['shot_1'],
    }),
    /Reference selection is not ready yet/,
  )
})

test('streamed shot-ready context requires a usable shot binding', () => {
  assert.throws(
    () => buildSequenceAnimaticStreamedShotReadyContext({
      masterRequestId: 'master_1',
      steps: [referenceSelectStep],
      events: [
        {
          event_type: 'shot_streamed',
          payload: {
            shotId: 'shot_1',
            shot: { id: 'shot_1', blockId: 'block_1', title: 'Unbound shot' },
          },
        },
      ],
      requestedShotIds: ['shot_1'],
    }),
    /Shot shot_1 binding is not ready yet/,
  )
})

test('streamed local references become continuity graph asset anchors', () => {
  const context = buildSequenceAnimaticStreamedShotReadyContext({
    masterRequestId: 'master_1',
    steps: [referenceSelectStep, sceneAssignmentStep],
    events: [
      ...baseEvents(),
      {
        event_type: 'local_reference_registered',
        payload: {
          referenceId: 'tmp_guard',
          localReference: {
            id: 'tmp_guard',
            type: 'character',
            name: 'Temporary Guard',
            usedShotIds: ['shot_1'],
          },
        },
      },
    ],
    requestedShotIds: ['shot_1'],
  })

  const assetAnchors = context.continuityGraphV2.assetAnchors as Array<Record<string, unknown>>
  assert.equal(assetAnchors[0].id, 'tmp_guard')
  assert.equal(assetAnchors[0].type, 'character')
  assert.deepEqual(assetAnchors[0].shotIds, ['shot_1'])
})
