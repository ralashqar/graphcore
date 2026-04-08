import type { Session } from '@supabase/supabase-js'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const workspaceService = {
  createGame: (session?: Session) => graphcoreWorkspaceAdapter.createGame(session),
  load: graphcoreWorkspaceAdapter.loadProjectSnapshot,
  listGames: graphcoreWorkspaceAdapter.listGames,
  setActiveGame: (projectId: string, draftId: string) => graphcoreWorkspaceAdapter.setActiveGame(projectId, draftId),
  ensureLiveWorkspace: graphcoreWorkspaceAdapter.ensureLiveProjectSnapshot,
  bootstrapLiveWorkspace: (session?: Session) => graphcoreWorkspaceAdapter.bootstrapLiveWorkspace(session),
}
