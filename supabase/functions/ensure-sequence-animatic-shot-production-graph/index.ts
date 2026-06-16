import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  resolveSequenceAnimaticCombinedManifest,
} from '../_shared/output-workflow.ts'
import {
  buildSequenceAnimaticShotProductionWorkflowGraph,
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticStableHash,
} from '../_shared/sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticShotProductionGraphEnsureRequestSchema,
  sequenceAnimaticShotProductionGraphEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'
import {
  continuityNodeCollections,
  continuityNodeParentId,
  continuityNodeUsesParent,
  continuityVisualDependencyEdges,
  shotReferenceNodeIds,
} from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import { deriveSequenceAnimaticSceneStates } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import { sequenceAnimaticVisualReferenceHash } from '../../../src/domain/sequenceAnimaticVisualReferencePlan.ts'

const SHOT_GRAPH_POLICY_VERSION = 'primary_chain_v7'
const SHOT_GRAPH_DEPENDENCY_MODE = 'single_node_chain'
const COVERAGE_REGISTRY_VERSION = 'per_shot_coverage_registry_v1'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSource(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

function sceneGraphOverrideForNode(metadata: Record<string, unknown>, nodeId: string) {
  const overrides = asRecord(metadata.sequenceAnimaticSceneGraphOverrides ?? metadata.sequence_animatic_scene_graph_overrides)
  const nodes = asRecord(overrides.nodes)
  const override = asRecord(nodes[nodeId])
  return {
    visualBriefOverride: readText(override.visualBriefOverride),
    extraPromptDirection: readText(override.extraPromptDirection),
    lastGeneratedAssetKey: readText(override.lastGeneratedAssetKey),
  }
}

function applySceneGraphOverrideToCoverageSetup(setup: Record<string, unknown>, override: ReturnType<typeof sceneGraphOverrideForNode>) {
  if (!override.visualBriefOverride && !override.extraPromptDirection) return setup
  return {
    ...setup,
    baseStagingBrief: readText(setup.stagingBrief ?? setup.staging_brief),
    stagingBrief: override.visualBriefOverride || readText(setup.stagingBrief ?? setup.staging_brief),
    staging_brief: override.visualBriefOverride || readText(setup.stagingBrief ?? setup.staging_brief),
    sceneGraphOverride: override,
    scene_graph_override: override,
  }
}

function applySceneGraphOverrideToNode(node: Record<string, unknown>, override: ReturnType<typeof sceneGraphOverrideForNode>) {
  if (!override.visualBriefOverride && !override.extraPromptDirection) return node
  return {
    ...node,
    baseVisualBrief: readText(node.visualBrief) || readText(node.summary),
    visualBrief: override.visualBriefOverride || readText(node.visualBrief),
    summary: override.visualBriefOverride || readText(node.summary),
    sceneGraphOverride: override,
    scene_graph_override: override,
  }
}

function artifactMetadataRecord(
  artifacts: readonly Record<string, unknown>[],
  roles: readonly string[],
  fields: readonly string[],
) {
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    if (!roles.includes(readText(metadata.role))) continue
    for (const field of fields) {
      const record = asRecord(metadata[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

function assetEntityForKey(assetKey: string, label: string) {
  return {
    key: `continuity_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role: 'continuity_reference',
    summary: 'Previously generated continuity asset used as a visual dependency.',
    visualDescription: 'Use this reference to preserve style, material, lighting, spatial layout, and design continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_asset',
    selectedReferenceVariantLabel: label || 'Continuity reference',
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Scene-graph continuity visual dependency.',
  }
}

function entityAssetKeys(entity: Record<string, unknown>) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

function preferredEntityAssetKey(entity: Record<string, unknown>) {
  return entityAssetKeys(entity)[0] ?? ''
}

function prioritizedEntityAssetKeys(entities: readonly Record<string, unknown>[], limit = 8) {
  const primaryKeys = uniqueTexts(entities.map(preferredEntityAssetKey))
  const extraKeys = uniqueTexts(entities.flatMap(entityAssetKeys).filter((assetKey) => !primaryKeys.includes(assetKey)))
  return uniqueTexts([...primaryKeys, ...extraKeys]).slice(0, Math.max(1, limit))
}

function shotEntityRefIds(shot: Record<string, unknown>) {
  const refs = asRecord(shot.refs ?? shot.references)
  return uniqueTexts([
    ...readStringArray(refs.characterRefIds ?? refs.character_ref_ids),
    ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
    ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
    ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
    ...readStringArray(refs.itemRefIds ?? refs.item_ref_ids),
    ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
    ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
    ...readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
    ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
    ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
    ...readArray(shot.dialogue).map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)),
  ])
}

function coverageSetupEntityRefIds(coverageSetup: Record<string, unknown>) {
  return uniqueTexts([
    ...readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
    ...readStringArray(coverageSetup.visibleCharacterRefIds ?? coverageSetup.visible_character_ref_ids),
    ...readStringArray(coverageSetup.subjectRefIds ?? coverageSetup.subject_ref_ids),
    ...readStringArray(coverageSetup.speakerRefIds ?? coverageSetup.speaker_ref_ids),
    ...readStringArray(coverageSetup.propRefIds ?? coverageSetup.prop_ref_ids),
    ...readStringArray(coverageSetup.itemRefIds ?? coverageSetup.item_ref_ids),
  ])
}

function shotSpatialFingerprint(shot: Record<string, unknown>, coverageSetup: Record<string, unknown>) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
  const setupSpotIds = readStringArray(coverageSetup.spotIds ?? coverageSetup.spot_ids)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
    || bindingSpotIds[0]
    || readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id)
    || setupSpotIds[0]
  return uniqueTexts([
    readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(coverageSetup.setId ?? coverageSetup.set_id),
    readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
    primarySpotId,
    readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
    readText(binding.angleId ?? binding.angle_id ?? shot.angleId ?? shot.angle_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
  ]).join('>')
}

function sameNonEmptySet(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return false
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function sceneIdForShot(shot: Record<string, unknown>) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const idScene = /^scene_\d+/i.exec(readText(shot.id))?.[0] ?? ''
  const blockScene = /^scene_\d+/i.exec(readText(shot.storyboardBlockId ?? shot.blockId ?? shot.block_id))?.[0] ?? ''
  const explicitScene = readText(shot.sourceSceneId ?? shot.source_scene_id ?? binding.sceneId ?? binding.scene_id)
  const genericScene = readText(shot.sceneId ?? shot.scene_id)
  return explicitScene
    || idScene
    || blockScene
    || (genericScene && genericScene !== 'sequence_animatic_master' ? genericScene : '')
    || 'scene'
}

function coverageSpatialFields(shot: Record<string, unknown>, fallbackSetup: Record<string, unknown> = {}) {
  const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
  const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
  const setupSpotIds = readStringArray(fallbackSetup.spotIds ?? fallbackSetup.spot_ids)
  const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
    || bindingSpotIds[0]
    || readText(fallbackSetup.primarySpotId ?? fallbackSetup.primary_spot_id)
    || setupSpotIds[0]
  return {
    setId: readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(fallbackSetup.setId ?? fallbackSetup.set_id),
    zoneId: readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(fallbackSetup.zoneId ?? fallbackSetup.zone_id),
    primarySpotId,
    spotIds: uniqueTexts([primarySpotId]),
    viewpointId: readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(fallbackSetup.viewpointId ?? fallbackSetup.viewpoint_id),
  }
}

function coverageCameraFields(shot: Record<string, unknown>, fallbackSetup: Record<string, unknown> = {}) {
  const shotCamera = asRecord(shot.camera)
  const setupCamera = asRecord(fallbackSetup.camera)
  return {
    framing: readText(shotCamera.framing ?? shot.framing) || readText(setupCamera.framing),
    angle: readText(shotCamera.angle ?? shot.angle) || readText(setupCamera.angle),
    lens: readText(shotCamera.lens ?? shot.lens) || readText(setupCamera.lens),
    movement: readText(shotCamera.movement ?? shot.movement) || readText(setupCamera.movement),
    screenDirectionRule: readText(shotCamera.screenDirectionRule ?? shotCamera.screen_direction_rule ?? shot.screenDirection ?? shot.screen_direction)
      || readText(setupCamera.screenDirectionRule ?? setupCamera.screen_direction_rule),
  }
}

function normalizedCameraClass(value: string) {
  const text = normalizeReferenceText(value)
  if (!text) return ''
  if (/\b(close|cu|closeup|insert|detail)\b/.test(text)) return 'close'
  if (/\b(wide|master|establish)\b/.test(text)) return 'wide'
  if (/\b(medium|mid)\b/.test(text)) return 'medium'
  return text.split(' ').slice(0, 3).join(' ')
}

function displayNameFromRefId(value: string) {
  return readText(value)
    .replace(/^coverage_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

function coverageSubjectLabel(subjectIds: readonly string[]) {
  if (subjectIds.length === 0) return ''
  if (subjectIds.length === 1) return displayNameFromRefId(subjectIds[0] ?? '')
  if (subjectIds.length === 2) return subjectIds.map(displayNameFromRefId).join(' ')
  if (subjectIds.length === 3) return 'Trio'
  return 'Group'
}

function coverageAxisLabel(shot: Record<string, unknown>, camera: Record<string, string>) {
  const linkMode = normalizeReferenceText(readText(asRecord(shot.continuityLink ?? shot.continuity_link).mode))
  const screenDirection = normalizeReferenceText(readText(camera.screenDirectionRule))
  if (linkMode.includes('reverse') || screenDirection.includes('offscreen')) return 'Reverse'
  if (linkMode.includes('insert') || linkMode.includes('cutaway')) return 'Insert'
  return ''
}

function coverageBlockingIntent(shot: Record<string, unknown>, setup: Record<string, unknown>) {
  const linkMode = readText(asRecord(shot.continuityLink ?? shot.continuity_link).mode)
    || readText(setup.continuityMode ?? setup.continuity_mode)
  const normalized = normalizeReferenceText(linkMode)
  if (normalized.includes('insert') || normalized.includes('cutaway')) return 'insert'
  if (normalized.includes('blocking change')) return 'blocking_change'
  if (normalized.includes('reverse')) return 'reverse'
  return ''
}

function coverageReuseSignatureForShot(input: {
  shot: Record<string, unknown>
  setup?: Record<string, unknown>
}) {
  const setup = input.setup ?? {}
  const spatial = coverageSpatialFields(input.shot, setup)
  const camera = coverageCameraFields(input.shot, setup)
  return {
    setId: spatial.setId,
    zoneId: spatial.zoneId,
    primarySpotId: spatial.primarySpotId,
    viewpointId: spatial.viewpointId,
    framingClass: normalizedCameraClass(camera.framing),
    angle: normalizeReferenceText(camera.angle),
    screenDirection: normalizeReferenceText(camera.screenDirectionRule),
    subjectIds: shotEntityRefIds(input.shot).slice().sort(),
    blockingIntent: coverageBlockingIntent(input.shot, setup),
  }
}

function coverageReuseSignatureForSetup(setup: Record<string, unknown>) {
  const stored = asRecord(setup.coverageReuseSignature ?? setup.coverage_reuse_signature)
  if (Object.keys(stored).length > 0) return stored
  const camera = coverageCameraFields({}, setup)
  return {
    setId: readText(setup.setId ?? setup.set_id),
    zoneId: readText(setup.zoneId ?? setup.zone_id),
    primarySpotId: readText(setup.primarySpotId ?? setup.primary_spot_id),
    viewpointId: readText(setup.viewpointId ?? setup.viewpoint_id),
    framingClass: normalizedCameraClass(camera.framing),
    angle: normalizeReferenceText(camera.angle),
    screenDirection: normalizeReferenceText(camera.screenDirectionRule),
    subjectIds: coverageSetupSubjectIds(setup).slice().sort(),
    blockingIntent: normalizeReferenceText(readText(setup.coverageBlockingIntent ?? setup.coverage_blocking_intent ?? setup.continuityMode ?? setup.continuity_mode)),
  }
}

function coverageReuseSignaturesMatch(left: Record<string, unknown>, right: Record<string, unknown>) {
  const scalarKeys = ['setId', 'zoneId', 'primarySpotId', 'viewpointId', 'framingClass', 'angle', 'screenDirection', 'blockingIntent']
  for (const key of scalarKeys) {
    if (readText(left[key]) !== readText(right[key])) return false
  }
  const leftSubjects = readStringArray(left.subjectIds).slice().sort()
  const rightSubjects = readStringArray(right.subjectIds).slice().sort()
  return leftSubjects.length === rightSubjects.length && leftSubjects.every((value, index) => value === rightSubjects[index])
}

function semanticCoverageSetupTitle(input: {
  shot: Record<string, unknown>
  setup?: Record<string, unknown>
}) {
  const setup = input.setup ?? {}
  const spatial = coverageSpatialFields(input.shot, setup)
  const camera = coverageCameraFields(input.shot, setup)
  const subjectLabel = coverageSubjectLabel(shotEntityRefIds(input.shot))
  const cameraLabel = displayNameFromRefId(normalizedCameraClass(camera.framing) || readText(camera.framing) || 'setup')
  return uniqueTexts([
    displayNameFromRefId(spatial.primarySpotId || spatial.zoneId || spatial.setId || 'coverage'),
    subjectLabel,
    cameraLabel,
    coverageAxisLabel(input.shot, camera),
  ]).join(' ')
}

function isShotCoverageTitle(value: unknown) {
  return /^shot\s+\d+\s+coverage$/i.test(readText(value).trim())
}

function normalizedCoverageSetupForShot(input: {
  setup: Record<string, unknown>
  shot: Record<string, unknown>
  reuseReason?: string
}) {
  const existingDisplayTitle = readText(input.setup.displayTitle ?? input.setup.display_title)
  const existingTitle = readText(input.setup.title)
  const semanticTitle = semanticCoverageSetupTitle({ shot: input.shot, setup: input.setup })
  const displayTitle = existingDisplayTitle && !isShotCoverageTitle(existingDisplayTitle)
    ? existingDisplayTitle
    : existingTitle && !isShotCoverageTitle(existingTitle)
      ? existingTitle
      : semanticTitle
  const signature = coverageReuseSignatureForShot({ shot: input.shot, setup: input.setup })
  const shotId = readText(input.shot.id)
  const createdFromShotId = readText(input.setup.createdFromShotId ?? input.setup.created_from_shot_id) || shotId
  const firstUsedShotId = readText(input.setup.firstUsedShotId ?? input.setup.first_used_shot_id) || createdFromShotId || shotId
  return {
    ...input.setup,
    title: displayTitle,
    displayTitle,
    display_title: displayTitle,
    coverageReuseSignature: signature,
    coverage_reuse_signature: signature,
    coverageBlockingIntent: readText(signature.blockingIntent),
    coverage_blocking_intent: readText(signature.blockingIntent),
    createdFromShotId,
    created_from_shot_id: createdFromShotId,
    firstUsedShotId,
    first_used_shot_id: firstUsedShotId,
    reuseReason: input.reuseReason ?? readText(input.setup.reuseReason ?? input.setup.reuse_reason),
    reuse_reason: input.reuseReason ?? readText(input.setup.reuseReason ?? input.setup.reuse_reason),
  }
}

function coverageSetupSubjectIds(setup: Record<string, unknown>) {
  return uniqueTexts([
    ...coverageSetupEntityRefIds(setup),
    ...readStringArray(setup.characterRefIds ?? setup.character_ref_ids),
    ...readStringArray(setup.itemRefIds ?? setup.item_ref_ids),
    ...readStringArray(setup.propRefIds ?? setup.prop_ref_ids),
  ])
}

function coverageSetupScopeIssues(shot: Record<string, unknown>, setup: Record<string, unknown>) {
  const sceneId = sceneIdForShot(shot)
  const shotSpatial = coverageSpatialFields(shot, setup)
  const setupId = readText(setup.id)
  const setupSceneId = readText(setup.sceneId ?? setup.scene_id)
  const setupPrimarySpotId = readText(setup.primarySpotId ?? setup.primary_spot_id)
  const setupSpotIds = uniqueTexts(readStringArray(setup.spotIds ?? setup.spot_ids))
  const issues: string[] = []
  if (setupId.includes('sequence_animatic_master')) issues.push('stale_master_scoped_setup_id')
  if (setupSceneId && setupSceneId !== sceneId) issues.push('scene_scope_mismatch')
  if (shotSpatial.primarySpotId && setupPrimarySpotId && setupPrimarySpotId !== shotSpatial.primarySpotId) issues.push('primary_spot_mismatch')
  if (shotSpatial.primarySpotId && (setupSpotIds.length !== 1 || setupSpotIds[0] !== shotSpatial.primarySpotId)) issues.push('spot_scope_not_primary_only')
  return issues
}

function compatibleCoverageSetup(input: {
  shot: Record<string, unknown>
  setup: Record<string, unknown>
}) {
  const shotSpatial = coverageSpatialFields(input.shot, input.setup)
  const setupSpatial = {
    setId: readText(input.setup.setId ?? input.setup.set_id),
    zoneId: readText(input.setup.zoneId ?? input.setup.zone_id),
    primarySpotId: readText(input.setup.primarySpotId ?? input.setup.primary_spot_id),
    viewpointId: readText(input.setup.viewpointId ?? input.setup.viewpoint_id),
  }
  const spatialMatches = Boolean(shotSpatial.setId && shotSpatial.zoneId && shotSpatial.primarySpotId)
    && shotSpatial.setId === setupSpatial.setId
    && shotSpatial.zoneId === setupSpatial.zoneId
    && shotSpatial.primarySpotId === setupSpatial.primarySpotId
    && (!shotSpatial.viewpointId || !setupSpatial.viewpointId || shotSpatial.viewpointId === setupSpatial.viewpointId)
  const shotCamera = coverageCameraFields(input.shot, input.setup)
  const setupCamera = coverageCameraFields({}, input.setup)
  const cameraMatches = normalizedCameraClass(shotCamera.framing) === normalizedCameraClass(setupCamera.framing)
    && (!shotCamera.angle || !setupCamera.angle || normalizeReferenceText(shotCamera.angle) === normalizeReferenceText(setupCamera.angle))
    && (!shotCamera.screenDirectionRule || !setupCamera.screenDirectionRule || normalizeReferenceText(shotCamera.screenDirectionRule) === normalizeReferenceText(setupCamera.screenDirectionRule))
  const shotSubjects = shotEntityRefIds(input.shot)
  const setupSubjects = coverageSetupSubjectIds(input.setup)
  const subjectMatches = shotSubjects.length === 0 && setupSubjects.length === 0
    ? true
    : sameNonEmptySet(new Set(shotSubjects), new Set(setupSubjects))
  const signatureMatches = coverageReuseSignaturesMatch(
    coverageReuseSignatureForShot({ shot: input.shot, setup: input.setup }),
    coverageReuseSignatureForSetup(input.setup),
  )
  const scopeIssues = coverageSetupScopeIssues(input.shot, input.setup)
  const diagnostics = [
    spatialMatches ? 'spatial_match' : 'spatial_mismatch',
    cameraMatches ? 'camera_match' : 'camera_mismatch',
    subjectMatches ? 'subjects_match' : 'subjects_mismatch',
    signatureMatches ? 'reuse_signature_match' : 'reuse_signature_mismatch',
    ...(scopeIssues.length === 0 ? ['coverage_scope_match'] : scopeIssues),
  ]
  return { compatible: spatialMatches && cameraMatches && subjectMatches && signatureMatches && scopeIssues.length === 0, diagnostics }
}

function createCoverageSetupForShot(input: {
  shot: Record<string, unknown>
  legacySetup?: Record<string, unknown>
}) {
  const shotId = readText(input.shot.id)
  const spatial = coverageSpatialFields(input.shot, input.legacySetup ?? {})
  const camera = coverageCameraFields(input.shot, input.legacySetup ?? {})
  const subjectIds = shotEntityRefIds(input.shot)
  const hash = sequenceAnimaticStableHash({ shotId, spatial, camera, subjectIds }).slice(0, 8)
  const sceneId = sceneIdForShot(input.shot)
  const coverageReuseSignature = coverageReuseSignatureForShot({ shot: input.shot, setup: input.legacySetup })
  const displayTitle = semanticCoverageSetupTitle({ shot: input.shot, setup: input.legacySetup })
  return {
    id: `coverage_${slugify(sceneId)}_${slugify(shotId)}_${hash}`,
    sceneId,
    title: displayTitle,
    displayTitle,
    display_title: displayTitle,
    coverageReuseSignature,
    coverage_reuse_signature: coverageReuseSignature,
    coverageBlockingIntent: readText(coverageReuseSignature.blockingIntent),
    coverage_blocking_intent: readText(coverageReuseSignature.blockingIntent),
    createdFromShotId: shotId,
    created_from_shot_id: shotId,
    firstUsedShotId: shotId,
    first_used_shot_id: shotId,
    reuseReason: '',
    reuse_reason: '',
    setupKind: normalizedCameraClass(camera.framing) || 'shot_setup',
    setId: spatial.setId,
    zoneId: spatial.zoneId,
    primarySpotId: spatial.primarySpotId,
    spotIds: spatial.spotIds,
    viewpointId: spatial.viewpointId,
    characterRefIds: subjectIds,
    subjectRefIds: subjectIds,
    screenDirection: camera.screenDirectionRule,
    camera,
    lighting: readText(input.shot.lighting),
    stagingBrief: readText(input.shot.action) || readText(input.shot.description) || readText(input.legacySetup?.stagingBrief ?? input.legacySetup?.staging_brief),
    continuityMode: 'new_setup',
    usedShotIds: [shotId].filter(Boolean),
    blockIds: [readText(input.shot.storyboardBlockId ?? input.shot.blockId)].filter(Boolean),
    required: true,
    generatedBy: 'per_shot_coverage_resolver',
  }
}

function coverageRegistryFromSources(input: {
  masterMetadata: Record<string, unknown>
  directorPlan: Record<string, unknown>
  masterRequestId: string
}) {
  const stored = asRecord(input.masterMetadata.sequenceAnimaticCoverageRegistry ?? input.masterMetadata.sequence_animatic_coverage_registry)
  const storedSetups = readArray(stored.coverageSetups ?? stored.coverage_setups).map(asRecord).filter((setup) => readText(setup.id))
  const legacySetups = readArray(input.directorPlan.coverageSetups ?? input.directorPlan.coverage_setups).map(asRecord).filter((setup) => readText(setup.id))
  const setupById = new Map<string, Record<string, unknown>>()
  for (const setup of legacySetups) setupById.set(readText(setup.id), { ...setup, legacyCoverageSetup: true })
  for (const setup of storedSetups) setupById.set(readText(setup.id), setup)
  const storedAssignments = asRecord(stored.coverageSetupByShotId ?? stored.coverage_setup_by_shot_id)
  return {
    role: 'sequence_animatic_coverage_registry',
    contractVersion: COVERAGE_REGISTRY_VERSION,
    sourceMasterRequestId: input.masterRequestId,
    revision: Number(stored.revision ?? 0) || 0,
    coverageSetups: [...setupById.values()],
    coverageSetupByShotId: Object.fromEntries(Object.entries(storedAssignments).map(([shotId, setupId]) => [shotId, readText(setupId)]).filter(([, setupId]) => setupId)),
    updatedByShotId: asRecord(stored.updatedByShotId ?? stored.updated_by_shot_id),
  }
}

function resolveCoverageSetupForShot(input: {
  shot: Record<string, unknown>
  registry: ReturnType<typeof coverageRegistryFromSources>
  legacySetup: Record<string, unknown>
  forceRefresh: boolean
}) {
  const shotId = readText(input.shot.id)
  const existingAssignedId = !input.forceRefresh ? readText(input.registry.coverageSetupByShotId[shotId]) : ''
  const assignedSetup = existingAssignedId ? input.registry.coverageSetups.find((setup) => readText(setup.id) === existingAssignedId) ?? null : null
  if (assignedSetup) {
    const compatibility = compatibleCoverageSetup({ shot: input.shot, setup: assignedSetup })
    if (compatibility.compatible) {
      const reason = 'Existing shot coverage registry assignment is compatible.'
      return {
        coverageSetup: normalizedCoverageSetupForShot({ setup: assignedSetup, shot: input.shot, reuseReason: reason }),
        coverageSetupId: readText(assignedSetup.id),
        coverageDecision: 'reuse',
        coverageSetupSource: asRecord(assignedSetup).legacyCoverageSetup === true ? 'legacy_director_plan' : 'registry_reuse',
        coverageDecisionReason: reason,
        compatibilityDiagnostics: compatibility.diagnostics,
      }
    }
  }
  const candidates = input.registry.coverageSetups
    .map((setup) => ({ setup, compatibility: compatibleCoverageSetup({ shot: input.shot, setup }) }))
    .filter((entry) => entry.compatibility.compatible)
  const candidate = candidates.find((entry) => asRecord(entry.setup).legacyCoverageSetup !== true) ?? candidates[0] ?? null
  if (candidate) {
    const reason = 'Found a compatible coverage setup in the registry.'
    return {
      coverageSetup: normalizedCoverageSetupForShot({ setup: candidate.setup, shot: input.shot, reuseReason: reason }),
      coverageSetupId: readText(candidate.setup.id),
      coverageDecision: 'reuse',
      coverageSetupSource: asRecord(candidate.setup).legacyCoverageSetup === true ? 'legacy_director_plan' : 'registry_reuse',
      coverageDecisionReason: reason,
      compatibilityDiagnostics: candidate.compatibility.diagnostics,
    }
  }
  const created = createCoverageSetupForShot({ shot: input.shot, legacySetup: input.legacySetup })
  return {
    coverageSetup: created,
    coverageSetupId: readText(created.id),
    coverageDecision: 'create',
    coverageSetupSource: 'registry_create',
    coverageDecisionReason: 'No compatible setup matched this shot spatial chain, camera, and visible subjects.',
    compatibilityDiagnostics: ['created_per_shot_setup'],
  }
}

function applyCoverageResolutionToRegistry(input: {
  registry: ReturnType<typeof coverageRegistryFromSources>
  shotId: string
  setup: Record<string, unknown>
}) {
  const setupId = readText(input.setup.id)
  const setups = input.registry.coverageSetups.filter((setup) => readText(setup.id) !== setupId)
  setups.push(input.setup)
  const coverageSetupByShotId = {
    ...input.registry.coverageSetupByShotId,
    [input.shotId]: setupId,
  }
  return {
    role: 'sequence_animatic_coverage_registry',
    contractVersion: COVERAGE_REGISTRY_VERSION,
    sourceMasterRequestId: input.registry.sourceMasterRequestId,
    revision: input.registry.revision + 1,
    coverageSetups: setups,
    coverage_setups: setups,
    coverageSetupByShotId,
    coverage_setup_by_shot_id: coverageSetupByShotId,
    updatedByShotId: {
      ...input.registry.updatedByShotId,
      [input.shotId]: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  }
}

function shotScenePrefix(shot: Record<string, unknown>) {
  return sceneIdForShot(shot)
}

function graphNodeRelevanceScore(node: Record<string, unknown>, shot: Record<string, unknown>) {
  const shotId = readText(shot.id)
  const sceneId = shotScenePrefix(shot)
  const blockId = readText(shot.storyboardBlockId ?? shot.blockId ?? shot.block_id)
  const nodeShotIds = readStringArray(node.shotIds ?? node.shot_ids ?? node.usedShotIds ?? node.used_shot_ids)
  const nodeBlockIds = readStringArray(node.storyboardBlockIds ?? node.storyboard_block_ids ?? node.blockIds ?? node.block_ids)
  let score = 0
  if (shotId && nodeShotIds.includes(shotId)) score += 100
  if (blockId && nodeBlockIds.includes(blockId)) score += 60
  if (sceneId && nodeShotIds.some((id) => id.startsWith(`${sceneId}_`))) score += 35
  if (sceneId && nodeBlockIds.some((id) => id.startsWith(`${sceneId}_`))) score += 25
  if (sceneId && readText(node.sceneId ?? node.scene_id) === sceneId) score += 20
  if (nodeShotIds.length > 0 && sceneId && !nodeShotIds.some((id) => id.startsWith(`${sceneId}_`))) score -= 30
  if (nodeBlockIds.length > 0 && sceneId && !nodeBlockIds.some((id) => id.startsWith(`${sceneId}_`))) score -= 20
  return score
}

function graphNodeMapForShot(nodes: readonly Record<string, unknown>[], shot: Record<string, unknown>) {
  const byId = new Map<string, { node: Record<string, unknown>; score: number }>()
  for (const node of nodes) {
    const id = readText(node.id)
    if (!id) continue
    const score = graphNodeRelevanceScore(node, shot)
    const current = byId.get(id)
    if (!current || score > current.score) byId.set(id, { node, score })
  }
  return new Map([...byId.entries()].map(([id, entry]) => [id, shotScopedContinuityNode(entry.node, shot)] as const))
}

function continuityNodeMatchesShotScene(node: Record<string, unknown>, shot: Record<string, unknown>) {
  const shotId = readText(shot.id)
  const sceneId = shotScenePrefix(shot)
  const blockId = readText(shot.storyboardBlockId ?? shot.blockId ?? shot.block_id)
  const nodeSceneId = readText(node.sceneId ?? node.scene_id)
  const nodeShotIds = readStringArray(node.shotIds ?? node.shot_ids ?? node.usedShotIds ?? node.used_shot_ids)
  const nodeBlockIds = readStringArray(node.storyboardBlockIds ?? node.storyboard_block_ids ?? node.blockIds ?? node.block_ids)
  if (shotId && nodeShotIds.includes(shotId)) return true
  if (blockId && nodeBlockIds.includes(blockId)) return true
  if (sceneId && nodeSceneId === sceneId) return true
  if (sceneId && nodeShotIds.some((id) => id.startsWith(`${sceneId}_`))) return true
  if (sceneId && nodeBlockIds.some((id) => id.startsWith(`${sceneId}_`))) return true
  return nodeSceneId === '' && nodeShotIds.length === 0 && nodeBlockIds.length === 0
}

function shotScopedContinuityNode(node: Record<string, unknown>, shot: Record<string, unknown>) {
  if (continuityNodeMatchesShotScene(node, shot)) return node
  const shotId = readText(shot.id)
  const blockId = readText(shot.storyboardBlockId ?? shot.blockId ?? shot.block_id)
  const kind = readText(node.nodeKind ?? node.assetKind)
  const name = readText(node.name ?? node.title) || readText(node.id)
  const shotAction = readText(shot.action ?? shot.description ?? shot.videoDirection)
  const scoped: Record<string, unknown> = {
    ...node,
    sceneId: shotScenePrefix(shot),
    scene_id: shotScenePrefix(shot),
    shotIds: shotId ? [shotId] : [],
    shot_ids: shotId ? [shotId] : [],
    storyboardBlockIds: blockId ? [blockId] : [],
    storyboard_block_ids: blockId ? [blockId] : [],
  }
  if ((kind === 'location_spot' || kind === 'spot') && shotAction) {
    scoped.visualBrief = `${name}: shot-specific physical point for this moment. ${shotAction}`
    scoped.summary = scoped.visualBrief
  }
  return scoped
}

function scopedCoverageShotsForShot(input: {
  shot: Record<string, unknown>
  coverageSetup: Record<string, unknown>
  coverageShots: readonly Record<string, unknown>[]
}) {
  const currentShotId = readText(input.shot.id)
  const currentSpatial = shotSpatialFingerprint(input.shot, input.coverageSetup)
  const currentSubjects = new Set(shotEntityRefIds(input.shot))
  const scopedShots = input.coverageShots.filter((candidate) => {
    const candidateId = readText(candidate.id)
    if (candidateId === currentShotId) return true
    if (currentSpatial && shotSpatialFingerprint(candidate, input.coverageSetup) !== currentSpatial) return false
    const candidateSubjects = new Set(shotEntityRefIds(candidate))
    return sameNonEmptySet(currentSubjects, candidateSubjects)
  })
  return scopedShots.some((candidate) => readText(candidate.id) === currentShotId)
    ? scopedShots
    : [input.shot, ...scopedShots]
}

function scopedAssetPackForShot(
  assetPack: Record<string, unknown>,
  shot: Record<string, unknown>,
) {
  const shotRefIds = shotEntityRefIds(shot)
  const entityIds = new Set(shotRefIds)
  const entities = readArray(assetPack.entities).map(asRecord).filter((entity) => entityIds.has(readText(entity.key)))
  const requiredReferenceAssetKeys = prioritizedEntityAssetKeys(entities, 8)
  return {
    assetPack: {
      ...assetPack,
      entities,
      selectedEntityKeys: entities.map((entity) => readText(entity.key)).filter(Boolean),
      scopedReferenceAssetKeys: requiredReferenceAssetKeys,
      referenceScope: 'sequence_animatic_shot_graph_refresh',
    },
    requiredReferenceAssetKeys,
    selectedReferences: requiredReferenceAssetKeys.map((assetKey) => ({
      assetKey,
      role: 'entity_reference',
      reason: 'Selected from shot-visible refs.',
    })),
  }
}

function normalizeReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function shotGraphSearchText(shot: Record<string, unknown>, coverageSetup: Record<string, unknown>, contextNodes: readonly Record<string, unknown>[]) {
  return [
    readText(shot.title),
    readText(shot.action),
    readText(shot.description),
    readText(shot.summary),
    readText(shot.storyboardPanelPrompt ?? shot.storyboard_panel_prompt),
    readText(asRecord(shot.camera).blocking ?? shot.blocking),
    readText(asRecord(shot.camera).screenDirection ?? shot.screenDirection ?? shot.screen_direction),
    readText(coverageSetup.title),
    readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief),
    readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction),
    readText(coverageSetup.blockingNotes ?? coverageSetup.blocking_notes),
    ...contextNodes.flatMap((node) => [readText(node.name), readText(node.title), readText(node.summary), readText(node.visualBrief)]),
  ].filter(Boolean).join(' ')
}

function incidentalCharacterNodesForShot(input: {
  shot: Record<string, unknown>
  coverageSetup: Record<string, unknown>
  graphNodeById: Map<string, Record<string, unknown>>
  contextNodes: readonly Record<string, unknown>[]
}) {
  const text = shotGraphSearchText(input.shot, input.coverageSetup, input.contextNodes)
  const shotText = [
    readText(input.shot.title),
    readText(input.shot.action),
    readText(input.shot.description),
    readText(input.shot.summary),
    readText(input.shot.storyboardPanelPrompt ?? input.shot.storyboard_panel_prompt),
  ].filter(Boolean).join(' ')
  const normalizedText = normalizeReferenceText(text)
  if (!normalizedText) return []
  const existingLabels = new Set([...input.graphNodeById.values()].flatMap((node) => [
    normalizeReferenceText(readText(node.id)),
    normalizeReferenceText(readText(node.name)),
    normalizeReferenceText(readText(node.title)),
  ]).filter(Boolean))
  const explicitRefIds = new Set([
    ...shotEntityRefIds(input.shot),
    ...coverageSetupEntityRefIds(input.coverageSetup),
    ...shotReferenceNodeIds(input.shot, new Set([...input.graphNodeById.keys()])),
  ].map(normalizeReferenceText).filter(Boolean))
  const candidates = [
    {
      id: 'temp_character_monastery_attendants',
      name: 'Monastery attendants',
      match: /\battendants?\b/i,
      context: /\bmonastery\b/i,
      summary: 'Visible monastery attendants who rise from the reeds during the confrontation.',
      visualBrief: 'Monastery attendants rising from storm reeds near the marsh stilt path; anonymous temple retainers, wet layered robes, guarded posture, consistent silhouettes, no text.',
    },
  ]
  return candidates
    .filter((candidate) => candidate.match.test(shotText) && candidate.context.test(text))
    .filter((candidate) => !input.graphNodeById.has(candidate.id))
    .filter((candidate) => !existingLabels.has(normalizeReferenceText(candidate.name)) && !existingLabels.has(normalizeReferenceText(candidate.id)))
    .filter((candidate) => !explicitRefIds.has(normalizeReferenceText(candidate.id)) && !explicitRefIds.has(normalizeReferenceText(candidate.name)))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      title: candidate.name,
      nodeKind: 'temporary_character',
      assetKind: 'temporary_character',
      continuitySubtype: 'character',
      summary: candidate.summary,
      visualBrief: candidate.visualBrief,
      persistenceReason: 'Recovered from concrete visible shot prose because no explicit animatic asset anchor was emitted.',
      confidence: 0.68,
      shotIds: [readText(input.shot.id)].filter(Boolean),
      usedShotIds: [readText(input.shot.id)].filter(Boolean),
      sourceEvidence: [readText(input.shot.action), readText(input.coverageSetup.stagingBrief ?? input.coverageSetup.staging_brief)].filter(Boolean),
      recoveredReference: true,
      recoveredReferenceReason: 'visible_incidental_character_group',
    }))
}

function mergedShotPlan(input: {
  manifest: Record<string, unknown>
  directorPlan: Record<string, unknown>
  shotId: string
}) {
  const manifestBlocks = readArray(input.manifest.blocks).map(asRecord).filter((block) => readText(block.id))
  const directorShots = readArray(input.directorPlan.shots).map(asRecord).filter((shot) => readText(shot.id))
  const directorShotsById = new Map(directorShots.map((shot) => [readText(shot.id), shot] as const))
  const blockMap = new Map<string, Record<string, unknown>>()
  const manifestShots = manifestBlocks.flatMap((block) => {
    const blockId = readText(block.id)
    blockMap.set(blockId, block)
    return readArray(block.shots).map(asRecord).map((shot) => ({
      ...shot,
      blockId: readText(shot.blockId) || readText(shot.storyboardBlockId) || blockId,
      storyboardBlockId: readText(shot.storyboardBlockId) || readText(shot.blockId) || blockId,
    }))
  }).filter((shot) => readText(shot.id))
  const shotIdsFromManifest = new Set(manifestShots.map((shot) => readText(shot.id)).filter(Boolean))
  const shots = [
    ...manifestShots,
    ...directorShots.filter((shot) => !shotIdsFromManifest.has(readText(shot.id))).map((shot) => {
      const blockId = readText(shot.storyboardBlockId ?? shot.blockId) || `${readText(shot.sourceSceneId ?? shot.sceneId) || 'scene'}_block`
      if (!blockMap.has(blockId)) blockMap.set(blockId, { id: blockId, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Shot Block', shots: [] })
      return {
        ...shot,
        blockId,
        storyboardBlockId: blockId,
      }
    }),
  ]
  const mergedShots = shots.map((shot) => {
    const directorShot = directorShotsById.get(readText(shot.id)) ?? {}
    return {
      ...shot,
      ...directorShot,
      id: readText(shot.id),
      blockId: readText(directorShot.blockId ?? directorShot.storyboardBlockId) || readText(shot.blockId ?? shot.storyboardBlockId),
      storyboardBlockId: readText(directorShot.storyboardBlockId ?? directorShot.blockId) || readText(shot.storyboardBlockId ?? shot.blockId),
    }
  })
  const shot = mergedShots.find((entry) => readText(entry.id) === input.shotId)
  if (!shot) throw new HttpError(404, `Shot ${input.shotId} was not found in the animatic director plan.`)
  const blockId = readText(shot.storyboardBlockId ?? shot.blockId)
  const block = blockMap.get(blockId) ?? { id: blockId || `${input.shotId}_block`, title: readText(shot.sourceSceneTitle ?? shot.sceneTitle) || 'Shot Block', shots: [shot] }
  const coverageSetups = readArray(input.directorPlan.coverageSetups ?? input.directorPlan.coverage_setups).map(asRecord).filter((setup) => readText(setup.id))
  const coverageSetupId = readText(shot.coverageSetupId ?? shot.coverage_setup_id)
  const coverageSetup = coverageSetupId ? coverageSetups.find((setup) => readText(setup.id) === coverageSetupId) ?? { id: coverageSetupId, title: coverageSetupId } : {}
  const coverageShots = coverageSetupId
    ? mergedShots.filter((entry) => readText(entry.coverageSetupId ?? entry.coverage_setup_id) === coverageSetupId)
    : [shot]
  const sceneState = asRecord(deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups }).get(input.shotId))
  return { shot, block, mergedShots, coverageSetup, coverageSetupId, coverageShots, sceneState }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'ensure-sequence-animatic-shot-production-graph')
    const admin = createAdminClient('ensure-sequence-animatic-shot-production-graph')
    const payload = sequenceAnimaticShotProductionGraphEnsureRequestSchema.parse(await request.json())

    const masterResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    const masterMetadata = asRecord(masterRequest.metadata)
    if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
    const screenplayAnimaticSource = readScreenplayAnimaticSource(
      masterMetadata,
      masterRequest.sourceSurface === 'outputs' ? 'prompt_cinematic' : 'wiki_sequence_unit',
    )

    const masterArtifactsResponse = await client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('workflow_id', masterRequest.workflowId)
      .order('created_at', { ascending: false })
      .limit(24)
    if (masterArtifactsResponse.error) throw new Error(masterArtifactsResponse.error.message)
    const masterArtifacts = (masterArtifactsResponse.data ?? []).map(asRecord)
    let manifest = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
    let directorPlan = artifactMetadataRecord(masterArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
    let combinedManifestArtifactKey = ''
    let shotReadySource = 'final_manifest'
    if (Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) {
      const combined = await resolveSequenceAnimaticCombinedManifest({ client: admin, masterRequest })
      if (combined) {
        manifest = combined.manifest
        directorPlan = combined.directorPlan
        combinedManifestArtifactKey = combined.manifestArtifactKey
        shotReadySource = 'combined_scene_plan'
      }
    }
    let provisionalContext = false
    if ((Object.keys(manifest).length === 0 || Object.keys(directorPlan).length === 0) && payload.allowProvisional) {
      throw new HttpError(409, 'Shot graph inspection needs the manifest or combined scene plan to be ready first.')
    }
    if (Object.keys(manifest).length === 0) throw new HttpError(409, 'Generate the screenplay animatic manifest first.')
    if (Object.keys(directorPlan).length === 0) throw new HttpError(409, 'Generate the shot continuity plan first.')

    const manifestHash = sequenceAnimaticStableHash(manifest)
    const directorPlanHash = readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const masterManifestArtifactKey = readText(masterArtifacts.find((row) => readText(asRecord(row.metadata).role) === 'sequence_animatic_manifest')?.key) || combinedManifestArtifactKey
    const assetPack = asRecord(manifest.assetPack)
    const aspectRatio = readText(assetPack.aspectRatio) || '16:9'
    let { shot, block, mergedShots, coverageSetup, coverageSetupId, coverageShots, sceneState } = mergedShotPlan({
      manifest,
      directorPlan,
      shotId: payload.shotId,
    })
    const legacyCoverageSetup = coverageSetup
    const coverageRegistry = coverageRegistryFromSources({
      masterMetadata,
      directorPlan,
      masterRequestId: masterRequest.id,
    })
    const coverageResolution = resolveCoverageSetupForShot({
      shot,
      registry: coverageRegistry,
      legacySetup: legacyCoverageSetup,
      forceRefresh: payload.forceRefresh === true,
    })
    coverageSetup = coverageResolution.coverageSetup
    coverageSetupId = coverageResolution.coverageSetupId
    coverageShots = mergedShots.filter((entry) => readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids).includes(readText(entry.id)))
    if (coverageShots.length === 0) coverageShots = [shot]
    const scopedCoverageShots = scopedCoverageShotsForShot({ shot, coverageSetup, coverageShots })
    const requestedCoverageSetupId = payload.coverageSetupId ? readText(payload.coverageSetupId) : ''
    const nextSetupRecord = {
      ...coverageSetup,
      usedShotIds: uniqueTexts([...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids), payload.shotId]),
      used_shot_ids: uniqueTexts([...readStringArray(coverageSetup.usedShotIds ?? coverageSetup.used_shot_ids), payload.shotId]),
    }
    const priorSetupRecord = coverageRegistry.coverageSetups.find((setup) => readText(setup.id) === coverageSetupId) ?? null
    const needsRegistryUpdate = readText(coverageRegistry.coverageSetupByShotId[payload.shotId]) !== coverageSetupId
      || sequenceAnimaticStableHash(priorSetupRecord ?? {}) !== sequenceAnimaticStableHash(nextSetupRecord)
    const coverageRegistryNext = needsRegistryUpdate ? applyCoverageResolutionToRegistry({
      registry: coverageRegistry,
      shotId: payload.shotId,
      setup: nextSetupRecord,
    }) : {
      ...coverageRegistry,
      coverage_setups: coverageRegistry.coverageSetups,
      coverage_setup_by_shot_id: coverageRegistry.coverageSetupByShotId,
    }
    if (needsRegistryUpdate) {
      const updateResponse = await admin
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            sequenceAnimaticCoverageRegistry: coverageRegistryNext,
            sequence_animatic_coverage_registry: coverageRegistryNext,
          },
        })
        .eq('id', masterRequest.id)
      if (updateResponse.error) throw new Error(updateResponse.error.message)
    }
    coverageSetup = applySceneGraphOverrideToCoverageSetup(
      nextSetupRecord,
      sceneGraphOverrideForNode(asRecord(masterRequest.metadata), coverageSetupId),
    )
    sceneState = asRecord(deriveSequenceAnimaticSceneStates({ shots: mergedShots, coverageSetups: coverageRegistryNext.coverageSetups }).get(payload.shotId))

    const graph = asRecord(
      manifest.continuityGraphV2
        ?? manifest.continuity_graph_v2
        ?? directorPlan.continuityGraphV2
        ?? directorPlan.continuity_graph_v2,
    )
    const allGraphNodes = continuityNodeCollections(graph)
    const graphNodeById = graphNodeMapForShot(allGraphNodes, shot)
    const graphNodeIds = new Set([...graphNodeById.keys()])
    const shotBindings = asRecord(
      manifest.shotBindings
        ?? manifest.shot_bindings
        ?? directorPlan.shotBindings
        ?? directorPlan.shot_bindings
        ?? graph.shotBindings,
    )
    const dependencyEdges = readArray(directorPlan.visualDependencyEdges ?? directorPlan.visual_dependency_edges).map(asRecord)
    const visualDependencyEdges = dependencyEdges.length > 0 ? dependencyEdges : continuityVisualDependencyEdges(graph)
    const assetPackEntities = readArray(assetPack.entities).map(asRecord)

    const primaryShotSpatialNodeIds = () => {
      const binding = asRecord(shot.sceneBinding ?? shot.scene_binding)
      const bindingSpotIds = readStringArray(binding.spotIds ?? binding.spot_ids ?? shot.spotIds ?? shot.spot_ids ?? shot.continuitySpotIds ?? shot.continuity_spot_ids)
      const setupSpotIds = readStringArray(coverageSetup.spotIds ?? coverageSetup.spot_ids)
      const primarySpotId = readText(binding.primarySpotId ?? binding.primary_spot_id ?? shot.primarySpotId ?? shot.primary_spot_id)
        || bindingSpotIds[0]
        || readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id)
        || setupSpotIds[0]
      return [
        readText(binding.setId ?? binding.set_id ?? shot.setId ?? shot.set_id ?? shot.continuitySetId ?? shot.continuity_set_id) || readText(coverageSetup.setId ?? coverageSetup.set_id),
        readText(binding.zoneId ?? binding.zone_id ?? shot.zoneId ?? shot.zone_id ?? shot.continuityZoneId ?? shot.continuity_zone_id) || readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
        primarySpotId,
        readText(binding.viewpointId ?? binding.viewpoint_id ?? shot.viewpointId ?? shot.viewpoint_id) || readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
        readText(binding.angleId ?? binding.angle_id ?? shot.angleId ?? shot.angle_id ?? shot.continuityAngleId ?? shot.continuity_angle_id),
      ].filter(Boolean)
    }
    const referencedAnimaticAssetNodeIds = () => {
      const candidateIds = new Set([
        ...shotReferenceNodeIds(shot, graphNodeIds),
        ...shotEntityRefIds(shot),
      ])
      return [...candidateIds].filter((nodeId) => {
        const node = graphNodeById.get(nodeId)
        const kind = readText(node?.nodeKind)
        const assetKind = readText(node?.assetKind)
        return kind === 'temporary_character' || kind === 'prop' || assetKind === 'temporary_character' || assetKind === 'prop'
      })
    }
    const shotContinuityDependencyNodes = () => {
      const directNodeIds = [
        ...primaryShotSpatialNodeIds(),
        ...referencedAnimaticAssetNodeIds(),
      ].filter((nodeId) => graphNodeIds.has(nodeId))
      const orderedIds: string[] = []
      const seen = new Set<string>()
      const addWithParents = (nodeId: string) => {
        const chain: string[] = []
        let currentId = nodeId
        const localSeen = new Set<string>()
        while (currentId && graphNodeById.has(currentId) && !localSeen.has(currentId)) {
          localSeen.add(currentId)
          chain.push(currentId)
          const parentId = continuityNodeParentId(graphNodeById.get(currentId) ?? {})
          if (!parentId || !graphNodeById.has(parentId)) break
          currentId = parentId
        }
        for (const id of chain.reverse()) {
          if (seen.has(id)) continue
          seen.add(id)
          orderedIds.push(id)
        }
      }
      directNodeIds.forEach(addWithParents)
      const orderedNodes = orderedIds.map((nodeId) => graphNodeById.get(nodeId)).filter((node): node is Record<string, unknown> => Boolean(node))
      const incidentalNodes = incidentalCharacterNodesForShot({ shot, coverageSetup, graphNodeById, contextNodes: orderedNodes })
      return [...orderedNodes, ...incidentalNodes.filter((node) => !seen.has(readText(node.id)))]
    }
    const relevantShotsForNodes = (nodes: readonly Record<string, unknown>[]) => {
      const currentShotId = readText(shot.id)
      const currentShot = mergedShots.find((entry) => readText(entry.id) === currentShotId)
      return currentShot ? [currentShot] : [shot]
    }
    const referenceAssetKeysForTargets = (targetNodes: readonly Record<string, unknown>[]) => {
      const requestedNodeIdSet = new Set(targetNodes.map((node) => readText(node.id)).filter(Boolean))
      const firstTarget = targetNodes[0] ?? {}
      const parentId = continuityNodeParentId(firstTarget)
      const siblingReferenceKeys = parentId
        ? [...graphNodeById.values()]
          .filter((node) => !requestedNodeIdSet.has(readText(node.id)))
          .filter((node) => readText(node.nodeKind) === readText(firstTarget.nodeKind))
          .filter((node) => continuityNodeUsesParent(node, parentId))
          .flatMap((node) => entityAssetKeys(asRecord(node.assetState ?? node.asset_state)))
          .filter(Boolean)
        : []
      const worldLocationRefId = readText(firstTarget.worldLocationRefId) || readText(firstTarget.baseLocationRefId)
      const targetWorldEntity = worldLocationRefId ? assetPackEntities.find((entity) => readText(entity.key) === worldLocationRefId) ?? null : null
      const worldReferenceKeys = targetWorldEntity ? entityAssetKeys(targetWorldEntity).slice(0, 2) : []
      return uniqueTexts([...siblingReferenceKeys, ...worldReferenceKeys]).slice(0, 8)
    }
    const continuityDependencies = shotContinuityDependencyNodes().map((rawTargetNode) => {
      const targetNode = applySceneGraphOverrideToNode(
        rawTargetNode,
        sceneGraphOverrideForNode(asRecord(masterRequest.metadata), readText(rawTargetNode.id)),
      )
      const targetNodeId = readText(targetNode.id)
      const referenceAssetKeys = referenceAssetKeysForTargets([targetNode])
      const relevantShots = relevantShotsForNodes([targetNode])
      const assetKind = readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset'
      const assetInputHash = sequenceAnimaticStableHash({
        targetNode,
        relevantShotIds: relevantShots.map((entry) => readText(entry.id)),
        referenceAssetKeys,
        manifestHash,
      })
      const referenceEntities = referenceAssetKeys.map((assetKey) => assetEntityForKey(assetKey, `${readText(targetNode.name) || targetNodeId} dependency`))
      return {
        targetNode,
        targetNodeId,
        assetKind,
        assetInputHash,
        assetState: {},
        parentNodeIds: visualDependencyEdges
          .filter((edge) => readText(edge.targetNodeId) === targetNodeId)
          .map((edge) => readText(edge.sourceNodeId))
          .filter(Boolean),
        referenceAssetKeys,
        relevantShots,
        shotBindings,
        assetPack: {
          ...assetPack,
          entities: [...assetPackEntities, ...referenceEntities],
          continuityReferenceAssetKeys: referenceAssetKeys,
        },
        globalAssetIdentity: `${targetNodeId}:${assetInputHash}`,
        dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
        dependencyWave: ['temporary_character', 'prop'].includes(assetKind) ? 3 : 1,
        referenceSelection: {
          selectedReferences: referenceAssetKeys.map((assetKey) => ({ assetKey, role: 'continuity_asset', reason: 'Selected scene-graph dependency reference.' })),
          omittedReferences: [],
        },
        visualBrief: {
          targetName: readText(targetNode.name) || targetNodeId,
          assetKind,
          summary: readText(targetNode.visualBrief) || readText(targetNode.summary),
        },
      }
    })
    const scopedRefs = scopedAssetPackForShot(assetPack, shot)
    const zoneCoverageRegistry = asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
    const zoneCoverageCellByShotId = asRecord(zoneCoverageRegistry.coverageCellByShotId ?? zoneCoverageRegistry.coverage_cell_by_shot_id)
    const zoneCoverageCell = asRecord(zoneCoverageCellByShotId[payload.shotId])
    const zoneCoverageAnchorScopeKey = readText(zoneCoverageCell.coverageAnchorScopeKey ?? zoneCoverageCell.coverage_anchor_scope_key)
    const zoneCoverageAnchorAssetKey = readText(zoneCoverageCell.assetKey ?? zoneCoverageCell.asset_key)
    const zoneCoverageBoardId = readText(zoneCoverageCell.boardId ?? zoneCoverageCell.board_id)
    const zoneCoverageAnchorSource = readText(zoneCoverageCell.coverageAnchorSource ?? zoneCoverageCell.coverage_anchor_source) || 'zone_camera_grid_cell'
    const zoneCoverageAnchorScope = readText(zoneCoverageCell.coverageAnchorScope ?? zoneCoverageCell.coverage_anchor_scope) || zoneCoverageAnchorSource
    const zoneCoverageRegistryRevision = Number(zoneCoverageRegistry.revision ?? 0) || 0
    const sourceReferenceHash = sequenceAnimaticVisualReferenceHash({
      shotId: payload.shotId,
      coverageSetupId,
      requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
      omittedReferenceAssetKeys: [],
    })
    const sourceShotHash = sequenceAnimaticStableHash({
      shotId: payload.shotId,
      shot,
      coverageSetupId,
      sceneGraphOverride: asRecord(coverageSetup.sceneGraphOverride ?? coverageSetup.scene_graph_override),
      coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
      sourceReferenceHash,
      coverageRegistryRevision: coverageRegistryNext.revision,
      zoneCoverageRegistryRevision,
      zoneCoverageAnchorScopeKey,
      zoneCoverageAnchorAssetKey,
      coverageDecision: coverageResolution.coverageDecision,
      graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
    })
    const fallbackCoverageAnchorScopeKey = coverageSetupId ? sequenceAnimaticStableHash({
      coverageSetupId,
      spatial: shotSpatialFingerprint(shot, coverageSetup),
      shotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
      subjectRefIds: shotEntityRefIds(shot),
      policy: 'shot_scoped_coverage_anchor_v1',
    }) : ''
    const coverageAnchorScopeKey = zoneCoverageAnchorScopeKey || fallbackCoverageAnchorScopeKey
    const coverageAnchorSource = zoneCoverageAnchorScopeKey ? zoneCoverageAnchorSource : 'per_shot_anchor'

    const existingResponse = await client
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .eq('metadata->>shotId', payload.shotId)
      .or('metadata->>screenplayAnimaticRole.eq.shot_production,metadata->>sequenceAnimaticRole.eq.shot_production')
      .or('metadata->>sequenceAnimaticStale.is.null,metadata->>sequenceAnimaticStale.neq.true')
      .order('created_at', { ascending: false })
      .limit(8)
    if (existingResponse.error) throw new Error(existingResponse.error.message)
    const activeChildren = (existingResponse.data ?? []).map(mapOutputRequestRow)
      .filter((child) => {
        const metadata = asRecord(child.metadata)
        return metadata.sequenceAnimaticStale !== true && readScreenplayAnimaticRole(metadata) === 'shot_production'
      })
    const matchingChild = activeChildren.find((child) => {
      const metadata = asRecord(child.metadata)
      return readText(metadata.dependencyMode) === SHOT_GRAPH_DEPENDENCY_MODE
        && readText(metadata.shotGraphPolicyVersion) === SHOT_GRAPH_POLICY_VERSION
        && readText(metadata.sourceShotHash) === sourceShotHash
        && Boolean(child.workflowId)
    }) ?? null
    let cacheStatus: 'reused' | 'created' | 'refreshed' = 'created'
    let child = matchingChild
    if (!payload.forceRefresh && child?.workflowId) {
      cacheStatus = 'reused'
    } else {
      const staleTargets = payload.forceRefresh ? activeChildren : activeChildren.filter((entry) => entry.id !== matchingChild?.id)
      if (staleTargets.length > 0) {
        const now = new Date().toISOString()
        for (const staleChild of staleTargets) {
          const metadata = asRecord(staleChild.metadata)
          const staleResponse = await admin
            .from('output_requests')
            .update({
              metadata: {
                ...metadata,
                sequenceAnimaticStale: true,
                staleReason: payload.forceRefresh
                  ? 'Shot production graph refresh requested.'
                  : 'Shot production graph source changed or policy was upgraded.',
                staleAt: now,
              },
            })
            .eq('id', staleChild.id)
          if (staleResponse.error) throw new Error(staleResponse.error.message)
        }
      }
      child = null
      cacheStatus = payload.forceRefresh ? 'refreshed' : 'created'
    }

    let nodes: ReturnType<typeof mapOutputWorkflowNodeRow>[] = []
    let edges: ReturnType<typeof mapOutputWorkflowEdgeRow>[] = []
    let workflow: ReturnType<typeof mapOutputWorkflowRow> | null = null
    if (!child) {
      const workflowId = crypto.randomUUID()
      const keyframeHash = sequenceAnimaticStableHash({
        shotId: payload.shotId,
        shot,
        coverageSetupId,
        sceneGraphOverride: asRecord(coverageSetup.sceneGraphOverride ?? coverageSetup.scene_graph_override),
        coverageAnchorScopeKey,
        coverageAnchorSource,
        manifestHash,
        directorPlanHash,
        sourceReferenceHash,
        graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
      })
      const commonConfig = {
        cinematicPipelineVersion: 'v3_script_storyboards',
        graphSpecVersion: sequenceAnimaticGraphSpecVersion,
        screenplayAnimaticRole: 'shot_production',
        screenplayAnimaticSource,
        sequenceAnimaticRole: 'shot_production',
        dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
        shotGraphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
        parentRequestId: masterRequest.id,
        masterRequestId: masterRequest.id,
        storyboardBlockId: readText(shot.storyboardBlockId ?? shot.blockId),
        shotId: payload.shotId,
        coverageSetupId,
        keyframeHash,
        sourceShotHash,
        manifestHash,
        directorPlanHash,
        masterManifestArtifactKey,
        requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
        omittedReferenceAssetKeys: [],
        sourceReferenceHash,
        coverageAnchorScopeKey,
        coverageAnchorSource,
        coverage_anchor_source: coverageAnchorSource,
        zoneCoverageBoardId: zoneCoverageBoardId || null,
        zoneCoverageCell: Object.keys(zoneCoverageCell).length > 0 ? zoneCoverageCell : null,
        zoneCoverageRegistryRevision,
        coverageAnchorShotIds: scopedCoverageShots.map((entry) => readText(entry.id)).filter(Boolean),
        coverageAnchorScope: zoneCoverageAnchorScopeKey ? zoneCoverageAnchorScope : scopedCoverageShots.length === coverageShots.length ? 'coverage_setup' : 'shot_scoped',
        coverageDecision: coverageResolution.coverageDecision,
        coverageDecisionReason: coverageResolution.coverageDecisionReason,
        coverageCompatibilityDiagnostics: coverageResolution.compatibilityDiagnostics,
        coverageRegistryRevision: coverageRegistryNext.revision,
        coverageSetupSource: coverageResolution.coverageSetupSource,
        requestedCoverageSetupId: requestedCoverageSetupId || null,
        dependencyWave: 5,
        continuityDependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
        missingContinuityNodeIds: [],
        referenceSelection: {
          selectedReferences: scopedRefs.selectedReferences,
          omittedReferences: [],
        },
        sharedDependencyRequests: [
          ...(coverageAnchorScopeKey ? [{
            role: 'coverage_anchor',
            identityKey: 'coverageAnchorScopeKey',
            identityValue: coverageAnchorScopeKey,
            coverageSetupId: coverageSetupId || null,
            coverageAnchorSource,
            status: 'graph_node',
          }] : []),
          ...scopedRefs.requiredReferenceAssetKeys.map((assetKey) => ({
            role: 'entity_reference',
            identityKey: 'assetKey',
            identityValue: assetKey,
            assetKey,
            status: 'ready',
          })),
        ],
        visualBrief: {
          title: readText(shot.title) || payload.shotId,
          action: readText(shot.action) || readText(shot.description),
          camera: asRecord(shot.camera),
          lighting: readText(shot.lighting),
        },
        shotReadySource,
        qcStatus: 'pending',
        qcFindings: [],
        sequenceUnitKey: masterRequest.selectedSequenceUnitKeys[0] ?? null,
        readyToRun: true,
        provisional: provisionalContext,
        sourceCoverageSetupId: coverageSetupId || null,
      }
      const graphPlan = buildSequenceAnimaticShotProductionWorkflowGraph({
        workflowId,
        draftId: payload.draftId,
        commonConfig: { ...commonConfig, sceneState, scene_state: sceneState },
        block,
        shot,
        panel: {},
        coverageAnchor: {},
        coverageSetup,
        coverageShots: scopedCoverageShots.length > 0 ? scopedCoverageShots : [shot],
        coverageReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
        previousKeyframe: {},
        assetPack: scopedRefs.assetPack,
        continuityDependencies,
        dependencyMode: SHOT_GRAPH_DEPENDENCY_MODE,
        requiredReferenceAssetKeys: scopedRefs.requiredReferenceAssetKeys,
        omittedReferenceAssetKeys: [],
        selectedReferences: scopedRefs.selectedReferences,
        omittedReferences: [],
        sharedDependencyRequests: readArray(commonConfig.sharedDependencyRequests).map(asRecord),
        editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shot.editorialDurationSeconds ?? 0) || 3)),
        providerDurationSeconds: Math.max(5, Math.min(15, Number(shot.providerDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 5)),
        aspectRatio,
      })
      const title = readText(shot.title) || `Shot ${readText(shot.index) || payload.shotId}`
      const ensureResponse = await admin.rpc('ensure_sequence_animatic_child_workflow', {
        p_project_id: payload.projectId,
        p_draft_id: payload.draftId,
        p_parent_request_id: masterRequest.id,
        p_role: 'shot_production',
        p_identity_key: 'shotId',
        p_identity_value: payload.shotId,
        p_workflow: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          key: `sequence_animatic_shot_production_${slugify(masterRequest.id)}_${slugify(payload.shotId)}_${slugify(SHOT_GRAPH_POLICY_VERSION)}_${keyframeHash.slice(0, 8)}`,
          name: `${masterRequest.title} / ${title} Production`,
          description: 'Sequence animatic graph-native shot production workflow.',
          preset: 'cinematic_episode_from_sequence',
          status: 'active',
          created_by: user.id,
          metadata: commonConfig,
        },
        p_nodes: graphPlan.nodes,
        p_edges: graphPlan.edges,
        p_request: {
          project_id: payload.projectId,
          draft_id: payload.draftId,
          parent_request_id: masterRequest.id,
          requested_by: user.id,
          source_surface: screenplayAnimaticSource === 'prompt_cinematic' ? 'outputs' : 'wiki_sequence_unit',
          prompt: `Prepare shot production graph for ${title}.`,
          title: `${masterRequest.title} / ${title} Production`,
          intent: 'output_generation',
          output_kind: 'cinematic_episode',
          status: 'awaiting_confirmation',
          selected_entity_keys: masterRequest.selectedEntityKeys,
          selected_sequence_unit_keys: masterRequest.selectedSequenceUnitKeys,
          page_count: null,
          target_format: 'video',
          planner_notes: 'Shot production graph prepared from direct shot, coverage, continuity, and scoped reference data.',
          metadata: { ...commonConfig, shot, createdFromManifestAt: new Date().toISOString() },
        },
      })
      if (ensureResponse.error || !ensureResponse.data) throw new Error(ensureResponse.error?.message ?? 'Failed to ensure shot production workflow.')
      const ensured = asRecord(ensureResponse.data)
      child = mapOutputRequestRow(asRecord(ensured.request) as never)
      workflow = mapOutputWorkflowRow(asRecord(ensured.workflow) as never)
      nodes = readArray(ensured.nodes).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = readArray(ensured.edges).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
    }

    if (!child?.workflowId) throw new HttpError(409, 'Shot production graph is not ready yet.')
    if (!workflow) {
      const workflowResponse = await client
        .from('output_workflows')
        .select('*')
        .eq('id', child.workflowId)
        .maybeSingle()
      if (workflowResponse.error) throw new Error(workflowResponse.error.message)
      workflow = workflowResponse.data ? mapOutputWorkflowRow(asRecord(workflowResponse.data) as never) : null
    }
    if (nodes.length === 0 || edges.length === 0) {
      const nodeResponse = await client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', child.workflowId)
      if (nodeResponse.error) throw new Error(nodeResponse.error.message)
      const edgeResponse = await client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', child.workflowId)
      if (edgeResponse.error) throw new Error(edgeResponse.error.message)
      nodes = (nodeResponse.data ?? []).map((row) => mapOutputWorkflowNodeRow(asRecord(row) as never))
      edges = (edgeResponse.data ?? []).map((row) => mapOutputWorkflowEdgeRow(asRecord(row) as never))
    }

    return json(sequenceAnimaticShotProductionGraphEnsureResponseSchema.parse({
      ok: true,
      masterRequest,
      shotRequest: child,
      workflow,
      nodes,
      edges,
      cacheStatus,
      shotId: payload.shotId,
      coverageSetupId: coverageSetupId || null,
      dependencyNodeIds: continuityDependencies.map((entry) => readText(entry.targetNodeId)).filter(Boolean),
      graphPolicyVersion: SHOT_GRAPH_POLICY_VERSION,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to ensure sequence animatic shot production graph.')
  }
})
