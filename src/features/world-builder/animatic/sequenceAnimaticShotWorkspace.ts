import type { EntityIconId } from '../../../shared/entityIcons'
import type {
  SequenceAnimaticShotView,
  SequenceAnimaticViewModel,
} from './sequenceAnimaticViewModel'

type SequenceAnimaticBlockView = SequenceAnimaticViewModel['blocks'][number]
type SequenceAnimaticContinuityAssetTargetView = SequenceAnimaticViewModel['continuityAssetTargets'][number]
type SequenceAnimaticCoverageAnchorView = SequenceAnimaticViewModel['coverageAnchors'][number]
type SequenceAnimaticSpatialBindingNodeView = SequenceAnimaticShotView['spatialBindingView']['hierarchy'][number]

export type SequenceAnimaticShotTimelineItem = {
  key: string
  sceneId: string
  sceneTitle: string
  blockId: string
  blockTitle: string
  block: SequenceAnimaticBlockView
  shot: SequenceAnimaticShotView
  thumbnailUrl: string | null
  keyframeReady: boolean
  running: boolean
  missingReferenceCount: number
}

export type SequenceAnimaticShotIngredientKind =
  | 'continuity_asset'
  | 'coverage_anchor'
  | 'scene_graph'
  | 'reference'
  | 'dialogue'
  | 'performance'
  | 'camera'
  | 'lighting'

export type SequenceAnimaticShotIngredient = {
  id: string
  name: string
  typeLabel: string
  kind: SequenceAnimaticShotIngredientKind
  iconId: EntityIconId
  iconUrl: string | null
  imageUrl: string | null
  fullImageUrl: string | null
  status: 'ready' | 'missing' | 'generating' | 'stale' | 'failed' | 'not_required'
  statusLabel: string
  actionLabel: string
  usageLabel: string
  nodeId: string | null
  target: SequenceAnimaticContinuityAssetTargetView | null
  coverageAnchor: SequenceAnimaticCoverageAnchorView | null
  spatialNode: SequenceAnimaticSpatialBindingNodeView | null
  requiredForKeyframe: boolean
  canGenerate: boolean
  visualBrief: string
}

export type SequenceAnimaticShotKeyframePreflight = {
  status: 'ready' | 'blocked' | 'generating'
  missingIngredients: SequenceAnimaticShotIngredient[]
  generatingIngredients: SequenceAnimaticShotIngredient[]
  readyIngredients: SequenceAnimaticShotIngredient[]
  blockingTargets: SequenceAnimaticContinuityAssetTargetView[]
  generatingTargets: SequenceAnimaticContinuityAssetTargetView[]
  coverageAnchor: SequenceAnimaticCoverageAnchorView | null
}

export type SequenceAnimaticShotPanelCue = {
  id: string
  kind: 'action' | 'dialogue'
  start: number
  end: number
  text: string
  speakerName: string
  iconId: EntityIconId
  iconUrl: string | null
  metaLabel: string
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function displayNameFromRefId(refId: string) {
  return refId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function lookupKey(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function addLookupAlias<T>(lookup: Map<string, T>, value: unknown, target: T) {
  const key = lookupKey(value)
  if (key && !lookup.has(key)) lookup.set(key, target)
}

function continuityTargetLookup(model: SequenceAnimaticViewModel) {
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const lookup = new Map<string, SequenceAnimaticContinuityAssetTargetView>()
  for (const target of model.continuityAssetTargets) {
    const graphNode = graphNodeById.get(target.nodeId) ?? null
    addLookupAlias(lookup, target.nodeId, target)
    addLookupAlias(lookup, target.name, target)
    addLookupAlias(lookup, graphNode?.id, target)
    addLookupAlias(lookup, graphNode?.label, target)
    for (const sourceReferenceId of graphNode?.sourceReferenceIds ?? []) {
      addLookupAlias(lookup, sourceReferenceId, target)
    }
  }
  return lookup
}

function targetForReference(
  targetLookup: ReadonlyMap<string, SequenceAnimaticContinuityAssetTargetView>,
  ...values: unknown[]
) {
  const requestedKeys = values.map(lookupKey).filter(Boolean)
  for (const value of values) {
    const target = targetLookup.get(lookupKey(value))
    if (target) return target
  }
  for (const requestedKey of requestedKeys) {
    const matches = new Map<string, SequenceAnimaticContinuityAssetTargetView>()
    for (const [alias, target] of targetLookup.entries()) {
      if (
        alias === `temp_${requestedKey}`
        || alias.endsWith(`_${requestedKey}`)
        || requestedKey.endsWith(`_${alias}`)
      ) {
        matches.set(target.nodeId, target)
      }
    }
    if (matches.size === 1) return [...matches.values()][0] ?? null
  }
  return null
}

function statusFromTarget(target: SequenceAnimaticContinuityAssetTargetView | null | undefined): SequenceAnimaticShotIngredient['status'] {
  if (!target) return 'not_required'
  if (target.status === 'ready') return 'ready'
  if (target.status === 'generating') return 'generating'
  if (target.status === 'stale') return 'stale'
  if (target.status === 'failed') return 'failed'
  return 'missing'
}

function iconForIngredientKind(kind: string): EntityIconId {
  if (kind === 'temp_character' || kind === 'character') return 'character'
  if (kind === 'prop' || kind === 'item') return 'item'
  if (kind === 'camera_grid' || kind === 'viewpoint' || kind === 'angle' || kind === 'coverage_anchor') return 'camera'
  if (kind === 'dialogue' || kind === 'performance') return 'character'
  return 'environment'
}

function statusLabelForIngredient(input: {
  status: SequenceAnimaticShotIngredient['status']
  target?: SequenceAnimaticContinuityAssetTargetView | null
  coverageAnchor?: SequenceAnimaticCoverageAnchorView | null
  fallback?: string
}) {
  if (input.target?.statusLabel) return input.target.statusLabel
  if (input.coverageAnchor?.statusLabel) return input.coverageAnchor.statusLabel
  if (input.fallback) return input.fallback
  if (input.status === 'ready') return 'Ready'
  if (input.status === 'generating') return 'Generating'
  if (input.status === 'stale') return 'Stale'
  if (input.status === 'failed') return 'Failed'
  if (input.status === 'missing') return 'Missing'
  return 'Reference only'
}

function actionLabelForIngredient(status: SequenceAnimaticShotIngredient['status'], target?: SequenceAnimaticContinuityAssetTargetView | null) {
  if (target?.actionLabel) return target.actionLabel
  if (status === 'ready') return 'Regenerate'
  if (status === 'stale') return 'Regenerate stale'
  if (status === 'failed') return 'Retry'
  if (status === 'generating') return 'Generating'
  if (status === 'missing') return 'Generate'
  return ''
}

function referenceFallbackStatus(input: {
  isContinuityAnchor?: boolean
  statusLabel?: string
  hasReferenceArt: boolean
}): SequenceAnimaticShotIngredient['status'] {
  if (input.hasReferenceArt) return 'ready'
  if (!input.isContinuityAnchor) return 'not_required'
  const label = cleanText(input.statusLabel).toLowerCase()
  if (label.includes('generating') || label.includes('extracting') || label.includes('splitting')) return 'generating'
  if (label.includes('failed')) return 'failed'
  if (label.includes('stale')) return 'stale'
  return 'missing'
}

function ingredientDedupeKey(ingredient: SequenceAnimaticShotIngredient) {
  if (ingredient.coverageAnchor) return `coverage:${ingredient.coverageAnchor.id}`
  const nodeId = cleanText(ingredient.target?.nodeId || ingredient.nodeId)
  if (nodeId) return `node:${nodeId.toLowerCase()}`
  return `fallback:${ingredient.kind}:${ingredient.name.toLowerCase()}`
}

function ingredientMergePriority(ingredient: SequenceAnimaticShotIngredient) {
  const kindScore: Record<SequenceAnimaticShotIngredientKind, number> = {
    continuity_asset: 60,
    coverage_anchor: 55,
    scene_graph: 45,
    reference: 40,
    performance: 25,
    dialogue: 20,
    camera: 15,
    lighting: 15,
  }
  return kindScore[ingredient.kind]
    + (ingredient.requiredForKeyframe ? 8 : 0)
    + (ingredient.canGenerate ? 4 : 0)
    + (ingredient.fullImageUrl ? 2 : 0)
    + (ingredient.imageUrl ? 1 : 0)
}

function mergeIngredientRows(
  previous: SequenceAnimaticShotIngredient,
  ingredient: SequenceAnimaticShotIngredient,
): SequenceAnimaticShotIngredient {
  const primary = ingredientMergePriority(ingredient) > ingredientMergePriority(previous) ? ingredient : previous
  const secondary = primary === ingredient ? previous : ingredient
  return {
    ...primary,
    requiredForKeyframe: previous.requiredForKeyframe || ingredient.requiredForKeyframe,
    canGenerate: previous.canGenerate || ingredient.canGenerate,
    imageUrl: primary.imageUrl || secondary.imageUrl,
    fullImageUrl: primary.fullImageUrl || secondary.fullImageUrl,
    iconUrl: primary.iconUrl || secondary.iconUrl,
    target: primary.target ?? secondary.target,
    coverageAnchor: primary.coverageAnchor ?? secondary.coverageAnchor,
    spatialNode: primary.spatialNode ?? secondary.spatialNode,
    usageLabel: [previous.usageLabel, ingredient.usageLabel].filter(Boolean).find((label) => label.includes('Shot')) ?? (primary.usageLabel || secondary.usageLabel),
    visualBrief: primary.visualBrief || secondary.visualBrief,
  }
}

function dedupeIngredients(ingredients: SequenceAnimaticShotIngredient[]) {
  const byId = new Map<string, SequenceAnimaticShotIngredient>()
  for (const ingredient of ingredients) {
    const key = ingredientDedupeKey(ingredient)
    const previous = byId.get(key)
    if (!previous) {
      byId.set(key, ingredient)
      continue
    }
    byId.set(key, mergeIngredientRows(previous, ingredient))
  }
  return [...byId.values()]
}

function preferredSpatialIngredientNode(shot: SequenceAnimaticShotView) {
  const hierarchy = shot.spatialBindingView.hierarchy
  if (hierarchy.length === 0) return null
  const targetNodeId = cleanText(shot.spatialBindingView.assetTargetNodeId)
  const isSpotLike = (node: SequenceAnimaticSpatialBindingNodeView) => (
    node.kind === 'spot' || node.kind === 'location_spot'
  )
  if (targetNodeId) {
    const targetSpot = hierarchy.find((node) => node.id === targetNodeId && isSpotLike(node))
    if (targetSpot) return targetSpot
  }
  const firstSpot = hierarchy.find(isSpotLike)
  if (firstSpot) return firstSpot
  if (targetNodeId) {
    const targetNode = hierarchy.find((node) => node.id === targetNodeId)
    if (targetNode) return targetNode
  }
  return hierarchy[hierarchy.length - 1] ?? null
}

function selectedSpatialDependencyNodeIdsForShot(shot: SequenceAnimaticShotView) {
  const node = preferredSpatialIngredientNode(shot)
  return new Set(node?.id ? [node.id] : [])
}

function isSpotLikeNode(node: { kind?: string }) {
  return node.kind === 'spot' || node.kind === 'location_spot'
}

function isZoneLikeNode(node: { kind?: string }) {
  return node.kind === 'zone' || node.kind === 'location_zone'
}

function isSpotLikeTarget(
  model: SequenceAnimaticViewModel,
  target: SequenceAnimaticContinuityAssetTargetView,
) {
  const graphNode = model.continuityGraphView.nodes.find((node) => node.id === target.nodeId) ?? null
  return target.assetKind === 'location_spot'
    || graphNode?.kind === 'spot'
}

function shotReadyZoneReference(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
  preferredZoneId = '',
) {
  const targetByNodeId = new Map(model.continuityAssetTargets.map((entry) => [entry.nodeId, entry] as const))
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const hierarchyZones = shot.spatialBindingView.hierarchy.filter(isZoneLikeNode)
  const candidateZoneIds = [
    preferredZoneId,
    ...hierarchyZones.map((node) => node.id),
  ].filter((nodeId, index, values) => nodeId && values.indexOf(nodeId) === index)

  for (const zoneId of candidateZoneIds) {
    const zoneTarget = targetByNodeId.get(zoneId) ?? null
    const zoneNode = hierarchyZones.find((node) => node.id === zoneId) ?? null
    const graphNode = graphNodeById.get(zoneId) ?? null
    if (zoneTarget?.status === 'ready' || zoneNode?.assetUrl || graphNode?.assetUrl) return true
  }
  return false
}

function spatialZoneReferenceForNode(
  shot: SequenceAnimaticShotView,
  node: SequenceAnimaticSpatialBindingNodeView,
  targetByNodeId: Map<string, SequenceAnimaticContinuityAssetTargetView>,
) {
  if (!isSpotLikeNode(node)) return null
  const hierarchy = shot.spatialBindingView.hierarchy
  const nodeIndex = hierarchy.findIndex((entry) => entry.id === node.id)
  const precedingZone = nodeIndex >= 0
    ? [...hierarchy.slice(0, nodeIndex)].reverse().find(isZoneLikeNode) ?? null
    : null
  const fallbackZone = hierarchy.find(isZoneLikeNode) ?? null
  const zoneNode = precedingZone ?? fallbackZone
  if (!zoneNode) return null
  const zoneTarget = targetByNodeId.get(zoneNode.id) ?? null
  if (!zoneTarget && !zoneNode.assetUrl) return null
  return { zoneNode, zoneTarget }
}

function spatialTargetCoveredByZone(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
  target: SequenceAnimaticContinuityAssetTargetView,
) {
  if (!isSpotLikeTarget(model, target)) return false
  const graphNode = model.continuityGraphView.nodes.find((node) => node.id === target.nodeId) ?? null
  const targetNode = shot.spatialBindingView.hierarchy.find((node) => node.id === target.nodeId)
  const parentNode = graphNode?.parentId
    ? model.continuityGraphView.nodes.find((node) => node.id === graphNode.parentId) ?? null
    : null
  const preferredZoneId = parentNode?.kind === 'zone' ? cleanText(parentNode.id) : ''
  const targetByNodeId = new Map(model.continuityAssetTargets.map((entry) => [entry.nodeId, entry] as const))
  const zoneReference = targetNode && isSpotLikeNode(targetNode)
    ? spatialZoneReferenceForNode(shot, targetNode, targetByNodeId)
    : null
  return zoneReference?.zoneTarget?.status === 'ready'
    || Boolean(zoneReference?.zoneNode.assetUrl)
    || shotReadyZoneReference(model, shot, preferredZoneId)
}

function sceneTitleForShot(model: SequenceAnimaticViewModel, shot: SequenceAnimaticShotView) {
  const inferredSceneId = /^(.+)_shot_\d+/.exec(shot.id)?.[1] ?? ''
  return model.scenes.find((scene) => scene.id === inferredSceneId)?.title ?? (inferredSceneId.replace(/_/g, ' ') || 'Scene')
}

export function buildSequenceAnimaticShotTimelineItems(model: SequenceAnimaticViewModel): SequenceAnimaticShotTimelineItem[] {
  return model.blocks.flatMap((block) => block.shots.map((shot) => {
    const preflight = sequenceAnimaticKeyframePreflightForShot(model, shot)
    const missingReferenceCount = preflight.missingIngredients.length
    return {
      key: `${model.request.id}:${block.id}:${shot.id}`,
      sceneId: /^(.+)_shot_\d+/.exec(shot.id)?.[1] ?? '',
      sceneTitle: sceneTitleForShot(model, shot),
      blockId: block.id,
      blockTitle: block.title,
      block,
      shot,
      thumbnailUrl: shot.panelUrl,
      keyframeReady: shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready' || shot.keyframeStatusLabel === 'Storyboard keyframe ready',
      running: shot.panelRunning || shot.keyframeRunning || shot.keyframeDependencyRunning || shot.zoneCoverageCellRunning || shot.coverageIntentRunning,
      missingReferenceCount,
    }
  }))
}

export function sequenceAnimaticDependencyTargetsForShot(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
) {
  const targetByReference = continuityTargetLookup(model)
  const coverageAnchor = shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
  const aliasedReferenceTargetIds = [
    ...shot.references.map((reference) => targetForReference(targetByReference, reference.entityKey, reference.name)?.nodeId),
    ...shot.dialogue.map((line) => targetForReference(targetByReference, line.speakerRefId, line.speakerName)?.nodeId),
    ...shot.performanceBeats.map((beat) => targetForReference(targetByReference, beat.characterRefId, beat.characterName)?.nodeId),
  ]
  const spatialHierarchyNodeIds = new Set(shot.spatialBindingView.hierarchy.map((node) => node.id).filter(Boolean))
  const selectedSpatialNodeIds = selectedSpatialDependencyNodeIdsForShot(shot)
  const dependencyNodeIds = new Set([
    ...selectedSpatialNodeIds,
    ...shot.references.map((reference) => reference.entityKey),
    ...aliasedReferenceTargetIds,
    coverageAnchor?.setId,
    coverageAnchor?.zoneId,
    coverageAnchor?.primarySpotId,
    ...(coverageAnchor?.spotIds ?? []),
    coverageAnchor?.viewpointId,
  ].map(cleanText).filter(Boolean))

  return model.continuityAssetTargets.filter((target) => (
    (!spatialHierarchyNodeIds.has(target.nodeId) || selectedSpatialNodeIds.has(target.nodeId))
    && (target.shotIds.includes(shot.id) || dependencyNodeIds.has(target.nodeId))
  )).filter((target) => !spatialTargetCoveredByZone(model, shot, target))
}

export function sequenceAnimaticIngredientsForShot(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
) {
  const targetByNodeId = new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const targetByReference = continuityTargetLookup(model)
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const dependencyTargets = new Set(sequenceAnimaticDependencyTargetsForShot(model, shot).map((target) => target.nodeId))
  const ingredients: SequenceAnimaticShotIngredient[] = []

  const spatialNode = preferredSpatialIngredientNode(shot)
  for (const node of spatialNode ? [spatialNode] : []) {
    const target = targetByNodeId.get(node.id) ?? null
    const targetStatus = statusFromTarget(target)
    const zoneReference = targetStatus === 'ready'
      ? null
      : spatialZoneReferenceForNode(shot, node, targetByNodeId)
    const zoneStatus = statusFromTarget(zoneReference?.zoneTarget)
    const zoneCanCover = Boolean(
      zoneReference
      && (
        zoneReference.zoneTarget?.status === 'ready'
        || zoneReference.zoneTarget?.status === 'generating'
        || zoneReference.zoneNode.assetUrl
      ),
    )
    const displayTarget = zoneCanCover ? zoneReference?.zoneTarget ?? null : target
    const displayNode = zoneCanCover ? zoneReference?.zoneNode ?? node : node
    const graphNode = graphNodeById.get(node.id) ?? null
    const displayGraphNode = graphNodeById.get(displayNode.id) ?? null
    const status = zoneCanCover
      ? zoneReference?.zoneTarget ? zoneStatus : 'ready'
      : target ? targetStatus : node.assetUrl ? 'ready' : 'not_required'
    ingredients.push({
      id: `scene:${node.id}`,
      name: node.label || displayNameFromRefId(node.id),
      typeLabel: zoneCanCover
        ? `${node.kindLabel || graphNode?.kindLabel || 'Spot'} from ${displayNode.label || displayNameFromRefId(displayNode.id)}`
        : node.kindLabel || graphNode?.kindLabel || 'Scene node',
      kind: displayTarget ? 'continuity_asset' : 'scene_graph',
      iconId: iconForIngredientKind(node.kind),
      iconUrl: null,
      imageUrl: displayTarget?.assetUrl ?? displayNode.assetUrl ?? displayGraphNode?.assetUrl ?? node.assetUrl ?? graphNode?.assetUrl ?? null,
      fullImageUrl: displayTarget?.assetUrl ?? displayNode.assetUrl ?? displayGraphNode?.assetUrl ?? node.assetUrl ?? graphNode?.assetUrl ?? null,
      status,
      statusLabel: zoneCanCover
        ? statusLabelForIngredient({ status, target: displayTarget, fallback: displayNode.assetStatusLabel || 'Zone reference ready' })
        : statusLabelForIngredient({ status, target, fallback: node.assetStatusLabel }),
      actionLabel: actionLabelForIngredient(status, displayTarget),
      usageLabel: node.shotIds.length > 0 ? `${node.shotIds.length} shot${node.shotIds.length === 1 ? '' : 's'}` : 'Used by this shot',
      nodeId: node.id,
      target: displayTarget,
      coverageAnchor: null,
      spatialNode: node,
      requiredForKeyframe: dependencyTargets.has(node.id) || Boolean(displayTarget && dependencyTargets.has(displayTarget.nodeId)),
      canGenerate: Boolean(displayTarget && status !== 'generating' && !zoneCanCover),
      visualBrief: zoneCanCover
        ? [
          graphNode?.effectiveVisualBrief || graphNode?.summary || node.summary || '',
          `Use the generated zone reference "${displayNode.label || displayNameFromRefId(displayNode.id)}" to stage this spot.`,
        ].filter(Boolean).join(' ')
        : graphNode?.effectiveVisualBrief || graphNode?.summary || node.summary || '',
    })
  }

  for (const reference of shot.references) {
    const target = targetForReference(targetByReference, reference.entityKey, reference.name) ?? null
    const graphNode = graphNodeById.get(target?.nodeId ?? reference.entityKey) ?? null
    const status = statusFromTarget(target)
    const hasReferenceArt = Boolean(reference.referenceArtUrl || reference.iconUrl || graphNode?.assetUrl)
    const fallbackStatus = referenceFallbackStatus({
      isContinuityAnchor: reference.isContinuityAnchor,
      statusLabel: reference.statusLabel,
      hasReferenceArt,
    })
    const effectiveStatus = target ? status : fallbackStatus
    ingredients.push({
      id: `reference:${reference.entityKey}`,
      name: reference.name,
      typeLabel: reference.isContinuityAnchor
        ? reference.continuityAnchorType === 'character' ? 'Temp character' : reference.continuityAnchorType === 'location_spot' ? 'Location spot' : 'Prop'
        : reference.role || 'Reference',
      kind: target ? 'continuity_asset' : 'reference',
      iconId: reference.iconId,
      iconUrl: reference.iconUrl,
      imageUrl: reference.iconUrl ?? target?.assetUrl ?? graphNode?.assetUrl ?? reference.referenceArtUrl ?? null,
      fullImageUrl: target?.assetUrl ?? graphNode?.assetUrl ?? reference.referenceArtUrl ?? reference.iconUrl,
      status: effectiveStatus,
      statusLabel: statusLabelForIngredient({ status: effectiveStatus, target, fallback: reference.statusLabel }),
      actionLabel: actionLabelForIngredient(status, target),
      usageLabel: 'Used by this shot',
      nodeId: target?.nodeId ?? reference.entityKey,
      target,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: dependencyTargets.has(target?.nodeId ?? reference.entityKey) || (reference.isContinuityAnchor === true && effectiveStatus !== 'not_required'),
      canGenerate: Boolean(target && status !== 'generating'),
      visualBrief: graphNode?.effectiveVisualBrief || graphNode?.summary || '',
    })
  }

  if (cleanText(shot.camera)) {
    ingredients.push({
      id: `field:${shot.id}:camera`,
      name: 'Camera',
      typeLabel: 'Camera',
      kind: 'camera',
      iconId: 'camera',
      iconUrl: null,
      imageUrl: null,
      fullImageUrl: null,
      status: 'not_required',
      statusLabel: 'Direction',
      actionLabel: '',
      usageLabel: 'Camera description',
      nodeId: null,
      target: null,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: false,
      canGenerate: false,
      visualBrief: shot.camera,
    })
  }

  if (cleanText(shot.lighting)) {
    ingredients.push({
      id: `field:${shot.id}:lighting`,
      name: 'Lighting',
      typeLabel: 'Lighting',
      kind: 'lighting',
      iconId: 'lighting',
      iconUrl: null,
      imageUrl: null,
      fullImageUrl: null,
      status: 'not_required',
      statusLabel: 'Direction',
      actionLabel: '',
      usageLabel: 'Lighting description',
      nodeId: null,
      target: null,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: false,
      canGenerate: false,
      visualBrief: shot.lighting,
    })
  }

  for (const line of shot.dialogue) {
    if (!line.speakerRefId && !line.speakerName) continue
    const nodeId = line.speakerRefId || line.speakerName
    const target = targetForReference(targetByReference, line.speakerRefId, line.speakerName) ?? null
    const graphNode = graphNodeById.get(target?.nodeId ?? nodeId) ?? null
    const status = statusFromTarget(target)
    const hasReferenceArt = Boolean(line.speakerReferenceArtUrl || line.speakerIconUrl || graphNode?.assetUrl)
    ingredients.push({
      id: `dialogue:${nodeId}`,
      name: line.speakerName || displayNameFromRefId(nodeId),
      typeLabel: 'Dialogue',
      kind: target ? 'continuity_asset' : 'dialogue',
      iconId: line.speakerIconId,
      iconUrl: line.speakerIconUrl,
      imageUrl: line.speakerIconUrl ?? target?.assetUrl ?? graphNode?.assetUrl ?? null,
      fullImageUrl: target?.assetUrl ?? graphNode?.assetUrl ?? line.speakerReferenceArtUrl ?? line.speakerIconUrl,
      status: target ? status : hasReferenceArt ? 'ready' : 'not_required',
      statusLabel: statusLabelForIngredient({ status: target ? status : hasReferenceArt ? 'ready' : 'not_required', target, fallback: hasReferenceArt ? 'Ready' : 'Reference only' }),
      actionLabel: actionLabelForIngredient(status, target),
      usageLabel: 'Dialogue in this shot',
      nodeId: target?.nodeId ?? nodeId,
      target,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: Boolean(target && dependencyTargets.has(target.nodeId)),
      canGenerate: Boolean(target && status !== 'generating'),
      visualBrief: line.text,
    })
  }

  for (const beat of shot.performanceBeats) {
    if (!beat.characterRefId && !beat.characterName) continue
    const nodeId = beat.characterRefId || beat.characterName
    const target = targetForReference(targetByReference, beat.characterRefId, beat.characterName) ?? null
    const graphNode = graphNodeById.get(target?.nodeId ?? nodeId) ?? null
    const status = statusFromTarget(target)
    const hasReferenceArt = Boolean(beat.characterReferenceArtUrl || beat.characterIconUrl || graphNode?.assetUrl)
    ingredients.push({
      id: `performance:${nodeId}`,
      name: beat.characterName || displayNameFromRefId(nodeId),
      typeLabel: 'Performance',
      kind: target ? 'continuity_asset' : 'performance',
      iconId: beat.characterIconId,
      iconUrl: beat.characterIconUrl,
      imageUrl: beat.characterIconUrl ?? target?.assetUrl ?? graphNode?.assetUrl ?? null,
      fullImageUrl: target?.assetUrl ?? graphNode?.assetUrl ?? beat.characterReferenceArtUrl ?? beat.characterIconUrl,
      status: target ? status : hasReferenceArt ? 'ready' : 'not_required',
      statusLabel: statusLabelForIngredient({ status: target ? status : hasReferenceArt ? 'ready' : 'not_required', target, fallback: hasReferenceArt ? 'Ready' : 'Reference only' }),
      actionLabel: actionLabelForIngredient(status, target),
      usageLabel: 'Performance beat',
      nodeId: target?.nodeId ?? nodeId,
      target,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: Boolean(target && dependencyTargets.has(target.nodeId)),
      canGenerate: Boolean(target && status !== 'generating'),
      visualBrief: [beat.facialExpression, beat.bodyLanguage, beat.gaze, beat.gesture].filter(Boolean).join(' / '),
    })
  }

  return dedupeIngredients(ingredients).sort((left, right) => {
    const statusOrder = { failed: 0, missing: 1, stale: 2, generating: 3, ready: 4, not_required: 5 }
    return statusOrder[left.status] - statusOrder[right.status] || Number(right.requiredForKeyframe) - Number(left.requiredForKeyframe) || left.name.localeCompare(right.name)
  })
}

export function sequenceAnimaticKeyframePreflightForShot(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
) {
  const ingredients = sequenceAnimaticIngredientsForShot(model, shot)
  const dependencyTargets = sequenceAnimaticDependencyTargetsForShot(model, shot)
  const blockingTargets = dependencyTargets.filter((target) => target.status === 'missing' || target.status === 'stale' || target.status === 'failed')
  const generatingTargets = dependencyTargets.filter((target) => target.status === 'generating')
  const coverageAnchor = shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
  const coverageMissing = Boolean(coverageAnchor && coverageAnchor.status !== 'ready' && !coverageAnchor.running)
  const coverageGenerating = Boolean(coverageAnchor?.running || coverageAnchor?.status === 'generating' || coverageAnchor?.status === 'queued')
  const missingIngredients = ingredients.filter((ingredient) => (
    ingredient.requiredForKeyframe
    && (ingredient.status === 'missing' || ingredient.status === 'stale' || ingredient.status === 'failed')
  ))
  const generatingIngredients = ingredients.filter((ingredient) => ingredient.requiredForKeyframe && ingredient.status === 'generating')
  const readyIngredients = ingredients.filter((ingredient) => ingredient.requiredForKeyframe && ingredient.status === 'ready')
  const blockingIngredientTargetIds = new Set(missingIngredients.map((ingredient) => ingredient.target?.nodeId).filter(Boolean))
  const generatingIngredientTargetIds = new Set(generatingIngredients.map((ingredient) => ingredient.target?.nodeId).filter(Boolean))
  return {
    status: generatingIngredients.length > 0 || coverageGenerating
      ? 'generating'
      : missingIngredients.length > 0 || coverageMissing
        ? 'blocked'
        : 'ready',
    missingIngredients,
    generatingIngredients,
    readyIngredients,
    blockingTargets: blockingTargets.filter((target) => blockingIngredientTargetIds.has(target.nodeId)),
    generatingTargets: generatingTargets.filter((target) => generatingIngredientTargetIds.has(target.nodeId)),
    coverageAnchor,
  } satisfies SequenceAnimaticShotKeyframePreflight
}

export function buildSequenceAnimaticShotPanelCues(shot: SequenceAnimaticShotView): SequenceAnimaticShotPanelCue[] {
  const rawCues: Omit<SequenceAnimaticShotPanelCue, 'start' | 'end'>[] = []
  const action = cleanText(shot.action)
  if (action) {
    rawCues.push({
      id: `${shot.id}:action`,
      kind: 'action',
      text: action,
      speakerName: 'Action',
      iconId: 'action',
      iconUrl: null,
      metaLabel: shot.durationLabel || shot.timeLabel,
    })
  }

  for (const line of shot.dialogue) {
    const text = cleanText(line.text)
    if (!text) continue
    rawCues.push({
      id: line.id || `${shot.id}:dialogue:${rawCues.length + 1}`,
      kind: 'dialogue',
      text,
      speakerName: cleanText(line.speakerName) || cleanText(line.speakerRefId) || 'Unknown speaker',
      iconId: line.speakerIconId,
      iconUrl: line.speakerIconUrl,
      metaLabel: [line.emotion, line.delivery, line.subtext].map(cleanText).filter(Boolean).join(' / '),
    })
  }

  if (rawCues.length === 0) return []
  const cueDuration = 1 / rawCues.length
  return rawCues.map((cue, index) => ({
    ...cue,
    start: index * cueDuration,
    end: index === rawCues.length - 1 ? 1 : (index + 1) * cueDuration,
  }))
}
