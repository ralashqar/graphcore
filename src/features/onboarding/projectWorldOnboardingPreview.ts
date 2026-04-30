import type { EntityIconId } from '../../shared/entityIcons'
import {
  worldPromptEventPayloadSchema,
  type WorldPromptEvent,
} from '../../domain/worldPrompt.ts'

type SeedPreviewField = {
  label: string
  value: string
}

type SeedPreviewList = {
  label: string
  values: string[]
}

export type SeedGeneratedPreviewCard =
  | {
    id: string
    kind: 'overview'
    icon: EntityIconId
    title: string
    subtitle: string
    summary: string
    fields: SeedPreviewField[]
    lists: SeedPreviewList[]
    sequence: number
    createdAt: string
  }
  | {
    id: string
    kind: 'entity'
    icon: EntityIconId
    title: string
    subtitle: string
    summary: string
    context: string
    fields: SeedPreviewField[]
    lists: SeedPreviewList[]
    sequence: number
    createdAt: string
  }
  | {
    id: string
    kind: 'sequence_unit'
    icon: EntityIconId
    title: string
    subtitle: string
    summary: string
    context: string
    ordinal: number | null
    fields: SeedPreviewField[]
    lists: SeedPreviewList[]
    sequence: number
    createdAt: string
  }
  | {
    id: string
    kind: 'relationship'
    icon: EntityIconId
    title: string
    subtitle: string
    summary: string
    fields: SeedPreviewField[]
    sequence: number
    createdAt: string
  }

function formatPreviewLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function compactWhitespace(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizePreviewText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return normalizePreviewText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(formatPreviewValue).filter(Boolean).join('\n')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const formatted = formatPreviewValue(entryValue)
        return formatted ? `${formatPreviewLabel(key)}: ${formatted}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => formatPreviewValue(entry)).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => compactWhitespace(entry)).filter(Boolean)
  }
  return []
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nodeTypeIcon(nodeType: string | null | undefined): EntityIconId {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    case 'group':
      return 'group'
    case 'concept':
      return 'concept'
    case 'event':
    case 'sequence_unit':
      return 'event'
    default:
      return 'content'
  }
}

function pushField(fields: SeedPreviewField[], label: string, value: unknown) {
  const text = formatPreviewValue(value)
  if (text) fields.push({ label, value: text })
}

function pushRecordFields(
  fields: SeedPreviewField[],
  record: Record<string, unknown>,
  options: { exclude?: string[]; prefix?: string } = {},
) {
  const exclude = new Set(options.exclude ?? [])
  for (const [key, value] of Object.entries(record)) {
    if (exclude.has(key)) continue
    pushField(fields, options.prefix ? `${options.prefix}: ${formatPreviewLabel(key)}` : formatPreviewLabel(key), value)
  }
}

function pushList(lists: SeedPreviewList[], label: string, value: unknown) {
  const values = readStringList(value)
  if (values.length > 0) lists.push({ label, values })
}

function sequenceFieldValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => {
      if (Array.isArray(entryValue)) return entryValue.length > 0
      return formatPreviewValue(entryValue)
    })
    .map(([key, entryValue]) => {
      const text = formatPreviewValue(entryValue)
      return text ? `${formatPreviewLabel(key)}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function buildOverviewCard(event: WorldPromptEvent, metadata: Record<string, unknown>): SeedGeneratedPreviewCard {
  const fields: SeedPreviewField[] = []
  const lists: SeedPreviewList[] = []
  pushField(fields, 'Logline', metadata.logline)
  pushField(fields, 'Synopsis', metadata.synopsis)
  pushField(fields, 'Genre', Array.isArray(metadata.genre) ? metadata.genre.join(', ') : metadata.genre)
  pushField(fields, 'Core conflict', metadata.coreConflict)
  pushList(lists, 'Themes', metadata.themes)
  pushList(lists, 'Tone', metadata.toneTags)
  pushList(lists, 'Visual motifs', metadata.visualMotifs)
  pushList(lists, 'Section order', metadata.sectionOrder)
  const wikiSections = readRecord(metadata.wikiSections)
  for (const [section, value] of Object.entries(wikiSections)) {
    pushField(fields, `Section: ${formatPreviewLabel(section)}`, value)
  }
  pushRecordFields(fields, metadata, {
    exclude: [
      'title',
      'logline',
      'synopsis',
      'genre',
      'coreConflict',
      'themes',
      'toneTags',
      'visualMotifs',
      'sectionOrder',
      'wikiSections',
    ],
  })
  return {
    id: `overview-${event.id}`,
    kind: 'overview',
    icon: 'content',
    title: compactWhitespace(metadata.title) || 'World overview',
    subtitle: 'Project metadata',
    summary: compactWhitespace(metadata.logline) || compactWhitespace(metadata.synopsis),
    fields,
    lists,
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildEntityCard(event: WorldPromptEvent, entity: Record<string, unknown>): SeedGeneratedPreviewCard {
  const nodeType = compactWhitespace(entity.nodeType)
  const customProperties = readRecord(entity.customProperties)
  const sequence = readRecord(customProperties.sequence)
  if (nodeType === 'sequence_unit' || Object.keys(sequence).length > 0) {
    return buildSequenceUnitCard(event, entity, sequence)
  }

  const fields: SeedPreviewField[] = []
  const lists: SeedPreviewList[] = []
  pushField(fields, 'Node type', nodeType)
  pushField(fields, 'Role', customProperties.roleLabel ?? readRecord(entity.metadata).roleLabel)
  pushField(fields, 'Status', entity.status)
  pushField(fields, 'Source', entity.source)
  pushField(fields, 'Linked definition', entity.linkedDefinitionKey)
  pushField(fields, 'Thumbnail asset', entity.thumbnailAssetKey)
  pushRecordFields(fields, customProperties, { exclude: ['roleLabel'] })
  pushRecordFields(fields, readRecord(entity.metadata), { exclude: ['roleLabel'], prefix: 'Metadata' })
  pushRecordFields(fields, entity, {
    prefix: 'Node',
    exclude: [
      'name',
      'summary',
      'context',
      'nodeType',
      'aliases',
      'tags',
      'status',
      'source',
      'linkedDefinitionKey',
      'thumbnailAssetKey',
      'customProperties',
      'metadata',
    ],
  })
  pushList(lists, 'Aliases', entity.aliases)
  pushList(lists, 'Tags', entity.tags)
  return {
    id: `entity-${event.id}`,
    kind: 'entity',
    icon: nodeTypeIcon(nodeType),
    title: compactWhitespace(entity.name) || 'Generated entity',
    subtitle: formatPreviewLabel(nodeType || 'entity'),
    summary: compactWhitespace(entity.summary),
    context: compactWhitespace(entity.context),
    fields,
    lists,
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildSequenceUnitCard(
  event: WorldPromptEvent,
  entity: Record<string, unknown>,
  sequence: Record<string, unknown>,
): SeedGeneratedPreviewCard {
  const fields: SeedPreviewField[] = []
  const lists: SeedPreviewList[] = []
  const customProperties = readRecord(entity.customProperties)
  const metadata = readRecord(entity.metadata)
  const ordinal = typeof sequence.ordinal === 'number' ? sequence.ordinal : null
  pushField(fields, 'Unit kind', sequence.unitKind)
  pushField(fields, 'Sequence key', sequence.sequenceKey)
  pushField(fields, 'Ordinal', sequence.ordinal)
  pushField(fields, 'Act', sequence.actLabel)
  pushField(fields, 'Dramatic question', sequence.dramaticQuestion)
  pushField(fields, 'Story function', sequence.storyFunction ? formatPreviewLabel(compactWhitespace(sequence.storyFunction)) : '')
  pushField(fields, 'Outcome', sequence.outcome)
  pushField(fields, 'Script expansion ready', sequence.scriptExpansionReady)
  pushRecordFields(fields, sequence, {
    prefix: 'Sequence',
    exclude: [
      'unitKind',
      'sequenceKey',
      'ordinal',
      'actLabel',
      'synopsis',
      'dramaticQuestion',
      'storyFunction',
      'outcome',
      'scriptExpansionReady',
      'consequences',
      'characterArcDeltas',
      'openLoops',
      'resolvedLoops',
    ],
  })
  const consequences = Array.isArray(sequence.consequences)
    ? sequence.consequences.map(sequenceFieldValue).filter(Boolean)
    : []
  const characterArcDeltas = Array.isArray(sequence.characterArcDeltas)
    ? sequence.characterArcDeltas.map(sequenceFieldValue).filter(Boolean)
    : []
  if (consequences.length > 0) lists.push({ label: 'Consequences', values: consequences })
  if (characterArcDeltas.length > 0) lists.push({ label: 'Character arc deltas', values: characterArcDeltas })
  pushList(lists, 'Open loops', sequence.openLoops)
  pushList(lists, 'Resolved loops', sequence.resolvedLoops)
  pushList(lists, 'Tags', entity.tags)
  if (sequence.scriptExpansionReady === true) lists.push({ label: 'Readiness', values: ['Script expansion ready'] })
  pushRecordFields(fields, customProperties, { exclude: ['sequence'] })
  pushRecordFields(fields, metadata, { prefix: 'Metadata' })
  pushRecordFields(fields, entity, {
    prefix: 'Node',
    exclude: [
      'name',
      'summary',
      'context',
      'nodeType',
      'aliases',
      'tags',
      'status',
      'source',
      'linkedDefinitionKey',
      'thumbnailAssetKey',
      'customProperties',
      'metadata',
    ],
  })
  return {
    id: `sequence-${event.id}`,
    kind: 'sequence_unit',
    icon: 'event',
    title: compactWhitespace(entity.name) || (ordinal ? `Sequence ${ordinal}` : 'Story beat'),
    subtitle: `${formatPreviewLabel(compactWhitespace(sequence.unitKind) || 'Sequence unit')}${ordinal ? ` ${ordinal}` : ''}`,
    summary: compactWhitespace(sequence.synopsis) || compactWhitespace(entity.summary),
    context: compactWhitespace(entity.context),
    ordinal,
    fields,
    lists,
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildRelationshipCard(event: WorldPromptEvent, relationship: Record<string, unknown>): SeedGeneratedPreviewCard {
  const sourceRef = readRecord(relationship.sourceRef)
  const targetRef = readRecord(relationship.targetRef)
  const source = compactWhitespace(sourceRef.name) || compactWhitespace(relationship.sourceEntityKey) || 'Source'
  const target = compactWhitespace(targetRef.name) || compactWhitespace(relationship.targetEntityKey) || 'Target'
  const verb = compactWhitespace(relationship.verb) || 'linked to'
  const fields: SeedPreviewField[] = []
  pushField(fields, 'Source', source)
  pushField(fields, 'Target', target)
  pushField(fields, 'Verb', verb)
  pushField(fields, 'Direction', relationship.direction)
  pushField(fields, 'State', relationship.state)
  pushField(fields, 'Strength', relationship.strength)
  pushField(fields, 'Confidence', relationship.confidence)
  pushField(fields, 'Source type', relationship.source)
  pushField(fields, 'Notes', relationship.notes)
  pushField(fields, 'Metadata', relationship.metadata)
  pushRecordFields(fields, relationship, {
    prefix: 'Relationship',
    exclude: [
      'sourceRef',
      'targetRef',
      'sourceEntityKey',
      'targetEntityKey',
      'verb',
      'direction',
      'state',
      'strength',
      'confidence',
      'source',
      'notes',
      'metadata',
    ],
  })
  return {
    id: `relationship-${event.id}`,
    kind: 'relationship',
    icon: 'graph',
    title: `${source} -> ${target}`,
    subtitle: formatPreviewLabel(verb),
    summary: compactWhitespace(relationship.notes),
    fields,
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

export function buildSeedGeneratedPreviewCards(events: WorldPromptEvent[]): SeedGeneratedPreviewCard[] {
  const cards: SeedGeneratedPreviewCard[] = []
  for (const event of [...events].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.sequence - right.sequence
  })) {
    if (event.eventType !== 'op_applied') continue
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success || !parsed.data.op) continue
    const { op } = parsed.data
    if (op.op === 'update_world_wiki_metadata') {
      cards.push(buildOverviewCard(event, op.payload.metadata))
    } else if (op.op === 'upsert_entity') {
      cards.push(buildEntityCard(event, op.payload.entity))
    } else if (op.op === 'upsert_relationship') {
      cards.push(buildRelationshipCard(event, op.payload.relationship))
    }
  }
  const latestOverviewByTitle = new Map<string, SeedGeneratedPreviewCard>()
  const nonOverviewCards: SeedGeneratedPreviewCard[] = []
  for (const card of cards) {
    if (card.kind === 'overview') {
      latestOverviewByTitle.set(card.title.toLowerCase(), card)
    } else {
      nonOverviewCards.push(card)
    }
  }
  return [
    ...Array.from(latestOverviewByTitle.values()).sort((left, right) => left.sequence - right.sequence),
    ...nonOverviewCards,
  ]
}
