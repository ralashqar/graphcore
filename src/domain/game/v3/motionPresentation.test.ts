import test from 'node:test'
import assert from 'node:assert/strict'
import {dashStep,MOTION_PROFILE,MOTION_RUNTIME} from './motionPresentation.ts'
import {somaMannequin,humanoidMannequin} from './mannequin.ts'
import {estimateSomaPose,forwardPose,contactPose} from './somaPose.ts'
import {createUnified} from './recipes.ts'
import {actionRecipe} from './actionMechanics.ts'
import {UnifiedSimulation} from './simulation.ts'
import {compile} from './compiler.ts'
import {manifestSchema} from './spec.ts'
test('integrated dash eases in/out with exact distance for all bounded durations',()=>{
 for(const active of [6,15,36])for(const recovery of [6,15,48]){
  const samples=Array.from({length:active+recovery+2},(_,i)=>dashStep(i,active,recovery,3))
  assert(Math.abs(samples.reduce((a,b)=>a+b,0)-3)<1e-10)
  assert(samples.every(v=>v>=-1e-12));assert.equal(samples[0],0);assert.equal(samples.at(-1),0)
  assert(samples[1]<Math.max(...samples)*.6)
 }
})
test('new profile preserves physics ownership, distance, save and runtime dispatch',async()=>{
 const d=createUnified('exploration');d.mechanics={version:1,packages:[],surfaces:[],actions:[actionRecipe('dash','character.player')],motionProfile:MOTION_PROFILE}
 const manifest=await compile(d,{id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1})
 assert.equal(manifest.runtimeVersion,MOTION_RUNTIME)
 assert(!manifestSchema.safeParse({...manifest,runtimeVersion:'gameplay-3.3.0'}).success)
 const sim=await UnifiedSimulation.createUnified(d,manifest.id)
 try{for(let i=0;i<60;i++)sim.step({});const start={...sim.player.position},shield=sim.player.shieldUntil
  const speeds:number[]=[];sim.step({dash:true});for(let i=0;i<60;i++){const z=sim.player.position.z;sim.step({});speeds.push(Math.abs(sim.player.position.z-z))}
  assert(Math.abs(Math.hypot(sim.player.position.x-start.x,sim.player.position.z-start.z)-3)<.03)
  assert.equal(sim.player.shieldUntil,shield);assert(sim.canSave());sim.restore(sim.save())
  const peak=speeds.indexOf(Math.max(...speeds));assert(speeds.slice(peak+1).some(v=>v>0&&v<speeds[peak]*.5))
 }finally{sim.dispose()}
})
test('SOMA rest hierarchy is distinct and procedural poses keep every bone length',async()=>{
 const rig=await somaMannequin(),old=await humanoidMannequin();assert.equal(rig.joints.length,77);assert.notEqual(rig.revision,old.revision)
 const neutral=estimateSomaPose(rig,{time:0,speed:0,mode:'ground'}),fk=forwardPose(rig,neutral)
 assert(fk.positions.LeftHand.y<fk.positions.LeftArm.y-.35)
 assert(fk.positions.RightHand.y<fk.positions.RightArm.y-.35)
 for(const kind of ['strike','dash'])for(const index of [0,1,2])for(let frame=0;frame<40;frame++){
  const pose=estimateSomaPose(rig,{time:frame/60,speed:0,mode:'ground',action:{kind,index,seconds:frame/60,windup:.12,active:.15,recovery:.3}}),f=forwardPose(rig,pose)
  for(const j of rig.joints){assert(Object.values(f.positions[j.id]).every(Number.isFinite));assert(Math.abs(Math.hypot(...pose.rotations[j.id])-1)<1e-6)
   if(j.parent){const a=f.positions[j.id],b=f.positions[j.parent];assert(Math.abs(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)-Math.hypot(...j.translation))<1e-6)}
  }
 }
 const before=structuredClone(neutral);assert.equal(contactPose(rig,neutral,['LeftArm','LeftForeArm','LeftHand'],{x:100,y:2,z:0},{x:0,y:0,z:1}),false);assert.deepEqual(neutral,before)
})
