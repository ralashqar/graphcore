import { z } from 'npm:zod@^4.1.0'

import {
  applyCinematicDirectorPatch,
  buildCinematicDirectorRunMetadata,
  cinematicDirectorPatchPreviewSchema,
  type CinematicDirectorPatchPreview,
} from '../../../src/domain/cinematicDirectorNotes.ts'
import {
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ShotPlanSchema,
} from '../../../src/domain/cinematics.ts'
import {
  hashOutputWorkflowValue,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
} from '../../../src/domain/outputWorkflow.ts'
import {
  mapOutputWorkflowEdgeRow,
  mapOutputWorkflowNodeRow,
  mapOutputWorkflowRow,
  outputWorkflowEdgeSelect,
  outputWorkflowNodeSelect,
  outputWorkflowSelect,
  loadOutputWorkflowRunBundle,
} from './output-workflow.ts'

type DatabaseClient = {
  from: (table: string) => unknown
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasRecordPayload(value: unknown) {
  return Object.keys(readRecord(value)).length > 0
}

function readOutputRecord(outputs: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const record = readRecord(outputs[key])
    if (Object.keys(record).length > 0) return record
  }
  return null
}

function readNonEmptyRecord(value: unknown) {
  const record = readRecord(value)
  return Object.keys(record).length > 0 ? record : null
}

function compactNodeOutputs(node: OutputWorkflowNode | null | undefined, step: { outputs?: unknown } | null | undefined) {
  const nodeOutputs = readRecord(node?.outputs)
  if (hasRecordPayload(nodeOutputs)) return nodeOutputs
  return readRecord(step?.outputs)
}

export type CinematicDirectorContext = {
  workflow: OutputWorkflow
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
  run: OutputWorkflowRun | null
  shotPlan: z.infer<typeof cinematicV2ShotPlanSchema>
  sceneState: z.infer<typeof cinematicV2SceneStateSchema> | null
  layoutPlan: z.infer<typeof cinematicV2SceneLayoutPlanSchema> | null
}

export async function loadCinematicDirectorContext(
  client: DatabaseClient,
  input: { projectId: string; draftId: string; workflowId: string; runId?: string | null },
): Promise<CinematicDirectorContext> {
  let workflow: OutputWorkflow
  let nodes: OutputWorkflowNode[]
  let edges: OutputWorkflowEdge[]
  let run: OutputWorkflowRun | null = null

  if (input.runId) {
    const bundle = await loadOutputWorkflowRunBundle(client as never, input.runId, { includeNodeOutputs: true, includeRunPayload: true })
    workflow = bundle.workflow
    nodes = bundle.nodes
    edges = bundle.edges
    run = bundle.run
  } else {
    const [workflowResponse, nodeResponse, edgeResponse] = await Promise.all([
      (client.from('output_workflows') as any)
        .select(outputWorkflowSelect)
        .eq('id', input.workflowId)
        .eq('project_id', input.projectId)
        .eq('draft_id', input.draftId)
        .single(),
      (client.from('output_workflow_nodes') as any)
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', input.workflowId)
        .order('created_at', { ascending: true }),
      (client.from('output_workflow_edges') as any)
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', input.workflowId)
        .order('created_at', { ascending: true }),
    ])
    if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Output workflow not found.')
    if (nodeResponse.error) throw new Error(nodeResponse.error.message)
    if (edgeResponse.error) throw new Error(edgeResponse.error.message)
    workflow = mapOutputWorkflowRow(workflowResponse.data)
    nodes = (nodeResponse.data ?? []).map(mapOutputWorkflowNodeRow)
    edges = (edgeResponse.data ?? []).map(mapOutputWorkflowEdgeRow)
  }

  if (workflow.id !== input.workflowId || workflow.projectId !== input.projectId || workflow.draftId !== input.draftId) {
    throw new Error('Output workflow does not match the requested project/draft.')
  }

  const workflowMetadata = readRecord(workflow.metadata)
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]))
  const stepByNodeKey = new Map((run?.steps ?? []).map((step) => [step.nodeKey, step]))
  const outputForNode = (key: string) => compactNodeOutputs(nodeByKey.get(key), stepByNodeKey.get(key))
  const shotPlanRaw = readNonEmptyRecord(workflowMetadata.cinematicV2ShotPlan)
    || readOutputRecord(outputForNode('cinematic_v2_shot_plan'), ['shotPlan', 'shot_plan'])
    || readOutputRecord(outputForNode('cinematic_v2_dynamic_shot_fanout'), ['shotPlan', 'shot_plan'])
  const sceneStateRaw = readNonEmptyRecord(workflowMetadata.cinematicV2SceneState)
    || readOutputRecord(outputForNode('cinematic_v2_scene_compile'), ['sceneState', 'scene_state'])
  const layoutPlanRaw = readNonEmptyRecord(workflowMetadata.cinematicV2LayoutPlan)
    || readOutputRecord(outputForNode('cinematic_v2_layout_plan'), ['layoutPlan', 'layout_plan'])

  const shotPlan = cinematicV2ShotPlanSchema.parse(shotPlanRaw)
  const sceneStateParsed = cinematicV2SceneStateSchema.safeParse(sceneStateRaw)
  const layoutPlanParsed = cinematicV2SceneLayoutPlanSchema.safeParse(layoutPlanRaw)
  return {
    workflow,
    nodes,
    edges,
    run,
    shotPlan,
    sceneState: sceneStateParsed.success ? sceneStateParsed.data : null,
    layoutPlan: layoutPlanParsed.success ? layoutPlanParsed.data : null,
  }
}

function outputPatchForNode(key: string, next: {
  shotPlan: unknown
  sceneState: unknown
  layoutPlan: unknown
}) {
  if (key === 'cinematic_v2_shot_plan' || key === 'cinematic_v2_dynamic_shot_fanout') {
    return { shotPlan: next.shotPlan, shot_plan: next.shotPlan }
  }
  if (key === 'cinematic_v2_scene_compile') {
    return { sceneState: next.sceneState, scene_state: next.sceneState }
  }
  if (key === 'cinematic_v2_layout_plan') {
    return { layoutPlan: next.layoutPlan, layout_plan: next.layoutPlan }
  }
  return null
}

export async function applyCinematicDirectorPatchToWorkflow(input: {
  client: DatabaseClient
  context: CinematicDirectorContext
  preview: CinematicDirectorPatchPreview
  userId: string
}) {
  const preview = cinematicDirectorPatchPreviewSchema.parse(input.preview)
  const now = new Date().toISOString()
  const versionId = crypto.randomUUID()
  const next = applyCinematicDirectorPatch({
    shotPlan: input.context.shotPlan,
    sceneState: input.context.sceneState ?? undefined,
    layoutPlan: input.context.layoutPlan ?? undefined,
    operations: preview.operations,
  })
  const dirtyNodeKeys = new Set(preview.regenerationPlan.dirtyNodeKeys)
  const staleVideoKeys = new Set([...dirtyNodeKeys].filter((key) => key.endsWith('_video')))
  const priorMetadata = readRecord(input.context.workflow.metadata)
  const priorEdits = Array.isArray(priorMetadata.cinematicV2DirectorEdits)
    ? priorMetadata.cinematicV2DirectorEdits.filter((entry) => entry && typeof entry === 'object')
    : []
  const nextEdit = {
    versionId,
    parentVersionId: typeof priorMetadata.cinematicV2DirectorVersionId === 'string' ? priorMetadata.cinematicV2DirectorVersionId : null,
    userNote: preview.userNote,
    scope: preview.scope,
    patch: preview.operations,
    inversePatch: next.inverseOperations,
    affectedNodeKeys: preview.regenerationPlan.dirtyNodeKeys,
    regenerationPlan: preview.regenerationPlan,
    createdAt: now,
    appliedBy: input.userId,
  }
  const workflowMetadata = {
    ...priorMetadata,
    cinematicPipelineVersion: 'v2_shot_orchestration',
    cinematicV2ShotPlan: next.shotPlan,
    ...(next.sceneState ? { cinematicV2SceneState: next.sceneState } : {}),
    ...(next.layoutPlan ? { cinematicV2LayoutPlan: next.layoutPlan } : {}),
    cinematicV2DirectorVersionId: versionId,
    cinematicV2DirectorEdits: [...priorEdits.slice(-19), nextEdit],
  }

  const workflowResponse = await (input.client.from('output_workflows') as any)
    .update({ metadata: workflowMetadata, updated_at: now })
    .eq('id', input.context.workflow.id)
    .select(outputWorkflowSelect)
    .single()
  if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Failed to update output workflow.')

  await Promise.all(input.context.nodes.map(async (node) => {
    const sourcePatch = outputPatchForNode(node.key, {
      shotPlan: next.shotPlan,
      sceneState: next.sceneState,
      layoutPlan: next.layoutPlan,
    })
    const patch: Record<string, unknown> = {
      updated_at: now,
    }
    if (sourcePatch) {
      const outputs = {
        ...readRecord(node.outputs),
        ...sourcePatch,
        directorNoteVersionId: versionId,
      }
      patch.outputs = outputs
      patch.output_hash = hashOutputWorkflowValue(outputs)
      patch.dirty = false
      patch.metadata = {
        ...node.metadata,
        directorNoteSource: {
          versionId,
          patchedAt: now,
        },
      }
    } else if (dirtyNodeKeys.has(node.key)) {
      patch.dirty = true
      patch.metadata = {
        ...node.metadata,
        ...(staleVideoKeys.has(node.key)
          ? {
              stale: true,
              staleReason: 'cinematic_v2_director_note',
              staleDirectorNoteVersionId: versionId,
              staleAt: now,
            }
          : {}),
      }
    } else {
      return
    }
    const response = await (input.client.from('output_workflow_nodes') as any)
      .update(patch)
      .eq('workflow_id', input.context.workflow.id)
      .eq('key', node.key)
    if (response.error) throw new Error(response.error.message)
  }))

  const refreshedNodesResponse = await (input.client.from('output_workflow_nodes') as any)
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.context.workflow.id)
    .order('created_at', { ascending: true })
  if (refreshedNodesResponse.error) throw new Error(refreshedNodesResponse.error.message)

  return {
    versionId,
    workflow: mapOutputWorkflowRow(workflowResponse.data),
    nodes: (refreshedNodesResponse.data ?? []).map(mapOutputWorkflowNodeRow),
    regenerationRunRequest: preview.regenerationPlan.targetNodeKeys.length > 0
      ? buildCinematicDirectorRunMetadata({ preview, sourceRunId: input.context.run?.id ?? null })
      : null,
  }
}
