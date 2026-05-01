import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorldEntityIconCandidates,
  buildWorldEntityIconPrompt,
  resolveWorldEntityIconGridSize,
} from './worldEntityIconGeneration.ts'
import {
  streamEntityRecordSchema,
  streamSequenceUnitRecordSchema,
} from './worldPrompt.ts'
import {
  readWorldEntityVisualDescription,
  WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH,
} from './worldEntityVisuals.ts'
import type { DefinitionBase } from './graphcore.ts'
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

function definition(input: Partial<DefinitionBase> & Pick<DefinitionBase, 'key' | 'kind' | 'name'>): DefinitionBase {
  return {
    id: input.key,
    key: input.key,
    kind: input.kind,
    name: input.name,
    summary: input.summary ?? '',
    status: input.status ?? 'draft',
    iconAssetKey: input.iconAssetKey ?? null,
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
  }
}

test('resolves icon grid size up to 4x4', () => {
  assert.deepEqual(resolveWorldEntityIconGridSize(1), { rows: 1, cols: 1 })
  assert.deepEqual(resolveWorldEntityIconGridSize(4), { rows: 2, cols: 2 })
  assert.deepEqual(resolveWorldEntityIconGridSize(9), { rows: 3, cols: 3 })
  assert.deepEqual(resolveWorldEntityIconGridSize(16), { rows: 4, cols: 4 })
})

test('selects missing icon candidates in wiki priority order', () => {
  const entities = [
    entity({ key: 'place.citadel', name: 'Citadel', nodeType: 'place' }),
    entity({ key: 'actor.mara', name: 'Mara', nodeType: 'actor', metadata: { visualDescription: 'silver hair and archive robes' } }),
    entity({ key: 'group.scribes', name: 'Scribes', nodeType: 'group', thumbnailAssetKey: 'existing' }),
    entity({ key: 'object.ledger', name: 'Ledger', nodeType: 'object', linkedDefinitionKey: 'item.ledger' }),
    entity({ key: 'concept.memory', name: 'Memory Salt', nodeType: 'concept' }),
    entity({ key: 'sequence.01', name: 'Episode 1', nodeType: 'sequence_unit' }),
    entity({ key: 'event.coronation', name: 'Coronation', nodeType: 'event' }),
  ]
  const definitions = [
    definition({ key: 'item.ledger', kind: 'item', name: 'Ledger', iconAssetKey: 'item-icon' }),
  ]

  const candidates = buildWorldEntityIconCandidates({ entities, definitions, limit: 16 })

  assert.deepEqual(candidates.map((candidate) => candidate.entityKey), [
    'actor.mara',
    'place.citadel',
    'concept.memory',
    'sequence.01',
  ])
  assert.equal(candidates[0].visualPrompt, 'silver hair and archive robes')
})

test('builds compact visual-only row-major prompt', () => {
  const prompt = buildWorldEntityIconPrompt({
    candidates: [
      { entityKey: 'actor.mara', linkedDefinitionKey: null, name: 'Mara', nodeType: 'actor', summary: '', visualPrompt: 'archivist with a violet lantern', orderIndex: 0 },
      { entityKey: 'place.citadel', linkedDefinitionKey: null, name: 'Citadel', nodeType: 'place', summary: 'black stone fortress', visualPrompt: '', orderIndex: 1 },
    ],
    gridRows: 2,
    gridCols: 2,
    artStyle: {
      artStylePreset: 'Live-Action Cinematic',
      artStyleDescription: 'moody lensing and practical fantasy textures',
    } as never,
  })

  assert.match(prompt, /Style: Live-Action Cinematic/)
  assert.match(prompt, /Row 1, column 1: archivist with a violet lantern/)
  assert.match(prompt, /Row 1, column 2: black stone fortress/)
  assert.match(prompt, /No text, labels/)
  assert.doesNotMatch(prompt, /GraphCore/)
  assert.doesNotMatch(prompt, /world entit/i)
  assert.doesNotMatch(prompt, /\(actor\)|\(place\)/)
})

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

test('compact stream records accept visualDescription for entities and sequence units', () => {
  assert.equal(streamEntityRecordSchema.parse({
    kind: 'entity',
    nodeType: 'actor',
    name: 'Mara',
    visualDescription: 'silver-haired archivist with a violet lantern',
  }).visualDescription, 'silver-haired archivist with a violet lantern')

  assert.equal(streamSequenceUnitRecordSchema.parse({
    kind: 'sequence_unit',
    ordinal: 1,
    visualDescription: 'rain-slick plaza with shadow guards and glowing ledger pages',
  }).visualDescription, 'rain-slick plaza with shadow guards and glowing ledger pages')
})
