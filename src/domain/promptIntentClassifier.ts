import { z } from 'zod'

export const promptIntentCatalogVersion = '2026-05-14.catalog-ranked-v1'

export const promptIntentSchema = z.enum(['world_mutation', 'output_generation', 'answer_only', 'ambiguous'])

export const promptIntentOutputKindSchema = z.enum([
  'concept_art_image',
  'poster_image',
  'story_bible_from_world',
  'world_reference_document',
  'lore_guide',
  'character_dossier_pack',
  'short_story',
  'narrative_chapter_or_ebook',
  'ebook_from_world',
  'comic_issue_from_sequence',
  'cinematic_episode',
  'cinematic_trailer',
  'ugc_episode',
  'unknown',
])

export const promptIntentTargetFormatSchema = z.enum(['pdf', 'epub', 'docx', 'markdown', 'image', 'video'])

export const promptIntentCandidateSchema = z.object({
  id: z.string(),
  intent: promptIntentSchema,
  outputKind: promptIntentOutputKindSchema,
  targetFormat: promptIntentTargetFormatSchema,
  score: z.number().min(0).max(1),
  rationale: z.string().default(''),
})

export const promptIntentClassificationResultSchema = z.object({
  intent: promptIntentSchema,
  outputKind: promptIntentOutputKindSchema,
  targetFormat: promptIntentTargetFormatSchema,
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean().default(false),
  rationale: z.string().default(''),
  alternatives: z.array(promptIntentCandidateSchema).default([]),
  catalogVersion: z.string().default(promptIntentCatalogVersion),
  classifierMode: z.string().default('scored'),
})

export type PromptIntentClassificationResult = z.infer<typeof promptIntentClassificationResultSchema>

type PromptIntentCatalogEntry = {
  id: string
  intent: z.infer<typeof promptIntentSchema>
  outputKind: z.infer<typeof promptIntentOutputKindSchema>
  targetFormat: z.infer<typeof promptIntentTargetFormatSchema>
  description: string
  positiveExamples: string[]
  negativeExamples: string[]
  positiveCues: string[]
  weakCues?: string[]
  negativeCues?: string[]
  requiredAnyCue?: string[]
  plannerDefaults?: Record<string, unknown>
}

function entry(input: PromptIntentCatalogEntry) {
  return {
    weakCues: [],
    negativeCues: [],
    requiredAnyCue: [],
    plannerDefaults: {},
    ...input,
  } satisfies Required<PromptIntentCatalogEntry>
}

export const promptIntentCatalog = [
  entry({
    id: 'world_mutation',
    intent: 'world_mutation',
    outputKind: 'unknown',
    targetFormat: 'markdown',
    description: 'Changes, expands, inserts, rewires, retcons, or repairs the canonical world graph.',
    positiveExamples: [
      'Insert a new chapter between Chapter 4 and Chapter 5.',
      'Add a faction that opposes the river pact.',
      'Change Suri so her secret has a cost in chapter 6.',
    ],
    negativeExamples: [
      'Create a poster image of Suri.',
      'Write a story bible from the current world.',
    ],
    positiveCues: ['add', 'insert', 'change', 'update', 'expand', 'rewrite', 'retcon', 'merge', 'split', 'reorder', 'move', 'delete', 'remove', 'flesh out', 'develop', 'deepen', 'fix canon', 'world canon', 'relationship', 'chapter between'],
    weakCues: ['character', 'chapter', 'faction', 'location', 'item', 'lore', 'story flow'],
    negativeCues: ['poster', 'image', 'render', 'video', 'trailer', 'story bible', 'reference document', 'pdf'],
  }),
  entry({
    id: 'poster_image',
    intent: 'output_generation',
    outputKind: 'poster_image',
    targetFormat: 'image',
    description: 'A still poster, cover, one-sheet, key art, or promotional image generated from world references.',
    positiveExamples: [
      'Create a vertical poster image of Suri in their samurai outfit.',
      'Make key art of Mara in the Archive.',
    ],
    negativeExamples: [
      'Create a cinematic trailer.',
      'Add poster art as lore to the world.',
    ],
    positiveCues: ['poster', 'cover image', 'cover art', 'key art', 'one sheet', 'one-sheet', 'promotional image', 'vertical poster', 'horizontal poster'],
    weakCues: ['image', 'draw', 'paint', 'illustrate', 'render', 'portrait', 'standing', 'pose', 'cinematic light', 'cinematic lighting'],
    negativeCues: ['trailer', 'episode', 'video', 'chapter prose', 'story bible'],
    requiredAnyCue: ['poster', 'cover image', 'cover art', 'key art', 'one sheet', 'one-sheet', 'promotional image'],
  }),
  entry({
    id: 'concept_art_image',
    intent: 'output_generation',
    outputKind: 'concept_art_image',
    targetFormat: 'image',
    description: 'A still concept-art, illustration, portrait, character art, or environment art image.',
    positiveExamples: [
      'Draw an image of Mara in the Archive.',
      'Generate concept art of the stepwell city.',
    ],
    negativeExamples: [
      'Create a video sequence.',
      'Add the stepwell city to canon.',
    ],
    positiveCues: ['concept art', 'image', 'illustration', 'portrait', 'character art', 'environment art', 'draw', 'paint', 'illustrate', 'render an image', 'create an image', 'generate an image'],
    weakCues: ['cinematic light', 'pose', 'composition', 'shot', 'lighting'],
    negativeCues: ['trailer', 'video', 'episode', 'chapter prose', 'story bible'],
  }),
  entry({
    id: 'cinematic_trailer',
    intent: 'output_generation',
    outputKind: 'cinematic_trailer',
    targetFormat: 'video',
    description: 'A trailer, teaser, or promo cinematic video workflow.',
    positiveExamples: [
      'Create a cinematic trailer for Chapter 4.',
      'Make a teaser video for the world.',
    ],
    negativeExamples: [
      'Create a poster image with cinematic lighting.',
    ],
    positiveCues: ['trailer', 'teaser', 'promo video', 'cinematic trailer'],
    weakCues: ['cinematic', 'video', 'shot by shot', 'storyboard'],
    negativeCues: ['poster', 'image', 'key art', 'cover image'],
    requiredAnyCue: ['trailer', 'teaser', 'promo video'],
  }),
  entry({
    id: 'ugc_episode',
    intent: 'output_generation',
    outputKind: 'ugc_episode',
    targetFormat: 'video',
    description: 'A shortform, UGC, social, ad creative, TikTok, Reel, hook/CTA video workflow.',
    positiveExamples: [
      'Make a UGC video ad creative with a hook and CTA.',
      'Create a TikTok-style shortform video.',
    ],
    negativeExamples: [
      'Create a poster image.',
    ],
    positiveCues: ['ugc', 'creator video', 'ad creative', 'direct response', 'hook', 'cta', 'tiktok', 'reel', 'shortform', 'short-form', 'brand video'],
    weakCues: ['video'],
    negativeCues: ['poster', 'image', 'story bible'],
  }),
  entry({
    id: 'cinematic_episode',
    intent: 'output_generation',
    outputKind: 'cinematic_episode',
    targetFormat: 'video',
    description: 'A cinematic scene, episode, sequence, storyboard, or reference-to-video workflow.',
    positiveExamples: [
      'Create a cinematic sequence from Chapter 2.',
      'Make a video scene where Suri confronts Cael.',
    ],
    negativeExamples: [
      'Create a vertical poster image under cinematic light.',
    ],
    positiveCues: ['cinematic sequence', 'cinematic', 'video', 'shot-by-shot', 'shot by shot', 'storyboard', 'reference-to-video', 'reference to video', 'cinematic episode', 'scene video'],
    weakCues: ['scene', 'shots'],
    negativeCues: ['poster', 'image', 'key art', 'cover image'],
  }),
  entry({
    id: 'comic_issue_from_sequence',
    intent: 'output_generation',
    outputKind: 'comic_issue_from_sequence',
    targetFormat: 'pdf',
    description: 'A comic, manga, graphic novel issue, or panel/page adaptation from world canon.',
    positiveExamples: ['Create a comic issue from Chapter 3.', 'Adapt this scene into manga pages.'],
    negativeExamples: ['Add a comic artist faction to canon.'],
    positiveCues: ['comic', 'manga', 'graphic novel', 'comic issue', 'comic pages', 'panels'],
    weakCues: ['issue'],
    negativeCues: ['add to world', 'canon'],
  }),
  entry({
    id: 'story_bible_from_world',
    intent: 'output_generation',
    outputKind: 'story_bible_from_world',
    targetFormat: 'pdf',
    description: 'A canon/reference story bible, show bible, series bible, or project bible document.',
    positiveExamples: ['Write a story bible for this world.', 'Generate a show bible from current canon.'],
    negativeExamples: ['Write Chapter 1 as prose.'],
    positiveCues: ['story bible', 'world bible', 'series bible', 'project bible', 'show bible'],
    negativeCues: ['chapter prose', 'poster', 'image'],
  }),
  entry({
    id: 'world_reference_document',
    intent: 'output_generation',
    outputKind: 'world_reference_document',
    targetFormat: 'pdf',
    description: 'A world reference document or canon guide from existing graph data.',
    positiveExamples: ['Create a world reference document.', 'Export a canon guide.'],
    negativeExamples: ['Add new canon to the world.'],
    positiveCues: ['world reference', 'reference document', 'reference guide', 'world guide', 'canon guide'],
    negativeCues: ['add', 'insert', 'change', 'poster', 'image'],
  }),
  entry({
    id: 'lore_guide',
    intent: 'output_generation',
    outputKind: 'lore_guide',
    targetFormat: 'pdf',
    description: 'A lore guide, lore document, lorebook, or lore reference output.',
    positiveExamples: ['Create a lore guide.', 'Export a lorebook for this setting.'],
    negativeExamples: ['Add new lore about the river pact.'],
    positiveCues: ['lore guide', 'lore document', 'lorebook', 'lore book'],
    negativeCues: ['add', 'insert', 'change'],
  }),
  entry({
    id: 'character_dossier_pack',
    intent: 'output_generation',
    outputKind: 'character_dossier_pack',
    targetFormat: 'pdf',
    description: 'A character dossier, cast dossier, character bible, or cast bible output.',
    positiveExamples: ['Create character dossiers for the main cast.', 'Export a cast bible.'],
    negativeExamples: ['Create a new character named Luma.'],
    positiveCues: ['character dossier', 'character dossiers', 'character bible', 'cast bible', 'cast dossier'],
    negativeCues: ['create character', 'add character', 'new character'],
  }),
  entry({
    id: 'narrative_chapter_or_ebook',
    intent: 'output_generation',
    outputKind: 'narrative_chapter_or_ebook',
    targetFormat: 'pdf',
    description: 'Narrative prose, chapter prose, manuscript, ebook, or novel output from canon.',
    positiveExamples: ['Write Chapter 1 as prose.', 'Create an ebook from this story.'],
    negativeExamples: ['Add a new chapter node between Chapter 4 and 5.'],
    positiveCues: ['write chapter', 'first chapter', 'chapter 1', 'chapter one', 'chapter prose', 'chapter as prose', 'as prose', 'novel chapter', 'ebook', 'book', 'novel', 'manuscript'],
    weakCues: ['pdf'],
    negativeCues: ['add chapter', 'insert chapter', 'between chapter', 'poster', 'image'],
  }),
  entry({
    id: 'short_story',
    intent: 'output_generation',
    outputKind: 'short_story',
    targetFormat: 'markdown',
    description: 'A short story, story excerpt, or prose scene as an output artifact.',
    positiveExamples: ['Write a short story about Suri.', 'Create a scene prose excerpt.'],
    negativeExamples: ['Add this scene to canon.'],
    positiveCues: ['short story', 'story excerpt', 'scene prose'],
    weakCues: ['write a scene'],
    negativeCues: ['add to world', 'canon', 'insert'],
  }),
  entry({
    id: 'answer_only',
    intent: 'answer_only',
    outputKind: 'unknown',
    targetFormat: 'markdown',
    description: 'A question or explanation request that should answer without mutating canon or creating an artifact.',
    positiveExamples: ['Why does Suri hide the map?', 'Summarize Chapter 4.', 'Evaluate where the story could be fleshed out more.'],
    negativeExamples: ['Create an image of Suri.', 'Add a new chapter.'],
    positiveCues: ['what is', 'explain', 'summarize', 'why', 'where could', 'where can', 'how does', 'tell me about', 'what happened', 'evaluate', 'critique', 'assessment', 'what should i add', 'what are we missing', 'where is', 'suggest where', 'recommend where', 'fleshed out more'],
    negativeCues: ['create', 'make', 'generate', 'add', 'insert', 'change', 'update'],
  }),
] as const

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function includesCue(prompt: string, cue: string) {
  return prompt.includes(cue.toLowerCase())
}

function matchingCues(prompt: string, cues: readonly string[]) {
  return cues.filter((cue) => includesCue(prompt, cue))
}

function hasArtifactCommand(prompt: string) {
  return matchingCues(prompt, ['create', 'make', 'generate', 'render', 'write', 'draft', 'produce', 'export', 'draw', 'paint', 'illustrate', 'design']).length > 0
}

export function classifyPromptIntentScored(prompt: string, input?: {
  sourceSurface?: string | null
  selectedSuggestionId?: string | null
  classifierMode?: string
}): PromptIntentClassificationResult {
  const normalized = normalizePrompt(prompt)
  if (!normalized) {
    return promptIntentClassificationResultSchema.parse({
      intent: 'ambiguous',
      outputKind: 'unknown',
      targetFormat: 'markdown',
      confidence: 0,
      requiresConfirmation: true,
      rationale: 'Empty prompt.',
      alternatives: [],
      catalogVersion: promptIntentCatalogVersion,
      classifierMode: input?.classifierMode ?? 'scored',
    })
  }

  const commandLike = hasArtifactCommand(normalized)
  const suggestionsPreferCanon = Boolean(input?.selectedSuggestionId)
  const candidates = promptIntentCatalog.map((catalogEntry) => {
    const positiveMatches = matchingCues(normalized, catalogEntry.positiveCues)
    const weakMatches = matchingCues(normalized, catalogEntry.weakCues)
    const negativeMatches = matchingCues(normalized, catalogEntry.negativeCues)
    const requiredMatches = matchingCues(normalized, catalogEntry.requiredAnyCue)
    let score = 0.05

    if (catalogEntry.intent === 'output_generation' && commandLike) score += 0.22
    if (catalogEntry.intent === 'world_mutation' && !commandLike) score += 0.08
    score += Math.min(0.62, positiveMatches.length * 0.28)
    score += Math.min(0.18, weakMatches.length * 0.06)
    score -= Math.min(0.36, negativeMatches.length * 0.12)
    if (catalogEntry.requiredAnyCue.length > 0 && requiredMatches.length === 0) score -= 0.32
    if (suggestionsPreferCanon && catalogEntry.intent === 'world_mutation') score += 0.18
    if (suggestionsPreferCanon && catalogEntry.intent === 'output_generation') score -= 0.18

    if (catalogEntry.id === 'poster_image' && matchingCues(normalized, ['poster', 'key art', 'cover image', 'one sheet', 'one-sheet']).length > 0) {
      score += 0.22
    }
    if (catalogEntry.id === 'story_bible_from_world' && matchingCues(normalized, ['story bible', 'world bible', 'series bible', 'project bible', 'show bible']).length > 0) {
      score += 0.24
    }
    if (catalogEntry.id === 'concept_art_image' && matchingCues(normalized, ['no images', 'without images', 'text only']).length > 0) {
      score -= 0.32
    }
    if (catalogEntry.id === 'cinematic_episode' && matchingCues(normalized, ['poster', 'image', 'key art']).length > 0) {
      score -= 0.28
    }
    if (catalogEntry.id === 'world_mutation' && matchingCues(normalized, ['insert', 'add', 'change', 'update', 'between chapter']).length > 0) {
      score += 0.18
    }
    if (catalogEntry.id === 'answer_only' && /\b(where|what|how)\b[\s\S]{0,100}\b(flesh(?:ed)? out|develop(?:ed)?|improve(?:d)?|strengthen(?:ed)?|deepen(?:ed)?|missing|weak|underdeveloped)\b/.test(normalized)) {
      score += 0.26
    }
    if (catalogEntry.id === 'world_mutation' && /\b(where|what|how|should|could)\b[\s\S]{0,100}\b(flesh(?:ed)? out|develop(?:ed)?|improve(?:d)?|strengthen(?:ed)?|deepen(?:ed)?|missing|weak|underdeveloped|suggest|recommend)\b/.test(normalized)) {
      score -= 0.22
    }

    return promptIntentCandidateSchema.parse({
      id: catalogEntry.id,
      intent: catalogEntry.intent,
      outputKind: catalogEntry.outputKind,
      targetFormat: catalogEntry.targetFormat,
      score: Math.max(0, Math.min(1, score)),
      rationale: [
        positiveMatches.length > 0 ? `Matched: ${positiveMatches.slice(0, 5).join(', ')}` : '',
        negativeMatches.length > 0 ? `Counter-signals: ${negativeMatches.slice(0, 4).join(', ')}` : '',
      ].filter(Boolean).join('. '),
    })
  }).sort((left, right) => right.score - left.score)

  const [top, second] = candidates
  const confidence = Math.max(0, Math.min(1, top?.score ?? 0))
  const closeAlternative = Boolean(second && confidence - second.score < 0.08 && confidence < 0.78)
  const lowConfidence = confidence < 0.48
  const requiresConfirmation = lowConfidence || closeAlternative || top?.intent === 'ambiguous'

  return promptIntentClassificationResultSchema.parse({
    intent: lowConfidence ? 'ambiguous' : top.intent,
    outputKind: lowConfidence ? 'unknown' : top.outputKind,
    targetFormat: lowConfidence ? 'markdown' : top.targetFormat,
    confidence,
    requiresConfirmation,
    rationale: top?.rationale || 'Catalog-ranked prompt intent score.',
    alternatives: candidates.slice(0, 4),
    catalogVersion: promptIntentCatalogVersion,
    classifierMode: input?.classifierMode ?? 'scored',
  })
}

export function promptIntentCatalogForLlm() {
  return promptIntentCatalog.map((catalogEntry) => ({
    id: catalogEntry.id,
    intent: catalogEntry.intent,
    outputKind: catalogEntry.outputKind,
    targetFormat: catalogEntry.targetFormat,
    description: catalogEntry.description,
    positiveExamples: catalogEntry.positiveExamples,
    negativeExamples: catalogEntry.negativeExamples,
    plannerDefaults: catalogEntry.plannerDefaults,
  }))
}

export function normalizePromptIntentClassification(
  value: unknown,
  fallback: PromptIntentClassificationResult,
  mode = 'llm',
): PromptIntentClassificationResult {
  const parsed = promptIntentClassificationResultSchema.partial({
    catalogVersion: true,
    classifierMode: true,
  }).safeParse(value)
  if (!parsed.success) return fallback

  const candidateIds = new Set(promptIntentCatalog.map((catalogEntry) => catalogEntry.id))
  const alternatives = (parsed.data.alternatives ?? [])
    .filter((candidate) => candidateIds.has(candidate.id))
    .slice(0, 4)

  const normalized = promptIntentClassificationResultSchema.parse({
    ...parsed.data,
    alternatives: alternatives.length > 0 ? alternatives : fallback.alternatives,
    catalogVersion: promptIntentCatalogVersion,
    classifierMode: mode,
  })

  const topScored = fallback.alternatives[0]
  const explicitPosterOrImage = topScored?.outputKind === 'poster_image' && topScored.score >= 0.72
  const llmChoseCinematicFromStyleOnly = normalized.outputKind === 'cinematic_episode'
    || normalized.outputKind === 'cinematic_trailer'
  if (explicitPosterOrImage && llmChoseCinematicFromStyleOnly) {
    return promptIntentClassificationResultSchema.parse({
      ...normalized,
      intent: 'output_generation',
      outputKind: 'poster_image',
      targetFormat: 'image',
      confidence: Math.max(normalized.confidence, topScored.score),
      requiresConfirmation: false,
      rationale: `${normalized.rationale} Safeguard: explicit poster/key-art artifact beats cinematic style language.`,
      alternatives: fallback.alternatives,
      classifierMode: `${mode}_safeguarded`,
    })
  }

  return normalized
}
