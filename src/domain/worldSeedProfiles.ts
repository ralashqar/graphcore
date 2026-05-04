import { z } from 'zod'

import {
  PROJECT_TYPE_OPTIONS,
  getProjectSubtypeOption,
  isBrandProjectSubtype,
  isAppProjectSubtype,
  isGameProjectSubtype,
  isStoryProjectSubtype,
  isUgcProjectSubtype,
} from './projectContextProfiles.ts'
import type { ProjectSubtype, ProjectType } from './projectContext.ts'
import { worldEntityNodeTypeSchema } from './worldGraph.ts'

export const worldSeedSkeletonCategorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeType: worldEntityNodeTypeSchema,
  min: z.number().int().nonnegative(),
  max: z.number().int().positive(),
  purpose: z.string().min(1),
  required: z.boolean().default(true),
})

export const worldSeedSkeletonSequenceSchema = z.object({
  unitKind: z.enum(['chapter', 'episode', 'short_beat', 'mission', 'quest', 'campaign_moment', 'ugc_beat', 'user_flow']),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  requiredRelationships: z.array(z.enum(['precedes', 'causes', 'complicates', 'pays_off'])).default(['precedes']),
  requiredFields: z.array(z.string()).default(['ordinal', 'synopsis', 'outcome', 'consequences']),
  purpose: z.string().min(1),
})

export const worldSeedSkeletonProfileSchema = z.object({
  id: z.string().min(1),
  projectType: z.enum(['story', 'game', 'brand', 'ugc', 'app']),
  projectSubtype: z.string().min(1),
  label: z.string().min(1),
  wikiMetadataRequired: z.array(z.string()).default(['title', 'logline', 'synopsis', 'toneTags', 'genre']),
  categories: z.array(worldSeedSkeletonCategorySchema).min(1),
  sequence: worldSeedSkeletonSequenceSchema,
  relationshipGuidance: z.array(z.string()).min(1),
  plannerDirectives: z.array(z.string()).min(1),
})

export type WorldSeedSkeletonCategory = z.infer<typeof worldSeedSkeletonCategorySchema>
export type WorldSeedSkeletonProfile = z.infer<typeof worldSeedSkeletonProfileSchema> & {
  projectSubtype: ProjectSubtype
}

const storyCategories: WorldSeedSkeletonCategory[] = [
  { id: 'main_cast', label: 'Full main cast', nodeType: 'actor', min: 5, max: 8, purpose: 'Create the protagonist, antagonist or opposition force, major allies, and pressure characters.', required: true },
  { id: 'main_locations', label: 'Main locations', nodeType: 'place', min: 3, max: 5, purpose: 'Create the story spaces where conflict, secrets, and turning points can happen.', required: true },
  { id: 'factions_groups', label: 'Major factions or groups', nodeType: 'group', min: 1, max: 4, purpose: 'Create organized forces when the premise implies politics, institutions, families, crews, or communities.', required: false },
  { id: 'objects_concepts', label: 'Key objects or concepts', nodeType: 'object', min: 1, max: 4, purpose: 'Create artifacts, symbols, MacGuffins, technologies, or lore concepts that make the story world distinct.', required: false },
]

const nonfictionEbookCategories: WorldSeedSkeletonCategory[] = [
  { id: 'core_framework', label: 'Core framework', nodeType: 'concept', min: 4, max: 8, purpose: 'Create the book thesis, method, principles, mental models, and named framework concepts.', required: true },
  { id: 'audience_problems', label: 'Audience problems', nodeType: 'concept', min: 3, max: 6, purpose: 'Create reader pains, desired outcomes, objections, and transformation milestones.', required: true },
  { id: 'proof_examples', label: 'Proof and examples', nodeType: 'object', min: 3, max: 7, purpose: 'Create case studies, exercises, checklists, diagrams, examples, or proof assets that support the chapters.', required: true },
  { id: 'voices_sources', label: 'Voices or source actors', nodeType: 'actor', min: 1, max: 4, purpose: 'Create author, reader archetypes, expert voices, or scenario characters when the ebook benefits from examples.', required: false },
]

const gameCategories: WorldSeedSkeletonCategory[] = [
  { id: 'regions_locations', label: 'Regions and playable locations', nodeType: 'place', min: 4, max: 7, purpose: 'Create hubs, landmarks, regions, arenas, biomes, or traversal spaces that support play.', required: true },
  { id: 'factions_communities', label: 'Factions and communities', nodeType: 'group', min: 2, max: 5, purpose: 'Create groups that produce conflict, quests, economy, social pressure, or territorial identity.', required: true },
  { id: 'characters_npcs', label: 'Important characters and NPCs', nodeType: 'actor', min: 3, max: 6, purpose: 'Create guides, rivals, leaders, companions, vendors, bosses, or story-critical NPCs.', required: true },
  { id: 'items_resources', label: 'Items, resources, and artifacts', nodeType: 'object', min: 2, max: 5, purpose: 'Create objects that support progression, crafting, combat, discovery, or story pressure.', required: true },
  { id: 'systems_concepts', label: 'Gameplay-supportive concepts', nodeType: 'concept', min: 2, max: 4, purpose: 'Create systems, rules, mysteries, hazards, or resource loops that make the world playable.', required: true },
]

const narrativeRpgMobileCategories: WorldSeedSkeletonCategory[] = [
  { id: 'characters_npcs', label: 'Characters and NPCs', nodeType: 'actor', min: 4, max: 8, purpose: 'Create speaking characters, vendors, quest givers, rivals, and recurring narrative pressure figures.', required: true },
  { id: 'locations_spots', label: 'Locations and spots', nodeType: 'location_spot', min: 6, max: 12, purpose: 'Create actionable places inside major locations, such as inn, market, shrine, route gate, hidden room, or faction spot.', required: true },
  { id: 'inventory_progression', label: 'Inventory, currencies, and shadow tokens', nodeType: 'inventory_item', min: 6, max: 12, purpose: 'Create player inventory items, currencies, and hidden progression tokens used by gates and outcomes.', required: true },
  { id: 'economy_markets', label: 'Marketplaces and trade offers', nodeType: 'marketplace', min: 2, max: 5, purpose: 'Create marketplaces plus barter or currency trade offers that exchange concrete items, currency, or access.', required: true },
  { id: 'travel_links', label: 'Travel links', nodeType: 'travel_link', min: 4, max: 10, purpose: 'Create directed travel routes between locations and spots, including any item, token, or currency requirements.', required: true },
  { id: 'narrative_dialogue', label: 'Narrative scenes and dialogue choices', nodeType: 'narrative_scene', min: 6, max: 12, purpose: 'Create branching narrative scenes, dialogue nodes, choices, conditions, and outcomes that can be compiled into a playable flow.', required: true },
  { id: 'rules_state', label: 'Rules, stats, and save state', nodeType: 'game_rule', min: 3, max: 7, purpose: 'Create initial player profile, player_initial_config, player_stat nodes, starter inventory, save-state contract, state variables, and validation rules for playability.', required: true },
]

const brandCategories: WorldSeedSkeletonCategory[] = [
  { id: 'message_pillars', label: 'Message pillars', nodeType: 'concept', min: 3, max: 5, purpose: 'Create the campaign, product, education, or mascot message pillars as graph concepts.', required: true },
  { id: 'audience_use_cases', label: 'Audience and use-case concepts', nodeType: 'concept', min: 2, max: 4, purpose: 'Create the audience tensions, jobs-to-be-done, use cases, and proof contexts.', required: true },
  { id: 'signature_assets', label: 'Signature objects and assets', nodeType: 'object', min: 2, max: 5, purpose: 'Create recognizable visual assets, product objects, symbolic props, or mascot companions.', required: true },
  { id: 'actors_mascots', label: 'Mascots or scenario actors', nodeType: 'actor', min: 1, max: 4, purpose: 'Create mascots, customer proxies, explainers, or scenario characters when useful.', required: false },
]

const ugcCategories: WorldSeedSkeletonCategory[] = [
  { id: 'persona_scenario_actors', label: 'Creator, persona, or scenario actors', nodeType: 'actor', min: 2, max: 5, purpose: 'Create creator personas, customer proxies, skeptics, helpers, or social-drama actors.', required: true },
  { id: 'product_objects', label: 'Product, object, or proof assets', nodeType: 'object', min: 1, max: 4, purpose: 'Create the product, object, visual proof, workflow artifact, or repeated demonstration asset.', required: true },
  { id: 'proof_concepts', label: 'Hook and proof concepts', nodeType: 'concept', min: 3, max: 6, purpose: 'Create hook ideas, proof mechanisms, objections, payoffs, or repeatable framing devices.', required: true },
  { id: 'threads_formats', label: 'Repeatable content threads', nodeType: 'concept', min: 2, max: 4, purpose: 'Create repeatable social-native thread ideas and content engines.', required: true },
]

const appCategories: WorldSeedSkeletonCategory[] = [
  { id: 'app_identity', label: 'App identity and promise', nodeType: 'app', min: 1, max: 1, purpose: 'Create the top-level app product node with promise, category, platform targets, core loop, monetization, and visual direction.', required: true },
  { id: 'personas_goals', label: 'Personas and business goals', nodeType: 'persona', min: 2, max: 4, purpose: 'Create target personas, their pains, motivations, objections, and likely conversion triggers.', required: true },
  { id: 'features', label: 'Commercial feature set', nodeType: 'feature', min: 5, max: 9, purpose: 'Create the app features that support activation, retention, generation, sharing, and monetization.', required: true },
  { id: 'screens_components', label: 'Screens and components', nodeType: 'screen', min: 7, max: 12, purpose: 'Create route-ready screens with contained sections/components, states, actions, and data dependencies.', required: true },
  { id: 'data_actions_apis', label: 'Data, actions, and APIs', nodeType: 'data_model', min: 4, max: 8, purpose: 'Create app data models, user/system actions, API endpoint contracts, backend functions, and external services.', required: true },
  { id: 'capabilities_design', label: 'Capabilities and design system', nodeType: 'capability', min: 4, max: 8, purpose: 'Create native capability constraints and design-system direction for the design prototype. Do not create implementation towers or code files in the initial design graph.', required: true },
]

function profileTypeForSubtype(projectSubtype: ProjectSubtype): ProjectType {
  if (isStoryProjectSubtype(projectSubtype)) return 'story'
  if (isGameProjectSubtype(projectSubtype)) return 'game'
  if (isBrandProjectSubtype(projectSubtype)) return 'brand'
  if (isUgcProjectSubtype(projectSubtype)) return 'ugc'
  if (isAppProjectSubtype(projectSubtype)) return 'app'
  return 'story'
}

function buildProfile(projectSubtype: ProjectSubtype): WorldSeedSkeletonProfile {
  const projectType = profileTypeForSubtype(projectSubtype)
  const subtypeLabel = getProjectSubtypeOption(projectSubtype)?.label ?? projectSubtype
  if (projectType === 'story') {
    if (projectSubtype === 'nonfiction_ebook') {
      return worldSeedSkeletonProfileSchema.parse({
        id: 'story.nonfiction_ebook.initial_skeleton',
        projectType,
        projectSubtype,
        label: `${subtypeLabel} initial ebook skeleton`,
        wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
        categories: nonfictionEbookCategories,
        sequence: {
          unitKind: 'chapter',
          min: 6,
          max: 10,
          requiredRelationships: ['precedes', 'causes', 'pays_off'],
          requiredFields: ['ordinal', 'synopsis', 'dramaticQuestion', 'storyFunction', 'outcome', 'consequences', 'openLoops', 'resolvedLoops'],
          purpose: 'Create an ebook table of contents as ordered sequence_unit chapter nodes, each with a reader promise, proof, example, and takeaway.',
        },
        relationshipGuidance: [
          'Link each chapter sequence_unit to the concepts, proof assets, examples, exercises, and reader objections it uses.',
          'Use relationships to show prerequisite ideas, build order, and payoff across the table of contents.',
          'Keep canon structured for later ebook generation, not only wiki browsing.',
        ],
        plannerDirectives: [
          'Create project wiki metadata first, including the working title, reader promise, thesis, and target audience.',
          'Create the framework concepts, reader problems, proof assets, examples, and exercises needed for a useful ebook.',
          'Create ordered sequence_unit chapter nodes for the full ebook from introduction through conclusion.',
        ],
      }) as WorldSeedSkeletonProfile
    }
    return worldSeedSkeletonProfileSchema.parse({
      id: `story.${projectSubtype}.initial_skeleton`,
      projectType,
      projectSubtype,
      label: `${subtypeLabel} initial ${projectSubtype === 'fiction_novel' ? 'novel' : 'story'} skeleton`,
      wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'narrationPov', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
      categories: storyCategories,
      sequence: {
        unitKind: projectSubtype === 'tv_streaming_series' ? 'episode' : projectSubtype === 'shortform_series' ? 'short_beat' : 'chapter',
        min: projectSubtype === 'short_film' ? 5 : projectSubtype === 'fiction_novel' ? 10 : 7,
        max: projectSubtype === 'short_film' ? 7 : projectSubtype === 'fiction_novel' ? 16 : 10,
        requiredRelationships: ['precedes', 'causes', 'complicates', 'pays_off'],
        requiredFields: ['ordinal', 'povCharacterKey', 'synopsis', 'dramaticQuestion', 'storyFunction', 'outcome', 'consequences', 'openLoops', 'resolvedLoops'],
        purpose: projectSubtype === 'fiction_novel'
          ? 'Create a manuscript-facing chapter spine as ordered sequence_unit nodes, including the focal POV character for each chapter, not just plot events.'
          : 'Create the complete main story arc as ordered sequence_unit nodes, not just a first event.',
      },
      relationshipGuidance: [
        'Link cast to their goals, factions, secrets, and pressure relationships.',
        'Link locations, objects, and concepts to the sequence units where they matter.',
        'Use sequence_unit relationships for authored story order and causality.',
      ],
      plannerDirectives: [
        projectSubtype === 'fiction_novel'
          ? 'Create project wiki metadata first, including title, logline, and the default narrationPov such as first person, third limited, close third, or rotating limited.'
          : 'Create project wiki metadata first, including title and logline.',
        'Create a full main cast and enough locations to support the complete arc.',
        projectSubtype === 'fiction_novel'
          ? 'Create ordered sequence_unit chapter nodes suitable for downstream prose generation in one pass.'
          : 'Create ordered sequence_unit nodes for the whole main arc in one pass.',
      ],
    }) as WorldSeedSkeletonProfile
  }
  if (projectType === 'game') {
    if (projectSubtype === 'narrative_rpg_mobile') {
      return worldSeedSkeletonProfileSchema.parse({
        id: 'game.narrative_rpg_mobile.initial_skeleton',
        projectType,
        projectSubtype,
        label: `${subtypeLabel} initial playable game graph`,
        wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
        categories: narrativeRpgMobileCategories,
        sequence: {
          unitKind: 'quest',
          min: 4,
          max: 7,
          requiredRelationships: ['precedes', 'causes', 'complicates', 'pays_off'],
          requiredFields: ['ordinal', 'synopsis', 'outcome', 'consequences'],
          purpose: 'Create high-level quest progression only; executable branching must use quest, quest_step, narrative_scene, dialogue_node, choice, choice_condition, and choice_outcome nodes.',
        },
        relationshipGuidance: [
          'Link major places to location_spot nodes, then link travel_link nodes with starts_at and travels_to relationships.',
          'Link marketplaces to trade_offer nodes, and link trade offers to inventory_item or currency nodes with costs, trades_for, and grants_item relationships.',
          'Link narrative_scene nodes to dialogue_node nodes, dialogue_node nodes to choice nodes, and choices to conditions, outcomes, and branch targets.',
          'Use shadow_token nodes for hidden progression. Every required token should be granted somewhere else or included in initial state.',
          'Store executable game fields under customProperties.interactive or customProperties.game, including initialItemKeys, currency, stats, condition, outcome, offer, state, route, start scene/dialogue, and validation notes.',
        ],
        plannerDirectives: [
          'State the player fantasy, mobile interaction loop, and playable premise in wiki metadata.',
          'Create a graph that can compile into a static playable prototype: player_initial_config, player_stat nodes, map/travel, inventory, market, dialogue choices, conditions, outcomes, and save state.',
          'Do not treat branching dialogue as story-only lore. Every choice should have a condition or outcome when relevant, and every outcome should mutate inventory, currency, tokens, state, quest progress, travel access, or branch target.',
        ],
      }) as WorldSeedSkeletonProfile
    }
    return worldSeedSkeletonProfileSchema.parse({
      id: `game.${projectSubtype}.initial_skeleton`,
      projectType,
      projectSubtype,
      label: `${subtypeLabel} initial game skeleton`,
      wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
      categories: gameCategories,
      sequence: {
        unitKind: projectSubtype === 'narrative_adventure' ? 'quest' : 'mission',
        min: 6,
        max: 9,
        requiredRelationships: ['precedes', 'causes', 'complicates', 'pays_off'],
        purpose: 'Create mission, quest, or progression sequence units that show how the player fantasy unfolds.',
      },
      relationshipGuidance: [
        'Link locations to factions, NPCs, resources, hazards, and progression beats.',
        'Link player-facing systems to concrete objects, communities, and missions.',
        'Use sequence_unit nodes for playable progression, not hidden backstory only.',
      ],
      plannerDirectives: [
        'State the player fantasy and core premise in wiki metadata.',
        'Create regions, factions, NPCs, items, and systems that support play.',
        'Create progression beats as sequence_unit nodes.',
      ],
    }) as WorldSeedSkeletonProfile
  }
  if (projectType === 'brand') {
    return worldSeedSkeletonProfileSchema.parse({
      id: `brand.${projectSubtype}.initial_skeleton`,
      projectType,
      projectSubtype,
      label: `${subtypeLabel} initial brand skeleton`,
      wikiMetadataRequired: ['title', 'logline', 'synopsis', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
      categories: brandCategories,
      sequence: {
        unitKind: 'campaign_moment',
        min: 5,
        max: 8,
        requiredRelationships: ['precedes', 'causes', 'pays_off'],
        purpose: 'Create campaign moments that move from attention, to meaning, to proof, to participation.',
      },
      relationshipGuidance: [
        'Link message pillars to proof assets, audiences, and campaign moments.',
        'Link signature objects or mascots to the ideas they make memorable.',
        'Use sequence_unit nodes for campaign moments rather than generic tasks.',
      ],
      plannerDirectives: [
        'State the campaign, product, education, or mascot premise in wiki metadata.',
        'Create message pillars, audience concepts, signature assets, and campaign moments.',
        'Keep canon useful for later visual and content production.',
      ],
    }) as WorldSeedSkeletonProfile
  }
  if (projectType === 'app') {
    const flowPurposeBySubtype: Record<string, string> = {
      ai_utility_wrapper: 'Create user_flow nodes for hook/problem, input or upload, AI processing, result, refinement, paywall/export, and history.',
      mascot_daily_ritual: 'Create user_flow nodes for onboarding, personalization, daily home, daily input, magic processing, reveal, share, paywall, and timeline.',
      content_generator: 'Create user_flow nodes for output choice, prompt/upload references, style selection, generation, result preview, editing, export/share, paywall, and project history.',
    }
    return worldSeedSkeletonProfileSchema.parse({
      id: `app.${projectSubtype}.initial_skeleton`,
      projectType,
      projectSubtype,
      label: `${subtypeLabel} initial app graph`,
      wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'themes', 'toneTags', 'visualMotifs'],
      categories: appCategories,
      sequence: {
        unitKind: 'user_flow',
        min: projectSubtype === 'mascot_daily_ritual' ? 5 : 4,
        max: projectSubtype === 'mascot_daily_ritual' ? 8 : 6,
        requiredRelationships: ['precedes', 'causes', 'pays_off'],
        requiredFields: ['ordinal', 'synopsis', 'outcome', 'consequences'],
        purpose: flowPurposeBySubtype[projectSubtype] ?? 'Create ordered user_flow nodes that describe the main product journeys.',
      },
      relationshipGuidance: [
        'Link the app node to personas, business goals, features, flows, screens, data, APIs, capabilities, and the design system.',
        'Link screens to sections/components, actions, data models, API endpoints, capabilities, and transitions.',
        'Use user_flow nodes for UX sequence and product journeys. Do not use story sequence_unit nodes for app flows.',
        'Do not create tower or code_file nodes during initial app generation; implementation planning happens after the visual prototype is approved.',
      ],
      plannerDirectives: [
        'State the product name, promise, target users, core loop, monetization, retention loop, viral loop, and platform targets in app graph metadata.',
        'Create route-ready screens, reusable components, data/action/API contracts, native capability constraints, and design-system direction for a static visual prototype.',
        'Store app-specific fields under customProperties.app and keep visualDescription focused on visible mobile UI or product imagery.',
      ],
    }) as WorldSeedSkeletonProfile
  }
  return worldSeedSkeletonProfileSchema.parse({
    id: `ugc.${projectSubtype}.initial_skeleton`,
    projectType,
    projectSubtype,
    label: `${subtypeLabel} initial UGC skeleton`,
    wikiMetadataRequired: ['title', 'logline', 'synopsis', 'themes', 'toneTags', 'visualMotifs'],
    categories: ugcCategories,
    sequence: {
      unitKind: 'ugc_beat',
      min: 5,
      max: 8,
      requiredRelationships: ['precedes', 'causes', 'pays_off'],
      purpose: 'Create hook, proof, objection, payoff, and repeatable follow-up beats as sequence units.',
    },
    relationshipGuidance: [
      'Link hooks to proof concepts, product objects, persona actors, and payoff beats.',
      'Link repeatable content threads to the actors and objects that can recur.',
      'Use sequence_unit nodes with unitKind ugc_beat for the content flow.',
    ],
    plannerDirectives: [
      'State the UGC format premise in wiki metadata.',
      'Create persona/scenario actors, product/proof objects, hook concepts, and repeatable content threads.',
      'Create hook/proof/payoff beats as ugc_beat sequence units.',
    ],
  }) as WorldSeedSkeletonProfile
}

export const WORLD_SEED_SKELETON_PROFILES: Record<ProjectSubtype, WorldSeedSkeletonProfile> = Object.fromEntries(
  PROJECT_TYPE_OPTIONS.flatMap((typeOption) => typeOption.subtypes.map((subtype) => [
    subtype.id,
    buildProfile(subtype.id),
  ])),
) as Record<ProjectSubtype, WorldSeedSkeletonProfile>

export function getWorldSeedSkeletonProfile(projectSubtype: ProjectSubtype): WorldSeedSkeletonProfile {
  return WORLD_SEED_SKELETON_PROFILES[projectSubtype]
}

export function getAllWorldSeedSkeletonProfiles() {
  return Object.values(WORLD_SEED_SKELETON_PROFILES)
}
