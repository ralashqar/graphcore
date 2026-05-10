import { useState } from 'react'

import type { WorldPromptSeedInferenceResponse, WorldPromptSession } from '../../../domain/worldPrompt'
import type { WorldPromptTurnLens } from '../../world/worldPresentation'

export function useWorldPromptPanelState(worldPromptSessions: WorldPromptSession[]) {
  const [selectedPromptSessionKey, setSelectedPromptSessionKey] = useState<string | null>(worldPromptSessions[0]?.key ?? null)
  const [selectedPromptThreadKey, setSelectedPromptThreadKey] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [worldPromptText, setWorldPromptText] = useState('')
  const [worldPromptPanelMode, setWorldPromptPanelMode] = useState<'expanded' | 'compact'>('expanded')
  const [worldPromptError, setWorldPromptError] = useState<string | null>(null)
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false)
  const [seedInferenceResult, setSeedInferenceResult] = useState<WorldPromptSeedInferenceResponse | null>(null)
  const [seedGenerationStarted, setSeedGenerationStarted] = useState(false)
  const [isPromptCancelling, setIsPromptCancelling] = useState(false)
  const [activeTurnLens, setActiveTurnLens] = useState<WorldPromptTurnLens | null>(null)
  const [flashTurnLens, setFlashTurnLens] = useState<WorldPromptTurnLens | null>(null)

  return {
    selectedPromptSessionKey,
    setSelectedPromptSessionKey,
    selectedPromptThreadKey,
    setSelectedPromptThreadKey,
    historyOpen,
    setHistoryOpen,
    worldPromptText,
    setWorldPromptText,
    worldPromptPanelMode,
    setWorldPromptPanelMode,
    worldPromptError,
    setWorldPromptError,
    isPromptSubmitting,
    setIsPromptSubmitting,
    seedInferenceResult,
    setSeedInferenceResult,
    seedGenerationStarted,
    setSeedGenerationStarted,
    isPromptCancelling,
    setIsPromptCancelling,
    activeTurnLens,
    setActiveTurnLens,
    flashTurnLens,
    setFlashTurnLens,
  }
}
