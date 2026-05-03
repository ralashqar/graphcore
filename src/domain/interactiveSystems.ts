import { z } from 'zod'

import type { WorldEntity, WorldRelationship } from './worldGraph.ts'

export const interactiveSystemKindSchema = z.enum([
  'initial_config',
  'inventory',
  'currency',
  'stats',
  'progression_tokens',
  'state_variables',
  'conditions',
  'outcomes',
  'markets',
  'dialogue',
  'travel',
  'save_state',
])

export const interactiveSystemNodeTypeSchema = z.enum([
  'player_profile',
  'player_initial_config',
  'player_stat',
  'inventory',
  'inventory_item',
  'currency',
  'shadow_token',
  'location_spot',
  'travel_link',
  'marketplace',
  'trade_offer',
  'quest',
  'quest_step',
  'narrative_arc',
  'narrative_scene',
  'dialogue_node',
  'choice',
  'choice_condition',
  'choice_outcome',
  'state_variable',
  'game_rule',
  'encounter',
  'save_state',
])

export const interactiveRelationshipVerbSchema = z.enum([
  'contains',
  'uses',
  'located_in',
  'available_at',
  'travels_to',
  'starts_at',
  'speaks_to',
  'offers',
  'costs',
  'trades_for',
  'requires_item',
  'requires_token',
  'requires_currency',
  'grants_item',
  'removes_item',
  'grants_token',
  'sets_state',
  'unlocks',
  'branches_to',
  'fails_to',
  'owned_by_player',
  'represented_by',
  'depends_on',
  'initializes',
  'defines_stat',
  'requires_stat',
  'modifies_stat',
  'starts_at_dialogue',
  'starts_at_scene',
])

export const interactiveConditionSchema = z.object({
  kind: z.enum(['has_item', 'has_token', 'has_currency', 'state_equals', 'visited_location', 'stat_eq', 'stat_gte', 'stat_lte', 'stat_gt', 'stat_lt']).default('has_item'),
  targetKey: z.string().default(''),
  operator: z.enum(['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'exists', 'missing']).default('exists'),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  quantity: z.number().int().nonnegative().optional(),
})

export const interactiveOutcomeSchema = z.object({
  kind: z.enum(['grant_item', 'remove_item', 'grant_token', 'remove_token', 'remove_currency', 'grant_currency', 'set_state', 'clear_state', 'set_stat', 'increase_stat', 'decrease_stat', 'clamp_stat', 'unlock', 'travel_to', 'branch_to', 'set_current_dialogue', 'set_current_scene']).default('set_state'),
  targetKey: z.string().default(''),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  quantity: z.number().int().nonnegative().optional(),
  summary: z.string().default(''),
})

export const interactivePlayerStatSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().default(''),
  displayLabel: z.string().default(''),
  defaultValue: z.number().default(0),
  min: z.number().optional(),
  max: z.number().optional(),
})

export const interactiveTradeOfferSchema = z.object({
  gives: z.array(z.object({ key: z.string(), quantity: z.number().int().positive().default(1) })).default([]),
  receives: z.array(z.object({ key: z.string(), quantity: z.number().int().positive().default(1) })).default([]),
  currencyCost: z.object({ currencyKey: z.string(), amount: z.number().int().nonnegative() }).optional(),
})

export const interactiveRuntimeStateSchema = z.object({
  inventoryKeys: z.array(z.string()).default([]),
  currency: z.record(z.string(), z.number().int().nonnegative()).default({}),
  tokenKeys: z.array(z.string()).default([]),
  stats: z.record(z.string(), z.number()).default({}),
  state: z.record(z.string(), z.unknown()).default({}),
  currentLocationKey: z.string().nullable().default(null),
  currentSpotKey: z.string().nullable().default(null),
  currentSceneKey: z.string().nullable().default(null),
  currentDialogueKey: z.string().nullable().default(null),
  visitedLocationKeys: z.array(z.string()).default([]),
})

export const interactiveInitialConfigSchema = z.object({
  inventoryKeys: z.array(z.string()).default([]),
  initialItemKeys: z.array(z.string()).default([]),
  currency: z.record(z.string(), z.number().int().nonnegative()).default({}),
  tokenKeys: z.array(z.string()).default([]),
  stats: z.record(z.string(), z.number()).default({}),
  state: z.record(z.string(), z.unknown()).default({}),
  currentLocationKey: z.string().nullable().optional(),
  startLocationKey: z.string().nullable().optional(),
  currentSpotKey: z.string().nullable().optional(),
  startSpotKey: z.string().nullable().optional(),
  currentSceneKey: z.string().nullable().optional(),
  startSceneKey: z.string().nullable().optional(),
  currentDialogueKey: z.string().nullable().optional(),
  startDialogueKey: z.string().nullable().optional(),
})

export const interactiveManifestSchema = z.object({
  requiredSystems: z.array(interactiveSystemKindSchema).default([]),
  initialState: interactiveRuntimeStateSchema,
  stats: z.array(interactivePlayerStatSchema).default([]),
  locations: z.array(z.object({ key: z.string(), name: z.string(), summary: z.string().default('') })).default([]),
  spots: z.array(z.object({ key: z.string(), name: z.string(), locationKey: z.string().nullable().default(null), summary: z.string().default('') })).default([]),
  travelLinks: z.array(z.object({ key: z.string(), name: z.string(), startsAtKeys: z.array(z.string()).default([]), travelsToKeys: z.array(z.string()).default([]) })).default([]),
  inventoryItems: z.array(z.object({ key: z.string(), name: z.string(), summary: z.string().default(''), kind: z.string().default('item') })).default([]),
  markets: z.array(z.object({ key: z.string(), name: z.string(), offerKeys: z.array(z.string()).default([]) })).default([]),
  quests: z.array(z.object({ key: z.string(), name: z.string(), stepKeys: z.array(z.string()).default([]) })).default([]),
  narrativeScenes: z.array(z.object({ key: z.string(), name: z.string(), dialogueNodeKeys: z.array(z.string()).default([]) })).default([]),
  dialogueNodes: z.array(z.object({ key: z.string(), name: z.string(), choiceKeys: z.array(z.string()).default([]) })).default([]),
  choices: z.array(z.object({ key: z.string(), name: z.string(), conditionKeys: z.array(z.string()).default([]), outcomeKeys: z.array(z.string()).default([]), branchesTo: z.array(z.string()).default([]) })).default([]),
  conditions: z.array(z.object({ key: z.string(), name: z.string(), condition: interactiveConditionSchema })).default([]),
  outcomes: z.array(z.object({ key: z.string(), name: z.string(), outcome: interactiveOutcomeSchema })).default([]),
  tradeOffers: z.array(z.object({ key: z.string(), name: z.string(), offer: interactiveTradeOfferSchema })).default([]),
  validation: z.object({
    warnings: z.array(z.string()).default([]),
    blockers: z.array(z.string()).default([]),
  }).default({ warnings: [], blockers: [] }),
})

export type InteractiveSystemKind = z.infer<typeof interactiveSystemKindSchema>
export type InteractiveSystemNodeType = z.infer<typeof interactiveSystemNodeTypeSchema>
export type InteractiveCondition = z.infer<typeof interactiveConditionSchema>
export type InteractiveOutcome = z.infer<typeof interactiveOutcomeSchema>
export type InteractivePlayerStat = z.infer<typeof interactivePlayerStatSchema>
export type InteractiveTradeOffer = z.infer<typeof interactiveTradeOfferSchema>
export type InteractiveInitialConfig = z.infer<typeof interactiveInitialConfigSchema>
export type InteractiveConditionInput = z.input<typeof interactiveConditionSchema>
export type InteractiveOutcomeInput = z.input<typeof interactiveOutcomeSchema>
export type InteractiveTradeOfferInput = z.input<typeof interactiveTradeOfferSchema>
export type InteractiveRuntimeState = z.infer<typeof interactiveRuntimeStateSchema>
export type InteractiveManifest = z.infer<typeof interactiveManifestSchema>

export type InteractiveReadinessFinding = {
  category: InteractiveSystemKind
  severity: 'blocker' | 'warning'
  message: string
  entityKey?: string
}

export type InteractiveReadiness = {
  ready: boolean
  readinessPercent: number
  blockers: InteractiveReadinessFinding[]
  warnings: InteractiveReadinessFinding[]
  counts: Record<string, number>
  requiredSystems: InteractiveSystemKind[]
  nextAction: string
}

export type InteractivePrototypeModel = {
  ready: boolean
  manifest: InteractiveManifest | null
  blockers: string[]
  warnings: string[]
  startState: InteractiveRuntimeState | null
}

export const INTERACTIVE_SYSTEM_NODE_TYPES = interactiveSystemNodeTypeSchema.options
export const INTERACTIVE_SYSTEM_RELATIONSHIP_VERBS = interactiveRelationshipVerbSchema.options

export function isInteractiveSystemNodeType(value: string): value is InteractiveSystemNodeType {
  return interactiveSystemNodeTypeSchema.safeParse(value).success
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function numberRecord(value: unknown): Record<string, number> {
  const record = recordValue(value)
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
}

export function readInteractiveProperties(entity: Pick<WorldEntity, 'customProperties'>) {
  const customProperties = recordValue(entity.customProperties)
  return {
    ...recordValue(customProperties.interactive),
    ...recordValue(customProperties.game),
  }
}

function relationTargets(relationships: WorldRelationship[], sourceKey: string, verbs: string[]) {
  return relationships.filter((relationship) => relationship.sourceEntityKey === sourceKey && verbs.includes(relationship.verb)).map((relationship) => relationship.targetEntityKey)
}

function relationSources(relationships: WorldRelationship[], targetKey: string, verbs: string[]) {
  return relationships.filter((relationship) => relationship.targetEntityKey === targetKey && verbs.includes(relationship.verb)).map((relationship) => relationship.sourceEntityKey)
}

function relationOut(relationships: WorldRelationship[], sourceKey: string, verbs: string[], targetTypes: string[], entityByKey: Map<string, WorldEntity>) {
  return relationships.some((relationship) => {
    if (relationship.sourceEntityKey !== sourceKey || !verbs.includes(relationship.verb)) return false
    const target = entityByKey.get(relationship.targetEntityKey)
    return target ? targetTypes.includes(target.nodeType) : false
  })
}

function addFinding(target: InteractiveReadinessFinding[], finding: InteractiveReadinessFinding) {
  if (!target.some((existing) => existing.category === finding.category && existing.entityKey === finding.entityKey && existing.message === finding.message)) {
    target.push(finding)
  }
}

export function collectInteractiveSystemRequirements(input: {
  entities: WorldEntity[]
  fallback?: InteractiveSystemKind[]
}): InteractiveSystemKind[] {
  const required = new Set<InteractiveSystemKind>(input.fallback ?? [])
  for (const entity of input.entities) {
    const customProperties = recordValue(entity.customProperties)
    const interactive = recordValue(customProperties.interactive)
    const app = recordValue(customProperties.app)
    for (const source of [interactive.requiredSystems, app.interactiveSystems, app.requiredInteractiveSystems]) {
      for (const system of stringArray(source)) {
        const parsed = interactiveSystemKindSchema.safeParse(system)
        if (parsed.success) required.add(parsed.data)
      }
    }
  }
  return [...required]
}

export function evaluateInteractiveSystemReadiness(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  requiredSystems?: InteractiveSystemKind[]
}): InteractiveReadiness {
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const entityByKey = new Map(activeEntities.map((entity) => [entity.key, entity] as const))
  const byType = (nodeType: string) => activeEntities.filter((entity) => entity.nodeType === nodeType)
  const requiredSystems = input.requiredSystems?.length
    ? input.requiredSystems
    : collectInteractiveSystemRequirements({ entities: activeEntities })
  const blockers: InteractiveReadinessFinding[] = []
  const warnings: InteractiveReadinessFinding[] = []
  const requireNode = (system: InteractiveSystemKind, nodeType: string, label: string) => {
    if (requiredSystems.includes(system) && byType(nodeType).length === 0) {
      addFinding(blockers, { category: system, severity: 'blocker', message: `Add at least one ${label}.` })
    }
  }

  requireNode('inventory', 'inventory', 'starter inventory')
  requireNode('inventory', 'inventory_item', 'inventory item')
  requireNode('initial_config', 'player_initial_config', 'player initial config')
  requireNode('currency', 'currency', 'currency')
  requireNode('progression_tokens', 'shadow_token', 'progression token')
  requireNode('state_variables', 'state_variable', 'state variable')
  requireNode('conditions', 'choice_condition', 'condition node')
  requireNode('outcomes', 'choice_outcome', 'outcome node')
  requireNode('markets', 'marketplace', 'marketplace')
  requireNode('markets', 'trade_offer', 'trade offer')
  requireNode('dialogue', 'dialogue_node', 'dialogue node')
  requireNode('dialogue', 'choice', 'choice')
  requireNode('travel', 'location_spot', 'location spot')
  requireNode('travel', 'travel_link', 'travel link')
  requireNode('save_state', 'save_state', 'save state')

  for (const relationship of input.relationships) {
    if (!entityByKey.has(relationship.sourceEntityKey) || !entityByKey.has(relationship.targetEntityKey)) {
      addFinding(blockers, {
        category: 'state_variables',
        severity: 'blocker',
        message: `${relationship.verb} references a missing endpoint.`,
      })
    }
  }

  if (requiredSystems.includes('travel')) {
    for (const travelLink of byType('travel_link')) {
      if (!relationOut(input.relationships, travelLink.key, ['travels_to'], ['place', 'location_spot', 'screen'], entityByKey)) {
        addFinding(blockers, { category: 'travel', severity: 'blocker', message: `${travelLink.name} needs a travels_to destination.`, entityKey: travelLink.key })
      }
      if (!relationOut(input.relationships, travelLink.key, ['starts_at', 'located_in'], ['place', 'location_spot', 'screen'], entityByKey)) {
        addFinding(warnings, { category: 'travel', severity: 'warning', message: `${travelLink.name} should declare its origin place, spot, or screen.`, entityKey: travelLink.key })
      }
    }
  }

  if (requiredSystems.includes('markets')) {
    for (const marketplace of byType('marketplace')) {
      if (!relationOut(input.relationships, marketplace.key, ['offers'], ['trade_offer'], entityByKey)) {
        addFinding(blockers, { category: 'markets', severity: 'blocker', message: `${marketplace.name} needs at least one trade offer.`, entityKey: marketplace.key })
      }
    }
    for (const tradeOffer of byType('trade_offer')) {
      const interactive = readInteractiveProperties(tradeOffer)
      const parsed = interactiveTradeOfferSchema.safeParse(interactive.offer ?? interactive.tradeOffer ?? {})
      const hasRelationValue = relationOut(input.relationships, tradeOffer.key, ['costs', 'trades_for', 'grants_item'], ['inventory_item', 'currency', 'shadow_token'], entityByKey)
      if (!parsed.success || (parsed.data.gives.length === 0 && parsed.data.receives.length === 0 && !parsed.data.currencyCost && !hasRelationValue)) {
        addFinding(blockers, { category: 'markets', severity: 'blocker', message: `${tradeOffer.name} needs valid gives/receives or cost data.`, entityKey: tradeOffer.key })
      }
    }
  }

  if (requiredSystems.includes('dialogue')) {
    for (const dialogue of byType('dialogue_node')) {
      if (!relationOut(input.relationships, dialogue.key, ['contains'], ['choice'], entityByKey)) {
        addFinding(blockers, { category: 'dialogue', severity: 'blocker', message: `${dialogue.name} needs at least one choice.`, entityKey: dialogue.key })
      }
    }
  }

  if (requiredSystems.includes('outcomes')) {
    for (const choice of byType('choice')) {
      const choiceProps = readInteractiveProperties(choice)
      const alwaysAvailable = choiceProps.alwaysAvailable === true || choiceProps.availability === 'always'
      const hasCondition = relationOut(input.relationships, choice.key, ['requires_item', 'requires_token', 'requires_currency', 'requires_stat'], ['choice_condition', 'inventory_item', 'shadow_token', 'currency', 'player_stat'], entityByKey)
      if (!hasCondition && !alwaysAvailable) {
        addFinding(warnings, { category: 'conditions', severity: 'warning', message: `${choice.name} should declare a condition or be explicitly always available.`, entityKey: choice.key })
      }
      const hasOutcome = relationOut(input.relationships, choice.key, ['branches_to', 'grants_item', 'grants_token', 'sets_state', 'unlocks', 'modifies_stat'], ['choice_outcome', 'narrative_scene', 'dialogue_node', 'screen', 'inventory_item', 'shadow_token', 'state_variable', 'player_stat'], entityByKey)
      if (!hasOutcome) {
        addFinding(blockers, { category: 'outcomes', severity: 'blocker', message: `${choice.name} needs an outcome or branch target.`, entityKey: choice.key })
      }
    }
  }

  if (requiredSystems.includes('conditions') || requiredSystems.includes('progression_tokens') || requiredSystems.includes('inventory')) {
    const grantedKeys = new Set(input.relationships.filter((relationship) => ['grants_item', 'grants_token', 'unlocks'].includes(relationship.verb)).map((relationship) => relationship.targetEntityKey))
    const initialKeys = new Set(byType('inventory').flatMap((inventory) => [
      ...stringArray(readInteractiveProperties(inventory).initialItemKeys),
      ...stringArray(readInteractiveProperties(inventory).tokenKeys),
    ]))
    for (const relationship of input.relationships.filter((entry) => ['requires_item', 'requires_token'].includes(entry.verb))) {
      if (!grantedKeys.has(relationship.targetEntityKey) && !initialKeys.has(relationship.targetEntityKey)) {
        const target = entityByKey.get(relationship.targetEntityKey)
        addFinding(blockers, {
          category: relationship.verb === 'requires_token' ? 'progression_tokens' : 'inventory',
          severity: 'blocker',
          message: `${target?.name ?? relationship.targetEntityKey} is required but never granted or included in starter inventory.`,
          entityKey: target?.key,
        })
      }
    }
  }

  if (requiredSystems.includes('progression_tokens')) {
    const initialKeys = new Set(byType('inventory').flatMap((inventory) => stringArray(readInteractiveProperties(inventory).tokenKeys)))
    for (const token of byType('shadow_token')) {
      const granted = relationSources(input.relationships, token.key, ['grants_token', 'unlocks']).length > 0 || initialKeys.has(token.key)
      const consumed = relationSources(input.relationships, token.key, ['requires_token']).length > 0
      if (!granted || !consumed) {
        addFinding(warnings, {
          category: 'progression_tokens',
          severity: 'warning',
          message: `${token.name} should be both granted and checked by progression gates.`,
          entityKey: token.key,
        })
      }
    }
  }

  if (requiredSystems.includes('stats')) {
    const initialConfigStats = new Set(byType('player_initial_config').flatMap((config) => Object.keys(numberRecord(readInteractiveProperties(config).stats))))
    if (byType('player_stat').length === 0 && initialConfigStats.size === 0) {
      addFinding(blockers, { category: 'stats', severity: 'blocker', message: 'Add at least one player stat or initialize stats in player_initial_config.' })
    }
    const statKeys = new Set([...byType('player_stat').map((stat) => stat.key), ...initialConfigStats])
    const modifiedStatKeys = new Set(input.relationships.filter((relationship) => relationship.verb === 'modifies_stat').map((relationship) => relationship.targetEntityKey))
    for (const stat of byType('player_stat')) {
      const props = readInteractiveProperties(stat)
      if (typeof props.defaultValue !== 'number' && !initialConfigStats.has(stat.key)) {
        addFinding(warnings, { category: 'stats', severity: 'warning', message: `${stat.name} should define a numeric defaultValue or be initialized in player_initial_config.`, entityKey: stat.key })
      }
      if (!props.displayLabel && !stat.name.trim()) {
        addFinding(warnings, { category: 'stats', severity: 'warning', message: `${stat.key} should define a display label.`, entityKey: stat.key })
      }
    }
    for (const condition of byType('choice_condition')) {
      const parsed = interactiveConditionSchema.safeParse(readInteractiveProperties(condition).condition ?? {})
      if (parsed.success && parsed.data.kind.startsWith('stat_') && !statKeys.has(parsed.data.targetKey)) {
        addFinding(blockers, { category: 'stats', severity: 'blocker', message: `${condition.name} references missing stat ${parsed.data.targetKey}.`, entityKey: condition.key })
      }
    }
    for (const outcome of byType('choice_outcome')) {
      const parsed = interactiveOutcomeSchema.safeParse(readInteractiveProperties(outcome).outcome ?? {})
      if (parsed.success && ['set_stat', 'increase_stat', 'decrease_stat', 'clamp_stat'].includes(parsed.data.kind) && !statKeys.has(parsed.data.targetKey)) {
        addFinding(blockers, { category: 'stats', severity: 'blocker', message: `${outcome.name} modifies missing stat ${parsed.data.targetKey}.`, entityKey: outcome.key })
      }
      if (parsed.success && ['increase_stat', 'decrease_stat', 'set_stat', 'clamp_stat'].includes(parsed.data.kind)) {
        modifiedStatKeys.add(parsed.data.targetKey)
      }
    }
    for (const relationship of input.relationships.filter((entry) => entry.verb === 'requires_stat')) {
      const target = entityByKey.get(relationship.targetEntityKey)
      if (target?.nodeType === 'choice_condition') {
        const parsed = interactiveConditionSchema.safeParse(readInteractiveProperties(target).condition ?? {})
        if (parsed.success && parsed.data.kind.startsWith('stat_') && !statKeys.has(parsed.data.targetKey)) {
          addFinding(blockers, { category: 'stats', severity: 'blocker', message: `${target.name} references missing stat ${parsed.data.targetKey}.`, entityKey: target.key })
        }
      } else if (!statKeys.has(relationship.targetEntityKey)) {
        addFinding(blockers, { category: 'stats', severity: 'blocker', message: `${relationship.targetEntityKey} is required as a stat but is not defined.`, entityKey: relationship.sourceEntityKey })
      }
    }
    for (const statKey of statKeys) {
      const statIsInitialized = initialConfigStats.has(statKey) || byType('player_stat').some((stat) => stat.key === statKey && typeof readInteractiveProperties(stat).defaultValue === 'number')
      const statIsModified = modifiedStatKeys.has(statKey)
      if (!statIsInitialized && !statIsModified) {
        addFinding(blockers, { category: 'stats', severity: 'blocker', message: `${statKey} is used as a stat but is never initialized or modified.` })
      }
    }
  }

  if (requiredSystems.includes('initial_config')) {
    for (const config of byType('player_initial_config')) {
      const parsed = interactiveInitialConfigSchema.parse(readInteractiveProperties(config))
      const startScene = parsed.currentSceneKey ?? parsed.startSceneKey
      const startDialogue = parsed.currentDialogueKey ?? parsed.startDialogueKey
      const startLocation = parsed.currentLocationKey ?? parsed.startLocationKey
      const startSpot = parsed.currentSpotKey ?? parsed.startSpotKey
      if ((requiredSystems.includes('dialogue') || requiredSystems.includes('travel')) && !startScene && !startDialogue && !startLocation && !startSpot) {
        addFinding(blockers, { category: 'initial_config', severity: 'blocker', message: `${config.name} should resolve a start scene, dialogue, location, or spot.`, entityKey: config.key })
      }
      for (const key of [startScene, startDialogue, startLocation, startSpot].filter((value): value is string => typeof value === 'string' && value.length > 0)) {
        if (!entityByKey.has(key)) addFinding(blockers, { category: 'initial_config', severity: 'blocker', message: `${config.name} references missing start target ${key}.`, entityKey: config.key })
      }
    }
  }

  const scoredSystems = requiredSystems.length > 0 ? requiredSystems : interactiveSystemKindSchema.options
  const readyCount = scoredSystems.filter((system) => !blockers.some((finding) => finding.category === system)).length
  const readinessPercent = scoredSystems.length === 0 ? 100 : Math.round((readyCount / scoredSystems.length) * 100)
  const nextAction = blockers.length > 0
    ? `Fix ${blockers[0].category.replace(/_/g, ' ')}`
    : warnings.length > 0 ? `Review ${warnings[0].category.replace(/_/g, ' ')}` : 'Interactive systems ready'

  return {
    ready: blockers.length === 0,
    readinessPercent,
    blockers,
    warnings,
    counts: Object.fromEntries(activeEntities.reduce((map, entity) => {
      map.set(entity.nodeType, (map.get(entity.nodeType) ?? 0) + 1)
      return map
    }, new Map<string, number>())),
    requiredSystems,
    nextAction,
  }
}

function firstEntityKey(entities: WorldEntity[], nodeType: string) {
  return entities.find((entity) => entity.nodeType === nodeType)?.key ?? null
}

export function compileInteractiveManifest(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  requiredSystems?: InteractiveSystemKind[]
}): InteractiveManifest {
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const byType = (nodeType: string) => activeEntities.filter((entity) => entity.nodeType === nodeType)
  const locationKeyBySpot = new Map(byType('location_spot').map((spot) => [spot.key, relationTargets(input.relationships, spot.key, ['located_in'])[0] ?? null]))
  const initialInventory = byType('inventory')[0] ?? null
  const initialConfig = byType('player_initial_config')[0] ?? null
  const initialInteractive = initialConfig
    ? interactiveInitialConfigSchema.parse(readInteractiveProperties(initialConfig))
    : initialInventory
      ? interactiveInitialConfigSchema.parse(readInteractiveProperties(initialInventory))
      : interactiveInitialConfigSchema.parse({})
  const initialLocationKey = firstEntityKey(activeEntities, 'place') ?? firstEntityKey(activeEntities, 'screen')
  const statNodes = byType('player_stat').map((entity) => {
    const props = readInteractiveProperties(entity)
    return interactivePlayerStatSchema.parse({
      key: entity.key,
      name: entity.name,
      summary: entity.summary,
      displayLabel: typeof props.displayLabel === 'string' ? props.displayLabel : entity.name,
      defaultValue: typeof props.defaultValue === 'number' ? props.defaultValue : initialInteractive.stats[entity.key] ?? 0,
      min: typeof props.min === 'number' ? props.min : undefined,
      max: typeof props.max === 'number' ? props.max : undefined,
    })
  })
  const statByKey = new Map(statNodes.map((stat) => [stat.key, stat] as const))
  for (const [key, value] of Object.entries(initialInteractive.stats)) {
    if (!statByKey.has(key)) {
      statByKey.set(key, interactivePlayerStatSchema.parse({
        key,
        name: key.replace(/[_-]+/g, ' '),
        displayLabel: key.replace(/[_-]+/g, ' '),
        defaultValue: value,
      }))
    }
  }
  const stats = [...statByKey.values()]

  return interactiveManifestSchema.parse({
    requiredSystems: input.requiredSystems ?? collectInteractiveSystemRequirements({ entities: activeEntities }),
    initialState: {
      inventoryKeys: [...initialInteractive.inventoryKeys, ...initialInteractive.initialItemKeys],
      currency: initialInteractive.currency,
      tokenKeys: initialInteractive.tokenKeys,
      stats: Object.fromEntries(stats.map((stat) => [stat.key, initialInteractive.stats[stat.key] ?? stat.defaultValue])),
      state: initialInteractive.state,
      currentLocationKey: initialInteractive.currentLocationKey ?? initialInteractive.startLocationKey ?? initialLocationKey,
      currentSpotKey: initialInteractive.currentSpotKey ?? initialInteractive.startSpotKey ?? firstEntityKey(activeEntities, 'location_spot'),
      currentSceneKey: initialInteractive.currentSceneKey ?? initialInteractive.startSceneKey ?? firstEntityKey(activeEntities, 'narrative_scene'),
      currentDialogueKey: initialInteractive.currentDialogueKey ?? initialInteractive.startDialogueKey ?? firstEntityKey(activeEntities, 'dialogue_node'),
      visitedLocationKeys: (initialInteractive.currentLocationKey ?? initialInteractive.startLocationKey ?? initialLocationKey) ? [initialInteractive.currentLocationKey ?? initialInteractive.startLocationKey ?? initialLocationKey].filter((value): value is string => Boolean(value)) : [],
    },
    stats,
    locations: [...byType('place'), ...byType('screen')].map((entity) => ({ key: entity.key, name: entity.name, summary: entity.summary })),
    spots: byType('location_spot').map((entity) => ({ key: entity.key, name: entity.name, locationKey: locationKeyBySpot.get(entity.key) ?? null, summary: entity.summary })),
    travelLinks: byType('travel_link').map((entity) => ({ key: entity.key, name: entity.name, startsAtKeys: relationTargets(input.relationships, entity.key, ['starts_at', 'located_in']), travelsToKeys: relationTargets(input.relationships, entity.key, ['travels_to']) })),
    inventoryItems: [...byType('inventory_item'), ...byType('shadow_token'), ...byType('currency')].map((entity) => ({
      key: entity.key,
      name: entity.name,
      summary: entity.summary,
      kind: entity.nodeType,
    })),
    markets: byType('marketplace').map((entity) => ({ key: entity.key, name: entity.name, offerKeys: relationTargets(input.relationships, entity.key, ['offers']) })),
    quests: byType('quest').map((entity) => ({ key: entity.key, name: entity.name, stepKeys: relationTargets(input.relationships, entity.key, ['contains']) })),
    narrativeScenes: byType('narrative_scene').map((entity) => ({ key: entity.key, name: entity.name, dialogueNodeKeys: relationTargets(input.relationships, entity.key, ['contains']) })),
    dialogueNodes: byType('dialogue_node').map((entity) => ({ key: entity.key, name: entity.name, choiceKeys: relationTargets(input.relationships, entity.key, ['contains']) })),
    choices: byType('choice').map((entity) => ({
      key: entity.key,
      name: entity.name,
      conditionKeys: relationTargets(input.relationships, entity.key, ['requires_item', 'requires_token', 'requires_currency', 'requires_state', 'requires_stat']),
      outcomeKeys: relationTargets(input.relationships, entity.key, ['grants_item', 'grants_token', 'sets_state', 'unlocks', 'removes_item', 'modifies_stat']),
      branchesTo: relationTargets(input.relationships, entity.key, ['branches_to']),
    })),
    conditions: byType('choice_condition').map((entity) => ({ key: entity.key, name: entity.name, condition: interactiveConditionSchema.parse(readInteractiveProperties(entity).condition ?? {}) })),
    outcomes: byType('choice_outcome').map((entity) => ({ key: entity.key, name: entity.name, outcome: interactiveOutcomeSchema.parse(readInteractiveProperties(entity).outcome ?? {}) })),
    tradeOffers: byType('trade_offer').map((entity) => ({ key: entity.key, name: entity.name, offer: interactiveTradeOfferSchema.parse(readInteractiveProperties(entity).offer ?? readInteractiveProperties(entity).tradeOffer ?? {}) })),
  })
}

function compareValues(left: unknown, operator: InteractiveCondition['operator'], right: unknown) {
  if (operator === 'exists') return left !== undefined && left !== null && left !== false
  if (operator === 'missing') return left === undefined || left === null || left === false
  if (operator === 'eq') return left === right
  if (operator === 'neq') return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') return false
  if (operator === 'gte') return left >= right
  if (operator === 'lte') return left <= right
  if (operator === 'gt') return left > right
  if (operator === 'lt') return left < right
  return false
}

export function evaluateInteractiveCondition(conditionInput: InteractiveConditionInput, state: InteractiveRuntimeState): boolean {
  const condition = interactiveConditionSchema.parse(conditionInput)
  const quantity = condition.quantity ?? 1
  if (condition.kind === 'has_item') {
    const count = state.inventoryKeys.filter((key) => key === condition.targetKey).length
    return compareValues(count, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)
  }
  if (condition.kind === 'has_token') {
    const hasToken = state.tokenKeys.includes(condition.targetKey)
    return compareValues(hasToken, condition.operator, condition.value ?? true)
  }
  if (condition.kind === 'has_currency') {
    const amount = state.currency[condition.targetKey] ?? 0
    return compareValues(amount, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)
  }
  if (condition.kind === 'state_equals') {
    return compareValues(state.state[condition.targetKey], condition.operator, condition.value)
  }
  if (condition.kind === 'visited_location') {
    const visited = state.visitedLocationKeys.includes(condition.targetKey)
    return compareValues(visited, condition.operator, condition.value ?? true)
  }
  if (condition.kind.startsWith('stat_')) {
    const stat = state.stats[condition.targetKey] ?? 0
    const expected = typeof condition.value === 'number' ? condition.value : quantity
    if (condition.kind === 'stat_eq') return compareValues(stat, 'eq', expected)
    if (condition.kind === 'stat_gte') return compareValues(stat, 'gte', expected)
    if (condition.kind === 'stat_lte') return compareValues(stat, 'lte', expected)
    if (condition.kind === 'stat_gt') return compareValues(stat, 'gt', expected)
    if (condition.kind === 'stat_lt') return compareValues(stat, 'lt', expected)
  }
  return false
}

export function applyInteractiveOutcome(outcomeInput: InteractiveOutcomeInput, state: InteractiveRuntimeState): InteractiveRuntimeState {
  const outcome = interactiveOutcomeSchema.parse(outcomeInput)
  const quantity = outcome.quantity ?? 1
  const next = interactiveRuntimeStateSchema.parse({
    ...state,
    inventoryKeys: [...state.inventoryKeys],
    tokenKeys: [...state.tokenKeys],
    currency: { ...state.currency },
    stats: { ...state.stats },
    state: { ...state.state },
    currentSceneKey: state.currentSceneKey,
    currentDialogueKey: state.currentDialogueKey,
    visitedLocationKeys: [...state.visitedLocationKeys],
  })
  if (outcome.kind === 'grant_item') next.inventoryKeys.push(...Array.from({ length: quantity }, () => outcome.targetKey))
  if (outcome.kind === 'remove_item') {
    let remaining = quantity
    next.inventoryKeys = next.inventoryKeys.filter((key) => {
      if (key !== outcome.targetKey || remaining <= 0) return true
      remaining -= 1
      return false
    })
  }
  if (outcome.kind === 'grant_token' || outcome.kind === 'unlock') {
    if (!next.tokenKeys.includes(outcome.targetKey)) next.tokenKeys.push(outcome.targetKey)
  }
  if (outcome.kind === 'remove_token') next.tokenKeys = next.tokenKeys.filter((key) => key !== outcome.targetKey)
  if (outcome.kind === 'grant_currency') next.currency[outcome.targetKey] = (next.currency[outcome.targetKey] ?? 0) + quantity
  if (outcome.kind === 'remove_currency') next.currency[outcome.targetKey] = Math.max(0, (next.currency[outcome.targetKey] ?? 0) - quantity)
  if (outcome.kind === 'set_state') next.state[outcome.targetKey] = outcome.value ?? true
  if (outcome.kind === 'clear_state') delete next.state[outcome.targetKey]
  if (outcome.kind === 'set_stat') next.stats[outcome.targetKey] = typeof outcome.value === 'number' ? outcome.value : quantity
  if (outcome.kind === 'increase_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) + quantity
  if (outcome.kind === 'decrease_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) - quantity
  if (outcome.kind === 'clamp_stat') {
    const current = next.stats[outcome.targetKey] ?? 0
    const bounds = typeof outcome.value === 'number' ? { min: outcome.value, max: quantity } : { min: 0, max: quantity }
    next.stats[outcome.targetKey] = Math.max(bounds.min, Math.min(bounds.max, current))
  }
  if (outcome.kind === 'travel_to') {
    next.currentLocationKey = outcome.targetKey
    if (!next.visitedLocationKeys.includes(outcome.targetKey)) next.visitedLocationKeys.push(outcome.targetKey)
  }
  if (outcome.kind === 'branch_to') next.state.currentBranchKey = outcome.targetKey
  if (outcome.kind === 'set_current_dialogue') next.currentDialogueKey = outcome.targetKey
  if (outcome.kind === 'set_current_scene') next.currentSceneKey = outcome.targetKey
  return next
}

export function canExecuteInteractiveTrade(offerInput: InteractiveTradeOfferInput, state: InteractiveRuntimeState): boolean {
  const offer = interactiveTradeOfferSchema.parse(offerInput)
  if (offer.currencyCost && (state.currency[offer.currencyCost.currencyKey] ?? 0) < offer.currencyCost.amount) return false
  for (const received of offer.receives) {
    if (state.inventoryKeys.filter((key) => key === received.key).length < received.quantity) return false
  }
  return true
}

export function applyInteractiveTrade(offerInput: InteractiveTradeOfferInput, state: InteractiveRuntimeState): InteractiveRuntimeState {
  const offer = interactiveTradeOfferSchema.parse(offerInput)
  if (!canExecuteInteractiveTrade(offer, state)) return state
  let next = interactiveRuntimeStateSchema.parse({
    ...state,
    inventoryKeys: [...state.inventoryKeys],
    tokenKeys: [...state.tokenKeys],
    currency: { ...state.currency },
    stats: { ...state.stats },
    state: { ...state.state },
    currentSceneKey: state.currentSceneKey,
    currentDialogueKey: state.currentDialogueKey,
    visitedLocationKeys: [...state.visitedLocationKeys],
  })
  if (offer.currencyCost) {
    next = applyInteractiveOutcome({ kind: 'remove_currency', targetKey: offer.currencyCost.currencyKey, quantity: offer.currencyCost.amount }, next)
  }
  for (const received of offer.receives) {
    for (let index = 0; index < received.quantity; index += 1) {
      next = applyInteractiveOutcome({ kind: 'remove_item', targetKey: received.key, quantity: 1 }, next)
    }
  }
  for (const given of offer.gives) {
    for (let index = 0; index < given.quantity; index += 1) {
      next = applyInteractiveOutcome({ kind: 'grant_item', targetKey: given.key, quantity: 1 }, next)
    }
  }
  return next
}

export function createInitialRuntimeState(manifest: Pick<InteractiveManifest, 'initialState'>): InteractiveRuntimeState {
  return interactiveRuntimeStateSchema.parse(manifest.initialState)
}

export function getAvailableChoices(manifest: InteractiveManifest, state: InteractiveRuntimeState, dialogueKey: string) {
  const dialogue = manifest.dialogueNodes.find((node) => node.key === dialogueKey)
  const choices = dialogue ? manifest.choices.filter((choice) => dialogue.choiceKeys.includes(choice.key)) : []
  return choices.map((choice) => {
    const conditions = choice.conditionKeys
      .map((conditionKey) => manifest.conditions.find((condition) => condition.key === conditionKey))
      .filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
    const failedConditions = conditions.filter((condition) => !evaluateInteractiveCondition(condition.condition, state))
    return {
      choice,
      available: failedConditions.length === 0,
      lockedReasons: failedConditions.map((condition) => condition.name),
    }
  })
}

function applyBranchTarget(manifest: InteractiveManifest, state: InteractiveRuntimeState, targetKey: string): InteractiveRuntimeState {
  if (manifest.dialogueNodes.some((node) => node.key === targetKey)) return applyInteractiveOutcome({ kind: 'set_current_dialogue', targetKey }, state)
  if (manifest.narrativeScenes.some((scene) => scene.key === targetKey)) return applyInteractiveOutcome({ kind: 'set_current_scene', targetKey }, state)
  if (manifest.locations.some((location) => location.key === targetKey)) return applyInteractiveOutcome({ kind: 'travel_to', targetKey }, state)
  return applyInteractiveOutcome({ kind: 'branch_to', targetKey }, state)
}

export function applyChoice(manifest: InteractiveManifest, state: InteractiveRuntimeState, choiceKey: string): InteractiveRuntimeState {
  const choice = manifest.choices.find((entry) => entry.key === choiceKey)
  if (!choice) return state
  const conditions = choice.conditionKeys
    .map((conditionKey) => manifest.conditions.find((condition) => condition.key === conditionKey))
    .filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
  if (!conditions.every((condition) => evaluateInteractiveCondition(condition.condition, state))) return state
  let next = state
  for (const outcomeKey of choice.outcomeKeys) {
    const outcome = manifest.outcomes.find((entry) => entry.key === outcomeKey)
    if (outcome) next = applyInteractiveOutcome(outcome.outcome, next)
  }
  for (const branchTarget of choice.branchesTo) {
    next = applyBranchTarget(manifest, next, branchTarget)
  }
  return next
}

export function executeTrade(manifest: InteractiveManifest, state: InteractiveRuntimeState, tradeOfferKey: string): InteractiveRuntimeState {
  const trade = manifest.tradeOffers.find((entry) => entry.key === tradeOfferKey)
  return trade ? applyInteractiveTrade(trade.offer, state) : state
}

export function moveToLocation(manifest: InteractiveManifest, state: InteractiveRuntimeState, travelLinkKey: string): InteractiveRuntimeState {
  const travelLink = manifest.travelLinks.find((entry) => entry.key === travelLinkKey)
  const destination = travelLink?.travelsToKeys[0]
  return destination ? applyInteractiveOutcome({ kind: 'travel_to', targetKey: destination }, state) : state
}

export function buildInteractivePrototypeModel(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  requiredSystems?: InteractiveSystemKind[]
}): InteractivePrototypeModel {
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const readiness = evaluateInteractiveSystemReadiness({
    entities: activeEntities,
    relationships: input.relationships,
    requiredSystems: input.requiredSystems,
  })
  const blockers = readiness.blockers.map((finding) => finding.message)
  const warnings = readiness.warnings.map((finding) => finding.message)
  const hasInitialConfig = activeEntities.some((entity) => entity.nodeType === 'player_initial_config')
  if (!hasInitialConfig) blockers.push('Add a player_initial_config node to define the session start state.')

  let manifest: InteractiveManifest | null = null
  let startState: InteractiveRuntimeState | null = null
  try {
    manifest = compileInteractiveManifest({
      entities: activeEntities,
      relationships: input.relationships,
      requiredSystems: input.requiredSystems,
    })
    startState = createInitialRuntimeState(manifest)
    const hasStartTarget = Boolean(
      startState.currentDialogueKey
      || startState.currentSceneKey
      || startState.currentSpotKey
      || startState.currentLocationKey,
    )
    if (!hasStartTarget) blockers.push('Set a start dialogue, scene, spot, location, or screen in player_initial_config.')
    const hasChoiceActions = manifest.choices.length > 0 && manifest.dialogueNodes.some((node) => node.choiceKeys.length > 0)
    const hasTravelActions = manifest.travelLinks.some((link) => link.travelsToKeys.length > 0)
    const hasMarketActions = manifest.markets.some((market) => market.offerKeys.length > 0) && manifest.tradeOffers.length > 0
    if (!hasChoiceActions && !hasTravelActions && !hasMarketActions) {
      blockers.push('Add at least one executable choice, travel link, or market offer.')
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error))
  }

  return {
    ready: blockers.length === 0 && Boolean(manifest && startState),
    manifest,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    startState,
  }
}
