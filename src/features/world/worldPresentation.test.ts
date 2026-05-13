import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorldGraphFilterState,
  buildWorldGraphGrowthPlaybackModel,
  buildWorldGraphLabelPolicy,
  buildWorldGraphPresentationPresetConfig,
  buildWorldNodeVisibilityReason,
  buildWorldPromptBuildSteps,
  buildWorldRefinementHistoryViewModel,
  buildWorldPromptSessionTokenMeter,
  buildWorldPromptRailViewModel,
  buildWorldFeedViewModel,
  buildWorldInspectorViewModel,
  buildWorldPromptTranscriptEntries,
  buildWorldPromptTurnLens,
  buildWorldPromptTurnLenses,
  describePromptOp,
  describePlannerFailureCategory,
  promptSuggestionImpactLabel,
  resolveWorldEdgeReveal,
  stripInternalPlannerDiagnostics,
  uniqueWorldPromptSuggestions,
} from './worldPresentation.ts'
import { promptToWorldOpSchema, worldPromptStartTurnResponseSchema } from '../../domain/worldPrompt.ts'
import type { PromptToWorldOp, WorldPromptEvent, WorldPromptGenerationJob, WorldPromptGenerationJobStep, WorldPromptMessage, WorldPromptSuggestion, WorldPromptTurn } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldGraphConnection, WorldOperator, WorldRelationship, WorldResult } from '../../domain/worldGraph.ts'

test('stripInternalPlannerDiagnostics removes planner validation tails', () => {
  const input = 'Working summary. Planner output validation failed. extra diagnostics follow'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Working summary.')
})

test('stripInternalPlannerDiagnostics removes fallback and schema-operation prefixes', () => {
  const input = 'Hosted prompt planning was unavailable. oneOf is not permitted in operations. Immediate JSON response invalid. Keep the world compact.'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Keep the world compact.')
})

test('stripInternalPlannerDiagnostics replaces stale compact progress wording', () => {
  assert.equal(
    stripInternalPlannerDiagnostics('Assembling the first wave of safe graph changes.'),
    'Preparing the graph change list.',
  )
})

test('buildWorldPromptSessionTokenMeter uses exact turn token usage when present', () => {
  const meter = buildWorldPromptSessionTokenMeter({
    turns: [
      makeTurn({
        model: 'gpt-5.4',
        metadata: {
          tokenUsage: {
            inputTokens: 12_000,
            outputTokens: 8_000,
          },
        },
      }),
    ],
    messages: [],
  })

  assert.equal(meter.estimated, false)
  assert.equal(meter.usedTokens, 20_000)
  assert.equal(meter.tokenLimit, 1_000_000)
  assert.equal(meter.label, '20k/1m')
})

test('buildWorldPromptSessionTokenMeter uses latest event token usage while a turn is still updating', () => {
  const meter = buildWorldPromptSessionTokenMeter({
    turns: [
      makeTurn({
        id: 't-token-events',
        model: 'gpt-5.4-mini',
        metadata: {
          tokenUsage: {
            totalTokens: 12_000,
          },
        },
      }),
    ],
    messages: [],
    events: [
      makeEvent({
        id: 'e-token-1',
        turnId: 't-token-events',
        payload: {
          tokenUsage: {
            inputTokens: 20_000,
            outputTokens: 4_000,
          },
          suggestions: [],
          diagnostics: [],
        },
      }),
      makeEvent({
        id: 'e-token-2',
        turnId: 't-token-events',
        payload: {
          tokenUsage: {
            totalTokens: 31_000,
          },
          suggestions: [],
          diagnostics: [],
        },
      }),
    ],
  })

  assert.equal(meter.estimated, false)
  assert.equal(meter.usedTokens, 31_000)
  assert.equal(meter.label, '31k/400k')
})

test('buildWorldPromptSessionTokenMeter uses durable generation step token usage after initial seed jobs', () => {
  const turn = makeTurn({
    id: 't-seed-token-job',
    model: 'gpt-5.4-mini',
    metadata: {},
  })
  const meter = buildWorldPromptSessionTokenMeter({
    turns: [turn],
    messages: [],
    generationJobs: [
      makeGenerationJob({
        turnId: turn.id,
        tokenUsage: { totalTokens: 1_000 },
      }),
    ],
    generationJobSteps: [
      makeGenerationJobStep({
        id: 'step-core',
        turnId: turn.id,
        tokenUsage: { inputTokens: 44_000, outputTokens: 6_000 },
      }),
      makeGenerationJobStep({
        id: 'step-sequence',
        turnId: turn.id,
        tokenUsage: { totalTokens: 45_000 },
      }),
    ],
  })

  assert.equal(meter.estimated, false)
  assert.equal(meter.usedTokens, 95_000)
  assert.equal(meter.label, '95k/400k')
})

test('buildWorldPromptSessionTokenMeter resolves GPT-5.4 mini context window separately from flagship', () => {
  const meter = buildWorldPromptSessionTokenMeter({
    turns: [makeTurn({ model: 'gpt-5.4-mini' })],
    messages: [],
  })

  assert.equal(meter.tokenLimit, 400_000)
  assert.match(meter.label, /^~\d+\/400k$/)
})

test('buildWorldPromptSessionTokenMeter estimates session context when usage metadata is absent', () => {
  const meter = buildWorldPromptSessionTokenMeter({
    turns: [
      makeTurn({
        model: 'gpt-4o',
        prompt: 'Create a world about a memory empire.',
        assistantSummary: 'Created the initial factions and locations.',
        metadata: {
          answer: 'The memory empire now has a ruler, rebels, and a forbidden archive.',
          sourceContext: {
            kind: 'prompt',
            title: 'Prompt',
            fileName: null,
            mimeType: null,
            url: null,
            extractedText: 'A short source passage about memory magic and shadow rule.',
            charCount: 58,
            truncated: false,
          },
        },
      }),
    ],
    messages: [{
      id: 'm-token-1',
      sessionId: 's1',
      turnId: 't1',
      draftId: 'd1',
      role: 'user',
      content: 'Expand the forbidden archive and connect it to the rebel leader.',
      metadata: {},
      createdAt: '2026-04-22T10:00:00.000Z',
    }],
  })

  assert.equal(meter.estimated, true)
  assert.equal(meter.tokenLimit, 128_000)
  assert.ok(meter.usedTokens > 0)
  assert.match(meter.label, /^~\d+\/128k$/)
})

test('promptSuggestionImpactLabel joins impact parts', () => {
  const suggestion = {
    id: 's1',
    label: 'Expand',
    prompt: 'Expand',
    kind: 'continue_scope',
    style: 'primary',
    source: 'wave2',
    threadKey: null,
    summary: '',
    estimatedNodeCount: 2,
    estimatedEdgeCount: 3,
    willQueueImages: true,
    willQueueCinematics: false,
  } satisfies WorldPromptSuggestion

  assert.equal(promptSuggestionImpactLabel(suggestion), '+2 nodes · +3 links · images')
})

test('describePlannerFailureCategory returns readable labels', () => {
  assert.equal(describePlannerFailureCategory('schema_validation_failed'), 'planner schema mismatch')
})

test('describePromptOp prefers resolved display names over placeholder labels', () => {
  const op = {
    id: 'op-1',
    op: 'upsert_entity',
    confidence: 0.9,
    applyMode: 'auto',
    dependencyOpIds: [],
    rationale: '',
    status: 'pending',
    metadata: {
      displayName: 'Caelan Voss',
    },
    payload: {
      targetEntityKey: null,
      entity: {
        name: 'Unnamed Man of the Rival Faction',
        summary: '',
        context: '',
        nodeType: 'actor',
        aliases: [],
        tags: [],
        status: 'active',
        thumbnailAssetKey: null,
        linkedDefinitionKey: null,
        source: 'ai',
        customProperties: {},
        metadata: {},
        ensureLinkedDefinition: true,
      },
    },
  } satisfies PromptToWorldOp

  assert.equal(describePromptOp(op), 'Add or extend Caelan Voss')
})

test('buildWorldPromptTranscriptEntries folds applied events into readable rows', () => {
  const entity = {
    id: '1',
    key: 'world.actor.hero',
    name: 'Hero',
    summary: 'Main character.',
    context: '',
    nodeType: 'actor',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties: {},
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
  } satisfies WorldEntity

  const messages: WorldPromptMessage[] = [{
    id: 'm1',
    sessionId: 's1',
    turnId: 't1',
    draftId: 'd1',
    role: 'user',
    content: 'Add a hero.',
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
  }]

  const events: WorldPromptEvent[] = [{
    id: 'e1',
    sessionId: 's1',
    turnId: 't1',
    draftId: 'd1',
    sequence: 1,
    eventType: 'op_applied',
    opId: null,
    payload: {
      applied: {
        worldEntities: [entity],
        worldRelationships: [],
        worldOperators: [],
        worldResults: [],
        worldGraphConnections: [],
        worldViews: [],
      },
      suggestions: [],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:01:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages,
    entityByKey: new Map([[entity.key, entity]]),
  })

  assert.equal(entries.length, 3)
  assert.equal(entries[1]?.kind, 'turn_lens')
  const lensEntry = entries[1]
  if (lensEntry?.kind !== 'turn_lens') {
    assert.fail('expected turn_lens entry')
  }
  assert.equal(lensEntry.turnLens.turnId, 't1')
  assert.deepEqual(lensEntry.turnLens.entityKeys, [entity.key])
  assert.deepEqual(lensEntry.turnLens.counts, {
    entities: 1,
    relationships: 0,
    derived: 0,
    total: 1,
  })
  assert.equal(entries.filter((entry) => entry.kind === 'turn_lens').length, 1)
  const appliedEntry = entries[2]
  assert.equal(appliedEntry?.kind, 'entity_created')
  if (appliedEntry?.kind !== 'entity_created') {
    assert.fail('expected entity_created entry')
  }
  assert.equal(appliedEntry.entityNodeType, 'actor')
})

test('buildWorldPromptTurnLenses derives an entity-only turn lens', () => {
  const entity = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const turn = makeTurn({ id: 'turn-entity', prompt: 'Add a hero.' })
  const event = makeEvent({
    id: 'event-entity',
    turnId: turn.id,
    eventType: 'op_applied',
    payload: {
      applied: {
        worldEntities: [entity],
        worldRelationships: [],
        worldOperators: [],
        worldResults: [],
        worldGraphConnections: [],
        worldViews: [],
      },
      suggestions: [],
      diagnostics: [],
    },
  })

  const lens = buildWorldPromptTurnLens({ turnId: turn.id, events: [event], turns: [turn] })

  assert.ok(lens)
  assert.equal(lens.prompt, 'Add a hero.')
  assert.equal(lens.rootEntityKey, entity.key)
  assert.deepEqual(lens.entityKeys, [entity.key])
  assert.deepEqual(lens.relationshipKeys, [])
  assert.deepEqual(lens.entityChangeKinds, { [entity.key]: 'added' })
  assert.equal(lens.changeCount, 1)
  assert.deepEqual(lens.counts, {
    entities: 1,
    relationships: 0,
    derived: 0,
    total: 1,
  })
})

test('buildWorldPromptTurnLenses includes every supported world entity node type', () => {
  const nodeTypes = ['actor', 'group', 'place', 'object', 'concept', 'event', 'sequence_unit'] satisfies WorldEntity['nodeType'][]
  const entities = nodeTypes.map((nodeType) => (
    createWorldPresentationTestEntity(`world.${nodeType}.sample`, `Sample ${nodeType}`, nodeType)
  ))
  const turn = makeTurn({ id: 'turn-all-types', prompt: 'Add a mixed world slice.' })
  const event = makeEvent({
    id: 'event-all-types',
    turnId: turn.id,
    eventType: 'op_applied',
    payload: {
      applied: {
        worldEntities: entities,
        worldRelationships: [],
        worldOperators: [],
        worldResults: [],
        worldGraphConnections: [],
        worldViews: [],
      },
      suggestions: [],
      diagnostics: [],
    },
  })

  const lens = buildWorldPromptTurnLens({ turnId: turn.id, events: [event], turns: [turn] })

  assert.ok(lens)
  assert.deepEqual(lens.entityKeys, entities.map((entity) => entity.key))
  assert.equal(lens.rootEntityKey, entities[0]?.key)
  assert.deepEqual(lens.counts, {
    entities: nodeTypes.length,
    relationships: 0,
    derived: 0,
    total: nodeTypes.length,
  })
})

test('buildWorldPromptTurnLenses derives relationship and derived-result lens keys', () => {
  const hero = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const keep = createWorldPresentationTestEntity('world.place.keep', 'Keep', 'place')
  const relationship: WorldRelationship = {
    id: 'rel-1',
    key: 'rel-1',
    sourceEntityKey: hero.key,
    targetEntityKey: keep.key,
    verb: 'defends',
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'ai',
    notes: '',
    state: 'confirmed',
    metadata: {},
  }
  const operator: WorldOperator = {
    id: 'op-1',
    key: 'op-1',
    operatorType: 'stage_scene',
    inputEntityKeys: [hero.key, keep.key],
    label: 'Stage defense',
    status: 'active',
    metadata: {},
  }
  const result: WorldResult = {
    id: 'result-1',
    key: 'result-1',
    resultType: 'scene_setup',
    sourceOperatorKey: operator.key,
    title: 'Keep Defense',
    summary: '',
    previewAssetKey: null,
    status: 'ready',
    metadata: {},
  }
  const connections: WorldGraphConnection[] = [
    {
      id: 'conn-1',
      key: 'conn-1',
      sourceNodeKey: hero.key,
      sourceNodeKind: 'entity',
      targetNodeKey: operator.key,
      targetNodeKind: 'operator',
      role: 'input',
      metadata: {},
    },
    {
      id: 'conn-2',
      key: 'conn-2',
      sourceNodeKey: operator.key,
      sourceNodeKind: 'operator',
      targetNodeKey: result.key,
      targetNodeKind: 'result',
      role: 'output',
      metadata: {},
    },
  ]
  const turn = makeTurn({ id: 'turn-mixed', prompt: 'Stage the keep defense.' })
  const event = makeEvent({
    id: 'event-mixed',
    turnId: turn.id,
    eventType: 'op_applied',
    payload: {
      applied: {
        worldEntities: [hero, keep],
        worldRelationships: [relationship],
        worldOperators: [operator],
        worldResults: [result],
        worldGraphConnections: connections,
        worldViews: [],
      },
      suggestions: [],
      diagnostics: [],
    },
  })

  const lenses = buildWorldPromptTurnLenses({ events: [event], turns: [turn] })
  const lens = lenses.get(turn.id)

  assert.ok(lens)
  assert.deepEqual(lens.entityKeys, [hero.key, keep.key])
  assert.deepEqual(lens.relationshipKeys, [relationship.key])
  assert.deepEqual(lens.entityChangeKinds, { [hero.key]: 'added', [keep.key]: 'added' })
  assert.deepEqual(lens.relationshipChangeKinds, { [relationship.key]: 'added' })
  assert.deepEqual(lens.operatorKeys, [operator.key])
  assert.deepEqual(lens.resultKeys, [result.key])
  assert.deepEqual(lens.nodeKeys, [hero.key, keep.key, operator.key, result.key])
  assert.equal(lens.rootEntityKey, hero.key)
  assert.deepEqual(lens.counts, {
    entities: 2,
    relationships: 1,
    derived: 2,
    total: 5,
  })
})

test('buildWorldGraphPresentationPresetConfig applies depth defaults and manual override', () => {
  assert.equal(buildWorldGraphPresentationPresetConfig({ preset: 'focus' }).depthMode, 'tight')
  assert.equal(buildWorldGraphPresentationPresetConfig({ preset: 'wide' }).depthMode, 'wide')
  assert.equal(buildWorldGraphPresentationPresetConfig({ preset: 'wide', manualDepthMode: 'nearby' }).depthMode, 'nearby')
  const storyConfig = buildWorldGraphPresentationPresetConfig({ preset: 'explore', mode: 'story' })
  assert.equal(storyConfig.preset, 'story')
  assert.equal(storyConfig.emphasizeThreads, true)
})

test('buildWorldGraphLabelPolicy fades labels by zoom and importance', () => {
  assert.equal(buildWorldGraphLabelPolicy({
    zoom: 0.35,
    showLabels: false,
    preset: 'focus',
    visualMode: 'farIcon',
    displayTier: 'far',
  }).showNodeLabel, false)

  assert.equal(buildWorldGraphLabelPolicy({
    zoom: 0.35,
    showLabels: false,
    preset: 'focus',
    visualMode: 'farIcon',
    displayTier: 'far',
    highlighted: true,
  }).showNodeLabel, true)

  assert.equal(buildWorldGraphLabelPolicy({
    zoom: 0.62,
    showLabels: false,
    preset: 'explore',
    visualMode: 'nearIcon',
    displayTier: 'near',
  }).showNodeLabel, true)

  assert.equal(buildWorldGraphLabelPolicy({
    zoom: 0.5,
    showLabels: true,
    preset: 'wide',
    visualMode: 'farIcon',
    displayTier: 'far',
    hasBranchLabel: true,
  }).showBranchLabel, true)
})

test('buildWorldGraphFilterState maps display toggles to entity types and derived visibility', () => {
  const state = buildWorldGraphFilterState({
    characters: false,
    derived: false,
    recent: false,
  })

  assert.equal(state.enabledEntityTypes.includes('actor'), false)
  assert.equal(state.enabledEntityTypes.includes('place'), true)
  assert.equal(state.showDerived, false)
  assert.equal(state.showRecent, false)
  assert.equal(state.disabledCount, 3)
})

test('buildWorldGraphGrowthPlaybackModel orders whole-turn lens steps', () => {
  const earlyLens = {
    turnId: 'turn-1',
    createdAt: '2026-04-22T10:00:00.000Z',
    label: '2 nodes',
    prompt: 'Add two nodes',
    entityKeys: ['a', 'b'],
    relationshipKeys: [],
    operatorKeys: [],
    resultKeys: [],
    nodeKeys: ['a', 'b'],
    rootEntityKey: 'a',
    changeCount: 2,
    entityChangeKinds: { a: 'added', b: 'added' } as const,
    relationshipChangeKinds: {} as const,
    counts: { entities: 2, relationships: 0, derived: 0, total: 2 },
  }
  const laterLens = {
    ...earlyLens,
    turnId: 'turn-2',
    createdAt: '2026-04-22T10:05:00.000Z',
    label: '1 link',
    prompt: 'Link them',
    entityKeys: ['a', 'b'],
    relationshipKeys: ['r1'],
    nodeKeys: ['a', 'b'],
    changeCount: 3,
    entityChangeKinds: { a: 'touched', b: 'touched' } as const,
    relationshipChangeKinds: { r1: 'added' } as const,
    counts: { entities: 2, relationships: 1, derived: 0, total: 3 },
  }

  const model = buildWorldGraphGrowthPlaybackModel({
    turnLenses: [laterLens, earlyLens],
    activeTurnId: 'turn-1',
  })

  assert.deepEqual(model.steps.map((step) => step.turnId), ['turn-1', 'turn-2'])
  assert.equal(model.activeIndex, 0)
  assert.equal(model.canGoNext, true)
  assert.deepEqual(model.activeStep?.fitNodeKeys, ['a', 'b'])
})

test('buildWorldNodeVisibilityReason prioritizes focus and lens explanations', () => {
  assert.equal(buildWorldNodeVisibilityReason({
    nodeKind: 'entity',
    displayTier: 'focus',
    isFocusRoot: true,
    isTurnLensChanged: true,
  }).kind, 'focus_root')

  assert.equal(buildWorldNodeVisibilityReason({
    nodeKind: 'entity',
    displayTier: 'near',
    distance: 1,
    isTurnLensChanged: true,
  }).kind, 'turn_lens_changed')

  assert.equal(buildWorldNodeVisibilityReason({
    nodeKind: 'entity',
    displayTier: 'peripheral',
    distance: 3,
    branchLabel: 'The Keep',
  }).label, 'Branch via The Keep')
})

test('resolveWorldEdgeReveal keeps sparse lens, selection, story, and hover rules', () => {
  assert.deepEqual(resolveWorldEdgeReveal({
    edgeKey: 'rel-1',
    sourceKey: 'a',
    targetKey: 'b',
    activeLensEdgeKeys: ['rel-1'],
  }), { visible: true, reason: 'lens', emphasized: true })

  assert.deepEqual(resolveWorldEdgeReveal({
    sourceKey: 'a',
    targetKey: 'b',
    selectedNodeKey: 'a',
  }), { visible: true, reason: 'selected', emphasized: false })

  assert.equal(resolveWorldEdgeReveal({
    sourceKey: 'a',
    targetKey: 'b',
    activeEdgeFocusNodeKey: 'a',
    hoveredNodeKey: 'b',
  }).reason, 'focus_hover')

  assert.equal(resolveWorldEdgeReveal({
    sourceKey: 'a',
    targetKey: 'b',
    activeEdgeFocusNodeKey: 'a',
    hoveredNodeKey: 'c',
  }).visible, false)

  assert.deepEqual(resolveWorldEdgeReveal({
    sourceKey: 'a',
    targetKey: 'b',
    storyNodeKeys: ['a', 'b'],
    mode: 'story',
  }), { visible: true, reason: 'story', emphasized: true })

  assert.equal(resolveWorldEdgeReveal({
    sourceKey: 'a',
    targetKey: 'b',
  }).visible, false)
})

test('buildWorldPromptTurnLens ignores advisory or no-change turns', () => {
  const turn = makeTurn({ id: 'turn-advisory', prompt: 'What should happen next?' })
  const event = makeEvent({
    id: 'event-note',
    turnId: turn.id,
    eventType: 'assistant_note',
    payload: {
      note: 'A quiet answer.',
      suggestions: [],
      diagnostics: [],
    },
  })

  assert.equal(buildWorldPromptTurnLens({ turnId: turn.id, events: [event], turns: [turn] }), null)
})

test('buildWorldPromptTranscriptEntries renders entity replacement rows', () => {
  const oldEntity = {
    id: 'old-1',
    key: 'world.group.zulkin',
    name: 'Zulkin',
    summary: 'A faction node created by mistake.',
    context: '',
    nodeType: 'group',
    aliases: [],
    tags: [],
    status: 'archived',
    thumbnailAssetKey: null,
    linkedDefinitionKey: 'group.zulkin',
    source: 'ai',
    customProperties: {},
    metadata: {
      replacement: {
        replacedByEntityKey: 'world.actor.zulkin',
      },
    },
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity

  const replacementEntity = {
    id: 'new-1',
    key: 'world.actor.zulkin',
    name: 'Zulkin',
    summary: 'Rival claimant.',
    context: 'A rival claimant with a hidden lineage.',
    nodeType: 'actor',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: 'character.zulkin',
    source: 'ai',
    customProperties: {},
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity

  const events: WorldPromptEvent[] = [{
    id: 'e-replace',
    sessionId: 's1',
    turnId: 't-replace',
    draftId: 'd1',
    sequence: 1,
    eventType: 'op_applied',
    opId: 'op-replace',
    payload: {
      op: {
        id: 'op-replace',
        op: 'replace_entity',
        confidence: 0.92,
        applyMode: 'needs_approval',
        dependencyOpIds: [],
        rationale: 'Correct the mistaken group node.',
        status: 'applied',
        metadata: {},
        payload: {
          targetEntityKey: oldEntity.key,
          replacementMode: 'create',
          replacementEntity: {
            key: replacementEntity.key,
            name: replacementEntity.name,
            summary: replacementEntity.summary,
            context: replacementEntity.context,
            nodeType: replacementEntity.nodeType,
            aliases: [],
            tags: [],
            status: 'active',
            thumbnailAssetKey: null,
            linkedDefinitionKey: replacementEntity.linkedDefinitionKey,
            source: 'ai',
            customProperties: {},
            metadata: {},
          },
          replacementEntityKey: replacementEntity.key,
          transferRelationships: true,
          transferGraphConnections: true,
          transferDerivedResults: true,
          archiveOldEntity: true,
          deleteOldEntity: false,
          reason: 'Zulkin should be a person, not a faction.',
        },
      },
      applied: {
        worldEntities: [oldEntity, replacementEntity],
        worldRelationships: [],
        worldOperators: [],
        worldResults: [],
        worldGraphConnections: [],
        worldViews: [],
      },
      suggestions: [],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:02:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map<string, WorldEntity>([
      [oldEntity.key, oldEntity],
      [replacementEntity.key, replacementEntity],
    ]),
  })

  assert.ok(entries.some((entry) => entry.kind === 'entity_replaced' && entry.label === 'Replaced world.group.zulkin with Zulkin'))
  assert.equal(entries.filter((entry) => entry.kind === 'entity_created' && entry.entityKey === oldEntity.key).length, 0)
  assert.equal(entries.filter((entry) => entry.kind === 'entity_created' && entry.entityKey === replacementEntity.key).length, 1)
})

test('buildWorldPromptTranscriptEntries drops preview and approval rows from the transcript', () => {
  const pendingOp: PromptToWorldOp = {
    id: 'op1',
    op: 'update_entity',
    confidence: 0.9,
    applyMode: 'needs_approval',
    dependencyOpIds: [],
    rationale: 'Touches canon facts.',
    status: 'pending',
    metadata: {},
    payload: {
      targetEntityKey: 'world.actor.hero',
      changes: {
        summary: 'Raised by the order.',
      },
    },
  }

  const events: WorldPromptEvent[] = [{
    id: 'e2',
    sessionId: 's1',
    turnId: 't2',
    draftId: 'd2',
    sequence: 1,
    eventType: 'planner_status',
    opId: null,
    payload: {
      plannerStatus: 'awaiting_approval',
      preview: {
        mode: 'staged_first_wave',
        requestSummary: 'Add a secret order around the hero.',
        scopeDecision: {
          mode: 'staged',
          counts: {
            actionableOps: 1,
            entityOps: 0,
            relationshipOps: 0,
            existingEntityModificationOps: 1,
            queueOps: 0,
            derivedResultOps: 0,
          },
          starterPackApplied: false,
        },
        items: [],
        suggestions: [],
        canApplyFirstWave: false,
        pendingOps: [pendingOp],
        appliedAt: null,
      },
      suggestions: [],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:02:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map(),
  })

  assert.equal(entries.some((entry) => entry.kind === 'preview_available' && entry.turnId === 't2'), false)
  assert.equal(entries.some((entry) => entry.kind === 'approval_required' && entry.turnId === 't2'), false)
})

test('buildWorldPromptTranscriptEntries emits planner progress rows from planner_status events', () => {
  const events: WorldPromptEvent[] = [
    {
      id: 'e-progress-1',
      sessionId: 's1',
      turnId: 't-progress',
      draftId: 'd1',
      sequence: 1,
      eventType: 'planner_status',
      opId: null,
      payload: {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'reading_context',
          message: 'Reading the current world context.',
          sequence: 1,
        },
      },
      metadata: {},
      createdAt: '2026-04-22T10:00:00.000Z',
    },
    {
      id: 'e-progress-2',
      sessionId: 's1',
      turnId: 't-progress',
      draftId: 'd1',
      sequence: 2,
      eventType: 'planner_status',
      opId: null,
      payload: {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'finalizing_plan',
          message: 'Validated the plan and prepared 2 first-wave steps.',
          sequence: 6,
          done: true,
        },
        plannerOutline: ['Add Jax', 'Add arena district'],
      },
      metadata: {},
      createdAt: '2026-04-22T10:00:04.000Z',
    },
  ]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map(),
  })

  const plannerEntries = entries.filter((entry) => entry.kind === 'planner_progress')
  assert.equal(plannerEntries.length, 2)
  assert.equal(plannerEntries[0]?.label, 'Reading context')
  assert.deepEqual(plannerEntries[1]?.outline, ['Add Jax', 'Add arena district'])
  assert.equal(plannerEntries[1]?.done, true)
})

test('buildWorldPromptTranscriptEntries renders incremental work item rows', () => {
  const events: WorldPromptEvent[] = [
    {
      id: 'e-work-start',
      sessionId: 's1',
      turnId: 't-work',
      draftId: 'd1',
      sequence: 1,
      eventType: 'work_item_started',
      opId: null,
      payload: {
        plannerStatus: 'planning',
        workItem: {
          id: 'core_cast',
          kind: 'entity_batch',
          label: 'Core cast',
          objective: 'Create the main characters.',
          expectedOps: 4,
          critical: true,
        },
        plannerProgress: {
          phase: 'generating_entity',
          message: 'Core cast: Create the main characters.',
          sequence: 1,
          workItemId: 'core_cast',
          workItemKind: 'entity_batch',
        },
      },
      metadata: {},
      createdAt: '2026-04-22T10:00:00.000Z',
    },
    {
      id: 'e-work-done',
      sessionId: 's1',
      turnId: 't-work',
      draftId: 'd1',
      sequence: 2,
      eventType: 'work_item_completed',
      opId: null,
      payload: {
        plannerStatus: 'planning',
        workItem: {
          id: 'core_cast',
          kind: 'entity_batch',
          label: 'Core cast',
          objective: 'Create the main characters.',
          expectedOps: 4,
          critical: true,
        },
        note: 'Core cast complete.',
        plannerProgress: {
          phase: 'generating_entity',
          message: 'Core cast complete.',
          sequence: 1,
          done: true,
          workItemId: 'core_cast',
          workItemKind: 'entity_batch',
        },
      },
      metadata: {},
      createdAt: '2026-04-22T10:00:01.000Z',
    },
  ]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map(),
  })

  const plannerEntries = entries.filter((entry) => entry.kind === 'planner_progress')
  assert.equal(plannerEntries.length, 2)
  assert.equal(plannerEntries[0]?.label, 'Building Core cast')
  assert.equal(plannerEntries[1]?.label, 'Core cast complete')
  assert.equal(plannerEntries[1]?.done, true)
})

test('buildWorldPromptBuildSteps maps incremental work items to step rows', () => {
  const events: WorldPromptEvent[] = [
    makeEvent({
      id: 'e-plan',
      turnId: 't-build',
      sequence: 1,
      eventType: 'planner_status',
      payload: {
        plannerStatus: 'planning',
        plannerProgress: {
          phase: 'planning_manifest',
          message: 'Planned 4 build steps.',
          sequence: 1,
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:00:00.000Z',
    }),
    makeEvent({
      id: 'e-start',
      turnId: 't-build',
      sequence: 2,
      eventType: 'work_item_started',
      payload: {
        plannerStatus: 'planning',
        workItem: {
          id: 'locations',
          kind: 'entity_batch',
          label: 'Main locations',
          objective: 'Create the key places.',
          expectedOps: 3,
          critical: true,
        },
        workItemIndex: 2,
        workItemTotal: 4,
        plannerProgress: {
          phase: 'generating_entity',
          message: 'Main locations: Create the key places.',
          sequence: 2,
          workItemId: 'locations',
          workItemKind: 'entity_batch',
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:00:01.000Z',
    }),
    makeEvent({
      id: 'e-done',
      turnId: 't-build',
      sequence: 3,
      eventType: 'work_item_completed',
      payload: {
        plannerStatus: 'planning',
        workItem: {
          id: 'locations',
          kind: 'entity_batch',
          label: 'Main locations',
          objective: 'Create the key places.',
          expectedOps: 3,
          critical: true,
        },
        workItemIndex: 2,
        workItemTotal: 4,
        note: 'Main locations complete.',
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:00:02.000Z',
    }),
  ]

  const steps = buildWorldPromptBuildSteps({ events, turnId: 't-build' })

  assert.equal(steps.length, 2)
  assert.equal(steps[0]?.title, 'Planning build')
  assert.equal(steps[0]?.status, 'done')
  assert.equal(steps[1]?.title, 'Main locations complete')
  assert.equal(steps[1]?.detail, 'Main locations complete.')
  assert.equal(steps[1]?.status, 'done')
  assert.equal(steps[1]?.index, 2)
  assert.equal(steps[1]?.total, 4)
})

test('buildWorldPromptTranscriptEntries renders update rows for refined entities and relationships', () => {
  const hero = {
    id: 'hero-1',
    key: 'world.actor.hero',
    name: 'Hero',
    summary: 'A young claimant.',
    context: 'Raised in secret by loyalists.',
    nodeType: 'actor',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties: {},
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:05:00.000Z',
  } satisfies WorldEntity

  const entries = buildWorldPromptTranscriptEntries({
    messages: [],
    entityByKey: new Map([[hero.key, hero]]),
    events: [{
      id: 'e-update',
      sessionId: 's1',
      turnId: 't-update',
      draftId: 'd1',
      sequence: 1,
      eventType: 'op_applied',
      opId: 'op-update',
      payload: {
        op: {
          id: 'op-update',
          op: 'update_entity',
          confidence: 0.92,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Add clarifying context.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: hero.key,
            changes: {
              summary: 'Heir to the broken throne.',
              context: 'Raised in secret by loyalists and haunted by the throne prophecy.',
            },
          },
        },
        applied: {
          worldEntities: [hero],
          worldRelationships: [{
            id: 'rel-1',
            key: 'world.rel.hero-allied-order',
            sourceEntityKey: hero.key,
            targetEntityKey: 'world.group.order',
            verb: 'allied_with',
            direction: 'outbound',
            strength: 0.8,
            confidence: 0.95,
            source: 'ai',
            notes: 'The order protects the heir in secret.',
            state: 'confirmed',
            metadata: {},
            createdAt: '2026-04-22T10:05:00.000Z',
            updatedAt: '2026-04-22T10:05:00.000Z',
          }],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      metadata: {},
      createdAt: '2026-04-22T10:05:00.000Z',
    }, {
      id: 'e-relationship-update',
      sessionId: 's1',
      turnId: 't-update',
      draftId: 'd1',
      sequence: 2,
      eventType: 'op_applied',
      opId: 'op-relationship-update',
      payload: {
        op: {
          id: 'op-relationship-update',
          op: 'update_relationship',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Clarify the bond.',
          status: 'applied',
          metadata: {},
          payload: {
            targetRelationshipKey: 'world.rel.hero-allied-order',
            changes: {
              notes: 'The order protects the heir in secret.',
            },
          },
        },
        applied: {
          worldEntities: [],
          worldRelationships: [{
            id: 'rel-1',
            key: 'world.rel.hero-allied-order',
            sourceEntityKey: hero.key,
            targetEntityKey: 'world.group.order',
            verb: 'allied_with',
            direction: 'outbound',
            strength: 0.8,
            confidence: 0.95,
            source: 'ai',
            notes: 'The order protects the heir in secret.',
            state: 'confirmed',
            metadata: {},
            createdAt: '2026-04-22T10:05:00.000Z',
            updatedAt: '2026-04-22T10:06:00.000Z',
          }],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      metadata: {},
      createdAt: '2026-04-22T10:06:00.000Z',
    }],
  })

  assert.ok(entries.some((entry) => entry.kind === 'entity_updated' && entry.label === 'Updated Hero' && !entry.detail))
  assert.ok(entries.some((entry) => entry.kind === 'relationship_updated' && entry.label === 'Updated link between Hero and world.group.order' && !entry.detail))
})

test('buildWorldFeedViewModel derives compact turn rows plus added and changed entity child rows', () => {
  const hero = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const order = createWorldPresentationTestEntity('world.group.order', 'Order', 'group')
  const relationship: WorldRelationship = {
    id: 'rel-1',
    key: 'world.rel.hero-order',
    sourceEntityKey: hero.key,
    targetEntityKey: order.key,
    verb: 'protected_by',
    direction: 'outbound',
    strength: 0.8,
    confidence: 0.95,
    source: 'ai',
    notes: 'The order shields the heir in secret.',
    state: 'confirmed',
    metadata: {},
    createdAt: '2026-04-22T10:01:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  }
  const turn = makeTurn({ id: 't-feed', prompt: 'Add a protected hero.' })
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [{
      id: 'm-feed',
      sessionId: 's1',
      turnId: turn.id,
      draftId: 'd1',
      role: 'user',
      content: turn.prompt,
      metadata: {},
      createdAt: '2026-04-22T10:00:00.000Z',
    }],
    events: [makeEvent({
      id: 'e-feed',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        applied: {
          worldEntities: [hero],
          worldRelationships: [relationship],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        audit: {
          touchedEntityKeys: [order.key],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    }), makeEvent({
      id: 'e-feed-update',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-update-order',
          op: 'upsert_entity',
          payload: {
            targetEntityKey: order.key,
            name: order.name,
            nodeType: order.nodeType,
            summary: 'The order now protects the heir from the palace wing.',
          },
        },
        applied: {
          worldEntities: [order],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:30.000Z',
    })],
    entityByKey: new Map([[hero.key, hero], [order.key, order]]),
    relationships: [relationship],
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const turnEntry = feed.entries.find((entry) => entry.kind === 'turn_update')
  assert.equal(turnEntry?.filter, 'additions')
  assert.deepEqual(turnEntry?.relatedFilters, ['additions', 'changes', 'relationships'])
  assert.equal(turnEntry?.badge, 'Prompt')
  assert.equal(turnEntry?.promptExcerpt, 'Add a protected hero.')
  assert.equal(turnEntry?.audit?.prompt, 'Add a protected hero.')
  assert.deepEqual(turnEntry?.changeCounts, {
    addedEntities: 1,
    updatedEntities: 1,
    relationships: 1,
    wiki: 0,
    media: 0,
    suggestions: 0,
    total: 3,
  })
  assert.deepEqual(turnEntry?.thumbnailEntityKeys, [hero.key])
  assert.deepEqual(turnEntry?.audit?.relationshipKeys, [relationship.key])

  const entityEntry = feed.entries.find((entry) => entry.kind === 'entity_created' && entry.parentTurnId === turn.id)
  assert.equal(entityEntry?.filter, 'additions')
  assert.equal(entityEntry?.entityKey, hero.key)
  assert.equal(entityEntry?.title, 'Hero')

  const changedEntityEntry = feed.entries.find((entry) => entry.kind === 'entity_updated' && entry.parentTurnId === turn.id)
  assert.equal(changedEntityEntry?.filter, 'changes')
  assert.equal(changedEntityEntry?.entityKey, order.key)
  assert.equal(changedEntityEntry?.title, 'Order')

  const relationshipEntry = feed.entries.find((entry) => entry.kind === 'relationship_updated' && entry.parentTurnId === turn.id)
  assert.equal(relationshipEntry?.filter, 'relationships')
  assert.equal(relationshipEntry?.relationshipKey, relationship.key)

  const turnIndex = feed.entries.findIndex((entry) => entry.id === `turn:${turn.id}`)
  const addedIndex = feed.entries.findIndex((entry) => entry.id === `turn:${turn.id}:entity:${hero.key}`)
  const updatedIndex = feed.entries.findIndex((entry) => entry.id === `turn:${turn.id}:entity-updated:${order.key}`)
  const relationshipIndex = feed.entries.findIndex((entry) => entry.id === `turn:${turn.id}:relationships`)
  assert.ok(turnIndex < addedIndex)
  assert.ok(addedIndex < updatedIndex)
  assert.ok(updatedIndex < relationshipIndex)
  assert.equal(feed.entries.some((entry) => entry.kind === 'relationship_created'), false)
  assert.equal(feed.countsByFilter.additions, 2)
  assert.equal(feed.countsByFilter.changes, 2)
  assert.equal(feed.countsByFilter.relationships, 2)
  assert.equal(feed.groups[0]?.label, 'Just now')
})

test('buildWorldFeedViewModel keeps long turn summaries compact while preserving full detail', () => {
  const longResponse = [
    'Expanded Anya’s first address scene into a screenplay-style canon pass with crowd beats and Ilya’s silent reactions.',
    'The scene now tracks the pressure of public accountability, the risk of revenge, and the exact emotional handoff from survival to civic leadership.',
    'Additional connective tissue clarifies why the crowd listens and what Anya refuses to become.',
  ].join(' ')
  const turn = makeTurn({ id: 't-long-ai', prompt: 'Expand Anya address.', assistantSummary: longResponse })
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [],
    entityByKey: new Map(),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const turnEntry = feed.entries.find((entry) => entry.kind === 'turn_update')
  assert.match(turnEntry?.fullDetail ?? '', /^Expanded Anya/)
  assert.ok((turnEntry?.compactDetail?.length ?? 0) <= 148)
  assert.match(turnEntry?.compactDetail ?? '', /\.\.\.$/)
  assert.equal(turnEntry?.promptExcerpt, 'Expand Anya address.')
})

test('buildWorldFeedViewModel renders every turn suggestion as a collapsible child row', () => {
  const turn = makeTurn({ id: 't-suggestions', prompt: 'Suggest next story moves.' })
  const suggestions = Array.from({ length: 5 }, (_, index) => ({
    id: `suggestion-${index + 1}`,
    label: `Suggestion ${index + 1}`,
    prompt: `Add a canon beat number ${index + 1}.`,
    kind: 'continue_scope',
    style: 'primary',
    source: 'wave2',
    threadKey: null,
    summary: `Add beat ${index + 1}.`,
    estimatedNodeCount: 1,
    estimatedEdgeCount: 0,
    willQueueImages: false,
    willQueueCinematics: false,
  } satisfies WorldPromptSuggestion))
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-suggestions',
      turnId: turn.id,
      eventType: 'turn_completed',
      payload: {
        note: 'Finished with suggestions.',
        suggestions,
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map(),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const turnEntry = feed.entries.find((entry) => entry.kind === 'turn_update')
  const suggestionRows = feed.entries.filter((entry) => entry.kind === 'suggestion' && entry.parentTurnId === turn.id)
  assert.equal(turnEntry?.changeCounts?.suggestions, 5)
  assert.equal(suggestionRows.length, 5)
  assert.deepEqual(suggestionRows.map((entry) => entry.title), suggestions.map((suggestion) => suggestion.label))
  assert.ok(suggestionRows.every((entry) => entry.suggestions?.length === 1))
  assert.ok(suggestionRows.every((entry) => entry.parentTurnId === turn.id))
})

test('buildWorldFeedViewModel dedupes suggestions and never renders standalone suggestion rows', () => {
  const turn = makeTurn({ id: 't-unique-suggestions', prompt: 'Suggest next story moves.' })
  const suggestions = [
    {
      id: 'suggestion-a-1',
      label: 'Add a rival',
      prompt: 'Add a rival who challenges the hero.',
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      threadKey: null,
      summary: 'Create a rival pressure point.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 0,
      willQueueImages: false,
      willQueueCinematics: false,
    },
    {
      id: 'suggestion-a-2',
      label: 'Add a rival again',
      prompt: '  Add a rival who challenges the hero. ',
      kind: 'continue_scope',
      style: 'secondary',
      source: 'wave2',
      threadKey: null,
      summary: 'Duplicate copy should collapse.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 0,
      willQueueImages: false,
      willQueueCinematics: false,
    },
    {
      id: 'suggestion-b',
      label: 'Deepen the setting',
      prompt: 'Add a hidden location with a cost.',
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      threadKey: null,
      summary: 'Add a place to explore.',
      estimatedNodeCount: 1,
      estimatedEdgeCount: 0,
      willQueueImages: false,
      willQueueCinematics: false,
    },
  ] satisfies WorldPromptSuggestion[]
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-unique-suggestions',
      turnId: turn.id,
      eventType: 'turn_completed',
      payload: {
        note: 'Finished with duplicate suggestions.',
        suggestions,
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    suggestions,
    entityByKey: new Map(),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const suggestionRows = feed.entries.filter((entry) => entry.kind === 'suggestion')
  assert.equal(feed.entries.filter((entry) => entry.kind === 'suggestion' && !entry.parentTurnId).length, 0)
  assert.equal(suggestionRows.length, 2)
  assert.equal(feed.entries.find((entry) => entry.kind === 'turn_update')?.changeCounts?.suggestions, 2)
  assert.deepEqual(suggestionRows.map((entry) => entry.title), ['Add a rival', 'Deepen the setting'])
  assert.equal(feed.suggestions.length, 2)
})

test('buildWorldFeedViewModel treats target-key upserts as created when the entity was created during the turn', () => {
  const turn = makeTurn({ id: 't-created-upsert', prompt: 'Create Mira.' })
  const mira = {
    ...createWorldPresentationTestEntity('world.actor.mira', 'Mira', 'actor'),
    createdAt: '2026-04-22T10:00:20.000Z',
    updatedAt: '2026-04-22T10:00:20.000Z',
  } satisfies WorldEntity
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-created-upsert',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-created-upsert',
          op: 'upsert_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Create the new character.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: mira.key,
            entity: {
              name: mira.name,
              summary: mira.summary,
              context: mira.context,
              nodeType: mira.nodeType,
              aliases: [],
              tags: [],
              status: 'active',
              thumbnailAssetKey: null,
              linkedDefinitionKey: null,
              source: 'ai',
              customProperties: {},
              metadata: {},
            },
          },
        },
        applied: {
          worldEntities: [mira],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:00:25.000Z',
    })],
    entityByKey: new Map([[mira.key, mira]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_created' && entry.entityKey === mira.key), true)
  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_updated' && entry.entityKey === mira.key), false)
  assert.equal(feed.entries.find((entry) => entry.kind === 'turn_update')?.changeCounts?.addedEntities, 1)
})

test('buildWorldFeedViewModel treats initial seed upserts as created even without projectedCreate metadata', () => {
  const turn = makeTurn({
    id: 't-initial-seed-feed',
    prompt: 'Generate the world.',
    metadata: { initialSeedMode: 'generate_skeleton' },
  })
  const grove = createWorldPresentationTestEntity('world.place.grove', 'Grove', 'place')
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-initial-seed-feed',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-initial-seed-feed',
          op: 'upsert_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Seed the first world entity.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: grove.key,
            entity: {
              name: grove.name,
              summary: grove.summary,
              context: grove.context,
              nodeType: grove.nodeType,
              aliases: [],
              tags: [],
              status: 'active',
              thumbnailAssetKey: null,
              linkedDefinitionKey: null,
              source: 'ai',
              customProperties: {},
              metadata: {},
            },
          },
        },
        applied: {
          worldEntities: [grove],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:00:25.000Z',
    })],
    entityByKey: new Map([[grove.key, grove]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_created' && entry.entityKey === grove.key), true)
  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_updated' && entry.entityKey === grove.key), false)
})

test('buildWorldFeedViewModel surfaces concrete changed fields for updated entity rows', () => {
  const turn = makeTurn({ id: 't-update-highlight', prompt: 'Refine Mira.' })
  const mira = {
    ...createWorldPresentationTestEntity('world.actor.mira', 'Mira', 'actor'),
    summary: 'Mira now hides the city charter.',
    context: 'She protects the charter from the council.',
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-update-highlight',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-update-highlight',
          op: 'update_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Refine the current canon.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: mira.key,
            changes: {
              summary: mira.summary,
              context: mira.context,
            },
          },
        },
        applied: {
          worldEntities: [mira],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map([[mira.key, mira]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const updated = feed.entries.find((entry) => entry.kind === 'entity_updated' && entry.entityKey === mira.key)
  assert.deepEqual(updated?.changedFields, ['Canon added'])
  assert.equal(updated?.detail, 'Canon added: Mira now hides the city charter.')
  assert.deepEqual(updated?.audit?.changeDetails, [
    'Canon added: Mira now hides the city charter.',
  ])
})

test('buildWorldFeedViewModel keeps upsert update highlights focused on canon additions', () => {
  const turn = makeTurn({ id: 't-sequence-canon', prompt: 'Refine chapter seven.' })
  const chapter = {
    ...createWorldPresentationTestEntity('world.sequence.chapter_7', 'Chapter 7: The Roar and the River', 'sequence_unit'),
    summary: 'In Thunderroot Caverns, the allies must act before the waterworks fail.',
    context: 'This climax chapter gives each core ally a specific turning beat under pressure.',
    customProperties: { beatCount: 7 },
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-sequence-canon',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-sequence-canon',
          op: 'upsert_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Refine chapter canon.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: chapter.key,
            entity: {
              name: chapter.name,
              summary: chapter.summary,
              context: chapter.context,
              nodeType: chapter.nodeType,
              aliases: [],
              tags: [],
              status: 'active',
              thumbnailAssetKey: null,
              linkedDefinitionKey: null,
              source: 'ai',
              customProperties: chapter.customProperties,
              metadata: {},
              ensureLinkedDefinition: true,
            },
          },
        },
        applied: {
          worldEntities: [chapter],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map([[chapter.key, chapter]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const updated = feed.entries.find((entry) => entry.kind === 'entity_updated' && entry.entityKey === chapter.key)
  assert.deepEqual(updated?.changedFields, ['Canon added'])
  assert.deepEqual(updated?.audit?.changeDetails, [
    'Canon added: In Thunderroot Caverns, the allies must act before the waterworks fail.',
  ])
})

test('buildWorldFeedViewModel skips name and summary noise for changed entity details', () => {
  const turn = makeTurn({ id: 't-noisy-update', prompt: 'Tighten the chapter.' })
  const chapter = {
    ...createWorldPresentationTestEntity('world.sequence.chapter_7', 'Chapter 7: The Roar and the River', 'sequence_unit'),
    summary: 'In Thunderroot Caverns, the allies must turn private fears into action.',
    context: 'This chapter now gives each core ally a specific turning beat under pressure.',
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-noisy-update',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-noisy-update',
          op: 'update_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Refine chapter canon.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: chapter.key,
            changes: {
              name: chapter.name,
              summary: chapter.summary,
              context: chapter.context,
            },
          },
        },
        applied: {
          worldEntities: [chapter],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map([[chapter.key, chapter]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const updated = feed.entries.find((entry) => entry.kind === 'entity_updated' && entry.entityKey === chapter.key)
  assert.deepEqual(updated?.changedFields, ['Canon added'])
  assert.deepEqual(updated?.audit?.changeDetails, [
    'Canon added: In Thunderroot Caverns, the allies must turn private fears into action.',
  ])
})

test('buildWorldFeedViewModel does not truncate canon-added update details', () => {
  const turn = makeTurn({ id: 't-long-canon-added', prompt: 'Make the chapter more specific.' })
  const longCanon = [
    'In Thunderroot Caverns, the allies discover the old waterworks were not broken by age but by a protective choice made years earlier.',
    'Tavo realizes his fear of machines is tied to the same accident, Suri has to trust someone else with the leap across the pressure bridge,',
    'and Hollowvine can only be saved if the group accepts that the river must change course rather than return to its old path.',
  ].join(' ')
  const chapter = {
    ...createWorldPresentationTestEntity('world.sequence.chapter_8', 'Chapter 8: The River Turns', 'sequence_unit'),
    summary: longCanon,
    context: 'A detailed climax beat.',
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-22T10:01:00.000Z',
  } satisfies WorldEntity
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [makeEvent({
      id: 'e-long-canon-added',
      turnId: turn.id,
      eventType: 'op_applied',
      payload: {
        op: {
          id: 'op-long-canon-added',
          op: 'upsert_entity',
          confidence: 0.9,
          applyMode: 'auto',
          dependencyOpIds: [],
          rationale: 'Refine chapter canon.',
          status: 'applied',
          metadata: {},
          payload: {
            targetEntityKey: chapter.key,
            entity: {
              name: chapter.name,
              summary: chapter.summary,
              context: chapter.context,
              nodeType: chapter.nodeType,
              aliases: [],
              tags: [],
              status: 'active',
              thumbnailAssetKey: null,
              linkedDefinitionKey: null,
              source: 'ai',
              customProperties: {},
              metadata: {},
              ensureLinkedDefinition: true,
            },
          },
        },
        applied: {
          worldEntities: [chapter],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map([[chapter.key, chapter]]),
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const updated = feed.entries.find((entry) => entry.kind === 'entity_updated' && entry.entityKey === chapter.key)
  assert.deepEqual(updated?.audit?.changeDetails, [`Canon added: ${longCanon}`])
  assert.doesNotMatch(updated?.audit?.changeDetails?.[0] ?? '', /\.\.\.$/)
})

test('uniqueWorldPromptSuggestions collapses repeated active records by prompt', () => {
  const base = {
    label: 'Add a rival',
    prompt: 'Add a rival who challenges the hero.',
    kind: 'continue_scope',
    style: 'primary',
    source: 'wave2',
    threadKey: null,
    summary: 'Create a rival pressure point.',
    estimatedNodeCount: 1,
    estimatedEdgeCount: 0,
    willQueueImages: false,
    willQueueCinematics: false,
  } satisfies Omit<WorldPromptSuggestion, 'id'>
  const unique = uniqueWorldPromptSuggestions([
    { ...base, id: 's1' },
    { ...base, id: 's2', prompt: '  Add a rival who challenges the hero. ' },
    { ...base, id: 's3', prompt: 'Add a hidden location with a cost.', label: 'Deepen the setting' },
  ])

  assert.deepEqual(unique.map((suggestion) => suggestion.id), ['s1', 's3'])
})

test('buildWorldFeedViewModel folds structural relationship patches into one relationship turn card', () => {
  const hero = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const protocol = createWorldPresentationTestEntity('world.concept.protocol', 'Protocol', 'concept')
  const turn = makeTurn({ id: 't-transaction', prompt: 'Rewire the stewardship link.' })
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [
      makeEvent({
        id: 'e-intent',
        turnId: turn.id,
        eventType: 'intent_classified',
        payload: {
          canonIntent: { intent: 'structural_rewire', confidence: 0.9, reason: 'Rewire wording detected.' },
          transaction: { id: `turn.${turn.id}`, intent: 'structural_rewire', risk: 'high', status: 'planning', summary: 'Rewire wording detected.' },
        },
        createdAt: '2026-04-22T10:00:00.000Z',
      }),
      makeEvent({
        id: 'e-rewire',
        turnId: turn.id,
        eventType: 'op_applied',
        payload: {
          op: {
            id: 'op-rewire',
            op: 'relationship_rewire_patch',
            payload: {
              reason: 'Canon link moved.',
              rewires: [{ targetRelationshipKey: 'rel-1', sourceEntityKey: hero.key, targetEntityKey: protocol.key, verb: 'stewards' }],
              auditSummary: { title: 'Relationship rewired' },
            },
          },
          applied: {
            worldEntities: [hero, protocol],
            worldRelationships: [],
            worldOperators: [],
            worldResults: [],
            worldGraphConnections: [],
            worldViews: [],
          },
          audit: {
            title: 'Relationship rewired',
            touchedEntityKeys: [hero.key, protocol.key],
            touchedRelationshipKeys: ['rel-1'],
          },
        },
        createdAt: '2026-04-22T10:01:00.000Z',
      }),
    ],
    entityByKey: new Map([[hero.key, hero], [protocol.key, protocol]]),
    relationships: [],
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const turnEntry = feed.entries.find((entry) => entry.kind === 'turn_update')
  assert.equal(turnEntry?.filter, 'relationships')
  assert.deepEqual(turnEntry?.thumbnailEntityKeys, [hero.key, protocol.key])
  assert.deepEqual(turnEntry?.audit?.relationshipKeys, ['rel-1'])
  assert.equal(feed.entries.some((entry) => entry.kind === 'relationship_updated' && entry.parentTurnId === turn.id), true)
  assert.equal(feed.entries.some((entry) => entry.kind === 'canon_transaction'), false)
  assert.equal(feed.entries.some((entry) => entry.kind === 'relationship_rewired'), false)
})

test('buildWorldFeedViewModel folds node evolution and canon fact updates into one change card', () => {
  const hero = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const updatedHero = {
    ...hero,
    metadata: {
      canonFacts: [{
        factId: 'op-canon.fact.1',
        kind: 'state',
        text: 'Hero now carries the city watch command.',
        status: 'active',
      }],
      currentState: {
        role: 'city watch commander',
      },
    },
  }
  const turn = makeTurn({ id: 't-node-evolution', prompt: 'Hero now commands the city watch.' })
  const feed = buildWorldFeedViewModel({
    turns: [turn],
    messages: [],
    events: [
      makeEvent({
        id: 'e-node-evolution',
        turnId: turn.id,
        eventType: 'node_evolution_decided',
        payload: {
          nodeEvolution: {
            summary: 'Hero is an existing-node state change.',
            decisions: [{
              subject: 'Hero',
              decision: 'state_change',
              targetEntityKey: hero.key,
              confidence: 0.92,
              rationale: 'The prompt changes the existing hero current role.',
              risk: 'low',
            }],
          },
          transaction: {
            id: `turn.${turn.id}`,
            status: 'validating',
            risk: 'low',
            affectedEntityKeys: [hero.key],
          },
        },
        createdAt: '2026-04-22T10:00:00.000Z',
      }),
      makeEvent({
        id: 'e-canon-update',
        turnId: turn.id,
        eventType: 'op_applied',
        payload: {
          op: {
            id: 'op-canon',
            op: 'update_entity_canon',
            payload: {
              targetEntityKey: hero.key,
              factAdditions: [{ factId: 'op-canon.fact.1', kind: 'state', text: 'Hero now carries the city watch command.' }],
              currentStatePatch: { role: 'city watch commander' },
              rationale: 'State changed without replacing identity.',
              risk: 'low',
              auditSummary: { title: 'Hero current state updated' },
            },
          },
          applied: {
            worldEntities: [updatedHero],
            worldRelationships: [],
            worldOperators: [],
            worldResults: [],
            worldGraphConnections: [],
            worldViews: [],
          },
          audit: {
            title: 'Hero current state updated',
            targetEntityKey: hero.key,
            addedFacts: [{ factId: 'op-canon.fact.1' }],
            currentStateChanged: true,
          },
        },
        createdAt: '2026-04-22T10:01:00.000Z',
      }),
    ],
    entityByKey: new Map([[hero.key, updatedHero]]),
    relationships: [],
    now: new Date('2026-04-22T10:02:00.000Z'),
  })

  const turnEntry = feed.entries.find((entry) => entry.kind === 'turn_update')
  assert.equal(turnEntry?.filter, 'changes')
  assert.deepEqual(turnEntry?.connectedEntityKeys, [hero.key])
  assert.deepEqual(turnEntry?.audit?.changedEntityKeys, [hero.key])
  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_updated' && entry.parentTurnId === turn.id && entry.entityKey === hero.key), true)
  assert.equal(feed.entries.some((entry) => entry.kind === 'node_evolution'), false)
  assert.equal(feed.entries.some((entry) => entry.kind === 'entity_canon_updated'), false)
})

test('buildWorldFeedViewModel includes active running turn and completed turn cards', () => {
  const hero = createWorldPresentationTestEntity('world.actor.hero', 'Hero', 'actor')
  const activeTurn = makeTurn({
    id: 't-running',
    status: 'streaming',
    prompt: 'Extend the rebellion.',
    createdAt: '2026-04-22T10:05:00.000Z',
  })
  const completedTurn = makeTurn({ id: 't-completed', prompt: 'Add a hero.' })
  const feed = buildWorldFeedViewModel({
    activeTurn,
    turns: [completedTurn, activeTurn],
    messages: [],
    events: [makeEvent({
      id: 'e-completed',
      turnId: completedTurn.id,
      eventType: 'op_applied',
      payload: {
        applied: {
          worldEntities: [hero],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      createdAt: '2026-04-22T10:01:00.000Z',
    })],
    entityByKey: new Map([[hero.key, hero]]),
    now: new Date('2026-04-22T10:06:00.000Z'),
  })

  assert.equal(feed.activeTurnEntry?.kind, 'active_turn')
  assert.equal(feed.entries[0]?.id, `active-turn:${activeTurn.id}`)
  const summary = feed.entries.find((entry) => entry.kind === 'turn_update')
  assert.equal(summary?.detail, 'Applied 1 new.')
  assert.equal(summary?.turnId, completedTurn.id)
  assert.equal(feed.entries.some((entry) => entry.kind === 'turn_summary'), false)
})

test('buildWorldPromptTranscriptEntries renders derived results as output rows', () => {
  const entries = buildWorldPromptTranscriptEntries({
    messages: [],
    entityByKey: new Map(),
    events: [{
      id: 'e-result',
      sessionId: 's1',
      turnId: 't-result',
      draftId: 'd1',
      sequence: 1,
      eventType: 'op_applied',
      opId: 'op-result',
      payload: {
        applied: {
          worldEntities: [],
          worldRelationships: [],
          worldOperators: [],
          worldResults: [{
            id: 'result-1',
            key: 'world.result.staged-duel',
            resultType: 'scene_setup',
            sourceOperatorKey: 'world.operator.stage-scene',
            title: 'Staged Duel',
            summary: 'A duel scene setup.',
            previewAssetKey: null,
            status: 'draft',
            metadata: {},
            createdAt: '2026-04-22T10:05:00.000Z',
            updatedAt: '2026-04-22T10:05:00.000Z',
          }],
          worldGraphConnections: [],
          worldViews: [],
        },
        suggestions: [],
        diagnostics: [],
      },
      metadata: {},
      createdAt: '2026-04-22T10:05:00.000Z',
    }],
  })

  assert.ok(entries.some((entry) => entry.kind === 'derived_result_created' && entry.label === 'Created Staged Duel'))
})

test('buildWorldPromptTranscriptEntries renders clarification question and answer rows', () => {
  const messages: WorldPromptMessage[] = [{
    id: 'm-clarify-answer',
    sessionId: 's1',
    turnId: 't-answer',
    draftId: 'd1',
    role: 'user',
    content: 'Add the occult influence.',
    metadata: {
      selectedSuggestionId: 'sg-1',
      selectedSuggestionLabel: 'Add occult influence',
      selectedSuggestionUiKind: 'clarification',
      continuationMode: 'answered_clarification',
    },
    createdAt: '2026-04-22T10:03:00.000Z',
  }]

  const events: WorldPromptEvent[] = [{
    id: 'e-clarify',
    sessionId: 's1',
    turnId: 't-clarify',
    draftId: 'd1',
    sequence: 1,
    eventType: 'planner_status',
    opId: null,
    payload: {
      plannerStatus: 'blocked',
      suggestions: [{
        id: 'sg-1',
        label: 'Add occult influence',
        prompt: 'Add occult influence to the succession crisis.',
        kind: 'repair_prompt',
        style: 'primary',
        source: 'repair',
        threadKey: null,
        summary: 'Clarify what kind of darkness you want.',
        estimatedNodeCount: 1,
        estimatedEdgeCount: 1,
        willQueueImages: false,
        willQueueCinematics: false,
      }],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:02:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages,
    entityByKey: new Map(),
  })

  assert.ok(entries.some((entry) => entry.kind === 'clarification_question'))
  assert.ok(entries.some((entry) => entry.kind === 'clarification_answer' && entry.detail === 'Add occult influence'))
})

test('buildWorldPromptTranscriptEntries drops diagnostic-only suggestions', () => {
  const events: WorldPromptEvent[] = [{
    id: 'e-diagnostic-suggestion',
    sessionId: 's1',
    turnId: 't-diagnostic',
    draftId: 'd1',
    sequence: 1,
    eventType: 'planner_status',
    opId: null,
    payload: {
      plannerStatus: 'blocked',
      suggestions: [{
        id: 'sg-bad',
        label: 'Hosted prompt planning was unavailable.',
        prompt: 'oneOf is not permitted in operations.',
        kind: 'repair_prompt',
        style: 'primary',
        source: 'repair',
        threadKey: null,
        summary: 'Immediate JSON response invalid.',
        estimatedNodeCount: 0,
        estimatedEdgeCount: 0,
        willQueueImages: false,
        willQueueCinematics: false,
      }],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:02:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map(),
  })

  assert.equal(entries.some((entry) => entry.kind === 'suggestion_set' || entry.kind === 'clarification_question'), false)
})

test('buildWorldPromptTranscriptEntries keeps freeform continuation as just the user prompt', () => {
  const messages: WorldPromptMessage[] = [{
    id: 'm-freeform',
    sessionId: 's1',
    turnId: 't-freeform',
    draftId: 'd1',
    role: 'user',
    content: 'Actually expand the prophecy instead.',
    metadata: {
      continuationMode: 'freeform_after_suggestions',
    },
    createdAt: '2026-04-22T10:04:00.000Z',
  }]

  const entries = buildWorldPromptTranscriptEntries({
    events: [],
    messages,
    entityByKey: new Map(),
  })

  assert.equal(entries.some((entry) => entry.kind === 'continuation_without_suggestion'), false)
  assert.ok(entries.some((entry) => entry.kind === 'user_message' && entry.content === 'Actually expand the prophecy instead.'))
})

test('buildWorldPromptTranscriptEntries renders advisory answers and diagnostic findings once', () => {
  const events: WorldPromptEvent[] = [makeEvent({
    turnId: 't-advisory',
    payload: {
      plannerStatus: 'scoping',
      classification: 'graph_diagnosis',
      answer: 'Raja is strong politically, but the graph does not yet show enough pressure around his heir or the religious fallout.',
      answerMode: 'answer_plus_options',
      diagnosticFindings: [{
        id: 'finding-raja-context',
        findingType: 'weak_context',
        title: 'Raja needs richer context',
        summary: 'Raja has status in the graph, but his political and religious pressure is still underexplained.',
        targetKeys: ['world.actor.raja'],
        severity: 'high',
      }],
      suggestions: [],
      diagnostics: [],
    },
  }), makeEvent({
    id: 'e-advisory-duplicate',
    turnId: 't-advisory',
    sequence: 2,
    payload: {
      plannerStatus: 'completed',
      classification: 'graph_diagnosis',
      answer: 'Raja is strong politically, but the graph does not yet show enough pressure around his heir or the religious fallout.',
      answerMode: 'answer_plus_options',
      diagnosticFindings: [{
        id: 'finding-raja-context',
        findingType: 'weak_context',
        title: 'Raja needs richer context',
        summary: 'Raja has status in the graph, but his political and religious pressure is still underexplained.',
        targetKeys: ['world.actor.raja'],
        severity: 'high',
      }],
      suggestions: [],
      diagnostics: [],
    },
  })]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages: [],
    entityByKey: new Map(),
  })

  assert.equal(entries.filter((entry) => entry.kind === 'advisory_answer').length, 1)
  assert.equal(entries.filter((entry) => entry.kind === 'diagnostic_finding').length, 1)
})

test('buildWorldPromptTranscriptEntries dedupes returned assistant notes and repeated suggestion payloads', () => {
  const note = 'Suggested compact supernatural threat directions that can brew behind House Veyr political conflict.'
  const suggestions: WorldPromptSuggestion[] = [{
    id: 'suggestion-threat-1',
    label: 'Bind the drowned saints',
    prompt: 'Add the drowned saints as a compact supernatural threat behind House Veyr succession crisis.',
    kind: 'continue_scope',
    style: 'primary',
    source: 'advisory',
    threadKey: null,
    summary: 'A hidden cult threat pressures the succession.',
    estimatedNodeCount: 2,
    estimatedEdgeCount: 2,
    willQueueImages: false,
    willQueueCinematics: false,
  }]
  const messages: WorldPromptMessage[] = [{
    id: 'm-assistant-threat',
    sessionId: 's1',
    turnId: 't-threat',
    draftId: 'd1',
    role: 'assistant',
    content: `${note}\n\nChoose one of these directions when you are ready to apply it.`,
    metadata: {},
    createdAt: '2026-04-24T10:00:01.000Z',
  }]
  const events: WorldPromptEvent[] = [
    makeEvent({
      id: 'e-threat-note',
      turnId: 't-threat',
      sequence: 1,
      eventType: 'assistant_note',
      payload: { note, suggestions, diagnostics: [] },
    }),
    makeEvent({
      id: 'e-threat-status',
      turnId: 't-threat',
      sequence: 2,
      eventType: 'planner_status',
      payload: { plannerStatus: 'completed', note, suggestions: [{ ...suggestions[0], id: 'suggestion-threat-2' }], diagnostics: [] },
    }),
    makeEvent({
      id: 'e-threat-completed',
      turnId: 't-threat',
      sequence: 3,
      eventType: 'turn_completed',
      payload: { note, suggestions: [{ ...suggestions[0], id: 'suggestion-threat-3' }], diagnostics: [] },
    }),
  ]

  const entries = buildWorldPromptTranscriptEntries({
    events,
    messages,
    entityByKey: new Map(),
  })

  assert.equal(entries.filter((entry) => entry.kind === 'assistant_message' && entry.content?.includes(note)).length, 1)
  assert.equal(entries.filter((entry) => entry.kind === 'suggestion_set').length, 1)
})

test('buildWorldInspectorViewModel formats entity cards', () => {
  const entity = {
    id: '1',
    key: 'world.place.city',
    name: 'Aster Reach',
    summary: 'Capital city.',
    context: 'Seat of the fractured crown and center of the succession crisis.',
    nodeType: 'place',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'user',
    customProperties: {},
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
  } satisfies WorldEntity

  const viewModel = buildWorldInspectorViewModel({
    entity,
    operator: null,
    result: null,
    imageUrl: 'https://example.com/city.png',
    relationCount: 4,
    usageCount: 2,
  })

  assert.equal(viewModel?.title, 'Aster Reach')
  assert.equal(viewModel?.kicker, 'Place')
  assert.equal(viewModel?.context, 'Seat of the fractured crown and center of the succession crisis.')
  assert.equal(viewModel?.stats[0], '4 relationships')
  assert.deepEqual(viewModel?.refinementHistory, [])
})

test('buildWorldRefinementHistoryViewModel parses latest refinement entries', () => {
  const history = buildWorldRefinementHistoryViewModel({
    refinementHistory: [
      {
        at: '2026-04-21T08:00:00.000Z',
        field: 'summary',
        strategy: 'expanded',
        previousText: 'Old summary.',
        incomingText: 'New detail.',
        resultText: 'Old summary. New detail.',
      },
      {
        at: '2026-04-22T09:30:00.000Z',
        field: 'context',
        strategy: 'merged_distinct',
        previousText: 'Role: Keeper.',
        incomingText: 'Secret: Hides a treaty shard.',
        resultText: 'Role: Keeper.\nSecret: Hides a treaty shard.',
      },
    ],
  })

  assert.equal(history.length, 2)
  assert.equal(history[0]?.field, 'context')
  assert.equal(history[0]?.fieldLabel, 'Context')
  assert.equal(history[0]?.strategyLabel, 'Merged detail')
  assert.equal(history[0]?.at, '2026-04-22 09:30 UTC')
})

test('buildWorldInspectorViewModel exposes entity refinement history', () => {
  const entity = {
    id: '2',
    key: 'world.actor.sable',
    name: 'Sable',
    summary: 'Court spymaster.',
    context: 'Role: Court spymaster.',
    nodeType: 'actor',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties: {},
    metadata: {
      refinementHistory: [
        {
          at: '2026-04-22T12:15:00.000Z',
          field: 'summary',
          strategy: 'expanded',
          previousText: 'Court spymaster.',
          incomingText: 'Also commands the queen’s whisper network.',
          resultText: 'Court spymaster. Also commands the queen’s whisper network.',
        },
      ],
    },
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T12:15:00.000Z',
  } satisfies WorldEntity

  const viewModel = buildWorldInspectorViewModel({
    entity,
    operator: null,
    result: null,
    relationCount: 2,
    usageCount: 1,
  })

  assert.equal(viewModel?.refinementHistory.length, 1)
  assert.equal(viewModel?.refinementHistory[0]?.fieldLabel, 'Summary')
  assert.equal(viewModel?.refinementHistory[0]?.resultText, 'Court spymaster. Also commands the queen’s whisper network.')
})

test('worldPromptStartTurnResponseSchema accepts returned linked definitions and turn transcript records', () => {
  const parsed = worldPromptStartTurnResponseSchema.parse({
    ok: true,
    session: {
      id: 'session-1',
      draftId: 'draft-1',
      key: 'world.prompt.session-1',
      title: 'Session',
      status: 'active',
      isActive: true,
      summaryMemory: '',
      lastContext: {},
      createdAt: '2026-04-24T10:00:00.000Z',
      updatedAt: '2026-04-24T10:00:00.000Z',
    },
    turn: makeTurn(),
    messages: [{
      id: 'message-1',
      sessionId: 'session-1',
      turnId: 't1',
      draftId: 'd1',
      role: 'user',
      content: 'Suggest a background supernatural threat.',
      metadata: {},
      createdAt: '2026-04-24T10:00:01.000Z',
    }],
    events: [{
      id: 'event-1',
      sessionId: 'session-1',
      turnId: 't1',
      draftId: 'd1',
      sequence: 1,
      eventType: 'message_created',
      opId: null,
      payload: {},
      metadata: {},
      createdAt: '2026-04-24T10:00:01.000Z',
    }],
    suggestions: [],
    threads: [],
    definitions: [{
      id: 'def-1',
      key: 'character.elian_vale',
      kind: 'character',
      name: 'Elian Vale',
      summary: 'A lighthouse cartographer.',
      status: 'draft',
      iconAssetKey: null,
      archetypeKey: null,
      tags: [],
      schemaVersion: 1,
      metadata: {},
      llmHints: {},
      assetRefs: [],
      definitionData: {},
      fieldValues: [],
      customFields: [],
      components: [],
    }],
  })

  assert.equal(parsed.definitions.length, 1)
  assert.equal(parsed.messages[0]?.content, 'Suggest a background supernatural threat.')
  assert.equal(parsed.events[0]?.eventType, 'message_created')
})

test('promptToWorldOpSchema accepts project wiki metadata updates', () => {
  const parsed = promptToWorldOpSchema.parse({
    id: 'wiki-meta-1',
    op: 'update_world_wiki_metadata',
    confidence: 0.9,
    applyMode: 'auto',
    dependencyOpIds: [],
    rationale: 'Seed-world turn created enough premise material for a compact wiki overview.',
    status: 'pending',
    metadata: {},
    payload: {
      target: 'project',
      targetViewKey: null,
      reason: 'Fill missing overview fields.',
      metadata: {
        title: 'The Archive That Eats Names',
        logline: 'A memory-walking archivist must save a city from forgetting itself.',
        synopsis: 'A compact overview of the current graph canon.',
        genre: ['dark fantasy', 'mystery'],
        themes: ['memory', 'inheritance'],
        toneTags: 'melancholic, eerie',
        generatedFromFingerprint: 'wiki-v1|project-1',
      },
    },
  })

  assert.equal(describePromptOp(parsed), 'Update world wiki overview')
  assert.equal(parsed.op, 'update_world_wiki_metadata')
  if (parsed.op === 'update_world_wiki_metadata') {
    assert.equal(parsed.payload.metadata.title, 'The Archive That Eats Names')
    assert.equal(parsed.payload.metadata.logline, 'A memory-walking archivist must save a city from forgetting itself.')
    assert.equal(parsed.payload.metadata.genre, 'dark fantasy, mystery')
    assert.deepEqual(parsed.payload.metadata.toneTags, ['melancholic', 'eerie'])
  }
})

function createWorldPresentationTestEntity(key: string, name: string, nodeType: WorldEntity['nodeType']): WorldEntity {
  return {
    id: key,
    key,
    name,
    summary: '',
    context: '',
    nodeType,
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties: {},
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
  }
}

function makeTurn(overrides: Partial<WorldPromptTurn> = {}): WorldPromptTurn {
  return {
    id: 't1',
    sessionId: 's1',
    draftId: 'd1',
    prompt: 'Base prompt',
    status: 'completed',
    model: 'gpt-5.4-mini',
    resolvedContext: {
      summaryMemory: '',
      selectedRootEntityKey: null,
      selectedViewKey: null,
      selectedThreadKey: null,
      resolvedMode: null,
      resolvedIntent: null,
      resolvedFocus: null,
    },
    approvalState: 'not_required',
    assistantSummary: '',
    errorMessage: null,
    responseId: null,
    metadata: {},
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<WorldPromptEvent> = {}): WorldPromptEvent {
  return {
    id: 'e1',
    sessionId: 's1',
    turnId: 't1',
    draftId: 'd1',
    sequence: 1,
    eventType: 'planner_status',
    opId: null,
    payload: {
      suggestions: [],
      diagnostics: [],
    },
    metadata: {},
    createdAt: '2026-04-22T10:01:00.000Z',
    ...overrides,
  }
}

function makeGenerationJob(overrides: Partial<WorldPromptGenerationJob> = {}): WorldPromptGenerationJob {
  return {
    id: 'job-1',
    draftId: 'd1',
    sessionId: 's1',
    turnId: 't1',
    kind: 'initial_seed_stream',
    status: 'completed',
    attemptCount: 1,
    heartbeatAt: null,
    startedAt: null,
    completedAt: null,
    tokenUsage: {},
    counts: {},
    errorMessage: null,
    metadata: {},
    latestAppliedOpCursor: null,
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
    ...overrides,
  }
}

function makeGenerationJobStep(overrides: Partial<WorldPromptGenerationJobStep> = {}): WorldPromptGenerationJobStep {
  return {
    id: 'step-1',
    jobId: 'job-1',
    draftId: 'd1',
    sessionId: 's1',
    turnId: 't1',
    stepKey: 'core_entities',
    phase: 'core_entities',
    status: 'completed',
    attemptCount: 1,
    orderIndex: 1,
    heartbeatAt: null,
    startedAt: null,
    completedAt: null,
    tokenUsage: {},
    counts: {},
    errorMessage: null,
    metadata: {},
    latestAppliedOpCursor: null,
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
    ...overrides,
  }
}

test('buildWorldPromptRailViewModel returns idle for an empty stream', () => {
  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: null,
    turns: [],
    events: [],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'idle')
  assert.equal(viewModel.primaryActionLabel, 'Generate')
})

test('buildWorldPromptRailViewModel returns working while a turn is streaming', () => {
  const activeTurn = makeTurn({
    status: 'streaming',
    assistantSummary: 'Resolving factions and sites.',
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn,
    turns: [activeTurn],
    events: [makeEvent({
      payload: {
        plannerStatus: 'planning',
        suggestions: [],
        diagnostics: [],
      },
    })],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'working')
  assert.equal(viewModel.statusLabel, 'Planning')
  assert.equal(viewModel.detail, 'The planner is resolving entities, relationships, and next moves.')
})

test('buildWorldPromptRailViewModel does not reuse stale completed-turn detail while a new turn is working', () => {
  const previousTurn = makeTurn({
    id: 't-prev',
    status: 'completed',
    assistantSummary: 'Expanded the queen and her council.',
  })
  const activeTurn = makeTurn({
    id: 't-active',
    status: 'queued',
    assistantSummary: 'Expanded the queen and her council.',
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn,
    turns: [previousTurn, activeTurn],
    events: [],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'working')
  assert.equal(viewModel.statusLabel, 'Planning')
  assert.equal(viewModel.detail, 'The planner is resolving entities, relationships, and next moves.')
})

test('buildWorldPromptRailViewModel surfaces apply progress while a turn is applying ops', () => {
  const activeTurn = makeTurn({
    id: 't-applying',
    status: 'streaming',
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn,
    turns: [activeTurn],
    events: [makeEvent({
      turnId: 't-applying',
      payload: {
        plannerStatus: 'applying',
        plannerProgress: {
          phase: 'applying_changes',
          message: 'Applying 2/5: Add Yara Vale',
          sequence: 2,
        },
        suggestions: [],
        diagnostics: [],
      },
    })],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'working')
  assert.equal(viewModel.statusLabel, 'Applying changes')
  assert.equal(viewModel.detail, 'Applying 2/5: Add Yara Vale')
})

test('buildWorldPromptRailViewModel does not enter preview state for staged preview metadata', () => {
  const previewTurn = makeTurn({
    metadata: {
      classification: 'graphable_plan_only',
      preview: {
        mode: 'plan_only',
        requestSummary: 'Add a secret order and its keep.',
        scopeDecision: {
          mode: 'staged',
          counts: {
            actionableOps: 2,
            entityOps: 1,
            relationshipOps: 1,
            existingEntityModificationOps: 0,
            queueOps: 0,
            derivedResultOps: 0,
          },
          starterPackApplied: false,
        },
        items: [],
        suggestions: [],
        canApplyFirstWave: true,
        pendingOps: [],
        appliedAt: null,
      },
    },
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: null,
    turns: [previewTurn],
    events: [],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'idle')
})

test('buildWorldPromptRailViewModel returns blocked for contradictory classification', () => {
  const blockedTurn = makeTurn({
    metadata: {
      classification: 'contradictory_or_low_confidence',
      plannerFailure: {
        category: 'timeout',
        message: 'OpenAI responses request timed out after 60000ms.',
        fallbackUsed: true,
        occurredAt: '2026-04-22T10:00:00.000Z',
      },
    },
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: null,
    turns: [blockedTurn],
    events: [],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'blocked')
  assert.equal(viewModel.statusLabel, 'Blocked')
  assert.equal(viewModel.plannerFailure?.category, 'timeout')
})

test('buildWorldPromptRailViewModel returns completed diagnosis for advisory turns', () => {
  const advisoryTurn = makeTurn({
    assistantSummary: 'Raja is politically central, but his heir and religious liabilities need more context.',
    metadata: {
      classification: 'graph_diagnosis',
      answer: 'Raja is politically central, but his heir and religious liabilities need more context.',
      diagnosticFindings: [{
        id: 'finding-raja',
        findingType: 'weak_context',
        title: 'Raja needs richer context',
        summary: 'His political utility and shame dynamic are thin.',
        targetKeys: ['world.actor.raja'],
        severity: 'high',
      }],
    },
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: null,
    turns: [advisoryTurn],
    events: [],
    entityByKey: new Map(),
  })

  assert.equal(viewModel.state, 'completed')
  assert.equal(viewModel.statusLabel, 'Diagnosis')
})

test('buildWorldPromptRailViewModel does not enter approval state when preview ops need approval', () => {
  const pendingOp: PromptToWorldOp = {
    id: 'op1',
    op: 'update_entity',
    confidence: 1,
    applyMode: 'needs_approval',
    dependencyOpIds: [],
    rationale: '',
    status: 'pending',
    metadata: {},
    payload: {
      targetEntityKey: 'world.actor.hero',
      changes: {
        summary: 'Updated',
      },
    },
  }

  const approvalTurn = makeTurn({
    status: 'awaiting_approval',
    approvalState: 'pending',
    metadata: {
      classification: 'graphable_direct',
      preview: {
        mode: 'staged_first_wave',
        requestSummary: 'Change canon facts.',
        scopeDecision: {
          mode: 'direct',
          counts: {
            actionableOps: 1,
            entityOps: 0,
            relationshipOps: 0,
            existingEntityModificationOps: 1,
            queueOps: 0,
            derivedResultOps: 0,
          },
          starterPackApplied: false,
        },
        items: [],
        suggestions: [],
        canApplyFirstWave: false,
        pendingOps: [pendingOp],
        appliedAt: null,
      },
    },
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: approvalTurn,
    turns: [approvalTurn],
    events: [],
    entityByKey: new Map(),
  })

  assert.notEqual(viewModel.state, 'approval_required')
  assert.equal(viewModel.approvalOps.length, 1)
})

test('buildWorldPromptRailViewModel keeps pending approval ops out of the primary rail state', () => {
  const pendingOp: PromptToWorldOp = {
    id: 'op-event-1',
    op: 'update_entity',
    confidence: 1,
    applyMode: 'needs_approval',
    dependencyOpIds: [],
    rationale: '',
    status: 'pending',
    metadata: {},
    payload: {
      targetEntityKey: 'world.actor.hero',
      changes: {
        summary: 'Updated',
      },
    },
  }

  const approvalTurn = makeTurn({
    status: 'awaiting_approval',
    approvalState: 'pending',
    metadata: {
      classification: 'graphable_direct',
    },
  })

  const approvalEvent = makeEvent({
    eventType: 'op_needs_approval',
    opId: pendingOp.id,
    payload: {
      op: pendingOp,
      diagnostics: [],
    },
  })

  const viewModel = buildWorldPromptRailViewModel({
    activeTurn: approvalTurn,
    turns: [approvalTurn],
    events: [approvalEvent],
    entityByKey: new Map(),
  })

  assert.notEqual(viewModel.state, 'approval_required')
  assert.deepEqual(viewModel.approvalOps.map((op) => op.id), [pendingOp.id])
})
