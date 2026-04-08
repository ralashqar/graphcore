export type BaselineArchetypeFieldSeed = {
  key: string
  label: string
  fieldType: 'text' | 'long_text' | 'number' | 'boolean' | 'enum' | 'asset_ref' | 'definition_ref' | 'url'
  description: string
  required: boolean
  defaultValue: string | number | boolean | null
  constraints: Record<string, unknown>
  sortOrder: number
}

export type BaselineArchetypeSeed = {
  key: string
  name: string
  summary: string
  appliesToKind: 'item'
  iconAssetKey: string | null
  metadata: Record<string, unknown>
  llmHints: Record<string, unknown>
  fields: BaselineArchetypeFieldSeed[]
}

export const BASELINE_ITEM_ARCHETYPE_KEYS = [
  'item.consumable',
  'item.utility',
  'item.progression_token',
] as const

export const BASELINE_ITEM_ARCHETYPES: BaselineArchetypeSeed[] = [
  {
    key: 'item.consumable',
    name: 'Consumable',
    summary: 'Single-use item with immediate gameplay effects.',
    appliesToKind: 'item',
    iconAssetKey: null,
    metadata: {
      category: 'inventory',
    },
    llmHints: {
      promptStyle: 'Support healing, mana, buffs, and timed utility items.',
    },
    fields: [
      {
        key: 'description',
        label: 'Description',
        fieldType: 'long_text',
        description: 'Player-facing description in inventory and tooltips.',
        required: true,
        defaultValue: '',
        constraints: {},
        sortOrder: 0,
      },
      {
        key: 'heal_amount',
        label: 'Heal Amount',
        fieldType: 'number',
        description: 'Amount of health restored on use.',
        required: false,
        defaultValue: 0,
        constraints: {
          min: 0,
          step: 1,
        },
        sortOrder: 1,
      },
      {
        key: 'cooldown_seconds',
        label: 'Cooldown',
        fieldType: 'number',
        description: 'Seconds before the item can be reused.',
        required: false,
        defaultValue: 0,
        constraints: {
          min: 0,
          step: 1,
        },
        sortOrder: 2,
      },
      {
        key: 'rarity',
        label: 'Rarity',
        fieldType: 'enum',
        description: 'Loot tier and item coloration.',
        required: true,
        defaultValue: 'common',
        constraints: {
          options: ['common', 'uncommon', 'rare', 'epic'],
        },
        sortOrder: 3,
      },
    ],
  },
  {
    key: 'item.utility',
    name: 'Utility Item',
    summary: 'Reusable item that changes traversal or encounter options.',
    appliesToKind: 'item',
    iconAssetKey: null,
    metadata: {},
    llmHints: {
      promptStyle: 'Utility items often gate branches or dialogue checks.',
    },
    fields: [
      {
        key: 'description',
        label: 'Description',
        fieldType: 'long_text',
        description: 'Short utility item description.',
        required: true,
        defaultValue: '',
        constraints: {},
        sortOrder: 0,
      },
      {
        key: 'max_uses',
        label: 'Max Uses',
        fieldType: 'number',
        description: 'Use count before the item breaks or depletes.',
        required: false,
        defaultValue: 0,
        constraints: {
          min: 0,
          step: 1,
        },
        sortOrder: 1,
      },
      {
        key: 'equip_slot',
        label: 'Equip Slot',
        fieldType: 'enum',
        description: 'Optional slot for equipment handling.',
        required: false,
        defaultValue: 'utility',
        constraints: {
          options: ['utility', 'hand', 'belt', 'trinket'],
        },
        sortOrder: 2,
      },
    ],
  },
  {
    key: 'item.progression_token',
    name: 'Progression Token',
    summary: 'Hidden or system-facing item used by narrative and unlock conditions.',
    appliesToKind: 'item',
    iconAssetKey: null,
    metadata: {
      hiddenByDefault: true,
    },
    llmHints: {
      promptStyle: 'Use for flags, unlocks, or shadow progression.',
    },
    fields: [
      {
        key: 'description',
        label: 'Description',
        fieldType: 'long_text',
        description: 'Internal description for designers.',
        required: true,
        defaultValue: '',
        constraints: {},
        sortOrder: 0,
      },
      {
        key: 'is_hidden',
        label: 'Hidden',
        fieldType: 'boolean',
        description: 'Whether the token is exposed to players.',
        required: true,
        defaultValue: true,
        constraints: {},
        sortOrder: 1,
      },
      {
        key: 'unlocks_location',
        label: 'Unlocks Location',
        fieldType: 'definition_ref',
        description: 'Optional location or system node unlocked by this token.',
        required: false,
        defaultValue: null,
        constraints: {
          allowedKinds: ['location'],
        },
        sortOrder: 2,
      },
    ],
  },
]

export function hasMissingBaselineItemArchetypes(archetypes: Array<{ key: string }>) {
  const presentKeys = new Set(archetypes.map((archetype) => archetype.key))
  return BASELINE_ITEM_ARCHETYPE_KEYS.some((key) => !presentKeys.has(key))
}
