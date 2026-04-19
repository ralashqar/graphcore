export type ConceptImageGenerationRequest = {
  prompt: string
  model?: string
  referenceImageUrls?: string[]
  aspectRatio?: string
}

export type ConceptImageGenerationResult = {
  status: 'succeeded'
  provider: 'fal'
  model: string
  requestId: string | null
  imageUrls: string[]
  raw: Record<string, unknown>
}

export type MeshFromImageGenerationRequest = {
  definitionKey: string
  imageAssetKey?: string | null
  imageUrl?: string | null
  prompt?: string | null
  style?: string | null
}

export type MeshFromImageGenerationResult = {
  status: 'coming_soon'
  provider: 'fal'
  requestId: null
  message: string
}

export type CharacterConceptPromptInput = {
  artStyleDescription?: string | null
  artStylePresetLabel?: string | null
  archetypeLabel?: string | null
  characterName?: string | null
  conceptArtMode?: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  projectContextDescription?: string | null
  subtype?: string | null
  visualDescription: string
}

export type ItemConceptPromptInput = {
  artStyleDescription?: string | null
  artStylePresetLabel?: string | null
  archetypeLabel?: string | null
  conceptArtMode?: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  itemName?: string | null
  projectContextDescription?: string | null
  physicalSubtype?: string | null
  worldPlacementRole?: string | null
  pickupContext?: string | null
  visualDescription: string
}

export type EnvironmentConceptPromptInput = {
  artStyleDescription?: string | null
  artStylePresetLabel?: string | null
  archetypeLabel?: string | null
  conceptArtMode?: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  environmentName?: string | null
  projectContextDescription?: string | null
  subtype?: string | null
  lightingProfile?: string | null
  visualDescription: string
}

export function isValidImageFileEntry(value: unknown): value is { url: string; content_type?: string; file_name?: string } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { url?: unknown; content_type?: unknown; file_name?: unknown }
  if (typeof candidate.url !== 'string' || !/^https?:\/\//i.test(candidate.url)) {
    return false
  }

  if (typeof candidate.content_type === 'string' && candidate.content_type.toLowerCase().startsWith('image/')) {
    return true
  }

  if (typeof candidate.file_name === 'string' && /\.(avif|gif|jpe?g|png|webp)$/i.test(candidate.file_name)) {
    return true
  }

  return /\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(candidate.url)
}

export function extractFalImageUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') {
    return []
  }

  const record = data as {
    image?: unknown
    images?: unknown
    url?: unknown
    output_url?: unknown
    output?: unknown
    response?: unknown
    data?: unknown
    result?: unknown
  }

  if (Array.isArray(record.images)) {
    const imageUrls = record.images.flatMap((entry) => {
      if (typeof entry === 'string' && /^https?:\/\//i.test(entry)) {
        return [entry]
      }
      return isValidImageFileEntry(entry) ? [entry.url] : []
    })

    if (imageUrls.length > 0) {
      return imageUrls
    }
  }

  if (typeof record.image === 'string' && /^https?:\/\//i.test(record.image)) {
    return [record.image]
  }

   if (isValidImageFileEntry(record.image)) {
    return [record.image.url]
  }

  if (typeof record.url === 'string' && /^https?:\/\//i.test(record.url)) {
    return [record.url]
  }

  if (typeof record.output_url === 'string' && /^https?:\/\//i.test(record.output_url)) {
    return [record.output_url]
  }

  if (record.output && typeof record.output === 'object' && !Array.isArray(record.output)) {
    const nestedUrls: string[] = extractFalImageUrls(record.output)
    if (nestedUrls.length > 0) {
      return nestedUrls
    }
  }

  if (record.response && typeof record.response === 'object' && !Array.isArray(record.response)) {
    const nestedUrls: string[] = extractFalImageUrls(record.response)
    if (nestedUrls.length > 0) {
      return nestedUrls
    }
  }

  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    const nestedUrls: string[] = extractFalImageUrls(record.data)
    if (nestedUrls.length > 0) {
      return nestedUrls
    }
  }

  if (record.result && typeof record.result === 'object' && !Array.isArray(record.result)) {
    const nestedUrls: string[] = extractFalImageUrls(record.result)
    if (nestedUrls.length > 0) {
      return nestedUrls
    }
  }

  return []
}

export function normalizeCharacterConceptArtMode(
  mode: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null | undefined,
) {
  return mode === 'continuity' || mode === 'proof_surface'
    ? mode
    : 'design_sheet'
}

export function resolveCharacterConceptVariantSet(input: {
  conceptArtMode?: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null
  descriptiveText?: string | null
}) {
  const normalizedMode = normalizeCharacterConceptArtMode(input.conceptArtMode)
  if (normalizedMode === 'design_sheet') {
    return ['design_sheet_default']
  }
  if (normalizedMode === 'proof_surface') {
    return ['default']
  }
  if (normalizedMode !== 'continuity') {
    return []
  }

  const text = (input.descriptiveText ?? '').toLowerCase()
  return [
    'three_quarter_portrait',
    'side_profile',
    'full_body',
    ...(text.includes('phone') || text.includes('creator') ? ['phone_in_hand'] : []),
    ...(text.includes('product') || text.includes('app') ? ['product_hold'] : []),
  ]
}

export function resolveConceptImageAspectRatio(input: {
  jobKind: 'character_concept_image' | 'item_concept_image' | 'environment_concept_image'
  conceptArtMode?: 'showcase' | 'design_sheet' | 'continuity' | 'proof_surface' | null
}) {
  if (input.jobKind === 'environment_concept_image') return '16:9' as const
  if (input.jobKind === 'character_concept_image' && normalizeCharacterConceptArtMode(input.conceptArtMode) === 'design_sheet') {
    return '4:3' as const
  }
  return '1:1' as const
}

export function buildCharacterConceptPrompt(input: CharacterConceptPromptInput) {
  const subtype = input.subtype?.trim() ?? ''
  const mode = normalizeCharacterConceptArtMode(input.conceptArtMode)
  const variant = input.conceptVariant?.trim() ?? ''
  const poseDirection = mode === 'continuity'
    ? (
      variant === 'side_profile'
        ? 'Show a clean side-profile character reference with the face, hair silhouette, and wardrobe clearly readable.'
        : variant === 'full_body'
          ? 'Show a full-body continuity reference with stable wardrobe, proportions, and accessories clearly visible.'
          : variant === 'phone_in_hand'
            ? 'Show the character in a controlled continuity pose holding a phone in a stable, readable way.'
            : variant === 'product_hold'
              ? 'Show the character in a controlled continuity pose holding the product or hero prop in a stable, readable way.'
              : 'Show a neutral three-quarter continuity portrait with stable face, hair, wardrobe, and accessories.'
    )
    : 'Show the same character in one full-body front view and one full-body three-quarter view from a second angle.'
  if (mode === 'design_sheet') {
    return [
      input.characterName?.trim() ? `Character: ${input.characterName.trim()}.` : null,
      subtype ? `Subtype: ${subtype}.` : null,
      input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
      'Character sheet, three-view, full figure only, clean white studio background, 3 square panels on the right for the head and other important features.',
      'Render as a playable in-engine character asset, not as a loose illustration, sketch, mood board, or poster art.',
      input.artStylePresetLabel?.trim() ? `Use the project art style guide: ${input.artStylePresetLabel.trim()}.` : null,
      input.artStyleDescription?.trim() ? `Additional art direction: ${input.artStyleDescription.trim()}.` : null,
      'Show three full-figure views of the same character: front view, side view, and three-quarter view. Keep these main views large, clear, and fully readable.',
      'Use the 3 square panels for the head and the most important defining features such as face, weapon, armor, or another distinctive accessory or material detail.',
      'Use crisp materials, sharp readable forms, clean silhouette separation, and high-end production character-sheet rendering.',
      'Keep the character identical across all views with stable identity, costume, proportions, silhouette, and materials.',
      'Use a clean white studio background with soft grounded shadow. No action pose. No environment. No text. No decorative layout.',
      `Character visual description: ${input.visualDescription.trim()}.`,
    ].filter(Boolean).join(' ')
  }
  const sections = [
    input.characterName?.trim() ? `Character: ${input.characterName.trim()}.` : null,
    subtype ? `Subtype: ${subtype}.` : null,
    input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
    mode === 'continuity'
      ? 'Create a square continuity-ready character reference image for downstream still and video generation.'
      : 'Create a square proof-surface-ready character reference image where the held phone, app, or product stays readable.',
    'Render it in the game’s final visual language, not as a loose illustration, sketch, mood board, or cinematic poster.',
    input.artStylePresetLabel?.trim() ? `Universal game art style: ${input.artStylePresetLabel.trim()}.` : null,
    input.artStyleDescription?.trim() ? `Additional art direction: ${input.artStyleDescription.trim()}.` : null,
    input.captureProfile?.trim() ? `Capture profile: ${input.captureProfile.trim()}.` : null,
    input.projectContextDescription?.trim() ? `Project context: ${input.projectContextDescription.trim()}.` : null,
    poseDirection,
    mode === 'continuity'
      ? 'Use a clean studio or quiet neutral background with controlled lighting and no UI, text, logos, borders, or collage layout.'
      : 'Use a clean studio or neutral background with the silhouette fully readable and no UI, text, logos, borders, or collage layout.',
    `Character visual description: ${input.visualDescription.trim()}.`,
  ]

  return sections.filter(Boolean).join(' ')
}

export function buildItemConceptPrompt(input: ItemConceptPromptInput) {
  const mode = input.conceptArtMode ?? 'showcase'
  const sections = [
    input.itemName?.trim() ? `Item: ${input.itemName.trim()}.` : null,
    input.physicalSubtype?.trim() ? `Subtype: ${input.physicalSubtype.trim()}.` : null,
    input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
    input.worldPlacementRole?.trim() ? `World placement role: ${input.worldPlacementRole.trim()}.` : null,
    input.pickupContext?.trim() ? `Pickup context: ${input.pickupContext.trim()}.` : null,
    mode === 'proof_surface'
      ? 'Create a square proof-surface reference image for a single item, product, screen, or hero prop.'
      : mode === 'continuity'
        ? 'Create a square continuity-ready reference image for a single item or prop asset.'
        : 'Create a square game concept art image for a single in-engine item or prop asset.',
    mode === 'proof_surface'
      ? 'Render it for readable proof, not as poster art, inventory card mockup, or mood-board composition.'
      : 'Render it in the game\'s final visual language, not as a loose illustration, sketch, mood board, cinematic poster, or inventory card mockup.',
    input.artStylePresetLabel?.trim() ? `Universal game art style: ${input.artStylePresetLabel.trim()}.` : null,
    input.artStyleDescription?.trim() ? `Additional art direction: ${input.artStyleDescription.trim()}.` : null,
    input.captureProfile?.trim() ? `Capture profile: ${input.captureProfile.trim()}.` : null,
    input.projectContextDescription?.trim() ? `Project context: ${input.projectContextDescription.trim()}.` : null,
    mode === 'proof_surface'
      ? 'Show the object in a readable proof-friendly framing. Use a held, in-use, or close proof angle only when the selected variant requires it.'
      : 'Show one clearly readable hero object, centered in frame, fully visible, with no hands, characters, UI, labels, logo marks, borders, or collage layout.',
    'Use a clean neutral or studio-style background so silhouette, materials, and readability-critical details are clear.',
    `Item visual description: ${input.visualDescription.trim()}.`,
  ]

  return sections.filter(Boolean).join(' ')
}

export function buildEnvironmentConceptPrompt(input: EnvironmentConceptPromptInput) {
  const mode = input.conceptArtMode ?? 'showcase'
  const sections = [
    input.environmentName?.trim() ? `Environment: ${input.environmentName.trim()}.` : null,
    input.subtype?.trim() ? `Subtype: ${input.subtype.trim()}.` : null,
    input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
    input.lightingProfile?.trim() ? `Lighting direction: ${input.lightingProfile.trim()}.` : null,
    mode === 'continuity'
      ? 'Create a continuity-ready environment reference image for downstream still and video generation.'
      : 'Create a polished hero concept image for a game environment or set piece.',
    mode === 'continuity'
      ? 'Render it as a controlled continuity frame with spatial readability, not as a cinematic poster or mood board.'
      : 'Render it in the game\'s final visual language, not as a rough paintover, sketch, mood board, cinematic poster, or top-down map.',
    input.artStylePresetLabel?.trim() ? `Universal game art style: ${input.artStylePresetLabel.trim()}.` : null,
    input.artStyleDescription?.trim() ? `Additional art direction: ${input.artStyleDescription.trim()}.` : null,
    input.captureProfile?.trim() ? `Capture profile: ${input.captureProfile.trim()}.` : null,
    input.projectContextDescription?.trim() ? `Project context: ${input.projectContextDescription.trim()}.` : null,
    'Show one clear environment view with strong spatial readability, grounded scale cues, and no UI, text, logos, borders, or collage layout.',
    `Environment visual description: ${input.visualDescription.trim()}.`,
  ]

  return sections.filter(Boolean).join(' ')
}
