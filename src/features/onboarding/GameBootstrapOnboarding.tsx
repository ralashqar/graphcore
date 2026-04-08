import { useState } from 'react'

import { GAME_ARCHETYPES, gameArchetypeMap } from '../../domain/gameArchetypes'

type GameBootstrapOnboardingProps = {
  canClose: boolean
  conceptPrompt: string
  gameArchetypeId: string
  isGenerating: boolean
  onChangeConceptPrompt: (value: string) => void
  onChangeGameArchetypeId: (value: string) => void
  onClose: () => void
  onGenerate: () => void
}

export function GameBootstrapOnboarding({
  canClose,
  conceptPrompt,
  gameArchetypeId,
  isGenerating,
  onChangeConceptPrompt,
  onChangeGameArchetypeId,
  onClose,
  onGenerate,
}: GameBootstrapOnboardingProps) {
  const [step, setStep] = useState(0)
  const steps = ['Archetype', 'Concept', 'Generate']
  const selectedArchetype = gameArchetypeMap.get(gameArchetypeId) ?? GAME_ARCHETYPES[0]

  return (
    <div className="bootstrap-overlay" onClick={canClose ? onClose : undefined} role="presentation">
      <section className="bootstrap-dialog bootstrap-dialog-minimal" onClick={(event) => event.stopPropagation()}>
        <div className="bootstrap-hero bootstrap-hero-minimal">
          <div>
            <span className="eyebrow">First-Run Onboarding</span>
            <h2>Build the first playable data layer</h2>
            <p className="subtle-line">Pick the overall game archetype, describe the concept, and GraphCore will infer systems, starter content, and graphs automatically.</p>
          </div>
          {canClose ? <button className="ghost-button compact" onClick={onClose} type="button">Close</button> : null}
        </div>

        <div className="bootstrap-progress bootstrap-progress-minimal" aria-label="Bootstrap steps">
          {steps.map((label, index) => (
            <div key={label} className={index === step ? 'bootstrap-step minimal-step is-active' : 'bootstrap-step minimal-step'}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>

        <div className="bootstrap-stage">
          {step === 0 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Game Archetype</span>
                <h3>Choose the overall shape of the game</h3>
                <p className="subtle-line">This gives the orchestrator its default assumptions for systems, starter content, and graph structure.</p>
              </div>
              <label className="field-block bootstrap-field">
                <span>Overall game archetype</span>
                <select value={gameArchetypeId} onChange={(event) => onChangeGameArchetypeId(event.target.value)}>
                  {GAME_ARCHETYPES.map((archetype) => (
                    <option key={archetype.id} value={archetype.id}>{archetype.label}</option>
                  ))}
                </select>
              </label>
              <div className="bootstrap-summary-panel">
                <strong>{selectedArchetype.label}</strong>
                <p>{selectedArchetype.description}</p>
                <span>{selectedArchetype.promptHint}</span>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Game Concept</span>
                <h3>Describe what this game is about</h3>
                <p className="subtle-line">Write a short pitch. GraphCore will infer starter items, characters, abilities, locations, markets, and graphs from it.</p>
              </div>
              <label className="field-block bootstrap-field">
                <span>What is the game about?</span>
                <textarea
                  rows={8}
                  value={conceptPrompt}
                  onChange={(event) => onChangeConceptPrompt(event.target.value)}
                  placeholder="A rain-soaked detective RPG set in a floating port city where every district is controlled by merchant houses and clues are traded like currency."
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Generate</span>
                <h3>Initialize the live draft</h3>
                <p className="subtle-line">The orchestrator will derive the game spec, plan dependencies, and auto-apply the starter result into the live workspace.</p>
              </div>
              <div className="bootstrap-review-card bootstrap-review-card-minimal">
                <span className="section-label">Selection</span>
                <strong>{selectedArchetype.label}</strong>
                <p>{conceptPrompt.trim() || 'No concept entered yet.'}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bootstrap-footer bootstrap-footer-minimal">
          <div className="bootstrap-nav">
            <button className="ghost-button" disabled={step === 0 || isGenerating} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Back</button>
            {step < steps.length - 1 ? (
              <button className="primary-button" disabled={step === 1 && conceptPrompt.trim().length === 0} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} type="button">Next</button>
            ) : null}
          </div>
          {step === steps.length - 1 ? (
            <button className="primary-button button-with-spinner" disabled={isGenerating || conceptPrompt.trim().length === 0} onClick={onGenerate} type="button">
              {isGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate game'}
            </button>
          ) : <div className="inline-note">Use Back and Next to move through onboarding.</div>}
        </div>
      </section>
    </div>
  )
}
