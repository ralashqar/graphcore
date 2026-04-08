import type { PatchOperation, ProjectSnapshot } from '../../domain/graphcore'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const patchApplyService = {
  apply: (snapshot: ProjectSnapshot, operations: PatchOperation[], patchSetId?: string) =>
    graphcoreWorkspaceAdapter.applyPatchProposal(snapshot, operations, patchSetId),
}
