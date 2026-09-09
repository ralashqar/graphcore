// Reprocess saved motion without making any provider requests.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Provide a saved motion directory')
const directories = existsSync(join(root, 'source.json')) ? [root] : readdirSync(root, { withFileTypes: true }).filter(f => f.isDirectory() && existsSync(join(root, f.name, 'source.json'))).map(f => join(root, f.name))
const blender = process.env.GAME_BLENDER_BINARY ?? (process.platform === 'win32' ? 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' : 'blender')
for (const directory of directories) {
  for (const stage of ['retarget', 'process', 'export', 'validate']) {
    const result = spawnSync(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, stage], { encoding: 'utf8', timeout: 120000 })
    if (result.status !== 0) throw new Error(`${stage}: ${result.stderr}\n${result.stdout}`)
  }
  console.log(JSON.stringify({ directory, ...JSON.parse(readFileSync(join(directory, 'validate.json'), 'utf8')) }))
}
