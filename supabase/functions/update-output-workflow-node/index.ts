import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
} from '../_shared/output-workflow.ts'
import {
  isOutputWorkflowProviderBackedNodeType,
  markDirtyOutputWorkflowNodes,
  outputWorkflowNodeUpdateRequestSchema,
  outputWorkflowNodeUpdateResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'update-output-workflow-node')
    const payload = outputWorkflowNodeUpdateRequestSchema.parse(await request.json())

    const workflowResponse = await client
      .from('output_workflows')
      .select('id, project_id, draft_id')
      .eq('id', payload.workflowId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (workflowResponse.error || !workflowResponse.data) {
      throw new HttpError(404, 'Output workflow not found.')
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

    const nodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)
    const edges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)
    const targetNode = nodes.find((node) => node.key === payload.nodeKey)
    if (!targetNode) throw new HttpError(404, 'Output workflow node not found.')

    const updatePayload: Record<string, unknown> = {}
    if (payload.position) updatePayload.position = payload.position
    if (payload.metadata) {
      updatePayload.metadata = {
        ...targetNode.metadata,
        display: {
          ...(targetNode.metadata.display && typeof targetNode.metadata.display === 'object' && !Array.isArray(targetNode.metadata.display)
            ? targetNode.metadata.display as Record<string, unknown>
            : {}),
          ...payload.metadata,
        },
      }
    }

    let executionChanged = false
    if (payload.inputs && Object.prototype.hasOwnProperty.call(payload.inputs, 'prompt')) {
      if (!isOutputWorkflowProviderBackedNodeType(targetNode.nodeType)) {
        throw new HttpError(400, 'Only provider-backed workflow nodes can edit prompt inputs.')
      }
      const nextPrompt = payload.inputs.prompt ?? ''
      if (targetNode.inputs.prompt !== nextPrompt) {
        updatePayload.inputs = {
          ...targetNode.inputs,
          prompt: nextPrompt,
        }
        executionChanged = true
      }
    }

    if (Object.keys(updatePayload).length === 0 && !executionChanged) {
      return json(outputWorkflowNodeUpdateResponseSchema.parse({
        ok: true,
        node: targetNode,
        nodes,
      }))
    }

    const now = new Date().toISOString()
    const dirtyByKey = new Map(
      executionChanged
        ? markDirtyOutputWorkflowNodes({
          changedNodeKeys: [targetNode.key],
          nodes,
          edges,
        }).map((entry) => [entry.key, entry.dirty] as const)
        : [],
    )

    if (executionChanged) {
      await Promise.all(nodes.map(async (node) => {
        const patch: Record<string, unknown> = {
          dirty: node.dirty || Boolean(dirtyByKey.get(node.key)),
          updated_at: now,
        }
        if (node.key === targetNode.key) Object.assign(patch, updatePayload)
        const response = await client
          .from('output_workflow_nodes')
          .update(patch)
          .eq('workflow_id', payload.workflowId)
          .eq('key', node.key)
        if (response.error) throw new Error(response.error.message)
      }))
    } else {
      const response = await client
        .from('output_workflow_nodes')
        .update({
          ...updatePayload,
          updated_at: now,
        })
        .eq('workflow_id', payload.workflowId)
        .eq('key', targetNode.key)
      if (response.error) throw new Error(response.error.message)
    }

    const refreshedResponse = await client
      .from('output_workflow_nodes')
      .select(outputWorkflowNodeSelect)
      .eq('workflow_id', payload.workflowId)
      .order('created_at', { ascending: true })
    if (refreshedResponse.error) throw new Error(refreshedResponse.error.message)
    const refreshedNodes = (refreshedResponse.data ?? []).map(mapOutputWorkflowNodeRow)
    const refreshedTarget = refreshedNodes.find((node) => node.key === payload.nodeKey)
    if (!refreshedTarget) throw new HttpError(404, 'Updated output workflow node could not be loaded.')

    return json(outputWorkflowNodeUpdateResponseSchema.parse({
      ok: true,
      node: refreshedTarget,
      nodes: refreshedNodes,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to update output workflow node.')
  }
})
