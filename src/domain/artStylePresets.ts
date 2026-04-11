export const ART_STYLE_PRESETS = [
  {
    id: 'premium_stylized_3d',
    label: 'Premium Stylized 3D',
    promptLabel: 'premium stylized 3D game concept art, polished hero-driven battle royale style, high-end game-ready materials',
  },
  { id: 'storybook_illustration', label: 'Storybook Illustration', promptLabel: 'storybook illustration' },
  { id: 'stylized_fantasy', label: 'Stylized Fantasy', promptLabel: 'stylized fantasy concept art' },
  { id: 'anime_cel', label: 'Anime Cel', promptLabel: 'anime cel-shaded illustration' },
  { id: 'western_comic', label: 'Western Comic', promptLabel: 'western comic book art' },
  { id: 'dark_fantasy_painting', label: 'Dark Fantasy Painting', promptLabel: 'dark fantasy painted concept art' },
  { id: 'sci_fi_concept_art', label: 'Sci-Fi Concept Art', promptLabel: 'science fiction concept art' },
  { id: 'pixel_art', label: 'Pixel Art', promptLabel: 'pixel art character portrait' },
  { id: 'custom', label: 'Custom', promptLabel: 'custom art direction' },
] as const

export type ArtStylePresetId = (typeof ART_STYLE_PRESETS)[number]['id']

export const DEFAULT_ART_STYLE_PRESET: ArtStylePresetId = 'premium_stylized_3d'

export const artStylePresetMap = new Map(ART_STYLE_PRESETS.map((preset) => [preset.id, preset]))

export function getArtStylePresetLabel(presetId: string | null | undefined) {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)?.label
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)?.label
    ?? 'Premium Stylized 3D'
}

export function getArtStylePromptLabel(presetId: string | null | undefined) {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)?.promptLabel
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)?.promptLabel
    ?? 'premium stylized 3D game concept art'
}
