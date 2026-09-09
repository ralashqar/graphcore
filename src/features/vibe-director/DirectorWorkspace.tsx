import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowUpRight, DownloadSimple, FilmSlate, Plus, X } from '@phosphor-icons/react'
import type { VibeDirectorPageProps } from './LegacyVibeDirectorPage'
import { directorSettingsSchema } from '../../domain/directorWorkspace'
import { useDirectorController } from './useDirectorController'
import { directorSources, legacyDirectorImport } from './sourceBridge'
import { DirectorPlayer } from './DirectorPlayer'
import { DirectorTimeline } from './DirectorTimeline'
import { DirectorTakeLibrary } from './DirectorTakeLibrary'
import { DirectorDirectionPanel } from './DirectorDirectionPanel'
import './directorWorkspace.css'
const DirectorLivePanel = lazy(() => import('./live/DirectorLivePanel'))

export function DirectorWorkspace(props: VibeDirectorPageProps & { onOpenLegacy: () => void }) {
  const c = useDirectorController(props.snapshot, props.canRun)
  const sources = useMemo(() => directorSources(props.snapshot), [props.snapshot])
  const [creating, setCreating] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [brief, setBrief] = useState('')
  const [title, setTitle] = useState('New scene')
  const [preparingScript, setPreparingScript] = useState(false)
  const [preparingKeyframe, setPreparingKeyframe] = useState(false)
  const source = sources.find(s => s.id === sourceId)
  const create = async () => {
    const result = await c.execute({ action: 'create', title: source?.title ?? title, source: { script: source?.script || brief, requestId: source?.requestId, sequenceKey: source?.sequenceKey, shotId: source?.shotId }, settings: directorSettingsSchema.parse({}), entityKeys: props.snapshot.worldEntities.filter(e => !['sequence_unit','concept'].includes(e.nodeType)).slice(0, 3).map(e => e.key) })
    if (result) { setCreating(false); c.ui.patch({ direction: source ? 'Direct the opening action of this scene, preserving the scripted dialogue.' : brief.slice(0, 12000), inspector: true }) }
  }
  const importLegacy = async () => {
    const legacy = legacyDirectorImport(props.snapshot)
    if (!legacy) return
    const result = await c.execute({ action: 'create', title: legacy.title, source: legacy.source, settings: legacy.settings, entityKeys: legacy.entityKeys })
    if (result) c.ui.patch({ direction: legacy.direction })
  }
  const prepareScript = async () => {
    setPreparingScript(true)
    try {
      await props.onStartOutputRequest({ prompt: brief || source?.script || c.ui.direction, outputKindOverride: 'cinematic_episode', targetFormat: 'video', sourceSurface: 'vibe_director', selectedEntityKeys: c.ui.entityKeys, cinematicPipelineVersion: 'v3_script_storyboards', sequenceAnimaticMode: 'master_script_only', debugSkipVideoGeneration: true })
      await props.onRefreshLiveSnapshot()
      c.ui.patch({ error: 'Screenplay preparation started. Select the resulting cinematic output when it is ready.' })
    } catch (error) { c.ui.patch({ error: String(error) }) } finally { setPreparingScript(false) }
  }
  const prepareKeyframe = async () => {
    const source = c.state.session?.source
    if (!props.canRun || typeof source?.requestId !== 'string') return
    setPreparingKeyframe(true)
    try {
      const ensured = await props.onEnsureSequenceAnimaticKeyframeWorkflows({ masterRequestId: source.requestId, mode: 'generate', shotIds: typeof source.shotId === 'string' ? [source.shotId] : undefined, allowProvisional: typeof source.shotId === 'string', shotContinuityOptions: { sourceSurface: 'vibe_director', directingNotes: c.ui.direction } })
      const requests = [...(ensured.continuityAssetRequests ?? []), ...(ensured.coverageAnchorRequests ?? []), ...(ensured.shotKeyframeRequests ?? []), ...(ensured.childRequests ?? [])]
      const next = typeof ensured.nextAction?.requestId === 'string' ? ensured.nextAction.requestId : null
      for (const request of requests.filter((r, i, all) => all.findIndex(x => x.id === r.id) === i && (!next || r.id === next)).slice(0, 1)) {
        if (request.workflowId) await props.onStartOutputWorkflowRun({ workflowId: request.workflowId, prompt: request.prompt || 'Prepare a shot keyframe.', targetFormat: 'image', input: { debugSkipVideoGeneration: false, cinematicVideoApproved: false }, metadata: { runIntent: 'generate_keyframes', sourceSurface: 'vibe_director', masterRequestId: source.requestId, parentRequestId: source.requestId } })
      }
      await props.onRefreshLiveSnapshot()
      c.ui.patch({ error: 'Keyframe preparation started. Choose the finished image as the starting frame when it appears, or open Outputs to review dependencies.' })
    } catch (error) { c.ui.patch({ error: String(error) }) } finally { setPreparingKeyframe(false) }
  }
  return <div className="director-workspace">
    <header className="director-workspace-header"><div className="director-brand"><FilmSlate size={23} /><strong>Vibe Director</strong><span>Studio</span></div><div className="director-header-actions"><button onClick={props.onOpenWiki}>World <ArrowUpRight size={13} /></button><button onClick={props.onOpenOutputs}>Outputs <ArrowUpRight size={13} /></button><button onClick={props.onOpenLegacy}>Legacy view</button></div></header>
    <div className="director-session-bar"><select aria-label="Directing session" value={c.state.session?.id ?? ''} disabled={c.loading || c.ui.busy} onChange={e => void c.selectSession(e.target.value).catch(error => c.ui.patch({ error: String(error) }))}><option value="" disabled>Select a session</option>{c.state.sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select><span className="director-muted">{c.state.session ? 'Saved to your world' : 'Create a scene to begin'}</span><button onClick={() => setCreating(true)}><Plus size={15} /> New scene</button><button disabled={c.ui.busy || !c.state.session?.active_edit_id} onClick={() => void c.execute({ action: 'export' })}><DownloadSimple size={15} /> Export edit</button></div>
    {c.hasPending && <div className="director-notice" role="status"><span>A command is awaiting confirmation. Its original request is saved in this browser.</span><button disabled={c.ui.busy} onClick={()=>void c.retryPending()}>Retry pending command</button></div>}
    {c.ui.error && <div className="director-notice" role="alert"><span>{c.ui.error}</span><button aria-label="Dismiss message" onClick={() => c.ui.patch({ error: null })}><X /></button></div>}
    {c.loading ? <div className="director-loading" aria-label="Loading director"><div /><div /><div /></div> : (creating || !c.state.session) ? <section className="director-start"><div><span className="director-eyebrow">SCENE SETUP</span><h1>What are we directing?</h1><p>Start with a script, a shot, or a scene in your world.</p></div><div className="director-start-fields"><label>Source<select value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">New scene brief</option>{sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>{!source && <label>Scene name<input value={title} onChange={e => setTitle(e.target.value)} /></label>}<label>{source ? 'Script / scene context' : 'Scene brief'}<textarea value={source?.script ?? brief} readOnly={Boolean(source)} rows={6} onChange={e => setBrief(e.target.value)} placeholder="Your characters arrive at the abandoned observatory…" /></label><div className="director-inline-actions"><button className="director-primary" disabled={!props.canRun || c.ui.busy || !(source?.script || brief).trim()} onClick={() => void create()}>Open scene <ArrowUpRight /></button><button disabled={!props.canRun || preparingScript || !(brief || source?.script)} onClick={() => void prepareScript()}>{preparingScript ? 'Preparing…' : 'Generate screenplay'}</button>{c.state.session && <button onClick={() => setCreating(false)}>Cancel</button>}</div>{!c.state.sessions.some(s => s.source.legacyImported) && <button disabled={c.ui.busy || !legacyDirectorImport(props.snapshot)} onClick={() => void importLegacy()}>Import previous director session</button>}</div></section> : <div className="director-studio"><main className="director-stage"><div className="director-next-source"><label>Next scene or shot<select aria-label="Next scene or shot" value="" disabled={c.ui.busy || !c.canRun} onChange={e => { const next = sources.find(s => s.id === e.target.value); if (next) void c.execute({ action: 'source', source: { script: next.script, requestId: next.requestId, sequenceKey: next.sequenceKey, shotId: next.shotId } }).then(result => { if (result) c.ui.patch({ direction: 'Direct this shot, preserving the scripted action and dialogue.' }) }) }}><option value="">Keep current scene</option>{sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><button disabled={!c.canRun || preparingKeyframe || c.ui.busy || !c.state.session.source.requestId} onClick={() => void prepareKeyframe()}>{preparingKeyframe ? 'Preparing…' : 'Prepare keyframe'}</button></div><DirectorPlayer controller={c} />{import.meta.env.VITE_DIRECTOR_LIVE_BETA === 'true' && <Suspense fallback={null}><DirectorLivePanel key={c.state.session.id} controller={c} /></Suspense>}<DirectorTimeline controller={c} /><DirectorTakeLibrary controller={c} />{c.state.exports.length > 0 && <div className="director-exports">{c.state.exports.map(e => {
      const key = (e.outputs.director as { assetKey?: string })?.assetKey
      return <span key={e.id}>{key && c.urls[key] ? <a href={c.urls[key]} target="_blank" rel="noreferrer">Download edit <ArrowUpRight size={13} /></a> : `Export ${e.status}`}{e.error_message && <span role="alert">{e.error_message}</span>}</span>
    })}</div>}</main><DirectorDirectionPanel controller={c} snapshot={props.snapshot} onOpenWiki={props.onOpenWiki} /></div>}
  </div>
}
