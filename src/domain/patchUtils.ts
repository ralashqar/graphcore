import type {
  ArchetypeDefinition,
  DefinitionBase,
  EdgeDefinition,
  GraphCreateInput,
  PatchOperation,
  ProjectSnapshot,
} from './graphcore'
import { createGraphScaffold } from './graphScaffold'
import { applyTemplateToNode, normalizeNode } from './nodeLibrary'
import { materializeArchetypePreset, materializeDefinitionPreset, materializeGraphPreset } from './presetCatalog'

function createDefinitionFromPatch(operation: Extract<PatchOperation, { op: 'create_definition' }>): DefinitionBase {
  const payload = operation.payload ?? {}

  return {
    id: `definition-${operation.key}-${Date.now()}`,
    key: operation.key,
    kind: operation.kind,
    name: typeof payload.name === 'string' ? payload.name : operation.key,
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    status: payload.status ?? 'draft',
    iconAssetKey: payload.iconAssetKey ?? null,
    archetypeKey: payload.archetypeKey ?? null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    schemaVersion: typeof payload.schemaVersion === 'number' ? payload.schemaVersion : 1,
    metadata: payload.metadata ?? {},
    llmHints: payload.llmHints ?? {},
    assetRefs: Array.isArray(payload.assetRefs) ? payload.assetRefs : [],
    definitionData: payload.definitionData ?? {},
    fieldValues: Array.isArray(payload.fieldValues) ? payload.fieldValues : [],
    customFields: Array.isArray(payload.customFields) ? payload.customFields : [],
    components: Array.isArray(payload.components) ? payload.components : [],
  }
}

function createArchetypeFromPatch(operation: Extract<PatchOperation, { op: 'create_archetype' }>): ArchetypeDefinition {
  const payload = operation.payload ?? {}

  return {
    id: `archetype-${operation.key}-${Date.now()}`,
    key: operation.key,
    name: typeof payload.name === 'string' ? payload.name : operation.key,
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    appliesToKind: payload.appliesToKind ?? 'item',
    iconAssetKey: payload.iconAssetKey ?? null,
    metadata: payload.metadata ?? {},
    llmHints: payload.llmHints ?? {},
    fields: Array.isArray(payload.fields) ? payload.fields : [],
  }
}

function ensureFieldValue(definition: DefinitionBase, fieldKey: string, value: string | number | boolean | null) {
  const existingIndex = definition.fieldValues.findIndex((fieldValue) => fieldValue.fieldKey === fieldKey)

  if (existingIndex >= 0) {
    const nextFieldValues = [...definition.fieldValues]
    nextFieldValues[existingIndex] = { fieldKey, value }
    return { ...definition, fieldValues: nextFieldValues }
  }

  return {
    ...definition,
    fieldValues: [...definition.fieldValues, { fieldKey, value }],
  }
}

function initializeArchetypeFieldValues(definition: DefinitionBase, archetype: ArchetypeDefinition | null) {
  if (!archetype) return definition

  return archetype.fields.reduce(
    (currentDefinition, field) =>
      currentDefinition.fieldValues.some((fieldValue) => fieldValue.fieldKey === field.key)
        ? currentDefinition
        : {
            ...currentDefinition,
            fieldValues: [...currentDefinition.fieldValues, { fieldKey: field.key, value: field.defaultValue ?? null }],
          },
    definition,
  )
}

function updateGraph(snapshot: ProjectSnapshot, graphKey: string, updater: (graph: ProjectSnapshot['graphs'][number]) => ProjectSnapshot['graphs'][number]) {
  return {
    ...snapshot,
    graphs: snapshot.graphs.map((graph) => (graph.key === graphKey ? updater(graph) : graph)),
  }
}

function updateNode(
  graph: ProjectSnapshot['graphs'][number],
  nodeKey: string,
  updater: (node: ProjectSnapshot['graphs'][number]['nodes'][number]) => ProjectSnapshot['graphs'][number]['nodes'][number],
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.key === nodeKey ? updater(node) : node)),
  }
}

function updateEdge(
  graph: ProjectSnapshot['graphs'][number],
  edgeKey: string,
  updater: (edge: ProjectSnapshot['graphs'][number]['edges'][number]) => ProjectSnapshot['graphs'][number]['edges'][number],
) {
  return {
    ...graph,
    edges: graph.edges.map((edge) => (edge.key === edgeKey ? updater(edge) : edge)),
  }
}

export function applyPatchOperations(snapshot: ProjectSnapshot, operations: PatchOperation[]) {
  return operations.reduce((currentSnapshot, operation) => {
    switch (operation.op) {
      case 'set_game_spec':
        return {
          ...currentSnapshot,
          gameSpec: operation.gameSpec,
          draft: {
            ...currentSnapshot.draft,
            metadata: {
              ...currentSnapshot.draft.metadata,
              gameSpec: operation.gameSpec,
            },
          },
        }
      case 'apply_preset_pack': {
        const nextGameSpec = currentSnapshot.gameSpec
          ? {
              ...currentSnapshot.gameSpec,
              selectedPresetIds: {
                ...currentSnapshot.gameSpec.selectedPresetIds,
                packs: [...new Set([...currentSnapshot.gameSpec.selectedPresetIds.packs, operation.packId])],
              },
            }
          : null

        return nextGameSpec
          ? {
              ...currentSnapshot,
              gameSpec: nextGameSpec,
              draft: {
                ...currentSnapshot.draft,
                metadata: {
                  ...currentSnapshot.draft.metadata,
                  gameSpec: nextGameSpec,
                },
              },
            }
          : currentSnapshot
      }
      case 'instantiate_archetype_preset': {
        const nextArchetype = materializeArchetypePreset(operation.presetId)
        if (!nextArchetype || currentSnapshot.archetypes.some((archetype) => archetype.key === nextArchetype.key)) {
          return currentSnapshot
        }

        return {
          ...currentSnapshot,
          archetypes: [nextArchetype, ...currentSnapshot.archetypes],
        }
      }
      case 'instantiate_definition_preset': {
        const nextDefinition = materializeDefinitionPreset(operation.presetId, {
          keyOverride: operation.keyOverride,
          nameOverride: operation.nameOverride,
        })
        if (!nextDefinition || currentSnapshot.definitions.some((definition) => definition.key === nextDefinition.key)) {
          return currentSnapshot
        }

        return {
          ...currentSnapshot,
          definitions: [nextDefinition, ...currentSnapshot.definitions],
        }
      }
      case 'instantiate_graph_preset': {
        const nextGraph = materializeGraphPreset(operation.presetId, {
          keyOverride: operation.keyOverride,
          nameOverride: operation.nameOverride,
        })
        if (!nextGraph || currentSnapshot.graphs.some((graph) => graph.key === nextGraph.key)) {
          return currentSnapshot
        }

        return {
          ...currentSnapshot,
          graphs: [nextGraph, ...currentSnapshot.graphs],
        }
      }
      case 'create_archetype':
        if (currentSnapshot.archetypes.some((archetype) => archetype.key === operation.key)) return currentSnapshot
        return {
          ...currentSnapshot,
          archetypes: [createArchetypeFromPatch(operation), ...currentSnapshot.archetypes],
        }
      case 'update_archetype':
        return {
          ...currentSnapshot,
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.key ? { ...archetype, ...operation.changes } : archetype,
          ),
        }
      case 'add_archetype_field':
        return {
          ...currentSnapshot,
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.key
              ? {
                  ...archetype,
                  fields: [...archetype.fields.filter((field) => field.key !== operation.field.key), operation.field].sort(
                    (left, right) => left.sortOrder - right.sortOrder,
                  ),
                }
              : archetype,
          ),
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.archetypeKey === operation.key
              ? ensureFieldValue(definition, operation.field.key, operation.field.defaultValue ?? null)
              : definition,
          ),
        }
      case 'update_archetype_field':
        return {
          ...currentSnapshot,
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.key
              ? {
                  ...archetype,
                  fields: archetype.fields.map((field) => (field.key === operation.fieldKey ? { ...field, ...operation.changes } : field)),
                }
              : archetype,
          ),
        }
      case 'remove_archetype_field':
        return {
          ...currentSnapshot,
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.key
              ? { ...archetype, fields: archetype.fields.filter((field) => field.key !== operation.fieldKey) }
              : archetype,
          ),
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.archetypeKey === operation.key
              ? { ...definition, fieldValues: definition.fieldValues.filter((fieldValue) => fieldValue.fieldKey !== operation.fieldKey) }
              : definition,
          ),
        }
      case 'create_definition':
        if (currentSnapshot.definitions.some((definition) => definition.key === operation.key)) return currentSnapshot
        return {
          ...currentSnapshot,
          definitions: [createDefinitionFromPatch(operation), ...currentSnapshot.definitions],
        }
      case 'update_definition':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key
              ? {
                  ...definition,
                  ...operation.changes,
                  definitionData:
                    typeof operation.changes.definitionData === 'object' && operation.changes.definitionData !== null
                      ? {
                          ...definition.definitionData,
                          ...(operation.changes.definitionData as Record<string, unknown>),
                        }
                      : definition.definitionData,
                }
              : definition,
          ),
        }
      case 'set_icon_asset':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key ? { ...definition, iconAssetKey: operation.iconAssetKey } : definition,
          ),
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.key ? { ...archetype, iconAssetKey: operation.iconAssetKey } : archetype,
          ),
        }
      case 'set_archetype':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) => {
            if (definition.key !== operation.key) return definition
            const archetype = currentSnapshot.archetypes.find((candidate) => candidate.key === operation.archetypeKey) ?? null
            return initializeArchetypeFieldValues({ ...definition, archetypeKey: operation.archetypeKey }, archetype)
          }),
        }
      case 'set_field_value':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key ? ensureFieldValue(definition, operation.fieldKey, operation.value) : definition,
          ),
        }
      case 'add_custom_field':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key
              ? {
                  ...definition,
                  customFields: [...definition.customFields.filter((field) => field.key !== operation.field.key), operation.field],
                  fieldValues: definition.fieldValues.some((fieldValue) => fieldValue.fieldKey === operation.field.key)
                    ? definition.fieldValues
                    : [...definition.fieldValues, { fieldKey: operation.field.key, value: operation.field.defaultValue ?? null }],
                }
              : definition,
          ),
        }
      case 'remove_custom_field':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key
              ? {
                  ...definition,
                  customFields: definition.customFields.filter((field) => field.key !== operation.fieldKey),
                  fieldValues: definition.fieldValues.filter((fieldValue) => fieldValue.fieldKey !== operation.fieldKey),
                }
              : definition,
          ),
        }
      case 'attach_asset':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.key ? { ...definition, assetRefs: [...definition.assetRefs, operation.assetRef] } : definition,
          ),
        }
      case 'create_graph': {
        if (currentSnapshot.graphs.some((graph) => graph.key === operation.key)) return currentSnapshot

        const nextGraph = createGraphScaffold({
          key: operation.key,
          name: typeof operation.payload.name === 'string' ? operation.payload.name : operation.key,
          graphType: operation.payload.graphType ?? 'narrative_flow',
          summary: typeof operation.payload.summary === 'string' ? operation.payload.summary : '',
        } satisfies GraphCreateInput)

        return {
          ...currentSnapshot,
          graphs: [
            {
              ...nextGraph,
              ...operation.payload,
              nodes: nextGraph.nodes,
              edges: nextGraph.edges,
              metadata: operation.payload.metadata ?? nextGraph.metadata,
              llmHints: operation.payload.llmHints ?? nextGraph.llmHints,
            },
            ...currentSnapshot.graphs,
          ],
        }
      }
      case 'update_graph':
        return updateGraph(currentSnapshot, operation.key, (graph) => ({ ...graph, ...operation.changes }))
      case 'delete_graph':
        return {
          ...currentSnapshot,
          graphs: currentSnapshot.graphs.filter((graph) => graph.key !== operation.key),
        }
      case 'duplicate_graph': {
        const sourceGraph = currentSnapshot.graphs.find((graph) => graph.key === operation.key)
        if (!sourceGraph || currentSnapshot.graphs.some((graph) => graph.key === operation.nextKey)) return currentSnapshot

        const nodeKeyMap = new Map<string, string>()
        const duplicatedNodes = sourceGraph.nodes.map((node, index) => {
          const nextKey = `${node.key}_copy_${index + 1}`
          nodeKeyMap.set(node.key, nextKey)
          return {
            ...node,
            id: `${node.id}-copy-${Date.now()}-${index}`,
            key: nextKey,
            position: { x: node.position.x + 120, y: node.position.y + 80 },
          }
        })

        return {
          ...currentSnapshot,
          graphs: [
            {
              ...sourceGraph,
              id: `${sourceGraph.id}-copy-${Date.now()}`,
              key: operation.nextKey,
              name: `${sourceGraph.name} Copy`,
              entryNodeKey: sourceGraph.entryNodeKey ? nodeKeyMap.get(sourceGraph.entryNodeKey) ?? sourceGraph.entryNodeKey : null,
              nodes: duplicatedNodes,
              edges: sourceGraph.edges.map((edge, index) => ({
                ...edge,
                id: `${edge.id}-copy-${Date.now()}-${index}`,
                key: `${edge.key}_copy_${index + 1}`,
                source: { ...edge.source, nodeKey: nodeKeyMap.get(edge.source.nodeKey) ?? edge.source.nodeKey },
                target: { ...edge.target, nodeKey: nodeKeyMap.get(edge.target.nodeKey) ?? edge.target.nodeKey },
              })),
            },
            ...currentSnapshot.graphs,
          ],
        }
      }
      case 'create_node':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: graph.nodes.some((node) => node.key === operation.node.key)
            ? graph.nodes
            : [...graph.nodes, normalizeNode(operation.node)],
        }))
      case 'update_node':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) =>
            normalizeNode({
              ...node,
              ...operation.changes,
              body:
                typeof operation.changes.body === 'object' && operation.changes.body !== null
                  ? { ...node.body, ...(operation.changes.body as Record<string, unknown>) }
                  : node.body,
              display:
                typeof operation.changes.display === 'object' && operation.changes.display !== null
                  ? { ...node.display, ...(operation.changes.display as Record<string, unknown>) }
                  : node.display,
              metadata:
                typeof operation.changes.metadata === 'object' && operation.changes.metadata !== null
                  ? { ...node.metadata, ...(operation.changes.metadata as Record<string, unknown>) }
                  : node.metadata,
            }),
          ),
        )
      case 'update_node_template':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => applyTemplateToNode(node, operation.templateKey)),
        )
      case 'delete_node':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: graph.nodes.filter((node) => node.key !== operation.nodeKey),
          edges: graph.edges.filter((edge) => edge.source.nodeKey !== operation.nodeKey && edge.target.nodeKey !== operation.nodeKey),
          entryNodeKey: graph.entryNodeKey === operation.nodeKey ? null : graph.entryNodeKey,
        }))
      case 'move_node':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => ({ ...node, position: operation.position })),
        )
      case 'connect_edge':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          edges: graph.edges.some((edge) => edge.key === operation.edge.key) ? graph.edges : [...graph.edges, operation.edge],
        }))
      case 'update_edge':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateEdge(graph, operation.edgeKey, (edge) => ({
            ...edge,
            ...operation.changes,
            source:
              typeof operation.changes.source === 'object' && operation.changes.source !== null
                ? { ...edge.source, ...(operation.changes.source as Partial<EdgeDefinition['source']>) }
                : edge.source,
            target:
              typeof operation.changes.target === 'object' && operation.changes.target !== null
                ? { ...edge.target, ...(operation.changes.target as Partial<EdgeDefinition['target']>) }
                : edge.target,
          })),
        )
      case 'delete_edge':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          edges: graph.edges.filter((edge) => edge.key !== operation.edgeKey),
        }))
      case 'replace_subgraph':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: operation.nodes.map((node) => normalizeNode(node)),
          edges: operation.edges,
        }))
      case 'set_condition':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => ({ ...node, condition: operation.condition })),
        )
      case 'set_effects':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => ({ ...node, effects: operation.effects })),
        )
      case 'set_node_body':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => normalizeNode({ ...node, body: operation.body })),
        )
      case 'set_node_choices':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) =>
            normalizeNode({
              ...node,
              body: {
                ...node.body,
                choices: operation.choices,
              },
            }),
          ),
        )
      case 'set_node_media':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateNode(graph, operation.nodeKey, (node) => ({
            ...node,
            body: {
              ...node.body,
              imageAssetKey: operation.media.imageAssetKey,
              audioAssetKey: operation.media.audioAssetKey,
            },
          })),
        )
      case 'rekey_reference':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key === operation.oldKey ? { ...definition, key: operation.newKey } : definition,
          ),
          archetypes: currentSnapshot.archetypes.map((archetype) =>
            archetype.key === operation.oldKey ? { ...archetype, key: operation.newKey } : archetype,
          ),
          graphs: currentSnapshot.graphs.map((graph) =>
            graph.key === operation.oldKey ? { ...graph, key: operation.newKey } : graph,
          ),
        }
      default:
        return currentSnapshot
    }
  }, snapshot)
}

export function groupPatchOperations(operations: PatchOperation[]) {
  const graphOps = new Set(['instantiate_graph_preset', 'create_graph', 'update_graph', 'duplicate_graph', 'delete_graph'])
  const nodeOps = new Set([
    'create_node',
    'update_node',
    'update_node_template',
    'delete_node',
    'move_node',
    'connect_edge',
    'update_edge',
    'delete_edge',
    'replace_subgraph',
    'set_condition',
    'set_effects',
    'set_node_body',
    'set_node_choices',
    'set_node_media',
  ])
  const definitionOps = new Set([
    'set_game_spec',
    'apply_preset_pack',
    'instantiate_archetype_preset',
    'instantiate_definition_preset',
    'create_definition',
    'update_definition',
    'delete_definition',
    'set_icon_asset',
    'set_archetype',
    'set_field_value',
    'add_custom_field',
    'remove_custom_field',
    'attach_component',
    'update_component',
    'detach_component',
    'create_archetype',
    'update_archetype',
    'delete_archetype',
    'add_archetype_field',
    'update_archetype_field',
    'remove_archetype_field',
    'attach_asset',
    'rekey_reference',
  ])

  return {
    graphs: operations.filter((operation) => graphOps.has(operation.op)),
    nodesAndEdges: operations.filter((operation) => nodeOps.has(operation.op)),
    definitions: operations.filter((operation) => definitionOps.has(operation.op)),
  }
}

export function describePatchOperation(operation: PatchOperation) {
  switch (operation.op) {
    case 'set_game_spec':
      return 'Set game spec'
    case 'apply_preset_pack':
      return `Apply preset pack \`${operation.packId}\``
    case 'instantiate_archetype_preset':
      return `Instantiate archetype preset \`${operation.presetId}\``
    case 'instantiate_definition_preset':
      return `Instantiate definition preset \`${operation.presetId}\``
    case 'instantiate_graph_preset':
      return `Instantiate graph preset \`${operation.presetId}\``
    case 'create_graph':
      return `Create graph \`${operation.key}\``
    case 'update_graph':
      return `Update graph \`${operation.key}\``
    case 'duplicate_graph':
      return `Duplicate graph \`${operation.key}\` to \`${operation.nextKey}\``
    case 'create_node':
      return `Create ${operation.node.templateKey ?? operation.node.type} node \`${operation.node.key}\` in \`${operation.graphKey}\``
    case 'update_node_template':
      return `Convert node \`${operation.nodeKey}\` to template \`${operation.templateKey}\``
    case 'connect_edge':
      return `Connect \`${operation.edge.source.nodeKey}\` to \`${operation.edge.target.nodeKey}\``
    case 'set_condition':
      return `Set condition on node \`${operation.nodeKey}\``
    case 'set_effects':
      return `Set effects on node \`${operation.nodeKey}\``
    case 'set_node_body':
      return `Update story/body content on \`${operation.nodeKey}\``
    case 'set_node_choices':
      return `Update choices on \`${operation.nodeKey}\``
    case 'set_node_media':
      return `Update media on \`${operation.nodeKey}\``
    case 'create_definition':
      return `Create ${operation.kind} \`${operation.key}\``
    case 'set_archetype':
      return `Set archetype of \`${operation.key}\` to \`${operation.archetypeKey ?? 'none'}\``
    case 'set_field_value':
      return `Set field \`${operation.fieldKey}\` on \`${operation.key}\``
    case 'create_archetype':
      return `Create archetype \`${operation.key}\``
    case 'add_archetype_field':
      return `Add field \`${operation.field.key}\` to archetype \`${operation.key}\``
    default:
      return `${operation.op} ${'key' in operation && typeof operation.key === 'string' ? `\`${operation.key}\`` : ''}`.trim()
  }
}
