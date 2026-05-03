import type { GameProjectSubtype } from './projectContext.ts'

export type GameBlueprint = {
  subtype: GameProjectSubtype
  label: string
  coreLoop: string[]
  requiredNodeTypes: string[]
  recommendedRelationships: string[]
  refinementSlices: string[]
}

const NARRATIVE_RPG_MOBILE_BLUEPRINT: GameBlueprint = {
  subtype: 'narrative_rpg_mobile',
  label: 'Narrative RPG Mobile',
  coreLoop: [
    'review current location and inventory',
    'choose a travel link or location spot',
    'enter a narrative scene',
    'make dialogue choices gated by items, currency, tokens, or state',
    'apply outcomes to inventory, progression tokens, quests, and location access',
    'return to map, market, quest journal, or next scene',
  ],
  requiredNodeTypes: [
    'actor',
    'place',
    'player_profile',
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
    'save_state',
  ],
  recommendedRelationships: [
    'place contains location_spot',
    'travel_link starts_at place or location_spot',
    'travel_link travels_to place or location_spot',
    'marketplace located_in location_spot',
    'marketplace offers trade_offer',
    'trade_offer costs currency',
    'trade_offer trades_for inventory_item',
    'quest contains quest_step',
    'narrative_arc contains narrative_scene',
    'narrative_scene contains dialogue_node',
    'dialogue_node contains choice',
    'choice requires_item or requires_token when gated',
    'choice grants_item, grants_token, sets_state, or branches_to',
  ],
  refinementSlices: [
    'World Content',
    'Inventory',
    'Economy',
    'Travel',
    'Narrative Arcs',
    'Dialogue Choices',
    'Conditions / Outcomes',
    'Playability Validation',
  ],
}

export const GAME_BLUEPRINTS: Partial<Record<GameProjectSubtype, GameBlueprint>> = {
  narrative_rpg_mobile: NARRATIVE_RPG_MOBILE_BLUEPRINT,
}

export function getGameBlueprint(projectSubtype: GameProjectSubtype) {
  return GAME_BLUEPRINTS[projectSubtype] ?? null
}
