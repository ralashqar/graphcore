import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compileNarrativeRpgManifest,
  evaluateNarrativeRpgReadiness,
  gameChoiceConditionSchema,
  gameChoiceOutcomeSchema,
  gameSystemNodeTypeSchema,
} from './gameGraph.ts'
import type { WorldEntity, WorldRelationship } from './worldGraph.ts'

function entity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
  return {
    id: input.key,
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

test('narrative RPG schemas cover executable graph nodes and choice contracts', () => {
  assert.equal(gameSystemNodeTypeSchema.parse('dialogue_node'), 'dialogue_node')
  assert.equal(gameSystemNodeTypeSchema.parse('shadow_token'), 'shadow_token')
  assert.equal(gameChoiceConditionSchema.parse({ kind: 'has_item', targetKey: 'world.inventory_item.key' }).kind, 'has_item')
  assert.equal(gameChoiceOutcomeSchema.parse({ kind: 'grant_token', targetKey: 'world.shadow_token.gate' }).kind, 'grant_token')
})

test('readiness detects missing executable game graph layers', () => {
  const readiness = evaluateNarrativeRpgReadiness({
    entities: [
      entity({ key: 'world.actor.vendor', name: 'Vendor', nodeType: 'actor' }),
      entity({ key: 'world.place.market', name: 'Market', nodeType: 'place' }),
      entity({ key: 'world.choice.buy', name: 'Buy', nodeType: 'choice' }),
    ],
    relationships: [],
  })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockers.some((finding) => finding.category === 'Inventory'))
  assert.ok(readiness.blockers.some((finding) => finding.message.includes('Buy needs an outcome')))
})

test('compiles a playable runtime manifest from narrative RPG graph nodes', () => {
  const entities = [
    entity({ key: 'world.actor.vendor', name: 'Vendor', nodeType: 'actor' }),
    entity({ key: 'world.place.market', name: 'Moon Market', nodeType: 'place' }),
    entity({ key: 'world.location_spot.stall', name: 'Lantern Stall', nodeType: 'location_spot' }),
    entity({ key: 'world.inventory.starter', name: 'Starter Inventory', nodeType: 'inventory', customProperties: { game: { initialItemKeys: ['world.inventory_item.charm'], currency: { 'world.currency.moon': 3 } } } }),
    entity({ key: 'world.inventory_item.charm', name: 'Glass Charm', nodeType: 'inventory_item' }),
    entity({ key: 'world.currency.moon', name: 'Moon Coin', nodeType: 'currency' }),
    entity({ key: 'world.shadow_token.trust', name: 'Vendor Trust', nodeType: 'shadow_token' }),
    entity({ key: 'world.marketplace.stall', name: 'Charm Stall', nodeType: 'marketplace' }),
    entity({ key: 'world.trade_offer.key', name: 'Buy Gate Key', nodeType: 'trade_offer', customProperties: { game: { offer: { gives: [{ key: 'world.inventory_item.key', quantity: 1 }], currencyCost: { currencyKey: 'world.currency.moon', amount: 2 } } } } }),
    entity({ key: 'world.inventory_item.key', name: 'Gate Key', nodeType: 'inventory_item' }),
    entity({ key: 'world.travel_link.gate', name: 'Gate Road', nodeType: 'travel_link' }),
    entity({ key: 'world.quest.first', name: 'First Errand', nodeType: 'quest' }),
    entity({ key: 'world.quest_step.buy-key', name: 'Buy Key', nodeType: 'quest_step' }),
    entity({ key: 'world.narrative_arc.market', name: 'Market Arc', nodeType: 'narrative_arc' }),
    entity({ key: 'world.narrative_scene.vendor', name: 'Vendor Scene', nodeType: 'narrative_scene' }),
    entity({ key: 'world.dialogue_node.vendor', name: 'Vendor Dialogue', nodeType: 'dialogue_node' }),
    entity({ key: 'world.choice.buy', name: 'Buy the key', nodeType: 'choice' }),
    entity({ key: 'world.choice_condition.has-charm', name: 'Has Charm', nodeType: 'choice_condition', customProperties: { game: { condition: { kind: 'has_item', targetKey: 'world.inventory_item.charm' } } } }),
    entity({ key: 'world.choice_outcome.grant-key', name: 'Grant Key', nodeType: 'choice_outcome', customProperties: { game: { outcome: { kind: 'grant_item', targetKey: 'world.inventory_item.key', quantity: 1 } } } }),
    entity({ key: 'world.state_variable.vendor-met', name: 'Vendor Met', nodeType: 'state_variable' }),
    entity({ key: 'world.game_rule.inventory', name: 'Inventory Rule', nodeType: 'game_rule' }),
    entity({ key: 'world.save_state.default', name: 'Default Save', nodeType: 'save_state' }),
  ]
  const relationships = [
    relationship({ key: 'r1', sourceEntityKey: 'world.location_spot.stall', targetEntityKey: 'world.place.market', verb: 'located_in' }),
    relationship({ key: 'r2', sourceEntityKey: 'world.marketplace.stall', targetEntityKey: 'world.trade_offer.key', verb: 'offers' }),
    relationship({ key: 'r3', sourceEntityKey: 'world.travel_link.gate', targetEntityKey: 'world.place.market', verb: 'starts_at' }),
    relationship({ key: 'r4', sourceEntityKey: 'world.travel_link.gate', targetEntityKey: 'world.location_spot.stall', verb: 'travels_to' }),
    relationship({ key: 'r5', sourceEntityKey: 'world.quest.first', targetEntityKey: 'world.quest_step.buy-key', verb: 'contains' }),
    relationship({ key: 'r6', sourceEntityKey: 'world.narrative_arc.market', targetEntityKey: 'world.narrative_scene.vendor', verb: 'contains' }),
    relationship({ key: 'r7', sourceEntityKey: 'world.narrative_scene.vendor', targetEntityKey: 'world.dialogue_node.vendor', verb: 'contains' }),
    relationship({ key: 'r8', sourceEntityKey: 'world.dialogue_node.vendor', targetEntityKey: 'world.choice.buy', verb: 'contains' }),
    relationship({ key: 'r9', sourceEntityKey: 'world.choice.buy', targetEntityKey: 'world.choice_condition.has-charm', verb: 'requires_item' }),
    relationship({ key: 'r10', sourceEntityKey: 'world.choice.buy', targetEntityKey: 'world.choice_outcome.grant-key', verb: 'grants_item' }),
    relationship({ key: 'r11', sourceEntityKey: 'world.choice.buy', targetEntityKey: 'world.narrative_scene.vendor', verb: 'branches_to' }),
  ]

  const manifest = compileNarrativeRpgManifest({ entities, relationships })

  assert.deepEqual(manifest.initialGameState.inventoryKeys, ['world.inventory_item.charm'])
  assert.equal(manifest.markets[0]?.offerKeys[0], 'world.trade_offer.key')
  assert.equal(manifest.dialogueNodes[0]?.choiceKeys[0], 'world.choice.buy')
  assert.equal(manifest.choices[0]?.branchesTo[0], 'world.narrative_scene.vendor')
})
