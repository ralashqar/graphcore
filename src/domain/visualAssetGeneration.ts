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
