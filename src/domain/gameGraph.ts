import { z } from 'zod'

import {
  compileInteractiveManifest,
  interactiveConditionSchema,
  interactiveManifestSchema,
  interactiveOutcomeSchema,
  interactiveRelationshipVerbSchema,
  interactiveSystemNodeTypeSchema,
  interactiveTradeOfferSchema,
  readInteractiveProperties,
} from './interactiveSystems.ts'
import type { WorldEntity, WorldRelationship } from './worldGraph.ts'

export const gameSystemNodeTypeSchema = interactiveSystemNodeTypeSchema
export const narrativeRpgRelationshipVerbSchema = interactiveRelationshipVerbSchema
export const gameChoiceConditionSchema = interactiveConditionSchema
export const gameChoiceOutcomeSchema = interactiveOutcomeSchema
export const gameTradeOfferSchema = interactiveTradeOfferSchema
export const gameManifestSchema = interactiveManifestSchema.transform((manifest) => ({
  initialGameState: manifest.initialState,
  stats: manifest.stats,
  locations: manifest.locations,
  spots: manifest.spots,
  travelLinks: manifest.travelLinks,
  inventoryItems: manifest.inventoryItems,
  markets: manifest.markets,
  quests: manifest.quests,
  narrativeScenes: manifest.narrativeScenes,
  dialogueNodes: manifest.dialogueNodes,
  choices: manifest.choices,
  conditions: manifest.conditions,
  outcomes: manifest.outcomes,
  tradeOffers: manifest.tradeOffers,
}))

export type GameSystemNodeType = z.infer<typeof gameSystemNodeTypeSchema>
export type GameManifest = z.infer<typeof gameManifestSchema>

export type GameReadinessFinding = {
  category: 'World Content' | 'Inventory' | 'Economy' | 'Travel' | 'Narrative' | 'Dialogue' | 'Progression' | 'Rules'
  severity: 'blocker' | 'warning'
  message: string
  entityKey?: string
}

export type GameReadiness = {
  ready: boolean
  readinessPercent: number
  blockers: GameReadinessFinding[]
  warnings: GameReadinessFinding[]
  counts: Record<string, number>
  nextAction: string
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

export function readGameProperties(entity: Pick<WorldEntity, 'customProperties'>) {
  return readInteractiveProperties(entity)
}

function relationOut(relationships: WorldRelationship[], sourceKey: string, verbs: string[], targetTypes: string[], entityByKey: Map<string, WorldEntity>) {
  return relationships.some((relationship) => {
    if (relationship.sourceEntityKey !== sourceKey || !verbs.includes(relationship.verb)) return false
    const target = entityByKey.get(relationship.targetEntityKey)
    return target ? targetTypes.includes(target.nodeType) : false
  })
}

function relationSources(relationships: WorldRelationship[], targetKey: string, verbs: string[]) {
  return relationships.filter((relationship) => relationship.targetEntityKey === targetKey && verbs.includes(relationship.verb)).map((relationship) => relationship.sourceEntityKey)
}

function addFinding(target: GameReadinessFinding[], finding: GameReadinessFinding) {
  if (!target.some((existing) => existing.category === finding.category && existing.entityKey === finding.entityKey && existing.message === finding.message)) {
    target.push(finding)
  }
}

export function evaluateNarrativeRpgReadiness(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
}): GameReadiness {
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const entityByKey = new Map(activeEntities.map((entity) => [entity.key, entity] as const))
  const byType = (nodeType: string) => activeEntities.filter((entity) => entity.nodeType === nodeType)
  const blockers: GameReadinessFinding[] = []
  const warnings: GameReadinessFinding[] = []
  const requireLayer = (nodeType: string, label: string, category: GameReadinessFinding['category']) => {
    if (byType(nodeType).length === 0) addFinding(blockers, { category, severity: 'blocker', message: `Add at least one ${label}.` })
  }

  requireLayer('actor', 'character or NPC', 'World Content')
  requireLayer('place', 'major location', 'World Content')
  requireLayer('player_initial_config', 'player initial config', 'Rules')
  requireLayer('player_stat', 'player stat', 'Rules')
  requireLayer('inventory_item', 'inventory item', 'Inventory')
  requireLayer('inventory', 'starter inventory', 'Inventory')
  requireLayer('currency', 'currency', 'Economy')
  requireLayer('marketplace', 'marketplace', 'Economy')
  requireLayer('travel_link', 'travel link', 'Travel')
  requireLayer('location_spot', 'location spot', 'Travel')
  requireLayer('quest', 'quest', 'Narrative')
  requireLayer('narrative_scene', 'narrative scene', 'Narrative')
  requireLayer('dialogue_node', 'dialogue node', 'Dialogue')
  requireLayer('choice', 'choice', 'Dialogue')
  requireLayer('choice_condition', 'choice condition', 'Progression')
  requireLayer('choice_outcome', 'choice outcome', 'Progression')
  requireLayer('save_state', 'save state', 'Rules')

  for (const relationship of input.relationships) {
    if (!entityByKey.has(relationship.sourceEntityKey) || !entityByKey.has(relationship.targetEntityKey)) {
      addFinding(blockers, {
        category: 'Rules',
        severity: 'blocker',
        message: `${relationship.verb} references a missing endpoint.`,
      })
    }
  }

  for (const travelLink of byType('travel_link')) {
    if (!relationOut(input.relationships, travelLink.key, ['travels_to'], ['place', 'location_spot'], entityByKey)) {
      addFinding(blockers, { category: 'Travel', severity: 'blocker', message: `${travelLink.name} needs a travels_to destination.`, entityKey: travelLink.key })
    }
    if (!relationOut(input.relationships, travelLink.key, ['starts_at', 'located_in'], ['place', 'location_spot'], entityByKey)) {
      addFinding(warnings, { category: 'Travel', severity: 'warning', message: `${travelLink.name} should declare its origin place or spot.`, entityKey: travelLink.key })
    }
  }

  for (const marketplace of byType('marketplace')) {
    if (!relationOut(input.relationships, marketplace.key, ['offers'], ['trade_offer'], entityByKey)) {
      addFinding(blockers, { category: 'Economy', severity: 'blocker', message: `${marketplace.name} needs at least one trade offer.`, entityKey: marketplace.key })
    }
  }

  for (const tradeOffer of byType('trade_offer')) {
    const game = readGameProperties(tradeOffer)
    const parsed = gameTradeOfferSchema.safeParse(game.offer ?? game.tradeOffer ?? {})
    const hasRelationValue = relationOut(input.relationships, tradeOffer.key, ['costs', 'trades_for', 'grants_item'], ['inventory_item', 'currency'], entityByKey)
    if (!parsed.success || (parsed.data.gives.length === 0 && parsed.data.receives.length === 0 && !parsed.data.currencyCost && !hasRelationValue)) {
      addFinding(blockers, { category: 'Economy', severity: 'blocker', message: `${tradeOffer.name} needs valid gives/receives or cost data.`, entityKey: tradeOffer.key })
    }
  }

  for (const scene of byType('narrative_scene')) {
    if (!relationOut(input.relationships, scene.key, ['contains', 'speaks_to', 'branches_to'], ['dialogue_node', 'actor', 'narrative_scene'], entityByKey)) {
      addFinding(blockers, { category: 'Narrative', severity: 'blocker', message: `${scene.name} needs dialogue, a speaker, or a branch target.`, entityKey: scene.key })
    }
  }

  for (const dialogue of byType('dialogue_node')) {
    if (!relationOut(input.relationships, dialogue.key, ['contains'], ['choice'], entityByKey)) {
      addFinding(blockers, { category: 'Dialogue', severity: 'blocker', message: `${dialogue.name} needs at least one choice.`, entityKey: dialogue.key })
    }
  }

  for (const choice of byType('choice')) {
    const hasOutcome = relationOut(input.relationships, choice.key, ['branches_to', 'grants_item', 'grants_token', 'sets_state', 'unlocks'], ['choice_outcome', 'narrative_scene', 'dialogue_node', 'inventory_item', 'shadow_token', 'state_variable'], entityByKey)
    if (!hasOutcome) {
      addFinding(blockers, { category: 'Dialogue', severity: 'blocker', message: `${choice.name} needs an outcome or branch target.`, entityKey: choice.key })
    }
  }

  const grantedKeys = new Set(input.relationships.filter((relationship) => ['grants_item', 'grants_token', 'unlocks'].includes(relationship.verb)).map((relationship) => relationship.targetEntityKey))
  const initialKeys = new Set(byType('inventory').flatMap((inventory) => stringArray(readGameProperties(inventory).initialItemKeys)))
  for (const relationship of input.relationships.filter((entry) => ['requires_item', 'requires_token'].includes(entry.verb))) {
    if (!grantedKeys.has(relationship.targetEntityKey) && !initialKeys.has(relationship.targetEntityKey)) {
      const target = entityByKey.get(relationship.targetEntityKey)
      addFinding(blockers, {
        category: 'Progression',
        severity: 'blocker',
        message: `${target?.name ?? relationship.targetEntityKey} is required but never granted or included in starter inventory.`,
        entityKey: target?.key,
      })
    }
  }

  for (const token of byType('shadow_token')) {
    const granted = relationSources(input.relationships, token.key, ['grants_token', 'unlocks']).length > 0 || initialKeys.has(token.key)
    const consumed = relationSources(input.relationships, token.key, ['requires_token']).length > 0
    if (!granted || !consumed) {
      addFinding(warnings, {
        category: 'Progression',
        severity: 'warning',
        message: `${token.name} should be both granted and checked by progression gates.`,
        entityKey: token.key,
      })
    }
  }

  const categories: GameReadinessFinding['category'][] = ['World Content', 'Inventory', 'Economy', 'Travel', 'Narrative', 'Dialogue', 'Progression', 'Rules']
  const readyCount = categories.filter((category) => !blockers.some((finding) => finding.category === category)).length
  const readinessPercent = Math.round((readyCount / categories.length) * 100)
  const nextAction = blockers.length > 0
    ? `Fix ${blockers[0].category}`
    : warnings.length > 0 ? `Review ${warnings[0].category}` : 'Preview Playable Flow'

  return {
    ready: blockers.length === 0,
    readinessPercent,
    blockers,
    warnings,
    counts: Object.fromEntries(activeEntities.reduce((map, entity) => {
      map.set(entity.nodeType, (map.get(entity.nodeType) ?? 0) + 1)
      return map
    }, new Map<string, number>())),
    nextAction,
  }
}

export function compileNarrativeRpgManifest(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
}): GameManifest {
  return gameManifestSchema.parse({
    ...compileInteractiveManifest({
      entities: input.entities,
      relationships: input.relationships,
      requiredSystems: [
        'inventory',
        'currency',
        'progression_tokens',
        'state_variables',
        'conditions',
        'outcomes',
        'markets',
        'dialogue',
        'travel',
        'save_state',
      ],
    }),
  })
}
