import type { WorldEntity, WorldGraphConnection, WorldOperator, WorldRelationship, WorldResult, WorldViewKind } from './worldGraph.ts'

export type WorldSceneDisplayTier = 'focus' | 'near' | 'far' | 'peripheral' | 'hidden'
export type WorldSceneTransitionState = 'entering' | 'stable' | 'exiting'
export type WorldSceneEdgeEmphasis = 'focus' | 'context' | 'muted'
export type WorldGraphDepthMode = 'tight' | 'nearby' | 'wide'

export type DerivedWorldSceneNode = {
  key: string
  kind: 'entity' | 'operator' | 'result'
  tier: WorldSceneDisplayTier
  distance: number
  targetPosition: { x: number; y: number }
  firstHopEntityKey?: string | null
  parentEntityKey?: string | null
  layoutGroupKey?: string | null
  sortPriority?: number
}

export type DerivedWorldScene = {
  rootNodeKey: string | null
  rootEntityKey: string | null
  targetNodeKeys: string[]
  targetEntityKeys: string[]
  relationshipKeys: string[]
  connectionKeys: string[]
  nodeByKey: Record<string, DerivedWorldSceneNode>
  edgeEmphasisByKey: Record<string, WorldSceneEdgeEmphasis>
}

type DeriveWorldSceneInput = {
  entities: WorldEntity[]
  operators: WorldOperator[]
  results: WorldResult[]
  relationships: WorldRelationship[]
  connections: WorldGraphConnection[]
  filteredEntityKeys: string[]
  seedEntityKeys: string[]
  pinnedNodeKeys: string[]
  storyThreadEntityKeys: string[]
  selectedNodeKey?: string | null
  focusRootKey?: string | null
  presentationMode: 'world' | 'story'
  viewKind: WorldViewKind
  focusDepth: number
  showDerivedLayer: boolean
  graphDepthMode?: WorldGraphDepthMode
  enabledEntityTypes?: WorldEntity['nodeType'][] | null
  protectedNodeKeys?: string[] | null
  includeAllContext?: boolean
}

function sanitizeKeys(values: string[] | undefined | null) {
  return Array.from(new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

function clampFocusDepth(value: number) {
  return Math.max(1, Math.min(2, value))
}

function addUndirectedEdge(adjacency: Map<string, Set<string>>, source: string, target: string) {
  const sourceLinks = adjacency.get(source) ?? new Set<string>()
  sourceLinks.add(target)
  adjacency.set(source, sourceLinks)

  const targetLinks = adjacency.get(target) ?? new Set<string>()
  targetLinks.add(source)
  adjacency.set(target, targetLinks)
}

function chooseRootEntityKey(input: DeriveWorldSceneInput, relationshipDegree: Map<string, number>) {
  const entityKeySet = new Set(input.entities.map((entity) => entity.key))
  const filteredEntityKeys = sanitizeKeys(input.filteredEntityKeys).filter((key) => entityKeySet.has(key))
  const seedEntityKeys = sanitizeKeys(input.seedEntityKeys).filter((key) => entityKeySet.has(key))
  const pinnedEntityKeys = sanitizeKeys(input.pinnedNodeKeys).filter((key) => entityKeySet.has(key))
  const storyEntityKeys = sanitizeKeys(input.storyThreadEntityKeys).filter((key) => entityKeySet.has(key))

  const preferredKeys = [
    input.focusRootKey ?? null,
    input.selectedNodeKey ?? null,
    ...storyEntityKeys,
    ...seedEntityKeys,
    ...pinnedEntityKeys,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const key of preferredKeys) {
    if (entityKeySet.has(key)) return key
  }

  if (filteredEntityKeys.length === 0) return null

  const sortedFallback = [...filteredEntityKeys].sort((left, right) => {
    const degreeDelta = (relationshipDegree.get(right) ?? 0) - (relationshipDegree.get(left) ?? 0)
    if (degreeDelta !== 0) return degreeDelta
    return left.localeCompare(right)
  })
  return sortedFallback[0] ?? null
}

type EntityReachInfo = {
  distance: number
  parentKey: string | null
  firstHopKey: string | null
}

function computeEntityReachability(params: {
  rootEntityKey: string | null
  filteredEntityKeys: Set<string>
  relationshipAdjacency: Map<string, Set<string>>
  maxDistance: number
}) {
  const reachability = new Map<string, EntityReachInfo>()
  if (!params.rootEntityKey) return reachability
  reachability.set(params.rootEntityKey, {
    distance: 0,
    parentKey: null,
    firstHopKey: null,
  })
  let frontier = [params.rootEntityKey]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const key of frontier) {
      const base = reachability.get(key)
      const baseDistance = base?.distance ?? 0
      if (baseDistance >= params.maxDistance) continue
      const neighbors = [...(params.relationshipAdjacency.get(key) ?? [])].sort()
      for (const neighbor of neighbors) {
        if (!params.filteredEntityKeys.has(neighbor) || reachability.has(neighbor)) continue
        reachability.set(neighbor, {
          distance: baseDistance + 1,
          parentKey: key,
          firstHopKey: baseDistance === 0 ? neighbor : base?.firstHopKey ?? key,
        })
        next.push(neighbor)
      }
    }
    frontier = next
  }

  return reachability
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function entityTypeVisibilityBonus(nodeType: WorldEntity['nodeType']) {
  switch (nodeType) {
    case 'actor':
      return 14
    case 'group':
      return 10
    case 'place':
      return 9
    case 'concept':
      return 7
    case 'event':
      return 6
    case 'object':
      return 4
  }
}

function distanceVisibilityScore(distance: number | null) {
  if (distance === null) return -1000
  switch (distance) {
    case 0:
      return 220
    case 1:
      return 140
    case 2:
      return 88
    case 3:
      return 52
    case 4:
      return 24
    default:
      return 8
  }
}

function computeVisibilityBudgets(params: {
  directNeighborCount: number
  reachableCount: number
  focusDepth: number
  presentationMode: 'world' | 'story'
  graphDepthMode: WorldGraphDepthMode
}) {
  const sparseBoost = params.directNeighborCount <= 4 ? 4 : params.directNeighborCount <= 7 ? 2 : 0
  const densePenalty = params.directNeighborCount >= 14 ? 2 : params.directNeighborCount >= 10 ? 1 : 0
  const baseBudgets = params.presentationMode === 'story'
    ? {
      nearBudget: clamp(6 + sparseBoost - densePenalty + (params.focusDepth - 1), 5, 9),
      farBudget: clamp(12 + sparseBoost * 2 - densePenalty * 2 + Math.floor(params.reachableCount / 8), 10, 22),
      peripheralBudget: clamp(22 + sparseBoost * 2 - densePenalty + Math.floor(params.reachableCount / 5), 16, 44),
    }
    : {
      nearBudget: clamp(8 + sparseBoost - densePenalty + (params.focusDepth - 1), 6, 12),
      farBudget: clamp(18 + sparseBoost * 3 - densePenalty * 2 + Math.floor(params.reachableCount / 6), 14, 36),
      peripheralBudget: clamp(38 + sparseBoost * 3 - densePenalty + Math.floor(params.reachableCount / 4), 28, 84),
    }

  if (params.graphDepthMode === 'tight') {
    return {
      nearBudget: clamp(baseBudgets.nearBudget - 1, params.presentationMode === 'story' ? 4 : 5, params.presentationMode === 'story' ? 8 : 10),
      farBudget: clamp(Math.floor(baseBudgets.farBudget * 0.58), params.presentationMode === 'story' ? 6 : 8, params.presentationMode === 'story' ? 16 : 24),
      peripheralBudget: clamp(Math.floor(baseBudgets.peripheralBudget * 0.45), params.presentationMode === 'story' ? 8 : 12, params.presentationMode === 'story' ? 28 : 48),
    }
  }

  if (params.graphDepthMode === 'wide') {
    return {
      nearBudget: clamp(baseBudgets.nearBudget + 1, params.presentationMode === 'story' ? 6 : 7, params.presentationMode === 'story' ? 11 : 14),
      farBudget: clamp(Math.floor(baseBudgets.farBudget * 1.45) + 4, params.presentationMode === 'story' ? 16 : 22, params.presentationMode === 'story' ? 34 : 58),
      peripheralBudget: clamp(Math.floor(baseBudgets.peripheralBudget * 1.65) + 12, params.presentationMode === 'story' ? 34 : 54, params.presentationMode === 'story' ? 82 : 150),
    }
  }

  return baseBudgets
}

type SceneLayoutNode = DerivedWorldSceneNode & {
  estimatedWidth: number
  estimatedHeight: number
}

function estimatedSceneNodeDimensions(node: DerivedWorldSceneNode) {
  if (node.tier === 'peripheral') {
    return { width: 12, height: 12 }
  }
  if (node.tier === 'far') {
    return { width: 18, height: 18 }
  }
  if (node.kind === 'operator') {
    return { width: 132, height: 102 }
  }
  if (node.kind === 'result') {
    return { width: 150, height: 108 }
  }
  return { width: 148, height: 118 }
}

function positionNodesRadially(nodes: DerivedWorldSceneNode[]) {
  const positions: Record<string, { x: number; y: number }> = {}
  const layoutNodes: SceneLayoutNode[] = nodes.map((node) => {
    const dimensions = estimatedSceneNodeDimensions(node)
    return {
      ...node,
      estimatedWidth: dimensions.width,
      estimatedHeight: dimensions.height,
    }
  })
  const focusNodes = layoutNodes.filter((node) => node.tier === 'focus')
  const nearNodes = layoutNodes.filter((node) => node.tier === 'near')
  const farNodes = layoutNodes.filter((node) => node.tier === 'far')
  const peripheralNodes = layoutNodes.filter((node) => node.tier === 'peripheral')

  for (const node of focusNodes) {
    positions[node.key] = { x: 0, y: 0 }
  }

  const nearSpacing = 72
  const farSpacing = 34
  const peripheralSpacing = 24

  const compareLayoutNodes = (left: SceneLayoutNode, right: SceneLayoutNode) => {
    const groupDelta = (left.layoutGroupKey ?? left.firstHopEntityKey ?? left.key)
      .localeCompare(right.layoutGroupKey ?? right.firstHopEntityKey ?? right.key)
    if (groupDelta !== 0) return groupDelta
    if (left.distance !== right.distance) return left.distance - right.distance
    const priorityDelta = (right.sortPriority ?? 0) - (left.sortPriority ?? 0)
    if (priorityDelta !== 0) return priorityDelta
    return left.key.localeCompare(right.key)
  }

  const placeRing = (
    ringNodes: SceneLayoutNode[],
    minRadiusX: number,
    minRadiusY: number,
    minSpacing: number,
    offset = -Math.PI / 2,
  ) => {
    if (ringNodes.length === 0) return
    const sorted = [...ringNodes].sort(compareLayoutNodes)
    const arcWeights = sorted.map((node) => Math.max(node.estimatedWidth, node.estimatedHeight) + minSpacing)
    const totalArcWeight = arcWeights.reduce((sum, weight) => sum + weight, 0)
    const radiusX = Math.max(minRadiusX, totalArcWeight / (2 * Math.PI))
    const radiusY = Math.max(minRadiusY, (totalArcWeight * 0.84) / (2 * Math.PI))
    let arcCursor = 0
    sorted.forEach((node, index) => {
      const weight = arcWeights[index] ?? minSpacing
      const angle = offset + ((arcCursor + weight / 2) / totalArcWeight) * Math.PI * 2
      positions[node.key] = {
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
      }
      arcCursor += weight
    })
  }

  const nearArcWeight = nearNodes.reduce((sum, node) => sum + Math.max(node.estimatedWidth, node.estimatedHeight) + nearSpacing, 0)
  const nearRadiusX = nearNodes.length > 0 ? Math.max(320, nearArcWeight / (2 * Math.PI)) : 320
  const nearRadiusY = nearNodes.length > 0 ? Math.max(270, (nearArcWeight * 0.84) / (2 * Math.PI)) : 270
  placeRing(nearNodes, nearRadiusX, nearRadiusY, nearSpacing)

  const farArcWeight = farNodes.reduce((sum, node) => sum + Math.max(node.estimatedWidth, node.estimatedHeight) + farSpacing, 0)
  const farRadiusX = farNodes.length > 0
    ? Math.max(nearRadiusX + 210, farArcWeight / (2 * Math.PI), nearRadiusX * 1.75)
    : nearRadiusX + 210
  const farRadiusY = farNodes.length > 0
    ? Math.max(nearRadiusY + 170, (farArcWeight * 0.84) / (2 * Math.PI), nearRadiusY * 1.7)
    : nearRadiusY + 170
  placeRing(farNodes, farRadiusX, farRadiusY, farSpacing, Math.PI / Math.max(1, farNodes.length))

  const peripheralArcWeight = peripheralNodes.reduce((sum, node) => sum + Math.max(node.estimatedWidth, node.estimatedHeight) + peripheralSpacing, 0)
  const peripheralRadiusX = peripheralNodes.length > 0
    ? Math.max(farRadiusX + 240, peripheralArcWeight / (2 * Math.PI), farRadiusX * 1.48)
    : farRadiusX + 240
  const peripheralRadiusY = peripheralNodes.length > 0
    ? Math.max(farRadiusY + 200, (peripheralArcWeight * 0.84) / (2 * Math.PI), farRadiusY * 1.45)
    : farRadiusY + 200
  placeRing(peripheralNodes, peripheralRadiusX, peripheralRadiusY, peripheralSpacing, Math.PI / Math.max(1, peripheralNodes.length * 2))

  const nodeByKey = new Map(layoutNodes.map((node) => [node.key, node] as const))
  const ringTargetRadiusByKey = new Map<string, { x: number; y: number; strength: number }>()
  for (const node of nearNodes) {
    ringTargetRadiusByKey.set(node.key, { x: nearRadiusX, y: nearRadiusY, strength: 0.22 })
  }
  for (const node of farNodes) {
    ringTargetRadiusByKey.set(node.key, { x: farRadiusX, y: farRadiusY, strength: 0.15 })
  }
  for (const node of peripheralNodes) {
    ringTargetRadiusByKey.set(node.key, { x: peripheralRadiusX, y: peripheralRadiusY, strength: 0.1 })
  }

  const nodeCollisionRadius = (node: SceneLayoutNode) => {
    const tierPadding = node.tier === 'peripheral' ? 10 : node.tier === 'far' ? 16 : 30
    return Math.max(node.estimatedWidth, node.estimatedHeight) / 2 + tierPadding
  }

  for (let iteration = 0; iteration < 14; iteration += 1) {
    for (let index = 0; index < layoutNodes.length; index += 1) {
      const left = layoutNodes[index]
      if (!left || left.tier === 'hidden') continue
      const leftPosition = positions[left.key]
      if (!leftPosition) continue
      for (let otherIndex = index + 1; otherIndex < layoutNodes.length; otherIndex += 1) {
        const right = layoutNodes[otherIndex]
        if (!right || right.tier === 'hidden') continue
        const rightPosition = positions[right.key]
        if (!rightPosition) continue
        const dx = rightPosition.x - leftPosition.x
        const dy = rightPosition.y - leftPosition.y
        const distance = Math.hypot(dx, dy) || 0.0001
        const minimumDistance = nodeCollisionRadius(left) + nodeCollisionRadius(right)
        if (distance >= minimumDistance) continue

        const overlap = minimumDistance - distance
        const pushX = (dx / distance) * overlap * 0.52
        const pushY = (dy / distance) * overlap * 0.52
        const leftFixed = left.tier === 'focus'
        const rightFixed = right.tier === 'focus'

        if (!leftFixed && !rightFixed) {
          leftPosition.x -= pushX
          leftPosition.y -= pushY
          rightPosition.x += pushX
          rightPosition.y += pushY
        } else if (leftFixed && !rightFixed) {
          rightPosition.x += pushX * 2
          rightPosition.y += pushY * 2
        } else if (!leftFixed && rightFixed) {
          leftPosition.x -= pushX * 2
          leftPosition.y -= pushY * 2
        }
      }
    }

    for (const node of layoutNodes) {
      if (node.tier === 'focus') continue
      const position = positions[node.key]
      if (!position) continue
      const ringTarget = ringTargetRadiusByKey.get(node.key)
      if (!ringTarget) continue
      const angle = Math.atan2(position.y, position.x)
      const targetX = Math.cos(angle) * ringTarget.x
      const targetY = Math.sin(angle) * ringTarget.y
      position.x += (targetX - position.x) * ringTarget.strength
      position.y += (targetY - position.y) * ringTarget.strength
    }
  }

  for (const node of layoutNodes) {
    const ringTarget = ringTargetRadiusByKey.get(node.key)
    if (!ringTarget) continue
    const position = positions[node.key]
    if (!position) continue
    const ringNode = nodeByKey.get(node.key)
    if (!ringNode) continue
    const maxRadius = Math.max(ringTarget.x, ringTarget.y)
    const minimumRadius = Math.max(96, maxRadius - (ringNode.tier === 'near' ? 90 : 120))
    const currentRadius = Math.hypot(position.x, position.y)
    if (currentRadius < minimumRadius) {
      const angle = Math.atan2(position.y, position.x)
      position.x = Math.cos(angle) * minimumRadius
      position.y = Math.sin(angle) * minimumRadius
    }
  }

  return positions
}

type EntityVisibilityCandidate = {
  entity: WorldEntity
  distance: number | null
  parentKey: string | null
  firstHopKey: string | null
  score: number
  pinned: boolean
  story: boolean
  typeFiltered: boolean
  protected: boolean
}

export function deriveContinuousWorldScene(input: DeriveWorldSceneInput): DerivedWorldScene {
  const filteredEntityKeySet = new Set(sanitizeKeys(input.filteredEntityKeys))
  const storyThreadEntityKeySet = new Set(sanitizeKeys(input.storyThreadEntityKeys))
  const pinnedNodeKeySet = new Set(sanitizeKeys(input.pinnedNodeKeys))
  const protectedNodeKeySet = new Set(sanitizeKeys(input.protectedNodeKeys))
  const enabledEntityTypeSet = input.enabledEntityTypes
    ? new Set(input.enabledEntityTypes)
    : null
  const focusDepth = clampFocusDepth(input.focusDepth)
  const graphDepthMode = input.graphDepthMode ?? 'nearby'
  const explorationDistance = focusDepth + (graphDepthMode === 'tight' ? 1 : graphDepthMode === 'wide' ? 3 : 2)
  const includeAllAtlasContext = Boolean(input.includeAllContext) || (input.viewKind === 'global_overview' && graphDepthMode === 'wide')
  const keepUnreachableContextOuter = Boolean(input.includeAllContext)

  const relationshipAdjacency = new Map<string, Set<string>>()
  const relationshipDegree = new Map<string, number>()
  for (const relationship of input.relationships) {
    addUndirectedEdge(relationshipAdjacency, relationship.sourceEntityKey, relationship.targetEntityKey)
    relationshipDegree.set(relationship.sourceEntityKey, (relationshipDegree.get(relationship.sourceEntityKey) ?? 0) + 1)
    relationshipDegree.set(relationship.targetEntityKey, (relationshipDegree.get(relationship.targetEntityKey) ?? 0) + 1)
  }

  const rootEntityKey = chooseRootEntityKey(input, relationshipDegree)
  const entityReachability = computeEntityReachability({
    rootEntityKey,
    filteredEntityKeys: filteredEntityKeySet,
    relationshipAdjacency,
    maxDistance: explorationDistance,
  })

  const directNeighborCount = rootEntityKey
    ? (relationshipAdjacency.get(rootEntityKey) ?? new Set()).size
    : 0

  const candidateEntities: EntityVisibilityCandidate[] = input.entities
    .map((entity) => {
      const reachability = entityReachability.get(entity.key) ?? null
      const distance = reachability?.distance ?? null
      const pinned = pinnedNodeKeySet.has(entity.key)
      const story = storyThreadEntityKeySet.has(entity.key)
      const protectedNode = protectedNodeKeySet.has(entity.key) || entity.key === rootEntityKey || pinned || story
      const typeFiltered = Boolean(enabledEntityTypeSet && !enabledEntityTypeSet.has(entity.nodeType) && !protectedNode)
      const reachable = distance !== null
      if (!reachable && !includeAllAtlasContext && !pinned && !(input.presentationMode === 'story' && story) && !protectedNode) {
        return null
      }
      return {
        entity,
        distance,
        parentKey: reachability?.parentKey ?? null,
        firstHopKey: reachability?.firstHopKey ?? null,
        pinned,
        story,
        typeFiltered,
        protected: protectedNode,
        score:
          distanceVisibilityScore(distance)
          + Math.min(relationshipDegree.get(entity.key) ?? 0, 8) * 4
          + entityTypeVisibilityBonus(entity.nodeType)
          + (pinned ? 16 : 0)
          + (story ? 18 : 0)
          + (protectedNode ? 32 : 0)
          - (typeFiltered ? 220 : 0),
      }
    })
    .filter((candidate): candidate is EntityVisibilityCandidate => candidate !== null)

  const candidateCountExcludingRoot = candidateEntities.filter((candidate) => candidate.entity.key !== rootEntityKey).length
  let { nearBudget, farBudget, peripheralBudget } = computeVisibilityBudgets({
    directNeighborCount,
    reachableCount: candidateCountExcludingRoot,
    focusDepth,
    presentationMode: input.presentationMode,
    graphDepthMode,
  })
  if (includeAllAtlasContext) {
    farBudget = Math.max(farBudget, Math.min(64, Math.ceil(candidateCountExcludingRoot * 0.34)))
    peripheralBudget = Math.max(peripheralBudget, candidateCountExcludingRoot)
  }

  const candidateSort = (left: EntityVisibilityCandidate, right: EntityVisibilityCandidate) => {
    const scoreDelta = right.score - left.score
    if (scoreDelta !== 0) return scoreDelta
    const leftDistance = left.distance ?? Number.MAX_SAFE_INTEGER
    const rightDistance = right.distance ?? Number.MAX_SAFE_INTEGER
    if (leftDistance !== rightDistance) return leftDistance - rightDistance
    const typeDelta = left.entity.nodeType.localeCompare(right.entity.nodeType)
    if (typeDelta !== 0) return typeDelta
    return left.entity.key.localeCompare(right.entity.key)
  }

  const nonRootCandidates = candidateEntities
    .filter((candidate) => candidate.entity.key !== rootEntityKey)
    .sort(candidateSort)

  const nearSelected = new Set<string>()
  const farSelected = new Set<string>()
  const peripheralSelected = new Set<string>()
  const canPromoteToInnerContext = (candidate: EntityVisibilityCandidate) => (
    !keepUnreachableContextOuter || candidate.distance !== null || candidate.protected
  )

  const directCandidates = nonRootCandidates.filter((candidate) => candidate.distance === 1)
  for (const candidate of directCandidates.filter((candidate) => !candidate.typeFiltered || candidate.protected)) {
    if (nearSelected.size >= nearBudget) break
    nearSelected.add(candidate.entity.key)
  }

  for (const candidate of nonRootCandidates.filter((candidate) => !candidate.typeFiltered || candidate.protected)) {
    if (nearSelected.size >= nearBudget) break
    if (nearSelected.has(candidate.entity.key)) continue
    if (!canPromoteToInnerContext(candidate)) continue
    nearSelected.add(candidate.entity.key)
  }

  for (const candidate of directCandidates.filter((candidate) => candidate.typeFiltered && !candidate.protected)) {
    if (nearSelected.size >= nearBudget) break
    if (nearSelected.has(candidate.entity.key)) continue
    nearSelected.add(candidate.entity.key)
  }

  const guaranteedFar = nonRootCandidates.filter((candidate) => {
    if (nearSelected.has(candidate.entity.key)) return false
    return candidate.pinned || (input.presentationMode === 'story' && candidate.story)
  })
  for (const candidate of guaranteedFar) {
    farSelected.add(candidate.entity.key)
  }

  for (const candidate of nonRootCandidates.filter((candidate) => !candidate.typeFiltered || candidate.protected)) {
    if (farSelected.size >= farBudget) break
    if (nearSelected.has(candidate.entity.key) || farSelected.has(candidate.entity.key)) continue
    if (!canPromoteToInnerContext(candidate)) continue
    farSelected.add(candidate.entity.key)
  }

  for (const candidate of nonRootCandidates.filter((candidate) => !candidate.typeFiltered || candidate.protected)) {
    if (peripheralSelected.size >= peripheralBudget) break
    if (nearSelected.has(candidate.entity.key) || farSelected.has(candidate.entity.key)) continue
    peripheralSelected.add(candidate.entity.key)
  }

  const candidateByKey = new Map(candidateEntities.map((candidate) => [candidate.entity.key, candidate] as const))
  const nodeTopology = (entityKey: string) => {
    const candidate = candidateByKey.get(entityKey)
    return {
      firstHopEntityKey: candidate?.firstHopKey ?? null,
      parentEntityKey: candidate?.parentKey ?? null,
      layoutGroupKey: candidate?.firstHopKey ?? entityKey,
      sortPriority: candidate?.score ?? 0,
    }
  }

  const targetEntityNodes: DerivedWorldSceneNode[] = []
  for (const entity of input.entities) {
    const distance = entityReachability.get(entity.key)?.distance ?? null
    if (entity.key === rootEntityKey) {
      targetEntityNodes.push({
        key: entity.key,
        kind: 'entity',
        tier: 'focus',
        distance: 0,
        targetPosition: { x: 0, y: 0 },
        ...nodeTopology(entity.key),
      })
      continue
    }
    if (nearSelected.has(entity.key)) {
      targetEntityNodes.push({
        key: entity.key,
        kind: 'entity',
        tier: 'near',
        distance: distance ?? explorationDistance,
        targetPosition: { x: 0, y: 0 },
        ...nodeTopology(entity.key),
      })
      continue
    }
    if (farSelected.has(entity.key)) {
      targetEntityNodes.push({
        key: entity.key,
        kind: 'entity',
        tier: 'far',
        distance: distance ?? explorationDistance,
        targetPosition: { x: 0, y: 0 },
        ...nodeTopology(entity.key),
      })
      continue
    }
    if (peripheralSelected.has(entity.key)) {
      targetEntityNodes.push({
        key: entity.key,
        kind: 'entity',
        tier: 'peripheral',
        distance: distance ?? explorationDistance,
        targetPosition: { x: 0, y: 0 },
        ...nodeTopology(entity.key),
      })
    }
  }

  const targetNodeKeySet = new Set(targetEntityNodes.map((node) => node.key))

  const connectionKeys: string[] = []
  const derivedNodes = new Map<string, DerivedWorldSceneNode>()
  if (input.showDerivedLayer) {
    const operatorKeySet = new Set(input.operators.map((operator) => operator.key))
    const resultKeySet = new Set(input.results.map((result) => result.key))
    for (const connection of input.connections) {
      const sourceVisible = targetNodeKeySet.has(connection.sourceNodeKey)
      const targetVisible = targetNodeKeySet.has(connection.targetNodeKey)
      if (!sourceVisible && !targetVisible) continue
      connectionKeys.push(connection.key)

      const counterpartKey = sourceVisible ? connection.targetNodeKey : connection.sourceNodeKey
      if (derivedNodes.has(counterpartKey) || targetNodeKeySet.has(counterpartKey)) continue

      const counterpartKind = operatorKeySet.has(counterpartKey)
        ? 'operator'
        : resultKeySet.has(counterpartKey)
          ? 'result'
          : null
      if (!counterpartKind) continue

      derivedNodes.set(counterpartKey, {
        key: counterpartKey,
        kind: counterpartKind,
        tier: 'far',
        distance: 2,
        targetPosition: { x: 0, y: 0 },
      })
    }
  }

  const positionedNodes = [...targetEntityNodes, ...derivedNodes.values()]
  const positions = positionNodesRadially(positionedNodes)
  const nodeByKey = Object.fromEntries(positionedNodes.map((node) => [
    node.key,
    {
      ...node,
      targetPosition: positions[node.key] ?? { x: 0, y: 0 },
    },
  ]))

  const relationshipKeys = input.relationships
    .filter((relationship) => nodeByKey[relationship.sourceEntityKey] && nodeByKey[relationship.targetEntityKey])
    .map((relationship) => relationship.key)

  const edgeEmphasisByKey: Record<string, WorldSceneEdgeEmphasis> = {}
  for (const relationship of input.relationships) {
    if (!nodeByKey[relationship.sourceEntityKey] || !nodeByKey[relationship.targetEntityKey]) continue
    const sourceTier = nodeByKey[relationship.sourceEntityKey]!.tier
    const targetTier = nodeByKey[relationship.targetEntityKey]!.tier
    edgeEmphasisByKey[relationship.key] =
      relationship.sourceEntityKey === rootEntityKey || relationship.targetEntityKey === rootEntityKey
        ? 'focus'
        : sourceTier === 'near' || targetTier === 'near'
          ? 'context'
          : 'muted'
  }

  for (const connection of input.connections) {
    if (!nodeByKey[connection.sourceNodeKey] || !nodeByKey[connection.targetNodeKey]) continue
    const sourceTier = nodeByKey[connection.sourceNodeKey]!.tier
    const targetTier = nodeByKey[connection.targetNodeKey]!.tier
    edgeEmphasisByKey[connection.key] =
      connection.sourceNodeKey === rootEntityKey || connection.targetNodeKey === rootEntityKey
        ? 'focus'
        : sourceTier === 'near' || targetTier === 'near'
          ? 'context'
          : 'muted'
  }

  return {
    rootNodeKey: rootEntityKey,
    rootEntityKey,
    targetNodeKeys: positionedNodes.map((node) => node.key),
    targetEntityKeys: targetEntityNodes.map((node) => node.key),
    relationshipKeys,
    connectionKeys,
    nodeByKey,
    edgeEmphasisByKey,
  }
}
