import { HttpError } from './http.ts'
import {
  loadChildWorkflowGraphBundle,
  loadWorkflowNodesByKey,
} from './output-workflow-child-utils.ts'
import {
  ensureSequenceAnimaticSceneShotPlanWorkflows,
  mapOutputRequestRow,
  outputRequestSelect,
  startSequenceAnimaticChildRun,
} from './output-workflow.ts'
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

export async function runSequenceAnimaticSceneWorkflowCommand(input: {
  admin: {
    from: (table: string) => any
  }
  payload: unknown
}) {
  const { admin } = input
  const payload = sequenceAnimaticSceneWorkflowEnsureRequestSchema.parse(input.payload)

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

  const masterNodes = await loadWorkflowNodesByKey({
    client: admin,
    workflowId: masterRequest.workflowId,
    nodeKeys: [
      'cinematic_v3_screenplay_author',
      'sequence_animatic_scene_graph_assignment',
      'sequence_animatic_scene_register',
      'cinematic_v3_reference_select',
      'world_context',
      'skill_context',
    ],
  })
  const nodeByKey = new Map(masterNodes.map((node) => [node.key, node]))
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

  const requestedSceneIds = payload.sceneIds && payload.sceneIds.length > 0
    ? payload.sceneIds
    : payload.startSceneId
      ? [payload.startSceneId]
      : undefined

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
    sceneIds: requestedSceneIds,
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

  const [latestMasterResponse, latestChildrenResponse] = await Promise.all([
    admin.from('output_requests').select(outputRequestSelect).eq('id', masterRequest.id).single(),
    admin.from('output_requests').select(outputRequestSelect).in('id', childRequests.map((child) => child.id)),
  ])
  if (latestMasterResponse.error || !latestMasterResponse.data) throw new Error(latestMasterResponse.error?.message ?? 'Failed to reload master request.')
  if (latestChildrenResponse.error) throw new Error(latestChildrenResponse.error.message)
  const latestChildren = (latestChildrenResponse.data ?? []).map(mapOutputRequestRow)
  const childGraphBundle = await loadChildWorkflowGraphBundle({
    client: admin,
    workflowIds: latestChildren.map((child) => child.workflowId),
  })

  return sequenceAnimaticSceneWorkflowEnsureResponseSchema.parse({
    ok: true,
    masterRequest: mapOutputRequestRow(latestMasterResponse.data),
    childRequests: latestChildren,
    workflows: childGraphBundle.workflows,
    nodes: childGraphBundle.nodes,
    edges: childGraphBundle.edges,
  })
}
