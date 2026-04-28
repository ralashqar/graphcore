import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldEntity, WorldRelationship } from './worldGraph.ts'
import {
  deriveWorldTimeline,
  normalizeWorldRelationshipTemporalMetadata,
  wouldCreateWorldTimelineCycle,
} from './worldTimeline.ts'

function event(key: string, name: string, timeline?: Record<string, unknown>): WorldEntity {
  return {
    id: key,
    key,
    name,
    summary: '',
    context: '',
    nodeType: 'event',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'user',
    customProperties: timeline ? { timeline } : {},
    metadata: {},
  }
}

function actor(key: string, name: string): WorldEntity {
  return {
    ...event(key, name),
    nodeType: 'actor',
  }
}

function relationship(
  key: string,
  sourceEntityKey: string,
  targetEntityKey: string,
  kind: 'before' | 'after' | 'during' | 'overlaps' | 'causes',
): WorldRelationship {
  return {
    id: key,
    key,
    sourceEntityKey,
    targetEntityKey,
    verb: kind,
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'user',
    notes: '',
    state: 'confirmed',
    metadata: {
      temporal: {
        kind,
        timelineKey: 'canon',
        certainty: 'explicit',
        impliesChronology: true,
      },
    },
  }
}

test('deriveWorldTimeline orders a simple before chain', () => {
  const first = event('world.event.first', 'First')
  const second = event('world.event.second', 'Second')
  const third = event('world.event.third', 'Third')
  const timeline = deriveWorldTimeline({
    entities: [third, second, first],
    relationships: [
      relationship('r1', first.key, second.key, 'before'),
      relationship('r2', second.key, third.key, 'before'),
    ],
  })

  assert.deepEqual(timeline.orderedGroups.map((group) => group.eventKeys), [
    [first.key],
    [second.key],
    [third.key],
  ])
})

test('deriveWorldTimeline keeps partial branches and floating events visible', () => {
  const a = event('world.event.a', 'A')
  const b = event('world.event.b', 'B')
  const c = event('world.event.c', 'C')
  const floating = event('world.event.floating', 'Floating')
  const timeline = deriveWorldTimeline({
    entities: [floating, c, b, a],
    relationships: [
      relationship('r1', a.key, b.key, 'before'),
      relationship('r2', a.key, c.key, 'before'),
    ],
  })

  assert.deepEqual(timeline.orderedGroups[0]?.eventKeys, [a.key, floating.key])
  assert.deepEqual(new Set(timeline.orderedGroups[1]?.eventKeys), new Set([b.key, c.key]))
  assert.deepEqual(timeline.floatingEventKeys, [floating.key])
})

test('normalizeWorldRelationshipTemporalMetadata converts after to canonical before ordering', () => {
  const rel = relationship('r-after', 'world.event.later', 'world.event.earlier', 'after')
  const normalized = normalizeWorldRelationshipTemporalMetadata(rel)

  assert.equal(normalized.sourceEntityKey, 'world.event.earlier')
  assert.equal(normalized.targetEntityKey, 'world.event.later')
  assert.equal(normalized.temporal?.kind, 'before')
  assert.equal(normalized.temporal?.originalKind, 'after')
})

test('deriveWorldTimeline reports cycles and does not let non-strict relations force order', () => {
  const a = event('world.event.a', 'A')
  const b = event('world.event.b', 'B')
  const c = event('world.event.c', 'C')
  const overlap = relationship('r-overlap', b.key, c.key, 'overlaps')
  const timeline = deriveWorldTimeline({
    entities: [a, b, c],
    relationships: [
      relationship('r1', a.key, b.key, 'before'),
      relationship('r2', b.key, a.key, 'before'),
      overlap,
    ],
  })

  assert.ok(timeline.conflicts.some((conflict) => conflict.kind === 'cycle' && conflict.relationshipKey === 'r2'))
  assert.equal(timeline.temporalRelationships.find((entry) => entry.key === overlap.key)?.beforeEventKey, null)
})

test('wouldCreateWorldTimelineCycle catches new strict edges before they are applied', () => {
  const a = event('world.event.a', 'A')
  const b = event('world.event.b', 'B')
  assert.equal(wouldCreateWorldTimelineCycle({
    entities: [a, b],
    relationships: [relationship('r1', a.key, b.key, 'before')],
    sourceEventKey: b.key,
    targetEventKey: a.key,
  }), true)
})

test('deriveWorldTimeline reports temporal relationships with non-event endpoints', () => {
  const a = actor('world.actor.a', 'Actor A')
  const b = event('world.event.b', 'B')
  const timeline = deriveWorldTimeline({
    entities: [a, b],
    relationships: [relationship('r1', a.key, b.key, 'before')],
  })

  assert.equal(timeline.temporalRelationships.length, 0)
  assert.equal(timeline.conflicts[0]?.kind, 'invalid_endpoint')
})
