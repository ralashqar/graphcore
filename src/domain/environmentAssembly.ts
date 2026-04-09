import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const assemblyValueTypeSchema = z.enum([
  'profile',
  'path',
  'solid',
  'surface',
  'number',
  'vector2',
  'vector3',
  'anchor',
  'connector',
  'boolean',
  'debug',
  'environment',
])

export const assemblyNodeKindSchema = z.enum([
  'rectangle',
  'regular_polygon',
  'hexagon',
  'trapezoid',
  'polygon',
  'polyline',
  'arc',
  'spline',
  'close_loop',
  'hole_loop',
  'box',
  'cylinder',
  'prism',
  'tapered_prism',
  'slab',
  'footprint',
  'wall_shell',
  'room',
  'floor_plate',
  'mezzanine',
  'stair',
  'landing',
  'opening',
  'doorway',
  'connector',
  'ribbon_path',
  'fence_along_path',
  'wall_along_path',
  'tiled_array_along_path',
  'grid_array',
  'union',
  'difference',
  'intersect',
  'mirror',
  'transform',
  'repeat',
  'roof_flat',
  'roof_shed',
  'roof_gable',
  'roof_hip',
  'roof_pyramid',
  'roof_pointed',
  'roof_dome',
  'environment_output',
  'debug_output',
])

export const assemblyPortDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  direction: z.enum(['input', 'output']),
  valueType: assemblyValueTypeSchema,
  multiple: z.boolean().default(false),
})

export const assemblyNodeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: assemblyNodeKindSchema,
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  ports: z.array(assemblyPortDefinitionSchema).default([]),
  params: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const assemblyEdgeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  source: z.object({
    nodeKey: z.string(),
    portId: z.string(),
  }),
  target: z.object({
    nodeKey: z.string(),
    portId: z.string(),
  }),
  metadata: looseRecordSchema.default({}),
})

export const assemblyGraphDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  summary: z.string().default(''),
  boundEnvironmentKey: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  nodes: z.array(assemblyNodeDefinitionSchema).default([]),
  edges: z.array(assemblyEdgeDefinitionSchema).default([]),
})

export const environmentGeometryBindingSourceModeSchema = z.enum(['mesh', 'procedural_graph'])
export const environmentCompilerTargetSchema = z.enum(['preview_mesh', 'spatial_document'])
export const environmentGeometryUnitsSchema = z.enum(['meters', 'generic'])

export const environmentGeometryBindingConfigSchema = z.object({
  sourceMode: environmentGeometryBindingSourceModeSchema.default('mesh'),
  assemblyGraphKey: z.string().nullable().default(null),
  compilerTarget: environmentCompilerTargetSchema.default('preview_mesh'),
  units: environmentGeometryUnitsSchema.default('meters'),
  svgBlueprintAssetKey: z.string().nullable().default(null),
  compileSettings: z.object({
    livePreview: z.boolean().default(true),
    showDebug: z.boolean().default(true),
    triangulation: z.enum(['shape_utils']).default('shape_utils'),
    booleanMode: z.enum(['bounded_v1']).default('bounded_v1'),
    levelHeight: z.number().positive().default(3),
  }).default({
    livePreview: true,
    showDebug: true,
    triangulation: 'shape_utils',
    booleanMode: 'bounded_v1',
    levelHeight: 3,
  }),
})

export const curvePoint2dSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const curveSegmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('line'),
    from: curvePoint2dSchema,
    to: curvePoint2dSchema,
  }),
  z.object({
    type: z.literal('arc'),
    center: curvePoint2dSchema,
    radius: z.number().positive(),
    startAngle: z.number(),
    endAngle: z.number(),
    clockwise: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('spline'),
    points: z.array(curvePoint2dSchema).min(2),
    closed: z.boolean().default(false),
  }),
])

export const boundaryLoopSchema = z.object({
  id: z.string(),
  closed: z.boolean().default(true),
  kind: z.enum(['outer', 'hole']).default('outer'),
  segments: z.array(curveSegmentSchema).default([]),
})

export const profile2dSchema = z.object({
  id: z.string(),
  loops: z.array(boundaryLoopSchema).default([]),
  metadata: looseRecordSchema.default({}),
})

export const solidSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  kind: z.enum([
    'box',
    'cylinder',
    'prism',
    'tapered_prism',
    'slab',
    'wall_shell',
    'room',
    'stair',
    'landing',
    'roof',
    'ribbon',
    'array',
    'boolean_result',
  ]),
  profileId: z.string().nullable().default(null),
  transform: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  }).default({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
  params: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const surfaceSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  kind: z.enum(['floor', 'roof', 'mezzanine', 'debug_surface']),
  profileId: z.string().nullable().default(null),
  elevation: z.number().default(0),
  thickness: z.number().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
})

export const anchorSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  label: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  metadata: looseRecordSchema.default({}),
})

export const connectorSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  fromAnchorId: z.string().nullable().default(null),
  toAnchorId: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
})

export const roomVolumeSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  name: z.string(),
  profileId: z.string().nullable().default(null),
  floorElevation: z.number().default(0),
  ceilingElevation: z.number().default(3),
  metadata: looseRecordSchema.default({}),
})

export const openingSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  hostSolidId: z.string().nullable().default(null),
  kind: z.enum(['opening', 'doorway']),
  position: z.tuple([z.number(), z.number(), z.number()]),
  size: z.tuple([z.number(), z.number(), z.number()]),
  metadata: looseRecordSchema.default({}),
})

export const roofSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  roofType: z.enum(['flat', 'shed', 'gable', 'hip', 'pyramid', 'pointed', 'dome']),
  profileId: z.string().nullable().default(null),
  height: z.number().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
})

export const spatialDocumentSchema = z.object({
  id: z.string(),
  graphKey: z.string(),
  profiles: z.array(profile2dSchema).default([]),
  solids: z.array(solidSpecSchema).default([]),
  surfaces: z.array(surfaceSpecSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  connectors: z.array(connectorSchema).default([]),
  rooms: z.array(roomVolumeSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  roofs: z.array(roofSpecSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
})

export const compiledMeshPartSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  kind: z.enum(['solid', 'surface', 'line', 'debug']),
  color: z.string().default('#8fa5c3'),
  positions: z.array(z.number()).default([]),
  normals: z.array(z.number()).default([]),
  indices: z.array(z.number().int()).default([]),
  linePoints: z.array(z.number()).default([]),
  metadata: looseRecordSchema.default({}),
})

export const compiledEnvironmentModelSchema = z.object({
  id: z.string(),
  graphKey: z.string(),
  generatedAt: z.string(),
  parts: z.array(compiledMeshPartSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  rooms: z.array(roomVolumeSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
})

export const environmentDslDocumentSchema = z.object({
  version: z.literal(1),
  graph: assemblyGraphDefinitionSchema,
})

export type AssemblyValueType = z.infer<typeof assemblyValueTypeSchema>
export type AssemblyNodeKind = z.infer<typeof assemblyNodeKindSchema>
export type AssemblyPortDefinition = z.infer<typeof assemblyPortDefinitionSchema>
export type AssemblyNodeDefinition = z.infer<typeof assemblyNodeDefinitionSchema>
export type AssemblyEdgeDefinition = z.infer<typeof assemblyEdgeDefinitionSchema>
export type AssemblyGraphDefinition = z.infer<typeof assemblyGraphDefinitionSchema>
export type EnvironmentGeometryBindingConfig = z.infer<typeof environmentGeometryBindingConfigSchema>
export type CurveSegment = z.infer<typeof curveSegmentSchema>
export type BoundaryLoop = z.infer<typeof boundaryLoopSchema>
export type Profile2D = z.infer<typeof profile2dSchema>
export type SolidSpec = z.infer<typeof solidSpecSchema>
export type SurfaceSpec = z.infer<typeof surfaceSpecSchema>
export type Anchor = z.infer<typeof anchorSchema>
export type Connector = z.infer<typeof connectorSchema>
export type RoomVolume = z.infer<typeof roomVolumeSchema>
export type OpeningSpec = z.infer<typeof openingSpecSchema>
export type RoofSpec = z.infer<typeof roofSpecSchema>
export type SpatialDocument = z.infer<typeof spatialDocumentSchema>
export type CompiledMeshPart = z.infer<typeof compiledMeshPartSchema>
export type CompiledEnvironmentModel = z.infer<typeof compiledEnvironmentModelSchema>

export type AssemblyTemplateDefinition = {
  key: AssemblyNodeKind
  label: string
  groupKey: string
  defaultTitle: string
  summary: string
  defaultParams?: Record<string, unknown>
}

export type AssemblyTemplateGroup = {
  key: string
  label: string
  templates: AssemblyTemplateDefinition[]
}

export type AssemblyGraphPresetDefinition = {
  key: string
  label: string
  summary: string
  build: (graphKey: string, environmentKey?: string | null) => AssemblyGraphDefinition
}

function port(id: string, label: string, direction: 'input' | 'output', valueType: AssemblyValueType, multiple = false): AssemblyPortDefinition {
  return { id, label, direction, valueType, multiple }
}

export const environmentAssemblyBindingDefaults: EnvironmentGeometryBindingConfig = {
  sourceMode: 'mesh',
  assemblyGraphKey: null,
  compilerTarget: 'preview_mesh',
  units: 'meters',
  svgBlueprintAssetKey: null,
  compileSettings: {
    livePreview: true,
    showDebug: true,
    triangulation: 'shape_utils',
    booleanMode: 'bounded_v1',
    levelHeight: 3,
  },
}

export const environmentAssemblyLibrary: AssemblyTemplateGroup[] = [
  {
    key: 'sketch',
    label: 'Sketch',
    templates: [
      { key: 'rectangle', label: 'Rectangle', groupKey: 'sketch', defaultTitle: 'Rectangle', summary: 'Axis-aligned rectangular footprint.', defaultParams: { width: 6, depth: 6 } },
      { key: 'regular_polygon', label: 'Regular Polygon', groupKey: 'sketch', defaultTitle: 'Regular Polygon', summary: 'Regular n-gon footprint.', defaultParams: { sides: 8, radius: 4 } },
      { key: 'hexagon', label: 'Hexagon', groupKey: 'sketch', defaultTitle: 'Hexagon', summary: 'Hexagon footprint.', defaultParams: { radius: 4 } },
      { key: 'trapezoid', label: 'Trapezoid', groupKey: 'sketch', defaultTitle: 'Trapezoid', summary: 'Tapered trapezoid footprint.', defaultParams: { topWidth: 4, bottomWidth: 8, depth: 6 } },
      { key: 'polygon', label: 'Polygon', groupKey: 'sketch', defaultTitle: 'Polygon', summary: 'Custom polygon footprint.', defaultParams: { points: [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 4, y: 2 }, { x: -2, y: 4 }] } },
      { key: 'polyline', label: 'Polyline', groupKey: 'sketch', defaultTitle: 'Polyline', summary: 'Open path for fences, ribbons, and arrays.', defaultParams: { points: [{ x: -4, y: 0 }, { x: 0, y: 2 }, { x: 4, y: 0 }] } },
      { key: 'arc', label: 'Arc', groupKey: 'sketch', defaultTitle: 'Arc', summary: 'Arc path or arc wall footprint.', defaultParams: { radius: 4, startAngle: 0, endAngle: 180 } },
      { key: 'spline', label: 'Spline', groupKey: 'sketch', defaultTitle: 'Spline', summary: 'Spline path.', defaultParams: { points: [{ x: -4, y: 0 }, { x: -1, y: 2 }, { x: 2, y: -1 }, { x: 4, y: 1 }] } },
      { key: 'close_loop', label: 'Close Loop', groupKey: 'sketch', defaultTitle: 'Close Loop', summary: 'Convert a path into a closed loop.' },
      { key: 'hole_loop', label: 'Hole Loop', groupKey: 'sketch', defaultTitle: 'Hole Loop', summary: 'Add a hole loop into a profile.' },
    ],
  },
  {
    key: 'primitives',
    label: 'Primitives',
    templates: [
      { key: 'box', label: 'Box', groupKey: 'primitives', defaultTitle: 'Box', summary: '3D box primitive.', defaultParams: { width: 4, height: 3, depth: 4 } },
      { key: 'cylinder', label: 'Cylinder', groupKey: 'primitives', defaultTitle: 'Cylinder', summary: 'Cylinder primitive.', defaultParams: { radiusTop: 2, radiusBottom: 2, height: 6, radialSegments: 24 } },
      { key: 'prism', label: 'Prism', groupKey: 'primitives', defaultTitle: 'Prism', summary: 'Extrude a profile into a prism.', defaultParams: { height: 4 } },
      { key: 'tapered_prism', label: 'Tapered Prism', groupKey: 'primitives', defaultTitle: 'Tapered Prism', summary: 'Extrude a profile with top scaling.', defaultParams: { height: 4, topScale: 0.65 } },
      { key: 'slab', label: 'Slab', groupKey: 'primitives', defaultTitle: 'Slab', summary: 'Thin slab from a profile.', defaultParams: { thickness: 0.25 } },
    ],
  },
  {
    key: 'building',
    label: 'Building',
    templates: [
      { key: 'footprint', label: 'Footprint', groupKey: 'building', defaultTitle: 'Footprint', summary: 'Normalize a profile for building assembly.' },
      { key: 'wall_shell', label: 'Wall Shell', groupKey: 'building', defaultTitle: 'Wall Shell', summary: 'Create walls around a footprint.', defaultParams: { height: 3, thickness: 0.2 } },
      { key: 'room', label: 'Room', groupKey: 'building', defaultTitle: 'Room', summary: 'Create walls and floor from a footprint.', defaultParams: { height: 3, wallThickness: 0.2, floorThickness: 0.2 } },
      { key: 'floor_plate', label: 'Floor Plate', groupKey: 'building', defaultTitle: 'Floor Plate', summary: 'Triangulated floor surface.', defaultParams: { elevation: 0, thickness: 0.18 } },
      { key: 'mezzanine', label: 'Mezzanine', groupKey: 'building', defaultTitle: 'Mezzanine', summary: 'Elevated floor plate with holes.', defaultParams: { elevation: 1.5, thickness: 0.18 } },
      { key: 'stair', label: 'Stair', groupKey: 'building', defaultTitle: 'Stair', summary: 'Straight stair block.', defaultParams: { width: 1.8, stepCount: 8, rise: 0.18, tread: 0.28 } },
      { key: 'landing', label: 'Landing', groupKey: 'building', defaultTitle: 'Landing', summary: 'Landing slab.', defaultParams: { width: 2, depth: 2, thickness: 0.18, elevation: 1.44 } },
      { key: 'opening', label: 'Opening', groupKey: 'building', defaultTitle: 'Opening', summary: 'Generic opening metadata.', defaultParams: { width: 1.4, height: 2.2 } },
      { key: 'doorway', label: 'Doorway', groupKey: 'building', defaultTitle: 'Doorway', summary: 'Door opening metadata.', defaultParams: { width: 1.1, height: 2.2 } },
      { key: 'connector', label: 'Connector', groupKey: 'building', defaultTitle: 'Connector', summary: 'Semantic connector between anchors.' },
    ],
  },
  {
    key: 'path',
    label: 'Path/Ribbon',
    templates: [
      { key: 'ribbon_path', label: 'Ribbon Path', groupKey: 'path', defaultTitle: 'Ribbon Path', summary: 'Extruded ribbon along a path.', defaultParams: { width: 1.5, thickness: 0.12 } },
      { key: 'fence_along_path', label: 'Fence Along Path', groupKey: 'path', defaultTitle: 'Fence Along Path', summary: 'Repeated fence posts and rails.', defaultParams: { postSpacing: 1.6, height: 1.2 } },
      { key: 'wall_along_path', label: 'Wall Along Path', groupKey: 'path', defaultTitle: 'Wall Along Path', summary: 'Wall extrusion along path.', defaultParams: { thickness: 0.2, height: 2.8 } },
      { key: 'tiled_array_along_path', label: 'Tiled Array Along Path', groupKey: 'path', defaultTitle: 'Tiled Array Along Path', summary: 'Tile repeated solids along a path.', defaultParams: { spacing: 2 } },
      { key: 'grid_array', label: 'Grid Array', groupKey: 'path', defaultTitle: 'Grid Array', summary: '2D array repetition.', defaultParams: { columns: 3, rows: 3, spacingX: 3, spacingY: 3 } },
    ],
  },
  {
    key: 'compose',
    label: 'Compose',
    templates: [
      { key: 'union', label: 'Union', groupKey: 'compose', defaultTitle: 'Union', summary: 'Combine supported solids.' },
      { key: 'difference', label: 'Difference', groupKey: 'compose', defaultTitle: 'Difference', summary: 'Subtract one solid from another.' },
      { key: 'intersect', label: 'Intersect', groupKey: 'compose', defaultTitle: 'Intersect', summary: 'Keep solid overlap only.' },
      { key: 'mirror', label: 'Mirror', groupKey: 'compose', defaultTitle: 'Mirror', summary: 'Mirror geometry across an axis.', defaultParams: { axis: 'x' } },
      { key: 'transform', label: 'Transform', groupKey: 'compose', defaultTitle: 'Transform', summary: 'Translate, rotate, and scale.', defaultParams: { translate: { x: 0, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
      { key: 'repeat', label: 'Repeat', groupKey: 'compose', defaultTitle: 'Repeat', summary: 'Repeat geometry along an axis.', defaultParams: { count: 3, offset: { x: 3, y: 0, z: 0 } } },
    ],
  },
  {
    key: 'roof',
    label: 'Roof',
    templates: [
      { key: 'roof_flat', label: 'Flat Roof', groupKey: 'roof', defaultTitle: 'Flat Roof', summary: 'Flat roof slab.', defaultParams: { height: 0.3 } },
      { key: 'roof_shed', label: 'Shed Roof', groupKey: 'roof', defaultTitle: 'Shed Roof', summary: 'Single-slope roof.', defaultParams: { height: 1.4 } },
      { key: 'roof_gable', label: 'Gable Roof', groupKey: 'roof', defaultTitle: 'Gable Roof', summary: 'Gable roof.', defaultParams: { height: 1.6 } },
      { key: 'roof_hip', label: 'Hip Roof', groupKey: 'roof', defaultTitle: 'Hip Roof', summary: 'Hip roof.', defaultParams: { height: 1.4 } },
      { key: 'roof_pyramid', label: 'Pyramid Roof', groupKey: 'roof', defaultTitle: 'Pyramid Roof', summary: 'Roof converging to a point.', defaultParams: { height: 1.8 } },
      { key: 'roof_pointed', label: 'Pointed Cap', groupKey: 'roof', defaultTitle: 'Pointed Cap', summary: 'Pointed roof cap for towers.', defaultParams: { height: 2 } },
      { key: 'roof_dome', label: 'Dome Roof', groupKey: 'roof', defaultTitle: 'Dome Roof', summary: 'Dome roof cap.', defaultParams: { height: 1.5 } },
    ],
  },
  {
    key: 'output',
    label: 'Output',
    templates: [
      { key: 'environment_output', label: 'Environment Output', groupKey: 'output', defaultTitle: 'Environment Output', summary: 'Final compiled output.' },
      { key: 'debug_output', label: 'Debug Output', groupKey: 'output', defaultTitle: 'Debug Output', summary: 'Debug-only output surface.' },
    ],
  },
]

export const environmentAssemblyTemplatesByKey = new Map(
  environmentAssemblyLibrary.flatMap((group) => group.templates.map((template) => [template.key, template] as const)),
)

export function inferAssemblyPorts(kind: AssemblyNodeKind): AssemblyPortDefinition[] {
  switch (kind) {
    case 'rectangle':
    case 'regular_polygon':
    case 'hexagon':
    case 'trapezoid':
    case 'polygon':
      return [port('profile', 'Profile', 'output', 'profile')]
    case 'close_loop':
      return [port('path', 'Path', 'input', 'path'), port('profile', 'Profile', 'output', 'profile')]
    case 'hole_loop':
      return [port('profile', 'Outer', 'input', 'profile'), port('profile_hole', 'Hole', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'polyline':
    case 'arc':
    case 'spline':
      return [port('path', 'Path', 'output', 'path')]
    case 'box':
    case 'cylinder':
      return [port('solid', 'Solid', 'output', 'solid')]
    case 'prism':
    case 'tapered_prism':
    case 'slab':
      return [port('profile', 'Profile', 'input', 'profile'), port('solid', 'Solid', 'output', 'solid')]
    case 'roof_flat':
    case 'roof_shed':
    case 'roof_gable':
    case 'roof_hip':
    case 'roof_pyramid':
    case 'roof_pointed':
    case 'roof_dome':
      return [port('profile', 'Profile', 'input', 'profile'), port('host', 'Host', 'input', 'solid', true), port('solid', 'Solid', 'output', 'solid')]
    case 'floor_plate':
    case 'mezzanine':
      return [port('profile', 'Profile', 'input', 'profile'), port('surface', 'Surface', 'output', 'surface')]
    case 'footprint':
      return [port('profile', 'Profile In', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'wall_shell':
    case 'room':
      return [port('profile', 'Profile', 'input', 'profile'), port('solid', 'Solid', 'output', 'solid'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'stair':
    case 'landing':
      return [port('solid', 'Solid', 'output', 'solid'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'opening':
    case 'doorway':
      return [port('host', 'Host', 'input', 'solid'), port('opening', 'Opening', 'output', 'connector')]
    case 'connector':
      return [port('from', 'From', 'input', 'anchor'), port('to', 'To', 'input', 'anchor'), port('connector', 'Connector', 'output', 'connector')]
    case 'ribbon_path':
    case 'fence_along_path':
    case 'wall_along_path':
    case 'tiled_array_along_path':
      return [port('path', 'Path', 'input', 'path'), port('solid', 'Solid', 'output', 'solid')]
    case 'grid_array':
      return [port('source', 'Source', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'union':
    case 'difference':
    case 'intersect':
      return [port('a', 'A', 'input', 'solid'), port('b', 'B', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'mirror':
    case 'transform':
    case 'repeat':
      return [port('source', 'Source', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'environment_output':
    case 'debug_output':
      return [
        port('solids', 'Solids', 'input', 'solid', true),
        port('surfaces', 'Surfaces', 'input', 'surface', true),
        port('anchors', 'Anchors', 'input', 'anchor', true),
        port('environment', 'Environment', 'output', 'environment'),
      ]
  }
}

export function createAssemblyNode(kind: AssemblyNodeKind, count: number, position: { x: number; y: number }): AssemblyNodeDefinition {
  const template = environmentAssemblyTemplatesByKey.get(kind)
  const slug = kind.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return {
    id: `assembly-node-${slug}-${Date.now()}-${count}`,
    key: `${slug}_${count}`,
    kind,
    title: template?.defaultTitle ?? kind,
    subtitle: null,
    position,
    ports: inferAssemblyPorts(kind),
    params: template?.defaultParams ?? {},
    metadata: {},
  }
}

export function createAssemblyGraph(input: {
  key: string
  name: string
  summary?: string
  boundEnvironmentKey?: string | null
}): AssemblyGraphDefinition {
  const outputNode = createAssemblyNode('environment_output', 1, { x: 820, y: 220 })
  outputNode.key = `${input.key}.output`
  return {
    id: `assembly-graph-${Date.now()}`,
    key: input.key,
    name: input.name,
    summary: input.summary ?? '',
    boundEnvironmentKey: input.boundEnvironmentKey ?? null,
    metadata: {},
    nodes: [outputNode],
    edges: [],
  }
}

function presetNode(
  kind: AssemblyNodeKind,
  key: string,
  position: { x: number; y: number },
  params: Record<string, unknown> = {},
  title?: string,
): AssemblyNodeDefinition {
  const node = createAssemblyNode(kind, 1, position)
  return {
    ...node,
    id: `preset-${key}`,
    key,
    title: title ?? node.title,
    params: { ...node.params, ...params },
  }
}

function presetEdge(
  key: string,
  sourceNodeKey: string,
  sourcePortId: string,
  targetNodeKey: string,
  targetPortId: string,
): AssemblyEdgeDefinition {
  return {
    id: `preset-${key}`,
    key,
    source: { nodeKey: sourceNodeKey, portId: sourcePortId },
    target: { nodeKey: targetNodeKey, portId: targetPortId },
    metadata: {},
  }
}

export const environmentAssemblyPresets: AssemblyGraphPresetDefinition[] = [
  {
    key: 'starter_room',
    label: 'Starter Room',
    summary: 'Rectangle footprint, room shell, floor plate, and gable roof.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Starter Room',
      summary: 'Simple room preset for fast compile checks.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'starter_room' },
      nodes: [
        presetNode('rectangle', 'rect_main', { x: 80, y: 140 }, { width: 8, depth: 6 }, 'Main Footprint'),
        presetNode('footprint', 'footprint_main', { x: 300, y: 140 }, {}, 'Footprint'),
        presetNode('room', 'room_main', { x: 540, y: 80 }, { height: 3.2, wallThickness: 0.24, floorThickness: 0.2 }, 'Room'),
        presetNode('floor_plate', 'floor_main', { x: 540, y: 240 }, { elevation: 0, thickness: 0.12 }, 'Floor Plate'),
        presetNode('roof_gable', 'roof_main', { x: 780, y: 140 }, { height: 1.8 }, 'Gable Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1020, y: 140 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('rect_to_footprint', 'rect_main', 'profile', 'footprint_main', 'profile'),
        presetEdge('footprint_to_room', 'footprint_main', 'profile_out', 'room_main', 'profile'),
        presetEdge('footprint_to_floor', 'footprint_main', 'profile_out', 'floor_main', 'profile'),
        presetEdge('footprint_to_roof', 'footprint_main', 'profile_out', 'roof_main', 'profile'),
        presetEdge('room_to_roof_host', 'room_main', 'solid', 'roof_main', 'host'),
        presetEdge('room_to_output', 'room_main', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('floor_to_output', 'floor_main', 'surface', `${graphKey}.output`, 'surfaces'),
        presetEdge('roof_to_output', 'roof_main', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('anchors_to_output', 'room_main', 'anchors', `${graphKey}.output`, 'anchors'),
      ],
    }),
  },
  {
    key: 'tower_union',
    label: 'Tower Union',
    summary: 'Cylinder tower fused with a rectangular room and a pointed roof.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Tower Union',
      summary: 'Boolean union test between tower and room masses.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'tower_union' },
      nodes: [
        presetNode('rectangle', 'rect_wing', { x: 60, y: 120 }, { width: 8, depth: 5 }, 'Wing Footprint'),
        presetNode('prism', 'wing_mass', { x: 300, y: 120 }, { height: 4 }, 'Wing Prism'),
        presetNode('regular_polygon', 'tower_profile', { x: 60, y: 300 }, { sides: 20, radius: 2.8 }, 'Tower Footprint'),
        presetNode('prism', 'tower_mass', { x: 300, y: 300 }, { height: 7 }, 'Tower Prism'),
        presetNode('transform', 'tower_shift', { x: 520, y: 300 }, { translate: { x: 2.4, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, 'Shift Tower'),
        presetNode('union', 'union_mass', { x: 760, y: 210 }, {}, 'Union'),
        presetNode('roof_pointed', 'tower_roof', { x: 520, y: 420 }, { height: 2.8 }, 'Tower Cap'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1000, y: 220 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('rect_to_wing', 'rect_wing', 'profile', 'wing_mass', 'profile'),
        presetEdge('tower_profile_to_mass', 'tower_profile', 'profile', 'tower_mass', 'profile'),
        presetEdge('tower_mass_to_shift', 'tower_mass', 'solid', 'tower_shift', 'source'),
        presetEdge('wing_to_union', 'wing_mass', 'solid', 'union_mass', 'a'),
        presetEdge('tower_to_union', 'tower_shift', 'solid', 'union_mass', 'b'),
        presetEdge('tower_profile_to_roof', 'tower_profile', 'profile', 'tower_roof', 'profile'),
        presetEdge('tower_host_to_roof', 'tower_shift', 'solid', 'tower_roof', 'host'),
        presetEdge('union_to_output', 'union_mass', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('roof_to_output', 'tower_roof', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'mezzanine_walkway',
    label: 'Mezzanine Walkway',
    summary: 'Outer room shell plus inner hole loop for mezzanine test geometry.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Mezzanine Walkway',
      summary: 'Hole-loop and mezzanine compile test.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'mezzanine_walkway' },
      nodes: [
        presetNode('rectangle', 'outer_rect', { x: 60, y: 120 }, { width: 12, depth: 10 }, 'Outer Loop'),
        presetNode('rectangle', 'inner_rect', { x: 60, y: 320 }, { width: 5, depth: 4 }, 'Inner Hole'),
        presetNode('hole_loop', 'walkway_profile', { x: 320, y: 220 }, {}, 'Walkway Profile'),
        presetNode('room', 'hall_room', { x: 580, y: 100 }, { height: 4.5, wallThickness: 0.22, floorThickness: 0.2 }, 'Hall Room'),
        presetNode('mezzanine', 'side_mezz', { x: 580, y: 280 }, { elevation: 2.1, thickness: 0.18 }, 'Mezzanine'),
        presetNode('roof_hip', 'hall_roof', { x: 820, y: 100 }, { height: 1.6 }, 'Hip Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1040, y: 180 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outer_to_hole', 'outer_rect', 'profile', 'walkway_profile', 'profile'),
        presetEdge('inner_to_hole', 'inner_rect', 'profile', 'walkway_profile', 'profile_hole'),
        presetEdge('walkway_to_room', 'walkway_profile', 'profile_out', 'hall_room', 'profile'),
        presetEdge('walkway_to_mezz', 'walkway_profile', 'profile_out', 'side_mezz', 'profile'),
        presetEdge('walkway_to_roof', 'walkway_profile', 'profile_out', 'hall_roof', 'profile'),
        presetEdge('room_to_roof_host', 'hall_room', 'solid', 'hall_roof', 'host'),
        presetEdge('room_to_output', 'hall_room', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('mezz_to_output', 'side_mezz', 'surface', `${graphKey}.output`, 'surfaces'),
        presetEdge('roof_to_output', 'hall_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('room_anchors_to_output', 'hall_room', 'anchors', `${graphKey}.output`, 'anchors'),
      ],
    }),
  },
]

export const environmentAssemblyPresetsByKey = new Map(
  environmentAssemblyPresets.map((preset) => [preset.key, preset] as const),
)

export function environmentAssemblyGraphToDsl(graph: AssemblyGraphDefinition) {
  return JSON.stringify({
    version: 1,
    graph,
  }, null, 2)
}

export function parseEnvironmentAssemblyDsl(input: string) {
  const parsed = environmentDslDocumentSchema.parse(JSON.parse(input))
  return parsed.graph
}
