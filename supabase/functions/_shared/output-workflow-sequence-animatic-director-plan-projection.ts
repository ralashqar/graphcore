import { z } from 'zod'
import {
  sequenceAnimaticContinuityGraphAngleSchema,
  sequenceAnimaticContinuityGraphSetSchema,
  sequenceAnimaticContinuityGraphSpotSchema,
  sequenceAnimaticContinuityGraphV2Schema,
  sequenceAnimaticContinuityGraphZoneSchema,
  sequenceAnimaticContinuityPlannerAnchorSchema,
  sequenceAnimaticContinuityShotBindingSchema,
  sequenceAnimaticShotContinuityPlanV2Schema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'
import {
  normalizeSequenceAnimaticCoverageSetup,
} from './output-workflow-sequence-animatic-shot-continuity-plan-runtime.ts'
import type {
  SequenceAnimaticShotRefs,
} from './output-workflow-sequence-animatic-shot-binding-runtime.ts'

export type SequenceAnimaticDirectorPlanProjectionHelpers = {
  sequenceAnimaticShotRefs: (shot: Record<string, unknown>, fallback?: Record<string, unknown>) => SequenceAnimaticShotRefs
  sequenceAnimaticShotBindingFromSceneBinding: (input: {
    shotId: string
    storyboardBlockId: string
    sceneBinding: Record<string, unknown>
    refs: SequenceAnimaticShotRefs
  }) => z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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

function titleFromRefLike(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function mergeById<T extends { id: string; shotIds?: string[]; storyboardBlockIds?: string[] }>(
  existing: T[] = [],
  incoming: T[] = [],
) {
  const byId = new Map<string, T>()
  for (const entry of existing) if (entry.id) byId.set(entry.id, entry)
  for (const entry of incoming) {
    if (!entry.id) continue
    const previous = byId.get(entry.id)
    byId.set(entry.id, previous
      ? {
        ...previous,
        ...entry,
        shotIds: [...new Set([...(previous.shotIds ?? []), ...(entry.shotIds ?? [])])],
        storyboardBlockIds: [...new Set([...(previous.storyboardBlockIds ?? []), ...(entry.storyboardBlockIds ?? [])])],
      }
      : entry)
  }
  return [...byId.values()]
}

function sequenceAnimaticNodeUsageFromBindings(nodeId: string, shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>>) {
  const shotIds: string[] = []
  const blockIds: string[] = []
  for (const [shotId, binding] of Object.entries(shotBindings)) {
    if (binding.setId === nodeId || binding.zoneId === nodeId || binding.primarySpotId === nodeId || binding.spotIds.includes(nodeId) || binding.viewpointId === nodeId || binding.angleId === nodeId || binding.assetAnchorIds.includes(nodeId)) {
      shotIds.push(shotId)
      if (binding.storyboardBlockId) blockIds.push(binding.storyboardBlockId)
    }
  }
  return {
    shotIds: [...new Set(shotIds)],
    storyboardBlockIds: [...new Set(blockIds)],
  }
}

function sequenceAnimaticEnrichGraphNodeUsage<T extends Record<string, unknown>>(
  node: T,
  shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>>,
): T {
  const nodeId = readText(node.id)
  const usage = nodeId ? sequenceAnimaticNodeUsageFromBindings(nodeId, shotBindings) : { shotIds: [], storyboardBlockIds: [] }
  return {
    ...node,
    shotIds: [...new Set([...readStringArray(node.shotIds), ...usage.shotIds])],
    storyboardBlockIds: [...new Set([...readStringArray(node.storyboardBlockIds), ...readStringArray(node.blockIds), ...usage.storyboardBlockIds])],
  }
}

function sequenceAnimaticPlannerAnchorTypeFromLocalReference(typeInput: unknown): z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>['type'] {
  const type = readText(typeInput)
  if (type === 'temp_character' || type === 'faction' || type === 'crowd') return 'character'
  if (type === 'location_spot') return 'location_spot'
  return 'prop'
}

function sequenceAnimaticLocalReferencesToAssetAnchors(input: {
  localReferences: Record<string, unknown>[]
  shots: Record<string, unknown>[]
  shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>>
  helpers: SequenceAnimaticDirectorPlanProjectionHelpers
}) {
  const usageById = new Map<string, { shotIds: Set<string>; blockIds: Set<string> }>()
  const touch = (id: string, shotId: string, blockId: string) => {
    if (!id) return
    const usage = usageById.get(id) ?? { shotIds: new Set<string>(), blockIds: new Set<string>() }
    if (shotId) usage.shotIds.add(shotId)
    if (blockId) usage.blockIds.add(blockId)
    usageById.set(id, usage)
  }
  for (const shot of input.shots) {
    const shotId = readText(shot.id)
    const binding = input.shotBindings[shotId]
    const blockId = readText(shot.storyboardBlockId) || readText(shot.blockId) || readText(binding?.storyboardBlockId)
    const refs = input.helpers.sequenceAnimaticShotRefs(shot)
    refs.localReferenceIds.forEach((id) => touch(id, shotId, blockId))
    readStringArray(asRecord(shot.sceneBinding).localReferenceIds ?? asRecord(shot.scene_binding).local_reference_ids).forEach((id) => touch(id, shotId, blockId))
    binding?.assetAnchorIds.forEach((id) => touch(id, shotId, blockId))
  }
  return input.localReferences.map((reference) => {
    const id = readText(reference.id)
    const usage = usageById.get(id)
    const shotIds = [...new Set([...readStringArray(reference.usedShotIds ?? reference.shotIds), ...(usage ? [...usage.shotIds] : [])])]
    const storyboardBlockIds = [...new Set([...readStringArray(reference.blockIds ?? reference.storyboardBlockIds), ...(usage ? [...usage.blockIds] : [])])]
    return sequenceAnimaticContinuityPlannerAnchorSchema.parse({
      id,
      type: sequenceAnimaticPlannerAnchorTypeFromLocalReference(reference.type),
      name: readText(reference.name) || titleFromRefLike(id),
      visualBrief: readText(reference.visualBrief) || readText(reference.summary) || `Animatic local reference ${titleFromRefLike(id)}.`,
      persistenceReason: readText(reference.persistenceReason) || readText(reference.reason) || 'Needed as an animatic-specific continuity reference.',
      confidence: Number.isFinite(Number(reference.confidence)) ? Number(reference.confidence) : 0.8,
      shotIds,
      storyboardBlockIds,
      sourceEvidence: readStringArray(reference.sourceEvidence ?? reference.sourceReferenceIds),
      baseLocationRefId: readText(reference.baseLocationRefId ?? reference.parentNodeId) || null,
      setId: readText(reference.setId) || null,
      angleId: readText(reference.angleId) || null,
      rejectionRisk: readText(reference.importance) === 'incidental' ? 'single_use_not_story_critical' : '',
    })
  }).filter((anchor) => readText(anchor.id))
}

function sequenceAnimaticAssetRequirementsFromGraph(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  localReferences: Record<string, unknown>[]
}) {
  const nodeRequirements = [
    ...input.graph.locationSets.map((node) => ({ node, assetType: 'location_zone' })),
    ...input.graph.zones.map((node) => ({ node, assetType: 'location_zone' })),
    ...input.graph.spots.map((node) => ({ node, assetType: 'location_spot' })),
    ...input.graph.angles.map((node) => ({ node, assetType: 'location_angle' })),
    ...input.graph.assetAnchors.map((node) => ({
      node,
      assetType: node.type === 'character' ? 'temporary_character' : node.type === 'prop' ? 'prop' : 'location_spot',
    })),
  ]
  const localRequiredById = new Map(input.localReferences.map((reference) => [readText(reference.id), reference.required === true || readText(reference.importance) === 'hero'] as const))
  return nodeRequirements
    .filter(({ node }) => readText(node.id) && (readText(node.visualBrief) || readText(asRecord(node).name)))
    .map(({ node, assetType }) => ({
      id: `asset_req_${slugify(readText(node.id))}`,
      sceneGraphNodeId: readText(node.id),
      nodeId: readText(node.id),
      type: assetType,
      assetType,
      required: localRequiredById.get(readText(node.id)) === true || readStringArray(asRecord(node).shotIds).length >= 2,
      priority: localRequiredById.get(readText(node.id)) === true ? 'required' : 'supporting',
      visualBrief: readText(node.visualBrief),
      shotIds: readStringArray(asRecord(node).shotIds),
      blockIds: readStringArray(asRecord(node).storyboardBlockIds),
    }))
}

export function projectShotContinuityPlanV2ToDirectorPlan(
  value: z.infer<typeof sequenceAnimaticShotContinuityPlanV2Schema>,
  helpers: SequenceAnimaticDirectorPlanProjectionHelpers,
) {
  const blockIdByShotId = new Map<string, string>()
  for (const block of value.blocks) {
    for (const shotId of block.shotIds) blockIdByShotId.set(shotId, block.id)
  }
  const shots = value.shots.map((shot) => {
    const blockId = shot.blockId || blockIdByShotId.get(shot.id) || ''
    const coverageSetupId = readText(shot.coverageSetupId) || readText(shot.coverage_setup_id)
    const continuityLink = asRecord(shot.continuityLink ?? shot.continuity_link)
    const refs = {
      ...shot.refs,
      speakerRefIds: [...new Set([...shot.refs.speakerRefIds, ...shot.dialogue.map((line) => line.speakerRefId)])],
      visibleCharacterRefIds: [...new Set([...shot.refs.visibleCharacterRefIds, ...shot.performance.map((beat) => beat.characterRefId)])],
    }
    return {
      ...shot,
      blockId,
      storyboardBlockId: blockId,
      coverageSetupId,
      coverage_setup_id: coverageSetupId,
      continuityLink,
      continuity_link: continuityLink,
      editorialDurationSeconds: shot.durationSeconds,
      visibleCharacterRefIds: refs.visibleCharacterRefIds,
      speakerRefIds: refs.speakerRefIds,
      propRefIds: refs.propRefIds,
      locationRefIds: refs.locationRefIds,
      continuityAnchorIds: [...new Set([...refs.localReferenceIds, ...shot.sceneBinding.localReferenceIds, ...shot.sceneBinding.assetAnchorIds])],
      refs,
      sceneGraphBinding: shot.sceneBinding,
      performanceBeats: shot.performance,
      assetRequirements: [],
      warnings: [],
    }
  })
  const shotBindings = Object.fromEntries(shots.map((shot) => {
    const refs = helpers.sequenceAnimaticShotRefs(shot)
    const binding = helpers.sequenceAnimaticShotBindingFromSceneBinding({
      shotId: readText(shot.id),
      storyboardBlockId: readText(shot.storyboardBlockId),
      sceneBinding: asRecord(shot.sceneBinding),
      refs,
    })
    return [binding.shotId, binding]
  }))
  const graphInput = value.sceneGraphAdditions
  const locationSets = graphInput.sets.map((node) => sequenceAnimaticContinuityGraphSetSchema.parse(sequenceAnimaticEnrichGraphNodeUsage(node, shotBindings)))
  const zones = graphInput.zones.map((node) => sequenceAnimaticContinuityGraphZoneSchema.parse(sequenceAnimaticEnrichGraphNodeUsage(node, shotBindings)))
  const spots = graphInput.spots.map((node) => sequenceAnimaticContinuityGraphSpotSchema.parse(sequenceAnimaticEnrichGraphNodeUsage(node, shotBindings)))
  const viewpoints = mergeById(graphInput.viewpoints, graphInput.angles).map((node) => sequenceAnimaticContinuityGraphAngleSchema.parse(sequenceAnimaticEnrichGraphNodeUsage(node, shotBindings)))
  const angles = viewpoints
  const assetAnchors = sequenceAnimaticLocalReferencesToAssetAnchors({
    localReferences: value.localReferences.map(asRecord),
    shots,
    shotBindings,
    helpers,
  })
  const continuityGraphV2 = sequenceAnimaticContinuityGraphV2Schema.parse({
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'block_graph_v2',
    worldLocationRefs: [],
    locationSets,
    zones,
    spots,
    viewpoints,
    angles,
    edges: graphInput.edges,
    shotBindings,
    assetAnchors,
    rejectedCandidates: [],
    blockSummaries: value.blocks.map((block) => ({
      blockId: block.id,
      summary: block.summary,
      status: 'planned',
    })),
    warnings: [],
    diagnostics: ['Projected shot_continuity_plan_v2 into compatibility continuityGraphV2.'],
  })
  const assetRequirements = sequenceAnimaticAssetRequirementsFromGraph({
    graph: continuityGraphV2,
    localReferences: value.localReferences.map(asRecord),
  })
  const coverageSetups = value.coverageSetups.map(normalizeSequenceAnimaticCoverageSetup)
  const coverageSetupByShotId = Object.fromEntries(shots
    .map((shot) => [readText(shot.id), readText(shot.coverageSetupId)] as const)
    .filter(([shotId, setupId]) => Boolean(shotId && setupId)))
  return {
    ...value,
    shots,
    coverageSetups,
    coverage_setups: coverageSetups,
    coverageSetupByShotId,
    coverage_setup_by_shot_id: coverageSetupByShotId,
    blocks: value.blocks.map((block) => ({
      ...block,
      status: 'planned',
      warnings: [],
    })),
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings,
    shot_bindings: shotBindings,
    assetRequirements,
    asset_requirements: assetRequirements,
    outputLocalReferences: value.localReferences,
    output_local_references: value.localReferences,
    warnings: [],
    diagnostics: [
      ...value.notes.map((note) => `Note: ${note}`),
      'Shot continuity v2 used shot-level sceneBinding as source of truth.',
    ],
  }
}
