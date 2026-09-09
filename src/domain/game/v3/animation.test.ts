import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motionRecipeSchema, rigProfileSchema, animationGraphSchema, canReserveSetupBudget, KIMODO_MODEL, validateAnimationBindings, type MotionRecipe } from './animation.ts'

const recipe: MotionRecipe = {
  version: 1, id: 'run.forward', state: 'run', rigRevision: 'a'.repeat(64), model: KIMODO_MODEL,
  prompt: 'A person runs forward at a steady pace.', duration: 5, candidates: 3, seed: 42,
  loop: true, targetSpeed: 4, rootMode: 'in_place', contacts: [], poses: [],
  path: [{ time: 0, x: 0, z: 0 }, { time: 4.9, x: 0, z: 19.6 }],
  thresholds: { version: 1, maxContactError: 0.03, maxBoneLengthError: 0.005, maxSeamAngle: 0.1, maxSeamVelocity: 0.2, maxCorrection: 0.1 },
}
test('motion admission rejects excessive work and executable payloads', () => {
  assert.equal(motionRecipeSchema.safeParse(recipe).success, true)
  for (const patch of [{ duration: 10 }, { candidates: 4 }, { seed: -1 }, { script: 'import os' }, { targetSpeed: Infinity }]) {
    assert.equal(motionRecipeSchema.safeParse({ ...recipe, ...patch }).success, false)
  }
})
test('motion constraints must have valid time ordering and nonoverlapping effector contacts', () => {
  assert.equal(motionRecipeSchema.safeParse({ ...recipe, path: [...recipe.path].reverse() }).success, false)
  assert.equal(motionRecipeSchema.safeParse({ ...recipe, poses: [{ time: 6, joints: {} }] }).success, false)
  const contact = { effector: 'left_hand', start: 0, end: 2, position: [0, 1, 0] }
  assert.equal(motionRecipeSchema.safeParse({ ...recipe, contacts: [contact, { ...contact, start: 1, end: 3 }] }).success, false)
})
test('rig rejects cycles, duplicate joints, invalid rotations and missing sockets', () => {
  const rig = { version: 1, id: 'humanoid.v1', revision: 'a'.repeat(64), units: 'meters', up: 'Y', forward: 'Z', joints: Array.from({ length: 15 }, (_, i) => ({ id: `joint${i}`, parent: i ? `joint${i - 1}` : null, translation: [0, 0.1, 0], rotation: [0, 0, 0, 1], sourceJoint: `source${i}` })), sockets: {} }
  assert.equal(rigProfileSchema.safeParse(rig).success, true)
  assert.equal(rigProfileSchema.safeParse({ ...rig, joints: [{ ...rig.joints[0], parent: 'joint14' }, ...rig.joints.slice(1)] }).success, false)
  assert.equal(rigProfileSchema.safeParse({ ...rig, sockets: { hand: { joint: 'missing', translation: [0, 0, 0] } } }).success, false)
  assert.equal(rigProfileSchema.safeParse({ ...rig, joints: [{ ...rig.joints[0], rotation: [0, 0, 0, 0] }, ...rig.joints.slice(1)] }).success, false)
})
test('animation graphs cannot transition to unbound states or bind missing clips', () => {
  const graph = { version: 1, id: 'adventurer', actorDefinition: 'player', rigRevision: 'a'.repeat(64), bindings: [{ state: 'idle', clipRevision: '11111111-1111-4111-8111-111111111111' }], transitions: [] }
  const parsed = animationGraphSchema.parse(graph)
  assert.equal(validateAnimationBindings(parsed, []).length, 1)
  assert.equal(animationGraphSchema.safeParse({ ...graph, bindings: [...graph.bindings, ...graph.bindings] }).success, false)
  assert.equal(animationGraphSchema.safeParse({ ...graph, transitions: [{ from: 'idle', to: 'run', blendSeconds: 0.1, event: 'movement' }] }).success, false)
})
test('setup budget preserves five dollars headroom and phase limits', () => {
  assert.equal(canReserveSetupBudget({ benchmark: 0, integration: 0, ledge: 0 }, 'benchmark', 1000), true)
  assert.equal(canReserveSetupBudget({ benchmark: 1000, integration: 1000, ledge: 499 }, 'ledge', 1), true)
  assert.equal(canReserveSetupBudget({ benchmark: 1000, integration: 1000, ledge: 499 }, 'ledge', 2), false)
  assert.equal(canReserveSetupBudget({ benchmark: 1000, integration: 0, ledge: 0 }, 'benchmark', 1), false)
  assert.equal(canReserveSetupBudget({ benchmark: -1, integration: 0, ledge: 0 }, 'benchmark', 1), false)
  assert.equal(canReserveSetupBudget({ benchmark: 0, integration: 0, ledge: 0 }, 'benchmark', 0.5), false)
})
