import { z } from 'zod'

export const worldEntityNodeTypeSchema = z.enum(['actor', 'group', 'place', 'object', 'concept', 'event'])
export const worldEntityStatusSchema = z.enum(['draft', 'active', 'locked', 'archived'])
export const worldEntitySourceSchema = z.enum(['user', 'ai', 'inferred'])
export const worldRelationshipStateSchema = z.enum(['confirmed', 'suggested', 'inferred'])
export const worldRelationshipDirectionSchema = z.enum(['outbound', 'inbound', 'bidirectional'])
export const worldViewModeSchema = z.enum(['graph', 'table', 'timeline', 'board'])

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldViewFilterSchema = z.object({
  nodeTypes: z.array(worldEntityNodeTypeSchema).default([]),
  linkedOnly: z.boolean().default(false),
  unlinkedOnly: z.boolean().default(false),
  recentlyAdded: z.boolean().default(false),
  usedInCinematic: z.boolean().default(false),
  aiSuggestedOnly: z.boolean().default(false),
})

export const worldViewCameraSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
})

export const worldEntitySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  summary: z.string().default(''),
  nodeType: worldEntityNodeTypeSchema,
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  status: worldEntityStatusSchema.default('active'),
  thumbnailAssetKey: z.string().nullable().default(null),
  linkedDefinitionKey: z.string().nullable().default(null),
  source: worldEntitySourceSchema.default('user'),
  customProperties: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldRelationshipSchema = z.object({
  id: z.string(),
  key: z.string(),
  sourceEntityKey: z.string(),
  targetEntityKey: z.string(),
  verb: z.string(),
  direction: worldRelationshipDirectionSchema.default('outbound'),
  strength: z.number().min(0).max(1).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  source: worldEntitySourceSchema.default('user'),
  notes: z.string().default(''),
  state: worldRelationshipStateSchema.default('confirmed'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldViewSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  mode: worldViewModeSchema.default('graph'),
  filters: worldViewFilterSchema.default(() => ({
    nodeTypes: [],
    linkedOnly: false,
    unlinkedOnly: false,
    recentlyAdded: false,
    usedInCinematic: false,
    aiSuggestedOnly: false,
  })),
  search: z.string().default(''),
  rootEntityKey: z.string().nullable().default(null),
  camera: worldViewCameraSchema.default(() => ({
    x: 0,
    y: 0,
    zoom: 1,
  })),
  focusDepth: z.number().int().min(1).max(2).default(1),
  showSuggestions: z.boolean().default(true),
  showLabels: z.boolean().default(true),
  nodePositions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  collapsedState: z.record(z.string(), z.boolean()).default({}),
  sortMode: z.enum(['manual', 'recent', 'alphabetical', 'relationship_count']).default('manual'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldGraphSnapshotSchema = z.object({
  worldEntities: z.array(worldEntitySchema).default([]),
  worldRelationships: z.array(worldRelationshipSchema).default([]),
  worldViews: z.array(worldViewSchema).default([]),
})

export const worldLinkedDefinitionKindSchema = z.enum(['character', 'environment', 'item'])

export const worldEntityCreateInputSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(''),
  nodeType: worldEntityNodeTypeSchema,
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  status: worldEntityStatusSchema.default('active'),
  thumbnailAssetKey: z.string().nullable().default(null),
  linkedDefinitionKey: z.string().nullable().default(null),
  source: worldEntitySourceSchema.default('user'),
  customProperties: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
  ensureLinkedDefinition: z.boolean().default(true),
})

export const worldEntityUpdateInputSchema = worldEntityCreateInputSchema.partial()

export const worldRelationshipCreateInputSchema = z.object({
  sourceEntityKey: z.string().min(1),
  targetEntityKey: z.string().min(1),
  verb: z.string().min(1),
  direction: worldRelationshipDirectionSchema.default('outbound'),
  strength: z.number().min(0).max(1).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  source: worldEntitySourceSchema.default('user'),
  notes: z.string().default(''),
  state: worldRelationshipStateSchema.default('confirmed'),
  metadata: looseRecordSchema.default({}),
})

export const worldRelationshipUpdateInputSchema = worldRelationshipCreateInputSchema.partial()

export const worldViewCreateInputSchema = z.object({
  name: z.string().min(1),
  mode: worldViewModeSchema.default('graph'),
  filters: worldViewFilterSchema.default(() => ({
    nodeTypes: [],
    linkedOnly: false,
    unlinkedOnly: false,
    recentlyAdded: false,
    usedInCinematic: false,
    aiSuggestedOnly: false,
  })),
  search: z.string().default(''),
  rootEntityKey: z.string().nullable().default(null),
  camera: worldViewCameraSchema.default(() => ({
    x: 0,
    y: 0,
    zoom: 1,
  })),
  focusDepth: z.number().int().min(1).max(2).default(1),
  showSuggestions: z.boolean().default(true),
  showLabels: z.boolean().default(true),
  nodePositions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  collapsedState: z.record(z.string(), z.boolean()).default({}),
  sortMode: z.enum(['manual', 'recent', 'alphabetical', 'relationship_count']).default('manual'),
  metadata: looseRecordSchema.default({}),
})

export const worldViewUpdateInputSchema = worldViewCreateInputSchema.partial()

export const worldGraphSeedRequestSchema = z.object({
  prompt: z.string().min(1),
  snapshot: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
    }),
    definitions: z.array(z.object({
      key: z.string(),
      kind: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    })).default([]),
    worldEntities: z.array(worldEntitySchema).default([]),
    worldRelationships: z.array(worldRelationshipSchema).default([]),
  }),
  model: z.string().min(1).default('gpt-5-mini'),
})

export const worldGraphExpansionRequestSchema = z.object({
  rootEntityKey: z.string().min(1),
  snapshot: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
    }),
    definitions: z.array(z.object({
      key: z.string(),
      kind: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    })).default([]),
    worldEntities: z.array(worldEntitySchema).default([]),
    worldRelationships: z.array(worldRelationshipSchema).default([]),
  }),
  model: z.string().min(1).default('gpt-5-mini'),
})

export const worldGraphGeneratorEntitySchema = z.object({
  name: z.string(),
  summary: z.string().default(''),
  nodeType: worldEntityNodeTypeSchema,
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
})

export const worldGraphGeneratorRelationshipSchema = z.object({
  sourceName: z.string(),
  targetName: z.string(),
  verb: z.string(),
  direction: worldRelationshipDirectionSchema.default('outbound'),
  notes: z.string().default(''),
})

export const worldGraphGeneratorViewSchema = z.object({
  name: z.string(),
  rootEntityName: z.string().nullable().default(null),
})

export const worldGraphGeneratorResultSchema = z.object({
  requestSummary: z.string().default('World graph seed'),
  entities: z.array(worldGraphGeneratorEntitySchema).default([]),
  relationships: z.array(worldGraphGeneratorRelationshipSchema).default([]),
  view: worldGraphGeneratorViewSchema.nullable().default(null),
  assistantNote: z.string().default(''),
})

export type WorldEntity = z.infer<typeof worldEntitySchema>
export type WorldRelationship = z.infer<typeof worldRelationshipSchema>
export type WorldView = z.infer<typeof worldViewSchema>
export type WorldGraphSnapshot = z.infer<typeof worldGraphSnapshotSchema>
export type WorldEntityCreateInput = z.infer<typeof worldEntityCreateInputSchema>
export type WorldEntityUpdateInput = z.infer<typeof worldEntityUpdateInputSchema>
export type WorldRelationshipCreateInput = z.infer<typeof worldRelationshipCreateInputSchema>
export type WorldRelationshipUpdateInput = z.infer<typeof worldRelationshipUpdateInputSchema>
export type WorldViewCreateInput = z.infer<typeof worldViewCreateInputSchema>
export type WorldViewUpdateInput = z.infer<typeof worldViewUpdateInputSchema>
export type WorldGraphSeedRequest = z.infer<typeof worldGraphSeedRequestSchema>
export type WorldGraphExpansionRequest = z.infer<typeof worldGraphExpansionRequestSchema>
export type WorldGraphGeneratorResult = z.infer<typeof worldGraphGeneratorResultSchema>
