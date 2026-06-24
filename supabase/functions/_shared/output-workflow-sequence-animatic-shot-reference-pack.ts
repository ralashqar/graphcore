import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import { outputArtifactSchema, type OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import { buildCinematicV3StoryboardGroupAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  orderSequenceAnimaticAssetPackReferences,
  scopeAssetPackToReferenceAssetKeys,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
} from './output-workflow-sequence-animatic-reference-runtime.ts'

type OutputArtifactRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  run_id: string | null
  node_id: string | null
  key: string
  name: string
  kind: string
  asset_key: string | null
  mime_type: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}

function mapOutputArtifactRow(row: OutputArtifactRow): OutputArtifact {
  return outputArtifactSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    nodeId: row.node_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    assetKey: row.asset_key,
    mimeType: row.mime_type ?? '',
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
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

export async function sequenceAnimaticShotInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const rawShot = helpers.asRecord(config.shot)
  const isShotProduction = helpers.readText(config.screenplayAnimaticRole) === 'shot_production' || helpers.readText(config.sequenceAnimaticRole) === 'shot_production'
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...rawShot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const panel = helpers.asRecord(config.panel)
  const panelAssetKey = helpers.readText(panel.assetKey)
  if (!panelAssetKey && !isShotProduction) {
    throw new Error('Sequence animatic shot video requires a cropped panel asset. Generate/extract the storyboard panel before generating shot video.')
  }
  const assetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack),
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
    maxAssetKeysPerEntity: 1,
  })
  const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(config.editorialDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const image = panelAssetKey ? {
    ...panel,
    assetKey: panelAssetKey,
    role: 'cinematic_v2_shot_keyframe',
    name: helpers.readText(panel.name) || `${shot.title || `Shot ${shot.index}`} cropped panel keyframe`,
    shotId: shot.id,
    shotIndex: shot.index,
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    usedAsVideoReference: true,
    metadata: {
      ...helpers.asRecord(panel.metadata),
      role: 'cinematic_v2_shot_keyframe',
      shotId: shot.id,
      shotIndex: shot.index,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
    },
  } : null
  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'sequence_animatic_shot',
    totalEditorialDurationSeconds: editorialDurationSeconds,
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    performanceArc: [],
    audioPlan: {
      ambience: '',
      music: '',
      sfx: [],
      dialogueTrackCount: shot.dialogue.length > 0 ? 1 : 0,
      placeholderOnly: true,
    },
    diagnostics: ['Sequence animatic shot input built from a cropped storyboard panel.'],
  })
  const outputs = {
    shot: { ...shot, editorialDurationSeconds, providerDurationSeconds },
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    shotPlan,
    shot_plan: shotPlan,
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    assetPack,
    asset_pack: assetPack,
    panel,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    screenplayAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    screenplayAnimaticSource: helpers.readText(config.screenplayAnimaticSource),
    sequenceAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    text: JSON.stringify({ shot, image, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-input-v1' })
}

export async function sequenceAnimaticSharedAssetRef(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const referenceRole = helpers.readText(config.referenceRole) || 'continuity_asset'
  const sourceArtifactRole = helpers.readText(config.sourceArtifactRole)
  const identityKey = helpers.readText(config.identityKey)
  const identityValue = helpers.readText(config.identityValue)
  const expectedAssetKey = helpers.readText(config.expectedAssetKey) || (identityKey === 'assetKey' ? identityValue : '')
  const directReference = helpers.asRecord(config.directReference)
  const directAssetKey = helpers.readText(directReference.assetKey) || expectedAssetKey
  const artifactFromDirect = helpers.asRecord(directReference.artifact)
  const directReferenceReady = Boolean(directAssetKey)
  let artifact: OutputArtifact | null = null
  if (!directReferenceReady) {
    const client = context.client as { from: (table: string) => any }
    let query = client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect)
      .eq('project_id', context.run.projectId)
      .eq('draft_id', context.run.draftId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (sourceArtifactRole) query = query.contains('metadata', { role: sourceArtifactRole })
    const masterRequestId = helpers.readText(config.masterRequestId)
    if (masterRequestId) query = query.contains('metadata', { masterRequestId })
    if (identityKey && identityValue && identityKey !== 'assetKey') query = query.contains('metadata', { [identityKey]: identityValue })
    if (expectedAssetKey) query = query.eq('asset_key', expectedAssetKey)
    const response = await query
    if (response.error) throw new Error(response.error.message)
    artifact = ((response.data ?? []) as OutputArtifactRow[])
      .map(mapOutputArtifactRow)
      .find((entry) => {
        const metadata = helpers.asRecord(entry.metadata)
        if (sourceArtifactRole && helpers.readText(metadata.role) !== sourceArtifactRole) return false
        if (identityKey && identityValue && identityKey !== 'assetKey' && helpers.readText(metadata[identityKey]) !== identityValue) return false
        if (expectedAssetKey && helpers.readText(entry.assetKey) !== expectedAssetKey) return false
        return true
      }) ?? null
  }
  const assetKey = directAssetKey || helpers.readText(artifact?.assetKey)
  const ready = Boolean(assetKey)
  const required = config.required === true
  if (!ready && required) {
    throw new Error(`Required ${referenceRole.replace(/_/g, ' ')} reference is missing${identityValue ? ` for ${identityValue}` : ''}.`)
  }
  const metadata = helpers.asRecord(artifact?.metadata)
  const image = ready ? {
    ...directReference,
    assetKey,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key),
    mimeType: helpers.readText(directReference.mimeType) || helpers.readText(artifact?.mimeType),
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId),
    sourceRequestId: helpers.readText(config.sourceRequestId),
    metadata: {
      ...helpers.asRecord(directReference.metadata),
      ...metadata,
      referenceRole,
      sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    },
  } : null
  const reference = {
    status: ready ? 'ready' : 'missing',
    assetKey: assetKey || null,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key) || null,
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role) || null,
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId) || null,
    sourceRequestId: helpers.readText(config.sourceRequestId) || null,
    identityKey,
    identityValue,
    blockingReason: ready ? '' : `missing_${referenceRole}`,
  }
  const outputs = {
    reference,
    status: reference.status,
    assetKey: assetKey || '',
    artifact: artifact ?? (Object.keys(artifactFromDirect).length > 0 ? artifactFromDirect : null),
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    text: JSON.stringify(reference, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shared-asset-ref-v1' })
}

export async function sequenceAnimaticShotReferencePack(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const allReferences = Object.values(context.upstream)
    .map((outputs) => helpers.asRecord(outputs.reference))
    .filter((reference) => helpers.readText(reference.status) || helpers.readText(reference.assetKey) || helpers.readText(reference.identityValue))
  const references = allReferences
    .filter((reference) => helpers.readText(reference.status) === 'ready' && helpers.readText(reference.assetKey))
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage'])
  const imageByAssetKey = new Map(upstreamImages.map((image) => [helpers.readText(image.assetKey), image] as const).filter(([assetKey]) => assetKey))
  const resolvedReferenceAssetKeys = references.map((reference) => helpers.readText(reference.assetKey)).filter(Boolean)
  const configuredRequiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const uiIngredientOverrideMode = helpers.readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version) === 'primary_chain_v13_ui_ingredient_override'
  const shotReferenceOverride = helpers.asRecord(config.shotReferenceOverride ?? config.shot_reference_override)
  const uiOverrideIngredients = helpers.readArray(shotReferenceOverride.ingredients).map(helpers.asRecord)
  const uiIngredientPlanHash = helpers.readText(config.uiIngredientPlanHash ?? config.ui_ingredient_plan_hash ?? shotReferenceOverride.ingredientPlanHash ?? shotReferenceOverride.ingredient_plan_hash)
  const uiOverrideAssetKeys = uiOverrideIngredients
    .filter((entry) => helpers.readText(entry.status) === 'ready')
    .map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key))
    .filter(Boolean)
  const fallbackEntities = references.map((reference, index) => {
    const assetKey = helpers.readText(reference.assetKey)
    const role = helpers.readText(reference.role) || 'continuity_asset'
    const label = role === 'coverage_anchor'
      ? 'Coverage anchor'
      : role === 'previous_keyframe'
        ? 'Previous keyframe'
        : role === 'storyboard_panel'
          ? 'Storyboard panel'
          : `${helpers.titleFromRefLike(role)} ${index + 1}`
    return {
      key: `shot_ref_${index + 1}_${helpers.slugify(assetKey || role)}`,
      name: label,
      type: role.includes('character') ? 'character' : role.includes('prop') ? 'prop' : 'continuity_asset',
      role,
      summary: 'Shot-scoped visual reference resolved from the sequence animatic graph.',
      visualDescription: 'Use this attached reference for identity, spatial, material, lighting, and continuity grounding.',
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: role,
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
      referenceSelectionReason: 'Resolved by the shot production graph.',
    }
  }).filter((entity) => helpers.readText(entity.primaryAssetKey))
  const scopedReferenceAssetKeys = [...new Set([
    ...(uiIngredientOverrideMode && uiOverrideAssetKeys.length > 0
      ? uiOverrideAssetKeys
      : configuredRequiredReferenceAssetKeys.length > 0 ? configuredRequiredReferenceAssetKeys : resolvedReferenceAssetKeys),
  ])]
  if (uiIngredientOverrideMode && uiOverrideAssetKeys.length > 0) {
    const mismatch = scopedReferenceAssetKeys.length !== uiOverrideAssetKeys.length || scopedReferenceAssetKeys.some((assetKey, index) => assetKey !== uiOverrideAssetKeys[index])
    if (mismatch) {
      throw new Error(`Shot reference pack mismatch with UI ingredient override. ui=${uiOverrideAssetKeys.join(', ')} pack=${scopedReferenceAssetKeys.join(', ')}.`)
    }
    const disallowed = uiOverrideIngredients
      .filter((entry) => scopedReferenceAssetKeys.includes(helpers.readText(entry.assetKey ?? entry.asset_key)))
      .filter((entry) => {
        const kind = helpers.readText(entry.kind).toLowerCase()
        const role = helpers.readText(entry.role).toLowerCase()
        return ['spot', 'location_spot', 'set', 'location_set', 'coverage_anchor', 'spot_camera_grid'].includes(kind)
          || role === 'coverage_anchor'
          || role.includes('spot_camera_grid')
      })
    if (disallowed.length > 0) {
      throw new Error(`Rejected stale spot/set/coverage reference in UI ingredient override: ${disallowed.map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key)).filter(Boolean).join(', ')}.`)
    }
  }
  const scopedReferenceAssetKeySet = new Set(scopedReferenceAssetKeys)
  const referenceImages = scopedReferenceAssetKeys
    .map((assetKey) => {
      const reference = references.find((entry) => helpers.readText(entry.assetKey) === assetKey) ?? {}
      const image = imageByAssetKey.get(assetKey) ?? {}
      const role = helpers.readText(reference.role) || 'shot_ingredient_reference'
      return {
        ...image,
        ...reference,
        assetKey,
        role,
        name: helpers.readText(reference.name)
          || helpers.readText(image.name)
          || helpers.titleFromRefLike(role),
        label: helpers.readText(reference.name)
          || helpers.readText(image.name)
          || helpers.titleFromRefLike(role),
        referenceRole: role,
      }
    })
  const missingConfiguredReferences = scopedReferenceAssetKeys
    .filter((assetKey) => !references.some((reference) => helpers.readText(reference.assetKey) === assetKey))
    .map((assetKey) => ({
      status: 'missing',
      assetKey,
      role: 'shot_ingredient_reference',
      identityKey: 'assetKey',
      identityValue: assetKey,
      blockingReason: 'missing_shot_ingredient_reference',
    }))
  const missingReferences = [
    ...missingConfiguredReferences,
    ...allReferences
    .filter((reference) => {
      const assetKey = helpers.readText(reference.assetKey)
      return helpers.readText(reference.status) !== 'ready' || (assetKey && !scopedReferenceAssetKeySet.has(assetKey))
    })
  ]
    .filter((reference, index, entries) => {
      const key = helpers.readText(reference.assetKey) || helpers.readText(reference.identityValue) || helpers.readText(reference.role) || String(index)
      return entries.findIndex((entry) => (helpers.readText(entry.assetKey) || helpers.readText(entry.identityValue) || helpers.readText(entry.role) || String(index)) === key) === index
    })
  const assetPack = orderSequenceAnimaticAssetPackReferences(scopeAssetPackToReferenceAssetKeys({
    assetPack: rawAssetPack,
    referenceAssetKeys: scopedReferenceAssetKeys,
    fallbackEntities,
    referenceScope: 'sequence_animatic_shot_production',
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const coverageAnchor = references.find((reference) => helpers.readText(reference.role) === 'coverage_anchor' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const previousKeyframe = references.find((reference) => helpers.readText(reference.role) === 'previous_keyframe' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const storyboardPanel = references.find((reference) => helpers.readText(reference.role) === 'storyboard_panel' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const coverageAnchorImage = coverageAnchor ? imageByAssetKey.get(helpers.readText(coverageAnchor.assetKey)) ?? null : null
  const previousKeyframeImage = previousKeyframe ? imageByAssetKey.get(helpers.readText(previousKeyframe.assetKey)) ?? null : null
  const storyboardPanelImage = storyboardPanel ? imageByAssetKey.get(helpers.readText(storyboardPanel.assetKey)) ?? null : null
  const primaryImage = referenceImages.find((image) => helpers.readText(image.assetKey)) ?? coverageAnchorImage ?? storyboardPanelImage ?? previousKeyframeImage ?? null
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = sequenceAnimaticReferenceManifestText(assetPack)
  const referencePlanHash = helpers.readText(config.referencePlanHash ?? config.reference_plan_hash)
  const omittedIngredients = uiIngredientOverrideMode
    ? uiOverrideIngredients.filter((entry) => helpers.readText(entry.status) !== 'ready' || !helpers.readText(entry.assetKey ?? entry.asset_key))
    : []
  const outputs = {
    shot,
    shots: Object.keys(shot).length > 0 ? [shot] : [],
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    references,
    allReferences,
    all_references: allReferences,
    referenceAssetKeys: scopedReferenceAssetKeys,
    reference_asset_keys: scopedReferenceAssetKeys,
    referenceImages,
    reference_images: referenceImages,
    referencePlanHash,
    reference_plan_hash: referencePlanHash,
    uiIngredientPlanHash,
    ui_ingredient_plan_hash: uiIngredientPlanHash,
    shotReferenceOverride,
    shot_reference_override: shotReferenceOverride,
    omittedIngredients,
    omitted_ingredients: omittedIngredients,
    missingReferences,
    missing_references: missingReferences,
    resolvedReferenceAssetKeys,
    resolved_reference_asset_keys: resolvedReferenceAssetKeys,
    coverageAnchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    coverage_anchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    previousKeyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    previous_keyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    storyboardPanel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    storyboard_panel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    ...(primaryImage ? { image: primaryImage, keyframe: primaryImage, primaryReferenceImage: primaryImage } : {}),
    text: JSON.stringify({ shot, references, referenceAssetKeys: scopedReferenceAssetKeys, resolvedReferenceAssetKeys }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-reference-pack-v1' })
}

const sequenceAnimaticShotReferenceHandlers = {
  sequence_animatic_shot_input: sequenceAnimaticShotInput,
  sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef,
  sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack,
}

const sequenceAnimaticShotReferenceWorkflowNodePackKey = 'sequence_animatic_shot_reference'

export const sequenceAnimaticShotReferenceWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticShotReferenceHandlers
>({
  packKey: sequenceAnimaticShotReferenceWorkflowNodePackKey,
  handlers: sequenceAnimaticShotReferenceHandlers,
})

export const sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys = sequenceAnimaticShotReferenceWorkflowNodePack.handlerKeys

function createSequenceAnimaticShotReferenceNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticShotReferenceHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic shot reference workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticShotReferenceWorkflowNodePackKey,
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

export const sequenceAnimaticShotReferenceWorkflowNodeScaffolds = [
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.shot',
      'config.panel',
      'config.assetPack',
      'config.editorialDurationSeconds',
      'config.storyboardBlockId',
      'config.sequenceAnimaticRole',
      'config.screenplayAnimaticRole',
      'config.screenplayAnimaticSource',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shared_asset_ref',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.referenceRole',
      'config.sourceArtifactRole',
      'config.identityKey',
      'config.identityValue',
      'config.expectedAssetKey',
      'config.directReference',
      'config.masterRequestId',
      'config.sourceWorkflowId',
      'config.sourceRequestId',
      'config.required',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_reference_pack',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.asset_pack',
      'upstream.reference',
      'upstream.image',
      'upstream.keyframe',
      'upstream.primaryReferenceImage',
      'config.requiredReferenceAssetKeys',
      'config.assetPackReferenceLimit',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
]

export const sequenceAnimaticShotReferenceWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticShotReferenceWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticShotReferenceWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticShotReferenceWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
