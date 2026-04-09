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
  type Anchor,
  type AssemblyEdgeDefinition,
  type AssemblyGraphDefinition,
  type AssemblyNodeDefinition,
  type BoundaryLoop,
  type CompiledEnvironmentModel,
  type CompiledMeshPart,
  type Connector,
  type CurveSegment,
  type OpeningSpec,
  type Profile2D,
  type RoofSpec,
  type RoomVolume,
  type SolidSpec,
  type SpatialDocument,
  type SurfaceSpec,
} from './environmentAssembly'

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
  surfaces?: RuntimeSurface[]
  anchors?: Anchor[]
  connectors?: Connector[]
  openings?: OpeningSpec[]
  rooms?: RoomVolume[]
  roofs?: RoofSpec[]
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
  const shape = new Shape(profile.outer)
  for (const holePoints of profile.holes) {
    const hole = new Shape(holePoints)
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
  return edges.flatMap((edge) => results.get(edge.source.nodeKey)?.solids ?? [])
}

function collectIncomingAnchors(graph: AssemblyGraphDefinition, node: AssemblyNodeDefinition, results: Map<string, RuntimeNodeResult>, portId: string) {
  return incomingEdges(graph, node.key, portId).flatMap((edge) => results.get(edge.source.nodeKey)?.anchors ?? [])
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

function booleanCombine(a: RuntimeSolid, b: RuntimeSolid, operation: typeof ADDITION | typeof SUBTRACTION | typeof INTERSECTION, node: AssemblyNodeDefinition, diagnostics: string[]) {
  try {
    const brushA = new Brush(normalizeGeometry(a.geometry))
    const brushB = new Brush(normalizeGeometry(b.geometry))
    brushA.updateMatrixWorld()
    brushB.updateMatrixWorld()
    const result = evaluator.evaluate(brushA, brushB, operation)
    result.geometry.computeVertexNormals()
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
      geometry: result.geometry,
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

function buildRoofGeometry(
  node: AssemblyNodeDefinition,
  profile: RuntimeProfile,
  placement: {
    baseElevation: number
    offsetX: number
    offsetZ: number
  },
) {
  const bounds = new Box3()
  for (const point of profile.outer) bounds.expandByPoint(new Vector3(point.x, 0, point.y))
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const height = numberParam(node, 'height', node.kind === 'roof_flat' ? 0.3 : 1.5)

  if (node.kind === 'roof_flat') {
    const geometry = extrudeProfile(profile, height)
    geometry.translate(placement.offsetX, placement.baseElevation, placement.offsetZ)
    return geometry
  }

  if (
    node.kind === 'roof_shed'
    || node.kind === 'roof_gable'
    || node.kind === 'roof_hip'
    || node.kind === 'roof_pyramid'
    || node.kind === 'roof_pointed'
  ) {
    const geometry = extrudeProfile(profile, Math.max(height, 0.2))
    const position = geometry.getAttribute('position')
    const ridgeAlongX = size.x >= size.z
    const halfWidth = Math.max(size.x * 0.5, 0.0001)
    const halfDepth = Math.max(size.z * 0.5, 0.0001)
    const topThreshold = Math.max(height - 0.001, 0.001)

    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index)
      if (y < topThreshold) continue

      let x = position.getX(index)
      let z = position.getZ(index)
      let nextY = y

      if (node.kind === 'roof_shed') {
        const normalized = ridgeAlongX
          ? (z - center.z) / halfDepth
          : (x - center.x) / halfWidth
        const t = (normalized + 1) * 0.5
        nextY = Math.max(0.06, Math.min(height, t * height))
      } else if (node.kind === 'roof_gable') {
        if (ridgeAlongX) z = center.z
        else x = center.x
      } else if (node.kind === 'roof_hip') {
        x = center.x + (x - center.x) * 0.28
        z = center.z + (z - center.z) * 0.28
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

  if (node.kind === 'roof_dome') {
    const radius = Math.max(Math.max(size.x, size.z) * 0.5, 0.2)
    const geometry = new SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    geometry.scale(size.x > 0 ? size.x / (radius * 2) : 1, Math.max(height / radius, 0.2), size.z > 0 ? size.z / (radius * 2) : 1)
    geometry.translate(center.x + placement.offsetX, placement.baseElevation, center.z + placement.offsetZ)
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
  graph: AssemblyGraphDefinition,
  existingCache: AssemblyCompileCache = createAssemblyCompileCache(),
): AssemblyCompileResult {
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
      case 'polyline':
      case 'spline':
        result.paths = [createPathFromPoints(pointsParam(node))]
        break
      case 'arc': {
        const radius = numberParam(node, 'radius', 4)
        const startAngle = numberParam(node, 'startAngle', 0)
        const endAngle = numberParam(node, 'endAngle', 180)
        const curve = new ArcCurve(0, 0, radius, (startAngle * Math.PI) / 180, (endAngle * Math.PI) / 180, false)
        result.paths = [{ points: curve.getPoints(32).map((point) => new Vector3(point.x, 0, point.y)) }]
        break
      }
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
      case 'hole_loop': {
        const profiles = collectIncomingProfiles(graph, node, nextCache.nodeResults)
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
      case 'wall_shell':
      case 'room': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const wallHeight = numberParam(node, 'height', 3)
        const wallThickness = numberParam(node, 'wallThickness', numberParam(node, 'thickness', 0.2))
        const outerGeometry = extrudeProfile(profile, wallHeight)
        const inset = insetProfile(profile, wallThickness)
        const innerGeometry = extrudeProfile(inset, wallHeight + 0.02)
        const wallGeometry = booleanCombine(
          {
            spec: {
              id: `${node.key}.outer`,
              sourceNodeKey: node.key,
              kind: 'wall_shell',
              profileId: profile.profile.id,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
        result.solids = [
          ...(wallGeometry ? [wallGeometry] : []),
          ...(node.kind === 'room'
            ? [{
                spec: {
                  id: `${node.key}.floor`,
                  sourceNodeKey: node.key,
                  kind: 'slab',
                  profileId: profile.profile.id,
                  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                  params: { thickness: floorThickness },
                  metadata: {},
                },
                geometry: floorGeometry,
                color: '#596979',
              } satisfies RuntimeSolid]
            : []),
        ]
        const box = new Box3()
        for (const point of profile.outer) box.expandByPoint(new Vector3(point.x, 0, point.y))
        const size = box.getSize(new Vector3())
        const center = box.getCenter(new Vector3())
        result.anchors = [
          createAnchor(node.key, 'Entry', new Vector3(center.x + size.x * 0.5, 0, center.z)),
          createAnchor(node.key, 'Center', new Vector3(center.x, 0, center.z)),
        ]
        result.rooms = node.kind === 'room'
          ? [{
              id: `${node.key}.room`,
              sourceNodeKey: node.key,
              name: node.title,
              profileId: profile.profile.id,
              floorElevation: 0,
              ceilingElevation: wallHeight,
              metadata: {},
            }]
          : []
        break
      }
      case 'floor_plate':
      case 'mezzanine': {
        const profile = collectIncomingProfiles(graph, node, nextCache.nodeResults)[0]
        if (!profile) break
        const thickness = numberParam(node, 'thickness', 0.18)
        const elevation = numberParam(node, 'elevation', node.kind === 'mezzanine' ? 1.5 : 0)
        const geometry = extrudeProfile(profile, thickness)
        geometry.translate(0, elevation, 0)
        result.surfaces = [{
          spec: {
            id: `${node.key}.surface`,
            sourceNodeKey: node.key,
            kind: node.kind === 'mezzanine' ? 'mezzanine' : 'floor',
            profileId: profile.profile.id,
            elevation,
            thickness,
            metadata: {},
          },
          geometry,
          color: node.kind === 'mezzanine' ? '#95a56f' : '#5b6c7c',
        }]
        result.anchors = [createAnchor(node.key, node.kind === 'mezzanine' ? 'Mezzanine Edge' : 'Floor Center', new Vector3(0, elevation, 0))]
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
      case 'doorway': {
        const host = collectIncomingSolids(graph, node, nextCache.nodeResults, 'host')[0]
        const width = numberParam(node, 'width', node.kind === 'doorway' ? 1.1 : 1.4)
        const height = numberParam(node, 'height', 2.2)
        const position = new Vector3(0, height / 2, 0)
        result.openings = [{
          id: `${node.key}.opening`,
          sourceNodeKey: node.key,
          hostSolidId: host?.spec.id ?? null,
          kind: node.kind === 'doorway' ? 'doorway' : 'opening',
          position: [position.x, position.y, position.z],
          size: [width, height, 0.2],
          metadata: {},
        }]
        result.anchors = [createAnchor(node.key, 'Opening Anchor', position)]
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
      case 'ribbon_path':
      case 'fence_along_path':
      case 'wall_along_path':
      case 'tiled_array_along_path': {
        const path = collectIncomingPaths(graph, node, nextCache.nodeResults)[0]
        if (!path || path.points.length < 2) break
        if (node.kind === 'ribbon_path') {
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
      case 'union':
      case 'difference':
      case 'intersect': {
        const a = collectIncomingSolids(graph, node, nextCache.nodeResults, 'a')[0]
        const b = collectIncomingSolids(graph, node, nextCache.nodeResults, 'b')[0]
        if (!a || !b) break
        const op = node.kind === 'union' ? ADDITION : node.kind === 'difference' ? SUBTRACTION : INTERSECTION
        const combined = booleanCombine(a, b, op, node, diagnostics)
        result.solids = combined ? [combined] : []
        break
      }
      case 'transform':
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source').map((solid) => transformedSolid(solid, node))
        break
      case 'mirror': {
        const axis = stringParam(node, 'axis', 'x')
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults, 'source').map((solid) => {
          const scale = new Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1)
          const matrix = new Matrix4().makeScale(scale.x, scale.y, scale.z)
          return cloneSolid(solid, cloneGeometryWithMatrix(solid.geometry, matrix), { mirroredAxis: axis })
        })
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
        break
      }
      case 'roof_flat':
      case 'roof_shed':
      case 'roof_gable':
      case 'roof_hip':
      case 'roof_pyramid':
      case 'roof_pointed':
      case 'roof_dome': {
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
        const roofType = node.kind.replace('roof_', '')
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
        result.solids = collectIncomingSolids(graph, node, nextCache.nodeResults)
        result.surfaces = incomingEdges(graph, node.key, 'surfaces').flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.surfaces ?? [])
        result.anchors = incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.anchors ?? [])
        result.connectors = incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.connectors ?? [])
        result.openings = incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.openings ?? [])
        result.rooms = incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.rooms ?? [])
        result.roofs = incomingEdges(graph, node.key).flatMap((edge) => nextCache.nodeResults.get(edge.source.nodeKey)?.roofs ?? [])
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
  const anchors = outputResult.anchors ?? [...nextCache.nodeResults.values()].flatMap((result) => result.anchors ?? [])
  const connectors = outputResult.connectors ?? [...nextCache.nodeResults.values()].flatMap((result) => result.connectors ?? [])
  const openings = outputResult.openings ?? [...nextCache.nodeResults.values()].flatMap((result) => result.openings ?? [])
  const rooms = outputResult.rooms ?? [...nextCache.nodeResults.values()].flatMap((result) => result.rooms ?? [])
  const roofs = outputResult.roofs ?? [...nextCache.nodeResults.values()].flatMap((result) => result.roofs ?? [])

  const spatialDocument: SpatialDocument = {
    id: `spatial.${graph.key}`,
    graphKey: graph.key,
    profiles,
    solids: solids.map((entry) => entry.spec),
    surfaces: surfaces.map((entry) => entry.spec),
    anchors,
    connectors,
    rooms,
    openings,
    roofs,
    diagnostics,
    metadata: { boundEnvironmentKey: graph.boundEnvironmentKey },
  }

  const parts: CompiledMeshPart[] = [
    ...solids.map((entry, index) => geometryToPart(`solid.${index + 1}`, entry.spec.sourceNodeKey, 'solid', entry.geometry, entry.color, { solidKind: entry.spec.kind })),
    ...surfaces.map((entry, index) => geometryToPart(`surface.${index + 1}`, entry.spec.sourceNodeKey, 'surface', entry.geometry, entry.color, { surfaceKind: entry.spec.kind })),
    ...profiles.map((profile, index) => {
      const points = profile.loops.flatMap((loop) => segmentsToPolyline(loop).map((point) => new Vector3(point.x, 0.02, point.y)))
      return linePart(`profile.${index + 1}`, graph.key, points, '#5eead4', { debugKind: 'profile' })
    }),
    ...anchors.map((anchor, index) => {
      const geometry = new SphereGeometry(0.12, 8, 8)
      geometry.translate(anchor.position[0], anchor.position[1], anchor.position[2])
      return geometryToPart(`anchor.${index + 1}`, anchor.sourceNodeKey, 'debug', geometry, '#fbbf24', { label: anchor.label })
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
    anchors,
    openings,
    rooms,
    diagnostics,
    metadata: { dsl: environmentAssemblyGraphToDsl(graph) },
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
