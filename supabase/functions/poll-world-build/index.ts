import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import {
  type WorldBuildJob,
  worldBuildBatchSchema,
  worldBuildJobSchema,
  worldBuildPollRequestSchema,
  worldBuildStatusResponseSchema,
} from '../../../src/domain/worldBuild.ts'
import { getArtStylePresetLabel } from '../../../src/domain/artStylePresets.ts'
import { buildCharacterConceptPrompt, extractFalImageUrls } from '../../../src/domain/visualAssetGeneration.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { buildDefaultDefinitionComponents } from '../_shared/world-build-placeholders.ts'
import { runStructuredWorldBuildModel, isTerminalWorldBuildStatus } from '../_shared/world-build.ts'
import { buildAssetSlug } from '../../../src/domain/assets.ts'

const contentGenerationSchema = z.object({
  name: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  characterProfile: z.object({
    subtype: z.enum(['humanoid', 'beast', 'construct', 'undead', 'vehicle', 'spirit']).default('humanoid'),
    bodyClass: z.string().default('humanoid'),
    controlMode: z.enum(['player', 'ai', 'scripted', 'neutral']).default('ai'),
    scaleProfile: z.enum(['small', 'medium', 'large', 'huge']).default('medium'),
  }).optional(),
  render3dBinding: z.object({
    conceptPrompt: z.string().nullable().default(null),
    generationPrompt: z.string().nullable().default(null),
    generationStyle: z.string().nullable().default(null),
  }).optional(),
  physicalItemProfile: z.object({
    physicalSubtype: z.enum(['prop', 'equipment', 'weapon', 'pickup', 'world_object']).default('pickup'),
    worldPlacementRole: z.string().default(''),
    pickupContext: z.string().default(''),
  }).optional(),
  environmentProfile: z.object({
    subtype: z.enum(['interior', 'exterior', 'dungeon', 'settlement', 'wilderness', 'structure', 'biome', 'poi']).default('exterior'),
    biome: z.string().default(''),
    traversalType: z.enum(['walk', 'climb', 'swim', 'fly', 'mixed']).default('walk'),
    isInterior: z.boolean().default(false),
    scaleTier: z.enum(['room', 'site', 'zone', 'region']).default('site'),
  }).optional(),
  environmentRenderBinding: z.object({
    lightingProfile: z.string().default(''),
    generationPrompt: z.string().nullable().default(null),
    generationStyle: z.string().nullable().default(null),
  }).optional(),
  environmentNavigation: z.object({
    entryAnchors: z.array(z.string()).default([]),
    regionMarkers: z.array(z.string()).default([]),
    navigationNotes: z.string().default(''),
  }).optional(),
  environmentSpawnRules: z.object({
    characterKeys: z.array(z.string()).default([]),
    itemKeys: z.array(z.string()).default([]),
    resourceNodeKeys: z.array(z.string()).default([]),
  }).optional(),
  resultContext: z.object({
    title: z.string(),
    summary: z.string(),
    graphHook: z.string().default(''),
    visualDirection: z.string().default(''),
  }),
})

const contentGenerationRawSchema = z.record(z.string(), z.unknown())

type BatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  status: string
  diagnostics: string[] | null
  plan_json: unknown[]
  created_at: string
  updated_at: string
}

type JobRow = {
  id: string
  batch_id: string
  plan_item_id: string
  kind: string
  status: string
  depends_on_job_ids: string[] | null
  target_keys: Record<string, string> | null
  prompt: string
  options: Record<string, unknown> | null
  result_context: Record<string, unknown> | null
  error_message: string | null
  order_index: number
  created_at: string
  updated_at: string
}

type SnapshotComponent = {
  type: string
  config: Record<string, unknown>
}

type SnapshotDefinition = {
  key: string
  kind: string
  name: string
  summary: string
  archetypeKey?: string | null
  components: SnapshotComponent[]
}

type WorldBuildPollSnapshot = z.infer<typeof worldBuildPollRequestSchema>['snapshot'] & {
  definitions: SnapshotDefinition[]
  gameSpec?: {
    theme?: {
      artStylePreset?: string
      artStyleDescription?: string
    }
  } | Record<string, unknown> | null
}

function contentSystemPrompt(kind: string) {
  const profileHint =
    kind === 'character_definition'
      ? [
          'Return exactly one JSON object with keys: name, summary, tags, characterProfile, render3dBinding, resultContext.',
          'characterProfile must contain subtype, bodyClass, controlMode, scaleProfile.',
          'render3dBinding should contain conceptPrompt, generationPrompt, generationStyle.',
        ]
      : kind === 'item_definition'
        ? [
            'Return exactly one JSON object with keys: name, summary, tags, physicalItemProfile, render3dBinding, resultContext.',
            'physicalItemProfile must contain physicalSubtype, worldPlacementRole, pickupContext.',
            'render3dBinding should contain conceptPrompt, generationPrompt, generationStyle.',
          ]
        : [
            'Return exactly one JSON object with keys: name, summary, tags, environmentProfile, environmentRenderBinding, environmentNavigation, environmentSpawnRules, resultContext.',
            'environmentProfile must contain subtype, biome, traversalType, isInterior, scaleTier.',
            'environmentRenderBinding should contain lightingProfile, generationPrompt, generationStyle.',
            'environmentNavigation should contain entryAnchors, regionMarkers, navigationNotes.',
            'environmentSpawnRules should contain characterKeys, itemKeys, resourceNodeKeys.',
          ]

  return [
    'You are generating structured data to complete a GraphCore placeholder definition.',
    'Return JSON only.',
    ...profileHint,
    'resultContext must always be present and must contain title, summary, graphHook, visualDirection.',
    'Do not create IDs or external references beyond the supplied context.',
    `The current placeholder kind is ${kind}.`,
    'Produce concise, implementation-facing content that can directly populate the placeholder.',
    'Favor grounded names, summaries, and generation prompts over lore dumps.',
    'Example resultContext: {"title":"Mage","summary":"A disciplined battle mage with arcane focus.","graphHook":"Can mentor the player in forbidden spells.","visualDirection":"Layered robes, rune-etched staff, cool arcane glow."}',
  ].join('\n')
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

function describeTopLevelKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '<not-an-object>'
  const keys = Object.keys(value as Record<string, unknown>)
  return keys.length > 0 ? keys.join(', ') : '<no-keys>'
}

function conceptPromptFromDefinition(definition: SnapshotDefinition, job: JobRow, snapshot: WorldBuildPollSnapshot) {
  const renderBinding = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'render_3d_binding')
    : null
  const characterProfile = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'character_profile')
    : null
  const environmentBinding = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'environment_render_binding')
    : null
  const artStylePreset = typeof snapshot.gameSpec?.theme?.artStylePreset === 'string' ? snapshot.gameSpec.theme.artStylePreset : null
  const artStyleDescription = typeof snapshot.gameSpec?.theme?.artStyleDescription === 'string' ? snapshot.gameSpec.theme.artStyleDescription : ''
  const visualDescription =
    typeof renderBinding?.config?.conceptPrompt === 'string'
      ? String(renderBinding.config.conceptPrompt)
      : typeof renderBinding?.config?.generationPrompt === 'string'
        ? String(renderBinding.config.generationPrompt)
        : typeof environmentBinding?.config?.generationPrompt === 'string'
          ? String(environmentBinding.config.generationPrompt)
          : typeof definition.summary === 'string'
            ? definition.summary
            : 'Complete the concept art for this placeholder.'
  const visualDirection =
    typeof (job.result_context as { visualDirection?: unknown } | null)?.visualDirection === 'string'
      ? String((job.result_context as { visualDirection: string }).visualDirection)
      : visualDescription
  const view = typeof job.target_keys?.view === 'string' ? job.target_keys.view.replace(/_/g, ' ') : null

  if (job.kind === 'character_concept_image') {
    const subtype =
      typeof characterProfile?.config?.subtype === 'string'
        ? String(characterProfile.config.subtype)
        : null

    return buildCharacterConceptPrompt({
      characterName: definition.name,
      subtype,
      archetypeLabel: typeof definition.archetypeKey === 'string' ? definition.archetypeKey : null,
      artStylePresetLabel: getArtStylePresetLabel(artStylePreset),
      artStyleDescription,
      visualDescription,
    })
  }

  return [
    `Create polished game concept art for ${definition.name}.`,
    typeof definition.summary === 'string' && definition.summary.trim() ? `Summary: ${definition.summary.trim()}.` : null,
    artStylePreset ? `Art style preset: ${artStylePreset}.` : null,
    artStyleDescription ? `Additional art direction: ${artStyleDescription}.` : null,
    view ? `Environment view: ${view}.` : null,
    visualDirection ? `Visual direction: ${visualDirection}.` : null,
    'No text, labels, collage, UI, or watermark.',
  ].filter(Boolean).join(' ')
}

async function loadBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
) {
  const batchResponse = await client
    .from('world_build_batches')
    .select('id, draft_id, project_id, prompt, request_summary, status, diagnostics, plan_json, created_at, updated_at')
    .eq('id', batchId)
    .single()

  if (batchResponse.error || !batchResponse.data) {
    throw new Error(batchResponse.error?.message ?? `World build batch ${batchId} was not found.`)
  }

  const jobsResponse = await client
    .from('world_build_jobs')
    .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, result_context, error_message, order_index, created_at, updated_at')
    .eq('batch_id', batchId)
    .order('order_index', { ascending: true })

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  return {
    batch: batchResponse.data as BatchRow,
    jobs: (jobsResponse.data ?? []) as JobRow[],
  }
}

async function loadBatchResources(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  projectId: string,
  batchId: string,
) {
  const [definitionsResponse, graphsResponse, graphNodesResponse, graphEdgesResponse, assetsResponse] = await Promise.all([
    client
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
    client
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    client
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', projectId)
      .contains('metadata', { generation: { batchId } }),
  ])

  if (definitionsResponse.error || graphsResponse.error || assetsResponse.error || graphNodesResponse.error || graphEdgesResponse.error) {
    throw new Error(
      definitionsResponse.error?.message
      ?? graphsResponse.error?.message
      ?? graphNodesResponse.error?.message
      ?? graphEdgesResponse.error?.message
      ?? assetsResponse.error?.message
      ?? 'Failed to load world build resources.',
    )
  }

  const definitions = await Promise.all((definitionsResponse.data ?? []).map(async (definition) => {
    const componentsResponse = await client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)

    if (componentsResponse.error) {
      throw new Error(componentsResponse.error.message)
    }

    return {
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
      fieldValues: [],
      customFields: [],
      components: (componentsResponse.data ?? []).map((component) => ({
        type: component.component_type,
        config: component.config ?? {},
      })),
    }
  }))

  const graphRows = graphsResponse.data ?? []
  const nodes = graphNodesResponse.data ?? []
  const edges = graphEdgesResponse.data ?? []

  const graphs = graphRows.map((graph) => ({
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
        templateKey: node.template_key,
        subtitle: node.subtitle,
        position: { x: Number(node.position_x), y: Number(node.position_y) },
        body: node.body ?? {},
        condition: node.condition_expr,
        effects: node.effect_ops ?? [],
        ports: node.ports ?? [],
        display: node.display ?? {},
        metadata: node.metadata ?? {},
      })),
    edges: edges
      .filter((edge) => edge.graph_id === graph.id)
      .map((edge) => ({
        id: edge.id,
        key: edge.key,
        source: { nodeKey: edge.source_node_key, portId: edge.source_port },
        target: { nodeKey: edge.target_node_key, portId: edge.target_port },
        label: edge.label,
        condition: edge.condition_expr,
        metadata: edge.metadata ?? {},
      })),
  }))

  const assets = (assetsResponse.data ?? []).map((asset) => ({
    id: asset.id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }))

  return { definitions, graphs, assets }
}

async function updateJob(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  jobId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_jobs').update(changes).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

async function updateBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_batches').update(changes).eq('id', batchId)
  if (response.error) throw new Error(response.error.message)
}

async function upsertDefinitionComponent(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  definitionId: string,
  componentType: string,
  config: Record<string, unknown>,
) {
  const existing = await client
    .from('project_definition_components')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('component_type', componentType)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const update = await client
      .from('project_definition_components')
      .update({ config })
      .eq('definition_id', definitionId)
      .eq('component_type', componentType)
    if (update.error) throw new Error(update.error.message)
    return
  }

  const insert = await client
    .from('project_definition_components')
    .insert({ definition_id: definitionId, component_type: componentType, config })
  if (insert.error) throw new Error(insert.error.message)
}

async function markDefinitionGenerationState(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  definitionKey: string,
  generation: Record<string, unknown>,
) {
  const definitionRow = await client.from('project_definitions').select('metadata').eq('draft_id', draftId).eq('key', definitionKey).maybeSingle()
  if (definitionRow.error || !definitionRow.data) return

  const currentMetadata =
    typeof definitionRow.data.metadata === 'object' && definitionRow.data.metadata !== null
      ? definitionRow.data.metadata as Record<string, unknown>
      : {}

  await client.from('project_definitions').update({
    metadata: {
      ...currentMetadata,
      generation,
    },
  }).eq('draft_id', draftId).eq('key', definitionKey)
}

async function markGraphGenerationState(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  graphKey: string,
  generation: Record<string, unknown>,
) {
  const graphRow = await client.from('draft_graphs').select('metadata').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const currentMetadata =
    typeof graphRow.data.metadata === 'object' && graphRow.data.metadata !== null
      ? graphRow.data.metadata as Record<string, unknown>
      : {}

  await client.from('draft_graphs').update({
    metadata: {
      ...currentMetadata,
      generation,
    },
  }).eq('draft_id', draftId).eq('key', graphKey)
}

function terminalStatusFromJobs(jobs: WorldBuildJob[]) {
  const failed = jobs.some((job) => job.status === 'failed')
  const queuedOrRunning = jobs.some((job) => job.status === 'queued' || job.status === 'running')

  if (queuedOrRunning) return 'running'
  if (failed && jobs.some((job) => job.status === 'succeeded')) return 'completed_with_errors'
  if (failed) return 'failed'
  return 'completed'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'poll-world-build')
    const payload = worldBuildPollRequestSchema.parse(await request.json())
    const snapshot = payload.snapshot as WorldBuildPollSnapshot
    const loaded = await loadBatch(client, payload.batchId)
    let batch = loaded.batch
    let jobs = loaded.jobs

    if (!isTerminalWorldBuildStatus(batch.status)) {
      const jobStatusById = new Map(jobs.map((job) => [job.id, job.status]))
      const skippedJobs = jobs.filter((job) =>
        job.status === 'queued'
        && (job.depends_on_job_ids ?? []).some((dependencyId) => jobStatusById.get(dependencyId) === 'failed' || jobStatusById.get(dependencyId) === 'skipped'),
      )

      for (const job of skippedJobs) {
        await updateJob(client, job.id, { status: 'skipped', error_message: 'Skipped because a dependency failed.' })
      }

      if (skippedJobs.length > 0) {
        const reloaded = await loadBatch(client, payload.batchId)
        batch = reloaded.batch
        jobs = reloaded.jobs
      }

      const readyJobs = jobs
        .filter((job) => job.status === 'queued')
        .filter((job) => (job.depends_on_job_ids ?? []).every((dependencyId) => {
          const dependencyStatus = jobs.find((candidate) => candidate.id === dependencyId)?.status
          return dependencyStatus === 'succeeded' || dependencyStatus === 'skipped'
        }))
        .slice(0, 4)

      for (const job of readyJobs) {
        await updateJob(client, job.id, { status: 'running', error_message: null })

        try {
          if (job.kind.endsWith('_definition')) {
            const definitionKey = job.target_keys?.definitionKey
            const definition = snapshot.definitions.find((entry) => entry.key === definitionKey)
            if (!definitionKey || !definition) throw new Error(`Placeholder definition ${definitionKey ?? 'unknown'} was not found in the client snapshot.`)

            const generated = await runStructuredWorldBuildModel({
              model: payload.model,
              passLabel: `${job.kind} generation`,
              systemText: contentSystemPrompt(job.kind),
              promptContext: {
                worldPrompt: batch.prompt,
                requestSummary: batch.request_summary,
                placeholder: {
                  key: definition.key,
                  kind: definition.kind,
                  name: definition.name,
                  summary: definition.summary,
                  components: definition.components,
                },
                gameSpec: snapshot.gameSpec,
              },
              schema: contentGenerationRawSchema,
              maxOutputTokens: 5000,
            })

            const generatedCheck = contentGenerationSchema.safeParse(generated)
            if (!generatedCheck.success) {
              throw new Error(`${job.kind} generation validation failed. keys=${describeTopLevelKeys(generated)}. ${formatIssues(generatedCheck.error.issues)}`)
            }

            const definitionRow = await client.from('project_definitions').select('id, metadata').eq('draft_id', batch.draft_id).eq('key', definition.key).single()
            if (definitionRow.error || !definitionRow.data) throw new Error(definitionRow.error?.message ?? `Definition ${definition.key} was not found.`)

            const currentMetadata =
              typeof definitionRow.data.metadata === 'object' && definitionRow.data.metadata !== null
                ? definitionRow.data.metadata as Record<string, unknown>
                : {}

            const updateResponse = await client.from('project_definitions').update({
              name: generatedCheck.data.name,
              summary: generatedCheck.data.summary,
              tags: generatedCheck.data.tags,
              metadata: {
                ...currentMetadata,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
              updated_by: user.id,
            }).eq('draft_id', batch.draft_id).eq('key', definition.key)

            if (updateResponse.error) throw new Error(updateResponse.error.message)

            if (generatedCheck.data.characterProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'character_profile', generatedCheck.data.characterProfile)
            }
            if (generatedCheck.data.render3dBinding) {
              const existingRender3d = definition.components.find((component) => component.type === 'render_3d_binding')
              await upsertDefinitionComponent(client, definitionRow.data.id, 'render_3d_binding', {
                ...(existingRender3d?.config ?? buildDefaultDefinitionComponents('character').find((component) => component.type === 'render_3d_binding')?.config ?? {}),
                ...generatedCheck.data.render3dBinding,
              })
            }
            if (generatedCheck.data.physicalItemProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'physical_item_profile', generatedCheck.data.physicalItemProfile)
            }
            if (generatedCheck.data.environmentProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_profile', {
                ...(definition.components.find((component) => component.type === 'environment_profile')?.config ?? {}),
                ...generatedCheck.data.environmentProfile,
              })
            }
            if (generatedCheck.data.environmentRenderBinding) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_render_binding', {
                ...(definition.components.find((component) => component.type === 'environment_render_binding')?.config ?? {}),
                ...generatedCheck.data.environmentRenderBinding,
              })
            }
            if (generatedCheck.data.environmentNavigation) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_navigation', generatedCheck.data.environmentNavigation)
            }
            if (generatedCheck.data.environmentSpawnRules) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_spawn_rules', generatedCheck.data.environmentSpawnRules)
            }

            await updateJob(client, job.id, {
              status: 'succeeded',
              result_context: {
                definitionKey: definition.key,
                kind: definition.kind,
                ...generatedCheck.data.resultContext,
              },
              error_message: null,
            })
          } else if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image' || job.kind === 'environment_concept_image') {
            const definitionKey = job.target_keys?.definitionKey
            const assetKey = job.target_keys?.assetKey
            const definition = snapshot.definitions.find((entry) => entry.key === definitionKey)
            if (!definition || !assetKey) throw new Error(`Placeholder resources for job ${job.id} were not found.`)

            const falResponse = await client.functions.invoke('ai-fal', {
              body: {
                action: 'subscribe',
                model: 'fal-ai/nano-banana-2',
                input: {
                  prompt: conceptPromptFromDefinition(definition, job, snapshot),
                  num_images: 1,
                  aspect_ratio: '1:1',
                  output_format: 'png',
                  resolution: '1K',
                },
                logs: true,
                timeoutMs: 120000,
              },
            })

            if (falResponse.error) {
              throw new Error(falResponse.error.message)
            }

            const falResult = (falResponse.data as {
              data?: unknown
              requestId?: string | null
              model?: string | null
              status?: string | null
              statusData?: unknown
            }) ?? {}
            const data = falResult.data
            const imageUrl = extractFalImageUrls(data)[0] ?? null
            if (!imageUrl) {
              console.error('[GraphCore] world build concept image response contained no usable image URL.', {
                jobId: job.id,
                batchId: batch.id,
                assetKey,
                definitionKey,
                model: falResult.model ?? 'fal-ai/nano-banana-2',
                requestId: falResult.requestId ?? null,
                status: falResult.status ?? null,
                statusData: falResult.statusData ?? null,
                data,
              })
              const topLevelKeys = data && typeof data === 'object' && !Array.isArray(data)
                ? Object.keys(data as Record<string, unknown>).join(', ') || '<no-keys>'
                : '<not-an-object>'
              throw new Error(`The concept image provider returned no image URL. keys=${topLevelKeys}`)
            }

            const assetRow = await client.from('project_assets').select('metadata').eq('project_id', batch.project_id).eq('key', assetKey).single()
            if (assetRow.error || !assetRow.data) throw new Error(assetRow.error?.message ?? `Asset ${assetKey} was not found.`)

            const currentAssetMetadata =
              typeof assetRow.data.metadata === 'object' && assetRow.data.metadata !== null
                ? assetRow.data.metadata as Record<string, unknown>
                : {}

            const assetUpdate = await client.from('project_assets').update({
              storage_path: `external/${buildAssetSlug(imageUrl.replace(/https?:\/\//, '')) || assetKey}`,
              name: job.kind === 'character_concept_image'
                ? `${definition.name} Concept`
                : job.kind === 'item_concept_image'
                  ? `${definition.name} Concept`
                  : `${definition.name} ${String(job.target_keys?.view ?? 'concept').replace(/_/g, ' ')}`,
              metadata: {
                ...currentAssetMetadata,
                generatedBy: job.kind === 'character_concept_image'
                  ? 'character_concept'
                  : job.kind === 'item_concept_image'
                    ? 'item_concept'
                    : 'environment_concept',
                provider: 'fal',
                model: falResult.model ?? 'fal-ai/nano-banana-2',
                requestId: falResult.requestId ?? null,
                prompt: conceptPromptFromDefinition(definition, job, snapshot),
                sourceUrl: imageUrl,
                previewUrl: imageUrl,
                generatedAt: new Date().toISOString(),
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
            }).eq('project_id', batch.project_id).eq('key', assetKey)

            if (assetUpdate.error) throw new Error(assetUpdate.error.message)

            await updateJob(client, job.id, {
              status: 'succeeded',
              result_context: {
                assetKey,
                definitionKey,
                imageUrl,
              },
              error_message: null,
            })
          } else if (job.kind === 'narrative_graph') {
            const graphKey = job.target_keys?.graphKey
            if (!graphKey) throw new Error(`Placeholder graph key was missing for job ${job.id}.`)

            const dependencyContexts = jobs
              .filter((candidate) => (job.depends_on_job_ids ?? []).includes(candidate.id))
              .map((candidate) => candidate.result_context)
              .filter((value): value is Record<string, unknown> => Boolean(value))

            const graphPrompt = [
              `Update the existing placeholder graph "${graphKey}" only.`,
              'Do not create new characters, items, environments, assets, or other definitions.',
              `World prompt: ${batch.prompt}`,
              `Graph brief: ${(batch.plan_json.find((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === job.plan_item_id) as { summary?: string } | undefined)?.summary ?? batch.request_summary}`,
              dependencyContexts.length > 0 ? `Dependencies: ${JSON.stringify(dependencyContexts)}` : null,
            ].filter(Boolean).join('\n')

            const promptPatch = await client.functions.invoke('prompt-patch', {
              body: {
                prompt: graphPrompt,
                snapshot,
                model: payload.model,
                mode: 'orchestrate',
                autoApply: false,
                intent: 'extend_graph',
                phase: 'graph_skeleton',
                targetMode: 'current_graph',
                graphType: 'narrative_flow',
                context: {
                  graphKey,
                  target: 'graph',
                },
                selectionContext: {
                  graphKey,
                  target: 'graph',
                },
              },
            })

            if (promptPatch.error) {
              throw new Error(promptPatch.error.message)
            }

            const proposal = promptPatch.data as { operations?: Array<Record<string, unknown>>; diagnostics?: string[] }
            const operations = Array.isArray(proposal.operations) ? proposal.operations : []
            if (operations.length === 0) {
              throw new Error((proposal.diagnostics ?? []).join(' ') || 'Prompt patch returned no graph operations.')
            }

            const applyResponse = await client.functions.invoke('apply-patch', {
              body: {
                draftId: batch.draft_id,
                operations,
              },
            })

            if (applyResponse.error) {
              throw new Error(applyResponse.error.message)
            }

            const graphRow = await client.from('draft_graphs').select('metadata').eq('draft_id', batch.draft_id).eq('key', graphKey).single()
            if (graphRow.error || !graphRow.data) throw new Error(graphRow.error?.message ?? `Graph ${graphKey} was not found.`)

            const currentGraphMetadata =
              typeof graphRow.data.metadata === 'object' && graphRow.data.metadata !== null
                ? graphRow.data.metadata as Record<string, unknown>
                : {}

            const graphUpdate = await client.from('draft_graphs').update({
              metadata: {
                ...currentGraphMetadata,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
              updated_by: user.id,
            }).eq('draft_id', batch.draft_id).eq('key', graphKey)

            if (graphUpdate.error) throw new Error(graphUpdate.error.message)

            await updateJob(client, job.id, {
              status: 'succeeded',
              result_context: {
                graphKey,
                dependencyContexts,
              },
              error_message: null,
            })
          }
        } catch (jobError) {
          const errorMessage = jobError instanceof Error ? jobError.message : 'World build job failed.'
          await updateJob(client, job.id, {
            status: 'failed',
            error_message: errorMessage,
          })

          if (job.kind.endsWith('_definition') && job.target_keys?.definitionKey) {
            await markDefinitionGenerationState(client, batch.draft_id, job.target_keys.definitionKey, {
              batchId: batch.id,
              jobId: job.id,
              state: 'failed',
              placeholder: false,
              source: 'global_prompt',
            })
          }

          if (job.kind === 'narrative_graph' && job.target_keys?.graphKey) {
            await markGraphGenerationState(client, batch.draft_id, job.target_keys.graphKey, {
              batchId: batch.id,
              jobId: job.id,
              state: 'failed',
              placeholder: false,
              source: 'global_prompt',
            })
          }

          if (job.kind.includes('concept_image') && job.target_keys?.assetKey) {
            const assetRow = await client.from('project_assets').select('metadata').eq('project_id', batch.project_id).eq('key', job.target_keys.assetKey).maybeSingle()
            if (!assetRow.error && assetRow.data) {
              const currentMetadata =
                typeof assetRow.data.metadata === 'object' && assetRow.data.metadata !== null
                  ? assetRow.data.metadata as Record<string, unknown>
                  : {}

              await client.from('project_assets').update({
                metadata: {
                  ...currentMetadata,
                  generation: {
                    batchId: batch.id,
                    jobId: job.id,
                    state: 'failed',
                    placeholder: true,
                    source: 'global_prompt',
                  },
                },
              }).eq('project_id', batch.project_id).eq('key', job.target_keys.assetKey)
            }
          }
        }
      }

      const refreshed = await loadBatch(client, payload.batchId)
      const parsedJobs = refreshed.jobs.map((job) => worldBuildJobSchema.parse({
        id: job.id,
        batchId: job.batch_id,
        planItemId: job.plan_item_id,
        kind: job.kind,
        status: job.status,
        dependsOnJobIds: job.depends_on_job_ids ?? [],
        targetKeys: job.target_keys ?? {},
        prompt: job.prompt ?? '',
        options: job.options ?? {},
        resultContext: job.result_context ?? null,
        errorMessage: job.error_message ?? null,
        orderIndex: job.order_index,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      }))

      const nextStatus = terminalStatusFromJobs(parsedJobs)
      if (nextStatus !== refreshed.batch.status) {
        await updateBatch(client, payload.batchId, { status: nextStatus })
      }
    }

    const finalLoaded = await loadBatch(client, payload.batchId)
    const finalJobs = finalLoaded.jobs.map((job) => worldBuildJobSchema.parse({
      id: job.id,
      batchId: job.batch_id,
      planItemId: job.plan_item_id,
      kind: job.kind,
      status: job.status,
      dependsOnJobIds: job.depends_on_job_ids ?? [],
      targetKeys: job.target_keys ?? {},
      prompt: job.prompt ?? '',
      options: job.options ?? {},
      resultContext: job.result_context ?? null,
      errorMessage: job.error_message ?? null,
      orderIndex: job.order_index,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }))
    const resources = await loadBatchResources(client, finalLoaded.batch.draft_id, finalLoaded.batch.project_id, payload.batchId)

    return json(worldBuildStatusResponseSchema.parse({
      batch: worldBuildBatchSchema.parse({
        id: finalLoaded.batch.id,
        projectId: finalLoaded.batch.project_id,
        draftId: finalLoaded.batch.draft_id,
        prompt: finalLoaded.batch.prompt,
        requestSummary: finalLoaded.batch.request_summary,
        status: finalLoaded.batch.status,
        diagnostics: finalLoaded.batch.diagnostics ?? [],
        planItems: finalLoaded.batch.plan_json ?? [],
        createdAt: finalLoaded.batch.created_at,
        updatedAt: finalLoaded.batch.updated_at,
        jobs: finalJobs,
      }),
      definitions: resources.definitions,
      graphs: resources.graphs,
      assets: resources.assets,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to poll world build.')
  }
})
