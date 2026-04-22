import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  getArtStylePreset,
  getOnboardingArtStylePresets,
  type ArtStylePresetId,
} from '../../domain/artStylePresets'
import type { ProjectContext, ProjectSubtype, ProjectType } from '../../domain/projectContext'
import {
  buildProjectContext,
  getBrainProfileSummary,
  getDefaultProjectContext,
  getDefaultProjectSubtype,
  getFallbackArtStyleForProjectType,
  getProjectOnboardingSummary,
  getProjectSubtypeLabel,
  getProjectSubtypeOptions,
  getProjectTypeLabel,
  isGameProjectSubtype,
  PROJECT_TYPE_OPTIONS,
} from '../../domain/projectContextProfiles'
import { EntityIcon } from '../../shared/entityIcons'

type ProjectWorldOnboardingProps = {
  projectName: string
  initialProjectContext: ProjectContext | null
  isSaving: boolean
  onSubmit: (projectContext: ProjectContext) => Promise<void> | void
}

const ONBOARDING_STEP_LABELS = ['Project Type', 'Subtype', 'Art Style'] as const
const GAME_SUBTYPE_ATLAS_URL = '/onboarding/subtypes/game-subtypes-atlas.png'
const STORY_ART_STYLE_ATLAS_URL = '/onboarding/styles/story-art-styles-atlas.png'
const GAME_SUBTYPE_ATLAS_INDEX: Record<
  Extract<ProjectSubtype, 'action_rpg' | 'narrative_adventure' | 'strategy_builder' | 'survival_craft' | 'shooter_combat' | 'social_sim' | 'open_world_sandbox' | 'platformer_metroidvania' | 'horror_mystery'>,
  readonly [number, number]
> = {
  action_rpg: [0, 0],
  narrative_adventure: [1, 0],
  strategy_builder: [2, 0],
  survival_craft: [0, 1],
  shooter_combat: [1, 1],
  social_sim: [2, 1],
  open_world_sandbox: [0, 2],
  platformer_metroidvania: [1, 2],
  horror_mystery: [2, 2],
}
const STORY_ART_STYLE_ATLAS_INDEX: Partial<Record<ArtStylePresetId, readonly [number, number]>> = {
  live_action_cinematic: [0, 0],
  photoreal_game_cg: [1, 0],
  premium_stylized_3d: [2, 0],
  stylized_hero_3d: [0, 1],
  anime_cg: [1, 1],
  stylized_fantasy: [2, 1],
  toon_illustration: [0, 2],
  storybook_illustration: [1, 2],
  custom: [2, 2],
}

function getProjectTypeMediaPath(projectType: ProjectType) {
  return `/onboarding/project-types/${projectType}.png`
}

function getProjectSubtypeMediaPath(projectSubtype: ProjectSubtype) {
  return `/onboarding/subtypes/${projectSubtype}.svg`
}

function getGameSubtypeAtlasStyle(projectSubtype: ProjectSubtype): CSSProperties | null {
  if (!isGameProjectSubtype(projectSubtype)) return null
  const tile = GAME_SUBTYPE_ATLAS_INDEX[projectSubtype]
  if (!tile) return null
  const [column, row] = tile
  return {
    backgroundImage: `url(${GAME_SUBTYPE_ATLAS_URL})`,
    backgroundSize: '300% 300%',
    backgroundPosition: `${column * 50}% ${row * 50}%`,
    backgroundRepeat: 'no-repeat',
  }
}

function getStoryArtStyleAtlasStyle(projectType: ProjectType, presetId: ArtStylePresetId): CSSProperties | null {
  if (projectType !== 'story') return null
  const tile = STORY_ART_STYLE_ATLAS_INDEX[presetId]
  if (!tile) return null
  const [column, row] = tile
  return {
    backgroundImage: `url(${STORY_ART_STYLE_ATLAS_URL})`,
    backgroundSize: '300% 300%',
    backgroundPosition: `${column * 50}% ${row * 50}%`,
    backgroundRepeat: 'no-repeat',
  }
}

export function ProjectWorldOnboarding({
  projectName,
  initialProjectContext,
  isSaving,
  onSubmit,
}: ProjectWorldOnboardingProps) {
  const fallbackContext = initialProjectContext ?? getDefaultProjectContext('story')
  const [step, setStep] = useState(0)
  const [projectType, setProjectType] = useState<ProjectType>(fallbackContext.projectType)
  const [projectSubtype, setProjectSubtype] = useState<ProjectSubtype>(fallbackContext.projectSubtype)
  const [artStylePreset, setArtStylePreset] = useState<ArtStylePresetId>(fallbackContext.artStylePreset as ArtStylePresetId)
  const [artStyleDescription, setArtStyleDescription] = useState(fallbackContext.artStyleDescription)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const validSubtypes = getProjectSubtypeOptions(projectType)
    if (!validSubtypes.some((entry) => entry.id === projectSubtype)) {
      setProjectSubtype(getDefaultProjectSubtype(projectType))
    }
  }, [projectSubtype, projectType])

  const availableStyles = useMemo(
    () => getOnboardingArtStylePresets({ projectType, projectSubtype }),
    [projectSubtype, projectType],
  )

  useEffect(() => {
    if (availableStyles.some((preset) => preset.id === artStylePreset)) return
    setArtStylePreset((availableStyles[0]?.id ?? getFallbackArtStyleForProjectType(projectType)) as ArtStylePresetId)
  }, [artStylePreset, availableStyles, projectType])

  const selectedPreset = getArtStylePreset(artStylePreset)
  const customStyleRequiresDescription = artStylePreset === 'custom'
  const hasCustomStyleDescription = artStyleDescription.trim().length > 0
  const canProceedFromStyleStep = !customStyleRequiresDescription || hasCustomStyleDescription
  const selectedProjectTypeOption = PROJECT_TYPE_OPTIONS.find((option) => option.id === projectType) ?? PROJECT_TYPE_OPTIONS[0]
  const summary = getProjectOnboardingSummary({
    projectType,
    projectSubtype,
    artStyleLabel: selectedPreset.label,
    artStyleDescription,
  })

  const selectionSummary = [
    { label: 'Project type', value: getProjectTypeLabel(projectType) },
    { label: 'Subtype', value: getProjectSubtypeLabel(projectSubtype) },
    { label: 'Art style', value: selectedPreset.label },
  ]

  const subtypeOptions = getProjectSubtypeOptions(projectType)
  const selectedSubtypeOption = subtypeOptions.find((option) => option.id === projectSubtype) ?? subtypeOptions[0]
  const stagePrimaryLabel = step === 0
    ? 'Continue to subtype'
    : step === 1
      ? 'Continue to art style'
      : 'Review setup'
  const stagePrimaryDescription = step === 0
    ? selectedProjectTypeOption.description
    : step === 1
      ? selectedSubtypeOption.description
      : customStyleRequiresDescription && !hasCustomStyleDescription
        ? 'Add a custom style description to continue.'
        : selectedPreset.description
  const stagePrimaryDisabled = isSaving || (step === 2 && !canProceedFromStyleStep)

  function handleProjectTypeSelect(nextType: ProjectType) {
    if (nextType === projectType) {
      setStep(1)
      return
    }
    setProjectType(nextType)
  }

  function handleProjectSubtypeSelect(nextSubtype: ProjectSubtype) {
    if (nextSubtype === projectSubtype) {
      setStep(2)
      return
    }
    setProjectSubtype(nextSubtype)
  }

  function handleArtStyleSelect(nextPreset: ArtStylePresetId) {
    if (nextPreset === artStylePreset) {
      if (!stagePrimaryDisabled) setConfirmOpen(true)
      return
    }
    setArtStylePreset(nextPreset)
  }

  function handleStagePrimaryAction() {
    if (stagePrimaryDisabled) return
    if (step === 0) {
      setStep(1)
      return
    }
    if (step === 1) {
      setStep(2)
      return
    }
    setConfirmOpen(true)
  }

  useEffect(() => {
    if (confirmOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter') return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName
        if (tagName === 'TEXTAREA') return
        if (tagName === 'BUTTON' || tagName === 'A') return
        if (tagName === 'INPUT' && step !== 2) return
      }
      event.preventDefault()
      handleStagePrimaryAction()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmOpen, step, stagePrimaryDisabled])

  async function handleConfirm() {
    if (!canProceedFromStyleStep) return
    const nextContext = buildProjectContext({
      projectType,
      projectSubtype,
      artStylePreset,
      artStyleDescription,
      completed: true,
    })
    await onSubmit(nextContext)
    setConfirmOpen(false)
  }

  return (
    <div className="world-onboarding-shell">
      <aside className="world-onboarding-rail">
        <div className="world-onboarding-panel">
          <div className="world-onboarding-head">
            <span className="eyebrow">Project setup</span>
            <h2>{projectName}</h2>
            <p className="subtle-line">Choose the kind of project you are building, then set the visual direction before you start prompting the world into existence.</p>
          </div>

          <div className="world-onboarding-progress" aria-label="Onboarding progress">
            {ONBOARDING_STEP_LABELS.map((label, index) => (
              <div key={label} className={`world-onboarding-step${index === step ? ' is-active' : ''}${index < step ? ' is-complete' : ''}`}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          <div className="world-onboarding-summary">
            <span className="eyebrow">Current direction</span>
            {selectionSummary.map((entry) => (
              <div key={entry.label} className="world-onboarding-summary-row">
                <span>{entry.label}</span>
                <strong>{entry.value}</strong>
              </div>
            ))}
            {artStyleDescription.trim() ? (
              <div className="world-onboarding-summary-note">{artStyleDescription.trim()}</div>
            ) : null}
            <div className="world-onboarding-summary-steering">
              <strong>How this steers generation</strong>
              <p>{getBrainProfileSummary(projectSubtype)}</p>
            </div>
            <div className="world-onboarding-summary-cta">
              <button
                className="primary-button"
                disabled={stagePrimaryDisabled}
                onClick={handleStagePrimaryAction}
                type="button"
              >
                {stagePrimaryLabel}
              </button>
              <small>{step === 2 ? 'Press Enter to continue after selecting a style.' : 'Press Enter or click the selected card again as a shortcut.'}</small>
            </div>
          </div>
        </div>
      </aside>

      <section className="world-onboarding-stage">
        {step === 0 ? (
          <div className="world-onboarding-step-stage">
            <div className="world-onboarding-copy">
              <span className="eyebrow">Step 1</span>
              <h3>What kind of project world are you building?</h3>
              <p>Start with the top-level format. This sets the overall creative brain before we narrow it into a subtype and visual language.</p>
            </div>

            <div className="world-onboarding-type-grid">
              {PROJECT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`world-onboarding-type-card${option.id === projectType ? ' is-active' : ''}`}
                  onClick={() => handleProjectTypeSelect(option.id)}
                  type="button"
                >
                  <div className="world-onboarding-choice-media">
                    <img alt={option.label} src={getProjectTypeMediaPath(option.id)} />
                    {option.id === projectType ? (
                      <span className="world-onboarding-selected-badge" aria-hidden="true">
                        <EntityIcon id="check" />
                      </span>
                    ) : null}
                  </div>
                  <div className="world-onboarding-choice-note">
                    <strong>{option.label}</strong>
                  </div>
                </button>
              ))}
            </div>

            <div className="world-onboarding-step-actions">
              <div className="world-onboarding-step-selection">
                <span>Selected type</span>
                <strong>{getProjectTypeLabel(projectType)}</strong>
                <small>{selectedProjectTypeOption.description}</small>
              </div>
              <button className="primary-button" disabled={stagePrimaryDisabled} onClick={handleStagePrimaryAction} type="button">
                {stagePrimaryLabel}
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="world-onboarding-step-stage">
            <div className="world-onboarding-copy">
              <span className="eyebrow">Step 2</span>
              <h3>Pick the subtype that best fits the project</h3>
            </div>

            <div className="world-onboarding-subtype-block">
              <div className="world-onboarding-subtype-head">
                <span className="eyebrow">{getProjectTypeLabel(projectType)}</span>
                <h4>Subtype options</h4>
              </div>
              <div className="world-onboarding-subtype-grid">
                {subtypeOptions.map((option) => {
                  const atlasStyle = getGameSubtypeAtlasStyle(option.id)
                  return (
                  <button
                    key={option.id}
                    className={`world-onboarding-subtype-card${option.id === projectSubtype ? ' is-active' : ''}`}
                    onClick={() => handleProjectSubtypeSelect(option.id)}
                    type="button"
                  >
                    <div className={`world-onboarding-choice-media${atlasStyle ? ' is-atlas' : ''}`} style={atlasStyle ?? undefined}>
                      {atlasStyle ? null : <img alt={option.label} src={getProjectSubtypeMediaPath(option.id)} />}
                      {option.id === projectSubtype ? (
                        <span className="world-onboarding-selected-badge" aria-hidden="true">
                          <EntityIcon id="check" />
                        </span>
                      ) : null}
                    </div>
                    <div className="world-onboarding-choice-note">
                      <strong>{option.label}</strong>
                    </div>
                  </button>
                  )
                })}
              </div>
            </div>

            <div className="world-onboarding-step-actions">
              <button className="ghost-button" disabled={isSaving} onClick={() => setStep(0)} type="button">
                Back
              </button>
              <div className="world-onboarding-step-selection">
                <span>Selected subtype</span>
                <strong>{getProjectSubtypeLabel(projectSubtype)}</strong>
                <small>{selectedSubtypeOption.description}</small>
              </div>
              <button className="primary-button" disabled={stagePrimaryDisabled} onClick={handleStagePrimaryAction} type="button">
                {stagePrimaryLabel}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="world-onboarding-step-stage">
            <div className="world-onboarding-copy">
              <span className="eyebrow">Step 3</span>
              <h3>Choose the art style</h3>
            </div>

            <div className="world-onboarding-style-grid">
              {availableStyles.map((preset) => {
                const atlasStyle = getStoryArtStyleAtlasStyle(projectType, preset.id as ArtStylePresetId)
                return (
                <button
                  key={preset.id}
                  className={`world-onboarding-style-card${preset.id === artStylePreset ? ' is-active' : ''}`}
                  onClick={() => handleArtStyleSelect(preset.id as ArtStylePresetId)}
                  type="button"
                >
                  <div className={`world-onboarding-style-media${atlasStyle ? ' is-atlas' : ''}`} style={atlasStyle ?? undefined}>
                    {atlasStyle ? null : preset.thumbnailUrl ? <img alt={preset.label} src={preset.thumbnailUrl} /> : null}
                    {preset.id === artStylePreset ? (
                      <span className="world-onboarding-selected-badge" aria-hidden="true">
                        <EntityIcon id="check" />
                      </span>
                    ) : null}
                  </div>
                  <div className="world-onboarding-style-copy">
                    <strong>{preset.label}</strong>
                  </div>
                </button>
                )
              })}
            </div>

            {artStylePreset === 'custom' ? (
              <label className="field-block world-onboarding-custom-style">
                <span>Custom art style notes</span>
                <textarea
                  rows={4}
                  placeholder="Describe the exact visual language you want: rendering style, palette, lens feel, materials, line work, and mood."
                  value={artStyleDescription}
                  onChange={(event) => setArtStyleDescription(event.target.value)}
                />
                {!hasCustomStyleDescription ? (
                  <small className="world-onboarding-validation-message">
                    Add a custom style description before continuing.
                  </small>
                ) : null}
              </label>
            ) : (
              <label className="field-block world-onboarding-custom-style">
                <span>Optional extra direction</span>
                <input
                  placeholder="Optional: add notes about mood, palette, rendering, or camera feel."
                  value={artStyleDescription}
                  onChange={(event) => setArtStyleDescription(event.target.value)}
                />
              </label>
            )}

            <div className="world-onboarding-step-actions">
              <button className="ghost-button" disabled={isSaving} onClick={() => setStep(1)} type="button">
                Back
              </button>
              <div className="world-onboarding-step-selection">
                <span>Selected art direction</span>
                <strong>{selectedPreset.label}</strong>
                <small>{stagePrimaryDescription}</small>
              </div>
              <button
                className="primary-button"
                disabled={stagePrimaryDisabled}
                onClick={handleStagePrimaryAction}
                type="button"
              >
                {stagePrimaryLabel}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {confirmOpen ? (
        <div className="world-onboarding-confirm-overlay" onClick={() => setConfirmOpen(false)} role="presentation">
          <div className="world-onboarding-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="world-onboarding-confirm-head">
              <div>
                <span className="eyebrow">Ready to start</span>
                <h4>{summary.title}</h4>
              </div>
              <button aria-label="Close confirmation" className="world-prompt-icon-button is-close" onClick={() => setConfirmOpen(false)} type="button">
                <EntityIcon id="plus" />
              </button>
            </div>

            <div className="world-onboarding-confirm-grid">
              <div className="world-onboarding-confirm-row">
                <span>Project type</span>
                <strong>{getProjectTypeLabel(projectType)}</strong>
              </div>
              <div className="world-onboarding-confirm-row">
                <span>Subtype</span>
                <strong>{getProjectSubtypeLabel(projectSubtype)}</strong>
              </div>
              <div className="world-onboarding-confirm-row">
                <span>Art style</span>
                <strong>{selectedPreset.label}</strong>
              </div>
              {artStyleDescription.trim() ? (
                <div className="world-onboarding-confirm-row is-wide">
                  <span>Custom style notes</span>
                  <strong>{artStyleDescription.trim()}</strong>
                </div>
              ) : null}
              <div className="world-onboarding-confirm-row is-wide">
                <span>How this will steer generation</span>
                <strong>{summary.steering}</strong>
              </div>
            </div>

            <div className="world-onboarding-confirm-actions">
              <button className="ghost-button" disabled={isSaving} onClick={() => setConfirmOpen(false)} type="button">
                Back
              </button>
              <button className="primary-button button-with-spinner" disabled={isSaving} onClick={() => void handleConfirm()} type="button">
                {isSaving ? <><span className="button-spinner" aria-hidden="true" />Saving...</> : 'Confirm and start'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
