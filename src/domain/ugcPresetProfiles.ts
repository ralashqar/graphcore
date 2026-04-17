import {
  coerceFormatSubtypeForPresetFamily,
} from './cinematics.ts'
import type {
  CinematicBackdropRole,
  CinematicCreativeTreatment,
  CinematicDominantTrigger,
  CinematicFormatSubtype,
  CinematicFormulaFamily,
  CinematicHookFamily,
  CinematicHookRole,
  CinematicNarrationMode,
  CinematicPresetFamily,
} from './cinematics.ts'

type UgcPresetFamily = Exclude<CinematicPresetFamily, 'story_movie_tv'>

export type UgcCommunicationExpectation = 'required' | 'preferred' | 'optional' | 'forbidden'

export type UgcCommunicationExpectationByRole = Partial<Record<CinematicHookRole, UgcCommunicationExpectation>>

export type UgcPresetProfile = {
  presetFamily: UgcPresetFamily
  formatSubtype: CinematicFormatSubtype
  targetUseCase: string
  audienceIntent: string
  defaultFormulaFamily: CinematicFormulaFamily
  allowedFormulaFamilies: CinematicFormulaFamily[]
  defaultDominantTrigger: CinematicDominantTrigger
  allowedDominantTriggers: CinematicDominantTrigger[]
  shotRoleSequence: CinematicHookRole[]
  firstFrameHookStyle: string
  toneRules: string
  proofExpectation: string
  defaultProofMoment: string
  defaultCtaStyle: string
  defaultTargetEmotion: string
  roleTargetEmotions: Partial<Record<CinematicHookRole, string>>
  defaultPersonaStyle: string
  defaultHookType: string
  defaultProofType: string
  defaultCtaType: string
  defaultContrastAxis: string
  preferredAspectRatio: '9:16'
  preferredClipSeconds: number
  pacingContract: {
    targetTotalDurationRangeSeconds: readonly [number, number]
    targetShotCountRange: readonly [number, number]
    idealShotDurationRangeSeconds: readonly [number, number]
    roleDurationRangeSeconds: Partial<Record<CinematicHookRole, readonly [number, number]>>
    proofShouldLandByShotIndex: number | null
    maxActionBeatsPerShot: number
    maxDialogueWordsPerShot: number
  }
  pacingGuidance: string
  referenceStrategy: string
  defaultCommunicationMode: CinematicNarrationMode | null
  allowedCommunicationModes: CinematicNarrationMode[]
  dialogueExpectationByRole: UgcCommunicationExpectationByRole
  audioExpectationByRole: UgcCommunicationExpectationByRole
  overlayExpectationByRole: UgcCommunicationExpectationByRole
  defaultCreativeTreatment?: CinematicCreativeTreatment | null
  defaultHookFamily?: CinematicHookFamily | null
  defaultNarrationMode?: CinematicNarrationMode | null
  defaultBackdropRole?: CinematicBackdropRole | null
  defaultBackdropStrategy?: string
  requiresPersonaStyle: boolean
  requiresCreatorOrProductContinuity: boolean
  requiresProductOrProofContinuity: boolean
  prefersStoryboardSupport: boolean
  visualFirst: boolean
  promptKeywords: string[]
}

export type UgcCreativeProfile = {
  creativeTreatment: CinematicCreativeTreatment | null
  hookFamily: CinematicHookFamily | null
  narrationMode: CinematicNarrationMode | null
  backdropRole: CinematicBackdropRole | null
  backdropStrategy: string
}

export type UgcVariationBlueprint = UgcCreativeProfile & {
  id: string
  label: string
  isPrimary: boolean
  proofBias: 'early' | 'mid'
  ctaSoftness: 'soft' | 'direct'
}

export type UgcShotCommunicationContract = {
  communicationMode: CinematicNarrationMode | null
  allowedCommunicationModes: CinematicNarrationMode[]
  dialogueExpectation: UgcCommunicationExpectation
  audioExpectation: UgcCommunicationExpectation
  overlayExpectation: UgcCommunicationExpectation
  requiresSpokenDialogue: boolean
  canUseVoiceover: boolean
  canUseOverlay: boolean
  canBeFullyVisual: boolean
  minimumSignal: 'spoken_dialogue' | 'spoken_audio_or_dialogue' | 'overlay_or_visual_readability' | 'visible_action_or_proof'
}

const FAMILY_DEFAULT_SUBTYPE: Record<UgcPresetFamily, CinematicFormatSubtype> = {
  ugc_creator: 'creator_problem_solution',
  ugc_direct_response_ad: 'ad_problem_solution',
  ugc_faceless_format: 'faceless_demo',
}

const pacingContract = (
  targetTotalDurationRangeSeconds: readonly [number, number],
  targetShotCountRange: readonly [number, number],
  idealShotDurationRangeSeconds: readonly [number, number],
  roleDurationRangeSeconds: Partial<Record<CinematicHookRole, readonly [number, number]>>,
  proofShouldLandByShotIndex: number | null,
  maxActionBeatsPerShot: number,
  maxDialogueWordsPerShot: number,
) => ({
  targetTotalDurationRangeSeconds,
  targetShotCountRange,
  idealShotDurationRangeSeconds,
  roleDurationRangeSeconds,
  proofShouldLandByShotIndex,
  maxActionBeatsPerShot,
  maxDialogueWordsPerShot,
})

const communicationExpectations = (
  defaultCommunicationMode: CinematicNarrationMode,
  allowedCommunicationModes: CinematicNarrationMode[],
  dialogueExpectationByRole: UgcCommunicationExpectationByRole,
  audioExpectationByRole: UgcCommunicationExpectationByRole,
  overlayExpectationByRole: UgcCommunicationExpectationByRole,
) => ({
  defaultCommunicationMode,
  allowedCommunicationModes,
  dialogueExpectationByRole,
  audioExpectationByRole,
  overlayExpectationByRole,
})

const CREATOR_DIRECT_COMMUNICATION = communicationExpectations(
  'spoken_to_camera',
  ['spoken_to_camera', 'spoken_over_footage', 'sparse_overlay'],
  {
    hook: 'required',
    setup: 'required',
    proof: 'preferred',
    payoff: 'optional',
    cta: 'required',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
)

const DIRECT_RESPONSE_NARRATED_COMMUNICATION = communicationExpectations(
  'spoken_over_footage',
  ['spoken_over_footage', 'spoken_to_camera', 'sparse_overlay'],
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'preferred',
    setup: 'preferred',
    proof: 'preferred',
    payoff: 'optional',
    cta: 'preferred',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'preferred',
    payoff: 'optional',
    cta: 'preferred',
  },
)

const FACELESS_PROOF_COMMUNICATION = communicationExpectations(
  'sparse_overlay',
  ['sparse_overlay', 'spoken_over_footage', 'visual_only'],
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'preferred',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'preferred',
    setup: 'preferred',
    proof: 'required',
    payoff: 'preferred',
    cta: 'preferred',
  },
)

const FACELESS_EXPLAINER_COMMUNICATION = communicationExpectations(
  'spoken_over_footage',
  ['spoken_over_footage', 'sparse_overlay', 'visual_only'],
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'preferred',
    setup: 'preferred',
    proof: 'preferred',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'preferred',
    setup: 'preferred',
    proof: 'required',
    payoff: 'preferred',
    cta: 'optional',
  },
)

const VISUAL_ONLY_PROCESS_COMMUNICATION = communicationExpectations(
  'visual_only',
  ['visual_only', 'sparse_overlay', 'spoken_over_footage'],
  {
    hook: 'forbidden',
    setup: 'forbidden',
    proof: 'forbidden',
    payoff: 'forbidden',
    cta: 'forbidden',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'preferred',
    setup: 'preferred',
    proof: 'preferred',
    payoff: 'preferred',
    cta: 'optional',
  },
)

const CONTRAST_COMMUNICATION = communicationExpectations(
  'sparse_overlay',
  ['sparse_overlay', 'spoken_over_footage', 'visual_only'],
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'optional',
    setup: 'optional',
    proof: 'optional',
    payoff: 'optional',
    cta: 'optional',
  },
  {
    hook: 'required',
    setup: 'preferred',
    proof: 'required',
    payoff: 'preferred',
    cta: 'preferred',
  },
)

const CREATOR_PACING = pacingContract(
  [18, 30],
  [4, 6],
  [3, 6],
  {
    hook: [2, 4],
    setup: [4, 6],
    proof: [4, 6],
    payoff: [3, 5],
    cta: [2, 4],
  },
  3,
  2,
  32,
)

const CREATOR_VALIDATION_PACING = pacingContract(
  [12, 22],
  [3, 5],
  [3, 5],
  {
    hook: [2, 4],
    setup: [3, 5],
    payoff: [3, 5],
    cta: [2, 4],
  },
  null,
  2,
  28,
)

const SERIALIZED_CREATOR_PACING = pacingContract(
  [22, 36],
  [5, 6],
  [3, 7],
  {
    hook: [2, 4],
    setup: [4, 6],
    proof: [4, 6],
    payoff: [4, 6],
    cta: [2, 4],
  },
  4,
  2,
  30,
)

const DIRECT_RESPONSE_PACING = pacingContract(
  [16, 28],
  [4, 6],
  [3, 6],
  {
    hook: [2, 4],
    setup: [3, 5],
    proof: [4, 6],
    payoff: [3, 5],
    cta: [2, 4],
  },
  3,
  2,
  24,
)

const MECHANISM_PROOF_PACING = pacingContract(
  [16, 26],
  [4, 5],
  [3, 6],
  {
    hook: [2, 4],
    setup: [3, 4],
    proof: [4, 6],
    payoff: [3, 5],
    cta: [2, 4],
  },
  2,
  2,
  22,
)

const BEFORE_AFTER_PACING = pacingContract(
  [14, 24],
  [4, 5],
  [3, 5],
  {
    hook: [2, 3],
    setup: [3, 4],
    proof: [3, 5],
    payoff: [3, 4],
    cta: [2, 3],
  },
  3,
  2,
  18,
)

const COMPARISON_PACING = pacingContract(
  [14, 24],
  [4, 5],
  [3, 5],
  {
    hook: [2, 3],
    setup: [3, 4],
    proof: [3, 5],
    payoff: [3, 4],
    cta: [2, 3],
  },
  3,
  2,
  18,
)

const TROJAN_HORSE_PACING = pacingContract(
  [20, 32],
  [5, 6],
  [3, 6],
  {
    hook: [2, 4],
    setup: [4, 6],
    proof: [4, 6],
    payoff: [4, 5],
    cta: [2, 4],
  },
  4,
  2,
  26,
)

const FACELESS_DEMO_PACING = pacingContract(
  [12, 22],
  [3, 5],
  [3, 5],
  {
    hook: [2, 3],
    setup: [3, 4],
    proof: [3, 5],
    payoff: [3, 4],
    cta: [2, 3],
  },
  2,
  2,
  14,
)

const FACELESS_EXPLAINER_PACING = pacingContract(
  [14, 24],
  [4, 5],
  [3, 5],
  {
    hook: [2, 3],
    setup: [3, 4],
    proof: [3, 5],
    payoff: [3, 4],
    cta: [2, 3],
  },
  3,
  2,
  16,
)

const FACELESS_PROCESS_PACING = pacingContract(
  [12, 22],
  [4, 5],
  [2, 5],
  {
    hook: [2, 3],
    proof: [3, 5],
    payoff: [3, 4],
    cta: [2, 3],
  },
  3,
  2,
  12,
)

const FACELESS_SERIALIZED_PACING = pacingContract(
  [18, 30],
  [5, 6],
  [3, 6],
  {
    hook: [2, 4],
    setup: [3, 5],
    proof: [4, 6],
    payoff: [4, 5],
    cta: [2, 4],
  },
  4,
  2,
  18,
)

const CONTRAST_PACING = pacingContract(
  [20, 34],
  [6, 8],
  [2, 5],
  {
    hook: [2, 3],
    setup: [2, 4],
    proof: [2, 4],
    payoff: [3, 4],
    cta: [2, 3],
  },
  3,
  2,
  12,
)

export const UGC_PRESET_PROFILES: Record<CinematicFormatSubtype, UgcPresetProfile> = {
  creator_problem_solution: {
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_problem_solution',
    targetUseCase: 'Creator-native personal advice or lived-experience problem/solution content.',
    audienceIntent: 'Feel understood, see a believable use case, and get a low-pressure recommendation.',
    defaultFormulaFamily: 'problem_solution',
    allowedFormulaFamilies: ['problem_solution', 'personal_confession', 'reframe'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'parasocial_reassurance', 'belief_reset'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Pain-led creator confession with an immediately recognizable daily problem.',
    toneRules: 'Conversational, protective of viewer identity, and native to phone-shot creator delivery.',
    proofExpectation: 'Visible use case proof or product use, not abstract personal praise.',
    defaultProofMoment: 'Show the creator using the solution in-frame before the ending.',
    defaultCtaStyle: 'Soft creator recommendation that feels like sharing, not pressing.',
    defaultTargetEmotion: 'recognized and hopeful',
    roleTargetEmotions: {
      hook: 'stopped by relevance',
      setup: 'understood',
      proof: 'convinced by a believable use case',
      payoff: 'relieved',
      cta: 'open to trying it',
    },
    defaultPersonaStyle: 'Believable handheld creator speaking from lived experience with calm conviction.',
    defaultHookType: 'personal pain recognition',
    defaultProofType: 'creator use case proof',
    defaultCtaType: 'soft creator recommendation',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: CREATOR_PACING,
    pacingGuidance: 'Hook fast, then move through pain to believable proof without sounding scripted.',
    referenceStrategy: 'Prioritize creator identity plus product continuity; storyboard support is optional.',
    ...CREATOR_DIRECT_COMMUNICATION,
    requiresPersonaStyle: true,
    requiresCreatorOrProductContinuity: true,
    requiresProductOrProofContinuity: false,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['creator', 'ugc', 'tiktok', 'reels', 'shorts', 'problem solution', 'advice', 'routine', 'use case'],
  },
  creator_reframe: {
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_reframe',
    targetUseCase: 'Creator-led identity-protective reframe content.',
    audienceIntent: 'Feel seen instead of judged and adopt a better interpretation or direction.',
    defaultFormulaFamily: 'reframe',
    allowedFormulaFamilies: ['reframe', 'validation', 'personal_confession'],
    defaultDominantTrigger: 'belief_reset',
    allowedDominantTriggers: ['belief_reset', 'parasocial_reassurance', 'defiance_trigger'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Name the behavior the viewer already does and interrupt the shame around it.',
    toneRules: 'Empathetic, intimate, and slightly surprising without becoming preachy.',
    proofExpectation: 'Show the reframe through visible behavior or a simple creator demonstration.',
    defaultProofMoment: 'Make the redirected behavior visibly feel smarter or calmer on screen.',
    defaultCtaStyle: 'Soft invite to try the reframe, not a hard sell.',
    defaultTargetEmotion: 'relieved and reoriented',
    roleTargetEmotions: {
      hook: 'caught by a surprising permission slip',
      setup: 'understood',
      proof: 'reframed',
      payoff: 'lighter',
      cta: 'ready to try the new angle',
    },
    defaultPersonaStyle: 'Warm creator voice offering an emotionally accurate reframe without judging the viewer.',
    defaultHookType: 'behavior reframe',
    defaultProofType: 'behavior redirect proof',
    defaultCtaType: 'soft reframe challenge',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: CREATOR_PACING,
    pacingGuidance: 'Open with the behavior immediately and move quickly into the new interpretation.',
    referenceStrategy: 'Prioritize creator identity; product continuity is secondary unless the prompt is explicitly sponsored.',
    ...CREATOR_DIRECT_COMMUNICATION,
    requiresPersonaStyle: true,
    requiresCreatorOrProductContinuity: true,
    requiresProductOrProofContinuity: false,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['reframe', 'redirect', 'overthink', 'permission', 'instead of', 'if you are going to'],
  },
  creator_validation: {
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_validation',
    targetUseCase: 'Creator-native emotional validation or permission content.',
    audienceIntent: 'Feel recognized, reassured, and socially understood.',
    defaultFormulaFamily: 'validation',
    allowedFormulaFamilies: ['validation', 'personal_confession', 'reframe'],
    defaultDominantTrigger: 'parasocial_reassurance',
    allowedDominantTriggers: ['parasocial_reassurance', 'social_proof', 'belief_reset'],
    shotRoleSequence: ['hook', 'setup', 'payoff', 'cta'],
    firstFrameHookStyle: 'Open with a sharp validating line the viewer already half-believes.',
    toneRules: 'Intimate, supportive, and screenshot-worthy rather than salesy.',
    proofExpectation: 'Emotional proof through resonance and simple lived detail, not a hard mechanism demo.',
    defaultProofMoment: 'Make the validating statement land as the clear emotional payoff frame.',
    defaultCtaStyle: 'Very soft reflective CTA or no-pressure next step.',
    defaultTargetEmotion: 'seen and reassured',
    roleTargetEmotions: {
      hook: 'instantly recognized',
      setup: 'less alone',
      payoff: 'validated',
      cta: 'quietly committed',
    },
    defaultPersonaStyle: 'Close, grounded creator speaking like a trusted friend, not a marketer.',
    defaultHookType: 'validation line',
    defaultProofType: 'emotional resonance proof',
    defaultCtaType: 'soft reflection',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: CREATOR_VALIDATION_PACING,
    pacingGuidance: 'Keep the language sparse and let the validating statement do most of the work.',
    referenceStrategy: 'Prioritize creator identity and intimacy; product continuity is optional.',
    ...CREATOR_DIRECT_COMMUNICATION,
    requiresPersonaStyle: true,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: false,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['validation', 'validate', 'you are not alone', 'permission', "it's okay", 'needed this'],
  },
  creator_serialized_drama: {
    presetFamily: 'ugc_creator',
    formatSubtype: 'creator_serialized_drama',
    targetUseCase: 'Creator-led serialized drama or gossip-style story where the product enters as the resolution.',
    audienceIntent: 'Follow the conflict, get pulled through the tension, and accept the product as the payoff mechanism.',
    defaultFormulaFamily: 'personal_confession',
    allowedFormulaFamilies: ['personal_confession', 'problem_solution', 'validation'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'social_proof', 'status_comparison'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Open on the betrayal, taboo secret, or emotionally charged rupture before explaining the context.',
    toneRules: 'Conversational and story-led, but the conflict should feel juicy enough to hold attention before the product appears.',
    proofExpectation: 'The product should enter as the reveal or redemption mechanism, not as an early sponsor interruption.',
    defaultProofMoment: 'Reveal the app or product after the conflict and suffering are established, then show the better outcome.',
    defaultCtaStyle: 'Soft story-resolved CTA that follows the redemption beat.',
    defaultTargetEmotion: 'hooked by the drama and curious for resolution',
    roleTargetEmotions: {
      hook: 'cannot scroll past the conflict',
      setup: 'absorbed in the tension',
      proof: 'surprised by the reveal',
      payoff: 'satisfied by the redemption',
      cta: 'open to the implied install or try-now next step',
    },
    defaultPersonaStyle: 'Creator narrator telling a high-drama story in an intimate, gossip-adjacent tone without sounding like ad copy.',
    defaultHookType: 'taboo story interruption',
    defaultProofType: 'story resolution proof',
    defaultCtaType: 'soft story CTA',
    defaultContrastAxis: 'conflict vs resolution',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: SERIALIZED_CREATOR_PACING,
    pacingGuidance: 'Establish conflict fast, hold tension through the middle, and let the product arrive as the twist or rescue.',
    referenceStrategy: 'Use creator identity plus recurring character or object continuity if the series format matters.',
    ...CREATOR_DIRECT_COMMUNICATION,
    requiresPersonaStyle: true,
    requiresCreatorOrProductContinuity: true,
    requiresProductOrProofContinuity: false,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['drama', 'gossip', 'serialized', 'series', 'betrayal', 'cheating', 'secret', 'storytime', 'episode'],
  },
  ad_problem_solution: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_problem_solution',
    targetUseCase: 'Direct-response UGC ad that moves from pain to solution with visible proof.',
    audienceIntent: 'Recognize the pain quickly and see the product clearly fix it.',
    defaultFormulaFamily: 'problem_solution',
    allowedFormulaFamilies: ['problem_solution', 'mechanism_proof', 'mistake_warning'],
    defaultDominantTrigger: 'transformation_desire',
    allowedDominantTriggers: ['transformation_desire', 'curiosity_gap', 'social_proof'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Lead with the pain or a costly consequence in the first frame.',
    toneRules: 'Native short-form ad language with immediate product relevance and visible clarity.',
    proofExpectation: 'Visible product function plus a clear better outcome before the final frame.',
    defaultProofMoment: 'Show the product solving the problem in-frame before the CTA.',
    defaultCtaStyle: 'Direct but not spammy CTA tied to the proof you just showed.',
    defaultTargetEmotion: 'motivated to fix the problem',
    roleTargetEmotions: {
      hook: 'stopped by pain',
      setup: 'personally affected',
      proof: 'convinced by evidence',
      payoff: 'relieved',
      cta: 'ready to act',
    },
    defaultPersonaStyle: 'Native short-form ad delivery that feels real, brisk, and proof-forward.',
    defaultHookType: 'pain interruption',
    defaultProofType: 'visible problem-solution proof',
    defaultCtaType: 'direct response CTA',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: DIRECT_RESPONSE_PACING,
    pacingGuidance: 'Surface the pain immediately, show the product early, and land proof before the ending.',
    referenceStrategy: 'Prioritize product and proof continuity first, then creator continuity.',
    ...DIRECT_RESPONSE_NARRATED_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['ad', 'ads', 'roas', 'conversion', 'direct response', 'product page', 'shop', 'buy'],
  },
  ad_mechanism_proof: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_mechanism_proof',
    targetUseCase: 'Direct-response ad that teaches the mechanism and proves it visibly.',
    audienceIntent: 'Understand why it works and trust the result because the mechanism is legible.',
    defaultFormulaFamily: 'mechanism_proof',
    allowedFormulaFamilies: ['mechanism_proof', 'doing_it_wrong', 'mistake_warning'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'belief_reset', 'transformation_desire'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'cta'],
    firstFrameHookStyle: 'Open with the hidden mechanism or wrong assumption in a way that creates immediate curiosity.',
    toneRules: 'Clear, concrete, and explanatory without turning into lecture voice.',
    proofExpectation: 'Show the product or process doing the job, not just being described.',
    defaultProofMoment: 'Make the mechanism visible and then show the result it creates.',
    defaultCtaStyle: 'Direct CTA that follows visible proof instead of unsupported claims.',
    defaultTargetEmotion: 'curious and convinced',
    roleTargetEmotions: {
      hook: 'pulled by curiosity',
      setup: 'intrigued',
      proof: 'convinced by mechanism clarity',
      cta: 'ready to try the mechanism',
    },
    defaultPersonaStyle: 'Confident explainer delivery that still feels native to short-form.',
    defaultHookType: 'hidden mechanism hook',
    defaultProofType: 'mechanism demonstration proof',
    defaultCtaType: 'proof-backed CTA',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: MECHANISM_PROOF_PACING,
    pacingGuidance: 'Keep each beat visually legible and move from hidden cause to demonstration fast.',
    referenceStrategy: 'Product and proof refs are mandatory; creator refs are optional.',
    ...DIRECT_RESPONSE_NARRATED_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: false,
    visualFirst: false,
    promptKeywords: ['mechanism', 'proof', 'how it works', 'doing it wrong', 'wrong way', 'mistake'],
  },
  ad_before_after: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_before_after',
    targetUseCase: 'Transformation-led ad with obvious state change.',
    audienceIntent: 'See a visible before/after gap and believe the product creates the better state.',
    defaultFormulaFamily: 'before_after',
    allowedFormulaFamilies: ['before_after', 'result_reveal', 'problem_solution'],
    defaultDominantTrigger: 'transformation_desire',
    allowedDominantTriggers: ['transformation_desire', 'social_proof', 'status_comparison'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Show the undesirable before state or the transformation contrast immediately.',
    toneRules: 'Visual-first, easy to read on mute, with a sharp state change.',
    proofExpectation: 'Before and after states must be unmistakably different in-frame.',
    defaultProofMoment: 'Reveal the changed state before the CTA, not only at the very last instant.',
    defaultCtaStyle: 'Direct CTA anchored to the visible transformation.',
    defaultTargetEmotion: 'desire for the after state',
    roleTargetEmotions: {
      hook: 'stopped by the contrast',
      setup: 'aware of the before state',
      proof: 'convinced by the change',
      payoff: 'want the after state',
      cta: 'ready to act',
    },
    defaultPersonaStyle: 'Short-form transformation delivery that keeps the states clear and immediate.',
    defaultHookType: 'before/after contrast',
    defaultProofType: 'transformation proof',
    defaultCtaType: 'transformation CTA',
    defaultContrastAxis: 'before vs after',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: BEFORE_AFTER_PACING,
    pacingGuidance: 'Do not over-explain; let the contrast do the persuasion.',
    referenceStrategy: 'Proof refs and comparison states matter more than persona.',
    ...CONTRAST_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: true,
    visualFirst: true,
    promptKeywords: ['before after', 'before/after', 'transformation', 'glow up', 'after'],
  },
  ad_comparison: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_comparison',
    targetUseCase: 'Direct-response comparison ad with an obvious winner.',
    audienceIntent: 'Compare options quickly and understand why one wins.',
    defaultFormulaFamily: 'contrast_comparison',
    allowedFormulaFamilies: ['contrast_comparison', 'problem_solution', 'mechanism_proof'],
    defaultDominantTrigger: 'status_comparison',
    allowedDominantTriggers: ['status_comparison', 'curiosity_gap', 'transformation_desire'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Make the side-by-side or versus structure obvious immediately.',
    toneRules: 'Clear, comparative, and decisive rather than abstract.',
    proofExpectation: 'The winning option must keep winning through visible evidence, not narration alone.',
    defaultProofMoment: 'Show the winning difference through concrete side-by-side evidence.',
    defaultCtaStyle: 'Direct CTA that follows a clearly superior option.',
    defaultTargetEmotion: 'certain about the winner',
    roleTargetEmotions: {
      hook: 'stopped by the versus frame',
      setup: 'curious which side wins',
      proof: 'convinced by comparison',
      payoff: 'clear on the winner',
      cta: 'ready to choose',
    },
    defaultPersonaStyle: 'Decisive short-form comparison delivery with clean mobile readability.',
    defaultHookType: 'comparison frame',
    defaultProofType: 'side-by-side proof',
    defaultCtaType: 'winner CTA',
    defaultContrastAxis: 'option A vs option B',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: COMPARISON_PACING,
    pacingGuidance: 'Keep each beat comparison-led and avoid repeating the same evidence twice.',
    referenceStrategy: 'Product, competitor/comparison, and proof refs should stay readable through the sequence.',
    ...CONTRAST_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: true,
    visualFirst: true,
    promptKeywords: ['comparison', 'compare', 'versus', 'vs', 'better than', 'option a', 'option b'],
  },
  ad_trojan_horse_drama: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'ad_trojan_horse_drama',
    targetUseCase: 'Narrative direct-response ad where interpersonal or social drama carries the sell.',
    audienceIntent: 'Stay for the conflict and let the product resolution land before consciously registering the ad structure.',
    defaultFormulaFamily: 'problem_solution',
    allowedFormulaFamilies: ['problem_solution', 'personal_confession', 'mechanism_proof'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'status_comparison', 'transformation_desire'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Start on the betrayal, argument, or taboo social consequence, not the product.',
    toneRules: 'Narrative and conflict-led, but still optimized for conversion through a visible reveal and clean redemption.',
    proofExpectation: 'The product must arrive as the reveal or answer and visibly change the story outcome before the close.',
    defaultProofMoment: 'Introduce the product as the twist or rescue after the suffering beat, then show the better state clearly.',
    defaultCtaStyle: 'Direct-response CTA that feels earned by the redemption rather than bolted on.',
    defaultTargetEmotion: 'locked into the story and ready for the resolution',
    roleTargetEmotions: {
      hook: 'caught by the taboo conflict',
      setup: 'invested in what happens next',
      proof: 'surprised by the reveal',
      payoff: 'convinced by the resolution',
      cta: 'ready to install or act',
    },
    defaultPersonaStyle: 'Short-form ad storyteller with dramatic clarity and native pacing.',
    defaultHookType: 'trojan horse drama hook',
    defaultProofType: 'redemption proof',
    defaultCtaType: 'earned install CTA',
    defaultContrastAxis: 'suffering vs redemption',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: TROJAN_HORSE_PACING,
    pacingGuidance: 'Use setup, betrayal, suffering, reveal, and redemption. Delay the product until the twist, but not until after the ending.',
    referenceStrategy: 'Use product and proof continuity plus recurring story actors or social objects when the narrative repeats across a series.',
    ...DIRECT_RESPONSE_NARRATED_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: true,
    visualFirst: false,
    promptKeywords: ['app promo', 'story ad', 'drama ad', 'betrayal ad', 'gossip ad', 'trojan horse', 'install ad', 'soap opera'],
  },
  faceless_demo: {
    presetFamily: 'ugc_faceless_format',
    formatSubtype: 'faceless_demo',
    targetUseCase: 'Faceless demo content led by object, screen, or process visibility.',
    audienceIntent: 'Understand the product quickly by watching it work.',
    defaultFormulaFamily: 'mechanism_proof',
    allowedFormulaFamilies: ['mechanism_proof', 'problem_solution', 'result_reveal'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'transformation_desire'],
    shotRoleSequence: ['hook', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Lead with the object, screen, or output doing something visually specific.',
    toneRules: 'Visual-first and legible without relying on face performance or dense dialogue.',
    proofExpectation: 'The object or screen should visibly perform the value proposition.',
    defaultProofMoment: 'Show the product or process visibly doing the job before the end frame.',
    defaultCtaStyle: 'Short, functional CTA that does not break the visual flow.',
    defaultTargetEmotion: 'interested by what the object is doing',
    roleTargetEmotions: {
      hook: 'curious',
      proof: 'convinced by the demo',
      payoff: 'satisfied by the result',
      cta: 'ready to try it',
    },
    defaultPersonaStyle: '',
    defaultHookType: 'demo interruption',
    defaultProofType: 'object or screen proof',
    defaultCtaType: 'functional CTA',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: FACELESS_DEMO_PACING,
    pacingGuidance: 'Keep the object or screen as the hero and avoid unnecessary exposition.',
    referenceStrategy: 'Product, screen, and proof refs are primary; faces are optional.',
    ...FACELESS_PROOF_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: false,
    visualFirst: true,
    promptKeywords: ['faceless', 'demo', 'screen recording', 'product demo', 'show me'],
  },
  faceless_explainer: {
    presetFamily: 'ugc_faceless_format',
    formatSubtype: 'faceless_explainer',
    targetUseCase: 'Faceless explainer with belief reset or wrong-way framing.',
    audienceIntent: 'Learn the hidden mistake or mechanism through clean visual logic.',
    defaultFormulaFamily: 'doing_it_wrong',
    allowedFormulaFamilies: ['doing_it_wrong', 'mistake_warning', 'mechanism_proof'],
    defaultDominantTrigger: 'belief_reset',
    allowedDominantTriggers: ['belief_reset', 'curiosity_gap', 'defiance_trigger'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff'],
    firstFrameHookStyle: 'Open with the wrong belief, wrong method, or hidden mistake.',
    toneRules: 'Clean, concise, and visual-first rather than talk-heavy.',
    proofExpectation: 'The explanation should resolve into a visible corrected state or mechanism.',
    defaultProofMoment: 'Show the corrected behavior or revealed mechanism clearly on screen.',
    defaultCtaStyle: 'Short utility CTA or no-pressure action prompt.',
    defaultTargetEmotion: 'surprised by the correction',
    roleTargetEmotions: {
      hook: 'wrong-footed',
      setup: 'curious',
      proof: 'convinced by the explanation',
      payoff: 'clear on the fix',
    },
    defaultPersonaStyle: '',
    defaultHookType: 'wrong-belief interruption',
    defaultProofType: 'correction proof',
    defaultCtaType: 'utility CTA',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: FACELESS_EXPLAINER_PACING,
    pacingGuidance: 'Move quickly from the mistaken assumption to the visible correction.',
    referenceStrategy: 'Objects, screens, and proof states matter more than people.',
    ...FACELESS_EXPLAINER_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: false,
    visualFirst: true,
    promptKeywords: ['explainer', 'how it works', 'doing it wrong', 'wrong way', 'mistake', 'myth'],
  },
  faceless_process: {
    presetFamily: 'ugc_faceless_format',
    formatSubtype: 'faceless_process',
    targetUseCase: 'Faceless process, workflow, or satisfying progression content.',
    audienceIntent: 'Stay for the progression and payoff because each stage changes visibly.',
    defaultFormulaFamily: 'result_reveal',
    allowedFormulaFamilies: ['result_reveal', 'before_after', 'mechanism_proof'],
    defaultDominantTrigger: 'transformation_desire',
    allowedDominantTriggers: ['transformation_desire', 'curiosity_gap'],
    shotRoleSequence: ['hook', 'proof', 'proof', 'payoff'],
    firstFrameHookStyle: 'Start mid-process or on the first visually unusual stage.',
    toneRules: 'Satisfying, progression-led, and highly visual.',
    proofExpectation: 'Each beat should show a genuinely new process state, not a repeated angle.',
    defaultProofMoment: 'Make the later-stage process result visibly different before the final reveal.',
    defaultCtaStyle: 'Minimal CTA if any; do not undermine the satisfying progression.',
    defaultTargetEmotion: 'visually satisfied',
    roleTargetEmotions: {
      hook: 'intrigued by the process',
      proof: 'pulled through progression',
      payoff: 'satisfied by the reveal',
      cta: 'curious to try it',
    },
    defaultPersonaStyle: '',
    defaultHookType: 'process interruption',
    defaultProofType: 'stage progression proof',
    defaultCtaType: 'light CTA',
    defaultContrastAxis: '',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: FACELESS_PROCESS_PACING,
    pacingGuidance: 'Each beat should advance the process or reveal, not linger on one stage.',
    referenceStrategy: 'Use object, process, and result refs; faces are usually unnecessary.',
    ...VISUAL_ONLY_PROCESS_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: false,
    visualFirst: true,
    promptKeywords: ['workflow', 'process', 'step by step', 'routine', 'satisfying', 'progression'],
  },
  faceless_serialized_drama: {
    presetFamily: 'ugc_faceless_format',
    formatSubtype: 'faceless_serialized_drama',
    targetUseCase: 'Absurd, faceless, serialized social drama using object or character personification.',
    audienceIntent: 'Engage with taboo conflict inside a playful container and stay for the reveal/redemption.',
    defaultFormulaFamily: 'personal_confession',
    allowedFormulaFamilies: ['personal_confession', 'problem_solution', 'contrast_narrative'],
    defaultDominantTrigger: 'curiosity_gap',
    allowedDominantTriggers: ['curiosity_gap', 'status_comparison', 'social_proof'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    firstFrameHookStyle: 'Make the absurd packaging obvious immediately while showing a real social rupture or betrayal.',
    toneRules: 'Visually absurd, emotionally legible, and low-shame to consume or share.',
    proofExpectation: 'The app or product should visibly restore order, connection, or rescue the personified characters.',
    defaultProofMoment: 'Reveal the app or product after the conflict escalates, then show it visibly changing the emotional outcome.',
    defaultCtaStyle: 'Light CTA or implied install CTA after the redemption beat.',
    defaultTargetEmotion: 'cannot look away because the package is absurd and the conflict is real',
    roleTargetEmotions: {
      hook: 'processing-pause curiosity',
      setup: 'drawn into the gossip',
      proof: 'surprised by the reveal',
      payoff: 'satisfied by the redemption',
      cta: 'curious to try the same resolution',
    },
    defaultPersonaStyle: '',
    defaultHookType: 'absurd drama interruption',
    defaultProofType: 'story resolution proof',
    defaultCtaType: 'implied install CTA',
    defaultContrastAxis: 'chaos vs restored order',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 5,
    pacingContract: FACELESS_SERIALIZED_PACING,
    pacingGuidance: 'Use serious conflict inside unserious packaging, keep the beats visual, and make the product the visible answer.',
    referenceStrategy: 'Use recurring non-human or object-character continuity, plus storyboard support when the serialized sequence matters.',
    ...FACELESS_PROOF_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: true,
    visualFirst: true,
    promptKeywords: ['fruit drama', 'animated fruit', 'absurd drama', 'cartoon drama', 'serialized drama', 'soap opera', 'gossip', 'betrayal', 'personified'],
  },
  contrast_narrative: {
    presetFamily: 'ugc_direct_response_ad',
    formatSubtype: 'contrast_narrative',
    targetUseCase: 'Multi-beat visual contrast narrative with escalating winner/loser logic.',
    audienceIntent: 'Track the widening gap and stay for the strongest contrast payoff.',
    defaultFormulaFamily: 'contrast_narrative',
    allowedFormulaFamilies: ['contrast_narrative', 'contrast_comparison', 'before_after'],
    defaultDominantTrigger: 'status_comparison',
    allowedDominantTriggers: ['status_comparison', 'transformation_desire'],
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'proof', 'proof', 'payoff', 'payoff'],
    firstFrameHookStyle: 'Open with the split-screen or two-pole contrast immediately readable in one frame.',
    toneRules: 'Visual comparison first, dialogue sparse, each beat widening the gap through a new dimension.',
    proofExpectation: 'The gap should widen through multiple visible dimensions such as time, money, stress, energy, convenience, or status.',
    defaultProofMoment: 'Make the winning side visibly superior across multiple dimensions before the final payoff.',
    defaultCtaStyle: 'Minimal or implication-led CTA; do not interrupt the visual story with a clumsy hard sell.',
    defaultTargetEmotion: 'locked into the comparison',
    roleTargetEmotions: {
      hook: 'stopped by the split-screen contrast',
      setup: 'curious which path wins',
      proof: 'absorbed by the widening gap',
      payoff: 'certain about the winner',
      cta: 'drawn to the winning path',
    },
    defaultPersonaStyle: '',
    defaultHookType: 'split-screen contrast',
    defaultProofType: 'multi-dimension comparison proof',
    defaultCtaType: 'implicit winner CTA',
    defaultContrastAxis: 'winner vs loser',
    preferredAspectRatio: '9:16',
    preferredClipSeconds: 4,
    pacingContract: CONTRAST_PACING,
    pacingGuidance: 'Use short escalating beats, keep most shots visual, and land the clearest winner frame at the end.',
    referenceStrategy: 'Storyboard and comparison support matter alongside proof and continuity refs.',
    ...CONTRAST_COMMUNICATION,
    requiresPersonaStyle: false,
    requiresCreatorOrProductContinuity: false,
    requiresProductOrProofContinuity: true,
    prefersStoryboardSupport: true,
    visualFirst: true,
    promptKeywords: ['rich vs poor', 'poor vs rich', 'before after', 'before/after', 'pay to win', 'vs', 'versus', 'contrast', 'split screen', 'comparison'],
  },
}

const STORY_KEYWORDS = ['film', 'movie', 'tv', 'trailer', 'cutscene', 'storyboard', 'cinematic']
const FAMILY_KEYWORDS: Record<UgcPresetFamily, string[]> = {
  ugc_creator: ['ugc', 'creator', 'tiktok', 'reels', 'shorts', 'selfie', 'talking head'],
  ugc_direct_response_ad: ['ad', 'ads', 'roas', 'conversion', 'direct response', 'product page', 'offer', 'install', 'promote', 'promotion', 'app promotion', 'campaign', 'brand'],
  ugc_faceless_format: ['podcast', 'faceless', 'explainer', 'demo loop', 'screen recording', 'workflow', 'fruit drama', 'animated fruit', 'cartoon drama', 'absurd container', 'personified'],
}

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function countKeywordMatches(normalizedPrompt: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizePrompt(keyword)
    if (!normalizedKeyword) return score
    return normalizedPrompt.includes(normalizedKeyword) ? score + 1 : score
  }, 0)
}

export function getDefaultUgcFormatSubtypeForPresetFamily(presetFamily: CinematicPresetFamily): CinematicFormatSubtype | null {
  if (presetFamily === 'story_movie_tv') return null
  return FAMILY_DEFAULT_SUBTYPE[presetFamily]
}

export function getUgcPresetProfile(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  presetFamily?: CinematicPresetFamily | null,
): UgcPresetProfile | null {
  if (formatSubtype && UGC_PRESET_PROFILES[formatSubtype]) return UGC_PRESET_PROFILES[formatSubtype]
  const fallbackSubtype =
    presetFamily && presetFamily !== 'story_movie_tv'
      ? FAMILY_DEFAULT_SUBTYPE[presetFamily]
      : null
  return fallbackSubtype ? UGC_PRESET_PROFILES[fallbackSubtype] : null
}

function midpoint(range: readonly [number, number]) {
  return Math.round((range[0] + range[1]) / 2)
}

function inferDefaultCreativeTreatment(formatSubtype: CinematicFormatSubtype | null | undefined): CinematicCreativeTreatment | null {
  switch (formatSubtype) {
    case 'creator_problem_solution':
    case 'creator_reframe':
    case 'creator_validation':
    case 'creator_serialized_drama':
      return 'creator_direct_to_camera'
    case 'ad_problem_solution':
    case 'ad_mechanism_proof':
    case 'faceless_explainer':
      return 'narrator_over_backdrop'
    case 'ad_before_after':
    case 'ad_comparison':
    case 'contrast_narrative':
      return 'contrast_split'
    case 'ad_trojan_horse_drama':
    case 'faceless_serialized_drama':
      return 'comedic_absurd_container'
    case 'faceless_demo':
    case 'faceless_process':
      return 'faceless_proof_demo'
    default:
      return null
  }
}

function inferDefaultHookFamily(formatSubtype: CinematicFormatSubtype | null | undefined): CinematicHookFamily | null {
  switch (formatSubtype) {
    case 'creator_problem_solution':
    case 'creator_validation':
    case 'ad_problem_solution':
      return 'sharp_pain_confession'
    case 'creator_reframe':
    case 'ad_mechanism_proof':
    case 'faceless_demo':
      return 'wrong_belief_interrupt'
    case 'ad_before_after':
    case 'ad_comparison':
    case 'contrast_narrative':
      return 'status_or_before_after_contrast'
    case 'creator_serialized_drama':
    case 'ad_trojan_horse_drama':
    case 'faceless_serialized_drama':
      return 'social_drama_open_loop'
    case 'faceless_process':
      return 'odd_visual_plus_serious_narration'
    case 'faceless_explainer':
      return 'danger_reframe'
    default:
      return null
  }
}

function inferDefaultNarrationMode(formatSubtype: CinematicFormatSubtype | null | undefined): CinematicNarrationMode | null {
  switch (formatSubtype) {
    case 'creator_problem_solution':
    case 'creator_reframe':
    case 'creator_validation':
    case 'creator_serialized_drama':
      return 'spoken_to_camera'
    case 'ad_problem_solution':
    case 'ad_mechanism_proof':
    case 'ad_trojan_horse_drama':
    case 'faceless_explainer':
    case 'faceless_serialized_drama':
      return 'spoken_over_footage'
    case 'ad_before_after':
    case 'ad_comparison':
    case 'contrast_narrative':
    case 'faceless_demo':
      return 'sparse_overlay'
    case 'faceless_process':
      return 'visual_only'
    default:
      return null
  }
}

function inferDefaultBackdropRole(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  creativeTreatment: CinematicCreativeTreatment | null
}): CinematicBackdropRole | null {
  switch (input.creativeTreatment) {
    case 'narrator_over_backdrop':
      return 'engagement_backdrop'
    case 'contrast_split':
      return 'contrast_backdrop'
    case 'aesthetic_mismatch':
      return 'aesthetic_backdrop'
    case 'comedic_absurd_container':
      return 'comedic_backdrop'
    case 'faceless_proof_demo':
      return 'proof_backdrop'
    default:
      return null
  }
}

function inferDefaultBackdropStrategy(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  creativeTreatment: CinematicCreativeTreatment | null
}): string {
  switch (input.creativeTreatment) {
    case 'creator_direct_to_camera':
      return 'Use a native lived-in backdrop that supports intimacy without competing with the creator.'
    case 'narrator_over_backdrop':
      return 'Use visually engaging B-roll or backdrop footage that earns the stop-scroll while narration advances the argument.'
    case 'faceless_proof_demo':
      return 'Keep the screen, object, or process as the hero and make every proof surface readable.'
    case 'contrast_split':
      return 'Use split-screen or alternating winner-vs-loser framing so the contrast is legible in frame one.'
    case 'aesthetic_mismatch':
      return 'Pair beautiful, satisfying, or calm footage with sharper narration before interrupting with concrete proof.'
    case 'comedic_absurd_container':
      return 'Use funny or absurd footage as the attention mechanism, then let the product resolve the real underlying problem.'
    default:
      return ''
  }
}

function getProfileCreativeDefaults(profile: UgcPresetProfile | null | undefined): UgcCreativeProfile {
  const creativeTreatment = profile?.defaultCreativeTreatment ?? inferDefaultCreativeTreatment(profile?.formatSubtype)
  const hookFamily = profile?.defaultHookFamily ?? inferDefaultHookFamily(profile?.formatSubtype)
  const narrationMode = profile?.defaultNarrationMode ?? profile?.defaultCommunicationMode ?? inferDefaultNarrationMode(profile?.formatSubtype)
  const backdropRole = profile?.defaultBackdropRole ?? inferDefaultBackdropRole({
    formatSubtype: profile?.formatSubtype,
    creativeTreatment,
  })
  const backdropStrategy = profile?.defaultBackdropStrategy ?? inferDefaultBackdropStrategy({
    formatSubtype: profile?.formatSubtype,
    creativeTreatment,
  })

  return {
    creativeTreatment,
    hookFamily,
    narrationMode,
    backdropRole,
    backdropStrategy,
  }
}

function resolveExpectationForRole(
  expectations: UgcCommunicationExpectationByRole,
  hookRole: CinematicHookRole | null | undefined,
  fallback: UgcCommunicationExpectation,
) {
  if (hookRole && expectations[hookRole]) return expectations[hookRole] as UgcCommunicationExpectation
  if (expectations.setup) return expectations.setup as UgcCommunicationExpectation
  return fallback
}

export function resolveUgcShotCommunicationContract(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  presetFamily?: CinematicPresetFamily | null
  creativeTreatment?: CinematicCreativeTreatment | null
  narrationMode?: CinematicNarrationMode | null
  hookRole?: CinematicHookRole | null
}): UgcShotCommunicationContract {
  const profile = getUgcPresetProfile(input.formatSubtype, input.presetFamily)
  const communicationMode =
    input.narrationMode
    ?? profile?.defaultCommunicationMode
    ?? profile?.defaultNarrationMode
    ?? inferDefaultNarrationMode(input.formatSubtype)
    ?? null

  const creativeTreatment =
    input.creativeTreatment
    ?? profile?.defaultCreativeTreatment
    ?? inferDefaultCreativeTreatment(input.formatSubtype)
    ?? null

  const profileAllowedModes = profile?.allowedCommunicationModes ?? (communicationMode ? [communicationMode] : [])
  const allowedCommunicationModes = Array.from(new Set(
    communicationMode ? [communicationMode, ...profileAllowedModes] : profileAllowedModes,
  ))

  let dialogueExpectation = resolveExpectationForRole(profile?.dialogueExpectationByRole ?? {}, input.hookRole, 'optional')
  let audioExpectation = resolveExpectationForRole(profile?.audioExpectationByRole ?? {}, input.hookRole, 'optional')
  let overlayExpectation = resolveExpectationForRole(profile?.overlayExpectationByRole ?? {}, input.hookRole, 'optional')

  if (communicationMode === 'spoken_to_camera') {
    dialogueExpectation = dialogueExpectation === 'forbidden' ? 'required' : (dialogueExpectation === 'optional' ? 'required' : dialogueExpectation)
    audioExpectation = audioExpectation === 'forbidden' ? 'optional' : audioExpectation
  } else if (communicationMode === 'spoken_over_footage') {
    dialogueExpectation = dialogueExpectation === 'required' ? 'optional' : dialogueExpectation
    audioExpectation = audioExpectation === 'optional' ? 'preferred' : (audioExpectation === 'forbidden' ? 'preferred' : audioExpectation)
  } else if (communicationMode === 'sparse_overlay') {
    dialogueExpectation = dialogueExpectation === 'required' ? 'optional' : dialogueExpectation
    overlayExpectation = overlayExpectation === 'optional' ? 'preferred' : (overlayExpectation === 'forbidden' ? 'preferred' : overlayExpectation)
  } else if (communicationMode === 'visual_only') {
    dialogueExpectation = 'forbidden'
    overlayExpectation = overlayExpectation === 'forbidden' ? 'optional' : overlayExpectation
  }

  if (creativeTreatment === 'narrator_over_backdrop' || creativeTreatment === 'aesthetic_mismatch') {
    dialogueExpectation = dialogueExpectation === 'required' ? 'optional' : dialogueExpectation
    audioExpectation = audioExpectation === 'optional' ? 'preferred' : audioExpectation
  } else if (creativeTreatment === 'contrast_split') {
    dialogueExpectation = dialogueExpectation === 'required' ? 'optional' : dialogueExpectation
    overlayExpectation = overlayExpectation === 'optional' ? 'preferred' : overlayExpectation
  } else if (creativeTreatment === 'faceless_proof_demo') {
    dialogueExpectation = dialogueExpectation === 'required' ? 'optional' : dialogueExpectation
    overlayExpectation = overlayExpectation === 'optional' ? 'preferred' : overlayExpectation
  }

  const requiresSpokenDialogue = communicationMode === 'spoken_to_camera' && dialogueExpectation === 'required'
  const canUseVoiceover = communicationMode === 'spoken_over_footage'
  const canUseOverlay = communicationMode === 'sparse_overlay' || overlayExpectation === 'preferred' || overlayExpectation === 'required'
  const canBeFullyVisual = communicationMode === 'visual_only'

  let minimumSignal: UgcShotCommunicationContract['minimumSignal'] = 'visible_action_or_proof'
  if (requiresSpokenDialogue) {
    minimumSignal = 'spoken_dialogue'
  } else if (canBeFullyVisual && overlayExpectation !== 'required') {
    minimumSignal = 'visible_action_or_proof'
  } else if (canUseVoiceover || audioExpectation === 'required' || audioExpectation === 'preferred') {
    minimumSignal = 'spoken_audio_or_dialogue'
  } else if (canUseOverlay || overlayExpectation === 'required' || overlayExpectation === 'preferred') {
    minimumSignal = 'overlay_or_visual_readability'
  }

  return {
    communicationMode,
    allowedCommunicationModes,
    dialogueExpectation,
    audioExpectation,
    overlayExpectation,
    requiresSpokenDialogue,
    canUseVoiceover,
    canUseOverlay,
    canBeFullyVisual,
    minimumSignal,
  }
}

export function getUgcDurationRangeForShot(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  presetFamily?: CinematicPresetFamily | null
  hookRole?: CinematicHookRole | null
}) {
  const profile = getUgcPresetProfile(input.formatSubtype, input.presetFamily)
  if (!profile) return null
  return profile.pacingContract.roleDurationRangeSeconds[input.hookRole ?? 'setup']
    ?? profile.pacingContract.idealShotDurationRangeSeconds
}

export function resolveUgcCreativeProfile(input: {
  prompt?: string | null
  formatSubtype: CinematicFormatSubtype | null | undefined
  presetFamily?: CinematicPresetFamily | null
}) {
  const profile = getUgcPresetProfile(input.formatSubtype, input.presetFamily)
  const defaults = getProfileCreativeDefaults(profile)
  const prompt = normalizePrompt(input.prompt ?? '')
  if (!prompt) return defaults

  const hasNarratorBackdropCue = /\b(narrat(or|ion)|voice ?over|voiceover|spoken over|over footage|broll|b roll|b-roll|backdrop|montage|background footage)\b/.test(prompt)
  const hasContrastCue = /\b(split screen|split-screen|before after|before and after|versus| vs |comparison|winner|loser|rich vs poor|poor vs rich)\b/.test(prompt)
  const hasAbsurdCue = /\b(funny|comedic|absurd|unhinged|fruit drama|soap opera|personified|cartoon drama|gossip container)\b/.test(prompt)
  const hasAestheticCue = /\b(mesmerizing|satisfying|beautiful|calm footage|aesthetic|pretty footage|soothing|odd visual)\b/.test(prompt)
  const hasFacelessCue = /\b(faceless|screen recording|screen-led|process|workflow|demo loop|podcast)\b/.test(prompt)

  if (hasContrastCue) {
    return {
      creativeTreatment: 'contrast_split',
      hookFamily: 'status_or_before_after_contrast',
      narrationMode: defaults.narrationMode === 'spoken_to_camera' ? 'sparse_overlay' : (defaults.narrationMode ?? 'sparse_overlay'),
      backdropRole: 'contrast_backdrop',
      backdropStrategy: 'Use a two-pole contrast with a clear winner-vs-loser or before-vs-after frame one.',
    } satisfies UgcCreativeProfile
  }

  if (hasAbsurdCue) {
    return {
      creativeTreatment: 'comedic_absurd_container',
      hookFamily: 'social_drama_open_loop',
      narrationMode: hasNarratorBackdropCue ? 'spoken_over_footage' : (defaults.narrationMode ?? 'spoken_over_footage'),
      backdropRole: 'comedic_backdrop',
      backdropStrategy: 'Use absurd or funny footage that makes the viewer stop, then pivot into real product proof.',
    } satisfies UgcCreativeProfile
  }

  if (hasAestheticCue && hasNarratorBackdropCue) {
    return {
      creativeTreatment: 'aesthetic_mismatch',
      hookFamily: 'odd_visual_plus_serious_narration',
      narrationMode: 'spoken_over_footage',
      backdropRole: 'aesthetic_backdrop',
      backdropStrategy: 'Use calm, beautiful, or mesmerizing backdrop footage while the narration carries a sharper problem or reframe.',
    } satisfies UgcCreativeProfile
  }

  if (hasNarratorBackdropCue) {
    return {
      creativeTreatment: 'narrator_over_backdrop',
      hookFamily: defaults.hookFamily ?? 'sharp_pain_confession',
      narrationMode: 'spoken_over_footage',
      backdropRole: 'engagement_backdrop',
      backdropStrategy: 'Use backdrop footage with a real engagement function while concise narration advances the argument and proof interrupts before the close.',
    } satisfies UgcCreativeProfile
  }

  if (hasFacelessCue) {
    return {
      creativeTreatment: 'faceless_proof_demo',
      hookFamily: defaults.hookFamily ?? 'wrong_belief_interrupt',
      narrationMode: defaults.narrationMode ?? 'sparse_overlay',
      backdropRole: 'proof_backdrop',
      backdropStrategy: 'Keep the object, app, or process as the visual hero and make the proof surface legible throughout.',
    } satisfies UgcCreativeProfile
  }

  return defaults
}

export function getUgcVariationBlueprints(input: {
  prompt: string
  presetFamily: CinematicPresetFamily
  formatSubtype: CinematicFormatSubtype | null | undefined
  requestedCount?: number | null
}) {
  if (input.presetFamily === 'story_movie_tv') return [] as UgcVariationBlueprint[]

  const primary = resolveUgcCreativeProfile(input)
  const baseCtaSoftness = input.presetFamily === 'ugc_creator' ? 'soft' : 'direct'
  const defaults = getProfileCreativeDefaults(getUgcPresetProfile(input.formatSubtype, input.presetFamily))
  const blueprints: UgcVariationBlueprint[] = [
    {
      id: 'primary',
      label: 'Primary Recommended',
      isPrimary: true,
      proofBias: input.presetFamily === 'ugc_direct_response_ad' ? 'early' : 'mid',
      ctaSoftness: baseCtaSoftness,
      ...primary,
    },
  ]

  if (input.presetFamily === 'ugc_creator') {
    blueprints.push(
      {
        id: 'narrator_reframe',
        label: 'Narrator Backdrop',
        isPrimary: false,
        proofBias: 'mid',
        ctaSoftness: 'soft',
        creativeTreatment: 'narrator_over_backdrop',
        hookFamily: primary.hookFamily ?? defaults.hookFamily ?? 'wrong_belief_interrupt',
        narrationMode: 'spoken_over_footage',
        backdropRole: 'engagement_backdrop',
        backdropStrategy: 'Use calm or visually interesting backdrop footage while the narration reframes the problem, then interrupt with visible proof.',
      },
      {
        id: 'proof_forward',
        label: 'Proof-Forward Demo',
        isPrimary: false,
        proofBias: 'early',
        ctaSoftness: 'soft',
        creativeTreatment: 'faceless_proof_demo',
        hookFamily: 'wrong_belief_interrupt',
        narrationMode: 'spoken_over_footage',
        backdropRole: 'proof_backdrop',
        backdropStrategy: 'Open on screen or product proof earlier while keeping the creator voice concise and emotionally grounded.',
      },
    )
  } else if (input.presetFamily === 'ugc_direct_response_ad') {
    blueprints.push(
      {
        id: 'creator_angle',
        label: 'Creator Testimonial',
        isPrimary: false,
        proofBias: 'mid',
        ctaSoftness: 'soft',
        creativeTreatment: 'creator_direct_to_camera',
        hookFamily: defaults.hookFamily ?? 'sharp_pain_confession',
        narrationMode: 'spoken_to_camera',
        backdropRole: null,
        backdropStrategy: 'Use a creator-native talking-head container with concise pain, proof, and CTA beats.',
      },
      {
        id: 'proof_demo',
        label: 'Screen / Proof Demo',
        isPrimary: false,
        proofBias: 'early',
        ctaSoftness: 'direct',
        creativeTreatment: 'faceless_proof_demo',
        hookFamily: 'wrong_belief_interrupt',
        narrationMode: 'spoken_over_footage',
        backdropRole: 'proof_backdrop',
        backdropStrategy: 'Make the product or app the visual hero and land visible proof before the final CTA beat.',
      },
    )
  } else {
    blueprints.push(
      {
        id: 'backdrop_angle',
        label: 'Narrated Backdrop',
        isPrimary: false,
        proofBias: 'mid',
        ctaSoftness: 'direct',
        creativeTreatment: 'narrator_over_backdrop',
        hookFamily: defaults.hookFamily ?? 'odd_visual_plus_serious_narration',
        narrationMode: 'spoken_over_footage',
        backdropRole: 'engagement_backdrop',
        backdropStrategy: 'Use engaging object or process footage with concise narration that explains the problem and interrupts with proof.',
      },
      {
        id: 'contrast_angle',
        label: 'Contrast Split',
        isPrimary: false,
        proofBias: 'early',
        ctaSoftness: 'direct',
        creativeTreatment: 'contrast_split',
        hookFamily: 'status_or_before_after_contrast',
        narrationMode: 'sparse_overlay',
        backdropRole: 'contrast_backdrop',
        backdropStrategy: 'Use a comparison-led or split-frame treatment so the winner is obvious in the first seconds.',
      },
    )
  }

  const requestedCount = Math.max(1, Math.min(8, Math.round(input.requestedCount ?? 3)))
  return blueprints.slice(0, requestedCount)
}

export function getUgcDefaultShotDurationSeconds(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  presetFamily?: CinematicPresetFamily | null
  hookRole?: CinematicHookRole | null
}) {
  const range = getUgcDurationRangeForShot(input)
  return range ? midpoint(range) : null
}

export function normalizeUgcPlannedShotDuration(input: {
  formatSubtype: CinematicFormatSubtype | null | undefined
  presetFamily?: CinematicPresetFamily | null
  hookRole?: CinematicHookRole | null
  durationSeconds: number | null | undefined
}) {
  if (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds)) return null
  const range = getUgcDurationRangeForShot(input)
  const rounded = Math.round(input.durationSeconds)
  if (!range) return Math.min(15, Math.max(1, rounded))
  return Math.min(15, Math.max(1, Math.min(range[1], Math.max(range[0], rounded))))
}

export function getUgcTargetTotalDurationRange(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  presetFamily?: CinematicPresetFamily | null,
) {
  return getUgcPresetProfile(formatSubtype, presetFamily)?.pacingContract.targetTotalDurationRangeSeconds ?? null
}

export function getUgcTargetShotCountRange(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  presetFamily?: CinematicPresetFamily | null,
) {
  return getUgcPresetProfile(formatSubtype, presetFamily)?.pacingContract.targetShotCountRange ?? null
}

export function inferCinematicPresetFamilyFromPromptText(prompt: string): CinematicPresetFamily {
  const normalized = normalizePrompt(prompt)
  if (!normalized) return 'story_movie_tv'

  const creatorScore = countKeywordMatches(normalized, FAMILY_KEYWORDS.ugc_creator)
  const adScore = countKeywordMatches(normalized, FAMILY_KEYWORDS.ugc_direct_response_ad)
  const facelessScore = countKeywordMatches(normalized, FAMILY_KEYWORDS.ugc_faceless_format)
  const creatorNativeIntent = /\b(validating|emotionally accurate|non preachy|nonpreachy|feel seen|feel guilty|ashamed|not weakness|not weak|not a character flaw|not broken|not your fault|stress chemistry|friend to friend|direct to camera|creator video|creator led|creator-led|confession|reframe|validation)\b/.test(normalized)
  const explicitAdIntent = /\b(direct response|conversion|roas|offer|product page|campaign|brand ad|shop now|buy now|order now|install now|promote|promotion|app promo)\b/.test(normalized)

  if (explicitAdIntent && adScore > 0) return 'ugc_direct_response_ad'
  if (facelessScore > 0 && facelessScore >= Math.max(creatorScore, adScore)) return 'ugc_faceless_format'
  if ((creatorScore > 0 || creatorNativeIntent) && !explicitAdIntent) return 'ugc_creator'
  if (adScore > 0) return 'ugc_direct_response_ad'
  if (creatorScore > 0) return 'ugc_creator'
  if (countKeywordMatches(normalized, STORY_KEYWORDS) > 0) return 'story_movie_tv'
  return 'story_movie_tv'
}

export function inferCinematicFormatSubtypeFromPromptText(
  prompt: string,
  presetFamily: CinematicPresetFamily,
): CinematicFormatSubtype | null {
  const normalized = normalizePrompt(prompt)
  if (!normalized) return getDefaultUgcFormatSubtypeForPresetFamily(presetFamily)

  if (/\b(rich vs poor|poor vs rich|pay to win|before after|before and after|glow up|transformation|comparison|contrast|versus|vs)\b/.test(normalized)) {
    return 'contrast_narrative'
  }
  if (presetFamily === 'ugc_creator') {
    if (/\b(drama|gossip|serialized|series|betrayal|cheating|secret|storytime|episode)\b/.test(normalized)) return 'creator_serialized_drama'
    if (/\b(not weakness|not weak|not a character flaw|not broken|not your fault|stress chemistry|permission slip|permission to|self blame|self blame|shame|guilt)\b/.test(normalized)) return 'creator_reframe'
    if (/\b(reframe|redirect|overthink|overthinking|if you are going to|permission)\b/.test(normalized)) return 'creator_reframe'
    if (/\b(validation|validate|you are not alone|its okay|it s okay|needed this|feel seen|not alone|seen first)\b/.test(normalized)) return 'creator_validation'
    if (/\b(help(s)?|app helps|reduce|improve sleep|regulate|solution|instead of|what i do now|this helped me)\b/.test(normalized)) return 'creator_problem_solution'
  }
  if (presetFamily === 'ugc_direct_response_ad') {
    if (/\b(story ad|drama ad|gossip ad|trojan horse|soap opera|betrayal|secret|episode|fruit drama|serialized|app promo|app promotion|install|dating app|productivity app|health app|absurd container)\b/.test(normalized)) return 'ad_trojan_horse_drama'
    if (/\b(mechanism|proof|how it works|doing it wrong|wrong way)\b/.test(normalized)) return 'ad_mechanism_proof'
    if (/\b(comparison|compare|versus|vs|better than)\b/.test(normalized)) return 'ad_comparison'
    if (/\b(before after|before and after|glow up|transformation)\b/.test(normalized)) return 'ad_before_after'
  }
  if (presetFamily === 'ugc_faceless_format') {
    if (/\b(fruit drama|animated fruit|cartoon drama|absurd drama|personified|soap opera|gossip|betrayal|cheating|serialized|episode|taboo|unserious packaging)\b/.test(normalized)) return 'faceless_serialized_drama'
    if (/\b(workflow|process|step by step|routine)\b/.test(normalized)) return 'faceless_process'
    if (/\b(explainer|how it works|doing it wrong|wrong way|mistake)\b/.test(normalized)) return 'faceless_explainer'
  }

  const eligibleProfiles = Object.values(UGC_PRESET_PROFILES).filter((profile) => (
    presetFamily === 'story_movie_tv'
      ? false
      : profile.presetFamily === presetFamily || profile.formatSubtype === 'contrast_narrative'
  ))

  let bestProfile: UgcPresetProfile | null = null
  let bestScore = 0

  for (const profile of eligibleProfiles) {
    const score = countKeywordMatches(normalized, profile.promptKeywords)
    if (score > bestScore) {
      bestScore = score
      bestProfile = profile
    }
  }

  if (bestProfile) return bestProfile.formatSubtype
  return getDefaultUgcFormatSubtypeForPresetFamily(presetFamily)
}

export function correctUgcPresetSelectionForPromptText(input: {
  prompt: string
  presetFamily: CinematicPresetFamily
  formatSubtype: CinematicFormatSubtype | null | undefined
}) {
  const normalized = normalizePrompt(input.prompt)
  const creatorNativeIntent = /\b(validating|emotionally accurate|non preachy|nonpreachy|feel seen|feel guilty|ashamed|not weakness|not weak|not a character flaw|not broken|not your fault|stress chemistry|friend to friend|confession|reframe|validation|creator video|creator led|creator-led)\b/.test(normalized)
  const explicitAdIntent = /\b(direct response|conversion|roas|offer|product page|campaign|brand ad|shop now|buy now|order now|install now|promote|promotion|app promo)\b/.test(normalized)
  const inferredPresetFamily = inferCinematicPresetFamilyFromPromptText(input.prompt)
  let presetFamily = input.presetFamily

  if (creatorNativeIntent && !explicitAdIntent && inferredPresetFamily === 'ugc_creator') {
    presetFamily = 'ugc_creator'
  } else if (presetFamily === 'story_movie_tv' && inferredPresetFamily !== 'story_movie_tv') {
    presetFamily = inferredPresetFamily
  }

  const correctedFormatSubtype = coerceFormatSubtypeForPresetFamily(
    presetFamily,
    inferCinematicFormatSubtypeFromPromptText(input.prompt, presetFamily)
      ?? input.formatSubtype
      ?? getDefaultUgcFormatSubtypeForPresetFamily(presetFamily),
  )

  return {
    presetFamily,
    formatSubtype: correctedFormatSubtype,
  }
}

export function isFormulaFamilyAllowedForFormatSubtype(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  formulaFamily: CinematicFormulaFamily | null | undefined,
) {
  if (!formatSubtype || !formulaFamily) return true
  const profile = getUgcPresetProfile(formatSubtype)
  return profile ? profile.allowedFormulaFamilies.includes(formulaFamily) : true
}

export function isDominantTriggerAllowedForFormatSubtype(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  dominantTrigger: CinematicDominantTrigger | null | undefined,
) {
  if (!formatSubtype || !dominantTrigger) return true
  const profile = getUgcPresetProfile(formatSubtype)
  return profile ? profile.allowedDominantTriggers.includes(dominantTrigger) : true
}

export function pickUgcHookRoleForShot(
  formatSubtype: CinematicFormatSubtype | null | undefined,
  shotIndex: number,
  shotCount: number,
): CinematicHookRole | null {
  const profile = getUgcPresetProfile(formatSubtype)
  const sequence = profile?.shotRoleSequence ?? ['hook', 'setup', 'proof', 'payoff', 'cta']
  if (shotCount <= 1) return sequence[0] ?? 'hook'
  if (shotCount === 2) return shotIndex === 0 ? 'hook' : 'payoff'
  const sequenceIndex = Math.round((shotIndex / Math.max(1, shotCount - 1)) * (sequence.length - 1))
  return sequence[Math.max(0, Math.min(sequence.length - 1, sequenceIndex))] ?? null
}

export function deriveUgcShotDefaults(input: {
  presetFamily: CinematicPresetFamily
  formatSubtype: CinematicFormatSubtype | null | undefined
  shotIndex: number
  shotCount: number
  hookRole?: CinematicHookRole | null
}) {
  const profile = getUgcPresetProfile(input.formatSubtype, input.presetFamily)
  const hookRole = input.hookRole ?? pickUgcHookRoleForShot(input.formatSubtype, input.shotIndex, input.shotCount)
  if (!profile) {
    return {
      hookRole,
      formulaFamily: null,
      dominantTrigger: null,
      hookType: '',
      targetEmotion: '',
      personaStyle: '',
      contrastAxis: '',
      proofMoment: '',
      ctaStyle: '',
      proofType: '',
      ctaType: '',
    }
  }

  return {
    hookRole,
    formulaFamily: profile.defaultFormulaFamily,
    dominantTrigger: profile.defaultDominantTrigger,
    hookType: profile.defaultHookType,
    targetEmotion: profile.roleTargetEmotions[hookRole ?? 'setup'] ?? profile.defaultTargetEmotion,
    personaStyle: profile.requiresPersonaStyle ? profile.defaultPersonaStyle : '',
    contrastAxis: profile.defaultContrastAxis,
    proofMoment: profile.defaultProofMoment,
    ctaStyle: profile.defaultCtaStyle,
    proofType: profile.defaultProofType,
    ctaType: profile.defaultCtaType,
  }
}
