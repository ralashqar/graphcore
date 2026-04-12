export const ART_STYLE_PRESET_GROUPS = [
  'Premium 3D',
  'Stylized 3D',
  'Cartoon & Anime',
  'Photoreal People',
  'Photoreal Product',
  'Illustration',
  'Retro & Minimal',
  'Custom',
] as const

export const ART_STYLE_PRESETS = [
  {
    id: 'premium_stylized_3d',
    label: 'Premium 3D',
    promptLabel: 'premium 3D game concept art, polished high-end CG, premium materials, production-ready lighting',
    group: 'Premium 3D',
    description: 'High-end premium CG for flagship game content, hero assets, and polished marketing-ready visuals.',
  },
  {
    id: 'stylized_hero_3d',
    label: 'Stylized Hero 3D',
    promptLabel: 'stylized 3D hero game art, bold silhouettes, clean materials, readable forms',
    group: 'Stylized 3D',
    description: 'Readable stylized game CG with bold shapes, clean surfacing, and strong gameplay clarity.',
  },
  {
    id: 'cartoon_3d',
    label: 'Cartoon 3D',
    promptLabel: 'cartoon 3D render, playful materials, colorful lighting, simplified forms',
    group: 'Stylized 3D',
    description: 'Playful 3D cartoon look suited to family-friendly worlds, mascots, and approachable brands.',
  },
  {
    id: 'anime_cg',
    label: 'Anime CG',
    promptLabel: 'anime-inspired 3D render, cel-accented shading, expressive stylized forms',
    group: 'Cartoon & Anime',
    description: 'Anime-influenced CG with graphic shading and expressive shapes for cast-driven content.',
  },
  {
    id: 'toon_illustration',
    label: 'Toon Illustration',
    promptLabel: 'toon-shaded illustration, clean outlines, graphic color blocking',
    group: 'Cartoon & Anime',
    description: 'Graphic toon style with strong outlines and simple bold color separation.',
  },
  {
    id: 'photoreal_game_cg',
    label: 'Photoreal Game CG',
    promptLabel: 'photoreal game CG, realistic materials, cinematic lighting, production render',
    group: 'Photoreal People',
    description: 'Realistic in-engine style suited to grounded characters, props, and cinematic game worlds.',
  },
  {
    id: 'ugc_lifestyle_people',
    label: 'UGC Lifestyle People',
    promptLabel: 'photoreal UGC-style people photography, natural lighting, authentic brand lifestyle framing',
    group: 'Photoreal People',
    description: 'Authentic social-first people imagery for lifestyle, creator, and brand storytelling.',
  },
  {
    id: 'brand_advertising_people',
    label: 'Brand Advertising People',
    promptLabel: 'photoreal brand campaign photography, polished studio-commercial lighting, premium human subjects',
    group: 'Photoreal People',
    description: 'Clean premium people-focused brand visuals with controlled lighting and ad-ready polish.',
  },
  {
    id: 'product_packshot',
    label: 'Product Packshot',
    promptLabel: 'photoreal product packshot, premium studio lighting, clean commercial background',
    group: 'Photoreal Product',
    description: 'Studio product rendering for premium ecommerce, packshots, and clean merchandising visuals.',
  },
  {
    id: 'product_advertising',
    label: 'Product Advertising',
    promptLabel: 'photoreal product advertising render, premium commercial composition, luxury lighting',
    group: 'Photoreal Product',
    description: 'Product-led advertising visuals with elevated commercial framing and premium lighting.',
  },
  {
    id: 'storybook_illustration',
    label: 'Storybook Illustration',
    promptLabel: 'storybook illustration',
    group: 'Illustration',
    description: 'Warm illustrative storytelling with painterly charm and readable narrative composition.',
  },
  {
    id: 'stylized_fantasy',
    label: 'Stylized Fantasy',
    promptLabel: 'stylized fantasy concept art',
    group: 'Illustration',
    description: 'Painterly fantasy concept direction for worlds, characters, and magical props.',
  },
  {
    id: 'dark_fantasy_painting',
    label: 'Dark Fantasy Painting',
    promptLabel: 'dark fantasy painted concept art',
    group: 'Illustration',
    description: 'Moody, dramatic fantasy painting with darker palettes and weightier atmosphere.',
  },
  {
    id: 'western_comic',
    label: 'Western Comic',
    promptLabel: 'western comic book art',
    group: 'Illustration',
    description: 'Graphic comic-book energy with punchy contrast and stylized line-driven forms.',
  },
  {
    id: 'pixel_art',
    label: 'Pixel Art',
    promptLabel: 'pixel art game asset render',
    group: 'Retro & Minimal',
    description: 'Retro pixel-art direction for low-resolution stylized worlds, characters, and items.',
  },
  {
    id: 'minimal_flat',
    label: 'Minimal Flat',
    promptLabel: 'minimal flat illustration, reduced detail, clean geometric forms',
    group: 'Retro & Minimal',
    description: 'Clean reduced-detail style for simplified products, diagrams, and lightweight worlds.',
  },
  {
    id: 'custom',
    label: 'Custom',
    promptLabel: 'custom art direction',
    group: 'Custom',
    description: 'Use the custom notes as the main source of truth for the art direction.',
  },
] as const

export type ArtStylePresetId = (typeof ART_STYLE_PRESETS)[number]['id']
export type ArtStylePresetGroup = (typeof ART_STYLE_PRESET_GROUPS)[number]

export const DEFAULT_ART_STYLE_PRESET: ArtStylePresetId = 'premium_stylized_3d'

export const artStylePresetMap = new Map(ART_STYLE_PRESETS.map((preset) => [preset.id, preset]))

export function getArtStylePreset(presetId: string | null | undefined) {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)
    ?? ART_STYLE_PRESETS[0]
}

export function getArtStylePresetLabel(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.label ?? 'Premium 3D'
}

export function getArtStylePromptLabel(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.promptLabel
    ?? 'premium 3D game concept art'
}

export function getArtStylePresetDescription(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.description ?? 'High-end premium CG for flagship game content and polished visuals.'
}

export function getArtStylePresetsByGroup() {
  return ART_STYLE_PRESET_GROUPS.map((group) => ({
    group,
    presets: ART_STYLE_PRESETS.filter((preset) => preset.group === group),
  })).filter((entry) => entry.presets.length > 0)
}
