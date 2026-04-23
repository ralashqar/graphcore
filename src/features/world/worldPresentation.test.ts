import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorldPromptRailViewModel,
  buildWorldInspectorViewModel,
  buildWorldPromptTranscriptEntries,
  describePlannerFailureCategory,
  promptSuggestionImpactLabel,
  stripInternalPlannerDiagnostics,
} from './worldPresentation.ts'
import type { PromptToWorldOp, WorldPromptEvent, WorldPromptMessage, WorldPromptSuggestion, WorldPromptTurn } from '../../domain/worldPrompt.ts'
import type { WorldEntity } from '../../domain/worldGraph.ts'

test('stripInternalPlannerDiagnostics removes planner validation tails', () => {
  const input = 'Working summary. Planner output validation failed. extra diagnostics follow'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Working summary.')
})

test('stripInternalPlannerDiagnostics removes fallback and schema-operation prefixes', () => {
  const input = 'Hosted prompt planning was unavailable, so GraphCore used a local fallback seed. oneOf is not permitted in operations. Immediate JSON response invalid. Keep the world compact.'
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

  assert.equal(entries.length, 2)
  assert.equal(entries[1]?.kind, 'entity_created')
  assert.equal(entries[1]?.entityNodeType, 'actor')
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

test('buildWorldPromptTranscriptEntries emits preview and approval rows', () => {
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

  assert.ok(entries.some((entry) => entry.kind === 'preview_available' && entry.turnId === 't2'))
  assert.ok(entries.some((entry) => entry.kind === 'approval_required' && entry.turnId === 't2'))
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
        label: 'Hosted prompt planning was unavailable, so GraphCore used a local fallback seed.',
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
})

function makeTurn(overrides: Partial<WorldPromptTurn> = {}): WorldPromptTurn {
  return {
    id: 't1',
    sessionId: 's1',
    draftId: 'd1',
    prompt: 'Base prompt',
    status: 'completed',
    model: 'gpt-5.4-mini',
    resolvedContext: {},
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
})

test('buildWorldPromptRailViewModel returns preview when a staged preview exists', () => {
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

  assert.equal(viewModel.state, 'plan_preview')
  assert.equal(viewModel.primaryActionLabel, 'Apply first wave')
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

test('buildWorldPromptRailViewModel returns approval state when preview ops need approval', () => {
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

  assert.equal(viewModel.state, 'approval_required')
  assert.equal(viewModel.approvalOps.length, 1)
})
