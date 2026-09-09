import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { humanoidMannequin } from '../src/domain/game/v3/mannequin.ts'
import { kimodoRelease } from '../src/domain/game/v3/animationTransport.ts'
import { compile } from '../src/domain/game/v3/compiler.ts'
import { createUnified } from '../src/domain/game/v3/recipes.ts'
import { manifestSchema, ANIMATED_VERSION } from '../src/domain/game/v3/spec.ts'
import { createHash, randomUUID } from 'node:crypto'
const directory = mkdtempSync(join(tmpdir(), 'graphcore-animation-test-'))
const blender = process.env.GAME_BLENDER_BINARY ?? (process.platform === 'win32' ? 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' : 'blender')
try {
  const rig = await humanoidMannequin(), positions = new Map()
  const joints = rig.joints.map((j, i) => {
    const parent = j.parent ? rig.joints.findIndex(p => p.id === j.parent) : -1
    const rest = j.translation.map((v, k) => v + (positions.get(j.parent)?.[k] ?? 0))
    positions.set(j.id, rest)
    return { name: j.sourceJoint, parent, rest }
  })
  const recipe = { version: 1, id: 'test.idle', state: 'idle', model: 'Kimodo-SOMA-RP-v1.1', rigRevision: rig.revision, prompt: 'A humanoid stands in a relaxed idle pose.', duration: 1, candidates: 1, seed: 0, loop: true, targetSpeed: 0, rootMode: 'in_place', contacts: [], poses: [], path: [], thresholds: { version: 1, maxCorrection: .1, maxContactError: .03, maxBoneLengthError: .005, maxSeamAngle: .1, maxSeamVelocity: .2 } }
  // Time-varying motion catches mismatched import/export frame rates; a static
  // rest pose cannot detect sampling the animation at the wrong times.
  const source = { version: 1, model: recipe.model, modelRevision: kimodoRelease.model, fps: 30, seed: 0, joints, frames: Array.from({ length: 30 }, (_, i) => {
    const phase = Math.sin(i / 29 * Math.PI * 2), angle = phase * .05
    return { root: [0, 1 + phase * .003, 0], rotations: joints.map((_, j) => j === 0 ? [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] : [0, 0, 0, 1]) }
  }) }
  for (const [name, value] of Object.entries({ rig, recipe, source })) writeFileSync(join(directory, `${name}.json`), JSON.stringify(value))
  for (const stage of ['retarget', 'process', 'export', 'validate']) {
    const result = spawnSync(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, stage], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`${stage}: ${result.stderr}\n${result.stdout}`)
  }
  const report = JSON.parse(readFileSync(join(directory, 'validate.json'), 'utf8'))
  console.log(JSON.stringify(report))
  assert.equal(report.accepted, true, 'Round-trip mannequin fixture must pass')
  if (process.argv.includes('--keep-fixture')) {
    const fixture = 'output/game-animation-browser-fixture'
    mkdirSync(fixture, { recursive: true })
    copyFileSync(join(directory, 'output.glb'), join(fixture, 'idle.glb'))
    const processed = JSON.parse(readFileSync(join(directory, 'process.json'), 'utf8'))
    const base = await compile(createUnified('exploration'), { id: randomUUID(), projectId: randomUUID(), draftId: randomUUID(), sourceRevision: 1 })
    const clip = { version: 1, id: randomUUID(), recipeKey: 'animation.fixture', recipeHash: 'a'.repeat(64), rigRevision: rig.revision, sourceHash: 'b'.repeat(64), glbHash: createHash('sha256').update(readFileSync(join(directory, 'output.glb'))).digest('hex'), storagePath: 'fixture/idle.glb', state: 'idle', duration: processed.duration, fps: 30, loop: true, naturalSpeed: 0, rootMode: 'in_place', rootCurve: processed.rootCurve, contacts: [], validation: { policy: 'animation-1.0.0', accepted: true, metrics: report.metrics } }
    const graph = { version: 1, id: 'animation.fixture', actorDefinition: base.design.nodes.find(n => n.kind === 'actor_instance' && n.id === base.design.player).definition, rigRevision: rig.revision, bindings: [{ state: 'idle', clipRevision: clip.id }], transitions: [] }
    const manifest = manifestSchema.parse({ ...base, runtimeVersion: ANIMATED_VERSION, assets: [clip], animations: { version: 1, rigs: [rig], graphs: [graph] } })
    writeFileSync(join(fixture, 'candidate.json'), JSON.stringify({ manifest, assetUrls: { 'animation.fixture': '/staged/idle.glb' } }))
  }
  // An impossible hand contact must fail; this is a pipeline fixture, not generated motion acceptance.
  recipe.contacts = [{ effector: 'left_hand', start: 0, end: .5, position: [10, 10, 10] }]
  writeFileSync(join(directory, 'recipe.json'), JSON.stringify(recipe))
  const rejected = spawnSync(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, 'validate'], { encoding: 'utf8' })
  assert.equal(rejected.status, 0, rejected.stderr)
  assert.equal(JSON.parse(readFileSync(join(directory, 'validate.json'), 'utf8')).accepted, false)
  // Positive contact processing must preserve the supported rig and clip bounds.
  recipe.contacts = [{ effector: 'left_foot', start: 0, end: 1, position: [.1, .09, 0] }, { effector: 'right_foot', start: 0, end: 1, position: [-.1, .09, 0] }]
  writeFileSync(join(directory, 'recipe.json'), JSON.stringify(recipe))
  for (const stage of ['process', 'export', 'validate']) {
    const result = spawnSync(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, stage], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr+result.stdout)
  }
  const contactReport = JSON.parse(readFileSync(join(directory, 'validate.json'), 'utf8'))
  assert.equal(contactReport.accepted, true, JSON.stringify(contactReport))
  const processed = JSON.parse(readFileSync(join(directory, 'process.json'), 'utf8'))
  assert(processed.contacts.every(c => c.end <= processed.duration))
  // Root motion remains independently validated even though GLB motion is in-place.
  processed.rootCurve[2].position[0] = 100
  writeFileSync(join(directory, 'process.json'), JSON.stringify(processed))
  const invalidRoot = spawnSync(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, 'validate'], { encoding: 'utf8' })
  assert.equal(invalidRoot.status, 0, invalidRoot.stderr)
  assert(JSON.parse(readFileSync(join(directory, 'validate.json'), 'utf8')).failures.includes('Root velocity exceeds supported controller limit'))
  console.log('Mannequin round-trip and invalid-contact rejection passed (synthetic fixture, no inference).')
} finally { rmSync(directory, { recursive: true, force: true }) }
