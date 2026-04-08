import { create } from 'zustand'

import { createPromptComposerSlice, type PromptComposerSlice } from './slices/promptComposerSlice'
import { createWorkspaceSelectionSlice, type WorkspaceSelectionSlice } from './slices/workspaceSelectionSlice'

type EditorStore = PromptComposerSlice & WorkspaceSelectionSlice

export const useEditorStore = create<EditorStore>((set) => ({
  ...createWorkspaceSelectionSlice(set),
  ...createPromptComposerSlice(set),
}))
