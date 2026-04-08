import { create } from 'zustand'

type EditorStore = {
  selectedDefinitionKey: string | null
  selectedGraphKey: string | null
  selectedNodeKey: string | null
  promptText: string
  setSelectedDefinitionKey: (key: string | null) => void
  setSelectedGraphKey: (key: string | null) => void
  setSelectedNodeKey: (key: string | null) => void
  setPromptText: (prompt: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  selectedDefinitionKey: null,
  selectedGraphKey: null,
  selectedNodeKey: null,
  promptText: 'Add a market branch after the bridge unlock that trades supplies for trust.',
  setSelectedDefinitionKey: (selectedDefinitionKey) => set({ selectedDefinitionKey }),
  setSelectedGraphKey: (selectedGraphKey) => set({ selectedGraphKey, selectedNodeKey: null }),
  setSelectedNodeKey: (selectedNodeKey) => set({ selectedNodeKey }),
  setPromptText: (promptText) => set({ promptText }),
}))
