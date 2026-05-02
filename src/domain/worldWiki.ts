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
  kind: 'world_logline' | 'world_synopsis' | 'world_tone' | 'wiki_refresh' | 'entity_summary' | 'entity_role' | 'thread_summary' | 'timeline_order' | 'empty_section'
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
    gap: entityKeys.length === 0 && threadKeys.length === 0 && resultKeys.length === 0,
  }
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
  const appNodes = sortEntities(scopedEntities.filter((entity) => [
    'app',
    'persona',
    'business_goal',
    'feature',
    'user_flow',
    'screen',
    'section',
    'component',
    'data_model',
    'action',
    'api_endpoint',
    'backend_function',
    'external_service',
    'design_system',
    'capability',
    'screen_mockup',
    'image_region',
    'animation_spec',
    'tower',
    'code_file',
  ].includes(entity.nodeType)))
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
  const synopsis = wiki.synopsis || projectSummary || sectionSummary([...appNodes, ...actors, ...events, ...lore], '')
  const heroEntity = [...appNodes, ...places, ...actors, ...events, ...lore].find((entity) => entity.thumbnailAssetKey) ?? appNodes[0] ?? places[0] ?? actors[0] ?? events[0] ?? null
  const toneTags = uniq([
    ...(wiki.toneTags ?? []),
    ...scopedEntities.flatMap((entity) => readWikiPresentation(entity).toneTags ?? []),
    ...scopedEntities.flatMap((entity) => entity.tags).filter((tag) => /tone|style|mood|genre/i.test(tag)).slice(0, 6),
  ]).slice(0, 8)
  const themes = uniq(wiki.themes ?? []).slice(0, 8)
  const visualMotifs = uniq(wiki.visualMotifs ?? []).slice(0, 8)

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

  const sections = [
    makeSection({
      kind: 'overview',
      title: appNodes.length > 0 ? 'Product Overview' : 'Overview',
      summary: synopsis || (appNodes.length > 0 ? 'The app overview will grow from graph canon.' : 'The world overview will grow from graph canon.'),
      entityKeys: heroEntity ? [heroEntity.key] : [],
    }),
    ...(appNodes.length > 0
      ? [makeSection({
          kind: 'app',
          title: 'App System',
          summary: sectionSummary(appNodes, 'No app system nodes yet.'),
          entityKeys: appNodes.slice(0, 12).map((entity) => entity.key),
        })]
      : []),
    makeSection({
      kind: 'cast',
      title: 'Main Characters',
      summary: sectionSummary(actors, 'No character profiles yet.'),
      entityKeys: actors.slice(0, 8).map((entity) => entity.key),
    }),
    makeSection({
      kind: 'threads',
      title: 'Story Arcs',
      summary: relevantThreads[0]?.summary || 'No active story arcs yet.',
      threadKeys: relevantThreads.slice(0, 8).map((thread) => thread.key),
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
    makeSection({
      kind: 'outputs',
      title: 'Output Previews',
      summary: relevantResults[0]?.summary || 'No generated outputs are linked to this view yet.',
      resultKeys: relevantResults.slice(0, 8).map((result) => result.key),
    }),
  ]

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
      roleLabel: presentation.roleLabel || entity.tags.find((tag) => /protagonist|antagonist|ally|mentor|ruler|heir/i.test(tag)) || entity.nodeType,
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
  for (const section of sections.filter((section) => section.gap).slice(0, 6)) {
    gaps.push({
      key: `world-wiki-gap-section-${section.kind}`,
      kind: 'empty_section',
      label: `Fill ${section.title}`,
      prompt: `Add graph canon that makes the ${section.title} wiki section useful. Keep the changes compact and connect them to existing world nodes.`,
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
