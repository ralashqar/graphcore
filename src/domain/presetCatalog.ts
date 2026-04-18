import { buildDefaultDefinitionComponents } from './graphcore.ts'
import type {
  ArchetypeDefinition,
  DefinitionBase,
  GameSpec,
  GraphDefinition,
  PatchOperation,
} from './graphcore.ts'
import { createGraphScaffold, getGraphScaffoldKeys } from './graphScaffold.ts'
import { normalizeNode } from './nodeLibrary.ts'

export const PRESET_CATALOG_VERSION = '2026-04-08.2'
const FALLBACK_ART_STYLE_PRESET = 'premium_stylized_3d'

type ArchetypePreset = {
  id: string
  kind: 'archetype'
  tags: string[]
  archetype: Omit<ArchetypeDefinition, 'id'>
}

type DefinitionPreset = {
  id: string
  kind: 'definition'
  tags: string[]
  definition: Omit<DefinitionBase, 'id'>
}

type GraphPreset = {
  id: string
  kind: 'graph'
  tags: string[]
  build: (options?: { keyOverride?: string; nameOverride?: string }) => GraphDefinition
}

type PackPreset = {
  id: string
  kind: 'pack'
  tags: string[]
  archetypePresetIds: string[]
  definitionPresetIds: string[]
  graphPresetIds: string[]
}

function makeField(
  key: string,
  label: string,
  fieldType: ArchetypeDefinition['fields'][number]['fieldType'],
  sortOrder: number,
  options: Partial<ArchetypeDefinition['fields'][number]> = {},
) {
  return {
    id: `field-${key}`,
    key,
    label,
    fieldType,
    description: options.description ?? '',
    required: options.required ?? false,
    defaultValue: options.defaultValue ?? null,
    constraints: options.constraints ?? {},
    sortOrder,
  }
}

function makeArchetypePreset(
  id: string,
  appliesToKind: ArchetypeDefinition['appliesToKind'],
  name: string,
  summary: string,
  fields: ArchetypeDefinition['fields'],
  tags: string[] = [],
  metadata: Record<string, unknown> = {},
): ArchetypePreset {
  return {
    id,
    kind: 'archetype',
    tags,
    archetype: {
      key: id,
      name,
      summary,
      appliesToKind,
      iconAssetKey: null,
      metadata,
      llmHints: {
        source: 'preset_catalog',
      },
      fields,
    },
  }
}

function makeDefinitionPreset(
  id: string,
  kind: DefinitionBase['kind'],
  name: string,
  summary: string,
  options: Partial<Omit<DefinitionBase, 'id' | 'kind' | 'key' | 'name' | 'summary'>> = {},
  tags: string[] = [],
): DefinitionPreset {
  return {
    id,
    kind: 'definition',
    tags,
    definition: {
      key: id,
      kind,
      name,
      summary,
      status: 'draft',
      iconAssetKey: null,
      archetypeKey: null,
      tags,
      schemaVersion: 1,
      metadata: options.metadata ?? {},
      llmHints: options.llmHints ?? { source: 'preset_catalog' },
      assetRefs: options.assetRefs ?? [],
      definitionData: options.definitionData ?? {},
      fieldValues: options.fieldValues ?? [],
      customFields: options.customFields ?? [],
      components: options.components ?? [],
    },
  }
}

function buildGraphPreset(
  id: string,
  graphType: GraphDefinition['graphType'],
  name: string,
  summary: string,
  builder: (graph: GraphDefinition) => GraphDefinition,
  tags: string[] = [],
): GraphPreset {
  return {
    id,
    kind: 'graph',
    tags,
    build(options) {
      const graph = createGraphScaffold({
        key: options?.keyOverride ?? id,
        name: options?.nameOverride ?? name,
        graphType,
        summary,
      })

      return builder({
        ...graph,
        metadata: {
          ...graph.metadata,
          sourcePresetId: id,
        },
      })
    },
  }
}

const archetypePresets: ArchetypePreset[] = [
  makeArchetypePreset(
    'item.consumable',
    'item',
    'Consumable',
    'Single-use item with immediate gameplay effects.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('heal_amount', 'Heal Amount', 'number', 1, { defaultValue: 0, constraints: { min: 0, step: 1 } }),
      makeField('cooldown_seconds', 'Cooldown', 'number', 2, { defaultValue: 0, constraints: { min: 0, step: 1 } }),
      makeField('rarity', 'Rarity', 'enum', 3, { required: true, defaultValue: 'common', constraints: { options: ['common', 'uncommon', 'rare', 'epic'] } }),
    ],
    ['items', 'starter'],
  ),
  makeArchetypePreset(
    'item.utility',
    'item',
    'Utility Item',
    'Reusable item that unlocks traversal or interaction paths.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('max_uses', 'Max Uses', 'number', 1, { defaultValue: 0, constraints: { min: 0, step: 1 } }),
      makeField('equip_slot', 'Equip Slot', 'enum', 2, { defaultValue: 'utility', constraints: { options: ['utility', 'hand', 'belt', 'trinket'] } }),
    ],
    ['items', 'starter'],
  ),
  makeArchetypePreset(
    'item.equipment',
    'item',
    'Equipment',
    'Persistent item that modifies a character or grants abilities.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('equip_slot', 'Equip Slot', 'enum', 1, { required: true, defaultValue: 'weapon', constraints: { options: ['weapon', 'offhand', 'head', 'body', 'trinket'] } }),
      makeField('power_rating', 'Power Rating', 'number', 2, { defaultValue: 1, constraints: { min: 0, step: 1 } }),
    ],
    ['items', 'equipment'],
  ),
  makeArchetypePreset(
    'item.quest_item',
    'item',
    'Quest Item',
    'Narrative or progression item tracked for state checks.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('quest_key', 'Quest', 'definition_ref', 1, { constraints: { allowedKinds: ['quest'] } }),
    ],
    ['items', 'quest'],
  ),
  makeArchetypePreset(
    'item.crafting_material',
    'item',
    'Crafting Material',
    'Stackable material used for recipes and upgrades.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('rarity', 'Rarity', 'enum', 1, { defaultValue: 'common', constraints: { options: ['common', 'uncommon', 'rare', 'epic'] } }),
    ],
    ['items', 'crafting'],
  ),
  makeArchetypePreset(
    'item.currency',
    'item',
    'Currency',
    'Economy token used by vendors and system exchanges.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('symbol', 'Symbol', 'text', 1, { defaultValue: '' }),
      makeField('is_soft_currency', 'Soft Currency', 'boolean', 2, { defaultValue: true }),
    ],
    ['items', 'economy', 'shared'],
    { category: 'currency' },
  ),
  makeArchetypePreset(
    'item.progression_token',
    'item',
    'Progression Token',
    'Hidden system-facing item used for branching and unlocks.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('is_hidden', 'Hidden', 'boolean', 1, { required: true, defaultValue: true }),
      makeField('unlocks_location', 'Unlocks Location', 'definition_ref', 2, { constraints: { allowedKinds: ['location'] } }),
    ],
    ['items', 'progression', 'shared'],
    { hiddenByDefault: true },
  ),
  makeArchetypePreset(
    'character.player_avatar',
    'character',
    'Player Avatar',
    'Primary player-controlled character with direct input bindings.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'player' }),
      makeField('starting_region', 'Starting Region', 'text', 1, { defaultValue: 'frontier' }),
    ],
    ['characters', 'player'],
    { controlledBy: 'player' },
  ),
  makeArchetypePreset(
    'character.companion',
    'character',
    'Companion',
    'Friendly party member with inventory and reusable abilities.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'companion' }),
      makeField('bond_level', 'Bond Level', 'number', 1, { defaultValue: 1 }),
    ],
    ['characters', 'ally'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.npc_vendor',
    'character',
    'Vendor NPC',
    'Non-player merchant linked to a market definition.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'vendor' }),
      makeField('market_key', 'Market', 'definition_ref', 1, { constraints: { allowedKinds: ['market'] } }),
    ],
    ['characters', 'npc', 'market'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.npc_questgiver',
    'character',
    'Quest Giver NPC',
    'Narrative NPC that drives quests and branch entry points.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'questgiver' }),
      makeField('quest_key', 'Quest', 'definition_ref', 1, { constraints: { allowedKinds: ['quest'] } }),
    ],
    ['characters', 'npc', 'quest'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.enemy_melee',
    'character',
    'Enemy Melee',
    'Aggressive close-range enemy.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'enemy' }),
      makeField('tier', 'Tier', 'enum', 1, { defaultValue: 'normal', constraints: { options: ['normal', 'elite', 'boss'] } }),
    ],
    ['characters', 'enemy', 'combat'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.enemy_ranged',
    'character',
    'Enemy Ranged',
    'Enemy that attacks from distance.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'enemy' }),
      makeField('tier', 'Tier', 'enum', 1, { defaultValue: 'normal', constraints: { options: ['normal', 'elite', 'boss'] } }),
    ],
    ['characters', 'enemy', 'combat'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.enemy_caster',
    'character',
    'Enemy Caster',
    'Enemy that uses abilities and ranged spell attacks.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'enemy' }),
      makeField('element', 'Element', 'enum', 1, { defaultValue: 'fire', constraints: { options: ['fire', 'ice', 'lightning', 'shadow'] } }),
    ],
    ['characters', 'enemy', 'caster'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.boss',
    'character',
    'Boss',
    'Major encounter character with layered abilities.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'boss' }),
      makeField('phase_count', 'Phase Count', 'number', 1, { defaultValue: 2 }),
    ],
    ['characters', 'enemy', 'boss'],
    { controlledBy: 'ai' },
  ),
  makeArchetypePreset(
    'character.beast_enemy',
    'character',
    'Beast Enemy',
    'Non-humanoid hostile character built around animal or creature behaviors.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'enemy' }),
      makeField('pack_behavior', 'Pack Behavior', 'boolean', 1, { defaultValue: false }),
    ],
    ['characters', 'enemy', 'beast'],
    { controlledBy: 'ai', subtype: 'beast' },
  ),
  makeArchetypePreset(
    'character.construct_boss',
    'character',
    'Construct Boss',
    'Large mechanical or magical boss character with staged logic.',
    [
      makeField('role', 'Role', 'text', 0, { defaultValue: 'boss' }),
      makeField('phase_count', 'Phase Count', 'number', 1, { defaultValue: 3 }),
    ],
    ['characters', 'boss', 'construct'],
    { controlledBy: 'ai', subtype: 'construct' },
  ),
  makeArchetypePreset(
    'ability.active_melee',
    'ability',
    'Active Melee Ability',
    'Triggered close-range combat action.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('damage', 'Damage', 'number', 1, { defaultValue: 5 }),
    ],
    ['abilities', 'combat'],
  ),
  makeArchetypePreset(
    'ability.active_ranged',
    'ability',
    'Active Ranged Ability',
    'Triggered ranged combat action.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('damage', 'Damage', 'number', 1, { defaultValue: 4 }),
    ],
    ['abilities', 'combat'],
  ),
  makeArchetypePreset(
    'ability.active_spell',
    'ability',
    'Active Spell',
    'Triggered magical ability with cost and cooldown.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('element', 'Element', 'enum', 1, { defaultValue: 'fire', constraints: { options: ['fire', 'ice', 'lightning', 'shadow', 'holy'] } }),
    ],
    ['abilities', 'magic'],
  ),
  makeArchetypePreset(
    'ability.active_heal',
    'ability',
    'Active Heal',
    'Triggered restorative ability.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('heal_amount', 'Heal Amount', 'number', 1, { defaultValue: 10 }),
    ],
    ['abilities', 'support'],
  ),
  makeArchetypePreset(
    'ability.passive_stat_bonus',
    'ability',
    'Passive Stat Bonus',
    'Always-on ability that modifies stats.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('bonus_stat', 'Bonus Stat', 'definition_ref', 1, { constraints: { allowedKinds: ['stat'] } }),
    ],
    ['abilities', 'passive'],
  ),
  makeArchetypePreset(
    'ability.passive_triggered',
    'ability',
    'Passive Triggered',
    'Passive ability that triggers under specific conditions.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('trigger', 'Trigger', 'text', 1, { defaultValue: 'on_hit' }),
    ],
    ['abilities', 'passive'],
  ),
  makeArchetypePreset(
    'location.hub',
    'location',
    'Hub',
    'Central location linking shops, NPCs, and story beats.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'frontier' }),
      makeField('travel_tier', 'Travel Tier', 'enum', 1, { defaultValue: 'core', constraints: { options: ['core', 'branch', 'locked'] } }),
    ],
    ['locations', 'safe'],
  ),
  makeArchetypePreset(
    'location.safehouse',
    'location',
    'Safehouse',
    'Rest and management location.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'frontier' }),
      makeField('has_bed', 'Has Bed', 'boolean', 1, { defaultValue: true }),
    ],
    ['locations', 'safe'],
  ),
  makeArchetypePreset(
    'location.dungeon',
    'location',
    'Dungeon',
    'Combat-focused location with gated progression.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'wilds' }),
      makeField('difficulty', 'Difficulty', 'enum', 1, { defaultValue: 'normal', constraints: { options: ['normal', 'hard', 'elite'] } }),
    ],
    ['locations', 'combat'],
  ),
  makeArchetypePreset(
    'location.encounter_zone',
    'location',
    'Encounter Zone',
    'Outdoor or traversal location tied to encounter graphs.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'wilds' }),
      makeField('threat_level', 'Threat Level', 'number', 1, { defaultValue: 1 }),
    ],
    ['locations', 'combat'],
  ),
  makeArchetypePreset(
    'location.shopfront',
    'location',
    'Shopfront',
    'Location whose primary purpose is hosting vendors.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'settlement' }),
      makeField('featured_market', 'Featured Market', 'definition_ref', 1, { constraints: { allowedKinds: ['market'] } }),
    ],
    ['locations', 'market'],
  ),
  makeArchetypePreset(
    'environment.settlement',
    'environment',
    'Settlement Environment',
    'Scene-facing settlement or town environment linked to gameplay locations.',
    [
      makeField('biome', 'Biome', 'text', 0, { defaultValue: 'temperate' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'site', constraints: { options: ['room', 'site', 'zone', 'region'] } }),
    ],
    ['environments', 'settlement'],
    { subtype: 'settlement' },
  ),
  makeArchetypePreset(
    'environment.dungeon',
    'environment',
    'Dungeon Environment',
    'Interior environment used for layered traversal and encounter spaces.',
    [
      makeField('biome', 'Biome', 'text', 0, { defaultValue: 'stone' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'site', constraints: { options: ['room', 'site', 'zone', 'region'] } }),
    ],
    ['environments', 'dungeon'],
    { subtype: 'dungeon' },
  ),
  makeArchetypePreset(
    'environment.wilderness',
    'environment',
    'Wilderness Environment',
    'Outdoor environment for routes, regions, and encounter spaces.',
    [
      makeField('biome', 'Biome', 'text', 0, { defaultValue: 'forest' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'zone', constraints: { options: ['room', 'site', 'zone', 'region'] } }),
    ],
    ['environments', 'wilderness'],
    { subtype: 'wilderness' },
  ),
  makeArchetypePreset(
    'environment.structure',
    'environment',
    'Structure Environment',
    'Standalone structure or POI environment with traversal metadata.',
    [
      makeField('biome', 'Biome', 'text', 0, { defaultValue: 'ruin' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'site', constraints: { options: ['room', 'site', 'zone', 'region'] } }),
    ],
    ['environments', 'structure'],
    { subtype: 'structure' },
  ),
  makeArchetypePreset(
    'world_model.hub_world',
    'world_model',
    'Hub World',
    'Compact world model centered around a main hub and connected spokes.',
    [
      makeField('theme', 'Theme', 'text', 0, { defaultValue: 'frontier' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'regional', constraints: { options: ['local', 'regional', 'planetary'] } }),
    ],
    ['world', 'hub'],
    { subtype: 'hub_world' },
  ),
  makeArchetypePreset(
    'world_model.region_set',
    'world_model',
    'Region Set',
    'World model representing a set of connected regions or zones.',
    [
      makeField('theme', 'Theme', 'text', 0, { defaultValue: 'frontier' }),
      makeField('scale_tier', 'Scale Tier', 'enum', 1, { defaultValue: 'regional', constraints: { options: ['local', 'regional', 'planetary'] } }),
    ],
    ['world', 'regions'],
    { subtype: 'region_set' },
  ),
  makeArchetypePreset(
    'item.prop',
    'item',
    'Prop Item',
    'Physical world prop or pickup-ready object with placeholder 3D-ready data.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('physical_role', 'Physical Role', 'enum', 1, { defaultValue: 'prop', constraints: { options: ['prop', 'pickup', 'world_object'] } }),
    ],
    ['items', 'physical'],
    { physicalSubtype: 'prop' },
  ),
  makeArchetypePreset(
    'item.world_object',
    'item',
    'World Object',
    'Physical item used as a placeable world-facing object.',
    [
      makeField('description', 'Description', 'long_text', 0, { required: true, defaultValue: '' }),
      makeField('physical_role', 'Physical Role', 'enum', 1, { defaultValue: 'world_object', constraints: { options: ['prop', 'pickup', 'world_object'] } }),
    ],
    ['items', 'physical', 'world'],
    { physicalSubtype: 'world_object' },
  ),
  makeArchetypePreset(
    'market.vendor_basic',
    'market',
    'Basic Vendor',
    'Sells consumables and utility items for currency.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'frontier' }),
      makeField('currency_key', 'Currency', 'definition_ref', 1, { constraints: { allowedKinds: ['item'] } }),
    ],
    ['markets', 'economy'],
  ),
  makeArchetypePreset(
    'market.vendor_barter',
    'market',
    'Barter Vendor',
    'Trades items directly for other items.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'frontier' }),
      makeField('barter_style', 'Barter Style', 'text', 1, { defaultValue: 'materials' }),
    ],
    ['markets', 'economy'],
  ),
  makeArchetypePreset(
    'market.vendor_recipes',
    'market',
    'Recipe Vendor',
    'Focuses on crafting materials and unlockables.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'frontier' }),
      makeField('currency_key', 'Currency', 'definition_ref', 1, { constraints: { allowedKinds: ['item'] } }),
    ],
    ['markets', 'crafting'],
  ),
  makeArchetypePreset(
    'market.black_market',
    'market',
    'Black Market',
    'Hidden vendor with gated trades.',
    [
      makeField('region', 'Region', 'text', 0, { defaultValue: 'undercity' }),
      makeField('currency_key', 'Currency', 'definition_ref', 1, { constraints: { allowedKinds: ['item'] } }),
    ],
    ['markets', 'economy', 'gated'],
  ),
]
const definitionPresets: DefinitionPreset[] = [
  makeDefinitionPreset('currency.gold', 'item', 'Gold', 'Primary soft currency for common markets.', {
    archetypeKey: 'item.currency',
    fieldValues: [
      { fieldKey: 'description', value: 'Stamped coins used in most frontier markets.' },
      { fieldKey: 'symbol', value: 'G' },
      { fieldKey: 'is_soft_currency', value: true },
    ],
    definitionData: { stackable: true },
  }, ['currency', 'starter']),
  makeDefinitionPreset('currency.mana', 'item', 'Mana', 'Magical resource used for spells and arcane purchases.', {
    archetypeKey: 'item.currency',
    fieldValues: [
      { fieldKey: 'description', value: 'Arcane energy condensed into usable motes.' },
      { fieldKey: 'symbol', value: 'MP' },
      { fieldKey: 'is_soft_currency', value: false },
    ],
    definitionData: { stackable: true },
  }, ['currency']),
  makeDefinitionPreset('currency.energy', 'item', 'Energy', 'Resource for fast action-oriented systems.', {
    archetypeKey: 'item.currency',
    fieldValues: [
      { fieldKey: 'description', value: 'Action energy recovered over time or at rest.' },
      { fieldKey: 'symbol', value: 'EN' },
      { fieldKey: 'is_soft_currency', value: false },
    ],
    definitionData: { stackable: true },
  }, ['currency']),
  makeDefinitionPreset('progression.main_token', 'item', 'Main Route Token', 'Shared progression token for the critical path.', {
    archetypeKey: 'item.progression_token',
    tags: ['shadow_token', 'hidden'],
    fieldValues: [
      { fieldKey: 'description', value: 'Marks the next mainline progression gate.' },
      { fieldKey: 'is_hidden', value: true },
      { fieldKey: 'unlocks_location', value: null },
    ],
    components: [
      {
        type: 'progression',
        config: {
          tokenKeys: ['progression.main_token'],
          unlocks: [],
        },
      },
    ],
    definitionData: { stackable: false, systemItem: true },
  }, ['progression', 'starter']),
  makeDefinitionPreset('progression.side_token', 'item', 'Side Route Token', 'Shared progression token for optional branches.', {
    archetypeKey: 'item.progression_token',
    tags: ['shadow_token', 'hidden'],
    fieldValues: [
      { fieldKey: 'description', value: 'Marks a side-route unlock or milestone.' },
      { fieldKey: 'is_hidden', value: true },
      { fieldKey: 'unlocks_location', value: null },
    ],
    definitionData: { stackable: false, systemItem: true },
  }, ['progression']),
  makeDefinitionPreset('progression.region_unlock', 'item', 'Region Unlock Token', 'Shared token used to open new world regions.', {
    archetypeKey: 'item.progression_token',
    tags: ['shadow_token', 'hidden'],
    fieldValues: [
      { fieldKey: 'description', value: 'Unlocks entry into a region once granted.' },
      { fieldKey: 'is_hidden', value: true },
      { fieldKey: 'unlocks_location', value: null },
    ],
    definitionData: { stackable: false, systemItem: true },
  }, ['progression']),
  makeDefinitionPreset('item.minor_healing_potion', 'item', 'Minor Healing Potion', 'Starter restorative consumable for early vendors and player kits.', {
    archetypeKey: 'item.consumable',
    fieldValues: [
      { fieldKey: 'description', value: 'A simple restorative carried by scouts and quartermasters.' },
      { fieldKey: 'heal_amount', value: 20 },
      { fieldKey: 'cooldown_seconds', value: 0 },
      { fieldKey: 'rarity', value: 'common' },
    ],
    definitionData: { stackable: true },
  }, ['items', 'starter']),
  makeDefinitionPreset('ability.fireball', 'ability', 'Fireball', 'Arcane projectile that damages an enemy.', {
    archetypeKey: 'ability.active_spell',
    fieldValues: [
      { fieldKey: 'description', value: 'Hurl a fast fireball at a target.' },
      { fieldKey: 'element', value: 'fire' },
    ],
    components: [
      {
        type: 'ability_profile',
        config: {
          targetMode: 'enemy',
          cooldownSeconds: 6,
          castTimeSeconds: 0.4,
          resourceCostItemKey: 'currency.mana',
          resourceCostQuantity: 10,
          effectOps: [],
        },
      },
    ],
  }, ['abilities', 'starter']),
  makeDefinitionPreset('ability.melee_attack', 'ability', 'Melee Attack', 'Basic close-range attack.', {
    archetypeKey: 'ability.active_melee',
    fieldValues: [
      { fieldKey: 'description', value: 'Strike the target at close range.' },
      { fieldKey: 'damage', value: 6 },
    ],
    components: [
      {
        type: 'ability_profile',
        config: {
          targetMode: 'enemy',
          cooldownSeconds: 0,
          castTimeSeconds: 0.2,
          resourceCostItemKey: null,
          resourceCostQuantity: 0,
          effectOps: [],
        },
      },
    ],
  }, ['abilities', 'starter']),
  makeDefinitionPreset('ability.basic_shot', 'ability', 'Basic Shot', 'Basic ranged attack.', {
    archetypeKey: 'ability.active_ranged',
    fieldValues: [
      { fieldKey: 'description', value: 'Loose a simple ranged attack.' },
      { fieldKey: 'damage', value: 5 },
    ],
    components: [
      {
        type: 'ability_profile',
        config: {
          targetMode: 'enemy',
          cooldownSeconds: 0,
          castTimeSeconds: 0.2,
          resourceCostItemKey: null,
          resourceCostQuantity: 0,
          effectOps: [],
        },
      },
    ],
  }, ['abilities', 'starter']),
  makeDefinitionPreset('ability.guard', 'ability', 'Guard', 'Defensive stance that reduces incoming pressure.', {
    archetypeKey: 'ability.passive_triggered',
    fieldValues: [
      { fieldKey: 'description', value: 'Brace for impact and mitigate damage.' },
      { fieldKey: 'trigger', value: 'on_guard' },
    ],
    components: [
      {
        type: 'ability_profile',
        config: {
          targetMode: 'self',
          cooldownSeconds: 4,
          castTimeSeconds: 0,
          resourceCostItemKey: null,
          resourceCostQuantity: 0,
          effectOps: [],
        },
      },
    ],
  }, ['abilities', 'starter']),
  makeDefinitionPreset('ability.heal_small', 'ability', 'Minor Heal', 'Small restorative spell or action.', {
    archetypeKey: 'ability.active_heal',
    fieldValues: [
      { fieldKey: 'description', value: 'Restore a small amount of health.' },
      { fieldKey: 'heal_amount', value: 12 },
    ],
    components: [
      {
        type: 'ability_profile',
        config: {
          targetMode: 'ally',
          cooldownSeconds: 8,
          castTimeSeconds: 0.5,
          resourceCostItemKey: 'currency.mana',
          resourceCostQuantity: 8,
          effectOps: [],
        },
      },
    ],
  }, ['abilities', 'starter']),
  makeDefinitionPreset('character.player_starter', 'character', 'Starter Hero', 'Primary player-controlled starter character.', {
    archetypeKey: 'character.player_avatar',
    metadata: { controlledBy: 'player' },
    fieldValues: [
      { fieldKey: 'role', value: 'player' },
      { fieldKey: 'starting_region', value: 'frontier' },
    ],
    components: [
      ...buildDefaultDefinitionComponents('character').map((component) =>
        component.type === 'character_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'humanoid',
                bodyClass: 'humanoid',
                controlMode: 'player',
                scaleProfile: 'medium',
              },
            }
          : component.type === 'ability_loadout'
            ? {
                ...component,
                config: {
                  entries: [
                    {
                      abilityKey: 'ability.melee_attack',
                      slotKey: 'primary',
                      inputBinding: 'Mouse1',
                      cooldownGroup: 'attack',
                      unlockTokenKey: null,
                    },
                  ],
                },
              }
            : component.type === 'logic_state_machine_binding'
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    controlMode: 'player',
                  },
                }
              : component,
      ),
    ] as DefinitionBase['components'],
  }, ['characters', 'starter']),
  makeDefinitionPreset('character.frontier_vendor', 'character', 'Frontier Quartermaster', 'Starter vendor NPC for the first hub.', {
    archetypeKey: 'character.npc_vendor',
    metadata: { controlledBy: 'ai' },
    fieldValues: [
      { fieldKey: 'role', value: 'vendor' },
      { fieldKey: 'market_key', value: 'market.frontier_supplies' },
    ],
    components: [
      ...buildDefaultDefinitionComponents('character').map((component) =>
        component.type === 'character_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'humanoid',
                bodyClass: 'humanoid',
                controlMode: 'ai',
                scaleProfile: 'medium',
              },
            }
          : component,
      ),
      {
        type: 'dialogue_actor',
        config: {
          portraitAssetKey: null,
          voiceAssetKey: null,
          persona: 'Practical, guarded, and always watching inventory levels.',
        },
      },
    ] as DefinitionBase['components'],
  }, ['characters', 'npc']),
  makeDefinitionPreset('character.frontier_beast', 'character', 'Frontier Stalker', 'Starter beast enemy for the first encounter zone.', {
    archetypeKey: 'character.beast_enemy',
    metadata: { controlledBy: 'ai' },
    fieldValues: [
      { fieldKey: 'role', value: 'enemy' },
      { fieldKey: 'pack_behavior', value: true },
    ],
    components: [
      ...buildDefaultDefinitionComponents('character').map((component) =>
        component.type === 'character_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'beast',
                bodyClass: 'quadruped',
                controlMode: 'ai',
                scaleProfile: 'medium',
              },
            }
          : component.type === 'ability_loadout'
            ? {
                ...component,
                config: {
                  entries: [
                    {
                      abilityKey: 'ability.melee_attack',
                      slotKey: 'bite',
                      inputBinding: null,
                      cooldownGroup: 'attack',
                      unlockTokenKey: null,
                    },
                  ],
                },
              }
            : component,
      ),
    ] as DefinitionBase['components'],
  }, ['characters', 'enemy']),
  makeDefinitionPreset('market.frontier_supplies', 'market', 'Frontier Supplies', 'Starter vendor inventory for the first hub.', {
    archetypeKey: 'market.vendor_basic',
    components: [
      {
        type: 'market_inventory',
        config: {
          trades: [
            {
              id: 'trade-healing-potion',
              offerItemKey: 'item.minor_healing_potion',
              offerQuantity: 1,
              costItemKey: 'currency.gold',
              costQuantity: 10,
              unlockTokenKey: null,
            },
          ],
        },
      },
    ],
  }, ['markets']),
  makeDefinitionPreset('world_model.frontier_regions', 'world_model', 'Frontier Regions', 'Starter world model linking the first authored environments.', {
    archetypeKey: 'world_model.region_set',
    fieldValues: [
      { fieldKey: 'theme', value: 'frontier' },
      { fieldKey: 'scale_tier', value: 'regional' },
    ],
    components: [
      ...buildDefaultDefinitionComponents('world_model').map((component) =>
        component.type === 'world_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'region_set',
                theme: 'frontier',
                scaleTier: 'regional',
                generationStyle: 'hand_authored',
              },
            }
            : component.type === 'world_environment_index'
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    environmentKeys: ['environment.frontier_hub'],
                    primaryEnvironmentKey: 'environment.frontier_hub',
                  },
                }
            : component,
      ),
    ] as DefinitionBase['components'],
  }, ['world', 'starter']),
  makeDefinitionPreset('environment.frontier_hub', 'environment', 'Frontier Hub', 'Starter settlement environment for the opening hub.', {
    archetypeKey: 'environment.settlement',
    fieldValues: [
      { fieldKey: 'biome', value: 'frontier' },
      { fieldKey: 'scale_tier', value: 'site' },
    ],
    components: [
      ...buildDefaultDefinitionComponents('environment').map((component) =>
        component.type === 'environment_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'settlement',
                biome: 'frontier',
                scaleTier: 'site',
                linkedLocationKeys: [],
                worldModelKey: 'world_model.frontier_regions',
              },
            }
            : component,
      ),
    ] as DefinitionBase['components'],
  }, ['environment', 'starter']),
  makeDefinitionPreset('environment.frontier_wilds', 'environment', 'Frontier Wilds', 'Starter wilderness environment for early routes and encounters.', {
    archetypeKey: 'environment.wilderness',
    fieldValues: [
      { fieldKey: 'biome', value: 'forest' },
      { fieldKey: 'scale_tier', value: 'zone' },
    ],
    components: [
      ...buildDefaultDefinitionComponents('environment').map((component) =>
        component.type === 'environment_profile'
          ? {
              ...component,
              config: {
                ...component.config,
                subtype: 'wilderness',
                biome: 'forest',
                scaleTier: 'zone',
                linkedLocationKeys: [],
                worldModelKey: 'world_model.frontier_regions',
              },
            }
            : component,
      ),
    ] as DefinitionBase['components'],
  }, ['environment']),
  makeDefinitionPreset('item.worn_crate', 'item', 'Worn Crate', 'Starter physical prop item for world interactions and loot dressing.', {
    archetypeKey: 'item.prop',
    fieldValues: [
      { fieldKey: 'description', value: 'A beat-up crate that can dress a scene or hold starter loot.' },
      { fieldKey: 'physical_role', value: 'prop' },
    ],
    components: [
      {
        type: 'physical_item_profile',
        config: {
          physicalSubtype: 'prop',
          worldPlacementRole: 'set_dressing',
          pickupContext: 'none',
        },
      },
      {
        type: 'render_3d_binding',
        config: {
          primaryMeshAssetKey: null,
          previewImageAssetKey: null,
          conceptPrompt: null,
          generationPrompt: null,
          generationStyle: null,
        },
      },
    ],
    definitionData: { stackable: false },
  }, ['items', 'physical']),
]

const graphPresets: GraphPreset[] = [
  buildGraphPreset(
    'graph.starting_hub_loop',
    'narrative_flow',
    'Starting Hub Loop',
    'Hub scene connecting vendor, quest, and branch exits.',
    (graph) => {
      const keys = getGraphScaffoldKeys(graph.key)
      const hub = normalizeNode({
        id: `node-${graph.key}-hub`,
        key: `text.${keys.suffix}_hub`,
        type: 'text',
        title: 'Hub Arrival',
        templateKey: 'story_text',
        subtitle: null,
        position: { x: 320, y: 180 },
        body: { text: 'The hub is noisy, tense, and full of leads.', imageAssetKey: null, audioAssetKey: null, choices: [] },
        condition: null,
        effects: [],
        ports: [],
        display: { iconAssetKey: null, compactPreview: false },
        metadata: {},
      })
      const choice = normalizeNode({
        id: `node-${graph.key}-choice`,
        key: `choice.${keys.suffix}_hub`,
        type: 'choice',
        title: 'Choose Your Focus',
        templateKey: 'choice',
        subtitle: null,
        position: { x: 620, y: 180 },
        body: {
          text: 'Pick where to push next.',
          imageAssetKey: null,
          audioAssetKey: null,
          choices: [
            { id: 'vendor', label: 'Visit the vendor' },
            { id: 'quest', label: 'Take the contract' },
          ],
        },
        condition: null,
        effects: [],
        ports: [],
        display: { iconAssetKey: null, compactPreview: false },
        metadata: {},
      })
      return {
        ...graph,
        nodes: [graph.nodes[0], hub, choice, graph.nodes[1]],
        edges: [
          {
            ...graph.edges[0],
            source: { nodeKey: graph.nodes[0].key, portId: 'out' },
            target: { nodeKey: hub.key, portId: 'in' },
            key: `edge.${keys.suffix}_start_hub`,
          },
          {
            id: `edge-${graph.key}-hub-choice`,
            key: `edge.${keys.suffix}_hub_choice`,
            source: { nodeKey: hub.key, portId: 'out' },
            target: { nodeKey: choice.key, portId: 'in' },
            label: null,
            condition: null,
            metadata: {},
          },
          {
            id: `edge-${graph.key}-choice-end`,
            key: `edge.${keys.suffix}_choice_end`,
            source: { nodeKey: choice.key, portId: 'out' },
            target: { nodeKey: graph.nodes[1].key, portId: 'in' },
            label: null,
            condition: null,
            metadata: {},
          },
        ],
      }
    },
    ['graph', 'starter'],
  ),
  buildGraphPreset('graph.vendor_intro', 'narrative_flow', 'Vendor Intro', 'Short narrative graph that introduces a vendor.', (graph) => graph, ['graph', 'market']),
  buildGraphPreset('graph.quest_offer', 'quest_flow', 'Quest Offer', 'Quest offer and acceptance starter graph.', (graph) => graph, ['graph', 'quest']),
  buildGraphPreset('graph.gated_region_unlock', 'system_graph', 'Gated Region Unlock', 'System graph used to gate a region behind progression.', (graph) => graph, ['graph', 'progression']),
  buildGraphPreset('graph.basic_combat_encounter', 'system_graph', 'Basic Combat Encounter', 'System graph for a compact starter combat loop.', (graph) => graph, ['graph', 'combat']),
]

const packPresets: PackPreset[] = [
  {
    id: 'pack.rpg_core',
    kind: 'pack',
    tags: ['starter'],
    archetypePresetIds: [
      'item.consumable',
      'item.utility',
      'item.equipment',
      'item.currency',
      'item.progression_token',
      'character.player_avatar',
      'character.companion',
      'character.enemy_melee',
      'character.enemy_caster',
      'character.beast_enemy',
      'ability.active_melee',
      'ability.active_spell',
      'ability.active_heal',
      'location.hub',
      'location.dungeon',
      'environment.settlement',
      'environment.dungeon',
      'world_model.hub_world',
      'market.vendor_basic',
    ],
    definitionPresetIds: [
      'currency.gold',
      'currency.mana',
      'progression.main_token',
      'item.minor_healing_potion',
      'ability.fireball',
      'ability.melee_attack',
      'ability.heal_small',
      'character.player_starter',
      'character.frontier_vendor',
      'character.frontier_beast',
      'market.frontier_supplies',
      'world_model.frontier_regions',
      'environment.frontier_hub',
    ],
    graphPresetIds: ['graph.starting_hub_loop', 'graph.quest_offer'],
  },
  {
    id: 'pack.action_rpg',
    kind: 'pack',
    tags: ['starter'],
    archetypePresetIds: [
      'item.utility',
      'item.equipment',
      'item.currency',
      'item.progression_token',
      'character.player_avatar',
      'character.enemy_melee',
      'character.enemy_ranged',
      'ability.active_melee',
      'ability.active_ranged',
      'location.encounter_zone',
      'environment.wilderness',
      'world_model.region_set',
      'market.vendor_basic',
    ],
    definitionPresetIds: ['currency.energy', 'progression.main_token', 'item.minor_healing_potion', 'ability.melee_attack', 'ability.basic_shot', 'character.player_starter', 'character.frontier_beast', 'world_model.frontier_regions', 'environment.frontier_wilds'],
    graphPresetIds: ['graph.basic_combat_encounter'],
  },
  {
    id: 'pack.survival',
    kind: 'pack',
    tags: ['starter'],
    archetypePresetIds: [
      'item.utility',
      'item.crafting_material',
      'item.currency',
      'item.progression_token',
      'item.world_object',
      'character.player_avatar',
      'character.npc_vendor',
      'location.safehouse',
      'location.encounter_zone',
      'environment.wilderness',
      'environment.structure',
      'world_model.region_set',
      'market.vendor_barter',
    ],
    definitionPresetIds: ['currency.energy', 'progression.region_unlock', 'item.worn_crate', 'character.player_starter', 'character.frontier_vendor', 'world_model.frontier_regions', 'environment.frontier_wilds'],
    graphPresetIds: ['graph.starting_hub_loop'],
  },
  {
    id: 'pack.narrative_adventure',
    kind: 'pack',
    tags: ['starter'],
    archetypePresetIds: [
      'item.quest_item',
      'item.progression_token',
      'character.player_avatar',
      'character.npc_questgiver',
      'location.hub',
      'location.shopfront',
      'environment.settlement',
      'world_model.hub_world',
      'market.vendor_basic',
    ],
    definitionPresetIds: ['currency.gold', 'progression.main_token', 'item.minor_healing_potion', 'character.player_starter', 'character.frontier_vendor', 'market.frontier_supplies', 'world_model.frontier_regions', 'environment.frontier_hub'],
    graphPresetIds: ['graph.vendor_intro', 'graph.quest_offer'],
  },
]

export const presetCatalog = {
  version: PRESET_CATALOG_VERSION,
  archetypes: archetypePresets,
  definitions: definitionPresets,
  graphs: graphPresets,
  packs: packPresets,
}

export const archetypePresetMap = new Map(archetypePresets.map((preset) => [preset.id, preset]))
export const definitionPresetMap = new Map(definitionPresets.map((preset) => [preset.id, preset]))
export const graphPresetMap = new Map(graphPresets.map((preset) => [preset.id, preset]))
export const packPresetMap = new Map(packPresets.map((preset) => [preset.id, preset]))

export function expandPackPresetIds(packIds: string[]) {
  const archetypePresetIds = new Set<string>()
  const definitionPresetIds = new Set<string>()
  const graphPresetIds = new Set<string>()

  for (const packId of packIds) {
    const pack = packPresetMap.get(packId)
    if (!pack) continue
    for (const id of pack.archetypePresetIds) archetypePresetIds.add(id)
    for (const id of pack.definitionPresetIds) definitionPresetIds.add(id)
    for (const id of pack.graphPresetIds) graphPresetIds.add(id)
  }

  return {
    archetypePresetIds: [...archetypePresetIds],
    definitionPresetIds: [...definitionPresetIds],
    graphPresetIds: [...graphPresetIds],
  }
}

export function materializeArchetypePreset(presetId: string): ArchetypeDefinition | null {
  const preset = archetypePresetMap.get(presetId)
  if (!preset) return null
  return {
    id: `archetype-${presetId}-${Date.now()}`,
    ...preset.archetype,
    metadata: {
      ...preset.archetype.metadata,
      sourcePresetId: presetId,
    },
    llmHints: {
      ...preset.archetype.llmHints,
      sourcePresetId: presetId,
    },
  }
}

export function materializeDefinitionPreset(
  presetId: string,
  overrides: { keyOverride?: string; nameOverride?: string } = {},
): DefinitionBase | null {
  const preset = definitionPresetMap.get(presetId)
  if (!preset) return null
  return {
    id: `definition-${presetId}-${Date.now()}`,
    ...preset.definition,
    key: overrides.keyOverride ?? preset.definition.key,
    name: overrides.nameOverride ?? preset.definition.name,
    metadata: {
      ...preset.definition.metadata,
      sourcePresetId: presetId,
    },
    llmHints: {
      ...preset.definition.llmHints,
      sourcePresetId: presetId,
    },
  }
}

export function materializeGraphPreset(
  presetId: string,
  overrides: { keyOverride?: string; nameOverride?: string } = {},
): GraphDefinition | null {
  const preset = graphPresetMap.get(presetId)
  if (!preset) return null
  return preset.build(overrides)
}

export function createDefaultGameSpec(packIds: string[] = ['pack.rpg_core']): GameSpec {
  const expanded = expandPackPresetIds(packIds)
  return {
    presetCatalogVersion: PRESET_CATALOG_VERSION,
    title: '',
    theme: {
      genre: 'fantasy_rpg',
      tone: 'grounded',
      playerFantasy: 'adventurer',
      worldPremise: '',
      namingStyle: 'classic_fantasy',
      artStylePreset: FALLBACK_ART_STYLE_PRESET,
      artStyleDescription: '',
    },
    systems: {
      progressionStyle: 'branching',
      combatStyle: 'real_time',
      inputStyle: 'direct_control',
      inventoryStyle: 'slots',
      economyStyle: 'gold',
    },
    contentScope: {
      items: 'heavy',
      characters: 'heavy',
      abilities: 'medium',
      locations: 'medium',
      environments: 'medium',
      worldModels: 'light',
      markets: 'light',
      quests: 'medium',
      graphs: 'medium',
    },
    selectedPresetIds: {
      packs: packIds,
      archetypes: expanded.archetypePresetIds,
      definitions: expanded.definitionPresetIds,
      graphs: expanded.graphPresetIds,
    },
    cinematics: {
      stillAspectRatio: '16:9',
      stillResolution: '1K',
      videoResolution: '720p',
      defaultClipSeconds: 5,
      defaultFps: 24,
      presetFamily: 'story_movie_tv',
      presetId: 'story_movie_tv',
      storyScenePreset: 'dialogue_two_hander',
      storyLanguagePreset: 'grounded_naturalist',
      artStylePreset: null,
      inferredArtStylePreset: null,
      useInferredArtStyle: true,
      formatSubtype: null,
      formulaFamily: null,
      dominantTrigger: null,
      creativeTreatment: null,
      hookFamily: null,
      narrationMode: null,
      authorshipPipeline: 'story_script_ingest_v1',
      backdropRole: null,
      backdropStrategy: '',
      contrastAxis: '',
      proofMoment: '',
      ctaStyle: '',
      targetTotalDurationSeconds: null,
      targetTotalDurationRangeSeconds: null,
      targetShotCount: null,
      targetShotCountRange: null,
      proofDeadlineShotIndex: null,
      idealShotDurationRangeSeconds: null,
      maxDialogueWordsPerShot: null,
      maxActionBeatsPerShot: null,
      specializationMode: 'story',
    },
    bootstrapTargets: {
      starterArchetypePresetIds: expanded.archetypePresetIds,
      starterDefinitionPresetIds: expanded.definitionPresetIds,
      starterGraphPresetIds: expanded.graphPresetIds,
    },
    overrides: {},
  }
}

export function buildBootstrapPatch(gameSpec: GameSpec): PatchOperation[] {
  const operations: PatchOperation[] = [
    {
      op: 'set_game_spec',
      gameSpec,
    },
    ...gameSpec.selectedPresetIds.packs.map((packId) => ({
      op: 'apply_preset_pack',
      packId,
    } satisfies PatchOperation)),
  ]

  const seenArchetypes = new Set<string>()
  const seenDefinitions = new Set<string>()
  const seenGraphs = new Set<string>()

  for (const presetId of gameSpec.bootstrapTargets.starterArchetypePresetIds) {
    if (seenArchetypes.has(presetId)) continue
    seenArchetypes.add(presetId)
    operations.push({ op: 'instantiate_archetype_preset', presetId })
  }

  for (const presetId of gameSpec.bootstrapTargets.starterDefinitionPresetIds) {
    if (seenDefinitions.has(presetId)) continue
    seenDefinitions.add(presetId)
    operations.push({ op: 'instantiate_definition_preset', presetId })
  }

  for (const presetId of gameSpec.bootstrapTargets.starterGraphPresetIds) {
    if (seenGraphs.has(presetId)) continue
    seenGraphs.add(presetId)
    operations.push({ op: 'instantiate_graph_preset', presetId })
  }

  return operations
}
