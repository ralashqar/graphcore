import { useEffect, useMemo, useRef, useState } from 'react'

import type { GameSystemBundle } from '../../domain/graphcore'
import { ART_STYLE_PRESETS, getArtStylePresetBestFor, getArtStylePresetDescription, getArtStylePresetsByGroup } from '../../domain/artStylePresets'
import type { ProjectContext } from '../../domain/projectContext'
import { getBrainProfileSummary, getProjectSubtypeLabel, getProjectTypeLabel, isProjectOnboardingComplete } from '../../domain/projectContextProfiles'
import type { VisualGenerationStartResponse, VisualGenerationStatusResponse } from '../../domain/visualGeneration'

type ReleaseEntry = {
  id: string
  version: string
  label: string
  createdAt: string
}

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

type GlobalWorkspaceProps = {
  autoFocusReleasesNonce?: number
  bundle: GameSystemBundle
  canEdit: boolean
  artStyleDescription: string
  artStylePreset: string
  projectDescription: string
  projectContext: ProjectContext | null
  projectName: string
  releases: ReleaseEntry[]
  sourceReason?: string
  worldConceptImageUrl?: string | null
  worldConceptPrompt?: string
  worldConceptStatus?: 'missing' | 'generating' | 'ready'
  worldConceptVisualJobId?: string
  onSave: (values: {
    projectName: string
    projectDescription: string
    artStylePreset: string
    artStyleDescription: string
  }) => Promise<void>
  onGenerateWorldConceptImage?: () => Promise<VisualGenerationStartResponse>
  onGetVisualGenerationStatus?: (jobId: string) => Promise<VisualGenerationStatusResponse> | VisualGenerationStatusResponse
  onOpenWiki?: () => void
  onRefreshLiveSnapshot?: () => Promise<void> | void
}

export function GlobalWorkspace({
  autoFocusReleasesNonce = 0,
  bundle,
  canEdit,
  artStyleDescription,
  artStylePreset,
  projectDescription,
  projectContext,
  projectName,
  releases,
  sourceReason,
  worldConceptImageUrl = null,
  worldConceptPrompt = '',
  worldConceptStatus = 'missing',
  worldConceptVisualJobId = '',
  onSave,
  onGenerateWorldConceptImage,
  onGetVisualGenerationStatus,
  onOpenWiki,
  onRefreshLiveSnapshot,
}: GlobalWorkspaceProps) {
  const [draftProjectName, setDraftProjectName] = useState(projectName)
  const [draftProjectDescription, setDraftProjectDescription] = useState(projectDescription)
  const [draftArtStylePreset, setDraftArtStylePreset] = useState(artStylePreset)
  const [draftArtStyleDescription, setDraftArtStyleDescription] = useState(artStyleDescription)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [conceptGenerationPending, setConceptGenerationPending] = useState(false)
  const [conceptGenerationError, setConceptGenerationError] = useState<string | null>(null)
  const [localConceptJobId, setLocalConceptJobId] = useState<string | null>(null)
  const releasesSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setDraftProjectName(projectName)
    setDraftProjectDescription(projectDescription)
    setDraftArtStylePreset(artStylePreset)
    setDraftArtStyleDescription(artStyleDescription)
  }, [artStyleDescription, artStylePreset, projectDescription, projectName])

  useEffect(() => {
    if (autoFocusReleasesNonce <= 0) return
    releasesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [autoFocusReleasesNonce])

  useEffect(() => {
    if (worldConceptStatus !== 'ready' && !worldConceptImageUrl) return
    setConceptGenerationPending(false)
    setLocalConceptJobId(null)
  }, [worldConceptImageUrl, worldConceptStatus])

  const presetGroups = useMemo(() => getArtStylePresetsByGroup(), [])
  const selectedPreset = ART_STYLE_PRESETS.find((preset) => preset.id === draftArtStylePreset) ?? ART_STYLE_PRESETS[0]
  const onboardingComplete = isProjectOnboardingComplete(projectContext)
  const activeConceptJobId = localConceptJobId ?? (trimOptionalString(worldConceptVisualJobId) || null)
  const conceptIsGenerating = conceptGenerationPending || worldConceptStatus === 'generating'
  const conceptActionLabel = conceptIsGenerating
    ? 'Generating...'
    : worldConceptStatus === 'ready'
      ? 'Regenerate concept image'
      : 'Generate concept image'
  const isDirty =
    draftProjectName !== projectName
    || draftProjectDescription !== projectDescription
    || draftArtStylePreset !== artStylePreset
    || draftArtStyleDescription !== artStyleDescription

  async function handleSave() {
    setSavePending(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      await onSave({
        projectName: draftProjectName,
        projectDescription: draftProjectDescription,
        artStylePreset: draftArtStylePreset,
        artStyleDescription: draftArtStyleDescription,
      })
      setSaveSuccess('Global context saved.')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Saving global context failed.')
    } finally {
      setSavePending(false)
    }
  }

  async function handleGenerateWorldConceptImage() {
    if (!onGenerateWorldConceptImage) return
    setConceptGenerationPending(true)
    setConceptGenerationError(null)
    try {
      const result = await onGenerateWorldConceptImage()
      setLocalConceptJobId(result.job.id)
    } catch (error) {
      setConceptGenerationError(error instanceof Error ? error.message : 'World concept image generation failed.')
    } finally {
      setConceptGenerationPending(false)
    }
  }

  useEffect(() => {
    if (!activeConceptJobId || !onGetVisualGenerationStatus) return undefined
    if (worldConceptStatus === 'ready' && !localConceptJobId) return undefined
    let disposed = false
    let refreshed = false
    const poll = async () => {
      try {
        const status = await onGetVisualGenerationStatus(activeConceptJobId)
        if (disposed) return
        if (status.terminal) {
          setLocalConceptJobId(null)
          if (!refreshed) {
            refreshed = true
            await onRefreshLiveSnapshot?.()
            window.setTimeout(() => {
              if (!disposed) void onRefreshLiveSnapshot?.()
            }, 1500)
          }
        }
      } catch (error) {
        if (!disposed) {
          setConceptGenerationError(error instanceof Error ? error.message : 'Could not refresh concept image status.')
        }
      }
    }
    void poll()
    const intervalId = window.setInterval(() => void poll(), 1500)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [activeConceptJobId, localConceptJobId, onGetVisualGenerationStatus, onRefreshLiveSnapshot, worldConceptStatus])

  return (
    <div className="focus-layout global-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Global Context</span>
          <div className="diagnostic-stack">
            <div className="inline-note">
              <strong>{draftProjectName.trim() || 'Untitled project'}</strong>
              <p className="subtle-line">{draftProjectDescription.trim() || 'No project description yet.'}</p>
            </div>
            <div className="inline-note">
              <strong>{selectedPreset.label}</strong>
              <p className="subtle-line">{selectedPreset.description}</p>
            </div>
            {projectContext ? (
              <div className="inline-note">
                <strong>{getProjectTypeLabel(projectContext.projectType)} · {getProjectSubtypeLabel(projectContext.projectSubtype)}</strong>
                <p className="subtle-line">{getBrainProfileSummary(projectContext.projectSubtype)}</p>
              </div>
            ) : null}
            <div className="inline-note">
              <strong>AI context</strong>
              <p className="subtle-line">Project setup, description, and art direction are reused by world building, prompt planning, and concept generation.</p>
            </div>
          </div>
        </div>
      </aside>
      <section className="main-surface detail-surface">
        <div className="detail-stack">
          <div className="surface-head global-surface-head">
            <div>
              <span className="eyebrow">Project Global Context</span>
              <h2>{projectName}</h2>
              <p className="subtle-line">{sourceReason ?? 'Project identity and creative direction for prompts, content generation, and publishing.'}</p>
            </div>
            <div className="global-save-cluster">
              {isDirty ? <span className="signal-pill">Unsaved changes</span> : null}
              <button className="primary-button button-with-spinner" disabled={!canEdit || !isDirty || savePending} onClick={() => void handleSave()} type="button">
                {savePending ? <><span className="button-spinner" aria-hidden="true" />Saving...</> : 'Save changes'}
              </button>
            </div>
          </div>

          {!canEdit ? <div className="inline-note">Switch to a live Supabase workspace to edit project settings and creative direction.</div> : null}
          {saveError ? <div className="inline-note is-error">{saveError}</div> : null}
          {saveSuccess ? <div className="inline-note">{saveSuccess}</div> : null}

          <section className="global-card">
            <div className="section-head">
              <span className="section-label">Project</span>
              <h3>Project identity</h3>
              <p className="subtle-line">Project-level fields describe the project itself and are shared across drafts.</p>
            </div>
            <div className="editor-grid">
              <label className="field-block">
                <span>Project Name</span>
                <input disabled={!canEdit || savePending} onChange={(event) => setDraftProjectName(event.target.value)} value={draftProjectName} />
              </label>
              <label className="field-block full-width">
                <span>Project Description</span>
                <textarea
                  disabled={!canEdit || savePending}
                  onChange={(event) => setDraftProjectDescription(event.target.value)}
                  rows={5}
                  placeholder="Describe the world, product vision, tone, setting, and core fantasy so prompts inherit the right global context."
                  value={draftProjectDescription}
                />
              </label>
            </div>
          </section>

          <section className="global-card">
            <div className="section-head">
              <span className="section-label">Onboarding Profile</span>
              <h3>Project setup context</h3>
              <p className="subtle-line">These values come from the empty-world onboarding and steer the AI planning profile used in the world workspace.</p>
            </div>
            {projectContext ? (
              <div className="editor-grid compact">
                <div className="global-preset-preview">
                  <strong>Project type</strong>
                  <span>{getProjectTypeLabel(projectContext.projectType)}</span>
                </div>
                <div className="global-preset-preview">
                  <strong>Subtype</strong>
                  <span>{getProjectSubtypeLabel(projectContext.projectSubtype)}</span>
                </div>
                <div className="global-preset-preview">
                  <strong>AI brain</strong>
                  <span>{projectContext.brainProfile}</span>
                  <span className="subtle-line">{getBrainProfileSummary(projectContext.projectSubtype)}</span>
                </div>
                <div className="global-preset-preview">
                  <strong>Setup status</strong>
                  <span>{onboardingComplete ? 'Completed' : 'Not completed'}</span>
                  <span className="subtle-line">{projectContext.onboardingVersion}</span>
                </div>
              </div>
            ) : (
              <div className="inline-note">No onboarding profile has been saved yet. Start from an empty world in the World tab to create one.</div>
            )}
          </section>

          <section className="global-card global-concept-card">
            <div className="section-head">
              <span className="section-label">World Concept Image</span>
              <h3>Wiki hero graphic</h3>
              <p className="subtle-line">A single cinematic concept image used as the wiki overview hero. Generate it here if the initial world build did not create one.</p>
            </div>
            <div className={worldConceptImageUrl ? 'global-concept-layout has-image' : 'global-concept-layout'}>
              <div className="global-concept-preview">
                {worldConceptImageUrl ? (
                  <img src={worldConceptImageUrl} alt="" />
                ) : (
                  <div className="global-concept-placeholder">
                    <span>{conceptIsGenerating ? 'Concept image generating' : worldConceptStatus === 'ready' ? 'Concept image ready' : 'No world concept image yet'}</span>
                  </div>
                )}
              </div>
              <div className="global-concept-copy">
                <div className="stats-line">
                  <span>{worldConceptStatus === 'ready' ? 'Ready' : conceptIsGenerating ? 'Queued' : 'Missing'}</span>
                  {activeConceptJobId ? <span>Job {activeConceptJobId.slice(0, 8)}</span> : null}
                </div>
                <p className="subtle-line">{trimOptionalString(worldConceptPrompt) || 'The prompt will be built from the title, logline, synopsis, art direction, motifs, tone, and palette.'}</p>
                {conceptGenerationError ? <div className="inline-note is-error">{conceptGenerationError}</div> : null}
                <div className="global-concept-actions">
                  <button
                    className="primary-button button-with-spinner"
                    disabled={!canEdit || conceptIsGenerating || !onGenerateWorldConceptImage}
                    onClick={() => void handleGenerateWorldConceptImage()}
                    type="button"
                  >
                    {conceptIsGenerating ? <><span className="button-spinner" aria-hidden="true" />{conceptActionLabel}</> : conceptActionLabel}
                  </button>
                  {worldConceptStatus === 'ready' && onOpenWiki ? (
                    <button className="ghost-button" onClick={onOpenWiki} type="button">View in Wiki</button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="global-card">
            <div className="section-head">
              <span className="section-label">Creative Direction</span>
              <h3>Universal art style</h3>
              <p className="subtle-line">Draft-scoped visual direction used by prompts, world building, concept art, and downstream generation flows. When an onboarding profile exists, saving here updates that profile too.</p>
            </div>
            <div className="editor-grid">
              <label className="field-block">
                <span>Project Art Style</span>
                <select disabled={!canEdit || savePending} onChange={(event) => setDraftArtStylePreset(event.target.value)} value={draftArtStylePreset}>
                  {presetGroups.map((entry) => (
                    <optgroup key={entry.group} label={entry.group}>
                      {entry.presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="global-preset-preview">
                <strong>{selectedPreset.label}</strong>
                <span>{getArtStylePresetDescription(draftArtStylePreset)}</span>
                <span className="subtle-line">Best for: {getArtStylePresetBestFor(draftArtStylePreset)}</span>
              </div>
              <label className="field-block full-width">
                <span>Custom Art Style Notes</span>
                <textarea
                  disabled={!canEdit || savePending}
                  onChange={(event) => setDraftArtStyleDescription(event.target.value)}
                  rows={4}
                  placeholder="Optional extra direction: material treatment, camera feel, palette, lighting language, product-photo mood, or rendering constraints."
                  value={draftArtStyleDescription}
                />
              </label>
            </div>
          </section>

          <section className="global-card" ref={releasesSectionRef}>
            <div className="section-head">
              <span className="section-label">Releases & Bundle</span>
              <h3>Publish history and current bundle</h3>
              <p className="subtle-line">Publishing still happens from the top bar. This section keeps the history, bundle diagnostics, and preview payload in one place.</p>
            </div>
            <div className="global-release-grid">
              <div className="rail-section global-release-history">
                <span className="section-label">Release history</span>
                <div className="rail-list">
                  {releases.length === 0 ? <div className="inline-note">No releases have been published yet.</div> : null}
                  {releases.map((release) => (
                    <div key={release.id} className="release-row">
                      <strong>{release.version}</strong>
                      <span>{release.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="diagnostic-stack">
                <div className="stats-line">
                  <span>{bundle.manifest.definitionCount} definitions</span>
                  <span>{bundle.manifest.archetypeCount} archetypes</span>
                  <span>{bundle.manifest.assetCount} assets</span>
                </div>
                {bundle.diagnostics.length === 0 ? <div className="inline-note">No compiler diagnostics in the current bundle.</div> : null}
                {bundle.diagnostics.map((diagnostic, index) => (
                  <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'global'}-${index}`} className={`inline-note is-${diagnostic.level}`}>
                    {diagnostic.message}
                  </div>
                ))}
                <details className="global-bundle-details">
                  <summary>Raw bundle preview</summary>
                  <pre>{JSON.stringify(bundle, null, 2)}</pre>
                </details>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
