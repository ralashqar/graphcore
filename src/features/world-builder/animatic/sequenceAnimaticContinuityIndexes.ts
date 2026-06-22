import { resolveAssetSourceUrl } from '../../../domain/assets'
import type { AssetDefinition } from '../../../domain/graphcore'
import type { OutputWorkflowRun } from '../../../domain/outputWorkflow'
import { spotCameraGridNodeId } from '../../../domain/sequenceAnimaticContinuityDependencies'
import { iconForWorldEntity } from '../../../domain/worldGraphHelpers'
import type { EntityIconId } from '../../../shared/entityIcons'

import type { SequenceAnimaticCoverageAnchorView } from './sequenceAnimaticCoverageIndexes'
import {
  isOutputRunStepActive,
  outputRunStepForNode,
} from './sequenceAnimaticProgressPresentation'
import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'

export type SequenceAnimaticContinuityAnchorView = {
  id: string
  name: string
  type: 'prop' | 'location_spot' | 'character'
  typeLabel: string
  iconId: EntityIconId
  thumbnailUrl: string | null
  status: 'planned' | 'generating' | 'extracting' | 'ready' | 'failed' | 'skipped'
  statusLabel: string
  progressLabel: string
  sourceAtlasNodeLabel: string
  shotIds: string[]
  blockIds: string[]
  usageLabel: string
  usageDetailLabel: string
}

export type SequenceAnimaticContinuityLocationView = {
  id: string
  name: string
  summary: string
  kind?: 'set' | 'zone' | 'spot' | 'angle' | 'viewpoint'
  worldLocationRefId?: string
  setId?: string
  zoneId?: string
  spotIds?: string[]
  assetStatus?: 'missing' | 'generating' | 'ready' | 'stale' | 'failed'
  assetStatusLabel?: string
  assetUrl?: string | null
  shotIds: string[]
  blockIds: string[]
}

export type SequenceAnimaticContinuityAssetTargetView = {
  nodeId: string
  name: string
  assetKind: string
  status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed'
  statusLabel: string
  actionLabel: string
  assetKey: string | null
  assetUrl: string | null
  blockIds: string[]
  shotIds: string[]
  commandStatus?: string
  commandDiagnostics?: string[]
  generationRequestId?: string | null
}

export type SequenceAnimaticContinuityGraphNodeKind = 'world_location' | 'set' | 'zone' | 'spot' | 'camera_grid' | 'viewpoint' | 'angle' | 'coverage_anchor' | 'temp_character' | 'prop' | 'faction' | 'vehicle' | 'group'

export type SequenceAnimaticContinuityGraphNodeLane = 'spatial' | 'temporary'

export type SequenceAnimaticContinuityGraphNodeView = {
  id: string
  label: string
  kind: SequenceAnimaticContinuityGraphNodeKind
  kindLabel: string
  lane: SequenceAnimaticContinuityGraphNodeLane
  summary: string
  shotIds: string[]
  blockIds: string[]
  parentId: string | null
  sourceReferenceIds: string[]
  assetStatus: SequenceAnimaticContinuityAssetTargetView['status'] | 'not_required'
  assetStatusLabel: string
  assetKind: string
  assetUrl: string | null
  required: boolean
  batchId: string | null
  baseVisualBrief: string
  overrideVisualBrief: string
  extraPromptDirection: string
  effectiveVisualBrief: string
  canGenerate: boolean
  generationTargetType: 'continuity_asset' | 'coverage_anchor' | 'none'
  generationRequestId: string | null
  assetHistoryKeys: string[]
}

export type SequenceAnimaticContinuityGraphEdgeView = {
  id: string
  source: string
  target: string
  kind: 'hierarchy' | 'dependency'
  label: string
}

export type SequenceAnimaticContinuityGraphBatchView = {
  id: string
  label: string
  status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed' | 'mixed'
  statusLabel: string
  nodeIds: string[]
  targetCount: number
  readyCount: number
  missingCount: number
  failedCount: number
  sourceReferenceIds: string[]
}

export type SequenceAnimaticContinuityGraphView = {
  nodes: SequenceAnimaticContinuityGraphNodeView[]
  edges: SequenceAnimaticContinuityGraphEdgeView[]
  batches: SequenceAnimaticContinuityGraphBatchView[]
  sceneNodeCount: number
  tempRefCount: number
  missingAssetCount: number
  readyAssetCount: number
  runningAssetCount: number
  failedAssetCount: number
}

export type SequenceAnimaticSpatialBindingNodeView = {
  id: string
  label: string
  kind: string
  kindLabel: string
  summary: string
  assetUrl: string | null
  assetStatusLabel: string
  actionLabel: string
  shotIds: string[]
  blockIds: string[]
}

export type SequenceAnimaticSpatialBindingView = {
  title: string
  compactLabel: string
  detailLabel: string
  statusLabel: string
  hierarchy: SequenceAnimaticSpatialBindingNodeView[]
  selectedNode: SequenceAnimaticSpatialBindingNodeView | null
  assetTargetNodeId: string | null
}

export type SequenceAnimaticSpatialInspectorView = SequenceAnimaticSpatialBindingView & {
  masterRequestId: string
  blockId: string
  shotId: string
  sceneId: string
  blockTitle: string
  shotTitle: string
}

export type SequenceAnimaticContinuityReferenceLookup = {
  name: string
  iconUrl: string | null
}

export function displayNameFromRefId(refId: string) {
  return refId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function sequenceAnimaticAnchorUsageLabel(anchor: Pick<SequenceAnimaticContinuityAnchorView, 'blockIds' | 'shotIds'>) {
  const blockLabel = anchor.blockIds.length > 0
    ? `${anchor.blockIds.length} block${anchor.blockIds.length === 1 ? '' : 's'}`
    : 'No blocks'
  const shotLabel = anchor.shotIds.length > 0
    ? `${anchor.shotIds.length} shot${anchor.shotIds.length === 1 ? '' : 's'}`
    : 'No shots'
  return `${blockLabel} / ${shotLabel}`
}

export function sequenceAnimaticAnchorUsageDetailLabel(anchor: Pick<SequenceAnimaticContinuityAnchorView, 'blockIds' | 'shotIds'>) {
  const blockLabel = anchor.blockIds.length > 0
    ? `Blocks ${anchor.blockIds.slice(0, 3).map((blockId) => blockId.replace(/^cinematic_v3_storyboard_group_0*/, '')).join(', ')}${anchor.blockIds.length > 3 ? ` +${anchor.blockIds.length - 3}` : ''}`
    : 'No block assignment'
  const shotLabel = anchor.shotIds.length > 0
    ? `Shots ${anchor.shotIds.slice(0, 5).map((shotId) => shotId.replace(/^shot_0*/, '')).join(', ')}${anchor.shotIds.length > 5 ? ` +${anchor.shotIds.length - 5}` : ''}`
    : 'No shot assignment'
  return `${blockLabel} / ${shotLabel}`
}

export function sequenceAnimaticContinuityAnchorViewMergeKey(anchor: Record<string, unknown>) {
  const type = trimOptionalString(anchor.anchorType) || trimOptionalString(anchor.type)
  const name = trimOptionalString(anchor.name)
    .toLowerCase()
    .replace(/['\u2019\u00e2\u20ac\u2122]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return type && name ? `${type}:${name}` : trimOptionalString(anchor.id)
}

function mergeSequenceAnimaticContinuityAnchorRecords(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
) {
  const previousId = trimOptionalString(previous.id)
  const incomingId = trimOptionalString(incoming.id)
  const type = trimOptionalString(incoming.anchorType) || trimOptionalString(incoming.type) || trimOptionalString(previous.anchorType) || trimOptionalString(previous.type)
  const name = trimOptionalString(previous.name) || trimOptionalString(incoming.name)
  const stableId = type && name
    ? `${type === 'character' ? 'char' : type === 'prop' ? 'prop' : 'anchor'}_${name.toLowerCase().replace(/['\u2019\u00e2\u20ac\u2122]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
    : ''
  const id = [previousId, incomingId].find((candidate) => candidate && candidate === stableId) || stableId || previousId || incomingId
  return {
    ...previous,
    ...incoming,
    id,
    name,
    shotIds: [...new Set([...readLooseArray(previous.shotIds), ...readLooseArray(incoming.shotIds)].map(trimOptionalString).filter(Boolean))],
    storyboardBlockIds: [...new Set([...readLooseArray(previous.storyboardBlockIds), ...readLooseArray(incoming.storyboardBlockIds)].map(trimOptionalString).filter(Boolean))],
  }
}

function stepFailedMessage(step: ReturnType<typeof outputRunStepForNode>) {
  return step?.status === 'failed' ? step.errorMessage || `${step.label || 'Step'} failed` : ''
}

export function buildSequenceAnimaticContinuityAnchorViews(input: {
  manifestAnchors: readonly Record<string, unknown>[]
  plannedAnchors: readonly Record<string, unknown>[]
  assetByKey: ReadonlyMap<string, AssetDefinition>
  run: OutputWorkflowRun | null
}) {
  const planStep = outputRunStepForNode(input.run, 'sequence_animatic_continuity_anchor_plan')
  const characterAtlasStep = outputRunStepForNode(input.run, 'sequence_animatic_character_anchor_atlas')
  const characterExtractStep = outputRunStepForNode(input.run, 'sequence_animatic_character_anchor_extract')
  const propAtlasStep = outputRunStepForNode(input.run, 'sequence_animatic_prop_anchor_atlas')
  const propExtractStep = outputRunStepForNode(input.run, 'sequence_animatic_prop_anchor_extract')
  const locationAtlasStep = outputRunStepForNode(input.run, 'sequence_animatic_location_anchor_atlas')
  const locationExtractStep = outputRunStepForNode(input.run, 'sequence_animatic_location_anchor_extract')
  const mergedByKey = new Map<string, Record<string, unknown>>()
  for (const anchor of input.plannedAnchors) {
    const key = sequenceAnimaticContinuityAnchorViewMergeKey(anchor)
    if (!key) continue
    const previous = mergedByKey.get(key)
    mergedByKey.set(key, previous ? mergeSequenceAnimaticContinuityAnchorRecords(previous, anchor) : anchor)
  }
  for (const anchor of input.manifestAnchors) {
    const key = sequenceAnimaticContinuityAnchorViewMergeKey(anchor)
    if (!key) continue
    const previous = mergedByKey.get(key)
    mergedByKey.set(key, previous ? mergeSequenceAnimaticContinuityAnchorRecords(previous, anchor) : anchor)
  }
  return [...mergedByKey.values()].filter((anchor) => {
    const rawAnchorType = trimOptionalString(anchor.anchorType) || trimOptionalString(anchor.type)
    const anchorType = rawAnchorType === 'temp_character'
      ? 'character'
      : ['prop', 'item', 'faction', 'crowd', 'vehicle', 'animatic_only'].includes(rawAnchorType)
        ? 'prop'
        : rawAnchorType
    return anchorType === 'character' || anchorType === 'prop' || anchorType === 'location_spot'
  }).map((anchor): SequenceAnimaticContinuityAnchorView => {
    const id = trimOptionalString(anchor.id)
    const rawAnchorType = trimOptionalString(anchor.anchorType) || trimOptionalString(anchor.type)
    const anchorType = rawAnchorType === 'temp_character'
      ? 'character'
      : ['prop', 'item', 'faction', 'crowd', 'vehicle', 'animatic_only'].includes(rawAnchorType)
        ? 'prop'
        : rawAnchorType
    const type: SequenceAnimaticContinuityAnchorView['type'] = anchorType === 'character'
      ? 'character'
      : anchorType === 'location_spot'
        ? 'location_spot'
        : 'prop'
    const assetKey = trimOptionalString(anchor.assetKey)
    const thumbnailUrl = assetKey ? resolveAssetSourceUrl(input.assetByKey.get(assetKey) ?? null) : null
    const atlasStep = type === 'character' ? characterAtlasStep : type === 'prop' ? propAtlasStep : locationAtlasStep
    const extractStep = type === 'character' ? characterExtractStep : type === 'prop' ? propExtractStep : locationExtractStep
    const failed = stepFailedMessage(extractStep) || stepFailedMessage(atlasStep)
    const status: SequenceAnimaticContinuityAnchorView['status'] = failed
      ? 'failed'
      : thumbnailUrl || assetKey
        ? 'ready'
        : isOutputRunStepActive(extractStep)
          ? 'extracting'
          : isOutputRunStepActive(atlasStep)
            ? 'generating'
            : planStep?.status === 'completed' || input.plannedAnchors.length > 0
              ? 'planned'
              : 'skipped'
    const statusLabel = status === 'ready'
      ? 'Ready'
      : status === 'extracting'
        ? 'Splitting'
        : status === 'generating'
          ? 'Generating'
          : status === 'failed'
            ? 'Failed'
            : status === 'planned'
              ? 'Planned'
              : 'Skipped'
    const progressLabel = failed
      || (status === 'ready'
        ? 'Anchor ref ready'
        : status === 'extracting'
          ? 'Splitting from atlas'
          : status === 'generating'
            ? (type === 'character' ? 'Generating character atlas' : type === 'prop' ? 'Generating prop atlas' : 'Generating location atlas')
            : status === 'planned'
              ? 'Waiting for atlas generation'
              : 'No anchor image needed')
    const view: Omit<SequenceAnimaticContinuityAnchorView, 'usageLabel' | 'usageDetailLabel'> = {
      id,
      name: trimOptionalString(anchor.name) || displayNameFromRefId(id),
      type,
      typeLabel: type === 'character' ? 'Temporary character' : type === 'location_spot' ? 'Location spot' : 'Prop',
      iconId: iconForWorldEntity(type === 'character' ? 'actor' : type === 'location_spot' ? 'location_spot' : 'object'),
      thumbnailUrl,
      status,
      statusLabel,
      progressLabel,
      sourceAtlasNodeLabel: type === 'character' ? 'Character Anchor Atlas' : type === 'prop' ? 'Prop Anchor Atlas' : 'Location Anchor Atlas',
      shotIds: [
        ...readLooseArray(anchor.shotIds),
        ...readLooseArray(anchor.usedShotIds),
      ].map(trimOptionalString).filter(Boolean),
      blockIds: [
        ...readLooseArray(anchor.storyboardBlockIds),
        ...readLooseArray(anchor.blockIds),
      ].map(trimOptionalString).filter(Boolean),
    }
    return {
      ...view,
      usageLabel: sequenceAnimaticAnchorUsageLabel(view),
      usageDetailLabel: sequenceAnimaticAnchorUsageDetailLabel(view),
    }
  })
}

export function sequenceAnimaticContinuityAssetStatusLabel(status: SequenceAnimaticContinuityAssetTargetView['status']) {
  if (status === 'ready') return 'Asset ready'
  if (status === 'generating') return 'Generating asset'
  if (status === 'stale') return 'Asset stale'
  if (status === 'failed') return 'Asset failed'
  return 'Asset missing'
}

export function sequenceAnimaticContinuityAssetActionLabel(status: SequenceAnimaticContinuityAssetTargetView['status']) {
  if (status === 'ready') return 'Regenerate'
  if (status === 'stale') return 'Regenerate stale'
  if (status === 'failed') return 'Retry'
  if (status === 'generating') return 'Generating'
  return 'Generate'
}

export function sequenceAnimaticContinuityGraphKindLabel(kind: SequenceAnimaticContinuityGraphNodeKind) {
  if (kind === 'world_location') return 'World location'
  if (kind === 'set') return 'Set'
  if (kind === 'zone') return 'Zone'
  if (kind === 'spot') return 'Spot'
  if (kind === 'camera_grid') return 'Camera grid'
  if (kind === 'viewpoint' || kind === 'angle') return 'Viewpoint'
  if (kind === 'coverage_anchor') return 'Coverage anchor'
  if (kind === 'temp_character') return 'Temp character'
  if (kind === 'prop') return 'Prop / item'
  if (kind === 'faction') return 'Faction / crowd'
  if (kind === 'vehicle') return 'Vehicle'
  return 'Local ref'
}

export function sequenceAnimaticContinuityGraphIconId(kind: SequenceAnimaticContinuityGraphNodeKind): EntityIconId {
  if (kind === 'temp_character') return 'character'
  if (kind === 'prop') return 'item'
  if (kind === 'faction' || kind === 'group') return 'group'
  if (kind === 'vehicle') return 'cinematic'
  if (kind === 'camera_grid' || kind === 'viewpoint' || kind === 'angle' || kind === 'coverage_anchor') return 'camera'
  return 'environment'
}

function sequenceAnimaticContinuityGraphStatusLabel(status: SequenceAnimaticContinuityGraphNodeView['assetStatus']) {
  return status === 'not_required' ? 'Asset not required' : sequenceAnimaticContinuityAssetStatusLabel(status)
}

function sequenceAnimaticContinuityGraphBatchStatusLabel(status: SequenceAnimaticContinuityGraphBatchView['status']) {
  if (status === 'mixed') return 'Mixed asset state'
  return sequenceAnimaticContinuityAssetStatusLabel(status)
}

export function buildSequenceAnimaticContinuityGraphView(input: {
  continuityLocationSets: readonly SequenceAnimaticContinuityLocationView[]
  continuityLocationAngles: readonly SequenceAnimaticContinuityLocationView[]
  continuityAnchors: readonly SequenceAnimaticContinuityAnchorView[]
  coverageAnchors: readonly SequenceAnimaticCoverageAnchorView[]
  continuityAssetTargets: readonly SequenceAnimaticContinuityAssetTargetView[]
  visualDependencyEdges: readonly Record<string, unknown>[]
  sceneGraphOverrides?: ReadonlyMap<string, {
    visualBriefOverride: string
    extraPromptDirection: string
    lastGeneratedAssetKey: string
    previousAssetKeys: string[]
  }>
  resolveReference: (refId: string, role?: string) => SequenceAnimaticContinuityReferenceLookup | null
}): SequenceAnimaticContinuityGraphView {
  const targetByNodeId = new Map(input.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const nodeById = new Map<string, SequenceAnimaticContinuityGraphNodeView>()
  const edgeById = new Map<string, SequenceAnimaticContinuityGraphEdgeView>()
  const addEdge = (source: string, target: string, kind: SequenceAnimaticContinuityGraphEdgeView['kind'], label = '') => {
    if (!source || !target || source === target || !nodeById.has(source) || !nodeById.has(target)) return
    const id = `${kind}:${source}:${target}`
    if (!edgeById.has(id)) edgeById.set(id, { id, source, target, kind, label })
  }
  const addNode = (node: Omit<SequenceAnimaticContinuityGraphNodeView, 'kindLabel' | 'assetStatusLabel' | 'baseVisualBrief' | 'overrideVisualBrief' | 'extraPromptDirection' | 'effectiveVisualBrief' | 'canGenerate' | 'generationTargetType' | 'generationRequestId' | 'assetHistoryKeys'>) => {
    if (!node.id) return
    const target = targetByNodeId.get(node.id) ?? null
    const assetStatus = target?.status ?? node.assetStatus
    const previous = nodeById.get(node.id)
    const override = input.sceneGraphOverrides?.get(node.id) ?? null
    const baseVisualBrief = trimOptionalString(node.summary)
    const overrideVisualBrief = override?.visualBriefOverride ?? ''
    const extraPromptDirection = override?.extraPromptDirection ?? ''
    const assetHistoryKeys = [
      ...(previous?.assetHistoryKeys ?? []),
      ...(target?.assetKey ? [target.assetKey] : []),
      ...(override?.lastGeneratedAssetKey ? [override.lastGeneratedAssetKey] : []),
      ...(override?.previousAssetKeys ?? []),
    ].filter((assetKey, index, values) => Boolean(assetKey) && values.indexOf(assetKey) === index)
    nodeById.set(node.id, {
      ...node,
      kindLabel: sequenceAnimaticContinuityGraphKindLabel(node.kind),
      shotIds: [...new Set([...(previous?.shotIds ?? []), ...node.shotIds])],
      blockIds: [...new Set([...(previous?.blockIds ?? []), ...node.blockIds])],
      sourceReferenceIds: [...new Set([...(previous?.sourceReferenceIds ?? []), ...node.sourceReferenceIds])],
      assetStatus,
      assetStatusLabel: sequenceAnimaticContinuityGraphStatusLabel(assetStatus),
      assetKind: target?.assetKind ?? node.assetKind,
      assetUrl: target?.assetUrl ?? node.assetUrl,
      required: node.required || previous?.required || false,
      batchId: node.batchId ?? previous?.batchId ?? null,
      baseVisualBrief: previous?.baseVisualBrief || baseVisualBrief,
      overrideVisualBrief: overrideVisualBrief || previous?.overrideVisualBrief || '',
      extraPromptDirection: extraPromptDirection || previous?.extraPromptDirection || '',
      effectiveVisualBrief: overrideVisualBrief || previous?.overrideVisualBrief || baseVisualBrief || previous?.effectiveVisualBrief || '',
      canGenerate: Boolean(target) || node.kind === 'coverage_anchor',
      generationTargetType: node.kind === 'coverage_anchor' ? 'coverage_anchor' : target ? 'continuity_asset' : 'none',
      generationRequestId: null,
      assetHistoryKeys,
    })
  }
  const ensureWorldLocationNode = (worldLocationRefId: string) => {
    const cleanId = trimOptionalString(worldLocationRefId)
    if (!cleanId || nodeById.has(cleanId)) return
    const resolved = input.resolveReference(cleanId, 'Location')
    addNode({
      id: cleanId,
      label: resolved?.name ?? displayNameFromRefId(cleanId),
      kind: 'world_location',
      lane: 'spatial',
      summary: 'Canonical world location used as the parent reference.',
      shotIds: [],
      blockIds: [],
      parentId: null,
      sourceReferenceIds: [],
      assetStatus: 'not_required',
      assetKind: 'world_location',
      assetUrl: resolved?.iconUrl ?? null,
      required: false,
      batchId: null,
    })
  }
  for (const entry of input.continuityLocationSets) {
    const kind = entry.kind === 'zone' || entry.kind === 'spot' ? entry.kind : 'set'
    const id = entry.id || entry.name
    const parentId = kind === 'set'
      ? entry.worldLocationRefId ?? null
      : kind === 'zone'
        ? entry.setId || entry.worldLocationRefId || null
        : entry.zoneId || entry.setId || entry.worldLocationRefId || null
    if (entry.worldLocationRefId) ensureWorldLocationNode(entry.worldLocationRefId)
    addNode({
      id,
      label: entry.name || displayNameFromRefId(id),
      kind,
      lane: 'spatial',
      summary: entry.summary,
      shotIds: entry.shotIds,
      blockIds: entry.blockIds,
      parentId,
      sourceReferenceIds: [entry.worldLocationRefId, entry.setId, entry.zoneId].map((value) => value ?? '').filter(Boolean),
      assetStatus: entry.assetStatus ?? 'missing',
      assetKind: kind === 'set' ? 'location_set' : kind === 'zone' ? 'location_zone' : 'location_spot',
      assetUrl: entry.assetUrl ?? null,
      required: entry.shotIds.length > 0,
      batchId: null,
    })
    if (kind === 'spot') {
      const gridId = spotCameraGridNodeId(id)
      addNode({
        id: gridId,
        label: 'Camera grid',
        kind: 'camera_grid',
        lane: 'spatial',
        summary: `Reusable camera-angle grid around ${entry.name || displayNameFromRefId(id)}, generated from the parent zone map and spot reference.`,
        shotIds: entry.shotIds,
        blockIds: entry.blockIds,
        parentId: id,
        sourceReferenceIds: [entry.worldLocationRefId, entry.setId, entry.zoneId, id].map((value) => value ?? '').filter(Boolean),
        assetStatus: targetByNodeId.get(gridId)?.status ?? 'missing',
        assetKind: 'spot_camera_grid',
        assetUrl: targetByNodeId.get(gridId)?.assetUrl ?? null,
        required: entry.shotIds.length > 0,
        batchId: null,
      })
    }
  }
  for (const entry of input.continuityLocationAngles) {
    const id = entry.id || entry.name
    const parentId = entry.spotIds?.[0] || entry.zoneId || entry.setId || entry.worldLocationRefId || null
    if (entry.worldLocationRefId) ensureWorldLocationNode(entry.worldLocationRefId)
    addNode({
      id,
      label: entry.name || displayNameFromRefId(id),
      kind: 'viewpoint',
      lane: 'spatial',
      summary: entry.summary,
      shotIds: entry.shotIds,
      blockIds: entry.blockIds,
      parentId,
      sourceReferenceIds: [entry.worldLocationRefId, entry.setId, entry.zoneId, ...(entry.spotIds ?? [])].map((value) => value ?? '').filter(Boolean),
      assetStatus: entry.assetStatus ?? 'missing',
      assetKind: 'location_angle',
      assetUrl: entry.assetUrl ?? null,
      required: entry.shotIds.length > 0,
      batchId: null,
    })
  }
  for (const anchor of input.continuityAnchors) {
    const kind: SequenceAnimaticContinuityGraphNodeKind = anchor.type === 'character'
      ? 'temp_character'
      : anchor.type === 'prop'
        ? 'prop'
        : 'spot'
    addNode({
      id: anchor.id,
      label: anchor.name,
      kind,
      lane: anchor.type === 'location_spot' ? 'spatial' : 'temporary',
      summary: anchor.usageDetailLabel,
      shotIds: anchor.shotIds,
      blockIds: anchor.blockIds,
      parentId: null,
      sourceReferenceIds: [],
      assetStatus: targetByNodeId.get(anchor.id)?.status ?? (anchor.status === 'ready' ? 'ready' : anchor.status === 'failed' ? 'failed' : anchor.status === 'generating' || anchor.status === 'extracting' ? 'generating' : 'missing'),
      assetKind: anchor.type === 'character' ? 'temporary_character' : anchor.type === 'prop' ? 'prop' : 'location_spot',
      assetUrl: anchor.thumbnailUrl,
      required: anchor.shotIds.length > 0,
      batchId: null,
    })
  }
  for (const anchor of input.coverageAnchors) {
    const parentId = anchor.primarySpotId
      || anchor.spotIds[0]
      || anchor.viewpointId
      || anchor.zoneId
      || anchor.setId
      || null
    addNode({
      id: anchor.id,
      label: anchor.title || displayNameFromRefId(anchor.id),
      kind: 'coverage_anchor',
      lane: 'spatial',
      summary: [
        anchor.setupKindLabel,
        anchor.stagingBrief,
        anchor.screenDirection ? `Screen direction: ${anchor.screenDirection}` : '',
      ].filter(Boolean).join(' / '),
      shotIds: anchor.shotIds,
      blockIds: anchor.blockIds,
      parentId,
      sourceReferenceIds: [
        anchor.setId,
        anchor.zoneId,
        anchor.primarySpotId,
        ...anchor.spotIds,
        anchor.viewpointId,
        ...anchor.characterRefIds,
      ].map((value) => value ?? '').filter(Boolean),
      assetStatus: anchor.status === 'ready'
        ? 'ready'
        : anchor.status === 'failed'
          ? 'failed'
          : anchor.status === 'generating' || anchor.status === 'queued'
            ? 'generating'
            : 'missing',
      assetKind: 'coverage_anchor',
      assetUrl: anchor.assetUrl,
      required: anchor.shotIds.length > 0,
      batchId: null,
    })
  }
  const parentKindForChild = (child: SequenceAnimaticContinuityGraphNodeView): SequenceAnimaticContinuityGraphNodeKind => {
    if (child.kind === 'set') return 'world_location'
    if (child.kind === 'zone') return 'set'
    if (child.kind === 'spot') return 'zone'
    if (child.kind === 'camera_grid') return 'spot'
    if (child.kind === 'viewpoint' || child.kind === 'angle') return 'spot'
    if (child.kind === 'coverage_anchor') return 'spot'
    return 'world_location'
  }
  for (const node of [...nodeById.values()]) {
    const parentId = trimOptionalString(node.parentId)
    if (!parentId || nodeById.has(parentId)) continue
    const parentKind = parentKindForChild(node)
    const resolved = parentKind === 'world_location' ? input.resolveReference(parentId, 'Location') : null
    addNode({
      id: parentId,
      label: resolved?.name ?? displayNameFromRefId(parentId),
      kind: parentKind,
      lane: 'spatial',
      summary: 'Referenced parent in the animatic scene hierarchy.',
      shotIds: [],
      blockIds: [],
      parentId: null,
      sourceReferenceIds: [],
      assetStatus: parentKind === 'world_location' ? 'not_required' : 'missing',
      assetKind: parentKind === 'world_location' ? 'world_location' : `location_${parentKind}`,
      assetUrl: resolved?.iconUrl ?? null,
      required: false,
      batchId: null,
    })
  }
  for (const node of [...nodeById.values()]) {
    if (node.parentId) addEdge(node.parentId, node.id, 'hierarchy', 'contains')
  }
  for (const anchor of input.coverageAnchors) {
    if (anchor.continuityFromSetupId) addEdge(anchor.continuityFromSetupId, anchor.id, 'dependency', anchor.continuityMode || 'continues setup')
  }
  for (const edge of input.visualDependencyEdges) {
    const source = trimOptionalString(edge.sourceNodeId ?? edge.source_node_id ?? edge.sourceId ?? edge.source_id ?? edge.from ?? edge.source)
    const target = trimOptionalString(edge.targetNodeId ?? edge.target_node_id ?? edge.targetId ?? edge.target_id ?? edge.to ?? edge.target)
    const relationship = trimOptionalString(edge.relationship).replace(/_/g, ' ')
    addEdge(source, target, 'dependency', trimOptionalString(edge.label) || relationship || 'visual reference')
  }
  const batchGroups = new Map<string, SequenceAnimaticContinuityAssetTargetView[]>()
  for (const target of input.continuityAssetTargets) {
    const kindGroup = target.assetKind === 'spot_camera_grid' ? 'camera_grids'
      : target.assetKind.includes('angle') ? 'viewpoint_grid'
      : target.assetKind.includes('spot') ? 'spot_grid'
        : target.assetKind.includes('location') ? 'location_refs'
          : target.assetKind.includes('character') ? 'temp_character_refs'
            : target.assetKind.includes('prop') ? 'prop_refs'
              : 'local_refs'
    const blockGroup = target.blockIds[0] ?? 'global'
    const key = `${kindGroup}:${blockGroup}`
    batchGroups.set(key, [...(batchGroups.get(key) ?? []), target])
  }
  const batches = [...batchGroups.entries()].map(([id, targets]): SequenceAnimaticContinuityGraphBatchView => {
    const statuses = new Set(targets.map((target) => target.status))
    const status = statuses.size === 1 ? targets[0]?.status ?? 'missing' : 'mixed'
    return {
      id,
      label: id.replace(/_/g, ' ').replace(/:/g, ' / '),
      status,
      statusLabel: sequenceAnimaticContinuityGraphBatchStatusLabel(status),
      nodeIds: targets.map((target) => target.nodeId),
      targetCount: targets.length,
      readyCount: targets.filter((target) => target.status === 'ready').length,
      missingCount: targets.filter((target) => target.status === 'missing' || target.status === 'stale').length,
      failedCount: targets.filter((target) => target.status === 'failed').length,
      sourceReferenceIds: [...new Set(targets.flatMap((target) => nodeById.get(target.nodeId)?.sourceReferenceIds ?? []))],
    }
  })
  const nodes = [...nodeById.values()].sort((left, right) => (
    left.lane.localeCompare(right.lane)
    || left.kind.localeCompare(right.kind)
    || left.label.localeCompare(right.label)
  ))
  return {
    nodes,
    edges: [...edgeById.values()],
    batches,
    sceneNodeCount: nodes.filter((node) => node.lane === 'spatial').length,
    tempRefCount: nodes.filter((node) => node.lane === 'temporary').length,
    missingAssetCount: input.continuityAssetTargets.filter((target) => target.status === 'missing' || target.status === 'stale').length,
    readyAssetCount: input.continuityAssetTargets.filter((target) => target.status === 'ready').length,
    runningAssetCount: input.continuityAssetTargets.filter((target) => target.status === 'generating').length,
    failedAssetCount: input.continuityAssetTargets.filter((target) => target.status === 'failed').length,
  }
}

export function buildSequenceAnimaticSpatialBindingView(input: {
  shot: Record<string, unknown>
  binding: Record<string, unknown>
  continuityGraphView: SequenceAnimaticContinuityGraphView
  continuityAssetTargets: readonly SequenceAnimaticContinuityAssetTargetView[]
  resolveReference: (refId: string, role?: string) => SequenceAnimaticContinuityReferenceLookup | null
}): SequenceAnimaticSpatialBindingView {
  const sceneBinding = readLooseRecord(input.shot.sceneBinding ?? input.shot.scene_binding)
  const setId = trimOptionalString(input.binding.setId)
    || trimOptionalString(sceneBinding.setId ?? sceneBinding.set_id)
    || trimOptionalString(input.shot.continuitySetId)
  const zoneId = trimOptionalString(input.binding.zoneId)
    || trimOptionalString(sceneBinding.zoneId ?? sceneBinding.zone_id)
    || trimOptionalString(input.shot.continuityZoneId)
  const primarySpotId = trimOptionalString(input.binding.primarySpotId)
    || trimOptionalString(sceneBinding.primarySpotId ?? sceneBinding.primary_spot_id)
  const viewpointId = trimOptionalString(input.binding.viewpointId)
    || trimOptionalString(sceneBinding.viewpointId ?? sceneBinding.viewpoint_id)
  const angleId = viewpointId
    || trimOptionalString(input.binding.angleId)
    || trimOptionalString(sceneBinding.angleId ?? sceneBinding.angle_id)
    || trimOptionalString(input.shot.continuityAngleId)
  const spotIds = [
    primarySpotId,
    ...readLooseArray(input.binding.spotIds),
    ...readLooseArray(sceneBinding.spotIds ?? sceneBinding.spot_ids),
  ].map(trimOptionalString).filter(Boolean).filter((spotId, index, values) => values.indexOf(spotId) === index)
  const worldLocationRefId = trimOptionalString(input.binding.worldLocationRefId)
    || trimOptionalString(sceneBinding.worldLocationRefId ?? sceneBinding.world_location_ref_id)
    || trimOptionalString(input.shot.worldLocationRefId)
    || trimOptionalString(input.shot.locationRefId)
  const graphNodeById = new Map(input.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const targetByNodeId = new Map(input.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const makeNode = (id: string, fallbackKind: string, fallbackKindLabel: string): SequenceAnimaticSpatialBindingNodeView | null => {
    const cleanId = trimOptionalString(id)
    if (!cleanId) return null
    const graphNode = graphNodeById.get(cleanId) ?? null
    const target = targetByNodeId.get(cleanId) ?? null
    const resolved = fallbackKind === 'world_location' ? input.resolveReference(cleanId, 'Location') : null
    return {
      id: cleanId,
      label: graphNode?.label || resolved?.name || displayNameFromRefId(cleanId),
      kind: graphNode?.kind || fallbackKind,
      kindLabel: graphNode?.kindLabel || fallbackKindLabel,
      summary: graphNode?.summary || '',
      assetUrl: graphNode?.assetUrl || resolved?.iconUrl || target?.assetUrl || null,
      assetStatusLabel: graphNode?.assetStatusLabel || target?.statusLabel || (fallbackKind === 'world_location' ? 'World reference' : 'Asset missing'),
      actionLabel: target?.actionLabel || '',
      shotIds: graphNode?.shotIds ?? target?.shotIds ?? [],
      blockIds: graphNode?.blockIds ?? target?.blockIds ?? [],
    }
  }
  const hierarchy = [
    makeNode(worldLocationRefId, 'world_location', 'World location'),
    makeNode(setId, 'set', 'Set'),
    makeNode(zoneId, 'zone', 'Zone'),
    ...spotIds.map((spotId) => makeNode(spotId, 'spot', 'Spot')),
    makeNode(angleId, 'viewpoint', 'Viewpoint'),
  ].filter((node): node is SequenceAnimaticSpatialBindingNodeView => Boolean(node))
  const preferredNode = hierarchy.find((node) => node.kind === 'spot')
    ?? hierarchy.find((node) => node.kind === 'zone')
    ?? hierarchy.find((node) => node.kind === 'set')
    ?? hierarchy.find((node) => node.kind === 'world_location')
    ?? hierarchy.find((node) => node.kind === 'viewpoint' || node.kind === 'angle')
    ?? null
  const detailLabel = hierarchy.map((node) => node.label).filter(Boolean).join(' / ')
  return {
    title: preferredNode?.label || 'Spatial binding pending',
    compactLabel: preferredNode?.label || detailLabel || 'Spatial binding pending',
    detailLabel,
    statusLabel: preferredNode?.assetStatusLabel || (hierarchy.length > 0 ? 'Scene binding recorded' : 'No scene binding recorded'),
    hierarchy,
    selectedNode: preferredNode,
    assetTargetNodeId: preferredNode && targetByNodeId.has(preferredNode.id) ? preferredNode.id : null,
  }
}
