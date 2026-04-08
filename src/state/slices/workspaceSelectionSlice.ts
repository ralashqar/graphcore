export type WorkspaceSelectionSlice = {
  selectedDefinitionKey: string | null
  selectedGraphKey: string | null
  selectedNodeKey: string | null
  selectedEdgeKey: string | null
  setSelectedDefinitionKey: (key: string | null) => void
  setSelectedGraphKey: (key: string | null) => void
  setSelectedNodeKey: (key: string | null) => void
  setSelectedEdgeKey: (key: string | null) => void
}

export const createWorkspaceSelectionSlice = (
  set: (updater: (state: WorkspaceSelectionSlice) => WorkspaceSelectionSlice | Partial<WorkspaceSelectionSlice>) => void,
): WorkspaceSelectionSlice => ({
  selectedDefinitionKey: null,
  selectedGraphKey: null,
  selectedNodeKey: null,
  selectedEdgeKey: null,
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
})
