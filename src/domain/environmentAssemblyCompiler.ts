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
  type PathSpec,
  type Profile2D,
  type RoofSpec,
  type RoomVolume,
  type ShellBandSpec,
  type SolidSpec,
  type StairRunSpec,
  type SpatialDocument,
  type StructuralFusionSpec,
  type StructureFootprint,
  type SurfaceSpec,
  type WallFaceSpec,
  type WallRunSpec,
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
  roofs?: RoofSpec[]
  bridges?: BridgeSpec[]
  stairs?: StairRunSpec[]
  pathSpecs?: PathSpec[]
  arrayPlacements?: ArrayPlacementSpec[]
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
  return profile.outer.map((point, index) => {
    const next = profile.outer[(index + 1) % profile.outer.length]
    const midpoint = new Vector3((point.x + next.x) * 0.5, baseElevation + height * 0.5, (point.y + next.y) * 0.5)
    const direction = new Vector3(next.x - point.x, 0, next.y - point.y).normalize()
    const normal = new Vector3(-direction.z, 0, direction.x).normalize()
    return {
      id: `${node.key}.wall_face_${index + 1}`,
      sourceNodeKey: node.key,
      wallRunId,
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
  return new Vector3(face.center[0], face.center[1], face.center[2])
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
    solids: [shellSolid, ...(floorSolid ? [floorSolid] : [])],
    solidOutputs: {
      solid: [shellSolid, ...(floorSolid ? [floorSolid] : [])],
      shell: [shellSolid],
      ...(floorSolid ? { floor: [floorSolid] } : {}),
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
      name: `${node.title} Band ${index + 1}`,
      profileId: floorSource.profile.id,
      floorElevation: band.baseElevation,
      ceilingElevation: band.topElevation,
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
  target.pathSpecs = [...(target.pathSpecs ?? []), ...(source.pathSpecs ?? [])]
  target.arrayPlacements = [...(target.arrayPlacements ?? []), ...(source.arrayPlacements ?? [])]
  if (source.solidOutputs) {
    const nextOutputs: Record<string, RuntimeSolid[]> = { ...(target.solidOutputs ?? {}) }
    for (const [outputKey, solids] of Object.entries(source.solidOutputs)) {
      nextOutputs[outputKey] = [...(nextOutputs[outputKey] ?? []), ...solids]
    }
    target.solidOutputs = nextOutputs
  }
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
) {
  const fusion = resolveStructuralUnion(shells, fusionId)
  if (!fusion) return false

  result.structureFootprints = [...(result.structureFootprints ?? []), ...fusion.footprints]
  result.shellBands = [...(result.shellBands ?? []), ...fusion.shellBands]
  result.structuralFusions = [...(result.structuralFusions ?? []), ...fusion.fusions]
  result.structuralShells = []

  fusion.bands.forEach((band, index) => {
    mergeNodeResults(result, compileShellBandToResult(node, band, index, color))
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
          label: stringParam(node, 'label', node.title),
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
          label: `Level ${index + 1}`,
          elevation: baseElevation + index * levelHeight,
          height: levelHeight,
          metadata: { index: index + 1 },
        }))
        result.anchors = result.levels.map((level, index) => createAnchor(node.key, `Level ${index + 1}`, new Vector3(0, level.elevation, 0)))
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
      case 'wall_shell':
      case 'room':
      case 'room_shell': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const level = collectIncomingLevels(graph, node, nextCache.nodeResults)[0]
        const baseElevation = level?.elevation ?? 0
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
              metadata: {},
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
              metadata: {},
            },
            geometry: innerGeometry,
            color: '#7f92a6',
          },
          SUBTRACTION,
          node,
          diagnostics,
        )
        const floorThickness = numberParam(node, 'floorThickness', 0.18)
        const floorGeometry = extrudeProfile(profile, floorThickness)
        floorGeometry.translate(0, baseElevation, 0)
        const floorSolid = node.kind === 'room' || node.kind === 'room_shell'
          ? {
              spec: {
                id: `${node.key}.floor`,
                sourceNodeKey: node.key,
                kind: 'slab',
                profileId: profile.profile.id,
                transform: { position: [0, baseElevation, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                params: { thickness: floorThickness },
                metadata: {},
              },
              geometry: floorGeometry,
              color: '#596979',
            } satisfies RuntimeSolid
          : null
        result.solids = [
          ...(wallGeometry ? [wallGeometry] : []),
          ...(floorSolid ? [floorSolid] : []),
        ]
        result.solidOutputs = {
          solid: result.solids,
          shell: wallGeometry ? [wallGeometry] : [],
          ...(floorSolid ? { floor: [floorSolid] } : {}),
        }
        result.structuralShells = [createStructuralShellFromProfile(
          node,
          profile,
          wallThickness,
          floorThickness,
          baseElevation,
          baseElevation + wallHeight,
          Boolean(floorSolid),
        )]
        result.structureFootprints = result.structuralShells.map((shell) => ({
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
        result.shellBands = result.structuralShells.map((shell) => ({
          id: `${node.key}.shell_band`,
          sourceNodeKeys: [node.key],
          outerLoop: {
            id: `${node.key}.shell_band.outer`,
            closed: true,
            kind: 'outer',
            segments: pointsToSegments(shell.outer),
          },
          innerLoops: shell.inner.length >= 3
            ? [{
                id: `${node.key}.shell_band.inner`,
                closed: true,
                kind: 'hole',
                segments: pointsToSegments(shell.inner),
              }]
            : [],
          baseElevation,
          topElevation: baseElevation + wallHeight,
          floorAtBase: Boolean(floorSolid),
          metadata: {
            derivedKind: 'original',
            wallThickness,
            floorThickness,
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
          metadata: {},
        }]
        result.wallFaces = wallFacesFromProfile(node, profile, wallHeight, baseElevation)
        result.rooms = node.kind === 'room' || node.kind === 'room_shell'
          ? [{
              id: `${node.key}.room`,
              sourceNodeKey: node.key,
              name: node.title,
              profileId: profile.profile.id,
              floorElevation: baseElevation,
              ceilingElevation: baseElevation + wallHeight,
              metadata: {},
            }]
          : []
        break
      }
      case 'floor_plate':
      case 'floor_fill':
      case 'ceiling_fill':
      case 'mezzanine':
      case 'mezzanine_ring': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const thickness = numberParam(node, 'thickness', 0.18)
        const elevation = numberParam(node, 'elevation', node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 1.5 : node.kind === 'ceiling_fill' ? 3 : 0)
        const geometry = extrudeProfile(profile, thickness)
        geometry.translate(0, elevation, 0)
        result.surfaces = [{
          spec: {
            id: `${node.key}.surface`,
            sourceNodeKey: node.key,
            kind: node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 'mezzanine' : node.kind === 'ceiling_fill' ? 'roof' : 'floor',
            profileId: profile.profile.id,
            elevation,
            thickness,
            metadata: {},
          },
          geometry,
          color: node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? '#95a56f' : node.kind === 'ceiling_fill' ? '#6d7078' : '#5b6c7c',
        }]
        result.anchors = [createAnchor(node.key, node.kind === 'mezzanine' || node.kind === 'mezzanine_ring' ? 'Mezzanine Edge' : node.kind === 'ceiling_fill' ? 'Ceiling Center' : 'Floor Center', new Vector3(0, elevation, 0))]
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
          fromLevelId: null,
          toLevelId: null,
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
          fromLevelId: null,
          toLevelId: null,
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
          fromLevelId: null,
          toLevelId: null,
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
          fromLevelId: null,
          toLevelId: null,
          riseCount: stepCount,
          metadata: {},
        }]
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
        const wallFace = collectIncomingWallFaces(graph, node, nextCache.nodeResults)[0]
        const width = numberParam(node, 'width', node.kind === 'doorway' || node.kind === 'door_opening' ? 1.1 : 1.4)
        const height = numberParam(node, 'height', node.kind === 'window_opening' || node.kind === 'opening_array' ? 1.2 : 2.2)
        const sillHeight = numberParam(node, 'sillHeight', 0.9)
        const count = Math.max(1, Math.round(numberParam(node, 'count', 1)))
        const spacing = numberParam(node, 'spacing', 2.2)
        const basePosition = openingPositionFromWallFace(wallFace, new Vector3(0, height / 2, 0))
        const normal = wallFace ? new Vector3(wallFace.normal[0], wallFace.normal[1], wallFace.normal[2]) : new Vector3(1, 0, 0)
        const tangent = new Vector3(-normal.z, 0, normal.x).normalize()
        result.openings = Array.from({ length: count }, (_, index) => {
          const offset = (index - (count - 1) / 2) * spacing
          const position = basePosition.clone().addScaledVector(tangent, offset)
          position.y = node.kind === 'window_opening' ? sillHeight + height * 0.5 : position.y
          return {
            id: `${node.key}.opening_${index + 1}`,
            sourceNodeKey: node.key,
            hostSolidId: host?.spec.id ?? null,
            kind: node.kind === 'doorway' || node.kind === 'door_opening' ? 'doorway' : 'opening',
            position: [position.x, position.y, position.z],
            size: [width, height, 0.2],
            metadata: { wallFaceId: wallFace?.id ?? null, openingIndex: index + 1, openingKind: node.kind },
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
            kind: 'opening',
            position: from.position,
            size: [numberParam(node, 'width', 1.8), numberParam(node, 'height', 2.4), 0.2],
            metadata: { bridgeSide: 'from' },
          },
          {
            id: `${node.key}.opening_b`,
            sourceNodeKey: node.key,
            hostSolidId: null,
            kind: 'opening',
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
        const profileBounds = new Box3()
        for (const point of profile.outer) profileBounds.expandByPoint(new Vector3(point.x, 0, point.y))
        const profileCenter = profileBounds.getCenter(new Vector3())
        const hostCenter = hostBounds?.getCenter(new Vector3()) ?? profileCenter
        const roofPlacement = {
          baseElevation: hostBounds?.max.y ?? 0,
          offsetX: hostCenter.x - profileCenter.x,
          offsetZ: hostCenter.z - profileCenter.z,
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
        result.anchors = incomingEdges(graph, node.key, 'anchors').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.anchors ?? [])
        result.connectors = incomingEdges(graph, node.key, 'anchors').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.connectors ?? [])
        result.openings = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.openings ?? [])
        result.windows = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.windows ?? [])
        result.rooms = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.rooms ?? [])
        result.roofs = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.roofs ?? [])
        result.bridges = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.bridges ?? [])
        result.stairs = incomingEdges(graph, node.key, 'solids').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.stairs ?? [])
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
  const structureFootprints = outputResult.structureFootprints ?? [...nextCache.nodeResults.values()].flatMap((result) => result.structureFootprints ?? [])
  const shellBands = outputResult.shellBands ?? [...nextCache.nodeResults.values()].flatMap((result) => result.shellBands ?? [])
  const structuralFusions = outputResult.structuralFusions ?? [...nextCache.nodeResults.values()].flatMap((result) => result.structuralFusions ?? [])
  const levels = outputResult.levels ?? [...nextCache.nodeResults.values()].flatMap((result) => result.levels ?? [])
  const wallRuns = [...nextCache.nodeResults.values()].flatMap((result) => result.wallRuns ?? [])
  const wallFaces = outputResult.wallFaces ?? [...nextCache.nodeResults.values()].flatMap((result) => result.wallFaces ?? [])
  const anchors = outputResult.anchors ?? [...nextCache.nodeResults.values()].flatMap((result) => result.anchors ?? [])
  const connectors = outputResult.connectors ?? [...nextCache.nodeResults.values()].flatMap((result) => result.connectors ?? [])
  const openings = outputResult.openings ?? [...nextCache.nodeResults.values()].flatMap((result) => result.openings ?? [])
  const windows = outputResult.windows ?? [...nextCache.nodeResults.values()].flatMap((result) => result.windows ?? [])
  const rooms = outputResult.rooms ?? [...nextCache.nodeResults.values()].flatMap((result) => result.rooms ?? [])
  const roofs = outputResult.roofs ?? [...nextCache.nodeResults.values()].flatMap((result) => result.roofs ?? [])
  const bridges = outputResult.bridges ?? [...nextCache.nodeResults.values()].flatMap((result) => result.bridges ?? [])
  const stairs = outputResult.stairs ?? [...nextCache.nodeResults.values()].flatMap((result) => result.stairs ?? [])
  const paths = [...nextCache.nodeResults.values()].flatMap((result) => result.pathSpecs ?? [])
  const arrayPlacements = outputResult.arrayPlacements ?? [...nextCache.nodeResults.values()].flatMap((result) => result.arrayPlacements ?? [])

  const spatialDocument: SpatialDocument = {
    id: `spatial.${graph.key}`,
    graphKey: graph.key,
    profiles,
    solids: solids.map((entry) => entry.spec),
    surfaces: surfaces.map((entry) => entry.spec),
    structureFootprints,
    shellBands,
    structuralFusions,
    levels,
    wallRuns,
    wallFaces,
    anchors,
    connectors,
    rooms,
    openings,
    windows,
    roofs,
    bridges,
    stairs,
    paths,
    arrayPlacements,
    diagnostics,
    metadata: { boundEnvironmentKey: graph.boundEnvironmentKey },
  }

  const parts: CompiledMeshPart[] = [
    ...solids.map((entry, index) => geometryToPart(
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
    ...wallFaces.map((face, index) =>
      linePart(`wallface.${index + 1}`, face.sourceNodeKey, [new Vector3(face.start[0], face.start[1], face.start[2]), new Vector3(face.end[0], face.end[1], face.end[2])], '#f97316', { wallFaceId: face.id }),
    ),
    ...anchors.map((anchor, index) => {
      const geometry = new SphereGeometry(0.12, 8, 8)
      geometry.translate(anchor.position[0], anchor.position[1], anchor.position[2])
      return geometryToPart(`anchor.${index + 1}`, anchor.sourceNodeKey, 'debug', geometry, '#fbbf24', { label: anchor.label })
    }),
    ...openings.map((opening, index) => {
      const geometry = new BoxGeometry(opening.size[0], opening.size[1], Math.max(opening.size[2], 0.08))
      geometry.translate(opening.position[0], opening.position[1], opening.position[2])
      return geometryToPart(`opening.${index + 1}`, opening.sourceNodeKey, 'debug', geometry, '#60a5fa', { openingId: opening.id })
    }),
    ...connectors
      .map((connector, index) => {
        const from = anchors.find((anchor) => anchor.id === connector.fromAnchorId)
        const to = anchors.find((anchor) => anchor.id === connector.toAnchorId)
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
    wallFaces,
    anchors,
    openings,
    windows,
    bridges,
    stairs,
    rooms,
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
