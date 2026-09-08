import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createAdventureTemplate } from '../src/domain/game/template.ts'
import { compileGame } from '../src/domain/game/compiler.ts'
const directory = 'output/game-smoke'
await mkdir(directory, { recursive: true })
const manifest = await compileGame({ id: crypto.randomUUID(), projectId: crypto.randomUUID(), draftId: crypto.randomUUID(), sourceRevision: 1, design: createAdventureTemplate() })
await writeFile(`${directory}/candidate.json`, JSON.stringify({ manifest, assetUrls: {} }))
const result = spawnSync(process.execPath, ['scripts/game-browser-acceptance.mjs', directory], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
