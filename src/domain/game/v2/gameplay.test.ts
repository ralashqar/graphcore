import test from 'node:test'
import assert from 'node:assert/strict'
import { createCombatTemplate } from './template.ts'
import { validateDesign, nodeHashes, affectedNodes } from './compiler.ts'
import { nodesOf } from './spec.ts'
import { Simulation } from './simulation.ts'
import { runAcceptance } from './acceptance.ts'
import { poseAt, socketAt, length, sub } from './pose.ts'
test('template and supported module contracts', () => {
  const d = createCombatTemplate()
  assert.deepEqual(validateDesign(d), [])
  nodesOf(d, 'ability')[0].pose = 'missing'
  assert.match(validateDesign(d)[0].message, /Missing pose/)
})
test('scope invalidation reaches consumers, not art or world', async () => {
  const d = createCombatTemplate(),
    before = await nodeHashes(d)
  nodesOf(d, 'projectile')[0].damage++
  const after = await nodeHashes(d),
    changed = Object.keys(after).filter((k) => after[k] !== before[k]),
    affected = affectedNodes(d, changed)
  assert(affected.includes('ability.bolt'))
  assert(affected.includes('actor.mage'))
  assert(!affected.includes('world'))
  assert(!affected.includes('pose.cast'))
})
test('deterministic fixed input replay', async () => {
  const d = createCombatTemplate(),
    a = await Simulation.create(d, 'replay'),
    b = await Simulation.create(d, 'replay')
  try {
    for (let i = 0; i < 180; i++) {
      const input = {
        x: 0.1,
        z: 0.2,
        jump: i === 30,
        ability: i === 70 ? 'ability.bolt' : undefined,
      }
      a.step(input)
      b.step(input)
    }
    assert.deepEqual(a.state, b.state)
  } finally {
    a.dispose()
    b.dispose()
  }
})
test('activation pays once, rejects cooldown, cancellation retains cost', async () => {
  const s = await Simulation.create(createCombatTemplate(), 'cost')
  try {
    const a = s.player,
      initial = a.stamina
    assert(s.activate(a, 'ability.bolt', {}))
    assert.equal(a.stamina, initial - 10)
    assert(!s.activate(a, 'ability.bolt', {}))
    s.step({ cancel: true })
    assert.equal(a.action, null)
    assert(a.stamina < initial)
    assert(!s.activate(a, 'ability.bolt', {}))
    a.stamina = 0
    assert(!s.activate(a, 'ability.shield', {}))
  } finally {
    s.dispose()
  }
})
test('shield blocks damage; death interrupts action and traversal', async () => {
  const s = await Simulation.create(createCombatTemplate(), 'damage')
  try {
    const enemy = s.state.actors.find((a) => a.id === 'actor.enemy')!,
      p = s.player
    p.shieldUntil = 100
    assert(!s.hurt(enemy, p, 20))
    p.shieldUntil = 0
    s.activate(p, 'ability.bolt', {})
    assert(s.hurt(enemy, p, 200))
    assert.equal(p.mode, 'dead')
    assert.equal(p.action, null)
    assert.equal(p.ledge, null)
  } finally {
    s.dispose()
  }
})
test('socket rotation and proportions; limb lengths remain bounded', () => {
  const d = createCombatTemplate(),
    a = socketAt(
      d,
      'hand.right.cast',
      { x: 0, y: 0, z: 0 },
      0,
      1.8,
      'pose.cast',
      0.5,
    ),
    b = socketAt(
      d,
      'hand.right.cast',
      { x: 0, y: 0, z: 0 },
      Math.PI / 2,
      1.8,
      'pose.cast',
      0.5,
    )
  assert(Math.abs(a.position.z - b.position.x) < 1e-6)
  const j = poseAt(d, 'pose.cast', 0.5)
  assert(Math.abs(length(sub(j.rightElbow, j.rightShoulder)) - 0.34) < 1e-5)
  assert(Math.abs(length(sub(j.rightHand, j.rightElbow)) - 0.34) < 1e-5)
})
test('projectile sweep stops at thin wall and chooses nearest collider', async () => {
  const d = createCombatTemplate()
  nodesOf(d, 'world')[0].boxes.push({
    id: 'thin',
    position: { x: 0, y: 1, z: -3 },
    size: { x: 3, y: 2, z: 0.03 },
    ramp: false,
  })
  const s = await Simulation.create(d, 'sweep')
  try {
    const hit = s.physics.sweep(
      { x: 0, y: 1, z: -5 },
      { x: 0, y: 1, z: 3 },
      0.1,
      ['actor.mage'],
    )
    assert.equal(hit?.id, 'thin')
    s.activate(s.player, 'ability.bolt', {})
    for (let i = 0; i < 90; i++) s.step()
    assert.equal(s.state.projectiles.length, 0)
    assert(
      s.state.events.some((e) => e.type === 'impact' && e.detail === 'thin'),
    )
  } finally {
    s.dispose()
  }
})
test('save rejects active action and mismatched build', async () => {
  const d = createCombatTemplate(),
    a = await Simulation.create(d, 'a'),
    b = await Simulation.create(d, 'b')
  try {
    for (let i = 0; i < 2; i++) a.step()
    const saved = a.save()
    assert.throws(() => b.restore(saved), /different build/)
    a.activate(a.player, 'ability.bolt', {})
    assert.throws(() => a.save(), /checkpoint/)
  } finally {
    a.dispose()
    b.dispose()
  }
})
for (const role of ['mage', 'melee'] as const)
  test(`${role} combat and traversal acceptance`, async () => {
    const d = createCombatTemplate()
    d.defaultActor = role
    const reports = await runAcceptance(d, role)
    assert.deepEqual(
      reports.filter((r) => !r.passed),
      [],
    )
  })
test('unreachable grip and blocked landing never commit a climb', async () => {
  const d = createCombatTemplate()
  const w = nodesOf(d, 'world')[0]
  w.ledges[0].start.y = 8
  w.ledges[0].end.y = 8
  w.ledges[0].landing.y = 8
  const s = await Simulation.create(d, 'reach')
  try {
    for (let i = 0; i < 160; i++) s.step({ z: 1 })
    s.step({ jump: true })
    for (let i = 0; i < 100; i++) s.step({ interact: true })
    assert(!s.state.climbed)
    assert.notEqual(s.player.mode, 'hang')
  } finally {
    s.dispose()
  }
})
test('projectile damage and impact happen once and apply slow', async () => {
  const d = createCombatTemplate()
  nodesOf(d, 'behavior')[0].detectionRange = 2
  const s = await Simulation.create(d, 'impact')
  try {
    s.activate(s.player, 'ability.bolt', { aim: { x: 0, y: 0, z: 0 } })
    for (let i = 0; i < 60; i++) s.step()
    const enemy = s.state.actors.find((a) => a.id === 'actor.enemy')!
    assert.equal(enemy.health, 25)
    assert(enemy.slowUntil > s.state.tick)
    assert.equal(s.state.events.filter((e) => e.type === 'impact').length, 1)
    for (let i = 0; i < 50; i++) s.step()
    assert.equal(enemy.health, 25)
  } finally {
    s.dispose()
  }
})
test('friendly filtering and traversal cancellation preserve state ownership', async () => {
  const s = await Simulation.create(createCombatTemplate(), 'locks')
  try {
    assert(!s.hurt(s.player, s.player, 20))
    s.player.mode = 'hang'
    s.player.ledge = 'missing'
    assert(!s.activate(s.player, 'ability.bolt', {}))
    s.step({ drop: true })
    assert.equal(s.player.ledge, null)
    assert.equal(s.player.action, null)
  } finally {
    s.dispose()
  }
})
