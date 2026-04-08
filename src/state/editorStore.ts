import { create } from 'zustand'

type EditorStore = {
  selectedDefinitionKey: string | null
  selectedGraphKey: string | null
  selectedNodeKey: string | null
  selectedEdgeKey: string | null
  promptText: string
  setSelectedDefinitionKey: (key: string | null) => void
  setSelectedGraphKey: (key: string | null) => void
  setSelectedNodeKey: (key: string | null) => void
  setSelectedEdgeKey: (key: string | null) => void
  setPromptText: (prompt: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  selectedDefinitionKey: null,
  selectedGraphKey: null,
  selectedNodeKey: null,
  selectedEdgeKey: null,
  promptText: 'Add a market branch after the bridge unlock that trades supplies for trust.',
  setSelectedDefinitionKey: (selectedDefinitionKey) =>
    set((state) => (state.selectedDefinitionKey === selectedDefinitionKey ? state : { selectedDefinitionKey })),
  setSelectedGraphKey: (selectedGraphKey) =>
    set((state) =>
      state.selectedGraphKey === selectedGraphKey && state.selectedNodeKey === null && state.selectedEdgeKey === null
        ? state
        : { selectedGraphKey, selectedNodeKey: null, selectedEdgeKey: null },
    ),
  setSelectedNodeKey: (selectedNodeKey) =>
    set((state) =>
      state.selectedNodeKey === selectedNodeKey && state.selectedEdgeKey === null
        ? state
        : { selectedNodeKey, selectedEdgeKey: null },
    ),
  setSelectedEdgeKey: (selectedEdgeKey) =>
    set((state) =>
      state.selectedEdgeKey === selectedEdgeKey && state.selectedNodeKey === null
        ? state
        : { selectedEdgeKey, selectedNodeKey: null },
    ),
  setPromptText: (promptText) => set((state) => (state.promptText === promptText ? state : { promptText })),
}))
