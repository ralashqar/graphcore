import { contactPose, forwardPose, type Rig, type SkeletalPose } from '../v3/somaPose.ts'
import type { LocomotionClock } from './locomotionClock.ts'
type Point={x:number;y:number;z:number}
export type FootLocks={left_foot?:Point|null;right_foot?:Point|null}
export function lockLocomotionFeet(rig:Rig,pose:SkeletalPose,clock:LocomotionClock,locks:FootLocks,inPlace:boolean){
  const result={locked:[] as string[],released:[] as string[],maxCorrection:0,points:[] as Point[]}
  pose.root[0]=clock.root[0];pose.root[2]=clock.root[1]
  for(const [side,prefix]of [['left_foot','Left'],['right_foot','Right']]as const){
    if(clock.weight<.99||clock.lockWeight<.99||clock.support[side]<.55){delete locks[side];continue}
    const fk=forwardPose(rig,pose),foot=fk.positions[`${prefix}Foot`]
    if(!foot)continue
    if(locks[side]===undefined)locks[side]={...foot}
    const target=locks[side];if(!target)continue
    const correction=Math.hypot(target.x-foot.x,target.y-foot.y,target.z-foot.z)
    if(correction>.04||!contactPose(rig,pose,[`${prefix}Leg`,`${prefix}Shin`,`${prefix}Foot`],target,{x:0,y:0,z:1},.005)){locks[side]=null;result.released.push(side);continue}
    result.locked.push(side);result.maxCorrection=Math.max(result.maxCorrection,correction)
    result.points.push({x:target.x-(inPlace?clock.root[0]:0),y:target.y,z:target.z-(inPlace?clock.root[1]:0)})
  }
  if(inPlace){pose.root[0]=0;pose.root[2]=0}
  return result
}
