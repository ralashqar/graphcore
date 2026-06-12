type LooseRecord = Record<string, unknown>

export type SequenceAnimaticVisualReferenceStatus = 'ready' | 'missing' | 'blocked' | 'stale'

export type SequenceAnimaticVisualReferencePlan = {
  version: 'sequence_animatic_visual_reference_plan_v1'
  visualPlanHash: string
  dependencyReadiness: {
    status: 'ready_for_keyframes' | 'ready_for_coverage_anchors' | 'waiting_for_coverage_anchor' | 'waiting_for_keyframe_refs' | 'waiting_for_continuity_assets'
    dependencyNodeIds: string[]
    missingDependencyNodeIds: string[]
    readyDependencyNodeIds: string[]
  }
  counts: {
    dependencyRefs: number
    missingDependencyRefs: number
    coverageAnchors: number
    readyCoverageAnchors: number
    shotKeyframes: number
    readyShotKeyframes: number
    blockedShotKeyframes: number
  }
  coverageAnchors: Array<{
    coverageSetupId: string
    status: SequenceAnimaticVisualReferenceStatus
    shotIds: string[]
    requiredReferenceAssetKeys: string[]
    sourceReferenceHash: string
  }>
  shotKeyframes: Array<{
    shotId: string
    storyboardBlockId: string
    coverageSetupId: string
    status: SequenceAnimaticVisualReferenceStatus
    requiredReferenceAssetKeys: string[]
    omittedReferenceAssetKeys: string[]
    blockingAssetIds: string[]
    sourceReferenceHash: string
  }>
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as LooseRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function sequenceAnimaticVisualReferenceHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function readSequenceAnimaticContinuityLinkMode(shot: LooseRecord): string {
  const link = shot.continuityLink ?? shot.continuity_link
  if (typeof link === 'string') return link.trim().toLowerCase()
  const record = asRecord(link)
  return readText(record.mode ?? record.continuityMode ?? record.continuity_mode).toLowerCase()
}

export function sequenceAnimaticContinuityLinkRequiresPrevious(shot: LooseRecord): boolean {
  return ['match_action', 'blocking_change', 'continuation', 'same_motion', 'same_action']
    .includes(readSequenceAnimaticContinuityLinkMode(shot))
}

export function buildSequenceAnimaticVisualReferencePlan(input: {
  keyframePlan: LooseRecord
  dependencyNodeIds: string[]
  missingDependencyNodeIds: string[]
  coverageAnchorAssetKeysBySetupId: Record<string, string>
  shotKeyframeAssetKeysByShotId: Record<string, string>
  coverageAnchorReferenceAssetKeysBySetupId?: Record<string, string[]>
  shotRequiredReferenceAssetKeysByShotId?: Record<string, string[]>
  shotOmittedReferenceAssetKeysByShotId?: Record<string, string[]>
  shotBlockingDependencyNodeIdsByShotId?: Record<string, string[]>
}): SequenceAnimaticVisualReferencePlan {
  const dependencyNodeIds = uniqueStrings(input.dependencyNodeIds)
  const missingDependencyNodeIds = uniqueStrings(input.missingDependencyNodeIds)
  const missingSet = new Set(missingDependencyNodeIds)
  const readyDependencyNodeIds = dependencyNodeIds.filter((nodeId) => !missingSet.has(nodeId))
  const coverageAnchorJobs = readArray(input.keyframePlan.coverageAnchorJobs).map(asRecord)
  const shotKeyframeJobs = readArray(input.keyframePlan.shotKeyframeJobs).map(asRecord)

  const coverageAnchors = coverageAnchorJobs.map((job) => {
    const coverageSetupId = readText(job.coverageSetupId)
    const requiredReferenceAssetKeys = uniqueStrings(input.coverageAnchorReferenceAssetKeysBySetupId?.[coverageSetupId] ?? [])
    const assetKey = readText(input.coverageAnchorAssetKeysBySetupId[coverageSetupId])
    return {
      coverageSetupId,
      status: assetKey ? 'ready' as const : 'missing' as const,
      shotIds: readStringArray(job.shotIds),
      requiredReferenceAssetKeys,
      sourceReferenceHash: sequenceAnimaticVisualReferenceHash({ coverageSetupId, requiredReferenceAssetKeys }),
    }
  })

  const coverageReady = new Set(
    Object.entries(input.coverageAnchorAssetKeysBySetupId)
      .filter(([, assetKey]) => readText(assetKey))
      .map(([setupId]) => setupId),
  )
  const shotKeyframes = shotKeyframeJobs.map((job) => {
    const shotId = readText(job.shotId)
    const coverageSetupId = readText(job.coverageSetupId)
    const requiredReferenceAssetKeys = uniqueStrings(input.shotRequiredReferenceAssetKeysByShotId?.[shotId] ?? [])
    const omittedReferenceAssetKeys = uniqueStrings(input.shotOmittedReferenceAssetKeysByShotId?.[shotId] ?? [])
    const blockingDependencyNodeIds = uniqueStrings(input.shotBlockingDependencyNodeIdsByShotId?.[shotId] ?? [])
    const blockingAssetIds = [
      ...blockingDependencyNodeIds.map((nodeId) => `continuity:${nodeId}`),
      job.requiresCoverageAnchor === true && coverageSetupId && !coverageReady.has(coverageSetupId) ? `coverage:${coverageSetupId}` : '',
      readText(job.previousShotId) && !readText(input.shotKeyframeAssetKeysByShotId[readText(job.previousShotId)]) ? `shot:${readText(job.previousShotId)}` : '',
    ].filter(Boolean)
    const assetKey = readText(input.shotKeyframeAssetKeysByShotId[shotId])
    return {
      shotId,
      storyboardBlockId: readText(job.storyboardBlockId),
      coverageSetupId,
      status: assetKey ? 'ready' as const : blockingAssetIds.length > 0 ? 'blocked' as const : 'missing' as const,
      requiredReferenceAssetKeys,
      omittedReferenceAssetKeys,
      blockingAssetIds,
      sourceReferenceHash: sequenceAnimaticVisualReferenceHash({ shotId, coverageSetupId, requiredReferenceAssetKeys, omittedReferenceAssetKeys }),
    }
  })

  const readyCoverageAnchors = coverageAnchors.filter((entry) => entry.status === 'ready').length
  const readyShotKeyframes = shotKeyframes.filter((entry) => entry.status === 'ready').length
  const blockedShotKeyframes = shotKeyframes.filter((entry) => entry.status === 'blocked').length
  const dependencyReadinessStatus = missingDependencyNodeIds.length > 0
    ? 'waiting_for_keyframe_refs' as const
    : coverageAnchors.some((entry) => entry.status !== 'ready')
      ? 'waiting_for_coverage_anchor' as const
      : blockedShotKeyframes > 0
        ? 'waiting_for_keyframe_refs' as const
        : 'ready_for_keyframes' as const
  return {
    version: 'sequence_animatic_visual_reference_plan_v1',
    visualPlanHash: sequenceAnimaticVisualReferenceHash({
      dependencyNodeIds,
      missingDependencyNodeIds,
      coverageAnchors,
      shotKeyframes,
    }),
    dependencyReadiness: {
      status: dependencyReadinessStatus,
      dependencyNodeIds,
      missingDependencyNodeIds,
      readyDependencyNodeIds,
    },
    counts: {
      dependencyRefs: dependencyNodeIds.length,
      missingDependencyRefs: missingDependencyNodeIds.length,
      coverageAnchors: coverageAnchors.length,
      readyCoverageAnchors,
      shotKeyframes: shotKeyframes.length,
      readyShotKeyframes,
      blockedShotKeyframes,
    },
    coverageAnchors,
    shotKeyframes,
  }
}
