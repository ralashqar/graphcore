import { z } from 'zod'
import {
  cinematicV2ShotPurposeSchema,
  cinematicV2ShotSchema,
  providerSafeCinematicV2DurationSeconds,
} from '../../../src/domain/cinematics.ts'
import {
  sequenceAnimaticContinuityGraphV2Schema,
  sequenceAnimaticContinuityRejectedCandidateSchema,
  sequenceAnimaticContinuityShotBindingSchema,
  sequenceAnimaticShotContinuityPlanV2Schema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'
import {
  projectShotContinuityPlanV2ToDirectorPlan,
  type SequenceAnimaticDirectorPlanProjectionHelpers,
} from './output-workflow-sequence-animatic-director-plan-projection.ts'
import {
  sequenceAnimaticShotContinuityCoverageSetupV2Schema,
} from './output-workflow-sequence-animatic-coverage-runtime.ts'
import {
  parseSequenceAnimaticGraphV2,
  sequenceAnimaticEmptyGraphV2,
} from './output-workflow-sequence-animatic-continuity-graph-runtime.ts'

export const sequenceAnimaticDirectorPlanShotSchema = z.object({
  id: z.string(),
  index: z.number().optional(),
  sourceAnchorIds: z.array(z.string()).default([]),
  sourceScriptShotIds: z.array(z.string()).default([]),
  blockId: z.string().default(''),
  storyboardBlockId: z.string().default(''),
  title: z.string().default(''),
  action: z.string().default(''),
  description: z.string().default(''),
  camera: z.record(z.string(), z.unknown()).default({}),
  lighting: z.string().default(''),
  dialogue: z.array(z.record(z.string(), z.unknown())).default([]),
  performance: z.array(z.record(z.string(), z.unknown())).default([]),
  refs: z.record(z.string(), z.unknown()).default({}),
  visibleCharacterRefIds: z.array(z.string()).default([]),
  speakerRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  locationRefIds: z.array(z.string()).default([]),
  continuityAnchorIds: z.array(z.string()).default([]),
  sceneBinding: z.record(z.string(), z.unknown()).default({}),
  sceneGraphBinding: z.record(z.string(), z.unknown()).default({}),
  assetRequirements: z.array(z.record(z.string(), z.unknown())).default([]),
  warnings: z.array(z.string()).default([]),
}).catchall(z.unknown())

export const sequenceAnimaticDirectorPlanBlockSchema = z.object({
  id: z.string(),
  index: z.number().optional(),
  title: z.string().default(''),
  summary: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  status: z.enum(['planned', 'needs_review', 'failed']).default('planned'),
  warnings: z.array(z.string()).default([]),
}).catchall(z.unknown())

export const sequenceAnimaticDirectorPlanSchema = z.object({
  role: z.literal('sequence_animatic_director_plan').default('sequence_animatic_director_plan'),
  graphSpecVersion: z.literal('sequence_animatic_graph_v2').default('sequence_animatic_graph_v2'),
  screenplayAnimaticRole: z.literal('director_plan').default('director_plan'),
  sequenceAnimaticRole: z.literal('director_plan').default('director_plan'),
  planningMode: z.enum(['single_director_pass', 'deterministic_fallback']).default('single_director_pass'),
  contractVersion: z.string().default(''),
  screenplaySummary: z.string().default(''),
  shots: z.array(sequenceAnimaticDirectorPlanShotSchema).default([]),
  blocks: z.array(sequenceAnimaticDirectorPlanBlockSchema).default([]),
  sceneGraphAdditions: z.record(z.string(), z.unknown()).default({}),
  coverageSetups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverage_setups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverageSetupByShotId: z.record(z.string(), z.string()).default({}),
  coverage_setup_by_shot_id: z.record(z.string(), z.string()).default({}),
  localReferences: z.array(z.record(z.string(), z.unknown())).default([]),
  notes: z.array(z.string()).default([]),
  continuityGraphV2: sequenceAnimaticContinuityGraphV2Schema.optional(),
  shotBindings: z.record(z.string(), sequenceAnimaticContinuityShotBindingSchema).default({}),
  assetRequirements: z.array(z.record(z.string(), z.unknown())).default([]),
  canonicalReferenceAssignments: z.record(z.string(), z.unknown()).default({}),
  outputLocalReferences: z.array(z.record(z.string(), z.unknown())).default([]),
  rejectedCandidates: z.array(sequenceAnimaticContinuityRejectedCandidateSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
}).catchall(z.unknown())

export type SequenceAnimaticDirectorPlanRuntimeHelpers = SequenceAnimaticDirectorPlanProjectionHelpers & {
  hashOutputWorkflowValue: (value: unknown) => string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(readText).filter(Boolean)
  const text = readText(value)
  return text ? [text] : []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function normalizeStatusToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function sequenceAnimaticDirectorBlockIdByShotId(blocksInput: unknown) {
  const map = new Map<string, string>()
  readArray(blocksInput).map(asRecord).forEach((block) => {
    const blockId = readText(block.id)
    if (!blockId) return
    readStringArray(block.shotIds ?? block.shot_ids).forEach((shotId) => {
      if (shotId) map.set(shotId, blockId)
    })
  })
  return map
}

function normalizeCinematicV2ShotPurpose(value: unknown, fallback: unknown, index: number): z.infer<typeof cinematicV2ShotPurposeSchema> {
  const text = normalizeStatusToken(readText(value) || readText(fallback))
  if (cinematicV2ShotPurposeSchema.safeParse(text).success) return text as z.infer<typeof cinematicV2ShotPurposeSchema>
  if (/\b(establish|wide|location|setting|arrival)\b/.test(text)) return 'establishing'
  if (/\b(intro|introduce|entrance|character)\b/.test(text)) return 'character_intro'
  if (/\b(dialogue|conversation|speak|speech|line|exchange|argue|argument)\b/.test(text)) return 'dialogue'
  if (/\b(reaction|react|response|realization|recognition|discover|discovery|reveal)\b/.test(text)) return 'reaction'
  if (/\b(impact|hit|collision|strike|explosion|crash|shock|climax)\b/.test(text)) return 'impact'
  if (/\b(insert|detail|prop|object|closeup|close-up|cutaway)\b/.test(text)) return 'insert'
  if (/\b(transition|bridge|move|travel|passage|montage)\b/.test(text)) return 'transition'
  if (/\b(close|closing|resolution|ending|final|aftermath)\b/.test(text)) return 'closing'
  return index === 1 ? 'establishing' : 'action'
}

function normalizeSequenceAnimaticDialogueLines(input: {
  rawDialogue: unknown
  fallbackDialogue: unknown
  shotId: string
  speakerRefIds: string[]
}) {
  const rawLines = readArray(input.rawDialogue).length > 0
    ? readArray(input.rawDialogue).map(asRecord)
    : readArray(input.fallbackDialogue).map(asRecord)
  return rawLines.map((line, index) => {
    const speakerName = readText(line.speakerName) || readText(line.speaker_name) || readText(line.speaker) || readText(line.characterName) || readText(line.character_name)
    const explicitSpeakerRefId = readText(line.speakerRefId) || readText(line.speaker_ref_id) || readText(line.characterRefId) || readText(line.character_ref_id)
    const speakerRefId = explicitSpeakerRefId
      || input.speakerRefIds[index]
      || (speakerName ? `temporary_${slugify(speakerName)}` : `temporary_speaker_${String(index + 1).padStart(2, '0')}`)
    return {
      id: readText(line.id) || `${input.shotId}_dialogue_${String(index + 1).padStart(2, '0')}`,
      speakerRefId,
      speakerName,
      text: readText(line.text) || readText(line.line) || readText(line.dialogue) || readText(line.caption),
      emotion: readText(line.emotion) || readText(line.tone),
      delivery: readText(line.delivery),
      subtext: readText(line.subtext),
      startSeconds: Number.isFinite(Number(line.startSeconds ?? line.start_seconds)) ? Number(line.startSeconds ?? line.start_seconds) : null,
      endSeconds: Number.isFinite(Number(line.endSeconds ?? line.end_seconds)) ? Number(line.endSeconds ?? line.end_seconds) : null,
    }
  }).filter((line) => line.text)
}

function normalizeSequenceAnimaticPerformanceBeats(input: {
  rawBeats: unknown
  fallbackBeats: unknown
  visibleCharacterRefIds: string[]
  speakerRefIds: string[]
}) {
  const fallbackCharacterRefId = input.visibleCharacterRefIds[0] || input.speakerRefIds[0] || 'temporary_performer'
  const rawBeats = readArray(input.rawBeats).length > 0
    ? readArray(input.rawBeats).map(asRecord)
    : readArray(input.fallbackBeats).map(asRecord)
  return rawBeats.map((beat, index) => ({
    ...beat,
    characterRefId: readText(beat.characterRefId)
      || readText(beat.character_ref_id)
      || readText(beat.speakerRefId)
      || readText(beat.speaker_ref_id)
      || input.visibleCharacterRefIds[index]
      || fallbackCharacterRefId,
  }))
}

function normalizeSequenceAnimaticDirectorShot(input: {
  shot: Record<string, unknown>
  fallbackShot?: Record<string, unknown>
  index: number
  blockIdByShotId: Map<string, string>
  shotBindings: Record<string, unknown>
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}) {
  const shot = input.shot
  const fallback = input.fallbackShot ?? {}
  const index = Number(shot.index ?? fallback.index ?? input.index + 1) || input.index + 1
  const shotId = readText(shot.id) || readText(fallback.id) || `shot_${String(index).padStart(3, '0')}`
  const shotRefs = input.helpers.sequenceAnimaticShotRefs(shot, fallback)
  const sceneGraphBinding = asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.sceneGraphBinding ?? shot.scene_graph_binding ?? input.shotBindings[shotId])
  const binding = asRecord(input.shotBindings[shotId])
  const storyboardBlockId = readText(shot.storyboardBlockId)
    || readText(shot.storyboard_block_id)
    || readText(shot.blockId)
    || readText(shot.block_id)
    || readText(binding.storyboardBlockId)
    || input.blockIdByShotId.get(shotId)
    || ''
  if (Object.keys(sceneGraphBinding).length > 0 && !input.shotBindings[shotId]) {
    input.shotBindings[shotId] = input.helpers.sequenceAnimaticShotBindingFromSceneBinding({
      shotId,
      storyboardBlockId,
      sceneBinding: sceneGraphBinding,
      refs: shotRefs,
    })
  }
  const effectiveBinding = asRecord(input.shotBindings[shotId])
  const continuityAnchorIds = [
    ...readStringArray(shot.continuityAnchorIds ?? shot.continuity_anchor_ids),
    ...shotRefs.localReferenceIds,
    ...readStringArray(effectiveBinding.continuityAnchorIds ?? effectiveBinding.continuity_anchor_ids),
    ...readStringArray(effectiveBinding.characterAnchorIds ?? effectiveBinding.character_anchor_ids),
    ...readStringArray(effectiveBinding.propAnchorIds ?? effectiveBinding.prop_anchor_ids),
    ...readStringArray(effectiveBinding.assetAnchorIds ?? effectiveBinding.asset_anchor_ids),
  ].filter((value, valueIndex, values) => value && values.indexOf(value) === valueIndex)
  const duration = Math.max(1, Math.min(8, Number(shot.editorialDurationSeconds ?? shot.durationSeconds ?? shot.approximateDurationSeconds ?? fallback.editorialDurationSeconds ?? 0) || 3))
  const action = readText(shot.action) || readText(shot.description) || readText(fallback.action) || readText(fallback.description) || readText(shot.title) || `Shot ${index}`
  const description = readText(shot.description) || readText(shot.action) || readText(fallback.description) || readText(fallback.action) || action
  const camera = asRecord(shot.camera ?? fallback.camera)
  const sourceScriptShotIds = [
    ...readStringArray(shot.sourceScriptShotIds ?? shot.source_script_shot_ids),
    ...readStringArray(shot.sourceAnchorIds ?? shot.source_anchor_ids),
    ...readStringArray(fallback.sourceScriptShotIds ?? fallback.source_script_shot_ids),
  ].filter((value, valueIndex, values) => value && values.indexOf(value) === valueIndex)
  const sourceAnchorIds = [
    ...readStringArray(shot.sourceAnchorIds ?? shot.source_anchor_ids),
    ...sourceScriptShotIds,
    ...readStringArray(fallback.sourceAnchorIds ?? fallback.source_anchor_ids),
  ].filter((value, valueIndex, values) => value && values.indexOf(value) === valueIndex)
  const speakerRefIds = readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids).length > 0
    ? readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids)
    : shotRefs.speakerRefIds.length > 0
      ? shotRefs.speakerRefIds
      : readStringArray(fallback.speakerRefIds ?? fallback.speaker_ref_ids)
  const dialogue = normalizeSequenceAnimaticDialogueLines({
    rawDialogue: shot.dialogue,
    fallbackDialogue: fallback.dialogue,
    shotId,
    speakerRefIds,
  })
  const allSpeakerRefIds = [
    ...speakerRefIds,
    ...dialogue.map((line) => line.speakerRefId),
  ].filter((value, valueIndex, values) => value && values.indexOf(value) === valueIndex)
  const visibleCharacterRefIds = readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids).length > 0
    ? readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids)
    : shotRefs.visibleCharacterRefIds.length > 0
      ? shotRefs.visibleCharacterRefIds
      : readStringArray(fallback.visibleCharacterRefIds ?? fallback.visible_character_ref_ids)
  const performanceBeats = normalizeSequenceAnimaticPerformanceBeats({
    rawBeats: shot.performanceBeats ?? shot.performance_beats ?? (Array.isArray(shot.performance) ? shot.performance : []),
    fallbackBeats: fallback.performanceBeats ?? fallback.performance_beats,
    visibleCharacterRefIds,
    speakerRefIds: allSpeakerRefIds,
  })
  const parsedShot = cinematicV2ShotSchema.parse({
    ...fallback,
    ...shot,
    id: shotId,
    sceneId: readText(shot.sceneId) || readText(fallback.sceneId) || 'sequence_animatic_master',
    index,
    storyboardBlockId,
    title: readText(shot.title) || readText(fallback.title) || `Shot ${index}`,
    purpose: normalizeCinematicV2ShotPurpose(shot.purpose, fallback.purpose, index),
    editorialDurationSeconds: duration,
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
    description,
    action,
    caption: readText(shot.caption) || readText(fallback.caption) || readText(shot.title) || action,
    lighting: readText(shot.lighting) || readText(fallback.lighting),
    mood: readText(shot.mood) || readText(fallback.mood),
    storyboardPanelPrompt: readText(shot.storyboardPanelPrompt) || readText(shot.storyboard_panel_prompt) || readText(fallback.storyboardPanelPrompt) || `Storyboard ${shotId}: ${action}`,
    videoDirection: readText(shot.videoDirection) || readText(shot.video_direction) || readText(fallback.videoDirection) || action,
    dialogue,
    speakerRefIds: allSpeakerRefIds,
    visibleCharacterRefIds,
    performanceBeats,
    locationRefId: readText(shot.locationRefId) || readText(shot.location_ref_id) || readText(fallback.locationRefId) || readText(fallback.location_ref_id),
    worldLocationRefId: readText(shot.worldLocationRefId) || readText(shot.world_location_ref_id) || readText(effectiveBinding.worldLocationRefId) || shotRefs.locationRefIds[0] || readText(shot.locationRefId) || readText(shot.location_ref_id) || readText(fallback.worldLocationRefId) || readText(fallback.world_location_ref_id),
    continuitySetId: readText(effectiveBinding.setId),
    continuityZoneId: readText(effectiveBinding.zoneId),
    continuitySpotIds: readStringArray(effectiveBinding.spotIds),
    continuityAngleId: readText(effectiveBinding.angleId),
    propRefIds: readStringArray(shot.propRefIds ?? shot.prop_ref_ids).length > 0
      ? readStringArray(shot.propRefIds ?? shot.prop_ref_ids)
      : shotRefs.propRefIds.length > 0
        ? shotRefs.propRefIds
        : readStringArray(fallback.propRefIds ?? fallback.prop_ref_ids),
    continuityInputs: readArray(shot.continuityInputs ?? shot.continuity_inputs).length > 0
      ? readArray(shot.continuityInputs ?? shot.continuity_inputs).map(asRecord)
      : readArray(fallback.continuityInputs ?? fallback.continuity_inputs).map(asRecord),
    camera: {
      framing: readText(camera.framing) || (index === 1 ? 'wide establishing frame' : 'readable cinematic frame'),
      angle: readText(camera.angle) || 'eye level',
      lens: readText(camera.lens),
      movement: readText(camera.movement) || (index === 1 ? 'controlled establishing movement' : 'motivated shot movement'),
      screenDirectionRule: readText(camera.screenDirectionRule) || readText(camera.screen_direction_rule),
    },
    requiresLipSync: shot.requiresLipSync === true || fallback.requiresLipSync === true,
    status: readText(shot.status) || 'planned',
    continuityAnchorIds,
    continuityAnchorRefIds: continuityAnchorIds,
    sceneGraphBinding: Object.keys(effectiveBinding).length > 0 ? effectiveBinding : sceneGraphBinding,
  })
  return {
    ...parsedShot,
    sourceScriptShotIds,
    sourceAnchorIds,
  }
}

export function normalizeSequenceAnimaticDirectorPlan(input: {
  rawPlan: unknown
  manifest: Record<string, unknown>
  manifestHash: string
  masterManifestArtifactKey: string
  continuityPlannerContext: Record<string, unknown>
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}) {
  const parsedV2 = sequenceAnimaticShotContinuityPlanV2Schema.safeParse(input.rawPlan)
  const parsed = sequenceAnimaticDirectorPlanSchema.parse(
    parsedV2.success ? projectShotContinuityPlanV2ToDirectorPlan(parsedV2.data, input.helpers) : input.rawPlan,
  )
  const manifestShotPlan = asRecord(input.manifest.shotPlan)
  const manifestShots = readArray(manifestShotPlan.shots).map(asRecord)
  const rawShots = parsed.shots.map(asRecord).filter((shot) => readText(shot.id) || readText(shot.action) || readText(shot.description))
  if (rawShots.length === 0) {
    throw new Error('Sequence animatic shot continuity plan must return final shots.')
  }
  if (parsed.blocks.length === 0) {
    throw new Error('Sequence animatic shot continuity plan must return final storyboard blocks.')
  }
  const manifestShotById = new Map(manifestShots.map((shot) => [readText(shot.id), shot] as const).filter(([id]) => id))
  const blockIdByShotId = sequenceAnimaticDirectorBlockIdByShotId(parsed.blocks)
  const rawGraph = parsed.continuityGraphV2
    ? parseSequenceAnimaticGraphV2(parsed.continuityGraphV2)
    : sequenceAnimaticEmptyGraphV2(input.continuityPlannerContext)
  const shotBindings = { ...rawGraph.shotBindings, ...parsed.shotBindings }
  const normalizedShots = rawShots.map((shot, index) => normalizeSequenceAnimaticDirectorShot({
    shot,
    fallbackShot: manifestShotById.get(readText(shot.id)) ?? manifestShots[index],
    index,
    blockIdByShotId,
    shotBindings,
    helpers: input.helpers,
  }))
  const missingBindings = normalizedShots
    .map((shot) => readText(shot.id))
    .filter((shotId) => !readText(asRecord(shotBindings[shotId]).setId) && !readText(asRecord(shotBindings[shotId]).worldLocationRefId))
  const missingBindingWarnings = missingBindings.length > 0
    ? [`Repaired shot continuity plan non-blockingly: ${missingBindings.length} shot${missingBindings.length === 1 ? '' : 's'} still lack a set/location binding after deterministic repair (${missingBindings.slice(0, 8).join(', ')}).`]
    : []
  const continuityGraphV2 = sequenceAnimaticContinuityGraphV2Schema.parse({
    ...rawGraph,
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'block_graph_v2',
    shotBindings: {
      ...rawGraph.shotBindings,
      ...shotBindings,
    },
    warnings: [...readStringArray(rawGraph.warnings), ...parsed.warnings, ...missingBindingWarnings],
    diagnostics: [...readStringArray(rawGraph.diagnostics), ...parsed.diagnostics],
  })
  const normalizedShotIds = new Set(normalizedShots.map((shot) => shot.id))
  const blocks = parsed.blocks.map((block, index) => ({
    ...block,
    id: readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`,
    index: Number(block.index ?? index + 1) || index + 1,
    title: readText(block.title) || readText(block.summary) || `Storyboard block ${index + 1}`,
    summary: readText(block.summary),
    shotIds: readStringArray(block.shotIds ?? block.shot_ids).filter((shotId) => normalizedShotIds.has(shotId)),
    status: readText(block.status) === 'needs_review' || readText(block.status) === 'failed' ? readText(block.status) : 'planned',
    warnings: readStringArray(block.warnings),
  }))
  if (blocks.some((block) => block.shotIds.length === 0)) {
    throw new Error('Sequence animatic shot continuity plan returned a storyboard block without valid shotIds.')
  }
  const scriptHash = input.helpers.hashOutputWorkflowValue(input.manifest.screenplayDraft ?? input.manifest.screenplayMarkdown ?? {})
  const shotPlanHash = input.helpers.hashOutputWorkflowValue({ shots: normalizedShots, blocks })
  return sequenceAnimaticDirectorPlanSchema.parse({
    ...parsed,
    role: 'sequence_animatic_director_plan',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    contractVersion: parsed.contractVersion || (parsedV2.success ? 'shot_continuity_plan_v2' : ''),
    masterRequestId: readText(input.manifest.requestId) || null,
    masterManifestArtifactKey: input.masterManifestArtifactKey,
    manifestHash: input.manifestHash,
    scriptHash,
    shotPlanHash,
    planningMode: parsed.planningMode,
    shots: normalizedShots,
    blocks,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings: continuityGraphV2.shotBindings,
    shot_bindings: continuityGraphV2.shotBindings,
    diagnostics: [
      ...parsed.diagnostics,
      ...missingBindingWarnings,
      `Director plan normalized ${normalizedShots.length} shot${normalizedShots.length === 1 ? '' : 's'} across ${blocks.length} block${blocks.length === 1 ? '' : 's'}.`,
    ],
  })
}
