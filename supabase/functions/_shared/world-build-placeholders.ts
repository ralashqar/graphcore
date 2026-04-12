export type DefinitionKind = 'item' | 'character' | 'environment'

export type ComponentEnvelope = {
  type: string
  config: Record<string, unknown>
}

export type GraphType = 'narrative_flow' | 'system_graph' | 'quest_flow' | 'cinematic_flow'

export type GraphScaffold = {
  id: string
  key: string
  name: string
  graphType: GraphType
  summary: string
  entryNodeKey: string
  metadata: Record<string, unknown>
  llmHints: Record<string, unknown>
  nodes: Array<{
    id: string
    key: string
    type: string
    title: string
    templateKey: string
    subtitle: string | null
    position: { x: number; y: number }
    body: Record<string, unknown>
    condition: string | null
    effects: Array<Record<string, unknown>>
    ports: Array<Record<string, unknown>>
    display: Record<string, unknown>
    metadata: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    key: string
    source: { nodeKey: string; portId: string }
    target: { nodeKey: string; portId: string }
    label: string | null
    condition: string | null
    metadata: Record<string, unknown>
  }>
}

export function buildDefaultDefinitionComponents(kind: DefinitionKind): ComponentEnvelope[] {
  switch (kind) {
    case 'item':
      return [
        {
          type: 'physical_item_profile',
          config: {
            physicalSubtype: 'pickup',
            worldPlacementRole: '',
            pickupContext: '',
          },
        },
        {
          type: 'render_3d_binding',
          config: {
            primaryMeshAssetKey: null,
            previewImageAssetKey: null,
            conceptPrompt: null,
            generationPrompt: null,
            generationStyle: null,
          },
        },
      ]
    case 'character':
      return [
        {
          type: 'inventory',
          config: {
            startingItems: [],
            capacityFormula: null,
          },
        },
        {
          type: 'character_profile',
          config: {
            subtype: 'humanoid',
            bodyClass: 'humanoid',
            controlMode: 'ai',
            scaleProfile: 'medium',
          },
        },
        {
          type: 'ability_loadout',
          config: {
            entries: [],
          },
        },
        {
          type: 'animation_binding',
          config: {
            defaultAnimationGraphKey: null,
            animationSetKeys: [],
            slotBindings: [],
            locomotionMode: 'grounded',
          },
        },
        {
          type: 'logic_state_machine_binding',
          config: {
            stateMachineKey: null,
            defaultStateKey: null,
            controlMode: 'ai',
          },
        },
        {
          type: 'render_3d_binding',
          config: {
            primaryMeshAssetKey: null,
            previewImageAssetKey: null,
            conceptPrompt: null,
            generationPrompt: null,
            generationStyle: null,
          },
        },
      ]
    case 'environment':
      return [
        {
          type: 'environment_profile',
          config: {
            subtype: 'exterior',
            biome: '',
            traversalType: 'walk',
            isInterior: false,
            scaleTier: 'site',
            worldModelKey: null,
            linkedLocationKeys: [],
          },
        },
        {
          type: 'environment_geometry_binding',
          config: {
            sourceMode: 'mesh',
            assemblyGraphKey: null,
            environmentBlueprintKey: null,
            compilerTarget: 'preview_mesh',
            units: 'meters',
            svgBlueprintAssetKey: null,
            compileSettings: {
              livePreview: true,
              showDebug: true,
              triangulation: 'shape_utils',
              booleanMode: 'bounded_v1',
              levelHeight: 3,
            },
          },
        },
        {
          type: 'environment_render_binding',
          config: {
            primaryMeshAssetKey: null,
            previewImageAssetKey: null,
            lightingProfile: '',
            generationPrompt: null,
            generationStyle: null,
          },
        },
        {
          type: 'environment_navigation',
          config: {
            entryAnchors: [],
            regionMarkers: [],
            navigationNotes: '',
          },
        },
        {
          type: 'environment_spawn_rules',
          config: {
            characterKeys: [],
            itemKeys: [],
            resourceNodeKeys: [],
          },
        },
      ]
  }
}

function graphSuffix(graphKey: string) {
  return graphKey
    .replace(/^graph\./, '')
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'generated'
}

export function createGraphScaffold(input: {
  key: string
  name: string
  graphType: GraphType
  summary: string
}): GraphScaffold {
  const now = Date.now()
  const suffix = graphSuffix(input.key)
  const startNodeKey = `start.${suffix}`
  const endNodeKey = `end.${suffix}`

  return {
    id: `graph-${now}`,
    key: input.key,
    name: input.name,
    graphType: input.graphType,
    summary: input.summary,
    entryNodeKey: startNodeKey,
    metadata: {},
    llmHints: {},
    nodes: [
      {
        id: `node-start-${now}`,
        key: startNodeKey,
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
      },
      {
        id: `node-end-${now + 1}`,
        key: endNodeKey,
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
      },
    ],
    edges: [
      {
        id: `edge-${now}`,
        key: `edge.${suffix}_start_end`,
        source: { nodeKey: startNodeKey, portId: 'out' },
        target: { nodeKey: endNodeKey, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      },
    ],
  }
}
