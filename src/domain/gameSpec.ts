import { z } from 'zod'
import { DEFAULT_ART_STYLE_PRESET } from './artStylePresets'
import { cinematicSettingsSchema } from './cinematics'

const scopeWeightSchema = z.enum(['none', 'light', 'medium', 'heavy'])

export const gameSpecSchema = z.object({
  presetCatalogVersion: z.string().default('2026-04-08.2'),
  title: z.string().default(''),
  theme: z.object({
    genre: z.string().default('fantasy_rpg'),
    tone: z.string().default('grounded'),
    playerFantasy: z.string().default('adventurer'),
    worldPremise: z.string().default(''),
    namingStyle: z.string().default('classic_fantasy'),
    artStylePreset: z.string().default(DEFAULT_ART_STYLE_PRESET),
    artStyleDescription: z.string().default(''),
  }).default({
    genre: 'fantasy_rpg',
    tone: 'grounded',
    playerFantasy: 'adventurer',
    worldPremise: '',
    namingStyle: 'classic_fantasy',
    artStylePreset: DEFAULT_ART_STYLE_PRESET,
    artStyleDescription: '',
  }),
  systems: z.object({
    progressionStyle: z.enum(['linear', 'branching', 'hub_and_spoke', 'open']).default('branching'),
    combatStyle: z.enum(['none', 'turn_based', 'real_time', 'hybrid']).default('real_time'),
    inputStyle: z.enum(['none', 'direct_control', 'party_commands', 'dialogue_choice']).default('direct_control'),
    inventoryStyle: z.enum(['none', 'slots', 'weight', 'stacked']).default('slots'),
    economyStyle: z.enum(['none', 'gold', 'barter', 'energy']).default('gold'),
  }).default({
    progressionStyle: 'branching',
    combatStyle: 'real_time',
    inputStyle: 'direct_control',
    inventoryStyle: 'slots',
    economyStyle: 'gold',
  }),
  contentScope: z.object({
    items: scopeWeightSchema.default('heavy'),
    characters: scopeWeightSchema.default('heavy'),
    abilities: scopeWeightSchema.default('medium'),
    locations: scopeWeightSchema.default('medium'),
    environments: scopeWeightSchema.default('medium'),
    worldModels: scopeWeightSchema.default('light'),
    markets: scopeWeightSchema.default('light'),
    quests: scopeWeightSchema.default('medium'),
    graphs: scopeWeightSchema.default('medium'),
  }).default({
    items: 'heavy',
    characters: 'heavy',
    abilities: 'medium',
    locations: 'medium',
    environments: 'medium',
    worldModels: 'light',
    markets: 'light',
    quests: 'medium',
    graphs: 'medium',
  }),
  selectedPresetIds: z.object({
    packs: z.array(z.string()).default([]),
    archetypes: z.array(z.string()).default([]),
    definitions: z.array(z.string()).default([]),
    graphs: z.array(z.string()).default([]),
  }).default({
    packs: [],
    archetypes: [],
    definitions: [],
    graphs: [],
  }),
  bootstrapTargets: z.object({
    starterArchetypePresetIds: z.array(z.string()).default([]),
    starterDefinitionPresetIds: z.array(z.string()).default([]),
    starterGraphPresetIds: z.array(z.string()).default([]),
  }).default({
    starterArchetypePresetIds: [],
    starterDefinitionPresetIds: [],
    starterGraphPresetIds: [],
  }),
  overrides: z.record(z.string(), z.unknown()).default({}),
  cinematics: cinematicSettingsSchema.default(() => cinematicSettingsSchema.parse({})),
})

export type GameSpec = z.infer<typeof gameSpecSchema>
