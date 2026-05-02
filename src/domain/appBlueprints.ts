import type { AppProjectSubtype } from './projectContext.ts'

export type AppBlueprintScreen = {
  id: string
  name: string
  route: string
  purpose: string
  required: boolean
}

export type AppBlueprint = {
  subtype: AppProjectSubtype
  label: string
  archetype: string
  coreLoop: string
  requiredScreens: AppBlueprintScreen[]
  typicalDataModels: string[]
  commonActions: string[]
  monetizationMoment: string
  retentionLoop: string
  viralLoop: string
  designToneDefaults: string[]
}

export const APP_BLUEPRINTS: Record<AppProjectSubtype, AppBlueprint> = {
  ai_utility_wrapper: {
    subtype: 'ai_utility_wrapper',
    label: 'AI Utility Wrapper',
    archetype: 'AI Utility Wrapper',
    coreLoop: 'problem hook -> input/upload -> AI processing -> result -> refine/export -> history',
    requiredScreens: [
      { id: 'hook', name: 'HookProblemScreen', route: '/', purpose: 'Make the user problem and promised outcome obvious.', required: true },
      { id: 'input', name: 'InputScreen', route: '/input', purpose: 'Collect prompt, uploaded file, image, or structured input.', required: true },
      { id: 'processing', name: 'ProcessingScreen', route: '/processing', purpose: 'Show credible AI work and progress while the result is generated.', required: true },
      { id: 'result', name: 'ResultScreen', route: '/result', purpose: 'Present the first successful result with edit and save affordances.', required: true },
      { id: 'refine', name: 'RefinementScreen', route: '/refine', purpose: 'Let the user adjust, regenerate, or improve the result.', required: true },
      { id: 'paywall', name: 'PaywallExportScreen', route: '/paywall', purpose: 'Gate premium export, batch, HD, or advanced output.', required: true },
      { id: 'history', name: 'HistoryScreen', route: '/history', purpose: 'Let the user revisit prior generations and continue work.', required: true },
    ],
    typicalDataModels: ['UserProfile', 'GenerationInput', 'GeneratedResult', 'GenerationHistoryItem', 'SubscriptionState'],
    commonActions: ['CreateGenerationInput', 'RunAiGeneration', 'RefineResult', 'ExportResult', 'OpenPaywall', 'ViewHistory'],
    monetizationMoment: 'Gate export, HD, batch, advanced edits, or saved history after the first value proof.',
    retentionLoop: 'Saved history, templates, reminders, and better repeat results.',
    viralLoop: 'Shareable before/after result or public output card.',
    designToneDefaults: ['clear', 'work-focused', 'premium utility', 'fast feedback'],
  },
  mascot_daily_ritual: {
    subtype: 'mascot_daily_ritual',
    label: 'Mascot / Daily Ritual',
    archetype: 'Mascot / Daily Ritual App',
    coreLoop: 'daily input -> magic generation -> reveal -> share/save -> timeline',
    requiredScreens: [
      { id: 'onboarding', name: 'OnboardingIntroScreen', route: '/', purpose: 'Introduce the emotional promise and daily ritual.', required: true },
      { id: 'personalize', name: 'MascotPersonalizationScreen', route: '/personalize', purpose: 'Name or personalize the companion/avatar/egg.', required: true },
      { id: 'setup', name: 'PermissionSetupScreen', route: '/setup', purpose: 'Prime useful permissions and explain mocked preview fallbacks.', required: true },
      { id: 'home', name: 'DailyHomeScreen', route: '/home', purpose: 'Anchor the daily loop and show the companion state.', required: true },
      { id: 'input', name: 'DailyInputScreen', route: '/daily-input', purpose: 'Capture a short check-in, moment, mood, photo, or note.', required: true },
      { id: 'processing', name: 'MagicProcessingScreen', route: '/magic', purpose: 'Turn waiting into the product magic moment.', required: true },
      { id: 'reveal', name: 'ResultRevealScreen', route: '/reveal', purpose: 'Reveal the generated creature/card/avatar result.', required: true },
      { id: 'share', name: 'ShareScreen', route: '/share', purpose: 'Package the result into a shareable card.', required: true },
      { id: 'paywall', name: 'PaywallScreen', route: '/paywall', purpose: 'Offer premium history, animation, rarity, or customization.', required: true },
      { id: 'timeline', name: 'TimelineScreen', route: '/timeline', purpose: 'Show collection, streaks, and past rituals.', required: true },
    ],
    typicalDataModels: ['UserProfile', 'DailyEntry', 'GeneratedCompanionResult', 'CollectionItem', 'SubscriptionState'],
    commonActions: ['CreateDailyEntry', 'GenerateCompanionResult', 'ShareResult', 'OpenPaywall', 'Subscribe', 'ViewTimeline'],
    monetizationMoment: 'Offer premium after the first emotionally satisfying reveal.',
    retentionLoop: 'Daily streaks, collection/timeline, companion state changes, and reminders.',
    viralLoop: 'Shareable generated card or creature reveal.',
    designToneDefaults: ['warm', 'ritualized', 'playful', 'emotionally polished'],
  },
  content_generator: {
    subtype: 'content_generator',
    label: 'Content Generator',
    archetype: 'Content Generator App',
    coreLoop: 'choose output -> prompt/upload -> generate -> edit -> export/share -> projects',
    requiredScreens: [
      { id: 'choose', name: 'ChooseOutputTypeScreen', route: '/', purpose: 'Let the user choose the content format to generate.', required: true },
      { id: 'input', name: 'PromptUploadScreen', route: '/input', purpose: 'Collect prompt, references, uploads, and constraints.', required: true },
      { id: 'style', name: 'StyleSelectionScreen', route: '/style', purpose: 'Select visual or content style before generation.', required: true },
      { id: 'generation', name: 'GenerationProgressScreen', route: '/generation', purpose: 'Show progress and reinforce quality while drafts generate.', required: true },
      { id: 'preview', name: 'ResultPreviewScreen', route: '/preview', purpose: 'Display generated draft with clear next actions.', required: true },
      { id: 'edit', name: 'EditRegenerateScreen', route: '/edit', purpose: 'Support revision, regeneration, and structured edits.', required: true },
      { id: 'export', name: 'ExportShareScreen', route: '/export', purpose: 'Package output for download, share, or handoff.', required: true },
      { id: 'paywall', name: 'PaywallScreen', route: '/paywall', purpose: 'Gate HD, batch, advanced models, or commercial usage.', required: true },
      { id: 'history', name: 'ProjectHistoryScreen', route: '/projects', purpose: 'Persist projects and re-open prior generations.', required: true },
    ],
    typicalDataModels: ['UserProfile', 'GeneratorProject', 'ReferenceAsset', 'GeneratedDraft', 'ExportJob', 'SubscriptionState'],
    commonActions: ['SelectOutputType', 'UploadReference', 'GenerateDraft', 'EditDraft', 'RegenerateDraft', 'ExportDraft', 'OpenPaywall'],
    monetizationMoment: 'Gate HD export, batch generation, brand kits, advanced editing, or commercial license.',
    retentionLoop: 'Saved projects, reusable styles, drafts, templates, and project history.',
    viralLoop: 'Shareable finished output or watermarked preview.',
    designToneDefaults: ['creative', 'editorial', 'efficient', 'output-led'],
  },
}

export function getAppBlueprint(projectSubtype: AppProjectSubtype) {
  return APP_BLUEPRINTS[projectSubtype]
}

export function getAllAppBlueprints() {
  return Object.values(APP_BLUEPRINTS)
}
