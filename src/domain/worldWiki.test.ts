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
            artStyleDescription: 'Candlelit gothic fantasy with luminous memory crystals and rain-dark archive halls.',
            brandAtlasPrompt: 'A cinematic fantasy brand atlas board of crystal stacks, ink-black archive halls, rain, vellum maps, and violet lantern light.',
            colorScheme: {
              primary: '#7c3aed violet memory light',
              secondary: '#0f172a archive midnight',
              tertiary: '#d6b46a aged parchment gold',
            },
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
  assert.equal(wiki.overview.artStyleDescription, 'Candlelit gothic fantasy with luminous memory crystals and rain-dark archive halls.')
  assert.equal(wiki.overview.brandAtlasPrompt.includes('fantasy brand atlas board'), true)
  assert.equal(wiki.overview.colorScheme.primary, '#7c3aed violet memory light')
  assert.equal(wiki.sections.some((section) => section.kind === 'style' && section.title === 'Art Direction'), true)
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
  assert.ok(wiki.gaps.some((gap) => gap.kind === 'world_art_style'))
  assert.ok(wiki.gaps.some((gap) => gap.kind === 'brand_atlas_prompt'))
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

test('deriveWorldWiki splits app graph nodes into app-specific wiki sections', () => {
  const app = createEntity({
    key: 'world.app.daily-creature',
    name: 'Daily Creature',
    nodeType: 'app',
    summary: 'Turns a parent moment into a magical creature card.',
  })
  const flow = createEntity({
    key: 'world.user_flow.first-generation',
    name: 'First Generation Flow',
    nodeType: 'user_flow',
    summary: 'Onboarding through first creature reveal.',
  })
  const screen = createEntity({
    key: 'world.screen.creature-reveal',
    name: 'Creature Reveal Screen',
    nodeType: 'screen',
    summary: 'Shows the generated creature card and share CTA.',
  })
  const api = createEntity({
    key: 'world.api_endpoint.generate-creature',
    name: 'POST /api/generate-creature',
    nodeType: 'api_endpoint',
    summary: 'Generates the creature card from a daily moment.',
  })
  const capability = createEntity({
    key: 'world.capability.share-sheet',
    name: 'Share Sheet',
    nodeType: 'capability',
    summary: 'Shares creature cards from iOS with a web fallback.',
  })
  const tower = createEntity({
    key: 'world.tower.generation',
    name: 'Generation Tower',
    nodeType: 'tower',
    summary: 'Owns the app generation flow implementation slice.',
  })
  const codeFile = createEntity({
    key: 'world.code_file.app-generate',
    name: 'app/(tabs)/generate.tsx',
    nodeType: 'code_file',
    summary: 'Expo Router screen for the generation flow.',
  })

  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      worldEntities: [app, flow, screen, api, capability, tower, codeFile],
    }),
  })

  assert.equal(wiki.sections.some((section) => section.kind === 'app' && section.title === 'App System'), false)
  assert.deepEqual(
    wiki.sections
      .filter((section) => section.entityKeys.length > 0)
      .map((section) => section.kind),
    ['overview', 'app_product', 'app_flows', 'app_screens', 'app_backend', 'app_capabilities', 'app_towers', 'app_code_files'],
  )
  assert.deepEqual(wiki.sections.find((section) => section.kind === 'app_screens')?.entityKeys, [screen.key])
  assert.deepEqual(wiki.sections.find((section) => section.kind === 'app_backend')?.entityKeys, [api.key])
  assert.deepEqual(wiki.sections.find((section) => section.kind === 'app_towers')?.entityKeys, [tower.key])
  assert.deepEqual(wiki.sections.find((section) => section.kind === 'app_code_files')?.entityKeys, [codeFile.key])
  assert.equal(wiki.sections.some((section) => section.kind === 'style' && section.title === 'Brand & Visual System'), true)
  const colorGap = wiki.gaps.find((gap) => gap.kind === 'color_scheme')
  assert.ok(colorGap)
  assert.equal(colorGap.prompt.includes('Targeted app wiki metadata task'), true)
  assert.equal(colorGap.prompt.includes('update_world_wiki_metadata'), true)
  assert.equal(wiki.sections.some((section) => section.kind === 'cast'), false)
})

test('deriveWorldWiki splits narrative RPG game nodes into game-specific wiki sections', () => {
  const spot = createEntity({
    key: 'world.location_spot.market',
    name: 'Moon Market',
    nodeType: 'location_spot',
    summary: 'A playable marketplace spot.',
  })
  const item = createEntity({
    key: 'world.inventory_item.charm',
    name: 'Glass Charm',
    nodeType: 'inventory_item',
    summary: 'A barter item.',
  })
  const market = createEntity({
    key: 'world.marketplace.stall',
    name: 'Lantern Stall',
    nodeType: 'marketplace',
    summary: 'Trades charms for passage.',
  })
  const scene = createEntity({
    key: 'world.narrative_scene.vendor',
    name: 'Vendor Scene',
    nodeType: 'narrative_scene',
    summary: 'A branching vendor encounter.',
  })
  const choice = createEntity({
    key: 'world.choice.buy-key',
    name: 'Buy the Key',
    nodeType: 'choice',
    summary: 'A dialogue choice with a cost.',
  })
  const token = createEntity({
    key: 'world.shadow_token.vendor-trust',
    name: 'Vendor Trust',
    nodeType: 'shadow_token',
    summary: 'Hidden progression flag.',
  })

  const wiki = deriveWorldWiki({
    snapshot: createSnapshot({
      worldEntities: [spot, item, market, scene, choice, token],
    }),
  })

  assert.deepEqual(
    wiki.sections
      .filter((section) => section.entityKeys.length > 0)
      .map((section) => section.kind),
    ['overview', 'game_inventory', 'game_economy', 'game_travel', 'game_narrative', 'game_dialogue', 'game_progression'],
  )
  assert.equal(wiki.sections.some((section) => section.kind === 'cast'), false)
  assert.ok(wiki.gaps.some((gap) => gap.sectionKind === 'game_quests'))
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
