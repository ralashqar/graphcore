import type {
  OutputRequest,
  SequenceAnimaticStateResponse,
} from '../../../domain/outputWorkflow'

import {
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'

export type SequenceAnimaticSceneView = {
  id: string
  index: number
  title: string
  summary: string
  status: 'pending' | 'planning' | 'ready' | 'failed'
  requestId: string | null
  shotCount: number
}

export function sequenceAnimaticSceneIdFromShotId(shotId: string) {
  return /^(.+)_shot_\d+/.exec(shotId)?.[1] ?? ''
}

export function sequenceAnimaticSceneIdForShot(shot: Record<string, unknown>) {
  const binding = readLooseRecord(shot.sceneBinding ?? shot.scene_binding)
  const explicit = trimOptionalString(
    shot.sourceSceneId
    ?? shot.source_scene_id
    ?? shot.sceneId
    ?? shot.scene_id
    ?? binding.sceneId
    ?? binding.scene_id,
  )
  if (explicit) return explicit
  return /^scene_\d+/i.exec(trimOptionalString(shot.id))?.[0] ?? ''
}

export function sequenceAnimaticBlockSceneId(block: { id: string; shots: ReadonlyArray<{ id: string }> }) {
  for (const shot of block.shots) {
    const sceneId = sequenceAnimaticSceneIdFromShotId(shot.id)
    if (sceneId) return sceneId
  }
  return /^(.+)_block_\d+/.exec(block.id)?.[1] ?? ''
}

export function sequenceAnimaticBlocksForScene<TBlock extends { id: string; shots: ReadonlyArray<{ id: string }> }>(
  model: { blocks: readonly TBlock[] },
  scene: Pick<SequenceAnimaticSceneView, 'id'>,
) {
  return model.blocks.filter((block) => {
    const sceneId = sequenceAnimaticBlockSceneId(block)
    return !sceneId || sceneId === scene.id
  })
}

export function buildSequenceAnimaticSceneViews(input: {
  sequenceState: SequenceAnimaticStateResponse | null
  requests: readonly OutputRequest[]
  masterRequestId: string
  blocks: ReadonlyArray<{ id: string; shots: ReadonlyArray<{ id: string }> }>
}): SequenceAnimaticSceneView[] {
  const sceneChildren = input.requests.filter((request) => {
    if (request.parentRequestId !== input.masterRequestId) return false
    const metadata = readLooseRecord(request.metadata)
    return (trimOptionalString(metadata.sequenceAnimaticRole) || trimOptionalString(metadata.screenplayAnimaticRole)) === 'scene_shot_plan'
  })
  const childBySceneId = new Map(sceneChildren
    .map((request) => [trimOptionalString(readLooseRecord(request.metadata).sceneId), request] as const)
    .filter(([id]) => id))
  const shotCountBySceneId = new Map<string, number>()
  for (const block of input.blocks) {
    const sceneId = sequenceAnimaticBlockSceneId(block)
    if (!sceneId) continue
    shotCountBySceneId.set(sceneId, (shotCountBySceneId.get(sceneId) ?? 0) + block.shots.length)
  }
  return (input.sequenceState?.scenes ?? [])
    .map((raw) => {
      const record = readLooseRecord(raw)
      const id = trimOptionalString(record.id)
      if (!id) return null
      const child = childBySceneId.get(id) ?? null
      const shotCount = shotCountBySceneId.get(id) ?? 0
      const status: SequenceAnimaticSceneView['status'] = child && (child.status === 'running' || child.status === 'queued' || child.status === 'planning')
        ? 'planning'
        : child?.status === 'completed'
          ? 'ready'
          : child?.status === 'failed'
            ? 'failed'
            : 'pending'
      return {
        id,
        index: Number(record.index ?? 0) || 0,
        title: trimOptionalString(record.title) || id,
        summary: trimOptionalString(record.summary) || '',
        status,
        requestId: child?.id ?? null,
        shotCount,
      }
    })
    .filter((scene): scene is SequenceAnimaticSceneView => Boolean(scene))
    .sort((left, right) => (left.index || 9999) - (right.index || 9999))
}
