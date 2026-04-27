import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldEntity, WorldRelationship } from './worldGraph.ts'
import {
  ambiguityCandidatesFromHits,
  buildWorldPromptAtlasIndex,
  findWorldPromptAtlasEntityHits,
} from './worldPromptContext.ts'

function entity(key: string, name: string, nodeType: WorldEntity['nodeType'], extras: Partial<WorldEntity> = {}): WorldEntity {
  return {
    id: key,
    key,
    name,
    summary: extras.summary ?? `${name} summary should not enter atlas rows`,
    context: extras.context ?? `${name} context should not enter atlas rows`,
    nodeType,
    aliases: extras.aliases ?? [],
    tags: extras.tags ?? [],
    status: extras.status ?? 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'user',
    customProperties: {},
    metadata: {},
  }
}

function relationship(key: string, sourceEntityKey: string, targetEntityKey: string): WorldRelationship {
  return {
    id: key,
    key,
    sourceEntityKey,
    targetEntityKey,
    verb: 'linked to',
    direction: 'outbound',
    strength: 0.7,
    confidence: 0.8,
    source: 'user',
    notes: '',
    state: 'confirmed',
    metadata: {},
  }
}

test('buildWorldPromptAtlasIndex includes compact entity rows without rich lore fields', () => {
  const atlas = buildWorldPromptAtlasIndex({
    entities: [
      entity('world.actor.yara', 'Yara', 'actor', { aliases: ['Mirror Heir'], tags: ['heir'] }),
      entity('world.place.capital', 'The Capital', 'place'),
    ],
    relationships: [relationship('world.rel.yara-capital', 'world.actor.yara', 'world.place.capital')],
  })

  assert.equal(atlas.totalEntityCount, 2)
  assert.equal(atlas.omittedEntityCount, 0)
  assert.deepEqual(atlas.entityTypeCounts, { actor: 1, place: 1 })
  const yaraRow = atlas.entities.find((row) => row.key === 'world.actor.yara')
  assert.ok(yaraRow)
  assert.equal('summary' in yaraRow, false)
  assert.equal('context' in yaraRow, false)
})

test('buildWorldPromptAtlasIndex caps large worlds and keeps type counts', () => {
  const entities = Array.from({ length: 8 }, (_, index) => entity(`world.actor.${index}`, `Actor ${index}`, 'actor'))
  const atlas = buildWorldPromptAtlasIndex({
    entities,
    relationships: [],
    maxEntities: 3,
  })

  assert.equal(atlas.entities.length, 3)
  assert.equal(atlas.totalEntityCount, 8)
  assert.equal(atlas.omittedEntityCount, 5)
  assert.equal(atlas.capped, true)
  assert.equal(atlas.entityTypeCounts.actor, 8)
})

test('findWorldPromptAtlasEntityHits retrieves misspelled proper nouns', () => {
  const atlas = buildWorldPromptAtlasIndex({
    entities: [
      entity('world.group.house-veyr', 'House Veyr', 'group'),
      entity('world.place.silver-court', 'Silver Court', 'place'),
    ],
    relationships: [relationship('world.rel.veyr-court', 'world.group.house-veyr', 'world.place.silver-court')],
  })

  const hits = findWorldPromptAtlasEntityHits({
    prompt: 'add a traitor inside Hous Veyr',
    atlas,
  })

  assert.equal(hits[0]?.key, 'world.group.house-veyr')
  assert.equal(hits[0]?.reason, 'fuzzy_match')
})

test('findWorldPromptAtlasEntityHits handles aliases as first-class matches', () => {
  const atlas = buildWorldPromptAtlasIndex({
    entities: [
      entity('world.object.veil-mirror', 'The Veil Mirror', 'object', { aliases: ['the forbidden glass'] }),
    ],
    relationships: [],
  })

  const hits = findWorldPromptAtlasEntityHits({
    prompt: 'connect the forbidden glass to the succession crisis',
    atlas,
  })

  assert.equal(hits[0]?.key, 'world.object.veil-mirror')
  assert.equal(hits[0]?.reason, 'alias_match')
})

test('ambiguityCandidatesFromHits exposes close fuzzy candidates', () => {
  const candidates = ambiguityCandidatesFromHits([
    {
      key: 'world.group.house-veyr',
      kind: 'entity',
      reason: 'fuzzy_match',
      score: 7.5,
      label: 'House Veyr',
      matchedText: 'house vey',
    },
    {
      key: 'world.group.house-veyre',
      kind: 'entity',
      reason: 'fuzzy_match',
      score: 7.1,
      label: 'House Veyre',
      matchedText: 'house vey',
    },
    {
      key: 'world.place.capital',
      kind: 'entity',
      reason: 'fuzzy_match',
      score: 5.9,
      label: 'The Capital',
      matchedText: 'capital',
    },
  ])

  assert.ok(candidates.some((candidate) => candidate.key === 'world.group.house-veyr'))
  assert.ok(candidates.some((candidate) => candidate.key === 'world.group.house-veyre'))
  assert.equal(candidates.some((candidate) => candidate.key === 'world.place.capital'), false)
})
