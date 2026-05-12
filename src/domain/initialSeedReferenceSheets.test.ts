import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInitialSeedEntityReferenceSheetCandidates,
  canQueueInitialSeedEntityReferenceSheet,
} from './initialSeedReferenceSheets.ts'
import type { WorldEntity } from './worldGraph.ts'

function entity(overrides: Partial<WorldEntity> = {}): WorldEntity {
  return {
    id: overrides.id ?? 'entity-1',
    key: overrides.key ?? 'actor_1',
    name: overrides.name ?? 'Mara Vale',
    summary: overrides.summary ?? 'A courier with a silver weatherproof cloak.',
    context: overrides.context ?? '',
    nodeType: overrides.nodeType ?? 'actor',
    aliases: overrides.aliases ?? [],
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'active',
    thumbnailAssetKey: overrides.thumbnailAssetKey ?? null,
    linkedDefinitionKey: overrides.linkedDefinitionKey ?? null,
    source: overrides.source ?? 'ai',
    customProperties: overrides.customProperties ?? {},
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-05-12T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-12T00:00:00.000Z',
  }
}

test('queues eligible initial seed entities for reference sheets', () => {
  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity(),
    activeJobs: [],
  }), true)
})

test('skips archived entities and entities with existing reference sheets', () => {
  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity({ status: 'archived' }),
    activeJobs: [],
  }), false)

  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity({ metadata: { referenceSheetAssetKey: 'sheet_actor_1' } }),
    activeJobs: [],
  }), false)
})

test('skips lore concepts and sequence units because they use final grid imagery', () => {
  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity({ key: 'concept_1', nodeType: 'concept' }),
    activeJobs: [],
  }), false)

  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity({ key: 'sequence_1', nodeType: 'sequence_unit' }),
    activeJobs: [],
  }), false)
})

test('skips entities already targeted by active reference sheet jobs', () => {
  assert.equal(canQueueInitialSeedEntityReferenceSheet({
    entity: entity({ key: 'actor_1' }),
    activeJobs: [{
      kind: 'entity_reference_sheet',
      status: 'running',
      targetKeys: { entityKey: 'actor_1' },
      input: {},
    }],
  }), false)
})

test('candidate builder filters only queueable entities', () => {
  const candidates = buildInitialSeedEntityReferenceSheetCandidates({
    entities: [
      entity({ key: 'actor_1' }),
      entity({ key: 'actor_2', metadata: { referenceSheetAssetKey: 'sheet_actor_2' } }),
      entity({ key: 'place_1', nodeType: 'place', summary: 'A glass observatory above the stormline.' }),
    ],
    activeJobs: [{
      kind: 'entity_reference_sheet',
      status: 'queued',
      targetKeys: { entityKey: 'place_1' },
      input: {},
    }],
  })

  assert.deepEqual(candidates.map((candidate) => candidate.key), ['actor_1'])
})
