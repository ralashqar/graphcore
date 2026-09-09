import test from 'node:test'
import assert from 'node:assert/strict'
import {
  performanceRecipe,
  performanceSchema,
  programAbilityId,
} from './performance.ts'
import {
  poseSequenceSchema,
  evaluateSequence,
  validateSequence,
  PERFORMANCE_RUNTIME,
} from './poseSequence.ts'
import { somaMannequin } from './mannequin.ts'
import { forwardPose } from './somaPose.ts'
import { createUnified } from './recipes.ts'
import { compile } from './compiler.ts'
import { manifestSchema } from './spec.ts'
import { UnifiedSimulation } from './simulation.ts'
import { mergeScopedMechanics } from './mechanicCommands.ts'
import { replacementRecipe, motionContractHash } from './performanceMotion.ts'
const fixture = () => {
  const d = createUnified('exploration')
  d.mechanics = mergeScopedMechanics(
    undefined,
    'character.player',
    [],
    [],
    [],
    performanceRecipe('roll', 'character.player'),
  )
  return d
}
test('blocked roll discards travel and an actual uppercut sweep drives receiver recovery', async () => {
  const blocked=fixture(),world=blocked.nodes.find(n=>n.kind==='world')!
  assert(world.kind==='world')
  world.boxes.push({id:'roll.blocker',position:{x:0,y:1.5,z:-10.8},size:{x:5,y:3,z:.2},ramp:false})
  const roll=await UnifiedSimulation.createUnified(blocked,'blocked')
  try {for(let i=0;i<60;i++)roll.step();const z=roll.player.position.z;roll.step({roll:true});for(let i=0;i<120;i++)roll.step();assert(roll.player.position.z-z<1);assert(roll.canSave())}finally{roll.dispose()}
  const d=fixture(),receiver=d.nodes.find(n=>n.kind==='actor_definition'&&n.id==='character.keeper')!
  assert(receiver.kind==='actor_definition');receiver.behavior=null
  const target=d.nodes.find(n=>n.kind==='actor_instance'&&n.definition===receiver.id)!
  assert(target.kind==='actor_instance');target.position={x:0,y:0,z:-10.8};target.activation=null
  d.mechanics=mergeScopedMechanics(d.mechanics,'character.player',[],[],[],performanceRecipe('uppercut','character.player',[receiver.id]))
  const sim=await UnifiedSimulation.createUnified(d,'sweep')
  try {for(let i=0;i<60;i++)sim.step();const health=sim.state.actors.find(a=>a.id===target.id)!.health
    sim.step({uppercut:true});for(let i=0;i<35;i++)sim.step()
    assert.equal(sim.state.actors.find(a=>a.id===target.id)!.health,health-15)
    assert(sim.performanceController.reactions[target.id])
    for(let i=0;i<300;i++)sim.step()
    assert(!sim.performanceController.reactions[target.id]);assert(sim.canSave())
    sim.hit(sim.player,sim.state.actors.find(a=>a.id===target.id)!,1,'runtime.program.uppercut');sim.hit(sim.player,sim.state.actors.find(a=>a.id===target.id)!,1000,'runtime.program.uppercut');sim.step();assert(!sim.performanceController.reactions[target.id]);assert(sim.canSave())
  }finally{sim.dispose()}
})
test('Kimodo replacement freezes evaluated milestones and changes identity when a pose changes', async () => {
  const rig = await somaMannequin(),
    p = performanceRecipe('uppercut', 'character.player', ['character.guard'])
  for (const s of p.sequences) {
    const recipe = await replacementRecipe(s, rig)
    assert.equal(
      recipe.motionContract,
      await motionContractHash(s, rig.revision),
    )
    assert.equal(recipe.duration, s.duration)
    assert.equal(recipe.poses.length, s.keys.length)
    assert(
      recipe.poses.every((p) => 'Hips' in p.joints && 'RightHand' in p.joints),
    )
  }
  const changed = structuredClone(p.sequences[0])
  changed.keys[1].root[1] -= 0.01
  assert.notEqual(
    await motionContractHash(changed, rig.revision),
    await motionContractHash(p.sequences[0], rig.revision),
  )
})
test('unreachable milestone targets fail technical validation', async () => {
  const rig = await somaMannequin(),
    s = performanceRecipe('roll', 'character.player').sequences[0]
  s.keys[0].targets = [{ effector: 'RightHand', position: [1, 0, -1] }]
  assert(validateSequence(rig, s).some((e) => e.includes('Unreachable')))
})
test('pose contracts reject scripts, unknown joints and mismatched gameplay markers', () => {
  const p = performanceRecipe('roll', 'character.player'),
    s = p.sequences[0]
  assert(!poseSequenceSchema.safeParse({ ...s, script: 'alert(1)' }).success)
  const bad = structuredClone(s)
  bad.keys[0].rotations.Unknown = [0, 0, 0]
  assert(!poseSequenceSchema.safeParse(bad).success)
  p.abilities[0].active += 0.1
  assert(!performanceSchema.safeParse(p).success)
})
test('all authored milestones interpolate with finite transforms and fixed bone lengths', async () => {
  const rig = await somaMannequin()
  for (const p of [
    performanceRecipe('roll', 'character.player'),
    performanceRecipe('uppercut', 'character.player', ['character.guard']),
  ])
    for (const s of p.sequences) {
      assert.deepEqual(validateSequence(rig, s), [], s.id)
      for (let t = 0; t <= s.duration; t += 1 / 30) {
        const pose = evaluateSequence(rig, s, t),
          fk = forwardPose(rig, pose)
        for (const j of rig.joints)
          if (j.parent) {
            const a = fk.positions[j.id],
              b = fk.positions[j.parent]
            assert(
              Math.abs(
                Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) -
                  Math.hypot(...j.translation),
              ) < 1e-6,
            )
          }
      }
    }
  const s = performanceRecipe('roll', 'character.player').sequences[0],
    mid = evaluateSequence(rig, s, 0.4)
  assert(
    Math.abs(mid.rotations.Hips[0]) > 0.99,
    'Full rotation must retain winding',
  )
})
test('scoped uppercut addition preserves roll, and runtime dispatch cannot downgrade', async () => {
  const d = fixture(),
    receiver = d.nodes.find(
      (n) => n.kind === 'actor_definition' && n.id !== 'character.player',
    )!
  d.mechanics = mergeScopedMechanics(
    d.mechanics,
    'character.player',
    [],
    [],
    [],
    performanceRecipe('uppercut', 'character.player', [receiver.id]),
  )
  assert.equal(d.mechanics.performance!.abilities.length, 2)
  const m = await compile(d, {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
    sourceRevision: 1,
  })
  assert.equal(m.runtimeVersion, PERFORMANCE_RUNTIME)
  assert(
    !manifestSchema.safeParse({ ...m, runtimeVersion: 'gameplay-3.4.0' })
      .success,
  )
})
test('roll travels once, holds its recovery, adds no protection, and cannot be spammed', async () => {
  const sim = await UnifiedSimulation.createUnified(fixture(), 'roll')
  try {
    for (let i = 0; i < 60; i++) sim.step()
    const start = { ...sim.player.position },
      shield = sim.player.shieldUntil
    sim.step({ roll: true })
    assert(!sim.canSave())
    const token = sim.player.action!.id
    for (let i = 0; i < 25; i++)
      sim.step({ roll: true, cancel: true, jump: true })
    assert.equal(sim.player.action?.id, token)
    for (let i = 0; i < 60; i++) sim.step({ roll: true })
    assert(
      Math.abs(
        Math.hypot(
          sim.player.position.x - start.x,
          sim.player.position.z - start.z,
        ) - 2.5,
      ) < 0.03,
    )
    assert.equal(sim.player.shieldUntil, shield)
    assert(sim.canSave())
    sim.restore(sim.save())
  } finally {
    sim.dispose()
  }
})
test('confirmed uppercut causes one bounded reaction and restores control after grounded get-up', async () => {
  const d = fixture(),
    instance = d.nodes.find(
      (n) => n.kind === 'actor_instance' && n.id !== d.player,
    )!
  assert(instance.kind === 'actor_instance')
  d.mechanics = mergeScopedMechanics(
    d.mechanics,
    'character.player',
    [],
    [],
    [],
    performanceRecipe('uppercut', 'character.player', [instance.definition]),
  )
  const sim = await UnifiedSimulation.createUnified(d, 'uppercut')
  try {
    for (let i = 0; i < 60; i++) sim.step()
    const target = sim.state.actors.find((a) => a.id === instance.id)!,
      p = d.mechanics.performance!.abilities.find((a) => a.kind === 'uppercut')!
    target.health = 100
    target.mode = 'ground'
    const health = target.health
    assert(sim.hit(sim.player, target, p.damage, programAbilityId(p)))
    assert(target.health < health)
    assert(sim.performanceController.reactions[target.id])
    assert(!sim.canSave())
    const first = sim.performanceController.reactions[target.id]
    sim.hit(sim.player, target, 1, programAbilityId(p))
    assert.equal(sim.performanceController.reactions[target.id], first)
    const phases = new Set<string>()
    for (let i = 0; i < 360; i++) {
      const r = sim.performanceController.reactions[target.id]
      if (r) phases.add(r.phase)
      sim.step()
    }
    assert.deepEqual([...phases], ['recoil', 'fall', 'prone', 'getUp'])
    assert(!sim.performanceController.reactions[target.id])
    assert(target.health > 0)
  } finally {
    sim.dispose()
  }
})

test('moving roll carries entry velocity and hands back to locomotion without a stopped tick', async () => {
  const sim = await UnifiedSimulation.createUnified(fixture(), 'momentum')
  try {
    for(let i=0;i<60;i++)sim.step()
    const speeds:number[]=[]
    for(let i=0;i<90;i++) {
      const before={...sim.player.position}
      sim.step({z:1,roll:i===15,sprint:true})
      speeds.push(Math.hypot(sim.player.position.x-before.x,sim.player.position.z-before.z)*60)
    }
    assert(speeds[15] > speeds[14]*.9, 'Roll must carry actual incoming speed')
    assert(speeds.slice(15,24).every(v=>v>speeds[14]*.9), 'Tucking into a roll must not brake running momentum')
    assert(speeds.slice(15,76).every(v=>v>.2), 'Holding movement must never produce a stopped action tick')
    assert(Math.abs(speeds[74]-speeds[75])<.3, 'Recovery must join held sprint velocity')
    assert.equal(sim.player.action,null)
  } finally { sim.dispose() }
})
test('momentum roll decelerates after release and legacy rolls preserve their policy', async () => {
  const d=fixture(),sim=await UnifiedSimulation.createUnified(d,'release')
  try {
    for(let i=0;i<60;i++)sim.step()
    for(let i=0;i<10;i++)sim.step({z:1})
    sim.step({roll:true,z:1})
    const speeds:number[]=[]
    for(let i=0;i<65;i++){const z=sim.player.position.z;sim.step();speeds.push(Math.abs(sim.player.position.z-z)*60)}
    assert(speeds.at(-1)!<.01)
    assert(speeds[45]>speeds[55], 'Released roll brakes during recovery')
  }finally{sim.dispose()}
  delete d.mechanics!.performance!.abilities[0].movementPolicy
  const legacy=await UnifiedSimulation.createUnified(d,'legacy')
  try{for(let i=0;i<60;i++)legacy.step();for(let i=0;i<5;i++)legacy.step({z:1});const z=legacy.player.position.z;legacy.step({roll:true,z:1});assert(Math.abs(legacy.player.position.z-z)<.0001)}finally{legacy.dispose()}
})
