import { z } from 'zod'

import {
  createAssemblyGraph,
  createAssemblyNode,
  type AssemblyGraphDefinition,
  type AssemblyNodeDefinition,
  type CompiledEnvironmentModel,
} from './environmentAssembly'
import {
  compileAssemblyGraph,
  createAssemblyCompileCache,
  type AssemblyCompileCache,
  type AssemblyCompileResult,
} from './environmentAssemblyCompiler'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const blueprintUnitsSchema = z.enum(['meters', 'generic'])
export const blueprintOwnershipSchema = z.enum(['generated', 'mixed', 'manual'])
export const blueprintStructureTypeSchema = z.enum([
  'building_mass',
  'wing',
  'tower',
  'courtyard',
  'hall',
  'gatehouse',
  'level_stack',
])
export const blueprintFacadeTypeSchema = z.enum(['facade_band', 'opening_band'])
export const blueprintOpeningTypeSchema = z.enum(['door', 'window', 'arch'])
export const blueprintCirculationTypeSchema = z.enum(['stair_core', 'ladder_run', 'landing', 'connector_anchor'])
export const blueprintRoofTypeSchema = z.enum(['flat', 'shed', 'gable', 'hip', 'pyramid', 'pointed', 'dome'])
export const blueprintSvgRoleSchema = z.enum([
  'site',
  'footprint',
  'courtyard',
  'wing',
  'tower',
  'hall',
  'wall_axis',
  'door',
  'window',
  'window_band',
  'arch',
  'stair',
  'ladder',
  'roof_hint',
  'anchor',
  'connector',
])

export const blueprintPoint2Schema = z.object({
  x: z.number(),
  y: z.number(),
})

export const blueprintProvenanceSchema = z.object({
  svgElementId: z.string().nullable().default(null),
  generatedNodeKeys: z.array(z.string()).default([]),
  graphKey: z.string().nullable().default(null),
  generationRole: z.string().default('blueprint'),
  ownership: blueprintOwnershipSchema.default('generated'),
})

const blueprintElementBaseSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  parentId: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  provenance: blueprintProvenanceSchema.default({
    svgElementId: null,
    generatedNodeKeys: [],
    graphKey: null,
    generationRole: 'blueprint',
    ownership: 'generated',
  }),
})

export const blueprintSiteSchema = blueprintElementBaseSchema.extend({
  role: z.literal('site').default('site'),
  footprint: z.array(blueprintPoint2Schema).min(3).default([
    { x: -10, y: -8 },
    { x: 10, y: -8 },
    { x: 10, y: 8 },
    { x: -10, y: 8 },
  ]),
})

export const blueprintStructureSchema = blueprintElementBaseSchema.extend({
  type: blueprintStructureTypeSchema,
  footprint: z.array(blueprintPoint2Schema).default([]),
  width: z.number().positive().default(8),
  depth: z.number().positive().default(6),
  radius: z.number().positive().default(3),
  elevation: z.number().default(0),
  height: z.number().positive().default(3.2),
  levels: z.number().int().positive().default(1),
  wallThickness: z.number().positive().default(0.24),
  floorThickness: z.number().nonnegative().default(0.18),
  shapeHint: z.enum(['rectangle', 'polygon', 'round']).default('rectangle'),
})

export const blueprintFacadeSchema = blueprintElementBaseSchema.extend({
  type: blueprintFacadeTypeSchema,
  structureId: z.string(),
  side: z.enum(['front', 'back', 'left', 'right', 'north', 'south', 'east', 'west']).default('front'),
  count: z.number().int().positive().default(1),
  spacing: z.number().positive().default(2.4),
  sillHeight: z.number().nonnegative().default(0.9),
  width: z.number().positive().default(1.2),
  height: z.number().positive().default(1.2),
})

export const blueprintOpeningSchema = blueprintElementBaseSchema.extend({
  type: blueprintOpeningTypeSchema,
  structureId: z.string(),
  facadeId: z.string().nullable().default(null),
  side: z.enum(['front', 'back', 'left', 'right', 'north', 'south', 'east', 'west']).default('front'),
  width: z.number().positive().default(1.2),
  height: z.number().positive().default(2.2),
  sillHeight: z.number().nonnegative().default(0.9),
  offset: z.number().default(0),
})

export const blueprintCirculationSchema = blueprintElementBaseSchema.extend({
  type: blueprintCirculationTypeSchema,
  structureId: z.string().nullable().default(null),
  fromStructureId: z.string().nullable().default(null),
  toStructureId: z.string().nullable().default(null),
  width: z.number().positive().default(1.4),
  depth: z.number().positive().default(2),
  height: z.number().positive().default(3),
  stepCount: z.number().int().positive().default(12),
  rise: z.number().positive().default(0.18),
  tread: z.number().positive().default(0.28),
  offset: blueprintPoint2Schema.default({ x: 0, y: 0 }),
})

export const blueprintRoofSchema = blueprintElementBaseSchema.extend({
  type: z.literal('roof').default('roof'),
  structureId: z.string(),
  roofType: blueprintRoofTypeSchema.default('gable'),
  height: z.number().nonnegative().default(1.6),
  eaves: z.number().nonnegative().default(0.1),
})

export const environmentBlueprintV1Schema = z.object({
  version: z.literal(1),
  id: z.string(),
  environmentKey: z.string(),
  name: z.string(),
  units: blueprintUnitsSchema.default('meters'),
  site: blueprintSiteSchema.nullable().default(null),
  structures: z.array(blueprintStructureSchema).default([]),
  circulation: z.array(blueprintCirculationSchema).default([]),
  facades: z.array(blueprintFacadeSchema).default([]),
  openings: z.array(blueprintOpeningSchema).default([]),
  roofs: z.array(blueprintRoofSchema).default([]),
  styleHints: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const blueprintMaterializationEntrySchema = z.object({
  blueprintElementId: z.string(),
  nodeKeys: z.array(z.string()).default([]),
  role: z.string().default('generated'),
  ownership: blueprintOwnershipSchema.default('generated'),
})

export const blueprintMaterializationMapSchema = z.object({
  blueprintId: z.string(),
  graphKey: z.string(),
  entries: z.array(blueprintMaterializationEntrySchema).default([]),
})

export const facadeSegmentSchema = z.object({
  id: z.string(),
  structureId: z.string(),
  facadeId: z.string().nullable().default(null),
  side: z.string(),
  openingIds: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
})

export const ladderSpecSchema = z.object({
  id: z.string(),
  structureId: z.string().nullable().default(null),
  height: z.number().positive(),
  width: z.number().positive(),
  offset: blueprintPoint2Schema.default({ x: 0, y: 0 }),
  metadata: looseRecordSchema.default({}),
})

export const landingSpecSchema = z.object({
  id: z.string(),
  structureId: z.string().nullable().default(null),
  width: z.number().positive(),
  depth: z.number().positive(),
  elevation: z.number().default(0),
  metadata: looseRecordSchema.default({}),
})

export const adjacencySpecSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  relation: z.enum(['contains', 'attached', 'connects', 'overlooks']),
  metadata: looseRecordSchema.default({}),
})

export const editHandleSpecSchema = z.object({
  id: z.string(),
  elementId: z.string(),
  kind: z.enum(['footprint_vertex', 'width', 'depth', 'height', 'opening_offset', 'roof_height', 'stair_height', 'ladder_height']),
  label: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  targetPath: z.string(),
  metadata: looseRecordSchema.default({}),
})

export const spatialDocumentV2Schema = z.object({
  version: z.literal(2),
  blueprintId: z.string().nullable().default(null),
  graphKey: z.string(),
  structures: z.array(blueprintStructureSchema).default([]),
  levels: z.array(z.record(z.string(), z.unknown())).default([]),
  rooms: z.array(z.record(z.string(), z.unknown())).default([]),
  wallFaces: z.array(z.record(z.string(), z.unknown())).default([]),
  facadeSegments: z.array(facadeSegmentSchema).default([]),
  openings: z.array(z.record(z.string(), z.unknown())).default([]),
  windows: z.array(z.record(z.string(), z.unknown())).default([]),
  doors: z.array(z.record(z.string(), z.unknown())).default([]),
  arches: z.array(z.record(z.string(), z.unknown())).default([]),
  stairs: z.array(z.record(z.string(), z.unknown())).default([]),
  ladders: z.array(ladderSpecSchema).default([]),
  landings: z.array(landingSpecSchema).default([]),
  anchors: z.array(z.record(z.string(), z.unknown())).default([]),
  connectors: z.array(z.record(z.string(), z.unknown())).default([]),
  adjacency: z.array(adjacencySpecSchema).default([]),
  editHandles: z.array(editHandleSpecSchema).default([]),
  provenance: z.object({
    materialization: blueprintMaterializationMapSchema.nullable().default(null),
    sourceSvgAssetKey: z.string().nullable().default(null),
  }).default({
    materialization: null,
    sourceSvgAssetKey: null,
  }),
  metadata: looseRecordSchema.default({}),
})

export type EnvironmentBlueprintV1 = z.infer<typeof environmentBlueprintV1Schema>
export type BlueprintStructure = z.infer<typeof blueprintStructureSchema>
export type BlueprintFacade = z.infer<typeof blueprintFacadeSchema>
export type BlueprintOpening = z.infer<typeof blueprintOpeningSchema>
export type BlueprintCirculation = z.infer<typeof blueprintCirculationSchema>
export type BlueprintRoof = z.infer<typeof blueprintRoofSchema>
export type BlueprintMaterializationMap = z.infer<typeof blueprintMaterializationMapSchema>
export type SpatialDocumentV2 = z.infer<typeof spatialDocumentV2Schema>
export type EditHandleSpec = z.infer<typeof editHandleSpecSchema>

type StructureMaterialization = {
  profileKey: string
  shellKey: string
  levelKey: string
  roomKeys: string[]
  storeyKey: string
}

const DEFAULT_SITE: EnvironmentBlueprintV1['site'] = {
  id: 'site.main',
  label: 'Site',
  parentId: null,
  role: 'site',
  footprint: [
    { x: -10, y: -8 },
    { x: 10, y: -8 },
    { x: 10, y: 8 },
    { x: -10, y: 8 },
  ],
  metadata: {},
  provenance: {
    svgElementId: null,
    generatedNodeKeys: [],
    graphKey: null,
    generationRole: 'blueprint',
    ownership: 'generated',
  },
}

function roleToStructureType(role: z.infer<typeof blueprintSvgRoleSchema>): BlueprintStructure['type'] | null {
  switch (role) {
    case 'footprint':
      return 'building_mass'
    case 'wing':
      return 'wing'
    case 'tower':
      return 'tower'
    case 'courtyard':
      return 'courtyard'
    case 'hall':
      return 'hall'
    default:
      return null
  }
}

function roleToOpeningType(role: z.infer<typeof blueprintSvgRoleSchema>): BlueprintOpening['type'] | null {
  if (role === 'door') return 'door'
  if (role === 'window') return 'window'
  if (role === 'arch') return 'arch'
  return null
}

function roleToCirculationType(role: z.infer<typeof blueprintSvgRoleSchema>): BlueprintCirculation['type'] | null {
  if (role === 'stair') return 'stair_core'
  if (role === 'ladder') return 'ladder_run'
  if (role === 'anchor' || role === 'connector') return 'connector_anchor'
  return null
}

function graphNodePosition(index: number, column: number) {
  return {
    x: 80 + column * 230,
    y: 120 + index * 190,
  }
}

function sanitizeBlueprintKey(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'blueprint'
}

function ensureClosed(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return points
  const first = points[0]
  const last = points[points.length - 1]
  return first.x === last.x && first.y === last.y ? points.slice(0, -1) : points
}

function rectangleFootprint(width: number, depth: number, center: { x: number; y: number }) {
  const hw = width / 2
  const hd = depth / 2
  return [
    { x: center.x - hw, y: center.y - hd },
    { x: center.x + hw, y: center.y - hd },
    { x: center.x + hw, y: center.y + hd },
    { x: center.x - hw, y: center.y + hd },
  ]
}

function createBlueprintOutputNode(graphKey: string) {
  const output = createAssemblyNode('environment_output', 1, { x: 1120, y: 280 })
  output.key = `${graphKey}.output`
  output.title = 'Environment Output'
  output.metadata = {
    blueprintGenerated: true,
    generationRole: 'output',
  }
  return output
}

function createRectangleOrPolygonNode(
  structure: BlueprintStructure,
  index: number,
): AssemblyNodeDefinition {
  const usePolygon = structure.footprint.length >= 3
  const isTower = structure.type === 'tower' || structure.shapeHint === 'round'
  const kind = isTower ? 'regular_polygon' : usePolygon ? 'polygon' : 'rectangle'
  const node = createAssemblyNode(kind, index + 1, graphNodePosition(index, 0))
  node.key = `bp.${sanitizeBlueprintKey(structure.id)}.profile`
  node.title = structure.label || structure.type
  node.params = isTower
    ? {
        sides: 20,
        radius: structure.radius || Math.max(structure.width, structure.depth) / 2,
      }
    : usePolygon
      ? {
          points: ensureClosed(structure.footprint),
        }
      : {
          width: structure.width,
          depth: structure.depth,
        }
  node.metadata = {
    blueprintElementId: structure.id,
    generationRole: 'profile',
    ownership: structure.provenance.ownership,
  }
  return node
}

function roofNodeKind(roofType: BlueprintRoof['roofType']) {
  switch (roofType) {
    case 'flat':
      return 'flat_roof'
    case 'shed':
      return 'shed_roof'
    case 'gable':
      return 'gable_roof'
    case 'hip':
      return 'hip_roof'
    case 'pyramid':
      return 'pyramid_roof'
    case 'pointed':
      return 'roof_pointed'
    case 'dome':
      return 'dome_roof'
  }
}

function svgNumber(value: string | null | undefined, fallback: number) {
  if (!value) return fallback
  const match = `${value}`.match(/-?\d+(\.\d+)?/)
  if (!match) return fallback
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : fallback
}

function parsePointsAttribute(value: string | null) {
  if (!value) return []
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.split(','))
    .map(([x, y]) => {
      const parsedX = Number(x)
      const parsedY = Number(y)
      return Number.isFinite(parsedX) && Number.isFinite(parsedY) ? { x: parsedX, y: parsedY } : null
    })
    .filter((point): point is { x: number; y: number } => point !== null)
}

function parseSimplePath(value: string | null) {
  if (!value) return []
  const commands = value.match(/[MLZmlz][^MLZmlz]*/g) ?? []
  const points: Array<{ x: number; y: number }> = []
  for (const command of commands) {
    const type = command[0].toUpperCase()
    if (type === 'Z') continue
    const values = command
      .slice(1)
      .trim()
      .split(/[,\s]+/)
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry))
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index]
      const y = values[index + 1]
      if (typeof x === 'number' && typeof y === 'number') {
        points.push({ x, y })
      }
    }
  }
  return points
}

function elementPoints(element: Element) {
  const tag = element.tagName.toLowerCase()
  if (tag === 'rect') {
    const x = svgNumber(element.getAttribute('x'), 0)
    const y = svgNumber(element.getAttribute('y'), 0)
    const width = svgNumber(element.getAttribute('width'), 1)
    const height = svgNumber(element.getAttribute('height'), 1)
    return rectangleFootprint(width, height, { x: x + width / 2, y: y + height / 2 })
  }
  if (tag === 'polygon') return parsePointsAttribute(element.getAttribute('points'))
  if (tag === 'polyline') return parsePointsAttribute(element.getAttribute('points'))
  if (tag === 'line') {
    return [
      { x: svgNumber(element.getAttribute('x1'), 0), y: svgNumber(element.getAttribute('y1'), 0) },
      { x: svgNumber(element.getAttribute('x2'), 0), y: svgNumber(element.getAttribute('y2'), 0) },
    ]
  }
  if (tag === 'circle') {
    const cx = svgNumber(element.getAttribute('cx'), 0)
    const cy = svgNumber(element.getAttribute('cy'), 0)
    const r = svgNumber(element.getAttribute('r'), 1)
    return Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
    })
  }
  if (tag === 'ellipse') {
    const cx = svgNumber(element.getAttribute('cx'), 0)
    const cy = svgNumber(element.getAttribute('cy'), 0)
    const rx = svgNumber(element.getAttribute('rx'), 1)
    const ry = svgNumber(element.getAttribute('ry'), 1)
    return Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
    })
  }
  if (tag === 'path') return parseSimplePath(element.getAttribute('d'))
  return []
}

export function createEnvironmentBlueprint(environmentKey: string, name: string): EnvironmentBlueprintV1 {
  return environmentBlueprintV1Schema.parse({
    version: 1,
    id: `blueprint.${sanitizeBlueprintKey(environmentKey)}.${Date.now()}`,
    environmentKey,
    name,
    units: 'meters',
    site: DEFAULT_SITE,
    structures: [{
      id: 'mass.main',
      label: 'Main Mass',
      parentId: null,
      type: 'building_mass',
      footprint: rectangleFootprint(9, 6, { x: 0, y: 0 }),
      width: 9,
      depth: 6,
      radius: 3,
      elevation: 0,
      height: 3.2,
      levels: 1,
      wallThickness: 0.24,
      floorThickness: 0.18,
      shapeHint: 'rectangle',
      metadata: {},
      provenance: {
        svgElementId: null,
        generatedNodeKeys: [],
        graphKey: null,
        generationRole: 'structure',
        ownership: 'generated',
      },
    }],
    circulation: [],
    facades: [],
    openings: [],
    roofs: [{
      id: 'roof.main',
      label: 'Primary Roof',
      parentId: null,
      type: 'roof',
      structureId: 'mass.main',
      roofType: 'gable',
      height: 1.7,
      eaves: 0.1,
      metadata: {},
      provenance: {
        svgElementId: null,
        generatedNodeKeys: [],
        graphKey: null,
        generationRole: 'roof',
        ownership: 'generated',
      },
    }],
    styleHints: {},
    metadata: {},
  })
}

export function importTaggedSvgToBlueprint(svg: string, environmentKey: string, name = 'Imported Blueprint'): EnvironmentBlueprintV1 {
  const Parser = globalThis.DOMParser
  if (!Parser) {
    throw new Error('Tagged SVG import requires DOMParser support.')
  }

  const document = new Parser().parseFromString(svg, 'image/svg+xml')
  const taggedElements = Array.from(document.querySelectorAll('[data-gc-role]'))
  if (taggedElements.length === 0) {
    throw new Error('Tagged SVG import requires at least one element with a data-gc-role attribute.')
  }

  const blueprint = createEnvironmentBlueprint(environmentKey, name)
  blueprint.site = null
  blueprint.structures = []
  blueprint.circulation = []
  blueprint.facades = []
  blueprint.openings = []
  blueprint.roofs = []

  for (const element of taggedElements) {
    const roleResult = blueprintSvgRoleSchema.safeParse(element.getAttribute('data-gc-role'))
    if (!roleResult.success) continue
    const role = roleResult.data
    const elementId = element.getAttribute('data-gc-id') ?? element.getAttribute('id') ?? `${role}.${blueprint.structures.length + blueprint.openings.length + blueprint.circulation.length + 1}`
    const parentId = element.getAttribute('data-gc-parent')
    const structureId = element.getAttribute('data-gc-structure')
    const level = svgNumber(element.getAttribute('data-gc-level'), 1)
    const points = elementPoints(element)
    const metadata = {
      svgTag: element.tagName.toLowerCase(),
      rawAttributes: Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value])),
    }

    if (role === 'site') {
      blueprint.site = {
        id: elementId,
        label: element.getAttribute('aria-label') ?? 'Site',
        parentId,
        role: 'site',
        footprint: ensureClosed(points.length >= 3 ? points : DEFAULT_SITE?.footprint ?? []),
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      }
      continue
    }

    const structureType = roleToStructureType(role)
    if (structureType) {
      const width = svgNumber(element.getAttribute('data-gc-width'), 8)
      const depth = svgNumber(element.getAttribute('data-gc-depth'), 6)
      blueprint.structures.push({
        id: elementId,
        label: element.getAttribute('aria-label') ?? elementId,
        parentId,
        type: structureType,
        footprint: ensureClosed(points.length >= 3 ? points : rectangleFootprint(width, depth, { x: 0, y: 0 })),
        width,
        depth,
        radius: svgNumber(element.getAttribute('data-gc-width'), width) / 2,
        elevation: svgNumber(element.getAttribute('data-gc-elevation'), 0),
        height: svgNumber(element.getAttribute('data-gc-height'), structureType === 'tower' ? 8 : 3.2),
        levels: Math.max(1, Math.round(level)),
        wallThickness: 0.24,
        floorThickness: 0.18,
        shapeHint: role === 'tower' ? 'round' : points.length >= 3 ? 'polygon' : 'rectangle',
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      })
      continue
    }

    const openingType = roleToOpeningType(role)
    if (openingType) {
      blueprint.openings.push({
        id: elementId,
        label: element.getAttribute('aria-label') ?? elementId,
        parentId,
        type: openingType,
        structureId: structureId ?? parentId ?? 'mass.main',
        facadeId: element.getAttribute('data-gc-parent'),
        side: (element.getAttribute('data-gc-side') as BlueprintOpening['side']) ?? 'front',
        width: svgNumber(element.getAttribute('data-gc-width'), openingType === 'window' ? 1.2 : 1.1),
        height: svgNumber(element.getAttribute('data-gc-height'), openingType === 'window' ? 1.2 : 2.2),
        sillHeight: svgNumber(element.getAttribute('data-gc-elevation'), openingType === 'window' ? 0.9 : 0),
        offset: 0,
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      })
      continue
    }

    const circulationType = roleToCirculationType(role)
    if (circulationType) {
      blueprint.circulation.push({
        id: elementId,
        label: element.getAttribute('aria-label') ?? elementId,
        parentId,
        type: circulationType,
        structureId: structureId ?? parentId,
        fromStructureId: role === 'connector' ? structureId ?? null : null,
        toStructureId: role === 'connector' ? parentId ?? null : null,
        width: svgNumber(element.getAttribute('data-gc-width'), circulationType === 'ladder_run' ? 0.5 : 1.4),
        depth: svgNumber(element.getAttribute('data-gc-depth'), 2),
        height: svgNumber(element.getAttribute('data-gc-height'), 3),
        stepCount: Math.max(4, Math.round(svgNumber(element.getAttribute('data-gc-height'), 12))),
        rise: 0.18,
        tread: 0.28,
        offset: points[0] ?? { x: 0, y: 0 },
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      })
      continue
    }

    if (role === 'window_band') {
      blueprint.facades.push({
        id: elementId,
        label: element.getAttribute('aria-label') ?? elementId,
        parentId,
        type: 'opening_band',
        structureId: structureId ?? parentId ?? 'mass.main',
        side: (element.getAttribute('data-gc-side') as BlueprintFacade['side']) ?? 'front',
        count: Math.max(1, Math.round(svgNumber(element.getAttribute('data-gc-width'), 3))),
        spacing: svgNumber(element.getAttribute('data-gc-depth'), 2.4),
        sillHeight: svgNumber(element.getAttribute('data-gc-elevation'), 0.9),
        width: 1.2,
        height: 1.1,
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      })
      continue
    }

    if (role === 'roof_hint') {
      blueprint.roofs.push({
        id: elementId,
        label: element.getAttribute('aria-label') ?? elementId,
        parentId,
        type: 'roof',
        structureId: structureId ?? parentId ?? 'mass.main',
        roofType: (element.getAttribute('data-gc-type') as BlueprintRoof['roofType']) ?? 'gable',
        height: svgNumber(element.getAttribute('data-gc-height'), 1.6),
        eaves: svgNumber(element.getAttribute('data-gc-depth'), 0.1),
        metadata,
        provenance: {
          svgElementId: elementId,
          generatedNodeKeys: [],
          graphKey: null,
          generationRole: 'svg_import',
          ownership: 'generated',
        },
      })
    }
  }

  if (!blueprint.site) blueprint.site = DEFAULT_SITE
  if (blueprint.structures.length === 0) {
    throw new Error('Tagged SVG import did not produce any supported blueprint structures.')
  }

  return environmentBlueprintV1Schema.parse(blueprint)
}

export function exportBlueprintToTaggedSvg(blueprint: EnvironmentBlueprintV1) {
  const lines: string[] = []
  lines.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 48 48">')
  if (blueprint.site) {
    lines.push(
      `  <polygon data-gc-role="site" data-gc-id="${blueprint.site.id}" points="${blueprint.site.footprint.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="#94a3b8" />`,
    )
  }
  for (const structure of blueprint.structures) {
    const role = structure.type === 'building_mass' ? 'footprint' : structure.type
    const points = (structure.footprint.length >= 3 ? structure.footprint : rectangleFootprint(structure.width, structure.depth, { x: 0, y: 0 }))
      .map((point) => `${point.x},${point.y}`)
      .join(' ')
    lines.push(
      `  <polygon data-gc-role="${role}" data-gc-id="${structure.id}"${structure.parentId ? ` data-gc-parent="${structure.parentId}"` : ''} points="${points}" fill="none" stroke="#38bdf8" data-gc-width="${structure.width}" data-gc-depth="${structure.depth}" data-gc-height="${structure.height}" data-gc-level="${structure.levels}" />`,
    )
  }
  for (const opening of blueprint.openings) {
    lines.push(
      `  <line data-gc-role="${opening.type}" data-gc-id="${opening.id}" data-gc-parent="${opening.facadeId ?? opening.structureId}" data-gc-structure="${opening.structureId}" data-gc-side="${opening.side}" data-gc-width="${opening.width}" data-gc-height="${opening.height}" data-gc-elevation="${opening.sillHeight}" x1="0" y1="0" x2="${opening.width}" y2="0" stroke="#f59e0b" />`,
    )
  }
  for (const facade of blueprint.facades) {
    lines.push(
      `  <line data-gc-role="window_band" data-gc-id="${facade.id}" data-gc-parent="${facade.structureId}" data-gc-structure="${facade.structureId}" data-gc-side="${facade.side}" data-gc-width="${facade.count}" data-gc-depth="${facade.spacing}" data-gc-elevation="${facade.sillHeight}" x1="0" y1="0" x2="${facade.count * facade.spacing}" y2="0" stroke="#22c55e" />`,
    )
  }
  for (const circulation of blueprint.circulation) {
    const role = circulation.type === 'stair_core' ? 'stair' : circulation.type === 'ladder_run' ? 'ladder' : circulation.type === 'connector_anchor' ? 'connector' : 'anchor'
    lines.push(
      `  <line data-gc-role="${role}" data-gc-id="${circulation.id}"${circulation.structureId ? ` data-gc-structure="${circulation.structureId}"` : ''} data-gc-width="${circulation.width}" data-gc-depth="${circulation.depth}" data-gc-height="${circulation.height}" x1="${circulation.offset.x}" y1="${circulation.offset.y}" x2="${circulation.offset.x + circulation.width}" y2="${circulation.offset.y + circulation.depth}" stroke="#c084fc" />`,
    )
  }
  for (const roof of blueprint.roofs) {
    lines.push(
      `  <line data-gc-role="roof_hint" data-gc-id="${roof.id}" data-gc-parent="${roof.structureId}" data-gc-structure="${roof.structureId}" data-gc-type="${roof.roofType}" data-gc-height="${roof.height}" data-gc-depth="${roof.eaves}" x1="0" y1="0" x2="${roof.height}" y2="0" stroke="#ef4444" />`,
    )
  }
  lines.push('</svg>')
  return lines.join('\n')
}

export function materializeEnvironmentBlueprintToAssemblyGraph(
  blueprint: EnvironmentBlueprintV1,
  existingGraph?: AssemblyGraphDefinition | null,
) {
  const graphKey = existingGraph?.key ?? `assembly.${sanitizeBlueprintKey(blueprint.environmentKey)}.${sanitizeBlueprintKey(blueprint.id)}`
  const baseGraph = existingGraph
    ? { ...existingGraph, nodes: [], edges: [] }
    : createAssemblyGraph({
        key: graphKey,
        name: `${blueprint.name} Assembly`,
        summary: `Materialized assembly graph for ${blueprint.name}.`,
        boundEnvironmentKey: blueprint.environmentKey,
      })

  const outputNode = createBlueprintOutputNode(graphKey)
  const nodes: AssemblyNodeDefinition[] = [outputNode]
  const edges: AssemblyGraphDefinition['edges'] = []
  const structureMap = new Map<string, StructureMaterialization>()
  const materializationEntries: Array<z.infer<typeof blueprintMaterializationEntrySchema>> = []

  blueprint.structures.forEach((structure, index) => {
    const profileNode = createRectangleOrPolygonNode(structure, index)
    const storeyNode = createAssemblyNode('storey_stack', index + 1, graphNodePosition(index, 1))
    storeyNode.key = `bp.${sanitizeBlueprintKey(structure.id)}.storeys`
    storeyNode.title = `${structure.label || structure.type} Storeys`
    storeyNode.params = {
      count: Math.max(1, structure.levels),
      baseElevation: structure.elevation,
      levelHeight: Math.max(2.4, structure.height),
      slabThickness: structure.floorThickness,
      labelPrefix: structure.label || structure.type,
    }
    storeyNode.metadata = {
      blueprintElementId: structure.id,
      generationRole: 'storeys',
      ownership: structure.provenance.ownership,
    }
    nodes.push(profileNode, storeyNode)
    const roomKeys: string[] = []
    for (let levelIndex = 0; levelIndex < Math.max(1, structure.levels); levelIndex += 1) {
      const roomNode = createAssemblyNode('room_on_level', levelIndex + 1, graphNodePosition(index + levelIndex * 0.08, 2))
      roomNode.key = `bp.${sanitizeBlueprintKey(structure.id)}.room_${levelIndex + 1}`
      roomNode.title = `${structure.label || structure.type} L${levelIndex + 1}`
      roomNode.params = {
        levelIndex: levelIndex + 1,
        roomName: `${structure.label || structure.type} Level ${levelIndex + 1}`,
        height: structure.height,
        wallThickness: structure.wallThickness,
        floorThickness: structure.floorThickness,
      }
      roomNode.metadata = {
        blueprintElementId: structure.id,
        generationRole: 'room_on_level',
        ownership: structure.provenance.ownership,
        topologyOwned: true,
      }
      nodes.push(roomNode)
      edges.push(
        {
          id: `edge.${structure.id}.profile_room_${levelIndex + 1}`,
          key: `edge.${structure.id}.profile_room_${levelIndex + 1}`,
          source: { nodeKey: profileNode.key, portId: 'profile' },
          target: { nodeKey: roomNode.key, portId: 'profile' },
          metadata: { blueprintElementId: structure.id },
        },
        {
          id: `edge.${structure.id}.storeys_room_${levelIndex + 1}`,
          key: `edge.${structure.id}.storeys_room_${levelIndex + 1}`,
          source: { nodeKey: storeyNode.key, portId: 'levels' },
          target: { nodeKey: roomNode.key, portId: 'level' },
          metadata: { blueprintElementId: structure.id },
        },
        {
          id: `edge.${structure.id}.room_out_${levelIndex + 1}`,
          key: `edge.${structure.id}.room_out_${levelIndex + 1}`,
          source: { nodeKey: roomNode.key, portId: 'solid' },
          target: { nodeKey: outputNode.key, portId: 'solids' },
          metadata: { blueprintElementId: structure.id },
        },
      )
      roomKeys.push(roomNode.key)
    }

    structureMap.set(structure.id, {
      profileKey: profileNode.key,
      shellKey: roomKeys[0] ?? profileNode.key,
      levelKey: storeyNode.key,
      roomKeys,
      storeyKey: storeyNode.key,
    })
    materializationEntries.push({
      blueprintElementId: structure.id,
      nodeKeys: [profileNode.key, storeyNode.key, ...roomKeys],
      role: 'structure',
      ownership: structure.provenance.ownership,
    })
  })

  blueprint.roofs.forEach((roof, index) => {
    const structure = structureMap.get(roof.structureId)
    if (!structure) return
    const node = createAssemblyNode(roofNodeKind(roof.roofType), index + 1, graphNodePosition(index, 3))
    node.key = `bp.${sanitizeBlueprintKey(roof.id)}.roof`
    node.title = roof.label || `${roof.roofType} Roof`
    node.params = {
      height: roof.height,
      eaves: roof.eaves,
    }
    node.metadata = {
      blueprintElementId: roof.id,
      generationRole: 'roof',
      ownership: roof.provenance.ownership,
    }
    nodes.push(node)
    edges.push(
      {
        id: `edge.${roof.id}.profile_roof`,
        key: `edge.${roof.id}.profile_roof`,
        source: { nodeKey: structure.profileKey, portId: 'profile' },
        target: { nodeKey: node.key, portId: 'profile' },
        metadata: {
          blueprintElementId: roof.id,
        },
      },
      {
        id: `edge.${roof.id}.shell_roof`,
        key: `edge.${roof.id}.shell_roof`,
        source: { nodeKey: structure.roomKeys[structure.roomKeys.length - 1] ?? structure.shellKey, portId: 'solid' },
        target: { nodeKey: node.key, portId: 'host' },
        metadata: {
          blueprintElementId: roof.id,
        },
      },
      {
        id: `edge.${roof.id}.roof_out`,
        key: `edge.${roof.id}.roof_out`,
        source: { nodeKey: node.key, portId: 'solid' },
        target: { nodeKey: outputNode.key, portId: 'solids' },
        metadata: {
          blueprintElementId: roof.id,
        },
      },
    )
    materializationEntries.push({
      blueprintElementId: roof.id,
      nodeKeys: [node.key],
      role: 'roof',
      ownership: roof.provenance.ownership,
    })
  })

  blueprint.facades.forEach((facade, index) => {
    if (facade.type !== 'opening_band') return
    const structure = structureMap.get(facade.structureId)
    if (!structure) return
    const node = createAssemblyNode('opening_array', index + 1, graphNodePosition(index, 4))
    node.key = `bp.${sanitizeBlueprintKey(facade.id)}.window_band`
    node.title = facade.label || 'Opening Band'
    node.params = {
      count: facade.count,
      spacing: facade.spacing,
      width: facade.width,
      height: facade.height,
      sillHeight: facade.sillHeight,
      side: facade.side,
    }
    node.metadata = {
      blueprintElementId: facade.id,
      generationRole: 'facade_opening_band',
      ownership: facade.provenance.ownership,
    }
    nodes.push(node)
    edges.push(
      {
        id: `edge.${facade.id}.shell_openings_host`,
        key: `edge.${facade.id}.shell_openings_host`,
        source: { nodeKey: structure.shellKey, portId: 'solid' },
        target: { nodeKey: node.key, portId: 'host' },
        metadata: { blueprintElementId: facade.id },
      },
      {
        id: `edge.${facade.id}.shell_openings_face`,
        key: `edge.${facade.id}.shell_openings_face`,
        source: { nodeKey: structure.shellKey, portId: 'wall_faces' },
        target: { nodeKey: node.key, portId: 'wall_face' },
        metadata: { blueprintElementId: facade.id },
      },
    )
    materializationEntries.push({
      blueprintElementId: facade.id,
      nodeKeys: [node.key],
      role: 'facade',
      ownership: facade.provenance.ownership,
    })
  })

  blueprint.openings.forEach((opening, index) => {
    const structure = structureMap.get(opening.structureId)
    if (!structure) return
    const kind = opening.type === 'door' ? 'door_opening' : opening.type === 'arch' ? 'arch_opening' : 'window_opening'
    const node = createAssemblyNode(kind, index + 1, graphNodePosition(index, 5))
    node.key = `bp.${sanitizeBlueprintKey(opening.id)}.opening`
    node.title = opening.label || opening.type
    node.params = {
      width: opening.width,
      height: opening.height,
      sillHeight: opening.sillHeight,
      side: opening.side,
      offset: opening.offset,
    }
    node.metadata = {
      blueprintElementId: opening.id,
      generationRole: 'opening',
      ownership: opening.provenance.ownership,
    }
    nodes.push(node)
    edges.push(
      {
        id: `edge.${opening.id}.host`,
        key: `edge.${opening.id}.host`,
        source: { nodeKey: structure.shellKey, portId: 'solid' },
        target: { nodeKey: node.key, portId: 'host' },
        metadata: { blueprintElementId: opening.id },
      },
      {
        id: `edge.${opening.id}.face`,
        key: `edge.${opening.id}.face`,
        source: { nodeKey: structure.shellKey, portId: 'wall_faces' },
        target: { nodeKey: node.key, portId: 'wall_face' },
        metadata: { blueprintElementId: opening.id },
      },
    )
    materializationEntries.push({
      blueprintElementId: opening.id,
      nodeKeys: [node.key],
      role: 'opening',
      ownership: opening.provenance.ownership,
    })
  })

  blueprint.circulation.forEach((circulation, index) => {
    const structure = circulation.structureId ? structureMap.get(circulation.structureId) : null
    if (circulation.type === 'stair_core') {
      const node = createAssemblyNode('stair_core', index + 1, graphNodePosition(index, 6))
      node.key = `bp.${sanitizeBlueprintKey(circulation.id)}.stair`
      node.title = circulation.label || 'Stair Core'
      node.params = {
        stairType: 'switchback',
        fromLevelIndex: 1,
        toLevelIndex: Math.max(2, Math.round(circulation.height / Math.max(circulation.rise, 0.18))),
        width: circulation.width,
        rise: circulation.rise,
        tread: circulation.tread,
        depth: circulation.depth,
        landingDepth: circulation.depth,
        offset: { x: circulation.offset.x, y: 0, z: circulation.offset.y },
      }
      node.metadata = {
        blueprintElementId: circulation.id,
        generationRole: 'circulation',
        ownership: circulation.provenance.ownership,
      }
      nodes.push(node)
      edges.push({
        id: `edge.${circulation.id}.out`,
        key: `edge.${circulation.id}.out`,
        source: { nodeKey: node.key, portId: 'solid' },
        target: { nodeKey: outputNode.key, portId: 'solids' },
        metadata: { blueprintElementId: circulation.id },
      })
      if (structure) {
        edges.push({
          id: `edge.${circulation.id}.levels`,
          key: `edge.${circulation.id}.levels`,
          source: { nodeKey: structure.storeyKey, portId: 'levels' },
          target: { nodeKey: node.key, portId: 'levels' },
          metadata: { blueprintElementId: circulation.id },
        })
      }
      materializationEntries.push({
        blueprintElementId: circulation.id,
        nodeKeys: [node.key],
        role: 'circulation',
        ownership: circulation.provenance.ownership,
      })
      return
    }

    if (circulation.type === 'landing') {
      const node = createAssemblyNode('landing', index + 1, graphNodePosition(index, 6))
      node.key = `bp.${sanitizeBlueprintKey(circulation.id)}.landing`
      node.title = circulation.label || 'Landing'
      node.params = {
        width: circulation.width,
        depth: circulation.depth,
        elevation: structure ? 0.5 * Math.max(1, circulation.height) : 1.5,
      }
      node.metadata = {
        blueprintElementId: circulation.id,
        generationRole: 'landing',
        ownership: circulation.provenance.ownership,
      }
      nodes.push(node)
      edges.push({
        id: `edge.${circulation.id}.landing_out`,
        key: `edge.${circulation.id}.landing_out`,
        source: { nodeKey: node.key, portId: 'solid' },
        target: { nodeKey: outputNode.key, portId: 'solids' },
        metadata: { blueprintElementId: circulation.id },
      })
      materializationEntries.push({
        blueprintElementId: circulation.id,
        nodeKeys: [node.key],
        role: 'landing',
        ownership: circulation.provenance.ownership,
      })
      return
    }

    if (circulation.type === 'ladder_run') {
      const node = createAssemblyNode('box', index + 1, graphNodePosition(index, 6))
      node.key = `bp.${sanitizeBlueprintKey(circulation.id)}.ladder_proxy`
      node.title = circulation.label || 'Ladder'
      node.params = {
        width: Math.max(0.2, circulation.width),
        height: circulation.height,
        depth: 0.18,
      }
      node.metadata = {
        blueprintElementId: circulation.id,
        generationRole: 'ladder_proxy',
        ownership: circulation.provenance.ownership,
        semanticType: 'ladder_run',
      }
      nodes.push(node)
      edges.push({
        id: `edge.${circulation.id}.ladder_out`,
        key: `edge.${circulation.id}.ladder_out`,
        source: { nodeKey: node.key, portId: 'solid' },
        target: { nodeKey: outputNode.key, portId: 'solids' },
        metadata: { blueprintElementId: circulation.id },
      })
      materializationEntries.push({
        blueprintElementId: circulation.id,
        nodeKeys: [node.key],
        role: 'ladder',
        ownership: circulation.provenance.ownership,
      })
      return
    }

    const node = createAssemblyNode('connector', index + 1, graphNodePosition(index, 6))
    node.key = `bp.${sanitizeBlueprintKey(circulation.id)}.anchor`
    node.title = circulation.label || 'Connector Anchor'
    node.metadata = {
      blueprintElementId: circulation.id,
      generationRole: 'connector_anchor',
      ownership: circulation.provenance.ownership,
    }
    nodes.push(node)
    if (structure) {
      edges.push({
        id: `edge.${circulation.id}.anchor_from`,
        key: `edge.${circulation.id}.anchor_from`,
        source: { nodeKey: structure.shellKey, portId: 'anchors' },
        target: { nodeKey: node.key, portId: 'from' },
        metadata: { blueprintElementId: circulation.id },
      })
    }
    materializationEntries.push({
      blueprintElementId: circulation.id,
      nodeKeys: [node.key],
      role: 'connector_anchor',
      ownership: circulation.provenance.ownership,
    })
  })

  const graph: AssemblyGraphDefinition = {
    ...baseGraph,
    key: graphKey,
    name: existingGraph?.name ?? `${blueprint.name} Assembly`,
    summary: existingGraph?.summary ?? `Materialized assembly graph for ${blueprint.name}.`,
    boundEnvironmentKey: blueprint.environmentKey,
    metadata: {
      ...existingGraph?.metadata,
      blueprintKey: blueprint.id,
      blueprintEnvironmentKey: blueprint.environmentKey,
      blueprintOwnership: existingGraph?.metadata?.blueprintOwnership ?? 'generated',
    },
    nodes,
    edges,
  }

  const materialization: BlueprintMaterializationMap = {
    blueprintId: blueprint.id,
    graphKey,
    entries: materializationEntries,
  }

  return {
    graph,
    materialization,
  }
}

function deriveFacadeSegments(blueprint: EnvironmentBlueprintV1) {
  return blueprint.facades.map((facade) => ({
    id: facade.id,
    structureId: facade.structureId,
    facadeId: facade.id,
    side: facade.side,
    openingIds: blueprint.openings.filter((opening) => opening.facadeId === facade.id).map((opening) => opening.id),
    metadata: facade.metadata,
  }))
}

function deriveAdjacency(blueprint: EnvironmentBlueprintV1) {
  const adjacency: Array<z.infer<typeof adjacencySpecSchema>> = []
  for (const structure of blueprint.structures) {
    if (structure.parentId) {
      adjacency.push({
        fromId: structure.parentId,
        toId: structure.id,
        relation: 'contains',
        metadata: {},
      })
    }
  }
  for (const circulation of blueprint.circulation) {
    if (circulation.fromStructureId && circulation.toStructureId) {
      adjacency.push({
        fromId: circulation.fromStructureId,
        toId: circulation.toStructureId,
        relation: 'connects',
        metadata: { circulationId: circulation.id },
      })
    }
  }
  return adjacency
}

function deriveEditHandles(blueprint: EnvironmentBlueprintV1) {
  const handles: EditHandleSpec[] = []
  blueprint.structures.forEach((structure) => {
    const points = structure.footprint.length >= 3
      ? structure.footprint
      : rectangleFootprint(structure.width, structure.depth, { x: 0, y: 0 })
    points.forEach((point, index) => {
      handles.push({
        id: `${structure.id}.vertex_${index + 1}`,
        elementId: structure.id,
        kind: 'footprint_vertex',
        label: `${structure.label || structure.type} Vertex ${index + 1}`,
        position: [point.x, structure.elevation, point.y],
        targetPath: `structures.${structure.id}.footprint.${index}`,
        metadata: {},
      })
    })
    handles.push({
      id: `${structure.id}.height`,
      elementId: structure.id,
      kind: 'height',
      label: `${structure.label || structure.type} Height`,
      position: [0, structure.elevation + structure.height, 0],
      targetPath: `structures.${structure.id}.height`,
      metadata: {},
    })
  })
  blueprint.openings.forEach((opening) => {
    handles.push({
      id: `${opening.id}.offset`,
      elementId: opening.id,
      kind: 'opening_offset',
      label: `${opening.label || opening.type} Offset`,
      position: [opening.offset, opening.sillHeight + opening.height * 0.5, 0],
      targetPath: `openings.${opening.id}.offset`,
      metadata: {},
    })
  })
  blueprint.roofs.forEach((roof) => {
    handles.push({
      id: `${roof.id}.height`,
      elementId: roof.id,
      kind: 'roof_height',
      label: `${roof.label || roof.roofType} Height`,
      position: [0, roof.height, 0],
      targetPath: `roofs.${roof.id}.height`,
      metadata: {},
    })
  })
  blueprint.circulation.forEach((entry) => {
    handles.push({
      id: `${entry.id}.height`,
      elementId: entry.id,
      kind: entry.type === 'ladder_run' ? 'ladder_height' : 'stair_height',
      label: `${entry.label || entry.type} Height`,
      position: [entry.offset.x, entry.height, entry.offset.y],
      targetPath: `circulation.${entry.id}.height`,
      metadata: {},
    })
  })
  return handles
}

export function buildSpatialDocumentV2(
  blueprint: EnvironmentBlueprintV1,
  compileResult: AssemblyCompileResult,
  materialization: BlueprintMaterializationMap,
): SpatialDocumentV2 {
  const blueprintElementById = new Map<string, string>()
  for (const entry of materialization.entries) {
    for (const nodeKey of entry.nodeKeys) blueprintElementById.set(nodeKey, entry.blueprintElementId)
  }

  const doors = blueprint.openings
    .filter((opening) => opening.type === 'door')
    .map((opening) => ({
      id: opening.id,
      structureId: opening.structureId,
      side: opening.side,
      width: opening.width,
      height: opening.height,
      metadata: opening.metadata,
    }))
  const arches = blueprint.openings
    .filter((opening) => opening.type === 'arch')
    .map((opening) => ({
      id: opening.id,
      structureId: opening.structureId,
      side: opening.side,
      width: opening.width,
      height: opening.height,
      metadata: opening.metadata,
    }))
  const ladders = blueprint.circulation
    .filter((entry) => entry.type === 'ladder_run')
    .map((entry) => ({
      id: entry.id,
      structureId: entry.structureId,
      height: entry.height,
      width: entry.width,
      offset: entry.offset,
      metadata: entry.metadata,
    }))
  const landings = blueprint.circulation
    .filter((entry) => entry.type === 'landing')
    .map((entry) => ({
      id: entry.id,
      structureId: entry.structureId,
      width: entry.width,
      depth: entry.depth,
      elevation: entry.height * 0.5,
      metadata: entry.metadata,
    }))

  const openings = compileResult.spatialDocument.openings.map((opening) => ({
    ...opening,
    blueprintElementId: blueprintElementById.get(String(opening.sourceNodeKey)) ?? null,
  }))
  const windows = compileResult.spatialDocument.windows.map((windowSpec) => ({
    ...windowSpec,
    blueprintElementId: blueprintElementById.get(String(windowSpec.sourceNodeKey)) ?? null,
  }))

  return spatialDocumentV2Schema.parse({
    version: 2,
    blueprintId: blueprint.id,
    graphKey: compileResult.spatialDocument.graphKey,
    structures: blueprint.structures,
    levels: compileResult.spatialDocument.levels,
    rooms: compileResult.spatialDocument.rooms,
    wallFaces: compileResult.spatialDocument.wallFaces,
    facadeSegments: deriveFacadeSegments(blueprint),
    openings,
    windows,
    doors,
    arches,
    stairs: compileResult.spatialDocument.stairs,
    ladders,
    landings,
    anchors: compileResult.spatialDocument.anchors,
    connectors: compileResult.spatialDocument.connectors,
    adjacency: deriveAdjacency(blueprint),
    editHandles: deriveEditHandles(blueprint),
    provenance: {
      materialization,
      sourceSvgAssetKey:
        typeof blueprint.metadata.svgBlueprintAssetKey === 'string'
          ? blueprint.metadata.svgBlueprintAssetKey
          : null,
    },
    metadata: {
      diagnostics: compileResult.diagnostics,
    },
  })
}

export function compileEnvironmentBlueprint(
  blueprint: EnvironmentBlueprintV1,
  options: {
    existingGraph?: AssemblyGraphDefinition | null
    existingCache?: AssemblyCompileCache
  } = {},
) {
  const materialized = materializeEnvironmentBlueprintToAssemblyGraph(blueprint, options.existingGraph)
  const compileResult = compileAssemblyGraph(materialized.graph, options.existingCache ?? createAssemblyCompileCache())
  const spatialDocumentV2 = buildSpatialDocumentV2(blueprint, compileResult, materialized.materialization)
  const compiledModel: CompiledEnvironmentModel = {
    ...compileResult.compiledModel,
    metadata: {
      ...compileResult.compiledModel.metadata,
      blueprintId: blueprint.id,
      sourceMode: 'procedural_blueprint',
      spatialDocumentVersion: 2,
      spatialDocumentV2,
    },
  }

  return {
    blueprint,
    graph: materialized.graph,
    materialization: materialized.materialization,
    compileResult,
    spatialDocumentV2,
    compiledModel,
  }
}
