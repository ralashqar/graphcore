import type { FlexibleGraph } from './flexible.ts'
import type { ClipRevision } from '../v3/animation.ts'
import { gaitPhaseOffset } from '../v3/motionSets.ts'

export type LocomotionClock={groups:Record<string,{phase:number;rate:number;synchronized:boolean}>;samples:Record<string,number>;support:Record<'left_foot'|'right_foot',number>;root:[number,number];weight:number;lockWeight:number}
export const emptyLocomotion=():LocomotionClock=>({groups:{},samples:{},support:{left_foot:0,right_foot:0},root:[0,0],weight:0,lockWeight:0})
export function advanceLocomotion(graph:FlexibleGraph,weights:Record<string,number>,parameters:Record<string,number|string|boolean>,previous:LocomotionClock|undefined,delta:number,clips:ClipRevision[]):LocomotionClock {
  const old=previous??emptyLocomotion(),next:LocomotionClock={...emptyLocomotion(),groups:{...old.groups},root:[...old.root]}
  const dt=Math.max(0,Math.min(.1,delta)),members=graph.nodes.flatMap(n=>{const clip=clips.find(c=>c.id===n.clipId),weight=weights[n.id]??0;return n.locomotion&&clip?.locomotion&&n.locomotion.gait===clip.locomotion.gait&&n.locomotion.direction.every((v,i)=>v===clip.locomotion!.direction[i])&&clip.loop&&clip.duration>0&&['left_foot','right_foot'].every(side=>clip.contacts.some(c=>c.effector===side&&c.end>c.start))?[{n,p:n.locomotion,clip,weight}]:[]})
  for(const group of new Set(members.map(m=>m.p.syncGroup))){
    const active=members.filter(m=>m.p.syncGroup===group&&m.weight>.0001),sum=active.reduce((s,m)=>s+m.weight,0)
    if(!sum)continue
    const cycle=active.reduce((s,m)=>s+m.clip.duration*m.weight,0)/sum
    const rates=active.map(m=>{const value=m.p.speedParameter?parameters[m.p.speedParameter]:undefined;const requested=typeof value==='number'?Math.max(0,value):null;return requested===0?0:requested!==null&&m.clip.naturalSpeed>.1?Math.max(m.p.minRate,Math.min(m.p.maxRate,requested/m.clip.naturalSpeed)):1})
    const low=Math.max(...active.map(m=>m.p.minRate/m.clip.duration)),high=Math.min(...active.map(m=>m.p.maxRate/m.clip.duration))
    const stopped=rates.every(r=>r===0),synchronized=low<=high
    const desired=active.reduce((s,m,i)=>s+rates[i]*m.weight/m.clip.duration,0)/sum
    const frequency=stopped?0:Math.max(low,Math.min(high,desired)),phase=(old.groups[group]?.phase??0)+dt*frequency
    next.groups[group]={phase,rate:synchronized?frequency*cycle:active.reduce((s,m,i)=>s+rates[i]*m.weight,0)/sum,synchronized}
    for(const m of members.filter(m=>m.p.syncGroup===group)){
      const index=active.indexOf(m),rate=synchronized?frequency*m.clip.duration:index<0?0:rates[index]
      const offset=gaitPhaseOffset(m.clip)
      const sample=synchronized?((phase+offset)%1+1)%1:((old.samples[m.n.id]??offset)+dt*rate/m.clip.duration)%1
      next.samples[m.n.id]=sample
      next.weight+=m.weight
      if(m.p.footLock&&synchronized)next.lockWeight+=m.weight
      next.root[0]+=dt*m.clip.naturalSpeed*rate*m.p.direction[0]*m.weight
      next.root[1]+=dt*m.clip.naturalSpeed*rate*m.p.direction[1]*m.weight
      for(const side of ['left_foot','right_foot']as const)if(m.p.footLock&&synchronized&&m.clip.contacts.some(c=>c.effector===side&&sample*m.clip.duration>=c.start&&sample*m.clip.duration<=c.end))next.support[side]+=m.weight
    }
  }
  return next
}
