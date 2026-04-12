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
  'create_definition',
  'update_definition',
  'set_archetype',
  'set_field_value',
  'create_archetype',
  'add_archetype_field',
  'set_icon_asset',
  'attach_asset',
])

export const GRAPH_PASS_ALLOWED_OPS = new Set([
  'create_graph',
  'update_graph',
  'duplicate_graph',
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

export const CONTENT_PASS_MAX_OPS = 12
export const GRAPH_PASS_MAX_OPS = 18

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
      targetMode: payload.targetMode ?? 'auto',
      requestedGraphType: payload.graphType ?? null,
      selectedGraphKey: payload.context?.graphKey ?? null,
      selectedNodeKey: payload.context?.nodeKey ?? null,
      selectedEdgeKey: payload.context?.edgeKey ?? null,
      target: payload.context?.target ?? null,
    },
    project: {
      workspace: payload.snapshot.workspace,
      project: payload.snapshot.project,
    },
    creativeDirection: {
      projectName: payload.snapshot.project?.name ?? '',
      projectSummary: payload.snapshot.project?.summary ?? '',
      artStylePreset: payload.snapshot.gameSpec?.theme?.artStylePreset ?? null,
      artStyleDescription: payload.snapshot.gameSpec?.theme?.artStyleDescription ?? '',
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
    'You generate GraphCore patch operations for GraphCore.',
    'Return JSON only.',
    'Use exactly: { "summary": string, "assistantNotes"?: string, "diagnostics": string[], "operations": object[] }.',
    'Do not wrap JSON in markdown fences.',
    'Use the shortest valid JSON possible.',
    'Keep summary under 16 words.',
    'Omit assistantNotes unless essential.',
    'Use diagnostics only for real caveats. Prefer diagnostics: [].',
    'This is the content support pass only.',
    'Only create supporting content needed for the requested graph or content change.',
    'Do not create graphs, nodes, or edges in this pass.',
    `Allowed ops only: ${[...CONTENT_PASS_ALLOWED_OPS].join(', ')}.`,
    `Keep operations.length <= ${CONTENT_PASS_MAX_OPS}.`,
    'Prefer existing archetypes. If baseline item archetypes are present, reuse them instead of creating new archetypes.',
    'Only create an archetype if the supplied context truly lacks a suitable one.',
    'All content references use stable keys. Never use fields like definitionKey unless the op schema explicitly supports them.',
    'Compact content patch examples:',
    'Honor the project summary and creative direction when choosing names, summaries, and supporting content tone.',
    'create_archetype => {"op":"create_archetype","key":"item.progression_token","payload":{"name":"Progression Token","summary":"Hidden progression marker","appliesToKind":"item"}}',
    'add_archetype_field => {"op":"add_archetype_field","key":"item.progression_token","field":{"id":"field-token-hidden","key":"is_hidden","label":"Hidden","fieldType":"boolean","description":"Whether the token is hidden.","required":true,"defaultValue":true,"constraints":{},"sortOrder":1}}',
    'create_definition => {"op":"create_definition","kind":"item","key":"item.hooded_lantern","payload":{"name":"Hooded Lantern","summary":"A shuttered lantern.","status":"draft"}}',
    'set_archetype => {"op":"set_archetype","key":"item.hooded_lantern","archetypeKey":"item.utility"}',
    'set_field_value => {"op":"set_field_value","key":"item.hooded_lantern","fieldKey":"equip_slot","value":"hand"}',
    'Progression tokens are still kind "item", not a separate kind.',
    'If no supporting content is needed, return operations: [].',
    'Do not restate the user prompt or explain obvious choices.',
    'Prefer fewer correct operations over many speculative ones.',
  ].join('\n')
}

export function graphPassSystemPrompt() {
  return [
    'You generate GraphCore patch operations for GraphCore.',
    'Return JSON only.',
    'Use exactly: { "summary": string, "assistantNotes"?: string, "diagnostics": string[], "operations": object[] }.',
    'Do not wrap JSON in markdown fences.',
    'Use the shortest valid JSON possible.',
    'Keep summary under 16 words.',
    'Omit assistantNotes unless essential.',
    'Use diagnostics only for real caveats. Prefer diagnostics: [].',
    'This is the graph structure pass only.',
    'Do not create definitions, archetypes, or assets in this pass.',
    `Allowed ops only: ${[...GRAPH_PASS_ALLOWED_OPS].join(', ')}.`,
    `Keep operations.length <= ${GRAPH_PASS_MAX_OPS}.`,
    'If targetMode is new_graph, create exactly one graph unless the user explicitly asked for more.',
    'Creating a graph auto-scaffolds start/end nodes. For graph.bridge_intro, the scaffold keys are start.bridge_intro and end.bridge_intro.',
    'Prefer compact graph patches:',
    '1. create_graph',
    '2. create minimal nodes',
    '3. set_node_choices for choice branches',
    '4. set_condition for condition nodes',
    '5. set_effects for effect nodes',
    '6. connect_edge for flow',
    'Keep story/body text brief: one short sentence per narrative node.',
    'Do not include long atmospheric prose.',
    'Use existing node templates only.',
    'Never invent new op names or unsupported node templates.',
    'Compact graph patch examples:',
    'Honor the project summary and creative direction when choosing graph names, node titles, and narrative tone.',
    'create_graph => {"op":"create_graph","key":"graph.ashen_hollow_opening","payload":{"name":"Ashen Hollow Opening","graphType":"narrative_flow","summary":"Opening scene at the ruined gate in the rain."}}',
    'create_node => {"op":"create_node","graphKey":"graph.ashen_hollow_opening","node":{"key":"story.ruined_gate_intro","templateKey":"story_text","title":"Ruined Gate in the Rain","position":{"x":320,"y":160},"body":{"text":"Rain sheets across the broken gate."}}}',
    'create_choice_node => {"op":"create_node","graphKey":"graph.ashen_hollow_opening","node":{"key":"choice.ruined_gate","templateKey":"choice","title":"What do you do?","position":{"x":620,"y":160},"body":{"text":"The storm hides your movement."}}}',
    'set_node_choices => {"op":"set_node_choices","graphKey":"graph.ashen_hollow_opening","nodeKey":"choice.ruined_gate","choices":[{"id":"approach","label":"Approach the gate"},{"id":"search","label":"Search the wagon wreck"}]}',
    'set_condition => {"op":"set_condition","graphKey":"graph.ashen_hollow_opening","nodeKey":"check.has_lantern","condition":{"type":"hasItem","itemKey":"item.hooded_lantern","minQuantity":1}}',
    'set_effects => {"op":"set_effects","graphKey":"graph.ashen_hollow_opening","nodeKey":"effect.grant_lantern","effects":[{"type":"grantItem","itemKey":"item.hooded_lantern","quantity":1}]}',
    'connect_edge => {"op":"connect_edge","graphKey":"graph.ashen_hollow_opening","edge":{"key":"edge.start_to_intro","source":{"nodeKey":"start.ashen_hollow_opening","portId":"out"},"target":{"nodeKey":"story.ruined_gate_intro","portId":"in"}}}',
    'Prefer one create_node plus follow-up set_node_choices/set_condition/set_effects over a huge node object.',
    'Prefer one item grant effect per effect node unless multiple grants are absolutely necessary.',
    'Prefer three clear endings over many alternate micro-branches.',
    'Use content keys provided in context and prior content-support operations.',
    'Prefer fewer nodes and edges that fully satisfy the prompt over an oversized cinematic graph.',
  ].join('\n')
}

export function augmentSnapshotForPrompting(snapshot: Record<string, any>, operations: Array<Record<string, any>>) {
  const nextSnapshot = {
    ...snapshot,
    archetypes: [...(snapshot.archetypes ?? [])],
    definitions: [...(snapshot.definitions ?? [])],
  }

  for (const operation of operations) {
    if (!operation || typeof operation.op !== 'string') {
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
    if (!operation || typeof operation.op !== 'string') {
      return operation
    }

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
      else if (hasDef(kind, key)) {
        continue
      }
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
      else if (archetypes.has(key) || createdArchetypes.has(key)) {
        continue
      }
      else {
        createdArchetypes.add(key)
        if (!archetypeFieldKeys.has(key)) {
          archetypeFieldKeys.set(key, new Set())
        }
        normalized.push(op)
      }
      continue
    }
    if (op.op === 'add_archetype_field') {
      if (!op.key || (!archetypes.has(op.key) && !createdArchetypes.has(op.key))) diagnostics.push(`Unknown archetype "${String(op.key)}".`)
      else {
        const fieldKeys = archetypeFieldKeys.get(op.key) ?? new Set<string>()
        if (typeof op.field?.key === 'string') {
          if (fieldKeys.has(op.field.key)) {
            continue
          }
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
    if (['update_definition', 'set_field_value', 'attach_asset', 'update_graph', 'duplicate_graph', 'delete_graph', 'update_edge', 'delete_edge'].includes(op.op)) {
      normalized.push(op)
      continue
    }
    diagnostics.push(`Unsupported patch op "${op.op}".`)
  }

  return { operations: diagnostics.length === 0 ? normalized : [], diagnostics }
}
