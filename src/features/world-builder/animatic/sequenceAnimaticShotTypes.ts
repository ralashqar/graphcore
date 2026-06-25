export type SequenceAnimaticPendingShotView = {
  blockId: string
  shotId: string
  index: number
}

export type SequenceAnimaticShotInspectorInput = {
  kind: 'lighting' | 'performance'
  blockTitle: string
  shotTitle: string
  content: string
}

export type SequenceAnimaticShotPromptState = {
  masterRequestId: string
  storyboardBlockId: string
  shotId: string
  shotTitle: string
  prompt: string
  status: 'idle' | 'rewriting' | 'generating' | 'saving' | 'failed'
  error: string | null
}
