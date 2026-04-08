import { compileBundle } from '../domain/compiler'
import { demoProjectSnapshot } from '../domain/demo-data'
import {
  projectSnapshotSchema,
  type AssetDefinition,
  type ComponentEnvelope,
  type DefinitionBase,
  type GraphDefinition,
  type PatchOperation,
  type ProjectSnapshot,
} from '../domain/graphcore'
import { supabase } from '../utils/supabase'

type DefinitionRow = {
  id: string
  key: string
  kind: DefinitionBase['kind']
  name: string
  summary: string
  status: DefinitionBase['status']
  tags: string[] | null
  schema_version: number
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
  asset_refs: unknown[] | null
  definition_data: Record<string, unknown> | null
}

type ComponentRow = {
  definition_id: string
  component_type: ComponentEnvelope['type']
  config: Record<string, unknown>
}

type GraphRow = {
  id: string
  key: string
  name: string
  graph_type: GraphDefinition['graphType']
  summary: string
  entry_node_key: string | null
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type NodeRow = {
  id: string
  graph_id: string
  key: string
  node_type: GraphDefinition['nodes'][number]['type']
  title: string
  position_x: number
  position_y: number
  body: Record<string, unknown> | null
  condition_expr: Record<string, unknown> | null
  effect_ops: Record<string, unknown>[] | null
  ports: Record<string, unknown>[] | null
  metadata: Record<string, unknown> | null
}

type EdgeRow = {
  id: string
  graph_id: string
  key: string
  source_node_key: string
  source_port: string | null
  target_node_key: string
  target_port: string | null
  label: string | null
  condition_expr: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type AssetRow = {
  id: string
  key: string
  name: string
  kind: AssetDefinition['kind']
  mime_type: string
  storage_path: string
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

export async function loadProjectSnapshot(): Promise<{
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No authenticated Supabase session found. Showing the bundled design reference project.',
    }
  }

  const workspaceResponse = await supabase
    .from('workspace_memberships')
    .select('role, workspace:workspaces!inner(id, name, slug)')
    .limit(1)
    .maybeSingle()

  if (workspaceResponse.error || !workspaceResponse.data?.workspace) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No GraphCore workspace was visible through RLS. Showing the bundled design reference project.',
    }
  }

  const workspace = Array.isArray(workspaceResponse.data.workspace)
    ? workspaceResponse.data.workspace[0]
    : workspaceResponse.data.workspace

  const projectResponse = await supabase
    .from('projects')
    .select('id, name, slug, summary, visibility')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (projectResponse.error || !projectResponse.data) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No project data was found yet. Seed or create a project to switch the editor to live data.',
    }
  }

  const project = projectResponse.data

  const draftResponse = await supabase
    .from('project_drafts')
    .select('id, name, version, is_primary, updated_at')
    .eq('project_id', project.id)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftResponse.error || !draftResponse.data) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'Project exists, but it has no draft yet. Showing the bundled design reference project.',
    }
  }

  const draft = draftResponse.data
  const definitionIds = await getDefinitionIds(draft.id)

  const [
    definitionsResponse,
    componentsResponse,
    graphsResponse,
    nodesResponse,
    edgesResponse,
    assetsResponse,
    patchSetsResponse,
    releasesResponse,
  ] = await Promise.all([
    supabase
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_components')
          .select('definition_id, component_type, config')
          .in('definition_id', definitionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, position_x, position_y, body, condition_expr, effect_ops, ports, metadata'),
    supabase
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    supabase
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('patch_sets')
      .select('id, summary, prompt, status, operations, diagnostics')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('releases')
      .select('id, version, label, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
  ])

  const definitions = (definitionsResponse.data as DefinitionRow[] | null) ?? []
  const components = (componentsResponse.data as ComponentRow[] | null) ?? []
  const graphs = (graphsResponse.data as GraphRow[] | null) ?? []
  const nodes = (nodesResponse.data as NodeRow[] | null) ?? []
  const edges = (edgesResponse.data as EdgeRow[] | null) ?? []
  const assets = (assetsResponse.data as AssetRow[] | null) ?? []

  const snapshot = projectSnapshotSchema.parse({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: workspaceResponse.data.role,
    },
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      summary: project.summary ?? '',
      visibility: project.visibility,
    },
    draft: {
      id: draft.id,
      name: draft.name,
      version: draft.version,
      isPrimary: draft.is_primary,
      updatedAt: draft.updated_at,
    },
    definitions: definitions.map((definition) => ({
      id: definition.id,
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary ?? '',
      status: definition.status,
      tags: definition.tags ?? [],
      schemaVersion: definition.schema_version ?? 1,
      metadata: definition.metadata ?? {},
      llmHints: definition.llm_hints ?? {},
      assetRefs: definition.asset_refs ?? [],
      definitionData: definition.definition_data ?? {},
      components: components
        .filter((component) => component.definition_id === definition.id)
        .map((component) => ({
          type: component.component_type,
          config: component.config,
        })),
    })),
    graphs: graphs.map((graph) => ({
      id: graph.id,
      key: graph.key,
      name: graph.name,
      graphType: graph.graph_type,
      summary: graph.summary ?? '',
      entryNodeKey: graph.entry_node_key,
      metadata: graph.metadata ?? {},
      llmHints: graph.llm_hints ?? {},
      nodes: nodes
        .filter((node) => node.graph_id === graph.id)
        .map((node) => ({
          id: node.id,
          key: node.key,
          type: node.node_type,
          title: node.title,
          position: {
            x: Number(node.position_x),
            y: Number(node.position_y),
          },
          body: node.body ?? {},
          condition: node.condition_expr,
          effects: node.effect_ops ?? [],
          ports: node.ports ?? [],
          metadata: node.metadata ?? {},
        })),
      edges: edges
        .filter((edge) => edge.graph_id === graph.id)
        .map((edge) => ({
          id: edge.id,
          key: edge.key,
          source: {
            nodeKey: edge.source_node_key,
            portId: edge.source_port,
          },
          target: {
            nodeKey: edge.target_node_key,
            portId: edge.target_port,
          },
          label: edge.label,
          condition: edge.condition_expr,
          metadata: edge.metadata ?? {},
        })),
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      key: asset.key,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mime_type,
      storagePath: asset.storage_path,
      metadata: asset.metadata ?? {},
      llmHints: asset.llm_hints ?? {},
    })),
    patchSets: patchSetsResponse.data ?? [],
    releases: (releasesResponse.data ?? []).map((release) => ({
      id: release.id,
      version: release.version,
      label: release.label,
      createdAt: release.created_at,
    })),
  })

  return {
    snapshot,
    source: 'supabase',
  }
}

export async function proposePatch(prompt: string, snapshot: ProjectSnapshot): Promise<{
  summary: string
  operations: PatchOperation[]
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    const response = await supabase.functions.invoke('prompt-patch', {
      body: {
        prompt,
        snapshot,
      },
    })

    if (!response.error && response.data) {
      return response.data as { summary: string; operations: PatchOperation[] }
    }
  }

  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'generated'

  const kind = prompt.toLowerCase().includes('market')
    ? 'market'
    : prompt.toLowerCase().includes('quest')
      ? 'quest'
      : 'narrative_flow'

  return {
    summary: `Draft patch generated from prompt: ${prompt.slice(0, 80)}`,
    operations: [
      {
        op: 'create_definition',
        kind,
        key: `${kind}.${slug}`,
        payload: {
          name: slug
            .split('_')
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' '),
          summary: 'Review and refine this generated definition before applying it.',
        },
      },
    ] as PatchOperation[],
  }
}

export async function compileSnapshot(snapshot: ProjectSnapshot) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    const releaseVersion = `draft-${snapshot.draft.version}-${Date.now()}`
    const response = await supabase.functions.invoke('publish-release', {
      body: {
        snapshot,
        label: `${snapshot.project.name} draft preview`,
        version: releaseVersion,
      },
    })

    if (!response.error && response.data?.bundle) {
      return response.data.bundle
    }
  }

  return compileBundle(snapshot)
}

async function getDefinitionIds(draftId: string): Promise<string[]> {
  const response = await supabase
    .from('project_definitions')
    .select('id')
    .eq('draft_id', draftId)

  return (response.data ?? []).map((row) => row.id)
}
