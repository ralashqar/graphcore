import type {
  AssemblyEdgeDefinition,
  AssemblyGraphDefinition,
  AssemblyNodeDefinition,
  ArchetypeDefinition,
  DefinitionBase,
  EdgeDefinition,
  EnvironmentBlueprintV1,
  GraphCreateInput,
  PatchOperation,
  ProjectSnapshot,
} from './graphcore.ts'
import { createAssemblyGraph } from './environmentAssembly.ts'
import { createGraphScaffold } from './graphScaffold.ts'
import { applyTemplateToNode, normalizeNode } from './nodeLibrary.ts'
import { materializeArchetypePreset, materializeDefinitionPreset, materializeGraphPreset } from './presetCatalog.ts'

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

function updateAssemblyGraph(
  snapshot: ProjectSnapshot,
  graphKey: string,
  updater: (graph: ProjectSnapshot['assemblyGraphs'][number]) => ProjectSnapshot['assemblyGraphs'][number],
) {
  return {
    ...snapshot,
    assemblyGraphs: snapshot.assemblyGraphs.map((graph) => (graph.key === graphKey ? updater(graph) : graph)),
  }
}

function updateEnvironmentBlueprint(
  snapshot: ProjectSnapshot,
  blueprintId: string,
  updater: (blueprint: ProjectSnapshot['environmentBlueprints'][number]) => ProjectSnapshot['environmentBlueprints'][number],
) {
  return {
    ...snapshot,
    environmentBlueprints: snapshot.environmentBlueprints.map((blueprint) => (blueprint.id === blueprintId ? updater(blueprint) : blueprint)),
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

function updateAssemblyNode(
  graph: ProjectSnapshot['assemblyGraphs'][number],
  nodeKey: string,
  updater: (node: ProjectSnapshot['assemblyGraphs'][number]['nodes'][number]) => ProjectSnapshot['assemblyGraphs'][number]['nodes'][number],
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.key === nodeKey ? updater(node) : node)),
  }
}

function updateAssemblyEdge(
  graph: ProjectSnapshot['assemblyGraphs'][number],
  edgeKey: string,
  updater: (edge: ProjectSnapshot['assemblyGraphs'][number]['edges'][number]) => ProjectSnapshot['assemblyGraphs'][number]['edges'][number],
) {
  return {
    ...graph,
    edges: graph.edges.map((edge) => (edge.key === edgeKey ? updater(edge) : edge)),
  }
}

export function applyPatchOperations(snapshot: ProjectSnapshot, operations: PatchOperation[]): ProjectSnapshot {
  return operations.reduce<ProjectSnapshot>((currentSnapshot, operation): ProjectSnapshot => {
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
      case 'create_assembly_graph': {
        if (currentSnapshot.assemblyGraphs.some((graph) => graph.key === operation.key)) return currentSnapshot

        const scaffold = createAssemblyGraph({
          key: operation.key,
          name: typeof operation.payload.name === 'string' ? operation.payload.name : operation.key,
          summary: typeof operation.payload.summary === 'string' ? operation.payload.summary : '',
          boundEnvironmentKey:
            typeof operation.payload.boundEnvironmentKey === 'string' || operation.payload.boundEnvironmentKey === null
              ? operation.payload.boundEnvironmentKey
              : null,
        })

        return {
          ...currentSnapshot,
          assemblyGraphs: [
            {
              ...scaffold,
              ...operation.payload,
              nodes: Array.isArray(operation.payload.nodes) && operation.payload.nodes.length > 0 ? operation.payload.nodes : scaffold.nodes,
              edges: Array.isArray(operation.payload.edges) ? operation.payload.edges : scaffold.edges,
              metadata:
                typeof operation.payload.metadata === 'object' && operation.payload.metadata !== null
                  ? operation.payload.metadata
                  : scaffold.metadata,
            } satisfies AssemblyGraphDefinition,
            ...currentSnapshot.assemblyGraphs,
          ],
        }
      }
      case 'update_graph':
        return updateGraph(currentSnapshot, operation.key, (graph) => ({ ...graph, ...operation.changes }))
      case 'update_assembly_graph':
        return updateAssemblyGraph(currentSnapshot, operation.key, (graph) => ({
          ...graph,
          ...operation.changes,
          metadata:
            typeof operation.changes.metadata === 'object' && operation.changes.metadata !== null
              ? { ...graph.metadata, ...(operation.changes.metadata as Record<string, unknown>) }
              : graph.metadata,
        }))
      case 'delete_graph':
        return {
          ...currentSnapshot,
          graphs: currentSnapshot.graphs.filter((graph) => graph.key !== operation.key),
        }
      case 'delete_assembly_graph':
        return {
          ...currentSnapshot,
          assemblyGraphs: currentSnapshot.assemblyGraphs.filter((graph) => graph.key !== operation.key),
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.kind !== 'environment'
              ? definition
              : {
                  ...definition,
                  components: definition.components.map((component) =>
                    component.type === 'environment_geometry_binding'
                      ? { ...component, config: { ...component.config, assemblyGraphKey: component.config.assemblyGraphKey === operation.key ? null : component.config.assemblyGraphKey } }
                      : component,
                  ),
                },
          ),
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
      case 'create_assembly_node':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: graph.nodes.some((node) => node.key === operation.node.key) ? graph.nodes : [...graph.nodes, operation.node],
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
      case 'update_assembly_node':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateAssemblyNode(graph, operation.nodeKey, (node) => ({
            ...node,
            ...operation.changes,
            position:
              typeof operation.changes.position === 'object' && operation.changes.position !== null
                ? { ...node.position, ...(operation.changes.position as Partial<AssemblyNodeDefinition['position']>) }
                : node.position,
            params:
              typeof operation.changes.params === 'object' && operation.changes.params !== null
                ? { ...node.params, ...(operation.changes.params as Record<string, unknown>) }
                : node.params,
            metadata:
              typeof operation.changes.metadata === 'object' && operation.changes.metadata !== null
                ? { ...node.metadata, ...(operation.changes.metadata as Record<string, unknown>) }
                : node.metadata,
            ports: Array.isArray(operation.changes.ports) ? operation.changes.ports as AssemblyNodeDefinition['ports'] : node.ports,
          })),
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
      case 'delete_assembly_node':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: graph.nodes.filter((node) => node.key !== operation.nodeKey),
          edges: graph.edges.filter((edge) => edge.source.nodeKey !== operation.nodeKey && edge.target.nodeKey !== operation.nodeKey),
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
      case 'connect_assembly_edge':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
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
      case 'update_assembly_edge':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) =>
          updateAssemblyEdge(graph, operation.edgeKey, (edge) => ({
            ...edge,
            ...operation.changes,
            source:
              typeof operation.changes.source === 'object' && operation.changes.source !== null
                ? { ...edge.source, ...(operation.changes.source as Partial<AssemblyEdgeDefinition['source']>) }
                : edge.source,
            target:
              typeof operation.changes.target === 'object' && operation.changes.target !== null
                ? { ...edge.target, ...(operation.changes.target as Partial<AssemblyEdgeDefinition['target']>) }
                : edge.target,
            metadata:
              typeof operation.changes.metadata === 'object' && operation.changes.metadata !== null
                ? { ...edge.metadata, ...(operation.changes.metadata as Record<string, unknown>) }
                : edge.metadata,
          })),
        )
      case 'delete_edge':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          edges: graph.edges.filter((edge) => edge.key !== operation.edgeKey),
        }))
      case 'delete_assembly_edge':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          edges: graph.edges.filter((edge) => edge.key !== operation.edgeKey),
        }))
      case 'replace_subgraph':
        return updateGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: operation.nodes.map((node) => normalizeNode(node)),
          edges: operation.edges,
        }))
      case 'replace_assembly_subgraph':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: operation.nodes,
          edges: operation.edges,
        }))
      case 'bind_environment_assembly':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.key !== operation.environmentKey || definition.kind !== 'environment'
              ? definition
              : {
                  ...definition,
                  components: definition.components.some((component) => component.type === 'environment_geometry_binding')
                    ? definition.components.map((component) =>
                        component.type === 'environment_geometry_binding'
                          ? {
                              ...component,
                              config: {
                                ...component.config,
                                sourceMode: operation.assemblyGraphKey ? 'procedural_graph' : component.config.sourceMode,
                                assemblyGraphKey: operation.assemblyGraphKey,
                              },
                            }
                          : component,
                      )
                    : definition.components,
                },
          ),
          assemblyGraphs: currentSnapshot.assemblyGraphs.map((graph) =>
            graph.key === operation.assemblyGraphKey
              ? { ...graph, boundEnvironmentKey: operation.environmentKey }
              : graph.boundEnvironmentKey === operation.environmentKey
                ? { ...graph, boundEnvironmentKey: null }
                : graph,
          ),
        }
      case 'create_environment_blueprint':
        return currentSnapshot.environmentBlueprints.some((blueprint) => blueprint.id === operation.blueprint.id)
          ? currentSnapshot
          : {
              ...currentSnapshot,
              environmentBlueprints: [operation.blueprint, ...currentSnapshot.environmentBlueprints],
            }
      case 'update_environment_blueprint':
        return updateEnvironmentBlueprint(currentSnapshot, operation.blueprintId, (blueprint) => ({
          ...blueprint,
          ...operation.changes,
          site:
            typeof operation.changes.site === 'object' && operation.changes.site !== null
              ? {
                  ...(blueprint.site ?? {}),
                  ...(operation.changes.site as Record<string, unknown>),
                }
              : blueprint.site,
          styleHints:
            typeof operation.changes.styleHints === 'object' && operation.changes.styleHints !== null
              ? { ...blueprint.styleHints, ...(operation.changes.styleHints as Record<string, unknown>) }
              : blueprint.styleHints,
          metadata:
            typeof operation.changes.metadata === 'object' && operation.changes.metadata !== null
              ? { ...blueprint.metadata, ...(operation.changes.metadata as Record<string, unknown>) }
              : blueprint.metadata,
        } as EnvironmentBlueprintV1))
      case 'delete_environment_blueprint':
        return {
          ...currentSnapshot,
          environmentBlueprints: currentSnapshot.environmentBlueprints.filter((blueprint) => blueprint.id !== operation.blueprintId),
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.kind !== 'environment'
              ? definition
              : {
                  ...definition,
                  components: definition.components.map((component) =>
                    component.type === 'environment_geometry_binding' && component.config.environmentBlueprintKey === operation.blueprintId
                      ? {
                          ...component,
                          config: {
                            ...component.config,
                            environmentBlueprintKey: null,
                            sourceMode: component.config.sourceMode === 'procedural_blueprint' ? 'mesh' : component.config.sourceMode,
                          },
                        }
                      : component,
                  ),
                },
          ),
        }
      case 'materialize_blueprint_region':
        return {
          ...currentSnapshot,
          definitions: currentSnapshot.definitions.map((definition) =>
            definition.kind !== 'environment'
            || !currentSnapshot.environmentBlueprints.some((blueprint) => blueprint.id === operation.blueprintId && blueprint.environmentKey === definition.key)
              ? definition
              : {
                  ...definition,
                  components: definition.components.map((component) =>
                    component.type === 'environment_geometry_binding'
                      ? {
                          ...component,
                          config: {
                            ...component.config,
                            sourceMode: 'procedural_blueprint',
                            environmentBlueprintKey: operation.blueprintId,
                            assemblyGraphKey: operation.assemblyGraphKey ?? component.config.assemblyGraphKey,
                          },
                        }
                      : component,
                  ),
                },
          ),
        }
      case 'detach_blueprint_region':
        return updateAssemblyGraph(currentSnapshot, operation.assemblyGraphKey, (graph) => ({
          ...graph,
          metadata: {
            ...graph.metadata,
            blueprintOwnership: 'manual_override',
            blueprintKey: operation.blueprintId,
          },
        }))
      case 'reattach_blueprint_region':
        return updateAssemblyGraph(currentSnapshot, operation.assemblyGraphKey, (graph) => ({
          ...graph,
          metadata: {
            ...graph.metadata,
            blueprintOwnership: 'generated',
            blueprintKey: operation.blueprintId,
          },
        }))
      case 'expand_macro_node':
      case 'collapse_macro_region':
        return updateAssemblyGraph(currentSnapshot, operation.graphKey, (graph) => ({
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.key === operation.nodeKey
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    macroState: operation.op === 'expand_macro_node' ? 'expanded' : 'collapsed',
                  },
                }
              : node,
          ),
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
  const graphOps = new Set([
    'instantiate_graph_preset',
    'create_graph',
    'create_assembly_graph',
    'create_environment_blueprint',
    'update_environment_blueprint',
    'delete_environment_blueprint',
    'materialize_blueprint_region',
    'detach_blueprint_region',
    'reattach_blueprint_region',
    'update_graph',
    'update_assembly_graph',
    'duplicate_graph',
    'delete_graph',
    'delete_assembly_graph',
    'bind_environment_assembly',
  ])
  const nodeOps = new Set([
    'create_node',
    'create_assembly_node',
    'update_node',
    'update_assembly_node',
    'update_node_template',
    'delete_node',
    'delete_assembly_node',
    'move_node',
    'connect_edge',
    'connect_assembly_edge',
    'update_edge',
    'update_assembly_edge',
    'delete_edge',
    'delete_assembly_edge',
    'replace_subgraph',
    'replace_assembly_subgraph',
    'expand_macro_node',
    'collapse_macro_region',
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
    case 'create_assembly_graph':
      return `Create environment assembly graph \`${operation.key}\``
    case 'create_environment_blueprint':
      return `Create environment blueprint \`${operation.blueprint.id}\``
    case 'update_environment_blueprint':
      return `Update environment blueprint \`${operation.blueprintId}\``
    case 'delete_environment_blueprint':
      return `Delete environment blueprint \`${operation.blueprintId}\``
    case 'update_graph':
      return `Update graph \`${operation.key}\``
    case 'update_assembly_graph':
      return `Update assembly graph \`${operation.key}\``
    case 'duplicate_graph':
      return `Duplicate graph \`${operation.key}\` to \`${operation.nextKey}\``
    case 'delete_assembly_graph':
      return `Delete assembly graph \`${operation.key}\``
    case 'create_node':
      return `Create ${operation.node.templateKey ?? operation.node.type} node \`${operation.node.key}\` in \`${operation.graphKey}\``
    case 'create_assembly_node':
      return `Create ${operation.node.kind} assembly node \`${operation.node.key}\` in \`${operation.graphKey}\``
    case 'update_assembly_node':
      return `Update assembly node \`${operation.nodeKey}\``
    case 'update_node_template':
      return `Convert node \`${operation.nodeKey}\` to template \`${operation.templateKey}\``
    case 'connect_edge':
      return `Connect \`${operation.edge.source.nodeKey}\` to \`${operation.edge.target.nodeKey}\``
    case 'connect_assembly_edge':
      return `Connect assembly node \`${operation.edge.source.nodeKey}\` to \`${operation.edge.target.nodeKey}\``
    case 'replace_assembly_subgraph':
      return `Replace assembly subgraph in \`${operation.graphKey}\``
    case 'bind_environment_assembly':
      return `Bind environment \`${operation.environmentKey}\` to assembly graph \`${operation.assemblyGraphKey ?? 'none'}\``
    case 'materialize_blueprint_region':
      return `Materialize blueprint \`${operation.blueprintId}\` into \`${operation.assemblyGraphKey ?? 'auto'}\``
    case 'detach_blueprint_region':
      return `Detach blueprint \`${operation.blueprintId}\` from \`${operation.assemblyGraphKey}\``
    case 'reattach_blueprint_region':
      return `Reattach blueprint \`${operation.blueprintId}\` to \`${operation.assemblyGraphKey}\``
    case 'expand_macro_node':
      return `Expand macro node \`${operation.nodeKey}\``
    case 'collapse_macro_region':
      return `Collapse macro region \`${operation.nodeKey}\``
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
