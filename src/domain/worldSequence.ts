import {
  worldSequenceMetadataSchema,
  type WorldEntity,
  type WorldRelationship,
  type WorldSequenceMetadata,
} from './worldGraph.ts'

export type WorldSequenceRelationshipKind = 'precedes' | 'causes' | 'complicates' | 'pays_off'

export type WorldSequenceUnit = {
  entity: WorldEntity
  metadata: WorldSequenceMetadata
  sequenceKey: string
  ordinal: number | null
  unitKind: string
}

export type WorldSequenceRelationship = {
  key: string
  sourceUnitKey: string
  targetUnitKey: string
  kind: WorldSequenceRelationshipKind
  relationship: WorldRelationship
}

export type WorldSequenceGroup = {
  sequenceKey: string
  units: WorldSequenceUnit[]
}

export type WorldSequenceGapKind =
  | 'missing_ordinal'
  | 'duplicate_ordinal'
  | 'missing_outcome'
  | 'missing_consequence'
  | 'missing_predecessor'
  | 'missing_successor'
  | 'weak_cause_effect_bridge'

export type WorldSequenceGap = {
  kind: WorldSequenceGapKind
  unitKeys: string[]
  sequenceKey: string
  message: string
}

export type WorldSequenceModel = {
  units: WorldSequenceUnit[]
  groups: WorldSequenceGroup[]
  relationships: WorldSequenceRelationship[]
  gaps: WorldSequenceGap[]
  diagnostics: string[]
}

const SEQUENCE_RELATIONSHIP_VERBS = new Set<WorldSequenceRelationshipKind>([
  'precedes',
  'causes',
  'complicates',
  'pays_off',
])

function looseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeVerb(value: string): WorldSequenceRelationshipKind | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'pays_off' || normalized === 'payoff' || normalized === 'pays off') return 'pays_off'
  if (SEQUENCE_RELATIONSHIP_VERBS.has(normalized as WorldSequenceRelationshipKind)) {
    return normalized as WorldSequenceRelationshipKind
  }
  return null
}

export function readWorldSequenceMetadata(entity: Pick<WorldEntity, 'customProperties' | 'metadata'>): WorldSequenceMetadata {
  const customSequence = looseRecord(entity.customProperties).sequence
  const metadataSequence = looseRecord(entity.metadata).sequence
  const parsed = worldSequenceMetadataSchema.safeParse({
    ...looseRecord(metadataSequence),
    ...looseRecord(customSequence),
  })
  return parsed.success ? parsed.data : {}
}

function compareSequenceUnits(left: WorldSequenceUnit, right: WorldSequenceUnit) {
  if (left.sequenceKey !== right.sequenceKey) return left.sequenceKey.localeCompare(right.sequenceKey)
  const leftOrdinal = typeof left.ordinal === 'number' ? left.ordinal : Number.POSITIVE_INFINITY
  const rightOrdinal = typeof right.ordinal === 'number' ? right.ordinal : Number.POSITIVE_INFINITY
  if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal
  return left.entity.name.localeCompare(right.entity.name) || left.entity.key.localeCompare(right.entity.key)
}

function hasOutcome(unit: WorldSequenceUnit) {
  return Boolean(readString(unit.metadata.outcome) || readString(unit.entity.summary))
}

function hasConsequenceOrArc(unit: WorldSequenceUnit) {
  const consequences = unit.metadata.consequences ?? []
  const arcDeltas = unit.metadata.characterArcDeltas ?? []
  return consequences.some((entry) => readString(entry.cause) && readString(entry.effect))
    || arcDeltas.some((entry) => readString(entry.actorKey) && (readString(entry.before) || readString(entry.after) || readString(entry.choice)))
}

function relationshipKeyBetween(sourceUnitKey: string, targetUnitKey: string) {
  return `${sourceUnitKey}->${targetUnitKey}`
}

export function deriveWorldSequence(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
}): WorldSequenceModel {
  const units = input.entities
    .filter((entity) => entity.nodeType === 'sequence_unit' && entity.status !== 'archived')
    .map((entity): WorldSequenceUnit => {
      const metadata = readWorldSequenceMetadata(entity)
      return {
        entity,
        metadata,
        sequenceKey: readString(metadata.sequenceKey) || 'main',
        ordinal: typeof metadata.ordinal === 'number' && Number.isFinite(metadata.ordinal) ? metadata.ordinal : null,
        unitKind: readString(metadata.unitKind) || 'chapter',
      }
    })
    .sort(compareSequenceUnits)
  const unitByKey = new Map(units.map((unit) => [unit.entity.key, unit] as const))
  const relationships: WorldSequenceRelationship[] = []
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const sequenceLinkKeys = new Set<string>()

  for (const relationship of input.relationships) {
    const kind = normalizeVerb(relationship.verb)
    if (!kind) continue
    if (!unitByKey.has(relationship.sourceEntityKey) || !unitByKey.has(relationship.targetEntityKey)) continue
    relationships.push({
      key: relationship.key,
      sourceUnitKey: relationship.sourceEntityKey,
      targetUnitKey: relationship.targetEntityKey,
      kind,
      relationship,
    })
    outgoing.set(relationship.sourceEntityKey, (outgoing.get(relationship.sourceEntityKey) ?? 0) + 1)
    incoming.set(relationship.targetEntityKey, (incoming.get(relationship.targetEntityKey) ?? 0) + 1)
    sequenceLinkKeys.add(relationshipKeyBetween(relationship.sourceEntityKey, relationship.targetEntityKey))
  }

  const groupsBySequence = new Map<string, WorldSequenceUnit[]>()
  for (const unit of units) {
    groupsBySequence.set(unit.sequenceKey, [...(groupsBySequence.get(unit.sequenceKey) ?? []), unit])
  }
  const groups = [...groupsBySequence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sequenceKey, groupUnits]) => ({
      sequenceKey,
      units: groupUnits.sort(compareSequenceUnits),
    }))

  const gaps: WorldSequenceGap[] = []
  for (const group of groups) {
    const ordinals = new Map<number, WorldSequenceUnit[]>()
    for (const unit of group.units) {
      if (unit.ordinal === null) {
        gaps.push({
          kind: 'missing_ordinal',
          unitKeys: [unit.entity.key],
          sequenceKey: group.sequenceKey,
          message: `${unit.entity.name} is missing a sequence ordinal.`,
        })
      } else {
        ordinals.set(unit.ordinal, [...(ordinals.get(unit.ordinal) ?? []), unit])
      }
      if (!hasOutcome(unit)) {
        gaps.push({
          kind: 'missing_outcome',
          unitKeys: [unit.entity.key],
          sequenceKey: group.sequenceKey,
          message: `${unit.entity.name} needs an outcome.`,
        })
      }
      if (!hasConsequenceOrArc(unit)) {
        gaps.push({
          kind: 'missing_consequence',
          unitKeys: [unit.entity.key],
          sequenceKey: group.sequenceKey,
          message: `${unit.entity.name} needs a cause/effect consequence or character arc delta.`,
        })
      }
    }

    for (const [ordinal, duplicateUnits] of ordinals) {
      if (duplicateUnits.length > 1) {
        gaps.push({
          kind: 'duplicate_ordinal',
          unitKeys: duplicateUnits.map((unit) => unit.entity.key),
          sequenceKey: group.sequenceKey,
          message: `${duplicateUnits.length} sequence units share ordinal ${ordinal}.`,
        })
      }
    }

    if (group.units.length > 1) {
      group.units.forEach((unit, index) => {
        if (index > 0 && (incoming.get(unit.entity.key) ?? 0) === 0) {
          gaps.push({
            kind: 'missing_predecessor',
            unitKeys: [unit.entity.key],
            sequenceKey: group.sequenceKey,
            message: `${unit.entity.name} has no predecessor link.`,
          })
        }
        if (index < group.units.length - 1 && (outgoing.get(unit.entity.key) ?? 0) === 0) {
          gaps.push({
            kind: 'missing_successor',
            unitKeys: [unit.entity.key],
            sequenceKey: group.sequenceKey,
            message: `${unit.entity.name} has no successor link.`,
          })
        }
        const next = group.units[index + 1]
        if (next && !sequenceLinkKeys.has(relationshipKeyBetween(unit.entity.key, next.entity.key))) {
          gaps.push({
            kind: 'weak_cause_effect_bridge',
            unitKeys: [unit.entity.key, next.entity.key],
            sequenceKey: group.sequenceKey,
            message: `${unit.entity.name} does not yet have a direct cause/effect bridge into ${next.entity.name}.`,
          })
        }
      })
    }
  }

  const diagnostics = [
    units.length > 0 ? `${units.length} authored sequence unit${units.length === 1 ? '' : 's'} in the story flow.` : 'No authored sequence units yet.',
    gaps.length > 0 ? `${gaps.length} sequence gap${gaps.length === 1 ? '' : 's'} detected.` : null,
  ].filter((value): value is string => Boolean(value))

  return {
    units,
    groups,
    relationships,
    gaps,
    diagnostics,
  }
}
