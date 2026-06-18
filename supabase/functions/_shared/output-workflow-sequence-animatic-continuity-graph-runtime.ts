import { z } from 'zod'
import {
  continuityAssetStateSchema,
  continuityVisualDependencyEdgeSchema,
  hashOutputWorkflowValue,
} from '../../../src/domain/outputWorkflow.ts'
import {
  sequenceAnimaticContinuityGraphV2Schema,
  sequenceAnimaticContinuityGraphAngleSchema,
  sequenceAnimaticContinuityGraphEdgeSchema,
  sequenceAnimaticContinuityGraphSetSchema,
  sequenceAnimaticContinuityGraphSpotSchema,
  sequenceAnimaticContinuityGraphZoneSchema,
  sequenceAnimaticContinuityLocationAngleSchema,
  sequenceAnimaticContinuityLocationSetSchema,
  sequenceAnimaticContinuityPlannerAnchorSchema,
  sequenceAnimaticContinuityRejectedCandidateSchema,
  sequenceAnimaticContinuityShotBindingSchema,
  sequenceAnimaticContinuityWorldLocationRefSchema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'

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
  return readArray(value).map(readText).filter(Boolean)
}

function compactSequenceAnimaticText(value: unknown, maxLength = 900) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

export const sequenceAnimaticContinuityBlockDeltaSchema = z.object({
  blockId: z.string(),
  blockSummary: z.string().default(''),
  worldLocationRefs: z.array(sequenceAnimaticContinuityWorldLocationRefSchema).default([]),
  locationSets: z.array(sequenceAnimaticContinuityGraphSetSchema).default([]),
  zones: z.array(sequenceAnimaticContinuityGraphZoneSchema).default([]),
  spots: z.array(sequenceAnimaticContinuityGraphSpotSchema).default([]),
  angles: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  edges: z.array(sequenceAnimaticContinuityGraphEdgeSchema).default([]),
  shotBindings: z.record(z.string(), sequenceAnimaticContinuityShotBindingSchema).default({}),
  assetAnchors: z.array(sequenceAnimaticContinuityPlannerAnchorSchema).default([]),
  rejectedCandidates: z.array(sequenceAnimaticContinuityRejectedCandidateSchema).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityAssetStateSchema = continuityAssetStateSchema
export const sequenceAnimaticContinuityVisualDependencyEdgeSchema = continuityVisualDependencyEdgeSchema

export function sequenceAnimaticGraphLocationRefsFromContext(context: Record<string, unknown>) {
  return readArray(context.existingWorldReferences).map(asRecord)
    .filter((entry) => /\b(place|location|environment|set)\b/i.test(readText(entry.type)))
    .map((entry) => ({
      id: readText(entry.key),
      name: readText(entry.name) || readText(entry.key),
      summary: compactSequenceAnimaticText(entry.summary, 360),
      visualSummary: compactSequenceAnimaticText(entry.visualSummary, 420),
    }))
    .filter((entry, index, values) => entry.id && values.findIndex((candidate) => candidate.id === entry.id) === index)
}

export function sequenceAnimaticEmptyGraphV2(context: Record<string, unknown> = {}) {
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    version: 'sequence_animatic_continuity_graph_v2',
    planningMode: 'block_graph_v2',
    worldLocationRefs: sequenceAnimaticGraphLocationRefsFromContext(context),
    locationSets: [],
    zones: [],
    spots: [],
    viewpoints: [],
    angles: [],
    edges: [],
    shotBindings: {},
    assetAnchors: [],
    rejectedCandidates: [],
    blockSummaries: [],
    warnings: [],
    diagnostics: [],
  })
}

export function sequenceAnimaticBlockShots(context: Record<string, unknown>, block: Record<string, unknown>) {
  const explicitShotIds = readStringArray(block.shotIds)
  const shotIds = new Set(explicitShotIds.length > 0 ? explicitShotIds : readStringArray(block.shotBreakIds))
  const shots = readArray(context.shots).map(asRecord)
  return shotIds.size > 0 ? shots.filter((shot) => shotIds.has(readText(shot.id))) : shots
}

export function emptySequenceAnimaticContinuityBlockDelta(blockId: string, warning = '') {
  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    blockId,
    blockSummary: '',
    worldLocationRefs: [],
    locationSets: [],
    zones: [],
    spots: [],
    angles: [],
    edges: [],
    shotBindings: {},
    assetAnchors: [],
    rejectedCandidates: [],
    warnings: warning ? [warning] : [],
    diagnostics: [],
  })
}

export function sequenceAnimaticContinuityGraphStatusFromBlockStates(blockStates: Record<string, unknown>) {
  const states = Object.values(blockStates).map(asRecord)
  if (states.some((state) => readText(state.status) === 'failed')) return 'failed'
  if (states.some((state) => readText(state.status) === 'stale')) return 'stale'
  if (states.some((state) => readText(state.status) === 'ready' || readText(state.status) === 'needs_review')) return 'partial'
  if (states.some((state) => readText(state.status) === 'seeded')) return 'partial'
  return 'empty'
}

export function sequenceAnimaticGlobalStoryboardBlock(continuityPlannerContext: Record<string, unknown>) {
  const shots = readArray(continuityPlannerContext.shots).map(asRecord)
  return {
    id: 'global',
    title: 'Global continuity structure',
    summary: 'Compact all-shot continuity seed.',
    shotIds: shots.map((shot) => readText(shot.id)).filter(Boolean),
  }
}

export function parseSequenceAnimaticGraphV2(value: unknown): z.infer<typeof sequenceAnimaticContinuityGraphV2Schema> {
  const parsed = sequenceAnimaticContinuityGraphV2Schema.safeParse(value)
  if (!parsed.success) return sequenceAnimaticEmptyGraphV2()
  const viewpoints = parsed.data.viewpoints.length > 0 ? parsed.data.viewpoints : parsed.data.angles
  const angles = parsed.data.angles.length > 0 ? parsed.data.angles : viewpoints
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...parsed.data,
    viewpoints,
    angles,
  })
}

export function sequenceAnimaticContinuityAnchorSemanticName(value: string) {
  return value
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function sequenceAnimaticContinuityAnchorSemanticKey(anchor: { type?: string; name?: string }) {
  const type = readText(anchor.type)
  const name = sequenceAnimaticContinuityAnchorSemanticName(readText(anchor.name))
  return type && name ? `${type}:${name}` : ''
}

export function sequenceAnimaticContinuityAnchorStableId(anchor: { type?: string; name?: string }) {
  const type = readText(anchor.type)
  const slug = sequenceAnimaticContinuityAnchorSemanticName(readText(anchor.name)).replace(/\s+/g, '_')
  if (!slug) return ''
  if (type === 'character') return `char_${slug}`
  if (type === 'prop') return `prop_${slug}`
  if (type === 'location_spot') return `spot_anchor_${slug}`
  if (type === 'location_set') return `set_anchor_${slug}`
  if (type === 'location_angle') return `angle_anchor_${slug}`
  return `anchor_${slug}`
}

function sequenceAnimaticPreferContinuityAnchorText(previous: string, incoming: string) {
  const left = readText(previous)
  const right = readText(incoming)
  if (!left) return right
  if (!right) return left
  return right.length > left.length ? right : left
}

function sequenceAnimaticContinuityAnchorDisplayName(entries: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const names = entries.map((entry) => readText(entry.name)).filter(Boolean)
  return names.find((name) => /[a-z]/.test(name) && name !== name.toUpperCase()) || names[0] || ''
}

function mergeSequenceAnimaticContinuityAssetAnchorGroup(entries: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const first = entries[0]
  const stableId = sequenceAnimaticContinuityAnchorStableId(first)
  const canonicalId = entries.map((entry) => readText(entry.id)).find((id) => id === stableId)
    || stableId
    || entries.map((entry) => readText(entry.id)).find(Boolean)
    || ''
  const merged = entries.reduce((previous, entry) => sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    ...previous,
    ...entry,
    id: canonicalId,
    name: sequenceAnimaticContinuityAnchorDisplayName(entries) || previous.name || entry.name,
    visualBrief: sequenceAnimaticPreferContinuityAnchorText(previous.visualBrief, entry.visualBrief),
    persistenceReason: sequenceAnimaticPreferContinuityAnchorText(previous.persistenceReason, entry.persistenceReason),
    confidence: Math.max(previous.confidence ?? 0, entry.confidence ?? 0),
    shotIds: [...new Set([...(previous.shotIds ?? []), ...(entry.shotIds ?? [])].map(readText).filter(Boolean))],
    storyboardBlockIds: [...new Set([...(previous.storyboardBlockIds ?? []), ...(entry.storyboardBlockIds ?? [])].map(readText).filter(Boolean))],
    sourceEvidence: [...new Set([...(previous.sourceEvidence ?? []), ...(entry.sourceEvidence ?? [])].map(readText).filter(Boolean))],
    connectedTo: [...new Set([...(previous.connectedTo ?? []), ...(entry.connectedTo ?? [])].map(readText).filter(Boolean))],
    visibleFrom: [...new Set([...(previous.visibleFrom ?? []), ...(entry.visibleFrom ?? [])].map(readText).filter(Boolean))],
    entryFrom: [...new Set([...(previous.entryFrom ?? []), ...(entry.entryFrom ?? [])].map(readText).filter(Boolean))],
    existingWorldEntityMatch: previous.existingWorldEntityMatch || entry.existingWorldEntityMatch || null,
    baseLocationRefId: previous.baseLocationRefId || entry.baseLocationRefId || null,
    setId: previous.setId || entry.setId || null,
    angleId: previous.angleId || entry.angleId || null,
  }), sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    ...first,
    id: canonicalId,
  }))
  return merged
}

export function mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey(anchors: readonly z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]) {
  const grouped = new Map<string, z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>[]>()
  for (const rawAnchor of anchors) {
    const anchor = sequenceAnimaticContinuityPlannerAnchorSchema.parse({
      ...rawAnchor,
      id: readText(rawAnchor.id) || sequenceAnimaticContinuityAnchorStableId(rawAnchor),
    })
    const key = sequenceAnimaticContinuityAnchorSemanticKey(anchor) || readText(anchor.id)
    if (!key) continue
    const group = grouped.get(key) ?? []
    group.push(anchor)
    grouped.set(key, group)
  }
  const idRemap = new Map<string, string>()
  const mergedAnchors = [...grouped.values()].map((entries) => {
    const merged = mergeSequenceAnimaticContinuityAssetAnchorGroup(entries)
    const canonicalId = readText(merged.id)
    for (const entry of entries) {
      const oldId = readText(entry.id)
      if (oldId && canonicalId && oldId !== canonicalId) idRemap.set(oldId, canonicalId)
    }
    return merged
  })
  return { anchors: mergedAnchors, idRemap }
}

function remapSequenceAnimaticContinuityAssetIds(ids: readonly string[], idRemap: ReadonlyMap<string, string>) {
  return [...new Set(ids.map((id) => idRemap.get(id) || id).map(readText).filter(Boolean))]
}

export function remapSequenceAnimaticContinuityShotBindingAnchorIds(
  bindingValue: unknown,
  idRemap: ReadonlyMap<string, string>,
) {
  const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
  const characterAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.characterAnchorIds, idRemap)
  const propAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.propAnchorIds, idRemap)
  const assetAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.assetAnchorIds, idRemap)
  const continuityAnchorIds = remapSequenceAnimaticContinuityAssetIds(binding.continuityAnchorIds, idRemap)
  return sequenceAnimaticContinuityShotBindingSchema.parse({
    ...binding,
    characterAnchorIds,
    propAnchorIds,
    assetAnchorIds,
    continuityAnchorIds,
  })
}

export function remapSequenceAnimaticContinuityShotBindingsAnchorIds(
  shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>>,
  idRemap: ReadonlyMap<string, string>,
) {
  if (idRemap.size === 0) return shotBindings
  const remapped: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  for (const [shotId, binding] of Object.entries(shotBindings)) {
    remapped[shotId] = remapSequenceAnimaticContinuityShotBindingAnchorIds(binding, idRemap)
  }
  return remapped
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

export function mergeSequenceAnimaticContinuityGraphV2(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  delta: z.infer<typeof sequenceAnimaticContinuityBlockDeltaSchema>
  continuityPlannerContext?: Record<string, unknown>
}) {
  const graph = parseSequenceAnimaticGraphV2(input.graph)
  const delta = input.delta
  const nodeIds = new Set<string>()
  const locationSets = mergeById(graph.locationSets, delta.locationSets)
  const zones = mergeById(graph.zones, delta.zones)
  const spots = mergeById(graph.spots, delta.spots)
  const angles = mergeById(graph.angles, delta.angles)
  locationSets.forEach((entry) => nodeIds.add(entry.id))
  zones.forEach((entry) => nodeIds.add(entry.id))
  spots.forEach((entry) => nodeIds.add(entry.id))
  angles.forEach((entry) => nodeIds.add(entry.id))
  const edgeKey = (edge: z.infer<typeof sequenceAnimaticContinuityGraphEdgeSchema>) => `${edge.sourceId}:${edge.relationship}:${edge.targetId}`
  const edges = [...graph.edges, ...delta.edges]
    .filter((edge) => edge.sourceId !== edge.targetId && nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
    .filter((edge, index, values) => values.findIndex((candidate) => edgeKey(candidate) === edgeKey(edge)) === index)
    .slice(0, 160)
  const semanticAssetAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey([
    ...graph.assetAnchors.map((entry) => ({ ...entry, id: readText(entry.id) })),
    ...delta.assetAnchors.map((entry) => ({ ...entry, id: readText(entry.id) })),
  ])
  const shotBindings = remapSequenceAnimaticContinuityShotBindingsAnchorIds(
    { ...graph.shotBindings, ...delta.shotBindings },
    semanticAssetAnchorMerge.idRemap,
  )
  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...graph,
    worldLocationRefs: mergeById(graph.worldLocationRefs, delta.worldLocationRefs).slice(0, 24),
    locationSets: locationSets.slice(0, 48),
    zones: zones.slice(0, 72),
    spots: spots.slice(0, 96),
    angles: angles.slice(0, 96),
    edges,
    shotBindings,
    assetAnchors: semanticAssetAnchorMerge.anchors.filter((entry) => readText(entry.id)),
    rejectedCandidates: [...graph.rejectedCandidates, ...delta.rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.shotIds.join(',')}`) === index)
      .slice(0, 96),
    blockSummaries: [
      ...graph.blockSummaries.filter((entry) => entry.blockId !== delta.blockId),
      { blockId: delta.blockId, summary: delta.blockSummary, status: delta.warnings.length > 0 ? 'fallback' : 'planned' },
    ],
    warnings: [...new Set([...graph.warnings, ...delta.warnings])],
    diagnostics: [...graph.diagnostics, ...delta.diagnostics],
  })
}

function sceneGraphEdgeEndpointSafe(
  sourceId: string,
  targetId: string,
  locationSets: z.infer<typeof sequenceAnimaticContinuityLocationSetSchema>[],
  locationAngles: z.infer<typeof sequenceAnimaticContinuityLocationAngleSchema>[],
) {
  const ids = new Set([...locationSets.map((entry) => entry.id), ...locationAngles.map((entry) => entry.id)])
  return ids.has(sourceId) && ids.has(targetId) && sourceId !== targetId
}

export function finalizeSequenceAnimaticContinuityGraphV2(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const locationSets = graph.locationSets.map((entry) => sequenceAnimaticContinuityLocationSetSchema.parse({
    id: entry.id,
    name: entry.name,
    baseLocationRefId: entry.worldLocationRefId,
    visualBrief: entry.visualBrief || entry.name,
    persistenceReason: `Reusable continuity set inside ${entry.worldLocationRefId || 'the animatic location'}.`,
    shotIds: entry.shotIds,
    storyboardBlockIds: entry.storyboardBlockIds,
    connectedSetIds: graph.edges.filter((edge) => edge.sourceId === entry.id && edge.relationship === 'connected_to').map((edge) => edge.targetId),
    entrances: graph.edges.filter((edge) => edge.targetId === entry.id && edge.relationship === 'entrance_to').map((edge) => edge.sourceId),
    landmarks: [],
  }))
  const locationAngles = graph.angles.map((entry) => sequenceAnimaticContinuityLocationAngleSchema.parse({
    id: entry.id,
    setId: entry.setId,
    name: entry.name,
    visualBrief: entry.visualBrief || entry.name,
    framing: entry.framing,
    screenDirectionRule: entry.facingDirection,
    visibleLandmarks: entry.visibleLandmarks,
    lightingDirection: entry.lightingDirection,
    shotIds: entry.shotIds,
    storyboardBlockIds: entry.storyboardBlockIds,
  }))
  const sceneGraph = {
    nodes: [
      ...locationSets.map((entry) => ({ id: entry.id, type: 'location_set' as const, name: entry.name })),
      ...locationAngles.map((entry) => ({ id: entry.id, type: 'location_angle' as const, name: entry.name })),
    ],
    edges: graph.edges
      .filter((edge) => ['connected_to', 'visible_from', 'entrance_to', 'adjacent_to', 'same_space_angle'].includes(edge.relationship))
      .map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationship: edge.relationship === 'adjacent_to' ? 'connected_to' : edge.relationship,
        evidence: edge.evidence,
      }))
      .filter((edge) => sceneGraphEdgeEndpointSafe(edge.sourceId, edge.targetId, locationSets, locationAngles))
      .slice(0, 80),
  }
  const locationSpotAnchors = [
    ...graph.zones.map((entry) => ({
      id: `spot_${entry.id.replace(/^zone_/, '')}`,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable zone continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: zone binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local zone, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: null,
      connectedTo: [],
      visibleFrom: [],
      entryFrom: [],
    })),
    ...graph.spots.map((entry) => ({
      id: entry.id,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable spot continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: spot binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local spot, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: null,
      connectedTo: [],
      visibleFrom: [],
      entryFrom: [],
    })),
    ...graph.angles.map((entry) => ({
      id: entry.id,
      type: 'location_spot' as const,
      name: entry.name,
      visualBrief: entry.visualBrief || entry.name,
      persistenceReason: `Reusable camera angle continuity reference inside ${entry.worldLocationRefId || 'the animatic location'}.`,
      confidence: 0.72,
      shotIds: entry.shotIds,
      storyboardBlockIds: entry.storyboardBlockIds,
      sourceEvidence: entry.shotIds.map((shotId) => `${shotId}: angle binding`),
      existingWorldEntityMatch: null,
      rejectionRisk: 'low: output-local camera angle, not a world entity.',
      baseLocationRefId: entry.worldLocationRefId,
      setId: entry.setId,
      angleId: entry.id,
      connectedTo: [],
      visibleFrom: entry.spotIds,
      entryFrom: [],
    })),
  ].filter((entry, index, values) => values.findIndex((candidate) => candidate.id === entry.id) === index)
  const shotContinuityMap: Record<string, string[]> = {}
  Object.entries(graph.shotBindings).forEach(([shotId, binding]) => {
    shotContinuityMap[shotId] = [...new Set([
      ...binding.continuityAnchorIds,
    ].filter(Boolean))]
  })
  const assetAnchors = graph.assetAnchors
  return {
    continuityGraphV2: graph,
    locationSets,
    locationAngles,
    sceneGraph,
    shotContinuityMap,
    shotBindings: graph.shotBindings,
    assetAnchors,
    locationSpotAnchors,
    rejectedCandidates: graph.rejectedCandidates,
    warnings: graph.warnings,
    diagnostics: graph.diagnostics,
  }
}

export function sequenceAnimaticPlanFromContinuityGraphV2(graphInput: unknown) {
  const finalized = finalizeSequenceAnimaticContinuityGraphV2(graphInput)
  const anchors = finalized.assetAnchors.map((entry) => sequenceAnimaticContinuityPlannerAnchorSchema.parse({
    id: readText(entry.id),
    type: readText(entry.type) === 'character' ? 'character' : readText(entry.type) === 'prop' ? 'prop' : 'location_spot',
    name: readText(entry.name) || readText(entry.id),
    visualBrief: readText(entry.visualBrief) || readText(entry.name) || readText(entry.id),
    persistenceReason: readText(entry.persistenceReason) || 'Output-local continuity graph anchor.',
    confidence: Number(entry.confidence ?? 0.72) || 0.72,
    shotIds: readStringArray(entry.shotIds),
    storyboardBlockIds: readStringArray(entry.storyboardBlockIds),
    sourceEvidence: readStringArray(entry.sourceEvidence),
    existingWorldEntityMatch: readText(entry.existingWorldEntityMatch) || null,
    rejectionRisk: readText(entry.rejectionRisk),
    baseLocationRefId: readText(entry.baseLocationRefId) || null,
    setId: readText(entry.setId) || null,
    angleId: readText(entry.angleId) || null,
    connectedTo: readStringArray(entry.connectedTo),
    visibleFrom: readStringArray(entry.visibleFrom),
    entryFrom: readStringArray(entry.entryFrom),
  }))
  return {
    version: 'sequence_animatic_continuity_plan_v2',
    planningMode: 'block_graph_v2',
    anchors,
    characterAnchors: anchors.filter((anchor) => anchor.type === 'character').map((anchor) => ({
      ...anchor,
      anchorType: 'character',
      summary: anchor.persistenceReason,
      usageCount: Math.max(anchor.shotIds.length, 1),
    })),
    propAnchors: anchors.filter((anchor) => anchor.type === 'prop').map((anchor) => ({
      ...anchor,
      anchorType: 'prop',
      summary: anchor.persistenceReason,
      usageCount: Math.max(anchor.shotIds.length, 1),
    })),
    locationSpotAnchors: finalized.locationSpotAnchors,
    continuityGraphV2: finalized.continuityGraphV2,
    locationSets: finalized.locationSets,
    locationAngles: finalized.locationAngles,
    sceneGraph: finalized.sceneGraph,
    continuityAnchorIdsByShotId: finalized.shotContinuityMap,
    shotBindings: finalized.shotBindings,
    shotContinuityMap: finalized.shotContinuityMap,
    rejectedCandidates: finalized.rejectedCandidates,
    warnings: finalized.warnings,
    diagnostics: [
      ...finalized.diagnostics,
      `Block graph continuity planner emitted ${anchors.length} output-local anchor${anchors.length === 1 ? '' : 's'}.`,
    ],
  }
}

function normalizeSequenceAnimaticReferenceText(value: unknown) {
  return readText(value)
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

function mergeSequenceAnimaticReferenceCatalogEntries(entries: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const entry of entries) {
    const key = readText(entry.key)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    byKey.set(key, {
      ...existing,
      ...entry,
      name: readText(existing.name) || readText(entry.name),
      type: readText(existing.type) || readText(entry.type),
      summary: readText(existing.summary) || readText(entry.summary),
      visualSummary: readText(existing.visualSummary) || readText(entry.visualSummary),
      aliases: [...new Set([...readStringArray(existing.aliases), ...readStringArray(entry.aliases)])].filter(Boolean),
      assetKeys: [...new Set([...readStringArray(existing.assetKeys), ...readStringArray(entry.assetKeys)])].filter(Boolean).slice(0, 8),
      source: [...new Set([readText(existing.source), readText(entry.source)].filter(Boolean))].join('+'),
    })
  }
  return [...byKey.values()]
}

const sequenceAnimaticReferenceAliasStopwords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function sequenceAnimaticReferenceIsCharacterLike(entry: Record<string, unknown>) {
  const type = normalizeSequenceAnimaticReferenceText([
    readText(entry.type),
    readText(entry.referenceRole),
    readText(entry.nodeType),
  ].filter(Boolean).join(' '))
  return /\b(actor|character|cast|person|persona|protagonist|antagonist)\b/.test(type.replace(/_/g, ' '))
}

function sequenceAnimaticReferenceAliasCandidates(entry: Record<string, unknown>) {
  const rawValues = [
    readText(entry.key),
    readText(entry.key).replace(/_/g, ' '),
    readText(entry.name),
    readText(entry.label),
    ...readStringArray(entry.aliases),
  ].filter(Boolean)
  const candidates = new Set<string>()
  for (const value of rawValues) {
    const normalized = normalizeSequenceAnimaticReferenceText(value)
    if (normalized) candidates.add(normalized)
  }

  if (sequenceAnimaticReferenceIsCharacterLike(entry)) {
    for (const value of rawValues) {
      const parts = normalizeSequenceAnimaticReferenceText(value)
        .split('_')
        .filter((part) => part.length >= 3 && !sequenceAnimaticReferenceAliasStopwords.has(part))
      if (parts.length >= 2) {
        candidates.add(parts[0])
        candidates.add(parts[parts.length - 1])
      }
    }
  }

  return [...candidates]
}

function buildSequenceAnimaticReferenceLookup(catalog: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>()
  const byAlias = new Map<string, Record<string, unknown>>()
  for (const entry of catalog) {
    const key = readText(entry.key)
    if (key) byKey.set(key, entry)
    for (const normalized of sequenceAnimaticReferenceAliasCandidates(entry)) {
      if (normalized && !byAlias.has(normalized)) byAlias.set(normalized, entry)
    }
  }
  return { byKey, byAlias }
}

function sequenceAnimaticReferenceLookupFromPlannerContext(context: Record<string, unknown>) {
  const references = readArray(context.existingWorldReferences).map(asRecord)
  const resolvedReferences: Array<Record<string, unknown>> = []
  for (const shot of readArray(context.shots).map(asRecord)) {
    const resolvedRefs = asRecord(shot.resolvedRefs)
    for (const value of Object.values(resolvedRefs)) {
      if (Array.isArray(value)) resolvedReferences.push(...value.map(asRecord))
      else {
        const record = asRecord(value)
        if (Object.keys(record).length > 0) resolvedReferences.push(record)
      }
    }
  }
  return buildSequenceAnimaticReferenceLookup(mergeSequenceAnimaticReferenceCatalogEntries([
    ...references,
    ...resolvedReferences,
  ]))
}

function sequenceAnimaticCanonicalReferenceMatchForAnchor(
  anchor: z.infer<typeof sequenceAnimaticContinuityPlannerAnchorSchema>,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const anchorType = readText(anchor.type)
  if (anchorType !== 'character' && anchorType !== 'prop') return null
  const explicitMatch = readText(anchor.existingWorldEntityMatch)
  if (explicitMatch) {
    return lookup.byKey.get(explicitMatch)
      ?? lookup.byAlias.get(normalizeSequenceAnimaticReferenceText(explicitMatch))
      ?? { key: explicitMatch, name: explicitMatch, type: 'world_entity' }
  }
  const candidates = [
    readText(anchor.name),
    readText(anchor.id).replace(/^anchor_(character|prop)_/i, '').replace(/_block\d+$/i, '').replace(/_/g, ' '),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const match = lookup.byAlias.get(normalizeSequenceAnimaticReferenceText(candidate))
    if (match) return match
  }
  return null
}

function sequenceAnimaticContinuityTextHasPhysicalLocationCue(value: unknown) {
  const normalized = ` ${normalizeSequenceAnimaticReferenceText(value).replace(/_/g, ' ')} `
  return /\b(row|lane|street|city|station|clock|face|pipe|rail|catwalk|walkway|chamber|room|corridor|passage|gap|hatch|ledge|platform|shaft|wall|door|gate|workshop|bay|bench|tunnel|engine|basin|bridge|stair|dock|harbor|drain|crate|lamp|lantern)\b/.test(normalized)
}

function sequenceAnimaticCanonicalCharacterMatchForText(
  value: unknown,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const normalized = normalizeSequenceAnimaticReferenceText(value)
  if (!normalized) return null
  for (const [alias, entry] of lookup.byAlias.entries()) {
    if (alias.length < 3 || !sequenceAnimaticReferenceIsCharacterLike(entry)) continue
    if (normalized === alias || normalized.includes(`_${alias}_`) || normalized.startsWith(`${alias}_`) || normalized.endsWith(`_${alias}`)) {
      return entry
    }
  }
  return null
}

function sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(
  node: Record<string, unknown>,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  const label = readText(node.name) || readText(node.id)
  const match = sequenceAnimaticCanonicalCharacterMatchForText(label, lookup)
  return Boolean(match && !sequenceAnimaticContinuityTextHasPhysicalLocationCue(label))
}

function sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(
  node: Record<string, unknown>,
  shots: Array<Record<string, unknown>>,
) {
  const nodeText = normalizeSequenceAnimaticReferenceText([node.id, node.name].map(readText).filter(Boolean).join(' '))
  if (!nodeText) return false
  for (const shot of shots) {
    const title = readText(shot.title)
    const normalizedTitle = normalizeSequenceAnimaticReferenceText(title)
    if (normalizedTitle.length >= 8 && nodeText.includes(normalizedTitle) && !sequenceAnimaticContinuityTextHasPhysicalLocationCue(title)) return true
  }
  return false
}

function sequenceAnimaticContinuityTitleFromRefLike(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

export function sanitizeSequenceAnimaticContinuityBlockDeltaSpatialNodes(input: {
  delta: z.infer<typeof sequenceAnimaticContinuityBlockDeltaSchema>
  continuityPlannerContext: Record<string, unknown>
  storyboardBlock: Record<string, unknown>
}) {
  const delta = sequenceAnimaticContinuityBlockDeltaSchema.parse(input.delta)
  const lookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)
  const shots = sequenceAnimaticBlockShots(input.continuityPlannerContext, input.storyboardBlock)
  const invalidNodeIds = new Set<string>()
  const rejectedCandidates: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []

  const markInvalid = (entry: Record<string, unknown>, type: 'location_spot' | 'location_set' | 'location_angle', reason: string) => {
    const id = readText(entry.id)
    if (id) invalidNodeIds.add(id)
    rejectedCandidates.push(sequenceAnimaticContinuityRejectedCandidateSchema.parse({
      name: readText(entry.name) || sequenceAnimaticContinuityTitleFromRefLike(id) || 'Unnamed candidate',
      type,
      reason: 'too_generic',
      sourceEvidence: [reason],
      shotIds: readStringArray(entry.shotIds),
    }))
  }

  const isBadLocationNode = (entry: Record<string, unknown>) => (
    sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup)
    || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, shots)
  )

  const zones = delta.zones.filter((entry) => {
    if (!isBadLocationNode(entry)) return true
    markInvalid(entry, 'location_spot', 'Continuity location node looked like a character/action label instead of a physical zone.')
    return false
  })
  const spots = delta.spots.filter((entry) => {
    if (invalidNodeIds.has(entry.zoneId) || isBadLocationNode(entry)) {
      markInvalid(entry, 'location_spot', 'Continuity spot depended on a rejected character/action-derived zone.')
      return false
    }
    return true
  })
  const angles = delta.angles.filter((entry) => {
    if (invalidNodeIds.has(entry.zoneId) || entry.spotIds.some((spotId) => invalidNodeIds.has(spotId)) || isBadLocationNode(entry)) {
      markInvalid(entry, 'location_angle', 'Continuity angle depended on a rejected character/action-derived zone or spot.')
      return false
    }
    return true
  })

  if (invalidNodeIds.size === 0) return delta

  const shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  for (const [shotId, bindingValue] of Object.entries(delta.shotBindings)) {
    const binding = sequenceAnimaticContinuityShotBindingSchema.parse(bindingValue)
    const spotIds = binding.spotIds.filter((spotId) => !invalidNodeIds.has(spotId))
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      ...binding,
      zoneId: invalidNodeIds.has(binding.zoneId) ? '' : binding.zoneId,
      spotIds,
      angleId: invalidNodeIds.has(binding.angleId) ? '' : binding.angleId,
      spatialNodeIds: binding.spatialNodeIds.filter((nodeId) => !invalidNodeIds.has(nodeId)),
      continuityAnchorIds: binding.continuityAnchorIds.filter((anchorId) => !invalidNodeIds.has(anchorId)),
    })
  }

  return sequenceAnimaticContinuityBlockDeltaSchema.parse({
    ...delta,
    zones,
    spots,
    angles,
    edges: delta.edges.filter((edge) => !invalidNodeIds.has(edge.sourceId) && !invalidNodeIds.has(edge.targetId)),
    shotBindings,
    rejectedCandidates: [...delta.rejectedCandidates, ...rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.shotIds.join(',')}`) === index),
    warnings: [
      ...delta.warnings,
      `Rejected ${invalidNodeIds.size} continuity spatial node${invalidNodeIds.size === 1 ? '' : 's'} that looked like character/action labels instead of physical locations.`,
    ],
  })
}

export function sanitizeSequenceAnimaticContinuityGraphCanonicalAnchors(input: {
  graph: z.infer<typeof sequenceAnimaticContinuityGraphV2Schema>
  continuityPlannerContext: Record<string, unknown>
}) {
  const graph = parseSequenceAnimaticGraphV2(input.graph)
  const lookup = sequenceAnimaticReferenceLookupFromPlannerContext(input.continuityPlannerContext)
  const contextShots = readArray(input.continuityPlannerContext.shots).map(asRecord)
  const removedAnchorIds = new Set<string>()
  const removedLocationNodeIds = new Set<string>()
  const rejectedCandidates: z.infer<typeof sequenceAnimaticContinuityRejectedCandidateSchema>[] = []
  const filteredAssetAnchors = graph.assetAnchors.filter((anchor) => {
    const match = sequenceAnimaticCanonicalReferenceMatchForAnchor(anchor, lookup)
    if (!match) return true
    const anchorId = readText(anchor.id)
    if (anchorId) removedAnchorIds.add(anchorId)
    rejectedCandidates.push(sequenceAnimaticContinuityRejectedCandidateSchema.parse({
      name: readText(anchor.name) || 'Unnamed candidate',
      type: readText(anchor.type) === 'character' || readText(anchor.type) === 'prop' ? readText(anchor.type) : 'unknown',
      reason: 'existing_world_entity',
      sourceEvidence: readStringArray(anchor.sourceEvidence),
      shotIds: readStringArray(anchor.shotIds),
      existingWorldEntityMatch: readText(match.key) || readText(match.name) || null,
    }))
    return false
  })
  const semanticAnchorMerge = mergeSequenceAnimaticContinuityAssetAnchorsBySemanticKey(filteredAssetAnchors)
  const assetAnchors = semanticAnchorMerge.anchors
  const locationSets = graph.locationSets.filter((entry) => {
    if (!sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) && !sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) return true
    removedLocationNodeIds.add(entry.id)
    return false
  })
  const zones = graph.zones.filter((entry) => {
    if (removedLocationNodeIds.has(entry.setId) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })
  const spots = graph.spots.filter((entry) => {
    if (removedLocationNodeIds.has(entry.zoneId) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })
  const angles = graph.angles.filter((entry) => {
    if (removedLocationNodeIds.has(entry.setId) || removedLocationNodeIds.has(entry.zoneId) || entry.spotIds.some((spotId) => removedLocationNodeIds.has(spotId)) || sequenceAnimaticContinuityLocationNodeLooksCharacterDerived(entry, lookup) || sequenceAnimaticContinuityLocationNodeLooksShotTitleDerived(entry, contextShots)) {
      removedLocationNodeIds.add(entry.id)
      return false
    }
    return true
  })

  const shotBindings: Record<string, z.infer<typeof sequenceAnimaticContinuityShotBindingSchema>> = {}
  const validCharacterAnchorIds = new Set(assetAnchors.filter((anchor) => anchor.type === 'character').map((anchor) => anchor.id).filter(Boolean))
  const validPropAnchorIds = new Set(assetAnchors.filter((anchor) => anchor.type === 'prop').map((anchor) => anchor.id).filter(Boolean))
  for (const [shotId, bindingValue] of Object.entries(graph.shotBindings)) {
    const binding = remapSequenceAnimaticContinuityShotBindingAnchorIds(bindingValue, semanticAnchorMerge.idRemap)
    const characterAnchorIds = binding.characterAnchorIds.filter((id) => validCharacterAnchorIds.has(id))
    const propAnchorIds = binding.propAnchorIds.filter((id) => validPropAnchorIds.has(id))
    const assetAnchorIds = [...new Set([...characterAnchorIds, ...propAnchorIds].filter(Boolean))]
    const zoneId = removedLocationNodeIds.has(binding.zoneId) ? '' : binding.zoneId
    const primarySpotId = removedLocationNodeIds.has(binding.primarySpotId) ? '' : binding.primarySpotId
    const spotIds = binding.spotIds.filter((id) => !removedLocationNodeIds.has(id))
    const viewpointId = removedLocationNodeIds.has(binding.viewpointId) ? '' : binding.viewpointId
    const angleId = removedLocationNodeIds.has(binding.angleId) ? '' : binding.angleId
    shotBindings[shotId] = sequenceAnimaticContinuityShotBindingSchema.parse({
      ...binding,
      characterAnchorIds,
      propAnchorIds,
      assetAnchorIds,
      zoneId,
      primarySpotId,
      spotIds,
      viewpointId,
      angleId,
      spatialNodeIds: [...new Set([binding.setId, zoneId, primarySpotId, ...spotIds, viewpointId, angleId, ...binding.spatialNodeIds].filter((id) => id && !removedLocationNodeIds.has(id)))],
      continuityAnchorIds: assetAnchorIds,
    })
  }

  return sequenceAnimaticContinuityGraphV2Schema.parse({
    ...graph,
    locationSets,
    zones,
    spots,
    angles,
    edges: graph.edges.filter((edge) => !removedLocationNodeIds.has(edge.sourceId) && !removedLocationNodeIds.has(edge.targetId)),
    assetAnchors,
    rejectedCandidates: [...graph.rejectedCandidates, ...rejectedCandidates]
      .filter((entry, index, values) => values.findIndex((candidate) => `${candidate.name}:${candidate.reason}:${candidate.existingWorldEntityMatch ?? ''}:${candidate.shotIds.join(',')}` === `${entry.name}:${entry.reason}:${entry.existingWorldEntityMatch ?? ''}:${entry.shotIds.join(',')}`) === index),
    shotBindings,
    warnings: [
      ...graph.warnings,
      ...(removedAnchorIds.size > 0 ? [`Removed ${removedAnchorIds.size} continuity anchor${removedAnchorIds.size === 1 ? '' : 's'} that duplicated existing world entities.`] : []),
      ...(removedLocationNodeIds.size > 0 ? [`Removed ${removedLocationNodeIds.size} continuity spatial node${removedLocationNodeIds.size === 1 ? '' : 's'} that looked like character/action labels instead of physical locations.`] : []),
    ],
  })
}

export function sequenceAnimaticContinuityBlockStatesFromGraph(
  graphInput: unknown,
  options: {
    activeBlockId?: string
    activeDelta?: Record<string, unknown>
    status?: 'not_started' | 'seeded' | 'deriving' | 'ready' | 'needs_review' | 'failed' | 'stale'
    error?: string
  } = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const now = new Date().toISOString()
  const blockIds = new Set<string>()
  Object.values(graph.shotBindings).forEach((binding) => {
    if (binding.storyboardBlockId) blockIds.add(binding.storyboardBlockId)
  })
  readStringArray(options.activeDelta?.storyboardBlockIds).forEach((id) => blockIds.add(id))
  const activeBlockId = readText(options.activeBlockId) || readText(options.activeDelta?.blockId)
  if (activeBlockId) blockIds.add(activeBlockId)
  const states: Record<string, Record<string, unknown>> = {}
  blockIds.forEach((blockId) => {
    const shotIds = Object.values(graph.shotBindings)
      .filter((binding) => binding.storyboardBlockId === blockId)
      .map((binding) => binding.shotId)
      .filter(Boolean)
    states[blockId] = {
      blockId,
      status: blockId === activeBlockId ? options.status ?? 'ready' : 'ready',
      inputHash: hashOutputWorkflowValue({
        blockId,
        shotIds,
        graphVersion: graph.version,
      }),
      lastDeltaHash: blockId === activeBlockId && Object.keys(asRecord(options.activeDelta)).length > 0
        ? hashOutputWorkflowValue(options.activeDelta)
        : '',
      shotIds,
      warningCount: graph.warnings.length,
      warnings: graph.warnings,
      error: blockId === activeBlockId ? readText(options.error) : '',
      updatedAt: now,
    }
  })
  return states
}

export function sequenceAnimaticContinuityCoverage(
  graphInput: unknown,
  continuityPlannerContext: Record<string, unknown>,
  blockStates: Record<string, unknown> = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const shots = readArray(continuityPlannerContext.shots).map(asRecord)
  const explicitBlocks = readArray(continuityPlannerContext.blocks).map(asRecord)
  const totalShotIds = shots.map((shot) => readText(shot.id)).filter(Boolean)
  const bindingShotIds = Object.keys(graph.shotBindings).map(readText).filter(Boolean)
  const effectiveShotIds = totalShotIds.length > 0 ? totalShotIds : bindingShotIds
  const effectiveBoundShotIds = effectiveShotIds.filter((shotId) => {
    const binding = asRecord(graph.shotBindings[shotId])
    const hasLocation = Boolean(readText(binding.setId) || readText(binding.worldLocationRefId))
    const hasSpecificSpatialNode = Boolean(
      readText(binding.zoneId)
      || readText(binding.primarySpotId)
      || readStringArray(binding.spotIds).length > 0
      || readText(binding.viewpointId)
      || readText(binding.angleId)
    )
    return hasLocation && hasSpecificSpatialNode
  })
  const inferredBlockIds = [...new Set(Object.values(graph.shotBindings)
    .map((binding) => readText(asRecord(binding).storyboardBlockId))
    .filter(Boolean))]
  const blocks = explicitBlocks.length > 0
    ? explicitBlocks
    : inferredBlockIds.map((blockId) => ({
      id: blockId,
      shotIds: bindingShotIds.filter((shotId) => readText(asRecord(graph.shotBindings[shotId]).storyboardBlockId) === blockId),
    }))
  const seededBlockIds: string[] = []
  const missingBlockIds: string[] = []
  for (const block of blocks) {
    const blockId = readText(block.id)
    if (!blockId) continue
    const shotIds = readStringArray(block.shotIds)
    const relevantShotIds = shotIds.length > 0 ? shotIds : effectiveShotIds.filter((shotId) => readText(asRecord(graph.shotBindings[shotId]).storyboardBlockId) === blockId)
    const boundCount = relevantShotIds.filter((shotId) => effectiveBoundShotIds.includes(shotId)).length
    if (relevantShotIds.length > 0 && boundCount === relevantShotIds.length) seededBlockIds.push(blockId)
    if (relevantShotIds.length === 0 || boundCount < relevantShotIds.length) missingBlockIds.push(blockId)
  }
  const readyBlockIds = Object.entries(blockStates)
    .filter(([, state]) => readText(asRecord(state).status) === 'ready')
    .map(([blockId]) => blockId)
  return {
    totalShots: effectiveShotIds.length,
    boundShots: effectiveBoundShotIds.length,
    missingShotIds: effectiveShotIds.filter((shotId) => !effectiveBoundShotIds.includes(shotId)),
    seededBlockIds,
    readyBlockIds,
    missingBlockIds,
    tempAnchorCount: graph.assetAnchors.length,
  }
}

export function sequenceAnimaticSeededBlockStatesFromCoverage(
  graphInput: unknown,
  continuityPlannerContext: Record<string, unknown>,
  previousStates: Record<string, unknown> = {},
) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const blocks = readArray(continuityPlannerContext.blocks).map(asRecord)
  const coverage = sequenceAnimaticContinuityCoverage(graph, continuityPlannerContext, previousStates)
  const now = new Date().toISOString()
  const states: Record<string, Record<string, unknown>> = { ...Object.fromEntries(Object.entries(previousStates).map(([key, value]) => [key, asRecord(value)])) }
  for (const block of blocks) {
    const blockId = readText(block.id)
    if (!blockId) continue
    const existing = asRecord(states[blockId])
    const existingStatus = readText(existing.status)
    const keepExisting = ['ready', 'deriving', 'failed', 'stale'].includes(existingStatus)
    const shotIds = readStringArray(block.shotIds)
    const status = keepExisting
      ? existingStatus
      : coverage.seededBlockIds.includes(blockId)
        ? 'seeded'
        : coverage.missingBlockIds.includes(blockId)
          ? 'needs_review'
          : 'not_started'
    states[blockId] = {
      ...existing,
      blockId,
      status,
      inputHash: readText(existing.inputHash) || hashOutputWorkflowValue({ blockId, shotIds, graphVersion: graph.version }),
      lastDeltaHash: readText(existing.lastDeltaHash),
      shotIds,
      warnings: readStringArray(existing.warnings),
      error: readText(existing.error),
      updatedAt: now,
    }
  }
  return states
}

export function sequenceAnimaticContinuityVisualDependencyEdges(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const edges: Array<z.infer<typeof sequenceAnimaticContinuityVisualDependencyEdgeSchema>> = []
  const push = (sourceNodeId: string, targetNodeId: string, relationship: string, required = false, evidence = '') => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return
    edges.push(sequenceAnimaticContinuityVisualDependencyEdgeSchema.parse({
      sourceNodeId,
      targetNodeId,
      relationship,
      required,
      evidence,
    }))
  }
  graph.locationSets.forEach((set) => push(set.worldLocationRefId, set.id, 'world_location_to_set', true, `Set ${set.name} belongs to ${set.worldLocationRefId}.`))
  graph.zones.forEach((zone) => push(zone.setId, zone.id, 'set_to_zone', true, `Zone ${zone.name} belongs to set ${zone.setId}.`))
  graph.spots.forEach((spot) => push(spot.zoneId, spot.id, 'zone_to_spot', true, `Spot ${spot.name} belongs to zone ${spot.zoneId}.`))
  graph.angles.forEach((angle) => {
    push(angle.setId, angle.id, 'set_to_angle', true, `Angle ${angle.name} belongs to set ${angle.setId}.`)
    push(angle.zoneId, angle.id, 'zone_to_angle', true, `Angle ${angle.name} is framed inside zone ${angle.zoneId}.`)
    angle.spotIds.forEach((spotId) => push(spotId, angle.id, 'spot_to_angle', false, `Angle ${angle.name} faces spot ${spotId}.`))
  })
  graph.edges.forEach((edge) => {
    if (['adjacent_to', 'visible_from', 'entrance_to', 'connected_to', 'same_space_angle', 'faces', 'opposes', 'above_below', 'left_of', 'right_of', 'near', 'occludes'].includes(edge.relationship)) {
      push(edge.sourceId, edge.targetId, edge.relationship, false, edge.evidence)
    }
  })
  const key = (edge: z.infer<typeof sequenceAnimaticContinuityVisualDependencyEdgeSchema>) => `${edge.sourceNodeId}:${edge.relationship}:${edge.targetNodeId}`
  return edges.filter((edge, index, values) => values.findIndex((candidate) => key(candidate) === key(edge)) === index).slice(0, 240)
}

export function sequenceAnimaticContinuityAssetTargets(graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const targets = [
    ...graph.locationSets.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_set', assetKind: 'location_set' })),
    ...graph.zones.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_zone', assetKind: 'location_zone' })),
    ...graph.spots.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_spot', assetKind: 'location_spot' })),
    ...graph.angles.map((entry) => ({ ...entry, id: entry.id, nodeKind: 'location_angle', assetKind: 'location_angle' })),
    ...graph.assetAnchors.map((entry) => ({
      ...entry,
      id: readText(entry.id),
      nodeKind: entry.type === 'character' ? 'temporary_character' : entry.type === 'prop' ? 'prop' : 'location_anchor',
      assetKind: entry.type === 'character' ? 'temporary_character' : entry.type === 'prop' ? 'prop' : 'location_spot',
    })),
  ].map(asRecord).filter((entry) => readText(entry.id))
  const seen = new Set<string>()
  return targets.filter((target) => {
    const id = readText(target.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export function sequenceAnimaticContinuityAssetTargetInputHash(target: Record<string, unknown>) {
  return hashOutputWorkflowValue({
    id: readText(target.id),
    assetKind: readText(target.assetKind) || readText(target.nodeKind),
    name: readText(target.name),
    visualBrief: readText(target.visualBrief),
    shotIds: readStringArray(target.shotIds),
    storyboardBlockIds: readStringArray(target.storyboardBlockIds),
    worldLocationRefId: readText(target.worldLocationRefId) || readText(target.baseLocationRefId),
    setId: readText(target.setId),
    zoneId: readText(target.zoneId),
    spotIds: readStringArray(target.spotIds),
  })
}

export function sequenceAnimaticContinuityAssetStates(input: {
  graph: unknown
  previousStates?: Record<string, unknown>
}) {
  const previousStates = asRecord(input.previousStates)
  const states: Record<string, z.infer<typeof sequenceAnimaticContinuityAssetStateSchema>> = {}
  for (const target of sequenceAnimaticContinuityAssetTargets(input.graph)) {
    const sourceNodeId = readText(target.id)
    const inputHash = sequenceAnimaticContinuityAssetTargetInputHash(target)
    const previous = asRecord(previousStates[sourceNodeId])
    const previousStatus = readText(previous.status)
    const previousAssetKey = readText(previous.assetKey)
    const status = previousStatus === 'ready' && previousAssetKey && readText(previous.inputHash) === inputHash
      ? 'ready'
      : previousStatus === 'failed' && readText(previous.inputHash) === inputHash
        ? 'failed'
        : previousAssetKey
          ? 'stale'
          : 'missing'
    states[sourceNodeId] = sequenceAnimaticContinuityAssetStateSchema.parse({
      status,
      inputHash,
      assetKey: previousAssetKey || null,
      artifactKey: readText(previous.artifactKey) || null,
      prompt: readText(previous.prompt),
      referenceAssetKeys: readStringArray(previous.referenceAssetKeys),
      sourceNodeId,
      assetKind: readText(target.assetKind) || readText(target.nodeKind) || 'continuity_asset',
      generatedAt: readText(previous.generatedAt) || null,
      warnings: readStringArray(previous.warnings),
      error: readText(previous.error),
    })
  }
  return states
}

export function sequenceAnimaticAssetGenerationStatus(assetStateByNodeId: Record<string, unknown>) {
  const states = Object.values(assetStateByNodeId).map(asRecord)
  if (states.length === 0) return 'none'
  if (states.some((state) => readText(state.status) === 'failed')) return 'failed'
  if (states.some((state) => readText(state.status) === 'stale')) return 'stale'
  const readyCount = states.filter((state) => readText(state.status) === 'ready').length
  if (readyCount === states.length) return 'ready'
  if (readyCount > 0) return 'partial'
  return 'none'
}

export function withSequenceAnimaticContinuityAssetState(pack: Record<string, unknown>, graphInput: unknown) {
  const graph = parseSequenceAnimaticGraphV2(graphInput)
  const assetStateByNodeId = sequenceAnimaticContinuityAssetStates({
    graph,
    previousStates: asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
  })
  const visualDependencyEdges = sequenceAnimaticContinuityVisualDependencyEdges(graph)
  return {
    ...pack,
    assetStateByNodeId,
    asset_state_by_node_id: assetStateByNodeId,
    visualDependencyEdges,
    visual_dependency_edges: visualDependencyEdges,
    assetGenerationStatus: sequenceAnimaticAssetGenerationStatus(assetStateByNodeId),
    asset_generation_status: sequenceAnimaticAssetGenerationStatus(assetStateByNodeId),
  }
}
