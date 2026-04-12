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
  subtype?: string | null
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

  return []
}

export function buildCharacterConceptPrompt(input: CharacterConceptPromptInput) {
  const subtype = input.subtype?.trim() ?? ''
  const isHumanoid = subtype.length === 0 || subtype === 'humanoid'
  const poseDirection = isHumanoid
    ? 'Show the full-body character in a neutral T-pose concept-sheet stance for modeling reference.'
    : 'Show the full character clearly, fully visible, centered in frame.'
  const sections = [
    input.characterName?.trim() ? `Character: ${input.characterName.trim()}.` : null,
    subtype ? `Subtype: ${subtype}.` : null,
    input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
    'Create a square game concept art image for a playable in-engine character asset.',
    'Render it in the game’s final visual language, not as a loose illustration, sketch, mood board, or cinematic poster.',
    input.artStylePresetLabel?.trim() ? `Universal game art style: ${input.artStylePresetLabel.trim()}.` : null,
    input.artStyleDescription?.trim() ? `Additional art direction: ${input.artStyleDescription.trim()}.` : null,
    poseDirection,
    'Use a clean studio or neutral background with the silhouette fully readable and no UI, text, logos, borders, or collage layout.',
    `Character visual description: ${input.visualDescription.trim()}.`,
  ]

  return sections.filter(Boolean).join(' ')
}
