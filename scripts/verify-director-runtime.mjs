import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

if (!process.env.npm_execpath) throw new Error('Run through npm run test:director-db')
const temporary = mkdtempSync(join(tmpdir(), 'director-sql-test-'))
const file = join(temporary, 'verify.sql')
try {
  const paths = [
    ...(!process.argv.includes('--existing') ? ['supabase/migrations/20260906202603_director_isolated_runtime.sql'] : []),
    'supabase/tests/director_workspace.sql',
    'supabase/tests/director_runtime.sql',
  ]
  writeFileSync(file, ['begin;', ...paths.map(path => readFileSync(path, 'utf8')), 'rollback;'].join('\n'))
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--', 'supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  unlinkSync(file)
  rmdirSync(temporary)
}
