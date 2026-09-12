import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { AssetContainer } from '@babylonjs/core/assetContainer'
import type { Animation } from '@babylonjs/core/Animations/animation'
import '@babylonjs/loaders/glTF'
import fabricRigUrl from '../../workers/game/rigs/fabric-ybot-v1/mannequin.glb?url'
import { fabricMannequin } from '../domain/game/v3/mannequin'
import type { ClipRevision } from '../domain/game/v3/animation'
import { gaitPhaseOffset } from '../domain/game/v3/motionSets'
import { studioPose, blendPose } from '../domain/game/animation-studio/poses'
import { studioWeights, type StudioState } from '../domain/game/animation-studio/runtime'
import type { StudioGraph } from '../domain/game/animation-studio/graph'
import type { SkeletalPose } from '../domain/game/v3/somaPose'
import { createSwordVisual } from './swordVisual'

/** Shared renderer: samples clips on the same Fabric rig as the procedural preview. */
export async function createStudioVisual(scene: Scene, graph: StudioGraph, clips: Array<{clip:ClipRevision;url:string}>, options: {placeholder?:boolean;inPlace?:()=>boolean}={}) {
  const containers:AssetContainer[]=[]
  const rig=await fabricMannequin(),root=new TransformNode('studio-actor',scene)
  try {
    const mesh=await LoadAssetContainerAsync(fabricRigUrl,scene,{pluginExtension:'.glb'});containers.push(mesh);mesh.addAllToScene();mesh.animationGroups.forEach(g=>g.stop())
    const targets=new Map([...mesh.transformNodes,...mesh.meshes].map(n=>[n.name,n]));for(const n of [...mesh.transformNodes,...mesh.meshes])if(!n.parent)n.parent=root
    const sword=createSwordVisual(scene,targets)
    const tracks=new Map<string,{clip:ClipRevision;tracks:Array<{name:string;animation:Animation}>}>()
    for(const {clip,url} of clips){
      if(clip.rigRevision!==rig.revision)throw Error('Preview clip rig is incompatible')
      const c=await LoadAssetContainerAsync(url,scene,{pluginExtension:'.glb'});containers.push(c)
      c.animationGroups.forEach(g=>g.stop())
      tracks.set(clip.id,{clip,tracks:c.animationGroups.flatMap(g=>g.targetedAnimations.map(t=>({name:t.target.name,animation:t.animation})))})
    }
    const dispose=()=>{containers.forEach(c=>c.dispose());root.dispose()}
    scene.onDisposeObservable.add(dispose)
    return {root,dispose,update(state:StudioState,currentGraph:StudioGraph=graph){
      let total=0,result:SkeletalPose|null=null
      for(const [id,weight]of Object.entries(studioWeights(state))){
        if(weight<.0001)continue
        const node=currentGraph.nodes.find(n=>n.id===id);if(!node)continue
        const stance=currentGraph.stances.find(s=>s.id===node.group)!,seconds=node.loop?state.gait:Math.min(state.elapsed,node.duration)
        const pose=studioPose(rig,node,stance,options.placeholder?0:seconds),source=node.clipId?tracks.get(node.clipId):undefined
        if(source){
          const phase=node.loop?(seconds/source.clip.duration+gaitPhaseOffset(source.clip))%1:Math.min(1,seconds/source.clip.duration)
          if(options.inPlace&&!options.inPlace()){const curve=source.clip.rootCurve,at=phase*source.clip.duration,index=curve.findIndex(p=>p.time>=at),b=curve[index<0?curve.length-1:index],a=curve[Math.max(0,(index<0?curve.length-1:index)-1)],t=b.time===a.time?0:(at-a.time)/(b.time-a.time);for(const axis of [0,2])pose.root[axis]=a.position[axis]+(b.position[axis]-a.position[axis])*t+(node.loop?Math.floor(seconds/source.clip.duration)*curve[curve.length-1].position[axis]:0)}
          for(const track of source.tracks){
            const keys=track.animation.getKeys();if(!keys.length)continue
            const frame=keys[0].frame+(keys[keys.length-1].frame-keys[0].frame)*phase
            const value=track.animation.evaluate(frame)
            if(track.animation.targetProperty==='rotationQuaternion'&&value instanceof Quaternion&&pose.rotations[track.name])pose.rotations[track.name]=value.asArray() as [number,number,number,number]
            if(track.animation.targetProperty==='position'&&track.name===rig.joints[0].id&&value instanceof Vector3)pose.root=options.inPlace&&!options.inPlace()?[pose.root[0],value.y,pose.root[2]]:value.asArray() as [number,number,number]
          }
        }
        result=result?blendPose(result,pose,weight/(total+weight)):pose;total+=weight
      }
      if(result&&options.inPlace?.()){result.root[0]=0;result.root[2]=0}
      if(result)for(const joint of rig.joints){const target=targets.get(joint.id);if(target){target.rotationQuaternion=Quaternion.FromArray(result.rotations[joint.id]);if(!joint.parent)target.position=Vector3.FromArray(result.root)}}
      const active=currentGraph.nodes.find(n=>n.id===state.node),stance=currentGraph.stances.find(s=>s.id===active?.group)
      sword?.update(stance?.equipment!=='one_handed_sword')
    }}
  }catch(error){containers.forEach(c=>c.dispose());root.dispose();throw error}
}
