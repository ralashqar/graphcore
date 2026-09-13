import { StudioPreflight } from './StudioPreflight'

import { LocomotionEditor } from './LocomotionEditor'

import { StudioConversation } from './StudioConversation'

import { SavedMotionDemo } from './SavedMotionDemo'

import { locomotionSlots } from '../../domain/game/animation-studio/gameMapping'

import { useCallback,useEffect,useMemo,useRef,useState } from 'react'

import { FlexibleGraphCanvas } from './FlexibleGraphCanvas'

import { StudioTransitionEditor } from './StudioTransitionEditor'

import '@xyflow/react/dist/style.css'

import type { ProjectSnapshot } from '../../domain/graphcore'

import { blankGraph,clipNode,convertLegacy,freezeFlexible,flexibleProblems,generationReadiness,type FlexibleGraph,type FlexNode } from '../../domain/game/animation-studio/flexible'

import type { StudioGraph } from '../../domain/game/animation-studio/graph'

import { readStudio,sendStudio,recoverStudio,type StudioData } from '../../data/animationStudioRepository'

import type { StudioCommand } from '../../domain/game/animation-studio/protocol'

import { FlexiblePreview } from './FlexiblePreview'

import { AnimationPreview } from '../game-builder/AnimationPreview'

import '../../styles/features/animation-studio.css'



type Workspace={id:string;draft_id:string;revision:number;graph:FlexibleGraph|StudioGraph}

type Data=Omit<StudioData,'workspace'|'library'|'jobs'>&{workspace:Workspace|null;library:Workspace[];revisions:Array<{revision:number;created_at:string}>;jobs:Array<StudioData['jobs'][number]&{prompt?:string;edit?:{summary:string;scopeExpansion:string[];edits:{nodes?:{upsert:Array<{id:string}>;remove:string[]}}};appliedRevision?:number}>}

const empty:Data={workspace:null,library:[],jobs:[],candidates:[],reviews:[],sources:[],game:null,revisions:[]}

export function FlexibleStudio({snapshot,canRun,onBack,onLegacy}:{snapshot:ProjectSnapshot;canRun:boolean;onBack:()=>void;onLegacy:()=>void}){

 const [graph,setGraph]=useState(blankGraph),[data,setData]=useState<Data>(empty),[workspaceId,setWorkspaceId]=useState<string>(()=>crypto.randomUUID()),[selected,setSelected]=useState<string|null>(null),[active,setActive]=useState<string|null>(null)

 const [prompt,setPrompt]=useState('Create a relaxed idle, a friendly wave, and a bow. Add a greet event that plays the wave then bow and returns to idle.'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[scoped,setScoped]=useState(false),[dependencyView,setDependencyView]=useState(false),[maximum,setMaximum]=useState(0),[selectedIds,setSelectedIds]=useState<string[]>([]),[redo,setRedo]=useState<number[]>([]),[historyCursor,setHistoryCursor]=useState<number|null>(null)

 const [drawer,setDrawer]=useState<'history'|'generation'|'integration'|'demo'|null>(null),[inspector,setInspector]=useState(true),[transitionId,setTransitionId]=useState<string|null>(null),[split,setSplit]=useState(54)

 const root=useRef<HTMLElement>(null)

 const [staleClips,setStaleClips]=useState<string[]>([])

 useEffect(()=>{let cancelled=false;if(!graph.nodes.some(n=>n.clipId)){setStaleClips([]);return}void freezeFlexible(graph).then(frozen=>{if(!cancelled)setStaleClips(graph.nodes.filter(n=>n.clipId&&!frozen.nodes.find(f=>f.id===n.id)?.clipId).map(n=>n.id))}).catch(()=>{});return()=>{cancelled=true}},[graph])

 useEffect(()=>{if(!drawer)return;const previous=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLButtonElement>('.studio-drawer button')?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setDrawer(null)};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);previous?.focus()}},[drawer])

 const [candidateSlots,setCandidateSlots]=useState<string[]>([])

 useEffect(()=>setCandidateSlots([]),[selected,workspaceId])

 const reviewNodes=graph.nodes.filter(n=>n.kind==='clip')
 const reviewNode=reviewNodes.find(n=>n.id===selected)??reviewNodes.find(n=>data.candidates.some(c=>c.nodeId===n.id&&c.clip))??reviewNodes[0]
 const candidateOptions=data.candidates.filter(c=>c.nodeId===reviewNode?.id)
 const reviewResults=reviewNodes.filter(n=>data.candidates.some(c=>c.nodeId===n.id))
 const previewableResults=reviewResults.filter(n=>data.candidates.some(c=>c.nodeId===n.id&&c.clip&&c.url))

 const comparedCandidates=[...new Set([candidateSlots[0]??candidateOptions[0]?.id,candidateSlots[1]??candidateOptions[1]?.id])].flatMap(id=>{const candidate=candidateOptions.find(c=>c.id===id);return candidate?[candidate]:[]})

 const [comparePose,setComparePose]=useState<'play'|'entry'|'exit'>('play')

 const [mapping,setMapping]=useState<Record<string,string>>({}),[actorId,setActorId]=useState('')

 const dirty=JSON.stringify(graph)!==JSON.stringify(data.workspace?.graph),node=graph.nodes.find(n=>n.id===selected),revision=data.workspace?.revision??0

 const refresh=useCallback(async(id?:string,replace=false)=>{const d=await readStudio(snapshot.project.id,snapshot.draft.id,id) as unknown as Data;setData({...d,revisions:d.revisions??[]});if(replace&&d.workspace?.graph.version===3)setGraph(d.workspace.graph);return d},[snapshot.project.id,snapshot.draft.id])

 const sessionKey=`synarc.motion.conversation.${snapshot.project.id}`

 useEffect(()=>{let cancelled=false;if(canRun)void refresh().then(async d=>{let remembered:string|null=null;try{remembered=localStorage.getItem(sessionKey)}catch{}const saved=d.library.find(w=>w.id===remembered&&w.graph.version===3);if(saved&&!cancelled){setWorkspaceId(saved.id);await refresh(saved.id,true)}}).catch(e=>{if(!cancelled)setError(String(e))});return()=>{cancelled=true}},[canRun,refresh,sessionKey])

 useEffect(()=>{if(data.workspace?.graph.version===3)try{localStorage.setItem(sessionKey,data.workspace.id)}catch{}},[data.workspace?.id,sessionKey])

 useEffect(()=>{if(!data.workspace)return;const timer=setInterval(()=>void refresh(workspaceId,!dirty).catch(e=>setError(String(e))),data.jobs.some(j=>['queued','running'].includes(j.status))?2500:10000);return()=>clearInterval(timer)},[data,dirty,refresh,workspaceId])

 const run=async(label:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(label);setError('');setNotice('');try{await fn()}catch(e){setError(String(e))}finally{setBusy('')}}

 const base=(rev=revision)=>({projectId:snapshot.project.id,draftId:data.workspace?.draft_id??snapshot.draft.id,workspaceId,expectedRevision:rev,idempotencyKey:crypto.randomUUID()})

 async function command(c:StudioCommand,replace=false){await sendStudio(c);return refresh(workspaceId,replace)}

 const save=async()=>{const d=await command({...base(),action:'save',graph:await freezeFlexible(graph)},true);setRedo([]);setHistoryCursor(null);return d.workspace!.revision}

 const problems=flexibleProblems(graph),jobs=data.jobs,planning=jobs.some(j=>j.prompt&&['queued','running'].includes(j.status))

 const motionJobs=jobs.filter(j=>j.nodeId),activeMotions=motionJobs.filter(j=>['queued','running','attention'].includes(j.status))

 const selectedInFlight=activeMotions.some(j=>selectedIds.includes(j.nodeId!))

 const clips=useMemo(()=>data.candidates.flatMap(c=>c.clip&&c.url?[{clip:c.clip,url:c.url}]:[]),[data.candidates])

 const latestEdit=jobs.find(j=>j.edit&&j.appliedRevision===revision)?.edit

 const edited=latestEdit?.edits.nodes?.upsert.map(n=>n.id)??[]

 const statuses=Object.fromEntries(graph.nodes.map(n=>{const job=jobs.find(j=>j.nodeId===n.id);return[n.id,n.kind!=='clip'?'':job&&['queued','running'].includes(job.status)?'Generating':job?.status==='failed'?'Generation failed':staleClips.includes(n.id)?'Needs regeneration':n.clipId?'Accepted':data.candidates.some(c=>c.nodeId===n.id&&c.clip)?'Ready to review':generationReadiness(graph,n)==='ready to generate'?'Needs motion':'Waiting for source']}))

 const generationReady=!dirty&&!!data.preflight&&selectedIds.every(id=>data.preflight!.nodes.some(n=>n.nodeId===id&&n.status==='ready'))

 const checkReadiness=()=>void run('Checking generation readiness',async()=>{const rev=dirty?await save():revision;await command({...base(rev),action:'plan',reviewOnly:true,prompt:'Check generation readiness and preserve the graph.',nodeIds:[]},true);setNotice('Readiness review queued. Findings will appear under Motions & review.')})

 const selectedTransition=graph.transitions.find(t=>t.id===transitionId)

 const examples=[['Greetings','Create a relaxed idle, a friendly wave, and a bow. Add a greet event that plays the wave then bow and returns to idle.'],['Sword combat','Create a sword combat stance with a forward strike, backhand follow-up and a stronger dash strike. Use attack events to chain them and return to guard.'],['Conversation','Create seated idle, listening, explaining and laughing states around a static chair reference. Add events for each gesture.'],['Dance','Create a branching dance with an idle, two looping dance styles and a bow finale. Add events to change style or finish.']]

 const draftKey=`synarc.motion.prompt-draft.${snapshot.project.id}.${workspaceId}`

 useEffect(()=>{try{const draft=localStorage.getItem(draftKey);if(draft!==null)setPrompt(draft);else if(data.workspace)setPrompt('')}catch{}},[draftKey])

 const writePrompt=(text:string)=>{setPrompt(text);try{localStorage.setItem(draftKey,text)}catch{}}

 const promptLock=useRef(false)

 const submitPrompt=async(text:string,nodeIds:string[])=>{if(promptLock.current||!canRun||data.availability?.planningEnabled===false||planning||problems.length||text.trim().length<10)return;promptLock.current=true;try{await run('Planning graph edits',async()=>{const rev=dirty?await save():revision;await command({...base(rev),action:'plan',prompt:text,nodeIds},true);setHistoryCursor(null);setRedo([]);if(text===prompt)writePrompt('');setNotice('Prompt queued. Valid edits apply automatically; you can undo them.')})}finally{promptLock.current=false}}

 const composeReply=(text:string,ids:string[])=>{writePrompt(text);setScoped(ids.length===1);if(ids[0])setSelected(ids[0]);requestAnimationFrame(()=>root.current?.querySelector<HTMLTextAreaElement>('#flex-prompt')?.focus())}

 const editNode=(patch:Partial<FlexNode>)=>setGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selected?{...n,...patch}:n)}))

 return <main ref={root} className="animation-studio studio-authoring"><header className="studio-heading"><div><button className="studio-back" onClick={onBack}>Back to workspace</button><p className="studio-eyebrow">SYNARC / MOTION</p><h1>Animation studio</h1><p>A living animation graph. Describe it, extend it, and play it.</p></div><div className="studio-header-actions"><button onClick={()=>setDrawer(drawer==='demo'?null:'demo')}>Try saved motions</button><button aria-expanded={drawer==='history'} onClick={()=>setDrawer(drawer==='history'?null:'history')}>History</button><button aria-expanded={drawer==='generation'} onClick={()=>setDrawer(drawer==='generation'?null:'generation')}>Motions & review</button><button aria-expanded={drawer==='integration'} onClick={()=>setDrawer(drawer==='integration'?null:'integration')}>Game integration</button></div></header>

  <div className="studio-toolbar"><label>Animation library<select value={data.workspace?.id??''} disabled={!!busy} onChange={e=>{const id=e.target.value;if(id)void run('Loading',async()=>{const d=await refresh(id,true);setWorkspaceId(id);setSelected(null);setSelectedIds([]);setTransitionId(null);setScoped(false);setRedo([]);setHistoryCursor(null);if(d.workspace?.graph.version===2){setGraph(convertLegacy(d.workspace.graph));setNotice('Legacy conversion preview. Save a new revision to convert; original revision remains available.')}})}}><option value="">New graph</option>{data.library.map(w=><option key={w.id} value={w.id}>{w.graph.name}{w.graph.version===2?' · legacy':''}</option>)}</select></label><button disabled={!!busy} onClick={()=>{setData(d=>({...empty,library:d.library}));setWorkspaceId(crypto.randomUUID());setGraph(blankGraph());try{localStorage.removeItem(sessionKey)}catch{}setSelected(null);setSelectedIds([]);setTransitionId(null);setScoped(false);setRedo([]);setHistoryCursor(null)}}>New empty graph</button><button disabled={!canRun||!!busy||problems.length>0} onClick={()=>void run('Saving',async()=>{await save();setNotice('Saved graph revision')})}>Save revision</button><span>Revision {revision}{dirty?' · Unsaved changes':''}</span>

  <button disabled={dirty||!!busy||!data.revisions.some(r=>r.revision<(historyCursor??revision))} onClick={()=>void run('Undoing',async()=>{const previous=data.revisions.find(r=>r.revision<(historyCursor??revision))!;setRedo(values=>[historyCursor??revision,...values]);setHistoryCursor(previous.revision);await command({...base(),action:'restore',revision:previous.revision},true)})}>Undo</button><button disabled={dirty||!!busy||!redo.length} onClick={()=>void run('Redoing',async()=>{await command({...base(),action:'restore',revision:redo[0]},true);setHistoryCursor(redo[0]);setRedo(values=>values.slice(1))})}>Redo</button></div>



  {error&&<div role="alert" className="studio-error">{error}<button onClick={()=>void run('Recovering',async()=>{await recoverStudio(workspaceId);await refresh(workspaceId,true)})}>Recover pending command</button></div>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">{busy}…</p>}

  {drawer==='demo'&&<aside className="studio-drawer" aria-label="Saved motion playground"><div className="studio-panel-heading"><h2>Saved motion playground</h2><button onClick={()=>setDrawer(null)}>Close playground</button></div><SavedMotionDemo sources={data.sources}/></aside>}

  {drawer==='history'&&<aside className="studio-drawer" aria-label="Prompt and revision history"><div className="studio-panel-heading"><h2>Prompt history</h2><button onClick={()=>setDrawer(null)}>Close history</button></div>{jobs.filter(j=>j.prompt).map(j=><section className="studio-proposal" key={j.id}><p><strong>You:</strong> {j.prompt}</p><p>{j.edit?.summary??j.error??j.phase} · {j.status}{j.appliedRevision?` · Applied revision ${j.appliedRevision}`:''}</p>{j.edit?.edits.nodes&&<p>Added or updated: {j.edit.edits.nodes.upsert.map(n=>n.id).join(', ')||'none'} · Removed: {j.edit.edits.nodes.remove.join(', ')||'none'}</p>}{j.edit&&<details><summary>Inspect graph edits</summary><pre>{JSON.stringify(j.edit.edits,null,2)}</pre></details>}{j.phase==='edit.scope_review'&&<><p>Requires expanded scope: {j.edit?.scopeExpansion.join(', ')}</p><button disabled={dirty||j.sourceRevision!==revision||!!busy} onClick={()=>void run('Applying expanded edit',async()=>{await command({...base(),action:'apply_edit',jobId:j.id},true)})}>Apply expanded edit</button></>}{j.phase==='edit.conflict'&&<p>The graph changed while planning. Send the prompt again to use the current revision.</p>}</section>)}<h3>Saved revisions</h3>{data.revisions.map(r=><p key={r.revision}>Revision {r.revision}<button disabled={dirty||!!busy} onClick={()=>void run('Restoring revision',async()=>{await command({...base(),action:'restore',revision:r.revision},true)})}>Restore revision {r.revision}</button></p>)}</aside>}

  {jobs.some(j=>['edit.scope_review','edit.conflict'].includes(j.phase))&&<div className="studio-edit-summary" role="status">A prompt needs your review.<button onClick={()=>setDrawer('history')}>Review pending edit</button></div>}



  <div className="studio-authoring-desk"><div className="studio-workbench" style={{gridTemplateColumns:inspector?'minmax(0,1fr) 280px':'minmax(0,1fr)'}}><div className="studio-stage-split" style={{gridTemplateColumns:`minmax(0,${split}fr) minmax(0,${100-split}fr)`}}><section className="studio-canvas-panel"><div className="studio-panel-heading"><strong>{graph.name}</strong><div><select aria-label="Graph view" value={dependencyView?'dependencies':'transitions'} onChange={e=>setDependencyView(e.target.value==='dependencies')}><option value="transitions">State transitions</option><option value="dependencies">Generation dependencies</option></select><button aria-expanded={inspector} onClick={()=>setInspector(!inspector)}>Inspector</button></div></div>{graph.nodes.length?<FlexibleGraphCanvas graph={graph} storageKey={`synarc.motion.layout.${snapshot.project.id}.${workspaceId}`} selected={selected} active={active} dependencies={dependencyView} statuses={statuses} edited={edited} onSelect={id=>{setSelected(id);setTransitionId(null)}} onTransition={id=>{setTransitionId(id);setInspector(true)}}/>:<div className="flex-empty"><p className="studio-eyebrow">From an idea to motion</p><h2>What should your character do?</h2><p>Describe a movement, a sequence, or an entire state machine. Start small and grow it with follow-up prompts.</p><div className="studio-examples">{examples.map(([label,text])=><button key={label} onClick={()=>writePrompt(text)}>{label}</button>)}</div><button onClick={()=>{const n=clipNode('idle','Idle');n.loop=true;setGraph(g=>({...g,entry:n.id,nodes:[n]}));setSelected(n.id)}}>Add first clip manually</button></div>}</section><FlexiblePreview graph={graph} clips={clips} selected={selected} onActive={setActive}/><label className="studio-split-control">Graph / preview balance<input type="range" min={35} max={65} value={split} onChange={e=>setSplit(Number(e.target.value))}/></label></div>

  {inspector&&<aside className="studio-inspector">{selectedTransition?<StudioTransitionEditor graph={graph} transition={selectedTransition} onClose={()=>setTransitionId(null)} onChange={patch=>setGraph(g=>({...g,transitions:g.transitions.map(t=>t.id===transitionId?{...t,...patch}:t)}))}/>:node?<><p className="studio-eyebrow">{node.kind} / {node.id}</p><h2>{node.label}</h2><label>Label<input value={node.label} onChange={e=>editNode({label:e.target.value})}/></label><label>Motion description<textarea value={node.description} onChange={e=>editNode({description:e.target.value})}/></label>{node.kind==='clip'&&<><label>Duration<input type="number" min={.5} max={8} step={.1} value={node.duration} onChange={e=>editNode({duration:Number(e.target.value)})}/></label><label><input type="checkbox" checked={node.loop} onChange={e=>editNode({loop:e.target.checked})}/>Loop</label><LocomotionEditor node={node} graph={graph} onChange={editNode}/><label>Entry context<textarea value={node.entryDescription} onChange={e=>editNode({entryDescription:e.target.value})}/></label><label>Exit context<textarea value={node.exitDescription} onChange={e=>editNode({exitDescription:e.target.value})}/></label><label><input type="checkbox" checked={selectedIds.includes(node.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,node.id]:ids.filter(id=>id!==node.id))}/>Select for generation</label></>}<label>Shared style<select value={node.style??''} onChange={e=>editNode({style:e.target.value||null})}><option value="">No shared style</option>{graph.styles.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>{graph.styles.filter(s=>s.id===node.style).map(s=><label key={s.id}>Style description<textarea value={s.description} onChange={e=>setGraph(g=>({...g,styles:g.styles.map(x=>x.id===s.id?{...x,description:e.target.value}:x)}))}/></label>)}{graph.dependencies.filter(d=>d.node===node.id).map(d=><label key={d.node}>Predecessor: {d.predecessor}<select value={d.candidateId??''} onChange={e=>setGraph(g=>({...g,dependencies:g.dependencies.map(x=>x.node===node.id?{...x,candidateId:e.target.value||null}:x)}))}><option value="">Generate and select source first</option>{data.candidates.filter(c=>c.nodeId===d.predecessor&&c.clip).map(c=><option key={c.id} value={c.id}>{c.id.slice(0,8)}</option>)}</select></label>)}</>:<p>Select a state to inspect it, or describe a change below.</p>}</aside>}</div><aside className="studio-chat-rail"><StudioConversation graph={graph} jobs={jobs} revision={revision} storageKey={`synarc.motion.suggestions.${snapshot.project.id}.${workspaceId}`} disabled={!canRun||data.availability?.planningEnabled===false||!!busy||planning} validationErrors={problems.length>0} onReply={submitPrompt} onCompose={composeReply} onFocus={id=>{setSelected(id);setTransitionId(null)}} onReview={()=>setDrawer('history')} onMotions={()=>setDrawer('generation')}/>

  <section className="studio-prompt studio-composer studio-chat-composer"><label htmlFor="flex-prompt">Create or change your graph</label><div><textarea id="flex-prompt" value={prompt} maxLength={4000} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void submitPrompt(prompt,scoped&&selected?[selected]:[])}}} onChange={e=>writePrompt(e.target.value)} placeholder="Add a seated conversation mode, then branch into a celebration…"/><button disabled={!canRun||data.availability?.planningEnabled===false||!!busy||planning||prompt.length<10||problems.length>0} onClick={()=>void submitPrompt(prompt,scoped&&selected?[selected]:[])}>Apply prompt</button></div><label>Prompt scope<select aria-label="Prompt scope" value={scoped&&selected?'selected':'all'} onChange={e=>setScoped(e.target.value==='selected')}><option value="all">Entire graph</option><option value="selected" disabled={!selected}>{node?`${node.label} and its children`:'Select a state to focus edits'}</option></select></label><div className="studio-examples">{examples.map(([label,text])=><button key={label} onClick={()=>writePrompt(text)}>{label}</button>)}</div><small>{data.availability?.planningEnabled===false?'Prompt editing is currently unavailable for this account. Manual editing and saved previews remain available.':data.availability?.planCredits!=null?`${data.availability.planCredits} design credits per prompt. Motion generation is separate.`:'Graph edits use design credits. Motion generation is a separate action.'}</small></section></aside></div>

  {drawer==='generation'&&<aside className="studio-drawer" aria-label="Motion generation and review"><div className="studio-panel-heading"><strong>Motion generation</strong><button onClick={()=>setDrawer(null)}>Close motions</button></div><section className="studio-generation"><h2>Generate & review motions</h2>
<p>{reviewResults.length} motions processed · {previewableResults.length} with previewable results</p>
<label>Motion to review<select aria-label="Motion to review" value={reviewNode?.id??''} onChange={e=>{setCandidateSlots([]);setSelected(e.target.value)}}>
{!reviewNodes.length&&<option value="">No motions yet</option>}
{reviewNodes.map(n=><option key={n.id} value={n.id}>{n.label} — {data.candidates.some(c=>c.nodeId===n.id&&c.clip&&c.url)?'Preview available':data.candidates.some(c=>c.nodeId===n.id)?'Validation findings':'No result yet'}</option>)}
</select></label><StudioPreflight graph={graph} report={data.preflight??null} dirty={dirty} disabled={!canRun||!!busy||planning||problems.length>0||data.availability?.planningEnabled===false} credits={data.availability?.planCredits??null} onCheck={checkReadiness} onCompose={(text,ids)=>{setDrawer(null);composeReply(text,ids)}} onFocus={setSelected}/>{data.availability?.generation.reason&&<p role="status">{data.availability.generation.reason}</p>}{data.availability?.generation.reservationPerClipCents!=null&&<p>Request allowance (not a price estimate): <strong>${((selectedIds.length*data.availability.generation.reservationPerClipCents)/100).toFixed(2)}</strong> for {selectedIds.length} motions. This reserves ${((data.availability.generation.reservationPerClipCents)/100).toFixed(2)} per motion for this request. There is no cumulative studio setup cap. Actual provider billing is separate; the final charge is not yet known.</p>}<button onClick={()=>setSelectedIds(graph.nodes.filter(n=>generationReadiness(graph,n)==='ready to generate'&&data.preflight?.nodes.some(r=>r.nodeId===n.id&&r.status==='ready')).map(n=>n.id))}>Select missing motions</button><label>Spending limit (USD)<input type="number" min={0} max={25} step={.01} value={maximum/100} onChange={e=>setMaximum(Math.round(Number(e.target.value)*100))}/></label><button disabled={selectedInFlight||!generationReady||!canRun||data.availability?.generation.enabled===false||dirty||!!busy||!selectedIds.length||maximum<=0||(data.availability?.generation.reservationPerClipCents!=null&&maximum<selectedIds.length*data.availability.generation.reservationPerClipCents)} onClick={()=>void run('Submitting motions',async()=>{await command({...base(),action:'generate',nodeIds:selectedIds,maxReservationCents:maximum});setNotice('Motion requests submitted. Progress and results appear below.')})} aria-busy={busy==='Submitting motions'}>{busy==='Submitting motions'?<><span className="studio-spinner" aria-hidden="true"/>Submitting motions...</>:selectedInFlight?'Selected motions are processing':`Generate ${selectedIds.length} clips`}</button>{error&&<p role="alert" className="studio-error">{error}</p>}{notice&&<p role="status">{notice}</p>}{activeMotions.length>0&&<p role="status"><span className="studio-spinner" aria-hidden="true"/>{activeMotions.length} motions pending · status updates automatically.</p>}<p className="studio-hint">Your spending limit is a cap, not a price quote. Availability and the server quote are checked before admission. Independent clips run in parallel. Dependent clips wait for a selected source candidate. Provider availability and reservations are checked before submission.</p>{motionJobs.map(j=><div className="studio-candidate" key={j.id}><strong>{graph.nodes.find(n=>n.id===j.nodeId)?.label??j.nodeId}</strong> · {j.status}<button onClick={()=>{setCandidateSlots([]);setSelected(j.nodeId)}}>{data.candidates.some(c=>c.nodeId===j.nodeId&&c.clip&&c.url)?'Open preview':'View result'}</button><details><summary>Processing details</summary>{j.phase}</details>{j.error&&<p>{j.error}</p>}{['queued','running','attention'].includes(j.status)&&<button onClick={()=>void run('Cancelling',async()=>{await command({...base(),action:'cancel',jobId:j.id})})}>Cancel</button>}{j.status==='failed'&&<button onClick={()=>void run('Retrying saved source',async()=>{await command({...base(),action:'retry',jobId:j.id})})}>Retry saved motion processing</button>}</div>)}<div className="studio-field-pair">{[0,1].map(slot=><label key={slot}>Candidate {slot===0?'A':'B'}<select value={candidateSlots[slot]??candidateOptions[slot]?.id??''} onChange={e=>setCandidateSlots(values=>{const next=[...values];next[slot]=e.target.value;return next})}><option value="">None</option>{candidateOptions.map((c,i)=><option key={c.id} value={c.id}>Take {i+1} · {c.id.slice(0,8)}</option>)}</select></label>)}</div><label>Compare candidate poses<select value={comparePose} onChange={e=>setComparePose(e.target.value as typeof comparePose)}><option value="play">Playback</option><option value="entry">Entry poses</option><option value="exit">Exit poses</option></select></label><p className="studio-hint">Choose a motion above, then select its takes to compare. Retrying processing reuses saved motion without new inference.</p><h3>{reviewNode?.label??'Motion'} candidates</h3>{!candidateOptions.length&&<p>No generated result for this motion yet.</p>}<div className="studio-candidate-grid">{comparedCandidates.map(c=><div className="studio-candidate" key={c.id}><strong>{reviewNode?.label} · Take {candidateOptions.findIndex(option=>option.id===c.id)+1}</strong>{!c.clip&&<p role="status">No preview available: {c.diagnostics.failures?.join('; ')||'This result did not produce a validated clip.'}</p>}{c.clip&&!c.url&&<p role="status">Preview link unavailable. Refresh to try loading this clip again.</p>}{c.clip&&c.url&&<AnimationPreview key={`${c.id}.${comparePose}`} clip={c.clip} url={c.url} poseFrame={comparePose==='play'?undefined:comparePose==='entry'?0:1}/>}<details><summary>Processing diagnostics</summary><p>Cycle: {c.clip?.duration.toFixed(2)??"—"} s · Speed: {c.clip?.naturalSpeed.toFixed(2)??"—"} m/s</p><dl>{[['maxContactError','Contact drift','cm',100],['maxCorrection','Bake correction','cm',100],['maxSeamAngle','Loop seam angle','°',180/Math.PI],['maxSeamVelocity','Loop seam velocity','m/s',1],['leftStanceCoverage','Left stance','%',100],['rightStanceCoverage','Right stance','%',100]].map(([key,label,unit,factor])=>{const value=c.diagnostics.metrics?.[String(key)];return value===undefined?null:<div key={String(key)}><dt>{label}</dt><dd>{(value*Number(factor)).toFixed(2)} {unit}</dd></div>})}</dl></details><button disabled={!canRun||dirty||!reviewNode?.locomotion||!c.clip||!!busy} onClick={()=>void run("Reprocessing saved motion",async()=>{await command({...base(),action:"import_source",candidateId:c.id,nodeId:c.nodeId});setNotice("Saved motion queued for CPU processing. Review the new candidate when ready.")})}>Reprocess saved motion</button><p>{c.diagnostics.failures?.join('; ')||'Candidate ready for visual review'}</p><button disabled={dirty||!c.clip||!!busy} onClick={()=>void run('Accepting',async()=>{await command({...base(),action:'review_clip',candidateId:c.id,nodeId:c.nodeId,decision:'accepted'},true)})}>Accept candidate</button><button disabled={!!busy} onClick={()=>void run('Rejecting',async()=>{await command({...base(),action:'review_clip',candidateId:c.id,nodeId:c.nodeId,decision:'rejected'})})}>Reject candidate</button></div>)}</div></section></aside>}

  <p className="studio-hint">{data.preflight&&!dirty?`${data.preflight.nodes.filter(n=>n.status==='ready').length} clips ready for generation; ${data.preflight.nodes.filter(n=>n.status!=='ready').length} need attention.`:'Check generation readiness before requesting new motion.'}<button onClick={()=>setDrawer('generation')}>Review readiness</button></p><section className="studio-publish"><button disabled={dirty||!!busy||!graph.nodes.some(n=>n.kind==='clip')||graph.nodes.some(n=>n.kind==='clip'&&!n.clipId)} onClick={()=>void run('Reviewing graph',async()=>{await command({...base(),action:'review_graph'});setNotice('Graph and transition visual review recorded')})}>Accept graph & transitions after visual review</button></section><details><summary>Event key bindings</summary>{graph.events.map(event=><label key={event.id}>{event.label}<select value={event.key??''} onChange={e=>setGraph(g=>({...g,events:g.events.map(x=>x.id===event.id?{...x,key:e.target.value||null}:x)}))}><option value="">Button only</option>{[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(k=><option key={k} value={`Key${k}`}>{k}</option>)}<option value="Space">Space</option></select></label>)}</details>

  {drawer==='integration'&&<aside className="studio-drawer" aria-label="Optional game integration"><div className="studio-panel-heading"><h2>Optional game integration</h2><button onClick={()=>setDrawer(null)}>Close integration</button></div><p>Map a reviewed looping clip to each supported locomotion slot. Other states stay in this standalone graph. Gameplay actions retain their existing bindings.</p>{locomotionSlots.map(slot=><label key={slot}>{slot}<select value={mapping[slot]??''} onChange={e=>setMapping(m=>({...m,[slot]:e.target.value}))}><option value="">Choose clip</option>{graph.nodes.filter(n=>n.kind==='clip'&&n.loop).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>)}<label>Target actor<select value={actorId} onChange={e=>setActorId(e.target.value)}><option value="">Select actor</option>{data.game?.actors.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label><button disabled={dirty||!!busy||!actorId||!data.reviews.some(r=>r.revision===revision)||locomotionSlots.some(s=>!mapping[s])} onClick={()=>void run('Attaching mapped locomotion',async()=>{await command({...base(),action:'attach',targetDraftId:snapshot.draft.id,targetRevision:data.game!.revision,actorId,mapping});setNotice('Mapped locomotion attached. Build and review the game before publication.')})}>Attach mapped locomotion</button><button onClick={onLegacy}>Legacy game bindings</button></aside>}

  {problems.length>0&&<div role="alert">{problems.map(p=><p key={p}>{p}</p>)}</div>}{graph.gaps.map((gap,i)=><p key={i}>{gap}</p>)}



 </main>

}
