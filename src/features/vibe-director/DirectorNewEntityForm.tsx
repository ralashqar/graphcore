import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { DIRECTOR_NEW_ENTITY_KINDS, type DirectorCastKind } from '../../domain/directorCast'

export type NewEntityInput = { name: string; kind: DirectorCastKind; description: string; visualNotes: string; generateSheet: boolean }

export function DirectorNewEntityForm({ busy, onCreate, onClose }: {
  busy: boolean
  onCreate: (input: NewEntityInput) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DirectorCastKind>('character')
  const [description, setDescription] = useState('')
  const [visualNotes, setVisualNotes] = useState('')
  const [generateSheet, setGenerateSheet] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])
  const submit = async () => {
    if (!name.trim() || !description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), kind, description: description.trim(), visualNotes: visualNotes.trim(), generateSheet })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="content-create-overlay director-overlay" role="presentation" onClick={() => !submitting && onClose()}>
      <div className="content-create-dialog director-dialog" role="dialog" aria-modal="true" aria-labelledby="director-new-entity-title" onClick={(event) => event.stopPropagation()}>
        <div className="director-dialog-head">
          <div><span className="eyebrow">New cast member</span><h3 id="director-new-entity-title">Create a character, location or prop</h3></div>
          <button type="button" className="ghost-button compact" aria-label="Close" disabled={submitting} onClick={onClose}><X size={16} /></button>
        </div>
        <p className="director-muted">It becomes a real world entity in this draft. With “Generate reference sheet” on, the director also writes its visual identity and renders a sheet in the project art style so it can appear in takes.</p>
        <div className="chip-row" role="group" aria-label="Type">
          {DIRECTOR_NEW_ENTITY_KINDS.map((option) => <button type="button" key={option.kind} className={`chip ${kind === option.kind ? 'is-active' : ''}`} onClick={() => setKind(option.kind)}>{option.label}</button>)}
        </div>
        <div className="director-start-fields">
          <label>Name<input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={kind === 'character' ? 'Mara Vell' : kind === 'location' ? 'Abandoned observatory' : 'Brass astrolabe'} /></label>
          <label>Who or what is it?<textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Role in the story, personality or purpose, relationships." /></label>
          <label>Look (optional)<textarea rows={3} value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} placeholder="Age, build, wardrobe, palette, materials, distinguishing marks…" /></label>
          <label className="director-check"><input type="checkbox" checked={generateSheet} onChange={(e) => setGenerateSheet(e.target.checked)} /> Generate reference sheet now</label>
        </div>
        {error ? <p className="director-hint is-warning" role="alert">{error}</p> : null}
        <div className="director-dialog-actions">
          <button type="button" className="ghost-button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" disabled={busy || submitting || !name.trim() || !description.trim()} onClick={() => void submit()}>{submitting ? 'Creating…' : generateSheet ? 'Create and generate sheet' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}
