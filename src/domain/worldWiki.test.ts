import test from 'node:test'
import assert from 'node:assert/strict'

import type { ProjectSnapshot } from './graphcore.ts'
import type { WorldEntity, WorldRelationship, WorldView } from './worldGraph.ts'
import type { WorldThread } from './worldThread.ts'
import { deriveWorldWiki, readWorldEntityWikiPresentation } from './worldWiki.ts'

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

function createRelationship(input: Partial<WorldRelationship> & Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.id ?? input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: input.direction ?? 'outbound',
    strength: input.strength ?? null,
    confidence: input.confidence ?? null,
    source: input.source ?? 'user',
    notes: input.notes ?? '',
    state: input.state ?? 'confirmed',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
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
    createdAt: input.createdAt ?? '2026-04-28T08:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-28T08:00:00.000Z',
  }
}

function createView(input: Partial<WorldView> & Pick<WorldView, 'key' | 'name'>): WorldView {
  return {
    id: input.id ?? input.key,
    key: input.key,
    name: input.name,
    mode: input.mode ?? 'wiki',
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

function createSnapshot(input?: Partial<ProjectSnapshot>): Pick<ProjectSnapshot, 'project' | 'draft' | 'worldEntities' | 'worldRelationships' | 'worldThreads' | 'worldResults' | 'worldGraphConnections'> {
  return {
    project: input?.project ?? {
      id: 'project-1',
      name: 'Echoes of Aetheria',
      slug: 'echoes-of-aetheria',
      summary: 'A young archivist enters memories to stop a city from losing its past.',
      visibility: 'private',
    },
    draft: input?.draft ?? {
      id: 'draft-1',
      name: 'Draft 1',
      version: 1,
      isPrimary: true,
      updatedAt: '2026-04-28T08:00:00.000Z',
      metadata: {},
    },
    worldEntities: input?.worldEntities ?? [],
    worldRelationships: input?.worldRelationships ?? [],
    worldThreads: input?.worldThreads ?? [],
    worldResults: input?.worldResults ?? [],
    worldGraphConnections: input?.worldGraphConnections ?? [],
  }
}

test('deriveWorldWiki builds overview, sections, profiles, and thread pages from graph state', () => {
  const hero = createEntity({
    key: 'world.actor.lira-vey',
    name: 'Lira Vey',
    nodeType: 'actor',
    summary: 'Archivist with the rare power to enter memories.',
    tags: ['protagonist'],
    customProperties: {
      wiki: {
        roleLabel: 'Protagonist',
        shortSummary: 'Archivist with a memory-walking gift.',
      },
    },
  })
  const place = createEntity({
    key: 'world.place.archive',
    name: 'The Archive',
    nodeType: 'place',
    summary: 'A citadel of locked memories.',
    thumbnailAssetKey: 'asset.archive',
  })
  const event = createEntity({
    key: 'world.event.call',
    name: 'The Call',
    nodeType: 'event',
    summary: 'Lira discovers the power under the Archive.',
  })
  const thread = createThread({
    key: 'world.thread.awakening',
    title: 'The Awakening',
    summary: 'Lira discovers her power and the hidden cost of the archive.',
    priority: 'primary',
    linkedEntityKeys: [hero.key, place.key, event.key],
  })
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      draft: {
        id: 'draft-1',
        name: 'Draft 1',
        version: 1,
        isPrimary: true,
        updatedAt: '2026-04-28T08:00:00.000Z',
        metadata: {
          worldWiki: {
            title: 'The Memory Archive',
          },
        },
      },
      worldEntities: [hero, place, event],
      worldRelationships: [
        createRelationship({ key: 'r1', sourceEntityKey: hero.key, targetEntityKey: place.key, verb: 'discovers' }),
      ],
      worldThreads: [thread],
    }),
    view: createView({
      key: 'world.view.wiki-overview',
      name: 'World Wiki',
      metadata: {
        viewKind: 'wiki_overview',
        wiki: {
          logline: 'An archivist enters memories to save a city from forgetting itself.',
          toneTags: ['mystery', 'melancholic'],
        },
      },
    }),
  })

  assert.equal(wiki.title, 'The Memory Archive')
  assert.equal(wiki.overview.title, 'The Memory Archive')
  assert.equal(wiki.overview.logline, 'An archivist enters memories to save a city from forgetting itself.')
  assert.equal(wiki.overview.heroEntityKey, place.key)
  assert.ok(wiki.sections.some((section) => section.kind === 'cast' && section.entityKeys.includes(hero.key)))
  assert.ok(wiki.sections.some((section) => section.kind === 'threads' && section.threadKeys.includes(thread.key)))
  assert.ok(wiki.entityProfiles.some((profile) => profile.entity.key === hero.key && profile.roleLabel === 'Protagonist'))
  assert.ok(wiki.threadPages.some((page) => page.thread.key === thread.key && page.eventKeys.includes(event.key)))
})

test('deriveWorldWiki reads project-wide draft wiki metadata before project summary', () => {
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      project: {
        id: 'project-1',
        name: 'Echoes of Aetheria',
        slug: 'echoes-of-aetheria',
        summary: 'Fallback project summary.',
        visibility: 'private',
      },
      draft: {
        id: 'draft-1',
        name: 'Draft 1',
        version: 1,
        isPrimary: true,
        updatedAt: '2026-04-28T08:00:00.000Z',
        metadata: {
          worldWiki: {
            title: 'The Archive That Eats Names',
            logline: 'A memory-walking archivist must save a city from forgetting itself.',
            synopsis: 'The draft-level wiki synopsis wins over the project summary.',
            genre: 'fantasy mystery',
            themes: ['memory', 'inheritance'],
            toneTags: ['melancholic'],
            coreConflict: 'The archive preserves memory by consuming the people who use it.',
            visualMotifs: ['crystal stacks'],
          },
        },
      },
    }),
    view: createView({
      key: 'world.view.wiki-overview',
      name: 'World Wiki',
      metadata: {
        viewKind: 'wiki_overview',
        wiki: {
          synopsis: 'View synopsis should not override global project wiki metadata.',
        },
      },
    }),
  })

  assert.equal(wiki.title, 'The Archive That Eats Names')
  assert.equal(wiki.overview.title, 'The Archive That Eats Names')
  assert.equal(wiki.overview.logline, 'A memory-walking archivist must save a city from forgetting itself.')
  assert.equal(wiki.overview.synopsis, 'The draft-level wiki synopsis wins over the project summary.')
  assert.equal(wiki.overview.genre, 'fantasy mystery')
  assert.deepEqual(wiki.overview.themes, ['memory', 'inheritance'])
  assert.deepEqual(wiki.overview.visualMotifs, ['crystal stacks'])
})

test('deriveWorldWiki does not use project name as the content title fallback', () => {
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      project: {
        id: 'project-1',
        name: 'My private workspace name',
        slug: 'workspace-name',
        summary: '',
        visibility: 'private',
      },
    }),
  })

  assert.equal(wiki.title, 'Untitled World')
  assert.equal(wiki.overview.title, 'Untitled World')
})

test('deriveWorldWiki reports stale project wiki fingerprints', () => {
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      draft: {
        id: 'draft-1',
        name: 'Draft 1',
        version: 1,
        isPrimary: true,
        updatedAt: '2026-04-28T08:00:00.000Z',
        metadata: {
          worldWiki: {
            logline: 'Old logline.',
            synopsis: 'Old synopsis that is long enough to count as existing wiki presentation metadata.',
            generatedFromFingerprint: 'old-fingerprint',
          },
        },
      },
      worldEntities: [
        createEntity({ key: 'world.actor.lira', name: 'Lira', nodeType: 'actor', summary: 'A memory archivist.' }),
      ],
    }),
  })

  assert.equal(wiki.overview.stale, true)
  assert.ok(wiki.gaps.some((gap) => gap.kind === 'wiki_refresh'))
  assert.ok(wiki.diagnostics.some((diagnostic) => diagnostic.includes('stale')))
})

test('deriveWorldWiki reports gaps for missing presentation summaries and floating chronology', () => {
  const first = createEntity({ key: 'world.event.first', name: 'First Event', nodeType: 'event' })
  const second = createEntity({ key: 'world.event.second', name: 'Second Event', nodeType: 'event' })
  const actor = createEntity({ key: 'world.actor.mira', name: 'Mira Sol', nodeType: 'actor' })
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({ worldEntities: [first, second, actor] }),
    view: createView({
      key: 'world.view.wiki-overview',
      name: 'World Wiki',
      metadata: { viewKind: 'wiki_overview' },
    }),
  })

  assert.ok(wiki.gaps.some((gap) => gap.kind === 'world_logline'))
  assert.ok(wiki.gaps.some((gap) => gap.kind === 'entity_summary' && gap.entityKey === actor.key))
  assert.ok(wiki.gaps.some((gap) => gap.kind === 'timeline_order'))
})

test('deriveWorldWiki uses sequence units for story flow before falling back to events', () => {
  const chapter = createEntity({
    key: 'world.sequence.opening',
    name: 'Opening Chapter',
    nodeType: 'sequence_unit',
    summary: 'The authored opening chapter.',
    customProperties: {
      sequence: {
        unitKind: 'chapter',
        sequenceKey: 'main',
        ordinal: 1,
        synopsis: 'The protagonist accepts the call.',
        outcome: 'The safe life is no longer possible.',
        consequences: [{ cause: 'The call exposes a hidden threat.', effect: 'The protagonist leaves home.', consequenceType: 'plot' }],
      },
    },
  })
  const event = createEntity({ key: 'world.event.call', name: 'The Call', nodeType: 'event' })
  const thread = createThread({
    key: 'world.thread.opening',
    title: 'Opening Arc',
    linkedEntityKeys: [chapter.key, event.key],
  })
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      worldEntities: [chapter, event],
      worldThreads: [thread],
    }),
  })
  const storyFlow = wiki.sections.find((section) => section.kind === 'timeline')
  const threadPage = wiki.threadPages.find((page) => page.thread.key === thread.key)

  assert.deepEqual(storyFlow?.entityKeys, [chapter.key])
  assert.ok(storyFlow?.summary.includes('authored story beat'))
  assert.deepEqual(threadPage?.sequenceUnitKeys, [chapter.key])
  assert.deepEqual(threadPage?.eventKeys, [event.key])
})

test('deriveWorldWiki scopes custom wiki views to source entities', () => {
  const included = createEntity({ key: 'world.actor.included', name: 'Included', nodeType: 'actor', summary: 'Included profile.' })
  const hidden = createEntity({ key: 'world.actor.hidden', name: 'Hidden', nodeType: 'actor', summary: 'Hidden profile.' })
  const view = createView({
    key: 'world.view.wiki.custom.court',
    name: 'Court Wiki',
    metadata: {
      viewKind: 'wiki_custom',
      sourceEntityKeys: [included.key],
    },
  })
  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({ worldEntities: [included, hidden] }),
    view,
  })

  assert.deepEqual(wiki.entityProfiles.map((profile) => profile.entity.key), [included.key])
  assert.ok(wiki.sections.find((section) => section.kind === 'cast')?.entityKeys.includes(included.key))
  assert.equal(wiki.sections.find((section) => section.kind === 'cast')?.entityKeys.includes(hidden.key), false)
  assert.equal(wiki.title, 'Court Wiki')
})

test('readWorldEntityWikiPresentation accepts custom presentation metadata without requiring every field', () => {
  const entity = createEntity({
    key: 'world.actor.kael',
    name: 'Kael Dravon',
    nodeType: 'actor',
    customProperties: {
      wiki: {
        roleLabel: 'Mentor',
      },
    },
  })

  assert.equal(readWorldEntityWikiPresentation(entity).roleLabel, 'Mentor')
  assert.equal(readWorldEntityWikiPresentation(entity).synopsis, '')
})
