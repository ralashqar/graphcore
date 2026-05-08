import type { ProjectSnapshot } from './graphcore.ts'
import {
  worldWikiPresentationMetadataSchema,
  type WorldEntity,
  type WorldRelationship,
  type WorldView,
  type WorldWikiPresentationMetadata,
  type WorldWikiSectionKind,
} from './worldGraph.ts'
import { deriveWorldTimeline, type WorldTimelineModel } from './worldTimeline.ts'
import { deriveWorldSequence, type WorldSequenceModel } from './worldSequence.ts'
import type { WorldThread } from './worldThread.ts'
import { getWorldViewSemanticMetadata } from './worldViewDerivation.ts'
import { labelForWorldEntity } from './worldGraphHelpers.ts'

type WikiSnapshot = Pick<ProjectSnapshot, 'project' | 'worldEntities' | 'worldRelationships' | 'worldThreads' | 'worldResults' | 'worldGraphConnections'> & {
  draft?: Pick<ProjectSnapshot['draft'], 'id' | 'metadata'> | null
}

export type WorldWikiSection = {
  kind: WorldWikiSectionKind
  title: string
  summary: string
  entityKeys: string[]
  threadKeys: string[]
  resultKeys: string[]
  gap: boolean
}

export type WorldWikiEntityProfile = {
  entity: WorldEntity
  roleLabel: string
  shortSummary: string
  relationshipKeys: string[]
  threadKeys: string[]
  resultKeys: string[]
  gapKeys: string[]
}

export type WorldWikiThreadPage = {
  thread: WorldThread
  title: string
  summary: string
  entityKeys: string[]
  sequenceUnitKeys: string[]
  eventKeys: string[]
  gapKeys: string[]
}

export type WorldWikiGap = {
  key: string
  kind:
    | 'world_logline'
    | 'world_synopsis'
    | 'world_tone'
    | 'world_art_style'
    | 'brand_atlas_prompt'
    | 'color_scheme'
    | 'wiki_refresh'
    | 'entity_summary'
    | 'entity_role'
    | 'thread_summary'
    | 'timeline_order'
    | 'empty_section'
  label: string
  prompt: string
  entityKey: string | null
  threadKey: string | null
  sectionKind: WorldWikiSectionKind | null
}

export type WorldWikiModel = {
  title: string
  overview: {
    title: string
    logline: string
    synopsis: string
    genre: string
    themes: string[]
    toneTags: string[]
    coreConflict: string
    visualMotifs: string[]
    artStyleDescription: string
    worldConceptPrompt: string
    worldConceptAssetKey: string
    worldConceptVisualJobId: string
    brandAtlasPrompt: string
    brandAtlasAssetKey: string
    colorScheme: Record<string, string>
    heroEntityKey: string | null
    generatedFromFingerprint: string
    stale: boolean
  }
  fingerprint: string
  sections: WorldWikiSection[]
  entityProfiles: WorldWikiEntityProfile[]
  threadPages: WorldWikiThreadPage[]
  sequence: WorldSequenceModel
  timeline: WorldTimelineModel
  gaps: WorldWikiGap[]
  diagnostics: string[]
}

function looseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export function readWorldWikiPresentationMetadata(value: unknown): WorldWikiPresentationMetadata {
  const parsed = worldWikiPresentationMetadataSchema.safeParse(looseRecord(value))
  return parsed.success ? parsed.data : {}
}

function readWikiPresentation(value: Pick<WorldEntity, 'customProperties' | 'metadata'> | Pick<WorldView, 'metadata'>): WorldWikiPresentationMetadata {
  const metadata = looseRecord(value.metadata)
  const custom = 'customProperties' in value ? looseRecord(value.customProperties) : {}
  const parsed = worldWikiPresentationMetadataSchema.safeParse({
    ...looseRecord(metadata.wiki),
    ...looseRecord(custom.wiki),
    logline: readString(custom.logline) || readString(metadata.logline) || readString(looseRecord(custom.wiki).logline) || readString(looseRecord(metadata.wiki).logline),
    synopsis: readString(custom.synopsis) || readString(metadata.synopsis) || readString(looseRecord(custom.wiki).synopsis) || readString(looseRecord(metadata.wiki).synopsis),
    roleLabel: readString(custom.roleLabel) || readString(metadata.roleLabel) || readString(looseRecord(custom.wiki).roleLabel) || readString(looseRecord(metadata.wiki).roleLabel),
    shortSummary: readString(custom.shortSummary) || readString(metadata.shortSummary) || readString(looseRecord(custom.wiki).shortSummary) || readString(looseRecord(metadata.wiki).shortSummary),
  })
  return parsed.success ? parsed.data : {}
}

export function readWorldEntityWikiPresentation(entity: Pick<WorldEntity, 'customProperties' | 'metadata'>) {
  return readWikiPresentation(entity)
}

export function readProjectWorldWikiPresentation(snapshot: Pick<WikiSnapshot, 'draft'>) {
  const metadata = looseRecord(snapshot.draft?.metadata)
  return readWorldWikiPresentationMetadata(metadata.worldWiki)
}

function mergeWikiPresentation(...entries: WorldWikiPresentationMetadata[]) {
  const merged: WorldWikiPresentationMetadata = {}
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === 'string') {
        if (value.trim()) {
          ;(merged as Record<string, unknown>)[key] = value.trim()
        }
        continue
      }
      if (Array.isArray(value)) {
        if (value.length > 0) {
          ;(merged as Record<string, unknown>)[key] = value
        }
        continue
      }
      if (value !== undefined && value !== null) {
        ;(merged as Record<string, unknown>)[key] = value
      }
    }
  }
  return merged
}

export function buildWorldWikiFingerprint(input: WikiSnapshot) {
  const activeEntities = input.worldEntities.filter((entity) => entity.status !== 'archived')
  const countsByType = activeEntities.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.nodeType] = (acc[entity.nodeType] ?? 0) + 1
    return acc
  }, {})
  const relationshipCount = relationshipCounts(input.worldRelationships)
  const topEntityKeys = activeEntities
    .slice()
    .sort((left, right) => (relationshipCount.get(right.key) ?? 0) - (relationshipCount.get(left.key) ?? 0) || left.key.localeCompare(right.key))
    .slice(0, 12)
    .map((entity) => entity.key)
  const primaryThreadKeys = input.worldThreads
    .filter((thread) => thread.priority === 'primary')
    .map((thread) => thread.key)
    .sort()
    .slice(0, 8)
  const timeline = deriveWorldTimeline({
    entities: activeEntities,
    relationships: input.worldRelationships,
  })
  const sequence = deriveWorldSequence({
    entities: activeEntities,
    relationships: input.worldRelationships,
  })
  return [
    'wiki-v1',
    input.project.id,
    input.draft?.id ?? '',
    Object.keys(countsByType).sort().map((key) => `${key}:${countsByType[key]}`).join(','),
    `relationships:${input.worldRelationships.length}`,
    `events:${timeline.events.length}`,
    `sequence:${sequence.units.length}`,
    `sequenceGaps:${sequence.gaps.length}`,
    `floating:${timeline.floatingEventKeys.length}`,
    `conflicts:${timeline.conflicts.length}`,
    `top:${topEntityKeys.join(',')}`,
    `threads:${primaryThreadKeys.join(',')}`,
  ].join('|')
}

function sectionSummary(entities: WorldEntity[], fallback: string) {
  const summaries = entities
    .map((entity) => readWikiPresentation(entity).shortSummary || entity.summary || entity.context)
    .map((value) => value.trim())
    .filter(Boolean)
  return summaries[0] ?? fallback
}

function rankEntity(entity: WorldEntity, relationshipCounts: Map<string, number>) {
  const tags = entity.tags.join(' ').toLowerCase()
  const roleBoost = /\b(protagonist|antagonist|ruler|villain|heir|mentor|ally)\b/.test(tags) ? 40 : 0
  const imageBoost = entity.thumbnailAssetKey ? 10 : 0
  return roleBoost + imageBoost + (relationshipCounts.get(entity.key) ?? 0)
}

function relationshipCounts(relationships: WorldRelationship[]) {
  const counts = new Map<string, number>()
  for (const relationship of relationships) {
    counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
    counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
  }
  return counts
}

function resolveScopedEntities(input: {
  entities: WorldEntity[]
  threads: WorldThread[]
  view?: WorldView | null
}) {
  const active = input.entities.filter((entity) => entity.status !== 'archived')
  if (!input.view) return active
  const metadata = getWorldViewSemanticMetadata(input.view)
  if (metadata.viewKind === 'wiki_custom' && metadata.sourceEntityKeys.length > 0) {
    const sourceKeys = new Set(metadata.sourceEntityKeys)
    return active.filter((entity) => sourceKeys.has(entity.key))
  }
  if (metadata.viewKind === 'wiki_entity_profile' && input.view.rootEntityKey) {
    return active.filter((entity) => entity.key === input.view?.rootEntityKey)
  }
  if (metadata.viewKind === 'wiki_thread_arc' && metadata.sourceThreadKeys.length > 0) {
    const threadEntityKeys = new Set(
      input.threads
        .filter((thread) => metadata.sourceThreadKeys.includes(thread.key))
        .flatMap((thread) => thread.linkedEntityKeys),
    )
    return active.filter((entity) => threadEntityKeys.has(entity.key))
  }
  return active
}

function makeSection(input: {
  kind: WorldWikiSectionKind
  title: string
  summary: string
  entityKeys?: string[]
  threadKeys?: string[]
  resultKeys?: string[]
  forceReady?: boolean
}): WorldWikiSection {
  const entityKeys = input.entityKeys ?? []
  const threadKeys = input.threadKeys ?? []
  const resultKeys = input.resultKeys ?? []
  return {
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    entityKeys,
    threadKeys,
    resultKeys,
    gap: input.forceReady ? false : entityKeys.length === 0 && threadKeys.length === 0 && resultKeys.length === 0,
  }
}

function cleanColorScheme(value: unknown) {
  const record = looseRecord(value)
  return Object.entries(record).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const color = readString(rawValue)
    if (key.trim() && color) acc[key.trim()] = color
    return acc
  }, {})
}

function colorSchemeHasCoreColors(colorScheme: Record<string, string>) {
  return Boolean(colorScheme.primary?.trim() && colorScheme.secondary?.trim() && colorScheme.tertiary?.trim())
}

function colorSchemeSummary(colorScheme: Record<string, string>) {
  return Object.entries(colorScheme)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

function appSectionSummary(entities: WorldEntity[], fallback: string) {
  if (entities.length === 0) return fallback
  return sectionSummary(entities, fallback)
}

export function deriveWorldWiki(input: {
  snapshot: WikiSnapshot
  view?: WorldView | null
}): WorldWikiModel {
  const viewMetadata = input.view ? getWorldViewSemanticMetadata(input.view) : null
  const projectWiki = readProjectWorldWikiPresentation(input.snapshot)
  const title = viewMetadata?.viewKind === 'wiki_custom'
    || viewMetadata?.viewKind === 'wiki_entity_profile'
    || viewMetadata?.viewKind === 'wiki_thread_arc'
    ? input.view?.name || projectWiki.title || 'Untitled Wiki Page'
    : projectWiki.title || 'Untitled World'
  const scopedEntities = resolveScopedEntities({
    entities: input.snapshot.worldEntities,
    threads: input.snapshot.worldThreads,
    view: input.view,
  })
  const entityByKey = new Map(input.snapshot.worldEntities.map((entity) => [entity.key, entity] as const))
  const scopedEntityKeys = new Set(scopedEntities.map((entity) => entity.key))
  const counts = relationshipCounts(input.snapshot.worldRelationships)
  const sortEntities = (entities: WorldEntity[]) => entities
    .slice()
    .sort((left, right) => rankEntity(right, counts) - rankEntity(left, counts) || left.name.localeCompare(right.name))

  const actors = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'actor'))
  const groups = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'group'))
  const places = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'place'))
  const objects = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'object'))
  const lore = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'concept'))
  const events = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'event'))
  const appProductNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'app'))
  const appPeopleNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'persona' || entity.nodeType === 'business_goal'))
  const appFeatureNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'feature'))
  const appFlowNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'user_flow'))
  const appScreenNodes = sortEntities(scopedEntities.filter((entity) => (
    entity.nodeType === 'screen'
    || entity.nodeType === 'section'
    || entity.nodeType === 'screen_mockup'
    || entity.nodeType === 'image_region'
  )))
  const appComponentNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'component'))
  const appDataNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'data_model' || entity.nodeType === 'action'))
  const appBackendNodes = sortEntities(scopedEntities.filter((entity) => (
    entity.nodeType === 'api_endpoint'
    || entity.nodeType === 'backend_function'
    || entity.nodeType === 'external_service'
  )))
  const appCapabilityNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'capability'))
  const appDesignNodes = sortEntities(scopedEntities.filter((entity) => (
    entity.nodeType === 'design_system'
    || entity.nodeType === 'animation_spec'
  )))
  const appTowerNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'tower'))
  const appCodeFileNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'code_file'))
  const appNodes = [
    ...appProductNodes,
    ...appPeopleNodes,
    ...appFeatureNodes,
    ...appFlowNodes,
    ...appScreenNodes,
    ...appComponentNodes,
    ...appDataNodes,
    ...appBackendNodes,
    ...appCapabilityNodes,
    ...appDesignNodes,
    ...appTowerNodes,
    ...appCodeFileNodes,
  ]
  const hasAppNodes = appNodes.length > 0
  const gameInventoryNodes = sortEntities(scopedEntities.filter((entity) => (
    entity.nodeType === 'player_profile'
    || entity.nodeType === 'player_initial_config'
    || entity.nodeType === 'player_stat'
    || entity.nodeType === 'inventory'
    || entity.nodeType === 'inventory_item'
    || entity.nodeType === 'currency'
    || entity.nodeType === 'save_state'
  )))
  const gameProgressionNodes = sortEntities(scopedEntities.filter((entity) => (
    entity.nodeType === 'shadow_token'
    || entity.nodeType === 'state_variable'
    || entity.nodeType === 'game_rule'
    || entity.nodeType === 'choice_condition'
    || entity.nodeType === 'choice_outcome'
  )))
  const gameEconomyNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'marketplace' || entity.nodeType === 'trade_offer'))
  const gameTravelNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'location_spot' || entity.nodeType === 'travel_link'))
  const gameQuestNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'quest' || entity.nodeType === 'quest_step'))
  const gameNarrativeNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'narrative_arc' || entity.nodeType === 'narrative_scene' || entity.nodeType === 'encounter'))
  const gameDialogueNodes = sortEntities(scopedEntities.filter((entity) => entity.nodeType === 'dialogue_node' || entity.nodeType === 'choice'))
  const gameNodes = [
    ...gameInventoryNodes,
    ...gameProgressionNodes,
    ...gameEconomyNodes,
    ...gameTravelNodes,
    ...gameQuestNodes,
    ...gameNarrativeNodes,
    ...gameDialogueNodes,
  ]
  const hasGameSystemNodes = gameNodes.length > 0
  const relevantThreads = input.snapshot.worldThreads
    .filter((thread) => thread.status === 'open' || thread.status === 'resolved')
    .filter((thread) => thread.linkedEntityKeys.some((key) => scopedEntityKeys.has(key)) || scopedEntityKeys.size === 0)
    .sort((left, right) => {
      const priority = (thread: WorldThread) => thread.priority === 'primary' ? 0 : thread.priority === 'secondary' ? 1 : 2
      return priority(left) - priority(right) || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })

  const viewWiki = input.view ? readWikiPresentation(input.view) : {}
  const useProjectWikiFirst = viewMetadata?.viewKind !== 'wiki_custom'
    && viewMetadata?.viewKind !== 'wiki_entity_profile'
    && viewMetadata?.viewKind !== 'wiki_thread_arc'
  const wiki = useProjectWikiFirst
    ? mergeWikiPresentation(viewWiki, projectWiki)
    : mergeWikiPresentation(projectWiki, viewWiki)
  const wikiFingerprint = buildWorldWikiFingerprint(input.snapshot)
  const generatedFromFingerprint = wiki.generatedFromFingerprint || ''
  const wikiStale = Boolean(generatedFromFingerprint && generatedFromFingerprint !== wikiFingerprint)
  const projectSummary = input.snapshot.project.summary.trim()
  const synopsis = wiki.synopsis || projectSummary || sectionSummary([...appNodes, ...gameNodes, ...actors, ...events, ...lore], '')
  const heroEntity = [...appNodes, ...gameNodes, ...places, ...actors, ...events, ...lore].find((entity) => entity.thumbnailAssetKey) ?? appNodes[0] ?? gameNodes[0] ?? places[0] ?? actors[0] ?? events[0] ?? null
  const toneTags = uniq([
    ...(wiki.toneTags ?? []),
    ...scopedEntities.flatMap((entity) => readWikiPresentation(entity).toneTags ?? []),
    ...scopedEntities.flatMap((entity) => entity.tags).filter((tag) => /tone|style|mood|genre/i.test(tag)).slice(0, 6),
  ]).slice(0, 8)
  const themes = uniq(wiki.themes ?? []).slice(0, 8)
  const visualMotifs = uniq(wiki.visualMotifs ?? []).slice(0, 8)
  const artStyleDescription = wiki.artStyleDescription || ''
  const worldConceptPrompt = wiki.worldConceptPrompt || ''
  const worldConceptAssetKey = wiki.worldConceptAssetKey || ''
  const worldConceptVisualJobId = wiki.worldConceptVisualJobId || ''
  const brandAtlasPrompt = wiki.brandAtlasPrompt || ''
  const brandAtlasAssetKey = wiki.brandAtlasAssetKey || ''
  const colorScheme = cleanColorScheme(wiki.colorScheme)
  const hasStyleMetadata = Boolean(
    artStyleDescription
    || worldConceptPrompt
    || worldConceptAssetKey
    || brandAtlasPrompt
    || brandAtlasAssetKey
    || visualMotifs.length > 0
    || toneTags.length > 0
    || Object.keys(colorScheme).length > 0,
  )
  const styleSectionTitle = hasAppNodes ? 'Brand & Visual System' : 'Art Direction'
  const styleSectionSummary = artStyleDescription
    || brandAtlasPrompt
    || worldConceptPrompt
    || colorSchemeSummary(colorScheme)
    || (visualMotifs.length > 0 ? `Visual motifs: ${visualMotifs.join(', ')}` : '')
    || (toneTags.length > 0 ? `Tone: ${toneTags.join(', ')}` : '')
    || (hasAppNodes ? 'No app brand system metadata yet.' : 'No visual style metadata yet.')

  const timeline = deriveWorldTimeline({
    entities: input.snapshot.worldEntities.filter((entity) => scopedEntityKeys.size === 0 || scopedEntityKeys.has(entity.key)),
    relationships: input.snapshot.worldRelationships.filter((relationship) => (
      scopedEntityKeys.size === 0
      || (scopedEntityKeys.has(relationship.sourceEntityKey) && scopedEntityKeys.has(relationship.targetEntityKey))
    )),
  })
  const sequence = deriveWorldSequence({
    entities: input.snapshot.worldEntities.filter((entity) => scopedEntityKeys.size === 0 || scopedEntityKeys.has(entity.key)),
    relationships: input.snapshot.worldRelationships.filter((relationship) => (
      scopedEntityKeys.size === 0
      || (scopedEntityKeys.has(relationship.sourceEntityKey) && scopedEntityKeys.has(relationship.targetEntityKey))
    )),
  })
  const resultEntityKeys = new Set(scopedEntityKeys)
  const relevantResults = input.snapshot.worldResults.filter((result) => {
    const connections = input.snapshot.worldGraphConnections.filter((connection) => connection.targetNodeKey === result.key || connection.sourceNodeKey === result.key)
    return connections.some((connection) => resultEntityKeys.has(connection.sourceNodeKey) || resultEntityKeys.has(connection.targetNodeKey))
  })

  const appSections = hasAppNodes
    ? [
        makeSection({
          kind: 'app_product',
          title: 'App Product',
          summary: appSectionSummary(appProductNodes, 'No app identity node yet.'),
          entityKeys: appProductNodes.slice(0, 8).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_people',
          title: 'Personas & Goals',
          summary: appSectionSummary(appPeopleNodes, 'No personas or business goals yet.'),
          entityKeys: appPeopleNodes.slice(0, 10).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_features',
          title: 'Features',
          summary: appSectionSummary(appFeatureNodes, 'No product features yet.'),
          entityKeys: appFeatureNodes.slice(0, 12).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_flows',
          title: 'User Flows',
          summary: appSectionSummary(appFlowNodes, 'No user flows yet.'),
          entityKeys: appFlowNodes.slice(0, 12).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_screens',
          title: 'Screens',
          summary: appSectionSummary(appScreenNodes, 'No screens, sections, or mockups yet.'),
          entityKeys: appScreenNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_components',
          title: 'Components',
          summary: appSectionSummary(appComponentNodes, 'No reusable components yet.'),
          entityKeys: appComponentNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_data',
          title: 'Data & Actions',
          summary: appSectionSummary(appDataNodes, 'No data models or action contracts yet.'),
          entityKeys: appDataNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_backend',
          title: 'Backend & APIs',
          summary: appSectionSummary(appBackendNodes, 'No API endpoints, backend functions, or external services yet.'),
          entityKeys: appBackendNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_capabilities',
          title: 'Capabilities',
          summary: appSectionSummary(appCapabilityNodes, 'No native capability constraints yet.'),
          entityKeys: appCapabilityNodes.slice(0, 12).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_design',
          title: 'Design System',
          summary: appSectionSummary(appDesignNodes, 'No design system or animation specs yet.'),
          entityKeys: appDesignNodes.slice(0, 12).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_towers',
          title: 'Code Towers',
          summary: appSectionSummary(appTowerNodes, 'No implementation towers yet.'),
          entityKeys: appTowerNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'app_code_files',
          title: 'Code Files',
          summary: appSectionSummary(appCodeFileNodes, 'No generated file plan nodes yet.'),
          entityKeys: appCodeFileNodes.slice(0, 24).map((entity) => entity.key),
        }),
      ]
    : []

  const gameSections = !hasAppNodes && hasGameSystemNodes
    ? [
        makeSection({
          kind: 'game_world',
          title: 'Game World',
          summary: sectionSummary([...actors, ...places, ...groups], 'No game-world content yet.'),
          entityKeys: [...actors, ...places, ...groups].slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_inventory',
          title: 'Inventory & Items',
          summary: sectionSummary(gameInventoryNodes, 'No player inventory, items, currency, or save state yet.'),
          entityKeys: gameInventoryNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_economy',
          title: 'Economy & Markets',
          summary: sectionSummary(gameEconomyNodes, 'No markets or trade offers yet.'),
          entityKeys: gameEconomyNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_travel',
          title: 'Travel',
          summary: sectionSummary(gameTravelNodes, 'No location spots or travel links yet.'),
          entityKeys: gameTravelNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_quests',
          title: 'Quests',
          summary: sectionSummary(gameQuestNodes, 'No quests or quest steps yet.'),
          entityKeys: gameQuestNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_narrative',
          title: 'Narrative Arcs',
          summary: sectionSummary(gameNarrativeNodes, 'No narrative scenes or encounters yet.'),
          entityKeys: gameNarrativeNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_dialogue',
          title: 'Dialogue Choices',
          summary: sectionSummary(gameDialogueNodes, 'No dialogue nodes or choices yet.'),
          entityKeys: gameDialogueNodes.slice(0, 16).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'game_progression',
          title: 'Progression Tokens & Rules',
          summary: sectionSummary(gameProgressionNodes, 'No progression tokens, state variables, conditions, outcomes, or rules yet.'),
          entityKeys: gameProgressionNodes.slice(0, 18).map((entity) => entity.key),
        }),
      ]
    : []

  const storyWorldSections = hasAppNodes || hasGameSystemNodes
    ? []
    : [
        makeSection({
          kind: 'cast',
          title: 'Characters',
          summary: sectionSummary(actors, 'No character profiles yet.'),
          entityKeys: actors.slice(0, 8).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'timeline',
          title: 'Story Flow',
          summary: sequence.units.length > 0
            ? `${sequence.units.length} authored story beat${sequence.units.length === 1 ? '' : 's'} in the sequence.`
            : timeline.events.length > 0 ? `${timeline.events.length} event${timeline.events.length === 1 ? '' : 's'} in the derived chronology.` : 'No story sequence or event chronology yet.',
          entityKeys: sequence.units.length > 0
            ? sequence.units.slice(0, 12).map((unit) => unit.entity.key)
            : events.slice(0, 12).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'places',
          title: 'World Atlas',
          summary: sectionSummary(places, 'No places yet.'),
          entityKeys: places.slice(0, 8).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'factions',
          title: 'Factions',
          summary: sectionSummary(groups, 'No factions or groups yet.'),
          entityKeys: groups.slice(0, 8).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'lore',
          title: 'Lore & Concepts',
          summary: sectionSummary(lore, 'No lore concepts yet.'),
          entityKeys: lore.slice(0, 8).map((entity) => entity.key),
        }),
        makeSection({
          kind: 'items',
          title: 'Objects & Relics',
          summary: sectionSummary(objects, 'No objects yet.'),
          entityKeys: objects.slice(0, 8).map((entity) => entity.key),
        }),
      ]
  const storyArcSection = hasAppNodes || hasGameSystemNodes
    ? null
    : makeSection({
        kind: 'threads',
        title: 'Story Arcs',
        summary: relevantThreads[0]?.summary || 'No active story arcs yet.',
        threadKeys: relevantThreads.slice(0, 8).map((thread) => thread.key),
      })

  const sections = [
    makeSection({
      kind: 'overview',
      title: hasAppNodes ? 'Product Overview' : 'Overview',
      summary: synopsis || (hasAppNodes ? 'The app overview will grow from graph canon.' : 'The world overview will grow from graph canon.'),
      entityKeys: heroEntity ? [heroEntity.key] : [],
    }),
    makeSection({
      kind: 'style',
      title: styleSectionTitle,
      summary: styleSectionSummary,
      forceReady: hasStyleMetadata,
    }),
    ...appSections,
    ...gameSections,
    ...storyWorldSections,
    makeSection({
      kind: 'outputs',
      title: 'Output Previews',
      summary: relevantResults[0]?.summary || 'No generated outputs are linked to this view yet.',
      resultKeys: relevantResults.slice(0, 8).map((result) => result.key),
    }),
    storyArcSection,
  ].filter((section): section is WorldWikiSection => Boolean(section))

  const relationshipKeysByEntity = new Map<string, string[]>()
  for (const relationship of input.snapshot.worldRelationships) {
    relationshipKeysByEntity.set(relationship.sourceEntityKey, [...(relationshipKeysByEntity.get(relationship.sourceEntityKey) ?? []), relationship.key])
    relationshipKeysByEntity.set(relationship.targetEntityKey, [...(relationshipKeysByEntity.get(relationship.targetEntityKey) ?? []), relationship.key])
  }
  const threadKeysByEntity = new Map<string, string[]>()
  for (const thread of input.snapshot.worldThreads) {
    for (const key of thread.linkedEntityKeys) {
      threadKeysByEntity.set(key, [...(threadKeysByEntity.get(key) ?? []), thread.key])
    }
  }

  const entityProfiles = scopedEntities.map((entity) => {
    const presentation = readWikiPresentation(entity)
    const gapKeys = [
      !entity.summary.trim() && !presentation.shortSummary ? 'entity_summary' : null,
      entity.nodeType === 'actor' && !presentation.roleLabel ? 'entity_role' : null,
    ].filter((value): value is string => Boolean(value))
    return {
      entity,
      roleLabel: presentation.roleLabel || entity.tags.find((tag) => /protagonist|antagonist|ally|mentor|ruler|heir/i.test(tag)) || labelForWorldEntity(entity.nodeType),
      shortSummary: presentation.shortSummary || entity.summary || entity.context,
      relationshipKeys: relationshipKeysByEntity.get(entity.key) ?? [],
      threadKeys: threadKeysByEntity.get(entity.key) ?? [],
      resultKeys: relevantResults
        .filter((result) => input.snapshot.worldGraphConnections.some((connection) => (
          (connection.sourceNodeKey === entity.key && connection.targetNodeKey === result.key)
          || (connection.targetNodeKey === entity.key && connection.sourceNodeKey === result.key)
        )))
        .map((result) => result.key),
      gapKeys,
    }
  })

  const threadPages = relevantThreads.map((thread) => ({
    thread,
    title: thread.title,
    summary: thread.summary,
    entityKeys: thread.linkedEntityKeys.filter((key) => scopedEntityKeys.has(key)),
    sequenceUnitKeys: thread.linkedEntityKeys.filter((key) => entityByKey.get(key)?.nodeType === 'sequence_unit'),
    eventKeys: thread.linkedEntityKeys.filter((key) => entityByKey.get(key)?.nodeType === 'event'),
    gapKeys: thread.summary.trim() ? [] : ['thread_summary'],
  }))

  const gaps: WorldWikiGap[] = []
  if (!wiki.logline) {
    gaps.push({
      key: 'world-wiki-gap-logline',
      kind: 'world_logline',
      label: 'Generate logline',
      prompt: 'Create a concise one-sentence world logline from the current graph canon and store it as wiki presentation metadata. Do not add new canon unless a missing core premise is unavoidable.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'logline',
    })
  }
  if (!synopsis) {
    gaps.push({
      key: 'world-wiki-gap-synopsis',
      kind: 'world_synopsis',
      label: 'Generate synopsis',
      prompt: 'Create a compact world synopsis from the current graph canon and store it as wiki presentation metadata. Do not invent unrelated new canon.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'synopsis',
    })
  }
  if (toneTags.length === 0 && themes.length === 0) {
    gaps.push({
      key: 'world-wiki-gap-tone',
      kind: 'world_tone',
      label: 'Add themes/tone',
      prompt: 'Add compact wiki presentation metadata for the current world themes, tone tags, genre, core conflict, and visual motifs based only on existing graph canon.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'style',
    })
  }
  if (!artStyleDescription) {
    gaps.push({
      key: 'world-wiki-gap-art-style',
      kind: 'world_art_style',
      label: hasAppNodes ? 'Define app art direction' : 'Define art style',
      prompt: hasAppNodes
        ? 'Targeted app wiki metadata task: define a concise app-specific art style description for this product graph and store it as project wiki metadata.artStyleDescription using one update_world_wiki_metadata operation. Make it more specific than the broad preset: UI surface treatment, imagery, icon language, motion mood, density, and finish. Do not diagnose graph gaps and do not add new graph nodes unless necessary.'
        : 'Targeted wiki metadata task: define a concise art style description for this story/world graph and store it as project wiki metadata.artStyleDescription using one update_world_wiki_metadata operation. Make it more specific than the broad preset: medium, lighting, palette mood, texture, camera/illustration language, and recurring visual rules. Do not diagnose graph gaps and do not add new graph nodes unless necessary.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'style',
    })
  }
  if (!brandAtlasPrompt) {
    gaps.push({
      key: 'world-wiki-gap-brand-atlas-prompt',
      kind: 'brand_atlas_prompt',
      label: hasAppNodes ? 'Draft app brand atlas prompt' : 'Draft brand atlas prompt',
      prompt: hasAppNodes
        ? 'Targeted app wiki metadata task: create a visual-only brand atlas image prompt for this app and store it as project wiki metadata.brandAtlasPrompt using one update_world_wiki_metadata operation. Use the title, product promise, logline/synopsis, app archetype, art style description, visual motifs, and color scheme if present. The prompt should describe a single premium brand-board image with mobile screen language, UI components, palette swatches, icon style, and mood references; avoid GraphCore, schema, node IDs, and implementation wording. Do not diagnose graph gaps or add new graph nodes.'
        : 'Targeted wiki metadata task: create a visual-only brand atlas image prompt for this story/world and store it as project wiki metadata.brandAtlasPrompt using one update_world_wiki_metadata operation. Use the generated title, logline, synopsis, genre, art style description, visual motifs, and tone. The prompt should describe a single cohesive visual world/brand-board image with key motifs, materials, palette, lighting, typography mood, and representative subjects; avoid GraphCore, schema, node IDs, and implementation wording. Do not diagnose graph gaps or add new graph nodes.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'style',
    })
  }
  if (hasAppNodes && !colorSchemeHasCoreColors(colorScheme)) {
    gaps.push({
      key: 'world-wiki-gap-color-scheme',
      kind: 'color_scheme',
      label: 'Set app colors',
      prompt: 'Targeted app wiki metadata task: create a compact app color scheme and store it as project wiki metadata.colorScheme using one update_world_wiki_metadata operation. Include at least primary, secondary, and tertiary string values, each with a usable hex color plus a brief semantic label, based on the app promise, target user, art style description, visual motifs, and existing design-system nodes. Do not diagnose graph gaps, do not add story/world suggestions, and do not add new graph nodes unless needed.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'style',
    })
  }
  if (wikiStale) {
    gaps.push({
      key: 'world-wiki-gap-refresh',
      kind: 'wiki_refresh',
      label: 'Refresh overview',
      prompt: 'Refresh only the project-wide wiki overview metadata from the current graph canon: generated content title, logline, synopsis, themes, tone tags, genre, core conflict, and visual motifs. Do not add new canon.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'overview',
    })
  }
  for (const profile of entityProfiles.filter((profile) => profile.gapKeys.length > 0).slice(0, 8)) {
    for (const gapKey of profile.gapKeys) {
      gaps.push({
        key: `world-wiki-gap-${gapKey}-${profile.entity.key}`,
        kind: gapKey === 'entity_role' ? 'entity_role' : 'entity_summary',
        label: gapKey === 'entity_role' ? `Set role for ${profile.entity.name}` : `Summarize ${profile.entity.name}`,
        prompt: gapKey === 'entity_role'
          ? `Add a concise wiki role label for ${profile.entity.name} based only on existing graph canon.`
          : `Write a concise wiki-ready summary for ${profile.entity.name} based only on existing graph canon.`,
        entityKey: profile.entity.key,
        threadKey: null,
        sectionKind: null,
      })
    }
  }
  for (const page of threadPages.filter((page) => page.gapKeys.includes('thread_summary')).slice(0, 4)) {
    gaps.push({
      key: `world-wiki-gap-thread-${page.thread.key}`,
      kind: 'thread_summary',
      label: `Summarize ${page.thread.title}`,
      prompt: `Write a concise wiki-ready story arc summary for ${page.thread.title} from its linked graph canon.`,
      entityKey: null,
      threadKey: page.thread.key,
      sectionKind: 'threads',
    })
  }
  if (sequence.units.length === 0 && timeline.floatingEventKeys.length > 1) {
    gaps.push({
      key: 'world-wiki-gap-timeline-order',
      kind: 'timeline_order',
      label: 'Organize event order',
      prompt: 'Review the floating events in this wiki view and add only chronology that is directly supported or clearly implied by canon. Ask if the order is ambiguous.',
      entityKey: null,
      threadKey: null,
      sectionKind: 'timeline',
    })
  }
  for (const section of sections.filter((section) => section.gap && section.kind !== 'style').slice(0, 6)) {
    const isGameSection = section.kind.startsWith('game_')
    gaps.push({
      key: `world-wiki-gap-section-${section.kind}`,
      kind: 'empty_section',
      label: `Fill ${section.title}`,
      prompt: isGameSection
        ? `Add playable game graph canon that makes the ${section.title} wiki section useful. Use game-system node types and customProperties.game where relevant, connect endpoints, and keep the changes compact.`
        : `Add graph canon that makes the ${section.title} wiki section useful. Keep the changes compact and connect them to existing world nodes.`,
      entityKey: null,
      threadKey: null,
      sectionKind: section.kind,
    })
  }

  const diagnostics = [
    `${sections.filter((section) => !section.gap).length}/${sections.length} wiki sections have graph content.`,
    gaps.length > 0 ? `${gaps.length} wiki gap${gaps.length === 1 ? '' : 's'} available for prompt fill.` : 'No major wiki gaps detected.',
    wikiStale ? 'Project wiki overview may be stale relative to the current graph.' : null,
    ...timeline.diagnostics,
    ...sequence.diagnostics,
  ].filter((value): value is string => Boolean(value))

  return {
    title,
    overview: {
      title,
      logline: wiki.logline || '',
      synopsis,
      genre: wiki.genre || '',
      themes,
      toneTags,
      coreConflict: wiki.coreConflict || '',
      visualMotifs,
      artStyleDescription,
      worldConceptPrompt,
      worldConceptAssetKey,
      worldConceptVisualJobId,
      brandAtlasPrompt,
      brandAtlasAssetKey,
      colorScheme,
      heroEntityKey: heroEntity?.key ?? null,
      generatedFromFingerprint,
      stale: wikiStale,
    },
    fingerprint: wikiFingerprint,
    sections,
    entityProfiles,
    threadPages,
    sequence,
    timeline,
    gaps,
    diagnostics,
  }
}
