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
if (!process.env.npm_execpath)
  throw new Error('Run through npm run test:game-unified-live')
const phase = process.env.GAME_UNIFIED_PHASE ?? 'status',
  preset = process.env.GAME_UNIFIED_PRESET ?? 'courier'
if (!['courier', 'observatory'].includes(preset))
  throw new Error('Unknown fixture preset')
const directory = `output/game-unified-live-${preset}`
mkdirSync(directory, { recursive: true })
const path = `${directory}/fixture.json`
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`
const query = (sql) => {
  const dir = mkdtempSync(join(tmpdir(), 'game-unified-'))
  try {
    const file = join(dir, 'query.sql')
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
    rmSync(dir, { recursive: true, force: true })
  }
}
if (phase === 'create') {
  if (existsSync(path)) throw new Error('Fixture already exists')
  const prior = JSON.parse(
      readFileSync('output/game-live/fixture.json', 'utf8'),
    ),
    actor = prior.actor
  const owner = query(
    `select workspace_id from public.workspace_memberships where user_id=${quote(actor)} and role='owner' limit 1`,
  )[0]
  if (!owner)
    throw new Error('Prior consenting owner no longer owns a workspace')
  const f = {
    actor,
    projectId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
  }
  query(
    `begin;insert into public.projects(id,workspace_id,slug,name,created_by,metadata)values(${quote(f.projectId)},${quote(owner.workspace_id)},${quote('unified-' + f.projectId)},${quote('Unified ' + preset + ' acceptance')},${quote(actor)},'{"gameUnifiedFixture":true}');insert into public.project_drafts(id,project_id,name,created_by)values(${quote(f.draftId)},${quote(f.projectId)},'Unified gameplay acceptance',${quote(actor)});commit;`,
  )
  writeFileSync(path, JSON.stringify(f, null, 2))
  console.log('Created marked fixture')
  process.exit(0)
}
const f = JSON.parse(readFileSync(path, 'utf8')),
  w = query(
    `select * from public.game_workspaces where draft_id=${quote(f.draftId)}`,
  )[0]
const command = (fields) =>
  query(
    `select public.game_commit_command(${quote(f.actor)},${quote(JSON.stringify({ projectId: f.projectId, draftId: f.draftId, expectedRevision: w?.revision ?? 0, idempotencyKey: crypto.randomUUID(), template: 'unified.v1', ...fields }))}::jsonb,'{}'::jsonb,0) result`,
  )
if (phase === 'plan')
  console.log(
    command({
      action: 'plan',
      prompt:
        preset === 'courier'
          ? 'Create a courier adventure using the tested courier preset: talk to the keeper, collect the parcel, mount the horse, ride to the outpost, dismount, defeat the guard, obtain a key, unlock the door and deliver. Use the preset geometry and defaults. No additional recipes or edits are necessary. Title it The Outpost Courier.'
          : 'Create an observatory recovery adventure using the tested observatory preset: talk to the researcher, collect supplies, defeat the guard, collect the key, open the observatory door and deliver supplies. No riding. Preserve the preset layout and defaults. No extra recipes or node edits are necessary. Title it Observatory Recovery.',
    }),
  )
else if (phase === 'materialize') {
  const plan = query(
    `select id from public.game_jobs where draft_id=${quote(f.draftId)} and status='completed' and input->>'commandAction'='plan' order by created_at desc limit 1`,
  )[0]
  if (!plan) throw new Error('Completed plan missing')
  console.log(command({ action: 'materialize', planJobId: plan.id }))
} else if (phase === 'build') console.log(command({ action: 'build' }))
else if (phase === 'publish') {
  if (!w?.active_build_id) throw new Error('Accepted build missing')
  console.log(command({ action: 'publish', buildId: w.active_build_id }))
  writeFileSync(
    `${directory}/published.json`,
    JSON.stringify({
      buildId: w.active_build_id,
      url: `https://graphcore-game-preview.fly.dev/?release=${w.active_build_id}`,
    }),
  )
} else if (phase === 'refine')
  console.log(
    command({
      action: 'generate',
      prompt:
        'Increase only movement sprint speed from 5.5 to 6. Preserve every other field exactly.',
      targetNodeIds: ['movement'],
    }),
  )
else if (phase === 'cleanup') {
  query(
    `update public.projects set status='archived' where id=${quote(f.projectId)} and metadata->>'gameUnifiedFixture'='true'`,
  )
  console.log('Archived fixture')
} else {
  const jobs = query(
    `select id,status,phase,error,input->>'commandAction' as action,checkpoint from public.game_jobs where draft_id=${quote(f.draftId)} order by created_at desc`,
  )
  writeFileSync(
    `${directory}/status.json`,
    JSON.stringify({ workspace: w, jobs }, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        revision: w?.revision,
        activeBuild: w?.active_build_id,
        jobs: jobs.map(({ checkpoint, ...j }) => j),
      },
      null,
      2,
    ),
  )
}
