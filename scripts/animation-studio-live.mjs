// Explicit one-clip live acceptance under the user-approved additional allowance.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
import {blankGraph,clipNode,freezeFlexible} from '../src/domain/game/animation-studio/flexible.ts'
import {flexibleRecipe} from '../src/domain/game/animation-studio/flexibleRecipes.ts'
import {kimodoRelease} from '../src/domain/game/v3/animationTransport.ts'
import {createHash} from 'node:crypto'
const directory='output/animation-studio-live';mkdirSync(directory,{recursive:true});
const mode=process.argv[2]??'status',path=directory+'/fixture.json';
const prior=JSON.parse(readFileSync('output/game-fabric-kimodo/import.json','utf8')),fly='C:/Users/daruk/.fly/bin/fly.exe';
const list=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'});if(list.status!==0)throw Error('Worker unavailable');
const machine=JSON.parse(list.stdout).find(m=>m.state==='started');
const secret=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8'});if(secret.status!==0)throw Error('Credential unavailable');
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(secret.stdout).stdout.trim(),{auth:{persistSession:false}});
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data};
const project=unwrap(await admin.from('projects').select('metadata').eq('id',prior.projectId).single());if(!project.metadata?.gameUnifiedFixture)throw Error('Only marked fixture allowed');
if(mode==='plan'){
 if(existsSync(path))throw Error('Fixture exists; inspect instead of resubmitting');
 const draft=blankGraph();draft.nodes=[{...clipNode('idle','Relaxed idle'),description:'A humanoid stands relaxed with subtle breathing and gentle weight shifts, feet planted.',duration:4,loop:true}];draft.entry='idle';draft.name='Kimodo studio live acceptance';
 const graph=await freezeFlexible(draft),common={projectId:prior.projectId,draftId:prior.draftId,workspaceId:crypto.randomUUID()};
 writeFileSync(path,JSON.stringify({...common,status:'preparing'}),{flag:'wx'});
 const saved=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'save',expectedRevision:0,idempotencyKey:crypto.randomUUID(),graph},p_prepared:{graph}}));
 const result=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:{...common,action:'plan',reviewOnly:true,prompt:'Check generation readiness for this relaxed idle.',nodeIds:[],expectedRevision:saved.revision,idempotencyKey:crypto.randomUUID()},p_prepared:{credits:0}}));
 writeFileSync(path,JSON.stringify({...common,planJobs:result.jobIds}));console.log(JSON.stringify(result));
}else if(mode==='recover-unsubmitted'){
 const f=JSON.parse(readFileSync(path,'utf8'));
 const job=unwrap(await admin.from('game_jobs').select('id,status,error,provider_started,checkpoint').eq('id',f.jobIds?.[0]).single());
 if(job.status!=='failed'||job.error!=='RUNPOD_GRAPHCORE is not configured'||job.provider_started||job.checkpoint?.animationRequestId||job.checkpoint?.pendingProvider)throw Error('Not a proven unsubmitted credential failure');
 unwrap(await admin.rpc('game_animation_update_setup',{p_id:job.id,p_status:'released',p_actual_cents:0,p_evidence:{reason:'Missing server credential; verified failed before submission',jobId:job.id}}));
 const {jobIds,generationCommand,...rest}=f;writeFileSync(path,JSON.stringify({...rest,priorAttempts:[...(f.priorAttempts??[]),...jobIds]}));console.log('Released only the proven unsubmitted test reservation');
}else if(mode==='generate'){
 const f=JSON.parse(readFileSync(path,'utf8'));if(f.jobIds||f.generationCommand)throw Error('Already attempted; reconcile saved command before retrying');
 const jobs=unwrap(await admin.from('game_jobs').select('status,checkpoint').in('id',f.planJobs));
 const w=unwrap(await admin.from('animation_studio_workspaces').select('graph,revision').eq('id',f.workspaceId).single());
 const {currentPreflight,requireReady,PREFLIGHT_VERSION}=await import('../src/domain/game/animation-studio/preflight.ts');
 const {hashGameValue}=await import('../src/domain/game/compiler.ts');
 const report=await currentPreflight(w.graph,jobs.map(j=>j.checkpoint?.studioEdit?.preflight).filter(Boolean));requireReady(report,['idle']);
 const request=await flexibleRecipe(w.graph,'idle');
 const provider={run:'https://api.runpod.ai/v2/dr79dd76cb16de/run',status:'https://api.runpod.ai/v2/dr79dd76cb16de/status',cancel:'https://api.runpod.ai/v2/dr79dd76cb16de/cancel',reservationCents:200,pricingEvidence:'User-approved $10 additional; bounded one-clip acceptance',modelRevision:kimodoRelease.model,sourceRevision:kimodoRelease.source,processingVersion:'animation-1.1.0'};
 const command={projectId:f.projectId,draftId:f.draftId,workspaceId:f.workspaceId,action:'generate',expectedRevision:w.revision,idempotencyKey:crypto.randomUUID(),nodeIds:['idle'],maxReservationCents:200};
 writeFileSync(path,JSON.stringify({...f,generationCommand:command}));
 const result=unwrap(await admin.rpc('animation_studio_command',{p_actor:prior.actor,p_command:command,p_prepared:{requests:[{...request,provider,preflight:{version:PREFLIGHT_VERSION,recipeHash:await hashGameValue(request.recipe)}}]}}));
 writeFileSync(path,JSON.stringify({...f,jobIds:result.jobIds}));console.log(JSON.stringify(result));
}else{
 const f=JSON.parse(readFileSync(path,'utf8'));const jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error,checkpoint').in('id',f.jobIds??f.planJobs));
 console.log(JSON.stringify(jobs.map(j=>({id:j.id,status:j.status,phase:j.phase,error:j.error,preflight:j.checkpoint?.studioEdit?.preflight?.nodes}))));
 if(f.jobIds){const candidates=unwrap(await admin.from('game_animation_candidates').select('id,clip,diagnostics').in('job_id',f.jobIds));for(const c of candidates)if(c.clip){const blob=unwrap(await admin.storage.from('project-assets').download(c.clip.storagePath));const bytes=new Uint8Array(await blob.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==c.clip.glbHash)throw Error('GLB hash mismatch');writeFileSync(directory+'/'+c.id+'.glb',bytes)}console.log(JSON.stringify(candidates.map(c=>({id:c.id,validated:!!c.clip,metrics:c.diagnostics?.metrics,failures:c.diagnostics?.failures}))));}
}
