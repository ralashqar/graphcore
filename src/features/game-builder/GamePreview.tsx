import { useEffect, useRef, useState } from 'react'
import type { GameBuildManifest } from '../../domain/game/contracts'
import type { Manifest } from '../../domain/game/v2/spec'
import type { Manifest as UnifiedManifest } from '../../domain/game/v3/spec'

export const gamePreviewUrl = import.meta.env.VITE_GAME_PREVIEW_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5174' : '')
export function GamePreview({ manifest, assetUrls, onDiagnostic, liveCandidate }: { manifest: GameBuildManifest | Manifest | UnifiedManifest; assetUrls: Record<string, string>; onDiagnostic: (message: string) => void; liveCandidate?: UnifiedManifest | null }) {
  const frame = useRef<HTMLIFrameElement>(null), [ready, setReady] = useState(false)
  const active=useRef(manifest),session=useRef(''),request=useRef<{id:string;target:UnifiedManifest}|null>(null),[rollback,setRollback]=useState<UnifiedManifest|null>(null),[applying,setApplying]=useState(false)
  const valid = (() => { try { const u = new URL(gamePreviewUrl); return ['http:', 'https:'].includes(u.protocol) && u.origin !== window.location.origin } catch { return false } })()
  useEffect(() => {
    setReady(false)
    active.current=manifest;session.current=crypto.randomUUID();request.current=null;setApplying(false);setRollback(null)
    if (!valid) return
    const origin = new URL(gamePreviewUrl).origin
    let connected = false
    const send = () => frame.current?.contentWindow?.postMessage({ protocol: 'graphcore.game.v1', type: 'load', manifest, assetUrls,session:session.current }, origin)
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || event.data?.protocol !== 'graphcore.game.v1') return
      if (event.data.type === 'listening') send()
      if(event.data.session===session.current&&event.data.requestId===request.current?.id&&['mechanics_applied','mechanics_rejected'].includes(event.data.type)){
        if(event.data.type==='mechanics_applied'&&event.data.buildId===request.current!.target.id){
          if(active.current.schemaVersion===3)setRollback(active.current)
          active.current=request.current!.target
        }else onDiagnostic(String(event.data.message??'Mechanic application failed'))
        request.current=null;setApplying(false);return
      }
      if (event.data.buildId !== active.current.id) return
      if (event.data.type === 'ready') { connected = true; setReady(true) }
      if (event.data.type === 'error') onDiagnostic(String(event.data.message).slice(0, 1000))
    }
    window.addEventListener('message', listen)
    send()
    const timeout = setTimeout(() => { if (!connected) onDiagnostic('Preview has not connected. Check that the separate game preview host is running.') }, 30000)
    return () => { window.removeEventListener('message', listen); clearTimeout(timeout) }
  }, [manifest, assetUrls, onDiagnostic, valid])
  const apply=(target:UnifiedManifest)=>{
    if(!ready||applying||target.id===active.current.id)return
    const id=crypto.randomUUID();request.current={id,target};setApplying(true)
    frame.current?.contentWindow?.postMessage({protocol:'graphcore.game.v1',type:'apply_mechanics',session:session.current,requestId:id,fromBuildId:active.current.id,manifest:target},new URL(gamePreviewUrl).origin)
  }
  if (!valid) return <div className="game-empty">Configure a separate game preview origin to play this build.</div>
  return <div><div className="game-header-actions">{liveCandidate&&<button disabled={!ready||applying} onClick={()=>apply(liveCandidate)}>Apply accepted mechanic build · revision {liveCandidate.sourceRevision}</button>}{rollback&&<button disabled={!ready||applying} onClick={()=>apply(rollback)}>Restore previous mechanic build</button>}</div><div className="game-preview"><iframe ref={frame} src={gamePreviewUrl} title={`${manifest.design.title} playable preview`} sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen" />{!ready && <span className="game-preview-loading">Connecting playable build…</span>}</div></div>
}
