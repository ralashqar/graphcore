import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createUnified } from '../src/domain/game/v3/recipes.ts'
import { compile } from '../src/domain/game/v3/compiler.ts'
for (const preset of ['courier', 'observatory']) {
  const directory = `output/game-unified-${preset}`
  await mkdir(directory, { recursive: true })
  const manifest = await compile(createUnified(preset), {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
    sourceRevision: 1,
  })
  await writeFile(
    `${directory}/candidate.json`,
    JSON.stringify({ manifest, assetUrls: {} }),
  )
  const result = await new Promise((resolve) => {
    const p = spawn(
      process.execPath,
      ['scripts/game-browser-acceptance.mjs', directory],
      { stdio: 'inherit' },
    )
    p.on('exit', resolve)
  })
  if (result !== 0) throw new Error(`${preset} browser acceptance failed`)
  console.log(`${preset}: keyboard acceptance passed`)
}
