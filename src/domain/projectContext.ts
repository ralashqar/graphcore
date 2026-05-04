import { z } from 'zod'

export const projectTypeSchema = z.enum(['story', 'game', 'brand', 'ugc', 'app'])
export const projectBrainProfileSchema = z.enum(['story', 'game', 'brand', 'ugc', 'app'])
export const projectContextSourceSchema = z.enum(['onboarding', 'manual'])

export const PROJECT_ONBOARDING_VERSION = '2026-04-22-world-onboarding-v1'

export const storyProjectSubtypeSchema = z.enum([
  'feature_film',
  'tv_streaming_series',
  'short_film',
  'shortform_series',
  'animated_story',
  'fiction_novel',
  'nonfiction_ebook',
])

export const gameProjectSubtypeSchema = z.enum([
  'action_rpg',
  'narrative_adventure',
  'narrative_rpg_mobile',
  'strategy_builder',
  'survival_craft',
  'shooter_combat',
  'social_sim',
  'open_world_sandbox',
  'platformer_metroidvania',
  'horror_mystery',
])

export const brandProjectSubtypeSchema = z.enum([
  'campaign_world',
  'product_storytelling',
  'mascot_ip',
  'brand_education_explainer',
])

export const ugcProjectSubtypeSchema = z.enum([
  'creator_organic',
  'direct_response_ad',
  'faceless_explainer_demo',
  'serialized_social_drama',
])

export const appProjectSubtypeSchema = z.enum([
  'ai_utility_wrapper',
  'mascot_daily_ritual',
  'content_generator',
])

export const projectSubtypeSchema = z.union([
  storyProjectSubtypeSchema,
  gameProjectSubtypeSchema,
  brandProjectSubtypeSchema,
  ugcProjectSubtypeSchema,
  appProjectSubtypeSchema,
])

export const projectContextSchema = z.object({
  projectType: projectTypeSchema,
  projectSubtype: projectSubtypeSchema,
  brainProfile: projectBrainProfileSchema,
  artStylePreset: z.string().min(1),
  artStyleDescription: z.string().default(''),
  onboardingCompletedAt: z.string().nullable().default(null),
  onboardingVersion: z.string().default(PROJECT_ONBOARDING_VERSION),
  source: projectContextSourceSchema.default('onboarding'),
})

export type ProjectType = z.infer<typeof projectTypeSchema>
export type ProjectBrainProfile = z.infer<typeof projectBrainProfileSchema>
export type ProjectContextSource = z.infer<typeof projectContextSourceSchema>
export type StoryProjectSubtype = z.infer<typeof storyProjectSubtypeSchema>
export type GameProjectSubtype = z.infer<typeof gameProjectSubtypeSchema>
export type BrandProjectSubtype = z.infer<typeof brandProjectSubtypeSchema>
export type UgcProjectSubtype = z.infer<typeof ugcProjectSubtypeSchema>
export type AppProjectSubtype = z.infer<typeof appProjectSubtypeSchema>
export type ProjectSubtype =
  | StoryProjectSubtype
  | GameProjectSubtype
  | BrandProjectSubtype
  | UgcProjectSubtype
  | AppProjectSubtype
export type ProjectContext = z.infer<typeof projectContextSchema>
