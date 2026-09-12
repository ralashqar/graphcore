import { MotionSetsWorkspace, type MotionSetsData } from './MotionSetsWorkspace'
import { motionbricksRecipe } from '../../domain/game/v3/animationProviders'
import { replacementRecipe } from '../../domain/game/v3/performanceMotion'
import { somaMannequin } from '../../domain/game/v3/mannequin'
import { useCallback, useEffect, useState } from 'react'
import { invokeGame } from '../../data/gameRepository'
import { getCurrentSession } from '../../data/auth'
import { animationStates, motionRecipeSchema, KIMODO_MODEL, type MotionRecipe, type AnimationGraph, type ClipRevision } from '../../domain/game/v3/animation'
import { animationCommandSchema, type AnimationCommand } from '../../domain/game/v3/animationCommands'
import { of, type Design } from '../../domain/game/v3/spec'
import { AnimationPreview, type AnimationPreviewClip } from './AnimationPreview'
import { AnimationGraphView } from './AnimationGraphView'
import { actorAnimationRequirements, locomotionStates } from '../../domain/game/v3/animationRequirements'
type Candidate = { id: string; job_id: string; clip: ClipRevision | null; diagnostics: { purpose?: 'clip'|'diagnostic'; preview?: AnimationPreviewClip; motionbricksArtifacts?:{native_export?:{preview?:AnimationPreviewClip}}; failures?: string[]; metrics?: Record<string, number> } }
type Data = { motionSets?:MotionSetsData; motionbricks?: {enabled:boolean;reservationCents:number;rig:{revision:string};rigs?:Array<{id:string;revision:string}>}; artifactUrls?:Record<string,Record<string,string>>; rig: { revision: string }; enabled: boolean; performanceEnabled?:boolean; reservationCents: number; recipes: Array<{ job_id: string; recipe: MotionRecipe }>; candidates: Candidate[]; graphs: Array<{ actor_definition: string; graph: AnimationGraph }>; urls: Record<string, string>; reviews: Array<{candidate_id:string;decision:'accepted'|'rejected'}>; jobs:Array<{id:string;status:string;phase:string;error:string|null}> }
export function AnimationsWorkspace({ projectId, draftId, revision, design, onChanged }: { projectId: string; draftId: string; revision: number; design: Design; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<Data | null>(null), [state, setState] = useState<MotionRecipe['state']>('idle'), [prompt, setPrompt] = useState('A humanoid stands in a relaxed idle pose.'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState(''), [actor, setActor] = useState(of(design, 'actor_definition')[0]?.id ?? ''), [details, setDetails] = useState<unknown>(null), [pending, setPending] = useState<AnimationCommand | null>(null)
  const pendingKey = (userId: string) => `graphcore.animation.pending.${userId}.${projectId}.${draftId}`
  const [targetRig,setTargetRig]=useState('humanoid.fabric-ybot.v1')
  const [provider,setProvider]=useState<'kimodo'|'motionbricks'>('kimodo')
  const [comparison,setComparison]=useState(''),[graphEdits,setGraphEdits]=useState<AnimationGraph|null>(null)
  const [inspectedJob,setInspectedJob]=useState('')
  const refresh = useCallback(async () => setData(await invokeGame('get-game-workspace', { projectId, draftId, animations: true })), [projectId, draftId])
  useEffect(() => {
    let active = true
    void refresh().catch(e => { if (active) setError(String(e)) })
    void getCurrentSession().then(session => {
      if (!active || !session) return
      try {
        const value = animationCommandSchema.safeParse(JSON.parse(localStorage.getItem(`graphcore.animation.pending.${session.user.id}.${projectId}.${draftId}`) ?? 'null'))
        setPending(value.success ? value.data : null)
      } catch { setPending(null) }
    }).catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [refresh, projectId, draftId])
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(e=>setError(String(e)))},data?.jobs.some(j=>['queued','running'].includes(j.status))?5000:600000);return()=>clearInterval(timer)},[refresh,data?.jobs])
  useEffect(()=>setGraphEdits(null),[actor,revision])
  async function send(command: AnimationCommand) {
    setBusy(true); setError('')
    let key: string | null = null
    try {
      const session = await getCurrentSession()
      if (!session) throw new Error('Sign in to author animations.')
      key = pendingKey(session.user.id)
      localStorage.setItem(key, JSON.stringify(command)); setPending(command)
      await invokeGame('game-command', command); localStorage.removeItem(key); setPending(null); await refresh(); await onChanged(); return true
    }
    catch (e) {
      const status = (e as Error & { status?: number }).status
      if (key && status && status >= 400 && status < 500) { localStorage.removeItem(key); setPending(null) }
      setError(String(e)); return false
    }
    finally { setBusy(false) }
  }
  if (!data) return <section className="game-card"><p>{error || 'Loading animation requirements…'}</p></section>
  const motionbricksAvailable=['idle','walk'].includes(state)
  const generationEnabled=provider==='motionbricks'?data.motionbricks?.enabled===true&&motionbricksAvailable:data.enabled
  const reservation=provider==='motionbricks'?data.motionbricks?.reservationCents??100:data.reservationCents
  const graph = data.graphs.find(g => g.actor_definition === actor)?.graph
  const candidate = data.candidates.find(c => c.id === selected)
  const compare = data.candidates.find(c=>c.id===comparison)
  const review = data.reviews.find(r=>r.candidate_id===selected)?.decision
  const requirements = actorAnimationRequirements(design,actor)
  const bindingGraph = (clip:ClipRevision):AnimationGraph => {if(clip.state==='custom')throw Error('Custom studio clips require explicit game mapping');return ({ ...(graph?.rigRevision===clip.rigRevision&&graph.motionSets?{motionSets:graph.motionSets}:{}), version:1,id:`animation.${actor}`,actorDefinition:actor,rigRevision:clip.rigRevision,bindings:[...((graph?.rigRevision===clip.rigRevision?graph.bindings.filter(b=>b.state!==clip.state):[])),{state:clip.state,clipRevision:clip.id}],transitions:graph?.rigRevision===clip.rigRevision?graph.transitions:[] })}
  const common = () => ({projectId,draftId,expectedRevision:revision,idempotencyKey:crypto.randomUUID()})
  const jobAction=async(jobId:string,action:'cancel'|'retry')=>{setBusy(true);try{await invokeGame('game-command',{...common(),jobId,action,template:'unified.v1'});await refresh();await onChanged()}catch(e){setError(String(e))}finally{setBusy(false)}}
  const approximations=design.mechanics?.performance?.sequences.filter(s=>s.role!=='custom')??[]
  const bindings = new Set(graph?.bindings.map(b => b.state) ?? [])
  return <section className="game-card">
    <h2>Animations</h2>
    <p>Generate reusable motion for the articulated humanoid. Gameplay controls movement and collision; accepted clips supply the pose.</p>
    <label>Character archetype <select value={actor} onChange={e => setActor(e.target.value)}>{of(design, 'actor_definition').map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    {data.motionSets&&<MotionSetsWorkspace projectId={projectId} draftId={draftId} revision={revision} design={design} actor={actor} data={data.motionSets}
      accepted={data.candidates.filter(c=>c.clip&&data.reviews.some(r=>r.candidate_id===c.id&&r.decision==='accepted')).map(c=>c.clip!)} graphs={data.graphs}
      providers={{kimodo:{enabled:data.enabled,reservationCents:data.reservationCents},motionbricks:{enabled:data.motionbricks?.enabled??false,reservationCents:data.motionbricks?.reservationCents??100}}}
      jobs={data.jobs} onChanged={async()=>{await refresh();await onChanged()}} onInspect={jobId=>{setInspectedJob(jobId);void invokeGame('get-game-workspace',{projectId,draftId,jobId}).then(setDetails).catch(e=>setError(String(e)))}}/>}
    <p>Required by this character: {requirements.join(', ')}</p>
    <p>Missing bindings: {requirements.filter(s => s!=='custom'&&!bindings.has(s)).join(', ') || 'None'}</p>
    {!data.enabled && <p>Hosted generation is disabled until deployment and motion acceptance pass.</p>}
    <label>Motion <select aria-label="Motion" value={state} onChange={e => {setState(e.target.value as MotionRecipe['state']);if(!['idle','walk'].includes(e.target.value))setProvider('kimodo')}}>{animationStates.map(s => <option key={s}>{s}</option>)}</select></label>
    <label>Motion provider <select value={provider} onChange={e=>setProvider(e.target.value as 'kimodo'|'motionbricks')}><option value="kimodo">Kimodo</option><option value="motionbricks" disabled={!motionbricksAvailable}>MotionBricks · experimental idle/walk</option></select></label>
    {provider==='motionbricks'&&data.motionbricks?.rigs&&<label>Target mannequin <select value={targetRig} onChange={e=>setTargetRig(e.target.value)}>{data.motionbricks.rigs.map(r=><option key={r.id} value={r.id}>{r.id==='humanoid.fabric-ybot.v1'?'Fabric Y-Bot · mesh mannequin':'SOMA · diagnostic mannequin'}</option>)}</select></label>}
    {provider==='motionbricks'&&<p>Uses NVIDIA’s supplied G1 locomotion primitive and retargets it to your selected mannequin. The description labels your request; arbitrary text-directed poses and contact constraints are not supported. {!data.motionbricks?.enabled?'Generation is gated until native and target-rig acceptance pass.':''}</p>}
    <label>Description <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1500} /></label>
    <p>Setup reservation: ${(reservation / 100).toFixed(2)}. The one-time setup allowance is $30; admissions stop at $25.</p>
    <button disabled={busy || !!pending || !generationEnabled || !(locomotionStates as readonly string[]).includes(state)} onClick={() => {
      let recipe = motionRecipeSchema.parse({ version: 1, id: `humanoid.${state}`, state, rigRevision: data.rig.revision, model: KIMODO_MODEL, prompt, duration: 4, candidates: 1, seed: 42, loop: ['idle','walk','run','backward','strafe_left','strafe_right'].includes(state), targetSpeed: state === 'run' ? 4 : state === 'idle' ? 0 : 1.5, rootMode: 'in_place', contacts: [], poses: [], path: [], thresholds: { version: 1, maxContactError: .03, maxBoneLengthError: .005, maxSeamAngle: .1, maxSeamVelocity: .2, maxCorrection: .1 } })
      if(provider==='motionbricks')recipe=motionbricksRecipe({...recipe,rigRevision:data.motionbricks!.rigs?.find(r=>r.id===targetRig)?.revision??data.motionbricks!.rig.revision})
      void send({ projectId, draftId, expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action: 'generate_animation', recipe })
    }}>Generate candidate</button>
    {['catch','hang','shimmy_left','shimmy_right','climb'].includes(state) && <p>Ledge generation requires an authored milestone/contact recipe.</p>}
    {pending && <button disabled={busy} onClick={() => void send(pending)}>Recover pending command</button>}
    <button disabled={busy} onClick={() => void refresh().catch(e => setError(String(e)))}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    {approximations.length>0&&<section aria-label="Replace approximations"><h3>Replace approved approximations</h3>
      <p>Each request freezes the saved pose milestones and timing. A candidate must pass validation and your review before binding. Gameplay movement and hit timing stay unchanged.</p>
      {!data.performanceEnabled&&<p>Kimodo replacement is gated pending provider deployment and motion acceptance; your approximation remains available.</p>}
      {approximations.map(sequence=><button key={sequence.id} disabled={busy||!!pending||!data.enabled||!data.performanceEnabled} onClick={()=>{setBusy(true);void somaMannequin().then(rig=>replacementRecipe(sequence,rig)).then(recipe=>send({...common(),action:'generate_animation',recipe})).catch(e=>setError(String(e))).finally(()=>setBusy(false))}}>Generate {sequence.label} replacement · ${(data.reservationCents/100).toFixed(2)} reservation</button>)}
    </section>}
    <h3>Recipes and workflows</h3>
    {data.recipes.map(r => <p key={r.job_id}>{r.recipe.state} <button onClick={() => {setInspectedJob(r.job_id);void invokeGame('get-game-workspace', { projectId, draftId, jobId: r.job_id }).then(setDetails).catch(e => setError(String(e)))}}>Inspect workflow</button></p>)}
    {data.jobs.map(j=><div key={j.id}><span>{data.recipes.find(r=>r.job_id===j.id)?.recipe.state??'Animation'} · {j.phase} · {j.status}</span>{j.error&&<p role="alert">{j.error}</p>}{['queued','running'].includes(j.status)&&<button disabled={busy} onClick={()=>void jobAction(j.id,'cancel')}>Cancel</button>}{j.status==='failed'&&<button disabled={busy} onClick={()=>void jobAction(j.id,'retry')}>Retry saved-motion processing</button>}</div>)}
    {details !== null && <ol>{((details as {steps?:Array<{node_id:string;status:string;diagnostic:unknown}>}).steps??[]).map(s=><li key={s.node_id}><strong>{s.node_id}</strong> — {s.status}{s.diagnostic!=null&&<pre>{JSON.stringify(s.diagnostic,null,2)}</pre>}</li>)}</ol>}
    {details !== null && ((details as {artifacts?:Array<{nodeId:string;url:string;preview?:AnimationPreviewClip}>}).artifacts??[]).map(a=><div key={a.nodeId}><a href={a.url} target="_blank" rel="noreferrer">Download {a.nodeId}</a>{a.preview&&<AnimationPreview clip={a.preview} url={a.url} followRoot={a.nodeId.startsWith("animation.native_export.")}/>}</div>)}
    {details!==null&&data.candidates.filter(c=>c.job_id===inspectedJob).map(c=><ol key={c.id}><li>Review — {data.reviews.find(r=>r.candidate_id===c.id)?.decision??'Pending user decision'}</li><li>Binding — {data.graphs.filter((g,i,all)=>all.findIndex(other=>other.actor_definition===g.actor_definition)===i).some(g=>g.graph.bindings.some(b=>b.clipRevision===c.id))?'Active in a character graph':'Not bound'}</li></ol>)}
    <h3>Candidates</h3>
    {data.candidates.map(c => <button key={c.id} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}>{c.clip?.state ?? (c.diagnostics.purpose==='diagnostic'?'G1 diagnostic · cannot bind':'Validation failed')} · {data.reviews.find(r=>r.candidate_id===c.id)?.decision??'Pending review'} · {c.id.slice(0, 8)}</button>)}
    {candidate && <div>
      {candidate.clip&&graph&&candidate.clip.rigRevision!==graph.rigRevision&&<p>Binding this candidate switches this actor’s rig and clears incompatible clip bindings. Accept alone keeps the current rig.</p>}
      {candidate.clip && data.urls[candidate.id] && <AnimationPreview clip={candidate.clip} url={data.urls[candidate.id]} />}
      {candidate.diagnostics.purpose==='diagnostic'&&<p>Diagnostic sequence only. Technical validation cannot make this sequence bindable.</p>}
      {candidate.diagnostics.motionbricksArtifacts?.native_export?.preview&&data.artifactUrls?.[candidate.id]?.native&&<><h4>Native G1</h4><AnimationPreview clip={candidate.diagnostics.motionbricksArtifacts.native_export.preview} url={data.artifactUrls[candidate.id].native} followRoot/></>}
      {!candidate.clip&&candidate.diagnostics.preview&&data.artifactUrls?.[candidate.id]?.preview&&<><h4>Retargeted mannequin preview</h4><AnimationPreview clip={candidate.diagnostics.preview} url={data.artifactUrls[candidate.id].preview}/></>}
      {Object.entries(data.artifactUrls?.[candidate.id]??{}).map(([label,url])=><a key={label} href={url} target="_blank" rel="noreferrer">Download {label} </a>)}
      <pre>{JSON.stringify(candidate.diagnostics, null, 2)}</pre>
      {candidate.diagnostics.failures?.length? <ul>{candidate.diagnostics.failures.map((failure,i)=><li key={i}>{failure}</li>)}</ul>:<p>Technical validation passed. Acceptance is a separate decision.</p>}
      {data.recipes.find(r=>r.job_id===candidate.job_id)&&<button disabled={busy||!!pending||!(data.recipes.find(r=>r.job_id===candidate.job_id)?.recipe.version===2?data.motionbricks?.enabled:data.enabled)} onClick={()=>{const prior=data.recipes.find(r=>r.job_id===candidate.job_id)!.recipe;void send({...common(),action:'generate_animation',recipe:{...prior,seed:(prior.seed+1)%2147483647}})}}>Regenerate this motion (${((data.recipes.find(r=>r.job_id===candidate.job_id)?.recipe.version===2?data.motionbricks?.reservationCents??100:data.reservationCents)/100).toFixed(2)} reservation)</button>}
      {!review&&candidate.clip&&<><button disabled={busy||!!pending} onClick={()=>void send({...common(),action:'accept_animation',candidateId:candidate.id})}>Accept</button><button disabled={busy||!!pending||!actor} onClick={()=>void send({...common(),action:'accept_animation',candidateId:candidate.id,graph:bindingGraph(candidate.clip!)})}>Accept &amp; bind</button></>}
      {!review&&<button disabled={busy||!!pending} onClick={()=>void send({...common(),action:'reject_animation',candidateId:candidate.id,reason:''})}>Reject candidate</button>}
      {candidate.clip && review==='accepted' && <button disabled={busy || !!pending || !actor} onClick={() => {
        const clip = candidate.clip!
        const next=bindingGraph(clip)
        void send({ projectId, draftId, expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action: 'bind_animation', graph: next })
      }}>Bind accepted clip</button>}
    </div>}
    <label>Compare with <select value={comparison} onChange={e=>setComparison(e.target.value)}><option value="">None</option>{data.candidates.filter(c=>c.clip&&c.id!==selected).map(c=><option key={c.id} value={c.id}>{c.clip!.state} · {c.id.slice(0,8)}</option>)}</select></label>
    {compare?.clip&&data.urls[compare.id]&&<AnimationPreview clip={compare.clip} url={data.urls[compare.id]} />}
    <h3>Animation graph</h3>
    {(graphEdits??graph)&&<AnimationGraphView graph={(graphEdits??graph)!} />}
    <p>{graph?.bindings.map(b=>b.state).join(' ↔ ')||'Accept and bind clips to create the graph.'}</p>
    {(graphEdits??graph)?.transitions.map((t,i)=><label key={i}>{t.from} → {t.to} ({t.event}) <input type="number" min="0" max="0.3" step="0.01" value={t.blendSeconds} onChange={e=>{const next=structuredClone(graphEdits??graph!);next.transitions[i].blendSeconds=Math.max(0,Math.min(.3,Number(e.target.value)));setGraphEdits(next)}} /> seconds</label>)}
    {graph&&<button disabled={busy} onClick={()=>{const states=graph.bindings.map(b=>b.state).filter(s=>(locomotionStates as readonly string[]).includes(s));setGraphEdits({...graph,transitions:states.flatMap(from=>states.filter(to=>to!==from).map(to=>({from,to,event:'movement' as const,blendSeconds:.15})))})}}>Set locomotion crossfades</button>}
    {graphEdits&&<button disabled={busy||!!pending} onClick={()=>void send({...common(),action:'bind_animation',graph:graphEdits}).then(ok=>{if(ok)setGraphEdits(null)})}>Save transitions</button>}
  </section>
}
