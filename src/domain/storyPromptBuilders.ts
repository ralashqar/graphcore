import type {
  CinematicStoryLanguagePreset,
  CinematicStoryScenePreset,
} from './cinematics.ts'
import {
  getStoryLanguagePresetLabel,
  getStoryScenePresetLabel,
  resolveStoryRuntimeContract,
} from './storyPresetProfiles.ts'

export const STORY_SCRIPT_INGEST_PIPELINE = 'story_script_ingest_v1' as const
export const STORY_PROMPT_VERSION = 'story_prompt_timeline_v2' as const

type StoryPromptInput = {
  targetShotCount?: number
  storyScenePreset?: CinematicStoryScenePreset | null
  storyLanguagePreset?: CinematicStoryLanguagePreset | null
  repairMode?: boolean
}

function formatStoryBiasLines(input: StoryPromptInput) {
  const contract = resolveStoryRuntimeContract({
    storyScenePreset: input.storyScenePreset ?? null,
    storyLanguagePreset: input.storyLanguagePreset ?? null,
  })
  const actionPreset = contract.actionDensityBias !== 'low'

  return {
    contract,
    actionPreset,
    lines: [
      `Scene bias: ${getStoryScenePresetLabel(contract.scenePreset)}.`,
      `Camera bias: ${getStoryLanguagePresetLabel(contract.languagePreset)}.`,
      `Dialogue guidance: ${contract.dialogueDensityGuidance}`,
      `Blocking guidance: ${contract.blockingGuidance}`,
      `Coverage guidance: ${contract.coverageStrategy}`,
      actionPreset
        ? 'In action scenes, establish geography fast, then get to pressure or contact quickly.'
        : 'Let performance, blocking, and listener reaction carry the turn instead of explanatory coverage.',
      actionPreset
        ? 'One shot can hold a continuous exchange until a tactical turn, geography change, or reversal earns the cut.'
        : 'Keep cuts motivated by a real shift in leverage, information, or emotional temperature.',
    ].filter((entry): entry is string => Boolean(entry)),
  }
}

export function buildStoryShotSkeletonPlannerPrompt(input: StoryPromptInput = {}) {
  const { lines } = formatStoryBiasLines(input)
  return [
    'You are planning a short TV/movie scene for GraphCore.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, shots, diagnostics, assistantNotes.',
    `Write about ${input.targetShotCount ?? 5} ordered shots unless the prompt clearly asks for a nearby count.`,
    'Use only the locked entities provided in context. Do not invent or rename entities.',
    'Each shot should contain only: id, sceneId, title, beat, hookRole, participantRefIds, locationRefId, propRefIds, shotType, forceTakeBreak.',
    'beat should be one short visible planning line, not final screenplay prose.',
    'Plan around dramatic turns, reversals, reveals, and memorable images, not even beat coverage.',
    'Do not author graphSettings, dialogue, actions, audio, directing packages, reference plans, source wiring, visual prompts, composition guides, storyboard plans, or other runtime packaging in this pass.',
    ...lines,
  ].join('\n')
}

export function buildStoryCreativeScriptPrompt(input: StoryPromptInput = {}) {
  const { lines, actionPreset } = formatStoryBiasLines(input)
  return [
    input.repairMode
      ? 'You are repairing a short TV/movie script from a locked shot skeleton.'
      : 'You are writing a short TV/movie script from a locked shot skeleton.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: rawScriptMarkdown, diagnostics, assistantNotes.',
    'Do not change shot ids, shot order, participants, locations, props, or locked scene/camera bias.',
    'Write rawScriptMarkdown using this exact structure:',
    '# SCENE: <scene title> when the scene changes',
    '## SHOT: <shot_id>',
    'ACTION:',
    '- <optional local shot timing start-end in seconds> <visible action beat>',
    '- <optional local shot timing start-end in seconds> <next visible action beat>',
    'DIALOGUE:',
    '- <optional local shot timing start-end in seconds> <Speaker: spoken line>',
    'CAMERA: <short camera note only when it materially helps the beat>',
    'AUDIO:',
    '- <optional local shot timing start-end in seconds> <material sound cue, ambience, or silence note>',
    'NOTES: <optional short note only when needed>',
    'If useful, local timing should look like "0.0-1.4" at the start of a bullet line. Use shot-local seconds only, never global sequence timestamps.',
    'Use multiple bullets in ACTION, DIALOGUE, or AUDIO when a shot contains multiple distinct beats.',
    'Do not just repeat the full shot prose in ACTION. Break the shot into playable visible beats.',
    'Write a strong scene, not GraphCore packaging.',
    'Prefer visible cause and effect over abstract summaries of tension, power, or momentum.',
    'Keep dialogue sparse, playable, and character-specific. Silence is better than generic filler.',
    'End on a strong visual payoff.',
    actionPreset
      ? 'Do not spend multiple shots restating stance or approach once geography is clear.'
      : 'Let reaction, hesitation, interruption, and silence do real dramatic work.',
    ...lines,
  ].join('\n')
}
