import { resolveAssetSourceUrl } from '../../../domain/assets'
import type { AssetDefinition } from '../../../domain/graphcore'
import type { OutputArtifact, OutputRequest } from '../../../domain/outputWorkflow'

import {
  readLooseArray,
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'
import { artifactBelongsToRequest } from './sequenceAnimaticRuntimePresentation'

export function buildSequenceAnimaticArtifactIndexes(input: {
  assets: readonly AssetDefinition[]
  shotRevisionArtifacts: readonly OutputArtifact[]
  plannedKeyframeArtifacts: readonly OutputArtifact[]
  coverageAnchorArtifacts: readonly OutputArtifact[]
  shotRevisionRequests: readonly OutputRequest[]
  plannedKeyframeRequests: readonly OutputRequest[]
}) {
  const assetByKey = new Map(input.assets.map((asset) => [asset.key, asset] as const))
  const completedRevisionByShotId = new Map<string, {
    request: OutputRequest | null
    artifact: OutputArtifact
    revision: Record<string, unknown>
    revisedShot: Record<string, unknown>
    keyframeAssetKey: string
    keyframeUrl: string | null
  }>()
  for (const artifact of [...input.shotRevisionArtifacts].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    const metadata = readLooseRecord(artifact.metadata)
    if (trimOptionalString(metadata.role) !== 'sequence_animatic_shot_revision') continue
    const revision = readLooseRecord(metadata.revision)
    const revisedShot = readLooseRecord(metadata.revisedShot ?? revision.revisedShot)
    const shotId = trimOptionalString(metadata.shotId) || trimOptionalString(revision.shotId) || trimOptionalString(revisedShot.id)
    if (!shotId || completedRevisionByShotId.has(shotId) || Object.keys(revisedShot).length === 0) continue
    const keyframeAssetKey = trimOptionalString(metadata.keyframeAssetKey) || trimOptionalString(revision.keyframeAssetKey) || trimOptionalString(artifact.assetKey)
    completedRevisionByShotId.set(shotId, {
      request: input.shotRevisionRequests.find((request) => artifactBelongsToRequest(artifact, request)) ?? null,
      artifact,
      revision,
      revisedShot,
      keyframeAssetKey,
      keyframeUrl: keyframeAssetKey ? resolveAssetSourceUrl(assetByKey.get(keyframeAssetKey) ?? null) : null,
    })
  }

  const completedPlannedKeyframeByShotId = new Map<string, {
    request: OutputRequest | null
    artifact: OutputArtifact
    keyframe: Record<string, unknown>
    keyframeAssetKey: string
    keyframeUrl: string | null
  }>()
  for (const artifact of [...input.plannedKeyframeArtifacts].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    const metadata = readLooseRecord(artifact.metadata)
    if (trimOptionalString(metadata.role) !== 'sequence_animatic_shot_keyframe') continue
    const keyframe = readLooseRecord(metadata.keyframe ?? metadata.shotKeyframe ?? metadata.shot_keyframe)
    const shotId = trimOptionalString(metadata.shotId) || trimOptionalString(keyframe.shotId)
    if (!shotId || completedPlannedKeyframeByShotId.has(shotId)) continue
    const keyframeAssetKey = trimOptionalString(metadata.assetKey) || trimOptionalString(keyframe.assetKey) || trimOptionalString(artifact.assetKey)
    if (!keyframeAssetKey) continue
    completedPlannedKeyframeByShotId.set(shotId, {
      request: input.plannedKeyframeRequests.find((request) => artifactBelongsToRequest(artifact, request)) ?? null,
      artifact,
      keyframe,
      keyframeAssetKey,
      keyframeUrl: resolveAssetSourceUrl(assetByKey.get(keyframeAssetKey) ?? null),
    })
  }

  const coverageAnchorArtifactBySetupId = new Map<string, {
    artifact: OutputArtifact
    assetKey: string
    assetUrl: string | null
  }>()
  const coverageAnchorArtifactByShotId = new Map<string, {
    artifact: OutputArtifact
    assetKey: string
    assetUrl: string | null
  }>()
  for (const artifact of [...input.coverageAnchorArtifacts].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    const metadata = readLooseRecord(artifact.metadata)
    if (trimOptionalString(metadata.role) !== 'sequence_animatic_coverage_anchor') continue
    const anchor = readLooseRecord(metadata.anchor)
    const setupId = trimOptionalString(metadata.coverageSetupId) || trimOptionalString(anchor.coverageSetupId)
    const image = readLooseRecord(metadata.image)
    const assetKey = trimOptionalString(metadata.assetKey)
      || trimOptionalString(anchor.assetKey)
      || trimOptionalString(image.assetKey)
      || trimOptionalString(artifact.assetKey)
    if (!assetKey) continue
    const assetUrl = resolveAssetSourceUrl(assetByKey.get(assetKey) ?? null)
    const request = input.plannedKeyframeRequests.find((candidate) => artifactBelongsToRequest(artifact, candidate)) ?? null
    const singleShotId = readLooseArray(metadata.coverageAnchorShotIds ?? metadata.shotIds).map(trimOptionalString).filter(Boolean)
    const shotId = trimOptionalString(metadata.shotId)
      || trimOptionalString(anchor.shotId)
      || trimOptionalString(readLooseRecord(request?.metadata).shotId)
      || (singleShotId.length === 1 ? singleShotId[0] ?? '' : '')
    if (shotId && !coverageAnchorArtifactByShotId.has(shotId)) {
      coverageAnchorArtifactByShotId.set(shotId, {
        artifact,
        assetKey,
        assetUrl,
      })
    }
    if (!setupId || coverageAnchorArtifactBySetupId.has(setupId)) continue
    coverageAnchorArtifactBySetupId.set(setupId, {
      artifact,
      assetKey,
      assetUrl,
    })
  }

  return {
    completedRevisionByShotId,
    completedPlannedKeyframeByShotId,
    coverageAnchorArtifactBySetupId,
    coverageAnchorArtifactByShotId,
  }
}
