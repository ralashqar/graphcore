import { useMemo, useState } from 'react'
import { ArrowUpRight, FilmStrip, NotePencil, Scroll } from '@phosphor-icons/react'
import type { DirectorSource, DirectorSourceKind } from './sourceBridge'
import { sourceExcerpt } from './sourceBridge'

const KIND_LABEL: Record<DirectorSourceKind, string> = { shot: 'Shots', output: 'Screenplays', sequence: 'Sequences' }

export function DirectorSceneSetup({ sources, busy, canRun, hasSession, canImportLegacy, onOpen, onPrepareScript, onImportLegacy, onCancel }: {
  sources: DirectorSource[]
  busy: boolean
  canRun: boolean
  hasSession: boolean
  canImportLegacy: boolean
  onOpen: (input: { source?: DirectorSource; brief: string; title: string }) => Promise<void>
  onPrepareScript: (brief: string) => Promise<void>
  onImportLegacy: () => Promise<void>
  onCancel: () => void
}) {
  const [sourceId, setSourceId] = useState('')
  const [brief, setBrief] = useState('')
  const [title, setTitle] = useState('New scene')
  const [filter, setFilter] = useState<DirectorSourceKind | 'all'>('all')
  const [preparing, setPreparing] = useState(false)
  const source = sources.find((s) => s.id === sourceId)
  const kinds = useMemo(() => (['shot', 'output', 'sequence'] as DirectorSourceKind[]).filter((kind) => sources.some((s) => s.kind === kind)), [sources])
  const visible = sources.filter((s) => filter === 'all' || s.kind === filter).slice(0, 60)
  const ready = Boolean(source?.script?.trim() || brief.trim())

  return (
    <section className="director-start" aria-label="Scene setup">
      <div className="director-start-intro">
        <span className="eyebrow">Scene setup</span>
        <h2>What are we directing?</h2>
        <p>Start from a shot or screenplay you already have, a story sequence, or write a fresh brief. You can switch scenes later without losing takes.</p>
        {canImportLegacy ? <button type="button" className="ghost-button compact" disabled={busy} onClick={() => void onImportLegacy()}>Import previous directing session</button> : null}
      </div>
      <div className="director-start-body">
        <div className={`director-brief-card ${!source ? 'is-selected' : ''}`}>
          <button type="button" className="director-source-card-head" onClick={() => setSourceId('')} aria-pressed={!source}>
            <NotePencil size={18} aria-hidden="true" />
            <strong>Fresh scene brief</strong>
            <span className="director-muted">Describe the moment; the director builds the take from your world.</span>
          </button>
          {!source ? (
            <div className="director-start-fields">
              <label>Scene name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>
              <label>Scene brief<textarea value={brief} rows={6} onChange={(e) => setBrief(e.target.value)} placeholder="Your characters arrive at the abandoned observatory. Wind, dust, a single lit window…" /></label>
            </div>
          ) : null}
        </div>
        {sources.length ? (
          <div className="director-source-list">
            <div className="chip-row director-source-filters" role="group" aria-label="Source type">
              <button type="button" className={`chip ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>All</button>
              {kinds.map((kind) => <button type="button" key={kind} className={`chip ${filter === kind ? 'is-active' : ''}`} onClick={() => setFilter(kind)}>{KIND_LABEL[kind]}</button>)}
            </div>
            <div className="director-source-grid">
              {visible.map((s) => (
                <button type="button" key={s.id} className={`director-source-card ${sourceId === s.id ? 'is-selected' : ''}`} aria-pressed={sourceId === s.id} onClick={() => setSourceId(s.id)}>
                  <span className="director-source-kind">{s.kind === 'shot' ? <FilmStrip size={14} /> : <Scroll size={14} />} {s.kind === 'shot' ? 'Shot' : s.kind === 'output' ? 'Screenplay' : 'Sequence'}</span>
                  <strong>{s.title}</strong>
                  {s.subtitle ? <span className="director-muted">{s.subtitle}</span> : null}
                  <p>{sourceExcerpt(s.script) || 'No script text yet.'}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="director-start-actions">
        <button type="button" className="primary-button" disabled={!canRun || busy || !ready} onClick={() => void onOpen({ source, brief, title: source?.title ?? title })}>Open scene <ArrowUpRight size={16} /></button>
        <button type="button" className="ghost-button" disabled={!canRun || preparing || busy || !ready} title="Author a screenplay and shot plan from this brief with the animatic pipeline; its shots then appear here as sources." onClick={() => { setPreparing(true); void onPrepareScript(brief || source?.script || '').finally(() => setPreparing(false)) }}>{preparing ? 'Preparing…' : 'Write screenplay first'}</button>
        {hasSession ? <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button> : null}
      </div>
    </section>
  )
}
