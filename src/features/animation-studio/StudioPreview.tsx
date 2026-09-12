import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { createStudioVisual } from '../../game-runtime/studioVisual'
import { advanceStudio, allowedTransition, initialStudioState, emptyStudioInput, type StudioState } from '../../domain/game/animation-studio/runtime'
import type { StudioGraph } from '../../domain/game/animation-studio/graph'
import type { ClipRevision } from '../../domain/game/v3/animation'

export function StudioPreview({ graph, clips, onActive }: { graph: StudioGraph; clips: Array<{clip: ClipRevision; url: string}>; onActive:(id:string)=>void }) {
  const canvas = useRef<HTMLCanvasElement>(null), input=useRef(emptyStudioInput()), current=useRef(initialStudioState(graph))
  const settings=useRef({playing:true,speed:1}), [state,setState]=useState<StudioState>(current.current), [error,setError]=useState(''), [playing,setPlaying]=useState(true), [speed,setSpeed]=useState(1)
  const notify=useRef(onActive); notify.current=onActive
  const graphRef=useRef(graph);graphRef.current=graph
  useEffect(()=>{current.current=initialStudioState(graph);held.current.clear();input.current=emptyStudioInput()},[graph])
  useEffect(()=>{
    const engine=new Engine(canvas.current!,true),scene=new Scene(engine)
    scene.clearColor=new Color4(.065,.078,.074,1)
    const camera=new ArcRotateCamera('studio-camera',-Math.PI/2,1.22,3.8,new Vector3(0,.95,0),scene)
    camera.attachControl(canvas.current!,true);camera.lowerRadiusLimit=1.8;camera.upperRadiusLimit=7;camera.wheelDeltaPercentage=.02
    new HemisphericLight('studio-light',Vector3.Up(),scene)
    let disposed=false,uiClock=0
    current.current=initialStudioState(graph);input.current=emptyStudioInput();setError('')
    void createStudioVisual(scene,graph,clips).then(visual=>{
      if(disposed){visual.dispose();return}
      engine.runRenderLoop(()=>{
        const dt=Math.min(.05,engine.getDeltaTime()/1000)
        if(settings.current.playing)current.current=advanceStudio(graphRef.current,current.current,input.current,dt*settings.current.speed)
        input.current.attack=false;input.current.toggleCombat=false
        visual.update(current.current,graphRef.current);scene.render();uiClock+=dt
        if(uiClock>.08){uiClock=0;setState({...current.current});notify.current(current.current.node)}
      })
    }).catch(e=>{if(!disposed)setError(String(e))})
    const resize=new ResizeObserver(()=>engine.resize());resize.observe(canvas.current!)
    return()=>{disposed=true;resize.disconnect();engine.stopRenderLoop();scene.dispose();engine.dispose()}
  },[clips])
  const held=useRef(new Set<string>())
  function keys(code:string,down:boolean){
    if(down)held.current.add(code);else held.current.delete(code)
    input.current.x=Number(held.current.has('KeyD'))-Number(held.current.has('KeyA'))
    input.current.z=Number(held.current.has('KeyW'))-Number(held.current.has('KeyS'))
    input.current.sprint=held.current.has('ShiftLeft')||held.current.has('ShiftRight')
    if(down&&code===graph.inputs.attack)input.current.attack=true
    if(down&&code===graph.inputs.toggle_combat)input.current.toggleCombat=true
  }
  const active=graph.nodes.find(n=>n.id===state.node)
  return <section className="studio-preview">
    <div className="studio-panel-heading"><strong>Motion sandbox</strong><span>{active?.label} · {active?.group}</span></div>
    <canvas ref={canvas} tabIndex={0} aria-label="Animation sandbox. Focus to use movement and action keys" onKeyDown={e=>{if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight',...Object.values(graph.inputs)].includes(e.code)){e.preventDefault();if(!e.repeat)keys(e.code,true)}}} onKeyUp={e=>keys(e.code,false)} onBlur={()=>{held.current.clear();input.current=emptyStudioInput()}} />
    {error&&<p role="alert">{error}</p>}
    <div className="studio-preview-controls"><button onClick={()=>{settings.current.playing=!playing;setPlaying(!playing)}}>{playing?'Pause':'Play'}</button><button onClick={()=>{current.current=initialStudioState(graph);setState(current.current)}}>Reset</button>
      <label>Speed<select value={speed} onChange={e=>{const v=Number(e.target.value);settings.current.speed=v;setSpeed(v)}}>{[.25,.5,1,1.5,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>
      <label>Scrub action<input type="range" min={0} max={active?.duration??1} step={.01} value={Math.min(state.elapsed,active?.duration??1)} onChange={e=>{settings.current.playing=false;setPlaying(false);current.current={...current.current,elapsed:Number(e.target.value)};setState(current.current)}} /></label>
    </div>
    <p className="studio-hint">Focus preview · WASD move · Shift sprint · {graph.inputs.attack.slice(3)} attack · {graph.inputs.toggle_combat.slice(3)} combat</p>
    <div className="studio-preview-controls">{graph.transitions.filter(t=>t.from===state.node&&t.event!=='finished').map(t=><button key={t.id} disabled={!allowedTransition(graph,state,t)} title={allowedTransition(graph,state,t)?'Trigger transition':'Outside the transition window'} onClick={()=>{if(t.event==='attack')input.current.attack=true;else input.current.toggleCombat=true}}>{t.event==='attack'?'Attack':'Change stance'}</button>)}</div>
    <p className="studio-hint">{graph.nodes.some(n=>!n.clipId)?'Unbound motions use labelled procedural approximations.':'Reviewed motion playback.'} Preview does not accept clips.</p>
    <details><summary>Transition history</summary><ol>{state.history.map((line,i)=><li key={i}>{line}</li>)}</ol></details>
  </section>
}
