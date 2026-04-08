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

export function systemPrompt() {
  return [
    'You generate GraphCore patch operations.',
    'Return JSON only.',
    'Use exactly: { "summary": string, "assistantNotes"?: string, "diagnostics": string[], "operations": object[] }.',
    'Supported graph ops: create_graph, update_graph, duplicate_graph, create_node, update_node, update_node_template, move_node, connect_edge, update_edge, delete_node, delete_edge, set_condition, set_effects, set_node_body, set_node_choices, set_node_media.',
    'Supported content ops: create_definition, update_definition, set_archetype, set_field_value, create_archetype, add_archetype_field, set_icon_asset, attach_asset.',
    'Prefer existing project keys. If content is missing, create it earlier in the same operations array.',
    'Use existing node templates. Do not invent new op names.',
    'Creating a graph auto-scaffolds start/end nodes. For graph.bridge_intro, the scaffold keys are start.bridge_intro and end.bridge_intro.',
  ].join('\n')
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
      if (!kind || !key || hasDef(kind, key)) diagnostics.push(`Definition "${key}" already exists or is invalid.`)
      else {
        createdDefs[kind] ??= new Set<string>()
        createdDefs[kind].add(key)
        normalized.push(op)
      }
      continue
    }
    if (op.op === 'create_archetype') {
      const key = String(op.key ?? '')
      if (!key || archetypes.has(key) || createdArchetypes.has(key)) diagnostics.push(`Archetype "${key}" already exists or is invalid.`)
      else {
        createdArchetypes.add(key)
        normalized.push(op)
      }
      continue
    }
    if (op.op === 'add_archetype_field') {
      if (!op.key || (!archetypes.has(op.key) && !createdArchetypes.has(op.key))) diagnostics.push(`Unknown archetype "${String(op.key)}".`)
      else normalized.push(op)
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
