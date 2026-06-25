import type {
  SequenceAnimaticContinuityAssetRunGroup,
  SequenceAnimaticContinuityAssetTargetView,
} from '../scene-board/sceneBoardProjection'
import {
  readLooseRecord,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers.ts'

type ContinuityCommandPlanningModel = {
  continuityGraphView: {
    nodes: readonly {
      id: string
      kind?: string
      parentId?: string | null
    }[]
  }
  continuityAssetTargets: readonly SequenceAnimaticContinuityAssetTargetView[]
}

export type SequenceAnimaticContinuityCommandMode = 'generate' | 'regenerate'

export type SequenceAnimaticContinuityCommandAction =
  | 'generate_node'
  | 'regenerate_node'
  | 'generate_camera_grid'
  | 'generate_missing'

export type SequenceAnimaticContinuityCommandPlan = {
  action: SequenceAnimaticContinuityCommandAction
  mode: SequenceAnimaticContinuityCommandMode
  status: 'ready' | 'blocked' | 'noop'
  targets: SequenceAnimaticContinuityAssetTargetView[]
  runGroups: SequenceAnimaticContinuityAssetRunGroup[]
  blockedParentNodeIds: string[]
  staleDescendantNodeIds: string[]
  diagnostics: string[]
  forceRefresh: boolean
}

function continuityGraphNodeById(model: ContinuityCommandPlanningModel) {
  return new Map(model.continuityGraphView.nodes.map((node) => [node.id, node] as const))
}

export function downstreamContinuityTargetNodeIds(input: {
  model: ContinuityCommandPlanningModel
  sourceNodeId: string
}) {
  const graphNodeById = continuityGraphNodeById(input.model)
  const childrenByParentId = new Map<string, string[]>()
  for (const node of input.model.continuityGraphView.nodes) {
    const parentId = trimOptionalString(readLooseRecord(node).parentId)
    if (!parentId) continue
    childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), node.id])
  }
  const result = new Set<string>()
  const queue = [...(childrenByParentId.get(input.sourceNodeId) ?? [])]
  while (queue.length > 0) {
    const nodeId = queue.shift() ?? ''
    if (!nodeId || result.has(nodeId)) continue
    result.add(nodeId)
    queue.push(...(childrenByParentId.get(nodeId) ?? []))
  }
  return [...result].filter((nodeId) => graphNodeById.has(nodeId))
}

export function continuityTargetCanGenerate(input: {
  model: ContinuityCommandPlanningModel
  target: SequenceAnimaticContinuityAssetTargetView
  mode?: SequenceAnimaticContinuityCommandMode
}) {
  const graphNodeById = continuityGraphNodeById(input.model)
  const targetByNodeId = new Map(input.model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const node = graphNodeById.get(input.target.nodeId)
  const targetIsLocalReference = input.target.assetKind.includes('character') || input.target.assetKind.includes('prop')
  if (!node && targetIsLocalReference) return { ok: true, blockedParentNodeIds: [], diagnostics: [] }
  if (!node) return { ok: false, blockedParentNodeIds: [], diagnostics: [`Continuity node is not in the current scene graph: ${input.target.nodeId}.`] }
  if (input.target.status === 'generating') return { ok: false, blockedParentNodeIds: [], diagnostics: [`${input.target.name || input.target.nodeId} is already generating.`] }
  if (input.mode !== 'regenerate' && input.target.status === 'ready') {
    return { ok: false, blockedParentNodeIds: [], diagnostics: [`${input.target.name || input.target.nodeId} is already ready.`] }
  }
  const parentId = trimOptionalString(readLooseRecord(node).parentId)
  if (!parentId) return { ok: true, blockedParentNodeIds: [], diagnostics: [] }
  const parentNode = graphNodeById.get(parentId) ?? null
  if (!parentNode || parentNode.kind === 'world_location') return { ok: true, blockedParentNodeIds: [], diagnostics: [] }
  const parentTarget = targetByNodeId.get(parentId) ?? null
  if (!parentTarget || parentTarget.status === 'ready') return { ok: true, blockedParentNodeIds: [], diagnostics: [] }
  return {
    ok: false,
    blockedParentNodeIds: [parentId],
    diagnostics: [`Generate parent continuity asset first: ${parentTarget.name || parentId}.`],
  }
}

export function continuityAssetRunGroups(
  model: ContinuityCommandPlanningModel,
  targets: readonly SequenceAnimaticContinuityAssetTargetView[],
  options: { batchKind?: SequenceAnimaticContinuityAssetRunGroup['batchKind']; forceRefresh?: boolean } = {},
): SequenceAnimaticContinuityAssetRunGroup[] {
  const graphNodeById = continuityGraphNodeById(model)
  const targetByNodeId = new Map(model.continuityAssetTargets.map((target) => [target.nodeId, target] as const))
  const unresolved = targets.filter((target) => (
    options.forceRefresh
      ? target.status !== 'generating'
      : ['missing', 'stale', 'failed'].includes(target.status)
  ))
  if (options.batchKind === 'spot_camera_grid' && unresolved.length > 0) {
    return [{ targets: unresolved.slice(0, 9), isBatch: unresolved.length > 1, batchKind: 'spot_camera_grid' }]
  }
  const missingParentIds = new Set<string>()
  for (const target of unresolved) {
    const parentId = trimOptionalString(readLooseRecord(graphNodeById.get(target.nodeId)).parentId)
    const parentTarget = parentId ? targetByNodeId.get(parentId) ?? null : null
    if (parentTarget && ['missing', 'stale', 'failed'].includes(parentTarget.status)) missingParentIds.add(parentId)
  }
  const consumedNodeIds = new Set<string>()
  const scaffoldGroups: SequenceAnimaticContinuityAssetRunGroup[] = []
  for (const parentId of missingParentIds) {
    const parentTarget = unresolved.find((target) => target.nodeId === parentId) ?? null
    if (!parentTarget) continue
    const childTargets = unresolved
      .filter((target) => trimOptionalString(readLooseRecord(graphNodeById.get(target.nodeId)).parentId) === parentId)
      .filter((target) => {
        const node = graphNodeById.get(target.nodeId) ?? null
        const kind = node?.kind
        return kind === 'zone' || kind === 'spot' || kind === 'viewpoint' || kind === 'angle' || target.assetKind.includes('spot') || target.assetKind.includes('viewpoint') || target.assetKind.includes('angle')
      })
      .slice(0, 8)
    if (childTargets.length === 0) continue
    const groupTargets = [parentTarget, ...childTargets]
    groupTargets.forEach((target) => consumedNodeIds.add(target.nodeId))
    scaffoldGroups.push({ targets: groupTargets, isBatch: true })
  }
  const eligible = unresolved.filter((target) => !consumedNodeIds.has(target.nodeId))
  const grouped = new Map<string, SequenceAnimaticContinuityAssetTargetView[]>()
  const singles: SequenceAnimaticContinuityAssetRunGroup[] = []
  for (const target of eligible) {
    const node = graphNodeById.get(target.nodeId) ?? null
    const kind = node?.kind
    if (target.assetKind === 'spot_camera_grid' || kind === 'camera_grid') {
      singles.push({ targets: [target], isBatch: false })
      continue
    }
    const isSpot = kind === 'spot' || target.assetKind.includes('spot')
    const isViewpoint = kind === 'viewpoint' || kind === 'angle' || target.assetKind.includes('angle') || target.assetKind.includes('viewpoint')
    if (!isSpot && !isViewpoint) {
      singles.push({ targets: [target], isBatch: false })
      continue
    }
    const parentId = trimOptionalString(readLooseRecord(node).parentId)
    if (!parentId) {
      singles.push({ targets: [target], isBatch: false })
      continue
    }
    const key = `${isSpot ? 'spot_grid' : 'viewpoint_grid'}:${parentId}`
    grouped.set(key, [...(grouped.get(key) ?? []), target])
  }
  const batched = [...grouped.values()].flatMap((group) => {
    if (group.length <= 1) return group.map((target) => ({ targets: [target], isBatch: false }))
    const chunks: SequenceAnimaticContinuityAssetRunGroup[] = []
    for (let index = 0; index < group.length; index += 9) {
      const chunk = group.slice(index, index + 9)
      chunks.push({ targets: chunk, isBatch: chunk.length > 1 })
    }
    return chunks
  })
  return [...scaffoldGroups, ...batched, ...singles]
}

export function planSequenceAnimaticContinuityCommand(input: {
  model: ContinuityCommandPlanningModel
  action: SequenceAnimaticContinuityCommandAction
  targets: readonly SequenceAnimaticContinuityAssetTargetView[]
  batchKind?: SequenceAnimaticContinuityAssetRunGroup['batchKind']
}) {
  const mode: SequenceAnimaticContinuityCommandMode = input.action === 'regenerate_node' ? 'regenerate' : 'generate'
  const forceRefresh = mode === 'regenerate'
  const targetCandidates = input.targets.filter((target) => forceRefresh
    ? target.status !== 'generating'
    : ['missing', 'stale', 'failed'].includes(target.status))
  if (targetCandidates.length === 0) {
    return {
      action: input.action,
      mode,
      status: 'noop',
      targets: [],
      runGroups: [],
      blockedParentNodeIds: [],
      staleDescendantNodeIds: [],
      diagnostics: ['No eligible continuity asset targets were selected.'],
      forceRefresh,
    } satisfies SequenceAnimaticContinuityCommandPlan
  }
  const blockedParentNodeIds = new Set<string>()
  const diagnostics: string[] = []
  const eligible = targetCandidates.filter((target) => {
    const decision = continuityTargetCanGenerate({ model: input.model, target, mode })
    decision.blockedParentNodeIds.forEach((nodeId) => blockedParentNodeIds.add(nodeId))
    diagnostics.push(...decision.diagnostics)
    return decision.ok
  })
  if (eligible.length === 0) {
    return {
      action: input.action,
      mode,
      status: 'blocked',
      targets: [],
      runGroups: [],
      blockedParentNodeIds: [...blockedParentNodeIds],
      staleDescendantNodeIds: [],
      diagnostics,
      forceRefresh,
    } satisfies SequenceAnimaticContinuityCommandPlan
  }
  const staleDescendantNodeIds = forceRefresh
    ? [...new Set(eligible.flatMap((target) => downstreamContinuityTargetNodeIds({ model: input.model, sourceNodeId: target.nodeId })))]
    : []
  return {
    action: input.action,
    mode,
    status: 'ready',
    targets: eligible,
    runGroups: continuityAssetRunGroups(input.model, eligible, { batchKind: input.batchKind, forceRefresh }),
    blockedParentNodeIds: [...blockedParentNodeIds],
    staleDescendantNodeIds,
    diagnostics,
    forceRefresh,
  } satisfies SequenceAnimaticContinuityCommandPlan
}
