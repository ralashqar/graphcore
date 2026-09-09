import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVibeContinuityInspector,
  buildVibeDirectingStylePrompt,
  buildVibeDirectorWorkflowBrief,
  buildVibeRecommendedActions,
  buildVibeWorldStateSummary,
  buildVibeShotRecommendations,
  formatVibeDirectorWorkflowBriefForPrompt,
  createVibeDirectorSession,
  createVibeDirectorSessionForSnapshot,
  parseVibeDirectorSession,
} from './vibeDirector.ts'

test('vibe director migrates comic-only v1 sessions to flexible v3 sessions', () => {
  const migrated = parseVibeDirectorSession({
    version: 1,
    phase: 'comic_generation',
    premise: 'A courier crosses a flooded city to deliver a forbidden map.',
    premiseKind: 'premise',
    outputRequestId: 'comic_request_1',
    messages: [],
    qualityGates: [],
    metadata: {},
    updatedAt: '2026-06-30T12:00:00.000Z',
  })

  assert.ok(migrated)
  assert.equal(migrated.version, 3)
  assert.equal(migrated.outputPath, 'comic')
  assert.equal(migrated.comicOutputRequestId, 'comic_request_1')
  assert.equal(migrated.cinematicMasterRequestId, null)
  assert.deepEqual(migrated.selectedComicReferenceArtifactKeys, [])
  assert.equal(migrated.directingStylePreset, 'classical_continuity')
  assert.deepEqual(migrated.shotDirectingNotesByShotId, {})
})

test('vibe director recommends branching after sequence approval', () => {
  const session = {
    ...createVibeDirectorSession('2026-06-30T12:00:00.000Z'),
    phase: 'sequence_unit_review' as const,
    selectedSequenceUnitKey: 'seq_001',
    premiseKind: 'premise' as const,
  }

  const actions = buildVibeRecommendedActions({
    session,
    referenceCount: 4,
    sequenceCount: 1,
    hasComicOutput: false,
    hasCinematicOutput: false,
  })

  assert.deepEqual(
    actions.map((action) => action.actionKind),
    ['choose_both', 'choose_cinematic', 'choose_comic'],
  )
})

test('vibe director starts populated worlds at target selection with existing style', () => {
  const snapshot = {
    project: { id: 'project_1', name: 'Flood Archive', summary: 'A city of drowned maps.' },
    draft: {
      metadata: {
        worldWiki: {
          title: 'Flood Archive',
          logline: 'A courier crosses the drowned archive district.',
          artStyleDescription: 'Rainy neon noir with practical lensing.',
          brandAtlasAssetKey: 'atlas_1',
          palette: ['cyan', 'black'],
        },
      },
    },
    worldEntities: [
      { key: 'seq_1', name: 'Crossing the Archive', nodeType: 'sequence_unit', status: 'active', summary: 'Mara crosses the flooded archive.' },
      { key: 'actor_1', name: 'Mara', nodeType: 'actor', status: 'active', summary: 'A courier.' },
      { key: 'place_1', name: 'Archive District', nodeType: 'place', status: 'active', summary: 'A drowned civic archive.' },
    ],
    outputRequests: [],
  } as any

  const summary = buildVibeWorldStateSummary(snapshot)
  const session = createVibeDirectorSessionForSnapshot(snapshot, '2026-07-01T10:00:00.000Z')

  assert.equal(summary.populated, true)
  assert.equal(summary.sequenceCount, 1)
  assert.equal(summary.hasWorldStyle, true)
  assert.equal(session.phase, 'world_target_selection')
  assert.equal(session.mode, 'existing_sequence')
  assert.equal(session.lockedArtStyle, true)
  assert.equal(session.selectedSequenceUnitKey, 'seq_1')
  assert.deepEqual(session.selectedWorldReferenceEntityKeys, ['actor_1', 'place_1'])
})

test('vibe director keeps empty worlds on premise intake', () => {
  const snapshot = {
    project: { id: 'project_1', name: 'Untitled', summary: '' },
    draft: { metadata: {} },
    worldEntities: [],
    outputRequests: [],
  } as any

  const session = createVibeDirectorSessionForSnapshot(snapshot, '2026-07-01T10:00:00.000Z')

  assert.equal(session.phase, 'premise_intake')
  assert.equal(session.mode, 'empty_world_seed')
})

test('vibe director recommends target choices for populated worlds', () => {
  const session = {
    ...createVibeDirectorSession('2026-07-01T10:00:00.000Z'),
    phase: 'world_target_selection' as const,
    mode: 'existing_sequence' as const,
  }

  const actions = buildVibeRecommendedActions({
    session,
    referenceCount: 4,
    sequenceCount: 2,
    hasComicOutput: true,
    hasCinematicOutput: false,
  })

  assert.deepEqual(
    actions.map((action) => action.actionKind),
    ['select_existing_sequence', 'start_new_world_scene', 'start_custom_cinematic', 'start_custom_comic'],
  )
})

test('vibe directing style prompt includes coverage camera and mood locks', () => {
  const session = {
    ...createVibeDirectorSession('2026-06-30T12:00:00.000Z'),
    directingStylePreset: 'noir_suspense' as const,
    directingStyleDescription: 'Make every scene feel watched.',
    coverageStyle: 'withholding coverage and foreground occlusion',
    cameraLanguage: 'low angles and long-lens compression',
    editingRhythm: 'slow tightening with sharp reveal cuts',
    performanceMode: 'guarded eyes and minimal gestures',
    moodEngine: 'paranoia and obscured intent',
    directingAvoidList: ['flat frontal coverage'],
  }

  const prompt = buildVibeDirectingStylePrompt(session)

  assert.match(prompt, /Noir suspense/)
  assert.match(prompt, /withholding coverage/)
  assert.match(prompt, /low angles/)
  assert.match(prompt, /flat frontal coverage/)
})

test('vibe director workflow brief carries locked style and directing state', () => {
  const session = {
    ...createVibeDirectorSession('2026-06-30T12:00:00.000Z'),
    artStyleDescription: 'Graphic neo-noir with wet asphalt reflections.',
    comicPanelStyle: 'Wide silent panels with hard blacks.',
    letteringStyle: 'Sparse white captions.',
    palette: ['black', 'cyan'],
    outputPath: 'both' as const,
    qualityGateMode: 'strict' as const,
    directingStylePreset: 'noir_suspense' as const,
    cameraLanguage: 'long-lens compression and obstructed frames',
    shotDirectingNotesByShotId: { shot_001: 'Hold the reveal until the last third of the frame.' },
    selectedComicReferenceArtifactKeys: ['comic_page_001'],
  }

  const brief = buildVibeDirectorWorkflowBrief(session)
  const prompt = formatVibeDirectorWorkflowBriefForPrompt(brief)

  assert.equal(brief.sourceSurface, 'vibe_director')
  assert.equal(brief.outputPath, 'both')
  assert.equal(brief.qualityGateMode, 'strict')
  assert.deepEqual(brief.selectedComicReferenceArtifactKeys, ['comic_page_001'])
  assert.equal(brief.shotDirectingNotesByShotId.shot_001, 'Hold the reveal until the last third of the frame.')
  assert.match(prompt, /Locked art style/)
  assert.match(prompt, /Shot-specific direction/)
})

test('vibe shot recommendations adapt to dialogue and action shot content', () => {
  const dialogue = buildVibeShotRecommendations({
    shot: {
      id: 'shot_001',
      purpose: 'dialogue',
      action: 'Mara whispers the truth and waits for Jun to react.',
    },
  })
  const action = buildVibeShotRecommendations({
    shot: {
      id: 'shot_002',
      purpose: 'action',
      action: 'Jun runs across the flooded hall as the bridge collapses.',
    },
  })

  assert.equal(dialogue[0]?.id, 'shot_001-dialogue-pressure')
  assert.equal(action[0]?.id, 'shot_002-action-geography')
})

test('vibe continuity inspector flags missing spatial refs without treating comic refs as canonical', () => {
  const inspector = buildVibeContinuityInspector({
    shot: {
      id: 'shot_003',
      visibleCharacterRefIds: ['mara'],
      keyframeStatusLabel: 'Keyframe not generated',
    },
    comicReferenceArtifactKeys: ['comic_page_1'],
  })

  assert.equal(inspector.readiness, 'blocked')
  assert.ok(inspector.warnings.some((warning) => warning.includes('set/zone/spot')))
  assert.deepEqual(inspector.previousVisualRefs, ['comic_page_1'])
  assert.deepEqual(inspector.characterRefs, ['mara'])
})
