import { cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import { formatSequenceAnimaticSceneStateForPrompt } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { z } from 'zod'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  buildSeedanceCharacterVoiceGuide,
  buildSeedanceReferenceManifest,
  compactSeedanceControlText,
  formatSeedanceReferenceManifest,
  seedanceLabanMovementBlock,
  seedanceProductionBoardArtifactBan,
} from './output-workflow-seedance-video-prompt-runtime.ts'
import { buildCinematicV3StoryboardGroupAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  buildSequenceAnimaticShotVisualCallSheet,
  formatSequenceAnimaticShotVisualCallSheetCameraPlan,
  formatSequenceAnimaticShotVisualCallSheetForPrompt,
  inferSequenceShotVideoTimingRuntime,
} from './output-workflow-sequence-animatic-shot-video-runtime.ts'
import {
  orderSequenceAnimaticAssetPackReferences,
  scopeAssetPackToReferenceAssetKeys,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
  sequenceAnimaticReferenceName,
  sequenceAnimaticReferenceRole,
  sequenceAnimaticReferenceVisual,
} from './output-workflow-sequence-animatic-reference-runtime.ts'
import {
  formatVibeDirectorWorkflowBriefForPrompt,
  vibeDirectorContinuityReadinessSchema,
  vibeDirectorQualityPassSchema,
  vibeDirectorShotDirectionSchema,
} from '../../../src/domain/vibeDirector.ts'

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
  status?: string
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}

function readVibeDirectorConfig(config: Record<string, unknown>, helpers: SequenceAnimaticWorkflowNodePackHelpers) {
  const direct = helpers.asRecord(config.vibeDirector ?? config.vibe_director)
  if (Object.keys(direct).length > 0) return direct
  const continuityOptions = helpers.asRecord(config.shotContinuityOptions ?? config.shot_continuity_options)
  return helpers.asRecord(continuityOptions.vibeDirector ?? continuityOptions.vibe_director)
}

function vibeDirectorShotDirection(input: {
  shot: Record<string, unknown>
  shotId: string
  vibeDirector: Record<string, unknown>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
}) {
  const { helpers, shot, shotId, vibeDirector } = input
  const shotNotes = helpers.asRecord(vibeDirector.shotDirectingNotesByShotId ?? vibeDirector.shot_directing_notes_by_shot_id)
  const camera = helpers.asRecord(shot.camera)
  return vibeDirectorShotDirectionSchema.parse({
    version: 'vibe_director_shot_direction_v1',
    shotId,
    note: helpers.readText(shotNotes[shotId]) || helpers.readText(vibeDirector.directingStyle),
    camera: [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens)].filter(Boolean).join('; ') || helpers.readText(shot.camera),
    movement: helpers.readText(camera.movement) || helpers.readText(shot.movement),
    performance: helpers.readText(shot.performance) || helpers.readText(vibeDirector.performanceMode),
    continuity: helpers.readText(shot.continuity),
    source: helpers.readText(shotNotes[shotId]) ? 'user' : 'recommendation',
  })
}

function referenceRoleCounts(input: {
  referenceManifest: Array<Record<string, unknown>>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
}) {
  const { helpers, referenceManifest } = input
  const roles = referenceManifest.map((entry) => helpers.readText(entry.role)).filter(Boolean)
  const roleIncludes = (needles: string[]) => roles.filter((role) => needles.some((needle) => role.includes(needle))).length
  return {
    canonical: roleIncludes(['character', 'world_', 'entity', 'prop', 'item']),
    spatial: roleIncludes(['zone', 'location', 'set', 'spot', 'viewpoint', 'coverage']),
    previous: roleIncludes(['previous', 'keyframe']),
    storyboard: roleIncludes(['storyboard', 'panel', 'comic']),
  }
}

function readPreferredUpstreamImage(input: {
  upstream: Record<string, Record<string, unknown>>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  preferredNodeKeys: string[]
  fields?: string[]
  role?: string
}) {
  const fields = input.fields ?? ['image', 'keyframe', 'primaryReferenceImage', 'coverImage']
  const readFromOutputs = (outputs: unknown) => {
    const record = input.helpers.asRecord(outputs)
    for (const field of fields) {
      const image = input.helpers.asRecord(record[field])
      if (input.helpers.readText(image.assetKey) || input.helpers.readText(image.storagePath) || input.helpers.readText(image.url)) return image
    }
    if (input.helpers.readText(record.assetKey) || input.helpers.readText(record.storagePath) || input.helpers.readText(record.url)) return record
    return null
  }
  for (const key of input.preferredNodeKeys) {
    const direct = readFromOutputs(input.upstream[key])
    if (direct) return direct
  }
  if (input.role) {
    for (const outputs of Object.values(input.upstream)) {
      const image = readFromOutputs(outputs)
      if (!image) continue
      if (input.helpers.readText(image.role) === input.role || input.helpers.readText(input.helpers.asRecord(outputs).role) === input.role) return image
    }
  }
  return input.helpers.readFirstUpstreamImage(input.upstream, fields)
}

function readUpstreamVideos(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['video', 'videos'],
) {
  const videos: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !videos.some((video) => helpers.readText(video.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(video.storagePath ?? video.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      videos.push(outputs)
    }
  }
  return videos
}

function cleanSequenceAnimaticKeyframePromptText(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  value: unknown,
  maxWords = 42,
) {
  const source = helpers.readText(value)
    .replace(/\bThe visual continuity stays clear\.?/gi, '')
    .replace(/\bShot\s+(\d+)\s*,\s*Shot\s+\1\b/gi, 'Shot $1')
    .replace(/\s+/g, ' ')
    .trim()
  if (!source) return ''
  const clauses = source
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const unique = clauses.filter((entry) => {
    const key = entry.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const text = unique.length > 0 ? unique.join('; ') : source
  return helpers.compactStoryboardSentence(text, '', maxWords)
}

function cleanSequenceAnimaticDialogueText(value: string) {
  return value
    .replace(/\s*;\s*/g, ' ')
    .replace(/\s+([.!?,])/g, '$1')
    .replace(/([.!?])\s*([.!?])+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatSequenceAnimaticKeyframeDialogueCue(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  shot: LooseRecord,
) {
  return helpers.readArray(shot.dialogue).map(helpers.asRecord).map((line) => {
    const text = cleanSequenceAnimaticDialogueText(helpers.readText(line.text))
    if (!text) return ''
    const speaker = helpers.readText(line.speakerName) || helpers.readText(line.speakerRefId) || 'Speaker'
    return `${speaker} says, "${text}"`
  }).filter(Boolean).join('\n')
}

function referenceLinesForRole(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  assetPack: LooseRecord
  roles: string[]
  fallback: string
  maxCount?: number
  maxVisualWords?: number
}) {
  const roleSet = new Set(input.roles)
  return input.helpers.readArray(input.assetPack.entities).map(input.helpers.asRecord)
    .filter((entity) => roleSet.has(sequenceAnimaticReferenceRole(entity)))
    .map((entity) => {
      const name = sequenceAnimaticReferenceName(entity, input.fallback)
      const visual = sequenceAnimaticReferenceVisual(entity, input.maxVisualWords ?? 14)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, input.maxCount ?? 8)
}

const keyframePromptReferenceKindSchema = z.enum(['location', 'character', 'group_character', 'prop_item', 'continuity_grid'])

const shotDialogueDeliveryCueSchema = z.object({
  speakerName: z.string().default(''),
  speaker_name: z.string().default(''),
  speakerRefId: z.string().default(''),
  speaker_ref_id: z.string().default(''),
  text: z.string().default(''),
  emotion: z.string().default(''),
  delivery: z.string().default(''),
  subtext: z.string().default(''),
})

const shotCharacterPerformanceCueSchema = z.object({
  characterName: z.string().default(''),
  character_name: z.string().default(''),
  characterRefId: z.string().default(''),
  character_ref_id: z.string().default(''),
  emotion: z.string().default(''),
  valence: z.number().nullable().default(null),
  arousal: z.number().nullable().default(null),
  confidence: z.number().nullable().default(null),
  dominance: z.number().nullable().default(null),
  valenceLabel: z.string().default(''),
  valence_label: z.string().default(''),
  arousalLabel: z.string().default(''),
  arousal_label: z.string().default(''),
  confidenceLabel: z.string().default(''),
  confidence_label: z.string().default(''),
  dominanceLabel: z.string().default(''),
  dominance_label: z.string().default(''),
  bodyLanguage: z.string().default(''),
  body_language: z.string().default(''),
  facialExpression: z.string().default(''),
  facial_expression: z.string().default(''),
  gaze: z.string().default(''),
  gesture: z.string().default(''),
  voiceEnergy: z.string().default(''),
  voice_energy: z.string().default(''),
})

const shotPromptCuePackSchema = z.object({
  dialogueDeliveryCues: z.array(shotDialogueDeliveryCueSchema).default([]),
  dialogue_delivery_cues: z.array(shotDialogueDeliveryCueSchema).default([]),
  characterPerformanceCues: z.array(shotCharacterPerformanceCueSchema).default([]),
  character_performance_cues: z.array(shotCharacterPerformanceCueSchema).default([]),
})

const keyframePromptPlanSchema = z.object({
  version: z.literal('sequence_animatic_keyframe_prompt_plan_v1').default('sequence_animatic_keyframe_prompt_plan_v1'),
  referenceAssetKeys: z.array(z.string()).default([]),
  reference_asset_keys: z.array(z.string()).default([]),
  referenceBindings: z.array(z.object({
    imageTag: z.string().default(''),
    image_tag: z.string().default(''),
    assetKey: z.string().default(''),
    asset_key: z.string().default(''),
    name: z.string().default(''),
    kind: keyframePromptReferenceKindSchema.default('prop_item'),
    usage: z.string().default(''),
    identityScope: z.string().default(''),
    identity_scope: z.string().default(''),
  })).default([]),
  reference_bindings: z.array(z.object({
    imageTag: z.string().default(''),
    image_tag: z.string().default(''),
    assetKey: z.string().default(''),
    asset_key: z.string().default(''),
    name: z.string().default(''),
    kind: keyframePromptReferenceKindSchema.default('prop_item'),
    usage: z.string().default(''),
    identityScope: z.string().default(''),
    identity_scope: z.string().default(''),
  })).default([]),
  subjectRoster: z.array(z.object({
    name: z.string().default(''),
    count: z.number().int().min(1).max(20).default(1),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    sourceAssetKey: z.string().default(''),
    source_asset_key: z.string().default(''),
    actionPose: z.string().default(''),
    action_pose: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
    notes: z.string().default(''),
  })).default([]),
  subject_roster: z.array(z.object({
    name: z.string().default(''),
    count: z.number().int().min(1).max(20).default(1),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    sourceAssetKey: z.string().default(''),
    source_asset_key: z.string().default(''),
    actionPose: z.string().default(''),
    action_pose: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
    notes: z.string().default(''),
  })).default([]),
  stagingPlan: z.string().default(''),
  staging_plan: z.string().default(''),
  performanceDirection: z.array(z.string()).default([]),
  performance_direction: z.array(z.string()).default([]),
  dialogueDeliveryPlan: z.array(z.string()).default([]),
  dialogue_delivery_plan: z.array(z.string()).default([]),
  continuityNotes: z.array(z.string()).default([]),
  continuity_notes: z.array(z.string()).default([]),
  negativeRules: z.array(z.string()).default([]),
  negative_rules: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

type KeyframePromptPlan = z.infer<typeof keyframePromptPlanSchema>
type KeyframePromptReferenceKind = z.infer<typeof keyframePromptReferenceKindSchema>
type ShotPromptCuePack = z.infer<typeof shotPromptCuePackSchema>

function keyframePromptPlanBindings(plan: LooseRecord) {
  return (Array.isArray(plan.referenceBindings) ? plan.referenceBindings : Array.isArray(plan.reference_bindings) ? plan.reference_bindings : [])
    .map((entry) => entry && typeof entry === 'object' ? entry as LooseRecord : {})
}

function keyframePromptPlanSubjects(plan: LooseRecord) {
  return (Array.isArray(plan.subjectRoster) ? plan.subjectRoster : Array.isArray(plan.subject_roster) ? plan.subject_roster : [])
    .map((entry) => entry && typeof entry === 'object' ? entry as LooseRecord : {})
}

function normalizedKeyframePromptReferenceKind(role: string, name: string, shotText = ''): KeyframePromptReferenceKind {
  const haystack = `${role} ${name}`.toLowerCase()
  if (haystack.includes('previous_keyframes_continuity_grid')) return 'continuity_grid'
  if (haystack.includes('zone') || haystack.includes('location') || haystack.includes('set_reference') || haystack.includes('viewpoint')) return 'location'
  const groupish = /\b(group|faction|crowd|company|crew|team|attendants?|guards?|soldiers?|monks?|workers?|children|people|figures|men|women|villagers?|pilgrims?|servants?|students?|order|clan|cult)\b/
  if (groupish.test(haystack)) return 'group_character'
  if (haystack.includes('character')) {
    const lowerName = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
    const text = shotText.toLowerCase()
    const pluralish = groupish.test(lowerName)
      || /\b(they|them|their|rise|emerge|surround|approach|enter|stand|watch)\b/.test(text) && /\b[a-z]+s\b/.test(lowerName)
    return pluralish ? 'group_character' : 'character'
  }
  return 'prop_item'
}

function uniqueCleanKeyframePromptLines(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  values: unknown[],
) {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const value of values) {
    const text = helpers.readText(value).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const key = text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    lines.push(text)
  }
  return lines
}

function readShotPromptCueNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function shotPromptCueAxisLabel(axis: 'valence' | 'arousal' | 'confidence' | 'dominance', value: number | null) {
  if (value === null) return ''
  if (axis === 'valence') {
    if (value <= -0.35) return 'low valence'
    if (value >= 0.35) return 'high valence'
    return 'neutral valence'
  }
  if (axis === 'arousal') {
    if (value >= 0.67) return 'high arousal'
    if (value <= 0.33) return 'low arousal'
    return 'medium arousal'
  }
  if (axis === 'confidence') {
    if (value >= 0.67) return 'high confidence'
    if (value <= 0.33) return 'low confidence'
    return 'medium confidence'
  }
  if (value >= 0.67) return 'high dominance'
  if (value <= 0.33) return 'low dominance'
  return 'medium dominance'
}

function displayNameFromShotRefId(value: string) {
  const clean = value.replace(/^temporary[_-]/i, '').replace(/[_-]+/g, ' ').trim()
  if (!clean) return ''
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shotPromptCueName(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  explicitName: unknown
  refId: unknown
  referenceManifest: LooseRecord[]
}) {
  const explicit = input.helpers.readText(input.explicitName)
  if (explicit) return explicit
  const refId = input.helpers.readText(input.refId)
  if (!refId) return ''
  const normalizedRef = refId.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const match = input.referenceManifest.find((entry) => {
    const name = promptPlanReferenceDisplayName(input.helpers, entry, '')
    const label = input.helpers.readText(entry.label)
    return [name, label]
      .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
      .some((value) => value && (value === normalizedRef || value.includes(normalizedRef) || normalizedRef.includes(value)))
  })
  return match ? promptPlanReferenceDisplayName(input.helpers, match, displayNameFromShotRefId(refId)) : displayNameFromShotRefId(refId)
}

function buildSequenceAnimaticShotPromptCuePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  shot: LooseRecord
  referenceManifest: LooseRecord[]
}): ShotPromptCuePack {
  const dialogueDeliveryCues = input.helpers.readArray(input.shot.dialogue).map(input.helpers.asRecord).map((line) => {
    const speakerRefId = input.helpers.readText(line.speakerRefId ?? line.speaker_ref_id ?? line.characterRefId ?? line.character_ref_id)
    const speakerName = shotPromptCueName({
      helpers: input.helpers,
      explicitName: line.speakerName ?? line.speaker_name ?? line.speaker ?? line.characterName ?? line.character_name,
      refId: speakerRefId,
      referenceManifest: input.referenceManifest,
    }) || 'Speaker'
    const cue = {
      speakerName,
      speaker_name: speakerName,
      speakerRefId,
      speaker_ref_id: speakerRefId,
      text: input.helpers.readText(line.text ?? line.line),
      emotion: input.helpers.readText(line.emotion),
      delivery: input.helpers.readText(line.delivery),
      subtext: input.helpers.readText(line.subtext),
    }
    return cue.text || cue.emotion || cue.delivery || cue.subtext ? cue : null
  }).filter((cue): cue is NonNullable<typeof cue> => Boolean(cue))
  const performanceRecords = [
    ...input.helpers.readArray(input.shot.performanceBeats ?? input.shot.performance_beats),
    ...(typeof input.shot.performance === 'string' ? [] : input.helpers.readArray(input.shot.performance)),
  ].map(input.helpers.asRecord)
  const characterPerformanceCues = performanceRecords.map((beat) => {
    const characterRefId = input.helpers.readText(beat.characterRefId ?? beat.character_ref_id ?? beat.character ?? beat.characterName ?? beat.character_name ?? beat.name)
    const characterName = shotPromptCueName({
      helpers: input.helpers,
      explicitName: beat.characterName ?? beat.character_name ?? beat.name,
      refId: characterRefId,
      referenceManifest: input.referenceManifest,
    }) || 'Character'
    const valence = readShotPromptCueNumber(beat.valence)
    const arousal = readShotPromptCueNumber(beat.arousal)
    const confidence = readShotPromptCueNumber(beat.confidence)
    const dominance = readShotPromptCueNumber(beat.dominance)
    const cue = {
      characterName,
      character_name: characterName,
      characterRefId,
      character_ref_id: characterRefId,
      emotion: input.helpers.readText(beat.emotion),
      valence,
      arousal,
      confidence,
      dominance,
      valenceLabel: shotPromptCueAxisLabel('valence', valence),
      valence_label: shotPromptCueAxisLabel('valence', valence),
      arousalLabel: shotPromptCueAxisLabel('arousal', arousal),
      arousal_label: shotPromptCueAxisLabel('arousal', arousal),
      confidenceLabel: shotPromptCueAxisLabel('confidence', confidence),
      confidence_label: shotPromptCueAxisLabel('confidence', confidence),
      dominanceLabel: shotPromptCueAxisLabel('dominance', dominance),
      dominance_label: shotPromptCueAxisLabel('dominance', dominance),
      bodyLanguage: input.helpers.readText(beat.bodyLanguage ?? beat.body_language),
      body_language: input.helpers.readText(beat.bodyLanguage ?? beat.body_language),
      facialExpression: input.helpers.readText(beat.facialExpression ?? beat.facial_expression),
      facial_expression: input.helpers.readText(beat.facialExpression ?? beat.facial_expression),
      gaze: input.helpers.readText(beat.gaze),
      gesture: input.helpers.readText(beat.gesture),
      voiceEnergy: input.helpers.readText(beat.voiceEnergy ?? beat.voice_energy),
      voice_energy: input.helpers.readText(beat.voiceEnergy ?? beat.voice_energy),
    }
    const hasCue = [
      cue.emotion,
      cue.valenceLabel,
      cue.arousalLabel,
      cue.confidenceLabel,
      cue.dominanceLabel,
      cue.bodyLanguage,
      cue.facialExpression,
      cue.gaze,
      cue.gesture,
      cue.voiceEnergy,
    ].some(Boolean)
    return hasCue ? cue : null
  }).filter((cue): cue is NonNullable<typeof cue> => Boolean(cue))
  return shotPromptCuePackSchema.parse({
    dialogueDeliveryCues,
    dialogue_delivery_cues: dialogueDeliveryCues,
    characterPerformanceCues,
    character_performance_cues: characterPerformanceCues,
  })
}

function visualPerformanceCueLines(helpers: SequenceAnimaticWorkflowNodePackHelpers, cuePack: ShotPromptCuePack) {
  return cuePack.characterPerformanceCues.map((cue) => {
    const name = helpers.readText(cue.characterName ?? cue.character_name) || 'Character'
    const parts = uniqueCleanKeyframePromptLines(helpers, [
      cue.emotion ? `emotion ${cue.emotion}` : '',
      cue.valenceLabel ?? cue.valence_label,
      cue.arousalLabel ?? cue.arousal_label,
      cue.confidenceLabel ?? cue.confidence_label,
      cue.dominanceLabel ?? cue.dominance_label,
      cue.bodyLanguage ? `body ${cue.bodyLanguage}` : '',
      cue.facialExpression ? `face ${cue.facialExpression}` : '',
      cue.gaze ? `gaze ${cue.gaze}` : '',
      cue.gesture ? `gesture ${cue.gesture}` : '',
    ])
    return parts.length > 0 ? `${name}: ${parts.join('; ')}` : ''
  }).filter(Boolean)
}

function videoDialogueDeliveryCueLines(helpers: SequenceAnimaticWorkflowNodePackHelpers, cuePack: ShotPromptCuePack) {
  return cuePack.dialogueDeliveryCues.map((cue) => {
    const speaker = helpers.readText(cue.speakerName ?? cue.speaker_name) || 'Speaker'
    const line = helpers.readText(cue.text)
    const parts = uniqueCleanKeyframePromptLines(helpers, [
      cue.emotion ? `emotion ${cue.emotion}` : '',
      cue.delivery ? `delivery ${cue.delivery}` : '',
      cue.subtext ? `subtext ${cue.subtext}` : '',
      line ? `"${cleanSequenceAnimaticDialogueText(line)}"` : '',
    ])
    return parts.length > 0 ? `${speaker}: ${parts.join('; ')}` : ''
  }).filter(Boolean)
}

function videoPerformanceCueLines(helpers: SequenceAnimaticWorkflowNodePackHelpers, cuePack: ShotPromptCuePack) {
  return cuePack.characterPerformanceCues.map((cue) => {
    const name = helpers.readText(cue.characterName ?? cue.character_name) || 'Character'
    const parts = uniqueCleanKeyframePromptLines(helpers, [
      cue.emotion ? `emotion ${cue.emotion}` : '',
      cue.valenceLabel ?? cue.valence_label,
      cue.arousalLabel ?? cue.arousal_label,
      cue.confidenceLabel ?? cue.confidence_label,
      cue.dominanceLabel ?? cue.dominance_label,
      cue.bodyLanguage ? `body ${cue.bodyLanguage}` : '',
      cue.facialExpression ? `face ${cue.facialExpression}` : '',
      cue.gaze ? `gaze ${cue.gaze}` : '',
      cue.gesture ? `gesture ${cue.gesture}` : '',
      cue.voiceEnergy ? `voice ${cue.voiceEnergy}` : '',
    ])
    return parts.length > 0 ? `${name}: ${parts.join('; ')}` : ''
  }).filter(Boolean)
}

function conciseKeyframeReferenceUsage(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  kind: KeyframePromptReferenceKind | string
  usage: unknown
}) {
  const usage = input.helpers.readText(input.usage)
  if (input.kind === 'group_character') {
    return /prop|shape|material|condition/i.test(usage)
      ? 'Preserve group identity, wardrobe, silhouettes, scale, and count; adapt poses to this shot.'
      : usage || 'Preserve group identity, wardrobe, silhouettes, scale, and count; adapt poses to this shot.'
  }
  if (input.kind === 'character') {
    return usage || 'Preserve identity, face, wardrobe, silhouette, and scale; adapt pose and expression.'
  }
  if (input.kind === 'location') {
    return usage || 'Use for location geometry, materials, weather, lighting logic, and geography.'
  }
  if (input.kind === 'continuity_grid') {
    return usage || 'Use for continuity of staging, lighting progression, screen direction, and visual rhythm only.'
  }
  return usage || 'Preserve prop/item shape, scale, material, and visual continuity.'
}

function fallbackKeyframePromptPlan(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  shot: LooseRecord
  referenceManifest: LooseRecord[]
  referenceAssetKeys: string[]
  cuePack: ShotPromptCuePack
  action: string
  cameraBrief: string
  lighting: string
  sceneStateText: string
}) {
  const shotText = [
    input.action,
    input.helpers.readText(input.shot.title),
    input.helpers.readText(input.shot.description),
    input.helpers.readText(input.shot.performance),
    input.helpers.readArray(input.shot.dialogue).map(input.helpers.asRecord).map((line) => input.helpers.readText(line.text)).join(' '),
  ].join(' ')
  const bindings = input.referenceManifest.map((entry, index) => {
    const role = input.helpers.readText(entry.role)
    const name = input.helpers.readText(entry.label) || `Reference ${index + 1}`
    const kind = normalizedKeyframePromptReferenceKind(role, name, shotText)
    return {
      imageTag: input.helpers.readText(entry.imageTag) || `@Image${index + 1}`,
      assetKey: input.helpers.readText(entry.assetKey),
      name,
      kind,
      usage: conciseKeyframeReferenceUsage({ helpers: input.helpers, kind, usage: entry.guidance }),
      identityScope: kind === 'character'
        ? `Use only for ${name}. Do not transfer this identity to other figures.`
        : kind === 'group_character'
          ? `Use only for the ${name} group/people.`
          : kind === 'continuity_grid'
            ? 'Use as continuity context only, not as a new identity or location reference.'
            : kind === 'location'
              ? 'Use as location/environment reference only.'
              : 'Use as prop/item reference only.',
    }
  }).filter((entry) => entry.assetKey)
  const subjects = bindings
    .filter((binding) => binding.kind === 'character' || binding.kind === 'group_character')
    .map((binding) => ({
      name: binding.name,
      count: binding.kind === 'group_character' ? 3 : 1,
      sourceImageTag: binding.imageTag,
      sourceAssetKey: binding.assetKey,
      actionPose: binding.kind === 'group_character' ? 'Follow the shot action for this group.' : 'Follow the shot action for this character.',
      screenPlacement: 'Use the shot blocking and camera plan.',
      notes: binding.identityScope,
    }))
  const performanceDirection = visualPerformanceCueLines(input.helpers, input.cuePack)
  return keyframePromptPlanSchema.parse({
    referenceAssetKeys: input.referenceAssetKeys,
    reference_asset_keys: input.referenceAssetKeys,
    referenceBindings: bindings,
    reference_bindings: bindings,
    subjectRoster: subjects,
    subject_roster: subjects,
    stagingPlan: input.cameraBrief,
    staging_plan: input.cameraBrief,
    performanceDirection,
    performance_direction: performanceDirection,
    dialogueDeliveryPlan: [],
    dialogue_delivery_plan: [],
    continuityNotes: [],
    continuity_notes: [],
    negativeRules: [
      'Do not duplicate, merge, or swap named character identities.',
      'Do not use one character reference for a different named character.',
      'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text.',
    ].filter((rule) => bindings.some((binding) => binding.kind === 'continuity_grid') || !rule.includes('continuity grid')),
    negative_rules: [
      'Do not duplicate, merge, or swap named character identities.',
      'Do not use one character reference for a different named character.',
      'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text.',
    ].filter((rule) => bindings.some((binding) => binding.kind === 'continuity_grid') || !rule.includes('continuity grid')),
    diagnostics: ['Fallback prompt plan built deterministically from reference roles.'],
  })
}

function validateKeyframePromptPlan(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  plan: KeyframePromptPlan
  referenceAssetKeys: string[]
}) {
  const diagnostics = [...input.plan.diagnostics]
  const bindings = keyframePromptPlanBindings(input.plan as unknown as LooseRecord)
  const bindingAssetKeys = bindings.map((binding) => input.helpers.readText(binding.assetKey ?? binding.asset_key)).filter(Boolean)
  const expected = input.referenceAssetKeys
  const sameKeys = expected.length === bindingAssetKeys.length && expected.every((key, index) => bindingAssetKeys[index] === key)
  if (!sameKeys) diagnostics.push(`Rejected prompt-plan reference key mismatch. expected=${expected.join(', ')} actual=${bindingAssetKeys.join(', ')}`)
  const tagCounts = new Map<string, number>()
  for (const binding of bindings) {
    const tag = input.helpers.readText(binding.imageTag ?? binding.image_tag)
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  for (const [tag, count] of tagCounts.entries()) {
    if (count !== 1) diagnostics.push(`Rejected duplicate prompt-plan image binding: ${tag}`)
  }
  const locationOrGridAssets = new Set(bindings
    .filter((binding) => {
      const kind = input.helpers.readText(binding.kind)
      return kind === 'location' || kind === 'continuity_grid'
    })
    .map((binding) => input.helpers.readText(binding.assetKey ?? binding.asset_key))
    .filter(Boolean))
  for (const subject of keyframePromptPlanSubjects(input.plan as unknown as LooseRecord)) {
    const sourceAssetKey = input.helpers.readText(subject.sourceAssetKey ?? subject.source_asset_key)
    if (sourceAssetKey && locationOrGridAssets.has(sourceAssetKey)) {
      diagnostics.push(`Rejected prompt-plan subject using non-subject reference: ${input.helpers.readText(subject.name) || sourceAssetKey}`)
    }
  }
  return { valid: sameKeys && diagnostics.length === input.plan.diagnostics.length, diagnostics }
}

function renderKeyframePromptFromPlan(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  plan: LooseRecord
  action: string
  dialogue: string
  cameraBrief: string
  lighting: string
  locationRefs: string
  sceneStateText: string
}) {
  const bindings = keyframePromptPlanBindings(input.plan)
  const subjects = keyframePromptPlanSubjects(input.plan)
  const bindingLines = bindings.map((binding) => {
    const tag = input.helpers.readText(binding.imageTag ?? binding.image_tag)
    const name = input.helpers.readText(binding.name) || 'Reference'
    const kind = input.helpers.readText(binding.kind)
    const usage = conciseKeyframeReferenceUsage({ helpers: input.helpers, kind, usage: binding.usage })
    const scope = input.helpers.readText(binding.identityScope ?? binding.identity_scope)
    const roleText = kind === 'character'
      ? 'character identity only'
      : kind === 'group_character'
        ? 'group/people identity only'
        : kind === 'location'
          ? 'location/environment only'
          : kind === 'continuity_grid'
            ? 'previous-keyframe continuity only'
            : 'prop/item only'
    return `${tag} ${name}: ${roleText}. ${uniqueCleanKeyframePromptLines(input.helpers, [usage, scope]).join(' ')}`
  }).filter(Boolean)
  const subjectLines = subjects.map((subject) => {
    const name = input.helpers.readText(subject.name)
    const count = Number(subject.count) || 1
    const tag = input.helpers.readText(subject.sourceImageTag ?? subject.source_image_tag)
    const pose = input.helpers.readText(subject.actionPose ?? subject.action_pose)
    const placement = input.helpers.readText(subject.screenPlacement ?? subject.screen_placement)
    const exact = count === 1 ? `Exactly one ${name}` : `Exactly ${count} ${name}`
    return `${exact}${tag ? `, using ${tag} only` : ''}. ${uniqueCleanKeyframePromptLines(input.helpers, [pose, placement]).join(' ')}`
  }).filter(Boolean)
  const hasContinuityGrid = bindings.some((binding) => input.helpers.readText(binding.kind) === 'continuity_grid')
  const characterNames = subjects
    .filter((subject) => Number(subject.count) === 1)
    .map((subject) => input.helpers.readText(subject.name))
    .filter(Boolean)
  const negativeRules = uniqueCleanKeyframePromptLines(input.helpers, [
    ...input.helpers.readArray(input.plan.negativeRules ?? input.plan.negative_rules).map((entry) => input.helpers.readText(entry)).filter(Boolean),
    hasContinuityGrid ? 'Do not treat the continuity grid as a new identity or location source.' : '',
    characterNames.length > 1 ? `Do not duplicate, merge, or swap these identities: ${characterNames.join(', ')}.` : '',
    'Do not introduce unlisted major characters, props, locations, or stale visual references.',
    'Do not mention workflow, schema, IDs, or asset keys in the image.',
  ])
  const continuityNotes = uniqueCleanKeyframePromptLines(input.helpers, [
    input.lighting,
    input.locationRefs ? `Location reference: ${input.locationRefs}` : '',
    input.sceneStateText ? `Continuity facts: ${input.sceneStateText}` : '',
    ...input.helpers.readArray(input.plan.continuityNotes ?? input.plan.continuity_notes),
  ])
  const cameraPlan = uniqueCleanKeyframePromptLines(input.helpers, [
    input.cameraBrief,
    input.helpers.readText(input.plan.stagingPlan ?? input.plan.staging_plan),
  ]).filter((line) => line !== input.action).join(' ')
  const performanceLines = uniqueCleanKeyframePromptLines(input.helpers, [
    ...input.helpers.readArray(input.plan.performanceDirection ?? input.plan.performance_direction),
  ])
  return [
    'Generate one finished cinematic keyframe for this exact animatic shot. Single final frame only.',
    '',
    'Reference bindings:',
    bindingLines.join('\n') || 'No attached image references; use only the written visual facts.',
    '',
    'Visible subject roster:',
    subjectLines.join('\n') || 'Only subjects explicitly visible in the shot action.',
    '',
    'Action / Blocking:',
    input.action || input.helpers.readText(input.plan.stagingPlan ?? input.plan.staging_plan) || 'Hold the exact readable action from the shot.',
    '',
    input.dialogue ? `Dialogue:\n${input.dialogue}` : '',
    performanceLines.length > 0 ? `Performance / Acting:\n${performanceLines.join('\n')}` : '',
    '',
    'Camera / Staging:',
    cameraPlan || 'Use the shot camera plan; preserve readable staging and screen direction.',
    '',
    'Lighting / Environment:',
    continuityNotes.join('\n') || 'Preserve environment, weather, material, and lighting continuity.',
    '',
    'Negative:',
    negativeRules.join(' '),
  ].filter(Boolean).join('\n')
}

const videoPromptReferenceKindSchema = z.enum(['keyframe', 'location', 'character', 'group_character', 'prop_item', 'continuity_grid'])

const videoPromptDialogueBeatSchema = z.object({
  speaker: z.string().default(''),
  line: z.string().default(''),
  delivery: z.string().default(''),
  timing: z.string().default(''),
})

const videoPromptDirectorShotSchema = z.object({
  durationSeconds: z.number().nullable().default(null),
  duration_seconds: z.number().nullable().default(null),
  camera: z.string().default(''),
  actionBeats: z.array(z.string()).default([]),
  action_beats: z.array(z.string()).default([]),
  dialogueBeats: z.array(videoPromptDialogueBeatSchema).default([]),
  dialogue_beats: z.array(videoPromptDialogueBeatSchema).default([]),
  subjectPerformance: z.array(z.string()).default([]),
  subject_performance: z.array(z.string()).default([]),
  environmentContinuity: z.string().default(''),
  environment_continuity: z.string().default(''),
  endState: z.string().default(''),
  end_state: z.string().default(''),
  constraints: z.array(z.string()).default([]),
})
const emptyVideoPromptDirectorShot = {
  durationSeconds: null,
  duration_seconds: null,
  camera: '',
  actionBeats: [],
  action_beats: [],
  dialogueBeats: [],
  dialogue_beats: [],
  subjectPerformance: [],
  subject_performance: [],
  environmentContinuity: '',
  environment_continuity: '',
  endState: '',
  end_state: '',
  constraints: [],
}

const videoPromptPlanSchema = z.object({
  version: z.literal('sequence_animatic_shot_video_prompt_plan_v1').default('sequence_animatic_shot_video_prompt_plan_v1'),
  referenceAssetKeys: z.array(z.string()).default([]),
  reference_asset_keys: z.array(z.string()).default([]),
  referenceBindings: z.array(z.object({
    imageTag: z.string().default(''),
    image_tag: z.string().default(''),
    assetKey: z.string().default(''),
    asset_key: z.string().default(''),
    name: z.string().default(''),
    kind: videoPromptReferenceKindSchema.default('prop_item'),
    usage: z.string().default(''),
  })).default([]),
  reference_bindings: z.array(z.object({
    imageTag: z.string().default(''),
    image_tag: z.string().default(''),
    assetKey: z.string().default(''),
    asset_key: z.string().default(''),
    name: z.string().default(''),
    kind: videoPromptReferenceKindSchema.default('prop_item'),
    usage: z.string().default(''),
  })).default([]),
  subjectActionBeats: z.array(z.object({
    subject: z.string().default(''),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    motion: z.string().default(''),
    performance: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
  })).default([]),
  subject_action_beats: z.array(z.object({
    subject: z.string().default(''),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    motion: z.string().default(''),
    performance: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
  })).default([]),
  subjectRoster: z.array(z.object({
    subject: z.string().default(''),
    count: z.number().default(1),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
    action: z.string().default(''),
    shotAction: z.string().default(''),
    shot_action: z.string().default(''),
    roleInShot: z.string().default(''),
    role_in_shot: z.string().default(''),
  })).default([]),
  subject_roster: z.array(z.object({
    subject: z.string().default(''),
    count: z.number().default(1),
    sourceImageTag: z.string().default(''),
    source_image_tag: z.string().default(''),
    screenPlacement: z.string().default(''),
    screen_placement: z.string().default(''),
    action: z.string().default(''),
    shotAction: z.string().default(''),
    shot_action: z.string().default(''),
    roleInShot: z.string().default(''),
    role_in_shot: z.string().default(''),
  })).default([]),
  timeBeats: z.array(z.object({
    timeRange: z.string().default(''),
    time_range: z.string().default(''),
    action: z.string().default(''),
    camera: z.string().default(''),
    motion: z.string().default(''),
  })).default([]),
  time_beats: z.array(z.object({
    timeRange: z.string().default(''),
    time_range: z.string().default(''),
    action: z.string().default(''),
    camera: z.string().default(''),
    motion: z.string().default(''),
  })).default([]),
  cameraDirection: z.string().default(''),
  camera_direction: z.string().default(''),
  motionDirection: z.string().default(''),
  motion_direction: z.string().default(''),
  cameraMotion: z.string().default(''),
  camera_motion: z.string().default(''),
  focusPlan: z.string().default(''),
  focus_plan: z.string().default(''),
  visibilityRules: z.string().default(''),
  visibility_rules: z.string().default(''),
  performanceDirection: z.array(z.string()).default([]),
  performance_direction: z.array(z.string()).default([]),
  dialogueDeliveryPlan: z.array(z.string()).default([]),
  dialogue_delivery_plan: z.array(z.string()).default([]),
  directorShot: videoPromptDirectorShotSchema.default(emptyVideoPromptDirectorShot),
  director_shot: videoPromptDirectorShotSchema.default(emptyVideoPromptDirectorShot),
  audioPolicy: z.string().default(''),
  audio_policy: z.string().default(''),
  continuityNotes: z.array(z.string()).default([]),
  continuity_notes: z.array(z.string()).default([]),
  negativeRules: z.array(z.string()).default([]),
  negative_rules: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

type VideoPromptPlan = z.infer<typeof videoPromptPlanSchema>
type VideoPromptReferenceKind = z.infer<typeof videoPromptReferenceKindSchema>

function videoPromptPlanBindings(plan: LooseRecord) {
  return (Array.isArray(plan.referenceBindings) ? plan.referenceBindings : Array.isArray(plan.reference_bindings) ? plan.reference_bindings : [])
    .map((entry) => entry && typeof entry === 'object' ? entry as LooseRecord : {})
}

function videoPromptSubjectRoster(plan: LooseRecord) {
  return (Array.isArray(plan.subjectRoster) ? plan.subjectRoster : Array.isArray(plan.subject_roster) ? plan.subject_roster : [])
    .map((entry) => entry && typeof entry === 'object' ? entry as LooseRecord : {})
}

function videoPromptPerformanceDirection(plan: LooseRecord) {
  return (Array.isArray(plan.performanceDirection) ? plan.performanceDirection : Array.isArray(plan.performance_direction) ? plan.performance_direction : [])
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean)
}

function videoPromptDialogueDeliveryPlan(plan: LooseRecord) {
  return (Array.isArray(plan.dialogueDeliveryPlan) ? plan.dialogueDeliveryPlan : Array.isArray(plan.dialogue_delivery_plan) ? plan.dialogue_delivery_plan : [])
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean)
}

function videoPromptDirectorShot(plan: LooseRecord) {
  return helpersRecord(plan.directorShot ?? plan.director_shot)
}

function helpersRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function isGenericVideoReferenceName(value: string) {
  return /^(world|temp|zone|shot|current|previous)\s+(character|group|item|prop|location|keyframe|reference)(\s+reference)?\s+\d+$/i.test(value.trim())
    || /^(world character reference|temp character reference|zone reference|shot keyframe reference)\s+\d+$/i.test(value.trim())
}

function promptPlanReferenceDisplayName(helpers: SequenceAnimaticWorkflowNodePackHelpers, entry: LooseRecord, fallback: string) {
  const candidates = [
    helpers.readText(entry.displayName ?? entry.display_name),
    helpers.readText(entry.name),
    helpers.readText(entry.label),
    fallback,
  ].filter(Boolean)
  const concrete = candidates.find((candidate) => !isGenericVideoReferenceName(candidate))
  return concrete || candidates[0] || fallback
}

function normalizedVideoPromptReferenceKind(role: string, name: string, shotText = '', sourceKind = ''): VideoPromptReferenceKind {
  const haystack = `${sourceKind} ${role} ${name}`.toLowerCase()
  const source = `${sourceKind} ${role}`.toLowerCase()
  if (source.includes('shot_keyframe') || source.includes('keyframe')) return 'keyframe'
  if (source.includes('previous_keyframes_continuity_grid')) return 'continuity_grid'
  if (
    source.includes('zone')
    || source.includes('location')
    || source.includes('set_reference')
    || source.includes('viewpoint')
  ) return 'location'
  const groupish = /\b(group|faction|crowd|company|crew|team|attendants?|guards?|soldiers?|monks?|workers?|children|people|figures|men|women|villagers?|pilgrims?|servants?|students?|order|clan|cult)\b/
  if (groupish.test(haystack) && /\b(character|people|group|faction|attendants?)\b/.test(source)) return 'group_character'
  if (/\b(world_character|temp_character|temporary_character|character|person|npc|actor|speaker)\b/.test(source)) {
    const lowerName = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
    const text = shotText.toLowerCase()
    return groupish.test(lowerName) || (/\b(they|them|their|rise|emerge|surround|approach|enter|stand|watch)\b/.test(text) && /\b[a-z]+s\b/.test(lowerName))
      ? 'group_character'
      : 'character'
  }
  if (/\b(item|prop|object|artifact|disc|weapon|tool)\b/.test(source)) return 'prop_item'
  if (groupish.test(haystack)) return 'group_character'
  if (haystack.includes('character')) {
    const lowerName = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
    const text = shotText.toLowerCase()
    return groupish.test(lowerName) || (/\b(they|them|their|rise|emerge|surround|approach|enter|stand|watch)\b/.test(text) && /\b[a-z]+s\b/.test(lowerName))
      ? 'group_character'
      : 'character'
  }
  return 'prop_item'
}

function normalizedVideoPromptReferenceKindForEntry(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  entry: LooseRecord
  fallbackKind?: string
  shotText?: string
}) {
  const sourceKind = input.helpers.readText(input.entry.kind ?? input.entry.type)
  const role = input.helpers.readText(input.entry.role)
  const name = promptPlanReferenceDisplayName(input.helpers, input.entry, 'Reference')
  const inferred = normalizedVideoPromptReferenceKind(role, name, input.shotText ?? '', sourceKind)
  const fallback = input.helpers.readText(input.fallbackKind) as VideoPromptReferenceKind
  return inferred || (videoPromptReferenceKindSchema.safeParse(fallback).success ? fallback : 'prop_item')
}

function videoReferenceUsage(kind: VideoPromptReferenceKind, name: string) {
  if (kind === 'keyframe') return 'use as the current shot composition, pose, lighting, and motion start-state'
  if (kind === 'location') return 'use for environment geometry, weather, lighting logic, and spatial continuity'
  if (kind === 'character') return `use only for ${name} identity, wardrobe, silhouette, and scale`
  if (kind === 'group_character') return `use only for the ${name} group/people identity, count, wardrobe, and silhouettes`
  if (kind === 'continuity_grid') return 'use only for scene continuity, visual rhythm, screen direction, and progression'
  return 'use only for prop/item shape, material, scale, and continuity'
}

function fallbackVideoPromptPlan(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  shot: LooseRecord
  referenceManifest: LooseRecord[]
  referenceAssetKeys: string[]
  cuePack: ShotPromptCuePack
  cameraPlan: string
}) {
  const shotText = [
    input.helpers.readText(input.shot.title),
    input.helpers.readText(input.shot.action),
    input.helpers.readText(input.shot.description),
    input.helpers.readText(input.shot.performance),
    input.helpers.readArray(input.shot.dialogue).map(input.helpers.asRecord).map((line) => input.helpers.readText(line.text)).join(' '),
  ].join(' ')
  const bindings = input.referenceManifest.map((entry, index) => {
    const role = input.helpers.readText(entry.role)
    const name = promptPlanReferenceDisplayName(input.helpers, entry, `Reference ${index + 1}`)
    const kind = normalizedVideoPromptReferenceKind(role, name, shotText, input.helpers.readText(entry.kind ?? entry.type))
    return {
      imageTag: input.helpers.readText(entry.imageTag) || `@Image${index + 1}`,
      image_tag: input.helpers.readText(entry.imageTag) || `@Image${index + 1}`,
      assetKey: input.helpers.readText(entry.assetKey),
      asset_key: input.helpers.readText(entry.assetKey),
      name,
      kind,
      usage: videoReferenceUsage(kind, name),
    }
  }).filter((entry) => entry.assetKey)
  const action = input.helpers.readText(input.shot.action) || input.helpers.readText(input.shot.description)
  const beats = bindings
    .filter((binding) => binding.kind === 'character' || binding.kind === 'group_character')
    .map((binding) => ({
      subject: binding.name,
      sourceImageTag: binding.imageTag,
      source_image_tag: binding.imageTag,
      motion: subjectSpecificShotAction(binding.name, action),
      performance: '',
      screenPlacement: '',
      screen_placement: '',
    }))
  const subjectRoster = beats.map((beat) => ({
    subject: beat.subject,
    count: 1,
    sourceImageTag: beat.sourceImageTag,
    source_image_tag: beat.sourceImageTag,
    screenPlacement: beat.screenPlacement,
    screen_placement: beat.screenPlacement,
    action: beat.motion,
    shotAction: beat.motion,
    shot_action: beat.motion,
    roleInShot: beat.motion,
    role_in_shot: beat.motion,
  }))
  const performanceDirection = videoPerformanceCueLines(input.helpers, input.cuePack)
  const dialogueDeliveryPlan = videoDialogueDeliveryCueLines(input.helpers, input.cuePack)
  const endState = compactShotVideoEndState(action)
  const plan = {
    referenceAssetKeys: input.referenceAssetKeys,
    reference_asset_keys: input.referenceAssetKeys,
    referenceBindings: bindings,
    reference_bindings: bindings,
    subjectActionBeats: beats,
    subject_action_beats: beats,
    subjectRoster,
    subject_roster: subjectRoster,
    timeBeats: [],
    time_beats: [],
    directorShot: {
      durationSeconds: null,
      duration_seconds: null,
      camera: input.cameraPlan,
      actionBeats: [action].filter(Boolean),
      action_beats: [action].filter(Boolean),
      dialogueBeats: input.cuePack.dialogueDeliveryCues.map((cue) => ({
        speaker: input.helpers.readText(cue.speakerName ?? cue.speaker_name) || 'Speaker',
        line: input.helpers.readText(cue.text),
        delivery: [input.helpers.readText(cue.emotion), input.helpers.readText(cue.delivery), input.helpers.readText(cue.subtext)].filter(Boolean).join('; '),
        timing: '',
      })),
      dialogue_beats: input.cuePack.dialogueDeliveryCues.map((cue) => ({
        speaker: input.helpers.readText(cue.speakerName ?? cue.speaker_name) || 'Speaker',
        line: input.helpers.readText(cue.text),
        delivery: [input.helpers.readText(cue.emotion), input.helpers.readText(cue.delivery), input.helpers.readText(cue.subtext)].filter(Boolean).join('; '),
        timing: '',
      })),
      subjectPerformance: performanceDirection,
      subject_performance: performanceDirection,
      environmentContinuity: '',
      environment_continuity: '',
      endState,
      end_state: endState,
      constraints: [
        'Do not render captions, subtitles, UI, logos, watermarks, labels, arrows, panel borders, or production-board marks.',
      ],
    },
    director_shot: {
      durationSeconds: null,
      duration_seconds: null,
      camera: input.cameraPlan,
      actionBeats: [action].filter(Boolean),
      action_beats: [action].filter(Boolean),
      dialogueBeats: input.cuePack.dialogueDeliveryCues.map((cue) => ({
        speaker: input.helpers.readText(cue.speakerName ?? cue.speaker_name) || 'Speaker',
        line: input.helpers.readText(cue.text),
        delivery: [input.helpers.readText(cue.emotion), input.helpers.readText(cue.delivery), input.helpers.readText(cue.subtext)].filter(Boolean).join('; '),
        timing: '',
      })),
      dialogue_beats: input.cuePack.dialogueDeliveryCues.map((cue) => ({
        speaker: input.helpers.readText(cue.speakerName ?? cue.speaker_name) || 'Speaker',
        line: input.helpers.readText(cue.text),
        delivery: [input.helpers.readText(cue.emotion), input.helpers.readText(cue.delivery), input.helpers.readText(cue.subtext)].filter(Boolean).join('; '),
        timing: '',
      })),
      subjectPerformance: performanceDirection,
      subject_performance: performanceDirection,
      environmentContinuity: '',
      environment_continuity: '',
      endState,
      end_state: endState,
      constraints: [
        'Do not render captions, subtitles, UI, logos, watermarks, labels, arrows, panel borders, or production-board marks.',
      ],
    },
    cameraDirection: input.cameraPlan,
    camera_direction: input.cameraPlan,
    motionDirection: 'Animate the shot action clearly without adding new story beats.',
    motion_direction: 'Animate the shot action clearly without adding new story beats.',
    cameraMotion: input.cameraPlan,
    camera_motion: input.cameraPlan,
    focusPlan: 'Keep focus on the shot action and named visible subjects.',
    focus_plan: 'Keep focus on the shot action and named visible subjects.',
    visibilityRules: 'Do not introduce unlisted major characters, props, or locations.',
    visibility_rules: 'Do not introduce unlisted major characters, props, or locations.',
    performanceDirection,
    performance_direction: performanceDirection,
    dialogueDeliveryPlan,
    dialogue_delivery_plan: dialogueDeliveryPlan,
    audioPolicy: 'Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen action. No music, score, audio bed, room tone, crowd wash, or general ambience.',
    audio_policy: 'Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen action. No music, score, audio bed, room tone, crowd wash, or general ambience.',
    continuityNotes: [],
    continuity_notes: [],
    negativeRules: [
      'Do not render captions, subtitles, UI, logos, watermarks, labels, arrows, panel borders, or production-board marks.',
      'Do not duplicate, merge, or swap named character identities.',
    ],
    negative_rules: [
      'Do not render captions, subtitles, UI, logos, watermarks, labels, arrows, panel borders, or production-board marks.',
      'Do not duplicate, merge, or swap named character identities.',
    ],
    diagnostics: ['Fallback video prompt plan built deterministically from reference roles.'],
  }
  return videoPromptPlanSchema.parse(plan)
}

function validateVideoPromptPlan(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  plan: VideoPromptPlan
  referenceAssetKeys: string[]
  referenceManifest: LooseRecord[]
}) {
  const diagnostics = [...input.plan.diagnostics]
  const bindings = videoPromptPlanBindings(input.plan as unknown as LooseRecord)
  const bindingAssetKeys = bindings
    .map((binding) => input.helpers.readText(binding.assetKey ?? binding.asset_key))
    .filter(Boolean)
  const expected = input.referenceAssetKeys
  const sameKeys = expected.length === bindingAssetKeys.length && expected.every((key, index) => bindingAssetKeys[index] === key)
  if (!sameKeys) diagnostics.push(`Rejected video prompt-plan reference key mismatch. expected=${expected.join(', ')} actual=${bindingAssetKeys.join(', ')}`)
  const tagCounts = new Map<string, number>()
  for (const binding of videoPromptPlanBindings(input.plan as unknown as LooseRecord)) {
    const tag = input.helpers.readText(binding.imageTag ?? binding.image_tag)
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  for (const [tag, count] of tagCounts.entries()) {
    if (count !== 1) diagnostics.push(`Rejected duplicate video prompt-plan image binding: ${tag}`)
  }
  bindings.forEach((binding, index) => {
    const expectedName = promptPlanReferenceDisplayName(input.helpers, input.referenceManifest[index] ?? {}, `Reference ${index + 1}`)
    const actualName = input.helpers.readText(binding.name)
    const kind = input.helpers.readText(binding.kind)
    if (expectedName && actualName && isGenericVideoReferenceName(actualName) && !isGenericVideoReferenceName(expectedName)) {
      diagnostics.push(`Rejected generic video prompt-plan reference name for ${input.helpers.readText(binding.imageTag ?? binding.image_tag) || `@Image${index + 1}`}: ${actualName}`)
    }
    if ((kind === 'character' || kind === 'group_character') && expectedName && !actualName) {
      diagnostics.push(`Rejected unnamed video prompt-plan subject reference for ${input.helpers.readText(binding.imageTag ?? binding.image_tag) || `@Image${index + 1}`}.`)
    }
  })
  for (const subject of videoPromptSubjectRoster(input.plan as unknown as LooseRecord)) {
    const subjectName = input.helpers.readText(subject.subject)
    const fragments = [
      input.helpers.readText(subject.screenPlacement ?? subject.screen_placement),
      input.helpers.readText(subject.action),
      input.helpers.readText(subject.shotAction ?? subject.shot_action),
      input.helpers.readText(subject.roleInShot ?? subject.role_in_shot),
    ].filter(Boolean)
    if (fragments.some(isGenericShotVideoSubjectFragment)) {
      diagnostics.push(`Rejected generic video prompt-plan subject action for ${subjectName || 'unnamed subject'}.`)
    }
  }
  return { valid: sameKeys && diagnostics.length === input.plan.diagnostics.length, diagnostics }
}

function normalizeVideoPromptPlanForReferences(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  plan: VideoPromptPlan
  referenceManifest: LooseRecord[]
  shot: LooseRecord
}) {
  const shotText = [
    input.helpers.readText(input.shot.title),
    input.helpers.readText(input.shot.action),
    input.helpers.readText(input.shot.description),
    input.helpers.readArray(input.shot.dialogue).map(input.helpers.asRecord).map((line) => input.helpers.readText(line.text)).join(' '),
  ].join(' ')
  const currentBindings = videoPromptPlanBindings(input.plan as unknown as LooseRecord)
  const bindings = input.referenceManifest.map((entry, index) => {
    const current = currentBindings[index] ?? {}
    const name = promptPlanReferenceDisplayName(input.helpers, entry, input.helpers.readText(current.name) || `Reference ${index + 1}`)
    const kind = normalizedVideoPromptReferenceKindForEntry({
      helpers: input.helpers,
      entry,
      fallbackKind: input.helpers.readText(current.kind),
      shotText,
    })
    const imageTag = input.helpers.readText(entry.imageTag) || input.helpers.readText(current.imageTag ?? current.image_tag) || `@Image${index + 1}`
    const assetKey = input.helpers.readText(entry.assetKey) || input.helpers.readText(current.assetKey ?? current.asset_key)
    return {
      ...current,
      imageTag,
      image_tag: imageTag,
      assetKey,
      asset_key: assetKey,
      name,
      kind,
      usage: videoReferenceUsage(kind, name),
    }
  }).filter((entry) => input.helpers.readText(entry.assetKey))
  return videoPromptPlanSchema.parse({
    ...input.plan,
    referenceBindings: bindings,
    reference_bindings: bindings,
  })
}

export async function sequenceAnimaticShotVideoPromptPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack).map((entry) => entry as unknown as LooseRecord)
  const omittedIngredients = helpers.readArray(config.omittedIngredients ?? config.omitted_ingredients).map(helpers.asRecord)
  const referenceAssetKeys = helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys)
    .length > 0
    ? helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys)
    : helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys']).map((entry) => helpers.readText(entry)).filter(Boolean)
  const camera = helpers.asRecord(shot.camera)
  const cameraPlan = [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement), helpers.readText(camera.screenDirection ?? camera.screen_direction)]
    .filter(Boolean)
    .join('; ') || helpers.readText(shot.camera)
  const cuePack = buildSequenceAnimaticShotPromptCuePack({ helpers, shot, referenceManifest })
  const fallback = fallbackVideoPromptPlan({ helpers, shot, referenceManifest, referenceAssetKeys, cuePack, cameraPlan })
  const prompt = [
    'Plan a Seedance 2 per-shot video prompt from structured shot data.',
    'Return strict JSON only. Do not add, remove, rename, or reorder image references.',
    'Bind every attached image exactly once and describe how it should be used for motion.',
    'Use the provided displayName as the subject/reference name. Never replace it with generic labels such as World Character Reference 2 or Zone Reference 4.',
    'Keep the current shot keyframe, if present, as composition and motion start-state only.',
    'Location references are environment only. Continuity grids are continuity only. They are not subjects.',
    'Characters/groups/items must be bound one-to-one to their own reference images; do not swap identities.',
    'Use performanceCues to write compact performanceDirection and dialogueDeliveryPlan arrays. Preserve delivery, subtext, valence, arousal, confidence, dominance, gaze, face, gesture, body language, and voice energy when present.',
    'Also write directorShot as one compact call sheet: durationSeconds if known, camera, actionBeats, dialogueBeats with delivery immediately attached to each spoken line, subjectPerformance, environmentContinuity, endState, and constraints.',
    'For every visible subject, write subjectRoster.roleInShot or subjectRoster.shotAction as a concrete shot-specific physical role. Never use filler such as "Follow shot blocking" or "Follow the shot action".',
    'For groups, make count natural and concrete when the shot specifies it. If one member of a group acts, describe it as one member/attendant/guard from the named group, not as the whole plural group.',
    'Write environmentContinuity as one clean sentence using only location, lighting, weather, screen direction, and relevant prop placement. Do not repeat reference-role boilerplate.',
    'Write endState only when there is a useful final frame or final action for this shot. Do not use a generic settled-pose fallback.',
    'Constraints should be short and deduplicated. Include production-board/no-text/no-watermark restrictions only once.',
    'Do not create overlapping timing ranges. Prefer one duration plus relative cue wording over multiple timestamp formats.',
    'Offscreen speakers may appear in dialogueDeliveryPlan as voice-only cues, but must not become visible subjects unless the shot/reference roster says they are visible.',
    'Native audio must be narrow: scripted dialogue and direct diegetic SFX only.',
    '',
    JSON.stringify({
      version: 'sequence_animatic_shot_video_prompt_plan_input_v1',
      shot: {
        id: helpers.readText(shot.id ?? config.shotId),
        title: helpers.readText(shot.title),
        action: helpers.readText(shot.action) || helpers.readText(shot.description),
        dialogue: helpers.readArray(shot.dialogue).map(helpers.asRecord).slice(0, 8),
        performance: helpers.readText(shot.performance) || helpers.readArray(shot.performanceBeats ?? shot.performance_beats).map(helpers.asRecord).slice(0, 8),
        camera: shot.camera ?? {},
        lighting: helpers.readText(shot.lighting),
      },
      performanceCues: cuePack,
      references: referenceManifest.map((entry, index) => ({
        imageTag: helpers.readText(entry.imageTag) || `@Image${index + 1}`,
        assetKey: helpers.readText(entry.assetKey),
        displayName: promptPlanReferenceDisplayName(helpers, entry, `Reference ${index + 1}`),
        name: promptPlanReferenceDisplayName(helpers, entry, `Reference ${index + 1}`),
        role: helpers.readText(entry.role),
        kind: helpers.readText(entry.kind ?? entry.type),
        guidance: helpers.readText(entry.guidance),
        visualDescription: helpers.readText(entry.visualDescription),
        usage: helpers.readText(entry.usage),
      })),
      omittedReferences: omittedIngredients.map((entry) => ({
        name: helpers.readText(entry.displayName ?? entry.display_name ?? entry.name),
        kind: helpers.readText(entry.kind),
        status: helpers.readText(entry.status),
        assetKey: helpers.readText(entry.assetKey ?? entry.asset_key),
      })),
      requiredReferenceAssetKeys: referenceAssetKeys,
    }, null, 2),
  ].join('\n')
  const structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_shot_video_prompt_plan',
    schema: videoPromptPlanSchema,
    instructions: 'Return strict JSON only. Use only provided image tags and asset keys. Do not invent references or broad world context.',
    prompt,
    fallback,
    maxOutputTokens: 3600,
  })
  const parsed = videoPromptPlanSchema.parse(structured.value)
  const validation = validateVideoPromptPlan({ helpers, plan: parsed, referenceAssetKeys, referenceManifest })
  const selectedPromptPlan = validation.valid ? parsed : {
    ...fallback,
    diagnostics: [...fallback.diagnostics, ...validation.diagnostics],
  }
  const promptPlan = normalizeVideoPromptPlanForReferences({
    helpers,
    plan: selectedPromptPlan,
    referenceManifest,
    shot,
  })
  const outputs = {
    promptPlan,
    prompt_plan: promptPlan,
    promptPlanDiagnostics: validation.valid ? parsed.diagnostics : validation.diagnostics,
    prompt_plan_diagnostics: validation.valid ? parsed.diagnostics : validation.diagnostics,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    performanceCues: cuePack,
    performance_cues: cuePack,
    shot,
    assetPack,
    asset_pack: assetPack,
    text: JSON.stringify(promptPlan, null, 2),
    prompt,
    fallbackUsed: structured.fallbackUsed || !validation.valid,
    fallbackReason: !validation.valid ? 'Video prompt-plan validation failed; deterministic fallback plan used.' : structured.fallbackReason,
    deterministic: structured.fallbackUsed || !validation.valid,
  }
  return result({ context, helpers, outputs, provider: structured.provider, model: structured.model })
}

export async function sequenceAnimaticKeyframePromptPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const sceneState = helpers.asRecord(config.sceneState ?? config.scene_state)
  const sceneStateText = helpers.compactStoryboardSentence(formatSequenceAnimaticSceneStateForPrompt(sceneState as never), '', 42)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack).map((entry) => entry as unknown as LooseRecord)
  const scopedReferenceAssetKeys = helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys)
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map((entry) => helpers.readText(entry))
    .filter(Boolean)
  const manifestReferenceAssetKeys = referenceManifest
    .map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key))
    .filter(Boolean)
  const referenceAssetKeys = [...new Set((
    scopedReferenceAssetKeys.length > 0
      ? scopedReferenceAssetKeys
      : upstreamReferenceAssetKeys.length > 0
        ? upstreamReferenceAssetKeys
        : manifestReferenceAssetKeys
  ).map((entry) => helpers.readText(entry)).filter(Boolean))]
  const camera = helpers.asRecord(shot.camera)
  const action = cleanSequenceAnimaticKeyframePromptText(helpers, helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt), 42)
  const cameraBrief = cleanSequenceAnimaticKeyframePromptText(helpers, [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement), helpers.readText(camera.screenDirection ?? camera.screen_direction)].filter(Boolean).join('; ') || helpers.readText(shot.camera), 34)
  const lighting = cleanSequenceAnimaticKeyframePromptText(helpers, helpers.readText(shot.lighting), 30)
  const cuePack = buildSequenceAnimaticShotPromptCuePack({ helpers, shot, referenceManifest })
  const fallback = fallbackKeyframePromptPlan({ helpers, shot, referenceManifest, referenceAssetKeys, cuePack, action, cameraBrief, lighting, sceneStateText })
  const prompt = [
    'Plan a cinematic image-generation prompt from structured shot data.',
    'Return strict JSON only. Do not add, remove, rename, or reorder image references. Bind every image exactly once.',
    'Classify references semantically as location, character, group_character, prop_item, or continuity_grid.',
    'Use group_character for factions, crowds, attendants, guards, crews, groups, or any reference used as people in the action.',
    'Location and previous-keyframe continuity-grid references must never become visible subjects.',
    'Create a one-to-one subject roster so named characters cannot be duplicated, merged, or swapped.',
    'Use performanceCues to write performanceDirection for visible acting: emotion, valence, arousal, confidence, dominance, face, gaze, body language, and gesture.',
    'For keyframes, ignore voice-only/audio-only cues except where they change visible facial expression or body tension.',
    '',
    JSON.stringify({
      version: 'sequence_animatic_keyframe_prompt_plan_input_v1',
      shot: {
        id: helpers.readText(shot.id ?? config.shotId),
        title: helpers.readText(shot.title),
        action: helpers.readText(shot.action) || helpers.readText(shot.description),
        dialogue: helpers.readArray(shot.dialogue).map(helpers.asRecord).slice(0, 8),
        performance: helpers.readText(shot.performance) || helpers.readArray(shot.performanceBeats ?? shot.performance_beats).map(helpers.asRecord).slice(0, 8),
        camera: shot.camera ?? {},
        lighting: helpers.readText(shot.lighting),
      },
      sceneState,
      performanceCues: cuePack,
      references: referenceManifest.map((entry, index) => ({
        imageTag: helpers.readText(entry.imageTag) || `@Image${index + 1}`,
        assetKey: helpers.readText(entry.assetKey),
        name: helpers.readText(entry.label),
        role: helpers.readText(entry.role),
        guidance: helpers.readText(entry.guidance),
        visualDescription: helpers.readText(entry.visualDescription),
        line: helpers.readText(entry.line),
      })),
      requiredReferenceAssetKeys: referenceAssetKeys,
    }, null, 2),
  ].join('\n')
  const structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_keyframe_prompt_plan',
    schema: keyframePromptPlanSchema,
    instructions: 'Return strict JSON only. Do not add, remove, rename, or reorder image references. Use only provided reference asset keys and image tags.',
    prompt,
    fallback,
    maxOutputTokens: 3000,
  })
  const parsed = keyframePromptPlanSchema.parse(structured.value)
  const validation = validateKeyframePromptPlan({ helpers, plan: parsed, referenceAssetKeys })
  const promptPlan = validation.valid ? parsed : {
    ...fallback,
    diagnostics: [...fallback.diagnostics, ...validation.diagnostics],
  }
  const outputs = {
    promptPlan,
    prompt_plan: promptPlan,
    promptPlanDiagnostics: validation.valid ? parsed.diagnostics : validation.diagnostics,
    prompt_plan_diagnostics: validation.valid ? parsed.diagnostics : validation.diagnostics,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    performanceCues: cuePack,
    performance_cues: cuePack,
    shot,
    assetPack,
    asset_pack: assetPack,
    text: JSON.stringify(promptPlan, null, 2),
    prompt,
    fallbackUsed: structured.fallbackUsed || !validation.valid,
    fallbackReason: !validation.valid ? 'Prompt-plan validation failed; deterministic fallback plan used.' : structured.fallbackReason,
    deterministic: structured.fallbackUsed || !validation.valid,
  }
  return result({ context, helpers, outputs, provider: structured.provider, model: structured.model })
}

export async function sequenceAnimaticPlannedKeyframePrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotGraphPolicyVersion = helpers.readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version)
  const uiIngredientOverrideMode = shotGraphPolicyVersion === 'primary_chain_v13_ui_ingredient_override'
    || shotGraphPolicyVersion === 'primary_chain_v14_reference_fix'
    || shotGraphPolicyVersion === 'primary_chain_v15_previous_keyframe_grid'
    || shotGraphPolicyVersion === 'primary_chain_v16_structured_prompt_plan'
    || shotGraphPolicyVersion === 'primary_chain_v17_vibe_director_quality'
  const canonicalShotReferenceMode = ['primary_chain_v12_canonical_shot_refs', 'primary_chain_v13_ui_ingredient_override', 'primary_chain_v14_reference_fix', 'primary_chain_v15_previous_keyframe_grid', 'primary_chain_v16_structured_prompt_plan', 'primary_chain_v17_vibe_director_quality']
    .includes(shotGraphPolicyVersion)
    || helpers.readText(config.dependencyMode ?? config.dependency_mode) === 'ingredient_refs'
  const sceneState = helpers.asRecord(config.sceneState ?? config.scene_state)
  const sceneStateText = helpers.compactStoryboardSentence(formatSequenceAnimaticSceneStateForPrompt(sceneState as never), '', 42)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const coverageSetup = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const coverageAnchor = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['coverageAnchor', 'coverage_anchor'])
  const previousKeyframe = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['previousKeyframe', 'previous_keyframe'])
  const storyboardPanel = canonicalShotReferenceMode ? {} : helpers.readFirstUpstreamRecord(context.upstream, ['storyboardPanel', 'storyboard_panel'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const assetPackReferenceAssetKeys = helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys)
  const upstreamReferenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map((entry) => helpers.readText(entry))
    .filter(Boolean)
  const configuredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const canonicalReferenceAssetKeys = uiIngredientOverrideMode && (assetPackReferenceAssetKeys.length > 0 || upstreamReferenceAssetKeys.length > 0)
    ? (assetPackReferenceAssetKeys.length > 0 ? assetPackReferenceAssetKeys : upstreamReferenceAssetKeys)
    : configuredReferenceAssetKeys
  const referenceAssetKeys = canonicalShotReferenceMode && canonicalReferenceAssetKeys.length > 0
    ? canonicalReferenceAssetKeys
    : [...new Set([
    ...helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys),
    ...referenceManifest.map((entry) => helpers.readText(helpers.asRecord(entry).assetKey)),
  ].filter(Boolean))]
  const referenceManifestText = referenceManifest
    .map((entry) => helpers.readText(helpers.asRecord(entry).line))
    .filter(Boolean)
    .join('\n')
  const upstreamVisualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const visualCallSheet = helpers.readText(upstreamVisualCallSheet.version)
    ? upstreamVisualCallSheet
    : buildSequenceAnimaticShotVisualCallSheet({
      shot,
      coverageSetup,
      coverageAnchor,
      previousKeyframe,
      storyboardPanel,
      referenceManifest,
      sceneStateText,
    })
  const visualCallSheetText = formatSequenceAnimaticShotVisualCallSheetForPrompt(visualCallSheet)
  const visibleSubjects = referenceLinesForRole({
    helpers,
    assetPack,
    roles: ['character_reference', 'temp_character_reference'],
    fallback: 'Subject',
    maxCount: 8,
    maxVisualWords: 16,
  }).join('\n')
  const locationRefs = referenceLinesForRole({
    helpers,
    assetPack,
    roles: ['zone_reference', 'location_reference', 'viewpoint_reference'],
    fallback: 'Location ref',
    maxCount: 3,
    maxVisualWords: 14,
  }).join('\n')
  const propRefLines = referenceLinesForRole({
    helpers,
    assetPack,
    roles: ['prop_reference'],
    fallback: 'Prop',
    maxCount: 5,
    maxVisualWords: 12,
  })
  const propRefs = propRefLines.join('\n')
  const upstreamPromptPlan = helpers.readFirstUpstreamRecord(context.upstream, ['promptPlan', 'prompt_plan'])
  const promptPlanDiagnostics = helpers.readFirstUpstreamArray(context.upstream, ['promptPlanDiagnostics', 'prompt_plan_diagnostics'])
    .map((entry) => helpers.readText(entry))
    .filter(Boolean)
  const camera = helpers.asRecord(shot.camera)
  const dialogue = formatSequenceAnimaticKeyframeDialogueCue(helpers, shot)
  const action = cleanSequenceAnimaticKeyframePromptText(helpers, helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt), 42)
  const cameraBrief = cleanSequenceAnimaticKeyframePromptText(helpers, formatSequenceAnimaticShotVisualCallSheetCameraPlan(visualCallSheet)
    || [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')
    || helpers.readText(shot.camera), 34)
  const performance = cleanSequenceAnimaticKeyframePromptText(helpers, helpers.readText(shot.performance), 24)
  const cuePack = buildSequenceAnimaticShotPromptCuePack({ helpers, shot, referenceManifest: referenceManifest.map((entry) => helpers.asRecord(entry)) })
  const visualPerformanceLines = visualPerformanceCueLines(helpers, cuePack)
  const lighting = cleanSequenceAnimaticKeyframePromptText(helpers, helpers.readText(shot.lighting) || helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief), 30)
  const coverageFallback = !helpers.readText(coverageAnchor.assetKey) && (
    helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)
    || helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
    || helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief)
  )
  const hasCoverageAnchor = Boolean(helpers.readText(coverageAnchor.assetKey))
  const fallbackPromptText = uiIngredientOverrideMode ? [
    'Generate one finished cinematic keyframe for this exact animatic shot. Single final frame only.',
    '',
    'References:',
    referenceManifestText || 'No attached image references; use only the written visual facts.',
    '',
    'Action / Blocking:',
    action || 'Hold the exact readable action from the shot.',
    visibleSubjects ? `Visible subjects:\n${visibleSubjects}` : 'Visible subjects: only subjects explicitly visible in the shot action.',
    propRefs ? `Props/items:\n${propRefs}` : '',
    '',
    dialogue ? 'Dialogue:' : '',
    dialogue || '',
    visualPerformanceLines.length > 0 ? 'Performance / Acting:' : '',
    visualPerformanceLines.join('\n'),
    '',
    'Camera:',
    cameraBrief || 'Use the shot camera plan; preserve readable staging and screen direction.',
    performance ? `Performance: ${performance}` : '',
    '',
    'Lighting / Environment:',
    [lighting, locationRefs ? `Location reference:\n${locationRefs}` : '', sceneStateText ? `Continuity facts: ${cleanSequenceAnimaticKeyframePromptText(helpers, sceneStateText, 42)}` : ''].filter(Boolean).join('\n') || 'Preserve environment, weather, material, and lighting continuity.',
    '',
    'Negative:',
    'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Use only the attached ingredient identities plus the written shot facts. Do not introduce unlisted major characters, props, locations, or stale visual references. Do not mention workflow, schema, IDs, or asset keys in the image.',
  ].filter(Boolean).join('\n') : [
    'Generate one finished cinematic keyframe for this exact animatic shot. Single final frame only.',
    !canonicalShotReferenceMode && hasCoverageAnchor
      ? 'Composition lock: @Image1 is the coverage anchor. Match its camera position, framing, screen direction, horizon/ground plane, major foreground/background shapes, and subject placement. Replace blockout placeholders with final art.'
      : '',
    '',
    'Reference map',
    referenceManifestText || 'No attached image references; use only the written visual facts.',
    '',
    'Director call sheet',
    visualCallSheetText,
    '',
    'Frame target',
    `${helpers.readText(shot.title) || 'Untitled shot'} - ${action || 'one clear visible moment.'}`,
    dialogue ? `Dialogue visible cue: ${helpers.compactStoryboardSentence(dialogue, '', 26)}` : '',
    '',
    'Visible subjects',
    visibleSubjects || 'Only subjects explicitly visible in the shot action.',
    propRefs ? `Props/items\n${propRefs}` : '',
    '',
    'Action/blocking',
    action || 'Hold the exact readable action from the shot.',
    !canonicalShotReferenceMode && hasCoverageAnchor
      ? 'Use @Image1 coverage anchor as the framing/background/blocking source of truth. Do not copy labels, arrows, placeholder figures, or blockout styling.'
      : (!canonicalShotReferenceMode && coverageFallback ? `Coverage facts: ${helpers.compactStoryboardSentence(coverageFallback, '', 30)}` : ''),
    !canonicalShotReferenceMode && helpers.readText(previousKeyframe.assetKey) ? 'Use the previous keyframe reference only for same-setup motion continuity and established state.' : '',
    '',
    'Camera/framing',
    cameraBrief || 'Camera and framing follow the shot plan.',
    helpers.readText(shot.performance) ? `Performance: ${helpers.compactStoryboardSentence(shot.performance, '', 20)}` : '',
    visualPerformanceLines.length > 0 ? `Performance / Acting\n${visualPerformanceLines.join('\n')}` : '',
    '',
    'Lighting/environment',
    [lighting, locationRefs ? `Location refs\n${locationRefs}` : '', sceneStateText ? `Visual continuity facts: ${sceneStateText}` : ''].filter(Boolean).join('\n') || 'Preserve environment, weather, material, and lighting continuity.',
    '',
    'Negative rules',
    canonicalShotReferenceMode
      ? 'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Use only the attached ingredient identities plus the written shot facts; do not introduce unlisted characters, props, locations, or stale visual references. Do not mention workflow, schema, IDs, or asset keys in the image.'
      : 'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Do not render blockout labels from the coverage anchor. Do not change the coverage-anchor camera angle, lens feel, background layout, or screen direction unless the written shot facts explicitly contradict it. Do not mention workflow, schema, IDs, or asset keys in the image.',
  ].filter(Boolean).join('\n')
  const hasPromptPlan = keyframePromptPlanBindings(upstreamPromptPlan).length > 0
  const promptText = hasPromptPlan
    ? renderKeyframePromptFromPlan({
      helpers,
      plan: upstreamPromptPlan,
      action: action || 'Hold the exact readable action from the shot.',
      dialogue,
      cameraBrief,
      lighting,
      locationRefs,
      sceneStateText,
    })
    : fallbackPromptText
  const outputs = {
    prompt: promptText,
    text: promptText,
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    promptPlan: upstreamPromptPlan,
    prompt_plan: upstreamPromptPlan,
    promptPlanDiagnostics,
    prompt_plan_diagnostics: promptPlanDiagnostics,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    sceneState,
    scene_state: sceneState,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-prompt-v3' })
}

export async function vibeDirectorContinuityPreflight(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const vibeDirector = readVibeDirectorConfig(config, helpers)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map((entry) => helpers.readText(entry))
    .filter(Boolean)
  const upstreamReferenceManifest = helpers.readFirstUpstreamArray(context.upstream, ['referenceManifest', 'reference_manifest'])
    .map((entry) => helpers.asRecord(entry))
  const referenceManifest = upstreamReferenceManifest.length > 0
    ? upstreamReferenceManifest
    : sequenceAnimaticReferenceManifestEntries(assetPack).map((entry) => helpers.asRecord(entry))
  const shotId = helpers.readText(shot.id) || helpers.readText(shot.shotId) || helpers.readText(config.shotId) || 'shot'
  const counts = referenceRoleCounts({ referenceManifest, helpers })
  const shotText = [
    helpers.readText(shot.action),
    helpers.readText(shot.description),
    helpers.readText(shot.dialogue),
    helpers.readText(shot.dialogueCue ?? shot.dialogue_cue),
  ].filter(Boolean).join(' ')
  const appearsSubjectLed = /\b(says|speaks|looks|stares|face|hand|walks|runs|turns|dialogue|voice)\b/i.test(shotText)
  const appearsLocationLed = /\b(in|through|across|room|street|hall|zone|set|spot|location|door|window)\b/i.test(shotText)
  const warnings = [
    referenceAssetKeys.length === 0 ? 'No reference asset keys are attached to this shot.' : '',
    appearsSubjectLed && counts.canonical === 0 ? 'Subject-led shot has no canonical character/prop reference in the manifest.' : '',
    appearsLocationLed && counts.spatial === 0 ? 'Location-led shot has no spatial, zone, set, spot, viewpoint, or coverage reference.' : '',
  ].filter(Boolean)
  const readiness = vibeDirectorContinuityReadinessSchema.parse({
    version: 'vibe_director_continuity_readiness_v1',
    shotId,
    status: referenceAssetKeys.length === 0 || (appearsLocationLed && counts.spatial === 0) ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready',
    canonicalRefCount: counts.canonical,
    spatialRefCount: counts.spatial,
    previousVisualRefCount: counts.previous,
    storyboardRefCount: counts.storyboard,
    warnings,
    referencePriority: [
      'Use canonical character, item, and location sheets as identity authority.',
      'Use zone/spot/viewpoint or coverage references as spatial authority.',
      'Use previous keyframes and comic/storyboard pages only for action, pose, and continuity hints.',
    ],
  })
  const shotDirection = vibeDirectorShotDirection({ shot, shotId, vibeDirector, helpers })
  const outputs = {
    text: JSON.stringify({ readiness, shotDirection }, null, 2),
    shot,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    continuityReadiness: readiness,
    continuity_readiness: readiness,
    shotDirection,
    shot_direction: shotDirection,
    vibeDirector,
    vibe_director: vibeDirector,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-vibe-director-continuity-preflight-v1' })
}

export async function vibeDirectorKeyframePromptQuality(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const vibeDirector = readVibeDirectorConfig(config, helpers)
  const promptText = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceAssetKeys = helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
    .map((entry) => helpers.readText(entry))
    .filter(Boolean)
  const referenceManifest = helpers.readFirstUpstreamArray(context.upstream, ['referenceManifest', 'reference_manifest'])
    .map((entry) => helpers.asRecord(entry))
  const continuityReadiness = helpers.readFirstUpstreamRecord(context.upstream, ['continuityReadiness', 'continuity_readiness'])
  const shotId = helpers.readText(shot.id) || helpers.readText(shot.shotId) || helpers.readText(config.shotId) || 'shot'
  const existingShotDirection = helpers.readFirstUpstreamRecord(context.upstream, ['shotDirection', 'shot_direction'])
  const shotDirection = helpers.readText(existingShotDirection.shotId)
    ? existingShotDirection
    : vibeDirectorShotDirection({ shot, shotId, vibeDirector, helpers })
  const briefText = formatVibeDirectorWorkflowBriefForPrompt(vibeDirector)
  const findingRecords = [
    promptText.includes('Negative') || promptText.includes('No captions')
      ? { severity: 'info', text: 'Artifact safety: prompt includes negative rules against text/UI artifacts.' }
      : { severity: 'medium', text: 'Artifact safety: prompt is missing explicit negative rules against labels, UI, captions, and watermarks.' },
    referenceAssetKeys.length > 0
      ? { severity: 'info', text: `Continuity: ${referenceAssetKeys.length} reference asset${referenceAssetKeys.length === 1 ? '' : 's'} are bound.` }
      : { severity: 'high', text: 'Continuity: prompt has no bound reference assets.' },
    briefText && !promptText.includes('Vibe Director locks')
      ? { severity: 'low', text: 'Direction: Vibe Director locks will be appended for directorial consistency.' }
      : { severity: 'info', text: 'Direction: directorial locks are present or not configured.' },
  ]
  const findings = findingRecords.map((finding) => finding.text)
  const highFindings = findingRecords.filter((finding) => finding.severity === 'high').length
  const mediumFindings = findingRecords.filter((finding) => finding.severity === 'medium').length
  const qualityPass = vibeDirectorQualityPassSchema.parse({
    version: 'vibe_director_quality_pass_v1',
    target: 'keyframe_prompt',
    status: highFindings > 0 ? 'blocked' : mediumFindings > 0 ? 'warning' : 'passed',
    score: Math.max(0.2, Math.min(1, 1 - highFindings * 0.28 - mediumFindings * 0.12)),
    findings,
    fixesApplied: briefText && !promptText.includes('Vibe Director locks')
      ? ['Appended compact Vibe Director locks for style, camera, performance, and reference authority.']
      : [],
    recommendedActions: [
      referenceAssetKeys.length === 0 ? 'Re-run shot reference pack before generating this keyframe.' : '',
      mediumFindings > 0 ? 'Keep negative artifact rules visible in the final image prompt.' : '',
    ].filter(Boolean),
  })
  const directionLines = [
    briefText,
    helpers.readText(shotDirection.note) ? `Shot note: ${helpers.readText(shotDirection.note)}` : '',
    helpers.readText(shotDirection.camera) ? `Camera: ${helpers.readText(shotDirection.camera)}` : '',
    helpers.readText(shotDirection.movement) ? `Movement: ${helpers.readText(shotDirection.movement)}` : '',
    helpers.readText(shotDirection.performance) ? `Performance: ${helpers.readText(shotDirection.performance)}` : '',
    helpers.readText(shotDirection.continuity) ? `Continuity: ${helpers.readText(shotDirection.continuity)}` : '',
  ].filter(Boolean)
  const improvedPrompt = directionLines.length > 0 && !promptText.includes('Vibe Director locks')
    ? `${promptText}\n\nVibe Director locks:\n${directionLines.join('\n')}`
    : promptText
  const outputs = {
    prompt: improvedPrompt,
    text: improvedPrompt,
    originalPrompt: promptText,
    original_prompt: promptText,
    shot,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceManifest,
    reference_manifest: referenceManifest,
    continuityReadiness,
    continuity_readiness: continuityReadiness,
    shotDirection,
    shot_direction: shotDirection,
    qualityPass,
    quality_pass: qualityPass,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-vibe-director-keyframe-prompt-quality-v1' })
}

export async function sequenceAnimaticPlannedKeyframeInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.asRecord(config.shot)
  const coverageSetup = helpers.asRecord(config.coverageSetup ?? config.coverage_setup)
  const coverageAnchor = helpers.asRecord(config.coverageAnchor ?? config.coverage_anchor)
  const previousKeyframe = helpers.asRecord(config.previousKeyframe ?? config.previous_keyframe)
  const storyboardPanel = helpers.asRecord(config.storyboardPanel ?? config.storyboard_panel)
  const requiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const extraReferenceEntities = [
    coverageAnchor,
    previousKeyframe,
    storyboardPanel,
  ].flatMap((image, index): LooseRecord[] => {
    const assetKey = helpers.readText(image.assetKey)
    if (!assetKey) return []
    const label = index === 0 ? 'Coverage anchor' : index === 1 ? 'Previous keyframe' : 'Storyboard panel'
    return [{
      key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${helpers.slugify(assetKey)}`,
      name: label,
      type: 'continuity_asset',
      role: index === 0 ? 'coverage_anchor_reference' : index === 1 ? 'previous_keyframe_reference' : 'storyboard_panel_reference',
      summary: `${label} for this shot.`,
      visualDescription: `Use this ${label.toLowerCase()} to preserve composition and continuity.`,
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: index === 0 ? 'coverage_anchor' : index === 1 ? 'previous_keyframe' : 'storyboard_panel',
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
    }]
  }).filter((entry) => !requiredReferenceAssetKeys.includes(helpers.readText(entry.primaryAssetKey)))
  const baseAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack ?? config.asset_pack),
    shots: [shot],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const extraReferenceAssetKeys = extraReferenceEntities
    .map((entity) => helpers.readText(entity.primaryAssetKey))
    .filter(Boolean)
  const assetPack = orderSequenceAnimaticAssetPackReferences(scopeAssetPackToReferenceAssetKeys({
    assetPack: baseAssetPack,
    referenceAssetKeys: [...requiredReferenceAssetKeys, ...extraReferenceAssetKeys],
    fallbackEntities: extraReferenceEntities,
    referenceScope: 'sequence_animatic_shot_keyframe',
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = sequenceAnimaticReferenceManifestText(assetPack)
  const visualCallSheet = buildSequenceAnimaticShotVisualCallSheet({
    shot,
    coverageSetup,
    coverageAnchor,
    previousKeyframe,
    storyboardPanel,
    referenceManifest,
  })
  const outputs = {
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    text: JSON.stringify({ shot, coverageSetup, coverageAnchor, previousKeyframe, storyboardPanel, assetPack, visualCallSheet }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-input-v1' })
}

export async function sequenceAnimaticPlannedKeyframeArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const image = readPreferredUpstreamImage({
    upstream: context.upstream,
    helpers,
    preferredNodeKeys: ['planned_keyframe_image', 'shot_keyframe_image'],
    fields: ['image', 'keyframe', 'primaryReferenceImage'],
    role: 'sequence_animatic_shot_keyframe',
  }) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const visualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const shotId = helpers.readText(shot.id) || helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot keyframe artifact requires a shot id.')
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Shot keyframe image did not produce an asset key.')
  const qcFindings: string[] = assetKey ? [] : ['Shot keyframe image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const keyframe = {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'shot_keyframe',
    sequenceAnimaticRole: 'shot_keyframe',
    masterRequestId: helpers.readText(config.masterRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId,
    coverageSetupId: helpers.readText(config.coverageSetupId),
    assetKey,
    image,
    prompt,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    qcStatus,
    qcFindings,
    status: assetKey ? 'ready' : 'failed',
    generatedAt: new Date().toISOString(),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(shotId)}.sequence-animatic-shot-keyframe`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(shot.title) || helpers.titleFromRefLike(shotId)} Keyframe`,
    summary: 'Final shot keyframe generated from the animatic shot plan, coverage anchor, and shot-scoped references.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-keyframe-artifact-v1',
      role: 'sequence_animatic_shot_keyframe',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'shot_keyframe',
      screenplayAnimaticRole: 'shot_keyframe',
      masterRequestId: keyframe.masterRequestId,
      storyboardBlockId: keyframe.storyboardBlockId,
      shotId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      requiredReferenceAssetKeys: helpers.readStringArray(config.requiredReferenceAssetKeys),
      omittedReferenceAssetKeys: helpers.readStringArray(config.omittedReferenceAssetKeys),
      sourceReferenceHash: helpers.readText(config.sourceReferenceHash),
      visualPlanHash: helpers.readText(config.visualPlanHash),
      qcStatus,
      qcFindings,
      prompt,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
      image,
      shot,
      keyframe,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: keyframe.masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: assetKey ? 'shot_keyframe_ready' : 'shot_keyframe_failed',
    payload: {
      shotId,
      storyboardBlockId: keyframe.storyboardBlockId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      artifactKey: artifact.key,
      status: keyframe.status,
    },
    metadata: { source: 'sequence_animatic_keyframe_workflow' },
    dedupe: { shotId },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    shotKeyframe: keyframe,
    shot_keyframe: keyframe,
    keyframe,
    image,
    shot,
    prompt,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-keyframe-artifact-v1' })
}

export async function sequenceAnimaticPlannedKeyframeImage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeImageGeneration(context)
}

function cleanVideoPromptFragment(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\s+([.;,:])/g, '$1').trim().replace(/[.]+$/, '')
}

function isGenericShotVideoSubjectFragment(value: string) {
  const text = cleanVideoPromptFragment(value).toLowerCase()
  if (!text) return true
  return /^follow (the )?shot\b/.test(text)
    || /^follow shot\b/.test(text)
    || /^use (the )?shot blocking\b/.test(text)
    || /^keep readable facial\/body performance from the shot facts\b/.test(text)
    || /^animate the shot action clearly\b/.test(text)
    || /^animate the visible shot action\b/.test(text)
    || /^keep focus on the shot action\b/.test(text)
}

function cleanUsableShotVideoFragment(value: string) {
  const cleaned = cleanVideoPromptFragment(value)
  return isGenericShotVideoSubjectFragment(cleaned) ? '' : cleaned
}

function singularizeEnglishLabel(value: string) {
  const text = value.trim()
  if (/attendants$/i.test(text)) return text.replace(/attendants$/i, 'attendant')
  if (/guards$/i.test(text)) return text.replace(/guards$/i, 'guard')
  if (/soldiers$/i.test(text)) return text.replace(/soldiers$/i, 'soldier')
  if (/monks$/i.test(text)) return text.replace(/monks$/i, 'monk')
  if (/workers$/i.test(text)) return text.replace(/workers$/i, 'worker')
  if (/servants$/i.test(text)) return text.replace(/servants$/i, 'servant')
  if (/villagers$/i.test(text)) return text.replace(/villagers$/i, 'villager')
  if (/pilgrims$/i.test(text)) return text.replace(/pilgrims$/i, 'pilgrim')
  if (/figures$/i.test(text)) return text.replace(/figures$/i, 'figure')
  if (/people$/i.test(text)) return 'person'
  if (/men$/i.test(text)) return 'man'
  if (/women$/i.test(text)) return 'woman'
  if (/children$/i.test(text)) return 'child'
  if (/s$/i.test(text) && !/ss$/i.test(text)) return text.replace(/s$/i, '')
  return text
}

function groupSubjectCountLabel(input: { subject: string; count: number; isGroup: boolean }) {
  if (input.count > 1) return `Exactly ${input.count} ${input.subject}`
  if (!input.isGroup) return `One ${input.subject}`
  const member = singularizeEnglishLabel(input.subject)
  return member && member.toLowerCase() !== input.subject.toLowerCase()
    ? `One ${member} from ${input.subject}`
    : `One member of ${input.subject}`
}

function subjectSearchTerms(subject: string) {
  const normalized = subject.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
  const words = normalized.split(/\s+/).filter((word) => word.length > 2)
  const terms = new Set(words)
  for (const word of words) terms.add(singularizeEnglishLabel(word).toLowerCase())
  return Array.from(terms).filter(Boolean)
}

function splitShotActionClauses(action: string) {
  return action
    .split(/(?<=[.!?;])\s+|\s+while\s+|\s+as\s+|\s+then\s+/i)
    .map((entry) => cleanVideoPromptFragment(entry))
    .filter(Boolean)
}

function subjectSpecificShotAction(subject: string, action: string) {
  const clauses = splitShotActionClauses(action)
  const terms = subjectSearchTerms(subject)
  if (terms.length === 0) return ''
  const exact = clauses.find((clause) => {
    const lower = clause.toLowerCase()
    return terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
  })
  return exact || ''
}

function compactShotVideoEndState(action: string) {
  const clauses = splitShotActionClauses(action)
  const last = clauses[clauses.length - 1] || cleanVideoPromptFragment(action)
  if (!last) return ''
  return `End with ${last.charAt(0).toLowerCase()}${last.slice(1)}`
}

function cleanShotVideoContinuityLine(value: string) {
  const cleaned = cleanVideoPromptFragment(value)
    .replace(/\benvironment or shot-location continuity reference\b/gi, '')
    .replace(/\buse for environment geometry, weather, lighting logic, and spatial continuity\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.;,:])/g, '$1')
    .trim()
  return cleanVideoPromptFragment(cleaned)
}

function dedupeShotVideoConstraintLines(helpers: SequenceAnimaticWorkflowNodePackHelpers, lines: string[]) {
  const seen = new Set<string>()
  const normalizedArtifactBan = /production-board|captions|subtitles|watermarks|guide boxes|panel borders|grid gutters/i
  let artifactBanIncluded = false
  return uniqueCleanKeyframePromptLines(helpers, lines)
    .map(cleanVideoPromptFragment)
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase()
      if (seen.has(key)) return false
      if (normalizedArtifactBan.test(line)) {
        if (artifactBanIncluded) return false
        artifactBanIncluded = true
      }
      seen.add(key)
      return true
    })
}

function formatShotVideoReferenceBindings(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  seedanceReferenceManifest: ReturnType<typeof buildSeedanceReferenceManifest>
  promptPlan: LooseRecord
}) {
  const bindings = videoPromptPlanBindings(input.promptPlan)
  if (bindings.length === 0) return formatSeedanceReferenceManifest(input.seedanceReferenceManifest)
  return input.seedanceReferenceManifest.map((entry, index) => {
    const binding = bindings[index] ?? {}
    const tag = input.helpers.readText(entry.tag) || input.helpers.readText(binding.imageTag ?? binding.image_tag) || `@Image${index + 1}`
    const name = input.helpers.readText(binding.name) || input.helpers.readText(entry.label).split(':')[0] || `Reference ${index + 1}`
    const kind = input.helpers.readText(binding.kind) as VideoPromptReferenceKind
    const usage = cleanVideoPromptFragment(input.helpers.readText(binding.usage) || videoReferenceUsage(kind, name))
    const label = kind === 'keyframe'
      ? 'opening keyframe only'
      : kind === 'location'
        ? 'environment/location only'
        : kind === 'character'
          ? 'character identity only'
          : kind === 'group_character'
            ? 'group/people identity only'
            : kind === 'continuity_grid'
              ? 'previous-shot continuity only'
              : 'prop/item only'
    return `${tag} ${name}: ${label}; ${usage}.`
  }).join('\n')
}

function cueMatchesName(helpers: SequenceAnimaticWorkflowNodePackHelpers, candidate: unknown, name: string) {
  const candidateName = helpers.readText(candidate).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return Boolean(candidateName && normalizedName && (candidateName === normalizedName || candidateName.includes(normalizedName) || normalizedName.includes(candidateName)))
}

function performanceCueForSpeaker(helpers: SequenceAnimaticWorkflowNodePackHelpers, cuePack: ShotPromptCuePack, speaker: string) {
  return cuePack.characterPerformanceCues.find((cue) => cueMatchesName(helpers, cue.characterName ?? cue.character_name, speaker)) ?? null
}

function dialogueCueForLine(helpers: SequenceAnimaticWorkflowNodePackHelpers, cuePack: ShotPromptCuePack, speaker: string, line: string) {
  const normalizedLine = cleanSequenceAnimaticDialogueText(line).toLowerCase()
  return cuePack.dialogueDeliveryCues.find((cue) => {
    const cueLine = cleanSequenceAnimaticDialogueText(helpers.readText(cue.text)).toLowerCase()
    return cueMatchesName(helpers, cue.speakerName ?? cue.speaker_name, speaker)
      && (!normalizedLine || !cueLine || normalizedLine === cueLine)
  }) ?? null
}

function shotVideoDialogueBlocks(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  shot: LooseRecord
  promptPlan: LooseRecord
  cuePack: ShotPromptCuePack
  entityByKey: Map<string, LooseRecord>
}) {
  const director = videoPromptDirectorShot(input.promptPlan)
  const directorBeats = input.helpers.readArray(director.dialogueBeats ?? director.dialogue_beats).map(input.helpers.asRecord)
  const fallbackBeats = input.helpers.readArray(input.shot.dialogue).map(input.helpers.asRecord).map((line) => {
    const speakerKey = input.helpers.readText(line.speakerRefId ?? line.speaker_ref_id)
    return {
      speaker: input.helpers.readText(input.entityByKey.get(speakerKey)?.name) || input.helpers.readText(line.speakerName ?? line.speaker_name) || speakerKey || 'Speaker',
      line: input.helpers.readText(line.text ?? line.line),
      delivery: [input.helpers.readText(line.emotion), input.helpers.readText(line.delivery), input.helpers.readText(line.subtext)].filter(Boolean).join('; '),
      timing: '',
    }
  })
  const beats = (directorBeats.length > 0 ? directorBeats : fallbackBeats)
    .filter((beat) => input.helpers.readText(beat.line))
  return beats.map((beat) => {
    const speaker = input.helpers.readText(beat.speaker) || 'Speaker'
    const line = cleanSequenceAnimaticDialogueText(input.helpers.readText(beat.line))
    const dialogueCue = dialogueCueForLine(input.helpers, input.cuePack, speaker, line)
    const performanceCue = performanceCueForSpeaker(input.helpers, input.cuePack, speaker)
    const deliveryParts = uniqueCleanKeyframePromptLines(input.helpers, [
      input.helpers.readText(beat.delivery),
      dialogueCue?.emotion ? `emotion: ${dialogueCue.emotion}` : '',
      dialogueCue?.delivery ? `delivery: ${dialogueCue.delivery}` : '',
      dialogueCue?.subtext ? `subtext: ${dialogueCue.subtext}` : '',
      performanceCue?.voiceEnergy ? `voice: ${performanceCue.voiceEnergy}` : '',
      performanceCue?.facialExpression ? `face: ${performanceCue.facialExpression}` : '',
      performanceCue?.gaze ? `gaze: ${performanceCue.gaze}` : '',
      performanceCue?.gesture ? `gesture: ${performanceCue.gesture}` : '',
      performanceCue?.dominanceLabel ? performanceCue.dominanceLabel : '',
      performanceCue?.confidenceLabel ? performanceCue.confidenceLabel : '',
    ]).map(cleanVideoPromptFragment).filter(Boolean)
    const timing = cleanVideoPromptFragment(input.helpers.readText(beat.timing))
    const spokenLine = line.endsWith('.') || line.endsWith('!') || line.endsWith('?') ? line : `${line}.`
    return [
      `${speaker}: "${spokenLine}"`,
      deliveryParts.length > 0 ? `Delivery: ${deliveryParts.join('; ')}.` : '',
      timing ? `Timing: ${timing}.` : '',
    ].filter(Boolean).join('\n')
  })
}

function shotVideoSubjectLines(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  promptPlan: LooseRecord
}) {
  const roster = videoPromptSubjectRoster(input.promptPlan)
  const bindingKindByTag = new Map<string, string>()
  const bindingKindByName = new Map<string, string>()
  for (const binding of videoPromptPlanBindings(input.promptPlan)) {
    const tag = input.helpers.readText(binding.imageTag ?? binding.image_tag)
    const name = input.helpers.readText(binding.name)
    const kind = input.helpers.readText(binding.kind)
    if (tag) bindingKindByTag.set(tag, kind)
    if (name) bindingKindByName.set(name.toLowerCase(), kind)
  }
  const fallback = videoPromptPlanBindings(input.promptPlan)
    .filter((binding) => ['character', 'group_character'].includes(input.helpers.readText(binding.kind)))
    .map((binding) => ({
      subject: input.helpers.readText(binding.name),
      count: input.helpers.readText(binding.kind) === 'group_character' ? 2 : 1,
      sourceImageTag: input.helpers.readText(binding.imageTag ?? binding.image_tag),
      action: '',
      screenPlacement: '',
    }))
  return (roster.length > 0 ? roster : fallback).map((rawEntry) => {
    const entry = rawEntry as LooseRecord
    const subject = input.helpers.readText(entry.subject)
    if (!subject) return ''
    const tag = input.helpers.readText(entry.sourceImageTag ?? entry.source_image_tag)
    const count = Math.max(1, Number(entry.count) || 1)
    const kind = bindingKindByTag.get(tag) || bindingKindByName.get(subject.toLowerCase()) || ''
    const isGroup = kind === 'group_character'
    const placement = cleanUsableShotVideoFragment(input.helpers.readText(entry.screenPlacement ?? entry.screen_placement))
    const action = cleanUsableShotVideoFragment(
      input.helpers.readText(entry.shotAction ?? entry.shot_action)
      || input.helpers.readText(entry.roleInShot ?? entry.role_in_shot)
      || input.helpers.readText(entry.action),
    )
    const countLabel = groupSubjectCountLabel({ subject, count, isGroup })
    return `- ${countLabel}${tag ? ` using ${tag}` : ''}${placement ? `; ${placement}` : ''}${action ? `; ${action}` : ''}.`
  }).filter(Boolean)
}

function buildSequenceAnimaticShotVideoDirectorPrompt(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  shot: LooseRecord
  promptPlan: LooseRecord
  seedanceReferenceManifest: ReturnType<typeof buildSeedanceReferenceManifest>
  referenceInstruction: string
  cameraPlan: string
  continuityPlan: string
  cuePack: ShotPromptCuePack
  entityByKey: Map<string, LooseRecord>
  characterVoiceGuide: string
  providerDurationSeconds: number
  aspectRatio: string
  resolution: string
  audioPolicy: string
  movementLogic: string
  artifactBan: string
}) {
  const director = videoPromptDirectorShot(input.promptPlan)
  const actionBeats = input.helpers.readArray(director.actionBeats ?? director.action_beats)
    .map((entry) => cleanVideoPromptFragment(input.helpers.readText(entry)))
    .filter(Boolean)
  const performanceLines = uniqueCleanKeyframePromptLines(input.helpers, [
    ...input.helpers.readArray(director.subjectPerformance ?? director.subject_performance).map((entry) => input.helpers.readText(entry)),
    ...videoPromptPerformanceDirection(input.promptPlan),
  ]).map(cleanVideoPromptFragment).filter(Boolean)
  const shotAction = cleanVideoPromptFragment(input.helpers.readText(input.shot.action) || input.helpers.readText(input.shot.description) || input.helpers.readText(input.shot.storyboardPanelPrompt) || input.helpers.readText(input.shot.title))
  const subjectLines = shotVideoSubjectLines({ helpers: input.helpers, promptPlan: input.promptPlan })
  const dialogueBlocks = shotVideoDialogueBlocks({
    helpers: input.helpers,
    shot: input.shot,
    promptPlan: input.promptPlan,
    cuePack: input.cuePack,
    entityByKey: input.entityByKey,
  })
  const camera = cleanVideoPromptFragment(input.helpers.readText(director.camera) || input.cameraPlan)
  const endState = cleanUsableShotVideoFragment(input.helpers.readText(director.endState ?? director.end_state))
  const lighting = cleanVideoPromptFragment(input.helpers.readText(input.shot.lighting))
  const continuity = cleanShotVideoContinuityLine(input.helpers.readText(director.environmentContinuity ?? director.environment_continuity) || input.continuityPlan)
  const constraintLines = input.helpers.readArray(director.constraints).map((entry) => input.helpers.readText(entry))
  const audioLines = dedupeShotVideoConstraintLines(input.helpers, [
    input.audioPolicy,
    input.characterVoiceGuide ? `Voice identities: ${input.characterVoiceGuide.replace(/\n+/g, ' ')}` : '',
    input.movementLogic,
    input.artifactBan,
    ...constraintLines,
    'Preserve attached references and keyframe composition.',
  ])
  return [
    `Generate one Seedance 2 clip for this single shot, ${input.aspectRatio}, ${input.resolution}.`,
    '',
    '[REFERENCES]',
    formatShotVideoReferenceBindings({
      helpers: input.helpers,
      seedanceReferenceManifest: input.seedanceReferenceManifest,
      promptPlan: input.promptPlan,
    }),
    input.referenceInstruction,
    '',
    '[SHOT DIRECTION]',
    `Duration: ${input.providerDurationSeconds} seconds.`,
    camera ? `Camera: ${camera}.` : '',
    `Action: ${(actionBeats.length > 0 ? actionBeats.join(' ') : shotAction) || 'Animate the visible shot action only'}.`,
    subjectLines.length > 0 ? `Visible subjects:\n${subjectLines.join('\n')}` : '',
    dialogueBlocks.length > 0 ? `Dialogue:\n${dialogueBlocks.join('\n')}` : 'Dialogue: none.',
    performanceLines.length > 0 ? `Performance:\n${performanceLines.map((line) => `- ${line}.`).join('\n')}` : '',
    lighting ? `Lighting: ${lighting}.` : '',
    continuity ? `Continuity: ${continuity}.` : '',
    endState ? `End state: ${endState}.` : '',
    '',
    '[AUDIO / CONSTRAINTS]',
    audioLines.join('\n'),
  ].filter(Boolean).join('\n')
}

export async function sequenceAnimaticShotVideoPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotRecord = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...shotRecord,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceAssetKeys = helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys).length > 0
    ? helpers.readStringArray(assetPack.scopedReferenceAssetKeys ?? assetPack.scoped_reference_asset_keys)
    : helpers.readFirstUpstreamArray(context.upstream, ['referenceAssetKeys', 'reference_asset_keys']).map((entry) => helpers.readText(entry)).filter(Boolean)
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const voiceGuideAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const entityByKey = helpers.cinematicEntityByKey(voiceGuideAssetPack)
  const timing = await inferSequenceShotVideoTimingRuntime({
    nodeKey: context.node.key,
    shot: shot as unknown as LooseRecord,
    entityByKey,
    runStructuredNode: helpers.runStructuredNode,
  })
  const editorialDurationSeconds = Math.max(1, Math.min(15, Number(timing.editorialDurationSeconds) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const promptPlan = helpers.readFirstUpstreamRecord(context.upstream, ['promptPlan', 'prompt_plan'])
  const promptPlanBindings = videoPromptPlanBindings(promptPlan)
  const seedanceReferenceManifest = buildSeedanceReferenceManifest({
    imageReferences: referenceManifest.map((entry, index) => {
      const binding = promptPlanBindings[index] ?? {}
      const kind = helpers.readText(binding.kind)
      const name = helpers.readText(binding.name) || promptPlanReferenceDisplayName(helpers, entry, `Reference ${index + 1}`)
      const usage = helpers.readText(binding.usage) || videoReferenceUsage(kind as VideoPromptReferenceKind, name)
      return {
        label: `${name}: ${usage}`,
        role: kind === 'keyframe'
          ? 'keyframe'
          : kind === 'location'
            ? 'location_reference'
            : kind === 'continuity_grid'
              ? 'storyboard_sheet'
              : 'entity_reference',
        modality: 'image' as const,
      }
    }),
    cinematicReferenceMode: helpers.readText(config.cinematicReferenceMode) || (referenceManifest.some((entry) => helpers.readText(entry.role) === 'shot_keyframe_reference') ? 'keyframes' : 'shot_reference_sheet'),
  })
  const visualCallSheet = buildSequenceAnimaticShotVisualCallSheet({
    shot: shot as unknown as LooseRecord,
    referenceManifest: seedanceReferenceManifest,
    directedControls: timing.directedControls,
    durationSeconds: providerDurationSeconds,
  })
  const cameraPlan = formatSequenceAnimaticShotVisualCallSheetCameraPlan(visualCallSheet)
  const continuityPlan = [
    helpers.readText(visualCallSheet.environment.locationContinuity),
    helpers.readText(visualCallSheet.environment.lighting),
    helpers.readText(visualCallSheet.environment.cameraGridUse),
  ].filter(Boolean).join(' ')
  const hasCurrentKeyframeReference = promptPlanBindings.some((binding) => helpers.readText(binding.kind) === 'keyframe')
  const referenceInstruction = [
    hasCurrentKeyframeReference
      ? 'Animate from the current shot keyframe composition and start-state; do not render any production-board marks.'
      : 'No shot keyframe is attached; use the ingredient references and written direction to stage the clip.',
  ].join('\n')
  const characterVoiceGuide = buildSeedanceCharacterVoiceGuide({
    assetPack: voiceGuideAssetPack,
    shots: [shot as unknown as LooseRecord],
    limit: 4,
    visualIdentityKeys: new Set(shot.visibleCharacterRefIds),
  })
  const cuePack = buildSequenceAnimaticShotPromptCuePack({
    helpers,
    shot: shot as unknown as LooseRecord,
    referenceManifest: referenceManifest.map((entry) => entry as LooseRecord),
  })
  const performanceDialogueLines = [
    ...videoPromptPerformanceDirection(promptPlan),
    ...videoPromptDialogueDeliveryPlan(promptPlan),
  ]
  const performanceDialogueGuide = uniqueCleanKeyframePromptLines(helpers, performanceDialogueLines)
    .map((line) => compactSeedanceControlText(line, 28))
    .filter(Boolean)
    .join('\n')
  const plannedDirectedControls = {
    ...helpers.asRecord(timing.directedControls),
    cameraMotion: helpers.readText(promptPlan.cameraDirection ?? promptPlan.camera_direction ?? promptPlan.cameraMotion ?? promptPlan.camera_motion) || helpers.readText(helpers.asRecord(timing.directedControls).cameraMotion),
    subjectMotion: helpers.readText(promptPlan.motionDirection ?? promptPlan.motion_direction) || helpers.readText(helpers.asRecord(timing.directedControls).subjectMotion),
    focusTarget: helpers.readText(promptPlan.focusPlan ?? promptPlan.focus_plan) || helpers.readText(helpers.asRecord(timing.directedControls).focusTarget),
    visibility: helpers.readText(promptPlan.visibilityRules ?? promptPlan.visibility_rules) || helpers.readText(helpers.asRecord(timing.directedControls).visibility),
    performance: performanceDialogueGuide || helpers.readText(helpers.asRecord(timing.directedControls).performance),
    voice: videoPromptDialogueDeliveryPlan(promptPlan).length > 0
      ? compactSeedanceControlText(videoPromptDialogueDeliveryPlan(promptPlan).join('; '), 30)
      : helpers.readText(helpers.asRecord(timing.directedControls).voice),
  }
  const prompt = buildSequenceAnimaticShotVideoDirectorPrompt({
    helpers,
    shot: shot as unknown as LooseRecord,
    promptPlan,
    seedanceReferenceManifest,
    referenceInstruction,
    cameraPlan,
    continuityPlan,
    cuePack,
    entityByKey,
    characterVoiceGuide,
    providerDurationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    audioPolicy: helpers.readText(promptPlan.audioPolicy ?? promptPlan.audio_policy)
      || 'No music, score, audio bed, room tone, crowd wash, or background ambience. Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen shot action.',
    movementLogic: seedanceLabanMovementBlock([shot as unknown as LooseRecord], helpers.readText(context.run.prompt)),
    artifactBan: seedanceProductionBoardArtifactBan(seedanceReferenceManifest),
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const timedShot = { ...shot, editorialDurationSeconds, providerDurationSeconds }
  const outputs = {
    prompt,
    text: prompt,
    shot: timedShot,
    shotPlan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    shot_plan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    assetPack,
    asset_pack: assetPack,
    voiceGuideAssetPack,
    voice_guide_asset_pack: voiceGuideAssetPack,
    primaryReferenceImage: referenceManifest[0] ?? null,
    referenceImageCount: referenceAssetKeys.length,
    seedanceReferenceManifest,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    cameraPlan,
    camera_plan: cameraPlan,
    directedControls: plannedDirectedControls,
    audioPolicy: 'dialogue_and_direct_diegetic_sfx_only',
    visualReferencePolicy: 'focused_shot_ui_ingredients_only',
    promptPlan,
    prompt_plan: promptPlan,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    offscreenSpeakerVisualReferencesExcluded: true,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    timingInference: {
      mode: 'llm_from_shot_details',
      ignoredTaggedShotTiming: true,
      rationale: helpers.readText(timing.rationale),
      pacingNotes: helpers.readText(timing.pacingNotes),
      provider: helpers.readText(timing.provider),
      model: helpers.readText(timing.model),
      fallbackUsed: timing.fallbackUsed,
      fallbackReason: helpers.readText(timing.fallbackReason),
    },
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    sequenceAnimaticRole: 'shot_video',
    guidance,
    deterministic: helpers.readText(timing.provider) === 'graphcore',
  }
  return result({
    context,
    helpers,
    outputs,
    provider: helpers.readText(timing.provider) || 'graphcore',
    model: helpers.readText(timing.model) || 'sequence-animatic-shot-video-prompt-v2',
  })
}

export async function sequenceAnimaticShotVideoArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const video = readUpstreamVideos(context.upstream, helpers, ['video', 'videos'])[0] ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text', 'providerPrompt'])
  const keyframe = helpers.readFirstUpstreamImage(context.upstream, ['keyframe', 'image', 'primaryReferenceImage'])
  const visualCallSheet = helpers.readFirstUpstreamRecord(context.upstream, ['visualCallSheet', 'visual_call_sheet'])
  const shotId = helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot video artifact requires a shot id.')
  const assetKey = helpers.readText(video.assetKey)
  if (!assetKey) {
    const outputs = {
      video,
      prompt,
      keyframe,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
      assetKey: '',
      skipped: true,
      skippedReason: helpers.readText(video.skippedReason) || 'shot_video_missing_asset',
      authoringReady: false,
    }
    return result({
      status: 'skipped',
      context,
      helpers,
      outputs,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-video-artifact-skip-v1',
    })
  }
  const storagePath = helpers.readText(video.storagePath) || helpers.readText(video.storage_path)
  if (!storagePath) throw new Error('Shot video artifact requires a storage path.')
  const mimeType = helpers.readText(video.mimeType) || helpers.readText(video.mime_type) || 'video/mp4'
  const artifact = await helpers.registerVideoArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    mimeType,
    name: `${helpers.titleFromRefLike(helpers.readText(config.shotId))} Video`,
    summary: 'Generated per-shot sequence animatic video.',
    metadata: {
      ...helpers.asRecord(video.metadata),
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: helpers.readText(video.provider),
      model: helpers.readText(video.model),
      providerRequestId: helpers.readText(video.providerRequestId),
      role: 'sequence_animatic_shot_video',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: helpers.readText(config.sequenceAnimaticRole) || 'shot_video',
      screenplayAnimaticRole: helpers.readText(config.screenplayAnimaticRole) || 'shot_video',
      masterRequestId: helpers.readText(config.masterRequestId),
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      shotId,
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      storagePath,
      prompt,
      keyframe,
      visualCallSheet,
      visual_call_sheet: visualCallSheet,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: helpers.readText(config.masterRequestId),
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'shot_video_ready',
    payload: {
      shotId,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      artifactKey: artifact.key,
      status: 'ready',
    },
    metadata: { source: 'sequence_animatic_shot_production_workflow' },
    dedupe: { shotId, assetKey },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    video: {
      ...video,
      assetKey,
      storagePath,
      mimeType,
      role: 'sequence_animatic_shot_video',
    },
    keyframe,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-video-artifact-v1' })
}

export async function sequenceAnimaticShotVideo(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeVideoGeneration(context)
}

const sequenceAnimaticShotProductionHandlers = {
  sequence_animatic_keyframe_prompt_plan: sequenceAnimaticKeyframePromptPlan,
  sequence_animatic_shot_video_prompt_plan: sequenceAnimaticShotVideoPromptPlan,
  sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt,
  vibe_director_continuity_preflight: vibeDirectorContinuityPreflight,
  vibe_director_keyframe_prompt_quality: vibeDirectorKeyframePromptQuality,
  sequence_animatic_planned_keyframe_input: sequenceAnimaticPlannedKeyframeInput,
  sequence_animatic_planned_keyframe_image: sequenceAnimaticPlannedKeyframeImage,
  sequence_animatic_planned_keyframe_artifact: sequenceAnimaticPlannedKeyframeArtifact,
  sequence_animatic_shot_video_prompt: sequenceAnimaticShotVideoPrompt,
  sequence_animatic_shot_video: sequenceAnimaticShotVideo,
  sequence_animatic_shot_video_artifact: sequenceAnimaticShotVideoArtifact,
}

const sequenceAnimaticShotProductionWorkflowNodePackKey = 'sequence_animatic_shot_production'

export const sequenceAnimaticShotProductionWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticShotProductionHandlers
>({
  packKey: sequenceAnimaticShotProductionWorkflowNodePackKey,
  handlers: sequenceAnimaticShotProductionHandlers,
})

export const sequenceAnimaticShotProductionWorkflowNodeHandlerKeys = sequenceAnimaticShotProductionWorkflowNodePack.handlerKeys

function createSequenceAnimaticShotProductionNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticShotProductionHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic shot production workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticShotProductionWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

const shotProductionProjectionMetadataKeys = [
  'activeManifestPurpose',
  'activeProgressLabel',
  'readyArtifactCount',
  'scopedAssetKeys',
  'recoveryHints',
]

export const sequenceAnimaticShotProductionWorkflowNodeScaffolds = [
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_keyframe_prompt_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'upstream.referenceManifest',
      'config.shotId',
      'config.sceneState',
      'config.keyframePromptPlanPolicyVersion',
      'config.shotGraphPolicyVersion',
      'config.vibeDirector',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'vibe_director_continuity_preflight',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'upstream.referenceManifest',
      'config.shotId',
      'config.vibeDirector',
      'config.shotContinuityOptions',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video_prompt_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'upstream.referenceImages',
      'config.shotId',
      'config.storyboardBlockId',
      'config.aspectRatio',
      'config.resolution',
      'config.videoPromptPlanPolicyVersion',
      'config.shotVideoReferenceOverride',
      'config.uiIngredientPlanHash',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.coverageSetup',
      'upstream.coverageAnchor',
      'upstream.previousKeyframe',
      'upstream.storyboardPanel',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'upstream.visualCallSheet',
      'upstream.promptPlan',
      'upstream.promptPlanDiagnostics',
      'config.shotId',
      'config.sceneState',
      'config.keyframePromptPolicyVersion',
      'config.referenceAssetKeys',
      'config.vibeDirector',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'vibe_director_keyframe_prompt_quality',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.prompt',
      'upstream.shot',
      'upstream.assetPack',
      'upstream.referenceAssetKeys',
      'upstream.referenceManifest',
      'upstream.continuityReadiness',
      'upstream.shotDirection',
      'config.shotId',
      'config.vibeDirector',
      'config.shotContinuityOptions',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
      'config.shot',
      'config.coverageSetup',
      'config.coverageAnchor',
      'config.previousKeyframe',
      'config.storyboardPanel',
      'config.assetPack',
      'config.requiredReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
      'config.assetPackReferenceLimit',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_image',
    runtimeKind: 'image_generation',
    sourceHashKeys: [
      'upstream.prompt',
      'upstream.referenceManifest',
      'config.shotId',
      'config.coverageSetupId',
      'config.imageModel',
      'config.imageSize',
      'config.quality',
      'config.requiredReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_planned_keyframe_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.image',
      'upstream.prompt',
      'upstream.visualCallSheet',
      'upstream.shot',
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
      'config.requiredReferenceAssetKeys',
      'config.omittedReferenceAssetKeys',
      'config.sourceReferenceHash',
      'config.visualPlanHash',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video_prompt',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.image',
      'upstream.keyframe',
      'upstream.visualCallSheet',
      'config.shotId',
      'config.storyboardBlockId',
      'config.aspectRatio',
      'config.resolution',
      'config.editorialDurationSeconds',
      'config.assetPackReferenceLimit',
      'config.videoPromptPolicyVersion',
      'config.videoTimingPolicyVersion',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video',
    runtimeKind: 'video_generation',
    sourceHashKeys: [
      'upstream.prompt',
      'upstream.primaryReferenceImage',
      'upstream.seedanceReferenceManifest',
      'upstream.durationSeconds',
      'upstream.directedControls',
      'upstream.visualCallSheet',
      'config.shotId',
      'config.videoModel',
      'config.videoProvider',
      'config.aspectRatio',
      'config.resolution',
      'config.durationSeconds',
    ],
    projectionMetadataKeys: [
      ...shotProductionProjectionMetadataKeys,
      'providerStatus',
      'providerRequestId',
    ],
  }),
  createSequenceAnimaticShotProductionNodeScaffold({
    purpose: 'sequence_animatic_shot_video_artifact',
    runtimeKind: 'artifact_registration',
    sourceHashKeys: [
      'upstream.video',
      'upstream.prompt',
      'upstream.keyframe',
      'upstream.visualCallSheet',
      'config.masterRequestId',
      'config.storyboardBlockId',
      'config.shotId',
      'config.coverageSetupId',
    ],
    projectionMetadataKeys: shotProductionProjectionMetadataKeys,
  }),
]

export const sequenceAnimaticShotProductionWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticShotProductionWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticShotProductionWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticShotProductionWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
