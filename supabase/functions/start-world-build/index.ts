import '@supabase/functions-js/edge-runtime.d.ts'

import { buildCinematicSequenceFromScriptDoc, cinematicScriptDocSchema } from '../../../src/domain/cinematics.ts'
import {
  WORLD_BUILD_ENVIRONMENT_VIEWS,
  getResourceGenerationMetadata,
  type WorldBuildPlanItem,
  worldBuildBatchSchema,
  worldBuildJobSchema,
  worldBuildStartRequestSchema,
  worldBuildStatusResponseSchema,
} from '../../../src/domain/worldBuild.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  buildDefaultDefinitionComponents,
  createGraphScaffold,
  type ComponentEnvelope,
  type DefinitionKind,
  type GraphScaffold,
} from '../_shared/world-build-placeholders.ts'
import { slugifyWorldBuildName, uniqueWorldBuildKey } from '../_shared/world-build.ts'

// Hosted bundling for this function depends on the entrypoint hash changing when shared
// world-build request/response contracts change.

type PlaceholderAsset = {
  key: string
  name: string
  metadata: Record<string, unknown>
}

type ExistingRemoteResourceRow = {
  key: string
  metadata: unknown
}

type ExistingKeyState = {
  occupiedKeys: Set<string>
  reclaimableKeys: Set<string>
  reclaimedKeys: Set<string>
}

type WorldBuildStartSnapshot = {
  project: { id: string }
  draft: { id: string }
  definitions: Array<{ key: string }>
  graphs: Array<{ key: string }>
  assets: Array<{ key: string }>
}

const SHOULD_GENERATE_CINEMATIC_REFERENCE_ASSETS = false

function createGenerationMetadata(batchId: string, jobId: string) {
  return {
    batchId,
    jobId,
    state: 'pending',
    placeholder: true,
    source: 'global_prompt',
  }
}

async function updateBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_batches').update(changes).eq('id', batchId)
  if (response.error) throw new Error(response.error.message)
}

function updateComponentConfig(
  components: ComponentEnvelope[],
  componentType: string,
  updater: (config: Record<string, unknown>) => Record<string, unknown>,
) {
  return components.map((component) =>
    component.type === componentType
      ? { ...component, config: updater(component.config as Record<string, unknown>) }
      : component,
  )
}

function buildWorldBuildKey(seed: string, keyState: ExistingKeyState) {
  const key = uniqueWorldBuildKey(keyState.occupiedKeys, seed)
  keyState.occupiedKeys.add(key)
  if (keyState.reclaimableKeys.has(key)) {
    keyState.reclaimedKeys.add(key)
  }
  return key
}

function buildDefinitionKey(kind: DefinitionKind, name: string, keyState: ExistingKeyState) {
  const baseKey = `${kind}.${slugifyWorldBuildName(name) || 'generated'}`
  return buildWorldBuildKey(baseKey, keyState)
}

function buildGraphKey(name: string, keyState: ExistingKeyState) {
  const baseKey = `graph.${slugifyWorldBuildName(name) || 'generated'}`
  return buildWorldBuildKey(baseKey, keyState)
}

function buildAssetKey(name: string, suffix: string, keyState: ExistingKeyState) {
  const baseKey = `image.${slugifyWorldBuildName(`${name}_${suffix}`) || `generated_${suffix}`}`
  return buildWorldBuildKey(baseKey, keyState)
}

function createExistingKeyState(localKeys: string[], remoteRows: ExistingRemoteResourceRow[]) {
  const localKeySet = new Set(localKeys)
  const occupiedKeys = new Set(localKeys)
  const reclaimableKeys = new Set<string>()

  for (const row of remoteRows) {
    const generation = getResourceGenerationMetadata({ metadata: row.metadata })
    const reclaimable = !localKeySet.has(row.key) && generation?.source === 'global_prompt'
    if (reclaimable) {
      reclaimableKeys.add(row.key)
      continue
    }
    occupiedKeys.add(row.key)
  }

  return {
    occupiedKeys,
    reclaimableKeys,
    reclaimedKeys: new Set<string>(),
  }
}

async function loadExistingWorldBuildKeys(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  projectId: string,
) {
  const [definitionsResponse, graphsResponse, assetsResponse] = await Promise.all([
    client.from('project_definitions').select('key, metadata').eq('draft_id', draftId),
    client.from('draft_graphs').select('key, metadata').eq('draft_id', draftId),
    client.from('project_assets').select('key, metadata').eq('project_id', projectId),
  ])

  if (definitionsResponse.error || graphsResponse.error || assetsResponse.error) {
    throw new Error(
      definitionsResponse.error?.message
      ?? graphsResponse.error?.message
      ?? assetsResponse.error?.message
      ?? 'Failed to load existing world-build keys.',
    )
  }

  return {
    definitionRows: ((definitionsResponse.data ?? []) as Array<{ key: string; metadata: unknown }>).map((row) => ({ key: row.key, metadata: row.metadata })),
    graphRows: ((graphsResponse.data ?? []) as Array<{ key: string; metadata: unknown }>).map((row) => ({ key: row.key, metadata: row.metadata })),
    assetRows: ((assetsResponse.data ?? []) as Array<{ key: string; metadata: unknown }>).map((row) => ({ key: row.key, metadata: row.metadata })),
  }
}

async function deleteReclaimedPlaceholderRows(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  projectId: string,
  keyState: {
    definitions: ExistingKeyState
    graphs: ExistingKeyState
    assets: ExistingKeyState
  },
) {
  const reclaimedDefinitionKeys = [...keyState.definitions.reclaimedKeys]
  const reclaimedGraphKeys = [...keyState.graphs.reclaimedKeys]
  const reclaimedAssetKeys = [...keyState.assets.reclaimedKeys]

  if (reclaimedDefinitionKeys.length > 0) {
    const response = await client.from('project_definitions').delete().eq('draft_id', draftId).in('key', reclaimedDefinitionKeys)
    if (response.error) throw new Error(response.error.message)
  }

  if (reclaimedGraphKeys.length > 0) {
    const response = await client.from('draft_graphs').delete().eq('draft_id', draftId).in('key', reclaimedGraphKeys)
    if (response.error) throw new Error(response.error.message)
  }

  if (reclaimedAssetKeys.length > 0) {
    const response = await client.from('project_assets').delete().eq('project_id', projectId).in('key', reclaimedAssetKeys)
    if (response.error) throw new Error(response.error.message)
  }
}

async function insertPlaceholderAsset(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  projectId: string,
  userId: string,
  asset: PlaceholderAsset,
) {
  const response = await client.from('project_assets').insert({
    project_id: projectId,
    key: asset.key,
    name: asset.name,
    kind: 'image',
    mime_type: 'image/png',
    storage_path: `world-build/${asset.key}.png`,
    metadata: asset.metadata,
    llm_hints: {},
    created_by: userId,
  }).select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints').single()

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? `Failed to create placeholder asset ${asset.key}.`)
  }

  return {
    id: response.data.id,
    key: response.data.key,
    name: response.data.name,
    kind: response.data.kind,
    mimeType: response.data.mime_type,
    storagePath: response.data.storage_path,
    metadata: response.data.metadata ?? {},
    llmHints: response.data.llm_hints ?? {},
  }
}

async function insertPlaceholderDefinition(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  userId: string,
  definition: {
    key: string
    kind: DefinitionKind
    name: string
    summary: string
    iconAssetKey?: string | null
    metadata: Record<string, unknown>
    assetRefs: Array<Record<string, unknown>>
    components: ComponentEnvelope[]
  },
) {
  const created = await client.from('project_definitions').insert({
    draft_id: draftId,
    key: definition.key,
    kind: definition.kind,
    name: definition.name,
    summary: definition.summary,
    status: 'draft',
    icon_asset_key: definition.iconAssetKey ?? null,
    archetype_key: null,
    tags: [],
    schema_version: 1,
    metadata: definition.metadata,
    llm_hints: {},
    asset_refs: definition.assetRefs,
    definition_data: {},
    created_by: userId,
    updated_by: userId,
  }).select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data').single()

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? `Failed to create placeholder definition ${definition.key}.`)
  }

  if (definition.components.length > 0) {
    const componentInsert = await client.from('project_definition_components').insert(
      definition.components.map((component) => ({
        definition_id: created.data.id,
        component_type: component.type,
        config: component.config,
      })),
    )

    if (componentInsert.error) {
      throw new Error(componentInsert.error.message)
    }
  }

  return {
    id: created.data.id,
    key: created.data.key,
    kind: created.data.kind,
    name: created.data.name,
    summary: created.data.summary ?? '',
    status: created.data.status,
    iconAssetKey: created.data.icon_asset_key,
    archetypeKey: created.data.archetype_key,
    tags: created.data.tags ?? [],
    schemaVersion: created.data.schema_version ?? 1,
    metadata: created.data.metadata ?? {},
    llmHints: created.data.llm_hints ?? {},
    assetRefs: created.data.asset_refs ?? [],
    definitionData: created.data.definition_data ?? {},
    fieldValues: [],
    customFields: [],
    components: definition.components,
  }
}

async function insertPlaceholderGraph(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  userId: string,
  graph: GraphScaffold,
) {
  const created = await client.from('draft_graphs').insert({
    draft_id: draftId,
    key: graph.key,
    name: graph.name,
    graph_type: graph.graphType,
    summary: graph.summary,
    entry_node_key: graph.entryNodeKey,
    metadata: graph.metadata,
    llm_hints: graph.llmHints,
    created_by: userId,
    updated_by: userId,
  }).select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints').single()

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? `Failed to create placeholder graph ${graph.key}.`)
  }

  if (graph.nodes.length > 0) {
    const nodeInsert = await client.from('draft_graph_nodes').insert(
      graph.nodes.map((node) => ({
        graph_id: created.data.id,
        key: node.key,
        node_type: node.type,
        title: node.title,
        template_key: node.templateKey,
        subtitle: node.subtitle,
        position_x: node.position.x,
        position_y: node.position.y,
        body: node.body,
        condition_expr: node.condition,
        effect_ops: node.effects,
        ports: node.ports,
        display: node.display,
        metadata: { ...(node.metadata ?? {}), templateKey: node.templateKey, subtitle: node.subtitle, display: node.display },
      })),
    )

    if (nodeInsert.error) {
      throw new Error(nodeInsert.error.message)
    }
  }

  if (graph.edges.length > 0) {
    const edgeInsert = await client.from('draft_graph_edges').insert(
      graph.edges.map((edge) => ({
        graph_id: created.data.id,
        key: edge.key,
        source_node_key: edge.source.nodeKey,
        source_port: edge.source.portId,
        target_node_key: edge.target.nodeKey,
        target_port: edge.target.portId,
        label: edge.label,
        condition_expr: edge.condition,
        metadata: edge.metadata,
      })),
    )

    if (edgeInsert.error) {
      throw new Error(edgeInsert.error.message)
    }
  }

  return {
    ...graph,
    id: created.data.id,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-world-build')
    const payload = worldBuildStartRequestSchema.parse(await request.json())
    const snapshot = payload.snapshot as WorldBuildStartSnapshot
    const normalizedCinematicPlan =
      payload.plannerMode === 'cinematic_build' && payload.cinematicPlan
        ? {
            ...payload.cinematicPlan,
            autoRun: false,
          }
        : payload.cinematicPlan ?? null
    const enabledItems = payload.planItems.filter((item) => item.enabled)

    const batchInsert = await client.from('world_build_batches').insert({
      draft_id: snapshot.draft.id,
      project_id: snapshot.project.id,
      prompt: payload.prompt,
      request_summary: payload.requestSummary,
      planner_mode: payload.plannerMode,
      plan_json: payload.planItems,
      cinematic_plan: normalizedCinematicPlan,
      status: enabledItems.length > 0 ? 'running' : 'completed',
      diagnostics: [],
      created_by: user.id,
    }).select('id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, plan_json, cinematic_plan, created_at, updated_at').single()

    if (batchInsert.error || !batchInsert.data) {
      throw new Error(batchInsert.error?.message ?? 'Failed to create world build batch.')
    }

    const batchId = batchInsert.data.id
    const existingRemoteKeys = await loadExistingWorldBuildKeys(client, snapshot.draft.id, snapshot.project.id)
    const definitionKeyState = createExistingKeyState(snapshot.definitions.map((definition) => definition.key), existingRemoteKeys.definitionRows)
    const graphKeyState = createExistingKeyState(snapshot.graphs.map((graph) => graph.key), existingRemoteKeys.graphRows)
    const assetKeyState = createExistingKeyState(snapshot.assets.map((asset) => asset.key), existingRemoteKeys.assetRows)
    const jobsToInsert: Array<Record<string, unknown>> = []
    const planJobIds = new Map<string, string>()
    const planTargetKeys = new Map<string, Record<string, string>>()
    const assetJobIds = new Map<string, string>()
    const cinematicCompositeAssetKeys = new Map<string, string>()
    const cinematicStoryboardAssetKeys = new Map<string, string>()
    const orderSeed = { value: 0 }

    function nextOrder() {
      orderSeed.value += 1
      return orderSeed.value
    }

    for (const item of enabledItems) {
      if (item.kind === 'narrative_graph' || item.kind === 'cinematic_graph') continue

      const definitionJobId = crypto.randomUUID()
      const definitionKey = buildDefinitionKey(item.kind === 'character' ? 'character' : item.kind === 'environment' ? 'environment' : 'item', item.name, definitionKeyState)
      planJobIds.set(item.id, definitionJobId)
      planTargetKeys.set(item.id, { definitionKey })
      jobsToInsert.push({
        id: definitionJobId,
        batch_id: batchId,
        plan_item_id: item.id,
        kind: `${item.kind}_definition`,
        status: 'queued',
        depends_on_job_ids: [],
        target_keys: { definitionKey },
        prompt: payload.prompt,
        options: item.generationOptions,
        result_context: null,
        error_message: null,
        order_index: nextOrder(),
      })
      if ((item.kind === 'character' || item.kind === 'item') && item.generationOptions.generateConceptImage) {
        const assetKey = buildAssetKey(item.name, 'concept', assetKeyState)
        const assetJobId = crypto.randomUUID()
        jobsToInsert.push({
          id: assetJobId,
          batch_id: batchId,
          plan_item_id: item.id,
          kind: `${item.kind}_concept_image`,
          status: 'queued',
          depends_on_job_ids: [definitionJobId],
          target_keys: { definitionKey, assetKey },
          prompt: payload.prompt,
          options: item.generationOptions,
          result_context: null,
          error_message: null,
          order_index: nextOrder(),
        })
        assetJobIds.set(assetKey, assetJobId)
        planTargetKeys.set(item.id, { definitionKey, assetKey })
      }

      if (item.kind === 'environment' && item.generationOptions.generateConceptGallery) {
        const targetKeys = { definitionKey } as Record<string, string>
        for (const view of item.generationOptions.environmentViews ?? WORLD_BUILD_ENVIRONMENT_VIEWS) {
          const assetKey = buildAssetKey(item.name, view, assetKeyState)
          const assetJobId = crypto.randomUUID()
          targetKeys[`assetKey:${view}`] = assetKey
          jobsToInsert.push({
            id: assetJobId,
            batch_id: batchId,
            plan_item_id: item.id,
            kind: 'environment_concept_image',
            status: 'queued',
            depends_on_job_ids: [definitionJobId],
            target_keys: { definitionKey, assetKey, view },
            prompt: payload.prompt,
            options: { ...item.generationOptions, view },
            result_context: null,
            error_message: null,
            order_index: nextOrder(),
          })
          assetJobIds.set(assetKey, assetJobId)
        }
        planTargetKeys.set(item.id, targetKeys)
      }
    }

    for (const item of enabledItems.filter((entry) => entry.kind === 'narrative_graph')) {
      const graphJobId = crypto.randomUUID()
      const graphKey = buildGraphKey(item.name, graphKeyState)
      const dependsOnJobIds = item.dependsOn.map((planItemId) => planJobIds.get(planItemId)).filter((value): value is string => Boolean(value))
      jobsToInsert.push({
        id: graphJobId,
        batch_id: batchId,
        plan_item_id: item.id,
        kind: 'narrative_graph',
        status: 'queued',
        depends_on_job_ids: dependsOnJobIds,
        target_keys: { graphKey },
        prompt: payload.prompt,
        options: item.generationOptions,
        result_context: null,
        error_message: null,
        order_index: nextOrder(),
      })
      planJobIds.set(item.id, graphJobId)
      planTargetKeys.set(item.id, { graphKey })
    }

    for (const item of enabledItems.filter((entry) => entry.kind === 'cinematic_graph')) {
      const dependencyJobIds = item.dependsOn
        .map((planItemId) => planJobIds.get(planItemId))
        .filter((value): value is string => Boolean(value))
      const graphDependencyJobIds = [...dependencyJobIds]

      if (normalizedCinematicPlan) {
        if (SHOULD_GENERATE_CINEMATIC_REFERENCE_ASSETS) {
          for (const composite of normalizedCinematicPlan.compositeRefPlans) {
            const assetKey = buildAssetKey(composite.title, 'composite', assetKeyState)
            const assetJobId = crypto.randomUUID()
            cinematicCompositeAssetKeys.set(composite.id, assetKey)
            assetJobIds.set(assetKey, assetJobId)
            jobsToInsert.push({
              id: assetJobId,
              batch_id: batchId,
              plan_item_id: item.id,
              kind: 'cinematic_composite_image',
              status: 'queued',
              depends_on_job_ids: dependencyJobIds,
              target_keys: { compositeRefId: composite.id, assetKey },
              prompt: payload.prompt,
              options: { compositeRefId: composite.id },
              result_context: null,
              error_message: null,
              order_index: nextOrder(),
            })
          }

          if (normalizedCinematicPlan.storyboardPlan && normalizedCinematicPlan.storyboardPlan.mode !== 'none') {
            const sequenceAssetKey = buildAssetKey(item.name, 'storyboard_sequence', assetKeyState)
            const sequenceJobId = crypto.randomUUID()
            cinematicStoryboardAssetKeys.set('storyboard_sequence', sequenceAssetKey)
            assetJobIds.set(sequenceAssetKey, sequenceJobId)
            jobsToInsert.push({
              id: sequenceJobId,
              batch_id: batchId,
              plan_item_id: item.id,
              kind: 'cinematic_storyboard_image',
              status: 'queued',
              depends_on_job_ids: dependencyJobIds,
              target_keys: { storyboardAssetId: 'storyboard_sequence', assetKey: sequenceAssetKey },
              prompt: payload.prompt,
              options: { storyboardAssetId: 'storyboard_sequence' },
              result_context: null,
              error_message: null,
              order_index: nextOrder(),
            })

            for (const panel of normalizedCinematicPlan.storyboardPlan.panels) {
              const assetKey = buildAssetKey(panel.title || panel.id, 'storyboard_panel', assetKeyState)
              const panelJobId = crypto.randomUUID()
              cinematicStoryboardAssetKeys.set(panel.id, assetKey)
              assetJobIds.set(assetKey, panelJobId)
              jobsToInsert.push({
                id: panelJobId,
                batch_id: batchId,
                plan_item_id: item.id,
                kind: 'cinematic_storyboard_image',
                status: 'queued',
                depends_on_job_ids: dependencyJobIds,
                target_keys: { storyboardAssetId: panel.id, assetKey, shotId: panel.shotId ?? '' },
                prompt: payload.prompt,
                options: { storyboardAssetId: panel.id, shotId: panel.shotId ?? '' },
                result_context: null,
                error_message: null,
                order_index: nextOrder(),
              })
            }
          }
        }
      }

      const graphJobId = crypto.randomUUID()
      const graphKey = buildGraphKey(item.name, graphKeyState)
      jobsToInsert.push({
        id: graphJobId,
        batch_id: batchId,
        plan_item_id: item.id,
        kind: 'cinematic_graph',
        status: 'queued',
        depends_on_job_ids: graphDependencyJobIds,
        target_keys: { graphKey },
        prompt: payload.prompt,
        options: item.generationOptions,
        result_context: null,
        error_message: null,
        order_index: nextOrder(),
      })
      planJobIds.set(item.id, graphJobId)
      planTargetKeys.set(item.id, { graphKey })
    }

    if (jobsToInsert.length > 0) {
      const jobsInsert = await client.from('world_build_jobs').insert(jobsToInsert)
      if (jobsInsert.error) {
        throw new Error(jobsInsert.error.message)
      }
    }

    await deleteReclaimedPlaceholderRows(client, snapshot.draft.id, snapshot.project.id, {
      definitions: definitionKeyState,
      graphs: graphKeyState,
      assets: assetKeyState,
    })

    const createdAssets: Awaited<ReturnType<typeof insertPlaceholderAsset>>[] = []
    const createdDefinitions: Awaited<ReturnType<typeof insertPlaceholderDefinition>>[] = []
    const createdGraphs: Awaited<ReturnType<typeof insertPlaceholderGraph>>[] = []
    const persistedCinematicPlan = normalizedCinematicPlan
      ? {
          ...normalizedCinematicPlan,
          scriptDoc: normalizedCinematicPlan.scriptDoc
            ? cinematicScriptDocSchema.parse({
                ...normalizedCinematicPlan.scriptDoc,
                compositeRefs: normalizedCinematicPlan.scriptDoc.compositeRefs.map((composite) => ({
                  ...composite,
                  outputAssetKey: cinematicCompositeAssetKeys.get(composite.id) ?? composite.outputAssetKey ?? null,
                })),
                storyboard: normalizedCinematicPlan.scriptDoc.storyboard
                  ? {
                      ...normalizedCinematicPlan.scriptDoc.storyboard,
                      sequenceAssetKey: cinematicStoryboardAssetKeys.get('storyboard_sequence')
                        ?? normalizedCinematicPlan.scriptDoc.storyboard.sequenceAssetKey
                        ?? null,
                      panels: normalizedCinematicPlan.scriptDoc.storyboard.panels.map((panel) => ({
                        ...panel,
                        assetKey: cinematicStoryboardAssetKeys.get(panel.id) ?? panel.assetKey ?? null,
                      })),
                    }
                  : null,
              })
            : null,
          compositeRefPlans: normalizedCinematicPlan.compositeRefPlans.map((composite) => ({
            ...composite,
            outputAssetKey: cinematicCompositeAssetKeys.get(composite.id) ?? composite.outputAssetKey ?? null,
          })),
          storyboardPlan: normalizedCinematicPlan.storyboardPlan
            ? {
                ...normalizedCinematicPlan.storyboardPlan,
                sequenceAssetKey: cinematicStoryboardAssetKeys.get('storyboard_sequence')
                  ?? normalizedCinematicPlan.storyboardPlan.sequenceAssetKey
                  ?? null,
                panels: normalizedCinematicPlan.storyboardPlan.panels.map((panel) => ({
                  ...panel,
                  assetKey: cinematicStoryboardAssetKeys.get(panel.id) ?? panel.assetKey ?? null,
                })),
              }
            : null,
        }
      : null

    for (const item of enabledItems) {
      if (item.kind === 'character' || item.kind === 'item' || item.kind === 'environment') {
        const targetKeys = planTargetKeys.get(item.id) ?? {}
        const definitionKey = targetKeys.definitionKey
        const definitionJobId = planJobIds.get(item.id)
        if (!definitionKey || !definitionJobId) continue

        const placeholderAssets: PlaceholderAsset[] = []

        if ((item.kind === 'character' || item.kind === 'item') && targetKeys.assetKey) {
          placeholderAssets.push({
            key: targetKeys.assetKey,
            name: `${item.name} Concept`,
            metadata: {
              generation: createGenerationMetadata(batchId, assetJobIds.get(targetKeys.assetKey) ?? definitionJobId),
              placeholderLabel: 'Pending concept image',
            },
          })
        }

        if (item.kind === 'environment') {
          for (const view of item.generationOptions.environmentViews ?? WORLD_BUILD_ENVIRONMENT_VIEWS) {
            const assetKey = targetKeys[`assetKey:${view}`]
            if (!assetKey) continue
            placeholderAssets.push({
              key: assetKey,
              name: `${item.name} ${view.replace(/_/g, ' ')}`,
              metadata: {
                generation: createGenerationMetadata(batchId, assetJobIds.get(assetKey) ?? definitionJobId),
                placeholderLabel: `Pending ${view.replace(/_/g, ' ')} image`,
                conceptView: view,
              },
            })
          }
        }

        const insertedAssets = await Promise.all(
          placeholderAssets.map((asset) => insertPlaceholderAsset(client, snapshot.project.id, user.id, asset)),
        )
        createdAssets.push(...insertedAssets)

        let components = buildDefaultDefinitionComponents(item.kind === 'character' ? 'character' : item.kind === 'environment' ? 'environment' : 'item')
        let assetRefs: Array<Record<string, unknown>> = []

        if (item.kind === 'character' || item.kind === 'item') {
          const previewAssetKey = targetKeys.assetKey ?? null
          components = updateComponentConfig(components, 'render_3d_binding', (config) => ({
            ...config,
            previewImageAssetKey: previewAssetKey,
            conceptPrompt: item.summary,
            generationPrompt: item.summary,
          }))
        }

        if (item.kind === 'environment') {
          const heroAssetKey = targetKeys['assetKey:hero'] ?? null
          components = updateComponentConfig(components, 'environment_render_binding', (config) => ({
            ...config,
            previewImageAssetKey: heroAssetKey,
            generationPrompt: item.summary,
          }))
          assetRefs = (item.generationOptions.environmentViews ?? WORLD_BUILD_ENVIRONMENT_VIEWS)
            .map((view) => targetKeys[`assetKey:${view}`] ? {
              assetKey: targetKeys[`assetKey:${view}`],
              usage: `concept:${view}`,
              required: false,
            } : null)
            .filter((entry): entry is Record<string, unknown> => entry !== null)
        }

        const definition = await insertPlaceholderDefinition(client, snapshot.draft.id, user.id, {
          key: definitionKey,
          kind: item.kind === 'character' ? 'character' : item.kind === 'environment' ? 'environment' : 'item',
          name: item.name,
          summary: item.summary,
          iconAssetKey:
            item.kind === 'environment'
              ? (targetKeys['assetKey:hero'] ?? null)
              : (targetKeys.assetKey ?? null),
          metadata: {
            generation: createGenerationMetadata(batchId, definitionJobId),
          },
          assetRefs,
          components,
        })
        createdDefinitions.push(definition)
      }

      if (item.kind === 'narrative_graph') {
        const graphJobId = planJobIds.get(item.id)
        const graphKey = planTargetKeys.get(item.id)?.graphKey
        if (!graphJobId || !graphKey) continue
        const graph = createGraphScaffold({
          key: graphKey,
          name: item.name,
          graphType: 'narrative_flow',
          summary: item.summary,
        })
        graph.metadata = {
          generation: createGenerationMetadata(batchId, graphJobId),
        }
        createdGraphs.push(await insertPlaceholderGraph(client, snapshot.draft.id, user.id, graph))
      }

      if (item.kind === 'cinematic_graph') {
        const graphJobId = planJobIds.get(item.id)
        const graphKey = planTargetKeys.get(item.id)?.graphKey
        if (!graphJobId || !graphKey) continue

        const storyboardPlan = normalizedCinematicPlan?.storyboardPlan
        const compositePlans = normalizedCinematicPlan?.compositeRefPlans ?? []
        const placeholderAssets: PlaceholderAsset[] = SHOULD_GENERATE_CINEMATIC_REFERENCE_ASSETS ? [
          ...compositePlans.map((composite) => {
            const assetKey = cinematicCompositeAssetKeys.get(composite.id)
            if (!assetKey) return null
            return {
              key: assetKey,
              name: `${composite.title} Composite`,
              metadata: {
                generation: createGenerationMetadata(batchId, assetJobIds.get(assetKey) ?? graphJobId),
                placeholderLabel: 'Pending composite reference',
                compositeRefId: composite.id,
              },
            }
          }),
          ...(storyboardPlan && storyboardPlan.mode !== 'none'
            ? [
                (() => {
                  const assetKey = cinematicStoryboardAssetKeys.get('storyboard_sequence')
                  if (!assetKey) return null
                  return {
                    key: assetKey,
                    name: `${item.name} Sequence Board`,
                    metadata: {
                      generation: createGenerationMetadata(batchId, assetJobIds.get(assetKey) ?? graphJobId),
                      placeholderLabel: 'Pending storyboard sheet',
                      storyboardAssetId: 'storyboard_sequence',
                    },
                  }
                })(),
                ...storyboardPlan.panels.map((panel) => {
                  const assetKey = cinematicStoryboardAssetKeys.get(panel.id)
                  if (!assetKey) return null
                  return {
                    key: assetKey,
                    name: panel.title || `${item.name} Panel`,
                    metadata: {
                      generation: createGenerationMetadata(batchId, assetJobIds.get(assetKey) ?? graphJobId),
                      placeholderLabel: 'Pending storyboard panel',
                      storyboardAssetId: panel.id,
                      shotId: panel.shotId,
                    },
                  }
                }),
              ]
            : []),
        ].filter((asset): asset is PlaceholderAsset => asset !== null) : []

        if (placeholderAssets.length > 0) {
          const insertedAssets = await Promise.all(
            placeholderAssets.map((asset) => insertPlaceholderAsset(client, snapshot.project.id, user.id, asset)),
          )
          createdAssets.push(...insertedAssets)
        }

        const graph = createGraphScaffold({
          key: graphKey,
          name: item.name,
          graphType: 'cinematic_flow',
          summary: item.summary,
        })
        const scriptDoc = persistedCinematicPlan?.scriptDoc
          ? cinematicScriptDocSchema.parse({
              ...persistedCinematicPlan.scriptDoc,
              compositeRefs: persistedCinematicPlan.scriptDoc.compositeRefs,
              storyboard: persistedCinematicPlan.scriptDoc.storyboard,
            })
          : null
        graph.metadata = {
          generation: createGenerationMetadata(batchId, graphJobId),
          cinematics: persistedCinematicPlan?.graphSettings ?? {},
          cinematicScript: scriptDoc ?? undefined,
          cinematicSequence: persistedCinematicPlan
            ? (scriptDoc
              ? buildCinematicSequenceFromScriptDoc(scriptDoc)
              : {
                  references: [],
                  compositeRefs: persistedCinematicPlan.compositeRefPlans,
                  relationships: persistedCinematicPlan.relationshipRefs,
                  storyboard: persistedCinematicPlan.storyboardPlan ?? null,
                  shots: persistedCinematicPlan.shots,
                })
            : undefined,
        }
        createdGraphs.push(await insertPlaceholderGraph(client, snapshot.draft.id, user.id, graph))
      }
    }

    if (persistedCinematicPlan) {
      await updateBatch(client, batchId, {
        cinematic_plan: persistedCinematicPlan,
      })
    }

    const batch = worldBuildBatchSchema.parse({
      id: batchInsert.data.id,
      projectId: batchInsert.data.project_id,
      draftId: batchInsert.data.draft_id,
      prompt: batchInsert.data.prompt,
      requestSummary: batchInsert.data.request_summary,
      plannerMode: batchInsert.data.planner_mode ?? 'world_build',
      status: batchInsert.data.status,
      diagnostics: batchInsert.data.diagnostics ?? [],
      planItems: batchInsert.data.plan_json ?? [],
      cinematicPlan: persistedCinematicPlan ?? batchInsert.data.cinematic_plan ?? null,
      createdAt: batchInsert.data.created_at,
      updatedAt: batchInsert.data.updated_at,
      jobs: jobsToInsert.map((job) => ({
        id: job.id,
        batchId: batchId,
        planItemId: job.plan_item_id,
        kind: job.kind,
        status: job.status,
        dependsOnJobIds: job.depends_on_job_ids ?? [],
        targetKeys: job.target_keys ?? {},
        prompt: job.prompt ?? '',
        options: job.options ?? {},
        resultContext: null,
        errorMessage: null,
        orderIndex: job.order_index,
        createdAt: batchInsert.data.created_at,
        updatedAt: batchInsert.data.updated_at,
      })),
    })

    return json(worldBuildStatusResponseSchema.parse({
      batch,
      definitions: createdDefinitions,
      graphs: createdGraphs,
      assets: createdAssets,
      cinematicRuns: [],
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start world build.')
  }
})
