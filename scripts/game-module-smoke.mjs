import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createCombatTemplate } from '../src/domain/game/v2/template.ts'
import { interactionTemplate } from '../src/domain/game/interactions/template.ts'
import { compile } from '../src/domain/game/v2/compiler.ts'
const directory = 'output/game-module-smoke'
await mkdir(directory, { recursive: true })
const design = createCombatTemplate()
if(process.env.GAME_TEST_INTERACTIONS==='true')design.nodes.push(...interactionTemplate())
if (process.env.GAME_TEST_ARCHETYPE === 'melee') design.defaultActor = 'melee'
const manifest = await compile({
  id: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  draftId: crypto.randomUUID(),
  sourceRevision: 0,
  design,
})
await writeFile(
  `${directory}/candidate.json`,
  JSON.stringify({ manifest, assetUrls: {} }),
)
const result = spawnSync(
  process.execPath,
  ['scripts/game-browser-acceptance.mjs', directory],
  { stdio: 'inherit' },
)
process.exitCode = result.status ?? 1
