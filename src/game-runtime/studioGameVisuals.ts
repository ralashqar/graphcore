import type { Scene } from '@babylonjs/core/scene'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Manifest } from '../domain/game/v3/spec'
import type { Simulation } from '../domain/game/v2/simulation'
import { initialStudioState, advanceStudio, emptyStudioInput, studioWeights, type StudioState } from '../domain/game/animation-studio/runtime'
import { createStudioVisual } from './studioVisual'
import type { PresentationFrame } from './animationRenderer'

export async function studioGameVisuals(scene:Scene,manifest:Manifest,urls:Record<string,string>){
 const records=[] as Array<{id:string;binding:NonNullable<Manifest['studioBindings']>[number];visual:Awaited<ReturnType<typeof createStudioVisual>>;state:StudioState;last:{x:number;y:number;z:number};tick:number;combat:boolean}>
 for(const binding of manifest.studioBindings??[])for(const actor of manifest.design.nodes.filter(n=>n.kind==='actor_instance'&&n.definition===binding.actorDefinition)){
  if(actor.kind!=='actor_instance')continue
  const visual=await createStudioVisual(scene,binding.graph,binding.clips.map(clip=>({clip,url:urls[`animation.${clip.id}`]})))
  records.push({id:actor.id,binding,visual,state:initialStudioState(binding.graph),last:actor.position,tick:0,combat:false})
 }
 const canvas=scene.getEngine().getRenderingCanvas()
 const toggle=(event:KeyboardEvent)=>{if(event.code==='KeyT'&&!event.repeat&&document.activeElement===canvas){for(const r of records)r.combat=!r.combat}}
 canvas?.addEventListener('keydown',toggle);scene.onDisposeObservable.add(()=>canvas?.removeEventListener('keydown',toggle))
 return {metrics:()=>({studioActors:records.map(r=>r.id),studioStates:Object.fromEntries(records.map(r=>[r.id,r.state.node]))}),update(sim:Simulation,frame?:PresentationFrame){
  const ids=new Set<string>()
  for(const r of records){
   const actor=sim.state.actors.find(a=>a.id===r.id);if(!actor)continue
   const comboMatch=/^runtime\.combo\.([0-2])$/.exec(actor.action?.ability??'')
   const match=comboMatch&&r.binding.graph.nodes.some(n=>n.id===`sword.strike_${Number(comboMatch[1])+1}`)?comboMatch:null
   // Traversal/reactions remain owned by the existing presentation path.
   if(actor.mode!=='ground'||actor.health<=0||sim.interactions.owns(actor.id)||(actor.action&&!match)||('forcedMovement' in sim&&!!(sim as {forcedMovement:Record<string,unknown>}).forcedMovement[actor.id])){r.visual.root.setEnabled(false);continue}
   const dt=frame?.dt??Math.max(0,(sim.state.tick-r.tick)/60),elapsed=Math.max(1/60,(sim.state.tick-r.tick)/60)
   if(sim.state.tick<r.tick){r.state=initialStudioState(r.binding.graph);r.last={...actor.position}}
   const vx=(actor.position.x-r.last.x)/elapsed,vz=(actor.position.z-r.last.z)/elapsed
   const group=r.binding.graph.nodes.find(n=>n.id===r.state.node)?.group
   r.state=advanceStudio(r.binding.graph,r.state,{...emptyStudioInput(),x:(vx*Math.cos(actor.yaw)-vz*Math.sin(actor.yaw))/1.5,z:(vx*Math.sin(actor.yaw)+vz*Math.cos(actor.yaw))/1.5,sprint:Math.hypot(vx,vz)>2,toggleCombat:r.combat?group==='upright':group==='sword'},dt)
   if(match){
    const node=`sword.strike_${Number(match[1])+1}`
    if(r.state.node!==node){r.state={...r.state,previousWeights:studioWeights(r.state),weights:{[node]:1},node,blendElapsed:0,blendDuration:.12}}
    r.state.elapsed=(actor.action?.tick??0)/60;r.combat=true
   }else if(r.binding.graph.nodes.find(n=>n.id===r.state.node)?.kind==='action'){
    r.state={...r.state,previousWeights:studioWeights(r.state),node:'sword.idle',weights:{'sword.idle':1},elapsed:0,blendElapsed:0,blendDuration:.12}
   }
   const previous=frame?.previous.get(actor.id),alpha=frame?.alpha??1
   r.visual.root.position=Vector3.FromArray([actor.position.x,actor.position.y,actor.position.z])
   if(previous)r.visual.root.position=Vector3.Lerp(Vector3.FromArray([previous.position.x,previous.position.y,previous.position.z]),r.visual.root.position,alpha)
   r.visual.root.rotationQuaternion=Quaternion.FromEulerAngles(0,actor.yaw,0);r.visual.root.setEnabled(true);r.visual.update(r.state)
   r.last={...actor.position};r.tick=sim.state.tick;ids.add(r.id)
  }
  return ids
 }}
}
