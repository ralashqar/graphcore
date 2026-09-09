import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
if (!process.env.npm_execpath) throw new Error('Run through npm run game:migrate')
const animationJobs=process.argv.includes('--animation-jobs'), animationReview=process.argv.includes('--animation-review')
const unified=process.argv.includes('--unified'), modules = process.argv.includes('--modules'), recovery = process.argv.includes('--recovery'), version = animationReview?'20260909070941':animationJobs?'20260909052407':unified?'20260908201203':modules ? '20260908174628' : recovery ? '20260908161608' : '20260908153328', name = animationReview?'game_animation_review_import':animationJobs?'game_animation_jobs':unified?'unified_gameplay':modules ? 'game_module_nodes' : recovery ? 'game_job_recovery' : 'game_workspace'
const selectedVersion=process.argv.includes('--mechanics')?'20260909140823':process.argv.includes('--animation-permissions')?'20260909072525':version
const selectedName=process.argv.includes('--mechanics')?'game_mechanic_composition':process.argv.includes('--animation-permissions')?'game_animation_service_permissions':name
const migration = readFileSync(`supabase/migrations/${selectedVersion}_${selectedName}.sql`, 'utf8')
const directory = mkdtempSync(join(tmpdir(), 'graphcore-game-migrate-'))
try {
  const file = join(directory, 'migration.sql')
  const statementLiteral = migration.replaceAll("'", "''")
  writeFileSync(file, `begin;\n${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${selectedVersion}','${selectedName}',array['${statementLiteral}']);\ncommit;`)
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--', 'supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
