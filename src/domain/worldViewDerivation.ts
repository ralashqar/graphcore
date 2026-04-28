import type { ProjectSnapshot } from './graphcore.ts'
import type { WorldThread } from './worldThread.ts'
import {
  type WorldEntity,
  type WorldView,
  type WorldViewCreateInput,
  type WorldViewKind,
  type WorldViewRefreshPolicy,
} from './worldGraph.ts'

type ViewSnapshot = Pick<ProjectSnapshot, 'worldEntities' | 'worldRelationships' | 'worldViews' | 'worldThreads'>

export type WorldViewSemanticMetadata = {
  viewKind: WorldViewKind
  autoManaged: boolean
  sourceEntityKeys: string[]
  sourceThreadKeys: string[]
  pinnedNodeKeys: string[]
  refreshPolicy: WorldViewRefreshPolicy
  semanticLabel: string | null
  transientFocus: boolean
}

type DerivedViewSpec = {
  key: string
  name: string
  mode: WorldView['mode']
  rootEntityKey: string | null
  focusDepth: number
  sortMode: WorldView['sortMode']
  metadata: WorldViewSemanticMetadata
}

export type AutoManagedWorldViewOptions = {
  recentEntityKeys?: string[]
  recentRelationshipKeys?: string[]
  preferredRootEntityKey?: string | null
  preferredThreadKey?: string | null
  maxThreadViews?: number
}

export type AutoManagedWorldViewResult = {
  worldViews: WorldView[]
  preferredViewKey: string | null
}

const MAX_THREAD_VIEWS_DEFAULT = 3

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createLocalWorldViewId(key: string) {
  return `world-view-${key.replace(/[^a-z0-9]+/gi, '-')}`
}

function sanitizeKeys(values: string[] | undefined | null) {
  return Array.from(new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

function scoreThreadPriority(priority: WorldThread['priority']) {
  switch (priority) {
    case 'primary':
      return 3
    case 'secondary':
      return 2
    case 'background':
      return 1
  }
}

function extractWorldText(entity: Pick<WorldEntity, 'name' | 'summary' | 'context' | 'aliases' | 'tags'>) {
  return [
    entity.name,
    entity.summary,
    entity.context,
    ...entity.aliases,
    ...entity.tags,
  ].join(' ').toLowerCase()
}

function cueScore(text: string, cues: string[]) {
  return cues.reduce((score, cue) => score + (text.includes(cue) ? 1 : 0), 0)
}

function buildDefaultMetadata(viewKind: WorldViewKind): WorldViewSemanticMetadata {
  return {
    viewKind,
    autoManaged: viewKind !== 'manual_snapshot' && viewKind !== 'wiki_custom',
    sourceEntityKeys: [],
    sourceThreadKeys: [],
    pinnedNodeKeys: [],
    refreshPolicy:
      viewKind === 'thread_focus'
        ? 'on_thread_change'
        : viewKind === 'wiki_thread_arc'
          ? 'on_thread_change'
        : viewKind === 'manual_snapshot'
          ? 'manual_only'
          : viewKind === 'wiki_custom'
            ? 'manual_only'
          : 'on_graph_change',
    semanticLabel: null,
    transientFocus: false,
  }
}

export function getWorldViewSemanticMetadata(view: Pick<WorldView, 'metadata'>): WorldViewSemanticMetadata {
  const metadata = (view.metadata ?? {}) as Record<string, unknown>
  const viewKind = typeof metadata.viewKind === 'string'
    ? metadata.viewKind as WorldViewKind
    : metadata.autoDerived === true
      ? 'global_overview'
      : 'manual_snapshot'
  const defaults = buildDefaultMetadata(viewKind)
  return {
    viewKind,
    autoManaged: metadata.autoManaged === true || metadata.autoDerived === true || defaults.autoManaged,
    sourceEntityKeys: sanitizeKeys(Array.isArray(metadata.sourceEntityKeys) ? metadata.sourceEntityKeys as string[] : []),
    sourceThreadKeys: sanitizeKeys(Array.isArray(metadata.sourceThreadKeys) ? metadata.sourceThreadKeys as string[] : []),
    pinnedNodeKeys: sanitizeKeys(Array.isArray(metadata.pinnedNodeKeys) ? metadata.pinnedNodeKeys as string[] : []),
    refreshPolicy: typeof metadata.refreshPolicy === 'string'
      ? metadata.refreshPolicy as WorldViewRefreshPolicy
      : defaults.refreshPolicy,
    semanticLabel: typeof metadata.semanticLabel === 'string' && metadata.semanticLabel.trim().length > 0
      ? metadata.semanticLabel
      : null,
    transientFocus: metadata.transientFocus === true,
  }
}

export function buildWorldViewMetadata(input: Partial<WorldViewSemanticMetadata> & Pick<WorldViewSemanticMetadata, 'viewKind'>) {
  const defaults = buildDefaultMetadata(input.viewKind)
  return {
    viewKind: input.viewKind,
    autoManaged: input.autoManaged ?? defaults.autoManaged,
    sourceEntityKeys: sanitizeKeys(input.sourceEntityKeys),
    sourceThreadKeys: sanitizeKeys(input.sourceThreadKeys),
    pinnedNodeKeys: sanitizeKeys(input.pinnedNodeKeys),
    refreshPolicy: input.refreshPolicy ?? defaults.refreshPolicy,
    semanticLabel: input.semanticLabel ?? null,
    transientFocus: input.transientFocus ?? false,
  }
}

export function isAutoManagedWorldView(view: Pick<WorldView, 'metadata'>) {
  return getWorldViewSemanticMetadata(view).autoManaged
}

export function isManualSnapshotWorldView(view: Pick<WorldView, 'metadata'>) {
  return getWorldViewSemanticMetadata(view).viewKind === 'manual_snapshot' && !getWorldViewSemanticMetadata(view).autoManaged
}

export function getWorldViewSeedEntityKeys(
  view: Pick<WorldView, 'rootEntityKey' | 'metadata'>,
  snapshot: Pick<ViewSnapshot, 'worldEntities' | 'worldThreads'>,
) {
  if (view.rootEntityKey) return [view.rootEntityKey]
  const metadata = getWorldViewSemanticMetadata(view)
  const directKeys = metadata.sourceEntityKeys.filter((key) => snapshot.worldEntities.some((entity) => entity.key === key))
  if (directKeys.length > 0) return directKeys
  if (metadata.sourceThreadKeys.length === 0) return []
  const threadEntityKeys = metadata.sourceThreadKeys.flatMap((threadKey) => (
    snapshot.worldThreads.find((thread) => thread.key === threadKey)?.linkedEntityKeys ?? []
  ))
  return sanitizeKeys(threadEntityKeys).filter((key) => snapshot.worldEntities.some((entity) => entity.key === key))
}

export function getWorldViewRailGroup(view: Pick<WorldView, 'metadata'>) {
  const metadata = getWorldViewSemanticMetadata(view)
  if (metadata.viewKind === 'global_overview') return 'global'
  if (metadata.viewKind === 'thread_focus') return 'threads'
  if (metadata.autoManaged) return 'core'
  return 'manual'
}

function createViewRecord(spec: DerivedViewSpec, existingView: WorldView | null): WorldView {
  return {
    id: existingView?.id ?? createLocalWorldViewId(spec.key),
    key: spec.key,
    name: spec.name,
    mode: spec.mode,
    filters: existingView?.filters ?? {
      nodeTypes: [],
      linkedOnly: false,
      unlinkedOnly: false,
      recentlyAdded: false,
      usedInCinematic: false,
      aiSuggestedOnly: false,
    },
    search: existingView?.search ?? '',
    rootEntityKey: spec.rootEntityKey,
    camera: existingView?.camera ?? { x: 0, y: 0, zoom: 1 },
    focusDepth: spec.focusDepth,
    showSuggestions: existingView?.showSuggestions ?? true,
    showLabels: existingView?.showLabels ?? true,
    showDerivedLayer: existingView?.showDerivedLayer ?? true,
    nodePositions: existingView?.nodePositions ?? {},
    collapsedState: existingView?.collapsedState ?? {},
    sortMode: spec.sortMode,
    metadata: {
      ...(existingView?.metadata ?? {}),
      ...spec.metadata,
    },
    createdAt: existingView?.createdAt,
    updatedAt: existingView?.updatedAt,
  }
}

function buildEntityStats(snapshot: ViewSnapshot) {
  const relationshipCount = new Map<string, number>()
  const threadCount = new Map<string, number>()
  for (const relationship of snapshot.worldRelationships) {
    relationshipCount.set(relationship.sourceEntityKey, (relationshipCount.get(relationship.sourceEntityKey) ?? 0) + 1)
    relationshipCount.set(relationship.targetEntityKey, (relationshipCount.get(relationship.targetEntityKey) ?? 0) + 1)
  }
  for (const thread of snapshot.worldThreads) {
    for (const entityKey of thread.linkedEntityKeys) {
      threadCount.set(entityKey, (threadCount.get(entityKey) ?? 0) + scoreThreadPriority(thread.priority))
    }
  }
  return { relationshipCount, threadCount }
}

function selectTopEntityByScore(
  entities: WorldEntity[],
  score: (entity: WorldEntity) => number,
) {
  return [...entities]
    .sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name))
    [0] ?? null
}

function buildAutoViewSpecs(snapshot: ViewSnapshot, options?: AutoManagedWorldViewOptions) {
  const specs: DerivedViewSpec[] = []
  const { relationshipCount, threadCount } = buildEntityStats(snapshot)
  const recentEntityKeys = sanitizeKeys(options?.recentEntityKeys)
  const recentRelationshipKeys = sanitizeKeys(options?.recentRelationshipKeys)
  const entitiesByKey = new Map(snapshot.worldEntities.map((entity) => [entity.key, entity]))

  const actorScore = (entity: WorldEntity) => {
    const text = extractWorldText(entity)
    return (
      10
      + (relationshipCount.get(entity.key) ?? 0) * 3
      + (threadCount.get(entity.key) ?? 0) * 2
      + cueScore(text, [' protagonist', ' hero', ' lead', ' main character', ' central figure', ' chosen ']) * 8
      + cueScore(text, [' queen', ' king', ' ruler', ' prince', ' princess', ' heir ']) * 4
    )
  }
  const groupScore = (entity: WorldEntity) => {
    const text = extractWorldText(entity)
    return (
      8
      + (relationshipCount.get(entity.key) ?? 0) * 2
      + (threadCount.get(entity.key) ?? 0)
      + cueScore(text, [' faction', ' house ', ' guild', ' court', ' council', ' kingdom', ' empire', ' order ']) * 6
    )
  }
  const placeScore = (entity: WorldEntity) => {
    const text = extractWorldText(entity)
    return (
      8
      + (relationshipCount.get(entity.key) ?? 0) * 2
      + cueScore(text, [' kingdom', ' city', ' capital', ' region', ' fortress', ' port', ' estate', ' court']) * 5
    )
  }
  const loreScore = (entity: WorldEntity) => {
    const text = extractWorldText(entity)
    return (
      8
      + (relationshipCount.get(entity.key) ?? 0) * 2
      + cueScore(text, [' lore', ' prophecy', ' taboo', ' ritual', ' pact', ' myth', ' magic', ' history']) * 6
    )
  }

  const topActor = selectTopEntityByScore(snapshot.worldEntities.filter((entity) => entity.nodeType === 'actor'), actorScore)
  const topGroup = selectTopEntityByScore(snapshot.worldEntities.filter((entity) => entity.nodeType === 'group'), groupScore)
  const topPlace = selectTopEntityByScore(snapshot.worldEntities.filter((entity) => entity.nodeType === 'place'), placeScore)
  const topLore = selectTopEntityByScore(snapshot.worldEntities.filter((entity) => entity.nodeType === 'concept' || entity.nodeType === 'event'), loreScore)

  specs.push({
    key: 'world.view.global-overview',
    name: 'Global Overview',
    mode: 'graph',
    rootEntityKey: null,
    focusDepth: 1,
    sortMode: 'relationship_count',
    metadata: buildWorldViewMetadata({
      viewKind: 'global_overview',
      sourceEntityKeys: [],
      semanticLabel: 'Full world atlas',
    }),
  })

  if (snapshot.worldEntities.length > 0) {
    specs.push({
      key: 'world.view.wiki-overview',
      name: 'World Wiki',
      mode: 'wiki',
      rootEntityKey: null,
      focusDepth: 1,
      sortMode: 'relationship_count',
      metadata: buildWorldViewMetadata({
        viewKind: 'wiki_overview',
        sourceEntityKeys: [],
        semanticLabel: 'Readable world bible',
      }),
    })
  }

  if (recentEntityKeys.length > 0 || recentRelationshipKeys.length > 0) {
    const primaryRecentEntityKey = recentEntityKeys[0] ?? null
    specs.push({
      key: 'world.view.recent-growth',
      name: 'Recent Growth',
      mode: 'graph',
      rootEntityKey: primaryRecentEntityKey,
      focusDepth: 1,
      sortMode: 'recent',
      metadata: buildWorldViewMetadata({
        viewKind: 'recent_growth',
        sourceEntityKeys: recentEntityKeys,
        semanticLabel: 'Latest story additions',
      }),
    })
  }

  const eventCount = snapshot.worldEntities.filter((entity) => entity.nodeType === 'event').length
  if (eventCount > 0) {
    specs.push({
      key: 'world.view.timeline-overview',
      name: 'Timeline Overview',
      mode: 'timeline',
      rootEntityKey: null,
      focusDepth: 1,
      sortMode: 'recent',
      metadata: buildWorldViewMetadata({
        viewKind: 'timeline_overview',
        sourceEntityKeys: snapshot.worldEntities
          .filter((entity) => entity.nodeType === 'event')
          .map((entity) => entity.key)
          .slice(0, 24),
        semanticLabel: 'Canonical event timeline',
      }),
    })
  }

  if (topActor) {
    specs.push({
      key: `world.view.entity-neighborhood.${slugify(topActor.key)}`,
      name: `${topActor.name} Neighborhood`,
      mode: 'graph',
      rootEntityKey: topActor.key,
      focusDepth: 1,
      sortMode: 'relationship_count',
      metadata: buildWorldViewMetadata({
        viewKind: 'entity_neighborhood',
        sourceEntityKeys: [topActor.key],
        semanticLabel: `Centered on ${topActor.name}`,
      }),
    })
  }

  if (topGroup) {
    specs.push({
      key: `world.view.faction-map.${slugify(topGroup.key)}`,
      name: `${topGroup.name} Power Map`,
      mode: 'graph',
      rootEntityKey: topGroup.key,
      focusDepth: 1,
      sortMode: 'relationship_count',
      metadata: buildWorldViewMetadata({
        viewKind: 'faction_map',
        sourceEntityKeys: [topGroup.key],
        semanticLabel: `Political neighborhood around ${topGroup.name}`,
      }),
    })
  }

  if (topPlace) {
    specs.push({
      key: `world.view.place-map.${slugify(topPlace.key)}`,
      name: `${topPlace.name} Map`,
      mode: 'graph',
      rootEntityKey: topPlace.key,
      focusDepth: 1,
      sortMode: 'relationship_count',
      metadata: buildWorldViewMetadata({
        viewKind: 'place_map',
        sourceEntityKeys: [topPlace.key],
        semanticLabel: `Locale around ${topPlace.name}`,
      }),
    })
  }

  if (topLore) {
    specs.push({
      key: `world.view.lore-cluster.${slugify(topLore.key)}`,
      name: `${topLore.name} Lore`,
      mode: 'graph',
      rootEntityKey: topLore.key,
      focusDepth: 1,
      sortMode: 'relationship_count',
      metadata: buildWorldViewMetadata({
        viewKind: 'lore_cluster',
        sourceEntityKeys: [topLore.key],
        semanticLabel: `Lore cluster around ${topLore.name}`,
      }),
    })
  }

  const candidateThreads = snapshot.worldThreads
    .filter((thread) => thread.status === 'open')
    .sort((left, right) => (
      scoreThreadPriority(right.priority) - scoreThreadPriority(left.priority)
      || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))
    .slice(0, options?.maxThreadViews ?? MAX_THREAD_VIEWS_DEFAULT)

  for (const thread of candidateThreads) {
    const linkedEvents = thread.linkedEntityKeys
      .map((entityKey) => entitiesByKey.get(entityKey))
      .filter((entity): entity is WorldEntity => Boolean(entity))
      .filter((entity) => entity.nodeType === 'event')
    specs.push({
      key: `world.view.thread-focus.${slugify(thread.key)}`,
      name: thread.title,
      mode: linkedEvents.length >= 2 ? 'timeline' : 'graph',
      rootEntityKey: null,
      focusDepth: 1,
      sortMode: 'recent',
      metadata: buildWorldViewMetadata({
        viewKind: 'thread_focus',
        sourceEntityKeys: thread.linkedEntityKeys,
        sourceThreadKeys: [thread.key],
        refreshPolicy: 'on_thread_change',
        semanticLabel: thread.summary || thread.title,
      }),
    })
    specs.push({
      key: `world.view.wiki-thread.${slugify(thread.key)}`,
      name: `${thread.title} Wiki`,
      mode: 'wiki',
      rootEntityKey: null,
      focusDepth: 1,
      sortMode: 'recent',
      metadata: buildWorldViewMetadata({
        viewKind: 'wiki_thread_arc',
        sourceEntityKeys: thread.linkedEntityKeys,
        sourceThreadKeys: [thread.key],
        refreshPolicy: 'on_thread_change',
        semanticLabel: thread.summary || thread.title,
      }),
    })
  }

  return specs
}

function pickPreferredViewKey(
  views: WorldView[],
  snapshot: ViewSnapshot,
  options?: AutoManagedWorldViewOptions,
) {
  const preferredRootEntityKey = options?.preferredRootEntityKey ?? null
  const preferredThreadKey = options?.preferredThreadKey ?? null
  if (preferredRootEntityKey) {
    const matchingNeighborhood = views.find((view) => {
      const metadata = getWorldViewSemanticMetadata(view)
      return view.rootEntityKey === preferredRootEntityKey || metadata.sourceEntityKeys.includes(preferredRootEntityKey)
    }) ?? null
    if (matchingNeighborhood) return matchingNeighborhood.key
  }
  if (preferredThreadKey) {
    const matchingThreadView = views.find((view) => getWorldViewSemanticMetadata(view).sourceThreadKeys.includes(preferredThreadKey)) ?? null
    if (matchingThreadView) return matchingThreadView.key
  }
  return choosePreferredWorldView(views, snapshot)?.key ?? null
}

export function reconcileAutoManagedWorldViews(
  snapshot: ViewSnapshot,
  options?: AutoManagedWorldViewOptions,
): AutoManagedWorldViewResult {
  const manualViews = snapshot.worldViews.filter((view) => !isAutoManagedWorldView(view))
  const existingAutoViews = new Map(
    snapshot.worldViews
      .filter((view) => isAutoManagedWorldView(view))
      .map((view) => [view.key, view]),
  )
  const desiredSpecs = buildAutoViewSpecs(snapshot, options)
  const autoViews = desiredSpecs.map((spec) => createViewRecord(spec, existingAutoViews.get(spec.key) ?? null))
  const worldViews = [...manualViews, ...autoViews]
  return {
    worldViews,
    preferredViewKey: pickPreferredViewKey(worldViews, snapshot, options),
  }
}

export function choosePreferredWorldView(
  worldViews: WorldView[],
  snapshot?: Pick<ViewSnapshot, 'worldThreads'>,
) {
  const ordered = [...worldViews].sort((left, right) => {
    const leftMeta = getWorldViewSemanticMetadata(left)
    const rightMeta = getWorldViewSemanticMetadata(right)
    const score = (metadata: WorldViewSemanticMetadata) => {
      switch (metadata.viewKind) {
        case 'entity_neighborhood':
          return 100
        case 'faction_map':
          return 90
        case 'place_map':
          return 80
        case 'thread_focus':
          return 70 + ((metadata.sourceThreadKeys[0] && snapshot?.worldThreads.find((thread) => thread.key === metadata.sourceThreadKeys[0])?.priority === 'primary') ? 5 : 0)
        case 'recent_growth':
          return 65
        case 'timeline_overview':
          return 62
        case 'wiki_overview':
          return 61
        case 'wiki_thread_arc':
          return 59
        case 'wiki_entity_profile':
          return 58
        case 'wiki_custom':
          return metadata.autoManaged ? 30 : 50
        case 'lore_cluster':
          return 60
        case 'global_overview':
          return 20
        case 'manual_snapshot':
          return metadata.autoManaged ? 30 : 50
      }
    }
    return score(rightMeta) - score(leftMeta) || left.name.localeCompare(right.name)
  })
  return ordered[0] ?? null
}

export function buildEntityNeighborhoodViewInput(
  snapshot: ViewSnapshot,
  entityKey: string,
): WorldViewCreateInput | null {
  const entity = snapshot.worldEntities.find((entry) => entry.key === entityKey) ?? null
  if (!entity) return null
  return {
    name: `${entity.name} Neighborhood`,
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
    rootEntityKey: entity.key,
    camera: { x: 0, y: 0, zoom: 1 },
    focusDepth: 1,
    showSuggestions: true,
    showLabels: true,
    showDerivedLayer: true,
    nodePositions: {},
    collapsedState: {},
    sortMode: 'relationship_count',
    metadata: buildWorldViewMetadata({
      viewKind: 'entity_neighborhood',
      autoManaged: true,
      sourceEntityKeys: [entity.key],
      semanticLabel: `Centered on ${entity.name}`,
    }),
  }
}

export function findPersistentNeighborhoodViewKey(worldViews: WorldView[], entityKey: string) {
  return worldViews.find((view) => {
    const metadata = getWorldViewSemanticMetadata(view)
    return metadata.viewKind === 'entity_neighborhood' && view.rootEntityKey === entityKey && metadata.transientFocus !== true
  })?.key ?? null
}
