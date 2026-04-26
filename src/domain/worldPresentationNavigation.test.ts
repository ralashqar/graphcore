import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldView } from './worldGraph.ts'
import type { WorldThread } from './worldThread.ts'
import {
  buildWorldBreadcrumbSegments,
  chooseStoryModeThreadView,
  sanitizePinnedNodeKeys,
} from './worldPresentationNavigation.ts'

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
    createdAt: input.createdAt ?? '2026-04-25T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-25T10:00:00.000Z',
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

test('sanitizePinnedNodeKeys deduplicates and drops empty values', () => {
  assert.deepEqual(
    sanitizePinnedNodeKeys(['world.actor.elian', '', 'world.actor.elian', 'world.place.veyrhold']),
    ['world.actor.elian', 'world.place.veyrhold'],
  )
})

test('buildWorldBreadcrumbSegments creates world and story breadcrumb trails', () => {
  assert.deepEqual(
    buildWorldBreadcrumbSegments({
      mode: 'story',
      baseViewName: 'Sea-Mist Vanishings',
      activeThreadTitle: 'Sea-Mist Vanishings',
      activeTurnLabel: 'Turn 3',
      activeTurnId: 'turn-3',
      focusLabels: ['Elian Vale'],
    }).map((segment) => segment.label),
    ['Story', 'Sea-Mist Vanishings', 'Sea-Mist Vanishings', 'Turn 3', 'Elian Vale'],
  )
  assert.equal(
    buildWorldBreadcrumbSegments({
      mode: 'world',
      baseViewName: 'Global Overview',
      activeTurnLabel: 'Turn 3',
      activeTurnId: 'turn-3',
    }).find((segment) => segment.tone === 'turn')?.id,
    'turn:turn-3',
  )
})

test('chooseStoryModeThreadView prefers selected thread view, then focused-entity thread view', () => {
  const queenThread = createThread({
    key: 'world.thread.crown-crisis',
    title: 'Crown Crisis',
    priority: 'primary',
    linkedEntityKeys: ['world.actor.queen-mirelle'],
  })
  const harborThread = createThread({
    key: 'world.thread.harbor-omens',
    title: 'Harbor Omens',
    priority: 'secondary',
    linkedEntityKeys: ['world.place.harbor'],
  })
  const queenThreadView = createView({
    key: 'world.view.thread-focus.crown-crisis',
    name: 'Crown Crisis',
    metadata: {
      viewKind: 'thread_focus',
      autoManaged: true,
      sourceEntityKeys: [],
      sourceThreadKeys: [queenThread.key],
      pinnedNodeKeys: [],
      refreshPolicy: 'on_thread_change',
      semanticLabel: queenThread.summary,
      transientFocus: false,
    },
  })
  const harborThreadView = createView({
    key: 'world.view.thread-focus.harbor-omens',
    name: 'Harbor Omens',
    metadata: {
      viewKind: 'thread_focus',
      autoManaged: true,
      sourceEntityKeys: [],
      sourceThreadKeys: [harborThread.key],
      pinnedNodeKeys: [],
      refreshPolicy: 'on_thread_change',
      semanticLabel: harborThread.summary,
      transientFocus: false,
    },
  })

  const fromSelected = chooseStoryModeThreadView({
    worldViews: [queenThreadView, harborThreadView],
    worldThreads: [queenThread, harborThread],
    selectedViewKey: null,
    selectedThreadKey: harborThread.key,
    focusRootKey: 'world.actor.queen-mirelle',
  })
  assert.equal(fromSelected.thread?.key, harborThread.key)
  assert.equal(fromSelected.view?.key, harborThreadView.key)

  const fromFocus = chooseStoryModeThreadView({
    worldViews: [queenThreadView, harborThreadView],
    worldThreads: [queenThread, harborThread],
    selectedViewKey: null,
    selectedThreadKey: null,
    focusRootKey: 'world.actor.queen-mirelle',
  })
  assert.equal(fromFocus.thread?.key, queenThread.key)
  assert.equal(fromFocus.view?.key, queenThreadView.key)
})
