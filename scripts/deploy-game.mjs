import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
const fly = process.platform === 'win32' ? join(homedir(), '.fly', 'bin', 'fly.exe') : 'fly'
const target = process.argv.includes('--preview') ? 'fly.game-preview.toml' : 'fly.game.toml'
if (process.argv.includes('--configure-worker')) {
  // Transfer only the existing GraphCore provider/database credentials directly between
  // these two owned Fly apps. Secret values never enter files, logs, or command arguments.
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'FAL_KEY']
  const machines = spawnSync(fly, ['machine', 'list', '-a', 'graphcore-world-generation', '--json'], { encoding: 'utf8' })
  if (machines.status !== 0) throw new Error('Could not locate the existing worker Machine')
  const machine = JSON.parse(machines.stdout).find(m => m.state === 'started')
  if (!machine) throw new Error('Existing GraphCore worker is not started')
  const read = spawnSync(fly, ['machine', 'exec', machine.id, `printenv ${names.join(' ')}`, '-a', 'graphcore-world-generation', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (read.status !== 0) throw new Error('Could not read allowlisted worker credentials through the authenticated Fly Machines API')
  const values = JSON.parse(read.stdout).stdout.trim().split(/\r?\n/)
  if (values.length !== names.length || !values[0].startsWith('https://') || values.some(value => !value || value.includes('\n'))) throw new Error('Worker credential transfer returned an unexpected shape')
  const input = names.map((name, i) => `${name}=${values[i]}`).join('\n')
  const imported = spawnSync(fly, ['secrets', 'import', '-a', 'graphcore-game', '--stage'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  if (imported.status !== 0) throw new Error('Could not stage the game worker credentials')
  console.log('Staged four allowlisted worker credentials; values were not logged.')
  process.exit(0)
}
const result = spawnSync(fly, ['deploy', '--config', target, '--remote-only', '--ha=false'], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
