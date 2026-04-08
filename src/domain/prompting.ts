import type { GameSpec, GraphType, PatchOperation, ProjectSnapshot } from './graphcore'

export type PromptTarget = 'graph' | 'node' | 'content'
export type PromptTargetMode = 'current_graph' | 'new_graph' | 'auto'
export type PromptIntent = 'bootstrap_game' | 'create_content' | 'extend_graph' | 'repair_graph' | 'polish_text'
export type PromptPhase = 'spec' | 'content' | 'graph_skeleton' | 'graph_wiring' | 'text_polish'

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
  intent?: PromptIntent
  phase?: PromptPhase
  gameSpec?: GameSpec | null
  selectedPresetIds?: string[]
  allowedPresetIds?: string[]
  operationBudget?: number
  model: string
}

export type PromptPatchResponse = {
  summary: string
  operations: PatchOperation[]
  diagnostics: string[]
  assistantNotes?: string
  debugRawOutput?: string
}
