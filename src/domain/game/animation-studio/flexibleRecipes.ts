import { animationRecipeProfile } from '../v3/animationProfiles.ts'
import { motionRecipeSchema } from '../v3/animation.ts'
import { fabricMannequin, somaMannequin } from '../v3/mannequin.ts'
import { validateKimodoConstraints, type SourceMotion } from '../v3/animationTransport.ts'
import { poseConstraint } from './poses.ts'
import { motionFingerprint, generationReadiness, type FlexibleGraph } from './flexible.ts'
export async function flexibleRecipe(g:FlexibleGraph,nodeId:string,seed=42,predecessor?:SourceMotion){
 const n=g.nodes.find(n=>n.id===nodeId);if(!n||n.kind!=='clip')throw Error('Select a clip state')
 if(generationReadiness(g,n)==='missing dependency')throw Error('Generate and select the predecessor candidate first')
 const contract=await motionFingerprint(g,n);if(contract!==n.contractHash)throw Error('Save the graph before generating')
 const rig=await fabricMannequin(),sourceRig=await somaMannequin()
 const contacts=n.contacts.map(c=>{const a=g.anchors.find(a=>a.id===c.anchor)!,prop=g.props.find(p=>p.id===a.prop);return{effector:c.effector,start:c.start,end:c.end,position:a.position.map((v,i)=>v+(prop?.position[i]??0)) as [number,number,number]}})
 const posesByTime=new Map<number,{time:number;joints:Record<string,[number,number,number]>}>()
 const effectors={left_hand:'LeftHand',right_hand:'RightHand',left_foot:'LeftFoot',right_foot:'RightFoot'}
 n.contacts.forEach((c,i)=>{for(const time of [c.start,c.end]){
  const body={Hips:c.hips,LeftLeg:c.leftHip,RightLeg:c.rightHip},old=posesByTime.get(time)
  if(old&&Object.entries(body).some(([key,value])=>JSON.stringify(old.joints[key])!==JSON.stringify(value)))throw Error('Contact milestones disagree on body position')
  posesByTime.set(time,{time,joints:{...old?.joints,...body,[effectors[c.effector]]:contacts[i].position}})
 }})
 const poses=[...posesByTime.values()].sort((a,b)=>a.time-b.time)
 const fullBody=[]
 if(predecessor){if(predecessor.version!==1)throw Error('Continuity requires a Kimodo source');const f=predecessor.frames.at(-1)!;fullBody.push(poseConstraint(sourceRig,{root:[0,f.root[1],0],rotations:Object.fromEntries(predecessor.joints.map((j,i)=>[j.name,f.rotations[i]]))},0))}
 const context=g.transitions.filter(t=>t.from===n.id||t.to===n.id).map(t=>`${t.to===n.id?'Previous':'Next'}: ${g.nodes.find(x=>x.id===(t.to===n.id?t.from:t.to))?.description??''}`).join(' ')
 const recipe=motionRecipeSchema.parse({...animationRecipeProfile('idle',rig.revision,seed),state:'custom',id:n.id,duration:n.duration,loop:n.loop,rootMode:n.rootMode,contacts,poses,fullBody,motionContract:contract,retargetRevision:'soma-fabric-flexible-1.0.0',prompt:[n.description,g.styles.find(s=>s.id===n.style)?.description,n.entryDescription,n.exitDescription,context].filter(Boolean).join(' ').slice(0,1500)})
 validateKimodoConstraints(recipe);return{rig,recipe,nodeId}
}
