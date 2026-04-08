import { compileBundle } from '../domain/compiler'
import { BASELINE_ARCHETYPES, hasMissingBaselineArchetypes } from '../domain/bootstrapSeeds'
import { demoProjectSnapshot } from '../domain/demo-data'
import { createGameSpecFromArchetype } from '../domain/gameArchetypes'
import {
  projectSnapshotSchema,
  type ArchetypeDefinition,
  type AssetDefinition,
  type ComponentEnvelope,
  type DefinitionBase,
  type FieldDefinition,
  type GraphDefinition,
  type PatchOperation,
  type ProjectSnapshot,
} from '../domain/graphcore'
import { buildBootstrapPatch, createDefaultGameSpec } from '../domain/presetCatalog'
import type { PromptPatchRequest, PromptPatchResponse } from '../domain/prompting'
import { supabase } from '../utils/supabase'
import type { FunctionsHttpError, Session } from '@supabase/supabase-js'

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isLiveSnapshot(snapshot: ProjectSnapshot) {
  return isUuidLike(snapshot.workspace.id) && isUuidLike(snapshot.project.id) && isUuidLike(snapshot.draft.id)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function isMissingAbilityEnumError(message: string | undefined) {
  return typeof message === 'string' && message.includes('invalid input value for enum definition_kind: "ability"')
}

function bootstrapSeedFromSession(session: Session) {
  const emailSeed = session.user.email?.split('@')[0] ?? 'graphcore'
  const cleanedSeed = slugify(emailSeed) || 'graphcore'
  return {
    cleanedSeed,
    workspaceName: `${titleCase(cleanedSeed)} Workspace`,
    projectName: `${titleCase(cleanedSeed)} Project`,
  }
}

function shouldBootstrapLiveProject(reason?: string) {
  return [
    'No GraphCore workspace was visible through RLS.',
    'No project data was found yet.',
    'Project exists, but it has no draft yet.',
  ].some((fragment) => reason?.includes(fragment))
}

async function readFunctionsErrorMessage(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return error.message
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return error.message
  }

  try {
    const payload = await context.clone().json() as { error?: string }
    return payload.error ?? error.message
  } catch {
    try {
      const text = await context.clone().text()
      return text || error.message
    } catch {
      return error.message
    }
  }
}

async function readFunctionsErrorPayload<TPayload>(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return null
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return null
  }

  try {
    return await context.clone().json() as TPayload
  } catch {
    return null
  }
}

type SnapshotLoadResult = {
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
}

function sanitizePromptPatchResponse(response: PromptPatchResponse, request: PromptPatchRequest) {
  if (typeof response.debugRawOutput === 'string' && response.debugRawOutput.trim()) {
    console.error('[GraphCore] prompt-patch raw model output', {
      prompt: request.prompt,
      context: request.context,
      model: request.model,
      rawOutput: response.debugRawOutput,
    })
  }

  const { debugRawOutput: _debugRawOutput, ...visibleResponse } = response
  return visibleResponse
}

function prettyNameFromKey(key: string) {
  return key
    .replace(/^[^.]+\./, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function defaultComponentsForKind(kind: DefinitionBase['kind']): ComponentEnvelope[] {
  switch (kind) {
    case 'character':
      return [
        {
          type: 'inventory',
          config: {
            startingItems: [],
            capacityFormula: null,
          },
        },
      ]
    case 'ability':
      return [
        {
          type: 'ability_profile',
          config: {
            targetMode: 'enemy',
            cooldownSeconds: 0,
            castTimeSeconds: 0,
            resourceCostItemKey: null,
            resourceCostQuantity: 0,
            effectOps: [],
          },
        },
      ]
    case 'market':
      return [
        {
          type: 'market_inventory',
          config: {
            trades: [],
          },
        },
      ]
    case 'location':
      return [
        {
          type: 'location_state',
          config: {
            region: 'frontier',
            isUnlockedByDefault: true,
            linkedGraphKeys: [],
            linkedMarketKeys: [],
            unlockTokenKey: null,
          },
        },
      ]
    default:
      return []
  }
}

function localPatchDiagnostics(fallbackReason: string | null) {
  return [
    'Fallback patch generated locally because the prompt backend was unavailable.',
    fallbackReason ? `Reason: ${fallbackReason}` : 'Reason: unknown prompt backend failure.',
  ]
}

async function invokeAuthedFunction<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  session: Session,
) {
  return supabase.functions.invoke<TResponse>(functionName, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
}

async function seedBaselineArchetypesDirect(draftId: string, userId: string) {
  const existingArchetypesResponse = await supabase
    .from('project_archetypes')
    .select('id, key')
    .eq('draft_id', draftId)

  if (existingArchetypesResponse.error) {
    throw new Error(existingArchetypesResponse.error.message)
  }

  const existingArchetypes = existingArchetypesResponse.data ?? []
  const existingByKey = new Map(existingArchetypes.map((row) => [row.key, row.id]))
  const missingSeeds = BASELINE_ARCHETYPES.filter((seed) => !existingByKey.has(seed.key))

  if (missingSeeds.length > 0) {
    const seedRows = (seeds: typeof missingSeeds) =>
      seeds.map((seed) => ({
        draft_id: draftId,
        key: seed.key,
        name: seed.name,
        summary: seed.summary,
        definition_kind: seed.appliesToKind,
        icon_asset_key: seed.iconAssetKey,
        metadata: seed.metadata,
        llm_hints: seed.llmHints,
        created_by: userId,
      }))

    const insertResponse = await supabase
      .from('project_archetypes')
      .insert(seedRows(missingSeeds))
      .select('id, key')

    const recoveredResponse = insertResponse.error && isMissingAbilityEnumError(insertResponse.error.message)
      ? await supabase
          .from('project_archetypes')
          .insert(seedRows(missingSeeds.filter((seed) => seed.appliesToKind !== 'ability')))
          .select('id, key')
      : insertResponse

    if (recoveredResponse.error) {
      throw new Error(recoveredResponse.error.message)
    }

    for (const row of recoveredResponse.data ?? []) {
      existingByKey.set(row.key, row.id)
    }
  }

  const archetypeIds = [...existingByKey.values()]
  if (archetypeIds.length === 0) {
    return false
  }

  const existingFieldsResponse = await supabase
    .from('project_archetype_fields')
    .select('archetype_id, key')
    .eq('draft_id', draftId)
    .not('archetype_id', 'is', null)
    .in('archetype_id', archetypeIds)

  if (existingFieldsResponse.error) {
    throw new Error(existingFieldsResponse.error.message)
  }

  const existingFieldKeys = new Set(
    (existingFieldsResponse.data ?? []).map((row) => `${row.archetype_id}:${row.key}`),
  )

  const fieldRows = BASELINE_ARCHETYPES.flatMap((seed) => {
    const archetypeId = existingByKey.get(seed.key)
    if (!archetypeId) {
      return []
    }

    return seed.fields
      .filter((field) => !existingFieldKeys.has(`${archetypeId}:${field.key}`))
      .map((field) => ({
        draft_id: draftId,
        archetype_id: archetypeId,
        key: field.key,
        label: field.label,
        field_type: field.fieldType,
        description: field.description,
        required: field.required,
        default_value: field.defaultValue,
        constraints: field.constraints,
        sort_order: field.sortOrder,
      }))
  })

  if (fieldRows.length > 0) {
    const insertFieldsResponse = await supabase
      .from('project_archetype_fields')
      .insert(fieldRows)

    if (insertFieldsResponse.error) {
      throw new Error(insertFieldsResponse.error.message)
    }
  }

  return missingSeeds.length > 0 || fieldRows.length > 0
}

type DefinitionRow = {
  id: string
  key: string
  kind: DefinitionBase['kind']
  name: string
  summary: string
  status: DefinitionBase['status']
  icon_asset_key: string | null
  archetype_key: string | null
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

type ArchetypeRow = {
  id: string
  key: string
  name: string
  summary: string
  definition_kind: ArchetypeDefinition['appliesToKind']
  icon_asset_key: string | null
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type FieldRow = {
  id: string
  draft_id: string
  archetype_id: string | null
  definition_id: string | null
  key: string
  label: string
  field_type: FieldDefinition['fieldType']
  description: string | null
  required: boolean
  default_value: string | number | boolean | null
  constraints: Record<string, unknown> | null
  sort_order: number
}

type DefinitionFieldValueRow = {
  definition_id: string
  field_key: string
  value: string | number | boolean | null
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
  template_key: string | null
  subtitle: string | null
  position_x: number
  position_y: number
  body: Record<string, unknown> | null
  condition_expr: Record<string, unknown> | null
  effect_ops: Record<string, unknown>[] | null
  ports: Record<string, unknown>[] | null
  display: Record<string, unknown> | null
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

function prettifyChoiceKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (segment) => segment.toUpperCase())
}

function deriveChoiceBody(
  node: NodeRow,
  graphEdges: EdgeRow[],
) {
  const body = typeof node.body === 'object' && node.body !== null ? { ...node.body } : {}
  const existingChoices = Array.isArray(body.choices) ? body.choices : []

  if (node.node_type !== 'choice' || existingChoices.length > 0) {
    return body
  }

  const ports = Array.isArray(node.ports) ? node.ports : []
  const derivedChoicesFromPorts = ports
    .filter((port) => port && port.direction === 'output' && typeof port.id === 'string' && port.id !== 'out')
    .map((port) => ({
      id: String(port.id),
      label: typeof port.label === 'string' && port.label.trim().length > 0 ? port.label : prettifyChoiceKey(String(port.id)),
    }))

  const derivedChoicesFromEdges = graphEdges
    .filter((edge) => edge.source_node_key === node.key && edge.source_port && edge.source_port !== 'out')
    .map((edge) => ({
      id: String(edge.source_port),
      label: typeof edge.label === 'string' && edge.label.trim().length > 0 ? edge.label : prettifyChoiceKey(String(edge.source_port)),
    }))

  const mergedChoices = new Map<string, { id: string; label: string }>()

  for (const choice of [...derivedChoicesFromPorts, ...derivedChoicesFromEdges]) {
    if (!mergedChoices.has(choice.id)) {
      mergedChoices.set(choice.id, choice)
    }
  }

  return {
    ...body,
    choices: [...mergedChoices.values()],
  }
}

export async function loadProjectSnapshot(): Promise<SnapshotLoadResult> {
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
    .select('id, name, version, is_primary, updated_at, metadata')
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
  const archetypeIds = await getArchetypeIds(draft.id)

  const [
    definitionsResponse,
    componentsResponse,
    archetypesResponse,
    archetypeFieldsResponse,
    customFieldsResponse,
    fieldValuesResponse,
    graphsResponse,
    nodesResponse,
    edgesResponse,
    assetsResponse,
    patchSetsResponse,
    releasesResponse,
  ] = await Promise.all([
    supabase
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_components')
          .select('definition_id, component_type, config')
          .in('definition_id', definitionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('project_archetypes')
      .select('id, key, name, summary, definition_kind, icon_asset_key, metadata, llm_hints')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    archetypeIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('archetype_id', 'is', null)
          .in('archetype_id', archetypeIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    definitionIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('definition_id', 'is', null)
          .in('definition_id', definitionIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_field_values')
          .select('definition_id, field_key, value')
          .in('definition_id', definitionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
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

  if (definitionsResponse.error || archetypesResponse.error) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'The connected project is missing the latest items/archetypes schema. Showing the bundled reference project.',
    }
  }

  const definitions = (definitionsResponse.data as DefinitionRow[] | null) ?? []
  const components = (componentsResponse.data as ComponentRow[] | null) ?? []
  const archetypes = (archetypesResponse.data as ArchetypeRow[] | null) ?? []
  const archetypeFields = (archetypeFieldsResponse.data as FieldRow[] | null) ?? []
  const customFields = (customFieldsResponse.data as FieldRow[] | null) ?? []
  const fieldValues = (fieldValuesResponse.data as DefinitionFieldValueRow[] | null) ?? []
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
      metadata: draft.metadata ?? {},
    },
    gameSpec:
      draft.metadata && typeof draft.metadata === 'object' && draft.metadata !== null && 'gameSpec' in draft.metadata
        ? (draft.metadata as { gameSpec?: unknown }).gameSpec
        : null,
    archetypes: archetypes.map((archetype) => ({
      id: archetype.id,
      key: archetype.key,
      name: archetype.name,
      summary: archetype.summary ?? '',
      appliesToKind: archetype.definition_kind,
      iconAssetKey: archetype.icon_asset_key,
      metadata: archetype.metadata ?? {},
      llmHints: archetype.llm_hints ?? {},
      fields: archetypeFields
        .filter((field) => field.archetype_id === archetype.id)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          fieldType: field.field_type,
          description: field.description ?? '',
          required: field.required,
          defaultValue: field.default_value ?? null,
          constraints: field.constraints ?? {},
          sortOrder: field.sort_order ?? 0,
        })),
    })),
    definitions: definitions.map((definition) => ({
      id: definition.id,
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary ?? '',
      status: definition.status,
      iconAssetKey: definition.icon_asset_key,
      archetypeKey: definition.archetype_key,
      tags: definition.tags ?? [],
      schemaVersion: definition.schema_version ?? 1,
      metadata: definition.metadata ?? {},
      llmHints: definition.llm_hints ?? {},
      assetRefs: definition.asset_refs ?? [],
      definitionData: definition.definition_data ?? {},
      fieldValues: fieldValues
        .filter((fieldValue) => fieldValue.definition_id === definition.id)
        .map((fieldValue) => ({
          fieldKey: fieldValue.field_key,
          value: fieldValue.value ?? null,
        })),
      customFields: customFields
        .filter((field) => field.definition_id === definition.id)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          fieldType: field.field_type,
          description: field.description ?? '',
          required: field.required,
          defaultValue: field.default_value ?? null,
          constraints: field.constraints ?? {},
          sortOrder: field.sort_order ?? 0,
        })),
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
      nodes: (() => {
        const graphNodes = nodes.filter((node) => node.graph_id === graph.id)
        const graphEdges = edges.filter((edge) => edge.graph_id === graph.id)

        return graphNodes
        .map((node) => ({
          id: node.id,
          key: node.key,
          type: node.node_type,
          title: node.title,
          templateKey: node.template_key ?? (typeof node.metadata?.templateKey === 'string' ? node.metadata.templateKey : null),
          subtitle: node.subtitle ?? (typeof node.metadata?.subtitle === 'string' ? node.metadata.subtitle : null),
          position: {
            x: Number(node.position_x),
            y: Number(node.position_y),
          },
          body: deriveChoiceBody(node, graphEdges),
          condition: node.condition_expr,
          effects: node.effect_ops ?? [],
          ports: node.ports ?? [],
          display:
            node.display && typeof node.display === 'object'
              ? node.display
              : node.metadata?.display && typeof node.metadata.display === 'object'
              ? node.metadata.display
              : {},
          metadata: node.metadata ?? {},
        }))
      })(),
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

export async function ensureLiveProjectSnapshot(): Promise<SnapshotLoadResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const initial = await loadProjectSnapshot()

  if (!session || initial.source === 'supabase' || !shouldBootstrapLiveProject(initial.reason)) {
    if (session && initial.source === 'supabase' && hasMissingBaselineArchetypes(initial.snapshot.archetypes)) {
      await seedBaselineArchetypesDirect(initial.snapshot.draft.id, session.user.id)
      return loadProjectSnapshot()
    }

    return initial
  }

  try {
    await bootstrapLiveWorkspace(session)
  } catch (bootstrapError) {
    console.error('[GraphCore] live workspace bootstrap failed during snapshot load.', bootstrapError)
    const message = bootstrapError instanceof Error ? bootstrapError.message : 'Live workspace bootstrap failed.'
    return {
      ...initial,
      reason: `${initial.reason ?? 'Live bootstrap failed.'} ${message}`,
    }
  }

  return loadProjectSnapshot()
}

export async function bootstrapLiveWorkspace(existingSession?: Session): Promise<SnapshotLoadResult> {
  const session =
    existingSession ??
    (
      await supabase.auth.getSession()
    ).data.session

  if (!session) {
    throw new Error('Sign in before creating a live GraphCore workspace.')
  }

  try {
    await bootstrapLiveWorkspaceDirect(session)
  } catch (directBootstrapError) {
    console.error('[GraphCore] direct client bootstrap failed, trying hosted bootstrap fallback.', directBootstrapError)

    const seed = bootstrapSeedFromSession(session)
    const response = await invokeAuthedFunction('bootstrap-workspace', {
      workspaceName: seed.workspaceName,
      projectName: seed.projectName,
    }, session)

    if (response.error) {
      const functionErrorMessage = await readFunctionsErrorMessage(response.error)
      const directMessage = directBootstrapError instanceof Error ? directBootstrapError.message : 'Direct bootstrap failed.'
      throw new Error(`${directMessage} Hosted bootstrap fallback also failed: ${functionErrorMessage}`)
    }
  }

  return loadProjectSnapshot()
}

async function bootstrapLiveWorkspaceDirect(session: Session) {
  const seed = bootstrapSeedFromSession(session)
  const timestampSeed = Date.now().toString(36)

  const workspaceResponse = await supabase
    .from('workspace_memberships')
    .select('role, workspace:workspaces!inner(id, name, slug)')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (workspaceResponse.error) {
    throw new Error(workspaceResponse.error.message)
  }

  const membershipWorkspace = workspaceResponse.data?.workspace as
    | { id: string; name?: string; slug?: string }
    | Array<{ id: string; name?: string; slug?: string }>
    | null
    | undefined

  let workspaceId = Array.isArray(membershipWorkspace)
    ? membershipWorkspace[0]?.id ?? null
    : membershipWorkspace?.id ?? null

  if (!workspaceId) {
    workspaceId = crypto.randomUUID()
    const createdWorkspace = await supabase
      .from('workspaces')
      .insert({
        id: workspaceId,
        name: seed.workspaceName,
        slug: `${seed.cleanedSeed}-${timestampSeed}`,
        summary: 'Live GraphCore workspace bootstrapped from the editor.',
        created_by: session.user.id,
        metadata: {
          bootstrapSource: 'web_app',
          bootstrapVersion: 4,
        },
      })

    if (createdWorkspace.error) {
      throw new Error(createdWorkspace.error?.message ?? 'Workspace creation failed.')
    }

    const membershipInsert = await supabase
      .from('workspace_memberships')
      .insert({
        workspace_id: workspaceId,
        user_id: session.user.id,
        role: 'owner',
      })

    if (membershipInsert.error) {
      throw new Error(membershipInsert.error.message)
    }
  }

  const projectResponse = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (projectResponse.error) {
    throw new Error(projectResponse.error.message)
  }

  let projectId = projectResponse.data?.id ?? null

  if (!projectId) {
    projectId = crypto.randomUUID()
    const createdProject = await supabase
      .from('projects')
      .insert({
        id: projectId,
        workspace_id: workspaceId,
        name: seed.projectName,
        slug: `project-${timestampSeed}`,
        summary: 'Primary GraphCore project created automatically for promptable authoring.',
        visibility: 'private',
        created_by: session.user.id,
        metadata: {
          bootstrapSource: 'web_app',
          bootstrapVersion: 4,
        },
      })

    if (createdProject.error) {
      throw new Error(createdProject.error?.message ?? 'Project creation failed.')
    }
  }

  const draftResponse = await supabase
    .from('project_drafts')
    .select('id')
    .eq('project_id', projectId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftResponse.error) {
    throw new Error(draftResponse.error.message)
  }

  let draftId = draftResponse.data?.id ?? null

  if (!draftResponse.data?.id) {
    draftId = crypto.randomUUID()
    const createdDraft = await supabase
      .from('project_drafts')
      .insert({
        id: draftId,
        project_id: projectId,
        name: 'Main Draft',
        version: 1,
        is_primary: true,
        created_by: session.user.id,
        metadata: {
          bootstrapSource: 'web_app',
          bootstrapVersion: 4,
        },
      })

    if (createdDraft.error) {
      throw new Error(createdDraft.error?.message ?? 'Draft creation failed.')
    }
  }

  if (!draftId) {
    throw new Error('Draft creation failed.')
  }

  await seedBaselineArchetypesDirect(draftId, session.user.id)
}

export async function proposePatch(request: PromptPatchRequest): Promise<PromptPatchResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  let fallbackReason: string | null = null
  const liveSnapshot = isLiveSnapshot(request.snapshot)

  if (session && liveSnapshot) {
    const response = await invokeAuthedFunction<PromptPatchResponse>('prompt-patch', request, session)

    if (!response.error && response.data) {
      return sanitizePromptPatchResponse(response.data as PromptPatchResponse, request)
    }

    if (response.error) {
      const errorPayload = await readFunctionsErrorPayload<Partial<PromptPatchResponse> & { diagnostics?: string[] }>(response.error)
      if (errorPayload && Array.isArray(errorPayload.diagnostics)) {
        return sanitizePromptPatchResponse({
          summary: typeof errorPayload.summary === 'string' ? errorPayload.summary : 'Prompt proposal failed.',
          operations: Array.isArray(errorPayload.operations) ? (errorPayload.operations as PatchOperation[]) : [],
          diagnostics: errorPayload.diagnostics,
          assistantNotes: typeof errorPayload.assistantNotes === 'string' ? errorPayload.assistantNotes : undefined,
          debugRawOutput: typeof errorPayload.debugRawOutput === 'string' ? errorPayload.debugRawOutput : undefined,
        }, request)
      }
    }

    fallbackReason = response.error ? await readFunctionsErrorMessage(response.error) : 'The hosted prompt orchestrator returned no data.'
    console.error('[GraphCore] prompt-patch invocation failed, using local fallback.', {
      reason: fallbackReason,
      request,
      response,
    })
  } else {
    fallbackReason = session
      ? 'The current editor snapshot is the bundled demo project, not a live Supabase draft.'
      : 'No authenticated Supabase session was available.'
    console.error('[GraphCore] prompt-patch skipped, using local fallback.', {
      reason: fallbackReason,
      request,
    })
  }

  const prompt = request.prompt
  const snapshot = request.snapshot
  const context = request.context
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'generated'

  if (request.intent === 'bootstrap_game' || request.phase === 'spec' || request.gameSpec) {
    const bootstrapSpec =
      request.gameSpec
      ?? snapshot.gameSpec
      ?? (request.gameArchetypeId
        ? createGameSpecFromArchetype(request.gameArchetypeId, request.gameConceptPrompt ?? request.prompt)
        : createDefaultGameSpec(
            request.selectedPresetIds?.filter((presetId) => presetId.startsWith('pack.')) ?? ['pack.rpg_core'],
          ))

    return {
      requestSummary: bootstrapSpec.title?.trim()
        ? `Bootstrap ${bootstrapSpec.title}`
        : 'Bootstrap game data layer',
      executionPlan: {
        classification: 'bootstrap',
        requiresDependencies: true,
        dependencyKinds: ['archetype', 'item', 'character', 'ability', 'location', 'market'],
        graphJobCount: 0,
        graphJobs: [],
      },
      activityEntries: [
        {
          phase: 'fallback',
          status: 'completed',
          title: 'Local bootstrap fallback built a starter game spec.',
          detail: request.gameArchetypeId ? `Used ${request.gameArchetypeId} as the top-level game archetype.` : 'Used the default preset pack fallback.',
        },
      ],
      summary: bootstrapSpec.title?.trim()
        ? `Bootstrap ${bootstrapSpec.title}`
        : 'Bootstrap game data layer',
      operations: buildBootstrapPatch(bootstrapSpec),
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestration was unavailable. Generated a deterministic bootstrap patch from the current game spec. ${fallbackReason}`
        : 'Hosted prompt orchestration was unavailable. Generated a deterministic bootstrap patch from the current game spec.',
    }
  }

  const normalizedPrompt = prompt.toLowerCase()

  if (/\b(fire mage|enemy caster|caster enemy|mage enemy)\b/.test(normalizedPrompt)) {
    const enemyKey = `character.${slug}`
    return {
      summary: 'Add caster enemy',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: 'character.enemy_caster' },
        { op: 'instantiate_definition_preset', presetId: 'ability.fireball' },
        {
          op: 'create_definition',
          kind: 'character',
          key: enemyKey,
          payload: {
            name: prettyNameFromKey(enemyKey),
            summary: 'Preset-backed enemy caster with a starter fire spell.',
            archetypeKey: 'character.enemy_caster',
            metadata: { controlledBy: 'ai' },
            components: [
              ...defaultComponentsForKind('character'),
              {
                type: 'ability_loadout',
                config: {
                  entries: [
                    {
                      abilityKey: 'ability.fireball',
                      slotKey: 'primary',
                      inputBinding: null,
                      cooldownGroup: 'offense',
                      unlockTokenKey: null,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback preferred existing presets for the enemy archetype and fire ability.',
    }
  }

  if (/\bmarket\b|\bvendor\b|\bshop\b/.test(normalizedPrompt)) {
    const marketKey = `market.${slug}`
    return {
      summary: 'Add market',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: 'market.vendor_basic' },
        { op: 'instantiate_definition_preset', presetId: 'currency.gold' },
        {
          op: 'create_definition',
          kind: 'market',
          key: marketKey,
          payload: {
            name: prettyNameFromKey(marketKey),
            summary: 'Starter market built from the vendor preset.',
            archetypeKey: 'market.vendor_basic',
            components: [
              {
                type: 'market_inventory',
                config: {
                  trades: [],
                },
              },
            ],
          },
        },
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback created a preset-backed market and ensured a starter currency exists.',
    }
  }

  if (/\blocation\b|\bhub\b|\bsafehouse\b|\bdungeon\b/.test(normalizedPrompt)) {
    const locationPresetId = /\bhub\b/.test(normalizedPrompt)
      ? 'location.hub'
      : /\bsafehouse\b/.test(normalizedPrompt)
        ? 'location.safehouse'
        : 'location.dungeon'
    const locationKey = `location.${slug}`
    const wantsVendor = /\bvendor\b|\bmarket\b|\bshop\b/.test(normalizedPrompt)
    return {
      summary: 'Add location',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: locationPresetId },
        ...(wantsVendor ? [{ op: 'instantiate_archetype_preset', presetId: 'market.vendor_basic' } as PatchOperation] : []),
        ...(wantsVendor ? [{ op: 'instantiate_definition_preset', presetId: 'currency.gold' } as PatchOperation] : []),
        {
          op: 'create_definition',
          kind: 'location',
          key: locationKey,
          payload: {
            name: prettyNameFromKey(locationKey),
            summary: 'Starter location created from the preset library.',
            archetypeKey: locationPresetId,
            components: [
              {
                type: 'location_state',
                config: {
                  region: 'frontier',
                  isUnlockedByDefault: true,
                  linkedGraphKeys: [],
                  linkedMarketKeys: wantsVendor ? [`market.${slug}_vendor`] : [],
                  unlockTokenKey: null,
                },
              },
            ],
          },
        },
        ...(wantsVendor
          ? [{
              op: 'create_definition',
              kind: 'market',
              key: `market.${slug}_vendor`,
              payload: {
                name: `${prettyNameFromKey(locationKey)} Vendor`,
                summary: 'Vendor attached to the generated location.',
                archetypeKey: 'market.vendor_basic',
                components: defaultComponentsForKind('market'),
              },
            } satisfies PatchOperation]
          : []),
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback used location and market presets before inventing new schema.',
    }
  }

  if (normalizedPrompt.includes('archetype')) {
    return {
      summary: `Draft archetype patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_archetype',
          key: `item.${slug}`,
          payload: {
            name: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            summary: 'Review and refine this generated archetype before applying it.',
            appliesToKind: 'item',
          },
        },
        {
          op: 'add_archetype_field',
          key: `item.${slug}`,
          field: {
            id: `field-${slug}-value`,
            key: 'value',
            label: 'Value',
            fieldType: 'number',
            description: 'Primary numeric value for this generated archetype.',
            required: false,
            defaultValue: 0,
            constraints: {},
            sortOrder: 1,
          },
        },
      ] as PatchOperation[],
      diagnostics: [
        ...localPatchDiagnostics(fallbackReason),
      ],
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestrator was unavailable. Local fallback was used instead. ${fallbackReason}`
        : 'Hosted prompt orchestrator was unavailable. Local fallback was used instead.',
    }
  }

  if (request.targetMode === 'new_graph') {
    const graphKey = `graph.${slug}`
    return {
      summary: `Draft graph patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_graph',
          key: graphKey,
          payload: {
            name: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            graphType: request.graphType ?? 'narrative_flow',
            summary: prompt,
          },
        },
        {
          op: 'create_node',
          graphKey,
          node: {
            id: `node-generated-${Date.now()}`,
            key: `${graphKey}.story_text_${slug}`,
            type: 'text',
            title: 'Generated Story Beat',
            templateKey: 'story_text',
            subtitle: null,
            position: { x: 360, y: 220 },
            body: {
              text: 'Review and refine this generated graph node before applying it.',
              imageAssetKey: null,
              audioAssetKey: null,
              choices: [],
            },
            condition: null,
            effects: [],
            ports: [{ id: 'in', label: 'In', direction: 'input' }, { id: 'out', label: 'Out', direction: 'output' }],
            display: { iconAssetKey: null, compactPreview: false },
            metadata: {},
          },
        },
      ] as PatchOperation[],
      diagnostics: [
        ...localPatchDiagnostics(fallbackReason),
      ],
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestrator was unavailable. Local graph fallback was used instead. ${fallbackReason}`
        : 'Hosted prompt orchestrator was unavailable. Local graph fallback was used instead.',
    }
  }

  if (context?.target === 'graph' || context?.target === 'node' || context?.graphKey) {
    const graphKey = context.graphKey ?? snapshot.graphs[0]?.key ?? 'graph.generated'
    return {
      summary: `Draft graph patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_node',
          graphKey,
          node: {
            id: `node-generated-${Date.now()}`,
            key: `${graphKey}.story_text_${slug}`,
            type: 'text',
            title: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            templateKey: 'story_text',
            subtitle: null,
            position: { x: 360, y: 220 },
            body: {
              text: 'Review and refine this generated graph node before applying it.',
              imageAssetKey: null,
              audioAssetKey: null,
              choices: [],
            },
            condition: null,
            effects: [],
            ports: [{ id: 'in', label: 'In', direction: 'input' }, { id: 'out', label: 'Out', direction: 'output' }],
            display: { iconAssetKey: null, compactPreview: false },
            metadata: {},
          },
        },
      ] as PatchOperation[],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'The hosted prompt orchestrator was unavailable, so GraphCore generated a minimal local patch preview.',
    }
  }

  return {
    summary: `Draft patch generated from prompt: ${prompt.slice(0, 80)}`,
    operations: [
      {
        op: 'create_definition',
        kind: 'item',
        key: `item.${slug}`,
        payload: {
          name: slug
            .split('_')
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' '),
          summary: 'Review and refine this generated definition before applying it.',
          components: defaultComponentsForKind('item'),
        },
      },
      {
        op: 'set_archetype',
        key: `item.${slug}`,
        archetypeKey: normalizedPrompt.includes('potion') ? 'item.consumable' : 'item.utility',
      },
    ] as PatchOperation[],
    diagnostics: localPatchDiagnostics(fallbackReason),
    assistantNotes: fallbackReason
      ? `Hosted prompt orchestrator was unavailable. Local fallback was used instead. ${fallbackReason}`
      : 'Hosted prompt orchestrator was unavailable. Local fallback was used instead.',
  }
}

export async function applyPatchProposal(snapshot: ProjectSnapshot, operations: PatchOperation[], patchSetId?: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || !isLiveSnapshot(snapshot)) {
    return { source: 'local' as const }
  }

  const response = await supabase.functions.invoke('apply-patch', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      draftId: snapshot.draft.id,
      patchSetId,
      operations,
    },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return {
    source: 'supabase' as const,
    data: response.data,
  }
}

export async function compileSnapshot(snapshot: ProjectSnapshot) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session && isLiveSnapshot(snapshot)) {
    const releaseVersion = `draft-${snapshot.draft.version}-${Date.now()}`
    const response = await supabase.functions.invoke('publish-release', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
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

async function getArchetypeIds(draftId: string): Promise<string[]> {
  const response = await supabase
    .from('project_archetypes')
    .select('id')
    .eq('draft_id', draftId)

  return (response.data ?? []).map((row) => row.id)
}
