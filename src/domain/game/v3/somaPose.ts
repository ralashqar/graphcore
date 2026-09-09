import type { z } from 'zod'
import type { rigProfileSchema } from './animation.ts'
import { solveLimb, sub, length } from '../v2/pose.ts'
import type { Vec } from '../v2/spec.ts'
export type Rig = z.infer<typeof rigProfileSchema>
export type Q = [number,number,number,number]
export type SkeletalPose = {rotations:Record<string,Q>; root:[number,number,number]}
const identity:Q=[0,0,0,1]
export function multiply(a:Q,b:Q):Q { const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z] }
const inverse=(q:Q):Q=>[-q[0],-q[1],-q[2],q[3]]
function rotated(v:Vec,q:Q):Vec {const r=multiply(multiply(q,[v.x,v.y,v.z,0]),inverse(q));return {x:r[0],y:r[1],z:r[2]}}
const vector=(v:readonly number[]):Vec=>({x:v[0],y:v[1],z:v[2]})
const axis=(x:number,y:number,z:number):Q=>multiply(multiply([Math.sin(x/2),0,0,Math.cos(x/2)],[0,Math.sin(y/2),0,Math.cos(y/2)]),[0,0,Math.sin(z/2),Math.cos(z/2)])
function align(a:Vec,b:Vec):Q {
 const al=length(a),bl=length(b);if(al<1e-8||bl<1e-8)return [...identity]
 const u={x:a.x/al,y:a.y/al,z:a.z/al},v={x:b.x/bl,y:b.y/bl,z:b.z/bl}
 const dot=u.x*v.x+u.y*v.y+u.z*v.z
 if(dot<-.999999){const p=Math.abs(u.x)<.8?{x:1,y:0,z:0}:{x:0,y:1,z:0};const c={x:u.y*p.z-u.z*p.y,y:u.z*p.x-u.x*p.z,z:u.x*p.y-u.y*p.x},l=length(c);return [c.x/l,c.y/l,c.z/l,0]}
 const q:Q=[u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x,1+dot],l=Math.hypot(...q);return q.map(v=>v/l) as Q
}
export function forwardPose(rig:Rig,pose:SkeletalPose) {
 const positions:Record<string,Vec>={},rotations:Record<string,Q>={}
 for(const j of rig.joints){const parent=j.parent?rotations[j.parent]:identity, offset=rotated(vector(j.translation),parent)
  positions[j.id]=j.parent?{x:positions[j.parent].x+offset.x,y:positions[j.parent].y+offset.y,z:positions[j.parent].z+offset.z}:vector(pose.root)
  rotations[j.id]=multiply(parent,pose.rotations[j.id]??j.rotation)
 }
 return {positions,rotations}
}
/** Rotational two-bone IK: never stretches a bone; rejects unreachable contacts. */
export function contactPose(rig:Rig,pose:SkeletalPose,chain:[string,string,string],target:Vec,pole:Vec,maximumCorrection=.12) {
 const fk=forwardPose(rig,pose),[upper,lower,end]=chain,a=length(sub(fk.positions[lower],fk.positions[upper])),b=length(sub(fk.positions[end],fk.positions[lower]))
 const direction=sub(target,fk.positions[upper]),d=length(direction)
 const cross={x:direction.y*pole.z-direction.z*pole.y,y:direction.z*pole.x-direction.x*pole.z,z:direction.x*pole.y-direction.y*pole.x}
 const stablePole=length(cross)<1e-5?(Math.abs(direction.x)<d*.8?{x:1,y:0,z:0}:{x:0,y:1,z:0}):pole
 const solved=solveLimb(fk.positions[upper],target,a,b,stablePole)
 if(length(sub(solved.end,target))>maximumCorrection)return false
 const originalUpper=pose.rotations[upper],originalLower=pose.rotations[lower]
 for(const [joint,child,desired] of [[upper,lower,solved.middle],[lower,end,solved.end]] as const){
  const current=forwardPose(rig,pose),j=rig.joints.find(j=>j.id===joint)!,parent=j.parent?current.rotations[j.parent]:identity
  const delta=align(sub(current.positions[child],current.positions[joint]),sub(desired,current.positions[joint]))
  pose.rotations[joint]=multiply(inverse(parent),multiply(delta,current.rotations[joint]))
 }
 if(length(sub(forwardPose(rig,pose).positions[end],target))>maximumCorrection){pose.rotations[upper]=originalUpper;pose.rotations[lower]=originalLower;return false}
 return true
}
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)}
export type PoseIntent={time:number;speed:number;mode:string;action?:{kind:string;index:number;seconds:number;windup:number;active:number;recovery:number}}
/** Authored milestone approximation. Gameplay timing is an input, never an output. */
export function estimateSomaPose(rig:Rig,intent:PoseIntent):SkeletalPose {
 const root=rig.joints[0].translation.slice() as [number,number,number]
 const rotations=Object.fromEntries(rig.joints.map(j=>[j.id,[...j.rotation] as Q]))
 const pose={rotations,root},set=(id:string,x=0,y=0,z=0)=>{rotations[id]=axis(x,y,z)}
 // Rest remains T-pose; neutral idle is a separate relaxed, slightly bent pose.
 const breath=.006*Math.sin(intent.time*2.1)
 set('LeftArm',0,-.1,-1.28);set('RightArm',0,.1,1.28)
 set('LeftForeArm',0,-.18);set('RightForeArm',0,.18)
 set('Chest',breath);set('Head',-breath*.5)
 const gait=intent.time*7,amplitude=Math.min(.55,intent.speed*.12)
 for(const [side,sign] of [['Left',1],['Right',-1]] as const){
  set(`${side}Leg`,Math.sin(gait)*amplitude*sign)
  set(`${side}Shin`,Math.max(0,-Math.sin(gait)*sign)*amplitude)
 }
 const a=intent.action
 if(a){
  const wind=ease(a.seconds/a.windup),strike=ease((a.seconds-a.windup)/a.active),release=ease((a.seconds-a.windup-a.active)/a.recovery)
  const weight=wind*(1-release)
  if(a.kind==='dash'){
   root[1]-=.09*weight;set('Spine2',.25*weight);set('Chest',.16*weight);set('Head',-.2*weight)
   set('LeftArm',-.5*weight,0,-1.28);set('RightArm',-.5*weight,0,1.28)
   set('LeftLeg',-.3*weight);set('LeftShin',.5*weight);set('RightLeg',.25*weight);set('RightShin',.25*weight)
  }else if(a.kind==='roll'){
   root[1]-=.35*weight;set('Hips',Math.PI*2*ease(a.seconds/(a.windup+a.active)));set('Spine2',.5*weight)
   for(const side of ['Left','Right']){set(`${side}Leg`,-1.1*weight);set(`${side}Shin`,1.8*weight)}
  }else if(a.kind==='shield'||a.kind==='bolt'){
   for(const side of a.kind==='shield'?['Left','Right']:['Right']){
    const s=side==='Left'?1:-1,fk=forwardPose(rig,pose),hand=fk.positions[`${side}Hand`]
    contactPose(rig,pose,[`${side}Arm`,`${side}ForeArm`,`${side}Hand`],{x:hand.x+(s*.2-hand.x)*weight,y:hand.y+(1.35-hand.y)*weight,z:hand.z+(.4-hand.z)*weight},{x:s,y:0,z:-1},.12)
   }
  }else{
   const sign=a.index===1?-1:1,turn=sign*(-.32*wind+.95*strike)*(1-release)
   set('Hips',0,turn*.22);set('Spine2',.04*weight,turn*.35);set('Chest',.08*weight,turn*.5);set('Head',0,-turn*.4)
   root[1]-=.035*weight
   const side=a.index===1?'Left':'Right',s=side==='Left'?1:-1
   const target={x:s*(.32-.4*strike),y:1.3+(a.index===2?.25*(1-strike):0),z:.13+.48*Math.sin(strike*Math.PI*.85)}
   const fk=forwardPose(rig,pose),hand=fk.positions[`${side}Hand`]
   contactPose(rig,pose,[`${side}Arm`,`${side}ForeArm`,`${side}Hand`],{x:hand.x+(target.x-hand.x)*weight,y:hand.y+(target.y-hand.y)*weight,z:hand.z+(target.z-hand.z)*weight},{x:s,y:-.4,z:-.5},.15)
  }
 }
 if(intent.mode==='air') {set('LeftLeg',-.35);set('RightLeg',.25);set('LeftShin',.65);set('RightShin',.4);set('LeftArm',0,-.15,-.95);set('RightArm',0,.15,.95)}
 if(intent.mode==='hang'||intent.mode==='climb')for(const side of ['Left','Right']){
  const sign=side==='Left'?1:-1
  contactPose(rig,pose,[`${side}Arm`,`${side}ForeArm`,`${side}Hand`],{x:sign*.22,y:1.83,z:.3},{x:sign,y:0,z:-1},.12)
  set(`${side}Leg`,-.2);set(`${side}Shin`,.4)
 }
 // Plant feet while stationary/actions on the ground; retain source bone lengths.
 if(intent.mode==='ground'&&(intent.speed<.1||a)&&a?.kind!=='roll')for(const side of ['Left','Right']){
  const rest=forwardPose(rig,{rotations:Object.fromEntries(rig.joints.map(j=>[j.id,j.rotation])),root:rig.joints[0].translation}).positions[`${side}Foot`]
  contactPose(rig,pose,[`${side}Leg`,`${side}Shin`,`${side}Foot`],rest,{x:0,y:0,z:1},.12)
  pose.rotations[`${side}Foot`]=inverse(forwardPose(rig,pose).rotations[`${side}Shin`])
 }
 return pose
}
