import test from 'node:test'
import assert from 'node:assert/strict'

import type { ProjectSnapshot } from './graphcore.ts'
import type { WorldEntity, WorldRelationship, WorldView } from './worldGraph.ts'
import type { WorldThread } from './worldThread.ts'
import {
  buildEntityNeighborhoodViewInput,
  choosePreferredWorldView,
  getWorldViewSemanticMetadata,
  reconcileAutoManagedWorldViews,
} from './worldViewDerivation.ts'

function createEntity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
  return {
    id: input.id ?? input.key,
    key: input.key,
    name: input.name,
    summary: input.summary ?? '',
    context: input.context ?? '',
    nodeType: input.nodeType,
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    status: input.status ?? 'active',
    thumbnailAssetKey: input.thumbnailAssetKey ?? null,
    linkedDefinitionKey: input.linkedDefinitionKey ?? null,
    source: input.source ?? 'user',
    customProperties: input.customProperties ?? {},
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function createRelationship(input: Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'user',
    notes: '',
    state: 'confirmed',
    metadata: {},
  }
}

function createThread(input: Partial<WorldThread> & Pick<WorldThread, 'key' | 'title'>): WorldThread {
  return {
    id: input.id ?? input.key,
    draftId: input.draftId ?? 'draft-1',
    key: input.key,
    title: input.title,
    summary: input.summary ?? '',
    status: input.status ?? 'open',
    priority: input.priority ?? 'secondary',
    linkedEntityKeys: input.linkedEntityKeys ?? [],
    sourceTurnId: input.sourceTurnId ?? null,
    lastTurnId: input.lastTurnId ?? null,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? '2026-04-24T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-24T10:00:00.000Z',
  }
}

function createView(input: Partial<WorldView> & Pick<WorldView, 'key' | 'name'>): WorldView {
  return {
    id: input.id ?? input.key,
    key: input.key,
    name: input.name,
    mode: input.mode ?? 'graph',
    filters: input.filters ?? {
      nodeTypes: [],
      linkedOnly: false,
      unlinkedOnly: false,
      recentlyAdded: false,
      usedInCinematic: false,
      aiSuggestedOnly: false,
    },
    search: input.search ?? '',
    rootEntityKey: input.rootEntityKey ?? null,
    camera: input.camera ?? { x: 0, y: 0, zoom: 1 },
    focusDepth: input.focusDepth ?? 1,
    showSuggestions: input.showSuggestions ?? true,
    showLabels: input.showLabels ?? true,
    showDerivedLayer: input.showDerivedLayer ?? true,
    nodePositions: input.nodePositions ?? {},
    collapsedState: input.collapsedState ?? {},
    sortMode: input.sortMode ?? 'manual',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function createSnapshot(input?: Partial<ProjectSnapshot>): Pick<ProjectSnapshot, 'worldEntities' | 'worldRelationships' | 'worldViews' | 'worldThreads'> {
  return {
    worldEntities: input?.worldEntities ?? [],
    worldRelationships: input?.worldRelationships ?? [],
    worldViews: input?.worldViews ?? [],
    worldThreads: input?.worldThreads ?? [],
  }
}

test('reconcileAutoManagedWorldViews builds protagonist, thread, and recent-growth views', () => {
  const protagonist = createEntity({
    key: 'world.actor.elian-vale',
    name: 'Elian Vale',
    nodeType: 'actor',
    summary: 'The protagonist lighthouse cartographer of Veyrhold.',
  })
  const queen = createEntity({ key: 'world.actor.queen-mirelle-thorne', name: 'Queen Mirelle Thorne', nodeType: 'actor' })
  const pact = createEntity({
    key: 'world.concept.sea-pact',
    name: 'Sea Pact',
    nodeType: 'concept',
    summary: 'A forbidden pact beneath the cliffs.',
  })
  const thread = createThread({
    key: 'world.thread.mist-vanishings',
    title: 'Sea-Mist Vanishings',
    priority: 'primary',
    linkedEntityKeys: [protagonist.key, pact.key],
  })
  const result = reconcileAutoManagedWorldViews(createSnapshot({
    worldEntities: [protagonist, queen, pact],
    worldRelationships: [
      createRelationship({ key: 'r1', sourceEntityKey: protagonist.key, targetEntityKey: queen.key, verb: 'serves' }),
      createRelationship({ key: 'r2', sourceEntityKey: protagonist.key, targetEntityKey: pact.key, verb: 'investigates' }),
    ],
    worldThreads: [thread],
  }), {
    recentEntityKeys: [pact.key],
    preferredRootEntityKey: protagonist.key,
  })

  assert.ok(result.worldViews.some((view) => getWorldViewSemanticMetadata(view).viewKind === 'entity_neighborhood' && view.rootEntityKey === protagonist.key))
  assert.ok(result.worldViews.some((view) => getWorldViewSemanticMetadata(view).viewKind === 'thread_focus' && getWorldViewSemanticMetadata(view).sourceThreadKeys.includes(thread.key)))
  assert.ok(result.worldViews.some((view) => getWorldViewSemanticMetadata(view).viewKind === 'recent_growth'))
  assert.equal(result.preferredViewKey?.includes('entity-neighborhood'), true)
})

test('reconcileAutoManagedWorldViews preserves manual snapshots', () => {
  const manual = createView({
    key: 'world.view.custom-court-notes',
    name: 'Court Notes',
    metadata: {
      viewKind: 'manual_snapshot',
      autoManaged: false,
      sourceEntityKeys: [],
      sourceThreadKeys: [],
      refreshPolicy: 'manual_only',
      semanticLabel: 'My saved snapshot',
    },
  })
  const result = reconcileAutoManagedWorldViews(createSnapshot({
    worldEntities: [createEntity({ key: 'world.actor.elian-vale', name: 'Elian Vale', nodeType: 'actor' })],
    worldViews: [manual],
  }))
  assert.ok(result.worldViews.some((view) => view.key === manual.key))
  assert.equal(result.worldViews.find((view) => view.key === manual.key)?.name, 'Court Notes')
})

test('reconcileAutoManagedWorldViews creates a timeline overview when events exist', () => {
  const event = createEntity({ key: 'world.event.coronation', name: 'Coronation', nodeType: 'event' })
  const result = reconcileAutoManagedWorldViews(createSnapshot({
    worldEntities: [event],
  }))
  const timelineView = result.worldViews.find((view) => getWorldViewSemanticMetadata(view).viewKind === 'timeline_overview') ?? null

  assert.ok(timelineView)
  assert.equal(timelineView.mode, 'timeline')
  assert.ok(getWorldViewSemanticMetadata(timelineView).sourceEntityKeys.includes(event.key))
})

test('reconcileAutoManagedWorldViews creates a wiki overview when graph content exists', () => {
  const actor = createEntity({ key: 'world.actor.lira-vey', name: 'Lira Vey', nodeType: 'actor' })
  const result = reconcileAutoManagedWorldViews(createSnapshot({
    worldEntities: [actor],
  }))
  const wikiView = result.worldViews.find((view) => getWorldViewSemanticMetadata(view).viewKind === 'wiki_overview') ?? null

  assert.ok(wikiView)
  assert.equal(wikiView.mode, 'wiki')
  assert.equal(wikiView?.name, 'World Wiki')
})

test('reconcileAutoManagedWorldViews creates wiki thread views for active story arcs', () => {
  const event = createEntity({ key: 'world.event.betrayal', name: 'The Betrayal', nodeType: 'event' })
  const thread = createThread({
    key: 'world.thread.betrayal',
    title: 'Betrayal',
    priority: 'primary',
    linkedEntityKeys: [event.key],
  })
  const result = reconcileAutoManagedWorldViews(createSnapshot({
    worldEntities: [event],
    worldThreads: [thread],
  }))
  const wikiThreadView = result.worldViews.find((view) => getWorldViewSemanticMetadata(view).viewKind === 'wiki_thread_arc') ?? null

  assert.ok(wikiThreadView)
  assert.equal(wikiThreadView.mode, 'wiki')
  assert.ok(getWorldViewSemanticMetadata(wikiThreadView).sourceThreadKeys.includes(thread.key))
})

test('buildEntityNeighborhoodViewInput creates an auto-managed persistent neighborhood', () => {
  const entity = createEntity({ key: 'world.actor.yara-thorne', name: 'Yara Thorne', nodeType: 'actor' })
  const input = buildEntityNeighborhoodViewInput(createSnapshot({ worldEntities: [entity] }), entity.key)
  assert.ok(input)
  assert.equal(input?.rootEntityKey, entity.key)
  assert.equal(input?.metadata.viewKind, 'entity_neighborhood')
  assert.equal(input?.metadata.autoManaged, true)
})

test('choosePreferredWorldView prefers a neighborhood over global overview', () => {
  const preferred = choosePreferredWorldView([
    createView({
      key: 'world.view.global-overview',
      name: 'Global Overview',
      metadata: {
        viewKind: 'global_overview',
        autoManaged: true,
        sourceEntityKeys: [],
        sourceThreadKeys: [],
        refreshPolicy: 'on_graph_change',
        semanticLabel: 'Full atlas',
      },
    }),
    createView({
      key: 'world.view.entity-neighborhood.world-actor-elian-vale',
      name: 'Elian Vale Neighborhood',
      rootEntityKey: 'world.actor.elian-vale',
      metadata: {
        viewKind: 'entity_neighborhood',
        autoManaged: true,
        sourceEntityKeys: ['world.actor.elian-vale'],
        sourceThreadKeys: [],
        refreshPolicy: 'on_graph_change',
        semanticLabel: 'Centered on Elian Vale',
      },
    }),
  ])
  assert.equal(preferred?.key, 'world.view.entity-neighborhood.world-actor-elian-vale')
})
