import type { GraphCreateInput, GraphDefinition } from './graphcore'
import { normalizeNode } from './nodeLibrary'

function graphSuffix(graphKey: string) {
  return graphKey
    .replace(/^graph\./, '')
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'generated'
}

export function getGraphScaffoldKeys(graphKey: string) {
  const suffix = graphSuffix(graphKey)

  return {
    suffix,
    startNodeKey: `start.${suffix}`,
    endNodeKey: `end.${suffix}`,
    edgeKey: `edge.${suffix}_start_end`,
  }
}

export function createGraphScaffold(input: GraphCreateInput): GraphDefinition {
  const now = Date.now()
  const scaffoldKeys = getGraphScaffoldKeys(input.key)
  const startNode = normalizeNode({
    id: `node-start-${now}`,
    key: scaffoldKeys.startNodeKey,
    type: 'start',
    title: 'Start',
    templateKey: 'start',
    subtitle: null,
    position: { x: 120, y: 200 },
    body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
    condition: null,
    effects: [],
    ports: [],
    display: { iconAssetKey: null, compactPreview: false },
    metadata: {},
  })
  const endNode = normalizeNode({
    id: `node-end-${now + 1}`,
    key: scaffoldKeys.endNodeKey,
    type: 'end',
    title: 'End',
    templateKey: 'end',
    subtitle: null,
    position: { x: 860, y: 200 },
    body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
    condition: null,
    effects: [],
    ports: [],
    display: { iconAssetKey: null, compactPreview: false },
    metadata: {},
  })

  return {
    id: `graph-${now}`,
    key: input.key,
    name: input.name,
    graphType: input.graphType,
    summary: input.summary,
    entryNodeKey: startNode.key,
    metadata: {},
    llmHints: {},
    nodes: [startNode, endNode],
    edges: [
      {
        id: `edge-${now}`,
        key: scaffoldKeys.edgeKey,
        source: { nodeKey: startNode.key, portId: 'out' },
        target: { nodeKey: endNode.key, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      },
    ],
  }
}
