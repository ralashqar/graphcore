import type { GraphType, PatchOperation, ProjectSnapshot } from './graphcore'

export type PromptTarget = 'graph' | 'node' | 'content'
export type PromptTargetMode = 'current_graph' | 'new_graph' | 'auto'

export type PromptPatchRequest = {
  prompt: string
  snapshot: ProjectSnapshot
  context?: {
    graphKey?: string | null
    nodeKey?: string | null
    edgeKey?: string | null
    target?: PromptTarget
  }
  targetMode?: PromptTargetMode
  graphType?: GraphType
  model: string
}

export type PromptPatchResponse = {
  summary: string
  operations: PatchOperation[]
  diagnostics: string[]
  assistantNotes?: string
  debugRawOutput?: string
}
