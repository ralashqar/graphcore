import { shotReferenceNodeIds } from '../../../src/domain/sequenceAnimaticContinuityDependencies.ts'
import {
  asRecord,
  coverageSetupEntityRefIds,
  readArray,
  readStringArray,
  readText,
  shotEntityRefIds,
  slugify,
  uniqueTexts,
} from './sequence-animatic-command-utils.ts'
import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'

export const COVERAGE_REGISTRY_VERSION = 'per_shot_coverage_registry_v1'

export function normalizeReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function shotSpatialFingerprint(shot: Record<string, unknown>, coverageSetup: Record<string, unknown>) {
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

export function sceneIdForShot(shot: Record<string, unknown>) {
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

export function coverageSpatialFields(shot: Record<string, unknown>, fallbackSetup: Record<string, unknown> = {}) {
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

export function coverageCameraFields(shot: Record<string, unknown>, fallbackSetup: Record<string, unknown> = {}) {
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

export function normalizedCameraClass(value: string) {
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

function coverageSetupSubjectIds(setup: Record<string, unknown>) {
  return uniqueTexts([
    ...coverageSetupEntityRefIds(setup),
    ...readStringArray(setup.characterRefIds ?? setup.character_ref_ids),
    ...readStringArray(setup.itemRefIds ?? setup.item_ref_ids),
    ...readStringArray(setup.propRefIds ?? setup.prop_ref_ids),
  ])
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

export function coverageSetupScopeIssues(shot: Record<string, unknown>, setup: Record<string, unknown>) {
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

export function coverageRegistryFromSources(input: {
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

export function resolveCoverageSetupForShot(input: {
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

export function applyCoverageResolutionToRegistry(input: {
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

export function graphNodeMapForShot(nodes: readonly Record<string, unknown>[], shot: Record<string, unknown>) {
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

export function scopedCoverageShotsForShot(input: {
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

export function incidentalCharacterNodesForShot(input: {
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
  if (!normalizeReferenceText(text)) return []
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
