import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorldInspectorViewModel,
  buildWorldPromptTranscriptEntries,
  promptSuggestionImpactLabel,
  stripInternalPlannerDiagnostics,
} from './worldPresentation.ts'
import type { WorldPromptEvent, WorldPromptMessage, WorldPromptSuggestion } from '../../domain/worldPrompt.ts'
import type { WorldEntity } from '../../domain/worldGraph.ts'

test('stripInternalPlannerDiagnostics removes planner validation tails', () => {
  const input = 'Working summary. Planner output validation failed. extra diagnostics follow'
  assert.equal(stripInternalPlannerDiagnostics(input), 'Working summary.')
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
