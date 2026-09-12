// Scoped service test on the existing marked game acceptance project. No GPU transport.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
import {blankGraph,freezeFlexible} from '../src/domain/game/animation-studio/flexible.ts'
import {studioTemplate} from '../src/domain/game/animation-studio/templates.ts'
import {studioRecipe} from '../src/domain/game/animation-studio/recipes.ts'
import {kimodoRelease} from '../src/domain/game/v3/animationTransport.ts'
import {createHash} from 'node:crypto'
const mode=process.argv[2]??'status',directory='output/animation-flexible-hosted'
if(!['plan','status'].includes(mode))throw Error('Use plan or status')
mkdirSync(directory,{recursive:true})
const prior=JSON.parse(readFileSync('output/game-fabric-kimodo/import.json','utf8')),fly='C:/Users/daruk/.fly/bin/fly.exe'
const list=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'});if(list.status!==0)throw Error('Could not locate game worker')
const machine=JSON.parse(list.stdout).find(m=>m.state==='started');if(!machine)throw Error('Game worker is not started')
const secret=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8'});if(secret.status!==0)throw Error('Worker credential unavailable')
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(secret.stdout).stdout.trim(),{auth:{persistSession:false}})
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
const project=unwrap(await admin.from('projects').select('metadata').eq('id',prior.projectId).single());if(!project.metadata?.gameUnifiedFixture)throw Error('Only the existing marked test project is allowed')
const path=`${directory}/fixture.json`
if(mode==='plan'){
 const envRead=spawnSync(fly,['machine','exec',machine.id,'printenv','-a','graphcore-game','--json'],{encoding:'utf8'});if(envRead.status!==0)throw Error('Cannot inspect planner admission')
 const env=Object.fromEntries(JSON.parse(envRead.stdout).stdout.split(/\r?\n/).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
 if(env.GAME_GENERATION_ENABLED!=='true'||!(env.GAME_GENERATION_USERS??'').split(',').map(s=>s.trim()).includes(prior.actor))throw Error('Test cannot verify planner admission from worker configuration; use an authenticated Edge session for hosted acceptance')
 const credits=Number(env.GAME_PLAN_CREDITS??25);if(!Number.isInteger(credits)||credits<0||credits>10000)throw Error('Invalid planner credit reservation')
 let f=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{workspaceId:crypto.randomUUID(),saveKey:crypto.randomUUID(),planKey:crypto.randomUUID()};writeFileSync(path,JSON.stringify(f,null,2))
 const graph=await freezeFlexible({...blankGraph(),name:'Flexible studio acceptance · wave and bow'}),common={projectId:prior.projectId,draftId:prior.draftId,workspaceId:f.workspaceId}
 const saved=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'save',expectedRevision:0,idempotencyKey:f.saveKey,graph},p_prepared:{graph}}))
 const queued=await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'plan',expectedRevision:saved.revision,idempotencyKey:f.planKey,prompt:'Create a standalone humanoid animation graph with relaxed idle, friendly wave, and bow. A greet event on G starts wave, then completion leads to bow, then back to idle. No game mechanics and no mandatory locomotion set.',nodeIds:[]},p_prepared:{credits}})
 if(queued.error){console.log(JSON.stringify({admitted:false,reason:queued.error.message,creditsRequired:credits,newGpuRequests:0}));process.exitCode=2}
 else{f={...f,...common,jobIds:queued.data.jobIds};writeFileSync(path,JSON.stringify(f,null,2));console.log(JSON.stringify({admitted:true,jobIds:f.jobIds,creditsReserved:credits,newGpuRequests:0}))}
}else{
 const f=JSON.parse(readFileSync(path,'utf8'));if(!f.jobIds){console.log('No planner job admitted');process.exit(0)}
 const jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error,checkpoint').in('id',f.jobIds)),workspace=unwrap(await admin.from('animation_studio_workspaces').select('revision,graph').eq('id',f.workspaceId).single())
 const result={jobs:jobs.map(j=>({id:j.id,status:j.status,phase:j.phase,error:j.error,summary:j.checkpoint.studioEdit?.summary})),revision:workspace.revision,nodes:workspace.graph.nodes.map(n=>({id:n.id,kind:n.kind})),newGpuRequests:0}
 writeFileSync(`${directory}/status.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}
