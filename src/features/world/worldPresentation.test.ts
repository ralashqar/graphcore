import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorldGraphFilterState,
  buildWorldGraphGrowthPlaybackModel,
  buildWorldGraphLabelPolicy,
  buildWorldGraphPresentationPresetConfig,
  buildWorldNodeVisibilityReason,
  buildWorldRefinementHistoryViewModel,
  buildWorldPromptRailViewModel,
  buildWorldInspectorViewModel,
  buildWorldPromptTranscriptEntries,
  buildWorldPromptTurnLens,
  buildWorldPromptTurnLenses,
  describePromptOp,
  describePlannerFailureCategory,
  promptSuggestionImpactLabel,
  resolveWorldEdgeReveal,
  stripInternalPlannerDiagnostics,
} from './worldPresentation.ts'
import { promptToWorldOpSchema, worldPromptStartTurnResponseSchema } from '../../domain/worldPrompt.ts'
import type { PromptToWorldOp, WorldPromptEvent, WorldPromptMessage, WorldPromptSuggestion, WorldPromptTurn } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldGraphConnection, WorldOperator, WorldRelationship, WorldResult } from '../../domain/worldGraph.ts'

test('stripInternalPlannerDiagnostics removes planner validation tails', () => {
  const input = 'Working summary. Planner output validation failed. extra diagnostics follow'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Working summary.')
})

test('stripInternalPlannerDiagnostics removes fallback and schema-operation prefixes', () => {
  const input = 'Hosted prompt planning was unavailable. oneOf is not permitted in operations. Immediate JSON response invalid. Keep the world compact.'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Keep the world compact.')
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
  assert.equal(lens.changeCount, 1)
  assert.deepEqual(lens.counts, {
    entities: 1,
    relationships: 0,
    derived: 0,
    total: 1,
  })
})

test('buildWorldPromptTurnLenses includes every supported world entity node type', () => {
  const nodeTypes = ['actor', 'group', 'place', 'object', 'concept', 'event'] satisfies WorldEntity['nodeType'][]
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

  assert.ok(entries.some((entry) => entry.kind === 'entity_updated' && entry.detail?.includes('Expanded context')))
  assert.ok(entries.some((entry) => entry.kind === 'relationship_updated' && entry.detail?.includes('Updated relationship details')))
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
        logline: 'A memory-walking archivist must save a city from forgetting itself.',
        synopsis: 'A compact overview of the current graph canon.',
        themes: ['memory', 'inheritance'],
        toneTags: ['melancholic'],
        generatedFromFingerprint: 'wiki-v1|project-1',
      },
    },
  })

  assert.equal(describePromptOp(parsed), 'Update world wiki overview')
  assert.equal(parsed.op, 'update_world_wiki_metadata')
  if (parsed.op === 'update_world_wiki_metadata') {
    assert.equal(parsed.payload.metadata.logline, 'A memory-walking archivist must save a city from forgetting itself.')
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
