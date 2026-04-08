import type { PatchOperation } from '../domain/graphcore'
import type { PromptActivityEntry, PromptExecutionPlan } from '../domain/prompting'

export type LoadedState = {
  source: 'supabase' | 'demo'
  reason?: string
}

export type GameSummary = {
  projectId: string
  projectName: string
  projectSlug: string
  draftId: string
  draftName: string
  updatedAt: string
  bootstrapStatus: 'pending' | 'complete'
  hasGameSpec: boolean
}

export type WorkspaceTab = 'graph' | 'content' | 'characters' | 'environments' | 'assets' | 'prompts' | 'releases'

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
  { id: 'characters', label: 'Characters' },
  { id: 'environments', label: 'Environments' },
  { id: 'assets', label: 'Assets' },
  { id: 'prompts', label: 'Activity' },
  { id: 'releases', label: 'Releases' },
]
