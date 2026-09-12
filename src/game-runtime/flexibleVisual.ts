import type { Scene } from '@babylonjs/core/scene'
import type { ClipRevision } from '../domain/game/v3/animation'
import { createStudioVisual } from './studioVisual'
import type { StudioGraph } from '../domain/game/animation-studio/graph'
import type { FlexibleGraph } from '../domain/game/animation-studio/flexible'
import { flexibleWeights, type FlexState } from '../domain/game/animation-studio/flexibleRuntime'
const renderGraph=(g:FlexibleGraph):StudioGraph=>({version:2,catalog:'animation-studio-1.0.0',name:g.name,prompt:g.prompt,rig:g.rig,entry:g.entry??'',stances:[{id:'neutral',label:'Neutral',description:'Neutral placeholder',equipment:'none',guardHeight:0,torsoTurn:0,handedness:'right'}],nodes:g.nodes.filter(n=>n.kind==='clip').map(n=>({id:n.id,label:n.label,description:n.description,group:'neutral',kind:'locomotion',role:'idle',duration:n.duration,loop:n.loop,speed:0,entry:'neutral',exit:'neutral',impact:.5,clipId:n.clipId,contractHash:n.contractHash})),transitions:[],dependencies:[],gaps:[],inputs:{attack:'KeyF',toggle_combat:'KeyC'}})
export async function createFlexibleVisual(scene:Scene,g:FlexibleGraph,clips:Array<{clip:ClipRevision;url:string}>,inPlace:()=>boolean){
 const visual=await createStudioVisual(scene,renderGraph(g),clips,{placeholder:true,inPlace})
 return{dispose:visual.dispose,update(s:FlexState,graph:FlexibleGraph){visual.update({node:s.node??'',elapsed:s.elapsed,gait:s.elapsed,time:s.time,weights:flexibleWeights(s),previousWeights:{},blendElapsed:1,blendDuration:0,bufferedUntil:-1,transition:null,history:s.history},renderGraph(graph))}}
}
