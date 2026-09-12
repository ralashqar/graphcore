import { useEffect, useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { groupDirectorFrameCandidates, type DirectorFrameGroupId } from '../../domain/directorCast'

export function DirectorFramePicker({ snapshot, slot, sessionId, shotId, current, urls, onSign, onPick, onClose }: {
  snapshot: ProjectSnapshot
  slot: 'first' | 'end'
  sessionId: string | null
  shotId: string | null
  current: string
  urls: Record<string, string>
  onSign: (keys: string[]) => void
  onPick: (assetKey: string) => void
  onClose: () => void
}) {
  const groups = useMemo(() => groupDirectorFrameCandidates(snapshot.assets, { sessionId, shotId }), [snapshot.assets, sessionId, shotId])
  const [groupId, setGroupId] = useState<DirectorFrameGroupId | null>(groups[0]?.id ?? null)
  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  const shown = group?.assets.slice(0, 60) ?? []
  useEffect(() => {
    onSign(shown.map((asset) => asset.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((asset) => asset.key).join('|')])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="content-create-overlay director-overlay" role="presentation" onClick={onClose}>
      <div className="content-create-dialog director-dialog is-wide" role="dialog" aria-modal="true" aria-labelledby="director-frame-picker-title" onClick={(event) => event.stopPropagation()}>
        <div className="director-dialog-head">
          <div><span className="eyebrow">Frames</span><h3 id="director-frame-picker-title">{slot === 'first' ? 'Choose the starting frame' : 'Choose the ending frame'}</h3></div>
          <button type="button" className="ghost-button compact" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {groups.length ? (
          <>
            <div className="tabbar director-frame-groups" role="tablist">
              {groups.map((g) => <button type="button" key={g.id} role="tab" aria-selected={group?.id === g.id} className={`tab-button ${group?.id === g.id ? 'is-active' : ''}`} onClick={() => setGroupId(g.id)}>{g.label} <span className="director-muted">{g.assets.length}</span></button>)}
            </div>
            <div className="director-frame-grid" role="list">
              {shown.map((asset) => (
                <button type="button" key={asset.key} role="listitem" className={`director-frame-option ${current === asset.key ? 'is-selected' : ''}`} onClick={() => onPick(asset.key)} title={asset.name || asset.key}>
                  {urls[asset.key] ? <img src={urls[asset.key]} alt={asset.name || asset.key} loading="lazy" /> : <span className="director-frame-loading" aria-hidden="true" />}
                  <span>{asset.name || asset.key}</span>
                </button>
              ))}
            </div>
          </>
        ) : <p className="director-muted director-pick-empty">No images in this project yet. Compose a start frame from the Frames rail, or generate reference sheets for the cast.</p>}
        <div className="director-dialog-actions">
          <span className="director-muted">{slot === 'first' ? 'Image-to-video inherits this frame’s aspect ratio.' : 'An ending frame requires a starting frame.'}</span>
          {current ? <button type="button" className="ghost-button" onClick={() => onPick('')}>Clear {slot === 'first' ? 'start' : 'end'} frame</button> : null}
          <button type="button" className="ghost-button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
