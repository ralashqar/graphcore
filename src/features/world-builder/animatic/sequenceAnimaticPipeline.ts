/**
 * Pure derivation of the sequence-animatic pipeline rail: a single ordered
 * view of pipeline progress (Script → Continuity plan → Continuity assets →
 * Storyboards → Keyframes → Video) computed from the animatic view model.
 *
 * Lives in the animatic module (not WorldGraphPage) so it is unit-testable and
 * is the first step of extracting the animatic feature out of the page.
 */

export type SequenceAnimaticStageId =
  | 'script'
  | 'continuity_plan'
  | 'continuity_assets'
  | 'storyboards'
  | 'keyframes'
  | 'video'

export type SequenceAnimaticStageStatus = 'pending' | 'active' | 'ready' | 'partial' | 'stale' | 'failed' | 'blocked'

export type SequenceAnimaticStageView = {
  id: SequenceAnimaticStageId
  label: string
  status: SequenceAnimaticStageStatus
  /** Short progress annotation, e.g. "3/8" or "2 stale". */
  detail: string
  /** True when this is the next stage the user should act on. */
  isNextAction: boolean
}

/** Structural subset of SequenceAnimaticViewModel the rail needs. */
export type SequenceAnimaticPipelineModel = {
  screenplayMarkdown: string
  directorPlanReady: boolean
  continuityStructureRunning: boolean
  continuityGraphStatus: 'empty' | 'partial' | 'ready' | 'stale' | 'failed'
  continuityAssetGenerationStatus: 'none' | 'partial' | 'ready' | 'stale' | 'failed'
  continuityAssetTargets: ReadonlyArray<{ status: string }>
  blocks: ReadonlyArray<{
    storyboardReady: boolean
    storyboardRunning: boolean
    videoReady: boolean
    videoRunning: boolean
    videoError: string
    shots: ReadonlyArray<{ shotVideoReady?: boolean; shotVideoRunning?: boolean }>
  }>
  keyframeReadyCount: number
  keyframeTotalCount: number
  keyframeRunning: boolean
  currentStepLabel: string
}

function stage(
  id: SequenceAnimaticStageId,
  label: string,
  status: SequenceAnimaticStageStatus,
  detail = '',
): SequenceAnimaticStageView {
  return { id, label, status, detail, isNextAction: false }
}

export function deriveSequenceAnimaticPipeline(model: SequenceAnimaticPipelineModel): SequenceAnimaticStageView[] {
  const stages: SequenceAnimaticStageView[] = []

  // 1. Script
  const scriptReady = model.screenplayMarkdown.trim().length > 0 || model.directorPlanReady
  stages.push(stage(
    'script',
    'Script',
    scriptReady ? 'ready' : model.currentStepLabel ? 'active' : 'pending',
  ))

  // 2. Continuity plan (director plan + continuity graph structure)
  const planStatus: SequenceAnimaticStageStatus = model.continuityStructureRunning
    ? 'active'
    : model.continuityGraphStatus === 'ready' && model.directorPlanReady
      ? 'ready'
      : model.continuityGraphStatus === 'failed'
        ? 'failed'
        : model.continuityGraphStatus === 'stale'
          ? 'stale'
          : model.continuityGraphStatus === 'partial' || model.directorPlanReady
            ? 'partial'
            : 'pending'
  stages.push(stage('continuity_plan', 'Continuity plan', planStatus))

  // 3. Continuity assets
  const assetTotal = model.continuityAssetTargets.length
  const assetReady = model.continuityAssetTargets.filter((target) => target.status === 'ready').length
  const assetStale = model.continuityAssetTargets.filter((target) => target.status === 'stale').length
  const assetFailed = model.continuityAssetTargets.filter((target) => target.status === 'failed').length
  const assetStatus: SequenceAnimaticStageStatus = assetTotal === 0
    ? (planStatus === 'ready' ? 'pending' : 'blocked')
    : model.continuityAssetGenerationStatus === 'ready'
      ? 'ready'
      : model.continuityAssetGenerationStatus === 'failed'
        ? 'failed'
        : model.continuityAssetGenerationStatus === 'stale'
          ? 'stale'
          : model.continuityAssetGenerationStatus === 'partial'
            ? 'partial'
            : 'pending'
  const assetDetailParts: string[] = []
  if (assetTotal > 0) assetDetailParts.push(`${assetReady}/${assetTotal}`)
  if (assetStale > 0) assetDetailParts.push(`${assetStale} stale`)
  if (assetFailed > 0) assetDetailParts.push(`${assetFailed} failed`)
  stages.push(stage('continuity_assets', 'Continuity assets', assetStatus, assetDetailParts.join(' · ')))

  // 4. Storyboards
  const blockTotal = model.blocks.length
  const storyboardsReady = model.blocks.filter((block) => block.storyboardReady).length
  const storyboardsRunning = model.blocks.some((block) => block.storyboardRunning)
  const storyboardStatus: SequenceAnimaticStageStatus = blockTotal === 0
    ? 'blocked'
    : storyboardsRunning
      ? 'active'
      : storyboardsReady === blockTotal
        ? 'ready'
        : storyboardsReady > 0
          ? 'partial'
          : 'pending'
  stages.push(stage('storyboards', 'Storyboards', storyboardStatus, blockTotal > 0 ? `${storyboardsReady}/${blockTotal}` : ''))

  // 5. Keyframes
  const keyframeStatus: SequenceAnimaticStageStatus = model.keyframeRunning
    ? 'active'
    : model.keyframeTotalCount === 0
      ? 'blocked'
      : model.keyframeReadyCount >= model.keyframeTotalCount
        ? 'ready'
        : model.keyframeReadyCount > 0
          ? 'partial'
          : 'pending'
  stages.push(stage(
    'keyframes',
    'Keyframes',
    keyframeStatus,
    model.keyframeTotalCount > 0 ? `${model.keyframeReadyCount}/${model.keyframeTotalCount}` : '',
  ))

  // 6. Video
  const shotVideos = model.blocks.flatMap((block) => block.shots)
  const shotVideoTotal = shotVideos.length
  const shotVideoReady = shotVideos.filter((shot) => shot.shotVideoReady === true).length
  const blockVideoReady = model.blocks.filter((block) => block.videoReady).length
  const videoRunning = model.blocks.some((block) => block.videoRunning) || shotVideos.some((shot) => shot.shotVideoRunning === true)
  const videoFailed = model.blocks.some((block) => Boolean(block.videoError))
  const videoReadyCount = Math.max(blockVideoReady, 0) + shotVideoReady
  const videoTotal = blockTotal + shotVideoTotal
  const videoStatus: SequenceAnimaticStageStatus = videoRunning
    ? 'active'
    : videoFailed
      ? 'failed'
      : videoTotal > 0 && (blockVideoReady === blockTotal || (shotVideoTotal > 0 && shotVideoReady === shotVideoTotal))
        ? 'ready'
        : videoReadyCount > 0
          ? 'partial'
          : keyframeStatus === 'ready' || storyboardStatus === 'ready'
            ? 'pending'
            : 'blocked'
  stages.push(stage('video', 'Video', videoStatus, shotVideoTotal > 0 ? `${shotVideoReady}/${shotVideoTotal}` : blockTotal > 0 ? `${blockVideoReady}/${blockTotal}` : ''))

  // Mark the next actionable stage: first stage that is not ready, preferring
  // failed/stale (needs attention), then pending/partial after a ready stage.
  const attention = stages.find((entry) => entry.status === 'failed' || entry.status === 'stale')
  const nextPending = stages.find((entry) => entry.status === 'pending' || entry.status === 'partial')
  const target = attention ?? nextPending
  if (target) target.isNextAction = true

  return stages
}
