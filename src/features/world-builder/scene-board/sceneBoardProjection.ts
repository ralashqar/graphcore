import type { OutputRequest } from '../../../domain/outputWorkflow'
import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'

type LooseRecord = Record<string, unknown>
export type SequenceAnimaticContinuityGraphNodeKind = 'world_location' | 'set' | 'zone' | 'spot' | 'viewpoint' | 'angle' | 'coverage_anchor' | 'temp_character' | 'prop' | 'faction' | 'vehicle' | 'group'
export type SequenceAnimaticContinuityAssetTargetView = LooseRecord & { nodeId: string; name: string; assetKind: string; status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed'; statusLabel: string; actionLabel: string; assetKey: string | null; assetUrl: string | null; blockIds: string[]; shotIds: string[] }
export type SequenceAnimaticContinuityGraphNodeView = LooseRecord & { id: string; kind: SequenceAnimaticContinuityGraphNodeKind; label: string; kindLabel: string; lane?: string; parentId?: string | null; shotIds: string[]; blockIds: string[]; assetStatus?: 'missing' | 'generating' | 'ready' | 'stale' | 'failed' | 'not_required'; assetUrl?: string | null; assetStatusLabel?: string; baseVisualBrief?: string; overrideVisualBrief?: string; extraPromptDirection?: string; summary?: string }
export type SequenceAnimaticContinuityAssetBatchKind =
  | 'location_zone_board'
  | 'angle_grid'
  | 'viewpoint_grid'
  | 'spot_grid'
  | 'zone_spatial_map'
  | 'spot_atlas_grid'
  | 'viewpoint_atlas_grid'
  | 'temp_character_grid'
  | 'prop_grid'
  | 'single_hero_ref'

export type SequenceAnimaticContinuityAssetRunGroup = {
  targets: SequenceAnimaticContinuityAssetTargetView[]
  isBatch: boolean
  batchKind?: SequenceAnimaticContinuityAssetBatchKind
  parentNodeId?: string | null
}
export type SequenceAnimaticSceneView = LooseRecord & { id: string; index: number; title: string; status: 'pending' | 'planning' | 'ready' | 'failed' | string }
export type SequenceAnimaticBlockView = LooseRecord & { id: string; title: string; shots: SequenceAnimaticShotView[] }
export type SequenceAnimaticCoverageAnchorView = LooseRecord & { id: string; setId: string; zoneId: string; primarySpotId: string; spotIds: string[]; viewpointId: string; status: string; statusLabel: string; assetUrl: string | null; assetKey?: string | null; running?: boolean; stagingBrief?: string }
export type SequenceAnimaticShotView = LooseRecord & { id: string; index: number; title: string; action: string; camera: string; lighting: string; performance: string; isProvisional: boolean; coverageSetupId: string; coverageSetupLabel: string; coverageIntent: null | { coverageIntent?: string; stagingBrief?: string }; coverageIntentRunning: boolean; coverageIntentFailed: boolean; zoneCoverageCell: null | { assetKey?: string | null; assetUrl?: string | null }; zoneCoverageCellRunning: boolean; zoneCoverageCellActiveStage: 'queued' | 'image' | 'extract' | ''; zoneCoverageCellFailed: boolean; spatialBindingView: { hierarchy: Array<{ id: string; label: string; kind: string; assetUrl?: string | null; assetStatusLabel?: string }>; selectedNode: null | { id: string; kind: string } }; panelStatusLabel: string; panelError: string; panelUrl: string | null; panelRunning: boolean; keyframeStatusLabel: string; keyframeDependencyStatusLabel: string; keyframeDependencyRunning: boolean; keyframeDependencyMissingCount: number; keyframeRunning: boolean }
export type SequenceAnimaticViewModel = LooseRecord & { request: OutputRequest; title: string; scenes: SequenceAnimaticSceneView[]; blocks: SequenceAnimaticBlockView[]; continuityGraphView: { nodes: SequenceAnimaticContinuityGraphNodeView[] }; continuityAssetTargets: SequenceAnimaticContinuityAssetTargetView[]; coverageAnchors: SequenceAnimaticCoverageAnchorView[] }

function trimOptionalString(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function readLooseRecord(value: unknown): LooseRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {} }
function readLooseArray(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function requestUpdatedAtMs(request: OutputRequest) { return Date.parse(request.updatedAt || request.createdAt || '') || 0 }
function readOutputRequestWorkflowCommand(request: OutputRequest) {
  const metadata = readLooseRecord(request.metadata)
  return readLooseRecord(metadata.command ?? metadata.sceneBoardCommand ?? metadata.scene_board_command)
}
function readOutputRequestScreenplayAnimaticRole(request: OutputRequest) {
  const metadata = readLooseRecord(request.metadata)
  return trimOptionalString(metadata.screenplayAnimaticRole) || trimOptionalString(metadata.sequenceAnimaticRole)
}
function sequenceAnimaticSceneIdFromShotId(shotId: string) { return /^(.+)_shot_\d+/.exec(shotId)?.[1] ?? '' }
function sequenceAnimaticBlockSceneId(block: { id: string; shots: ReadonlyArray<{ id: string }> }) { for (const shot of block.shots) { const sceneId = sequenceAnimaticSceneIdFromShotId(shot.id); if (sceneId) return sceneId } return /^(.+)_block_\d+/.exec(block.id)?.[1] ?? '' }
function sequenceAnimaticBlocksForScene(model: Pick<SequenceAnimaticViewModel, 'blocks'>, scene: SequenceAnimaticSceneView) { return model.blocks.filter((block) => { const sceneId = sequenceAnimaticBlockSceneId(block); return !sceneId || sceneId === scene.id }) }
function sequenceAnimaticShotCanGenerateEarlyKeyframe(shot: SequenceAnimaticShotView) { return Boolean(shot.spatialBindingView?.hierarchy?.length) }

export type SequenceAnimaticSceneBoardFilter = 'all' | 'needs_coverage' | 'needs_keyframe' | 'failed'
export type SequenceAnimaticSceneBoardGrouping = 'zone_spot' | 'shot_order'

export type SequenceAnimaticSceneBoardShotTile = {
  id: string
  blockId: string
  blockTitle: string
  block: SequenceAnimaticBlockView
  shot: SequenceAnimaticShotView
  coverageAnchor: SequenceAnimaticCoverageAnchorView | null
  thumbnailUrl: string | null
  thumbnailStatusLabel: string
  spatialPath: string
  setId: string
  zoneId: string
  spotId: string
  spatialNodeIds: string[]
  authoringNodeId: string | null
  authoringNodeKind: SequenceAnimaticContinuityGraphNodeKind | null
  coverageReady: boolean
  coverageIntentReady: boolean
  coverageIntentRunning: boolean
  coverageIntentFailed: boolean
  keyframeReady: boolean
  running: boolean
  failed: boolean
  blockedReasons: string[]
}

export function sequenceAnimaticSceneBoardShotSnapshot(tile: SequenceAnimaticSceneBoardShotTile, scene: SequenceAnimaticSceneView) {
  const hierarchyByKind = new Map(tile.shot.spatialBindingView.hierarchy.map((node) => [node.kind, node] as const))
  const setNode = hierarchyByKind.get('set') ?? null
  const zoneNode = hierarchyByKind.get('zone') ?? null
  const spotNode = hierarchyByKind.get('spot') ?? null
  const viewpointNode = hierarchyByKind.get('viewpoint') ?? hierarchyByKind.get('angle') ?? null
  const setId = trimOptionalString(tile.setId) || trimOptionalString(setNode?.id)
  const zoneId = trimOptionalString(tile.zoneId) || trimOptionalString(zoneNode?.id)
  const primarySpotId = trimOptionalString(tile.spotId) || trimOptionalString(spotNode?.id)
  return {
    id: tile.shot.id,
    index: tile.shot.index,
    title: tile.shot.title,
    action: tile.shot.action,
    camera: {
      framing: tile.shot.camera,
      summary: tile.shot.camera,
    },
    lighting: tile.shot.lighting,
    performance: tile.shot.performance,
    coverageIntent: tile.shot.coverageIntent?.coverageIntent || '',
    sourceSceneId: scene.id,
    sourceSceneTitle: scene.title,
    sceneId: scene.id,
    blockId: tile.blockId,
    storyboardBlockId: tile.blockId,
    sceneBinding: {
      sceneId: scene.id,
      setId,
      setName: trimOptionalString(setNode?.label),
      zoneId,
      zoneName: trimOptionalString(zoneNode?.label),
      primarySpotId,
      primarySpotName: trimOptionalString(spotNode?.label),
      spotIds: primarySpotId ? [primarySpotId] : [],
      viewpointId: trimOptionalString(viewpointNode?.id),
    },
  }
}

export type SequenceAnimaticSceneBoardReferenceStageKey = 'set_refs' | 'zone_refs' | 'spot_refs'
export type SequenceAnimaticSceneBoardPrepStageKey = 'set_refs' | 'scaffold_refs' | 'coverage_directions' | 'coverage_grids' | 'keyframes'
export type SequenceAnimaticSceneBoardPrepUnitStage = 'set_refs' | 'scaffold_refs' | 'coverage_directions' | 'coverage_grids' | 'ready' | 'blocked' | 'failed'

export type SequenceAnimaticSceneBoardPrepStage = {
  key: SequenceAnimaticSceneBoardPrepStageKey
  label: string
  total: number
  ready: number
  missing: number
  generating: number
  failed: number
  blocked: number
}

export type SequenceAnimaticSceneBoardReferenceTile = {
  nodeId: string
  nodeKind: SequenceAnimaticContinuityGraphNodeKind
  label: string
  kindLabel: string
  stage: SequenceAnimaticSceneBoardReferenceStageKey
  status: SequenceAnimaticContinuityAssetTargetView['status'] | 'not_required'
  statusLabel: string
  assetUrl: string | null
  usageCount: number
  running: boolean
  target: SequenceAnimaticContinuityAssetTargetView | null
  blockedReasons: string[]
}

export type SequenceAnimaticSceneBoardPrepUnit = {
  id: string
  title: string
  subtitle: string
  setId: string
  zoneId: string
  scopeNodeId: string | null
  referenceTiles: SequenceAnimaticSceneBoardReferenceTile[]
  shots: SequenceAnimaticSceneBoardShotTile[]
  setTargets: SequenceAnimaticContinuityAssetTargetView[]
  scaffoldGroups: SequenceAnimaticContinuityAssetRunGroup[]
  coverageGridPlanCount: number
  coverageGridShotCount: number
  coverageIntentMissingCount: number
  coverageIntentReadyCount: number
  missingCoverageCount: number
  blockedReasons: string[]
  stage: SequenceAnimaticSceneBoardPrepUnitStage
  stageLabel: string
}

export type SequenceAnimaticSceneBoardPrepRunState = {
  runKey: string
  runId: string
  sceneId: string
  setId: string | null
  zoneId: string | null
  scopeNodeId: string | null
  activeUnitId: string | null
  activeUnitLabel: string
  stage: SequenceAnimaticSceneBoardPrepStageKey | 'complete' | 'failed'
  stageLabel: string
  message: string
  queued: number
  running: number
  ready: number
  failed: number
  activeReferenceNodeIds: string[]
  activeCoverageShotIds: string[]
  activeRequestIds: string[]
  activeRunIds: string[]
  activeRunStepKey: string
  startedAt: number
  updatedAt: number
  error: string
}

export function sequenceAnimaticSceneBoardPrepStageFromWorkflowProgress(progress: WorkflowProgressViewModel): SequenceAnimaticSceneBoardPrepRunState['stage'] {
  const key = `${progress.activeNodeKey} ${progress.activeManifestPurpose} ${progress.activeProgressLabel}`.toLowerCase()
  if (progress.status === 'failed' || progress.status === 'cancelled' || progress.failedSteps > 0) return 'failed'
  if (progress.status === 'completed' || progress.status === 'completed_with_errors') return 'complete'
  if (key.includes('coverage_grid') || key.includes('zone_coverage')) return 'coverage_grids'
  if (key.includes('coverage_intent') || key.includes('coverage direction')) return 'coverage_directions'
  if (key.includes('scaffold') || key.includes('zone map') || key.includes('spot atlas')) return 'scaffold_refs'
  return 'set_refs'
}

export function sequenceAnimaticSceneBoardPrepMessageFromWorkflowProgress(progress: WorkflowProgressViewModel) {
  if (progress.latestError) return progress.latestError
  if (progress.recoveryHints[0]) return progress.recoveryHints[0]
  if (progress.activeChildRequestIds.length > 0) return `${progress.activeChildRequestIds.length} child workflow${progress.activeChildRequestIds.length === 1 ? '' : 's'} active.`
  return progress.activeProgressLabel || progress.activeNodeLabel || progress.title
}

export function sequenceAnimaticSceneBoardPrepRunFromWorkflowProgress(input: {
  progress: WorkflowProgressViewModel
  runKey: string
  scene: SequenceAnimaticSceneView
  scopeNodeId?: string | null
  activeCoverageShotIds?: readonly string[]
  now?: number
}): SequenceAnimaticSceneBoardPrepRunState {
  const stage = sequenceAnimaticSceneBoardPrepStageFromWorkflowProgress(input.progress)
  const timestamp = input.now ?? Date.now()
  const activeCoverageShotIds = stage === 'coverage_directions' || stage === 'coverage_grids'
    ? [...new Set((input.activeCoverageShotIds ?? []).map(trimOptionalString).filter(Boolean))]
    : []
  return {
    runKey: input.runKey,
    runId: input.progress.latestRunId || input.progress.requestId || input.runKey,
    sceneId: input.scene.id,
    setId: null,
    zoneId: null,
    scopeNodeId: input.scopeNodeId || null,
    activeUnitId: input.scopeNodeId || null,
    activeUnitLabel: input.scene.title,
    stage,
    stageLabel: stage === 'complete'
      ? 'Ready for keyframes'
      : input.progress.activeProgressLabel || input.progress.activeNodeLabel || input.progress.title,
    message: sequenceAnimaticSceneBoardPrepMessageFromWorkflowProgress(input.progress),
    queued: input.progress.queuedSteps,
    running: input.progress.runningSteps + input.progress.activeChildRequestIds.length,
    ready: input.progress.completedSteps || input.progress.readyArtifactCount,
    failed: input.progress.failedSteps,
    activeReferenceNodeIds: [],
    activeCoverageShotIds,
    activeRequestIds: input.progress.activeChildRequestIds.length > 0
      ? input.progress.activeChildRequestIds
      : input.progress.requestId ? [input.progress.requestId] : [],
    activeRunIds: input.progress.activeChildRunIds.length > 0
      ? input.progress.activeChildRunIds
      : input.progress.latestRunId ? [input.progress.latestRunId] : [],
    activeRunStepKey: input.progress.activeNodeKey,
    startedAt: timestamp,
    updatedAt: timestamp,
    error: input.progress.latestError,
  }
}

export function sequenceAnimaticSceneBoardPrepRunKey(input: {
  masterRequestId: string
  sceneId: string
  setId?: string | null
  zoneId?: string | null
  scopeNodeId?: string | null
  shotIds?: readonly string[]
}) {
  const scope = trimOptionalString(input.scopeNodeId) || trimOptionalString(input.zoneId) || trimOptionalString(input.setId) || 'scene'
  const shots = [...new Set((input.shotIds ?? []).map(trimOptionalString).filter(Boolean))].sort().join(',')
  return `${input.masterRequestId}:${input.sceneId}:${scope}:${shots}`
}

export function sequenceAnimaticSceneBoardPrepRunFromRecord(value: unknown): SequenceAnimaticSceneBoardPrepRunState | null {
  const record = readLooseRecord(value)
  const runKey = trimOptionalString(record.runKey)
  const runId = trimOptionalString(record.runId)
  const sceneId = trimOptionalString(record.sceneId)
  if (!runKey || !runId || !sceneId) return null
  const stage = trimOptionalString(record.stage) as SequenceAnimaticSceneBoardPrepRunState['stage']
  const validStage = stage === 'set_refs'
    || stage === 'scaffold_refs'
    || stage === 'coverage_directions'
    || stage === 'coverage_grids'
    || stage === 'complete'
    || stage === 'failed'
    ? stage
    : 'set_refs'
  const startedMs = Date.parse(trimOptionalString(record.startedAt))
  const updatedMs = Date.parse(trimOptionalString(record.updatedAt))
  return {
    runKey,
    runId,
    sceneId,
    setId: trimOptionalString(record.setId) || null,
    zoneId: trimOptionalString(record.zoneId) || null,
    scopeNodeId: trimOptionalString(record.scopeNodeId) || null,
    activeUnitId: trimOptionalString(record.activeUnitId) || null,
    activeUnitLabel: trimOptionalString(record.activeUnitLabel),
    stage: validStage,
    stageLabel: trimOptionalString(record.stageLabel) || sequenceAnimaticSceneBoardPrepStageLabel(validStage === 'complete' || validStage === 'failed' ? 'coverage_grids' : validStage),
    message: trimOptionalString(record.message),
    queued: Math.max(0, Math.floor(Number(record.queued) || 0)),
    running: Math.max(0, Math.floor(Number(record.running) || 0)),
    ready: Math.max(0, Math.floor(Number(record.ready) || 0)),
    failed: Math.max(0, Math.floor(Number(record.failed) || 0)),
    activeReferenceNodeIds: readLooseArray(record.activeReferenceNodeIds).map(trimOptionalString).filter(Boolean),
    activeCoverageShotIds: readLooseArray(record.activeCoverageShotIds).map(trimOptionalString).filter(Boolean),
    activeRequestIds: readLooseArray(record.activeRequestIds).map(trimOptionalString).filter(Boolean),
    activeRunIds: readLooseArray(record.activeRunIds).map(trimOptionalString).filter(Boolean),
    activeRunStepKey: trimOptionalString(record.activeRunStepKey),
    startedAt: Number.isFinite(startedMs) ? startedMs : Date.now(),
    updatedAt: Number.isFinite(updatedMs) ? updatedMs : Date.now(),
    error: trimOptionalString(record.error),
  }
}

export function sequenceAnimaticSceneBoardPrepRunsFromRequest(request: OutputRequest | null | undefined) {
  const metadata = readLooseRecord(request?.metadata)
  return readLooseRecord(metadata.sequenceAnimaticSceneBoardPrepRuns ?? metadata.sequence_animatic_scene_board_prep_runs)
}

export function sequenceAnimaticSceneBoardPrepRunForScope(input: {
  request: OutputRequest | null | undefined
  runKey: string
}) {
  const runs = sequenceAnimaticSceneBoardPrepRunsFromRequest(input.request)
  return Object.values(runs)
    .map(sequenceAnimaticSceneBoardPrepRunFromRecord)
    .filter((run): run is SequenceAnimaticSceneBoardPrepRunState => Boolean(run && run.runKey === input.runKey))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
}

export function sceneBoardPrepRequestMatchesScope(request: OutputRequest, input: {
  masterRequestId: string
  sceneId: string
  scopeNodeId?: string | null
}) {
  const masterRequestId = trimOptionalString(input.masterRequestId)
  const sceneId = trimOptionalString(input.sceneId)
  if (!masterRequestId || !sceneId) return false
  if (request.parentRequestId !== masterRequestId) return false
  if (readOutputRequestScreenplayAnimaticRole(request) !== 'scene_board_prep') return false
  const metadata = readLooseRecord(request.metadata)
  const command = readOutputRequestWorkflowCommand(request)
  const requestSceneId = trimOptionalString(metadata.sceneId) || trimOptionalString(command.sceneId)
  if (requestSceneId !== sceneId) return false
  const requestedScope = trimOptionalString(input.scopeNodeId)
  const requestScope = trimOptionalString(metadata.scopeNodeId) || trimOptionalString(command.scopeNodeId)
  const requestZone = trimOptionalString(metadata.zoneId) || trimOptionalString(command.zoneId)
  const requestSet = trimOptionalString(metadata.setId) || trimOptionalString(command.setId)
  if (!requestedScope || requestedScope === 'all') return !requestScope || requestScope === 'all'
  return requestScope === requestedScope || requestZone === requestedScope || requestSet === requestedScope
}

export function sequenceAnimaticSceneBoardPrepRequestIdFromRun(input: {
  masterRequestId: string
  prepRun: unknown
}) {
  const masterRequestId = trimOptionalString(input.masterRequestId)
  if (!masterRequestId) return ''
  const record = readLooseRecord(input.prepRun)
  const runKey = trimOptionalString(record.runKey)
  if (!runKey.startsWith(`${masterRequestId}:`)) return ''
  return trimOptionalString(record.graphNativePrepRequestId)
}

export function sequenceAnimaticSceneBoardPrepRequestForScope(input: {
  requests: readonly OutputRequest[]
  masterRequestId: string
  sceneId: string | null | undefined
  scopeNodeId?: string | null
  prepRun?: unknown
}) {
  const masterRequestId = trimOptionalString(input.masterRequestId)
  const sceneId = trimOptionalString(input.sceneId)
  if (!masterRequestId || !sceneId) return null
  const matchingPrepRequests = input.requests
    .filter((request) => sceneBoardPrepRequestMatchesScope(request, {
      masterRequestId,
      sceneId,
      scopeNodeId: input.scopeNodeId,
    }))
    .sort((left, right) => requestUpdatedAtMs(right) - requestUpdatedAtMs(left))
  if (matchingPrepRequests[0]) return matchingPrepRequests[0]
  const fallbackRequestId = sequenceAnimaticSceneBoardPrepRequestIdFromRun({
    masterRequestId,
    prepRun: input.prepRun,
  })
  return fallbackRequestId
    ? input.requests.find((request) => request.id === fallbackRequestId) ?? null
    : null
}

export type SequenceAnimaticSceneBoardGroup = {
  id: string
  title: string
  subtitle: string
  setId: string
  zoneId: string
  spotId: string
  authoringNodeId: string | null
  authoringNodeKind: SequenceAnimaticContinuityGraphNodeKind | null
  referenceTiles: SequenceAnimaticSceneBoardReferenceTile[]
  shots: SequenceAnimaticSceneBoardShotTile[]
  readyCount: number
  missingCoverageCount: number
  missingKeyframeCount: number
  failedCount: number
  blockedReasons: string[]
}

export type SequenceAnimaticSceneBoardView = {
  scene: SequenceAnimaticSceneView
  groups: SequenceAnimaticSceneBoardGroup[]
  shots: SequenceAnimaticSceneBoardShotTile[]
  referenceTiles: SequenceAnimaticSceneBoardReferenceTile[]
  prepStages: SequenceAnimaticSceneBoardPrepStage[]
  nextPrepTargets: SequenceAnimaticContinuityAssetTargetView[]
  prepUnits: SequenceAnimaticSceneBoardPrepUnit[]
  coverageGridPlanCount: number
  coverageGridShotCount: number
  canGenerateCoverageGrids: boolean
  prepSummary: string
  prepBlockedReasons: string[]
  readyCount: number
  missingCoverageCount: number
  missingKeyframeCount: number
  failedCount: number
  blockedReasons: string[]
}

function sequenceAnimaticSceneBoardNodeFromShot(
  shot: SequenceAnimaticShotView,
  coverageAnchor: SequenceAnimaticCoverageAnchorView | null,
) {
  const normalizeKind = (kind: string): SequenceAnimaticContinuityGraphNodeKind | null => {
    if (kind === 'world_location' || kind === 'set' || kind === 'zone' || kind === 'spot' || kind === 'viewpoint' || kind === 'angle' || kind === 'coverage_anchor') return kind
    return null
  }
  const hierarchy = shot.spatialBindingView.hierarchy
  const spot = hierarchy.find((node) => node.kind === 'spot') ?? null
  const zone = hierarchy.find((node) => node.kind === 'zone') ?? null
  const set = hierarchy.find((node) => node.kind === 'set') ?? null
  const selected = coverageAnchor
    ? {
      id: coverageAnchor.id,
      kind: 'coverage_anchor' as SequenceAnimaticContinuityGraphNodeKind,
    }
    : spot
      ? { id: spot.id, kind: normalizeKind(spot.kind) }
      : zone
        ? { id: zone.id, kind: normalizeKind(zone.kind) }
        : set
          ? { id: set.id, kind: normalizeKind(set.kind) }
          : shot.spatialBindingView.selectedNode
            ? { id: shot.spatialBindingView.selectedNode.id, kind: normalizeKind(shot.spatialBindingView.selectedNode.kind) }
            : null
  return {
    set,
    zone,
    spot,
    authoringNodeId: selected?.kind ? selected.id : null,
    authoringNodeKind: selected?.kind ?? null,
  }
}

function sequenceAnimaticSceneBoardShotMatchesScope(
  shot: SequenceAnimaticShotView,
  coverageAnchor: SequenceAnimaticCoverageAnchorView | null,
  scopeNodeId: string | null | undefined,
) {
  const scope = trimOptionalString(scopeNodeId)
  if (!scope) return true
  if (shot.spatialBindingView.hierarchy.some((node) => node.id === scope)) return true
  if (!coverageAnchor) return false
  return [
    coverageAnchor.id,
    coverageAnchor.setId,
    coverageAnchor.zoneId,
    coverageAnchor.primarySpotId,
    ...coverageAnchor.spotIds,
    coverageAnchor.viewpointId,
  ].includes(scope)
}

function sequenceAnimaticSceneBoardShotMatchesFilter(
  tile: SequenceAnimaticSceneBoardShotTile,
  filter: SequenceAnimaticSceneBoardFilter,
) {
  if (filter === 'needs_coverage') return !tile.coverageReady
  if (filter === 'needs_keyframe') return !tile.keyframeReady
  if (filter === 'failed') return tile.failed
  return true
}

const sequenceAnimaticSceneBoardReferenceStageOrder: SequenceAnimaticSceneBoardReferenceStageKey[] = ['set_refs', 'zone_refs', 'spot_refs']
const sequenceAnimaticSceneBoardPrepStageOrder: SequenceAnimaticSceneBoardPrepStageKey[] = ['set_refs', 'scaffold_refs', 'coverage_directions', 'coverage_grids', 'keyframes']

function sequenceAnimaticSceneBoardPrepStageForNodeKind(kind: SequenceAnimaticContinuityGraphNodeKind): SequenceAnimaticSceneBoardReferenceTile['stage'] | null {
  if (kind === 'world_location' || kind === 'set') return 'set_refs'
  if (kind === 'zone') return 'zone_refs'
  if (kind === 'spot' || kind === 'viewpoint' || kind === 'angle') return 'spot_refs'
  return null
}

export function sequenceAnimaticSceneBoardPrepStageLabel(stage: SequenceAnimaticSceneBoardPrepStageKey) {
  if (stage === 'set_refs') return 'Set refs'
  if (stage === 'scaffold_refs') return 'Zone map / spot atlas'
  if (stage === 'coverage_directions') return 'Coverage directions'
  if (stage === 'coverage_grids') return 'Coverage grids'
  return 'Keyframes'
}

export function sequenceAnimaticSceneBoardReferenceStageLabel(stage: SequenceAnimaticSceneBoardReferenceStageKey) {
  if (stage === 'set_refs') return 'Set refs'
  if (stage === 'zone_refs') return 'Zone map'
  return 'Spot/viewpoint atlas'
}

function sequenceAnimaticSceneBoardReferenceBlockedReasons(
  tile: Pick<SequenceAnimaticSceneBoardReferenceTile, 'status' | 'target'>,
  node: SequenceAnimaticContinuityGraphNodeView,
  targetByNodeId: Map<string, SequenceAnimaticContinuityAssetTargetView>,
  graphNodeById: Map<string, SequenceAnimaticContinuityGraphNodeView>,
) {
  if (!tile.target) return []
  const parentId = trimOptionalString(node.parentId)
  if (!parentId) return []
  const parentNode = graphNodeById.get(parentId) ?? null
  const parentTarget = targetByNodeId.get(parentId) ?? null
  if (!parentTarget) return []
  if (parentTarget.status === 'ready') return []
  const parentLabel = parentNode?.label || parentTarget.name || 'parent reference'
  if (parentTarget.status === 'generating') return [`Waiting for ${parentLabel} to finish.`]
  return [`Generate ${parentLabel} first.`]
}

export function sequenceAnimaticSceneBoardReferenceNeedsGeneration(tile: SequenceAnimaticSceneBoardReferenceTile) {
  return Boolean(tile.target && (
    tile.status === 'missing'
    || tile.status === 'stale'
    || tile.status === 'failed'
    || (tile.status === 'ready' && !sequenceAnimaticSceneBoardReferenceHasAsset(tile))
  ))
}

function sequenceAnimaticSceneBoardReferenceHasAsset(tile: SequenceAnimaticSceneBoardReferenceTile) {
  return Boolean(trimOptionalString(tile.target?.assetKey))
}

export function sequenceAnimaticSceneBoardReferenceReady(tile: SequenceAnimaticSceneBoardReferenceTile) {
  return Boolean(tile.target) && tile.status === 'ready' && sequenceAnimaticSceneBoardReferenceHasAsset(tile)
}

export function sequenceAnimaticSceneBoardReferenceRequiredForCoverage(tile: SequenceAnimaticSceneBoardReferenceTile) {
  return tile.stage === 'set_refs' || tile.stage === 'zone_refs' || tile.stage === 'spot_refs'
}

export function sequenceAnimaticSceneBoardCoverageReferencesReady(referenceTiles: readonly SequenceAnimaticSceneBoardReferenceTile[]) {
  const requiredReferences = referenceTiles.filter(sequenceAnimaticSceneBoardReferenceRequiredForCoverage)
  return requiredReferences.length > 0
    && requiredReferences.every(sequenceAnimaticSceneBoardReferenceReady)
    && requiredReferences.every((tile) => tile.blockedReasons.length === 0)
}

export function sequenceAnimaticSceneBoardCoverageReferencesGenerating(referenceTiles: readonly SequenceAnimaticSceneBoardReferenceTile[]) {
  return referenceTiles
    .filter(sequenceAnimaticSceneBoardReferenceRequiredForCoverage)
    .some((tile) => tile.status === 'generating')
}

function sequenceAnimaticSceneBoardUnitLabelForNode(
  nodeById: ReadonlyMap<string, SequenceAnimaticContinuityGraphNodeView>,
  setId: string,
  zoneId: string,
) {
  const zoneNode = zoneId ? nodeById.get(zoneId) ?? null : null
  const setNode = setId ? nodeById.get(setId) ?? null : null
  return {
    title: zoneNode?.label || setNode?.label || 'Unbound board',
    subtitle: [setNode?.label, zoneNode?.label].filter(Boolean).join(' / ') || 'Spatial binding pending',
  }
}

export function sequenceAnimaticSceneBoardScaffoldGroupsForUnit(input: {
  model: SequenceAnimaticViewModel
  referenceTiles: readonly SequenceAnimaticSceneBoardReferenceTile[]
  includeReady?: boolean
}): SequenceAnimaticContinuityAssetRunGroup[] {
  const graphNodeById = new Map(input.model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const targetByNodeId = new Map(
    input.referenceTiles
      .map((tile) => tile.target ? [tile.target.nodeId, tile.target] as const : null)
      .filter((entry): entry is readonly [string, SequenceAnimaticContinuityAssetTargetView] => Boolean(entry)),
  )
  const needs = input.includeReady
    ? input.referenceTiles.filter((tile) => tile.stage !== 'set_refs' && tile.target && tile.blockedReasons.length === 0)
    : input.referenceTiles.filter(sequenceAnimaticSceneBoardReferenceNeedsGeneration)
  const consumedNodeIds = new Set<string>()
  const groups: SequenceAnimaticContinuityAssetRunGroup[] = []
  const zoneTiles = needs.filter((tile) => tile.stage === 'zone_refs' && tile.blockedReasons.length === 0)
  for (const zoneTile of zoneTiles) {
    if (!zoneTile.target) continue
    consumedNodeIds.add(zoneTile.nodeId)
    groups.push({
      targets: [zoneTile.target],
      isBatch: false,
      batchKind: 'zone_spatial_map',
      parentNodeId: trimOptionalString(graphNodeById.get(zoneTile.nodeId)?.parentId) || null,
    })
  }
  const siblingGroups = new Map<string, SequenceAnimaticContinuityAssetTargetView[]>()
  for (const tile of needs) {
    if (tile.stage !== 'spot_refs' || !tile.target || consumedNodeIds.has(tile.nodeId) || tile.blockedReasons.length > 0) continue
    const parentId = trimOptionalString(graphNodeById.get(tile.nodeId)?.parentId)
    if (!parentId) {
      groups.push({ targets: [tile.target], isBatch: false })
      consumedNodeIds.add(tile.nodeId)
      continue
    }
    const parentTile = input.referenceTiles.find((candidate) => candidate.nodeId === parentId) ?? null
    const parentTarget = targetByNodeId.get(parentId) ?? null
    if ((parentTile && !sequenceAnimaticSceneBoardReferenceReady(parentTile)) || (parentTarget && parentTarget.status !== 'ready')) continue
    const key = `${parentId}:${tile.nodeKind === 'viewpoint' || tile.nodeKind === 'angle' ? 'viewpoints' : 'spots'}`
    siblingGroups.set(key, [...(siblingGroups.get(key) ?? []), tile.target])
    consumedNodeIds.add(tile.nodeId)
  }
  for (const [key, targets] of siblingGroups.entries()) {
    const [parentId, kind] = key.split(':')
    const batchKind = kind === 'viewpoints' ? 'viewpoint_atlas_grid' : 'spot_atlas_grid'
    for (let index = 0; index < targets.length; index += 9) {
      const chunk = targets.slice(index, index + 9)
      groups.push({ targets: chunk, isBatch: chunk.length > 1, batchKind, parentNodeId: parentId || null })
    }
  }
  return groups
}

function buildSequenceAnimaticSceneBoardPrepView(input: {
  model: SequenceAnimaticViewModel
  scene: SequenceAnimaticSceneView
  tiles: SequenceAnimaticSceneBoardShotTile[]
}): Pick<SequenceAnimaticSceneBoardView, 'referenceTiles' | 'prepStages' | 'nextPrepTargets' | 'prepUnits' | 'coverageGridPlanCount' | 'coverageGridShotCount' | 'canGenerateCoverageGrids' | 'prepSummary' | 'prepBlockedReasons'> {
  const graphNodeById = new Map(input.model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const targetByNodeId = new Map(input.model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const neededNodeIds = new Set(input.tiles.flatMap((tile) => tile.spatialNodeIds))
  input.tiles.forEach((tile) => {
    if (tile.setId) neededNodeIds.add(tile.setId)
    if (tile.zoneId) neededNodeIds.add(tile.zoneId)
    if (tile.spotId) neededNodeIds.add(tile.spotId)
    const viewpointNode = tile.shot.spatialBindingView.hierarchy.find((node) => node.kind === 'viewpoint' || node.kind === 'angle') ?? null
    if (viewpointNode?.id) neededNodeIds.add(viewpointNode.id)
  })
  const referenceTiles = [...neededNodeIds]
    .map((nodeId): SequenceAnimaticSceneBoardReferenceTile | null => {
      const node = graphNodeById.get(nodeId) ?? null
      if (!node) return null
      const stage = sequenceAnimaticSceneBoardPrepStageForNodeKind(node.kind)
      if (!stage) return null
      const target = targetByNodeId.get(node.id) ?? null
      const status = target?.status ?? node.assetStatus ?? 'not_required'
      const tile: SequenceAnimaticSceneBoardReferenceTile = {
        nodeId: node.id,
        nodeKind: node.kind,
        label: node.label,
        kindLabel: node.kindLabel,
        stage,
        status,
        statusLabel: target?.statusLabel || node.assetStatusLabel || (status === 'not_required' ? 'Not required' : status),
        assetUrl: target?.assetUrl || node.assetUrl || null,
        usageCount: input.tiles.filter((shotTile) => shotTile.spatialNodeIds.includes(node.id)).length,
        running: status === 'generating',
        target,
        blockedReasons: [],
      }
      return {
        ...tile,
        blockedReasons: sequenceAnimaticSceneBoardReferenceBlockedReasons(tile, node, targetByNodeId, graphNodeById),
      }
    })
    .filter((tile): tile is SequenceAnimaticSceneBoardReferenceTile => Boolean(tile))
    .sort((left, right) => {
      const stageDelta = sequenceAnimaticSceneBoardReferenceStageOrder.indexOf(left.stage) - sequenceAnimaticSceneBoardReferenceStageOrder.indexOf(right.stage)
      if (stageDelta !== 0) return stageDelta
      return left.label.localeCompare(right.label)
    })

  const unitShotsByKey = new Map<string, SequenceAnimaticSceneBoardShotTile[]>()
  for (const tile of input.tiles) {
    const key = [tile.setId || 'unbound_set', tile.zoneId || 'unbound_zone'].join(':')
    unitShotsByKey.set(key, [...(unitShotsByKey.get(key) ?? []), tile])
  }
  const referenceTileByNodeId = new Map(referenceTiles.map((tile) => [tile.nodeId, tile] as const))
  const prepUnits = [...unitShotsByKey.entries()].map(([key, unitShots]): SequenceAnimaticSceneBoardPrepUnit => {
    const first = unitShots[0]
    const setId = first?.setId ?? ''
    const zoneId = first?.zoneId ?? ''
    const labels = sequenceAnimaticSceneBoardUnitLabelForNode(graphNodeById, setId, zoneId)
    const unitNodeIds = new Set(unitShots.flatMap((tile) => tile.spatialNodeIds))
    unitShots.forEach((tile) => {
      if (tile.setId) unitNodeIds.add(tile.setId)
      if (tile.zoneId) unitNodeIds.add(tile.zoneId)
      if (tile.spotId) unitNodeIds.add(tile.spotId)
      const viewpointNode = tile.shot.spatialBindingView.hierarchy.find((node) => node.kind === 'viewpoint' || node.kind === 'angle') ?? null
      if (viewpointNode?.id) unitNodeIds.add(viewpointNode.id)
    })
    const unitReferenceTiles = [...unitNodeIds]
      .map((nodeId) => referenceTileByNodeId.get(nodeId) ?? null)
      .filter((tile): tile is SequenceAnimaticSceneBoardReferenceTile => Boolean(tile))
      .sort((left, right) => {
        const stageDelta = sequenceAnimaticSceneBoardReferenceStageOrder.indexOf(left.stage) - sequenceAnimaticSceneBoardReferenceStageOrder.indexOf(right.stage)
        if (stageDelta !== 0) return stageDelta
        return left.label.localeCompare(right.label)
      })
    const missingSetTargets = unitReferenceTiles
      .filter((tile) => tile.stage === 'set_refs')
      .filter(sequenceAnimaticSceneBoardReferenceNeedsGeneration)
      .filter((tile) => tile.blockedReasons.length === 0)
      .map((tile) => tile.target)
      .filter((target): target is SequenceAnimaticContinuityAssetTargetView => Boolean(target))
    const scaffoldGroups = missingSetTargets.length === 0
      ? sequenceAnimaticSceneBoardScaffoldGroupsForUnit({ model: input.model, referenceTiles: unitReferenceTiles })
      : []
    const coverageShots = unitShots.filter((tile) => !tile.shot.isProvisional)
    const missingCoverageCount = coverageShots.filter((tile) => !tile.coverageReady).length
    const coverageIntentShots = coverageShots.filter((tile) => !tile.coverageReady && !tile.shot.coverageSetupId && !tile.coverageAnchor)
    const coverageIntentMissingCount = coverageIntentShots.filter((tile) => !tile.coverageIntentReady).length
    const coverageIntentReadyCount = coverageIntentShots.filter((tile) => tile.coverageIntentReady).length
    const referenceBlockedReasons = unitReferenceTiles
      .filter(sequenceAnimaticSceneBoardReferenceRequiredForCoverage)
      .flatMap((tile) => tile.blockedReasons)
    const coverageReferenceGenerating = sequenceAnimaticSceneBoardCoverageReferencesGenerating(unitReferenceTiles)
    const coverageReferencesReady = sequenceAnimaticSceneBoardCoverageReferencesReady(unitReferenceTiles)
    const failedReferences = unitReferenceTiles
      .filter(sequenceAnimaticSceneBoardReferenceRequiredForCoverage)
      .filter((tile) => tile.status === 'failed')
    const missingCoverageRequiredReferences = unitReferenceTiles
      .filter(sequenceAnimaticSceneBoardReferenceRequiredForCoverage)
      .filter((tile) => !sequenceAnimaticSceneBoardReferenceReady(tile))
    const coverageBlockedReasons = [
      input.scene.status !== 'ready' ? 'Generate this scene before preparing coverage grids.' : '',
      coverageReferenceGenerating ? 'Waiting for set/zone references before coverage grids.' : '',
      referenceBlockedReasons.find((reason) => Boolean(reason)) ?? '',
      missingCoverageRequiredReferences.length > 0 && missingSetTargets.length === 0 && scaffoldGroups.length === 0 ? 'Waiting for set/zone references before coverage grids.' : '',
    ].filter(Boolean)
    const stage: SequenceAnimaticSceneBoardPrepUnitStage = missingSetTargets.length > 0
      ? 'set_refs'
      : scaffoldGroups.length > 0 && !coverageReferencesReady
        ? 'scaffold_refs'
      : failedReferences.length > 0 && missingCoverageRequiredReferences.length > 0
          ? 'failed'
          : coverageBlockedReasons.length > 0
            ? 'blocked'
            : coverageIntentMissingCount > 0
              ? 'coverage_directions'
            : missingCoverageCount > 0
              ? 'coverage_grids'
              : 'ready'
    const stageLabel = stage === 'set_refs'
      ? `Waiting for set image before zone map.`
      : stage === 'scaffold_refs'
        ? unitReferenceTiles.some((tile) => tile.stage === 'zone_refs' && sequenceAnimaticSceneBoardReferenceNeedsGeneration(tile))
          ? `Generating zone spatial map for this board.`
          : `Generating ${scaffoldGroups.length} spot atlas grid${scaffoldGroups.length === 1 ? '' : 's'} for this zone.`
        : stage === 'coverage_directions'
          ? `Coverage directions: ${coverageIntentReadyCount}/${coverageIntentShots.length} ready.`
        : stage === 'coverage_grids'
          ? `Coverage grid queued for ${coverageShots.length} shot${coverageShots.length === 1 ? '' : 's'}.`
          : stage === 'ready'
            ? 'Ready for keyframes.'
            : coverageBlockedReasons[0] || 'Prep blocked.'
    return {
      id: key,
      title: labels.title,
      subtitle: labels.subtitle,
      setId,
      zoneId,
      scopeNodeId: zoneId || setId || null,
      referenceTiles: unitReferenceTiles,
      shots: unitShots,
      setTargets: missingSetTargets,
      scaffoldGroups,
      coverageGridPlanCount: Math.ceil(coverageShots.length / 9),
      coverageGridShotCount: coverageShots.length,
      coverageIntentMissingCount,
      coverageIntentReadyCount,
      missingCoverageCount,
      blockedReasons: coverageBlockedReasons,
      stage,
      stageLabel,
    }
  }).sort((left, right) => {
    const leftIndex = input.tiles.findIndex((tile) => tile.setId === left.setId && tile.zoneId === left.zoneId)
    const rightIndex = input.tiles.findIndex((tile) => tile.setId === right.setId && tile.zoneId === right.zoneId)
    return leftIndex - rightIndex
  })

  const referenceStageCounts = new Map<SequenceAnimaticSceneBoardReferenceStageKey, SequenceAnimaticSceneBoardReferenceTile[]>()
  for (const tile of referenceTiles) referenceStageCounts.set(tile.stage, [...(referenceStageCounts.get(tile.stage) ?? []), tile])
  const zoneGridKeys = new Set<string>()
  const coverageGridShots = input.tiles.filter((tile) => !tile.shot.isProvisional)
  for (const tile of coverageGridShots) {
    zoneGridKeys.add([input.scene.id, tile.setId || 'unbound_set', tile.zoneId || 'unbound_zone'].join(':'))
  }
  const coverageGeneratingCount = input.tiles.filter((tile) => tile.coverageAnchor?.running || tile.shot.zoneCoverageCellRunning || tile.shot.keyframeDependencyRunning).length
  const coverageIntentShots = input.tiles.filter((tile) => !tile.shot.isProvisional && !tile.coverageReady && !tile.shot.coverageSetupId && !tile.coverageAnchor)
  const keyframeGeneratingCount = input.tiles.filter((tile) => tile.shot.keyframeRunning || tile.shot.panelRunning).length
  const prepStages: SequenceAnimaticSceneBoardPrepStage[] = sequenceAnimaticSceneBoardPrepStageOrder.map((stage) => {
    if (stage === 'coverage_directions') {
      return {
        key: stage,
        label: sequenceAnimaticSceneBoardPrepStageLabel(stage),
        total: coverageIntentShots.length,
        ready: coverageIntentShots.filter((tile) => tile.coverageIntentReady).length,
        missing: coverageIntentShots.filter((tile) => !tile.coverageIntentReady).length,
        generating: coverageIntentShots.filter((tile) => tile.coverageIntentRunning).length,
        failed: coverageIntentShots.filter((tile) => tile.coverageIntentFailed).length,
        blocked: input.scene.status !== 'ready' ? coverageIntentShots.length : 0,
      }
    }
    if (stage === 'coverage_grids') {
      return {
        key: stage,
        label: sequenceAnimaticSceneBoardPrepStageLabel(stage),
        total: coverageGridShots.length,
        ready: coverageGridShots.filter((tile) => tile.coverageReady).length,
        missing: coverageGridShots.filter((tile) => !tile.coverageReady).length,
        generating: coverageGeneratingCount,
        failed: coverageGridShots.filter((tile) => tile.coverageAnchor?.status === 'failed').length,
        blocked: input.scene.status !== 'ready' ? coverageGridShots.length : 0,
      }
    }
    if (stage === 'keyframes') {
      return {
        key: stage,
        label: sequenceAnimaticSceneBoardPrepStageLabel(stage),
        total: input.tiles.length,
        ready: input.tiles.filter((tile) => tile.keyframeReady).length,
        missing: input.tiles.filter((tile) => !tile.keyframeReady).length,
        generating: keyframeGeneratingCount,
        failed: input.tiles.filter((tile) => tile.failed).length,
        blocked: input.tiles.filter((tile) => tile.blockedReasons.length > 0).length,
      }
    }
    const tiles = stage === 'set_refs'
      ? referenceStageCounts.get('set_refs') ?? []
      : stage === 'scaffold_refs'
        ? [...(referenceStageCounts.get('zone_refs') ?? []), ...(referenceStageCounts.get('spot_refs') ?? [])]
        : []
    return {
      key: stage,
      label: sequenceAnimaticSceneBoardPrepStageLabel(stage),
      total: tiles.length,
      ready: tiles.filter((tile) => tile.status === 'ready' || tile.status === 'not_required').length,
      missing: tiles.filter((tile) => tile.status === 'missing' || tile.status === 'stale').length,
      generating: tiles.filter((tile) => tile.status === 'generating').length,
      failed: tiles.filter((tile) => tile.status === 'failed').length,
      blocked: tiles.filter((tile) => tile.blockedReasons.length > 0).length,
    }
  })
  const unresolvedReferencesByStage = sequenceAnimaticSceneBoardReferenceStageOrder
    .map((stage) => referenceTiles.filter((tile) => (
      tile.stage === stage
      && tile.target
      && (tile.status === 'missing' || tile.status === 'stale' || tile.status === 'failed')
      && tile.blockedReasons.length === 0
    )))
  const nextPrepTargets = unresolvedReferencesByStage.find((targets) => targets.length > 0)
    ?.map((tile) => tile.target)
    .filter((target): target is SequenceAnimaticContinuityAssetTargetView => Boolean(target))
    ?? []
  const blockingReferences = referenceTiles.filter((tile) => tile.blockedReasons.length > 0)
  const missingReferenceCount = referenceTiles.filter((tile) => tile.target && (tile.status === 'missing' || tile.status === 'stale' || tile.status === 'failed')).length
  const allCoverageUnitReferencesReady = prepUnits.length > 0
    && prepUnits
      .filter((unit) => unit.coverageGridShotCount > 0)
      .every((unit) => sequenceAnimaticSceneBoardCoverageReferencesReady(unit.referenceTiles))
  const canGenerateCoverageGrids = input.scene.status === 'ready'
    && coverageGridShots.length > 0
    && allCoverageUnitReferencesReady
    && !sequenceAnimaticSceneBoardCoverageReferencesGenerating(referenceTiles)
  const prepBlockedReasons = [
    input.scene.status !== 'ready' ? 'Generate this scene before preparing continuity.' : '',
    blockingReferences[0]?.blockedReasons[0] ?? '',
    referenceTiles.some((tile) => tile.status === 'generating') ? 'Reference generation is still running.' : '',
  ].filter(Boolean)
  const unitCoverageGridPlanCount = prepUnits.reduce((sum, unit) => sum + unit.coverageGridPlanCount, 0)
  const prepSummary = nextPrepTargets.length > 0
    ? `Next: generate ${nextPrepTargets.length} ${sequenceAnimaticSceneBoardReferenceStageLabel(referenceTiles.find((tile) => tile.target?.nodeId === nextPrepTargets[0]?.nodeId)?.stage ?? 'set_refs').toLowerCase()}.`
      : missingReferenceCount > 0
      ? 'Waiting for parent references before zone map / spot atlas.'
      : canGenerateCoverageGrids && coverageGridShots.some((tile) => !tile.coverageReady)
        ? `Next: generate ${unitCoverageGridPlanCount} scoped coverage grid${unitCoverageGridPlanCount === 1 ? '' : 's'} for ${coverageGridShots.length} shot${coverageGridShots.length === 1 ? '' : 's'}.`
        : 'Continuity references are ready for this board scope.'
  return {
    referenceTiles,
    prepStages,
    nextPrepTargets,
    prepUnits,
    coverageGridPlanCount: unitCoverageGridPlanCount || zoneGridKeys.size,
    coverageGridShotCount: coverageGridShots.length,
    canGenerateCoverageGrids,
    prepSummary,
    prepBlockedReasons,
  }
}

export function sequenceAnimaticSceneBoardZoneScopeForNode(
  model: SequenceAnimaticViewModel,
  scopeNodeId?: string | null,
) {
  const scope = trimOptionalString(scopeNodeId)
  if (!scope) return { setId: null, zoneId: null }
  const graphNodeById = new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const scopeNode = graphNodeById.get(scope) ?? null
  if (!scopeNode) return { setId: null, zoneId: null }
  if (scopeNode.kind === 'set' || scopeNode.kind === 'world_location') return { setId: scopeNode.id, zoneId: null }
  if (scopeNode.kind === 'zone') {
    const parentNode = scopeNode.parentId ? graphNodeById.get(scopeNode.parentId) ?? null : null
    return { setId: parentNode && (parentNode.kind === 'set' || parentNode.kind === 'world_location') ? parentNode.id : null, zoneId: scopeNode.id }
  }
  let cursor: SequenceAnimaticContinuityGraphNodeView | null = scopeNode
  let zoneId: string | null = null
  let setId: string | null = null
  while (cursor?.parentId) {
    const parent: SequenceAnimaticContinuityGraphNodeView | null = graphNodeById.get(cursor.parentId) ?? null
    if (!parent) break
    if (!zoneId && parent.kind === 'zone') zoneId = parent.id
    if (!setId && (parent.kind === 'set' || parent.kind === 'world_location')) setId = parent.id
    cursor = parent
  }
  return { setId, zoneId }
}

export function buildSequenceAnimaticSceneBoardView(input: {
  model: SequenceAnimaticViewModel
  scene: SequenceAnimaticSceneView
  scopeNodeId?: string | null
  filter?: SequenceAnimaticSceneBoardFilter
  grouping?: SequenceAnimaticSceneBoardGrouping
}): SequenceAnimaticSceneBoardView {
  const filter = input.filter ?? 'all'
  const grouping = input.grouping ?? 'zone_spot'
  const sceneBlocks = sequenceAnimaticBlocksForScene(input.model, input.scene)
  const nodeById = new Map(input.model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
  const coverageAnchorById = new Map(input.model.coverageAnchors.map((anchor) => [anchor.id, anchor] as const))
  const tiles = sceneBlocks
    .flatMap((block) => block.shots.map((shot) => ({ block, shot })))
    .filter(({ shot }) => sequenceAnimaticSceneBoardShotMatchesScope(
      shot,
      shot.coverageSetupId ? coverageAnchorById.get(shot.coverageSetupId) ?? null : null,
      input.scopeNodeId,
    ))
    .map(({ block, shot }): SequenceAnimaticSceneBoardShotTile => {
      const coverageAnchor = shot.coverageSetupId ? coverageAnchorById.get(shot.coverageSetupId) ?? null : null
      const boardNode = sequenceAnimaticSceneBoardNodeFromShot(shot, coverageAnchor)
      const continuityPreviewTarget = [...shot.spatialBindingView.hierarchy].reverse()
        .map((node) => nodeById.get(node.id) ?? null)
        .find((node) => node?.assetUrl) ?? null
      const keyframeReady = shot.keyframeStatusLabel === 'Keyframe ready' || shot.keyframeStatusLabel === 'Revised keyframe ready'
      const coverageReady = Boolean(shot.zoneCoverageCell?.assetKey || coverageAnchor?.assetUrl || coverageAnchor?.assetKey)
      const coverageIntentReady = Boolean(shot.coverageIntent?.coverageIntent || shot.coverageIntent?.stagingBrief)
      const coverageThumbnailUrl = coverageAnchor?.assetUrl || shot.zoneCoverageCell?.assetUrl || null
      const failed = Boolean(
        shot.panelError
        || shot.keyframeStatusLabel.toLowerCase().includes('failed')
        || shot.zoneCoverageCellFailed
        || shot.coverageIntentFailed
        || coverageAnchor?.status === 'failed',
      )
      const blockedReasons = [
        input.scene.status !== 'ready' ? 'Generate this scene first.' : '',
        shot.isProvisional && !sequenceAnimaticShotCanGenerateEarlyKeyframe(shot) ? 'Shot binding is still provisional.' : '',
        shot.keyframeDependencyMissingCount > 0 ? shot.keyframeDependencyStatusLabel : '',
      ].filter(Boolean)
      const spatialPath = shot.spatialBindingView.hierarchy.length > 0
        ? shot.spatialBindingView.hierarchy
          .filter((node) => node.kind === 'set' || node.kind === 'zone' || node.kind === 'spot' || node.kind === 'viewpoint' || node.kind === 'angle')
          .map((node) => node.label)
          .join(' / ')
        : 'Unbound'
      return {
        id: shot.id,
        blockId: block.id,
        blockTitle: block.title,
        block,
        shot,
        coverageAnchor,
        thumbnailUrl: keyframeReady && shot.panelUrl ? shot.panelUrl : coverageThumbnailUrl || shot.panelUrl || continuityPreviewTarget?.assetUrl || null,
        thumbnailStatusLabel: keyframeReady && shot.panelUrl
          ? shot.keyframeStatusLabel
          : coverageAnchor?.assetUrl
            ? coverageAnchor.statusLabel
            : shot.zoneCoverageCell?.assetKey
              ? 'Coverage grid cell ready'
            : continuityPreviewTarget?.assetUrl
              ? continuityPreviewTarget.assetStatusLabel || 'Continuity reference ready'
              : shot.panelStatusLabel,
        spatialPath,
        setId: boardNode.set?.id ?? coverageAnchor?.setId ?? '',
        zoneId: boardNode.zone?.id ?? coverageAnchor?.zoneId ?? '',
        spotId: boardNode.spot?.id ?? coverageAnchor?.primarySpotId ?? coverageAnchor?.spotIds[0] ?? '',
        spatialNodeIds: [...new Set([
          ...shot.spatialBindingView.hierarchy
            .filter((node) => node.kind === 'set' || node.kind === 'zone' || node.kind === 'spot' || node.kind === 'viewpoint' || node.kind === 'angle')
            .map((node) => node.id),
          coverageAnchor?.setId ?? '',
          coverageAnchor?.zoneId ?? '',
          coverageAnchor?.primarySpotId ?? '',
          coverageAnchor?.viewpointId ?? '',
        ].filter(Boolean))],
        authoringNodeId: boardNode.authoringNodeId,
        authoringNodeKind: boardNode.authoringNodeKind,
        coverageReady,
        coverageIntentReady,
        coverageIntentRunning: shot.coverageIntentRunning,
        coverageIntentFailed: shot.coverageIntentFailed,
        keyframeReady,
        running: shot.panelRunning || shot.keyframeRunning || shot.keyframeDependencyRunning || shot.coverageIntentRunning || shot.zoneCoverageCellRunning || Boolean(coverageAnchor?.running),
        failed,
        blockedReasons,
      }
    })
    .filter((tile) => sequenceAnimaticSceneBoardShotMatchesFilter(tile, filter))

  const prep = buildSequenceAnimaticSceneBoardPrepView({ model: input.model, scene: input.scene, tiles })
  const groupsById = new Map<string, SequenceAnimaticSceneBoardShotTile[]>()
  for (const tile of tiles) {
    const groupId = grouping === 'shot_order'
      ? `${tile.blockId}:shot_order`
      : [tile.setId || 'unbound_set', tile.zoneId || 'unbound_zone', tile.spotId || 'unbound_spot'].join(':')
    groupsById.set(groupId, [...(groupsById.get(groupId) ?? []), tile])
  }
  const groups = [...groupsById.entries()].map(([id, groupShots], groupIndex): SequenceAnimaticSceneBoardGroup => {
    const first = groupShots[0]
    const spotNode = first?.spotId ? nodeById.get(first.spotId) ?? null : null
    const zoneNode = first?.zoneId ? nodeById.get(first.zoneId) ?? null : null
    const setNode = first?.setId ? nodeById.get(first.setId) ?? null : null
    const authoringNode = spotNode ?? zoneNode ?? setNode ?? null
    const title = grouping === 'shot_order'
      ? first?.blockTitle || `Shot group ${groupIndex + 1}`
      : spotNode?.label || zoneNode?.label || setNode?.label || 'Unbound shots'
    const subtitle = grouping === 'shot_order'
      ? `${groupShots.length} shot${groupShots.length === 1 ? '' : 's'} in screenplay order`
      : [setNode?.label, zoneNode?.label].filter(Boolean).join(' / ') || 'Spatial binding pending'
    const blockedReasons = [
      input.scene.status !== 'ready' ? 'Generate this scene before generating coverage grids.' : '',
      groupShots.every((tile) => tile.shot.isProvisional) ? 'No finalized shots in this group yet.' : '',
    ].filter(Boolean)
    const groupReferenceIds = new Set(groupShots.flatMap((tile) => tile.spatialNodeIds))
    return {
      id,
      title,
      subtitle,
      setId: first?.setId ?? '',
      zoneId: first?.zoneId ?? '',
      spotId: first?.spotId ?? '',
      authoringNodeId: authoringNode?.id ?? first?.authoringNodeId ?? null,
      authoringNodeKind: authoringNode?.kind ?? first?.authoringNodeKind ?? null,
      referenceTiles: prep.referenceTiles.filter((tile) => groupReferenceIds.has(tile.nodeId)),
      shots: groupShots,
      readyCount: groupShots.filter((tile) => tile.coverageReady && tile.keyframeReady).length,
      missingCoverageCount: groupShots.filter((tile) => !tile.coverageReady).length,
      missingKeyframeCount: groupShots.filter((tile) => !tile.keyframeReady).length,
      failedCount: groupShots.filter((tile) => tile.failed).length,
      blockedReasons,
    }
  })
  return {
    scene: input.scene,
    groups,
    shots: tiles,
    ...prep,
    readyCount: tiles.filter((tile) => tile.coverageReady && tile.keyframeReady).length,
    missingCoverageCount: tiles.filter((tile) => !tile.coverageReady).length,
    missingKeyframeCount: tiles.filter((tile) => !tile.keyframeReady).length,
    failedCount: tiles.filter((tile) => tile.failed).length,
    blockedReasons: input.scene.status !== 'ready' ? ['Generate this scene before generating coverage grids.'] : [],
  }
}


