import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createCombatTemplate } from '../src/domain/game/v2/template.ts'
if (!process.env.npm_execpath)
  throw new Error('Run through npm run test:game-modules-live')
const phase = process.env.GAME_MODULE_PHASE ?? 'status',
  directory = 'output/game-module-live'
mkdirSync(directory, { recursive: true })
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`
const query = (sql) => {
  const temp = mkdtempSync(join(tmpdir(), 'game-module-live-'))
  try {
    const file = join(temp, 'query.sql')
    writeFileSync(file, sql)
    const r = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        'exec',
        '--',
        'supabase',
        'db',
        'query',
        '--linked',
        '--file',
        file,
      ],
      { encoding: 'utf8' },
    )
    if (r.status !== 0) throw new Error(r.stderr || r.stdout)
    return JSON.parse(r.stdout).rows
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
const path = `${directory}/fixture.json`
if (phase === 'create') {
  if (existsSync(path)) throw new Error('Fixture exists')
  const prior = JSON.parse(
    readFileSync('output/game-live/fixture.json', 'utf8'),
  )
  const owner = query(
    `select workspace_id from public.workspace_memberships where user_id=${quote(prior.actor)} and role='owner' limit 1`,
  )[0]
  if (!owner)
    throw new Error('Prior consenting owner no longer owns a workspace')
  const fixture = {
    actor: prior.actor,
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
  }
  query(
    `begin;insert into public.projects(id,workspace_id,slug,name,created_by,metadata)values(${quote(fixture.projectId)},${quote(owner.workspace_id)},${quote('game-modules-' + fixture.projectId)},'Gameplay modules acceptance',${quote(fixture.actor)},'{"gameModuleFixture":true}');insert into public.project_drafts(id,project_id,name,created_by)values(${quote(fixture.draftId)},${quote(fixture.projectId)},'Gameplay modules acceptance',${quote(fixture.actor)});commit;`,
  )
  writeFileSync(path, JSON.stringify(fixture, null, 2))
  const command = {
    projectId: fixture.projectId,
    draftId: fixture.draftId,
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    action: 'save',
    design: createCombatTemplate(),
  }
  console.log(
    query(
      `select public.game_commit_command(${quote(fixture.actor)},${quote(JSON.stringify(command))}::jsonb) result`,
    ),
  )
  process.exit(0)
}
const f = JSON.parse(readFileSync(path, 'utf8')),
  w = query(
    `select * from public.game_workspaces where draft_id=${quote(f.draftId)}`,
  )[0]
const command = (fields) =>
  query(
    `select public.game_commit_command(${quote(f.actor)},${quote(JSON.stringify({ projectId: f.projectId, draftId: f.draftId, expectedRevision: w.revision, idempotencyKey: crypto.randomUUID(), template: 'combat_traversal.v1', ...fields }))}::jsonb,'{}'::jsonb,0) result`,
  )
if (phase === 'build') console.log(command({ action: 'build' }))
else if (phase === 'refine') {
  writeFileSync(`${directory}/before.json`, JSON.stringify(w.design))
  console.log(
    command({
      action: 'generate',
      targetNodeIds: ['projectile.bolt'],
      prompt:
        'Only increase the slowing bolt projectile damage from 25 to 30. Preserve all other properties and all other nodes exactly.',
    }),
  )
} else if (phase === 'publish')
  console.log(command({ action: 'publish', buildId: w.active_build_id }))
else if (phase === 'cleanup') {
  query(
    `update public.projects set status='archived' where id=${quote(f.projectId)} and metadata->>'gameModuleFixture'='true'`,
  )
  console.log('Archived module acceptance fixture')
} else if (phase === 'status') {
  const jobs = query(
      `select id,kind,status,phase,error from public.game_jobs where draft_id=${quote(f.draftId)} order by created_at`,
    ),
    builds = query(
      `select id,status,reports from public.game_builds where draft_id=${quote(f.draftId)} order by created_at`,
    ),
    steps = query(
      `select job_id,node_id,status,attempt,diagnostic from public.game_job_steps where draft_id=${quote(f.draftId)} order by updated_at`,
    )
  const result = {
    revision: w.revision,
    activeBuildId: w.active_build_id,
    jobs,
    builds,
    steps,
  }
  writeFileSync(`${directory}/status.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (existsSync(`${directory}/before.json`)) {
    const before = JSON.parse(readFileSync(`${directory}/before.json`))
    console.log('Refinement:', {
      damage: w.design.nodes.find((n) => n.id === 'projectile.bolt').damage,
      otherNodesPreserved: before.nodes
        .filter((n) => n.id !== 'projectile.bolt')
        .every(
          (n) =>
            JSON.stringify(n) ===
            JSON.stringify(w.design.nodes.find((x) => x.id === n.id)),
        ),
    })
  }
} else throw new Error('Unknown phase')
