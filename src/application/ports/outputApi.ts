import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  OutputArtifact,
  OutputRequestDeleteResponse,
  OutputRequestStatusResponse,
  OutputWorkflowCancelResponse,
  OutputWorkflowNodeUpdateResponse,
  OutputWorkflowPlanRequest,
  OutputWorkflowPlanResponse,
  OutputWorkflowRunStatusResponse,
  OutputWorkflowStartResponse,
  OutputWorkflowUpgradeResponse,
} from '../../domain/outputWorkflow'
import type {
  OutputInboxLoadResult,
  OutputWorkflowGraphLoadResult,
} from '../../data/graphcoreRepository'

export type OutputApi = {
  planOutputWorkflow(snapshot: ProjectSnapshot, request: Omit<OutputWorkflowPlanRequest, 'snapshot'>): Promise<OutputWorkflowPlanResponse>
  startOutputWorkflow(snapshot: ProjectSnapshot, plan: OutputWorkflowPlanResponse['plan']): Promise<OutputWorkflowStartResponse>
  startOutputWorkflowRun(snapshot: ProjectSnapshot, request: Record<string, unknown>): Promise<OutputWorkflowRunStatusResponse>
  getOutputWorkflowStatus(runId: string): Promise<OutputWorkflowRunStatusResponse>
  cancelOutputWorkflowRun(runId: string): Promise<OutputWorkflowCancelResponse>
  updateOutputWorkflowNode(request: Record<string, unknown>): Promise<OutputWorkflowNodeUpdateResponse>
  upgradeOutputWorkflowPreset(request: Record<string, unknown>): Promise<OutputWorkflowUpgradeResponse>
  startOutputRequest(snapshot: ProjectSnapshot, request: Record<string, unknown>): Promise<OutputRequestStatusResponse>
  getOutputRequestStatus(requestId: string): Promise<OutputRequestStatusResponse>
  cancelOutputRequest(requestId: string): Promise<OutputRequestStatusResponse>
  deleteOutputRequest(requestId: string): Promise<OutputRequestDeleteResponse>
  loadOutputInbox(input: Record<string, unknown>): Promise<OutputInboxLoadResult>
  loadOutputWorkflowGraph(input: Record<string, unknown>): Promise<OutputWorkflowGraphLoadResult>
  getOutputArtifact(request: { artifactId?: string; artifactKey?: string }): Promise<OutputArtifact | null>
}
