import { acceptTraversalComponents } from './traversalAcceptance.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createUnified } from './recipes.ts'
import { of } from './spec.ts'
import { UnifiedSimulation } from './simulation.ts'
import { compile,validate } from './compiler.ts'
import { defaultMotionProfile } from './motionProfile.ts'
export function vaultFixture(){
  const design=createUnified('exploration'),instance=of(design,'actor_instance').find(a=>a.id===design.player)!
  instance.position={x:8,y:0,z:7};of(design,'actor_definition').find(a=>a.id===instance.definition)!.motionProfile={...defaultMotionProfile,equipment:'one_handed_sword'}
  of(design,'world')[0].boxes=[{id:'vault.box',position:{x:8,y:.4,z:8},size:{x:2,y:.8,z:.5},ramp:false}]
  of(design,'world')[0].ledges=[]
  design.mechanics={version:1,packages:[],surfaces:[],traversal:[{version:1,id:'vault.low',kind:'low_vault',actorDefinition:instance.definition,collider:'vault.box',profile:'vault-0.8x0.5-v1'}]}
  return design
}
test('low vault uses collision-authoritative route, returns to walking and save/load',async()=>{
  const d=vaultFixture();assert.deepEqual(validate(d),[])
  const sim=await UnifiedSimulation.createUnified(d,'vault-test')
  try{
    sim.player.position={x:8,y:0,z:7.2};sim.player.yaw=0
    sim.step({interact:true});assert(sim.vaultController.active(sim.player.id));assert(!sim.canSave())
    for(let i=0;i<60;i++)sim.step({z:1})
    assert(sim.player.position.z>8.65);assert.equal(sim.player.mode,'ground');assert(sim.state.events.some(e=>e.type==='vault_completed'))
    const saved=sim.save();sim.step({z:1});sim.restore(saved);assert.deepEqual(sim.player.position,saved.actors.find(a=>a.id===saved.player)!.position)
  }finally{sim.dispose()}
})
test('overhead obstruction prevents admission without teleporting',async()=>{
  const d=vaultFixture();of(d,'world')[0].boxes.push({id:'roof',position:{x:8,y:2.2,z:8},size:{x:3,y:.2,z:3},ramp:false})
  const sim=await UnifiedSimulation.createUnified(d,'vault-roof')
  try{sim.player.position={x:8,y:0,z:7.2};sim.player.yaw=0;const before={...sim.player.position};sim.step({interact:true});assert(!sim.vaultController.active(sim.player.id));assert(Math.abs(sim.player.position.z-before.z)<.01);assert(sim.state.events.some(e=>e.type==='vault_blocked'))}finally{sim.dispose()}
})
test('cancel drops from current position; no stale traversal survives',async()=>{
  const sim=await UnifiedSimulation.createUnified(vaultFixture(),'vault-drop')
  try{sim.player.position={x:8,y:0,z:7.2};sim.player.yaw=0;sim.step({interact:true});for(let i=0;i<10;i++)sim.step();const before={...sim.player.position};sim.step({drop:true});assert(!sim.vaultController.active(sim.player.id));assert(Math.abs(sim.player.position.z-before.z)<.01);assert(sim.state.events.some(e=>e.type==='vault_cancelled'))}finally{sim.dispose()}
})
test('noncanonical obstacle dimensions cannot compile as supported low vault',async()=>{
  const d=vaultFixture();of(d,'world')[0].boxes[0].size.y=1.2
  await assert.rejects(()=>compile(d,{id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1}),/0.8m/)
})


test('build gate exercises each placed authored vault',async()=>{
  const reports=await acceptTraversalComponents(vaultFixture(),'vault-gate')
  assert.equal(reports.length,1);assert(reports.every(r=>r.passed),JSON.stringify(reports))
})

test('NPC vault is rejected before build admission',async()=>{
  const d=vaultFixture(),player=of(d,'actor_instance').find(i=>i.id===d.player)!
  const other=of(d,'actor_definition').find(a=>a.id!==player.definition)!
  assert(other);d.mechanics!.traversal![0].actorDefinition=other.id
  await assert.rejects(()=>compile(d,{id:crypto.randomUUID(),projectId:crypto.randomUUID(),draftId:crypto.randomUUID(),sourceRevision:1}),/player controller only/)
})
