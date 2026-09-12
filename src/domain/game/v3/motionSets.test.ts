import { motionNavigationPlan } from './motionNavigation.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUnified } from './recipes.ts'
import { makeMotionSet, motionSetRevision, motionSetRequirements, recipeForSet, reusableClip, validateMotionSet, motionCapability } from './motionSets.ts'
import { defaultMotionProfile, MOTION_SET_RUNTIME } from './motionProfile.ts'
import { fabricMannequin } from './mannequin.ts'
import { compile, runtimeDesign } from './compiler.ts'
import { applySwordStance, advanceEquipment } from './equipmentPose.ts'
import { estimateSomaPose, forwardPose } from './somaPose.ts'
import type { ClipRevision } from './animation.ts'

const fixture=()=>{const design=createUnified('exploration'),actor=design.nodes.find(n=>n.kind==='actor_definition')!;return {design,actor}}
test('prompt proposals select rig and capabilities without reserving or submitting work',async()=>{
  const {design,actor}=fixture(),rig=await fabricMannequin()
  const set=makeMotionSet(design,actor.id,rig.revision)
  assert.equal(set.profile.rig,'humanoid.fabric-ybot.v1')
  assert.equal(motionSetRequirements(set,[]).find(r=>r.state==='run')?.providers.find(p=>p.provider==='motionbricks')?.admissible,false)
  assert.throws(()=>recipeForSet(set,'run','motionbricks'))
  assert.equal(recipeForSet(set,'walk','motionbricks').version,2)
  assert.equal(motionCapability('motionbricks',{...defaultMotionProfile,style:'zombie'},'walk').admissible,false)
  assert.notEqual(await motionSetRevision(set),await motionSetRevision({...set,profile:{...set.profile,equipment:'one_handed_sword'}}))
})
test('component reuse requires matching style, rig and unconstrained state',async()=>{
  const {design,actor}=fixture(),rig=await fabricMannequin(),set=makeMotionSet(design,actor.id,rig.revision)
  const clip={id:crypto.randomUUID(),state:'walk',rigRevision:rig.revision,loop:true,naturalSpeed:1.5,validation:{accepted:true}} as ClipRevision
  assert.equal(reusableClip(set,'walk',[clip]),clip)
  assert.equal(reusableClip(set,'idle',[clip]),undefined)
  assert.equal(reusableClip(set,'walk',[{...clip,motionContract:'a'.repeat(64)}]),undefined)
  assert.equal(reusableClip(set,'walk',[{...clip,rigRevision:'b'.repeat(64)}]),undefined)
  assert.equal(reusableClip({...set,profile:{...set.profile,style:'injured'}},'walk',[clip]),undefined)
  assert(validateMotionSet(set,[clip]).some(f=>f.includes('run')))
  assert(validateMotionSet({...set,states:['walk']},[{...clip,loop:false}]).some(f=>f.includes('cycle')))
})
test('motion profile dispatch is additive and stripped from legacy controller actor',async()=>{
  const {design,actor}=fixture();assert.equal(actor.kind,'actor_definition');if(actor.kind!=='actor_definition')return
  actor.motionProfile={...defaultMotionProfile,equipment:'one_handed_sword'}
  const runtime=runtimeDesign(design)
  assert(!('motionProfile' in runtime.nodes.find(n=>n.kind==='actor')!))
  const manifest=await compile(design,{id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1})
  assert.equal(manifest.runtimeVersion,MOTION_SET_RUNTIME)
  assert.equal(manifest.design.nodes.find(n=>n.id===actor.id)?.kind,'actor_definition')
})
test('sword stance leaves root and legs unchanged on Fabric mannequin',async()=>{
  const rig=await fabricMannequin(),pose=estimateSomaPose(rig,{time:.3,speed:3,mode:'ground'}),before=structuredClone(pose)
  assert(applySwordStance(rig,pose,1))
  assert.deepEqual(pose.root,before.root)
  for(const side of ['Left','Right'])for(const joint of ['Leg','Shin','Foot'])assert.deepEqual(pose.rotations[side+joint],before.rotations[side+joint])
  assert.notDeepEqual(pose.rotations.RightArm,before.rotations.RightArm)
  for(const position of Object.values(forwardPose(rig,pose).positions))assert(Object.values(position).every(Number.isFinite))
})
test('equipment fades independently of frame rate and stows for two-hand traversal',()=>{
  const profile={...defaultMotionProfile,equipment:'one_handed_sword' as const}
  const idle={mode:'ground',fullBody:false,attached:false}
  let a={weight:0,stowed:false},b={...a}
  for(let i=0;i<60;i++)a=advanceEquipment(a,profile,idle,1/60)
  for(let i=0;i<120;i++)b=advanceEquipment(b,profile,idle,1/120)
  assert(Math.abs(a.weight-b.weight)<1e-8)
  const hang=advanceEquipment(a,profile,{...idle,mode:'hang'},1/60);assert(hang.stowed);assert(hang.weight<a.weight)
  const attack=advanceEquipment(a,profile,{...idle,fullBody:true},1/60);assert(!attack.stowed);assert(attack.weight<a.weight)
  const released=advanceEquipment(hang,profile,idle,1/60);assert(!released.stowed);assert(released.weight>hang.weight)
})

test('directional proposals keep facing independent and do not invent a running primitive',()=>{
  assert.deepEqual(motionNavigationPlan('strafe_left',defaultMotionProfile)?.movement,[0,1])
  assert.deepEqual(motionNavigationPlan('strafe_left',defaultMotionProfile)?.facing,[1,0])
  assert.equal(motionNavigationPlan('strafe_left',defaultMotionProfile)?.status,'experiment_required')
  assert.equal(motionNavigationPlan('run',defaultMotionProfile),null)
})
