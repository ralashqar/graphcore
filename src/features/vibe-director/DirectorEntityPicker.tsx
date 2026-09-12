import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import type { VisualGenerationJob } from '../../domain/visualGeneration'
import { EntityIcon } from '../../shared/entityIcons'
import { iconForWorldEntity } from '../../domain/worldGraphHelpers'
import { DIRECTOR_CAST_KIND_LABEL, buildDirectorCast, isDirectorCastEntity, type DirectorCastKind } from '../../domain/directorCast'

export function DirectorEntityPicker({ snapshot, jobs, selected, urls, onSign, onApply, onClose }: {
  snapshot: ProjectSnapshot
  jobs: VisualGenerationJob[]
  selected: string[]
  urls: Record<string, string>
  onSign: (keys: string[]) => void
  onApply: (keys: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<DirectorCastKind | 'all'>('all')
  const [picked, setPicked] = useState<string[]>(selected)
  const members = useMemo(() => {
    const entities = snapshot.worldEntities.filter(isDirectorCastEntity)
    return buildDirectorCast(entities, entities.map((e) => e.key), jobs)
  }, [snapshot.worldEntities, jobs])
  const visible = members.filter((m) => (kind === 'all' || m.kind === kind) && (!query.trim() || `${m.name} ${m.summary}`.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 120)
  useEffect(() => {
    onSign(visible.map((m) => m.referenceAssetKey).filter((key): key is string => Boolean(key)).slice(0, 80))
    // Sign only what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((m) => m.referenceAssetKey).join('|')])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const toggle = (key: string) => setPicked((current) => current.includes(key) ? current.filter((k) => k !== key) : [...current, key].slice(0, 50))
  const kinds = (['character', 'location', 'prop', 'group'] as DirectorCastKind[]).filter((k) => members.some((m) => m.kind === k))

  return (
    <div className="content-create-overlay director-overlay" role="presentation" onClick={onClose}>
      <div className="content-create-dialog director-dialog" role="dialog" aria-modal="true" aria-labelledby="director-entity-picker-title" onClick={(event) => event.stopPropagation()}>
        <div className="director-dialog-head">
          <div><span className="eyebrow">Cast</span><h3 id="director-entity-picker-title">Add from your world</h3></div>
          <button type="button" className="ghost-button compact" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="director-dialog-tools">
          <label className="director-search"><MagnifyingGlass size={15} aria-hidden="true" /><input autoFocus placeholder="Search characters, places, props…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="chip-row" role="group" aria-label="Filter by type">
            <button type="button" className={`chip ${kind === 'all' ? 'is-active' : ''}`} onClick={() => setKind('all')}>All</button>
            {kinds.map((k) => <button type="button" key={k} className={`chip ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>{DIRECTOR_CAST_KIND_LABEL[k]}s</button>)}
          </div>
        </div>
        <ul className="director-pick-list" aria-label="World entities">
          {visible.map((m) => {
            const url = m.referenceAssetKey ? urls[m.referenceAssetKey] : undefined
            const checked = picked.includes(m.key)
            return (
              <li key={m.key}>
                <label className={`director-pick-row ${checked ? 'is-selected' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(m.key)} />
                  <span className="director-cast-thumb">{url ? <img src={url} alt="" /> : <EntityIcon id={iconForWorldEntity(m.nodeType)} className="director-cast-icon" />}</span>
                  <span className="director-pick-body"><strong>{m.name}</strong><span className="director-muted">{DIRECTOR_CAST_KIND_LABEL[m.kind]}{m.summary ? ` · ${m.summary.slice(0, 90)}` : ''}</span></span>
                  <span className={`director-pill is-${m.status === 'ready' ? 'ready' : m.status === 'generating' ? 'active' : 'muted'}`}>{m.status === 'ready' ? 'Reference ready' : m.status === 'generating' ? 'Generating' : 'No reference'}</span>
                </label>
              </li>
            )
          })}
          {!visible.length ? <li className="director-muted director-pick-empty">No matching entities. Create a new character instead.</li> : null}
        </ul>
        <div className="director-dialog-actions">
          <span className="director-muted">{picked.length} selected · entities without a reference get a sheet button in the rail</span>
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => onApply(picked)}>Use {picked.length} in cast</button>
        </div>
      </div>
    </div>
  )
}
