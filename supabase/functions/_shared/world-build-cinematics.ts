import { z } from 'npm:zod@4'

import {
  actionBeatSchema,
  audioBeatSchema,
  buildCinematicSequenceFromScriptDoc,
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  compileCinematicSequence,
  cinematicBeatSchema,
  cinematicDominantTriggerSchema,
  cinematicFormatSubtypeSchema,
  cinematicFormulaFamilySchema,
  cinematicHookRoleSchema,
  cinematicPlatformTargetSchema,
  cinematicPresetFamilySchema,
  cinematicRelationshipSchema,
  cinematicScriptDocSchema,
  cinematicSequenceSchema,
  coerceFormatSubtypeForPresetFamily,
  deriveCinematicScriptFromSequence,
  deriveDefaultDominantTriggerFromFormatSubtype,
  deriveDefaultFormulaFamilyFromFormatSubtype,
  deriveDefaultFormatSubtypeFromPresetFamily,
  getCinematicPresetLabel,
  getCinematicFormatSubtypeLabel,
  dialogueBeatSchema,
  storyboardSpecSchema,
} from '../../../src/domain/cinematics.ts'
import {
  correctUgcPresetSelectionForPromptText,
  deriveUgcShotDefaults,
  getUgcPresetProfile,
  inferCinematicFormatSubtypeFromPromptText,
  inferCinematicPresetFamilyFromPromptText,
  isDominantTriggerAllowedForFormatSubtype,
  isFormulaFamilyAllowedForFormatSubtype,
} from '../../../src/domain/ugcPresetProfiles.ts'
import {
  getArtStylePresetLabel,
  getArtStylePresetPromptDirectives,
  resolveArtStylePresetForCinematic,
} from '../../../src/domain/artStylePresets.ts'
import {
  cinematicCompositeRefPlanSchema,
  cinematicGraphSettingsSchema,
  cinematicPlanSchema,
  cinematicShotPlanSchema,
  type CinematicEntityRef,
  type CinematicPlan,
} from '../../../src/domain/worldBuild.ts'
import { compileCinematicGraphFromSequence } from '../../../src/domain/cinematicScriptCompiler.ts'

type SnapshotDefinition = {
  key: string
  kind: string
  name: string
  summary?: string | null
}

export function inferCinematicPresetFamilyFromPrompt(prompt: string) {
  return cinematicPresetFamilySchema.parse(inferCinematicPresetFamilyFromPromptText(prompt))
}

export function inferCinematicFormatSubtypeFromPrompt(
  prompt: string,
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
) {
  return cinematicFormatSubtypeSchema.parse(
    inferCinematicFormatSubtypeFromPromptText(prompt, presetFamily) ?? deriveDefaultFormatSubtypeFromPresetFamily(presetFamily),
  )
}

export function correctUgcPresetSelectionForPrompt(input: {
  prompt: string
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null | undefined
}) {
  const corrected = correctUgcPresetSelectionForPromptText(input)
  return {
    presetFamily: cinematicPresetFamilySchema.parse(corrected.presetFamily),
    formatSubtype: corrected.formatSubtype ? cinematicFormatSubtypeSchema.parse(corrected.formatSubtype) : null,
  }
}

function nonEmptyString(value: string | null | undefined, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function formatExactEnumOptions(options: readonly string[]) {
  return options.map((option) => `"${option}"`).join(', ')
}

function exactPlannerEnumInstructions(input: {
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null
}) {
  const profile = getUgcPresetProfile(input.formatSubtype, input.presetFamily)
  return [
    `graphSettings.presetFamily must be exactly one of: ${formatExactEnumOptions(cinematicPresetFamilySchema.options)}.`,
    `graphSettings.formatSubtype must be exactly one of: ${formatExactEnumOptions(cinematicFormatSubtypeSchema.options)} or null when not needed.`,
    `graphSettings.formulaFamily must be exactly one of: ${formatExactEnumOptions(cinematicFormulaFamilySchema.options)} or null when not needed.`,
    `graphSettings.dominantTrigger must be exactly one of: ${formatExactEnumOptions(cinematicDominantTriggerSchema.options)} or null when not needed.`,
    `Every shot.hookRole must be exactly one of: ${formatExactEnumOptions(cinematicHookRoleSchema.options)} or null when omitted.`,
    `Every shot.platformTarget must be exactly one of: ${formatExactEnumOptions(cinematicPlatformTargetSchema.options)} or null when omitted.`,
    profile ? `For this locked format subtype, prefer only these exact formulaFamily values: ${formatExactEnumOptions(profile.allowedFormulaFamilies)}.` : null,
    profile ? `For this locked format subtype, prefer only these exact dominantTrigger values: ${formatExactEnumOptions(profile.allowedDominantTriggers)}.` : null,
    input.formatSubtype ? `Use graphSettings.presetFamily = "${input.presetFamily}" and graphSettings.formatSubtype = "${input.formatSubtype}". Do not rename or paraphrase those enum values.` : `Use graphSettings.presetFamily = "${input.presetFamily}". Do not rename or paraphrase that enum value.`,
  ].filter((entry): entry is string => Boolean(entry))
}

function subtypePlannerInstructions(formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  const profile = getUgcPresetProfile(formatSubtype)
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return [
        'Structure beats as hook, personal problem, use case, soft proof, and soft CTA.',
        'Keep the phrasing conversational and believable for a creator speaking from personal experience.',
        'Dialogue can carry the format here, but keep it concise and native. Narrator overlay text is optional and should only reinforce the key point, not restate every beat.',
      ]
    case 'creator_reframe':
      return [
        'Structure beats as hook, viewer behavior named, reframed interpretation, and emotional payoff.',
        'Make the reframe feel like a native creator insight, not a polished brand line.',
        'Dialogue is often the main delivery tool. Narrator overlay text should be sparse and only used when it sharpens the reframe without replacing the creator voice.',
      ]
    case 'creator_validation':
      return [
        'Structure beats as hook, emotional recognition, validating statement, and soft resolution.',
        'Bias toward emotional recognition and parasocial trust instead of hard selling.',
        'Dialogue can dominate, but keep it intimate and short. Use narrator overlay text sparingly so the clip still feels creator-native instead of over-produced.',
      ]
    case 'creator_serialized_drama':
      return [
        'Structure beats as hook, conflict setup, suffering or escalation, reveal, redemption, and soft CTA.',
        'Open with the taboo rupture or juicy social problem before explaining context, and do not let the product interrupt too early.',
        'Keep the tone intimate and story-led like creator gossip or storytime content. The product should enter as the reveal or resolution mechanism.',
      ]
    case 'ad_problem_solution':
      return [
        'Structure beats as hook, pain, product, proof, and CTA with product visibility early.',
        'Show the product causing the better outcome instead of merely being present in frame.',
        'Dialogue should support the proof path, not explain the entire ad. Narrator overlay text is allowed for quick framing, proof captions, or CTA emphasis when it improves sound-off clarity.',
      ]
    case 'ad_mechanism_proof':
      return [
        'Structure beats as hook, mechanism, visible demonstration, proof, and CTA.',
        'Make the mechanism legible on screen and keep proof concrete and easy to verify.',
        'Use dialogue only when it frames the mechanism or proof. Narrator overlay text can label steps or proof beats, but keep it short and readable on mobile.',
      ]
    case 'ad_before_after':
      return [
        'Structure beats as hook, before, intervention, after, and CTA.',
        'Make the before and after states visually distinct even with sound off.',
        'Dialogue should be minimal unless it strengthens the transformation. Narrator overlay text can help mark the before, intervention, or after state, but do not overload every shot.',
      ]
    case 'ad_comparison':
      return [
        'Structure beats as hook, option A versus B, why B wins, proof, and CTA.',
        'Keep the winning side obvious in every beat and escalate proof instead of repeating the same comparison.',
        'Prefer visual comparison first. Dialogue should stay brief, and narrator overlay text can help anchor the comparison or winner state without explaining every frame.',
      ]
    case 'ad_trojan_horse_drama':
      return [
        'Structure beats as setup, betrayal or conflict, suffering, reveal, redemption, and CTA.',
        'Use the story as the delivery vehicle. Do not introduce the app or product until the tension is already established, but do reveal it before the ending.',
        'Keep the conversion logic visible: the product should clearly resolve the conflict, restore order, or unlock the better outcome on screen.',
      ]
    case 'faceless_demo':
      return [
        'Structure beats as pattern interrupt, product or process, proof, and CTA.',
        'Make the object, screen, or process the hero instead of relying on facial acting.',
        'Keep dialogue absent or minimal unless the prompt explicitly asks for it. Narrator overlay text is often a better fit than spoken dialogue for faceless demos.',
      ]
    case 'faceless_explainer':
      return [
        'Structure beats as wrong belief, explanation, mechanism, and result.',
        'Use clean visual reasoning and avoid voiceover-dependent persuasion.',
        'Prefer sparse narrator overlay text or very short explanatory lines over dense spoken dialogue. The visual mechanism should stay primary.',
      ]
    case 'faceless_process':
      return [
        'Structure beats as process start, progression, reveal, and payoff.',
        'Each beat should introduce a visibly new stage of the process rather than repeating the same view.',
        'Dialogue is usually unnecessary. If text is needed, prefer short narrator overlay text that labels stages without dominating the visuals.',
      ]
    case 'faceless_serialized_drama':
      return [
        'Structure beats as absurd hook, conflict setup, suffering, reveal, redemption, and light CTA.',
        'Make the unserious packaging immediately obvious, but keep the emotional conflict legible and real enough to sustain attention.',
        'The product or app should visibly restore order, connection, or relief. Keep the beats visual-first and avoid talk-heavy scenes.',
      ]
    case 'contrast_narrative':
      return [
        'Treat this as a contrast-led multi-scene narrative, not a talking-head script.',
        'Plan 8-10 short escalating scenes with two locked poles and the strongest payoff image at the end.',
        'Populate scriptDoc.referenceVault, sceneCount, statusPayoffType, and narrativeArcTemplate when useful.',
        'Keep the comparison readable in every beat and make each scene widen the gap across a new visible dimension.',
        'Dialogue should usually be sparse. Most beats should work fully on mute, and the visual comparison should carry the format.',
        'Do not make both poles speak full lines in every beat. If both sides speak in one shot, keep each line extremely short and contrastive.',
        'Narrator overlay text is optional and should be used sparingly for chaptering, contrast labels, or final payoff language when it improves sound-off clarity.',
      ]
    default:
      return profile
        ? [
            `Target use case: ${profile.targetUseCase}`,
            `Audience intent: ${profile.audienceIntent}`,
            `First-frame hook style: ${profile.firstFrameHookStyle}`,
            `Proof expectation: ${profile.proofExpectation}`,
            `Pacing guidance: ${profile.pacingGuidance}`,
            `Reference strategy: ${profile.referenceStrategy}`,
          ]
        : []
  }
}

function presetPlannerInstructions(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  switch (presetFamily) {
    case 'story_movie_tv':
      return [
        'Bias toward authored film or TV scene construction with continuity between shots.',
        'Prefer multi-shot sequences, stronger staging continuity, and storyboard-friendly compositions.',
      ]
    case 'ugc_creator':
      return [
        'Plan this as a short-form creator-native UGC video.',
        'Bias toward 9:16 beats that move from hook to personal claim to demo to soft CTA.',
        'Storyboard refs are optional; creator and product continuity matter more than boards.',
        'Keep the language conversational, creator-believable, and less polished than a commercial storyboard.',
        profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
        profile ? `Tone rules: ${profile.toneRules}` : null,
        profile ? `Default CTA style: ${profile.defaultCtaStyle}` : null,
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
    case 'ugc_direct_response_ad':
      return [
        'Plan this as a short-form direct-response ad.',
        'Bias toward hook then pain then mechanism then proof then CTA, with product visibility early.',
        'Make the product readable early and make the proof or payoff obvious before the ending.',
        profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
        profile ? `Proof expectation: ${profile.proofExpectation}` : null,
        profile ? `Default CTA style: ${profile.defaultCtaStyle}` : null,
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
    case 'ugc_faceless_format':
      return [
        'Plan this as a faceless short-form format.',
        'Bias toward objects, process, screens, podcast-style framing, or demo loops with minimal face dependence.',
        'Prioritize process clarity and readable objects or screens over facial performance.',
        profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
        profile ? `Proof expectation: ${profile.proofExpectation}` : null,
        profile ? `Reference strategy: ${profile.referenceStrategy}` : null,
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
  }
}

function resolveAuthorshipArtStylePreset(input: {
  graphSettings?: Partial<CinematicPlan['graphSettings']> | null
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null
  projectArtStylePreset?: string | null
}) {
  const resolution = resolveArtStylePresetForCinematic({
    graphArtStylePreset: input.graphSettings?.artStylePreset ?? null,
    inferredGraphArtStylePreset: input.graphSettings?.inferredArtStylePreset ?? null,
    projectArtStylePreset: input.projectArtStylePreset ?? null,
    presetFamily: input.presetFamily,
    formatSubtype: input.formatSubtype,
    useInferredArtStyle: input.graphSettings?.useInferredArtStyle ?? true,
  })
  return resolution
}

function sharedUgcAuthorshipRules(
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  const profile = getUgcPresetProfile(formatSubtype)
  return [
    'Preset choice is the creative contract. Preserve the locked preset, subtype, formula, trigger, proof pattern, CTA style, contrast axis, and persona style instead of free-styling a generic ad.',
    'Identity protection comes before selling. Make the viewer feel accurately recognized before pushing the product.',
    'Self-relevance comes before solution language. Anchor the first beats in a behavior, pain, tension, or curiosity image the viewer instantly recognizes.',
    'Visible mechanism beats are better than abstract claims. When the preset expects proof, show the product, process, screen, or comparison doing something legible on screen.',
    'Use one clear attention device in the first frame: a confession, a mistake, a wrong belief, a concrete contrast, a taboo rupture, or a visually obvious proof setup.',
    'Keep the shots native to short-form mobile viewing: readable on mute, immediate, concrete, and visually distinct from one another.',
    'Do not let multiple middle shots restate the same point. Each middle beat should escalate through a new visible dimension such as time, money, stress, convenience, status, proof, or transformation.',
    profile?.proofExpectation ? `Proof contract: ${profile.proofExpectation}` : null,
    profile?.toneRules ? `Tone contract: ${profile.toneRules}` : null,
    profile?.pacingGuidance ? `Pacing contract: ${profile.pacingGuidance}` : null,
    profile?.referenceStrategy ? `Reference strategy: ${profile.referenceStrategy}` : null,
  ].filter((entry): entry is string => Boolean(entry))
}

function subtypeAuthorshipRules(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return [
        'Write this like real creator advice from lived experience, not like a polished brand spot.',
        'Hook with a recognizable pain confession or nightly pattern, then move into a protective explanation, a believable use case, a calmer payoff, and a soft recommendation.',
        'Give hook, setup, proof, and CTA beats actual spoken lines that sound like a person talking to camera.',
        'Do not make the creator sound like a hard closer before the final beat.',
      ]
    case 'creator_reframe':
      return [
        'Use the creator voice to remove shame or false interpretation, then replace it with a more accurate framing.',
        'The reframe should feel emotionally precise and relieving, not clever for its own sake.',
        'Dialogue should sound screenshot-worthy and intimate, not ad-polished.',
      ]
    case 'creator_validation':
      return [
        'Make validation the point of the script, not just the hook.',
        'Keep product language light and secondary unless the locked shot explicitly serves proof or CTA.',
        'Do not over-explain; let recognition and reassurance do most of the work.',
      ]
    case 'creator_serialized_drama':
      return [
        'Keep the structure readable as conflict, suffering, reveal, redemption.',
        'Open on the juicy rupture first. The product should arrive as the twist or the relief, not as early sponsor copy.',
        'Even when dialogue-led, every beat should still create a clear visual escalation.',
      ]
    case 'ad_problem_solution':
      return [
        'This is a direct-response flow: pain first, then solution, then visible proof, then CTA.',
        'Show the product or app doing the job in-frame before the ending. Do not leave proof as a verbal promise.',
        'Dialogue should support the visible proof path instead of carrying the whole persuasion burden.',
      ]
    case 'ad_mechanism_proof':
      return [
        'Make the hidden cause or mechanism legible in plain language, then demonstrate it on screen.',
        'Proof shots should show readable screens, steps, comparisons, or state changes, not generic “it works” language.',
        'Use the product as the explanation engine and the proof engine, not as a passive prop.',
      ]
    case 'ad_before_after':
      return [
        'Drive this with unmistakable before/after contrast. The state change should be obvious at a glance.',
        'Keep dialogue sparse and let the contrast carry the persuasion.',
      ]
    case 'ad_comparison':
      return [
        'Make the winning side obvious in each comparison beat.',
        'Do not repeat the same winner argument. Escalate through different visible proof dimensions.',
      ]
    case 'ad_trojan_horse_drama':
      return [
        'Use story tension as the delivery vehicle. Hold the conflict long enough that the reveal feels like relief.',
        'The product should visibly resolve the conflict, not just be mentioned after it.',
      ]
    case 'faceless_demo':
      return [
        'Keep this process-first and object-first. Screens, hands, packaging, and proof should do the storytelling.',
        'Avoid unnecessary direct-to-camera speech. If text is needed, keep it short and functional.',
      ]
    case 'faceless_explainer':
      return [
        'Structure it as wrong belief, simple explanation, visible mechanism, result.',
        'Keep the explanation clean and highly legible on mute.',
      ]
    case 'faceless_process':
      return [
        'Each shot should add a new visual stage of the process.',
        'Avoid redundant angles that repeat the same stage with different wording.',
      ]
    case 'faceless_serialized_drama':
      return [
        'Keep the absurd packaging obvious, but make the conflict, suffering, reveal, and redemption visually distinct.',
        'This should stay visual-first. Avoid turning it into a talk-heavy creator script.',
      ]
    case 'contrast_narrative':
      return [
        'Widen the gap across multiple visible dimensions, not just one repeated comparison.',
        'Most beats should work fully on mute and feel storyboard-clear.',
        'Use dialogue sparingly and only when it sharpens the contrast.',
      ]
    default:
      return presetFamily === 'ugc_creator'
        ? ['Creator-native outputs need believable spoken language and identity-safe tone.']
        : presetFamily === 'ugc_direct_response_ad'
          ? ['Direct-response outputs need visible proof before the CTA.']
          : presetFamily === 'ugc_faceless_format'
            ? ['Faceless outputs need visual process clarity over face-led performance.']
            : []
  }
}

function roleAuthorshipRules(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  return [
    'Per-shot job contract:',
    'hook must create a stop-scroll attention device immediately through a confession, wrong belief, contrast, taboo rupture, or unmistakable problem image.',
    'setup must clarify the problem, belief, or frame without collapsing into generic summary language.',
    'proof must show visible evidence, mechanism, product function, screen interaction, comparison state, or concrete behavioral change in frame.',
    'payoff must show the changed state as something visible and credible, not just a promised feeling.',
    'cta must obey the preset tone. Creator CTAs stay soft and friend-like. Direct-response CTAs can be clearer but only after proof. Faceless CTAs should stay visual and brief.',
    presetFamily === 'ugc_creator'
      ? 'For creator shots with hook, setup, proof, or cta roles, include at least one spoken dialogue line and at least one visible action beat.'
      : null,
    presetFamily === 'ugc_direct_response_ad'
      ? 'For direct-response proof shots, include at least one visible action beat showing the product, app, or mechanism doing something specific.'
      : null,
    presetFamily === 'ugc_faceless_format'
      ? 'For faceless shots, avoid direct-to-camera creator performance unless the locked subtype explicitly depends on it. Prefer hands, objects, screens, tabletop process, or staged proof.'
      : null,
    formatSubtype === 'contrast_narrative'
      ? 'Contrast-narrative middle beats must escalate through new visible dimensions instead of repeating the same comparison.'
      : null,
  ].filter((entry): entry is string => Boolean(entry))
}

function authorshipGoodBadExamples(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  const examples: string[] = []
  if (presetFamily === 'ugc_creator') {
    examples.push('Creator dialogue example: bad = "She explains the app helps with stress." good = "If this is the hour where you always feel like you need something to take the edge off, you are not weak."')
  }
  if (formatSubtype === 'ad_mechanism_proof' || presetFamily === 'ugc_direct_response_ad') {
    examples.push('Mechanism proof example: bad = "The app works and makes her calmer." good = "She opens the app and the screen maps the evening stress loop, then starts a guided reset so the mechanism is visible in-frame."')
  }
  if (presetFamily === 'ugc_faceless_format') {
    examples.push('Faceless example: bad = "A creator talks to camera about the workflow." good = "Hands move through the workflow on screen while short overlay or sparse narration labels the mistake and the fix."')
  }
  return examples
}

export const cinematicIntentSchema = z.object({
  plannerMode: z.enum(['world_build', 'cinematic_build']),
  reason: z.string().default(''),
})

export const cinematicEntityExtractionSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

export const cinematicPlannerRawSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  graphName: z.string(),
  graphSummary: z.string(),
  rawScriptMarkdown: z.string().default(''),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  sequence: cinematicSequenceSchema.nullable().default(null),
  scriptDoc: cinematicScriptDocSchema.nullable().default(null),
  relationshipRefs: z.array(cinematicRelationshipSchema).default([]),
  compositeRefPlans: z.array(cinematicCompositeRefPlanSchema).default([]),
  storyboardPlan: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotPlanSchema).default([]),
  graphSettings: cinematicGraphSettingsSchema,
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

function slugSeed(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeEntityKind(value: unknown, fallback: 'character' | 'environment' | 'item' = 'item') {
  if (typeof value !== 'string') return fallback
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('environment') || normalized.includes('location') || normalized.includes('setting') || normalized.includes('temple')) {
    return 'environment' as const
  }
  if (normalized.includes('character') || normalized.includes('fighter') || normalized.includes('person') || normalized.includes('hero') || normalized.includes('villain')) {
    return 'character' as const
  }
  if (normalized.includes('item') || normalized.includes('prop') || normalized.includes('weapon') || normalized.includes('sword')) {
    return 'item' as const
  }
  return fallback
}

function inferEntityKindFromRole(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = normalizeMatchKey(value)
  if (!normalized) return null
  if (
    normalized.includes('location')
    || normalized.includes('setting')
    || normalized.includes('place')
    || normalized.includes('scene')
    || normalized.includes('background')
    || normalized.includes('environment')
  ) {
    return 'environment' as const
  }
  if (
    normalized.includes('participant')
    || normalized.includes('speaker')
    || normalized.includes('actor')
    || normalized.includes('target')
    || normalized.includes('lead')
    || normalized.includes('hero')
    || normalized.includes('villain')
    || normalized.includes('opponent')
  ) {
    return 'character' as const
  }
  if (
    normalized.includes('prop')
    || normalized.includes('weapon')
    || normalized.includes('item')
    || normalized.includes('object')
    || normalized.includes('gear')
  ) {
    return 'item' as const
  }
  return null
}

function normalizeShotType(value: unknown) {
  if (typeof value !== 'string') return 'custom' as const
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('establish')) return 'establishing' as const
  if (normalized.includes('dialog')) return 'dialogue' as const
  if (normalized.includes('reveal')) return 'reveal' as const
  if (normalized.includes('action') || normalized.includes('fight') || normalized.includes('combat')) return 'action' as const
  if (normalized.includes('insert') || normalized.includes('detail')) return 'insert' as const
  if (normalized.includes('transition')) return 'transition' as const
  return 'custom' as const
}

function parseNullableEnumValue<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = schema.safeParse(trimmed)
  if (parsed.success) return parsed.data
  const schemaOptions = (schema as { options?: string[] }).options
  if (!Array.isArray(schemaOptions)) return null
  const normalizeEnumAlias = (input: string) => normalizeMatchKey(
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b(?:formula|family|trigger|dominant|primary|planned|script|style)\b/gi, ' ')
  ).replace(/\s+/g, ' ').trim()
  const normalized = normalizeEnumAlias(trimmed)
  const matched = schemaOptions.find((option) => normalizeEnumAlias(option) === normalized)
  if (!matched) return null
  const reparsed = schema.safeParse(matched)
  return reparsed.success ? reparsed.data : null
}

function normalizePromptTextForStoryboard(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function containsExplicitTimingLanguage(value: string) {
  const normalized = value.toLowerCase()
  return (
    /\b\d+\s*(?:s|sec|secs|second|seconds)\b/.test(normalized)
    || /\b(?:for|within|over)\s+\d+\s*(?:s|sec|secs|second|seconds)\b/.test(normalized)
    || /\b(?:linger|lingers|brief|briefly|quick beat|quickly|pause|hold for)\b/.test(normalized)
  )
}

function normalizePlannerShotDuration(input: {
  promptText: string
  beat: string
  durationSeconds: number | null
}) {
  if (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds)) return null
  const explicit = containsExplicitTimingLanguage(input.promptText) || containsExplicitTimingLanguage(input.beat)
  return explicit ? Math.min(15, Math.max(1, Math.round(input.durationSeconds))) : null
}

function splitPromptIntoTemporalSegments(value: string) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const segmented = cleaned
    .replace(/\b(?:and then|then)\b/gi, ' || ')
    .replace(/\b(?:finally|ultimately)\b/gi, ' || ')
    .replace(/\b(?:at the end|in the end|by the end)\b/gi, ' || ')
    .replace(/\b(?:ending with|ending on)\b/gi, ' || ')
    .replace(/\b(?:escalating until|building until|leading to)\b/gi, ' || ')
    .replace(/\buntil\b/gi, ' || ')

  return segmented
    .split('||')
    .map((entry) => entry.trim().replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, ''))
    .filter((entry) => entry.length > 0)
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(' ')
}

function deriveFallbackShotTitle(segment: string, index: number, total: number) {
  const normalized = normalizeMatchKey(segment)
  if (normalized.includes('slap')) return 'The Slap'
  if (normalized.includes('warning') || normalized.includes('threat')) return 'Cold Warning'
  if (normalized.includes('mock') || normalized.includes('retort')) return 'Mocking Reply'
  if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) return 'Rising Standoff'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse')) {
    return normalized.includes('table') ? 'Table Accusation' : 'Heated Exchange'
  }
  if (normalized.includes('tavern') || normalized.includes('interior')) return 'Tavern Tension'

  const compact = segment
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
  if (compact) {
    const words = compact.split(/\s+/).slice(0, 4).join(' ')
    if (words) return titleCaseWords(words)
  }

  if (index === 0 && total > 1) return 'Opening Beat'
  if (index === total - 1 && total > 1) return 'Closing Beat'
  return `Beat ${index + 1}`
}

function deriveMarkdownShotTitle(action: string, index: number) {
  const firstSentence = action
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
    ?? action.trim()
  return deriveFallbackShotTitle(firstSentence, index, 8)
}

function normalizeMarkdownShotRole(
  rawRole: string,
  shotIndex: number,
  shotCount: number,
): z.infer<typeof cinematicHookRoleSchema> | null {
  const parsed = parseNullableEnumValue(cinematicHookRoleSchema, rawRole)
  if (parsed) return parsed
  const normalized = normalizeMatchKey(rawRole)
  if (!normalized) {
    if (shotIndex === 0) return 'hook'
    if (shotIndex === shotCount - 1) return 'payoff'
    return null
  }
  if (/\b(hook|open|opening|intro|attention|pattern interrupt)\b/.test(normalized)) return 'hook'
  if (/\b(setup|support|context|pain|problem|struggle|start|beginning)\b/.test(normalized)) return 'setup'
  if (/\b(proof|escalation|mechanism|demo|demonstration|evidence|comparison|contrast|reveal)\b/.test(normalized)) return 'proof'
  if (/\b(payoff|ending|end frame|final|result|resolution|winner)\b/.test(normalized)) return 'payoff'
  if (/\b(cta|call to action|offer|close)\b/.test(normalized)) return 'cta'
  if (shotIndex === 0) return 'hook'
  if (shotIndex === shotCount - 1) return 'payoff'
  return null
}

export function resolveTargetShotCount(promptText: string, formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  const normalized = normalizeMatchKey(promptText)
  const explicitMatch = normalized.match(/\b(\d+)\s+(?:scene|scenes|shot|shots|beat|beats)\b/)
  const explicitCount = explicitMatch ? Number(explicitMatch[1]) : null
  if (explicitCount && Number.isFinite(explicitCount)) {
    return Math.min(10, Math.max(4, Math.round(explicitCount)))
  }
  if (formatSubtype === 'contrast_narrative') return 8
  if (
    formatSubtype === 'creator_serialized_drama'
    || formatSubtype === 'ad_trojan_horse_drama'
    || formatSubtype === 'faceless_serialized_drama'
  ) return 5
  if (formatSubtype === 'creator_validation' || formatSubtype === 'creator_reframe') return 4
  return 5
}

function parseMarkdownRefIds(value: string, entityLookup: EntityLookup) {
  return Array.from(new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => resolveEntityRefId(entry, entityLookup))
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ))
}

function buildDerivedScenesFromMarkdownShots(shots: Array<{
  id: string
  title: string
  locationRefId: string | null
}>) {
  const scenes: Array<{
    id: string
    title: string
    summary: string
    locationRefId: string | null
    shotIds: string[]
    continuityNotes: string
    orderIndex: number
  }> = []
  for (const shot of shots) {
    const previousScene = scenes[scenes.length - 1] ?? null
    if (previousScene && previousScene.locationRefId === shot.locationRefId) {
      previousScene.shotIds.push(shot.id)
      continue
    }
    scenes.push({
      id: `scene_${scenes.length + 1}`,
      title: `Scene ${scenes.length + 1}`,
      summary: shot.title,
      locationRefId: shot.locationRefId,
      shotIds: [shot.id],
      continuityNotes: '',
      orderIndex: scenes.length,
    })
  }
  return scenes
}

function parseShotBlockMarkdown(input: {
  markdown: string
  graphName: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    role: string
    sourceName: string
    summary: string
    resolution: 'existing' | 'create'
    definitionKey?: string | null
    planItemId?: string | null
  }>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null
  formulaFamily: z.infer<typeof cinematicFormulaFamilySchema> | null
  dominantTrigger: z.infer<typeof cinematicDominantTriggerSchema> | null
  promptText: string
}) {
  const diagnostics: string[] = []
  const markdown = input.markdown.replace(/\r\n/g, '\n').trim()
  if (!markdown) {
    diagnostics.push('Markdown script output was empty.')
    return { diagnostics, title: input.graphName, logline: input.graphSummary, tone: '', shots: [] as Array<Record<string, unknown>> }
  }

  const entityLookup = createEntityLookup(input.entityRefs)
  const lines = markdown.split('\n')
  let title = input.graphName
  let logline = input.graphSummary
  let tone = ''
  let inReferences = false
  let currentShotNumber: number | null = null
  let currentField: 'action' | 'dialogue' | 'overlay' | 'composition' | null = null
  const shotBlocks: Array<{
    number: number
    role: string
    environment: string
    characters: string
    props: string
    action: string
    composition: string
    dialogueLines: string[]
    narratorOverlayLines: string[]
  }> = []
  let currentShot: (typeof shotBlocks)[number] | null = null

  const flushCurrentShot = () => {
    if (!currentShot) return
    shotBlocks.push(currentShot)
    currentShot = null
    currentShotNumber = null
    currentField = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      currentField = currentField === 'dialogue' ? 'dialogue' : null
      continue
    }
    if (line.startsWith('# ')) {
      title = line.slice(2).trim() || title
      continue
    }
    if (/^Logline:/i.test(line)) {
      logline = line.replace(/^Logline:/i, '').trim() || logline
      continue
    }
    if (/^Tone:/i.test(line)) {
      tone = line.replace(/^Tone:/i, '').trim()
      continue
    }
    if (/^##\s*References\b/i.test(line)) {
      flushCurrentShot()
      inReferences = true
      continue
    }
    const shotHeading = line.match(/^##\s*Shot\s+(\d+)\b/i)
    if (shotHeading) {
      flushCurrentShot()
      inReferences = false
      currentShotNumber = Number(shotHeading[1])
      currentShot = {
        number: currentShotNumber,
        role: '',
        environment: '',
        characters: '',
        props: '',
        action: '',
        composition: '',
        dialogueLines: [],
        narratorOverlayLines: [],
      }
      continue
    }
    if (inReferences) {
      continue
    }
    if (!currentShot) continue
    if (/^Role:/i.test(line)) {
      currentShot.role = line.replace(/^Role:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Environment:/i.test(line)) {
      currentShot.environment = line.replace(/^Environment:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Characters:/i.test(line)) {
      currentShot.characters = line.replace(/^Characters:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Props:/i.test(line)) {
      currentShot.props = line.replace(/^Props:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Action:/i.test(line)) {
      currentShot.action = line.replace(/^Action:/i, '').trim()
      currentField = 'action'
      continue
    }
    if (/^Composition:/i.test(line)) {
      currentShot.composition = line.replace(/^Composition:/i, '').trim()
      currentField = 'composition'
      continue
    }
    if (/^Narrator Overlay:/i.test(line)) {
      const inline = line.replace(/^Narrator Overlay:/i, '').trim()
      if (inline) currentShot.narratorOverlayLines.push(inline)
      currentField = 'overlay'
      continue
    }
    if (/^Dialogue:/i.test(line)) {
      currentField = 'dialogue'
      continue
    }
    if ((currentField === 'dialogue' || currentField === 'overlay') && /^-\s+/.test(line)) {
      const entry = line.replace(/^-\s+/, '').trim()
      if (currentField === 'dialogue') currentShot.dialogueLines.push(entry)
      else currentShot.narratorOverlayLines.push(entry)
      continue
    }
    if (currentField === 'action') {
      currentShot.action = [currentShot.action, line].filter(Boolean).join(' ').trim()
      continue
    }
    if (currentField === 'overlay') {
      currentShot.narratorOverlayLines = [
        ...currentShot.narratorOverlayLines,
        line,
      ].filter(Boolean)
      continue
    }
    if (currentField === 'composition') {
      currentShot.composition = [currentShot.composition, line].filter(Boolean).join(' ').trim()
      continue
    }
  }
  flushCurrentShot()

  const seenNumbers = new Set<number>()
  const shots = shotBlocks
    .filter((shot) => {
      if (seenNumbers.has(shot.number)) {
        diagnostics.push(`Duplicate shot number ${shot.number} was dropped.`)
        return false
      }
      seenNumbers.add(shot.number)
      return true
    })
    .map((shot, index) => {
      const locationRefId = (() => {
        const resolved = shot.environment ? resolveEntityRefId(shot.environment, entityLookup) : null
        if (!resolved && shot.environment) diagnostics.push(`Shot ${shot.number} referenced unknown environment "${shot.environment}".`)
        return resolved
      })()
      const participantRefIds = parseMarkdownRefIds(shot.characters, entityLookup)
      if (shot.characters && participantRefIds.length === 0) diagnostics.push(`Shot ${shot.number} did not resolve any character ids from "${shot.characters}".`)
      const propRefIds = parseMarkdownRefIds(shot.props, entityLookup)
      const hookRole = normalizeMarkdownShotRole(shot.role, index, shotBlocks.length)
      if (shot.role.trim() && !parseNullableEnumValue(cinematicHookRoleSchema, shot.role) && hookRole) {
        diagnostics.push(`Shot ${shot.number} role "${shot.role}" was normalized to "${hookRole}".`)
      }
      const dialogue = shot.dialogueLines.map((entry, dialogueIndex) => {
        const match = entry.match(/^([a-zA-Z0-9_\-]+)\s*:\s*["“]?(.+?)["”]?$/)
        if (!match) {
          diagnostics.push(`Shot ${shot.number} dialogue line ${dialogueIndex + 1} could not be parsed and was dropped.`)
          return null
        }
        const speakerRefId = resolveEntityRefId(match[1], entityLookup)
        if (!speakerRefId) {
          diagnostics.push(`Shot ${shot.number} dialogue line ${dialogueIndex + 1} referenced unknown speaker "${match[1]}".`)
          return null
        }
        return {
          id: `dialogue_${index + 1}_${dialogueIndex + 1}`,
          speakerRefId,
          line: match[2].trim(),
          delivery: '',
          startSeconds: null,
          endSeconds: null,
          lipSync: true,
        }
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      const narratorOverlayAudio = shot.narratorOverlayLines
        .map((entry, overlayIndex) => entry.trim())
        .filter(Boolean)
        .map((entry, overlayIndex) => ({
          id: `overlay_${index + 1}_${overlayIndex + 1}`,
          kind: 'offscreen' as const,
          cue: entry,
          sourceRefId: null,
          startSeconds: null,
          endSeconds: null,
        }))
      if (!locationRefId) diagnostics.push(`Shot ${shot.number} is missing a valid Environment field.`)
      if (participantRefIds.length === 0) diagnostics.push(`Shot ${shot.number} is missing valid Characters.`)
      if (!shot.action.trim()) diagnostics.push(`Shot ${shot.number} is missing Action.`)
      return {
        id: `shot_${index + 1}`,
        title: deriveMarkdownShotTitle(shot.action, index),
        hookRole,
        formatSubtype: input.formatSubtype,
        formulaFamily: input.formulaFamily,
        dominantTrigger: input.dominantTrigger,
        hookType: '',
        targetEmotion: '',
        personaStyle: '',
        contrastAxis: '',
        proofMoment: '',
        ctaStyle: '',
        proofType: '',
        ctaType: '',
        platformTarget: null,
        participantRefIds,
        locationRefId,
        propRefIds,
        shotType: normalizeShotType(shot.role || shot.action),
        framing: '',
        cameraAngle: '',
        cameraMovement: '',
        lensPreference: '',
        durationSeconds: null,
        visualPrompt: '',
        compositionGuide: shot.composition.trim(),
        beat: shot.action.trim(),
        beats: [],
        dialogue,
        actions: [],
        audio: narratorOverlayAudio,
      }
    })
    .filter((shot) => shot.beat.length > 0)

  return { diagnostics, title, logline, tone, shots }
}

function inferShotTypeFromBeat(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (!normalized) return 'custom' as const
  if (
    normalized.includes('argument')
    || normalized.includes('argue')
    || normalized.includes('confront')
    || normalized.includes('exchange')
    || normalized.includes('retort')
    || normalized.includes('shout')
    || normalized.includes('yell')
    || normalized.includes('accuse')
  ) {
    return 'dialogue' as const
  }
  if (
    normalized.includes('slap')
    || normalized.includes('strike')
    || normalized.includes('hit')
    || normalized.includes('attack')
    || normalized.includes('fight')
    || normalized.includes('punch')
    || normalized.includes('grab')
  ) {
    return 'action' as const
  }
  if (
    normalized.includes('inside')
    || normalized.includes('tavern')
    || normalized.includes('establish')
    || normalized.includes('room')
    || normalized.includes('interior')
    || normalized.includes('outside')
    || normalized.includes('street')
  ) {
    return 'establishing' as const
  }
  return 'custom' as const
}

function inferActionVerb(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap')) return 'slaps'
  if (normalized.includes('punch')) return 'punches'
  if (normalized.includes('hit')) return 'hits'
  if (normalized.includes('strike')) return 'strikes'
  if (normalized.includes('fight')) return 'fights'
  if (normalized.includes('grab')) return 'grabs'
  if (normalized.includes('shove')) return 'shoves'
  if (normalized.includes('draw')) return 'draws weapon'
  return normalized.includes('argu') || normalized.includes('confront') ? 'confronts' : 'acts'
}

function inferDialogueDelivery(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap') || normalized.includes('fight') || normalized.includes('yell')) return 'sharp and explosive'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('confront')) return 'heated and escalating'
  return 'tense and controlled'
}

function buildEntityNameAliases(sourceName: string) {
  const aliases = new Set<string>()
  const raw = sourceName.trim()
  if (!raw) return []
  aliases.add(raw)
  const beforeComma = raw.split(',')[0]?.trim()
  if (beforeComma) aliases.add(beforeComma)
  const words = raw.split(/\s+/).filter(Boolean)
  if (words[0]) aliases.add(words[0])
  return [...aliases]
    .map((entry) => normalizeMatchKey(entry))
    .filter((entry) => entry.length > 1)
}

function isIncidentalPropName(value: string) {
  return [
    'table',
    'chair',
    'stool',
    'bench',
    'bar',
    'counter',
    'mug',
    'cup',
    'glass',
    'bottle',
    'plate',
    'bowl',
  ].includes(normalizeMatchKey(value))
}

function promptMakesPropHero(promptText: string, propName: string) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const normalizedProp = normalizeMatchKey(propName)
  if (!normalizedPrompt || !normalizedProp) return false
  return [
    `use ${normalizedProp}`,
    `uses ${normalizedProp}`,
    `using ${normalizedProp}`,
    `with ${normalizedProp}`,
    `grab ${normalizedProp}`,
    `grabs ${normalizedProp}`,
    `draw ${normalizedProp}`,
    `draws ${normalizedProp}`,
    `throw ${normalizedProp}`,
    `throws ${normalizedProp}`,
    `smash ${normalizedProp}`,
    `smashes ${normalizedProp}`,
    `${normalizedProp} in hand`,
  ].some((pattern) => normalizedPrompt.includes(pattern))
}

function normalizeVerbRoot(value: string) {
  const normalized = normalizeMatchKey(value)
  if (normalized.endsWith('es')) return normalized.slice(0, -2)
  if (normalized.endsWith('s')) return normalized.slice(0, -1)
  return normalized
}

export function inferPromptDirectedActionBinding(
  promptText: string,
  verb: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const verbRoot = normalizeVerbRoot(verb)
  if (!normalizedPrompt || !verbRoot || participants.length < 2) return null

  const verbTokens = Array.from(new Set([verbRoot, `${verbRoot}s`, `${verbRoot}es`]))
  let bestMatch: { actorRefId: string; targetRefId: string; score: number } | null = null

  for (const actor of participants) {
    for (const target of participants) {
      if (actor.id === target.id) continue
      for (const actorAlias of buildEntityNameAliases(actor.sourceName)) {
        for (const targetAlias of buildEntityNameAliases(target.sourceName)) {
          const actorIndex = normalizedPrompt.indexOf(actorAlias)
          const targetIndex = normalizedPrompt.indexOf(targetAlias)
          if (actorIndex === -1 || targetIndex === -1 || actorIndex >= targetIndex) continue
          for (const verbToken of verbTokens) {
            const verbIndex = normalizedPrompt.indexOf(verbToken, actorIndex)
            if (verbIndex === -1 || verbIndex >= targetIndex) continue
            const score = (targetIndex - actorIndex) - Math.abs((verbIndex - actorIndex) - (targetIndex - verbIndex))
            if (!bestMatch || score < bestMatch.score) {
              bestMatch = { actorRefId: actor.id, targetRefId: target.id, score }
            }
          }
        }
      }
    }
  }

  return bestMatch
    ? { actorRefId: bestMatch.actorRefId, targetRefId: bestMatch.targetRefId }
    : null
}

function isGenericShotTitle(title: string) {
  const normalized = normalizeMatchKey(title)
  return [
    'shot 1',
    'shot 2',
    'shot 3',
    'beat 1',
    'beat 2',
    'beat 3',
    'primary beat',
    'opening beat',
    'closing beat',
    'opening exchange',
    'escalation',
    'final beat',
  ].includes(normalized)
}

function beatLooksLikePromptEcho(beat: string, promptText: string) {
  const normalizedBeat = normalizeMatchKey(beat)
  const normalizedPrompt = normalizeMatchKey(promptText)
  if (!normalizedBeat || !normalizedPrompt) return false
  if (normalizedBeat.length < 40) return false
  return normalizedPrompt.includes(normalizedBeat) || normalizedBeat.includes(normalizedPrompt.slice(0, Math.min(normalizedPrompt.length, 80)))
}

function dialogueLooksLikePlaceholder(line: string, speakerName: string) {
  const normalizedLine = normalizeMatchKey(line)
  const speakerAliases = buildEntityNameAliases(speakerName)
  if (!normalizedLine) return true
  if (speakerAliases.some((alias) => normalizedLine.startsWith(alias))) return true
  return [
    'delivers a cutting accusation',
    'fires back with a hard retort',
    'issues a warning',
    'mocking reply',
    'placeholder',
    'line of dialogue',
  ].some((pattern) => normalizedLine.includes(pattern))
}

function beatLooksLikeStructuralPlaceholder(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (!normalized) return true
  return [
    'hook',
    'setup',
    'proof',
    'payoff',
    'cta',
    'problem',
    'solution',
    'personal problem',
    'use case',
    'soft proof',
    'soft cta',
    'reframe',
    'validation',
    'mechanism',
    'comparison',
  ].includes(normalized)
}

function beatLooksUnderwritten(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (!normalized) return true
  if (beatLooksLikeStructuralPlaceholder(beat)) return true
  return normalized.split(/\s+/).filter(Boolean).length < 6
}

function findParticipantByMention(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedBeat = normalizeMatchKey(beat)
  if (!normalizedBeat) return null
  return participants.find((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName))) ?? null
}

function inferActorTargetFromBeat(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  if (participants.length === 0) return { actorRefId: null, targetRefId: null }
  if (participants.length === 1) return { actorRefId: participants[0].id, targetRefId: null }

  const promptDirectedBinding = inferPromptDirectedActionBinding(beat, inferActionVerb(beat), participants)
  if (promptDirectedBinding) {
    return promptDirectedBinding
  }

  const normalizedBeat = normalizeMatchKey(beat)
  const mentionedParticipants = participants.filter((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName)))
  if (mentionedParticipants.length >= 2) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: mentionedParticipants[1].id,
    }
  }
  if (mentionedParticipants.length === 1) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: participants.find((participant) => participant.id !== mentionedParticipants[0].id)?.id ?? null,
    }
  }
  return {
    actorRefId: participants[0].id,
    targetRefId: participants[1]?.id ?? null,
  }
}

export function shotImpliesDialogue(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'dialogue',
    'argument',
    'argue',
    'verbal',
    'exchange',
    'retort',
    'mock',
    'warning',
    'warn',
    'accuse',
    'confront',
    'threat',
    'threaten',
    'taunt',
    'insult',
    'reply',
  ].some((token) => normalized.includes(token))
}

export function shotImpliesAction(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'action',
    'fight',
    'combat',
    'slap',
    'strike',
    'hit',
    'punch',
    'attack',
    'grab',
    'shove',
    'circle',
    'circling',
    'rise',
    'rises',
    'stand',
    'standoff',
    'confront',
  ].some((token) => normalized.includes(token))
}

export function buildFallbackDialogueBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length < 2
    || !shotImpliesDialogue({ beat: input.beat })
  ) {
    return []
  }

  const [firstParticipant, secondParticipant] = input.participants
  let firstLine = 'You keep talking like the room will save you.'
  let secondLine = 'No. The room just gives everyone a better view of your mistake.'

  if (normalized.includes('warning') || normalized.includes('threat')) {
    firstLine = 'Take one more step and you will regret it.'
    secondLine = 'That is not a warning. It is a promise.'
  } else if (normalized.includes('mock') || normalized.includes('retort') || normalized.includes('sneer')) {
    firstLine = 'That is your answer? I expected sharper steel from you.'
    secondLine = 'And I expected a better threat than borrowed noise.'
  } else if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse') || normalized.includes('confront')) {
    firstLine = 'You always mistake noise for strength.'
    secondLine = 'And you always mistake silence for surrender.'
  } else if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) {
    firstLine = 'Then stand up and say it where I can see your spine.'
    secondLine = 'Gladly. I was getting tired of hearing you sit down.'
  }

  return [
    {
      id: `${input.shotId}_dialogue_1`,
      speakerRefId: firstParticipant.id,
      line: firstLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
    {
      id: `${input.shotId}_dialogue_2`,
      speakerRefId: secondParticipant.id,
      line: secondLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
  ]
}

export function buildFallbackActionBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
  propRefIds: string[]
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length === 0
    || !shotImpliesAction({ beat: input.beat })
  ) {
    return []
  }

  const actorTarget = inferActorTargetFromBeat(input.beat, input.participants)
  return [{
    id: `${input.shotId}_action_1`,
    actorRefId: actorTarget.actorRefId,
    targetRefId: actorTarget.targetRefId,
    verb: inferActionVerb(input.beat),
    propRefId: input.propRefIds[0] ?? null,
    stagingNotes: '',
    startSeconds: null,
    endSeconds: null,
  }]
}

export function buildFallbackAudioBeats(input: {
  shotId: string
  beat: string
  locationRefId: string | null
}) {
  const normalized = normalizeMatchKey(input.beat)
  const audio = []
  if (input.locationRefId) {
    audio.push({
      id: `${input.shotId}_audio_ambience`,
      kind: 'ambience' as const,
      cue: normalized.includes('tavern') ? 'Busy tavern room tone under the scene.' : 'Location ambience under the scene.',
      sourceRefId: input.locationRefId,
      startSeconds: null,
      endSeconds: null,
    })
  }
  if (normalized.includes('slap')) {
    audio.push({
      id: `${input.shotId}_audio_sfx`,
      kind: 'sfx' as const,
      cue: 'Sharp slap impact punctuates the beat.',
      sourceRefId: null,
      startSeconds: null,
      endSeconds: null,
    })
  }
  return audio
}

type EntityLookup = {
  byId: Map<string, string>
  byDefinitionKey: Map<string, string>
  byNormalizedName: Map<string, string>
  byNormalizedDefinitionKey: Map<string, string>
}

function createEntityLookup(entityRefs: Array<{
  id: string
  sourceName: string
  definitionKey?: string | null
}>) {
  const lookup: EntityLookup = {
    byId: new Map(),
    byDefinitionKey: new Map(),
    byNormalizedName: new Map(),
    byNormalizedDefinitionKey: new Map(),
  }

  for (const entityRef of entityRefs) {
    registerEntityLookupEntry(lookup, entityRef)
  }

  return lookup
}

function registerEntityLookupEntry(
  lookup: EntityLookup,
  entityRef: {
    id: string
    sourceName: string
    definitionKey?: string | null
  },
) {
  lookup.byId.set(entityRef.id, entityRef.id)
  const normalizedName = normalizeMatchKey(entityRef.sourceName)
  if (normalizedName) {
    lookup.byNormalizedName.set(normalizedName, entityRef.id)
  }
  if (typeof entityRef.definitionKey === 'string' && entityRef.definitionKey.trim()) {
    lookup.byDefinitionKey.set(entityRef.definitionKey, entityRef.id)
    const normalizedDefinitionKey = normalizeMatchKey(entityRef.definitionKey)
    if (normalizedDefinitionKey) {
      lookup.byNormalizedDefinitionKey.set(normalizedDefinitionKey, entityRef.id)
    }
  }
}

function resolveEntityRefId(value: unknown, lookup: EntityLookup) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (lookup.byId.has(trimmed)) return lookup.byId.get(trimmed) ?? null
  if (lookup.byDefinitionKey.has(trimmed)) return lookup.byDefinitionKey.get(trimmed) ?? null
  const normalized = normalizeMatchKey(trimmed)
  if (!normalized) return null
  return lookup.byNormalizedName.get(normalized)
    ?? lookup.byNormalizedDefinitionKey.get(normalized)
    ?? null
}

function collectNamedRefs(
  value: unknown,
  entityLookup: EntityLookup,
) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return resolveEntityRefId(entry, entityLookup)
      }
      const record = asRecord(entry)
      if (!record) return null
      const candidate = pickFirstString(record, ['id', 'refId', 'entityRefId', 'sourceRefId', 'definitionKey', 'sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!candidate) return null
      return resolveEntityRefId(candidate, entityLookup)
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function collectNamedLabels(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      const record = asRecord(entry)
      if (!record) return ''
      return pickFirstString(record, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
    })
    .filter((entry) => entry.length > 0)
}

function coerceArrayWithSchema<TOutput>(value: unknown, schema: z.ZodType<TOutput>) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => schema.safeParse(entry))
    .filter((entry): entry is { success: true; data: TOutput } => entry.success)
    .map((entry) => entry.data)
}

function sanitizeNarrativeSummaryText(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^generate the cinematic script and graph from the resolved prompt/i.test(trimmed)) return ''
  if (/^prompt:/i.test(trimmed)) return ''
  if (/^using these locked refs:/i.test(trimmed)) return ''
  return trimmed
}

function buildFallbackShot(input: {
  requestSummary: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    sourceName?: string
  }>
}) {
  const environmentRef = input.entityRefs.find((entry) => entry.kind === 'environment') ?? null
  const participantRefs = input.entityRefs.filter((entry) => entry.kind === 'character').map((entry) => ({
    id: entry.id,
    sourceName: entry.sourceName ?? entry.id,
  }))
  const participantRefIds = participantRefs.map((entry) => entry.id)
  const propRefIds = input.entityRefs.filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  const beat = input.graphSummary.trim() || input.requestSummary.trim() || 'Play the key cinematic beat described by the prompt.'
  const shotType = inferShotTypeFromBeat(beat)
  const dialogue = buildFallbackDialogueBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
  })
  const actions = buildFallbackActionBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
    propRefIds,
  })
  const audio = buildFallbackAudioBeats({
    shotId: 'shot_1',
    beat,
    locationRefId: environmentRef?.id ?? null,
  })

  return {
    id: 'shot_1',
    title: 'Primary beat',
    beat,
    participantRefIds,
    locationRefId: environmentRef?.id ?? null,
    propRefIds,
    shotType,
    framing: shotType === 'establishing' ? 'Wide establishing frame' : '',
    cameraAngle: '',
    cameraMovement: '',
    lensPreference: '',
    durationSeconds: null,
    visualPrompt: '',
    compositionGuide: [
      participantRefIds.length > 0 ? 'Keep the key participants clearly readable in the frame.' : null,
      environmentRef ? 'Anchor the shot in the planned environment.' : null,
      propRefIds.length > 0 ? 'Ensure the planned props are visibly present or actively used.' : null,
    ].filter(Boolean).join(' '),
    beats: [],
    dialogue,
    actions,
    audio,
  }
}

function promptSuggestsMultiBeatNarrative(promptText: string) {
  const normalized = normalizeMatchKey(promptText)
  if (!normalized) return false
  return (
    /\b\d+\s+(scene|scenes|beats|shots)\b/.test(normalized)
    || /\b(across|through)\s+\d+\b/.test(normalized)
    || /\b(split path|split screen|contrast narrative|parallel life|parallel paths|two versions|escalating scenes|gap widens|final payoff)\b/.test(normalized)
  )
}

function shotLooksLikeCatchAllSummary(shot: {
  title: string
  beat: string
  compositionGuide: string
}) {
  const title = normalizeMatchKey(shot.title)
  const beat = normalizeMatchKey(shot.beat)
  const composition = normalizeMatchKey(shot.compositionGuide)
  if (!beat) return false
  return (
    title === 'primary beat'
    || /\b(create|make)\s+a\s+native/.test(beat)
    || /\bthe script uses\b/.test(beat)
    || /\bkeep .* readable in every beat\b/.test(beat)
    || /\bescalate from\b/.test(beat)
    || /\bfinal payoff frame\b/.test(beat)
    || /\bplanned props are visibly present\b/.test(composition)
  )
}

function buildContrastNarrativeFallbackSegments(promptText: string) {
  const normalized = normalizeMatchKey(promptText)
  const lower = normalized.toLowerCase()
  const prefersMealPrep = /\bmeal prep|mealprep|lunch|takeout|missed meals|budgeting app|budget app|prep\b/.test(lower)
  if (!/\bcontrast narrative|split path|split screen|parallel life|parallel paths|two versions|chaotic|organized|vs|versus\b/.test(lower) && !prefersMealPrep) {
    return []
  }
  if (prefersMealPrep) {
    return [
      'Split-screen hook: chaotic version opens an empty fridge and looks stressed while organized version checks the meal-prep app and sees the day already planned.',
      'Chaotic version rushes out the door and realizes breakfast or lunch is missing; organized version grabs a labeled container and leaves on time.',
      'Chaotic version scrolls takeout menus and sees prices stacking up; organized version follows the app meal plan and prep checklist.',
      'Chaotic version crashes at work hungry and distracted; organized version eats a ready lunch and keeps steady energy.',
      'Prep-night proof: organized version portions meals and checks steps off in the app while chaotic version stares at clutter and indecision.',
      'Lunch-break proof: chaotic version looks at another delivery receipt; organized version opens a prepared lunch in the workplace break area.',
      'Savings proof: chaotic version sees repeated small charges and clutter; organized version sees fewer purchases and a cleaner routine.',
      'Final payoff frame: chaotic version looks frazzled beside stacked receipts while organized version stands calm with lunch in hand and the app open as proof.',
    ]
  }
  return [
    'Split-screen hook that shows the two opposing paths clearly in one frame.',
    'First consequence on the weaker path and first visible advantage on the stronger path.',
    'The gap widens through money, time, or effort contrast.',
    'A clear mechanism or routine starts producing visible results on the stronger path.',
    'The weaker path shows stress, waste, or failure while the stronger path shows proof.',
    'The contrast escalates through another visible dimension such as energy, convenience, or status.',
    'A proof frame makes the winner state obvious without sound.',
    'Final payoff frame with the clearest winner image and strongest contrast.',
  ]
}

function expandTemporalShots(input: {
  shots: Array<{
    id: string
    title: string
    beat: string
    participantRefIds: string[]
    locationRefId: string | null
    propRefIds: string[]
    shotType: 'establishing' | 'dialogue' | 'reveal' | 'action' | 'insert' | 'transition' | 'custom'
    framing: string
    cameraAngle: string
    cameraMovement: string
    lensPreference: string
    durationSeconds: number | null
    visualPrompt: string
    compositionGuide: string
    beats: Array<z.infer<typeof cinematicBeatSchema>>
    dialogue: Array<z.infer<typeof dialogueBeatSchema>>
    actions: Array<z.infer<typeof actionBeatSchema>>
    audio: Array<z.infer<typeof audioBeatSchema>>
  }>
  promptText: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    sourceName: string
  }>
}) {
  const temporalSegments = splitPromptIntoTemporalSegments(input.promptText)
  const contrastSegments = buildContrastNarrativeFallbackSegments(input.promptText)
  const segments = temporalSegments.length >= 2 ? temporalSegments : contrastSegments
  const needsExpansion = input.shots.length === 1 && segments.length >= 2
  if (!needsExpansion) return input.shots

  const baseShot = input.shots[0]
  const participantRefs = input.entityRefs
    .filter((entry) => entry.kind === 'character' && baseShot.participantRefIds.includes(entry.id))
    .map((entry) => ({ id: entry.id, sourceName: entry.sourceName }))
  const expandedShots = segments.map((segment, index) => {
    const shotId = `shot_${index + 1}`
    const shotType = inferShotTypeFromBeat(segment)
    const dialogue = buildFallbackDialogueBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
    })
    const actions = buildFallbackActionBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
      propRefIds: baseShot.propRefIds,
    })
    const audio = buildFallbackAudioBeats({
      shotId,
      beat: segment,
      locationRefId: baseShot.locationRefId,
    })

    return {
      ...baseShot,
      id: shotId,
      title: deriveFallbackShotTitle(segment, index, segments.length),
      beat: segment,
      shotType,
      framing:
        shotType === 'establishing'
          ? 'Wide establishing frame'
          : shotType === 'dialogue'
            ? 'Medium two-shot'
            : shotType === 'action'
              ? 'Medium close action frame'
              : baseShot.framing,
      cameraMovement:
        shotType === 'action'
          ? 'Sharp push or snap movement into the action.'
          : shotType === 'dialogue'
            ? 'Controlled handheld drift between speakers.'
            : baseShot.cameraMovement,
      compositionGuide: segment,
      dialogue,
      actions,
      audio,
      beats: [
        ...dialogue.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'dialogue' as const,
          summary: entry.line,
          startSeconds: null,
          endSeconds: null,
        })),
        ...actions.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'action' as const,
          summary: entry.verb,
          startSeconds: null,
          endSeconds: null,
        })),
      ],
    }
  })

  return expandedShots
}

export function coerceCinematicEntityExtractionRaw(input: unknown) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'

  const rawEntityRefs = Array.isArray(record.entityRefs)
    ? record.entityRefs
    : Array.isArray(record.entities)
      ? record.entities
      : []

  const sectionEntityRefs = [
    ...(Array.isArray(record.characters)
      ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
      : []),
    ...(Array.isArray(record.environments)
      ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
      : []),
    ...(Array.isArray(record.items)
      ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
      : []),
  ]

  const entityRefs = [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined

  return cinematicEntityExtractionSchema.parse({
    requestSummary,
    entityRefs,
    diagnostics,
    assistantNotes,
  })
}

function sanitizeRelationshipRefs(
  relationships: Array<z.infer<typeof cinematicRelationshipSchema>>,
  entityLookup: EntityLookup,
) {
  return relationships
    .map((relationship) => {
      const sourceRefId = resolveEntityRefId(relationship.sourceRefId, entityLookup)
      const targetRefId = resolveEntityRefId(relationship.targetRefId, entityLookup)
      if (!sourceRefId || !targetRefId) return null
      return {
        ...relationship,
        sourceRefId,
        targetRefId,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

function sanitizeCompositeRefPlans(
  composites: Array<z.infer<typeof cinematicCompositeRefPlanSchema>>,
  entityLookup: EntityLookup,
) {
  return composites
    .map((composite) => {
      const sourceRefIds = Array.from(new Set(
        composite.sourceRefIds
          .map((entry) => resolveEntityRefId(entry, entityLookup))
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      ))
      if (sourceRefIds.length < 2) return null
      return {
        ...composite,
        sourceRefIds,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

type CoerceCinematicPlannerOptions = {
  lockedEntityRefs?: Array<z.infer<typeof cinematicEntityExtractionSchema>['entityRefs'][number]>
  allowEntityCreation?: boolean
  promptText?: string
  enableFallbackShaping?: boolean
}

export function coerceCinematicPlannerRaw(input: unknown, options: CoerceCinematicPlannerOptions = {}) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'
  const graphName = pickFirstString(record, ['graphName', 'name', 'title']) || 'Prompt Cinematic'
  const graphSummary = pickFirstString(record, ['graphSummary', 'summary', 'description']) || requestSummary
  const rawSequenceRecord = asRecord(record.sequence)
  const scriptRecord = asRecord(record.scriptDoc) ?? rawSequenceRecord ?? record
  const rawScriptMarkdown = asString(record.rawScriptMarkdown ?? record.scriptMarkdown)
  const lockedEntityRefs = options.lockedEntityRefs
    ? options.lockedEntityRefs.map((entry) => ({ ...entry }))
    : null
  const allowEntityCreation = options.allowEntityCreation ?? !lockedEntityRefs
  const enableFallbackShaping = options.enableFallbackShaping ?? true

  const rawEntityRefs = lockedEntityRefs
    ? []
    : (
      Array.isArray(record.entityRefs)
        ? record.entityRefs
        : Array.isArray(record.entities)
          ? record.entities
          : []
    )

  const sectionEntityRefs = lockedEntityRefs
    ? []
    : [
      ...(Array.isArray(record.characters)
        ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
        : []),
      ...(Array.isArray(record.environments)
        ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
        : []),
      ...(Array.isArray(record.items)
        ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
        : []),
    ]

  const entityRefs = lockedEntityRefs ?? [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      if (lockedEntityRefs) return entry
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const rawScenes = Array.isArray(rawSequenceRecord?.scenes)
    ? rawSequenceRecord.scenes
    : Array.isArray(scriptRecord.scenes)
      ? scriptRecord.scenes
      : []

  const rawShots = Array.isArray(rawSequenceRecord?.shots)
    ? rawSequenceRecord.shots
    : Array.isArray(scriptRecord.shots)
    ? scriptRecord.shots
    : Array.isArray(scriptRecord.beats)
      ? scriptRecord.beats
      : Array.isArray(scriptRecord.sequence)
        ? scriptRecord.sequence
          : []
  const sceneDerivedShots = rawShots.length === 0
    ? rawScenes.flatMap((entry, index) => {
      const scene = asRecord(entry)
      if (!scene) return []
      const sceneId = pickFirstString(scene, ['id', 'key']) || `scene_${index + 1}`
      const sceneTitle = pickFirstString(scene, ['title', 'name', 'label']) || `Scene ${index + 1}`
      const sceneLocation = pickFirstString(scene, ['locationRefId', 'location', 'environment', 'setting'])
      const sceneParticipants = scene.participantRefIds ?? scene.participants ?? scene.characters ?? scene.cast
      const sceneProps = scene.propRefIds ?? scene.props ?? scene.items
      const nestedShots = Array.isArray(scene.shots)
        ? scene.shots.map((candidate) => asRecord(candidate)).filter((candidate): candidate is Record<string, unknown> => candidate !== null)
        : []

      if (nestedShots.length > 0) {
        return nestedShots.map((nestedShot, nestedIndex) => ({
          ...nestedShot,
          id: pickFirstString(nestedShot, ['id', 'key']) || `${sceneId}_shot_${nestedIndex + 1}`,
          title: pickFirstString(nestedShot, ['title', 'name', 'label']) || `${sceneTitle} ${nestedIndex + 1}`,
          sceneId,
          location: pickFirstString(nestedShot, ['locationRefId', 'location', 'environment', 'setting']) || sceneLocation,
          participants: nestedShot.participantRefIds ?? nestedShot.participants ?? nestedShot.characters ?? nestedShot.cast ?? sceneParticipants,
          props: nestedShot.propRefIds ?? nestedShot.props ?? nestedShot.items ?? sceneProps,
        }))
      }

      const beat = pickFirstString(scene, ['summary', 'description', 'beat', 'script', 'action', 'text'])
      if (!beat) return []

      return [{
        id: `shot_${index + 1}`,
        title: sceneTitle,
        beat,
        sceneId,
        location: sceneLocation,
        participants: sceneParticipants,
        props: sceneProps,
        hookRole:
          index === 0
            ? 'hook'
            : index === rawScenes.length - 1
              ? 'payoff'
              : 'setup',
        shotType: normalizeShotType(scene.shotType ?? scene.type),
        framing: pickFirstString(scene, ['framing', 'frame', 'composition']),
        cameraAngle: pickFirstString(scene, ['cameraAngle', 'angle']),
        cameraMovement: pickFirstString(scene, ['cameraMovement', 'movement']),
        lensPreference: pickFirstString(scene, ['lensPreference', 'lens']),
        visualPrompt: pickFirstString(scene, ['visualPrompt', 'prompt', 'visualDescription']),
        compositionGuide: pickFirstString(scene, ['compositionGuide', 'blocking', 'sceneComposition', 'ingredientGuide', 'stagingNotes']),
        formatSubtype: pickFirstString(scene, ['formatSubtype']),
        formulaFamily: pickFirstString(scene, ['formulaFamily']),
        dominantTrigger: pickFirstString(scene, ['dominantTrigger']),
        hookType: pickFirstString(scene, ['hookType']),
        targetEmotion: pickFirstString(scene, ['targetEmotion']),
        personaStyle: pickFirstString(scene, ['personaStyle']),
        contrastAxis: pickFirstString(scene, ['contrastAxis']),
        proofMoment: pickFirstString(scene, ['proofMoment']),
        ctaStyle: pickFirstString(scene, ['ctaStyle']),
        proofType: pickFirstString(scene, ['proofType']),
        ctaType: pickFirstString(scene, ['ctaType']),
        platformTarget: pickFirstString(scene, ['platformTarget']),
      }]
    })
    : []
  const normalizedRawShots = rawShots.length > 0 ? rawShots : sceneDerivedShots

  const entityLookup = createEntityLookup(entityRefs)

  function ensureEntityRef(input: {
    sourceName: string
    kind: 'character' | 'environment' | 'item'
    role: string
  }) {
    const sourceName = input.sourceName.trim()
    if (!sourceName) return null
    const existingId = resolveEntityRefId(sourceName, entityLookup)
    if (existingId) return existingId
    if (!allowEntityCreation) return null

    const id = `${input.kind}_${slugSeed(sourceName, `${input.kind}_${entityRefs.length + 1}`)}`
    const nextEntityRef = {
      id,
      kind: input.kind,
      role: input.role,
      sourceName,
      summary: '',
      resolution: 'create',
      definitionKey: null,
      planItemId: null,
    }
    entityRefs.push(nextEntityRef)
    registerEntityLookupEntry(entityLookup, nextEntityRef)
    return id
  }

  const markdownParsed = rawScriptMarkdown
    ? parseShotBlockMarkdown({
      markdown: rawScriptMarkdown,
      graphName,
      graphSummary,
      entityRefs,
      formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, record.graphSettings && asRecord(record.graphSettings)?.formatSubtype),
      formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, record.graphSettings && asRecord(record.graphSettings)?.formulaFamily),
      dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, record.graphSettings && asRecord(record.graphSettings)?.dominantTrigger),
      promptText: options.promptText ?? requestSummary,
    })
    : null

  const shots = (markdownParsed?.shots.length ?? 0) > 0
    ? markdownParsed!.shots
    : normalizedRawShots
    .map((entry, index) => {
      const shot = asRecord(entry)
      if (!shot) return null
      const title = pickFirstString(shot, ['title', 'name', 'label']) || `Shot ${index + 1}`
      const beat = pickFirstString(shot, ['beat', 'description', 'summary', 'script', 'action', 'text'])
      if (!beat) return null

      const locationName = pickFirstString(shot, ['location', 'environment', 'setting'])
      const locationRefId = locationName
        ? (resolveEntityRefId(locationName, entityLookup) ?? ensureEntityRef({
          sourceName: locationName,
          kind: 'environment',
          role: 'location',
        }) ?? null)
        : null

      const participantNames = collectNamedLabels(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast)
      for (const participantName of participantNames) {
        ensureEntityRef({
          sourceName: participantName,
          kind: 'character',
          role: 'participant',
        })
      }

      return {
        id: pickFirstString(shot, ['id', 'key']) || `shot_${index + 1}`,
        sceneId: pickFirstString(shot, ['sceneId', 'scene', 'parentSceneId']) || null,
        title,
        beat,
        hookRole: parseNullableEnumValue(cinematicHookRoleSchema, shot.hookRole),
        formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, shot.formatSubtype),
        formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, shot.formulaFamily),
        dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, shot.dominantTrigger),
        hookType: pickFirstString(shot, ['hookType']),
        targetEmotion: pickFirstString(shot, ['targetEmotion']),
        personaStyle: pickFirstString(shot, ['personaStyle']),
        contrastAxis: pickFirstString(shot, ['contrastAxis']),
        proofMoment: pickFirstString(shot, ['proofMoment']),
        ctaStyle: pickFirstString(shot, ['ctaStyle']),
        proofType: pickFirstString(shot, ['proofType']),
        ctaType: pickFirstString(shot, ['ctaType']),
        platformTarget: parseNullableEnumValue(cinematicPlatformTargetSchema, shot.platformTarget),
        participantRefIds: Array.from(new Set(collectNamedRefs(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast, entityLookup))),
        locationRefId,
        propRefIds: Array.from(new Set(collectNamedRefs(shot.propRefIds ?? shot.props ?? shot.items, entityLookup))),
        shotType: normalizeShotType(shot.shotType ?? shot.type),
        framing: pickFirstString(shot, ['framing', 'frame', 'composition']),
        cameraAngle: pickFirstString(shot, ['cameraAngle', 'angle']),
        cameraMovement: pickFirstString(shot, ['cameraMovement', 'movement']),
        lensPreference: pickFirstString(shot, ['lensPreference', 'lens']),
        durationSeconds: normalizePlannerShotDuration({
          promptText: options.promptText ?? requestSummary,
          beat,
          durationSeconds:
            typeof shot.durationSeconds === 'number'
              ? shot.durationSeconds
              : typeof shot.duration === 'number'
                ? shot.duration
                : null,
        }),
        forceTakeBreak: Boolean(shot.forceTakeBreak ?? shot.breakAfter ?? shot.forceBreak ?? false),
        visualPrompt: pickFirstString(shot, ['visualPrompt', 'prompt', 'visualDescription']),
        compositionGuide: pickFirstString(shot, ['compositionGuide', 'blocking', 'sceneComposition', 'ingredientGuide', 'stagingNotes']),
        requiredSourceRefIds: Array.from(new Set(collectNamedLabels(
          shot.requiredSourceRefIds
          ?? shot.sourceRefIds
          ?? shot.sources
          ?? [],
        ))),
        compositeRefIds: Array.from(new Set(collectNamedLabels(shot.compositeRefIds ?? shot.composites ?? shot.compositeRefs))),
        storyboardRefIds: Array.from(new Set(collectNamedLabels(shot.storyboardRefIds ?? shot.storyboards ?? shot.storyboardRefs))),
        beats: coerceArrayWithSchema(shot.beats, cinematicBeatSchema),
        dialogue: coerceArrayWithSchema(shot.dialogue ?? shot.lines, dialogueBeatSchema).map((entry) => ({
          ...entry,
          speakerRefId: entry.speakerRefId ? resolveEntityRefId(entry.speakerRefId, entityLookup) : null,
        })),
        actions: coerceArrayWithSchema(shot.actions, actionBeatSchema).map((entry) => ({
          ...entry,
          actorRefId: entry.actorRefId ? resolveEntityRefId(entry.actorRefId, entityLookup) : null,
          targetRefId: entry.targetRefId ? resolveEntityRefId(entry.targetRefId, entityLookup) : null,
          propRefId: entry.propRefId ? resolveEntityRefId(entry.propRefId, entityLookup) : null,
        })),
        audio: coerceArrayWithSchema(shot.audio ?? shot.sound, audioBeatSchema).map((entry) => ({
          ...entry,
          sourceRefId: entry.sourceRefId ? resolveEntityRefId(entry.sourceRefId, entityLookup) : null,
        })),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const fallbackDiagnostics: string[] = []
  if (markdownParsed) {
    fallbackDiagnostics.push(...markdownParsed.diagnostics)
  }
  const normalizedShots = shots.length > 0
    ? shots
    : enableFallbackShaping
      ? (() => {
        fallbackDiagnostics.push('Cinematic script planner returned no valid shots; generated a fallback primary beat.')
        return [buildFallbackShot({
          requestSummary,
          graphSummary,
          entityRefs,
        })]
      })()
      : []
  const expandedShots = enableFallbackShaping
    ? expandTemporalShots({
      shots: normalizedShots,
      promptText: options.promptText ?? requestSummary,
      entityRefs: entityRefs.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        sourceName: entry.sourceName,
      })),
    })
    : normalizedShots
  if (enableFallbackShaping && shots.length === 1 && expandedShots.length > 1) {
    fallbackDiagnostics.push(`Expanded a single authored shot into ${expandedShots.length} temporal shots using prompt phase heuristics.`)
  }
  const soleEnvironmentRefId =
    entityRefs.filter((entry) => entry.kind === 'environment').length === 1
      ? entityRefs.find((entry) => entry.kind === 'environment')?.id ?? null
      : null
  const normalizedShotsWithDefaultLocation = expandedShots.map((shot) => (
    !shot.locationRefId && soleEnvironmentRefId
      ? {
          ...shot,
          locationRefId: soleEnvironmentRefId,
        }
      : shot
  ))

  const relationshipRefs = sanitizeRelationshipRefs(
    coerceArrayWithSchema(record.relationshipRefs ?? record.relationships, cinematicRelationshipSchema),
    entityLookup,
  )

  if (enableFallbackShaping && relationshipRefs.length === 0) {
    const firstLocation = entityRefs.find((entry) => entry.kind === 'environment') ?? null
    const characterRefs = entityRefs.filter((entry) => entry.kind === 'character')
    const propRefs = entityRefs.filter((entry) => entry.kind === 'item')

    for (const propRef of propRefs.filter((entry) => !isIncidentalPropName(entry.sourceName))) {
      if (characterRefs[0]) {
        relationshipRefs.push({
          id: `rel_${characterRefs[0].id}_${propRef.id}`,
          type: 'equip',
          sourceRefId: characterRefs[0].id,
          targetRefId: propRef.id,
          notes: 'Defaulted from prompt participants and props.',
        })
      }
    }

    if (characterRefs.length >= 2) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${characterRefs[1].id}`,
        type: 'targets',
        sourceRefId: characterRefs[0].id,
        targetRefId: characterRefs[1].id,
        notes: 'Defaulted from multi-character cinematic prompt.',
      })
    }

    if (firstLocation && characterRefs[0]) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${firstLocation.id}`,
        type: 'located_in',
        sourceRefId: characterRefs[0].id,
        targetRefId: firstLocation.id,
        notes: 'Defaulted from cinematic location context.',
      })
    }
  }

  const compositeRefPlans = sanitizeCompositeRefPlans(
    coerceArrayWithSchema(scriptRecord.compositeRefs ?? record.compositeRefPlans ?? scriptRecord.composites ?? record.composites, cinematicCompositeRefPlanSchema),
    entityLookup,
  )

  if (enableFallbackShaping && compositeRefPlans.length === 0) {
    for (const relationship of relationshipRefs) {
      if (!['equip', 'wear', 'hold', 'mounted_on'].includes(relationship.type)) continue
      const sourceRef = entityRefs.find((entry) => entry.id === relationship.sourceRefId) ?? null
      const targetRef = entityRefs.find((entry) => entry.id === relationship.targetRefId) ?? null
      if (!sourceRef || !targetRef) continue
      compositeRefPlans.push({
        id: `composite_${sourceRef.id}_${targetRef.id}`,
        title: `${sourceRef.sourceName} with ${targetRef.sourceName}`,
        summary: `${sourceRef.sourceName} combined with ${targetRef.sourceName} for continuity.`,
        relationshipType: relationship.type,
        sourceRefIds: [sourceRef.id, targetRef.id],
        generationPrompt: `${sourceRef.sourceName} combined with ${targetRef.sourceName} in one clear, production-ready reference frame.`,
        outputAssetKey: null,
        stagingNotes: relationship.notes,
        priority: 80,
      })
    }
  }

  const storyboardPlanInput = scriptRecord.storyboard ?? record.storyboardPlan ?? record.storyboard
  const storyboardPlanParsed = storyboardSpecSchema.safeParse(storyboardPlanInput ?? {})
  const storyboardPlan = storyboardPlanParsed.success
    ? storyboardPlanParsed.data
    : {
        mode: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'sequence_board' as const : 'none' as const,
        summary: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'Generate a storyboard sheet and shot panels for continuity.' : '',
        sequenceAssetKey: null,
        panels: normalizePromptTextForStoryboard(requestSummary).includes('storyboard')
          ? normalizedShotsWithDefaultLocation.map((shot, index) => ({
              id: `panel_${shot.id}`,
              shotId: shot.id,
              title: shot.title,
              assetKey: null,
              notes: shot.compositionGuide,
              orderIndex: index,
            }))
          : [],
      }

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined
  const sanitizedGraphSummary = sanitizeNarrativeSummaryText(graphSummary)
  const sanitizedRecordLogline = sanitizeNarrativeSummaryText(pickFirstString(scriptRecord, ['logline', 'summary']))
  const sanitizedMarkdownLogline = sanitizeNarrativeSummaryText(markdownParsed?.logline ?? '')

  const scenes = rawScenes
    .map((entry, index) => {
      const scene = asRecord(entry)
      if (!scene) return null
      const title = pickFirstString(scene, ['title', 'name', 'label']) || `Scene ${index + 1}`
      const shotIds = Array.from(new Set(collectNamedLabels(scene.shotIds ?? scene.shots)))
      return {
        id: pickFirstString(scene, ['id', 'key']) || `scene_${index + 1}`,
        title,
        summary: sanitizeNarrativeSummaryText(pickFirstString(scene, ['summary', 'description'])),
        locationRefId: (() => {
          const locationName = pickFirstString(scene, ['locationRefId', 'location', 'environment', 'setting'])
          return locationName ? resolveEntityRefId(locationName, entityLookup) : null
        })(),
        shotIds,
        continuityNotes: pickFirstString(scene, ['continuityNotes', 'notes']),
        orderIndex: typeof scene.orderIndex === 'number' ? scene.orderIndex : index,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const normalizedScenes = scenes.length > 0
    ? scenes.map((scene, index) => ({
        ...scene,
        shotIds: (() => {
          const explicitShotIds = scene.shotIds.filter((shotId) => normalizedShotsWithDefaultLocation.some((shot) => shot.id === shotId))
          if (explicitShotIds.length > 0) return explicitShotIds
          const derivedShotIds = normalizedShotsWithDefaultLocation
            .filter((shot) => shot.sceneId === scene.id)
            .map((shot) => shot.id)
          if (derivedShotIds.length > 0) return derivedShotIds
          return scenes.length === 1 ? normalizedShotsWithDefaultLocation.map((shot) => shot.id) : []
        })(),
        orderIndex: index,
      }))
    : (normalizedShotsWithDefaultLocation.length > 0
      ? [{
          id: 'scene_1',
          title: pickFirstString(scriptRecord, ['sceneTitle']) || 'Scene 1',
          summary: sanitizedGraphSummary,
          locationRefId: normalizedShotsWithDefaultLocation[0]?.locationRefId ?? null,
          shotIds: normalizedShotsWithDefaultLocation.map((shot) => shot.id),
          continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']) || '',
          orderIndex: 0,
        }]
      : [])
  const scriptDoc = cinematicScriptDocSchema.parse({
    title: markdownParsed?.title || pickFirstString(scriptRecord, ['title']) || graphName,
    logline: sanitizedMarkdownLogline || sanitizedRecordLogline || sanitizedGraphSummary,
    tone: markdownParsed?.tone || pickFirstString(scriptRecord, ['tone']),
    continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']),
    statusPayoffType: pickFirstString(scriptRecord, ['statusPayoffType']),
    narrativeArcTemplate: pickFirstString(scriptRecord, ['narrativeArcTemplate']),
    entityBindings: entityRefs.map((entityRef) => ({
      id: entityRef.id,
      kind: entityRef.kind,
      role: entityRef.role,
      label: entityRef.sourceName,
      sourceName: entityRef.sourceName,
      summary: entityRef.summary,
      definitionKey: entityRef.definitionKey ?? null,
      assetKey: null,
      stagingNotes: '',
      priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
      required: true,
    })),
    scenes: normalizedScenes,
    shots: normalizedShotsWithDefaultLocation.map((shot, index) => ({
      id: shot.id,
      sceneId: shot.sceneId ?? normalizedScenes.find((scene) => scene.shotIds.includes(shot.id))?.id ?? normalizedScenes[0]?.id ?? null,
      orderIndex: index,
      title: shot.title,
      subtitle: null,
      beat: shot.beat,
      emotionalBeat: '',
      hookRole: shot.hookRole ?? null,
      formatSubtype: shot.formatSubtype ?? null,
      formulaFamily: shot.formulaFamily ?? null,
      dominantTrigger: shot.dominantTrigger ?? null,
      hookType: shot.hookType ?? '',
      targetEmotion: shot.targetEmotion ?? '',
      personaStyle: shot.personaStyle ?? '',
      contrastAxis: shot.contrastAxis ?? '',
      proofMoment: shot.proofMoment ?? '',
      ctaStyle: shot.ctaStyle ?? '',
      proofType: shot.proofType ?? '',
      ctaType: shot.ctaType ?? '',
      platformTarget: shot.platformTarget ?? null,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      continuityNotes: '',
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: Array.from(new Set(
        shot.requiredSourceRefIds.length > 0
          ? shot.requiredSourceRefIds
          : [
              ...(shot.storyboardRefIds ?? []),
              ...(shot.compositeRefIds ?? []),
              ...shot.participantRefIds,
              ...(shot.locationRefId ? [shot.locationRefId] : []),
              ...shot.propRefIds,
            ],
      )),
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot.durationSeconds,
      forceTakeBreak: shot.forceTakeBreak,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    relationships: relationshipRefs,
    compositeRefs: compositeRefPlans.map((composite) => ({
      ...composite,
      outputAssetKey: composite.outputAssetKey ?? null,
    })),
    storyboard: storyboardPlan,
  })
  const sequence = compileCinematicSequence(
    rawSequenceRecord
      ? cinematicSequenceSchema.parse({
          ...rawSequenceRecord,
          title: pickFirstString(rawSequenceRecord, ['title']) || scriptDoc.title,
          logline: pickFirstString(rawSequenceRecord, ['logline', 'summary']) || scriptDoc.logline,
          tone: pickFirstString(rawSequenceRecord, ['tone']) || scriptDoc.tone,
          continuityNotes: pickFirstString(rawSequenceRecord, ['continuityNotes']) || scriptDoc.continuityNotes,
          statusPayoffType: pickFirstString(rawSequenceRecord, ['statusPayoffType']) || scriptDoc.statusPayoffType,
          narrativeArcTemplate: pickFirstString(rawSequenceRecord, ['narrativeArcTemplate']) || scriptDoc.narrativeArcTemplate,
          references: scriptDoc.entityBindings.map((binding) => ({
            id: binding.id,
            refKind: binding.definitionKey ? 'definition' : binding.kind === 'audio' ? 'audio' : binding.kind === 'style' ? 'style' : 'asset',
            role: binding.role,
            label: binding.label,
            summary: binding.summary,
            definitionKey: binding.definitionKey,
            assetKey: binding.assetKey,
            assetRole: binding.kind === 'audio' ? 'audio' : binding.kind === 'style' ? 'style' : binding.kind,
            stagingNotes: binding.stagingNotes,
            priority: binding.priority,
            required: binding.required,
          })),
          scenes: normalizedScenes,
          compositeRefs: scriptDoc.compositeRefs,
          relationships: scriptDoc.relationships,
          storyboard: scriptDoc.storyboard,
          shots: scriptDoc.shots.map((shot) => ({
            id: shot.id,
            sceneId: shot.sceneId,
            title: shot.title,
            subtitle: shot.subtitle,
            beat: shot.beat,
            emotionalBeat: shot.emotionalBeat,
            hookRole: shot.hookRole,
            formatSubtype: shot.formatSubtype,
            formulaFamily: shot.formulaFamily,
            dominantTrigger: shot.dominantTrigger,
            hookType: shot.hookType,
            targetEmotion: shot.targetEmotion,
            personaStyle: shot.personaStyle,
            contrastAxis: shot.contrastAxis,
            proofMoment: shot.proofMoment,
            ctaStyle: shot.ctaStyle,
            proofType: shot.proofType,
            ctaType: shot.ctaType,
            platformTarget: shot.platformTarget,
            shotType: shot.shotType,
            framing: shot.framing,
            cameraAngle: shot.cameraAngle,
            cameraMovement: shot.cameraMovement,
            lensPreference: shot.lensPreference,
            visualPrompt: shot.visualPrompt,
            compositionGuide: shot.compositionGuide,
            participantRefIds: shot.participantRefIds,
            locationRefId: shot.locationRefId,
            propRefIds: shot.propRefIds,
            requiredSourceRefIds: shot.requiredSourceRefIds,
            compositeRefIds: shot.compositeRefIds,
            storyboardRefIds: shot.storyboardRefIds,
            durationSeconds: shot.durationSeconds,
            forceTakeBreak: shot.forceTakeBreak,
            beats: shot.beats,
            dialogue: shot.dialogue,
            actions: shot.actions,
            audio: shot.audio,
          })),
          takes: Array.isArray(rawSequenceRecord.takes) ? rawSequenceRecord.takes : [],
        })
      : buildCinematicSequenceFromScriptDoc(scriptDoc),
  )

  return cinematicPlannerRawSchema.parse({
    requestSummary,
    graphName,
    graphSummary,
    rawScriptMarkdown,
    entityRefs,
    sequence,
    scriptDoc,
    relationshipRefs,
    compositeRefPlans,
    storyboardPlan,
    shots: normalizedShotsWithDefaultLocation,
    graphSettings: (() => {
      const graphSettings = asRecord(record.graphSettings ?? record.settings) ?? {}
      return {
        ...graphSettings,
        presetFamily: parseNullableEnumValue(cinematicPresetFamilySchema, graphSettings.presetFamily) ?? undefined,
        formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, graphSettings.formatSubtype),
        formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, graphSettings.formulaFamily),
        dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, graphSettings.dominantTrigger),
      }
    })(),
    diagnostics: [...diagnostics, ...fallbackDiagnostics],
    assistantNotes,
  })
}

export const cinematicGraphAuthorSchema = z.object({
  graphName: z.string(),
  graphSummary: z.string(),
  graphSettings: cinematicGraphSettingsSchema,
  assetRefs: z.array(z.object({
    id: z.string(),
    nodeType: z.enum(['asset_ref', 'composite_ref', 'storyboard_ref']).default('asset_ref'),
    templateKey: z.string().default('asset_ref'),
    definitionKey: z.string().nullable().default(null),
    assetKey: z.string().nullable().default(null),
    assetRole: z.enum(['character', 'environment', 'item', 'audio', 'style', 'storyboard', 'composite']),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    stagingNotes: z.string().default(''),
    role: z.string().default('reference'),
    priority: z.number().int().min(0).max(100).default(50),
    sourceRefIds: z.array(z.string()).default([]),
    relationshipType: z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of']).nullable().default(null),
  })).default([]),
  shots: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    beat: z.string(),
    visualPrompt: z.string().default(''),
    compositionGuide: z.string().default(''),
    shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
    framing: z.string().default(''),
    cameraAngle: z.string().default(''),
    cameraMovement: z.string().default(''),
    lensPreference: z.string().default(''),
    durationSeconds: z.number().int().positive().max(15).nullable().default(null),
    participantRefIds: z.array(z.string()).default([]),
    locationRefId: z.string().nullable().default(null),
    propRefIds: z.array(z.string()).default([]),
    sourceRefIds: z.array(z.string()).default([]),
    compositeRefIds: z.array(z.string()).default([]),
    storyboardRefIds: z.array(z.string()).default([]),
    beats: z.array(cinematicBeatSchema).default([]),
    dialogue: z.array(dialogueBeatSchema).default([]),
    actions: z.array(actionBeatSchema).default([]),
    audio: z.array(audioBeatSchema).default([]),
  })).min(1),
})

export function normalizeMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCinematicDefinitionCatalog(definitions: SnapshotDefinition[]) {
  return definitions
    .filter((definition) => definition.kind === 'character' || definition.kind === 'environment' || definition.kind === 'item')
    .map((definition) => ({
      definitionKey: definition.key,
      kind: definition.kind as 'character' | 'environment' | 'item',
      name: definition.name,
      summary: typeof definition.summary === 'string' ? definition.summary : '',
      normalizedName: normalizeMatchKey(definition.name),
      normalizedKey: normalizeMatchKey(definition.key),
    }))
}

export function buildPromptMatchedEntityRefs(
  prompt: string,
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  const normalizedPrompt = ` ${normalizeMatchKey(prompt)} `
  if (!normalizedPrompt.trim()) return []

  return catalog
    .map((entry) => {
      const candidates = [entry.normalizedName, entry.normalizedKey].filter((value) => value.length > 0)
      const matched = candidates.some((candidate) => normalizedPrompt.includes(` ${candidate} `))
      if (!matched) return null
      return {
        id: `${entry.kind}_${slugSeed(entry.name, entry.definitionKey)}`,
        kind: entry.kind,
        role: entry.kind === 'environment' ? 'location' : entry.kind === 'item' ? 'prop' : 'participant',
        sourceName: entry.name,
        summary: entry.summary,
        resolution: 'existing' as const,
        definitionKey: entry.definitionKey,
        planItemId: null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.sourceName.length - left.sourceName.length)
}

export function findStrongExistingDefinitionMatch(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
  kind: CinematicEntityRef['kind'],
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const candidates = catalog.filter((entry) => entry.kind === kind)
  const exact = candidates.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzy = candidates.find((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  return fuzzy ?? null
}

function findStrongExistingDefinitionMatchAcrossKinds(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const exact = catalog.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzyMatches = catalog.filter((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  if (fuzzyMatches.length === 1) return fuzzyMatches[0]
  return null
}

export function cinematicIntentSystemPrompt() {
  return [
    'You classify whether a GraphCore prompt should use the normal world-build planner or the cinematic planner.',
    'Return JSON only.',
    'Return exactly one object with keys: plannerMode, reason.',
    'Use plannerMode "cinematic_build" when the prompt is asking for a scene, sequence, shot plan, cinematic, trailer beat, cutscene, fight scene, dialogue scene, reveal scene, or other authored visual sequence.',
    'Use plannerMode "world_build" when the prompt is primarily asking for content creation without sequencing shots together.',
  ].join('\n')
}

export function cinematicEntityExtractionSystemPrompt() {
  return [
    'You extract the world entities a cinematic prompt depends on before graph authoring.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'entityRefs must contain every important character, environment, and only the item refs that are clearly specific, continuity-critical, reusable, or hero-level in the prompt.',
    'Each entityRef must contain: id, kind, role, sourceName, summary, resolution, definitionKey, planItemId.',
    'Use kind character for named people, speakers, fighters, targets, and participants unless the supplied catalog clearly contradicts that.',
    'Use kind environment for locations, rooms, taverns, streets, wilderness areas, and other settings.',
    'Use kind item only for specific, reusable, or hero props such as a named artifact, a signature weapon, a featured product, or a recurring prop that must stay visually consistent across multiple beats.',
    'Do not elevate generic everyday objects, carrier objects, financial symbols, or background staging props into standalone item refs unless the prompt clearly makes them an important recurring hero object.',
    'If an object can live inside shot staging or composition notes without needing its own reusable reference, keep it out of entityRefs.',
    'Set resolution to "existing" only when a supplied definitionKey is a confident match.',
    'Set resolution to "create" when the prompt needs a new entity that is not clearly in the supplied catalog.',
    'Prefer reusing supplied definitions instead of creating near-duplicates.',
    'Do not extract shots, storyboards, or graph structure here.',
  ].join('\n')
}

export function cinematicEntityResolutionSystemPrompt() {
  return [
    'You resolve extracted cinematic entities against the existing GraphCore definition catalog.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'For each supplied entityRef, decide whether it should reuse an existing definition or be created new.',
    'Prefer existing definitions whenever the prompt meaning, spelling, aliases, or likely user intent indicate they are the same entity.',
    'Handle misspellings, shorthand, slug-like names, and key-like names such as char_kharzag when they clearly map to an existing definition.',
    'When reusing an existing definition, set resolution to "existing" and fill definitionKey with the exact supplied definitionKey.',
    'When no strong match exists, keep resolution as "create".',
    'Do not invent definitions that are not present in the supplied catalog.',
    'Preserve the intended role of each entity, but if the supplied catalog makes the kind obvious, prefer the catalog kind over a guessed kind.',
  ].join('\n')
}

export function cinematicScriptRepairSystemPrompt(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema> = 'story_movie_tv',
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null = null,
  targetShotCount = 5,
) {
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  return [
    'You repair a weak GraphCore cinematic sequence draft into a stronger authored sequence.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, graphSettings, sequence, diagnostics, assistantNotes.',
    'Preserve the same story intent, locked entity ids, and overall cinematic shape unless one of the reported quality failures requires adjustment.',
    'Do not invent new entities, rename existing entities, or change locked ids.',
    `Return a sequence object with about ${targetShotCount} shots unless the quality failures explicitly justify fewer.`,
    'sequence must be valid structured JSON, not markdown.',
    'sequence must include: title, logline, tone, continuityNotes, references, scenes, storyboard, shots.',
    'sequence.references must use only locked reference ids and include only refs actually used by the authored shots.',
    'sequence.shots must be ordered and each shot must include: id, sceneId, title, beat, hookRole, formatSubtype, formulaFamily, dominantTrigger, hookType, targetEmotion, personaStyle, contrastAxis, proofMoment, ctaStyle, proofType, ctaType, shotType, participantRefIds, locationRefId, propRefIds, requiredSourceRefIds, visualPrompt, compositionGuide, dialogue, actions, audio.',
    'Use requiredSourceRefIds for the actual continuity-critical inputs the runtime should wire into the shot.',
    'If a shot needs a hard take split, set forceTakeBreak to true on that shot. Do not author takes directly.',
    'If you use Role, only use these exact values: hook, setup, proof, payoff, cta.',
    'Use setup for normal support, context, or problem beats. Use proof for escalation, mechanism, comparison, or visible evidence beats. Do not invent extra role labels like support or escalation.',
    'Do not invent new reference ids. Use only the locked ids from the provided reference list.',
    'Only use Props for recurring hero or continuity-critical refs. Everyday carrier objects, staging objects, packaging, surfaces, and background clutter should usually stay inside Action or Composition instead of becoming reusable props.',
    'Keep Action literal, visual, and specific. Do not summarize the whole ad in one block.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
    profile ? `Allowed formula families: ${profile.allowedFormulaFamilies.join(', ')}.` : null,
    profile ? `Allowed dominant triggers: ${profile.allowedDominantTriggers.join(', ')}.` : null,
    'Make the first UGC shot a stronger stop-scroll image when it only sets up the situation without a real hook, contrast, or problem.',
    'Replace abstract payoff language like control, confidence, handled, winning, or calm with visible in-frame evidence whenever possible.',
    'If consecutive middle shots repeat the same payoff dimension, diversify them so the sequence escalates through different visible dimensions such as time, money, stress, energy, proof, or convenience.',
    'When a product appears in a UGC ad, show what it is doing on screen instead of letting it sit as a passive prop.',
    'Strengthen the final shot so it lands as the clearest proof, payoff, or CTA frame rather than a generic pretty ending.',
    'Keep shots concrete, readable, and screenplay-like.',
  ].join('\n')
}

function isUgcCreativeFlow(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  if (inferCinematicPresetFamilyFromPrompt(input.promptText) !== 'story_movie_tv') return true
  return input.scriptDoc.shots.some((shot) => {
    const formatSubtype = shot.formatSubtype ?? null
    return Boolean(formatSubtype) || Boolean(shot.formulaFamily) || Boolean(shot.dominantTrigger)
  })
}

function shotTextForCreativeChecks(shot: z.infer<typeof cinematicScriptShotSchema>) {
  return [shot.beat, shot.visualPrompt, shot.compositionGuide, shot.emotionalBeat].filter(Boolean).join(' ')
}

function shotUsesWriterlyOrMetaphoricalLanguage(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return (
    /\b(as if|feels like|feel like|looks like|like a|like the|personally betrayed|quiet little|weirdly powerful|asked too much|obvious answer)\b/.test(normalized)
    || /\b(calm as ever|winning with|clearly winning|bad habit with a login)\b/.test(normalized)
  )
}

function shotContainsVisibleProofCue(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(app|open app|screen|receipt|receipts|container|labeled|checklist|calendar|plan|grocery|price|prices|charge|charges|total|totals|before after|split screen|side by side|demo|proof|comparison|tracking|mapped out|list|lists|download|install|profile|match|task board)\b/.test(normalized)
}

function shotUsesAbstractPayoffLanguage(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(control|confidence|handled|handling|winning|winner|calm|calmer|stable|stability|effortless|effortlessly|powerful|organized|in control|answer|solution|system)\b/.test(normalized)
}

function shotHasStrongHookImage(text: string, formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  if (formatSubtype === 'contrast_narrative') {
    return /\b(split|split screen|side by side|two versions|versus|vs|contrast|before after|left|right)\b/.test(normalized)
      && /\b(empty|mess|chaos|stare|stress|crash|panic|late|receipts|stack|winner|clean|proof|product)\b/.test(normalized)
  }
  if (isSerializedDramaSubtype(formatSubtype)) {
    return /\b(drama|gossip|betrayal|cheating|secret|caught|meltdown|chaos|fruit|cartoon|personified|absurd)\b/.test(normalized)
  }
  return /\b(problem|pain|wrong|empty|mess|chaos|crash|caught|stare|reveal|receipt|proof|split|comparison|before|after|stack)\b/.test(normalized)
}

function inferPayoffDimensions(shot: z.infer<typeof cinematicScriptShotSchema>) {
  const normalized = normalizeMatchKey(shotTextForCreativeChecks(shot))
  const dimensions: string[] = []
  if (/\b(save|savings|money|cost|price|receipt|receipts|charge|charges|budget)\b/.test(normalized)) dimensions.push('money')
  if (/\b(late|early|time|schedule|rush|minutes|prep night)\b/.test(normalized)) dimensions.push('time')
  if (/\b(energy|crash|tired|fuel|fed|coffee|fatigue)\b/.test(normalized)) dimensions.push('energy')
  if (/\b(stress|panic|frazzled|mess|chaos|clutter|defeated)\b/.test(normalized)) dimensions.push('stress')
  if (/\b(app|plan|checklist|calendar|routine|container|labeled|mapped out)\b/.test(normalized)) dimensions.push('routine')
  if (/\b(proof|screen|receipt|totals|visible|shown|shows|opens|tap|check)\b/.test(normalized)) dimensions.push('proof')
  return dimensions
}

function subtypeLooksAdLike(formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  return typeof formatSubtype === 'string' && (formatSubtype.startsWith('ad_') || formatSubtype === 'contrast_narrative')
}

function shotNarratorOverlayCount(shot: z.infer<typeof cinematicScriptShotSchema>) {
  return shot.audio.filter((cue) => cue.kind === 'offscreen' && cue.cue.trim()).length
}

function shotShowsProductFunction(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(open|opens|tap|taps|check|checks|show|shows|track|tracks|map|maps|plan|plans|calculate|calculates|organize|organizes|queue|queues|schedule|schedules|display|displays|compare|compares|generat|sort|preps)\b/.test(normalized)
}

function shotUsesIdentityAttackLanguage(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(your fault|lack of discipline|no discipline|lazy|just stop|should have known|wrong with you|failing because you)\b/.test(normalized)
}

function ctaStyleLooksAggressive(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(buy now|shop now|order now|limited time|act now|hurry|don t miss out|comment now|dm now)\b/.test(normalized)
}

function shotDialogueText(shot: z.infer<typeof cinematicScriptShotSchema>) {
  return shot.dialogue.map((entry) => entry.line).filter(Boolean).join(' ')
}

function creatorShotSoundsSalesyTooEarly(shot: z.infer<typeof cinematicScriptShotSchema>) {
  if (shot.hookRole === 'cta') return false
  const normalized = normalizeMatchKey([shot.beat, shotDialogueText(shot)].join(' '))
  if (!normalized) return false
  return /\b(buy now|shop now|order now|tap the link|link in bio|download now|start now|sign up now|get yours|limited time|sale)\b/.test(normalized)
}

function shotMissingAuthoredVisualDirection(shot: z.infer<typeof cinematicScriptShotSchema>) {
  return (
    !shot.framing.trim()
    || !shot.cameraAngle.trim()
    || !shot.cameraMovement.trim()
    || !shot.lensPreference.trim()
    || !shot.visualPrompt.trim()
    || !shot.compositionGuide.trim()
  )
}

function facelessShotLooksFaceDependent(shot: z.infer<typeof cinematicScriptShotSchema>) {
  const normalized = normalizeMatchKey([
    shot.beat,
    shot.visualPrompt,
    shot.compositionGuide,
    shotDialogueText(shot),
  ].join(' '))
  if (!normalized) return false
  return /\b(looks into camera|direct to camera|talking head|selfie|face fills frame|creator speaks to camera|eye contact)\b/.test(normalized)
}

function mechanismShotLacksVisibleMechanismCue(shot: z.infer<typeof cinematicScriptShotSchema>) {
  const normalized = normalizeMatchKey(shotTextForCreativeChecks(shot))
  if (!normalized) return true
  return !/\b(screen|step|graph|shows|showing|maps|tracking|tap|taps|state change|before after|comparison|scan|timer|check in|progress|guided|receipt|dashboard)\b/.test(normalized)
}

function isSerializedDramaSubtype(formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  return (
    formatSubtype === 'creator_serialized_drama'
    || formatSubtype === 'ad_trojan_horse_drama'
    || formatSubtype === 'faceless_serialized_drama'
  )
}

function shotHasDramaConflictCue(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(drama|gossip|betrayal|cheating|secret|caught|argument|conflict|lonely|rejected|chaos|meltdown|affair|taboo)\b/.test(normalized)
}

function shotHasRevealCue(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(reveal|discover|discovers|found|finds|finally|then|suddenly|app|product|solution|download|installs|opens)\b/.test(normalized)
}

function shotHasRedemptionCue(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(redemption|relief|restored|restore|reunited|resolved|resolution|calm|control|better|organized|connection|transformed|wins)\b/.test(normalized)
}

export function scriptNeedsMultiBeatFallback(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  const shots = input.scriptDoc.shots
  const firstShot = shots[0] ?? null
  const hasContrastNarrative = shots.some((shot) => shot.formatSubtype === 'contrast_narrative')
  const hasSerializedDrama = shots.some((shot) => isSerializedDramaSubtype(shot.formatSubtype ?? null))
  if (shots.length === 0) return true
  if (hasContrastNarrative && shots.length < 4) return true
  if (hasSerializedDrama && shots.length < 4) return true
  if (promptSuggestsMultiBeatNarrative(input.promptText) && shots.length < 2) return true
  if (!firstShot) return false
  return shots.length === 1 && shotLooksLikeCatchAllSummary({
    title: firstShot.title,
    beat: firstShot.beat,
    compositionGuide: firstShot.compositionGuide,
  })
}

function isHardCinematicQualityFailure(message: string) {
  const normalized = normalizeMatchKey(message)
  if (!normalized) return false
  return (
    normalized.includes('collapsed into one generic summary shot')
    || normalized.includes('prompt implies a multi beat sequence')
    || normalized.includes('contrast narrative output is under segmented')
    || normalized.includes('serialized drama output is under segmented')
    || normalized.includes('serialized drama content needs a real reveal beat')
    || normalized.includes('serialized drama content needs a redemption beat')
    || normalized.includes('serialized drama content needs a clearer conflict')
    || normalized.includes('beat text is placeholder like')
    || normalized.includes('creator shot') && normalized.includes('missing spoken dialogue')
    || normalized.includes('must include at least one visible action beat')
    || normalized.includes('does not make the mechanism visually legible enough')
    || normalized.includes('describes payoff abstractly without enough visible proof')
    || normalized.includes('relies on face led or direct to camera language')
  )
}

export function evaluateCinematicScriptQuality(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  const failures: string[] = []
  const rawDiagnostics: Array<{
    scope: 'graph' | 'shot'
    shotId: string | null
    category: 'schema' | 'preset_fit' | 'hook' | 'proof' | 'dialogue' | 'action' | 'camera' | 'cta' | 'structure'
    message: string
  }> = []
  const flags = {
    usedFallbackPrimaryShot: false,
    usedTemporalExpansionFallback: false,
    usedDialogueFallback: false,
    usedActionBindingRepair: false,
    promptEchoShots: false,
    genericShotTitles: false,
    incidentalPropRelationships: false,
    ugcCreativeWeakness: false,
  }
  const isUgcFlow = isUgcCreativeFlow(input)
  const firstShot = input.scriptDoc.shots[0] ?? null
  const lastShot = input.scriptDoc.shots[input.scriptDoc.shots.length - 1] ?? null
  const recordFailure = (
    message: string,
    options: {
      shotId?: string | null
      category?: 'schema' | 'preset_fit' | 'hook' | 'proof' | 'dialogue' | 'action' | 'camera' | 'cta' | 'structure'
    } = {},
  ) => {
    failures.push(message)
    rawDiagnostics.push({
      scope: options.shotId ? 'shot' : 'graph',
      shotId: options.shotId ?? null,
      category: options.category ?? 'structure',
      message,
    })
  }

  for (const shot of input.scriptDoc.shots) {
    const impliesDialogue = shotImpliesDialogue({
      promptText: input.promptText,
      title: shot.title,
      beat: shot.beat,
      shotType: shot.shotType,
    })
    if (isGenericShotTitle(shot.title)) {
      flags.genericShotTitles = true
      recordFailure(`Shot "${shot.id}" has a generic title.`, { shotId: shot.id, category: 'schema' })
    }
    if (beatLooksLikePromptEcho(shot.beat, input.promptText)) {
      flags.promptEchoShots = true
      recordFailure(`Shot "${shot.id}" beat text echoes the prompt instead of authored prose.`, { shotId: shot.id, category: 'action' })
    }
    if (beatLooksUnderwritten(shot.beat)) {
      recordFailure(`Shot "${shot.id}" beat text is placeholder-like or underwritten and must describe a literal on-screen moment.`, { shotId: shot.id, category: 'action' })
    }
    if (impliesDialogue && shot.dialogue.length === 0) {
      flags.usedDialogueFallback = true
      recordFailure(`Shot "${shot.id}" implies dialogue but provides no dialogue beats.`, { shotId: shot.id, category: 'dialogue' })
    }
    if (shot.actions.length === 0) {
      recordFailure(`Shot "${shot.id}" must include at least one visible action beat.`, { shotId: shot.id, category: 'action' })
    }
    if (isUgcFlow && shotMissingAuthoredVisualDirection(shot)) {
      recordFailure(`Shot "${shot.id}" is missing final camera or visual-prompt direction. Authorship must fill framing, camera, lens, visualPrompt, and compositionGuide.`, { shotId: shot.id, category: 'camera' })
    }
    for (const dialogue of shot.dialogue) {
      const speakerName =
        input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.sourceName
        ?? input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.label
        ?? ''
      if (!dialogue.line.trim() || dialogueLooksLikePlaceholder(dialogue.line, speakerName)) {
        flags.usedDialogueFallback = true
        recordFailure(`Shot "${shot.id}" contains placeholder or summary dialogue.`, { shotId: shot.id, category: 'dialogue' })
        break
      }
    }
    if (!isUgcFlow) continue

    const formatSubtype = shot.formatSubtype ?? null
    const profile = getUgcPresetProfile(formatSubtype)
    const shotText = shotTextForCreativeChecks(shot)
    if (shotUsesWriterlyOrMetaphoricalLanguage(shotText)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC shot "${shot.id}" uses writerly or metaphorical phrasing instead of literal on-screen description.`, { shotId: shot.id, category: 'action' })
    }
    if (profile && shot.formulaFamily && !isFormulaFamilyAllowedForFormatSubtype(formatSubtype, shot.formulaFamily)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC shot "${shot.id}" uses formulaFamily "${shot.formulaFamily}" which does not match the ${getCinematicFormatSubtypeLabel(formatSubtype!)} preset profile.`, { shotId: shot.id, category: 'preset_fit' })
    }
    if (profile && shot.dominantTrigger && !isDominantTriggerAllowedForFormatSubtype(formatSubtype, shot.dominantTrigger)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC shot "${shot.id}" uses dominantTrigger "${shot.dominantTrigger}" which does not match the ${getCinematicFormatSubtypeLabel(formatSubtype!)} preset profile.`, { shotId: shot.id, category: 'preset_fit' })
    }
    if (
      (shot.hookRole === 'proof' || shot.hookRole === 'payoff' || shot.hookRole === 'cta' || subtypeLooksAdLike(shot.formatSubtype))
      && shotUsesAbstractPayoffLanguage(shotText)
      && !shotContainsVisibleProofCue(shotText)
    ) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC shot "${shot.id}" describes payoff abstractly without enough visible proof.`, { shotId: shot.id, category: 'proof' })
    }
    if (typeof formatSubtype === 'string' && formatSubtype.startsWith('creator_') && shotUsesIdentityAttackLanguage(shotText)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC creator shot "${shot.id}" attacks the viewer's identity instead of protecting it.`, { shotId: shot.id, category: 'preset_fit' })
    }
    if (typeof formatSubtype === 'string' && formatSubtype.startsWith('creator_') && ctaStyleLooksAggressive(shot.ctaStyle)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC creator shot "${shot.id}" uses an overly aggressive CTA style for a creator-native preset.`, { shotId: shot.id, category: 'cta' })
    }
    if (typeof formatSubtype === 'string' && formatSubtype.startsWith('creator_') && creatorShotSoundsSalesyTooEarly(shot)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC creator shot "${shot.id}" sounds too salesy before the close. Protect identity and lead with recognition before pitching.`, { shotId: shot.id, category: 'preset_fit' })
    }
    if (
      typeof formatSubtype === 'string'
      && formatSubtype.startsWith('creator_')
      && ['hook', 'setup', 'proof', 'cta'].includes(shot.hookRole ?? '')
      && shot.dialogue.length === 0
    ) {
      flags.usedDialogueFallback = true
      recordFailure(`UGC creator shot "${shot.id}" is missing spoken dialogue for a creator-led beat.`, { shotId: shot.id, category: 'dialogue' })
    }
    if (formatSubtype === 'ad_mechanism_proof' && (shot.hookRole === 'setup' || shot.hookRole === 'proof') && mechanismShotLacksVisibleMechanismCue(shot)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC mechanism-proof shot "${shot.id}" does not make the mechanism visually legible enough.`, { shotId: shot.id, category: 'proof' })
    }
    if (typeof formatSubtype === 'string' && formatSubtype.startsWith('faceless_') && facelessShotLooksFaceDependent(shot)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`Faceless shot "${shot.id}" relies on face-led or direct-to-camera language instead of object, screen, or process clarity.`, { shotId: shot.id, category: 'preset_fit' })
    }
  }

  if (isUgcFlow && firstShot) {
    const firstShotText = shotTextForCreativeChecks(firstShot)
    if (!shotHasStrongHookImage(firstShotText, firstShot.formatSubtype ?? null)) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC first shot "${firstShot.id}" needs a clearer stop-scroll hook image or immediate problem/contrast.`, { shotId: firstShot.id, category: 'hook' })
    }
    if (input.scriptDoc.shots.length === 1 && shotLooksLikeCatchAllSummary({
      title: firstShot.title,
      beat: firstShot.beat,
      compositionGuide: firstShot.compositionGuide,
    })) {
      flags.ugcCreativeWeakness = true
      recordFailure('UGC script collapsed into one generic summary shot instead of authored beats.', { category: 'structure' })
    }
  }

  if (isUgcFlow && promptSuggestsMultiBeatNarrative(input.promptText) && input.scriptDoc.shots.length < 2) {
    flags.ugcCreativeWeakness = true
    recordFailure('Prompt implies a multi-beat sequence, but the authored script does not break the sequence into enough shots.', { category: 'structure' })
  }

  if (isUgcFlow) {
    const adLikeShots = input.scriptDoc.shots.filter((shot) => subtypeLooksAdLike(shot.formatSubtype))
    if (
      adLikeShots.length > 0
      && adLikeShots.some((shot) => shotTextForCreativeChecks(shot).trim())
      && !adLikeShots.some((shot) => shotShowsProductFunction(shotTextForCreativeChecks(shot)))
    ) {
      flags.ugcCreativeWeakness = true
      recordFailure('UGC ad sequence shows the product but does not clearly show the product doing its job on screen.', { category: 'proof' })
    }
    const nonFinalAdLikeShots = adLikeShots.slice(0, Math.max(0, adLikeShots.length - 1))
    if (adLikeShots.length > 0 && nonFinalAdLikeShots.length > 0 && !nonFinalAdLikeShots.some((shot) => shotContainsVisibleProofCue(shotTextForCreativeChecks(shot)))) {
      flags.ugcCreativeWeakness = true
      recordFailure('UGC direct-response flow delays visible proof until the ending. Land proof before the final frame.', { category: 'proof' })
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.length >= 4) {
    let repeatedDimensionPairs = 0
    for (let index = 1; index < input.scriptDoc.shots.length - 1; index += 1) {
      const currentDimensions = inferPayoffDimensions(input.scriptDoc.shots[index])
      const nextDimensions = inferPayoffDimensions(input.scriptDoc.shots[index + 1])
      if (currentDimensions.length === 0 || nextDimensions.length === 0) continue
      if (currentDimensions.some((dimension) => nextDimensions.includes(dimension))) {
        repeatedDimensionPairs += 1
      }
    }
    if (repeatedDimensionPairs >= 2) {
      flags.ugcCreativeWeakness = true
      recordFailure('UGC middle shots repeat the same payoff or pain dimension too often instead of escalating through new visible dimensions.', { category: 'structure' })
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.some((shot) => shot.formatSubtype === 'contrast_narrative')) {
    if (input.scriptDoc.shots.length < 4) {
      flags.ugcCreativeWeakness = true
      recordFailure('Contrast narrative output is under-segmented and needs multiple escalating shots, not a collapsed summary beat.', { category: 'structure' })
    }
    const distinctDimensions = new Set<string>()
    for (const shot of input.scriptDoc.shots) {
      for (const dimension of inferPayoffDimensions(shot)) distinctDimensions.add(dimension)
    }
    if (distinctDimensions.size < 3) {
      flags.ugcCreativeWeakness = true
      recordFailure('Contrast narrative beats should widen the gap across multiple visible dimensions instead of repeating one flat comparison.', { category: 'preset_fit' })
    }
    const dialogueHeavyShots = input.scriptDoc.shots.filter((shot) => shot.dialogue.length > 1).length
    const dualSpeakerShots = input.scriptDoc.shots.filter((shot) => new Set(shot.dialogue.map((entry) => entry.speakerRefId ?? `unknown_${entry.id}`)).size > 1).length
    const overlayHeavyShots = input.scriptDoc.shots.filter((shot) => shotNarratorOverlayCount(shot) > 1).length
    const shotsWithDialogue = input.scriptDoc.shots.filter((shot) => shot.dialogue.length > 0).length
    if (shotsWithDialogue > Math.ceil(input.scriptDoc.shots.length / 2)) {
      flags.ugcCreativeWeakness = true
      recordFailure('Contrast narrative dialogue should be sparse. Too many shots rely on spoken lines instead of visual comparison.', { category: 'dialogue' })
    }
    if (dialogueHeavyShots > 1 || dualSpeakerShots > 1) {
      flags.ugcCreativeWeakness = true
      recordFailure('Contrast narrative should avoid frequent back-and-forth dialogue. Keep most beats visual and keep any spoken contrast extremely short.', { category: 'dialogue' })
    }
    if (overlayHeavyShots > 1) {
      flags.ugcCreativeWeakness = true
      recordFailure('Contrast narrative narrator overlay text is too dense. Use overlay text sparingly so the comparison remains instantly readable.', { category: 'dialogue' })
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.some((shot) => typeof shot.formatSubtype === 'string' && shot.formatSubtype.startsWith('faceless_'))) {
    const facelessDialogueShots = input.scriptDoc.shots.filter((shot) => typeof shot.formatSubtype === 'string' && shot.formatSubtype.startsWith('faceless_') && shot.dialogue.length > 0).length
    if (facelessDialogueShots > Math.ceil(input.scriptDoc.shots.length / 2)) {
      flags.ugcCreativeWeakness = true
      recordFailure('Faceless formats should usually stay visual-first. Too many shots rely on dialogue instead of process, object, or screen clarity.', { category: 'dialogue' })
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.some((shot) => isSerializedDramaSubtype(shot.formatSubtype ?? null))) {
    const serializedShots = input.scriptDoc.shots.filter((shot) => isSerializedDramaSubtype(shot.formatSubtype ?? null))
    if (serializedShots.length < 4) {
      flags.ugcCreativeWeakness = true
      recordFailure('Serialized-drama output is under-segmented. Keep the conflict, reveal, and redemption as separate beats instead of collapsing them.', { category: 'structure' })
    }
    const hasConflictBeat = serializedShots.some((shot) => shotHasDramaConflictCue(shotTextForCreativeChecks(shot)))
    const hasRevealBeat = serializedShots.some((shot) => shot.hookRole === 'proof' && shotHasRevealCue(shotTextForCreativeChecks(shot)))
    const hasRedemptionBeat = serializedShots.some((shot) => (shot.hookRole === 'payoff' || shot.hookRole === 'cta') && shotHasRedemptionCue(shotTextForCreativeChecks(shot)))
    if (!hasConflictBeat) {
      flags.ugcCreativeWeakness = true
      recordFailure('Serialized-drama content needs a clearer conflict or taboo rupture before the product appears.', { category: 'preset_fit' })
    }
    if (!hasRevealBeat) {
      flags.ugcCreativeWeakness = true
      recordFailure('Serialized-drama content needs a real reveal beat where the app or product enters as the twist or answer.', { category: 'structure' })
    }
    if (!hasRedemptionBeat) {
      flags.ugcCreativeWeakness = true
      recordFailure('Serialized-drama content needs a redemption beat that visibly resolves the tension before the CTA.', { category: 'structure' })
    }
  }

  if (isUgcFlow && lastShot) {
    const lastShotText = shotTextForCreativeChecks(lastShot)
    if (
      !shotContainsVisibleProofCue(lastShotText)
      && !/\b(winner|wins|final|ending|payoff|cta|proof|strongest|contrast|obvious)\b/.test(normalizeMatchKey(lastShotText))
    ) {
      flags.ugcCreativeWeakness = true
      recordFailure(`UGC final shot "${lastShot.id}" should land as the clearest proof, payoff, or winner frame.`, { shotId: lastShot.id, category: 'hook' })
    }
  }

  for (const relationship of input.scriptDoc.relationships) {
    if (!['equip', 'hold', 'wear'].includes(relationship.type)) continue
    const targetBinding = input.scriptDoc.entityBindings.find((binding) => binding.id === relationship.targetRefId) ?? null
    if (targetBinding?.kind === 'item' && isIncidentalPropName(targetBinding.sourceName || targetBinding.label)) {
      flags.incidentalPropRelationships = true
      recordFailure(`Relationship "${relationship.id}" over-emphasizes incidental prop "${targetBinding.label}".`, { category: 'schema' })
    }
  }

  const uniqueFailures = Array.from(new Set(failures))
  const hardFailures = uniqueFailures.filter((failure) => isHardCinematicQualityFailure(failure))
  const softFailures = uniqueFailures.filter((failure) => !isHardCinematicQualityFailure(failure))
  const diagnostics = Array.from(
    new Map(
      rawDiagnostics.map((entry) => [
        `${entry.scope}:${entry.shotId ?? ''}:${entry.category}:${entry.message}`,
        {
          ...entry,
          severity: isHardCinematicQualityFailure(entry.message) ? 'hard' as const : 'soft' as const,
        },
      ]),
    ).values(),
  )

  return {
    failures: uniqueFailures,
    hardFailures,
    softFailures,
    diagnostics,
    shouldRepair: hardFailures.length > 0,
    flags,
  }
}

export function cinematicScriptPlannerSystemPrompt(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema> = 'story_movie_tv',
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null = null,
  targetShotCount = 5,
) {
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  return [
    'You are the GraphCore cinematic script planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, graphSettings, sequence, diagnostics, assistantNotes.',
    'Plan a cinematic sequence in structured JSON, not markdown, patch operations, or graph nodes.',
    'The prompt context includes a locked entity set that has already been resolved against the project.',
    'Do not invent new entities, rename them, or change their ids.',
    `Write about ${targetShotCount} ordered shots unless the prompt explicitly asks for a nearby count.`,
    'sequence must include: title, logline, tone, continuityNotes, references, scenes, storyboard, shots.',
    'sequence.references must use only locked reference ids and include only refs that are actually needed by the authored shots.',
    'sequence.scenes should group shots by scene and location when useful.',
    'Before writing the shots, decide and set graphSettings for presetFamily, formatSubtype, formulaFamily, dominantTrigger, proofMoment, ctaStyle, and contrastAxis when applicable.',
    'Each shot must include: id, sceneId, title, beat, hookRole, formatSubtype, formulaFamily, dominantTrigger, hookType, targetEmotion, personaStyle, contrastAxis, proofMoment, ctaStyle, proofType, ctaType, shotType, participantRefIds, locationRefId, propRefIds, requiredSourceRefIds, durationSeconds or null, forceTakeBreak, framing, cameraAngle, cameraMovement, lensPreference, visualPrompt, compositionGuide, dialogue, actions, audio.',
    'Use requiredSourceRefIds for the continuity-critical inputs the runtime should connect into the shot.',
    'Do not author takes directly. Takes are derived later from the shot sequence.',
    'If you use Role, only use these exact values: hook, setup, proof, payoff, cta.',
    'Use setup for support, context, or problem beats. Use proof for escalation, mechanism, comparison, or visible evidence beats. Do not invent labels like support or escalation.',
    'Only use reference ids from the locked entity set in sequence.references and sequence.shots.',
    'Only use Props for recurring hero or continuity-critical refs. Everyday carrier objects, staging objects, packaging, surfaces, and background clutter should usually stay inside Action or Composition.',
    'Do not invent new reusable item refs from generic props. If an object is not already in the locked entity set and is not clearly a specific recurring hero object, keep it inside Action or Composition.',
    'When the prompt names multiple phases, split them into separate shot blocks instead of compressing them into one.',
    'beat must be 1 to 3 full sentences of literal on-screen description. Never use placeholders like "hook", "setup", "proof", "payoff", "cta", "use case", or "soft proof" as beat text.',
    'title may be short shorthand. beat may not repeat the role label, summary label, or a one-word outline tag.',
    'Dialogue must use actual spoken lines. Do not summarize what the character says.',
    'Action is the canonical shot script. It must describe only what is visibly happening on screen.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    profile ? `Target use case: ${profile.targetUseCase}` : null,
    profile ? `Audience intent: ${profile.audienceIntent}` : null,
    profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
    profile ? `Allowed formula families: ${profile.allowedFormulaFamilies.join(', ')}.` : null,
    profile ? `Allowed dominant triggers: ${profile.allowedDominantTriggers.join(', ')}.` : null,
    ...exactPlannerEnumInstructions({ presetFamily, formatSubtype }),
    ...presetPlannerInstructions(presetFamily, formatSubtype),
    ...subtypePlannerInstructions(formatSubtype),
    presetFamily !== 'story_movie_tv'
      ? 'For UGC planning, graphSettings should keep the locked formatSubtype, formulaFamily, and dominantTrigger.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'For UGC shots, write literal on-screen descriptions, not clever copy, metaphor, or polished ad-agency prose.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Every UGC shot should be understandable from a still frame and clear enough to read without sound.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Dialogue and narrator overlay text should follow the format. Some presets are dialogue-led, others should stay mostly visual.'
      : null,
    presetFamily === 'ugc_creator'
      ? 'For creator-led formats, include actual spoken dialogue in most shots, especially hook, setup, proof, and CTA beats.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Give each UGC shot one primary job in the arc: hook, pain, mechanism, proof, payoff, or CTA. Use Role to reflect that shot job when helpful.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Make the first UGC shot a stop-scroll image with immediate contrast, problem, or curiosity instead of gentle setup.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'When showing a product, show what it is doing on screen. Do not let the product sit in frame as a passive prop.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Make proof visible in-frame through screens, receipts, containers, comparison states, actions, or other concrete evidence instead of abstract claims like control, confidence, or winning.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Vary the middle shots across different visible payoff dimensions such as time, money, stress, energy, convenience, or proof instead of repeating the same comparison in new words.'
      : null,
    'graphSettings should only include fields that matter for this cinematic.',
  ].filter((entry): entry is string => Boolean(entry)).join('\n')
}

export const cinematicPlannerSystemPrompt = cinematicScriptPlannerSystemPrompt

export function cinematicShotSkeletonPlannerSystemPrompt(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema> = 'story_movie_tv',
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null = null,
  targetShotCount = 5,
) {
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  return [
    'You are the GraphCore cinematic shot planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, graphSettings, shots, diagnostics, assistantNotes.',
    'This is a planning pass, not a final script-writing pass.',
    'Plan a locked shot skeleton only.',
    'Do not invent new entities, rename them, or change their ids.',
    `Write about ${targetShotCount} ordered shots unless the prompt explicitly asks for a nearby count.`,
    'Before planning the shots, decide and set graphSettings for presetFamily, formatSubtype, formulaFamily, dominantTrigger, proofMoment, ctaStyle, and contrastAxis when applicable.',
    'Each shot must include: id, sceneId, title, beat, hookRole, formatSubtype, formulaFamily, dominantTrigger, hookType, targetEmotion, personaStyle, contrastAxis, proofMoment, ctaStyle, proofType, ctaType, shotType, participantRefIds, locationRefId, propRefIds, requiredSourceRefIds, durationSeconds or null, forceTakeBreak, framing, cameraAngle, cameraMovement, lensPreference, visualPrompt, compositionGuide, dialogue, actions, audio.',
    'This planning pass should keep authored content minimal.',
    'beat should be a short planning note about the visible purpose of the shot, not a finished script paragraph.',
    'Set framing, cameraAngle, cameraMovement, lensPreference, visualPrompt, and compositionGuide to empty strings unless a very short structural note is necessary to disambiguate the skeleton.',
    'dialogue, actions, and audio should be empty arrays in this pass unless the prompt makes a non-empty placeholder structurally unavoidable.',
    'Do not author final spoken lines in this planning pass.',
    'Do not author detailed action choreography in this planning pass.',
    'Do not author final camera language or polished visual prompts in this planning pass.',
    'Do not return sequence or scriptDoc in this pass.',
    'Only use Role values hook, setup, proof, payoff, cta.',
    'Only use reference ids from the locked entity set.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    profile ? `Target use case: ${profile.targetUseCase}` : null,
    profile ? `Audience intent: ${profile.audienceIntent}` : null,
    profile ? `Locked shot job order: ${profile.shotRoleSequence.join(' -> ')}.` : null,
    profile ? `Allowed formula families: ${profile.allowedFormulaFamilies.join(', ')}.` : null,
    profile ? `Allowed dominant triggers: ${profile.allowedDominantTriggers.join(', ')}.` : null,
    ...exactPlannerEnumInstructions({ presetFamily, formatSubtype }),
    ...presetPlannerInstructions(presetFamily, formatSubtype),
    ...subtypePlannerInstructions(formatSubtype),
    presetFamily !== 'story_movie_tv'
      ? 'For UGC planning, keep the shot plan visual-first, structurally clear, and easy to author later.'
      : null,
    'graphSettings should only include fields that matter for this cinematic.',
  ].filter((entry): entry is string => Boolean(entry)).join('\n')
}

export const cinematicShotAuthorshipRawSchema = z.object({
  shots: z.preprocess((value) => {
    if (!Array.isArray(value)) return []
    return value.map((entry, shotIndex) => {
      const shot = asRecord(entry)
      if (!shot) {
        return {
          id: `shot_${shotIndex + 1}`,
          beat: '',
          framing: '',
          cameraAngle: '',
          cameraMovement: '',
          lensPreference: '',
          visualPrompt: '',
          compositionGuide: '',
          dialogue: [],
          actions: [],
          audio: [],
        }
      }

      const shotId = pickFirstString(shot, ['id', 'shotId']) || `shot_${shotIndex + 1}`
      const normalizeDialogue = (dialogueEntry: unknown, dialogueIndex: number) => {
        const parsed = dialogueBeatSchema.safeParse(dialogueEntry)
        if (parsed.success) return parsed.data
        if (typeof dialogueEntry === 'string') {
          const trimmed = dialogueEntry.trim()
          if (!trimmed) return null
          const speakerMatch = trimmed.match(/^([^:]{1,80}):\s+(.+)$/)
          return {
            id: `${shotId}_dialogue_${dialogueIndex + 1}`,
            speakerRefId: null,
            line: speakerMatch?.[2]?.trim() || trimmed,
            delivery: speakerMatch?.[1]?.trim() || '',
            startSeconds: null,
            endSeconds: null,
            lipSync: true,
          }
        }
        const record = asRecord(dialogueEntry)
        if (!record) return null
        const line = pickFirstString(record, ['line', 'text', 'dialogue', 'spokenLine', 'content'])
        if (!line) return null
        return {
          id: pickFirstString(record, ['id']) || `${shotId}_dialogue_${dialogueIndex + 1}`,
          speakerRefId: pickFirstString(record, ['speakerRefId', 'speakerId']) || null,
          line,
          delivery: pickFirstString(record, ['delivery', 'tone', 'style', 'speaker']) || '',
          startSeconds: typeof record.startSeconds === 'number' ? record.startSeconds : null,
          endSeconds: typeof record.endSeconds === 'number' ? record.endSeconds : null,
          lipSync: typeof record.lipSync === 'boolean' ? record.lipSync : true,
        }
      }
      const normalizeAction = (actionEntry: unknown, actionIndex: number) => {
        const parsed = actionBeatSchema.safeParse(actionEntry)
        if (parsed.success) return parsed.data
        if (typeof actionEntry === 'string') {
          const trimmed = actionEntry.trim()
          if (!trimmed) return null
          return {
            id: `${shotId}_action_${actionIndex + 1}`,
            actorRefId: null,
            targetRefId: null,
            verb: trimmed,
            propRefId: null,
            stagingNotes: '',
            startSeconds: null,
            endSeconds: null,
          }
        }
        const record = asRecord(actionEntry)
        if (!record) return null
        const verb = pickFirstString(record, ['verb', 'action', 'text', 'description', 'stagingNotes'])
        if (!verb) return null
        return {
          id: pickFirstString(record, ['id']) || `${shotId}_action_${actionIndex + 1}`,
          actorRefId: pickFirstString(record, ['actorRefId', 'actorId']) || null,
          targetRefId: pickFirstString(record, ['targetRefId', 'targetId']) || null,
          verb,
          propRefId: pickFirstString(record, ['propRefId', 'propId']) || null,
          stagingNotes: pickFirstString(record, ['stagingNotes', 'notes']) || '',
          startSeconds: typeof record.startSeconds === 'number' ? record.startSeconds : null,
          endSeconds: typeof record.endSeconds === 'number' ? record.endSeconds : null,
        }
      }
      const normalizeAudio = (audioEntry: unknown, audioIndex: number) => {
        const parsed = audioBeatSchema.safeParse(audioEntry)
        if (parsed.success) return parsed.data
        if (typeof audioEntry === 'string') {
          const trimmed = audioEntry.trim()
          if (!trimmed) return null
          return {
            id: `${shotId}_audio_${audioIndex + 1}`,
            kind: 'ambience' as const,
            cue: trimmed,
            sourceRefId: null,
            startSeconds: null,
            endSeconds: null,
          }
        }
        const record = asRecord(audioEntry)
        if (!record) return null
        const cue = pickFirstString(record, ['cue', 'text', 'audio', 'sound', 'description'])
        if (!cue) return null
        return {
          id: pickFirstString(record, ['id']) || `${shotId}_audio_${audioIndex + 1}`,
          kind: parseNullableEnumValue(cinematicAudioCueKindSchema, record.kind) ?? 'ambience',
          cue,
          sourceRefId: pickFirstString(record, ['sourceRefId', 'sourceId']) || null,
          startSeconds: typeof record.startSeconds === 'number' ? record.startSeconds : null,
          endSeconds: typeof record.endSeconds === 'number' ? record.endSeconds : null,
        }
      }

      return {
        id: shotId,
        beat: pickFirstString(shot, ['beat', 'summary', 'description']),
        framing: pickFirstString(shot, ['framing']),
        cameraAngle: pickFirstString(shot, ['cameraAngle']),
        cameraMovement: pickFirstString(shot, ['cameraMovement']),
        lensPreference: pickFirstString(shot, ['lensPreference']),
        visualPrompt: pickFirstString(shot, ['visualPrompt', 'prompt']),
        compositionGuide: pickFirstString(shot, ['compositionGuide', 'stagingNotes']),
        dialogue: Array.isArray(shot.dialogue ?? shot.lines)
          ? (shot.dialogue ?? shot.lines)
              .map((dialogueEntry, dialogueIndex) => normalizeDialogue(dialogueEntry, dialogueIndex))
              .filter((dialogueEntry): dialogueEntry is z.infer<typeof dialogueBeatSchema> => dialogueEntry !== null)
          : [],
        actions: Array.isArray(shot.actions)
          ? shot.actions
              .map((actionEntry, actionIndex) => normalizeAction(actionEntry, actionIndex))
              .filter((actionEntry): actionEntry is z.infer<typeof actionBeatSchema> => actionEntry !== null)
          : [],
        audio: Array.isArray(shot.audio ?? shot.sound)
          ? (shot.audio ?? shot.sound)
              .map((audioEntry, audioIndex) => normalizeAudio(audioEntry, audioIndex))
              .filter((audioEntry): audioEntry is z.infer<typeof audioBeatSchema> => audioEntry !== null)
          : [],
      }
    })
  }, z.array(z.object({
    id: z.string(),
    beat: z.string().default(''),
    framing: z.string().default(''),
    cameraAngle: z.string().default(''),
    cameraMovement: z.string().default(''),
    lensPreference: z.string().default(''),
    visualPrompt: z.string().default(''),
    compositionGuide: z.string().default(''),
    dialogue: z.array(dialogueBeatSchema).default([]),
    actions: z.array(actionBeatSchema).default([]),
    audio: z.array(audioBeatSchema).default([]),
  }))).default([]),
  diagnostics: z.preprocess((value) => {
    if (Array.isArray(value)) return asStringArray(value)
    const record = asRecord(value)
    if (record) return Object.entries(record).map(([key, item]) => `${key}: ${String(item)}`)
    return []
  }, z.array(z.string()).default([])),
  assistantNotes: z.preprocess((value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return asStringArray(value).join('\n')
    const record = asRecord(value)
    if (record) return JSON.stringify(record)
    return undefined
  }, z.string().optional()),
})

export function cinematicShotAuthorshipSystemPrompt(
  input: {
    presetFamily?: z.infer<typeof cinematicPresetFamilySchema>
    formatSubtype?: z.infer<typeof cinematicFormatSubtypeSchema> | null
    formulaFamily?: z.infer<typeof cinematicFormulaFamilySchema> | null
    dominantTrigger?: z.infer<typeof cinematicDominantTriggerSchema> | null
    proofMoment?: string | null
    ctaStyle?: string | null
    contrastAxis?: string | null
    graphSettings?: Partial<CinematicPlan['graphSettings']> | null
    projectArtStylePreset?: string | null
  } = {},
) {
  const presetFamily = input.presetFamily ?? 'story_movie_tv'
  const formatSubtype = input.formatSubtype ?? null
  const profile = getUgcPresetProfile(formatSubtype, presetFamily)
  const artStyleResolution = resolveAuthorshipArtStylePreset({
    graphSettings: input.graphSettings ?? null,
    presetFamily,
    formatSubtype,
    projectArtStylePreset: input.projectArtStylePreset ?? null,
  })
  return [
    'You are the GraphCore cinematic shot author.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: shots, diagnostics, assistantNotes.',
    'You are filling authored content for an already locked shot skeleton.',
    'Do not change shot ids, shot count, shot order, participants, locations, props, preset settings, or graph topology.',
    'For each supplied shot id, write authored content only for: beat, framing, cameraAngle, cameraMovement, lensPreference, visualPrompt, compositionGuide, dialogue, actions, audio.',
    'beat must be 1 to 3 full sentences of literal on-screen description.',
    'beat may not be placeholders like hook, setup, proof, payoff, cta, use case, soft proof, or generic outline tags.',
    'Write the final camera and prompt language here. This is the canonical creative-writing pass for shot direction.',
    'framing, cameraAngle, cameraMovement, lensPreference, visualPrompt, and compositionGuide should all be intentionally authored unless the shot is truly static and obvious.',
    'Dialogue must use actual spoken lines. Do not summarize what someone says.',
    'Actions must describe only visible on-screen behavior.',
    'Audio should describe spoken dialogue, ambience, or intentional sound cues only when they materially support the shot.',
    'If a shot should stay silent, audio may be empty.',
    'Creator-led formats should include real spoken dialogue in most hook, setup, proof, and CTA shots.',
    'This output is invalid if preset-required dialogue, actions, or proof are missing.',
    'Every authored shot must include at least one action beat.',
    'Do not invent new entities or new reusable refs.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    input.formulaFamily ? `Locked formula family: ${input.formulaFamily}.` : null,
    input.dominantTrigger ? `Locked dominant trigger: ${input.dominantTrigger}.` : null,
    input.proofMoment ? `Locked proof pattern: ${input.proofMoment}.` : null,
    input.ctaStyle ? `Locked CTA style: ${input.ctaStyle}.` : null,
    input.contrastAxis ? `Locked contrast axis: ${input.contrastAxis}.` : null,
    profile ? `Target use case: ${profile.targetUseCase}` : null,
    profile ? `Audience intent: ${profile.audienceIntent}` : null,
    artStyleResolution ? `Effective art style: ${getArtStylePresetLabel(artStyleResolution.presetId)} (${artStyleResolution.source}).` : null,
    ...getArtStylePresetPromptDirectives(artStyleResolution.presetId),
    ...presetPlannerInstructions(presetFamily, formatSubtype),
    ...subtypePlannerInstructions(formatSubtype),
    ...(presetFamily !== 'story_movie_tv' ? sharedUgcAuthorshipRules(formatSubtype) : []),
    ...(presetFamily !== 'story_movie_tv' ? subtypeAuthorshipRules(presetFamily, formatSubtype) : []),
    ...(presetFamily !== 'story_movie_tv' ? roleAuthorshipRules(presetFamily, formatSubtype) : []),
    ...authorshipGoodBadExamples(presetFamily, formatSubtype),
    presetFamily === 'ugc_creator'
      ? 'Creator dialogue should sound like a person speaking privately to camera, not like polished ad copy or broad brand claims.'
      : null,
    presetFamily === 'ugc_direct_response_ad'
      ? 'Direct-response dialogue and visuals should move quickly from pain or curiosity into visible proof. Product function must be legible before the CTA.'
      : null,
    presetFamily === 'ugc_faceless_format'
      ? 'Faceless outputs should stay visual-first. Prefer readable process, screen, or object staging over face-led confessional language.'
      : null,
  ].filter((entry): entry is string => Boolean(entry)).join('\n')
}

function resolveEffectiveGraphSettingsFromRawPlan(rawPlan: z.infer<typeof cinematicPlannerRawSchema>) {
  const rawGraphSettings = {
    ...(rawPlan.graphSettings ?? {}),
    presetFamily: parseNullableEnumValue(cinematicPresetFamilySchema, rawPlan.graphSettings?.presetFamily),
    formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, rawPlan.graphSettings?.formatSubtype),
    formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, rawPlan.graphSettings?.formulaFamily),
    dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, rawPlan.graphSettings?.dominantTrigger),
  }
  const inferredPresetFamily =
    rawGraphSettings?.presetFamily
    ?? inferCinematicPresetFamilyFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`)
  const correctedSelection = correctUgcPresetSelectionForPromptText({
    prompt: `${rawPlan.requestSummary} ${rawPlan.graphSummary}`,
    presetFamily: inferredPresetFamily,
    formatSubtype: rawGraphSettings?.formatSubtype
      ?? inferCinematicFormatSubtypeFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`, inferredPresetFamily),
  })
  const correctedPresetFamily = correctedSelection.presetFamily
  const inferredFormatSubtype = coerceFormatSubtypeForPresetFamily(
    correctedPresetFamily,
    correctedSelection.formatSubtype,
  )
  const presetPatch = buildCinematicSettingsPatchFromPresetFamily(correctedPresetFamily)
  const subtypePatch = buildCinematicSettingsPatchFromFormatSubtype(correctedPresetFamily, inferredFormatSubtype)
  const effectiveGraphSettings = {
    ...presetPatch,
    ...subtypePatch,
    ...rawGraphSettings,
    formatSubtype: inferredFormatSubtype,
    formulaFamily: rawGraphSettings.formulaFamily ?? subtypePatch.formulaFamily ?? deriveDefaultFormulaFamilyFromFormatSubtype(inferredFormatSubtype),
    dominantTrigger: rawGraphSettings.dominantTrigger ?? subtypePatch.dominantTrigger ?? deriveDefaultDominantTriggerFromFormatSubtype(inferredFormatSubtype),
    presetFamily: correctedPresetFamily,
  }

  return {
    rawGraphSettings,
    inferredPresetFamily: correctedPresetFamily,
    inferredFormatSubtype,
    effectiveGraphSettings,
  }
}

export function materializeCinematicPlanSkeleton(rawPlan: z.infer<typeof cinematicPlannerRawSchema>) {
  const {
    inferredPresetFamily,
    effectiveGraphSettings,
  } = resolveEffectiveGraphSettingsFromRawPlan(rawPlan)
  const normalizedShots = rawPlan.shots.map((rawShot) => cinematicShotPlanSchema.parse({
    ...rawShot,
    beat: typeof rawShot.beat === 'string' ? rawShot.beat : '',
    framing: '',
    cameraAngle: '',
    cameraMovement: '',
    lensPreference: '',
    visualPrompt: '',
    compositionGuide: '',
    dialogue: [],
    actions: [],
    audio: [],
  }))
  const normalizedDerivedShots = normalizedShots.map((shot, index, allShots) => applyPresetDefaultsToShotPlan({
    shot,
    presetFamily: inferredPresetFamily,
    formatSubtype: effectiveGraphSettings.formatSubtype ?? null,
    formulaFamily: effectiveGraphSettings.formulaFamily ?? null,
    dominantTrigger: effectiveGraphSettings.dominantTrigger ?? null,
    contrastAxis: effectiveGraphSettings.contrastAxis ?? '',
    proofMoment: effectiveGraphSettings.proofMoment ?? '',
    ctaStyle: effectiveGraphSettings.ctaStyle ?? '',
    shotIndex: index,
    shotCount: allShots.length,
  })).map((shot) => ({
    ...shot,
    dialogue: [],
    actions: [],
    audio: [],
  }))

  if (normalizedDerivedShots.length === 0) {
    throw new Error('Cinematic planner produced zero shots. The cinematic plan is invalid.')
  }

  return cinematicPlanSchema.parse({
    graphName: rawPlan.graphName,
    graphSummary: rawPlan.graphSummary,
    entityRefs: rawPlan.entityRefs,
    rawScriptMarkdown: '',
    scriptDoc: null,
    relationshipRefs: rawPlan.relationshipRefs,
    compositeRefPlans: rawPlan.compositeRefPlans,
    storyboardPlan: rawPlan.storyboardPlan,
    shots: normalizedDerivedShots,
    graphSettings: effectiveGraphSettings,
    autoRun: false,
  })
}

export function authorCinematicPlanSkeleton(input: {
  plan: CinematicPlan
  authoredShots: z.infer<typeof cinematicShotAuthorshipRawSchema>['shots']
}) {
  const authoredById = new Map(input.authoredShots.map((shot) => [shot.id, shot]))
  return materializeCinematicPlan({
    requestSummary: input.plan.graphSummary || input.plan.graphName,
    graphName: input.plan.graphName,
    graphSummary: input.plan.graphSummary,
    rawScriptMarkdown: input.plan.rawScriptMarkdown ?? '',
    entityRefs: input.plan.entityRefs,
    relationshipRefs: input.plan.relationshipRefs,
    compositeRefPlans: input.plan.compositeRefPlans,
    storyboardPlan: input.plan.storyboardPlan,
    graphSettings: input.plan.graphSettings ?? {},
    diagnostics: [],
    assistantNotes: undefined,
    shots: input.plan.shots.map((shot) => {
      const authored = authoredById.get(shot.id)
      const defaultParticipantRefId = shot.participantRefIds.length === 1 ? shot.participantRefIds[0] : null
      return cinematicShotPlanSchema.parse({
        ...shot,
        beat: authored?.beat?.trim() || shot.beat || '',
        framing: authored?.framing?.trim() || shot.framing || '',
        cameraAngle: authored?.cameraAngle?.trim() || shot.cameraAngle || '',
        cameraMovement: authored?.cameraMovement?.trim() || shot.cameraMovement || '',
        lensPreference: authored?.lensPreference?.trim() || shot.lensPreference || '',
        visualPrompt: authored?.visualPrompt?.trim() || shot.visualPrompt || '',
        compositionGuide: authored?.compositionGuide?.trim() || shot.compositionGuide || '',
        dialogue: (authored?.dialogue ?? shot.dialogue ?? []).map((entry) => ({
          ...entry,
          speakerRefId: entry.speakerRefId ?? defaultParticipantRefId,
        })),
        actions: (authored?.actions ?? shot.actions ?? []).map((entry) => ({
          ...entry,
          actorRefId: entry.actorRefId ?? defaultParticipantRefId,
        })),
        audio: authored?.audio ?? shot.audio ?? [],
      })
    }),
    scriptDoc: null,
    sequence: null,
  })
}

export function cinematicGraphAuthorSystemPrompt() {
  return [
    'You convert a cinematic plan into a concrete GraphCore cinematic graph spec.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: graphName, graphSummary, graphSettings, assetRefs, shots.',
    'Do not invent entities beyond the supplied resolved entity refs.',
    'assetRefs should map resolved definitions into source nodes, and may also include storyboard_ref or composite_ref nodes when they improve continuity.',
    'shots should be authored in final execution order.',
    'Each shot must preserve the planned participantRefIds, locationRefId, and propRefIds whenever they were supplied.',
    'Each shot should reference sourceRefIds that will connect into asset_in edges.',
    'sourceRefIds are required structural inputs for still generation, not optional metadata.',
    'Do not remove planned source refs from a shot.',
    'Prefer storyboard_ref nodes for sequence board or shot panel references when they are available in the plan.',
    'Prefer composite_ref nodes for subject-plus-prop or subject-plus-wardrobe continuity when the plan contains those combinations.',
    'Include a compositionGuide for each shot that explains staging, blocking, ingredient priority, and how the scene should combine the supplied sources.',
    'Preserve and carry through dialogue, action, and audio beat structure from the planned shots.',
    'Keep the graph linear unless the provided plan explicitly mentions variations.',
  ].join('\n')
}

export function finalizeCinematicEntityRefs(
  rawEntityRefs: z.infer<typeof cinematicPlannerRawSchema>['entityRefs'],
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  return rawEntityRefs.map((entityRef) => {
    const deterministicMatch = findStrongExistingDefinitionMatch(catalog, entityRef.sourceName, entityRef.kind)
    if (deterministicMatch) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: deterministicMatch.definitionKey,
        planItemId: null,
      }
    }

    const explicitCandidate = entityRef.definitionKey
      ? catalog.find((entry) => entry.definitionKey === entityRef.definitionKey && entry.kind === entityRef.kind) ?? null
      : null

    if (explicitCandidate) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: explicitCandidate.definitionKey,
        planItemId: null,
      }
    }

    const crossKindMatch = findStrongExistingDefinitionMatchAcrossKinds(catalog, entityRef.sourceName)
    if (crossKindMatch) {
      return {
        ...entityRef,
        kind: crossKindMatch.kind,
        resolution: 'existing' as const,
        definitionKey: crossKindMatch.definitionKey,
        planItemId: null,
      }
    }

    return {
      ...entityRef,
      resolution: 'create' as const,
      definitionKey: null,
      planItemId: entityRef.planItemId ?? `${entityRef.kind}_${entityRef.id}`,
    }
  })
}

function applyPresetDefaultsToShotPlan(input: {
  shot: z.infer<typeof cinematicShotPlanSchema>
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null
  formulaFamily: z.infer<typeof cinematicFormulaFamilySchema> | null
  dominantTrigger: z.infer<typeof cinematicDominantTriggerSchema> | null
  contrastAxis: string
  proofMoment: string
  ctaStyle: string
  shotIndex: number
  shotCount: number
}) {
  const effectiveFormatSubtype = coerceFormatSubtypeForPresetFamily(
    input.presetFamily,
    input.shot.formatSubtype ?? input.formatSubtype,
  )
  const defaults = deriveUgcShotDefaults({
    presetFamily: input.presetFamily,
    formatSubtype: effectiveFormatSubtype,
    shotIndex: input.shotIndex,
    shotCount: input.shotCount,
    hookRole: input.shot.hookRole ?? null,
  })

  return cinematicShotPlanSchema.parse({
    ...input.shot,
    hookRole: input.shot.hookRole ?? defaults.hookRole,
    formatSubtype: effectiveFormatSubtype,
    formulaFamily: input.shot.formulaFamily ?? input.formulaFamily ?? defaults.formulaFamily,
    dominantTrigger: input.shot.dominantTrigger ?? input.dominantTrigger ?? defaults.dominantTrigger,
    hookType: nonEmptyString(input.shot.hookType, defaults.hookType),
    targetEmotion: nonEmptyString(input.shot.targetEmotion, defaults.targetEmotion),
    personaStyle: nonEmptyString(input.shot.personaStyle, defaults.personaStyle),
    contrastAxis: nonEmptyString(input.shot.contrastAxis, input.contrastAxis || defaults.contrastAxis),
    proofMoment: nonEmptyString(input.shot.proofMoment, input.proofMoment || defaults.proofMoment),
    ctaStyle: nonEmptyString(input.shot.ctaStyle, input.ctaStyle || defaults.ctaStyle),
    proofType: nonEmptyString(input.shot.proofType, defaults.proofType),
    ctaType: nonEmptyString(input.shot.ctaType, defaults.ctaType),
  })
}

export function materializeCinematicPlan(rawPlan: z.infer<typeof cinematicPlannerRawSchema>) {
  const rawGraphSettings = {
    ...(rawPlan.graphSettings ?? {}),
    presetFamily: parseNullableEnumValue(cinematicPresetFamilySchema, rawPlan.graphSettings?.presetFamily),
    formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, rawPlan.graphSettings?.formatSubtype),
    formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, rawPlan.graphSettings?.formulaFamily),
    dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, rawPlan.graphSettings?.dominantTrigger),
  }
  const inferredPresetFamily =
    rawGraphSettings?.presetFamily
    ?? inferCinematicPresetFamilyFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`)
  const correctedSelection = correctUgcPresetSelectionForPromptText({
    prompt: `${rawPlan.requestSummary} ${rawPlan.graphSummary}`,
    presetFamily: inferredPresetFamily,
    formatSubtype: rawGraphSettings?.formatSubtype
      ?? inferCinematicFormatSubtypeFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`, inferredPresetFamily),
  })
  const correctedPresetFamily = correctedSelection.presetFamily
  const inferredFormatSubtype = coerceFormatSubtypeForPresetFamily(
    correctedPresetFamily,
    correctedSelection.formatSubtype,
  )
  const presetPatch = buildCinematicSettingsPatchFromPresetFamily(correctedPresetFamily)
  const subtypePatch = buildCinematicSettingsPatchFromFormatSubtype(correctedPresetFamily, inferredFormatSubtype)
  const effectiveGraphSettings = {
    ...presetPatch,
    ...subtypePatch,
    ...rawGraphSettings,
    formatSubtype: inferredFormatSubtype,
    formulaFamily: rawGraphSettings.formulaFamily ?? subtypePatch.formulaFamily ?? deriveDefaultFormulaFamilyFromFormatSubtype(inferredFormatSubtype),
    dominantTrigger: rawGraphSettings.dominantTrigger ?? subtypePatch.dominantTrigger ?? deriveDefaultDominantTriggerFromFormatSubtype(inferredFormatSubtype),
    presetFamily: correctedPresetFamily,
  }
  const sequence = rawPlan.sequence
    ? compileCinematicSequence(cinematicSequenceSchema.parse(rawPlan.sequence))
    : buildCinematicSequenceFromScriptDoc(rawPlan.scriptDoc
      ? cinematicScriptDocSchema.parse(rawPlan.scriptDoc)
      : cinematicScriptDocSchema.parse({
        title: rawPlan.graphName,
        logline: rawPlan.graphSummary,
        entityBindings: rawPlan.entityRefs.map((entityRef) => ({
          id: entityRef.id,
          kind: entityRef.kind,
          role: entityRef.role,
          label: entityRef.sourceName,
          sourceName: entityRef.sourceName,
          summary: entityRef.summary,
          definitionKey: entityRef.definitionKey ?? null,
          assetKey: null,
          stagingNotes: '',
          priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
          required: true,
        })),
        scenes: rawPlan.shots.length > 0 ? [{
          id: 'scene_1',
          title: 'Scene 1',
          summary: rawPlan.graphSummary,
          locationRefId: rawPlan.shots[0]?.locationRefId ?? null,
          shotIds: rawPlan.shots.map((shot) => shot.id),
          continuityNotes: '',
          orderIndex: 0,
        }] : [],
        shots: rawPlan.shots.map((shot, index) => ({
          id: shot.id,
          sceneId: 'scene_1',
          orderIndex: index,
          title: shot.title,
          subtitle: null,
          beat: shot.beat,
          emotionalBeat: '',
          hookRole: shot.hookRole,
          formatSubtype: shot.formatSubtype ?? effectiveGraphSettings.formatSubtype ?? null,
          formulaFamily: shot.formulaFamily ?? effectiveGraphSettings.formulaFamily ?? null,
          dominantTrigger: shot.dominantTrigger ?? effectiveGraphSettings.dominantTrigger ?? null,
          hookType: shot.hookType,
          targetEmotion: shot.targetEmotion,
          personaStyle: shot.personaStyle,
          contrastAxis: shot.contrastAxis,
          proofMoment: shot.proofMoment,
          ctaStyle: shot.ctaStyle,
          proofType: shot.proofType,
          ctaType: shot.ctaType,
          platformTarget: shot.platformTarget,
          shotType: shot.shotType,
          framing: shot.framing,
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          lensPreference: shot.lensPreference,
          visualPrompt: shot.visualPrompt,
          compositionGuide: shot.compositionGuide,
          continuityNotes: '',
          participantRefIds: shot.participantRefIds,
          locationRefId: shot.locationRefId,
          propRefIds: shot.propRefIds,
          requiredSourceRefIds: Array.from(new Set(
            shot.requiredSourceRefIds.length > 0
              ? shot.requiredSourceRefIds
              : [
                  ...shot.participantRefIds,
                  ...(shot.locationRefId ? [shot.locationRefId] : []),
                  ...shot.propRefIds,
                ],
          )),
          compositeRefIds: shot.compositeRefIds,
          storyboardRefIds: shot.storyboardRefIds,
          durationSeconds: shot.durationSeconds,
          forceTakeBreak: shot.forceTakeBreak,
          beats: shot.beats,
          dialogue: shot.dialogue,
          actions: shot.actions,
          audio: shot.audio,
          })),
        relationships: rawPlan.relationshipRefs,
        compositeRefs: rawPlan.compositeRefPlans,
        storyboard: rawPlan.storyboardPlan,
      }))
  if (sequence.shots.length === 0) {
    throw new Error('Cinematic plan materialization produced zero shots. The authored cinematic plan is invalid.')
  }
  if (sequence.takes.length === 0) {
    throw new Error('Cinematic plan materialization produced zero takes. The authored cinematic plan is invalid.')
  }
  const scriptDoc = deriveCinematicScriptFromSequence(sequence)
  const derivedShots = scriptDoc.shots.map((shot) => cinematicShotPlanSchema.parse({
    id: shot.id,
    sceneId: shot.sceneId,
    title: shot.title,
    beat: shot.beat,
    hookRole: shot.hookRole,
    formatSubtype: shot.formatSubtype ?? effectiveGraphSettings.formatSubtype ?? null,
    formulaFamily: shot.formulaFamily ?? effectiveGraphSettings.formulaFamily ?? null,
    dominantTrigger: shot.dominantTrigger ?? effectiveGraphSettings.dominantTrigger ?? null,
    hookType: shot.hookType,
    targetEmotion: shot.targetEmotion,
    personaStyle: shot.personaStyle,
    contrastAxis: shot.contrastAxis,
    proofMoment: shot.proofMoment,
    ctaStyle: shot.ctaStyle,
    proofType: shot.proofType,
    ctaType: shot.ctaType,
    platformTarget: shot.platformTarget,
    participantRefIds: shot.participantRefIds,
    locationRefId: shot.locationRefId,
    propRefIds: shot.propRefIds,
    requiredSourceRefIds: shot.requiredSourceRefIds,
    compositeRefIds: shot.compositeRefIds,
    storyboardRefIds: shot.storyboardRefIds,
    shotType: shot.shotType,
    framing: shot.framing,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    lensPreference: shot.lensPreference,
    durationSeconds: shot.durationSeconds,
    forceTakeBreak: shot.forceTakeBreak,
    visualPrompt: shot.visualPrompt,
    compositionGuide: shot.compositionGuide,
    beats: shot.beats,
    dialogue: shot.dialogue,
    actions: shot.actions,
    audio: shot.audio,
  }))
  const normalizedDerivedShots = derivedShots.map((shot, index, allShots) => applyPresetDefaultsToShotPlan({
    shot,
    presetFamily: correctedPresetFamily,
    formatSubtype: effectiveGraphSettings.formatSubtype ?? null,
    formulaFamily: effectiveGraphSettings.formulaFamily ?? null,
    dominantTrigger: effectiveGraphSettings.dominantTrigger ?? null,
    contrastAxis: effectiveGraphSettings.contrastAxis ?? '',
    proofMoment: effectiveGraphSettings.proofMoment ?? '',
    ctaStyle: effectiveGraphSettings.ctaStyle ?? '',
    shotIndex: index,
    shotCount: allShots.length,
  }))
  const normalizedScriptDoc = cinematicScriptDocSchema.parse({
    ...scriptDoc,
    shots: scriptDoc.shots.map((shot, index) => ({
      ...shot,
      hookRole: normalizedDerivedShots[index]?.hookRole ?? shot.hookRole,
      formatSubtype: normalizedDerivedShots[index]?.formatSubtype ?? shot.formatSubtype,
      formulaFamily: normalizedDerivedShots[index]?.formulaFamily ?? shot.formulaFamily,
      dominantTrigger: normalizedDerivedShots[index]?.dominantTrigger ?? shot.dominantTrigger,
      hookType: normalizedDerivedShots[index]?.hookType ?? shot.hookType,
      targetEmotion: normalizedDerivedShots[index]?.targetEmotion ?? shot.targetEmotion,
      personaStyle: normalizedDerivedShots[index]?.personaStyle ?? shot.personaStyle,
      contrastAxis: normalizedDerivedShots[index]?.contrastAxis ?? shot.contrastAxis,
      proofMoment: normalizedDerivedShots[index]?.proofMoment ?? shot.proofMoment,
      ctaStyle: normalizedDerivedShots[index]?.ctaStyle ?? shot.ctaStyle,
      proofType: normalizedDerivedShots[index]?.proofType ?? shot.proofType,
      ctaType: normalizedDerivedShots[index]?.ctaType ?? shot.ctaType,
    })),
  })

  return cinematicPlanSchema.parse({
    graphName: rawPlan.graphName,
    graphSummary: rawPlan.graphSummary,
    entityRefs: rawPlan.entityRefs,
    rawScriptMarkdown: rawPlan.rawScriptMarkdown ?? '',
    scriptDoc: normalizedScriptDoc,
    relationshipRefs: normalizedScriptDoc.relationships,
    compositeRefPlans: normalizedScriptDoc.compositeRefs,
    storyboardPlan: normalizedScriptDoc.storyboard,
    shots: normalizedDerivedShots,
    graphSettings: effectiveGraphSettings,
    autoRun: false,
  })
}

export function buildCinematicGraphFromAuthorPlan(input: {
  graphKey: string
  graphName: string
  graphSummary: string
  graphSettings: Record<string, unknown>
  cinematicPlan?: CinematicPlan | null
  authorPlan: z.infer<typeof cinematicGraphAuthorSchema>
}) {
  const sequence = cinematicSequenceSchema.parse({
    title: input.authorPlan.graphName || input.graphName,
    logline: input.authorPlan.graphSummary || input.graphSummary,
    tone: '',
    continuityNotes: '',
    statusPayoffType: '',
    narrativeArcTemplate: '',
    references: input.authorPlan.assetRefs
      .filter((ref) => ref.nodeType === 'asset_ref')
      .map((ref) => ({
        id: ref.id,
        refKind: ref.definitionKey ? 'definition' : ref.assetRole === 'audio' ? 'audio' : ref.assetRole === 'style' ? 'style' : 'asset',
        role: ref.role,
        label: ref.title,
        summary: ref.subtitle ?? '',
        definitionKey: ref.definitionKey,
        assetKey: ref.assetKey,
        assetRole: ref.assetRole,
        stagingNotes: ref.stagingNotes,
        priority: ref.priority,
        required: true,
      })),
    scenes: input.cinematicPlan?.scriptDoc?.scenes ?? (input.authorPlan.shots.length > 0 ? [{
      id: 'scene_1',
      title: 'Scene 1',
      summary: input.authorPlan.graphSummary || input.graphSummary,
      locationRefId: input.authorPlan.shots[0]?.locationRefId ?? null,
      shotIds: input.authorPlan.shots.map((shot) => shot.id),
      continuityNotes: '',
      orderIndex: 0,
    }] : []),
    compositeRefs: input.authorPlan.assetRefs
      .filter((ref) => ref.nodeType === 'composite_ref')
      .map((ref) => ({
        id: ref.id,
        title: ref.title,
        summary: ref.subtitle ?? '',
        relationshipType: ref.relationshipType ?? 'equip',
        sourceRefIds: ref.sourceRefIds,
        outputAssetKey: ref.assetKey,
        generationPrompt: ref.stagingNotes,
        stagingNotes: ref.stagingNotes,
        priority: ref.priority,
      })),
    relationships: input.cinematicPlan?.relationshipRefs ?? [],
    storyboard:
      input.cinematicPlan?.storyboardPlan
      ?? {
        mode: input.authorPlan.assetRefs.some((ref) => ref.nodeType === 'storyboard_ref') ? 'hybrid' : 'none',
        summary: '',
        sequenceAssetKey: input.authorPlan.assetRefs.find((ref) => ref.templateKey === 'sequence_board_ref')?.assetKey ?? null,
        panels: input.authorPlan.assetRefs
          .filter((ref) => ref.nodeType === 'storyboard_ref' && ref.templateKey !== 'sequence_board_ref')
          .map((ref, index) => ({
            id: ref.id,
            shotId: input.cinematicPlan?.storyboardPlan?.panels.find((panel) => panel.id === ref.id)?.shotId ?? null,
            title: ref.title,
            assetKey: ref.assetKey,
            notes: ref.stagingNotes,
            orderIndex: index,
          })),
      },
    shots: input.authorPlan.shots.map((shot) => ({
      id: shot.id,
      sceneId: input.cinematicPlan?.scriptDoc?.shots.find((entry) => entry.id === shot.id)?.sceneId ?? 'scene_1',
      title: shot.title,
      subtitle: shot.subtitle,
      beat: shot.beat,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: shot.sourceRefIds,
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot.durationSeconds,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    takes: [],
  })

  return compileCinematicGraphFromSequence({
    graphKey: input.graphKey,
    graphName: input.authorPlan.graphName || input.graphName,
    graphSummary: input.authorPlan.graphSummary || input.graphSummary,
    graphSettings: input.graphSettings,
    sequence,
  })
}
