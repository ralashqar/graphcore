import {
  childWorkflowUtilityOutputSchema,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  ensureChildWorkflow,
  waitForChildWorkflowReadiness,
} from './output-workflow-child-utils.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type UtilityNodeExecutionContext = {
  client: unknown
  inputHash: string
  node: {
    config: unknown
  }
  workflow: {
    id: string
  }
  run: {
    id: string
    projectId: string
    draftId: string
    workflowId: string
    metadata?: unknown
  }
  upstream: Record<string, Record<string, unknown>>
}

type DatabaseClient = {
  from: (table: string) => any
}

type UtilityNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
}

export type WorkflowUtilityNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  hashOutputWorkflowValue: (value: unknown) => string
}

function firstUpstreamRecord(upstream: Record<string, Record<string, unknown>>, fields: string[], helpers: WorkflowUtilityNodePackHelpers) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = helpers.asRecord(outputs[field])
      if (Object.keys(value).length > 0) return value
    }
  }
  return {}
}

function firstUpstreamChildOutput(upstream: Record<string, Record<string, unknown>>) {
  for (const outputs of Object.values(upstream)) {
    const parsed = childWorkflowUtilityOutputSchema.safeParse(outputs)
    if (parsed.success) return parsed.data
  }
  return null
}

function collectUpstreamChildOutputs(upstream: Record<string, Record<string, unknown>>) {
  const children: Array<ReturnType<typeof childWorkflowUtilityOutputSchema.parse>> = []
  for (const outputs of Object.values(upstream)) {
    const direct = childWorkflowUtilityOutputSchema.safeParse(outputs)
    if (direct.success) {
      children.push(direct.data)
      continue
    }
    for (const value of Object.values(outputs)) {
      const nested = childWorkflowUtilityOutputSchema.safeParse(value)
      if (nested.success) children.push(nested.data)
      if (Array.isArray(value)) {
        for (const item of value) {
          const parsed = childWorkflowUtilityOutputSchema.safeParse(item)
          if (parsed.success) children.push(parsed.data)
        }
      }
    }
  }
  const seen = new Set<string>()
  return children.filter((child) => {
    if (seen.has(child.childRequestId)) return false
    seen.add(child.childRequestId)
    return true
  })
}

function optionalSkippedChildOutput(input: {
  context: UtilityNodeExecutionContext
  helpers: WorkflowUtilityNodePackHelpers
  stage: string
  reason: string
}) {
  return childWorkflowUtilityOutputSchema.parse({
    childRequestId: `skipped:${input.context.node.config && typeof input.context.node.config === 'object' ? input.helpers.readText((input.context.node.config as Record<string, unknown>).stage) || input.stage : input.stage}`,
    childWorkflowId: 'skipped',
    childRunId: null,
    status: 'completed',
    readyArtifactRoles: [],
    readyArtifactKeys: [],
    waiting: false,
    resumable: false,
    diagnostics: [input.reason],
    metadata: {
      skipped: true,
      stage: input.stage,
      reason: input.reason,
      parentWorkflowId: input.context.workflow.id,
      parentRunId: input.context.run.id,
    },
  })
}

function result(input: {
  context: UtilityNodeExecutionContext
  helpers: WorkflowUtilityNodePackHelpers
  outputs: Record<string, unknown>
  model: string
}): UtilityNodeExecutionResult {
  return createWorkflowNodeExecutionResult<UtilityNodeExecutionResult>(input)
}

async function ensureChildWorkflowNode(
  context: UtilityNodeExecutionContext,
  helpers: WorkflowUtilityNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamChild = firstUpstreamRecord(context.upstream, ['childWorkflow', 'child_workflow', 'childWorkflowSpec', 'child_workflow_spec'], helpers)
  const configuredChild = helpers.asRecord(config.childWorkflow ?? config.child_workflow)
  const child = Object.keys(configuredChild).length > 0 ? configuredChild : upstreamChild
  const workflow = helpers.asRecord(child.workflow)
  const request = helpers.asRecord(child.request)
  const nodes = Array.isArray(child.nodes) ? child.nodes.map(helpers.asRecord) : []
  const edges = Array.isArray(child.edges) ? child.edges.map(helpers.asRecord) : []
  const parentRequestId = helpers.readText(config.parentRequestId) || helpers.readText(helpers.asRecord(context.run.metadata).outputRequestId)
  const role = helpers.readText(child.role ?? config.role)
  const identityKey = helpers.readText(child.identityKey ?? child.identity_key ?? config.identityKey) || 'workflowUtilityIdentity'
  const identityValue = helpers.readText(child.identityValue ?? child.identity_value ?? config.identityValue)
  const stage = helpers.readText(config.stage ?? child.stage ?? role) || 'child_workflow'
  const optional = config.optional === true || config.optionalChildWorkflow === true || config.optional_child_workflow === true
  if (Object.keys(child).length === 0 && optional) {
    const outputs = optionalSkippedChildOutput({
      context,
      helpers,
      stage,
      reason: 'No child workflow spec was provided for this migration-stage utility node.',
    })
    return result({ context, helpers, outputs, model: 'workflow-ensure-child-workflow-skipped-v1' })
  }
  if (!parentRequestId) throw new Error('Ensure child workflow utility requires parentRequestId.')
  if (!role) throw new Error('Ensure child workflow utility requires child role.')
  if (!identityValue) throw new Error('Ensure child workflow utility requires identityValue.')
  if (!helpers.readText(workflow.key)) throw new Error('Ensure child workflow utility requires child workflow rows.')
  if (!helpers.readText(request.title)) throw new Error('Ensure child workflow utility requires child request rows.')

  const ensured = await ensureChildWorkflow({
    client: context.client as never,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    parentRequestId,
    role,
    identityKey,
    identityValue,
    workflow,
    nodes,
    edges,
    request,
  })
  const ensuredRequest = helpers.asRecord(ensured.request)
  const ensuredWorkflow = helpers.asRecord(ensured.workflow)
  const outputs = childWorkflowUtilityOutputSchema.parse({
    childRequestId: helpers.readText(ensuredRequest.id),
    childWorkflowId: helpers.readText(ensuredWorkflow.id),
    childRunId: helpers.readText(ensuredRequest.latest_run_id ?? ensuredRequest.latestRunId) || null,
    status: helpers.readText(ensuredRequest.status) || 'waiting',
    readyArtifactRoles: [],
    readyArtifactKeys: [],
    waiting: !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(helpers.readText(ensuredRequest.status)),
    resumable: true,
    metadata: {
      reused: ensured.reused,
      childNodeCount: ensured.nodes.length,
      childEdgeCount: ensured.edges.length,
    },
  })
  return result({ context, helpers, outputs, model: 'workflow-ensure-child-workflow-v1' })
}

async function waitChildWorkflowNode(
  context: UtilityNodeExecutionContext,
  helpers: WorkflowUtilityNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamChildOutput = firstUpstreamChildOutput(context.upstream)
  if (upstreamChildOutput?.metadata?.skipped === true) {
    return result({ context, helpers, outputs: upstreamChildOutput, model: 'workflow-wait-child-workflow-skipped-v1' })
  }
  const childOutput = firstUpstreamRecord(context.upstream, ['child', 'childWorkflow', 'child_workflow', 'metadata'], helpers)
  const childRequestId = helpers.readText(config.childRequestId)
    || helpers.readText(upstreamChildOutput?.childRequestId)
    || helpers.readText(childOutput.childRequestId)
    || helpers.readText(childOutput.child_request_id)
  if (!childRequestId) throw new Error('Wait child workflow utility requires childRequestId.')
  const outputs = await waitForChildWorkflowReadiness({
    client: context.client as never,
    childRequestId,
    requiredArtifactRoles: helpers.readStringArray(config.requiredArtifactRoles ?? config.required_artifact_roles),
    resumeAfterMs: Number(config.resumeAfterMs ?? config.resume_after_ms) || undefined,
  })
  return result({ context, helpers, outputs, model: 'workflow-wait-child-workflow-v1' })
}

async function registerArtifactProjectionNode(
  context: UtilityNodeExecutionContext,
  helpers: WorkflowUtilityNodePackHelpers,
) {
  const children = collectUpstreamChildOutputs(context.upstream)
  const activeChildren = children.filter((child) => child.waiting || child.status === 'queued' || child.status === 'running' || child.status === 'waiting')
  const readyArtifactRoles = [...new Set(children.flatMap((child) => child.readyArtifactRoles))]
  const readyArtifactKeys = [...new Set(children.flatMap((child) => child.readyArtifactKeys))]
  const outputs = {
    workflowRuntime: {
      activeChildRequestIds: activeChildren.map((child) => child.childRequestId),
      activeChildRunIds: activeChildren.map((child) => child.childRunId).filter(Boolean),
      readyArtifactCount: readyArtifactKeys.length,
      scopedAssetKeys: readyArtifactKeys,
      recoveryHints: children.flatMap((child) => child.diagnostics),
    },
    childRequests: children.map((child) => child.childRequestId),
    child_requests: children.map((child) => child.childRequestId),
    childRunIds: children.map((child) => child.childRunId).filter(Boolean),
    child_run_ids: children.map((child) => child.childRunId).filter(Boolean),
    readyArtifactRoles,
    ready_artifact_roles: readyArtifactRoles,
    readyArtifactKeys,
    ready_artifact_keys: readyArtifactKeys,
    waiting: activeChildren.length > 0,
    metadata: {
      childCount: children.length,
      activeChildCount: activeChildren.length,
    },
  }
  return result({ context, helpers, outputs, model: 'workflow-register-artifact-projection-v1' })
}

async function fanoutChildrenNode(
  context: UtilityNodeExecutionContext,
  helpers: WorkflowUtilityNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const parentRequestId = helpers.readText(config.parentRequestId) || helpers.readText(helpers.asRecord(context.run.metadata).outputRequestId)
  const configured = Array.isArray(config.childWorkflows)
    ? config.childWorkflows
    : Array.isArray(config.child_workflows)
      ? config.child_workflows
      : []
  const upstreamSpecs = Object.values(context.upstream).flatMap((entry) => {
    const direct = entry.childWorkflows ?? entry.child_workflows ?? entry.children
    return Array.isArray(direct) ? direct : []
  })
  const specs = [...configured, ...upstreamSpecs].map(helpers.asRecord).filter((spec) => Object.keys(spec).length > 0)
  const optional = config.optional === true || config.optionalChildWorkflows === true || config.optional_child_workflows === true
  if (specs.length === 0 && optional) {
    const outputs = {
      children: [],
      childRequests: [],
      child_requests: [],
      childRunIds: [],
      child_run_ids: [],
      readyArtifactRoles: [],
      readyArtifactKeys: [],
      waiting: false,
      metadata: {
        skipped: true,
        reason: 'No child workflow specs were provided for this fanout utility node.',
      },
    }
    return result({ context, helpers, outputs, model: 'workflow-fanout-children-skipped-v1' })
  }
  if (!parentRequestId) throw new Error('Fanout children utility requires parentRequestId.')
  const children = []
  for (const spec of specs) {
    const child = helpers.asRecord(spec.childWorkflow ?? spec.child_workflow ?? spec)
    const workflow = helpers.asRecord(child.workflow)
    const request = helpers.asRecord(child.request)
    const nodes = Array.isArray(child.nodes) ? child.nodes.map(helpers.asRecord) : []
    const edges = Array.isArray(child.edges) ? child.edges.map(helpers.asRecord) : []
    const role = helpers.readText(child.role ?? spec.role ?? config.role)
    const identityKey = helpers.readText(child.identityKey ?? child.identity_key ?? spec.identityKey ?? spec.identity_key ?? config.identityKey) || 'workflowUtilityIdentity'
    const identityValue = helpers.readText(child.identityValue ?? child.identity_value ?? spec.identityValue ?? spec.identity_value)
    if (!role) throw new Error('Fanout children utility requires every child spec to include a role.')
    if (!identityValue) throw new Error('Fanout children utility requires every child spec to include an identityValue.')
    if (!helpers.readText(workflow.key)) throw new Error('Fanout children utility requires every child spec to include workflow rows.')
    if (!helpers.readText(request.title)) throw new Error('Fanout children utility requires every child spec to include request rows.')
    const ensured = await ensureChildWorkflow({
      client: context.client as never,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      parentRequestId,
      role,
      identityKey,
      identityValue,
      workflow,
      nodes,
      edges,
      request,
    })
    const ensuredRequest = helpers.asRecord(ensured.request)
    const ensuredWorkflow = helpers.asRecord(ensured.workflow)
    children.push(childWorkflowUtilityOutputSchema.parse({
      childRequestId: helpers.readText(ensuredRequest.id),
      childWorkflowId: helpers.readText(ensuredWorkflow.id),
      childRunId: helpers.readText(ensuredRequest.latest_run_id ?? ensuredRequest.latestRunId) || null,
      status: helpers.readText(ensuredRequest.status) || 'waiting',
      readyArtifactRoles: [],
      readyArtifactKeys: [],
      waiting: !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(helpers.readText(ensuredRequest.status)),
      resumable: true,
      metadata: {
        reused: ensured.reused,
        role,
        identityKey,
        identityValue,
        childNodeCount: ensured.nodes.length,
        childEdgeCount: ensured.edges.length,
      },
    }))
  }
  const activeChildren = children.filter((child) => child.waiting || child.status === 'queued' || child.status === 'running' || child.status === 'waiting')
  const outputs = {
    children,
    childRequests: children.map((child) => child.childRequestId),
    child_requests: children.map((child) => child.childRequestId),
    childRunIds: children.map((child) => child.childRunId).filter(Boolean),
    child_run_ids: children.map((child) => child.childRunId).filter(Boolean),
    readyArtifactRoles: [...new Set(children.flatMap((child) => child.readyArtifactRoles))],
    readyArtifactKeys: [...new Set(children.flatMap((child) => child.readyArtifactKeys))],
    waiting: activeChildren.length > 0,
    metadata: {
      childCount: children.length,
      activeChildCount: activeChildren.length,
    },
  }
  return result({ context, helpers, outputs, model: 'workflow-fanout-children-v1' })
}

async function collectChildArtifactsNode(
  context: UtilityNodeExecutionContext,
  helpers: WorkflowUtilityNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const children = collectUpstreamChildOutputs(context.upstream)
  const workflowIds = [
    ...helpers.readStringArray(config.childWorkflowIds ?? config.child_workflow_ids),
    ...children.map((child) => child.childWorkflowId),
  ].filter((id) => id && id !== 'skipped')
  const requiredRoles = helpers.readStringArray(config.requiredArtifactRoles ?? config.required_artifact_roles)
  const uniqueWorkflowIds = [...new Set(workflowIds)]
  const optional = config.optional === true || config.optionalChildWorkflows === true || config.optional_child_workflows === true
  const artifactResponse = uniqueWorkflowIds.length > 0
    ? await (context.client as DatabaseClient)
        .from('output_artifacts')
        .select('id, key, workflow_id, node_id, name, summary, asset_key, metadata, created_at')
        .in('workflow_id', uniqueWorkflowIds)
        .order('created_at', { ascending: false })
        .limit(Number(config.limit) || 500)
    : { data: [], error: null }
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)
  const artifacts: LooseRecord[] = (artifactResponse.data ?? []).map(helpers.asRecord)
  const readyArtifactRoles = [...new Set(artifacts.map((artifact: LooseRecord) => helpers.readText(helpers.asRecord(artifact.metadata).role)).filter(Boolean))]
  const readyArtifactKeys = [...new Set(artifacts.map((artifact: LooseRecord) => helpers.readText(artifact.key)).filter(Boolean))]
  const missingArtifactRoles = uniqueWorkflowIds.length === 0 && optional
    ? []
    : requiredRoles.filter((role) => !readyArtifactRoles.includes(role))
  const outputs = {
    artifacts,
    artifactKeys: readyArtifactKeys,
    artifact_keys: readyArtifactKeys,
    childRequests: children.map((child) => child.childRequestId),
    child_requests: children.map((child) => child.childRequestId),
    childRunIds: children.map((child) => child.childRunId).filter(Boolean),
    child_run_ids: children.map((child) => child.childRunId).filter(Boolean),
    readyArtifactRoles,
    ready_artifact_roles: readyArtifactRoles,
    readyArtifactKeys,
    ready_artifact_keys: readyArtifactKeys,
    missingArtifactRoles,
    missing_artifact_roles: missingArtifactRoles,
    workflowRuntime: {
      activeChildRequestIds: children.filter((child) => child.waiting).map((child) => child.childRequestId),
      activeChildRunIds: children.filter((child) => child.waiting).map((child) => child.childRunId).filter(Boolean),
      readyArtifactCount: readyArtifactKeys.length,
      scopedAssetKeys: readyArtifactKeys,
      recoveryHints: missingArtifactRoles.map((role) => `Missing child artifact role "${role}".`),
    },
    metadata: {
      childCount: children.length,
      workflowCount: uniqueWorkflowIds.length,
      artifactCount: artifacts.length,
      optional,
      skipped: uniqueWorkflowIds.length === 0 && optional,
    },
  }
  return result({ context, helpers, outputs, model: 'workflow-collect-child-artifacts-v1' })
}

const utilityHandlers = {
  workflow_ensure_child_workflow: ensureChildWorkflowNode,
  workflow_wait_child_workflow: waitChildWorkflowNode,
  workflow_register_artifact_projection: registerArtifactProjectionNode,
  workflow_fanout_children: fanoutChildrenNode,
  workflow_collect_child_artifacts: collectChildArtifactsNode,
}

export const workflowUtilityNodePack = defineWorkflowNodePack<
  UtilityNodeExecutionContext,
  UtilityNodeExecutionResult,
  WorkflowUtilityNodePackHelpers,
  typeof utilityHandlers
>({
  packKey: 'output_workflow_utility',
  handlers: utilityHandlers,
})

export const workflowUtilityNodeHandlerKeys = workflowUtilityNodePack.handlerKeys

export function registerWorkflowUtilityNodePack(input: {
  helpers: WorkflowUtilityNodePackHelpers
  register: (handlerKey: string, handler: (context: UtilityNodeExecutionContext) => Promise<UtilityNodeExecutionResult>) => void
}) {
  workflowUtilityNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
