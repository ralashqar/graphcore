import { archetypePresetMap } from './presetCatalog'

export const BASELINE_ARCHETYPE_PRESET_IDS = [
  'item.consumable',
  'item.utility',
  'item.equipment',
  'item.currency',
  'item.progression_token',
  'character.player_avatar',
  'character.companion',
  'character.enemy_melee',
  'character.enemy_caster',
  'ability.active_melee',
  'ability.active_spell',
  'ability.active_heal',
  'location.hub',
  'location.dungeon',
  'market.vendor_basic',
] as const

export const BASELINE_ARCHETYPES = BASELINE_ARCHETYPE_PRESET_IDS
  .map((presetId) => {
    const preset = archetypePresetMap.get(presetId)
    if (!preset) return null
    return {
      key: preset.archetype.key,
      name: preset.archetype.name,
      summary: preset.archetype.summary,
      appliesToKind: preset.archetype.appliesToKind,
      iconAssetKey: preset.archetype.iconAssetKey,
      metadata: {
        ...preset.archetype.metadata,
        sourcePresetId: presetId,
      },
      llmHints: {
        ...preset.archetype.llmHints,
        sourcePresetId: presetId,
      },
      fields: preset.archetype.fields,
    }
  })
  .filter((seed): seed is NonNullable<typeof seed> => seed !== null)

export function hasMissingBaselineArchetypes(archetypes: Array<{ key: string }>) {
  const presentKeys = new Set(archetypes.map((archetype) => archetype.key))
  return BASELINE_ARCHETYPES.some((seed) => !presentKeys.has(seed.key))
}
