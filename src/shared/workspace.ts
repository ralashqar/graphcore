import type { PatchOperation } from '../domain/graphcore'
import type { PromptActivityEntry, PromptExecutionPlan } from '../domain/prompting'

export type LoadedState = {
  source: 'supabase' | 'demo'
  reason?: string
}

export type WorkspaceTab = 'graph' | 'content' | 'assets' | 'prompts' | 'releases'

export type PatchSessionView = {
  id: string
  summary: string
  requestSummary?: string
  prompt: string
  status: string
  operations: PatchOperation[]
  executionPlan?: PromptExecutionPlan
  activityEntries?: PromptActivityEntry[]
  diagnostics: string[]
  assistantNotes?: string
}

export type AuthMode = 'sign_in' | 'sign_up' | 'magic_link'

export const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'graph', label: 'Graph' },
  { id: 'content', label: 'Content' },
  { id: 'assets', label: 'Assets' },
  { id: 'prompts', label: 'Activity' },
  { id: 'releases', label: 'Releases' },
]
