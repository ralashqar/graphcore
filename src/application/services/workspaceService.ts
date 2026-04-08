import type { Session } from '@supabase/supabase-js'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const workspaceService = {
  load: graphcoreWorkspaceAdapter.loadProjectSnapshot,
  ensureLiveWorkspace: graphcoreWorkspaceAdapter.ensureLiveProjectSnapshot,
  bootstrapLiveWorkspace: (session?: Session) => graphcoreWorkspaceAdapter.bootstrapLiveWorkspace(session),
}
