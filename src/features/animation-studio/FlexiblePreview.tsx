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
 const [state,setState]=useState<FlexState>(current.current),[paused,setPaused]=useState(false),[error,setError]=useState('')
 useEffect(()=>{current.current=initialFlexible(graph);events.current=[];setState(current.current)},[graph])
 useEffect(()=>{
  const engine=new Engine(canvas.current!,true),scene=new Scene(engine);scene.clearColor=new Color4(.065,.078,.074,1)
  const camera=new ArcRotateCamera('motion-camera',-Math.PI/2,1.2,4,new Vector3(0,1,0),scene);camera.attachControl(canvas.current!,true);camera.lowerRadiusLimit=.5;camera.upperRadiusLimit=30
  new HemisphericLight('motion-light',Vector3.Up(),scene)
  let disposed=false,clock=0
  const props=graph.props.map(p=>{const mesh=p.shape==='sphere'?MeshBuilder.CreateSphere(p.id,{diameter:1},scene):p.shape==='cylinder'?MeshBuilder.CreateCylinder(p.id,{height:1,diameter:1},scene):MeshBuilder.CreateBox(p.id,{size:1},scene);mesh.position=Vector3.FromArray(p.position);mesh.scaling=Vector3.FromArray(p.size);mesh.visibility=.4;return mesh})
  const anchors=graph.anchors.map(a=>{const p=graph.props.find(p=>p.id===a.prop),mesh=MeshBuilder.CreateSphere(a.id,{diameter:.055},scene);mesh.position=Vector3.FromArray(a.position.map((v,i)=>v+(p?.position[i]??0)));return mesh})
  setError('');void createFlexibleVisual(scene,g.current,clips,()=>inPlace.current).then(visual=>{if(disposed){visual.dispose();return}engine.runRenderLoop(()=>{const dt=Math.min(.05,engine.getDeltaTime()/1000);if(playing.current)current.current=advanceFlexible(g.current,current.current,events.current.splice(0),dt*speed.current);visual.update(current.current,g.current);scene.render();clock+=dt;if(clock>.08){clock=0;setState({...current.current});notify.current(current.current.node)}})}).catch(e=>{if(!disposed)setError(String(e))})
  const observer=new ResizeObserver(()=>engine.resize());observer.observe(canvas.current!)
  return()=>{disposed=true;observer.disconnect();engine.stopRenderLoop();props.forEach(p=>p.dispose());anchors.forEach(a=>a.dispose());scene.dispose();engine.dispose()}
 },[clips,graph.props,graph.anchors])
 function setParameter(id:string,value:number|string|boolean){current.current={...current.current,parameters:{...current.current.parameters,[id]:value}};setState({...current.current})}
 const active=graph.nodes.find(n=>n.id===state.node)
 return <section className="studio-preview"><div className="studio-panel-heading"><strong>Standalone preview</strong><span>{state.node?ancestors(graph,state.node).reverse().join(' / '):'Choose an entry or preview a node'}</span></div>
  <canvas ref={canvas} tabIndex={0} aria-label="Flexible animation sandbox" onKeyDown={e=>{const event=graph.events.find(x=>x.key===e.code);if(event){e.preventDefault();if(!e.repeat)events.current.push(event.id)}if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)&&graph.parameters.some(p=>['move_x','move_z','speed'].includes(p.id))){e.preventDefault();if(e.code==='KeyA'||e.code==='KeyD')setParameter('move_x',e.code==='KeyA'?-1:1);if(e.code==='KeyW'||e.code==='KeyS')setParameter('move_z',e.code==='KeyW'?1:-1);if(e.code.startsWith('Shift'))setParameter('speed',graph.parameters.find(p=>p.id==='speed')?.max??1)}}} onKeyUp={e=>{if(['KeyA','KeyD'].includes(e.code))setParameter('move_x',0);if(['KeyW','KeyS'].includes(e.code))setParameter('move_z',0);if(e.code.startsWith('Shift'))setParameter('speed',graph.parameters.find(p=>p.id==='speed')?.initial??0)}} onBlur={()=>{events.current=[];for(const id of ['move_x','move_z','speed']){const p=graph.parameters.find(p=>p.id===id);if(p)setParameter(id,p.initial)}}}/>
  {error&&<p role="alert">{error}</p>}<div className="studio-preview-controls"><button onClick={()=>{playing.current=!playing.current;setPaused(!playing.current)}}>{paused?'Play':'Pause'}</button><button onClick={()=>{current.current=initialFlexible(graph)}}>Reset</button><button disabled={!selected} onClick={()=>{current.current=initialFlexible(graph,selected);setState(current.current)}}>Preview selected node</button><label>Playback speed<select onChange={e=>speed.current=Number(e.target.value)} defaultValue="1">{[.25,.5,1,2].map(v=><option key={v}>{v}</option>)}</select></label><label>Root motion<select onChange={e=>inPlace.current=e.target.value==='in_place'}><option value="in_place">In place</option><option value="moving">Moving character</option></select></label></div>
  <label>Scrub clip<input type="range" min={0} max={active?.duration??1} step={.01} value={Math.min(state.elapsed,active?.duration??1)} onChange={e=>{playing.current=false;setPaused(true);current.current={...current.current,elapsed:Number(e.target.value)};setState(current.current)}}/></label>
  <div className="studio-preview-controls">{graph.events.map(e=><button key={e.id} title={graph.transitions.some(t=>t.event===e.id&&transitionReady(graph,state,t))?'Transition available':'Event may be buffered until its window'} onClick={()=>events.current.push(e.id)}>{e.label}{e.key?` (${e.key.replace('Key','')})`:''}</button>)}</div>
  {graph.parameters.map(p=><label key={p.id}>{p.label}{p.type==='boolean'?<input type="checkbox" checked={Boolean(state.parameters[p.id])} onChange={e=>setParameter(p.id,e.target.checked)}/>:p.type==='enum'?<select value={String(state.parameters[p.id])} onChange={e=>setParameter(p.id,e.target.value)}>{p.options.map(o=><option key={o}>{o}</option>)}</select>:<><input type="range" min={p.min} max={p.max} step={(p.max-p.min)/100||.01} value={Number(state.parameters[p.id]??p.initial)} onChange={e=>setParameter(p.id,Number(e.target.value))}/><output>{Number(state.parameters[p.id]??p.initial).toFixed(2)}</output></>}</label>)}
  <p className="studio-hint">{Object.keys(flexibleWeights(state)).some(id=>!graph.nodes.find(n=>n.id===id)?.clipId)?'Pose placeholder — no generated motion for one or more active clips.':'Generated clip playback.'} Props are static references.</p>
  <details><summary>Blend weights and transition history</summary><pre>{JSON.stringify(flexibleWeights(state),null,2)}</pre>{state.history.map((h,i)=><p key={i}>{h}</p>)}</details>
 </section>
}
