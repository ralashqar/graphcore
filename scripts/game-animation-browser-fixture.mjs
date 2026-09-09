// Assemble only validated local clips for isolated browser acceptance.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { humanoidMannequin } from '../src/domain/game/v3/mannequin.ts'
import { compile } from '../src/domain/game/v3/compiler.ts'
import { createUnified } from '../src/domain/game/v3/recipes.ts'
import { manifestSchema, ANIMATED_VERSION } from '../src/domain/game/v3/spec.ts'
const directory = 'output/game-animation-locomotion-browser'
mkdirSync(directory, { recursive: true })
const rig = await humanoidMannequin(), assets = [], assetUrls = {}
for (const state of ['idle', 'walk', 'run', 'backward', 'strafe_left', 'strafe_right']) {
  const source = state === 'idle' ? 'output/kimodo-benchmark-20260909-attempt2' : `output/kimodo-locomotion-20260909-attempt2/${state}`
  const read = file => JSON.parse(readFileSync(`${source}/${file}.json`, 'utf8'))
  const validation = read('validate'), processed = read('process'), recipe = read('recipe')
  if (!validation.accepted) throw new Error(`${state} has not passed motion validation`)
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const key = `animation.${state}`
  assets.push({ version: 1, id: randomUUID(), recipeKey: key, recipeHash: hash(JSON.stringify(recipe)), rigRevision: rig.revision, sourceHash: hash(readFileSync(`${source}/source.json`)), glbHash: hash(readFileSync(`${source}/output.glb`)), storagePath: `fixture/${state}.glb`, state, duration: processed.duration, fps: 30, loop: true, naturalSpeed: processed.naturalSpeed, rootMode: 'in_place', rootCurve: processed.rootCurve, contacts: processed.contacts ?? [], validation: { policy: validation.policy ?? 'animation-1.0.0', accepted: true, metrics: validation.metrics } })
  copyFileSync(`${source}/output.glb`, `${directory}/${state}.glb`)
  assetUrls[key] = `/staged/${state}.glb`
}
const design = createUnified('exploration')
// A clear test area around the player allows repeated real-keyboard loops.
const movement = design.nodes.find(n => n.kind === 'movement')
movement.speed = 1.5; movement.sprint = 4
const base = await compile(design, { id: randomUUID(), projectId: randomUUID(), draftId: randomUUID(), sourceRevision: 1 })
const graph = { version: 1, id: 'animation.player', actorDefinition: base.design.nodes.find(n => n.kind === 'actor_instance' && n.id === base.design.player).definition, rigRevision: rig.revision, bindings: assets.map(a => ({ state: a.state, clipRevision: a.id })), transitions: assets.flatMap(a => assets.filter(b => b.state !== a.state).map(b => ({ from: a.state, to: b.state, blendSeconds: .15, event: 'movement' }))) }
const manifest = manifestSchema.parse({ ...base, runtimeVersion: ANIMATED_VERSION, assets, animations: { version: 1, rigs: [rig], graphs: [graph] } })
writeFileSync(`${directory}/candidate.json`, JSON.stringify({ manifest, assetUrls }))
console.log(directory)
