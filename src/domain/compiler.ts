import type {
  AssetDefinition,
  Diagnostic,
  DefinitionBase,
  GameSystemBundle,
  GraphDefinition,
  ProjectSnapshot,
} from './graphcore'

export function compileBundle(snapshot: ProjectSnapshot): GameSystemBundle {
  const diagnostics = [
    ...validateDefinitions(snapshot.definitions),
    ...snapshot.graphs.flatMap((graph) => validateGraph(graph, snapshot.definitions, snapshot.assets)),
  ]

  const definitionsByKind = snapshot.definitions.reduce<Record<string, string[]>>((acc, definition) => {
    acc[definition.kind] ??= []
    acc[definition.kind].push(definition.key)
    return acc
  }, {})

  const graphEntryNodes = snapshot.graphs.reduce<Record<string, string | null>>((acc, graph) => {
    acc[graph.key] = graph.entryNodeKey
    return acc
  }, {})

  const assetKeysByKind = snapshot.assets.reduce<Record<string, string[]>>((acc, asset) => {
    acc[asset.kind] ??= []
    acc[asset.kind].push(asset.key)
    return acc
  }, {})

  return {
    bundleVersion: 1,
    manifest: {
      workspaceSlug: snapshot.workspace.slug,
      projectSlug: snapshot.project.slug,
      draftId: snapshot.draft.id,
      generatedAt: new Date().toISOString(),
      definitionCount: snapshot.definitions.length,
      graphCount: snapshot.graphs.length,
      assetCount: snapshot.assets.length,
    },
    definitions: snapshot.definitions,
    graphs: snapshot.graphs,
    assets: snapshot.assets,
    lookupIndices: {
      definitionsByKind,
      graphEntryNodes,
      assetKeysByKind,
    },
    diagnostics,
  }
}

export function validateDefinitions(definitions: DefinitionBase[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seenKeys = new Set<string>()

  for (const definition of definitions) {
    if (seenKeys.has(definition.key)) {
      diagnostics.push({
        level: 'error',
        code: 'duplicate_definition_key',
        message: `Duplicate definition key "${definition.key}".`,
        graphKey: null,
        nodeKey: null,
      })
    }

    seenKeys.add(definition.key)

    if (definition.kind === 'item' && definition.tags.includes('shadow_token') && !definition.tags.includes('hidden')) {
      diagnostics.push({
        level: 'warning',
        code: 'shadow_token_visibility',
        message: `Shadow token item "${definition.key}" should also carry the "hidden" tag.`,
        graphKey: null,
        nodeKey: null,
      })
    }
  }

  return diagnostics
}

export function validateGraph(
  graph: GraphDefinition,
  definitions: DefinitionBase[],
  assets: AssetDefinition[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const definitionKeys = new Set(definitions.map((definition) => definition.key))
  const assetKeys = new Set(assets.map((asset) => asset.key))
  const nodeKeys = new Set(graph.nodes.map((node) => node.key))
  const startNodes = graph.nodes.filter((node) => node.type === 'start')
  const endNodes = graph.nodes.filter((node) => node.type === 'end')

  if (startNodes.length !== 1) {
    diagnostics.push({
      level: 'error',
      code: 'graph_start_count',
      message: `Graph "${graph.key}" must have exactly one start node.`,
      graphKey: graph.key,
      nodeKey: null,
    })
  }

  if (endNodes.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'graph_missing_end',
      message: `Graph "${graph.key}" should include at least one end node.`,
      graphKey: graph.key,
      nodeKey: null,
    })
  }

  for (const edge of graph.edges) {
    if (!nodeKeys.has(edge.source.nodeKey) || !nodeKeys.has(edge.target.nodeKey)) {
      diagnostics.push({
        level: 'error',
        code: 'edge_missing_endpoint',
        message: `Edge "${edge.key}" points to a missing node.`,
        graphKey: graph.key,
        nodeKey: null,
      })
    }
  }

  for (const node of graph.nodes) {
    if (node.body.imageAssetKey && !assetKeys.has(node.body.imageAssetKey)) {
      diagnostics.push({
        level: 'error',
        code: 'missing_image_asset',
        message: `Node "${node.key}" references missing image asset "${node.body.imageAssetKey}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    if (node.body.audioAssetKey && !assetKeys.has(node.body.audioAssetKey)) {
      diagnostics.push({
        level: 'error',
        code: 'missing_audio_asset',
        message: `Node "${node.key}" references missing audio asset "${node.body.audioAssetKey}".`,
        graphKey: graph.key,
        nodeKey: node.key,
      })
    }

    for (const effect of node.effects) {
      if ('itemKey' in effect && !definitionKeys.has(effect.itemKey)) {
        diagnostics.push({
          level: 'error',
          code: 'missing_effect_item',
          message: `Node "${node.key}" references missing item "${effect.itemKey}".`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }

      if ('statKey' in effect && !definitionKeys.has(effect.statKey)) {
        diagnostics.push({
          level: 'error',
          code: 'missing_effect_stat',
          message: `Node "${node.key}" references missing stat "${effect.statKey}".`,
          graphKey: graph.key,
          nodeKey: node.key,
        })
      }
    }
  }

  const unreachableNodeKeys = findUnreachableNodes(graph)

  for (const nodeKey of unreachableNodeKeys) {
    diagnostics.push({
      level: 'warning',
      code: 'unreachable_node',
      message: `Node "${nodeKey}" is unreachable from the graph entry point.`,
      graphKey: graph.key,
      nodeKey,
    })
  }

  return diagnostics
}

function findUnreachableNodes(graph: GraphDefinition): string[] {
  if (!graph.entryNodeKey) {
    return graph.nodes.map((node) => node.key)
  }

  const adjacency = graph.edges.reduce<Record<string, string[]>>((acc, edge) => {
    acc[edge.source.nodeKey] ??= []
    acc[edge.source.nodeKey].push(edge.target.nodeKey)
    return acc
  }, {})

  const visited = new Set<string>()
  const queue = [graph.entryNodeKey]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || visited.has(current)) {
      continue
    }

    visited.add(current)

    for (const next of adjacency[current] ?? []) {
      if (!visited.has(next)) {
        queue.push(next)
      }
    }
  }

  return graph.nodes.map((node) => node.key).filter((key) => !visited.has(key))
}
