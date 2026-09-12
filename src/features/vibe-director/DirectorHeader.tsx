import { ArrowUpRight, DownloadSimple, FilmSlate, Plus } from '@phosphor-icons/react'
import type { DirectorController } from './useDirectorController'

export function DirectorHeader({ controller: c, onNewScene, onOpenWiki, onOpenOutputs }: {
  controller: DirectorController
  onNewScene: () => void
  onOpenWiki: () => void
  onOpenOutputs: () => void
}) {
  const session = c.state.session
  const canExport = Boolean(session?.active_edit_id) && c.state.edits.find((e) => e.id === session?.active_edit_id)?.clips.length
  return (
    <header className="director-header">
      <div className="director-header-title">
        <span className="eyebrow">Vibe Director</span>
        <h1><FilmSlate size={22} weight="duotone" aria-hidden="true" /> {session ? session.title : 'Direct a take'}</h1>
      </div>
      <div className="director-header-controls">
        {c.state.sessions.length > 0 ? (
          <label className="director-session-switch">
            <span className="sr-only">Directing session</span>
            <select
              value={session?.id ?? ''}
              disabled={c.loading || c.ui.busy}
              onChange={(event) => void c.selectSession(event.target.value).catch((error) => c.ui.patch({ error: String(error) }))}
            >
              <option value="" disabled>Select a session</option>
              {c.state.sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="ghost-button compact" disabled={c.loading} onClick={onNewScene}><Plus size={15} /> New scene</button>
        <button type="button" className="ghost-button compact" disabled={c.ui.busy || !canExport} onClick={() => void c.execute({ action: 'export' })}><DownloadSimple size={15} /> Export edit</button>
        <span className="director-header-links">
          <button type="button" className="ghost-button compact" onClick={onOpenWiki}>World <ArrowUpRight size={13} /></button>
          <button type="button" className="ghost-button compact" onClick={onOpenOutputs}>Outputs <ArrowUpRight size={13} /></button>
        </span>
      </div>
    </header>
  )
}
