import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyChoice,
  applyInteractiveOutcome,
  applyInteractiveTrade,
  buildInteractivePrototypeModel,
  collectInteractiveSystemRequirements,
  compileInteractiveManifest,
  createInitialRuntimeState,
  evaluateInteractiveCondition,
  evaluateInteractiveSystemReadiness,
  getAvailableChoices,
  moveToLocation,
} from './interactiveSystems.ts'
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

function relationship(input: Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'ai',
    notes: '',
    state: 'confirmed',
    metadata: {},
  }
}

test('collects interactive requirements from app and interactive custom properties', () => {
  const requirements = collectInteractiveSystemRequirements({
    entities: [
      entity({
        key: 'app',
        name: 'Creator Credits',
        nodeType: 'app',
        customProperties: { app: { interactiveSystems: ['currency', 'progression_tokens'] } },
      }),
      entity({
        key: 'feature',
        name: 'Template Unlocks',
        nodeType: 'feature',
        customProperties: { interactive: { requiredSystems: ['conditions', 'outcomes'] } },
      }),
    ],
  })

  assert.deepEqual(requirements.sort(), ['conditions', 'currency', 'outcomes', 'progression_tokens'].sort())
})

test('validates app-style interactive systems without requiring RPG world content', () => {
  const entities = [
    entity({ key: 'app', name: 'Credit App', nodeType: 'app', customProperties: { app: { interactiveSystems: ['currency', 'conditions', 'outcomes'] } } }),
    entity({ key: 'credits', name: 'Generation Credits', nodeType: 'currency' }),
    entity({ key: 'choice.export', name: 'Export HD', nodeType: 'choice' }),
    entity({ key: 'condition.credits', name: 'Has Credits', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'has_currency', targetKey: 'credits', operator: 'gte', quantity: 1 } } } }),
    entity({ key: 'outcome.spend', name: 'Spend Credit', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'remove_currency', targetKey: 'credits', quantity: 1 } } } }),
  ]
  const relationships = [
    relationship({ key: 'r1', sourceEntityKey: 'choice.export', targetEntityKey: 'condition.credits', verb: 'requires_currency' }),
    relationship({ key: 'r2', sourceEntityKey: 'choice.export', targetEntityKey: 'outcome.spend', verb: 'sets_state' }),
  ]

  const readiness = evaluateInteractiveSystemReadiness({
    entities,
    relationships,
    requiredSystems: ['currency', 'conditions', 'outcomes'],
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.blockers.length, 0)
})

test('compiles a generic interactive manifest from app screens and shared system nodes', () => {
  const manifest = compileInteractiveManifest({
    entities: [
      entity({ key: 'screen.home', name: 'Home', nodeType: 'screen' }),
      entity({ key: 'screen.export', name: 'Export', nodeType: 'screen' }),
      entity({ key: 'inventory.default', name: 'Default Wallet', nodeType: 'inventory', customProperties: { interactive: { currency: { credits: 3 }, tokenKeys: ['token.proof'] } } }),
      entity({ key: 'credits', name: 'Credits', nodeType: 'currency' }),
      entity({ key: 'token.proof', name: 'Proof Viewed', nodeType: 'shadow_token' }),
      entity({ key: 'choice.export', name: 'Export HD', nodeType: 'choice' }),
      entity({ key: 'outcome.export', name: 'Spend Credit', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'remove_currency', targetKey: 'credits', quantity: 1 } } } }),
    ],
    relationships: [
      relationship({ key: 'branch', sourceEntityKey: 'choice.export', targetEntityKey: 'screen.export', verb: 'branches_to' }),
      relationship({ key: 'outcome', sourceEntityKey: 'choice.export', targetEntityKey: 'outcome.export', verb: 'sets_state' }),
    ],
    requiredSystems: ['currency', 'progression_tokens', 'outcomes'],
  })

  assert.equal(manifest.initialState.currency.credits, 3)
  assert.equal(manifest.initialState.currentLocationKey, 'screen.home')
  assert.equal(manifest.choices[0]?.branchesTo[0], 'screen.export')
})

test('evaluates conditions, applies outcomes, and executes trades as reusable runtime primitives', () => {
  const initialState = {
    inventoryKeys: ['item.seed'],
    currency: { credits: 2 },
    tokenKeys: [],
    state: {},
    stats: {},
    currentLocationKey: null,
    currentSpotKey: null,
    currentSceneKey: null,
    currentDialogueKey: null,
    visitedLocationKeys: [],
  }

  assert.equal(evaluateInteractiveCondition({ kind: 'has_currency', targetKey: 'credits', operator: 'gte', quantity: 2 }, initialState), true)
  const unlocked = applyInteractiveOutcome({ kind: 'grant_token', targetKey: 'token.premium' }, initialState)
  assert.deepEqual(unlocked.tokenKeys, ['token.premium'])
  const traded = applyInteractiveTrade({
    gives: [{ key: 'item.template', quantity: 1 }],
    receives: [{ key: 'item.seed', quantity: 1 }],
    currencyCost: { currencyKey: 'credits', amount: 1 },
  }, initialState)
  assert.deepEqual(traded.inventoryKeys, ['item.template'])
  assert.equal(traded.currency.credits, 1)
})

test('compiles player initial config and stats into runtime state', () => {
  const manifest = compileInteractiveManifest({
    entities: [
      entity({ key: 'screen.home', name: 'Home', nodeType: 'screen' }),
      entity({ key: 'scene.guard', name: 'Guard Scene', nodeType: 'narrative_scene' }),
      entity({ key: 'dialogue.guard', name: 'Guard Dialogue', nodeType: 'dialogue_node' }),
      entity({ key: 'stat.wit', name: 'Wit', nodeType: 'player_stat', customProperties: { interactive: { defaultValue: 2, min: 0, max: 5, displayLabel: 'Wit' } } }),
      entity({ key: 'stat.suspicion', name: 'Suspicion', nodeType: 'player_stat', customProperties: { interactive: { defaultValue: 0, min: 0, max: 5 } } }),
      entity({ key: 'config.start', name: 'Start Config', nodeType: 'player_initial_config', customProperties: { interactive: { initialItemKeys: ['item.pass'], currency: { coins: 4 }, stats: { 'stat.wit': 3 }, startSceneKey: 'scene.guard', startDialogueKey: 'dialogue.guard' } } }),
      entity({ key: 'item.pass', name: 'Forged Pass', nodeType: 'inventory_item' }),
    ],
    relationships: [],
    requiredSystems: ['initial_config', 'stats', 'inventory', 'dialogue'],
  })
  const state = createInitialRuntimeState(manifest)

  assert.deepEqual(state.inventoryKeys, ['item.pass'])
  assert.equal(state.currency.coins, 4)
  assert.equal(state.stats['stat.wit'], 3)
  assert.equal(state.stats['stat.suspicion'], 0)
  assert.equal(state.currentSceneKey, 'scene.guard')
  assert.equal(state.currentDialogueKey, 'dialogue.guard')
})

test('evaluates stat gates and applies stat outcomes', () => {
  const state = {
    inventoryKeys: [],
    currency: {},
    tokenKeys: [],
    stats: { wit: 2, suspicion: 1 },
    state: {},
    currentLocationKey: null,
    currentSpotKey: null,
    currentSceneKey: null,
    currentDialogueKey: null,
    visitedLocationKeys: [],
  }

  assert.equal(evaluateInteractiveCondition({ kind: 'stat_gte', targetKey: 'wit', quantity: 2 }, state), true)
  assert.equal(evaluateInteractiveCondition({ kind: 'stat_lte', targetKey: 'suspicion', quantity: 0 }, state), false)
  const next = applyInteractiveOutcome({ kind: 'increase_stat', targetKey: 'suspicion', quantity: 2 }, state)
  assert.equal(next.stats.suspicion, 3)
  const calmer = applyInteractiveOutcome({ kind: 'decrease_stat', targetKey: 'suspicion', quantity: 1 }, next)
  assert.equal(calmer.stats.suspicion, 2)
})

test('applies dialogue choice transitions with item and stat conditions', () => {
  const manifest = compileInteractiveManifest({
    entities: [
      entity({ key: 'dialogue.guard', name: 'Guard Dialogue', nodeType: 'dialogue_node' }),
      entity({ key: 'scene.entry', name: 'Dock Entry', nodeType: 'narrative_scene' }),
      entity({ key: 'choice.flatter', name: 'Flatter the guard', nodeType: 'choice' }),
      entity({ key: 'condition.pass', name: 'Has Pass', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'has_item', targetKey: 'item.pass' } } } }),
      entity({ key: 'condition.wit', name: 'Wit Enough', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'stat_gte', targetKey: 'stat.wit', quantity: 2 } } } }),
      entity({ key: 'outcome.trust', name: 'Gain Trust', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'grant_token', targetKey: 'token.guard-trust' } } } }),
      entity({ key: 'outcome.suspicion', name: 'Raise Suspicion', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'increase_stat', targetKey: 'stat.suspicion', quantity: 1 } } } }),
      entity({ key: 'item.pass', name: 'Forged Pass', nodeType: 'inventory_item' }),
      entity({ key: 'token.guard-trust', name: 'Guard Trust', nodeType: 'shadow_token' }),
      entity({ key: 'stat.wit', name: 'Wit', nodeType: 'player_stat', customProperties: { interactive: { defaultValue: 2 } } }),
      entity({ key: 'stat.suspicion', name: 'Suspicion', nodeType: 'player_stat', customProperties: { interactive: { defaultValue: 0 } } }),
    ],
    relationships: [
      relationship({ key: 'dialogue-choice', sourceEntityKey: 'dialogue.guard', targetEntityKey: 'choice.flatter', verb: 'contains' }),
      relationship({ key: 'choice-condition-pass', sourceEntityKey: 'choice.flatter', targetEntityKey: 'condition.pass', verb: 'requires_item' }),
      relationship({ key: 'choice-condition-wit', sourceEntityKey: 'choice.flatter', targetEntityKey: 'condition.wit', verb: 'requires_stat' }),
      relationship({ key: 'choice-outcome-trust', sourceEntityKey: 'choice.flatter', targetEntityKey: 'outcome.trust', verb: 'grants_token' }),
      relationship({ key: 'choice-outcome-suspicion', sourceEntityKey: 'choice.flatter', targetEntityKey: 'outcome.suspicion', verb: 'modifies_stat' }),
      relationship({ key: 'choice-branch', sourceEntityKey: 'choice.flatter', targetEntityKey: 'scene.entry', verb: 'branches_to' }),
    ],
    requiredSystems: ['dialogue', 'conditions', 'outcomes', 'inventory', 'stats'],
  })
  const state = createInitialRuntimeState(manifest)
  state.inventoryKeys = ['item.pass']

  const available = getAvailableChoices(manifest, state, 'dialogue.guard')
  assert.equal(available[0]?.available, true)
  const next = applyChoice(manifest, state, 'choice.flatter')
  assert.deepEqual(next.tokenKeys, ['token.guard-trust'])
  assert.equal(next.stats['stat.suspicion'], 1)
  assert.equal(next.currentSceneKey, 'scene.entry')
})

test('validates missing stat definitions and initial config start targets', () => {
  const readiness = evaluateInteractiveSystemReadiness({
    entities: [
      entity({ key: 'config.start', name: 'Start Config', nodeType: 'player_initial_config', customProperties: { interactive: { startSceneKey: 'scene.missing' } } }),
      entity({ key: 'condition.wit', name: 'Wit Gate', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'stat_gte', targetKey: 'stat.wit', quantity: 2 } } } }),
    ],
    relationships: [],
    requiredSystems: ['initial_config', 'stats', 'conditions'],
  })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockers.some((finding) => finding.message.includes('player stat')))
  assert.ok(readiness.blockers.some((finding) => finding.message.includes('scene.missing')))
})

test('moves through travel links using compiled state-machine manifest', () => {
  const manifest = compileInteractiveManifest({
    entities: [
      entity({ key: 'place.market', name: 'Market', nodeType: 'place' }),
      entity({ key: 'place.docks', name: 'Docks', nodeType: 'place' }),
      entity({ key: 'travel.market-docks', name: 'To Docks', nodeType: 'travel_link' }),
    ],
    relationships: [
      relationship({ key: 'starts', sourceEntityKey: 'travel.market-docks', targetEntityKey: 'place.market', verb: 'starts_at' }),
      relationship({ key: 'travels', sourceEntityKey: 'travel.market-docks', targetEntityKey: 'place.docks', verb: 'travels_to' }),
    ],
    requiredSystems: ['travel'],
  })
  const next = moveToLocation(manifest, createInitialRuntimeState(manifest), 'travel.market-docks')

  assert.equal(next.currentLocationKey, 'place.docks')
  assert.ok(next.visitedLocationKeys.includes('place.docks'))
})

test('builds interactive prototype model blockers and playable start state', () => {
  const incomplete = buildInteractivePrototypeModel({
    entities: [entity({ key: 'dialogue.intro', name: 'Intro', nodeType: 'dialogue_node' })],
    relationships: [],
    requiredSystems: ['initial_config', 'dialogue'],
  })
  assert.equal(incomplete.ready, false)
  assert.ok(incomplete.blockers.some((message) => /player_initial_config/i.test(message)))

  const playable = buildInteractivePrototypeModel({
    entities: [
      entity({ key: 'config', name: 'Initial Config', nodeType: 'player_initial_config', customProperties: { interactive: { startDialogueKey: 'dialogue.intro', stats: { wit: 2 } } } }),
      entity({ key: 'dialogue.intro', name: 'Intro', nodeType: 'dialogue_node' }),
      entity({ key: 'choice.ask', name: 'Ask Cleverly', nodeType: 'choice' }),
      entity({ key: 'condition.wit', name: 'Wit Gate', nodeType: 'choice_condition', customProperties: { interactive: { condition: { kind: 'stat_gte', targetKey: 'wit', value: 2 } } } }),
      entity({ key: 'outcome.scene', name: 'Set Scene', nodeType: 'choice_outcome', customProperties: { interactive: { outcome: { kind: 'set_current_scene', targetKey: 'scene.win' } } } }),
      entity({ key: 'scene.win', name: 'Won Scene', nodeType: 'narrative_scene' }),
    ],
    relationships: [
      relationship({ key: 'dialogue-choice', sourceEntityKey: 'dialogue.intro', targetEntityKey: 'choice.ask', verb: 'contains' }),
      relationship({ key: 'choice-condition', sourceEntityKey: 'choice.ask', targetEntityKey: 'condition.wit', verb: 'requires_stat' }),
      relationship({ key: 'choice-outcome', sourceEntityKey: 'choice.ask', targetEntityKey: 'outcome.scene', verb: 'sets_state' }),
    ],
    requiredSystems: ['initial_config', 'dialogue', 'conditions', 'outcomes', 'stats'],
  })

  assert.equal(playable.ready, true)
  assert.equal(playable.startState?.currentDialogueKey, 'dialogue.intro')
  assert.equal(playable.startState?.stats.wit, 2)
  assert.equal(playable.manifest?.choices.length, 1)
})
