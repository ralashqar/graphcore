import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldEntity, WorldView } from './worldGraph.ts'
import { hasMissingWorldGraphBackfill, isAutoDerivedWorldView } from './worldGraphHelpers.ts'

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

test('auto-managed world views do not trigger legacy backfill sync', () => {
  const view = createView({
    key: 'world.view.global-overview',
    name: 'Global Overview',
    metadata: {
      viewKind: 'global_overview',
      autoManaged: true,
      refreshPolicy: 'auto',
    },
  })

  assert.equal(isAutoDerivedWorldView(view), false)
  assert.equal(hasMissingWorldGraphBackfill({
    definitions: [],
    worldEntities: [],
    worldViews: [view],
  }), false)
})

test('legacy auto-derived world views still trigger one-time backfill sync', () => {
  const view = createView({
    key: 'world.view.legacy',
    name: 'Legacy View',
    metadata: {
      autoDerived: true,
      autoManaged: true,
    },
  })

  assert.equal(isAutoDerivedWorldView(view), true)
  assert.equal(hasMissingWorldGraphBackfill({
    definitions: [],
    worldEntities: [
      createEntity({
        key: 'world.actor.yara',
        name: 'Yara',
        nodeType: 'actor',
        linkedDefinitionKey: 'character.yara',
      }),
    ],
    worldViews: [view],
  }), true)
})
