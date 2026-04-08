import type { ProjectSnapshot } from '../../domain/graphcore'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const publishService = {
  publish: (snapshot: ProjectSnapshot) => graphcoreWorkspaceAdapter.compileSnapshot(snapshot),
}
