import { useMemo, useState } from 'react'

import { CompactPromptComposer } from '../../prompts/CompactPromptComposer'
import { EntityIcon, type EntityIconId } from '../../../shared/entityIcons'
import type {
  OutputArtifactFilter,
  OutputLibraryArtifactCard,
  OutputLibraryEntityRef,
  OutputLibraryModel,
  OutputLibraryOpenTarget,
  OutputLibraryRequestRow,
} from './outputLibraryPresentation'

type WorldOutputLibraryBaseProps = {
  canRunOutputs: boolean
  model: OutputLibraryModel
  onCancelOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onDeleteOutputRequest: (requestId: string) => void
  onOpenOutputStudio: (requestId?: string | null, target?: OutputLibraryOpenTarget) => void
  onRefreshOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
  }) => Promise<unknown> | unknown
}

type WorldOutputLibraryPanelProps = WorldOutputLibraryBaseProps & {
  controller?: WorldOutputLibraryController
  showCreateBar?: boolean
}

type WorldOutputCreateRailProps = {
  canRunOutputs: boolean
  controller: WorldOutputLibraryController
  onOpenOutputStudio: (requestId?: string | null, target?: OutputLibraryOpenTarget) => void
}

export type WorldOutputLibraryController = {
  artifactFilter: OutputArtifactFilter
  busy: boolean
  busyRequestId: string | null
  downloadingArtifactKey: string | null
  error: string | null
  prompt: string
  visibleArtifacts: OutputLibraryArtifactCard[]
  handleDownloadArtifact: (artifact: OutputLibraryArtifactCard) => Promise<void>
  setArtifactFilter: (filter: OutputArtifactFilter) => void
  setBusyRequestId: (requestId: string | null) => void
  setError: (message: string | null) => void
  setPrompt: (prompt: string) => void
  submitOutputRequest: () => Promise<void>
}

const OUTPUT_PROMPT_PLACEHOLDER = 'Ask for a trailer, poster, chapter draft, comic issue, reference doc, or anything else this world should produce...'

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

function outputRequestFallbackIcon(row: OutputLibraryRequestRow): EntityIconId {
  if (row.primaryArtifact?.type === 'video') return 'cinematic'
  if (row.primaryArtifact?.type === 'documents') return 'content'
  if (row.primaryArtifact?.type === 'images') return 'asset'
  if (row.outputKind === 'concept_art_image' || row.outputKind === 'poster_image') return 'asset'
  if (row.outputKind === 'cinematic_episode' || row.outputKind === 'cinematic_trailer' || row.outputKind === 'ugc_episode') return 'cinematic'
  if (row.outputKind === 'comic_issue_from_sequence') return 'result'
  return 'content'
}

function OutputRequestThumb({ row }: { row: OutputLibraryRequestRow }) {
  const artifact = row.primaryArtifact
  const thumbnailUrl = artifact?.thumbnailUrl
  const loading = row.groupKey === 'generating'
  return (
    <span className="world-output-row-thumb-stack">
      <span className={`world-output-row-thumb is-${row.groupKey}${loading ? ' is-loading' : ''}`} aria-hidden="true">
        {thumbnailUrl && artifact?.type === 'images' ? <img src={thumbnailUrl} alt="" loading="lazy" /> : null}
        {thumbnailUrl && artifact?.type === 'video' ? <video src={thumbnailUrl} muted playsInline preload="metadata" /> : null}
        {!thumbnailUrl || (artifact?.type !== 'images' && artifact?.type !== 'video')
          ? <EntityIcon id={outputRequestFallbackIcon(row)} />
          : null}
        {loading ? <span className="world-output-row-thumb-spinner" aria-hidden="true" /> : null}
      </span>
      <small className={`world-output-row-thumb-status is-${row.groupKey}`}>{row.statusLabel}</small>
    </span>
  )
}

function OutputRequestEntityRefs({ refs }: { refs: OutputLibraryEntityRef[] }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const visibleRefs = refs.slice(0, 8)
  if (visibleRefs.length === 0) return null
  return (
    <>
      <div className="world-output-row-refs" aria-label="Entity references">
        {visibleRefs.map((ref) => {
          const subtitle = [ref.variantLabel, ref.role].filter(Boolean).join(' · ')
          return (
            <button
              aria-label={`Show references for ${ref.label}`}
              className="world-output-row-ref"
              key={`${ref.key}:${ref.variantKey ?? 'default'}:${ref.role}`}
              onClick={() => setDetailsOpen(true)}
              title={`${ref.label}${subtitle ? ` · ${subtitle}` : ''}`}
              type="button"
            >
              <span className="world-output-row-ref-icon" aria-hidden="true">
                {ref.imageUrl ? <img src={ref.imageUrl} alt="" loading="lazy" /> : <EntityIcon id={ref.icon} />}
              </span>
            </button>
          )
        })}
        {refs.length > visibleRefs.length ? (
          <button className="world-output-row-ref is-more" onClick={() => setDetailsOpen(true)} type="button">
            +{refs.length - visibleRefs.length}
          </button>
        ) : null}
      </div>
      {detailsOpen ? (
        <div className="world-output-ref-popover-backdrop" onClick={() => setDetailsOpen(false)}>
          <div
            aria-label="Output references"
            aria-modal="true"
            className="world-output-ref-popover"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span className="eyebrow">References</span>
                <strong>{refs.length} selected</strong>
              </div>
              <button aria-label="Close references" onClick={() => setDetailsOpen(false)} type="button">×</button>
            </header>
            <div className="world-output-ref-popover-list">
              {refs.map((ref) => {
                const variantLabel = ref.variantLabel || (ref.variantKey ? ref.variantKey.replace(/[_-]+/g, ' ') : '')
                return (
                  <div className="world-output-ref-popover-row" key={`${ref.key}:${ref.variantKey ?? 'default'}:${ref.role}`}>
                    <span className="world-output-row-ref-icon" aria-hidden="true">
                      {ref.imageUrl ? <img src={ref.imageUrl} alt="" loading="lazy" /> : <EntityIcon id={ref.icon} />}
                    </span>
                    <span>
                      <strong>{ref.label}</strong>
                      {variantLabel ? <small>Variant: {variantLabel}</small> : <small>Variant: Default</small>}
                      {ref.summary ? <p>{ref.summary}</p> : null}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function OutputRequestActiveSteps({ row }: { row: OutputLibraryRequestRow }) {
  const labels = row.activeStepLabels.length > 0 ? row.activeStepLabels : row.currentStepLabel ? [row.currentStepLabel] : []
  const visibleLabels = labels.slice(0, 3)
  const extraCount = Math.max(0, labels.length - visibleLabels.length)
  if (labels.length > 1) {
    return (
      <div className="world-output-row-step-list" aria-label="Running workflow steps">
        {visibleLabels.map((label) => (
          <small className="world-output-row-step" key={label} title={label}>
            <span className="world-output-row-step-spinner" aria-hidden="true" />
            {label}
          </small>
        ))}
        {extraCount > 0 ? <small className="world-output-row-step is-more">+{extraCount}</small> : null}
      </div>
    )
  }
  return (
    <small className="world-output-row-step" title={labels[0] || 'Preparing workflow'}>
      <span className="world-output-row-step-spinner" aria-hidden="true" />
      {labels[0] || 'Preparing workflow'}
    </small>
  )
}

function OutputRequestRow({
  busyRequestId,
  row,
  onCancelOutputRequest,
  onDeleteOutputRequest,
  onOpenOutputStudio,
  setBusyRequestId,
  setError,
}: {
  busyRequestId: string | null
  row: OutputLibraryRequestRow
  onCancelOutputRequest: (requestId: string) => Promise<unknown> | unknown
  onDeleteOutputRequest: (requestId: string) => void
  onOpenOutputStudio: (requestId?: string | null, target?: OutputLibraryOpenTarget) => void
  setBusyRequestId: (requestId: string | null) => void
  setError: (message: string | null) => void
}) {
  const busy = busyRequestId === row.id
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
        <OutputRequestThumb row={row} />
        <div>
          <span className="eyebrow">{row.outputKindLabel}</span>
          <strong>{row.title}</strong>
          <OutputRequestEntityRefs refs={row.entityRefs} />
          {row.groupKey === 'generating' ? (
            <OutputRequestActiveSteps row={row} />
          ) : null}
          {row.groupKey === 'needs_attention' && row.currentStepLabel ? (
            <small className="world-output-row-step is-error" title={row.currentStepLabel}>
              {row.currentStepLabel}
            </small>
          ) : null}
        </div>
      </div>
      <div className="world-output-row-side">
        <span className="world-output-progress" aria-label={row.progress.label}>
          <i style={{ ['--progress' as string]: `${row.progress.percent}%` }} />
          <b>{row.progress.label}</b>
        </span>
        <div className="world-output-actions">
          {row.primaryArtifact?.url ? <a href={row.primaryArtifact.url} target="_blank" rel="noreferrer">{row.primaryArtifact.openLabel}</a> : null}
          {row.canOpenGraph ? <button onClick={() => onOpenOutputStudio(row.id, 'graph')} type="button">Graph</button> : null}
          {row.canOpenTimeline ? <button onClick={() => onOpenOutputStudio(row.id, 'timeline')} type="button">Timeline</button> : null}
          {row.canCancel ? <button className="world-output-danger-action" disabled={busy} onClick={cancel} type="button"><span aria-hidden="true">×</span>{busy ? 'Cancelling' : 'Cancel'}</button> : null}
          {row.canRemove ? <button className="world-output-danger-action is-remove-action" disabled={busy} onClick={() => onDeleteOutputRequest(row.id)} type="button"><span aria-hidden="true">×</span>Remove</button> : null}
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

export function useWorldOutputLibraryController({
  model,
  onStartOutputRequest,
}: WorldOutputLibraryBaseProps): WorldOutputLibraryController {
  const [prompt, setPrompt] = useState('')
  const [artifactFilter, setArtifactFilter] = useState<OutputArtifactFilter>('all')
  const [busy, setBusy] = useState(false)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [downloadingArtifactKey, setDownloadingArtifactKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  return {
    artifactFilter,
    busy,
    busyRequestId,
    downloadingArtifactKey,
    error,
    prompt,
    visibleArtifacts,
    handleDownloadArtifact,
    setArtifactFilter,
    setBusyRequestId,
    setError,
    setPrompt,
    submitOutputRequest,
  }
}

export function WorldOutputCreateRail({
  canRunOutputs,
  controller,
  onOpenOutputStudio,
}: WorldOutputCreateRailProps) {
  return (
    <div className="world-output-rail">
      <div className="world-output-rail-head">
        <span className="eyebrow">Outputs</span>
        <strong>Make deliverables</strong>
        <small>Describe the deliverable. SynArc infers whether it should be image, video, prose, comic, or doc.</small>
      </div>
      <div className="world-output-create-form is-rail">
        <CompactPromptComposer
          ariaLabel="Prompt an output from this world"
          busy={controller.busy}
          busyLabel="Creating output..."
          disabled={!canRunOutputs}
          expandIcon="content"
          expandLabel="Open Output Studio"
          placeholder={OUTPUT_PROMPT_PLACEHOLDER}
          sendLabel="Create output"
          submitDisabled={!canRunOutputs || controller.prompt.trim().length === 0}
          value={controller.prompt}
          onChange={controller.setPrompt}
          onExpand={() => onOpenOutputStudio(null)}
          onSubmit={() => void controller.submitOutputRequest()}
        />
        <div className="world-output-inference-note">
          <span>Type inferred from prompt</span>
          {!canRunOutputs ? <span>Live Supabase draft required.</span> : <span>Use plain language: “make a trailer”, “draft chapter 3”, “create a poster”.</span>}
        </div>
        {controller.error ? <p className="world-output-error">{controller.error}</p> : null}
      </div>
    </div>
  )
}

export function WorldOutputLibraryPanel({
  canRunOutputs,
  controller,
  model,
  onCancelOutputRequest,
  onDeleteOutputRequest,
  onOpenOutputStudio,
  onRefreshOutputRequest,
  onStartOutputRequest,
  showCreateBar = true,
}: WorldOutputLibraryPanelProps) {
  const internalController = useWorldOutputLibraryController({
    canRunOutputs,
    model,
    onCancelOutputRequest,
    onDeleteOutputRequest,
    onOpenOutputStudio,
    onRefreshOutputRequest,
    onStartOutputRequest,
  })
  const outputController = controller ?? internalController

  return (
    <div className="world-output-library">
      {showCreateBar ? (
      <section className="world-output-create-bar">
        <div className="world-output-create-copy">
          <span className="eyebrow">Outputs</span>
          <h2>Make and collect deliverables from this world.</h2>
          <p>Finished artifacts stay visible beside the wiki, while workflow controls remain in Studio.</p>
        </div>
        <div className="world-output-create-form">
          <CompactPromptComposer
            ariaLabel="Prompt an output from this world"
            busy={outputController.busy}
            busyLabel="Creating output..."
            disabled={!canRunOutputs}
            expandIcon="content"
            expandLabel="Open Output Studio"
            placeholder={OUTPUT_PROMPT_PLACEHOLDER}
            sendLabel="Create output"
            submitDisabled={!canRunOutputs || outputController.prompt.trim().length === 0}
            value={outputController.prompt}
            onChange={outputController.setPrompt}
            onExpand={() => onOpenOutputStudio(null)}
            onSubmit={() => void outputController.submitOutputRequest()}
          />
          <div className="world-output-inference-note">
            <span>Type inferred from prompt</span>
            {!canRunOutputs ? <span>Live Supabase draft required.</span> : <span>Ask directly for a trailer, poster, chapter, comic, document, or reference pack.</span>}
          </div>
          {outputController.error ? <p className="world-output-error">{outputController.error}</p> : null}
        </div>
      </section>
      ) : null}

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
                    busyRequestId={outputController.busyRequestId}
                    row={row}
                    onCancelOutputRequest={onCancelOutputRequest}
                    onDeleteOutputRequest={onDeleteOutputRequest}
                    onOpenOutputStudio={onOpenOutputStudio}
                    setBusyRequestId={outputController.setBusyRequestId}
                    setError={outputController.setError}
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
                aria-selected={outputController.artifactFilter === filter}
                className={outputController.artifactFilter === filter ? 'is-active' : ''}
                onClick={() => outputController.setArtifactFilter(filter)}
                role="tab"
                type="button"
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>
        {outputController.visibleArtifacts.length === 0 ? (
          <div className="world-output-empty is-compact">
            <strong>No artifacts in this filter</strong>
            <p>Completed PDFs, images, videos, and packages will appear here.</p>
          </div>
        ) : (
          <div className="world-output-artifact-gallery">
            {outputController.visibleArtifacts.map((artifact) => (
              <OutputArtifactCard
                key={artifact.id}
                artifact={artifact}
                downloadingArtifactKey={outputController.downloadingArtifactKey}
                onDownload={(entry) => void outputController.handleDownloadArtifact(entry)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
