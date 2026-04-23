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

test('buildWorldPromptTranscriptEntries renders continuation without suggestion rows', () => {
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

  assert.ok(entries.some((entry) => entry.kind === 'continuation_without_suggestion'))
  assert.ok(entries.some((entry) => entry.kind === 'user_message' && entry.content === 'Actually expand the prophecy instead.'))
})

test('buildWorldInspectorViewModel formats entity cards', () => {
  const entity = {
    id: '1',
    key: 'world.place.city',
    name: 'Aster Reach',
    summary: 'Capital city.',
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
