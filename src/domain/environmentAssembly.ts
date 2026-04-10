import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const assemblyValueTypeSchema = z.enum([
  'profile',
  'path',
  'solid',
  'surface',
  'level',
  'room',
  'wall_face',
  'wall_segment',
  'opening',
  'window',
  'bridge',
  'stair',
  'slab_void',
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
  'storey_stack',
  'footprint',
  'wall_run',
  'wall_style',
  'wall_shell',
  'room',
  'room_shell',
  'room_on_level',
  'circulation_zone',
  'floor_plate',
  'floor_fill',
  'floor_slab',
  'ceiling_slab',
  'ceiling_fill',
  'mezzanine',
  'mezzanine_ring',
  'slab_void',
  'stair',
  'stair_run',
  'switchback_stair',
  'spiral_stair',
  'stair_core',
  'stair_core_v2',
  'stair_shaft',
  'landing',
  'landing_stack',
  'landing_stack_v2',
  'mezzanine_anchor',
  'stair_connection',
  'stair_to_level',
  'opening',
  'door_opening',
  'window_opening',
  'opening_array',
  'arch_opening',
  'connector_opening',
  'doorway',
  'door_between_rooms',
  'opening_on_wall_segment',
  'partition_walls_from_rooms',
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

export const environmentGeometryBindingSourceModeSchema = z.enum(['mesh', 'procedural_graph', 'procedural_blueprint'])
export const environmentCompilerTargetSchema = z.enum(['preview_mesh', 'spatial_document'])
export const environmentGeometryUnitsSchema = z.enum(['meters', 'generic'])

export const environmentGeometryBindingConfigSchema = z.object({
  sourceMode: environmentGeometryBindingSourceModeSchema.default('mesh'),
  assemblyGraphKey: z.string().nullable().default(null),
  environmentBlueprintKey: z.string().nullable().default(null),
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
    'partition_wall',
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
  roomId: z.string().nullable().default(null),
  levelId: z.string().nullable().default(null),
  parentStructureId: z.string().nullable().default(null),
  profileId: z.string().nullable().default(null),
  floorElevation: z.number().default(0),
  ceilingElevation: z.number().default(3),
  adjacencyTags: z.array(z.string()).default([]),
  topologyOwned: z.boolean().default(false),
  movablePartition: z.boolean().default(false),
  zoneOwned: z.boolean().default(false),
  circulationOwned: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
})

export const structureFootprintSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  shapeKind: z.enum(['polygon', 'round', 'mixed']).default('polygon'),
  outerLoop: boundaryLoopSchema,
  innerLoops: z.array(boundaryLoopSchema).default([]),
  metadata: looseRecordSchema.default({}),
})

export const verticalBandSchema = z.object({
  id: z.string(),
  baseElevation: z.number().default(0),
  topElevation: z.number().default(0),
  metadata: looseRecordSchema.default({}),
})

export const shellBandSpecSchema = z.object({
  id: z.string(),
  sourceNodeKeys: z.array(z.string()).default([]),
  outerLoop: boundaryLoopSchema,
  innerLoops: z.array(boundaryLoopSchema).default([]),
  baseElevation: z.number().default(0),
  topElevation: z.number().default(0),
  floorAtBase: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
})

export const structuralFusionSpecSchema = z.object({
  id: z.string(),
  sourceNodeKeys: z.array(z.string()).default([]),
  overlapBand: verticalBandSchema,
  fusedOuterLoop: boundaryLoopSchema,
  fusedInnerLoops: z.array(boundaryLoopSchema).default([]),
  remainderBands: z.array(shellBandSpecSchema).default([]),
  metadata: looseRecordSchema.default({}),
})

export const levelSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  levelId: z.string().nullable().default(null),
  index: z.number().int().nonnegative().default(0),
  label: z.string(),
  baseElevation: z.number().default(0),
  topElevation: z.number().default(3),
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
  levelId: z.string().nullable().default(null),
  wallRole: z.enum(['exterior', 'partition']).default('exterior'),
  ownerRoomIds: z.array(z.string()).default([]),
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
  hostWallSegmentId: z.string().nullable().default(null),
  levelId: z.string().nullable().default(null),
  fromRoomId: z.string().nullable().default(null),
  toRoomId: z.string().nullable().default(null),
  kind: z.enum(['opening', 'doorway']),
  openingRole: z.enum(['exterior', 'interior', 'circulation']).default('exterior'),
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
  stairFamily: z.enum(['straight', 'l_stair', 'u_stair', 'winder_l', 'winder_u', 'spiral', 'mezzanine']).default('straight'),
  fromLevelId: z.string().nullable().default(null),
  toLevelId: z.string().nullable().default(null),
  shaftId: z.string().nullable().default(null),
  zoneId: z.string().nullable().default(null),
  clearanceEnvelope: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
  landingIds: z.array(z.string()).default([]),
  bottomLandingId: z.string().nullable().default(null),
  topLandingId: z.string().nullable().default(null),
  intermediateLandingIds: z.array(z.string()).default([]),
  requiredEnvelope: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
  resolvedEnvelope: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
  fitStatus: z.enum(['fit', 'autofit', 'overflow', 'invalid']).default('fit'),
  diagnostics: z.array(z.string()).default([]),
  riseCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
})

export const wallSegmentSpecSchema = z.object({
  id: z.string(),
  sourceNodeKeys: z.array(z.string()).default([]),
  levelId: z.string().nullable().default(null),
  wallRole: z.enum(['exterior', 'partition']).default('exterior'),
  start: z.tuple([z.number(), z.number(), z.number()]),
  end: z.tuple([z.number(), z.number(), z.number()]),
  thickness: z.number().positive().default(0.2),
  height: z.number().positive().default(3),
  ownerRoomIds: z.array(z.string()).default([]),
  movablePartition: z.boolean().default(false),
  zoneOwned: z.boolean().default(false),
  circulationOwned: z.boolean().default(false),
  metadata: looseRecordSchema.default({}),
})

export const partitionWallSpecSchema = z.object({
  id: z.string(),
  sourceNodeKeys: z.array(z.string()).default([]),
  wallSegmentId: z.string(),
  levelId: z.string().nullable().default(null),
  fromRoomId: z.string().nullable().default(null),
  toRoomId: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
})

export const roomAdjacencySpecSchema = z.object({
  id: z.string(),
  levelId: z.string().nullable().default(null),
  fromRoomId: z.string().nullable().default(null),
  toRoomId: z.string().nullable().default(null),
  wallSegmentId: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
})

export const slabVoidSpecSchema = z.object({
  id: z.string(),
  sourceNodeKey: z.string(),
  stairId: z.string().nullable().default(null),
  hostLevelId: z.string().nullable().default(null),
  hostSolidId: z.string().nullable().default(null),
  voidRole: z.enum(['stair_run', 'landing_clearance', 'mezzanine_connection']).default('stair_run'),
  outerLoop: boundaryLoopSchema,
  bottomElevation: z.number().default(0),
  topElevation: z.number().default(0),
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
  structureFootprints: z.array(structureFootprintSchema).default([]),
  shellBands: z.array(shellBandSpecSchema).default([]),
  structuralFusions: z.array(structuralFusionSpecSchema).default([]),
  levels: z.array(levelSpecSchema).default([]),
  wallRuns: z.array(wallRunSpecSchema).default([]),
  wallFaces: z.array(wallFaceSpecSchema).default([]),
  wallSegments: z.array(wallSegmentSpecSchema).default([]),
  partitionWalls: z.array(partitionWallSpecSchema).default([]),
  roomAdjacency: z.array(roomAdjacencySpecSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  connectors: z.array(connectorSchema).default([]),
  rooms: z.array(roomVolumeSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  windows: z.array(windowSpecSchema).default([]),
  roofs: z.array(roofSpecSchema).default([]),
  bridges: z.array(bridgeSpecSchema).default([]),
  stairs: z.array(stairRunSpecSchema).default([]),
  slabVoids: z.array(slabVoidSpecSchema).default([]),
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
  wallSegments: z.array(wallSegmentSpecSchema).default([]),
  partitionWalls: z.array(partitionWallSpecSchema).default([]),
  roomAdjacency: z.array(roomAdjacencySpecSchema).default([]),
  anchors: z.array(anchorSchema).default([]),
  openings: z.array(openingSpecSchema).default([]),
  windows: z.array(windowSpecSchema).default([]),
  bridges: z.array(bridgeSpecSchema).default([]),
  stairs: z.array(stairRunSpecSchema).default([]),
  slabVoids: z.array(slabVoidSpecSchema).default([]),
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
export type StructureFootprint = z.infer<typeof structureFootprintSchema>
export type VerticalBand = z.infer<typeof verticalBandSchema>
export type ShellBandSpec = z.infer<typeof shellBandSpecSchema>
export type StructuralFusionSpec = z.infer<typeof structuralFusionSpecSchema>
export type LevelSpec = z.infer<typeof levelSpecSchema>
export type WallRunSpec = z.infer<typeof wallRunSpecSchema>
export type WallFaceSpec = z.infer<typeof wallFaceSpecSchema>
export type OpeningSpec = z.infer<typeof openingSpecSchema>
export type WindowSpec = z.infer<typeof windowSpecSchema>
export type RoofSpec = z.infer<typeof roofSpecSchema>
export type BridgeSpec = z.infer<typeof bridgeSpecSchema>
export type StairRunSpec = z.infer<typeof stairRunSpecSchema>
export type WallSegmentSpec = z.infer<typeof wallSegmentSpecSchema>
export type PartitionWallSpec = z.infer<typeof partitionWallSpecSchema>
export type RoomAdjacencySpec = z.infer<typeof roomAdjacencySpecSchema>
export type SlabVoidSpec = z.infer<typeof slabVoidSpecSchema>
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
  environmentBlueprintKey: null,
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
      { key: 'storey_stack', label: 'Storey Stack', groupKey: 'building', defaultTitle: 'Storey Stack', summary: 'Explicit storey stack with level ids and slab data.', defaultParams: { count: 2, baseElevation: 0, levelHeight: 3.2, slabThickness: 0.18, labelPrefix: 'Level' } },
      { key: 'footprint', label: 'Footprint', groupKey: 'building', defaultTitle: 'Footprint', summary: 'Normalize a profile for building assembly.' },
      { key: 'wall_run', label: 'Wall Run', groupKey: 'building', defaultTitle: 'Wall Run', summary: 'Semantic wall run with wall face output.', defaultParams: { height: 3.2, thickness: 0.22 } },
      { key: 'wall_style', label: 'Wall Style', groupKey: 'building', defaultTitle: 'Wall Style', summary: 'Styling node for wall thickness and facade metadata.', defaultParams: { thickness: 0.22 } },
      { key: 'wall_shell', label: 'Wall Shell', groupKey: 'building', defaultTitle: 'Wall Shell', summary: 'Create walls around a footprint.', defaultParams: { height: 3, thickness: 0.2 } },
      { key: 'room', label: 'Room', groupKey: 'building', defaultTitle: 'Room', summary: 'Create walls and floor from a footprint.', defaultParams: { height: 3, wallThickness: 0.2, floorThickness: 0.2 } },
      { key: 'room_shell', label: 'Room Shell', groupKey: 'building', defaultTitle: 'Room Shell', summary: 'High-level room shell that emits wall faces and anchors.', defaultParams: { height: 3.2, wallThickness: 0.22, floorThickness: 0.18 } },
      { key: 'room_on_level', label: 'Room On Level', groupKey: 'building', defaultTitle: 'Room On Level', summary: 'Create one room volume on a selected explicit level.', defaultParams: { levelIndex: 1, roomName: 'Room', wallThickness: 0.22, floorThickness: 0.18, height: 3.2 } },
      { key: 'circulation_zone', label: 'Circulation Zone', groupKey: 'building', defaultTitle: 'Circulation Zone', summary: 'Topology-owned stair hall or circulation room with bounded auto-fit.', defaultParams: { levelIndex: 1, roomName: 'Circulation Zone', wallThickness: 0.2, floorThickness: 0.18, height: 3.2, fitMode: 'zone_autofit', maxExpandX: 1.2, maxExpandZ: 1.2, allowPartitionPush: true, clearanceMargin: 0.22 } },
      { key: 'floor_plate', label: 'Floor Plate', groupKey: 'building', defaultTitle: 'Floor Plate', summary: 'Triangulated floor surface.', defaultParams: { elevation: 0, thickness: 0.18 } },
      { key: 'floor_fill', label: 'Floor Fill', groupKey: 'building', defaultTitle: 'Floor Fill', summary: 'Semantic floor fill from a profile.', defaultParams: { elevation: 0, thickness: 0.18 } },
      { key: 'floor_slab', label: 'Floor Slab', groupKey: 'building', defaultTitle: 'Floor Slab', summary: 'Standalone structural slab attached to a level.', defaultParams: { levelIndex: 1, thickness: 0.18 } },
      { key: 'ceiling_slab', label: 'Ceiling Slab', groupKey: 'building', defaultTitle: 'Ceiling Slab', summary: 'Ceiling or upper slab attached to a level top.', defaultParams: { levelIndex: 1, thickness: 0.18 } },
      { key: 'ceiling_fill', label: 'Ceiling Fill', groupKey: 'building', defaultTitle: 'Ceiling Fill', summary: 'Ceiling fill from a profile.', defaultParams: { elevation: 3, thickness: 0.14 } },
      { key: 'mezzanine', label: 'Mezzanine', groupKey: 'building', defaultTitle: 'Mezzanine', summary: 'Elevated floor plate with holes.', defaultParams: { elevation: 1.5, thickness: 0.18 } },
      { key: 'mezzanine_ring', label: 'Mezzanine Ring', groupKey: 'building', defaultTitle: 'Mezzanine Ring', summary: 'Mezzanine fill around a hole or courtyard.', defaultParams: { elevation: 2.2, thickness: 0.18 } },
      { key: 'slab_void', label: 'Slab Void', groupKey: 'building', defaultTitle: 'Slab Void', summary: 'Carve a void through host slabs on a selected level.', defaultParams: { levelIndex: 2, bottomOffset: 0, topOffset: 0.4 } },
      { key: 'stair', label: 'Stair', groupKey: 'building', defaultTitle: 'Stair', summary: 'Straight stair block.', defaultParams: { width: 1.8, stepCount: 8, rise: 0.18, tread: 0.28 } },
      { key: 'stair_run', label: 'Stair Run', groupKey: 'building', defaultTitle: 'Stair Run', summary: 'Semantic stair run between levels.', defaultParams: { width: 1.8, stepCount: 10, rise: 0.18, tread: 0.28 } },
      { key: 'switchback_stair', label: 'Switchback Stair', groupKey: 'building', defaultTitle: 'Switchback Stair', summary: 'Two-run switchback stair with landing.', defaultParams: { width: 2, stepCount: 12, rise: 0.18, tread: 0.28, landingDepth: 2.2 } },
      { key: 'spiral_stair', label: 'Spiral Stair', groupKey: 'building', defaultTitle: 'Spiral Stair', summary: 'Spiral stair for towers.', defaultParams: { radius: 1.4, stepCount: 18, rise: 0.18 } },
      { key: 'stair_core', label: 'Stair Core', groupKey: 'building', defaultTitle: 'Stair Core', summary: 'Host-aware stair core between explicit levels with slab cutouts.', defaultParams: { stairType: 'switchback', fromLevelIndex: 1, toLevelIndex: 2, width: 2.2, depth: 4.6, rise: 0.18, tread: 0.28, landingDepth: 2.4, offset: { x: 0, y: 0, z: 0 } } },
      { key: 'stair_core_v2', label: 'Stair Core V2', groupKey: 'building', defaultTitle: 'Stair Core', summary: 'Zone-aware stair solver for topology-owned circulation halls.', defaultParams: { stairFamily: 'u_stair', targetElevationMode: 'level_top', fromLevelIndex: 1, toLevelIndex: 2, width: 2.2, tread: 0.28, maxRise: 0.18, landingDepth: 2.4, turnDirection: 'right', headroom: 2.1, wallClearance: 0.16, fitMode: 'zone_autofit' } },
      { key: 'stair_shaft', label: 'Stair Shaft', groupKey: 'building', defaultTitle: 'Stair Shaft', summary: 'Void shaft footprint for stair and circulation cutouts.', defaultParams: { fromLevelIndex: 1, toLevelIndex: 2, width: 2.6, depth: 4.8 } },
      { key: 'landing', label: 'Landing', groupKey: 'building', defaultTitle: 'Landing', summary: 'Landing slab.', defaultParams: { width: 2, depth: 2, thickness: 0.18, elevation: 1.44 } },
      { key: 'landing_stack', label: 'Landing Stack', groupKey: 'building', defaultTitle: 'Landing Stack', summary: 'Generate circulation landings across explicit levels.', defaultParams: { fromLevelIndex: 1, toLevelIndex: 2, width: 2.2, depth: 2.2, thickness: 0.18 } },
      { key: 'landing_stack_v2', label: 'Landing Stack V2', groupKey: 'building', defaultTitle: 'Landing Stack', summary: 'Zone-aware landing generation across explicit levels.', defaultParams: { fromLevelIndex: 1, toLevelIndex: 2, width: 2.2, depth: 2.2, thickness: 0.18 } },
      { key: 'mezzanine_anchor', label: 'Mezzanine Anchor', groupKey: 'building', defaultTitle: 'Mezzanine Anchor', summary: 'Explicit stair target on a mezzanine or intermediate elevation.', defaultParams: { elevation: 2.3, offset: { x: 0, y: 0, z: 0 } } },
      { key: 'stair_connection', label: 'Stair Connection', groupKey: 'building', defaultTitle: 'Stair Connection', summary: 'Connect stair landings to adjacent rooms or wall hosts.', defaultParams: { connectionMode: 'door', landing: 'auto', width: 1.1, height: 2.2, offset: 0 } },
      { key: 'stair_to_level', label: 'Stair To Level', groupKey: 'building', defaultTitle: 'Stair To Level', summary: 'Semantic stair-level connector.' },
      { key: 'opening', label: 'Opening', groupKey: 'building', defaultTitle: 'Opening', summary: 'Generic opening metadata.', defaultParams: { width: 1.4, height: 2.2 } },
      { key: 'door_opening', label: 'Door Opening', groupKey: 'building', defaultTitle: 'Door Opening', summary: 'Door opening attached to wall faces or host solids.', defaultParams: { width: 1.1, height: 2.2 } },
      { key: 'window_opening', label: 'Window Opening', groupKey: 'building', defaultTitle: 'Window Opening', summary: 'Window opening with sill height.', defaultParams: { width: 1.4, height: 1.2, sillHeight: 0.9 } },
      { key: 'opening_array', label: 'Opening Array', groupKey: 'building', defaultTitle: 'Opening Array', summary: 'Repeat openings along a wall face.', defaultParams: { count: 3, spacing: 2.2, width: 1.1, height: 1.2 } },
      { key: 'arch_opening', label: 'Arch Opening', groupKey: 'building', defaultTitle: 'Arch Opening', summary: 'Arched opening for gates and entries.', defaultParams: { width: 2.2, height: 3.4 } },
      { key: 'connector_opening', label: 'Connector Opening', groupKey: 'building', defaultTitle: 'Connector Opening', summary: 'Opening driven by bridge or connector alignment.', defaultParams: { width: 1.8, height: 2.6 } },
      { key: 'doorway', label: 'Doorway', groupKey: 'building', defaultTitle: 'Doorway', summary: 'Door opening metadata.', defaultParams: { width: 1.1, height: 2.2 } },
      { key: 'door_between_rooms', label: 'Door Between Rooms', groupKey: 'building', defaultTitle: 'Door Between Rooms', summary: 'Generate an interior doorway on the partition between adjacent rooms.', defaultParams: { fromRoomIndex: 1, toRoomIndex: 2, width: 1.05, height: 2.1, offset: 0 } },
      { key: 'opening_on_wall_segment', label: 'Opening On Wall Segment', groupKey: 'building', defaultTitle: 'Opening On Wall Segment', summary: 'Manually place an opening on a derived wall segment.', defaultParams: { width: 1.1, height: 2.1, openingRole: 'interior', offset: 0 } },
      { key: 'partition_walls_from_rooms', label: 'Partitions From Rooms', groupKey: 'building', defaultTitle: 'Partitions From Rooms', summary: 'Derive partition walls and adjacency from room volumes on a level.' },
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
    case 'storey_stack':
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
    case 'floor_slab':
    case 'ceiling_slab':
    case 'ceiling_fill':
    case 'mezzanine':
    case 'mezzanine_ring':
      return [
        port('profile', 'Profile', 'input', 'profile'),
        port('level', 'Level', 'input', 'level'),
        ...(kind === 'floor_slab' || kind === 'ceiling_slab' ? [port('voids', 'Voids', 'input', 'slab_void', true), port('solid', 'Solid', 'output', 'solid')] : []),
        port('surface', 'Surface', 'output', 'surface'),
      ]
    case 'footprint':
      return [port('profile', 'Profile In', 'input', 'profile'), port('profile_out', 'Profile', 'output', 'profile')]
    case 'wall_run':
    case 'wall_shell':
    case 'room':
    case 'room_shell':
    case 'room_on_level':
    case 'circulation_zone':
      return [
        port('profile', 'Profile', 'input', 'profile'),
        port('level', 'Level', 'input', 'level'),
        port('solid', 'Solid', 'output', 'solid'),
        port('shell', 'Shell', 'output', 'solid'),
        ...(kind === 'room' || kind === 'room_shell' || kind === 'room_on_level' ? [port('floor', 'Floor', 'output', 'solid'), port('room', 'Room', 'output', 'room')] : []),
        port('wall_faces', 'Wall Faces', 'output', 'wall_face', true),
        port('anchors', 'Anchors', 'output', 'anchor', true),
      ]
    case 'wall_style':
      return [port('style', 'Style', 'output', 'debug')]
    case 'stair':
    case 'stair_run':
    case 'switchback_stair':
    case 'spiral_stair':
    case 'stair_core':
    case 'stair_core_v2':
    case 'stair_shaft':
    case 'landing':
    case 'landing_stack':
    case 'landing_stack_v2':
    case 'mezzanine_anchor':
    case 'stair_connection':
      return [
        ...(kind === 'stair_core' || kind === 'stair_core_v2' || kind === 'landing_stack' || kind === 'landing_stack_v2' || kind === 'stair_shaft'
          ? [port('levels', 'Levels', 'input', 'level', true)]
          : []),
        ...(kind === 'stair_core_v2'
          ? [port('zone', 'Zone', 'input', 'room'), port('target', 'Target', 'input', 'anchor', true)]
          : []),
        ...(kind === 'landing_stack_v2'
          ? [port('zone', 'Zone', 'input', 'room')]
          : []),
        ...(kind === 'mezzanine_anchor'
          ? [port('host', 'Host', 'input', 'solid', true), port('anchor', 'Anchor', 'output', 'anchor')]
          : []),
        ...(kind === 'stair_connection'
          ? [port('stair', 'Stair', 'input', 'stair'), port('rooms', 'Rooms', 'input', 'room', true), port('wall_segment', 'Wall Segment', 'input', 'wall_segment'), port('opening', 'Opening', 'output', 'opening'), port('anchors', 'Anchors', 'output', 'anchor', true)]
          : []),
        ...(kind === 'mezzanine_anchor' || kind === 'stair_connection'
          ? []
          : [
        port('solid', 'Solid', 'output', 'solid'),
        ...(kind === 'stair_core' || kind === 'stair_core_v2' || kind === 'stair_shaft' ? [port('void', 'Void', 'output', 'slab_void', true), port('stair', 'Stair', 'output', 'stair')] : []),
        port('anchors', 'Anchors', 'output', 'anchor', true),
          ]),
      ]
    case 'slab_void':
      return [port('profile', 'Profile', 'input', 'profile'), port('level', 'Level', 'input', 'level'), port('void', 'Void', 'output', 'slab_void')]
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
    case 'door_between_rooms':
      return [port('rooms', 'Rooms', 'input', 'room', true), port('opening', 'Opening', 'output', 'opening'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'opening_on_wall_segment':
      return [port('wall_segment', 'Wall Segment', 'input', 'wall_segment'), port('opening', 'Opening', 'output', 'opening'), port('anchors', 'Anchors', 'output', 'anchor', true)]
    case 'partition_walls_from_rooms':
      return [port('rooms', 'Rooms', 'input', 'room', true), port('solid', 'Solid', 'output', 'solid', true), port('wall_faces', 'Wall Faces', 'output', 'wall_face', true), port('wall_segments', 'Wall Segments', 'output', 'wall_segment', true)]
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
    summary: 'Two-storey house with explicit levels, stair core, and an interior doorway.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Small House',
      summary: 'Two-storey house with explicit storeys, stair void, and interior door.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'small_house', macroKey: 'room' },
      nodes: [
        presetNode('polygon', 'house_outline', { x: 60, y: 60 }, { points: [{ x: -4.5, y: -3 }, { x: 4.5, y: -3 }, { x: 4.5, y: 3 }, { x: -4.5, y: 3 }] }, 'House Outline'),
        presetNode('polygon', 'house_front_room_profile', { x: 60, y: 150 }, { points: [{ x: -4.5, y: -3 }, { x: 1.8, y: -3 }, { x: 1.8, y: 0 }, { x: -4.5, y: 0 }] }, 'Front Room Profile'),
        presetNode('polygon', 'house_rear_room_profile', { x: 60, y: 300 }, { points: [{ x: -4.5, y: 0 }, { x: 1.8, y: 0 }, { x: 1.8, y: 3 }, { x: -4.5, y: 3 }] }, 'Rear Room Profile'),
        presetNode('polygon', 'house_upper_profile', { x: 60, y: 450 }, { points: [{ x: -4.5, y: -3 }, { x: 1.8, y: -3 }, { x: 1.8, y: 3 }, { x: -4.5, y: 3 }] }, 'Upper Floor Profile'),
        presetNode('polygon', 'house_stair_zone_profile', { x: 60, y: 600 }, { points: [{ x: 1.8, y: -3 }, { x: 4.5, y: -3 }, { x: 4.5, y: 3 }, { x: 1.8, y: 3 }] }, 'Stair Hall Profile'),
        presetNode('storey_stack', 'house_storeys', { x: 280, y: 150 }, { count: 2, baseElevation: 0, levelHeight: 3.2, slabThickness: 0.18, labelPrefix: 'House Level' }, 'Storeys'),
        presetNode('room_on_level', 'house_front_room', { x: 520, y: 90 }, { levelIndex: 1, roomName: 'Front Room', height: 3.2, wallThickness: 0.24, floorThickness: 0.18 }, 'Front Room'),
        presetNode('room_on_level', 'house_rear_room', { x: 520, y: 250 }, { levelIndex: 1, roomName: 'Rear Room', height: 3.2, wallThickness: 0.24, floorThickness: 0.18 }, 'Rear Room'),
        presetNode('room_on_level', 'house_upper_room', { x: 520, y: 420 }, { levelIndex: 2, roomName: 'Upper Room', height: 3.2, wallThickness: 0.22, floorThickness: 0.18 }, 'Upper Room'),
        presetNode('circulation_zone', 'house_stair_zone', { x: 520, y: 580 }, { levelIndex: 1, toLevelIndex: 2, roomName: 'Stair Hall', height: 3.2, wallThickness: 0.2, floorThickness: 0.18, fitMode: 'zone_autofit', maxExpandX: 0.8, maxExpandZ: 0.8, allowPartitionPush: false }, 'Stair Hall'),
        presetNode('door_between_rooms', 'house_interior_door', { x: 760, y: 170 }, { width: 1.05, height: 2.1 }, 'Interior Door'),
        presetNode('stair_core_v2', 'house_stair', { x: 760, y: 320 }, { stairFamily: 'straight', fromLevelIndex: 1, toLevelIndex: 2, width: 1.55, tread: 0.26, maxRise: 0.2, landingDepth: 1.3, fitMode: 'zone_autofit' }, 'Stair Core'),
        presetNode('stair_connection', 'house_stair_ground_connection', { x: 760, y: 470 }, { connectionMode: 'door', landing: 'bottom', width: 1.1, height: 2.2 }, 'Ground Stair Doors'),
        presetNode('stair_connection', 'house_stair_upper_connection', { x: 760, y: 560 }, { connectionMode: 'door', landing: 'top', width: 1.1, height: 2.2 }, 'Upper Stair Door'),
        presetNode('door_opening', 'house_entry', { x: 980, y: 90 }, { side: 'front', width: 1.2, height: 2.2 }, 'Front Door'),
        presetNode('opening_array', 'house_windows', { x: 980, y: 220 }, { side: 'front', count: 3, spacing: 2.4, width: 1.2, height: 1.1, sillHeight: 0.9 }, 'Window Row'),
        presetNode('opening_array', 'house_upper_windows', { x: 980, y: 320 }, { side: 'front', count: 2, spacing: 2.2, width: 1.05, height: 1.15, sillHeight: 0.95 }, 'Upper Windows'),
        presetNode('gable_roof', 'house_roof', { x: 980, y: 420 }, { height: 1.8, eaves: 0.2 }, 'Gable Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1230, y: 250 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('front_profile_to_room', 'house_front_room_profile', 'profile', 'house_front_room', 'profile'),
        presetEdge('rear_profile_to_room', 'house_rear_room_profile', 'profile', 'house_rear_room', 'profile'),
        presetEdge('upper_profile_to_room', 'house_upper_profile', 'profile', 'house_upper_room', 'profile'),
        presetEdge('stair_profile_to_zone', 'house_stair_zone_profile', 'profile', 'house_stair_zone', 'profile'),
        presetEdge('storeys_to_front_room', 'house_storeys', 'levels', 'house_front_room', 'level'),
        presetEdge('storeys_to_rear_room', 'house_storeys', 'levels', 'house_rear_room', 'level'),
        presetEdge('storeys_to_upper_room', 'house_storeys', 'levels', 'house_upper_room', 'level'),
        presetEdge('storeys_to_zone', 'house_storeys', 'levels', 'house_stair_zone', 'level'),
        presetEdge('front_room_to_interior_door', 'house_front_room', 'room', 'house_interior_door', 'rooms'),
        presetEdge('rear_room_to_interior_door', 'house_rear_room', 'room', 'house_interior_door', 'rooms'),
        presetEdge('storeys_to_stair', 'house_storeys', 'levels', 'house_stair', 'levels'),
        presetEdge('zone_to_stair', 'house_stair_zone', 'room', 'house_stair', 'zone'),
        presetEdge('stair_to_ground_connection', 'house_stair', 'stair', 'house_stair_ground_connection', 'stair'),
        presetEdge('front_room_to_ground_connection', 'house_front_room', 'room', 'house_stair_ground_connection', 'rooms'),
        presetEdge('rear_room_to_ground_connection', 'house_rear_room', 'room', 'house_stair_ground_connection', 'rooms'),
        presetEdge('stair_to_upper_connection', 'house_stair', 'stair', 'house_stair_upper_connection', 'stair'),
        presetEdge('upper_room_to_upper_connection', 'house_upper_room', 'room', 'house_stair_upper_connection', 'rooms'),
        presetEdge('front_room_to_door_host', 'house_front_room', 'solid', 'house_entry', 'host'),
        presetEdge('front_room_to_door_face', 'house_front_room', 'wall_faces', 'house_entry', 'wall_face'),
        presetEdge('front_room_to_windows_host', 'house_front_room', 'solid', 'house_windows', 'host'),
        presetEdge('front_room_to_windows_face', 'house_front_room', 'wall_faces', 'house_windows', 'wall_face'),
        presetEdge('upper_room_to_upper_windows_host', 'house_upper_room', 'solid', 'house_upper_windows', 'host'),
        presetEdge('upper_room_to_upper_windows_face', 'house_upper_room', 'wall_faces', 'house_upper_windows', 'wall_face'),
        presetEdge('outline_to_roof', 'house_outline', 'profile', 'house_roof', 'profile'),
        presetEdge('upper_room_to_roof_host', 'house_upper_room', 'solid', 'house_roof', 'host'),
        presetEdge('front_room_to_output', 'house_front_room', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('rear_room_to_output', 'house_rear_room', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('upper_room_to_output', 'house_upper_room', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('zone_to_output', 'house_stair_zone', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('stair_to_output', 'house_stair', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('roof_to_output', 'house_roof', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'townhouse_row',
    label: 'Townhouse Terrace',
    summary: 'Three attached townhouses with party walls, explicit storeys, and per-unit stairs.',
    build: (graphKey, environmentKey) => {
      const outputKey = `${graphKey}.output`
      const unitSpecs = [
        { key: 'west', label: 'West', minX: -7.5, maxX: -2.7, roofHeight: 1.45 },
        { key: 'middle', label: 'Middle', minX: -2.7, maxX: 2.1, roofHeight: 1.7 },
        { key: 'east', label: 'East', minX: 2.1, maxX: 6.9, roofHeight: 1.5 },
      ] as const

      const nodes: AssemblyNodeDefinition[] = [
        presetNode('storey_stack', 'terrace_storeys', { x: 280, y: 180 }, { count: 2, baseElevation: 0, levelHeight: 3.2, slabThickness: 0.18, labelPrefix: 'Terrace Level' }, 'Terrace Storeys'),
        presetNode('environment_output', outputKey, { x: 1410, y: 360 }, {}, 'Environment Output'),
      ]

      const edges: AssemblyEdgeDefinition[] = []

      for (const [index, unit] of unitSpecs.entries()) {
        const xColumn = 60
        const roomColumn = 520 + index * 170
        const stairColumn = 760 + index * 170
        const facadeColumn = 1030 + index * 170
        const minX = unit.minX
        const maxX = unit.maxX
        const splitX = minX + 2.4
        const outlineKey = `terrace_${unit.key}_outline`
        const frontKey = `terrace_${unit.key}_front_profile`
        const rearKey = `terrace_${unit.key}_rear_profile`
        const upperKey = `terrace_${unit.key}_upper_profile`
        const stairZoneProfileKey = `terrace_${unit.key}_stair_zone_profile`
        const frontRoomKey = `terrace_${unit.key}_front_room`
        const rearRoomKey = `terrace_${unit.key}_rear_room`
        const upperRoomKey = `terrace_${unit.key}_upper_room`
        const stairZoneKey = `terrace_${unit.key}_stair_zone`
        const stairKey = `terrace_${unit.key}_stair`
        const interiorDoorKey = `terrace_${unit.key}_interior_door`
        const groundConnectionKey = `terrace_${unit.key}_stair_ground_connection`
        const upperConnectionKey = `terrace_${unit.key}_stair_upper_connection`
        const entryKey = `terrace_${unit.key}_entry`
        const frontWindowKey = `terrace_${unit.key}_front_windows`
        const upperWindowKey = `terrace_${unit.key}_upper_windows`
        const roofKey = `terrace_${unit.key}_roof`

        nodes.push(
          presetNode('polygon', outlineKey, { x: xColumn, y: 80 + index * 240 }, { points: [{ x: minX, y: -4 }, { x: maxX, y: -4 }, { x: maxX, y: 4 }, { x: minX, y: 4 }] }, `${unit.label} Outline`),
          presetNode('polygon', frontKey, { x: xColumn, y: 130 + index * 240 }, { points: [{ x: minX, y: -4 }, { x: splitX, y: -4 }, { x: splitX, y: 0 }, { x: minX, y: 0 }] }, `${unit.label} Front Profile`),
          presetNode('polygon', rearKey, { x: xColumn, y: 180 + index * 240 }, { points: [{ x: minX, y: 0 }, { x: splitX, y: 0 }, { x: splitX, y: 4 }, { x: minX, y: 4 }] }, `${unit.label} Rear Profile`),
          presetNode('polygon', upperKey, { x: xColumn, y: 230 + index * 240 }, { points: [{ x: minX, y: -4 }, { x: splitX, y: -4 }, { x: splitX, y: 4 }, { x: minX, y: 4 }] }, `${unit.label} Upper Profile`),
          presetNode('polygon', stairZoneProfileKey, { x: xColumn, y: 280 + index * 240 }, { points: [{ x: splitX, y: -4 }, { x: maxX, y: -4 }, { x: maxX, y: 4 }, { x: splitX, y: 4 }] }, `${unit.label} Stair Hall Profile`),
          presetNode('room_on_level', frontRoomKey, { x: roomColumn, y: 70 }, { levelIndex: 1, roomName: `${unit.label} Front Parlour`, height: 3.2, wallThickness: 0.22, floorThickness: 0.18 }, `${unit.label} Front Parlour`),
          presetNode('room_on_level', rearRoomKey, { x: roomColumn, y: 170 }, { levelIndex: 1, roomName: `${unit.label} Rear Kitchen`, height: 3.2, wallThickness: 0.22, floorThickness: 0.18 }, `${unit.label} Rear Kitchen`),
          presetNode('room_on_level', upperRoomKey, { x: roomColumn, y: 270 }, { levelIndex: 2, roomName: `${unit.label} Upper Suite`, height: 3.2, wallThickness: 0.2, floorThickness: 0.18 }, `${unit.label} Upper Suite`),
          presetNode('circulation_zone', stairZoneKey, { x: roomColumn, y: 380 }, { levelIndex: 1, toLevelIndex: 2, roomName: `${unit.label} Stair Hall`, height: 3.2, wallThickness: 0.2, floorThickness: 0.18, fitMode: 'zone_autofit', maxExpandX: 0.45, maxExpandZ: 0.6, allowPartitionPush: false }, `${unit.label} Stair Hall`),
          presetNode('door_between_rooms', interiorDoorKey, { x: stairColumn, y: 70 }, { width: 0.95, height: 2.1 }, `${unit.label} Interior Door`),
          presetNode('stair_core_v2', stairKey, { x: stairColumn, y: 180 }, { stairFamily: 'straight', fromLevelIndex: 1, toLevelIndex: 2, width: 1.5, tread: 0.26, maxRise: 0.2, landingDepth: 1.35, fitMode: 'zone_autofit' }, `${unit.label} Stair`),
          presetNode('stair_connection', groundConnectionKey, { x: stairColumn, y: 290 }, { connectionMode: 'door', landing: 'bottom', width: 1, height: 2.2 }, `${unit.label} Ground Stair Doors`),
          presetNode('stair_connection', upperConnectionKey, { x: stairColumn, y: 380 }, { connectionMode: 'door', landing: 'top', width: 1, height: 2.15 }, `${unit.label} Upper Stair Door`),
          presetNode('door_opening', entryKey, { x: facadeColumn, y: 70 }, { side: 'front', width: 1.05, height: 2.2 }, `${unit.label} Entry Door`),
          presetNode('opening_array', frontWindowKey, { x: facadeColumn, y: 170 }, { side: 'front', count: 1, spacing: 1.4, width: 1.05, height: 1.15, sillHeight: 0.88 }, `${unit.label} Front Window`),
          presetNode('opening_array', upperWindowKey, { x: facadeColumn, y: 270 }, { side: 'front', count: 1, spacing: 1.4, width: 1, height: 1.1, sillHeight: 0.96 }, `${unit.label} Upper Window`),
          presetNode('gable_roof', roofKey, { x: facadeColumn, y: 380 }, { height: unit.roofHeight, eaves: 0.1 }, `${unit.label} Roof`),
        )

        edges.push(
          presetEdge(`${unit.key}_front_profile_to_room`, frontKey, 'profile', frontRoomKey, 'profile'),
          presetEdge(`${unit.key}_rear_profile_to_room`, rearKey, 'profile', rearRoomKey, 'profile'),
          presetEdge(`${unit.key}_upper_profile_to_room`, upperKey, 'profile', upperRoomKey, 'profile'),
          presetEdge(`${unit.key}_stair_profile_to_zone`, stairZoneProfileKey, 'profile', stairZoneKey, 'profile'),
          presetEdge(`${unit.key}_storeys_to_front_room`, 'terrace_storeys', 'levels', frontRoomKey, 'level'),
          presetEdge(`${unit.key}_storeys_to_rear_room`, 'terrace_storeys', 'levels', rearRoomKey, 'level'),
          presetEdge(`${unit.key}_storeys_to_upper_room`, 'terrace_storeys', 'levels', upperRoomKey, 'level'),
          presetEdge(`${unit.key}_storeys_to_zone`, 'terrace_storeys', 'levels', stairZoneKey, 'level'),
          presetEdge(`${unit.key}_front_to_interior_door`, frontRoomKey, 'room', interiorDoorKey, 'rooms'),
          presetEdge(`${unit.key}_rear_to_interior_door`, rearRoomKey, 'room', interiorDoorKey, 'rooms'),
          presetEdge(`${unit.key}_storeys_to_stair`, 'terrace_storeys', 'levels', stairKey, 'levels'),
          presetEdge(`${unit.key}_zone_to_stair`, stairZoneKey, 'room', stairKey, 'zone'),
          presetEdge(`${unit.key}_stair_to_ground_connection`, stairKey, 'stair', groundConnectionKey, 'stair'),
          presetEdge(`${unit.key}_front_to_ground_connection`, frontRoomKey, 'room', groundConnectionKey, 'rooms'),
          presetEdge(`${unit.key}_rear_to_ground_connection`, rearRoomKey, 'room', groundConnectionKey, 'rooms'),
          presetEdge(`${unit.key}_stair_to_upper_connection`, stairKey, 'stair', upperConnectionKey, 'stair'),
          presetEdge(`${unit.key}_upper_to_upper_connection`, upperRoomKey, 'room', upperConnectionKey, 'rooms'),
          presetEdge(`${unit.key}_front_to_entry_host`, frontRoomKey, 'solid', entryKey, 'host'),
          presetEdge(`${unit.key}_front_to_entry_face`, frontRoomKey, 'wall_faces', entryKey, 'wall_face'),
          presetEdge(`${unit.key}_front_to_front_windows_host`, frontRoomKey, 'solid', frontWindowKey, 'host'),
          presetEdge(`${unit.key}_front_to_front_windows_face`, frontRoomKey, 'wall_faces', frontWindowKey, 'wall_face'),
          presetEdge(`${unit.key}_upper_to_upper_windows_host`, upperRoomKey, 'solid', upperWindowKey, 'host'),
          presetEdge(`${unit.key}_upper_to_upper_windows_face`, upperRoomKey, 'wall_faces', upperWindowKey, 'wall_face'),
          presetEdge(`${unit.key}_outline_to_roof`, outlineKey, 'profile', roofKey, 'profile'),
          presetEdge(`${unit.key}_upper_to_roof_host`, upperRoomKey, 'solid', roofKey, 'host'),
          presetEdge(`${unit.key}_front_to_output`, frontRoomKey, 'solid', outputKey, 'solids'),
          presetEdge(`${unit.key}_rear_to_output`, rearRoomKey, 'solid', outputKey, 'solids'),
          presetEdge(`${unit.key}_upper_to_output`, upperRoomKey, 'solid', outputKey, 'solids'),
          presetEdge(`${unit.key}_zone_to_output`, stairZoneKey, 'solid', outputKey, 'solids'),
          presetEdge(`${unit.key}_stair_to_output`, stairKey, 'solid', outputKey, 'solids'),
          presetEdge(`${unit.key}_roof_to_output`, roofKey, 'solid', outputKey, 'solids'),
        )
      }

      return {
        id: `preset-graph-${graphKey}`,
        key: graphKey,
        name: 'Townhouse Terrace',
        summary: 'Three attached townhouses with explicit storeys, party walls, circulation zones, and facade openings.',
        boundEnvironmentKey: environmentKey ?? null,
        metadata: { presetKey: 'townhouse_row', macroKey: 'wing' },
        nodes,
        edges,
      }
    },
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
        presetNode('bridge_room', 'tower_bridge_room', { x: 800, y: 220 }, { width: 3.4, wallHeight: 2.9, wallThickness: 0.22, floorThickness: 0.18, roofThickness: 0.18, elevation: 3.1, openingWidth: 1.9, openingHeight: 2.35, overlap: 1.15 }, 'Bridge Room'),
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
        presetEdge('bridge_room_to_output', 'tower_bridge_room', 'solid', `${graphKey}.output`, 'solids'),
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
    key: 'manor_house_suite',
    label: 'Manor House Suite',
    summary: 'Two-storey manor with split main rooms, upper wings, explicit stair core, and separate wing roofs.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Manor House Suite',
      summary: 'Representative manor with internal partitions, upper-storey wings, stair voids, and layered roofs.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'manor_house_suite', macroKey: 'manor' },
      nodes: [
        presetNode('polygon', 'manor_main_outline', { x: 60, y: 80 }, { points: [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }] }, 'Main Block Outline'),
        presetNode('polygon', 'manor_front_west_outline', { x: 60, y: 200 }, { points: [{ x: -6, y: -4 }, { x: -1.6, y: -4 }, { x: -1.6, y: 0.6 }, { x: -6, y: 0.6 }] }, 'Front West Hall Outline'),
        presetNode('polygon', 'manor_front_east_outline', { x: 60, y: 260 }, { points: [{ x: 1.6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 0.6 }, { x: 1.6, y: 0.6 }] }, 'Front East Hall Outline'),
        presetNode('polygon', 'manor_rear_west_outline', { x: 60, y: 320 }, { points: [{ x: -6, y: 0.6 }, { x: -2, y: 0.6 }, { x: -2, y: 4 }, { x: -6, y: 4 }] }, 'Rear West Outline'),
        presetNode('polygon', 'manor_rear_east_outline', { x: 60, y: 400 }, { points: [{ x: 2, y: 0.6 }, { x: 6, y: 0.6 }, { x: 6, y: 4 }, { x: 2, y: 4 }] }, 'Rear East Outline'),
        presetNode('polygon', 'manor_stair_zone_outline', { x: 60, y: 480 }, { points: [{ x: -1.6, y: -2.6 }, { x: 1.6, y: -2.6 }, { x: 1.6, y: 4 }, { x: -1.6, y: 4 }] }, 'Stair Hall Outline'),
        presetNode('polygon', 'manor_west_outline', { x: 60, y: 440 }, { points: [{ x: -12, y: -4 }, { x: -6, y: -4 }, { x: -6, y: 0 }, { x: -12, y: 0 }] }, 'West Wing Outline'),
        presetNode('polygon', 'manor_east_outline', { x: 60, y: 560 }, { points: [{ x: 6, y: -4 }, { x: 12, y: -4 }, { x: 12, y: 0 }, { x: 6, y: 0 }] }, 'East Wing Outline'),
        presetNode('storey_stack', 'manor_storeys', { x: 280, y: 220 }, { count: 2, baseElevation: 0, levelHeight: 3.4, slabThickness: 0.2, labelPrefix: 'Manor Level' }, 'Storeys'),
        presetNode('room_on_level', 'manor_front_west_ground', { x: 520, y: 60 }, { levelIndex: 1, roomName: 'Front West Hall', height: 3.4, wallThickness: 0.24, floorThickness: 0.2 }, 'Front West Hall'),
        presetNode('room_on_level', 'manor_front_east_ground', { x: 520, y: 120 }, { levelIndex: 1, roomName: 'Front East Hall', height: 3.4, wallThickness: 0.24, floorThickness: 0.2 }, 'Front East Hall'),
        presetNode('room_on_level', 'manor_rear_west_ground', { x: 520, y: 160 }, { levelIndex: 1, roomName: 'Rear West Chamber', height: 3.4, wallThickness: 0.24, floorThickness: 0.2 }, 'Rear West Chamber'),
        presetNode('room_on_level', 'manor_rear_east_ground', { x: 520, y: 220 }, { levelIndex: 1, roomName: 'Rear East Chamber', height: 3.4, wallThickness: 0.24, floorThickness: 0.2 }, 'Rear East Chamber'),
        presetNode('circulation_zone', 'manor_stair_zone', { x: 520, y: 300 }, { levelIndex: 1, toLevelIndex: 2, roomName: 'Grand Stair Hall', height: 3.4, wallThickness: 0.2, floorThickness: 0.18, fitMode: 'zone_autofit', maxExpandX: 1, maxExpandZ: 1, allowPartitionPush: false }, 'Grand Stair Hall'),
        presetNode('room_on_level', 'manor_west_ground', { x: 520, y: 260 }, { levelIndex: 1, roomName: 'West Wing', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'West Wing'),
        presetNode('room_on_level', 'manor_east_ground', { x: 520, y: 360 }, { levelIndex: 1, roomName: 'East Wing', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'East Wing'),
        presetNode('room_on_level', 'manor_front_west_upper', { x: 520, y: 470 }, { levelIndex: 2, roomName: 'Upper Front West Gallery', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'Upper Front West Gallery'),
        presetNode('room_on_level', 'manor_front_east_upper', { x: 520, y: 520 }, { levelIndex: 2, roomName: 'Upper Front East Gallery', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'Upper Front East Gallery'),
        presetNode('room_on_level', 'manor_rear_west_upper', { x: 520, y: 570 }, { levelIndex: 2, roomName: 'Upper Rear West Suite', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'Upper Rear West Suite'),
        presetNode('room_on_level', 'manor_rear_east_upper', { x: 520, y: 620 }, { levelIndex: 2, roomName: 'Upper Rear East Suite', height: 3.4, wallThickness: 0.22, floorThickness: 0.18 }, 'Upper Rear East Suite'),
        presetNode('room_on_level', 'manor_west_upper', { x: 520, y: 670 }, { levelIndex: 2, roomName: 'Upper West Wing', height: 3.4, wallThickness: 0.2, floorThickness: 0.18 }, 'Upper West Wing'),
        presetNode('room_on_level', 'manor_east_upper', { x: 520, y: 770 }, { levelIndex: 2, roomName: 'Upper East Wing', height: 3.4, wallThickness: 0.2, floorThickness: 0.18 }, 'Upper East Wing'),
        presetNode('door_between_rooms', 'manor_west_door', { x: 760, y: 210 }, { width: 1.1, height: 2.1 }, 'West Interior Door'),
        presetNode('door_between_rooms', 'manor_east_door', { x: 760, y: 310 }, { width: 1.1, height: 2.1 }, 'East Interior Door'),
        presetNode('stair_core_v2', 'manor_stair', { x: 760, y: 450 }, { stairFamily: 'straight', fromLevelIndex: 1, toLevelIndex: 2, width: 1.8, tread: 0.25, maxRise: 0.22, landingDepth: 1.6, fitMode: 'zone_autofit' }, 'Grand Stair'),
        presetNode('stair_connection', 'manor_stair_ground_connection', { x: 760, y: 520 }, { connectionMode: 'door', landing: 'bottom', width: 1.2, height: 2.3 }, 'Ground Stair Doors'),
        presetNode('stair_connection', 'manor_stair_upper_connection', { x: 760, y: 600 }, { connectionMode: 'door', landing: 'top', width: 1.15, height: 2.2 }, 'Upper Stair Doors'),
        presetNode('door_opening', 'manor_entry', { x: 980, y: 70 }, { side: 'front', width: 1.4, height: 2.4 }, 'Main Entry'),
        presetNode('opening_array', 'manor_front_west_windows', { x: 980, y: 170 }, { side: 'front', count: 2, spacing: 1.8, width: 1.1, height: 1.35, sillHeight: 0.9 }, 'Front West Windows'),
        presetNode('opening_array', 'manor_front_east_windows', { x: 980, y: 220 }, { side: 'front', count: 2, spacing: 1.8, width: 1.1, height: 1.35, sillHeight: 0.9 }, 'Front East Windows'),
        presetNode('opening_array', 'manor_upper_west_windows', { x: 980, y: 270 }, { side: 'front', count: 2, spacing: 1.8, width: 1.05, height: 1.25, sillHeight: 0.95 }, 'Upper West Windows'),
        presetNode('opening_array', 'manor_upper_east_windows', { x: 980, y: 320 }, { side: 'front', count: 2, spacing: 1.8, width: 1.05, height: 1.25, sillHeight: 0.95 }, 'Upper East Windows'),
        presetNode('opening_array', 'west_wing_windows', { x: 980, y: 370 }, { side: 'front', count: 2, spacing: 1.8, width: 1.05, height: 1.15, sillHeight: 0.95 }, 'West Wing Windows'),
        presetNode('opening_array', 'east_wing_windows', { x: 980, y: 470 }, { side: 'front', count: 2, spacing: 1.8, width: 1.05, height: 1.15, sillHeight: 0.95 }, 'East Wing Windows'),
        presetNode('gable_roof', 'manor_main_roof', { x: 980, y: 590 }, { height: 2.4, eaves: 0.26 }, 'Main Roof'),
        presetNode('hip_roof', 'manor_west_roof', { x: 980, y: 690 }, { height: 1.7, eaves: 0.18 }, 'West Wing Roof'),
        presetNode('hip_roof', 'manor_east_roof', { x: 980, y: 790 }, { height: 1.7, eaves: 0.18 }, 'East Wing Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1230, y: 430 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('front_west_outline_to_front_ground', 'manor_front_west_outline', 'profile', 'manor_front_west_ground', 'profile'),
        presetEdge('front_east_outline_to_front_ground', 'manor_front_east_outline', 'profile', 'manor_front_east_ground', 'profile'),
        presetEdge('rear_west_outline_to_rear_ground', 'manor_rear_west_outline', 'profile', 'manor_rear_west_ground', 'profile'),
        presetEdge('rear_east_outline_to_rear_ground', 'manor_rear_east_outline', 'profile', 'manor_rear_east_ground', 'profile'),
        presetEdge('stair_zone_outline_to_zone', 'manor_stair_zone_outline', 'profile', 'manor_stair_zone', 'profile'),
        presetEdge('west_outline_to_ground', 'manor_west_outline', 'profile', 'manor_west_ground', 'profile'),
        presetEdge('east_outline_to_ground', 'manor_east_outline', 'profile', 'manor_east_ground', 'profile'),
        presetEdge('front_west_outline_to_front_upper', 'manor_front_west_outline', 'profile', 'manor_front_west_upper', 'profile'),
        presetEdge('front_east_outline_to_front_upper', 'manor_front_east_outline', 'profile', 'manor_front_east_upper', 'profile'),
        presetEdge('rear_west_outline_to_rear_upper', 'manor_rear_west_outline', 'profile', 'manor_rear_west_upper', 'profile'),
        presetEdge('rear_east_outline_to_rear_upper', 'manor_rear_east_outline', 'profile', 'manor_rear_east_upper', 'profile'),
        presetEdge('west_outline_to_upper', 'manor_west_outline', 'profile', 'manor_west_upper', 'profile'),
        presetEdge('east_outline_to_upper', 'manor_east_outline', 'profile', 'manor_east_upper', 'profile'),
        presetEdge('storeys_to_front_west_ground', 'manor_storeys', 'levels', 'manor_front_west_ground', 'level'),
        presetEdge('storeys_to_front_east_ground', 'manor_storeys', 'levels', 'manor_front_east_ground', 'level'),
        presetEdge('storeys_to_rear_west_ground', 'manor_storeys', 'levels', 'manor_rear_west_ground', 'level'),
        presetEdge('storeys_to_rear_east_ground', 'manor_storeys', 'levels', 'manor_rear_east_ground', 'level'),
        presetEdge('storeys_to_stair_zone', 'manor_storeys', 'levels', 'manor_stair_zone', 'level'),
        presetEdge('storeys_to_west_ground', 'manor_storeys', 'levels', 'manor_west_ground', 'level'),
        presetEdge('storeys_to_east_ground', 'manor_storeys', 'levels', 'manor_east_ground', 'level'),
        presetEdge('storeys_to_front_west_upper', 'manor_storeys', 'levels', 'manor_front_west_upper', 'level'),
        presetEdge('storeys_to_front_east_upper', 'manor_storeys', 'levels', 'manor_front_east_upper', 'level'),
        presetEdge('storeys_to_rear_west_upper', 'manor_storeys', 'levels', 'manor_rear_west_upper', 'level'),
        presetEdge('storeys_to_rear_east_upper', 'manor_storeys', 'levels', 'manor_rear_east_upper', 'level'),
        presetEdge('storeys_to_west_upper', 'manor_storeys', 'levels', 'manor_west_upper', 'level'),
        presetEdge('storeys_to_east_upper', 'manor_storeys', 'levels', 'manor_east_upper', 'level'),
        presetEdge('front_west_ground_to_west_door', 'manor_front_west_ground', 'room', 'manor_west_door', 'rooms'),
        presetEdge('rear_west_ground_to_west_door', 'manor_rear_west_ground', 'room', 'manor_west_door', 'rooms'),
        presetEdge('front_east_ground_to_east_door', 'manor_front_east_ground', 'room', 'manor_east_door', 'rooms'),
        presetEdge('rear_east_ground_to_east_door', 'manor_rear_east_ground', 'room', 'manor_east_door', 'rooms'),
        presetEdge('storeys_to_stair', 'manor_storeys', 'levels', 'manor_stair', 'levels'),
        presetEdge('zone_to_stair', 'manor_stair_zone', 'room', 'manor_stair', 'zone'),
        presetEdge('stair_to_ground_connection', 'manor_stair', 'stair', 'manor_stair_ground_connection', 'stair'),
        presetEdge('front_west_ground_to_ground_connection', 'manor_front_west_ground', 'room', 'manor_stair_ground_connection', 'rooms'),
        presetEdge('front_east_ground_to_ground_connection', 'manor_front_east_ground', 'room', 'manor_stair_ground_connection', 'rooms'),
        presetEdge('rear_west_ground_to_ground_connection', 'manor_rear_west_ground', 'room', 'manor_stair_ground_connection', 'rooms'),
        presetEdge('rear_east_ground_to_ground_connection', 'manor_rear_east_ground', 'room', 'manor_stair_ground_connection', 'rooms'),
        presetEdge('stair_to_upper_connection', 'manor_stair', 'stair', 'manor_stair_upper_connection', 'stair'),
        presetEdge('front_west_upper_to_upper_connection', 'manor_front_west_upper', 'room', 'manor_stair_upper_connection', 'rooms'),
        presetEdge('front_east_upper_to_upper_connection', 'manor_front_east_upper', 'room', 'manor_stair_upper_connection', 'rooms'),
        presetEdge('rear_west_upper_to_upper_connection', 'manor_rear_west_upper', 'room', 'manor_stair_upper_connection', 'rooms'),
        presetEdge('rear_east_upper_to_upper_connection', 'manor_rear_east_upper', 'room', 'manor_stair_upper_connection', 'rooms'),
        presetEdge('front_west_ground_to_entry_host', 'manor_front_west_ground', 'solid', 'manor_entry', 'host'),
        presetEdge('front_west_ground_to_entry_face', 'manor_front_west_ground', 'wall_faces', 'manor_entry', 'wall_face'),
        presetEdge('front_west_ground_to_windows_host', 'manor_front_west_ground', 'solid', 'manor_front_west_windows', 'host'),
        presetEdge('front_west_ground_to_windows_face', 'manor_front_west_ground', 'wall_faces', 'manor_front_west_windows', 'wall_face'),
        presetEdge('front_east_ground_to_windows_host', 'manor_front_east_ground', 'solid', 'manor_front_east_windows', 'host'),
        presetEdge('front_east_ground_to_windows_face', 'manor_front_east_ground', 'wall_faces', 'manor_front_east_windows', 'wall_face'),
        presetEdge('front_west_upper_to_windows_host', 'manor_front_west_upper', 'solid', 'manor_upper_west_windows', 'host'),
        presetEdge('front_west_upper_to_windows_face', 'manor_front_west_upper', 'wall_faces', 'manor_upper_west_windows', 'wall_face'),
        presetEdge('front_east_upper_to_windows_host', 'manor_front_east_upper', 'solid', 'manor_upper_east_windows', 'host'),
        presetEdge('front_east_upper_to_windows_face', 'manor_front_east_upper', 'wall_faces', 'manor_upper_east_windows', 'wall_face'),
        presetEdge('west_ground_to_windows_host', 'manor_west_ground', 'solid', 'west_wing_windows', 'host'),
        presetEdge('west_ground_to_windows_face', 'manor_west_ground', 'wall_faces', 'west_wing_windows', 'wall_face'),
        presetEdge('east_ground_to_windows_host', 'manor_east_ground', 'solid', 'east_wing_windows', 'host'),
        presetEdge('east_ground_to_windows_face', 'manor_east_ground', 'wall_faces', 'east_wing_windows', 'wall_face'),
        presetEdge('main_outline_to_roof', 'manor_main_outline', 'profile', 'manor_main_roof', 'profile'),
        presetEdge('front_west_upper_to_main_roof', 'manor_front_west_upper', 'solid', 'manor_main_roof', 'host'),
        presetEdge('west_outline_to_roof', 'manor_west_outline', 'profile', 'manor_west_roof', 'profile'),
        presetEdge('west_upper_to_roof', 'manor_west_upper', 'solid', 'manor_west_roof', 'host'),
        presetEdge('east_outline_to_roof', 'manor_east_outline', 'profile', 'manor_east_roof', 'profile'),
        presetEdge('east_upper_to_roof', 'manor_east_upper', 'solid', 'manor_east_roof', 'host'),
        presetEdge('front_west_ground_to_output', 'manor_front_west_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('front_east_ground_to_output', 'manor_front_east_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('rear_west_ground_to_output', 'manor_rear_west_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('rear_east_ground_to_output', 'manor_rear_east_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('stair_zone_to_output', 'manor_stair_zone', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('west_ground_to_output', 'manor_west_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('east_ground_to_output', 'manor_east_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('front_west_upper_to_output', 'manor_front_west_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('front_east_upper_to_output', 'manor_front_east_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('rear_west_upper_to_output', 'manor_rear_west_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('rear_east_upper_to_output', 'manor_rear_east_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('west_upper_to_output', 'manor_west_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('east_upper_to_output', 'manor_east_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('stair_to_output', 'manor_stair', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('main_roof_to_output', 'manor_main_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('west_roof_to_output', 'manor_west_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('east_roof_to_output', 'manor_east_roof', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'fortified_keep',
    label: 'Fortified Keep',
    summary: 'Three-level keep with explicit storeys, gate arch, tower rooms, and stair cores.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Fortified Keep',
      summary: 'Large keep and gatehouse composition with stacked rooms, tower access, and roofed crowns.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'fortified_keep', macroKey: 'keep' },
      nodes: [
        presetNode('polygon', 'keep_outline', { x: 60, y: 160 }, { points: [{ x: -7, y: -5 }, { x: 7, y: -5 }, { x: 7, y: 5 }, { x: -7, y: 5 }] }, 'Keep Outline'),
        presetNode('polygon', 'gatehouse_outline', { x: 60, y: 320 }, { points: [{ x: -3.6, y: -9 }, { x: 3.6, y: -9 }, { x: 4.6, y: -5 }, { x: -4.6, y: -5 }] }, 'Gatehouse Outline'),
        presetNode('polygon', 'north_tower_outline', { x: 60, y: 460 }, { points: [{ x: -11, y: 2 }, { x: -9, y: 0 }, { x: -9, y: -3 }, { x: -11, y: -5 }, { x: -14, y: -5 }, { x: -16, y: -3 }, { x: -16, y: 0 }, { x: -14, y: 2 }] }, 'North Tower Outline'),
        presetNode('polygon', 'south_tower_outline', { x: 60, y: 600 }, { points: [{ x: 16, y: 2 }, { x: 14, y: 0 }, { x: 14, y: -3 }, { x: 16, y: -5 }, { x: 19, y: -5 }, { x: 21, y: -3 }, { x: 21, y: 0 }, { x: 19, y: 2 }] }, 'South Tower Outline'),
        presetNode('storey_stack', 'keep_storeys', { x: 280, y: 220 }, { count: 3, baseElevation: 0, levelHeight: 3.6, slabThickness: 0.22, labelPrefix: 'Keep Level' }, 'Keep Storeys'),
        presetNode('room_on_level', 'keep_ground', { x: 520, y: 80 }, { levelIndex: 1, roomName: 'Keep Hall', height: 3.6, wallThickness: 0.34, floorThickness: 0.22 }, 'Keep Hall'),
        presetNode('room_on_level', 'keep_second', { x: 520, y: 190 }, { levelIndex: 2, roomName: 'Keep Chamber', height: 3.6, wallThickness: 0.32, floorThickness: 0.22 }, 'Keep Chamber'),
        presetNode('room_on_level', 'keep_top', { x: 520, y: 300 }, { levelIndex: 3, roomName: 'Keep Roof Room', height: 3.4, wallThickness: 0.3, floorThickness: 0.2 }, 'Keep Roof Room'),
        presetNode('room_on_level', 'gatehouse_room', { x: 520, y: 410 }, { levelIndex: 1, roomName: 'Gate Passage', height: 3.8, wallThickness: 0.3, floorThickness: 0.22 }, 'Gate Passage'),
        presetNode('room_on_level', 'north_tower_ground', { x: 520, y: 520 }, { levelIndex: 1, roomName: 'North Tower Guard', height: 3.6, wallThickness: 0.28, floorThickness: 0.2 }, 'North Tower Guard'),
        presetNode('room_on_level', 'north_tower_top', { x: 520, y: 630 }, { levelIndex: 2, roomName: 'North Tower Upper', height: 3.6, wallThickness: 0.28, floorThickness: 0.2 }, 'North Tower Upper'),
        presetNode('room_on_level', 'south_tower_ground', { x: 520, y: 740 }, { levelIndex: 1, roomName: 'South Tower Guard', height: 3.6, wallThickness: 0.28, floorThickness: 0.2 }, 'South Tower Guard'),
        presetNode('room_on_level', 'south_tower_top', { x: 520, y: 850 }, { levelIndex: 2, roomName: 'South Tower Upper', height: 3.6, wallThickness: 0.28, floorThickness: 0.2 }, 'South Tower Upper'),
        presetNode('door_between_rooms', 'gate_to_keep_door', { x: 760, y: 120 }, { width: 1.4, height: 2.4 }, 'Gate To Keep Door'),
        presetNode('door_between_rooms', 'north_tower_door', { x: 760, y: 220 }, { width: 1.1, height: 2.2 }, 'North Tower Door'),
        presetNode('door_between_rooms', 'south_tower_door', { x: 760, y: 320 }, { width: 1.1, height: 2.2 }, 'South Tower Door'),
        presetNode('stair_core', 'keep_stair_lower', { x: 760, y: 430 }, { stairType: 'switchback', fromLevelIndex: 1, toLevelIndex: 2, width: 2.3, depth: 4.8, landingDepth: 2.4, offset: { x: -1.4, y: 0, z: 0.6 } }, 'Keep Stair I'),
        presetNode('stair_core', 'keep_stair_upper', { x: 760, y: 540 }, { stairType: 'switchback', fromLevelIndex: 2, toLevelIndex: 3, width: 2.2, depth: 4.6, landingDepth: 2.2, offset: { x: 1.5, y: 0, z: -0.6 } }, 'Keep Stair II'),
        presetNode('stair_core', 'north_tower_stair', { x: 760, y: 650 }, { stairType: 'spiral', fromLevelIndex: 1, toLevelIndex: 2, width: 1.9, depth: 3.2, offset: { x: -12.5, y: 0, z: -1.4 } }, 'North Tower Stair'),
        presetNode('stair_core', 'south_tower_stair', { x: 760, y: 760 }, { stairType: 'spiral', fromLevelIndex: 1, toLevelIndex: 2, width: 1.9, depth: 3.2, offset: { x: 17.4, y: 0, z: -1.4 } }, 'South Tower Stair'),
        presetNode('arch_opening', 'keep_gate_arch', { x: 980, y: 100 }, { side: 'front', width: 3.8, height: 4.4 }, 'Gate Arch'),
        presetNode('opening_array', 'keep_windows', { x: 980, y: 220 }, { side: 'front', count: 4, spacing: 3.1, width: 0.9, height: 1.6, sillHeight: 1.5 }, 'Keep Windows'),
        presetNode('opening_array', 'tower_windows', { x: 980, y: 340 }, { side: 'front', count: 2, spacing: 1.4, width: 0.72, height: 1.3, sillHeight: 1.4 }, 'Tower Windows'),
        presetNode('hip_roof', 'keep_roof', { x: 980, y: 470 }, { height: 2.3, eaves: 0.16 }, 'Keep Roof'),
        presetNode('tower_cap', 'north_tower_cap', { x: 980, y: 600 }, { height: 3.1, taper: 1 }, 'North Tower Cap'),
        presetNode('tower_cap', 'south_tower_cap', { x: 980, y: 720 }, { height: 3.1, taper: 1 }, 'South Tower Cap'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1240, y: 420 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('keep_outline_to_ground', 'keep_outline', 'profile', 'keep_ground', 'profile'),
        presetEdge('keep_outline_to_second', 'keep_outline', 'profile', 'keep_second', 'profile'),
        presetEdge('keep_outline_to_top', 'keep_outline', 'profile', 'keep_top', 'profile'),
        presetEdge('gate_outline_to_room', 'gatehouse_outline', 'profile', 'gatehouse_room', 'profile'),
        presetEdge('north_outline_to_ground', 'north_tower_outline', 'profile', 'north_tower_ground', 'profile'),
        presetEdge('north_outline_to_top', 'north_tower_outline', 'profile', 'north_tower_top', 'profile'),
        presetEdge('south_outline_to_ground', 'south_tower_outline', 'profile', 'south_tower_ground', 'profile'),
        presetEdge('south_outline_to_top', 'south_tower_outline', 'profile', 'south_tower_top', 'profile'),
        presetEdge('storeys_to_keep_ground', 'keep_storeys', 'levels', 'keep_ground', 'level'),
        presetEdge('storeys_to_keep_second', 'keep_storeys', 'levels', 'keep_second', 'level'),
        presetEdge('storeys_to_keep_top', 'keep_storeys', 'levels', 'keep_top', 'level'),
        presetEdge('storeys_to_gatehouse', 'keep_storeys', 'levels', 'gatehouse_room', 'level'),
        presetEdge('storeys_to_north_ground', 'keep_storeys', 'levels', 'north_tower_ground', 'level'),
        presetEdge('storeys_to_north_top', 'keep_storeys', 'levels', 'north_tower_top', 'level'),
        presetEdge('storeys_to_south_ground', 'keep_storeys', 'levels', 'south_tower_ground', 'level'),
        presetEdge('storeys_to_south_top', 'keep_storeys', 'levels', 'south_tower_top', 'level'),
        presetEdge('gatehouse_to_arch_host', 'gatehouse_room', 'solid', 'keep_gate_arch', 'host'),
        presetEdge('gatehouse_to_arch_face', 'gatehouse_room', 'wall_faces', 'keep_gate_arch', 'wall_face'),
        presetEdge('keep_second_to_windows_host', 'keep_second', 'solid', 'keep_windows', 'host'),
        presetEdge('keep_second_to_windows_face', 'keep_second', 'wall_faces', 'keep_windows', 'wall_face'),
        presetEdge('north_tower_top_to_windows_host', 'north_tower_top', 'solid', 'tower_windows', 'host'),
        presetEdge('north_tower_top_to_windows_face', 'north_tower_top', 'wall_faces', 'tower_windows', 'wall_face'),
        presetEdge('keep_ground_to_gate_door', 'keep_ground', 'room', 'gate_to_keep_door', 'rooms'),
        presetEdge('gatehouse_to_gate_door', 'gatehouse_room', 'room', 'gate_to_keep_door', 'rooms'),
        presetEdge('keep_ground_to_north_door', 'keep_ground', 'room', 'north_tower_door', 'rooms'),
        presetEdge('north_ground_to_north_door', 'north_tower_ground', 'room', 'north_tower_door', 'rooms'),
        presetEdge('keep_ground_to_south_door', 'keep_ground', 'room', 'south_tower_door', 'rooms'),
        presetEdge('south_ground_to_south_door', 'south_tower_ground', 'room', 'south_tower_door', 'rooms'),
        presetEdge('storeys_to_keep_stair_lower', 'keep_storeys', 'levels', 'keep_stair_lower', 'levels'),
        presetEdge('storeys_to_keep_stair_upper', 'keep_storeys', 'levels', 'keep_stair_upper', 'levels'),
        presetEdge('storeys_to_north_tower_stair', 'keep_storeys', 'levels', 'north_tower_stair', 'levels'),
        presetEdge('storeys_to_south_tower_stair', 'keep_storeys', 'levels', 'south_tower_stair', 'levels'),
        presetEdge('keep_roof_to_output', 'keep_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('keep_outline_to_roof', 'keep_outline', 'profile', 'keep_roof', 'profile'),
        presetEdge('keep_top_to_roof_host', 'keep_top', 'solid', 'keep_roof', 'host'),
        presetEdge('north_outline_to_cap', 'north_tower_outline', 'profile', 'north_tower_cap', 'profile'),
        presetEdge('north_top_to_cap_host', 'north_tower_top', 'solid', 'north_tower_cap', 'host'),
        presetEdge('south_outline_to_cap', 'south_tower_outline', 'profile', 'south_tower_cap', 'profile'),
        presetEdge('south_top_to_cap_host', 'south_tower_top', 'solid', 'south_tower_cap', 'host'),
        presetEdge('keep_ground_to_output', 'keep_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('keep_second_to_output', 'keep_second', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('keep_top_to_output', 'keep_top', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('gatehouse_to_output', 'gatehouse_room', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('north_ground_to_output', 'north_tower_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('north_top_to_output', 'north_tower_top', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('south_ground_to_output', 'south_tower_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('south_top_to_output', 'south_tower_top', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('keep_stair_lower_to_output', 'keep_stair_lower', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('keep_stair_upper_to_output', 'keep_stair_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('north_tower_stair_to_output', 'north_tower_stair', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('south_tower_stair_to_output', 'south_tower_stair', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('north_cap_to_output', 'north_tower_cap', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('south_cap_to_output', 'south_tower_cap', 'solid', `${graphKey}.output`, 'solids'),
      ],
    }),
  },
  {
    key: 'palace_wing',
    label: 'Palace Wing',
    summary: 'Formal two-storey palace wing with explicit rooms, circulation, and pavilion roofs.',
    build: (graphKey, environmentKey) => ({
      id: `preset-graph-${graphKey}`,
      key: graphKey,
      name: 'Palace Wing',
      summary: 'Representative palace-scale wing with stacked rooms, interior doors, and formal roofline.',
      boundEnvironmentKey: environmentKey ?? null,
      metadata: { presetKey: 'palace_wing', macroKey: 'palace_wing' },
      nodes: [
        presetNode('polygon', 'palace_central_outline', { x: 60, y: 160 }, { points: [{ x: -10, y: -4 }, { x: 10, y: -4 }, { x: 10, y: 4 }, { x: -10, y: 4 }] }, 'Central Wing Outline'),
        presetNode('polygon', 'palace_left_outline', { x: 60, y: 320 }, { points: [{ x: -16, y: -5 }, { x: -10, y: -5 }, { x: -10, y: 5 }, { x: -16, y: 5 }] }, 'Left Pavilion Outline'),
        presetNode('polygon', 'palace_right_outline', { x: 60, y: 480 }, { points: [{ x: 10, y: -5 }, { x: 16, y: -5 }, { x: 16, y: 5 }, { x: 10, y: 5 }] }, 'Right Pavilion Outline'),
        presetNode('storey_stack', 'palace_storeys', { x: 280, y: 250 }, { count: 2, baseElevation: 0, levelHeight: 3.8, slabThickness: 0.22, labelPrefix: 'Palace Level' }, 'Palace Storeys'),
        presetNode('room_on_level', 'palace_central_ground', { x: 520, y: 80 }, { levelIndex: 1, roomName: 'Central Hall', height: 3.8, wallThickness: 0.26, floorThickness: 0.22 }, 'Central Hall'),
        presetNode('room_on_level', 'palace_left_ground', { x: 520, y: 190 }, { levelIndex: 1, roomName: 'Left Pavilion', height: 3.8, wallThickness: 0.26, floorThickness: 0.22 }, 'Left Pavilion'),
        presetNode('room_on_level', 'palace_right_ground', { x: 520, y: 300 }, { levelIndex: 1, roomName: 'Right Pavilion', height: 3.8, wallThickness: 0.26, floorThickness: 0.22 }, 'Right Pavilion'),
        presetNode('room_on_level', 'palace_central_upper', { x: 520, y: 410 }, { levelIndex: 2, roomName: 'Upper Gallery', height: 3.8, wallThickness: 0.24, floorThickness: 0.2 }, 'Upper Gallery'),
        presetNode('room_on_level', 'palace_left_upper', { x: 520, y: 520 }, { levelIndex: 2, roomName: 'Left State Room', height: 3.8, wallThickness: 0.24, floorThickness: 0.2 }, 'Left State Room'),
        presetNode('room_on_level', 'palace_right_upper', { x: 520, y: 630 }, { levelIndex: 2, roomName: 'Right State Room', height: 3.8, wallThickness: 0.24, floorThickness: 0.2 }, 'Right State Room'),
        presetNode('door_between_rooms', 'palace_left_door', { x: 760, y: 120 }, { width: 1.3, height: 2.4 }, 'Left Interior Door'),
        presetNode('door_between_rooms', 'palace_right_door', { x: 760, y: 220 }, { width: 1.3, height: 2.4 }, 'Right Interior Door'),
        presetNode('stair_core', 'palace_stair', { x: 760, y: 360 }, { stairType: 'switchback', fromLevelIndex: 1, toLevelIndex: 2, width: 2.8, depth: 5.4, landingDepth: 2.8, offset: { x: 0, y: 0, z: 0.2 } }, 'Grand Stair'),
        presetNode('door_opening', 'palace_entry', { x: 980, y: 90 }, { side: 'front', width: 2.2, height: 3.4 }, 'Grand Entry'),
        presetNode('opening_array', 'palace_windows_ground', { x: 980, y: 210 }, { side: 'front', count: 7, spacing: 2.55, width: 1.5, height: 1.6, sillHeight: 1 }, 'Central Ground Windows'),
        presetNode('opening_array', 'palace_windows_upper', { x: 980, y: 330 }, { side: 'front', count: 7, spacing: 2.55, width: 1.3, height: 1.5, sillHeight: 1 }, 'Central Upper Windows'),
        presetNode('opening_array', 'pavilion_windows', { x: 980, y: 450 }, { side: 'front', count: 3, spacing: 2.1, width: 1.3, height: 1.5, sillHeight: 1.1 }, 'Pavilion Windows'),
        presetNode('mansard_roof', 'palace_central_roof', { x: 980, y: 580 }, { height: 2.6, inset: 0.55 }, 'Central Mansard Roof'),
        presetNode('hip_roof', 'palace_left_roof', { x: 980, y: 690 }, { height: 2.1, eaves: 0.18 }, 'Left Pavilion Roof'),
        presetNode('hip_roof', 'palace_right_roof', { x: 980, y: 800 }, { height: 2.1, eaves: 0.18 }, 'Right Pavilion Roof'),
        presetNode('environment_output', `${graphKey}.output`, { x: 1240, y: 430 }, {}, 'Environment Output'),
      ],
      edges: [
        presetEdge('central_outline_to_ground', 'palace_central_outline', 'profile', 'palace_central_ground', 'profile'),
        presetEdge('central_outline_to_upper', 'palace_central_outline', 'profile', 'palace_central_upper', 'profile'),
        presetEdge('left_outline_to_ground', 'palace_left_outline', 'profile', 'palace_left_ground', 'profile'),
        presetEdge('left_outline_to_upper', 'palace_left_outline', 'profile', 'palace_left_upper', 'profile'),
        presetEdge('right_outline_to_ground', 'palace_right_outline', 'profile', 'palace_right_ground', 'profile'),
        presetEdge('right_outline_to_upper', 'palace_right_outline', 'profile', 'palace_right_upper', 'profile'),
        presetEdge('storeys_to_central_ground', 'palace_storeys', 'levels', 'palace_central_ground', 'level'),
        presetEdge('storeys_to_left_ground', 'palace_storeys', 'levels', 'palace_left_ground', 'level'),
        presetEdge('storeys_to_right_ground', 'palace_storeys', 'levels', 'palace_right_ground', 'level'),
        presetEdge('storeys_to_central_upper', 'palace_storeys', 'levels', 'palace_central_upper', 'level'),
        presetEdge('storeys_to_left_upper', 'palace_storeys', 'levels', 'palace_left_upper', 'level'),
        presetEdge('storeys_to_right_upper', 'palace_storeys', 'levels', 'palace_right_upper', 'level'),
        presetEdge('central_ground_to_left_door', 'palace_central_ground', 'room', 'palace_left_door', 'rooms'),
        presetEdge('left_ground_to_left_door', 'palace_left_ground', 'room', 'palace_left_door', 'rooms'),
        presetEdge('central_ground_to_right_door', 'palace_central_ground', 'room', 'palace_right_door', 'rooms'),
        presetEdge('right_ground_to_right_door', 'palace_right_ground', 'room', 'palace_right_door', 'rooms'),
        presetEdge('storeys_to_palace_stair', 'palace_storeys', 'levels', 'palace_stair', 'levels'),
        presetEdge('central_ground_to_entry_host', 'palace_central_ground', 'solid', 'palace_entry', 'host'),
        presetEdge('central_ground_to_entry_face', 'palace_central_ground', 'wall_faces', 'palace_entry', 'wall_face'),
        presetEdge('central_ground_to_ground_windows_host', 'palace_central_ground', 'solid', 'palace_windows_ground', 'host'),
        presetEdge('central_ground_to_ground_windows_face', 'palace_central_ground', 'wall_faces', 'palace_windows_ground', 'wall_face'),
        presetEdge('central_upper_to_upper_windows_host', 'palace_central_upper', 'solid', 'palace_windows_upper', 'host'),
        presetEdge('central_upper_to_upper_windows_face', 'palace_central_upper', 'wall_faces', 'palace_windows_upper', 'wall_face'),
        presetEdge('left_ground_to_pavilion_windows_host', 'palace_left_ground', 'solid', 'pavilion_windows', 'host'),
        presetEdge('left_ground_to_pavilion_windows_face', 'palace_left_ground', 'wall_faces', 'pavilion_windows', 'wall_face'),
        presetEdge('central_outline_to_roof', 'palace_central_outline', 'profile', 'palace_central_roof', 'profile'),
        presetEdge('central_upper_to_roof_host', 'palace_central_upper', 'solid', 'palace_central_roof', 'host'),
        presetEdge('left_outline_to_roof', 'palace_left_outline', 'profile', 'palace_left_roof', 'profile'),
        presetEdge('left_upper_to_roof_host', 'palace_left_upper', 'solid', 'palace_left_roof', 'host'),
        presetEdge('right_outline_to_roof', 'palace_right_outline', 'profile', 'palace_right_roof', 'profile'),
        presetEdge('right_upper_to_roof_host', 'palace_right_upper', 'solid', 'palace_right_roof', 'host'),
        presetEdge('central_ground_to_output', 'palace_central_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('left_ground_to_output', 'palace_left_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('right_ground_to_output', 'palace_right_ground', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('central_upper_to_output', 'palace_central_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('left_upper_to_output', 'palace_left_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('right_upper_to_output', 'palace_right_upper', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('palace_stair_to_output', 'palace_stair', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('central_roof_to_output', 'palace_central_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('left_roof_to_output', 'palace_left_roof', 'solid', `${graphKey}.output`, 'solids'),
        presetEdge('right_roof_to_output', 'palace_right_roof', 'solid', `${graphKey}.output`, 'solids'),
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

function hasLegacyBridgeBetweenTowersNodes(graph: AssemblyGraphDefinition) {
  const legacyKeys = new Set([
    'left_bridge_plate',
    'right_bridge_plate',
    'left_bridge_plate_lift',
    'right_bridge_plate_lift',
    'bridge_with_left_plate',
    'bridge_with_floor_plates',
  ])
  return graph.nodes.some((node) => legacyKeys.has(node.key))
}

export function migrateAssemblyGraph(graph: AssemblyGraphDefinition) {
  const presetKey = typeof graph.metadata.presetKey === 'string' ? graph.metadata.presetKey : null
  const shouldUpgradeBridgePreset =
    (presetKey === 'bridge_between_towers' || hasLegacyBridgeBetweenTowersNodes(graph))
    && hasLegacyBridgeBetweenTowersNodes(graph)

  if (!shouldUpgradeBridgePreset) return graph

  const preset = environmentAssemblyPresetsByKey.get('bridge_between_towers')
  if (!preset) return graph

  const rebuilt = preset.build(graph.key, graph.boundEnvironmentKey)
  return {
    ...rebuilt,
    id: graph.id,
    key: graph.key,
    boundEnvironmentKey: graph.boundEnvironmentKey,
    metadata: {
      ...graph.metadata,
      ...rebuilt.metadata,
      migratedFrom: 'bridge_between_towers_legacy_v1',
    },
  }
}

export const environmentAssemblyMacroLibrary: EnvironmentMacroDefinition[] = [
  { key: 'room', label: 'Room', summary: 'Generate a compact room or house shell.', presetKey: 'small_house', examplePrompt: 'room with a front door and three windows' },
  { key: 'wing', label: 'Wing', summary: 'Generate a repeated structural wing.', presetKey: 'townhouse_row', examplePrompt: 'townhouse wing with repeating gable roofs' },
  { key: 'manor', label: 'Manor', summary: 'Generate a large multi-room manor house.', presetKey: 'manor_house_suite', examplePrompt: 'manor house with two wings, a grand stair, and facade windows' },
  { key: 'tower', label: 'Tower', summary: 'Generate a tower with roof cap and stairs.', presetKey: 'round_tower', examplePrompt: 'round tower with a spiral stair and tower cap' },
  { key: 'keep', label: 'Keep', summary: 'Generate a fortified keep or gatehouse complex.', presetKey: 'fortified_keep', examplePrompt: 'fortified keep with a gate arch and tower stair' },
  { key: 'bridge', label: 'Bridge', summary: 'Link two structures with a bridge span.', presetKey: 'bridge_between_towers', examplePrompt: 'bridge between two towers' },
  { key: 'courtyard_shell', label: 'Courtyard Shell', summary: 'Generate a shell with internal void or yard.', presetKey: 'curved_hall_mezzanine', examplePrompt: 'curved hall with an inner void and mezzanine ring' },
  { key: 'palace_wing', label: 'Palace Wing', summary: 'Generate a formal palace wing with pavilions and mansard roof.', presetKey: 'palace_wing', examplePrompt: 'palace wing with a grand stair and repeated facade bays' },
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
