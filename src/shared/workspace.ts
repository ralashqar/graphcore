import type { PatchOperation } from '../domain/graphcore'
import type { PromptActivityEntry, PromptExecutionPlan } from '../domain/prompting'
import type { EntityIconId } from './entityIcons'

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

export const workspaceTabs: Array<{ id: WorkspaceTab; label: string; icon: EntityIconId }> = [
  { id: 'graph', label: 'Graph', icon: 'graph' },
  { id: 'content', label: 'Content', icon: 'content' },
  { id: 'characters', label: 'Characters', icon: 'character' },
  { id: 'environments', label: 'Environments', icon: 'environment' },
  { id: 'assets', label: 'Assets', icon: 'asset' },
  { id: 'prompts', label: 'Activity', icon: 'activity' },
  { id: 'releases', label: 'Releases', icon: 'release' },
]
