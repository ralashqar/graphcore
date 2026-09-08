import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Cube, Play, TreeStructure, MapTrifold, Stack, Wrench, ArrowClockwise } from '@phosphor-icons/react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { type GameBuildManifest, type GameCommand, type GameDesignSpec, type GameWorkspace as Workspace } from '../../domain/game/contracts'
import { createAdventureTemplate } from '../../domain/game/template'
import { compileGame, validateGameDesign } from '../../domain/game/compiler'
import { runGameAcceptance } from '../../domain/game/simulation'
import { loadGameBuild, loadGameWorkspace, pendingGameCommand, sendGameCommand } from '../../data/gameRepository'
import { createPollGroup } from '../../data/requestCoordinator'
import { GameGraph, GameWorkflowGraph } from './GameGraph'
import { GamePreview, gamePreviewUrl } from './GamePreview'
import '../../styles/features/game-builder.css'

const EMPTY: Workspace = { revision: 0, design: null, activeBuildId: null, jobs: [], builds: [], assets: [], pricing: null }
const tabs = [{ key: 'overview', label: 'Overview', icon: Cube }, { key: 'systems', label: 'Systems', icon: TreeStructure }, { key: 'levels', label: 'Levels', icon: MapTrifold }, { key: 'assets', label: 'Assets', icon: Stack }, { key: 'play', label: 'Build & Play', icon: Play }] as const
type Tab = typeof tabs[number]['key']
export function GameWorkspace({ snapshot, canRun, onOpenWorld }: { snapshot: ProjectSnapshot; canRun: boolean; onOpenWorld: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY), [design, setDesign] = useState<GameDesignSpec | null>(null), [tab, setTab] = useState<Tab>('overview')
  const [prompt, setPrompt] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [selected, setSelected] = useState<string | null>(null), [workflow, setWorkflow] = useState(false)
  const [build, setBuild] = useState<{ manifest: GameBuildManifest; assetUrls: Record<string, string> } | null>(null), [generatedAssets, setGeneratedAssets] = useState(true), [autoBuild, setAutoBuild] = useState(false)
  const [pending, setPending] = useState<GameCommand | null>(null), [publishedUrl, setPublishedUrl] = useState('')
  const alive = useRef(true), current = useRef(workspace), dirtyRef = useRef(dirty), lastAutoRevision = useRef(0)
  current.current = workspace; dirtyRef.current = dirty
  const diagnose = useCallback((message: string) => setError(message), [])
  const refresh = useCallback(async () => {
    if (!canRun) return
    const [next, uncertain] = await Promise.all([loadGameWorkspace(snapshot.project.id, snapshot.draft.id), pendingGameCommand(snapshot.project.id, snapshot.draft.id)])
    if (!alive.current) return
    setWorkspace(next)
    setPending(uncertain)
    if (!dirtyRef.current) setDesign(next.design)
  }, [canRun, snapshot.project.id, snapshot.draft.id])
  useEffect(() => {
    alive.current = true
    void refresh().catch(e => setError(String(e.message)))
    const poll = createPollGroup({ key: `game:${snapshot.draft.id}`, intervalMs: 5000, maxPerTick: 1, getItems: () => current.current.jobs.some(j => ['queued', 'running'].includes(j.status)) ? [snapshot.draft.id] : [], pollItem: refresh, onError: e => setError(String(e)) })
    poll.start()
    return () => { alive.current = false; poll.stop() }
  }, [refresh, snapshot.draft.id])
  const execute = useCallback(async (action: GameCommand['action'], fields: Partial<GameCommand> = {}) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const pending = await pendingGameCommand(snapshot.project.id, snapshot.draft.id)
      if (pending) throw new Error('An earlier command has an uncertain acknowledgement. Use Recover command before starting new work.')
      const result = await sendGameCommand({ projectId: snapshot.project.id, draftId: snapshot.draft.id, expectedRevision: current.current.revision, idempotencyKey: crypto.randomUUID(), action, ...fields })
      if (action === 'save') { dirtyRef.current = false; setDirty(false) }
      await refresh(); return result
    } catch (e) { setPending(await pendingGameCommand(snapshot.project.id, snapshot.draft.id)); setError(e instanceof Error ? e.message : String(e)); return null } finally { setBusy(false) }
  }, [busy, snapshot.project.id, snapshot.draft.id, refresh])
  useEffect(() => {
    if (!autoBuild || dirty || busy || !workspace.design || workspace.revision <= lastAutoRevision.current || workspace.jobs.some(j => ['queued', 'running'].includes(j.status))) return
    lastAutoRevision.current = workspace.revision
    void execute('build')
  }, [autoBuild, dirty, busy, workspace, execute])
  const edit = (fn: (value: GameDesignSpec) => void) => { if (!design) return; const next = structuredClone(design); fn(next); setDesign(next); dirtyRef.current = true; setDirty(true) }
  const findings = design ? validateGameDesign(design) : []
  const preview = async (id?: string) => {
    setBusy(true); setError('')
    try {
      if (id) setBuild(await loadGameBuild(snapshot.project.id, snapshot.draft.id, id))
      else if (design) {
        const validUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v) ? v : crypto.randomUUID()
        const manifest = await compileGame({ id: crypto.randomUUID(), projectId: validUuid(snapshot.project.id), draftId: validUuid(snapshot.draft.id), sourceRevision: Math.max(1, workspace.revision), design })
        const tests = runGameAcceptance(manifest)
        if (tests.some(t => !t.passed)) throw new Error(tests.filter(t => !t.passed).map(t => t.message).join('\n'))
        setBuild({ manifest, assetUrls: {} })
      }
      setTab('play')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const activeSystem = design?.systems.find(s => s.key === selected)
  return <div className="game-workspace">
    <header className="game-header"><div><button className="game-back" onClick={onOpenWorld}><ArrowLeft size={14} /> World</button><div className="game-eyebrow">GAME WORKSPACE <span>ADVENTURE / DESKTOP</span></div><h1>{design?.title ?? 'Make your world playable.'}</h1></div><div className="game-header-actions"><span>{dirty ? 'Unsaved changes' : `Revision ${workspace.revision}`}</span>{design && <><button disabled={busy || !dirty || !canRun || findings.length > 0} onClick={() => void execute('save', { design })}>Save design</button><button className="game-primary" disabled={busy || dirty || !canRun} onClick={() => void execute('build')}><Play size={15} /> Build playable</button></>}</div></header>
    <nav className="game-tabs" aria-label="Game workspace">{tabs.map(t => <button key={t.key} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}><t.icon size={17} />{t.label}</button>)}</nav>
    {error && <div className="game-alert" role="alert">{error}<button onClick={() => void refresh().catch(e => setError(e.message))}><ArrowClockwise size={15} /> Refresh</button></div>}
    {publishedUrl && <div className="game-alert" role="status">Published game: <a href={publishedUrl} target="_blank" rel="noreferrer">Open playable release</a></div>}
    {workspace.pricing && <p className="game-price-note">Design generation: {workspace.pricing.planCredits} credits · Image-to-3D asset: {workspace.pricing.assetCredits} credits · Template assets and builds: no credits. Credits are reserved when work starts; interrupted provider submissions may need reconciliation.</p>}
    {pending && <div className="game-alert">A command is awaiting acknowledgement.<button disabled={busy} onClick={() => { setBusy(true); void sendGameCommand(pending).then(refresh).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>Recover command</button></div>}
    {!design ? <section className="game-intro"><div><div className="game-eyebrow">FROM CANON TO PLAY</div><h2>Give this world<br />a playable loop.</h2><p>Start with a small adventure. Define its systems, explore a greybox, then produce the assets that bring it to life.</p><div className="game-steps"><span>01 / Systems</span><ArrowRight /><span>02 / Greybox</span><ArrowRight /><span>03 / Production</span></div></div><div className="game-compose"><label htmlFor="game-prompt">What should the player do?</label><textarea id="game-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Explore the abandoned observatory, find the keeper’s key, and restore access to the summit…" /><button className="game-primary" disabled={busy || !canRun || !prompt.trim()} onClick={() => void execute('generate', { prompt })}>Design adventure <ArrowRight size={16} /></button><button onClick={() => { setDesign(createAdventureTemplate()); setDirty(true) }}>Explore the adventure template</button><small>{canRun ? 'Uses your current world as context. Generation requires enabled game workers.' : 'Template exploration is local. Sign in to save and generate.'}</small></div></section> : <>
      {tab === 'overview' && <div className="game-columns"><main><div className="game-section-label">GAME BRIEF</div><h2>{design.quest.title}</h2><p>{design.brief}</p><ol className="game-loop">{design.coreLoop.map((step, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span>{step}</li>)}</ol><div className="game-section-label">ART DIRECTION</div><p>{design.style.description}</p><div className="game-swatches">{[design.style.ground, design.style.accent, design.style.sky].map((c, i) => <span key={i} style={{ background: c }} title={c} />)}</div>{design.unsupportedMechanics.length > 0 && <div className="game-alert">Outside this template: {design.unsupportedMechanics.join('; ')}</div>}</main><aside className="game-compose"><label htmlFor="refine-game">Refine this game</label><textarea id="refine-game" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Make sprint consume more stamina…" /><button className="game-primary" disabled={busy || dirty || !canRun || !prompt.trim()} onClick={() => void execute('generate', { prompt })}>Update game design</button><button disabled={busy || findings.length > 0} onClick={() => void preview()}>Play local greybox</button><small>Local greybox checks rules and traversal. Accepted builds also run isolated browser validation.</small><div className="game-readiness"><span>{findings.length ? `${findings.length} contract issues` : 'Contracts valid'}</span><span>{workspace.activeBuildId ? 'Accepted build available' : 'No accepted build yet'}</span></div></aside></div>}
      {tab === 'systems' && <div className="game-system-layout"><main><div className="game-panel-heading"><h2>{workflow ? `${activeSystem?.label} workflow` : 'System composition'}</h2>{workflow && <button onClick={() => setWorkflow(false)}>Back to systems</button>}</div><GameGraph design={design} selected={selected} onSelect={key => { setSelected(key); setWorkflow(false) }} workflow={workflow} job={workspace.jobs.find(j => j.kind === 'generate')} /></main><aside className="game-inspector">{activeSystem ? <><div className="game-eyebrow">SYSTEM CONTRACT / V{activeSystem.version}</div><h3>{activeSystem.label}</h3><p>Owns {activeSystem.owns.join(', ')}</p><div className="game-port-list">{activeSystem.ports.map(p => <div key={`${p.direction}.${p.name}`}><span>{p.direction === 'input' ? '←' : '→'} {p.name}</span><code>{p.schema}</code></div>)}</div>{activeSystem.key === 'movement' && <>{(['walkSpeed', 'sprintSpeed', 'staminaDrain', 'staminaRecovery'] as const).map(field => <label key={field}>{field}<input type="number" step="0.5" value={design.movement[field]} onChange={e => edit(d => { d.movement[field] = Number(e.target.value) })} /></label>)}</>}<p>{activeSystem.acceptance.join(' ')}</p><button onClick={() => setWorkflow(true)}><Wrench size={14} /> Open workflow</button></> : <p>Select a system to inspect its ports, owned state and acceptance contract.</p>}</aside></div>}
      {tab === 'levels' && <div className="game-columns"><main><div className="game-panel-heading"><h2>{design.level.name}</h2><button disabled={busy || findings.length > 0} onClick={() => void preview()}>Open 3D greybox</button></div><div className="game-level-map" style={{ aspectRatio: `${design.level.width}/${design.level.depth}` }}>{design.level.instances.map(i => { const p = design.prefabs.find(p => p.key === i.prefabKey)!; return <button title={`${p.label} · ${p.collider}`} key={i.key} onClick={() => setSelected(i.key)} style={{ left: `${(i.position.x / design.level.width + .5) * 100}%`, top: `${(.5 - i.position.z / design.level.depth) * 100}%`, width: `${Math.max(3, p.size.x / design.level.width * 100)}%`, height: `${Math.max(3, p.size.z / design.level.depth * 100)}%`, background: p.color }}>{p.role === 'wall' ? '' : p.label}</button> })}</div><small>Top view · meters · collision extents</small></main><aside className="game-inspector"><h3>Scene hierarchy</h3>{design.level.instances.map(i => <div key={i.key} className="game-instance"><button onClick={() => setSelected(i.key)}>{i.key}</button>{selected === i.key && <>{(['x', 'z'] as const).map(axis => <label key={axis}>{axis}<input type="number" step="0.5" value={i.position[axis]} onChange={e => edit(d => { d.level.instances.find(n => n.key === i.key)!.position[axis] = Number(e.target.value) })} /></label>)}</>}</div>)}</aside></div>}
      {tab === 'assets' && <div className="game-assets"><details><summary>Asset production workflow</summary><GameWorkflowGraph kind="asset" job={workspace.jobs.find(j => j.kind === 'asset')} /></details>{design.assets.map(recipe => <article key={recipe.key}><div className="game-asset-symbol"><Cube size={48} /></div><div><div className="game-eyebrow">{recipe.method.replaceAll('_', ' ')} / STYLE {recipe.styleVersion}</div><h3>{recipe.subject}</h3><textarea aria-label={`${recipe.subject} production prompt`} value={recipe.prompt} onChange={e => edit(d => { d.assets.find(a => a.key === recipe.key)!.prompt = e.target.value; d.assets.find(a => a.key === recipe.key)!.revision++ })} /><small>{recipe.maxTriangles.toLocaleString()} triangle budget · {Math.round(recipe.maxBytes / 1000000)} MB limit</small></div><div><button disabled={busy || dirty || !canRun} onClick={() => void execute('asset', { recipeKey: recipe.key })}>Generate asset</button><p>{workspace.assets.filter(a => a.recipeKey === recipe.key).length} accepted revisions</p></div></article>)}</div>}
      {tab === 'play' && <div className="game-play"><div className="game-panel-heading"><div><h2>{build ? build.manifest.design.title : 'Build & Play'}</h2><small>{build ? `Build ${build.manifest.id.slice(0, 8)} · source revision ${build.manifest.sourceRevision}` : 'Choose an accepted build or preview the local greybox.'}</small></div><div className="game-header-actions"><label><input type="checkbox" checked={autoBuild} onChange={e => setAutoBuild(e.target.checked)} /> Auto-build saved changes</label><label><input type="checkbox" checked={generatedAssets} onChange={e => setGeneratedAssets(e.target.checked)} /> Generated assets</label><button disabled={busy || findings.length > 0} onClick={() => void preview()}>Local greybox</button></div></div>{build && <GamePreview manifest={build.manifest} assetUrls={generatedAssets ? build.assetUrls : NO_URLS} onDiagnostic={diagnose} />}<details><summary>Build workflow</summary><GameWorkflowGraph kind="build" job={workspace.jobs.find(j => j.kind === 'build')} /></details><div className="game-build-list">{workspace.builds.map(b => <article key={b.id}><div><strong>Revision {b.source_revision}</strong><span>{b.status} · {new Date(b.created_at).toLocaleString()}</span></div><button disabled={b.status !== 'accepted' || busy} onClick={() => void preview(b.id)}>Play</button><button disabled={b.status !== 'accepted' || busy} onClick={() => void execute('publish', { buildId: b.id }).then(result => { if (result) setPublishedUrl(`${gamePreviewUrl}/?release=${b.id}`) })}>Publish</button>{b.reports.filter(r => r.passed === false).map((r, i) => <p key={i}>{String(r.nodeKey)}: {String(r.message)}</p>)}</article>)}</div></div>}
      {findings.length > 0 && <div className="game-alert">{findings.map((f, i) => <p key={i}>{f.nodeKey}: {f.message}</p>)}</div>}
    </>}
    {workspace.jobs.length > 0 && <section className="game-job-feed"><div className="game-section-label">PRODUCTION ACTIVITY</div>{workspace.jobs.slice(0, 8).map(j => <article key={j.id}><span className={`game-job-dot is-${j.status}`} /><div><strong>{j.kind}{j.recipe_key ? ` / ${j.recipe_key}` : ''} / {j.phase}</strong><small>{j.error ?? j.status}</small>{j.progress.map(p => <span className="game-job-step" key={p.key}>{p.label} · {p.status}</span>)}</div>{j.kind === 'asset' && ['failed', 'attention'].includes(j.status) && <button disabled={busy} onClick={() => void execute('retry', { jobId: j.id })}>Resume asset</button>}{['queued', 'running', 'attention'].includes(j.status) && <button disabled={busy} onClick={() => void execute('cancel', { jobId: j.id })}>Cancel</button>}</article>)}</section>}
  </div>
}
const NO_URLS: Record<string, string> = {}
