export type PromptComposerSlice = {
  promptText: string
  setPromptText: (promptText: string) => void
}

export const createPromptComposerSlice = (
  set: (updater: (state: PromptComposerSlice) => PromptComposerSlice | Partial<PromptComposerSlice>) => void,
): PromptComposerSlice => ({
  promptText: '',
  setPromptText: (promptText) => set((state) => (state.promptText === promptText ? state : { promptText })),
})
