import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSequenceAnimaticShotIngredientReferencePlan,
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
  assert.deepEqual(plan.coverageAnchors[0].selectedReferences, [
    { assetKey: 'asset_set_1', role: 'selected_reference', reason: 'Selected for coverage anchor generation.' },
  ])
  assert.deepEqual(plan.shotKeyframes[1].blockingAssetIds, ['coverage:setup_a', 'shot:shot_1'])
})

test('visual reference plan preserves role-aware selected and omitted reference diagnostics', () => {
  const plan = buildSequenceAnimaticVisualReferencePlan({
    keyframePlan: {
      coverageAnchorJobs: [],
      shotKeyframeJobs: [{ shotId: 'shot_1', coverageSetupId: 'setup_a' }],
    },
    dependencyNodeIds: [],
    missingDependencyNodeIds: [],
    coverageAnchorAssetKeysBySetupId: {},
    shotKeyframeAssetKeysByShotId: {},
    shotRequiredReferenceAssetKeysByShotId: { shot_1: ['asset_anchor', 'asset_actor'] },
    shotOmittedReferenceAssetKeysByShotId: { shot_1: ['asset_extra'] },
    shotSelectedReferencesByShotId: {
      shot_1: [
        { assetKey: 'asset_anchor', role: 'coverage_anchor', reason: 'Reusable coverage anchor for this camera setup.' },
        { assetKey: 'asset_actor', role: 'entity_reference', reason: 'Visible character reference.' },
      ],
    },
    shotOmittedReferencesByShotId: {
      shot_1: [
        { assetKey: 'asset_extra', role: 'continuity_asset', reason: 'Omitted because the shot reference budget was full.' },
      ],
    },
  })

  assert.deepEqual(plan.shotKeyframes[0].selectedReferences.map((entry) => entry.role), ['coverage_anchor', 'entity_reference'])
  assert.deepEqual(plan.shotKeyframes[0].omittedReferences, [
    { assetKey: 'asset_extra', role: 'continuity_asset', reason: 'Omitted because the shot reference budget was full.' },
  ])
})

test('visual reference plan can treat coverage anchors as optional for ingredient keyframes', () => {
  const plan = buildSequenceAnimaticVisualReferencePlan({
    keyframePlan: {
      coverageAnchorJobs: [
        { coverageSetupId: 'setup_a', shotIds: ['shot_1'] },
      ],
      shotKeyframeJobs: [
        { shotId: 'shot_1', storyboardBlockId: 'block_1', coverageSetupId: 'setup_a', requiresCoverageAnchor: true },
      ],
    },
    dependencyNodeIds: [],
    missingDependencyNodeIds: [],
    coverageAnchorAssetKeysBySetupId: {},
    shotKeyframeAssetKeysByShotId: {},
    shotRequiredReferenceAssetKeysByShotId: { shot_1: ['asset_zone', 'asset_actor'] },
    coverageAnchorsRequiredForKeyframes: false,
  })

  assert.equal(plan.dependencyReadiness.status, 'ready_for_keyframes')
  assert.equal(plan.counts.blockedShotKeyframes, 0)
  assert.deepEqual(plan.shotKeyframes[0].blockingAssetIds, [])
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

test('shot ingredient reference plan uses ready zone instead of spot or set refs', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_1_shot_1',
      references: [{ entityKey: 'kaij_sora', name: 'Kaij Sora' }],
      dialogue: [],
    },
    spatialNodes: [
      { id: 'set_archive', kind: 'location_set', name: 'Archive Set', assetKey: 'set_asset' },
      { id: 'zone_shelf_bank', kind: 'location_zone', name: 'Shelf Bank Crawlspace', assetKey: 'zone_asset' },
      { id: 'spot_loose_reed_panel_exit', kind: 'location_spot', name: 'Loose Reed Panel Exit', assetKey: 'stale_spot_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaij_sora', name: 'Kaij Sora', type: 'character', primaryAssetKey: 'kaij_asset' },
      ],
    },
    continuityTargets: [],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset', 'kaij_asset'])
  assert.equal(plan.ingredients[0].kind, 'zone_location')
  assert.equal(plan.ingredients[0].assetKey, 'zone_asset')
  assert.equal(plan.requiredReferenceAssetKeys.includes('stale_spot_asset'), false)
  assert.equal(plan.requiredReferenceAssetKeys.includes('set_asset'), false)
})

test('shot ingredient reference plan includes dialogue characters and animatic-local refs', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_1_shot_2',
      references: [
        { entityKey: 'sky_sutra_disc', name: 'Sky Sutra Disc' },
      ],
      dialogue: [
        { speakerRefId: 'kaij_sora', speakerName: 'Kaij Sora', text: 'Move.' },
        { speakerRefId: 'archive_attendants', speakerName: 'Archive Attendants', text: 'Stop him.' },
      ],
      camera: 'Medium close-up.',
      lighting: 'Blue side-light.',
    },
    spatialNodes: [
      { id: 'zone_archive', kind: 'location_zone', name: 'Archive Zone', assetKey: 'zone_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaij_sora', name: 'Kaij Sora', type: 'character', primaryAssetKey: 'kaij_asset' },
      ],
    },
    continuityTargets: [
      { nodeId: 'archive_attendants', name: 'Archive Attendants', assetKind: 'temporary_character', status: 'ready', assetKey: 'attendants_asset', shotIds: ['scene_1_shot_2'] },
      { nodeId: 'sky_sutra_disc', name: 'Sky Sutra Disc', assetKind: 'prop', status: 'missing', shotIds: ['scene_1_shot_2'] },
    ],
  })

  assert.deepEqual(plan.ingredients.map((entry) => entry.kind), ['zone_location', 'world_character', 'temp_character', 'item_or_prop'])
  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset', 'kaij_asset', 'attendants_asset'])
  assert.deepEqual(plan.missingReferences.map((entry) => entry.name), ['Sky Sutra Disc'])
  assert.equal(plan.selectedReferences.some((entry) => entry.role === 'coverage_anchor'), false)
})

test('shot ingredient reference plan uses explicit reference ids instead of inferring from action text', () => {
  const baseInput = {
    shot: {
      id: 'scene_1_shot_4',
      action: 'Three attendants rise from the reeds; Rin slides in front of Miyo while Kaji lifts open hands.',
      visibleCharacterRefIds: [],
      speakerRefIds: [],
      references: [],
      dialogue: [],
    },
    spatialNodes: [
      { id: 'zone_marsh_path', kind: 'location_zone', name: 'Marsh Path', assetKey: 'zone_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaji_sora', name: 'Kaji Sora', type: 'character', primaryAssetKey: 'kaji_asset' },
        { key: 'rin_uzuki', name: 'Rin Uzuki', type: 'actor', primaryAssetKey: 'rin_asset' },
        { key: 'miyo_hoshika', name: 'Miyo Hoshika', type: 'character', primaryAssetKey: 'miyo_asset' },
        { key: 'monastery_of_static', name: 'Monastery of Static', type: 'location', primaryAssetKey: 'location_asset' },
      ],
    },
    continuityTargets: [
      {
        nodeId: 'scene_001_local_attendants',
        name: 'Monastery attendants',
        assetKind: 'crowd',
        status: 'ready',
        assetKey: 'attendants_asset',
        shotIds: ['scene_1_shot_4'],
      },
    ],
  }

  const withoutExplicitRefs = buildSequenceAnimaticShotIngredientReferencePlan(baseInput)
  assert.deepEqual(withoutExplicitRefs.requiredReferenceAssetKeys, ['zone_asset', 'attendants_asset'])

  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    ...baseInput,
    explicitReferenceIds: ['kaji_sora', 'rin_uzuki', 'miyo_hoshika'],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset', 'kaji_asset', 'rin_asset', 'miyo_asset', 'attendants_asset'])
  assert.deepEqual(plan.ingredients.map((entry) => entry.name), ['Marsh Path', 'Kaji Sora', 'Rin Uzuki', 'Miyo Hoshika', 'Monastery attendants'])
  assert.equal(plan.ingredients.at(-1)?.kind, 'temp_character')
  assert.equal(plan.requiredReferenceAssetKeys.includes('location_asset'), false)
})

test('shot ingredient reference plan includes persisted localReferenceIds even without shotIds', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_3_shot_2',
      refs: {
        localReferenceIds: ['scene_003_ref_disc'],
        propRefIds: ['scene_003_ref_disc'],
      },
      references: [],
      dialogue: [],
    },
    spatialNodes: [
      { id: 'zone_archive', kind: 'location_zone', name: 'Archive Zone', assetKey: 'zone_asset' },
    ],
    assetPack: { entities: [] },
    continuityTargets: [
      {
        nodeId: 'scene_003_ref_disc',
        name: 'Sky Sutra disc fragment',
        assetKind: 'prop',
        assetKey: 'disc_fragment_asset',
        status: 'ready',
        shotIds: [],
      },
    ],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset', 'disc_fragment_asset'])
  assert.deepEqual(plan.ingredients.map((entry) => entry.nodeId), ['zone_archive', 'scene_003_ref_disc'])
})

test('shot ingredient reference plan does not match world entities from speaker display names alone', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_4_shot_1',
      dialogue: [{ speakerName: 'Kaji Sora', text: 'Wait.' }],
      references: [],
    },
    spatialNodes: [
      { id: 'zone_gate', kind: 'location_zone', name: 'Gate Zone', assetKey: 'zone_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaij_sora', name: 'Kaji Sora', type: 'character', primaryAssetKey: 'kaij_asset' },
      ],
    },
    continuityTargets: [],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset'])
  assert.equal(plan.ingredients.some((entry) => entry.entityKey === 'kaij_sora'), false)
})

test('shot ingredient reference plan does not match references by display name alone', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_4_shot_2',
      references: [
        { entityKey: 'unresolved_actor_alias', name: 'Kaji Sora' },
        { entityKey: 'unresolved_disc_alias', name: 'Sky Sutra Disc' },
      ],
      dialogue: [],
    },
    spatialNodes: [
      { id: 'zone_gate', kind: 'location_zone', name: 'Gate Zone', assetKey: 'zone_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaij_sora', name: 'Kaji Sora', type: 'character', primaryAssetKey: 'kaij_asset' },
      ],
    },
    continuityTargets: [
      {
        nodeId: 'scene_004_local_sky_sutra_disc',
        name: 'Sky Sutra Disc',
        assetKind: 'prop',
        assetKey: 'disc_asset',
        status: 'ready',
        shotIds: [],
      },
    ],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset'])
  assert.equal(plan.ingredients.some((entry) => entry.entityKey === 'kaij_sora'), false)
  assert.equal(plan.ingredients.some((entry) => entry.nodeId === 'scene_004_local_sky_sutra_disc'), false)
})

test('shot ingredient reference plan restores world refs saved under explicit world ref fields', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_5_shot_1',
      references: [
        { worldRefId: 'kaij_sora', name: 'Display name is ignored' },
        { world_ref_id: 'rin_uzuki' },
        { entityRefId: 'choice_coin' },
        { reference_id: 'sky_sutra_disc' },
      ],
      dialogue: [
        { world_ref_id: 'miyo_hoshika', speakerName: 'Miyo' },
      ],
      performanceBeats: [
        { entity_ref_id: 'archive_guard' },
      ],
    },
    spatialNodes: [
      { id: 'zone_gate', kind: 'location_zone', name: 'Gate Zone', assetKey: 'zone_asset' },
    ],
    assetPack: {
      entities: [
        { key: 'kaij_sora', name: 'Kaij Sora', type: 'character', primaryAssetKey: 'kaij_asset' },
        { key: 'rin_uzuki', name: 'Rin Uzuki', type: 'character', primaryAssetKey: 'rin_asset' },
        { key: 'miyo_hoshika', name: 'Miyo Hoshika', type: 'character', primaryAssetKey: 'miyo_asset' },
        { key: 'choice_coin', name: 'Choice Coin', type: 'item', primaryAssetKey: 'coin_asset' },
        { key: 'sky_sutra_disc', name: 'Sky Sutra Disc', type: 'prop', primaryAssetKey: 'disc_asset' },
        { key: 'archive_guard', name: 'Archive Guard', type: 'character', primaryAssetKey: 'guard_asset' },
      ],
    },
    continuityTargets: [],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, [
    'zone_asset',
    'kaij_asset',
    'rin_asset',
    'miyo_asset',
    'coin_asset',
    'disc_asset',
    'guard_asset',
  ])
  assert.deepEqual(plan.ingredients.map((entry) => entry.entityKey), [
    'zone_gate',
    'kaij_sora',
    'rin_uzuki',
    'miyo_hoshika',
    'choice_coin',
    'sky_sutra_disc',
    'archive_guard',
  ])
})

test('shot ingredient reference plan does not let scene-local refs leak across shots', () => {
  const plan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot: {
      id: 'scene_2_shot_4',
      references: [
        { entityKey: 'scene_002_local_sky_sutra_disc', name: 'Sky Sutra Disc' },
      ],
      dialogue: [],
    },
    spatialNodes: [
      { id: 'zone_archive', kind: 'location_zone', name: 'Archive Zone', assetKey: 'zone_asset' },
    ],
    assetPack: { entities: [] },
    continuityTargets: [
      {
        nodeId: 'scene_002_local_sky_sutra_disc',
        name: 'Sky Sutra Disc',
        assetKind: 'prop',
        status: 'missing',
        shotIds: ['scene_2_shot_1'],
      },
      {
        nodeId: 'scene_002_local_choice_coin',
        name: 'Choice Coin',
        assetKind: 'prop',
        status: 'missing',
        shotIds: ['scene_2_shot_1'],
      },
    ],
  })

  assert.deepEqual(plan.requiredReferenceAssetKeys, ['zone_asset'])
  assert.deepEqual(plan.missingReferences, [])
  assert.equal(plan.ingredients.some((entry) => entry.nodeId === 'scene_002_local_sky_sutra_disc'), false)
  assert.equal(plan.ingredients.some((entry) => entry.nodeId === 'scene_002_local_choice_coin'), false)
})
