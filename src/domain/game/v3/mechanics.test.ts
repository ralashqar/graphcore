import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyMechanicState,
  mechanicPackageSchema,
  mechanicRecipe,
} from './mechanics.ts'
import { createUnified } from './recipes.ts'
import { UnifiedSimulation } from './simulation.ts'
import { of } from './spec.ts'
import { compile } from './compiler.ts'
import { assertMechanicReplacement } from './mechanicLive.ts'
import { wallContactPose } from './mechanicPose.ts'
import { add, length, poseAt, rotate, sub } from '../v2/pose.ts'
import { queryMechanicSurfaces } from './mechanicSurfaces.ts'
import { runtimeDesign } from './compiler.ts'
import { mergeScopedMechanics } from './mechanicCommands.ts'

export function mechanicFixture(
  capability: 'wall_run' | 'wall_slide' | 'wall_jump' = 'wall_run',
) {
  const d = createUnified('exploration'),
    actor = of(d, 'actor_instance').find((a) => a.id === d.player)!
  of(d, 'world')[0].boxes.push({
    id: 'test.wall',
    position: { x: 1, y: 3, z: 0 },
    size: { x: 1, y: 6, z: 12 },
    ramp: false,
  })
  d.mechanics = {
    version: 1,
    packages: [mechanicRecipe(capability, actor.definition)],
    surfaces: [{
      id: 'surface.wall',
      collider: 'test.wall',
      face: 'x-',
      capabilities: [capability],
    }],
  }
  return d
}
test('packages validate composition and versioned manifest dispatch', async () => {
  const p = mechanicRecipe('wall_run', 'actor.player')
  assert(
    !mechanicPackageSchema.safeParse({
      ...p,
      primitives: p.primitives.map(() => p.primitives[0]),
    }).success,
  )
  const d = mechanicFixture(),
    m = await compile(d, {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      draftId: crypto.randomUUID(),
      sourceRevision: 1,
    })
  assert.equal(m.runtimeVersion, 'gameplay-3.2.0')
})

test('scoped composition cannot overwrite sibling mechanics or redirect their surfaces',()=>{
 const own=mechanicRecipe('wall_run','character.player'),other=mechanicRecipe('wall_slide','character.other')
 const current={version:1 as const,packages:[other],surfaces:[{id:'surface.shared',collider:'wall',face:'x-' as const,capabilities:['wall_slide' as const]}]}
 assert.throws(()=>mergeScopedMechanics(current,'character.player',[{...own,id:other.id}],[]),/scope/)
 assert.throws(()=>mergeScopedMechanics(current,'character.player',[own],[{...current.surfaces[0],collider:'another'}]),/redirected/)
 const merged=mergeScopedMechanics(current,'character.player',[own],[{...current.surfaces[0],capabilities:['wall_run']}])
 assert.deepEqual(merged.packages[0],other)
 assert.deepEqual(merged.surfaces[0].capabilities,['wall_slide','wall_run'])
})

test('combined traversal uses the bound wall-jump impulse and cooldown',async()=>{
 const d=mechanicFixture(),jump=mechanicRecipe('wall_jump','character.player')
 const impulse=jump.primitives.find(p=>p.op==='exit_impulse')!
 if(impulse.op==='exit_impulse')impulse.outward=7
 jump.cooldown=1
 d.mechanics!.packages.push(jump);d.mechanics!.surfaces[0].capabilities.push('wall_jump')
 const sim=await UnifiedSimulation.createUnified(d,'combined')
 try{
  sim.player.position={x:.1,y:1,z:0};sim.player.mode='air'
  sim.mechanicStates[sim.player.id]=emptyMechanicState({x:.1,y:1,z:-5/60})
  sim.step({traverse:true});sim.step({traverse:true,jump:true})
  assert.equal(sim.mechanicStates[sim.player.id].velocity.x,-7)
  assert.equal(sim.mechanicStates[sim.player.id].cooldown,1)
 }finally{sim.dispose()}
})
for (const capability of ['wall_run', 'wall_slide', 'wall_jump'] as const) {
  test(`${capability} uses shared motor and releases safely`, async () => {
    const sim = await UnifiedSimulation.createUnified(
      mechanicFixture(capability),
      'mechanic-test',
    )
    try {
      const a = sim.player
      a.position = { x: .1, y: 1, z: 0 }
      a.mode = 'air'
      a.vy = 0
      sim.mechanicStates[a.id] = emptyMechanicState({ x: .1, y: 1, z: -5 / 60 })
      sim.step({ traverse: true, jump: capability === 'wall_jump' })
      const state = sim.mechanicStates[a.id]
      assert.equal(
        state.phase,
        capability === 'wall_jump' ? 'departing' : 'attached',
      )
      assert.equal(a.shieldUntil, 0)
      for (let i = 0; i < 12; i++) sim.step({ traverse: true })
      assert(a.position.x < .21, 'Character must remain outside wall')
      sim.step({ drop: true })
      assert.notEqual(state.phase, 'attached')
      for (let i = 0; i < 240; i++) sim.step()
      assert.equal(a.mode, 'ground')
      assert.equal(state.jumps, 0)
    } finally {
      sim.dispose()
    }
  })
}
test('unapproved surface and exclusive action prevent traversal', async () => {
  const d = mechanicFixture()
  d.mechanics!.surfaces = []
  const sim = await UnifiedSimulation.createUnified(d, 'denied')
  try {
    sim.player.position = { x: .1, y: 1, z: 0 }
    sim.player.mode = 'air'
    sim.step({ traverse: true })
    assert.equal(sim.mechanicStates[sim.player.id].phase, 'inactive')
  } finally {
    sim.dispose()
  }
})

test('contact solver preserves bone lengths and holds stance anchors in world space', () => {
  const d = mechanicFixture(),
    world = of(d, 'world')[0],
    position = { x: .1, y: 1, z: 0 }
  const surface =
    queryMechanicSurfaces(world, d.mechanics!.surfaces, position, .3, 1.8)[0]
  const base = (z: number) =>
    Object.fromEntries(
      Object.entries(poseAt(runtimeDesign(d), null, 0, 1.8)).map((
        [k, p],
      ) => [k, add({ ...position, z }, rotate(p, 0))]),
    )
  const contacts = emptyMechanicState(position).contacts
  const first = wallContactPose(base(0), surface, 0, 1.8, true, .1, contacts)
  const second = wallContactPose(
    base(.1),
    surface,
    .02,
    1.8,
    true,
    .1,
    contacts,
  )
  assert.deepEqual(first.errors, [])
  assert.deepEqual(second.errors, [])
  assert(length(sub(first.joints.leftFoot, second.joints.leftFoot)) < 1e-9)
  for (const side of ['left', 'right']) {
    for (
      const [a, b, expected] of [['Hip', 'Knee', .42], ['Knee', 'Foot', .42], [
        'Shoulder',
        'Elbow',
        .34,
      ], ['Elbow', 'Hand', .34]] as const
    ) {
      assert(
        Math.abs(
          length(sub(second.joints[side + a], second.joints[side + b])) -
            expected,
        ) < 1e-5,
      )
    }
  }
  const far = wallContactPose(base(5), surface, .03, 1.8, true, .01, contacts)
  assert(far.errors.length > 0, 'Unreachable held anchor must be rejected')
})

test('live replacement preserves state and rejects geometry, rig and project changes', async () => {
  const d = mechanicFixture(),
    identity = {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      draftId: crypto.randomUUID(),
      sourceRevision: 1,
    }
  const current = await compile(d, identity), nextDesign = structuredClone(d)
  nextDesign.mechanics!.packages[0].duration = 1
  const next = await compile(nextDesign, {
    ...identity,
    id: crypto.randomUUID(),
    sourceRevision: 2,
  })
  await assertMechanicReplacement(current, next)
  const without=structuredClone(d)
  delete without.mechanics
  const baseline=await compile(without,{...identity,id:crypto.randomUUID()})
  await assertMechanicReplacement(baseline,current)
  await assertMechanicReplacement(current,baseline)
  const changed = structuredClone(next)
  of(changed.design, 'world')[0].boxes[0].size.x += 1
  await assert.rejects(
    () => assertMechanicReplacement(current, changed),
    /Geometry/,
  )
  await assert.rejects(
    () =>
      assertMechanicReplacement(current, {
        ...next,
        projectId: crypto.randomUUID(),
      }),
    /identity/,
  )
  const sim = await UnifiedSimulation.createUnified(d, current.id)
  try {
    for (let i = 0; i < 3; i++) sim.step()
    const before = structuredClone(sim.state)
    sim.applyMechanics(next.design, next.id)
    assert.deepEqual(sim.state, { ...before, buildId: next.id })
    sim.player.mode = 'air'
    assert.throws(() => sim.applyMechanics(d, current.id), /grounded/)
    assert.equal(sim.state.buildId, next.id)
  } finally {
    sim.dispose()
  }
})

test('traversal resolves movement once per tick and exhaustion ends attachment', async () => {
  const sim = await UnifiedSimulation.createUnified(
    mechanicFixture(),
    'motor-count',
  )
  try {
    const a = sim.player
    a.position = { x: .1, y: 1, z: 0 }
    a.mode = 'air'
    a.stamina = .01
    sim.mechanicStates[a.id] = emptyMechanicState({ x: .1, y: 1, z: -5 / 60 })
    let count = 0
    const move = sim.physics.move.bind(sim.physics)
    sim.physics.move = (...args) => {
      if (args[0] === a.id) count++
      return move(...args)
    }
    sim.step({ traverse: true })
    assert.equal(count, 1)
    count = 0
    sim.step({ traverse: true })
    assert.equal(count, 1)
    assert.equal(sim.mechanicStates[a.id].phase, 'departing')
  } finally {
    sim.dispose()
  }
})
