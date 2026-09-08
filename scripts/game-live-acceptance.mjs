import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
if (!process.env.npm_execpath) throw new Error('Run through npm run test:game-live with GAME_LIVE_PHASE')
const phase = process.env.GAME_LIVE_PHASE ?? 'status', directory = 'output/game-live'
mkdirSync(directory, { recursive: true })
const fixtureFile = `${directory}/fixture.json`, quote = value => `'${String(value).replaceAll("'", "''")}'`
const query = sql => {
  const temporary = mkdtempSync(join(tmpdir(), 'graphcore-game-live-'))
  try {
    const file = join(temporary, 'query.sql'); writeFileSync(file, sql)
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--', 'supabase', 'db', 'query', '--linked', '--file', file], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stdout || result.stderr)
    return JSON.parse(result.stdout).rows
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}
if (phase === 'create') {
  if (existsSync(fixtureFile)) throw new Error('Fixture already exists; inspect or clean it before creating another')
  if (!process.env.GAME_TEST_OWNER_EMAIL) throw new Error('GAME_TEST_OWNER_EMAIL must identify the consenting workspace owner')
  const owners = query(`select u.id actor,m.workspace_id from auth.users u join public.workspace_memberships m on m.user_id=u.id and m.role='owner' where lower(u.email)=lower(${quote(process.env.GAME_TEST_OWNER_EMAIL)}) limit 1`)
  if (!owners.length) throw new Error('No owned workspace matches the supplied account')
  const fixture = { actor: owners[0].actor, projectId: crypto.randomUUID(), draftId: crypto.randomUUID() }
  query(`begin; insert into public.projects(id,workspace_id,slug,name,created_by,metadata) values(${quote(fixture.projectId)},${quote(owners[0].workspace_id)},${quote('game-acceptance-' + fixture.projectId)},'Game acceptance fixture',${quote(fixture.actor)},'{"gameAcceptanceFixture":true}'); insert into public.project_drafts(id,project_id,name,created_by) values(${quote(fixture.draftId)},${quote(fixture.projectId)},'Game acceptance fixture',${quote(fixture.actor)}); commit;`)
  writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2)); console.log(fixture); process.exit(0)
}
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'))
const workspace = query(`select revision,active_build_id,design from public.game_workspaces where draft_id=${quote(fixture.draftId)}`)[0]
const command = fields => {
  const value = { projectId: fixture.projectId, draftId: fixture.draftId, expectedRevision: workspace?.revision ?? 0, idempotencyKey: crypto.randomUUID(), ...fields }
  const context = { wiki: { title: 'The desert observatory', artStyleDescription: 'Simple warm sandstone and brass, clean stylized geometry' }, entities: [{ key: 'keeper', name: 'Observatory keeper', type: 'actor', summary: 'Protects the courtyard key and guides explorers.' }] }
  if (value.action === 'retry') return query(`select public.game_retry_asset_command(${quote(fixture.actor)},${quote(JSON.stringify(value))}::jsonb) result`)
  return query(`select public.game_commit_command(${quote(fixture.actor)},${quote(JSON.stringify(value))}::jsonb,${quote(JSON.stringify(context))}::jsonb,0) result`)
}
if (phase === 'generate') console.log(command({ action: 'generate', prompt: 'Create a compact desert observatory adventure. Speak to the keeper, find a brass key in the courtyard, unlock the gate and reach the observatory marker. Use the standard animated player rig and one static key mesh. Keep default movement values and a simple walkable level.' }))
else if (phase === 'refine') {
  writeFileSync(`${directory}/before-refine.json`, JSON.stringify(workspace.design))
  console.log(command({ action: 'generate', prompt: 'Only increase sprint stamina consumption to 25. Preserve the level, art, inventory, dialogue and all asset recipes exactly.' }))
} else if (phase === 'assets' || phase === 'image-asset') {
  if (phase === 'image-asset') {
    const interrupted = query(`select id from public.game_jobs where draft_id=${quote(fixture.draftId)} and kind='asset' and status='attention'`)
    for (const job of interrupted) console.log(command({ action: 'cancel', jobId: job.id }))
  }
  for (const recipe of workspace.design.assets.filter(a => phase === 'assets' || a.method === 'image_to_3d')) console.log(command({ action: 'asset', recipeKey: recipe.key }))
} else if (phase === 'resume-assets') {
  const jobs = query(`select id from public.game_jobs where draft_id=${quote(fixture.draftId)} and kind='asset' and status='failed' and checkpoint->>'requestId' is not null`)
  for (const job of jobs) console.log(command({ action: 'retry', jobId: job.id }))
} else if (phase === 'build') console.log(command({ action: 'build' }))
else if (phase === 'publish') console.log(command({ action: 'publish', buildId: workspace.active_build_id }))
else if (phase === 'status') {
  const jobs = query(`select id,kind,status,phase,error,checkpoint->'scope' scope from public.game_jobs where draft_id=${quote(fixture.draftId)} order by created_at`)
  const builds = query(`select id,status,reports from public.game_builds where draft_id=${quote(fixture.draftId)} order by created_at`)
  console.log(JSON.stringify({ revision: workspace?.revision ?? 0, activeBuildId: workspace?.active_build_id, jobs, builds }, null, 2))
  writeFileSync(`${directory}/status.json`, JSON.stringify({ revision: workspace?.revision, jobs, builds }, null, 2))
  if (existsSync(`${directory}/before-refine.json`) && workspace?.design) {
    const before = JSON.parse(readFileSync(`${directory}/before-refine.json`, 'utf8')), after = workspace.design
    console.log('Scoped refinement:', { staminaDrain: after.movement.staminaDrain, levelPreserved: JSON.stringify(before.level) === JSON.stringify(after.level), assetsPreserved: JSON.stringify(before.assets) === JSON.stringify(after.assets) })
  }
} else if (phase === 'cleanup') {
  // Retain immutable usage/job evidence; remove the fixture from normal project lists.
  query(`update public.projects set status='archived' where id=${quote(fixture.projectId)} and metadata->>'gameAcceptanceFixture'='true'`)
  console.log('Archived acceptance fixture; build/job evidence retained.')
} else throw new Error('Unknown live acceptance phase')
