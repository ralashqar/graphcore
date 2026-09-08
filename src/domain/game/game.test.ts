import test from 'node:test'
import assert from 'node:assert/strict'
import { createAdventureTemplate } from './template.ts'
import { affectedGameNodes, compileGame, gameNodeHashes, hashGameValue, validateGameDesign } from './compiler.ts'
import { gameCommandSchema } from './contracts.ts'
import { applyGameSection } from './planning.ts'
import { blockedAt, initialGameState, interact, movePlayer, restoreGameState, runGameAcceptance } from './simulation.ts'

const ids = { id: '10000000-0000-4000-8000-000000000001', projectId: '10000000-0000-4000-8000-000000000002', draftId: '10000000-0000-4000-8000-000000000003', sourceRevision: 1 }
const manifest = () => compileGame({ ...ids, design: createAdventureTemplate() })
test('adventure compiles and completes collision-aware acceptance', async () => {
  const m = await manifest(), reports = runGameAcceptance(m)
  assert.equal(reports.length, 4); assert.deepEqual(reports.filter(r => !r.passed), [])
})
test('gameplay mutations never change canon/specification and require proximity', async () => {
  const m = await manifest(), before = structuredClone(m), state = initialGameState(m)
  const result = interact(m.design, state, 'key_01')
  assert.equal(result.event.type, 'rejected'); assert.deepEqual(m, before); assert.deepEqual(state.items, {})
})
test('typed contracts reject conflicting owners, ports and dependency cycles', () => {
  const d = createAdventureTemplate(); d.systems[0].owns.push('items'); d.systems[0].dependencies.push('quest'); d.systems[1].ports[0].schema = 'wrong.v1'
  const issues = validateGameDesign(d)
  assert.ok(issues.some(i => i.message.includes('already belongs')))
  assert.ok(issues.some(i => i.message.includes('cycle')))
  assert.ok(issues.some(i => i.nodeKey === 'interaction'))
})
test('sprint changes invalidate dependent systems but preserve asset recipes and level', async () => {
  const d = createAdventureTemplate(), before = await gameNodeHashes(d); d.movement.staminaDrain = 25
  const after = await gameNodeHashes(d), affected = affectedGameNodes(d, before, after)
  assert.ok(affected.includes('movement')); assert.ok(affected.includes('presentation'))
  assert.ok(!affected.includes('level')); assert.ok(!affected.includes('asset.key_mesh'))
})
test('style changes invalidate mesh input hashes', async () => {
  const d = createAdventureTemplate(), before = await gameNodeHashes(d); d.style.description = 'Crisp cobalt ceramic objects'
  assert.notEqual(before['asset.key_mesh'], (await gameNodeHashes(d))['asset.key_mesh'])
})
test('hashing ignores object property insertion order', async () => { assert.equal(await hashGameValue({ x: 1, y: 2 }), await hashGameValue({ y: 2, x: 1 })) })
test('saves are scoped to a build and reject impossible progression', async () => {
  const m = await manifest(), s = initialGameState(m)
  assert.throws(() => restoreGameState(m, { ...s, buildId: crypto.randomUUID() }), /another build/)
  assert.throws(() => restoreGameState(m, { ...s, complete: true }), /progression/)
})
test('closed collision prevents tunneling even with a large timestep', async () => {
  const m = await manifest(), s = initialGameState(m); s.position = { x: 0, y: 0, z: 2 }
  const next = movePlayer(m.design, s, { x: 0, z: 1, sprint: true }, 10)
  assert.ok(next.position.z < 2.4); assert.ok(blockedAt(m.design, next, 0, 3))
})
test('inventory rejects duplicate and over-capacity pickup', async () => {
  const m = await manifest(), s = initialGameState(m); s.position = { x: 5, y: 0, z: -4 }
  const first = interact(m.design, s, 'key_01').state
  assert.equal(interact(m.design, first, 'key_01').state.items.gate_key, 1)
  s.items.gate_key = m.design.inventory.capacity
  assert.equal(interact(m.design, s, 'key_01').event.type, 'rejected')
})
test('unreachable layouts are rejected by acceptance', async () => {
  const d = createAdventureTemplate(); d.prefabs.find(p => p.key === 'door')!.size.x = 24
  const m = await compileGame({ ...ids, design: d }); m.design.level.spawn.z = 10
  assert.ok(runGameAcceptance(m).some(r => !r.passed))
})
test('commands require action-specific payloads', () => {
  assert.equal(gameCommandSchema.safeParse({ projectId: ids.projectId, draftId: ids.draftId, idempotencyKey: ids.id, expectedRevision: 0, action: 'generate' }).success, false)
})
test('build excludes stale asset revisions', async () => {
  const d = createAdventureTemplate(), m = await compileGame({ ...ids, design: d, assets: [{ recipeKey: 'key_mesh', revisionId: ids.id, sourceHash: 'a'.repeat(64), storagePath: 'stale.glb', sha256: 'b'.repeat(64), bytes: 1024, triangles: 100, dimensions: { x: 1, y: 1, z: 1 }, reports: ['test'] }] })
  assert.equal(m.assets.length, 0)
})

test('child planners cannot write outside their owned section', () => {
  const d = createAdventureTemplate()
  assert.throws(() => applyGameSection(d, 'movement', { movement: d.movement, level: d.level }))
  const next = applyGameSection(d, 'movement', { movement: { ...d.movement, staminaDrain: 25 } })
  assert.deepEqual(next.level, d.level); assert.deepEqual(next.assets, d.assets)
})
test('art direction advances recipe versions without changing gameplay', () => {
  const d = createAdventureTemplate(), next = applyGameSection(d, 'style', { style: { ...d.style, description: 'Cobalt ceramic' } })
  assert.equal(next.style.version, d.style.version + 1)
  assert.ok(next.assets.every(a => a.styleVersion === next.style.version))
  assert.deepEqual(next.movement, d.movement); assert.deepEqual(next.level, d.level)
})
test('collision dimensions invalidate level acceptance', async () => {
  const d = createAdventureTemplate(), before = await gameNodeHashes(d)
  d.prefabs.find(p => p.key === 'wall')!.size.x = 12
  assert.notEqual((await gameNodeHashes(d)).level, before.level)
})
