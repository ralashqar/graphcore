import type { Session } from '@supabase/supabase-js'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const workspaceService = {
  deleteGeneratedMesh: graphcoreWorkspaceAdapter.deleteGeneratedMesh,
  deleteWorldBuildPlaceholder: graphcoreWorkspaceAdapter.deleteWorldBuildPlaceholder,
  persistDefinitionPreviewImageBinding: graphcoreWorkspaceAdapter.persistDefinitionPreviewImageBinding,
  persistGlobalProjectContext: graphcoreWorkspaceAdapter.persistGlobalProjectContext,
  pollCinematicRun: graphcoreWorkspaceAdapter.pollCinematicRun,
  planWorldBuild: graphcoreWorkspaceAdapter.planWorldBuild,
  pollMeshGeneration: graphcoreWorkspaceAdapter.pollMeshGeneration,
  pollWorldBuild: graphcoreWorkspaceAdapter.pollWorldBuild,
  startCinematicRun: graphcoreWorkspaceAdapter.startCinematicRun,
  startMeshGeneration: graphcoreWorkspaceAdapter.startMeshGeneration,
  startWorldBuild: graphcoreWorkspaceAdapter.startWorldBuild,
  createGame: (session?: Session) => graphcoreWorkspaceAdapter.createGame(session),
  load: graphcoreWorkspaceAdapter.loadProjectSnapshot,
  listGames: graphcoreWorkspaceAdapter.listGames,
  setActiveGame: (projectId: string, draftId: string) => graphcoreWorkspaceAdapter.setActiveGame(projectId, draftId),
  ensureLiveWorkspace: graphcoreWorkspaceAdapter.ensureLiveProjectSnapshot,
  bootstrapLiveWorkspace: (session?: Session) => graphcoreWorkspaceAdapter.bootstrapLiveWorkspace(session),
}
