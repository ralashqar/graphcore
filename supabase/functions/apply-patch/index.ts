import '@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

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
  if (nodeType === 'condition') {
    return [
      ...inputs,
      { id: 'true', label: 'True', direction: 'output' },
      { id: 'false', label: 'False', direction: 'output' },
    ]
  }
  if (nodeType === 'choice') {
    return [
      ...inputs,
      ...(choices.length > 0
        ? choices.map((choice, index) => ({
            id: typeof choice.id === 'string' ? choice.id : `choice_${index + 1}`,
            label: typeof choice.label === 'string' ? choice.label : `Choice ${index + 1}`,
            direction: 'output',
          }))
        : [{ id: 'out', label: 'Out', direction: 'output' }]),
    ]
  }
  if (nodeType === 'branch') {
    return [
      ...inputs,
      { id: 'branch_a', label: 'Branch A', direction: 'output' },
      { id: 'branch_b', label: 'Branch B', direction: 'output' },
    ]
  }
  if (nodeType === 'random') {
    return [
      ...inputs,
      { id: 'success', label: 'Success', direction: 'output' },
      { id: 'fail', label: 'Fail', direction: 'output' },
    ]
  }

  return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const { client, user } = await requireUserClient(request, 'apply-patch')

    const payload = (await request.json()) as ApplyPatchPayload
    const results: Array<Record<string, unknown>> = []

    for (const operation of payload.operations) {
      if (operation.op === 'create_definition') {
        const insertResult = await client.from('project_definitions').insert({
          draft_id: payload.draftId,
          key: operation.key,
          kind: operation.kind,
          name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
          summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
          status: (operation.payload as { status?: string } | undefined)?.status ?? 'draft',
          icon_asset_key: (operation.payload as { iconAssetKey?: string | null } | undefined)?.iconAssetKey ?? null,
          archetype_key: (operation.payload as { archetypeKey?: string | null } | undefined)?.archetypeKey ?? null,
          tags: (operation.payload as { tags?: string[] } | undefined)?.tags ?? [],
          metadata: (operation.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {},
          llm_hints: (operation.payload as { llmHints?: Record<string, unknown> } | undefined)?.llmHints ?? {},
          asset_refs: (operation.payload as { assetRefs?: unknown[] } | undefined)?.assetRefs ?? [],
          definition_data: (operation.payload as { definitionData?: Record<string, unknown> } | undefined)?.definitionData ?? {},
          created_by: user.id,
          updated_by: user.id,
        }).select('id, key').single()
        if (insertResult.error) return json({ error: insertResult.error.message, operation }, { status: 400 })
        results.push(insertResult.data)
        continue
      }

      if (operation.op === 'update_definition') {
        const changes = (operation.changes as Record<string, unknown> | undefined) ?? {}
        const updateResult = await client.from('project_definitions').update({
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
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
        continue
      }

      if (operation.op === 'set_archetype') {
        const updateResult = await client.from('project_definitions').update({ archetype_key: operation.archetypeKey ?? null, updated_by: user.id }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
        continue
      }

      if (operation.op === 'set_field_value') {
        const definitionId = await getDefinitionId(client, payload.draftId, String(operation.key))
        if (!definitionId) return json({ error: `Definition ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const upsertResult = await client.from('project_definition_field_values').upsert({ definition_id: definitionId, field_key: operation.fieldKey, value: operation.value }, { onConflict: 'definition_id,field_key' }).select('id').single()
        if (upsertResult.error) return json({ error: upsertResult.error.message, operation }, { status: 400 })
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
        const updateResult = await client.from('project_definitions').update({ asset_refs: [...assetRefs, operation.assetRef], updated_by: user.id }).eq('id', definitionId).select('id').single()
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
        continue
      }

      if (operation.op === 'create_archetype') {
        const insertResult = await client.from('project_archetypes').insert({
          draft_id: payload.draftId,
          key: operation.key,
          name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
          summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
          definition_kind: (operation.payload as { appliesToKind?: string } | undefined)?.appliesToKind ?? 'item',
          icon_asset_key: (operation.payload as { iconAssetKey?: string | null } | undefined)?.iconAssetKey ?? null,
          metadata: (operation.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {},
          llm_hints: (operation.payload as { llmHints?: Record<string, unknown> } | undefined)?.llmHints ?? {},
          created_by: user.id,
        }).select('id, key').single()
        if (insertResult.error) return json({ error: insertResult.error.message, operation }, { status: 400 })
        results.push(insertResult.data)
        continue
      }

      if (operation.op === 'add_archetype_field') {
        const archetypeId = await getArchetypeId(client, payload.draftId, String(operation.key))
        if (!archetypeId) return json({ error: `Archetype ${String(operation.key)} was not found.`, operation }, { status: 400 })
        const insertResult = await client.from('project_archetype_fields').insert({
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
        if (insertResult.error) return json({ error: insertResult.error.message, operation }, { status: 400 })
        results.push(insertResult.data)
        continue
      }

      if (operation.op === 'create_graph') {
        const insertGraph = await client.from('draft_graphs').insert({
          draft_id: payload.draftId,
          key: operation.key,
          name: (operation.payload as { name?: string } | undefined)?.name ?? String(operation.key),
          graph_type: (operation.payload as { graphType?: string } | undefined)?.graphType ?? 'narrative_flow',
          summary: (operation.payload as { summary?: string } | undefined)?.summary ?? '',
          entry_node_key: `start.${graphSuffix(String(operation.key))}`,
          metadata: (operation.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {},
          llm_hints: (operation.payload as { llmHints?: Record<string, unknown> } | undefined)?.llmHints ?? {},
          created_by: user.id,
          updated_by: user.id,
        }).select('id, key').single()
        if (insertGraph.error) return json({ error: insertGraph.error.message, operation }, { status: 400 })
        const suffix = graphSuffix(String(operation.key))
        await client.from('draft_graph_nodes').insert([
          { graph_id: insertGraph.data.id, key: `start.${suffix}`, node_type: 'start', title: 'Start', template_key: 'start', subtitle: null, position_x: 120, position_y: 200, body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }, condition_expr: null, effect_ops: [], ports: [{ id: 'out', label: 'Out', direction: 'output' }], display: { iconAssetKey: null, compactPreview: false }, metadata: { templateKey: 'start', display: { iconAssetKey: null, compactPreview: false } } },
          { graph_id: insertGraph.data.id, key: `end.${suffix}`, node_type: 'end', title: 'End', template_key: 'end', subtitle: null, position_x: 860, position_y: 200, body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }, condition_expr: null, effect_ops: [], ports: [{ id: 'in', label: 'In', direction: 'input' }], display: { iconAssetKey: null, compactPreview: false }, metadata: { templateKey: 'end', display: { iconAssetKey: null, compactPreview: false } } },
        ])
        await client.from('draft_graph_edges').insert({ graph_id: insertGraph.data.id, key: `edge.${suffix}_start_end`, source_node_key: `start.${suffix}`, source_port: 'out', target_node_key: `end.${suffix}`, target_port: 'in', label: null, condition_expr: null, metadata: {} })
        results.push(insertGraph.data)
        continue
      }

      if (operation.op === 'update_graph') {
        const updateResult = await client.from('draft_graphs').update({
          name: (operation.changes as { name?: string } | undefined)?.name,
          graph_type: (operation.changes as { graphType?: string } | undefined)?.graphType,
          summary: (operation.changes as { summary?: string } | undefined)?.summary,
          entry_node_key: (operation.changes as { entryNodeKey?: string | null } | undefined)?.entryNodeKey,
          metadata: (operation.changes as { metadata?: Record<string, unknown> } | undefined)?.metadata,
          llm_hints: (operation.changes as { llmHints?: Record<string, unknown> } | undefined)?.llmHints,
          updated_by: user.id,
        }).eq('draft_id', payload.draftId).eq('key', operation.key).select('id, key').single()
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
        continue
      }

      if (operation.op === 'create_node') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const node = operation.node as Record<string, unknown>
        const insertResult = await client.from('draft_graph_nodes').insert({
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
        if (insertResult.error) return json({ error: insertResult.error.message, operation }, { status: 400 })
        results.push(insertResult.data)
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
        const updatePayload =
          operation.op === 'update_node'
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
            : operation.op === 'set_condition'
              ? { condition_expr: operation.condition ?? null }
              : operation.op === 'set_effects'
                ? { effect_ops: operation.effects ?? [] }
                : operation.op === 'set_node_body'
                  ? { body: operation.body ?? currentBody }
                  : operation.op === 'set_node_choices'
                    ? {
                        body: { ...currentBody, choices: operation.choices ?? [] },
                        ports: inferPorts(currentNodeType, Array.isArray(operation.choices) ? operation.choices as Array<Record<string, unknown>> : []),
                      }
                    : operation.op === 'set_node_media'
                      ? { body: { ...currentBody, imageAssetKey: operation.media?.imageAssetKey ?? null, audioAssetKey: operation.media?.audioAssetKey ?? null } }
                      : operation.op === 'move_node'
                        ? { position_x: operation.position?.x ?? 0, position_y: operation.position?.y ?? 0 }
                        : { template_key: operation.templateKey, metadata: { ...currentMetadata, templateKey: operation.templateKey } }
        const updateResult = await client.from('draft_graph_nodes').update(updatePayload).eq('graph_id', graphId).eq('key', operation.nodeKey).select('id, key').single()
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
        continue
      }

      if (operation.op === 'connect_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const edge = operation.edge as Record<string, any>
        const insertResult = await client.from('draft_graph_edges').insert({
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
        if (insertResult.error) return json({ error: insertResult.error.message, operation }, { status: 400 })
        results.push(insertResult.data)
        continue
      }

      if (operation.op === 'update_edge') {
        const graphId = await getGraphId(client, payload.draftId, String(operation.graphKey))
        if (!graphId) return json({ error: `Graph ${String(operation.graphKey)} was not found.`, operation }, { status: 400 })
        const changes = (operation.changes as Record<string, any> | undefined) ?? {}
        const updateResult = await client.from('draft_graph_edges').update({
          source_node_key: changes.source?.nodeKey,
          source_port: changes.source?.portId,
          target_node_key: changes.target?.nodeKey,
          target_port: changes.target?.portId,
          label: changes.label,
          condition_expr: changes.condition,
          metadata: typeof changes.metadata === 'object' && changes.metadata !== null ? changes.metadata : undefined,
        }).eq('graph_id', graphId).eq('key', operation.edgeKey).select('id, key').single()
        if (updateResult.error) return json({ error: updateResult.error.message, operation }, { status: 400 })
        results.push(updateResult.data)
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
