import {
  childWorkflowUtilityOutputSchema,
  type ChildWorkflowUtilityOutput,
} from '../../../src/domain/outputWorkflowManifests.ts'

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

export async function ensureChildWorkflow(input: {
  client: DatabaseClient
  projectId: string
  draftId: string
  parentRequestId: string
  role: string
  identityKey: string
  identityValue: string
  workflow: Record<string, unknown>
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  request: Record<string, unknown>
}) {
  const response = await input.client.rpc('ensure_sequence_animatic_child_workflow', {
    p_project_id: input.projectId,
    p_draft_id: input.draftId,
    p_parent_request_id: input.parentRequestId,
    p_role: input.role,
    p_identity_key: input.identityKey,
    p_identity_value: input.identityValue,
    p_workflow: input.workflow,
    p_nodes: input.nodes,
    p_edges: input.edges,
    p_request: input.request,
  })
  if (response.error) throw new Error(response.error.message)
  const ensured = asRecord(response.data)
  return {
    request: asRecord(ensured.request),
    workflow: asRecord(ensured.workflow),
    nodes: Array.isArray(ensured.nodes) ? ensured.nodes.map(asRecord) : [],
    edges: Array.isArray(ensured.edges) ? ensured.edges.map(asRecord) : [],
    reused: ensured.reused === true,
  }
}

export async function waitForChildWorkflowReadiness(input: {
  client: DatabaseClient
  childRequestId: string
  requiredArtifactRoles?: string[]
  resumeAfterMs?: number
}): Promise<ChildWorkflowUtilityOutput> {
  const requestResponse = await input.client
    .from('output_requests')
    .select('id, workflow_id, latest_run_id, status, metadata')
    .eq('id', input.childRequestId)
    .maybeSingle()
  if (requestResponse.error) throw new Error(requestResponse.error.message)
  const request = asRecord(requestResponse.data)
  if (!readText(request.id)) {
    return childWorkflowUtilityOutputSchema.parse({
      childRequestId: input.childRequestId,
      childWorkflowId: 'unknown',
      status: 'failed',
      waiting: false,
      resumable: false,
      diagnostics: ['Child workflow request was not found.'],
    })
  }

  const workflowId = readText(request.workflow_id)
  const latestRunId = readText(request.latest_run_id) || null
  const status = readText(request.status) || 'waiting'
  const artifactResponse = workflowId
    ? await input.client
        .from('output_artifacts')
        .select('key, metadata')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [], error: null }
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)
  const artifacts: Record<string, unknown>[] = (artifactResponse.data ?? []).map(asRecord)
  const readyArtifactRoles = [...new Set(artifacts
    .map((artifact) => readText(asRecord(artifact.metadata).role))
    .filter(Boolean))]
  const readyArtifactKeys = readStringArray(artifacts.map((artifact) => artifact.key))
  const required = input.requiredArtifactRoles ?? []
  const missingRoles = required.filter((role) => !readyArtifactRoles.includes(role))
  const terminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
  const ready = missingRoles.length === 0 && ['completed', 'completed_with_errors'].includes(status)

  return childWorkflowUtilityOutputSchema.parse({
    childRequestId: readText(request.id),
    childWorkflowId: workflowId,
    childRunId: latestRunId,
    status: ready ? status : terminal ? status : 'waiting',
    readyArtifactRoles,
    readyArtifactKeys,
    waiting: !ready && !terminal,
    resumable: !ready && !terminal,
    resumeAfterMs: input.resumeAfterMs ?? 15_000,
    diagnostics: missingRoles.map((role) => `Waiting for child artifact role "${role}".`),
    metadata: {
      requestStatus: status,
      missingArtifactRoles: missingRoles,
    },
  })
}
