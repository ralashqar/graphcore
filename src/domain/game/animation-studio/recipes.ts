import { animationRecipeProfile } from '../v3/animationProfiles.ts'
import { motionRecipeSchema } from '../v3/animation.ts'
import { somaMannequin, fabricMannequin } from '../v3/mannequin.ts'
import { validateKimodoConstraints } from '../v3/animationTransport.ts'
import { studioPose, poseConstraint } from './poses.ts'
import { nodeContract, type StudioGraph } from './graph.ts'
import type { SourceMotion } from '../v3/animationTransport.ts'
import type { SkeletalPose } from '../v3/somaPose.ts'

export async function studioRecipe(graph: StudioGraph, nodeId: string, seed = 42, predecessor?: SourceMotion) {
  const node=graph.nodes.find(n=>n.id===nodeId)
  if(!node)throw Error('Unknown animation node')
  const sourceRig=await somaMannequin(),rig=await fabricMannequin(),stance=graph.stances.find(s=>s.id===node.group)!
  const contract=await nodeContract(graph,node)
  if(node.contractHash!==contract)throw Error('Save the graph before generating its motions')
  const neighbors=graph.transitions.filter(t=>t.from===node.id||t.to===node.id).map(t=>`${t.from===node.id?'Next':'Previous'}: ${graph.nodes.find(n=>n.id===(t.from===node.id?t.to:t.from))?.description}`).join(' ')
  const fullBody=node.kind==='action'?[0,node.impact*node.duration,node.duration].map(t=>poseConstraint(sourceRig,studioPose(sourceRig,node,stance,t),t)):[]
  const targetFullBody=node.kind==='action'?[0,node.impact*node.duration,node.duration].map(t=>poseConstraint(rig,studioPose(rig,node,stance,t),t)):[]
  if(predecessor){
    if(predecessor.version!==1||!fullBody.length)throw Error('Pinned-source continuity requires a Kimodo action source')
    const last=predecessor.frames.at(-1)!,rotations=Object.fromEntries(predecessor.joints.map((j,i)=>[j.name,last.rotations[i]]))
    const pose:SkeletalPose={root:[0,last.root[1],0],rotations}
    fullBody[0]=poseConstraint(sourceRig,pose,0)
    const target:SkeletalPose={...pose,root:[0,rig.joints[0].translation[1]+last.root[1]-sourceRig.joints[0].translation[1],0]}
    targetFullBody[0]=poseConstraint(rig,target,0)
  }
  const recipe=motionRecipeSchema.parse({...animationRecipeProfile(node.role,rig.revision,seed),id:node.id,
    prompt:`${node.description} Stance: ${stance.description} ${neighbors}  Preserve the specified start and end posture.`.slice(0,1500),
    duration:node.duration,loop:node.loop,targetSpeed:node.speed,motionContract:contract,fullBody,
    targetFullBody,
    retargetRevision:'soma-fabric-studio-1.0.0',
  })
  validateKimodoConstraints(recipe)
  return {rig,recipe,nodeId}
}
