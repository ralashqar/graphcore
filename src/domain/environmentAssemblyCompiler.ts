import {
  ArcCurve,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'

import {
  createAssemblyNode,
  environmentAssemblyGraphToDsl,
  migrateAssemblyGraph,
  type Anchor,
  type ArrayPlacementSpec,
  type AssemblyEdgeDefinition,
  type AssemblyGraphDefinition,
  type AssemblyNodeDefinition,
  type BoundaryLoop,
  type BridgeSpec,
  type CompiledEnvironmentModel,
  type CompiledMeshPart,
  type Connector,
  type CurveSegment,
  type LevelSpec,
  type OpeningSpec,
  type PartitionWallSpec,
  type PathSpec,
  type Profile2D,
  type RoofSpec,
  type RoomVolume,
  type RoomAdjacencySpec,
  type ShellBandSpec,
  type SlabVoidSpec,
  type SolidSpec,
  type StairRunSpec,
  type SpatialDocument,
  type StructuralFusionSpec,
  type StructureFootprint,
  type SurfaceSpec,
  type WallFaceSpec,
  type WallRunSpec,
  type WallSegmentSpec,
  type WindowSpec,
} from './environmentAssembly'
import { resolveStructuralUnion, type StructuralShellInput, type StructuralShellBandResult } from './environmentAssemblyStructuralFusion'

type RuntimeProfile = {
  profile: Profile2D
  outer: Vector2[]
  holes: Vector2[][]
}

type RuntimePath = {
  points: Vector3[]
}

type RuntimeSolid = {
  spec: SolidSpec
  geometry: BufferGeometry
  color: string
}

type RuntimeSurface = {
  spec: SurfaceSpec
  geometry: BufferGeometry
  color: string
}

type RuntimeNodeResult = {
  profiles?: RuntimeProfile[]
  paths?: RuntimePath[]
  solids?: RuntimeSolid[]
  solidOutputs?: Record<string, RuntimeSolid[]>
  surfaces?: RuntimeSurface[]
  structuralShells?: StructuralShellInput[]
  structureFootprints?: StructureFootprint[]
  shellBands?: ShellBandSpec[]
  structuralFusions?: StructuralFusionSpec[]
  levels?: LevelSpec[]
  wallRuns?: WallRunSpec[]
  wallFaces?: WallFaceSpec[]
  anchors?: Anchor[]
  connectors?: Connector[]
  openings?: OpeningSpec[]
  windows?: WindowSpec[]
  rooms?: RoomVolume[]
  wallSegments?: WallSegmentSpec[]
  partitionWalls?: PartitionWallSpec[]
  roomAdjacency?: RoomAdjacencySpec[]
  roofs?: RoofSpec[]
  bridges?: BridgeSpec[]
  stairs?: StairRunSpec[]
  slabVoids?: SlabVoidSpec[]
  pathSpecs?: PathSpec[]
  arrayPlacements?: ArrayPlacementSpec[]
  interiorDoorRequests?: InteriorDoorRequest[]
  wallSegmentOpeningRequests?: WallSegmentOpeningRequest[]
  stairLayoutRequests?: StairLayoutRequest[]
  stairConnectionRequests?: StairConnectionRequest[]
}

type InteriorDoorRequest = {
  id: string
  sourceNodeKey: string
  roomIds: string[]
  width: number
  height: number
  offset: number
  preferredPosition?: [number, number, number] | null
  preferredWallSegmentId?: string | null
  connectionPlacement?: 'auto' | 'center' | 'landing_aligned'
}

type WallSegmentOpeningRequest = {
  id: string
  sourceNodeKey: string
  wallSegmentId: string | null
  width: number
  height: number
  offset: number
  openingRole: OpeningSpec['openingRole']
}

type StairLayoutRequest = {
  id: string
  sourceNodeKey: string
  stairFamily: StairRunSpec['stairFamily']
  fitMode: 'strict' | 'zone_autofit' | 'zone_autofit_with_partition_push'
  targetElevationMode: 'level_top' | 'mezzanine' | 'explicit'
  fromLevelId: string | null
  toLevelId: string | null
  zoneRoomIds: string[]
  targetAnchorId: string | null
  width: number
  tread: number
  maxRise: number
  landingDepth: number
  turnDirection: 'left' | 'right'
  preferredExitSide: 'auto' | 'front' | 'back' | 'left' | 'right'
  headroom: number
  wallClearance: number
  clearanceMargin: number
  explicitTargetElevation: number | null
}

type StairConnectionRequest = {
  id: string
  sourceNodeKey: string
  stairId: string | null
  targetRoomIds: string[]
  targetWallSegmentId: string | null
  connectionMode: 'door' | 'open_edge' | 'guard_opening'
  landing: 'auto' | 'bottom' | 'top'
  connectionPlacement: 'auto' | 'center' | 'landing_aligned'
  width: number
  height: number
  offset: number
}

export type AssemblyCompileCache = {
  dependencyHashes: Map<string, string>
  nodeResults: Map<string, RuntimeNodeResult>
}

export type AssemblyCompileResult = {
  spatialDocument: SpatialDocument
  compiledModel: CompiledEnvironmentModel
  diagnostics: string[]
  dsl: string
  cache: AssemblyCompileCache
}

const evaluator = new Evaluator()

function incomingEdges(graph: AssemblyGraphDefinition, nodeKey: string, portId?: string) {
  return graph.edges.filter((edge) => edge.target.nodeKey === nodeKey && (!portId || edge.target.portId === portId))
}

function outgoingEdges(graph: AssemblyGraphDefinition, nodeKey: string, portId?: string) {
  return graph.edges.filter((edge) => edge.source.nodeKey === nodeKey && (!portId || edge.source.portId === portId))
}

function topologicalNodes(graph: AssemblyGraphDefinition) {
  const indegree = new Map<string, number>(graph.nodes.map((node) => [node.key, 0]))
  for (const edge of graph.edges) indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 0) + 1)

  const queue = graph.nodes.filter((node) => (indegree.get(node.key) ?? 0) === 0)
  const ordered: AssemblyNodeDefinition[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    ordered.push(current)

    for (const edge of outgoingEdges(graph, current.key)) {
      indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 1) - 1)
      if ((indegree.get(edge.target.nodeKey) ?? 0) === 0) {
        const next = graph.nodes.find((node) => node.key === edge.target.nodeKey)
        if (next) queue.push(next)
      }
    }
  }

  return ordered.length === graph.nodes.length ? ordered : graph.nodes
}

function numberParam(node: AssemblyNodeDefinition, key: string, fallback: number) {
  const value = node.params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringParam(node: AssemblyNodeDefinition, key: string, fallback: string) {
  const value = node.params[key]
  return typeof value === 'string' ? value : fallback
}

function pointsParam(node: AssemblyNodeDefinition, key = 'points', fallback: Array<{ x: number; y: number }> = []) {
  const value = node.params[key]
  if (!Array.isArray(value)) return fallback
  return value
    .map((point) => {
      if (!point || typeof point !== 'object') return null
      const x = typeof (point as { x?: unknown }).x === 'number' ? Number((point as { x: number }).x) : null
      const y = typeof (point as { y?: unknown }).y === 'number' ? Number((point as { y: number }).y) : null
      return x === null || y === null ? null : { x, y }
    })
    .filter((point): point is { x: number; y: number } => point !== null)
}

function vector3Param(node: AssemblyNodeDefinition, key: string, fallback: { x: number; y: number; z: number }) {
  const value = node.params[key]
  if (!value || typeof value !== 'object') return fallback
  return {
    x: typeof (value as { x?: unknown }).x === 'number' ? Number((value as { x: number }).x) : fallback.x,
    y: typeof (value as { y?: unknown }).y === 'number' ? Number((value as { y: number }).y) : fallback.y,
    z: typeof (value as { z?: unknown }).z === 'number' ? Number((value as { z: number }).z) : fallback.z,
  }
}

function booleanParam(node: AssemblyNodeDefinition, key: string, fallback: boolean) {
  const value = node.params[key]
  return typeof value === 'boolean' ? value : fallback
}

function edgeHash(edge: AssemblyEdgeDefinition) {
  return `${edge.source.nodeKey}:${edge.source.portId}->${edge.target.nodeKey}:${edge.target.portId}`
}

function normalizeGeometry(geometry: BufferGeometry) {
  const normalized = geometry.clone()
  if (!normalized.attributes.normal) normalized.computeVertexNormals()
  return normalized
}

function geometryToPart(id: string, sourceNodeKey: string, kind: CompiledMeshPart['kind'], geometry: BufferGeometry, color: string, metadata: Record<string, unknown> = {}): CompiledMeshPart {
  const working = normalizeGeometry(geometry)
  const position = working.getAttribute('position')
  const normal = working.getAttribute('normal')
  const index = working.getIndex()

  return {
    id,
    sourceNodeKey,
    kind,
    color,
    positions: Array.from(position.array as ArrayLike<number>),
    normals: normal ? Array.from(normal.array as ArrayLike<number>) : [],
    indices: index ? Array.from(index.array as ArrayLike<number>).map((value) => Number(value)) : Array.from({ length: position.count }, (_, vertexIndex) => vertexIndex),
    linePoints: [],
    metadata,
  }
}

function linePart(id: string, sourceNodeKey: string, points: Vector3[], color: string, metadata: Record<string, unknown> = {}): CompiledMeshPart {
  return {
    id,
    sourceNodeKey,
    kind: 'line',
    color,
    positions: [],
    normals: [],
    indices: [],
    linePoints: points.flatMap((point) => [point.x, point.y, point.z]),
    metadata,
  }
}

function shapeFromProfile(profile: RuntimeProfile) {
  const signedArea2D = (points: Vector2[]) => {
    let area = 0
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]
      const next = points[(index + 1) % points.length]
      area += current.x * next.y - next.x * current.y
    }
    return area * 0.5
  }

  const normalizeWinding = (points: Vector2[], clockwise: boolean) => {
    const isClockwise = signedArea2D(points) < 0
    return isClockwise === clockwise ? points : [...points].reverse()
  }

  const shape = new Shape(normalizeWinding(profile.outer, false))
  for (const holePoints of profile.holes) {
    const hole = new Shape(normalizeWinding(holePoints, true))
    shape.holes.push(hole)
  }
  return shape
}

function cloneGeometryWithMatrix(geometry: BufferGeometry, matrix: Matrix4) {
  const next = geometry.clone()
  next.applyMatrix4(matrix)
  return next
}

function cloneSolid(runtimeSolid: RuntimeSolid, geometry: BufferGeometry, params: Record<string, unknown> = {}) {
  return {
    ...runtimeSolid,
    spec: {
      ...runtimeSolid.spec,
      id: `${runtimeSolid.spec.id}_${Date.now()}`,
      params: {
        ...runtimeSolid.spec.params,
        ...params,
      },
    },
    geometry,
  }
}

function pickStructuralHostSolid(solids: RuntimeSolid[]) {
  const preferredKinds: SolidSpec['kind'][] = ['boolean_result', 'wall_shell', 'room', 'bridge_room', 'roof', 'box', 'cylinder', 'prism', 'tapered_prism']
  for (const kind of preferredKinds) {
    const match = solids.find((solid) => solid.spec.kind === kind)
    if (match) return match
  }
  return solids[0] ?? null
}

function mapSolidOutputs(
  result: RuntimeNodeResult | undefined,
  mapper: (solid: RuntimeSolid, outputKey: string, index: number) => RuntimeSolid,
) {
  const outputs = result?.solidOutputs ?? (result?.solids ? { solid: result.solids } : undefined)
  if (!outputs) return undefined
  return Object.fromEntries(
    Object.entries(outputs).map(([outputKey, solids]) => [
      outputKey,
      solids.map((solid, index) => mapper(solid, outputKey, index)),
    ]),
  )
}

function pointsToSegments(points: Vector2[]): CurveSegment[] {
  if (points.length < 2) return []
  const segments: CurveSegment[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    segments.push({
      type: 'line',
      from: { x: current.x, y: current.y },
      to: { x: next.x, y: next.y },
    })
  }
  return segments
}

function profileCenter(profile: RuntimeProfile) {
  const center = new Vector2()
  for (const point of profile.outer) center.add(point)
  return center.multiplyScalar(1 / Math.max(profile.outer.length, 1))
}

function insetProfile(profile: RuntimeProfile, inset: number): RuntimeProfile {
  const center = profileCenter(profile)
  const nextOuter = profile.outer.map((point) => {
    const direction = point.clone().sub(center)
    const length = Math.max(direction.length(), 0.0001)
    return point.clone().sub(direction.normalize().multiplyScalar(Math.min(inset, length * 0.45)))
  })
  return {
    profile: {
      id: `${profile.profile.id}.inset`,
      loops: [{
        id: `${profile.profile.id}.inset.outer`,
        closed: true,
        kind: 'outer',
        segments: pointsToSegments(nextOuter),
      }],
      metadata: {
        ...profile.profile.metadata,
        inset,
      },
    },
    outer: nextOuter,
    holes: [],
  }
}

function extrudeProfile(profile: RuntimeProfile, depth: number) {
  const shape = shapeFromProfile(profile)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(1, 1, -1)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return geometry
}

function createRectangleProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const width = numberParam(node, 'width', 6)
  const depth = numberParam(node, 'depth', 6)
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const outer = [
    new Vector2(-halfWidth, -halfDepth),
    new Vector2(halfWidth, -halfDepth),
    new Vector2(halfWidth, halfDepth),
    new Vector2(-halfWidth, halfDepth),
  ]
  return {
    profile: {
      id: `${node.key}.profile`,
      loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
      metadata: { nodeKind: node.kind },
    },
    outer,
    holes: [],
  }
}

function createRegularPolygonProfile(node: AssemblyNodeDefinition, sidesFallback: number): RuntimeProfile {
  const sides = Math.max(3, Math.round(numberParam(node, 'sides', sidesFallback)))
  const radius = numberParam(node, 'radius', 4)
  const outer = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2
    return new Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
  })
  return {
    profile: {
      id: `${node.key}.profile`,
      loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
      metadata: { nodeKind: node.kind },
    },
    outer,
    holes: [],
  }
}

function createTrapezoidProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const topWidth = numberParam(node, 'topWidth', 4)
  const bottomWidth = numberParam(node, 'bottomWidth', 8)
  const depth = numberParam(node, 'depth', 6)
  const halfDepth = depth / 2
  const outer = [
    new Vector2(-bottomWidth / 2, -halfDepth),
    new Vector2(bottomWidth / 2, -halfDepth),
    new Vector2(topWidth / 2, halfDepth),
    new Vector2(-topWidth / 2, halfDepth),
  ]
  return {
    profile: {
      id: `${node.key}.profile`,
      loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
      metadata: { nodeKind: node.kind },
    },
    outer,
    holes: [],
  }
}

function createPolygonProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const outer = pointsParam(node).map((point) => new Vector2(point.x, point.y))
  return {
    profile: {
      id: `${node.key}.profile`,
      loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
      metadata: { nodeKind: node.kind },
    },
    outer,
    holes: [],
  }
}

function runtimeProfileFromShape(profile: Profile2D): RuntimeProfile {
  const outerLoop = profile.loops.find((loop) => loop.kind === 'outer') ?? profile.loops[0]
  const outer = outerLoop ? segmentsToPolyline(outerLoop) : []
  const holes = profile.loops
    .filter((loop) => loop.kind === 'hole')
    .map((loop) => segmentsToPolyline(loop))
    .filter((points) => points.length >= 3)
  return {
    profile,
    outer,
    holes,
  }
}

function createLineLoopProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const outer = pointsParam(node).map((point) => new Vector2(point.x, point.y))
  return runtimeProfileFromShape({
    id: `${node.key}.profile`,
    loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
    metadata: { nodeKind: node.kind },
  })
}

function createArcLoopProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const radius = numberParam(node, 'radius', 3.5)
  const startAngle = numberParam(node, 'startAngle', 0)
  const endAngle = numberParam(node, 'endAngle', Math.PI * 2)
  const segmentCount = Math.max(8, Math.round(numberParam(node, 'segments', 24)))
  const points = new ArcCurve(0, 0, radius, startAngle, endAngle, false).getPoints(segmentCount)
  return runtimeProfileFromShape({
    id: `${node.key}.profile`,
    loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(points) }],
    metadata: { nodeKind: node.kind },
  })
}

function curveSegmentsParam(node: AssemblyNodeDefinition, key = 'segments'): CurveSegment[] {
  const value = node.params[key]
  if (!Array.isArray(value)) return []
  return value
    .map((segment) => {
      if (!segment || typeof segment !== 'object' || typeof (segment as { type?: unknown }).type !== 'string') return null
      const type = (segment as { type: string }).type
      if (type === 'line') {
        const from = (segment as { from?: { x?: unknown; y?: unknown } }).from
        const to = (segment as { to?: { x?: unknown; y?: unknown } }).to
        if (typeof from?.x !== 'number' || typeof from?.y !== 'number' || typeof to?.x !== 'number' || typeof to?.y !== 'number') return null
        return { type: 'line', from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } } satisfies CurveSegment
      }
      if (type === 'arc') {
        const center = (segment as { center?: { x?: unknown; y?: unknown } }).center
        const radius = (segment as { radius?: unknown }).radius
        const startAngle = (segment as { startAngle?: unknown }).startAngle
        const endAngle = (segment as { endAngle?: unknown }).endAngle
        if (typeof center?.x !== 'number' || typeof center?.y !== 'number' || typeof radius !== 'number' || typeof startAngle !== 'number' || typeof endAngle !== 'number') return null
        return { type: 'arc', center: { x: center.x, y: center.y }, radius, startAngle, endAngle, clockwise: Boolean((segment as { clockwise?: unknown }).clockwise) } satisfies CurveSegment
      }
      if (type === 'spline') {
        const points = Array.isArray((segment as { points?: unknown[] }).points)
          ? ((segment as { points: Array<{ x?: unknown; y?: unknown }> }).points
              .map((point) => (typeof point.x === 'number' && typeof point.y === 'number' ? { x: point.x, y: point.y } : null))
              .filter((point): point is { x: number; y: number } => point !== null))
          : []
        if (points.length < 2) return null
        return { type: 'spline', points, closed: Boolean((segment as { closed?: unknown }).closed) } satisfies CurveSegment
      }
      return null
    })
    .filter((segment): segment is CurveSegment => segment !== null)
}

function createMixedLoopProfile(node: AssemblyNodeDefinition): RuntimeProfile {
  const segments = curveSegmentsParam(node)
  return runtimeProfileFromShape({
    id: `${node.key}.profile`,
    loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments }],
    metadata: { nodeKind: node.kind },
  })
}

function createPathFromPoints(points: Array<{ x: number; y: number }>) {
  return {
    points: points.map((point) => new Vector3(point.x, 0, point.y)),
  }
}

function collectIncomingProfiles(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'profile') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.profiles ?? [])
}

function collectIncomingPaths(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'path') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.paths ?? [])
}

function collectIncomingSolids(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId?: string) {
  const edges = portId ? incomingEdges(graph, node.key, portId) : incomingEdges(graph, node.key)
  return edges.flatMap((edge) => {
    const sourceResult = results.get(edge.source.nodeKey)
    if (!sourceResult) return []
    if (sourceResult.solidOutputs?.[edge.source.portId]) return sourceResult.solidOutputs[edge.source.portId]
    if (edge.source.portId === 'solid') return sourceResult.solids ?? sourceResult.solidOutputs?.solid ?? []
    return sourceResult.solidOutputs?.solid ?? sourceResult.solids ?? []
  })
}

function collectIncomingLevels(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'level') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.levels ?? [])
}

function collectIncomingWallFaces(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'wall_face') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.wallFaces ?? [])
}

function collectIncomingAnchors(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId: string) {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.anchors ?? [])
}

function collectIncomingRooms(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'rooms') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.rooms ?? [])
}

function collectIncomingStairs(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'stair') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.stairs ?? [])
}

function collectSourceAnchors(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId = 'source') {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.anchors ?? [])
}

function collectIncomingStructuralShells(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId: string) {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.structuralShells ?? [])
}

function transformLoopPoints(points: Vector2[], translate: { x: number; y: number; z: number }, rotate: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }) {
  const cos = Math.cos(rotate.y)
  const sin = Math.sin(rotate.y)
  return points.map((point) => {
    const scaledX = point.x * scale.x
    const scaledY = point.y * scale.z
    const rotatedX = scaledX * cos - scaledY * sin
    const rotatedY = scaledX * sin + scaledY * cos
    return new Vector2(rotatedX + translate.x, rotatedY + translate.z)
  })
}

function transformedStructuralShell(
  shell: StructuralShellInput,
  translate: { x: number; y: number; z: number },
  rotate: { x: number; y: number; z: number },
  scale: { x: number; y: number; z: number },
  suffix: string,
): StructuralShellInput {
  return {
    ...shell,
    id: `${shell.id}.${suffix}`,
    outer: transformLoopPoints(shell.outer, translate, rotate, scale),
    inner: transformLoopPoints(shell.inner, translate, rotate, scale),
    baseElevation: shell.baseElevation * scale.y + translate.y,
    topElevation: shell.topElevation * scale.y + translate.y,
    metadata: {
      ...shell.metadata,
      transform: { translate, rotate, scale },
    },
  }
}

function mirroredStructuralShell(shell: StructuralShellInput, axis: string, suffix: string): StructuralShellInput {
  const mirroredLoop = (points: Vector2[]) =>
    points.map((point) => new Vector2(axis === 'x' ? -point.x : point.x, axis === 'z' ? -point.y : point.y))
  return {
    ...shell,
    id: `${shell.id}.${suffix}`,
    outer: mirroredLoop(shell.outer),
    inner: mirroredLoop(shell.inner),
    baseElevation: axis === 'y' ? -shell.topElevation : shell.baseElevation,
    topElevation: axis === 'y' ? -shell.baseElevation : shell.topElevation,
    metadata: {
      ...shell.metadata,
      mirroredAxis: axis,
    },
  }
}

function transformedSolid(runtimeSolid: RuntimeSolid, node: AssemblyNodeDefinition) {
  const translate = vector3Param(node, 'translate', { x: 0, y: 0, z: 0 })
  const rotate = vector3Param(node, 'rotate', { x: 0, y: 0, z: 0 })
  const scale = vector3Param(node, 'scale', { x: 1, y: 1, z: 1 })
  const matrix = new Matrix4()
  matrix.makeRotationFromEuler(new Euler(rotate.x, rotate.y, rotate.z, 'XYZ'))
  matrix.scale(new Vector3(scale.x, scale.y, scale.z))
  matrix.setPosition(translate.x, translate.y, translate.z)
  return cloneSolid(runtimeSolid, cloneGeometryWithMatrix(runtimeSolid.geometry, matrix), {
    transform: { translate, rotate, scale },
  })
}

function boundaryLoopPoints(loop: BoundaryLoop) {
  return segmentsToPolyline(loop)
}

function runtimeProfileFromLoops(id: string, outer: Vector2[], holes: Vector2[][], metadata: Record<string, unknown> = {}): RuntimeProfile {
  return {
    profile: {
      id,
      loops: [
        {
          id: `${id}.outer`,
          closed: true,
          kind: 'outer',
          segments: pointsToSegments(outer),
        },
        ...holes.map((hole, index) => ({
          id: `${id}.hole_${index + 1}`,
          closed: true,
          kind: 'hole' as const,
          segments: pointsToSegments(hole),
        })),
      ],
      metadata,
    },
    outer,
    holes,
  }
}

function shapeKindFromProfile(node: AssemblyNodeDefinition, profile: RuntimeProfile): StructureFootprint['shapeKind'] {
  if (node.kind === 'mixed_loop' || node.kind === 'arc_loop') return 'mixed'
  if (node.kind === 'regular_polygon' && profile.outer.length >= 12) return 'round'
  const center = profileCenter(profile)
  const radii = profile.outer.map((point) => point.distanceTo(center))
  const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / Math.max(radii.length, 1)
  const variance = averageRadius > 0
    ? radii.reduce((sum, radius) => sum + Math.abs(radius - averageRadius), 0) / Math.max(radii.length, 1)
    : 0
  if (profile.outer.length >= 12 && variance / Math.max(averageRadius, 0.0001) < 0.08) return 'round'
  return 'polygon'
}

function createStructuralShellFromProfile(node: AssemblyNodeDefinition, profile: RuntimeProfile, wallThickness: number, floorThickness: number, baseElevation: number, topElevation: number, floorAtBase: boolean): StructuralShellInput {
  const inner = profile.holes[0] && profile.holes[0].length >= 3 ? profile.holes[0] : insetProfile(profile, wallThickness).outer
  return {
    id: `${node.key}.shell`,
    sourceNodeKey: node.key,
    outer: profile.outer.map((point) => point.clone()),
    inner: inner.map((point) => point.clone()),
    baseElevation,
    topElevation,
    floorAtBase,
    shapeKind: shapeKindFromProfile(node, profile),
    metadata: {
      profileId: profile.profile.id,
      nodeKind: node.kind,
      wallThickness,
      floorThickness,
    },
  }
}

function booleanCombine(a: RuntimeSolid, b: RuntimeSolid, operation: typeof ADDITION | typeof SUBTRACTION | typeof INTERSECTION, node: AssemblyNodeDefinition, diagnostics: string[]) {
  try {
    const brushA = new Brush(normalizeGeometry(a.geometry))
    const brushB = new Brush(normalizeGeometry(b.geometry))
    brushA.updateMatrixWorld()
    brushB.updateMatrixWorld()
    const result = evaluator.evaluate(brushA, brushB, operation)
    const geometry = result.geometry.index ? result.geometry.toNonIndexed() : result.geometry.clone()
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    return {
      spec: {
        id: `${node.key}.solid`,
        sourceNodeKey: node.key,
        kind: 'boolean_result',
        profileId: null,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        params: { operation: node.kind },
        metadata: {},
      } satisfies SolidSpec,
      geometry,
      color: '#d3b36a',
    } satisfies RuntimeSolid
  } catch (error) {
    diagnostics.push(`Boolean ${node.kind} failed for "${node.key}": ${error instanceof Error ? error.message : 'Unknown error'}.`)
    return null
  }
}

function computeGeometryBounds(geometry: BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  return geometry.boundingBox?.clone() ?? new Box3()
}

function combinedSolidBounds(solids: RuntimeSolid[]) {
  if (solids.length === 0) return null
  const bounds = new Box3()
  for (const solid of solids) bounds.union(computeGeometryBounds(solid.geometry))
  return bounds
}

function canonicalRoofKind(kind: AssemblyNodeDefinition['kind']) {
  switch (kind) {
    case 'flat_roof':
      return 'roof_flat'
    case 'shed_roof':
      return 'roof_shed'
    case 'gable_roof':
      return 'roof_gable'
    case 'hip_roof':
      return 'roof_hip'
    case 'pyramid_roof':
      return 'roof_pyramid'
    case 'tower_cap':
      return 'roof_pointed'
    case 'dome_roof':
      return 'roof_dome'
    default:
      return kind
  }
}

function boundaryVertices2D(profile: RuntimeProfile) {
  const loops = [
    profile.outer,
    ...profile.holes,
  ]
  return loops.flatMap((loop) => loop.map((point) => new Vector2(point.x, point.y)))
}

function buildRoofGeometry(
  node: AssemblyNodeDefinition,
  profile: RuntimeProfile,
  placement: {
    baseElevation: number
    offsetX: number
    offsetZ: number
  },
) {
  const roofKind = canonicalRoofKind(node.kind)
  const bounds = new Box3()
  for (const point of profile.outer) bounds.expandByPoint(new Vector3(point.x, 0, point.y))
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const height = numberParam(node, 'height', roofKind === 'roof_flat' ? 0.3 : 1.5)
  const eaves = numberParam(node, 'eaves', 0)

  if (roofKind === 'roof_flat') {
    const geometry = extrudeProfile(eaves !== 0 ? insetProfile(profile, -eaves) : profile, height)
    geometry.translate(placement.offsetX, placement.baseElevation, placement.offsetZ)
    return geometry
  }

  if (
    roofKind === 'roof_shed'
    || roofKind === 'roof_gable'
    || roofKind === 'roof_hip'
    || roofKind === 'roof_pyramid'
    || roofKind === 'roof_pointed'
    || node.kind === 'mansard_roof'
  ) {
    const workingProfile = eaves !== 0 ? insetProfile(profile, -eaves) : profile
    const geometry = extrudeProfile(workingProfile, Math.max(height, 0.2))
    const position = geometry.getAttribute('position')
    const ridgeAlongX = stringParam(node, 'ridgeDirection', size.x >= size.z ? 'x' : 'z') !== 'z'
    const halfWidth = Math.max(size.x * 0.5, 0.0001)
    const halfDepth = Math.max(size.z * 0.5, 0.0001)
    const topThreshold = Math.max(height - 0.001, 0.001)

    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index)
      if (y < topThreshold) continue

      let x = position.getX(index)
      let z = position.getZ(index)
      let nextY = y

      if (roofKind === 'roof_shed') {
        const normalized = ridgeAlongX
          ? (z - center.z) / halfDepth
          : (x - center.x) / halfWidth
        const t = (normalized + 1) * 0.5
        nextY = Math.max(0.06, Math.min(height, t * height))
      } else if (roofKind === 'roof_gable') {
        if (ridgeAlongX) z = center.z
        else x = center.x
      } else if (roofKind === 'roof_hip') {
        x = center.x + (x - center.x) * 0.28
        z = center.z + (z - center.z) * 0.28
      } else if (node.kind === 'mansard_roof') {
        const inset = Math.max(0.05, Math.min(numberParam(node, 'inset', 0.45), 0.9))
        x = center.x + (x - center.x) * inset
        z = center.z + (z - center.z) * inset
      } else {
        x = center.x
        z = center.z
      }

      position.setXYZ(index, x, nextY, z)
    }

    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.translate(placement.offsetX, placement.baseElevation, placement.offsetZ)
    return geometry
  }

  if (roofKind === 'roof_dome') {
    const workingProfile = eaves !== 0 ? insetProfile(profile, -eaves) : profile
    const baseThickness = Math.max(0.06, numberParam(node, 'baseThickness', Math.min(0.18, Math.max(height * 0.08, 0.08))))
    const roundness = Math.max(0.2, numberParam(node, 'roundness', 1))
    const geometry = extrudeProfile(workingProfile, baseThickness)
    const position = geometry.getAttribute('position')
    const boundaryPoints = boundaryVertices2D(workingProfile)
    const halfWidth = Math.max(size.x * 0.5, 0.0001)
    const halfDepth = Math.max(size.z * 0.5, 0.0001)
    const topThreshold = Math.max(baseThickness - 0.001, 0.001)
    const boundaryEpsilon = 0.001

    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index)
      if (y < topThreshold) continue

      const x = position.getX(index)
      const z = position.getZ(index)
      const isBoundary = boundaryPoints.some((point) => Math.abs(point.x - x) <= boundaryEpsilon && Math.abs(point.y - z) <= boundaryEpsilon)
      if (isBoundary) {
        position.setY(index, baseThickness)
        continue
      }

      const nx = (x - center.x) / halfWidth
      const nz = (z - center.z) / halfDepth
      const radial = Math.min(1, Math.sqrt(nx * nx + nz * nz))
      const domeFactor = Math.pow(Math.max(0, 1 - radial * radial), roundness)
      position.setY(index, baseThickness + domeFactor * height)
    }

    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.translate(placement.offsetX, placement.baseElevation, placement.offsetZ)
    return geometry
  }

  const radius = Math.max(size.x, size.z) * 0.5
  const geometry = new ConeGeometry(radius, Math.max(height, 0.2), 4, 1)
  geometry.rotateY(Math.PI / 4)
  geometry.translate(center.x + placement.offsetX, placement.baseElevation + height / 2, center.z + placement.offsetZ)
  return geometry
}

function createAnchor(nodeKey: string, label: string, position: Vector3): Anchor {
  return {
    id: `${nodeKey}.${label.toLowerCase().replace(/\s+/g, '_')}`,
    sourceNodeKey: nodeKey,
    label,
    position: [position.x, position.y, position.z],
    metadata: {},
  }
}

function anchorPosition(anchor: Anchor) {
  return new Vector3(anchor.position[0], anchor.position[1], anchor.position[2])
}

function chooseDirectionalAnchor(anchors: Anchor[], preferredLabel: string) {
  return anchors.find((anchor) => anchor.label.toLowerCase() === preferredLabel.toLowerCase()) ?? null
}

function averageAnchorPosition(anchors: Anchor[]) {
  if (anchors.length === 0) return new Vector3(0, 0, 0)
  return anchors.reduce((sum, anchor) => sum.add(anchorPosition(anchor)), new Vector3()).multiplyScalar(1 / anchors.length)
}

function chooseBridgeAnchorPair(fromAnchors: Anchor[], toAnchors: Anchor[]) {
  if (fromAnchors.length === 0 || toAnchors.length === 0) return null

  const fromCenter = chooseDirectionalAnchor(fromAnchors, 'Center') ?? { position: averageAnchorPosition(fromAnchors).toArray() as [number, number, number] } as Anchor
  const toCenter = chooseDirectionalAnchor(toAnchors, 'Center') ?? { position: averageAnchorPosition(toAnchors).toArray() as [number, number, number] } as Anchor
  const delta = new Vector3().subVectors(anchorPosition(toCenter), anchorPosition(fromCenter))
  const primaryAxis = Math.abs(delta.x) >= Math.abs(delta.z) ? 'x' : 'z'

  const fromPreferredLabel = primaryAxis === 'x'
    ? (delta.x >= 0 ? 'East Entry' : 'West Entry')
    : (delta.z >= 0 ? 'South Entry' : 'North Entry')
  const toPreferredLabel = primaryAxis === 'x'
    ? (delta.x >= 0 ? 'West Entry' : 'East Entry')
    : (delta.z >= 0 ? 'North Entry' : 'South Entry')

  const fromPreferred = chooseDirectionalAnchor(fromAnchors, fromPreferredLabel)
  const toPreferred = chooseDirectionalAnchor(toAnchors, toPreferredLabel)
  if (fromPreferred && toPreferred) return { from: fromPreferred, to: toPreferred }

  let bestPair: { from: Anchor; to: Anchor; score: number } | null = null
  for (const from of fromAnchors) {
    for (const to of toAnchors) {
      const distance = anchorPosition(from).distanceToSquared(anchorPosition(to))
      if (!bestPair || distance < bestPair.score) {
        bestPair = { from, to, score: distance }
      }
    }
  }

  return bestPair ? { from: bestPair.from, to: bestPair.to } : null
}

function orientedBoxGeometry(length: number, height: number, width: number, center: Vector3, angle: number) {
  const geometry = new BoxGeometry(Math.max(length, 0.001), Math.max(height, 0.001), Math.max(width, 0.001))
  geometry.rotateY(-angle)
  geometry.translate(center.x, center.y, center.z)
  return geometry
}

function unionSolidList(solids: RuntimeSolid[], node: AssemblyNodeDefinition, diagnostics: string[]) {
  if (solids.length === 0) return null
  let combined = solids[0]
  for (let index = 1; index < solids.length; index += 1) {
    const next = booleanCombine(combined, solids[index], ADDITION, node, diagnostics)
    if (!next) return combined
    combined = next
  }
  return combined
}

function wallFacesFromProfile(node: AssemblyNodeDefinition, profile: RuntimeProfile, height: number, baseElevation = 0, wallRunId = `${node.key}.wall_run`): WallFaceSpec[] {
  if (profile.outer.length < 2) return []
  const signedArea = profile.outer.reduce((sum, point, index) => {
    const next = profile.outer[(index + 1) % profile.outer.length]
    return sum + (point.x * next.y - next.x * point.y)
  }, 0)
  const isClockwise = signedArea < 0
  return profile.outer.map((point, index) => {
    const next = profile.outer[(index + 1) % profile.outer.length]
    const midpoint = new Vector3((point.x + next.x) * 0.5, baseElevation + height * 0.5, (point.y + next.y) * 0.5)
    const direction = new Vector3(next.x - point.x, 0, next.y - point.y).normalize()
    const normal = isClockwise
      ? new Vector3(-direction.z, 0, direction.x).normalize()
      : new Vector3(direction.z, 0, -direction.x).normalize()
    return {
      id: `${node.key}.wall_face_${index + 1}`,
      sourceNodeKey: node.key,
      wallRunId,
      levelId: null,
      wallRole: 'exterior' as const,
      ownerRoomIds: [],
      start: [point.x, baseElevation, point.y],
      end: [next.x, baseElevation, next.y],
      center: [midpoint.x, midpoint.y, midpoint.z],
      normal: [normal.x, normal.y, normal.z],
      elevationBottom: baseElevation,
      elevationTop: baseElevation + height,
      metadata: { index: index + 1 },
    }
  })
}

function openingPositionFromWallFace(face: WallFaceSpec | undefined, fallback: Vector3) {
  if (!face) return fallback
  return new Vector3(face.center[0], face.elevationBottom, face.center[2])
}

function levelsForNode(node: AssemblyNodeDefinition, levels: LevelSpec[]) {
  if (levels.length === 0) return levels
  const explicitLevelId = typeof node.params.levelId === 'string' ? node.params.levelId : null
  if (explicitLevelId) {
    const level = levels.find((entry) => entry.id === explicitLevelId || entry.levelId === explicitLevelId)
    return level ? [level] : []
  }
  return levels
}

function selectLevelForNode(node: AssemblyNodeDefinition, levels: LevelSpec[], levelIndexKey = 'levelIndex', fallbackIndex = 1) {
  const candidates = levelsForNode(node, levels)
  if (candidates.length === 0) return null
  const requestedIndex = Math.max(1, Math.round(numberParam(node, levelIndexKey, fallbackIndex)))
  return candidates[Math.min(requestedIndex - 1, candidates.length - 1)] ?? candidates[0] ?? null
}

function selectLevelPairForNode(node: AssemblyNodeDefinition, levels: LevelSpec[]) {
  const candidates = levelsForNode(node, levels)
  if (candidates.length === 0) return { fromLevel: null, toLevel: null }
  const fromLevel = selectLevelForNode(node, candidates, 'fromLevelIndex', 1)
  const toLevel = selectLevelForNode(node, candidates, 'toLevelIndex', Math.min(2, candidates.length))
  return { fromLevel, toLevel }
}

function chooseWallFaceForNode(node: AssemblyNodeDefinition, faces: WallFaceSpec[]) {
  if (faces.length === 0) return undefined
  const requestedSide = stringParam(node, 'side', '').toLowerCase()
  const requestedIndex = Math.max(0, Math.round(numberParam(node, 'wallFaceIndex', 1)) - 1)
  if (!requestedSide && requestedIndex === 0) return faces[0]

  const bySide = faces.find((face) => {
    const normal = new Vector3(face.normal[0], face.normal[1], face.normal[2])
    if (requestedSide === 'front' || requestedSide === 'north') return normal.z < -0.5
    if (requestedSide === 'back' || requestedSide === 'south') return normal.z > 0.5
    if (requestedSide === 'left' || requestedSide === 'west') return normal.x < -0.5
    if (requestedSide === 'right' || requestedSide === 'east') return normal.x > 0.5
    return false
  })
  return bySide ?? faces[Math.min(requestedIndex, faces.length - 1)] ?? faces[0]
}

function subtractGeometryFromSolid(
  host: RuntimeSolid,
  cutter: BufferGeometry,
  sourceNodeKey: string,
  diagnostics: string[],
  options: {
    preserveSourceNodeKey?: boolean
    metadata?: Record<string, unknown>
  } = {},
) {
  try {
    const brushHost = new Brush(normalizeGeometry(host.geometry))
    const brushCutter = new Brush(normalizeGeometry(cutter))
    brushHost.updateMatrixWorld()
    brushCutter.updateMatrixWorld()
    const result = evaluator.evaluate(brushHost, brushCutter, SUBTRACTION)
    const geometry = result.geometry.index ? result.geometry.toNonIndexed() : result.geometry.clone()
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    return {
      ...host,
      spec: {
        ...host.spec,
        sourceNodeKey: options.preserveSourceNodeKey ? host.spec.sourceNodeKey : sourceNodeKey,
        metadata: {
          ...host.spec.metadata,
          ...(options.metadata ?? {}),
        },
      },
      geometry,
    } satisfies RuntimeSolid
  } catch (error) {
    diagnostics.push(`Boolean subtraction failed for "${host.spec.id}": ${error instanceof Error ? error.message : 'Unknown error'}.`)
    return host
  }
}

function roundedPointKey(x: number, z: number) {
  return `${x.toFixed(3)}:${z.toFixed(3)}`
}

function segmentKey(start: Vector2, end: Vector2, levelId: string | null) {
  const a = roundedPointKey(start.x, start.y)
  const b = roundedPointKey(end.x, end.y)
  return `${levelId ?? 'none'}::${a < b ? `${a}|${b}` : `${b}|${a}`}`
}

function profileOuterLoop(profile: Profile2D | undefined) {
  const outerLoop = profile?.loops.find((loop) => loop.kind === 'outer') ?? profile?.loops[0]
  return outerLoop ? segmentsToPolyline(outerLoop) : []
}

function roomLabel(room: RoomVolume) {
  return room.roomId ?? room.id
}

function isTopologyOwnedRoomNode(node: AssemblyNodeDefinition) {
  if (node.metadata.topologyOwned === false) return false
  return node.kind === 'room_on_level' || node.metadata.topologyOwned === true
}

function isTopologyOwnedRoom(room: RoomVolume) {
  return room.metadata.topologyOwned === true
}

function roomProfileBounds(room: RoomVolume, profiles: Profile2D[]) {
  const profile = profiles.find((entry) => entry.id === room.profileId)
  const outer = profileOuterLoop(profile)
  if (outer.length < 3) return null
  const points = Array.from(new Map(outer.map((point) => [roundedPointKey(point.x, point.y), point] as const)).values())
  if (points.length !== 4) return null
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const expected = [
    roundedPointKey(minX, minZ),
    roundedPointKey(maxX, minZ),
    roundedPointKey(maxX, maxZ),
    roundedPointKey(minX, maxZ),
  ]
  const actual = points.map((point) => roundedPointKey(point.x, point.y)).sort()
  if (expected.sort().join('|') !== actual.join('|')) return null
  return { minX, maxX, minZ, maxZ }
}

function polygonArea(points: Vector2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

function ensureCounterClockwiseLoop(points: Vector2[]) {
  return polygonArea(points) >= 0 ? points : [...points].reverse()
}

function orthogonalUnionLoops(rects: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>) {
  type DirectedEdge = { start: Vector2; end: Vector2 }
  const directedEdges = new Map<string, DirectedEdge>()
  for (const rect of rects) {
    const corners = [
      new Vector2(rect.minX, rect.minZ),
      new Vector2(rect.maxX, rect.minZ),
      new Vector2(rect.maxX, rect.maxZ),
      new Vector2(rect.minX, rect.maxZ),
    ]
    for (let index = 0; index < corners.length; index += 1) {
      const start = corners[index]
      const end = corners[(index + 1) % corners.length]
      const key = `${roundedPointKey(start.x, start.y)}|${roundedPointKey(end.x, end.y)}`
      const reverseKey = `${roundedPointKey(end.x, end.y)}|${roundedPointKey(start.x, start.y)}`
      if (directedEdges.has(reverseKey)) {
        directedEdges.delete(reverseKey)
      } else {
        directedEdges.set(key, { start, end })
      }
    }
  }
  const remaining = Array.from(directedEdges.values())
  const loops: Vector2[][] = []
  while (remaining.length > 0) {
    const first = remaining.pop()
    if (!first) break
    const loop = [first.start.clone(), first.end.clone()]
    while (loop[loop.length - 1].distanceToSquared(loop[0]) > 1e-8) {
      const tail = loop[loop.length - 1]
      const nextIndex = remaining.findIndex((entry) => entry.start.distanceToSquared(tail) <= 1e-8)
      if (nextIndex === -1) return null
      const [next] = remaining.splice(nextIndex, 1)
      loop.push(next.end.clone())
    }
    loop.pop()
    if (loop.length >= 3) loops.push(loop)
  }
  if (loops.length === 0) return null
  const ranked = loops
    .map((loop) => ({ loop, area: Math.abs(polygonArea(loop)) }))
    .sort((left, right) => right.area - left.area)
  const outer = ensureCounterClockwiseLoop(ranked[0]?.loop ?? [])
  if (outer.length < 3) return null
  return {
    outer,
    holes: ranked.slice(1).map((entry) => ensureCounterClockwiseLoop(entry.loop)).filter((loop) => loop.length >= 3),
  }
}

function rebuildTopologyFloorClusters(
  profiles: Profile2D[],
  solids: RuntimeSolid[],
  rooms: RoomVolume[],
  openings: OpeningSpec[],
  slabVoids: SlabVoidSpec[],
) {
  const topologyRooms = rooms.filter((room) => isTopologyOwnedRoom(room))
  if (topologyRooms.length === 0) {
    return { profiles, solids, slabVoids }
  }

  const roomById = new Map(topologyRooms.map((room) => [roomLabel(room), room] as const))
  const boundsByRoomId = new Map(
    topologyRooms
      .map((room) => {
        const bounds = roomProfileBounds(room, profiles)
        return bounds ? [roomLabel(room), bounds] as const : null
      })
      .filter((entry): entry is readonly [string, { minX: number; maxX: number; minZ: number; maxZ: number }] => entry !== null),
  )
  const adjacency = new Map<string, Set<string>>()
  for (const room of topologyRooms) adjacency.set(roomLabel(room), new Set())
  for (const opening of openings) {
    if (!opening.fromRoomId || !opening.toRoomId) continue
    if (!roomById.has(opening.fromRoomId) || !roomById.has(opening.toRoomId)) continue
    if (opening.openingRole === 'exterior') continue
    adjacency.get(opening.fromRoomId)?.add(opening.toRoomId)
    adjacency.get(opening.toRoomId)?.add(opening.fromRoomId)
  }

  const visited = new Set<string>()
  const clusterProfiles: Profile2D[] = []
  const clusterSolids: RuntimeSolid[] = []
  const replacedSlabIds = new Set<string>()
  const nextSlabVoids = slabVoids.map((entry) => ({ ...entry, metadata: { ...entry.metadata } }))
  let clusterIndex = 0

  for (const room of topologyRooms) {
    const roomId = roomLabel(room)
    if (visited.has(roomId)) continue
    const queue = [roomId]
    const component: string[] = []
    visited.add(roomId)
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        const currentRoom = roomById.get(current)
        const neighborRoom = roomById.get(neighbor)
        if (!currentRoom || !neighborRoom) continue
        if (currentRoom.levelId !== neighborRoom.levelId) continue
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }

    const componentRooms = component.map((id) => roomById.get(id)).filter((entry): entry is RoomVolume => Boolean(entry))
    if (componentRooms.length === 0) continue
    const componentLevelId = componentRooms[0]?.levelId ?? null
    const rects = componentRooms
      .map((entry) => boundsByRoomId.get(roomLabel(entry)))
      .filter((entry): entry is { minX: number; maxX: number; minZ: number; maxZ: number } => Boolean(entry))
    if (rects.length === 0) continue
    const union = orthogonalUnionLoops(rects)
    if (!union) continue
    const unionOuter = union.holes.length > 0
      ? [
          new Vector2(Math.min(...rects.map((entry) => entry.minX)), Math.min(...rects.map((entry) => entry.minZ))),
          new Vector2(Math.max(...rects.map((entry) => entry.maxX)), Math.min(...rects.map((entry) => entry.minZ))),
          new Vector2(Math.max(...rects.map((entry) => entry.maxX)), Math.max(...rects.map((entry) => entry.maxZ))),
          new Vector2(Math.min(...rects.map((entry) => entry.minX)), Math.max(...rects.map((entry) => entry.maxZ))),
        ]
      : union.outer

    const memberSlabs = solids.filter((solid) => {
      if (solid.spec.kind !== 'slab') return false
      const roomIdValue = typeof solid.spec.metadata.roomId === 'string' ? solid.spec.metadata.roomId : null
      return roomIdValue ? component.includes(roomIdValue) : false
    })
    if (memberSlabs.length === 0) continue

    clusterIndex += 1
    const clusterFloorId = `floor_cluster.${componentLevelId ?? 'none'}.${clusterIndex}`
    const memberBounds = {
      minX: Math.min(...rects.map((entry) => entry.minX)),
      maxX: Math.max(...rects.map((entry) => entry.maxX)),
      minZ: Math.min(...rects.map((entry) => entry.minZ)),
      maxZ: Math.max(...rects.map((entry) => entry.maxZ)),
    }
    const matchingVoids = nextSlabVoids.filter((slabVoid) => {
      if (slabVoid.hostLevelId !== componentLevelId) return false
      const hostSolidMatch = slabVoid.hostSolidId ? memberSlabs.some((solid) => solid.spec.id === slabVoid.hostSolidId) : false
      if (hostSolidMatch) return true
      const outer = segmentsToPolyline(slabVoid.outerLoop)
      if (outer.length < 3) return false
      const voidBounds = {
        minX: Math.min(...outer.map((point) => point.x)),
        maxX: Math.max(...outer.map((point) => point.x)),
        minZ: Math.min(...outer.map((point) => point.y)),
        maxZ: Math.max(...outer.map((point) => point.y)),
      }
      return boundsOverlap(memberBounds, voidBounds)
    })
    const holes = [
      ...matchingVoids
        .map((slabVoid) => segmentsToPolyline(slabVoid.outerLoop))
        .filter((loop) => loop.length >= 3)
        .map((loop) => ensureCounterClockwiseLoop(loop)),
    ]
    const clusterProfile = runtimeProfileFromLoops(
      `${clusterFloorId}.profile`,
      unionOuter,
      holes,
      {
        clusterFloorId,
        roomIds: component,
        levelId: componentLevelId,
      },
    )
    const floorElevation = Math.min(...componentRooms.map((entry) => entry.floorElevation))
    const floorThickness = Math.max(...componentRooms.map((entry) => Number(entry.metadata.floorThickness ?? 0.18)))
    const geometry = extrudeProfile(clusterProfile, floorThickness)
    geometry.translate(0, floorElevation, 0)
    const sourceNodeKey = componentRooms[0]?.sourceNodeKey ?? memberSlabs[0]?.spec.sourceNodeKey ?? 'topology_floor_cluster'
    clusterProfiles.push(clusterProfile.profile)
    clusterSolids.push({
      spec: {
        id: clusterFloorId,
        sourceNodeKey,
        kind: 'slab',
        profileId: clusterProfile.profile.id,
        transform: { position: [0, floorElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        params: { thickness: floorThickness },
        metadata: {
          levelId: componentLevelId,
          topologyOwned: true,
          clusterFloorId,
          roomIds: component,
          sourceNodeKeys: Array.from(new Set(componentRooms.map((entry) => entry.sourceNodeKey))),
        },
      },
      geometry,
      color: memberSlabs[0]?.color ?? '#596979',
    })
    for (const slab of memberSlabs) replacedSlabIds.add(slab.spec.id)
    for (const slabVoid of matchingVoids) {
      slabVoid.hostSolidId = clusterFloorId
      slabVoid.metadata = {
        ...slabVoid.metadata,
        appliedInProfile: true,
        clusterFloorId,
      }
    }
  }

  return {
    profiles: [...profiles, ...clusterProfiles],
    solids: [...solids.filter((solid) => !replacedSlabIds.has(solid.spec.id)), ...clusterSolids],
    slabVoids: nextSlabVoids,
  }
}

function rectProfileFromBounds(id: string, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, metadata: Record<string, unknown> = {}) {
  const outer = [
    new Vector2(bounds.minX, bounds.minZ),
    new Vector2(bounds.maxX, bounds.minZ),
    new Vector2(bounds.maxX, bounds.maxZ),
    new Vector2(bounds.minX, bounds.maxZ),
  ]
  return runtimeProfileFromLoops(id, outer, [], metadata).profile
}

function wallSegmentCenter(segment: WallSegmentSpec) {
  return new Vector3(
    (segment.start[0] + segment.end[0]) * 0.5,
    segment.start[1] + segment.height * 0.5,
    (segment.start[2] + segment.end[2]) * 0.5,
  )
}

function wallSegmentNormal(segment: WallSegmentSpec) {
  const metadataNormal = Array.isArray(segment.metadata.normal) && segment.metadata.normal.length >= 3
    ? segment.metadata.normal
    : null
  if (metadataNormal) {
    return new Vector3(Number(metadataNormal[0]), Number(metadataNormal[1]), Number(metadataNormal[2])).normalize()
  }
  const direction = new Vector3(segment.end[0] - segment.start[0], 0, segment.end[2] - segment.start[2]).normalize()
  return new Vector3(-direction.z, 0, direction.x).normalize()
}

function wallSegmentHostOffset(segment: WallSegmentSpec) {
  if (segment.wallRole !== 'exterior') return new Vector3(0, 0, 0)
  return wallSegmentNormal(segment).multiplyScalar(segment.thickness * 0.5)
}

function wallSegmentHostCenter(segment: WallSegmentSpec) {
  return wallSegmentCenter(segment).add(wallSegmentHostOffset(segment))
}

function wallSegmentHostId(segment: WallSegmentSpec) {
  return `${segment.id}.solid`
}

function createPartitionWallSolid(segment: WallSegmentSpec): RuntimeSolid {
  const start = new Vector3(segment.start[0], segment.start[1], segment.start[2])
  const end = new Vector3(segment.end[0], segment.end[1], segment.end[2])
  const span = new Vector3().subVectors(end, start)
  const length = Math.max(span.length(), 0.001)
  const center = wallSegmentHostCenter(segment)
  const angle = Math.atan2(span.z, span.x)
  const geometry = new BoxGeometry(length, segment.height, segment.thickness)
  geometry.rotateY(-angle)
  geometry.translate(center.x, center.y, center.z)
  return {
    spec: {
      id: wallSegmentHostId(segment),
      sourceNodeKey: segment.sourceNodeKeys[0] ?? segment.id,
      kind: segment.wallRole === 'partition' ? 'partition_wall' : 'wall_shell',
      profileId: null,
      transform: { position: [center.x, center.y, center.z], rotation: [0, angle, 0], scale: [1, 1, 1] },
      params: { length, thickness: segment.thickness, height: segment.height },
      metadata: {
        wallSegmentId: segment.id,
        levelId: segment.levelId,
        ownerRoomIds: segment.ownerRoomIds,
        wallRole: segment.wallRole,
        wallSystem: 'topology',
      },
    },
    geometry,
    color: segment.wallRole === 'partition' ? '#8f7d68' : '#7f92a6',
  }
}

function createPartitionWallFace(segment: WallSegmentSpec, partition: PartitionWallSpec | null = null): WallFaceSpec {
  const hostOffset = wallSegmentHostOffset(segment)
  const center = wallSegmentCenter(segment).add(hostOffset)
  const normal = wallSegmentNormal(segment)
  return {
    id: `${segment.id}.face`,
    sourceNodeKey: segment.sourceNodeKeys[0] ?? segment.id,
    wallRunId: segment.id,
    levelId: segment.levelId,
    wallRole: segment.wallRole,
    ownerRoomIds: segment.ownerRoomIds,
    start: [segment.start[0] + hostOffset.x, segment.start[1], segment.start[2] + hostOffset.z],
    end: [segment.end[0] + hostOffset.x, segment.end[1], segment.end[2] + hostOffset.z],
    center: [center.x, center.y, center.z],
    normal: [normal.x, normal.y, normal.z],
    elevationBottom: center.y - segment.height * 0.5,
    elevationTop: center.y + segment.height * 0.5,
    metadata: {
      wallSegmentId: segment.id,
      wallRole: segment.wallRole,
      wallSystem: 'topology',
      fromRoomId: partition?.fromRoomId ?? null,
      toRoomId: partition?.toRoomId ?? null,
    },
  }
}

function deriveRoomTopology(rooms: RoomVolume[], profiles: Profile2D[], diagnostics: string[]) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const topologyRooms = rooms.filter((room) => isTopologyOwnedRoom(room))
  type BoundaryEntry = {
    room: RoomVolume
    start: Vector2
    end: Vector2
    tStart: number
    tEnd: number
    axis: Vector2
    lineNormal: Vector2
    offset: number
    outwardNormal: [number, number, number]
  }
  const boundaryGroups = new Map<string, BoundaryEntry[]>()

  for (const room of topologyRooms) {
    const outer = profileOuterLoop(profileMap.get(room.profileId ?? ''))
    if (outer.length < 2) continue
    const signedArea = outer.reduce((sum, point, index) => {
      const next = outer[(index + 1) % outer.length]
      return sum + (point.x * next.y - next.x * point.y)
    }, 0)
    const isClockwise = signedArea < 0
    for (let index = 0; index < outer.length; index += 1) {
      const start = outer[index]
      const end = outer[(index + 1) % outer.length]
      const direction = new Vector2(end.x - start.x, end.y - start.y)
      if (direction.lengthSq() <= 1e-8) continue
      direction.normalize()
      const canonicalAxis = direction.x < -1e-6 || (Math.abs(direction.x) <= 1e-6 && direction.y < 0)
        ? direction.clone().multiplyScalar(-1)
        : direction.clone()
      const lineNormal = new Vector2(-canonicalAxis.y, canonicalAxis.x)
      const offset = start.x * lineNormal.x + start.y * lineNormal.y
      const tStart = start.x * canonicalAxis.x + start.y * canonicalAxis.y
      const tEnd = end.x * canonicalAxis.x + end.y * canonicalAxis.y
      const outwardNormal2d = isClockwise
        ? new Vector2(-direction.y, direction.x)
        : new Vector2(direction.y, -direction.x)
      const groupKey = `${room.levelId ?? 'none'}::${canonicalAxis.x.toFixed(4)}:${canonicalAxis.y.toFixed(4)}::${offset.toFixed(4)}`
      const entries = boundaryGroups.get(groupKey) ?? []
      entries.push({
        room,
        start,
        end,
        tStart: Math.min(tStart, tEnd),
        tEnd: Math.max(tStart, tEnd),
        axis: canonicalAxis,
        lineNormal,
        offset,
        outwardNormal: [outwardNormal2d.x, 0, outwardNormal2d.y],
      })
      boundaryGroups.set(groupKey, entries)
    }
  }

  const wallSegments: WallSegmentSpec[] = []
  const partitionWalls: PartitionWallSpec[] = []
  const roomAdjacency: RoomAdjacencySpec[] = []

  for (const [groupKey, entries] of boundaryGroups.entries()) {
    const breakpoints = Array.from(new Set(entries.flatMap((entry) => [entry.tStart.toFixed(4), entry.tEnd.toFixed(4)])))
      .map((value) => Number(value))
      .sort((a, b) => a - b)
    if (breakpoints.length < 2) continue
    const axis = entries[0]?.axis
    const lineNormal = entries[0]?.lineNormal
    const offset = entries[0]?.offset
    if (!axis || !lineNormal || typeof offset !== 'number') continue

    for (let breakpointIndex = 0; breakpointIndex < breakpoints.length - 1; breakpointIndex += 1) {
      const segmentStartT = breakpoints[breakpointIndex]
      const segmentEndT = breakpoints[breakpointIndex + 1]
      if (segmentEndT - segmentStartT <= 1e-4) continue
      const midpoint = (segmentStartT + segmentEndT) * 0.5
      const owners = entries.filter((entry) => midpoint >= entry.tStart - 1e-4 && midpoint <= entry.tEnd + 1e-4)
      if (owners.length === 0) continue
      const first = owners[0]
      if (!first) continue
      const start = new Vector2(axis.x * segmentStartT + lineNormal.x * offset, axis.y * segmentStartT + lineNormal.y * offset)
      const end = new Vector2(axis.x * segmentEndT + lineNormal.x * offset, axis.y * segmentEndT + lineNormal.y * offset)
      const baseHeight = Math.max(Math.min(...owners.map(({ room }) => room.ceilingElevation - room.floorElevation)), 0.1)
      const baseY = Math.min(...owners.map(({ room }) => room.floorElevation))
      const ownerRoomIds = Array.from(new Set(owners.map(({ room }) => roomLabel(room))))
      const sourceNodeKeys = Array.from(new Set(owners.map(({ room }) => room.sourceNodeKey)))
      const wallRole = owners.length === 1 ? 'exterior' as const : 'partition' as const
      const thickness = wallRole === 'exterior'
        ? Number(first.room.metadata.wallThickness ?? 0.22)
        : Math.min(...owners.map(({ room }) => Number(room.metadata.wallThickness ?? 0.16)))
      const wallSegmentId = `wall_segment.${segmentKey(start, end, first.room.levelId)}.${breakpointIndex + 1}`
      wallSegments.push({
        id: wallSegmentId,
        sourceNodeKeys,
        levelId: first.room.levelId,
        wallRole,
        start: [start.x, baseY, start.y],
        end: [end.x, baseY, end.y],
        thickness,
        height: baseHeight,
        ownerRoomIds,
        movablePartition: owners.some(({ room }) => room.movablePartition === true),
        zoneOwned: owners.some(({ room }) => room.zoneOwned === true),
        circulationOwned: owners.some(({ room }) => room.circulationOwned === true),
        metadata: {
          topologyOwned: true,
          wallSystem: 'topology',
          normal: first.outwardNormal,
          groupKey,
        },
      })
      if (wallRole === 'partition') {
        for (let ownerIndex = 1; ownerIndex < owners.length; ownerIndex += 1) {
          const other = owners[ownerIndex]
          partitionWalls.push({
            id: `partition.${wallSegmentId}.${ownerIndex}`,
            sourceNodeKeys: [first.room.sourceNodeKey, other.room.sourceNodeKey],
            wallSegmentId,
            levelId: first.room.levelId,
            fromRoomId: roomLabel(first.room),
            toRoomId: roomLabel(other.room),
            metadata: { wallSystem: 'topology' },
          })
          roomAdjacency.push({
            id: `adjacency.${wallSegmentId}.${ownerIndex}`,
            levelId: first.room.levelId,
            fromRoomId: roomLabel(first.room),
            toRoomId: roomLabel(other.room),
            wallSegmentId,
            metadata: { wallSystem: 'topology' },
          })
        }
      }
    }
  }

  if (partitionWalls.length === 0 && topologyRooms.length > 1) {
    diagnostics.push('No semantic room adjacencies were derived from the current room profiles.')
  }

  return { wallSegments, partitionWalls, roomAdjacency }
}

function resolveInteriorDoorRequests(
  requests: InteriorDoorRequest[],
  roomAdjacency: RoomAdjacencySpec[],
  wallSegments: WallSegmentSpec[],
): OpeningSpec[] {
  const wallSegmentsById = new Map(wallSegments.map((segment) => [segment.id, segment]))

  return requests.flatMap((request) => {
    const requested = new Set(request.roomIds)
    const adjacency = roomAdjacency.find((entry) => {
      const ids = new Set([entry.fromRoomId, entry.toRoomId].filter(Boolean))
      return requested.size > 0
        ? Array.from(requested).every((id) => ids.has(id))
        : false
    })
    const preferredSegment = request.preferredWallSegmentId ? wallSegmentsById.get(request.preferredWallSegmentId) : null
    const segment = preferredSegment ?? (adjacency?.wallSegmentId ? wallSegmentsById.get(adjacency.wallSegmentId) ?? null : null)
    if (!segment) return []
    const tangent = new Vector3(segment.end[0] - segment.start[0], 0, segment.end[2] - segment.start[2]).normalize()
    const baseCenter = wallSegmentHostCenter(segment)
    const projected = request.connectionPlacement !== 'center' && request.preferredPosition
      ? projectPointToWallSegment(request.preferredPosition, segment)
      : null
    const center = projected
      ? new Vector3(projected.resolvedPosition[0], baseCenter.y, projected.resolvedPosition[2]).addScaledVector(tangent, request.offset)
      : baseCenter.clone().addScaledVector(tangent, request.offset)
    return [{
      id: request.id,
      sourceNodeKey: request.sourceNodeKey,
      hostSolidId: wallSegmentHostId(segment),
      hostWallSegmentId: segment.id,
      levelId: adjacency?.levelId ?? segment.levelId,
      fromRoomId: adjacency?.fromRoomId ?? segment.ownerRoomIds[0] ?? null,
      toRoomId: adjacency?.toRoomId ?? segment.ownerRoomIds[1] ?? null,
      kind: 'doorway',
      openingRole: 'interior',
      position: [center.x, segment.start[1] + request.height * 0.5, center.z],
      size: [request.width, request.height, Math.max(segment.thickness + 0.04, 0.12)],
      metadata: {
        connectionPlacement: request.connectionPlacement ?? 'auto',
        projectedFromLanding: Boolean(projected),
      },
    }]
  })
}

function pointToWallSegmentDistanceXZ(point: OpeningSpec['position'], segment: WallSegmentSpec) {
  const start = new Vector3(segment.start[0], 0, segment.start[2])
  const end = new Vector3(segment.end[0], 0, segment.end[2])
  const target = new Vector3(point[0], 0, point[2])
  const line = new Vector3().subVectors(end, start)
  const lengthSq = Math.max(line.lengthSq(), 1e-8)
  const t = Math.max(0, Math.min(1, new Vector3().subVectors(target, start).dot(line) / lengthSq))
  const projection = start.clone().addScaledVector(line, t)
  return projection.distanceTo(target)
}

function projectPointToWallSegment(point: [number, number, number], segment: WallSegmentSpec) {
  const start = new Vector3(segment.start[0], 0, segment.start[2])
  const end = new Vector3(segment.end[0], 0, segment.end[2])
  const target = new Vector3(point[0], 0, point[2])
  const line = new Vector3().subVectors(end, start)
  const lengthSq = Math.max(line.lengthSq(), 1e-8)
  const tangent = line.clone().normalize()
  const rawT = new Vector3().subVectors(target, start).dot(line) / lengthSq
  const clampedT = Math.max(0, Math.min(1, rawT))
  const projection = start.clone().addScaledVector(line, clampedT)
  const hostCenter = wallSegmentHostCenter(segment)
  const midpoint = new Vector3((segment.start[0] + segment.end[0]) * 0.5, hostCenter.y, (segment.start[2] + segment.end[2]) * 0.5)
  const resolvedPosition = wallSegmentHostCenter(segment).addScaledVector(tangent, projection.clone().sub(new Vector3(midpoint.x, 0, midpoint.z)).dot(tangent))
  const offset = projection.clone().sub(new Vector3(midpoint.x, 0, midpoint.z)).dot(tangent)
  return {
    resolvedPosition: [resolvedPosition.x, hostCenter.y, resolvedPosition.z] as [number, number, number],
    offset,
  }
}

function remapTopologyOpenings(
  openings: OpeningSpec[],
  wallSegments: WallSegmentSpec[],
  diagnostics: string[],
) {
  return openings.map((opening) => {
    const existing = opening.hostWallSegmentId
      ? wallSegments.find((segment) => segment.id === opening.hostWallSegmentId)
      : null
    const fallback = !existing && opening.openingRole !== 'interior'
      ? wallSegments
        .filter((segment) =>
          segment.wallRole === 'exterior'
          && segment.levelId === opening.levelId
          && (!opening.fromRoomId || segment.ownerRoomIds.includes(opening.fromRoomId)))
        .sort((left, right) => pointToWallSegmentDistanceXZ(opening.position, left) - pointToWallSegmentDistanceXZ(opening.position, right))[0] ?? null
      : null
    const resolvedSegment = existing ?? fallback
    if (!resolvedSegment) {
      if (opening.openingRole !== 'interior' && opening.hostSolidId && opening.hostSolidId.endsWith('.floor')) {
        diagnostics.push(`Opening "${opening.id}" could not resolve a topology wall host.`)
      }
      return opening
    }
    const tangent = new Vector3(resolvedSegment.end[0] - resolvedSegment.start[0], 0, resolvedSegment.end[2] - resolvedSegment.start[2]).normalize()
    const center = wallSegmentHostCenter(resolvedSegment)
    const current = new Vector3(opening.position[0], 0, opening.position[2])
    const midpoint = new Vector3((resolvedSegment.start[0] + resolvedSegment.end[0]) * 0.5, 0, (resolvedSegment.start[2] + resolvedSegment.end[2]) * 0.5)
    const offset = new Vector3().subVectors(current, midpoint).dot(tangent)
    const resolvedPosition = center.clone().addScaledVector(tangent, offset)
    return {
      ...opening,
      hostSolidId: wallSegmentHostId(resolvedSegment),
      hostWallSegmentId: resolvedSegment.id,
      levelId: resolvedSegment.levelId,
      fromRoomId: opening.fromRoomId ?? resolvedSegment.ownerRoomIds[0] ?? null,
      toRoomId: opening.toRoomId ?? resolvedSegment.ownerRoomIds[1] ?? null,
      position: [resolvedPosition.x, opening.position[1], resolvedPosition.z] as [number, number, number],
      size: [
        opening.size[0],
        opening.size[1],
        Math.max(opening.size[2], resolvedSegment.thickness + 0.04),
      ] as [number, number, number],
      metadata: {
        ...opening.metadata,
        wallSystem: 'topology',
      },
    }
  })
}

function remapTopologyWindows(windows: WindowSpec[], openings: OpeningSpec[]) {
  const openingById = new Map(
    openings
      .map((opening) => {
        const openingId = typeof opening.metadata.openingId === 'string'
          ? String(opening.metadata.openingId)
          : opening.id.replace('.window_', '.opening_')
        return [openingId, opening] as const
      }),
  )
  return windows.map((windowSpec) => {
    const openingId = typeof windowSpec.metadata.openingId === 'string' ? String(windowSpec.metadata.openingId) : null
    const opening = openingId ? openingById.get(openingId) : null
    return opening
      ? {
          ...windowSpec,
          hostSolidId: opening.hostSolidId,
          position: opening.position,
          metadata: {
            ...windowSpec.metadata,
            wallSystem: 'topology',
          },
        }
      : windowSpec
  })
}

function applyOpeningsToSolids(
  solids: RuntimeSolid[],
  openings: OpeningSpec[],
  diagnostics: string[],
  wallSegments: WallSegmentSpec[] = [],
) {
  const bySolidId = new Map(solids.map((solid) => [solid.spec.id, solid]))
  const wallSegmentsById = new Map(wallSegments.map((segment) => [segment.id, segment]))
  for (const opening of openings) {
    if (!opening.hostSolidId) continue
    const host = bySolidId.get(opening.hostSolidId)
    if (!host) continue
    const geometry = new BoxGeometry(opening.size[0], opening.size[1], Math.max(opening.size[2], 0.08))
    const segment = opening.hostWallSegmentId ? wallSegmentsById.get(opening.hostWallSegmentId) : null
    if (segment) {
      const span = new Vector3(
        segment.end[0] - segment.start[0],
        segment.end[1] - segment.start[1],
        segment.end[2] - segment.start[2],
      )
      const angle = Math.atan2(span.z, span.x)
      geometry.rotateY(-angle)
    }
    geometry.translate(opening.position[0], opening.position[1], opening.position[2])
    bySolidId.set(host.spec.id, subtractGeometryFromSolid(host, geometry, opening.sourceNodeKey, diagnostics))
  }
  return solids.map((solid) => bySolidId.get(solid.spec.id) ?? solid)
}

function slabSolidBoundsXZ(solid: RuntimeSolid) {
  if (!solid.geometry.boundingBox) solid.geometry.computeBoundingBox()
  const bounds = solid.geometry.boundingBox
  if (!bounds) return null
  return {
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
  }
}

function applySlabVoidsToSolids(solids: RuntimeSolid[], slabVoids: SlabVoidSpec[], diagnostics: string[]) {
  const bySolidId = new Map(solids.map((solid) => [solid.spec.id, solid]))
  for (const slabVoid of slabVoids) {
    const outer = segmentsToPolyline(slabVoid.outerLoop)
    if (outer.length < 3) continue
    const voidBounds = {
      minX: Math.min(...outer.map((point) => point.x)),
      maxX: Math.max(...outer.map((point) => point.x)),
      minZ: Math.min(...outer.map((point) => point.y)),
      maxZ: Math.max(...outer.map((point) => point.y)),
    }
    const matching = solids.filter((solid) => {
      if (solid.spec.kind !== 'slab') return false
      if (solid.spec.id === slabVoid.hostSolidId) return true
      const levelId = typeof solid.spec.metadata.levelId === 'string' ? solid.spec.metadata.levelId : null
      if (levelId !== slabVoid.hostLevelId) return false
      const hostBounds = slabSolidBoundsXZ(solid)
      return hostBounds ? boundsOverlap(hostBounds, voidBounds) : false
    })
    for (const host of matching) {
      const profile = runtimeProfileFromLoops(`${slabVoid.id}.profile`, outer, [])
      const height = Math.max(slabVoid.topElevation - slabVoid.bottomElevation, 0.4)
      const geometry = extrudeProfile(profile, height)
      geometry.translate(0, slabVoid.bottomElevation, 0)
      bySolidId.set(host.spec.id, subtractGeometryFromSolid(host, geometry, slabVoid.sourceNodeKey, diagnostics, {
        preserveSourceNodeKey: true,
        metadata: {
          carvedBy: slabVoid.sourceNodeKey,
          carvedVoidId: slabVoid.id,
          clusterFloorId: typeof slabVoid.metadata.clusterFloorId === 'string' ? slabVoid.metadata.clusterFloorId : undefined,
        },
      }))
    }
  }
  return solids.map((solid) => bySolidId.get(solid.spec.id) ?? solid)
}

function stairKindFromFamily(stairFamily: StairRunSpec['stairFamily']): StairRunSpec['kind'] {
  if (stairFamily === 'spiral') return 'spiral'
  if (stairFamily === 'u_stair' || stairFamily === 'winder_u') return 'switchback'
  return 'straight'
}

function rectLoopFromBounds(id: string, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  return {
    id,
    closed: true,
    kind: 'outer' as const,
    segments: pointsToSegments([
      new Vector2(bounds.minX, bounds.minZ),
      new Vector2(bounds.maxX, bounds.minZ),
      new Vector2(bounds.maxX, bounds.maxZ),
      new Vector2(bounds.minX, bounds.maxZ),
    ]),
  }
}

function overlapAmount(minA: number, maxA: number, minB: number, maxB: number) {
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB))
}

function boundsOverlap(a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  return overlapAmount(a.minX, a.maxX, b.minX, b.maxX) > 1e-4 && overlapAmount(a.minZ, a.maxZ, b.minZ, b.maxZ) > 1e-4
}

function extendStairVoidToTopConnections(
  voidBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  zoneBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  stairId: string,
  toLevelId: string | null,
  stairConnectionRequests: StairConnectionRequest[],
  roomById: Map<string, RoomVolume>,
  profiles: Profile2D[],
) {
  if (!toLevelId) return voidBounds

  const next = { ...voidBounds }
  const relevantRequests = stairConnectionRequests.filter((entry) =>
    entry.stairId === stairId && entry.connectionMode === 'door' && entry.landing !== 'bottom')

  for (const request of relevantRequests) {
    for (const roomId of request.targetRoomIds) {
      const room = roomById.get(roomId)
      if (!room || room.levelId !== toLevelId) continue
      const targetBounds = roomProfileBounds(room, profiles)
      if (!targetBounds) continue
      const overlapX = overlapAmount(zoneBounds.minX, zoneBounds.maxX, targetBounds.minX, targetBounds.maxX)
      const overlapZ = overlapAmount(zoneBounds.minZ, zoneBounds.maxZ, targetBounds.minZ, targetBounds.maxZ)
      if (Math.abs(targetBounds.maxX - zoneBounds.minX) < 0.2 && overlapZ > 0.2) next.minX = zoneBounds.minX
      if (Math.abs(targetBounds.minX - zoneBounds.maxX) < 0.2 && overlapZ > 0.2) next.maxX = zoneBounds.maxX
      if (Math.abs(targetBounds.maxZ - zoneBounds.minZ) < 0.2 && overlapX > 0.2) next.minZ = zoneBounds.minZ
      if (Math.abs(targetBounds.minZ - zoneBounds.maxZ) < 0.2 && overlapX > 0.2) next.maxZ = zoneBounds.maxZ
    }
  }

  return next
}

function regenerateRoomSlabSolid(solid: RuntimeSolid, profile: Profile2D, room: RoomVolume) {
  const floorThickness = Number(solid.spec.params.thickness ?? room.metadata.floorThickness ?? 0.18)
  const runtimeProfile = runtimeProfileFromShape(profile)
  const geometry = extrudeProfile(runtimeProfile, floorThickness)
  geometry.translate(0, room.floorElevation, 0)
  return {
    ...solid,
    spec: {
      ...solid.spec,
      profileId: profile.id,
    },
    geometry,
  } satisfies RuntimeSolid
}

function solveStairGeometry(
  request: StairLayoutRequest,
  resolvedBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  fromElevation: number,
  targetElevation: number,
) {
  const diagnostics: string[] = []
  const totalRise = Math.max(targetElevation - fromElevation, 0.01)
  const riseCount = Math.max(2, Math.ceil(totalRise / Math.max(request.maxRise, 0.01)))
  const actualRise = totalRise / riseCount
  const clearancePad = request.wallClearance + request.clearanceMargin
  const width = request.width
  const tread = request.tread
  const landingDepth = Math.max(request.landingDepth, width)
  const midX = (resolvedBounds.minX + resolvedBounds.maxX) * 0.5
  const midZ = (resolvedBounds.minZ + resolvedBounds.maxZ) * 0.5
  const lowerRunSteps = Math.max(1, Math.ceil(riseCount / (request.stairFamily === 'straight' || request.stairFamily === 'mezzanine' || request.stairFamily === 'spiral' ? 1 : 2)))
  const upperRunSteps = Math.max(0, riseCount - lowerRunSteps)
  const lowerRunLength = lowerRunSteps * tread
  const upperRunLength = Math.max(upperRunSteps, 1) * tread

  let requiredWidth = width + clearancePad * 2
  let requiredDepth = lowerRunLength + landingDepth + clearancePad * 2
  if (request.stairFamily === 'u_stair' || request.stairFamily === 'winder_u') {
    requiredWidth = width * 2 + Math.max(width * 0.35, request.wallClearance * 2) + clearancePad * 2
    requiredDepth = Math.max(lowerRunLength, upperRunLength) + landingDepth + clearancePad * 2
  } else if (request.stairFamily === 'l_stair' || request.stairFamily === 'winder_l') {
    requiredWidth = width + upperRunLength + landingDepth + clearancePad * 2
    requiredDepth = width + lowerRunLength + landingDepth + clearancePad * 2
  } else if (request.stairFamily === 'spiral') {
    const radius = Math.max(width * 0.5, 0.85)
    requiredWidth = radius * 2 + clearancePad * 2
    requiredDepth = radius * 2 + clearancePad * 2
  }

  const usableBounds = {
    minX: midX - requiredWidth * 0.5,
    maxX: midX + requiredWidth * 0.5,
    minZ: midZ - requiredDepth * 0.5,
    maxZ: midZ + requiredDepth * 0.5,
  }

  const solids: RuntimeSolid[] = []
  const anchors: Anchor[] = []
  const landingIds: string[] = []
  const intermediateLandingIds: string[] = []
  const stairId = `${request.sourceNodeKey}.stair`
  const baseColor = '#b98f66'
  const landingColor = '#b1a385'
  let voidBounds = { ...usableBounds }
  let bottomLandingId: string | null = null
  let topLandingId: string | null = null
  let bottomConnectionPoint: [number, number, number] | null = null
  let topConnectionPoint: [number, number, number] | null = null

  if (request.stairFamily === 'spiral') {
    const radius = Math.max(width * 0.5, 0.85)
    for (let index = 0; index < riseCount; index += 1) {
      const angle = (index / riseCount) * Math.PI * 2
      const height = fromElevation + actualRise * (index + 1)
      const x = midX + Math.cos(angle) * radius * 0.58
      const z = midZ + Math.sin(angle) * radius * 0.58
      solids.push({
        spec: {
          id: `${request.sourceNodeKey}.step_${index + 1}`,
          sourceNodeKey: request.sourceNodeKey,
          kind: 'stair',
          profileId: null,
          transform: { position: [x, height, z], rotation: [0, angle, 0], scale: [1, 1, 1] },
          params: { stepIndex: index + 1 },
          metadata: { stairFamily: request.stairFamily },
        },
        geometry: orientedBoxGeometry(radius, 0.12, 0.5, new Vector3(x, height, z), angle),
        color: baseColor,
      })
    }
    anchors.push(
      createAnchor(request.sourceNodeKey, 'Stair Base', new Vector3(midX, fromElevation, midZ)),
      createAnchor(request.sourceNodeKey, 'Stair Top', new Vector3(midX, targetElevation, midZ)),
    )
    bottomConnectionPoint = [midX, fromElevation, midZ]
    topConnectionPoint = [midX, targetElevation, midZ]
  } else if (request.stairFamily === 'straight' || request.stairFamily === 'mezzanine') {
    const stepDepth = lowerRunLength / Math.max(riseCount, 1)
    const runStartZ = usableBounds.minZ + clearancePad
    for (let index = 0; index < riseCount; index += 1) {
      const topY = fromElevation + actualRise * (index + 1)
      const stepCenter = new Vector3(midX, fromElevation + (topY - fromElevation) * 0.5, runStartZ + stepDepth * index + stepDepth * 0.5)
      solids.push({
        spec: {
          id: `${request.sourceNodeKey}.step_${index + 1}`,
          sourceNodeKey: request.sourceNodeKey,
          kind: 'stair',
          profileId: null,
          transform: { position: [stepCenter.x, stepCenter.y, stepCenter.z], rotation: [0, 0, 0], scale: [1, 1, 1] },
          params: { stepIndex: index + 1 },
          metadata: { stairFamily: request.stairFamily },
        },
        geometry: orientedBoxGeometry(width, topY - fromElevation, stepDepth, stepCenter, 0),
        color: baseColor,
      })
    }
    const topLandingCenter = new Vector3(midX, targetElevation + 0.09, runStartZ + lowerRunLength + landingDepth * 0.5)
    const topLandingSolidId = `${request.sourceNodeKey}.landing_top`
    landingIds.push(topLandingSolidId)
    topLandingId = topLandingSolidId
    solids.push({
      spec: {
        id: topLandingSolidId,
        sourceNodeKey: request.sourceNodeKey,
        kind: 'landing',
        profileId: null,
        transform: { position: [topLandingCenter.x, topLandingCenter.y, topLandingCenter.z], rotation: [0, 0, 0], scale: [1, 1, 1] },
        params: { landingElevation: targetElevation },
        metadata: { stairFamily: request.stairFamily, landingRole: 'top' },
      },
      geometry: new BoxGeometry(width, 0.18, landingDepth).translate(topLandingCenter.x, topLandingCenter.y, topLandingCenter.z),
      color: landingColor,
    })
    voidBounds = {
      minX: midX - width * 0.5 - request.wallClearance,
      maxX: midX + width * 0.5 + request.wallClearance,
      minZ: usableBounds.minZ,
      maxZ: Math.min(usableBounds.maxZ, runStartZ + lowerRunLength + landingDepth + request.wallClearance + request.clearanceMargin),
    }
    anchors.push(
      createAnchor(request.sourceNodeKey, 'Stair Base', new Vector3(midX, fromElevation, runStartZ)),
      createAnchor(request.sourceNodeKey, 'Stair Top', new Vector3(topLandingCenter.x, targetElevation, topLandingCenter.z)),
    )
    bottomConnectionPoint = [midX, fromElevation, runStartZ]
    topConnectionPoint = [topLandingCenter.x, targetElevation, topLandingCenter.z]
  } else if (request.stairFamily === 'u_stair' || request.stairFamily === 'winder_u') {
    const halfGap = Math.max(width * 0.2, request.wallClearance)
    const leftX = midX - (width + halfGap) * 0.5
    const rightX = midX + (width + halfGap) * 0.5
    const runStartZ = usableBounds.minZ + clearancePad
    const lowerStepDepth = lowerRunLength / Math.max(lowerRunSteps, 1)
    for (let index = 0; index < lowerRunSteps; index += 1) {
      const topY = fromElevation + actualRise * (index + 1)
      const stepCenter = new Vector3(leftX, fromElevation + (topY - fromElevation) * 0.5, runStartZ + lowerStepDepth * index + lowerStepDepth * 0.5)
      solids.push({
        spec: { id: `${request.sourceNodeKey}.lower_${index + 1}`, sourceNodeKey: request.sourceNodeKey, kind: 'stair', profileId: null, transform: { position: [stepCenter.x, stepCenter.y, stepCenter.z], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: { stairFamily: request.stairFamily } },
        geometry: orientedBoxGeometry(width, topY - fromElevation, lowerStepDepth, stepCenter, 0),
        color: baseColor,
      })
    }
    const landingElevation = fromElevation + actualRise * lowerRunSteps
    const landingCenter = new Vector3(midX, landingElevation + 0.09, runStartZ + lowerRunLength + landingDepth * 0.5)
    landingIds.push(`${request.sourceNodeKey}.landing_mid`)
    intermediateLandingIds.push(`${request.sourceNodeKey}.landing_mid`)
    bottomLandingId = `${request.sourceNodeKey}.landing_mid`
    topLandingId = `${request.sourceNodeKey}.landing_mid`
    solids.push({
      spec: { id: `${request.sourceNodeKey}.landing_mid`, sourceNodeKey: request.sourceNodeKey, kind: 'landing', profileId: null, transform: { position: [landingCenter.x, landingCenter.y, landingCenter.z], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { landingElevation }, metadata: { stairFamily: request.stairFamily } },
      geometry: new BoxGeometry(width * 2 + halfGap, 0.18, landingDepth).translate(landingCenter.x, landingCenter.y, landingCenter.z),
      color: landingColor,
    })
    const upperStepDepth = upperRunLength / Math.max(upperRunSteps, 1)
    for (let index = 0; index < upperRunSteps; index += 1) {
      const topY = landingElevation + actualRise * (index + 1)
      const stepCenter = new Vector3(rightX, fromElevation + (topY - fromElevation) * 0.5, runStartZ + lowerRunLength + landingDepth + upperRunLength - upperStepDepth * index - upperStepDepth * 0.5)
      solids.push({
        spec: { id: `${request.sourceNodeKey}.upper_${index + 1}`, sourceNodeKey: request.sourceNodeKey, kind: 'stair', profileId: null, transform: { position: [stepCenter.x, stepCenter.y, stepCenter.z], rotation: [0, Math.PI, 0], scale: [1, 1, 1] }, params: { stepIndex: lowerRunSteps + index + 1 }, metadata: { stairFamily: request.stairFamily } },
        geometry: orientedBoxGeometry(width, topY - fromElevation, upperStepDepth, stepCenter, Math.PI),
        color: baseColor,
      })
    }
    anchors.push(
      createAnchor(request.sourceNodeKey, 'Stair Base', new Vector3(leftX, fromElevation, runStartZ)),
      createAnchor(request.sourceNodeKey, 'Stair Top', new Vector3(rightX, targetElevation, runStartZ + lowerRunLength + landingDepth)),
    )
    bottomConnectionPoint = [leftX, fromElevation, runStartZ]
    topConnectionPoint = [rightX, targetElevation, runStartZ + lowerRunLength + landingDepth]
  } else {
    const runStartX = request.turnDirection === 'left' ? usableBounds.maxX - clearancePad - width * 0.5 : usableBounds.minX + clearancePad + width * 0.5
    const runStartZ = usableBounds.minZ + clearancePad
    const lowerStepDepth = lowerRunLength / Math.max(lowerRunSteps, 1)
    for (let index = 0; index < lowerRunSteps; index += 1) {
      const topY = fromElevation + actualRise * (index + 1)
      const stepCenter = new Vector3(runStartX, fromElevation + (topY - fromElevation) * 0.5, runStartZ + lowerStepDepth * index + lowerStepDepth * 0.5)
      solids.push({
        spec: { id: `${request.sourceNodeKey}.lower_${index + 1}`, sourceNodeKey: request.sourceNodeKey, kind: 'stair', profileId: null, transform: { position: [stepCenter.x, stepCenter.y, stepCenter.z], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: { stairFamily: request.stairFamily } },
        geometry: orientedBoxGeometry(width, topY - fromElevation, lowerStepDepth, stepCenter, 0),
        color: baseColor,
      })
    }
    const landingElevation = fromElevation + actualRise * lowerRunSteps
    const landingCenter = new Vector3(
      request.turnDirection === 'left' ? usableBounds.maxX - clearancePad - landingDepth * 0.5 : usableBounds.minX + clearancePad + landingDepth * 0.5,
      landingElevation + 0.09,
      runStartZ + lowerRunLength + width * 0.5,
    )
    if (request.stairFamily === 'l_stair') {
      landingIds.push(`${request.sourceNodeKey}.landing_mid`)
      intermediateLandingIds.push(`${request.sourceNodeKey}.landing_mid`)
      bottomLandingId = `${request.sourceNodeKey}.landing_mid`
      topLandingId = `${request.sourceNodeKey}.landing_mid`
      solids.push({
        spec: { id: `${request.sourceNodeKey}.landing_mid`, sourceNodeKey: request.sourceNodeKey, kind: 'landing', profileId: null, transform: { position: [landingCenter.x, landingCenter.y, landingCenter.z], rotation: [0, Math.PI * 0.5, 0], scale: [1, 1, 1] }, params: { landingElevation }, metadata: { stairFamily: request.stairFamily } },
        geometry: orientedBoxGeometry(landingDepth, 0.18, width, landingCenter, Math.PI * 0.5),
        color: landingColor,
      })
    }
    const upperStepDepth = upperRunLength / Math.max(upperRunSteps, 1)
    const upperDirection = request.turnDirection === 'left' ? -1 : 1
    for (let index = 0; index < upperRunSteps; index += 1) {
      const topY = landingElevation + actualRise * (index + 1)
      const stepCenter = new Vector3(
        landingCenter.x + upperDirection * (index * upperStepDepth + upperStepDepth * 0.5 + (request.stairFamily === 'l_stair' ? landingDepth * 0.5 : width * 0.25)),
        fromElevation + (topY - fromElevation) * 0.5,
        landingCenter.z,
      )
      solids.push({
        spec: { id: `${request.sourceNodeKey}.upper_${index + 1}`, sourceNodeKey: request.sourceNodeKey, kind: 'stair', profileId: null, transform: { position: [stepCenter.x, stepCenter.y, stepCenter.z], rotation: [0, Math.PI * 0.5, 0], scale: [1, 1, 1] }, params: { stepIndex: lowerRunSteps + index + 1 }, metadata: { stairFamily: request.stairFamily } },
        geometry: orientedBoxGeometry(width, topY - fromElevation, upperStepDepth, stepCenter, Math.PI * 0.5),
        color: baseColor,
      })
    }
    anchors.push(
      createAnchor(request.sourceNodeKey, 'Stair Base', new Vector3(runStartX, fromElevation, runStartZ)),
      createAnchor(request.sourceNodeKey, 'Stair Top', new Vector3(landingCenter.x + upperDirection * (upperRunLength + width * 0.5), targetElevation, landingCenter.z)),
    )
    bottomConnectionPoint = [runStartX, fromElevation, runStartZ]
    topConnectionPoint = [landingCenter.x + upperDirection * (upperRunLength + width * 0.5), targetElevation, landingCenter.z]
  }

  return {
    solids,
    anchors,
    stairId,
    landingIds,
    bottomLandingId,
    topLandingId,
    intermediateLandingIds,
    lowerRunSteps,
    riseCount,
    requiredEnvelope: [requiredWidth, totalRise, requiredDepth] as [number, number, number],
    resolvedEnvelope: [resolvedBounds.maxX - resolvedBounds.minX, totalRise, resolvedBounds.maxZ - resolvedBounds.minZ] as [number, number, number],
    voidBounds,
    bottomConnectionPoint,
    topConnectionPoint,
    diagnostics,
  }
}

function resolveZoneAdjustedStairs(
  graph: AssemblyGraphDefinition,
  profiles: Profile2D[],
  solids: RuntimeSolid[],
  rooms: RoomVolume[],
  levels: LevelSpec[],
  stairRequests: StairLayoutRequest[],
  stairConnectionRequests: StairConnectionRequest[],
  diagnostics: string[],
) {
  const graphNodes = new Map(graph.nodes.map((node) => [node.key, node] as const))
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const roomById = new Map(rooms.map((room) => [room.roomId ?? room.id, room] as const))
  const levelById = new Map(levels.map((level) => [level.id, level] as const))
  const updatedProfiles = [...profiles]
  const updatedRooms = [...rooms]
  let updatedSolids = [...solids]
  const derivedStairs: StairRunSpec[] = []
  const derivedSlabVoids: SlabVoidSpec[] = []
  const derivedAnchors: Anchor[] = []

  for (const request of stairRequests) {
    const zoneRooms = request.zoneRoomIds
      .map((roomId) => roomById.get(roomId))
      .filter((room): room is RoomVolume => Boolean(room))
    const fromLevel = request.fromLevelId ? levelById.get(request.fromLevelId) ?? null : null
    const toLevel = request.toLevelId ? levelById.get(request.toLevelId) ?? null : null
    const sourceNode = graphNodes.get(request.sourceNodeKey)
    const fromZoneRoom = zoneRooms.find((room) => room.levelId === request.fromLevelId) ?? zoneRooms[0] ?? null
    const toZoneRoom = zoneRooms.find((room) => room.levelId === request.toLevelId) ?? zoneRooms[zoneRooms.length - 1] ?? null
    if (!fromZoneRoom || !fromLevel) {
      diagnostics.push(`Stair core "${request.sourceNodeKey}" is missing a valid circulation zone on the source level.`)
      continue
    }
    const fromElevation = fromZoneRoom.floorElevation
    const explicitTargetElevation = request.explicitTargetElevation
    const targetElevation = request.targetElevationMode === 'explicit'
      ? (explicitTargetElevation ?? fromElevation)
      : request.targetElevationMode === 'mezzanine'
        ? (sourceNode && typeof sourceNode.params.targetElevation === 'number' ? numberParam(sourceNode, 'targetElevation', fromElevation + 2.4) : fromElevation + 2.4)
        : (toLevel?.baseElevation ?? toZoneRoom?.floorElevation ?? fromElevation + 3)
    if (targetElevation <= fromElevation + 0.1) {
      diagnostics.push(`Stair core "${request.sourceNodeKey}" has non-ascending targets.`)
      continue
    }
    const bounds = roomProfileBounds(fromZoneRoom, updatedProfiles)
    if (!bounds) {
      diagnostics.push(`Circulation zone for "${request.sourceNodeKey}" must use an axis-aligned rectangular profile.`)
      continue
    }
    const preview = solveStairGeometry(request, bounds, fromElevation, targetElevation)
    const widthDeficit = Math.max(0, preview.requiredEnvelope[0] - (bounds.maxX - bounds.minX))
    const depthDeficit = Math.max(0, preview.requiredEnvelope[2] - (bounds.maxZ - bounds.minZ))
    const zoneNode = graphNodes.get(fromZoneRoom.sourceNodeKey)
    const maxExpandX = zoneNode ? numberParam(zoneNode, 'maxExpandX', 0) : 0
    const maxExpandZ = zoneNode ? numberParam(zoneNode, 'maxExpandZ', 0) : 0
    let fitStatus: StairRunSpec['fitStatus'] = 'fit'
    const resolvedBounds = { ...bounds }
    if (widthDeficit > 1e-4 || depthDeficit > 1e-4) {
      if (request.fitMode === 'strict' || widthDeficit > maxExpandX + 1e-4 || depthDeficit > maxExpandZ + 1e-4) {
        fitStatus = 'overflow'
      } else {
        fitStatus = 'autofit'
        resolvedBounds.minX -= widthDeficit * 0.5
        resolvedBounds.maxX += widthDeficit * 0.5
        resolvedBounds.minZ -= depthDeficit * 0.5
        resolvedBounds.maxZ += depthDeficit * 0.5
      }
    }
    if (fitStatus !== 'overflow') {
      const overlaps = updatedRooms
        .filter((room) => room.sourceNodeKey !== fromZoneRoom.sourceNodeKey && room.levelId === fromZoneRoom.levelId)
        .some((room) => {
          const otherBounds = roomProfileBounds(room, updatedProfiles)
          return otherBounds ? boundsOverlap(resolvedBounds, otherBounds) : false
        })
      if (overlaps) {
        diagnostics.push(`Stair core "${request.sourceNodeKey}" would overlap neighboring rooms; local partition push is not available for this layout yet.`)
        fitStatus = 'invalid'
      }
    }
    if (fitStatus === 'autofit') {
      const profile = profileById.get(fromZoneRoom.profileId ?? '')
      if (profile) {
        const nextProfile = rectProfileFromBounds(profile.id, resolvedBounds, { ...profile.metadata, resolvedBy: request.sourceNodeKey })
        profileById.set(profile.id, nextProfile)
        const profileIndex = updatedProfiles.findIndex((entry) => entry.id === profile.id)
        if (profileIndex >= 0) updatedProfiles[profileIndex] = nextProfile
        updatedSolids = updatedSolids.map((solid) => {
          const roomId = typeof solid.spec.metadata.roomId === 'string' ? solid.spec.metadata.roomId : null
          if (!roomId) return solid
          const room = roomById.get(roomId)
          if (!room || room.sourceNodeKey !== fromZoneRoom.sourceNodeKey || solid.spec.kind !== 'slab') return solid
          return regenerateRoomSlabSolid(solid, nextProfile, room)
        })
      }
    }
    const resolved = solveStairGeometry(request, fitStatus === 'overflow' || fitStatus === 'invalid' ? bounds : resolvedBounds, fromElevation, targetElevation)
    derivedAnchors.push(...resolved.anchors)
    if (fitStatus !== 'overflow' && fitStatus !== 'invalid') {
      updatedSolids.push(...resolved.solids)
      const targetLevelId = request.targetElevationMode === 'level_top' ? request.toLevelId : request.fromLevelId
      const destinationZoneSlabId = request.targetElevationMode === 'level_top'
        && toZoneRoom
        && (request.stairFamily === 'straight' || request.stairFamily === 'mezzanine')
        ? `${toZoneRoom.sourceNodeKey}.${toZoneRoom.levelId}.floor`
        : null
      const resolvedVoidBounds = extendStairVoidToTopConnections(
        resolved.voidBounds,
        resolvedBounds,
        resolved.stairId,
        request.toLevelId,
        stairConnectionRequests,
        roomById,
        updatedProfiles,
      )
      derivedSlabVoids.push({
        id: `${request.sourceNodeKey}.void`,
        sourceNodeKey: request.sourceNodeKey,
        stairId: resolved.stairId,
        hostLevelId: targetLevelId,
        hostSolidId: destinationZoneSlabId,
        voidRole: request.targetElevationMode === 'mezzanine' ? 'mezzanine_connection' : 'stair_run',
        outerLoop: rectLoopFromBounds(`${request.sourceNodeKey}.void.outer`, resolvedVoidBounds),
        bottomElevation: targetElevation - 0.05,
        topElevation: targetElevation + 0.55,
        metadata: { stairFamily: request.stairFamily },
      })
    }
    derivedStairs.push({
      id: resolved.stairId,
      sourceNodeKey: request.sourceNodeKey,
      kind: stairKindFromFamily(request.stairFamily),
      stairFamily: request.stairFamily,
      fromLevelId: request.fromLevelId,
      toLevelId: request.toLevelId,
      shaftId: `${request.sourceNodeKey}.void`,
      zoneId: fromZoneRoom.sourceNodeKey,
      clearanceEnvelope: resolved.resolvedEnvelope,
      landingIds: resolved.landingIds,
      bottomLandingId: resolved.bottomLandingId,
      topLandingId: resolved.topLandingId,
      intermediateLandingIds: resolved.intermediateLandingIds,
      requiredEnvelope: resolved.requiredEnvelope,
      resolvedEnvelope: resolved.resolvedEnvelope,
      fitStatus,
      diagnostics: fitStatus === 'fit' || fitStatus === 'autofit' ? [] : [`Stair "${request.sourceNodeKey}" does not fit its circulation zone.`],
      riseCount: resolved.riseCount,
      metadata: {
        zoneRoomId: fromZoneRoom.roomId,
        topZoneRoomId: toZoneRoom?.roomId ?? null,
        targetElevation,
        bottomConnectionPoint: resolved.bottomConnectionPoint,
        topConnectionPoint: resolved.topConnectionPoint,
        connectionRequestIds: stairConnectionRequests.filter((entry) => entry.stairId === resolved.stairId).map((entry) => entry.id),
      },
    })
  }

  return {
    profiles: updatedProfiles,
    solids: updatedSolids,
    rooms: updatedRooms,
    stairs: derivedStairs,
    slabVoids: derivedSlabVoids,
    anchors: derivedAnchors,
  }
}

function bandColor(kind: unknown, fallback: string) {
  if (kind === 'remainder_lower') return '#5f86c2'
  if (kind === 'remainder_upper') return '#b96a57'
  if (kind === 'fused') return '#d3b36a'
  return fallback
}

function compileShellBandToResult(
  node: AssemblyNodeDefinition,
  band: StructuralShellBandResult,
  index: number,
  color = '#8b7a69',
): RuntimeNodeResult {
  const resolvedColor = bandColor(band.metadata.derivedKind, color)
  const height = Math.max(0.05, band.topElevation - band.baseElevation)
  const outerProfile = runtimeProfileFromLoops(`${node.key}.band_${index + 1}.outer`, band.outer, [], {
    sourceNodeKeys: band.sourceNodeKeys,
    derivedKind: band.metadata.derivedKind,
  })
  const innerHoles = band.inner.length >= 3 ? [band.inner] : []
  const shellProfile = runtimeProfileFromLoops(`${node.key}.band_${index + 1}.shell`, band.outer, innerHoles, {
    sourceNodeKeys: band.sourceNodeKeys,
    derivedKind: band.metadata.derivedKind,
  })
  const wallGeometry = extrudeProfile(shellProfile, height)
  wallGeometry.translate(0, band.baseElevation, 0)

  const shellSolid: RuntimeSolid = {
    spec: {
      id: `${node.key}.band_${index + 1}.shell`,
      sourceNodeKey: node.key,
      kind: 'wall_shell',
      profileId: shellProfile.profile.id,
      transform: { position: [0, band.baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      params: { derivedBandIndex: index + 1 },
      metadata: {
        ...band.metadata,
        sourceNodeKeys: band.sourceNodeKeys,
      },
    },
    geometry: wallGeometry,
    color: resolvedColor,
  }

  const floorSource = band.inner.length >= 3 ? runtimeProfileFromLoops(`${node.key}.band_${index + 1}.floor`, band.inner, [], {}) : outerProfile
  const floorThickness = Number.isFinite(Number(band.metadata.floorThickness)) ? Math.max(0.04, Number(band.metadata.floorThickness)) : 0.18
  const floorSolid = band.floorAtBase
    ? {
        spec: {
          id: `${node.key}.band_${index + 1}.floor`,
          sourceNodeKey: node.key,
          kind: 'slab',
          profileId: floorSource.profile.id,
          transform: { position: [0, band.baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          params: { thickness: floorThickness, derivedBandIndex: index + 1 },
          metadata: {
            ...band.metadata,
            sourceNodeKeys: band.sourceNodeKeys,
          },
        },
        geometry: extrudeProfile(floorSource, floorThickness).translate(0, band.baseElevation, 0),
        color: bandColor(band.metadata.derivedKind, '#596979'),
      } satisfies RuntimeSolid
    : null
  const ceilingAtTop = Boolean(band.metadata.ceilingAtTop)
  const ceilingThickness = Number.isFinite(Number(band.metadata.ceilingThickness)) ? Math.max(0.04, Number(band.metadata.ceilingThickness)) : 0.18
  const ceilingSource = band.inner.length >= 3 ? runtimeProfileFromLoops(`${node.key}.band_${index + 1}.ceiling`, band.inner, [], {}) : outerProfile
  const ceilingSolid = ceilingAtTop
    ? {
        spec: {
          id: `${node.key}.band_${index + 1}.ceiling`,
          sourceNodeKey: node.key,
          kind: 'slab',
          profileId: ceilingSource.profile.id,
          transform: { position: [0, band.topElevation - ceilingThickness, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          params: { thickness: ceilingThickness, derivedBandIndex: index + 1 },
          metadata: {
            ...band.metadata,
            sourceNodeKeys: band.sourceNodeKeys,
            bridgePiece: 'ceiling',
            derivedKind: 'bridge_ceiling',
          },
        },
        geometry: extrudeProfile(ceilingSource, ceilingThickness).translate(0, band.topElevation - ceilingThickness, 0),
        color: '#7a8274',
      } satisfies RuntimeSolid
    : null

  const center = profileCenter(outerProfile)
  const bounds = new Box3()
  for (const point of outerProfile.outer) bounds.expandByPoint(new Vector3(point.x, 0, point.y))
  const size = bounds.getSize(new Vector3())
  const anchors: Anchor[] = [
    createAnchor(node.key, `Band ${index + 1} Center`, new Vector3(center.x, band.baseElevation, center.y)),
    createAnchor(node.key, `Band ${index + 1} Roof Ridge`, new Vector3(center.x, band.topElevation, center.y)),
    createAnchor(node.key, `Band ${index + 1} East Entry`, new Vector3(center.x + size.x * 0.5, band.baseElevation, center.y)),
    createAnchor(node.key, `Band ${index + 1} West Entry`, new Vector3(center.x - size.x * 0.5, band.baseElevation, center.y)),
    createAnchor(node.key, `Band ${index + 1} North Entry`, new Vector3(center.x, band.baseElevation, center.y - size.z * 0.5)),
    createAnchor(node.key, `Band ${index + 1} South Entry`, new Vector3(center.x, band.baseElevation, center.y + size.z * 0.5)),
  ]

  const wallRunId = `${node.key}.band_${index + 1}.wall_run`
  return {
    profiles: [shellProfile],
    solids: [shellSolid, ...(floorSolid ? [floorSolid] : []), ...(ceilingSolid ? [ceilingSolid] : [])],
    solidOutputs: {
      solid: [shellSolid, ...(floorSolid ? [floorSolid] : []), ...(ceilingSolid ? [ceilingSolid] : [])],
      shell: [shellSolid],
      ...(floorSolid ? { floor: [floorSolid] } : {}),
      ...(ceilingSolid ? { ceiling: [ceilingSolid] } : {}),
    },
    structuralShells: [{
      id: `${node.key}.band_${index + 1}.structural_shell`,
      sourceNodeKey: node.key,
      outer: band.outer.map((point) => point.clone()),
      inner: band.inner.map((point) => point.clone()),
      baseElevation: band.baseElevation,
      topElevation: band.topElevation,
      floorAtBase: band.floorAtBase,
      shapeKind: 'polygon',
      metadata: {
        ...band.metadata,
        sourceNodeKeys: band.sourceNodeKeys,
        floorThickness,
      },
    }],
    wallRuns: [{
      id: wallRunId,
      sourceNodeKey: node.key,
      profileId: shellProfile.profile.id,
      levelId: null,
      height,
      thickness: Math.max(0.05, Number(band.metadata.wallThickness) || 0.22),
      metadata: {
        ...band.metadata,
        sourceNodeKeys: band.sourceNodeKeys,
      },
    }],
    wallFaces: wallFacesFromProfile(node, outerProfile, height, band.baseElevation, wallRunId),
    anchors,
    rooms: [{
      id: `${node.key}.band_${index + 1}.room`,
      sourceNodeKey: node.key,
      roomId: `${node.key}.band_${index + 1}.room`,
      levelId: null,
      parentStructureId: null,
      name: `${node.title} Band ${index + 1}`,
      profileId: floorSource.profile.id,
      floorElevation: band.baseElevation,
      ceilingElevation: band.topElevation,
      adjacencyTags: [],
      topologyOwned: false,
      movablePartition: false,
      zoneOwned: false,
      circulationOwned: false,
      metadata: {
        ...band.metadata,
        sourceNodeKeys: band.sourceNodeKeys,
      },
    }],
  }
}

function mergeNodeResults(target: RuntimeNodeResult, source: RuntimeNodeResult) {
  target.profiles = [...(target.profiles ?? []), ...(source.profiles ?? [])]
  target.paths = [...(target.paths ?? []), ...(source.paths ?? [])]
  target.solids = [...(target.solids ?? []), ...(source.solids ?? [])]
  target.surfaces = [...(target.surfaces ?? []), ...(source.surfaces ?? [])]
  target.structuralShells = [...(target.structuralShells ?? []), ...(source.structuralShells ?? [])]
  target.structureFootprints = [...(target.structureFootprints ?? []), ...(source.structureFootprints ?? [])]
  target.shellBands = [...(target.shellBands ?? []), ...(source.shellBands ?? [])]
  target.structuralFusions = [...(target.structuralFusions ?? []), ...(source.structuralFusions ?? [])]
  target.levels = [...(target.levels ?? []), ...(source.levels ?? [])]
  target.wallRuns = [...(target.wallRuns ?? []), ...(source.wallRuns ?? [])]
  target.wallFaces = [...(target.wallFaces ?? []), ...(source.wallFaces ?? [])]
  target.anchors = [...(target.anchors ?? []), ...(source.anchors ?? [])]
  target.connectors = [...(target.connectors ?? []), ...(source.connectors ?? [])]
  target.openings = [...(target.openings ?? []), ...(source.openings ?? [])]
  target.windows = [...(target.windows ?? []), ...(source.windows ?? [])]
  target.rooms = [...(target.rooms ?? []), ...(source.rooms ?? [])]
  target.roofs = [...(target.roofs ?? []), ...(source.roofs ?? [])]
  target.bridges = [...(target.bridges ?? []), ...(source.bridges ?? [])]
  target.stairs = [...(target.stairs ?? []), ...(source.stairs ?? [])]
  target.slabVoids = [...(target.slabVoids ?? []), ...(source.slabVoids ?? [])]
  target.pathSpecs = [...(target.pathSpecs ?? []), ...(source.pathSpecs ?? [])]
  target.arrayPlacements = [...(target.arrayPlacements ?? []), ...(source.arrayPlacements ?? [])]
  target.interiorDoorRequests = [...(target.interiorDoorRequests ?? []), ...(source.interiorDoorRequests ?? [])]
  target.wallSegmentOpeningRequests = [...(target.wallSegmentOpeningRequests ?? []), ...(source.wallSegmentOpeningRequests ?? [])]
  target.stairLayoutRequests = [...(target.stairLayoutRequests ?? []), ...(source.stairLayoutRequests ?? [])]
  target.stairConnectionRequests = [...(target.stairConnectionRequests ?? []), ...(source.stairConnectionRequests ?? [])]
  if (source.solidOutputs) {
    const nextOutputs: Record<string, RuntimeSolid[]> = { ...(target.solidOutputs ?? {}) }
    for (const [outputKey, solids] of Object.entries(source.solidOutputs)) {
      nextOutputs[outputKey] = [...(nextOutputs[outputKey] ?? []), ...solids]
    }
    target.solidOutputs = nextOutputs
  }
}

function preferOutputCollection<T>(primary: T[] | undefined, fallback: T[]) {
  return Array.isArray(primary) && primary.length > 0 ? primary : fallback
}

function compileRoomLikeNode(
  node: AssemblyNodeDefinition,
  profile: RuntimeProfile,
  levels: Array<LevelSpec | null>,
  options: {
    topologyOwned: boolean
    roomRole: 'room' | 'circulation_zone'
    movablePartition: boolean
    zoneOwned: boolean
    circulationOwned: boolean
    wallThickness: number
    floorThickness: number
    wallHeight: number
  },
) {
  const result: RuntimeNodeResult = {
    solids: [],
    solidOutputs: { solid: [], shell: [], floor: [] },
    structuralShells: [],
    structureFootprints: [],
    shellBands: [],
    anchors: [],
    wallRuns: [],
    wallFaces: [],
    rooms: [],
  }

  for (const [levelIndex, level] of levels.entries()) {
    const baseElevation = level?.baseElevation ?? level?.elevation ?? 0
    const suffix = levels.length > 1 ? `.${level?.id ?? levelIndex + 1}` : ''
    const roomId = `${node.key}${suffix}.room`
    const floorId = levels.length > 1 ? `${node.key}${suffix}.floor` : `${node.key}.floor`
    const wallRunId = levels.length > 1 ? `${node.key}${suffix}.wall_run` : `${node.key}.wall_run`
    const topologyOwned = options.topologyOwned

    const wallGeometry = topologyOwned
      ? null
      : (() => {
          const outerGeometry = extrudeProfile(profile, options.wallHeight)
          outerGeometry.translate(0, baseElevation, 0)
          const inset = insetProfile(profile, options.wallThickness)
          const innerGeometry = extrudeProfile(inset, options.wallHeight + 0.02)
          innerGeometry.translate(0, baseElevation, 0)
          return booleanCombine(
            {
              spec: {
                id: `${node.key}${suffix}.outer`,
                sourceNodeKey: node.key,
                kind: 'wall_shell',
                profileId: profile.profile.id,
                transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                params: {},
                metadata: { wallSystem: 'legacy_shell' },
              },
              geometry: outerGeometry,
              color: '#7f92a6',
            },
            {
              spec: {
                id: `${node.key}${suffix}.inner`,
                sourceNodeKey: node.key,
                kind: 'wall_shell',
                profileId: inset.profile.id,
                transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                params: {},
                metadata: { wallSystem: 'legacy_shell' },
              },
              geometry: innerGeometry,
              color: '#7f92a6',
            },
            SUBTRACTION,
            node,
            [],
          )
        })()

    const floorGeometry = extrudeProfile(profile, options.floorThickness)
    floorGeometry.translate(0, baseElevation, 0)
    const floorSolid: RuntimeSolid = {
      spec: {
        id: floorId,
        sourceNodeKey: node.key,
        kind: 'slab',
        profileId: profile.profile.id,
        transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        params: { thickness: options.floorThickness },
        metadata: {
          levelId: level?.id ?? null,
          roomId,
          structureId: typeof node.metadata.blueprintElementId === 'string' ? node.metadata.blueprintElementId : null,
          topologyOwned,
          roomRole: options.roomRole,
          movablePartition: options.movablePartition,
          zoneOwned: options.zoneOwned,
          circulationOwned: options.circulationOwned,
        },
      },
      geometry: floorGeometry,
      color: '#596979',
    }

    const solids = [
      ...(wallGeometry ? [wallGeometry] : []),
      floorSolid,
    ]
    result.solids?.push(...solids)
    result.solidOutputs?.solid.push(...solids)
    result.solidOutputs?.floor.push(floorSolid)
    if (wallGeometry) result.solidOutputs?.shell.push(wallGeometry)

    if (!topologyOwned) {
      result.structuralShells?.push(createStructuralShellFromProfile(
        node,
        profile,
        options.wallThickness,
        options.floorThickness,
        baseElevation,
        baseElevation + options.wallHeight,
        true,
      ))
    }

    result.structureFootprints?.push({
      id: `${node.key}${suffix}.footprint`,
      sourceNodeKey: node.key,
      shapeKind: 'polygon',
      outerLoop: {
        id: `${node.key}${suffix}.footprint.outer`,
        closed: true,
        kind: 'outer',
        segments: pointsToSegments(profile.outer),
      },
      innerLoops: [],
      metadata: {
        baseElevation,
        topElevation: baseElevation + options.wallHeight,
        topologyOwned,
        roomRole: options.roomRole,
      },
    })

    const box = new Box3()
    for (const point of profile.outer) box.expandByPoint(new Vector3(point.x, 0, point.y))
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    result.anchors?.push(
      createAnchor(node.key, levels.length > 1 ? `${level?.label ?? `Level ${levelIndex + 1}`} Entry` : 'Entry', new Vector3(center.x + size.x * 0.5, baseElevation, center.z)),
      createAnchor(node.key, levels.length > 1 ? `${level?.label ?? `Level ${levelIndex + 1}`} Center` : 'Center', new Vector3(center.x, baseElevation, center.z)),
      createAnchor(node.key, levels.length > 1 ? `${level?.label ?? `Level ${levelIndex + 1}`} Roof Ridge` : 'Roof Ridge', new Vector3(center.x, baseElevation + options.wallHeight, center.z)),
    )
    result.wallRuns?.push({
      id: wallRunId,
      sourceNodeKey: node.key,
      profileId: profile.profile.id,
      levelId: level?.id ?? null,
      height: options.wallHeight,
      thickness: options.wallThickness,
      metadata: {
        topologyOwned,
        wallSystem: topologyOwned ? 'topology' : 'legacy_shell',
        roomRole: options.roomRole,
      },
    })
    result.wallFaces?.push(...wallFacesFromProfile(node, profile, options.wallHeight, baseElevation, wallRunId).map((face) => ({
      ...face,
      levelId: level?.id ?? null,
      wallRole: 'exterior' as const,
      ownerRoomIds: [roomId],
      metadata: {
        ...face.metadata,
        levelId: level?.id ?? null,
        wallRole: 'exterior' as const,
        topologyOwned,
        wallSystem: topologyOwned ? 'topology' : 'legacy_shell',
        roomId,
        wallThickness: options.wallThickness,
        profileId: profile.profile.id,
        movablePartition: options.movablePartition,
        zoneOwned: options.zoneOwned,
        circulationOwned: options.circulationOwned,
      },
    })))
    result.rooms?.push({
      id: roomId,
      sourceNodeKey: node.key,
      roomId,
      levelId: level?.id ?? null,
      parentStructureId: typeof node.metadata.blueprintElementId === 'string' ? node.metadata.blueprintElementId : null,
      name: stringParam(node, 'roomName', node.title),
      profileId: profile.profile.id,
      floorElevation: baseElevation,
      ceilingElevation: baseElevation + options.wallHeight,
      adjacencyTags: [],
      topologyOwned,
      movablePartition: options.movablePartition,
      zoneOwned: options.zoneOwned,
      circulationOwned: options.circulationOwned,
      metadata: {
        wallThickness: options.wallThickness,
        floorThickness: options.floorThickness,
        levelIndex: level?.index ?? levelIndex + 1,
        topologyOwned,
        roomRole: options.roomRole,
        movablePartition: options.movablePartition,
        zoneOwned: options.zoneOwned,
        circulationOwned: options.circulationOwned,
      },
    })
  }

  return result
}

function firstStructuralShell(shells: StructuralShellInput[]) {
  return shells[0] ?? null
}

function recommendedBridgeOverlap(
  width: number,
  wallThickness: number,
  requestedOverlap: number,
  hosts: StructuralShellInput[],
) {
  const roundHost = hosts.some((host) => host.shapeKind === 'round')
  const baseMinimum = Math.max(requestedOverlap, wallThickness * 2, width * 0.22, 0.55)
  if (!roundHost) return baseMinimum
  return Math.max(
    baseMinimum,
    width * 0.4,
    wallThickness * 3,
    1.1,
  )
}

function createBridgeShellInput(
  node: AssemblyNodeDefinition,
  start: Vector3,
  end: Vector3,
  width: number,
  wallHeight: number,
  wallThickness: number,
  elevation: number,
  overlap: number,
  floorThickness: number,
): StructuralShellInput {
  const span = new Vector3().subVectors(end, start)
  const length = Math.max(span.length(), 0.001)
  const axis = span.normalize()
  const side = new Vector3(-axis.z, 0, axis.x).normalize()
  const halfLength = length * 0.5 + overlap
  const halfWidth = width * 0.5
  const innerHalfLength = Math.max(0.08, halfLength - wallThickness)
  const innerHalfWidth = Math.max(0.08, halfWidth - wallThickness)
  const center = start.clone().add(end).multiplyScalar(0.5)

  const point = (along: number, across: number) => new Vector2(
    center.x + axis.x * along + side.x * across,
    center.z + axis.z * along + side.z * across,
  )

  return {
    id: `${node.key}.structural_shell`,
    sourceNodeKey: node.key,
    outer: [
      point(-halfLength, -halfWidth),
      point(halfLength, -halfWidth),
      point(halfLength, halfWidth),
      point(-halfLength, halfWidth),
    ],
    inner: [
      point(-innerHalfLength, -innerHalfWidth),
      point(innerHalfLength, -innerHalfWidth),
      point(innerHalfLength, innerHalfWidth),
      point(-innerHalfLength, innerHalfWidth),
    ],
    baseElevation: elevation,
    topElevation: elevation + wallHeight,
    floorAtBase: true,
    shapeKind: 'polygon',
    metadata: {
      nodeKind: node.kind,
      width,
      wallHeight,
      wallThickness,
      floorThickness,
      overlap,
    },
  }
}

function applyStructuralFusion(
  node: AssemblyNodeDefinition,
  fusionId: string,
  shells: StructuralShellInput[],
  result: RuntimeNodeResult,
  diagnostics: string[],
  color = '#8b7a69',
  decorateBand?: (band: StructuralShellBandResult) => StructuralShellBandResult,
) {
  const fusion = resolveStructuralUnion(shells, fusionId)
  if (!fusion) return false

  result.structureFootprints = [...(result.structureFootprints ?? []), ...fusion.footprints]
  result.shellBands = [...(result.shellBands ?? []), ...fusion.shellBands]
  result.structuralFusions = [...(result.structuralFusions ?? []), ...fusion.fusions]
  result.structuralShells = []

  fusion.bands.forEach((band, index) => {
    const nextBand = decorateBand ? decorateBand(band) : band
    mergeNodeResults(result, compileShellBandToResult(node, nextBand, index, color))
  })

  diagnostics.push(...fusion.diagnostics)
  return true
}

function dependencyHash(node: AssemblyNodeDefinition, graph: AssemblyGraphDefinition, results: Map<string, RuntimeNodeResult>) {
  const incoming = incomingEdges(graph, node.key)
    .map((edge) => `${edgeHash(edge)}:${JSON.stringify(results.get(edge.source.nodeKey) ?? {})}`)
    .join('|')
  return JSON.stringify({ kind: node.kind, params: node.params, incoming })
}

export function createAssemblyCompileCache(): AssemblyCompileCache {
  return {
    dependencyHashes: new Map(),
    nodeResults: new Map(),
  }
}

export function compileAssemblyGraph(
  graphInput: AssemblyGraphDefinition,
  existingCache: AssemblyCompileCache = createAssemblyCompileCache(),
): AssemblyCompileResult {
  const graph = migrateAssemblyGraph(graphInput)
  const diagnostics: string[] = []
  const orderedNodes = topologicalNodes(graph)
  const nextCache: AssemblyCompileCache = createAssemblyCompileCache()

  for (const node of orderedNodes) {
    const hash = dependencyHash(node, graph, nextCache.nodeResults)
    if (existingCache.dependencyHashes.get(node.key) === hash) {
      const cached = existingCache.nodeResults.get(node.key)
      if (cached) {
        nextCache.dependencyHashes.set(node.key, hash)
        nextCache.nodeResults.set(node.key, cached)
        continue
      }
    }

    const result: RuntimeNodeResult = {}

    switch (node.kind) {
      case 'rectangle':
        result.profiles = [createRectangleProfile(node)]
        break
      case 'regular_polygon':
        result.profiles = [createRegularPolygonProfile(node, 8)]
        break
      case 'hexagon':
        result.profiles = [createRegularPolygonProfile(node, 6)]
        break
      case 'trapezoid':
        result.profiles = [createTrapezoidProfile(node)]
        break
      case 'polygon':
        result.profiles = [createPolygonProfile(node)]
        break
      case 'line_loop':
        result.profiles = [createLineLoopProfile(node)]
        break
      case 'arc_loop':
        result.profiles = [createArcLoopProfile(node)]
        break
      case 'mixed_loop':
        result.profiles = [createMixedLoopProfile(node)]
        break
      case 'polyline':
      case 'spline':
        result.paths = [createPathFromPoints(pointsParam(node))]
        result.pathSpecs = [{
          id: `${node.key}.path`,
          sourceNodeKey: node.key,
          kind: node.kind === 'spline' ? 'spline' : 'polyline',
          pointCount: pointsParam(node).length,
          closed: false,
          metadata: {},
        }]
        break
      case 'arc': {
        const radius = numberParam(node, 'radius', 4)
        const startAngle = numberParam(node, 'startAngle', 0)
        const endAngle = numberParam(node, 'endAngle', 180)
        const curve = new ArcCurve(0, 0, radius, (startAngle * Math.PI) / 180, (endAngle * Math.PI) / 180, false)
        result.paths = [{ points: curve.getPoints(32).map((point) => new Vector3(point.x, 0, point.y)) }]
        result.pathSpecs = [{
          id: `${node.key}.path`,
          sourceNodeKey: node.key,
          kind: 'arc',
          pointCount: 33,
          closed: false,
          metadata: { radius, startAngle, endAngle },
        }]
        break
      }
      case 'profile_from_path':
      case 'close_loop': {
        const path = collectIncomingPaths(graph, node, nextCache.nodeResults)[0]
        if (path) {
          const outer = path.points.map((point) => new Vector2(point.x, point.z))
          result.profiles = [{
            profile: {
              id: `${node.key}.profile`,
              loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
              metadata: { source: path.points.length },
            },
            outer,
            holes: [],
          }]
        }
        break
      }
      case 'offset_profile': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (profile) result.profiles = [insetProfile(profile, numberParam(node, 'offset', 0.4))]
        break
      }
      case 'profile_merge':
      case 'profile_holes':
      case 'hole_loop': {
        const profiles =
          node.kind === 'profile_merge' || node.kind === 'profile_holes'
            ? incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.profiles ?? [])
            : collectIncomingProfiles(graph, node, nextCache.nodeResults)
        const outer = profiles[0]
        const hole = profiles[1]
        if (outer) {
          result.profiles = [{
            profile: {
              id: `${node.key}.profile`,
              loops: [
                ...outer.profile.loops,
                ...(hole ? [{ id: `${node.key}.hole`, closed: true, kind: 'hole' as const, segments: pointsToSegments(hole.outer) }] : []),
              ],
              metadata: {},
            },
            outer: outer.outer,
            holes: hole ? [...outer.holes, hole.outer] : outer.holes,
          }]
        }
        break
      }
      case 'profile_split': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (profile) result.profiles = [profile, profile]
        break
      }
      case 'footprint':
        result.profiles = collectIncomingProfiles(graph, node, nextCache.nodeResults).map((profile): RuntimeProfile => ({
          profile: {
            ...profile.profile,
            id: `${node.key}.profile`,
            loops: profile.profile.loops.map((loop) => ({
              ...loop,
              kind: loop.kind,
            })),
          },
          outer: profile.outer,
          holes: profile.holes,
        }))
        break
      case 'path_profile': {
        const path = collectIncomingPaths(graph, node, nextCache.nodeResults)[0]
        if (!path || path.points.length < 2) break
        const width = numberParam(node, 'width', 1.4)
        const start = path.points[0]
        const end = path.points[path.points.length - 1]
        const direction = new Vector3().subVectors(end, start).normalize()
        const normal = new Vector3(-direction.z, 0, direction.x).multiplyScalar(width * 0.5)
        const outer = [
          new Vector2(start.x + normal.x, start.z + normal.z),
          new Vector2(end.x + normal.x, end.z + normal.z),
          new Vector2(end.x - normal.x, end.z - normal.z),
          new Vector2(start.x - normal.x, start.z - normal.z),
        ]
        result.profiles = [{
          profile: {
            id: `${node.key}.profile`,
            loops: [{ id: `${node.key}.outer`, closed: true, kind: 'outer', segments: pointsToSegments(outer) }],
            metadata: { sourcePath: node.key },
          },
          outer,
          holes: [],
        }]
        break
      }
      case 'building_level': {
        const elevation = numberParam(node, 'elevation', 0)
        const height = numberParam(node, 'height', 3)
        result.levels = [{
          id: `${node.key}.level`,
          sourceNodeKey: node.key,
          levelId: `${node.key}.level`,
          index: 1,
          label: stringParam(node, 'label', node.title),
          baseElevation: elevation,
          topElevation: elevation + height,
          elevation,
          height,
          metadata: {},
        }]
        result.anchors = [createAnchor(node.key, 'Level Center', new Vector3(0, elevation, 0))]
        break
      }
      case 'level_stack': {
        const count = Math.max(1, Math.round(numberParam(node, 'count', 3)))
        const baseElevation = numberParam(node, 'baseElevation', 0)
        const levelHeight = numberParam(node, 'levelHeight', 3)
        result.levels = Array.from({ length: count }, (_, index) => ({
          id: `${node.key}.level_${index + 1}`,
          sourceNodeKey: node.key,
          levelId: `${node.key}.level_${index + 1}`,
          index: index + 1,
          label: `Level ${index + 1}`,
          baseElevation: baseElevation + index * levelHeight,
          topElevation: baseElevation + (index + 1) * levelHeight,
          elevation: baseElevation + index * levelHeight,
          height: levelHeight,
          metadata: { index: index + 1 },
        }))
        result.anchors = result.levels.map((level, index) => createAnchor(node.key, `Level ${index + 1}`, new Vector3(0, level.elevation, 0)))
        break
      }
      case 'storey_stack': {
        const count = Math.max(1, Math.round(numberParam(node, 'count', 2)))
        const baseElevation = numberParam(node, 'baseElevation', 0)
        const levelHeight = numberParam(node, 'levelHeight', 3.2)
        const slabThickness = numberParam(node, 'slabThickness', 0.18)
        const labelPrefix = stringParam(node, 'labelPrefix', 'Level')
        result.levels = Array.from({ length: count }, (_, index) => {
          const elevation = baseElevation + index * levelHeight
          return {
            id: `${node.key}.level_${index + 1}`,
            sourceNodeKey: node.key,
            levelId: `${node.key}.level_${index + 1}`,
            index: index + 1,
            label: `${labelPrefix} ${index + 1}`,
            baseElevation: elevation,
            topElevation: elevation + levelHeight,
            elevation,
            height: levelHeight,
            metadata: { index: index + 1, slabThickness },
          }
        })
        result.anchors = result.levels.map((level) => createAnchor(node.key, level.label, new Vector3(0, level.baseElevation, 0)))
        break
      }
      case 'box': {
        const width = numberParam(node, 'width', 4)
        const height = numberParam(node, 'height', 3)
        const depth = numberParam(node, 'depth', 4)
        result.solids = [{
          spec: {
            id: `${node.key}.solid`,
            sourceNodeKey: node.key,
            kind: 'box',
            profileId: null,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { width, height, depth },
            metadata: {},
          },
          geometry: new BoxGeometry(width, height, depth).translate(0, height / 2, 0),
          color: '#8da3b8',
        }]
        break
      }
      case 'cylinder': {
        const radiusTop = numberParam(node, 'radiusTop', numberParam(node, 'radius', 2))
        const radiusBottom = numberParam(node, 'radiusBottom', numberParam(node, 'radius', 2))
        const height = numberParam(node, 'height', 6)
        const radialSegments = Math.max(12, Math.round(numberParam(node, 'radialSegments', 24)))
        result.solids = [{
          spec: {
            id: `${node.key}.solid`,
            sourceNodeKey: node.key,
            kind: 'cylinder',
            profileId: null,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { radiusTop, radiusBottom, height, radialSegments },
            metadata: {},
          },
          geometry: new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments).translate(0, height / 2, 0),
          color: '#7795b4',
        }]
        break
      }
      case 'prism':
      case 'tapered_prism':
      case 'slab': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (profile) {
          const height = node.kind === 'slab' ? numberParam(node, 'thickness', 0.25) : numberParam(node, 'height', 4)
          const geometry = extrudeProfile(profile, height)
          if (node.kind === 'tapered_prism') {
            const topScale = numberParam(node, 'topScale', 0.7)
            const position = geometry.getAttribute('position')
            for (let index = 0; index < position.count; index += 1) {
              const y = position.getY(index)
              if (y > height * 0.5) {
                position.setX(index, position.getX(index) * topScale)
                position.setZ(index, position.getZ(index) * topScale)
              }
            }
            geometry.computeVertexNormals()
          }
          result.solids = [{
            spec: {
              id: `${node.key}.solid`,
              sourceNodeKey: node.key,
              kind: node.kind,
              profileId: profile.profile.id,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: { height },
              metadata: {},
            },
            geometry,
            color: '#9eaec4',
          }]
        }
        break
      }
      default:
        break
    }

    nextCache.dependencyHashes.set(node.key, hash)
    nextCache.nodeResults.set(node.key, result)
  }

  for (const node of orderedNodes) {
    const result = nextCache.nodeResults.get(node.key)
    if (!result) continue

    switch (node.kind) {
      case 'wall_run':
      case 'wall_shell': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const availableLevels = collectIncomingLevels(graph, node, nextCache.nodeResults)
        const level = availableLevels[0]
        const baseElevation = level?.baseElevation ?? level?.elevation ?? 0
        const wallHeight = numberParam(node, 'height', level?.height ?? 3)
        const wallThickness = numberParam(node, 'wallThickness', numberParam(node, 'thickness', 0.2))
        const outerGeometry = extrudeProfile(profile, wallHeight)
        outerGeometry.translate(0, baseElevation, 0)
        const inset = insetProfile(profile, wallThickness)
        const innerGeometry = extrudeProfile(inset, wallHeight + 0.02)
        innerGeometry.translate(0, baseElevation, 0)
        const wallGeometry = booleanCombine(
          {
            spec: {
              id: `${node.key}.outer`,
              sourceNodeKey: node.key,
              kind: 'wall_shell',
              profileId: profile.profile.id,
              transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: {},
              metadata: { wallSystem: 'legacy_shell' },
            },
            geometry: outerGeometry,
            color: '#7f92a6',
          },
          {
            spec: {
              id: `${node.key}.inner`,
              sourceNodeKey: node.key,
              kind: 'wall_shell',
              profileId: inset.profile.id,
              transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: {},
              metadata: { wallSystem: 'legacy_shell' },
            },
            geometry: innerGeometry,
            color: '#7f92a6',
          },
          SUBTRACTION,
          node,
          diagnostics,
        )
        result.solids = wallGeometry ? [wallGeometry] : []
        result.solidOutputs = { solid: result.solids, shell: wallGeometry ? [wallGeometry] : [] }
        result.structuralShells = wallGeometry ? [createStructuralShellFromProfile(
          node,
          profile,
          wallThickness,
          0,
          baseElevation,
          baseElevation + wallHeight,
          false,
        )] : []
        result.structureFootprints = (result.structuralShells ?? []).map((shell) => ({
          id: `${node.key}.footprint`,
          sourceNodeKey: node.key,
          shapeKind: shell.shapeKind,
          outerLoop: {
            id: `${node.key}.footprint.outer`,
            closed: true,
            kind: 'outer',
            segments: pointsToSegments(shell.outer),
          },
          innerLoops: shell.inner.length >= 3
            ? [{
                id: `${node.key}.footprint.inner`,
                closed: true,
                kind: 'hole',
                segments: pointsToSegments(shell.inner),
              }]
            : [],
          metadata: {
            baseElevation,
            topElevation: baseElevation + wallHeight,
          },
        }))
        const box = new Box3()
        for (const point of profile.outer) box.expandByPoint(new Vector3(point.x, 0, point.y))
        const size = box.getSize(new Vector3())
        const center = box.getCenter(new Vector3())
        result.anchors = [
          createAnchor(node.key, 'Entry', new Vector3(center.x + size.x * 0.5, baseElevation, center.z)),
          createAnchor(node.key, 'East Entry', new Vector3(center.x + size.x * 0.5, baseElevation, center.z)),
          createAnchor(node.key, 'West Entry', new Vector3(center.x - size.x * 0.5, baseElevation, center.z)),
          createAnchor(node.key, 'North Entry', new Vector3(center.x, baseElevation, center.z - size.z * 0.5)),
          createAnchor(node.key, 'South Entry', new Vector3(center.x, baseElevation, center.z + size.z * 0.5)),
          createAnchor(node.key, 'Center', new Vector3(center.x, baseElevation, center.z)),
          createAnchor(node.key, 'Roof Ridge', new Vector3(center.x, baseElevation + wallHeight, center.z)),
        ]
        result.wallRuns = [{
          id: `${node.key}.wall_run`,
          sourceNodeKey: node.key,
          profileId: profile.profile.id,
          levelId: level?.id ?? null,
          height: wallHeight,
          thickness: wallThickness,
          metadata: {
            topologyOwned: false,
            wallSystem: 'legacy_shell',
          },
        }]
        result.wallFaces = wallFacesFromProfile(node, profile, wallHeight, baseElevation, `${node.key}.wall_run`).map((face) => ({
          ...face,
          levelId: level?.id ?? null,
          wallRole: 'exterior',
          ownerRoomIds: [],
          metadata: {
            ...face.metadata,
            levelId: level?.id ?? null,
            wallRole: 'exterior',
            topologyOwned: false,
            wallSystem: 'legacy_shell',
            wallThickness,
            profileId: profile.profile.id,
          },
        }))
        result.rooms = []
        break
      }
      case 'room':
      case 'room_shell':
      case 'room_on_level':
      case 'circulation_zone': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const availableLevels = collectIncomingLevels(graph, node, nextCache.nodeResults)
        const selectedLevel = selectLevelForNode(node, availableLevels, 'levelIndex', 1)
        const topLevelIndex = Math.max(
          Math.round(numberParam(node, 'toLevelIndex', numberParam(node, 'levelIndex', 1))),
          Math.round(numberParam(node, 'levelIndex', 1)),
        )
        const resolvedLevels = node.kind === 'circulation_zone'
          ? availableLevels.filter((entry) => (entry.index ?? 1) >= Math.round(numberParam(node, 'levelIndex', 1)) && (entry.index ?? 1) <= topLevelIndex)
          : [selectedLevel]
        if (resolvedLevels.length === 0) break
        const wallHeight = numberParam(node, 'height', selectedLevel?.height ?? resolvedLevels[0]?.height ?? 3)
        const compiled = compileRoomLikeNode(
          node,
          profile,
          resolvedLevels,
          {
            topologyOwned: node.kind === 'circulation_zone' ? true : isTopologyOwnedRoomNode(node),
            roomRole: node.kind === 'circulation_zone' ? 'circulation_zone' : 'room',
            movablePartition: booleanParam(node, 'movablePartition', node.kind === 'circulation_zone'),
            zoneOwned: node.kind === 'circulation_zone',
            circulationOwned: node.kind === 'circulation_zone',
            wallThickness: numberParam(node, 'wallThickness', numberParam(node, 'thickness', 0.2)),
            floorThickness: numberParam(node, 'floorThickness', 0.18),
            wallHeight,
          },
        )
        mergeNodeResults(result, compiled)
        break
      }
      case 'floor_plate':
      case 'floor_fill':
      case 'floor_slab':
      case 'ceiling_slab':
      case 'ceiling_fill':
      case 'mezzanine':
      case 'mezzanine_ring': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const thickness = numberParam(node, 'thickness', 0.18)
        const availableLevels = collectIncomingLevels(graph, node, nextCache.nodeResults)
        const selectedLevel = (node.kind === 'floor_slab' || node.kind === 'ceiling_slab')
          ? selectLevelForNode(node, availableLevels, 'levelIndex', 1)
          : null
        const elevation = node.kind === 'floor_slab'
          ? selectedLevel?.baseElevation ?? 0
          : node.kind === 'ceiling_slab'
            ? (selectedLevel?.topElevation ?? selectedLevel?.elevation ?? 3) - thickness
            : numberParam(node, 'elevation', node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 1.5 : node.kind === 'ceiling_fill' ? 3 : 0)
        const geometry = extrudeProfile(profile, thickness)
        geometry.translate(0, elevation, 0)
        if (node.kind === 'floor_slab' || node.kind === 'ceiling_slab') {
          result.solids = [{
            spec: {
              id: `${node.key}.solid`,
              sourceNodeKey: node.key,
              kind: 'slab',
              profileId: profile.profile.id,
              transform: { position: [0, elevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: { thickness },
              metadata: {
                levelId: selectedLevel?.id ?? null,
                slabRole: node.kind === 'floor_slab' ? 'floor' : 'ceiling',
              },
            },
            geometry: geometry.clone(),
            color: '#687788',
          }]
        }
        result.surfaces = [{
          spec: {
            id: `${node.key}.surface`,
            sourceNodeKey: node.key,
            kind: node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 'mezzanine' : node.kind === 'ceiling_fill' ? 'roof' : 'floor',
            profileId: profile.profile.id,
            elevation,
            thickness,
            metadata: {
              levelId: selectedLevel?.id ?? null,
              slabRole: node.kind === 'floor_slab' ? 'floor' : node.kind === 'ceiling_slab' ? 'ceiling' : null,
            },
          },
          geometry,
          color: node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? '#95a56f' : node.kind === 'ceiling_fill' ? '#6d7078' : '#5b6c7c',
        }]
        result.anchors = [createAnchor(node.key, node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 'Mezzanine Edge' : node.kind === 'ceiling_fill' ? 'Ceiling Center' : 'Floor Center', new Vector3(0, elevation, 0))]
        break
      }
      case 'mezzanine_anchor': {
        const host = collectIncomingSolids(graph, node, nextCache.nodeResults, 'host')[0]
        const offset = vector3Param(node, 'offset', { x: 0, y: 0, z: 0 })
        let center = new Vector3(offset.x, 0, offset.z)
        if (host) {
          const geometry = host.geometry.boundingBox ? host.geometry : host.geometry.clone()
          if (!geometry.boundingBox) geometry.computeBoundingBox()
          const bounds = geometry.boundingBox
          if (bounds) {
            center = bounds.getCenter(new Vector3())
            center.x += offset.x
            center.z += offset.z
          }
        }
        const elevation = numberParam(node, 'elevation', offset.y)
        center.y = elevation + offset.y
        result.anchors = [createAnchor(node.key, 'Mezzanine Target', center)]
        break
      }
      case 'slab_void': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        const level = selectLevelForNode(node, collectIncomingLevels(graph, node, nextCache.nodeResults), 'levelIndex', 1)
        if (!profile || !level) break
        result.slabVoids = [{
          id: `${node.key}.void`,
          sourceNodeKey: node.key,
          stairId: null,
          hostLevelId: level.id,
          hostSolidId: null,
          voidRole: 'stair_run',
          outerLoop: {
            id: `${node.key}.void.outer`,
            closed: true,
            kind: 'outer',
            segments: pointsToSegments(profile.outer),
          },
          bottomElevation: level.baseElevation + numberParam(node, 'bottomOffset', 0),
          topElevation: level.baseElevation + Math.max(numberParam(node, 'topOffset', 0.4), numberParam(node, 'bottomOffset', 0) + 0.2),
          metadata: {},
        }]
        break
      }
      case 'stair': {
        const width = numberParam(node, 'width', 1.8)
        const stepCount = Math.max(1, Math.round(numberParam(node, 'stepCount', 8)))
        const rise = numberParam(node, 'rise', 0.18)
        const tread = numberParam(node, 'tread', 0.28)
        result.solids = Array.from({ length: stepCount }, (_, index) => {
          const height = rise * (index + 1)
          const depth = tread
          return {
            spec: {
              id: `${node.key}.step_${index + 1}`,
              sourceNodeKey: node.key,
              kind: 'stair',
              profileId: null,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: { stepIndex: index + 1 },
              metadata: {},
            },
            geometry: new BoxGeometry(width, height, depth).translate(0, height / 2, index * tread + depth / 2),
            color: '#b98f66',
          }
        })
        result.anchors = [
          createAnchor(node.key, 'Stair Base', new Vector3(0, 0, 0)),
          createAnchor(node.key, 'Stair Top', new Vector3(0, rise * stepCount, tread * stepCount)),
        ]
        result.stairs = [{
          id: `${node.key}.stair`,
          sourceNodeKey: node.key,
          kind: 'straight',
          stairFamily: 'straight',
          fromLevelId: null,
          toLevelId: null,
          shaftId: null,
          zoneId: null,
          clearanceEnvelope: null,
          landingIds: [],
          bottomLandingId: null,
          topLandingId: null,
          intermediateLandingIds: [],
          requiredEnvelope: null,
          resolvedEnvelope: null,
          fitStatus: 'fit',
          diagnostics: [],
          riseCount: stepCount,
          metadata: {},
        }]
        break
      }
      case 'stair_run': {
        const width = numberParam(node, 'width', 1.8)
        const stepCount = Math.max(1, Math.round(numberParam(node, 'stepCount', 10)))
        const rise = numberParam(node, 'rise', 0.18)
        const tread = numberParam(node, 'tread', 0.28)
        result.solids = Array.from({ length: stepCount }, (_, index) => {
          const height = rise * (index + 1)
          return {
            spec: {
              id: `${node.key}.step_${index + 1}`,
              sourceNodeKey: node.key,
              kind: 'stair',
              profileId: null,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: { stepIndex: index + 1 },
              metadata: {},
            },
            geometry: new BoxGeometry(width, height, tread).translate(0, height / 2, index * tread + tread / 2),
            color: '#b98f66',
          }
        })
        result.anchors = [
          createAnchor(node.key, 'Stair Base', new Vector3(0, 0, 0)),
          createAnchor(node.key, 'Stair Top', new Vector3(0, rise * stepCount, tread * stepCount)),
        ]
        result.stairs = [{
          id: `${node.key}.stair`,
          sourceNodeKey: node.key,
          kind: 'straight',
          stairFamily: 'straight',
          fromLevelId: null,
          toLevelId: null,
          shaftId: null,
          zoneId: null,
          clearanceEnvelope: null,
          landingIds: [],
          bottomLandingId: null,
          topLandingId: null,
          intermediateLandingIds: [],
          requiredEnvelope: null,
          resolvedEnvelope: null,
          fitStatus: 'fit',
          diagnostics: [],
          riseCount: stepCount,
          metadata: {},
        }]
        break
      }
      case 'switchback_stair': {
        const width = numberParam(node, 'width', 2)
        const stepCount = Math.max(2, Math.round(numberParam(node, 'stepCount', 12)))
        const halfSteps = Math.max(1, Math.floor(stepCount / 2))
        const rise = numberParam(node, 'rise', 0.18)
        const tread = numberParam(node, 'tread', 0.28)
        const landingDepth = numberParam(node, 'landingDepth', 2.2)
        result.solids = []
        for (let index = 0; index < halfSteps; index += 1) {
          const height = rise * (index + 1)
          result.solids.push({
            spec: { id: `${node.key}.lower_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: {} },
            geometry: new BoxGeometry(width, height, tread).translate(0, height / 2, index * tread + tread / 2),
            color: '#b98f66',
          })
        }
        const landingElevation = rise * halfSteps
        result.solids.push({
          spec: { id: `${node.key}.landing`, sourceNodeKey: node.key, kind: 'landing', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { landingElevation }, metadata: {} },
          geometry: new BoxGeometry(width, 0.18, landingDepth).translate(0, landingElevation + 0.09, halfSteps * tread + landingDepth / 2),
          color: '#b1a385',
        })
        for (let index = 0; index < halfSteps; index += 1) {
          const height = landingElevation + rise * (index + 1)
          result.solids.push({
            spec: { id: `${node.key}.upper_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: halfSteps + index + 1 }, metadata: {} },
            geometry: new BoxGeometry(width, height, tread).translate(0, height / 2, halfSteps * tread + landingDepth + index * tread + tread / 2),
            color: '#b98f66',
          })
        }
        result.anchors = [
          createAnchor(node.key, 'Stair Base', new Vector3(0, 0, 0)),
          createAnchor(node.key, 'Landing', new Vector3(0, landingElevation, halfSteps * tread + landingDepth * 0.5)),
          createAnchor(node.key, 'Stair Top', new Vector3(0, rise * stepCount, halfSteps * tread + landingDepth + halfSteps * tread)),
        ]
        result.stairs = [{
          id: `${node.key}.stair`,
          sourceNodeKey: node.key,
          kind: 'switchback',
          stairFamily: 'u_stair',
          fromLevelId: null,
          toLevelId: null,
          shaftId: null,
          zoneId: null,
          clearanceEnvelope: null,
          landingIds: [`${node.key}.landing`],
          bottomLandingId: `${node.key}.landing`,
          topLandingId: `${node.key}.landing`,
          intermediateLandingIds: [`${node.key}.landing`],
          requiredEnvelope: null,
          resolvedEnvelope: null,
          fitStatus: 'fit',
          diagnostics: [],
          riseCount: stepCount,
          metadata: {},
        }]
        break
      }
      case 'spiral_stair': {
        const radius = numberParam(node, 'radius', 1.4)
        const stepCount = Math.max(6, Math.round(numberParam(node, 'stepCount', 18)))
        const rise = numberParam(node, 'rise', 0.18)
        result.solids = Array.from({ length: stepCount }, (_, index) => {
          const angle = (index / stepCount) * Math.PI * 2
          const height = rise * (index + 1)
          const x = Math.cos(angle) * radius * 0.6
          const z = Math.sin(angle) * radius * 0.6
          return {
            spec: { id: `${node.key}.step_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: {} },
            geometry: new BoxGeometry(radius, 0.12, 0.5).translate(x, height, z),
            color: '#b98f66',
          }
        })
        result.anchors = [
          createAnchor(node.key, 'Stair Base', new Vector3(0, 0, 0)),
          createAnchor(node.key, 'Stair Top', new Vector3(0, rise * stepCount, 0)),
        ]
        result.stairs = [{
          id: `${node.key}.stair`,
          sourceNodeKey: node.key,
          kind: 'spiral',
          stairFamily: 'spiral',
          fromLevelId: null,
          toLevelId: null,
          shaftId: null,
          zoneId: null,
          clearanceEnvelope: null,
          landingIds: [],
          bottomLandingId: null,
          topLandingId: null,
          intermediateLandingIds: [],
          requiredEnvelope: null,
          resolvedEnvelope: null,
          fitStatus: 'fit',
          diagnostics: [],
          riseCount: stepCount,
          metadata: {},
        }]
        break
      }
      case 'stair_core': {
        const { fromLevel, toLevel } = selectLevelPairForNode(node, collectIncomingLevels(graph, node, nextCache.nodeResults, 'levels'))
        if (!fromLevel || !toLevel) {
          diagnostics.push(`Stair core "${node.key}" is missing valid from/to levels.`)
          break
        }
        if ((toLevel.baseElevation ?? toLevel.elevation) <= (fromLevel.baseElevation ?? fromLevel.elevation)) {
          diagnostics.push(`Stair core "${node.key}" has non-ascending level targets.`)
          break
        }
        const offset = vector3Param(node, 'offset', { x: 0, y: 0, z: 0 })
        const stairType = stringParam(node, 'stairType', 'switchback')
        const width = numberParam(node, 'width', 2.2)
        const depth = numberParam(node, 'depth', 4.6)
        const rise = numberParam(node, 'rise', 0.18)
        const totalRise = (toLevel.baseElevation ?? toLevel.elevation) - (fromLevel.baseElevation ?? fromLevel.elevation)
        const stepCount = Math.max(2, Math.round(totalRise / Math.max(rise, 0.01)))
        if (stairType === 'spiral') {
          const radius = Math.max(width * 0.5, 0.8)
          result.solids = Array.from({ length: stepCount }, (_, index) => {
            const angle = (index / stepCount) * Math.PI * 2
            const height = (fromLevel.baseElevation ?? fromLevel.elevation) + rise * (index + 1)
            const x = offset.x + Math.cos(angle) * radius * 0.6
            const z = offset.z + Math.sin(angle) * radius * 0.6
            return {
              spec: { id: `${node.key}.step_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: {} },
              geometry: new BoxGeometry(radius, 0.12, 0.5).translate(x, height, z),
              color: '#b98f66',
            }
          })
        } else {
          const halfSteps = Math.max(1, Math.floor(stepCount / 2))
          result.solids = []
          for (let index = 0; index < halfSteps; index += 1) {
            const height = rise * (index + 1)
            result.solids.push({
              spec: { id: `${node.key}.lower_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: index + 1 }, metadata: {} },
              geometry: new BoxGeometry(width, height, depth / Math.max(stepCount, 2)).translate(offset.x, (fromLevel.baseElevation ?? fromLevel.elevation) + height / 2, offset.z + index * (depth / Math.max(stepCount, 2))),
              color: '#b98f66',
            })
          }
          const landingElevation = (fromLevel.baseElevation ?? fromLevel.elevation) + rise * halfSteps
          const landingDepth = numberParam(node, 'landingDepth', Math.max(depth * 0.35, 2))
          result.solids.push({
            spec: { id: `${node.key}.landing`, sourceNodeKey: node.key, kind: 'landing', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { landingElevation }, metadata: {} },
            geometry: new BoxGeometry(width, 0.18, landingDepth).translate(offset.x, landingElevation + 0.09, offset.z + halfSteps * (depth / Math.max(stepCount, 2)) + landingDepth * 0.5),
            color: '#b1a385',
          })
          for (let index = 0; index < stepCount - halfSteps; index += 1) {
            const height = landingElevation + rise * (index + 1)
            result.solids.push({
              spec: { id: `${node.key}.upper_${index + 1}`, sourceNodeKey: node.key, kind: 'stair', profileId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, params: { stepIndex: halfSteps + index + 1 }, metadata: {} },
              geometry: new BoxGeometry(width, height - (fromLevel.baseElevation ?? fromLevel.elevation), depth / Math.max(stepCount, 2)).translate(offset.x, (fromLevel.baseElevation ?? fromLevel.elevation) + (height - (fromLevel.baseElevation ?? fromLevel.elevation)) / 2, offset.z + halfSteps * (depth / Math.max(stepCount, 2)) + landingDepth + index * (depth / Math.max(stepCount, 2))),
              color: '#b98f66',
            })
          }
        }
        const shaftWidth = Math.max(width + 0.35, numberParam(node, 'shaftWidth', width + 0.35))
        const shaftDepth = Math.max(depth + 0.35, numberParam(node, 'shaftDepth', depth + 0.35))
        const shaftLoop = [
          new Vector2(offset.x - shaftWidth * 0.5, offset.z - shaftDepth * 0.5),
          new Vector2(offset.x + shaftWidth * 0.5, offset.z - shaftDepth * 0.5),
          new Vector2(offset.x + shaftWidth * 0.5, offset.z + shaftDepth * 0.5),
          new Vector2(offset.x - shaftWidth * 0.5, offset.z + shaftDepth * 0.5),
        ]
        result.slabVoids = [{
          id: `${node.key}.shaft`,
          sourceNodeKey: node.key,
          stairId: `${node.key}.stair`,
          hostLevelId: toLevel.id,
          hostSolidId: null,
          voidRole: 'stair_run',
          outerLoop: {
            id: `${node.key}.shaft.outer`,
            closed: true,
            kind: 'outer',
            segments: pointsToSegments(shaftLoop),
          },
          bottomElevation: (toLevel.baseElevation ?? toLevel.elevation) - 0.05,
          topElevation: (toLevel.baseElevation ?? toLevel.elevation) + Math.max(numberParam(node, 'voidHeight', 0.45), 0.45),
          metadata: {},
        }]
        result.anchors = [
          createAnchor(node.key, 'Stair Base', new Vector3(offset.x, fromLevel.baseElevation ?? fromLevel.elevation, offset.z)),
          createAnchor(node.key, 'Stair Top', new Vector3(offset.x, toLevel.baseElevation ?? toLevel.elevation, offset.z)),
        ]
        result.stairs = [{
          id: `${node.key}.stair`,
          sourceNodeKey: node.key,
          kind: stairType === 'spiral' ? 'spiral' : 'switchback',
          stairFamily: stairType === 'spiral' ? 'spiral' : 'u_stair',
          fromLevelId: fromLevel.id,
          toLevelId: toLevel.id,
          shaftId: `${node.key}.shaft`,
          zoneId: null,
          clearanceEnvelope: [shaftWidth, totalRise, shaftDepth],
          landingIds: [`${node.key}.landing`],
          bottomLandingId: `${node.key}.landing`,
          topLandingId: `${node.key}.landing`,
          intermediateLandingIds: [`${node.key}.landing`],
          requiredEnvelope: [shaftWidth, totalRise, shaftDepth],
          resolvedEnvelope: [shaftWidth, totalRise, shaftDepth],
          fitStatus: 'fit',
          diagnostics: [],
          riseCount: stepCount,
          metadata: {},
        }]
        break
      }
      case 'stair_core_v2': {
        const availableLevels = collectIncomingLevels(graph, node, nextCache.nodeResults, 'levels')
        const fromLevel = selectLevelForNode(node, availableLevels, 'fromLevelIndex', 1)
        const toLevel = selectLevelForNode(node, availableLevels, 'toLevelIndex', Math.min(2, availableLevels.length))
        const zoneRooms = collectIncomingRooms(graph, node, nextCache.nodeResults, 'zone')
        const targetAnchor = collectIncomingAnchors(graph, node, nextCache.nodeResults, 'target')[0]
        if (!fromLevel) {
          diagnostics.push(`Stair core "${node.key}" is missing a valid source level.`)
          break
        }
        if (zoneRooms.length === 0) {
          diagnostics.push(`Stair core "${node.key}" requires a connected circulation zone.`)
          break
        }
        const stairId = `${node.key}.stair`
        const stairFamilyParam = stringParam(node, 'stairFamily', 'u_stair')
        const stairFamily: StairRunSpec['stairFamily'] =
          stairFamilyParam === 'straight' || stairFamilyParam === 'l_stair' || stairFamilyParam === 'u_stair' || stairFamilyParam === 'winder_l' || stairFamilyParam === 'winder_u' || stairFamilyParam === 'spiral' || stairFamilyParam === 'mezzanine'
            ? stairFamilyParam
            : 'u_stair'
        const targetElevationModeParam = stringParam(node, 'targetElevationMode', 'level_top')
        const targetElevationMode: StairLayoutRequest['targetElevationMode'] =
          targetElevationModeParam === 'mezzanine' || targetElevationModeParam === 'explicit' ? targetElevationModeParam : 'level_top'
        const fitModeParam = stringParam(node, 'fitMode', 'zone_autofit')
        const fitMode: StairLayoutRequest['fitMode'] =
          fitModeParam === 'strict' || fitModeParam === 'zone_autofit_with_partition_push' ? fitModeParam : 'zone_autofit'
        const turnDirectionParam = stringParam(node, 'turnDirection', 'right')
        const turnDirection: StairLayoutRequest['turnDirection'] = turnDirectionParam === 'left' ? 'left' : 'right'
        const preferredExitSideParam = stringParam(node, 'preferredExitSide', 'auto')
        const preferredExitSide: StairLayoutRequest['preferredExitSide'] =
          preferredExitSideParam === 'front' || preferredExitSideParam === 'back' || preferredExitSideParam === 'left' || preferredExitSideParam === 'right'
            ? preferredExitSideParam
            : 'auto'
        const fromZoneRoom = zoneRooms.find((room) => room.levelId === fromLevel.id) ?? zoneRooms[0]
        result.stairs = [{
          id: stairId,
          sourceNodeKey: node.key,
          kind: stairKindFromFamily(stairFamily),
          stairFamily,
          fromLevelId: fromLevel.id,
          toLevelId: toLevel?.id ?? null,
          shaftId: `${node.key}.void`,
          zoneId: fromZoneRoom?.sourceNodeKey ?? null,
          clearanceEnvelope: null,
          landingIds: [],
          bottomLandingId: null,
          topLandingId: null,
          intermediateLandingIds: [],
          requiredEnvelope: null,
          resolvedEnvelope: null,
          fitStatus: 'invalid',
          diagnostics: [],
          riseCount: 0,
          metadata: { placeholder: true },
        }]
        result.stairLayoutRequests = [{
          id: stairId,
          sourceNodeKey: node.key,
          stairFamily,
          fitMode,
          targetElevationMode,
          fromLevelId: fromLevel.id,
          toLevelId: toLevel?.id ?? null,
          zoneRoomIds: zoneRooms.map((room) => room.roomId ?? room.id),
          targetAnchorId: targetAnchor?.id ?? null,
          width: numberParam(node, 'width', 2.2),
          tread: numberParam(node, 'tread', 0.28),
          maxRise: numberParam(node, 'maxRise', 0.18),
          landingDepth: numberParam(node, 'landingDepth', 2.4),
          turnDirection,
          preferredExitSide,
          headroom: numberParam(node, 'headroom', 2.1),
          wallClearance: numberParam(node, 'wallClearance', 0.16),
          clearanceMargin: numberParam(node, 'clearanceMargin', 0.22),
          explicitTargetElevation: targetAnchor?.position[1] ?? (targetElevationMode === 'explicit' ? numberParam(node, 'targetElevation', fromLevel.topElevation) : null),
        }]
        break
      }
      case 'stair_shaft': {
        const { fromLevel, toLevel } = selectLevelPairForNode(node, collectIncomingLevels(graph, node, nextCache.nodeResults, 'levels'))
        if (!fromLevel || !toLevel) break
        const width = numberParam(node, 'width', 2.6)
        const depth = numberParam(node, 'depth', 4.8)
        const offset = vector3Param(node, 'offset', { x: 0, y: 0, z: 0 })
        const loop = [
          new Vector2(offset.x - width * 0.5, offset.z - depth * 0.5),
          new Vector2(offset.x + width * 0.5, offset.z - depth * 0.5),
          new Vector2(offset.x + width * 0.5, offset.z + depth * 0.5),
          new Vector2(offset.x - width * 0.5, offset.z + depth * 0.5),
        ]
        result.slabVoids = [{
          id: `${node.key}.void`,
          sourceNodeKey: node.key,
          stairId: null,
          hostLevelId: toLevel.id,
          hostSolidId: null,
          voidRole: 'stair_run',
          outerLoop: {
            id: `${node.key}.void.outer`,
            closed: true,
            kind: 'outer',
            segments: pointsToSegments(loop),
          },
          bottomElevation: (toLevel.baseElevation ?? toLevel.elevation) - 0.05,
          topElevation: (toLevel.baseElevation ?? toLevel.elevation) + 0.45,
          metadata: {},
        }]
        break
      }
      case 'landing_stack': {
        const { fromLevel, toLevel } = selectLevelPairForNode(node, collectIncomingLevels(graph, node, nextCache.nodeResults, 'levels'))
        if (!fromLevel || !toLevel) break
        const width = numberParam(node, 'width', 2.2)
        const depth = numberParam(node, 'depth', 2.2)
        const thickness = numberParam(node, 'thickness', 0.18)
        const offset = vector3Param(node, 'offset', { x: 0, y: 0, z: 0 })
        result.solids = [{
          spec: {
            id: `${node.key}.landing`,
            sourceNodeKey: node.key,
            kind: 'landing',
            profileId: null,
            transform: { position: [offset.x, toLevel.baseElevation ?? toLevel.elevation, offset.z], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { width, depth, thickness },
            metadata: { levelId: toLevel.id },
          },
          geometry: new BoxGeometry(width, thickness, depth).translate(offset.x, (toLevel.baseElevation ?? toLevel.elevation) + thickness * 0.5, offset.z),
          color: '#b1a385',
        }]
        result.anchors = [createAnchor(node.key, 'Landing', new Vector3(offset.x, toLevel.baseElevation ?? toLevel.elevation, offset.z))]
        break
      }
      case 'landing_stack_v2': {
        const { fromLevel, toLevel } = selectLevelPairForNode(node, collectIncomingLevels(graph, node, nextCache.nodeResults, 'levels'))
        if (!fromLevel || !toLevel) break
        const width = numberParam(node, 'width', 2.2)
        const depth = numberParam(node, 'depth', 2.2)
        const thickness = numberParam(node, 'thickness', 0.18)
        const zoneRoom = collectIncomingRooms(graph, node, nextCache.nodeResults, 'zone')[0]
        const profilePool = [...nextCache.nodeResults.values()].flatMap((entry) => entry.profiles?.map((profile) => profile.profile) ?? [])
        const bounds = zoneRoom ? roomProfileBounds(zoneRoom, profilePool) : null
        const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : 0
        const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : 0
        result.solids = [{
          spec: {
            id: `${node.key}.landing`,
            sourceNodeKey: node.key,
            kind: 'landing',
            profileId: null,
            transform: { position: [centerX, toLevel.baseElevation ?? toLevel.elevation, centerZ], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { width, depth, thickness },
            metadata: { levelId: toLevel.id, zoneRoomId: zoneRoom?.roomId ?? null },
          },
          geometry: new BoxGeometry(width, thickness, depth).translate(centerX, (toLevel.baseElevation ?? toLevel.elevation) + thickness * 0.5, centerZ),
          color: '#b1a385',
        }]
        result.anchors = [createAnchor(node.key, 'Landing', new Vector3(centerX, toLevel.baseElevation ?? toLevel.elevation, centerZ))]
        break
      }
      case 'landing': {
        const width = numberParam(node, 'width', 2)
        const depth = numberParam(node, 'depth', 2)
        const thickness = numberParam(node, 'thickness', 0.18)
        const elevation = numberParam(node, 'elevation', 1.44)
        result.solids = [{
          spec: {
            id: `${node.key}.solid`,
            sourceNodeKey: node.key,
            kind: 'landing',
            profileId: null,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { width, depth, thickness, elevation },
            metadata: {},
          },
          geometry: new BoxGeometry(width, thickness, depth).translate(0, elevation + thickness / 2, 0),
          color: '#b1a385',
        }]
        result.anchors = [createAnchor(node.key, 'Landing Center', new Vector3(0, elevation, 0))]
        break
      }
      default:
        break
    }
  }

  for (const node of orderedNodes) {
    const result = nextCache.nodeResults.get(node.key)
    if (!result) continue

    switch (node.kind) {
      case 'opening':
      case 'doorway':
      case 'door_opening':
      case 'window_opening':
      case 'opening_array':
      case 'arch_opening':
      case 'connector_opening': {
        const host = collectIncomingSolids(graph, node, nextCache.nodeResults, 'host')[0]
        const wallFace = chooseWallFaceForNode(node, collectIncomingWallFaces(graph, node, nextCache.nodeResults))
        const width = numberParam(node, 'width', node.kind === 'doorway' || node.kind === 'door_opening' ? 1.1 : 1.4)
        const height = numberParam(node, 'height', node.kind === 'window_opening' || node.kind === 'opening_array' ? 1.2 : 2.2)
        const sillHeight = numberParam(node, 'sillHeight', 0.9)
        const count = Math.max(1, Math.round(numberParam(node, 'count', 1)))
        const spacing = numberParam(node, 'spacing', 2.2)
        const baseElevation = wallFace?.elevationBottom ?? 0
        const basePosition = openingPositionFromWallFace(wallFace, new Vector3(0, baseElevation, 0))
        const normal = wallFace ? new Vector3(wallFace.normal[0], wallFace.normal[1], wallFace.normal[2]) : new Vector3(1, 0, 0)
        const tangent = new Vector3(-normal.z, 0, normal.x).normalize()
        const requestedOffset = numberParam(node, 'offset', 0)
        result.openings = Array.from({ length: count }, (_, index) => {
          const openingOffset = (index - (count - 1) / 2) * spacing
          const position = basePosition.clone().addScaledVector(tangent, openingOffset + requestedOffset)
          position.y = baseElevation + (node.kind === 'window_opening' || node.kind === 'opening_array' ? sillHeight + height * 0.5 : height * 0.5)
          const wallFaceLevelId = typeof wallFace?.levelId === 'string' ? wallFace.levelId : null
          const wallFaceRoomIds = wallFace?.ownerRoomIds ?? []
          return {
            id: `${node.key}.opening_${index + 1}`,
            sourceNodeKey: node.key,
            hostSolidId: host?.spec.id ?? null,
            hostWallSegmentId: typeof wallFace?.metadata.wallSegmentId === 'string' ? String(wallFace.metadata.wallSegmentId) : null,
            levelId: wallFaceLevelId,
            fromRoomId: wallFaceRoomIds[0] ?? null,
            toRoomId: wallFaceRoomIds[1] ?? null,
            kind: node.kind === 'doorway' || node.kind === 'door_opening' ? 'doorway' : 'opening',
            openingRole: wallFace?.wallRole === 'partition' ? 'interior' : 'exterior',
            position: [position.x, position.y, position.z],
            size: [width, height, 0.2],
            metadata: { wallFaceId: wallFace?.id ?? null, openingIndex: index + 1, openingKind: node.kind, requestedSide: stringParam(node, 'side', ''), offset: openingOffset + requestedOffset },
          }
        })
        result.windows = node.kind === 'window_opening' || node.kind === 'opening_array'
          ? result.openings.map((opening, index) => ({
              id: `${node.key}.window_${index + 1}`,
              sourceNodeKey: node.key,
              hostSolidId: host?.spec.id ?? null,
              wallFaceId: wallFace?.id ?? null,
              position: opening.position,
              size: opening.size,
              sillHeight,
              metadata: { openingId: opening.id },
            }))
          : []
        result.anchors = result.openings.map((opening, index) => createAnchor(node.key, `Opening ${index + 1}`, new Vector3(opening.position[0], opening.position[1], opening.position[2])))
        break
      }
      case 'door_between_rooms': {
        const rooms = collectIncomingRooms(graph, node, nextCache.nodeResults)
        result.interiorDoorRequests = [{
          id: `${node.key}.opening`,
          sourceNodeKey: node.key,
          roomIds: rooms.slice(0, 2).map((room) => roomLabel(room)),
          width: numberParam(node, 'width', 1.05),
          height: numberParam(node, 'height', 2.1),
          offset: numberParam(node, 'offset', 0),
        }]
        result.anchors = [createAnchor(node.key, 'Interior Door', new Vector3(0, 1, 0))]
        break
      }
      case 'stair_connection': {
        const stairs = collectIncomingStairs(graph, node, nextCache.nodeResults)
        const rooms = collectIncomingRooms(graph, node, nextCache.nodeResults)
        const wallSegmentEdge = incomingEdges(graph, node.key, 'wall_segment')[0]
        result.stairConnectionRequests = stairs.map((stair) => ({
          id: `${node.key}.${stair.id}`,
          sourceNodeKey: node.key,
          stairId: stair.id,
          targetRoomIds: rooms.map((room) => roomLabel(room)),
          targetWallSegmentId: wallSegmentEdge ? `${wallSegmentEdge.source.nodeKey}.${wallSegmentEdge.source.portId}` : null,
          connectionMode: stringParam(node, 'connectionMode', 'door') === 'open_edge'
            ? 'open_edge'
            : stringParam(node, 'connectionMode', 'door') === 'guard_opening'
              ? 'guard_opening'
              : 'door',
          landing: stringParam(node, 'landing', 'auto') === 'bottom'
            ? 'bottom'
            : stringParam(node, 'landing', 'auto') === 'top'
              ? 'top'
              : 'auto',
          connectionPlacement: stringParam(node, 'connectionPlacement', 'landing_aligned') === 'center'
            ? 'center'
            : stringParam(node, 'connectionPlacement', 'landing_aligned') === 'auto'
              ? 'auto'
              : 'landing_aligned',
          width: numberParam(node, 'width', 1.1),
          height: numberParam(node, 'height', 2.2),
          offset: numberParam(node, 'offset', 0),
        }))
        result.anchors = [createAnchor(node.key, 'Stair Connection', new Vector3(0, 1, 0))]
        break
      }
      case 'opening_on_wall_segment': {
        result.wallSegmentOpeningRequests = [{
          id: `${node.key}.opening`,
          sourceNodeKey: node.key,
          wallSegmentId: typeof node.params.wallSegmentId === 'string' ? node.params.wallSegmentId : null,
          width: numberParam(node, 'width', 1.1),
          height: numberParam(node, 'height', 2.1),
          offset: numberParam(node, 'offset', 0),
          openingRole: stringParam(node, 'openingRole', 'interior') === 'circulation' ? 'circulation' : stringParam(node, 'openingRole', 'interior') === 'exterior' ? 'exterior' : 'interior',
        }]
        result.anchors = [createAnchor(node.key, 'Wall Segment Opening', new Vector3(0, 1, 0))]
        break
      }
      case 'partition_walls_from_rooms': {
        result.rooms = collectIncomingRooms(graph, node, nextCache.nodeResults)
        break
      }
      case 'connector': {
        const from = collectIncomingAnchors(graph, node, nextCache.nodeResults, 'from')[0]
        const to = collectIncomingAnchors(graph, node, nextCache.nodeResults, 'to')[0]
        result.connectors = from && to
          ? [{ id: `${node.key}.connector`, sourceNodeKey: node.key, fromAnchorId: from.id, toAnchorId: to.id, metadata: {} }]
          : []
        break
      }
      case 'bridge_span':
      case 'bridge_deck':
      case 'bridge_supports': {
        const anchorPair = chooseBridgeAnchorPair(
          collectIncomingAnchors(graph, node, nextCache.nodeResults, 'from'),
          collectIncomingAnchors(graph, node, nextCache.nodeResults, 'to'),
        )
        if (!anchorPair) break
        const { from, to } = anchorPair
        const start = new Vector3(from.position[0], from.position[1], from.position[2])
        const end = new Vector3(to.position[0], to.position[1], to.position[2])
        const span = new Vector3().subVectors(end, start)
        const length = Math.max(span.length(), 0.001)
        const center = start.clone().add(end).multiplyScalar(0.5)
        const width = numberParam(node, 'width', 2.4)
        const thickness = numberParam(node, 'thickness', 0.24)
        const deck = new BoxGeometry(length, thickness, width)
        const angle = Math.atan2(span.z, span.x)
        deck.rotateY(-angle)
        deck.translate(center.x, center.y, center.z)
        result.solids = [{
          spec: { id: `${node.key}.solid`, sourceNodeKey: node.key, kind: 'array', profileId: null, transform: { position: [center.x, center.y, center.z], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { width, thickness, length }, metadata: {} },
          geometry: deck,
          color: '#8c7a68',
        }]
        result.anchors = [createAnchor(node.key, 'Bridge Start', start), createAnchor(node.key, 'Bridge End', end)]
        result.bridges = [{
          id: `${node.key}.bridge`,
          sourceNodeKey: node.key,
          fromAnchorId: from.id,
          toAnchorId: to.id,
          deckElevation: center.y,
          width,
          metadata: {},
        }]
        break
      }
      case 'bridge_room': {
        const anchorPair = chooseBridgeAnchorPair(
          collectIncomingAnchors(graph, node, nextCache.nodeResults, 'from'),
          collectIncomingAnchors(graph, node, nextCache.nodeResults, 'to'),
        )
        if (!anchorPair) break

        const start = anchorPosition(anchorPair.from)
        const end = anchorPosition(anchorPair.to)
        const span = new Vector3().subVectors(end, start)
        const spanLength = Math.max(span.length(), 0.001)
        const axis = span.clone().normalize()
        const angle = Math.atan2(span.z, span.x)
        const width = numberParam(node, 'width', 3.2)
        const wallHeight = numberParam(node, 'wallHeight', 3)
        const wallThickness = numberParam(node, 'wallThickness', 0.22)
        const floorThickness = numberParam(node, 'floorThickness', 0.18)
        const roofThickness = numberParam(node, 'roofThickness', 0.18)
        const elevation = typeof node.params.elevation === 'number' ? numberParam(node, 'elevation', 0) : (start.y + end.y) * 0.5
        const requestedOverlap = numberParam(node, 'overlap', 0.45)
        const center = start.clone().add(end).multiplyScalar(0.5)

        const fromStructuralShell = firstStructuralShell(collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'from_host'))
        const toStructuralShell = firstStructuralShell(collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'to_host'))
        const effectiveOverlap = recommendedBridgeOverlap(
          width,
          wallThickness,
          requestedOverlap,
          [fromStructuralShell, toStructuralShell].filter((shell): shell is StructuralShellInput => Boolean(shell)),
        )
        const bridgeShell = createBridgeShellInput(node, start, end, width, wallHeight, wallThickness, elevation, effectiveOverlap, floorThickness)
        if (fromStructuralShell && toStructuralShell) {
          const fused = applyStructuralFusion(
            node,
            `${node.key}.fusion`,
            [fromStructuralShell, bridgeShell, toStructuralShell],
            result,
            diagnostics,
            '#8b7a69',
            (band) =>
              band.metadata.derivedKind === 'fused'
                ? {
                    ...band,
                    metadata: {
                      ...band.metadata,
                      ceilingAtTop: true,
                      ceilingThickness: roofThickness,
                    },
                  }
                : band,
          )
          if (fused) {
            result.solids = (result.solids ?? []).map((solid, index) => ({
              ...solid,
              spec: {
                ...solid.spec,
                id: `${node.key}.solid_${index + 1}`,
                sourceNodeKey: node.key,
                metadata: {
                  ...solid.spec.metadata,
                  fusionMode: 'structural_2_5d',
                  effectiveOverlap,
                },
              },
            }))
            result.solidOutputs = { solid: result.solids }
          }
        }

        if (!result.solids?.length) {
          const fromHost = pickStructuralHostSolid(collectIncomingSolids(graph, node, nextCache.nodeResults, 'from_host'))
          const toHost = pickStructuralHostSolid(collectIncomingSolids(graph, node, nextCache.nodeResults, 'to_host'))
          if (!fromHost || !toHost) break
          diagnostics.push(`Bridge room "${node.key}" fell back to mesh CSG; structural shells unavailable.`)
          const totalLength = spanLength + effectiveOverlap * 2
          const floorCenter = new Vector3(center.x, elevation + floorThickness * 0.5, center.z)
          const roofCenter = new Vector3(center.x, elevation + wallHeight - roofThickness * 0.5, center.z)
          const leftWallOffset = new Vector3(-axis.z, 0, axis.x).multiplyScalar(width * 0.5 - wallThickness * 0.5)
          const rightWallOffset = leftWallOffset.clone().multiplyScalar(-1)
          const wallCenterY = elevation + wallHeight * 0.5
          const bridgePieces: RuntimeSolid[] = [
            {
              spec: { id: `${node.key}.floor`, sourceNodeKey: node.key, kind: 'bridge_room', profileId: null, transform: { position: [floorCenter.x, floorCenter.y, floorCenter.z], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { length: totalLength, width, floorThickness }, metadata: { bridgePiece: 'floor' } },
              geometry: orientedBoxGeometry(totalLength, floorThickness, width, floorCenter, angle),
              color: '#667585',
            },
            {
              spec: { id: `${node.key}.left_wall`, sourceNodeKey: node.key, kind: 'bridge_room', profileId: null, transform: { position: [center.x + leftWallOffset.x, wallCenterY, center.z + leftWallOffset.z], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { length: totalLength, width: wallThickness, wallHeight }, metadata: { bridgePiece: 'left_wall' } },
              geometry: orientedBoxGeometry(totalLength, wallHeight, wallThickness, new Vector3(center.x + leftWallOffset.x, wallCenterY, center.z + leftWallOffset.z), angle),
              color: '#7f92a6',
            },
            {
              spec: { id: `${node.key}.right_wall`, sourceNodeKey: node.key, kind: 'bridge_room', profileId: null, transform: { position: [center.x + rightWallOffset.x, wallCenterY, center.z + rightWallOffset.z], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { length: totalLength, width: wallThickness, wallHeight }, metadata: { bridgePiece: 'right_wall' } },
              geometry: orientedBoxGeometry(totalLength, wallHeight, wallThickness, new Vector3(center.x + rightWallOffset.x, wallCenterY, center.z + rightWallOffset.z), angle),
              color: '#7f92a6',
            },
            {
              spec: { id: `${node.key}.roof`, sourceNodeKey: node.key, kind: 'bridge_room', profileId: null, transform: { position: [roofCenter.x, roofCenter.y, roofCenter.z], rotation: [0, angle, 0], scale: [1, 1, 1] }, params: { length: totalLength, width, roofThickness }, metadata: { bridgePiece: 'roof' } },
              geometry: orientedBoxGeometry(totalLength, roofThickness, width, roofCenter, angle),
              color: '#718193',
            },
          ]
          const bridgeSolid = unionSolidList(bridgePieces, node, diagnostics)
          result.solids = bridgeSolid ? [bridgeSolid] : []
          result.solidOutputs = result.solids ? { solid: result.solids } : { solid: [] }
        }

        result.anchors = [
          ...(result.anchors ?? []),
          createAnchor(node.key, 'Bridge Start', new Vector3(start.x, elevation, start.z)),
          createAnchor(node.key, 'Bridge End', new Vector3(end.x, elevation, end.z)),
          createAnchor(node.key, 'Bridge Center', new Vector3(center.x, elevation, center.z)),
        ]
        result.bridges = [{
          id: `${node.key}.bridge`,
          sourceNodeKey: node.key,
          fromAnchorId: anchorPair.from.id,
          toAnchorId: anchorPair.to.id,
          deckElevation: elevation,
          width,
          metadata: {
            enclosed: true,
            spanLength,
            requestedOverlap,
            effectiveOverlap,
            fusionMode: result.structuralFusions?.length ? 'structural_2_5d' : 'mesh_csg_fallback',
          },
        }]
        break
      }
      case 'bridge_to_openings': {
        const from = collectIncomingAnchors(graph, node, nextCache.nodeResults, 'from')[0]
        const to = collectIncomingAnchors(graph, node, nextCache.nodeResults, 'to')[0]
        if (!from || !to) break
        result.openings = [
          {
            id: `${node.key}.opening_a`,
            sourceNodeKey: node.key,
            hostSolidId: null,
            hostWallSegmentId: null,
            levelId: null,
            fromRoomId: null,
            toRoomId: null,
            kind: 'opening',
            openingRole: 'circulation',
            position: from.position,
            size: [numberParam(node, 'width', 1.8), numberParam(node, 'height', 2.4), 0.2],
            metadata: { bridgeSide: 'from' },
          },
          {
            id: `${node.key}.opening_b`,
            sourceNodeKey: node.key,
            hostSolidId: null,
            hostWallSegmentId: null,
            levelId: null,
            fromRoomId: null,
            toRoomId: null,
            kind: 'opening',
            openingRole: 'circulation',
            position: to.position,
            size: [numberParam(node, 'width', 1.8), numberParam(node, 'height', 2.4), 0.2],
            metadata: { bridgeSide: 'to' },
          },
        ]
        break
      }
      case 'ribbon_along_path':
      case 'ribbon_path':
      case 'fence_along_path':
      case 'wall_along_path':
      case 'tiled_array_along_path':
      case 'array_along_path':
      case 'path_loft': {
        const path = collectIncomingPaths(graph, node, nextCache.nodeResults)[0]
        if (!path || path.points.length < 2) break
        if (node.kind === 'ribbon_path' || node.kind === 'ribbon_along_path' || node.kind === 'path_loft') {
          const width = numberParam(node, 'width', 1.5)
          const thickness = numberParam(node, 'thickness', 0.12)
          const curve = new CatmullRomCurve3(path.points)
          result.solids = [{
            spec: {
              id: `${node.key}.solid`,
              sourceNodeKey: node.key,
              kind: 'ribbon',
              profileId: null,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              params: { width, thickness },
              metadata: {},
            },
            geometry: new TubeGeometry(curve, Math.max(8, path.points.length * 6), thickness * 0.5, 8, false).scale(width, 1, 1),
            color: '#5f91c2',
          }]
        } else if (node.kind === 'array_along_path') {
          const source = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source')[0]
          if (!source) break
          const spacing = numberParam(node, 'spacing', 2.2)
          const placements: RuntimeSolid[] = []
          let carried = 0
          for (let index = 1; index < path.points.length; index += 1) {
            const previous = path.points[index - 1]
            const current = path.points[index]
            carried += previous.distanceTo(current)
            if (carried >= spacing || index === 1) {
              carried = 0
              placements.push(cloneSolid(source, cloneGeometryWithMatrix(source.geometry, new Matrix4().makeTranslation(current.x, current.y, current.z)), { pathIndex: index }))
            }
          }
          result.solids = placements
          result.arrayPlacements = [{
            id: `${node.key}.array`,
            sourceNodeKey: node.key,
            sourceSolidId: source.spec.id,
            count: placements.length,
            metadata: {},
          }]
        } else {
          const spacing = numberParam(node, 'spacing', numberParam(node, 'postSpacing', 1.6))
          const height = numberParam(node, 'height', node.kind === 'fence_along_path' ? 1.2 : 2.8)
          const thickness = numberParam(node, 'thickness', 0.2)
          let distanceAccumulator = 0
          result.solids = []
          for (let index = 1; index < path.points.length; index += 1) {
            const previous = path.points[index - 1]
            const current = path.points[index]
            distanceAccumulator += previous.distanceTo(current)
            if (distanceAccumulator >= spacing || index === 1) {
              distanceAccumulator = 0
              result.solids.push({
                spec: {
                  id: `${node.key}.segment_${index}`,
                  sourceNodeKey: node.key,
                  kind: node.kind === 'wall_along_path' ? 'wall_shell' : 'array',
                  profileId: null,
                  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                  params: { segmentIndex: index },
                  metadata: {},
                },
                geometry: new BoxGeometry(thickness, height, thickness).translate(current.x, height / 2, current.z),
                color: node.kind === 'wall_along_path' ? '#848f99' : '#8a6c4a',
              })
            }
          }
        }
        result.anchors = path.points.map((point, index) => createAnchor(node.key, `Path ${index + 1}`, point.clone()))
        break
      }
      case 'grid_array': {
        const source = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source')[0]
        if (!source) break
        const columns = Math.max(1, Math.round(numberParam(node, 'columns', 3)))
        const rows = Math.max(1, Math.round(numberParam(node, 'rows', 3)))
        const spacingX = numberParam(node, 'spacingX', 3)
        const spacingY = numberParam(node, 'spacingY', 3)
        result.solids = []
        for (let column = 0; column < columns; column += 1) {
          for (let row = 0; row < rows; row += 1) {
            const matrix = new Matrix4().makeTranslation(column * spacingX, 0, row * spacingY)
            result.solids.push(cloneSolid(source, cloneGeometryWithMatrix(source.geometry, matrix), { column, row }))
          }
        }
        break
      }
      case 'union_structure':
      case 'union':
      case 'difference_structure':
      case 'difference':
      case 'intersect_structure':
      case 'intersect': {
        if (node.kind === 'union_structure') {
          const aShell = firstStructuralShell(collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'a'))
          const bShell = firstStructuralShell(collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'b'))
          if (aShell && bShell) {
            const fused = applyStructuralFusion(node, `${node.key}.fusion`, [aShell, bShell], result, diagnostics, '#8b7a69')
            if (fused) {
              result.solids = (result.solids ?? []).map((solid, index) => ({
                ...solid,
                spec: {
                  ...solid.spec,
                  id: `${node.key}.solid_${index + 1}`,
                  sourceNodeKey: node.key,
                  metadata: {
                    ...solid.spec.metadata,
                    fusionMode: 'structural_2_5d',
                  },
                },
              }))
              result.solidOutputs = { solid: result.solids ?? [] }
              break
            }
          }
        }
        const a = collectIncomingSolids(graph, node, nextCache.nodeResults, 'a')[0]
        const b = collectIncomingSolids(graph, node, nextCache.nodeResults, 'b')[0]
        if (!a || !b) break
        const op = node.kind === 'union' || node.kind === 'union_structure' ? ADDITION : node.kind === 'difference' || node.kind === 'difference_structure' ? SUBTRACTION : INTERSECTION
        const combined = booleanCombine(a, b, op, node, diagnostics)
        result.solids = combined ? [combined] : []
        result.solidOutputs = combined ? { solid: [combined] } : { solid: [] }
        break
      }
      case 'transform': {
        const sourceEdge = incomingEdges(graph, node.key, 'source')[0]
        const sourceResult = sourceEdge ? nextCache.nodeResults.get(sourceEdge.source.nodeKey) : undefined
        const translate = vector3Param(node, 'translate', { x: 0, y: 0, z: 0 })
        const rotate = vector3Param(node, 'rotate', { x: 0, y: 0, z: 0 })
        const scale = vector3Param(node, 'scale', { x: 1, y: 1, z: 1 })
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source').map((solid) => transformedSolid(solid, node))
        result.solidOutputs = mapSolidOutputs(sourceResult, (solid) => transformedSolid(solid, node))
        result.structuralShells = collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'source').map((shell, index) =>
          transformedStructuralShell(shell, translate, rotate, scale, `${node.key}.${index + 1}`),
        )
        result.anchors = collectSourceAnchors(graph, node, nextCache.nodeResults, 'source').map((anchor) => {
          return {
            ...anchor,
            id: `${anchor.id}.${node.key}`,
            position: [anchor.position[0] + translate.x, anchor.position[1] + translate.y, anchor.position[2] + translate.z] as [number, number, number],
          }
        })
        break
      }
      case 'mirror': {
        const axis = stringParam(node, 'axis', 'x')
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source').map((solid) => {
          const scale = new Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1)
          const matrix = new Matrix4().makeScale(scale.x, scale.y, scale.z)
          return cloneSolid(solid, cloneGeometryWithMatrix(solid.geometry, matrix), { mirroredAxis: axis })
        })
        const sourceEdge = incomingEdges(graph, node.key, 'source')[0]
        const sourceResult = sourceEdge ? nextCache.nodeResults.get(sourceEdge.source.nodeKey) : undefined
        result.solidOutputs = mapSolidOutputs(sourceResult, (solid) => {
          const scale = new Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1)
          const matrix = new Matrix4().makeScale(scale.x, scale.y, scale.z)
          return cloneSolid(solid, cloneGeometryWithMatrix(solid.geometry, matrix), { mirroredAxis: axis })
        })
        result.structuralShells = collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'source').map((shell, index) =>
          mirroredStructuralShell(shell, axis, `${node.key}.${index + 1}`),
        )
        result.anchors = collectSourceAnchors(graph, node, nextCache.nodeResults, 'source').map((anchor) => ({
          ...anchor,
          id: `${anchor.id}.${node.key}`,
          position: [
            axis === 'x' ? -anchor.position[0] : anchor.position[0],
            axis === 'y' ? -anchor.position[1] : anchor.position[1],
            axis === 'z' ? -anchor.position[2] : anchor.position[2],
          ] as [number, number, number],
        }))
        break
      }
      case 'repeat': {
        const source = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source')[0]
        if (!source) break
        const count = Math.max(1, Math.round(numberParam(node, 'count', 3)))
        const offset = vector3Param(node, 'offset', { x: 3, y: 0, z: 0 })
        result.solids = Array.from({ length: count }, (_, index) => {
          const matrix = new Matrix4().makeTranslation(offset.x * index, offset.y * index, offset.z * index)
          return cloneSolid(source, cloneGeometryWithMatrix(source.geometry, matrix), { repeatIndex: index })
        })
        const sourceAnchors = collectSourceAnchors(graph, node, nextCache.nodeResults, 'source')
        const sourceShells = collectIncomingStructuralShells(graph, node, nextCache.nodeResults, 'source')
        result.structuralShells = Array.from({ length: count }, (_, index) =>
          sourceShells.map((shell) =>
            transformedStructuralShell(
              shell,
              { x: offset.x * index, y: offset.y * index, z: offset.z * index },
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 1, z: 1 },
              `${node.key}.${index + 1}`,
            ),
          ),
        ).flat()
        result.anchors = Array.from({ length: count }, (_, index) =>
          sourceAnchors.map((anchor) => ({
            ...anchor,
            id: `${anchor.id}.${node.key}.${index + 1}`,
            position: [
              anchor.position[0] + offset.x * index,
              anchor.position[1] + offset.y * index,
              anchor.position[2] + offset.z * index,
            ] as [number, number, number],
          })),
        ).flat()
        const sourceEdge = incomingEdges(graph, node.key, 'source')[0]
        const sourceResult = sourceEdge ? nextCache.nodeResults.get(sourceEdge.source.nodeKey) : undefined
        result.solidOutputs = sourceResult
          ? Object.fromEntries(
              Object.entries(sourceResult.solidOutputs ?? { solid: sourceResult.solids ?? [] }).map(([outputKey, solids]) => [
                outputKey,
                Array.from({ length: count }, (_, index) => {
                  const matrix = new Matrix4().makeTranslation(offset.x * index, offset.y * index, offset.z * index)
                  return solids.map((solid) => cloneSolid(solid, cloneGeometryWithMatrix(solid.geometry, matrix), { repeatIndex: index }))
                }).flat(),
              ]),
            )
          : undefined
        break
      }
      case 'attach_to_host': {
        const source = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source')[0]
        const host = collectIncomingSolids(graph, node, nextCache.nodeResults, 'host')[0]
        if (!source || !host) break
        const sourceBounds = computeGeometryBounds(source.geometry)
        const hostBounds = computeGeometryBounds(host.geometry)
        const translation = new Matrix4().makeTranslation(
          hostBounds.getCenter(new Vector3()).x - sourceBounds.getCenter(new Vector3()).x,
          hostBounds.max.y - sourceBounds.min.y,
          hostBounds.getCenter(new Vector3()).z - sourceBounds.getCenter(new Vector3()).z,
        )
        result.solids = [cloneSolid(source, cloneGeometryWithMatrix(source.geometry, translation), { attachedTo: host.spec.id })]
        result.solidOutputs = { solid: result.solids }
        break
      }
      case 'roof_flat':
      case 'flat_roof':
      case 'roof_shed':
      case 'shed_roof':
      case 'roof_gable':
      case 'gable_roof':
      case 'roof_hip':
      case 'hip_roof':
      case 'roof_pyramid':
      case 'pyramid_roof':
      case 'mansard_roof':
      case 'roof_pointed':
      case 'tower_cap':
      case 'roof_dome':
      case 'dome_roof': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const hostSolids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'host')
        const hostBounds = combinedSolidBounds(hostSolids)
        const hostRoomTop = incomingEdges(graph, node.key, 'host')
          .flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.rooms ?? [])
          .reduce((max, room) => Math.max(max, room.ceilingElevation), Number.NEGATIVE_INFINITY)
        const roofPlacement = {
          baseElevation: Number.isFinite(hostRoomTop) ? hostRoomTop : (hostBounds?.max.y ?? 0),
          offsetX: 0,
          offsetZ: 0,
        }
        const roofType = canonicalRoofKind(node.kind).replace('roof_', '')
        result.solids = [{
          spec: {
            id: `${node.key}.solid`,
            sourceNodeKey: node.key,
            kind: 'roof',
            profileId: profile.profile.id,
            transform: { position: [roofPlacement.offsetX, roofPlacement.baseElevation, roofPlacement.offsetZ], rotation: [0, 0, 0], scale: [1, 1, 1] },
            params: { roofType, hostBaseElevation: roofPlacement.baseElevation },
            metadata: {},
          },
          geometry: buildRoofGeometry(node, profile, roofPlacement),
          color: '#ab5f4b',
        }]
        result.roofs = [{
          id: `${node.key}.roof`,
          sourceNodeKey: node.key,
          roofType: roofType === 'pointed' ? 'pointed' : roofType === 'dome' ? 'dome' : roofType as RoofSpec['roofType'],
          profileId: profile.profile.id,
          height: numberParam(node, 'height', 1.5),
          metadata: {
            baseElevation: roofPlacement.baseElevation,
            hostNodeKeys: hostSolids.map((solid) => solid.spec.sourceNodeKey),
          },
        }]
        break
      }
      case 'environment_output':
      case 'debug_output':
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'solids')
        result.surfaces = incomingEdges(graph, node.key, 'surfaces').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.surfaces ?? [])
        result.structureFootprints = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.structureFootprints ?? [])
        result.shellBands = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.shellBands ?? [])
        result.structuralFusions = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.structuralFusions ?? [])
        result.levels = incomingEdges(graph, node.key, 'anchors').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.levels ?? [])
        result.wallFaces = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.wallFaces ?? [])
        result.wallSegments = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.wallSegments ?? [])
        result.partitionWalls = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.partitionWalls ?? [])
        result.roomAdjacency = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.roomAdjacency ?? [])
        result.anchors = incomingEdges(graph, node.key, 'anchors').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.anchors ?? [])
        result.connectors = incomingEdges(graph, node.key, 'anchors').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.connectors ?? [])
        result.openings = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.openings ?? [])
        result.windows = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.windows ?? [])
        result.rooms = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.rooms ?? [])
        result.roofs = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.roofs ?? [])
        result.bridges = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.bridges ?? [])
        result.stairs = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.stairs ?? [])
        result.slabVoids = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.slabVoids ?? [])
        result.arrayPlacements = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.arrayPlacements ?? [])
        break
      default:
        break
    }
  }

  const outputNode = graph.nodes.find((node) => node.kind === 'environment_output') ?? graph.nodes[graph.nodes.length - 1] ?? createAssemblyNode('environment_output', 1, { x: 0, y: 0 })
  const outputResult = nextCache.nodeResults.get(outputNode.key) ?? {}
  const profiles = [...nextCache.nodeResults.values()].flatMap((result) => result.profiles?.map((entry) => entry.profile) ?? [])
  const solids = outputResult.solids ?? [...nextCache.nodeResults.values()].flatMap((result) => result.solids ?? [])
  const surfaces = outputResult.surfaces ?? [...nextCache.nodeResults.values()].flatMap((result) => result.surfaces ?? [])
  const structureFootprints = preferOutputCollection(outputResult.structureFootprints, [...nextCache.nodeResults.values()].flatMap((result) => result.structureFootprints ?? []))
  const shellBands = preferOutputCollection(outputResult.shellBands, [...nextCache.nodeResults.values()].flatMap((result) => result.shellBands ?? []))
  const structuralFusions = preferOutputCollection(outputResult.structuralFusions, [...nextCache.nodeResults.values()].flatMap((result) => result.structuralFusions ?? []))
  const levels = preferOutputCollection(outputResult.levels, [...nextCache.nodeResults.values()].flatMap((result) => result.levels ?? []))
  const wallRuns = [...nextCache.nodeResults.values()].flatMap((result) => result.wallRuns ?? [])
  const wallFaces = preferOutputCollection(outputResult.wallFaces, [...nextCache.nodeResults.values()].flatMap((result) => result.wallFaces ?? []))
  const anchors = preferOutputCollection(outputResult.anchors, [...nextCache.nodeResults.values()].flatMap((result) => result.anchors ?? []))
  const connectors = preferOutputCollection(outputResult.connectors, [...nextCache.nodeResults.values()].flatMap((result) => result.connectors ?? []))
  const openings = outputResult.openings && outputResult.openings.length > 0 ? outputResult.openings : [...nextCache.nodeResults.values()].flatMap((result) => result.openings ?? [])
  const windows = outputResult.windows && outputResult.windows.length > 0 ? outputResult.windows : [...nextCache.nodeResults.values()].flatMap((result) => result.windows ?? [])
  const rooms = preferOutputCollection(outputResult.rooms, [...nextCache.nodeResults.values()].flatMap((result) => result.rooms ?? []))
  const roofs = preferOutputCollection(outputResult.roofs, [...nextCache.nodeResults.values()].flatMap((result) => result.roofs ?? []))
  const bridges = preferOutputCollection(outputResult.bridges, [...nextCache.nodeResults.values()].flatMap((result) => result.bridges ?? []))
  const stairs = preferOutputCollection(outputResult.stairs, [...nextCache.nodeResults.values()].flatMap((result) => result.stairs ?? []))
  const slabVoids = preferOutputCollection(outputResult.slabVoids, [...nextCache.nodeResults.values()].flatMap((result) => result.slabVoids ?? []))
  const paths = [...nextCache.nodeResults.values()].flatMap((result) => result.pathSpecs ?? [])
  const arrayPlacements = preferOutputCollection(outputResult.arrayPlacements, [...nextCache.nodeResults.values()].flatMap((result) => result.arrayPlacements ?? []))
  const interiorDoorRequests = [...nextCache.nodeResults.values()].flatMap((result) => result.interiorDoorRequests ?? [])
  const wallSegmentOpeningRequests = [...nextCache.nodeResults.values()].flatMap((result) => result.wallSegmentOpeningRequests ?? [])
  const stairLayoutRequests = [...nextCache.nodeResults.values()].flatMap((result) => result.stairLayoutRequests ?? [])
  const stairConnectionRequests = [...nextCache.nodeResults.values()].flatMap((result) => result.stairConnectionRequests ?? [])

  const resolvedStairSystem = resolveZoneAdjustedStairs(
    graph,
    profiles,
    solids,
    rooms,
    levels,
    stairLayoutRequests,
    stairConnectionRequests,
    diagnostics,
  )
  const effectiveProfiles = resolvedStairSystem.profiles
  const effectiveSolids = resolvedStairSystem.solids
  const effectiveRooms = resolvedStairSystem.rooms
  const effectiveAnchors = [...anchors, ...resolvedStairSystem.anchors]
  const effectiveStairs = [
    ...stairs.filter((entry) => entry.metadata.placeholder !== true),
    ...resolvedStairSystem.stairs,
  ]
  const effectiveSlabVoids = [...slabVoids, ...resolvedStairSystem.slabVoids]

  const derivedTopology = deriveRoomTopology(effectiveRooms, effectiveProfiles, diagnostics)
  const derivedWallSolids = derivedTopology.wallSegments.map((segment) => createPartitionWallSolid(segment))
  const partitionBySegmentId = new Map(derivedTopology.partitionWalls.map((partition) => [partition.wallSegmentId, partition] as const))
  const derivedWallFaces = derivedTopology.wallSegments.map((segment) => createPartitionWallFace(segment, partitionBySegmentId.get(segment.id) ?? null))
  const topologyWallSegments = [
    ...preferOutputCollection(outputResult.wallSegments, [...nextCache.nodeResults.values()].flatMap((result) => result.wallSegments ?? [])),
    ...derivedTopology.wallSegments,
  ]
  const topologyPartitionWalls = [
    ...preferOutputCollection(outputResult.partitionWalls, [...nextCache.nodeResults.values()].flatMap((result) => result.partitionWalls ?? [])),
    ...derivedTopology.partitionWalls,
  ]
  const topologyRoomAdjacency = [
    ...preferOutputCollection(outputResult.roomAdjacency, [...nextCache.nodeResults.values()].flatMap((result) => result.roomAdjacency ?? [])),
    ...derivedTopology.roomAdjacency,
  ]
  const topologyWallFaces = [
    ...wallFaces
      .filter((face) => face.metadata.topologyOwned !== true)
      .map((face) => ({
      ...face,
      levelId: face.levelId ?? (typeof face.metadata.levelId === 'string' ? String(face.metadata.levelId) : null),
      wallRole: face.wallRole ?? 'exterior',
      ownerRoomIds: face.ownerRoomIds ?? [],
    })),
    ...derivedWallFaces,
  ]
  const stairConnectionOpenings = stairConnectionRequests.flatMap((request) => {
    const stair = effectiveStairs.find((entry) => entry.id === request.stairId)
    if (!stair) return []
    if (request.connectionMode !== 'door') {
      diagnostics.push(`Stair connection "${request.id}" uses unsupported mode "${request.connectionMode}".`)
      return []
    }
    return request.targetRoomIds.flatMap((targetRoomId) => {
      const targetRoom = effectiveRooms.find((entry) => roomLabel(entry) === targetRoomId)
      if (!targetRoom) return []
      const zoneRoomId = request.landing === 'bottom'
        ? stair.metadata.zoneRoomId
        : request.landing === 'top'
          ? (stair.metadata.topZoneRoomId ?? stair.metadata.zoneRoomId)
          : (targetRoom.levelId === stair.toLevelId ? (stair.metadata.topZoneRoomId ?? stair.metadata.zoneRoomId) : stair.metadata.zoneRoomId)
      const preferredPosition = request.connectionPlacement === 'center'
        ? null
        : request.landing === 'bottom'
          ? (Array.isArray(stair.metadata.bottomConnectionPoint) ? stair.metadata.bottomConnectionPoint as [number, number, number] : null)
          : request.landing === 'top'
            ? (Array.isArray(stair.metadata.topConnectionPoint) ? stair.metadata.topConnectionPoint as [number, number, number] : null)
            : (targetRoom.levelId === stair.toLevelId
                ? (Array.isArray(stair.metadata.topConnectionPoint) ? stair.metadata.topConnectionPoint as [number, number, number] : null)
                : (Array.isArray(stair.metadata.bottomConnectionPoint) ? stair.metadata.bottomConnectionPoint as [number, number, number] : null))
      return zoneRoomId
        ? [{
            id: `${request.id}.${targetRoomId}`,
            sourceNodeKey: request.sourceNodeKey,
            roomIds: [String(zoneRoomId), targetRoomId],
            width: request.width,
            height: request.height,
            offset: request.offset,
            preferredPosition,
            preferredWallSegmentId: request.targetWallSegmentId,
            connectionPlacement: request.connectionPlacement,
          } satisfies InteriorDoorRequest]
        : []
    })
  })
  const allInteriorOpenings = resolveInteriorDoorRequests(
    [...interiorDoorRequests, ...stairConnectionOpenings],
    topologyRoomAdjacency,
    topologyWallSegments,
  )
  const manualWallSegmentOpenings = wallSegmentOpeningRequests.flatMap((request) => {
    const segment = topologyWallSegments.find((entry) => entry.id === request.wallSegmentId)
    if (!segment) return []
    const tangent = new Vector3(segment.end[0] - segment.start[0], 0, segment.end[2] - segment.start[2]).normalize()
    const center = wallSegmentHostCenter(segment).addScaledVector(tangent, request.offset)
    return [{
      id: request.id,
      sourceNodeKey: request.sourceNodeKey,
      hostSolidId: wallSegmentHostId(segment),
      hostWallSegmentId: segment.id,
      levelId: segment.levelId,
      fromRoomId: segment.ownerRoomIds[0] ?? null,
      toRoomId: segment.ownerRoomIds[1] ?? null,
      kind: 'opening' as const,
      openingRole: request.openingRole,
      position: [center.x, segment.start[1] + request.height * 0.5, center.z] as [number, number, number],
      size: [request.width, request.height, Math.max(segment.thickness + 0.04, 0.12)] as [number, number, number],
      metadata: {},
    }]
  })
  const openingsWithTopology = remapTopologyOpenings([...openings, ...allInteriorOpenings, ...manualWallSegmentOpenings], topologyWallSegments, diagnostics)
  const windowsWithTopology = remapTopologyWindows(windows, openingsWithTopology)
  const clusteredFloors = rebuildTopologyFloorClusters(effectiveProfiles, effectiveSolids, effectiveRooms, openingsWithTopology, effectiveSlabVoids)
  const clusteredProfiles = clusteredFloors.profiles
  const clusteredSlabVoids = clusteredFloors.slabVoids
  const solidsWithTopology = [...clusteredFloors.solids, ...derivedWallSolids]
  const slabVoidsForBooleanPass = clusteredSlabVoids.filter((entry) => entry.metadata.appliedInProfile !== true)
  const solidsAfterSlabVoids = applySlabVoidsToSolids(solidsWithTopology, slabVoidsForBooleanPass, diagnostics)
  const carvedSolids = applyOpeningsToSolids(solidsAfterSlabVoids, openingsWithTopology, diagnostics, topologyWallSegments)

  const spatialDocument: SpatialDocument = {
    id: `spatial.${graph.key}`,
    graphKey: graph.key,
    profiles: clusteredProfiles,
    solids: carvedSolids.map((entry) => entry.spec),
    surfaces: surfaces.map((entry) => entry.spec),
    structureFootprints,
    shellBands,
    structuralFusions,
    levels,
    wallRuns,
    wallFaces: topologyWallFaces,
    wallSegments: topologyWallSegments,
    partitionWalls: topologyPartitionWalls,
    roomAdjacency: topologyRoomAdjacency,
    anchors: effectiveAnchors,
    connectors,
    rooms: effectiveRooms,
    openings: openingsWithTopology,
    windows: windowsWithTopology,
    roofs,
    bridges,
    stairs: effectiveStairs,
    slabVoids: clusteredSlabVoids,
    paths,
    arrayPlacements,
    diagnostics,
      metadata: { boundEnvironmentKey: graph.boundEnvironmentKey },
  }

  const parts: CompiledMeshPart[] = [
    ...carvedSolids.map((entry, index) => geometryToPart(
      `solid.${index + 1}`,
      entry.spec.sourceNodeKey,
      'solid',
      entry.geometry,
      entry.color,
      {
        solidKind: entry.spec.kind,
        profileId: entry.spec.profileId,
        ...entry.spec.params,
        ...entry.spec.metadata,
      },
    )),
    ...surfaces.map((entry, index) => geometryToPart(`surface.${index + 1}`, entry.spec.sourceNodeKey, 'surface', entry.geometry, entry.color, { surfaceKind: entry.spec.kind })),
    ...profiles.map((profile, index) => {
      const points = profile.loops.flatMap((loop) => segmentsToPolyline(loop).map((point) => new Vector3(point.x, 0.02, point.y)))
      return linePart(`profile.${index + 1}`, graph.key, points, '#5eead4', { debugKind: 'profile' })
    }),
    ...structureFootprints.map((footprint, index) => {
      const points = boundaryLoopPoints(footprint.outerLoop).map((point) => new Vector3(point.x, Number(footprint.metadata.baseElevation ?? 0) + 0.04, point.y))
      return linePart(`footprint.${index + 1}`, footprint.sourceNodeKey, points, '#22c55e', { debugKind: 'structure_footprint', shapeKind: footprint.shapeKind })
    }),
    ...levels.map((level, index) =>
      linePart(`level.${index + 1}`, level.sourceNodeKey, [new Vector3(-1.2, level.elevation, 0), new Vector3(1.2, level.elevation, 0)], '#f59e0b', { label: level.label }),
    ),
    ...topologyWallFaces.map((face, index) =>
      linePart(`wallface.${index + 1}`, face.sourceNodeKey, [new Vector3(face.start[0], face.start[1], face.start[2]), new Vector3(face.end[0], face.end[1], face.end[2])], '#f97316', { wallFaceId: face.id }),
    ),
    ...effectiveAnchors.map((anchor, index) => {
      const geometry = new SphereGeometry(0.12, 8, 8)
      geometry.translate(anchor.position[0], anchor.position[1], anchor.position[2])
      return geometryToPart(`anchor.${index + 1}`, anchor.sourceNodeKey, 'debug', geometry, '#fbbf24', { label: anchor.label })
    }),
    ...openingsWithTopology.map((opening, index) => {
      const geometry = new BoxGeometry(opening.size[0], opening.size[1], Math.max(opening.size[2], 0.08))
      geometry.translate(opening.position[0], opening.position[1], opening.position[2])
      return geometryToPart(`opening.${index + 1}`, opening.sourceNodeKey, 'debug', geometry, '#60a5fa', { openingId: opening.id })
    }),
    ...topologyWallSegments.map((segment, index) =>
      linePart(`wallsegment.${index + 1}`, segment.sourceNodeKeys[0] ?? graph.key, [new Vector3(segment.start[0], segment.start[1], segment.start[2]), new Vector3(segment.end[0], segment.end[1], segment.end[2])], segment.wallRole === 'partition' ? '#c084fc' : '#f97316', { wallSegmentId: segment.id }),
    ),
    ...connectors
      .map((connector, index) => {
        const from = effectiveAnchors.find((anchor) => anchor.id === connector.fromAnchorId)
        const to = effectiveAnchors.find((anchor) => anchor.id === connector.toAnchorId)
        if (!from || !to) return null
        return linePart(
          `connector.${index + 1}`,
          connector.sourceNodeKey,
          [
            new Vector3(from.position[0], from.position[1], from.position[2]),
            new Vector3(to.position[0], to.position[1], to.position[2]),
          ],
          '#fb7185',
          { connectorId: connector.id },
        )
      })
      .filter((part): part is CompiledMeshPart => part !== null),
  ]

  const compiledModel: CompiledEnvironmentModel = {
    id: `compiled.${graph.key}`,
    graphKey: graph.key,
    generatedAt: new Date().toISOString(),
    parts,
    levels,
    wallFaces: topologyWallFaces,
    wallSegments: topologyWallSegments,
    partitionWalls: topologyPartitionWalls,
    roomAdjacency: topologyRoomAdjacency,
    anchors: effectiveAnchors,
    openings: openingsWithTopology,
    windows: windowsWithTopology,
    bridges,
    stairs: effectiveStairs,
    slabVoids: clusteredSlabVoids,
    rooms: effectiveRooms,
    diagnostics,
    metadata: {
      dsl: environmentAssemblyGraphToDsl(graph),
      structuralFusionCount: structuralFusions.length,
    },
  }

  return {
    spatialDocument,
    compiledModel,
    diagnostics,
    dsl: environmentAssemblyGraphToDsl(graph),
    cache: nextCache,
  }
}

function segmentsToPolyline(loop: BoundaryLoop) {
  const points: Vector2[] = []

  for (const segment of loop.segments) {
    if (segment.type === 'line') {
      if (points.length === 0) points.push(new Vector2(segment.from.x, segment.from.y))
      points.push(new Vector2(segment.to.x, segment.to.y))
      continue
    }

    if (segment.type === 'arc') {
      const curve = new ArcCurve(segment.center.x, segment.center.y, segment.radius, segment.startAngle, segment.endAngle, segment.clockwise)
      const curvePoints = curve.getPoints(16)
      if (points.length === 0) points.push(curvePoints[0])
      points.push(...curvePoints.slice(1))
      continue
    }

    const curve = new CatmullRomCurve3(segment.points.map((point) => new Vector3(point.x, 0, point.y)), segment.closed)
    const curvePoints = curve.getPoints(Math.max(8, segment.points.length * 4)).map((point) => new Vector2(point.x, point.z))
    if (points.length === 0) points.push(curvePoints[0])
    points.push(...curvePoints.slice(1))
  }

  return points
}
