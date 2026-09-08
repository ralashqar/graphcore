import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createAdventureTemplate } from '../src/domain/game/template.ts'
import { compileGame, gameNodeHashes } from '../src/domain/game/compiler.ts'
const directory = 'output/game-asset-smoke'
await mkdir(directory, { recursive: true })
const design = createAdventureTemplate(), hashes = await gameNodeHashes(design), assets = [], assetUrls = {}
const run = (binary, args) => { const result = spawnSync(binary, args, { stdio: 'inherit', timeout: 180000 }); if (result.error) throw result.error; if (result.status !== 0) throw new Error(`${binary} failed`) }
for (const recipe of design.assets) {
  const staging = `${directory}/${recipe.key}`
  await mkdir(staging, { recursive: true })
  await writeFile(`${staging}/recipe.json`, JSON.stringify({ ...recipe, color: design.style.accent }))
  run(process.env.GAME_BLENDER_BINARY ?? 'blender', ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', recipe.method === 'approved_rig' ? 'workers/game/template_rig.py' : 'workers/game/prepare_asset.py', '--', staging])
  run(process.execPath, ['scripts/game-validate-glb.mjs', `${staging}/output.glb`, `${staging}/validation.json`])
  const data = await readFile(`${staging}/output.glb`), metrics = JSON.parse(await readFile(`${staging}/metrics.json`, 'utf8')), revisionId = crypto.randomUUID()
  await copyFile(`${staging}/output.glb`, `${directory}/${revisionId}.glb`)
  assets.push({ recipeKey: recipe.key, revisionId, sourceHash: hashes[`asset.${recipe.key}`], storagePath: `${revisionId}.glb`, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length, triangles: metrics.triangles, dimensions: metrics.dimensions, reports: ['Local Blender fixture; no hosted provider used'] })
  assetUrls[recipe.key] = `/staged/${revisionId}.glb`
}
const manifest = await compileGame({ id: crypto.randomUUID(), projectId: crypto.randomUUID(), draftId: crypto.randomUUID(), sourceRevision: 1, design, assets })
await writeFile(`${directory}/candidate.json`, JSON.stringify({ manifest, assetUrls }))
run(process.execPath, ['scripts/game-browser-acceptance.mjs', directory])
