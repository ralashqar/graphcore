import type { GameSpec, GraphType, PatchOperation, ProjectSnapshot } from './graphcore'

export type PromptTarget = 'graph' | 'node' | 'content'
export type PromptTargetMode = 'current_graph' | 'new_graph' | 'auto'
export type PromptIntent = 'bootstrap_game' | 'create_content' | 'extend_graph' | 'repair_graph' | 'polish_text'
export type PromptPhase =
  | 'spec'
  | 'content'
  | 'graph_skeleton'
  | 'graph_wiring'
  | 'text_polish'
  | 'bootstrap_orchestrator'
  | 'dependency_generation'
  | 'graph_generation_parallel'
  | 'merge_and_apply'

export type PromptMode = 'orchestrate'

export type PromptSelectionContext = {
  graphKey?: string | null
  nodeKey?: string | null
  edgeKey?: string | null
  definitionKey?: string | null
  archetypeKey?: string | null
  assetKey?: string | null
  target?: PromptTarget
}

export type PromptActivityEntry = {
  phase: PromptPhase | 'fallback'
  status: 'planned' | 'completed' | 'applied' | 'failed'
  title: string
  detail?: string
}

export type PromptExecutionPlan = {
  classification: 'bootstrap' | 'single_content' | 'content_bundle' | 'single_graph' | 'multi_graph' | 'mixed_request'
  requiresDependencies: boolean
  dependencyKinds: string[]
  graphJobCount: number
  graphJobs: Array<{
    title: string
    prompt: string
    graphType?: GraphType | null
    graphKey?: string | null
    targetMode?: PromptTargetMode
  }>
}

export type PromptPatchRequest = {
  prompt: string
  snapshot: ProjectSnapshot
  context?: {
    graphKey?: string | null
    nodeKey?: string | null
    edgeKey?: string | null
    target?: PromptTarget
  }
  selectionContext?: PromptSelectionContext
  targetMode?: PromptTargetMode
  graphType?: GraphType
  intent?: PromptIntent
  phase?: PromptPhase
  mode?: PromptMode
  autoApply?: boolean
  gameSpec?: GameSpec | null
  gameArchetypeId?: string
  gameConceptPrompt?: string
  selectedPresetIds?: string[]
  allowedPresetIds?: string[]
  operationBudget?: number
  model: string
}

export type PromptPatchResponse = {
  patchSetId?: string
  requestSummary?: string
  executionPlan?: PromptExecutionPlan
  activityEntries?: PromptActivityEntry[]
  summary: string
  operations: PatchOperation[]
  appliedOperations?: PatchOperation[]
  diagnostics: string[]
  assistantNotes?: string
  debugRawOutput?: string
}
