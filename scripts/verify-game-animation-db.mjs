import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const directory = mkdtempSync(join(tmpdir(), 'graphcore-animation-sql-'))
try {
  const migrations = ['supabase/migrations/20260909051220_game_animation_pipeline.sql', 'supabase/migrations/20260909052407_game_animation_jobs.sql']
  const paths = [...(process.argv.includes('--existing') ? [] : process.argv.includes('--budget-existing') ? migrations.slice(1) : migrations), 'supabase/tests/game_animation.sql']
  const file = join(directory, 'verify.sql')
  writeFileSync(file, ['begin;', "set local graphcore.animation_test_transaction = 'on';", ...paths.map(p => readFileSync(p, 'utf8')), 'rollback;'].join('\n'))
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(executable, ['supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
