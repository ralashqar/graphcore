import test from 'node:test'
import assert from 'node:assert/strict'

import {
  streamEntityRecordSchema,
  streamSequenceUnitRecordSchema,
} from './worldPrompt.ts'
import {
  mergeWorldEntityVisualDescriptionMetadata,
  readWorldEntityVisualDescription,
  readWorldEntityVisualIdentity,
  readWorldEntityVisualTraits,
  WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH,
} from './worldEntityVisuals.ts'
import type { WorldEntity } from './worldGraph.ts'

function entity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
  return {
    id: input.key,
    key: input.key,
    name: input.name,
    summary: input.summary ?? '',
    context: input.context ?? '',
    nodeType: input.nodeType,
    aliases: [],
    tags: input.tags ?? [],
    status: input.status ?? 'active',
    thumbnailAssetKey: input.thumbnailAssetKey ?? null,
    linkedDefinitionKey: input.linkedDefinitionKey ?? null,
    source: input.source ?? 'ai',
    customProperties: input.customProperties ?? {},
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

test('normalizes visual descriptions from canonical metadata and fallbacks', () => {
  const canonical = entity({
    key: 'actor.mara',
    name: 'Mara',
    nodeType: 'actor',
    summary: 'fallback summary',
    metadata: { visualDescription: `  ${'violet lantern '.repeat(40)}  ` },
  })
  const visualDescription = readWorldEntityVisualDescription(canonical)
  assert.equal(visualDescription.length <= WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH, true)
  assert.match(visualDescription, /^violet lantern/)

  assert.equal(readWorldEntityVisualDescription(entity({
    key: 'place.citadel',
    name: 'Citadel',
    nodeType: 'place',
    customProperties: { visual: { description: 'black stone citadel under pale moons' } },
  })), 'black stone citadel under pale moons')
})

test('composes structured neutral visual identity with traits', () => {
  const metadata = mergeWorldEntityVisualDescriptionMetadata({}, 'silver-haired archivist in an ash-black coat', {
    traits: ['late 20s', 'lean build', 'silver bob', 'grey eyes'],
    traitMap: {
      age: 'late 20s',
      build: 'lean build',
      hair: 'silver bob',
      eyes: 'grey eyes',
    },
  })
  const mara = entity({
    key: 'actor.mara',
    name: 'Mara',
    nodeType: 'actor',
    metadata,
  })

  assert.equal(
    readWorldEntityVisualDescription(mara),
    'silver-haired archivist in an ash-black coat Traits: late 20s, lean build, silver bob, grey eyes',
  )
  assert.deepEqual(readWorldEntityVisualTraits(mara), ['late 20s', 'lean build', 'silver bob', 'grey eyes'])
  assert.equal(readWorldEntityVisualIdentity(mara).description, 'silver-haired archivist in an ash-black coat')
})

test('visual identity normalization does not duplicate traits on repeat saves', () => {
  const once = mergeWorldEntityVisualDescriptionMetadata({}, 'silver-haired archivist Traits: late 20s, silver bob')
  const twice = mergeWorldEntityVisualDescriptionMetadata(once, once.visualDescription)
  const mara = entity({
    key: 'actor.mara',
    name: 'Mara',
    nodeType: 'actor',
    metadata: twice,
  })

  assert.deepEqual(readWorldEntityVisualTraits(mara), ['late 20s', 'silver bob'])
  assert.equal(readWorldEntityVisualDescription(mara), 'silver-haired archivist Traits: late 20s, silver bob')
})

test('compact stream records accept visualDescription and visualTraits for entities and sequence units', () => {
  const parsedEntity = streamEntityRecordSchema.parse({
    kind: 'entity',
    nodeType: 'actor',
    name: 'Mara',
    visualDescription: 'silver-haired archivist with a violet lantern',
    visualTraits: ['late 20s', 'silver bob'],
  }) as Record<string, unknown>
  assert.equal(parsedEntity.visualDescription, 'silver-haired archivist with a violet lantern')
  assert.deepEqual(parsedEntity.visualTraits, ['late 20s', 'silver bob'])

  assert.equal(streamSequenceUnitRecordSchema.parse({
    kind: 'sequence_unit',
    ordinal: 1,
    visualDescription: 'rain-slick plaza with shadow guards and glowing ledger pages',
  }).visualDescription, 'rain-slick plaza with shadow guards and glowing ledger pages')
})
