import { useEffect, useState } from 'react'

import {
  FAILED_SEQUENCE_ANIMATIC_STATUSES,
  sequenceAnimaticEffectiveStatus,
} from './sequenceAnimaticRuntimePresentation'
import type { SequenceAnimaticViewModel } from './sequenceAnimaticViewModel'

const SEQUENCE_ANIMATIC_THINKING_PHRASES = [
  'Authoring screenplay',
  'Finding the scene spine',
  'Planning shots',
  'Binding continuity',
] as const

function sequenceAnimaticHasAnyShots(model: Pick<SequenceAnimaticViewModel, 'blocks'>) {
  return model.blocks.some((block) => block.shots.length > 0)
}

export function sequenceAnimaticShouldShowThinking(model: Pick<SequenceAnimaticViewModel, 'request' | 'blocks' | 'currentStepLabel'>) {
  if (sequenceAnimaticHasAnyShots(model)) return false
  if (FAILED_SEQUENCE_ANIMATIC_STATUSES.has(sequenceAnimaticEffectiveStatus(model.request))) return false
  return Boolean(model.currentStepLabel)
    || model.request.status === 'queued'
    || model.request.status === 'planning'
    || model.request.status === 'running'
}

export function SequenceAnimaticThinkingState() {
  const [phraseIndex, setPhraseIndex] = useState(0)
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % SEQUENCE_ANIMATIC_THINKING_PHRASES.length)
    }, 1600)
    return () => window.clearInterval(intervalId)
  }, [])
  return (
    <section className="world-wiki-sequence-animatic-thinking" role="status" aria-live="polite">
      <div className="world-wiki-sequence-animatic-thinking-brain-stage" aria-hidden="true">
        <img className="world-wiki-sequence-animatic-thinking-brain" src="/landing/hero-world-core-v4.png" alt="" />
      </div>
      <div>
        <span className="eyebrow">Animatic generation</span>
        <strong>Thinking</strong>
        <small key={SEQUENCE_ANIMATIC_THINKING_PHRASES[phraseIndex]}>{SEQUENCE_ANIMATIC_THINKING_PHRASES[phraseIndex]}</small>
      </div>
      <span className="world-wiki-sequence-animatic-thinking-spinner" aria-hidden="true" />
    </section>
  )
}
