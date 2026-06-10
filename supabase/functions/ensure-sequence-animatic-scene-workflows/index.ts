import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  ensureSequenceAnimaticSceneShotPlanWorkflows,
  mapOutputRequestRow,
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputRequestSelect,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowSelect,
  startSequenceAnimaticChildRun,
} from '../_shared/output-workflow.ts'
import {
  sequenceAnimaticSceneWorkflowEnsureRequestSchema,
  sequenceAnimaticSceneWorkflowEnsureResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse
  try {
    await requireUserClient(request, 'ensure-sequence-animatic-scene-workflows')
    const admin = createAdminClient('ensure-sequence-animatic-scene-workflows')
    const payload = sequenceAnimaticSceneWorkflowEnsureRequestSchema.parse(await request.json())

    const masterResponse = await admin
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', payload.masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) {
      throw new HttpError(404, 'Sequence animatic master request was not found.')
    }
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    if (!masterRequest.workflowId) throw new HttpError(409, 'Master request has no workflow yet.')

    // Scene ensure inputs come from the master workflow's persisted node outputs.
    const nodesResponse = await admin
      .from('output_workflow_nodes')
      .select(outputWorkflowNodeSelect)
      .eq('workflow_id', masterRequest.workflowId)
      .in('key', [
        'cinematic_v3_screenplay_author',
        'sequence_animatic_scene_graph_assignment',
        'sequence_animatic_scene_register',
        'cinematic_v3_reference_select',
        'world_context',
        'skill_context',
      ])
    if (nodesResponse.error) throw new Error(nodesResponse.error.message)
    const nodeByKey = new Map((nodesResponse.data ?? []).map(mapOutputWorkflowNodeRow).map((node) => [node.key, node]))
    const screenplayText = readText(asRecord(nodeByKey.get('cinematic_v3_screenplay_author')?.outputs).text)
    const registerNode = nodeByKey.get('sequence_animatic_scene_register')
    const registerOutputs = asRecord(registerNode?.outputs)
    const registerConfig = asRecord(registerNode?.config)
    const scenePackageOutput = asRecord(
      registerOutputs.scenePackage
      ?? registerOutputs.scene_package
      ?? asRecord(nodeByKey.get('sequence_animatic_scene_graph_assignment')?.outputs).scenePackage
      ?? asRecord(nodeByKey.get('sequence_animatic_scene_graph_assignment')?.outputs).scene_package,
    )
    if (!screenplayText || Object.keys(scenePackageOutput).length === 0) {
      throw new HttpError(409, 'The master run has not produced a screenplay and scene assignment yet.')
    }
    const referenceOutputs = asRecord(nodeByKey.get('cinematic_v3_reference_select')?.outputs)
    const assetPack = asRecord(referenceOutputs.assetPack ?? referenceOutputs.asset_pack)
    const context = asRecord(asRecord(nodeByKey.get('world_context')?.outputs).context)
    const guidance = asRecord(asRecord(nodeByKey.get('skill_context')?.outputs).guidance)

    const childRequests = await ensureSequenceAnimaticSceneShotPlanWorkflows({
      client: admin,
      masterRequest,
      scenePackageOutput,
      screenplayText,
      assetPack,
      context,
      guidance,
      maxShotCount: Number(registerConfig.maxShotCount ?? 0) || 150,
      aspectRatio: readText(registerConfig.aspectRatio) || '16:9',
      resolution: readText(registerConfig.resolution) || '720p',
      sceneIds: payload.sceneIds,
    })

    if (payload.startSceneId) {
      const sceneChild = childRequests.find((child) => readText(asRecord(child.metadata).sceneId) === payload.startSceneId)
      if (sceneChild?.workflowId && sceneChild.status !== 'running' && sceneChild.status !== 'queued' && sceneChild.status !== 'planning') {
        await startSequenceAnimaticChildRun({
          client: admin,
          request: sceneChild,
          workflowId: sceneChild.workflowId,
          runIntent: 'generate_scene_shot_plan',
          targetNodeKeys: ['sequence_animatic_director_plan_artifact', 'artifact'],
        })
      }
    }

    const workflowIds = childRequests.map((child) => child.workflowId).filter((id): id is string => Boolean(id))
    const [workflowRows, nodeRows, edgeRows, latestMasterResponse, latestChildrenResponse] = await Promise.all([
      workflowIds.length > 0
        ? admin.from('output_workflows').select(outputWorkflowSelect).in('id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      workflowIds.length > 0
        ? admin.from('output_workflow_nodes').select(outputWorkflowNodeSelect).in('workflow_id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      workflowIds.length > 0
        ? admin.from('output_workflow_edges').select(outputWorkflowEdgeSelect).in('workflow_id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from('output_requests').select(outputRequestSelect).eq('id', masterRequest.id).single(),
      admin.from('output_requests').select(outputRequestSelect).in('id', childRequests.map((child) => child.id)),
    ])
    if (workflowRows.error) throw new Error(workflowRows.error.message)
    if (nodeRows.error) throw new Error(nodeRows.error.message)
    if (edgeRows.error) throw new Error(edgeRows.error.message)
    if (latestMasterResponse.error || !latestMasterResponse.data) throw new Error(latestMasterResponse.error?.message ?? 'Failed to reload master request.')
    if (latestChildrenResponse.error) throw new Error(latestChildrenResponse.error.message)

    return json(sequenceAnimaticSceneWorkflowEnsureResponseSchema.parse({
      ok: true,
      masterRequest: mapOutputRequestRow(latestMasterResponse.data),
      childRequests: (latestChildrenResponse.data ?? []).map(mapOutputRequestRow),
      workflows: (workflowRows.data ?? []).map(mapOutputWorkflowRow),
      nodes: (nodeRows.data ?? []).map(mapOutputWorkflowNodeRow),
      edges: (edgeRows.data ?? []).map(mapOutputWorkflowEdgeRow),
    }))
  } catch (error) {
    return errorResponse(error)
  }
})
