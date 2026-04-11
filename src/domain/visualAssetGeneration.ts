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
  const sections = [
    input.characterName?.trim() ? `Character: ${input.characterName.trim()}.` : null,
    input.subtype?.trim() ? `Subtype: ${input.subtype.trim()}.` : null,
    input.archetypeLabel?.trim() ? `Archetype: ${input.archetypeLabel.trim()}.` : null,
    input.artStylePresetLabel?.trim() ? `Art style preset: ${input.artStylePresetLabel.trim()}.` : null,
    input.artStyleDescription?.trim() ? `Art style notes: ${input.artStyleDescription.trim()}.` : null,
    `Create a square concept image focused on the character. ${input.visualDescription.trim()}`,
  ]

  return sections.filter(Boolean).join(' ')
}
