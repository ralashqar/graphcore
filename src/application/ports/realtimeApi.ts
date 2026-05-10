import type {
  WorldPromptEvent,
  WorldPromptGenerationJob,
  WorldPromptGenerationJobStep,
  WorldPromptMessage,
  WorldPromptSession,
  WorldPromptSuggestionRecord,
  WorldPromptTurn,
} from '../../domain/worldPrompt'
import type { WorldThread } from '../../domain/worldThread'

export type RealtimeSubscription = {
  unsubscribe(): Promise<unknown> | void
}

export type WorldPromptRealtimeInput = {
  draftId: string
  onSession?: (session: WorldPromptSession) => void
  onTurn?: (turn: WorldPromptTurn) => void
  onMessage?: (message: WorldPromptMessage) => void
  onEvent?: (event: WorldPromptEvent) => void
  onGenerationJob?: (job: WorldPromptGenerationJob) => void
  onGenerationJobStep?: (step: WorldPromptGenerationJobStep) => void
  onSuggestion?: (suggestion: WorldPromptSuggestionRecord) => void
  onThread?: (thread: WorldThread) => void
}

export type CinematicRunRealtimeInput = {
  runIds: string[]
  onSignal: (runId: string) => void
}

export type RealtimeApi = {
  subscribeWorldPromptEvents(input: WorldPromptRealtimeInput): RealtimeSubscription
  subscribeCinematicRunSignals(input: CinematicRunRealtimeInput): RealtimeSubscription
}
