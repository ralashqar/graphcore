import type { PromptPatchRequest } from '../../domain/prompting'

import { graphcoreWorkspaceAdapter } from '../../infrastructure/graphcore/graphcoreWorkspaceAdapter'

export const promptGenerationService = {
  generate: (request: PromptPatchRequest) => graphcoreWorkspaceAdapter.proposePatch(request),
}
