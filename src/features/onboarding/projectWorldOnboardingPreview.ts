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

export type SeedAssemblySectionKind =
  | 'overview'
  | 'characters'
  | 'locations'
  | 'factions'
  | 'artifacts'
  | 'lore'
  | 'storyBeats'
  | 'relationships'

export type SeedAssemblyItemKind = 'overview' | 'entity' | 'sequence_unit' | 'relationship'

export type SeedAssemblyItem = {
  id: string
  kind: SeedAssemblyItemKind
  section: SeedAssemblySectionKind
  icon: EntityIconId
  title: string
  subtitle: string
  summary: string
  sequence: number
  createdAt: string
  roleLabel?: string
  ordinal?: number | null
  outcome?: string
  relationshipText?: string
  detailText?: string
}

export type SeedAssemblySection = {
  kind: SeedAssemblySectionKind
  icon: EntityIconId
  title: string
  subtitle: string
  items: SeedAssemblyItem[]
}

const ASSEMBLY_SECTION_META: Record<SeedAssemblySectionKind, Omit<SeedAssemblySection, 'items'>> = {
  overview: {
    kind: 'overview',
    icon: 'content',
    title: 'Overview',
    subtitle: 'World bible initialized',
  },
  characters: {
    kind: 'characters',
    icon: 'character',
    title: 'Cast',
    subtitle: 'Characters joining the world',
  },
  locations: {
    kind: 'locations',
    icon: 'environment',
    title: 'Places',
    subtitle: 'Locations taking shape',
  },
  factions: {
    kind: 'factions',
    icon: 'group',
    title: 'Factions',
    subtitle: 'Groups and power structures',
  },
  artifacts: {
    kind: 'artifacts',
    icon: 'item',
    title: 'Artifacts',
    subtitle: 'Objects, resources, and relics',
  },
  lore: {
    kind: 'lore',
    icon: 'concept',
    title: 'Lore',
    subtitle: 'Concepts, rules, and history',
  },
  storyBeats: {
    kind: 'storyBeats',
    icon: 'event',
    title: 'Story Beats',
    subtitle: 'The main arc forming in order',
  },
  relationships: {
    kind: 'relationships',
    icon: 'graph',
    title: 'Connections',
    subtitle: 'Relationships between world pieces',
  },
}

const ASSEMBLY_SECTION_ORDER: SeedAssemblySectionKind[] = [
  'overview',
  'characters',
  'locations',
  'factions',
  'artifacts',
  'lore',
  'storyBeats',
  'relationships',
]

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

function nodeTypeAssemblySection(nodeType: string | null | undefined): SeedAssemblySectionKind {
  switch (nodeType) {
    case 'actor':
      return 'characters'
    case 'place':
      return 'locations'
    case 'group':
      return 'factions'
    case 'object':
      return 'artifacts'
    case 'sequence_unit':
      return 'storyBeats'
    case 'concept':
    case 'event':
    default:
      return 'lore'
  }
}

function joinMeaningfulLines(lines: Array<[string, unknown]>) {
  return lines
    .map(([label, value]) => {
      const text = formatPreviewValue(value)
      return text ? `${label}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function formatMeaningfulList(value: unknown) {
  const values = readStringList(value)
  return values.length > 0 ? values.join(', ') : ''
}

function firstMeaningfulText(...values: unknown[]) {
  for (const value of values) {
    const text = compactWhitespace(value)
    if (text) return text
  }
  return ''
}

function assemblyEntitySubtitle(section: SeedAssemblySectionKind, nodeType: string) {
  switch (section) {
    case 'characters':
      return 'Character'
    case 'locations':
      return 'Location'
    case 'factions':
      return 'Faction'
    case 'artifacts':
      return 'Artifact'
    case 'lore':
      return nodeType === 'event' ? 'Lore event' : 'Lore'
    default:
      return formatPreviewLabel(nodeType || 'Entity')
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

function buildAssemblyOverviewItem(event: WorldPromptEvent, metadata: Record<string, unknown>): SeedAssemblyItem {
  const genre = Array.isArray(metadata.genre) ? metadata.genre.join(', ') : compactWhitespace(metadata.genre)
  const tone = formatMeaningfulList(metadata.toneTags)
  return {
    id: `assembly-overview-${event.id}`,
    kind: 'overview',
    section: 'overview',
    icon: 'content',
    title: compactWhitespace(metadata.title) || 'World bible initialized',
    subtitle: genre || 'World overview',
    summary: firstMeaningfulText(metadata.logline, metadata.synopsis, metadata.coreConflict),
    roleLabel: tone,
    detailText: joinMeaningfulLines([
      ['Title', metadata.title],
      ['Logline', metadata.logline],
      ['Synopsis', metadata.synopsis],
      ['Genre', genre],
      ['Themes', formatMeaningfulList(metadata.themes)],
      ['Tone', tone],
      ['Core conflict', metadata.coreConflict],
      ['Visual motifs', formatMeaningfulList(metadata.visualMotifs)],
    ]),
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildAssemblyEntityItem(event: WorldPromptEvent, entity: Record<string, unknown>): SeedAssemblyItem {
  const nodeType = compactWhitespace(entity.nodeType)
  const customProperties = readRecord(entity.customProperties)
  const metadata = readRecord(entity.metadata)
  const sequence = readRecord(customProperties.sequence)
  if (nodeType === 'sequence_unit' || Object.keys(sequence).length > 0) {
    return buildAssemblySequenceItem(event, entity, sequence)
  }

  const section = nodeTypeAssemblySection(nodeType)
  const roleLabel = firstMeaningfulText(customProperties.roleLabel, metadata.roleLabel)
  const tags = formatMeaningfulList(entity.tags)
  return {
    id: `assembly-entity-${event.id}`,
    kind: 'entity',
    section,
    icon: nodeTypeIcon(nodeType),
    title: compactWhitespace(entity.name) || 'Generated world piece',
    subtitle: roleLabel || assemblyEntitySubtitle(section, nodeType),
    summary: firstMeaningfulText(entity.summary, entity.context),
    roleLabel: tags,
    detailText: joinMeaningfulLines([
      ['Summary', entity.summary],
      ['Context', entity.context],
      ['Role', roleLabel],
      ['Aliases', formatMeaningfulList(entity.aliases)],
      ['Tags', tags],
    ]),
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildAssemblySequenceItem(
  event: WorldPromptEvent,
  entity: Record<string, unknown>,
  sequence: Record<string, unknown>,
): SeedAssemblyItem {
  const ordinal = typeof sequence.ordinal === 'number' ? sequence.ordinal : null
  const unitKind = compactWhitespace(sequence.unitKind)
  const actLabel = compactWhitespace(sequence.actLabel)
  const subtitle = [
    actLabel,
    ordinal ? `${formatPreviewLabel(unitKind || 'Beat')} ${ordinal}` : formatPreviewLabel(unitKind || 'Story beat'),
  ].filter(Boolean).join(' / ')
  const consequences = Array.isArray(sequence.consequences)
    ? sequence.consequences.map(sequenceFieldValue).filter(Boolean).join('\n')
    : ''
  const characterArcDeltas = Array.isArray(sequence.characterArcDeltas)
    ? sequence.characterArcDeltas.map(sequenceFieldValue).filter(Boolean).join('\n')
    : ''
  return {
    id: `assembly-sequence-${event.id}`,
    kind: 'sequence_unit',
    section: 'storyBeats',
    icon: 'event',
    title: compactWhitespace(entity.name) || (ordinal ? `Story beat ${ordinal}` : 'Story beat'),
    subtitle,
    summary: firstMeaningfulText(sequence.synopsis, entity.summary, entity.context),
    ordinal,
    outcome: compactWhitespace(sequence.outcome),
    roleLabel: sequence.storyFunction ? formatPreviewLabel(compactWhitespace(sequence.storyFunction)) : '',
    detailText: joinMeaningfulLines([
      ['Synopsis', sequence.synopsis],
      ['Dramatic question', sequence.dramaticQuestion],
      ['Story function', sequence.storyFunction ? formatPreviewLabel(compactWhitespace(sequence.storyFunction)) : ''],
      ['Outcome', sequence.outcome],
      ['Consequences', consequences],
      ['Character changes', characterArcDeltas],
      ['Open loops', formatMeaningfulList(sequence.openLoops)],
      ['Resolved loops', formatMeaningfulList(sequence.resolvedLoops)],
    ]),
    sequence: event.sequence,
    createdAt: event.createdAt,
  }
}

function buildAssemblyRelationshipItem(event: WorldPromptEvent, relationship: Record<string, unknown>): SeedAssemblyItem {
  const sourceRef = readRecord(relationship.sourceRef)
  const targetRef = readRecord(relationship.targetRef)
  const source = compactWhitespace(sourceRef.name) || 'Source'
  const target = compactWhitespace(targetRef.name) || 'Target'
  const verb = compactWhitespace(relationship.verb) || 'connected to'
  const relationshipText = `${source} ${verb} ${target}`
  return {
    id: `assembly-relationship-${event.id}`,
    kind: 'relationship',
    section: 'relationships',
    icon: 'graph',
    title: relationshipText,
    subtitle: formatPreviewLabel(verb),
    summary: compactWhitespace(relationship.notes),
    relationshipText,
    detailText: joinMeaningfulLines([
      ['Connection', relationshipText],
      ['Notes', relationship.notes],
    ]),
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

export function buildSeedAssemblySections(events: WorldPromptEvent[]): SeedAssemblySection[] {
  const sectionItems = new Map<SeedAssemblySectionKind, SeedAssemblyItem[]>()
  for (const event of [...events].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.sequence - right.sequence
  })) {
    if (event.eventType !== 'op_applied') continue
    const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
    if (!parsed.success || !parsed.data.op) continue
    const { op } = parsed.data
    let item: SeedAssemblyItem | null = null
    if (op.op === 'update_world_wiki_metadata') {
      item = buildAssemblyOverviewItem(event, op.payload.metadata)
    } else if (op.op === 'upsert_entity') {
      item = buildAssemblyEntityItem(event, op.payload.entity)
    } else if (op.op === 'upsert_relationship') {
      item = buildAssemblyRelationshipItem(event, op.payload.relationship)
    }
    if (!item) continue
    const items = sectionItems.get(item.section) ?? []
    if (item.section === 'overview') {
      items.splice(0, items.length, item)
    } else {
      items.push(item)
    }
    sectionItems.set(item.section, items)
  }

  return ASSEMBLY_SECTION_ORDER
    .map((kind) => {
      const items = sectionItems.get(kind) ?? []
      return items.length > 0 ? { ...ASSEMBLY_SECTION_META[kind], items } : null
    })
    .filter((section): section is SeedAssemblySection => section !== null)
}
