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

type AssemblyEntityEndpoint = {
  icon: EntityIconId
  label: string
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
  | 'appProduct'
  | 'appPeople'
  | 'appFeatures'
  | 'appFlows'
  | 'appScreens'
  | 'appComponents'
  | 'appData'
  | 'appBackend'
  | 'appCapabilities'
  | 'appDesign'
  | 'appCode'
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
  relationshipSource?: string
  relationshipSourceIcon?: EntityIconId
  relationshipTarget?: string
  relationshipTargetIcon?: EntityIconId
  relationshipVerb?: string
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
  appProduct: {
    kind: 'appProduct',
    icon: 'app',
    title: 'App Product',
    subtitle: 'App identity and commercial promise',
  },
  appPeople: {
    kind: 'appPeople',
    icon: 'character',
    title: 'Personas & Goals',
    subtitle: 'Users, pains, motivations, and business goals',
  },
  appFeatures: {
    kind: 'appFeatures',
    icon: 'archetype',
    title: 'Features',
    subtitle: 'Product capabilities taking shape',
  },
  appFlows: {
    kind: 'appFlows',
    icon: 'thread',
    title: 'User Flows',
    subtitle: 'Onboarding, activation, retention, and conversion paths',
  },
  appScreens: {
    kind: 'appScreens',
    icon: 'screen',
    title: 'Screens',
    subtitle: 'Route-ready app surfaces',
  },
  appComponents: {
    kind: 'appComponents',
    icon: 'component',
    title: 'Components',
    subtitle: 'Reusable interface building blocks',
  },
  appData: {
    kind: 'appData',
    icon: 'database',
    title: 'Data & Actions',
    subtitle: 'Models and user/system actions',
  },
  appBackend: {
    kind: 'appBackend',
    icon: 'api',
    title: 'Backend & APIs',
    subtitle: 'Endpoint contracts and service integrations',
  },
  appCapabilities: {
    kind: 'appCapabilities',
    icon: 'capability',
    title: 'Capabilities',
    subtitle: 'Native features and preview constraints',
  },
  appDesign: {
    kind: 'appDesign',
    icon: 'design',
    title: 'Design System',
    subtitle: 'Brand style, screen mockups, and motion specs',
  },
  appCode: {
    kind: 'appCode',
    icon: 'tower',
    title: 'Code Towers',
    subtitle: 'Implementation slices and generated file plans',
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
  'appProduct',
  'appPeople',
  'appFeatures',
  'appFlows',
  'appScreens',
  'appComponents',
  'appData',
  'appBackend',
  'appCapabilities',
  'appDesign',
  'appCode',
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

function readPreviewVisualDescription(
  metadata: Record<string, unknown>,
  customProperties: Record<string, unknown>,
) {
  const metadataVisual = readRecord(metadata.visual)
  const customVisual = readRecord(customProperties.visual)
  return firstMeaningfulText(
    metadata.visualDescription,
    metadataVisual.description,
    metadataVisual.visualDescription,
    customProperties.visualDescription,
    customVisual.description,
    customVisual.visualDescription,
    customProperties.appearance,
  )
}

function nodeTypeIcon(nodeType: string | null | undefined): EntityIconId {
  switch (nodeType) {
    case 'app':
      return 'app'
    case 'persona':
      return 'character'
    case 'business_goal':
      return 'credits'
    case 'feature':
      return 'archetype'
    case 'user_flow':
      return 'thread'
    case 'screen':
    case 'screen_mockup':
    case 'image_region':
      return 'screen'
    case 'section':
      return 'content'
    case 'component':
      return 'component'
    case 'data_model':
      return 'database'
    case 'action':
      return 'activity'
    case 'api_endpoint':
    case 'backend_function':
      return 'api'
    case 'external_service':
      return 'global'
    case 'design_system':
      return 'design'
    case 'capability':
      return 'capability'
    case 'animation_spec':
      return 'cinematic'
    case 'tower':
      return 'tower'
    case 'code_file':
      return 'code'
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

function relationshipEndpointLabel(
  ref: Record<string, unknown>,
  fallbackKey: unknown,
  fallbackLabel: string,
) {
  return firstMeaningfulText(ref.name, ref.title, ref.label, fallbackKey, fallbackLabel)
}

function relationshipEndpointFromLookup(
  lookup: Map<string, AssemblyEntityEndpoint>,
  entityKey: unknown,
) {
  const key = compactWhitespace(entityKey)
  return key ? lookup.get(key) ?? null : null
}

function entityLookupKeys(entity: Record<string, unknown>, targetEntityKey: unknown) {
  const keys = new Set<string>()
  const push = (value: unknown) => {
    const key = compactWhitespace(value)
    if (key) keys.add(key)
  }
  push(targetEntityKey)
  push(entity.key)
  push(entity.entityKey)
  push(entity.worldEntityKey)
  const name = compactWhitespace(entity.name)
  if (name) {
    keys.add(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
  }
  return [...keys]
}

function nodeTypeAssemblySection(nodeType: string | null | undefined): SeedAssemblySectionKind {
  switch (nodeType) {
    case 'app':
      return 'appProduct'
    case 'persona':
    case 'business_goal':
      return 'appPeople'
    case 'feature':
      return 'appFeatures'
    case 'user_flow':
      return 'appFlows'
    case 'screen':
    case 'section':
    case 'screen_mockup':
    case 'image_region':
      return 'appScreens'
    case 'component':
      return 'appComponents'
    case 'data_model':
    case 'action':
      return 'appData'
    case 'api_endpoint':
    case 'backend_function':
    case 'external_service':
      return 'appBackend'
    case 'capability':
      return 'appCapabilities'
    case 'design_system':
    case 'animation_spec':
      return 'appDesign'
    case 'tower':
    case 'code_file':
      return 'appCode'
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
    case 'appProduct':
      return 'App'
    case 'appPeople':
      return nodeType === 'business_goal' ? 'Business Goal' : 'Persona'
    case 'appFeatures':
      return 'Feature'
    case 'appFlows':
      return 'User Flow'
    case 'appScreens':
      return nodeType === 'section'
        ? 'Section'
        : nodeType === 'screen_mockup'
          ? 'Screen Mockup'
          : nodeType === 'image_region'
            ? 'Image Region'
            : 'Screen'
    case 'appComponents':
      return 'Component'
    case 'appData':
      return nodeType === 'action' ? 'Action' : 'Data Model'
    case 'appBackend':
      return nodeType === 'backend_function'
        ? 'Backend Function'
        : nodeType === 'external_service'
          ? 'External Service'
          : 'API Endpoint'
    case 'appCapabilities':
      return 'Capability'
    case 'appDesign':
      return nodeType === 'animation_spec' ? 'Animation Spec' : 'Design System'
    case 'appCode':
      return nodeType === 'code_file' ? 'Code File' : 'Tower'
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
  pushField(fields, 'Art style description', metadata.artStyleDescription)
  pushField(fields, 'Brand atlas prompt', metadata.brandAtlasPrompt)
  pushField(fields, 'Color scheme', metadata.colorScheme)
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
      'artStyleDescription',
      'brandAtlasPrompt',
      'brandAtlasAssetKey',
      'colorScheme',
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
  const metadata = readRecord(entity.metadata)
  const visualDescription = readPreviewVisualDescription(metadata, customProperties)
  pushField(fields, 'Node type', nodeType)
  pushField(fields, 'Role', customProperties.roleLabel ?? metadata.roleLabel)
  pushField(fields, 'Visual description', visualDescription)
  pushField(fields, 'Status', entity.status)
  pushField(fields, 'Source', entity.source)
  pushField(fields, 'Linked definition', entity.linkedDefinitionKey)
  pushField(fields, 'Thumbnail asset', entity.thumbnailAssetKey)
  pushRecordFields(fields, customProperties, { exclude: ['roleLabel'] })
  pushRecordFields(fields, metadata, { exclude: ['roleLabel', 'visualDescription'], prefix: 'Metadata' })
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
  const visualDescription = readPreviewVisualDescription(metadata, customProperties)
  const ordinal = typeof sequence.ordinal === 'number' ? sequence.ordinal : null
  pushField(fields, 'Unit kind', sequence.unitKind)
  pushField(fields, 'Sequence key', sequence.sequenceKey)
  pushField(fields, 'Ordinal', sequence.ordinal)
  pushField(fields, 'Act', sequence.actLabel)
  pushField(fields, 'Visual description', visualDescription)
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
  pushRecordFields(fields, metadata, { prefix: 'Metadata', exclude: ['visualDescription'] })
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
  const source = relationshipEndpointLabel(sourceRef, relationship.sourceEntityKey, 'Source')
  const target = relationshipEndpointLabel(targetRef, relationship.targetEntityKey, 'Target')
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
  const artStyleDescription = compactWhitespace(metadata.artStyleDescription)
  const brandAtlasPrompt = compactWhitespace(metadata.brandAtlasPrompt)
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
      ['Art style', artStyleDescription],
      ['Brand atlas prompt', brandAtlasPrompt],
      ['Color scheme', metadata.colorScheme],
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
  const visualDescription = readPreviewVisualDescription(metadata, customProperties)
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
      ['Visual', visualDescription],
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
  const customProperties = readRecord(entity.customProperties)
  const metadata = readRecord(entity.metadata)
  const visualDescription = readPreviewVisualDescription(metadata, customProperties)
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
      ['Visual', visualDescription],
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

function buildAssemblyRelationshipItem(
  event: WorldPromptEvent,
  relationship: Record<string, unknown>,
  entityLookup: Map<string, AssemblyEntityEndpoint>,
): SeedAssemblyItem {
  const sourceRef = readRecord(relationship.sourceRef)
  const targetRef = readRecord(relationship.targetRef)
  const sourceEndpoint = relationshipEndpointFromLookup(entityLookup, relationship.sourceEntityKey)
  const targetEndpoint = relationshipEndpointFromLookup(entityLookup, relationship.targetEntityKey)
  const source = relationshipEndpointLabel(sourceRef, sourceEndpoint?.label ?? relationship.sourceEntityKey, 'Source')
  const target = relationshipEndpointLabel(targetRef, targetEndpoint?.label ?? relationship.targetEntityKey, 'Target')
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
    relationshipSource: source,
    relationshipSourceIcon: sourceEndpoint?.icon ?? nodeTypeIcon(compactWhitespace(sourceRef.nodeType) || compactWhitespace(sourceRef.type)),
    relationshipTarget: target,
    relationshipTargetIcon: targetEndpoint?.icon ?? nodeTypeIcon(compactWhitespace(targetRef.nodeType) || compactWhitespace(targetRef.type)),
    relationshipVerb: verb,
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
  const entityLookup = new Map<string, AssemblyEntityEndpoint>()
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
      const entity = op.payload.entity
      const endpoint = {
        icon: nodeTypeIcon(compactWhitespace(entity.nodeType)),
        label: compactWhitespace(entity.name) || item.title,
      }
      for (const key of entityLookupKeys(entity, op.payload.targetEntityKey)) {
        entityLookup.set(key, endpoint)
      }
    } else if (op.op === 'upsert_relationship') {
      item = buildAssemblyRelationshipItem(event, op.payload.relationship, entityLookup)
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
