import * as graphcoreRepository from '../../data/graphcoreRepository'
import type { AssetApi, RealtimeApi, WorkspaceSnapshotApi, WorldGraphApi } from '../../application/ports'

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

export const graphcoreWorkspaceApis = {
  asset: graphcoreAssetApi,
  realtime: graphcoreRealtimeApi,
  snapshot: graphcoreWorkspaceSnapshotApi,
  worldGraph: graphcoreWorldGraphApi,
}
