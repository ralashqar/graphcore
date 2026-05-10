import type { EntityIconId } from '../../../shared/entityIcons'
import type { WorldWikiSection } from '../../../domain/worldWiki'

export function iconForWikiSection(kind: WorldWikiSection['kind']): EntityIconId {
  switch (kind) {
    case 'overview':
      return 'graph'
    case 'style':
      return 'design'
    case 'app':
    case 'app_product':
      return 'app'
    case 'app_people':
      return 'character'
    case 'app_features':
      return 'archetype'
    case 'app_flows':
      return 'thread'
    case 'app_screens':
      return 'screen'
    case 'app_components':
      return 'component'
    case 'app_data':
      return 'database'
    case 'app_backend':
      return 'api'
    case 'app_capabilities':
      return 'capability'
    case 'app_design':
      return 'design'
    case 'app_code':
    case 'app_towers':
      return 'tower'
    case 'app_code_files':
      return 'code'
    case 'game_world':
      return 'environment'
    case 'game_inventory':
      return 'item'
    case 'game_economy':
      return 'credits'
    case 'game_travel':
      return 'environment'
    case 'game_quests':
    case 'game_narrative':
    case 'game_dialogue':
      return 'thread'
    case 'game_progression':
    case 'game_rules':
      return 'activity'
    case 'cast':
      return 'character'
    case 'threads':
      return 'thread'
    case 'timeline':
      return 'event'
    case 'places':
      return 'environment'
    case 'factions':
      return 'group'
    case 'lore':
      return 'concept'
    case 'items':
      return 'item'
    case 'outputs':
      return 'cinematic'
    default:
      return 'content'
  }
}

export function labelForWikiSection(kind: WorldWikiSection['kind']) {
  switch (kind) {
    case 'style':
      return 'Visual System'
    case 'app_product':
      return 'App Product'
    case 'app_people':
      return 'Personas & Goals'
    case 'app_features':
      return 'Features'
    case 'app_flows':
      return 'User Flows'
    case 'app_screens':
      return 'Screens'
    case 'app_components':
      return 'Components'
    case 'app_data':
      return 'Data & Actions'
    case 'app_backend':
      return 'Backend & APIs'
    case 'app_capabilities':
      return 'Capabilities'
    case 'app_design':
      return 'Design System'
    case 'app_code':
    case 'app_towers':
      return 'Code Towers'
    case 'app_code_files':
      return 'Code Files'
    case 'game_world':
      return 'Game World'
    case 'game_inventory':
      return 'Inventory & Items'
    case 'game_economy':
      return 'Economy & Markets'
    case 'game_travel':
      return 'Travel'
    case 'game_quests':
      return 'Quests'
    case 'game_narrative':
      return 'Narrative Arcs'
    case 'game_dialogue':
      return 'Dialogue Choices'
    case 'game_progression':
      return 'Progression Tokens & Rules'
    case 'game_rules':
      return 'Rules / Validation'
    default:
      return kind.replace(/_/g, ' ')
  }
}
