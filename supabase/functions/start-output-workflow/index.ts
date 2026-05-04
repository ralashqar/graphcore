import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowSelect,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputWorkflowStartResponseSchema,
  validateOutputWorkflowGraph,
} from '../_shared/output-workflow.ts'
import { outputWorkflowStartRequestSchema } from '../../../src/domain/outputWorkflow.ts'

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'workflow'
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'start-output-workflow')
    const payload = outputWorkflowStartRequestSchema.parse(await request.json())
    const validation = validateOutputWorkflowGraph({ nodes: payload.plan.nodes, edges: payload.plan.edges })
    if (!validation.ok) throw new HttpError(400, validation.diagnostics.join(' '))

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new HttpError(404, 'Draft not found or not editable.')

    const keySeed = slugify(payload.plan.name)
    const workflowKey = `output.${keySeed}.${crypto.randomUUID().slice(0, 8)}`
    const workflowResponse = await client
      .from('output_workflows')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        key: workflowKey,
        name: payload.plan.name,
        description: payload.plan.description,
        preset: payload.plan.preset,
        status: 'active',
        created_by: user.id,
        metadata: {
          prompt: payload.plan.prompt,
          targetFormat: payload.plan.targetFormat,
          sourceEntityKeys: payload.plan.sourceEntityKeys,
          sourceSequenceUnitKeys: payload.plan.sourceSequenceUnitKeys,
          diagnostics: payload.plan.diagnostics,
        },
      })
      .select(outputWorkflowSelect)
      .single()
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to create output workflow.')

    const workflow = mapOutputWorkflowRow(workflowResponse.data)
    const nodeResponse = await client
      .from('output_workflow_nodes')
      .insert(payload.plan.nodes.map((node) => ({
        workflow_id: workflow.id,
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
      .select(outputWorkflowNodeSelect)
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)

    const edgeResponse = await client
      .from('output_workflow_edges')
      .insert(payload.plan.edges.map((edge) => ({
        workflow_id: workflow.id,
        draft_id: payload.draftId,
        key: edge.key,
        source_node_key: edge.sourceNodeKey,
        source_port: edge.sourcePort,
        target_node_key: edge.targetNodeKey,
        target_port: edge.targetPort,
        metadata: edge.metadata,
      })))
      .select(outputWorkflowEdgeSelect)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)

    return json(outputWorkflowStartResponseSchema.parse({
      ok: true,
      workflow,
      nodes: (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow),
      edges: (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start output workflow.')
  }
})
