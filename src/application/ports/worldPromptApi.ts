import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  WorldPromptApplyPreviewRequest,
  WorldPromptCancelGenerationJobRequest,
  WorldPromptCancelTurnRequest,
  WorldPromptCreateSessionRequest,
  WorldPromptDismissSuggestionRequest,
  WorldPromptGenerationStatusRequest,
  WorldPromptGenerationStatusResponse,
  WorldPromptRefreshSuggestionsRequest,
  WorldPromptRefreshSuggestionsResponse,
  WorldPromptResolveOpRequest,
  WorldPromptSeedGenerationRequest,
  WorldPromptSeedInferenceRequest,
  WorldPromptStartTurnRequest,
} from '../../domain/worldPrompt'

export type WorldPromptApi = {
  createWorldPromptSession(snapshot: ProjectSnapshot, request: Omit<WorldPromptCreateSessionRequest, 'snapshot'>): Promise<unknown>
  startWorldPromptTurn(snapshot: ProjectSnapshot, request: Omit<WorldPromptStartTurnRequest, 'snapshot'>): Promise<unknown>
  startWorldSeedInference(snapshot: ProjectSnapshot, request: Omit<WorldPromptSeedInferenceRequest, 'snapshot'>): Promise<unknown>
  continueWorldSeedGeneration(snapshot: ProjectSnapshot, request: Omit<WorldPromptSeedGenerationRequest, 'snapshot'>): Promise<unknown>
  getWorldGenerationStatus(snapshot: ProjectSnapshot, request: Omit<WorldPromptGenerationStatusRequest, 'snapshot'>): Promise<WorldPromptGenerationStatusResponse>
  cancelWorldGenerationJob(snapshot: ProjectSnapshot, request: Omit<WorldPromptCancelGenerationJobRequest, 'snapshot'>): Promise<unknown>
  cancelWorldPromptTurn(snapshot: ProjectSnapshot, request: Omit<WorldPromptCancelTurnRequest, 'snapshot'>): Promise<unknown>
  refreshWorldPromptSuggestions(snapshot: ProjectSnapshot, request: Omit<WorldPromptRefreshSuggestionsRequest, 'snapshot'>): Promise<WorldPromptRefreshSuggestionsResponse>
  dismissWorldPromptSuggestion(request: WorldPromptDismissSuggestionRequest): Promise<unknown>
  approveWorldPromptOp(snapshot: ProjectSnapshot, request: Omit<WorldPromptResolveOpRequest, 'snapshot'>): Promise<unknown>
  rejectWorldPromptOp(snapshot: ProjectSnapshot, request: Omit<WorldPromptResolveOpRequest, 'snapshot'>): Promise<unknown>
  applyWorldPromptPreview(snapshot: ProjectSnapshot, request: Omit<WorldPromptApplyPreviewRequest, 'snapshot'>): Promise<unknown>
}
