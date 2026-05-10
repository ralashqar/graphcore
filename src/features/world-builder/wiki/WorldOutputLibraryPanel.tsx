import { useMemo, useState } from 'react'

import { EntityIcon } from '../../../shared/entityIcons'
import type { OutputArtifactFilter, OutputLibraryArtifactCard, OutputLibraryModel, OutputLibraryRequestRow } from './outputLibraryPresentation'

type OutputPresetKey = 'image' | 'story' | 'comic' | 'ebook' | 'reference' | 'video'

type WorldOutputLibraryPanelProps = {
  canRunOutputs: boolean
  model: OutputLibraryModel
  onCancelOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onDeleteOutputRequest: (requestId: string) => void
  onOpenOutputStudio: (requestId?: string | null) => void
  onRefreshOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
  }) => Promise<unknown> | unknown
}

const outputPresets: Array<{ key: OutputPresetKey; label: string; promptHint: string; targetFormat?: 'pdf' | 'markdown' | 'image' | 'video'; pageCount?: number }> = [
  { key: 'image', label: 'Image', promptHint: 'Create a poster image from this world...', targetFormat: 'image' },
  { key: 'story', label: 'Story', promptHint: 'Write a short story using the strongest canon thread...', targetFormat: 'markdown' },
  { key: 'comic', label: 'Comic', promptHint: 'Make an 8 page comic issue from a sequence...', targetFormat: 'pdf', pageCount: 8 },
  { key: 'ebook', label: 'Ebook', promptHint: 'Create an ebook PDF from the full world...', targetFormat: 'pdf' },
  { key: 'reference', label: 'Reference Doc', promptHint: 'Create a designed world reference document...', targetFormat: 'pdf' },
  { key: 'video', label: 'Video', promptHint: 'Create a cinematic video package from this world...', targetFormat: 'video' },
]

function artifactDownloadFileName(name: string, extension: string) {
  const baseName = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    || 'graphcore-output'
  return extension === 'download' || baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`
}

async function downloadArtifact(url: string, artifact: OutputLibraryArtifactCard) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download artifact (${response.status}).`)
  const sourceBlob = await response.blob()
  const blob = sourceBlob.type || !artifact.mimeType
    ? sourceBlob
    : new Blob([sourceBlob], { type: artifact.mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = artifactDownloadFileName(artifact.name, artifact.extension)
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function OutputArtifactThumb({ artifact }: { artifact: OutputLibraryArtifactCard }) {
  if (artifact.thumbnailUrl && artifact.type === 'images') {
    return <img src={artifact.thumbnailUrl} alt="" loading="lazy" />
  }
  if (artifact.thumbnailUrl && artifact.type === 'video') {
    return <video src={artifact.thumbnailUrl} muted playsInline preload="metadata" />
  }
  return (
    <span className={`world-output-artifact-file is-${artifact.type}`}>
      <EntityIcon id={artifact.type === 'video' ? 'cinematic' : artifact.type === 'documents' ? 'content' : 'asset'} />
      <small>{artifact.kind.replace(/_/g, ' ')}</small>
    </span>
  )
}

function OutputRequestRow({
  busyRequestId,
  row,
  onCancelOutputRequest,
  onDeleteOutputRequest,
  onOpenOutputStudio,
  onRefreshOutputRequest,
  setBusyRequestId,
  setError,
}: {
  busyRequestId: string | null
  row: OutputLibraryRequestRow
  onCancelOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onDeleteOutputRequest: (requestId: string) => void
  onOpenOutputStudio: (requestId?: string | null) => void
  onRefreshOutputRequest: (requestId: string) => Promise<unknown> | unknown
  setBusyRequestId: (requestId: string | null) => void
  setError: (message: string | null) => void
}) {
  const busy = busyRequestId === row.id
  async function refresh() {
    setBusyRequestId(row.id)
    setError(null)
    try {
      await onRefreshOutputRequest(row.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not refresh output request.')
    } finally {
      setBusyRequestId(null)
    }
  }
  async function cancel() {
    setBusyRequestId(row.id)
    setError(null)
    try {
      await onCancelOutputRequest(row.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not cancel output request.')
    } finally {
      setBusyRequestId(null)
    }
  }
  return (
    <article className={`world-output-row is-${row.groupKey}`}>
      <div className="world-output-row-main">
        <span className={`world-output-status-dot is-${row.groupKey}`} aria-hidden="true" />
        <div>
          <span className="eyebrow">{row.outputKindLabel}</span>
          <strong>{row.title}</strong>
          <p>{row.promptExcerpt || 'No prompt recorded.'}</p>
          <div className="world-output-row-meta">
            <span>{row.statusLabel}</span>
            <span>{row.currentStepLabel}</span>
            <span>{row.primaryArtifact ? row.primaryArtifact.name : 'No artifact yet'}</span>
          </div>
        </div>
      </div>
      <div className="world-output-row-side">
        <span className="world-output-progress" aria-label={row.progress.label}>
          <i style={{ ['--progress' as string]: `${row.progress.percent}%` }} />
          <b>{row.progress.label}</b>
        </span>
        <div className="world-output-actions">
          {row.primaryArtifact?.url ? <a href={row.primaryArtifact.url} target="_blank" rel="noreferrer">{row.primaryArtifact.openLabel}</a> : null}
          <button disabled={busy} onClick={refresh} type="button">{busy ? 'Refreshing' : 'Refresh'}</button>
          {row.canCancel ? <button disabled={busy} onClick={cancel} type="button">Cancel</button> : null}
          <button onClick={() => onOpenOutputStudio(row.id)} type="button">Studio</button>
          {row.canRemove ? <button disabled={busy} onClick={() => onDeleteOutputRequest(row.id)} type="button">Remove</button> : null}
        </div>
      </div>
    </article>
  )
}

function OutputArtifactCard({
  artifact,
  downloadingArtifactKey,
  onDownload,
}: {
  artifact: OutputLibraryArtifactCard
  downloadingArtifactKey: string | null
  onDownload: (artifact: OutputLibraryArtifactCard) => void
}) {
  return (
    <article className={`world-output-artifact-card is-${artifact.type}`}>
      <div className="world-output-artifact-thumb">
        <OutputArtifactThumb artifact={artifact} />
      </div>
      <div className="world-output-artifact-copy">
        <span className="eyebrow">{artifact.kind.replace(/_/g, ' ')}</span>
        <strong>{artifact.name}</strong>
        <small>{artifact.requestTitle ?? artifact.promptExcerpt ?? 'Output artifact'}</small>
      </div>
      <div className="world-output-actions">
        {artifact.url ? <a href={artifact.url} target="_blank" rel="noreferrer">{artifact.openLabel}</a> : <span>No URL</span>}
        {artifact.url ? (
          <button disabled={downloadingArtifactKey === artifact.key} onClick={() => onDownload(artifact)} type="button">
            {downloadingArtifactKey === artifact.key ? 'Downloading' : 'Download'}
          </button>
        ) : null}
      </div>
    </article>
  )
}

export function WorldOutputLibraryPanel({
  canRunOutputs,
  model,
  onCancelOutputRequest,
  onDeleteOutputRequest,
  onOpenOutputStudio,
  onRefreshOutputRequest,
  onStartOutputRequest,
}: WorldOutputLibraryPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<OutputPresetKey>('image')
  const [prompt, setPrompt] = useState('')
  const [artifactFilter, setArtifactFilter] = useState<OutputArtifactFilter>('all')
  const [busy, setBusy] = useState(false)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [downloadingArtifactKey, setDownloadingArtifactKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedPresetConfig = outputPresets.find((preset) => preset.key === selectedPreset) ?? outputPresets[0]
  const visibleArtifacts = useMemo(
    () => artifactFilter === 'all' ? model.artifacts : model.artifacts.filter((artifact) => artifact.type === artifactFilter),
    [artifactFilter, model.artifacts],
  )

  async function submitOutputRequest() {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setError('Describe the output you want to make from this world.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onStartOutputRequest({
        prompt: cleanPrompt,
        sourceSurface: 'wiki_outputs',
        targetFormat: selectedPresetConfig.targetFormat,
        pageCount: selectedPresetConfig.pageCount,
      })
      setPrompt('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not start output request.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadArtifact(artifact: OutputLibraryArtifactCard) {
    if (!artifact.url) return
    setDownloadingArtifactKey(artifact.key)
    setError(null)
    try {
      await downloadArtifact(artifact.url, artifact)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download artifact.')
    } finally {
      setDownloadingArtifactKey(null)
    }
  }

  return (
    <div className="world-output-library">
      <section className="world-output-create-bar">
        <div className="world-output-create-copy">
          <span className="eyebrow">Outputs</span>
          <h2>Make and collect deliverables from this world.</h2>
          <p>Finished artifacts stay visible beside the wiki, while workflow controls remain in Studio.</p>
        </div>
        <div className="world-output-create-form">
          <div className="world-output-preset-row" role="tablist" aria-label="Output type">
            {outputPresets.map((preset) => (
              <button
                key={preset.key}
                aria-selected={selectedPreset === preset.key}
                className={selectedPreset === preset.key ? 'is-active' : ''}
                onClick={() => setSelectedPreset(preset.key)}
                role="tab"
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="world-output-prompt-input">
            <span>Output request</span>
            <textarea
              aria-label="Prompt an output from this world"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={selectedPresetConfig.promptHint}
              rows={3}
              value={prompt}
            />
          </label>
          <div className="world-output-submit-row">
            <button disabled={!canRunOutputs || busy} onClick={submitOutputRequest} type="button">
              {busy ? 'Creating output...' : `Generate ${selectedPresetConfig.label}`}
            </button>
            <button onClick={() => onOpenOutputStudio(null)} type="button">Open Studio</button>
            {!canRunOutputs ? <span>Live Supabase draft required.</span> : null}
          </div>
          {error ? <p className="world-output-error">{error}</p> : null}
        </div>
      </section>

      <section className="world-output-summary-strip" aria-label="Output summary">
        <span><strong>{model.counts.generating}</strong><small>Generating</small></span>
        <span><strong>{model.counts.needsAttention}</strong><small>Needs attention</small></span>
        <span><strong>{model.counts.ready}</strong><small>Ready</small></span>
        <span><strong>{model.counts.artifacts}</strong><small>Artifacts</small></span>
      </section>

      <section className="world-output-section">
        <div className="world-output-section-head">
          <div>
            <span className="eyebrow">Production</span>
            <h3>Requests</h3>
          </div>
        </div>
        {model.rows.length === 0 ? (
          <div className="world-output-empty">
            <EntityIcon id="cinematic" />
            <strong>No outputs yet</strong>
            <p>Generate an image, story, comic, ebook, reference document, or video package from this world.</p>
          </div>
        ) : (
          <div className="world-output-group-list">
            {model.groups.filter((group) => group.rows.length > 0).map((group) => (
              <section className="world-output-group" key={group.key}>
                <div className="world-output-group-head">
                  <strong>{group.label}</strong>
                  <span>{group.rows.length}</span>
                </div>
                {group.rows.map((row) => (
                  <OutputRequestRow
                    key={row.id}
                    busyRequestId={busyRequestId}
                    row={row}
                    onCancelOutputRequest={onCancelOutputRequest}
                    onDeleteOutputRequest={onDeleteOutputRequest}
                    onOpenOutputStudio={onOpenOutputStudio}
                    onRefreshOutputRequest={onRefreshOutputRequest}
                    setBusyRequestId={setBusyRequestId}
                    setError={setError}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="world-output-section">
        <div className="world-output-section-head">
          <div>
            <span className="eyebrow">Gallery</span>
            <h3>Artifacts</h3>
          </div>
          <div className="world-output-filter-row" role="tablist" aria-label="Artifact filter">
            {(['all', 'images', 'documents', 'video', 'other'] as const).map((filter) => (
              <button
                key={filter}
                aria-selected={artifactFilter === filter}
                className={artifactFilter === filter ? 'is-active' : ''}
                onClick={() => setArtifactFilter(filter)}
                role="tab"
                type="button"
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>
        {visibleArtifacts.length === 0 ? (
          <div className="world-output-empty is-compact">
            <strong>No artifacts in this filter</strong>
            <p>Completed PDFs, images, videos, and packages will appear here.</p>
          </div>
        ) : (
          <div className="world-output-artifact-gallery">
            {visibleArtifacts.map((artifact) => (
              <OutputArtifactCard
                key={artifact.id}
                artifact={artifact}
                downloadingArtifactKey={downloadingArtifactKey}
                onDownload={(entry) => void handleDownloadArtifact(entry)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
