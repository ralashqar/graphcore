import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSeedAssemblySections,
  buildSeedGeneratedPreviewCards,
} from './projectWorldOnboardingPreview.ts'
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
          metadata: {
            visualDescription: 'A sharp-eyed woman in a rain-dark cloak, silver memory ink glowing at her wrist.',
          },
          ensureLinkedDefinition: true,
        },
      },
    }),
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'entity')
  assert.equal(cards[0].icon, 'character')
  assert.equal(cards[0].title, 'Mara Veyr')
  assert.equal(cards[0].fields.some((field) => field.label === 'Visual description'), true)
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
          metadata: {
            visualDescription: 'A moonlit archive chamber as a stolen tithe mark burns through Mara\'s palm.',
          },
          ensureLinkedDefinition: true,
        },
      },
    }),
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'sequence_unit')
  assert.equal(cards[0].ordinal, 1)
  assert.equal(cards[0].summary, 'Mara steals a tithe mark and exposes a forbidden archive.')
  assert.equal(cards[0].fields.some((field) => field.label === 'Visual description'), true)
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

test('buildSeedAssemblySections groups generated records into presentation sections', () => {
  const sections = buildSeedAssemblySections([
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
          themes: ['memory'],
          toneTags: ['haunted'],
        },
      },
    }),
    event(2, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Mara Veyr',
          summary: 'A memory thief with a royal debt.',
          context: 'She knows the empire is lying about its origin.',
          nodeType: 'actor',
          aliases: [],
          tags: ['protagonist'],
          status: 'active',
          linkedDefinitionKey: 'character:mara',
          source: 'ai',
          customProperties: { roleLabel: 'Protagonist' },
          metadata: {},
        },
      },
    }),
    event(3, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Ash Refuge',
          summary: 'A hidden archive beneath a burned city.',
          context: '',
          nodeType: 'place',
          aliases: [],
          tags: [],
          status: 'active',
          source: 'ai',
          customProperties: {},
          metadata: {},
        },
      },
    }),
    event(4, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'The Shadow Court',
          summary: 'Governors who tax memory to keep power.',
          context: '',
          nodeType: 'group',
          aliases: [],
          tags: [],
          status: 'active',
          source: 'ai',
          customProperties: {},
          metadata: {},
        },
      },
    }),
    event(5, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'The Tithe Mark',
          summary: 'An artifact that brands stolen memories.',
          context: '',
          nodeType: 'object',
          aliases: [],
          tags: [],
          status: 'active',
          source: 'ai',
          customProperties: {},
          metadata: {},
        },
      },
    }),
    event(6, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Memory Magic',
          summary: 'Memories can be traded, stolen, and sealed.',
          context: '',
          nodeType: 'concept',
          aliases: [],
          tags: [],
          status: 'active',
          source: 'ai',
          customProperties: {},
          metadata: {},
        },
      },
    }),
    event(7, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Episode 1: The Tithe Mark',
          summary: 'The first public memory tithe goes wrong.',
          context: '',
          nodeType: 'sequence_unit',
          aliases: [],
          tags: [],
          status: 'active',
          source: 'ai',
          customProperties: {
            sequence: {
              unitKind: 'episode',
              ordinal: 1,
              synopsis: 'Mara steals a tithe mark and exposes a forbidden archive.',
              outcome: 'Mara becomes the empire’s most wanted fugitive.',
              consequences: [{ cause: 'The theft succeeds', effect: 'The archive wakes' }],
            },
          },
          metadata: {},
        },
      },
    }),
    event(8, {
      op: 'upsert_relationship',
      payload: {
        targetRelationshipId: null,
        relationship: {
          sourceEntityKey: 'mara_veyr',
          targetEntityKey: 'ash_refuge',
          sourceRef: { name: 'Mara Veyr' },
          targetRef: { name: 'Ash Refuge' },
          verb: 'discovers',
          notes: 'The refuge becomes her first shelter.',
        },
      },
    }),
  ])

  assert.deepEqual(sections.map((section) => section.kind), [
    'overview',
    'characters',
    'locations',
    'factions',
    'artifacts',
    'lore',
    'storyBeats',
    'relationships',
  ])
  assert.equal(sections.find((section) => section.kind === 'characters')?.items[0].title, 'Mara Veyr')
  assert.equal(sections.find((section) => section.kind === 'storyBeats')?.items[0].ordinal, 1)
  assert.equal(
    sections.find((section) => section.kind === 'relationships')?.items[0].relationshipText,
    'Mara Veyr discovers Ash Refuge',
  )
})

test('buildSeedAssemblySections omits internal node fields from visible presentation items', () => {
  const sections = buildSeedAssemblySections([
    event(1, {
      op: 'upsert_entity',
      payload: {
        targetEntityKey: null,
        entity: {
          name: 'Mara Veyr',
          summary: 'A memory thief with a royal debt.',
          context: 'She knows the empire is lying about its origin.',
          nodeType: 'actor',
          aliases: [],
          tags: ['protagonist'],
          status: 'active',
          linkedDefinitionKey: 'character:mara_veyr',
          thumbnailAssetKey: 'asset-1',
          source: 'ai',
          customProperties: { roleLabel: 'Protagonist', internalKey: 'do-not-render' },
          metadata: { debug: 'hidden' },
        },
      },
    }),
  ])

  const item = sections[0].items[0]
  const visibleText = [
    item.title,
    item.subtitle,
    item.summary,
    item.roleLabel,
    item.outcome,
    item.relationshipText,
  ].filter(Boolean).join(' ')

  assert.equal(visibleText.includes('nodeType'), false)
  assert.equal(visibleText.includes('linkedDefinitionKey'), false)
  assert.equal(visibleText.includes('character:mara_veyr'), false)
  assert.equal(visibleText.includes('thumbnailAssetKey'), false)
  assert.equal(visibleText.includes('do-not-render'), false)
})
