import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  OutputRequestDeleteResponse,
  OutputRequestStatusResponse,
  OutputWorkflowCancelResponse,
  OutputWorkflowNodeUpdateResponse,
  OutputWorkflowPlanRequest,
  OutputWorkflowPlanResponse,
  OutputWorkflowRepairRequest,
  OutputWorkflowRepairResponse,
  OutputWorkflowRunStatusResponse,
  OutputWorkflowStartResponse,
  OutputWorkflowUpgradeResponse,
  SequenceAnimaticSceneGraphNodeUpdateResponse,
} from '../../domain/outputWorkflow'
import type {
  OutputInboxLoadResult,
  OutputWorkflowGraphLoadResult,
} from '../../data/graphcoreRepository'
import type {
  CinematicDirectorNotePreviewRequest,
  CinematicDirectorNotePreviewResponse,
  CinematicDirectorPatchApplyRequest,
  CinematicDirectorPatchApplyResponse,
} from '../../domain/cinematicDirectorNotes'

export type OutputApi = {
  planOutputWorkflow(snapshot: ProjectSnapshot, request: Omit<OutputWorkflowPlanRequest, 'snapshot'>): Promise<OutputWorkflowPlanResponse>
  startOutputWorkflow(snapshot: ProjectSnapshot, plan: OutputWorkflowPlanResponse['plan']): Promise<OutputWorkflowStartResponse>
  startOutputWorkflowRun(snapshot: ProjectSnapshot, request: Record<string, unknown>): Promise<OutputWorkflowRunStatusResponse>
  previewOutputCinematicDirectorNote(snapshot: ProjectSnapshot, request: Omit<CinematicDirectorNotePreviewRequest, 'projectId' | 'draftId'>): Promise<CinematicDirectorNotePreviewResponse>
  applyOutputCinematicDirectorPatch(snapshot: ProjectSnapshot, request: Omit<CinematicDirectorPatchApplyRequest, 'projectId' | 'draftId'>): Promise<CinematicDirectorPatchApplyResponse>
  getOutputWorkflowStatus(runId: string): Promise<OutputWorkflowRunStatusResponse>
  cancelOutputWorkflowRun(runId: string): Promise<OutputWorkflowCancelResponse>
  startOutputRequest(snapshot: ProjectSnapshot, request: Record<string, unknown>): Promise<OutputRequestStatusResponse>
  getOutputRequestStatus(requestId: string): Promise<OutputRequestStatusResponse>
  cancelOutputRequest(requestId: string): Promise<OutputRequestStatusResponse>
  deleteOutputRequest(requestId: string): Promise<OutputRequestDeleteResponse>
  repairOutputWorkflowState(snapshot: ProjectSnapshot, request: Omit<OutputWorkflowRepairRequest, 'projectId' | 'draftId'>): Promise<OutputWorkflowRepairResponse>
  loadOutputInbox(input: Record<string, unknown>): Promise<OutputInboxLoadResult>
  loadOutputWorkflowGraph(input: Record<string, unknown>): Promise<OutputWorkflowGraphLoadResult>
  subscribeOutputWorkflowGraphSignals(input: {
    draftId: string
    workflowId: string
    runId?: string | null
    onSignal: (signal: { table: string; eventType?: string }) => void
  }): { unsubscribe(): Promise<unknown> | void }
  updateOutputWorkflowNode(snapshot: ProjectSnapshot, request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
    metadata?: { displayLabel?: string; note?: string }
  }): Promise<OutputWorkflowNodeUpdateResponse>
  updateSequenceAnimaticSceneGraphNode(snapshot: ProjectSnapshot, request: {
    masterRequestId: string
    nodeId: string
    nodeKind: 'world_location' | 'set' | 'zone' | 'spot' | 'camera_grid' | 'viewpoint' | 'angle' | 'coverage_anchor' | 'temp_character' | 'prop' | 'faction' | 'vehicle' | 'group'
    visualBriefOverride?: string
    extraPromptDirection?: string
    clearOverride?: boolean
  }): Promise<SequenceAnimaticSceneGraphNodeUpdateResponse>
  upgradeOutputWorkflowPreset(snapshot: ProjectSnapshot, request: {
    workflowId: string
    preset?: 'ebook_from_world'
  }): Promise<OutputWorkflowUpgradeResponse>
  getOutputArtifact(request: { artifactId?: string; artifactKey?: string }): Promise<unknown>
}
