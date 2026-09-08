import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUnified, interactionRecipe, materialize } from './recipes.ts'
import { validate } from './compiler.ts'
import { runAcceptance } from './acceptance.ts'
import { UnifiedSimulation } from './simulation.ts'
import { CATALOG, of } from './spec.ts'
import { planSchema } from './spec.ts'
import { z } from 'zod'
import { nodeSchema } from './spec.ts'

test('provider node output schema uses supported anyOf unions',()=>{
  const schema=JSON.stringify(z.toJSONSchema(z.object({edits:z.array(nodeSchema)})))
  assert.equal(schema.includes('"oneOf"'),false)
})

for (const preset of [
  'courier',
  'observatory',
  'exploration',
  'combat',
] as const)
  test(`${preset} composes and completes through simulation input`, async () => {
    const d = createUnified(preset)
    const frozen = JSON.stringify(d)
    assert.deepEqual(validate(d), [])
    const reports = await runAcceptance(d, 'test')
    assert.equal(JSON.stringify(d), frozen, 'Runtime must preserve the authoring snapshot')
    assert.deepEqual(
      reports.filter((r) => !r.passed),
      [],
    )
  })
test('independent recipe instances have no duplicate definitions', () => {
  const d = createUnified()
  d.nodes.push(
    ...interactionRecipe('chair', 'seat.a', { x: 10, y: 0, z: -10 }),
    ...interactionRecipe('chair', 'seat.b', { x: 13, y: 0, z: -10 }),
  )
  assert.deepEqual(validate(d), [])
})

test('the same runtime completes a new parallel-objective mission without combat',async()=>{
  const design=createUnified('combat')
  design.nodes=design.nodes.filter(n=>n.kind!=='objective'&&n.id!=='guard')
  for(const [id,x]of [['east',4],['west',-4]] as const){
    design.nodes.push({id,label:id,version:1,kind:'region',position:{x,y:0,z:-7},radius:1})
    design.nodes.push({id:`quest.${id}`,label:`Visit ${id}`,version:1,kind:'objective',op:'reach',target:id,item:null,quantity:1,prerequisites:[],required:true,rewards:[]})
  }
  design.nodes.push({id:'quest.finish',label:'Return to finish',version:1,kind:'objective',op:'reach',target:'finish',item:null,quantity:1,prerequisites:['quest.east','quest.west'],required:true,rewards:[]})
  assert.deepEqual(validate(design),[])
  assert.deepEqual((await runAcceptance(design,'parallel')).filter(r=>!r.passed),[])
})
test('objective cycles and wrong target kinds are rejected', () => {
  const d = createUnified()
  of(d, 'objective')[0].prerequisites = ['quest.deliver']
  assert.ok(validate(d).some((e) => e.message.includes('Cyclic')))
  of(d, 'objective')[0].target = 'world'
  assert.ok(validate(d).some((e) => e.message.includes('Expected')))
})
test('recipe ID reuse cannot overwrite another entity', () => {
  const d = createUnified()
  assert.throws(
    () =>
      materialize(
        {
          version: 1,
          intent: 'add_content',
          title: d.title,
          explanation: '',
          preset: 'courier',
          unsupported: [],
          visualRequirements: [],
          recipes: [
            {
              kind: 'horse',
              instanceId: 'mount',
              position: { x: 0, y: 0, z: 0 },
            },
          ],
          edits: [],
          removeNodeIds: [],
          sourceRevision: 0,
          catalogVersion: CATALOG,
        },
        d,
      ),
    /already exists/,
  )
})
test('invalid saved inventory and objective state leave runtime untouched', async () => {
  const s = await UnifiedSimulation.createUnified(createUnified(), 'test')
  try {
    for (let i = 0; i < 60; i++) s.step()
    const saved = s.save(),
      before = JSON.stringify(s.state)
    saved.mission.inventory = { unknown: 1 }
    assert.throws(() => s.restore(saved))
    assert.equal(JSON.stringify(s.state), before)
  } finally {
    s.dispose()
  }
})
test('delivery and rewards are one atomic, idempotent inventory transaction', async () => {
  const design = createUnified('observatory')
  const objective = of(design, 'objective').find((o) => o.op === 'deliver')!
  objective.rewards = [{ item: 'item.key', quantity: 1 }]
  const sim = await UnifiedSimulation.createUnified(design, 'test')
  try {
    sim.state.mission.inventory = { 'item.parcel': 1 }
    sim.complete(objective.id, { item: 'item.parcel', quantity: 1 })
    sim.complete(objective.id, { item: 'item.parcel', quantity: 1 })
    assert.equal(sim.state.mission.inventory['item.parcel'], 0)
    assert.equal(sim.state.mission.inventory['item.key'], 1)
    assert.equal(
      sim.state.mission.completed.filter((id) => id === objective.id).length,
      1,
    )
  } finally {
    sim.dispose()
  }
})
test('failed reward capacity leaves delivery item and progress unchanged', async () => {
  const design = createUnified('observatory')
  design.inventoryCapacity = 1
  const objective = of(design, 'objective').find((o) => o.op === 'deliver')!
  objective.rewards = [{ item: 'item.key', quantity: 2 }]
  const sim = await UnifiedSimulation.createUnified(design, 'test')
  try {
    sim.state.mission.inventory = { 'item.parcel': 1 }
    sim.complete(objective.id, { item: 'item.parcel', quantity: 1 })
    assert.equal(sim.state.mission.inventory['item.parcel'], 1)
    assert.ok(!sim.state.mission.completed.includes(objective.id))
  } finally {
    sim.dispose()
  }
})
test('unreachable required objective is rejected by input acceptance', async () => {
  const design = createUnified('exploration')
  of(design, 'world')[0].boxes.push({
    id: 'sealed',
    position: { x: -3, y: 2, z: -9 },
    size: { x: 5, y: 4, z: 5 },
    ramp: false,
  })
  assert.ok((await runAcceptance(design, 'blocked')).some((r) => !r.passed))
})
test('effect contracts reject recursively spawned hit projectiles', () => {
  const design = createUnified()
  design.nodes.push(
    {
      id: 'effect.chain',
      label: 'Chain',
      version: 1,
      kind: 'effect',
      op: 'projectile',
      target: 'hit',
      amount: 1,
      duration: 1,
      projectile: 'projectile.bolt',
    },
    {
      id: 'binding.chain',
      label: 'Chain binding',
      version: 1,
      kind: 'ability_effects',
      ability: 'ability.bolt',
      phase: 'hit',
      effects: ['effect.chain'],
    },
  )
  assert.ok(
    validate(design).some((e) => e.message.includes('only run on release')),
  )
})
test('release effects execute once per action', async () => {
  const design = createUnified('exploration')
  design.nodes.push(
    {
      id: 'effect.heal',
      label: 'Heal',
      version: 1,
      kind: 'effect',
      op: 'heal',
      target: 'self',
      amount: 10,
      duration: 0,
      projectile: null,
    },
    {
      id: 'binding.heal',
      label: 'Heal shield',
      version: 1,
      kind: 'ability_effects',
      ability: 'ability.shield',
      phase: 'release',
      effects: ['effect.heal'],
    },
  )
  const sim = await UnifiedSimulation.createUnified(design, 'test')
  try {
    for (let i = 0; i < 60; i++) sim.step()
    sim.player.health = 40
    sim.step({ ability: 'ability.shield' })
    for (let i = 0; i < 100; i++) sim.step()
    assert.equal(sim.player.health, 50)
  } finally {
    sim.dispose()
  }
})
test('explanation plans cannot materialize', () => {
  const plan = planSchema.parse({
    version: 1,
    intent: 'explain',
    title: 'Question',
    explanation: 'Answer',
    preset: 'courier',
    unsupported: [],
    visualRequirements: [],
    recipes: [],
    edits: [],
    removeNodeIds: [],
    sourceRevision: 0,
    catalogVersion: CATALOG,
  })
  assert.throws(() => materialize(plan, null), /Explanation/)
})
