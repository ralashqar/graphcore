import { z } from 'zod'

import {
  PROJECT_TYPE_OPTIONS,
  getProjectSubtypeOption,
  isBrandProjectSubtype,
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
  unitKind: z.enum(['chapter', 'episode', 'short_beat', 'mission', 'quest', 'campaign_moment', 'ugc_beat']),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  requiredRelationships: z.array(z.enum(['precedes', 'causes', 'complicates', 'pays_off'])).default(['precedes']),
  requiredFields: z.array(z.string()).default(['ordinal', 'synopsis', 'outcome', 'consequences']),
  purpose: z.string().min(1),
})

export const worldSeedSkeletonProfileSchema = z.object({
  id: z.string().min(1),
  projectType: z.enum(['story', 'game', 'brand', 'ugc']),
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

const gameCategories: WorldSeedSkeletonCategory[] = [
  { id: 'regions_locations', label: 'Regions and playable locations', nodeType: 'place', min: 4, max: 7, purpose: 'Create hubs, landmarks, regions, arenas, biomes, or traversal spaces that support play.', required: true },
  { id: 'factions_communities', label: 'Factions and communities', nodeType: 'group', min: 2, max: 5, purpose: 'Create groups that produce conflict, quests, economy, social pressure, or territorial identity.', required: true },
  { id: 'characters_npcs', label: 'Important characters and NPCs', nodeType: 'actor', min: 3, max: 6, purpose: 'Create guides, rivals, leaders, companions, vendors, bosses, or story-critical NPCs.', required: true },
  { id: 'items_resources', label: 'Items, resources, and artifacts', nodeType: 'object', min: 2, max: 5, purpose: 'Create objects that support progression, crafting, combat, discovery, or story pressure.', required: true },
  { id: 'systems_concepts', label: 'Gameplay-supportive concepts', nodeType: 'concept', min: 2, max: 4, purpose: 'Create systems, rules, mysteries, hazards, or resource loops that make the world playable.', required: true },
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

function profileTypeForSubtype(projectSubtype: ProjectSubtype): ProjectType {
  if (isStoryProjectSubtype(projectSubtype)) return 'story'
  if (isGameProjectSubtype(projectSubtype)) return 'game'
  if (isBrandProjectSubtype(projectSubtype)) return 'brand'
  if (isUgcProjectSubtype(projectSubtype)) return 'ugc'
  return 'story'
}

function buildProfile(projectSubtype: ProjectSubtype): WorldSeedSkeletonProfile {
  const projectType = profileTypeForSubtype(projectSubtype)
  const subtypeLabel = getProjectSubtypeOption(projectSubtype)?.label ?? projectSubtype
  if (projectType === 'story') {
    return worldSeedSkeletonProfileSchema.parse({
      id: `story.${projectSubtype}.initial_skeleton`,
      projectType,
      projectSubtype,
      label: `${subtypeLabel} initial story skeleton`,
      wikiMetadataRequired: ['title', 'logline', 'synopsis', 'genre', 'themes', 'toneTags', 'coreConflict', 'visualMotifs'],
      categories: storyCategories,
      sequence: {
        unitKind: projectSubtype === 'tv_streaming_series' ? 'episode' : projectSubtype === 'shortform_series' ? 'short_beat' : 'chapter',
        min: projectSubtype === 'short_film' ? 5 : 7,
        max: projectSubtype === 'short_film' ? 7 : 10,
        requiredRelationships: ['precedes', 'causes', 'complicates', 'pays_off'],
        requiredFields: ['ordinal', 'synopsis', 'dramaticQuestion', 'storyFunction', 'outcome', 'consequences', 'openLoops', 'resolvedLoops'],
        purpose: 'Create the complete main story arc as ordered sequence_unit nodes, not just a first event.',
      },
      relationshipGuidance: [
        'Link cast to their goals, factions, secrets, and pressure relationships.',
        'Link locations, objects, and concepts to the sequence units where they matter.',
        'Use sequence_unit relationships for authored story order and causality.',
      ],
      plannerDirectives: [
        'Create project wiki metadata first, including title and logline.',
        'Create a full main cast and enough locations to support the complete arc.',
        'Create ordered sequence_unit nodes for the whole main arc in one pass.',
      ],
    }) as WorldSeedSkeletonProfile
  }
  if (projectType === 'game') {
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
