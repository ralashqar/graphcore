import type { EntityIconId } from '../shared/entityIcons'
import type { DefinitionBase, GraphDefinition, ProjectSnapshot } from './graphcore'
import type {
  WorldEntity,
  WorldEntityCreateInput,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldView,
} from './worldGraph'

export type WorldSuggestion = {
  id: string
  title: string
  why: string
  cta: 'add' | 'link' | 'generate' | 'ignore'
  entityDefaults?: Partial<WorldEntityCreateInput>
  relationshipDefaults?: Partial<WorldRelationshipCreateInput>
}

function createWorldLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function slugifyWorldValue(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildDerivedWorldEntityKey(
  existingKeys: Set<string>,
  nodeType: WorldEntity['nodeType'],
  seed: string,
) {
  const slug = slugifyWorldValue(seed) || nodeType
  let candidate = `world.${nodeType}.${slug}`
  let index = 2

  while (existingKeys.has(candidate)) {
    candidate = `world.${nodeType}.${slug}-${index}`
    index += 1
  }

  existingKeys.add(candidate)
  return candidate
}

export function isAutoDerivedWorldEntity(entity: Pick<WorldEntity, 'metadata'>) {
  return entity.metadata?.autoDerived === true
}

export function isAutoDerivedWorldView(view: Pick<WorldView, 'metadata'>) {
  return view.metadata?.autoDerived === true
}

export function deriveMissingWorldEntities(
  snapshot: Pick<ProjectSnapshot, 'definitions' | 'worldEntities'>,
  options?: { autoDerived?: boolean },
) {
  const autoDerived = options?.autoDerived ?? true
  const existingLinkedDefinitionKeys = new Set(
    snapshot.worldEntities
      .map((entity) => entity.linkedDefinitionKey)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
  const existingWorldEntityKeys = new Set(snapshot.worldEntities.map((entity) => entity.key))
  const derivedEntities: WorldEntity[] = []

  const linkedDefinitionKinds: Array<{ kind: DefinitionBase['kind']; nodeType: WorldEntity['nodeType'] }> = [
    { kind: 'character', nodeType: 'actor' },
    { kind: 'environment', nodeType: 'place' },
    { kind: 'item', nodeType: 'object' },
  ]

  for (const { kind, nodeType } of linkedDefinitionKinds) {
    for (const definition of snapshot.definitions.filter((entry) => entry.kind === kind)) {
      if (existingLinkedDefinitionKeys.has(definition.key)) continue
      existingLinkedDefinitionKeys.add(definition.key)
      derivedEntities.push({
        id: createWorldLocalId('world-entity'),
        key: buildDerivedWorldEntityKey(existingWorldEntityKeys, nodeType, definition.name || definition.key),
        name: definition.name,
        summary: definition.summary,
        nodeType,
        aliases: [],
        tags: definition.tags ?? [],
        status: 'active',
        thumbnailAssetKey: definition.iconAssetKey ?? null,
        linkedDefinitionKey: definition.key,
        source: 'user',
        customProperties: {},
        metadata: autoDerived
          ? {
              autoDerived: true,
              definitionBackfill: true,
              sourceDefinitionKind: definition.kind,
            }
          : {
              definitionBackfill: true,
              sourceDefinitionKind: definition.kind,
            },
      })
    }
  }

  return derivedEntities
}

export function deriveMissingWorldViews(
  snapshot: Pick<ProjectSnapshot, 'worldEntities' | 'worldViews'>,
  options?: { autoDerived?: boolean },
) {
  const autoDerived = options?.autoDerived ?? true
  if (snapshot.worldViews.length > 0 || snapshot.worldEntities.length === 0) {
    return []
  }

  return [{
    ...createDefaultWorldView(),
    metadata: autoDerived
      ? {
          autoDerived: true,
          definitionBackfill: true,
          autoSeededDefaultView: true,
        }
      : {
          definitionBackfill: true,
          autoSeededDefaultView: true,
        },
  }]
}

export function hasMissingWorldGraphBackfill(
  snapshot: Pick<ProjectSnapshot, 'definitions' | 'worldEntities' | 'worldViews'>,
) {
  const derivedEntities = deriveMissingWorldEntities(snapshot)
  if (derivedEntities.length > 0) return true
  return deriveMissingWorldViews({
    worldEntities: [...snapshot.worldEntities, ...derivedEntities],
    worldViews: snapshot.worldViews,
  }).length > 0
}

export function definitionKindForWorldEntity(nodeType: WorldEntity['nodeType']): DefinitionBase['kind'] | null {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    default:
      return null
  }
}

export function iconForWorldEntity(nodeType: WorldEntity['nodeType']): EntityIconId {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    case 'event':
      return 'activity'
    default:
      return 'content'
  }
}

export function labelForWorldEntity(nodeType: WorldEntity['nodeType']) {
  switch (nodeType) {
    case 'actor':
      return 'Character'
    case 'group':
      return 'Group'
    case 'place':
      return 'Place'
    case 'object':
      return 'Item'
    case 'concept':
      return 'Lore'
    case 'event':
      return 'Event'
  }
}

export function createDefaultWorldView(seed = 'Core World'): WorldView {
  return {
    id: `world-view-${Date.now()}`,
    key: `world.view.${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: seed,
    mode: 'graph',
    filters: {
      nodeTypes: [],
      linkedOnly: false,
      unlinkedOnly: false,
      recentlyAdded: false,
      usedInCinematic: false,
      aiSuggestedOnly: false,
    },
    search: '',
    rootEntityKey: null,
    camera: { x: 0, y: 0, zoom: 1 },
    focusDepth: 1,
    showSuggestions: true,
    showLabels: true,
    nodePositions: {},
    collapsedState: {},
    sortMode: 'manual',
    metadata: {},
  }
}

export function getWorldEntityUsage(entity: WorldEntity, graphs: GraphDefinition[]) {
  if (!entity.linkedDefinitionKey) return []
  return graphs
    .filter((graph) => graph.graphType === 'cinematic_flow')
    .filter((graph) => {
      const metadata = graph.metadata && typeof graph.metadata === 'object'
        ? graph.metadata as {
            cinematicScript?: { entityBindings?: Array<{ definitionKey?: string | null }> }
          }
        : {}
      const boundInScript = Array.isArray(metadata.cinematicScript?.entityBindings)
        && metadata.cinematicScript.entityBindings.some((binding) => binding?.definitionKey === entity.linkedDefinitionKey)
      const boundInNodes = graph.nodes.some((node) => (
        node.type === 'asset_ref'
        && node.metadata
        && typeof node.metadata === 'object'
        && (node.metadata as { definitionKey?: unknown }).definitionKey === entity.linkedDefinitionKey
      ))
      return boundInScript || boundInNodes
    })
    .map((graph) => ({
      graphKey: graph.key,
      graphName: graph.name,
    }))
}

function hasRelationship(
  entityKey: string,
  relationships: WorldRelationship[],
  predicate: (relationship: WorldRelationship) => boolean,
) {
  return relationships.some((relationship) => (
    (relationship.sourceEntityKey === entityKey || relationship.targetEntityKey === entityKey)
    && predicate(relationship)
  ))
}

export function buildSuggestionsForEntity(
  entity: WorldEntity,
  relationships: WorldRelationship[],
  graphs: GraphDefinition[],
): WorldSuggestion[] {
  const usage = getWorldEntityUsage(entity, graphs)
  const suggestions: WorldSuggestion[] = []

  if (entity.nodeType === 'actor' && !hasRelationship(entity.key, relationships, (relationship) => ['lives in', 'located in', 'belongs to'].includes(relationship.verb))) {
    suggestions.push({
      id: `${entity.key}-home-place`,
      title: 'Add a home place',
      why: 'This character has no anchor place yet, which makes the world feel ungrounded.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'place',
        name: `${entity.name} Base`,
        summary: `A place closely tied to ${entity.name}.`,
      },
      relationshipDefaults: {
        sourceEntityKey: entity.key,
        verb: 'lives in',
      },
    })
  }

  if (entity.nodeType === 'actor' && !hasRelationship(entity.key, relationships, (relationship) => relationship.verb === 'opposes')) {
    suggestions.push({
      id: `${entity.key}-rival`,
      title: 'Add a rival',
      why: 'A clear opposing force makes this character easier to use in scenes and cinematics.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'actor',
        name: `${entity.name} Rival`,
        summary: `A recurring counter-force for ${entity.name}.`,
      },
      relationshipDefaults: {
        sourceEntityKey: entity.key,
        verb: 'opposes',
      },
    })
  }

  if (entity.nodeType === 'group' && !hasRelationship(entity.key, relationships, (relationship) => ['belongs to', 'part of', 'controls', 'follows'].includes(relationship.verb))) {
    suggestions.push({
      id: `${entity.key}-member`,
      title: 'Add a member',
      why: 'This group has no visible members yet.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'actor',
        name: `${entity.name} Lead`,
        summary: `A key figure inside ${entity.name}.`,
      },
      relationshipDefaults: {
        targetEntityKey: entity.key,
        verb: 'belongs to',
      },
    })
  }

  if (entity.nodeType === 'place' && !hasRelationship(entity.key, relationships, (relationship) => ['controls', 'located in', 'lives in', 'works in'].includes(relationship.verb))) {
    suggestions.push({
      id: `${entity.key}-group`,
      title: 'Link a primary group',
      why: 'This place is not yet owned or inhabited by a recognizable group.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'group',
        name: `${entity.name} Circle`,
        summary: `A group strongly associated with ${entity.name}.`,
      },
      relationshipDefaults: {
        sourceEntityKey: entity.key,
        verb: 'located in',
      },
    })
  }

  if (entity.nodeType === 'concept' && !hasRelationship(entity.key, relationships, (relationship) => ['occurs in', 'caused by', 'influences', 'linked to'].includes(relationship.verb))) {
    suggestions.push({
      id: `${entity.key}-event`,
      title: 'Connect this lore to an event',
      why: 'Abstract ideas become more usable when they are tied to a concrete event.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'event',
        name: `${entity.name} Turning Point`,
        summary: `A major event shaped by ${entity.name}.`,
      },
      relationshipDefaults: {
        sourceEntityKey: entity.key,
        verb: 'influences',
      },
    })
  }

  if (entity.nodeType === 'object' && !hasRelationship(entity.key, relationships, (relationship) => ['owns', 'uses', 'protects'].includes(relationship.verb)) && usage.length === 0) {
    suggestions.push({
      id: `${entity.key}-owner`,
      title: 'Assign an owner',
      why: 'This object is not tied to a character, group, or scene yet.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'actor',
        name: `${entity.name} Keeper`,
        summary: `The primary wielder or steward of ${entity.name}.`,
      },
      relationshipDefaults: {
        verb: 'owns',
      },
    })
  }

  if (entity.nodeType === 'event' && !hasRelationship(entity.key, relationships, (relationship) => ['occurs in', 'caused by', 'introduced in'].includes(relationship.verb))) {
    suggestions.push({
      id: `${entity.key}-setting`,
      title: 'Tie this event to a place',
      why: 'Events are easier to visualize when they have a location anchor.',
      cta: 'add',
      entityDefaults: {
        nodeType: 'place',
        name: `${entity.name} Site`,
        summary: `The primary location associated with ${entity.name}.`,
      },
      relationshipDefaults: {
        sourceEntityKey: entity.key,
        verb: 'occurs in',
      },
    })
  }

  return suggestions
}

export function buildGlobalWorldSuggestions(
  entities: WorldEntity[],
  relationships: WorldRelationship[],
  graphs: GraphDefinition[],
) {
  return entities.slice(0, 6).flatMap((entity) => buildSuggestionsForEntity(entity, relationships, graphs)).slice(0, 6)
}

function makeEntity(id: string, nodeType: WorldEntity['nodeType'], name: string, summary: string, source: WorldEntity['source'] = 'ai'): WorldEntity {
  return {
    id,
    key: `world.${nodeType}.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    summary,
    nodeType,
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: definitionKindForWorldEntity(nodeType) ? `${definitionKindForWorldEntity(nodeType)}.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}` : null,
    source,
    customProperties: {},
    metadata: {},
  }
}

export function buildLocalStarterWorld(prompt: string) {
  const normalized = prompt.toLowerCase()
  const entities: WorldEntity[] = []
  const relationships: WorldRelationship[] = []
  const definitions: Array<Pick<DefinitionBase, 'kind' | 'key' | 'name' | 'summary'>> = []

  const placeName = normalized.includes('kingdom')
    ? 'Capital City'
    : normalized.includes('station')
      ? 'Central Station'
      : 'Anchor Place'
  const groupAName = normalized.includes('kingdom') ? 'Royal Court' : 'Core Circle'
  const groupBName = normalized.includes('rival') || normalized.includes('compete') ? 'Rival Alliance' : 'Outer Faction'
  const conceptName = normalized.includes('power') ? 'Power' : 'Founding Doctrine'
  const eventName = normalized.includes('succession') ? 'Succession Crisis' : 'Catalyst Event'

  const seedEntities = [
    makeEntity('seed-group-a', 'group', groupAName, `A central group generated from: ${prompt}`),
    makeEntity('seed-group-b', 'group', groupBName, `A competing force generated from: ${prompt}`),
    makeEntity('seed-place', 'place', placeName, `A core setting generated from: ${prompt}`),
    makeEntity('seed-concept', 'concept', conceptName, `A driving idea inside this world.`),
    makeEntity('seed-event', 'event', eventName, `A major moment that shapes the world state.`),
  ]

  entities.push(...seedEntities)

  definitions.push({
    kind: 'environment',
    key: seedEntities[2].linkedDefinitionKey ?? 'environment.anchor_place',
    name: seedEntities[2].name,
    summary: seedEntities[2].summary,
  })

  relationships.push(
    {
      id: 'seed-rel-1',
      key: 'world.relationship.seed-1',
      sourceEntityKey: seedEntities[0].key,
      targetEntityKey: seedEntities[2].key,
      verb: 'controls',
      direction: 'outbound',
      strength: 0.8,
      confidence: 0.8,
      source: 'ai',
      notes: '',
      state: 'confirmed',
      metadata: {},
    },
    {
      id: 'seed-rel-2',
      key: 'world.relationship.seed-2',
      sourceEntityKey: seedEntities[1].key,
      targetEntityKey: seedEntities[0].key,
      verb: 'opposes',
      direction: 'outbound',
      strength: 0.85,
      confidence: 0.82,
      source: 'ai',
      notes: '',
      state: 'confirmed',
      metadata: {},
    },
    {
      id: 'seed-rel-3',
      key: 'world.relationship.seed-3',
      sourceEntityKey: seedEntities[3].key,
      targetEntityKey: seedEntities[4].key,
      verb: 'influences',
      direction: 'outbound',
      strength: 0.72,
      confidence: 0.8,
      source: 'ai',
      notes: '',
      state: 'confirmed',
      metadata: {},
    },
    {
      id: 'seed-rel-4',
      key: 'world.relationship.seed-4',
      sourceEntityKey: seedEntities[4].key,
      targetEntityKey: seedEntities[2].key,
      verb: 'occurs in',
      direction: 'outbound',
      strength: 0.7,
      confidence: 0.76,
      source: 'ai',
      notes: '',
      state: 'confirmed',
      metadata: {},
    },
  )

  return {
    entities,
    relationships,
    view: createDefaultWorldView('Core World'),
    definitions,
  }
}

export function buildLocalExpansion(root: WorldEntity) {
  if (root.nodeType === 'actor') {
    const rival = makeEntity(`exp-${root.id}-rival`, 'actor', `${root.name} Rival`, `A recurring rival for ${root.name}.`)
    return {
      entities: [rival],
      relationships: [{
        id: `exp-rel-${root.id}`,
        key: `world.relationship.${root.key.split('.').slice(-1)[0]}-opposes`,
        sourceEntityKey: rival.key,
        targetEntityKey: root.key,
        verb: 'opposes',
        direction: 'outbound' as const,
        strength: 0.84,
        confidence: 0.78,
        source: 'ai' as const,
        notes: '',
        state: 'suggested' as const,
        metadata: {},
      }],
      definitions: [{
        kind: 'character' as const,
        key: rival.linkedDefinitionKey ?? `character.${rival.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: rival.name,
        summary: rival.summary,
      }],
    }
  }

  if (root.nodeType === 'place') {
    const object = makeEntity(`exp-${root.id}-object`, 'object', `${root.name} Relic`, `A signature object associated with ${root.name}.`)
    return {
      entities: [object],
      relationships: [{
        id: `exp-rel-${root.id}`,
        key: `world.relationship.${root.key.split('.').slice(-1)[0]}-contains`,
        sourceEntityKey: object.key,
        targetEntityKey: root.key,
        verb: 'located in',
        direction: 'outbound' as const,
        strength: 0.66,
        confidence: 0.72,
        source: 'ai' as const,
        notes: '',
        state: 'suggested' as const,
        metadata: {},
      }],
      definitions: [{
        kind: 'item' as const,
        key: object.linkedDefinitionKey ?? `item.${object.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: object.name,
        summary: object.summary,
      }],
    }
  }

  if (root.nodeType === 'concept') {
    const event = makeEntity(`exp-${root.id}-event`, 'event', `${root.name} Reckoning`, `A defining event shaped by ${root.name}.`)
    return {
      entities: [event],
      relationships: [{
        id: `exp-rel-${root.id}`,
        key: `world.relationship.${root.key.split('.').slice(-1)[0]}-influences`,
        sourceEntityKey: root.key,
        targetEntityKey: event.key,
        verb: 'influences',
        direction: 'outbound' as const,
        strength: 0.7,
        confidence: 0.74,
        source: 'ai' as const,
        notes: '',
        state: 'suggested' as const,
        metadata: {},
      }],
      definitions: [],
    }
  }

  const fallback = makeEntity(`exp-${root.id}-group`, 'group', `${root.name} Circle`, `A group formed around ${root.name}.`)
  return {
    entities: [fallback],
    relationships: [{
      id: `exp-rel-${root.id}`,
      key: `world.relationship.${root.key.split('.').slice(-1)[0]}-linked`,
      sourceEntityKey: fallback.key,
      targetEntityKey: root.key,
      verb: 'linked to',
      direction: 'outbound' as const,
      strength: 0.58,
      confidence: 0.68,
      source: 'ai' as const,
      notes: '',
      state: 'suggested' as const,
      metadata: {},
    }],
    definitions: [],
  }
}
