import test from 'node:test'
import assert from 'node:assert/strict'
import { blankGraph,clipNode,freezeFlexible,flexibleProblems } from './flexible.ts'
import { defaultLocomotion,processingProfile } from './locomotionProfile.ts'
import { advanceLocomotion } from './locomotionClock.ts'
import { reusableLocomotionSource } from './sourceReuse.ts'
import { flexibleRecipe } from './flexibleRecipes.ts'
import type { ClipRevision } from '../v3/animation.ts'
const graph=()=>{const g=blankGraph();g.nodes=['walk','run'].map(id=>({...clipNode(id),loop:true,locomotion:defaultLocomotion(),clipId:id}));g.entry='walk';return g}
const clip=(id:string,duration:number)=>({id,state:'custom',duration,loop:true,naturalSpeed:1,locomotion:processingProfile(defaultLocomotion()),contacts:[{effector:'left_foot',start:duration*.1,end:duration*.4},{effector:'right_foot',start:duration*.6,end:duration*.9}]} as ClipRevision)
test('shared phase aligns touchdown and bounds actual per-clip rates',()=>{
 const g=graph(),clips=[clip('walk',1),clip('run',.5)];const s=advanceLocomotion(g,{walk:.5,run:.5},{},undefined,.1,clips)
 assert.equal(s.groups.locomotion.synchronized,true);assert.equal(s.samples.walk,s.samples.run)
 const frequency=s.groups.locomotion.phase/.1
 for(const c of clips)assert.ok(frequency*c.duration>=.5-1e-9&&frequency*c.duration<=1.5+1e-9)
 assert.ok(Math.abs(s.root[1]-.1*frequency*.75)<1e-8)
 const next=advanceLocomotion(g,{run:1},{},s,.1,clips);assert.ok(next.groups.locomotion.phase>s.groups.locomotion.phase)
})
test('incompatible cycle rates fall back independently with locks disabled',()=>{
 const s=advanceLocomotion(graph(),{walk:.5,run:.5},{},undefined,.1,[clip('walk',2),clip('run',.2)])
 assert.equal(s.groups.locomotion.synchronized,false);assert.equal(s.lockWeight,0)
 assert.ok(Math.abs(s.samples.walk-.15)<1e-8);assert.ok(Math.abs(s.samples.run-.6)<1e-8)
})
test('stopped speed parameter freezes phase and displacement',()=>{
 const g=graph();g.nodes[0].locomotion!.speedParameter='speed'
 const s=advanceLocomotion(g,{walk:1},{speed:0},undefined,.1,[clip('walk',1)])
 assert.equal(s.groups.locomotion.rate,0);assert.deepEqual(s.root,[0,0])
})
test('processing changes invalidate clips; runtime tuning preserves them',async()=>{
 const draft=graph();draft.nodes.forEach(n=>n.clipId=null);let g=await freezeFlexible(draft);g.nodes[0].clipId=crypto.randomUUID();const accepted=g.nodes[0].clipId
 g.nodes[0].locomotion!.footLock=false;g.nodes[0].locomotion!.syncGroup='other';g=await freezeFlexible(g);assert.equal(g.nodes[0].clipId,accepted)
 g.nodes[0].locomotion!.gait='run';g=await freezeFlexible(g);assert.equal(g.nodes[0].clipId,null)
 assert.equal((await flexibleRecipe(g,'walk')).recipe.locomotion?.gait,'run')
})
test('saved source reuse rejects changed intent and allows only processing edits',async()=>{
 const a=graph(),b=structuredClone(a);a.nodes[0].locomotion=undefined;a.nodes[0].loop=false
 assert.equal(await reusableLocomotionSource(a,b,'walk'),true)
 b.nodes[0].description='A new dance';assert.equal(await reusableLocomotionSource(a,b,'walk'),false)
 b.nodes[0].description=a.nodes[0].description;b.nodes[0].rootMode='anchor_relative';assert.equal(await reusableLocomotionSource(a,b,'walk'),false)
})
test('nonloop and anchored locomotion profiles are rejected',()=>{
 const g=graph();g.nodes[0].loop=false;assert.ok(flexibleProblems(g).length)
})

import { fabricMannequin } from '../v3/mannequin.ts'
import { forwardPose, type SkeletalPose } from '../v3/somaPose.ts'
import { lockLocomotionFeet, type FootLocks } from './footLock.ts'
import { emptyLocomotion } from './locomotionClock.ts'
test('foot locks bound correction, preserve bone lengths and release excessive targets',async()=>{
 const rig=await fabricMannequin(),pose:SkeletalPose={root:[0,1,0],rotations:Object.fromEntries(rig.joints.map(j=>[j.id,[...j.rotation]]))}
 const clock={...emptyLocomotion(),weight:1,lockWeight:1,support:{left_foot:1,right_foot:0}},locks:FootLocks={}
 const before=forwardPose(rig,pose);lockLocomotionFeet(rig,pose,clock,locks,true)
 if(locks.left_foot){locks.left_foot.z+=.01;const result=lockLocomotionFeet(rig,pose,clock,locks,true);assert.ok(result.maxCorrection<=.04)}
 const after=forwardPose(rig,pose)
 for(const joint of rig.joints.filter(j=>j.parent)){const distance=(positions:typeof before.positions)=>Math.hypot(positions[joint.id].x-positions[joint.parent!].x,positions[joint.id].y-positions[joint.parent!].y,positions[joint.id].z-positions[joint.parent!].z);assert.ok(Math.abs(distance(before.positions)-distance(after.positions))<1e-8)}
 locks.left_foot={...after.positions.LeftFoot,z:after.positions.LeftFoot.z+1};assert.deepEqual(lockLocomotionFeet(rig,pose,clock,locks,true).released,['left_foot']);assert.equal(locks.left_foot,null)
 lockLocomotionFeet(rig,pose,{...clock,support:{left_foot:0,right_foot:0}},locks,true);assert.equal(locks.left_foot,undefined)
})

test('changed processing direction does not reuse stale contact playback',()=>{
 const g=graph();g.nodes[0].locomotion!.direction=[1,0]
 const s=advanceLocomotion(g,{walk:1},{},undefined,.1,[clip('walk',1)])
 assert.equal(s.weight,0);assert.equal(s.samples.walk,undefined)
})

import { z } from 'zod'
import { graphEditPromptSchema,parsePromptEdit } from './flexible.ts'
test('strict prompt schema requires explicit nullable profile without changing stored legacy nodes',()=>{
 const schema=z.toJSONSchema(graphEditPromptSchema) as any
 const node=schema.properties.nodes.properties.upsert.items
 assert.ok(node.required.includes('locomotion'))
 const edit=graphEditPromptSchema.parse({summary:'Disable processing',nodes:{upsert:[{...clipNode('walk'),locomotion:null}],remove:[]},transitions:{upsert:[],remove:[]},styles:{upsert:[],remove:[]},parameters:{upsert:[],remove:[]},events:{upsert:[],remove:[]},props:{upsert:[],remove:[]},anchors:{upsert:[],remove:[]},dependencies:null,name:null,entry:null,changeEntry:false,gaps:null})
 assert.equal(parsePromptEdit(edit).nodes.upsert[0].locomotion,undefined)
})
