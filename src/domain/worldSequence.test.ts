import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldEntity, WorldRelationship } from './worldGraph.ts'
import { deriveWorldSequence } from './worldSequence.ts'
import { deriveWorldTimeline } from './worldTimeline.ts'

function entity(input: {
  key: string
  name: string
  nodeType: WorldEntity['nodeType']
  sequence?: Record<string, unknown>
}): WorldEntity {
  return {
    id: input.key,
    key: input.key,
    name: input.name,
    summary: '',
    context: '',
    nodeType: input.nodeType,
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'user',
    customProperties: input.sequence ? { sequence: input.sequence } : {},
    metadata: {},
  }
}

function sequenceUnit(key: string, name: string, ordinal: number | null, extras: Record<string, unknown> = {}) {
  return entity({
    key,
    name,
    nodeType: 'sequence_unit',
    sequence: {
      unitKind: 'chapter',
      sequenceKey: 'main',
      ordinal,
      synopsis: `${name} synopsis.`,
      outcome: `${name} outcome.`,
      consequences: [{ cause: `${name} cause.`, effect: `${name} effect.`, consequenceType: 'plot' }],
      ...extras,
    },
  })
}

function relationship(
  key: string,
  sourceEntityKey: string,
  targetEntityKey: string,
  verb: string,
  metadata: Record<string, unknown> = {},
): WorldRelationship {
  return {
    id: key,
    key,
    sourceEntityKey,
    targetEntityKey,
    verb,
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'user',
    notes: '',
    state: 'confirmed',
    metadata,
  }
}

test('deriveWorldSequence orders sequence units by sequence key and ordinal', () => {
  const first = sequenceUnit('world.sequence.first', 'First Chapter', 1)
  const second = sequenceUnit('world.sequence.second', 'Second Chapter', 2)
  const third = sequenceUnit('world.sequence.third', 'Third Chapter', 3)
  const sequence = deriveWorldSequence({
    entities: [third, first, second],
    relationships: [
      relationship('r1', first.key, second.key, 'causes'),
      relationship('r2', second.key, third.key, 'precedes'),
    ],
  })

  assert.deepEqual(sequence.groups[0]?.units.map((unit) => unit.entity.key), [first.key, second.key, third.key])
  assert.equal(sequence.relationships.length, 2)
})

test('deriveWorldSequence reports missing and duplicate ordinal gaps', () => {
  const first = sequenceUnit('world.sequence.first', 'First Chapter', 1)
  const duplicate = sequenceUnit('world.sequence.duplicate', 'Duplicate Chapter', 1)
  const floating = sequenceUnit('world.sequence.floating', 'Floating Chapter', null)
  const sequence = deriveWorldSequence({
    entities: [first, duplicate, floating],
    relationships: [],
  })

  assert.ok(sequence.gaps.some((gap) => gap.kind === 'duplicate_ordinal'))
  assert.ok(sequence.gaps.some((gap) => gap.kind === 'missing_ordinal' && gap.unitKeys.includes(floating.key)))
})

test('deriveWorldSequence flags chapters without outcome or consequence', () => {
  const thin = sequenceUnit('world.sequence.thin', 'Thin Chapter', 1, {
    outcome: '',
    consequences: [],
    characterArcDeltas: [],
  })
  const sequence = deriveWorldSequence({
    entities: [thin],
    relationships: [],
  })

  assert.ok(sequence.gaps.some((gap) => gap.kind === 'missing_outcome'))
  assert.ok(sequence.gaps.some((gap) => gap.kind === 'missing_consequence'))
})

test('sequence causal links do not affect event timeline ordering', () => {
  const chapter = sequenceUnit('world.sequence.chapter', 'Chapter', 1)
  const eventA = entity({ key: 'world.event.a', name: 'Event A', nodeType: 'event' })
  const eventB = entity({ key: 'world.event.b', name: 'Event B', nodeType: 'event' })
  const timeline = deriveWorldTimeline({
    entities: [chapter, eventA, eventB],
    relationships: [
      relationship('sequence-causes-event', chapter.key, eventB.key, 'causes'),
      relationship('event-before-event', eventA.key, eventB.key, 'before', {
        temporal: {
          kind: 'before',
          timelineKey: 'canon',
          certainty: 'explicit',
          impliesChronology: true,
        },
      }),
    ],
  })

  assert.deepEqual(timeline.orderedGroups.map((group) => group.eventKeys), [[eventA.key], [eventB.key]])
  assert.equal(timeline.conflicts.some((conflict) => conflict.relationshipKey === 'sequence-causes-event'), false)
})
