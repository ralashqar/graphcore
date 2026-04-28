import {
  worldEventTimelineMetadataSchema,
  worldRelationshipTemporalMetadataSchema,
  type WorldEntity,
  type WorldEventTimelineMetadata,
  type WorldRelationship,
  type WorldRelationshipTemporalMetadata,
  type WorldTemporalRelationshipKind,
} from './worldGraph.ts'

export type WorldTimelineTemporalRelationship = {
  key: string
  sourceEventKey: string
  targetEventKey: string
  kind: WorldTemporalRelationshipKind
  timelineKey: string
  certainty: WorldRelationshipTemporalMetadata['certainty']
  impliesChronology: boolean
  beforeEventKey: string | null
  afterEventKey: string | null
  relationship: WorldRelationship
}

export type WorldTimelineConflict = {
  kind: 'cycle' | 'invalid_endpoint' | 'self_reference'
  relationshipKey: string
  eventKeys: string[]
  message: string
}

export type WorldTimelineEventGroup = {
  index: number
  eventKeys: string[]
}

export type WorldTimelineModel = {
  events: WorldEntity[]
  orderedGroups: WorldTimelineEventGroup[]
  temporalRelationships: WorldTimelineTemporalRelationship[]
  floatingEventKeys: string[]
  conflicts: WorldTimelineConflict[]
  diagnostics: string[]
}

function looseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readWorldEventTimelineMetadata(entity: Pick<WorldEntity, 'customProperties' | 'metadata'>): WorldEventTimelineMetadata {
  const customTimeline = looseRecord(entity.customProperties).timeline
  const metadataTimeline = looseRecord(entity.metadata).timeline
  const parsed = worldEventTimelineMetadataSchema.safeParse({
    ...looseRecord(metadataTimeline),
    ...looseRecord(customTimeline),
  })
  return parsed.success ? parsed.data : {}
}

export function readWorldRelationshipTemporalMetadata(
  relationship: Pick<WorldRelationship, 'metadata'>,
): WorldRelationshipTemporalMetadata | null {
  const temporal = looseRecord(relationship.metadata).temporal
  const parsed = worldRelationshipTemporalMetadataSchema.safeParse(temporal)
  return parsed.success ? parsed.data : null
}

export function normalizeWorldRelationshipTemporalMetadata(
  relationship: Pick<WorldRelationship, 'sourceEntityKey' | 'targetEntityKey' | 'metadata'>,
) {
  const temporal = readWorldRelationshipTemporalMetadata(relationship)
  if (!temporal || temporal.kind !== 'after') {
    return {
      sourceEntityKey: relationship.sourceEntityKey,
      targetEntityKey: relationship.targetEntityKey,
      metadata: relationship.metadata,
      temporal,
      changed: false,
    }
  }

  const nextTemporal = {
    ...temporal,
    kind: 'before' as const,
    originalKind: temporal.originalKind ?? 'after' as const,
  }
  return {
    sourceEntityKey: relationship.targetEntityKey,
    targetEntityKey: relationship.sourceEntityKey,
    metadata: {
      ...looseRecord(relationship.metadata),
      temporal: nextTemporal,
    },
    temporal: nextTemporal,
    changed: true,
  }
}

function temporalRelationshipFromRelationship(
  relationship: WorldRelationship,
  entityByKey: Map<string, WorldEntity>,
): { temporalRelationship: WorldTimelineTemporalRelationship | null; conflict: WorldTimelineConflict | null } {
  const temporal = readWorldRelationshipTemporalMetadata(relationship)
  if (!temporal) return { temporalRelationship: null, conflict: null }

  const source = entityByKey.get(relationship.sourceEntityKey) ?? null
  const target = entityByKey.get(relationship.targetEntityKey) ?? null
  if (source?.nodeType !== 'event' || target?.nodeType !== 'event') {
    return {
      temporalRelationship: null,
      conflict: {
        kind: 'invalid_endpoint',
        relationshipKey: relationship.key,
        eventKeys: [relationship.sourceEntityKey, relationship.targetEntityKey],
        message: 'Temporal relationships must connect event nodes.',
      },
    }
  }
  if (relationship.sourceEntityKey === relationship.targetEntityKey) {
    return {
      temporalRelationship: null,
      conflict: {
        kind: 'self_reference',
        relationshipKey: relationship.key,
        eventKeys: [relationship.sourceEntityKey],
        message: 'Temporal relationships cannot point at the same event.',
      },
    }
  }

  const normalized = normalizeWorldRelationshipTemporalMetadata(relationship)
  const strict = normalized.temporal?.impliesChronology !== false
    && (normalized.temporal?.kind === 'before' || normalized.temporal?.kind === 'causes')
  return {
    temporalRelationship: {
      key: relationship.key,
      sourceEventKey: relationship.sourceEntityKey,
      targetEventKey: relationship.targetEntityKey,
      kind: temporal.kind,
      timelineKey: temporal.timelineKey ?? 'canon',
      certainty: temporal.certainty ?? 'explicit',
      impliesChronology: temporal.impliesChronology ?? true,
      beforeEventKey: strict ? normalized.sourceEntityKey : null,
      afterEventKey: strict ? normalized.targetEntityKey : null,
      relationship,
    },
    conflict: null,
  }
}

function eventSortValue(entity: WorldEntity) {
  const timeline = readWorldEventTimelineMetadata(entity)
  const sequenceHint = typeof timeline.sequenceHint === 'number' ? timeline.sequenceHint : Number.POSITIVE_INFINITY
  return {
    sequenceHint,
    era: timeline.era ?? '',
    timeLabel: timeline.timeLabel ?? '',
    name: entity.name,
    key: entity.key,
  }
}

function compareEvents(left: WorldEntity, right: WorldEntity) {
  const leftValue = eventSortValue(left)
  const rightValue = eventSortValue(right)
  if (leftValue.sequenceHint !== rightValue.sequenceHint) return leftValue.sequenceHint - rightValue.sequenceHint
  return leftValue.era.localeCompare(rightValue.era)
    || leftValue.timeLabel.localeCompare(rightValue.timeLabel)
    || leftValue.name.localeCompare(rightValue.name)
    || leftValue.key.localeCompare(rightValue.key)
}

function pathExists(adjacency: Map<string, Set<string>>, from: string, to: string) {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const key = stack.pop()
    if (!key || seen.has(key)) continue
    if (key === to) return true
    seen.add(key)
    for (const next of adjacency.get(key) ?? []) {
      stack.push(next)
    }
  }
  return false
}

export function wouldCreateWorldTimelineCycle(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  sourceEventKey: string
  targetEventKey: string
}) {
  if (input.sourceEventKey === input.targetEventKey) return true
  const eventKeys = new Set(input.entities.filter((entity) => entity.nodeType === 'event').map((entity) => entity.key))
  if (!eventKeys.has(input.sourceEventKey) || !eventKeys.has(input.targetEventKey)) return false
  const timeline = deriveWorldTimeline({
    entities: input.entities,
    relationships: input.relationships,
  })
  const adjacency = new Map<string, Set<string>>()
  for (const relationship of timeline.temporalRelationships) {
    if (!relationship.beforeEventKey || !relationship.afterEventKey) continue
    if (!adjacency.has(relationship.beforeEventKey)) adjacency.set(relationship.beforeEventKey, new Set())
    adjacency.get(relationship.beforeEventKey)!.add(relationship.afterEventKey)
  }
  return pathExists(adjacency, input.targetEventKey, input.sourceEventKey)
}

export function deriveWorldTimeline(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
}): WorldTimelineModel {
  const events = input.entities
    .filter((entity) => entity.nodeType === 'event' && entity.status !== 'archived')
    .sort(compareEvents)
  const entityByKey = new Map(input.entities.map((entity) => [entity.key, entity] as const))
  const eventByKey = new Map(events.map((event) => [event.key, event] as const))
  const temporalRelationships: WorldTimelineTemporalRelationship[] = []
  const conflicts: WorldTimelineConflict[] = []
  const adjacency = new Map<string, Set<string>>()
  const incomingCount = new Map<string, number>(events.map((event) => [event.key, 0]))

  for (const relationship of input.relationships) {
    const { temporalRelationship, conflict } = temporalRelationshipFromRelationship(relationship, entityByKey)
    if (conflict) conflicts.push(conflict)
    if (!temporalRelationship) continue
    temporalRelationships.push(temporalRelationship)
    if (!temporalRelationship.beforeEventKey || !temporalRelationship.afterEventKey) continue
    if (!eventByKey.has(temporalRelationship.beforeEventKey) || !eventByKey.has(temporalRelationship.afterEventKey)) continue
    if (pathExists(adjacency, temporalRelationship.afterEventKey, temporalRelationship.beforeEventKey)) {
      conflicts.push({
        kind: 'cycle',
        relationshipKey: relationship.key,
        eventKeys: [temporalRelationship.beforeEventKey, temporalRelationship.afterEventKey],
        message: 'Strict temporal relationship creates a cycle.',
      })
      continue
    }
    if (!adjacency.has(temporalRelationship.beforeEventKey)) adjacency.set(temporalRelationship.beforeEventKey, new Set())
    const outgoing = adjacency.get(temporalRelationship.beforeEventKey)!
    if (!outgoing.has(temporalRelationship.afterEventKey)) {
      outgoing.add(temporalRelationship.afterEventKey)
      incomingCount.set(temporalRelationship.afterEventKey, (incomingCount.get(temporalRelationship.afterEventKey) ?? 0) + 1)
    }
  }

  const orderedGroups: WorldTimelineEventGroup[] = []
  let available = events.filter((event) => (incomingCount.get(event.key) ?? 0) === 0)
  const emitted = new Set<string>()
  while (available.length > 0) {
    available = available.filter((event) => !emitted.has(event.key)).sort(compareEvents)
    if (available.length === 0) break
    const groupKeys = available.map((event) => event.key)
    orderedGroups.push({ index: orderedGroups.length, eventKeys: groupKeys })
    for (const event of available) {
      emitted.add(event.key)
      for (const nextKey of adjacency.get(event.key) ?? []) {
        incomingCount.set(nextKey, Math.max(0, (incomingCount.get(nextKey) ?? 0) - 1))
      }
    }
    available = events.filter((event) => !emitted.has(event.key) && (incomingCount.get(event.key) ?? 0) === 0)
  }

  const cyclicRemainder = events.filter((event) => !emitted.has(event.key)).sort(compareEvents)
  if (cyclicRemainder.length > 0) {
    orderedGroups.push({
      index: orderedGroups.length,
      eventKeys: cyclicRemainder.map((event) => event.key),
    })
  }

  const constrainedEventKeys = new Set<string>()
  for (const relationship of temporalRelationships) {
    constrainedEventKeys.add(relationship.sourceEventKey)
    constrainedEventKeys.add(relationship.targetEventKey)
  }
  const floatingEventKeys = events
    .filter((event) => !constrainedEventKeys.has(event.key))
    .map((event) => event.key)

  const diagnostics = [
    floatingEventKeys.length > 0 ? `${floatingEventKeys.length} event${floatingEventKeys.length === 1 ? '' : 's'} without temporal links.` : null,
    conflicts.length > 0 ? `${conflicts.length} temporal conflict${conflicts.length === 1 ? '' : 's'} detected.` : null,
  ].filter((value): value is string => Boolean(value))

  return {
    events,
    orderedGroups,
    temporalRelationships,
    floatingEventKeys,
    conflicts,
    diagnostics,
  }
}
