export type PromptComposerSlice = {
  promptText: string
  setPromptText: (promptText: string) => void
}

export const createPromptComposerSlice = (
  set: (updater: (state: PromptComposerSlice) => PromptComposerSlice | Partial<PromptComposerSlice>) => void,
): PromptComposerSlice => ({
  promptText: 'Add a market branch after the bridge unlock that trades supplies for trust.',
  setPromptText: (promptText) => set((state) => (state.promptText === promptText ? state : { promptText })),
})
