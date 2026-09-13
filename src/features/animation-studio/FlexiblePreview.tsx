import { advanceLocomotion,emptyLocomotion } from '../../domain/game/animation-studio/locomotionClock'
import { gaitPhaseOffset } from '../../domain/game/v3/motionSets'
import { transitionReason } from './previewDiagnostics'

import { useEffect,useRef,useState } from 'react'

import { Engine } from '@babylonjs/core/Engines/engine'

import { Scene } from '@babylonjs/core/scene'

import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'

import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'

import { Vector3 } from '@babylonjs/core/Maths/math.vector'

import { Color4 } from '@babylonjs/core/Maths/math.color'

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'

import { createFlexibleVisual } from '../../game-runtime/flexibleVisual'

import { ancestors,type FlexibleGraph } from '../../domain/game/animation-studio/flexible'

import { initialFlexible,advanceFlexible,flexibleWeights,transitionReady,type FlexState } from '../../domain/game/animation-studio/flexibleRuntime'

import type { ClipRevision } from '../../domain/game/v3/animation'

export function FlexiblePreview({graph,clips,selected,onActive}:{graph:FlexibleGraph;clips:Array<{clip:ClipRevision;url:string}>;selected:string|null;onActive:(id:string|null)=>void}){

 const canvas=useRef<HTMLCanvasElement>(null),g=useRef(graph),current=useRef(initialFlexible(graph)),events=useRef<string[]>([]),playing=useRef(true),speed=useRef(1),inPlace=useRef(true),notify=useRef(onActive)

 g.current=graph;notify.current=onActive

 const showContacts=useRef(true)

 const review=useRef<string|null>(null),repeat=useRef(false)

 const [motionDiagnostics,setMotionDiagnostics]=useState({locked:[] as string[],released:[] as string[],maxCorrection:0})

 const [reviewId,setReviewId]=useState(''),[repeatReview,setRepeatReview]=useState(false)

 const [state,setState]=useState<FlexState>(current.current),[paused,setPaused]=useState(false),[error,setError]=useState('')

 useEffect(()=>{current.current=initialFlexible(graph);events.current=[];setState(current.current)},[graph])

 useEffect(()=>{

  const engine=new Engine(canvas.current!,true),scene=new Scene(engine);scene.clearColor=new Color4(.065,.078,.074,1)

  const camera=new ArcRotateCamera('motion-camera',-Math.PI/2,1.2,4,new Vector3(0,1,0),scene);camera.attachControl(canvas.current!,true);camera.lowerRadiusLimit=.5;camera.upperRadiusLimit=30

  new HemisphericLight('motion-light',Vector3.Up(),scene)

  let disposed=false,clock=0

  const contactMarkers=[0,1].map(i=>{const mesh=MeshBuilder.CreateSphere(`locked-foot-${i}`,{diameter:.065},scene);mesh.setEnabled(false);return mesh})

  const props=graph.props.map(p=>{const mesh=p.shape==='sphere'?MeshBuilder.CreateSphere(p.id,{diameter:1},scene):p.shape==='cylinder'?MeshBuilder.CreateCylinder(p.id,{height:1,diameter:1},scene):MeshBuilder.CreateBox(p.id,{size:1},scene);mesh.position=Vector3.FromArray(p.position);mesh.scaling=Vector3.FromArray(p.size);mesh.visibility=.4;return mesh})

  const anchors=graph.anchors.map(a=>{const p=graph.props.find(p=>p.id===a.prop),mesh=MeshBuilder.CreateSphere(a.id,{diameter:.055},scene);mesh.position=Vector3.FromArray(a.position.map((v,i)=>v+(p?.position[i]??0)));return mesh})

  setError('');void createFlexibleVisual(scene,g.current,clips,()=>inPlace.current).then(visual=>{if(disposed){visual.dispose();return}engine.runRenderLoop(()=>{const dt=Math.min(.05,engine.getDeltaTime()/1000);if(playing.current){const t=g.current.transitions.find(t=>t.id===review.current);const runtimeGraph=t?{...g.current,transitions:[t]}:g.current;current.current=advanceFlexible(runtimeGraph,current.current,events.current.splice(0),dt*speed.current,clips.map(c=>c.clip));if(t&&repeat.current&&current.current.history.length&&current.current.elapsed>Math.max(1,t.blendSeconds+.4)){current.current={...initialFlexible(g.current,t.from),parameters:current.current.parameters};}}visual.update(current.current,g.current);contactMarkers.forEach((mesh,i)=>{const point=visual.diagnostics().points[i];mesh.setEnabled(showContacts.current&&!!point);if(point)mesh.position.set(point.x,point.y,point.z)});scene.render();clock+=dt;if(clock>.08){clock=0;setState({...current.current});setMotionDiagnostics(visual.diagnostics());notify.current(current.current.node)}})}).catch(e=>{if(!disposed)setError(String(e))})

  const observer=new ResizeObserver(()=>engine.resize());observer.observe(canvas.current!)

  return()=>{disposed=true;observer.disconnect();engine.stopRenderLoop();props.forEach(p=>p.dispose());anchors.forEach(a=>a.dispose());scene.dispose();engine.dispose()}

 },[clips,graph.props,graph.anchors])

 function setParameter(id:string,value:number|string|boolean){current.current={...current.current,parameters:{...current.current.parameters,[id]:value}};setState({...current.current})}

 const active=graph.nodes.find(n=>n.id===state.node)

 const activeClip=clips.find(c=>c.clip.id===active?.clipId)?.clip
 const scrubDuration=active?.locomotion&&activeClip?activeClip.duration:active?.duration??1
 function scrub(seconds:number){playing.current=false;setPaused(true);let next={...current.current,time:0,elapsed:seconds,locomotion:undefined} as FlexState;if(active?.locomotion&&activeClip?.locomotion){const clock=emptyLocomotion(),phase=seconds/activeClip.duration;clock.groups[active.locomotion.syncGroup]={phase:phase-gaitPhaseOffset(activeClip),rate:1,synchronized:true};next.locomotion=advanceLocomotion(graph,flexibleWeights(next),next.parameters,clock,0,clips.map(c=>c.clip))}current.current=next;setState(next)}
 const reviewTransition=graph.transitions.find(t=>t.id===reviewId)

 const label=(id:string)=>graph.nodes.find(n=>n.id===id)?.label??id

 return <section className="studio-preview"><div className="studio-panel-heading"><strong>Standalone preview</strong><span>{state.node?ancestors(graph,state.node).reverse().map(label).join(' / '):'Choose an entry or preview a node'}</span></div>

  <div className="studio-viewport"><div className="studio-controls-overlay">{active?.label??'No active state'}<span>Drag to orbit · Scroll to zoom</span></div><canvas ref={canvas} tabIndex={0} aria-label="Flexible animation sandbox" onKeyDown={e=>{const event=graph.events.find(x=>x.key===e.code);if(event){e.preventDefault();if(!e.repeat)events.current.push(event.id)}if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)&&graph.parameters.some(p=>['move_x','move_z','speed'].includes(p.id))){e.preventDefault();if(e.code==='KeyA'||e.code==='KeyD')setParameter('move_x',e.code==='KeyA'?-1:1);if(e.code==='KeyW'||e.code==='KeyS')setParameter('move_z',e.code==='KeyW'?1:-1);if(e.code.startsWith('Shift'))setParameter('speed',graph.parameters.find(p=>p.id==='speed')?.max??1)}}} onKeyUp={e=>{if(['KeyA','KeyD'].includes(e.code))setParameter('move_x',0);if(['KeyW','KeyS'].includes(e.code))setParameter('move_z',0);if(e.code.startsWith('Shift'))setParameter('speed',graph.parameters.find(p=>p.id==='speed')?.initial??0)}} onBlur={()=>{events.current=[];for(const id of ['move_x','move_z','speed']){const p=graph.parameters.find(p=>p.id===id);if(p)setParameter(id,p.initial)}}}/></div>

  <div className="studio-preview-body">{error&&<p role="alert">{error}</p>}<div className="studio-preview-controls"><button onClick={()=>{playing.current=!playing.current;setPaused(!playing.current)}}>{paused?'Play':'Pause'}</button><button onClick={()=>{review.current=null;setReviewId('');current.current=initialFlexible(graph);setState(current.current)}}>Reset</button><button disabled={!selected} onClick={()=>{review.current=null;setReviewId('');current.current=initialFlexible(graph,selected);setState(current.current)}}>Preview selected node</button><label>Playback speed<select onChange={e=>speed.current=Number(e.target.value)} defaultValue="1">{[.25,.5,1,2].map(v=><option key={v}>{v}</option>)}</select></label><label>Root motion<select onChange={e=>inPlace.current=e.target.value==='in_place'}><option value="in_place">In place</option><option value="moving">Moving character</option></select></label></div>

  <label>Scrub clip<input type="range" min={0} max={scrubDuration} step={.01} value={active?.locomotion&&state.locomotion?.samples[active.id]!==undefined?state.locomotion.samples[active.id]*scrubDuration:Math.min(state.elapsed,scrubDuration)} onChange={e=>scrub(Number(e.target.value))}/></label>

  <div className="studio-event-controls">{graph.events.map(e=>{const transitions=graph.transitions.filter(t=>t.event===e.id);const available=transitions.some(t=>transitionReady(graph,state,t));return <div key={e.id}><button data-ready={available} title={transitions.map(t=>transitionReason(graph,state,t)).join('; ')} onClick={()=>events.current.push(e.id)}>{e.label}{e.key&&<kbd>{e.key.replace('Key','')}</kbd>}</button><small>{available?'Ready':transitions.length?transitionReason(graph,state,transitions[0]):'No transitions use this event'}</small></div>})}</div>

  <details className="studio-transition-lab"><summary>Test a transition</summary><label>Transition to review<select aria-label="Transition to review" value={reviewId} onChange={e=>{const id=e.target.value,t=graph.transitions.find(t=>t.id===id);review.current=id||null;setReviewId(id);if(t){current.current=initialFlexible(graph,t.from);setState(current.current)}}}><option value="">Full graph playback</option>{graph.transitions.map(t=><option key={t.id} value={t.id}>{label(t.from)} → {label(t.to)}</option>)}</select></label><label><input type="checkbox" checked={repeatReview} onChange={e=>{repeat.current=e.target.checked;setRepeatReview(e.target.checked)}}/>Repeat transition test</label>{reviewTransition&&<><p>{transitionReason(graph,state,reviewTransition)}</p><p className="studio-hint">Only this connection runs during the test. Use its event and parameter controls; authored conditions still apply.</p><button onClick={()=>{current.current={...initialFlexible(graph,reviewTransition.from),parameters:current.current.parameters};setState(current.current)}}>Restart transition</button></>}</details>

  {graph.parameters.map(p=><label key={p.id}>{p.label}{p.type==='boolean'?<input type="checkbox" checked={Boolean(state.parameters[p.id])} onChange={e=>setParameter(p.id,e.target.checked)}/>:p.type==='enum'?<select value={String(state.parameters[p.id])} onChange={e=>setParameter(p.id,e.target.value)}>{p.options.map(o=><option key={o}>{o}</option>)}</select>:<><input type="range" min={p.min} max={p.max} step={(p.max-p.min)/100||.01} value={Number(state.parameters[p.id]??p.initial)} onChange={e=>setParameter(p.id,Number(e.target.value))}/><output>{Number(state.parameters[p.id]??p.initial).toFixed(2)}</output></>}</label>)}

  <p className="studio-hint">{Object.keys(flexibleWeights(state)).some(id=>!graph.nodes.find(n=>n.id===id)?.clipId)?'Pose placeholder — no generated motion for one or more active clips.':'Generated clip playback.'} Props are static references.</p>

  {graph.nodes.some(n=>n.locomotion)&&<details open><summary>Gait and contact diagnostics</summary><label><input type="checkbox" defaultChecked onChange={e=>showContacts.current=e.target.checked}/>Show locked contact markers</label>{Object.entries(state.locomotion?.groups??{}).map(([id,group])=><p key={id}>{id}: phase {(group.phase%1).toFixed(2)} · rate {group.rate.toFixed(2)}× · {group.synchronized?'Synchronized':'Independent playback: cycle rates do not overlap'}</p>)}<p>Locked: {motionDiagnostics.locked.join(', ')||'none'} · Correction: {(motionDiagnostics.maxCorrection*100).toFixed(1)} cm</p><p>{motionDiagnostics.released.length?'Contact released: correction exceeded its safe reach.':''}</p>{!state.locomotion?.weight&&<p>No active processed locomotion clip. Save and reprocess a source, then accept the candidate.</p>}</details>}<details><summary>Blend weights and transition history</summary><pre>{JSON.stringify(flexibleWeights(state),null,2)}</pre>{state.history.map((h,i)=><p key={i}>{h}</p>)}</details>

 </div></section>

}
