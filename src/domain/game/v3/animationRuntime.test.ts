import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locomotionWeights, advanceAnimationBlend, emptyAnimationBlend, advanceActionClipClock } from './animationMixer.ts'
import { createCombatTemplate } from '../v2/template.ts'
import { nodesOf } from '../v2/spec.ts'
import { Simulation } from '../v2/simulation.ts'
import { createUnified } from './recipes.ts'
import { compile } from './compiler.ts'
import { manifestSchema, ANIMATED_VERSION } from './spec.ts'
import { humanoidMannequin } from './mannequin.ts'

test('published animations require frozen compatible rigs, actors and clips', async () => {
  const base = await compile(createUnified('exploration'), { id: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222', draftId: '33333333-3333-4333-8333-333333333333', sourceRevision: 1 })
  const rig = await humanoidMannequin()
  const actor = base.design.nodes.find(n => n.kind === 'actor_definition')!
  const graph = { version: 1, id: 'player.animations', actorDefinition: actor.id, rigRevision: rig.revision, bindings: [], transitions: [] }
  const animations = { version: 1, rigs: [rig], graphs: [graph] }
  assert(manifestSchema.safeParse(base).success)
  assert(manifestSchema.safeParse({ ...base, runtimeVersion: ANIMATED_VERSION, animations }).success)
  assert(!manifestSchema.safeParse({ ...base, animations }).success)
  for (const graphs of [[{ ...graph, actorDefinition: 'missing' }], [{ ...graph, rigRevision: 'a'.repeat(64) }], [graph, graph], [{ ...graph, bindings: [{ state: 'idle', clipRevision: base.id }] }]]) {
    assert(!manifestSchema.safeParse({ ...base, runtimeVersion: ANIMATED_VERSION, animations: { ...animations, graphs } }).success)
  }
})

test('directional locomotion weights are normalized and distinguish strafes/backward', () => {
  for (const [x,z] of [[0,0],[1,1],[-1,0],[0,-1],[0,4],[.1,0]]) assert(Math.abs(Object.values(locomotionWeights(x,z)).reduce((a,b)=>a+b,0)-1)<1e-9)
  assert.equal(locomotionWeights(-1,0).strafe_left, 1)
  assert.equal(locomotionWeights(0,-1).backward, 1)
  assert.equal(locomotionWeights(0,4).run, 1)
  assert.throws(()=>locomotionWeights(NaN,0))
})

test('graph transitions crossfade and preserve the current mixture when interrupted', () => {
  const transitions = [{ from: 'idle', to: 'walk', event: 'movement', blendSeconds: .2 }, { from: 'walk', to: 'roll', event: 'roll', blendSeconds: .1 }] as const
  let blend = advanceAnimationBlend(emptyAnimationBlend(), { idle: 1 }, [...transitions], 0)
  blend = advanceAnimationBlend(blend, { walk: 1 }, [...transitions], .1)
  assert.equal(blend.weights.idle, .5)
  assert.equal(blend.weights.walk, .5)
  blend = advanceAnimationBlend(blend, { roll: 1 }, [...transitions], .05)
  assert.equal(blend.weights.idle, .25)
  assert.equal(blend.weights.walk, .25)
  assert.equal(blend.weights.roll, .5)
  blend = advanceAnimationBlend(blend, { roll: 1 }, [...transitions], .05)
  assert.deepEqual(blend.weights, { roll: 1 })
  assert.throws(() => advanceAnimationBlend(blend, { walk: NaN }, [], 0))
})
test('interrupted action clips retain their outgoing pose time',()=>{
 let clock=advanceActionClipClock({active:null,times:{}},'roll',0)
 clock=advanceActionClipClock(clock,'roll',.2)
 clock=advanceActionClipClock(clock,null,.016)
 assert.equal(clock.times.roll,.2)
 clock=advanceActionClipClock(clock,'takeoff',.016)
 assert.equal(clock.times.roll,.2);assert.equal(clock.times.takeoff,0)
 clock=advanceActionClipClock(clock,'roll',.016);assert.equal(clock.times.roll,0)
})
test('roll displacement is bounded and does not grant dodge protection', async () => {
  const design = createCombatTemplate(), roll = nodesOf(design,'ability').find(a=>a.op==='dodge')!
  roll.op='roll'
  const sim = await Simulation.create(design,'roll-test')
  try {
    const start={...sim.player.position}
    assert(sim.activate(sim.player,roll.id,{}))
    for(let i=0;i<120;i++) { sim.step(); assert.equal(sim.player.shieldUntil,0) }
    assert.equal(sim.player.action,null)
    assert(Math.hypot(sim.player.position.x-start.x,sim.player.position.z-start.z)<=roll.distance+.01)
  } finally { sim.dispose() }
})
test('strafe input preserves facing while moving laterally', async () => {
  const sim=await Simulation.create(createCombatTemplate(),'strafe-test')
  try {
    const yaw=sim.player.yaw, x=sim.player.position.x
    for(let i=0;i<30;i++)sim.step({x:1,strafe:true})
    assert.equal(sim.player.yaw,yaw)
    assert(sim.player.position.x>x)
  }finally{sim.dispose()}
})
