import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  buildOutputWorkflowExecutionPlan,
  outputWorkflowUpgradeRequestSchema,
  outputWorkflowUpgradeResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

function nodeBase(input: {
  key: string
  nodeType: string
  label: string
  x: number
  y: number
  config?: Record<string, unknown>
  inputs?: Record<string, unknown>
}) {
  return {
    key: input.key,
    nodeType: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config ?? {},
    inputs: input.inputs ?? {},
    outputs: {},
    dirty: true,
    inputHash: '',
    outputHash: '',
    metadata: {
      upgradedFromPreset: true,
      upgradedAt: new Date().toISOString(),
    },
  }
}

function edgeBase(sourceNodeKey: string, sourcePort: string, targetNodeKey: string, targetPort: string, metadata: Record<string, unknown> = {}) {
  return {
    key: `${sourceNodeKey}.${sourcePort}->${targetNodeKey}.${targetPort}`,
    sourceNodeKey,
    sourcePort,
    targetNodeKey,
    targetPort,
    metadata,
  }
}

function latestNodePosition(nodes: Array<{ position: { x: number; y: number } }>) {
  return nodes.reduce((max, node) => ({
    x: Math.max(max.x, node.position.x),
    y: Math.max(max.y, node.position.y),
  }), { x: 0, y: 0 })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readPageCount(nodes: Array<{ key: string; config: Record<string, unknown> }>) {
  const comicScript = nodes.find((node) => node.key === 'comic_script')
  const pageCount = Number(asRecord(comicScript?.config).pageCount ?? 8)
  return Number.isFinite(pageCount) ? Math.max(1, Math.min(12, pageCount)) : 8
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'upgrade-output-workflow-preset')
    const payload = outputWorkflowUpgradeRequestSchema.parse(await request.json())
    if (!['ebook_from_world', 'comic_issue_from_sequence'].includes(payload.preset)) {
      throw new HttpError(400, 'Only ebook and comic workflow upgrades are supported in V1.')
    }

    const workflowResponse = await client
      .from('output_workflows')
      .select(outputWorkflowSelect)
      .eq('id', payload.workflowId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (workflowResponse.error || !workflowResponse.data) {
      throw new HttpError(404, 'Output workflow not found.')
    }
    const workflow = mapOutputWorkflowRow(workflowResponse.data)
    if (workflow.preset !== payload.preset) {
      throw new HttpError(400, `Workflow preset "${workflow.preset}" does not match requested upgrade preset "${payload.preset}".`)
    }

    const [nodeResponse, edgeResponse] = await Promise.all([
      client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
      client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
    ])
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)

    const existingNodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)
    const existingEdges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)
    const nodeKeys = new Set(existingNodes.map((node) => node.key))
    const edgeKeys = new Set(existingEdges.map((edge) => edge.key))
    const maxPosition = latestNodePosition(existingNodes)

    if (workflow.preset === 'comic_issue_from_sequence') {
      const pageCount = readPageCount(existingNodes)
      const sceneScriptNode = nodeBase({
        key: 'comic_scene_script',
        nodeType: 'text_llm',
        label: 'Scene Script',
        x: 640,
        y: 100,
        inputs: { prompt: 'Adapt the selected sequence unit into a rich dramatic scene script for comics.' },
        config: {
          purpose: 'comic_scene_script',
          pageCount,
          skillKeys: ['comic_scene_dramatization', 'comic_dialogue_lettering', 'comic_adaptation_compression', 'provider_prompt_hygiene'],
          autoSkillTags: ['comic', 'scene_script', 'adaptation'],
          guidanceMode: 'strict',
          execution: { resourceClass: 'llm' },
        },
      })
      const pagePlanNode = nodeBase({
        key: 'comic_page_plan',
        nodeType: 'text_llm',
        label: 'Page Plan',
        x: 920,
        y: 100,
        inputs: { prompt: `Compress the scene script into exactly ${pageCount} comic pages.` },
        config: {
          purpose: 'comic_page_plan',
          pageCount,
          skillKeys: ['comic_page_pacing', 'comic_panel_storytelling', 'comic_adaptation_compression', 'provider_prompt_hygiene'],
          autoSkillTags: ['comic', 'page_plan', 'pacing'],
          guidanceMode: 'strict',
          execution: { resourceClass: 'llm' },
        },
      })
      const desiredNodes = [sceneScriptNode, pagePlanNode].filter((node) => !nodeKeys.has(node.key))
      const availableNodeKeys = new Set([...nodeKeys, ...desiredNodes.map((node) => node.key)])
      const desiredEdges = [
        edgeBase('world_context', 'context', 'comic_scene_script', 'context'),
        edgeBase('skill_context', 'guidance', 'comic_scene_script', 'guidance'),
        edgeBase('relevant_entities', 'asset_pack', 'comic_scene_script', 'asset_pack'),
        edgeBase('comic_scene_script', 'sceneScript', 'comic_page_plan', 'sceneScript'),
        edgeBase('world_context', 'context', 'comic_page_plan', 'context'),
        edgeBase('skill_context', 'guidance', 'comic_page_plan', 'guidance'),
        edgeBase('relevant_entities', 'asset_pack', 'comic_page_plan', 'asset_pack'),
        edgeBase('comic_scene_script', 'sceneScript', 'comic_script', 'sceneScript'),
        edgeBase('comic_page_plan', 'pagePlan', 'comic_script', 'pagePlan'),
      ].filter((edge) => (
        !edgeKeys.has(edge.key)
        && availableNodeKeys.has(edge.sourceNodeKey)
        && availableNodeKeys.has(edge.targetNodeKey)
      ))

      const combinedNodes = [
        ...existingNodes.map((node) => ({ key: node.key })),
        ...desiredNodes.map((node) => ({ key: node.key })),
      ]
      const combinedEdges = [
        ...existingEdges.map((edge) => ({
          sourceNodeKey: edge.sourceNodeKey,
          sourcePort: edge.sourcePort,
          targetNodeKey: edge.targetNodeKey,
          targetPort: edge.targetPort,
          metadata: edge.metadata,
        })),
        ...desiredEdges,
      ]
      const plan = buildOutputWorkflowExecutionPlan(combinedNodes, combinedEdges)
      if (plan.diagnostics.length > 0) {
        throw new HttpError(400, plan.diagnostics.join(' '))
      }

      if (desiredNodes.length > 0) {
        const insertResponse = await client
          .from('output_workflow_nodes')
          .insert(desiredNodes.map((node) => ({
            workflow_id: payload.workflowId,
            draft_id: payload.draftId,
            key: node.key,
            node_type: node.nodeType,
            label: node.label,
            position: node.position,
            config: node.config,
            inputs: node.inputs,
            outputs: node.outputs,
            dirty: node.dirty,
            input_hash: node.inputHash,
            output_hash: node.outputHash,
            metadata: node.metadata,
          })))
        if (insertResponse.error) throw new Error(insertResponse.error.message)
      }

      if (desiredEdges.length > 0) {
        const insertResponse = await client
          .from('output_workflow_edges')
          .insert(desiredEdges.map((edge) => ({
            workflow_id: payload.workflowId,
            draft_id: payload.draftId,
            key: edge.key,
            source_node_key: edge.sourceNodeKey,
            source_port: edge.sourcePort,
            target_node_key: edge.targetNodeKey,
            target_port: edge.targetPort,
            metadata: edge.metadata,
          })))
        if (insertResponse.error) throw new Error(insertResponse.error.message)
      }

      const concurrencyNodeUpdates = existingNodes
        .filter((node) => /^page_\d{3}_image$/.test(node.key))
        .map((node) => {
          const config = asRecord(node.config)
          const execution = asRecord(config.execution)
          const currentMaxConcurrency = Number(execution.maxConcurrency ?? 0)
          if (execution.groupKey !== 'comic_pages' || currentMaxConcurrency >= 8) return null
          return {
            key: node.key,
            config: {
              ...config,
              execution: {
                ...execution,
                resourceClass: execution.resourceClass ?? 'image',
                groupKey: 'comic_pages',
                maxConcurrency: 8,
              },
            },
          }
        })
        .filter((entry): entry is { key: string; config: Record<string, unknown> } => Boolean(entry))

      if (concurrencyNodeUpdates.length > 0) {
        await Promise.all(concurrencyNodeUpdates.map(async (update) => {
          const response = await client
            .from('output_workflow_nodes')
            .update({ config: update.config, updated_at: new Date().toISOString() })
            .eq('workflow_id', payload.workflowId)
            .eq('key', update.key)
          if (response.error) throw new Error(response.error.message)
        }))
      }

      const dirtiedNodeKeys = [
        ...desiredNodes.map((node) => node.key),
        ...(nodeKeys.has('comic_script') ? ['comic_script'] : []),
        ...existingNodes.filter((node) => /^page_\d{3}_(prompt|image)$/.test(node.key)).map((node) => node.key),
        ...(nodeKeys.has('comic_pdf_render') ? ['comic_pdf_render'] : []),
        ...(nodeKeys.has('artifact') ? ['artifact'] : []),
      ]
      if (dirtiedNodeKeys.length > 0) {
        const dirtyResponse = await client
          .from('output_workflow_nodes')
          .update({ dirty: true, updated_at: new Date().toISOString() })
          .eq('workflow_id', payload.workflowId)
          .in('key', [...new Set(dirtiedNodeKeys)])
        if (dirtyResponse.error) throw new Error(dirtyResponse.error.message)
      }

      const workflowPatchResponse = await client
        .from('output_workflows')
        .update({
          metadata: {
            ...workflow.metadata,
            upgradedPresetFeatures: {
              ...((workflow.metadata.upgradedPresetFeatures && typeof workflow.metadata.upgradedPresetFeatures === 'object' && !Array.isArray(workflow.metadata.upgradedPresetFeatures))
                ? workflow.metadata.upgradedPresetFeatures as Record<string, unknown>
                : {}),
              richComicAdaptationPipeline: true,
              comicPageImageConcurrency: 8,
            },
            lastPresetUpgradeAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.workflowId)
        .select(outputWorkflowSelect)
        .single()
      if (workflowPatchResponse.error || !workflowPatchResponse.data) {
        throw new Error(workflowPatchResponse.error?.message ?? 'Failed to update workflow upgrade metadata.')
      }

      const [refreshedNodeResponse, refreshedEdgeResponse] = await Promise.all([
        client
          .from('output_workflow_nodes')
          .select(outputWorkflowNodeSelect)
          .eq('workflow_id', payload.workflowId)
          .order('created_at', { ascending: true }),
        client
          .from('output_workflow_edges')
          .select(outputWorkflowEdgeSelect)
          .eq('workflow_id', payload.workflowId)
          .order('created_at', { ascending: true }),
      ])
      if (refreshedNodeResponse.error) throw new Error(refreshedNodeResponse.error.message)
      if (refreshedEdgeResponse.error) throw new Error(refreshedEdgeResponse.error.message)

      return json(outputWorkflowUpgradeResponseSchema.parse({
        ok: true,
        workflow: mapOutputWorkflowRow(workflowPatchResponse.data),
        nodes: (refreshedNodeResponse.data ?? []).map(mapOutputWorkflowNodeRow),
        edges: (refreshedEdgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow),
        addedNodeKeys: desiredNodes.map((node) => node.key),
        addedEdgeKeys: desiredEdges.map((edge) => edge.key),
        dirtiedNodeKeys: [...new Set(dirtiedNodeKeys)],
        alreadyCurrent: desiredNodes.length === 0 && desiredEdges.length === 0 && concurrencyNodeUpdates.length === 0,
      }))
    }

    const coverPromptNode = nodeBase({
      key: 'cover_prompt',
      nodeType: 'text_llm',
      label: 'Cover Prompt',
      x: Math.max(640, maxPosition.x - 1700),
      y: Math.max(360, maxPosition.y + 160),
      inputs: { prompt: 'Design a finished front cover image prompt for this ebook, including exact title typography.' },
      config: {
        purpose: 'ebook_cover_prompt',
        skillKeys: ['image_prompt_visual_only', 'provider_prompt_hygiene'],
        autoSkillTags: ['image_prompt', 'visual_only', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm', continueOnError: true },
      },
    })
    const coverImageNode = nodeBase({
      key: 'cover_image',
      nodeType: 'image_generation',
      label: 'Cover Image',
      x: coverPromptNode.position.x + 280,
      y: coverPromptNode.position.y,
      config: {
        purpose: 'ebook_cover_image',
        role: 'ebook_cover',
        model: 'openai/gpt-image-2',
        quality: 'high',
        outputFormat: 'png',
        imageSize: { width: 1792, height: 2688 },
        skillKeys: ['image_prompt_visual_only', 'entity_reference_fidelity', 'environment_staging', 'provider_prompt_hygiene'],
        autoSkillTags: ['image_prompt', 'visual_only', 'entity_reference', 'environment', 'provider_hygiene'],
        guidanceMode: 'strict',
        execution: {
          resourceClass: 'image',
          groupKey: 'ebook_cover',
          maxConcurrency: 1,
          continueOnError: true,
        },
      },
    })
    const desiredNodes = [coverPromptNode, coverImageNode].filter((node) => !nodeKeys.has(node.key))
    const availableNodeKeys = new Set([
      ...nodeKeys,
      ...desiredNodes.map((node) => node.key),
    ])
    const desiredEdges = [
      edgeBase('world_context', 'context', 'cover_prompt', 'context'),
      edgeBase('skill_context', 'guidance', 'cover_prompt', 'guidance'),
      edgeBase('cover_prompt', 'text', 'cover_image', 'prompt'),
      edgeBase('skill_context', 'guidance', 'cover_image', 'guidance'),
      edgeBase('cover_image', 'image', 'document_render', 'cover', { optional: true }),
    ].filter((edge) => (
      !edgeKeys.has(edge.key)
      && availableNodeKeys.has(edge.sourceNodeKey)
      && availableNodeKeys.has(edge.targetNodeKey)
    ))

    const combinedNodes = [
      ...existingNodes.map((node) => ({ key: node.key })),
      ...desiredNodes.map((node) => ({ key: node.key })),
    ]
    const combinedEdges = [
      ...existingEdges.map((edge) => ({
        sourceNodeKey: edge.sourceNodeKey,
        sourcePort: edge.sourcePort,
        targetNodeKey: edge.targetNodeKey,
        targetPort: edge.targetPort,
        metadata: edge.metadata,
      })),
      ...desiredEdges,
    ]
    const plan = buildOutputWorkflowExecutionPlan(combinedNodes, combinedEdges)
    if (plan.diagnostics.length > 0) {
      throw new HttpError(400, plan.diagnostics.join(' '))
    }

    if (desiredNodes.length > 0) {
      const insertResponse = await client
        .from('output_workflow_nodes')
        .insert(desiredNodes.map((node) => ({
          workflow_id: payload.workflowId,
          draft_id: payload.draftId,
          key: node.key,
          node_type: node.nodeType,
          label: node.label,
          position: node.position,
          config: node.config,
          inputs: node.inputs,
          outputs: node.outputs,
          dirty: node.dirty,
          input_hash: node.inputHash,
          output_hash: node.outputHash,
          metadata: node.metadata,
        })))
      if (insertResponse.error) throw new Error(insertResponse.error.message)
    }

    if (desiredEdges.length > 0) {
      const insertResponse = await client
        .from('output_workflow_edges')
        .insert(desiredEdges.map((edge) => ({
          workflow_id: payload.workflowId,
          draft_id: payload.draftId,
          key: edge.key,
          source_node_key: edge.sourceNodeKey,
          source_port: edge.sourcePort,
          target_node_key: edge.targetNodeKey,
          target_port: edge.targetPort,
          metadata: edge.metadata,
        })))
      if (insertResponse.error) throw new Error(insertResponse.error.message)
    }

    const dirtiedNodeKeys = [
      ...desiredNodes.map((node) => node.key),
      ...(nodeKeys.has('document_render') ? ['document_render'] : []),
      ...(nodeKeys.has('artifact') ? ['artifact'] : []),
    ]
    if (dirtiedNodeKeys.length > 0) {
      const dirtyResponse = await client
        .from('output_workflow_nodes')
        .update({ dirty: true, updated_at: new Date().toISOString() })
        .eq('workflow_id', payload.workflowId)
        .in('key', dirtiedNodeKeys)
      if (dirtyResponse.error) throw new Error(dirtyResponse.error.message)
    }

    const workflowPatchResponse = await client
      .from('output_workflows')
      .update({
        metadata: {
          ...workflow.metadata,
          upgradedPresetFeatures: {
            ...((workflow.metadata.upgradedPresetFeatures && typeof workflow.metadata.upgradedPresetFeatures === 'object' && !Array.isArray(workflow.metadata.upgradedPresetFeatures))
              ? workflow.metadata.upgradedPresetFeatures as Record<string, unknown>
              : {}),
            ebookCoverBranch: true,
          },
          lastPresetUpgradeAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.workflowId)
      .select(outputWorkflowSelect)
      .single()
    if (workflowPatchResponse.error || !workflowPatchResponse.data) {
      throw new Error(workflowPatchResponse.error?.message ?? 'Failed to update workflow upgrade metadata.')
    }

    const [refreshedNodeResponse, refreshedEdgeResponse] = await Promise.all([
      client
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
      client
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', payload.workflowId)
        .order('created_at', { ascending: true }),
    ])
    if (refreshedNodeResponse.error) throw new Error(refreshedNodeResponse.error.message)
    if (refreshedEdgeResponse.error) throw new Error(refreshedEdgeResponse.error.message)

    return json(outputWorkflowUpgradeResponseSchema.parse({
      ok: true,
      workflow: mapOutputWorkflowRow(workflowPatchResponse.data),
      nodes: (refreshedNodeResponse.data ?? []).map(mapOutputWorkflowNodeRow),
      edges: (refreshedEdgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow),
      addedNodeKeys: desiredNodes.map((node) => node.key),
      addedEdgeKeys: desiredEdges.map((edge) => edge.key),
      dirtiedNodeKeys,
      alreadyCurrent: desiredNodes.length === 0 && desiredEdges.length === 0,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to upgrade output workflow preset.')
  }
})
