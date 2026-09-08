import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
if (!process.env.npm_execpath) throw new Error('Run through npm run game:migrate')
const unified=process.argv.includes('--unified'), modules = process.argv.includes('--modules'), recovery = process.argv.includes('--recovery'), version = unified?'20260908201203':modules ? '20260908174628' : recovery ? '20260908161608' : '20260908153328', name = unified?'unified_gameplay':modules ? 'game_module_nodes' : recovery ? 'game_job_recovery' : 'game_workspace'
const migration = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8')
const directory = mkdtempSync(join(tmpdir(), 'graphcore-game-migrate-'))
try {
  const file = join(directory, 'migration.sql')
  const statementLiteral = migration.replaceAll("'", "''")
  writeFileSync(file, `begin;\n${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array['${statementLiteral}']);\ncommit;`)
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--', 'supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
