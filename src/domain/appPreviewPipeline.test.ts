import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appScreenVisualSpecSchema,
  buildApprovedAppDesignBundle,
  buildAppGeneratedFileDrafts,
  buildRecommendedAppCodeFilePlan,
  computeAppDesignFingerprint,
  evaluateAppPreviewReadiness,
  readAppNodeProperties,
} from './appPreviewPipeline.ts'
import type { WorldEntity, WorldRelationship } from './worldGraph.ts'

function entity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
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
    source: input.source ?? 'ai',
    customProperties: input.customProperties ?? {},
    metadata: input.metadata ?? {},
  }
}

function relationship(input: Partial<WorldRelationship> & Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.id ?? input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: input.direction ?? 'outbound',
    strength: input.strength ?? null,
    confidence: input.confidence ?? null,
    source: input.source ?? 'ai',
    notes: input.notes ?? '',
    state: input.state ?? 'confirmed',
    metadata: input.metadata ?? {},
  }
}

const completeEntities = [
  entity({
    key: 'app',
    name: 'Daily Creature',
    nodeType: 'app',
    customProperties: { app: { coreLoop: 'check in -> reveal -> share' } },
  }),
  entity({ key: 'flow', name: 'Daily Flow', nodeType: 'user_flow' }),
  entity({
    key: 'home',
    name: 'Home Screen',
    nodeType: 'screen',
    summary: 'Daily landing screen.',
    customProperties: { app: { route: '/', purpose: 'Start the daily ritual', states: ['empty', 'success'], actions: ['CreateMoment'], dataDependencies: ['UserProfile'] } },
  }),
  entity({
    key: 'card',
    name: 'Daily Prompt Card',
    nodeType: 'component',
    customProperties: { app: { props: { title: 'string' }, states: ['idle'], filePath: 'components/DailyPromptCard.tsx' } },
  }),
  entity({ key: 'profile', name: 'User Profile', nodeType: 'data_model' }),
  entity({ key: 'create', name: 'Create Moment', nodeType: 'action' }),
  entity({
    key: 'api',
    name: 'Create Moment API',
    nodeType: 'api_endpoint',
    customProperties: { app: { method: 'POST', path: '/api/moments', inputSchema: { text: 'string' }, outputSchema: { id: 'string' } } },
  }),
  entity({
    key: 'camera',
    name: 'Camera',
    nodeType: 'capability',
    customProperties: { app: { capabilityRule: { webPreview: 'mocked', expoGo: 'supported', requiresDevBuild: false } } },
  }),
  entity({ key: 'style', name: 'Design System', nodeType: 'design_system' }),
  entity({ key: 'tower', name: 'Home Tower', nodeType: 'tower' }),
  entity({
    key: 'file',
    name: 'Home Route File',
    nodeType: 'code_file',
    customProperties: {
      app: {
        filePath: 'app/index.tsx',
        ownerTower: 'Home Tower',
        fileKind: 'route',
        exports: ['default'],
        imports: ['react-native'],
        dependsOn: ['components/DailyPromptCard.tsx'],
        implementationSummary: 'Render the approved home screen route.',
        publicInterface: 'Default Expo Router route component.',
        visualSpecRefs: ['mockup'],
        testExpectations: ['renders daily prompt card'],
      },
    },
  }),
  entity({
    key: 'mockup',
    name: 'Home Mockup',
    nodeType: 'screen_mockup',
    thumbnailAssetKey: 'home-screen-art',
    customProperties: {
      app: {
        screenKey: 'home',
        sourceAssetKey: 'home-screen-art',
        visualSpec: {
          screenKey: 'home',
          route: '/',
          sourceAssetKey: 'home-screen-art',
          viewport: { width: 390, height: 844, device: 'iphone' },
          layoutTree: [{ id: 'hero', role: 'header', frame: { x: 24, y: 64, width: 342, height: 120 }, style: {} }],
        },
      },
    },
  }),
] satisfies WorldEntity[]

test('evaluates app preview readiness with app-specific blockers', () => {
  const readiness = evaluateAppPreviewReadiness({
    draft: { metadata: { worldWiki: {} } },
    worldEntities: [
      entity({ key: 'app', name: 'Tiny App', nodeType: 'app' }),
      entity({ key: 'flow', name: 'First Run', nodeType: 'user_flow' }),
      entity({ key: 'home', name: 'Home', nodeType: 'screen' }),
    ],
    worldRelationships: [],
    assets: [],
  })

  assert.equal(readiness.gates.design_graph_draft, true)
  assert.equal(readiness.gates.design_graph_refined, false)
  assert.equal(readiness.nextAction, 'Refine Design Graph')
  assert.ok(readiness.readinessPercent > 0)
  assert.equal(readiness.categoryStatus.Components.ready, false)
  assert.ok(readiness.blockers.some((finding) => finding.category === 'Components'))
  assert.ok(readiness.blockers.every((finding) => !/threat|lore|motives|hidden truth|protagonist|sequence/i.test(finding.message)))
})

test('recognizes design prototype readiness without requiring code plan approval', () => {
  const readiness = evaluateAppPreviewReadiness({
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: completeEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  })

  assert.equal(readiness.gates.design_graph_refined, true)
  assert.equal(readiness.gates.visual_prototype_ready, true)
  assert.equal(readiness.gates.implementation_plan_ready, false)
  assert.equal(readiness.designApproved, false)
  assert.equal(readiness.categoryStatus.Screens.ready, true)
  assert.equal(readiness.nextAction, 'Approve Design For Build')
})

test('builds approved app design bundle with visual and interactive lock data', () => {
  const entities = [
    ...completeEntities,
    entity({
      key: 'config',
      name: 'Initial Config',
      nodeType: 'player_initial_config',
      customProperties: { interactive: { startDialogueKey: 'dialogue.intro', stats: { wit: 2 } } },
    }),
    entity({ key: 'dialogue.intro', name: 'Intro Dialogue', nodeType: 'dialogue_node' }),
    entity({ key: 'choice.trick', name: 'Outsmart The Clerk', nodeType: 'choice' }),
  ]
  const bundle = buildApprovedAppDesignBundle({
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: entities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
      relationship({ key: 'dialogue-choice', sourceEntityKey: 'dialogue.intro', targetEntityKey: 'choice.trick', verb: 'contains' }),
    ],
    assets: [],
    approvedAt: '2026-05-03T00:00:00.000Z',
    approvalId: 'approval-test',
  })

  assert.equal(bundle.status, 'approved')
  assert.equal(bundle.approvalId, 'approval-test')
  assert.equal(bundle.brandAtlasAssetKey, 'brand-atlas')
  assert.deepEqual(bundle.routeScreenKeys, ['home'])
  assert.deepEqual(bundle.screenMockupKeys, ['mockup'])
  assert.deepEqual(bundle.mockupAssetKeys, ['home-screen-art'])
  assert.equal(bundle.screens[0].mockups[0].visualSpecHash.length > 0, true)
  assert.equal(Object.keys(bundle.visualSpecHashes).includes('mockup'), true)
  assert.equal(bundle.interactiveSummary.choiceCount, 1)
})

test('requires design approval before implementation plan readiness', () => {
  const baseSnapshot = {
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: completeEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  }
  const designFingerprint = computeAppDesignFingerprint(baseSnapshot)
  const approvedEntities = completeEntities.map((entry) => (
    entry.key === 'app'
      ? entity({
        ...entry,
        customProperties: {
          ...entry.customProperties,
          app: {
            ...readAppNodeProperties(entry),
            designApproval: { status: 'approved', approvedAt: '2026-05-03T00:00:00.000Z', designFingerprint },
          },
        },
      })
      : entry
  ))
  const readiness = evaluateAppPreviewReadiness({
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: approvedEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  })

  assert.equal(readiness.gates.visual_prototype_ready, true)
  assert.equal(readiness.gates.implementation_plan_ready, true)
  assert.equal(readiness.designApproved, true)
  assert.equal(readiness.nextAction, 'Build Preview App')
})

test('detects stale approved app design when visual artifacts change', () => {
  const approvedEntities = completeEntities.map((entry) => (
    entry.key === 'app'
      ? entity({
        ...entry,
        customProperties: {
          ...entry.customProperties,
          app: {
            ...readAppNodeProperties(entry),
            designApproval: { status: 'approved', approvedAt: '2026-05-03T00:00:00.000Z', designFingerprint: 'old-fingerprint' },
          },
        },
      })
      : entry
  ))
  const readiness = evaluateAppPreviewReadiness({
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: approvedEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  })

  assert.equal(readiness.designApproved, true)
  assert.equal(readiness.designApprovalStale, true)
  assert.equal(readiness.gates.implementation_plan_ready, false)
  assert.ok(readiness.blockers.some((finding) => finding.category === 'Design Approval'))
})

test('does not stale approved app design when only code plan nodes change', () => {
  const snapshot = {
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: completeEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  }
  const designFingerprint = computeAppDesignFingerprint(snapshot)
  const approvedEntities = [
    ...completeEntities.map((entry) => (
      entry.key === 'app'
        ? entity({
          ...entry,
          customProperties: {
            ...entry.customProperties,
            app: {
              ...readAppNodeProperties(entry),
              designApproval: { status: 'approved', approvedAt: '2026-05-03T00:00:00.000Z', designFingerprint },
            },
          },
        })
        : entry
    )),
    entity({
      key: 'file.extra',
      name: 'Extra Code File',
      nodeType: 'code_file',
      customProperties: { app: { filePath: 'lib/extra.ts', ownerTower: 'Home Tower', fileKind: 'hook' } },
    }),
  ]

  const readiness = evaluateAppPreviewReadiness({
    ...snapshot,
    worldEntities: approvedEntities,
  })

  assert.equal(readiness.designApproved, true)
  assert.equal(readiness.designApprovalStale, false)
})

test('implementation readiness blocks incomplete code file contracts', () => {
  const snapshot = {
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Soft premium mobile UI.',
          brandAtlasPrompt: 'A polished app brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#123456', secondary: '#abcdef', tertiary: '#f5f5f5' },
        },
      },
    },
    worldEntities: completeEntities,
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
    ],
    assets: [],
  }
  const designFingerprint = computeAppDesignFingerprint(snapshot)
  const approvedEntities = completeEntities.map((entry) => (
    entry.key === 'app'
      ? entity({ ...entry, customProperties: { app: { ...readAppNodeProperties(entry), designApproval: { status: 'approved', approvedAt: '2026-05-03T00:00:00.000Z', designFingerprint } } } })
      : entry.key === 'file'
        ? entity({ ...entry, customProperties: { app: { filePath: 'app/index.tsx', ownerTower: 'Home Tower' } } })
        : entry
  ))

  const readiness = evaluateAppPreviewReadiness({
    ...snapshot,
    worldEntities: approvedEntities,
  })

  assert.equal(readiness.gates.implementation_plan_ready, false)
  assert.ok(readiness.blockers.some((finding) => finding.category === 'Code Files' && /fileKind/.test(finding.message)))
})

test('builds recommended code files from screens, components, data, APIs, and capabilities', () => {
  const plan = buildRecommendedAppCodeFilePlan(completeEntities)
  const paths = new Set(plan.files.map((file) => file.path))

  assert.ok(paths.has('app/index.tsx'))
  assert.ok(paths.has('components/DailyPromptCard.tsx'))
  assert.ok(paths.has('types/models.ts'))
  assert.ok(paths.has('lib/actions.ts'))
  assert.ok(paths.has('lib/capabilities/mockCapabilities.ts'))
  assert.ok(paths.has('lib/design/tokens.ts'))
})

test('validates app interactive system requirements without hardcoding an RPG template', () => {
  const readiness = evaluateAppPreviewReadiness({
    draft: {
      metadata: {
        worldWiki: {
          artStyleDescription: 'Premium creator utility UI.',
          brandAtlasPrompt: 'A crisp mobile tool brand atlas.',
          brandAtlasAssetKey: 'brand-atlas',
          colorScheme: { primary: '#111111', secondary: '#44cc88', tertiary: '#f7f7f7' },
        },
      },
    },
    worldEntities: [
      ...completeEntities.map((entry) => (
        entry.key === 'app'
          ? entity({
            ...entry,
            customProperties: {
              ...entry.customProperties,
              app: {
                ...readAppNodeProperties(entry),
                interactiveSystems: ['currency', 'conditions', 'outcomes', 'stats'],
              },
            },
          })
          : entry
      )),
      entity({ key: 'credits', name: 'Generation Credits', nodeType: 'currency' }),
      entity({ key: 'stat.wit', name: 'Wit', nodeType: 'player_stat', customProperties: { interactive: { defaultValue: 2 } } }),
      entity({ key: 'choice.export', name: 'Export HD', nodeType: 'choice' }),
      entity({
        key: 'condition.credits',
        name: 'Has Credits',
        nodeType: 'choice_condition',
        customProperties: { interactive: { condition: { kind: 'has_currency', targetKey: 'credits', operator: 'gte', quantity: 1 } } },
      }),
      entity({
        key: 'outcome.spend',
        name: 'Spend Credit',
        nodeType: 'choice_outcome',
        customProperties: { interactive: { outcome: { kind: 'remove_currency', targetKey: 'credits', quantity: 1 } } },
      }),
    ],
    worldRelationships: [
      relationship({ key: 'home-card', sourceEntityKey: 'home', targetEntityKey: 'card', verb: 'contains' }),
      relationship({ key: 'home-create', sourceEntityKey: 'home', targetEntityKey: 'create', verb: 'emits' }),
      relationship({ key: 'home-profile', sourceEntityKey: 'home', targetEntityKey: 'profile', verb: 'reads' }),
      relationship({ key: 'choice-condition', sourceEntityKey: 'choice.export', targetEntityKey: 'condition.credits', verb: 'requires_currency' }),
      relationship({ key: 'choice-outcome', sourceEntityKey: 'choice.export', targetEntityKey: 'outcome.spend', verb: 'sets_state' }),
    ],
    assets: [],
  })

  assert.equal(readiness.categoryStatus['Interactive Systems'].ready, true)
  assert.equal(readiness.blockers.some((finding) => finding.category === 'Interactive Systems'), false)
})

test('adds shared interactive runtime files when an app opts into interactive systems', () => {
  const plan = buildRecommendedAppCodeFilePlan([
    ...completeEntities,
    entity({
      key: 'credits',
      name: 'Generation Credits',
      nodeType: 'currency',
      customProperties: { interactive: { requiredSystems: ['currency'] } },
    }),
  ])
  const paths = new Set(plan.files.map((file) => file.path))

  assert.ok(paths.has('lib/interactive/InteractiveRuntime.ts'))
  assert.ok(paths.has('lib/interactive/MockInteractiveAdapters.ts'))
  assert.ok(paths.has('lib/interactive/interactiveManifest.ts'))
})

test('generated interactive manifest includes relationship-derived executable graph', () => {
  const entities = [
    ...completeEntities,
    entity({
      key: 'config',
      name: 'Initial Config',
      nodeType: 'player_initial_config',
      customProperties: { interactive: { startDialogueKey: 'dialogue.intro', stats: { wit: 2 }, currency: { credits: 1 } } },
    }),
    entity({ key: 'dialogue.intro', name: 'Intro Dialogue', nodeType: 'dialogue_node' }),
    entity({ key: 'choice.trick', name: 'Outsmart The Clerk', nodeType: 'choice' }),
    entity({ key: 'condition.wit', name: 'Wit Check', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'stat_gte', targetKey: 'wit', value: 2 } } } }),
    entity({ key: 'outcome.token', name: 'Gain Shadow Token', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'grant_token', targetKey: 'token.clue' } } } }),
    entity({ key: 'scene.done', name: 'Secret Learned', nodeType: 'narrative_scene' }),
    entity({ key: 'travel.market', name: 'Walk To Market', nodeType: 'travel_link' }),
    entity({ key: 'market', name: 'Market', nodeType: 'screen' }),
    entity({ key: 'shop', name: 'Shop', nodeType: 'marketplace' }),
    entity({ key: 'offer.map', name: 'Buy Map', nodeType: 'trade_offer', customProperties: { interactive: { offer: { currencyCost: { currencyKey: 'credits', amount: 1 }, gives: [{ key: 'map', quantity: 1 }] } } } }),
  ]
  const files = buildAppGeneratedFileDrafts({
    projectName: 'Interactive App',
    draftMetadata: {},
    entities,
    relationships: [
      relationship({ key: 'dialogue-choice', sourceEntityKey: 'dialogue.intro', targetEntityKey: 'choice.trick', verb: 'contains' }),
      relationship({ key: 'choice-condition', sourceEntityKey: 'choice.trick', targetEntityKey: 'condition.wit', verb: 'requires_stat' }),
      relationship({ key: 'choice-outcome', sourceEntityKey: 'choice.trick', targetEntityKey: 'outcome.token', verb: 'grants_token' }),
      relationship({ key: 'choice-branch', sourceEntityKey: 'choice.trick', targetEntityKey: 'scene.done', verb: 'branches_to' }),
      relationship({ key: 'travel-target', sourceEntityKey: 'travel.market', targetEntityKey: 'market', verb: 'travels_to' }),
      relationship({ key: 'shop-offer', sourceEntityKey: 'shop', targetEntityKey: 'offer.map', verb: 'offers' }),
    ],
  })
  const manifestFile = files.find((file) => file.path === 'lib/interactive/interactiveManifest.ts')

  assert.ok(manifestFile)
  assert.match(manifestFile.content, /dialogue\.intro/)
  assert.match(manifestFile.content, /choice\.trick/)
  assert.match(manifestFile.content, /condition\.wit/)
  assert.match(manifestFile.content, /scene\.done/)
  assert.match(manifestFile.content, /travel\.market/)
  assert.match(manifestFile.content, /offer\.map/)
})

test('parses app screen visual specs and app node properties', () => {
  const parsed = appScreenVisualSpecSchema.parse({
    screenKey: 'home',
    route: '/',
    sourceAssetKey: 'screen-home',
    viewport: { width: 390, height: 844, device: 'iphone' },
    layoutTree: [{
      id: 'hero',
      role: 'header',
      frame: { x: 24, y: 64, width: 342, height: 120 },
      style: { backgroundColor: '#fff' },
    }],
    requiredAssets: [{
      key: 'mascot',
      role: 'mascot',
      transparentBackground: true,
      prompt: 'Friendly translucent app mascot.',
      targetSize: '1024x1024',
    }],
  })
  assert.equal(parsed.viewport.device, 'iphone')
  assert.deepEqual(readAppNodeProperties(completeEntities[0]), { coreLoop: 'check in -> reveal -> share' })
})
