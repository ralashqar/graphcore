import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  materializeArchetypePreset,
  materializeDefinitionPreset,
  materializeGraphPreset,
} from '../../../src/domain/presetCatalog.ts'
import { createAssemblyGraph } from '../../../src/domain/environmentAssembly.ts'
import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

type ApplyPatchPayload = {
  draftId: string
  patchSetId?: string
  operations: Array<Record<string, unknown>>
}

function inferPorts(nodeType: string, choices: Array<Record<string, unknown>> = []) {
  const inputs = nodeType === 'start' ? [] : [{ id: 'in', label: 'In', direction: 'input' }]
  if (nodeType === 'start') return [{ id: 'out', label: 'Out', direction: 'output' }]
  if (nodeType === 'end') return inputs
  if (nodeType === 'condition') return [...inputs, { id: 'true', label: 'True', direction: 'output' }, { id: 'false', label: 'False', direction: 'output' }]
  if (nodeType === 'choice') return [...inputs, ...(choices.length > 0 ? choices.map((choice, index) => ({ id: typeof choice.id === 'string' ? choice.id : `choice_${index + 1}`, label: typeof choice.label === 'string' ? choice.label : `Choice ${index + 1}`, direction: 'output' })) : [{ id: 'out', label: 'Out', direction: 'output' }])]
  if (nodeType === 'branch') return [...inputs, { id: 'branch_a', label: 'Branch A', direction: 'output' }, { id: 'branch_b', label: 'Branch B', direction: 'output' }]
  if (nodeType === 'random') return [...inputs, { id: 'success', label: 'Success', direction: 'output' }, { id: 'fail', label: 'Fail', direction: 'output' }]
  return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
}

function prettifyChoiceKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (segment) => segment.toUpperCase())
}

function graphSuffix(graphKey: string) {
  return graphKey.replace(/^graph\./, '').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'generated'
}

async function getDefinitionId(client: ReturnType<typeof createClient>, draftId: string, key: string) {
  const { data } = await client.from('project_definitions').select('id').eq('draft_id', draftId).eq('key', key).maybeSingle()
  return data?.id ?? null
}

async function getArchetypeId(client: ReturnType<typeof createClient>, draftId: string, key: string) {
  const { data } = await client.from('project_archetypes').select('id').eq('draft_id', draftId).eq('key', key).maybeSingle()
  return data?.id ?? null
}

async function getGraphId(client: ReturnType<typeof createClient>, draftId: string, key: string) {
  const { data } = await client.from('draft_graphs').select('id').eq('draft_id', draftId).eq('key', key).maybeSingle()
  return data?.id ?? null
}

async function getAssemblyGraphId(client: ReturnType<typeof createClient>, draftId: string, key: string) {
  const { data } = await client.from('draft_assembly_graphs').select('id').eq('draft_id', draftId).eq('key', key).maybeSingle()
  return data?.id ?? null
}

async function getEnvironmentBlueprintRowId(client: ReturnType<typeof createClient>, draftId: string, key: string) {
  const { data } = await client.from('draft_environment_blueprints').select('id').eq('draft_id', draftId).eq('key', key).maybeSingle()
  return data?.id ?? null
}

async function upsertDefinitionComponentConfig(
  client: ReturnType<typeof createClient>,
  definitionId: string,
  componentType: string,
  config: Record<string, unknown>,
) {
  const existing = await client
    .from('project_definition_components')
    .select('definition_id, component_type')
    .eq('definition_id', definitionId)
    .eq('component_type', componentType)
    .maybeSingle()

  if (existing.error) return existing

  if (existing.data) {
    return client
      .from('project_definition_components')
      .update({ config })
      .eq('definition_id', definitionId)
      .eq('component_type', componentType)
      .select('definition_id, component_type')
      .single()
  }

  return client
    .from('project_definition_components')
    .insert({
      definition_id: definitionId,
      component_type: componentType,
      config,
    })
    .select('definition_id, component_type')
    .single()
}

async function ensureChoiceSourceHandle(
  client: ReturnType<typeof createClient>,
  graphId: string,
  nodeKey: string,
  sourcePort: string,
  edgeLabel: string | null,
) {
  if (!sourcePort || sourcePort === 'out') return
  const { data: nodeRow } = await client.from('draft_graph_nodes').select('body, ports, node_type').eq('graph_id', graphId).eq('key', nodeKey).maybeSingle()
  if (!nodeRow || nodeRow.node_type !== 'choice') return
  const currentBody = typeof nodeRow.body === 'object' && nodeRow.body !== null ? nodeRow.body as Record<string, unknown> : {}
  const currentChoices = Array.isArray(currentBody.choices) ? currentBody.choices as Array<Record<string, unknown>> : []
  if (currentChoices.some((choice) => choice.id === sourcePort)) return
  const nextChoices = [...currentChoices, { id: sourcePort, label: edgeLabel && edgeLabel.trim().length > 0 ? edgeLabel : prettifyChoiceKey(sourcePort) }]
  await client.from('draft_graph_nodes').update({ body: { ...currentBody, choices: nextChoices }, ports: inferPorts('choice', nextChoices) }).eq('graph_id', graphId).eq('key', nodeKey)
}

async function upsertDraftMetadata(
  client: ReturnType<typeof createClient>,
  draftId: string,
  updater: (metadata: Record<string, unknown>) => Record<string, unknown>,
) {
  const { data, error } = await client.from('project_drafts').select('metadata').eq('id', draftId).single()
  if (error) return { error }
  const metadata = typeof data.metadata === 'object' && data.metadata !== null ? data.metadata as Record<string, unknown> : {}
  return client.from('project_drafts').update({ metadata: updater(metadata) }).eq('id', draftId).select('id').single()
}

async function insertDefinition(client: ReturnType<typeof createClient>, draftId: string, userId: string, definition: Record<string, any>) {
  const created = await client.from('project_definitions').insert({
    draft_id: draftId,
    key: definition.key,
    kind: definition.kind,
    name: definition.name ?? String(definition.key),
    summary: definition.summary ?? '',
    status: definition.status ?? 'draft',
    icon_asset_key: definition.iconAssetKey ?? null,
    archetype_key: definition.archetypeKey ?? null,
    tags: definition.tags ?? [],
    schema_version: definition.schemaVersion ?? 1,
    metadata: definition.metadata ?? {},
    llm_hints: definition.llmHints ?? {},
    asset_refs: definition.assetRefs ?? [],
    definition_data: definition.definitionData ?? {},
    created_by: userId,
    updated_by: userId,
  }).select('id, key').single()
  if (created.error || !created.data) return created

  if (Array.isArray(definition.customFields) && definition.customFields.length > 0) {
    const result = await client.from('project_archetype_fields').insert(definition.customFields.map((field: Record<string, any>) => ({
      draft_id: draftId,
      definition_id: created.data.id,
      key: field.key,
      label: field.label,
      field_type: field.fieldType,
      description: field.description ?? '',
      required: field.required ?? false,
      default_value: field.defaultValue ?? null,
      constraints: field.constraints ?? {},
      sort_order: field.sortOrder ?? 0,
    })))
    if (result.error) return { error: result.error, data: null }
  }

  if (Array.isArray(definition.fieldValues) && definition.fieldValues.length > 0) {
    const result = await client.from('project_definition_field_values').insert(definition.fieldValues.map((fieldValue: Record<string, any>) => ({
      definition_id: created.data.id,
      field_key: fieldValue.fieldKey,
      value: fieldValue.value ?? null,
    })))
    if (result.error) return { error: result.error, data: null }
  }

  if (Array.isArray(definition.components) && definition.components.length > 0) {
    const result = await client.from('project_definition_components').insert(definition.components.map((component: Record<string, any>) => ({
      definition_id: created.data.id,
      component_type: component.type,
      config: component.config ?? {},
    })))
    if (result.error) return { error: result.error, data: null }
  }

  return created
}

async function insertArchetype(client: ReturnType<typeof createClient>, draftId: string, userId: string, archetype: Record<string, any>) {
  const created = await client.from('project_archetypes').insert({
    draft_id: draftId,
    key: archetype.key,
    name: archetype.name ?? String(archetype.key),
    summary: archetype.summary ?? '',
    definition_kind: archetype.appliesToKind ?? 'item',
    icon_asset_key: archetype.iconAssetKey ?? null,
    metadata: archetype.metadata ?? {},
    llm_hints: archetype.llmHints ?? {},
    created_by: userId,
  }).select('id, key').single()
  if (created.error || !created.data) return created

  if (Array.isArray(archetype.fields) && archetype.fields.length > 0) {
    const result = await client.from('project_archetype_fields').insert(archetype.fields.map((field: Record<string, any>) => ({
      draft_id: draftId,
      archetype_id: created.data.id,
      key: field.key,
      label: field.label,
      field_type: field.fieldType,
      description: field.description ?? '',
      required: field.required ?? false,
      default_value: field.defaultValue ?? null,
      constraints: field.constraints ?? {},
      sort_order: field.sortOrder ?? 0,
    })))
    if (result.error) return { error: result.error, data: null }
  }

  return created
}

async function insertGraph(client: ReturnType<typeof createClient>, draftId: string, userId: string, graph: Record<string, any>) {
  const created = await client.from('draft_graphs').insert({
    draft_id: draftId,
    key: graph.key,
    name: graph.name ?? String(graph.key),
    graph_type: graph.graphType ?? 'narrative_flow',
    summary: graph.summary ?? '',
    entry_node_key: graph.entryNodeKey ?? null,
    metadata: graph.metadata ?? {},
    llm_hints: graph.llmHints ?? {},
    created_by: userId,
    updated_by: userId,
  }).select('id, key').single()
  if (created.error || !created.data) return created

  if (Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const nodeResult = await client.from('draft_graph_nodes').insert(graph.nodes.map((node: Record<string, any>) => ({
      graph_id: created.data.id,
      key: node.key,
      node_type: node.type,
      title: node.title,
      template_key: node.templateKey ?? null,
      subtitle: node.subtitle ?? null,
      position_x: node.position?.x ?? 0,
      position_y: node.position?.y ?? 0,
      body: node.body ?? {},
      condition_expr: node.condition ?? null,
      effect_ops: node.effects ?? [],
      ports: node.ports ?? [],
      display: node.display ?? { iconAssetKey: null, compactPreview: false },
      metadata: { ...(node.metadata ?? {}), templateKey: node.templateKey ?? null, subtitle: node.subtitle ?? null, display: node.display ?? { iconAssetKey: null, compactPreview: false } },
    })))
    if (nodeResult.error) return { error: nodeResult.error, data: null }
  }

  if (Array.isArray(graph.edges) && graph.edges.length > 0) {
    const edgeResult = await client.from('draft_graph_edges').insert(graph.edges.map((edge: Record<string, any>) => ({
      graph_id: created.data.id,
      key: edge.key,
      source_node_key: edge.source?.nodeKey,
      source_port: edge.source?.portId ?? null,
      target_node_key: edge.target?.nodeKey,
      target_port: edge.target?.portId ?? null,
      label: edge.label ?? null,
      condition_expr: edge.condition ?? null,
      metadata: edge.metadata ?? {},
    })))
    if (edgeResult.error) return { error: edgeResult.error, data: null }
  }

  return created
}

async function insertAssemblyGraph(client: ReturnType<typeof createClient>, draftId: string, userId: string, graph: Record<string, any>) {
  const created = await client.from('draft_assembly_graphs').insert({
    draft_id: draftId,
    key: graph.key,
    name: graph.name ?? String(graph.key),
    summary: graph.summary ?? '',
    bound_environment_key: graph.boundEnvironmentKey ?? null,
    metadata: graph.metadata ?? {},
    created_by: userId,
    updated_by: userId,
  }).select('id, key').single()
  if (created.error || !created.data) return created

  if (Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const nodeResult = await client.from('draft_assembly_nodes').insert(graph.nodes.map((node: Record<string, any>) => ({
      assembly_graph_id: created.data.id,
      key: node.key,
      kind: node.kind,
      title: node.title,
      subtitle: node.subtitle ?? null,
      position_x: node.position?.x ?? 0,
      position_y: node.position?.y ?? 0,
      ports: node.ports ?? [],
      params: node.params ?? {},
      metadata: node.metadata ?? {},
    })))
    if (nodeResult.error) return { error: nodeResult.error, data: null }
  }

  if (Array.isArray(graph.edges) && graph.edges.length > 0) {
    const edgeResult = await client.from('draft_assembly_edges').insert(graph.edges.map((edge: Record<string, any>) => ({
      assembly_graph_id: created.data.id,
      key: edge.key,
      source_node_key: edge.source?.nodeKey,
      source_port: edge.source?.portId,
      target_node_key: edge.target?.nodeKey,
      target_port: edge.target?.portId,
      metadata: edge.metadata ?? {},
    })))
    if (edgeResult.error) return { error: edgeResult.error, data: null }
  }

  return created
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'apply-patch')
    const payload = (await request.json()) as ApplyPatchPayload
    const results: Array<Record<string, unknown>> = []

    for (const operation of payload.operations) {
      if (operation.op === 'set_game_spec') {
        const result = await upsertDraftMetadata(client, payload.draftId, (metadata) => ({
          ...metadata,
          gameSpec: operation.gameSpec,
          bootstrapStatus: 'complete',
        }))
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ op: operation.op, draftId: payload.draftId })
        continue
      }

      if (operation.op === 'apply_preset_pack') {
        const result = await upsertDraftMetadata(client, payload.draftId, (metadata) => {
          const gameSpec = typeof metadata.gameSpec === 'object' && metadata.gameSpec !== null ? metadata.gameSpec as Record<string, any> : null
          if (!gameSpec) return metadata
          const selectedPresetIds = typeof gameSpec.selectedPresetIds === 'object' && gameSpec.selectedPresetIds !== null ? gameSpec.selectedPresetIds as Record<string, any> : {}
          const packs = Array.isArray(selectedPresetIds.packs) ? selectedPresetIds.packs : []
          return { ...metadata, gameSpec: { ...gameSpec, selectedPresetIds: { ...selectedPresetIds, packs: [...new Set([...packs, operation.packId])] } } }
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ op: operation.op, packId: operation.packId })
        continue
      }

      if (operation.op === 'instantiate_archetype_preset') {
        const archetype = materializeArchetypePreset(String(operation.presetId))
        if (!archetype) return json({ error: `Preset ${String(operation.presetId)} was not found.`, operation }, { status: 400 })
        const existingId = await getArchetypeId(client, payload.draftId, archetype.key)
        if (existingId) {
          results.push({ id: existingId, key: archetype.key })
          continue
        }
        const result = await insertArchetype(client, payload.draftId, user.id, archetype)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'instantiate_definition_preset') {
        const definition = materializeDefinitionPreset(String(operation.presetId), {
          keyOverride: typeof operation.keyOverride === 'string' ? operation.keyOverride : undefined,
          nameOverride: typeof operation.nameOverride === 'string' ? operation.nameOverride : undefined,
        })
        if (!definition) return json({ error: `Preset ${String(operation.presetId)} was not found.`, operation }, { status: 400 })
        const existingId = await getDefinitionId(client, payload.draftId, definition.key)
        if (existingId) {
          results.push({ id: existingId, key: definition.key })
          continue
        }
        const result = await insertDefinition(client, payload.draftId, user.id, definition)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'instantiate_graph_preset') {
        const graph = materializeGraphPreset(String(operation.presetId), {
          keyOverride: typeof operation.keyOverride === 'string' ? operation.keyOverride : undefined,
          nameOverride: typeof operation.nameOverride === 'string' ? operation.nameOverride : undefined,
        })
        if (!graph) return json({ error: `Preset ${String(operation.presetId)} was not found.`, operation }, { status: 400 })
        const existingId = await getGraphId(client, payload.draftId, graph.key)
        if (existingId) {
          results.push({ id: existingId, key: graph.key })
          continue
        }
        const result = await insertGraph(client, payload.draftId, user.id, graph)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'create_definition') {
        const result = await insertDefinition(client, payload.draftId, user.id, {
          key: operation.key,
          kind: operation.kind,
          ...(typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}),
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_definition') {
        const changes = (operation.changes as Record<string, unknown> | undefined) ?? {}
        const result = await client.from('project_definitions').update({
          name: typeof changes.name === 'string' ? changes.name : undefined,
          summary: typeof changes.summary === 'string' ? changes.summary : undefined,
          status: typeof changes.status === 'string' ? changes.status : undefined,
          icon_asset_key: typeof changes.iconAssetKey === 'string' || changes.iconAssetKey === null ? changes.iconAssetKey : undefined,
          archetype_key: typeof changes.archetypeKey === 'string' || changes.archetypeKey === null ? changes.archetypeKey : undefined,
          tags: Array.isArray(changes.tags) ? changes.tags : undefined,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
          llm_hints: typeof changes.llmHints === 'object' && changes.llmHints !== null ? changes.llmHints : undefined,
          asset_refs: Array.isArray(changes.assetRefs) ? changes.assetRefs : undefined,
          definition_data: typeof changes.definitionData === 'object' && changes.definitionData !== null ? changes.definitionData : undefined,
          updated_by: user.id,
        }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'set_archetype') {
        const result = await client.from('project_definitions').update({ archetype_key: operation.archetypeKey ?? null, updated_by: user.id }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'set_field_value') {
        const definitionId = await getDefinitionId(client, payload.draftId, String(operation.key))
        if (!definitionId) return json({ error: `Definition ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const result = await client.from('project_definition_field_values').upsert({ definition_id: definitionId, field_key: operation.fieldKey, value: operation.value }, { onConflict: 'definition_id,field_key' }).select('id').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ definitionId, fieldKey: operation.fieldKey })
        continue
      }

      if (operation.op === 'set_icon_asset') {
        await client.from('project_definitions').update({ icon_asset_key: operation.iconAssetKey ?? null, updated_by: user.id }).eq('draft_id', payload.draftId).eq('key', operation.key)
        await client.from('project_archetypes').update({ icon_asset_key: operation.iconAssetKey ?? null }).eq('draft_id', payload.draftId).eq('key', operation.key)
        results.push({ key: operation.key })
        continue
      }

      if (operation.op === 'attach_asset') {
        const definitionId = await getDefinitionId(client, payload.draftId, String(operation.key))
        if (!definitionId) return json({ error: `Definition ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const { data: row } = await client.from('project_definitions').select('asset_refs').eq('id', definitionId).maybeSingle()
        const assetRefs = Array.isArray(row?.asset_refs) ? row.asset_refs : []
        const result = await client.from('project_definitions').update({ asset_refs: [...assetRefs, operation.assetRef], updated_by: user.id }).eq('id', definitionId).select('id').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'create_archetype') {
        const result = await insertArchetype(client, payload.draftId, user.id, {
          key: operation.key,
          ...(typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}),
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'add_archetype_field') {
        const archetypeId = await getArchetypeId(client, payload.draftId, String(operation.key))
        if (!archetypeId) return json({ error: `Archetype ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const result = await client.from('project_archetype_fields').insert({
          draft_id: payload.draftId,
          archetype_id: archetypeId,
          key: operation.field.key,
          label: operation.field.label,
          field_type: operation.field.fieldType,
          description: operation.field.description ?? '',
          required: operation.field.required ?? false,
          default_value: operation.field.defaultValue ?? null,
          constraints: operation.field.constraints ?? {},
          sort_order: operation.field.sortOrder ?? 0,
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_archetype_field' || operation.op === 'remove_archetype_field') {
        const archetypeId = await getArchetypeId(client, payload.draftId, String(operation.key))
        if (!archetypeId) return json({ error: `Archetype ${String(operation.key)} was not found.`, operation }, { status: 400 })
        if (operation.op === 'update_archetype_field') {
          const result = await client.from('project_archetype_fields').update({
            key: typeof operation.changes.key === 'string' ? operation.changes.key : undefined,
            label: typeof operation.changes.label === 'string' ? operation.changes.label : undefined,
            field_type: typeof operation.changes.fieldType === 'string' ? operation.changes.fieldType : undefined,
            description: typeof operation.changes.description === 'string' ? operation.changes.description : undefined,
            required: typeof operation.changes.required === 'boolean' ? operation.changes.required : undefined,
            default_value: operation.changes.defaultValue,
            constraints: typeof operation.changes.constraints === 'object' && operation.changes.constraints !== null ? operation.changes.constraints : undefined,
            sort_order: typeof operation.changes.sortOrder === 'number' ? operation.changes.sortOrder : undefined,
          }).eq('archetype_id', archetypeId).eq('key', operation.fieldKey).select('id, key').single()
          if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
          results.push(result.data as Record<string, unknown>)
        } else {
          const result = await client.from('project_archetype_fields').delete().eq('archetype_id', archetypeId).eq('key', operation.fieldKey)
          if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
          results.push({ key: operation.key, fieldKey: operation.fieldKey })
        }
        continue
      }

      if (operation.op === 'add_custom_field' || operation.op === 'remove_custom_field') {
        const definitionId = await getDefinitionId(client, payload.draftId, String(operation.key))
        if (!definitionId) return json({ error: `Definition ${String(operation.key)} was not found.`, operation }, { status: 400 })
        if (operation.op === 'add_custom_field') {
          const result = await client.from('project_archetype_fields').insert({
            draft_id: payload.draftId,
            definition_id: definitionId,
            key: operation.field.key,
            label: operation.field.label,
            field_type: operation.field.fieldType,
            description: operation.field.description ?? '',
            required: operation.field.required ?? false,
            default_value: operation.field.defaultValue ?? null,
            constraints: operation.field.constraints ?? {},
            sort_order: operation.field.sortOrder ?? 0,
          }).select('id, key').single()
          if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
          await client.from('project_definition_field_values').upsert({ definition_id: definitionId, field_key: operation.field.key, value: operation.field.defaultValue ?? null }, { onConflict: 'definition_id,field_key' })
          results.push(result.data as Record<string, unknown>)
        } else {
          const fieldDelete = await client.from('project_archetype_fields').delete().eq('definition_id', definitionId).eq('key', operation.fieldKey)
          if (fieldDelete.error) return json({ error: fieldDelete.error.message, operation }, { status: 400 })
          const valueDelete = await client.from('project_definition_field_values').delete().eq('definition_id', definitionId).eq('field_key', operation.fieldKey)
          if (valueDelete.error) return json({ error: valueDelete.error.message, operation }, { status: 400 })
          results.push({ key: operation.key, fieldKey: operation.fieldKey })
        }
        continue
      }

      if (operation.op === 'create_graph') {
        const suffix = graphSuffix(String(operation.key))
        const result = await insertGraph(client, payload.draftId, user.id, {
          key: operation.key,
          name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
          graphType: (operation.payload as { graphType?: string } | undefined)?.graphType ?? 'narrative_flow',
          summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
          entryNodeKey: `start.${suffix}`,
          metadata: (operation.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {},
          llmHints: (operation.payload as { llmHints?: Record<string, unknown> } | undefined)?.llmHints ?? {},
          nodes: [
            { key: `start.${suffix}`, type: 'start', title: 'Start', templateKey: 'start', subtitle: null, position: { x: 120, y: 200 }, body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }, condition: null, effects: [], ports: [{ id: 'out', label: 'Out', direction: 'output' }], display: { iconAssetKey: null, compactPreview: false }, metadata: {} },
            { key: `end.${suffix}`, type: 'end', title: 'End', templateKey: 'end', subtitle: null, position: { x: 860, y: 200 }, body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }, condition: null, effects: [], ports: [{ id: 'in', label: 'In', direction: 'input' }], display: { iconAssetKey: null, compactPreview: false }, metadata: {} },
          ],
          edges: [{ key: `edge.${suffix}_start_end`, source: { nodeKey: `start.${suffix}`, portId: 'out' }, target: { nodeKey: `end.${suffix}`, portId: 'in' }, label: null, condition: null, metadata: {} }],
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'create_assembly_graph') {
        const scaffold = createAssemblyGraph({
          key: String(operation.key),
          name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
          summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
          boundEnvironmentKey:
            typeof (operation.payload as { boundEnvironmentKey?: unknown } | undefined)?.boundEnvironmentKey === 'string'
              ? String((operation.payload as { boundEnvironmentKey?: string }).boundEnvironmentKey)
              : null,
        })
        const result = await insertAssemblyGraph(client, payload.draftId, user.id, {
          ...scaffold,
          ...(typeof operation.payload === 'object' && operation.payload !== null ? operation.payload : {}),
          nodes:
            Array.isArray((operation.payload as { nodes?: unknown[] } | undefined)?.nodes) && (operation.payload as { nodes?: unknown[] }).nodes!.length > 0
              ? (operation.payload as { nodes: unknown[] }).nodes
              : scaffold.nodes,
          edges: Array.isArray((operation.payload as { edges?: unknown[] } | undefined)?.edges)
            ? (operation.payload as { edges: unknown[] }).edges
            : scaffold.edges,
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_graph') {
        const changes = (operation.changes as Record<string, any> | undefined) ?? {}
        const result = await client.from('draft_graphs').update({
          name: changes.name,
          graph_type: changes.graphType,
          summary: changes.summary,
          entry_node_key: changes.entryNodeKey,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
          llm_hints: typeof changes.llmHints === 'object' && changes.llmHints !== null ? changes.llmHints : undefined,
          updated_by: user.id,
        }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_assembly_graph') {
        const changes = (operation.changes as Record<string, any> | undefined) ?? {}
        const result = await client.from('draft_assembly_graphs').update({
          name: changes.name,
          summary: changes.summary,
          bound_environment_key:
            typeof changes.boundEnvironmentKey === 'string' || changes.boundEnvironmentKey === null
              ? changes.boundEnvironmentKey
              : undefined,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
          updated_by: user.id,
        }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'delete_graph') {
        const result = await client.from('draft_graphs').delete().eq('draft_id', payload.draftId).eq('key', operation.key)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ key: operation.key })
        continue
      }

      if (operation.op === 'delete_assembly_graph') {
        const result = await client.from('draft_assembly_graphs').delete().eq('draft_id', payload.draftId).eq('key', operation.key)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ key: operation.key })
        continue
      }

      if (operation.op === 'duplicate_graph') {
        const { data: graphRow } = await client.from('draft_graphs').select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints').eq('draft_id', payload.draftId).eq('key', operation.key).single()
        if (!graphRow) return json({ error: `Graph ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const { data: nodeRows } = await client.from('draft_graph_nodes').select('key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata').eq('graph_id', graphRow.id)
        const { data: edgeRows } = await client.from('draft_graph_edges').select('key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata').eq('graph_id', graphRow.id)
        const result = await insertGraph(client, payload.draftId, user.id, {
          key: operation.nextKey,
          name: `${graphRow.name} Copy`,
          graphType: graphRow.graph_type,
          summary: graphRow.summary,
          entryNodeKey: graphRow.entry_node_key ? `${graphRow.entry_node_key}_copy` : null,
          metadata: graphRow.metadata ?? {},
          llmHints: graphRow.llm_hints ?? {},
          nodes: (nodeRows ?? []).map((node) => ({ key: `${node.key}_copy`, type: node.node_type, title: node.title, templateKey: node.template_key, subtitle: node.subtitle, position: { x: Number(node.position_x) + 120, y: Number(node.position_y) + 80 }, body: node.body ?? {}, condition: node.condition_expr, effects: node.effect_ops ?? [], ports: node.ports ?? [], display: node.display ?? {}, metadata: node.metadata ?? {} })),
          edges: (edgeRows ?? []).map((edge) => ({ key: `${edge.key}_copy`, source: { nodeKey: `${edge.source_node_key}_copy`, portId: edge.source_port }, target: { nodeKey: `${edge.target_node_key}_copy`, portId: edge.target_port }, label: edge.label, condition: edge.condition_expr, metadata: edge.metadata ?? {} })),
        })
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'create_node') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const node = operation.node as Record<string, unknown>
        const result = await client.from('draft_graph_nodes').insert({
          graph_id: graphId,
          key: node.key,
          node_type: node.type,
          title: node.title,
          template_key: node.templateKey ?? null,
          subtitle: node.subtitle ?? null,
          position_x: (node.position as { x?: number } | undefined)?.x ?? 0,
          position_y: (node.position as { y?: number } | undefined)?.y ?? 0,
          body: node.body ?? {},
          condition_expr: node.condition ?? null,
          effect_ops: node.effects ?? [],
          ports: node.ports ?? [],
          display: node.display ?? { iconAssetKey: null, compactPreview: false },
          metadata: { ...(typeof node.metadata === 'object' && node.metadata !== null ? node.metadata : {}), templateKey: node.templateKey ?? null, subtitle: node.subtitle ?? null, display: node.display ?? { iconAssetKey: null, compactPreview: false } },
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'create_assembly_node') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const node = operation.node as Record<string, unknown>
        const result = await client.from('draft_assembly_nodes').insert({
          assembly_graph_id: graphId,
          key: node.key,
          kind: node.kind,
          title: node.title,
          subtitle: node.subtitle ?? null,
          position_x: (node.position as { x?: number } | undefined)?.x ?? 0,
          position_y: (node.position as { y?: number } | undefined)?.y ?? 0,
          ports: node.ports ?? [],
          params: node.params ?? {},
          metadata: node.metadata ?? {},
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_node' || operation.op === 'set_condition' || operation.op === 'set_effects' || operation.op === 'set_node_body' || operation.op === 'set_node_choices' || operation.op === 'set_node_media' || operation.op === 'move_node' || operation.op === 'update_node_template') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const { data: currentNode } = await client.from('draft_graph_nodes').select('body, metadata, display, node_type').eq('graph_id', graphId).eq('key', operation.nodeKey).maybeSingle()
        const currentBody = typeof currentNode?.body === 'object' && currentNode.body !== null ? currentNode.body : {}
        const currentMetadata = typeof currentNode?.metadata === 'object' && currentNode.metadata !== null ? currentNode.metadata : {}
        const currentDisplay = typeof currentNode?.display === 'object' && currentNode.display !== null ? currentNode.display : {}
        const currentNodeType = typeof currentNode?.node_type === 'string' ? currentNode.node_type : 'text'
        const updatePayload = operation.op === 'update_node'
          ? {
              node_type: (operation.changes as { type?: string } | undefined)?.type,
              title: (operation.changes as { title?: string } | undefined)?.title,
              template_key: (operation.changes as { templateKey?: string | null } | undefined)?.templateKey,
              subtitle: (operation.changes as { subtitle?: string | null } | undefined)?.subtitle,
              position_x: (operation.changes as { position?: { x?: number } } | undefined)?.position?.x,
              position_y: (operation.changes as { position?: { y?: number } } | undefined)?.position?.y,
              body: typeof (operation.changes as { body?: unknown } | undefined)?.body === 'object' ? (operation.changes as { body: Record<string, unknown> }).body : undefined,
              condition_expr: (operation.changes as { condition?: unknown } | undefined)?.condition,
              effect_ops: Array.isArray((operation.changes as { effects?: unknown[] } | undefined)?.effects) ? (operation.changes as { effects: unknown[] }).effects : undefined,
              ports: Array.isArray((operation.changes as { ports?: unknown[] } | undefined)?.ports) ? (operation.changes as { ports: unknown[] }).ports : undefined,
              display: typeof (operation.changes as { display?: unknown } | undefined)?.display === 'object' ? (operation.changes as { display: Record<string, unknown> }).display : undefined,
              metadata: { ...currentMetadata, ...(typeof (operation.changes as { metadata?: unknown } | undefined)?.metadata === 'object' && (operation.changes as { metadata: Record<string, unknown> }).metadata !== null ? (operation.changes as { metadata: Record<string, unknown> }).metadata : {}), templateKey: (operation.changes as { templateKey?: string | null } | undefined)?.templateKey ?? currentMetadata.templateKey ?? null, subtitle: (operation.changes as { subtitle?: string | null } | undefined)?.subtitle ?? currentMetadata.subtitle ?? null, display: (typeof (operation.changes as { display?: unknown } | undefined)?.display === 'object' && (operation.changes as { display: Record<string, unknown> }).display !== null ? (operation.changes as { display: Record<string, unknown> }).display : currentDisplay) },
            }
          : operation.op === 'set_condition' ? { condition_expr: operation.condition ?? null }
          : operation.op === 'set_effects' ? { effect_ops: operation.effects ?? [] }
          : operation.op === 'set_node_body' ? { body: operation.body ?? currentBody }
          : operation.op === 'set_node_choices' ? { body: { ...currentBody, choices: operation.choices ?? [] }, ports: inferPorts(currentNodeType, Array.isArray(operation.choices) ? operation.choices as Array<Record<string, unknown>> : []) }
          : operation.op === 'set_node_media' ? { body: { ...currentBody, imageAssetKey: operation.media?.imageAssetKey ?? null, audioAssetKey: operation.media?.audioAssetKey ?? null } }
          : operation.op === 'move_node' ? { position_x: operation.position?.x ?? 0, position_y: operation.position?.y ?? 0 }
          : { template_key: operation.templateKey, metadata: { ...currentMetadata, templateKey: operation.templateKey } }
        const result = await client.from('draft_graph_nodes').update(updatePayload).eq('graph_id', graphId).eq('key', operation.nodeKey).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_assembly_node') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const changes = (operation.changes as Record<string, unknown> | undefined) ?? {}
        const result = await client.from('draft_assembly_nodes').update({
          kind: typeof changes.kind === 'string' ? changes.kind : undefined,
          title: typeof changes.title === 'string' ? changes.title : undefined,
          subtitle:
            typeof changes.subtitle === 'string' || changes.subtitle === null
              ? changes.subtitle
              : undefined,
          position_x: (changes.position as { x?: number } | undefined)?.x,
          position_y: (changes.position as { y?: number } | undefined)?.y,
          ports: Array.isArray(changes.ports) ? changes.ports : undefined,
          params: typeof changes.params === 'object' && changes.params !== null ? changes.params : undefined,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
        }).eq('assembly_graph_id', graphId).eq('key', operation.nodeKey).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'delete_node') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const nodeDelete = await client.from('draft_graph_nodes').delete().eq('graph_id', graphId).eq('key', operation.nodeKey)
        if (nodeDelete.error) return json({ error: nodeDelete.error.message, operation }, { status: 400 })
        const edgeDelete = await client.from('draft_graph_edges').delete().eq('graph_id', graphId).or(`source_node_key.eq.${operation.nodeKey},target_node_key.eq.${operation.nodeKey}`)
        if (edgeDelete.error) return json({ error: edgeDelete.error.message, operation }, { status: 400 })
        results.push({ graphKey: operation.graphKey, nodeKey: operation.nodeKey })
        continue
      }

      if (operation.op === 'delete_assembly_node') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const nodeDelete = await client.from('draft_assembly_nodes').delete().eq('assembly_graph_id', graphId).eq('key', operation.nodeKey)
        if (nodeDelete.error) return json({ error: nodeDelete.error.message, operation }, { status: 400 })
        const edgeDelete = await client.from('draft_assembly_edges').delete().eq('assembly_graph_id', graphId).or(`source_node_key.eq.${operation.nodeKey},target_node_key.eq.${operation.nodeKey}`)
        if (edgeDelete.error) return json({ error: edgeDelete.error.message, operation }, { status: 400 })
        results.push({ graphKey: operation.graphKey, nodeKey: operation.nodeKey })
        continue
      }

      if (operation.op === 'connect_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const edge = operation.edge as Record<string, any>
        const result = await client.from('draft_graph_edges').insert({
          graph_id: graphId,
          key: edge.key,
          source_node_key: edge.source?.nodeKey,
          source_port: edge.source?.portId ?? null,
          target_node_key: edge.target?.nodeKey,
          target_port: edge.target?.portId ?? null,
          label: edge.label ?? null,
          condition_expr: edge.condition ?? null,
          metadata: edge.metadata ?? {},
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        await ensureChoiceSourceHandle(client, graphId, String(edge.source?.nodeKey ?? ''), String(edge.source?.portId ?? ''), typeof edge.label === 'string' ? edge.label : null)
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'connect_assembly_edge') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const edge = operation.edge as Record<string, any>
        const result = await client.from('draft_assembly_edges').insert({
          assembly_graph_id: graphId,
          key: edge.key,
          source_node_key: edge.source?.nodeKey,
          source_port: edge.source?.portId,
          target_node_key: edge.target?.nodeKey,
          target_port: edge.target?.portId,
          metadata: edge.metadata ?? {},
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const changes = (operation.changes as Record<string, any> | undefined) ?? {}
        const result = await client.from('draft_graph_edges').update({
          source_node_key: changes.source?.nodeKey,
          source_port: changes.source?.portId,
          target_node_key: changes.target?.nodeKey,
          target_port: changes.target?.portId,
          label: changes.label,
          condition_expr: changes.condition,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
        }).eq('graph_id', graphId).eq('key', operation.edgeKey).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_assembly_edge') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const changes = (operation.changes as Record<string, any> | undefined) ?? {}
        const result = await client.from('draft_assembly_edges').update({
          source_node_key: changes.source?.nodeKey,
          source_port: changes.source?.portId,
          target_node_key: changes.target?.nodeKey,
          target_port: changes.target?.portId,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
        }).eq('assembly_graph_id', graphId).eq('key', operation.edgeKey).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'delete_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const result = await client.from('draft_graph_edges').delete().eq('graph_id', graphId).eq('key', operation.edgeKey)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ graphKey: operation.graphKey, edgeKey: operation.edgeKey })
        continue
      }

      if (operation.op === 'delete_assembly_edge') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const result = await client.from('draft_assembly_edges').delete().eq('assembly_graph_id', graphId).eq('key', operation.edgeKey)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ graphKey: operation.graphKey, edgeKey: operation.edgeKey })
        continue
      }

      if (operation.op === 'replace_assembly_subgraph') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const deleteEdges = await client.from('draft_assembly_edges').delete().eq('assembly_graph_id', graphId)
        if (deleteEdges.error) return json({ error: deleteEdges.error.message, operation }, { status: 400 })
        const deleteNodes = await client.from('draft_assembly_nodes').delete().eq('assembly_graph_id', graphId)
        if (deleteNodes.error) return json({ error: deleteNodes.error.message, operation }, { status: 400 })

        if (Array.isArray(operation.nodes) && operation.nodes.length > 0) {
          const nodeInsert = await client.from('draft_assembly_nodes').insert(operation.nodes.map((node) => ({
            assembly_graph_id: graphId,
            key: node.key,
            kind: node.kind,
            title: node.title,
            subtitle: node.subtitle ?? null,
            position_x: node.position.x ?? 0,
            position_y: node.position.y ?? 0,
            ports: node.ports ?? [],
            params: node.params ?? {},
            metadata: node.metadata ?? {},
          })))
          if (nodeInsert.error) return json({ error: nodeInsert.error.message, operation }, { status: 400 })
        }

        if (Array.isArray(operation.edges) && operation.edges.length > 0) {
          const edgeInsert = await client.from('draft_assembly_edges').insert(operation.edges.map((edge) => ({
            assembly_graph_id: graphId,
            key: edge.key,
            source_node_key: edge.source.nodeKey,
            source_port: edge.source.portId,
            target_node_key: edge.target.nodeKey,
            target_port: edge.target.portId,
            metadata: edge.metadata ?? {},
          })))
          if (edgeInsert.error) return json({ error: edgeInsert.error.message, operation }, { status: 400 })
        }

        results.push({ graphKey: operation.graphKey, nodeCount: operation.nodes.length, edgeCount: operation.edges.length })
        continue
      }

      if (operation.op === 'bind_environment_assembly') {
        const definitionId = await getDefinitionId(client, payload.draftId, String(operation.environmentKey))
        if (!definitionId) return json({ error: `Environment ${String(operation.environmentKey)} was not found.`, operation }, { status: 400 })

        const componentQuery = await client
          .from('project_definition_components')
          .select('config')
          .eq('definition_id', definitionId)
          .eq('component_type', 'environment_geometry_binding')
          .maybeSingle()

        if (componentQuery.error) return json({ error: componentQuery.error.message, operation }, { status: 400 })

        const currentConfig =
          typeof componentQuery.data?.config === 'object' && componentQuery.data.config !== null
            ? componentQuery.data.config as Record<string, unknown>
            : {}

        const nextConfig = {
          ...currentConfig,
          sourceMode: operation.assemblyGraphKey ? 'procedural_graph' : (currentConfig.sourceMode ?? 'mesh'),
          assemblyGraphKey: operation.assemblyGraphKey ?? null,
          environmentBlueprintKey: currentConfig.environmentBlueprintKey ?? null,
        }

        const componentResult = await upsertDefinitionComponentConfig(
          client,
          definitionId,
          'environment_geometry_binding',
          nextConfig,
        )
        if (componentResult.error) return json({ error: componentResult.error.message, operation }, { status: 400 })

        if (operation.assemblyGraphKey) {
          const graphUpdate = await client
            .from('draft_assembly_graphs')
            .update({ bound_environment_key: operation.environmentKey, updated_by: user.id })
            .eq('draft_id', payload.draftId)
            .eq('key', operation.assemblyGraphKey)
          if (graphUpdate.error) return json({ error: graphUpdate.error.message, operation }, { status: 400 })
        }

        results.push({ environmentKey: operation.environmentKey, assemblyGraphKey: operation.assemblyGraphKey ?? null })
        continue
      }

      if (operation.op === 'create_environment_blueprint') {
        const blueprint = operation.blueprint as Record<string, unknown>
        const result = await client.from('draft_environment_blueprints').insert({
          draft_id: payload.draftId,
          key: String(blueprint.id ?? ''),
          environment_key: String(blueprint.environmentKey ?? ''),
          name: String(blueprint.name ?? 'Environment Blueprint'),
          document: blueprint,
        }).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'update_environment_blueprint') {
        const rowId = await getEnvironmentBlueprintRowId(client, payload.draftId, String(operation.blueprintId))
        if (!rowId) return json({ error: `Blueprint ${String(operation.blueprintId)} was not found.`, operation }, { status: 400 })
        const current = await client.from('draft_environment_blueprints').select('document, key, environment_key, name').eq('id', rowId).single()
        if (current.error) return json({ error: current.error.message, operation }, { status: 400 })
        const currentDocument = typeof current.data.document === 'object' && current.data.document !== null ? current.data.document as Record<string, unknown> : {}
        const changes = (operation.changes as Record<string, unknown> | undefined) ?? {}
        const nextDocument = {
          ...currentDocument,
          ...changes,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null
            ? { ...(typeof currentDocument.metadata === 'object' && currentDocument.metadata !== null ? currentDocument.metadata as Record<string, unknown> : {}), ...(changes.metadata as Record<string, unknown>) }
            : currentDocument.metadata,
          styleHints: typeof changes.styleHints === 'object' && changes.styleHints !== null
            ? { ...(typeof currentDocument.styleHints === 'object' && currentDocument.styleHints !== null ? currentDocument.styleHints as Record<string, unknown> : {}), ...(changes.styleHints as Record<string, unknown>) }
            : currentDocument.styleHints,
        }
        const result = await client.from('draft_environment_blueprints').update({
          name: typeof changes.name === 'string' ? changes.name : current.data.name,
          environment_key: typeof changes.environmentKey === 'string' ? changes.environmentKey : current.data.environment_key,
          document: nextDocument,
        }).eq('id', rowId).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'delete_environment_blueprint') {
        const result = await client.from('draft_environment_blueprints').delete().eq('draft_id', payload.draftId).eq('key', operation.blueprintId)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ blueprintId: operation.blueprintId })
        continue
      }

      if (operation.op === 'materialize_blueprint_region') {
        const rowId = await getEnvironmentBlueprintRowId(client, payload.draftId, String(operation.blueprintId))
        if (!rowId) return json({ error: `Blueprint ${String(operation.blueprintId)} was not found.`, operation }, { status: 400 })
        const blueprintQuery = await client.from('draft_environment_blueprints').select('environment_key').eq('id', rowId).single()
        if (blueprintQuery.error) return json({ error: blueprintQuery.error.message, operation }, { status: 400 })
        const definitionId = await getDefinitionId(client, payload.draftId, String(blueprintQuery.data.environment_key))
        if (!definitionId) return json({ error: `Environment ${String(blueprintQuery.data.environment_key)} was not found.`, operation }, { status: 400 })
        const componentQuery = await client
          .from('project_definition_components')
          .select('config')
          .eq('definition_id', definitionId)
          .eq('component_type', 'environment_geometry_binding')
          .maybeSingle()
        if (componentQuery.error) return json({ error: componentQuery.error.message, operation }, { status: 400 })
        const currentConfig =
          typeof componentQuery.data?.config === 'object' && componentQuery.data.config !== null
            ? componentQuery.data.config as Record<string, unknown>
            : {}
        const componentResult = await upsertDefinitionComponentConfig(client, definitionId, 'environment_geometry_binding', {
          ...currentConfig,
          sourceMode: 'procedural_blueprint',
          environmentBlueprintKey: operation.blueprintId,
          assemblyGraphKey: operation.assemblyGraphKey ?? currentConfig.assemblyGraphKey ?? null,
        })
        if (componentResult.error) return json({ error: componentResult.error.message, operation }, { status: 400 })
        results.push({ blueprintId: operation.blueprintId, assemblyGraphKey: operation.assemblyGraphKey ?? null })
        continue
      }

      if (operation.op === 'detach_blueprint_region' || operation.op === 'reattach_blueprint_region') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.assemblyGraphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.assemblyGraphKey)} was not found.`, operation }, { status: 400 })
        const existingGraph = await client.from('draft_assembly_graphs').select('metadata').eq('id', graphId).single()
        if (existingGraph.error) return json({ error: existingGraph.error.message, operation }, { status: 400 })
        const currentMetadata =
          typeof existingGraph.data.metadata === 'object' && existingGraph.data.metadata !== null
            ? existingGraph.data.metadata as Record<string, unknown>
            : {}
        const result = await client.from('draft_assembly_graphs').update({
          metadata: {
            ...currentMetadata,
            blueprintKey: operation.blueprintId,
            blueprintOwnership: operation.op === 'detach_blueprint_region' ? 'manual_override' : 'generated',
          },
        }).eq('id', graphId).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }

      if (operation.op === 'expand_macro_node' || operation.op === 'collapse_macro_region') {
        const graphId = await getAssemblyGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Assembly graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const existingNode = await client.from('draft_assembly_nodes').select('metadata').eq('assembly_graph_id', graphId).eq('key', operation.nodeKey).single()
        if (existingNode.error) return json({ error: existingNode.error.message, operation }, { status: 400 })
        const currentMetadata =
          typeof existingNode.data.metadata === 'object' && existingNode.data.metadata !== null
            ? existingNode.data.metadata as Record<string, unknown>
            : {}
        const result = await client.from('draft_assembly_nodes').update({
          metadata: {
            ...currentMetadata,
            macroState: operation.op === 'expand_macro_node' ? 'expanded' : 'collapsed',
          },
        }).eq('assembly_graph_id', graphId).eq('key', operation.nodeKey).select('id, key').single()
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push(result.data as Record<string, unknown>)
        continue
      }
    }

    if (payload.patchSetId) {
      await client.from('patch_sets').update({ status: 'applied' }).eq('id', payload.patchSetId).eq('draft_id', payload.draftId)
    }

    return json({ ok: true, applied: results.length, results })
  } catch (error) {
    return errorResponse(error, 'Failed to apply patch.')
  }
})
