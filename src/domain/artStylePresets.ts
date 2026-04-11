export const ART_STYLE_PRESETS = [
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

export const DEFAULT_ART_STYLE_PRESET: ArtStylePresetId = 'storybook_illustration'

export const artStylePresetMap = new Map(ART_STYLE_PRESETS.map((preset) => [preset.id, preset]))

export function getArtStylePresetLabel(presetId: string | null | undefined) {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)?.label
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)?.label
    ?? 'Storybook Illustration'
}

export function getArtStylePromptLabel(presetId: string | null | undefined) {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)?.promptLabel
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)?.promptLabel
    ?? 'storybook illustration'
}
