import { acceptActions } from './actionAcceptance.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createUnified } from './recipes.ts'
import { UnifiedSimulation } from './simulation.ts'
import { actionPackageSchema, actionRecipe } from './actionMechanics.ts'
import { compile, validate } from './compiler.ts'
import { assertMechanicReplacement } from './mechanicLive.ts'
import { of } from './spec.ts'
import { mergeScopedMechanics } from './mechanicCommands.ts'

export function actionFixture() {
  const d = createUnified('exploration')
  d.mechanics = {
    version: 1,
    packages: [],
    surfaces: [],
    actions: [
      actionRecipe('combo', 'character.player'),
      actionRecipe('dash', 'character.player'),
    ],
  }
  return d
}
const settle = (sim: UnifiedSimulation, count = 120) => {
  for (let i = 0; i < count; i++) sim.step({})
}
const stages = (sim: UnifiedSimulation) =>
  sim.state.events.filter((e) => e.type === 'action_stage').map((e) => e.detail)
test('action contracts reject unbounded recipes and other actors; stable live runtime dispatch', async () => {
  const d = actionFixture()
  assert.deepEqual(validate(d), [])
  assert(
    !actionPackageSchema.safeParse({
      ...d.mechanics!.actions![1],
      distance: 100,
    }).success,
  )
  assert.throws(
    () =>
      mergeScopedMechanics(
        d.mechanics,
        'character.other',
        [],
        [],
        d.mechanics!.actions,
      ),
    /scope/,
  )
  const identity = {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
    sourceRevision: 1,
  }
  const before = await compile(d, identity)
  assert.equal(before.runtimeVersion, 'gameplay-3.3.0')
  const next = structuredClone(d)
  next.mechanics!.actions![0].cooldown = .8
  const after = await compile(next, {
    ...identity,
    id: crypto.randomUUID(),
    sourceRevision: 2,
  })
  await assertMechanicReplacement(before, after)
  const sim = await UnifiedSimulation.createUnified(d, identity.id)
  try {
    settle(sim)
    const state = structuredClone(sim.state)
    sim.applyMechanics(next, after.id)
    assert.deepEqual(sim.state.mission, state.mission)
    assert.deepEqual(
      sim.player.position,
      state.actors.find((a) => a.id === state.player)!.position,
    )
  } finally {
    sim.dispose()
  }
})
test('three taps chain exactly three strikes; holding does not repeat; early buffer expires', async () => {
  const sim = await UnifiedSimulation.createUnified(
    actionFixture(),
    crypto.randomUUID(),
  )
  try {
    settle(sim)
    sim.step({ attack: true })
    for (let i = 0; i < 17; i++) sim.step({ attack: true })
    sim.step({})
    sim.step({ attack: true })
    settle(sim, 24)
    sim.step({ attack: true })
    settle(sim)
    assert.deepEqual(stages(sim), ['combo:1', 'combo:2', 'combo:3'])
    sim.state.events = []
    sim.step({ attack: true })
    sim.step({})
    sim.step({ attack: true })
    settle(sim)
    assert.deepEqual(stages(sim), ['combo:1'])
  } finally {
    sim.dispose()
  }
})
test('dash cancels only in recovery, has no protection and commits cost; cooldown survives save', async () => {
  const sim = await UnifiedSimulation.createUnified(
    actionFixture(),
    crypto.randomUUID(),
  )
  try {
    settle(sim)
    sim.step({ attack: true })
    sim.step({ dash: true })
    assert.equal(sim.player.action?.ability, 'runtime.combo.0')
    settle(sim, 23)
    const shield = sim.player.shieldUntil
    sim.step({ dash: true })
    assert.equal(sim.player.action?.ability, 'runtime.dash.0')
    assert.equal(sim.player.shieldUntil, shield)
    assert.throws(
      () => sim.applyMechanics(actionFixture(), 'new'),
      /checkpoint/,
    )
    settle(sim, 34)
    const cooldown = sim.player.cooldowns['runtime.action.dash.cooldown']
    const saved = sim.save()
    sim.restore(saved)
    assert.equal(sim.player.cooldowns['runtime.action.dash.cooldown'], cooldown)
    sim.step({ dash: true })
    assert.equal(sim.player.action, null)
  } finally {
    sim.dispose()
  }
})
test('dash is collision bounded and one controller move per tick; insufficient resources and airborne reject', async () => {
  const d = actionFixture(),
    spawn = of(d, 'actor_instance').find((a) => a.id === d.player)!.position
  of(d, 'world')[0].boxes.push({
    id: 'test.block',
    position: { x: spawn.x, y: 1, z: spawn.z + 1 },
    size: { x: 4, y: 2, z: .2 },
    ramp: false,
  })
  const sim = await UnifiedSimulation.createUnified(d, crypto.randomUUID())
  try {
    settle(sim)
    sim.player.yaw = 0
    const z = sim.player.position.z
    const move = sim.physics.move.bind(sim.physics)
    let moves = 0
    sim.physics.move = (id, ...args) => {
      if (id === sim.player.id) moves++
      return move(id, ...args)
    }
    sim.step({ dash: true })
    settle(sim, 50)
    assert.equal(moves, 51)
    assert(sim.player.position.z - z < .8)
    assert.equal(sim.player.shieldUntil, 0)
    settle(sim)
    sim.player.stamina = 0
    sim.step({ dash: true })
    assert.equal(sim.player.action, null)
    sim.step({})
    sim.player.mode = 'air'
    sim.step({ attack: true })
    assert.equal(sim.player.action, null)
  } finally {
    sim.dispose()
  }
})
test('combo damage occurs once per target per strike; cancel clears buffered continuation', async () => {
  const d = actionFixture()
  const def = structuredClone(of(d, 'actor_definition')[0])
  def.id = 'character.target'
  def.team = 'neutral'
  def.behavior = null
  def.health = 200
  d.nodes.push(def, {
    ...of(d, 'actor_instance').find((a) => a.id === d.player)!,
    id: 'instance.target',
    definition: def.id,
    position: { x: -6, y: 0, z: -4.6 },
  })
  const sim = await UnifiedSimulation.createUnified(d, crypto.randomUUID())
  try {
    settle(sim)
    const target = sim.state.actors.find((a) => a.id === 'instance.target')!
    target.position = {
      x: sim.player.position.x,
      y: sim.player.position.y,
      z: sim.player.position.z + 1.2,
    }
    sim.physics.sync(target.id, target.position)
    sim.physics.refresh()
    sim.player.yaw = 0
    sim.step({ attack: true })
    settle(sim, 18)
    sim.step({ attack: true })
    settle(sim, 24)
    sim.step({ attack: true })
    settle(sim)
    assert.equal(target.health, 155)
    sim.step({ attack: true })
    settle(sim, 18)
    sim.step({ attack: true })
    settle(sim, 1)
    sim.step({ cancel: true })
    settle(sim)
    assert.equal(stages(sim).filter((x) => x === 'combo:2').length, 1)
  } finally {
    sim.dispose()
  }
})

test('build admission runs action acceptance without inference', async () => {
  const reports = await acceptActions(actionFixture(), crypto.randomUUID())
  assert.equal(reports.length, 2)
  assert(reports.every((r) => r.passed), JSON.stringify(reports))
})

test('full recovery combo window uses the same rounded ticks as combat',async()=>{const d=actionFixture();const combo=d.mechanics!.actions![0];if(combo.capability==='combo')combo.cancelRecoveryFraction=1;const reports=await acceptActions(d,crypto.randomUUID());assert(reports.every(r=>r.passed),JSON.stringify(reports))})
