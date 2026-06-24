import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SequenceAnimaticViewModel } from './sequenceAnimaticViewModel.ts'
import {
  buildSequenceAnimaticShotPanelCues,
  buildSequenceAnimaticShotTimelineItems,
  sequenceAnimaticIngredientsForShot,
  sequenceAnimaticKeyframePreflightForShot,
} from './sequenceAnimaticShotWorkspace.ts'

type ShotOverrides = Partial<SequenceAnimaticViewModel['blocks'][number]['shots'][number]>
type TargetOverrides = Partial<SequenceAnimaticViewModel['continuityAssetTargets'][number]>
type CoverageOverrides = Partial<SequenceAnimaticViewModel['coverageAnchors'][number]>

function shot(overrides: ShotOverrides = {}): SequenceAnimaticViewModel['blocks'][number]['shots'][number] {
  return {
    id: 'scene_01_shot_001',
    index: 1,
    title: 'Door reveal',
    isProvisional: false,
    sourceScriptShotIds: ['shot_001'],
    timeLabel: '0:00-0:04',
    durationLabel: '4s',
    action: 'The courier opens the vault door.',
    dialogue: [],
    camera: 'Low dolly toward the threshold.',
    lighting: 'Cold edge light through the doorway.',
    performance: '',
    performanceBeats: [],
    coverageSetupLabel: 'Door coverage',
    coverageSetupDetail: 'Low dolly angle.',
    coverageSetupId: '',
    coverageIntent: null,
    coverageIntentRunning: false,
    coverageIntentFailed: false,
    zoneCoverageCell: null,
    zoneCoverageCellRunning: false,
    zoneCoverageCellActiveStage: '',
    zoneCoverageCellFailed: false,
    spatialContinuityLabel: 'Vault door',
    spatialContinuityDetail: 'Station / Vault / Door',
    spatialBindingView: {
      title: 'Vault door',
      compactLabel: 'Vault door',
      detailLabel: 'Station / Vault / Door',
      statusLabel: 'Scene binding recorded',
      hierarchy: [
        {
          id: 'set_station',
          label: 'Station',
          kind: 'set',
          kindLabel: 'Set',
          summary: 'Main transit station set.',
          assetUrl: 'https://example.test/set.webp',
          assetStatusLabel: 'Asset ready',
          actionLabel: 'Regenerate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
        {
          id: 'spot_door',
          label: 'Vault door',
          kind: 'spot',
          kindLabel: 'Spot',
          summary: 'Heavy vault door threshold.',
          assetUrl: null,
          assetStatusLabel: 'Asset missing',
          actionLabel: 'Generate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
      ],
      selectedNode: null,
      assetTargetNodeId: 'spot_door',
    },
    panelStatusLabel: 'Panel not generated',
    panelError: '',
    panelAssetKey: null,
    panelUrl: null,
    panelRunning: false,
    keyframeStatusLabel: 'Keyframe not generated',
    keyframeDependencyStatusLabel: '1 keyframe ref missing',
    keyframeProgressLabel: '',
    keyframeDependencyRunning: false,
    keyframeDependencyMissingCount: 1,
    keyframeRequestId: null,
    keyframeWorkflowId: null,
    keyframeDependencyMode: '',
    keyframeGraphPolicyVersion: '',
    keyframeRunning: false,
    keyframeError: '',
    isRevised: false,
    originalAction: 'The courier opens the vault door.',
    originalCamera: 'Low dolly toward the threshold.',
    originalLighting: 'Cold edge light through the doorway.',
    revisionRequestId: null,
    revisionWorkflowId: null,
    revisionRunId: null,
    revisionRunning: false,
    revisionError: '',
    revisionPrompt: '',
    revisionSummary: '',
    references: [
      {
        entityKey: 'temp_courier',
        name: 'Courier',
        role: 'Character',
        iconId: 'character',
        iconUrl: null,
        isContinuityAnchor: true,
        continuityAnchorType: 'character',
        statusLabel: 'Asset missing',
      },
    ],
    continuityAnchorsPending: false,
    shotVideoRequestId: null,
    shotVideoWorkflowId: null,
    shotVideoRunId: null,
    shotVideoReady: false,
    shotVideoRunning: false,
    shotVideoUrl: null,
    shotVideoProgressLabel: 'Panel required',
    shotVideoError: '',
    ...overrides,
  }
}

function target(overrides: TargetOverrides): SequenceAnimaticViewModel['continuityAssetTargets'][number] {
  return {
    nodeId: 'spot_door',
    name: 'Vault door',
    assetKind: 'location_spot',
    status: 'missing',
    statusLabel: 'Asset missing',
    actionLabel: 'Generate',
    assetKey: null,
    assetUrl: null,
    blockIds: ['block_01'],
    shotIds: ['scene_01_shot_001'],
    ...overrides,
  }
}

function coverageAnchor(overrides: CoverageOverrides = {}): SequenceAnimaticViewModel['coverageAnchors'][number] {
  return {
    id: 'coverage_door',
    title: 'Door coverage',
    displayTitle: 'Door coverage',
    setupKind: 'single',
    setupKindLabel: 'Single',
    status: 'missing',
    statusLabel: 'Coverage missing',
    assetKey: null,
    assetUrl: null,
    requestId: null,
    workflowId: null,
    running: false,
    setId: 'set_station',
    zoneId: 'zone_vault',
    primarySpotId: 'spot_door',
    spotIds: ['spot_door'],
    viewpointId: '',
    characterRefIds: ['temp_courier'],
    screenDirection: 'left to right',
    camera: 'Low dolly',
    lighting: 'Cold edge',
    stagingBrief: 'A low dolly into the door threshold.',
    continuityFromSetupId: '',
    continuityMode: '',
    shotIds: ['scene_01_shot_001'],
    blockIds: ['block_01'],
    createdFromShotId: 'scene_01_shot_001',
    firstUsedShotId: 'scene_01_shot_001',
    reuseReason: '',
    usageLabel: '1 shot',
    usageDetailLabel: 'Shot 1',
    ...overrides,
  }
}

function model(input: {
  testShot?: SequenceAnimaticViewModel['blocks'][number]['shots'][number]
  targets?: SequenceAnimaticViewModel['continuityAssetTargets']
  coverageAnchors?: SequenceAnimaticViewModel['coverageAnchors']
} = {}): SequenceAnimaticViewModel {
  const testShot = input.testShot ?? shot()
  const targets = input.targets ?? [
    target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
    target({ nodeId: 'spot_door', name: 'Vault door' }),
    target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character' }),
  ]
  return {
    request: {
      id: 'master_01',
      projectId: 'project',
      draftId: 'draft',
      parentRequestId: null,
      workflowId: 'workflow_master',
      latestRunId: null,
      requestedBy: null,
      sourceSurface: 'wiki_sequence_unit',
      prompt: '',
      title: 'Animatic',
      intent: 'output_generation',
      outputKind: 'cinematic_episode',
      status: 'completed',
      selectedEntityKeys: [],
      selectedSequenceUnitKeys: ['sequence_01'],
      pageCount: null,
      targetFormat: 'video',
      plannerNotes: '',
      errorMessage: null,
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    assetPack: {},
    scenes: [{ id: 'scene_01', index: 1, title: 'Vault scene', summary: 'A vault reveal scene.', requestId: null, shotCount: 1, status: 'ready' }],
    continuityRequest: null,
    continuityRun: null,
    continuityReady: true,
    continuityRunning: false,
    continuityStale: false,
    continuityFailed: false,
    continuityError: '',
    continuityButtonLabel: '',
    continuityStatusLabel: '',
    continuityGraphStatus: 'ready',
    continuityStructureActionLabel: '',
    continuityStructureStatusLabel: '',
    continuityCoverageLabel: '',
    continuityStructureRunning: false,
    continuityAssetGenerationStatus: 'partial',
    continuityAssetTargets: targets,
    continuityGraphView: {
      nodes: targets.map((entry) => ({
        id: entry.nodeId,
        label: entry.name,
        kind: entry.nodeId.startsWith('temp') ? 'temp_character' : entry.nodeId.startsWith('spot') ? 'spot' : entry.nodeId.startsWith('zone') ? 'zone' : 'set',
        kindLabel: entry.nodeId.startsWith('temp') ? 'Temp character' : entry.nodeId.startsWith('spot') ? 'Spot' : entry.nodeId.startsWith('zone') ? 'Zone' : 'Set',
        lane: entry.nodeId === 'temp_courier' ? 'temporary' : 'spatial',
        summary: `${entry.name} visual brief`,
        shotIds: entry.shotIds,
        blockIds: entry.blockIds,
        parentId: entry.nodeId === 'spot_door' ? 'set_station' : null,
        sourceReferenceIds: [],
        assetStatus: entry.status,
        assetStatusLabel: entry.statusLabel,
        assetKind: entry.assetKind,
        assetUrl: entry.assetUrl,
        required: true,
        batchId: null,
        baseVisualBrief: `${entry.name} visual brief`,
        overrideVisualBrief: '',
        extraPromptDirection: '',
        effectiveVisualBrief: `${entry.name} visual brief`,
        canGenerate: true,
        generationTargetType: 'continuity_asset',
        generationRequestId: null,
        assetHistoryKeys: [],
        imagePoiAnchors: [],
        imagePoiAnalysisStatus: '',
        imagePoiAnalysisLabel: '',
        imagePoiAnalysisDiagnostics: [],
      })),
      edges: [],
      batches: [],
      sceneNodeCount: 2,
      tempRefCount: 1,
      missingAssetCount: targets.filter((entry) => entry.status === 'missing').length,
      readyAssetCount: targets.filter((entry) => entry.status === 'ready').length,
      runningAssetCount: targets.filter((entry) => entry.status === 'generating').length,
      failedAssetCount: targets.filter((entry) => entry.status === 'failed').length,
    },
    title: 'Animatic',
    statusLabel: 'Completed',
    progressLabel: '',
    currentStepLabel: '',
    directorPlanReady: true,
    directorPlanStatusLabel: '',
    directorPlanShotCount: 1,
    orchestrationStatusLabel: '',
    screenplayMarkdown: '',
    continuityAnchors: { characters: [], props: [], locationSpots: [] },
    coverageAnchors: input.coverageAnchors ?? [],
    zoneCoverageBoards: [],
    zoneCoverageCellByShotId: new Map(),
    zoneCoverageActiveShotIds: new Set(),
    zoneCoverageFailedShotIds: new Set(),
    coverageIntentByShotId: new Map(),
    coverageIntentActiveShotIds: new Set(),
    coverageIntentFailedShotIds: new Set(),
    continuityLocationSets: [],
    continuityLocationAngles: [],
    continuityRejectedCandidates: [],
    blocks: [{
      id: 'block_01',
      index: 1,
      title: 'Opening block',
      isProvisional: false,
      plannedShotIds: ['scene_01_shot_001'],
      durationLabel: '4s',
      statusLabel: 'Ready',
      shotRangeLabel: 'Shot 1',
      childRequestId: null,
      childWorkflowId: null,
      childRunId: null,
      readyToRun: true,
      promptNodeKey: '',
      sheetNodeKey: '',
      panelExtractNodeKey: '',
      videoPromptNodeKey: '',
      videoNodeKey: '',
      failedNodeLabel: '',
      hasPanels: false,
      storyboardReady: false,
      storyboardRunning: false,
      storyboardProgressLabel: '',
      storyboardContinuityMode: '',
      storyboardContinuityLabel: '',
      storyboardContinuityBlockers: [],
      storyboardContinuityStale: false,
      videoPromptReady: false,
      videoReady: false,
      videoRunning: false,
      videoAssetKey: null,
      videoUrl: null,
      videoProgressLabel: '',
      videoError: '',
      continuityAnchors: [],
      continuityAnchorCountLabel: '',
      continuityAnchorsPending: false,
      continuityChanged: false,
      continuityBlockStatus: 'ready',
      continuityBlockStatusLabel: '',
      continuityBlockActionLabel: '',
      continuityBlockWarnings: [],
      continuityBlockError: '',
      continuityAssetTargets: targets,
      continuityAssetCountLabel: '',
      shots: [testShot],
    }],
    hasPanels: false,
    keyframeReadyCount: 0,
    keyframeTotalCount: 1,
    keyframeRunning: false,
    keyframeProgressLabel: '',
  }
}

test('buildSequenceAnimaticShotTimelineItems flattens blocks and surfaces missing reference counts', () => {
  const view = model()
  const items = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(items.length, 1)
  assert.equal(items[0]?.sceneTitle, 'Vault scene')
  assert.equal(items[0]?.blockTitle, 'Opening block')
  assert.equal(items[0]?.missingReferenceCount, 1)
})

test('sequenceAnimaticIngredientsForShot uses shared-plan refs and display-only camera lighting', () => {
  const testShot = shot({
    coverageSetupId: 'coverage_door',
    references: [{
      entityKey: 'temp_courier',
      name: 'Courier',
      role: 'Character',
      iconId: 'character',
      iconUrl: 'https://example.test/courier-crop.webp',
      referenceArtUrl: 'https://example.test/courier-sheet.webp',
      isContinuityAnchor: true,
      continuityAnchorType: 'character',
      statusLabel: 'Asset missing',
    }],
  })
  const view = model({ testShot, coverageAnchors: [coverageAnchor()] })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const courier = ingredients.find((ingredient) => ingredient.nodeId === 'temp_courier')

  assert.ok(!ingredients.some((ingredient) => ingredient.nodeId === 'spot_door' && ingredient.requiredForKeyframe))
  assert.equal(ingredients.filter((ingredient) => ingredient.kind === 'scene_graph' || ingredient.kind === 'continuity_asset' && ingredient.spatialNode).length, 0)
  assert.ok(ingredients.some((ingredient) => ingredient.nodeId === 'temp_courier' && ingredient.typeLabel === 'Temp character'))
  assert.ok(!ingredients.some((ingredient) => ingredient.kind === 'coverage_anchor'))
  assert.ok(ingredients.some((ingredient) => ingredient.id === 'field:scene_01_shot_001:camera' && ingredient.visualBrief === 'Low dolly toward the threshold.'))
  assert.ok(ingredients.some((ingredient) => ingredient.id === 'field:scene_01_shot_001:lighting' && ingredient.visualBrief === 'Cold edge light through the doorway.'))
  assert.equal(courier?.imageUrl, 'https://example.test/courier-crop.webp')
  assert.equal(courier?.fullImageUrl, 'https://example.test/courier-sheet.webp')
})

test('sequenceAnimaticIngredientsForShot restores ready world refs from resolved shot references', () => {
  const testShot = shot({
    references: [
      {
        entityKey: 'miyo_hoshika',
        name: 'Miyo Hoshika',
        role: 'Character',
        iconId: 'character',
        assetKey: 'miyo_sheet_asset',
        iconUrl: 'https://example.test/miyo-icon.webp',
        referenceArtUrl: 'https://example.test/miyo-sheet.webp',
        statusLabel: 'Ready',
      },
      {
        entityKey: 'rin_uzuki',
        name: 'Rin Uzuki',
        role: 'Character',
        iconId: 'character',
        assetKey: 'rin_sheet_asset',
        iconUrl: 'https://example.test/rin-icon.webp',
        referenceArtUrl: 'https://example.test/rin-sheet.webp',
        statusLabel: 'Ready',
      },
    ],
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'zone_vault', name: 'Vault hall', assetKind: 'location_zone', status: 'ready', statusLabel: 'Zone ready', assetKey: 'zone_asset', assetUrl: 'https://example.test/zone.webp' }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const names = ingredients.map((ingredient) => ingredient.name)
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)

  assert.ok(names.includes('Miyo Hoshika'))
  assert.ok(names.includes('Rin Uzuki'))
  assert.equal(ingredients.find((ingredient) => ingredient.nodeId === 'miyo_hoshika')?.status, 'ready')
  assert.equal(ingredients.find((ingredient) => ingredient.nodeId === 'rin_uzuki')?.fullImageUrl, 'https://example.test/rin-sheet.webp')
  assert.deepEqual(preflight.missingIngredients.map((ingredient) => ingredient.name), [])
  assert.ok(preflight.readyIngredients.some((ingredient) => ingredient.nodeId === 'miyo_hoshika'))
  assert.ok(preflight.readyIngredients.some((ingredient) => ingredient.nodeId === 'rin_uzuki'))
})

test('sequenceAnimaticIngredientsForShot dedupes the same reference across dialogue and shot refs', () => {
  const testShot = shot({
    dialogue: [{
      id: 'line_1',
      text: 'We wait for the bell.',
      emotion: '',
      delivery: '',
      subtext: '',
      speakerRefId: 'temp_courier',
      speakerName: 'Courier',
      speakerIconId: 'character',
      speakerIconUrl: 'https://example.test/courier-crop.webp',
      speakerReferenceArtUrl: 'https://example.test/courier-sheet.webp',
    }],
    references: [{
      entityKey: 'temp_courier',
      name: 'Courier',
      role: 'Character',
      iconId: 'character',
      iconUrl: 'https://example.test/courier-crop.webp',
      referenceArtUrl: 'https://example.test/courier-sheet.webp',
      isContinuityAnchor: true,
      continuityAnchorType: 'character',
      statusLabel: 'Ready',
    }],
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'ready', statusLabel: 'Ready', assetKey: 'courier_asset', assetUrl: 'https://example.test/courier-generated.webp' }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const courierIngredients = ingredients.filter((ingredient) => ingredient.nodeId === 'temp_courier')

  assert.equal(courierIngredients.length, 1)
  assert.equal(courierIngredients[0]?.kind, 'continuity_asset')
  assert.equal(courierIngredients[0]?.fullImageUrl, 'https://example.test/courier-generated.webp')
})

test('sequenceAnimaticIngredientsForShot resolves generation targets from explicit ref ids', () => {
  const testShot = shot({
    references: [{
      entityKey: 'temp_archive_attendants',
      name: 'Archive attendants',
      role: 'Character',
      iconId: 'character',
      iconUrl: null,
      isContinuityAnchor: true,
      continuityAnchorType: 'character',
      statusLabel: 'Asset missing',
    }],
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Asset ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
      target({ nodeId: 'temp_archive_attendants', name: 'Archive Attendants', assetKind: 'temporary_character', status: 'missing', statusLabel: 'Asset missing' }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const archiveAttendants = ingredients.find((ingredient) => ingredient.nodeId === 'temp_archive_attendants')
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)

  assert.equal(archiveAttendants?.target?.nodeId, 'temp_archive_attendants')
  assert.equal(archiveAttendants?.status, 'missing')
  assert.equal(archiveAttendants?.actionLabel, 'Generate')
  assert.equal(archiveAttendants?.canGenerate, true)
  assert.equal(preflight.status, 'blocked')
  assert.ok(preflight.blockingTargets.some((target) => target.nodeId === 'temp_archive_attendants'))
})

test('sequenceAnimaticIngredientsForShot does not repair mismatched temp-prefixed ids by name', () => {
  const testShot = shot({
    references: [{
      entityKey: 'archive_attendants',
      name: 'Archive attendants',
      role: 'Character',
      iconId: 'character',
      iconUrl: null,
      isContinuityAnchor: true,
      continuityAnchorType: 'character',
      statusLabel: 'Asset missing',
    }],
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Asset ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
      target({ nodeId: 'temp_archive_attendants', name: 'Attendant batch', assetKind: 'temporary_character', status: 'missing', statusLabel: 'Asset missing', shotIds: [] }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const archiveAttendants = ingredients.find((ingredient) => ingredient.nodeId === 'temp_archive_attendants')
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)
  const timeline = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(archiveAttendants, undefined)
  assert.equal(preflight.status, 'ready')
  assert.deepEqual(preflight.blockingTargets.map((entry) => entry.nodeId), [])
  assert.equal(timeline[0]?.missingReferenceCount, 0)
})

test('sequenceAnimaticKeyframePreflightForShot counts planned temp prop ingredients as missing', () => {
  const testShot = shot({
    references: [{
      entityKey: 'sky_sutra_disc',
      name: 'Sky Sutra Disc',
      role: 'Prop',
      iconId: 'item',
      iconUrl: null,
      isContinuityAnchor: true,
      continuityAnchorType: 'prop',
      statusLabel: 'Planned',
    }],
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Asset ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
      target({ nodeId: 'prop_sky_sutra_disc', name: 'Sky Sutra Disc', assetKind: 'prop', status: 'missing', statusLabel: 'Planned' }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const disc = ingredients.find((ingredient) => ingredient.name === 'Sky Sutra Disc')
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)
  const timeline = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(disc?.target?.nodeId, 'prop_sky_sutra_disc')
  assert.equal(disc?.status, 'missing')
  assert.equal(disc?.requiredForKeyframe, true)
  assert.equal(disc?.canGenerate, true)
  assert.equal(preflight.status, 'blocked')
  assert.deepEqual(preflight.missingIngredients.map((ingredient) => ingredient.name), ['Sky Sutra Disc'])
  assert.equal(timeline[0]?.missingReferenceCount, 1)
})

test('sequenceAnimaticIngredientsForShot uses a ready zone reference for a missing spot ingredient', () => {
  const testShot = shot({
    spatialBindingView: {
      ...shot().spatialBindingView,
      hierarchy: [
        {
          id: 'set_station',
          label: 'Station',
          kind: 'set',
          kindLabel: 'Set',
          summary: 'Main transit station set.',
          assetUrl: null,
          assetStatusLabel: 'Asset missing',
          actionLabel: 'Generate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
        {
          id: 'zone_vault',
          label: 'Vault hall',
          kind: 'zone',
          kindLabel: 'Zone',
          summary: 'Zone sheet containing the vault door spot.',
          assetUrl: 'https://example.test/zone.webp',
          assetStatusLabel: 'Zone ready',
          actionLabel: 'Regenerate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
        {
          id: 'spot_door',
          label: 'Vault door',
          kind: 'spot',
          kindLabel: 'Spot',
          summary: 'Heavy vault door threshold.',
          assetUrl: null,
          assetStatusLabel: 'Spot missing',
          actionLabel: 'Generate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
      ],
      assetTargetNodeId: 'spot_door',
    },
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'zone_vault', name: 'Vault hall', assetKind: 'location_zone', status: 'ready', statusLabel: 'Zone ready', assetKey: 'zone_asset', assetUrl: 'https://example.test/zone.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'missing', statusLabel: 'Spot missing' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'ready', statusLabel: 'Asset ready', assetKey: 'char_asset', assetUrl: 'https://example.test/char.webp' }),
    ],
  })
  const ingredients = sequenceAnimaticIngredientsForShot(view, testShot)
  const spot = ingredients.find((ingredient) => ingredient.nodeId === 'zone_vault')
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)
  const timeline = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(spot?.name, 'Vault hall')
  assert.equal(spot?.status, 'ready')
  assert.equal(spot?.target?.nodeId, 'zone_vault')
  assert.equal(spot?.fullImageUrl, 'https://example.test/zone.webp')
  assert.equal(preflight.status, 'ready')
  assert.equal(preflight.blockingTargets.some((entry) => entry.nodeId === 'spot_door'), false)
  assert.equal(timeline[0]?.missingReferenceCount, 0)
})

test('sequenceAnimaticKeyframePreflightForShot ignores extra missing spot targets when zone is ready', () => {
  const testShot = shot({
    spatialBindingView: {
      ...shot().spatialBindingView,
      hierarchy: [
        {
          id: 'zone_shelf_bank',
          label: 'Shelf Bank Crawlspace',
          kind: 'zone',
          kindLabel: 'Zone',
          summary: 'Generated zone map containing shelf-bank exits.',
          assetUrl: 'https://example.test/zone-shelf.webp',
          assetStatusLabel: 'Zone ready',
          actionLabel: 'Regenerate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
        {
          id: 'spot_crawlspace',
          label: 'Shelf Bank Crawlspace',
          kind: 'spot',
          kindLabel: 'Spot',
          summary: 'Selected crawlspace shot spot.',
          assetUrl: null,
          assetStatusLabel: 'Spot missing',
          actionLabel: 'Generate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
      ],
      assetTargetNodeId: 'spot_crawlspace',
    },
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'zone_shelf_bank', name: 'Shelf Bank Crawlspace', assetKind: 'location_zone', status: 'ready', statusLabel: 'Zone ready', assetKey: 'zone_asset', assetUrl: 'https://example.test/zone-shelf.webp' }),
      target({ nodeId: 'spot_crawlspace', name: 'Shelf Bank Crawlspace', assetKind: 'location_spot', status: 'missing', statusLabel: 'Spot missing' }),
      target({ nodeId: 'spot_loose_reed_panel_exit', name: 'Loose Reed Panel Exit', assetKind: 'location_spot', status: 'missing', statusLabel: 'Spot missing' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'ready', statusLabel: 'Asset ready', assetKey: 'char_asset', assetUrl: 'https://example.test/char.webp' }),
    ],
  })
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)
  const timeline = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(preflight.status, 'ready')
  assert.deepEqual(preflight.blockingTargets.map((entry) => entry.nodeId), [])
  assert.equal(timeline[0]?.missingReferenceCount, 0)
})

test('sequenceAnimaticKeyframePreflightForShot ignores unselected parent spatial targets', () => {
  const testShot = shot({
    spatialBindingView: {
      ...shot().spatialBindingView,
      hierarchy: [
        {
          id: 'set_station',
          label: 'Station',
          kind: 'set',
          kindLabel: 'Set',
          summary: 'Parent station set.',
          assetUrl: null,
          assetStatusLabel: 'Set missing',
          actionLabel: 'Generate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
        {
          id: 'spot_door',
          label: 'Vault door',
          kind: 'spot',
          kindLabel: 'Spot',
          summary: 'Selected shot spot.',
          assetUrl: 'https://example.test/spot.webp',
          assetStatusLabel: 'Spot ready',
          actionLabel: 'Regenerate',
          shotIds: ['scene_01_shot_001'],
          blockIds: ['block_01'],
        },
      ],
      assetTargetNodeId: 'spot_door',
    },
  })
  const view = model({
    testShot,
    targets: [
      target({ nodeId: 'set_station', name: 'Station', assetKind: 'location_set', status: 'missing', statusLabel: 'Set missing' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Spot ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'ready', statusLabel: 'Asset ready', assetKey: 'char_asset', assetUrl: 'https://example.test/char.webp' }),
    ],
  })
  const preflight = sequenceAnimaticKeyframePreflightForShot(view, testShot)
  const timeline = buildSequenceAnimaticShotTimelineItems(view)

  assert.equal(preflight.status, 'ready')
  assert.equal(preflight.blockingTargets.some((entry) => entry.nodeId === 'set_station'), false)
  assert.equal(timeline[0]?.missingReferenceCount, 0)
})

test('buildSequenceAnimaticShotPanelCues normalizes action and dialogue into scrub cues', () => {
  const testShot = shot({
    action: 'The courier raises a hand to stop the others.',
    dialogue: [
      {
        id: 'line_1',
        text: 'Wait for the bell.',
        emotion: 'tense',
        delivery: 'whispered',
        subtext: '',
        speakerRefId: 'temp_courier',
        speakerName: 'Courier',
        speakerIconId: 'character',
        speakerIconUrl: 'https://example.test/courier-crop.webp',
        speakerReferenceArtUrl: 'https://example.test/courier-sheet.webp',
      },
      {
        id: 'line_2',
        text: 'It already rang.',
        emotion: '',
        delivery: '',
        subtext: 'too late',
        speakerRefId: 'temp_guard',
        speakerName: 'Guard',
        speakerIconId: 'character',
        speakerIconUrl: null,
        speakerReferenceArtUrl: null,
      },
    ],
  })
  const cues = buildSequenceAnimaticShotPanelCues(testShot)

  assert.equal(cues.length, 3)
  assert.equal(cues[0]?.kind, 'action')
  assert.equal(cues[0]?.start, 0)
  assert.equal(cues[0]?.end, 1 / 3)
  assert.equal(cues[1]?.kind, 'dialogue')
  assert.equal(cues[1]?.speakerName, 'Courier')
  assert.equal(cues[1]?.iconUrl, 'https://example.test/courier-crop.webp')
  assert.equal(cues[1]?.metaLabel, 'tense / whispered')
  assert.equal(cues[2]?.end, 1)
})

test('sequenceAnimaticKeyframePreflightForShot is ready when required references are ready', () => {
  const readyTargets = [
    target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
    target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Asset ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
    target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'ready', statusLabel: 'Asset ready', assetKey: 'char_asset', assetUrl: 'https://example.test/char.webp' }),
  ]
  const view = model({ targets: readyTargets })
  const result = sequenceAnimaticKeyframePreflightForShot(view, view.blocks[0]!.shots[0]!)

  assert.equal(result.status, 'ready')
  assert.equal(result.blockingTargets.length, 0)
})

test('sequenceAnimaticKeyframePreflightForShot blocks on missing or failed references', () => {
  const view = model({
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'failed', statusLabel: 'Asset failed' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'missing', statusLabel: 'Asset missing' }),
    ],
  })
  const result = sequenceAnimaticKeyframePreflightForShot(view, view.blocks[0]!.shots[0]!)

  assert.equal(result.status, 'blocked')
  assert.deepEqual(result.blockingTargets.map((entry) => entry.nodeId).sort(), ['temp_courier'])
})

test('sequenceAnimaticKeyframePreflightForShot reports generating references before blocking', () => {
  const view = model({
    targets: [
      target({ nodeId: 'set_station', name: 'Station', status: 'ready', statusLabel: 'Asset ready', assetKey: 'set_asset', assetUrl: 'https://example.test/set.webp' }),
      target({ nodeId: 'spot_door', name: 'Vault door', status: 'ready', statusLabel: 'Asset ready', assetKey: 'spot_asset', assetUrl: 'https://example.test/spot.webp' }),
      target({ nodeId: 'temp_courier', name: 'Courier', assetKind: 'temporary_character', status: 'generating', statusLabel: 'Generating asset' }),
    ],
  })
  const result = sequenceAnimaticKeyframePreflightForShot(view, view.blocks[0]!.shots[0]!)

  assert.equal(result.status, 'generating')
  assert.deepEqual(result.generatingTargets.map((entry) => entry.nodeId), ['temp_courier'])
})
