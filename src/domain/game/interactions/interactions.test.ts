import test from 'node:test'
import assert from 'node:assert/strict'
import { createCombatTemplate } from '../v2/template.ts'
import { validateDesign, affectedNodes } from '../v2/compiler.ts'
import { Simulation } from '../v2/simulation.ts'
import { interactionTemplate } from './template.ts'
import { contactPoseAt, anchorAt, quadrupedPose } from './poses.ts'
import { length, sub } from '../v2/pose.ts'
test('anchors rotate with target and quadruped limb lengths remain bounded',()=>{const nodes=interactionTemplate(),anchors=nodes.find(n=>n.id==='anchors.horse')!,body=nodes.find(n=>n.id==='body.horse')!;if(anchors.kind!=='anchor_set'||body.kind!=='body')throw new Error('Fixture');const p=anchorAt(anchors,'approach',{position:{x:3,y:0,z:4},yaw:Math.PI/2});assert(Math.abs(p.position.x-3)<1e-8);assert(Math.abs(p.position.z-5.55)<1e-8);const joints=quadrupedPose(body,{position:{x:0,y:0,z:0},yaw:1},1.2,2);for(const leg of ['frontLeft','frontRight','rearLeft','rearRight'])assert(Math.abs(length(sub(joints[leg+'Hip'],joints[leg+'Knee']))-body.legLength*.58)<1e-6)})
test('target loss releases occupied slot and restores walking',async()=>{const s=await setup('horse');try{s.step({interact:true});tick(s);s.interactions.state.entities['entity.horse'].enabled=false;s.step();assert(!s.interactions.owns(s.player.id));assert.deepEqual(s.interactions.state.entities['entity.horse'].occupants,{})}finally{s.dispose()}})
test('mounted rider clearance blocks a low beam even when the mount fits',async()=>{const s=await setup('horse');try{s.step({interact:true});tick(s);const target=s.interactions.state.entities['entity.horse'];s.physics.addProp('low.beam',{x:2,y:.2,z:.12},{x:target.position.x,y:2,z:target.position.z+1},0);s.physics.refresh();const initial=target.position.z;for(let i=0;i<180;i++)s.step({z:1});assert(target.position.z<initial+.9);assert.equal(target.speed,0)}finally{s.dispose()}})
test('interaction replay is deterministic',async()=>{const a=await setup('horse'),b=await setup('horse');try{for(let t=0;t<260;t++){const input=t===0?{interact:true}:t>120&&t<160?{z:1}:t===250?{drop:true}:{};a.step(input);b.step(input)}assert.deepEqual(a.state,b.state)}finally{a.dispose();b.dispose()}})
export const fixture = () => {
  const d = createCombatTemplate()
  d.nodes.push(...interactionTemplate())
  return d
}
async function setup(name = 'chair') {
  const s = await Simulation.create(fixture(), 'interaction-test')
  for (const a of s.state.actors)
    if (a.id !== s.player.id) {
      a.health = 0
      s.physics.sync(a.id, a.position, false)
    }
  const e = s.interactions.get(`entity.${name}`, 'interactive_entity'),
    i = s.interactions.get(e.interactions[0], 'interaction'),
    a = s.interactions.anchor(e, i.approach)
  s.player.position = { ...a.position }
  s.physics.sync(s.player.id, s.player.position)
  s.physics.refresh()
  return s
}
const tick = (s: Simulation, n = 100) => {
  for (let i = 0; i < n; i++) s.step()
}
test('interaction contracts validate and dependency edits invalidate consumers', () => {
  const d = fixture()
  assert.deepEqual(validateDesign(d), [])
  assert(affectedNodes(d, ['anchors.horse']).includes('entity.horse'))
  const i = d.nodes.find((n) => n.id === 'interaction.horse')!
  if (i.kind === 'interaction') i.phases.at(-1)!.op = 'contact'
  assert(validateDesign(d).some((e) => e.message.includes('exactly once')))
})
test('chair aligns, seats, checkpoints, and exits without walking controller drift', async () => {
  const s = await setup()
  try {
    s.step({ interact: true })
    tick(s)
    assert(
      s.interactions.state.sessions[s.player.id]?.attached,
      JSON.stringify(s.state.events),
    )
    const p = { ...s.player.position }
    for (let n = 0; n < 30; n++) s.step({ x: 1, ability: 'ability.bolt' })
    assert.deepEqual(s.player.position, p)
    const saved = s.save()
    s.step({ interact: true })
    assert(!s.interactions.owns(s.player.id))
    s.restore(saved)
    assert(s.interactions.owns(s.player.id))
    s.step({ drop: true })
    assert(!s.interactions.owns(s.player.id))
  } finally {
    s.dispose()
  }
})
test('slots reject another actor and cancellation releases the reservation', async () => {
  const s = await setup()
  try {
    s.interactions.request(s.player.id, 'entity.chair', 'interaction.chair')
    const npc = s.state.actors.find((a) => a.id !== s.player.id)!
    npc.health = 50
    npc.position = { ...s.player.position }
    assert(!s.interactions.request(npc.id, 'entity.chair', 'interaction.chair'))
    s.step({ cancel: true })
    assert.deepEqual(
      s.interactions.state.entities['entity.chair'].occupants,
      {},
    )
  } finally {
    s.dispose()
  }
})
test('moving target and damage interrupt mounting and release slots', async () => {
  for (const cause of ['move', 'damage']) {
    const s = await setup('horse')
    try {
      s.step({ interact: true })
      if (cause === 'move')
        s.interactions.state.entities['entity.horse'].position.x += 1
      else s.player.health--
      s.step()
      assert(!s.interactions.owns(s.player.id))
      assert.deepEqual(
        s.interactions.state.entities['entity.horse'].occupants,
        {},
      )
    } finally {
      s.dispose()
    }
  }
})
test('horse and vehicle transfer control, carry rider and brake before exit', async () => {
  for (const name of ['horse', 'car']) {
    const s = await setup(name)
    try {
      s.step({ interact: true })
      tick(s)
      assert(
        s.interactions.state.sessions[s.player.id]?.attached,
        JSON.stringify(s.state.events),
      )
      const old = s.interactions.state.entities[`entity.${name}`].position.z
      for (let i = 0; i < 60; i++) s.step({ z: 1 })
      assert(
        s.interactions.state.entities[`entity.${name}`].position.z > old + 0.2,
      )
      tick(s, 90)
      s.step({ drop: true })
      assert(!s.interactions.owns(s.player.id), JSON.stringify(s.state.events))
    } finally {
      s.dispose()
    }
  }
})
test('blocked exits retain attachment; invalid save cannot forge occupancy', async () => {
  const s = await setup()
  try {
    s.step({ interact: true })
    tick(s)
    const saved = s.save()
    for (const [i, x] of [-8.7, -5.3].entries())
      s.physics.addProp(
        `block${i}`,
        { x: 1, y: 3, z: 1 },
        { x, y: 0, z: -5 },
        0,
      )
    s.physics.refresh()
    s.step({ drop: true })
    assert(s.interactions.owns(s.player.id))
    const forged = structuredClone(saved)
    forged.interactions!.entities['entity.chair'].occupants = {}
    assert.throws(() => s.restore(forged), /Invalid attachment/)
    assert(s.interactions.owns(s.player.id))
  } finally {
    s.dispose()
  }
})
test('door lock prevents entry and hinge stops at an obstacle', async () => {
  const s = await setup('door')
  try {
    const m = s.interactions.get('mechanism.door', 'mechanism')
    m.locked = true
    s.step({ interact: true })
    assert(!s.interactions.owns(s.player.id))
    m.locked = false
    s.step({ interact: true })
    tick(s, 150)
    assert(
      s.interactions.state.entities['entity.door'].angle > 0.5,
      JSON.stringify(s.state.events),
    )
    s.physics.addProp(
      'obstacle',
      { x: 0.5, y: 2, z: 0.5 },
      { x: -6.4, y: 0, z: 0.5 },
      0,
    )
    s.physics.refresh()
    s.interactions.state.entities['entity.door'].goal = 0
    tick(s, 120)
    assert(s.interactions.state.entities['entity.door'].angle > 0.01)
  } finally {
    s.dispose()
  }
})
test('unreachable contacts fail before interaction and body limb lengths remain bounded', async () => {
  const s = await setup('horse')
  try {
    const a = s.interactions.get('anchors.horse', 'anchor_set')
    a.anchors.find((a) => a.id === 'hand.right')!.position.x = 10
    assert(
      !s.interactions.request(s.player.id, 'entity.horse', 'interaction.horse'),
    )
    const pose = s.interactions.get('contact.horse.settle', 'contact_pose')
    assert(
      contactPoseAt(pose, a, s.interactions.state.entities['entity.horse'])
        .errors.length > 0,
    )
  } finally {
    s.dispose()
  }
})
