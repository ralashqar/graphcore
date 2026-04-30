import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSeedGeneratedPreviewCards } from './projectWorldOnboardingPreview.ts'
import type { WorldPromptEvent } from '../../domain/worldPrompt.ts'

function event(sequence: number, op: Record<string, unknown>): WorldPromptEvent {
  return {
    id: `event-${sequence}`,
    sessionId: 'session-1',
    turnId: 'turn-1',
    draftId: 'draft-1',
    sequence,
    eventType: 'op_applied',
    opId: `op-${sequence}`,
    payload: {
      op: {
        id: `op-${sequence}`,
        confidence: 1,
        applyMode: 'auto',
        dependencyOpIds: [],
        rationale: '',
        status: 'applied',
        metadata: {},
        ...op,
      },
    },
    metadata: {},
    createdAt: `2026-04-30T10:00:0${sequence}.000Z`,
  }
}

test('buildSeedGeneratedPreviewCards maps world wiki metadata into an overview card', () => {
  const cards = buildSeedGeneratedPreviewCards([
    event(1, {
      op: 'update_world_wiki_metadata',
      payload: {
        target: 'project',
        targetViewKey: null,
        reason: '',
        metadata: {
          title: 'The Memory Empire',
          logline: 'A fallen realm survives by trading memories.',
          synopsis: 'The last archivists rebel against shadow governors.',
          genre: 'Fantasy series',
          themes: ['memory', 'empire'],
          toneTags: ['haunted', 'cinematic'],
          coreConflict: 'Memory is power and currency.',
          visualMotifs: ['black glass', 'silver ink'],
        },
      },
    }),
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'overview')
  assert.equal(cards[0].title, 'The Memory Empire')
  assert.equal(cards[0].summary, 'A fallen realm survives by trading memories.')
  assert.equal(cards[0].lists.some((list) => list.label === 'Themes' && list.values.includes('memory')), true)
})

test('buildSeedGeneratedPreviewCards maps normal entities into entity cards', () => {
  const cards = buildSeedGeneratedPreviewCards([
    event(1, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Mara Veyr',
          summary: 'A memory thief with a royal debt.',
          context: 'She knows the empire is lying about its origin.',
          nodeType: 'actor',
          aliases: ['The Grey Daughter'],
          tags: ['protagonist'],
          status: 'active',
          thumbnailAssetKey: null,
          linkedDefinitionKey: null,
          source: 'ai',
          customProperties: {},
          metadata: {},
          ensureLinkedDefinition: true,
        },
      },
    }),
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'entity')
  assert.equal(cards[0].icon, 'character')
  assert.equal(cards[0].title, 'Mara Veyr')
  assert.equal(cards[0].lists.some((list) => list.label === 'Tags' && list.values.includes('protagonist')), true)
})

test('buildSeedGeneratedPreviewCards maps sequence units with story schema fields', () => {
  const cards = buildSeedGeneratedPreviewCards([
    event(1, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Episode 1: The Tithe Mark',
          summary: 'The first public memory tithe goes wrong.',
          context: 'This opens the central rebellion.',
          nodeType: 'sequence_unit',
          aliases: [],
          tags: ['episode'],
          status: 'active',
          thumbnailAssetKey: null,
          linkedDefinitionKey: null,
          source: 'ai',
          customProperties: {
            sequence: {
              unitKind: 'episode',
              sequenceKey: 'main',
              ordinal: 1,
              actLabel: 'Act I',
              synopsis: 'Mara steals a tithe mark and exposes a forbidden archive.',
              dramaticQuestion: 'Can Mara escape before the mark consumes her memory?',
              storyFunction: 'inciting_incident',
              outcome: 'Mara becomes the empire’s most wanted fugitive.',
              consequences: [{ cause: 'The theft succeeds', effect: 'The archive wakes' }],
              characterArcDeltas: [{ actorKey: 'mara_veyr', before: 'isolated', pressure: 'hunted', choice: 'protects a witness', after: 'committed' }],
              openLoops: ['Who built the archive?'],
              resolvedLoops: [],
              scriptExpansionReady: true,
            },
          },
          metadata: {},
          ensureLinkedDefinition: true,
        },
      },
    }),
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'sequence_unit')
  assert.equal(cards[0].ordinal, 1)
  assert.equal(cards[0].summary, 'Mara steals a tithe mark and exposes a forbidden archive.')
  assert.equal(cards[0].fields.some((field) => field.label === 'Outcome'), true)
  assert.equal(cards[0].lists.some((list) => list.label === 'Consequences'), true)
})

test('buildSeedGeneratedPreviewCards ignores malformed payloads safely', () => {
  const cards = buildSeedGeneratedPreviewCards([
    {
      ...event(1, {
        op: 'upsert_entity',
        payload: { targetEntityKey: null, entity: { name: '', nodeType: 'actor' } },
      }),
      payload: { op: { op: 'upsert_entity', payload: { entity: { name: '', nodeType: 'actor' } } } },
    },
  ])

  assert.deepEqual(cards, [])
})
