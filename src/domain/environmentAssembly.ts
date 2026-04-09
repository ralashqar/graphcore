import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const assemblyValueTypeSchema = z.enum([
  'profile',
  'path',
  'solid',
  'surface',
  'level',
  'wall_face',
  'opening',
  'window',
  'bridge',
  'stair',
  'array_placement',
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
  'line_loop',
  'arc_loop',
  'mixed_loop',
  'close_loop',
  'hole_loop',
  'offset_profile',
  'profile_merge',
  'profile_split',
  'profile_from_path',
  'profile_holes',
  'box',
  'cylinder',
  'prism',
  'tapered_prism',
  'slab',
  'building_level',
  'level_stack',
  'footprint',
  'wall_run',
  'wall_style',
  'wall_shell',
  'room',
  'room_shell',
  'floor_plate',
  'floor_fill',
  'ceiling_fill',
  'mezzanine',
  'mezzanine_ring',
  'stair',
  'stair_run',
  'switchback_stair',
  'spiral_stair',
  'landing',
  'stair_to_level',
  'opening',
  'door_opening',
  'window_opening',
  'opening_array',
  'arch_opening',
  'connector_opening',
  'doorway',
  'connector',
  'path_profile',
  'ribbon_path',
  'ribbon_along_path',
  'fence_along_path',
  'wall_along_path',
  'tiled_array_along_path',
  'array_along_path',
  'path_loft',
  'grid_array',
  'union',
  'union_structure',
  'difference',
  'difference_structure',
  'intersect',
  'intersect_structure',
  'attach_to_host',
  'mirror',
  'transform',
  'repeat',
  'roof_flat',
  'flat_roof',
  'roof_shed',
  'shed_roof',
  'roof_gable',
  'gable_roof',
  'roof_hip',
  'hip_roof',
  'roof_pyramid',
  'pyramid_roof',
  'mansard_roof',
  'roof_pointed',
  'tower_cap',
  'roof_dome',
  'dome_roof',
  'bridge_room',
  'bridge_span',
  'bridge_deck',
  'bridge_supports',
  'bridge_to_openings',
  'environment_output',
  'debug_profile',
  'debug_levels',
  'debug_openings',
  'debug_connectors',
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
    'bridge_room',
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

export const levelSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  label: z.string(),
  elevation: z.number().default(0),
  height: z.number().positive().default(3),
  metadata: looseRecordSchema.default({}),
})

export const wallRunSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  profileId: z.string().nullable().default(null),
  levelId: z.string().nullable().default(null),
  height: z.number().positive().default(3),
  thickness: z.number().positive().default(0.2),
  metadata: looseRecordSchema.default({}),
})

export const wallFaceSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  wallRunId: z.string().nullable().default(null),
  start: z.tuple([z.number(), z.number(), z.number()]),
  end: z.tuple([z.number(), z.number(), z.number()]),
  center: z.tuple([z.number(), z.number(), z.number()]),
  normal: z.tuple([z.number(), z.number(), z.number()]),
  elevationBottom: z.number().default(0),
  elevationTop: z.number().default(3),
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

export const windowSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  hostSolidId: z.string().nullable().default(null),
  wallFaceId: z.string().nullable().default(null),
  position: z.tuple([z.number(), z.number(), z.number()]),
  size: z.tuple([z.number(), z.number(), z.number()]),
  sillHeight: z.number().default(0.9),
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

export const bridgeSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  fromAnchorId: z.string().nullable().default(null),
  toAnchorId: z.string().nullable().default(null),
  deckElevation: z.number().default(0),
  width: z.number().positive().default(2),
  metadata: looseRecordSchema.default({}),
})

export const stairRunSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  kind: z.enum(['straight', 'switchback', 'spiral']),
  fromLevelId: z.string().nullable().default(null),
  toLevelId: z.string().nullable().default(null),
  riseCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
})

export const pathSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  kind: z.enum(['polyline', 'arc', 'spline', 'derived_profile']),
  pointCount: z.number().int().nonnegative().default(0),
  closed: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
})

export const arrayPlacementSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  sourceSolidId: z.string().nullable().default(null),
  count: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
})

export const spatialDocumentSchema = z.object({
  id: z.string(),
  graphKey: z.string(),
  profiles: z.array(profile2dSchema).default([]),
  solids: z.array(solidSpecSchema).default([]),
  surfaces: z.array(surfaceSpecSchema).default([]),
  levels: z.array(levelSpecSchema).default([]),
  wallRuns: z.array(wallRunSpecSchema).default([]),
  wallFaces: z.array(wallFaceSpecSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  connectors: z.array(connectorSchema).default([]),
  rooms: z.array(roomVolumeSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  windows: z.array(windowSpecSchema).default([]),
  roofs: z.array(roofSpecSchema).default([]),
  bridges: z.array(bridgeSpecSchema).default([]),
  stairs: z.array(stairRunSpecSchema).default([]),
  paths: z.array(pathSpecSchema).default([]),
  arrayPlacements: z.array(arrayPlacementSpecSchema).default([]),
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
  levels: z.array(levelSpecSchema).default([]),
  wallFaces: z.array(wallFaceSpecSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  windows: z.array(windowSpecSchema).default([]),
  bridges: z.array(bridgeSpecSchema).default([]),
  stairs: z.array(stairRunSpecSchema).default([]),
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
export type LevelSpec = z.infer<typeof levelSpecSchema>
export type WallRunSpec = z.infer<typeof wallRunSpecSchema>
export type WallFaceSpec = z.infer<typeof wallFaceSpecSchema>
export type OpeningSpec = z.infer<typeof openingSpecSchema>
export type WindowSpec = z.infer<typeof windowSpecSchema>
export type RoofSpec = z.infer<typeof roofSpecSchema>
export type BridgeSpec = z.infer<typeof bridgeSpecSchema>
export type StairRunSpec = z.infer<typeof stairRunSpecSchema>
export type PathSpec = z.infer<typeof pathSpecSchema>
export type ArrayPlacementSpec = z.infer<typeof arrayPlacementSpecSchema>
export type SpatialDocument = z.infer<typeof spatialDocumentSchema>
export type CompiledMeshPart = z.infer<typeof compiledMeshPartSchema>
export type CompiledEnvironmentModel = z.infer<typeof compiledEnvironmentModelSchema>

export type EnvironmentMacroDefinition = {
  key: string
  label: string
  summary: string
  presetKey: string | null
  examplePrompt: string
}

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
      { key: 'line_loop', label: 'Line Loop', groupKey: 'sketch', defaultTitle: 'Line Loop', summary: 'Closed footprint described by line segments.', defaultParams: { points: [{ x: -4, y: -3 }, { x: 4, y: -3 }, { x: 4, y: 3 }, { x: -4, y: 3 }] } },
      { key: 'arc_loop', label: 'Arc Loop', groupKey: 'sketch', defaultTitle: 'Arc Loop', summary: 'Closed profile using arc segments.', defaultParams: { radius: 3.5, startAngle: 0, endAngle: 6.283185307179586 } },
      { key: 'mixed_loop', label: 'Mixed Loop', groupKey: 'sketch', defaultTitle: 'Mixed Loop', summary: 'Profile mixing lines, arcs, and splines.', defaultParams: { segments: [{ type: 'line', from: { x: -5, y: -3 }, to: { x: 3, y: -3 } }, { type: 'arc', center: { x: 3, y: 0 }, radius: 3, startAngle: -1.5707963267948966, endAngle: 1.5707963267948966, clockwise: false }, { type: 'line', from: { x: 3, y: 3 }, to: { x: -5, y: 3 } }, { type: 'line', from: { x: -5, y: 3 }, to: { x: -5, y: -3 } }] } },
      { key: 'close_loop', label: 'Close Loop', groupKey: 'sketch', defaultTitle: 'Close Loop', summary: 'Convert a path into a closed loop.' },
      { key: 'hole_loop', label: 'Hole Loop', groupKey: 'sketch', defaultTitle: 'Hole Loop', summary: 'Add a hole loop into a profile.' },
      { key: 'offset_profile', label: 'Offset Profile', groupKey: 'sketch', defaultTitle: 'Offset Profile', summary: 'Inset or outset a profile.', defaultParams: { offset: 0.4 } },
      { key: 'profile_merge', label: 'Profile Merge', groupKey: 'sketch', defaultTitle: 'Profile Merge', summary: 'Merge multiple profile inputs into one compound profile.' },
      { key: 'profile_split', label: 'Profile Split', groupKey: 'sketch', defaultTitle: 'Profile Split', summary: 'Split or tag a profile for downstream nodes.' },
      { key: 'profile_from_path', label: 'Profile From Path', groupKey: 'sketch', defaultTitle: 'Profile From Path', summary: 'Close a path into a fillable profile.' },
      { key: 'profile_holes', label: 'Profile Holes', groupKey: 'sketch', defaultTitle: 'Profile Holes', summary: 'Combine outer and hole loops into a profile.' },
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
      { key: 'building_level', label: 'Building Level', groupKey: 'building', defaultTitle: 'Building Level', summary: 'Semantic building level marker.', defaultParams: { elevation: 0, height: 3, label: 'Ground Floor' } },
      { key: 'level_stack', label: 'Level Stack', groupKey: 'building', defaultTitle: 'Level Stack', summary: 'Generate repeated semantic levels.', defaultParams: { count: 3, baseElevation: 0, levelHeight: 3 } },
      { key: 'footprint', label: 'Footprint', groupKey: 'building', defaultTitle: 'Footprint', summary: 'Normalize a profile for building assembly.' },
      { key: 'wall_run', label: 'Wall Run', groupKey: 'building', defaultTitle: 'Wall Run', summary: 'Semantic wall run with wall face output.', defaultParams: { height: 3.2, thickness: 0.22 } },
      { key: 'wall_style', label: 'Wall Style', groupKey: 'building', defaultTitle: 'Wall Style', summary: 'Styling node for wall thickness and facade metadata.', defaultParams: { thickness: 0.22 } },
      { key: 'wall_shell', label: 'Wall Shell', groupKey: 'building', defaultTitle: 'Wall Shell', summary: 'Create walls around a footprint.', defaultParams: { height: 3, thickness: 0.2 } },
      { key: 'room', label: 'Room', groupKey: 'building', defaultTitle: 'Room', summary: 'Create walls and floor from a footprint.', defaultParams: { height: 3, wallThickness: 0.2, floorThickness: 0.2 } },
      { key: 'room_shell', label: 'Room Shell', groupKey: 'building', defaultTitle: 'Room Shell', summary: 'High-level room shell that emits wall faces and anchors.', defaultParams: { height: 3.2, wallThickness: 0.22, floorThickness: 0.18 } },
      { key: 'floor_plate', label: 'Floor Plate', groupKey: 'building', defaultTitle: 'Floor Plate', summary: 'Triangulated floor surface.', defaultParams: { elevation: 0, thickness: 0.18 } },
      { key: 'floor_fill', label: 'Floor Fill', groupKey: 'building', defaultTitle: 'Floor Fill', summary: 'Semantic floor fill from a profile.', defaultParams: { elevation: 0, thickness: 0.18 } },
      { key: 'ceiling_fill', label: 'Ceiling Fill', groupKey: 'building', defaultTitle: 'Ceiling Fill', summary: 'Ceiling fill from a profile.', defaultParams: { elevation: 3, thickness: 0.14 } },
      { key: 'mezzanine', label: 'Mezzanine', groupKey: 'building', defaultTitle: 'Mezzanine', summary: 'Elevated floor plate with holes.', defaultParams: { elevation: 1.5, thickness: 0.18 } },
      { key: 'mezzanine_ring', label: 'Mezzanine Ring', groupKey: 'building', defaultTitle: 'Mezzanine Ring', summary: 'Mezzanine fill around a hole or courtyard.', defaultParams: { elevation: 2.2, thickness: 0.18 } },
      { key: 'stair', label: 'Stair', groupKey: 'building', defaultTitle: 'Stair', summary: 'Straight stair block.', defaultParams: { width: 1.8, stepCount: 8, rise: 0.18, tread: 0.28 } },
      { key: 'stair_run', label: 'Stair Run', groupKey: 'building', defaultTitle: 'Stair Run', summary: 'Semantic stair run between levels.', defaultParams: { width: 1.8, stepCount: 10, rise: 0.18, tread: 0.28 } },
      { key: 'switchback_stair', label: 'Switchback Stair', groupKey: 'building', defaultTitle: 'Switchback Stair', summary: 'Two-run switchback stair with landing.', defaultParams: { width: 2, stepCount: 12, rise: 0.18, tread: 0.28, landingDepth: 2.2 } },
      { key: 'spiral_stair', label: 'Spiral Stair', groupKey: 'building', defaultTitle: 'Spiral Stair', summary: 'Spiral stair for towers.', defaultParams: { radius: 1.4, stepCount: 18, rise: 0.18 } },
      { key: 'landing', label: 'Landing', groupKey: 'building', defaultTitle: 'Landing', summary: 'Landing slab.', defaultParams: { width: 2, depth: 2, thickness: 0.18, elevation: 1.44 } },
      { key: 'stair_to_level', label: 'Stair To Level', groupKey: 'building', defaultTitle: 'Stair To Level', summary: 'Semantic stair-level connector.' },
      { key: 'opening', label: 'Opening', groupKey: 'building', defaultTitle: 'Opening', summary: 'Generic opening metadata.', defaultParams: { width: 1.4, height: 2.2 } },
      { key: 'door_opening', label: 'Door Opening', groupKey: 'building', defaultTitle: 'Door Opening', summary: 'Door opening attached to wall faces or host solids.', defaultParams: { width: 1.1, height: 2.2 } },
      { key: 'window_opening', label: 'Window Opening', groupKey: 'building', defaultTitle: 'Window Opening', summary: 'Window opening with sill height.', defaultParams: { width: 1.4, height: 1.2, sillHeight: 0.9 } },
      { key: 'opening_array', label: 'Opening Array', groupKey: 'building', defaultTitle: 'Opening Array', summary: 'Repeat openings along a wall face.', defaultParams: { count: 3, spacing: 2.2, width: 1.1, height: 1.2 } },
      { key: 'arch_opening', label: 'Arch Opening', groupKey: 'building', defaultTitle: 'Arch Opening', summary: 'Arched opening for gates and entries.', defaultParams: { width: 2.2, height: 3.4 } },
      { key: 'connector_opening', label: 'Connector Opening', groupKey: 'building', defaultTitle: 'Connector Opening', summary: 'Opening driven by bridge or connector alignment.', defaultParams: { width: 1.8, height: 2.6 } },
      { key: 'doorway', label: 'Doorway', groupKey: 'building', defaultTitle: 'Doorway', summary: 'Door opening metadata.', defaultParams: { width: 1.1, height: 2.2 } },
      { key: 'connector', label: 'Connector', groupKey: 'building', defaultTitle: 'Connector', summary: 'Semantic connector between anchors.' },
      { key: 'bridge_room', label: 'Bridge Room', groupKey: 'building', defaultTitle: 'Bridge Room', summary: 'Enclosed bridge-room between two hosted structures.', defaultParams: { width: 3.2, wallHeight: 3, wallThickness: 0.22, floorThickness: 0.18, roofThickness: 0.18, elevation: 3.2, openingWidth: 1.9, openingHeight: 2.4, overlap: 0.45 } },
    ],
  },
  {
    key: 'path',
    label: 'Path/Ribbon',
    templates: [
      { key: 'path_profile', label: 'Path Profile', groupKey: 'path', defaultTitle: 'Path Profile', summary: 'Create a fill profile from a path width.', defaultParams: { width: 1.4 } },
      { key: 'ribbon_path', label: 'Ribbon Path', groupKey: 'path', defaultTitle: 'Ribbon Path', summary: 'Extruded ribbon along a path.', defaultParams: { width: 1.5, thickness: 0.12 } },
      { key: 'ribbon_along_path', label: 'Ribbon Along Path', groupKey: 'path', defaultTitle: 'Ribbon Along Path', summary: 'Alias for ribbon path generation.', defaultParams: { width: 1.5, thickness: 0.12 } },
      { key: 'fence_along_path', label: 'Fence Along Path', groupKey: 'path', defaultTitle: 'Fence Along Path', summary: 'Repeated fence posts and rails.', defaultParams: { postSpacing: 1.6, height: 1.2 } },
      { key: 'wall_along_path', label: 'Wall Along Path', groupKey: 'path', defaultTitle: 'Wall Along Path', summary: 'Wall extrusion along path.', defaultParams: { thickness: 0.2, height: 2.8 } },
      { key: 'tiled_array_along_path', label: 'Tiled Array Along Path', groupKey: 'path', defaultTitle: 'Tiled Array Along Path', summary: 'Tile repeated solids along a path.', defaultParams: { spacing: 2 } },
      { key: 'array_along_path', label: 'Array Along Path', groupKey: 'path', defaultTitle: 'Array Along Path', summary: 'Clone source solids along a path.', defaultParams: { spacing: 2.2 } },
      { key: 'path_loft', label: 'Path Loft', groupKey: 'path', defaultTitle: 'Path Loft', summary: 'Loft a profile along a path.', defaultParams: { thickness: 0.22 } },
      { key: 'grid_array', label: 'Grid Array', groupKey: 'path', defaultTitle: 'Grid Array', summary: '2D array repetition.', defaultParams: { columns: 3, rows: 3, spacingX: 3, spacingY: 3 } },
    ],
  },
  {
    key: 'compose',
    label: 'Compose',
    templates: [
      { key: 'union', label: 'Union', groupKey: 'compose', defaultTitle: 'Union', summary: 'Combine supported solids.' },
      { key: 'union_structure', label: 'Union Structure', groupKey: 'compose', defaultTitle: 'Union Structure', summary: 'Semantic alias for structure union.' },
      { key: 'difference', label: 'Difference', groupKey: 'compose', defaultTitle: 'Difference', summary: 'Subtract one solid from another.' },
      { key: 'difference_structure', label: 'Difference Structure', groupKey: 'compose', defaultTitle: 'Difference Structure', summary: 'Semantic alias for structure difference.' },
      { key: 'intersect', label: 'Intersect', groupKey: 'compose', defaultTitle: 'Intersect', summary: 'Keep solid overlap only.' },
      { key: 'intersect_structure', label: 'Intersect Structure', groupKey: 'compose', defaultTitle: 'Intersect Structure', summary: 'Semantic alias for structure intersection.' },
      { key: 'attach_to_host', label: 'Attach To Host', groupKey: 'compose', defaultTitle: 'Attach To Host', summary: 'Align a child solid to a host solid bounds.', defaultParams: { alignX: 'center', alignZ: 'center', elevationMode: 'top' } },
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
      { key: 'flat_roof', label: 'Flat Roof+', groupKey: 'roof', defaultTitle: 'Flat Roof', summary: 'Semantic flat roof with overhang.', defaultParams: { height: 0.3, eaves: 0.12 } },
      { key: 'roof_shed', label: 'Shed Roof', groupKey: 'roof', defaultTitle: 'Shed Roof', summary: 'Single-slope roof.', defaultParams: { height: 1.4 } },
      { key: 'shed_roof', label: 'Shed Roof+', groupKey: 'roof', defaultTitle: 'Shed Roof', summary: 'Shed roof with eaves and ridge direction.', defaultParams: { height: 1.4, eaves: 0.16, ridgeDirection: 'x' } },
      { key: 'roof_gable', label: 'Gable Roof', groupKey: 'roof', defaultTitle: 'Gable Roof', summary: 'Gable roof.', defaultParams: { height: 1.6 } },
      { key: 'gable_roof', label: 'Gable Roof+', groupKey: 'roof', defaultTitle: 'Gable Roof', summary: 'Semantic gable roof with pitch and eaves.', defaultParams: { height: 1.8, eaves: 0.18, ridgeDirection: 'x' } },
      { key: 'roof_hip', label: 'Hip Roof', groupKey: 'roof', defaultTitle: 'Hip Roof', summary: 'Hip roof.', defaultParams: { height: 1.4 } },
      { key: 'hip_roof', label: 'Hip Roof+', groupKey: 'roof', defaultTitle: 'Hip Roof', summary: 'Semantic hip roof with overhang.', defaultParams: { height: 1.5, eaves: 0.16 } },
      { key: 'roof_pyramid', label: 'Pyramid Roof', groupKey: 'roof', defaultTitle: 'Pyramid Roof', summary: 'Roof converging to a point.', defaultParams: { height: 1.8 } },
      { key: 'pyramid_roof', label: 'Pyramid Roof+', groupKey: 'roof', defaultTitle: 'Pyramid Roof', summary: 'Pyramid roof with taper controls.', defaultParams: { height: 2, taper: 1 } },
      { key: 'mansard_roof', label: 'Mansard Roof', groupKey: 'roof', defaultTitle: 'Mansard Roof', summary: 'Steep lower pitch with flatter upper roof.', defaultParams: { height: 2.2, inset: 0.45 } },
      { key: 'roof_pointed', label: 'Pointed Cap', groupKey: 'roof', defaultTitle: 'Pointed Cap', summary: 'Pointed roof cap for towers.', defaultParams: { height: 2 } },
      { key: 'tower_cap', label: 'Tower Cap', groupKey: 'roof', defaultTitle: 'Tower Cap', summary: 'Semantic tower cap with taper.', defaultParams: { height: 2.2, taper: 1 } },
      { key: 'roof_dome', label: 'Dome Roof', groupKey: 'roof', defaultTitle: 'Dome Roof', summary: 'Dome roof cap.', defaultParams: { height: 1.5 } },
      { key: 'dome_roof', label: 'Dome Roof+', groupKey: 'roof', defaultTitle: 'Dome Roof', summary: 'Dome roof with roundness control.', defaultParams: { height: 1.6, roundness: 1 } },
      { key: 'bridge_span', label: 'Bridge Span', groupKey: 'roof', defaultTitle: 'Bridge Span', summary: 'Span a bridge between two anchors or towers.', defaultParams: { width: 2.4, thickness: 0.24, railHeight: 1.1 } },
      { key: 'bridge_deck', label: 'Bridge Deck', groupKey: 'roof', defaultTitle: 'Bridge Deck', summary: 'Bridge deck geometry between anchors.', defaultParams: { width: 2.2, thickness: 0.22 } },
      { key: 'bridge_supports', label: 'Bridge Supports', groupKey: 'roof', defaultTitle: 'Bridge Supports', summary: 'Support columns under a bridge span.', defaultParams: { supportCount: 2, thickness: 0.2 } },
      { key: 'bridge_to_openings', label: 'Bridge To Openings', groupKey: 'roof', defaultTitle: 'Bridge To Openings', summary: 'Generate bridge-aligned openings at both ends.', defaultParams: { width: 1.8, height: 2.4 } },
    ],
  },
  {
    key: 'output',
    label: 'Output',
    templates: [
      { key: 'environment_output', label: 'Environment Output', groupKey: 'output', defaultTitle: 'Environment Output', summary: 'Final compiled output.' },
      { key: 'debug_profile', label: 'Debug Profile', groupKey: 'output', defaultTitle: 'Debug Profile', summary: 'Profile diagnostics and triangulation overlays.' },
      { key: 'debug_levels', label: 'Debug Levels', groupKey: 'output', defaultTitle: 'Debug Levels', summary: 'Level overlay diagnostics.' },
      { key: 'debug_openings', label: 'Debug Openings', groupKey: 'output', defaultTitle: 'Debug Openings', summary: 'Opening alignment diagnostics.' },
      { key: 'debug_connectors', label: 'Debug Connectors', groupKey: 'output', defaultTitle: 'Debug Connectors', summary: 'Connector and bridge alignment diagnostics.' },
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
    case 'line_loop':
    case 'arc_loop':
    case 'mixed_loop':
      return [port('profile', 'Profile', 'output', 'profile')]
    case 'offset_profile':
      return [port('profile', 'Profile', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'profile_merge':
    case 'profile_holes':
      return [port('profiles', 'Profiles', 'input', 'profile', true), port('profile_out', 'Profile', 'output', 'profile')]
    case 'profile_split':
      return [port('profile', 'Profile', 'input', 'profile'), port('profile_a', 'Profile A', 'output', 'profile'), port('profile_b', 'Profile B', 'output', 'profile')]
    case 'profile_from_path':
    case 'close_loop':
      return [port('path', 'Path', 'input', 'path'), port('profile', 'Profile', 'output', 'profile')]
    case 'hole_loop':
      return [port('profile', 'Outer', 'input', 'profile'), port('profile_hole', 'Hole', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'polyline':
    case 'arc':
    case 'spline':
      return [port('path', 'Path', 'output', 'path')]
    case 'path_profile':
      return [port('path', 'Path', 'input', 'path'), port('profile', 'Profile', 'output', 'profile')]
    case 'box':
    case 'cylinder':
      return [port('solid', 'Solid', 'output', 'solid')]
    case 'building_level':
      return [port('level', 'Level', 'output', 'level'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'level_stack':
      return [port('levels', 'Levels', 'output', 'level', true), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'prism':
    case 'tapered_prism':
    case 'slab':
      return [port('profile', 'Profile', 'input', 'profile'), port('solid', 'Solid', 'output', 'solid')]
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
    case 'dome_roof':
      return [port('profile', 'Profile', 'input', 'profile'), port('host', 'Host', 'input', 'solid', true), port('solid', 'Solid', 'output', 'solid')]
    case 'floor_plate':
    case 'floor_fill':
    case 'ceiling_fill':
    case 'mezzanine':
    case 'mezzanine_ring':
      return [port('profile', 'Profile', 'input', 'profile'), port('surface', 'Surface', 'output', 'surface')]
    case 'footprint':
      return [port('profile', 'Profile In', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'wall_run':
    case 'wall_shell':
    case 'room':
    case 'room_shell':
      return [
        port('profile', 'Profile', 'input', 'profile'),
        port('level', 'Level', 'input', 'level'),
        port('solid', 'Solid', 'output', 'solid'),
        port('shell', 'Shell', 'output', 'solid'),
        ...(kind === 'room' || kind === 'room_shell' ? [port('floor', 'Floor', 'output', 'solid')] : []),
        port('wall_faces', 'Wall Faces', 'output', 'wall_face', true),
        port('anchors', 'Anchors', 'output', 'anchor', true),
      ]
    case 'wall_style':
      return [port('style', 'Style', 'output', 'debug')]
    case 'stair':
    case 'stair_run':
    case 'switchback_stair':
    case 'spiral_stair':
    case 'landing':
      return [port('solid', 'Solid', 'output', 'solid'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'stair_to_level':
      return [port('stair', 'Stair', 'input', 'stair'), port('level', 'Level', 'input', 'level'), port('connector', 'Connector', 'output', 'connector')]
    case 'opening':
    case 'door_opening':
    case 'window_opening':
    case 'opening_array':
    case 'arch_opening':
    case 'connector_opening':
    case 'doorway':
      return [port('host', 'Host', 'input', 'solid'), port('wall_face', 'Wall Face', 'input', 'wall_face'), port('opening', 'Opening', 'output', 'opening', kind === 'opening_array'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'connector':
      return [port('from', 'From', 'input', 'anchor'), port('to', 'To', 'input', 'anchor'), port('connector', 'Connector', 'output', 'connector')]
    case 'bridge_room':
      return [
        port('from', 'From', 'input', 'anchor', true),
        port('to', 'To', 'input', 'anchor', true),
        port('from_host', 'From Host', 'input', 'solid'),
        port('to_host', 'To Host', 'input', 'solid'),
        port('solid', 'Solid', 'output', 'solid'),
        port('anchors', 'Anchors', 'output', 'anchor', true),
        port('wall_faces', 'Wall Faces', 'output', 'wall_face', true),
      ]
    case 'bridge_span':
    case 'bridge_deck':
    case 'bridge_supports':
      return [port('from', 'From', 'input', 'anchor'), port('to', 'To', 'input', 'anchor'), port('solid', 'Solid', 'output', 'solid'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'bridge_to_openings':
      return [port('from', 'From', 'input', 'anchor'), port('to', 'To', 'input', 'anchor'), port('opening', 'Openings', 'output', 'opening', true)]
    case 'ribbon_along_path':
    case 'ribbon_path':
    case 'fence_along_path':
    case 'wall_along_path':
    case 'tiled_array_along_path':
      return [port('path', 'Path', 'input', 'path'), port('solid', 'Solid', 'output', 'solid')]
    case 'array_along_path':
      return [port('path', 'Path', 'input', 'path'), port('source', 'Source', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'path_loft':
      return [port('path', 'Path', 'input', 'path'), port('profile', 'Profile', 'input', 'profile'), port('solid', 'Solid', 'output', 'solid')]
    case 'grid_array':
      return [port('source', 'Source', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'union_structure':
    case 'union':
    case 'difference_structure':
    case 'difference':
    case 'intersect_structure':
    case 'intersect':
      return [port('a', 'A', 'input', 'solid'), port('b', 'B', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'attach_to_host':
      return [port('source', 'Source', 'input', 'solid'), port('host', 'Host', 'input', 'solid'), port('solid', 'Solid', 'output', 'solid')]
    case 'mirror':
    case 'transform':
    case 'repeat':
      return [
        port('source', 'Source', 'input', 'solid'),
        port('solid', 'Solid', 'output', 'solid'),
        port('shell', 'Shell', 'output', 'solid'),
        port('floor', 'Floor', 'output', 'solid'),
        port('anchors', 'Anchors', 'output', 'anchor', true),
      ]
    case 'debug_profile':
      return [port('profile', 'Profile', 'input', 'profile'), port('environment', 'Environment', 'output', 'environment')]
    case 'debug_levels':
      return [port('level', 'Levels', 'input', 'level', true), port('environment', 'Environment', 'output', 'environment')]
    case 'debug_openings':
      return [port('opening', 'Openings', 'input', 'opening', true), port('environment', 'Environment', 'output', 'environment')]
    case 'debug_connectors':
      return [port('connector', 'Connectors', 'input', 'connector', true), port('environment', 'Environment', 'output', 'environment')]
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
  {
    key: 'small_house',
    label: 'Small House',
    summary: 'Compact house with room shell, door, windows, and gable roof.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Small House',
      summary: 'House shell with facade semantics.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'small_house', macroKey: 'room' },
      nodes: [
        presetNode('rectangle', 'house_outline', { x: 60, y: 150 }, { width: 9, depth: 6 }, 'House Outline'),
        presetNode('building_level', 'ground_level', { x: 250, y: 60 }, { elevation: 0, height: 3.2, label: 'Ground' }, 'Ground Level'),
        presetNode('room_shell', 'house_shell', { x: 340, y: 150 }, { height: 3.2, wallThickness: 0.24, floorThickness: 0.18 }, 'House Shell'),
        presetNode('door_opening', 'house_entry', { x: 590, y: 80 }, { width: 1.2, height: 2.2 }, 'Front Door'),
        presetNode('opening_array', 'house_windows', { x: 590, y: 220 }, { count: 3, spacing: 2.4, width: 1.2, height: 1.1 }, 'Window Row'),
        presetNode('gable_roof', 'house_roof', { x: 820, y: 150 }, { height: 1.8, eaves: 0.2 }, 'Gable Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1060, y: 150 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outline_to_shell', 'house_outline', 'profile', 'house_shell', 'profile'),
        presetEdge('level_to_shell', 'ground_level', 'level', 'house_shell', 'level'),
        presetEdge('shell_to_door_host', 'house_shell', 'solid', 'house_entry', 'host'),
        presetEdge('wall_face_to_door', 'house_shell', 'wall_faces', 'house_entry', 'wall_face'),
        presetEdge('shell_to_windows_host', 'house_shell', 'solid', 'house_windows', 'host'),
        presetEdge('wall_face_to_windows', 'house_shell', 'wall_faces', 'house_windows', 'wall_face'),
        presetEdge('outline_to_roof', 'house_outline', 'profile', 'house_roof', 'profile'),
        presetEdge('shell_to_roof_host', 'house_shell', 'solid', 'house_roof', 'host'),
        presetEdge('shell_to_output', 'house_shell', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('roof_to_output', 'house_roof', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'townhouse_row',
    label: 'Townhouse Row',
    summary: 'Repeated townhouse module shells and roofs.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Townhouse Row',
      summary: 'Row of repeated townhouse masses.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'townhouse_row', macroKey: 'wing' },
      nodes: [
        presetNode('rectangle', 'townhouse_outline', { x: 70, y: 160 }, { width: 5.5, depth: 7 }, 'Module Outline'),
        presetNode('room_shell', 'townhouse_module', { x: 320, y: 160 }, { height: 3.6, wallThickness: 0.2, floorThickness: 0.18 }, 'Townhouse Module'),
        presetNode('gable_roof', 'townhouse_roof', { x: 540, y: 160 }, { height: 1.5, eaves: 0.08 }, 'Module Roof'),
        presetNode('repeat', 'townhouse_repeat', { x: 760, y: 160 }, { count: 4, offset: { x: 5.6, y: 0, z: 0 } }, 'Repeat Modules'),
        presetNode('repeat', 'roof_repeat', { x: 760, y: 310 }, { count: 4, offset: { x: 5.6, y: 0, z: 0 } }, 'Repeat Roofs'),
        presetNode('environment_output', `${graphKey}.output`, { x: 990, y: 220 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outline_to_module', 'townhouse_outline', 'profile', 'townhouse_module', 'profile'),
        presetEdge('outline_to_roof', 'townhouse_outline', 'profile', 'townhouse_roof', 'profile'),
        presetEdge('module_to_roof_host', 'townhouse_module', 'solid', 'townhouse_roof', 'host'),
        presetEdge('module_to_repeat', 'townhouse_module', 'solid', 'townhouse_repeat', 'source'),
        presetEdge('roof_to_repeat', 'townhouse_roof', 'solid', 'roof_repeat', 'source'),
        presetEdge('modules_to_output', 'townhouse_repeat', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('roofs_to_output', 'roof_repeat', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'castle_gatehouse',
    label: 'Castle Gatehouse',
    summary: 'Gatehouse mass with arched opening and roof.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Castle Gatehouse',
      summary: 'Castle gatehouse with facade opening semantics.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'castle_gatehouse', macroKey: 'courtyard_shell' },
      nodes: [
        presetNode('trapezoid', 'gate_outline', { x: 70, y: 180 }, { topWidth: 10, bottomWidth: 14, depth: 8 }, 'Gate Outline'),
        presetNode('room_shell', 'gatehouse_mass', { x: 330, y: 180 }, { height: 5.5, wallThickness: 0.3, floorThickness: 0.24 }, 'Gatehouse Mass'),
        presetNode('arch_opening', 'gate_arch', { x: 590, y: 180 }, { width: 3.6, height: 4.2 }, 'Main Arch'),
        presetNode('hip_roof', 'gate_roof', { x: 840, y: 180 }, { height: 2.4, eaves: 0.16 }, 'Gate Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1060, y: 180 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outline_to_mass', 'gate_outline', 'profile', 'gatehouse_mass', 'profile'),
        presetEdge('mass_to_arch_host', 'gatehouse_mass', 'solid', 'gate_arch', 'host'),
        presetEdge('face_to_arch', 'gatehouse_mass', 'wall_faces', 'gate_arch', 'wall_face'),
        presetEdge('outline_to_roof', 'gate_outline', 'profile', 'gate_roof', 'profile'),
        presetEdge('mass_to_roof', 'gatehouse_mass', 'solid', 'gate_roof', 'host'),
        presetEdge('mass_to_output', 'gatehouse_mass', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('roof_to_output', 'gate_roof', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'round_tower',
    label: 'Round Tower',
    summary: 'Round tower with tower cap and spiral stair.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Round Tower',
      summary: 'Round tower for tower-cap and spiral-stair testing.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'round_tower', macroKey: 'tower' },
      nodes: [
        presetNode('regular_polygon', 'tower_outline', { x: 70, y: 180 }, { sides: 24, radius: 3.2 }, 'Tower Outline'),
        presetNode('room_shell', 'tower_shell', { x: 320, y: 180 }, { height: 8.2, wallThickness: 0.28, floorThickness: 0.2 }, 'Tower Shell'),
        presetNode('spiral_stair', 'tower_stair', { x: 580, y: 80 }, { radius: 1.35, stepCount: 28, rise: 0.19 }, 'Spiral Stair'),
        presetNode('tower_cap', 'tower_cap_main', { x: 580, y: 260 }, { height: 2.8, taper: 1 }, 'Tower Cap'),
        presetNode('environment_output', `${graphKey}.output`, { x: 860, y: 180 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outline_to_shell', 'tower_outline', 'profile', 'tower_shell', 'profile'),
        presetEdge('outline_to_cap', 'tower_outline', 'profile', 'tower_cap_main', 'profile'),
        presetEdge('shell_to_cap_host', 'tower_shell', 'solid', 'tower_cap_main', 'host'),
        presetEdge('shell_to_output', 'tower_shell', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('cap_to_output', 'tower_cap_main', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('stair_to_output', 'tower_stair', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'bridge_between_towers',
    label: 'Bridge Between Towers',
    summary: 'Two towers linked by an enclosed bridge-room.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Bridge Between Towers',
      summary: 'Tower pair with a dome roof, pointed cap, and enclosed skybridge.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'bridge_between_towers', macroKey: 'bridge' },
      nodes: [
        presetNode('regular_polygon', 'left_tower_outline', { x: 60, y: 120 }, { sides: 20, radius: 2.8 }, 'Left Tower'),
        presetNode('regular_polygon', 'right_tower_outline', { x: 60, y: 320 }, { sides: 20, radius: 2.8 }, 'Right Tower'),
        presetNode('room_shell', 'left_tower_shell', { x: 300, y: 120 }, { height: 7.5, wallThickness: 0.24, floorThickness: 0.18 }, 'Left Tower Shell'),
        presetNode('room_shell', 'right_tower_shell', { x: 300, y: 320 }, { height: 7.5, wallThickness: 0.24, floorThickness: 0.18 }, 'Right Tower Shell'),
        presetNode('transform', 'right_tower_shift', { x: 540, y: 320 }, { translate: { x: 12, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, 'Shift Right Tower'),
        presetNode('dome_roof', 'left_tower_dome', { x: 540, y: 80 }, { height: 1.9, roundness: 1.15, baseThickness: 0.14 }, 'Left Dome Roof'),
        presetNode('tower_cap', 'right_tower_cap', { x: 540, y: 440 }, { height: 2.6, taper: 1 }, 'Right Tower Cap'),
        presetNode('bridge_room', 'tower_bridge_room', { x: 800, y: 220 }, { width: 3.4, wallHeight: 2.9, wallThickness: 0.22, floorThickness: 0.18, roofThickness: 0.18, elevation: 3.1, openingWidth: 1.9, openingHeight: 2.35, overlap: 0.48 }, 'Bridge Room'),
        presetNode('slab', 'left_bridge_plate', { x: 800, y: 100 }, { thickness: 0.18 }, 'Left Bridge Plate'),
        presetNode('slab', 'right_bridge_plate', { x: 800, y: 340 }, { thickness: 0.18 }, 'Right Bridge Plate'),
        presetNode('transform', 'left_bridge_plate_lift', { x: 1000, y: 100 }, { translate: { x: 0, y: 3.1, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, 'Lift Left Plate'),
        presetNode('transform', 'right_bridge_plate_lift', { x: 1000, y: 340 }, { translate: { x: 12, y: 3.1, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, 'Lift Right Plate'),
        presetNode('union_structure', 'bridge_with_left_plate', { x: 1220, y: 160 }, {}, 'Union Left Plate'),
        presetNode('union_structure', 'bridge_with_floor_plates', { x: 1420, y: 220 }, {}, 'Union Floor Plates'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1640, y: 220 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('left_outline_to_shell', 'left_tower_outline', 'profile', 'left_tower_shell', 'profile'),
        presetEdge('right_outline_to_shell', 'right_tower_outline', 'profile', 'right_tower_shell', 'profile'),
        presetEdge('right_shell_to_shift', 'right_tower_shell', 'solid', 'right_tower_shift', 'source'),
        presetEdge('left_outline_to_dome', 'left_tower_outline', 'profile', 'left_tower_dome', 'profile'),
        presetEdge('left_shell_to_dome_host', 'left_tower_shell', 'solid', 'left_tower_dome', 'host'),
        presetEdge('right_outline_to_cap', 'right_tower_outline', 'profile', 'right_tower_cap', 'profile'),
        presetEdge('right_shift_to_cap_host', 'right_tower_shift', 'solid', 'right_tower_cap', 'host'),
        presetEdge('left_anchor_to_bridge_room', 'left_tower_shell', 'anchors', 'tower_bridge_room', 'from'),
        presetEdge('right_anchor_to_bridge_room', 'right_tower_shift', 'anchors', 'tower_bridge_room', 'to'),
        presetEdge('left_shell_to_bridge_host', 'left_tower_shell', 'shell', 'tower_bridge_room', 'from_host'),
        presetEdge('right_shift_to_bridge_host', 'right_tower_shift', 'shell', 'tower_bridge_room', 'to_host'),
        presetEdge('left_outline_to_plate', 'left_tower_outline', 'profile', 'left_bridge_plate', 'profile'),
        presetEdge('right_outline_to_plate', 'right_tower_outline', 'profile', 'right_bridge_plate', 'profile'),
        presetEdge('left_plate_to_lift', 'left_bridge_plate', 'solid', 'left_bridge_plate_lift', 'source'),
        presetEdge('right_plate_to_lift', 'right_bridge_plate', 'solid', 'right_bridge_plate_lift', 'source'),
        presetEdge('bridge_room_to_union_left', 'tower_bridge_room', 'solid', 'bridge_with_left_plate', 'a'),
        presetEdge('left_plate_to_union_left', 'left_bridge_plate_lift', 'solid', 'bridge_with_left_plate', 'b'),
        presetEdge('union_left_to_union_final', 'bridge_with_left_plate', 'solid', 'bridge_with_floor_plates', 'a'),
        presetEdge('right_plate_to_union_final', 'right_bridge_plate_lift', 'solid', 'bridge_with_floor_plates', 'b'),
        presetEdge('core_to_output', 'bridge_with_floor_plates', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('bridge_room_anchors_to_output', 'tower_bridge_room', 'anchors', `${graphKey}.output`, 'anchors'),
        presetEdge('left_dome_to_output', 'left_tower_dome', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('right_cap_to_output', 'right_tower_cap', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'curved_hall_mezzanine',
    label: 'Curved Hall With Mezzanine',
    summary: 'Mixed loop hall with inner void and mezzanine ring.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Curved Hall With Mezzanine',
      summary: 'Curved hall profile with inner void and mezzanine ring.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'curved_hall_mezzanine', macroKey: 'courtyard_shell' },
      nodes: [
        presetNode('mixed_loop', 'hall_outline', { x: 70, y: 180 }, { segments: [{ type: 'line', from: { x: -7, y: -4 }, to: { x: 3, y: -4 } }, { type: 'arc', center: { x: 3, y: 0 }, radius: 4, startAngle: -1.5707963267948966, endAngle: 1.5707963267948966, clockwise: false }, { type: 'line', from: { x: 3, y: 4 }, to: { x: -7, y: 4 } }, { type: 'spline', points: [{ x: -7, y: 4 }, { x: -9, y: 2 }, { x: -9, y: -2 }, { x: -7, y: -4 }], closed: false }] }, 'Curved Hall'),
        presetNode('rectangle', 'hall_void', { x: 70, y: 360 }, { width: 5, depth: 4 }, 'Inner Void'),
        presetNode('profile_holes', 'hall_profile', { x: 330, y: 240 }, {}, 'Hall Profile'),
        presetNode('room_shell', 'hall_shell', { x: 590, y: 140 }, { height: 5.2, wallThickness: 0.24, floorThickness: 0.2 }, 'Hall Shell'),
        presetNode('mezzanine_ring', 'hall_mezzanine', { x: 590, y: 320 }, { elevation: 2.3, thickness: 0.18 }, 'Mezzanine Ring'),
        presetNode('dome_roof', 'hall_dome', { x: 850, y: 140 }, { height: 2.2, roundness: 1 }, 'Dome Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1080, y: 220 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('outline_to_profile', 'hall_outline', 'profile', 'hall_profile', 'profiles'),
        presetEdge('void_to_profile', 'hall_void', 'profile', 'hall_profile', 'profiles'),
        presetEdge('profile_to_shell', 'hall_profile', 'profile_out', 'hall_shell', 'profile'),
        presetEdge('profile_to_mezz', 'hall_profile', 'profile_out', 'hall_mezzanine', 'profile'),
        presetEdge('profile_to_dome', 'hall_profile', 'profile_out', 'hall_dome', 'profile'),
        presetEdge('shell_to_dome_host', 'hall_shell', 'solid', 'hall_dome', 'host'),
        presetEdge('shell_to_output', 'hall_shell', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('mezz_to_output', 'hall_mezzanine', 'surface', `${graphKey}.output`, 'surfaces'),
        presetEdge('dome_to_output', 'hall_dome', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'wall_fence_path_array',
    label: 'Wall + Fence + Path Array',
    summary: 'Curved path driving fence, wall, ribbon, and repeated arrays.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Wall + Fence + Path Array',
      summary: 'Path-driven environment assembly test.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'wall_fence_path_array', macroKey: 'path_array' },
      nodes: [
        presetNode('spline', 'site_path', { x: 80, y: 180 }, { points: [{ x: -10, y: 0 }, { x: -3, y: 4 }, { x: 5, y: -3 }, { x: 12, y: 2 }] }, 'Site Path'),
        presetNode('ribbon_along_path', 'walkway_ribbon', { x: 350, y: 80 }, { width: 2.2, thickness: 0.14 }, 'Walkway Ribbon'),
        presetNode('wall_along_path', 'site_wall', { x: 350, y: 180 }, { thickness: 0.24, height: 2.8 }, 'Site Wall'),
        presetNode('fence_along_path', 'site_fence', { x: 350, y: 280 }, { postSpacing: 1.8, height: 1.4 }, 'Site Fence'),
        presetNode('box', 'array_post', { x: 350, y: 390 }, { width: 0.3, height: 1.4, depth: 0.3 }, 'Array Post'),
        presetNode('array_along_path', 'post_array', { x: 620, y: 390 }, { spacing: 2 }, 'Array Along Path'),
        presetNode('environment_output', `${graphKey}.output`, { x: 920, y: 220 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('path_to_ribbon', 'site_path', 'path', 'walkway_ribbon', 'path'),
        presetEdge('path_to_wall', 'site_path', 'path', 'site_wall', 'path'),
        presetEdge('path_to_fence', 'site_path', 'path', 'site_fence', 'path'),
        presetEdge('path_to_array', 'site_path', 'path', 'post_array', 'path'),
        presetEdge('source_to_array', 'array_post', 'solid', 'post_array', 'source'),
        presetEdge('ribbon_to_output', 'walkway_ribbon', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('wall_to_output', 'site_wall', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('fence_to_output', 'site_fence', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('array_to_output', 'post_array', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
]

export const environmentAssemblyPresetsByKey = new Map(
  environmentAssemblyPresets.map((preset) => [preset.key, preset] as const),
)

export const environmentAssemblyMacroLibrary: EnvironmentMacroDefinition[] = [
  { key: 'room', label: 'Room', summary: 'Generate a compact room or house shell.', presetKey: 'small_house', examplePrompt: 'room with a front door and three windows' },
  { key: 'wing', label: 'Wing', summary: 'Generate a repeated structural wing.', presetKey: 'townhouse_row', examplePrompt: 'townhouse wing with repeating gable roofs' },
  { key: 'tower', label: 'Tower', summary: 'Generate a tower with roof cap and stairs.', presetKey: 'round_tower', examplePrompt: 'round tower with a spiral stair and tower cap' },
  { key: 'bridge', label: 'Bridge', summary: 'Link two structures with a bridge span.', presetKey: 'bridge_between_towers', examplePrompt: 'bridge between two towers' },
  { key: 'courtyard_shell', label: 'Courtyard Shell', summary: 'Generate a shell with internal void or yard.', presetKey: 'curved_hall_mezzanine', examplePrompt: 'curved hall with an inner void and mezzanine ring' },
  { key: 'gable_roof', label: 'Gable Roof', summary: 'Apply a gable roof to a host shell.', presetKey: 'small_house', examplePrompt: 'gable roof with small eaves' },
  { key: 'window_row', label: 'Window Row', summary: 'Place repeated windows along a wall face.', presetKey: 'small_house', examplePrompt: 'row of windows along the front wall' },
  { key: 'switchback_stair', label: 'Switchback Stair', summary: 'Generate a switchback stair between levels.', presetKey: null, examplePrompt: 'switchback stair to mezzanine' },
]

export function expandEnvironmentMacroToGraph(macroKey: string, graphKey: string, environmentKey?: string | null) {
  const macro = environmentAssemblyMacroLibrary.find((entry) => entry.key === macroKey)
  if (!macro?.presetKey) return null
  const preset = environmentAssemblyPresetsByKey.get(macro.presetKey)
  return preset ? preset.build(graphKey, environmentKey) : null
}

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
