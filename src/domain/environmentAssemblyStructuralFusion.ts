import { Vector2 } from 'three'

import type {
  BoundaryLoop,
  ShellBandSpec,
  StructureFootprint,
  StructuralFusionSpec,
} from './environmentAssembly.ts'

export type StructuralShellInput = {
  id: string
  sourceNodeKey: string
  outer: Vector2[]
  inner: Vector2[]
  baseElevation: number
  topElevation: number
  floorAtBase: boolean
  shapeKind: StructureFootprint['shapeKind']
  metadata: Record<string, unknown>
}

export type StructuralShellBandResult = {
  id: string
  sourceNodeKeys: string[]
  outer: Vector2[]
  inner: Vector2[]
  baseElevation: number
  topElevation: number
  floorAtBase: boolean
  metadata: Record<string, unknown>
}

export type StructuralFusionResult = {
  bands: StructuralShellBandResult[]
  footprints: StructureFootprint[]
  shellBands: ShellBandSpec[]
  fusions: StructuralFusionSpec[]
  diagnostics: string[]
}

const EPSILON = 1e-5
const ROUND_SAMPLE_COUNT = 96

function cloneLoop(points: Vector2[]) {
  return points.map((point) => point.clone())
}

function normalizeLoop(points: Vector2[]) {
  const filtered = points.filter((point, index) => index === 0 || point.distanceToSquared(points[index - 1]) > EPSILON * EPSILON)
  if (filtered.length >= 2 && filtered[0].distanceToSquared(filtered[filtered.length - 1]) <= EPSILON * EPSILON) {
    filtered.pop()
  }
  return filtered
}

function averagePoint(points: Vector2[]) {
  return points.reduce((sum, point) => sum.add(point.clone()), new Vector2()).multiplyScalar(1 / Math.max(points.length, 1))
}

function signedArea(points: Vector2[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

function ensureCounterClockwise(points: Vector2[]) {
  const normalized = normalizeLoop(points)
  return signedArea(normalized) >= 0 ? normalized : [...normalized].reverse()
}

function estimateCircularLoop(points: Vector2[]) {
  const center = averagePoint(points)
  const radii = points.map((point) => point.distanceTo(center))
  const radius = radii.reduce((sum, value) => sum + value, 0) / Math.max(radii.length, 1)
  return { center, radius }
}

function sampleCircle(center: Vector2, radius: number, count = ROUND_SAMPLE_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return new Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius)
  })
}

function fusionLoop(shell: StructuralShellInput, points: Vector2[]) {
  if (shell.shapeKind !== 'round' || points.length < 8) return ensureCounterClockwise(points)
  const { center, radius } = estimateCircularLoop(points)
  return sampleCircle(center, radius)
}

function normalizedShell(shell: StructuralShellInput): StructuralShellInput {
  return {
    ...shell,
    outer: fusionLoop(shell, shell.outer),
    inner: fusionLoop(shell, shell.inner),
  }
}

function midpoint(a: Vector2, b: Vector2) {
  return new Vector2((a.x + b.x) * 0.5, (a.y + b.y) * 0.5)
}

function pointInPolygon(point: Vector2, polygon: Vector2[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function segmentIntersection(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2) {
  const r = a2.clone().sub(a1)
  const s = b2.clone().sub(b1)
  const denominator = r.x * s.y - r.y * s.x
  if (Math.abs(denominator) <= EPSILON) return null
  const qp = b1.clone().sub(a1)
  const t = (qp.x * s.y - qp.y * s.x) / denominator
  const u = (qp.x * r.y - qp.y * r.x) / denominator
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null
  return {
    t,
    u,
    point: a1.clone().add(r.multiplyScalar(t)),
  }
}

function splitPolygonSegments(subject: Vector2[], clip: Vector2[]) {
  return subject.map((start, index) => {
    const end = subject[(index + 1) % subject.length]
    const intersections = [{ t: 0, point: start.clone() }, { t: 1, point: end.clone() }]
    for (let clipIndex = 0; clipIndex < clip.length; clipIndex += 1) {
      const clipStart = clip[clipIndex]
      const clipEnd = clip[(clipIndex + 1) % clip.length]
      const intersection = segmentIntersection(start, end, clipStart, clipEnd)
      if (!intersection) continue
      intersections.push({ t: intersection.t, point: intersection.point })
    }
    intersections.sort((left, right) => left.t - right.t)
    return intersections
  })
}

function boundaryPiecesOutside(subject: Vector2[], clip: Vector2[]) {
  const segments: Array<{ start: Vector2; end: Vector2 }> = []
  for (const splitPoints of splitPolygonSegments(subject, clip)) {
    for (let index = 0; index < splitPoints.length - 1; index += 1) {
      const start = splitPoints[index].point
      const end = splitPoints[index + 1].point
      if (start.distanceToSquared(end) <= EPSILON * EPSILON) continue
      if (!pointInPolygon(midpoint(start, end), clip)) {
        segments.push({ start, end })
      }
    }
  }
  return segments
}

function orderedLoopFromPieces(pieces: Array<{ start: Vector2; end: Vector2 }>) {
  if (pieces.length === 0) return null
  const remaining = [...pieces]
  const loop = [remaining[0].start.clone(), remaining[0].end.clone()]
  remaining.splice(0, 1)

  while (remaining.length > 0) {
    const tail = loop[loop.length - 1]
    const nextIndex = remaining.findIndex((piece) => piece.start.distanceToSquared(tail) <= EPSILON * EPSILON || piece.end.distanceToSquared(tail) <= EPSILON * EPSILON)
    if (nextIndex === -1) break
    const next = remaining[nextIndex]
    const point = next.start.distanceToSquared(tail) <= EPSILON * EPSILON ? next.end : next.start
    if (point.distanceToSquared(loop[0]) <= EPSILON * EPSILON) break
    loop.push(point.clone())
    remaining.splice(nextIndex, 1)
  }

  return ensureCounterClockwise(loop)
}

function unionLoops(a: Vector2[], b: Vector2[]) {
  const pieces = [
    ...boundaryPiecesOutside(a, b),
    ...boundaryPiecesOutside(b, a),
  ]
  if (pieces.length === 0) {
    if (pointInPolygon(a[0], b)) return cloneLoop(b)
    if (pointInPolygon(b[0], a)) return cloneLoop(a)
    return null
  }
  return orderedLoopFromPieces(pieces)
}

function unionManyLoops(loops: Vector2[][]) {
  let current = cloneLoop(ensureCounterClockwise(loops[0] ?? []))
  if (current.length < 3) return null
  for (let index = 1; index < loops.length; index += 1) {
    const next = ensureCounterClockwise(loops[index] ?? [])
    if (next.length < 3) continue
    const combined = unionLoops(current, next)
    if (!combined || combined.length < 3) return null
    current = combined
  }
  return current
}

function pointsToSegments(points: Vector2[]) {
  const segments: BoundaryLoop['segments'] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    segments.push({
      type: 'line',
      from: { x: current.x, y: current.y },
      to: { x: next.x, y: next.y },
      tag: null,
      boundaryRoleOverride: null,
      railingAllowed: null,
      wallAllowed: null,
      openingAllowed: null,
    })
  }
  return segments
}

function loopToBoundary(id: string, kind: BoundaryLoop['kind'], points: Vector2[]): BoundaryLoop {
  return {
    id,
    closed: true,
    kind,
    segments: pointsToSegments(ensureCounterClockwise(points)),
  }
}

function makeFootprint(id: string, shell: StructuralShellInput): StructureFootprint {
  return {
    id,
    sourceNodeKey: shell.sourceNodeKey,
    shapeKind: shell.shapeKind,
    outerLoop: loopToBoundary(`${id}.outer`, 'outer', shell.outer),
    innerLoops: shell.inner.length >= 3 ? [loopToBoundary(`${id}.inner`, 'hole', shell.inner)] : [],
    metadata: {
      baseElevation: shell.baseElevation,
      topElevation: shell.topElevation,
      floorAtBase: shell.floorAtBase,
      ...shell.metadata,
    },
  }
}

export function resolveStructuralUnion(shells: StructuralShellInput[], fusionId: string): StructuralFusionResult | null {
  if (shells.length < 2) return null
  const normalizedShells = shells.map((shell) => normalizedShell(shell))

  const diagnostics: string[] = []
  const overlapBase = Math.max(...normalizedShells.map((shell) => shell.baseElevation))
  const overlapTop = Math.min(...normalizedShells.map((shell) => shell.topElevation))
  if (overlapTop - overlapBase <= 0.05) {
    diagnostics.push(`Structural fusion "${fusionId}" skipped: overlap band too small.`)
    return null
  }

  const fusedOuter = unionManyLoops(normalizedShells.map((shell) => shell.outer))
  const fusedInner = unionManyLoops(normalizedShells.map((shell) => shell.inner))
  if (!fusedOuter || fusedOuter.length < 3) {
    diagnostics.push(`Structural fusion "${fusionId}" failed: could not derive fused outer loop.`)
    return null
  }
  if (!fusedInner || fusedInner.length < 3) {
    diagnostics.push(`Structural fusion "${fusionId}" failed: could not derive fused inner loop.`)
    return null
  }

  const bands: StructuralShellBandResult[] = [{
    id: `${fusionId}.fused`,
    sourceNodeKeys: shells.map((shell) => shell.sourceNodeKey),
    outer: fusedOuter,
    inner: fusedInner,
    baseElevation: overlapBase,
    topElevation: overlapTop,
    floorAtBase: shells.some((shell) => shell.floorAtBase && Math.abs(shell.baseElevation - overlapBase) <= 0.05),
    metadata: { derivedKind: 'fused', fusionId },
  }]

  for (const shell of normalizedShells) {
    if (shell.baseElevation < overlapBase - 0.05) {
      bands.push({
        id: `${fusionId}.${shell.sourceNodeKey}.lower`,
        sourceNodeKeys: [shell.sourceNodeKey],
        outer: cloneLoop(shell.outer),
        inner: cloneLoop(shell.inner),
        baseElevation: shell.baseElevation,
        topElevation: overlapBase,
        floorAtBase: shell.floorAtBase,
        metadata: { derivedKind: 'remainder_lower', fusionId },
      })
    }
    if (shell.topElevation > overlapTop + 0.05) {
      bands.push({
        id: `${fusionId}.${shell.sourceNodeKey}.upper`,
        sourceNodeKeys: [shell.sourceNodeKey],
        outer: cloneLoop(shell.outer),
        inner: cloneLoop(shell.inner),
        baseElevation: overlapTop,
        topElevation: shell.topElevation,
        floorAtBase: false,
        metadata: { derivedKind: 'remainder_upper', fusionId },
      })
    }
  }

  const footprints = normalizedShells.map((shell, index) => makeFootprint(`${fusionId}.footprint_${index + 1}`, shell))
  const shellBands: ShellBandSpec[] = bands.map((band, index) => ({
    id: `${fusionId}.shell_band_${index + 1}`,
    sourceNodeKeys: band.sourceNodeKeys,
    outerLoop: loopToBoundary(`${fusionId}.shell_band_${index + 1}.outer`, 'outer', band.outer),
    innerLoops: band.inner.length >= 3 ? [loopToBoundary(`${fusionId}.shell_band_${index + 1}.inner`, 'hole', band.inner)] : [],
    baseElevation: band.baseElevation,
    topElevation: band.topElevation,
    floorAtBase: band.floorAtBase,
    metadata: band.metadata,
  }))

  const fusion: StructuralFusionSpec = {
    id: `${fusionId}.fusion`,
    sourceNodeKeys: normalizedShells.map((shell) => shell.sourceNodeKey),
    overlapBand: {
      id: `${fusionId}.band`,
      baseElevation: overlapBase,
      topElevation: overlapTop,
      metadata: {},
    },
    fusedOuterLoop: loopToBoundary(`${fusionId}.fused_outer`, 'outer', fusedOuter),
    fusedInnerLoops: [loopToBoundary(`${fusionId}.fused_inner`, 'hole', fusedInner)],
    remainderBands: shellBands.filter((band) => String(band.metadata.derivedKind).startsWith('remainder')),
    metadata: {},
  }

  return {
    bands,
    footprints,
    shellBands,
    fusions: [fusion],
    diagnostics,
  }
}
