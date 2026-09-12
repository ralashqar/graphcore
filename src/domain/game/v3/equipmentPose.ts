import type { MotionProfile } from './motionProfile.ts'
import { contactPose, estimateSomaPose, forwardPose, type Q, type Rig, type SkeletalPose } from './somaPose.ts'

export const SWORD_STANCE_VERSION = 'sword-stance-1.0.0'
export const swordArmMask = ['RightArm','RightForeArm','RightHand'] as const
export type EquipmentState = { weight:number; stowed:boolean }
export function advanceEquipment(previous:EquipmentState, profile:MotionProfile|undefined, intent:{mode:string;fullBody:boolean;attached:boolean}, dt:number):EquipmentState {
  const stowed=intent.attached||['hang','climb'].includes(intent.mode)
  const target=profile?.equipment==='one_handed_sword'&&!stowed&&!intent.fullBody?1:0
  return {stowed,weight:previous.weight+(target-previous.weight)*(1-Math.exp(-Math.max(0,Math.min(.1,dt))/.12))}
}
function blend(a:Q,b:Q,t:number):Q {
  const sign=a.reduce((sum,v,i)=>sum+v*b[i],0)<0?-1:1
  const q=a.map((v,i)=>v*(1-t)+b[i]*sign*t) as Q,n=Math.hypot(...q)
  return q.map(v=>v/n) as Q
}
const stanceCache=new WeakMap<Rig,Record<string,Q>|null>()
/** Only the right arm is masked. Pelvis, root, gait and controller remain untouched. */
export function applySwordStance(rig:Rig,pose:SkeletalPose,weight:number):boolean {
  if(weight<.001||!swordArmMask.every(id=>pose.rotations[id]))return false
  if(!stanceCache.has(rig)){
    const reference=estimateSomaPose(rig,{time:0,speed:0,mode:'ground'})
    const shoulder=forwardPose(rig,reference).positions.RightArm
    const target={x:shoulder.x-.04,y:shoulder.y-.36,z:shoulder.z+.24}
    const valid=contactPose(rig,reference,['RightArm','RightForeArm','RightHand'],target,{x:-1,y:-.3,z:-.5},.03)
    stanceCache.set(rig,valid?Object.fromEntries(swordArmMask.map(id=>[id,reference.rotations[id]])):null)
  }
  const reference=stanceCache.get(rig);if(!reference)return false
  for(const id of swordArmMask)pose.rotations[id]=blend(pose.rotations[id],reference[id],Math.max(0,Math.min(1,weight)))
  return true
}
