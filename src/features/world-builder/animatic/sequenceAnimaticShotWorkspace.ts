import type { EntityIconId } from '../../../shared/entityIcons'
import {
  buildSequenceAnimaticShotIngredientReferencePlan,
  sequenceAnimaticVisualReferenceHash,
} from '../../../domain/sequenceAnimaticVisualReferencePlan.ts'
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
  assetKey: string
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

export type SequenceAnimaticShotKeyframeReferenceOverrideIngredient = {
  id: string
  kind: string
  name: string
  nodeId: string | null
  node_id: string | null
  entityKey: string | null
  entity_key: string | null
  assetKey: string
  asset_key: string
  assetUrl: string
  asset_url: string
  status: string
  source: 'focused_shot_ingredient_ui'
  role: string
  sourceArtifactRole: string
  source_artifact_role: string
  requiredForKeyframe: boolean
  required_for_keyframe: boolean
  uiOrder: number
  ui_order: number
}

export type SequenceAnimaticShotKeyframeReferenceOverride = {
  version: 'shot_keyframe_reference_override_v1'
  shotId: string
  shot_id: string
  ingredientPlanHash: string
  ingredient_plan_hash: string
  source: 'focused_shot_ingredient_ui'
  ingredients: SequenceAnimaticShotKeyframeReferenceOverrideIngredient[]
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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

function savedReferenceOverrideForShot(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
) {
  const metadata = asRecord(model.request.metadata)
  const overrides = asRecord(metadata.sequenceAnimaticShotReferenceOverridesByShotId ?? metadata.sequence_animatic_shot_reference_overrides_by_shot_id)
  const override = asRecord(overrides[shot.id])
  const ingredients = Array.isArray(override.ingredients) ? override.ingredients.map(asRecord) : []
  return ingredients.length > 0 ? { ...override, ingredients } : null
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
    assetKey: primary.assetKey || secondary.assetKey,
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

function shotReferenceAssetPackEntity(reference: SequenceAnimaticShotView['references'][number]) {
  if (reference.isContinuityAnchor) return null
  const entityKey = cleanText(reference.entityKey)
  if (!entityKey) return null
  const assetKey = cleanText(reference.assetKey)
  return {
    key: entityKey,
    id: entityKey,
    name: reference.name || displayNameFromRefId(entityKey),
    type: reference.iconId === 'item' ? 'object' : reference.iconId === 'environment' ? 'place' : 'actor',
    nodeType: reference.iconId === 'item' ? 'object' : reference.iconId === 'environment' ? 'place' : 'actor',
    node_type: reference.iconId === 'item' ? 'object' : reference.iconId === 'environment' ? 'place' : 'actor',
    primaryAssetKey: assetKey,
    primary_asset_key: assetKey,
    selectedReferenceAssetKey: assetKey,
    selected_reference_asset_key: assetKey,
    assetUrl: reference.referenceArtUrl || reference.iconUrl || '',
    asset_url: reference.referenceArtUrl || reference.iconUrl || '',
    iconUrl: reference.iconUrl || '',
    icon_url: reference.iconUrl || '',
  }
}

function shotScopedAssetPack(model: SequenceAnimaticViewModel, shot: SequenceAnimaticShotView) {
  const base = asRecord(model.assetPack)
  const entitiesByKey = new Map<string, Record<string, unknown>>()
  const addEntity = (entity: Record<string, unknown>) => {
    const key = lookupKey(entity.key || entity.id)
    if (!key) return
    const previous = entitiesByKey.get(key)
    if (!previous) {
      entitiesByKey.set(key, entity)
      return
    }
    const previousAssetKey = cleanText(previous.primaryAssetKey || previous.primary_asset_key || previous.selectedReferenceAssetKey || previous.selected_reference_asset_key)
    const nextAssetKey = cleanText(entity.primaryAssetKey || entity.primary_asset_key || entity.selectedReferenceAssetKey || entity.selected_reference_asset_key)
    entitiesByKey.set(key, previousAssetKey || !nextAssetKey ? { ...entity, ...previous } : { ...previous, ...entity })
  }
  for (const entity of Array.isArray(base.entities) ? base.entities : []) {
    addEntity(asRecord(entity))
  }
  for (const reference of shot.references) {
    const entity = shotReferenceAssetPackEntity(reference)
    if (entity) addEntity(entity)
  }
  return {
    ...base,
    entities: [...entitiesByKey.values()],
  }
}

function assetUrlFromRecord(record: Record<string, unknown>) {
  const metadata = asRecord(record.metadata)
  return cleanText(record.assetUrl)
    || cleanText(record.asset_url)
    || cleanText(record.imageUrl)
    || cleanText(record.image_url)
    || cleanText(record.referenceArtUrl)
    || cleanText(record.reference_art_url)
    || cleanText(record.iconUrl)
    || cleanText(record.icon_url)
    || cleanText(record.selectedReferenceAssetUrl)
    || cleanText(record.selected_reference_asset_url)
    || cleanText(metadata.referenceSheetUrl)
    || cleanText(metadata.reference_sheet_url)
    || cleanText(metadata.thumbnailUrl)
    || cleanText(metadata.thumbnail_url)
    || cleanText(record.url)
}

function assetKeysFromRecord(record: Record<string, unknown>) {
  const metadata = asRecord(record.metadata)
  const keys = [
    cleanText(record.assetKey),
    cleanText(record.asset_key),
    cleanText(record.primaryAssetKey),
    cleanText(record.primary_asset_key),
    cleanText(record.selectedReferenceAssetKey),
    cleanText(record.selected_reference_asset_key),
    cleanText(record.selectedReferenceVariantAssetKey),
    cleanText(record.selected_reference_variant_asset_key),
    cleanText(metadata.referenceSheetAssetKey),
    cleanText(metadata.reference_sheet_asset_key),
    ...(Array.isArray(record.assetKeys) ? record.assetKeys.map(cleanText) : []),
    ...(Array.isArray(record.asset_keys) ? record.asset_keys.map(cleanText) : []),
  ].filter(Boolean)
  return [...new Set(keys)]
}

function assetUrlByAssetKeyFromPack(assetPack: Record<string, unknown>) {
  const byAssetKey = new Map<string, string>()
  const addRecord = (record: Record<string, unknown>) => {
    const assetUrl = assetUrlFromRecord(record)
    if (!assetUrl) return
    for (const assetKey of assetKeysFromRecord(record)) {
      if (!byAssetKey.has(assetKey)) byAssetKey.set(assetKey, assetUrl)
    }
  }
  for (const entity of Array.isArray(assetPack.entities) ? assetPack.entities : []) addRecord(asRecord(entity))
  for (const image of Array.isArray(assetPack.referenceImages) ? assetPack.referenceImages : []) addRecord(asRecord(image))
  for (const image of Array.isArray(assetPack.reference_images) ? assetPack.reference_images : []) addRecord(asRecord(image))
  return byAssetKey
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

export function sequenceAnimaticIngredientsForShot(
  model: SequenceAnimaticViewModel,
  shot: SequenceAnimaticShotView,
) {
  const targetByNodeId = new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const scopedAssetPack = shotScopedAssetPack(model, shot)
  const assetUrlByAssetKey = assetUrlByAssetKeyFromPack(scopedAssetPack)
  const continuityTargets = model.continuityAssetTargets.map((target) => {
    const graphNode = graphNodeById.get(target.nodeId) ?? null
    return {
      ...graphNode,
      ...target,
      id: target.nodeId,
      nodeId: target.nodeId,
      node_id: target.nodeId,
      name: target.name,
      assetKind: target.assetKind,
      asset_kind: target.assetKind,
      nodeKind: graphNode?.kind ?? target.assetKind,
      node_kind: graphNode?.kind ?? target.assetKind,
      assetKey: target.assetKey ?? '',
      asset_key: target.assetKey ?? '',
      assetUrl: target.assetUrl ?? graphNode?.assetUrl ?? '',
      asset_url: target.assetUrl ?? graphNode?.assetUrl ?? '',
      shotIds: target.shotIds,
      shot_ids: target.shotIds,
    }
  })
  const spatialNodes = shot.spatialBindingView.hierarchy.map((node) => {
    const target = targetByNodeId.get(node.id) ?? null
    const graphNode = graphNodeById.get(node.id) ?? null
    return {
      ...graphNode,
      ...node,
      id: node.id,
      nodeId: node.id,
      node_id: node.id,
      name: node.label || graphNode?.label || displayNameFromRefId(node.id),
      kind: node.kind,
      nodeKind: graphNode?.kind ?? node.kind,
      node_kind: graphNode?.kind ?? node.kind,
      assetKind: graphNode?.kind ?? node.kind,
      asset_kind: graphNode?.kind ?? node.kind,
      assetKey: target?.assetKey ?? '',
      asset_key: target?.assetKey ?? '',
      assetUrl: target?.assetUrl ?? node.assetUrl ?? graphNode?.assetUrl ?? '',
      asset_url: target?.assetUrl ?? node.assetUrl ?? graphNode?.assetUrl ?? '',
    }
  })
  const referencePlan = buildSequenceAnimaticShotIngredientReferencePlan({
    shot,
    spatialNodes,
    continuityTargets,
    assetPack: scopedAssetPack,
    maxReferences: 8,
  })
  const savedOverride = savedReferenceOverrideForShot(model, shot)
  const referenceIngredients = savedOverride
    ? savedOverride.ingredients.map((ingredient, index) => {
        const assetKey = cleanText(ingredient.assetKey ?? ingredient.asset_key)
        const nodeId = cleanText(ingredient.nodeId ?? ingredient.node_id)
        const entityKey = cleanText(ingredient.entityKey ?? ingredient.entity_key) || nodeId
        const rawKind = cleanText(ingredient.kind)
        const kind = (rawKind === 'zone_location' || rawKind === 'world_character' || rawKind === 'temp_character' || rawKind === 'item_or_prop')
          ? rawKind
          : 'item_or_prop'
        const imageUrl = cleanText(ingredient.assetUrl ?? ingredient.asset_url ?? ingredient.imageUrl ?? ingredient.image_url ?? ingredient.referenceArtUrl ?? ingredient.reference_art_url ?? ingredient.iconUrl ?? ingredient.icon_url)
          || assetUrlByAssetKey.get(assetKey)
          || ''
        return {
          id: cleanText(ingredient.id) || `${kind}:${entityKey || assetKey || index}`,
          kind,
          name: cleanText(ingredient.name) || displayNameFromRefId(entityKey || assetKey),
          assetKey,
          nodeId,
          entityKey,
          role: cleanText(ingredient.role) as any,
          sourceArtifactRole: cleanText(ingredient.sourceArtifactRole ?? ingredient.source_artifact_role),
          requiredForKeyframe: true,
          status: assetKey ? 'ready' as const : 'missing' as const,
          reason: 'Saved fixed shot reference.',
          imageUrl,
        }
      })
    : referencePlan.ingredients
  const shotReferenceByEntityKey = new Map(shot.references.map((reference) => [lookupKey(reference.entityKey), reference] as const).filter(([key]) => key))
  const ingredients: SequenceAnimaticShotIngredient[] = referenceIngredients.map((reference) => {
    const target = targetByNodeId.get(reference.nodeId) ?? targetByNodeId.get(reference.entityKey) ?? null
    const graphNode = graphNodeById.get(reference.nodeId) ?? graphNodeById.get(reference.entityKey) ?? null
    const spatialNode = shot.spatialBindingView.hierarchy.find((node) => node.id === reference.nodeId || node.id === reference.entityKey) ?? null
    const shotReference = shotReferenceByEntityKey.get(lookupKey(reference.nodeId)) ?? shotReferenceByEntityKey.get(lookupKey(reference.entityKey)) ?? null
    const targetStatus = statusFromTarget(target)
    const status = target && target.status !== 'ready'
      ? targetStatus
      : reference.status === 'ready' ? 'ready' : 'missing'
    const iconKind = reference.kind === 'zone_location'
      ? 'zone'
      : reference.kind === 'world_character' || reference.kind === 'temp_character'
        ? 'character'
        : 'item'
    return {
      id: reference.id,
      name: reference.name,
      typeLabel: reference.kind === 'zone_location'
        ? 'Spot from zone'
        : reference.kind === 'world_character'
          ? 'World character'
          : reference.kind === 'temp_character'
            ? 'Temp character'
            : 'Item/prop',
      kind: target ? 'continuity_asset' : 'reference',
      iconId: iconForIngredientKind(iconKind),
      iconUrl: reference.imageUrl || target?.assetUrl || graphNode?.assetUrl || shotReference?.iconUrl || null,
      imageUrl: reference.imageUrl || target?.assetUrl || graphNode?.assetUrl || shotReference?.iconUrl || shotReference?.referenceArtUrl || null,
      fullImageUrl: reference.imageUrl || target?.assetUrl || graphNode?.assetUrl || shotReference?.referenceArtUrl || shotReference?.iconUrl || null,
      status,
      statusLabel: statusLabelForIngredient({ status, target }),
      actionLabel: actionLabelForIngredient(status, target),
      usageLabel: reference.reason || 'Used by this shot',
      nodeId: reference.nodeId || reference.entityKey,
      assetKey: reference.assetKey,
      target,
      coverageAnchor: null,
      spatialNode,
      requiredForKeyframe: reference.requiredForKeyframe,
      canGenerate: Boolean(target && status !== 'generating'),
      visualBrief: graphNode?.effectiveVisualBrief || graphNode?.summary || reference.reason,
    }
  })

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
      assetKey: '',
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
      assetKey: '',
      target: null,
      coverageAnchor: null,
      spatialNode: null,
      requiredForKeyframe: false,
      canGenerate: false,
      visualBrief: shot.lighting,
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
  const coverageAnchor = shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
  const missingIngredients = ingredients.filter((ingredient) => (
    ingredient.requiredForKeyframe
    && (ingredient.status === 'missing' || ingredient.status === 'stale' || ingredient.status === 'failed')
  ))
  const generatingIngredients = ingredients.filter((ingredient) => ingredient.requiredForKeyframe && ingredient.status === 'generating')
  const readyIngredients = ingredients.filter((ingredient) => ingredient.requiredForKeyframe && ingredient.status === 'ready')
  return {
    status: generatingIngredients.length > 0
      ? 'generating'
      : missingIngredients.length > 0
        ? 'blocked'
        : 'ready',
    missingIngredients,
    generatingIngredients,
    readyIngredients,
    blockingTargets: missingIngredients.map((ingredient) => ingredient.target).filter((target): target is SequenceAnimaticContinuityAssetTargetView => Boolean(target)),
    generatingTargets: generatingIngredients.map((ingredient) => ingredient.target).filter((target): target is SequenceAnimaticContinuityAssetTargetView => Boolean(target)),
    coverageAnchor,
  } satisfies SequenceAnimaticShotKeyframePreflight
}

function roleForOverrideIngredient(ingredient: SequenceAnimaticShotIngredient) {
  const type = ingredient.typeLabel.toLowerCase()
  if (type.includes('zone') || type.includes('spot from zone')) return 'zone_reference'
  if (type.includes('world character')) return 'world_character_reference'
  if (type.includes('temp character')) return 'temp_character_reference'
  if (type.includes('item') || type.includes('prop')) return 'item_or_prop_reference'
  return 'shot_ingredient_reference'
}

function overrideKindForIngredient(ingredient: SequenceAnimaticShotIngredient) {
  const type = ingredient.typeLabel.toLowerCase()
  if (type.includes('zone') || type.includes('spot from zone')) return 'zone_location'
  if (type.includes('world character')) return 'world_character'
  if (type.includes('temp character')) return 'temp_character'
  if (type.includes('item') || type.includes('prop')) return 'item_or_prop'
  return ingredient.kind
}

export function buildSequenceAnimaticShotKeyframeReferenceOverride(
  model: any,
  shot: any,
): SequenceAnimaticShotKeyframeReferenceOverride {
  const ingredients = sequenceAnimaticIngredientsForShot(model, shot)
  const visualIngredients = ingredients
    .filter((ingredient) => ingredient.requiredForKeyframe)
    .filter((ingredient) => ingredient.kind !== 'camera' && ingredient.kind !== 'lighting' && ingredient.kind !== 'dialogue' && ingredient.kind !== 'performance')
    .map((ingredient, index) => {
      const assetKey = cleanText(ingredient.assetKey || ingredient.target?.assetKey)
      const assetUrl = cleanText(ingredient.fullImageUrl || ingredient.imageUrl || ingredient.iconUrl)
      const kind = overrideKindForIngredient(ingredient)
      const role = roleForOverrideIngredient(ingredient)
      const nodeId = cleanText(ingredient.nodeId)
      return {
        id: ingredient.id,
        kind,
        name: ingredient.name,
        nodeId: nodeId || null,
        node_id: nodeId || null,
        entityKey: nodeId || null,
        entity_key: nodeId || null,
        assetKey,
        asset_key: assetKey,
        assetUrl,
        asset_url: assetUrl,
        status: ingredient.status,
        source: 'focused_shot_ingredient_ui' as const,
        role,
        sourceArtifactRole: ingredient.target ? 'sequence_animatic_continuity_asset' : 'world_entity_reference',
        source_artifact_role: ingredient.target ? 'sequence_animatic_continuity_asset' : 'world_entity_reference',
        requiredForKeyframe: true,
        required_for_keyframe: true,
        uiOrder: index,
        ui_order: index,
      }
    })

  const ingredientPlanHash = sequenceAnimaticVisualReferenceHash({
    version: 'shot_keyframe_reference_override_v1',
    shotId: shot.id,
    ingredients: visualIngredients.map((ingredient) => ({
      id: ingredient.id,
      kind: ingredient.kind,
      nodeId: ingredient.nodeId,
      entityKey: ingredient.entityKey,
      assetKey: ingredient.assetKey,
      status: ingredient.status,
      uiOrder: ingredient.uiOrder,
    })),
  })

  return {
    version: 'shot_keyframe_reference_override_v1',
    shotId: shot.id,
    shot_id: shot.id,
    ingredientPlanHash,
    ingredient_plan_hash: ingredientPlanHash,
    source: 'focused_shot_ingredient_ui',
    ingredients: visualIngredients,
  }
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
