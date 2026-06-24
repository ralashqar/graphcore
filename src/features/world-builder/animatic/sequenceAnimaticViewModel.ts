import { buildCinematicV2TimelineProjection } from '../../../domain/cinematicTimelineProjection'
import { resolveAssetSourceUrl } from '../../../domain/assets'
import type { AssetDefinition } from '../../../domain/graphcore'
import { readEntityReferenceSheetAssetKey } from '../../../domain/initialSeedReferenceSheets'
import type {
  OutputArtifact,
  OutputRequest,
  OutputWorkflowNode,
  OutputWorkflowRun,
  SequenceAnimaticStateResponse,
} from '../../../domain/outputWorkflow'
import {
  durableWorkflowAssetKey,
  durableWorkflowTextOutput,
  resolveDurableWorkflowNodeOutput,
} from '../../../domain/outputWorkflowDurableResolver'
import { spotCameraGridNodeId } from '../../../domain/sequenceAnimaticContinuityDependencies'
import type { WorldEntity } from '../../../domain/worldGraph'
import { iconForWorldEntity } from '../../../domain/worldGraphHelpers'
import {
  sceneContinuityManifestForShot,
  sceneContinuityManifestSchema,
  shotReadinessFromManifest,
  type SceneContinuityManifest,
} from '../../../domain/sceneContinuityManifest'
import type { EntityIconId } from '../../../shared/entityIcons'
import { sequenceAnimaticFriendlyProgressLabel } from '../sequenceAnimaticViewModel'
import { buildSequenceAnimaticArtifactIndexes } from './sequenceAnimaticArtifactIndexes'
import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'
import {
  buildSequenceAnimaticContinuityAnchorViews,
  buildSequenceAnimaticContinuityGraphView,
  buildSequenceAnimaticSpatialBindingView,
  sequenceAnimaticContinuityAssetActionLabel,
  sequenceAnimaticContinuityAssetStatusLabel,
  type SequenceAnimaticContinuityAssetTargetView,
  type SequenceAnimaticContinuityAnchorView,
  type SequenceAnimaticContinuityGraphView,
  type SequenceAnimaticContinuityLocationView,
  type SequenceAnimaticSpatialBindingView,
} from './sequenceAnimaticContinuityIndexes'
import {
  buildSequenceAnimaticCoverageIndexes,
  type SequenceAnimaticCoverageAnchorView,
  type SequenceAnimaticCoverageIntentView,
  type SequenceAnimaticZoneCoverageBoardView,
  type SequenceAnimaticZoneCoverageCellView,
} from './sequenceAnimaticCoverageIndexes'
import {
  isOutputRunStepActive,
  outputRunStepAssetKey,
  outputRunStepForNode,
  outputRunStepTextOutput,
  outputWorkflowNodeAssetKey,
  outputWorkflowNodeForKey,
  outputWorkflowNodeTextOutput,
  sequenceAnimaticShotKeyframeProgressLabel,
  sequenceAnimaticShotProgressPreview,
  sequenceAnimaticShotVideoProgressLabel,
  sequenceAnimaticVideoProgressLabel,
  statusLabelForOutputRunStep,
  summarizeOutputStatus,
} from './sequenceAnimaticProgressPresentation'
import { buildSequenceAnimaticRuntimeIndexes } from './sequenceAnimaticRuntimeIndexes'
import {
  buildSequenceAnimaticWorkStatus,
  sequenceAnimaticWorkStatusToContinuityAssetStatus,
} from './sequenceAnimaticWorkStatus'
import {
  FAILED_SEQUENCE_ANIMATIC_STATUSES,
  artifactBelongsToRequest,
  outputWorkflowRunHasFailedExecution,
  sequenceAnimaticProjectionActiveLabel,
  sequenceAnimaticProjectionActiveNodeKey,
  sequenceAnimaticProjectionForRequest,
  sequenceAnimaticEffectiveStatus,
  sequenceAnimaticRequestIsActive,
  sequenceAnimaticStateForRequest,
} from './sequenceAnimaticRuntimePresentation'
import {
  buildSequenceAnimaticSceneViews,
  sequenceAnimaticSceneIdForShot,
  type SequenceAnimaticSceneView,
} from './sequenceAnimaticSceneIndexes'
function readNonEmptyLooseRecord(value: unknown): Record<string, unknown> | null {
  const record = readLooseRecord(value)
  return Object.keys(record).length > 0 ? record : null
}

function readFirstOutputRunRecord(run: OutputWorkflowRun | null | undefined, keys: string[]) {
  for (const step of run?.steps ?? []) {
    const outputs = readLooseRecord(step.outputs)
    for (const key of keys) {
      const record = readNonEmptyLooseRecord(outputs[key])
      if (record) return record
    }
  }
  return null
}

function readAllOutputRunRecords(run: OutputWorkflowRun | null | undefined, keys: string[]) {
  const records: Record<string, unknown>[] = []
  for (const step of run?.steps ?? []) {
    const outputs = readLooseRecord(step.outputs)
    for (const key of keys) {
      const value = outputs[key]
      if (Array.isArray(value)) {
        records.push(...value.map(readLooseRecord).filter((entry) => Object.keys(entry).length > 0))
        continue
      }
      const record = readNonEmptyLooseRecord(value)
      if (record) records.push(record)
    }
  }
  return records
}

function readArtifactRole(artifact: OutputArtifact) {
  return trimOptionalString(readLooseRecord(artifact.metadata).role)
}

function outputArtifactUpdatedAtMs(artifact: OutputArtifact) {
  const timestamp = Date.parse(artifact.updatedAt || artifact.createdAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function readArtifactMetadataRecord(
  artifacts: readonly OutputArtifact[],
  roles: string[],
  keys: string[],
) {
  const roleSet = new Set(roles)
  for (const artifact of artifacts) {
    if (!roleSet.has(readArtifactRole(artifact))) continue
    const metadata = readLooseRecord(artifact.metadata)
    for (const key of keys) {
      const record = readNonEmptyLooseRecord(metadata[key])
      if (record) return record
    }
  }
  return null
}

function readArtifactMediaRecords(artifacts: readonly OutputArtifact[], roles: string[]) {
  const roleSet = new Set(roles)
  return artifacts
    .filter((artifact) => roleSet.has(readArtifactRole(artifact)))
    .map((artifact) => {
      const metadata = readLooseRecord(artifact.metadata)
      return {
        id: artifact.id,
        artifactKey: artifact.key,
        assetKey: artifact.assetKey,
        mimeType: artifact.mimeType,
        role: readArtifactRole(artifact),
        shotId: trimOptionalString(metadata.shotId),
        shotIndex: metadata.shotIndex,
        storyboardGroupId: trimOptionalString(metadata.storyboardGroupId),
        panelIndexInGroup: metadata.panelIndexInGroup,
        sourceSheetAssetKey: trimOptionalString(metadata.sourceSheetAssetKey),
        storagePath: trimOptionalString(metadata.storagePath),
        previewUrl: trimOptionalString(metadata.previewUrl),
        sourceUrl: trimOptionalString(metadata.sourceUrl),
        url: trimOptionalString(metadata.sourceUrl) || trimOptionalString(metadata.previewUrl),
        cropRect: metadata.cropRect ?? metadata.crop,
        metadata,
      } as Record<string, unknown>
    })
}

function resolveSequenceAnimaticMediaUrl(media: Record<string, unknown> | null | undefined, assetByKey: ReadonlyMap<string, AssetDefinition>) {
  const assetKey = trimOptionalString(media?.assetKey)
  const assetUrl = assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : null
  return assetUrl || trimOptionalString(media?.url) || trimOptionalString(media?.sourceUrl) || trimOptionalString(media?.previewUrl) || null
}

function sequenceAnimaticAssetKeysFromRecord(record: Record<string, unknown>) {
  const metadata = readLooseRecord(record.metadata)
  return [...new Set([
    trimOptionalString(record.assetKey),
    trimOptionalString(record.asset_key),
    trimOptionalString(record.primaryAssetKey),
    trimOptionalString(record.primary_asset_key),
    trimOptionalString(record.selectedReferenceAssetKey),
    trimOptionalString(record.selected_reference_asset_key),
    trimOptionalString(record.selectedReferenceVariantAssetKey),
    trimOptionalString(record.selected_reference_variant_asset_key),
    trimOptionalString(metadata.referenceSheetAssetKey),
    trimOptionalString(metadata.reference_sheet_asset_key),
    ...readLooseArray(record.assetKeys).map(trimOptionalString),
    ...readLooseArray(record.asset_keys).map(trimOptionalString),
  ].filter(Boolean))]
}

function hydrateSequenceAnimaticAssetPackUrls(
  assetPack: Record<string, unknown>,
  assetByKey: ReadonlyMap<string, AssetDefinition>,
) {
  const hydrateRecord = (value: unknown) => {
    const record = readLooseRecord(value)
    if (Object.keys(record).length === 0) return record
    const assetKeyUrl = sequenceAnimaticAssetKeysFromRecord(record)
      .map((assetKey) => resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null))
      .find((url): url is string => Boolean(url)) || ''
    const existingUrl = trimOptionalString(record.assetUrl)
      || trimOptionalString(record.asset_url)
      || trimOptionalString(record.imageUrl)
      || trimOptionalString(record.image_url)
      || trimOptionalString(record.referenceArtUrl)
      || trimOptionalString(record.reference_art_url)
      || trimOptionalString(record.iconUrl)
      || trimOptionalString(record.icon_url)
      || trimOptionalString(record.url)
    const assetUrl = assetKeyUrl || existingUrl
    return assetUrl
      ? {
          ...record,
          assetUrl,
          asset_url: assetUrl,
          imageUrl: assetUrl,
          image_url: assetUrl,
          referenceArtUrl: assetUrl,
          reference_art_url: assetUrl,
          iconUrl: assetUrl,
          icon_url: assetUrl,
        }
      : record
  }
  return {
    ...assetPack,
    entities: readLooseArray(assetPack.entities).map(hydrateRecord),
    referenceImages: readLooseArray(assetPack.referenceImages).map(hydrateRecord),
    reference_images: readLooseArray(assetPack.reference_images).map(hydrateRecord),
  }
}

function sequenceAnimaticWorldEntityAssetPackRecords(input: {
  worldEntities: readonly WorldEntity[]
  assetByKey: ReadonlyMap<string, AssetDefinition>
  imageUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetIconUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetUrlByEntityKey: ReadonlyMap<string, string | null>
}) {
  return input.worldEntities.flatMap((entity) => {
    const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
    const assetKey = referenceSheetAssetKey || entity.thumbnailAssetKey || ''
    if (!assetKey) return []
    const assetUrl = input.referenceSheetUrlByEntityKey.get(entity.key)
      ?? input.imageUrlByEntityKey.get(entity.key)
      ?? resolveAssetSourceUrl(input.assetByKey.get(assetKey) ?? null)
      ?? ''
    const iconUrl = input.referenceSheetIconUrlByEntityKey.get(entity.key)
      ?? input.imageUrlByEntityKey.get(entity.key)
      ?? assetUrl
    return [{
      key: entity.key,
      id: entity.key,
      name: entity.name,
      type: entity.nodeType,
      nodeType: entity.nodeType,
      node_type: entity.nodeType,
      role: entity.nodeType === 'object' ? 'item_or_prop_reference' : entity.nodeType === 'group' ? 'faction_group_reference' : 'world_character_reference',
      primaryAssetKey: assetKey,
      primary_asset_key: assetKey,
      selectedReferenceAssetKey: assetKey,
      selected_reference_asset_key: assetKey,
      assetKeys: [assetKey],
      asset_keys: [assetKey],
      assetUrl,
      asset_url: assetUrl,
      imageUrl: assetUrl,
      image_url: assetUrl,
      referenceArtUrl: assetUrl,
      reference_art_url: assetUrl,
      iconUrl: iconUrl || assetUrl,
      icon_url: iconUrl || assetUrl,
      visualDescription: trimOptionalString(entity.metadata.visualDescription)
        || trimOptionalString(readLooseRecord(readLooseRecord(entity.metadata).visual).description)
        || entity.summary,
    } as Record<string, unknown>]
  })
}

function mergeSequenceAnimaticAssetPackWithWorldRefs(
  assetPack: Record<string, unknown>,
  worldReferenceEntities: readonly Record<string, unknown>[],
) {
  const entities = readLooseArray(assetPack.entities).map(readLooseRecord)
  const seen = new Set(entities.map((entity) => trimOptionalString(entity.key) || trimOptionalString(entity.id)).filter(Boolean))
  return {
    ...assetPack,
    entities: [
      ...entities,
      ...worldReferenceEntities.filter((entity) => {
        const key = trimOptionalString(entity.key) || trimOptionalString(entity.id)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      }),
    ],
  }
}

export type SequenceAnimaticShotView = {
  id: string
  index: number
  title: string
  isProvisional: boolean
  sourceScriptShotIds: string[]
  timeLabel: string
  durationLabel: string
  action: string
  dialogue: SequenceAnimaticDialogueLineView[]
  camera: string
  lighting: string
  performance: string
  performanceBeats: SequenceAnimaticPerformanceBeatView[]
  coverageSetupLabel: string
  coverageSetupDetail: string
  coverageSetupId: string
  coverageIntent: SequenceAnimaticCoverageIntentView | null
  coverageIntentRunning: boolean
  coverageIntentFailed: boolean
  zoneCoverageCell: SequenceAnimaticZoneCoverageCellView | null
  zoneCoverageCellRunning: boolean
  zoneCoverageCellActiveStage: 'queued' | 'image' | 'extract' | ''
  zoneCoverageCellFailed: boolean
  spatialContinuityLabel: string
  spatialContinuityDetail: string
  spatialBindingView: SequenceAnimaticSpatialBindingView
  panelStatusLabel: string
  panelError: string
  panelAssetKey: string | null
  panelUrl: string | null
  panelRunning: boolean
  keyframeStatusLabel: string
  keyframeDependencyStatusLabel: string
  keyframeProgressLabel: string
  keyframeDependencyRunning: boolean
  keyframeDependencyMissingCount: number
  keyframeRequestId: string | null
  keyframeWorkflowId: string | null
  keyframeDependencyMode: string
  keyframeGraphPolicyVersion: string
  keyframeRunning: boolean
  keyframeError: string
  isRevised: boolean
  originalAction: string
  originalCamera: string
  originalLighting: string
  revisionRequestId: string | null
  revisionWorkflowId: string | null
  revisionRunId: string | null
  revisionRunning: boolean
  revisionError: string
  revisionPrompt: string
  revisionSummary: string
  references: SequenceAnimaticReferenceView[]
  continuityAnchorsPending: boolean
  shotVideoRequestId: string | null
  shotVideoWorkflowId: string | null
  shotVideoRunId: string | null
  shotVideoReady: boolean
  shotVideoRunning: boolean
  shotVideoUrl: string | null
  shotVideoProgressLabel: string
  shotVideoError: string
}

export function sequenceAnimaticShotCanGenerateEarlyKeyframe(shot: SequenceAnimaticShotView) {
  if (!shot.isProvisional || !shot.id) return false
  if (shot.panelAssetKey || shot.panelUrl || shot.keyframeStatusLabel === 'Storyboard keyframe ready') return true
  if (shot.coverageSetupId) return true
  if (shot.spatialBindingView.hierarchy.length > 0) return true
  return Boolean(shot.spatialContinuityLabel && shot.spatialContinuityLabel !== 'Spatial binding pending')
}

export type SequenceAnimaticReferenceView = {
  entityKey: string
  name: string
  role: string
  iconId: EntityIconId
  assetKey?: string | null
  iconUrl: string | null
  referenceArtUrl?: string | null
  isContinuityAnchor?: boolean
  continuityAnchorType?: 'prop' | 'location_spot' | 'character'
  statusLabel?: string
}

export type SequenceAnimaticContinuityRejectedView = {
  name: string
  reason: string
  evidence: string
}

function sceneContinuityManifestsFromArtifacts(artifacts: readonly OutputArtifact[]) {
  return artifacts
    .map((artifact) => {
      const metadata = readLooseRecord(artifact.metadata)
      const parsed = sceneContinuityManifestSchema.safeParse(readLooseRecord(metadata.sceneContinuityManifest ?? metadata.scene_continuity_manifest))
      return parsed.success ? parsed.data : null
    })
    .filter((manifest): manifest is SceneContinuityManifest => Boolean(manifest))
}

function sceneContinuityReadinessForShot(input: {
  manifests: readonly SceneContinuityManifest[]
  shot: Record<string, unknown>
  shotId: string
}) {
  const sceneId = trimOptionalString(input.shot.sourceSceneId ?? input.shot.source_scene_id ?? input.shot.sceneId ?? input.shot.scene_id)
  const manifest = sceneContinuityManifestForShot(input.manifests, { shotId: input.shotId, sceneId })
  return {
    manifest,
    readiness: shotReadinessFromManifest(manifest, input.shotId),
  }
}

function sceneContinuityReadinessLabel(input: ReturnType<typeof sceneContinuityReadinessForShot>) {
  if (!input.manifest) return 'Prepare Scene Board refs'
  if (input.manifest.status !== 'ready') return 'Scene continuity prep pending'
  if (!input.readiness) return 'Prepare Scene Board refs'
  if (input.readiness.status === 'ready' || input.readiness.status === 'keyframe_ready') return ''
  return 'Scene continuity refs pending'
}

export type SequenceAnimaticDialogueLineView = {
  id: string
  text: string
  emotion: string
  delivery: string
  subtext: string
  speakerRefId: string
  speakerName: string
  speakerIconId: EntityIconId
  speakerIconUrl: string | null
  speakerReferenceArtUrl: string | null
}

export type SequenceAnimaticPerformanceBeatView = {
  id: string
  characterRefId: string
  characterName: string
  characterIconId: EntityIconId
  characterIconUrl: string | null
  characterReferenceArtUrl: string | null
  emotion: string
  toneLabel: string
  valenceLabel: string
  arousalLabel: string
  confidenceLabel: string
  dominanceLabel: string
  bodyLanguage: string
  facialExpression: string
  gaze: string
  gesture: string
  voiceEnergy: string
}

export type SequenceAnimaticBlockView = {
  id: string
  index: number
  title: string
  isProvisional: boolean
  plannedShotIds: string[]
  durationLabel: string
  statusLabel: string
  shotRangeLabel: string
  childRequestId: string | null
  childWorkflowId: string | null
  childRunId: string | null
  readyToRun: boolean
  promptNodeKey: string
  sheetNodeKey: string
  panelExtractNodeKey: string
  videoPromptNodeKey: string
  videoNodeKey: string
  failedNodeLabel: string
  hasPanels: boolean
  storyboardReady: boolean
  storyboardRunning: boolean
  storyboardProgressLabel: string
  storyboardContinuityMode: string
  storyboardContinuityLabel: string
  storyboardContinuityBlockers: string[]
  storyboardContinuityStale: boolean
  videoPromptReady: boolean
  videoReady: boolean
  videoRunning: boolean
  videoAssetKey: string | null
  videoUrl: string | null
  videoProgressLabel: string
  videoError: string
  continuityAnchors: SequenceAnimaticContinuityAnchorView[]
  continuityAnchorCountLabel: string
  continuityAnchorsPending: boolean
  continuityChanged: boolean
  continuityBlockStatus: 'not_started' | 'seeded' | 'deriving' | 'ready' | 'needs_review' | 'failed' | 'stale'
  continuityBlockStatusLabel: string
  continuityBlockActionLabel: string
  continuityBlockWarnings: string[]
  continuityBlockError: string
  continuityAssetTargets: SequenceAnimaticContinuityAssetTargetView[]
  continuityAssetCountLabel: string
  shots: SequenceAnimaticShotView[]
}

export type SequenceAnimaticViewModel = {
  request: OutputRequest
  assetPack: Record<string, unknown>
  scenes: SequenceAnimaticSceneView[]
  continuityRequest: OutputRequest | null
  continuityRun: OutputWorkflowRun | null
  continuityReady: boolean
  continuityRunning: boolean
  continuityStale: boolean
  continuityFailed: boolean
  continuityError: string
  continuityButtonLabel: string
  continuityStatusLabel: string
  continuityGraphStatus: 'empty' | 'partial' | 'ready' | 'stale' | 'failed'
  continuityStructureActionLabel: string
  continuityStructureStatusLabel: string
  continuityCoverageLabel: string
  continuityStructureRunning: boolean
  continuityAssetGenerationStatus: 'none' | 'partial' | 'ready' | 'stale' | 'failed'
  continuityAssetTargets: SequenceAnimaticContinuityAssetTargetView[]
  continuityGraphView: SequenceAnimaticContinuityGraphView
  title: string
  statusLabel: string
  progressLabel: string
  currentStepLabel: string
  directorPlanReady: boolean
  directorPlanStatusLabel: string
  directorPlanShotCount: number
  orchestrationStatusLabel: string
  screenplayMarkdown: string
  continuityAnchors: {
    characters: SequenceAnimaticContinuityAnchorView[]
    props: SequenceAnimaticContinuityAnchorView[]
    locationSpots: SequenceAnimaticContinuityAnchorView[]
  }
  coverageAnchors: SequenceAnimaticCoverageAnchorView[]
  zoneCoverageBoards: SequenceAnimaticZoneCoverageBoardView[]
  zoneCoverageCellByShotId: ReadonlyMap<string, SequenceAnimaticZoneCoverageCellView>
  zoneCoverageActiveShotIds: ReadonlySet<string>
  zoneCoverageFailedShotIds: ReadonlySet<string>
  coverageIntentByShotId: ReadonlyMap<string, SequenceAnimaticCoverageIntentView>
  coverageIntentActiveShotIds: ReadonlySet<string>
  coverageIntentFailedShotIds: ReadonlySet<string>
  continuityLocationSets: SequenceAnimaticContinuityLocationView[]
  continuityLocationAngles: SequenceAnimaticContinuityLocationView[]
  continuityRejectedCandidates: SequenceAnimaticContinuityRejectedView[]
  blocks: SequenceAnimaticBlockView[]
  hasPanels: boolean
  keyframeReadyCount: number
  keyframeTotalCount: number
  keyframeRunning: boolean
  keyframeProgressLabel: string
}

export type SequenceAnimaticVideoPreview = {
  title: string
  url: string
  durationLabel: string
  statusLabel: string
}

function formatAnimaticSeconds(value: unknown) {
  const seconds = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${Number(seconds.toFixed(1))}s`
}

function formatAnimaticTimecode(value: unknown) {
  const seconds = Math.max(0, Math.round(typeof value === 'number' ? value : Number(value) || 0))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatAnimaticTimeRange(start: unknown, end: unknown) {
  return `${formatAnimaticTimecode(start)}-${formatAnimaticTimecode(end)}`
}

function formatAnimaticPerformanceNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number.toFixed(2).replace(/\.?0+$/, '') : '0'
}

function animaticPerformanceToneLabel(valence: unknown, arousal: unknown) {
  const valenceNumber = typeof valence === 'number' ? valence : Number(valence)
  const arousalNumber = typeof arousal === 'number' ? arousal : Number(arousal)
  const valenceLabel = valenceNumber < -0.25 ? 'low valence' : valenceNumber > 0.25 ? 'high valence' : 'neutral valence'
  const arousalLabel = arousalNumber > 0.66 ? 'high arousal' : arousalNumber < 0.33 ? 'low arousal' : 'medium arousal'
  return `${valenceLabel}, ${arousalLabel}`
}

function sequenceAnimaticRelevantWorkflowSteps(run: OutputWorkflowRun | null | undefined) {
  const steps = (run?.steps ?? []).slice().sort((left, right) => {
    const leftOrder = Number(left.orderIndex ?? 0) || 0
    const rightOrder = Number(right.orderIndex ?? 0) || 0
    return leftOrder - rightOrder || left.updatedAt.localeCompare(right.updatedAt)
  })
  const runningSteps = steps.filter((step) => step.status === 'running')
  if (runningSteps.length > 0) return runningSteps
  const runFailed = run?.status === 'failed' || run?.status === 'cancelled'
  if (runFailed) return steps.filter((step) => step.status === 'failed')
  const firstQueued = steps.find((step) => step.status === 'queued') ?? null
  if (!firstQueued) return []
  const queuedOrder = Number(firstQueued.orderIndex ?? 0) || 0
  return steps.filter((step) => step.status === 'queued' && (Number(step.orderIndex ?? 0) || 0) === queuedOrder)
}

export function sequenceAnimaticWorkflowStepChips(input: {
  run: OutputWorkflowRun | null | undefined
  fallbackLabels?: readonly string[]
}) {
  const selectedSteps = sequenceAnimaticRelevantWorkflowSteps(input.run)
  const seen = new Set<string>()
  const chips = selectedSteps.flatMap((step) => {
    const label = trimOptionalString(step.label) || trimOptionalString(step.nodeKey) || summarizeOutputStatus(step.status)
    const key = `${step.nodeKey}:${step.status}:${label}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      key,
      label,
      status: step.status,
    }]
  }).slice(0, 4)
  if (chips.length > 0) return chips
  return (input.fallbackLabels ?? []).flatMap((label, index) => {
    if (index > 0) return []
    const cleanLabel = trimOptionalString(label)
    return cleanLabel ? [{
      key: `fallback:${index}:${cleanLabel}`,
      label: cleanLabel,
      status: 'running',
    }] : []
  }).slice(0, 4)
}
function normalizeStoryboardGroupNodeKey(groupId: string, suffix: 'prompt' | 'sheet' | 'panel_extract' | 'video_prompt' | 'video') {
  return groupId.endsWith(`_${suffix}`) ? groupId : `${groupId}_${suffix}`
}

export function sequenceAnimaticShotPreviewEyebrow(shot: SequenceAnimaticShotView) {
  if (shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready' || shot.keyframeStatusLabel === 'Storyboard keyframe ready') return 'Animatic keyframe'
  if (shot.zoneCoverageCell?.assetKey && shot.panelAssetKey === shot.zoneCoverageCell.assetKey) return 'Coverage grid cell'
  if (shot.coverageSetupId && shot.panelAssetKey) return 'Coverage preview'
  if (shot.panelAssetKey) return 'Continuity preview'
  return 'Animatic preview'
}

function cameraLineFromShot(shot: Record<string, unknown>) {
  const camera = readLooseRecord(shot.camera)
  return [
    trimOptionalString(camera.framing),
    trimOptionalString(camera.angle),
    trimOptionalString(camera.lens),
    trimOptionalString(camera.movement),
  ].filter(Boolean).join(' / ')
}

function normalizeSequenceAnimaticSpatialText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function sequenceAnimaticSpatialTextHasPhysicalCue(value: string) {
  const normalized = ` ${normalizeSequenceAnimaticSpatialText(value).replace(/_/g, ' ')} `
  return /\b(row|lane|street|city|station|clock|face|pipe|rail|catwalk|walkway|chamber|room|corridor|passage|gap|hatch|ledge|platform|shaft|wall|door|gate|workshop|bay|bench|tunnel|engine|basin|bridge|stair|dock|harbor|drain|crate|lamp|lantern)\b/.test(normalized)
}

function sequenceAnimaticSpatialTextContainsWorldCharacter(value: string, worldEntities: readonly WorldEntity[]) {
  const normalized = normalizeSequenceAnimaticSpatialText(value)
  if (!normalized) return false
  return worldEntities.some((entity) => {
    const type = normalizeSequenceAnimaticSpatialText(entity.nodeType)
    if (!/\b(actor|character|person|creature|cast)\b/.test(type.replace(/_/g, ' '))) return false
    const names = [entity.key, entity.name, ...entity.aliases].map(normalizeSequenceAnimaticSpatialText).filter((entry) => entry.length >= 3)
    return names.some((name) => normalized === name || normalized.includes(`_${name}_`) || normalized.startsWith(`${name}_`) || normalized.endsWith(`_${name}`))
  })
}

function sequenceAnimaticSpatialEntryLooksCharacterDerived(entry: SequenceAnimaticContinuityLocationView, worldEntities: readonly WorldEntity[]) {
  const text = [entry.id, entry.name].filter(Boolean).join(' ')
  return sequenceAnimaticSpatialTextContainsWorldCharacter(text, worldEntities)
    && !sequenceAnimaticSpatialTextHasPhysicalCue(text)
}

function sequenceAnimaticSpatialBindingLooksShotDerived(refId: string, shot: Record<string, unknown>) {
  const normalizedRef = normalizeSequenceAnimaticSpatialText(refId)
  const title = trimOptionalString(shot.title)
  if (title) {
    const normalizedTitle = normalizeSequenceAnimaticSpatialText(title)
    if (normalizedTitle.length >= 8 && normalizedRef.includes(normalizedTitle) && !sequenceAnimaticSpatialTextHasPhysicalCue(title)) return true
  }
  const action = trimOptionalString(shot.action) || trimOptionalString(shot.description)
  if (action) {
    const actionWords = normalizeSequenceAnimaticSpatialText(action)
      .split('_')
      .filter((word) => word.length >= 4 && !['with', 'from', 'then', 'that', 'this', 'into', 'over', 'under', 'before', 'after'].includes(word))
      .slice(0, 5)
    const actionLike = actionWords.length >= 3 && actionWords.every((word) => normalizedRef.includes(word))
    if (actionLike && !sequenceAnimaticSpatialTextHasPhysicalCue(actionWords.join(' '))) return true
  }
  return false
}

function sequenceAnimaticShotBindingLabels(binding: Record<string, unknown>, shot: Record<string, unknown>) {
  const sceneBinding = readLooseRecord(shot.sceneBinding ?? shot.scene_binding)
  const setId = trimOptionalString(binding.setId) || trimOptionalString(sceneBinding.setId ?? sceneBinding.set_id) || trimOptionalString(shot.continuitySetId)
  const zoneId = trimOptionalString(binding.zoneId) || trimOptionalString(sceneBinding.zoneId ?? sceneBinding.zone_id) || trimOptionalString(shot.continuityZoneId)
  const primarySpotId = trimOptionalString(binding.primarySpotId) || trimOptionalString(sceneBinding.primarySpotId ?? sceneBinding.primary_spot_id)
  const viewpointId = trimOptionalString(binding.viewpointId) || trimOptionalString(sceneBinding.viewpointId ?? sceneBinding.viewpoint_id)
  const angleId = viewpointId || trimOptionalString(binding.angleId) || trimOptionalString(sceneBinding.angleId ?? sceneBinding.angle_id) || trimOptionalString(shot.continuityAngleId)
  const suspectZone = zoneId ? sequenceAnimaticSpatialBindingLooksShotDerived(zoneId, shot) : false
  const suspectAngle = angleId ? sequenceAnimaticSpatialBindingLooksShotDerived(angleId, shot) || suspectZone : false
  const spotIds = [
    ...readLooseArray(binding.spotIds),
    ...readLooseArray(sceneBinding.spotIds ?? sceneBinding.spot_ids),
    primarySpotId,
  ]
    .map(trimOptionalString)
    .filter((spotId) => spotId && !sequenceAnimaticSpatialBindingLooksShotDerived(spotId, shot) && !suspectZone)
    .filter((spotId, index, values) => values.indexOf(spotId) === index)
  const worldLocationRefId = trimOptionalString(binding.worldLocationRefId)
    || trimOptionalString(sceneBinding.worldLocationRefId ?? sceneBinding.world_location_ref_id)
    || trimOptionalString(shot.worldLocationRefId)
    || trimOptionalString(shot.locationRefId)
  if (suspectZone || suspectAngle) {
    const detail = [
      worldLocationRefId ? `Location ${displayNameFromRefId(worldLocationRefId)}` : '',
      setId ? `Set ${displayNameFromRefId(setId)}` : '',
    ].filter(Boolean).join(' / ')
    return {
      label: 'Spatial binding needs review',
      detail: detail || 'Continuity zone or viewpoint looked like a shot title/action instead of a physical set.',
    }
  }
  const label = [
    spotIds[0] ? displayNameFromRefId(spotIds[0]) : '',
    zoneId ? displayNameFromRefId(zoneId) : '',
  ].filter(Boolean).join(' / ')
  const detail = [
    worldLocationRefId ? `Location ${displayNameFromRefId(worldLocationRefId)}` : '',
    setId ? `Set ${displayNameFromRefId(setId)}` : '',
    zoneId ? `Zone ${displayNameFromRefId(zoneId)}` : '',
    spotIds.length > 0 ? `Spots ${spotIds.map(displayNameFromRefId).join(', ')}` : '',
    angleId ? `Viewpoint ${displayNameFromRefId(angleId)}` : '',
  ].filter(Boolean).join(' / ')
  return {
    label: label || detail || 'Spatial binding pending',
    detail,
  }
}

function readSequenceAnimaticSceneGraphOverrides(metadata: Record<string, unknown>) {
  const raw = readLooseRecord(metadata.sequenceAnimaticSceneGraphOverrides ?? metadata.sequence_animatic_scene_graph_overrides)
  const nodes = readLooseRecord(raw.nodes)
  return new Map(Object.entries(nodes).flatMap(([nodeId, value]) => {
    const record = readLooseRecord(value)
    const id = trimOptionalString(record.nodeId) || nodeId
    if (!id) return []
    return [[id, {
      nodeId: id,
      nodeKind: trimOptionalString(record.nodeKind),
      visualBriefOverride: trimOptionalString(record.visualBriefOverride),
      extraPromptDirection: trimOptionalString(record.extraPromptDirection),
      lastGeneratedAssetKey: trimOptionalString(record.lastGeneratedAssetKey),
      previousAssetKeys: readLooseArray(record.previousAssetKeys).map(trimOptionalString).filter(Boolean),
    }]]
  }))
}

function performanceLineFromShot(shot: Record<string, unknown>) {
  const performanceBeats = [
    ...readLooseArray(shot.performanceBeats),
    ...readLooseArray(shot.performance),
  ].map(readLooseRecord)
  const direct = trimOptionalString(shot.performance)
  if (direct) return direct
  return performanceBeats
    .map((beat) => [
      trimOptionalString(beat.characterRefId),
      trimOptionalString(beat.bodyLanguage),
      trimOptionalString(beat.facialExpression),
      trimOptionalString(beat.gesture),
      trimOptionalString(beat.voiceEnergy),
    ].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' / ')
}

function normalizeAnimaticRefLookup(value: string) {
  return value
    .replace(/^temporary[_\s-]+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function animaticRefLookupAliases(value: string) {
  const normalized = normalizeAnimaticRefLookup(value)
  if (!normalized) return []
  const aliases = [normalized]
  const parts = normalized.split('_').filter((part) => part.length >= 3 && !['the', 'and', 'for', 'with'].includes(part))
  if (parts.length > 1) {
    aliases.push(parts[0], parts[parts.length - 1])
  }
  return [...new Set(aliases)]
}

function buildSequenceAnimaticReferenceResolver(input: {
  worldEntities: readonly WorldEntity[]
  assetByKey: ReadonlyMap<string, AssetDefinition>
  imageUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetIconUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetUrlByEntityKey: ReadonlyMap<string, string | null>
  continuityAnchors?: readonly SequenceAnimaticContinuityAnchorView[]
}) {
  const directLookupEntries: Array<[string, WorldEntity]> = []
  const shorthandLookupEntries: Array<[string, WorldEntity]> = []
  for (const entity of input.worldEntities) {
    const directLookupKeys = [
      entity.key,
      entity.name,
      ...entity.aliases,
    ].map(normalizeAnimaticRefLookup).filter(Boolean)
    for (const key of directLookupKeys) directLookupEntries.push([key, entity])
    const shorthandKeys = [
      entity.name,
      ...entity.aliases,
    ].flatMap(animaticRefLookupAliases).filter((key) => key && !directLookupKeys.includes(key))
    for (const key of shorthandKeys) shorthandLookupEntries.push([key, entity])
  }
  const entityByLookup = new Map<string, WorldEntity>()
  for (const [key, entity] of directLookupEntries) {
    if (!entityByLookup.has(key)) entityByLookup.set(key, entity)
  }
  const shorthandCounts = new Map<string, number>()
  for (const [key] of shorthandLookupEntries) shorthandCounts.set(key, (shorthandCounts.get(key) ?? 0) + 1)
  for (const [key, entity] of shorthandLookupEntries) {
    if (shorthandCounts.get(key) === 1 && !entityByLookup.has(key)) entityByLookup.set(key, entity)
  }
  const anchorByLookup = new Map<string, SequenceAnimaticContinuityAnchorView>()
  for (const anchor of input.continuityAnchors ?? []) {
    const keys = [
      anchor.id,
      anchor.name,
    ].flatMap(animaticRefLookupAliases).filter(Boolean)
    for (const key of keys) {
      if (!anchorByLookup.has(key)) anchorByLookup.set(key, anchor)
    }
  }
  return (refId: string, role = 'Reference'): SequenceAnimaticReferenceView | null => {
    const cleanRefId = trimOptionalString(refId)
    if (!cleanRefId) return null
    const entity = animaticRefLookupAliases(cleanRefId)
      .map((key) => entityByLookup.get(key) ?? null)
      .find((entry): entry is WorldEntity => Boolean(entry)) ?? null
    if (entity) {
      const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
      const fallbackAssetKey = referenceSheetAssetKey || entity.thumbnailAssetKey || null
      const fallbackAssetUrl = entity.thumbnailAssetKey
        ? resolveAssetSourceUrl(input.assetByKey.get(entity.thumbnailAssetKey) ?? null)
        : null
      return {
        entityKey: entity.key,
        name: entity.name || cleanRefId,
        role,
        iconId: iconForWorldEntity(entity.nodeType),
        assetKey: fallbackAssetKey,
        iconUrl: input.referenceSheetIconUrlByEntityKey.get(entity.key)
          ?? input.imageUrlByEntityKey.get(entity.key)
          ?? fallbackAssetUrl
          ?? null,
        referenceArtUrl: input.referenceSheetUrlByEntityKey.get(entity.key)
          ?? input.imageUrlByEntityKey.get(entity.key)
          ?? fallbackAssetUrl
          ?? null,
      }
    }
    const anchor = animaticRefLookupAliases(cleanRefId)
      .map((key) => anchorByLookup.get(key) ?? null)
      .find((entry): entry is SequenceAnimaticContinuityAnchorView => Boolean(entry)) ?? null
    if (!anchor) return null
    return {
      entityKey: anchor.id || cleanRefId,
      name: anchor.name || displayNameFromRefId(cleanRefId),
      role,
      iconId: anchor.iconId,
      iconUrl: anchor.thumbnailUrl,
      referenceArtUrl: anchor.thumbnailUrl,
      isContinuityAnchor: true,
      continuityAnchorType: anchor.type,
      statusLabel: anchor.statusLabel,
    }
  }
}

function buildSequenceAnimaticShotReferences(
  shot: Record<string, unknown>,
  resolveReference: (refId: string, role?: string) => SequenceAnimaticReferenceView | null,
) {
  const references: SequenceAnimaticReferenceView[] = []
  const seen = new Set<string>()
  const refs = readLooseRecord(shot.refs)
  const sceneBinding = readLooseRecord(shot.sceneBinding ?? shot.scene_binding)
  const addRef = (refId: string, role: string) => {
    const reference = resolveReference(refId, role)
    if (!reference || seen.has(reference.entityKey)) return
    seen.add(reference.entityKey)
    references.push(reference)
  }
  const refIdFromRecord = (record: Record<string, unknown>) => trimOptionalString(record.entityKey)
    || trimOptionalString(record.entity_key)
    || trimOptionalString(record.worldRefId)
    || trimOptionalString(record.world_ref_id)
    || trimOptionalString(record.worldEntityKey)
    || trimOptionalString(record.world_entity_key)
    || trimOptionalString(record.entityRefId)
    || trimOptionalString(record.entity_ref_id)
    || trimOptionalString(record.referenceId)
    || trimOptionalString(record.reference_id)
    || trimOptionalString(record.refId)
    || trimOptionalString(record.ref_id)
    || trimOptionalString(record.characterRefId)
    || trimOptionalString(record.character_ref_id)
    || trimOptionalString(record.speakerRefId)
    || trimOptionalString(record.speaker_ref_id)
    || trimOptionalString(record.propRefId)
    || trimOptionalString(record.prop_ref_id)
    || trimOptionalString(record.itemRefId)
    || trimOptionalString(record.item_ref_id)
  for (const entry of readLooseArray(shot.references)) {
    if (typeof entry === 'string') {
      addRef(trimOptionalString(entry), 'Reference')
      continue
    }
    const record = readLooseRecord(entry)
    addRef(refIdFromRecord(record), trimOptionalString(record.role) || trimOptionalString(record.type) || 'Reference')
  }
  for (const line of readLooseArray(shot.dialogue).map(readLooseRecord)) {
    addRef(refIdFromRecord(line), 'Speaker')
  }
  for (const beat of [
    ...readLooseArray(shot.performanceBeats),
    ...readLooseArray(shot.performance),
  ].map(readLooseRecord)) {
    addRef(refIdFromRecord(beat), 'Performance')
  }
  for (const refId of [
    ...readLooseArray(shot.referenceIds),
    ...readLooseArray(shot.reference_ids),
    ...readLooseArray(shot.refIds),
    ...readLooseArray(shot.ref_ids),
    ...readLooseArray(shot.entityRefIds),
    ...readLooseArray(shot.entity_ref_ids),
    ...readLooseArray(shot.worldRefIds),
    ...readLooseArray(shot.world_ref_ids),
    ...readLooseArray(shot.worldEntityKeys),
    ...readLooseArray(shot.world_entity_keys),
    ...readLooseArray(refs.referenceIds),
    ...readLooseArray(refs.reference_ids),
    ...readLooseArray(refs.refIds),
    ...readLooseArray(refs.ref_ids),
    ...readLooseArray(refs.entityRefIds),
    ...readLooseArray(refs.entity_ref_ids),
    ...readLooseArray(refs.worldRefIds),
    ...readLooseArray(refs.world_ref_ids),
    ...readLooseArray(refs.worldEntityKeys),
    ...readLooseArray(refs.world_entity_keys),
  ].map(trimOptionalString).filter(Boolean)) addRef(refId, 'Reference')
  for (const refId of [
    ...readLooseArray(shot.speakerRefIds),
    ...readLooseArray(shot.speaker_ref_ids),
    ...readLooseArray(refs.speakerRefIds),
    ...readLooseArray(refs.speaker_ref_ids),
  ].map(trimOptionalString).filter(Boolean)) addRef(refId, 'Speaker')
  for (const refId of [
    ...readLooseArray(shot.visibleCharacterRefIds),
    ...readLooseArray(shot.visible_character_ref_ids),
    ...readLooseArray(shot.worldCharacterRefIds),
    ...readLooseArray(shot.world_character_ref_ids),
    ...readLooseArray(refs.visibleCharacterRefIds),
    ...readLooseArray(refs.visible_character_ref_ids),
    ...readLooseArray(refs.worldCharacterRefIds),
    ...readLooseArray(refs.world_character_ref_ids),
  ].map(trimOptionalString).filter(Boolean)) addRef(refId, 'Character')
  for (const refId of [
    trimOptionalString(shot.locationRefId),
    trimOptionalString(shot.location_ref_id),
    trimOptionalString(shot.worldLocationRefId),
    trimOptionalString(shot.world_location_ref_id),
    trimOptionalString(sceneBinding.worldLocationRefId ?? sceneBinding.world_location_ref_id),
    ...readLooseArray(refs.locationRefIds).map(trimOptionalString),
    ...readLooseArray(refs.location_ref_ids).map(trimOptionalString),
  ].filter(Boolean)) addRef(refId, 'Location')
  for (const refId of [
    ...readLooseArray(shot.propRefIds),
    ...readLooseArray(shot.prop_ref_ids),
    ...readLooseArray(refs.propRefIds),
    ...readLooseArray(refs.prop_ref_ids),
    ...readLooseArray(shot.itemRefIds),
    ...readLooseArray(shot.item_ref_ids),
    ...readLooseArray(refs.itemRefIds),
    ...readLooseArray(refs.item_ref_ids),
  ].map(trimOptionalString).filter(Boolean)) addRef(refId, 'Prop')
  for (const refId of readLooseArray(shot.continuityAnchorIds).map(trimOptionalString).filter(Boolean)) addRef(refId, 'Continuity')
  for (const refId of readLooseArray(shot.continuityAnchorRefIds).map(trimOptionalString).filter(Boolean)) addRef(refId, 'Continuity')
  for (const refId of [
    ...readLooseArray(refs.localReferenceIds),
    ...readLooseArray(refs.local_reference_ids),
    ...readLooseArray(sceneBinding.localReferenceIds ?? sceneBinding.local_reference_ids),
  ].map(trimOptionalString).filter(Boolean)) addRef(refId, 'Local ref')
  return references.slice(0, 8)
}

function filterSequenceAnimaticShotReferencesForShot(
  references: readonly SequenceAnimaticReferenceView[],
  shotId: string,
  continuityAnchorById: ReadonlyMap<string, SequenceAnimaticContinuityAnchorView>,
) {
  return references.filter((reference) => {
    if (!reference.isContinuityAnchor) return true
    const anchor = continuityAnchorById.get(reference.entityKey)
    return Boolean(anchor?.shotIds.includes(shotId))
  })
}

export function displayNameFromRefId(value: string) {
  const clean = value.replace(/^temporary[_-]/i, '').replace(/[_-]+/g, ' ').trim()
  if (!clean) return 'Unknown character'
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildSequenceAnimaticPerformanceBeats(
  shot: Record<string, unknown>,
  resolveReference: (refId: string, role?: string) => SequenceAnimaticReferenceView | null,
): SequenceAnimaticPerformanceBeatView[] {
  return [
    ...readLooseArray(shot.performanceBeats),
    ...readLooseArray(shot.performance),
  ].map((entry, index) => {
    const record = readLooseRecord(entry)
    const characterRefId = trimOptionalString(record.characterRefId)
      || trimOptionalString(record.character)
      || trimOptionalString(record.characterName)
      || trimOptionalString(record.name)
    const character = resolveReference(characterRefId, 'Performance')
    const id = trimOptionalString(record.id) || `${trimOptionalString(shot.id) || 'shot'}_performance_${index + 1}`
    const fallbackName = trimOptionalString(record.characterName) || displayNameFromRefId(characterRefId)
    return {
      id,
      characterRefId: character?.entityKey ?? characterRefId,
      characterName: character?.name ?? fallbackName,
      characterIconId: character?.iconId ?? 'character',
      characterIconUrl: character?.iconUrl ?? null,
      characterReferenceArtUrl: character?.referenceArtUrl ?? null,
      emotion: trimOptionalString(record.emotion),
      toneLabel: animaticPerformanceToneLabel(record.valence, record.arousal),
      valenceLabel: formatAnimaticPerformanceNumber(record.valence),
      arousalLabel: formatAnimaticPerformanceNumber(record.arousal),
      confidenceLabel: formatAnimaticPerformanceNumber(record.confidence),
      dominanceLabel: formatAnimaticPerformanceNumber(record.dominance),
      bodyLanguage: trimOptionalString(record.bodyLanguage),
      facialExpression: trimOptionalString(record.facialExpression),
      gaze: trimOptionalString(record.gaze),
      gesture: trimOptionalString(record.gesture),
      voiceEnergy: trimOptionalString(record.voiceEnergy),
    }
  }).filter((beat) => beat.characterRefId || beat.bodyLanguage || beat.facialExpression || beat.gesture || beat.voiceEnergy)
}

export function sequenceAnimaticPerformanceBeatLine(beat: SequenceAnimaticPerformanceBeatView) {
  return [
    beat.emotion ? `emotion ${beat.emotion}` : '',
    `valence ${beat.valenceLabel}`,
    `arousal ${beat.arousalLabel}`,
    beat.dominanceLabel ? `dominance ${beat.dominanceLabel}` : '',
    beat.bodyLanguage ? `body ${beat.bodyLanguage}` : '',
    beat.facialExpression ? `face ${beat.facialExpression}` : '',
    beat.gaze ? `gaze ${beat.gaze}` : '',
    beat.gesture ? `gesture ${beat.gesture}` : '',
    beat.voiceEnergy ? `voice ${beat.voiceEnergy}` : '',
  ].filter(Boolean).join('; ')
}

function inferTemporarySpeakerLabelFromShotAction(shot: Record<string, unknown>, dialogueIndex: number) {
  if (dialogueIndex === 0) return ''
  const actionText = [
    trimOptionalString(shot.action),
    trimOptionalString(shot.description),
    trimOptionalString(shot.storyboardPanelPrompt),
  ].filter(Boolean).join(' ')
  if (!actionText) return ''
  const match = actionText.match(/\b(?:the\s+)?([a-z][a-z\s-]{2,44}?)\s+(?:brushes|waves|calls|says|replies|answers|responds|mutters|asks|snaps|shouts|whispers|murmurs|continues)\b/i)
  const label = match?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
  if (!label) return ''
  return label
}

function buildSequenceAnimaticDialogueLines(
  shot: Record<string, unknown>,
  resolveReference: (refId: string, role?: string) => SequenceAnimaticReferenceView | null,
): SequenceAnimaticDialogueLineView[] {
  return readLooseArray(shot.dialogue).map((entry, index) => {
    const record = readLooseRecord(entry)
    const rawText = typeof entry === 'string'
      ? entry
      : trimOptionalString(record.text) || trimOptionalString(record.line)
    const parsed = rawText.match(/^\s*([^:]{1,48}):\s*(.+)$/)
    const speakerRefId = trimOptionalString(record.speakerRefId) || trimOptionalString(record.characterRefId)
    const speakerLabel = trimOptionalString(record.speaker)
      || trimOptionalString(record.speakerName)
      || trimOptionalString(record.characterName)
      || (parsed ? parsed[1] : '')
    const firstShotSpeakerRef = trimOptionalString(readLooseArray(shot.speakerRefIds)[0])
    const explicitSpeakerLabel = speakerLabel || inferTemporarySpeakerLabelFromShotAction(shot, index)
    const speakerCandidate = explicitSpeakerLabel || speakerRefId || firstShotSpeakerRef
    const text = parsed && !trimOptionalString(record.text) && !trimOptionalString(record.line)
      ? parsed[2].trim()
      : rawText
    if (!text) return null
    const speakerFromLabel = resolveReference(explicitSpeakerLabel, 'Speaker')
    const speaker = speakerFromLabel
      ?? (!explicitSpeakerLabel
        ? resolveReference(speakerRefId, 'Speaker') ?? resolveReference(firstShotSpeakerRef, 'Speaker')
        : null)
    const fallbackSpeakerName = explicitSpeakerLabel || speakerRefId || firstShotSpeakerRef || 'Unknown speaker'
    return {
      id: trimOptionalString(record.id) || `${trimOptionalString(shot.id) || 'shot'}_dialogue_${index + 1}`,
      text,
      emotion: trimOptionalString(record.emotion),
      delivery: trimOptionalString(record.delivery),
      subtext: trimOptionalString(record.subtext),
      speakerRefId: speaker?.entityKey ?? speakerCandidate,
      speakerName: speaker?.name ?? fallbackSpeakerName,
      speakerIconId: speaker?.iconId ?? 'character',
      speakerIconUrl: speaker?.iconUrl ?? null,
      speakerReferenceArtUrl: speaker?.referenceArtUrl ?? null,
    }
  }).filter((line): line is SequenceAnimaticDialogueLineView => Boolean(line))
}

function sequenceAnimaticShotOrderNumber(shot: Record<string, unknown>, fallback: number) {
  const match = trimOptionalString(shot.id).match(/(\d+)(?!.*\d)/)
  const parsed = Number(match?.[1] ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeSequenceAnimaticShotPlanForTimeline(
  shotPlan: Record<string, unknown>,
  groups: readonly Record<string, unknown>[],
) {
  const shots = readLooseArray(shotPlan.shots).map(readLooseRecord)
  if (shots.length <= 1) return shotPlan
  const shotById = new Map(shots.map((shot) => [trimOptionalString(shot.id), shot] as const))
  const orderedIds = groups.flatMap((group) => readLooseArray(group.shotIds).map(trimOptionalString).filter(Boolean))
  const orderedShots = orderedIds.length > 0
    ? [
      ...orderedIds.map((shotId) => shotById.get(shotId)).filter((shot): shot is Record<string, unknown> => Boolean(shot)),
      ...shots.filter((shot) => !orderedIds.includes(trimOptionalString(shot.id))),
    ]
    : [...shots].sort((left, right) => sequenceAnimaticShotOrderNumber(left, shots.indexOf(left) + 1) - sequenceAnimaticShotOrderNumber(right, shots.indexOf(right) + 1))
  return {
    ...shotPlan,
    shots: orderedShots.map((shot, index) => ({ ...shot, index: index + 1 })),
    totalEditorialDurationSeconds: orderedShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0),
  }
}

function deriveSequenceAnimaticScriptShotProjectionFromOutput(outputInput: unknown) {
  const outputs = readLooseRecord(outputInput)
  const screenplayDraft = readLooseRecord(outputs.screenplayDraft ?? outputs.screenplay_draft)
  const scriptContract = trimOptionalString(readLooseRecord(screenplayDraft.metadata).scriptContract) || trimOptionalString(outputs.scriptContract ?? outputs.script_contract)
  if (scriptContract === 'creative_screenplay_v1') {
    return { scriptShotStatus: 'missing' as const, scriptShots: [], scriptBlocks: [] }
  }
  const rawScriptShots = readLooseArray(outputs.scriptShots ?? outputs.script_shots)
  const rawShotBreaks = rawScriptShots.length > 0
    ? rawScriptShots
    : readLooseArray(outputs.shotBreaks ?? outputs.shot_breaks ?? readLooseRecord(outputs.shotBreakPlan ?? outputs.shot_break_plan).shotBreaks)
  const scriptShots = rawShotBreaks.map(readLooseRecord).map((shot, index) => {
    const shotIndex = Number(shot.index ?? 0) || index + 1
    const id = trimOptionalString(shot.id) || `shot_${String(shotIndex).padStart(3, '0')}`
    const approximateDurationSeconds = Math.max(1, Math.min(12, Number(shot.approximateDurationSeconds ?? shot.durationSeconds ?? 0) || 3))
    return {
      id,
      index: shotIndex,
      title: trimOptionalString(shot.title) || `Shot ${shotIndex}`,
      approximateDurationSeconds,
      screenplayText: trimOptionalString(shot.screenplayText) || trimOptionalString(shot.screenplay_text) || trimOptionalString(shot.text),
      startOffset: Number.isFinite(Number(shot.startOffset)) ? Number(shot.startOffset) : undefined,
      endOffset: Number.isFinite(Number(shot.endOffset)) ? Number(shot.endOffset) : undefined,
    }
  })
  const shotById = new Map(scriptShots.map((shot) => [shot.id, shot] as const))
  const rawScriptBlocks = readLooseArray(outputs.scriptBlocks ?? outputs.script_blocks)
  const rawGroups = rawScriptBlocks.length > 0
    ? rawScriptBlocks
    : readLooseArray(readLooseRecord(outputs.shotBreakPlan ?? outputs.shot_break_plan).groups)
  const scriptBlocks = rawGroups.map(readLooseRecord).map((block, index) => {
    const blockIndex = Number(block.index ?? 0) || index + 1
    const shotIds = readLooseArray(block.shotIds ?? block.shot_ids ?? block.shotBreakIds ?? block.shot_break_ids)
      .map(trimOptionalString)
      .filter((shotId) => shotById.has(shotId))
    const approximateDurationSeconds = Number(block.approximateDurationSeconds ?? block.durationSeconds ?? 0)
      || shotIds.reduce((total, shotId) => total + (shotById.get(shotId)?.approximateDurationSeconds ?? 0), 0)
    return {
      id: trimOptionalString(block.id) || `script_block_${String(blockIndex).padStart(3, '0')}`,
      index: blockIndex,
      title: trimOptionalString(block.title) || trimOptionalString(block.summary) || `Screenplay block ${blockIndex}`,
      shotIds,
      approximateDurationSeconds,
    }
  }).filter((block) => block.shotIds.length > 0)
  if (scriptShots.length > 0 && scriptBlocks.length === 0) {
    scriptBlocks.push({
      id: 'script_block_001',
      index: 1,
      title: 'Screenplay shots',
      shotIds: scriptShots.map((shot) => shot.id),
      approximateDurationSeconds: scriptShots.reduce((total, shot) => total + shot.approximateDurationSeconds, 0),
    })
  }
  return {
    scriptShotStatus: scriptShots.length > 0 ? 'ready' as const : 'missing' as const,
    scriptShots,
    scriptBlocks,
  }
}

function deriveSequenceAnimaticScriptShotProjectionFromRun(run: OutputWorkflowRun | null | undefined) {
  const screenplaySteps = (run?.steps ?? [])
    .filter((step) => step.nodeKey === 'cinematic_v3_screenplay_author')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  for (const step of screenplaySteps) {
    const projection = deriveSequenceAnimaticScriptShotProjectionFromOutput(step.outputs)
    if (projection.scriptShots.length > 0) return projection
  }
  const projection = deriveSequenceAnimaticScriptShotProjectionFromOutput(run?.outputs)
  return projection.scriptShots.length > 0
    ? projection
    : { scriptShotStatus: 'missing' as const, scriptShots: [], scriptBlocks: [] }
}

function compactSequenceAnimaticAssetLikeOutput(value: unknown): Record<string, unknown> {
  const record = readLooseRecord(value)
  const compact: Record<string, unknown> = {}
  for (const key of ['assetKey', 'asset_key', 'url', 'mimeType', 'mime_type', 'width', 'height', 'status']) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') compact[key] = record[key]
  }
  return compact
}

function compactSequenceAnimaticStepOutputsForUi(value: unknown): Record<string, unknown> {
  const record = readLooseRecord(value)
  const compact: Record<string, unknown> = {}
  for (const key of ['assetKey', 'asset_key', 'artifactKey', 'artifact_key', 'status', 'qcStatus']) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') compact[key] = record[key]
  }
  for (const key of ['image', 'video', 'artifact']) {
    const nested = compactSequenceAnimaticAssetLikeOutput(record[key])
    if (Object.keys(nested).length > 0) compact[key] = nested
  }
  const shotKeyframe = readLooseRecord(record.shotKeyframe ?? record.shot_keyframe ?? record.keyframe)
  if (Object.keys(shotKeyframe).length > 0) {
    compact.shotKeyframe = {
      shotId: trimOptionalString(shotKeyframe.shotId),
      storyboardBlockId: trimOptionalString(shotKeyframe.storyboardBlockId),
      coverageSetupId: trimOptionalString(shotKeyframe.coverageSetupId),
      assetKey: trimOptionalString(shotKeyframe.assetKey),
      status: trimOptionalString(shotKeyframe.status),
    }
  }
  const coverageAnchor = readLooseRecord(record.coverageAnchor ?? record.coverage_anchor)
  if (Object.keys(coverageAnchor).length > 0) {
    compact.coverageAnchor = {
      coverageSetupId: trimOptionalString(coverageAnchor.coverageSetupId),
      assetKey: trimOptionalString(coverageAnchor.assetKey),
      status: trimOptionalString(coverageAnchor.status),
    }
  }
  return compact
}

export function compactSequenceAnimaticStateForUi(state: SequenceAnimaticStateResponse): SequenceAnimaticStateResponse {
  if (state.unchanged) return state
  return {
    ...state,
    // Realtime events are already folded into streamedShotContinuityPlan. Keeping
    // hundreds of raw payloads in React state duplicates the largest live data.
    events: [],
    runs: state.runs.map((run) => ({
      ...run,
      outputs: compactSequenceAnimaticStepOutputsForUi(run.outputs),
      artifacts: [],
      steps: run.steps.map((step) => ({
        ...step,
        outputs: compactSequenceAnimaticStepOutputsForUi(step.outputs),
      })),
    })),
  }
}

export function buildSequenceAnimaticViewModel(input: {
  request: OutputRequest
  run: OutputWorkflowRun | null
  row: { statusLabel: string; progress: { label: string }; currentStepLabel: string } | null
  sequenceState: SequenceAnimaticStateResponse | null
  requests: readonly OutputRequest[]
  runs: readonly OutputWorkflowRun[]
  nodes: readonly OutputWorkflowNode[]
  assets: readonly AssetDefinition[]
  artifacts: readonly OutputArtifact[]
  worldEntities: readonly WorldEntity[]
  imageUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetIconUrlByEntityKey: ReadonlyMap<string, string | null>
  referenceSheetUrlByEntityKey: ReadonlyMap<string, string | null>
}): SequenceAnimaticViewModel {
  const isActive = sequenceAnimaticStateForRequest(input.request, input.runs, input.artifacts) === 'in_progress'
  const masterProjectionActiveNodeKey = sequenceAnimaticProjectionActiveNodeKey(input.request)
  const masterProjectionActiveLabel = sequenceAnimaticProjectionActiveLabel(input.request)
  const runtimeIndexes = buildSequenceAnimaticRuntimeIndexes({
    request: input.request,
    requests: input.requests,
    runs: input.runs,
    artifacts: input.artifacts,
  })
  const {
    requestArtifacts,
    childRequests,
    continuityRequest,
    activeStoryboardChild,
    readyStoryboardChildCount,
    continuityRun,
    childRequestByBlockId,
    childRunByRequestId,
    shotRevisionRequests,
    plannedKeyframeRequests,
    coverageAnchorRequests,
    zoneCoverageBoardRequests,
    coverageIntentRequests,
    shotVideoRequestsByParentAndShot,
    shotVideoRunByRequestId,
    shotRevisionRunByRequestId,
    plannedKeyframeRunByRequestId,
    shotProductionCoverageRunBySetupId,
    shotProductionCoverageRunByShotId,
    coverageAnchorRunByRequestId,
    zoneCoverageBoardRunByRequestId,
    coverageIntentRunByRequestId,
    continuityAssetRequestByNodeId,
    continuityAssetRunByRequestId,
    childArtifacts,
    continuityArtifacts,
    continuityAssetArtifacts,
    shotVideoArtifacts,
    shotRevisionArtifacts,
    plannedKeyframeArtifacts,
    coverageAnchorArtifacts,
    revisionRequestByShotId,
    plannedKeyframeRequestByShotId,
  } = runtimeIndexes
  const assetByKey = new Map(input.assets.map((asset) => [asset.key, asset] as const))
  const sceneContinuityManifests = sceneContinuityManifestsFromArtifacts(input.artifacts)
  const {
    completedRevisionByShotId,
    completedPlannedKeyframeByShotId,
    coverageAnchorArtifactBySetupId,
    coverageAnchorArtifactByShotId,
  } = buildSequenceAnimaticArtifactIndexes({
    assets: input.assets,
    shotRevisionArtifacts,
    plannedKeyframeArtifacts,
    coverageAnchorArtifacts,
    shotRevisionRequests,
    plannedKeyframeRequests,
  })
  const manifest = readArtifactMetadataRecord(requestArtifacts, ['sequence_animatic_manifest'], ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  const worldReferenceAssetPackEntities = sequenceAnimaticWorldEntityAssetPackRecords({
    worldEntities: input.worldEntities,
    assetByKey,
    imageUrlByEntityKey: input.imageUrlByEntityKey,
    referenceSheetIconUrlByEntityKey: input.referenceSheetIconUrlByEntityKey,
    referenceSheetUrlByEntityKey: input.referenceSheetUrlByEntityKey,
  })
  const manifestAssetPack = hydrateSequenceAnimaticAssetPackUrls(
    mergeSequenceAnimaticAssetPackWithWorldRefs(
      readLooseRecord(readLooseRecord(manifest).assetPack ?? readLooseRecord(manifest).asset_pack),
      worldReferenceAssetPackEntities,
    ),
    assetByKey,
  )
  const artifactDirectorPlan = readArtifactMetadataRecord(requestArtifacts, ['sequence_animatic_director_plan'], ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const stateDirectorPlan = readLooseRecord(input.sequenceState?.directorPlan ?? input.sequenceState?.shotContinuityPlan)
  const streamedDirectorPlan = readLooseRecord(input.sequenceState?.streamedShotContinuityPlan)
  const artifactDirectorPlanReady = Object.keys(readLooseRecord(artifactDirectorPlan)).length > 0
  const stateDirectorPlanReady = input.sequenceState?.directorPlanStatus === 'ready' && Object.keys(stateDirectorPlan).length > 0
  const directorPlanFinalReady = artifactDirectorPlanReady || stateDirectorPlanReady
  const directorPlanStreamingPreview = !artifactDirectorPlanReady && Object.keys(streamedDirectorPlan).length > 0
  const directorPlan = artifactDirectorPlanReady
    ? artifactDirectorPlan
    : directorPlanStreamingPreview
      ? streamedDirectorPlan
      : stateDirectorPlanReady
        ? stateDirectorPlan
        : streamedDirectorPlan
  const finalizedSceneIds = new Set(readLooseArray(input.sequenceState?.scenes)
    .map(readLooseRecord)
    .filter((scene) => (
      scene.manifestReady === true
      || scene.directorPlanReady === true
      || trimOptionalString(scene.source) === 'scene_child_final'
      || trimOptionalString(scene.status) === 'ready'
    ))
    .map((scene) => trimOptionalString(scene.id ?? scene.sceneId ?? scene.scene_id))
    .filter(Boolean))
  const shotIsProvisional = (shot: Record<string, unknown>) => {
    if (!directorPlanStreamingPreview) return false
    const sceneId = sequenceAnimaticSceneIdForShot(shot)
    return !sceneId || !finalizedSceneIds.has(sceneId)
  }
  const directorPlanStreamStatus = input.sequenceState?.shotContinuityStreamStatus ?? 'missing'
  const continuityPack = readArtifactMetadataRecord(continuityArtifacts, ['sequence_animatic_continuity_pack'], ['continuityPack', 'continuity_pack'])
  const manifestContinuityAnchors = [
    ...readLooseArray(readLooseRecord(manifest).propAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(manifest).characterAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(manifest).locationSpotAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(manifest).anchorAssets).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityPack).propAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityPack).characterAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityPack).locationSpotAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityPack).anchorAssets).map(readLooseRecord),
  ]
  const manifestContinuityAnchorPlan = readLooseRecord(readLooseRecord(manifest).continuityAnchorPlan)
  const continuityAnchorPlan = Object.keys(manifestContinuityAnchorPlan).length > 0
    ? manifestContinuityAnchorPlan
    : readFirstOutputRunRecord(continuityRun, ['continuityAnchorPlan', 'continuity_anchor_plan'])
    ?? readFirstOutputRunRecord(input.run, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const plannedContinuityAnchors = [
    ...readLooseArray(readLooseRecord(continuityAnchorPlan).propAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityAnchorPlan).characterAnchors).map(readLooseRecord),
    ...readLooseArray(readLooseRecord(continuityAnchorPlan).locationSpotAnchors).map(readLooseRecord),
  ]
  const continuityLocationSource = Object.keys(readLooseRecord(directorPlan)).length > 0
    ? {
      ...readLooseRecord(continuityPack),
      ...readLooseRecord(directorPlan),
      assetStateByNodeId: readLooseRecord(readLooseRecord(continuityPack).assetStateByNodeId ?? readLooseRecord(continuityPack).asset_state_by_node_id),
      asset_state_by_node_id: readLooseRecord(readLooseRecord(continuityPack).assetStateByNodeId ?? readLooseRecord(continuityPack).asset_state_by_node_id),
      assetGenerationStatus: trimOptionalString(readLooseRecord(continuityPack).assetGenerationStatus ?? readLooseRecord(continuityPack).asset_generation_status) || 'none',
      asset_generation_status: trimOptionalString(readLooseRecord(continuityPack).assetGenerationStatus ?? readLooseRecord(continuityPack).asset_generation_status) || 'none',
    }
    : Object.keys(readLooseRecord(continuityPack)).length > 0 ? readLooseRecord(continuityPack) : readLooseRecord(continuityAnchorPlan)
  const continuityGraphV2 = readLooseRecord(continuityLocationSource.continuityGraphV2 ?? continuityLocationSource.continuity_graph_v2)
  const continuitySceneGraphAdditions = readLooseRecord(continuityLocationSource.sceneGraphAdditions ?? continuityLocationSource.scene_graph_additions)
  const masterMetadata = readLooseRecord(input.request.metadata)
  const zoneCoverageRegistry = readLooseRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
  const coverageRegistry: Record<string, unknown> = {
    ...readLooseRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry),
    coverageCellByShotId: readLooseRecord(zoneCoverageRegistry.coverageCellByShotId ?? zoneCoverageRegistry.coverage_cell_by_shot_id),
    coverage_cell_by_shot_id: readLooseRecord(zoneCoverageRegistry.coverageCellByShotId ?? zoneCoverageRegistry.coverage_cell_by_shot_id),
    zoneCoverageBoards: readLooseArray(zoneCoverageRegistry.zoneCoverageBoards ?? zoneCoverageRegistry.zone_coverage_boards),
    zone_coverage_boards: readLooseArray(zoneCoverageRegistry.zoneCoverageBoards ?? zoneCoverageRegistry.zone_coverage_boards),
    coverageIntentByShotId: {
      ...readLooseRecord(readLooseRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry).coverageIntentByShotId ?? readLooseRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry).coverage_intent_by_shot_id),
      ...readLooseRecord(zoneCoverageRegistry.coverageIntentByShotId ?? zoneCoverageRegistry.coverage_intent_by_shot_id),
    },
  }
  const registryCoverageSetups = readLooseArray(coverageRegistry.coverageSetups ?? coverageRegistry.coverage_setups).map(readLooseRecord)
  const legacyCoverageSetups = readLooseArray(continuityLocationSource.coverageSetups ?? continuityLocationSource.coverage_setups).map(readLooseRecord)
  const coverageSetups = registryCoverageSetups.length > 0 ? registryCoverageSetups : legacyCoverageSetups
  const registryCoverageSetupByShotId = readLooseRecord(coverageRegistry.coverageSetupByShotId ?? coverageRegistry.coverage_setup_by_shot_id)
  const {
    zoneCoverageCellByShotId,
    zoneCoverageActiveShotIds,
    zoneCoverageActiveStageByShotId,
    zoneCoverageFailedShotIds,
    coverageIntentByShotId,
    coverageIntentActiveShotIds,
    coverageIntentFailedShotIds,
    zoneCoverageBoards,
    coverageSetupIdForShot,
    coverageAnchorViews,
    coverageSetupLabel,
    coverageSetupDetail,
  } = buildSequenceAnimaticCoverageIndexes({
    assets: input.assets,
    artifacts: input.artifacts,
    coverageRegistry,
    coverageSetups,
    registryCoverageSetupByShotId,
    zoneCoverageBoardRequests,
    coverageIntentRequests,
    coverageAnchorRequests,
    zoneCoverageBoardRunByRequestId,
    coverageIntentRunByRequestId,
    coverageAnchorRunByRequestId,
    shotProductionCoverageRunBySetupId,
    coverageAnchorArtifactBySetupId,
  })
  const continuityShotBindings = readLooseRecord(continuityLocationSource.shotBindings ?? continuityLocationSource.shot_bindings ?? continuityGraphV2.shotBindings)
  const continuityBlockStates = {
    ...readLooseRecord(readLooseRecord(continuityRequest?.metadata).blockStates),
    ...readLooseRecord(continuityLocationSource.blockStates ?? continuityLocationSource.block_states),
  }
  const continuityGlobalStructureState = {
    ...readLooseRecord(readLooseRecord(continuityRequest?.metadata).globalStructureState),
    ...readLooseRecord(continuityLocationSource.globalStructureState ?? continuityLocationSource.global_structure_state),
  }
  const continuityCoverage = {
    ...readLooseRecord(readLooseRecord(continuityRequest?.metadata).continuityCoverage),
    ...readLooseRecord(continuityLocationSource.coverage),
  }
  const continuityAssetStateByNodeId = {
    ...readLooseRecord(continuityLocationSource.assetStateByNodeId ?? continuityLocationSource.asset_state_by_node_id),
  }
  ;[...continuityArtifacts, ...continuityAssetArtifacts]
    .sort((left, right) => outputArtifactUpdatedAtMs(left) - outputArtifactUpdatedAtMs(right))
    .forEach((artifact) => {
      const metadata = readLooseRecord(artifact.metadata)
      if (trimOptionalString(metadata.role) === 'sequence_animatic_continuity_asset_batch') {
        Object.entries(readLooseRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, state]) => {
          if (nodeId) continuityAssetStateByNodeId[nodeId] = state
        })
        return
      }
      if (trimOptionalString(metadata.role) !== 'sequence_animatic_continuity_asset') return
      const state = readLooseRecord(metadata.assetState ?? metadata.asset_state)
      const nodeId = trimOptionalString(state.sourceNodeId) || trimOptionalString(metadata.targetNodeId)
      if (nodeId) continuityAssetStateByNodeId[nodeId] = state
    })
  const readContinuityAssetStatus = (nodeId: string): SequenceAnimaticContinuityAssetTargetView['status'] => {
    const request = continuityAssetRequestByNodeId.get(nodeId) ?? null
    const run = request ? continuityAssetRunByRequestId.get(request.id) ?? null : null
    const state = readLooseRecord(continuityAssetStateByNodeId[nodeId])
    return sequenceAnimaticWorkStatusToContinuityAssetStatus(buildSequenceAnimaticWorkStatus({
      request,
      run,
      assetStateStatus: trimOptionalString(state.status),
      assetKey: trimOptionalString(state.assetKey),
    }))
  }
  const readContinuityAssetUrl = (nodeId: string) => {
    const assetKey = trimOptionalString(readLooseRecord(continuityAssetStateByNodeId[nodeId]).assetKey)
    return assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : null
  }
  const readContinuityImagePoiAnchors = (nodeId: string) => readLooseArray(
    readLooseRecord(continuityAssetStateByNodeId[nodeId]).zoneImagePoiAnchors
      ?? readLooseRecord(continuityAssetStateByNodeId[nodeId]).zone_image_poi_anchors,
  ).map(readLooseRecord).map((entry) => ({
    spotId: trimOptionalString(entry.spotId ?? entry.spot_id),
    label: trimOptionalString(entry.label),
    matchedText: trimOptionalString(entry.matchedText ?? entry.matched_text),
    x: Number(entry.x),
    y: Number(entry.y),
    confidence: Number(entry.confidence),
    source: trimOptionalString(entry.source),
  })).filter((entry) => entry.spotId && Number.isFinite(entry.x) && Number.isFinite(entry.y))
  const readContinuityImagePoiAnalysis = (nodeId: string) => {
    const analysis = readLooseRecord(
      readLooseRecord(continuityAssetStateByNodeId[nodeId]).zoneImagePoiAnalysis
        ?? readLooseRecord(continuityAssetStateByNodeId[nodeId]).zone_image_poi_analysis,
    )
    const status = trimOptionalString(analysis.status)
    const normalizedStatus: SequenceAnimaticContinuityLocationView['imagePoiAnalysisStatus'] = status === 'ready' || status === 'partial' || status === 'missing' || status === 'failed' ? status : ''
    const found = Number(analysis.foundCount ?? analysis.found_count)
    const candidates = Number(analysis.candidateCount ?? analysis.candidate_count)
    return {
      status: normalizedStatus,
      label: Number.isFinite(found) && Number.isFinite(candidates) && candidates > 0
        ? `${found}/${candidates} image labels matched`
        : status
          ? status.replace(/_/g, ' ')
          : '',
      diagnostics: readLooseArray(analysis.diagnostics).map(trimOptionalString).filter(Boolean),
    }
  }
  const continuitySetSourceEntries = readLooseArray(continuityLocationSource.locationSets ?? continuityLocationSource.location_sets).length > 0
    ? readLooseArray(continuityLocationSource.locationSets ?? continuityLocationSource.location_sets)
    : readLooseArray(continuitySceneGraphAdditions.sets)
  const continuityZoneSourceEntries = readLooseArray(continuityGraphV2.zones).length > 0
    ? readLooseArray(continuityGraphV2.zones)
    : readLooseArray(continuitySceneGraphAdditions.zones)
  const continuitySpotSourceEntries = readLooseArray(continuityGraphV2.spots).length > 0
    ? readLooseArray(continuityGraphV2.spots)
    : readLooseArray(continuitySceneGraphAdditions.spots)
  const continuityLocationSets = continuitySetSourceEntries.map(readLooseRecord).map((entry): SequenceAnimaticContinuityLocationView => ({
    id: trimOptionalString(entry.id),
    name: trimOptionalString(entry.name) || displayNameFromRefId(trimOptionalString(entry.id)),
    summary: trimOptionalString(entry.visualBrief) || trimOptionalString(entry.persistenceReason),
    kind: 'set',
    worldLocationRefId: trimOptionalString(entry.worldLocationRefId ?? entry.world_location_ref_id ?? entry.baseLocationRefId),
      assetStatus: readContinuityAssetStatus(trimOptionalString(entry.id)),
      assetStatusLabel: sequenceAnimaticContinuityAssetStatusLabel(readContinuityAssetStatus(trimOptionalString(entry.id))),
      assetUrl: readContinuityAssetUrl(trimOptionalString(entry.id)),
      imagePoiAnchors: readContinuityImagePoiAnchors(trimOptionalString(entry.id)),
      imagePoiAnalysisStatus: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).status,
      imagePoiAnalysisLabel: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).label,
      imagePoiAnalysisDiagnostics: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).diagnostics,
      shotIds: readLooseArray(entry.shotIds).map(trimOptionalString).filter(Boolean),
      blockIds: readLooseArray(entry.storyboardBlockIds).map(trimOptionalString).filter(Boolean),
    })).filter((entry) => (entry.id || entry.name) && !sequenceAnimaticSpatialEntryLooksCharacterDerived(entry, input.worldEntities))
    .concat(continuityZoneSourceEntries.map(readLooseRecord).map((entry): SequenceAnimaticContinuityLocationView => ({
      id: trimOptionalString(entry.id),
      name: trimOptionalString(entry.name) || displayNameFromRefId(trimOptionalString(entry.id)),
      summary: trimOptionalString(entry.visualBrief),
      kind: 'zone',
      worldLocationRefId: trimOptionalString(entry.worldLocationRefId ?? entry.world_location_ref_id),
      setId: trimOptionalString(entry.setId ?? entry.set_id),
      assetStatus: readContinuityAssetStatus(trimOptionalString(entry.id)),
      assetStatusLabel: sequenceAnimaticContinuityAssetStatusLabel(readContinuityAssetStatus(trimOptionalString(entry.id))),
      assetUrl: readContinuityAssetUrl(trimOptionalString(entry.id)),
      imagePoiAnchors: readContinuityImagePoiAnchors(trimOptionalString(entry.id)),
      imagePoiAnalysisStatus: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).status,
      imagePoiAnalysisLabel: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).label,
      imagePoiAnalysisDiagnostics: readContinuityImagePoiAnalysis(trimOptionalString(entry.id)).diagnostics,
      shotIds: readLooseArray(entry.shotIds).map(trimOptionalString).filter(Boolean),
      blockIds: readLooseArray(entry.storyboardBlockIds).map(trimOptionalString).filter(Boolean),
    })).filter((entry) => (entry.id || entry.name) && !sequenceAnimaticSpatialEntryLooksCharacterDerived(entry, input.worldEntities)))
    .concat(continuitySpotSourceEntries.map(readLooseRecord).map((entry): SequenceAnimaticContinuityLocationView => ({
      id: trimOptionalString(entry.id),
      name: trimOptionalString(entry.name) || displayNameFromRefId(trimOptionalString(entry.id)),
      summary: trimOptionalString(entry.visualBrief),
      kind: 'spot',
      worldLocationRefId: trimOptionalString(entry.worldLocationRefId ?? entry.world_location_ref_id),
      setId: trimOptionalString(entry.setId ?? entry.set_id),
      zoneId: trimOptionalString(entry.zoneId ?? entry.zone_id),
      assetStatus: readContinuityAssetStatus(trimOptionalString(entry.id)),
      assetStatusLabel: sequenceAnimaticContinuityAssetStatusLabel(readContinuityAssetStatus(trimOptionalString(entry.id))),
      assetUrl: readContinuityAssetUrl(trimOptionalString(entry.id)),
      shotIds: readLooseArray(entry.shotIds).map(trimOptionalString).filter(Boolean),
      blockIds: readLooseArray(entry.storyboardBlockIds).map(trimOptionalString).filter(Boolean),
    })).filter((entry) => (entry.id || entry.name) && !sequenceAnimaticSpatialEntryLooksCharacterDerived(entry, input.worldEntities)))
  const continuityAngleSourceEntries = readLooseArray(continuityGraphV2.viewpoints).length > 0
    ? readLooseArray(continuityGraphV2.viewpoints)
    : readLooseArray(continuityGraphV2.angles).length > 0
      ? readLooseArray(continuityGraphV2.angles)
      : readLooseArray(continuitySceneGraphAdditions.viewpoints).length > 0
        ? readLooseArray(continuitySceneGraphAdditions.viewpoints)
        : readLooseArray(continuitySceneGraphAdditions.angles).length > 0
          ? readLooseArray(continuitySceneGraphAdditions.angles)
      : readLooseArray(continuityLocationSource.locationAngles ?? continuityLocationSource.location_angles)
  const continuityLocationAngles = continuityAngleSourceEntries.map(readLooseRecord).map((entry): SequenceAnimaticContinuityLocationView => ({
    id: trimOptionalString(entry.id),
    name: trimOptionalString(entry.name) || displayNameFromRefId(trimOptionalString(entry.id)),
    summary: [
      trimOptionalString(entry.visualBrief),
      trimOptionalString(entry.framing),
      trimOptionalString(entry.screenDirectionRule),
    ].filter(Boolean).join(' / '),
    kind: 'viewpoint',
    worldLocationRefId: trimOptionalString(entry.worldLocationRefId ?? entry.world_location_ref_id),
    setId: trimOptionalString(entry.setId ?? entry.set_id),
    zoneId: trimOptionalString(entry.zoneId ?? entry.zone_id),
    spotIds: readLooseArray(entry.spotIds ?? entry.spot_ids).map(trimOptionalString).filter(Boolean),
    assetStatus: readContinuityAssetStatus(trimOptionalString(entry.id)),
    assetStatusLabel: sequenceAnimaticContinuityAssetStatusLabel(readContinuityAssetStatus(trimOptionalString(entry.id))),
    assetUrl: readContinuityAssetUrl(trimOptionalString(entry.id)),
    shotIds: readLooseArray(entry.shotIds).map(trimOptionalString).filter(Boolean),
    blockIds: readLooseArray(entry.storyboardBlockIds).map(trimOptionalString).filter(Boolean),
  })).filter((entry) => (entry.id || entry.name) && !sequenceAnimaticSpatialEntryLooksCharacterDerived(entry, input.worldEntities))
  const continuityRejectedCandidates = readLooseArray(continuityLocationSource.rejectedCandidates ?? continuityLocationSource.rejected_candidates).map(readLooseRecord).map((entry): SequenceAnimaticContinuityRejectedView => ({
    name: trimOptionalString(entry.name) || 'Unnamed candidate',
    reason: trimOptionalString(entry.reason).replace(/_/g, ' ') || 'rejected',
    evidence: readLooseArray(entry.sourceEvidence).map(trimOptionalString).filter(Boolean).slice(0, 2).join(' / '),
  })).slice(0, 12)
  const continuityAnchorViews = buildSequenceAnimaticContinuityAnchorViews({
    manifestAnchors: manifestContinuityAnchors,
    plannedAnchors: [
      ...plannedContinuityAnchors,
      ...readLooseArray(readLooseRecord(directorPlan).localReferences ?? readLooseRecord(directorPlan).outputLocalReferences).map(readLooseRecord),
    ],
    assetByKey,
    run: continuityRun ?? input.run,
  })
  const continuityAssetTargets = (() => {
    const entries = [
      ...continuityLocationSets.map((entry) => ({
        nodeId: entry.id,
        name: entry.name,
        assetKind: entry.kind === 'set' ? 'location_set' : entry.kind === 'zone' ? 'location_zone' : entry.kind === 'viewpoint' || entry.kind === 'angle' ? 'location_angle' : 'location_spot',
        visualBrief: entry.summary,
        blockIds: entry.blockIds,
        shotIds: entry.shotIds,
      })),
      ...continuityLocationSets.filter((entry) => entry.kind === 'spot').map((entry) => ({
        nodeId: spotCameraGridNodeId(entry.id),
        name: `${entry.name || 'Spot'} camera grid`,
        assetKind: 'spot_camera_grid',
        visualBrief: `Camera coverage grid for ${entry.name || 'spot'}. ${entry.summary}`.trim(),
        blockIds: entry.blockIds,
        shotIds: entry.shotIds,
      })),
      ...continuityLocationAngles.map((entry) => ({
        nodeId: entry.id,
        name: entry.name,
        assetKind: 'location_angle',
        visualBrief: entry.summary,
        blockIds: entry.blockIds,
        shotIds: entry.shotIds,
      })),
      ...continuityAnchorViews.map((anchor) => ({
        nodeId: anchor.id,
        name: anchor.name,
        assetKind: anchor.type === 'character' ? 'temporary_character' : anchor.type === 'prop' ? 'prop' : 'location_spot',
        visualBrief: anchor.visualBrief || anchor.usageDetailLabel,
        blockIds: anchor.blockIds,
        shotIds: anchor.shotIds,
      })),
    ].filter((entry) => entry.nodeId)
    const seen = new Set<string>()
    return entries.filter((entry) => {
      if (seen.has(entry.nodeId)) return false
      seen.add(entry.nodeId)
      return true
    }).map((entry): SequenceAnimaticContinuityAssetTargetView => {
      const state = readLooseRecord(continuityAssetStateByNodeId[entry.nodeId])
      const status = readContinuityAssetStatus(entry.nodeId)
      const assetKey = trimOptionalString(state.assetKey)
      const request = continuityAssetRequestByNodeId.get(entry.nodeId) ?? null
      const requestMetadata = readLooseRecord(request?.metadata)
      const lifecycle = readLooseRecord(requestMetadata.commandLifecycle ?? requestMetadata.command_lifecycle)
      const lastWorkflowCommand = readLooseRecord(requestMetadata.lastWorkflowCommand ?? requestMetadata.last_workflow_command)
      return {
        ...entry,
        status,
        statusLabel: sequenceAnimaticContinuityAssetStatusLabel(status),
        actionLabel: sequenceAnimaticContinuityAssetActionLabel(status),
        assetKey: assetKey || null,
        assetUrl: assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : null,
        commandStatus: trimOptionalString(lifecycle.status) || trimOptionalString(lastWorkflowCommand.mode) || trimOptionalString(requestMetadata.workflowCommandMode),
        commandDiagnostics: readLooseArray(lifecycle.diagnostics).map(trimOptionalString).filter(Boolean),
        generationRequestId: trimOptionalString(requestMetadata.regenerationRequestId) || trimOptionalString(lastWorkflowCommand.regenerationRequestId) || null,
      }
    })
  })()
  const continuityMetadata = readLooseRecord(continuityRequest?.metadata)
  const continuityProjection = sequenceAnimaticProjectionForRequest(continuityRequest)
  const continuityStale = continuityMetadata.sequenceAnimaticStale === true
  const continuityRunning = sequenceAnimaticRequestIsActive(continuityRequest, continuityRun)
  const continuityReady = Object.keys(readLooseRecord(continuityPack)).length > 0
  const continuityGraphStatus = ((): SequenceAnimaticViewModel['continuityGraphStatus'] => {
    const status = trimOptionalString(continuityLocationSource.continuityGraphStatus ?? continuityLocationSource.continuity_graph_status ?? continuityMetadata.continuityGraphStatus)
    return status === 'empty' || status === 'partial' || status === 'ready' || status === 'stale' || status === 'failed'
      ? status
      : continuityReady
        ? 'partial'
        : 'empty'
  })()
  const continuityAssetGenerationStatus = ((): SequenceAnimaticViewModel['continuityAssetGenerationStatus'] => {
    const status = trimOptionalString(continuityLocationSource.assetGenerationStatus ?? continuityLocationSource.asset_generation_status)
    if (status === 'none' || status === 'partial' || status === 'ready' || status === 'stale' || status === 'failed') return status
    if (continuityAssetTargets.length === 0) return 'none'
    if (continuityAssetTargets.some((entry) => entry.status === 'failed')) return 'failed'
    if (continuityAssetTargets.some((entry) => entry.status === 'stale')) return 'stale'
    if (continuityAssetTargets.every((entry) => entry.status === 'ready')) return 'ready'
    if (continuityAssetTargets.some((entry) => entry.status === 'ready')) return 'partial'
    return 'none'
  })()
  const continuityEffectiveStatus = sequenceAnimaticEffectiveStatus(continuityRequest)
  const continuityFailedStep = continuityRun?.steps.find((step) => step.status === 'failed') ?? null
  const continuityFailed = Boolean(
    outputWorkflowRunHasFailedExecution(continuityRun)
      || FAILED_SEQUENCE_ANIMATIC_STATUSES.has(continuityEffectiveStatus),
  )
  const continuityError = [
    trimOptionalString(continuityFailedStep?.errorMessage),
    trimOptionalString(continuityRun?.errorMessage),
    trimOptionalString(continuityRequest?.errorMessage),
    trimOptionalString(continuityProjection?.latestError),
  ].find(Boolean) ?? ''
  const currentContinuityPackHash = trimOptionalString(readLooseRecord(continuityPack).continuityPackHash)
  const directorPlanStep = outputRunStepForNode(input.run, 'sequence_animatic_director_plan')
  const directorPlanRunning = isOutputRunStepActive(directorPlanStep)
    || (isActive && masterProjectionActiveNodeKey === 'sequence_animatic_director_plan')
  const activeMasterStep = directorPlanRunning && directorPlanStep
    ? directorPlanStep
    : sequenceAnimaticRelevantWorkflowSteps(input.run)[0]
    ?? null
  const activeMasterStepLabel = activeMasterStep
    ? sequenceAnimaticFriendlyProgressLabel(trimOptionalString(activeMasterStep.label) || trimOptionalString(activeMasterStep.nodeKey), activeMasterStep.nodeKey)
    : directorPlanRunning
      ? sequenceAnimaticFriendlyProgressLabel(masterProjectionActiveLabel || 'Shot Continuity Plan', 'sequence_animatic_director_plan')
      : ''
  const continuityButtonLabel = !continuityRequest
    ? 'Prepare continuity'
    : continuityRunning
      ? 'Generating continuity'
    : continuityFailed
      ? 'Retry continuity'
    : continuityStale
      ? 'Regenerate stale continuity'
    : continuityReady
      ? continuityAssetGenerationStatus === 'stale' ? 'Regenerate stale assets' : 'Generate missing assets'
      : 'Prepare continuity'
  const continuityStructureStatus = trimOptionalString(continuityGlobalStructureState.status)
  const continuityStructureRunning = continuityStructureStatus === 'deriving'
  const coverageTotalShots = Number(continuityCoverage.totalShots ?? 0) || 0
  const coverageBoundShots = Number(continuityCoverage.boundShots ?? 0) || 0
  const continuityShotBindingCount = Object.keys(continuityShotBindings).length
  const effectiveBoundShotCount = coverageBoundShots > 0 ? coverageBoundShots : continuityShotBindingCount
  const continuityStructureNodeCount = continuityLocationSets.length + continuityLocationAngles.length
  const hasContinuityStructure = effectiveBoundShotCount > 0 || continuityStructureNodeCount > 0 || (continuityGraphStatus !== 'empty' && continuityReady)
  const missingShotIds = readLooseArray(continuityCoverage.missingShotIds).map(trimOptionalString).filter(Boolean)
  const continuityCoverageLabel = coverageTotalShots > 0
    ? `${effectiveBoundShotCount}/${coverageTotalShots} shots bound`
    : continuityShotBindingCount > 0
      ? `${continuityShotBindingCount} shots bound`
      : 'No shot bindings'
  const continuityStructureActionLabel = continuityStale
    ? 'Regenerate stale structure'
    : continuityStructureRunning
      ? 'Generating structure'
      : !hasContinuityStructure
        ? 'Generate continuity structure'
      : missingShotIds.length > 0
        ? 'Fill continuity gaps'
        : 'Regenerate structure'
  const continuityStructureStatusLabel = continuityStructureRunning
    ? 'Structure generation running'
    : missingShotIds.length > 0
      ? `${missingShotIds.length} shot${missingShotIds.length === 1 ? '' : 's'} need binding`
      : effectiveBoundShotCount > 0
        ? 'Structure saved'
      : continuityStructureNodeCount > 0
        ? 'Structure generated'
        : 'Structure not generated'
  const continuityStatusLabel = continuityRunning
    ? sequenceAnimaticProjectionActiveLabel(continuityRequest) || 'Generating continuity'
    : continuityFailed
      ? 'Continuity failed'
    : continuityStale
      ? 'Continuity changed; regeneration recommended'
      : continuityReady
        ? 'Continuity structure saved'
        : continuityRequest
          ? 'Continuity prepared'
          : 'Continuity not prepared'
  const continuityAnchorById = new Map(continuityAnchorViews.map((anchor) => [anchor.id, anchor] as const))
  const resolveReference = buildSequenceAnimaticReferenceResolver({
    worldEntities: input.worldEntities,
    assetByKey,
    imageUrlByEntityKey: input.imageUrlByEntityKey,
    referenceSheetIconUrlByEntityKey: input.referenceSheetIconUrlByEntityKey,
    referenceSheetUrlByEntityKey: input.referenceSheetUrlByEntityKey,
    continuityAnchors: continuityAnchorViews,
  })
  const continuityGraphVisualDependencyEdges = [
    ...readLooseArray(continuityLocationSource.visualDependencyEdges ?? continuityLocationSource.visual_dependency_edges).map(readLooseRecord),
    ...readLooseArray(continuityGraphV2.visualDependencyEdges ?? continuityGraphV2.visual_dependency_edges).map(readLooseRecord),
    ...readLooseArray(continuityGraphV2.edges).map(readLooseRecord),
    ...readLooseArray(continuitySceneGraphAdditions.edges).map(readLooseRecord),
  ]
  const sceneGraphOverrides = readSequenceAnimaticSceneGraphOverrides(readLooseRecord(input.request.metadata))
  const continuityGraphView = buildSequenceAnimaticContinuityGraphView({
    continuityLocationSets,
    continuityLocationAngles,
    continuityAnchors: continuityAnchorViews,
    coverageAnchors: coverageAnchorViews,
    continuityAssetTargets,
    visualDependencyEdges: continuityGraphVisualDependencyEdges,
    sceneGraphOverrides,
    resolveReference,
  })
  const manifestBlocks = readLooseArray(readLooseRecord(manifest).blocks).map(readLooseRecord)
  const manifestBlockById = new Map(manifestBlocks
    .map((block) => [trimOptionalString(block.id), block] as const)
    .filter(([blockId]) => Boolean(blockId)))
  const manifestStoryboardGroupPlan = manifestBlocks.length > 0
    ? { groups: manifestBlocks.map((block) => readLooseRecord(block.storyboardGroup)).filter((group) => trimOptionalString(group.id)) }
    : null
  const directorShots = readLooseArray(readLooseRecord(directorPlan).shots).map(readLooseRecord)
  const manifestShotPlan = readLooseRecord(readLooseRecord(manifest).shotPlan)
  const shotPlan = directorShots.length > 0
    ? {
      ...manifestShotPlan,
      shots: directorShots,
      totalEditorialDurationSeconds: directorShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds ?? shot.durationSeconds) || 0), 0),
    }
    : Object.keys(manifestShotPlan).length > 0
      ? manifestShotPlan
    : readFirstOutputRunRecord(input.run, ['shotPlan', 'shot_plan'])
    ?? readArtifactMetadataRecord(requestArtifacts, ['cinematic_v3_authoring_timeline'], ['shotPlan', 'shot_plan'])
  const storyboardGroupPlan = manifestStoryboardGroupPlan
    ?? readFirstOutputRunRecord(input.run, ['storyboardGroupPlan', 'storyboard_group_plan'])
    ?? readArtifactMetadataRecord(requestArtifacts, ['cinematic_v3_authoring_timeline'], ['storyboardGroupPlan', 'storyboard_group_plan'])
  const timeline = readFirstOutputRunRecord(input.run, ['timeline'])
    ?? readArtifactMetadataRecord(requestArtifacts, ['cinematic_v3_authoring_timeline'], ['timeline'])
  const screenplay = readLooseRecord(readLooseRecord(manifest).screenplayDraft)
  const fallbackScreenplay = Object.keys(screenplay).length > 0
    ? screenplay
    : readFirstOutputRunRecord(input.run, ['screenplayDraft', 'screenplay', 'script'])
  const panels = [
    ...readArtifactMediaRecords(childArtifacts, ['cinematic_v3_storyboard_panel', 'cinematic_v2_storyboard_panel', 'sequence_animatic_block_panel']),
    ...readArtifactMediaRecords(requestArtifacts, ['cinematic_v3_storyboard_panel', 'cinematic_v2_storyboard_panel']),
    ...childRequests.flatMap((request) => {
      const childRun = childRunByRequestId.get(request.id) ?? null
      return readAllOutputRunRecords(childRun, ['panels']).filter((panel) => trimOptionalString(panel.shotId) || trimOptionalString(panel.role).includes('storyboard_panel'))
    }),
    ...readAllOutputRunRecords(input.run, ['panels']).filter((panel) => trimOptionalString(panel.shotId) || trimOptionalString(panel.role).includes('storyboard_panel')),
  ]
  const sheets = [
    ...readArtifactMediaRecords(childArtifacts, ['cinematic_v3_storyboard_sheet', 'cinematic_v2_storyboard_sheet']),
    ...readArtifactMediaRecords(requestArtifacts, ['cinematic_v3_storyboard_sheet', 'cinematic_v2_storyboard_sheet']),
  ]
  const directorPlanBlocks = readLooseArray(readLooseRecord(directorPlan).blocks).map(readLooseRecord)
  const groups = (() => {
    const storyboardGroups = readLooseArray(readLooseRecord(storyboardGroupPlan).groups).map(readLooseRecord)
    if (storyboardGroups.length > 0) return storyboardGroups
    return directorPlanBlocks
  })()
  const timelineShotPlan = Object.keys(readLooseRecord(shotPlan)).length > 0
    ? normalizeSequenceAnimaticShotPlanForTimeline(readLooseRecord(shotPlan), groups)
    : shotPlan
  const panelPreviewByShotId = new Map<string, { assetKey: string; url: string | null }>()
  for (const panel of panels) {
    const shotId = trimOptionalString(panel.shotId)
    const assetKey = trimOptionalString(panel.assetKey)
    if (shotId && assetKey && !panelPreviewByShotId.has(shotId)) {
      panelPreviewByShotId.set(shotId, {
        assetKey,
        url: resolveSequenceAnimaticMediaUrl(panel, assetByKey),
      })
    }
  }
  const buildPanelPreviewMap = (records: Record<string, unknown>[], storyboardGroupId = '') => {
    const scoped = new Map<string, { assetKey: string; url: string | null }>()
    for (const panel of records) {
      const metadata = readLooseRecord(panel.metadata)
      const panelGroupId = trimOptionalString(panel.storyboardGroupId) || trimOptionalString(metadata.storyboardGroupId)
      const panelBlockId = trimOptionalString(metadata.storyboardBlockId)
      if (storyboardGroupId && panelGroupId && panelGroupId !== storyboardGroupId) continue
      if (storyboardGroupId && panelBlockId && panelBlockId !== storyboardGroupId) continue
      const shotId = trimOptionalString(panel.shotId)
      const assetKey = trimOptionalString(panel.assetKey)
      if (shotId && assetKey && !scoped.has(shotId)) {
        scoped.set(shotId, {
          assetKey,
          url: resolveSequenceAnimaticMediaUrl(panel, assetByKey),
        })
      }
    }
    return scoped
  }
  let projection: ReturnType<typeof buildCinematicV2TimelineProjection> | null = null
  if (timelineShotPlan) {
    try {
      projection = buildCinematicV2TimelineProjection({
        shotPlan: timelineShotPlan,
        timeline,
        panels,
        storyboardSheets: sheets,
      })
    } catch {
      projection = null
    }
  }
  const rawShots = readLooseArray(readLooseRecord(shotPlan).shots).map(readLooseRecord)
  const keyframeTotalCount = rawShots.length
  const keyframeReadyCount = rawShots
    .map((shot, index) => trimOptionalString(shot.id) || `shot_${index + 1}`)
    .filter((shotId) => completedPlannedKeyframeByShotId.has(shotId) || completedRevisionByShotId.has(shotId) || panelPreviewByShotId.has(shotId))
    .length
  const keyframeRunning = plannedKeyframeRequests.some((request) => sequenceAnimaticRequestIsActive(request, plannedKeyframeRunByRequestId.get(request.id) ?? null))
    || coverageAnchorRequests.some((request) => sequenceAnimaticRequestIsActive(request, coverageAnchorRunByRequestId.get(request.id) ?? null))
  const keyframeProgressLabel = keyframeTotalCount > 0
    ? `${keyframeReadyCount}/${keyframeTotalCount} keyframes ready`
    : 'Keyframes pending'
  const scriptShotProjection = input.sequenceState?.scriptShotStatus === 'ready'
    ? {
      scriptShotStatus: 'ready' as const,
      scriptShots: input.sequenceState.scriptShots,
      scriptBlocks: input.sequenceState.scriptBlocks,
    }
    : deriveSequenceAnimaticScriptShotProjectionFromRun(input.run)
  const scriptShotById = new Map(scriptShotProjection.scriptShots.map((shot) => [shot.id, shot] as const))
  const projectionShotById = new Map((projection?.shots ?? []).map((shot) => [shot.id, shot] as const))
  const blocks: SequenceAnimaticBlockView[] = groups.length > 0
    ? groups.map((group, groupIndex) => {
      const groupId = trimOptionalString(group.id) || `cinematic_v3_storyboard_group_${String(groupIndex + 1).padStart(3, '0')}`
      const manifestBlock = manifestBlockById.get(groupId) ?? null
      const blockContinuityAnchorIds = [
        ...readLooseArray(manifestBlock?.continuityAnchorIds).map(trimOptionalString),
        ...readLooseArray(group.continuityAnchorIds).map(trimOptionalString),
        ...continuityAnchorViews
          .filter((anchor) => anchor.blockIds.includes(groupId))
          .map((anchor) => anchor.id),
      ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index)
      const blockContinuityAnchors = blockContinuityAnchorIds
        .map((anchorId) => continuityAnchorById.get(anchorId) ?? null)
        .filter((anchor): anchor is SequenceAnimaticContinuityAnchorView => Boolean(anchor))
      const blockContinuityAnchorsPending = blockContinuityAnchors.some((anchor) => !['ready', 'skipped'].includes(anchor.status))
      const promptNodeKey = normalizeStoryboardGroupNodeKey(groupId, 'prompt')
      const sheetNodeKey = normalizeStoryboardGroupNodeKey(groupId, 'sheet')
      const panelExtractNodeKey = normalizeStoryboardGroupNodeKey(groupId, 'panel_extract')
      const videoPromptNodeKey = normalizeStoryboardGroupNodeKey(groupId, 'video_prompt')
      const videoNodeKey = normalizeStoryboardGroupNodeKey(groupId, 'video')
      const childRequest = childRequestByBlockId.get(groupId) ?? null
      const childMetadata = readLooseRecord(childRequest?.metadata)
      const blockContinuityPackHash = trimOptionalString(childMetadata.continuityPackHash)
      const blockContinuityChanged = Boolean(currentContinuityPackHash && blockContinuityPackHash && currentContinuityPackHash !== blockContinuityPackHash)
      const storyboardContinuityMode = trimOptionalString(childMetadata.storyboardContinuityMode)
      const storyboardContinuityBlockers = readLooseArray(childMetadata.storyboardContinuityBlockers).map(trimOptionalString).filter(Boolean)
      const storyboardContinuityAssetCount = readLooseArray(childMetadata.storyboardSpatialReferenceAssetKeys).map(trimOptionalString).filter(Boolean).length
      const storyboardContinuityStale = childMetadata.sequenceAnimaticStale === true || trimOptionalString(childMetadata.staleStoryboardSpatialReferencePackHash).length > 0
      const storyboardContinuityLabel = storyboardContinuityStale
        ? 'Stale: continuity refs changed, regenerate storyboard'
        : storyboardContinuityMode === 'ready'
          ? `Using scene continuity refs${storyboardContinuityAssetCount > 0 ? ` (${storyboardContinuityAssetCount})` : ''}`
          : 'Provisional: prepare Scene Board for stronger location continuity'
      const rawContinuityBlockState = readLooseRecord(continuityBlockStates[groupId])
      const continuityBlockStatus = ((): SequenceAnimaticBlockView['continuityBlockStatus'] => {
        const status = trimOptionalString(rawContinuityBlockState.status)
        if (status === 'not_started' || status === 'seeded' || status === 'deriving' || status === 'ready' || status === 'needs_review' || status === 'failed' || status === 'stale') return status
        if (blockContinuityAnchors.length > 0) return 'ready'
        return 'not_started'
      })()
      const continuityBlockStatusLabel = continuityBlockStatus === 'deriving'
        ? 'Deriving continuity'
        : continuityBlockStatus === 'seeded'
          ? 'Continuity seeded'
        : continuityBlockStatus === 'ready'
          ? 'Continuity derived'
          : continuityBlockStatus === 'needs_review'
            ? 'Continuity needs review'
            : continuityBlockStatus === 'failed'
              ? 'Continuity failed'
              : continuityBlockStatus === 'stale'
                ? 'Continuity stale'
                : 'Continuity not derived'
      const continuityBlockActionLabel = continuityBlockStatus === 'deriving'
        ? 'Deriving'
        : continuityBlockStatus === 'seeded'
          ? 'Refine block continuity'
        : continuityBlockStatus === 'ready'
          ? 'Regenerate block continuity'
          : continuityBlockStatus === 'needs_review'
            ? 'Review changes'
            : continuityBlockStatus === 'failed'
              ? 'Retry continuity'
              : 'Derive continuity'
      const childRun = childRequest ? childRunByRequestId.get(childRequest.id) ?? null : null
      const childPromptNodeKey = childRequest ? 'storyboard_prompt' : promptNodeKey
      const childSheetNodeKey = childRequest ? 'storyboard_sheet' : sheetNodeKey
      const childPanelExtractNodeKey = childRequest ? 'panel_extract' : panelExtractNodeKey
      const childVideoPromptNodeKey = childRequest ? 'video_prompt' : videoPromptNodeKey
      const childVideoNodeKey = childRequest ? 'video' : videoNodeKey
      const blockArtifacts = childRequest
        ? input.artifacts.filter((artifact) => artifactBelongsToRequest(artifact, childRequest))
        : requestArtifacts
      const blockManifestMetadata = blockArtifacts
        .map((artifact) => readLooseRecord(artifact.metadata))
        .find((metadata) => trimOptionalString(metadata.role) === 'sequence_animatic_block_manifest') ?? null
      const workflowId = childRequest?.workflowId ?? input.request.workflowId
      const sheetNode = outputWorkflowNodeForKey(input.nodes, workflowId, childSheetNodeKey)
      const videoPromptNode = outputWorkflowNodeForKey(input.nodes, workflowId, childVideoPromptNodeKey)
      const sheetStep = outputRunStepForNode(childRun ?? input.run, childSheetNodeKey)
      const panelExtractStep = outputRunStepForNode(childRun ?? input.run, childPanelExtractNodeKey)
      const videoPromptStep = outputRunStepForNode(childRun ?? input.run, childVideoPromptNodeKey)
      const videoStep = outputRunStepForNode(childRun ?? input.run, childVideoNodeKey)
      const blockSteps = [
        outputRunStepForNode(childRun ?? input.run, childPromptNodeKey),
        sheetStep,
        panelExtractStep,
        videoPromptStep,
      ].filter(Boolean)
      const failedStep = blockSteps.find((step) => step?.status === 'failed') ?? null
      const runningStep = blockSteps.find((step) => step?.status === 'running' || step?.status === 'queued') ?? null
      const childProjectionActiveNodeKey = sequenceAnimaticProjectionActiveNodeKey(childRequest)
      const childProjectionActiveLabel = sequenceAnimaticProjectionActiveLabel(childRequest)
      const childPrepNodeKeys = new Set([childPromptNodeKey, childSheetNodeKey, childPanelExtractNodeKey, childVideoPromptNodeKey])
      const childPrepActiveFromProjection = Boolean(childRequest)
        && Boolean(childRun || childRequest?.latestRunId)
        && sequenceAnimaticRequestIsActive(childRequest, childRun)
        && (!childProjectionActiveNodeKey || childPrepNodeKeys.has(childProjectionActiveNodeKey))
      const shotIds = readLooseArray(group.shotIds).map(trimOptionalString).filter(Boolean)
      const groupShots = shotIds
        .map((shotId) => rawShots.find((shot) => trimOptionalString(shot.id) === shotId) ?? null)
        .filter((shot): shot is Record<string, unknown> => Boolean(shot))
      const blockPanels = [
        ...readArtifactMediaRecords(blockArtifacts, ['cinematic_v3_storyboard_panel', 'cinematic_v2_storyboard_panel', 'sequence_animatic_block_panel']),
        ...(childRun
          ? readAllOutputRunRecords(childRun, ['panels'])
          : readAllOutputRunRecords(input.run, ['panels']).filter((panel) => {
            const metadata = readLooseRecord(panel.metadata)
            const panelGroupId = trimOptionalString(panel.storyboardGroupId) || trimOptionalString(metadata.storyboardGroupId)
            const panelBlockId = trimOptionalString(metadata.storyboardBlockId)
            return panelGroupId === groupId || panelBlockId === groupId
          })),
      ]
      const blockPanelPreviewByShotId = buildPanelPreviewMap(blockPanels, groupId)
      const panelsReady = groupShots.length > 0 && groupShots.every((shot) => blockPanelPreviewByShotId.has(trimOptionalString(shot.id)))
      const sheetDurableOutput = resolveDurableWorkflowNodeOutput({
        node: sheetNode,
        nodeKey: childSheetNodeKey,
        run: childRun ?? input.run,
        step: sheetStep,
        artifacts: blockArtifacts,
        artifactRoles: ['cinematic_v3_storyboard_sheet', 'cinematic_v2_storyboard_sheet'],
      })
      const videoPromptDurableOutput = resolveDurableWorkflowNodeOutput({
        node: videoPromptNode,
        nodeKey: childVideoPromptNodeKey,
        run: childRun ?? input.run,
        step: videoPromptStep,
        artifacts: blockArtifacts,
        artifactRoles: ['sequence_animatic_block_manifest'],
      })
      const videoDurableOutput = resolveDurableWorkflowNodeOutput({
        node: outputWorkflowNodeForKey(input.nodes, workflowId, childVideoNodeKey),
        nodeKey: childVideoNodeKey,
        run: childRun ?? input.run,
        step: videoStep,
        artifacts: blockArtifacts,
        artifactRoles: ['cinematic_v3_storyboard_group_video', 'sequence_animatic_block_video'],
      })
      const sheetAssetKey = durableWorkflowAssetKey(sheetDurableOutput, 'image')
        || outputRunStepAssetKey(sheetStep, ['image', 'assetKey'])
        || outputWorkflowNodeAssetKey(sheetNode, ['image', 'assetKey'])
      const storyboardReady = Boolean(sheetAssetKey) && panelsReady
      const videoPromptText = durableWorkflowTextOutput(videoPromptDurableOutput) || outputRunStepTextOutput(videoPromptStep) || outputWorkflowNodeTextOutput(videoPromptNode)
      const blockManifestVideoPromptHash = trimOptionalString(blockManifestMetadata?.videoPromptHash)
      const videoPromptReady = Boolean(videoPromptText)
        || Boolean(blockManifestVideoPromptHash)
        || (videoPromptStep?.status === 'completed' && Boolean(videoPromptStep.outputHash))
        || (Boolean(videoPromptNode?.outputHash) && videoPromptNode?.dirty !== true)
      const videoArtifacts = blockArtifacts
        .filter((artifact) => artifact.kind === 'video')
        .filter((artifact) => {
          const metadata = readLooseRecord(artifact.metadata)
          const role = trimOptionalString(metadata.role)
          return trimOptionalString(metadata.nodeKey) === childVideoNodeKey
            || role === 'cinematic_v3_storyboard_group_video'
            || role === 'sequence_animatic_block_video'
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      const latestVideoArtifact = videoArtifacts[0] ?? null
      const videoStepAssetKey = outputRunStepAssetKey(videoStep, ['video', 'assetKey'])
      const videoAssetKey = durableWorkflowAssetKey(videoDurableOutput, 'video') || latestVideoArtifact?.assetKey || videoStepAssetKey || null
      const videoUrl = videoAssetKey ? resolveAssetSourceUrl(assetByKey.get(videoAssetKey) ?? null) : null
      const videoRunning = isOutputRunStepActive(videoStep)
      const videoReady = Boolean(videoUrl) && videoStep?.status !== 'failed'
      const videoError = videoStep?.status === 'failed' ? videoStep.errorMessage ?? 'Video generation failed.' : ''
      const videoProgressLabel = videoRunning
        ? sequenceAnimaticVideoProgressLabel(videoStep)
        : videoReady
          ? 'Video ready'
          : videoAssetKey
            ? 'Video asset saved; loading preview'
          : videoError
            ? videoError
          : storyboardReady && videoPromptReady
            ? 'Ready for video'
          : !storyboardReady
              ? 'Ready to generate storyboard'
              : 'Storyboard generated; video prompt pending'
      const storyboardRunning = !storyboardReady && (Boolean(runningStep) || childPrepActiveFromProjection)
      const storyboardProgressLabel = storyboardRunning
        ? childProjectionActiveLabel || runningStep?.label || 'Generating storyboard'
        : storyboardReady
          ? 'Storyboard panels ready'
          : failedStep
            ? `Failed: ${failedStep.label}`
            : 'Ready to generate storyboard'
      const blockContinuityAssetTargets = continuityAssetTargets.filter((target) => (
        target.blockIds.includes(groupId)
        || target.shotIds.some((shotId) => shotIds.includes(shotId))
      ))
      return {
        id: groupId,
        index: typeof group.index === 'number' ? group.index : groupIndex + 1,
        title: trimOptionalString(group.title) || trimOptionalString(group.summary) || `Storyboard block ${groupIndex + 1}`,
        isProvisional: groupShots.some((shot) => shotIsProvisional(shot)),
        plannedShotIds: shotIds,
        durationLabel: formatAnimaticSeconds(group.editorialDurationSeconds ?? group.durationSeconds),
        statusLabel: failedStep
          ? `Failed: ${failedStep.label}`
          : runningStep
            ? `${statusLabelForOutputRunStep(runningStep)}: ${runningStep.label}`
            : childPrepActiveFromProjection
              ? `Running: ${childProjectionActiveLabel || 'Storyboard prep'}`
              : directorPlanStreamingPreview
                ? `${groupShots.length}/${shotIds.length || groupShots.length} shots planned`
                : groupShots.every((shot) => blockPanelPreviewByShotId.has(trimOptionalString(shot.id))) ? 'Panels ready' : childRequest ? 'Ready to generate' : 'Preparing block graph',
        shotRangeLabel: shotIds.length > 0 ? `Shots ${shotIds[0]}-${shotIds[shotIds.length - 1]}` : 'Shots pending',
        childRequestId: childRequest?.id ?? null,
        childWorkflowId: childRequest?.workflowId ?? null,
        childRunId: childRun?.id ?? null,
        readyToRun: directorPlanStreamingPreview ? false : childRequest ? readLooseRecord(childRequest.metadata).readyToRun !== false : false,
        promptNodeKey: childPromptNodeKey,
        sheetNodeKey: childSheetNodeKey,
        panelExtractNodeKey: childPanelExtractNodeKey,
        videoPromptNodeKey: childVideoPromptNodeKey,
        videoNodeKey: childVideoNodeKey,
        failedNodeLabel: failedStep?.label ?? '',
        hasPanels: groupShots.some((shot) => blockPanelPreviewByShotId.has(trimOptionalString(shot.id))),
        storyboardReady,
        storyboardRunning,
        storyboardProgressLabel,
        storyboardContinuityMode: storyboardContinuityMode || 'provisional',
        storyboardContinuityLabel,
        storyboardContinuityBlockers,
        storyboardContinuityStale,
        videoPromptReady,
        videoReady,
        videoRunning,
        videoAssetKey,
        videoUrl,
        videoProgressLabel,
        videoError,
        continuityAnchors: blockContinuityAnchors,
        continuityAnchorCountLabel: blockContinuityAnchors.length > 0
          ? `Using ${blockContinuityAnchors.length} continuity ref${blockContinuityAnchors.length === 1 ? '' : 's'}`
          : 'No continuity refs',
        continuityAnchorsPending: blockContinuityAnchorsPending,
        continuityChanged: blockContinuityChanged,
        continuityBlockStatus,
        continuityBlockStatusLabel,
        continuityBlockActionLabel,
        continuityBlockWarnings: readLooseArray(rawContinuityBlockState.warnings).map(trimOptionalString).filter(Boolean),
        continuityBlockError: trimOptionalString(rawContinuityBlockState.error),
        continuityAssetTargets: blockContinuityAssetTargets,
        continuityAssetCountLabel: blockContinuityAssetTargets.length > 0
          ? `${blockContinuityAssetTargets.filter((target) => target.status === 'ready').length}/${blockContinuityAssetTargets.length} assets ready`
          : 'No continuity assets',
        shots: groupShots.map((shot, shotIndex) => {
          const shotId = trimOptionalString(shot.id) || `${groupIndex + 1}:${shotIndex + 1}`
          const shotBinding = readLooseRecord(continuityShotBindings[shotId])
          const shotBindingLabels = sequenceAnimaticShotBindingLabels(shotBinding, shot)
          const spatialBindingView = buildSequenceAnimaticSpatialBindingView({
            shot,
            binding: shotBinding,
            continuityGraphView,
            continuityAssetTargets,
            resolveReference,
          })
          const shotContinuityAnchorIds = [
            ...readLooseArray(shot.continuityAnchorIds).map(trimOptionalString),
            ...readLooseArray(shot.continuityAnchorRefIds).map(trimOptionalString),
            ...readLooseArray(shotBinding.continuityAnchorIds).map(trimOptionalString),
            ...readLooseArray(shotBinding.characterAnchorIds).map(trimOptionalString),
            ...readLooseArray(shotBinding.propAnchorIds).map(trimOptionalString),
            ...continuityAnchorViews
              .filter((anchor) => anchor.shotIds.includes(shotId))
              .map((anchor) => anchor.id),
          ].filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index)
            .filter((value) => continuityAnchorById.has(value))
          const projectionShot = projectionShotById.get(shotId)
          const preview = blockPanelPreviewByShotId.get(shotId) ?? null
          const previewAssetKey = preview?.assetKey ?? null
          const panelUrl = preview?.url ?? null
          const completedRevision = completedRevisionByShotId.get(shotId) ?? null
          const revisionRequest = revisionRequestByShotId.get(shotId) ?? null
          const revisionRun = revisionRequest ? shotRevisionRunByRequestId.get(revisionRequest.id) ?? null : null
          const revisionStep = outputRunStepForNode(revisionRun, 'shot_revision_artifact')
          const revisionPlanStep = outputRunStepForNode(revisionRun, 'shot_revision_plan')
          const revisionImageStep = outputRunStepForNode(revisionRun, 'shot_keyframe_image')
          const revisionRunning = !completedRevision && (
            isOutputRunStepActive(revisionStep)
            || isOutputRunStepActive(revisionPlanStep)
            || isOutputRunStepActive(revisionImageStep)
            || sequenceAnimaticRequestIsActive(revisionRequest, revisionRun)
          )
          const revisionError = revisionStep?.status === 'failed'
            ? revisionStep.errorMessage ?? 'Shot revision failed.'
            : revisionImageStep?.status === 'failed'
              ? revisionImageStep.errorMessage ?? 'Shot keyframe generation failed.'
              : revisionPlanStep?.status === 'failed'
                ? revisionPlanStep.errorMessage ?? 'Shot rewrite failed.'
                : ''
          const completedPlannedKeyframe = completedPlannedKeyframeByShotId.get(shotId) ?? null
          const plannedKeyframeRequest = plannedKeyframeRequestByShotId.get(shotId) ?? null
          const plannedKeyframeRun = plannedKeyframeRequest ? plannedKeyframeRunByRequestId.get(plannedKeyframeRequest.id) ?? null : null
          const plannedKeyframeStep = outputRunStepForNode(plannedKeyframeRun, 'planned_keyframe_artifact')
          const plannedKeyframeImageStep = outputRunStepForNode(plannedKeyframeRun, 'planned_keyframe_image')
          const plannedKeyframeRunning = !completedPlannedKeyframe && (
            isOutputRunStepActive(plannedKeyframeStep)
            || isOutputRunStepActive(plannedKeyframeImageStep)
            || sequenceAnimaticRequestIsActive(plannedKeyframeRequest, plannedKeyframeRun)
          )
          const plannedKeyframeProgressLabel = plannedKeyframeRunning
            ? sequenceAnimaticShotKeyframeProgressLabel(plannedKeyframeRun)
            : ''
          const plannedKeyframeError = plannedKeyframeStep?.status === 'failed'
            ? plannedKeyframeStep.errorMessage ?? 'Shot keyframe failed.'
            : plannedKeyframeImageStep?.status === 'failed'
              ? plannedKeyframeImageStep.errorMessage ?? 'Shot keyframe image failed.'
              : ''
          const displayShot = completedRevision?.revisedShot ?? shot
          const shotVideoRequest = childRequest ? shotVideoRequestsByParentAndShot.get(`${childRequest.id}:${shotId}`) ?? null : null
          const shotVideoRun = shotVideoRequest ? shotVideoRunByRequestId.get(shotVideoRequest.id) ?? null : null
          const shotVideoStep = outputRunStepForNode(shotVideoRun, 'shot_video')
          const shotVideoPromptStep = outputRunStepForNode(shotVideoRun, 'shot_video_prompt')
          const shotVideoArtifactsForShot = shotVideoRequest
            ? shotVideoArtifacts
                .filter((artifact) => artifactBelongsToRequest(artifact, shotVideoRequest))
                .filter((artifact) => {
                  const metadata = readLooseRecord(artifact.metadata)
                  return artifact.kind === 'video'
                    && (trimOptionalString(metadata.role) === 'sequence_animatic_shot_video' || trimOptionalString(metadata.nodeKey) === 'shot_video')
                    && (!trimOptionalString(metadata.shotId) || trimOptionalString(metadata.shotId) === shotId)
                })
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            : []
          const shotVideoArtifact = shotVideoArtifactsForShot[0] ?? null
          const shotVideoAssetKey = shotVideoArtifact?.assetKey ?? outputRunStepAssetKey(shotVideoStep, ['video', 'assetKey'])
          const shotVideoUrl = shotVideoAssetKey ? resolveAssetSourceUrl(assetByKey.get(shotVideoAssetKey) ?? null) : null
          const shotVideoError = shotVideoStep?.status === 'failed' ? shotVideoStep.errorMessage ?? 'Shot video generation failed.' : ''
          const shotVideoReady = Boolean(shotVideoUrl) && shotVideoStep?.status !== 'failed'
          const shotVideoRunning = !shotVideoReady
            && (isOutputRunStepActive(shotVideoStep) || isOutputRunStepActive(shotVideoPromptStep) || sequenceAnimaticRequestIsActive(shotVideoRequest, shotVideoRun))
          const shotVideoProgressLabel = shotVideoRunning
            ? sequenceAnimaticShotVideoProgressLabel(shotVideoStep) || shotVideoPromptStep?.label || 'Generating shot video'
            : shotVideoReady
              ? 'Shot take ready'
              : shotVideoAssetKey
                ? 'Shot take saved; loading preview'
                : shotVideoError
                  ? shotVideoError
                  : previewAssetKey
                    ? 'Ready for shot video'
                    : 'Panel required'
          const shotContinuityAnchorsPending = shotContinuityAnchorIds.some((anchorId) => {
            const anchor = continuityAnchorById.get(anchorId)
            return anchor && !['ready', 'skipped'].includes(anchor.status)
          })
          const shotReferences = filterSequenceAnimaticShotReferencesForShot(
            buildSequenceAnimaticShotReferences({ ...displayShot, continuityAnchorIds: shotContinuityAnchorIds, continuityAnchorRefIds: shotContinuityAnchorIds }, resolveReference),
            shotId,
            continuityAnchorById,
          )
          const effectiveCoverageSetupId = coverageSetupIdForShot(displayShot)
          const coverageIntent = coverageIntentByShotId.get(shotId) ?? null
          const coverageIntentRunning = coverageIntentActiveShotIds.has(shotId)
          const coverageIntentFailed = coverageIntentFailedShotIds.has(shotId)
          const zoneCoverageCell = zoneCoverageCellByShotId.get(shotId) ?? null
          const zoneCoverageCellReady = Boolean(zoneCoverageCell?.assetKey)
          const zoneCoverageCellActiveStage = zoneCoverageActiveStageByShotId.get(shotId) ?? ''
          const zoneCoverageCellRunning = !zoneCoverageCellReady && Boolean(zoneCoverageCellActiveStage)
          const zoneCoverageCellFailed = !zoneCoverageCellReady && zoneCoverageFailedShotIds.has(shotId)
          const setupCoverageAnchor = coverageAnchorViews.find((anchor) => anchor.id && anchor.id === effectiveCoverageSetupId) ?? null
          const shotCoverageArtifact = coverageAnchorArtifactByShotId.get(shotId) ?? null
          const shotCoverageRun = shotProductionCoverageRunByShotId.get(shotId) ?? null
          const shotCoverageAnchor = setupCoverageAnchor
            ? {
              ...setupCoverageAnchor,
              status: shotCoverageRun
                ? 'generating' as const
                : shotCoverageArtifact?.assetKey
                  ? 'ready' as const
                  : setupCoverageAnchor.status,
              statusLabel: shotCoverageRun
                ? 'Generating anchor'
                : shotCoverageArtifact?.assetKey
                  ? 'Anchor ready'
                  : setupCoverageAnchor.statusLabel,
              assetKey: shotCoverageArtifact?.assetKey ?? setupCoverageAnchor.assetKey,
              assetUrl: shotCoverageArtifact?.assetUrl ?? setupCoverageAnchor.assetUrl,
              running: Boolean(shotCoverageRun) || setupCoverageAnchor.running,
            }
            : null
          const keyframeDependencyNodeIds = new Set([
            ...spatialBindingView.hierarchy.map((node) => node.id),
            ...shotReferences.map((reference) => reference.entityKey),
            shotCoverageAnchor?.setId,
            shotCoverageAnchor?.zoneId,
            shotCoverageAnchor?.primarySpotId,
            ...(shotCoverageAnchor?.spotIds ?? []),
            shotCoverageAnchor?.viewpointId,
          ].filter(Boolean))
          const keyframeDependencyTargets = continuityAssetTargets.filter((target) => (
            target.shotIds.includes(shotId) || keyframeDependencyNodeIds.has(target.nodeId)
          ))
          const keyframeDependencyRunning = keyframeDependencyTargets.some((target) => target.status === 'generating')
          const keyframeDependencyMissingCount = keyframeDependencyTargets.filter((target) => ['missing', 'stale', 'failed'].includes(target.status)).length
          const keyframeDependencyReadyCount = keyframeDependencyTargets.filter((target) => target.status === 'ready').length
          const sceneContinuityReadiness = sceneContinuityReadinessForShot({ manifests: sceneContinuityManifests, shot: displayShot, shotId })
          const sceneContinuityLabel = sceneContinuityReadinessLabel(sceneContinuityReadiness)
          const keyframeDependencyStatusLabel = plannedKeyframeProgressLabel
            || (keyframeDependencyRunning
            ? 'Generating keyframe refs'
            : keyframeDependencyMissingCount > 0
              ? `${keyframeDependencyMissingCount} keyframe ref${keyframeDependencyMissingCount === 1 ? '' : 's'} missing`
              : sceneContinuityLabel
                ? sceneContinuityLabel
              : keyframeDependencyTargets.length > 0
                ? `${keyframeDependencyReadyCount}/${keyframeDependencyTargets.length} keyframe refs ready`
                : 'Shot refs ready')
          const progressPreview = sequenceAnimaticShotProgressPreview({
            coverageAnchor: shotCoverageAnchor,
            dependencyTargets: keyframeDependencyTargets,
            spatialBindingView,
          })
          const coveragePanelAssetKey = zoneCoverageCell?.assetKey ?? shotCoverageAnchor?.assetKey ?? null
          const coveragePanelUrl = zoneCoverageCell?.assetUrl ?? shotCoverageAnchor?.assetUrl ?? null
          const displayPanelAssetKey = completedRevision?.keyframeAssetKey
            ?? completedPlannedKeyframe?.keyframeAssetKey
            ?? previewAssetKey
            ?? coveragePanelAssetKey
            ?? progressPreview.assetKey
          const displayPanelUrl = completedRevision?.keyframeUrl
            ?? completedPlannedKeyframe?.keyframeUrl
            ?? panelUrl
            ?? coveragePanelUrl
            ?? progressPreview.assetUrl
          const panelProgressRunning = coverageIntentRunning || Boolean(shotCoverageAnchor?.running) || zoneCoverageCellRunning || keyframeDependencyRunning
          return {
            id: shotId,
            index: typeof shot.index === 'number' ? shot.index : shotIndex + 1,
            title: trimOptionalString(shot.title) || `Shot ${shotIndex + 1}`,
            isProvisional: shotIsProvisional(shot),
            sourceScriptShotIds: readLooseArray(shot.sourceScriptShotIds ?? shot.source_script_shot_ids ?? shot.sourceAnchorIds ?? shot.source_anchor_ids).map(trimOptionalString).filter(Boolean),
            timeLabel: projectionShot
              ? formatAnimaticTimeRange(projectionShot.startSeconds, projectionShot.endSeconds)
              : 'Timing pending',
            durationLabel: formatAnimaticSeconds(shot.editorialDurationSeconds ?? shot.durationSeconds),
            action: trimOptionalString(displayShot.action) || trimOptionalString(displayShot.description) || trimOptionalString(displayShot.storyboardPanelPrompt),
            dialogue: buildSequenceAnimaticDialogueLines({ ...displayShot, continuityAnchorIds: shotContinuityAnchorIds, continuityAnchorRefIds: shotContinuityAnchorIds }, resolveReference),
            camera: cameraLineFromShot(displayShot),
            lighting: trimOptionalString(displayShot.lighting),
            performance: performanceLineFromShot(displayShot),
            performanceBeats: buildSequenceAnimaticPerformanceBeats({ ...displayShot, continuityAnchorIds: shotContinuityAnchorIds, continuityAnchorRefIds: shotContinuityAnchorIds }, resolveReference),
            coverageSetupId: effectiveCoverageSetupId,
            coverageSetupLabel: coverageSetupLabel(displayShot),
            coverageSetupDetail: coverageSetupDetail(displayShot),
            coverageIntent,
            coverageIntentRunning,
            coverageIntentFailed,
            zoneCoverageCell,
            zoneCoverageCellRunning,
            zoneCoverageCellActiveStage,
            zoneCoverageCellFailed,
            spatialContinuityLabel: spatialBindingView.compactLabel || shotBindingLabels.label,
            spatialContinuityDetail: spatialBindingView.detailLabel || shotBindingLabels.detail,
            spatialBindingView,
            panelStatusLabel: completedRevision?.keyframeAssetKey
              ? 'Revised keyframe ready'
              : completedPlannedKeyframe?.keyframeAssetKey
                ? 'Keyframe ready'
                : plannedKeyframeRunning
                  ? plannedKeyframeProgressLabel || 'Generating keyframe'
                    : coverageIntentRunning
                      ? 'Planning coverage'
                    : shotCoverageAnchor?.running
                      ? 'Generating coverage anchor'
                    : zoneCoverageCellRunning
                      ? zoneCoverageCellActiveStage === 'extract' ? 'Extracting coverage grid cell' : 'Generating coverage grid'
                    : coverageIntent
                      ? 'Coverage direction ready'
                    : keyframeDependencyRunning
                          ? 'Generating keyframe refs'
                          : previewAssetKey
                            ? 'Storyboard keyframe ready'
                          : zoneCoverageCell?.assetKey
                            ? 'Coverage grid cell ready'
                            : progressPreview.assetKey
                              ? progressPreview.statusLabel
                              : panelExtractStep?.status === 'failed' ? 'Panel extraction failed' : storyboardRunning ? 'Panel extraction running' : 'Panel not generated',
            panelError: plannedKeyframeError || (panelExtractStep?.status === 'failed' ? panelExtractStep.errorMessage ?? '' : ''),
            panelAssetKey: displayPanelAssetKey,
            panelUrl: displayPanelUrl,
            panelRunning: plannedKeyframeRunning || panelProgressRunning || (storyboardRunning && !displayPanelUrl),
            keyframeStatusLabel: completedRevision?.keyframeAssetKey
              ? 'Revised keyframe ready'
              : completedPlannedKeyframe?.keyframeAssetKey
                ? 'Keyframe ready'
                : plannedKeyframeRunning
                  ? plannedKeyframeProgressLabel || 'Generating keyframe'
                  : previewAssetKey
                    ? 'Storyboard keyframe ready'
                  : keyframeDependencyRunning
                    ? 'Generating keyframe refs'
                    : sceneContinuityLabel
                      ? sceneContinuityLabel
                    : keyframeDependencyMissingCount > 0
                      ? 'Preparing keyframe refs'
                  : plannedKeyframeRequest
                    ? 'Keyframe queued'
                    : 'Keyframe not generated',
            keyframeDependencyStatusLabel,
            keyframeProgressLabel: plannedKeyframeProgressLabel,
            keyframeDependencyRunning,
            keyframeDependencyMissingCount,
            keyframeRequestId: plannedKeyframeRequest?.id ?? null,
            keyframeWorkflowId: plannedKeyframeRequest?.workflowId ?? null,
            keyframeDependencyMode: trimOptionalString(readLooseRecord(plannedKeyframeRequest?.metadata).dependencyMode),
            keyframeGraphPolicyVersion: trimOptionalString(readLooseRecord(plannedKeyframeRequest?.metadata).shotGraphPolicyVersion),
            keyframeRunning: plannedKeyframeRunning,
            keyframeError: plannedKeyframeError,
            isRevised: Boolean(completedRevision),
            originalAction: trimOptionalString(shot.action) || trimOptionalString(shot.description) || trimOptionalString(shot.storyboardPanelPrompt),
            originalCamera: cameraLineFromShot(shot),
            originalLighting: trimOptionalString(shot.lighting),
            revisionRequestId: revisionRequest?.id ?? null,
            revisionWorkflowId: revisionRequest?.workflowId ?? null,
            revisionRunId: revisionRun?.id ?? null,
            revisionRunning,
            revisionError,
            revisionPrompt: trimOptionalString(readLooseRecord(revisionRequest?.metadata).revisionPrompt) || trimOptionalString(completedRevision?.revision.prompt),
            revisionSummary: trimOptionalString(completedRevision?.revision.changeSummary),
            references: shotReferences,
            continuityAnchorsPending: shotContinuityAnchorsPending,
            shotVideoRequestId: shotVideoRequest?.id ?? null,
            shotVideoWorkflowId: shotVideoRequest?.workflowId ?? null,
            shotVideoRunId: shotVideoRun?.id ?? null,
            shotVideoReady,
            shotVideoRunning,
            shotVideoUrl,
            shotVideoProgressLabel,
            shotVideoError,
          }
        }),
      }
    })
    : rawShots.length > 0
      ? [{
        id: 'storyboard_group_1',
        index: 1,
        title: directorPlanStreamingPreview ? 'Shot continuity plan' : 'Storyboard block 1',
        isProvisional: rawShots.some((shot) => shotIsProvisional(shot)),
        plannedShotIds: rawShots.map((shot, shotIndex) => trimOptionalString(shot.id) || `shot_${shotIndex + 1}`),
        durationLabel: formatAnimaticSeconds(readLooseRecord(shotPlan).totalEditorialDurationSeconds),
        statusLabel: directorPlanStreamingPreview ? 'Planning shots' : panels.length > 0 ? 'Panels ready' : 'Generating panels',
        shotRangeLabel: `Shots 1-${rawShots.length}`,
        childRequestId: null,
        childWorkflowId: null,
        childRunId: null,
        readyToRun: false,
        promptNodeKey: 'cinematic_v3_storyboard_group_001_prompt',
        sheetNodeKey: 'cinematic_v3_storyboard_group_001_sheet',
        panelExtractNodeKey: 'cinematic_v3_storyboard_group_001_panel_extract',
        videoPromptNodeKey: 'cinematic_v3_storyboard_group_001_video_prompt',
        videoNodeKey: 'cinematic_v3_storyboard_group_001_video',
        failedNodeLabel: '',
        hasPanels: panels.length > 0,
        storyboardReady: rawShots.length > 0 && rawShots.every((shot) => panelPreviewByShotId.has(trimOptionalString(shot.id))),
        storyboardRunning: false,
        storyboardProgressLabel: directorPlanStreamingPreview
          ? 'Final shot continuity artifact required'
          : panels.length > 0 ? 'Storyboard panels ready' : 'Ready to generate storyboard',
        storyboardContinuityMode: 'provisional',
        storyboardContinuityLabel: 'Provisional: prepare Scene Board for stronger location continuity',
        storyboardContinuityBlockers: [],
        storyboardContinuityStale: false,
        videoPromptReady: false,
        videoReady: false,
        videoRunning: false,
        videoAssetKey: null,
        videoUrl: null,
        videoProgressLabel: directorPlanStreamingPreview
          ? 'Final shot continuity artifact required'
          : panels.length > 0 ? 'Storyboard generated; video prompt pending' : 'Ready to generate storyboard',
        videoError: '',
        continuityAnchors: [],
        continuityAnchorCountLabel: 'No continuity refs',
        continuityAnchorsPending: directorPlanStreamingPreview,
        continuityChanged: false,
        continuityBlockStatus: 'not_started',
        continuityBlockStatusLabel: directorPlanStreamingPreview ? 'Planning continuity bindings' : 'Continuity not derived',
        continuityBlockActionLabel: directorPlanStreamingPreview ? 'Plan still streaming' : 'Derive continuity',
        continuityBlockWarnings: [],
        continuityBlockError: '',
        continuityAssetTargets: [],
        continuityAssetCountLabel: directorPlanStreamingPreview ? 'Assets pending' : 'No continuity assets',
        shots: rawShots.map((shot, shotIndex) => {
          const shotId = trimOptionalString(shot.id) || `shot_${shotIndex + 1}`
          const shotBinding = readLooseRecord(continuityShotBindings[shotId])
          const shotBindingLabels = sequenceAnimaticShotBindingLabels(shotBinding, shot)
          const spatialBindingView = buildSequenceAnimaticSpatialBindingView({
            shot,
            binding: shotBinding,
            continuityGraphView,
            continuityAssetTargets,
            resolveReference,
          })
          const projectionShot = projectionShotById.get(shotId)
          const preview = panelPreviewByShotId.get(shotId) ?? null
          const previewAssetKey = preview?.assetKey ?? projectionShot?.previewAssetKey ?? null
          const panelUrl = preview?.url ?? (previewAssetKey ? resolveAssetSourceUrl(assetByKey.get(previewAssetKey) ?? null) : null)
          const panelStep = outputRunStepForNode(input.run, 'cinematic_v3_storyboard_group_001_panel_extract')
          const completedRevision = completedRevisionByShotId.get(shotId) ?? null
          const revisionRequest = revisionRequestByShotId.get(shotId) ?? null
          const revisionRun = revisionRequest ? shotRevisionRunByRequestId.get(revisionRequest.id) ?? null : null
          const revisionStep = outputRunStepForNode(revisionRun, 'shot_revision_artifact')
          const revisionPlanStep = outputRunStepForNode(revisionRun, 'shot_revision_plan')
          const revisionImageStep = outputRunStepForNode(revisionRun, 'shot_keyframe_image')
          const revisionRunning = !completedRevision && (
            isOutputRunStepActive(revisionStep)
            || isOutputRunStepActive(revisionPlanStep)
            || isOutputRunStepActive(revisionImageStep)
            || sequenceAnimaticRequestIsActive(revisionRequest, revisionRun)
          )
          const revisionError = revisionStep?.status === 'failed'
            ? revisionStep.errorMessage ?? 'Shot revision failed.'
            : revisionImageStep?.status === 'failed'
              ? revisionImageStep.errorMessage ?? 'Shot keyframe generation failed.'
              : revisionPlanStep?.status === 'failed'
                ? revisionPlanStep.errorMessage ?? 'Shot rewrite failed.'
                : ''
          const completedPlannedKeyframe = completedPlannedKeyframeByShotId.get(shotId) ?? null
          const plannedKeyframeRequest = plannedKeyframeRequestByShotId.get(shotId) ?? null
          const plannedKeyframeRun = plannedKeyframeRequest ? plannedKeyframeRunByRequestId.get(plannedKeyframeRequest.id) ?? null : null
          const plannedKeyframeStep = outputRunStepForNode(plannedKeyframeRun, 'planned_keyframe_artifact')
          const plannedKeyframeImageStep = outputRunStepForNode(plannedKeyframeRun, 'planned_keyframe_image')
          const plannedKeyframeRunning = !completedPlannedKeyframe && (
            isOutputRunStepActive(plannedKeyframeStep)
            || isOutputRunStepActive(plannedKeyframeImageStep)
            || sequenceAnimaticRequestIsActive(plannedKeyframeRequest, plannedKeyframeRun)
          )
          const plannedKeyframeProgressLabel = plannedKeyframeRunning
            ? sequenceAnimaticShotKeyframeProgressLabel(plannedKeyframeRun)
            : ''
          const plannedKeyframeError = plannedKeyframeStep?.status === 'failed'
            ? plannedKeyframeStep.errorMessage ?? 'Shot keyframe failed.'
            : plannedKeyframeImageStep?.status === 'failed'
              ? plannedKeyframeImageStep.errorMessage ?? 'Shot keyframe image failed.'
              : ''
          const displayShot = completedRevision?.revisedShot ?? shot
          const shotReferences = filterSequenceAnimaticShotReferencesForShot(
            buildSequenceAnimaticShotReferences(displayShot, resolveReference),
            shotId,
            continuityAnchorById,
          )
          const effectiveCoverageSetupId = coverageSetupIdForShot(displayShot)
          const coverageIntent = coverageIntentByShotId.get(shotId) ?? null
          const coverageIntentRunning = coverageIntentActiveShotIds.has(shotId)
          const coverageIntentFailed = coverageIntentFailedShotIds.has(shotId)
          const zoneCoverageCell = zoneCoverageCellByShotId.get(shotId) ?? null
          const zoneCoverageCellReady = Boolean(zoneCoverageCell?.assetKey)
          const zoneCoverageCellActiveStage = zoneCoverageActiveStageByShotId.get(shotId) ?? ''
          const zoneCoverageCellRunning = !zoneCoverageCellReady && Boolean(zoneCoverageCellActiveStage)
          const zoneCoverageCellFailed = !zoneCoverageCellReady && zoneCoverageFailedShotIds.has(shotId)
          const setupCoverageAnchor = coverageAnchorViews.find((anchor) => anchor.id && anchor.id === effectiveCoverageSetupId) ?? null
          const shotCoverageArtifact = coverageAnchorArtifactByShotId.get(shotId) ?? null
          const shotCoverageRun = shotProductionCoverageRunByShotId.get(shotId) ?? null
          const shotCoverageAnchor = setupCoverageAnchor
            ? {
              ...setupCoverageAnchor,
              status: shotCoverageRun
                ? 'generating' as const
                : shotCoverageArtifact?.assetKey
                  ? 'ready' as const
                  : setupCoverageAnchor.status,
              statusLabel: shotCoverageRun
                ? 'Generating anchor'
                : shotCoverageArtifact?.assetKey
                  ? 'Anchor ready'
                  : setupCoverageAnchor.statusLabel,
              assetKey: shotCoverageArtifact?.assetKey ?? setupCoverageAnchor.assetKey,
              assetUrl: shotCoverageArtifact?.assetUrl ?? setupCoverageAnchor.assetUrl,
              running: Boolean(shotCoverageRun) || setupCoverageAnchor.running,
            }
            : null
          const keyframeDependencyNodeIds = new Set([
            ...spatialBindingView.hierarchy.map((node) => node.id),
            ...shotReferences.map((reference) => reference.entityKey),
            shotCoverageAnchor?.setId,
            shotCoverageAnchor?.zoneId,
            shotCoverageAnchor?.primarySpotId,
            ...(shotCoverageAnchor?.spotIds ?? []),
            shotCoverageAnchor?.viewpointId,
          ].filter(Boolean))
          const keyframeDependencyTargets = continuityAssetTargets.filter((target) => (
            target.shotIds.includes(shotId) || keyframeDependencyNodeIds.has(target.nodeId)
          ))
          const keyframeDependencyRunning = keyframeDependencyTargets.some((target) => target.status === 'generating')
          const keyframeDependencyMissingCount = keyframeDependencyTargets.filter((target) => ['missing', 'stale', 'failed'].includes(target.status)).length
          const keyframeDependencyReadyCount = keyframeDependencyTargets.filter((target) => target.status === 'ready').length
          const sceneContinuityReadiness = sceneContinuityReadinessForShot({ manifests: sceneContinuityManifests, shot: displayShot, shotId })
          const sceneContinuityLabel = sceneContinuityReadinessLabel(sceneContinuityReadiness)
          const keyframeDependencyStatusLabel = plannedKeyframeProgressLabel
            || (keyframeDependencyRunning
            ? 'Generating keyframe refs'
            : keyframeDependencyMissingCount > 0
              ? `${keyframeDependencyMissingCount} keyframe ref${keyframeDependencyMissingCount === 1 ? '' : 's'} missing`
              : sceneContinuityLabel
                ? sceneContinuityLabel
              : keyframeDependencyTargets.length > 0
                ? `${keyframeDependencyReadyCount}/${keyframeDependencyTargets.length} keyframe refs ready`
                : 'Shot refs ready')
          const progressPreview = sequenceAnimaticShotProgressPreview({
            coverageAnchor: shotCoverageAnchor,
            dependencyTargets: keyframeDependencyTargets,
            spatialBindingView,
          })
          const coveragePanelAssetKey = zoneCoverageCell?.assetKey ?? shotCoverageAnchor?.assetKey ?? null
          const coveragePanelUrl = zoneCoverageCell?.assetUrl ?? shotCoverageAnchor?.assetUrl ?? null
          const displayPanelAssetKey = completedRevision?.keyframeAssetKey
            ?? completedPlannedKeyframe?.keyframeAssetKey
            ?? previewAssetKey
            ?? coveragePanelAssetKey
            ?? progressPreview.assetKey
          const displayPanelUrl = completedRevision?.keyframeUrl
            ?? completedPlannedKeyframe?.keyframeUrl
            ?? panelUrl
            ?? coveragePanelUrl
            ?? progressPreview.assetUrl
          const panelProgressRunning = coverageIntentRunning || Boolean(shotCoverageAnchor?.running) || zoneCoverageCellRunning || keyframeDependencyRunning
          return {
            id: shotId,
            index: typeof shot.index === 'number' ? shot.index : shotIndex + 1,
            title: trimOptionalString(shot.title) || `Shot ${shotIndex + 1}`,
            isProvisional: shotIsProvisional(shot),
            sourceScriptShotIds: readLooseArray(shot.sourceScriptShotIds ?? shot.source_script_shot_ids ?? shot.sourceAnchorIds ?? shot.source_anchor_ids).map(trimOptionalString).filter(Boolean),
            timeLabel: projectionShot
              ? formatAnimaticTimeRange(projectionShot.startSeconds, projectionShot.endSeconds)
              : 'Timing pending',
            durationLabel: formatAnimaticSeconds(shot.editorialDurationSeconds ?? shot.durationSeconds),
            action: trimOptionalString(displayShot.action) || trimOptionalString(displayShot.description) || trimOptionalString(displayShot.storyboardPanelPrompt),
            dialogue: buildSequenceAnimaticDialogueLines(displayShot, resolveReference),
            camera: cameraLineFromShot(displayShot),
            lighting: trimOptionalString(displayShot.lighting),
            performance: performanceLineFromShot(displayShot),
            performanceBeats: buildSequenceAnimaticPerformanceBeats(displayShot, resolveReference),
            coverageSetupId: effectiveCoverageSetupId,
            coverageSetupLabel: coverageSetupLabel(displayShot),
            coverageSetupDetail: coverageSetupDetail(displayShot),
            coverageIntent,
            coverageIntentRunning,
            coverageIntentFailed,
            zoneCoverageCell,
            zoneCoverageCellRunning,
            zoneCoverageCellActiveStage,
            zoneCoverageCellFailed,
            spatialContinuityLabel: spatialBindingView.compactLabel || shotBindingLabels.label,
            spatialContinuityDetail: spatialBindingView.detailLabel || shotBindingLabels.detail,
            spatialBindingView,
            panelStatusLabel: directorPlanStreamingPreview
              ? 'Planning'
              : completedRevision?.keyframeAssetKey
                ? 'Revised keyframe ready'
                : completedPlannedKeyframe?.keyframeAssetKey
                  ? 'Keyframe ready'
                  : plannedKeyframeRunning
                    ? plannedKeyframeProgressLabel || 'Generating keyframe'
                    : coverageIntentRunning
                      ? 'Planning coverage'
                    : shotCoverageAnchor?.running
                      ? 'Generating coverage anchor'
                    : zoneCoverageCellRunning
                      ? zoneCoverageCellActiveStage === 'extract' ? 'Extracting coverage grid cell' : 'Generating coverage grid'
                    : coverageIntent
                      ? 'Coverage direction ready'
                    : keyframeDependencyRunning
                          ? 'Generating keyframe refs'
                          : previewAssetKey
                            ? 'Storyboard keyframe ready'
                          : zoneCoverageCell?.assetKey
                            ? 'Coverage grid cell ready'
                            : progressPreview.assetKey
                              ? progressPreview.statusLabel
                              : panelStep?.status === 'failed' ? 'Panel extraction failed' : 'Panel not generated',
            panelError: plannedKeyframeError || (panelStep?.status === 'failed' ? panelStep.errorMessage ?? '' : ''),
            panelAssetKey: displayPanelAssetKey,
            panelUrl: displayPanelUrl,
            panelRunning: plannedKeyframeRunning || panelProgressRunning,
            keyframeStatusLabel: completedRevision?.keyframeAssetKey
              ? 'Revised keyframe ready'
                  : completedPlannedKeyframe?.keyframeAssetKey
                    ? 'Keyframe ready'
                  : plannedKeyframeRunning
                    ? plannedKeyframeProgressLabel || 'Generating keyframe'
                    : previewAssetKey
                      ? 'Storyboard keyframe ready'
                  : keyframeDependencyRunning
                    ? 'Generating keyframe refs'
                    : sceneContinuityLabel
                      ? sceneContinuityLabel
                    : keyframeDependencyMissingCount > 0
                      ? 'Preparing keyframe refs'
                  : plannedKeyframeRequest
                    ? 'Keyframe queued'
                    : 'Keyframe not generated',
            keyframeDependencyStatusLabel,
            keyframeProgressLabel: plannedKeyframeProgressLabel,
            keyframeDependencyRunning,
            keyframeDependencyMissingCount,
            keyframeRequestId: plannedKeyframeRequest?.id ?? null,
            keyframeWorkflowId: plannedKeyframeRequest?.workflowId ?? null,
            keyframeDependencyMode: trimOptionalString(readLooseRecord(plannedKeyframeRequest?.metadata).dependencyMode),
            keyframeGraphPolicyVersion: trimOptionalString(readLooseRecord(plannedKeyframeRequest?.metadata).shotGraphPolicyVersion),
            keyframeRunning: plannedKeyframeRunning,
            keyframeError: plannedKeyframeError,
            isRevised: Boolean(completedRevision),
            originalAction: trimOptionalString(shot.action) || trimOptionalString(shot.description) || trimOptionalString(shot.storyboardPanelPrompt),
            originalCamera: cameraLineFromShot(shot),
            originalLighting: trimOptionalString(shot.lighting),
            revisionRequestId: revisionRequest?.id ?? null,
            revisionWorkflowId: revisionRequest?.workflowId ?? null,
            revisionRunId: revisionRun?.id ?? null,
            revisionRunning,
            revisionError,
            revisionPrompt: trimOptionalString(readLooseRecord(revisionRequest?.metadata).revisionPrompt) || trimOptionalString(completedRevision?.revision.prompt),
            revisionSummary: trimOptionalString(completedRevision?.revision.changeSummary),
            references: shotReferences,
            continuityAnchorsPending: false,
            shotVideoRequestId: null,
            shotVideoWorkflowId: null,
            shotVideoRunId: null,
            shotVideoReady: false,
            shotVideoRunning: false,
            shotVideoUrl: null,
            shotVideoProgressLabel: directorPlanStreamingPreview
              ? 'Final shot continuity artifact required'
              : previewAssetKey ? 'Ready for shot video' : 'Panel required',
            shotVideoError: '',
          }
        }),
      }]
      : scriptShotProjection.scriptShotStatus === 'ready'
        ? scriptShotProjection.scriptBlocks.map((scriptBlock, blockIndex): SequenceAnimaticBlockView => {
          const blockShots = scriptBlock.shotIds
            .map((shotId) => scriptShotById.get(shotId) ?? null)
            .filter((shot): shot is (typeof scriptShotProjection.scriptShots)[number] => Boolean(shot))
          return {
            id: scriptBlock.id,
            index: scriptBlock.index ?? blockIndex + 1,
            title: scriptBlock.title || `Screenplay block ${blockIndex + 1}`,
            isProvisional: true,
            plannedShotIds: scriptBlock.shotIds,
            durationLabel: formatAnimaticSeconds(scriptBlock.approximateDurationSeconds),
            statusLabel: directorPlanRunning ? 'Building shot continuity plan' : 'Screenplay shots ready',
            shotRangeLabel: blockShots.length > 0 ? `Shots ${blockShots[0]?.id}-${blockShots[blockShots.length - 1]?.id}` : 'Shots pending',
            childRequestId: null,
            childWorkflowId: null,
            childRunId: null,
            readyToRun: false,
            promptNodeKey: '',
            sheetNodeKey: '',
            panelExtractNodeKey: '',
            videoPromptNodeKey: '',
            videoNodeKey: '',
            failedNodeLabel: '',
            hasPanels: false,
            storyboardReady: false,
            storyboardRunning: false,
            storyboardProgressLabel: 'Director plan required',
            storyboardContinuityMode: 'provisional',
            storyboardContinuityLabel: 'Provisional: prepare Scene Board for stronger location continuity',
            storyboardContinuityBlockers: [],
            storyboardContinuityStale: false,
            videoPromptReady: false,
            videoReady: false,
            videoRunning: false,
            videoAssetKey: null,
            videoUrl: null,
            videoProgressLabel: 'Director plan required',
            videoError: '',
            continuityAnchors: [],
            continuityAnchorCountLabel: 'Refs pending',
            continuityAnchorsPending: true,
            continuityChanged: false,
            continuityBlockStatus: 'not_started',
            continuityBlockStatusLabel: 'Continuity pending',
            continuityBlockActionLabel: 'Director plan required',
            continuityBlockWarnings: [],
            continuityBlockError: '',
            continuityAssetTargets: [],
            continuityAssetCountLabel: 'Assets pending',
            shots: blockShots.map((shot, shotIndex): SequenceAnimaticShotView => ({
              id: shot.id,
              index: shot.index ?? shotIndex + 1,
              title: shot.title || `Shot ${shotIndex + 1}`,
              isProvisional: true,
              sourceScriptShotIds: [shot.id],
              timeLabel: 'Director timing pending',
              durationLabel: formatAnimaticSeconds(shot.approximateDurationSeconds),
              action: shot.screenplayText || shot.title,
              dialogue: [],
              camera: 'Director plan pending',
              lighting: '',
              performance: '',
              performanceBeats: [],
              coverageSetupId: '',
              coverageSetupLabel: '',
              coverageSetupDetail: '',
              coverageIntent: null,
              coverageIntentRunning: false,
              coverageIntentFailed: false,
              zoneCoverageCell: null,
              zoneCoverageCellRunning: false,
              zoneCoverageCellActiveStage: '',
              zoneCoverageCellFailed: false,
              spatialContinuityLabel: 'Refs pending',
              spatialContinuityDetail: 'Director plan will assign world refs, scene graph nodes, and shot continuity.',
              spatialBindingView: {
                title: 'Spatial binding pending',
                compactLabel: 'Refs pending',
                detailLabel: 'Director plan will assign world refs, scene graph nodes, and shot continuity.',
                statusLabel: 'No scene binding recorded',
                hierarchy: [],
                selectedNode: null,
                assetTargetNodeId: null,
              },
              panelStatusLabel: 'Director plan pending',
              panelError: '',
              panelAssetKey: null,
              panelUrl: null,
              panelRunning: false,
              keyframeStatusLabel: 'Keyframe pending',
              keyframeDependencyStatusLabel: 'Shot continuity pending',
              keyframeProgressLabel: '',
              keyframeDependencyRunning: false,
              keyframeDependencyMissingCount: 0,
              keyframeRequestId: null,
              keyframeWorkflowId: null,
              keyframeDependencyMode: '',
              keyframeGraphPolicyVersion: '',
              keyframeRunning: false,
              keyframeError: '',
              isRevised: false,
              originalAction: shot.screenplayText || shot.title,
              originalCamera: '',
              originalLighting: '',
              revisionRequestId: null,
              revisionWorkflowId: null,
              revisionRunId: null,
              revisionRunning: false,
              revisionError: '',
              revisionPrompt: '',
              revisionSummary: '',
              references: [],
              continuityAnchorsPending: true,
              shotVideoRequestId: null,
              shotVideoWorkflowId: null,
              shotVideoRunId: null,
              shotVideoReady: false,
              shotVideoRunning: false,
              shotVideoUrl: null,
              shotVideoProgressLabel: 'Storyboard panel required',
              shotVideoError: '',
            })),
          }
        })
        : []
  return {
    request: input.request,
    continuityRequest,
    continuityRun,
    continuityReady,
    continuityRunning,
    continuityStale,
    continuityFailed,
    continuityError,
    continuityButtonLabel,
    continuityStatusLabel,
    continuityGraphStatus,
    continuityStructureActionLabel,
    continuityStructureStatusLabel,
    continuityCoverageLabel,
    continuityStructureRunning,
    continuityAssetGenerationStatus,
    assetPack: manifestAssetPack,
    continuityAssetTargets,
    continuityGraphView,
    title: trimOptionalString(fallbackScreenplay?.title) || input.request.title || 'Sequence screenplay animatic',
    statusLabel: input.row?.statusLabel ?? summarizeOutputStatus(input.request.status),
    progressLabel: input.row?.progress.label ?? '',
    currentStepLabel: isActive
      ? activeMasterStepLabel || sequenceAnimaticFriendlyProgressLabel(input.row?.currentStepLabel ?? '', masterProjectionActiveNodeKey)
      : '',
    directorPlanReady: directorPlanFinalReady,
    directorPlanStatusLabel: directorPlanFinalReady
      ? `${directorShots.length} shot-continuity shot${directorShots.length === 1 ? '' : 's'}`
      : directorPlanStreamingPreview
        ? `${directorShots.length} shot${directorShots.length === 1 ? '' : 's'} streamed; planning continues`
      : outputRunStepForNode(input.run, 'sequence_animatic_director_plan')?.status === 'failed'
        ? 'Shot continuity plan failed'
        : scriptShotProjection.scriptShotStatus === 'ready' && (isActive || directorPlanRunning)
          ? 'Building shot continuity plan'
        : scriptShotProjection.scriptShotStatus === 'ready'
          ? 'Screenplay shots ready'
        : isActive
          ? 'Building shot continuity plan'
          : 'Shot continuity plan not generated',
    directorPlanShotCount: directorShots.length,
    orchestrationStatusLabel: activeStoryboardChild
      ? `Generating ${activeStoryboardChild.title}`
      : childRequests.length > 0 && readyStoryboardChildCount >= childRequests.length
        ? `${childRequests.length} storyboard block${childRequests.length === 1 ? '' : 's'} ready`
        : childRequests.length > 0
          ? `${readyStoryboardChildCount}/${childRequests.length} storyboard blocks ready`
          : directorPlanFinalReady
            ? 'Storyboard blocks queueing'
            : directorPlanStreamingPreview || directorPlanStreamStatus === 'streaming'
              ? 'Waiting for final shot continuity plan'
            : scriptShotProjection.scriptShotStatus === 'ready'
              ? 'Waiting for shot continuity plan'
            : 'Storyboard orchestration pending',
    screenplayMarkdown: trimOptionalString(fallbackScreenplay?.screenplayMarkdown) || trimOptionalString(fallbackScreenplay?.markdown) || input.request.prompt,
    continuityAnchors: {
      characters: continuityAnchorViews.filter((anchor) => anchor.type === 'character'),
      props: continuityAnchorViews.filter((anchor) => anchor.type === 'prop'),
      locationSpots: continuityAnchorViews.filter((anchor) => anchor.type === 'location_spot'),
    },
    coverageAnchors: coverageAnchorViews,
    zoneCoverageBoards,
    zoneCoverageCellByShotId,
    zoneCoverageActiveShotIds,
    zoneCoverageFailedShotIds,
    coverageIntentByShotId,
    coverageIntentActiveShotIds,
    coverageIntentFailedShotIds,
    continuityLocationSets,
    continuityLocationAngles,
    continuityRejectedCandidates,
    blocks,
    scenes: buildSequenceAnimaticSceneViews({
      sequenceState: input.sequenceState,
      requests: input.requests,
      masterRequestId: input.request.id,
      blocks,
    }),
    hasPanels: panels.length > 0,
    keyframeReadyCount,
    keyframeTotalCount,
    keyframeRunning,
    keyframeProgressLabel,
  }
}
