import {
  coerceFormatSubtypeForPresetFamily,
} from './cinematics.ts'
import type {
  CinematicDominantTrigger,
  CinematicFormatSubtype,
  CinematicFormulaFamily,
  CinematicHookRole,
  CinematicPresetFamily,
} from './cinematics.ts'

type UgcPresetFamily = Exclude<CinematicPresetFamily, 'story_movie_tv'>

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
  pacingGuidance: string
  referenceStrategy: string
  requiresPersonaStyle: boolean
  requiresCreatorOrProductContinuity: boolean
  requiresProductOrProofContinuity: boolean
  prefersStoryboardSupport: boolean
  visualFirst: boolean
  promptKeywords: string[]
}

const FAMILY_DEFAULT_SUBTYPE: Record<UgcPresetFamily, CinematicFormatSubtype> = {
  ugc_creator: 'creator_problem_solution',
  ugc_direct_response_ad: 'ad_problem_solution',
  ugc_faceless_format: 'faceless_demo',
}

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
    pacingGuidance: 'Hook fast, then move through pain to believable proof without sounding scripted.',
    referenceStrategy: 'Prioritize creator identity plus product continuity; storyboard support is optional.',
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
    pacingGuidance: 'Open with the behavior immediately and move quickly into the new interpretation.',
    referenceStrategy: 'Prioritize creator identity; product continuity is secondary unless the prompt is explicitly sponsored.',
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
    pacingGuidance: 'Keep the language sparse and let the validating statement do most of the work.',
    referenceStrategy: 'Prioritize creator identity and intimacy; product continuity is optional.',
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
    pacingGuidance: 'Establish conflict fast, hold tension through the middle, and let the product arrive as the twist or rescue.',
    referenceStrategy: 'Use creator identity plus recurring character or object continuity if the series format matters.',
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
    pacingGuidance: 'Surface the pain immediately, show the product early, and land proof before the ending.',
    referenceStrategy: 'Prioritize product and proof continuity first, then creator continuity.',
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
    pacingGuidance: 'Keep each beat visually legible and move from hidden cause to demonstration fast.',
    referenceStrategy: 'Product and proof refs are mandatory; creator refs are optional.',
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
    pacingGuidance: 'Do not over-explain; let the contrast do the persuasion.',
    referenceStrategy: 'Proof refs and comparison states matter more than persona.',
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
    pacingGuidance: 'Keep each beat comparison-led and avoid repeating the same evidence twice.',
    referenceStrategy: 'Product, competitor/comparison, and proof refs should stay readable through the sequence.',
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
    pacingGuidance: 'Use setup, betrayal, suffering, reveal, and redemption. Delay the product until the twist, but not until after the ending.',
    referenceStrategy: 'Use product and proof continuity plus recurring story actors or social objects when the narrative repeats across a series.',
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
    pacingGuidance: 'Keep the object or screen as the hero and avoid unnecessary exposition.',
    referenceStrategy: 'Product, screen, and proof refs are primary; faces are optional.',
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
    pacingGuidance: 'Move quickly from the mistaken assumption to the visible correction.',
    referenceStrategy: 'Objects, screens, and proof states matter more than people.',
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
    pacingGuidance: 'Each beat should advance the process or reveal, not linger on one stage.',
    referenceStrategy: 'Use object, process, and result refs; faces are usually unnecessary.',
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
    pacingGuidance: 'Use serious conflict inside unserious packaging, keep the beats visual, and make the product the visible answer.',
    referenceStrategy: 'Use recurring non-human or object-character continuity, plus storyboard support when the serialized sequence matters.',
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
    pacingGuidance: 'Use short escalating beats, keep most shots visual, and land the clearest winner frame at the end.',
    referenceStrategy: 'Storyboard and comparison support matter alongside proof and continuity refs.',
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
