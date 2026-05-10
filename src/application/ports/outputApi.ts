import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
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
  startOutputRequest(snapshot: ProjectSnapshot, request: Record<string, unknown>): Promise<OutputRequestStatusResponse>
  getOutputRequestStatus(requestId: string): Promise<OutputRequestStatusResponse>
  cancelOutputRequest(requestId: string): Promise<OutputRequestStatusResponse>
  deleteOutputRequest(requestId: string): Promise<OutputRequestDeleteResponse>
  loadOutputInbox(input: Record<string, unknown>): Promise<OutputInboxLoadResult>
  loadOutputWorkflowGraph(input: Record<string, unknown>): Promise<OutputWorkflowGraphLoadResult>
  updateOutputWorkflowNode(snapshot: ProjectSnapshot, request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
    metadata?: { displayLabel?: string; note?: string }
  }): Promise<OutputWorkflowNodeUpdateResponse>
  upgradeOutputWorkflowPreset(snapshot: ProjectSnapshot, request: {
    workflowId: string
    preset?: 'ebook_from_world'
  }): Promise<OutputWorkflowUpgradeResponse>
  getOutputArtifact(request: { artifactId?: string; artifactKey?: string }): Promise<unknown>
}
