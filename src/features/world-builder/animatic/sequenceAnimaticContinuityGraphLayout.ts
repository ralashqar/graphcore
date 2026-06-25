import type {
  SequenceAnimaticContinuityGraphEdgeView,
  SequenceAnimaticContinuityGraphNodeKind,
  SequenceAnimaticContinuityGraphNodeView,
} from './sequenceAnimaticContinuityIndexes'

export type SequenceAnimaticContinuityGraphViewMode = 'scene_graph' | 'continuity_debug'

export type SequenceAnimaticContinuityGraphPoiHint = {
  id: string
  label: string
  kind: SequenceAnimaticContinuityGraphNodeKind
  x: number
  y: number
  status: string
  assetUrl: string | null
  matchedText: string
  confidence: number
}

export type SequenceAnimaticContinuityGraphLayoutNode = {
  node: SequenceAnimaticContinuityGraphNodeView
  parentId: string | null
  depth: number
  width: number
  height: number
  x: number
  y: number
  displayKindLabel: string
  poiHints: SequenceAnimaticContinuityGraphPoiHint[]
}

export type SequenceAnimaticContinuityGraphLayout = {
  nodes: SequenceAnimaticContinuityGraphLayoutNode[]
  edges: SequenceAnimaticContinuityGraphEdgeView[]
}

function nodeDepth(kind: SequenceAnimaticContinuityGraphNodeKind) {
  if (kind === 'world_location') return 0
  if (kind === 'set') return 1
  if (kind === 'zone') return 2
  if (kind === 'spot') return 3
  if (kind === 'camera_grid' || kind === 'viewpoint' || kind === 'angle') return 4
  if (kind === 'coverage_anchor') return 5
  return 5
}

function graphKindOrder(kind: SequenceAnimaticContinuityGraphNodeKind) {
  if (kind === 'world_location') return 0
  if (kind === 'set') return 1
  if (kind === 'zone') return 2
  if (kind === 'spot') return 3
  if (kind === 'camera_grid' || kind === 'viewpoint' || kind === 'angle') return 4
  if (kind === 'coverage_anchor') return 5
  if (kind === 'temp_character') return 6
  if (kind === 'prop') return 7
  if (kind === 'faction') return 8
  if (kind === 'vehicle') return 9
  return 10
}

function layoutNodeSize(node: SequenceAnimaticContinuityGraphNodeView, mode: SequenceAnimaticContinuityGraphViewMode) {
  if (mode === 'continuity_debug') return { width: 244, height: 116 }
  if (node.kind === 'zone') return { width: node.assetUrl ? 392 : 292, height: node.assetUrl ? 304 : 158 }
  if (node.kind === 'spot') return { width: node.assetUrl ? 286 : 246, height: node.assetUrl ? 236 : 136 }
  if (node.kind === 'camera_grid') return { width: node.assetUrl ? 360 : 262, height: node.assetUrl ? 286 : 136 }
  if (node.kind === 'viewpoint' || node.kind === 'angle') return { width: node.assetUrl ? 286 : 248, height: node.assetUrl ? 236 : 138 }
  if (node.kind === 'coverage_anchor') return { width: node.assetUrl ? 274 : 238, height: node.assetUrl ? 226 : 128 }
  if (node.kind === 'world_location') return { width: 236, height: 118 }
  return { width: 226, height: 116 }
}

function sceneGraphDisplayKindLabel(node: SequenceAnimaticContinuityGraphNodeView, mode: SequenceAnimaticContinuityGraphViewMode) {
  if (mode === 'scene_graph' && (node.kind === 'viewpoint' || node.kind === 'angle')) return 'Camera grid'
  return node.kindLabel
}

function shouldCollapseSet(
  node: SequenceAnimaticContinuityGraphNodeView,
  mode: SequenceAnimaticContinuityGraphViewMode,
  childrenByParentId: ReadonlyMap<string, SequenceAnimaticContinuityGraphNodeView[]>,
) {
  if (mode !== 'scene_graph' || node.kind !== 'set') return false
  const parentId = node.parentId ?? ''
  if (!parentId) return false
  const siblingSets = (childrenByParentId.get(parentId) ?? []).filter((sibling) => sibling.kind === 'set')
  return siblingSets.length <= 1
}

export function buildSequenceAnimaticContinuityGraphPoiHints(input: {
  zoneNode: SequenceAnimaticContinuityGraphNodeView
  nodes: readonly SequenceAnimaticContinuityGraphNodeView[]
}) {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const))
  return input.zoneNode.imagePoiAnchors
    .map((anchor): SequenceAnimaticContinuityGraphPoiHint | null => {
      const node = nodeById.get(anchor.spotId) ?? null
      if (!node || node.parentId !== input.zoneNode.id) return null
      if (!(node.kind === 'spot' || node.kind === 'viewpoint' || node.kind === 'angle')) return null
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null
      const x = Math.max(0, Math.min(100, anchor.x))
      const y = Math.max(0, Math.min(100, anchor.y))
      return {
        id: node.id,
        label: node.label,
        kind: node.kind,
        x,
        y,
        status: node.assetStatus,
        assetUrl: node.assetUrl,
        matchedText: anchor.matchedText,
        confidence: anchor.confidence,
      }
    })
    .filter((hint): hint is SequenceAnimaticContinuityGraphPoiHint => hint !== null)
    .sort((left, right) => graphKindOrder(left.kind) - graphKindOrder(right.kind) || left.label.localeCompare(right.label))
    .slice(0, 12)
}

export function buildSequenceAnimaticContinuityGraphLayout(input: {
  nodes: readonly SequenceAnimaticContinuityGraphNodeView[]
  edges: readonly SequenceAnimaticContinuityGraphEdgeView[]
  mode: SequenceAnimaticContinuityGraphViewMode
}): SequenceAnimaticContinuityGraphLayout {
  const sourceNodeById = new Map(input.nodes.map((node) => [node.id, node] as const))
  const rawChildrenByParentId = new Map<string, SequenceAnimaticContinuityGraphNodeView[]>()
  for (const node of input.nodes) {
    if (!node.parentId || !sourceNodeById.has(node.parentId)) continue
    rawChildrenByParentId.set(node.parentId, [...(rawChildrenByParentId.get(node.parentId) ?? []), node])
  }

  const collapsedSetIds = new Set(input.nodes
    .filter((node) => shouldCollapseSet(node, input.mode, rawChildrenByParentId))
    .map((node) => node.id))
  const visibleNodes = input.nodes.filter((node) => !collapsedSetIds.has(node.id))
  const visibleNodeById = new Map(visibleNodes.map((node) => [node.id, node] as const))

  const resolveVisibleParentId = (node: SequenceAnimaticContinuityGraphNodeView): string | null => {
    let parentId = node.parentId ?? null
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      if (visibleNodeById.has(parentId)) return parentId
      parentId = sourceNodeById.get(parentId)?.parentId ?? null
    }
    return null
  }

  const parentByNodeId = new Map(visibleNodes.map((node) => [node.id, resolveVisibleParentId(node)] as const))
  const childrenByParentId = new Map<string, SequenceAnimaticContinuityGraphNodeView[]>()
  for (const node of visibleNodes) {
    const parentId = parentByNodeId.get(node.id)
    if (!parentId) continue
    childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), node])
  }
  for (const [parentId, children] of childrenByParentId) {
    childrenByParentId.set(parentId, [...children].sort((left, right) => (
      graphKindOrder(left.kind) - graphKindOrder(right.kind) || left.label.localeCompare(right.label)
    )))
  }

  const roots = visibleNodes
    .filter((node) => !parentByNodeId.get(node.id))
    .sort((left, right) => nodeDepth(left.kind) - nodeDepth(right.kind) || left.label.localeCompare(right.label))

  const depthByNodeId = new Map<string, number>()
  const visitDepth = (node: SequenceAnimaticContinuityGraphNodeView, depth: number) => {
    depthByNodeId.set(node.id, depth)
    for (const child of childrenByParentId.get(node.id) ?? []) visitDepth(child, depth + 1)
  }
  roots.forEach((root) => visitDepth(root, 0))

  const sizeByNodeId = new Map(visibleNodes.map((node) => [node.id, layoutNodeSize(node, input.mode)] as const))
  const maxDepth = Math.max(0, ...visibleNodes.map((node) => depthByNodeId.get(node.id) ?? 0))
  const rowHeights = Array.from({ length: maxDepth + 1 }, (_, depth) => (
    Math.max(112, ...visibleNodes
      .filter((node) => (depthByNodeId.get(node.id) ?? 0) === depth)
      .map((node) => sizeByNodeId.get(node.id)?.height ?? 112))
  ))
  const rowOffsets = rowHeights.reduce<number[]>((offsets, _height, index) => {
    offsets[index] = index === 0 ? 44 : offsets[index - 1] + rowHeights[index - 1] + (input.mode === 'scene_graph' ? 96 : 72)
    return offsets
  }, [])

  const columnGap = input.mode === 'scene_graph' ? 36 : 28
  const positions = new Map<string, { x: number; y: number }>()
  const subtreeWidths = new Map<string, number>()

  const measureSubtreeWidth = (node: SequenceAnimaticContinuityGraphNodeView): number => {
    const size = sizeByNodeId.get(node.id) ?? { width: 220, height: 116 }
    const children = childrenByParentId.get(node.id) ?? []
    if (children.length === 0) {
      subtreeWidths.set(node.id, size.width)
      return size.width
    }
    const childTotal = children.reduce((sum, child, index) => (
      sum + measureSubtreeWidth(child) + (index > 0 ? columnGap : 0)
    ), 0)
    const width = Math.max(size.width, childTotal)
    subtreeWidths.set(node.id, width)
    return width
  }

  const placeSubtree = (node: SequenceAnimaticContinuityGraphNodeView, left: number) => {
    const size = sizeByNodeId.get(node.id) ?? { width: 220, height: 116 }
    const depth = depthByNodeId.get(node.id) ?? 0
    const subtreeWidth = subtreeWidths.get(node.id) ?? size.width
    positions.set(node.id, {
      x: left + (subtreeWidth - size.width) / 2,
      y: rowOffsets[depth] ?? 44,
    })
    const children = childrenByParentId.get(node.id) ?? []
    const childTotal = children.reduce((sum, child, index) => (
      sum + (subtreeWidths.get(child.id) ?? size.width) + (index > 0 ? columnGap : 0)
    ), 0)
    let childLeft = left + Math.max(0, (subtreeWidth - childTotal) / 2)
    for (const child of childrenByParentId.get(node.id) ?? []) {
      placeSubtree(child, childLeft)
      childLeft += (subtreeWidths.get(child.id) ?? size.width) + columnGap
    }
  }

  let rootLeft = 42
  for (const root of roots) {
    const width = measureSubtreeWidth(root)
    placeSubtree(root, rootLeft)
    rootLeft += width + 72
  }

  const visibleEdges = new Map<string, SequenceAnimaticContinuityGraphEdgeView>()
  for (const node of visibleNodes) {
    const parentId = parentByNodeId.get(node.id)
    if (!parentId) continue
    const id = `hierarchy:${parentId}:${node.id}`
    visibleEdges.set(id, { id, source: parentId, target: node.id, kind: 'hierarchy', label: 'contains' })
  }
  for (const edge of input.edges) {
    if (edge.kind !== 'dependency') continue
    if (!visibleNodeById.has(edge.source) || !visibleNodeById.has(edge.target)) continue
    visibleEdges.set(edge.id, edge)
  }

  return {
    nodes: visibleNodes.map((node) => {
      const size = sizeByNodeId.get(node.id) ?? { width: 220, height: 116 }
      const position = positions.get(node.id) ?? { x: 42, y: 44 }
      return {
        node,
        parentId: parentByNodeId.get(node.id) ?? null,
        depth: depthByNodeId.get(node.id) ?? 0,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        displayKindLabel: sceneGraphDisplayKindLabel(node, input.mode),
        poiHints: node.kind === 'zone'
          ? buildSequenceAnimaticContinuityGraphPoiHints({ zoneNode: node, nodes: input.nodes })
          : [],
      }
    }),
    edges: [...visibleEdges.values()],
  }
}
