import { useEffect, useMemo, useRef, useState } from 'react'

import type { GameSystemBundle } from '../../domain/graphcore'
import { ART_STYLE_PRESETS, getArtStylePresetBestFor, getArtStylePresetDescription, getArtStylePresetsByGroup } from '../../domain/artStylePresets'

type ReleaseEntry = {
  id: string
  version: string
  label: string
  createdAt: string
}

type GlobalWorkspaceProps = {
  autoFocusReleasesNonce?: number
  bundle: GameSystemBundle
  canEdit: boolean
  artStyleDescription: string
  artStylePreset: string
  projectDescription: string
  projectName: string
  releases: ReleaseEntry[]
  sourceReason?: string
  onSave: (values: {
    projectName: string
    projectDescription: string
    artStylePreset: string
    artStyleDescription: string
  }) => Promise<void>
}

export function GlobalWorkspace({
  autoFocusReleasesNonce = 0,
  bundle,
  canEdit,
  artStyleDescription,
  artStylePreset,
  projectDescription,
  projectName,
  releases,
  sourceReason,
  onSave,
}: GlobalWorkspaceProps) {
  const [draftProjectName, setDraftProjectName] = useState(projectName)
  const [draftProjectDescription, setDraftProjectDescription] = useState(projectDescription)
  const [draftArtStylePreset, setDraftArtStylePreset] = useState(artStylePreset)
  const [draftArtStyleDescription, setDraftArtStyleDescription] = useState(artStyleDescription)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
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

  const presetGroups = useMemo(() => getArtStylePresetsByGroup(), [])
  const selectedPreset = ART_STYLE_PRESETS.find((preset) => preset.id === draftArtStylePreset) ?? ART_STYLE_PRESETS[0]
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
            <div className="inline-note">
              <strong>AI context</strong>
              <p className="subtle-line">Project description and art direction are reused by world building, prompt planning, and concept generation.</p>
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
              <p className="subtle-line">Project-level fields describe the game itself and are shared across drafts.</p>
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
              <span className="section-label">Creative Direction</span>
              <h3>Universal art style</h3>
              <p className="subtle-line">Draft-scoped visual direction used by prompts, world building, concept art, and downstream generation flows.</p>
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
