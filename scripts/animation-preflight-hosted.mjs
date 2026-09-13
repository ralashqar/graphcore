// Scoped service test on the existing marked game acceptance project. No GPU transport.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
import {blankGraph,clipNode,freezeFlexible} from '../src/domain/game/animation-studio/flexible.ts'
import {defaultLocomotion} from '../src/domain/game/animation-studio/locomotionProfile.ts'
import {flexibleRecipe} from '../src/domain/game/animation-studio/flexibleRecipes.ts'
import {studioTemplate} from '../src/domain/game/animation-studio/templates.ts'
import {studioRecipe} from '../src/domain/game/animation-studio/recipes.ts'
import {kimodoRelease} from '../src/domain/game/v3/animationTransport.ts'
import {createHash} from 'node:crypto'
const mode=process.argv[2]??'status',directory='output/animation-preflight-hosted'
if(!['import','status'].includes(mode))throw Error('Use import or status')
mkdirSync(directory,{recursive:true})
const prior=JSON.parse(readFileSync('output/game-fabric-kimodo/import.json','utf8')),fly='C:/Users/daruk/.fly/bin/fly.exe'
const list=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'});if(list.status!==0)throw Error('Could not locate game worker')
const machine=JSON.parse(list.stdout).find(m=>m.state==='started');if(!machine)throw Error('Game worker is not started')
const secret=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8'});if(secret.status!==0)throw Error('Worker credential unavailable')
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(secret.stdout).stdout.trim(),{auth:{persistSession:false}})
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
const project=unwrap(await admin.from('projects').select('metadata').eq('id',prior.projectId).single());if(!project.metadata?.gameUnifiedFixture)throw Error('Only the existing marked test project is allowed')
const path=`${directory}/fixture.json`
if(mode==='import'){
 let f
 if(existsSync(path))f=JSON.parse(readFileSync(path,'utf8'))
 else{f={workspaceId:crypto.randomUUID(),saveKey:crypto.randomUUID(),importKey:crypto.randomUUID()};writeFileSync(path,JSON.stringify(f,null,2),{flag:'wx'})}
 const draft=blankGraph();draft.nodes=[{...clipNode('walk','Saved walk processing fixture'),duration:4,loop:true,locomotion:defaultLocomotion()}];draft.entry='walk';const graph=await freezeFlexible(draft),common={projectId:prior.projectId,draftId:prior.draftId,workspaceId:f.workspaceId}
 graph.name='Preflight regression - saved-source import without inference receipt'
 const before=unwrap(await admin.from('game_animation_setup_spend').select('id')).length
 const saved=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'save',expectedRevision:0,idempotencyKey:f.saveKey,graph},p_prepared:{graph}}))
 const source=unwrap(await admin.from('game_animation_candidates').select('id,clip,source_path').eq('draft_id',prior.draftId).eq('clip->>state','walk').not('clip','is',null).order('created_at',{ascending:true}).limit(1).single())
 const request=await flexibleRecipe(graph,'walk')
 const result=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'import_source',nodeId:'walk',candidateId:source.id,expectedRevision:saved.revision,idempotencyKey:f.importKey},p_prepared:{requests:[{...request,import:{sourcePath:source.source_path,sourceHash:source.clip.sourceHash},provider:{reservationCents:0,modelRevision:kimodoRelease.model,processingVersion:'animation-1.1.0'}}]}}))
 const after=unwrap(await admin.from('game_animation_setup_spend').select('id')).length
 if(before!==after)throw Error('Source import changed inference reservations')
 writeFileSync(path,JSON.stringify({...f,...common,jobIds:result.jobIds,reservationsBefore:before},null,2));console.log(JSON.stringify({workspaceId:f.workspaceId,jobIds:result.jobIds,newInferenceReservations:0}))
}else{
 const f=JSON.parse(readFileSync(path,'utf8')),jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error,provider_started').in('id',f.jobIds)),candidates=unwrap(await admin.from('game_animation_candidates').select('id,clip,diagnostics').in('job_id',f.jobIds))
 for(const c of candidates)if(c.clip){const blob=unwrap(await admin.storage.from('project-assets').download(c.clip.storagePath)),bytes=new Uint8Array(await blob.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==c.clip.glbHash)throw Error('Hosted GLB hash mismatch');writeFileSync(`${directory}/${c.id}.glb`,bytes)}
 const count=unwrap(await admin.from('game_animation_setup_spend').select('id')).length;if(count!==f.reservationsBefore)throw Error('Inference ledger changed during test; inspect before claiming zero new reservations');if(jobs.some(j=>j.provider_started))throw Error('Import unexpectedly marked provider started');
 const result={newInferenceReservations:0,jobs,candidates:candidates.map(c=>({id:c.id,validated:!!c.clip,failures:c.diagnostics.failures})),review:'Pending creator acceptance'}
 writeFileSync(`${directory}/status.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}
