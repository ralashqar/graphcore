import { actionRecipe, ACTION_CATALOG } from '../src/domain/game/v3/actionMechanics.ts'
// Hosted acceptance against the explicitly marked game fixture. No GPU calls.
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { mechanicProposalSchema } from '../src/domain/game/v3/mechanicCommands.ts'
import { mechanicRecipe } from '../src/domain/game/v3/mechanics.ts'
const mode=process.argv[2]??'status'
if(!['bootstrap','plan','accept','install-tested','install-actions','install-motion','build','status','publish'].includes(mode))throw Error('Unknown fixture operation')
const fixture=JSON.parse(readFileSync('output/game-unified-live-courier/fixture.json','utf8'))
const fly=process.platform==='win32'?join(homedir(),'.fly','bin','fly.exe'):'fly'
const machines=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'})
if(machines.status!==0)throw Error('Unable to locate game worker')
const machine=JSON.parse(machines.stdout).find(m=>m.state==='started')
if(!machine)throw Error('No started game worker')
const response=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
if(response.status!==0)throw Error('Unable to load authenticated worker credential')
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(response.stdout).stdout.trim(),{auth:{persistSession:false,autoRefreshToken:false}})
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
const project=unwrap(await admin.from('projects').select('metadata').eq('id',fixture.projectId).single())
if(project.metadata?.gameUnifiedFixture!==true)throw Error('Operations restricted to the marked acceptance fixture')
const w=unwrap(await admin.from('game_workspaces').select('*').eq('draft_id',fixture.draftId).single())
const dir='output/game-mechanics-hosted';mkdirSync(dir,{recursive:true})
const common={projectId:fixture.projectId,draftId:fixture.draftId,expectedRevision:w.revision,idempotencyKey:crypto.randomUUID()}
if(mode==='bootstrap'){
 const d=structuredClone(w.design),world=d.nodes.find(n=>n.kind==='world')
 if(world.boxes.some(b=>b.id==='mechanic.wall'))console.log('Fixture wall already exists')
 else{
  world.boxes.push({id:'mechanic.wall',position:{x:-10,y:3,z:0},size:{x:1,y:6,z:12},ramp:false})
  console.log(JSON.stringify(unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:{...common,template:'unified.v1',action:'save',design:d}}))))
 }
}else if(mode==='install-tested'){
 const d=structuredClone(w.design),actor=d.nodes.find(n=>n.id===d.player).definition
 d.mechanics={version:1,packages:['wall_run','wall_slide','wall_jump'].map(c=>mechanicRecipe(c,actor)),surfaces:[{id:'surface.mechanic.wall',collider:'mechanic.wall',face:'x-',capabilities:['wall_run','wall_slide','wall_jump']}]}
 console.log(JSON.stringify(unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:{...common,template:'unified.v1',action:'save',design:d}}))))
}else if(mode==='install-motion'){
 const d=structuredClone(w.design);if(!d.mechanics)throw Error('Install fixture mechanics first')
 d.mechanics.motionProfile='motion-1.0.0'
 if(JSON.stringify(d)===JSON.stringify(w.design))console.log('Motion profile already installed')
 else console.log(JSON.stringify(unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:{...common,template:'unified.v1',action:'save',design:d}}))))
}else if(mode==='install-actions'){
 const d=structuredClone(w.design),actor=d.nodes.find(n=>n.id===d.player).definition
 d.mechanics={...(d.mechanics??{version:1,packages:[],surfaces:[]}),actions:[actionRecipe('combo',actor),actionRecipe('dash',actor)]}
 if(JSON.stringify(d)===JSON.stringify(w.design))console.log('Tested action recipes already installed')
 else console.log(JSON.stringify(unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:{...common,template:'unified.v1',action:'save',design:d}}))))
}else if(mode==='plan'){
 const path=`${dir}/plan-command.json`
 let command=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{...common,action:'plan_mechanic',actorDefinition:w.design.nodes.find(n=>n.id===w.design.player).definition,prompt:'Add wall run, wall slide and wall jump using the supplied default recipes unchanged. The player runs along the selected wall while holding traversal and moving, slides when holding traversal without tangent movement, and can jump outward once while airborne. Use procedural contacts. Preserve all other systems.',surfaces:[{id:'surface.mechanic.wall',collider:'mechanic.wall',face:'x-',capabilities:['wall_run','wall_slide','wall_jump']}]}
 if(command.expectedRevision!==w.revision){
  const prior=unwrap(await admin.from('game_commands').select('result').eq('draft_id',fixture.draftId).eq('idempotency_key',command.idempotencyKey).maybeSingle())
  if(prior)throw Error('Original plan was admitted; reconcile its saved result before creating another')
  command={...command,expectedRevision:w.revision,idempotencyKey:crypto.randomUUID()}
  writeFileSync(path,JSON.stringify(command,null,2))
 }
 if(!existsSync(path))writeFileSync(path,JSON.stringify(command,null,2),{flag:'wx'})
 const result=unwrap(await admin.rpc('game_mechanic_command',{p_actor:fixture.actor,p_command:command,p_context:{mechanicCatalog:'mechanics-1.0.0',actionCatalog:ACTION_CATALOG,mechanicModel:'gpt-4.1'},p_reserve:25}))
 writeFileSync(`${dir}/plan-result.json`,JSON.stringify(result));console.log(JSON.stringify(result))
}else if(mode==='accept'){
 const result=JSON.parse(readFileSync(`${dir}/plan-result.json`,'utf8'))
 const job=unwrap(await admin.from('game_jobs').select('status,checkpoint').eq('id',result.jobId).single())
 if(job.status!=='completed')throw Error('Plan has not completed')
 const proposal=mechanicProposalSchema.parse(job.checkpoint.plan)
 if(proposal.unsupported.length||proposal.sourceRevision!==w.revision)throw Error('Proposal has gaps or is stale')
 console.log(JSON.stringify(unwrap(await admin.rpc('game_mechanic_command',{p_actor:fixture.actor,p_command:{...common,action:'materialize_mechanic',planJobId:result.jobId}}))))
}else if(mode==='build'||mode==='publish'){
 const result=unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:{...common,template:'unified.v1',action:mode,...(mode==='publish'?{buildId:w.active_build_id}:{})}}))
 writeFileSync(`${dir}/${mode}-result.json`,JSON.stringify(result));console.log(JSON.stringify(result))
}else{
 const jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error,checkpoint').eq('draft_id',fixture.draftId).order('created_at',{ascending:false}).limit(4))
 const builds=unwrap(await admin.from('game_builds').select('id,status,reports').eq('draft_id',fixture.draftId).order('created_at',{ascending:false}).limit(2))
 const credit=unwrap(await admin.from('user_credits').select('balance').eq('user_id',fixture.actor).maybeSingle())
 console.log(JSON.stringify({designCreditBalance:credit?.balance??null,revision:w.revision,activeBuild:w.active_build_id,publishedBuild:w.published_build_id,jobs:jobs.map(j=>({id:j.id,status:j.status,phase:j.phase,error:j.error,plan:j.checkpoint?.plan})),builds},null,2))
}
