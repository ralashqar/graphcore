import { create } from 'zustand'

import { createBillingSlice, type BillingSlice } from './slices/billingSlice'
import { createPromptComposerSlice, type PromptComposerSlice } from './slices/promptComposerSlice'
import { createWorkspaceSelectionSlice, type WorkspaceSelectionSlice } from './slices/workspaceSelectionSlice'

type EditorStore = PromptComposerSlice & WorkspaceSelectionSlice & BillingSlice

export const useEditorStore = create<EditorStore>((set) => ({
  ...createWorkspaceSelectionSlice(set),
  ...createPromptComposerSlice(set),
  ...createBillingSlice(set),
}))
