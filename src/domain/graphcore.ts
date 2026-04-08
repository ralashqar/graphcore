import { z } from 'zod'

export const definitionKindSchema = z.enum([
  'item',
  'stat',
  'quest',
  'character',
  'location',
  'market',
  'narrative_flow',
  'graph',
])

export const definitionStatusSchema = z.enum([
  'draft',
  'active',
  'deprecated',
  'archived',
])

export const assetKindSchema = z.enum(['image', 'audio', 'json', 'document', 'other'])

export const componentTypeSchema = z.enum([
  'inventory',
  'stat_block',
  'progression',
  'pricing',
  'dialogue_actor',
  'quest_state',
  'location_state',
  'spawn_rules',
  'media',
])

export const fieldTypeSchema = z.enum([
  'text',
  'long_text',
  'number',
  'boolean',
  'enum',
  'asset_ref',
  'definition_ref',
  'url',
])

export const nodeTypeSchema = z.enum([
  'start',
  'text',
  'choice',
  'condition',
  'effect',
  'quest_step',
  'branch',
  'call_subgraph',
  'return',
  'random',
  'market',
  'end',
])

export const graphTypeSchema = z.enum(['narrative_flow', 'system_graph', 'quest_flow'])

export const questStateSchema = z.enum([
  'not_started',
  'available',
  'active',
  'completed',
  'failed',
])

const looseRecordSchema = z.record(z.string(), z.unknown())

export const assetRefSchema = z.object({
  assetKey: z.string(),
  usage: z.string(),
  required: z.boolean().default(false),
})

export const fieldValueValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const fieldValueSchema = z.object({
  fieldKey: z.string(),
  value: fieldValueValueSchema,
})

export const fieldDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  fieldType: fieldTypeSchema,
  description: z.string().default(''),
  required: z.boolean().default(false),
  defaultValue: fieldValueValueSchema.default(null),
  constraints: looseRecordSchema.default({}),
  sortOrder: z.number().int().default(0),
})

export const archetypeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  summary: z.string().default(''),
  appliesToKind: definitionKindSchema.default('item'),
  iconAssetKey: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  llmHints: looseRecordSchema.default({}),
  fields: z.array(fieldDefinitionSchema).default([]),
})

const itemStackSchema = z.object({
  itemKey: z.string(),
  quantity: z.number().int().default(1),
})

const statValueSchema = z.object({
  statKey: z.string(),
  base: z.number().default(0),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
})

const weightedItemSchema = z.object({
  key: z.string(),
  weight: z.number().positive().default(1),
})

export const inventoryComponentSchema = z.object({
  startingItems: z.array(itemStackSchema).default([]),
  capacityFormula: z.string().nullable().default(null),
})

export const statBlockComponentSchema = z.object({
  stats: z.array(statValueSchema).default([]),
})

export const progressionComponentSchema = z.object({
  tokenKeys: z.array(z.string()).default([]),
  unlocks: z.array(z.string()).default([]),
})

export const pricingComponentSchema = z.object({
  currencyItemKey: z.string(),
  priceFormula: z.string(),
  stockRules: z
    .object({
      restockIntervalMinutes: z.number().int().positive().nullable().default(null),
      maxStock: z.number().int().positive().nullable().default(null),
    })
    .default({ restockIntervalMinutes: null, maxStock: null }),
})

export const dialogueActorComponentSchema = z.object({
  portraitAssetKey: z.string().nullable().default(null),
  voiceAssetKey: z.string().nullable().default(null),
  persona: z.string().default(''),
})

export const questStateComponentSchema = z.object({
  initialState: questStateSchema.default('available'),
  completionTokenKey: z.string().nullable().default(null),
})

export const locationStateComponentSchema = z.object({
  region: z.string().default(''),
  isUnlockedByDefault: z.boolean().default(false),
})

export const spawnRulesComponentSchema = z.object({
  spawnTable: z.array(weightedItemSchema).default([]),
  uniqueSpawn: z.boolean().default(false),
})

export const mediaComponentSchema = z.object({
  imageAssetKey: z.string().nullable().default(null),
  audioAssetKey: z.string().nullable().default(null),
  caption: z.string().nullable().default(null),
})

export const componentConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('inventory'),
    config: inventoryComponentSchema,
  }),
  z.object({
    type: z.literal('stat_block'),
    config: statBlockComponentSchema,
  }),
  z.object({
    type: z.literal('progression'),
    config: progressionComponentSchema,
  }),
  z.object({
    type: z.literal('pricing'),
    config: pricingComponentSchema,
  }),
  z.object({
    type: z.literal('dialogue_actor'),
    config: dialogueActorComponentSchema,
  }),
  z.object({
    type: z.literal('quest_state'),
    config: questStateComponentSchema,
  }),
  z.object({
    type: z.literal('location_state'),
    config: locationStateComponentSchema,
  }),
  z.object({
    type: z.literal('spawn_rules'),
    config: spawnRulesComponentSchema,
  }),
  z.object({
    type: z.literal('media'),
    config: mediaComponentSchema,
  }),
])

export const definitionBaseSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: definitionKindSchema,
  name: z.string(),
  summary: z.string().default(''),
  status: definitionStatusSchema.default('draft'),
  iconAssetKey: z.string().nullable().default(null),
  archetypeKey: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  schemaVersion: z.number().int().positive().default(1),
  metadata: looseRecordSchema.default({}),
  llmHints: looseRecordSchema.default({}),
  assetRefs: z.array(assetRefSchema).default([]),
  definitionData: looseRecordSchema.default({}),
  fieldValues: z.array(fieldValueSchema).default([]),
  customFields: z.array(fieldDefinitionSchema).default([]),
  components: z.array(componentConfigSchema).default([]),
})

export type FormulaExpr =
  | { type: 'literal'; value: number }
  | { type: 'ref'; ref: string }
  | { type: 'math'; op: 'add' | 'subtract' | 'multiply' | 'divide'; left: FormulaExpr; right: FormulaExpr }
  | { type: 'clamp'; value: FormulaExpr; min: FormulaExpr; max: FormulaExpr }
  | { type: 'lookup'; source: string; key: string; fallback?: FormulaExpr }

export type ConditionExpr =
  | { type: 'all'; conditions: ConditionExpr[] }
  | { type: 'any'; conditions: ConditionExpr[] }
  | { type: 'not'; condition: ConditionExpr }
  | { type: 'hasItem'; itemKey: string; minQuantity: number }
  | { type: 'itemCount'; itemKey: string; comparator: 'eq' | 'gte' | 'lte' | 'gt' | 'lt'; value: number }
  | { type: 'statCompare'; statKey: string; comparator: 'eq' | 'gte' | 'lte' | 'gt' | 'lt'; value: number }
  | { type: 'questState'; questKey: string; state: z.infer<typeof questStateSchema> }
  | { type: 'tokenPresent'; tokenKey: string }
  | { type: 'locationUnlocked'; locationKey: string }
  | { type: 'flagEquals'; flagKey: string; value: string | number | boolean }

export const formulaExprSchema: z.ZodType<FormulaExpr> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('literal'), value: z.number() }),
    z.object({ type: z.literal('ref'), ref: z.string() }),
    z.object({
      type: z.literal('math'),
      op: z.enum(['add', 'subtract', 'multiply', 'divide']),
      left: formulaExprSchema,
      right: formulaExprSchema,
    }),
    z.object({
      type: z.literal('clamp'),
      value: formulaExprSchema,
      min: formulaExprSchema,
      max: formulaExprSchema,
    }),
    z.object({
      type: z.literal('lookup'),
      source: z.string(),
      key: z.string(),
      fallback: formulaExprSchema.optional(),
    }),
  ]),
)

export const conditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('all'), conditions: z.array(conditionExprSchema) }),
    z.object({ type: z.literal('any'), conditions: z.array(conditionExprSchema) }),
    z.object({ type: z.literal('not'), condition: conditionExprSchema }),
    z.object({ type: z.literal('hasItem'), itemKey: z.string(), minQuantity: z.number().int().default(1) }),
    z.object({
      type: z.literal('itemCount'),
      itemKey: z.string(),
      comparator: z.enum(['eq', 'gte', 'lte', 'gt', 'lt']),
      value: z.number(),
    }),
    z.object({
      type: z.literal('statCompare'),
      statKey: z.string(),
      comparator: z.enum(['eq', 'gte', 'lte', 'gt', 'lt']),
      value: z.number(),
    }),
    z.object({
      type: z.literal('questState'),
      questKey: z.string(),
      state: questStateSchema,
    }),
    z.object({ type: z.literal('tokenPresent'), tokenKey: z.string() }),
    z.object({ type: z.literal('locationUnlocked'), locationKey: z.string() }),
    z.object({ type: z.literal('flagEquals'), flagKey: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  ]),
)

export const effectOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('grantItem'), itemKey: z.string(), quantity: z.number().int().default(1) }),
  z.object({ type: z.literal('removeItem'), itemKey: z.string(), quantity: z.number().int().default(1) }),
  z.object({ type: z.literal('setStat'), statKey: z.string(), value: formulaExprSchema }),
  z.object({ type: z.literal('addStat'), statKey: z.string(), value: formulaExprSchema }),
  z.object({ type: z.literal('setQuestState'), questKey: z.string(), state: questStateSchema }),
  z.object({ type: z.literal('grantToken'), tokenKey: z.string() }),
  z.object({ type: z.literal('revokeToken'), tokenKey: z.string() }),
  z.object({ type: z.literal('unlockLocation'), locationKey: z.string() }),
  z.object({ type: z.literal('enqueueNarrative'), graphKey: z.string() }),
  z.object({ type: z.literal('emitEvent'), eventKey: z.string(), payload: looseRecordSchema.default({}) }),
])

export const portDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  direction: z.enum(['input', 'output']),
})

export const nodeDisplaySchema = z.object({
  colorToken: z.string().optional(),
  iconAssetKey: z.string().nullable().default(null),
  compactPreview: z.boolean().default(false),
})

export const nodeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  type: nodeTypeSchema,
  title: z.string(),
  templateKey: z.string().nullable().default(null),
  subtitle: z.string().nullable().default(null),
  position: z.object({ x: z.number(), y: z.number() }),
  body: z
    .object({
      text: z.string().nullable().default(null),
      imageAssetKey: z.string().nullable().default(null),
      audioAssetKey: z.string().nullable().default(null),
      choices: z.array(z.object({ id: z.string(), label: z.string(), condition: conditionExprSchema.optional() })).default([]),
    })
    .default({
      text: null,
      imageAssetKey: null,
      audioAssetKey: null,
      choices: [],
    }),
  condition: conditionExprSchema.nullable().default(null),
  effects: z.array(effectOpSchema).default([]),
  ports: z.array(portDefinitionSchema).default([]),
  display: nodeDisplaySchema.default({
    iconAssetKey: null,
    compactPreview: false,
  }),
  metadata: looseRecordSchema.default({}),
})

export const edgeDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  source: z.object({ nodeKey: z.string(), portId: z.string().nullable().default(null) }),
  target: z.object({ nodeKey: z.string(), portId: z.string().nullable().default(null) }),
  label: z.string().nullable().default(null),
  condition: conditionExprSchema.nullable().default(null),
  metadata: looseRecordSchema.default({}),
})

export const graphDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  graphType: graphTypeSchema.default('narrative_flow'),
  summary: z.string().default(''),
  entryNodeKey: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  llmHints: looseRecordSchema.default({}),
  nodes: z.array(nodeDefinitionSchema).default([]),
  edges: z.array(edgeDefinitionSchema).default([]),
})

export const assetDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  kind: assetKindSchema,
  mimeType: z.string(),
  storagePath: z.string(),
  metadata: looseRecordSchema.default({}),
  llmHints: looseRecordSchema.default({}),
})

export const workspaceRoleSchema = z.enum(['owner', 'editor', 'viewer'])

export const projectSnapshotSchema = z.object({
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: workspaceRoleSchema,
  }),
  project: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
    visibility: z.enum(['private', 'internal', 'public']),
  }),
  draft: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    isPrimary: z.boolean(),
    updatedAt: z.string(),
  }),
  archetypes: z.array(archetypeDefinitionSchema).default([]),
  definitions: z.array(definitionBaseSchema),
  graphs: z.array(graphDefinitionSchema),
  assets: z.array(assetDefinitionSchema),
  patchSets: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      prompt: z.string(),
      status: z.enum(['draft', 'proposed', 'applied', 'rejected']),
      operations: z.array(z.record(z.string(), z.unknown())),
      diagnostics: z.array(z.string()).default([]),
    }),
  ),
  releases: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
      label: z.string(),
      createdAt: z.string(),
    }),
  ),
})

export const patchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_archetype'),
    key: z.string(),
    payload: archetypeDefinitionSchema.partial(),
  }),
  z.object({
    op: z.literal('update_archetype'),
    key: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete_archetype'),
    key: z.string(),
  }),
  z.object({
    op: z.literal('add_archetype_field'),
    key: z.string(),
    field: fieldDefinitionSchema,
  }),
  z.object({
    op: z.literal('update_archetype_field'),
    key: z.string(),
    fieldKey: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('remove_archetype_field'),
    key: z.string(),
    fieldKey: z.string(),
  }),
  z.object({
    op: z.literal('create_definition'),
    kind: definitionKindSchema,
    key: z.string(),
    payload: definitionBaseSchema.partial(),
  }),
  z.object({
    op: z.literal('update_definition'),
    key: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete_definition'),
    key: z.string(),
  }),
  z.object({
    op: z.literal('set_icon_asset'),
    key: z.string(),
    iconAssetKey: z.string().nullable(),
  }),
  z.object({
    op: z.literal('set_archetype'),
    key: z.string(),
    archetypeKey: z.string().nullable(),
  }),
  z.object({
    op: z.literal('set_field_value'),
    key: z.string(),
    fieldKey: z.string(),
    value: fieldValueValueSchema,
  }),
  z.object({
    op: z.literal('add_custom_field'),
    key: z.string(),
    field: fieldDefinitionSchema,
  }),
  z.object({
    op: z.literal('remove_custom_field'),
    key: z.string(),
    fieldKey: z.string(),
  }),
  z.object({
    op: z.literal('attach_component'),
    key: z.string(),
    component: componentConfigSchema,
  }),
  z.object({
    op: z.literal('update_component'),
    key: z.string(),
    componentType: componentTypeSchema,
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('detach_component'),
    key: z.string(),
    componentType: componentTypeSchema,
  }),
  z.object({
    op: z.literal('create_graph'),
    key: z.string(),
    payload: graphDefinitionSchema.partial(),
  }),
  z.object({
    op: z.literal('update_graph'),
    key: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete_graph'),
    key: z.string(),
  }),
  z.object({
    op: z.literal('duplicate_graph'),
    key: z.string(),
    nextKey: z.string(),
  }),
  z.object({
    op: z.literal('create_node'),
    graphKey: z.string(),
    node: nodeDefinitionSchema,
  }),
  z.object({
    op: z.literal('update_node'),
    graphKey: z.string(),
    nodeKey: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete_node'),
    graphKey: z.string(),
    nodeKey: z.string(),
  }),
  z.object({
    op: z.literal('move_node'),
    graphKey: z.string(),
    nodeKey: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    op: z.literal('connect_edge'),
    graphKey: z.string(),
    edge: edgeDefinitionSchema,
  }),
  z.object({
    op: z.literal('update_edge'),
    graphKey: z.string(),
    edgeKey: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('delete_edge'),
    graphKey: z.string(),
    edgeKey: z.string(),
  }),
  z.object({
    op: z.literal('replace_subgraph'),
    graphKey: z.string(),
    nodes: z.array(nodeDefinitionSchema),
    edges: z.array(edgeDefinitionSchema),
  }),
  z.object({
    op: z.literal('set_condition'),
    graphKey: z.string(),
    nodeKey: z.string(),
    condition: conditionExprSchema.nullable(),
  }),
  z.object({
    op: z.literal('set_effects'),
    graphKey: z.string(),
    nodeKey: z.string(),
    effects: z.array(effectOpSchema),
  }),
  z.object({
    op: z.literal('set_node_body'),
    graphKey: z.string(),
    nodeKey: z.string(),
    body: nodeDefinitionSchema.shape.body,
  }),
  z.object({
    op: z.literal('set_node_choices'),
    graphKey: z.string(),
    nodeKey: z.string(),
    choices: z.array(z.object({ id: z.string(), label: z.string(), condition: conditionExprSchema.optional() })),
  }),
  z.object({
    op: z.literal('set_node_media'),
    graphKey: z.string(),
    nodeKey: z.string(),
    media: z.object({
      imageAssetKey: z.string().nullable().default(null),
      audioAssetKey: z.string().nullable().default(null),
    }),
  }),
  z.object({
    op: z.literal('attach_asset'),
    key: z.string(),
    assetRef: assetRefSchema,
  }),
  z.object({
    op: z.literal('rekey_reference'),
    oldKey: z.string(),
    newKey: z.string(),
  }),
])

export const diagnosticSchema = z.object({
  level: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  graphKey: z.string().nullable().default(null),
  nodeKey: z.string().nullable().default(null),
})

export const gameSystemBundleSchema = z.object({
  bundleVersion: z.literal(1),
  manifest: z.object({
    workspaceSlug: z.string(),
    projectSlug: z.string(),
    draftId: z.string(),
    generatedAt: z.string(),
    definitionCount: z.number().int().nonnegative(),
    graphCount: z.number().int().nonnegative(),
    archetypeCount: z.number().int().nonnegative(),
    assetCount: z.number().int().nonnegative(),
  }),
  archetypes: z.array(archetypeDefinitionSchema),
  definitions: z.array(definitionBaseSchema),
  graphs: z.array(graphDefinitionSchema),
  assets: z.array(assetDefinitionSchema),
  lookupIndices: z.object({
    definitionsByKind: z.record(z.string(), z.array(z.string())),
    definitionsByArchetype: z.record(z.string(), z.array(z.string())),
    archetypesByKind: z.record(z.string(), z.array(z.string())),
    graphEntryNodes: z.record(z.string(), z.string().nullable()),
    assetKeysByKind: z.record(z.string(), z.array(z.string())),
  }),
  diagnostics: z.array(diagnosticSchema),
})

export type DefinitionKind = z.infer<typeof definitionKindSchema>
export type DefinitionBase = z.infer<typeof definitionBaseSchema>
export type ComponentEnvelope = z.infer<typeof componentConfigSchema>
export type ArchetypeDefinition = z.infer<typeof archetypeDefinitionSchema>
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>
export type FieldValue = z.infer<typeof fieldValueSchema>
export type GraphDefinition = z.infer<typeof graphDefinitionSchema>
export type NodeDefinition = z.infer<typeof nodeDefinitionSchema>
export type EdgeDefinition = z.infer<typeof edgeDefinitionSchema>
export type PortDefinition = z.infer<typeof portDefinitionSchema>
export type AssetDefinition = z.infer<typeof assetDefinitionSchema>
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>
export type PatchOperation = z.infer<typeof patchOperationSchema>
export type Diagnostic = z.infer<typeof diagnosticSchema>
export type GameSystemBundle = z.infer<typeof gameSystemBundleSchema>
export type EffectOp = z.infer<typeof effectOpSchema>
export type GraphType = z.infer<typeof graphTypeSchema>
export type GraphCreateInput = Pick<GraphDefinition, 'name' | 'key' | 'graphType' | 'summary'>
export type GraphEditorSelection = {
  graphKey: string | null
  nodeKey: string | null
  edgeKey: string | null
}
export type NodeTemplateDefinition = {
  key: string
  label: string
  groupKey: string
  baseNodeType: NodeDefinition['type']
  compatibleGraphTypes: GraphType[]
  defaultTitle: string
  defaultSubtitle?: string | null
  defaultBody?: Partial<NodeDefinition['body']>
  defaultCondition?: ConditionExpr | null
  defaultEffects?: EffectOp[]
  defaultMetadata?: Record<string, unknown>
  defaultDisplay?: Partial<NodeDefinition['display']>
  defaultChoices?: Array<{ id: string; label: string; condition?: ConditionExpr }>
  inspectorSchema: 'story' | 'choice' | 'condition' | 'effect' | 'quest_step' | 'market' | 'call_subgraph' | 'random' | 'branch' | 'basic'
}
export type NodeLibraryGroup = {
  key: string
  label: string
  templates: NodeTemplateDefinition[]
}

export const schemaCatalog = {
  archetypeDefinitionSchema,
  assetDefinitionSchema,
  componentConfigSchema,
  conditionExprSchema,
  definitionBaseSchema,
  diagnosticSchema,
  edgeDefinitionSchema,
  effectOpSchema,
  fieldDefinitionSchema,
  fieldValueSchema,
  formulaExprSchema,
  gameSystemBundleSchema,
  graphDefinitionSchema,
  graphTypeSchema,
  nodeDisplaySchema,
  nodeDefinitionSchema,
  patchOperationSchema,
  projectSnapshotSchema,
}
