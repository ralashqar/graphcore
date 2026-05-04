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

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'upgrade-output-workflow-preset')
    const payload = outputWorkflowUpgradeRequestSchema.parse(await request.json())
    if (payload.preset !== 'ebook_from_world') {
      throw new HttpError(400, 'Only ebook workflow upgrades are supported in V1.')
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
    if (workflow.preset !== 'ebook_from_world') {
      throw new HttpError(400, 'Only ebook workflows can be upgraded with the cover branch.')
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
