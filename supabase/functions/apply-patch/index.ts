import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  materializeArchetypePreset,
  materializeDefinitionPreset,
  materializeGraphPreset,
} from '../../../src/domain/presetCatalog.ts'
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

      if (operation.op === 'delete_graph') {
        const result = await client.from('draft_graphs').delete().eq('draft_id', payload.draftId).eq('key', operation.key)
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

      if (operation.op === 'delete_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const result = await client.from('draft_graph_edges').delete().eq('graph_id', graphId).eq('key', operation.edgeKey)
        if (result.error) return json({ error: result.error.message, operation }, { status: 400 })
        results.push({ graphKey: operation.graphKey, edgeKey: operation.edgeKey })
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
