import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
if (!process.env.npm_execpath) throw new Error('Run through npm run test:game-db')
const directory = mkdtempSync(join(tmpdir(), 'graphcore-game-sql-'))
try {
  const paths = [...(process.argv.includes('--existing') ? [] : process.argv.includes('--recovery') ? ['supabase/migrations/20260908161608_game_job_recovery.sql'] : ['supabase/migrations/20260908153328_game_workspace.sql', 'supabase/migrations/20260908161608_game_job_recovery.sql']), 'supabase/tests/game_workspace.sql', 'supabase/tests/game_recovery.sql']
  if (process.argv.includes('--modules')) { paths.unshift('supabase/migrations/20260908174628_game_module_nodes.sql'); paths.push('supabase/tests/game_modules.sql') }
  if (process.argv.includes('--modules-existing')) paths.push('supabase/tests/game_modules.sql')
  if(process.argv.includes('--unified'))paths.unshift('supabase/migrations/20260908201203_unified_gameplay.sql')
  if(process.argv.includes('--unified')||process.argv.includes('--unified-existing'))paths.push('supabase/tests/game_unified.sql')
  const file = join(directory, 'verify.sql')
  writeFileSync(file, ['begin;', ...paths.map(p => readFileSync(p, 'utf8')), 'rollback;'].join('\n'))
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--', 'supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
