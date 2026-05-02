import type { ArtStylePresetId } from './artStylePresets.ts'
import type { CinematicPresetFamily, CinematicFormatSubtype } from './cinematics.ts'
import type { ProjectBrainProfile, ProjectContext, ProjectSubtype, ProjectType } from './projectContext.ts'
import { PROJECT_ONBOARDING_VERSION, type AppProjectSubtype, type BrandProjectSubtype, type GameProjectSubtype, type StoryProjectSubtype, type UgcProjectSubtype } from './projectContext.ts'

export type ProjectSubtypeOption = {
  id: ProjectSubtype
  label: string
  description: string
}

export type ProjectTypeOption = {
  id: ProjectType
  label: string
  description: string
  helper: string
  subtypes: readonly ProjectSubtypeOption[]
}

export const PROJECT_TYPE_OPTIONS: readonly ProjectTypeOption[] = [
  {
    id: 'story',
    label: 'Story',
    description: 'Narrative worlds for films, series, shorts, and other authored story formats.',
    helper: 'Best for conflict webs, cast dynamics, lore, places, and dramatic escalation.',
    subtypes: [
      { id: 'feature_film', label: 'Feature Film', description: 'A cinematic long-form story world with strong central stakes.' },
      { id: 'tv_streaming_series', label: 'TV / Streaming Series', description: 'A repeatable world with layered factions, arcs, and episode engines.' },
      { id: 'short_film', label: 'Short Film', description: 'A tighter world centered on one emotional turn or reveal.' },
      { id: 'shortform_series', label: 'Shortform Series', description: 'A repeatable world built for compact serialized beats.' },
      { id: 'animated_story', label: 'Animated Story', description: 'A stylized story world with strong visual language and cast silhouettes.' },
    ],
  },
  {
    id: 'game',
    label: 'Video Game',
    description: 'Playable worlds with factions, regions, items, hooks, progression, and spatial logic.',
    helper: 'Best for gameplay-supportive worldbuilding, quest hooks, regions, items, and progression landmarks.',
    subtypes: [
      { id: 'action_rpg', label: 'Action / RPG', description: 'Combat, factions, progression paths, items, and strong character/world scaffolding.' },
      { id: 'narrative_adventure', label: 'Narrative / Adventure', description: 'Places, mysteries, cast, scenes, and authored progression.' },
      { id: 'strategy_builder', label: 'Strategy / Builder', description: 'Regions, settlements, factions, systems, and macro stakes.' },
      { id: 'survival_craft', label: 'Survival / Craft', description: 'Scarcity, landmarks, hazards, resource loops, and emergent place identity.' },
      { id: 'shooter_combat', label: 'Shooter / Combat', description: 'Combat spaces, factions, threat escalation, and mission-ready hooks.' },
      { id: 'social_sim', label: 'Social / Sim', description: 'Communities, routines, character clusters, hubs, and world texture.' },
      { id: 'open_world_sandbox', label: 'Open World / Sandbox', description: 'Explorable regions, landmarks, roaming factions, and discovery-driven systems.' },
      { id: 'platformer_metroidvania', label: 'Platformer / Metroidvania', description: 'Traversal, gated routes, layered maps, and ability-led progression.' },
      { id: 'horror_mystery', label: 'Horror / Mystery', description: 'Dread, hidden truths, investigation trails, and atmosphere-first spaces.' },
    ],
  },
  {
    id: 'brand',
    label: 'Brand',
    description: 'Worldbuilding for campaigns, mascots, symbolic systems, and branded narrative ecosystems.',
    helper: 'Best for brand values, signature assets, mascots, symbolic worlds, and campaign moments.',
    subtypes: [
      { id: 'campaign_world', label: 'Campaign World', description: 'A campaign-ready universe with repeatable themes, symbols, and scene logic.' },
      { id: 'product_storytelling', label: 'Product Storytelling', description: 'A product-centered world with use cases, proof moments, and a clear message spine.' },
      { id: 'mascot_ip', label: 'Mascot / IP', description: 'A mascot-led identity world with memorable personality and symbolic companions.' },
      { id: 'brand_education_explainer', label: 'Brand Education / Explainer', description: 'A systemized world for clear teaching, framing, and structured proof.' },
    ],
  },
  {
    id: 'ugc',
    label: 'UGC',
    description: 'Social-native worlds for creator formats, hooks, proof beats, explainers, and ad-native storytelling.',
    helper: 'Best for creator personas, format hooks, proof beats, soft CTA flows, and serialized social scenarios.',
    subtypes: [
      { id: 'creator_organic', label: 'Creator Organic', description: 'Natural creator-native ideas, testimonials, and casual world framing.' },
      { id: 'direct_response_ad', label: 'Direct Response Ad', description: 'Clear hook, proof, payoff, and product-world alignment.' },
      { id: 'faceless_explainer_demo', label: 'Faceless Explainer / Demo', description: 'Object, scenario, and workflow-first worlds with clean proof structure.' },
      { id: 'serialized_social_drama', label: 'Serialized Social Drama', description: 'Episodic conflict, open loops, and repeatable scenario beats.' },
    ],
  },
  {
    id: 'app',
    label: 'App',
    description: 'Product and UX graphs for mobile apps, AI utilities, rituals, and creator tools.',
    helper: 'Best for personas, features, flows, screens, components, data, APIs, capabilities, and code towers.',
    subtypes: [
      { id: 'ai_utility_wrapper', label: 'AI Utility Wrapper', description: 'A focused AI-powered tool with input, processing, result, refinement, and monetization flow.' },
      { id: 'mascot_daily_ritual', label: 'Mascot / Daily Ritual', description: 'A companion, egg, avatar, or daily check-in app with repeatable reveal and collection loops.' },
      { id: 'content_generator', label: 'Content Generator', description: 'A creator tool that turns prompts, uploads, or references into editable and exportable outputs.' },
    ],
  },
]

const subtypeOptionMap = new Map(
  PROJECT_TYPE_OPTIONS.flatMap((entry) => entry.subtypes.map((subtype) => [subtype.id, subtype] as const)),
)

const projectTypeMap = new Map(PROJECT_TYPE_OPTIONS.map((entry) => [entry.id, entry] as const))

const gameSubtypeToArchetypeId: Record<GameProjectSubtype, string> = {
  action_rpg: 'action_rpg',
  narrative_adventure: 'narrative_adventure',
  strategy_builder: 'city_builder',
  survival_craft: 'survival_craft',
  shooter_combat: 'shooter',
  social_sim: 'life_sim',
  open_world_sandbox: 'immersive_sim',
  platformer_metroidvania: 'metroidvania',
  horror_mystery: 'detective_mystery',
}

const ugcSubtypeToPresetFamily: Record<UgcProjectSubtype, CinematicPresetFamily> = {
  creator_organic: 'ugc_creator',
  direct_response_ad: 'ugc_direct_response_ad',
  faceless_explainer_demo: 'ugc_faceless_format',
  serialized_social_drama: 'ugc_faceless_format',
}

const ugcSubtypeToFormatSubtype: Record<UgcProjectSubtype, CinematicFormatSubtype> = {
  creator_organic: 'creator_validation',
  direct_response_ad: 'ad_problem_solution',
  faceless_explainer_demo: 'faceless_explainer',
  serialized_social_drama: 'faceless_serialized_drama',
}

const subtypeToBrainProfile: Record<ProjectSubtype, ProjectBrainProfile> = {
  feature_film: 'story',
  tv_streaming_series: 'story',
  short_film: 'story',
  shortform_series: 'story',
  animated_story: 'story',
  action_rpg: 'game',
  narrative_adventure: 'game',
  strategy_builder: 'game',
  survival_craft: 'game',
  shooter_combat: 'game',
  social_sim: 'game',
  open_world_sandbox: 'game',
  platformer_metroidvania: 'game',
  horror_mystery: 'game',
  campaign_world: 'brand',
  product_storytelling: 'brand',
  mascot_ip: 'brand',
  brand_education_explainer: 'brand',
  creator_organic: 'ugc',
  direct_response_ad: 'ugc',
  faceless_explainer_demo: 'ugc',
  serialized_social_drama: 'ugc',
  ai_utility_wrapper: 'app',
  mascot_daily_ritual: 'app',
  content_generator: 'app',
}

const brainProfileSummary: Record<ProjectBrainProfile, string> = {
  story: 'Generation will bias toward cast, factions, places, lore, conflict webs, prophecies, and inciting events.',
  game: 'Generation will bias toward regions, factions, quest hooks, progression landmarks, world objects, and gameplay-supportive structure.',
  brand: 'Generation will bias toward symbolic systems, signature assets, brand values, campaign moments, and mascot-ready world language.',
  ugc: 'Generation will bias toward hooks, scenarios, proof beats, creator personas, use-case objects, and social-native episodic ideas.',
  app: 'Generation will bias toward product promise, personas, UX flows, screens, components, data contracts, capabilities, and implementation towers.',
}

const fallbackArtStylesByType: Record<ProjectType, ArtStylePresetId> = {
  story: 'live_action_cinematic',
  game: 'premium_stylized_3d',
  brand: 'product_advertising',
  ugc: 'ugc_phone_rear_28_home_demo',
  app: 'premium_mobile_utility',
}

export function getProjectTypeOption(projectType: ProjectType) {
  return projectTypeMap.get(projectType) ?? PROJECT_TYPE_OPTIONS[0]
}

export function getProjectSubtypeOption(projectSubtype: ProjectSubtype) {
  return subtypeOptionMap.get(projectSubtype) ?? null
}

export function getProjectSubtypeOptions(projectType: ProjectType) {
  return getProjectTypeOption(projectType).subtypes
}

export function resolveBrainProfile(projectSubtype: ProjectSubtype): ProjectBrainProfile {
  return subtypeToBrainProfile[projectSubtype]
}

export function getBrainProfileSummary(projectSubtype: ProjectSubtype) {
  return brainProfileSummary[resolveBrainProfile(projectSubtype)]
}

export function getFallbackArtStyleForProjectType(projectType: ProjectType): ArtStylePresetId {
  return fallbackArtStylesByType[projectType]
}

export function getGameArchetypeIdForProjectSubtype(projectSubtype: ProjectSubtype) {
  return projectSubtype in gameSubtypeToArchetypeId
    ? gameSubtypeToArchetypeId[projectSubtype as GameProjectSubtype]
    : null
}

export function getCinematicPresetFamilyForProjectSubtype(projectSubtype: ProjectSubtype) {
  return projectSubtype in ugcSubtypeToPresetFamily
    ? ugcSubtypeToPresetFamily[projectSubtype as UgcProjectSubtype]
    : projectSubtype in gameSubtypeToArchetypeId || projectSubtype in subtypeToBrainProfile && resolveBrainProfile(projectSubtype) === 'story'
      ? 'story_movie_tv'
      : null
}

export function getCinematicFormatSubtypeForProjectSubtype(projectSubtype: ProjectSubtype) {
  return projectSubtype in ugcSubtypeToFormatSubtype
    ? ugcSubtypeToFormatSubtype[projectSubtype as UgcProjectSubtype]
    : null
}

export function getProjectTypeLabel(projectType: ProjectType) {
  return getProjectTypeOption(projectType).label
}

export function getProjectSubtypeLabel(projectSubtype: ProjectSubtype) {
  return getProjectSubtypeOption(projectSubtype)?.label ?? projectSubtype
}

export function getProjectOnboardingSummary(input: {
  projectType: ProjectType
  projectSubtype: ProjectSubtype
  artStyleLabel: string
  artStyleDescription?: string | null
}) {
  return {
    title: `${getProjectTypeLabel(input.projectType)} · ${getProjectSubtypeLabel(input.projectSubtype)}`,
    detail: `${input.artStyleLabel}${input.artStyleDescription?.trim() ? ` · ${input.artStyleDescription.trim()}` : ''}`,
    steering: getBrainProfileSummary(input.projectSubtype),
  }
}

export function buildProjectContext(input: {
  projectType: ProjectType
  projectSubtype: ProjectSubtype
  artStylePreset: ArtStylePresetId
  artStyleDescription?: string | null
  source?: ProjectContext['source']
  completed?: boolean
}) {
  return {
    projectType: input.projectType,
    projectSubtype: input.projectSubtype,
    brainProfile: resolveBrainProfile(input.projectSubtype),
    artStylePreset: input.artStylePreset,
    artStyleDescription: input.artStyleDescription?.trim() ?? '',
    onboardingCompletedAt: input.completed ? new Date().toISOString() : null,
    onboardingVersion: PROJECT_ONBOARDING_VERSION,
    source: input.source ?? 'onboarding',
  } satisfies ProjectContext
}

export function getProjectBrainPromptGuidance(projectContext: ProjectContext | null | undefined) {
  if (!projectContext) return ''
  switch (projectContext.brainProfile) {
    case 'story':
      return 'Prioritize characters, factions, places, concepts, and events. Lean toward conflict webs, secrets, stakes, lore, prophecy, and plot pressure.'
    case 'game':
      return 'Prioritize regions, factions, items, characters, and progression landmarks. Lean toward gameplay-supportive hooks, traversal, quest structure, combat support, and world objects.'
    case 'brand':
      return 'Prioritize symbolic groups, concepts, objects, and campaign events. Lean toward message pillars, signature assets, mascots, symbolic systems, and brand-facing moments.'
    case 'ugc':
      return 'Prioritize hooks, scenarios, proof beats, creator personas, objects, and repeatable events. Lean toward social-native framing, proof, payoff, and episodic continuation.'
    case 'app':
      return 'Prioritize product promise, target personas, commercial UX flows, screens, reusable components, data models, actions, APIs, native capabilities, design system, and code towers.'
  }
}

export function isProjectOnboardingComplete(projectContext: ProjectContext | null | undefined) {
  return Boolean(projectContext?.onboardingCompletedAt)
}

export function getDefaultProjectSubtype(projectType: ProjectType) {
  return getProjectSubtypeOptions(projectType)[0]?.id ?? 'feature_film'
}

export function getDefaultProjectContext(projectType: ProjectType = 'story') {
  const projectSubtype = getDefaultProjectSubtype(projectType)
  return buildProjectContext({
    projectType,
    projectSubtype,
    artStylePreset: getFallbackArtStyleForProjectType(projectType),
    completed: false,
  })
}

export function isStoryProjectSubtype(value: ProjectSubtype): value is StoryProjectSubtype {
  return ['feature_film', 'tv_streaming_series', 'short_film', 'shortform_series', 'animated_story'].includes(value)
}

export function isBrandProjectSubtype(value: ProjectSubtype): value is BrandProjectSubtype {
  return ['campaign_world', 'product_storytelling', 'mascot_ip', 'brand_education_explainer'].includes(value)
}

export function isGameProjectSubtype(value: ProjectSubtype): value is GameProjectSubtype {
  return value in gameSubtypeToArchetypeId
}

export function isUgcProjectSubtype(value: ProjectSubtype): value is UgcProjectSubtype {
  return value in ugcSubtypeToPresetFamily
}

export function isAppProjectSubtype(value: ProjectSubtype): value is AppProjectSubtype {
  return ['ai_utility_wrapper', 'mascot_daily_ritual', 'content_generator'].includes(value)
}
