import {
  archetypePresetMap,
  definitionPresetMap,
  graphPresetMap,
  packPresetMap,
  presetCatalog,
} from '../../../src/domain/presetCatalog.ts'

const templateCatalog = [
  { key: 'start', type: 'start', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'story_text', type: 'text', graphs: ['narrative_flow', 'quest_flow'] },
  { key: 'choice', type: 'choice', graphs: ['narrative_flow', 'quest_flow'] },
  { key: 'end', type: 'end', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'inventory_check', type: 'condition', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'token_check', type: 'condition', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'stat_check', type: 'condition', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'quest_state_check', type: 'condition', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'grant_item', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'remove_item', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'modify_stat', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'grant_token', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'revoke_token', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'quest_step', type: 'quest_step', graphs: ['quest_flow', 'narrative_flow'] },
  { key: 'market', type: 'market', graphs: ['narrative_flow', 'system_graph'] },
  { key: 'branch', type: 'branch', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'random', type: 'random', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'call_subgraph', type: 'call_subgraph', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'return', type: 'return', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
  { key: 'effect', type: 'effect', graphs: ['narrative_flow', 'quest_flow', 'system_graph'] },
] as const

const templateMap = new Map(templateCatalog.map((template) => [template.key, template]))

const fieldTypeMap: Record<string, string> = {
  string: 'text',
  text: 'text',
  long_text: 'long_text',
  longtext: 'long_text',
  textarea: 'long_text',
  number: 'number',
  int: 'number',
  integer: 'number',
  float: 'number',
  boolean: 'boolean',
  bool: 'boolean',
  enum: 'enum',
  asset_ref: 'asset_ref',
  asset: 'asset_ref',
  definition_ref: 'definition_ref',
  definition: 'definition_ref',
  ref: 'definition_ref',
  url: 'url',
}

export const CONTENT_PASS_ALLOWED_OPS = new Set([
  'set_game_spec',
  'apply_preset_pack',
  'instantiate_archetype_preset',
  'instantiate_definition_preset',
  'create_definition',
  'update_definition',
  'set_archetype',
  'set_field_value',
  'create_archetype',
  'add_archetype_field',
  'update_archetype_field',
  'remove_archetype_field',
  'add_custom_field',
  'remove_custom_field',
  'set_icon_asset',
  'attach_asset',
])

export const GRAPH_PASS_ALLOWED_OPS = new Set([
  'instantiate_graph_preset',
  'create_graph',
  'update_graph',
  'duplicate_graph',
  'delete_graph',
  'create_node',
  'update_node',
  'update_node_template',
  'move_node',
  'connect_edge',
  'update_edge',
  'delete_node',
  'delete_edge',
  'set_condition',
  'set_effects',
  'set_node_body',
  'set_node_choices',
  'set_node_media',
])

export const CONTENT_PASS_MAX_OPS = 14
export const GRAPH_PASS_MAX_OPS = 18

function summarizePreset(presetId: string) {
  const archetypePreset = archetypePresetMap.get(presetId)
  if (archetypePreset) {
    return {
      id: presetId,
      kind: 'archetype',
      appliesToKind: archetypePreset.archetype.appliesToKind,
      name: archetypePreset.archetype.name,
      summary: archetypePreset.archetype.summary,
      tags: archetypePreset.tags,
    }
  }

  const definitionPreset = definitionPresetMap.get(presetId)
  if (definitionPreset) {
    return {
      id: presetId,
      kind: 'definition',
      appliesToKind: definitionPreset.definition.kind,
      name: definitionPreset.definition.name,
      summary: definitionPreset.definition.summary,
      tags: definitionPreset.tags,
    }
  }

  const graphPreset = graphPresetMap.get(presetId)
  if (graphPreset) {
    return {
      id: presetId,
      kind: 'graph',
      appliesToKind: 'graph',
      name: graphPreset.id,
      summary: graphPreset.tags.join(', '),
      tags: graphPreset.tags,
    }
  }

  const packPreset = packPresetMap.get(presetId)
  if (packPreset) {
    return {
      id: presetId,
      kind: 'pack',
      appliesToKind: 'pack',
      name: packPreset.id,
      summary: `Pack with ${packPreset.archetypePresetIds.length} archetype presets, ${packPreset.definitionPresetIds.length} definition presets, and ${packPreset.graphPresetIds.length} graph presets.`,
      tags: packPreset.tags,
    }
  }

  return null
}

function buildPresetSummaries(selectedPresetIds: string[] = [], allowedPresetIds: string[] = []) {
  const ids = [...new Set([...selectedPresetIds, ...allowedPresetIds])]
  const sourceIds =
    ids.length > 0
      ? ids
      : [
          ...presetCatalog.packs.map((preset) => preset.id),
          ...presetCatalog.archetypes.map((preset) => preset.id),
          ...presetCatalog.definitions.map((preset) => preset.id),
          ...presetCatalog.graphs.map((preset) => preset.id),
        ]

  return sourceIds
    .map((presetId) => summarizePreset(presetId))
    .filter((preset): preset is NonNullable<ReturnType<typeof summarizePreset>> => preset !== null)
    .slice(0, 40)
}

export function buildPromptContext(payload: Record<string, any>) {
  const definitionsByKind: Record<string, string[]> = {}

  for (const definition of payload.snapshot.definitions ?? []) {
    if (!definition?.key || !definition?.kind) continue
    definitionsByKind[definition.kind] ??= []
    definitionsByKind[definition.kind].push(definition.key)
  }

  const selectedGraph =
    payload.context?.graphKey
      ? (payload.snapshot.graphs ?? []).find((graph: Record<string, any>) => graph.key === payload.context.graphKey) ?? null
      : null

  return {
    request: {
      prompt: payload.prompt,
      intent: payload.intent ?? null,
      phase: payload.phase ?? null,
      targetMode: payload.targetMode ?? 'auto',
      requestedGraphType: payload.graphType ?? null,
      selectedGraphKey: payload.context?.graphKey ?? null,
      selectedNodeKey: payload.context?.nodeKey ?? null,
      selectedEdgeKey: payload.context?.edgeKey ?? null,
      target: payload.context?.target ?? null,
      operationBudget: payload.operationBudget ?? null,
    },
    gameSpec: payload.gameSpec ?? payload.snapshot.gameSpec ?? null,
    presetCatalogVersion: presetCatalog.version,
    selectedPresetIds: payload.selectedPresetIds ?? [],
    allowedPresetIds: payload.allowedPresetIds ?? [],
    presetSummaries: buildPresetSummaries(payload.selectedPresetIds ?? [], payload.allowedPresetIds ?? []),
    project: {
      workspace: payload.snapshot.workspace,
      project: payload.snapshot.project,
      draft: payload.snapshot.draft,
    },
    selectedGraph: selectedGraph
      ? {
          key: selectedGraph.key,
          name: selectedGraph.name,
          graphType: selectedGraph.graphType,
          summary: selectedGraph.summary,
          entryNodeKey: selectedGraph.entryNodeKey,
          nodes: (selectedGraph.nodes ?? []).map((node: Record<string, any>) => ({
            key: node.key,
            type: node.type,
            templateKey: node.templateKey ?? null,
            title: node.title,
          })),
          edges: (selectedGraph.edges ?? []).map((edge: Record<string, any>) => ({
            key: edge.key,
            source: edge.source,
            target: edge.target,
            label: edge.label ?? null,
          })),
        }
      : null,
    graphKeys: (payload.snapshot.graphs ?? []).map((graph: Record<string, any>) => graph.key),
    definitionKeysByKind: definitionsByKind,
    archetypes: (payload.snapshot.archetypes ?? []).map((archetype: Record<string, any>) => ({
      key: archetype.key,
      name: archetype.name,
      appliesToKind: archetype.appliesToKind,
      fields: (archetype.fields ?? []).map((field: Record<string, any>) => ({ key: field.key, fieldType: field.fieldType })),
    })),
    assets: (payload.snapshot.assets ?? []).map((asset: Record<string, any>) => ({ key: asset.key, kind: asset.kind, name: asset.name })),
    nodeLibrary: templateCatalog,
  }
}

export function contentPassSystemPrompt() {
  return [
    'You generate GraphCore patch operations.',
    'Return JSON only.',
    'Use exactly: { "summary": string, "assistantNotes"?: string, "diagnostics": string[], "operations": object[] }.',
    'Do not wrap JSON in markdown fences.',
    'Prefer preset-based operations over raw create operations.',
    'Use set_game_spec only when the request changes or initializes the game data layer.',
    'Use apply_preset_pack to record selected packs.',
    'Use instantiate_archetype_preset and instantiate_definition_preset whenever a matching preset exists.',
    'Only create new archetypes or definitions from scratch when no preset fits.',
    'Do not create graphs, nodes, or edges in this pass.',
    `Allowed ops only: ${[...CONTENT_PASS_ALLOWED_OPS].join(', ')}.`,
    `Keep operations.length <= ${CONTENT_PASS_MAX_OPS}.`,
    'Currencies and progression tokens are still kind "item".',
    'Abilities are first-class definitions with kind "ability".',
    'Keep changes compact and prefer minimal overrides after preset instantiation.',
  ].join('\n')
}

export function graphPassSystemPrompt() {
  return [
    'You generate GraphCore graph patch operations.',
    'Return JSON only.',
    'Use exactly: { "summary": string, "assistantNotes"?: string, "diagnostics": string[], "operations": object[] }.',
    'Do not wrap JSON in markdown fences.',
    'Prefer instantiate_graph_preset when a preset already matches the requested structure.',
    'Do not create definitions, archetypes, or assets in this pass.',
    `Allowed ops only: ${[...GRAPH_PASS_ALLOWED_OPS].join(', ')}.`,
    `Keep operations.length <= ${GRAPH_PASS_MAX_OPS}.`,
    'If targetMode is new_graph, create at most one graph unless the prompt explicitly asks for more.',
    'Creating a graph auto-scaffolds start and end nodes.',
    'Use existing node templates only.',
    'Keep body text short and structural, not atmospheric.',
    'Prefer fewer, valid nodes and edges over oversized graphs.',
  ].join('\n')
}

export function augmentSnapshotForPrompting(snapshot: Record<string, any>, operations: Array<Record<string, any>>) {
  const nextSnapshot = {
    ...snapshot,
    draft: {
      ...(snapshot.draft ?? {}),
      metadata: { ...((snapshot.draft?.metadata as Record<string, unknown> | undefined) ?? {}) },
    },
    gameSpec: snapshot.gameSpec ?? null,
    archetypes: [...(snapshot.archetypes ?? [])],
    definitions: [...(snapshot.definitions ?? [])],
    graphs: [...(snapshot.graphs ?? [])],
  }

  for (const operation of operations) {
    if (!operation || typeof operation.op !== 'string') continue

    if (operation.op === 'set_game_spec') {
      nextSnapshot.gameSpec = operation.gameSpec
      nextSnapshot.draft.metadata = { ...nextSnapshot.draft.metadata, gameSpec: operation.gameSpec }
      continue
    }

    if (operation.op === 'instantiate_archetype_preset' && typeof operation.presetId === 'string') {
      const preset = archetypePresetMap.get(operation.presetId)
      if (!preset || nextSnapshot.archetypes.some((archetype: Record<string, any>) => archetype.key === preset.archetype.key)) {
        continue
      }
      nextSnapshot.archetypes.push({
        id: `archetype-${preset.id}`,
        ...preset.archetype,
      })
      continue
    }

    if (operation.op === 'instantiate_definition_preset' && typeof operation.presetId === 'string') {
      const preset = definitionPresetMap.get(operation.presetId)
      const key = typeof operation.keyOverride === 'string' ? operation.keyOverride : preset?.definition.key
      if (!preset || !key || nextSnapshot.definitions.some((definition: Record<string, any>) => definition.key === key)) {
        continue
      }
      nextSnapshot.definitions.push({
        id: `definition-${key}`,
        ...preset.definition,
        key,
        name: typeof operation.nameOverride === 'string' ? operation.nameOverride : preset.definition.name,
      })
      continue
    }

    if (operation.op === 'instantiate_graph_preset' && typeof operation.presetId === 'string') {
      const preset = graphPresetMap.get(operation.presetId)
      const key = typeof operation.keyOverride === 'string' ? operation.keyOverride : preset?.id
      if (!preset || !key || nextSnapshot.graphs.some((graph: Record<string, any>) => graph.key === key)) {
        continue
      }
      nextSnapshot.graphs.push(
        preset.build({
          keyOverride: key,
          nameOverride: typeof operation.nameOverride === 'string' ? operation.nameOverride : undefined,
        }),
      )
      continue
    }

    if (operation.op === 'create_archetype' && typeof operation.key === 'string' && !nextSnapshot.archetypes.some((archetype: Record<string, any>) => archetype.key === operation.key)) {
      nextSnapshot.archetypes.push({
        id: `archetype-${operation.key}`,
        key: operation.key,
        name: operation.payload?.name ?? operation.key,
        summary: operation.payload?.summary ?? '',
        appliesToKind: operation.payload?.appliesToKind ?? 'item',
        iconAssetKey: operation.payload?.iconAssetKey ?? null,
        metadata: operation.payload?.metadata ?? {},
        llmHints: operation.payload?.llmHints ?? {},
        fields: Array.isArray(operation.payload?.fields) ? operation.payload.fields : [],
      })
      continue
    }

    if (operation.op === 'add_archetype_field' && typeof operation.key === 'string' && operation.field) {
      nextSnapshot.archetypes = nextSnapshot.archetypes.map((archetype: Record<string, any>) =>
        archetype.key === operation.key
          ? {
              ...archetype,
              fields: [...(archetype.fields ?? []).filter((field: Record<string, any>) => field.key !== operation.field.key), operation.field],
            }
          : archetype,
      )
      continue
    }

    if (operation.op === 'create_definition' && typeof operation.key === 'string' && !nextSnapshot.definitions.some((definition: Record<string, any>) => definition.key === operation.key)) {
      nextSnapshot.definitions.push({
        id: `definition-${operation.key}`,
        key: operation.key,
        kind: operation.kind ?? 'item',
        name: operation.payload?.name ?? operation.key,
        summary: operation.payload?.summary ?? '',
        status: operation.payload?.status ?? 'draft',
        iconAssetKey: operation.payload?.iconAssetKey ?? null,
        archetypeKey: operation.payload?.archetypeKey ?? null,
        tags: operation.payload?.tags ?? [],
        schemaVersion: 1,
        metadata: operation.payload?.metadata ?? {},
        llmHints: operation.payload?.llmHints ?? {},
        assetRefs: operation.payload?.assetRefs ?? [],
        definitionData: operation.payload?.definitionData ?? {},
        fieldValues: operation.payload?.fieldValues ?? [],
        customFields: operation.payload?.customFields ?? [],
        components: operation.payload?.components ?? [],
      })
      continue
    }

    if (operation.op === 'set_archetype' && typeof operation.key === 'string') {
      nextSnapshot.definitions = nextSnapshot.definitions.map((definition: Record<string, any>) =>
        definition.key === operation.key ? { ...definition, archetypeKey: operation.archetypeKey ?? null } : definition,
      )
      continue
    }

    if (operation.op === 'set_field_value' && typeof operation.key === 'string' && typeof operation.fieldKey === 'string') {
      nextSnapshot.definitions = nextSnapshot.definitions.map((definition: Record<string, any>) =>
        definition.key === operation.key
          ? {
              ...definition,
              fieldValues: [
                ...((definition.fieldValues ?? []).filter((fieldValue: Record<string, any>) => fieldValue.fieldKey !== operation.fieldKey)),
                { fieldKey: operation.fieldKey, value: operation.value ?? null },
              ],
            }
          : definition,
      )
    }
  }

  return nextSnapshot
}

export function validatePassOperations(
  snapshot: Record<string, any>,
  operations: Array<Record<string, any>>,
  allowedOps: Set<string>,
  maxOperations: number,
  requestedGraphType?: string,
) {
  const diagnostics: string[] = []

  if (operations.length > maxOperations) {
    diagnostics.push(`The proposal exceeded the ${maxOperations}-operation limit for this pass.`)
  }

  const disallowedOps = operations
    .map((operation) => operation?.op)
    .filter((op) => typeof op === 'string' && !allowedOps.has(op))

  if (disallowedOps.length > 0) {
    diagnostics.push(`The proposal used disallowed ops for this pass: ${[...new Set(disallowedOps)].join(', ')}.`)
  }

  if (diagnostics.length > 0) {
    return {
      operations: [] as Array<Record<string, any>>,
      diagnostics,
    }
  }

  return validateOperations(snapshot, operations, requestedGraphType)
}

function normalizeFieldType(input: unknown) {
  if (typeof input !== 'string') return 'text'
  return fieldTypeMap[input.toLowerCase()] ?? 'text'
}

function graphSuffix(graphKey: string) {
  return graphKey.replace(/^graph\./, '').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'generated'
}

function inferNodeTypeFromTemplate(templateKey: string | null, fallbackType: unknown) {
  if (templateKey && templateMap.has(templateKey)) {
    return templateMap.get(templateKey)?.type ?? 'text'
  }
  return typeof fallbackType === 'string' ? fallbackType : 'text'
}

function normalizeFieldDefinition(raw: Record<string, any>, index: number) {
  return {
    id: typeof raw.id === 'string' ? raw.id : `field-generated-${Date.now()}-${index}`,
    key: typeof raw.key === 'string' ? raw.key : typeof raw.fieldKey === 'string' ? raw.fieldKey : `field_${index + 1}`,
    label:
      typeof raw.label === 'string'
        ? raw.label
        : typeof raw.key === 'string'
          ? raw.key
          : typeof raw.fieldKey === 'string'
            ? raw.fieldKey
            : `Field ${index + 1}`,
    fieldType: normalizeFieldType(raw.fieldType),
    description: typeof raw.description === 'string' ? raw.description : '',
    required: typeof raw.required === 'boolean' ? raw.required : false,
    defaultValue: raw.defaultValue ?? null,
    constraints: typeof raw.constraints === 'object' && raw.constraints !== null ? raw.constraints : {},
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : index,
  }
}

function normalizeCreateGraphOperation(operation: Record<string, any>) {
  const keySeed = typeof operation.key === 'string' ? operation.key : 'graph.generated'
  const key = keySeed.startsWith('graph.') ? keySeed : `graph.${graphSuffix(keySeed)}`
  const payload = typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}
  return {
    op: 'create_graph',
    key,
    payload: {
      name:
        typeof payload.name === 'string'
          ? payload.name
          : typeof operation.title === 'string'
            ? operation.title
            : typeof operation.name === 'string'
              ? operation.name
              : key,
      graphType:
        typeof payload.graphType === 'string'
          ? payload.graphType
          : typeof operation.graphType === 'string'
            ? operation.graphType
            : 'narrative_flow',
      summary:
        typeof payload.summary === 'string'
          ? payload.summary
          : typeof operation.summary === 'string'
            ? operation.summary
            : '',
      metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {},
      llmHints: typeof payload.llmHints === 'object' && payload.llmHints !== null ? payload.llmHints : {},
    },
  }
}

function normalizeCreateArchetypeOperation(operation: Record<string, any>) {
  const payload = typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}
  return {
    op: 'create_archetype',
    key: typeof operation.key === 'string' ? operation.key : typeof operation.archetypeKey === 'string' ? operation.archetypeKey : 'item.generated',
    payload: {
      name: typeof payload.name === 'string' ? payload.name : typeof operation.name === 'string' ? operation.name : 'Generated Archetype',
      summary: typeof payload.summary === 'string' ? payload.summary : typeof operation.summary === 'string' ? operation.summary : '',
      appliesToKind:
        typeof payload.appliesToKind === 'string'
          ? payload.appliesToKind
          : typeof operation.kind === 'string'
            ? operation.kind
            : 'item',
      iconAssetKey: payload.iconAssetKey ?? null,
      metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {},
      llmHints: typeof payload.llmHints === 'object' && payload.llmHints !== null ? payload.llmHints : {},
      fields: Array.isArray(payload.fields) ? payload.fields : [],
    },
  }
}

function normalizeCreateDefinitionOperation(operation: Record<string, any>) {
  const payload = typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}
  const kind = operation.kind === 'token' ? 'item' : operation.kind
  return {
    op: 'create_definition',
    kind: typeof kind === 'string' ? kind : 'item',
    key:
      typeof operation.key === 'string'
        ? operation.key
        : typeof operation.definitionKey === 'string'
          ? operation.definitionKey
          : 'item.generated',
    payload: {
      name: typeof payload.name === 'string' ? payload.name : typeof operation.name === 'string' ? operation.name : undefined,
      summary: typeof payload.summary === 'string' ? payload.summary : typeof operation.summary === 'string' ? operation.summary : '',
      status: typeof payload.status === 'string' ? payload.status : 'draft',
      iconAssetKey: payload.iconAssetKey ?? null,
      archetypeKey:
        typeof payload.archetypeKey === 'string'
          ? payload.archetypeKey
          : typeof operation.archetypeKey === 'string'
            ? operation.archetypeKey
            : null,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {},
      llmHints: typeof payload.llmHints === 'object' && payload.llmHints !== null ? payload.llmHints : {},
      fieldValues: Array.isArray(payload.fieldValues) ? payload.fieldValues : [],
      customFields: Array.isArray(payload.customFields) ? payload.customFields : [],
      assetRefs: Array.isArray(payload.assetRefs) ? payload.assetRefs : [],
      definitionData: typeof payload.definitionData === 'object' && payload.definitionData !== null ? payload.definitionData : {},
      components: Array.isArray(payload.components) ? payload.components : [],
    },
  }
}

function normalizeCreateNodeOperation(operation: Record<string, any>, index: number) {
  const graphKeySeed = typeof operation.graphKey === 'string' ? operation.graphKey : 'graph.generated'
  const graphKey = graphKeySeed.startsWith('graph.') ? graphKeySeed : `graph.${graphSuffix(graphKeySeed)}`
  const node = typeof operation.node === 'object' && operation.node !== null ? operation.node : operation
  const templateKey = typeof node.templateKey === 'string' ? node.templateKey : null
  const inferredType = inferNodeTypeFromTemplate(templateKey, node.type)
  const nodeKey =
    typeof node.key === 'string'
      ? node.key
      : typeof operation.key === 'string'
        ? operation.key
        : `${graphSuffix(graphKey)}.node_${index + 1}`

  return {
    op: 'create_node',
    graphKey,
    node: {
      id: typeof node.id === 'string' ? node.id : `node-generated-${Date.now()}-${index}`,
      key: nodeKey,
      type: inferredType,
      title:
        typeof node.title === 'string'
          ? node.title
          : typeof operation.title === 'string'
            ? operation.title
            : nodeKey,
      templateKey,
      subtitle: typeof node.subtitle === 'string' ? node.subtitle : null,
      position: {
        x: typeof node.position?.x === 'number' ? node.position.x : 360,
        y: typeof node.position?.y === 'number' ? node.position.y : 180 + index * 60,
      },
      body: {
        text: typeof node.body?.text === 'string' ? node.body.text : typeof operation.text === 'string' ? operation.text : null,
        imageAssetKey: typeof node.body?.imageAssetKey === 'string' ? node.body.imageAssetKey : null,
        audioAssetKey: typeof node.body?.audioAssetKey === 'string' ? node.body.audioAssetKey : null,
        choices: Array.isArray(node.body?.choices) ? node.body.choices : [],
      },
      condition: node.condition ?? null,
      effects: Array.isArray(node.effects) ? node.effects : [],
      ports: Array.isArray(node.ports) ? node.ports : inferPorts({ type: inferredType, body: { choices: Array.isArray(node.body?.choices) ? node.body.choices : [] } }),
      display: typeof node.display === 'object' && node.display !== null ? node.display : { iconAssetKey: null, compactPreview: false },
      metadata: typeof node.metadata === 'object' && node.metadata !== null ? node.metadata : {},
    },
  }
}

function normalizeConnectEdgeOperation(operation: Record<string, any>, index: number) {
  const graphKeySeed = typeof operation.graphKey === 'string' ? operation.graphKey : 'graph.generated'
  const graphKey = graphKeySeed.startsWith('graph.') ? graphKeySeed : `graph.${graphSuffix(graphKeySeed)}`
  const edge = typeof operation.edge === 'object' && operation.edge !== null ? operation.edge : operation
  return {
    op: 'connect_edge',
    graphKey,
    edge: {
      id: typeof edge.id === 'string' ? edge.id : `edge-generated-${Date.now()}-${index}`,
      key: typeof edge.key === 'string' ? edge.key : `edge.generated_${index + 1}`,
      source: {
        nodeKey: typeof edge.source?.nodeKey === 'string' ? edge.source.nodeKey : typeof operation.sourceNodeKey === 'string' ? operation.sourceNodeKey : '',
        portId: typeof edge.source?.portId === 'string' ? edge.source.portId : typeof operation.sourcePort === 'string' ? operation.sourcePort : null,
      },
      target: {
        nodeKey: typeof edge.target?.nodeKey === 'string' ? edge.target.nodeKey : typeof operation.targetNodeKey === 'string' ? operation.targetNodeKey : '',
        portId: typeof edge.target?.portId === 'string' ? edge.target.portId : typeof operation.targetPort === 'string' ? operation.targetPort : null,
      },
      label: typeof edge.label === 'string' ? edge.label : null,
      condition: edge.condition ?? null,
      metadata: typeof edge.metadata === 'object' && edge.metadata !== null ? edge.metadata : {},
    },
  }
}

export function repairOperations(rawOperations: Array<Record<string, any>>) {
  return rawOperations.map((operation, index) => {
    if (!operation || typeof operation.op !== 'string') return operation

    switch (operation.op) {
      case 'create_archetype':
        return normalizeCreateArchetypeOperation(operation)
      case 'add_archetype_field':
        return {
          op: 'add_archetype_field',
          key: typeof operation.key === 'string' ? operation.key : typeof operation.archetypeKey === 'string' ? operation.archetypeKey : 'item.generated',
          field: normalizeFieldDefinition(typeof operation.field === 'object' && operation.field !== null ? operation.field : operation, index),
        }
      case 'create_definition':
        return normalizeCreateDefinitionOperation(operation)
      case 'set_archetype':
        return {
          op: 'set_archetype',
          key: typeof operation.key === 'string' ? operation.key : typeof operation.definitionKey === 'string' ? operation.definitionKey : 'item.generated',
          archetypeKey: typeof operation.archetypeKey === 'string' ? operation.archetypeKey : null,
        }
      case 'set_field_value':
        return {
          op: 'set_field_value',
          key: typeof operation.key === 'string' ? operation.key : typeof operation.definitionKey === 'string' ? operation.definitionKey : 'item.generated',
          fieldKey: typeof operation.fieldKey === 'string' ? operation.fieldKey : typeof operation.key === 'string' ? operation.key : 'value',
          value: operation.value ?? null,
        }
      case 'create_graph':
        return normalizeCreateGraphOperation(operation)
      case 'create_node':
        return normalizeCreateNodeOperation(operation, index)
      case 'connect_edge':
        return normalizeConnectEdgeOperation(operation, index)
      default:
        return operation
    }
  })
}

function inferPorts(node: Record<string, any>) {
  const nodeType = typeof node.type === 'string' ? node.type : 'text'
  const choices = Array.isArray(node.body?.choices) ? node.body.choices : []
  const inputs = nodeType === 'start' ? [] : [{ id: 'in', label: 'In', direction: 'input' }]
  if (nodeType === 'start') return [{ id: 'out', label: 'Out', direction: 'output' }]
  if (nodeType === 'end') return inputs
  if (nodeType === 'condition') return [...inputs, { id: 'true', label: 'True', direction: 'output' }, { id: 'false', label: 'False', direction: 'output' }]
  if (nodeType === 'choice') return [...inputs, ...(choices.length > 0 ? choices.map((choice: Record<string, any>, index: number) => ({ id: choice.id ?? `choice_${index + 1}`, label: choice.label ?? `Choice ${index + 1}`, direction: 'output' })) : [{ id: 'out', label: 'Out', direction: 'output' }])]
  if (nodeType === 'branch') return [...inputs, { id: 'branch_a', label: 'Branch A', direction: 'output' }, { id: 'branch_b', label: 'Branch B', direction: 'output' }]
  if (nodeType === 'random') return [...inputs, { id: 'success', label: 'Success', direction: 'output' }, { id: 'fail', label: 'Fail', direction: 'output' }]
  return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
}

function normalizeNode(operation: Record<string, any>, index: number) {
  const node = typeof operation.node === 'object' && operation.node !== null ? operation.node : {}
  const template = typeof node.templateKey === 'string' ? templateMap.get(node.templateKey) ?? null : null
  return {
    ...operation,
    node: {
      id: typeof node.id === 'string' ? node.id : `node-generated-${Date.now()}-${index}`,
      key: typeof node.key === 'string' ? node.key : `generated.node_${index + 1}`,
      type: typeof node.type === 'string' ? node.type : template?.type ?? 'text',
      title: typeof node.title === 'string' ? node.title : `Generated Node ${index + 1}`,
      templateKey: typeof node.templateKey === 'string' ? node.templateKey : null,
      subtitle: typeof node.subtitle === 'string' ? node.subtitle : null,
      position: { x: typeof node.position?.x === 'number' ? node.position.x : 360, y: typeof node.position?.y === 'number' ? node.position.y : 220 + index * 40 },
      body: { text: typeof node.body?.text === 'string' ? node.body.text : null, imageAssetKey: typeof node.body?.imageAssetKey === 'string' ? node.body.imageAssetKey : null, audioAssetKey: typeof node.body?.audioAssetKey === 'string' ? node.body.audioAssetKey : null, choices: Array.isArray(node.body?.choices) ? node.body.choices : [] },
      condition: node.condition ?? null,
      effects: Array.isArray(node.effects) ? node.effects : [],
      ports: Array.isArray(node.ports) ? node.ports : inferPorts(node),
      display: typeof node.display === 'object' && node.display !== null ? node.display : { iconAssetKey: null, compactPreview: false },
      metadata: typeof node.metadata === 'object' && node.metadata !== null ? node.metadata : {},
    },
  }
}

function graphNodeKeys(snapshot: Record<string, any>) {
  return new Map((snapshot.graphs ?? []).map((graph: Record<string, any>) => [graph.key, new Set((graph.nodes ?? []).map((node: Record<string, any>) => node.key).filter(Boolean))]))
}

function definitionKeys(snapshot: Record<string, any>) {
  const grouped: Record<string, Set<string>> = {}
  for (const definition of snapshot.definitions ?? []) {
    grouped[definition.kind] ??= new Set<string>()
    grouped[definition.kind].add(definition.key)
  }
  return grouped
}

function materializedArchetypeKey(presetId: string) {
  return archetypePresetMap.get(presetId)?.archetype.key ?? null
}

function materializedDefinitionKey(operation: Record<string, any>) {
  if (typeof operation.keyOverride === 'string') return operation.keyOverride
  return definitionPresetMap.get(String(operation.presetId ?? ''))?.definition.key ?? null
}

function materializedGraphKey(operation: Record<string, any>) {
  if (typeof operation.keyOverride === 'string') return operation.keyOverride
  return graphPresetMap.get(String(operation.presetId ?? ''))?.id ?? null
}

export function validateOperations(snapshot: Record<string, any>, operations: Array<Record<string, any>>, requestedGraphType?: string) {
  const diagnostics: string[] = []
  const normalized: Array<Record<string, any>> = []
  const graphs = new Set((snapshot.graphs ?? []).map((graph: Record<string, any>) => graph.key).filter(Boolean))
  const graphTypes = new Map((snapshot.graphs ?? []).map((graph: Record<string, any>) => [graph.key, graph.graphType]))
  const nodeKeysByGraph = graphNodeKeys(snapshot)
  const defs = definitionKeys(snapshot)
  const createdDefs: Record<string, Set<string>> = {}
  const archetypes = new Set((snapshot.archetypes ?? []).map((archetype: Record<string, any>) => archetype.key).filter(Boolean))
  const createdArchetypes = new Set<string>()
  const archetypeFieldKeys = new Map<string, Set<string>>(
    (snapshot.archetypes ?? []).map((archetype: Record<string, any>) => [
      archetype.key,
      new Set((archetype.fields ?? []).map((field: Record<string, any>) => field.key).filter(Boolean)),
    ]),
  )
  const assets = new Set((snapshot.assets ?? []).map((asset: Record<string, any>) => asset.key).filter(Boolean))
  const hasDef = (kind: string, key: string) => defs[kind]?.has(key) || createdDefs[kind]?.has(key)

  for (const [index, raw] of operations.entries()) {
    if (!raw || typeof raw.op !== 'string') {
      diagnostics.push(`Operation ${index + 1} is missing an op field.`)
      continue
    }

    const op = raw.op === 'create_node' ? normalizeNode(raw, index) : raw

    if (op.op === 'set_game_spec') {
      if (!op.gameSpec || typeof op.gameSpec !== 'object') diagnostics.push('set_game_spec is missing a gameSpec payload.')
      else normalized.push(op)
      continue
    }

    if (op.op === 'apply_preset_pack') {
      if (!packPresetMap.has(String(op.packId ?? ''))) diagnostics.push(`Unknown preset pack "${String(op.packId ?? '')}".`)
      else normalized.push(op)
      continue
    }

    if (op.op === 'instantiate_archetype_preset') {
      const archetypeKey = materializedArchetypeKey(String(op.presetId ?? ''))
      if (!archetypeKey) diagnostics.push(`Unknown archetype preset "${String(op.presetId ?? '')}".`)
      else if (archetypes.has(archetypeKey) || createdArchetypes.has(archetypeKey)) continue
      else {
        createdArchetypes.add(archetypeKey)
        archetypeFieldKeys.set(archetypeKey, new Set())
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'instantiate_definition_preset') {
      const preset = definitionPresetMap.get(String(op.presetId ?? ''))
      const key = materializedDefinitionKey(op)
      if (!preset || !key) diagnostics.push(`Unknown definition preset "${String(op.presetId ?? '')}".`)
      else if (hasDef(preset.definition.kind, key)) continue
      else {
        createdDefs[preset.definition.kind] ??= new Set<string>()
        createdDefs[preset.definition.kind].add(key)
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'instantiate_graph_preset') {
      const key = materializedGraphKey(op)
      if (!graphPresetMap.has(String(op.presetId ?? '')) || !key) diagnostics.push(`Unknown graph preset "${String(op.presetId ?? '')}".`)
      else if (graphs.has(key)) continue
      else {
        graphs.add(key)
        graphTypes.set(key, requestedGraphType ?? 'narrative_flow')
        nodeKeysByGraph.set(key, new Set())
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'create_graph') {
      if (!op.key || graphs.has(op.key)) diagnostics.push(`Graph key "${String(op.key)}" is invalid or already exists.`)
      else {
        const suffix = String(op.key).replace(/^graph\./, '').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'generated'
        graphs.add(op.key)
        graphTypes.set(op.key, op.payload?.graphType ?? requestedGraphType ?? 'narrative_flow')
        nodeKeysByGraph.set(op.key, new Set([`start.${suffix}`, `end.${suffix}`]))
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'create_node') {
      const graphKey = String(op.graphKey ?? '')
      const nodeKey = String(op.node?.key ?? '')
      const templateKey = typeof op.node?.templateKey === 'string' ? op.node.templateKey : null
      const template = templateKey ? templateMap.get(templateKey) ?? null : null
      if (!graphs.has(graphKey)) diagnostics.push(`Unknown graph "${graphKey}" for create_node.`)
      else if (!nodeKey) diagnostics.push('create_node is missing node.key.')
      else if ((nodeKeysByGraph.get(graphKey) ?? new Set()).has(nodeKey)) diagnostics.push(`Node "${nodeKey}" already exists in "${graphKey}".`)
      else if (template && !template.graphs.includes(graphTypes.get(graphKey) ?? 'narrative_flow')) diagnostics.push(`Template "${templateKey}" is incompatible with graph "${graphKey}".`)
      else {
        const nodeKeys = nodeKeysByGraph.get(graphKey) ?? new Set<string>()
        nodeKeys.add(nodeKey)
        nodeKeysByGraph.set(graphKey, nodeKeys)
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'connect_edge') {
      const graphKey = String(op.graphKey ?? '')
      const source = String(op.edge?.source?.nodeKey ?? '')
      const target = String(op.edge?.target?.nodeKey ?? '')
      const nodeKeys = nodeKeysByGraph.get(graphKey) ?? new Set<string>()
      if (!graphs.has(graphKey) || !nodeKeys.has(source) || !nodeKeys.has(target)) diagnostics.push(`connect_edge references missing nodes in "${graphKey}".`)
      else normalized.push(op)
      continue
    }

    if (['set_condition', 'set_effects', 'set_node_body', 'set_node_choices', 'set_node_media', 'update_node', 'update_node_template', 'move_node', 'delete_node'].includes(op.op)) {
      const graphKey = String(op.graphKey ?? '')
      const nodeKey = String(op.nodeKey ?? '')
      if (!graphs.has(graphKey) || !(nodeKeysByGraph.get(graphKey) ?? new Set()).has(nodeKey)) diagnostics.push(`${op.op} references missing node "${nodeKey}" in "${graphKey}".`)
      else if (op.op === 'update_node_template' && (!op.templateKey || !templateMap.has(op.templateKey))) diagnostics.push(`Unknown template "${String(op.templateKey)}".`)
      else normalized.push(op)
      continue
    }

    if (op.op === 'create_definition') {
      const kind = String(op.kind ?? '')
      const key = String(op.key ?? '')
      if (!kind || !key) diagnostics.push(`Definition "${key}" is invalid.`)
      else if (hasDef(kind, key)) continue
      else {
        createdDefs[kind] ??= new Set<string>()
        createdDefs[kind].add(key)
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'create_archetype') {
      const key = String(op.key ?? '')
      if (!key) diagnostics.push(`Archetype "${key}" is invalid.`)
      else if (archetypes.has(key) || createdArchetypes.has(key)) continue
      else {
        createdArchetypes.add(key)
        if (!archetypeFieldKeys.has(key)) archetypeFieldKeys.set(key, new Set())
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'add_archetype_field') {
      if (!op.key || (!archetypes.has(op.key) && !createdArchetypes.has(op.key))) diagnostics.push(`Unknown archetype "${String(op.key)}".`)
      else {
        const fieldKeys = archetypeFieldKeys.get(op.key) ?? new Set<string>()
        if (typeof op.field?.key === 'string') {
          if (fieldKeys.has(op.field.key)) continue
          fieldKeys.add(op.field.key)
          archetypeFieldKeys.set(op.key, fieldKeys)
        }
        normalized.push(op)
      }
      continue
    }

    if (op.op === 'set_archetype') {
      if (op.archetypeKey !== null && typeof op.archetypeKey === 'string' && !archetypes.has(op.archetypeKey) && !createdArchetypes.has(op.archetypeKey)) diagnostics.push(`Unknown archetype "${op.archetypeKey}".`)
      else normalized.push(op)
      continue
    }

    if (op.op === 'set_icon_asset') {
      if (op.iconAssetKey !== null && typeof op.iconAssetKey === 'string' && !assets.has(op.iconAssetKey)) diagnostics.push(`Unknown asset "${op.iconAssetKey}".`)
      else normalized.push(op)
      continue
    }

    if (['update_definition', 'set_field_value', 'attach_asset', 'update_graph', 'duplicate_graph', 'delete_graph', 'update_edge', 'delete_edge', 'update_archetype_field', 'remove_archetype_field', 'add_custom_field', 'remove_custom_field'].includes(op.op)) {
      normalized.push(op)
      continue
    }

    diagnostics.push(`Unsupported patch op "${op.op}".`)
  }

  return { operations: diagnostics.length === 0 ? normalized : [], diagnostics }
}
