import { z } from 'zod'
import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readText).filter(Boolean)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item'
}

function compactStoryboardSentence(value: unknown, fallback = '', maxWords = 24): string {
  const words = (readText(value) || fallback).replace(/\s+/g, ' ').split(' ').filter(Boolean)
  return words.slice(0, Math.max(1, maxWords)).join(' ')
}

function sequenceAnimaticUniqueTexts(values: unknown[]): string[] {
  const result: string[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const text = readText(value)
    if (text && !result.includes(text)) result.push(text)
  }
  values.forEach(visit)
  return result
}

export function normalizeSequenceAnimaticCoverageSetupKind(value: unknown) {
  const normalized = readText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'wide' || normalized === 'master' || normalized === 'establishing_master') return 'wide_master'
  if (normalized === 'over_the_shoulder' || normalized === 'over_shoulder' || normalized === 'ots') return 'ots_a_to_b'
  if (normalized === 'reverse' || normalized === 'reverse_ots') return 'ots_b_to_a'
  if (normalized === 'single' || normalized === 'clean_single_a' || normalized === 'clean_single_b') return 'clean_single'
  if (normalized === 'two-shot') return 'two_shot'
  if (normalized === 'cutaway') return 'insert'
  if (normalized === 'move' || normalized === 'moving') return 'movement'
  if (normalized === 'new_position') return 'blocking_change'
  if (['wide_master', 'ots_a_to_b', 'ots_b_to_a', 'clean_single', 'two_shot', 'insert', 'movement', 'blocking_change', 'viewpoint'].includes(normalized)) return normalized
  return 'other'
}

export function normalizeSequenceAnimaticCoverageContinuityMode(value: unknown) {
  const normalized = readText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['same_setup', 'reverse_angle', 'blocking_change', 'match_action', 'new_setup', 'insert_cutaway', 'new_scene'].includes(normalized)) return normalized
  if (normalized === 'reverse') return 'reverse_angle'
  if (normalized === 'same' || normalized === 'return_to_setup') return 'same_setup'
  if (normalized === 'new_position') return 'blocking_change'
  return 'new_setup'
}

export const sequenceAnimaticShotContinuityCoverageSetupV2Schema = z.object({
  id: z.string().min(1),
  sceneId: z.string().default(''),
  scene_id: z.string().default(''),
  setupKind: z.preprocess(normalizeSequenceAnimaticCoverageSetupKind, z.enum(['wide_master', 'ots_a_to_b', 'ots_b_to_a', 'clean_single', 'two_shot', 'insert', 'movement', 'blocking_change', 'viewpoint', 'other'])).default('other'),
  setup_kind: z.string().default(''),
  title: z.string().default(''),
  setId: z.string().default(''),
  set_id: z.string().default(''),
  zoneId: z.string().default(''),
  zone_id: z.string().default(''),
  primarySpotId: z.string().default(''),
  primary_spot_id: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  spot_ids: z.array(z.string()).default([]),
  viewpointId: z.string().default(''),
  viewpoint_id: z.string().default(''),
  characterRefIds: z.array(z.string()).default([]),
  character_ref_ids: z.array(z.string()).default([]),
  screenDirection: z.string().default(''),
  screen_direction: z.string().default(''),
  camera: z.object({
    framing: z.string().default(''),
    angle: z.string().default(''),
    lens: z.string().default(''),
    movement: z.string().default(''),
    screenDirectionRule: z.string().default(''),
  }).default({ framing: '', angle: '', lens: '', movement: '', screenDirectionRule: '' }),
  lighting: z.string().default(''),
  stagingBrief: z.string().default(''),
  staging_brief: z.string().default(''),
  continuityFromSetupId: z.string().default(''),
  continuity_from_setup_id: z.string().default(''),
  continuityMode: z.preprocess(normalizeSequenceAnimaticCoverageContinuityMode, z.enum(['same_setup', 'reverse_angle', 'blocking_change', 'match_action', 'new_setup', 'insert_cutaway', 'new_scene'])).default('new_setup'),
  continuity_mode: z.string().default(''),
  usedShotIds: z.array(z.string()).default([]),
  used_shot_ids: z.array(z.string()).default([]),
  blockIds: z.array(z.string()).default([]),
  block_ids: z.array(z.string()).default([]),
  required: z.boolean().default(false),
})

export const sequenceAnimaticCoveragePlanSchema = z.object({
  role: z.literal('sequence_animatic_coverage_plan').default('sequence_animatic_coverage_plan'),
  contractVersion: z.literal('coverage_plan_v1').default('coverage_plan_v1'),
  graphSpecVersion: z.literal('sequence_animatic_graph_v2').default('sequence_animatic_graph_v2'),
  coverageSetups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverageSetupByShotId: z.record(z.string(), z.string()).default({}),
  diagnostics: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
})

export const sequenceAnimaticCoveragePlanLlmSchema = z.object({
  coverageSetups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverageSetupByShotId: z.record(z.string(), z.string()).default({}),
  diagnostics: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
})

const sequenceAnimaticCoverageDirectorPlanSchema = z.object({
  shots: z.array(z.record(z.string(), z.unknown())).default([]),
  blocks: z.array(z.record(z.string(), z.unknown())).default([]),
  coverageSetups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverage_setups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  coverageSetupByShotId: z.record(z.string(), z.string()).default({}),
  coverage_setup_by_shot_id: z.record(z.string(), z.string()).default({}),
  diagnostics: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
}).catchall(z.unknown())

export function sequenceAnimaticCoverageShotRefs(shot: LooseRecord) {
  const refs = asRecord(shot.refs ?? shot.references)
  return {
    visibleCharacterRefIds: sequenceAnimaticUniqueTexts([
      refs.visibleCharacterRefIds,
      refs.visible_character_ref_ids,
      shot.visibleCharacterRefIds,
      shot.visible_character_ref_ids,
      readArray(shot.performance ?? shot.performanceBeats).map((beat) => readText(asRecord(beat).characterRefId ?? asRecord(beat).character_ref_id)),
    ]),
    propRefIds: sequenceAnimaticUniqueTexts([
      refs.propRefIds,
      refs.prop_ref_ids,
      refs.itemRefIds,
      refs.item_ref_ids,
      shot.propRefIds,
      shot.prop_ref_ids,
      shot.itemRefIds,
      shot.item_ref_ids,
    ]),
    localReferenceIds: sequenceAnimaticUniqueTexts([
      refs.localReferenceIds,
      refs.local_reference_ids,
      asRecord(shot.sceneBinding ?? shot.scene_binding).localReferenceIds,
      asRecord(shot.sceneBinding ?? shot.scene_binding).local_reference_ids,
      shot.continuityAnchorIds,
      shot.continuity_anchor_ids,
    ]),
  }
}

export function sequenceAnimaticCoverageSpatialFields(shot: LooseRecord) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.sceneGraphBinding ?? shot.scene_graph_binding)
  const spotIds = sequenceAnimaticUniqueTexts([
    binding.spotIds,
    binding.spot_ids,
    shot.spotIds,
    shot.spot_ids,
    shot.continuitySpotIds,
    shot.continuity_spot_ids,
  ])
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id) || spotIds[0] || ''
  return {
    setId: readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id),
    zoneId: readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id),
    primarySpotId,
    spotIds: sequenceAnimaticUniqueTexts([primarySpotId, spotIds]),
    viewpointId: readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
  }
}

function sequenceAnimaticCoverageCameraSignature(shot: LooseRecord) {
  const camera = asRecord(shot.camera)
  return [
    readText(camera.framing).toLowerCase(),
    readText(camera.angle).toLowerCase(),
    readText(camera.lens).toLowerCase(),
    readText(camera.movement).toLowerCase(),
    readText(camera.screenDirectionRule ?? camera.screen_direction_rule).toLowerCase(),
  ].join('|')
}

function sequenceAnimaticCoverageSetupKindForShot(shot: LooseRecord) {
  const camera = asRecord(shot.camera)
  const framing = readText(camera.framing).toLowerCase()
  const movement = readText(camera.movement).toLowerCase()
  const action = readText(shot.action).toLowerCase()
  const subjects = sequenceAnimaticCoverageShotRefs(shot).visibleCharacterRefIds
  if (/wide|master|establish|long/.test(framing)) return 'wide_master'
  if (/insert|detail|cutaway/.test(framing) || /insert|detail|object|hand|feet|cord|bell|paper|marker/.test(action)) return 'insert'
  if (/track|dolly|pan|tilt|drift|follow|move|push/.test(movement)) return 'movement'
  if (subjects.length >= 2 && /two|2-shot|two shot|medium|wide/.test(framing)) return 'two_shot'
  if (subjects.length === 1) return 'clean_single'
  return 'other'
}

function sequenceAnimaticCoverageGroupingKey(shot: LooseRecord) {
  const spatial = sequenceAnimaticCoverageSpatialFields(shot)
  const refs = sequenceAnimaticCoverageShotRefs(shot)
  return sequenceAnimaticStableHash({
    setId: spatial.setId,
    zoneId: spatial.zoneId,
    primarySpotId: spatial.primarySpotId,
    viewpointId: spatial.viewpointId,
    camera: sequenceAnimaticCoverageCameraSignature(shot),
    subjects: [...refs.visibleCharacterRefIds, ...refs.localReferenceIds, ...refs.propRefIds].sort(),
  }).slice(0, 10)
}

function sequenceAnimaticCoverageSetupForShotGroup(input: {
  groupKey: string
  shots: LooseRecord[]
  proposedSetup?: LooseRecord | null
}) {
  const firstShot = input.shots[0] ?? {}
  const spatial = sequenceAnimaticCoverageSpatialFields(firstShot)
  const refs = sequenceAnimaticCoverageShotRefs(firstShot)
  const camera = asRecord(firstShot.camera)
  const shotIds = input.shots.map((shot) => readText(shot.id)).filter(Boolean)
  const blockIds = sequenceAnimaticUniqueTexts(input.shots.map((shot) => readText(shot.blockId ?? shot.storyboardBlockId)).filter(Boolean))
  const proposed = asRecord(input.proposedSetup)
  const setupKind = normalizeSequenceAnimaticCoverageSetupKind(readText(proposed.setupKind ?? proposed.setup_kind) || sequenceAnimaticCoverageSetupKindForShot(firstShot))
  const baseId = readText(proposed.id).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  const id = baseId && shotIds.every((shotId) => readStringArray(proposed.usedShotIds ?? proposed.used_shot_ids).includes(shotId))
    ? baseId
    : `coverage_${slugify(readText(firstShot.sourceSceneId ?? firstShot.sceneId) || readText(firstShot.blockId ?? firstShot.storyboardBlockId) || 'scene')}_${input.groupKey}`
  const screenDirection = readText(proposed.screenDirection ?? proposed.screen_direction)
    || readText(camera.screenDirectionRule ?? camera.screen_direction_rule)
  return sequenceAnimaticShotContinuityCoverageSetupV2Schema.parse({
    id,
    sceneId: readText(firstShot.sourceSceneId ?? firstShot.sceneId),
    setupKind,
    title: readText(proposed.title)
      || `${setupKind.replace(/_/g, ' ')} ${shotIds.length === 1 ? readText(firstShot.title) || shotIds[0] : `${shotIds.length} shots`}`,
    setId: spatial.setId,
    zoneId: spatial.zoneId,
    primarySpotId: spatial.primarySpotId,
    spotIds: spatial.spotIds,
    viewpointId: spatial.viewpointId,
    characterRefIds: refs.visibleCharacterRefIds,
    screenDirection,
    camera: {
      framing: readText(camera.framing),
      angle: readText(camera.angle),
      lens: readText(camera.lens),
      movement: readText(camera.movement),
      screenDirectionRule: readText(camera.screenDirectionRule ?? camera.screen_direction_rule),
    },
    lighting: readText(firstShot.lighting) || readText(proposed.lighting),
    stagingBrief: readText(proposed.stagingBrief ?? proposed.staging_brief)
      || compactStoryboardSentence(readText(firstShot.action), '', 28),
    continuityMode: shotIds.length > 1 ? 'same_setup' : 'new_setup',
    usedShotIds: shotIds,
    blockIds,
    required: true,
  })
}

export function normalizeSequenceAnimaticCoveragePlan(input: {
  directorPlan: LooseRecord
  proposedPlan?: LooseRecord
}) {
  const directorPlan = sequenceAnimaticCoverageDirectorPlanSchema.parse(input.directorPlan)
  const shots = readArray(directorPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
  const proposed = sequenceAnimaticCoveragePlanLlmSchema.safeParse(input.proposedPlan ?? {})
  const proposedPlan = proposed.success ? proposed.data : { coverageSetups: [], coverageSetupByShotId: {}, diagnostics: [], warnings: [] }
  const proposedSetupById = new Map(proposedPlan.coverageSetups.map((setup) => [readText(setup.id), setup] as const).filter(([id]) => id))
  const groups = new Map<string, LooseRecord[]>()
  for (const shot of shots) {
    const proposedSetupId = readText(proposedPlan.coverageSetupByShotId[readText(shot.id)])
    const proposedSetup = proposedSetupId ? proposedSetupById.get(proposedSetupId) ?? null : null
    const proposedCompatibleSeed = proposedSetup
      ? sequenceAnimaticStableHash({
        proposedSetupId,
        spatial: sequenceAnimaticCoverageSpatialFields(shot),
        camera: sequenceAnimaticCoverageCameraSignature(shot),
        subjects: sequenceAnimaticCoverageShotRefs(shot),
      }).slice(0, 10)
      : ''
    const groupKey = proposedCompatibleSeed || sequenceAnimaticCoverageGroupingKey(shot)
    const list = groups.get(groupKey) ?? []
    list.push(shot)
    groups.set(groupKey, list)
  }
  const coverageSetups = [...groups.entries()].map(([groupKey, groupShots]) => {
    const firstShot = groupShots[0] ?? {}
    const proposedSetupId = readText(proposedPlan.coverageSetupByShotId[readText(firstShot.id)])
    return sequenceAnimaticCoverageSetupForShotGroup({
      groupKey,
      shots: groupShots,
      proposedSetup: proposedSetupId ? proposedSetupById.get(proposedSetupId) ?? null : null,
    })
  })
  const coverageSetupByShotId = Object.fromEntries(coverageSetups.flatMap((setup) =>
    readStringArray(setup.usedShotIds).map((shotId) => [shotId, setup.id] as const),
  ))
  const shotsWithCoverage = shots.map((shot) => {
    const shotId = readText(shot.id)
    const setupId = readText(coverageSetupByShotId[shotId])
    return {
      ...shot,
      coverageSetupId: setupId,
      coverage_setup_id: setupId,
      continuityLink: {
        ...asRecord(shot.continuityLink ?? shot.continuity_link),
        mode: readText(asRecord(shot.continuityLink ?? shot.continuity_link).mode) || 'new_setup',
        fromSetupId: readText(asRecord(shot.continuityLink ?? shot.continuity_link).fromSetupId ?? asRecord(shot.continuityLink ?? shot.continuity_link).from_setup_id),
      },
      continuity_link: {
        ...asRecord(shot.continuityLink ?? shot.continuity_link),
        mode: readText(asRecord(shot.continuityLink ?? shot.continuity_link).mode) || 'new_setup',
        fromSetupId: readText(asRecord(shot.continuityLink ?? shot.continuity_link).fromSetupId ?? asRecord(shot.continuityLink ?? shot.continuity_link).from_setup_id),
      },
    }
  })
  const diagnostics = [
    ...readStringArray(proposedPlan.diagnostics),
    `Coverage planner finalized ${coverageSetups.length} setup${coverageSetups.length === 1 ? '' : 's'} for ${shots.length} shot${shots.length === 1 ? '' : 's'}.`,
    proposed.success ? 'Coverage planner LLM proposal was validated and normalized.' : 'Coverage planner used deterministic fallback because no valid LLM proposal was available.',
  ]
  const finalized = sequenceAnimaticCoverageDirectorPlanSchema.parse({
    ...directorPlan,
    shots: shotsWithCoverage,
    coverageSetups,
    coverage_setups: coverageSetups,
    coverageSetupByShotId,
    coverage_setup_by_shot_id: coverageSetupByShotId,
    diagnostics: [...readStringArray(directorPlan.diagnostics), ...diagnostics],
    warnings: [...readStringArray(directorPlan.warnings), ...readStringArray(proposedPlan.warnings)],
  })
  return sequenceAnimaticCoveragePlanSchema.parse({
    coverageSetups,
    coverageSetupByShotId,
    diagnostics,
    warnings: readStringArray(finalized.warnings),
  })
}

export function applySequenceAnimaticCoveragePlanToDirectorPlan(input: {
  directorPlan: LooseRecord
  coveragePlan: LooseRecord
}) {
  const directorPlan = sequenceAnimaticCoverageDirectorPlanSchema.parse(input.directorPlan)
  const coveragePlan = sequenceAnimaticCoveragePlanSchema.parse(input.coveragePlan)
  const shots = readArray(directorPlan.shots).map(asRecord).map((shot) => {
    const shotId = readText(shot.id)
    const setupId = readText(coveragePlan.coverageSetupByShotId[shotId])
    return {
      ...shot,
      coverageSetupId: setupId,
      coverage_setup_id: setupId,
    }
  })
  return sequenceAnimaticCoverageDirectorPlanSchema.parse({
    ...directorPlan,
    shots,
    coverageSetups: coveragePlan.coverageSetups,
    coverage_setups: coveragePlan.coverageSetups,
    coverageSetupByShotId: coveragePlan.coverageSetupByShotId,
    coverage_setup_by_shot_id: coveragePlan.coverageSetupByShotId,
    shotPlanHash: sequenceAnimaticStableHash({
      shots,
      blocks: directorPlan.blocks,
      coverageSetups: coveragePlan.coverageSetups,
      coverageSetupByShotId: coveragePlan.coverageSetupByShotId,
    }),
    diagnostics: [
      ...readStringArray(directorPlan.diagnostics),
      ...coveragePlan.diagnostics.map((entry) => `Coverage plan: ${entry}`),
    ],
    warnings: [...readStringArray(directorPlan.warnings), ...coveragePlan.warnings],
  })
}
