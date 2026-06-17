import { resolveAssetSourceUrl } from '../../../domain/assets'
import type { AssetDefinition } from '../../../domain/graphcore'
import type {
  OutputArtifact,
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'

import {
  isOutputRunStepActive,
  outputRunStepForNode,
} from './sequenceAnimaticProgressPresentation'
import {
  outputWorkflowRunHasFailedExecution,
  sequenceAnimaticRequestIsActive,
  sequenceAnimaticRequestUpdatedAtMs,
} from './sequenceAnimaticRuntimePresentation'
import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'

export type SequenceAnimaticZoneCoverageCellActiveStage = 'queued' | 'image' | 'extract' | ''

export type SequenceAnimaticCoverageIntentView = {
  shotId: string
  sceneId: string
  setId: string
  zoneId: string
  primarySpotId: string
  coverageIntent: string
  cameraFraming: string
  cameraAngle: string
  screenDirection: string
  subjectFocus: string
  stagingBrief: string
  sourceHash: string
  workflowRequestId: string | null
}

export type SequenceAnimaticCoverageAnchorView = {
  id: string
  title: string
  displayTitle: string
  setupKind: string
  setupKindLabel: string
  status: 'missing' | 'queued' | 'generating' | 'ready' | 'failed'
  statusLabel: string
  assetKey: string | null
  assetUrl: string | null
  requestId: string | null
  workflowId: string | null
  running: boolean
  setId: string
  zoneId: string
  primarySpotId: string
  spotIds: string[]
  viewpointId: string
  characterRefIds: string[]
  screenDirection: string
  camera: string
  lighting: string
  stagingBrief: string
  continuityFromSetupId: string
  continuityMode: string
  shotIds: string[]
  blockIds: string[]
  createdFromShotId: string
  firstUsedShotId: string
  reuseReason: string
  usageLabel: string
  usageDetailLabel: string
}

export type SequenceAnimaticZoneCoverageCellView = {
  shotId: string
  boardId: string
  artifactKey: string | null
  assetKey: string | null
  assetUrl: string | null
  status: 'ready' | 'pending' | 'failed'
}

export type SequenceAnimaticZoneCoverageBoardView = {
  id: string
  boardId: string
  sceneId: string
  setId: string
  zoneId: string
  chunkIndex: number
  shotIds: string[]
  sourceHash: string
  requestId: string | null
  workflowId: string | null
  runId: string | null
  active: boolean
  failed: boolean
  assetKey: string | null
  assetUrl: string | null
}

function displayNameFromRefId(value: string) {
  return value
    .replace(/^(world_|entity_|location_|set_|zone_|spot_|viewpoint_|angle_|shot_|coverage_|setup_|temp_|prop_|character_)+/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

export function sequenceAnimaticCoverageShotLabel(shotId: string) {
  const match = /shot_0*(\d+)/i.exec(shotId)
  return match ? `Shot ${match[1]}` : displayNameFromRefId(shotId)
}

export function sequenceAnimaticCoverageUsageLabel(anchor: Pick<SequenceAnimaticCoverageAnchorView, 'shotIds'>) {
  if (anchor.shotIds.length === 0) return 'No shots'
  return anchor.shotIds.length > 1 ? `${anchor.shotIds.length} shots` : '1 shot'
}

export function sequenceAnimaticCoverageUsageDetailLabel(anchor: Pick<SequenceAnimaticCoverageAnchorView, 'shotIds'>) {
  if (anchor.shotIds.length === 0) return 'Used by this shot'
  const shotList = anchor.shotIds.slice(0, 8).map(sequenceAnimaticCoverageShotLabel).join(', ')
  return `Used by: ${shotList}${anchor.shotIds.length > 8 ? ` +${anchor.shotIds.length - 8}` : ''}`
}

export function buildSequenceAnimaticCoverageIndexes(input: {
  assets: readonly AssetDefinition[]
  artifacts: readonly OutputArtifact[]
  coverageRegistry: Record<string, unknown>
  coverageSetups: readonly Record<string, unknown>[]
  registryCoverageSetupByShotId: Record<string, unknown>
  zoneCoverageBoardRequests: readonly OutputRequest[]
  coverageIntentRequests: readonly OutputRequest[]
  coverageAnchorRequests: readonly OutputRequest[]
  zoneCoverageBoardRunByRequestId: ReadonlyMap<string, OutputWorkflowRun | null>
  coverageIntentRunByRequestId: ReadonlyMap<string, OutputWorkflowRun | null>
  coverageAnchorRunByRequestId: ReadonlyMap<string, OutputWorkflowRun | null>
  shotProductionCoverageRunBySetupId: ReadonlyMap<string, OutputWorkflowRun>
  coverageAnchorArtifactBySetupId: ReadonlyMap<string, {
    artifact: OutputArtifact
    assetKey: string
    assetUrl: string | null
  }>
}) {
  const assetByKey = new Map(input.assets.map((asset) => [asset.key, asset] as const))
  const zoneCoverageCellByShotId = new Map<string, SequenceAnimaticZoneCoverageCellView>()
  const zoneCoverageCellArtifactByShotId = new Map<string, OutputArtifact>()
  for (const artifact of input.artifacts) {
    const metadata = readLooseRecord(artifact.metadata)
    const role = trimOptionalString(metadata.role)
    const sourceArtifactRole = trimOptionalString(metadata.sourceArtifactRole ?? metadata.source_artifact_role)
    if (role !== 'sequence_animatic_zone_coverage_cell' && sourceArtifactRole !== 'sequence_animatic_zone_coverage_cell') continue
    const shotId = trimOptionalString(metadata.shotId ?? metadata.shot_id)
    const assetKey = trimOptionalString(artifact.assetKey ?? metadata.assetKey ?? metadata.asset_key)
    if (!shotId || !assetKey || zoneCoverageCellArtifactByShotId.has(shotId)) continue
    zoneCoverageCellArtifactByShotId.set(shotId, artifact)
  }
  Object.entries(readLooseRecord(input.coverageRegistry.coverageCellByShotId ?? input.coverageRegistry.coverage_cell_by_shot_id)).forEach(([shotId, value]) => {
    const cell = readLooseRecord(value)
    const artifact = zoneCoverageCellArtifactByShotId.get(shotId) ?? null
    const artifactMetadata = readLooseRecord(artifact?.metadata)
    const assetKey = trimOptionalString(cell.assetKey ?? cell.asset_key)
      || trimOptionalString(artifact?.assetKey ?? artifactMetadata.assetKey ?? artifactMetadata.asset_key)
    zoneCoverageCellByShotId.set(shotId, {
      shotId,
      boardId: trimOptionalString(cell.boardId ?? cell.board_id ?? artifactMetadata.boardId ?? artifactMetadata.board_id),
      artifactKey: trimOptionalString(cell.artifactKey ?? cell.artifact_key ?? artifact?.key) || null,
      assetKey: assetKey || null,
      assetUrl: assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : null,
      status: assetKey ? 'ready' : trimOptionalString(cell.status) === 'failed' ? 'failed' : 'pending',
    })
  })
  zoneCoverageCellArtifactByShotId.forEach((artifact, shotId) => {
    if (zoneCoverageCellByShotId.get(shotId)?.assetKey) return
    const metadata = readLooseRecord(artifact.metadata)
    const assetKey = trimOptionalString(artifact.assetKey ?? metadata.assetKey ?? metadata.asset_key)
    if (!assetKey) return
    zoneCoverageCellByShotId.set(shotId, {
      shotId,
      boardId: trimOptionalString(metadata.boardId ?? metadata.board_id),
      artifactKey: artifact.key || null,
      assetKey,
      assetUrl: resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null),
      status: 'ready',
    })
  })

  const coverageIntentByShotId = new Map<string, SequenceAnimaticCoverageIntentView>()
  Object.entries(readLooseRecord(input.coverageRegistry.coverageIntentByShotId ?? input.coverageRegistry.coverage_intent_by_shot_id)).forEach(([shotId, value]) => {
    const record = readLooseRecord(value)
    const id = trimOptionalString(record.shotId ?? record.shot_id) || shotId
    if (!id) return
    coverageIntentByShotId.set(id, {
      shotId: id,
      sceneId: trimOptionalString(record.sceneId ?? record.scene_id),
      setId: trimOptionalString(record.setId ?? record.set_id),
      zoneId: trimOptionalString(record.zoneId ?? record.zone_id),
      primarySpotId: trimOptionalString(record.primarySpotId ?? record.primary_spot_id),
      coverageIntent: trimOptionalString(record.coverageIntent ?? record.coverage_intent),
      cameraFraming: trimOptionalString(record.cameraFraming ?? record.camera_framing),
      cameraAngle: trimOptionalString(record.cameraAngle ?? record.camera_angle),
      screenDirection: trimOptionalString(record.screenDirection ?? record.screen_direction),
      subjectFocus: trimOptionalString(record.subjectFocus ?? record.subject_focus),
      stagingBrief: trimOptionalString(record.stagingBrief ?? record.staging_brief),
      sourceHash: trimOptionalString(record.sourceHash ?? record.source_hash),
      workflowRequestId: trimOptionalString(record.workflowRequestId ?? record.workflow_request_id) || null,
    })
  })

  const storedZoneCoverageBoards = readLooseArray(input.coverageRegistry.zoneCoverageBoards ?? input.coverageRegistry.zone_coverage_boards).map(readLooseRecord)
  const zoneCoverageBoardById = new Map<string, SequenceAnimaticZoneCoverageBoardView>()
  for (const board of storedZoneCoverageBoards) {
    const boardId = trimOptionalString(board.id ?? board.boardId ?? board.board_id)
    if (!boardId) continue
    const assetKey = trimOptionalString(board.boardAssetKey ?? board.board_asset_key ?? board.assetKey ?? board.asset_key)
    zoneCoverageBoardById.set(boardId, {
      id: boardId,
      boardId,
      sceneId: trimOptionalString(board.sceneId ?? board.scene_id),
      setId: trimOptionalString(board.setId ?? board.set_id),
      zoneId: trimOptionalString(board.zoneId ?? board.zone_id),
      chunkIndex: Number(board.chunkIndex ?? board.chunk_index ?? 0) || 0,
      shotIds: readLooseArray(board.shotIds ?? board.shot_ids).map(trimOptionalString).filter(Boolean),
      sourceHash: trimOptionalString(board.sourceHash ?? board.source_hash),
      requestId: trimOptionalString(board.requestId ?? board.request_id) || null,
      workflowId: trimOptionalString(board.workflowId ?? board.workflow_id) || null,
      runId: trimOptionalString(board.latestRunId ?? board.latest_run_id ?? board.runId ?? board.run_id) || null,
      active: false,
      failed: trimOptionalString(board.status) === 'failed',
      assetKey: assetKey || null,
      assetUrl: assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : null,
    })
  }

  const zoneCoverageActiveShotIds = new Set<string>()
  const zoneCoverageActiveStageByShotId = new Map<string, SequenceAnimaticZoneCoverageCellActiveStage>()
  const zoneCoverageFailedShotIds = new Set<string>()
  for (const request of [...input.zoneCoverageBoardRequests].sort((left, right) => sequenceAnimaticRequestUpdatedAtMs(right) - sequenceAnimaticRequestUpdatedAtMs(left))) {
    const metadata = readLooseRecord(request.metadata)
    if (metadata.sequenceAnimaticStale === true) continue
    const run = input.zoneCoverageBoardRunByRequestId.get(request.id) ?? null
    const board = readLooseRecord(metadata.board)
    const boardId = trimOptionalString(metadata.boardId ?? board.id ?? board.boardId)
    const shotIds = readLooseArray(metadata.shotIds ?? metadata.shot_ids ?? board.shotIds ?? board.shot_ids)
      .map(trimOptionalString)
      .filter(Boolean)
    const imageStep = outputRunStepForNode(run, 'zone_coverage_board_image')
    const extractStep = outputRunStepForNode(run, 'zone_coverage_board_extract')
    const imageActive = isOutputRunStepActive(imageStep)
    const extractActive = isOutputRunStepActive(extractStep)
    const active = sequenceAnimaticRequestIsActive(request, run)
    const activeStage: SequenceAnimaticZoneCoverageCellActiveStage = extractActive
      ? 'extract'
      : imageActive
        ? 'image'
        : ''
    const failed = request.status === 'failed' || run?.status === 'failed' || outputWorkflowRunHasFailedExecution(run)
    if (activeStage) {
      shotIds.forEach((shotId) => {
        zoneCoverageActiveShotIds.add(shotId)
        zoneCoverageActiveStageByShotId.set(shotId, activeStage)
      })
    }
    if (failed) shotIds.forEach((shotId) => zoneCoverageFailedShotIds.add(shotId))
    if (extractStep && (extractStep.status === 'completed' || extractStep.status === 'completed_with_errors')) {
      Object.entries(readLooseRecord(readLooseRecord(extractStep.outputs).coverageCellByShotId ?? readLooseRecord(extractStep.outputs).coverage_cell_by_shot_id)).forEach(([shotId, value]) => {
        if (zoneCoverageCellByShotId.get(shotId)?.assetKey) return
        const cell = readLooseRecord(value)
        const assetKey = trimOptionalString(cell.assetKey ?? cell.asset_key)
        if (!assetKey) return
        zoneCoverageCellByShotId.set(shotId, {
          shotId,
          boardId: trimOptionalString(cell.boardId ?? cell.board_id ?? boardId),
          artifactKey: trimOptionalString(cell.artifactKey ?? cell.artifact_key) || null,
          assetKey,
          assetUrl: resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null),
          status: 'ready',
        })
      })
    }
    if (!boardId) continue
    const assetKey = trimOptionalString(board.boardAssetKey ?? board.board_asset_key ?? board.assetKey ?? board.asset_key)
    zoneCoverageBoardById.set(boardId, {
      ...(zoneCoverageBoardById.get(boardId) ?? {
        id: boardId,
        boardId,
        sceneId: '',
        setId: '',
        zoneId: '',
        chunkIndex: 0,
        shotIds: [],
        sourceHash: '',
        requestId: null,
        workflowId: null,
        runId: null,
        active: false,
        failed: false,
        assetKey: null,
        assetUrl: null,
      }),
      sceneId: trimOptionalString(metadata.sceneId ?? metadata.scene_id ?? board.sceneId ?? board.scene_id),
      setId: trimOptionalString(metadata.setId ?? metadata.set_id ?? board.setId ?? board.set_id),
      zoneId: trimOptionalString(metadata.zoneId ?? metadata.zone_id ?? board.zoneId ?? board.zone_id),
      chunkIndex: Number(metadata.chunkIndex ?? metadata.chunk_index ?? board.chunkIndex ?? board.chunk_index ?? 0) || 0,
      shotIds,
      sourceHash: trimOptionalString(metadata.sourceHash ?? metadata.source_hash ?? board.sourceHash ?? board.source_hash),
      requestId: request.id,
      workflowId: request.workflowId,
      runId: request.latestRunId,
      active,
      failed,
      assetKey: assetKey || zoneCoverageBoardById.get(boardId)?.assetKey || null,
      assetUrl: assetKey ? resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null) : zoneCoverageBoardById.get(boardId)?.assetUrl ?? null,
    })
  }

  const coverageIntentActiveShotIds = new Set<string>()
  const coverageIntentFailedShotIds = new Set<string>()
  for (const request of [...input.coverageIntentRequests].sort((left, right) => sequenceAnimaticRequestUpdatedAtMs(right) - sequenceAnimaticRequestUpdatedAtMs(left))) {
    const metadata = readLooseRecord(request.metadata)
    if (metadata.sequenceAnimaticStale === true) continue
    const run = input.coverageIntentRunByRequestId.get(request.id) ?? null
    const intentBatch = readLooseRecord(metadata.intentBatch ?? metadata.intent_batch)
    const shotIds = readLooseArray(metadata.shotIds ?? metadata.shot_ids ?? intentBatch.shotIds ?? intentBatch.shot_ids)
      .map(trimOptionalString)
      .filter(Boolean)
    const active = sequenceAnimaticRequestIsActive(request, run)
    const failed = request.status === 'failed' || run?.status === 'failed' || outputWorkflowRunHasFailedExecution(run)
    if (active) shotIds.forEach((shotId) => coverageIntentActiveShotIds.add(shotId))
    if (failed) shotIds.forEach((shotId) => coverageIntentFailedShotIds.add(shotId))
  }

  const zoneCoverageBoards = [...zoneCoverageBoardById.values()].sort((left, right) => {
    if (left.sceneId !== right.sceneId) return left.sceneId.localeCompare(right.sceneId)
    if (left.setId !== right.setId) return left.setId.localeCompare(right.setId)
    if (left.zoneId !== right.zoneId) return left.zoneId.localeCompare(right.zoneId)
    return left.chunkIndex - right.chunkIndex
  })
  const coverageSetupById = new Map(input.coverageSetups
    .map((setup) => [trimOptionalString(setup.id), setup] as const)
    .filter(([setupId]) => Boolean(setupId)))
  const coverageSetupIdForShot = (shot: Record<string, unknown>) => {
    const shotId = trimOptionalString(shot.id)
    return (shotId ? trimOptionalString(input.registryCoverageSetupByShotId[shotId]) : '')
      || trimOptionalString(shot.coverageSetupId ?? shot.coverage_setup_id)
  }
  const coverageAnchorRequestBySetupId = new Map<string, OutputRequest>()
  for (const request of [...input.coverageAnchorRequests].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const setupId = trimOptionalString(readLooseRecord(request.metadata).coverageSetupId)
    if (setupId && !coverageAnchorRequestBySetupId.has(setupId)) coverageAnchorRequestBySetupId.set(setupId, request)
  }
  const coverageAnchorViews: SequenceAnimaticCoverageAnchorView[] = input.coverageSetups.map((setup): SequenceAnimaticCoverageAnchorView => {
    const setupId = trimOptionalString(setup.id)
    const request = coverageAnchorRequestBySetupId.get(setupId) ?? null
    const run = request ? input.coverageAnchorRunByRequestId.get(request.id) ?? null : null
    const shotProductionCoverageRun = input.shotProductionCoverageRunBySetupId.get(setupId) ?? null
    const artifact = input.coverageAnchorArtifactBySetupId.get(setupId) ?? null
    const active = Boolean(shotProductionCoverageRun) || sequenceAnimaticRequestIsActive(request, run)
    const failed = request?.status === 'failed'
      || run?.status === 'failed'
      || shotProductionCoverageRun?.status === 'failed'
      || outputRunStepForNode(run, 'coverage_anchor_artifact')?.status === 'failed'
      || outputRunStepForNode(run, 'coverage_anchor_image')?.status === 'failed'
      || outputRunStepForNode(shotProductionCoverageRun, 'coverage_anchor_artifact')?.status === 'failed'
      || outputRunStepForNode(shotProductionCoverageRun, 'coverage_anchor_image')?.status === 'failed'
    const status: SequenceAnimaticCoverageAnchorView['status'] = active
      ? 'generating'
      : artifact?.assetKey
        ? 'ready'
        : failed
          ? 'failed'
          : request
            ? 'queued'
            : 'missing'
    const statusLabel = status === 'ready'
      ? 'Anchor ready'
      : status === 'generating'
        ? 'Generating anchor'
        : status === 'failed'
          ? 'Anchor failed'
          : status === 'queued'
            ? 'Anchor queued'
            : 'Anchor missing'
    const setupKind = trimOptionalString(setup.setupKind ?? setup.setup_kind)
    const shotIds = readLooseArray(setup.usedShotIds ?? setup.used_shot_ids ?? setup.shotIds ?? setup.shot_ids).map(trimOptionalString).filter(Boolean)
    const setupCamera = readLooseRecord(setup.camera)
    const cameraLabel = [
      trimOptionalString(setupCamera.framing),
      trimOptionalString(setupCamera.angle),
      trimOptionalString(setupCamera.lens),
      trimOptionalString(setupCamera.movement),
      trimOptionalString(setupCamera.screenDirectionRule ?? setupCamera.screen_direction_rule),
    ].filter(Boolean).join(' / ')
    const displayTitle = trimOptionalString(setup.displayTitle ?? setup.display_title ?? setup.title) || displayNameFromRefId(setupId)
    const usageLabel = sequenceAnimaticCoverageUsageLabel({ shotIds })
    const usageDetailLabel = sequenceAnimaticCoverageUsageDetailLabel({ shotIds })
    return {
      id: setupId,
      title: displayTitle,
      displayTitle,
      setupKind,
      setupKindLabel: setupKind ? setupKind.replace(/_/g, ' ') : 'coverage setup',
      status,
      statusLabel,
      assetKey: artifact?.assetKey ?? null,
      assetUrl: artifact?.assetUrl ?? null,
      requestId: request?.id ?? null,
      workflowId: request?.workflowId ?? null,
      running: active,
      setId: trimOptionalString(setup.setId ?? setup.set_id),
      zoneId: trimOptionalString(setup.zoneId ?? setup.zone_id),
      primarySpotId: trimOptionalString(setup.primarySpotId ?? setup.primary_spot_id),
      spotIds: readLooseArray(setup.spotIds ?? setup.spot_ids).map(trimOptionalString).filter(Boolean),
      viewpointId: trimOptionalString(setup.viewpointId ?? setup.viewpoint_id),
      characterRefIds: readLooseArray(setup.characterRefIds ?? setup.character_ref_ids).map(trimOptionalString).filter(Boolean),
      screenDirection: trimOptionalString(setup.screenDirection ?? setup.screen_direction),
      camera: cameraLabel,
      lighting: trimOptionalString(setup.lighting),
      stagingBrief: trimOptionalString(setup.stagingBrief ?? setup.staging_brief),
      continuityFromSetupId: trimOptionalString(setup.continuityFromSetupId ?? setup.continuity_from_setup_id),
      continuityMode: trimOptionalString(setup.continuityMode ?? setup.continuity_mode),
      shotIds,
      blockIds: readLooseArray(setup.blockIds ?? setup.block_ids ?? setup.storyboardBlockIds ?? setup.storyboard_block_ids).map(trimOptionalString).filter(Boolean),
      createdFromShotId: trimOptionalString(setup.createdFromShotId ?? setup.created_from_shot_id),
      firstUsedShotId: trimOptionalString(setup.firstUsedShotId ?? setup.first_used_shot_id),
      reuseReason: trimOptionalString(setup.reuseReason ?? setup.reuse_reason),
      usageLabel,
      usageDetailLabel,
    }
  }).filter((anchor) => Boolean(anchor.id))
  const coverageSetupLabel = (shot: Record<string, unknown>) => {
    const setupId = coverageSetupIdForShot(shot)
    const setup = setupId ? coverageSetupById.get(setupId) ?? null : null
    const title = trimOptionalString(setup?.displayTitle ?? setup?.display_title ?? setup?.title)
    const kind = trimOptionalString(setup?.setupKind ?? setup?.setup_kind)
    const shotIds = readLooseArray(setup?.usedShotIds ?? setup?.used_shot_ids ?? setup?.shotIds ?? setup?.shot_ids).map(trimOptionalString).filter(Boolean)
    if (title) return shotIds.length > 1 ? `${title} · ${sequenceAnimaticCoverageUsageLabel({ shotIds })}` : title
    if (kind) return kind.replace(/_/g, ' ')
    return setupId ? displayNameFromRefId(setupId) : ''
  }
  const coverageSetupDetail = (shot: Record<string, unknown>) => {
    const setupId = coverageSetupIdForShot(shot)
    const setup = setupId ? coverageSetupById.get(setupId) ?? null : null
    if (!setupId) return ''
    const shotIds = readLooseArray(setup?.usedShotIds ?? setup?.used_shot_ids ?? setup?.shotIds ?? setup?.shot_ids).map(trimOptionalString).filter(Boolean)
    const createdFromShotId = trimOptionalString(setup?.createdFromShotId ?? setup?.created_from_shot_id)
    const reuseReason = trimOptionalString(setup?.reuseReason ?? setup?.reuse_reason)
    return [
      trimOptionalString(setup?.displayTitle ?? setup?.display_title ?? setup?.title) || displayNameFromRefId(setupId),
      shotIds.length > 0 ? sequenceAnimaticCoverageUsageDetailLabel({ shotIds }) : '',
      createdFromShotId ? `Created from ${sequenceAnimaticCoverageShotLabel(createdFromShotId)}` : '',
      reuseReason,
      trimOptionalString(setup?.setupKind ?? setup?.setup_kind).replace(/_/g, ' '),
      trimOptionalString(setup?.screenDirection ?? setup?.screen_direction),
      trimOptionalString(setup?.stagingBrief ?? setup?.staging_brief),
    ].filter(Boolean).join(' / ')
  }

  return {
    zoneCoverageCellByShotId,
    zoneCoverageActiveShotIds,
    zoneCoverageActiveStageByShotId,
    zoneCoverageFailedShotIds,
    coverageIntentByShotId,
    coverageIntentActiveShotIds,
    coverageIntentFailedShotIds,
    zoneCoverageBoards,
    coverageSetupById,
    coverageSetupIdForShot,
    coverageAnchorViews,
    coverageSetupLabel,
    coverageSetupDetail,
  }
}
