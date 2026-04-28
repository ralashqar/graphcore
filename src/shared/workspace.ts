import type { PatchOperation } from '../domain/graphcore'
import type { PromptActivityEntry, PromptExecutionPlan } from '../domain/prompting'
import type { WorldPromptTurn } from '../domain/worldPrompt'
import type { WorldBuildBatch } from '../domain/worldBuild'
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

export type WorkspaceTab = 'graph' | 'library' | 'outputs' | 'global'

export type WorldWorkspaceMode = 'graph' | 'wiki' | 'timeline' | 'board'

export type LibrarySection = 'characters' | 'items' | 'environments' | 'groups' | 'concepts' | 'assets'

export type PatchSessionView = {
  id: string
  kind?: 'patch' | 'world_build' | 'world_prompt'
  summary: string
  requestSummary?: string
  prompt: string
  status: string
  operations: PatchOperation[]
  executionPlan?: PromptExecutionPlan
  activityEntries?: PromptActivityEntry[]
  diagnostics: string[]
  assistantNotes?: string
  worldBuildBatch?: WorldBuildBatch
  worldPromptTurn?: WorldPromptTurn
}

export type AuthMode = 'sign_in' | 'sign_up' | 'magic_link'

export const workspaceTabs: Array<{ id: WorkspaceTab; label: string; icon: EntityIconId }> = [
  { id: 'graph', label: 'World', icon: 'graph' },
  { id: 'library', label: 'Library', icon: 'content' },
  { id: 'outputs', label: 'Outputs', icon: 'cinematic' },
  { id: 'global', label: 'Global', icon: 'global' },
]
