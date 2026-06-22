import * as graphcoreRepository from '../../data/graphcoreRepository'
import type {
  AssetApi,
  GenerationApi,
  OutputApi,
  RealtimeApi,
  WorkspaceSnapshotApi,
  WorldGraphApi,
  WorldPromptApi,
} from '../../application/ports'

export const graphcoreAssetApi: AssetApi = {
  signProjectAssetUrls: graphcoreRepository.signProjectAssetUrls,
  signProjectAssetUrlEntries: graphcoreRepository.signProjectAssetUrlEntries,
}

export const graphcoreWorkspaceSnapshotApi: WorkspaceSnapshotApi = {
  loadProjectSnapshot: graphcoreRepository.loadProjectSnapshot,
  ensureLiveProjectSnapshot: graphcoreRepository.ensureLiveProjectSnapshot,
  bootstrapLiveWorkspace: graphcoreRepository.bootstrapLiveWorkspace,
  createGame: graphcoreRepository.createGame,
  listGames: graphcoreRepository.listGames,
  setActiveGame: graphcoreRepository.setActiveGame,
  loadCachedProjectSnapshot: graphcoreRepository.loadCachedProjectSnapshot,
  saveCachedProjectSnapshot: graphcoreRepository.saveCachedProjectSnapshot,
  clearProjectCache: graphcoreRepository.clearProjectCache,
  loadDraftDelta: graphcoreRepository.loadDraftDelta,
  applyDraftDeltaToSnapshot: graphcoreRepository.applyDraftDeltaToSnapshot,
  loadProjectDraftMetadata: graphcoreRepository.loadProjectDraftMetadata,
}

export const graphcoreRealtimeApi: RealtimeApi = {
  subscribeWorldPromptEvents: graphcoreRepository.subscribeWorldPromptEvents,
  subscribeCinematicRunSignals: graphcoreRepository.subscribeCinematicRunSignals,
}

export const graphcoreWorldGraphApi: WorldGraphApi = {
  createWorldEntity: graphcoreRepository.createWorldEntity,
  updateWorldEntity: graphcoreRepository.updateWorldEntity,
  deleteWorldEntity: graphcoreRepository.deleteWorldEntity,
  createWorldRelationship: graphcoreRepository.createWorldRelationship,
  createWorldRelationshipFromGraphGesture: graphcoreRepository.createWorldRelationshipFromGraphGesture,
  updateWorldRelationship: graphcoreRepository.updateWorldRelationship,
  deleteWorldRelationship: graphcoreRepository.deleteWorldRelationship,
  createWorldView: graphcoreRepository.createWorldView,
  updateWorldView: graphcoreRepository.updateWorldView,
  deleteWorldView: graphcoreRepository.deleteWorldView,
  createWorldDerivedComposition: graphcoreRepository.createWorldDerivedComposition,
  updateWorldDerivedComposition: graphcoreRepository.updateWorldDerivedComposition,
  deleteWorldDerivedComposition: graphcoreRepository.deleteWorldDerivedComposition,
  generateWorldResultPreview: graphcoreRepository.generateWorldResultPreview,
  resetProjectWorld: graphcoreRepository.resetProjectWorld,
  generateStarterWorld: graphcoreRepository.generateStarterWorld,
  generateWorldExpansion: graphcoreRepository.generateWorldExpansion,
  syncWorldGraphFromDefinitions: graphcoreRepository.syncWorldGraphFromDefinitions,
  updateWorldThread: graphcoreRepository.updateWorldThread,
  resolveWorldThread: graphcoreRepository.resolveWorldThread,
  parkWorldThread: graphcoreRepository.parkWorldThread,
}

export const graphcoreWorldPromptApi: WorldPromptApi = {
  createWorldPromptSession: graphcoreRepository.createWorldPromptSession,
  startWorldPromptTurn: graphcoreRepository.startWorldPromptTurn,
  startWorldSeedInference: graphcoreRepository.startWorldSeedInference,
  continueWorldSeedGeneration: graphcoreRepository.continueWorldSeedGeneration,
  getWorldGenerationStatus: graphcoreRepository.getWorldGenerationStatus,
  cancelWorldGenerationJob: graphcoreRepository.cancelWorldGenerationJob,
  cancelWorldPromptTurn: graphcoreRepository.cancelWorldPromptTurn,
  refreshWorldPromptSuggestions: graphcoreRepository.refreshWorldPromptSuggestions,
  dismissWorldPromptSuggestion: graphcoreRepository.dismissWorldPromptSuggestion,
  approveWorldPromptOp: graphcoreRepository.approveWorldPromptOp,
  rejectWorldPromptOp: graphcoreRepository.rejectWorldPromptOp,
  applyWorldPromptPreview: graphcoreRepository.applyWorldPromptPreview,
}

export const graphcoreOutputApi: OutputApi = {
  planOutputWorkflow: graphcoreRepository.planOutputWorkflow,
  startOutputWorkflow: graphcoreRepository.startOutputWorkflow,
  startOutputWorkflowRun: graphcoreRepository.startOutputWorkflowRun,
  previewOutputCinematicDirectorNote: graphcoreRepository.previewOutputCinematicDirectorNote,
  applyOutputCinematicDirectorPatch: graphcoreRepository.applyOutputCinematicDirectorPatch,
  getOutputWorkflowStatus: graphcoreRepository.getOutputWorkflowStatus,
  cancelOutputWorkflowRun: graphcoreRepository.cancelOutputWorkflowRun,
  updateOutputWorkflowNode: graphcoreRepository.updateOutputWorkflowNode,
  updateSequenceAnimaticSceneGraphNode: graphcoreRepository.updateSequenceAnimaticSceneGraphNode,
  analyzeSequenceAnimaticZonePois: graphcoreRepository.analyzeSequenceAnimaticZonePois,
  upgradeOutputWorkflowPreset: graphcoreRepository.upgradeOutputWorkflowPreset,
  startOutputRequest: graphcoreRepository.startOutputRequest,
  getOutputRequestStatus: graphcoreRepository.getOutputRequestStatus,
  cancelOutputRequest: graphcoreRepository.cancelOutputRequest,
  deleteOutputRequest: graphcoreRepository.deleteOutputRequest,
  repairOutputWorkflowState: graphcoreRepository.repairOutputWorkflowState,
  loadOutputInbox: graphcoreRepository.loadOutputInbox,
  loadOutputWorkflowGraph: graphcoreRepository.loadOutputWorkflowGraph,
  subscribeOutputWorkflowGraphSignals: graphcoreRepository.subscribeOutputWorkflowGraphSignals,
  getOutputArtifact: graphcoreRepository.getOutputArtifact,
}

export const graphcoreGenerationApi: GenerationApi = {
  planWorldBuild: graphcoreRepository.planWorldBuild,
  startWorldBuild: graphcoreRepository.startWorldBuild,
  pollWorldBuild: graphcoreRepository.pollWorldBuild,
  authorCinematicScript: graphcoreRepository.authorCinematicScript,
  repairCinematicScript: graphcoreRepository.repairCinematicScript,
  deleteWorldBuildPlaceholder: graphcoreRepository.deleteWorldBuildPlaceholder,
  startCinematicRun: graphcoreRepository.startCinematicRun,
  pollCinematicRun: graphcoreRepository.pollCinematicRun,
  cancelCinematicRun: graphcoreRepository.cancelCinematicRun,
  startMeshGeneration: graphcoreRepository.startMeshGeneration,
  pollMeshGeneration: graphcoreRepository.pollMeshGeneration,
  deleteGeneratedMesh: graphcoreRepository.deleteGeneratedMesh,
  startWorldEntityIconBatch: graphcoreRepository.startWorldEntityIconBatch,
  getWorldEntityIconBatchStatus: graphcoreRepository.getWorldEntityIconBatchStatus,
  generateWorldBrandAtlasImage: graphcoreRepository.generateWorldBrandAtlasImage,
  startVisualGenerationJob: graphcoreRepository.startVisualGenerationJob,
  listActiveVisualGenerationJobs: graphcoreRepository.listActiveVisualGenerationJobs,
  getVisualGenerationStatus: graphcoreRepository.getVisualGenerationStatus,
  cancelVisualGenerationJob: graphcoreRepository.cancelVisualGenerationJob,
  startAppCodeGeneration: graphcoreRepository.startAppCodeGeneration,
  getAppGenerationStatus: graphcoreRepository.getAppGenerationStatus,
  cancelAppGenerationJob: graphcoreRepository.cancelAppGenerationJob,
  getAppPreviewSession: graphcoreRepository.getAppPreviewSession,
  persistDefinitionPreviewImageBinding: graphcoreRepository.persistDefinitionPreviewImageBinding,
  loadDefinitionDetails: graphcoreRepository.loadDefinitionDetails,
  loadEnvironmentBlueprintDetails: graphcoreRepository.loadEnvironmentBlueprintDetails,
  loadGenerationJobDetails: graphcoreRepository.loadGenerationJobDetails,
}

export const graphcoreWorkspaceApis = {
  asset: graphcoreAssetApi,
  generation: graphcoreGenerationApi,
  output: graphcoreOutputApi,
  realtime: graphcoreRealtimeApi,
  snapshot: graphcoreWorkspaceSnapshotApi,
  worldGraph: graphcoreWorldGraphApi,
  worldPrompt: graphcoreWorldPromptApi,
}
