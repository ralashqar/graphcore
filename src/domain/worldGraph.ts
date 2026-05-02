import { z } from 'zod'

export const worldEntityNodeTypeSchema = z.enum([
  'actor',
  'group',
  'place',
  'object',
  'concept',
  'event',
  'sequence_unit',
  'app',
  'persona',
  'business_goal',
  'feature',
  'user_flow',
  'screen',
  'section',
  'component',
  'data_model',
  'action',
  'api_endpoint',
  'backend_function',
  'external_service',
  'design_system',
  'capability',
  'screen_mockup',
  'image_region',
  'animation_spec',
  'tower',
  'code_file',
])
export const worldEntityStatusSchema = z.enum(['draft', 'active', 'locked', 'archived'])
export const worldEntitySourceSchema = z.enum(['user', 'ai', 'inferred'])
export const worldRelationshipStateSchema = z.enum(['confirmed', 'suggested', 'inferred'])
export const worldRelationshipDirectionSchema = z.enum(['outbound', 'inbound', 'bidirectional'])
export const worldViewModeSchema = z.enum(['graph', 'table', 'timeline', 'board', 'wiki'])
export const worldViewKindSchema = z.enum([
  'global_overview',
  'app_overview',
  'entity_neighborhood',
  'faction_map',
  'place_map',
  'lore_cluster',
  'timeline_overview',
  'sequence_overview',
  'wiki_overview',
  'wiki_entity_profile',
  'wiki_thread_arc',
  'wiki_custom',
  'thread_focus',
  'recent_growth',
  'manual_snapshot',
])
export const worldViewRefreshPolicySchema = z.enum(['on_graph_change', 'on_thread_change', 'manual_only'])
export const worldOperatorTypeSchema = z.enum(['wear', 'equip', 'hold', 'place_in', 'paired_with', 'stage_scene'])
export const worldOperatorStatusSchema = z.enum(['draft', 'active', 'archived'])
export const worldResultTypeSchema = z.enum(['look_variant', 'equipped_variant', 'staged_character', 'paired_subject', 'scene_setup'])
export const worldResultStatusSchema = z.enum(['draft', 'ready', 'generating', 'archived'])
export const worldGraphNodeKindSchema = z.enum(['entity', 'operator', 'result'])
export const worldGraphConnectionRoleSchema = z.enum(['input', 'output'])

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldTimelineCertaintySchema = z.enum(['explicit', 'inferred', 'ambiguous', 'floating'])
export const worldTemporalRelationshipKindSchema = z.enum(['before', 'after', 'during', 'overlaps', 'causes'])
export const worldSequenceUnitKindSchema = z.enum(['chapter', 'episode', 'mission', 'quest', 'campaign_moment', 'ugc_beat'])
export const worldSequenceStoryFunctionSchema = z.enum([
  'setup',
  'inciting_incident',
  'rising_action',
  'turning_point',
  'crisis',
  'climax',
  'resolution',
])
export const worldSequenceConsequenceTypeSchema = z.enum(['plot', 'character', 'world_state', 'relationship', 'stakes'])

export const worldEventTimelineMetadataSchema = z.object({
  timelineKey: z.string().default('canon'),
  timeLabel: z.string().default(''),
  era: z.string().default(''),
  sequenceHint: z.number().nullable().default(null),
  durationLabel: z.string().default(''),
  certainty: worldTimelineCertaintySchema.default('floating'),
}).partial()

export const worldRelationshipTemporalMetadataSchema = z.object({
  kind: worldTemporalRelationshipKindSchema,
  timelineKey: z.string().default('canon'),
  certainty: worldTimelineCertaintySchema.default('explicit'),
  impliesChronology: z.boolean().default(true),
  originalKind: worldTemporalRelationshipKindSchema.optional(),
})

export const worldSequenceConsequenceSchema = z.object({
  cause: z.string().default(''),
  effect: z.string().default(''),
  affectedEntityKeys: z.array(z.string()).default([]),
  threadKeys: z.array(z.string()).default([]),
  consequenceType: worldSequenceConsequenceTypeSchema.default('plot'),
})

export const worldSequenceCharacterArcDeltaSchema = z.object({
  actorKey: z.string().default(''),
  before: z.string().default(''),
  pressure: z.string().default(''),
  choice: z.string().default(''),
  after: z.string().default(''),
})

export const worldSequenceMetadataSchema = z.object({
  unitKind: worldSequenceUnitKindSchema.default('chapter'),
  sequenceKey: z.string().default('main'),
  ordinal: z.number().nullable().default(null),
  actLabel: z.string().default(''),
  synopsis: z.string().default(''),
  dramaticQuestion: z.string().default(''),
  storyFunction: worldSequenceStoryFunctionSchema.default('rising_action'),
  outcome: z.string().default(''),
  consequences: z.array(worldSequenceConsequenceSchema).default([]),
  characterArcDeltas: z.array(worldSequenceCharacterArcDeltaSchema).default([]),
  openLoops: z.array(z.string()).default([]),
  resolvedLoops: z.array(z.string()).default([]),
  scriptExpansionReady: z.boolean().default(false),
}).partial()

export const worldWikiSectionKindSchema = z.enum([
  'overview',
  'logline',
  'synopsis',
  'cast',
  'places',
  'factions',
  'items',
  'lore',
  'events',
  'timeline',
  'threads',
  'outputs',
  'style',
  'app',
  'app_product',
  'app_people',
  'app_features',
  'app_flows',
  'app_screens',
  'app_components',
  'app_data',
  'app_backend',
  'app_capabilities',
  'app_design',
  'app_code',
  'gaps',
])

const worldWikiStringFieldSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean).join(', ')
  return value
}, z.string().default(''))

const worldWikiStringListFieldSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  return value
}, z.array(z.string()).default([]))

export const worldWikiPresentationMetadataSchema = z.object({
  title: worldWikiStringFieldSchema,
  logline: worldWikiStringFieldSchema,
  synopsis: worldWikiStringFieldSchema,
  genre: worldWikiStringFieldSchema,
  themes: worldWikiStringListFieldSchema,
  coreConflict: worldWikiStringFieldSchema,
  visualMotifs: worldWikiStringListFieldSchema,
  roleLabel: worldWikiStringFieldSchema,
  shortSummary: worldWikiStringFieldSchema,
  sectionOrder: z.array(worldWikiSectionKindSchema).default([]),
  toneTags: worldWikiStringListFieldSchema,
  wikiSections: z.record(z.string(), z.string()).default({}),
  generatedFromFingerprint: worldWikiStringFieldSchema,
  updatedByTurnId: worldWikiStringFieldSchema,
}).partial()

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
  context: z.string().default(''),
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
  showDerivedLayer: z.boolean().default(true),
  nodePositions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  collapsedState: z.record(z.string(), z.boolean()).default({}),
  sortMode: z.enum(['manual', 'recent', 'alphabetical', 'relationship_count']).default('manual'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldOperatorSchema = z.object({
  id: z.string(),
  key: z.string(),
  operatorType: worldOperatorTypeSchema,
  inputEntityKeys: z.array(z.string()).min(2),
  label: z.string().default(''),
  status: worldOperatorStatusSchema.default('active'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldResultSchema = z.object({
  id: z.string(),
  key: z.string(),
  resultType: worldResultTypeSchema,
  sourceOperatorKey: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  previewAssetKey: z.string().nullable().default(null),
  status: worldResultStatusSchema.default('draft'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldGraphConnectionSchema = z.object({
  id: z.string(),
  key: z.string(),
  sourceNodeKey: z.string(),
  sourceNodeKind: worldGraphNodeKindSchema,
  targetNodeKey: z.string(),
  targetNodeKind: worldGraphNodeKindSchema,
  role: worldGraphConnectionRoleSchema.default('input'),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const worldGraphSnapshotSchema = z.object({
  worldEntities: z.array(worldEntitySchema).default([]),
  worldRelationships: z.array(worldRelationshipSchema).default([]),
  worldViews: z.array(worldViewSchema).default([]),
  worldOperators: z.array(worldOperatorSchema).default([]),
  worldResults: z.array(worldResultSchema).default([]),
  worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
})

export const worldLinkedDefinitionKindSchema = z.enum(['character', 'environment', 'item'])

export const worldEntityCreateInputSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(''),
  context: z.string().default(''),
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
  showDerivedLayer: z.boolean().default(true),
  nodePositions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  collapsedState: z.record(z.string(), z.boolean()).default({}),
  sortMode: z.enum(['manual', 'recent', 'alphabetical', 'relationship_count']).default('manual'),
  metadata: looseRecordSchema.default({}),
})

export const worldViewUpdateInputSchema = worldViewCreateInputSchema.partial()

export const worldOperatorCreateInputSchema = z.object({
  operatorType: worldOperatorTypeSchema,
  inputEntityKeys: z.array(z.string()).min(2),
  label: z.string().default(''),
  status: worldOperatorStatusSchema.default('active'),
  metadata: looseRecordSchema.default({}),
})

export const worldOperatorUpdateInputSchema = worldOperatorCreateInputSchema.partial()

export const worldResultCreateInputSchema = z.object({
  resultType: worldResultTypeSchema,
  sourceOperatorKey: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(''),
  previewAssetKey: z.string().nullable().default(null),
  status: worldResultStatusSchema.default('draft'),
  metadata: looseRecordSchema.default({}),
})

export const worldResultUpdateInputSchema = worldResultCreateInputSchema.partial()

export const worldGraphConnectionCreateInputSchema = z.object({
  sourceNodeKey: z.string().min(1),
  sourceNodeKind: worldGraphNodeKindSchema,
  targetNodeKey: z.string().min(1),
  targetNodeKind: worldGraphNodeKindSchema,
  role: worldGraphConnectionRoleSchema.default('input'),
  metadata: looseRecordSchema.default({}),
})

export const worldGraphConnectionUpdateInputSchema = worldGraphConnectionCreateInputSchema.partial()

export const worldDerivedCompositionCreateInputSchema = z.object({
  sourceEntityKey: z.string().min(1),
  targetEntityKey: z.string().min(1),
  operatorType: worldOperatorTypeSchema,
  title: z.string().min(1).optional(),
  summary: z.string().default(''),
  previewAssetKey: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
})

export const worldDerivedCompositionUpdateInputSchema = z.object({
  operatorChanges: worldOperatorUpdateInputSchema.default({}),
  resultChanges: worldResultUpdateInputSchema.default({}),
})

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
    worldOperators: z.array(worldOperatorSchema).default([]),
    worldResults: z.array(worldResultSchema).default([]),
    worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
  }),
  model: z.string().min(1).default('gpt-5.4'),
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
    worldOperators: z.array(worldOperatorSchema).default([]),
    worldResults: z.array(worldResultSchema).default([]),
    worldGraphConnections: z.array(worldGraphConnectionSchema).default([]),
  }),
  model: z.string().min(1).default('gpt-5.4'),
})

export const resetProjectWorldRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
})

export const resetProjectWorldResponseSchema = z.object({
  ok: z.literal(true),
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  deleted: z.object({
    worldPromptEvents: z.number().int().nonnegative().default(0),
    worldPromptMessages: z.number().int().nonnegative().default(0),
    worldPromptTurns: z.number().int().nonnegative().default(0),
    worldPromptSessions: z.number().int().nonnegative().default(0),
    worldThreads: z.number().int().nonnegative().default(0),
    worldBuildBatches: z.number().int().nonnegative().default(0),
    worldGraphConnections: z.number().int().nonnegative().default(0),
    worldResults: z.number().int().nonnegative().default(0),
    worldOperators: z.number().int().nonnegative().default(0),
    worldRelationships: z.number().int().nonnegative().default(0),
    worldViews: z.number().int().nonnegative().default(0),
    worldEntities: z.number().int().nonnegative().default(0),
    projectDefinitions: z.number().int().nonnegative().default(0),
    projectAssets: z.number().int().nonnegative().default(0),
    storageObjects: z.number().int().nonnegative().default(0),
  }),
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
export type WorldOperator = z.infer<typeof worldOperatorSchema>
export type WorldResult = z.infer<typeof worldResultSchema>
export type WorldGraphConnection = z.infer<typeof worldGraphConnectionSchema>
export type WorldTimelineCertainty = z.infer<typeof worldTimelineCertaintySchema>
export type WorldTemporalRelationshipKind = z.infer<typeof worldTemporalRelationshipKindSchema>
export type WorldEventTimelineMetadata = z.infer<typeof worldEventTimelineMetadataSchema>
export type WorldRelationshipTemporalMetadata = z.infer<typeof worldRelationshipTemporalMetadataSchema>
export type WorldSequenceUnitKind = z.infer<typeof worldSequenceUnitKindSchema>
export type WorldSequenceStoryFunction = z.infer<typeof worldSequenceStoryFunctionSchema>
export type WorldSequenceConsequenceType = z.infer<typeof worldSequenceConsequenceTypeSchema>
export type WorldSequenceConsequence = z.infer<typeof worldSequenceConsequenceSchema>
export type WorldSequenceCharacterArcDelta = z.infer<typeof worldSequenceCharacterArcDeltaSchema>
export type WorldSequenceMetadata = z.infer<typeof worldSequenceMetadataSchema>
export type WorldWikiSectionKind = z.infer<typeof worldWikiSectionKindSchema>
export type WorldWikiPresentationMetadata = z.infer<typeof worldWikiPresentationMetadataSchema>
export type WorldGraphSnapshot = z.infer<typeof worldGraphSnapshotSchema>
export type WorldEntityCreateInput = z.infer<typeof worldEntityCreateInputSchema>
export type WorldEntityUpdateInput = z.infer<typeof worldEntityUpdateInputSchema>
export type WorldRelationshipCreateInput = z.infer<typeof worldRelationshipCreateInputSchema>
export type WorldRelationshipUpdateInput = z.infer<typeof worldRelationshipUpdateInputSchema>
export type WorldViewCreateInput = z.infer<typeof worldViewCreateInputSchema>
export type WorldViewUpdateInput = z.infer<typeof worldViewUpdateInputSchema>
export type WorldViewKind = z.infer<typeof worldViewKindSchema>
export type WorldViewRefreshPolicy = z.infer<typeof worldViewRefreshPolicySchema>
export type WorldOperatorCreateInput = z.infer<typeof worldOperatorCreateInputSchema>
export type WorldOperatorUpdateInput = z.infer<typeof worldOperatorUpdateInputSchema>
export type WorldResultCreateInput = z.infer<typeof worldResultCreateInputSchema>
export type WorldResultUpdateInput = z.infer<typeof worldResultUpdateInputSchema>
export type WorldGraphConnectionCreateInput = z.infer<typeof worldGraphConnectionCreateInputSchema>
export type WorldGraphConnectionUpdateInput = z.infer<typeof worldGraphConnectionUpdateInputSchema>
export type WorldDerivedCompositionCreateInput = z.infer<typeof worldDerivedCompositionCreateInputSchema>
export type WorldDerivedCompositionUpdateInput = z.infer<typeof worldDerivedCompositionUpdateInputSchema>
export type WorldGraphSeedRequest = z.infer<typeof worldGraphSeedRequestSchema>
export type WorldGraphExpansionRequest = z.infer<typeof worldGraphExpansionRequestSchema>
export type WorldGraphGeneratorResult = z.infer<typeof worldGraphGeneratorResultSchema>
export type ResetProjectWorldRequest = z.infer<typeof resetProjectWorldRequestSchema>
export type ResetProjectWorldResponse = z.infer<typeof resetProjectWorldResponseSchema>
