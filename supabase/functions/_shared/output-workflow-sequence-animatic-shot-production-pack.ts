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
  buildCompactSeedanceVideoPrompt,
  buildSeedanceCharacterVoiceGuide,
  buildSeedanceReferenceManifest,
  compactSeedanceControlText,
  formatSeedanceShotLine,
  seedanceLabanMovementBlock,
  seedanceProductionBoardArtifactBan,
  seedanceReferenceRecordsFromAssetPack,
  seedanceReferenceRecordsFromImages,
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

function readUpstreamImages(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['image', 'coverImage'],
) {
  const images: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !images.some((image) => helpers.readText(image.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(image.storagePath ?? image.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      images.push(outputs)
    }
  }
  return images
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
  continuityNotes: z.array(z.string()).default([]),
  continuity_notes: z.array(z.string()).default([]),
  negativeRules: z.array(z.string()).default([]),
  negative_rules: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

type KeyframePromptPlan = z.infer<typeof keyframePromptPlanSchema>
type KeyframePromptReferenceKind = z.infer<typeof keyframePromptReferenceKindSchema>

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
  return keyframePromptPlanSchema.parse({
    referenceAssetKeys: input.referenceAssetKeys,
    reference_asset_keys: input.referenceAssetKeys,
    referenceBindings: bindings,
    reference_bindings: bindings,
    subjectRoster: subjects,
    subject_roster: subjects,
    stagingPlan: input.cameraBrief,
    staging_plan: input.cameraBrief,
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
  const fallback = fallbackKeyframePromptPlan({ helpers, shot, referenceManifest, referenceAssetKeys, action, cameraBrief, lighting, sceneStateText })
  const prompt = [
    'Plan a cinematic image-generation prompt from structured shot data.',
    'Return strict JSON only. Do not add, remove, rename, or reorder image references. Bind every image exactly once.',
    'Classify references semantically as location, character, group_character, prop_item, or continuity_grid.',
    'Use group_character for factions, crowds, attendants, guards, crews, groups, or any reference used as people in the action.',
    'Location and previous-keyframe continuity-grid references must never become visible subjects.',
    'Create a one-to-one subject roster so named characters cannot be duplicated, merged, or swapped.',
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
  const canonicalShotReferenceMode = ['primary_chain_v12_canonical_shot_refs', 'primary_chain_v13_ui_ingredient_override', 'primary_chain_v14_reference_fix', 'primary_chain_v15_previous_keyframe_grid', 'primary_chain_v16_structured_prompt_plan']
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
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage'])
  const assetPackReferenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6))
  const visualAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: false,
    includePerformanceRefs: false,
    includeTextMentionedRefs: false,
  })
  const voiceGuideAssetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
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
  const dialogueLines = shot.dialogue
    .map((line) => {
      const text = helpers.readText(line.text)
      if (!text) return ''
      const speakerKey = helpers.readText(line.speakerRefId)
      const speaker = helpers.readText(entityByKey.get(speakerKey)?.name) || helpers.readText(line.speakerName) || speakerKey || 'Speaker'
      const emotion = helpers.readText(line.emotion)
      return `${speaker}: "${text}"${emotion ? ` (${emotion})` : ''}`
    })
    .filter(Boolean)
    .join(' ')
  const seedanceReferenceManifest = buildSeedanceReferenceManifest({
    imageReferences: [
      ...seedanceReferenceRecordsFromImages(upstreamImages.slice(0, 1), 'keyframes'),
      ...seedanceReferenceRecordsFromAssetPack(visualAssetPack, assetPackReferenceLimit),
    ].slice(0, 9),
    cinematicReferenceMode: 'keyframes',
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
  const referenceInstruction = upstreamImages.length > 0
    ? 'Treat @Image1 as the cropped shot keyframe reference, not a storyboard sheet. Preserve composition, visible subjects, lighting, environment, and props while animating the shot.'
    : 'Use attached references only for visible subject, location, prop, and camera-continuity guidance. No storyboard or keyframe reference is attached.'
  const characterVoiceGuide = buildSeedanceCharacterVoiceGuide({
    assetPack: voiceGuideAssetPack,
    shots: [shot as unknown as LooseRecord],
    limit: 4,
    visualIdentityKeys: new Set(shot.visibleCharacterRefIds),
  })
  const shotAction = helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt) || helpers.readText(shot.title)
  const shotLine = [
    formatSeedanceShotLine({
      shot: shot as unknown as LooseRecord,
      startSeconds: 0,
      endSeconds: providerDurationSeconds,
      dialogueLines,
    }),
    helpers.readText(shot.lighting) ? `Lighting: ${compactSeedanceControlText(shot.lighting, 12)}.` : '',
  ].filter(Boolean).join(' ')
  const prompt = buildCompactSeedanceVideoPrompt({
    durationSeconds: providerDurationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    referenceManifest: seedanceReferenceManifest,
    referenceInstruction,
    cameraPlan,
    directedControls: helpers.asRecord(timing.directedControls),
    shotSectionTitle: 'SHOT',
    shotLines: shotLine || shotAction,
    continuityPlan,
    identityGuide: characterVoiceGuide,
    audioPolicy: 'No music, score, audio bed, room tone, crowd wash, or background ambience. Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen shot action.',
    movementLogic: seedanceLabanMovementBlock([shot as unknown as LooseRecord], helpers.readText(context.run.prompt)),
    artifactBan: seedanceProductionBoardArtifactBan(seedanceReferenceManifest),
    clipLabel: 'this single shot',
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
    assetPack: visualAssetPack,
    asset_pack: visualAssetPack,
    voiceGuideAssetPack,
    voice_guide_asset_pack: voiceGuideAssetPack,
    primaryReferenceImage: upstreamImages[0] ?? null,
    referenceImageCount: upstreamImages.length,
    seedanceReferenceManifest,
    visualCallSheet,
    visual_call_sheet: visualCallSheet,
    visualCallSheetVersion: 'shot_visual_call_sheet_v1',
    visual_call_sheet_version: 'shot_visual_call_sheet_v1',
    cameraPlan,
    camera_plan: cameraPlan,
    directedControls: timing.directedControls,
    audioPolicy: 'dialogue_and_direct_diegetic_sfx_only',
    visualReferencePolicy: 'visible_characters_location_props_only',
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
      sequenceAnimaticRole: 'shot_production',
      screenplayAnimaticRole: 'shot_production',
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
  sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt,
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
