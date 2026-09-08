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
import { isDeepStrictEqual } from 'node:util'
import { createCombatTemplate } from '../src/domain/game/v2/template.ts'
if (!process.env.npm_execpath)
  throw new Error('Run through npm run test:game-interactions-live')
const phase = process.env.GAME_MODULE_PHASE ?? 'status',
  directory = 'output/game-interactions-live'
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
    `begin;insert into public.projects(id,workspace_id,slug,name,created_by,metadata)values(${quote(fixture.projectId)},${quote(owner.workspace_id)},${quote('game-interactions-' + fixture.projectId)},'Gameplay interactions acceptance',${quote(fixture.actor)},'{"gameInteractionFixture":true}');insert into public.project_drafts(id,project_id,name,created_by)values(${quote(fixture.draftId)},${quote(fixture.projectId)},'Gameplay interactions acceptance',${quote(fixture.actor)});commit;`,
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
if (phase === 'extend') console.log(command({action:'generate',prompt:'Add the offered interaction_playground recipe with chair sitting, quadruped horse mounting and riding, vehicle seating and driving, and hinged door opening. Use its tested defaults. Preserve all existing combat, movement and world nodes. No further node refinements are needed.'}))
else if (phase === 'build') console.log(command({ action: 'build' }))
else if (phase === 'refine') {
  writeFileSync(`${directory}/before.json`, JSON.stringify(w.design))
  console.log(
    command({
      action: 'generate',
      targetNodeIds: ['motor.horse'],
      prompt:
        'Only increase the horse locomotor maxSpeed from 3 to 3.5. Preserve all other properties and nodes exactly.',
    }),
  )
} else if (phase === 'publish')
  console.log(command({ action: 'publish', buildId: w.active_build_id }))
else if (phase === 'cleanup') {
  query(
    `update public.projects set status='archived' where id=${quote(f.projectId)} and metadata->>'gameInteractionFixture'='true'`,
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
    nodeCount:w.design.nodes.length,
    originalNodesPreserved:createCombatTemplate().nodes.every(n=>isDeepStrictEqual(n,w.design.nodes.find(x=>x.id===n.id))),
    design:w.design,
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
      maxSpeed: w.design.nodes.find((n) => n.id === 'motor.horse').maxSpeed,
      otherNodesPreserved: before.nodes
        .filter((n) => n.id !== 'motor.horse')
        .every(
          (n) =>
            JSON.stringify(n) ===
            JSON.stringify(w.design.nodes.find((x) => x.id === n.id)),
        ),
    })
  }
} else throw new Error('Unknown phase')
